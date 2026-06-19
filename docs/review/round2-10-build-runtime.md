# Round2-10 — 빌드·배포·런타임 견고성 점검

점검일: 2026-06-20 / 대상: jotsopan (Next.js 15.5.19 App Router, Vercel 배포 가정)

## 점검 범위

- (1) `lib/data.ts`의 `fs.readFileSync(path.join(process.cwd(), "data/companies.json"))` 런타임 로드와 `next.config.mjs` `outputFileTracingIncludes` 글롭이 모든 라우트(특히 동적 `/company/[id]`, API)에 JSON을 포함시키는지 — 누락 시 런타임 ENOENT
- (2) 서버 전용 `data.ts`를 클라이언트 컴포넌트가 import하면 `fs` 번들 에러 — import 경로 추적
- (3) 미존재 id → `notFound()` 처리 및 전역 `app/not-found` 부재
- (4) 동적 라우트 캐싱(`dynamic`/`revalidate` 미설정) 영향
- (5) API 에러 응답 형식, 빈 `q`/`id`
- (6) 빌드시 대용량 JSON 로드 메모리(`NODE_OPTIONS`)

근거: `lib/data.ts`, `next.config.mjs`, `package.json`, `app/company/[id]/page.tsx`, `app/api/search/route.ts`, `app/api/nearby/route.ts`, `app/page.tsx`, `app/layout.tsx`, `data/` 디렉터리, `.next/`(디스크 상태), Grep(`"use client"`, `revalidate|dynamic|NODE_OPTIONS`).

## 발견 (심각도 · 근거)

### F1. `outputFileTracingIncludes` 글롭은 적절 — 다만 `.next`가 dev 산출물이라 트레이싱 검증 불가 [중 / Medium]
`next.config.mjs:4-6`은 `"/**": ["./data/companies.json"]`로 **모든 라우트**(동적 `/company/[id]`, `/api/*` 포함)에 JSON을 강제 포함시킨다. 키가 `/company/[id]`가 아니라 `/**`이므로 동적 세그먼트·API 라우트가 모두 매칭되어, "동적 라우트에 JSON 누락"은 발생하지 않는다(설정 자체는 정석). `path.join(process.cwd(), "data/companies.json")`도 Vercel 서버리스 함수의 작업 디렉터리가 프로젝트 루트(`/var/task`)로 잡히고 트레이싱이 `data/`를 상대경로 그대로 보존하므로 유효하다.

단, **디스크의 `.next`는 production build 산출물이 아니다**: `.next/BUILD_ID` 부재, `*.nft.json`(파일 트레이스) 0건, standalone 없음 — `next dev` 흔적이다(`find .next -name "*.nft.json" | wc -l` → 0). 따라서 "JSON이 실제 함수 번들에 포함됐는지"는 **이번 정적 점검 범위에서 디스크로 확정 불가**이며, 확정하려면 `npm run build` 후 `.next/server/app/company/[id]/page.js.nft.json`(또는 `.vercel/output/functions/.../`)에 `data/companies.json` 항목이 있는지 확인해야 한다. 설정 근거상 위험은 낮으나 미검증 상태임을 명시한다.

### F2. 데이터 파일 실제 크기 44MB — 설정 주석(8MB)과 불일치, 콜드스타트/번들 한도 리스크 [중 / Medium]
`next.config.mjs:3` 주석은 "8MB"라고 적었으나 실측 `data/companies.json`은 **약 44MB**(`ls -la` → 45,160,821 bytes)다. 영향:
- Vercel 서버리스 함수 unzipped 번들 한도(기본 250MB)에는 여유가 있으나, JSON 44MB + `node_modules` 트레이싱이 합쳐지면 한도 압박 가능. JSON이 `/api/*`를 포함한 **모든** 함수에 복제되어 들어간다는 점도 비용/사이즈 요인.
- `lib/data.ts:18-19`의 `JSON.parse(fs.readFileSync(...))`가 **모듈 로드 시 동기 실행** → 콜드스타트마다 44MB 파싱. 인메모리 컬럼셋 + 인터닝으로 절약하지만 파싱 자체 지연·메모리 스파이크는 함수 메모리 설정(기본 1024MB)에서 관리 필요.

