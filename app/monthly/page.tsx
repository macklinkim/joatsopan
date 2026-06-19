import { topRiskCompanies } from "@/lib/data";
import CompanyRankList from "@/components/CompanyRankList";

export const metadata = { title: "이달의 좋소 — 좋소판별기" };

export default function MonthlyPage() {
  const items = topRiskCompanies(20);
  return (
    <main className="mx-auto max-w-container px-5 py-8 md:px-12">
      <h1 className="font-head text-3xl font-bold tracking-[-0.01em]">이달의 좋소</h1>
      <p className="mt-2 mb-6 text-sm text-on-surface-variant">
        이번 달 위험도가 가장 높은 사업장 TOP 20 (영업 중 · 회전율·연봉·인원 기반 추정)
      </p>
      <section className="rounded-lg border border-primary/[0.08] bg-surface-white p-5 md:p-6">
        <CompanyRankList
          items={items}
          stat={(c) => ({ label: `회전율 ${c.cur_turnover}%`, danger: c.cur_turnover >= 100 })}
        />
      </section>
      <p className="mt-6 text-center text-xs text-outline">
        ※ 공공데이터(국민연금) 기반 추정치이며 참고용입니다. 특정 기업 비방 목적이 아닙니다.
      </p>
    </main>
  );
}
