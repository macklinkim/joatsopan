# Round2-04 — 데이터레이어 로직 정합성/버그 점검

점검일: 2026-06-20 · 점검 모델: Opus 4.8 · 관점: `lib/data.ts` 데이터 접근 로직의 정합성·경계·결정성 (성능/아키텍처는 별도 패스)

## 점검 범위

- `lib/data.ts` 전량 (컬럼형+인터닝 저장, `setOf`/전역인덱스, 8개 접근 함수)
- `lib/score.ts`, `lib/types.ts` (점수 엔진·도메인 타입, 호출 정합성 확인)
- 실데이터 `data/companies.json` 교차검증: `ym=2026-04`, `count=totalActive=552878`, `NA=552878`, `NCL=200`, `ind=1575`

근거는 모두 실제 `companies.json`을 코드와 동일 로직으로 재현해 측정했다.

결론 한 줄: **치명적 버그는 없다. id 충돌 처리·폴백·셔플은 결정적이고 안전하다. 다만 `getMonthlyStats`의 `last` 보정이 turnover/hires/leaves를 재계산하지 않아 최신월 표시값이 내부 모순(좋소 한줄 요약과 시계열 마지막 점이 불일치)을 일으키는 정확성 결함이 1건 있다.**

---

## 발견

### Medium

**M1. `getMonthlyStats` 최신월 보정이 절반만 적용 — turnover·hires·leaves·notice_amt가 옛 members 기준으로 남는다.**
`lib/data.ts:124-125`에서 `last.members = c.cur_members; last.est_salary = c.cur_salary;`로 마지막 월의 인원/연봉만 실값으로 덮어쓴다. 그러나 같은 점의 `turnover`(122행, `calcTurnover(hires,leaves,members)`)·`hires`·`leaves`·`notice_amt`는 **보정 전 합성 members**로 이미 계산돼 있고 재계산되지 않는다.
재현(cur_members=80, cur_turnover=40): 보정 전 members=82·turnover=40.2 → 보정 후 members=80인데 turnover는 여전히 40.2로 남고, 회사 요약값 `cur_turnover=40`과도 어긋난다. notice_amt도 `est_salary/12*…*members`인데 members가 합성값(82) 기준이라 보정된 80과 불일치.
영향: `/company/<id>` 시계열 마지막 점이 헤더의 `cur_*` 요약과 미세하게 안 맞는다. 정합성을 맞추려면 보정 후 `last.turnover`/`notice_amt`를 `cur_members`로 다시 계산해야 한다.

### Low

**L1. stable id 충돌 — 원인은 해시가 아니라 데이터 내 진짜 중복행. 접미사 'x'는 결정적이나 의미가 약하다.**
실측: 553,078건 중 base-id(`(h>>>0).toString(36)+bizNo`) 충돌 그룹 161개, 최대 그룹 크기 4, 접미사 'x' 추가 총 192회. 그룹 예시는 name·bizNo·bdong가 **완전히 동일**한 행이었다(예: "쿠팡풀필먼트서비스 유한회사"/837870/1171010800가 g=2와 g=1808에 중복). 즉 djb2 해시 충돌이 아니라 원천 데이터 중복이다.
- 결정성: `for g=0..` 삽입 순서가 파일 행 순서로 고정 → 같은 입력이면 같은 id. `getCompany`/`HERO_IDS` 안정적. **버그 아님.**
- 약점: 중복행은 `...id`, `...idx`, `...idxx`로 갈려 사용자에겐 사실상 같은 회사가 다른 URL로 노출된다(`searchCompanies`가 둘 다 반환 가능). 또 `while(ID_MAP.has(id)) id+='x'`는 최악 O(그룹크기) 선형 탐색이나 최대 4회라 무해.
권고: 정합성 관점에선 ETL 단계 중복 제거가 정답. 코드만 보면 결함 아님.

**L2. `closedCompanies` 정렬식이 비교마다 `setOf`를 4회 호출 — 정확하나 군더더기.**
`lib/data.ts:192` `idx.sort((a,b)=> setOf(b).s.members[setOf(b).i] - setOf(a).s.members[setOf(a).i])`. `idx`는 전부 `g>=NA`(휴폐업)이므로 `setOf(g).s===CL`, `.i===g-NA`. 따라서 `CL.members[b-NA]` 한 줄과 동치이며 결과는 정확하다(실측 top5 members `[1047,178,79,78,52]` 내림차순 확인). 다만 비교 1회당 `setOf` 4회 객체 생성은 불필요. 동점은 원래 인덱스 순서로 안정. **버그 아님, 미세 정리 대상.**

