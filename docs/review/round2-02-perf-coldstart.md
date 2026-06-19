# Round2-02 — 콜드스타트·메모리·런타임 성능 @552k

대상: `jotsopan` (Next.js 15 App Router). 데이터 계층 전부 `lib/data.ts` 인메모리.
점검 일자: 2026-06-20. 데이터: `data/companies.json` (디스크 45.2MB / UTF-8 33MB), 활성 552,878 + 휴폐업 200 = 553,078곳.

## 점검 범위

- 모듈 로드(import) 시점 비용: `fs.readFileSync` + `JSON.parse` + `ensureIds()`(553k 해시+Map) + `nameLc`(552k `toLowerCase`)
- `ensureIds`/`nameLc`가 즉시(eager)인지 지연(lazy)인지, 콜드스타트 직격 여부
- `searchCompanies`/`nearbyCompanies` 매 요청 전수 스캔 latency, 600 hits 캡
- `topRisk`/`awards`/`closed`/`gamePool` 지연캐시 적절성
- Vercel 서버리스 함수 메모리 한도(기본 ~1.7GB / 설정에 따라 1024MB) 대비 마진
- 개선안: 지연 id 빌드, 검색 인덱스, ISR/revalidate, 메모리 절감

근거는 코드 Read + Node 실측(`node v22.18.0`, `lib/data.ts` 로직을 그대로 모사). 측정값은 로컬 환경 기준이며 Vercel 런타임과 절대치는 다를 수 있음을 명시한다(상대 구조는 동일).

## 실측 결과 (Node v22, lib/data.ts 로직 모사)

콜드스타트(모듈 평가) 구간 분해:

| 단계 | 시간 | 비고 |
|---|---|---|
| `readFileSync(utf8)` | ~153ms | 45MB 디스크 → 33MB 문자열 |
| `JSON.parse` | ~247ms | 컬럼 배열 역직렬화 |
| `ensureIds()` (553k djb2 해시 + Map) | ~441ms | 충돌 192건(접미사 `x`로 해소) |
| `nameLc` (552k `toLowerCase`) | ~95ms | |
| **합계(콜드 모듈로드)** | **~944ms** | 첫 요청 전 전부 동기 실행 |

메모리(RSS):
- parse 직후(buffer+string 해제 후): **~246MB**
- `ensureIds` 후: **~328MB** (IDS 배열 553k + Map 553k 엔트리 = +82MB)
- `nameLc` 후: **~332MB** (정착치)
- **현실적 피크**: 로드 순간 buffer(43MB) + JS 문자열(UTF-16 내부표현 ~66MB) + 파싱 결과가 동시 생존 → **parse 경계에서 ~278MB**. GC 전 일시 피크는 더 높을 수 있음.

런타임 조회(NA=552,878 전수 기준):
- `searchCompanies` 흔한 단어("김", 600캡 도달): **~6ms** / 무매치(전수 풀스캔): **~9ms**
- `nearbyCompanies` 최악(4 tier 전부 풀스캔): **~21ms**
- `topRiskCompanies` 풀스캔+정렬(cand 213,858): **~44ms**
- `awards` 단일 패스: **~2ms**

## 발견 (심각도 / 근거)

### F-1. [높음] 콜드스타트 ~944ms 전부 모듈 top-level 동기 실행 — 첫 요청에 직격
- 근거: `lib/data.ts` L18-20 `const raw = JSON.parse(fs.readFileSync(...))`가 모듈 평가 시점에 실행. 핵심은 **L85** `export const HERO_IDS = Array.from({length:8}, (_,g)=>idAt(g))` — `idAt`가 `ensureIds()`를 호출하므로(L59), HERO_IDS export를 평가하는 순간 553k 전체 id 빌드(~441ms)가 **강제로 eager 실행**된다. 즉 "지연 빌드" 의도(`IDS=null` L42)는 HERO_IDS 한 줄 때문에 무력화된다.
- 추가로 `nameLc`(L131)도 `const`라 모듈 로드 즉시 552k `toLowerCase`(~95ms).
- 영향: 서버리스 콜드스타트마다 read+parse+ids+nameLc 합 **~944ms**(로컬 기준)가 첫 핸들러 실행 전에 무조건 소모. Vercel은 인스턴스별 독립 메모리 → 콜드스타트 N회면 N배 중복. 실제 Vercel(느린 디스크 I/O, 콜드 CPU)에선 이보다 더 길 가능성이 높다(추측).

