# Round3 Pass 06 — 접근성(a11y) 전수 재점검

대상: `좋소판별기` (Next.js App Router / React / Tailwind)
재점검일: 2026-06-20
기준: WCAG 2.1 AA, WAI-ARIA APG (combobox 패턴)
선행 문서: `docs/review/round2-06-accessibility.md`, `docs/review/pass-06-accessibility.md`
방법: 코드 정적 분석 + 대비비 직접 산출(상대휘도/4.5:1 계산). 브라우저 SR 음성 출력은 미수행.

---

## 요약 — Round2 P1 지적사항 처리 현황

| # | P1 항목 | 파일 | Round2 | Round3 결과 |
|---|---------|------|--------|-------------|
| 1 | SearchBox combobox 패턴 부재 | `components/SearchBox.tsx` | 미수정 | **수정됨**(거의 완전, 미세 잔여 2건) |
| 2 | 노랑 `#FEE500` 텍스트 대비 미달 | `lib/format.ts` 외 5곳 | 미수정 | **수정됨**(`riskTextColor` 분리, 본문 충족·배지 경계값) |
| 3 | 차트 sr-only 데이터 대안 | `LineChart`/`HireLeaveChart` | 미수정 | **부분 수정**(sr-only 테이블 추가, 키보드 조작은 여전히 불가) |

세 항목 모두 코드가 실제로 변경되었음을 확인. `globals.css`에 `.sr-only`(L22–32)·`focus-visible`(L41–48)·`prefers-reduced-motion`(L51–60)이 추가/유지되어 양호.

---

## 평가 항목별 점검

### (1) riskTextColor 대비 — 본문 텍스트 충족, 배지 배경은 경계값 미달

`lib/format.ts` L28–32. 측정값(sRGB 상대휘도, WCAG 공식):

| 색 | 용도 | vs 흰색 `#FFFFFF` | vs 종이 `#F7F6F0` | AA(4.5:1) |
|----|------|------|------|------|
| `#8A6D00` (amber) | 주의 텍스트 | **4.92** | **4.54** | 통과 |
| `#1F7A4D` (safe) | 안전 텍스트 | **5.32** | **4.91** | 통과 |
| `#C92B20` (high) | 위험 텍스트 | **5.45** | **5.04** | 통과 |

순수 흰/종이 배경 위 텍스트는 세 색 모두 AA를 통과한다. 노랑 `#FEE500`을 텍스트로 직접 쓰던 Round2의 1.2:1 문제는 해소됨.

**그러나 배지(badge)는 텍스트가 단색 위가 아니라 `riskColor()`의 10% 틴트 위에 얹힌다.** `CompanyRankList.tsx` L45 / `NearbyList.tsx` L30 / `awards/page.tsx` L26 / `company/[id]/page.tsx` L80의 `background: ${riskColor}1a`(=10% alpha). 카드 자체가 `bg-surface-white`(`#FFFFFF`)이므로 합성 배경 위 대비는:

| 색 | 틴트배경(흰 위) | 비 | 틴트배경(종이 위) | 비 |
|----|------|----|------|----|
| amber | `#FFFCE5` | **4.76** | `#F8F4D8` | **4.43** |
| safe | `#E9F3EE` | **4.69** | `#E2EBE1` | **4.36** |
| high | `#FBEBE9` | **4.72** | `#F4E2DC` | **4.35** |

카드 배경(흰색)에서는 통과(4.69~4.76), 그러나 종이배경(`bg-surface-paper`) 위에 배지가 놓이는 경우 4.35~4.43으로 **4.5:1을 근소하게 미달**. 배지 숫자는 12px 일반 텍스트라 큰 텍스트 예외(3:1) 적용 불가. 실사용처 배지는 대부분 흰 카드 안이라 실질 위험은 낮으나, 경계값이라 `1a`(10%)를 `26`(15%)로 올리면 여유 확보 가능.

추가 발견(Round2 미지적): `MetricCard.tsx` L23–32 "위험도 기여" 배지는 `riskTextColor`가 아닌 원색을 10% 틴트 위에 쓴다 — 빨강 `#D8362A`/틴트 = **4.06**, 초록 `#2A8D5C`/틴트 = **3.69**로 둘 다 AA 미달. 다만 `+N`/`0`은 옆의 "위험도 기여" 라벨로 의미가 중복 전달되는 보조 정보.

