# Round 2 — Pass 08: 코드 품질 / 테스트 / 중복 / 데드코드 (실데이터 리팩터 후 재점검)

## 점검 범위

- `lib/data.ts`, `lib/score.ts`, `lib/format.ts`, `lib/types.ts`
- `scripts/etl.mjs` (실데이터 ETL — 국민연금 가입 사업장 CSV → `data/companies.json`)
- `components/*` (LineChart, HireLeaveChart, useChartWidth, NearbyList, SearchBox, RiskGauge, MetricCard, CompanyRankList, GuessGame)
- `app/company/[id]/page.tsx`, `app/api/search/route.ts`, `app/api/nearby/route.ts`
- 빌드/품질 설정: `package.json`, `tsconfig.json`, `tailwind.config.ts`
- 관점: **코드품질·테스트·중복·데드코드** (이전 라운드 지적의 처리 여부 + 실데이터 리팩터로 새로 생긴 부채)

모든 지적은 코드 Read 및 파일시스템 확인(`node_modules`, 설정 파일, `package-lock.json`)에 근거한다. 실행(빌드/런타임) 검증은 하지 않았다.

## 이전 라운드 대비 변화 요약

| 이전 지적 | 현 상태 | 비고 |
|---|---|---|
| 테스트 0건 | **여전히 0건** | 러너·스크립트·테스트 파일 전무 (확인) |
| eslint 미설치 | **여전히 미설치** | `node_modules/eslint` 없음, 설정 파일 없음, `package-lock.json`에 eslint/vitest 0건 |
| 차트 textWidth/Tooltip 중복 | **그대로** | LineChart.tsx:143-160 ↔ HireLeaveChart.tsx:112-130 |
| `/api/nearby` 데드코드 | **그대로 데드** | 호출처 0건 (page는 `nearbyCompanies()` 직접 호출) |
| raw hex 산재 | **그대로 산재** | `.ts/.tsx`에서 54회(10파일) |
| **(신규)** 실데이터 ETL 도입 | — | score 공식이 `score.ts`와 `etl.mjs` **양쪽에 복붙** → 새 중복 부채 |

## 발견 (심각도 / 파일·라인)

### 높음

**1. 점수 공식·estSalary·turnover가 `lib/score.ts`와 `scripts/etl.mjs`에 이중 복붙 (신규·최우선)**

실데이터 리팩터로 ETL이 생기면서, 동일 도메인 로직이 두 곳에 손으로 복제됐다. 한쪽만 고치면 **사전계산값(ETL의 `score`/`turnover` 컬럼)과 런타임 재계산값(`companyAt`이 부르는 `score.ts`)이 조용히 어긋난다.** 이건 단순 중복이 아니라 데이터 정합성 버그의 씨앗이다.

- `riskScore` — `score.ts:4-23` vs `etl.mjs:15-22`. 상수까지 동일: 밴드 `100/30` → `0/8/16`, 연봉 상한 `35`, 회전율 기준 `20`·계수 `0.22`·상한 `35`, 휴폐업 `30`, clamp `0~100`.
- `estSalary` — `score.ts:39-42` vs `etl.mjs:11-12`. `(notice / members / 0.09) * 12 / 10000` 동일.
- `turnover`(turnoverPct) — `score.ts:33-35` vs `etl.mjs:13-14`. `(hires+leaves)/members*1000)/10` 동일.
- `riskLabel`(labelOf) — `score.ts:26-29` vs `etl.mjs:23`. 경계 `20/50` 동일.

근거: `etl.mjs:10` 주석 `// 점수 엔진 (lib/score.ts와 동일 공식)` 자체가 복붙임을 자인한다. 실제로 ETL은 `cols.score`/`cols.turnover`를 산출해 JSON에 저장(`etl.mjs:106,116-118`)하는데, `lib/data.ts:65`의 `companyAt`은 이 저장값을 **버리고** `riskScore(...)`를 다시 계산한다(랭킹용 `A.score`만 ETL 값 사용 — `topRiskCompanies`/`awards`/`gamePool`). 즉 같은 회사의 점수가 "랭킹 경로"(ETL 산출)와 "상세 경로"(런타임 재계산) 두 출처를 가진다. 공식 정의가 두 군데라 둘이 갈라질 위험.

