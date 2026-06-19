import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany, getMonthlyStats, nearbyCompanies, HERO_IDS } from "@/lib/data";
import { memberBand, turnoverLabel } from "@/lib/score";
import { won, num, riskColor } from "@/lib/format";
import RiskGauge from "@/components/RiskGauge";
import LineChart from "@/components/LineChart";
import HireLeaveChart from "@/components/HireLeaveChart";
import MetricCard from "@/components/MetricCard";
import NearbyList from "@/components/NearbyList";
import type { NearbyResult } from "@/lib/types";

// 히어로 8개사만 미리 생성, 나머지(생성/실데이터)는 요청 시 동적 렌더
export function generateStaticParams() {
  return HERO_IDS.map((id) => ({ id }));
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = getCompany(id);
  if (!c) notFound();

  const stats = getMonthlyStats(id);
  const last = stats[stats.length - 1];
  const monthlyLeaveRate = last && last.members ? Math.round((last.leaves / last.members) * 1000) / 10 : 0;

  const nearbyResult = nearbyCompanies(id, 10);
  const nearby: NearbyResult[] = nearbyResult.items.map((n) => ({
    id: n.id,
    bizName: n.biz_name,
    salary: n.cur_salary,
    members: n.cur_members,
    riskScore: n.risk_score,
    riskLabel: n.risk_label,
  }));
  const nearbyDesc = {
    dong: `${c.sigungu} ${c.dong}의 다른 회사`,
    sigungu: `${c.sigungu}의 다른 회사`,
    industry: `같은 업종(${c.industry_name})의 다른 회사`,
    all: `다른 지역의 회사`,
  }[nearbyResult.scope];

  const medianRatioPct = Math.round((c.cur_salary / c.industry_median) * 100);

  return (
    <main className="mx-auto max-w-container px-5 py-8 md:px-12">
      <Link href="/" className="text-sm text-on-surface-variant hover:text-primary">
        ← 다시 검색
      </Link>

      {/* 헤더 */}
      <header className="mt-4 rounded-lg border border-primary/[0.08] bg-surface-white p-6 md:p-8">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <span
              className="tnum inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: `${riskColor(c.risk_score)}1a`, color: riskColor(c.risk_score) }}
            >
              {c.risk_label}
            </span>
            <h1 className="mt-3 font-head text-3xl font-semibold tracking-[-0.01em] md:text-4xl">
              {c.biz_name}
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              {c.industry_name} · 사업자 {c.biz_no6} · {c.sido} {c.sigungu} {c.dong}
            </p>
            <p className="mt-4 font-head text-lg font-medium" style={{ color: riskColor(c.risk_score) }}>
              “{c.comment}”
            </p>
          </div>
          <div className="flex justify-center">
            <RiskGauge score={c.risk_score} label={c.risk_label} />
          </div>
        </div>
      </header>

      {/* 핵심 지표 4종 */}
      <h2 className="mt-8 mb-3 font-head text-xl font-semibold">핵심 지표</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="직원 수"
          value={`${num(c.cur_members)}명`}
          sub={memberBand(c.cur_members)}
          contrib={c.contrib.members}
        />
        <MetricCard
          label="추정 평균연봉"
          value={won(c.cur_salary)}
          sub={`업종 중앙값의 ${medianRatioPct}%`}
          contrib={c.contrib.salary}
          danger={c.contrib.salary > 0}
        />
        <MetricCard
          label="회전율"
          value={`${c.cur_turnover}%`}
          sub={turnoverLabel(c.cur_turnover)}
          contrib={c.contrib.turnover}
          danger={c.contrib.turnover > 0}
        />
        <MetricCard
          label="휴·폐업 여부"
          value={c.is_closed ? "휴폐업 신호" : "정상 영업"}
          sub={c.is_closed ? "최근 가입자 급감" : "가입 상태 정상"}
          contrib={c.contrib.closed}
          danger={c.is_closed}
        />
      </div>

      {/* 차트 3종 */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-primary/[0.08] bg-surface-white p-5">
          <h3 className="mb-2 font-head text-base font-medium">직원 수 추이</h3>
          <LineChart data={stats.map((s) => ({ ym: s.ym, value: s.members }))} color="#1A1A1A" unit="명" />
        </section>
        <section className="rounded-lg border border-primary/[0.08] bg-surface-white p-5">
          <h3 className="mb-2 font-head text-base font-medium">평균 연봉 추이</h3>
          <LineChart
            data={stats.map((s) => ({ ym: s.ym, value: s.est_salary }))}
            color="#2A8D5C"
            unit="만원"
            baseline={c.industry_median}
            baselineLabel="업종 중앙값"
          />
        </section>
        <section className="rounded-lg border border-primary/[0.08] bg-surface-white p-5 md:col-span-2">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-head text-base font-medium">입·퇴사 흐름</h3>
            <span className="text-xs text-on-surface-variant">
              최근월 퇴사율 <span className="tnum font-semibold">{monthlyLeaveRate}%</span>
            </span>
          </div>
          <HireLeaveChart data={stats.map((s) => ({ ym: s.ym, hires: s.hires, leaves: s.leaves }))} />
        </section>
      </div>

      {/* 주변 회사 추천 */}
      <section className="mt-8 rounded-lg border border-primary/[0.08] bg-surface-white p-6">
        <h2 className="font-head text-xl font-semibold">주변 회사 추천</h2>
        <p className="mt-1 mb-4 text-sm text-on-surface-variant">
          {nearbyDesc} · 연봉 높은 순 (5인 이하 제외)
        </p>
        <NearbyList items={nearby} />
      </section>

      <footer className="mt-10 py-6 text-center text-xs text-outline">
        ※ 본 결과는 공공데이터(국민연금) 기반 추정치이며 참고용입니다. 특정 기업 비방 목적이 아닙니다.
      </footer>
    </main>
  );
}
