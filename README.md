# 좋소판별기 (jotsopan)

공개된 **국민연금 가입 사업장** 공공데이터로 전국 중소기업의 근무 여건 **위험도**를 추정·시각화하는 비영리 학습용 웹서비스. 원본 서비스(jotso.net)의 클론으로 시작해 핵심 기능을 모두 구현하고 일부는 그 이상으로 확장했다.

- **라이브**: https://jotsopan.vercel.app
- **저장소**: https://github.com/macklinkim/joatsopan
- **데이터 기준월**: 2026-04 (전국 활성 사업장 **552,878곳** 전수)

> ⚠️ 모든 수치는 공공데이터 기반 **추정치**이며 참고용. 특정 기업 비방 목적이 아님.

---

## 1. 기술 스택

| 영역 | 사용 |
|---|---|
| 프레임워크 | Next.js 15.5.19 (App Router), React 19 |
| 언어/스타일 | TypeScript, Tailwind CSS v3 |
| 차트 | 외부 라이브러리 없이 **SSR/CSR SVG 직접 생성** |
| OG 이미지 | `next/og` (Pretendard 폰트 번들) |
| 테스트 | Vitest (25개) |
| 린트 | ESLint 9 (flat config, `eslint-config-next`) |
| 배포 | Vercel (서버리스/Fluid) |
| 데이터 저장 | 빌드 산출물 `data/companies.json`(약 44MB)을 런타임 `fs`로 로드 (외부 DB 없음) |

---

## 2. 빠른 시작

```bash
npm install
npm run dev        # http://localhost:3000  (NODE_OPTIONS 불필요)
npm run build      # 프로덕션 빌드
npm run start      # 빌드 결과 실행
npm run lint       # eslint .
npm run test       # vitest run (25 tests)
```

> **주의**: `npm run dev`로 dev 서버가 떠 있는 동안 `npm run build`를 돌리면 `.next`가 충돌해 dev가 500을 낸다. 빌드 후에는 dev 서버를 재시작할 것.

---

## 3. 데이터 파이프라인 (ETL)

### 원본
국민연금공단 「국민연금 가입 사업장 내역」 — 공공데이터포털 파일데이터
`https://www.data.go.kr/data/15083277/fileData.do` (로그인 없이 다운로드, EUC-KR CSV, 약 115MB / 약 59만 행).
주요 컬럼(22개): 자료생성년월, 사업장명, 사업자등록번호(6자리 마스킹), 가입상태코드, 지번/도로명 주소, 법정동코드(시도/시군구/읍면동), 업종코드·명, 적용/탈퇴일, **가입자수, 당월고지금액, 신규취득자수, 상실가입자수**.

### 생성 절차
```bash
# 1) data.go.kr에서 최신 CSV 다운로드 → 아래 경로로 저장
#    data/raw/nps.csv   (gitignore 대상; 저장소에 커밋하지 않음)
# 2) ETL 실행 (EUC-KR 디코딩 → 점수계산 → 압축 JSON)
node --max-old-space-size=4096 scripts/etl.mjs
#    → data/companies.json 생성 (활성 552,878 + 휴폐업 200, 약 44MB)
```

### ETL이 하는 일 (`scripts/etl.mjs`)
1. EUC-KR 디코딩(`TextDecoder('euc-kr')`).
2. 활성(가입상태=1) 행 파싱, 완전중복(전체 22필드 동일) 행 제거.
3. 주소 파싱: 통합시(도+OO시+OO구)·세종 대응, 결측 시 **법정동 광역시도코드→현행 시도명** 폴백, 레거시 시도명(강원도→강원특별자치도 등) 통일.
4. 업종별 추정연봉 중앙값 산출.
5. 점수 계산(`lib/scoreCore.mjs` 공유) — 모든 회사 엔진 산출.
6. 인터닝(업종/시도/시군구/동 테이블화)으로 압축한 **컬럼형 JSON** 출력 + 휴폐업(탈퇴) 상위 200곳.