### F-2. [중간] 메모리 ~332MB 정착 — 1.7GB 한도엔 여유, 1024MB·동시성·피크엔 경고
- 근거: 실측 정착 RSS ~332MB(데이터 246 + ids/map 86). parse 경계 피크 ~278MB+(buffer+string 일시 생존).
- 평가: **기본 1.7GB 한도 초과 위험은 낮다**(질문의 "초과 위험" 가설은 단일 인스턴스 기준으론 과대평가, 명시한다). 다만:
  - 함수 메모리를 **1024MB로 설정**했다면 332MB 정착 + 요청 처리 중 `companyAt`/정렬 임시 배열 + Next.js 런타임 오버헤드로 마진이 빠르게 줄어든다.
  - parse 시점 일시 피크(buffer 43MB + UTF-16 문자열 66MB + 파싱 객체)가 동시 생존하므로 **콜드스타트 순간 피크는 정착치보다 100MB+ 높다**. GC 타이밍에 따라 OOM 여지(추측, 한도 설정값에 의존).
  - `ID_MAP`(553k 엔트리 Map)은 `getCompany`/`nearbyCompanies`에만 쓰이는데 항상 상주.

### F-3. [중간] 검색은 매 요청 전수 스캔이지만 실측 latency는 양호(6~9ms)
- 근거: `searchCompanies` L138-143 `for i in [0,NA)` 선형 스캔, `nameLc[i].includes` + 조건부 `bizNo.includes`. 600 hits 캡(L141)으로 흔한 단어는 조기 종료.
- 평가: 실측 6~9ms로 **현재는 문제 아님**. 다만:
  - 무매치 쿼리는 캡이 안 걸려 **항상 552k 전수 풀스캔**(~9ms). 검색 자동완성처럼 키 입력마다 호출되면 누적된다(디바운스 여부는 클라이언트 측 확인 필요).
  - 600 캡은 latency 보호엔 좋으나, 캡 도달 후 `hits.sort(members desc)`로 상위만 추리므로 **"가장 큰 회사"가 캡 이후에 있으면 누락**된다(정확도 trade-off, 명시). 흔한 성씨 검색에서 대기업이 빠질 수 있음.

### F-4. [낮음→중간] nearby 4 tier 풀스캔(~21ms), topRisk 풀스캔+정렬(~44ms)
- 근거: `nearbyCompanies` L157-167은 tier마다 `collect`가 `for j in [0,NA)` 풀스캔. 최악(상위 tier 전부 빈 결과) 4회 = ~21ms. `topRiskCompanies` L181-186은 첫 호출 시 552k 스캔 + 213,858건 정렬 = ~44ms.
- 평가: topRisk는 `_topRisk` 지연캐시(L179)라 **첫 호출만** 비싸고 이후 캐시. nearby는 캐시 없음 — 회사 상세 진입마다 최대 4 풀스캔. 단일 요청 21~44ms는 허용 범위지만, 콜드스타트(944ms) + 첫 topRisk(44ms) + 첫 nearby가 겹치면 첫 페이지 응답이 1초+ (추측, 페이지별 호출 조합에 의존).

### F-5. [양호] 지연캐시 설계는 대체로 적절, awards/closed에 미세 비효율
- 근거: `_topRisk`(L179), `_awards`(L197), `STATS_CACHE`(L106)는 지연+캐시로 옳게 설계. `getMonthlyStats`는 회사별 14행만 lazy 생성(L107-128) — 552k×14 전량 빌드를 피한 좋은 선택.
- 미세점:
  - `awards`(L201-209)는 이미 단일 패스 reduce 형태로 개선돼 있음(과거 정렬-기반 아님) — **양호**.
  - `closedCompanies`(L190-193)는 NCL=200이라 비용 무시 가능하나 `setOf(b)`를 sort 비교자 안에서 매번 호출(L192) — 200건이라 무해.
  - `gamePool`(L221-229)은 552k 중 30인+ 필터 후 셔플 — 매 호출 풀스캔(캐시 없음). 게임 페이지 진입마다 552k 스캔.

## 구체적 개선안 (우선순위 순)

