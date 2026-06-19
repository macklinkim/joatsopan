# Pass 05 — UI/UX & 반응형 품질 점검

점검일: 2026-06-20 · 대상: `jotsopan` (Next.js App Router + Tailwind)

## 점검 범위

- 정보 위계·일관성, 타이포 스케일: `app/layout.tsx`, `app/globals.css`, `tailwind.config.ts`, 각 페이지의 `h1/h2/h3` 사용.
- 반응형 레이아웃(grid 분기, 긴 한글 처리, 터치 타깃): `app/company/[id]/page.tsx`, `app/awards/page.tsx`, `components/NavBar.tsx`, `components/NearbyList.tsx`, `components/CompanyRankList.tsx`.
- 차트 가독성·툴팁·색대비·색맹: `components/RiskGauge.tsx`, `components/LineChart.tsx`, `components/HireLeaveChart.tsx`, `lib/format.ts`.
- 홈/빈/로딩/에러 상태: `app/page.tsx`, `components/SearchBox.tsx`, 그리고 `loading.tsx`/`error.tsx`/`not-found.tsx` 부재 확인.
- 디자인 토큰 일관 사용: 위 전 파일에서 토큰 클래스 vs. 하드코딩 hex 비교.

근거는 코드/클래스 기준이며(스크린샷 확인 불가), 대비 수치는 hex 값 기반 계산이다.

## 발견 (심각도 / 파일·라인)

### [높음] 색맹·색대비 — 노랑(`#FEE500`)을 텍스트색으로 사용 (프로젝트 자체 규칙 위반)
- `lib/format.ts:20-24` `riskColor()`가 warning 구간(20~49점)에서 `#FEE500`을 반환한다.
- 이 반환값이 **텍스트 색**으로 들어가는 곳:
  - `components/RiskGauge.tsx:48` 중앙 위험도 숫자 `fill={riskColor(score)}`
  - `app/company/[id]/page.tsx:71` 코멘트 문구 `color: riskColor(...)`
  - `components/NearbyList.tsx:30`, `components/CompanyRankList.tsx:45`, `app/awards/page.tsx:26`, `components/GuessGame.tsx:118` 위험도 칩 텍스트.
- `#FEE500`(노랑)은 흰/페이퍼 배경 대비 약 1.3:1로 WCAG AA(4.5:1) 한참 미달. 그런데 `작업계획서.md:383, 448`에 "`risk-warning` 노랑은 **텍스트색으로 쓰지 말 것**, 배경/마커로만" 이라고 명시돼 있다. 즉 **프로젝트가 스스로 정한 규칙을 위반**한다. 20~49점 회사의 위험도 숫자/칩이 사실상 안 보인다.
- 칩 배경도 `${riskColor()}1a`(불투명도 10%)로 깔아, warning 회사는 옅은 노랑 배경 + 노랑 텍스트가 되어 이중으로 안 보인다.

### [높음] 의미를 색에만 의존 — 등급 텍스트 라벨 미동반
- `components/NearbyList.tsx:28-33`, `components/CompanyRankList.tsx:43-48`, `app/awards/page.tsx:24-29` 위험도 칩은 점수 숫자만 색으로 구분한다. 색각 이상자에게는 녹/황/적이 구분되지 않는데 "안전/주의/위험" 텍스트가 칩에 없다(상세 페이지 헤더 `app/company/[id]/page.tsx:59-64`만 `risk_label` 동반).
- `RiskGauge`는 게이지 호(arc)에 구간 라벨(안전/주의/위험)이 없어 색만으로 구간을 읽어야 한다(`RiskGauge.tsx:35-37`).
- `작업계획서.md:448` 체크리스트가 "색만으로 판단 강요 금지 — 아이콘·라벨 동반"을 요구하는데 리스트 칩에서 미충족.

### [중간] 터치 타깃 크기 부족 (모바일)
- `NavBar.tsx:28` 내비 링크 패딩 `px-2.5 py-1.5`(텍스트 14px). 높이 ≈ 14+12=26px로 권장 44px에 한참 못 미친다. 모바일에서 메뉴 4개가 좁게 붙어 오탭 위험.
- `SearchBox.tsx:80-90` 자동완성 항목 `py-3`(≈40px)로 경계선상.
- 차트 히트 영역(`LineChart.tsx:113-124`, `HireLeaveChart.tsx:65-88`)은 막대/컬럼이 모바일에서 매우 좁아(`bw = min(16, group*0.36)`) 정확한 탭이 어렵다. `onPointerDown` 탭 지원은 좋으나 타깃이 작다.

