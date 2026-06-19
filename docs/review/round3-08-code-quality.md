# Round 3 — Pass 08: 코드 품질 / 테스트 / 데드코드 / 잔재 (SSOT 적용 후 재점검)

## 점검 범위

- `lib/scoreCore.mjs`(점수 SSOT), `lib/score.ts`(타입 래퍼), `scripts/etl.mjs`(SSOT 공유), `lib/data.ts`, `lib/format.ts`, `lib/types.ts`
- `lib/score.test.ts`(vitest 12종)
- `components/*`(LineChart, HireLeaveChart, useChartWidth, NearbyList, SearchBox …)
- `app/company/[id]/page.tsx`, `app/api/nearby/route.ts`, `app/api/search/route.ts`, `app/explore/page.tsx`
- 빌드/품질 설정: `package.json`, `tsconfig.json`
- 관점: **코드품질·테스트·데드코드·잔재**

모든 지적은 코드 Read·파일시스템 확인에 근거한다. 추가로 `npx vitest run`을 **실제 실행**해 12/12 통과를 확인했다(아래).

## 이전 라운드(Round 2) 대비 변화 요약

| 이전 지적 | 현 상태 | 근거 |
|---|---|---|
| 점수 공식 `score.ts`/`etl.mjs` 이중 복붙 (높음·최우선) | **해소** | `lib/scoreCore.mjs`가 SSOT. `score.ts:2`가 `import * as core`, `etl.mjs:5`가 `import { riskScore … } from "../lib/scoreCore.mjs"`. 공식은 이제 한 곳 |
| 테스트 0건 | **12종 추가** | `lib/score.test.ts`, `package.json:10` `"test": "vitest run"`, `node_modules/.bin/vitest` 존재. 실행 결과 `Tests 12 passed` |
| 차트 textWidth/Tooltip 복붙 | **그대로** | `LineChart.tsx:158-176` ↔ `HireLeaveChart.tsx:128-146` |
| `/api/nearby` 데드코드 | **그대로 데드** | 호출처 0건(아래) |
| eslint/prettier 미설치 | **여전히 미설치** | `package.json`에 없음, `.bin`에 eslint/prettier 없음 |
| `JSON.parse as Dataset`·fs 무방비 | **그대로** | `data.ts:18-20` |
| `as RiskLabel` 단언 | **그대로(+1곳 늘어남)** | `data.ts:83`, `score.ts:13` |
| **(신규)** 진단용 try/catch+console.error | — | `page.tsx:43,207-212` 영구 잔존 |

## 발견

### (1) SSOT 적용 후 남은 중복 — 추출안

점수 공식 중복은 사라졌으나 **차트와 nearby 매핑 두 군데가 미해소로 남았다.**

**1-A. 차트 `textWidth` + 툴팁 컴포넌트 복붙 (중간)**
`LineChart.tsx`의 `textWidth`(L158-160) + `LineTooltip`(L162-176) ↔ `HireLeaveChart.tsx`의 `textWidth`(L128-130) + `Tooltip`(L132-146). `textWidth`는 CJK 상수(`0x2e80`/`13`/`7.4`)까지 **글자 단위로 동일**. 툴팁 SVG는 위 마진(`y-h-10` vs `y-h-8`) 한 줄만 다르고 rect/circle/text 좌표(`+28`, `h=26`, `cx+11`, `r=4`, `x+20`, `fontSize=12.5`)가 전부 같다.
- 추출안: `components/chart/chartUtils.ts`에 `textWidth(s)` 1개, `components/chart/ChartTooltip.tsx`에 공용 `<ChartTooltip x y label color W offset={10} />`. 마진은 prop. `useChartWidth.ts`가 이미 공용 훅으로 잘 분리돼 있으니 동일 컨벤션.

**1-B. nearby `Company → NearbyResult` 매핑 이중 (낮음, 5-과 직결)**
동일 6필드 매핑이 `route.ts:9-16`과 `page.tsx:49-56`에 복제. 5번대로 `route.ts`를 삭제하면 페이지 인라인 매핑만 남으므로 자연 해소. 라우트를 굳이 유지하면 `lib`에 `toNearbyResult(c)` 1개로 통일.

### (2) 테스트 커버리지 — score만 있고 data.ts·format 부재

`lib/score.test.ts` 12종은 riskScore 밴드/연봉/회전율/클램프/휴폐업, riskLabel 경계, turnover/estSalary를 잘 덮는다(경계값·0나눗셈 포함, 양호). 그러나 **데이터 레이어와 format은 0건**. 특히 `data.ts`는 컬럼형 raw·인터닝·id 안정성 등 버그 표면이 가장 넓은데 미검증이다.

