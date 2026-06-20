# Round4-06 — 보안 · 법적 · 윤리 재점검 (완화 조치 실측 검증)

점검일: 2026-06-20 / 대상: jotsopan (Next.js 15.5.x, `https://jotsopan.vercel.app` 공개 200) / 관점: 보안·법적·윤리

## 점검 범위

Round3 이후 적용된 완화 조치 — (a) `app/robots.ts`로 `/company/`·`/api/` 색인 제외, (b) `/about` 데이터출처·면책·정정안내, (c) 전역 푸터 고지, (d) 시상식 라벨 중립화, (e) `commentForScore` 추정톤, (f) `middleware.ts` `/api` 인메모리 레이트리밋, (g) `next.config.mjs` 보안헤더 — 가 실제 리스크를 낮췄는지 **프로덕션 curl로 직접 실측**하며 재평가한다. 특히 Round3에서 미흡으로 남긴 (1) robots 색인 차단 실효, (2) 면책·정정안내의 명예훼손 완화 실질, (3) 레이트리밋 프로덕션 실효(연속/병렬 요청), (4) OG 임의 id 카드 남용/캐시, (5) CSP 부재를 근거 기반으로 확인한다.

근거: `app/robots.ts`, `app/sitemap.ts`, `app/about/page.tsx`, `components/Footer.tsx`, `middleware.ts`, `next.config.mjs`, `app/api/search/route.ts`, `app/company/[id]/page.tsx:21-33`, `app/company/[id]/opengraph-image.tsx`, `app/awards/page.tsx`, `lib/data.ts:32-40,354-358`, 그리고 **프로덕션 curl 응답 헤더/본문**(2026-06-20 채집).

## 발견 (심각도 · 근거)

### F1. 레이트리밋이 프로덕션에서 사실상 무력 — 인메모리 한계 실증 [높음 / High]

`middleware.ts`는 인스턴스 메모리 `Map` 기반 토큰버킷(`WINDOW=10s`, `LIMIT=40`)을 도입했다. 코드만 보면 IP당 40req/10s 초과 시 429를 반환해야 한다. **그러나 프로덕션 실측에서 전혀 차단되지 않는다.**

근거(curl):
```
# 60회 연속 GET /api/search?q=a
Count by code:  60  200      ← 429 단 1건도 없음 (LIMIT=40 무시됨)

# 30회 병렬(-P 30) 동시 호출
30  200                      ← 역시 전부 통과
```
원인은 주석(`middleware.ts:4`)이 인정한 그대로다: Vercel 서버리스/엣지는 요청이 **여러 인스턴스로 분산**되고 각 인스턴스는 자체 빈 `Map`을 갖는다. 콜드스타트마다 카운터가 초기화되므로 단일 IP의 60연속도 임계에 도달하지 못한다. 즉 현재 구현은 **DoS·대량 스크래핑 방어로서 실효가 없다**(연속 40+를 한 인스턴스가 받아야만 작동하나 그 보장이 없음). `searchCompanies`는 요청당 활성 사업장 전수 선형 스캔이라 요청당 비용이 커, 무차단 노출은 그대로 비용 고갈 표면이다.

대안:
- **중앙 상태 저장소 기반 레이트리밋**: `@upstash/ratelimit` + Upstash Redis(Vercel KV/Marketplace)로 `slidingWindow`(예: IP당 10req/10s). 분산 인스턴스가 동일 카운터를 공유하므로 실효 확보. 초과 시 429 + `Retry-After`.
- 인메모리 유지 시에도 한 인스턴스에 집중되는 단일 IP 버스트만 막을 수 있음을 명시하고, 진짜 방어는 KV로 이관해야 함.

### F2. OG 이미지 — 임의 id로 실명+점수 카드 동적 생성, 1년 영구 캐시 [높음 / High]

`opengraph-image.tsx`는 인증·토큰·레이트리밋 없이 임의 `id`에 대해 **실명 + "위험도 NN/100" + 위험등급 라벨** PNG를 동적 생성한다(`:42-54`). 프로덕션 확인:
```
GET /company/qk3r3n124810/opengraph-image  (삼성전자(주))
→ 200, Content-Type: image/png
  Cache-Control: public, immutable, no-transform, max-age=31536000  ← 1년 영구 캐시

GET /company/zzzz99999999/opengraph-image  (존재하지 않는 임의 id)
→ 200, image/png  ← 임의 id도 무조건 카드 생성(폴백)
```
리스크: (a) 어떤 실명 회사든 위험도 카드 URL을 만들어 SNS·커뮤니티에 본문 고지 없이 유포 → 완화된 본문/추정 톤이 무력화, (b) `/api/search`로 id 대량 수집(F1 무차단) → OG 대량 생성으로 실명 카드 스크래핑·아카이빙, (c) `robots.txt`는 `/company/` 크롤만 막지 OG 직링크 공유·캐시는 못 막는다. Round3-F4 **미해소**. 또한 `generateMetadata`의 페이지 title도 여전히 `"{실명} 위험도 {점수} ({라벨}) — 좋소판별기"`(`page.tsx:25`)라 공유 카드 텍스트에 위험 단정이 박힌다.

