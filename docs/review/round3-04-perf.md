# Round3-04 — 성능·콜드스타트·확장성 @552k

대상: `jotsopan` (Next.js 15 App Router). 데이터 계층 전부 `lib/data.ts` 컬럼형 인메모리.
점검 일자: 2026-06-20. 데이터: `data/companies.json` (디스크 45.3MB / UTF-8 문자열 ~33MB), 활성 552,693 + 휴폐업 200 = 552,893곳.
실측: `node`로 `lib/data.ts` 로직을 그대로 모사(parse/ensureIds/스캔 latency·RSS). 로컬 환경 기준 절대치이며 Vercel 런타임과는 다를 수 있음(상대 구조는 동일). 측정값과 추정을 구분 표기.

## 점검 범위

1. 회사 상세 1요청의 누적 스캔/메모리 비용, ensureIds 552k 일괄 빌드의 콜드스타트 영향
2. Vercel 함수 메모리 한도 대비 여유 (44MB parse 피크 + ensureIds + nameLc)
3. 사전 인덱스(시군구→목록, 업종→목록, 점수 정렬배열) 도입 시 절감 효과 정량
4. ISR `revalidate`가 동적 회사에 실제 적용되는지, 값 적정성
5. 번들 경량화 (Int32Array / 바이너리)

## 실측 결과 (Node v22, lib/data.ts 로직 모사)

### 콜드스타트(모듈 평가) 구간 분해

| 단계 | 시간(실측) | 비고 |
|---|---|---|
| `readFileSync(utf8)` | ~150ms | 45MB 디스크 → ~33MB 문자열(UTF-16 내부표현 ~67MB) |
| `JSON.parse` | ~396ms | 컬럼 배열 역직렬화 |
| `ensureIds()` (552k djb2 해시 + Map) | ~410ms | **지연** — 모듈 로드 시점엔 실행 안 됨 |
| `nameLc` (552k `toLowerCase`) | ~80ms | **지연** — 첫 검색 시점에만 |

- **모듈 top-level 강제 실행분** = read + parse ≈ **~546ms** (콜드 인스턴스마다 무조건).
- `HERO_IDS`(L96)는 `baseId`를 쓰므로 `ensureIds`를 트리거하지 않음 → **ensureIds는 진짜 지연**이다(round2 시점의 eager 결함은 해소됨, 확인). `getCompany`/`nearby`/`regionRank`/`salaryPercentile`가 모두 `ensureIds`를 호출하므로, **회사 상세 첫 요청에서 ~410ms가 한 번 동기 지불**되고 이후 인스턴스 수명 내내 캐시된다.

### 메모리 (RSS, 실측)

| 시점 | RSS | 비고 |
|---|---|---|
| parse 직후 | ~240MB | 컬럼 데이터 정착 |
| ensureIds 후 | +55MB | IDS 배열 552k + Map 552k 엔트리 |
| nameLc 후 | +13MB | 소문자 문자열 552k |
| **정착치** | **~253MB** | 세 캐시 모두 채워진 상태 |
| parse 경계 **일시 피크** | **~197MB**(base 대비) | string(~67MB) + 파싱결과 동시 생존, GC 전 |

### 회사 상세 1요청 누적 스캔 비용 (핵심 질문 1)

`getCompany` + `getMonthlyStats`(O(14), 캐시) + `nearbyCompanies`(최대 4 tier 풀스캔) + `regionRank`(1 풀스캔) + `salaryPercentile`(1 풀스캔).

- **실측 일반 케이스**(nearby가 tier-1=동에서 해소): **3×NA = 1,658,079 순회 / ~5.4ms**.
- **실측 최악 케이스**(nearby가 `all`까지 추락): **6×NA = 3,316,158 순회 / ~9.1ms**.
- 첫 요청엔 여기에 `ensureIds` ~410ms + (검색 경유 시) `nameLc` ~80ms가 1회 가산.

→ warm 상태에선 한 자릿수 ms로 **현재 절대 성능은 양호**. 문제는 (a) 콜드 첫 요청의 ~410ms 점프, (b) **단일 요청이 1.6~3.3M회 컬럼 순회 + companyAt별 riskScore 재계산**을 하는 구조적 낭비 — 동시성·트래픽 증가 시 CPU 선형 누적.

## 발견 (심각도 / 근거)

### F-1. [중간] 회사 상세 요청당 1.6~3.3M회 풀스캔 — 사전 인덱스로 ~100배 절감 (질문 3)

- 근거: `nearbyCompanies`(L175-192) tier별 `collect`가 매번 `for j<NA`, `regionRank`(L243) `salaryPercentile`(L267) 각 1회 NA 풀스캔. 실측 일반 5.4ms / 최악 9.1ms.
- **인덱스 도입 실측**: `byDong`(Map, 14,075그룹) + `bySg`(270) + `byInd`(1,575) 1회 빌드 **~112ms / +16MB**. 이후 상세 요청은 해당 그룹만 순회 → 평균 **touched 17,237건 / ~0.98ms**(샘플 7개), 최악 그룹도 ~2.4ms.
  - 순회량: 1,658,079 → 17,237 (**~96배 감소**), latency 5.4ms → ~1ms (**~5배**).
- 추가로 `nameLc`는 검색 1회 캐시되나, **검색 자체도 `byDigit`/n-gram 인덱스가 없어 NA 풀스캔**(L156). 명칭 prefix 인덱스 또는 사업자번호 Map을 별도 빌드하면 검색도 그룹 조회로 전환 가능.
- 권고: 모듈 로드 후가 아니라 **첫 상세/탐색 요청 시 지연 빌드**(콜드 모듈로드 가산 회피). 인덱스 16MB는 메모리 여유 범위.

