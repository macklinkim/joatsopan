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
// 검색 정규화: NFC 통일 + 전각→반각 + 소문자 (macOS NFD·전각 입력 매칭 실패 방지)
function normForSearch(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}
let _nameLc: string[] | null = null; // 지연 생성(콜드스타트 절감)
function nameLcArr(): string[] {
  if (!_nameLc) _nameLc = A.name.map((s) => normForSearch(s));
  return _nameLc;
}
export function searchCompanies(q: string, limit = 10): Company[] {
  const norm = normForSearch(q.trim());
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

// ── 사전 인덱스 (지연 1회 빌드) — 시군구/법정동/업종별 활성 인덱스 목록 ──
// 상세·주변·순위·백분위가 552k 전수 스캔 대신 해당 그룹만 순회(라운드3-04: ~96배 절감).
let _idx: { bySg: Map<string, number[]>; byDong: Map<string, number[]>; byInd: Map<number, number[]> } | null = null;
function indexes() {
  if (_idx) return _idx;
  const bySg = new Map<string, number[]>(), byDong = new Map<string, number[]>(), byInd = new Map<number, number[]>();
  const push = <K,>(m: Map<K, number[]>, k: K, v: number) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };
  for (let i = 0; i < NA; i++) {
    push(bySg, A.sidoIx[i] + "|" + A.sgIx[i], i);
    push(byDong, A.bdong[i], i);
    push(byInd, A.indIx[i], i);
  }
  _idx = { bySg, byDong, byInd };
  return _idx;
}

// ── 주변 회사: 같은 법정동 → 시군구 → 업종 → 전체 ───────────────
export type NearbyScope = "dong" | "sigungu" | "industry" | "all";
export interface NearbyResultSet { scope: NearbyScope; items: Company[]; }
export function nearbyCompanies(id: string, limit = 10): NearbyResultSet {
  ensureIds();
  const g0 = ID_MAP!.get(id);
  if (g0 === undefined) return { scope: "all", items: [] };
  const { s, i } = setOf(g0);
  const ix = indexes();
  const elig = (pool: number[] | undefined): number[] =>
    (pool ?? []).filter((j) => j !== g0 && A.members[j] > 5);
  const tiers: { scope: NearbyScope; pool: number[] }[] = [
    { scope: "dong", pool: elig(ix.byDong.get(s.bdong[i])) },
    { scope: "sigungu", pool: elig(ix.bySg.get(s.sidoIx[i] + "|" + s.sgIx[i])) },
    { scope: "industry", pool: elig(ix.byInd.get(s.indIx[i])) },
  ];
  for (const t of tiers) {
    if (t.pool.length) {
      t.pool.sort((a, b) => A.salary[b] - A.salary[a]);
      return { scope: t.scope, items: t.pool.slice(0, limit).map(companyAt) };
    }
  }
  // 전체 폴백(극히 드묾): 가입자수 상위에서 본인 제외
  const all: number[] = [];
  for (let j = 0; j < NA && all.length < limit * 3; j++) if (j !== g0 && A.members[j] > 5) all.push(j);
  all.sort((a, b) => A.salary[b] - A.salary[a]);
  return { scope: "all", items: all.slice(0, limit).map(companyAt) };
}

// ── 탐색(필터) — 시도·위험등급·정렬 (원본에 없는 기능) ──────────
export type Grade = "rare" | "normal" | "jotso";
export type SortKey = "risk" | "salary" | "members";
export interface ExploreFilter { sido?: string; grade?: Grade; sort?: SortKey; }

let _sidoList: string[] | null = null;
export function sidoList(): string[] {
  if (_sidoList) return _sidoList;
  const cnt = new Map<number, number>();
  for (let i = 0; i < NA; i++) cnt.set(A.sidoIx[i], (cnt.get(A.sidoIx[i]) || 0) + 1);
  _sidoList = [...cnt.entries()]
    .filter(([ix, n]) => raw.sido[ix] && n >= 100)
    .sort((a, b) => b[1] - a[1])
    .map(([ix]) => raw.sido[ix]);
  return _sidoList;
}

export function exploreCompanies(f: ExploreFilter, limit = 50): { items: Company[]; total: number } {
  const idx: number[] = [];
  for (let i = 0; i < NA; i++) {
    if (f.sido && raw.sido[A.sidoIx[i]] !== f.sido) continue;
    const sc = A.score[i];
    if (f.grade === "rare" && !(sc < 20)) continue;
    if (f.grade === "normal" && !(sc >= 20 && sc < 50)) continue;
    if (f.grade === "jotso" && !(sc >= 50)) continue;
    idx.push(i);
  }
  const total = idx.length;
  const cmp =
    f.sort === "salary" ? (a: number, b: number) => A.salary[b] - A.salary[a]
    : f.sort === "members" ? (a: number, b: number) => A.members[b] - A.members[a]
    : (a: number, b: number) => A.score[b] - A.score[a];
  idx.sort(cmp);
  return { items: idx.slice(0, limit).map(companyAt), total };
}