방어안: OG에 F1 KV 레이트리밋(특히 강하게) 적용, 또는 위험 점수·등급 라벨을 빼고 중립 브랜드 카드로 대체(명예훼손·악용 동시 완화), 또는 사전생성 HERO id만 동적 허용·그 외 실명 없는 기본 카드 폴백.

### F3. 상세 페이지 색인 차단 — robots.txt는 실효, 단 X-Robots-Tag 미보강 [중 / Medium]

Round3의 404였던 robots가 해소됐다. 프로덕션 실측:
```
GET /robots.txt (Googlebot UA) → 200
  User-Agent: *
  Allow: /
  Disallow: /company/
  Disallow: /api/
  Sitemap: https://jotsopan.vercel.app/sitemap.xml

sitemap.xml → /company/* 미포함(메인/explore/monthly/memorial/awards/game만), /api 미포함  ← 적절
GET /about → 200 (X-Robots-Tag 없음, 색인 허용)  ← 적절
```
robots Disallow + sitemap 제외는 유효한 개선이다(Round3-F1의 색인 표면 해소). 다만:
- **`X-Robots-Tag: noindex` 부재**: 상세 페이지 응답에 noindex 헤더가 없음(`curl -I /company/{id}` → `x-robots-tag` 미존재). `robots.txt`의 `Disallow`는 크롤을 막지만, 외부에서 직접 링크된 URL은 본문 없이도 검색결과에 색인될 수 있다(Google 공식 동작). 심층방어로 상세 페이지 메타에 `robots: { index: false }`(응답 `X-Robots-Tag: noindex`)를 병행하면 직링크 색인까지 차단된다.
- `/about`은 sitemap에 미등재(색인은 허용되나 사이트맵 미광고) — 데이터출처·면책 페이지는 오히려 색인되는 게 법적으로 유리하므로 sitemap에 추가 권장.

### F4. 면책·정정안내는 개선됐으나 "정정·삭제 창구" 실질 부재 [중 / Medium]

`/about`(`app/about/page.tsx`)은 데이터 출처(국민연금공단·data.go.kr·기준월), 위험도 산정식 4신호, "한계와 면책"(추정·교차확인 권고·비방목적 아님)을 명시해 Round3 대비 크게 개선됐다. 전역 푸터(`Footer.tsx:7-10`)·시상식 페이지(`awards/page.tsx:39-41`)·상세 페이지도 동일 고지를 반복 노출한다. **이 다층 고지는 명예훼손 방어(공익성·진실성 추정·비방목적 부정)에 유효하다.**

그러나 잔존:
- **당사자 정정·삭제 신청 통로가 없다**: `/about` 정정안내(`:56-59`)는 "정정·삭제는 원본 공공데이터(data.go.kr) 기준이며 본 서비스는 가공 표시할 뿐 별도 데이터를 보유하지 않는다"고만 안내한다. 이는 책임 회피 문구로는 일부 의미가 있으나, **실제 분쟁 1건 발생 시 당사자가 본 서비스에 직접 정정/비공개를 요청할 이메일·폼이 어디에도 없다**. 명예훼손/개인정보 분쟁에서 "삭제 요청 즉시 응함"은 위법성·고의 조각의 핵심 정황인데, 그 창구 자체가 없어 실질 완화가 제한된다.
- 가공 데이터(점수·등급·"좋소 확정" 라벨)는 원본에 없는 본 서비스의 **2차 저작·평가**이므로 "원본 기준" 안내만으로는 책임 분리가 불완전하다. 가공 결과에 대한 자체 정정/비공개 창구 신설 필요.

### F5. 보안헤더 4종+HSTS 적용 확인 — 단 CSP 부재·CORS 와일드카드 [중 / Medium]

