# Round4-01 — 프로덕션 런타임 전수 + 회귀

대상: https://jotsopan.vercel.app · 검증일 2026-06-20 · 방법: 실제 curl(추측 없음) + 코드 교차확인

## 점검범위

- 정적/주요 경로: `/`, `/about`, `/explore`(필터 10조합), `/monthly`, `/memorial`, `/awards`, `/game`, `/robots.txt`, `/sitemap.xml`
- API: `/api/search?q=` — NFC·NFD·전각·숫자·빈값·무파라미터·80자 초과·특수문자(`<script>`,`%%'`), 레이트리밋 버스트(45연속)
- 동적 회사 페이지: `/api/search`로 얻은 **비-히어로 회사 id 12종** + 휴폐업 1종에 대해 `/company/<id>`와 `/company/<id>/opengraph-image` 모두
- 엣지: 무효 id 페이지 vs OG 상태코드, 휴폐업 회사
- 회귀 대상(최근 변경): 검색 NFC/전각 정규화, 추천 2분화·"N배" 배지, 위험도 사다리, 지역순위/연봉백분위, 전역 푸터, `/about`, 시도명 통일, 사전 인덱스 리팩터
- 교차확인: `lib/data.ts`, `app/api/search/route.ts`, `middleware.ts`, `app/company/[id]/opengraph-image.tsx`, `app/sitemap.ts` 정독

전 경로 HTTP 200/404 정상, **5xx·타임아웃 0건**.

## 발견 (심각도·근거)

### [확인됨·해소] (회귀OK) 한글 검색 NFC/전각 정규화 — round3 [높음] 수정 확인
- 근거(curl): NFD 질의가 이제 NFC와 **동일 결과**.
  - NFC 삼성 `%EC%82%BC%EC%84%B1` → `삼성전자(주)…`
  - NFD 삼성 `%E1%84%89%E1%85%A1%E1%86%B7%E1%84%89%E1%85%A5%E1%86%BC` → 동일 `삼성전자(주)…`
  - NFD 병원도 NFC와 동일(`서울아산병원…`). 전각 `３１２` → `세메스주식회사…`(반각 매칭 성공).
- 코드 근거: `lib/data.ts:145` `normForSearch`가 `normalize("NFC")` + 전각→반각 + `toLowerCase`를 질의·`_nameLc` 양쪽에 적용. round3 핵심 버그 정상 해소.

### [낮음] 무효 id의 OG 이미지가 404 대신 200(플레이스홀더) — round3 [낮음] 잔존
- 근거(curl): `/company/nonexistent999` → **404**, 그러나 `/company/nonexistent999/opengraph-image` → **200 image/png**("회사를 찾을 수 없음" 카드).
- 코드 근거: `opengraph-image.tsx:21`이 `getCompany` 실패 시 `notFound()` 없이 `rawName="회사를 찾을 수 없음"` 폴백 렌더. 페이지와 상태코드 불일치(영향 경미, 미수정).

### [낮음] `/about`가 sitemap에 누락
- 근거(curl): `/about` 200(공개 페이지, 면책·데이터출처 등 정상)이나 `/sitemap.xml`에는 `""/explore/monthly/memorial/awards/game`만 등재.
- 코드 근거: `app/sitemap.ts:6` 배열에 `/about` 미포함. 투명성/법적 안내 페이지인 만큼 색인 가치 있음.

### [낮음] 레이트리밋 프로덕션 무력(설계 한계, 기존 인지)
- 근거(curl): `/api/search`에 45연속 요청 → 전부 **200**, 429 0건(로컬에선 40/10s 동작).
- 코드 근거: `middleware.ts:7` 인메모리 `Map` 카운터 → Vercel 다중 엣지 인스턴스로 분산되어 실효 없음. PROGRESS.md에 이미 한계 명시. 진짜 방어엔 공유 스토어(KV/Upstash) 필요.

