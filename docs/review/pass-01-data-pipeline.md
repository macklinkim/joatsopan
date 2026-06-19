# Pass 01 — 실데이터 파이프라인(M9) 점검

점검일: 2026-06-20 · 점검 모델: Opus 4.8 · 관점: 국민연금 CSV → ETL → Supabase → 데이터레이어

## 점검 범위

- `lib/data.ts` (데이터 접근 함수 8종 + 인메모리 생성기)
- `lib/types.ts`, `lib/score.ts` (도메인 타입·점수 엔진)
- `app/api/search/route.ts`, `app/api/nearby/route.ts` (API 라우트)
- `app/company/[id]/page.tsx`, `app/monthly|memorial|awards|game/page.tsx` (소비 측)
- `작업계획서.md` §1·§5·§6·§7·§8 (CSV 매핑·스키마·ID·ETL·쿼리 설계)
- `PROGRESS.md` (M9 상태 주장), `package.json` (의존성)
- 부재 확인: `scripts/` `etl/` `migrations/` `supabase/` 디렉터리, `.env*` 파일 — **전부 없음**(Glob 결과 No files found)

결론 한 줄: **파이프라인은 0% 구현. 더 나쁜 건, "추상화돼 있어 교체만 하면 된다"는 PROGRESS.md(25행)의 주장이 코드상 거짓이라는 점.** 지금 구조로는 Supabase 전환 시 데이터레이어 전 함수 시그니처와 모든 소비 페이지를 동시에 뜯어고쳐야 한다.

---

## 발견

### High

**H1. 데이터 접근 함수가 전부 동기(sync) — DB 전환 시 시그니처 파괴는 확정적.**
`lib/data.ts`의 `getCompany`(329), `getMonthlyStats`(382), `searchCompanies`(387), `nearbyCompanies`(404), `topRiskCompanies`(427), `closedCompanies`(434), `awards`(446), `gamePool`(465) 모두 동기 반환. 소비 측도 동기 호출에 의존한다:
- `app/awards/page.tsx:8` `const winners = awards();`
- `app/monthly/page.tsx:7` `const items = topRiskCompanies(20);`
- `app/game/page.tsx:7` `const pool = gamePool(12);`
- `app/company/[id]/page.tsx:24,27,31` `getCompany(id)` / `getMonthlyStats(id)` / `nearbyCompanies(id, 10)` 모두 await 없음.

Supabase(`supabase-js` 또는 Postgres 풀러)는 본질적으로 비동기다. 전환하는 순간 8개 함수가 전부 `Promise`를 반환하게 되고, 위 5개 페이지·2개 API가 전부 `await`로 바뀌어야 한다. PROGRESS.md 25·29행의 "교체만 하면 됨"은 **사실이 아니다.** 추상화의 핵심은 비동기 경계를 미리 그어두는 것인데 그게 안 돼 있다.

**H2. 데이터 소스 인터페이스가 없다 — 인메모리와 DB가 같은 계약을 공유하지 않는다.**
`lib/data.ts`는 모듈 로드 시점에 `COMPANIES`(326), `COMPANY_BY_ID`(328), `STATS_BY_ID`(335) 전역 상수를 즉시 생성하고, 함수들은 이 전역을 직접 `filter/sort/slice` 한다(예: 검색 390-392, nearby 410-413, topRisk 428-430). 즉 "데이터 접근"과 "인메모리 구현"이 한 파일에 융합돼 있다. 교체 대상이 될 `DataSource` 인터페이스(포트)가 정의돼 있지 않아, Supabase 구현을 끼워 넣을 자리 자체가 없다.

**H3. 파생 지표가 요약값에서 역생성된다 — 실데이터 시계열과 양립 불가.**
계획서 §4(160행)·§7은 "점수·회전율·추정연봉은 ETL 단계에서 미리 계산해 저장"이 원칙이다. 그런데 현재 `monthly_stats`에 해당하는 시계열은 **거꾸로** 만들어진다: `lib/data.ts:337-380`이 `c.cur_members`/`c.cur_salary`/`c.cur_turnover`(요약값)에서 과거 14개월을 노이즈로 합성한다(343-366행). 실데이터에서는 인과가 반대다 — 월별 원본 행(`JNNGP_CNT`/`NW_ACQZR_CNT`/`LSS_JNNGP_CNT`/`CRRMM_NTC_AMT`)이 1차 사실이고, `cur_*`는 최신월에서 집계된 2차 요약이다. 지금 코드는 실데이터가 들어오면 통째로 폐기된다. "추상화"가 아니라 단순 목업이다.

