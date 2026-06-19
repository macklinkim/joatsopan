# pass-02 · 생성 더미데이터 품질 점검

대상: `lib/data.ts` (`genSeeds`, `GEN_*` 배열, `buildCompany`, `commentForScore`)
보조: `lib/score.ts`, `lib/types.ts`
점검일: 2026-06-20

## 점검 범위

`genSeeds(500)`가 만드는 합성 사업장 데이터의 "현실성"을 코드 근거로 평가한다. 구체 항목:

1. 업종-이름 상관관계 (어간/꼬리 vs `industryCode`)
2. 사업자번호/`id` 체계 (실제 사업자등록번호 10자리 대비)
3. `members` / `salary` / `turnover` 분포의 현실성
4. 지역(`bdong` 법정동코드)과 주소 일치성
5. 이름 중복/어색한 조합
6. 코멘트 생성 로직 (`commentForScore`)

큐레이션된 8개 `SEEDS`(부록 A)는 사람이 쓴 값이라 별도 다루되, 생성 로직과 충돌하는 부분은 짚는다.

## 발견 (심각도, 근거)

### F1. 업종-이름 완전 무상관 — 심각도: 높음

`genSeeds`는 이름과 업종을 독립적으로 뽑는다 (data.ts:292, 295).

```ts
const name = `${pick(GEN_PREFIX)}${pick(GEN_STEM)}${pick(GEN_TAIL)}`;
const ind = pick(GEN_INDUSTRY);
```

`GEN_TAIL`에는 "푸드", "식품", "제약", "바이오", "건설", "물산", "로지스"(물류) 등 업종성이 강한 꼬리가 있는데(data.ts:245-249) 업종코드와 전혀 연결되지 않는다. 그래서 사용자 지적대로 **"메가푸드"(꼬리=푸드)에 `J6201 컴퓨터 프로그래밍 서비스업`** 같은 조합이 정상적으로 생성된다. 반대로 "한빛소프트"가 `H4920 기타 도로화물 운송업`이 되는 것도 가능하다. 15개 업종 중 IT/제조가 대다수인데 꼬리는 식품·건설·제약까지 섞여 있어 미스매치 확률이 매우 높다.

### F2. `id`/사업자번호가 실제 체계와 불일치 — 심각도: 높음

```ts
const id = String(100000000000 + Math.floor(rnd() * 899999999999)); // data.ts:297
bizNo6: id.slice(0, 6),                                              // data.ts:306
```

- `id`는 **12자리** 난수. 한국 사업자등록번호는 **10자리**(`XXX-XX-XXXXX`, 3-2-5)이고 마지막 자리는 체크디지트다. 12자리는 어떤 실체계와도 맞지 않는다.
- `bizNo6`는 그 12자리의 앞 6자리를 자른 값이라 사업자번호 구조(앞 3자리=세무서코드, 가운데 2자리=개인/법인 구분코드)와 의미적으로 무관하다.
- 큐레이션 SEEDS의 `bizNo6`는 6자리 문자열("304880" 등)인데 생성분은 12자리 `id`의 슬라이스라 **두 출처의 `id` 길이가 다르다**(SEEDS: "shininglion" 같은 슬러그 / 생성: 12자리 숫자). URL/식별자 일관성이 깨진다.

### F3. salary/turnover/members 분포 현실성 — 심각도: 중간

```ts
const members  = Math.max(5, Math.round(5 + Math.pow(rnd(), 2.2) * 295));   // 5..300, 좌측 편향
const salary   = Math.round(ind.median * (0.4 + rnd() * 0.85));             // median의 0.40~1.25배 균등
const turnover = Math.round(Math.pow(rnd(), 1.8) * 180);                    // 0..180, 좌측 편향
```