### (2) 차트 sr-only 테이블 — 데이터 전달 양호, role 중복 announce 우려

- `LineChart.tsx` L139–152 / `HireLeaveChart.tsx` L108–122: `<table className="sr-only">`에 `<caption>`, `<thead>`, 월별 전체 행을 실제 수치로 렌더. 데이터는 정확히 전달된다(LineChart: 월·값+단위, HireLeave: 월·입사·퇴사 3열). **실데이터 전달은 충족.**
- **문제 — 중복 announce**: SVG가 `role="img" aria-label="시계열 추이 차트"`(LineChart L56) / `"입사·퇴사 흐름 차트"`(HireLeave L47)로 노출되고, 바로 뒤 sr-only 테이블도 노출된다. 스크린리더는 (a) "시계열 추이 차트, 이미지" → (b) 동일 데이터의 표를 연달아 읽어 같은 정보를 두 번 만난다. SVG `aria-label`은 정적·일반 문구라 수치가 없어 정보 가치가 낮음. → **SVG에 `aria-hidden="true"`를 주고 테이블만 접근성 트리에 남기는 것이 정석**(Round2 수정안 L176도 동일 권고). 현재 svg는 `aria-hidden` 미적용.
- `<th>` scope 부재: 테이블 헤더가 `<th>`이지만 행 헤더(`<th scope="row">`)는 없어 월이 `<td>`로 렌더(L147, L116). SR 표 탐색 시 행 맥락이 약함(경미).
- 키보드 조작은 여전히 불가(아래 종합 참고).

### (3) combobox 패턴 완전성 — 거의 완전, 잔여 2건

`components/SearchBox.tsx`:
- L82–86 input: `role="combobox"`, `aria-expanded`(L83, results>0 연동), `aria-controls="search-listbox"`, `aria-autocomplete="list"`, `aria-activedescendant`(L86, `search-opt-${active}`) — **모두 구현**. L91 `<ul id="search-listbox" role="listbox">`, L93 `<li role="option" id="search-opt-${i}" aria-selected>` — **id/role 정합**.
- L50–52 Escape로 `setOpen(false)` — **구현**. ArrowUp/Down/Enter(L55–65) 정상.
- 잔여 1: **`aria-activedescendant` id 형식 불일치 리스크 없음 확인됨**(input L86과 li L93 모두 `search-opt-${i}` 인덱스 기반으로 일치). 양호.
- 잔여 2(경미): 닫기 트리거가 `mousedown`(L40–44)만. **키보드 Tab으로 입력을 벗어나면 패널이 안 닫힌다**(`onBlur` 미처리). Escape는 닫지만 Tab 이탈 시 listbox가 떠 있는 상태로 포커스가 다음 요소로 감.
- 잔여 3(경미): 닫힌 상태에서 ArrowDown으로 여는 패턴(L54 early-return) 미구현 — APG 권장이나 필수 아님.
- 결론: APG combobox의 핵심(role/state/activedescendant/option/Escape/포커스 유지 tabIndex=-1)은 충족. Tab 이탈 닫기만 보완 권장.

### (4) explore 폼 select 라벨 / 네비 터치타깃 / 모바일

- `app/explore/page.tsx` L52·58·63: 세 `<select>` 모두 `aria-label`(지역/위험 등급/정렬) 보유. 시각 라벨(`<label>`)은 없지만 aria-label로 접근성 이름은 확보. **양호**(다만 보이는 라벨이 없어 인지장애 사용자에는 placeholder 옵션 의존).
- L68 제출 버튼 텍스트 "적용" 명확.
- **터치타깃 미달**: `NavBar.tsx` L29 링크 `px-2.5 py-1.5`(≈ 세로 12px+텍스트≈20px → 약 32px 높이). WCAG 2.5.5(AAA 44px) 및 2.5.8(AA 24px)에서, AA 24px는 충족하나 권장 44px 미달. 모바일에서 `overflow-x-auto`(L22) 가로 스크롤 네비라 인접 타깃 간 간격은 확보(`gap-1`).
- explore select `py-2`(L34) ≈ 36px, 검색 input `py-4`(SearchBox L70) ≈ 56px — 양호.

