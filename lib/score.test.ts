import { describe, it, expect } from "vitest";
import { riskScore, riskLabel, turnover, estSalary } from "./score";

const s = (members: number, est: number, t: number, median: number, closed = false) =>
  riskScore({ members, est_salary: est, turnover: t, is_closed: closed }, median).score;

describe("riskScore — 직원수 밴드", () => {
  it("100+는 0, 30~99는 8, 30미만은 16", () => {
    expect(s(100, 5000, 0, 5000)).toBe(0);
    expect(s(99, 5000, 0, 5000)).toBe(8);
    expect(s(30, 5000, 0, 5000)).toBe(8);
    expect(s(29, 5000, 0, 5000)).toBe(16);
    expect(s(1, 5000, 0, 5000)).toBe(16);
  });
});

describe("riskScore — 연봉(중앙값 대비)", () => {
  it("중앙값 이상이면 가산 0", () => {
    expect(s(100, 5000, 0, 4000)).toBe(0);
  });
  it("중앙값 절반이면 약 +18(상한 35)", () => {
    expect(s(100, 2000, 0, 4000)).toBe(Math.round(35 * 0.5)); // 18
  });
  it("연봉 0이면 최대 +35", () => {
    expect(s(100, 0, 0, 4000)).toBe(35);
  });
  it("median 0이면 가산 0(결측 안전)", () => {
    expect(s(100, 0, 0, 0)).toBe(0);
  });
});

describe("riskScore — 회전율", () => {
  it("20% 이하 가산 0", () => {
    expect(s(100, 5000, 20, 5000)).toBe(0);
    expect(s(100, 5000, 0, 5000)).toBe(0);
  });
  it("회전율 높으면 상한 35", () => {
    expect(s(100, 5000, 200, 5000)).toBe(35);
  });
});

describe("riskScore — 합산/클램프/휴폐업", () => {
  it("0~100 클램프", () => {
    expect(s(1, 0, 300, 5000, true)).toBe(100);
    expect(s(200, 9999, 0, 5000)).toBe(0);
  });
  it("휴폐업 +30", () => {
    expect(s(100, 5000, 0, 5000, true)).toBe(30);
  });
});

describe("riskLabel 경계", () => {
  it("19=희귀, 20=보통, 49=보통, 50=좋소", () => {
    expect(riskLabel(19)).toBe("희귀 중소");
    expect(riskLabel(20)).toBe("보통");
    expect(riskLabel(49)).toBe("보통");
    expect(riskLabel(50)).toBe("좋소 확정");
  });
});

describe("turnover / estSalary", () => {
  it("turnover=(입+퇴)/현원*100, members 0이면 0", () => {
    expect(turnover(5, 5, 100)).toBe(10);
    expect(turnover(5, 5, 0)).toBe(0);
  });
  it("estSalary=(고지액/인원/0.09)*12/만원, members 0이면 0", () => {
    expect(estSalary(0, 0)).toBe(0);
    expect(estSalary(231745540, 608)).toBe(5082);
  });
});