**단일 출처화 방안:**
- 순수 함수(`riskScore`, `estSalary`, `turnover`, `riskLabel`)를 `lib/score.ts`에 그대로 두고, **ETL이 이를 import**한다. `score.ts`를 `.ts`로 둔 채 ETL(`.mjs`)에서 쓰려면: (a) `score.mjs`(또는 `score.js`) 한 파일로 만들고 `score.ts`가 re-export, 혹은 (b) ETL을 `tsx`/`ts-node`로 실행하거나 빌드 스텝에 태워 `score.ts`를 직접 import. 가장 가벼운 길은 **공식만 `lib/score.core.mjs`로 분리** → `score.ts`와 `etl.mjs`가 동시 import (확장자 분기 없이 JS 한 파일이 SSOT).
- 동시에 **저장 vs 재계산 정책을 하나로**: ETL이 점수를 저장한다면 `companyAt`은 `A.score[i]`/`A.turnover[i]`를 그대로 쓰고 `riskScore` 재호출을 없애거나(상세도 ETL값 신뢰), 반대로 ETL은 랭킹 정렬용 키만 남기고 표시값은 항상 런타임 계산으로 통일. 둘 다는 안 된다.

**2. 테스트 여전히 0건**

`package.json`에 `test` 스크립트·러너 없음, `node_modules`에 vitest/jest 없음(`package-lock.json` "vitest" 0건 확인), 테스트 파일 0개. 1번 때문에 위험이 **오히려 커졌다** — 공식이 두 곳에 있으니 "두 구현이 같은 입력에 같은 점수를 내는지" 검증할 회귀 테스트가 필수가 됐다.

**vitest 도입 + 구체 테스트 제안:**

설치: `npm i -D vitest`, `package.json`에 `"test": "vitest run"`, `"test:watch": "vitest"`. `tsconfig`는 그대로(vitest는 esbuild로 TS 처리). 별도 config 불필요(루트 `lib/` 대상이면 zero-config).

- **`lib/score.test.ts`** (최우선, 순수·결정적)
  - `riskScore` 밴드 경계: members `29`(s1=16)/`30`(s1=8)/`99`/`100`(s1=0)
  - 연봉비: `ratio>=1`이면 s2=0, `ratio=0.5`이면 `round(35*0.5)=18`, `median=0`이면 ratio=1 폴백(s2=0)
  - 회전율: `turnover<=20`이면 s3=0(clamp), `turnover=100`이면 상한 35 clamp 확인
  - 휴폐업: `is_closed`면 +30
  - 총점 상한: 모든 가산 최대 시 `min(100, ...)` 확인 (16+35+35+30=116 → 100)
  - `contrib` 4필드 합이 clamp 전 합과 일치하는지(기여도 표시 정합)
  - `riskLabel` 경계: `19`→희귀, `20`→보통, `49`→보통, `50`→좋소 확정
  - `turnover`/`estSalary`: `members=0` → 0 (0 나눗셈 방지)
  - `turnoverLabel`(60 경계), `memberBand`(30/100 경계)
- **`lib/format.test.ts`**
  - `won`: `9999`→"9,999만원", `10000`→"1억원", `12500`→"1억 2,500만원" (1억 경계·나머지 0 분기)
  - `ymLabel`: `"2026-06"`→"26.06"
  - `riskColor`: `19`/`20`/`49`/`50` 경계가 score.ts 라벨 경계와 일치하는지(현재 따로 하드코딩 → 회귀 가드)
- **`lib/data.test.ts`** (데이터 레이어 핵심; `data/companies.json` 로드 의존이라 통합성)
  - `getCompany`: 미존재 id → `undefined`, 정상 id → 필드 채움
  - `nearbyCompanies` 티어 폴백: dong→sigungu→industry→all 순, 본인 제외(`j!==g0`), `members>5` 필터 확인
  - `getMonthlyStats`: 길이 14, 마지막 달 `members===cur_members`·`est_salary===cur_salary`(L125 보정), 같은 id 재호출 시 캐시 동일 참조
  - `searchCompanies`: 빈 문자열 → `[]`, 숫자 3자 미만이면 bizNo 매칭 안 함(L136)
- **회귀 가드(1번 직결)**: `etl.mjs`의 공식을 SSOT로 분리하면, `score.test.ts`가 그 한 모듈을 검증하므로 자동으로 ETL도 커버. 분리 전이라면 `etl` 공식을 임시 export해 `riskScore(score.ts) === riskScore(etl)`를 fuzz로 비교하는 테스트로 갈라짐을 잡는다.

