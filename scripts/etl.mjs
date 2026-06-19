// 국민연금 '가입 사업장 내역' CSV(EUC-KR) → 앱 데이터셋(점수 계산 포함)
// 사용: node --max-old-space-size=4096 scripts/etl.mjs [maxCount]
// 입력: data/raw/nps.csv (115MB, 593k행)  출력: data/companies.json (컬럼형 압축)
import fs from "node:fs";

const SRC = "data/raw/nps.csv";
const OUT = "data/companies.json";
const MAX = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;

// ── 점수 엔진 (lib/score.ts와 동일 공식) ───────────────────────
const estSalary = (notice, members) =>
  members ? Math.round((notice / members / 0.09) * 12 / 10000) : 0;
const turnoverPct = (hires, leaves, members) =>
  members ? Math.round(((hires + leaves) / members) * 1000) / 10 : 0;
function riskScore(members, salary, turnover, median, closed) {
  const s1 = members >= 100 ? 0 : members >= 30 ? 8 : 16;
  const ratio = median ? salary / median : 1;
  const s2 = ratio >= 1 ? 0 : Math.round(35 * Math.min(1, 1 - ratio));
  const s3 = Math.round(Math.max(0, Math.min(35, (turnover - 20) * 0.22)));
  const s4 = closed ? 30 : 0;
  return Math.max(0, Math.min(100, s1 + s2 + s3 + s4));
}
const labelOf = (s) => (s < 20 ? "희귀 중소" : s < 50 ? "보통" : "좋소 확정");

// ── 읽기 + EUC-KR 디코딩 ──────────────────────────────────────
console.error("reading + decoding EUC-KR…");
const txt = new TextDecoder("euc-kr").decode(fs.readFileSync(SRC));
const lines = txt.split(/\r?\n/);
console.error("lines:", lines.length);

// 컬럼 인덱스
const C = { ym: 0, name: 1, bizNo: 2, status: 3, jibun: 5, bdong: 7, sidoCd: 9, indCode: 13, indName: 14, leaveDt: 17, members: 18, notice: 19, hires: 20, leaves: 21 };

// 1패스: 활성 행 파싱 + 업종별 추정연봉 누적(중앙값용), 탈퇴(휴폐업) 별도 수집
const rows = [];
const closedRows = [];
const byInd = new Map();
let ym = "";
for (let i = 1; i < lines.length; i++) {
  const l = lines[i];
  if (!l) continue;
  const f = l.split(",");
  if (f.length !== 22) continue;
  const members = +f[C.members] || 0;
  const notice = +f[C.notice] || 0;
  const hires = +f[C.hires] || 0;
  const leaves = +f[C.leaves] || 0;
  const salary = estSalary(notice, members);
  ym = ym || f[C.ym];
  const indCode = f[C.indCode];
  const rec = {
    name: f[C.name], bizNo: f[C.bizNo], jibun: f[C.jibun], bdong: f[C.bdong],
    indCode, indName: f[C.indName], members, notice, hires, leaves, salary,
  };
  if (f[C.status] !== "1") {
    if (members >= 1) closedRows.push(rec); // 탈퇴(휴·폐업) — 별이 된 좋소
    continue;
  }
  if (members < 1) continue;
  if (salary > 0) {
    if (!byInd.has(indCode)) byInd.set(indCode, []);
    byInd.get(indCode).push(salary);
  }
  rows.push(rec);
}
console.error("active rows:", rows.length, "closed rows:", closedRows.length);

// 업종 중앙값
const median = (arr) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const indMedian = new Map();
for (const [code, arr] of byInd) indMedian.set(code, median(arr));
// 업종 전체 중앙값(데이터 적은 업종 폴백)
const allMedian = median([...byInd.values()].flatMap((a) => a));
console.error("industries:", indMedian.size, "global median:", allMedian);

// 선택: 층화표본 — 대형(검색 적중률) + 전 규모 균등표본(소형 좋소 대표성)
rows.sort((a, b) => b.members - a.members);
let chosen;
if (Number.isFinite(MAX)) {
  const bigN = Math.min(rows.length, Math.round(MAX * 0.3)); // 상위 30%는 대형
  const big = rows.slice(0, bigN);
  const restCount = MAX - bigN;
  const restPool = rows.slice(bigN);
  const step = Math.max(1, Math.floor(restPool.length / restCount));
  const rest = [];
  for (let i = 0; i < restPool.length && rest.length < restCount; i += step) rest.push(restPool[i]);
  chosen = big.concat(rest);
} else {
  chosen = rows;
}

// 2패스: 점수 + 지역 파싱 + stable id
const seen = new Set();
function sid(name, bizNo, bdong) {
  let h = 5381;
  const s = name + bizNo + bdong;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  let id = (h >>> 0).toString(36) + bizNo;
  while (seen.has(id)) id += "x";
  seen.add(id);
  return id;
}
function build(list, closed) {
  const cols = { id: [], bizNo: [], name: [], sido: [], sigungu: [], dong: [], bdong: [], indCode: [], indName: [], members: [], salary: [], turnover: [], score: [] };
  for (const r of list) {
    const med = indMedian.get(r.indCode) || allMedian;
    const turnover = turnoverPct(r.hires, r.leaves, r.members);
    const score = riskScore(r.members, r.salary, turnover, med, closed);
    const parts = (r.jibun || "").split(/\s+/);
    cols.id.push(sid(r.name, r.bizNo, r.bdong));
    cols.bizNo.push(r.bizNo);
    cols.name.push(r.name);
    cols.sido.push(parts[0] || "");
    cols.sigungu.push(parts[1] || "");
    cols.dong.push(parts[2] || "");
    cols.bdong.push(r.bdong);
    cols.indCode.push(r.indCode);
    cols.indName.push(r.indName);
    cols.members.push(r.members);
    cols.salary.push(r.salary);
    cols.turnover.push(turnover);
    cols.score.push(score);
  }
  return cols;
}

const cols = build(chosen, false);
closedRows.sort((a, b) => b.members - a.members);
const closedCols = build(closedRows.slice(0, 150), true);

const out = {
  ym, count: cols.id.length, totalActive: rows.length,
  indMedian: Object.fromEntries(indMedian), allMedian, cols, closed: closedCols,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.error("wrote", OUT, "active:", cols.id.length, "closed:", closedCols.id.length, "bytes:", fs.statSync(OUT).size);