- **salary**: 중앙값의 0.40~1.25배 **균등분포**. 즉 절반 이상이 median 미만(0.4~1.0 구간이 0.85폭 중 0.6, ~71%)으로 쏠려 `score.ts`의 연봉 페널티(s2, 최대 35점, score.ts:12-13)가 과하게 자주 발동한다. 실제 임금분포는 중앙값 부근에 봉우리가 있는 비대칭 분포여야 하는데 균등분포는 비현실적이고, 게다가 median 미만으로 의도치 않게 치우친다. 상한 1.25배도 낮아 "고연봉 우량기업"이 거의 안 나온다.
- **turnover**: `pow(rnd(),1.8)*180` → 최대 180%까지. score.ts:16은 20% 초과부터 가산하므로 대부분 양수 회전율을 갖게 되고, 분포가 넓어 0~180% 사이가 흔하다. 100%↑ 회전율은 현실에선 극단치인데 시드에서 흔하게 나온다.
- **members**: 5~300, 제곱(2.2승)으로 소규모 편향은 방향은 맞다. 다만 `members`가 salary/turnover와 **독립**이라, "직원 300명인데 회전율 170%, 연봉 median의 0.5배" 같은 비정합 조합이 생긴다. 규모-임금-이직률 간 상관(대기업일수록 고임금·저이직)이 전혀 반영되지 않는다.
- 세 분포 모두 **독립 추첨**이라 위험도 점수(`riskScore`)가 사실상 난수 3개의 합이 된다. 현실 신호 구조가 없다.

### F4. 지역-주소는 정합하나 내부 코드 불일치 — 심각도: 중간

`GEN_REGION`(data.ts:269-282)은 `sigungu`/`dong`/`bdong`/`addr`을 한 묶음으로 묶어 뽑으므로 **생성분 내부에선 주소-법정동코드가 정합**하다(여기는 잘 설계됨).

다만:
- 역삼동 법정동코드가 **출처별로 다르다**: 큐레이션 SEEDS의 아나패스는 `1168010300`(data.ts:93), `GEN_REGION`은 `1168010100`(data.ts:271). 둘 다 역삼동을 표방하지만 코드가 불일치 → `nearbyCompanies`의 "같은 동(bdong)" 매칭(data.ts:410)에서 아나패스와 생성된 역삼동 회사가 **서로 다른 동으로 취급**된다.
- `addr`이 도로명 접두만 있고 건물번호가 없어("...디지털로") 모든 회사가 같은 주소처럼 보인다. 같은 동의 수십 개 회사가 글자 그대로 동일 주소 문자열을 갖는다.
- 모든 생성 데이터가 **서울 12개 구**에만 존재. "전국" 서비스를 표방(data.ts:235 주석 "전국 실데이터")하는데 시연 데이터는 서울뿐.

### F5. 이름 중복·어색한 조합 — 심각도: 중간

```ts
const seenName = new Set(...); // data.ts:287
if (seenName.has(name)) continue;
```

중복 자체는 막힌다. 그러나:
- 고유 이름 공간이 **접두(distinct 3) × 어간 50 × 꼬리 28 = 4,200개**(prefix 배열은 6칸이지만 distinct 값은 3종, data.ts:237). 여기서 500개를 뽑으면 생일 문제로 충돌이 잦아 `guard`(최대 `n*30`=15000회) 루프를 상당히 소모한다. 동작은 하지만 이름 다양성이 낮아 "한빛"·"미래"·"대성" 같은 어간이 여러 업종에 반복 등장한다.
- 접두 배열 `["주식회사 ","(주)","","","","주식회사 "]`는 빈 문자열 3 + "주식회사 " 2 + "(주)" 1 가중치라 **절반이 접두 없는 이름**. "(주)"와 "주식회사 "가 동시에 존재해 표기 혼재.
- 꼬리 "이엔엠"(엔터), "씨앤씨" 같은 영문 음차가 업종과 무관하게 붙어 어색(F1과 연동).

### F6. 코멘트 — 큐레이션은 좋으나 생성분은 5단계 고정 — 심각도: 낮음

```ts
comment: s.comment || commentForScore(score, !!s.isClosed)  // data.ts:219
```

생성분은 `comment: ""`(data.ts:318)이므로 전량 `commentForScore`로 채워진다. `commentForScore`는 점수 구간 6개(closed/70+/50+/30+/10+/else, data.ts:225-232)에 **문자열 1개씩 고정**. 500개가 사실상 6종 코멘트만 돌려쓴다. 큐레이션 SEEDS의 위트("회전문이 바쁩니다", "야근의 향기가 납니다")와 톤 격차가 크고, 서비스 컨셉(좋소 판별기) 특유의 풍자 맛이 생성분에서 사라진다.

