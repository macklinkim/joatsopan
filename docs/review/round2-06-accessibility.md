# Round2 Pass 06 — 접근성(a11y) 재점검

대상: `좋소판별기` (Next.js App Router / React / Tailwind)
재점검일: 2026-06-20
기준: WCAG 2.1 AA, WAI-ARIA APG (combobox 패턴)
선행 문서: `docs/review/pass-06-accessibility.md`, `docs/review/pass-05-ui-ux-responsive.md`, `docs/review/SUMMARY.md`

---

## 요약 — P1 지적사항 잔존 여부

| # | P1 항목 | 파일 | 1차 지적 | 재점검 결과 |
|---|---------|------|----------|-------------|
| 1 | 검색 자동완성 ARIA combobox 부재 | `components/SearchBox.tsx` | 치명 | **미수정 (잔존)** |
| 2 | 노랑 `#FEE500` 텍스트 대비 미달(~1.2:1) | `lib/format.ts` + RiskGauge/배지 | 치명 | **미수정 (잔존)** |
| 3 | 차트 툴팁 키보드/스크린리더 불가 | `LineChart.tsx`, `HireLeaveChart.tsx` | 높음 | **미수정 (잔존)** |

세 항목 모두 코드 변경 흔적이 없다. `globals.css`의 `focus-visible`(L28–35) / `prefers-reduced-motion`(L38–47)은 1차와 동일하게 양호하게 유지됨.

---

## 발견 (근거 라인 재확인)

### [치명·잔존] 1. SearchBox — combobox 패턴 전무
`components/SearchBox.tsx`
- L66–74 `<input>`: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete`, `aria-activedescendant` 전부 없음. `aria-label="회사 검색"`(L72)만 존재.
- L77 `<ul>`: `role="listbox"`/`id` 없음. L79–90 항목은 `<li><button>`이며 `role="option"`/`aria-selected`/고유 `id` 없음.
- L44–57 `onKey`: ArrowDown/Up/Enter만 처리. `active` 인덱스만 갱신할 뿐 `aria-activedescendant` 연동이 없어 스크린리더가 "몇 번째 항목 강조"를 못 읽음. **`Escape` 미구현**.
- L34–40 바깥 닫기는 `mousedown`만 구독 → 키보드 blur/Tab로 패널 밖으로 나가도 안 닫힘.
- 근거: 화살표 동작은 시각적 하이라이트(L84 `active===i` 배경색)에만 반영. 비시각 사용자에게 전달 경로 없음.

### [치명·잔존] 2. 노랑 `#FEE500`을 텍스트 색으로 사용
- `lib/format.ts` L20–24 `riskColor`가 score 20–49에서 `#FEE500` 반환. 전경/배경 구분 없는 단일 함수 그대로.
- 텍스트로 쓰이는 곳(모두 잔존): `RiskGauge.tsx` L48 게이지 중앙 숫자 `fill={riskColor(score)}`; `NearbyList.tsx` L30 `color: riskColor(...)`+`bg+"1a"`; `CompanyRankList.tsx` L45 동일; `awards/page.tsx` L26 동일; `company/[id]/page.tsx` L61·L71 배지·코멘트.
- 대비(1차 산출 재확인): `#FEE500`/흰색 ≈ 1.28:1, /종이색 `#F7F6F0` ≈ 1.18:1, /10% 틴트 배지 ≈ 1.23:1. AA 4.5:1(큰 텍스트 3:1) 크게 미달.
- **프로젝트 자체 규칙 위반**: `작업계획서.md:383`이 "`risk-warning` 노랑은 텍스트색으로 쓰지 말 것, 배경/마커로만(텍스트는 `#1A1A1A`)"이라 명시. 코드가 이를 어기고 있음.

### [높음·잔존] 3. 차트 툴팁 포인터 전용
`components/LineChart.tsx`, `components/HireLeaveChart.tsx`
- LineChart 히트 컬럼(L113–125): `onPointerEnter`/`onPointerDown`만. `tabIndex`/`onFocus`/`onKeyDown` 없음. SVG `onPointerLeave`(L56)만 추가됨.
- HireLeaveChart 막대(L65–88): 동일하게 포인터만.
- `role="img"`+`aria-label`(LineChart L56 "시계열 추이 차트", HireLeave L47 "입사·퇴사 흐름 차트")는 있으나 **정적·일반 라벨**이라 월별 실수치를 전혀 전달 못 함.
- 결론: 키보드/스크린리더 사용자는 차트 수치에 접근 불가.

---

