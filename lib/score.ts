import type { RiskLabel } from "./types";

// 작업계획서 §9 점수 엔진 (역공학 복원, 1차 보정 계수)
export function riskScore(
  c: { members: number; est_salary: number; turnover: number; is_closed: boolean },
  industryMedian: number
): { score: number; contrib: { members: number; salary: number; turnover: number; closed: number } } {
  // 1) 직원수 (작을수록 위험)
  const s1 = c.members >= 100 ? 0 : c.members >= 30 ? 8 : 16;

  // 2) 연봉 (업종 중앙값 대비 낮을수록 위험, 상한 35)
  const ratio = industryMedian ? c.est_salary / industryMedian : 1;
  const s2 = ratio >= 1 ? 0 : Math.round(35 * Math.min(1, 1 - ratio));

  // 3) 회전율 (높을수록 위험, 상한 35) — 약 20%↑부터 가산
  const s3 = Math.round(Math.max(0, Math.min(35, (c.turnover - 20) * 0.22)));

  // 4) 휴폐업 신호
  const s4 = c.is_closed ? 30 : 0;

  const score = Math.max(0, Math.min(100, s1 + s2 + s3 + s4));
  return { score, contrib: { members: s1, salary: s2, turnover: s3, closed: s4 } };
}

// 위험도 → 등급 라벨 (§2.6: 0–20 희귀 / 20–50 보통 / 50+ 좋소)
export function riskLabel(score: number): RiskLabel {
  if (score < 20) return "희귀 중소";
  if (score < 50) return "보통";
  return "좋소 확정";
}

// 회전율 = (입사 + 퇴사) / 현원 × 100
export function turnover(hires: number, leaves: number, members: number): number {
  if (!members) return 0;
  return Math.round(((hires + leaves) / members) * 1000) / 10;
}

// 추정 평균연봉(만원) = (당월고지금액 / 가입자수) / 0.09 × 12
export function estSalary(noticeAmt: number, members: number): number {
  if (!members) return 0;
  return Math.round((noticeAmt / members / 0.09) * 12 / 10000);
}

// 회전율 라벨
export function turnoverLabel(t: number): string {
  return t >= 60 ? "사람이 자주 갈림" : "안정적";
}

// 직원수 밴드 라벨
export function memberBand(n: number): string {
  if (n >= 100) return "100명 이상 · 중소 상단";
  if (n >= 30) return "30~99명 · 중소 중간";
  return "30명 미만 · 영세";
}
