# Pass 03 — 아키텍처 & 데이터 패칭 전략

점검일: 2026-06-20 · 대상: Next.js 15.5 App Router / React 19 / TS5 / 인메모리 데이터(`lib/data.ts`)

## 점검 범위

- 서버/클라이언트 컴포넌트 경계 (`'use client'` 남용/누락)
- API routes(`/api/search`, `/api/nearby`)와 서버컴포넌트 직접 호출의 혼용 — 일관성, 실데이터/DB 전환 적합성
- `generateStaticParams`로 히어로 8개 SSG + 나머지 동적 — 대량 실데이터 적합성, `dynamicParams`/캐싱/`revalidate` 전략
- 클라이언트 검색(`fetch /api/search` 디바운스)의 확장성
- 데이터 접근 추상화/경계
- 환경변수/설정

근거는 실제 파일 Read/Grep 기준. 추측은 배제했다.

## 발견 (심각도 · 파일·라인)

### F1. `/api/nearby` 라우트가 어디서도 호출되지 않음 — 죽은 코드 [중]
- `app/api/nearby/route.ts:1-17` 는 `nearbyCompanies`를 래핑해 JSON을 반환하지만, 전체 코드베이스에서 `/api/nearby`를 fetch하는 곳이 없다. `Grep "/api/nearby"` 결과 매치 0건.
- 실제 주변회사 추천은 서버컴포넌트가 직접 호출한다: `app/company/[id]/page.tsx:31` 의 `nearbyCompanies(id, 10)`. `NearbyList`(`components/NearbyList.tsx`)는 props로 받은 배열만 렌더하는 순수 서버 컴포넌트이고 fetch가 없다.
- 즉 같은 기능(`nearbyCompanies`)에 대해 "직접 호출"과 "API route" 두 경로가 공존하는데 후자는 미사용. 일관성 결함이자 유지보수 부담.

### F2. API route와 서버컴포넌트 직접 호출의 혼용 기준이 불명확 [중]
- 직접 호출: `monthly/page.tsx:1,7`(`topRiskCompanies`), `memorial/page.tsx:1,7`(`closedCompanies`), `awards/page.tsx:2,8`, `game/page.tsx:1,7`, `company/[id]/page.tsx:3,24,27,31`.
- API route 경유: `searchCompanies`(`/api/search`, `SearchBox.tsx:22`에서 사용), `nearbyCompanies`(`/api/nearby`, 미사용).
- 실제로 API route가 *필요한* 유일한 사례는 검색(클라이언트 인터랙티브 자동완성)뿐이다. 나머지는 모두 직접 호출이라 타당하다. 문제는 (a) `/api/nearby`가 불필요하게 만들어졌고, (b) `/api/search`·`/api/nearby` 두 route 모두 `lib/data`의 인메모리 함수를 직접 import한다는 점(`route.ts:2`). DB 전환 시 route handler와 서버컴포넌트가 *각각* 데이터 계층을 어떻게 부를지 통일된 규약이 없다.

### F3. 라우트 캐싱/`revalidate`/`dynamicParams` 전략 전무 [중]
- 어떤 page/route에도 `export const revalidate`, `export const dynamic`, `export const dynamicParams`가 없다. `Grep "revalidate|dynamicParams|dynamic ="` 매치 0건(검색결과는 `SearchBox`의 fetch 1건뿐).
- `next.config.mjs:1-4` 는 빈 설정(`const nextConfig = {}`).
- `/api/search`, `/api/nearby` route handler는 `GET`이고 `NextRequest`(`searchParams`)에 의존하므로 Next 15에서 자동으로 동적 처리되지만, 의도가 명시돼 있지 않다. 데이터가 인메모리 상수라 현재는 무해하나, DB 도입 시 캐싱 동작이 암묵적이라 예측 불가.
- `monthly`/`memorial`/`awards`/`game` 등 목록 페이지는 모듈 로드시 1회 계산된 `COMPANIES` 상수를 읽으므로 빌드시 정적화된다. 실데이터에서는 "이달의" 통계가 갱신돼야 하는데 `revalidate`가 없어 재배포 전까지 고정된다.

