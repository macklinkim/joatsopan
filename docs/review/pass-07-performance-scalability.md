# Pass 07 — 성능 & 확장성 점검

대상: `jotsopan` (Next.js 15 App Router, React 19). 데이터 계층은 전부 `lib/data.ts` 인메모리.
점검 일자: 2026-06-20.

## 점검 범위

- 모듈 로드 시 인메모리 데이터 빌드 비용 (`lib/data.ts`)
  - `COMPANIES` 508개 생성 (`SEEDS` 8 + `genSeeds(500)`, L325-326)
  - `STATS_BY_ID` 508 × 14개월 시계열 생성 (L334-380)
- 조회 함수의 매 호출 전체 스캔/복제 비용
  - `searchCompanies` / `nearbyCompanies` / `topRiskCompanies` / `closedCompanies` / `awards` / `gamePool`
- 차트 클라이언트 컴포넌트 번들 / First Load JS (`LineChart`, `HireLeaveChart`, `useChartWidth`)
- 렌더링 전략: `generateStaticParams`가 히어로 8개만 SSG (`app/company/[id]/page.tsx` L14-16)
- 캐싱 / 메모이즈 / `revalidate` 부재
- DB(Supabase) 전환 시 인덱스/쿼리로 풀어야 할 항목

근거는 실제 코드 Read 기준. 측정 도구(번들 분석기, 콜드스타트 프로파일)는 실행하지 않았으므로 수치는 코드 기반 추정임을 명시한다.

## 발견 (심각도 / 근거)

### F-1. [중간 → DB 전환 시 높음] 모듈 로드 = 508개 + 7,112행 시계열 즉시 빌드
- 근거: `lib/data.ts` L326에서 `[...SEEDS, ...genSeeds(500)].map(buildCompany)`가 모듈 평가 시점(import 시)에 실행된다. 이어 L334-380의 `for (const c of COMPANIES)` 루프가 508 × 14 = 7,112개 `MonthlyStat` 객체를 빌드해 `STATS_BY_ID`(Map)에 적재한다. 각 월마다 `mulberry32` PRNG 호출 + `calcTurnover` 계산이 들어간다.
- 현재(508개) 영향: 빌드 자체는 수 ms 수준으로 무시 가능. 문제는 규모가 아니라 "구조"다.
- 실데이터(수십만 사업장)로 갈 때의 문제:
  - 시계열을 같은 방식으로 메모리에 들고 가면 30만 × 14 = 420만 행. 객체당 7필드 기준 수백 MB → 서버리스 함수 메모리 한도(보통 128~1024MB) 초과.
  - 이 빌드가 **모듈 top-level**에 있으므로, 콜드스타트 시 첫 요청 latency에 전부 포함된다. import 되는 순간 508개를 만들고 7천 행을 돌리고 끝나야 첫 핸들러가 실행된다.
  - 서버리스 인스턴스마다 독립 메모리 → 인스턴스 N개면 N배 중복 빌드. 공유 캐시 없음.

### F-2. [중간] 모든 코너 조회가 매 호출 전체 스캔 + 배열 복제 + 정렬 O(n log n)
- 근거:
  - `searchCompanies` (L387-393): `COMPANIES.filter(...).sort(...).slice` — 매 검색마다 508개 풀스캔 + 매치분 정렬.
  - `nearbyCompanies` (L404-423): 최대 4개 tier 각각 `COMPANIES.filter(...)`로 풀스캔, 채택된 tier에서 `slice().sort()`. 즉 한 호출에 최대 4회 풀스캔.
  - `topRiskCompanies` (L427-431), `closedCompanies` (L434-436): `filter` 후 508개급 `sort`.
  - `awards` (L446-462): `filter` 2회 + `top()` 헬퍼가 부문마다 `[...arr].sort(cmp)[0]`을 호출. 즉 5개 부문 = 정렬 5회(매번 전체 복제). 최댓값/최솟값을 구하는 데 정렬을 쓰는 건 O(n log n)인데 단일 패스 O(n)으로 충분하다.
  - `gamePool` (L465-473): `filter().slice()` 후 Fisher-Yates 셔플.