제안 케이스:
- **`lib/data.test.ts`** (`data/companies.json` 로드 의존이라 통합성 — fixture 또는 실파일)
  - `getCompany`: 미존재 id → `undefined`; 정상 id → 필드 채움. `HERO_IDS[0]`로 라운드트립
  - **id 안정성(중요)**: 같은 id 두 번 호출 시 동일 객체 필드; `baseId`(L63)와 `idAt`(L60)가 상위 8개에서 일치(L62 주석 주장 검증); 해시 충돌 시 `x` 접미사(L55) 경로
  - `nearbyCompanies` 티어 폴백: dong→sigungu→industry→all 순서, 본인 제외(`j!==g0`, L177), `members>5` 필터, scope 반환값 정확
  - `regionRank`: `total<5`면 null(L250), 동점은 인덱스로 안정화(L247), `percentile=max(1,…)`; 휴폐업(`g>=NA`)이면 null(L240)
  - `salaryPercentile`: `mySal<=0`면 null(L265), `total<10`면 null(L274)
  - `exploreCompanies`: grade 경계(`sc<20`/`20≤sc<50`/`sc≥50`, L218-220), sido 필터, sort 3종(risk/salary/members) 정렬키, total=필터후 개수
  - `searchCompanies`: 빈 문자열 → `[]`(L151); 숫자 3자 미만이면 bizNo 매칭 안 함(`byDigit`, L154); members 내림차순 정렬(L162); 600 상한(L159)
  - `getMonthlyStats`: 길이 14; 마지막 달 `members===cur_members`·`est_salary===cur_salary`·`turnover===cur_turnover`(L135-138 보정); 같은 id 재호출 시 캐시 동일 참조(L119)
- **`lib/format.test.ts`**
  - `won`: `9999`→"9,999만원", `10000`→"1억원", `12500`→"1억 2,500만원"(1억 경계·나머지 0 분기, L3-7)
  - `ymLabel`: `"2026-06"`→"26.06"
  - `riskColor`/`riskTextColor`: `19`/`20`/`49`/`50` 경계가 `scoreCore.riskLabel` 경계(`<20`,`<50`)와 일치하는지 — **현재 따로 하드코딩(format.ts:21-32)이라 SSOT 경계와 갈라질 수 있어 회귀 가드 필요**

### (3) `app/company/[id]/page.tsx` 진단 try/catch — 영구 잔재 + 한계

`page.tsx:43`에서 `try {` 시작, `:207-212`에서 catch. **진단용(임시)인데 영구 코드로 남았다.** 정리 필요. 근거·문제:
- catch가 하는 일은 NEXT digest면 rethrow(L209), 아니면 `console.error("COMPANY_RENDER_ERR …")` 후 **그대로 rethrow**(L211). 즉 **에러를 잡지도 복구하지도 않고 로그만 찍고 다시 던진다** — 동작상 순수 진단 코드.
- **들여쓰기 잔재**: try 본문(L44-205)이 한 단계 덜 들여쓰져 있어(L44 `  const stats`) try 블록 추가가 사후 땜질임이 드러난다.
- **한계(중요)**: 이 try/catch는 **서버 컴포넌트 본문(데이터 조회·JSX 생성)의 동기 에러만** 잡는다. 반환된 자식(`<RiskGauge>`, `<LineChart>`, `<NearbyList>` 등)의 렌더 에러는 React가 나중에 렌더하므로 **이 try가 못 잡는다**. 자식 렌더 에러를 잡으려면 `error.tsx`(라우트 에러 바운더리)가 정답.
- 권고: try/catch 제거하고, 진단/관측이 필요하면 `app/company/[id]/error.tsx`(client error boundary)로 대체. 그래야 자식 렌더 에러까지 포착되고 사용자에게도 폴백 UI가 보인다. 들여쓰기도 정상화.

### (4) `/api/nearby` 데드코드 — 호출처 0건 확정

전수 검색(`fetch(`, `/api/nearby`) 결과 앱 코드의 호출처 **0건**. 유일한 `fetch`는 `SearchBox.tsx:23`의 `/api/search`뿐(주변 추천은 `page.tsx:48`이 서버 컴포넌트에서 `nearbyCompanies()`를 **직접** 호출). `/api/nearby` 언급은 전부 `작업계획서.md`·`docs/review/*`(문서)일 뿐 코드 호출 아님.
- 권고: `app/api/nearby/route.ts` **삭제**(1-B 매핑 중복도 동시 해소). 외부 노출 API로 의도했다면 라우트 상단 주석 + 문서에 "외부 공개 엔드포인트"임을 명시 — 현재는 그런 근거 없음. (참고: `route.ts:7`의 `id.slice(0,40)` 외 입력 검증·레이트리밋·캐시 헤더도 없어 살려둘 실익이 더 낮다.)

