# Pass 04 — 점수 엔진 정확성/타당성 점검

대상 커밋 기준 파일: `lib/score.ts`, `lib/data.ts`, `lib/types.ts`
점검자 관점: 점수 엔진(riskScore)의 수치 정확성·타당성, 경계 처리, estSalary 가정, forceScore 정합성, 테스트 부재.

## 점검 범위

- `lib/score.ts`: `riskScore`, `riskLabel`, `turnover`, `estSalary`, `turnoverLabel`, `memberBand` (전 함수)
- `lib/data.ts`: `buildCompany`의 forceScore 분기(L186~199), 큐레이션 8개사 시드(L49~184), 생성기 `genSeeds`(L284~322), 시계열 생성(L337~380)
- `lib/types.ts`: `Contributions`, `RiskLabel` 계약

테스트 코드는 프로젝트 내에 존재하지 않음. `package.json`에 vitest/jest 등 테스트 러너 의존성도 없음(L11~24). 확인 근거: `**/*.{test,spec}.*` glob 결과가 전부 `node_modules` 하위뿐.

---

## 발견 (심각도 · 근거)

### F-1. forceScore와 엔진 계산이 불일치 — shininglion (심각도: 높음)

`lib/data.ts` L50~67 shininglion 시드: `members:49, salary:621, turnover:192, median:3881`, `forceScore:78`, `forceContrib:{members:8, salary:35, turnover:35, closed:0}`.

같은 입력을 `riskScore`(score.ts L4~23)로 직접 계산하면:

- s1: `members 49` → `49>=100? no : 49>=30? yes → 8`. (일치)
- s2: `ratio = 621/3881 = 0.16001`, `ratio>=1? no → round(35 * min(1, 1-0.16001)) = round(35 * 0.83999) = round(29.399) = 29`. → **forceContrib는 35, 엔진은 29.**
- s3: `round(max(0, min(35, (192-20)*0.22))) = round(min(35, 37.84)) = 35`. (일치)
- s4: 0.
- 엔진 합계 = 8 + 29 + 35 + 0 = **72**. → **forceScore는 78.**

즉 shininglion은 forceScore(78)와 엔진 산출값(72)이 6점 차이 나며, salary 기여도도 29 vs 35로 다르다. forceContrib.salary=35는 "연봉 상한 35점"을 박은 값인데, 엔진 수식상 ratio 0.16에서는 salary가 최대 35에 도달하지 못한다(35점에 도달하려면 ratio<=1/35≈0.0286, 즉 연봉이 중앙값의 2.86% 이하여야 함). 검증: malgunsoft(forceScore 8 = 엔진 8), anapass(forceScore 0 = 엔진 0)는 일치. **shininglion 한 건만 깨져 있음.**

영향: 동일 입력에 두 개의 정답이 공존. 화면에 표시되는 위험도(78)와 "왜 이 점수인가"를 설명하는 contrib 막대(salary 35)가 엔진 정의와 어긋나, 추후 forceScore를 제거하고 엔진으로 일원화하면 대표 사례의 숫자가 72로 바뀐다. 역공학 "실측 채취값"이라는 주석(L44)이 맞다면, 그건 엔진 수식이 실제 좋소판별기를 재현하지 못한다는 증거(F-3 참조)다.

### F-2. salary 기여 수식의 선형성·계수 타당성 (심각도: 중간)

`s2 = round(35 * min(1, 1 - ratio))` (L13). `ratio = est_salary/median`.

- `min(1, ...)`는 `1 - ratio`가 1을 넘는 경우, 즉 `ratio < 0`(연봉 음수)일 때만 발동. 정상 데이터에서 `ratio>=0`이면 `1-ratio<=1`이라 `min` 클램프는 사실상 죽은 코드(dead clamp). 음수 연봉을 막는 의미는 있으나, est_salary가 음수가 될 입력 경로는 없음(estSalary는 음수 고지금액이 들어와야 음수).
- 선형 감점이라 ratio 0.5(중앙값의 절반)에서 17.5점, ratio 0.9에서 3.5점. "중앙값 대비 90%인데도 감점"은 의도일 수 있으나, 업종 중앙값 자체가 추정연봉(estSalary)으로 만든 값과 섞이면 계가 불안정. median 출처가 코드 내 하드코딩 상수(data.ts GEN_INDUSTRY)라 실데이터 연동 시 스케일이 달라지면 전수 재튜닝 필요.