**H4. `industry_median`이 데이터에 하드코딩 — ETL 재계산 테이블과 충돌.**
계획서 §5(209행)·§7-5단계는 `industry_median` 테이블을 매월 `est_salary` 중앙값으로 **재계산**하도록 설계했다. 그러나 코드에선 중앙값이 업종 상수로 박혀 있다(`GEN_INDUSTRY` 251-267, 각 항목 `median` 필드; 시드도 `median:` 직접 지정 99·133행 등). `Company.industry_median`(types.ts:32)은 회사 행에 박제돼 있어, 실데이터에서 매월 변동하는 중앙값을 반영할 구조가 없다. 점수 엔진(`score.ts:12-13`)이 이 값을 직접 받으므로, 중앙값 테이블이 없으면 연봉 점수가 고정된 가짜 기준으로 계산된다.

**H5. 자체 stable ID 생성 규칙 미구현 — 시계열 연속성의 근간이 없다.**
계획서 §6(218-225행)은 `id = base36(hash(정규화회사명 | biz_no6 | 법정동코드))`로, "월이 바뀌어도 같은 사업장은 같은 ID"를 보장하도록 못 박았다. 코드의 ID는 정반대다: `genSeeds`(297행)가 `String(100000000000 + Math.floor(rnd()*899999999999))` — **난수**다. 시드 8개사도 임의 문자열 ID(`"shininglion"` 등). 해시 기반 결정적 ID 함수가 존재하지 않으므로, CSV를 두 달치 적재하면 같은 회사가 매월 다른 ID로 들어와 시계열이 끊긴다. 이건 ETL의 가장 중요한 1줄인데 통째로 빠졌다.

### Med

**M1. 검색 전략이 `O(n)` 풀스캔 — 인덱스/pg_trgm 부재.**
`searchCompanies`(390)는 `COMPANIES.filter(...includes...)`. 500건이라 지금은 무해하나, jotso.net급 수십만 건에선 페이지마다 풀스캔이다. 계획서 §3(136행)은 `ILIKE + pg_trgm` 인덱스를 명시했는데, 그 전략을 검증할 마이그레이션·인덱스 정의가 코드에 없다. 스키마(§5 190-194행)에는 인덱스 DDL이 있으나 `pg_trgm` GIN 인덱스(부분일치 가속의 핵심)는 빠져 있다 — `idx_companies_name`은 B-tree라 `ILIKE '%q%'`를 못 탄다.

**M2. 휴·폐업 판정 로직이 ETL이 아니라 난수 — 원본 신호 미사용.**
`is_closed`가 `genSeeds`(317행)에서 `rnd() < 0.03`으로 무작위 결정된다. 계획서 §2.5·§7-7단계는 `WKPL_JNNG_STCD`(가입상태코드)/`VLDT_VL_KRN_NM`(상태 한글명)/탈퇴일자(`RRG_DT`)·전월 대비 `JNNGP_CNT=0` 급락으로 판정하도록 설계했다. 원본 CSV 컬럼을 읽어 판정하는 코드가 전무하다. `closedCompanies`(434)·`memorial` 화면이 의미 없는 난수에 의존 중.

**M3. nearby 다단계 폴백이 인덱스 1개로 커버 안 됨.**
`nearbyCompanies`(409-414)는 동→시군구→업종→전체 4단 폴백을 메모리에서 순차 시도한다. 계획서 §5(194행)의 부분 인덱스 `idx_companies_nearby(bdong_code, cur_salary DESC) WHERE cur_members > 5`는 1단계(동)만 가속한다. 시군구/업종 폴백용 인덱스가 스키마에 없어, DB 전환 시 폴백 단계가 풀스캔이 된다. 또한 4단 폴백을 SQL로 옮기면 라운드트립 4회가 될 수 있어, `UNION ALL` + 우선순위 컬럼 단일 쿼리 또는 RPC로 묶는 설계가 필요한데 그 고려가 없다.