추가 정합성 버그: 큐레이션 SEEDS는 score를 `forceScore`로 고정하지만 코멘트는 손으로 쓴 값이라, 예컨대 아나패스(forceScore 0)와 구로데이터(score 0~8대)가 모두 "여기는 좋소가 아닙니다"로 겹친다 — 의도된 재사용이라 치명적은 아님.

## 구체적 개선안 (코드 수준)

### A. 업종별 꼬리/어간 매핑 테이블 (F1)

업종을 먼저 뽑고, 그 업종에 어울리는 꼬리에서만 이름을 합성한다.

```ts
interface GenIndustry { code: string; name: string; median: number; tails: string[]; stems?: string[]; }
const GEN_INDUSTRY: GenIndustry[] = [
  { code: "J5821", name: "응용 소프트웨어 개발 및 공급업", median: 4100,
    tails: ["소프트","테크","시스템","솔루션","랩스"] },
  { code: "J6201", name: "컴퓨터 프로그래밍 서비스업", median: 4100,
    tails: ["소프트","테크","데이터","정보통신","씨앤씨"] },
  { code: "C2611", name: "반도체 제조업", median: 5200,
    tails: ["반도체","전자","테크"] },
  { code: "G4633", name: "기타 가공식품 도매업", median: 3200,
    tails: ["푸드","식품","물산"] },
  { code: "C2120", name: "의약품 제조업", median: 5000,
    tails: ["제약","바이오","팜"] },
  { code: "F4111", name: "건물 건설업", median: 3600,
    tails: ["건설","산업","이앤씨"] },
  { code: "H4920", name: "기타 도로화물 운송업", median: 2900,
    tails: ["로지스","물류","운수"] },
  // ...
];

// genSeeds 내부
const ind  = pick(GEN_INDUSTRY);
const tail = pick(ind.tails);        // 업종에 맞는 꼬리만
const name = `${pick(GEN_PREFIX)}${pick(GEN_STEM)}${tail}`;
```

전역 `GEN_TAIL`은 제거하거나 "업종 무관 일반 꼬리(산업/물산)" 폴백으로만 둔다.

### B. 사업자등록번호 10자리 + 체크디지트 (F2)

식별자(`id`)는 슬러그/숫자 혼재를 끝내고, 사업자번호는 실제 알고리즘으로 생성한다.

```ts
// 국세청 사업자등록번호 체크디지트 (가중치 1,3,7,1,3,7,1,3,5)
function bizCheckDigit(d9: number[]): number {
  const w = [1,3,7,1,3,7,1,3,5];
  let sum = d9.reduce((a, n, i) => a + n * w[i], 0);
  sum += Math.floor((d9[8] * 5) / 10);
  return (10 - (sum % 10)) % 10;
}
function genBizNo(rnd: () => number): string {
  const taxOffice = 100 + Math.floor(rnd() * 100);     // 3자리 세무서코드
  const kind = pick([81,82,85,86,87,88]);              // 법인 구분코드(2자리) 등
  const serial = Math.floor(rnd() * 100000);           // 5자리 중 앞4 + 체크 자리
  const head = String(taxOffice).padStart(3,"0") + String(kind).padStart(2,"0")
             + String(serial).padStart(5,"0").slice(0,4);
  const d9 = head.split("").map(Number);
  return head + bizCheckDigit(d9);                      // 10자리
}
```

- `id`는 사업자번호 10자리 문자열 그대로 쓰거나(`bizNo`), 혹은 SEEDS처럼 슬러그를 별도로 두되 **두 출처 길이/형식을 통일**한다.
- `bizNo6` 필드는 "앞 6자리(세무서3+구분2+일련1)"로 일관 정의하고 표시용 포맷 `XXX-XX-XXXXX`을 별도 헬퍼로 둔다.

### C. 상관 있는 분포 (F3)

규모를 먼저 정하고 임금/이직률을 규모에 종속시켜 비대칭 분포로 만든다.