### F4. `generateStaticParams` 8개 SSG + 동적 — 대량 데이터에선 맞지만 가드가 없음 [중]
- `company/[id]/page.tsx:13-16` 는 `HERO_IDS`(=`SEEDS` 8건, `data.ts:325`)만 정적 생성. 나머지는 요청 시 렌더. 수십만 건 실데이터에서 전수 SSG가 불가능하므로 *방향은 옳다*.
- 그러나 `dynamicParams`가 명시돼 있지 않다(기본값 `true`라 동작은 함). 또한 미존재 id는 `getCompany`가 `undefined` → `notFound()`(`page.tsx:24-25`)로 처리되어 안전하다. 다만 동적 렌더 결과에 대한 캐시 정책(`revalidate`)이 없어, 실데이터에서 매 요청 DB 조회가 그대로 노출될 위험.
- 현재 `COMPANIES`는 모듈 평가 시 시드 8건 + 생성 500건(`data.ts:326`)을 메모리에 만든다. 수십만 건 실데이터를 이 방식(모듈 상수 + 전건 `Map`/배열)으로 올리면 빌드·메모리·콜드스타트 모두 비현실적. 이 파일 전체가 DB 쿼리 계층으로 대체돼야 한다.

### F5. 검색 확장성 — 인메모리 풀스캔 + 클라이언트 직접 fetch [중]
- `searchCompanies`(`data.ts:387-393`)는 `COMPANIES.filter(...).sort(...).slice()` — O(n) 풀스캔 + 정렬. 500건은 무해하나 수십만 건이면 요청마다 전건 스캔.
- `SearchBox.tsx:15-32` 의 디바운스는 180ms로 적절하고 `clearTimeout` 정리도 정상. 그러나 (a) in-flight 요청 취소(`AbortController`) 없음 → 빠른 타이핑 시 응답 순서 역전(stale 결과 덮어쓰기) 가능. (b) 최소 글자수 제한·요청 throttle 없음. (c) 결과 캐싱 없음.
- DB 전환 시 이 검색은 인덱스/풀텍스트(예: `pg_trgm`, ILIKE 인덱스)로 가야 하고, route handler는 그대로 두되 내부 구현만 교체 가능한 구조라 그 점은 양호.

### F6. 데이터 접근 추상화가 단일 모듈에 혼재 [중]
- `lib/data.ts`(474줄) 한 파일이 (1) 시드 데이터, (2) 결정적 생성기(`mulberry32`, `genSeeds`), (3) 시계열 생성, (4) 조회 함수(`getCompany`, `searchCompanies`, `nearbyCompanies`, `topRiskCompanies`, `closedCompanies`, `awards`, `gamePool`)를 모두 담는다.
- 조회 함수 시그니처(예: `searchCompanies(q, limit): Company[]`)는 동기 반환이다. DB는 비동기(`Promise`)다. 호출부(`monthly/page.tsx:7` 등)가 동기 호출을 전제로 작성돼 있어, DB 전환 시 *모든 호출부*를 `async/await`로 바꿔야 한다. 데이터 접근을 별도 인터페이스(repository)로 추상화해 처음부터 `async`로 두지 않은 점이 가장 큰 전환 비용.
- 긍정적 측면: 조회 함수가 한 곳에 모여 있어 "교체 지점"은 명확하다. `route.ts`와 page가 SQL을 직접 쓰지 않고 이 함수들만 부르는 경계는 지켜졌다.

