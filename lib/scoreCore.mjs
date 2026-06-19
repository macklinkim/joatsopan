// 점수 엔진 순수 로직 — 단일 출처(SSOT). lib/score.ts(타입 래퍼)와 scripts/etl.mjs가 공유.
// 작업계획서 §9 기준.

export function riskScore(c, industryMedian) {
  const s1 = c.members >= 100 ? 0 : c.members >= 30 ? 8 : 16;
  const ratio = industryMedian ? c.est_salary / industryMedian : 1;
  const s2 = ratio >= 1 ? 0 : Math.round(35 * Math.min(1, 1 - ratio));
  const s3 = Math.round(Math.max(0, Math.min(35, (c.turnover - 20) * 0.22)));
  const s4 = c.is_closed ? 30 : 0;
  const score = Math.max(0, Math.min(100, s1 + s2 + s3 + s4));
  return { score, contrib: { members: s1, salary: s2, turnover: s3, closed: s4 } };
}

export function riskLabel(score) {
  if (score < 20) return "희귀 중소";
  if (score < 50) return "보통";
  return "좋소 확정";
}

export function turnover(hires, leaves, members) {
  if (!members) return 0;
  return Math.round(((hires + leaves) / members) * 1000) / 10;
}

export function estSalary(noticeAmt, members) {
  if (!members) return 0;
  return Math.round((noticeAmt / members / 0.09) * 12 / 10000);
}