### (5) MetricCard / 배지 — 색+텍스트 병행(색맹 안전성)

- `MetricCard.tsx`: 값 색이 `danger`면 빨강(L18)이나, `label`(L17)·`sub`(L21)·"위험도 기여"(L33) 텍스트가 의미를 병기 → 색 단독 의존 아님. 기여 배지 `+N`/`0`도 부호로 구분. **양호**.
- **위험도 배지(숫자만)**: `CompanyRankList`/`NearbyList`/`awards`의 배지는 점수 숫자 + 색만 표시하고 "안전/주의/위험" 등급 텍스트가 **없다**. 색맹 사용자는 색으로 등급 구분 불가, 숫자(0~100)로만 추론해야 함. Round2 수정안 L150은 등급 텍스트 병기를 권고했으나 미반영. (company 헤더 L82 배지는 `c.risk_label` 텍스트가 있어 양호.)
- 차트 범례(HireLeave L98–103): "입사"/"퇴사" 텍스트 라벨 + 색 병기 → 색맹 안전.

### (6) heading 위계 / landmark

- 각 페이지 `<main>` 존재(home/explore/company/awards). `NavBar`는 `<header>`+`<nav>`. company는 추가 `<header>`(L75)·`<section>`·`<footer>`. **landmark 양호**.
- heading 위계: home h1(L11) 단독 OK. explore h1(L45) OK. **company 페이지 위계 점프 없음**: h1(L84) → h2 "핵심 지표"(L135)/"주변 회사"(L195) → h3 차트들(L169,173,184). 정연함.
- awards: h1(L11) → 각 카드 h2(L23). OK.
- **누락**: skip-link(본문 바로가기) 없음 — 매 페이지 NavBar 5개 링크를 키보드로 통과해야 본문 도달. (Round1부터 미해결, 경미~보통)

---

## 발견 우선순위 (고친 효과 큰 순)

1. **[보통] 차트 SVG `aria-hidden="true"` 누락 → 중복 announce.** `LineChart.tsx` L56 / `HireLeaveChart.tsx` L47 svg에 `aria-hidden="true"` 추가하면 sr-only 테이블만 읽혀 중복 제거. 한 줄 수정, 효과 확실.
2. **[보통] 위험도 배지 색 단독 의존(색맹).** `CompanyRankList`/`NearbyList`/`awards` 배지에 "안전/주의/위험" 텍스트 병기 또는 점수 옆 `risk_label` 노출.
3. **[경미] 배지 틴트 대비 경계값(4.35~4.43).** 종이배경 위 배지의 틴트 alpha를 `1a`(10%)→`26`(15%)로 상향하면 흰·종이 양쪽에서 4.5:1 확보. `MetricCard` 기여 배지(4.06/3.69)는 텍스트색을 `riskTextColor`급으로 진하게.
4. **[경미] SearchBox Tab 이탈 닫기.** input `onBlur`에서 `setTimeout`으로 `boxRef` 외부 포커스 시 `setOpen(false)`.
5. **[경미] 차트 키보드 조작 부재.** sr-only 테이블로 정보는 닿지만, 시각+모터 사용자(SR 미사용 키보드)는 툴팁 수치 접근 불가. 컨테이너 `tabIndex=0`+좌우 화살표로 `hi` 이동(Round2 수정안 패턴).
6. **[경미] skip-link 부재**, explore select 시각 라벨 부재, NavBar 터치타깃 44px 미만.

---

## 반성점

- 정적 분석 + 대비 계산 한정. NVDA/VoiceOver 실제 음성, combobox `aria-activedescendant` 음성 추종, 차트 중복 announce 실제 청취, 키보드 포커스 순서는 미검증 — 브라우저 확인 필요.
- 대비비는 sRGB 상대휘도 공식으로 직접 산출했고 틴트 배지는 alpha 합성(10% over white/paper)을 재현해 계산했다. 다만 배지가 실제로 흰 카드 위인지 종이 위인지는 사용처마다 달라, 경계값(4.35~4.43) 배지의 실제 노출 배경은 컴포넌트별 재확인이 정확하다.
- `MetricCard` 기여 배지 대비 미달(4.06/3.69)은 Round2가 놓친 신규 발견. 보조 정보라 P2지만 기록.
