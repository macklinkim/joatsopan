# Round3-03 — 신규 기능 로직 정확성/엣지케이스 점검

점검일: 2026-06-20 · 점검 모델: Opus 4.8 (1M) · 관점: 최근 추가 기능의 로직 정확성·경계·엣지케이스 (`regionRank`, `salaryPercentile`, `exploreCompanies`, `sidoList`, 회사상세/탐색 2단 배너)

## 점검 범위

- `lib/data.ts` 신규 함수: `regionRank`(232-256), `salaryPercentile`(258-277), `exploreCompanies`(213-230), `sidoList`(201-211), `Grade/SortKey/ExploreFilter` 타입
- `app/explore/page.tsx`(필터 폼·총계·정렬 stat), `app/company/[id]/page.tsx`(2단 배너 라벨/색·104-132행)
- `scripts/etl.mjs`의 `parseRegion`(94-102)·인터닝 — 시군구 묶음 정확성의 근거
- 교차검증: 로컬 `data/companies.json`(ym=2026-04, NA=552,693, NCL=200, sido#20, sigungu#235)을 코드와 동일 로직으로 재현 + 프로덕션(https://jotsopan.vercel.app) 총계 대조

결론 한 줄: **로직 코어(랭킹·동점·경계·필터·총계)는 정확하고 결정적이며 프로덕션 수치와 일치한다. 치명 버그는 없다. 다만 (1) 회사상세 지역순위 배너에서 "라벨(상대 순위)과 글자색(절대 점수)"이 서로 다른 기준이라 실데이터에서 모순 표시가 발생하고, (2) `salaryPercentile`의 "상위 P%" 표기가 최하위 회사에 "상위 100%"로 찍히는 직관 위배가 있다 — 둘 다 표시 정확성 결함(Medium/Low).**

---

## 발견

### Medium

**M1. 지역순위 배너: 라벨은 상대순위, 색은 절대점수 — 두 기준이 충돌해 "위험한 편"이 녹색으로 표시되는 모순.**
`app/company/[id]/page.tsx:106-117`. 태그 텍스트는 `dp = rrank.rank/rrank.total`(상대 지역순위)로 결정(`dp<=0.1` 위험 상위권 / `<=0.34` 위험한 편 / `>=0.66` 안전한 편 / else 중간 수준)하는데, 그 글자색은 `riskTextColor(c.risk_score)`(절대 위험점수)로 칠한다. 두 기준이 독립이라 상충 가능.
재현(실데이터): "수원시 영통구"(2,934곳)의 한 회사는 `risk_score=19`(절대 라벨 "희귀 중소", `riskTextColor`<20 → **녹색** #1F7A4D)인데 지역 내 `rank=982/2934`(dp=0.335) → 태그 **"위험한 편"**. 즉 녹색 글씨로 "위험한 편"이 출력된다(점수 0짜리가 지역의 약 2/3를 차지해 19점도 상대적으로 위쪽에 위치). 사용자에겐 "안전 색 + 위험 문구"라는 모순 신호.
영향: 색·문구 불일치로 오해 유발. 권고는 둘 중 하나로 통일 — 배너 색을 상대순위(`dp`) 기반으로 매핑하거나, 태그 문구를 절대 점수 기반으로 바꿀 것. (반대 방향, 즉 고점수가 "안전한 편"으로 찍히는 Case A는 실데이터에서 0건 — 점수 상한 때문에 발생 불가 확인.)

### Low

**L1. `salaryPercentile` "상위 P%" 표기가 최하위 회사에 "상위 100%"로 — 의미 직관 위배.**
`lib/data.ts:276`, 표시 `app/company/[id]/page.tsx:127` "(상위 {percentile}%)". `percentile = max(1, round(rank/total*100))`이고 `rank=1`이 연봉 1위(최고). 따라서 연봉 1위 → "상위 1%"(직관 일치), 그러나 연봉 **꼴찌**(rank=total) → "상위 100%"로 찍힌다. "상위 100%"는 "사실상 전원보다 위"라는 오해를 부를 수 있어, 최하위를 "상위 100%"로 부르는 건 어색하다. `salaryPercentile`의 `percentile` 필드는 UI에서 연봉 배너에만 쓰이며(지역 배너는 `rank/total`만 사용, `regionRank.percentile`은 미사용 데드필드), "하위 X%" 또는 "상위 Y%(=100-순위백분율)" 중 하나로 표현 통일 권고.

**L2. 경계값 처리·등급 임계는 모두 정확 — `riskLabel`과 `exploreCompanies` 등급, 탐색 페이지 라벨이 3중 일치.**
`exploreCompanies`(218-220): rare `sc<20` / normal `20<=sc<50` / jotso `sc>=50`. `scoreCore.riskLabel`(14-18): `<20` 희귀 중소 / `<50` 보통 / `>=50` 좋소 확정. `app/explore/page.tsx:8-13` GRADES 라벨: "좋소 확정(50+)"/"보통(20~49)"/"희귀 중소(<20)". 셋 다 동일 경계. 경계 표본 실측 score==20: 22,290건(normal로 정확 귀속), score==50: 245건(jotso로 귀속). 오프바이원 없음.

**L3. `regionRank` total<5 / `salaryPercentile` total<10 가드·동점·경계 모두 정상.**
- 가드: `regionRank` `total<5 → null`(250), `salaryPercentile` `mySal<=0 → null`(265) + `total<10 → null`(274). 실측 활성 salary<=0 = **0건**(가드는 안전망), 시군구(sg+sido) 그룹 270개 중 <5 = 11개 → null 반환(배너 미표시, UI는 `(rrank||salPct)` 조건부 렌더라 안전). 업종(salary>0) 1,575개 중 <10 = 271개 → null.
- 동점 안정화: `else if score===myScore && j<g`(247, 271)로 인덱스 선행자만 tie 가산 → 동점쌍이 연속 distinct 순위(실측 동점 2건이 rank 2880/2881로 분리 확인). 결정적.
- 방향성: 지역순위는 점수 높을수록(위험할수록) rank=1. 실측 "수원시 영통구" 최고점(59) rank=1, 최저점(0) rank=2880/2934. 의도 부합.
- 활성 한정: 두 함수 모두 `g>=NA → null`(240, 263)로 휴폐업 회사에 미적용 — 정상(랭킹 분모는 활성 전수).

**L4. 시군구 매칭은 `sgIx + sidoIx` 조합으로 정확 — 인터닝 충돌을 sido로 정확히 분리, 통합시는 한 시군구로 묶임.**
근거: `etl.mjs:parseRegion`(99-100)이 통합시를 `${t[1]} ${t[2]}`로 합쳐 `"성남시 분당구"`를 **단일 시군구 문자열**로 인터닝(실측 `성남시 분당구/중원구/수정구` 각 1엔트리). 반면 `"중구"·"동구"·"서구"` 등 19개 시군구명은 여러 시도에 걸쳐 **같은 sgIx를 공유**(실측: "중구"가 서울·부산·대구·인천·대전·울산 6개 시도). `regionRank`(244)·`nearbyCompanies`(182)가 `sgIx===mySg && sidoIx===mySido` **2중 조건**으로 매칭하므로 서울 중구와 부산 중구가 섞이지 않음. 정확. (만약 sgIx만 비교했다면 전국 동명 시군구가 한 그룹으로 합쳐지는 버그였을 것 — 코드가 올바르게 방어.)

**L5. `sidoList(>=100)`에 이상 시도명 없음 — 빈 문자열·구명칭 시도 정확히 배제.**
`lib/data.ts:207` `filter(([ix,n]) => raw.sido[ix] && n>=100)`. 실측 전체 sido 버킷 20개 중 결과는 17개(경기도 149,894 … 세종 3,222)로 모두 정상 시도명. 배제된 3개: `""`(빈 문자열, 109건 — truthiness로 제외), 레거시 `"전라북도"`(18건<100)·`"강원도"`(6건<100) — 현행 명칭 `전북특별자치도`/`강원특별자치도`가 별도 존재. 이상명 노출 0. (부수효과: 빈/레거시 sido 약 133개 활성 회사는 탐색 sido 필터로 도달 불가하나, 전국 옵션으로는 노출 — 경미.)

**L6. `exploreCompanies` 필터 조합·정렬·총계 정확, 성능 양호, 프로덕션과 일치.**
- 총계: `total=idx.length`는 필터 통과 전수(slice 전 카운트)라 "조건 일치 N곳 중 상위 50"이 정확. 실측 경기도/jotso=412, 전국/jotso=2,002, 전국/rare=342,897.
- **프로덕션 교차검증**: `/explore?sido=경기도&grade=jotso` → 412곳, `/explore?grade=rare&sort=salary` → 342,897곳 — 로컬 재현치와 **정확히 일치**(프로덕션 데이터 버전 동일 확인).
- 정렬: salary/members/score 내림차순, default risk(score 내림). `app/explore/page.tsx:36-41` statFor가 정렬키별 표시값 일치(연봉/직원수/회전율). 회전율 danger 임계 `>=100`.
- 성능: 흔한 시도+등급(경기도/jotso)도 552k 전수 1패스 스캔, 실측 5회 30ms(≈6ms/호출). 서버 컴포넌트 1회 호출이라 무해.

### Info

- 배너 렌더 가드 `(rrank || salPct)`(104)와 각 항목 개별 조건부(106, 121)로, 한쪽이 null이어도 안전. `sm:grid-cols-2`라 한쪽만 있으면 1칸만 표시.
- `regionRank.percentile`(254)은 인터페이스에 있으나 UI 미사용(지역 배너는 `rank`/`total`만 출력). 데드필드 — 제거 또는 향후 사용 결정 필요.
- `sidoList`/`exploreCompanies`는 매 요청 552k 스캔(전자는 `_sidoList` 메모로 1회). 캐시 없는 explore는 정확성엔 무관(성능 패스 소관).

---

## 권고 우선순위

1. **M1**: 지역순위 배너의 색 기준을 태그(상대 `dp`)와 통일 — 색도 `dp`로 매핑하거나 태그를 절대 점수 기준으로. 현재 "위험한 편 + 녹색" 모순 해소.
2. **L1**: 연봉 백분위 표기를 "하위 X%" 또는 "상위 (100−순위%)"로 정리해 최하위가 "상위 100%"로 찍히는 직관 위배 제거.
3. **L5 부수효과/Info**: 빈·레거시 sido 회사의 탐색 도달성 및 `regionRank.percentile` 데드필드는 선택적 정리.
