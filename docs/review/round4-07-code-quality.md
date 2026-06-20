# Round4-07 코드품질·테스트·린트 재점검

대상: `jotsopan` 코드품질 전반 — `lib/*`(scoreCore.mjs SSOT, score.ts, data.ts, format.ts, types.ts, *.test.ts), `components/*`(chartTooltip 공용화 후 LineChart/HireLeaveChart/NearbyList/ShareButton), `app/*`(company/[id]/page.tsx, opengraph-image.tsx, api/search/route.ts), `middleware.ts`, `next.config.mjs`, `eslint.config.mjs`. 실데이터 `data/companies.json` 45.3MB(활성 552,878 + 휴폐업 200).
점검일 2026-06-20. 모든 결론은 아래 실행결과 기반.

---

## 0. 실행 검증 (근거)

### 0-1. 린트 — 표면상 통과, 실제로는 빌드 린트 깨짐 (중요 신규 발견)
```
$ npx eslint .
EXIT:0                       # 잔여 경고/에러 0건 (standalone 통과)
```
그러나 `next build` 및 `next lint`의 통합 린트 단계는 실패한다:
```
$ npx next build
 ✓ Compiled successfully in 9.0s
   Linting and checking validity of types ...
 ⨯ ESLint: Invalid Options: - Unknown options: useEslintrc, extensions - 'extensions' has been removed.
 ✓ Generating static pages (22/22)        # 빌드 자체는 성공(린트 오류 비치명적)
EXIT:0

$ npx next lint
Invalid Options:
- Unknown options: useEslintrc, extensions, resolvePluginsRelativeTo, rulePaths, ignorePath, reportUnusedDisableDirectives
- 'extensions' has been removed. ...
EXIT:1
```
**원인**: Next 15.5의 번들 린트 러너가 ESLintRC 레거시 옵션(`useEslintrc`, `extensions` 등)을 ESLint 8.57(flat config)에 그대로 넘기는데, ESLint 8.57은 이 옵션들을 제거·거부한다. 즉 **`package.json`의 `"lint":"eslint ."`(직접 CLI)만 동작하고, `next build`의 린트 게이트는 사실상 무력화**되어 있다. 빌드는 통과하므로 회귀를 잡지 못한다. (Next도 `next lint` deprecated 경고 출력.)

### 0-2. 테스트 — 통과 재확인
```
$ npx vitest run
 Test Files  2 passed (2)
      Tests  24 passed (24)
EXIT:0
```
`lib/score.test.ts`(밴드·연봉·회전율·클램프·휴폐업·riskLabel 경계 19/20/49/50·turnover/estSalary)와 `lib/data.test.ts`(검색·explore 등급·getCompany·regionRank/salaryPercentile/riskLadder/nearby·코너) 모두 녹색.

---

## 1. 데드코드 — 잔존 확인

### 1-A. `NearbyResult.riskLabel` 미사용 데드필드 (잔존, 낮음)
- 정의: `lib/types.ts:62` `riskLabel: RiskLabel`
- 매번 채워서 전달: `app/company/[id]/page.tsx:59` `riskLabel: n.risk_label`
- 그러나 소비처 `components/NearbyList.tsx`는 `c.riskScore`(L37,39)·`c.salary`·`c.members`·`c.bizName`만 렌더하고 **`riskLabel`은 한 번도 사용하지 않음**(파일 전체 grep 0건). 타입·매핑·전달 비용만 발생.
- 조치: NearbyList 배지에 등급 텍스트로 실제 노출(접근성 라운드들이 권고한 "색 단독 의존" 해소와 동시 해결) 또는 type·매핑에서 제거.

### 1-B. `regionRank.percentile` 미사용 데드필드 (잔존, 낮음)
- 계산: `lib/data.ts:275` `percentile: Math.max(1, Math.round((rank/total)*100))`
- UI(`app/company/[id]/page.tsx:115-130`)는 `rrank.rank`·`rrank.total`만 쓰고, 비율은 **별도로 재계산**한다(L116 `const dp = rrank.rank/rrank.total`). 즉 `percentile`은 계산되나 어디에서도 읽히지 않음.
- 참고: `salaryPercentile.percentile`은 page.tsx:138에서 실사용 → 살아있음. region 쪽만 데드.
- 조치: region 배너에서 `dp` 대신 `rrank.percentile` 사용(중복 계산 제거) 또는 인터페이스에서 필드 삭제. data.test.ts:52-53이 region.percentile 범위를 검증 중이라, 필드 삭제 시 테스트도 동반 정리 필요.

### 1-C. chartTooltip 공용화 — 잔여 중복 양호 (Info)
`ChartTooltip`/`textWidth`는 `components/chartTooltip.tsx`로 단일화되어 LineChart·HireLeaveChart가 import만 한다(중복 제거 완료). 두 차트에 남은 유사 패턴(pad/gridYs/labelEvery/`y()` 스케일, sr-only 표)은 차트 종류(라인 vs 그룹막대)가 달라 강제 추상화 시 가독성만 해침 — **현행 유지 권장**.

---

## 2. 타입 안전

### 2-A. 불필요한 단언 `as RiskLabel` (잔존, 낮음)
`lib/data.ts:83` `risk_label: riskLabel(score) as RiskLabel`. `riskLabel()`의 반환 타입이 이미 `RiskLabel`(`lib/score.ts:12`)이므로 캐스팅 무의미 → 삭제 가능.
구분: `lib/score.ts:13` `core.riskLabel(score) as RiskLabel`는 `scoreCore.mjs`(타입 없음→`string`) 경계라 **1회 불가피**(허용). `as any`/`as unknown`은 전 프로젝트 0건 — 타입 위생 양호.