### F-3. turnover 수식 — "20%↑부터 0.22계수"의 포화 구간 (심각도: 중간)

`s3 = round(max(0, min(35, (turnover - 20) * 0.22)))` (L16).

- 35점 포화 지점: `(t-20)*0.22 >= 35` → `t >= 20 + 159.09 = 179.09`. 즉 **회전율 179% 이상이면 전부 35점 만점**으로 동일 취급.
- data.ts 생성기는 `turnover = round(pow(rnd(),1.8) * 180)`(L302)이라 최대 180. 즉 생성 데이터의 최상단은 거의 모두 만점 근처에 몰린다. shininglion(192), mptech(170), overtimesoft(120)처럼 큐레이션 고위험사도 대부분 포화/근접 구간.
- turnover 정의 = `(입사+퇴사)/현원*100`(L33). 입·퇴 합산이라 100%는 "현원만큼 들고남"을 의미. 20% 미만 전부 0점, 60% 이상 turnoverLabel "사람이 자주 갈림"(L46)인데 점수 임계(20%)와 라벨 임계(60%)가 불일치 — 같은 회전율 지표를 두 기준으로 설명해 UX 혼선 소지.

### F-4. estSalary의 0.09 고정·상한소득월액 미반영 (심각도: 중간)

`estSalary = round((noticeAmt/members/0.09)*12/10000)` (L39~42).

- 0.09는 국민연금 보험료율 9%(사업장 가입자 기준 총 9%) 가정. 이 자체는 표준값이라 타당. 다만 **2024.7~ 기준소득월액 상한 617만원**(이전엔 더 낮음)이 미반영. 월급이 상한을 넘는 고소득자는 보험료가 상한에서 멈추므로, 고연봉 회사일수록 `noticeAmt/members/0.09`로 역산한 추정연봉이 **실제보다 과소** 추정된다. 상한선 부근(연봉 ~7,400만원↑)에서 체계적 하향 편향.
- 또한 하한소득월액(약 39만원)도 미반영. 영세·저임금 사업장에선 반대로 과대 추정 가능.
- `est_salary`는 다시 salary 기여(s2)의 분자로 들어가므로, 추정 편향이 위험도로 전파됨. 고연봉사는 estSalary 과소 → ratio 과소 → s2 가산 → 위험도가 실제보다 높게 나올 수 있음.

### F-5. 경계/엣지 처리 (심각도: 중간~낮음)

- `riskScore`의 `industryMedian` 0/falsy: `ratio = industryMedian ? est/median : 1`(L12) → median 0이면 ratio=1 → s2=0. **데이터 결손(중앙값 미상)을 "연봉 감점 없음"으로 처리** = 위험 과소평가. median 결손은 0점이 아니라 "판정 불가/제외"가 맞다.
- `turnover()` members 0/falsy: `if(!members) return 0`(L34) → 회전율 0% 반환. 현원 0인데 회전율 0은 "안정적"으로 오판될 수 있음(turnoverLabel도 0→"안정적").
- `estSalary()` members 0: `if(!members) return 0`(L40) → 연봉 0 → ratio 0 → s2=35(만점 감점). members 0 회사가 estSalary 경로로 들어오면 연봉 최저로 간주돼 위험 폭증. turnover의 0 처리(과소)와 estSalary의 0 처리(과대)가 **상반된 방향**이라 결손 처리 철학이 일관되지 않음.
- `est_salary` 음수: salary가 음수면 ratio<0 → `1-ratio>1` → `min(1,...)`=1 → s2=35. 여기서 비로소 L13 `min` 클램프가 작동(F-2). 음수 입력 자체를 막는 게 정석.
- 최종 `Math.max(0, Math.min(100, ...))`(L21): 현 가중치 상한 합(16+35+35+30=116)이 100을 초과할 수 있어 클램프가 의미 있음. 단, 116→100 클램프는 "직원 적고+박봉+고회전+폐업" 조합에서 정보 손실. 의도라면 OK이나 문서화 필요.
- `riskLabel` 경계(L26~29): `<20` 희귀 / `<50` 보통 / 그 외 좋소. 즉 20·50 정각은 상위 등급. 주석 "0–20 희귀 / 20–50 보통"(L25)과 코드(20은 보통, 50은 좋소)가 경계 포함 여부에서 미묘하게 어긋남 — 주석은 닫힌구간처럼 읽히나 코드는 `<` 반열림.

