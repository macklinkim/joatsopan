import { describe, it, expect } from "vitest";
import {
  searchCompanies, exploreCompanies, getCompany, nearbyCompanies,
  regionRank, salaryPercentile, riskLadder, topRiskCompanies, gamePool,
} from "./data";

// 실데이터(data/companies.json)를 로드해 불변식 검증.
const sample = searchCompanies("삼성", 5);

describe("searchCompanies", () => {
  it("빈 쿼리는 빈 결과", () => {
    expect(searchCompanies("", 10)).toEqual([]);
    expect(searchCompanies("   ", 10)).toEqual([]);
  });
  it("회사명 부분일치 + 가입자수 내림차순", () => {
    expect(sample.length).toBeGreaterThan(0);
    for (const c of sample) expect(c.biz_name).toContain("삼성");
    for (let i = 1; i < sample.length; i++) {
      expect(sample[i - 1].cur_members).toBeGreaterThanOrEqual(sample[i].cur_members);
    }
  });
  it("limit 준수", () => {
    expect(searchCompanies("주식회사", 3).length).toBeLessThanOrEqual(3);
  });
});

describe("exploreCompanies", () => {
  it("좋소 등급은 모두 50+", () => {
    const { items, total } = exploreCompanies({ grade: "jotso", sort: "risk" }, 20);
    expect(total).toBeGreaterThan(0);
    for (const c of items) expect(c.risk_score).toBeGreaterThanOrEqual(50);
    // 위험도 내림차순
    for (let i = 1; i < items.length; i++) expect(items[i - 1].risk_score).toBeGreaterThanOrEqual(items[i].risk_score);
  });
  it("희귀 등급은 모두 <20", () => {
    const { items } = exploreCompanies({ grade: "rare" }, 10);
    for (const c of items) expect(c.risk_score).toBeLessThan(20);
  });
});

describe("getCompany / 상세 파생", () => {
  const id = sample[0].id;
  it("존재하는 id는 객체, 없으면 undefined", () => {
    expect(getCompany(id)?.id).toBe(id);
    expect(getCompany("___nope___")).toBeUndefined();
  });
  it("regionRank: rank ∈ [1,total], percentile ∈ [1,100]", () => {
    const r = regionRank(id);
    if (r) {
      expect(r.rank).toBeGreaterThanOrEqual(1);
      expect(r.rank).toBeLessThanOrEqual(r.total);
      expect(r.percentile).toBeGreaterThanOrEqual(1);
      expect(r.percentile).toBeLessThanOrEqual(100);
    }
  });
  it("salaryPercentile: rank ∈ [1,total]", () => {
    const p = salaryPercentile(id);
    if (p) {
      expect(p.rank).toBeGreaterThanOrEqual(1);
      expect(p.rank).toBeLessThanOrEqual(p.total);
    }
  });
  it("riskLadder: 위는 더 위험, 아래는 덜 위험", () => {
    const me = getCompany(id)!;
    const l = riskLadder(id);
    if (l) {
      for (const m of l.moreRisky) expect(m.risk_score).toBeGreaterThanOrEqual(me.risk_score);
      for (const m of l.lessRisky) expect(m.risk_score).toBeLessThanOrEqual(me.risk_score);
    }
  });
  it("nearbyCompanies: 본인 제외·유효 scope·5인 초과", () => {
    const { scope, items } = nearbyCompanies(id, 10);
    expect(["dong", "sigungu", "industry", "all"]).toContain(scope);
    for (const c of items) {
      expect(c.id).not.toBe(id);
      expect(c.cur_members).toBeGreaterThan(5);
    }
  });
});

describe("코너", () => {
  it("topRiskCompanies 위험도 내림차순·10인+", () => {
    const t = topRiskCompanies(10);
    expect(t.length).toBeGreaterThan(0);
    for (const c of t) expect(c.cur_members).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < t.length; i++) expect(t[i - 1].risk_score).toBeGreaterThanOrEqual(t[i].risk_score);
  });
  it("gamePool 결정적·요청 수", () => {
    expect(gamePool(12).map((c) => c.id)).toEqual(gamePool(12).map((c) => c.id));
    expect(gamePool(8).length).toBe(8);
  });
});
