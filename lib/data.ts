import fs from "node:fs";
import path from "node:path";
import type { Company, MonthlyStat, RiskLabel } from "./types";
import { riskScore, riskLabel, turnover as calcTurnover } from "./score";

// ── 실데이터 로드 (국민연금 가입 사업장 내역 전량, scripts/etl.mjs 산출) ──
// 컬럼형 + 인터닝. 552k 전수를 메모리에 두되, Company 객체는 질의 결과에만 생성.
interface ColSet {
  bizNo: string[]; name: string[]; sidoIx: number[]; sgIx: number[]; dongIx: number[];
  bdong: string[]; indIx: number[]; members: number[]; salary: number[]; turnover: number[]; score: number[];
}
interface Dataset {
  ym: string; count: number; totalActive: number; allMedian: number;
  ind: [string, string, number][]; sido: string[]; sigungu: string[]; dong: string[];
  cols: ColSet; closed: ColSet;
}

const raw: Dataset = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data/companies.json"), "utf8")
);

export const DATA_YM = raw.ym;
export const TOTAL_ACTIVE = raw.totalActive;
const A = raw.cols;
const CL = raw.closed;
const NA = A.name.length;
const NCL = CL.name.length;

// 전역 인덱스 g: [0,NA) 활성, [NA, NA+NCL) 휴폐업
const setOf = (g: number) => (g < NA ? { s: A, i: g, closed: false } : { s: CL, i: g - NA, closed: true });

// 점수 기반 한줄평 — 단정 대신 '추정' 톤(공공데이터 추정치, 참고용)
function commentForScore(score: number, closed: boolean): string {
  if (closed) return "최근 가입자 급감 등 휴·폐업 신호가 추정됩니다.";
  if (score >= 70) return "위험 신호가 강하게 추정됩니다. 입사 전 꼼꼼히 확인하세요.";
  if (score >= 50) return "다소 주의가 필요한 신호가 보입니다.";
  if (score >= 30) return "평범한 편으로 추정됩니다.";
  if (score >= 10) return "비교적 무난해 보입니다.";
  return "위험 신호는 낮게 추정됩니다.";
}

// ── stable id (전역 인덱스별 1회 계산, 충돌 시 접미사) ───────────
let IDS: string[] | null = null;
let ID_MAP: Map<string, number> | null = null;
function ensureIds() {
  if (IDS) return;
  IDS = new Array(NA + NCL);
  ID_MAP = new Map();
  for (let g = 0; g < NA + NCL; g++) {
    const { s, i } = setOf(g);
    let h = 5381;
    const str = s.name[i] + s.bizNo[i] + s.bdong[i];
    for (let k = 0; k < str.length; k++) h = ((h << 5) + h + str.charCodeAt(k)) | 0;
    let id = (h >>> 0).toString(36) + s.bizNo[i];
    while (ID_MAP.has(id)) id += "x";
    ID_MAP.set(id, g);
    IDS[g] = id;
  }
}
function idAt(g: number): string { ensureIds(); return IDS![g]; }

// 단건 base id(중복제거 전). 상위 인덱스는 충돌 없어 idAt와 일치 → ensureIds 미트리거.
function baseId(g: number): string {
  const { s, i } = setOf(g);
  let h = 5381;
  const str = s.name[i] + s.bizNo[i] + s.bdong[i];
  for (let k = 0; k < str.length; k++) h = ((h << 5) + h + str.charCodeAt(k)) | 0;
  return (h >>> 0).toString(36) + s.bizNo[i];
}