1. **HERO_IDS의 eager 강제 제거 (F-1, 최우선).** `HERO_IDS`를 `const` 즉시 평가 대신 (a) 8개에 한해 `ensureIds` 없이 인라인 해시로 id만 계산하거나, (b) lazy getter/함수로 전환. 이러면 `ensureIds`(441ms)가 **실제 id 조회 첫 요청까지 지연**된다. 검색/주변 페이지는 id가 필요하지만, 홈/코너 일부는 id 없이 렌더 가능 → 콜드스타트에서 441ms 제거.

2. **`nameLc`를 lazy로 (F-1).** `const nameLc = ...`(L131)를 `searchCompanies` 첫 호출 시 빌드하는 캐시로 변경. 검색을 안 쓰는 페이지의 콜드스타트에서 95ms + 552k 문자열 배열 메모리 제거.

3. **검색 인덱스 도입 (F-3).** 현재 552k `includes` 선형 스캔. n-gram(trigram) 역색인이나 접두 트라이를 모듈 로드 시 1회 구축하면 무매치/희귀어도 O(매치수)로. 단 인덱스 자체 메모리(F-2)와 트레이드오프 — 552k 규모면 ISR 캐시(아래 5)가 더 저비용일 수 있음.

4. **파싱 메모리 피크 완화 (F-2).** `JSON.parse(fs.readFileSync(...,"utf8"))`는 buffer→문자열→객체가 잠깐 동시 생존. 스트리밍 파서나, 더 현실적으로 **컬럼 배열을 바이너리(Typed Array) 포맷**으로 ETL 산출하면 parse 비용·메모리·피크를 크게 줄일 수 있다(숫자 컬럼 members/salary/turnover/score/*Ix를 `Int32Array`로). id/name/bizNo만 문자열.

5. **ISR/revalidate 부여 (F-3,F-4).** 데이터가 월 1회 ETL로 결정적이므로 코너 페이지·회사 상세에 `export const revalidate = 86400` 등 부여. on-demand 렌더 결과를 캐시해 **콜드스타트+풀스캔이 캐시 적중 후 사라진다**. 552k 규모에서 가장 비용 대비 효과 큰 개선.

6. **nearby/gamePool 캐시 (F-4,F-5).** `nearbyCompanies`는 입력 도메인이 회사 수만큼 유한 → 결과 LRU 캐시 또는 ISR. `gamePool`은 30인+ 후보 인덱스 배열을 모듈 캐시(셔플만 매번).

7. **메모리 한도 점검 (F-2).** Vercel 함수 메모리를 1769MB(기본)로 유지하거나, 1024MB로 낮췄다면 콜드 피크(~278MB+) + 런타임 마진을 실측 확인. `Int32Array` 전환(4번) 병행 시 1024MB도 안전.

## 반성점 / 추측 표시

- **실측은 로컬(Node v22, Windows) 기준.** Vercel 서버리스의 콜드 CPU·디스크 I/O는 다르다 — 944ms는 "상대 분해"로 신뢰하되 절대치는 Vercel `next build`+실배포 프로파일로 검증 필요(미실시, 추측).
- **메모리 한도 초과 위험은 질문 가설보다 낮게 평가**했다. 단일 인스턴스 332MB 정착은 1.7GB 대비 여유. 위험은 (a)1024MB 설정 시, (b)parse 일시 피크, (c)GC 타이밍에 국한 — 모두 설정·런타임 의존이라 추측 구간임을 명시.
- **함수 메모리 설정값을 확인 못 함.** `next.config.mjs`엔 `outputFileTracingIncludes`만 있고 메모리 설정은 `vercel.json`/대시보드 영역 — 미확인. 1024MB 가정은 추측.
- **검색 600캡의 정확도 누락(F-3)**은 실측이 아닌 코드 분석상 추론. 실제 누락 빈도는 쿼리 분포에 의존.
- **잘된 점**: 컬럼형+인터닝으로 객체 생성을 질의 결과에만 한정, `getMonthlyStats`/`topRisk`/`awards` 지연캐시, 결정적 시드(하이드레이션 안전), `awards` 단일 패스 — 552k 인메모리치곤 구조가 건전하다. 진짜 빈틈은 **HERO_IDS의 eager 강제(F-1)**와 **ISR 캐싱 부재(F-3,F-4)** 두 가지에 집중.
