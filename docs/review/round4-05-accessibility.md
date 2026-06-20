# Round4 Pass 05 — 접근성(a11y) 재점검 (신규 UI 포함)

대상: `좋소판별기` (Next.js App Router / React / Tailwind)
재점검일: 2026-06-20
기준: WCAG 2.1 AA (대비 4.5:1 / 비텍스트 3:1 / 터치타깃 2.5.8 24px), WAI-ARIA APG combobox
선행 문서: `docs/review/round3-06-accessibility.md`, `round3-05-search-a11y.md`
방법: 코드 정적 분석 + 대비비 직접 산출(sRGB 상대휘도 공식, 틴트는 alpha 합성 재현). SR 실제 음성·키보드 순서는 미검증.
신규 점검 대상: `app/company/[id]/page.tsx`(갈아탈 만한 곳·위험도 사다리), `components/Footer.tsx`, `app/about/page.tsx`, `components/NavBar.tsx`.

---

## 요약 — Round3 P1 처리 현황 + 신규 UI

| # | 항목 | 결과 |
|---|------|------|
| R3-1 | 차트 SVG `aria-hidden` 누락 | **수정됨** — `LineChart.tsx` L57 `aria-hidden="true"` 적용. `HireLeaveChart`도 동일 추정(중복 announce 해소) |
| R3-2 | 위험도 배지 색 단독 의존 | **부분** — company 헤더는 `risk_label` 텍스트 동반(양호), 그러나 사다리·NearbyList·랭크 배지는 여전히 숫자+색만 |
| 신규-A | 갈아탈/사다리/Nearby 배수 배지의 `#2A8D5C` **텍스트** | **신규 P1 — AA 미달**(아래 (1)) |
| 신규-B | 사다리 방향 라벨 색 단독 | 화살표(↑↓)+텍스트 병기로 **양호**(아래 (2)) |

---

## 평가 항목별 점검

### (1) 신규 블록 색 대비 — `#2A8D5C`(risk-safe)를 텍스트로 직접 사용해 AA 미달 [P1]

핵심 회귀. 신규 UI 곳곳이 `riskTextColor()`(진한 `#1F7A4D`)가 아니라 **원색 `#2A8D5C`(`text-risk-safe`)를 텍스트로** 쓴다. `#2A8D5C`는 채도 높은 중간톤이라 밝은 배경에서 4.5:1을 못 넘긴다.

| 사용처 | 텍스트색 | 배경 | 대비비 | AA(4.5) |
|--------|---------|------|--------|---------|
| 갈아탈 블록 제목 "💡 갈아탈 만한 곳" (`page.tsx` L252) | `#2A8D5C` | `bg-risk-safe/[0.07]` 틴트(흰 카드 위 `#F0F7F4`) | **3.82** | 미달 |
| 갈아탈 블록 "N배" (`page.tsx` L259) | `#2A8D5C` | 동일 틴트 | **3.82** | 미달 |
| NearbyList 배수 배지 "N배" (`NearbyList.tsx` L30) | `#2A8D5C` | `bg-risk-safe/10`(흰 위 `#EAF4EF`) | **3.69** | 미달 |
| (참고) `#2A8D5C` 순수 흰 위 / 종이 위 | — | `#FFFFFF` / `#F7F6F0` | **4.15 / 3.83** | 미달 |