- 현재(508개) 영향: 1회 호출이 수만 연산 수준, 체감 무영향.
- 실데이터 영향: 호출당 O(n) 풀스캔 × (검색 자동완성은 디바운스되지만 호출 빈도 높음). `nearbyCompanies`는 호출당 4 풀스캔이라 가장 비싸다. 30만 건이면 페이지 1회 렌더에 100만+ 비교. 더 큰 문제는 **이 로직이 그대로면 DB로 못 넘어간다** — 전부 인메모리 배열 메서드 기반이라 쿼리로 직접 번역되지 않는다(아래 F-7).

### F-3. [중간] `awards`의 정렬-기반 최댓값 추출은 불필요한 비용
- 근거: L449 `const top = (arr, cmp) => [...arr].sort(cmp)[0];`. `turn/low/risk/safe/big2` 5개 모두 이 헬퍼로 구함(L450-454). 각 호출이 배열 전체 복제 + 정렬 후 [0]만 사용.
- 영향: 결과는 정확하나, 단순 `reduce`로 최댓값 1패스면 될 것을 정렬로 푼다. 508개에선 무시 가능, 수십만 건이면 5 × O(n log n)을 5 × O(n)으로 낮출 수 있다.

### F-4. [낮음 → 정보성] 차트 3종이 클라이언트 컴포넌트라 회사 상세 First Load JS에 포함
- 근거: `LineChart.tsx`, `HireLeaveChart.tsx`, `useChartWidth.ts` 모두 `"use client"`. 회사 상세 페이지(`app/company/[id]/page.tsx`)는 서버 컴포넌트지만 차트 2종(LineChart ×2, HireLeaveChart ×1)을 자식으로 렌더하므로 이들 JS가 클라이언트 번들로 전송된다.
- 완화 요인: 차트는 순수 SVG + 인라인 계산이고 외부 차트 라이브러리(recharts/chart.js 등) 의존이 없다(`package.json` 의존성은 next/react/react-dom 뿐, L11-15). 따라서 번들 증가분은 컴포넌트 코드 자체(수 KB)에 그친다. **차트 라이브러리 미사용은 번들 관점에서 잘한 선택.**
- 영향: 현재는 양호. 다만 차트가 hover 툴팁(`useState`) 때문에 클라이언트일 뿐, 정적 렌더 부분과 인터랙션 부분이 한 컴포넌트에 묶여 있어 전체가 클라이언트로 넘어간다. 인터랙션이 필요 없는 정적 SVG라면 서버에서 그릴 수도 있다(개선안 참고).

### F-5. [중간] 회사 상세 8개만 SSG, 나머지 500개는 매 요청 동적 렌더 — 캐싱 부재가 진짜 문제
- 근거: `generateStaticParams`가 `HERO_IDS`(8개)만 반환(L14-16). `next.config.mjs`는 빈 설정(`{}`). 페이지/라우트 어디에도 `export const revalidate`, `dynamic`, `fetchCache` 지정 없음. API 라우트(`app/api/search`, `app/api/nearby`)도 캐시 헤더 없음.
- 평가:
  - 508개 전부 SSG 하지 않은 것 자체는 **합리적**이다. 실데이터로 가면 수십만 페이지를 빌드 타임에 다 만들 수 없고, 8개 히어로만 미리 만들고 나머지는 on-demand 렌더 후 캐시하는 패턴(ISR)이 정석이다.
  - 문제는 **on-demand 렌더 결과를 캐시하는 장치가 없다**는 것. `revalidate`가 없으니 인메모리 데이터 기준으론 동적 함수가 매번 다시 실행될 여지가 있고(특히 데이터가 DB로 바뀌면 매 요청 쿼리), `generateStaticParams`에 없는 id는 ISR 캐시 적립이 보장되지 않는다.
  - 데이터가 결정적(시드 PRNG)이고 자주 안 바뀌므로 ISR/`revalidate`와 궁합이 매우 좋은데 활용하지 않고 있다.

