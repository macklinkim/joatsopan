// 국민연금 '가입 사업장 내역' CSV(EUC-KR) → 앱 데이터셋(점수 계산 포함)
// 사용: node --max-old-space-size=4096 scripts/etl.mjs [maxCount]
// 입력: data/raw/nps.csv (115MB, 593k행)  출력: data/companies.json (컬럼형 압축)
import fs from "node:fs";
import { riskScore as coreRisk, turnover as turnoverPct, estSalary } from "../lib/scoreCore.mjs";

const SRC = "data/raw/nps.csv";
const OUT = "data/companies.json";
const MAX = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;

// 점수 엔진은 lib/scoreCore.mjs(SSOT) 공유. ETL은 score 값만 필요.
const riskScore = (members, salary, turnover, median, closed) =>
  coreRisk({ members, est_salary: salary, turnover, is_closed: closed }, median).score;

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

// 전량 적재(기본). MAX 지정 시 가입자수 상위 N만(개발용).
rows.sort((a, b) => b.members - a.members);
const chosen = Number.isFinite(MAX) ? rows.slice(0, MAX) : rows;

// ── 인터닝 테이블(용량 절감) ─────────────────────────────────
const indList = []; const indIxMap = new Map(); // code → idx
function indIx(code, name) {
  if (indIxMap.has(code)) return indIxMap.get(code);
  const ix = indList.length;
  indIxMap.set(code, ix);
  indList.push([code, name, indMedian.get(code) || allMedian]);
  return ix;
}
function interner() {
  const list = []; const map = new Map();
  return { ix: (v) => { if (map.has(v)) return map.get(v); const i = list.length; map.set(v, i); list.push(v); return i; }, list };
}
const sidoI = interner(), sgI = interner(), dongI = interner();

// 지번주소 → 시도/시군구/동 (통합시: 도+OO시+OO구, 세종: 시군구 없음 대응)
function parseRegion(addr) {
  const t = (addr || "").split(/\s+/).filter(Boolean);
  const sido = t[0] || "";
  if (sido.startsWith("세종")) return [sido, "", t[1] || ""]; // 세종시: 시군구 없음
  if (t[1] && t[2] && t[1].endsWith("시") && t[2].endsWith("구"))
    return [sido, `${t[1]} ${t[2]}`, t[3] || ""]; // 통합시: 성남시 분당구 …
  return [sido, t[1] || "", t[2] || ""];
}

// 압축 컬럼: id·indName·indCode 제거(인터닝/런타임 재계산), score만 보관(랭킹용)
function build(list, closed) {
  const cols = { bizNo: [], name: [], sidoIx: [], sgIx: [], dongIx: [], bdong: [], indIx: [], members: [], salary: [], turnover: [], score: [] };
  for (const r of list) {
    const med = indMedian.get(r.indCode) || allMedian;
    const turnover = turnoverPct(r.hires, r.leaves, r.members);
    const score = riskScore(r.members, r.salary, turnover, med, closed);
    const [psido, psg, pdong] = parseRegion(r.jibun);
    cols.bizNo.push(r.bizNo);
    cols.name.push(r.name);
    cols.sidoIx.push(sidoI.ix(psido));
    cols.sgIx.push(sgI.ix(psg));
    cols.dongIx.push(dongI.ix(pdong));
    cols.bdong.push(r.bdong);
    cols.indIx.push(indIx(r.indCode, r.indName));
    cols.members.push(r.members);
    cols.salary.push(r.salary);
    cols.turnover.push(turnover);
    cols.score.push(score);
  }
  return cols;
}

const cols = build(chosen, false);
closedRows.sort((a, b) => b.members - a.members);
const closedCols = build(closedRows.slice(0, 200), true);

const out = {
  ym, count: cols.name.length, totalActive: rows.length, allMedian,
  ind: indList, sido: sidoI.list, sigungu: sgI.list, dong: dongI.list,
  cols, closed: closedCols,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.error("wrote", OUT, "active:", cols.name.length, "closed:", closedCols.name.length, "industries:", indList.length, "bytes:", fs.statSync(OUT).size);