### F-6. 단위테스트 전무 (심각도: 높음)

테스트 러너·테스트 파일 모두 부재(점검 범위 참조). 위 F-1~F-5의 수치 경계가 전부 회귀 방어 없이 노출. 특히 forceScore↔엔진 정합(F-1)은 테스트가 있었다면 즉시 잡혔을 사안.

---

## 구체적 개선안 (수식 · 테스트 포함)

### 1. forceScore 정합성 (F-1)

택일:

- (A) forceScore 폐기, 엔진 단일화. shininglion 표시값이 72로 바뀜을 수용. `buildCompany` L189~199에서 force 분기 제거.
- (B) forceScore를 "엔진 결과를 덮는 실측 오버라이드"로 명시하되, **빌드시 검증**을 추가해 force와 엔진의 괴리를 의도된 경우만 허용:

```ts
// data.ts buildCompany 내 (개발 모드 가드)
if (s.forceScore !== undefined && s.forceContrib && process.env.NODE_ENV !== "production") {
  const r = riskScore({ members: s.members, est_salary: s.salary, turnover: s.turnover, is_closed: !!s.isClosed }, s.median);
  const sum = s.forceContrib.members + s.forceContrib.salary + s.forceContrib.turnover + s.forceContrib.closed;
  if (sum !== s.forceScore) console.warn(`[score] ${s.id}: forceContrib 합(${sum}) != forceScore(${s.forceScore})`);
  // 엔진과의 괴리도 로깅하여 의도성 확인
}
```

최소 조치: shininglion `forceContrib.salary`를 엔진과 같은 29로, `forceScore`를 72로 정정하거나, 의도적 오버라이드임을 주석에 근거와 함께 명시.

### 2. salary 결손·음수 처리 (F-2, F-5)

```ts
// median<=0 이면 감점 0이 아니라 "판정 보류"로 분리하거나, salary 기여를 null 처리
const ratio = industryMedian > 0 ? Math.max(0, c.est_salary) / industryMedian : null;
const s2 = ratio === null ? 0 : ratio >= 1 ? 0 : Math.round(35 * (1 - ratio));
// ratio===null인 경우 score에 "추정 불가" 플래그를 contrib에 노출
```

`Math.max(0, est_salary)`로 음수 입력을 명시적으로 0 처리(현 dead clamp 대체). median 결손은 0점이 아님을 UI에서 구분.

### 3. turnover 포화·하한 명시 (F-3)

- 점수 임계(20%)와 라벨 임계(60%)를 하나의 상수 집합으로 통일하거나 의도를 문서화.
- 포화점(179%)을 상수로 노출해 의도된 만점 구간임을 명시:

```ts
const TURN_FLOOR = 20, TURN_COEF = 0.22, TURN_MAX = 35;
const s3 = Math.round(Math.max(0, Math.min(TURN_MAX, (c.turnover - TURN_FLOOR) * TURN_COEF)));
```

### 4. estSalary 상·하한 반영 (F-4)

```ts
// 국민연금 기준소득월액 상·하한 클램프 (연도별 고시값을 상수로)
const RATE = 0.09;
const MIN_MONTHLY = 390_000;   // 하한 (예시, 연도별 갱신)
const MAX_MONTHLY = 6_170_000; // 상한 (2024.7~ 예시)
export function estSalary(noticeAmt: number, members: number): number {
  if (!members) return 0;
  const perCapMonthly = noticeAmt / members / RATE; // 역산 기준소득월액
  // 상한에서 멈춘 보험료라면 실제 연봉은 상한 이상 — 추정 한계임을 표시(>= 처리)
  const clamped = Math.min(MAX_MONTHLY, Math.max(MIN_MONTHLY, perCapMonthly));
  return Math.round((clamped * 12) / 10000);
}
```

