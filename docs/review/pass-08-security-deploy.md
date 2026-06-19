# Pass 08 — 보안 & 배포 & 법적/윤리 리스크 점검

점검일: 2026-06-20 / 대상: jotsopan (Next.js 15.5.19, Vercel 배포, GitHub macklinkim/joatsopan)

## 점검 범위

- (1) Vercel Deployment Protection으로 인한 공개 접근 401 — 일반 사용자 접근 불가 문제
- (2) `/api/search`·`/api/nearby` 입력 검증 및 레이트리밋
- (3) 비밀/환경변수 노출, `.gitignore` 적정성, `.vercel`/`.env` 커밋 여부
- (4) 실명 기업 데이터 공개의 명예훼손/비방 리스크와 고지문 적정성
- (5) `next.config`/HTTP 보안 헤더

근거: `app/api/search/route.ts`, `app/api/nearby/route.ts`, `lib/data.ts`, `next.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/company/[id]/page.tsx`, `.gitignore`, `.vercel/`, `git log`.

## 발견 (심각도 · 근거)

### F1. Deployment Protection 401 — 일반 사용자 접근 불가 [심각 / High]
사용자 핵심 불만("웹에서 접근하면")과 직결되는 항목이나, **코드/설정 레벨에서는 근거를 확인할 수 없었다.** 이 프로젝트 어디에도 `vercel.json`이 없고(`git ls-files`에 미존재), Protection은 Vercel 대시보드의 프로젝트 설정(Settings → Deployment Protection)에만 존재하는 서버측 토글이라 리포지토리 파일로는 확인 불가다. 따라서 "401이 Deployment Protection 때문"이라는 것은 **현재 코드 근거로는 추정 단계**이며, 확정하려면 실제 응답 확인이 필요하다(아래 개선안 참조). 다만 `.vercel/project.json`으로 프로젝트가 링크돼 있음(`projectId: prj_DUmDQSF1VCLrQnuAWCZQZreg0BUI`)은 확인됐다.

### F2. API 입력 검증 전무 [중 / Medium]
`app/api/search/route.ts:6` — `q`를 길이/문자 제한 없이 그대로 받는다. `app/api/nearby/route.ts:6` — `id`도 동일. 다만 실제 위험은 제한적이다: 데이터가 메모리 내 배열(`lib/data.ts`)이고 `searchCompanies`는 `q.trim().toLowerCase()` 후 `String.includes`만 수행(`lib/data.ts:387-393`), `nearbyCompanies`는 `Map.get(id)`로 조회(`lib/data.ts:404-406`)라 SQL/명령 인젝션 경로가 없다. 그러나 길이 무제한 `q`는 매 요청 전체 배열(508개) 스캔을 유발해 비용·DoS 표면이 된다. 향후 M9에서 Supabase 실데이터로 전환되면 `q`가 쿼리에 직접 들어갈 수 있어 지금 검증을 넣어두는 것이 안전하다.

### F3. 레이트리밋 부재 [중 / Medium]
두 라우트 모두 레이트리밋이 없다. 공개 서비스 전환 시 검색 API가 무제한 호출 가능 — 비용·스크래핑·DoS 노출. 현재는 정적 데이터라 영향이 작지만 실데이터 연결 시 즉시 위험으로 격상된다.

### F4. 비밀/환경변수 노출 — 위험 없음 [정보 / Info — 양호]
- `git log --all`로 `.env*`/`.vercel`/`secret`/`.pem`/`key` 패턴 커밋 이력 검색 결과 **0건**.
- 디스크에 `.env*` 파일 자체가 없음.
- 코드 전반에 하드코딩된 토큰/키 없음(데이터는 PRNG로 생성, 외부 API 호출 없음).
- `.gitignore`가 `.env`, `.env*.local`, `.vercel`을 모두 포함(`.gitignore:21-22,25-28`)하며, `git check-ignore .vercel/project.json`이 정상 매칭됨. `.vercel/project.json`의 `projectId`/`orgId`는 비밀이 아니나(공개돼도 무해), gitignore로 잘 제외돼 있음.
- 결론: 이 항목은 양호. 단, `.gitignore`에 `.vercel`이 중복(21행, 28행) 기재 — 무해하나 정리 권장.