### F7. 환경변수/설정 부재 [낮음]
- `Grep "process.env"` 매치 0건. `.env*` 파일 없음. 현재 외부 의존이 없으니 정상이나, 주석(`data.ts:235` "전국 실데이터(M9, Supabase) 적재 전까지")이 예고한 DB 도입 시 `DATABASE_URL` 등 설정 계층이 통째로 신설돼야 한다. 지금은 빈 상태임을 기록.
- `next.config.mjs`도 비어 있어 이미지/캐시/실험 플래그 등 조정 여지 미사용(현재 요구 없음).

### 양호한 점
- 클라이언트 컴포넌트 경계는 적절. `'use client'`는 인터랙션이 실제 필요한 5개(`SearchBox`, `GuessGame`, `NavBar`, `LineChart`, `HireLeaveChart`)에만 있고(`Grep` 확인), page들과 `NearbyList`/`CompanyRankList`/`MetricCard`/`RiskGauge`는 서버 컴포넌트로 유지. 남용·누락 모두 없음.
- 하이드레이션 안전성 고려됨: `mulberry32` 결정적 PRNG로 `Math.random` 회피(`data.ts:4-13`) — SSR/CSR 불일치 방지.
- `company/[id]/page.tsx`는 Next 15 규약대로 `params`를 `Promise`로 받아 `await`(`:18-23`).

## 구체적 개선안

1. **`/api/nearby` 삭제** 또는 실제 클라이언트 사용처를 만들 것. 현재는 죽은 코드(F1). 주변추천이 서버 렌더로 충분하면 route 제거가 정답.
2. **데이터 접근을 async repository 인터페이스로 추상화.** 예: `lib/repo/companies.ts`에 `getCompany(id): Promise<Company|undefined>`, `searchCompanies(q,limit): Promise<...>` 등을 정의하고, 현재 인메모리 구현을 `lib/repo/companies.memory.ts`로 분리. 호출부를 지금 `async/await`로 바꿔두면(F6) DB 전환 시 구현 파일만 교체. 이게 가장 비용 큰 선제 작업.
3. **캐싱 정책 명시.** 목록 페이지(`monthly`/`memorial`/`awards`)에 `export const revalidate = <초>` 추가, `company/[id]`에 `dynamicParams = true` 및 적절한 `revalidate` 명시(F3, F4). route handler에는 의도에 맞게 `dynamic`/`revalidate` 또는 `Cache-Control` 헤더.
4. **검색 견고화.** `SearchBox`에 `AbortController`로 in-flight 취소(stale 응답 방지), 최소 2글자 가드. 서버측은 DB 인덱스/풀텍스트 전제로 `searchCompanies` 구현 교체(F5).
5. **설정 계층 준비.** DB 도입 시 `DATABASE_URL` 등을 `process.env`로 읽는 `lib/env.ts`(검증 포함) 신설(F7).
6. **대량 데이터 대비.** `COMPANIES` 전건 메모리 적재(`data.ts:326`) 패턴은 DB 쿼리(LIMIT/인덱스)로 대체. `awards`/`topRisk`/`closed`는 집계 쿼리로, `gamePool` 셔플은 DB 샘플링으로(F4).

## 반성점

- 정적/동적 렌더링 동작은 코드(`export` 부재)로 추론했고 실제 빌드 출력(`.next` 라우트 매니페스트)이나 `next build` 로그로 SSG/Dynamic 판정을 확인하지는 못했다. "정적화된다"는 서술은 Next 15 기본 동작에 근거한 추정이며, 실제 빌드 검증이 더 강한 근거가 됐을 것이다.
- 성능 수치(O(n) 풀스캔의 실제 영향)는 데이터가 500건이라 측정하지 않았다. "수십만 건"은 사용자가 제시한 시나리오를 그대로 전제했고 벤치마크는 없다.
- `tsconfig.json`의 `paths`(`@/` 별칭)는 import이 정상 동작함을 보고 존재를 전제했을 뿐, 직접 열어 확인하지는 않았다 — 경계 평가의 핵심은 아니라 생략했다.