`next.config.mjs:9-21` 헤더가 프로덕션에 실제 적용됨을 curl로 확인:
```
GET /  →
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload   ← Vercel 자동
  Access-Control-Allow-Origin: *                                            ← 정적 자산 기본값
```
Round3-F2 그대로 유지(해소). 다만:
- **`Content-Security-Policy` 부재**: XSS 심층방어·`frame-ancestors`(클릭재킹 강화)·인라인 스크립트 통제가 없다. `X-Frame-Options: SAMEORIGIN`이 기본 임베드는 막으나 CSP `frame-ancestors 'none'`이 더 견고. 사용자 입력을 DOM에 직접 삽입하지 않는 구조라 XSS 실위험은 낮으나, 심층방어로 `default-src 'self'` 기반 최소 CSP 권장.
- `Access-Control-Allow-Origin: *`(Vercel 정적 자산 기본): 공개 데이터라 직접 위험은 낮으나 임의 출처 fetch를 허용해 F1 스크래핑 용이성에 기여.

### F6. 시상식 라벨 중립화·코멘트 추정톤 — 유효한 개선 [정보 / Info]

- 시상식 라벨(`lib/data.ts:354-358`)이 Round3의 `🚨 올해의 좋소`·`🥶 박봉 대상`·`🌀 회전문 대상`에서 **`🌀 회전율 최고`·`💸 추정 연봉 최저`·`🚨 위험도 최고`·`🏆 위험도 최저`·`🏢 직원 수 최다`**로 중립화됨. 조롱·단정형 → 지표 서술형 전환은 모욕(형법 311조) 소지를 실질 완화. Round3-F1의 핵심 잔존이 해소됨.
- `commentForScore`(`lib/data.ts:33-40`)는 전부 "추정" 톤 유지(`"위험 신호가 강하게 추정됩니다…"` 등) — 명령형·경멸 표현 없음. 적절.
- 단 시상식 카드·OG·상세 title이 여전히 실명+점수를 결합 노출하는 점은 F2와 연결(라벨은 중립화됐으나 "실명+위험도 숫자" 유포 경로는 잔존).

### F7. 비밀/.env/번들 — 양호 [정보 / Info]

디스크에 `.env*` 없음, 외부 API/토큰 미사용(로컬 JSON). 비밀 노출 위험 없음. (번들 크기는 perf 회차 사안, 보안 직접 리스크 아님.)

## 구체적 개선안

### 즉시 (법적 — 최우선)
1. **OG 카드·페이지 title에서 위험 단정 제거**(F2): `opengraph-image.tsx`의 점수+등급 라벨 → 중립 브랜드 카드로 대체, `page.tsx:25` title을 `"{실명} — 좋소판별기(추정·참고용)"` 수준으로 약화.
2. **자체 정정·삭제 요청 창구 신설**(F4): `/about`에 본 서비스 직접 정정/비공개 신청 이메일·폼 추가, 푸터에서 링크. "요청 시 즉시 비공개" 정책 명문화.

### 코드/운영
3. **KV 기반 레이트리밋으로 교체**(F1): `@upstash/ratelimit` + Upstash Redis(Vercel Marketplace)로 분산 실효 확보, `/api/*` 및 OG 라우트(더 엄격) 적용, 429+`Retry-After`. 인메모리 단독은 폐기.
4. **상세 페이지 `X-Robots-Tag: noindex` 병행**(F3): `generateMetadata`에 `robots:{ index:false, follow:false }` 추가로 직링크 색인까지 차단. `/about`은 sitemap에 추가.
5. **CSP 추가**(F5): `next.config.mjs` `headers()`에 `Content-Security-Policy`(`frame-ancestors 'none'`, `default-src 'self'` 기반) 도입.
6. **검색 요청당 비용 절감**(F1 보강): 길이<2 쿼리 즉시 빈 배열 반환, 사전인덱스로 선형 스캔 제거, 검색 응답 `s-maxage`+`stale-while-revalidate` 캐시.

## 반성점

- Round3는 레이트리밋 "부재"를 지적했고, 이번엔 도입된 인메모리 구현을 **프로덕션 60연속·30병렬 curl로 실측**했더니 429가 단 1건도 없었다 — 코드상 `LIMIT=40`만 보면 "방어됨"으로 오판할 수 있던 것을, 분산 인스턴스별 빈 Map이라는 실측 근거로 "사실상 무력"으로 격하했다. "도입됨 ≠ 실효"를 실측으로 분리한 점이 핵심.
- robots 404→200, 시상식 라벨 중립화, /about 면책은 **진짜 개선**으로 인정하되, 데이터가 외부로 나가는 표면(OG 직링크·1년 캐시·page title)에서 여전히 "실명+위험도 숫자"가 본문 고지 없이 유포되는 구조를 잔존 핵심으로 유지했다. 한 곳의 완화에 안주하지 않고 유포 경로 전체를 추적.
- HSTS는 Vercel 자동 부여분(`next.config` 미기재)임을 명시. 명예훼손/개인정보 법리 적용 여부는 단정하지 않고 "창구 신설이 분쟁 시 위법성 조각 정황"이라는 권고 수준으로 표기.