### F-2. [중간] 탐색(explore)·topRisk 풀스캔+정렬 — 점수 정렬배열 1개로 대체 (질문 3)

- 근거: `exploreCompanies`(L213-229)는 매 요청 `for i<NA` 필터 후 `idx.sort`. 실측 **풀스캔+정렬 ~68ms/요청**.
- 대안: 모듈/지연으로 **점수 내림차순 정렬 인덱스(`Int32Array`) 1회 빌드 ~81ms**, 이후 sido/grade 필터는 정렬 순서 유지하며 limit까지만 훑으면 O(limit~수백). 정렬 비용이 요청당 → 1회로 상각.
- `topRiskCompanies`(L281)는 이미 `_topRisk` 캐시가 있어 양호. explore가 미캐시인 점이 비대칭.

### F-3. [낮음→중간] 메모리 ~253MB 정착 — Vercel 1.7GB 한도엔 여유, 1024MB·동시성에선 주의 (질문 2)

- 근거: 실측 정착 RSS ~253MB(데이터 240 + ids/map 55 + nameLc 13, GC로 일부 상쇄되어 합산보다 낮음). parse 경계 일시 피크 base+197MB.
- 평가: **기본 ~1.7GB 한도 초과 위험은 낮다**(단일 인스턴스 기준). 단 ① 함수 메모리를 1024MB로 낮추면 parse 피크+인덱스+동시 요청 버퍼에서 마진이 얇아짐, ② Vercel은 인스턴스별 독립 메모리라 콜드 N개면 각각 ~253MB를 따로 확보(비용·동시성 한계). `vercel.json` 부재로 메모리/`maxDuration` 미설정 — 기본값 의존(추정).

### F-4. [높음] ISR는 동작하나 첫 방문 회사마다 콜드 풀 비용 — revalidate=86400은 데이터 주기(월간) 대비 과소 (질문 4)

- 근거: `generateStaticParams`(L15)는 HERO 8개만 사전 생성. `export const revalidate = 86400`(L18), `dynamicParams` 미지정(기본 `true`) → **나머지 552k는 요청 시 on-demand 렌더 후 ISR 캐시**된다. 즉 ISR는 정상 적용되나, **각 회사 첫 방문 1회는 풀 비용(스캔+필요시 ensureIds)을 지불**하고 그 결과가 24h 캐시.
- 부정합: 원천 데이터는 **월 단위**(`ym=2026-04`)로만 갱신되는데 revalidate가 1일이라, 데이터 무변경 구간에도 매일 1회 stale 재생성(불필요한 재계산) 발생. 반대로 회사 수가 552k라 **캐시 항목 폭증** 가능.
- 권고: `revalidate`를 데이터 주기에 맞춰 상향(예: 7일 또는 ETL 트리거 기반 on-demand revalidation). 콜드 첫방문 비용은 F-1 인덱스로 완화.

### F-5. [중간] 44MB JSON 번들 + 텍스트 parse — 바이너리/Int32Array로 경량화 (질문 5)

- 근거: `next.config.mjs` `outputFileTracingIncludes`로 `data/companies.json`(45MB)을 `/**` 전 함수 번들에 포함. 콜드마다 ~33MB 문자열 read + ~396ms parse.
- 정량: 수치 컬럼 8종(`sidoIx,sgIx,dongIx,indIx,members,salary,turnover,score`) × 552k는 **Int32Array로 ~16.9MB**(실측 계산). 현재 JSON 텍스트로는 동일 데이터가 자릿수×문자로 수십 MB. 바이너리 포맷(예: 컬럼별 typed array를 단일 `.bin`으로 직렬화 + 문자열 풀만 JSON)이면 ① parse ~396ms → typed array view는 거의 0(메모리 매핑/슬라이스), ② 번들/문자열 메모리 절감.
- 추가: `/**` 전역 포함이라 `data.ts`를 import하지 않는 라우트(정적 자산 등)에도 45MB가 따라붙음 — 트레이싱을 데이터 의존 라우트로 한정 권고.

## 우선순위 권고

1. **(F-4) revalidate 상향 + on-demand revalidation** — 즉시, 무위험. 월간 데이터에 1일 재생성은 낭비.
2. **(F-1/F-2) 지연 사전 인덱스**(byDong/bySg/byInd + 점수 정렬 Int32Array) — 첫 요청 시 빌드 ~112ms+~81ms/+16MB로 상세 ~96배·explore 정렬 1회 상각. 콜드 모듈로드엔 미가산.
3. **(F-5) 바이너리/Int32Array 데이터 포맷** — parse ~396ms 제거 + 번들 경량화. 구조 변경 비용 큼, 중기 과제.
4. **(F-3) `vercel.json`으로 함수 메모리·maxDuration 명시** — 1024MB 선택 시 피크 마진 검증 후.

## 측정/추정 구분

- **측정**: 모든 ms·MB·순회 횟수(Node v22, 로컬, `lib/data.ts` 로직 모사 + 실 데이터 552,693행).
- **추정**: Vercel 실런타임 절대치(콜드 디스크 I/O·CPU로 로컬보다 길 가능성), 동시성 하 메모리 합산, 바이너리 포맷 적용 후 parse 절감 폭(구현 의존).
