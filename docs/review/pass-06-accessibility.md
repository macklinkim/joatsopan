# Pass 06 — 접근성(a11y) 점검

대상: `좋소판별기` (Next.js App Router / React / Tailwind)
점검일: 2026-06-20
기준: WCAG 2.1 AA, WAI-ARIA APG (combobox 패턴)

---

## 점검 범위

실제 코드 Read 기반. 추측 없이 확인된 라인만 근거로 기재.

- 레이아웃/시맨틱: `app/layout.tsx`, `components/NavBar.tsx`, `app/page.tsx`, `app/company/[id]/page.tsx`, `app/monthly|memorial|awards|game/page.tsx`
- 키보드/ARIA: `components/SearchBox.tsx`
- 차트 SVG: `components/LineChart.tsx`, `components/HireLeaveChart.tsx`, `components/RiskGauge.tsx`
- 색 대비: `tailwind.config.ts`, `lib/format.ts`(`riskColor`), `app/globals.css`
- 게임 상태 안내/색 의존: `components/GuessGame.tsx`
- 리스트/카드: `components/MetricCard.tsx`, `components/NearbyList.tsx`, `components/CompanyRankList.tsx`
- 대체텍스트: 인라인 SVG / 이모지 사용처

대비 수치는 본 점검에서 직접 계산(상대휘도 → WCAG 명암비 공식).

---

## 발견 (심각도 · 파일·라인)

### [치명] 자동완성이 ARIA combobox 패턴을 전혀 구현하지 않음
`components/SearchBox.tsx`
- L66–74 `<input>`: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete`, `aria-activedescendant` 모두 없음. `aria-label="회사 검색"`만 존재(L72).
- L77 결과 `<ul>`: `role="listbox"`/`id` 없음. L79–90 옵션은 `<li><button>` 구조로 `role="option"`/`aria-selected`/고유 `id` 없음.
- L44–57 `onKey`: 위/아래 화살표로 `active` 인덱스만 바꿀 뿐(L48,L51), `aria-activedescendant`로 스크린리더에 "현재 몇 번째 항목 선택됨"을 알리지 않음. 따라서 시각장애 사용자는 화살표를 눌러도 무엇이 강조됐는지 알 수 없음.
- `Escape`로 목록 닫기 미구현(L46–56엔 ArrowDown/Up/Enter만). 키보드만으로 패널을 닫고 입력으로 돌아갈 표준 경로가 없음.
- L35–40 바깥 클릭 닫기는 `mousedown`만 구독 → 키보드 포커스가 패널 밖으로 빠져나가도(blur/Tab) 닫히지 않음.
- 결과 항목이 `<button>`이라 Tab으로 하나씩 순회는 가능하나, 이는 combobox 표준(입력에 포커스 유지 + activedescendant)과 어긋나며 항목이 많으면 Tab 트랩처럼 느껴짐.

### [치명] 노랑(`#FEE500`)을 텍스트 색으로 사용 — 명암비 약 1.2:1
`lib/format.ts` L20–24 `riskColor`는 점수 20–49에서 `#FEE500`을 반환하고, 이 값이 **텍스트/숫자 색**으로 쓰임:
- `components/RiskGauge.tsx` L49 게이지 중앙 숫자 `fill={riskColor(score)}` — 흰 배경 위 노랑 숫자.
- `components/NearbyList.tsx` L28–31 위험도 배지: `color: riskColor(...)`, 배경은 `riskColor+"1a"`(약 10% 틴트, 거의 흰색).
- `components/CompanyRankList.tsx` L43–48 동일 패턴.
- `app/awards/page.tsx` L24–29 점수 배지 동일.
- `app/company/[id]/page.tsx` L59–64 위험 라벨 배지, L71 코멘트 텍스트가 `riskColor`.

계산 결과(직접 산출):
- `#FEE500` 텍스트 / 흰색: **약 1.28:1**
- `#FEE500` 텍스트 / 종이색 `#F7F6F0`: **약 1.18:1**
- `#FEE500` 텍스트 / 10% 노랑 틴트 배지 배경: **약 1.23:1**

AA 일반 텍스트 4.5:1, 큰 텍스트 3:1 모두 크게 미달. 노랑은 거의 안 보임. (참고: 반대로 `#1A1A1A` 글자를 `#FEE500` 배경에 올리면 약 13.6:1로 충분 → 노랑은 배경으로만 써야 함.)

### [높음] `outline` 색 `#747878`이 본문 보조 텍스트로 광범위 사용 — 약 4.1:1
`tailwind.config.ts` L25 `outline: "#747878"`.
- 종이색 배경: **약 4.13:1**, 흰 배경: **약 4.47:1** → 일반 텍스트 AA(4.5:1) 미달(특히 종이 배경).
- 사용처 다수이고 대부분 작은 글씨(11–12px)라 더 불리: `app/page.tsx` L17 예시 검색 안내, 각 페이지 하단 면책 `text-outline`(`monthly` L20, `memorial` L21, `awards` L39, `company` L149), `NearbyList` L21·L25·L26 순번·인원, `CompanyRankList` L27, `SearchBox` L73 placeholder(`placeholder:text-outline`)·L89 인원, `MetricCard` L33 "위험도 기여".
- 차트 내 `#747878` 라벨(`LineChart` L61·L101·L107, `HireLeaveChart` L52·L90)도 동일 경계값.
- 참고로 `on-surface-variant #444748`은 종이 위 약 8.66:1로 양호.