### 2-B. `JSON.parse(...) as Dataset` + fs 무방비 (중간)
`lib/data.ts:18-20`은 `fs.readFileSync(...companies.json) → JSON.parse → Dataset` 구조 단언. 파일 누락/손상/스키마 변형 시 런타임 throw, 컴파일러 보증 없음. 다만 OG(`opengraph-image.tsx:14`)·data.ts 모두 모듈 로드 시 동기 읽기라 실패하면 빌드/콜드스타트에서 바로 드러남(은폐 위험은 낮음). 검증 함수 1개로 최소 형상(`cols.name` 배열 존재 등)만 확인하면 안전.

### 2-C. 빌드 타입체크 통과 (근거)
`next build`의 "checking validity of types" 단계가 오류 없이 통과(0-1 로그). 타입 에러는 없음.

---

## 3. 테스트 커버리지 빈틈

실측 커버 범위는 양호하나 다음이 미검증:
- **middleware.ts (0건)**: 토큰버킷 레이트리밋(L9-27). 41번째/윈도우 만료 후 리셋/맵 정리(L25) 로직이 단위 테스트 없음. `middleware`는 순수 함수에 가까워(요청 헤더→응답) 모킹 1개로 429 경계 테스트 가능.
- **ShareButton (0건)**: `navigator.share` 유무 분기·clipboard 폴백·`copied` 토글(`components/ShareButton.tsx:8-26`). 분기 테스트 없음.
- **OG image (0건)**: `opengraph-image.tsx` — 이름 32자 절단(L22), 미존재 id 폴백("회사를 찾을 수 없음"/score 0/label "—"), 폰트 lazy 캐시. 적어도 절단·폴백 순수 부분은 테스트 가능.
- **exploreCompanies 정렬키**: `sort:"risk"`(=jotso)와 등급은 테스트되나(data.test.ts:27-39), **`sort:"salary"`·`sort:"members"` 내림차순 불변식은 미검증**(data.ts:247-249).
- **riskLadder 경계**: 위/아래 위험도 단조성은 검증(data.test.ts:63-70)되나, **group.length<4 → null**(data.ts:309), pos가 양끝(slice 빈배열)일 때 동작은 미검증.
- **format.ts (0건)**: `won`(억/만원 분기), `ymLabel`, **`riskColor`/`riskTextColor` 경계(20·50)**. 이 경계는 `scoreCore.riskLabel`(<20,<50)과 따로 하드코딩(format.ts:21-32)이라 SSOT와 갈라질 수 있어 회귀 가드가 특히 가치 있음.

권장 추가 6종: explore salary/members 정렬, riskLadder null/양끝, format 색 경계 19/20/49/50, won 억 환산, middleware 429, OG 이름 절단·폴백.

---

## 4. 빌드 NODE_OPTIONS 의존 — 실측상 불필요 (양호, 인식 정정)

대용량 JSON(45.3MB)이라 빌드/런타임에 `--max-old-space-size`가 필요할 것으로 우려되나, 실측은 그렇지 않다:
```
$ node (기본 힙)  → heap_size_limit ≈ 4144 MB
$ JSON.parse(companies.json)
  parse ms: 422   heapUsed: 171 MB   rss: 246 MB   (active 552,878 / closed 200)
$ npx next build   (NODE_OPTIONS 미설정)
  ✓ Compiled / ✓ Generating static pages (22/22) / EXIT:0
```
컬럼형+인터닝 설계 덕에 파싱 후 힙 171MB로 기본 4GB 한도의 5% 미만. **런타임·빌드는 NODE_OPTIONS 불요**. `--max-old-space-size=4096`은 `scripts/etl.mjs:2` 주석에만 존재(원시 CSV→JSON 사전계산 단계 한정)이며 앱 실행 경로와 무관. `next.config.mjs`의 `outputFileTracingIncludes`로 JSON·폰트가 서버 번들에 정확히 포함됨(빌드 로그상 company 라우트 정상 SSG).

---

## 5. 요약 (우선순위)

| # | 항목 | 심각도 | 근거 |
|---|------|--------|------|
| 0-1 | **next build/next lint 통합 린트 깨짐**(Next15.5×ESLint8 옵션 충돌) — 빌드 린트 게이트 무력 | 중간 | `Invalid Options: useEslintrc/extensions`, next lint EXIT:1 |
| 1-A | NearbyResult.riskLabel 데드필드(채워 보내나 미렌더) | 낮음 | NearbyList grep 0건 |
| 1-B | regionRank.percentile 데드필드(UI가 dp 재계산) | 낮음 | page.tsx:116 vs data.ts:275 |
| 2-A | `as RiskLabel`(data.ts:83) 불필요 단언 | 낮음 | score.ts:12 반환형 일치 |
| 2-B | `JSON.parse as Dataset`+fs 무검증 | 중간 | data.ts:18 |
| 3 | 미들웨어·ShareButton·OG·explore salary/members·riskLadder null·format 색경계 테스트 0 | 중간 | 커버리지 실측 |
| 4 | NODE_OPTIONS 의존 없음(빌드 EXIT:0, heap 171MB) | 양호 | 실측 |

긍정: `npx eslint .` 0건, vitest 24/24, 타입체크 통과, `as any` 0건, chartTooltip 공용화로 차트 중복 제거 완료, /api/nearby 제거 확인, 컬럼형 설계로 메모리 우려 해소.
최우선 1건: **0-1 빌드 린트 게이트 복구**(ESLint 9 업그레이드 또는 `next.config`의 `eslint.ignoreDuringBuilds` 명시화로 "무력한데 통과하는" 회색지대 제거).
