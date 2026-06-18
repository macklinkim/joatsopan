export type RiskLabel = "희귀 중소" | "보통" | "좋소 확정";

export interface Contributions {
  members: number; // 직원수 기여 점수
  salary: number; // 연봉 기여 점수
  turnover: number; // 회전율 기여 점수
  closed: number; // 휴폐업 기여 점수
}

export interface Company {
  id: string;
  biz_name: string;
  biz_no6: string;
  industry_code: string;
  industry_name: string;
  sido: string;
  sigungu: string;
  bdong_code: string; // 법정동 코드 (주변 추천 매칭 키)
  dong: string;
  addr: string;
  // 최신월 요약 (ETL 사전계산값)
  cur_members: number;
  cur_salary: number; // 추정 평균연봉 (만원)
  cur_turnover: number; // 회전율 %
  risk_score: number; // 0~100
  risk_label: RiskLabel;
  is_closed: boolean;
  last_ym: string; // 'YYYY-MM'
  // 화면용 부가
  contrib: Contributions;
  comment: string; // 한줄평
  industry_median: number; // 업종 중앙값 (만원)
}

export interface MonthlyStat {
  company_id: string;
  ym: string;
  members: number;
  hires: number;
  leaves: number;
  notice_amt: number;
  est_salary: number;
  turnover: number;
}

export interface SearchResult {
  id: string;
  bizName: string;
  bizNo: string;
  industry: string;
  members: number;
}

export interface NearbyResult {
  id: string;
  bizName: string;
  salary: number;
  members: number;
  riskScore: number;
  riskLabel: RiskLabel;
}