// ── 지역 위험도 순위 (같은 시군구 내, 위험도 높을수록 상위) ──────
export interface RegionRank {
  sigungu: string; dong: string;
  rank: number; total: number; percentile: number; // percentile=상위 P%
}
export function regionRank(id: string): RegionRank | null {
  ensureIds();
  const g = ID_MAP!.get(id);
  if (g === undefined || g >= NA) return null; // 활성만
  const myScore = A.score[g], mySg = A.sgIx[g], mySido = A.sidoIx[g];
  const group = indexes().bySg.get(mySido + "|" + mySg) ?? [];
  let higher = 0, tie = 0;
  for (const j of group) {
    if (A.score[j] > myScore) higher++;
    else if (A.score[j] === myScore && j < g) tie++; // 동점은 인덱스로 안정화
  }
  const total = group.length;
  if (total < 5) return null;
  const rank = higher + tie + 1;
  return {
    sigungu: raw.sigungu[mySg], dong: raw.dong[A.dongIx[g]],
    rank, total, percentile: Math.max(1, Math.round((rank / total) * 100)),
  };
}

// ── 업종 내 연봉 백분위 (원본에 없는 기능) ─────────────────────
export interface SalaryPctile { rank: number; total: number; percentile: number; }
export function salaryPercentile(id: string): SalaryPctile | null {
  ensureIds();
  const g = ID_MAP!.get(id);
  if (g === undefined || g >= NA) return null;
  const myInd = A.indIx[g], mySal = A.salary[g];
  if (mySal <= 0) return null;
  const group = indexes().byInd.get(myInd) ?? [];
  let total = 0, higher = 0, tie = 0;
  for (const j of group) {
    if (A.salary[j] > 0) {
      total++;
      if (A.salary[j] > mySal) higher++;
      else if (A.salary[j] === mySal && j < g) tie++;
    }
  }
  if (total < 10) return null;
  const rank = higher + tie + 1;
  return { rank, total, percentile: Math.max(1, Math.round((rank / total) * 100)) };
}

// ── 업종 평균 (지표 맥락용) ────────────────────────────────────
export interface IndustryAvg { salary: number; turnover: number; members: number; count: number; }
export function industryAvg(id: string): IndustryAvg | null {
  ensureIds();
  const g = ID_MAP!.get(id);
  if (g === undefined || g >= NA) return null;
  const group = indexes().byInd.get(A.indIx[g]) ?? [];
  if (group.length < 5) return null;
  let s = 0, t = 0, m = 0;
  for (const j of group) { s += A.salary[j]; t += A.turnover[j]; m += A.members[j]; }
  const n = group.length;
  return { salary: Math.round(s / n), turnover: Math.round((t / n) * 10) / 10, members: Math.round(m / n), count: n };
}

// ── 위험도 사다리 (같은 시군구 내 바로 위/아래 위험도 이웃) ──────
export interface RiskLadder { sigungu: string; moreRisky: Company[]; lessRisky: Company[]; }
export function riskLadder(id: string, n = 3): RiskLadder | null {
  ensureIds();
  const g = ID_MAP!.get(id);
  if (g === undefined || g >= NA) return null;
  const mySg = A.sgIx[g], mySido = A.sidoIx[g], myScore = A.score[g];
  const group = (indexes().bySg.get(mySido + "|" + mySg) ?? []).slice();
  if (group.length < 4) return null;
  group.sort((a, b) => A.score[b] - A.score[a] || a - b); // 위험 높은 순, 동점은 인덱스
  const pos = group.indexOf(g);
  // 동점(같은 점수)은 제외하고 '엄격히 더 위험/덜 위험'한 곳만 (정수 점수 군집 오표기 방지)
  const moreRisky: number[] = [];
  for (let k = pos - 1; k >= 0 && moreRisky.length < n; k--) if (A.score[group[k]] > myScore) moreRisky.push(group[k]);
  const lessRisky: number[] = [];
  for (let k = pos + 1; k < group.length && lessRisky.length < n; k++) if (A.score[group[k]] < myScore) lessRisky.push(group[k]);
  return {
    sigungu: raw.sigungu[mySg],
    moreRisky: moreRisky.map(companyAt),
    lessRisky: lessRisky.map(companyAt),
  };
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
  // 라벨은 지표 기반 중립 표현(조롱 톤 완화). 모두 추정치.
  _awards = [
    { key: "turnover", title: "🌀 회전율 최고", desc: "추정 회전율이 가장 높은 곳(30인+)", company: w(turnG), stat: `회전율 ${A.turnover[turnG]}%` },
    { key: "lowpay", title: "💸 추정 연봉 최저", desc: "추정 평균연봉이 가장 낮은 곳(30인+)", company: w(lowG), stat: `${A.salary[lowG].toLocaleString()}만원` },
    { key: "risk", title: "🚨 위험도 최고", desc: "추정 위험도가 가장 높은 곳(30인+)", company: w(riskG), stat: `위험도 ${A.score[riskG]}` },
    { key: "safe", title: "🏆 위험도 최저", desc: "추정 위험도가 가장 낮은 곳(30인+)", company: w(safeG), stat: `위험도 ${A.score[safeG]}` },
    { key: "big", title: "🏢 직원 수 최다", desc: "가입자 수가 가장 많은 곳", company: w(bigG), stat: `${A.members[bigG].toLocaleString()}명` },
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
