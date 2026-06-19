# Round3-01 — 프로덕션 런타임 전수 검증

대상: https://jotsopan.vercel.app · 검증일 2026-06-20 · 방법: 실제 curl (추측 없음)

## 점검범위

- 정적/주요 경로: `/`, `/explore`(필터 7조합), `/monthly`, `/memorial`, `/awards`, `/game`
- API: `/api/search?q=`(삼성·카카오·병원·숫자·빈·초장문), `/api/nearby?id=`(유효/무효/빈)
- 동적 회사 페이지: `/api/search`로 얻은 비-히어로 id 다수에 대해 `/company/<id>`와 `/company/<id>/opengraph-image` 모두
- 엣지: 시군구 결측(세종시), 87자 초장문 사명, 회전율 극단값(200%), 무효 id
- 교차확인: `lib/data.ts`, `app/company/[id]/page.tsx`, `opengraph-image.tsx`, `app/api/*`, `components/SearchBox.tsx` 정독 + 로컬 `data/companies.json` 대조

전 경로 HTTP 200/404 정상, 5xx·타임아웃 0건. 콜드스타트만 지연(아래).

## 발견 (심각도·근거)

### [높음] 한글 검색 무정규화 → 무음(無音) 결과 0건
- 근거(curl): 동일 "병원" 질의가 인코딩에 따라 결과가 갈림.
  - NFC `%EB%B3%91%EC%9B%90` → `서울아산병원` 등 정상 반환
  - NFD `%E1%84%87%E1%85%A7%E1%86%BC%E1%84%8B%E1%85%AF%E1%86%AB` → `{"results":[]}`
  - 검증 초기 `--data-urlencode "q=삼성/카카오/병원"`이 전부 0건이었던 원인도 동일(터미널이 NFD 전송).
- 데이터는 정상: 로컬 대조 결과 `data/companies.json` 사명은 전량 NFC이며 `includes("병원")` 4,234건 매칭.
- 코드 근거: `lib/data.ts` `searchCompanies`가 `q.trim().toLowerCase()`만 수행하고 `normalize("NFC")` 미적용. `components/SearchBox.tsx:23`도 `encodeURIComponent(q)`만 보내고 정규화 안 함.
- 영향: macOS 발(發) 텍스트·일부 IME·붙여넣기 입력은 NFD로 들어와 검색이 조용히 실패. 사용자에겐 "해당 회사 없음"으로 보임(사이트 핵심 기능 무력화).

### [낮음] 무효 id의 OG 이미지가 404 대신 200(플레이스홀더)
- 근거(curl): `/company/nonexistent999` → 404, 그러나 `/company/nonexistent999/opengraph-image` → 200 image/png("회사를 찾을 수 없음" 카드).
- 코드 근거: `opengraph-image.tsx`는 `getCompany` 실패 시 `notFound()` 없이 폴백 카드를 렌더. 페이지와 상태코드 불일치(크롤러 영향은 경미).

### [정보] 콜드스타트 지연(설계상 비용, 버그 아님)
- 근거(curl): 콜드 시 `/explore` 3.69s, `/company/<id>` 3.14s. 워밍 후 `/explore` 0.81s, 회사 페이지 `X-Vercel-Cache: HIT`(Age 66), OG는 `immutable max-age=31536000`.
- 원인: `lib/data.ts` 모듈 최상위 `JSON.parse(fs.readFileSync("data/companies.json"))`(552k행)이 함수 콜드 초기화마다 실행. 후속 요청·ISR 캐시로 상쇄됨.

### [확인됨·양호] 최근 OG 폰트 수정 정상 동작
- 비-히어로 OG 8건 + 엣지 5건 전부 200 image/png(0.35~0.97s), 5xx 0건. `font()` 지연 fs read가 콜드 전수 500을 해소했음을 실측 확인.

### [확인됨·양호] 엣지 데이터 견고
- 시군구 결측(세종시 `sg=""`), 87자 초장문 사명, 회전율 200% 회사 모두 page/OG 200. `addr`의 `.filter(Boolean).join(" ")`와 OG `maxWidth`가 결측·장문을 안전 처리.
- 무효/빈 id: 페이지 404(`notFound()` 정상), `/api/nearby` `{"scope":"all","results":[]}`, `/api/search` `{"results":[]}` — 트라이/캐치로 5xx 미노출.
- `/explore?sido=존재안함` → 200 빈 목록(정상 처리).

## 개선안

1. (높음) 검색 정규화: 서버 `searchCompanies` 진입부에 `q = q.normalize("NFC")` 추가, 가능하면 클라이언트 `SearchBox`에서도 `encodeURIComponent(q.normalize("NFC"))`로 이중 방어. `_nameLc` 생성 시점도 NFC 보장(현재 데이터는 NFC지만 ETL 변동 대비). 회귀 테스트로 NFD 질의 케이스 고정.
2. (낮음) OG 일관성: 무효 id의 `opengraph-image`에서 `getCompany` 실패 시 `notFound()` 호출해 페이지와 상태코드 일치. 폴백 카드 유지가 의도라면 그대로 두되 문서화.
3. (정보) 콜드스타트 완화(선택): 데이터 파싱을 첫 질의 시점 지연 로드로 바꾸거나, 핵심 컬럼만 우선 로드. 현 ISR/immutable 캐시로 체감 영향은 작아 우선순위 낮음.

## 반성점

- 검증 초기 한글 질의 0건을 "데이터에 없음"으로 오인할 뻔했음. 로컬 데이터 대조와 NFC/NFD 명시 인코딩 비교를 거쳐서야 무정규화 버그로 확정 — 한글 처리는 인코딩 정규화를 항상 분리 검증해야 한다는 교훈.
- 로컬에서 계산한 `baseId`는 충돌 해소 전 값이라 프로덕션 `getCompany`(idAt)와 어긋날 수 있었으나, 검색 API가 돌려준 실 id를 사용해 동적 페이지를 검증함으로써 회피.
- 콜드/워밍 타이밍을 구분해 기록했으나 동일 리전 단일 측정이라 P95·다른 엣지 리전 지연은 미커버.
