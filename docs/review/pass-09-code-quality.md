# Pass 09 — 코드 품질 / 타입 안전 / 유지보수성

## 점검 범위

- `lib/types.ts`, `lib/score.ts`, `lib/format.ts`, `lib/data.ts`
- `components/*` (LineChart, HireLeaveChart, useChartWidth, CompanyRankList, NearbyList, SearchBox, RiskGauge, MetricCard, GuessGame)
- `app/company/[id]/page.tsx`, `app/monthly/page.tsx`, `app/api/search/route.ts`, `app/api/nearby/route.ts`
- 빌드/품질 설정: `package.json`, `tsconfig.json`, `tailwind.config.ts`
- 관점: 타입 설계 견고성, 단언/any, 중복, 매직넘버·하드코딩 색, 테스트 유무, 린트/포맷·에러 처리, 폴더·네이밍 일관성

모든 지적은 코드 Read로 확인한 사실에 근거한다. 실행(빌드/런타임) 검증은 하지 않았으므로 동작 버그가 아닌 "코드 품질" 관점 위주로 본다.

## 발견 (심각도 / 파일·라인)

### 높음

1. **테스트 전무** — 프로젝트 전체. 점수 엔진(`lib/score.ts`)·집계(`lib/data.ts`)·포맷(`lib/format.ts`)은 순수 함수라 테스트하기 가장 쉬운데도 단 한 줄의 테스트가 없다. `package.json`에 test 스크립트도, 러너(vitest/jest)도 없다. 점수 가중치(아래 4번)는 "역공학 복원, 1차 보정 계수"(score.ts:3)라고 주석에 명시돼 있어 회귀 위험이 가장 큰 부분인데 안전망이 없다.

2. **린트/포맷 설정 부재인데 스크립트만 존재** — `package.json:9` `"lint": "next lint"`. 그러나 `node_modules`에 `eslint` 패키지가 없고(확인함), 프로젝트 루트에 `.eslintrc*`/`eslint.config.*`도 없다. 즉 `npm run lint`는 현재 동작하지 않는다(설정·의존성 모두 미설치). Prettier 설정 파일도 없음. 포맷은 사람이 손으로 맞추는 상태라 일관성 보증이 없다.

### 중간

3. **차트 두 컴포넌트의 `textWidth` + 툴팁 복붙** — `components/LineChart.tsx:143-160`(`textWidth`, `LineTooltip`)와 `components/HireLeaveChart.tsx:112-130`(`textWidth`, `Tooltip`)가 거의 글자 단위로 동일하다. `textWidth`는 CJK 폭 추정 상수(0x2e80 / 13 / 7.4)까지 똑같고, 툴팁 SVG도 마진(`y - h - 10` vs `y - h - 8`)만 다르다. 한쪽 버그 수정 시 다른 쪽이 누락되기 쉽다.

4. **Nearby 매핑 중복** — `app/api/nearby/route.ts:8-15`와 `app/company/[id]/page.tsx:32-39`가 `Company → NearbyResult` 변환(6개 필드)을 동일하게 두 번 작성. 한쪽은 API, 한쪽은 서버 컴포넌트가 직접 `nearbyCompanies()`를 부르며 같은 매핑을 반복한다. 매핑 함수(`toNearbyResult(c)`)를 `lib`에 한 번만 두면 된다. (참고: API 라우트는 응답에 `scope`를 담는데 페이지는 `scope`로 `nearbyDesc`를 직접 만든다 — 같은 데이터를 두 경로로 노출.)

5. **점수 가중치·임계값이 매직넘버로 산재** — `lib/score.ts`. 직원수 밴드 `100/30`과 점수 `0/8/16`(L9), 연봉 상한 `35`(L13), 회전율 기준 `20`·계수 `0.22`·상한 `35`(L16), 휴폐업 `30`(L19)이 모두 인라인 리터럴. 더 위험한 점: 같은 임계값이 **여러 파일에 흩어져 중복**된다 — 등급 경계 `20/50`이 `score.ts:27-28`(`riskLabel`)과 `lib/format.ts:21-23`(`riskColor`), `RiskGauge.tsx:35-37`(아크 0/20/50/100)에 각각 하드코딩. 좋소 판정선 `50`은 `GuessGame.tsx:16`에도 또 등장. 한 곳을 바꾸면 나머지가 조용히 어긋난다.

