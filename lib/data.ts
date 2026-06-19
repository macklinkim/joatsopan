import type { Company, MonthlyStat, RiskLabel } from "./types";
import { riskScore, riskLabel, turnover as calcTurnover } from "./score";

// 결정적 시드 PRNG (SSR/CSR 하이드레이션 일치 보장 — Math.random 미사용)
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAST_YM = "2026-04";

// 월 목록 (최근 N개월, 오름차순)
function recentMonths(n: number): string[] {
  const [y, m] = LAST_YM.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

interface Seed {
  id: string;
  name: string;
  bizNo6: string;
  industryCode: string;
  industry: string;
  sigungu: string;
  bdong: string;
  dong: string;
  addr: string;
  members: number;
  salary: number; // 추정 평균연봉(만원)
  turnover: number; // 회전율 %
  median: number; // 업종 중앙값(만원)
  isClosed?: boolean;
  comment: string;
  forceScore?: number; // 실측 채취값으로 고정 (역공학 재현)
  forceContrib?: { members: number; salary: number; turnover: number; closed: number };
}

// 부록 A 실측 + 주변추천/검색 시연용 클러스터(구로구 구로동)
const SEEDS: Seed[] = [
  {
    id: "shininglion",
    name: "주식회사 샤이닝라이언",
    bizNo6: "304880",
    industryCode: "J5914",
    industry: "미디어콘텐츠창작업",
    sigungu: "종로구",
    bdong: "1111017700",
    dong: "종로3가",
    addr: "서울특별시 종로구 종로3길",
    members: 49,
    salary: 621,
    turnover: 192,
    median: 3881,
    comment: "도망치세요. 이건 훈련 상황이 아닙니다.",
    forceScore: 78,
    forceContrib: { members: 8, salary: 35, turnover: 35, closed: 0 },
  },
  {
    id: "malgunsoft",
    name: "맑은소프트",
    bizNo6: "119863",
    industryCode: "J5821",
    industry: "응용 소프트웨어 개발 및 공급업",
    sigungu: "구로구",
    bdong: "1153010600",
    dong: "구로동",
    addr: "서울특별시 구로구 디지털로",
    members: 62,
    salary: 4200,
    turnover: 14,
    median: 4100,
    comment: "사람이 안 나가는 회사네요. 흔치 않습니다.",
    forceScore: 8,
    forceContrib: { members: 8, salary: 0, turnover: 0, closed: 0 },
  },
  {
    id: "anapass",
    name: "주식회사 아나패스",
    bizNo6: "220117",
    industryCode: "C2611",
    industry: "반도체 제조업",
    sigungu: "강남구",
    bdong: "1168010300",
    dong: "역삼동",
    addr: "서울특별시 강남구 테헤란로",
    members: 131,
    salary: 6800,
    turnover: 6,
    median: 5200,
    comment: "여기는 좋소가 아닙니다. 안심하세요.",
    forceScore: 0,
    forceContrib: { members: 0, salary: 0, turnover: 0, closed: 0 },
  },
  {
    id: "mptech",
    name: "엠피테크",
    bizNo6: "451220",
    industryCode: "C2620",
    industry: "전자부품 제조업",
    sigungu: "구로구",
    bdong: "1153010600",
    dong: "구로동",
    addr: "서울특별시 구로구 경인로",
    members: 10,
    salary: 2900,
    turnover: 170,
    median: 4000,
    comment: "회전문이 바쁩니다. 들어가기 전에 다시 생각하세요.",
  },
  {
    id: "goodsoft",
    name: "좋은소프트",
    bizNo6: "337701",
    industryCode: "J5821",
    industry: "응용 소프트웨어 개발 및 공급업",
    sigungu: "구로구",
    bdong: "1153010600",
    dong: "구로동",
    addr: "서울특별시 구로구 디지털로26길",
    members: 45,
    salary: 4800,
    turnover: 22,
    median: 4100,
    comment: "평범합니다. 나쁘지 않아요.",
  },
  {
    id: "dawnsoft",
    name: "새벽소프트",
    bizNo6: "990011",
    industryCode: "J5821",
    industry: "응용 소프트웨어 개발 및 공급업",
    sigungu: "구로구",
    bdong: "1153010600",
    dong: "구로동",
    addr: "서울특별시 구로구 디지털로32길",
    members: 3, // 5인 이하 → 주변추천 제외 대상
    salary: 5200,
    turnover: 40,
    median: 4100,
    comment: "사람이 거의 없습니다. 추가 채용은 글쎄요.",
  },
  {
    id: "gurodata",
    name: "구로데이터",
    bizNo6: "771188",
    industryCode: "J6201",
    industry: "컴퓨터 프로그래밍 서비스업",
    sigungu: "구로구",
    bdong: "1153010600",
    dong: "구로동",
    addr: "서울특별시 구로구 디지털로",
    members: 120,
    salary: 5600,
    turnover: 9,
    median: 4100,
    comment: "여기는 좋소가 아닙니다. 안심하세요.",
  },
  {
    id: "overtimesoft",
    name: "야근소프트",
    bizNo6: "552040",
    industryCode: "J5821",
    industry: "응용 소프트웨어 개발 및 공급업",
    sigungu: "구로구",
    bdong: "1153010600",
    dong: "구로동",
    addr: "서울특별시 구로구 디지털로30길",
    members: 22,
    salary: 3100,
    turnover: 120,
    median: 4100,
    comment: "도망치세요. 야근의 향기가 납니다.",
  },
];

function buildCompany(s: Seed): Company {
  let score: number;
  let contrib: Company["contrib"];
  if (s.forceScore !== undefined && s.forceContrib) {
    score = s.forceScore;
    contrib = s.forceContrib;
  } else {
    const r = riskScore(
      { members: s.members, est_salary: s.salary, turnover: s.turnover, is_closed: !!s.isClosed },
      s.median
    );
    score = r.score;
    contrib = r.contrib;
  }
  return {
    id: s.id,
    biz_name: s.name,
    biz_no6: s.bizNo6,
    industry_code: s.industryCode,
    industry_name: s.industry,
    sido: "서울특별시",
    sigungu: s.sigungu,
    bdong_code: s.bdong,
    dong: s.dong,
    addr: s.addr,
    cur_members: s.members,
    cur_salary: s.salary,
    cur_turnover: s.turnover,
    risk_score: score,
    risk_label: riskLabel(score) as RiskLabel,
    is_closed: !!s.isClosed,
    last_ym: LAST_YM,
    contrib,
    comment: s.comment,
    industry_median: s.median,
  };
}

export const COMPANIES: Company[] = SEEDS.map(buildCompany);

const COMPANY_BY_ID = new Map(COMPANIES.map((c) => [c.id, c]));
export function getCompany(id: string): Company | undefined {
  return COMPANY_BY_ID.get(id);
}

// 월별 시계열 생성 (결정적). 최근값이 cur_* 에 수렴.
const MONTHS = recentMonths(14);
const STATS_BY_ID = new Map<string, MonthlyStat[]>();

for (const c of COMPANIES) {
  const rnd = mulberry32(
    c.id.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) + c.cur_members
  );
  const series: MonthlyStat[] = [];
  const n = MONTHS.length;
  MONTHS.forEach((ym, i) => {
    const progress = i / (n - 1); // 0..1
    // 직원수: 과거엔 약간 적게 출발 → 현재값 수렴 + 소폭 노이즈
    const base = Math.round(c.cur_members * (0.78 + 0.22 * progress));
    const members = Math.max(1, base + Math.round((rnd() - 0.5) * Math.max(2, c.cur_members * 0.08)));
    // 회전율 기반 입/퇴사 (최근달은 cur_turnover에 근접)
    const tFactor = 0.6 + 0.4 * progress;
    const monthlyTurnover = c.cur_turnover * tFactor;
    const churn = (monthlyTurnover / 100) * members; // 입+퇴 합
    const hires = Math.max(0, Math.round(churn * (0.45 + rnd() * 0.1)));
    const leaves = Math.max(0, Math.round(churn - hires));
    const est_salary = Math.round(c.cur_salary * (0.9 + 0.1 * progress));
    const notice_amt = Math.round((est_salary / 12) * 10000 * 0.09 * members);
    series.push({
      company_id: c.id,
      ym,
      members,
      hires,
      leaves,
      notice_amt,
      est_salary,
      turnover: calcTurnover(hires, leaves, members),
    });
  });
  // 최근달을 실측/요약값으로 보정
  const last = series[series.length - 1];
  last.members = c.cur_members;
  last.est_salary = c.cur_salary;
  if (c.id === "shininglion") {
    last.hires = 47;
    last.leaves = 47;
  } else if (c.id === "mptech") {
    last.hires = 9;
    last.leaves = 8;
  }
  last.turnover = calcTurnover(last.hires, last.leaves, last.members);
  STATS_BY_ID.set(c.id, series);
}

