# Round4-04 — 성능·인덱스 정확성·메모리 @552k

대상: `jotsopan` (Next.js 15 App Router). 데이터 계층 전부 `lib/data.ts` 컬럼형 인메모리.
점검 일자: 2026-06-20. 데이터: `data/companies.json` (디스크 45.3MB / UTF-8 문자열 34,764,597자 = ~34MB). 활성 **552,878** + 휴폐업 200 = 553,078곳 (round3의 552,693에서 데이터 재생성됨).
실측: `node v22`로 `lib/data.ts` 로직을 그대로 모사(read/parse/ensureIds/indexes/nameLc latency·RSS, 인덱스 결과 정확성, warm 누적비용). 로컬 절대치이며 Vercel 런타임과 다를 수 있음(상대 구조는 동일). 측정/추정 구분 표기.

## 점검 범위 (질문 1~5)

1. `indexes()` 빌드 비용/메모리, 인덱스 기반 결과가 전수 스캔과 동일한지(정확성)
2. 회사 상세 1요청 누적비용(ensureIds+indexes+regionRank+salaryPercentile+riskLadder+nearby) 콜드/웜
3. Vercel 함수 메모리 여유
4. 콜드스타트 시 indexes/ensureIds/nameLc 트리거 순서
5. 추가 절감 여지(바이너리/캐시)

## 실측 결과 (Node v22, lib/data.ts 로직 모사)

### 콜드스타트(모듈 평가) 구간 분해

| 단계 | 시간(실측) | 트리거 시점 | 비고 |
|---|---|---|---|
| `readFileSync(utf8)` | **151ms** | 모듈 top-level (강제) | 45MB 디스크 → 34.8M자 문자열 |
| `JSON.parse` | **246ms** | 모듈 top-level (강제) | 컬럼 배열 역직렬화 |
| `ensureIds()` 552k djb2+Map | **547ms** | **지연** (첫 `getCompany`/nearby/rank/pct/ladder) | IDS 배열 + ID_MAP 553,078 엔트리 |
| `indexes()` bySg/byDong/byInd | **224ms** | **지연** (첫 nearby/rank/pct/ladder) | 258 / 14,075 / 1,575 그룹 |
| `nameLc` 552k normForSearch | **209ms** | **지연** (첫 검색만) | NFC+전각변환+소문자 |

- **모듈 top-level 강제분 = read+parse ≈ 397ms** (콜드 인스턴스마다 무조건). round3(~546ms)보다 짧게 측정됨(parse 246 vs 396 — 디스크캐시·런 편차, 추정).
- **콜드스타트 트리거 순서(질문 4)**: 모듈 로드 시엔 read+parse + `MONTHS`/`HERO_IDS`만 평가됨. `HERO_IDS`(L96)는 `baseId`(L63)를 쓰므로 **ensureIds를 트리거하지 않음** — 진짜 지연 확인. 첫 회사 상세 요청에서 함수 본문 실행 시 `ensureIds()`(L90 getCompany)가 가장 먼저, 이어 `nearbyCompanies`→`regionRank`→`salaryPercentile`→`riskLadder`가 각각 `indexes()`를 호출하나 `_idx` 가드로 **1회만 빌드**. `nameLc`는 검색 라우트(`/api/search`)에서만 트리거되어 상세 경로와 분리됨. 즉 **상세 첫 요청 = ensureIds(547) + indexes(224) ≈ 771ms 동기 1회 지불**, 이후 인스턴스 수명 내내 캐시.

### `indexes()` 비용·메모리 + 정확성 (질문 1)

- **빌드 비용(실측): 224ms / +23MB RSS**. 그룹 수 bySg 258, byDong 14,075, byInd 1,575.
- **정확성(실측): 300개 무작위 활성 회사 샘플 전수스캔 대조 → 불일치 0**.
  - `bySg`/`byInd`/`byDong` 그룹 크기 = 동일 키 전수스캔 카운트와 **100% 일치**(mismatch 0/300 각각).
  - `regionRank`의 rank·total을 인덱스 경로 vs 전수스캔으로 계산 → **0/300 불일치**. 동점 안정화(`j<g` tie-break)까지 일치.
  - 결론: 인덱스는 단순 그룹 분할이라 전수스캔과 수학적으로 동치이며 실측으로도 확인됨. 정확성 결함 없음.