### [중간] 내비게이션 반응형 — 모바일 햄버거/줄바꿈 처리 부재
- `NavBar.tsx:21-39` 메뉴를 항상 한 줄(`flex`)로 노출. 좁은 화면에서 로고 + 4개 한글 메뉴("이달의 좋소" 등 5자)가 가로로 다 들어가야 한다. 줄바꿈/오버플로 처리(`flex-wrap`, 스크롤, 햄버거)가 없어 ~360px 이하에서 로고가 눌리거나 메뉴가 잘릴 수 있다.

### [중간] 로딩/에러 상태 전무
- `app/` 어디에도 `loading.tsx` / `error.tsx` / `not-found.tsx`가 없다(글롭 확인). 상세 페이지는 `notFound()`(`app/company/[id]/page.tsx:25`)를 호출하지만 커스텀 404 페이지가 없어 Next 기본 화면이 뜬다 — 브랜드 톤과 단절.
- `SearchBox.tsx:15-32` 검색은 디바운스만 있고 **로딩 인디케이터가 없다.** 네트워크가 느리면 입력 후 아무 반응이 없다가 결과가 튀어나온다.
- `SearchBox.tsx:27` `catch`에서 결과만 비우고(`setResults([])`) 에러 메시지를 보여주지 않는다. API 장애 시 사용자에게는 "검색 결과 없음"(`:95-99`)과 구분되지 않는 무반응으로 보인다 — 침묵 실패.

### [중간] 홈 페이지 빈약함
- `app/page.tsx:3-28` 홈은 제목 + 검색창 + 예시 칩 3개가 전부다. 인기 검색/최근 본 회사/이달의 좋소 미리보기/통계 요약 등 진입 가치가 없어, 검색어를 모르는 첫 방문자는 막막하다. 헤더 내비에 있는 4개 코너로 유도하는 카드/링크조차 본문에 없다.

### [낮음] 타이포 스케일 일관성 — `h1` 크기 제각각
- 홈 `text-4xl md:text-5xl`(`page.tsx:10`), 상세 헤더 `text-3xl md:text-4xl`(`company/[id]/page.tsx:65`), 목록 페이지들 `text-3xl`(`monthly/memorial/awards/game` 각 `h1`)로 페이지마다 h1 크기·weight(`font-bold` vs `font-semibold`)가 섞여 있다. 의도적 위계라기보다 산발적. 스케일 토큰화가 없다.
- `MetricCard.tsx:33` `text-[11px]`, `GuessGame.tsx:146` `text-[11px]`, `awards` 등에서 11px 임의값이 반복 — 토큰 밖 매직 넘버.

### [낮음] 디자인 토큰 일관 사용 위반 — hex 하드코딩 다수
- 토큰(`risk-high` 등)이 정의돼 있는데도 컴포넌트에서 `style={{ color: "#D8362A" }}` 식 raw hex가 광범위: `MetricCard.tsx:18,27,28`, `GuessGame.tsx:54,76,115`, `CompanyRankList.tsx:38`, `RiskGauge.tsx:35-52`(SVG라 일부 불가피), `HireLeaveChart.tsx`/`LineChart.tsx`의 `#747878 #e3e5e5 #444748` 등.
- 같은 색이 토큰(`text-risk-high`)과 hex(`#D8362A`)로 혼용돼, 토큰 값을 바꿔도 하드코딩 부분은 안 따라온다(SSOT 깨짐). `lib/format.ts:riskColor`도 토큰이 아닌 hex 리터럴을 반환.
- `globals.css:5-8`의 CSS 변수는 `--color-surface-paper`, `--color-primary` 둘만 정의 — 나머지 토큰은 CSS 변수로 노출되지 않아 SVG/인라인 스타일에서 토큰을 못 쓴다(그래서 hex가 번진다).

