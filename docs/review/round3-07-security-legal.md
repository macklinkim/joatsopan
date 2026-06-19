# Round3-07 — 보안 · 법적 · 윤리 재점검 (완화 조치 검증)

점검일: 2026-06-20 / 대상: jotsopan (Next.js 15.5.x, `https://jotsopan.vercel.app` 공개 200, Vercel `prj_DUmDQSF…`)

## 점검 범위

Round2 이후 적용된 완화 조치 — (a) `commentForScore` 추정톤 완화, (b) 상세 페이지 고지문 코멘트 인접, (c) `next.config.mjs` 보안헤더 4종, (d) `/api` try/catch + 길이 가드, (e) OG 이미지(실명+점수 카드) — 가 실제 리스크를 충분히 낮췄는지 **프로덕션 응답을 직접 curl로 검증**하며 재평가한다.

1. 완화된 코멘트 톤의 명예훼손 리스크 잔존분 — 시상식 조롱 라벨, OG 카드 실명+위험단정, 고지/면책/정정창구/robots 노출
2. 보안헤더 실제 프로덕션 적용 여부(curl -I) 및 CSP 부재
3. `/api` 레이트리밋 부재 — 552k 전수 스캔 DoS 표면
4. OG 이미지가 임의 id로 실명 카드 생성 — 악용/스크래핑
5. 비밀/.env/번들 적정성

근거: `lib/data.ts:33-40, 313-317`, `app/api/search/route.ts`, `app/api/nearby/route.ts`, `app/company/[id]/page.tsx:90-95`, `app/company/[id]/opengraph-image.tsx`, `app/awards/page.tsx`, `app/layout.tsx`, `next.config.mjs`, `.vercelignore`, `.gitignore`, 그리고 **프로덕션 curl 응답 헤더/본문**(2026-06-19T17:46~17:47Z 채집).

## 발견 (심각도 · 근거)

### F1. 코멘트 톤은 완화됐으나 명예훼손 리스크는 잔존 [높음 / High]

`commentForScore`(`lib/data.ts:33-40`)는 Round2의 명령형·경멸 표현("도망치세요")을 제거하고 전부 "추정" 톤으로 전환됐다(예: `score>=70` → `"위험 신호가 강하게 추정됩니다. 입사 전 꼼꼼히 확인하세요."`). 상세 페이지도 코멘트(`page.tsx:90-92`) 바로 아래에 고지문을 인접 배치(`:93-95`)해 Round2-F2를 상당 부분 해소했다. **이 두 조치는 유효한 개선이다.**

그러나 잔존 리스크가 명확하다:
- **시상식 조롱 라벨 미완화** (`lib/data.ts:313-317`): `🚨 올해의 좋소`·`🥶 박봉 대상`·`🌀 회전문 대상`이 그대로다. `/awards`는 실명 회사를 실명+사업자번호+지역과 함께 이 라벨로 호명한다(`app/awards/page.tsx:23,32`). 코멘트 본문은 완화됐는데 시상식 라벨은 여전히 단정·경멸형이라, "추정" 고지(같은 페이지 `:39`)와 충돌한다. 실명+조롱 라벨 결합은 형법 제311조(모욕)·정보통신망법 제70조 소지가 본문 코멘트보다 오히려 크다.
- **OG 카드가 실명+위험 단정을 외부로 유포**: 프로덕션에서 `삼성전자(주)` 검색→id `qk3r3n124810`→`/company/qk3r3n124810/opengraph-image`가 **회사 실명 + "위험도 NN/100" + 위험등급 라벨**을 큰 PNG로 렌더함을 확인(200, `image/png`). 메타데이터 title도 `"{실명} 위험도 {점수} ({라벨})"`(`page.tsx:24`)라 SNS 공유 시 본문 고지문 없이 단정 카드만 전파된다 — 완화된 본문 톤이 무력화되는 경로.
- **robots/noindex 부재로 552k 전수 색인 노출**: 프로덕션 `GET /robots.txt` → **404**(파일 없음). 상세 페이지 응답에 `X-Robots-Tag` 없음(curl 확인). 즉 55만 실명 위험도 페이지가 검색엔진에 전면 색인 가능. 실명+추정 위험도가 검색결과에 노출되면 개별 분쟁 시 "공연성·전파성"이 강하게 인정될 소지.
- **정정/삭제 요청 창구 여전히 부재**: 고지문에 "참고용·비방목적 아님" 문구는 있으나(`page.tsx:94, 203`), 정정·삭제 신청 이메일/폼이 어디에도 없다. 분쟁 1건 발생 시 즉시 약점.