**M4. `awards`/`topRisk`/`gamePool`이 전수 정렬 — 대량 데이터에서 비효율.**
`awards()`(446-462)는 전체를 여러 번 `sort`하고, `gamePool`(465)은 전체를 셔플 후 자른다. 수십만 건에선 매 요청마다 전량 로드가 불가능하다. 이들은 DB에서 `ORDER BY ... LIMIT` 또는 사전계산된 랭킹 뷰/머티리얼라이즈드 뷰로 가야 하는데, 데이터레이어가 "전체 배열을 들고 있다"는 전제에 묶여 있어 그 전환 경로가 막혀 있다.

**M5. 주소→법정동코드 추출 단계 부재.**
계획서 §7-3은 "주소에서 `bdong_code`·`dong` 추출"을 ETL 핵심 단계로 둔다. CSV는 `LDONG_ADDR_MGPL_DG_CD`/`SGGU_CD`/`SGGU_EMD_CD` 같은 분할 코드를 주는데, 이를 표준 10자리 법정동코드로 합성하는 매핑 함수가 없다. 현재는 `bdong`을 시드에 직접 박았다(57·77행 등). 주변추천의 매칭 키 정확도가 ETL 품질에 100% 달려 있는데, 그 단계가 설계만 있고 코드가 없다.

### Low

**L1. `last_ym`/`LAST_YM`이 코드 상수(15행) — 데이터에서 파생되지 않음.** 실데이터에선 적재된 최신 `DATA_CRT_YM`에서 와야 한다.

**L2. 점수 엔진은 재사용 가능하나 입력 계약이 약하다.** `score.ts`의 `riskScore`/`estSalary`/`turnover`는 순수 함수라 ETL에서 그대로 재사용 가능(좋음). 다만 `estSalary`(39행) 단위 환산(만원)이 데이터레이어 밖에 흩어져 있어, ETL과 화면이 같은 함수를 공유하는지 강제하는 장치가 없다.

**L3. `package.json`에 DB/CSV 의존성 0개.** `supabase-js`, `csv-parse`, `iconv-lite`(EUC-KR 변환, 계획서 §7-2) 전부 미설치. 파이프라인 착수 흔적조차 없음.

---

## 구체적 개선안

원칙: **포트-어댑터로 비동기 경계를 먼저 긋고, 인메모리/Supabase를 같은 계약 뒤에 둔다.** 그러면 PROGRESS.md의 주장("교체만")이 비로소 참이 된다.

### 1. `lib/datasource.ts` — 포트(인터페이스) 신설

```ts
// lib/datasource.ts
import type { Company, MonthlyStat } from "./types";
import type { NearbyResultSet } from "./data";
import type { AwardWinner } from "./data";

export interface DataSource {
  getCompany(id: string): Promise<Company | undefined>;
  getMonthlyStats(id: string): Promise<MonthlyStat[]>;
  searchCompanies(q: string, limit?: number): Promise<Company[]>;
  nearbyCompanies(id: string, limit?: number): Promise<NearbyResultSet>;
  topRiskCompanies(limit?: number): Promise<Company[]>;
  closedCompanies(limit?: number): Promise<Company[]>;
  awards(): Promise<AwardWinner[]>;
  gamePool(n?: number): Promise<Company[]>;
  heroIds(): Promise<string[]>;
}

// 환경변수로 구현 선택. SUPABASE_URL 있으면 DB, 없으면 인메모리.
export function getDataSource(): DataSource {
  return process.env.NEXT_PUBLIC_SUPABASE_URL
    ? require("./datasource.supabase").supabaseSource
    : require("./datasource.memory").memorySource;
}
```

핵심: **지금 당장 전 함수를 `async`로 바꾼다**(인메모리여도 `Promise.resolve`로 감싸서). 그래야 소비 측 페이지가 `await`로 미리 정착하고, 나중 DB 전환이 무손상이 된다. 이 변경이 H1·H2를 동시에 해소한다.