### [높음] 차트 툴팁이 포인터 전용 — 키보드/스크린리더 접근 불가
`components/LineChart.tsx`, `components/HireLeaveChart.tsx`
- LineChart 히트 영역(L113–125)은 `onPointerEnter`/`onPointerDown`만. 키보드 포커스 불가(`tabIndex` 없음), `onFocus`/`onKeyDown` 없음. 툴팁(L128–136)은 마우스/터치로만 뜸.
- HireLeaveChart 막대(L65–88) 동일 — `onPointerEnter`/`onPointerDown`만.
- `role="img"`+`aria-label`(LineChart L56 "시계열 추이 차트", HireLeave L47 "입사·퇴사 흐름 차트")는 있으나 **라벨이 정적·일반적**이라 실제 수치(월별 값, 입·퇴사 인원)를 전혀 전달하지 못함. 데이터 자체가 스크린리더에 비공개.
- 결론: 차트의 모든 구체 정보가 키보드/스크린리더 사용자에게 차단됨.

### [중간] 색만으로 정답/오답·위험을 전달 (GuessGame 외)
`components/GuessGame.tsx`
- L115–117 정답/오답: 이모지(🎯/❌)+텍스트("정답!"/"땡!")가 함께 있어 색 단독은 아님 → 이 부분은 양호.
- 그러나 상태 변화가 `aria-live`로 알려지지 않음: L110–121 결과 블록이 조건부 렌더만 됨. 스크린리더는 버튼 누른 뒤 결과가 떴음을 자동 안내받지 못함.
- L57·L129 버튼은 일반 텍스트 라벨이라 무난. L96–107 선택 버튼도 이모지+텍스트.
- 색 단독 의존이 남은 곳: `MetricCard` L18 위험 수치 빨강/검정(`danger`)에 텍스트 표식 없음 — L23–32 "기여" 배지의 `+N`/`0` 부호로 보강은 되나 수치 자체 색은 색 의존. `CompanyRankList` L36 `danger` 라벨도 색만 다름(텍스트 내용은 동일 형식).

### [중간] 페이지에 skip-link 없음 / NavBar 랜드마크는 양호
- `app/layout.tsx` L35 `<NavBar/>`가 모든 페이지 상단. 본문으로 바로 가는 "건너뛰기" 링크 없음 → 매 페이지 내비 4개 링크를 키보드로 통과해야 함.
- 다만 시맨틱 구조는 대체로 양호: `NavBar`는 `<header><nav>`(L16–17), 각 페이지 `<main>` 사용(`page` L5, `company` L50, `monthly/memorial/awards/game` 각 L9). `company` 페이지 heading 위계도 h1(L65)→h2(L82,L142)→h3(L116,L120,L131)로 일관. `app/page.tsx`는 `<footer>`(L23)도 사용.
- 경미한 위계 흠: `awards`에서 카드 제목이 `<h2>`(L23)이고 그 아래 회사명은 `<p>`(L32)라 "상"명이 회사명보다 상위로 읽힘(의도상으론 회사가 주체) — 치명적이진 않음.

### [중간] 인터랙티브 SVG 아이콘에 접근성 처리 일관성 부족
- `SearchBox.tsx` L62 검색 돋보기 SVG는 `aria-hidden`(값 없이 표기, L62) — 장식이므로 숨김 의도는 맞으나 `aria-hidden="true"` 명시가 안전.
- `RiskGauge.tsx` L27–33 `role="img"`+`aria-label`로 점수·등급을 문장으로 제공(L31) → 차트 중 유일하게 비교적 잘 처리됨(좋은 예).

### [낮음] 이모지를 의미 전달에 사용
- `GuessGame` L60·L100·L106·L117 등 🚩/✅/🎯/❌/🎖️/🧲, `NavBar`/제목의 `.`(빨강 점, `NavBar` L19) 등. 이모지는 텍스트와 병기되어 의미 손실은 작으나, 스크린리더가 이모지 이름을 읽어 다소 장황(예: "백번 명중 표시"). 장식 이모지는 `aria-hidden` 처리 권장.

---

## 구체적 개선안 (ARIA · 키보드 대안)

### 1) SearchBox — APG combobox 패턴 적용
- 입력에:
  `role="combobox" aria-expanded={open} aria-controls="search-listbox" aria-autocomplete="list" aria-activedescendant={active>=0 ? \`opt-${results[active].id}\` : undefined}`
