import Link from "next/link";
import type { Company } from "@/lib/types";
import { riskColor } from "@/lib/format";

export default function CompanyRankList({
  items,
  stat,
  showRisk = true,
}: {
  items: Company[];
  stat?: (c: Company) => { label: string; danger?: boolean };
  showRisk?: boolean;
}) {
  if (!items.length) {
    return <p className="text-sm text-on-surface-variant">표시할 회사가 없습니다.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-primary/[0.06]">
      {items.map((c, i) => {
        const s = stat?.(c);
        return (
          <li key={c.id}>
            <Link
              href={`/company/${c.id}`}
              className="-mx-2 flex items-center gap-3 rounded px-2 py-3 hover:bg-surface-white"
            >
              <span className="tnum w-6 shrink-0 text-sm font-semibold text-outline">{i + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{c.biz_name}</span>
                <span className="truncate text-xs text-on-surface-variant">
                  {c.sigungu} {c.dong} · {c.industry_name}
                </span>
              </span>
              {s && (
                <span
                  className="tnum shrink-0 text-sm font-semibold"
                  style={{ color: s.danger ? "#D8362A" : "#1A1A1A" }}
                >
                  {s.label}
                </span>
              )}
              {showRisk && (
                <span
                  className="tnum w-8 shrink-0 rounded-full py-0.5 text-center text-xs font-semibold"
                  style={{ background: `${riskColor(c.risk_score)}1a`, color: riskColor(c.risk_score) }}
                >
                  {c.risk_score}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