**L3. `nearbyCompanies` 폴백은 항상 비지 않음이 보장됨 — 단 마지막 `return {scope:"all", items:[]}`(175행)은 도달 불가.**
4단 폴백(dong→sigungu→industry→all)에서 `all` tier의 predicate는 `()=>true`. `collect`는 `j!==g0 && A.members[j]>5`만 거른다. 실측 활성 members>5 행은 326,443개이므로 본인 1건을 빼도 풀이 비는 경우는 없다(데이터가 1~2건으로 쪼그라들지 않는 한). 따라서 175행은 죽은 코드지만 방어로서 무해.
- 본인 제외: `j!==g0`로 처리. 단 `g0`가 휴폐업(`g0>=NA`)이면 루프는 활성 `j(0..NA)`만 도므로 `j!==g0`는 항상 참 — 그래도 휴폐업 본인은 활성 풀에 없어 자기 자신이 섞일 수 없다. 의미상 정상(휴폐업 회사의 "주변"은 같은 동/시군구 활성 회사로 채워짐).
- `members>5` 가드 정상 적용. 정렬은 salary 내림차순.

**L4. `awards` 단일패스 최댓값 — 동점·빈 후보 가드 정상, 단 빈-후보 분기는 실데이터에서 도달 불가.**
`lib/data.ts:201-209`. 30인+ 후보(turnG/lowG/riskG/safeG)는 `g<0 || 조건`으로 첫 후보를 안전히 잡고, `bigG`는 30인 제한 없이 전체에서 최댓값. 동점 시 먼저 만난 인덱스 유지(안정적, 결정적). `lowG`는 `A.salary[i]>0 && …`로 0원 제외 — 실측 30인+ 중 salary<=0 행은 0개라 가드는 안전망일 뿐 발동 안 함. 30인+ 후보는 52,782개라 `turnG/lowG/riskG/safeG`가 -1로 남아 `companyAt(-1)`이 터지는 일은 없다. **버그 아님.** (데이터가 30인+ 0건이면 `w(-1)`→`setOf(-1)` 크래시 위험은 이론상 존재하나 현 데이터에선 무관.)

**L5. `gamePool` 셔플 결정적 — Fisher–Yates 정상.**
`mulberry32(424242)` 고정 시드 + 역방향 Fisher–Yates(225-228행, `j=floor(rnd()*(i+1))`, `i>0`까지)로 편향 없는 결정적 셔플. 30인+ 풀 52,782개 ≫ n=12라 `slice(0,12)` 안전. 매 호출 새 `rnd` 인스턴스라 결과 동일(캐시 없음, 결정적이므로 무방).

**L6. `setOf`/전역인덱스 경계 — 오프바이원 없음.**
`g<NA`→활성 `i=g`, `else`→휴폐업 `i=g-NA`. 활성 `[0,NA)`, 휴폐업 `[NA,NA+NCL)`로 정확히 분기(`g=NA`→`i=0`, `g=NA+NCL-1`→`i=NCL-1`). id 생성 루프 `g<NA+NCL`로 전수 매핑(실측 mapsize 553,078 = NA+NCL 일치, 누락 0). `companyAt`/`idAt`/`getCompany` 모두 동일 규칙 사용 — 경계 일관.

### Info

- **`HERO_IDS`**: `Array.from({length:Math.min(8,NA)},(_,g)=>idAt(g))`로 `g=0..7`(첫 활성 8행)을 모듈 로드 시 즉시 계산. 데이터가 members 내림차순 정렬이라(첫 8행 members `[125614,66559,…,22737]`) 사실상 "최대 고용 8개사"가 히어로로 고정 — 결정적, 의도 부합. `idAt`가 `ensureIds()`를 트리거하므로 첫 import에 id 전수 생성(실측 ~434ms) 비용이 모듈 평가 시점에 발생(성능 패스 소관).
- `recentMonths(14,"2026-04")` → `2025-03 … 2026-04` 14개월 정상. `progress=i/(n-1)`는 n=14 고정이라 0-division 없음.
- `getMonthlyStats` 캐시(`STATS_CACHE`)·`topRiskCompanies`/`awards`(`_*` 메모) 지연 캐시는 입력 불변이라 결정적, 정합성 문제 없음.

---

## 권고 우선순위

1. **M1**: `last` 보정 후 `turnover`·`hires`·`leaves`·`notice_amt`를 `cur_members` 기준으로 재계산(또는 turnover는 `c.cur_turnover` 직접 대입)해 시계열 마지막 점과 헤더 요약을 일치시킬 것.
2. **L1**: ETL에서 (name,bizNo,bdong) 완전중복 제거 — 'x' 접미사 분기 URL 노출 해소.
3. **L2/L4**: `closedCompanies` 정렬을 `CL.members[b-NA]-CL.members[a-NA]`로 단순화, `awards`의 후보 0건 방어(이론적) 추가는 선택.