### F5. 보안 헤더 전무 [중 / Medium]
`next.config.mjs`가 빈 객체(`const nextConfig = {};`)다. `headers()` 설정이 없어 `Content-Security-Policy`, `X-Frame-Options`(클릭재킹), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security`가 모두 미설정. 실명 기업 위험도를 다루는 서비스 특성상 iframe 임베드 방지(클릭재킹으로 "이 회사는 위험" 화면을 제3자 사이트에 끼워넣는 행위)는 특히 중요하다.

### F6. 실명 기업 데이터 공개 — 명예훼손/비방 리스크 [심각 / High — 법적 핵심]
이번 점검에서 가장 중요한 발견이다. `lib/data.ts`의 8개 시드(`SEEDS`, 19-184행)는 **실명/실주소/실 사업자번호 앞 6자리로 보이는 값**을 쓴다 — 예: "주식회사 샤이닝라이언"(`bizNo6: "304880"`, 종로구 종로3길), "주식회사 아나패스"(`220117`, 강남구 테헤란로), "맑은소프트"(`119863`). 여기에 단정적·모욕적 코멘트가 하드코딩돼 있다:
- `lib/data.ts:64` 샤이닝라이언 — "도망치세요. 이건 훈련 상황이 아닙니다." + `forceScore: 78`(고위험)
- `lib/data.ts:118` 엠피테크 — "회전문이 바쁩니다. 들어가기 전에 다시 생각하세요."
- `lib/data.ts:182` 야근소프트 — "도망치세요. 야근의 향기가 납니다."

만약 이 중 하나라도 실재 법인과 식별 가능하게 매칭되고, 수치(연봉 621만원·회전율 192% 등)가 사실과 다르거나 비하 표현이 동반되면 한국 정보통신망법상 사이버 명예훼손(제70조) 또는 형법상 모욕/명예훼손 소지가 있다. "추정치·참고용" 고지가 있더라도 (a) 비방 목적이 아니고 (b) 공공의 이익에 부합한다는 위법성 조각 요건을 자동 충족하지 않는다. 특히 "도망치세요" 같은 표현은 의견이 아니라 사실적시+모욕으로 해석될 여지가 있다.

추측을 배제하고 단정할 수 있는 사실: 나머지 500개사는 `genSeeds`(284-322행)로 생성된 **명백한 가공 데이터**(이름 = 어간+접미사 조합, 사업자번호 = 12자리 난수 앞 6자리)다. 즉 데이터셋은 "실명 의심 8개 + 가공 500개"의 혼합이며, 법적 위험은 전적으로 8개 시드에 집중된다.

### F7. 고지문은 존재하나 위치/강도 부족 [중 / Medium]
고지문은 `app/page.tsx:24`, `app/company/[id]/page.tsx:150`("특정 기업 비방 목적이 아닙니다"), `app/layout.tsx:24` 메타데이터에 있다. 그러나 (a) 회사 상세 페이지에서 푸터 최하단에만 있어 단정적 코멘트("도망치세요")보다 시각적 비중이 현저히 낮고, (b) 데이터 출처·산정식·정정 요청 창구·면책 범위를 명시한 별도 고지/약관 페이지가 없다.

## 구체적 개선안

### 즉시 (법적 리스크 차단 — 최우선)
1. **8개 실명 시드를 가공명으로 교체**하거나, 실명을 유지하려면 모욕적 코멘트를 제거하고 수치 옆에 "예시·가상 데이터" 명시. `lib/data.ts:64,118,182` 등의 "도망치세요" 류 문구는 의견이 아닌 단정/모욕으로 읽히므로 최우선 제거 대상. 포트폴리오/개인용이라면 전부 가공명(`genSeeds` 방식)으로 통일하는 것이 가장 안전.
2. 상세 페이지 고지문을 **헤더 근처 상단으로 이동** + "데이터 정정 요청" 연락처, 산정 방식 링크 추가(`app/company/[id]/page.tsx`).

### 배포 (F1)
3. 실제 응답을 확인해 401 원인을 확정: `curl -sI https://jotsopan.vercel.app` 로 헤더(`x-vercel-protection`, `set-cookie`, `www-authenticate`)와 상태코드 확인. Deployment Protection이 원인이면 Vercel 대시보드 Settings → Deployment Protection에서 Production을 Public으로 전환(또는 Vercel Authentication을 Preview에만 적용). 트레이드오프: 보호 해제 시 프리뷰 URL도 공개 인덱싱될 수 있으므로 Production만 공개하고 Preview는 보호 유지 권장.

### 코드 (F2·F3·F5)
4. 입력 검증: `q`는 `slice(0, 50)` 등 길이 제한 + `q.length < 1`이면 빈 배열 즉시 반환(`app/api/search/route.ts`). `id`는 화이트리스트 형식(영숫자) 검증(`app/api/nearby/route.ts`).
5. 레이트리밋: Vercel 환경이면 `@upstash/ratelimit` + Upstash Redis, 또는 미들웨어 레벨 IP 기반 간이 제한. 실데이터 연결 전까진 우선순위 낮음.
6. 보안 헤더: `next.config.mjs`에 `async headers()` 추가 — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`(또는 CSP `frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin`, HSTS. CSP는 next/font·인라인 스타일과 충돌 주의해 점진 도입.

### 정리 (F4)
7. `.gitignore`의 중복된 `.vercel`(21행/28행) 한 줄로 정리 — 무해하나 깔끔하게.

## 반성점

- F1(401)을 "발견"이 아니라 "추정"으로 강등한 점을 명확히 했다. 프롬프트가 "추측 금지"를 요구했고, Deployment Protection은 리포 파일에 흔적이 없는 대시보드 설정이라 코드만으로는 단정할 수 없었다. 확정하려면 실제 HTTP 응답 확인이 필요한데 이번 점검은 정적 코드/설정 범위로 한정해 수행했다 — 이 경계를 넘지 않았다.
- 가장 큰 리스크가 흔한 "비밀 노출"이 아니라 **데이터의 법적 성격(실명 의심 8개사)**이라는 점은 코드를 직접 읽지 않았으면 놓쳤을 부분이다. 반대로 비밀/gitignore 항목은 실제로 매우 양호해서, 점검 관점이 "보안"에 쏠려 법적 리스크를 과소평가할 뻔했다.
- 실명 시드가 실재 법인과 정확히 일치하는지(사업자번호 진위 등)는 외부 조회 없이 단정 못 한다. "실명으로 보인다"까지만 근거 있게 서술하고 그 이상은 추측으로 표시했다.