상한 도달 시 "상한 이상(과소추정 가능)" 플래그를 함께 반환해 salary 기여 해석에 반영하는 것이 더 정확.

### 5. 단위테스트 도입 (F-6)

`vitest` 추가(`devDependencies`) 후 `lib/score.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { riskScore, riskLabel, turnover, estSalary } from "./score";

describe("riskScore 가중치/경계", () => {
  it("대기업·고연봉·저회전 → 0점", () => {
    expect(riskScore({ members: 131, est_salary: 6800, turnover: 6, is_closed: false }, 5200).score).toBe(0);
  });
  it("shininglion 입력 → 엔진은 72 (forceScore 78과 불일치 회귀 고정)", () => {
    const r = riskScore({ members: 49, est_salary: 621, turnover: 192, is_closed: false }, 3881);
    expect(r.contrib).toEqual({ members: 8, salary: 29, turnover: 35, closed: 0 });
    expect(r.score).toBe(72);
  });
  it("회전율 179%↑ 포화 → s3=35 동일", () => {
    expect(riskScore({ members: 50, est_salary: 5000, turnover: 179, is_closed: false }, 5000).contrib.turnover).toBe(35);
    expect(riskScore({ members: 50, est_salary: 5000, turnover: 300, is_closed: false }, 5000).contrib.turnover).toBe(35);
  });
  it("median 0 → salary 감점 0 (현 동작: 위험 과소)", () => {
    expect(riskScore({ members: 1, est_salary: 100, turnover: 0, is_closed: false }, 0).contrib.salary).toBe(0);
  });
  it("상한 클램프: 모든 항목 만점 합 116 → 100", () => {
    expect(riskScore({ members: 1, est_salary: 0, turnover: 500, is_closed: true }, 5000).score).toBe(100);
  });
});

describe("경계 유틸", () => {
  it("turnover members 0 → 0", () => expect(turnover(5, 5, 0)).toBe(0));
  it("estSalary members 0 → 0", () => expect(estSalary(1000, 0)).toBe(0));
  it("riskLabel 경계: 20→보통, 50→좋소", () => {
    expect(riskLabel(20)).toBe("보통");
    expect(riskLabel(50)).toBe("좋소 확정");
  });
});
```

`package.json`에 `"test": "vitest run"` 추가. 위 테스트는 **현재 동작을 그대로 고정**하므로, 개선을 가하면 의도된 변경만 빨갛게 떠 회귀를 막는다.

---

## 반성점

- F-1을 "추정 금지" 원칙대로 손계산으로 검증했고(ratio 0.16→s2 29, 합 72 vs force 78), malgunsoft·anapass는 일치함을 대조해 shininglion 단건임을 좁혔다. 다만 "실측 채취값" 주석의 진위(엔진이 실제 좋소판별기를 못 맞추는지, 단순 입력 오기인지)는 외부 원천 데이터 없이 코드만으로는 단정할 수 없어 양가 가능성으로 남겨둔다.
- estSalary 상한소득월액 값(617만원 등)은 연도별 고시값이라 코드 점검 범위 밖이다. 개선안의 상·하한 숫자는 "예시"로 명시했고, 정확한 적용월·금액은 별도 확인이 필요하다 — 이를 확정값처럼 쓰지 않았다.
- 가중치(0/8/16, 35, 35, 30)의 "합리성"은 정답이 없는 정책 판단이라, 수치적으로 검증 가능한 부분(포화점 179%, 임계 불일치 20%/60%, 클램프 116→100)에 한정해 근거를 댔고 가치판단은 절제했다.
- 테스트 부재는 확인이 쉬웠으나, 제안한 테스트가 "현 동작 고정"이라 버그(F-1)까지 고정한다는 점을 명시했다 — 테스트가 곧 정답 보증은 아님.
