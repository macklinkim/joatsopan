# PROGRESS — 자율 구현 루프 로그

> 작업계획서.md(M1~M9) · DESIGN.md(SSOT) · 8장 화면 기준. 매 회차 [완료/남은 것/결정·가정] 갱신.

## 회차 1 (2026-06-18)

### ✅ 완료한 것
- 프로젝트 스캐폴드: Next.js 15(App Router) + React 19 + TypeScript + Tailwind v3 수동 구성 (create-next-app은 비-빈 디렉터리 충돌 → 수동).
- **DESIGN.md 토큰 → Tailwind 테마**(`tailwind.config.ts`): risk-high/warning/safe, surface-paper/white, primary, outline. 폰트 3종(Hanken Grotesk/Inter/JetBrains Mono) `next/font/google`.
- **데이터 레이어**(`lib/`): 타입, 점수엔진(§9 그대로), 목업 데이터(부록 A 실측값 + 구로동 소프트웨어 클러스터), 결정적 시계열 생성기(14개월, 하이드레이션 안전).
- **점수 재현**: 샤이닝라이언 78(+8/+35/+35/0), 맑은소프트 8, 아나패스 0 — 실측 채취값으로 고정(forceScore). 엠피테크 회전율 170%.
- **API**: `/api/search?q=`(회사명 부분일치·members 내림차순), `/api/nearby?id=`(동 단위·연봉순·5인 이하 제외·휴폐업/본인 제외).
- **화면**: 홈 `/`(검색창+자동완성, 키보드 탐색), 회사 상세 `/company/[id]`(헤더+위험게이지 SVG, 핵심지표 4종 카드, 직원수/연봉/입퇴사 SVG 차트 3종, 주변추천 리스트).
- 검증/고지 문구("추정치·참고용") 양 화면에 배치.

### ✅ 검증 완료 (DoD — 실제 브라우저 확인)
- dev 서버 기동 OK (`npm run dev`, http://localhost:3000, Ready 1.8s).
- 홈 `/` 검색창 렌더 + `/api/search?q=소프트` → 4건(members 내림차순) OK. (`home.png`)
- 상세 `/company/shininglion` → 좋소확정/78 게이지 + 핵심지표 4종(49명+8 / 621만원·중앙값16%+35 / 192%+35 / 정상0) + 차트 3종 = **Page_text_export.txt와 일치**. (`company-shininglion.png`)
- 상세 `/company/malgunsoft` → 주변추천 채워짐: 구로데이터5,600 > 좋은소프트4,800 > 야근소프트3,100 > 엠피테크2,900 (연봉순, **새벽소프트 3인·본인 제외 ✓**). (`company-malgunsoft.png`)
- 콘솔 에러 0 (favicon 404는 `app/icon.svg` 추가로 해결).
- **→ M1~M8 + DoD 충족. 5분 루프 종료(cron a27063fa 취소).**

### ⏳ 남은 것 (DoD 외 후속 — 별도 작업)
- M9: 실제 공공데이터 CSV ETL + Supabase 적재 (현재 인메모리 목업). 데이터 접근 함수가 `lib/data.ts`에 격리돼 있어 Supabase 쿼리로 교체만 하면 됨.
- Vercel 외부 배포.

### 🧭 결정·가정
- **목업 우선 전략**: 공공데이터 CSV/Supabase 외부 의존으로 막히지 않도록, 부록 A 실측값 기반 인메모리 목업으로 전 화면을 먼저 띄운다. 데이터 접근 함수(`searchCompanies/nearbyCompanies/getMonthlyStats`)를 추상화해 두어 후속 회차에서 Supabase로 교체만 하면 됨.
- **위험도**: ETL 사전계산 저장 아키텍처대로, 목업에 risk_score/contrib를 미리 박음. 그 외 회사는 score.ts 엔진으로 계산.
- **주변추천 매칭**: 진짜 좌표 거리 대신 계획서대로 법정동(bdong_code) 동일성 = "주변". 동 결과<3이면 같은 시군구로 폴백.
- **차트**: 외부 차트 라이브러리 없이 SSR SVG 직접 생성(계획서 §3 차트=서버생성 SVG).
- 포트 3000.