## 적용가능 코드수정안

### 1) SearchBox — APG combobox 패턴 (효과 큰 순 1위)
입력과 목록에 role/속성을 부여하고 Escape/focusout을 처리한다.

```tsx
// onKey 확장: Escape 닫기 + 닫힌 상태에서 ArrowDown으로 열기
const onKey = (e: React.KeyboardEvent) => {
  if (e.key === "Escape") { setOpen(false); setActive(-1); return; }
  if (!open || !results.length) {
    if (e.key === "ArrowDown" && results.length) { setOpen(true); setActive(0); e.preventDefault(); }
    return;
  }
  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
  else if (e.key === "Home") { e.preventDefault(); setActive(0); }
  else if (e.key === "End") { e.preventDefault(); setActive(results.length - 1); }
  else if (e.key === "Enter") {
    e.preventDefault();
    if (active >= 0) go(results[active].id);
    else if (results[0]) go(results[0].id);
  }
};

// <input> — combobox 역할/상태/활성항목 연결
<input
  value={q}
  onChange={(e) => setQ(e.target.value)}
  onFocus={() => results.length && setOpen(true)}
  onKeyDown={onKey}
  role="combobox"
  aria-expanded={open && results.length > 0}
  aria-controls="search-listbox"
  aria-autocomplete="list"
  aria-activedescendant={active >= 0 ? `opt-${results[active].id}` : undefined}
  placeholder="회사명 또는 사업자번호 검색 (예: 소프트)"
  aria-label="회사 검색"
  className="w-full bg-transparent text-base outline-none placeholder:text-outline"
/>

// 목록 — listbox + option, 항목은 Tab 순회에서 제외(tabIndex=-1), 클릭은 onMouseDown로 포커스 유지
<ul id="search-listbox" role="listbox" className="absolute z-20 mt-2 w-full ...">
  {results.map((r, i) => (
    <li
      key={r.id}
      id={`opt-${r.id}`}
      role="option"
      aria-selected={active === i}
    >
      <button
        type="button"
        tabIndex={-1}
        onMouseEnter={() => setActive(i)}
        onMouseDown={(e) => { e.preventDefault(); go(r.id); }}
        className={`flex w-full items-baseline gap-2 px-5 py-3 text-left ${active === i ? "bg-surface-paper" : ""}`}
      >
        {/* ...기존 span들... */}
      </button>
    </li>
  ))}
</ul>

// 결과 개수 라이브 안내(시각 숨김)
<span className="sr-only" aria-live="polite">
  {open && q.trim() ? `검색 결과 ${results.length}건` : ""}
</span>
```
추가로 키보드 blur 닫기는 `mousedown` 구독에 더해 입력 `onBlur`에서 `setTimeout(() => { if (!boxRef.current?.contains(document.activeElement)) setOpen(false); }, 0)` 처리.
주의: `sr-only` 유틸이 없다면 `globals.css`에 표준 클립 규칙을 추가해야 함(`.sr-only{position:absolute;width:1px;height:1px;...overflow:hidden;clip:rect(0 0 0 0);}` 및 `focus:not-sr-only`).

### 2) 노랑 위험색 — 텍스트용/배경용 토큰 분리 (효과 큰 순 2위)
`lib/format.ts`에 전경(텍스트)용 함수를 분리하고, 노랑은 배경에서만 쓰고 그 위 글자는 `#1A1A1A`로 둔다.

```ts
// lib/format.ts
export function riskColor(score: number): string {     // 마커/게이지 트랙 등 "배경/도형"용 (기존 유지)
  if (score < 20) return "#2A8D5C";
  if (score < 50) return "#FEE500";
  return "#D8362A";
}

// 텍스트/숫자용: warning을 AA 충족하는 어두운 호박색으로
export function riskTextColor(score: number): string {
  if (score < 20) return "#1F7A4D"; // 종이 위 ~4.7:1
  if (score < 50) return "#8A6D00"; // 어두운 앰버, 종이 위 ~4.6:1 (노랑 대체)
  return "#C32B20";                  // high도 살짝 진하게 ~4.6:1
}
```

```tsx
// RiskGauge.tsx L48 — 중앙 숫자는 텍스트용 색으로
<text /* ... */ fill={riskTextColor(score)}>{score}</text>
```

