# Round3-09 — OG 이미지·메타데이터 품질/견고성 점검

점검일: 2026-06-20 / 대상: jotsopan (Next.js 15.5.19 App Router, Vercel `https://jotsopan.vercel.app` 공개 200)

## 점검 범위

- (1) `metadataBase` 미설정 → `og:image`/`twitter:image` 절대 URL 해석 경고·소셜 공유 시 이미지 미표시 위험
- (2) 매우 긴 회사명/특수문자에서 OG 카드 레이아웃 오버플로(satori 자동 줄바꿈, 고정 높이 630px)
- (3) 결측 데이터(지역/업종 빈값) 카드 렌더
- (4) Pretendard OTF 지연로드 후에도 OG 응답 200·유효 PNG 유지
- (5) `twitter:image`/`og:image` 절대경로·`alt`·캐시 헤더
- (6) 홈/explore 등 코너 페이지 기본 OG 부재(루트 레이아웃 기본 og 미설정)

근거: `app/company/[id]/opengraph-image.tsx`, `app/company/[id]/page.tsx`(`generateMetadata`), `app/layout.tsx`, `lib/data.ts`, `assets/Pretendard-Bold.otf`, Grep(`metadataBase` 0건), **프로덕션 실측 curl**(여러 회사 OG 바이너리 + 페이지 HTML 메타 태그). 점검 회사 ID(실데이터): `qk3r3n124810`(삼성전자(주)), `82ei8a837870`(쿠팡풀필먼트), `131ni2z809860`(76자 영문 혼합 사명), `uzuylr130820`(동 결측), `sxudck312812`(휴폐업), `DOESNOTEXIST99`(미존재).

## 발견 (심각도 · 근거)

### F1. `metadataBase` 미설정 — 빌드 경고 + 비-Vercel 환경에서 `localhost` fallback [중 / Medium]
프로젝트 전체에 `metadataBase`가 **0건**(Grep)이고 `app/layout.tsx:22-25`의 루트 `metadata`에도 없다. 그럼에도 프로덕션 HTML 실측에서는 절대 URL로 정상 해석되었다:

```
<meta property="og:image" content="https://jotsopan.vercel.app/company/qk3r3n124810/opengraph-image?f80fbb9cb957eca9"/>
<meta name="twitter:image" content="https://jotsopan.vercel.app/company/.../opengraph-image?..."/>
```

이는 Next.js가 `metadataBase` 부재 시 **Vercel 배포 환경의 `VERCEL_URL`/프로덕션 URL을 자동 추론**하기 때문이다(파일 기반 `opengraph-image`라 상대경로가 자동 절대화됨). 따라서 *현재 프로덕션 한정*으로는 소셜 공유가 동작한다. 그러나:
- **빌드 시 `metadataBase is not set` 경고**가 남고(과제 전제와 일치), 로컬/프리뷰/커스텀 도메인·`localhost`에서 빌드하면 `og:image`가 `http://localhost:3000/...`로 굳어져 소셜 크롤러가 이미지를 못 가져온다.
- 자동 추론 URL은 배포 도메인 변경(커스텀 도메인 연결 등) 시 깨질 수 있다.

→ `app/layout.tsx`에 `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://jotsopan.vercel.app")` 명시로 환경 비의존·경고 제거 필요. (소셜 공유 미표시 "가능성"은 환경에 따라 실재하나, 프로덕션 단건 한정으론 미발현 — 그래서 "치명"이 아닌 "중".)

### F2. 76자 장문 사명 → OG 카드 세로 오버플로·상하 텍스트 충돌 [상 / High]
`opengraph-image.tsx:41`의 사명은 `fontSize:64, lineHeight:1.1, maxWidth:760`로 **폭만** 제한하고 높이 제한이 없다. 카드는 `height:100%`(630px) 고정 + `justifyContent:"space-between"`로 3블록(브랜드/사명/점수)을 배치한다. 장문 사명이 7줄로 늘면 컨테이너 높이를 초과해 위·아래 블록과 겹친다.

