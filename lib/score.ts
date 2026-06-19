import type { RiskLabel } from "./types";
import * as core from "./scoreCore.mjs";

// 작업계획서 §9 점수 엔진 — 순수 로직은 scoreCore.mjs(SSOT), 여기선 타입 래퍼.
export function riskScore(
  c: { members: number; est_salary: number; turnover: number; is_closed: boolean },
  industryMedian: number
): { score: number; contrib: { members: number; salary: number; turnover: number; closed: number } } {
  return core.riskScore(c, industryMedian);
}

export function riskLabel(score: number): RiskLabel {
  return core.riskLabel(score) as RiskLabel;
}

// 회전율 = (입사 + 퇴사) / 현원 × 100
export function turnover(hires: number, leaves: number, members: number): number {
  return core.turnover(hires, leaves, members);
}

// 추정 평균연봉(만원) = (당월고지금액 / 가입자수) / 0.09 × 12
export function estSalary(noticeAmt: number, members: number): number {
  return core.estSalary(noticeAmt, members);
}

// 회전율 라벨 (UI)
export function turnoverLabel(t: number): string {
  return t >= 60 ? "사람이 자주 갈림" : "안정적";
}

// 직원수 밴드 라벨 (UI)
export function memberBand(n: number): string {
  if (n >= 100) return "100명 이상 · 중소 상단";
  if (n >= 30) return "30~99명 · 중소 중간";
  return "30명 미만 · 영세";
}