→ 글자가 11~14px 일반 텍스트라 큰 텍스트 예외(3:1) 적용 불가. **`text-risk-safe`(#2A8D5C)를 텍스트로 쓰는 모든 곳을 `riskTextColor` 계열 `#1F7A4D`로 교체**하면 흰/종이/틴트 위 모두 통과(틴트 위 4.89, 흰 위 5.32). 한편 사다리 점수 숫자(`page.tsx` L221·L234)는 이미 `riskTextColor()`를 써 `#1F7A4D`=5.32, `#C92B20`=5.45로 **통과**. 즉 같은 페이지 안에서 점수 숫자는 옳게, 갈아탈/배수 배지는 그르게 쓴 불일치다.

### (2) 색맹(색 단독 의미 전달) — 사다리는 양호, 점수 배지는 여전히 색 의존

- **위험도 사다리 방향 라벨**: "↑ 더 위험한 곳"(`text-risk-high`)·"↓ 덜 위험한 곳"(`text-risk-safe`)는 **화살표 기호 + 한국어 텍스트**로 의미를 명시 → 색을 못 봐도 구분 가능. **색맹 안전**. (라벨 색 대비: `#D8362A`/흰 4.69 통과, 단 `#2A8D5C`/흰 4.15는 (1)과 동일 미달이라 `#1F7A4D` 권장.)
- **갈아탈 블록**: "더 주면서 덜 위험"이라는 텍스트 설명이 있어 의미는 색 비의존. 양호.
- **여전히 색 단독**: NearbyList 점수 배지(`riskColor`+숫자, 등급 텍스트 없음, `NearbyList.tsx` L35–40), 사다리 점수 숫자 색. 색맹은 0~100 숫자로만 위험도 추론. Round3-2 권고(등급 텍스트 병기) 미반영 — 보통 우선순위로 유지.

### (3) NavBar 6항목 — 모바일 가로 스크롤·터치타깃

- 6항목 = 브랜드 로고(`/`) + 5개 메뉴(`NavBar.tsx` L6–12). `<ul>`에 `-mx-1 ... overflow-x-auto px-1`(L22)로 **가로 스크롤** 처리 → 좁은 화면에서 6항목이 잘리지 않고 스와이프 가능. 가로 오버플로 위험 낮음.
- 모바일 레이아웃: `flex-col` → `sm:flex-row`(L18)로 브랜드/메뉴가 세로 분리돼 줄바꿈 충돌 없음.
- **터치타깃**: 메뉴 링크 `px-2.5 py-1.5`(L29) ≈ 높이 32px. WCAG 2.5.8(AA 24px)는 충족, 권장 44px(2.5.5 AAA)는 미달 — Round3와 동일, 경미.
- overflow-x 스크롤 영역에 키보드 포커스 이동 시 자동 스크롤은 브라우저 기본 동작에 의존(미검증).

### (4) Footer — 링크·heading 위계

- `Footer.tsx`: `<footer>` 랜드마크 + 내부 `<nav>`(L11)로 구조 양호. 링크 3개(홈/이용안내/원본데이터), 외부 링크 `rel="noopener noreferrer"` 적용(L14).
- 링크 색 `text-on-surface-variant`(#444748)/종이 = **8.66** → AA 충분. 면책 문구 `text-outline`(#747878)/종이 = **4.13** → 일반 텍스트 4.5:1 **근소 미달**(12px). 면책 보조문이지만 본문 가독 텍스트이므로 `on-surface-variant`로 올리면 안전. (이는 신규 회귀 아닌 기존 outline 색 한계.)
- heading: Footer는 heading 없이 `<p>`+`<nav>`만 — 푸터엔 적절(위계 점프 없음).

### (5) /about — 구조·대비

- `about/page.tsx`: `<main>` 안 h1(L20) → 반복 `Section` h2(L11). **위계 정연**(h1→h2, 점프 없음). 랜드마크 양호.
- 본문 텍스트 `text-on-surface-variant`(#444748)/종이 = **8.66**, 보조 `text-outline`은 미사용 → 대비 양호.
- `<b className="tnum">` 강조는 굵기+탭너머로 시각 구분, 의미는 문맥으로 전달 → 색 비의존.
- 외부 링크 없음(텍스트만), 리스트 `<ul role 기본>` 시맨틱 정상. 특이 a11y 결함 없음.

### (6) combobox / 차트 a11y 유지 확인

- **combobox 유지**: `SearchBox.tsx` `role="combobox"`(L82)·`aria-expanded`(L83)·`aria-controls`·`aria-autocomplete="list"`·`aria-activedescendant`(L86) + `listbox`/`option` id 정합(L91·93) 모두 **유지**. Escape 닫기(L50) 정상. 잔여: Tab 이탈 시 `onBlur` 닫기 미처리(L39–45 mousedown만) — Round3와 동일 경미.
- **차트 유지+개선**: `LineChart.tsx` L57 SVG `aria-hidden="true"` 적용으로 Round3 P1(중복 announce) 해소. sr-only 테이블 대안은 유지 추정. 키보드 조작(툴팁 수치 접근)은 여전히 불가 — 경미.

---

## 발견 우선순위 (효과 큰 순)

1. **[P1] `#2A8D5C` 텍스트 AA 미달(3.69~4.15).** 갈아탈 블록 제목·N배(`page.tsx` L252·259), NearbyList 배수 배지(`NearbyList.tsx` L30), 사다리 "덜 위험한 곳" 라벨(L228)의 `text-risk-safe`를 `riskTextColor` 계열 `#1F7A4D`(틴트 위 4.89·흰 위 5.32)로 교체. 클래스/스타일만 바꾸는 저위험 수정, 효과 확실.
2. **[보통] 점수 배지 색 단독 의존(색맹).** NearbyList·사다리 점수에 등급 텍스트(안전/주의/위험) 또는 `risk_label` 병기. (Round3-2 미해결 유지.)
3. **[경미] Footer 면책 문구 `#747878`/종이 4.13.** `text-on-surface-variant`로 상향하면 4.5:1 확보.
4. **[경미] NavBar 터치타깃 44px 미만**(현 32px, AA 24는 충족), SearchBox Tab 이탈 닫기, 차트 키보드 조작 — Round3 잔여 유지.

---

## 반성점

- 대비비는 sRGB 상대휘도 공식으로 직접 산출하고, 틴트 배경(risk-safe/0.07·/0.10)은 흰 카드/종이 위 alpha 합성을 재현해 계산했다. 단 갈아탈 블록은 흰 카드(`bg-surface-white`) 위에 놓이는 것으로 확인했으나(L83 헤더~L245 섹션 모두 흰 카드), 실제 렌더에서 중첩 배경이 다르면 ±0.1 오차 가능.
- 핵심 신규 회귀(`#2A8D5C` 텍스트)는 같은 파일이 점수 숫자엔 `riskTextColor`를 옳게 쓰면서 갈아탈/배수 배지엔 원색을 쓴 **개발자 실수성 불일치**로 보인다 — 토큰 사용 규칙(텍스트=riskTextColor, 트랙/배경=riskColor)을 코드 주석/린트로 강제하면 재발 방지.
- NVDA/VoiceOver 실제 음성, 사다리·갈아탈 블록의 SR 읽기 순서, NavBar 키보드 포커스 가로 스크롤 추종은 미검증 — 브라우저 확인 필요.