### F2. 보안헤더 프로덕션 적용 확인 — 단 CSP 부재 [중 / Medium]

`next.config.mjs:9-21`의 `headers()`가 실제 적용됨을 프로덕션 curl로 확인:
```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload   ← Vercel 자동 부여
```
홈·`/api/search`·OG 이미지·상세 페이지 응답 모두 4종 + HSTS 적용. Round2-F5(헤더 전무)는 **해소**. 다만:
- **`Content-Security-Policy` 부재**: XSS 심층방어·`frame-ancestors`(클릭재킹 방어 강화)·인라인 스크립트 차단이 없다. `X-Frame-Options: SAMEORIGIN`이 기본 임베드는 막으나 CSP `frame-ancestors`가 더 견고하다.
- 홈 응답에 `Access-Control-Allow-Origin: *` 관찰(Vercel 정적 자산 기본값). 공개 데이터라 직접 위험은 낮으나, 임의 출처에서 fetch 가능 → F4 스크래핑 용이성에 기여.

### F3. `/api` 레이트리밋 여전히 부재 — 552k 스캔 DoS 표면 [높음 / High]

`/api/search`·`/api/nearby` 모두 try/catch + 길이 가드(`q.slice(0,50)`, `id.slice(0,40)`)는 추가됐으나(인젝션·예외 누출 방어로는 적절), **레이트리밋은 없다**. `searchCompanies`는 매 요청 활성 552k 전수 선형 스캔(`lib/data.ts:156-161`, `nameLc[i].includes`)이라 요청당 비용이 크다.

프로덕션 검증: `GET /api/search?q=a`를 **20회 연속** 호출 → **전부 200**(차단·429 없음). `q=a`처럼 1글자 광범위 쿼리는 55만 건 includes 검사 + 최대 600건 수집·정렬을 매번 수행하므로, 동시·고빈도 호출 시 함수 CPU/메모리를 저비용으로 고갈시키는 DoS·대량 스크래핑 표면이다. OG 엔드포인트도 동일 무제한(F4).

구체 방어안:
- **IP 토큰버킷 레이트리밋**: `@upstash/ratelimit` + Upstash Redis로 `slidingWindow` (예: IP당 10 req/10s, OG는 더 낮게). Edge/Node 미들웨어에서 `req.ip`(또는 `x-forwarded-for`) 키로 제한, 초과 시 429 + `Retry-After`.
- **요청당 비용 절감**: 길이<2 쿼리 즉시 빈 배열 반환(현재 빈 문자열만 차단), 접두어 트라이/사전인덱스로 선형 스캔 제거.
- **응답 캐시**: 검색/주변/OG 응답에 `s-maxage` + `stale-while-revalidate`로 동일 쿼리 재계산 차단(OG는 이미 `max-age=31536000 immutable` — 캐시는 좋으나 첫 생성이 무제한인 점이 F4).

### F4. OG 이미지 — 임의 id로 실명 카드 생성·영구 캐시, 악용/스크래핑 [높음 / High]

`opengraph-image.tsx`는 인증·토큰·레이트리밋 없이 임의 `id`에 대해 실명+점수 카드를 동적 생성한다. 프로덕션 확인:
- `/company/{id}/opengraph-image` → 200, `Content-Type: image/png`, `Cache-Control: public, immutable, no-transform, max-age=31536000`.
- 즉 한 번 호출하면 **실명 위험도 카드가 1년간 CDN에 영구 캐시**되고 누구나 직링크 공유 가능.

리스크: (a) 어떤 실명 회사든 "위험도 카드 이미지 URL"을 생성해 SNS·커뮤니티에 본문 고지 없이 유포(F1 톤 완화 무력화), (b) id는 `해시+사업자번호6자리`(`data.ts:54`)라 검색 API로 대량 수집→OG 이미지 대량 생성으로 55만 카드 스크래핑·아카이빙 가능, (c) 생성 비용(Node 런타임 + 폰트 로드 + ImageResponse)이 검색보다 높아 DoS 표면도 큼.

