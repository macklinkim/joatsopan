# PROGRESS — 자율 구현 루프 로그

> 좋소판별기 클론. 10분 cron 루프(f580fbfc)로 계속 구축. 매 회차 [완료/남은 것/다음] 갱신.
> 참조: jotso.net (전국 국민연금 사업장 전체). 점검·로드맵: docs/review/SUMMARY.md.

## 현재 상태 (2026-06-19, 실데이터 적재 회차)

### ✅ 완료
- **실데이터 라이브**: 국민연금 '가입 사업장 내역' CSV(EUC-KR, 115MB, 593k행) → `scripts/etl.mjs`로
  점수계산·업종중앙값·지역파싱 → `data/companies.json`(8MB, 활성 5만 + 휴폐업 150).
  전국 활성 **552,878곳** 중 층화표본 5만(대형30% + 전규모 균등표본).
- **데이터레이어 교체**(`lib/data.ts`): 합성생성기 제거. 실데이터 런타임 fs 로드, 점수·기여도 엔진 재계산,
  시계열 지연생성+캐시, 검색=회사명+사업자번호.
- 코너 페이지(이달의 좋소/별이 된 좋소/시상식/게임) 실데이터 연동, 전역 네비.
- 홈: 기준월·전국 사업장수 노출.
- **프로덕션 배포 + 검증**: https://jotsopan.vercel.app (실검색 동작, HTTP 200 공개).
- 빌드: 회사상세 히어로 8 SSG + 나머지 동적. `outputFileTracingIncludes`로 JSON 번들 포함. `.vercelignore`로 raw CSV 제외.

### ✅ 추가 완료 (전량 적재 회차)
- **전국 활성 552,878곳 전수 적재** — 컬럼형+인터닝(44MB), `lib/data.ts` 지연객체 방식(질의 결과만 Company화)으로 메모리 안전. 프로덕션 검증(카카오 검색 OK, /monthly 0.8s). "모든 데이터" 목표 달성.

### ✅ 추가 완료 (10회 교차검증 round2 + 수정 회차)
- docs/review/round2-01~10 (10관점 교차검증, 실측 기반).
- 수정·배포: ETL 주소파싱(통합시/세종, 동오류 19.9% 수정·전수재생성), 노랑 텍스트 대비(riskTextColor 앰버),
  검색 동명구분(지역 노출)+입력제한, 단정코멘트→추정톤+고지문 인접(법적), HERO_IDS/nameLc 지연화(콜드스타트),
  시계열 turnover 정합, SearchBox abort/res.ok, NavBar 모바일, vitest 점수테스트 12종(통과).

### ✅ 추가 완료 (기능+접근성 회차)
- **지역 위험도 순위**(원본 초과): 시군구 내 N위/M곳 + 정성 라벨, 회사 상세에 표시.
- **검색 ARIA combobox**(role/aria-expanded/controls/activedescendant·listbox/option·Escape), sr-only 유틸 추가.

### ⏳ 남은 것 (다음 회차)
1. **접근성 잔여**: 차트 키보드 접근(tabIndex+화살표 or sr-only 데이터테이블 + aria). (검색 combobox는 완료)
2. **점수 로직 SSOT**(round2-08): score.ts ↔ scripts/etl.mjs 복붙 → lib/score.core.mjs 분리 양쪽 import.
3. **참조 초과 기능**(round2-09): 회사상세 "그때 vs 지금" 서사, 추천 2분화+배수, 위험도 사다리, **지역 순위(OO구 N위/상위%)**, **공유 OG카드(app/og)**.
4. 차별화: 필터검색(지역·업종·점수), 업종 비교, 연봉 백분위, 비교/즐겨찾기 → 전제로 사전 인덱스(시군구/업종/점수 버킷).
5. 성능/배포: ISR(revalidate) 미적용, 보안헤더 전무(next.config), /api 레이트리밋, eslint/prettier 미설치, 44MB 번들 경량화(바이너리/Int32Array).
6. **다개월 실시계열** — 추가 월 CSV 적재(현재 1개월 스냅샷+합성).
7. id 중복(round2-04): 동일 name+bizNo+bdong 중복행 → ETL 중복제거.

### 🧭 결정·가정
- 5만 표본은 인메모리/깃/번들 안전선(8MB JSON). 전량은 DB 필요 → Supabase가 정석(키 확보 시).
- 점수: forceScore 폐기, 전 회사 score.ts 엔진 산출. 업종중앙값은 전국 활성 전체에서 계산.
- id: name+bizNo+법정동 해시(stable). 사업자번호는 공공데이터가 6자리로 마스킹.
- raw CSV(`data/raw/`)는 깃·배포 제외. 재생성: data.go.kr 15083277 다운로드 → `node scripts/etl.mjs 50000`.