```tsx
// 배지 패턴(NearbyList L30 / CompanyRankList L45 / awards L26 / company L61) 공통 교체
// 노랑 배경 + 검정 글자(약 13.6:1)로, 색 외에 등급 텍스트도 병기
import { riskColor, riskTextColor } from "@/lib/format";
<span
  className="... inline-flex items-center gap-1"
  style={{ background: `${riskColor(c.risk_score)}26`, color: riskTextColor(c.risk_score) }}
>
  {c.risk_score}
  <span className="text-[10px] font-medium">
    {c.risk_score < 20 ? "안전" : c.risk_score < 50 ? "주의" : "위험"}
  </span>
</span>
```
핵심: 텍스트는 절대 `#FEE500`을 직접 받지 않는다(`riskTextColor` 사용). 등급 텍스트 병기로 색 단독 의존도 함께 해소. (장기적으로는 `pass-09`의 `RISK_COLOR` SSOT 객체로 통합 권장.)

### 3) 차트 키보드 접근 + sr-only 데이터 테이블 (효과 큰 순 3위)
컨테이너를 포커스 가능하게 하고 좌우 화살표로 포인트를 이동, 동시에 `sr-only` 테이블로 전체 수치를 노출한다.

```tsx
// LineChart.tsx — <div ref={ref}>에 키보드 핸들러
<div
  ref={ref}
  className="w-full"
  tabIndex={0}
  role="application"
  aria-label="시계열 추이 차트. 좌우 화살표로 각 시점 값을 탐색"
  onFocus={() => setHi((h) => (h === null ? data.length - 1 : h))}
  onBlur={() => setHi(null)}
  onKeyDown={(e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setHi((h) => Math.min(data.length - 1, (h ?? -1) + 1)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setHi((h) => Math.max(0, (h ?? data.length) - 1)); }
    else if (e.key === "Escape") { setHi(null); }
  }}
>
  <svg /* ... 기존 그대로 ... */ aria-hidden="true">
    {/* svg 내부는 시각 전용으로 두고 aria-hidden 처리 */}
  </svg>

  {/* 스크린리더 전용 데이터 테이블 */}
  <table className="sr-only">
    <caption>월별 추이</caption>
    <thead><tr><th>월</th><th>값{unit ? `(${unit})` : ""}</th></tr></thead>
    <tbody>
      {data.map((d) => (
        <tr key={d.ym}>
          <th scope="row">{ymLabel(d.ym)}</th>
          <td>{Math.round(d.value).toLocaleString()}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```
`hi`가 화살표로 갱신되면 기존 호버 가이드·툴팁(L89–136)이 그대로 키보드에서 재사용된다. HireLeaveChart도 동일 패턴: 컨테이너 `tabIndex={0}`+화살표로 `hover.i` 이동(`hover.kind`는 월 단위로 입사 우선 표시), `sr-only` 테이블은 `<th>월</th><th>입사</th><th>퇴사</th>` 3열로 구성. (위 `sr-only` 클래스는 1)과 동일하게 globals.css 정의 필요.)

---

## 우선순위 (고친 효과 큰 순)

1. **SearchBox combobox** — 사이트 진입점인 검색의 핵심 인터랙션이 비시각 사용자에게 사실상 차단. 표준 패턴이라 수정 범위가 한 파일로 한정되고 효과가 가장 큼.
2. **노랑 텍스트 대비** — 20–49점(주의) 회사의 위험도 숫자/배지가 거의 안 보임. 다수 컴포넌트에 영향(5개 사용처)이지만 `riskTextColor` 분리 한 번으로 일괄 해소. 프로젝트 자체 규칙 위반 시정이라 명분도 확실.
3. **차트 키보드/SR 대안** — 영향 사용자 폭은 검색보다 좁지만, 데이터가 핵심 가치인 서비스에서 수치 전면 차단은 중대. `sr-only` 테이블만으로도 즉시 큰 개선.

보조: `outline #747878` 보조 텍스트 상향(`#5f6368`급), skip-link 추가, 장식 SVG/이모지 `aria-hidden="true"` 명시는 1차 문서대로 남아 있어 후속 처리 권장.

---

## 반성점

- 재점검도 정적 분석 한정. NVDA/VoiceOver 실제 음성 출력, 키보드 포커스 순서, axe/Lighthouse 자동 검증은 미수행 — combobox 음성과 차트 포커스 순회는 브라우저 재확인 필요.
- 제시한 `riskTextColor` 대체값(`#8A6D00` 등)의 대비는 추정 계산이며, 실제 렌더 배경(종이/흰/틴트 합성)에서 4.5:1 충족 여부는 도구로 확정해야 함. `sr-only` 유틸 부재 가능성을 전제로 globals.css 정의를 함께 명시했다.
