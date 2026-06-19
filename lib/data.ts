import fs from "node:fs";
import path from "node:path";
import type { Company, MonthlyStat, RiskLabel } from "./types";
import { riskScore, riskLabel, turnover as calcTurnover } from "./score";

// ── 실데이터 로드 (국민연금 가입 사업장 내역, scripts/etl.mjs 산출) ──────
interface Cols {
  id: string[]; bizNo: string[]; name: string[]; sido: string[]; sigungu: string[];
  dong: string[]; bdong: string[]; indCode: string[]; indName: string[];
  members: number[]; salary: number[]; turnover: number[]; score: number[];
}
interface Dataset {
  ym: string; count: number; totalActive: number;
  indMedian: Record<string, number>; allMedian: number; cols: Cols; closed: Cols;
}

const raw: Dataset = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data/companies.json"), "utf8")
);

export const DATA_YM = raw.ym;
export const TOTAL_ACTIVE = raw.totalActive; // 전국 활성 사업장 수(원본)

function commentForScore(score: number, closed: boolean): string {
  if (closed) return "휴·폐업 신호가 보입니다. 입사 전 꼭 확인하세요.";
  if (score >= 70) return "도망치세요. 신호가 강하게 옵니다.";
  if (score >= 50) return "꽤 위험합니다. 신중히 보세요.";
  if (score >= 30) return "평범한 편입니다. 그래도 확인은 하세요.";
  if (score >= 10) return "나쁘지 않아 보입니다.";
  return "여기는 좋소가 아닙니다. 안심하세요.";
}

function buildList(cols: Cols, closed: boolean): Company[] {
  const out: Company[] = [];
  for (let i = 0; i < cols.id.length; i++) {
    const median = raw.indMedian[cols.indCode[i]] || raw.allMedian;
    const members = cols.members[i];
    const salary = cols.salary[i];
    const turnover = cols.turnover[i];
    // 점수·기여도를 엔진으로 재계산(JSON의 score와 동일 공식 → 일관성, contrib 확보)
    const { score, contrib } = riskScore(
      { members, est_salary: salary, turnover, is_closed: closed },
      median
    );
    out.push({
      id: cols.id[i],
      biz_name: cols.name[i],
      biz_no6: cols.bizNo[i],
      industry_code: cols.indCode[i],
      industry_name: cols.indName[i],
      sido: cols.sido[i],
      sigungu: cols.sigungu[i],
      bdong_code: cols.bdong[i],
      dong: cols.dong[i],
      addr: [cols.sido[i], cols.sigungu[i], cols.dong[i]].filter(Boolean).join(" "),
      cur_members: members,
      cur_salary: salary,
      cur_turnover: turnover,
      risk_score: score,
      risk_label: riskLabel(score) as RiskLabel,
      is_closed: closed,
      last_ym: raw.ym,
      contrib,
      comment: commentForScore(score, closed),
      industry_median: median,
    });
  }
  return out;
}

const ACTIVE = buildList(raw.cols, false);
const CLOSED = buildList(raw.closed, true);
export const COMPANIES: Company[] = [...ACTIVE, ...CLOSED];

const COMPANY_BY_ID = new Map(COMPANIES.map((c) => [c.id, c]));
export function getCompany(id: string): Company | undefined {
  return COMPANY_BY_ID.get(id);
}

// 히어로(예시) — 검색 결과 없을 때 안내용 대형사 몇 곳
export const HERO_IDS = ACTIVE.slice(0, 8).map((c) => c.id);

// ── 월별 시계열(지연 생성·캐시) ─────────────────────────────────
// 현재 1개월분 스냅샷만 보유 → 현재값에 수렴하는 결정적 14개월 시계열을 생성.
// (다개월 실데이터 적재 시 이 함수만 교체하면 됨)
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function recentMonths(n: number, lastYm: string): string[] {
  const [y, m] = lastYm.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
const MONTHS = recentMonths(14, raw.ym);
const STATS_CACHE = new Map<string, MonthlyStat[]>();

export function getMonthlyStats(id: string): MonthlyStat[] {
  const cached = STATS_CACHE.get(id);
  if (cached) return cached;
  const c = getCompany(id);
  if (!c) return [];
  const rnd = mulberry32(
    c.id.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) + c.cur_members
  );
  const series: MonthlyStat[] = [];
  const n = MONTHS.length;
  MONTHS.forEach((ym, i) => {
    const progress = i / (n - 1);
    const base = Math.round(c.cur_members * (0.78 + 0.22 * progress));
    const members = Math.max(1, base + Math.round((rnd() - 0.5) * Math.max(2, c.cur_members * 0.08)));
    const tFactor = 0.6 + 0.4 * progress;
    const monthlyTurnover = c.cur_turnover * tFactor;
    const churn = (monthlyTurnover / 100) * members;
    const hires = Math.max(0, Math.round(churn * (0.45 + rnd() * 0.1)));
    const leaves = Math.max(0, Math.round(churn - hires));
    const est_salary = Math.round(c.cur_salary * (0.9 + 0.1 * progress));
    series.push({
      company_id: c.id, ym, members, hires, leaves,
      notice_amt: Math.round((est_salary / 12) * 10000 * 0.09 * members),
      est_salary, turnover: calcTurnover(hires, leaves, members),
    });
  });
  const last = series[series.length - 1];
  last.members = c.cur_members;
  last.est_salary = c.cur_salary;
  STATS_CACHE.set(id, series);
  return series;
}