### [정보] 위험도 사다리 "더 위험한 곳" 라벨이 동점(0)일 때 오해 소지
- 근거(curl): 서울아산병원(자체 위험도 0)의 "↑ 더 위험한 곳"에 쿠팡·삼성SDS(모두 위험도 0)가 노출. 실제론 더 위험하지 않고 동점.
- 코드 근거: `lib/data.ts:303` `riskLadder`가 점수 내림차순 정렬 후 자기 위치 위쪽 slice를 취함 → 동점 다수면 라벨과 수치가 어긋남. 버그 아님(정렬 안정화는 정상)이나 표현 개선 여지.

### [확인됨·양호] 최근 신규기능 전수 동작(회귀 없음)
- 추천 2분화: "송파구 풍납동의 다른 회사 · 연봉 높은 순" + **"N배" 배지**(예 `1.1배`) 정상 렌더.
- 지역순위/백분위: "같은 업종 2,159곳 중 3위 (상위 1%)" 정상.
- 위험도 사다리(더/덜 위험한 곳), 공유 버튼, 기준월, 전역 푸터(`/`,`/about`,`/explore`,`/game` 모두 노출) 정상.
- 시도명 통일: explore 드롭다운이 `강원특별자치도`·`전북특별자치도`·`제주특별자치도`·`세종특별자치시` 등 **현행 공식명**으로 일관.
- robots.txt: `/company/`·`/api/` Disallow(명예훼손 완화) 정상.

### [확인됨·양호] 동적 페이지·OG·엣지 견고
- 비-히어로 회사 12종 page 200(0.51~0.99s) + OG 12종 200 image/png(0.34~1.0s), 5xx 0건.
- 휴폐업 회사 page/OG 200. 빈/무파라미터/80자초과/특수문자 질의 모두 200(`{"results":[]}` 또는 정상), 5xx 미노출(try/catch).
- explore 10조합(시도·등급·정렬·무효값) 전부 200. `sido=존재안함`·`grade=invalid` 안전 처리.
- 캐시·보안: 회사 페이지 `X-Vercel-Cache: HIT`(Age 103), `Strict-Transport-Security` 헤더 적용.

### [정보] 콜드스타트 지연(설계 비용, 버그 아님)
- 근거(curl): 콜드 시 `/explore` 3.10s(워밍 후 0.27~0.96s). `lib/data.ts:18` 모듈 최상위 `JSON.parse(readFileSync(companies.json))`(552k행)이 콜드 초기화마다 실행. ISR/immutable 캐시로 체감 상쇄.

## 개선안

1. (낮음) `opengraph-image.tsx`: `getCompany` 실패 시 `notFound()` 호출해 페이지(404)와 OG 상태코드 일치. 폴백 카드 유지가 의도면 문서화.
2. (낮음) `app/sitemap.ts` 배열에 `/about` 추가(priority 0.5 정도).
3. (낮음) 라벨 정합: `riskLadder`에서 자기 점수보다 **엄격히 높은/낮은** 것만 더/덜 위험으로 분류하고 동점은 별도 처리하거나 제외 → "더 위험한 곳에 위험도 0" 오해 제거.
4. (낮음/외부) 레이트리밋 실효화: KV/Upstash 공유 카운터(사용자 키 필요). 현 인메모리는 best-effort.
5. (정보) 콜드스타트 완화(선택): 데이터 지연 로드/핵심 컬럼 우선. 현 캐시로 우선순위 낮음.

## 반성점

- round3에서 NFD 검증을 위해 명시 인코딩(`%E1%84…`)을 직접 구성한 절차를 이번에도 적용해, "데이터 없음"과 "정규화 버그"를 혼동하지 않고 수정 사실을 정확히 확정함.
- 레이트리밋은 단일 클라이언트 45연속만 측정 → 분산 무력화를 실증했으나, 동시 다중 IP/실제 스크래핑 패턴은 미커버(단일 측정 한계).
- 콜드/워밍은 동일 리전 단발 측정이라 P95·타 엣지 리전 지연은 미커버. 사다리 동점 이슈는 1개 회사(위험도 0)에서만 관찰 → 다른 점수대 표본 확대 검증 여지 남김.