### 메모리 (RSS, 실측, --expose-gc)

| 시점 | RSS | 비고 |
|---|---|---|
| parse 직후(gc 후) | **247MB** (base ~50) | 컬럼 데이터 정착 |
| +ensureIds | +78MB → 325MB | IDS + Map 553k |
| +indexes | +23MB → 348MB | 3개 Map + number[] 풀 |
| +nameLc | +30MB → **378MB** | 소문자 문자열 552k |
| **세 캐시 모두 정착** | **~378MB** | 상세+검색 둘 다 탄 인스턴스 |

- round3 정착치(~253MB)보다 높게 측정됨 — round3은 GC 상쇄분을 합산보다 낮게 잡았고, 본 측정은 단계별 누적 RSS(보수적). 데이터도 약간 증가. parse 경계 일시 피크는 string(~70MB)+파싱결과 동시 생존으로 base+200MB 내외(추정).

### 회사 상세 1요청 누적비용 (질문 2)

상세 1요청 = `getCompany`(ensureIds) + `getMonthlyStats`(O(14)·캐시) + `nearbyCompanies`(tier1=동) + `regionRank` + `salaryPercentile` + `riskLadder`.

- **WARM(실측, 2000요청 평균)**: 그룹 순회 **23,117건 / 0.905ms/요청**. 전수스캔이었다면 동일 작업이 ~4×NA = **2,211,512건**이므로 인덱스로 **~96배 순회 절감**.
- **COLD 첫 요청**: 위 warm 0.9ms에 **ensureIds 547ms + indexes 224ms = ~771ms 1회 가산**. (검색 경유 시 nameLc 209ms 추가, 상세와는 별도 경로.)
- 평가: warm은 한 자릿수 ms 미만으로 **현재 절대 성능 우수**. 인덱스 도입(round3 권고)이 반영되어 상세 요청이 더 이상 풀스캔이 아님. 남은 비용은 (a) 콜드 첫 요청의 ~771ms 점프, (b) `companyAt`이 결과 건마다 `riskScore` 재계산(점수는 이미 `A.score`에 있는데 contrib 위해 재호출).

## 발견 (심각도 / 근거)

### F-1. [낮음→정보] 인덱스 정확성 결함 없음 — warm 96배 절감 확인 (질문 1·2)
- 근거: 300샘플 전수스캔 대조 0 불일치(그룹크기·regionRank rank/total/tie-break). warm 실측 23,117건/0.9ms vs 풀스캔 2.21M건. round3 F-1 권고가 코드에 반영(`indexes()` L176)되어 상세 요청이 그룹 순회로 전환됨 — **개선 확인**.

### F-2. [중간] 콜드 첫 상세 요청 ~771ms 동기 점프 — ensureIds가 비용의 71% (질문 2·4)
- 근거: ensureIds 547ms(전체 553k djb2+Map+충돌해소 while). 그러나 단일 상세 요청에 실제로 필요한 id는 결과로 내보내는 ~수십 건뿐인데 **552k 전수 id를 일괄 생성**한다. `companyAt`은 `idAt(g)`로 개별 id만 필요.
- 권고: `ID_MAP`(id→g 역방향)은 `getCompany` 라우팅에 필요하므로 유지하되, **IDS 정방향 배열 553k 일괄 생성은 지연/축소** 가능. 또는 id 스킴을 충돌 없는 결정적 함수(`baseId`, 상위 8개 충돌무 — L62 주석)로 통일해 ensureIds 자체를 제거하고 역방향 Map만 첫요청 시 빌드. ensureIds(547)+indexes(224)를 하나의 첫요청 워밍으로 합쳐도 ~771ms는 콜드 1회뿐이라 ISR 캐시 후 상각.