6. **색 hex가 토큰 대신 컴포넌트에 산재** — `tailwind.config.ts:13-25`에 `risk-high #D8362A` / `risk-warning #FEE500` / `risk-safe #2A8D5C` 및 `primary`/`outline` 등 시맨틱 토큰이 SSOT로 정의돼 있다. 그런데 컴포넌트들은 이를 무시하고 raw hex를 inline `style`에 직접 박는다: `MetricCard.tsx:18,27-28`, `CompanyRankList.tsx:37`, `RiskGauge.tsx:35-39,52`, `LineChart.tsx`(#D8362A/#747878/#e3e5e5 다수), `HireLeaveChart.tsx`(동일), `GuessGame.tsx:54,76,115,118`, `app/company/[id]/page.tsx:37,61,71` 등. 같은 빨강 `#D8362A`가 13개 파일에 76회 등장(`작업계획서.md`/`DESIGN.md` 포함). `GuessGame.tsx`는 같은 파일 안에서도 일관성이 없다 — 버튼은 `text-risk-high`(토큰)인데 결과 패널은 `#D8362A`(raw). SVG는 Tailwind 클래스를 못 쓰니 `lib/format.ts`의 `riskColor()`처럼 JS 색 상수 모듈로 한 번만 정의해 import하는 게 맞다.

7. **`NearbyResult.riskLabel`이 정의됐으나 미사용(데드 필드)** — `lib/types.ts:60`에 `riskLabel: RiskLabel`이 있고, `route.ts:14`·`page.tsx:38`에서 매번 채워 넘기지만 `components/NearbyList.tsx`는 `riskScore`만 쓰고 `riskLabel`은 한 번도 렌더하지 않는다. 타입·매핑·전송 모두에 불필요한 비용. 제거하거나 실제로 표시해야 한다.

### 낮음

8. **불필요한 단언 `as RiskLabel`** — `lib/data.ts:215` `risk_label: riskLabel(score) as RiskLabel`. `riskLabel()`의 반환 타입이 이미 `RiskLabel`(`score.ts:26`)이므로 캐스팅이 무의미하다. 단언이 한 군데뿐인 건 좋은 신호지만, 이건 그냥 지우면 된다. (전 프로젝트에 `any`·`as any`·`as unknown`은 검색상 0건 — 타입 위생은 대체로 양호.)

9. **`fetch` 실패의 조용한 무시** — `components/SearchBox.tsx:27-29` `catch { setResults([]) }`. 네트워크 실패와 "결과 없음"이 사용자에게 똑같이 "검색 결과가 없습니다"로 보인다(L95-99). 로깅/에러 상태 구분이 없다. 또한 `res.json()`을 `res.ok` 확인 없이 호출(L23-24)해 5xx 본문도 그대로 파싱 시도. 데모 규모에선 경미하나 패턴으로 굳으면 디버깅이 어렵다.

10. **API 라우트 입력 검증 없음** — `app/api/search/route.ts:6`, `app/api/nearby/route.ts:6`. `q`/`id`를 받아 그대로 lib에 넘긴다. lib 쪽에서 빈 문자열·미존재 id를 안전하게 처리하긴 하나(`searchCompanies` trim, `getCompany` undefined), `limit` 등은 하드코딩 `10`으로 고정돼 라우트에 의미가 없다. 큰 결함은 아니지만 경계가 흐리다.

11. **`page.tsx`의 인라인 비즈니스 계산** — `app/company/[id]/page.tsx:29`(월 퇴사율), `:47`(중앙값 대비 %)이 뷰 안에서 직접 계산된다. `lib/score.ts`에 `turnover`/`memberBand` 같은 동류 함수가 이미 있으므로 거기로 옮기면 테스트 가능해지고 뷰가 얇아진다.

12. **네이밍·구조 일관성** — 대체로 일관적이고 좋다. 디렉터리(`lib`/`components`/`app`)와 파일명(PascalCase 컴포넌트, camelCase lib)은 규칙적. 다만 두 가지 거슬리는 점: (a) `lib/data.ts` 한 파일이 474줄로, 시드 데이터·PRNG·생성기·6종 조회 API를 전부 담아 비대하다 — `lib/data/`로 쪼갤 여지. (b) `types.ts`의 도메인 타입은 `snake_case`(`biz_name`, `cur_members`) 인데 DTO 타입(`SearchResult`, `NearbyResult`)은 `camelCase`(`bizName`)라 매핑 보일러플레이트가 발생(4·7번의 근원). 의도된 경계(DB row vs API DTO)일 수 있으나 어디에도 문서화돼 있지 않다.

13. **루트 디렉터리 산만** — 프로젝트 루트에 20여 개의 `.png` 스크린샷과 `.playwright-mcp/` 로그가 커밋 추적 대상처럼 쌓여 있다. 코드 품질과 직결되진 않으나 유지보수 시 노이즈이며 `.gitignore` 정비 대상.

## 구체적 개선안 (리팩터링 · 테스트)

- **점수 상수 추출**: `lib/score.ts` 상단에 `const RISK = { memberBand: [100, 30], memberPts: [0, 8, 16], salaryCap: 35, turnoverBase: 20, turnoverCoef: 0.22, turnoverCap: 35, closedPts: 30, grade: { rare: 20, danger: 50 } }`처럼 명명 상수로 모은다. `riskLabel`/`riskColor`/`RiskGauge`의 경계가 모두 `RISK.grade`를 참조하게 해 5번 중복 제거.
- **색 SSOT 단일화**: SVG·inline style용 JS 색은 `lib/colors.ts`(또는 `format.ts`)에 `export const RISK_COLOR = { high: "#D8362A", warning: "#FEE500", safe: "#2A8D5C" }` 한 곳에 두고, Tailwind config가 같은 객체를 import해 `colors`에 펼친다(토큰과 JS 상수가 한 출처). 컴포넌트의 raw hex를 전부 이 상수/Tailwind 클래스로 교체.
- **차트 공통화**: `textWidth`와 툴팁을 `components/chart/` 하위 `chartUtils.ts` + `<ChartTooltip>` 공용 컴포넌트로 추출해 두 차트가 공유(3번 해소). 툴팁 위 마진은 prop으로.
- **Nearby 매핑 단일화**: `lib/data.ts`(또는 mapper 파일)에 `toNearbyResult(c: Company): NearbyResult`를 만들고 route·page가 둘 다 호출. 미사용 `riskLabel` 필드는 NearbyList에 실제 표시하거나 타입·매핑에서 제거(7·4번).
- **에러 처리**: `SearchBox`에서 `res.ok` 확인 후 `json()`, 실패 시 에러 상태를 별도로 두어 "검색 결과 없음"과 "검색 실패"를 구분. 최소한 `console.error`라도 남긴다.
- **테스트 도입**: vitest 추가 후 우선순위 — (1) `score.ts`의 `riskScore`(밴드 경계 29/30/99/100, ratio 1.0 경계, turnover 20 이하 클램프, 상한 100), `riskLabel`(19/20/49/50 경계), `turnover`/`estSalary`의 0 나눗셈, (2) `format.ts`의 `won`(9999/10000/1억 경계), `ymLabel`, (3) `data.ts`의 `nearbyCompanies` 티어 폴백(dong→sigungu→industry→all)과 본인·5인 이하·폐업 제외 필터. 모두 순수·결정적이라 스냅샷 없이 단언만으로 충분.
- **린트 복구**: `eslint` + `eslint-config-next` 설치하고 `.eslintrc.json`(`extends: ["next/core-web-vitals"]`) 추가, Prettier 설정 파일 1개. CI나 pre-commit에서 `lint` + `tsc --noEmit` 실행.
- **단언 제거**: `data.ts:215`의 `as RiskLabel` 삭제(타입 동일).

## 반성점

- **정적 분석만 했다.** Read만으로 중복·하드코딩·타입을 짚었지 `tsc`나 빌드를 돌려보지 않았다. "린트가 동작하지 않는다"는 패키지·설정 부재로 추론한 것이고, `npm run lint` 실제 출력으로 확정하진 않았다. 실행 기반 확정이 더 정직했을 것이다.
- **심각도는 주관적이다.** 이 프로젝트는 학습·시연용(데모 데이터 생성기 중심)으로 보인다. 그 맥락에선 "테스트 전무"가 프로덕션만큼 치명적이진 않을 수 있어 높음/중간 경계가 흔들린다. 다만 점수 엔진이 "역공학 보정 계수"라 명시된 이상, 학습용이라도 회귀 테스트 가치는 실재한다고 판단해 높음으로 뒀다.
- **하드코딩 76회는 도구 카운트라 과대 포함**일 수 있다(문서 `.md` 2개, `icon.svg` 포함). 코드 파일 한정 수치를 따로 분리하지 않은 점은 다소 거칠었다.
- **데이터 정합/성능은 이번 범위 밖**으로 명시적으로 제외했다. `data.ts`가 모듈 로드시 500개사 + 14개월 시계열을 동기 생성하는 부분의 비용은 품질이 아닌 성능 관점이라 다루지 않았으나, 경계가 항상 깔끔하진 않았다.
