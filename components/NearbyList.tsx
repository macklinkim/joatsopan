import Link from "next/link";
import type { NearbyResult } from "@/lib/types";
import { won, riskColor, riskTextColor } from "@/lib/format";

export default function NearbyList({ items, baseSalary }: { items: NearbyResult[]; baseSalary?: number }) {
  if (!items.length) {
    return (
      <p className="text-sm text-on-surface-variant">
        주변(같은 동) 추천 회사가 없습니다.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-primary/[0.06]">
      {items.map((c, i) => {
        const mult = baseSalary && baseSalary > 0 ? c.salary / baseSalary : 0;
        return (
        <li key={c.id}>
          <Link
            href={`/company/${c.id}`}
            className="-mx-2 flex items-center gap-3 rounded px-2 py-3 hover:bg-surface-paper/60"
          >
            <span className="tnum w-5 shrink-0 text-sm text-outline">{i + 1}</span>
            {/* 이름은 길어도 잘리도록(truncate) + 인원은 모바일에서 아래로 */}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2.5">
              <span className="truncate font-medium">{c.bizName}</span>
              <span className="tnum shrink-0 text-xs text-outline">{c.members.toLocaleString()}명</span>
            </span>
            {mult >= 1.1 && (
              <span className="tnum shrink-0 rounded-full bg-risk-safe/10 px-1.5 py-0.5 text-[11px] font-semibold text-risk-safe">
                {mult.toFixed(1)}배
              </span>
            )}
            <span className="tnum shrink-0 text-sm font-semibold">{won(c.salary)}</span>
            <span
              className="tnum w-8 shrink-0 rounded-full py-0.5 text-center text-xs font-semibold"
              style={{ background: `${riskColor(c.riskScore)}1a`, color: riskTextColor(c.riskScore) }}
            >
              {c.riskScore}
            </span>
          </Link>
        </li>
        );
      })}
    </ul>
  );
}
