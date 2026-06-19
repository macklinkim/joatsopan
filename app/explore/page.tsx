import { exploreCompanies, sidoList, type Grade, type SortKey } from "@/lib/data";
import CompanyRankList from "@/components/CompanyRankList";
import { won } from "@/lib/format";
import type { Company } from "@/lib/types";

export const metadata = { title: "기업 탐색 — 좋소판별기" };

const GRADES: { v: string; label: string }[] = [
  { v: "", label: "전체 등급" },
  { v: "jotso", label: "좋소 확정(50+)" },
  { v: "normal", label: "보통(20~49)" },
  { v: "rare", label: "희귀 중소(<20)" },
];
const SORTS: { v: string; label: string }[] = [
  { v: "risk", label: "위험도 높은 순" },
  { v: "salary", label: "연봉 높은 순" },
  { v: "members", label: "직원 많은 순" },
];

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ sido?: string; grade?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const sido = sp.sido || "";
  const grade = (sp.grade || "") as Grade | "";
  const sort = (sp.sort || "risk") as SortKey;
  const { items, total } = exploreCompanies(
    { sido: sido || undefined, grade: grade || undefined, sort },
    50
  );
  const sidos = sidoList();
  const sel = "rounded-md border border-primary/15 bg-surface-white px-3 py-2 text-sm";

  const statFor = (sortKey: SortKey): (c: Company) => { label: string; danger?: boolean } =>
    sortKey === "salary"
      ? (c) => ({ label: won(c.cur_salary) })
      : sortKey === "members"
      ? (c) => ({ label: `${c.cur_members.toLocaleString()}명` })
      : (c) => ({ label: `회전율 ${c.cur_turnover}%`, danger: c.cur_turnover >= 100 });

  return (
    <main className="mx-auto max-w-container px-5 py-8 md:px-12">
      <h1 className="font-head text-3xl font-bold tracking-[-0.01em]">기업 탐색</h1>
      <p className="mt-2 mb-5 text-sm text-on-surface-variant">
        지역·위험등급·정렬로 전국 사업장을 훑어보세요. 조건 일치{" "}
        <span className="tnum font-semibold text-primary">{total.toLocaleString()}</span>곳 중 상위 {items.length}.
      </p>

      <form method="get" className="mb-6 flex flex-wrap gap-2">
        <select name="sido" defaultValue={sido} className={sel} aria-label="지역">
          <option value="">전국</option>
          {sidos.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="grade" defaultValue={grade} className={sel} aria-label="위험 등급">
          {GRADES.map((g) => (
            <option key={g.v} value={g.v}>{g.label}</option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} className={sel} aria-label="정렬">
          {SORTS.map((s) => (
            <option key={s.v} value={s.v}>{s.label}</option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-surface-paper hover:opacity-90">
          적용
        </button>
      </form>

      <section className="rounded-lg border border-primary/[0.08] bg-surface-white p-5 md:p-6">
        <CompanyRankList items={items} stat={statFor(sort)} />
      </section>
      <p className="mt-6 text-center text-xs text-outline">
        ※ 공공데이터(국민연금) 기반 추정치이며 참고용입니다.
      </p>
    </main>
  );
}