프로덕션 실측(`131ni2z809860`, 사명 76자 "한국디엑스씨테크놀로지엔터프라이즈서비스 유한회사(Enterprise Services Korea a DXC Technology Company"):
- HTTP 200, 유효 PNG 1200×630, **65,301 bytes**(정상 카드 ~30KB의 2배).
- 렌더 이미지 육안 확인: 사명 7줄이 상단 "좋소판별기" 로고 + "영등포구 여의도동 · …" 서브타이틀과 **겹치고**, 하단 "위험도 8 / 100" 숫자도 사명 마지막 줄에 **클리핑**됨. 카드가 시각적으로 깨짐.

→ 사명 길이에 따라 `fontSize` 동적 축소(예: `name.length>30?40:64`) 또는 줄 수 제한 + 말줄임(satori는 `display:-webkit-box`/`lineClamp` 지원), 사명 블록에 `flex:1`+`overflow:hidden` 지정 권장. (200은 유지되나 카드 품질이 실제로 깨지므로 심각도 상향.)

### F3. 지역/업종 결측 → 서브타이틀에 orphan 구분점·중복 공백 [낮 / Low]
`opengraph-image.tsx:25`: ``sub = c ? `${c.sigungu} ${c.dong} · ${c.industry_name}` : ""``. `dong`(또는 `sigungu`)이 빈 문자열이면 ` · 업종` 또는 `시군구  · 업종`처럼 **앞에 떠 있는 구분점/이중 공백**이 생긴다. `page.tsx:25`의 `desc`도 동일 패턴.

프로덕션 실측(`uzuylr130820`, 가톨릭대학교성심교정, 동 결측): 렌더 OG에서 서브타이틀이 `· 비주거용 건물 임대업(점포 자기땅)`으로 **선두에 고아 구분점**이 표시됨(레이아웃 자체는 정상). 특수문자(괄호 등)는 satori가 정상 렌더.

→ `[c.sigungu, c.dong].filter(Boolean).join(" ")` 후 업종과 `· `로 join하는 식으로 빈값 제거. `page.tsx` desc도 동일 수정.

### F4. Pretendard OTF 지연로드 후에도 OG 200·유효 PNG 유지 — 양호 [정보 / Info]
`opengraph-image.tsx:12-16`은 모듈 전역 `_font` 캐시 + 최초 1회 `fs.readFileSync(assets/Pretendard-Bold.otf)` 지연로드(`runtime="nodejs"`). 실측상 폰트 로드 실패·한글 미렌더·non-200 없음:
- 6개 회사(히어로/장문/결측/휴폐업/미존재) 전부 **HTTP 200, Content-Type image/png, 유효 PNG 시그니처, 1200×630**.
- 한글·영문·숫자 모두 Pretendard Bold로 정상 렌더(렌더 이미지 확인). `font()`가 단일 Buffer를 재사용하므로 요청마다 디스크 I/O 반복 없음.

다만 폰트가 `weight:700` 1종뿐이라 전 텍스트가 Bold — 디자인 의도라면 무방.

### F5. `og:image`/`twitter:image` 절대경로·alt·캐시 — 대체로 양호 [정보 / Info]
프로덕션 HTML 실측(`qk3r3n124810`):
- `twitter:card = summary_large_image`, `og:type=website` 정상.
- `og:image`·`twitter:image` 모두 **절대 URL**(F1의 자동추론 덕), `og:image:width/height=1200/630`, `og:image:type=image/png` 자동 주입.
- **`og:image:alt`/`twitter:image:alt`** = "좋소판별기 회사 위험도 카드" — `opengraph-image.tsx:10`의 `export const alt`가 정상 반영.
- OG 엔드포인트 응답 헤더: `Cache-Control: public, immutable, no-transform, max-age=31536000` — 1년 캐시. URL 쿼리(`?f80fbb9…`)가 콘텐츠 해시라 데이터 변경 시 cache-busting 됨. 단 데이터는 월 1회 ETL로 바뀌는데 이미지 URL 해시는 빌드 시점 고정 → ISR/재배포 전까지 옛 카드가 1년 캐시될 수 있음(데이터 갱신 주기와 캐시 정합성 유념).
- `title`/`desc`는 `generateMetadata`(`page.tsx:24-31`)에서 회사별로 정상 생성: `삼성전자(주) 위험도 0 (희귀 중소) — 좋소판별기` 등. desc에 직원/연봉/회전율 + 면책 포함 — 양호.