// ── 검색: 회사명 또는 사업자번호 부분일치, 가입자수 내림차순 ──────────
export function searchCompanies(q: string, limit = 10): Company[] {
  const norm = q.trim().toLowerCase();
  if (!norm) return [];
  const digits = norm.replace(/\D/g, "");
  const res: Company[] = [];
  for (const c of ACTIVE) {
    if (
      c.biz_name.toLowerCase().includes(norm) ||
      (digits.length >= 3 && c.biz_no6.includes(digits))
    ) {
      res.push(c);
      if (res.length > 400) break; // 후보 상한(정렬 비용 방지)
    }
  }
  return res.sort((a, b) => b.cur_members - a.cur_members).slice(0, limit);
}

// ── 주변 회사: 같은 법정동 → 시군구 → 업종 → 전체 ───────────────
export type NearbyScope = "dong" | "sigungu" | "industry" | "all";
export interface NearbyResultSet { scope: NearbyScope; items: Company[]; }

export function nearbyCompanies(id: string, limit = 10): NearbyResultSet {
  const me = getCompany(id);
  if (!me) return { scope: "all", items: [] };
  const elig = (c: Company) => c.id !== me.id && c.cur_members > 5 && !c.is_closed;
  const tiers: { scope: NearbyScope; pool: Company[] }[] = [
    { scope: "dong", pool: ACTIVE.filter((c) => c.bdong_code === me.bdong_code && elig(c)) },
    { scope: "sigungu", pool: ACTIVE.filter((c) => c.sido === me.sido && c.sigungu === me.sigungu && elig(c)) },
    { scope: "industry", pool: ACTIVE.filter((c) => c.industry_code === me.industry_code && elig(c)) },
    { scope: "all", pool: ACTIVE.filter(elig) },
  ];
  for (const t of tiers) {
    if (t.pool.length) {
      return { scope: t.scope, items: t.pool.sort((a, b) => b.cur_salary - a.cur_salary).slice(0, limit) };
    }
  }
  return { scope: "all", items: [] };
}

// ── 코너 페이지용 ───────────────────────────────────────────────
export function topRiskCompanies(limit = 20): Company[] {
  return ACTIVE.filter((c) => c.cur_members >= 10)
    .slice()
    .sort((a, b) => b.risk_score - a.risk_score || b.cur_turnover - a.cur_turnover)
    .slice(0, limit);
}

export function closedCompanies(limit = 40): Company[] {
  return CLOSED.slice().sort((a, b) => b.cur_members - a.cur_members).slice(0, limit);
}

export interface AwardWinner { key: string; title: string; desc: string; company: Company; stat: string; }
export function awards(): AwardWinner[] {
  const big = ACTIVE.filter((c) => c.cur_members >= 30);
  const top = (arr: Company[], cmp: (a: Company, b: Company) => number) => arr.reduce((best, c) => (cmp(c, best) < 0 ? c : best), arr[0]);
  const turn = top(big, (a, b) => b.cur_turnover - a.cur_turnover);
  const low = top(big.filter((c) => c.cur_salary > 0), (a, b) => a.cur_salary - b.cur_salary);
  const risk = top(big, (a, b) => b.risk_score - a.risk_score);
  const safe = top(big, (a, b) => a.risk_score - b.risk_score);
  const bigm = top(ACTIVE, (a, b) => b.cur_members - a.cur_members);
  return [
    { key: "turnover", title: "🌀 회전문 대상", desc: "회전율이 가장 높은 곳(30인+)", company: turn, stat: `회전율 ${turn.cur_turnover}%` },
    { key: "lowpay", title: "🥶 박봉 대상", desc: "추정 연봉이 가장 낮은 곳(30인+)", company: low, stat: `${low.cur_salary.toLocaleString()}만원` },
    { key: "risk", title: "🚨 올해의 좋소", desc: "위험도가 가장 높은 곳(30인+)", company: risk, stat: `위험도 ${risk.risk_score}` },
    { key: "safe", title: "🏆 안심 대상", desc: "위험도가 가장 낮은 곳(30인+)", company: safe, stat: `위험도 ${safe.risk_score}` },
    { key: "big", title: "🏢 대식구 대상", desc: "직원 수가 가장 많은 곳", company: bigm, stat: `${bigm.cur_members.toLocaleString()}명` },
  ];
}

export function gamePool(n = 12): Company[] {
  const rnd = mulberry32(424242);
  // 위험/안전 섞이도록 30인 이상에서 표본
  const pool = ACTIVE.filter((c) => c.cur_members >= 30).slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