### 위험도 점수 엔진 (`lib/scoreCore.mjs` = 단일 출처)
- 추정 평균연봉(만원) = `당월고지금액 ÷ 가입자수 ÷ 0.09 × 12`
- 회전율(%) = `(신규+상실) ÷ 가입자수 × 100`
- 점수(0~100) = 직원수(100+ 0 / 30~99 8 / 30미만 16) + 연봉(업종중앙값 대비, 최대 35) + 회전율(20%↑ 가산, 최대 35) + 휴폐업(30)
- 등급: 0~19 희귀 중소 · 20~49 보통 · 50+ 좋소 확정

> `lib/score.ts`는 `scoreCore.mjs`의 타입 래퍼. ETL과 앱이 동일 로직을 공유한다.

---

## 4. 데이터 접근 계층 (`lib/data.ts`)

`data/companies.json`을 모듈 로드 시 1회 `fs`로 읽어 **컬럼형 배열**로 보유하고, **Company 객체는 질의 결과에만 지연 생성**(552k 전체를 객체화하지 않아 메모리 안전).

- 성능: `indexes()`가 시군구/법정동/업종별 인덱스를 **지연 1회** 빌드 → 상세·주변·순위가 전수 스캔 대신 그룹만 순회(약 96배 절감, 인덱스 결과는 전수스캔과 100% 일치 검증).
- `getCompany`용 stable id = `해시(사업장명+사업자번호+법정동) + 사업자번호`(중복 시 접미사).
- 주요 export: `searchCompanies`(이름+사업자번호, NFC/전각 정규화), `nearbyCompanies`(동→시군구→업종→전체 폴백), `regionRank`(시군구 내 위험도 순위), `salaryPercentile`(업종 내 연봉 백분위), `riskLadder`(위/아래 위험도 이웃, 동점 제외), `industryAvg`, `exploreCompanies`(필터), `topRiskCompanies`/`closedCompanies`/`awards`/`gamePool`, `DATA_YM`/`TOTAL_ACTIVE`.
- 월별 시계열(`getMonthlyStats`): **최근월 실측에 수렴하는 결정적 합성 곡선**(다개월 실데이터 부재 — §7 한계 참고). 화면에 "추정 곡선" 고지.

---

## 5. 화면/기능

| 경로 | 설명 |
|---|---|
| `/` | 검색(회사명/사업자번호, 자동완성·ARIA combobox) |
| `/company/[id]` | 회사 상세 — 위험게이지, 핵심지표 4종(+업종평균 맥락), SVG 차트 3종(호버/터치 툴팁·sr-only 표), **지역 위험도 순위**, **업종 내 연봉 백분위**, **위험도 사다리**, **갈아탈 만한 곳(2분화+배수)**, 주변추천, **공유(OG 카드)**, **비교 담기** |
| `/explore` | 기업 탐색 — 시도·위험등급·정렬 필터(네이티브 GET 폼) |
| `/compare?ids=` | **회사 비교**(2~4곳 나란히, 항목별 더 나은 값 강조, 공유 가능 URL) |
| `/monthly` | 이달의 좋소(위험도 상위) |
| `/memorial` | 별이 된 좋소(휴·폐업 신호) |
| `/awards` | 좋소 시상식(부문별 1위, 중립 라벨) |
| `/game` | 좋소 게임(지표 보고 좋소 여부 맞히기) |
| `/about` | 이용 안내·데이터 출처·추정 방식·면책 |
| `robots.txt` / `sitemap.xml` | 실명 상세(`/company/`)·`/api/` 색인 제외, 그 외 허용 |

원본 대비 **초과 구현**: 지역 위험도 순위, 업종 연봉 백분위, 기업 탐색 필터, 위험도 사다리, 회사 비교, OG 공유 카드.

---

## 6. 배포 (Vercel)

```bash
vercel --prod --yes      # 프로덕션 배포 (이미 link/login 되어 있음)
```
- `next.config.mjs`의 `outputFileTracingIncludes`로 `data/companies.json`·OG 폰트를 함수 번들에 포함.
- `.vercelignore`로 `data/raw`(원본 CSV)·스크린샷·`docs/review` 제외.
- 보안 헤더(nosniff/X-Frame-Options/Referrer-Policy/Permissions-Policy) 적용.
- 회사 상세는 ISR(`revalidate = 604800`, 히어로 8곳만 SSG·나머지 동적).