### F6. 홈·explore 등 코너 페이지 기본 OG 전무 [중 / Medium]
`opengraph-image.tsx`는 **`/company/[id]`에만** 존재(Glob 결과 1건). 루트 `app/layout.tsx:22-25` metadata에는 `openGraph`/`twitter` 블록이 **없고** 기본 OG 이미지도 없다. 프로덕션 실측:
- **홈 `/`**: og:/twitter: 메타 태그 **0건**. `<title>좋소판별기 — 개인용 클론</title>` + description만 존재.
- **`/explore`**: og:/twitter: 메타 태그 **0건**.

→ 홈/explore/monthly/awards/memorial/game 등은 소셜 공유 시 제목·설명만 나오고 **카드 이미지·요약 미리보기가 비어** 클릭률 손실. 루트 레이아웃에 기본 `openGraph`(`images:["/opengraph-image"]` 등 정적 기본 카드) + `twitter` 블록 추가, 또는 `app/opengraph-image.tsx`(프로젝트 루트 기본 OG) 신설 권장.

## 구체적 개선안

1. **metadataBase 명시(F1).** `app/layout.tsx`에 `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://jotsopan.vercel.app")` 추가 → 빌드 경고 제거 + 로컬/프리뷰/커스텀 도메인에서도 절대 URL 안정화.
2. **장문 사명 대응(F2).** 사명 `fontSize`를 길이 기반 동적 축소(`name.length>40?40 : name.length>24?52 : 64`) 하고, 사명 블록에 `display:"-webkit-box", WebkitLineClamp:3, overflow:"hidden"`(satori 지원)로 줄 수 제한·말줄임. 사명 컨테이너에 `flex:1, minHeight:0` 부여로 상하 블록 충돌 차단.
3. **결측 서브타이틀 정리(F3).** `opengraph-image.tsx`의 `sub`와 `page.tsx`의 `desc`를 `[c.sigungu, c.dong].filter(Boolean).join(" ")` 기반으로 재구성, 빈 세그먼트·고아 구분점 제거.
4. **코너 페이지 기본 OG(F6).** 루트 `app/layout.tsx` metadata에 `openGraph`/`twitter` 블록 추가 + 프로젝트 루트 `app/opengraph-image.tsx`(브랜드 기본 카드) 신설. 최소한 홈/explore에 `summary_large_image` 보장.
5. **캐시 정합성(F5).** 데이터가 월 1회 갱신되므로 OG URL 해시가 데이터 버전(예: `DATA_YM`)을 반영하도록 하거나 페이지 `revalidate`와 OG 캐시 주기를 맞춰, 1년 immutable 캐시에 옛 카드가 박히지 않게 검토.

## 반성점

- F1을 "치명"이 아닌 "중"으로 둔 근거: 과제 전제(빌드 경고)와 일반 위험(소셜 미표시)은 실재하나, **프로덕션 단건 실측에서는 `og:image`가 절대 URL로 정상 해석**됨을 확인했다(Next의 Vercel URL 자동추론). 추측 대신 실측으로 "현 프로덕션 한정 미발현 / 비-Vercel 환경 발현"으로 경계를 그었다.
- F2는 코드만 보면 "maxWidth로 줄바꿈되니 괜찮다"고 넘길 뻔했으나, 실제 76자 사명 OG를 받아 렌더 이미지를 육안 확인해 상하 충돌·하단 클리핑을 확정했다(65KB로 바이트 수도 비정상). 200 응답 유지와 카드 품질은 별개임을 실측으로 분리.
- 모든 결론을 프로덕션 curl(바이너리 PNG 시그니처·IHDR 치수·응답 헤더 + HTML 메타 태그 전수)로 뒷받침했고, 회사 ID는 실데이터에서 직접 산출(장문/결측/휴폐업/미존재)해 합성 가정 없이 코너 케이스를 커버했다.