### F3. 클라이언트 컴포넌트의 `data.ts` import 없음 — 양호 [정보 / Info]
`from "@/lib/data"` import 8건 전수 추적 결과 모두 **서버 모듈**이다: `app/page.tsx`, `app/api/search/route.ts`, `app/api/nearby/route.ts`, `app/monthly/page.tsx`, `app/game/page.tsx`, `app/memorial/page.tsx`, `app/awards/page.tsx`, `app/company/[id]/page.tsx`. `"use client"` 파일(`SearchBox`, `NavBar`, `GuessGame`, `LineChart`, `HireLeaveChart`, `RiskGauge`(목록), `useChartWidth`) 중 `data.ts`를 import하는 것은 없다. 따라서 `node:fs`가 클라이언트 번들로 새어 들어가는 빌드 에러 위험은 현재 **없다**. 단 `lib/data.ts`에 `import "server-only"` 가드가 없어, 향후 누군가 클라이언트 컴포넌트에서 실수로 import하면 빌드가 깨진다 — 가드 추가 권장.

### F4. `app/not-found.tsx`/`error.tsx`/`global-error.tsx` 부재 — Next 기본 폴백에 의존 [중 / Medium]
`/company/[id]`는 미존재 id에 대해 `getCompany(id)` → `undefined` → `notFound()`(`app/company/[id]/page.tsx:24-25`)로 안전하게 404를 던진다. 그러나 커스텀 `app/not-found.tsx`가 **없어**(Glob 0건) Next.js 기본 404 화면이 뜬다 — `NavBar`/폰트/디자인이 적용된 레이아웃 대신 밋밋한 기본 페이지라 UX 단절. 또한 `error.tsx`/`global-error.tsx`도 없어, 런타임 예외(예: 손상된 JSON, ID 빌드 중 throw) 발생 시 production에서 기본 에러 화면 + 메시지 숨김으로 처리된다. 견고성보다 UX·디버깅 관측성 손실이 핵심.

### F5. 동적 라우트·코너 페이지 캐싱 정책 전무 [중 / Medium]
`export const revalidate`/`dynamic`/`dynamicParams`/`fetchCache`가 **어느 page/route에도 없다**(Grep: 코드 매치 0, 문서만 매치). `generateStaticParams`는 `HERO_IDS`(8개)만 정적 생성(`app/company/[id]/page.tsx:14-16`)하고 나머지는 `dynamicParams` 기본값(`true`)으로 on-demand 렌더된다. 데이터가 결정적(PRNG 시드, 월 1회 ETL)이라 ISR 궁합이 매우 좋은데 미활용 — 히어로 외 회사 상세 및 `/monthly`·`/memorial`·`/awards`·`/game`이 캐시 적립 보장 없이 매 요청 풀스캔/`companyAt` 생성을 반복할 여지가 있다. 현재 인메모리라 영향은 제한적이나, 향후 DB 전환 시 즉시 비용 위험으로 격상.

### F6. API 빈 입력 처리 양호, 단 에러 핸들링·길이 제한 부재 [중 / Medium]
- 빈 `q`: `searchCompanies`가 `q.trim().toLowerCase()` 후 `if (!norm) return []`(`lib/data.ts:133-134`) → `{ results: [] }` 200 응답. 정상.
- 빈/미존재 `id`: `nearbyCompanies`가 `ID_MAP.get(id) === undefined` 시 `{ scope: "all", items: [] }`(`lib/data.ts:153-154`) → `{ scope, results: [] }`. 정상.
- 그러나 두 핸들러(`app/api/search/route.ts:5-15`, `app/api/nearby/route.ts:5-17`) 모두 **try/catch 없음**. `data.ts` 모듈 로드가 실패(ENOENT·파싱 에러)하면 핸들러가 그대로 500 + 스택을 던지며, 표준화된 에러 JSON 형식이 없다. 또한 `q` 길이 무제한 → 매 요청 활성 전수(NA) 스캔(`lib/data.ts:138-143`)으로 DoS 표면. `q.slice(0, 50)` 등 상한·`Cache-Control` 헤더 권장.