### ✅ 배포 후 검증 규칙 (중요)
히어로(상위 8곳)만 빌드 시 정적 생성되므로 **반드시 비-히어로(동적) 회사 URL**과 `/company/<id>/opengraph-image`의 200을 확인할 것. (과거 OG 폰트 모듈-최상위 `fs` 호출이 동적 함수만 500나게 한 잠복 버그를 히어로만 테스트해 놓친 적 있음.)

---

## 7. 알려진 한계 / 미완

1. **레이트리밋**: `middleware.ts`의 인메모리 토큰버킷은 Vercel 다중 엣지 인스턴스에서 카운터가 분산돼 **실효 없음**. 실제 방어는 **Vercel KV/Upstash 등 공유 스토어(키 필요)** 가 있어야 함.
2. **월별 추이는 합성**: data.go.kr이 **최신월 파일만** 제공(과거월 버전 없음, OpenAPI는 serviceKey 필요)해 진짜 다개월 시계열을 못 만든다. 현재는 최근월 실측 기반 추정 곡선 + 화면 고지. → "그때 vs 지금" 류 서사는 보류.
3. 추정 연봉은 국민연금 기준소득월액 상한 때문에 고연봉 구간이 과소평가될 수 있음(about에 명시).
4. 사업자등록번호는 공공데이터 특성상 6자리만 표기(고유 식별 불가).
5. 일부(약 109곳) 주소 결측 → 시도만 코드 폴백, 시군구/동은 미상.

---

## 8. 디렉터리 구조

```
app/
  page.tsx                     홈(검색)
  company/[id]/
    page.tsx                   회사 상세 (+generateMetadata, ISR)
    opengraph-image.tsx        OG 카드 (Pretendard)
    error.tsx                  라우트 에러 바운더리
  explore|compare|monthly|memorial|awards|game|about/page.tsx
  api/search/route.ts          검색 API
  robots.ts | sitemap.ts | layout.tsx | globals.css
components/                    NavBar, Footer, SearchBox, RiskGauge,
                               LineChart, HireLeaveChart, chartTooltip, MetricCard,
                               NearbyList, CompanyRankList, GuessGame,
                               ShareButton, CompareButton, CompareTray, useChartWidth
lib/
  data.ts                      데이터 접근 계층(컬럼형+인덱스+지연객체)
  scoreCore.mjs                점수 엔진(SSOT) / score.ts(타입 래퍼)
  format.ts | types.ts
  score.test.ts | data.test.ts (vitest, 25)
scripts/etl.mjs                CSV→companies.json ETL
data/companies.json            가공 데이터(커밋됨, ~44MB)
data/raw/nps.csv               원본 CSV(gitignore)
middleware.ts                  /api 레이트리밋(인메모리, best-effort)
docs/review/                   자율 점검 4라운드 × 10관점 = 40개 보고서 + SUMMARY
PROGRESS.md                    구현 진행 로그
```

---

## 9. 품질/검증 이력

- `docs/review/`에 **4라운드 × 10개 서브에이전트 교차검증**(총 40 보고서). 라운드4 판정: **원본 핵심기능 이상 달성, P0(치명) 0건.**
- 매 배포마다 프로덕션 비-히어로 동적 URL·OG·검색을 실측 검증.
- Vitest 25개(점수 엔진 경계, 데이터 접근 불변식), ESLint 0건.

---

## 10. 핸드오프 메모

- **데이터 갱신**: data.go.kr에서 새 월 CSV를 `data/raw/nps.csv`로 받고 `node --max-old-space-size=4096 scripts/etl.mjs` 재실행 → 커밋 → `vercel --prod`. `lib/data.ts`의 `DATA_YM`은 ETL 산출 JSON에서 자동 반영.
- **데이터 접근 함수는 `lib/data.ts`에 격리**돼 있어, 향후 실제 DB(예: Supabase/Postgres)로 옮길 때 이 파일의 쿼리 구현만 비동기로 교체하면 됨(소비 페이지는 이미 서버 컴포넌트).
- **다음 우선순위 후보**: (1) Vercel KV로 레이트리밋 실효화, (2) 다개월 실데이터 확보 시 진짜 시계열·"그때 vs 지금", (3) OG 카드 톤 중립화·정정 창구.

---

— 공공데이터 기반 학습용 프로젝트. 데이터 출처: 국민연금공단(공공데이터포털).