### F-6. [낮음] `useChartWidth`의 ResizeObserver / 리렌더
- 근거: `useChartWidth.ts` L16-19. `measure = () => setW(...)`를 ResizeObserver 콜백으로 등록. 폭이 바뀔 때마다 `setW` → 차트 컴포넌트 전체 리렌더. `Math.max(260, round(clientWidth))`로 정수 px에 스냅하므로 1px 변동마다 매번 setState 되진 않는다(같은 값이면 React가 리렌더 스킵).
- 영향: 회사 상세에 차트 3개 = ResizeObserver 3개. 일반적 사용에선 문제 없음. 다만 (a) `measure()`가 초기 1회 + observe 시 1회로 이중 호출될 수 있고(대부분 같은 값이라 무해), (b) 디바운스/`requestAnimationFrame` 래핑이 없어 창 리사이즈를 드래그하는 동안 setState가 연속 발생하면 SVG 재계산(`Math.max(...vals)`, path 문자열 빌드)이 매 프레임 돈다. 데이터 14포인트라 비용은 작지만, ResizeObserver 콜백은 rAF로 묶는 게 일반적 best practice.

### F-7. [DB 전환 시 핵심] 현재 배열 로직을 인덱스/쿼리로 풀어야 함
- 근거: 모든 조회가 `Array.prototype.filter/sort/slice` 기반(F-2). DB 전환 시 동일 시맨틱을 다음으로 번역해야 한다:
  - `searchCompanies`: `biz_name ILIKE '%q%'` + `ORDER BY cur_members DESC LIMIT 10`. 접두 검색이면 `text_pattern_ops` B-tree, 부분일치면 `pg_trgm` GIN 인덱스 필요(현재 `includes`는 부분일치라 trigram).
  - `nearbyCompanies`: tier 키별 인덱스 — `bdong_code`, `sigungu`, `industry_code`. 부분 인덱스로 `WHERE cur_members > 5 AND is_closed = false` 조건을 미리 거르면 좋다. `ORDER BY cur_salary DESC`.
  - `topRiskCompanies`: `WHERE is_closed=false ORDER BY risk_score DESC, cur_turnover DESC LIMIT 20` → `(is_closed, risk_score DESC, cur_turnover DESC)` 복합 인덱스.
  - `closedCompanies`: `WHERE is_closed=true ORDER BY cur_members DESC` → `(is_closed, cur_members DESC)`.
  - `awards`: 부문별 `ORDER BY ... LIMIT 1`. 인덱스 있으면 각 1행 즉시.
  - `getMonthlyStats`: 시계열은 별도 테이블 `monthly_stat(company_id, ym, ...)` + `(company_id, ym)` 인덱스. 모듈 로드 시 전량 생성(F-1) 대신 회사 상세 진입 시 해당 14행만 쿼리.
- 핵심: `risk_score`, `cur_*`, `is_closed`는 이미 "ETL 사전계산값"으로 설계돼 있음(`types.ts` L21 주석). 즉 점수 계산은 적재 시 1회로 끝내고 조회는 인덱스 스캔만 — 이 방향은 옳다. 코드만 배열→쿼리로 바꾸면 된다.

## 구체적 개선안

우선순위 순.

1. **시계열을 lazy + 캐시로 전환 (F-1, 가장 중요).**
   - 지금: 모듈 top-level에서 7,112행을 미리 빌드.
   - 개선: `getMonthlyStats(id)`를 호출 시점에 해당 회사 14행만 생성하도록 바꾸고, 한 번 만든 결과를 `Map`에 메모이즈(현재의 `STATS_BY_ID`를 "빈 채로 두고 첫 조회 시 채우는" 캐시로 사용). 이러면 콜드스타트 비용이 508분의 1로 줄고, 실데이터에선 "조회된 회사만 쿼리" 패턴으로 자연 전환된다.
   ```ts
   const STATS_BY_ID = new Map<string, MonthlyStat[]>();
   export function getMonthlyStats(id: string): MonthlyStat[] {
     const hit = STATS_BY_ID.get(id);
     if (hit) return hit;
     const c = getCompany(id);
     if (!c) return [];
     const series = buildSeries(c); // 기존 루프 본문을 함수로 추출
     STATS_BY_ID.set(id, series);
     return series;
   }
   ```