```ts
function gaussian(rnd: () => number) {                 // Box-Muller
  return Math.sqrt(-2*Math.log(rnd()||1e-9)) * Math.cos(2*Math.PI*rnd());
}
const members = Math.max(5, Math.round(5 + Math.pow(rnd(), 2.2) * 295));
const sizeFactor = Math.min(1, members / 150);          // 클수록 1에 근접

// 임금: median 중심 로그정규 + 규모 보정(대기업 가산)
const wage = ind.median * Math.exp(gaussian(rnd) * 0.18) * (0.85 + 0.35 * sizeFactor);
const salary = Math.round(Math.max(ind.median * 0.5, wage));

// 이직률: 소규모/저임금일수록 높게 (음의 상관)
const lowPay = Math.max(0, 1 - salary / ind.median);
const base = 8 + (1 - sizeFactor) * 25 + lowPay * 60;   // 기대 이직률
const turnover = Math.max(0, Math.round(base + gaussian(rnd) * 10));
```

이러면 "300명·고연봉·저이직"과 "8명·저연봉·고이직"이 자연스럽게 군집화되어 위험도 점수가 의미를 갖는다.

### D. 지역 정합 (F4)

- 역삼동 코드를 한 출처로 통일(예: `1168010100`)하고 SEEDS 아나패스도 동일 코드로 수정 → `nearbyCompanies` 동 매칭 정상화.
- `addr`에 결정적 건물번호 부여: `addr: \`${reg.addr} ${10 + Math.floor(rnd()*200)}\`` 로 같은 동 내 주소 분산.
- "전국" 표방을 줄이거나 GEN_REGION에 비수도권 몇 개 구를 추가.

### E. 이름 다양성/표기 (F5)

- 어간 배열 확대(현재 50 → 100+) 또는 어간 2음절 조합 생성으로 공간 확대.
- 접두 표기 통일: "(주)"와 "주식회사 " 중 하나로. 가중치 예 `["", "", "(주)", "(주)", "주식회사 "]`(접두 없음 40%).

### F. 코멘트 템플릿 풀 (F6)

점수 구간별로 **여러 후보를 두고 결정적으로 1개 선택**, 업종 톤 반영.

```ts
const COMMENT_POOL: Record<string, string[]> = {
  closed: ["휴·폐업 신호가 보입니다.", "불 꺼진 사무실 냄새가 납니다."],
  high:   ["도망치세요. 신호가 강합니다.", "회전문에 손 끼이지 않게 조심하세요.", "야근의 향기가 진합니다."],
  mid:    ["꽤 위험합니다. 신중히.", "면접 때 화장실 표정을 보세요."],
  // ...
};
function commentForScore(score: number, closed: boolean, rnd: () => number): string {
  const key = closed ? "closed" : score >= 70 ? "high" : score >= 50 ? "mid" : score >= 30 ? "soso" : score >= 10 ? "ok" : "safe";
  const pool = COMMENT_POOL[key];
  return pool[Math.floor(rnd() * pool.length)];
}
```

`buildCompany`에서 생성분에도 회사 `id` 기반 시드 rnd를 넘겨 결정성 유지.

## 반성점

- 처음엔 "지역-주소 불일치"가 큰 문제일 거라 예상했으나, `GEN_REGION`이 필드를 묶어 뽑는 설계라 **생성분 내부는 정합**했다. 추측을 코드로 검증해 F4의 무게를 "주소 자체 불일치"에서 "출처 간 코드 불일치(역삼동)"로 정정했다.
- 가장 임팩트 큰 문제는 화려한 F1/F2가 아니라 **F3(분포 독립성)**일 수 있다. 이름·번호가 그럴듯해도 members/salary/turnover가 서로 무관하면 위험도 점수가 난수의 합이 되어, 이 앱의 핵심(좋소 판별)이 통계적으로 무의미해진다. 개선 우선순위는 F3 ≳ F1 ≈ F2.
- "조악하다"는 사용자 불만의 1차 원인은 눈에 바로 보이는 F1(메가푸드가 SW회사)과 F5(어간 반복)일 가능성이 높다. 체감 개선은 A·E부터, 데이터 신뢰성은 C부터 손대는 2트랙을 권한다.
- 큐레이션 SEEDS와 생성분의 품질 격차(코멘트 위트, id 형식)가 커서 두 출처를 한 파이프라인으로 합치는 순간 일관성이 깨진다. 장기적으론 생성분도 SEEDS 스키마/톤에 맞추는 게 맞다.
