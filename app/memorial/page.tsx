import { closedCompanies } from "@/lib/data";
import CompanyRankList from "@/components/CompanyRankList";

export const metadata = { title: "별이 된 좋소 — 좋소판별기" };

export default function MemorialPage() {
  const items = closedCompanies(40);
  return (
    <main className="mx-auto max-w-container px-5 py-8 md:px-12">
      <h1 className="font-head text-3xl font-bold tracking-[-0.01em]">별이 된 좋소</h1>
      <p className="mt-2 mb-6 text-sm text-on-surface-variant">
        휴·폐업 신호가 감지된 사업장 (최근 가입자 급감 등). 고인의 명복을 빕니다.
      </p>
      <section className="rounded-lg border border-primary/[0.08] bg-surface-white p-5 md:p-6">
        <CompanyRankList
          items={items}
          showRisk={false}
          stat={(c) => ({ label: `${c.cur_members.toLocaleString()}명`, danger: true })}
        />
      </section>
      <p className="mt-6 text-center text-xs text-outline">
        ※ 공공데이터(국민연금) 가입자 추이 기반 추정이며, 실제 휴·폐업 여부와 다를 수 있습니다.
      </p>
    </main>
  );
}