### 중간

**3. eslint/prettier 설치·설정 부재 (스크립트만 존재)**

`package.json:9` `"lint": "next lint"`인데 `eslint`·`eslint-config-next` 미설치(확인) → 실행 불가. Prettier 설정 없음.

권장:
- `npm i -D eslint eslint-config-next prettier`
- `.eslintrc.json`: `{ "extends": ["next/core-web-vitals"] }` (Next 15면 flat config `eslint.config.mjs`도 가능)
- `.prettierrc`: `{ "printWidth": 120, "semi": true }` 등 최소 1개
- `package.json` 스크립트: `"format": "prettier --write ."`, 그리고 `tsc --noEmit`을 `"typecheck"`로 추가
- CI/pre-commit에서 `lint` + `typecheck` + `test` 3종 실행

**4. 차트 `textWidth` + 툴팁 컴포넌트 복붙 (미해소)**

`LineChart.tsx:143-145`(textWidth) + `:147-161`(LineTooltip) ↔ `HireLeaveChart.tsx:112-114`(textWidth) + `:116-130`(Tooltip). `textWidth`는 CJK 상수(`0x2e80`/`13`/`7.4`)까지 글자 단위로 동일. 툴팁 SVG는 위 마진(`y-h-10` vs `y-h-8`)만 다름.

추출안: `components/chart/chartUtils.ts`에 `textWidth(s)` 1개, `components/chart/ChartTooltip.tsx`에 공용 `<ChartTooltip x y label color W offset={10} />`. 두 차트가 import. 마진은 prop. (`useChartWidth.ts`가 이미 공용 훅으로 잘 분리돼 있으니 같은 폴더 컨벤션 적용.)

**5. `/api/nearby` 데드코드 — 재확인 결과 데드 확정**

호출처 전수 검색(`fetch(`, `api/nearby`)에서 `/api/nearby`를 부르는 코드 **0건**. 유일한 `fetch`는 `SearchBox.tsx:22`의 `/api/search`뿐. 주변 추천은 `app/company/[id]/page.tsx:31`이 서버 컴포넌트에서 `nearbyCompanies()`를 **직접** 호출하므로 라우트가 불필요. → `app/api/nearby/route.ts` 삭제 권장. (단, 외부 노출 API로 의도했다면 주석·문서로 명시. 현재는 근거 없음.)

부수: `route.ts:8-15`와 `page.tsx:32-39`의 `Company → NearbyResult` 6필드 매핑도 중복. 라우트를 지우면 페이지 쪽 인라인 매핑만 남으므로, 굳이 둔다면 `lib`에 `toNearbyResult(c)` 1개로 통일.

**6. raw hex 산재 (미해소)**

`.ts/.tsx`에서 hex 리터럴 54회 / 10파일(`LineChart.tsx` 12, `RiskGauge.tsx` 6, `HireLeaveChart.tsx` 13 등). `tailwind.config.ts`에 `risk-high/warning/safe` 시맨틱 토큰이 SSOT로 있으나 SVG·inline `style`이 이를 무시하고 `#D8362A`/`#747878`/`#e3e5e5` 등을 직접 박음(예: `page.tsx:61,71`, `NearbyList.tsx:30`).

해소: `lib/colors.ts`에 `export const RISK_COLOR/CHART_INK` 객체 1개 → Tailwind config가 import해 펼치고, SVG/inline은 이 상수를 import. `format.ts:riskColor()`는 이미 이 패턴의 좋은 선례.

### 낮음

**7. 타입 안전 — 대체로 양호, 잔여 2건**

- `lib/data.ts:73` `riskLabel(score) as RiskLabel` 단언 불필요(반환 타입이 이미 `RiskLabel`). 삭제.
- `lib/data.ts:18-20` `JSON.parse(...) as Dataset`은 **런타임 검증 없는 신뢰 캐스팅** — 컬럼형 raw의 타입 안전성 직결(8번 참조).
- 긍정: 프로젝트 전체 `any`/`as any`/`as unknown` 0건. `tsconfig` `strict:true`. ETL은 `.mjs`라 타입 밖이지만 입력 검증(`f.length!==22`, `+f[]||0`)은 있음.

**8. 컬럼형 raw 접근의 타입 견고성**