### 2. 소비 측 정착 (H1 마무리)

- `app/awards/page.tsx:8` → `const winners = await getDataSource().awards();`
- `app/monthly/page.tsx:7` → `await ... .topRiskCompanies(20)`
- `app/game/page.tsx:7` → `await ... .gamePool(12)`
- `app/memorial/page.tsx:7` → `await ... .closedCompanies(40)`
- `app/company/[id]/page.tsx:24·27·31` → 셋 다 `await`. `generateStaticParams`(14)도 `await getDataSource().heroIds()`.
- `app/api/search/route.ts:6`·`app/api/nearby/route.ts:6` → 핸들러를 `async`로, 내부 `await`.

기존 `lib/data.ts`는 `datasource.memory.ts`로 이름만 바꿔 `memorySource: DataSource`로 래핑(본문 로직 유지, 반환을 `Promise.resolve`).

### 3. Supabase 어댑터 `lib/datasource.supabase.ts`

```ts
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export const supabaseSource: DataSource = {
  async getCompany(id) {
    const { data } = await sb.from("companies").select("*").eq("id", id).single();
    return data ?? undefined;
  },
  async searchCompanies(q, limit = 10) {
    // pg_trgm: name ILIKE 가속 + 유사도 정렬. members 내림차순은 보조.
    const { data } = await sb.from("companies")
      .select("*").ilike("biz_name", `%${q}%`)
      .order("cur_members", { ascending: false }).limit(limit);
    return data ?? [];
  },
  async nearbyCompanies(id, limit = 10) { /* RPC 호출 — 아래 4. 참조 */ },
  // ...
};
```
서버리스 커넥션 고갈 방지를 위해 계획서 §3대로 **Connection Pooler(6543, transaction mode)** URL 사용. `supabase-js`는 PostgREST(HTTP)라 풀러 문제는 적지만, Postgres 직결(`pg`)을 쓸 경우 반드시 풀러 경유.

### 4. nearby 4단 폴백을 단일 RPC로 (M3)

라운드트립 4회를 막기 위해 Postgres 함수로:
```sql
CREATE FUNCTION nearby(p_id text, p_limit int) RETURNS SETOF companies AS $$
  WITH me AS (SELECT * FROM companies WHERE id = p_id)
  SELECT c.* FROM companies c, me
  WHERE c.id <> me.id AND c.cur_members > 5 AND c.is_closed = 0
  ORDER BY
    (c.bdong_code = me.bdong_code) DESC,
    (c.sigungu   = me.sigungu)    DESC,
    (c.industry_code = me.industry_code) DESC,
    c.cur_salary DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;
```
스코프 라벨(dong/sigungu/...)은 1위 행과 `me`의 일치 여부로 역산. 인덱스는 §5 부분 인덱스에 더해 `(sigungu, cur_salary DESC)`, `(industry_code, cur_salary DESC)` 추가.