### F7. 빌드/런타임 메모리 옵션(`NODE_OPTIONS`) 미설정 [낮 / Low]
`package.json:7`의 빌드 스크립트는 순수 `next build`로 `NODE_OPTIONS`/`--max-old-space-size`가 **없다**(`--max-old-space-size`는 `scripts/etl.mjs`에만 존재). 빌드는 데이터를 파싱하지 않고(페이지가 정적 생성하는 건 히어로 8개뿐), 44MB 파싱은 ETL과 런타임 모듈 로드에서 일어나므로 빌드 OOM 위험은 낮다. Vercel 빌드 컨테이너는 충분한 힙을 주지만, 런타임 함수 메모리는 콜드스타트 44MB 파싱을 견디도록 1024MB 이상 유지 권장.

## 구체적 개선안

1. **트레이싱 검증(F1).** `npm run build` 후 `.next/server/app/company/[id]/page.js.nft.json`(및 `/api/*`)에 `../../../data/companies.json`이 포함되는지 확인. 없으면 글롭을 보강하거나 `process.cwd()` 대신 `path.join(import.meta.dirname, ...)` 검토.
2. **번들 사이즈 절감(F2).** JSON이 모든 함수에 복제되므로, 데이터 접근을 단일 라우트 그룹/route handler로 모으거나 외부 스토리지(KV/Blob/DB) 이전 검토. 최소한 주석의 "8MB"를 실제 44MB로 정정.
3. **server-only 가드(F3).** `lib/data.ts` 상단에 `import "server-only";` 추가 — 클라이언트 오용 시 빌드 단계에서 즉시 실패하도록.
4. **커스텀 폴백(F4).** `app/not-found.tsx`, `app/error.tsx`(또는 `global-error.tsx`)를 레이아웃·디자인 일관되게 추가. 회사 상세 404에 "검색으로 돌아가기" 링크.
5. **ISR 캐싱(F5).** 데이터가 결정적이므로 `/company/[id]`·코너 페이지에 `export const revalidate = 3600`(또는 ETL 주기) + `dynamicParams = true` 명시. on-demand 렌더 결과 캐시로 풀스캔 반복 제거.
6. **API 견고화(F6).** 두 핸들러에 try/catch + 표준 에러 JSON(`{ error }`, 적절 status), `q` 길이 상한, `Cache-Control: s-maxage` 헤더 추가.
7. **런타임 메모리(F7).** Vercel 함수 메모리를 1024MB 이상으로 유지(콜드스타트 44MB 파싱 대비). 빌드 OOM이 보이면 그때 `NODE_OPTIONS=--max-old-space-size` 추가.

## 반성점

- F1을 "발견"이 아니라 "설정상 정상이나 디스크로 미검증"으로 강등했다. 디스크의 `.next`가 `next dev` 산출물(BUILD_ID·nft.json 부재)이라 트레이싱 결과를 단정할 수 없었고, `npm run build`를 이번 범위(정적 점검)에서 실행하지 않아 추측 경계를 넘지 않았다.
- 설정 주석의 "8MB"와 실측 44MB 불일치(F2), 그리고 `pass-08`이 기록한 "빈 `next.config`"·구버전 `lib/data.ts`(SEEDS 방식)와 현재 ETL 기반 코드의 차이로 보아, 리포가 점검 사이에 상당히 진화했다 — 주석/문서를 코드 실측으로 재검증한 것이 핵심이었다.
- `process.cwd()`가 Vercel에서 유효한지는 일반적으로 참이나 함수 번들링·트레이싱 동작에 의존하므로, 코드만으로 100% 단정하지 않고 실배포 응답/트레이스 확인을 개선안으로 남겼다.