`lib/data.ts`의 `ColSet`/`Dataset` 인터페이스는 잘 정의됐으나, `companyAt`(L62-66)이 `s.indIx[i]`로 `raw.ind[]`를 인덱싱하고 `raw.sido[s.sidoIx[i]]` 등으로 인터닝 테이블을 역참조한다. **인덱스가 범위를 벗어나면 `undefined`가 조용히 흘러든다**(예: ETL 버그로 `indIx`가 어긋나면 `[code,indName,median]` 구조분해가 `undefined`에서 터지거나 `median=undefined`). `JSON.parse` 결과를 신뢰 캐스팅(L18)하므로 스키마 불일치를 컴파일러가 못 잡는다.

권장(데모 규모 고려, 가벼운 순):
- 로드 직후 `assert`성 sanity 체크 1회: `ind`/`sido`/`sigungu`/`dong` 길이 > 0, `cols.name.length === count` 등. 실패 시 명확한 throw(현재는 무방비).
- 인터닝 역참조에 폴백: `raw.sido[ix] ?? ""` (이미 일부는 `.filter(Boolean)`로 방어하나 `ind` 구조분해는 무방비).
- 과하면 zod까진 불필요. 최소한 "파일 없음/깨짐"은 try/catch로 의미 있는 메시지화(9번).

**9. 에러 처리 — fs 로드 실패 무방비 + SearchBox catch 침묵 (미해소)**

- `lib/data.ts:18-20` `fs.readFileSync(.../companies.json)`이 try/catch 없음. 파일 없음/JSON 깨짐 시 모듈 로드가 그대로 throw → 앱 전체가 불투명하게 죽는다. ETL 산출물 의존이므로 "data/companies.json을 먼저 `node scripts/etl.mjs`로 생성하세요" 같은 메시지로 감싸는 게 친절.
- `components/SearchBox.tsx:21-29` `catch { setResults([]) }` — 네트워크 실패와 "결과 없음"이 사용자에게 동일하게 "검색 결과가 없습니다"(L95)로 보임. `res.ok` 미확인(L23)이라 5xx 본문도 파싱 시도. 최소 `console.error` + 실패 상태 분리 권장.

**10. 인라인 비즈니스 계산 (미해소)**

`page.tsx:29`(월 퇴사율), `:47`(중앙값 대비 %)이 뷰에서 직접 계산. `score.ts`에 동류 순수함수가 이미 있으니 옮기면 테스트 대상이 되고 뷰가 얇아진다.

## 우선순위 권고

1. **(높음)** 점수 공식 SSOT화 — `lib/score.core.mjs` 분리 → `score.ts`·`etl.mjs` 공유 (1번). 정합성 버그 차단이 최우선.
2. **(높음)** vitest 도입 + `score.test.ts`부터 (2번). 1번의 회귀 가드 겸용.
3. **(중간)** eslint/prettier 설치·설정 (3번), `/api/nearby` 삭제 (5번) — 둘 다 저비용·즉시.
4. **(중간)** 차트 유틸 추출 (4번), 색 SSOT (6번).
5. **(낮음)** raw 로드 sanity 체크 + try/catch (8·9번), `as RiskLabel` 제거 (7번), 인라인 계산 이동 (10번).

## 반성점

- **정적 분석만 했다.** `tsc`/빌드/테스트를 실제로 돌리지 않았다. "eslint 미설치"·"vitest 0건"은 `node_modules`·`package-lock.json`·설정 파일 부재로 확정했으나, `npm run lint`의 실제 출력으로 재확인하진 않았다.
- **1번의 "두 점수가 실제로 갈라져 있는가"는 검증하지 못했다.** 공식이 글자 단위로 같다는 것까지는 Read로 확인했지만, ETL 산출 `cols.score`와 런타임 `riskScore` 결과가 동일 회사에서 일치하는지는 데이터를 돌려보지 않았다. "갈라질 위험"은 실재하나 "현재 갈라져 있다"는 주장은 하지 않았다.
- **심각도는 데모 맥락에서 흔들린다.** 학습·시연 프로젝트로 보여 8·9번을 낮음에 뒀으나, 점수 엔진이 "역공학 보정 계수"(score.ts:3)임을 고려하면 1·2번은 학습용이라도 가치가 분명해 높음 유지.
- **중복 카운트(hex 54회)는 도구 집계**라 inline style 외 정당한 사용(SVG stroke 등 토큰화가 과한 경우)도 섞여 있을 수 있다. 파일별 분포만 제시하고 "전부 제거"가 아닌 "SSOT 경유"로 표현했다.