- 목록 `<ul>`: `id="search-listbox" role="listbox"`.
- 각 항목: `<li id={\`opt-${r.id}\`} role="option" aria-selected={active===i}>`. 내부를 `<button>`에서 `<div>`로 바꾸고 클릭은 `onMouseDown`(포커스 유지)로 처리하거나, 버튼 유지 시 `tabIndex={-1}`로 Tab 순회에서 제외.
- 키보드: `Escape`로 `setOpen(false)` 추가. `Home/End`로 처음/끝 이동(선택). ArrowDown이 닫힌 상태에서 열도록.
- 닫기: `mousedown` 외에 입력 `onBlur`(setTimeout 후 패널 밖이면 닫기) 또는 `focusout` 구독 추가.
- "검색 결과 N건" 라이브 안내: 결과 개수를 `aria-live="polite"`인 시각적 숨김(`sr-only`) 노드에 출력.

### 2) 노랑 위험 색 — 텍스트로 쓰지 말 것
- `riskColor`를 "배경용"과 "전경(텍스트)용"으로 분리. 텍스트용 warning은 어둡게(예: 갈색/주황 계열로 AA 충족하는 값), 또는 노랑은 항상 배경으로만 쓰고 그 위 글자는 `#1A1A1A`(약 13.6:1).
- 배지(`NearbyList`/`CompanyRankList`/`awards`)는 `배경=노랑, 글자=#1A1A1A` 조합으로 전환.
- 색만으로 등급을 구분하지 않도록 배지에 등급 텍스트(안전/주의/위험)나 아이콘 병기.

### 3) outline 보조 텍스트 색 상향
- `outline #747878`을 본문 텍스트로 쓸 때는 최소 `#5f6368`급(4.5:1 확보값)으로 올리거나, 면책·캡션 글씨를 `on-surface-variant #444748`로 교체. 11–12px는 "큰 텍스트" 예외(3:1)도 못 받으므로 4.5:1 필요.
- placeholder(`SearchBox` L73)도 동일 기준 적용.

### 4) 차트 키보드/스크린리더 대안
- 포인터 외 대안: 히트 영역/막대에 `tabIndex={0}` + `role="button"`(또는 `img`) + `aria-label`(예: "23년 4월, 1,240명") 부여하고 `onFocus`/`onKeyDown`(Enter/Space, Arrow로 이전·다음 포인트)로 `hi`/`hover` 갱신 → 키보드로 툴팁 탐색.
- 데이터 테이블 대안 제공: 차트 옆에 `sr-only` `<table>`(월 / 값 또는 입사 / 퇴사)을 두어 전체 수치를 스크린리더에 노출. `role="img"`의 `aria-label`도 "최저~최고, 마지막값" 요약으로 구체화.
- `RiskGauge`(L31)처럼 동적 수치를 라벨에 담는 방식을 다른 차트에도 확장.

### 5) GuessGame 상태 안내
- 결과 블록(L110–121)을 감싸는 컨테이너에 `role="status" aria-live="assertive"` 부여 → "정답!/땡!"과 점수가 음성으로 자동 안내.
- 정답률·연속 점수(L70–78) 갱신도 `aria-live="polite"` 영역으로.

### 6) 랜드마크·skip-link·아이콘
- `layout.tsx` `<body>` 최상단에 `sr-only focus:not-sr-only`로 `<a href="#main">본문 바로가기</a>` 추가, 각 `<main>`에 `id="main"`(및 `tabIndex={-1}`).
- 장식 SVG/이모지는 `aria-hidden="true"` 명시(`SearchBox` L62는 값 보강), 의미 있는 이모지는 인접 텍스트로 의미 보장(이미 대체로 됨).

---

## 반성점 (솔직)

- 정적 분석만 했다. 실제 스크린리더(NVDA/VoiceOver)나 키보드 수동 조작, axe/Lighthouse 자동 점검을 돌려 검증하지 못했다. 특히 combobox의 실제 음성 출력과 차트 포커스 순서는 브라우저에서 재확인이 필요하다.
- 대비 수치는 직접 계산했고 배지 배경(`+"1a"` 알파 틴트)은 종이/흰 배경 위에서 거의 흰색이 된다고 근사했다. 실제 합성색은 부모 배경에 따라 미세하게 달라질 수 있으니 1.2:1대의 결론은 유지되나 소수점은 참고치다.
- 시맨틱 구조와 `globals.css`의 focus-visible/reduced-motion 처리는 기대보다 양호했다 — 처음엔 더 많은 구조적 결함을 예상했으나, 실제 치명 결함은 (a) combobox ARIA 부재, (b) 노랑 텍스트 대비, (c) 차트 키보드 차단 세 가지에 집중돼 있었다.
- `riskColor`가 색을 전경/배경 구분 없이 한 함수로 반환하는 설계가 대비 문제의 뿌리다. 토큰 레벨에서 "텍스트용/배경용" 분리가 선행돼야 개별 수정이 의미를 갖는다 — 이 구조적 권고를 개선안 2)에 반영했다.