function companyAt(g: number): Company {
  const { s, i, closed } = setOf(g);
  const [code, indName, median] = raw.ind[s.indIx[i]];
  const members = s.members[i], salary = s.salary[i], turnover = s.turnover[i];
  const { score, contrib } = riskScore({ members, est_salary: salary, turnover, is_closed: closed }, median);
  const sido = raw.sido[s.sidoIx[i]], sigungu = raw.sigungu[s.sgIx[i]], dong = raw.dong[s.dongIx[i]];
  return {
    id: idAt(g), biz_name: s.name[i], biz_no6: s.bizNo[i],
    industry_code: code, industry_name: indName,
    sido, sigungu, bdong_code: s.bdong[i], dong,
    addr: [sido, sigungu, dong].filter(Boolean).join(" "),
    cur_members: members, cur_salary: salary, cur_turnover: turnover,
    risk_score: score, risk_label: riskLabel(score) as RiskLabel,
    is_closed: closed, last_ym: raw.ym, contrib,
    comment: commentForScore(score, closed), industry_median: median,
  };
}

export function getCompany(id: string): Company | undefined {
  ensureIds();
  const g = ID_MAP!.get(id);
  return g === undefined ? undefined : companyAt(g);
}

// 콜드스타트에 552k id 전수 생성을 강제하지 않도록 baseId 사용(상위 8개는 충돌 없음)
export const HERO_IDS: string[] = Array.from({ length: Math.min(8, NA) }, (_, g) => baseId(g));

// ── 월별 시계열 (지연 생성·캐시) ───────────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
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
  const rnd = mulberry32(c.id.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) + c.cur_members);
  const n = MONTHS.length;
  const series: MonthlyStat[] = MONTHS.map((ym, i) => {
    const progress = i / (n - 1);
    const base = Math.round(c.cur_members * (0.78 + 0.22 * progress));
    const members = Math.max(1, base + Math.round((rnd() - 0.5) * Math.max(2, c.cur_members * 0.08)));
    const churn = ((c.cur_turnover * (0.6 + 0.4 * progress)) / 100) * members;
    const hires = Math.max(0, Math.round(churn * (0.45 + rnd() * 0.1)));
    const leaves = Math.max(0, Math.round(churn - hires));
    const est_salary = Math.round(c.cur_salary * (0.9 + 0.1 * progress));
    return { company_id: c.id, ym, members, hires, leaves, notice_amt: Math.round((est_salary / 12) * 10000 * 0.09 * members), est_salary, turnover: calcTurnover(hires, leaves, members) };
  });
  const last = series[n - 1];
  last.members = c.cur_members;
  last.est_salary = c.cur_salary;
  last.turnover = c.cur_turnover; // 헤더 회전율과 일치
  STATS_CACHE.set(id, series);
  return series;
}

// ── 검색: 회사명 또는 사업자번호 부분일치 (활성 전수 스캔) ──────────
let _nameLc: string[] | null = null; // 지연 생성(콜드스타트 절감)
function nameLcArr(): string[] {
  if (!_nameLc) _nameLc = A.name.map((s) => s.toLowerCase());
  return _nameLc;
}
export function searchCompanies(q: string, limit = 10): Company[] {
  const norm = q.trim().toLowerCase();
  if (!norm) return [];
  const nameLc = nameLcArr();
  const digits = norm.replace(/\D/g, "");
  const byDigit = digits.length >= 3;
  const hits: number[] = [];
  for (let i = 0; i < NA; i++) {
    if (nameLc[i].includes(norm) || (byDigit && A.bizNo[i].includes(digits))) {
      hits.push(i);
      if (hits.length > 600) break;
    }
  }
  hits.sort((a, b) => A.members[b] - A.members[a]);
  return hits.slice(0, limit).map((g) => companyAt(g));
}

