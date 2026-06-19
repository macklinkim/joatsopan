import Link from "next/link";
import { awards } from "@/lib/data";
import { riskColor, riskTextColor } from "@/lib/format";

export const metadata = { title: "좋소 시상식 — 좋소판별기" };

export default function AwardsPage() {
  const winners = awards();
  return (
    <main className="mx-auto max-w-container px-5 py-8 md:px-12">
      <h1 className="font-head text-3xl font-bold tracking-[-0.01em]">좋소 시상식</h1>
      <p className="mt-2 mb-6 text-sm text-on-surface-variant">
        부문별 1위 — 영광의(?) 수상 사업장
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {winners.map((w) => (
          <Link
            key={w.key}
            href={`/company/${w.company.id}`}
            className="rounded-lg border border-primary/[0.08] bg-surface-white p-5 transition-colors hover:border-primary/20"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-head text-lg font-semibold">{w.title}</h2>
              <span
                className="tnum rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ background: `${riskColor(w.company.risk_score)}1a`, color: riskTextColor(w.company.risk_score) }}
              >
                {w.company.risk_score}
              </span>
            </div>
            <p className="mt-1 text-xs text-on-surface-variant">{w.desc}</p>
            <p className="mt-4 truncate font-head text-xl font-bold">{w.company.biz_name}</p>
            <p className="mt-1 text-sm text-on-surface-variant">
              {w.company.sigungu} {w.company.dong} · <span className="tnum font-semibold text-primary">{w.stat}</span>
            </p>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-outline">
        ※ 공공데이터(국민연금) 기반 추정치이며 참고용입니다. 특정 기업 비방 목적이 아닙니다.
      </p>
    </main>
  );
}
