import Link from "next/link";
import type { NearbyResult } from "@/lib/types";
import { won, riskColor } from "@/lib/format";

export default function NearbyList({ items }: { items: NearbyResult[] }) {
  if (!items.length) {
    return (
      <p className="text-sm text-on-surface-variant">
        주변(같은 동) 추천 회사가 없습니다.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-primary/[0.06]">
      {items.map((c, i) => (
        <li key={c.id}>
          <Link
            href={`/company/${c.id}`}
            className="flex items-center justify-between gap-3 py-3 hover:bg-surface-paper/60 -mx-2 px-2 rounded"
          >
            <span className="flex items-center gap-3">
              <span className="tnum w-5 text-sm text-outline">{i + 1}</span>
              <span className="font-medium">{c.bizName}</span>
              <span className="tnum text-xs text-outline">{c.members.toLocaleString()}명</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="tnum text-sm font-semibold">{won(c.salary)}</span>
              <span
                className="tnum rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ background: `${riskColor(c.riskScore)}1a`, color: riskColor(c.riskScore) }}
              >
                {c.riskScore}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