// ── 주변 회사: 같은 법정동 → 시군구 → 업종 → 전체 ───────────────
export type NearbyScope = "dong" | "sigungu" | "industry" | "all";
export interface NearbyResultSet { scope: NearbyScope; items: Company[]; }
export function nearbyCompanies(id: string, limit = 10): NearbyResultSet {
  ensureIds();
  const g0 = ID_MAP!.get(id);
  if (g0 === undefined) return { scope: "all", items: [] };
  const { s, i } = setOf(g0);
  const myBdong = s.bdong[i], mySg = s.sgIx[i], mySido = s.sidoIx[i], myInd = s.indIx[i];
  const collect = (pred: (j: number) => boolean): number[] => {
    const r: number[] = [];
    for (let j = 0; j < NA; j++) if (j !== g0 && A.members[j] > 5 && pred(j)) r.push(j);
    return r;
  };
  const tiers: { scope: NearbyScope; pred: (j: number) => boolean }[] = [
    { scope: "dong", pred: (j) => A.bdong[j] === myBdong },
    { scope: "sigungu", pred: (j) => A.sgIx[j] === mySg && A.sidoIx[j] === mySido },
    { scope: "industry", pred: (j) => A.indIx[j] === myInd },
    { scope: "all", pred: () => true },
  ];
  for (const t of tiers) {
    const pool = collect(t.pred);
    if (pool.length) {
      pool.sort((a, b) => A.salary[b] - A.salary[a]);
      return { scope: t.scope, items: pool.slice(0, limit).map(companyAt) };
    }
  }
  return { scope: "all", items: [] };
}

// ── 코너 페이지 (지연 계산·캐시) ───────────────────────────────
let _topRisk: number[] | null = null;
export function topRiskCompanies(limit = 20): Company[] {
  if (!_topRisk) {
    const cand: number[] = [];
    for (let i = 0; i < NA; i++) if (A.members[i] >= 10) cand.push(i);
    cand.sort((a, b) => A.score[b] - A.score[a] || A.turnover[b] - A.turnover[a]);
    _topRisk = cand.slice(0, 100);
  }
  return _topRisk.slice(0, limit).map(companyAt);
}

export function closedCompanies(limit = 40): Company[] {
  const idx = Array.from({ length: NCL }, (_, k) => NA + k);
  idx.sort((a, b) => setOf(b).s.members[setOf(b).i] - setOf(a).s.members[setOf(a).i]);
  return idx.slice(0, limit).map(companyAt);
}

export interface AwardWinner { key: string; title: string; desc: string; company: Company; stat: string; }
let _awards: AwardWinner[] | null = null;
export function awards(): AwardWinner[] {
  if (_awards) return _awards;
  let turnG = -1, lowG = -1, riskG = -1, safeG = -1, bigG = -1;
  for (let i = 0; i < NA; i++) {
    if (A.members[i] >= 30) {
      if (turnG < 0 || A.turnover[i] > A.turnover[turnG]) turnG = i;
      if (A.salary[i] > 0 && (lowG < 0 || A.salary[i] < A.salary[lowG])) lowG = i;
      if (riskG < 0 || A.score[i] > A.score[riskG]) riskG = i;
      if (safeG < 0 || A.score[i] < A.score[safeG]) safeG = i;
    }
    if (bigG < 0 || A.members[i] > A.members[bigG]) bigG = i;
  }
  const w = (g: number) => companyAt(g);
  _awards = [
    { key: "turnover", title: "🌀 회전문 대상", desc: "회전율이 가장 높은 곳(30인+)", company: w(turnG), stat: `회전율 ${A.turnover[turnG]}%` },
    { key: "lowpay", title: "🥶 박봉 대상", desc: "추정 연봉이 가장 낮은 곳(30인+)", company: w(lowG), stat: `${A.salary[lowG].toLocaleString()}만원` },
    { key: "risk", title: "🚨 올해의 좋소", desc: "위험도가 가장 높은 곳(30인+)", company: w(riskG), stat: `위험도 ${A.score[riskG]}` },
    { key: "safe", title: "🏆 안심 대상", desc: "위험도가 가장 낮은 곳(30인+)", company: w(safeG), stat: `위험도 ${A.score[safeG]}` },
    { key: "big", title: "🏢 대식구 대상", desc: "직원 수가 가장 많은 곳", company: w(bigG), stat: `${A.members[bigG].toLocaleString()}명` },
  ];
  return _awards;
}

export function gamePool(n = 12): Company[] {
  const rnd = mulberry32(424242);
  const pool: number[] = [];
  for (let i = 0; i < NA; i++) if (A.members[i] >= 30) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).map(companyAt);
}
