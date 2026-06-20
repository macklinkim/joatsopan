# Round4-08 — OG·메타데이터·SEO 재점검

> 점검일 2026-06-20 · 관점: OG 이미지·페이지 메타데이터·sitemap·robots·twitter card 프로덕션 실측
> 근거: 프로덕션 curl(https://jotsopan.vercel.app) + OG 이미지 다운로드/육안 검증 + 코드(`app/layout.tsx`, `app/company/[id]/opengraph-image.tsx`, `app/company/[id]/page.tsx`, `app/robots.ts`, `app/sitemap.ts`, 코너 페이지 `metadata`)
> 실측 대상 회사 ID: `10ttfcf302811`(장문·특수문자), `10z3jg6580820`(결측 업종), 가상 ID(결측 회사)

---

## 결론 먼저

OG·메타·SEO 파이프라인은 **프로덕션에서 정상 동작**한다. 회사 OG 이미지는 장문/특수문자/결측 모두 깨지지 않고 렌더되고(클램프·폴백 동작 확인), `metadataBase` 덕에 og:image가 절대 URL로 출력되며, sitemap은 색인 대상만(회사 상세 제외) 담고 robots와 정합한다. twitter card도 회사=`summary_large_image`, 나머지=`summary`로 일관. **P0 없음.** 잔여는 (1) sitemap에 `/about` 누락(robots는 허용) 정합 불일치, (2) 코너 페이지·홈에 og:image 부재(텍스트 OG만), (3) 결측 회사 OG가 200 반환(404 회사 페이지와 상태코드 불일치) — 모두 P2 수준.

---

## 점검 항목별 실측

### (1) OG 이미지 — 클램프·결측 처리 ✅

| 케이스 | 회사 | HTTP/타입/크기 | 결과 |
|---|---|---|---|
| 장문+특수문자 | `10ttfcf302811` "덕명건설(주)/일용/대정요양원 신축 건축공사 중 철근콘크리트공사" | 200 image/png 44KB | ✅ 31자+"…" 클램프, `(주)`·`/` 정상, 3행 래핑, 오버플로 없음 |
| 결측 업종 | `10z3jg6580820` (업종=`BIZ_NO미존재사업장`) | 200 image/png 41KB | ✅ 카드 자체는 정상 렌더(데이터 placeholder는 그대로 노출) |
| 결측 회사 | 가상 ID | 200 image/png 21KB | ✅ "회사를 찾을 수 없음" + 위험도 0/100 + 라벨 "—" 폴백(`opengraph-image.tsx:21~26`) |

- 클램프 로직 `rawName.length > 32 ? slice(0,31)+"…"`(`opengraph-image.tsx:22`)이 32자 초과 사명에서 정확히 동작 — 장문 카드가 `maxWidth:760` 안에서 3행으로 접히며 잘림표시 노출.
- 결측 시 `sub`(지역·업종)이 빈 문자열로 처리되어 빈 줄만 남고 레이아웃 붕괴 없음(`opengraph-image.tsx:26`).
- Pretendard-Bold.otf 폰트 임베드로 한글 자형 정상(육안 확인).

### (2) metadataBase → og:image 절대 URL ✅

회사 페이지 head 실측:
```
og:image  = https://jotsopan.vercel.app/company/10ttfcf302811/opengraph-image?6174c1e029ee251d
og:image:width=1200 height=630 type=image/png alt="좋소판별기 회사 위험도 카드"
```
- `layout.tsx:24` `metadataBase: new URL("https://jotsopan.vercel.app")` 덕에 상대→절대 변환 정상. 카카오/슬랙 등 절대 URL 요구 크롤러 호환.

### (3) sitemap ↔ robots 정합 ⚠️(경미)

- **robots.txt**(실측): `Allow: /` · `Disallow: /company/` · `Disallow: /api/` · Sitemap 링크 정상(`robots.ts:8~10`).
- **sitemap.xml**(실측): `""`(홈, priority 1) + `/explore /monthly /memorial /awards /game`(0.7) 6개. **회사 상세(`/company/`)는 의도적으로 제외** → 실명 사업장 색인 회피 목적과 정합(`sitemap.ts:6`, `robots.ts:3` 주석).
- ⚠️ **불일치**: `/about` 페이지는 robots상 색인 허용이나 sitemap에 누락(grep `about`=0건). 색인 대상이라면 sitemap에 추가 권장(P2).

### (4) 코너 페이지 메타/OG ✅(OG 이미지는 텍스트만)

| 경로 | title 실측 | twitter:card | og:image |
|---|---|---|---|
| /about | 이용 안내 · 데이터 출처 — 좋소판별기 | summary | 없음 |
| /explore | 기업 탐색 — 좋소판별기 | summary | 없음 |
| /monthly | 이달의 좋소 — 좋소판별기 | summary | 없음 |
| /memorial | 별이 된 좋소 — 좋소판별기 | summary | 없음 |
| /awards | 좋소 시상식 — 좋소판별기 | summary | 없음 |
| /game | 좋소 게임 — 좋소판별기 | summary | 없음 |

- 각 코너 페이지는 고유 `title`을 가지며 루트 layout의 OG description·twitter card를 상속(`*/page.tsx` `export const metadata`).
- 홈도 og:image 없음 — 공유 시 텍스트 카드만 노출. 코너/홈 공유 시 이미지가 없는 건 의도라면 무방하나, 브랜드 정적 OG(예: `app/opengraph-image.png`) 1장 추가 시 공유 비주얼 개선(P2).

### (5) twitter card ✅

- 회사 페이지: `twitter:card=summary_large_image` + twitter:image 절대 URL(`page.tsx:31`) → 큰 카드 미리보기 정상.
- 홈/코너: `summary`(layout 상속). 이미지 없는 페이지에 large 카드를 강제하지 않아 적절.

---

## 발견 사항 정리

| 우선순위 | 항목 | 근거 |
|---|---|---|
| ✅ | OG 클램프(장문·특수문자)·결측 폴백 정상 | OG 이미지 3종 다운로드·육안 |
| ✅ | metadataBase로 og:image/twitter:image 절대 URL | 회사 페이지 head curl |
| ✅ | sitemap 색인 대상만(회사상세 제외), robots와 정합 | sitemap.xml/robots.txt curl |
| ✅ | 코너 페이지 고유 title, twitter card 일관 | 6개 코너 curl |
| ⚠️ P2 | `/about` robots 허용이나 sitemap 누락 | sitemap grep 0건 |
| ⚠️ P2 | 홈·코너 og:image 부재(텍스트 OG만) | head에 og:image 없음 |
| ⚠️ P2 | 결측 회사 OG가 200(페이지는 404) — 상태 불일치 | 가상 ID OG=200, 페이지=404 |
| ℹ️ | 결측 업종이 `BIZ_NO미존재사업장` placeholder로 OG 노출 | `10z3jg6580820` 카드(데이터 품질 이슈, OG 책임 아님) |