### 5. 스키마 보강 (M1 — pg_trgm)

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_companies_name_trgm ON companies USING gin (biz_name gin_trgm_ops);
```
기존 §5의 `idx_companies_name`(B-tree)은 `%q%`를 못 타므로 trgm GIN으로 교체. RLS는 계획서 §3(138행)대로 `anon` SELECT 전용, 쓰기는 `service_role`(ETL)만.

### 6. ETL 스크립트 `scripts/etl.ts` (H3·H4·H5·M2·M5 해소)

처리 순서(계획서 §7 + 결손 보강):
1. **stable ID 함수 신설** `lib/companyId.ts` (H5):
```ts
import { createHash } from "crypto";
export function companyId(name: string, bizNo6: string, bdongCode: string): string {
  const norm = name.replace(/주식회사|\(주\)|\s+/g, "");
  const h = createHash("sha1").update(`${norm}|${bizNo6}|${bdongCode}`).digest();
  return BigInt("0x" + h.subarray(0, 6).toString("hex")).toString(36);
}
```
   `genSeeds`(297행)의 난수 ID·시드의 임의 문자열 ID를 전부 이 함수로 교체.
2. **CSV 파싱**: `csv-parse` + `iconv-lite`로 EUC-KR→UTF-8(§7-2). 컬럼 매핑은 §1 매핑표 그대로(`JNNGP_CNT`→members, `NW_ACQZR_CNT`→hires, `LSS_JNNGP_CNT`→leaves, `CRRMM_NTC_AMT`→notice_amt).
3. **법정동코드 합성** `lib/bdong.ts` (M5): `LDONG_ADDR_MGPL_DG_CD`+`SGGU_CD`+`SGGU_EMD_CD` → 10자리 표준 법정동코드. `sido`/`sigungu`/`dong`은 코드→명 매핑 테이블(행정표준코드) 조인.
4. **monthly_stats upsert**: `est_salary = estSalary(notice_amt, members)`, `turnover = turnover(hires, leaves, members)` — `score.ts` 함수 그대로 재사용(L2 해소: ETL과 화면이 동일 함수 공유).
5. **industry_median 재계산** (H4): 적재 후 `INSERT INTO industry_median SELECT industry_code, percentile_cont(0.5) WITHIN GROUP (ORDER BY est_salary) FROM monthly_stats JOIN ... GROUP BY industry_code`. `Company.industry_median` 박제 제거, 점수 계산 시 조인.
6. **휴폐업 판정** (M2): `WKPL_JNNG_STCD`/탈퇴일자 + 전월 대비 `members=0` 급락. `genSeeds`의 `rnd()<0.03`(317행) 제거.
7. **위험도 사전계산**: `riskScore(...)` → `companies.risk_score/contrib` upsert.

ETL은 멱등 upsert(`ON CONFLICT (id) DO UPDATE`, monthly는 `(company_id, ym)`)로, 월 1회 GitHub Action 배치(계획서 §3·§4).

### 7. `awards`/`gamePool` 대량화 (M4)

`awards`는 부문별 `ORDER BY ... LIMIT 1` 쿼리 5개(또는 단일 RPC). `gamePool`은 `ORDER BY random() LIMIT n` 또는 사전 추출 랭킹 뷰. 전량 메모리 로드 전제를 제거.

---

## 반성점 (솔직하게)

- **나는 "추상화돼 있다"는 PROGRESS.md(25행)의 자평을 의심하는 데서 시작했고, 그건 옳았다. 그러나 그 주장을 쓴 이전 작업의 자기기만이 더 근본 문제다.** "함수가 `lib/data.ts`에 격리돼 있으니 Supabase로 교체만 하면 된다"는 말은, 비동기 경계를 긋지 않은 동기 함수 8개를 두고는 성립하지 않는다. 격리(한 파일에 모음)와 추상화(계약 뒤로 숨김)를 혼동한 전형적 사례다. 점검자로서 나는 이 구분을 더 일찍, 더 단호하게 못 박았어야 했다.

- **점수 엔진(`score.ts`)이 순수 함수로 잘 분리돼 있다는 점은 제대로 칭찬하지 못할 뻔했다.** ETL에서 그대로 재사용 가능한 이 설계는 이 코드베이스에서 거의 유일하게 파이프라인 친화적인 부분인데, 결함 나열에 매몰돼 강점을 늦게 봤다. 균형을 잃을 뻔했다.

- **CSV 원본 인코딩(EUC-KR)·법정동코드 합성·행정표준코드 조인 같은 "지저분한 현실"을 개선안에서 한 번에 다 검증하지는 못했다.** 실제 공공데이터포털 CSV를 받아보지 않은 채 계획서의 컬럼명만 신뢰했다. `SGGU_EMD_CD`가 정말 5자리 읍면동 코드인지, 도로명/지번 주소가 둘 다 오는지는 실파일 1개를 받아 확인해야 하며, 그 전까지 §7-3 매핑은 가설이다. 이 점을 개선안에서 "표준코드 조인 필요"로만 적고 넘어간 것은 다소 무책임했다 — 실데이터 1개월분 확보가 M9의 진짜 첫 단추이고, 그게 없으면 위 ETL 설계도 책상 위 도면일 뿐이다.