방어안: OG 생성에도 F3의 레이트리밋 적용(특히 강하게), 또는 OG는 사전생성된 HERO_IDS만 동적 허용하고 그 외엔 실명 없는 기본 카드로 폴백, 또는 OG 카드에서 위험 "단정 라벨/점수"를 빼고 중립 브랜드 카드로 대체(명예훼손·악용 동시 완화).

### F5. 비밀/.env/번들 — 대체로 양호, 번들 부담 잔존 [정보 / Info]

- 디스크에 `.env*` 없음, 외부 API/토큰 미사용(로컬 JSON). `.gitignore`가 `.env`·`.env*.local`·`.vercel`·`*.pem`·`/data/raw/` 제외. 비밀 노출 위험 없음.
- `.vercelignore`가 `data/raw`(원본 CSV)·`*.png`·`docs/review` 제외 — 적정.
- 단 Round2-F3(44MB `data/companies.json` 커밋 + `outputFileTracingIncludes: "/**"`로 전 함수 번들에 트레이싱)은 **이번 점검 범위에서 변동 없음**. 보안/법적 직접 리스크는 아니나 콜드스타트·번들 한도 관점 잔존(별도 perf 회차 사안).

## 구체적 개선안

### 즉시 (법적 리스크 — 최우선, F1)
1. 시상식 라벨 완화(`lib/data.ts:313-317`): `🚨 올해의 좋소`·`🥶 박봉 대상`·`🌀 회전문 대상` → "추정 위험지표 상위"·"추정 연봉 하위" 등 중립 라벨, 또는 시상식은 실명 마스킹/익명 표기.
2. OG 카드·메타 title에서 위험 단정 제거 또는 약화(`opengraph-image.tsx`, `page.tsx:24`): 점수+위험라벨 카드 대신 중립 브랜드 카드, title은 `"{실명} — 좋소판별기(추정·참고용)"` 수준으로.
3. `robots.txt`/`app/robots.ts` 추가로 `/company/*` `Disallow` 또는 상세 페이지 메타에 `robots: { index: false }`, 응답 `X-Robots-Tag: noindex` — 55만 실명 페이지 검색 색인 차단.
4. 정정/삭제 요청 창구(이메일/폼) + 데이터 출처·산정식·기준월 설명 페이지 신설, 고지문에서 링크.

### 코드/운영 (F2·F3·F4)
5. `@upstash/ratelimit` IP 토큰버킷을 `middleware.ts`에 도입 — `/api/*` 및 OG 라우트에 적용, 초과 시 429+`Retry-After`. OG는 더 엄격하게.
6. 검색 길이<2 즉시 빈 배열 반환 + 사전인덱스로 선형 스캔 제거(요청당 비용 자체 절감).
7. `next.config.mjs` `headers()`에 `Content-Security-Policy`(`frame-ancestors 'none'` 포함) 추가.

## 반성점

- Round2는 헤더·레이트리밋을 코드만 보고 평가했으나, 이번엔 **프로덕션 curl로 실증**했다: 보안헤더 4종+HSTS는 실제 적용(F2 해소 확인)됐으나, 레이트리밋 부재(20연속 200)·robots 404·OG 임의생성+1년 캐시는 코드만 봤다면 놓쳤을 실측 근거다.
- 완화 조치(코멘트 톤·고지 인접)는 진짜 개선이라 인정하되, "본문만 완화하고 시상식 라벨·OG 카드·검색 색인은 그대로"라 **유포 경로에서 단정톤이 살아남는** 구조적 잔존을 핵심으로 격상했다. 본문 한 곳의 완화에 안주하지 않도록 데이터가 외부로 나가는 표면(OG/SNS/검색) 전체를 따라가며 평가했다.
- 사업자번호 진위·국민연금 데이터 이용약관 조항은 외부 확인 없이 단정하지 않고 권고로 표시. HSTS는 Vercel 자동 부여분이며 `next.config`에 없음을 명시했다.