export function getMonthlyStats(id: string): MonthlyStat[] {
  return STATS_BY_ID.get(id) ?? [];
}

// 회사명 부분일치 검색 (members 내림차순, 상위 limit)
export function searchCompanies(q: string, limit = 10): Company[] {
  const norm = q.trim().toLowerCase();
  if (!norm) return [];
  return COMPANIES.filter((c) => c.biz_name.toLowerCase().includes(norm))
    .sort((a, b) => b.cur_members - a.cur_members)
    .slice(0, limit);
}

export type NearbyScope = "dong" | "sigungu" | "industry" | "all";
export interface NearbyResultSet {
  scope: NearbyScope;
  items: Company[];
}

// 주변 회사 추천: 같은 법정동(bdong) → 같은 시군구 → 같은 업종 → 전체 순으로
// 첫 번째로 비지 않은 단계를 채택(추천이 빈손이 되지 않도록).
// 5인 이하 제외, 휴폐업 제외, 본인 제외. 연봉 내림차순.
export function nearbyCompanies(id: string, limit = 10): NearbyResultSet {
  const me = getCompany(id);
  if (!me) return { scope: "all", items: [] };
  const elig = (c: Company) => c.id !== me.id && c.cur_members > 5 && !c.is_closed;

  const tiers: { scope: NearbyScope; pool: Company[] }[] = [
    { scope: "dong", pool: COMPANIES.filter((c) => c.bdong_code === me.bdong_code && elig(c)) },
    { scope: "sigungu", pool: COMPANIES.filter((c) => c.sigungu === me.sigungu && elig(c)) },
    { scope: "industry", pool: COMPANIES.filter((c) => c.industry_code === me.industry_code && elig(c)) },
    { scope: "all", pool: COMPANIES.filter(elig) },
  ];

  for (const t of tiers) {
    if (t.pool.length) {
      const items = t.pool.slice().sort((a, b) => b.cur_salary - a.cur_salary).slice(0, limit);
      return { scope: t.scope, items };
    }
  }
  return { scope: "all", items: [] };
}