### F-3. [중간] 메모리 ~378MB 정착 — 1024MB 함수에선 동시성 마진 주의 (질문 3)
- 근거: 실측 정착 RSS ~378MB(데이터 247 + ids/map 78 + idx 23 + nameLc 30). `vercel.json` 부재 → 함수 메모리·`maxDuration` 미설정, 기본값 의존(추정).
- 평가: 기본 ~1.7~2GB 한도 대비 단일 인스턴스는 여유. 단 ① **1024MB로 낮추면** parse 경계 피크 + 세 캐시(378) + 동시요청 버퍼에서 마진 얇음, ② Vercel은 인스턴스별 독립 메모리 → 콜드 N개면 각 ~378MB 별도 확보(비용·동시성). 권고: `vercel.json`에 메모리 명시(1769MB 또는 검증 후 1024MB) + `maxDuration`.

### F-4. [높음] revalidate=86400 vs 월간 데이터 — on-demand revalidation 권고 (round3 F-4 미해소)
- 근거: `app/company/[id]/page.tsx` L18 `revalidate=86400`, `dynamicParams` 미지정(기본 true). `generateStaticParams`는 HERO 8개만. 나머지 552k는 요청 시 렌더 후 24h ISR 캐시. 원천 데이터 `ym=2026-04`로 **월 단위** 갱신인데 매일 1회 stale 재생성 → 불필요한 콜드 재계산(F-2 비용 재지불) 유발.
- 권고: `revalidate`를 7일 이상 또는 ETL 트리거 기반 on-demand revalidation으로 전환. round3에서 지적됐으나 코드 변경 없음(미해소).

### F-5. [중간] 44MB JSON 텍스트 parse + `/**` 전역 트레이싱 — 바이너리/Int32Array (질문 5)
- 근거: read 151 + parse 246 = 397ms 콜드마다 강제. 수치 8컬럼(sidoIx,sgIx,dongIx,indIx,members,salary,turnover,score)×552,878 = **Int32Array로 16.9MB**(실측 계산). 바이너리(.bin typed array + 문자열풀 JSON)면 parse ~246ms를 view 생성 ~0으로 대체 가능(추정).
- `next.config.mjs` `outputFileTracingIncludes["/**"]`가 45MB를 **모든** 함수 번들에 포함 — `data.ts` 미사용 라우트(robots/sitemap 등)에도 45MB가 따라붙음. 데이터 의존 라우트로 한정 권고.
- 캐시 관점: `STATS_CACHE`(L117), `_idx`, `_topRisk`, `_awards`, `nameLc` 등 모듈 전역 캐시는 인스턴스 한정이라 콜드마다 재빌드 — F-2/F-5 비용은 인스턴스 수에 비례.

## 우선순위 권고
1. **(F-4) revalidate 상향 + on-demand revalidation** — 즉시·무위험. round3부터 미해소.
2. **(F-2) ensureIds 축소** — IDS 553k 일괄생성 제거, 역방향 Map만 첫요청 빌드 또는 결정적 id로 통일. 콜드 ~547ms 중 대부분 절감.
3. **(F-5) 바이너리/Int32Array 포맷** — parse ~246ms 제거 + `/**` 트레이싱 한정. 중기 과제.
4. **(F-3) vercel.json 메모리·maxDuration 명시** — 1024MB 선택 시 378MB+동시성 마진 검증.

## 측정/추정 구분
- **측정**: 모든 ms·MB·순회·정확성 수치(Node v22, 로컬, `lib/data.ts` 로직 모사 + 실데이터 552,878행, 300/2000 샘플).
- **추정**: Vercel 실런타임 절대치(콜드 디스크 I/O·CPU로 로컬보다 길 가능), 동시성 하 메모리 합산, parse 경계 피크, 바이너리 적용 후 parse 절감 폭(구현 의존).