### (5) eslint/prettier 미설치 + 타입 신뢰 캐스팅

- **eslint/prettier 미설치(중간)**: `package.json:9` `"lint": "next lint"`인데 eslint·eslint-config-next 미설치(`.bin`에 없음) → **실행 불가**. prettier 설정·바이너리 없음. 권장: `npm i -D eslint eslint-config-next prettier`, `eslint.config.mjs`(Next 15 flat) 또는 `.eslintrc.json {"extends":["next/core-web-vitals"]}`, `.prettierrc` 1개, 스크립트에 `"typecheck": "tsc --noEmit"`·`"format": "prettier --write ."` 추가, CI에서 lint+typecheck+test 3종.
- **`JSON.parse(...) as Dataset` 신뢰 캐스팅(낮음)**: `data.ts:18-20` — 런타임 검증 없이 캐스팅. 스키마 불일치를 컴파일러가 못 잡고, 컬럼형 인덱스 역참조(`raw.ind[s.indIx[i]]` L73, `raw.sido[s.sidoIx[i]]` L76)가 범위를 벗어나면 `undefined`가 조용히 흘러든다.
- **fs 로드 무방비(낮음)**: 같은 L18-20 `fs.readFileSync(.../companies.json)`이 try/catch 없음. 파일 없음/JSON 깨짐 시 **모듈 로드가 그대로 throw → 앱 전체가 불투명하게 죽는다.** ETL 산출물 의존이므로 "먼저 `node scripts/etl.mjs` 실행" 메시지로 감싸는 게 친절. 최소한 로드 직후 sanity(`cols.name.length === count`, `ind/sido` 길이>0) 1회.

### (6) any / 단언 잔여 (낮음)

- **`any` 0건**: `--include=*.ts,*.tsx` 전수에서 `: any`/`as any`/`as unknown` 매치 없음. `tsconfig` `strict:true`(긍정).
- 불필요·취약 단언:
  - `data.ts:83` `riskLabel(score) as RiskLabel` — `score.ts:12`의 `riskLabel` 반환 타입이 이미 `RiskLabel`이므로 **불필요. 삭제 가능.**
  - `score.ts:13` `core.riskLabel(score) as RiskLabel` — `scoreCore.mjs`가 `.mjs`(타입 없음)라 `string` 반환 → 여기 단언은 **경계에서 1회 불가피**(허용). 다만 `scoreCore`의 라벨 상수와 `RiskLabel` 유니온이 갈라지면 컴파일러가 못 잡으므로 (2)의 format 경계 테스트로 가드.
  - `explore/page.tsx:27-28` `as Grade | ""`/`as SortKey`(searchParams 캐스팅), `SearchBox.tsx:30,41` `as Error`/`as Node` — 외부 입력/DOM 경계 단언으로 통상 허용 범위.

## 우선순위 권고

1. **(중간)** `page.tsx` 진단 try/catch 제거 → `error.tsx`로 대체 (3). 자식 렌더 에러까지 커버 + 잔재 정리.
2. **(중간)** `/api/nearby` 삭제 (4) → 매핑 중복(1-B) 동시 해소. 저비용·즉시.
3. **(중간)** 차트 `textWidth`/`Tooltip` 공용 추출 (1-A); eslint/prettier 설치 (5).
4. **(낮음)** `data.test.ts`·`format.test.ts` 추가 (2) — 특히 nearby 티어·id 안정성·format 경계 SSOT 가드.
5. **(낮음)** `data.ts` fs try/catch + sanity 체크 (5); `data.ts:83 as RiskLabel` 삭제 (6).

## 반성점

- **테스트는 실행했으나(12/12 통과 확인), 빌드/`tsc --noEmit`/`next lint`는 실행하지 않았다.** eslint 미설치는 `.bin`·`package.json` 부재로 확정. 빌드 무결성은 정적 판단.
- **(2)의 제안 케이스는 `data/companies.json` 실파일 로드에 의존**한다. fixture 없이 실데이터를 쓰면 테스트가 ETL 산출물에 결합되므로, 소형 fixture 주입 경로(`process.cwd()` 의존 L19 → 환경변수/주입)를 먼저 만드는 게 이상적이라는 점은 제안에 반영하지 못했다.
- **SSOT 해소 판정은 Read 기반**이다. `score.ts`/`etl.mjs`가 같은 모듈을 import함은 확인했으나, ETL이 산출한 `cols.score`와 런타임 `companyAt`의 `riskScore` 재계산(L75)이 동일 회사에서 실제로 일치하는지는 데이터를 돌려 대조하지 않았다(이제 공식은 한 곳이라 갈라질 구조적 위험은 없으나, "저장값 vs 재계산값" 이원 경로 자체는 여전히 존재).