### [낮음] 차트 가독성 세부
- `LineChart.tsx:143`, `HireLeaveChart.tsx:112` `textWidth()`가 CJK 폭을 0x2e80 기준 13px로 추정 — 실제 폰트 렌더와 어긋날 수 있어 툴팁 박스가 살짝 넘치거나 남을 수 있다(기능엔 무해, 미세 정렬 문제).
- `HireLeaveChart` 범례(`:98-103`)가 좌상단에 `pad.l + 50` 고정 좌표라 폭이 매우 좁아지면 "퇴사" 글자가 그리드 영역과 겹칠 수 있다.
- `LineChart`의 baseline이 스케일 밖일 때 상단에 `▲`로 표기(`:77-84`)하는 처리는 좋다 — 가독성 배려가 보이는 부분.

## 구체적 개선안

1. **`riskColor`를 텍스트용/마커용으로 분리.** `riskTextColor(score)`는 warning을 노랑이 아닌 어두운 호박색(예: `#8A6D00` 또는 `#1A1A1A`)으로 반환하고, `riskMarkerColor(score)`만 `#FEE500`을 마커/게이지에 쓴다. RiskGauge 중앙 숫자·모든 칩 텍스트는 텍스트용으로 교체. (작업계획서 383행 규칙 준수)
2. **칩에 등급 라벨 동반.** `NearbyList`/`CompanyRankList`/awards 칩에 `risk_label`(안전/주의/위험) 또는 아이콘(▲/●/■)을 숫자와 함께 표기해 색 비의존. RiskGauge 호 양끝/구간에 "안전·주의·위험" 텍스트 추가.
3. **터치 타깃 ≥ 44px.** 내비 링크 `py-1.5`→`py-2.5` 이상, 모바일에서 `min-h-11`. 차트 막대 히트 영역은 `group` 전체 폭을 투명 히트로 깔아(현재 LineChart는 이미 컬럼 방식) HireLeaveChart도 막대 대신 월 단위 컬럼 탭으로 확대.
4. **모바일 내비.** `NavBar`에 `flex-wrap` 또는 `overflow-x-auto`(가로 스크롤), 또는 `md:` 미만에서 햄버거 메뉴로 전환.
5. **상태 컴포넌트 추가.** `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx`(브랜드 톤 404). `SearchBox`에 로딩 스피너(`isLoading` state)와 별도 에러 메시지("검색 중 오류가 발생했습니다. 다시 시도해 주세요")를 "결과 없음"과 구분해 표시.
6. **홈 보강.** 검색창 아래에 "이달의 좋소 TOP 3" 미리보기 카드, 4개 코너 진입 카드(이미 데이터 함수 `topRiskCompanies` 등 존재) 추가.
7. **타이포·토큰 정리.** h1/h2/h3 크기·weight를 페이지 공통 규칙으로 통일(예: 페이지 타이틀 `text-3xl font-bold` 고정). `globals.css`에 위험색·텍스트색을 CSS 변수로 전부 노출하고, 컴포넌트의 raw hex를 토큰/변수로 교체. `text-[11px]` 같은 매직값은 `text-xs`로 수렴.

## 반성점

- 대비 수치(1.3:1 등)는 hex 기반 계산값이지 실제 렌더 스크린샷 검증은 못 했다. 다만 `#FEE500` 텍스트 문제는 **프로젝트 문서가 스스로 금지한 사항을 코드가 위반**한 것이라 추측이 아니라 사실로 확정할 수 있었다 — 이게 이번 패스의 가장 확실한 발견이다.
- 차트의 히트 영역·툴팁·CJK 폭 추정 등은 코드상 의도는 좋게 짜여 있으나(반응형 viewBox 측정 훅까지 둠), 실기기 터치 정확도는 코드만으론 단정 못 한다. "타깃이 좁다"까지가 근거 있는 한계.
- 홈 빈약함·타이포 산발은 주관 요소가 섞인다. "h1 크기가 페이지마다 다르다"는 사실이지만 그게 나쁜지는 디자인 의도에 달려 있어, 단정 대신 "토큰화 부재"로 표현했다.
- `loading/error/not-found` 부재는 글롭으로 확인한 객관 사실이나, 실제 사용자 영향은 네트워크/데이터 응답 속도에 좌우되어 체감 심각도는 환경별로 다를 수 있다.