2. **코너 조회에 ISR 캐싱 부여 (F-5).** 데이터가 결정적이므로 코너 페이지(`/monthly`, `/memorial`, `/awards`, `/game`)와 회사 상세에 `export const revalidate = 3600`(또는 적절 주기) 추가. on-demand 렌더 결과가 캐시되어 매 요청 풀스캔/쿼리가 사라진다. 데이터 갱신 주기(월 1회 ETL)에 맞추면 사실상 정적에 가깝게 동작.

3. **API 라우트 응답 캐시 (F-2, F-5).** `/api/search`는 쿼리 다양성이 커 캐시 효과가 낮지만, `/api/nearby?id=...`는 입력 도메인이 회사 수만큼 유한하므로 `Cache-Control: s-maxage` 또는 라우트 세그먼트 캐시가 효과적.

4. **`awards`의 정렬을 단일 패스로 (F-3).** `[...arr].sort(cmp)[0]` 5회 → 각 부문을 `reduce`로 최댓값 1패스. 결과 동일, 복제·정렬 제거.

5. **DB 전환 시 인덱스 설계 (F-7).** 위 매핑대로 `companies(is_closed, risk_score DESC, cur_turnover DESC)`, `(is_closed, cur_members DESC)`, `bdong_code`, `sigungu`, `industry_code`, `pg_trgm GIN(biz_name)`, `monthly_stat(company_id, ym)` 인덱스. 조회 함수 시그니처는 유지하고 내부 구현만 쿼리로 교체하면 페이지 코드는 무변경.

6. **차트 ResizeObserver를 rAF로 래핑 (F-6).** `measure`를 `requestAnimationFrame`으로 디바운스해 리사이즈 드래그 중 과도한 setState/재계산 방지. 선택 사항(현 데이터 규모에선 미미).

7. **(선택) 차트 정적/인터랙션 분리 (F-4).** 현재 양호. 더 줄이려면 정적 SVG(축·선·영역)는 서버에서 그리고 hover 레이어만 클라이언트로 분리. 비용 대비 효과는 낮으니 후순위.

## 반성점

- **측정 미실시.** 번들 분석기(`@next/bundle-analyzer`)나 `next build` 출력, 콜드스타트 프로파일을 실제로 돌리지 않았다. First Load JS "수 KB"나 콜드스타트 영향은 코드 구조에서 추론한 것이지 측정값이 아니다. 정확한 수치는 `next build` + 번들 분석으로 확인해야 한다.
- **현재 규모에서 거의 모든 항목이 무해**하다는 점을 분명히 한다. 508개 인메모리는 실측상 빠르고, 정렬·복제 비용도 체감되지 않는다. 위 발견들은 "지금 느리다"가 아니라 "**실데이터로 갈 때 이 구조가 어떻게 무너지는가**"의 관점이다. 과제가 명시적으로 확장성을 물었기에 미래 시나리오 중심으로 평가했다.
- **잘 설계된 부분을 과소평가하지 않으려 했다.** ETL 사전계산값(`risk_score`, `cur_*`) 분리, 차트 라이브러리 미사용(순수 SVG), 히어로만 SSG + 나머지 on-demand 방향, 결정적 시드(하이드레이션 안전)는 모두 확장성/성능 면에서 옳은 선택이다. 진짜 빈틈은 "캐싱/lazy 부재"와 "배열 로직이 쿼리로 번역 안 됨" 두 가지에 집중돼 있다.
- **DB 스키마는 추측 영역.** Supabase/Postgres 전제(`types.ts` 주석의 "Supabase" 언급, 한국 행정 데이터 특성)로 인덱스를 제안했으나, 실제 채택 DB·쿼리 패턴·갱신 주기를 모른 채 쓴 권고다. 적용 전 실제 워크로드로 검증 필요.
