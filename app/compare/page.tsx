import Link from "next/link";
import { getCompany } from "@/lib/data";
import { won, num, riskColor, riskTextColor } from "@/lib/format";
import type { Company } from "@/lib/types";

export const metadata = { title: "회사 비교 — 좋소판별기" };

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const sp = await searchParams;
  const ids = (sp.ids || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const companies = ids.map(getCompany).filter(Boolean) as Company[];

  if (companies.length < 2) {
    return (
      <main className="mx-auto max-w-container px-5 py-12 text-center md:px-12">
        <h1 className="font-head text-2xl font-bold">회사 비교</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          비교할 회사가 부족합니다. 회사 상세에서 “비교 담기”로 2곳 이상 선택해 주세요.
        </p>
        <Link href="/explore" className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-surface-paper">
          기업 탐색으로
        </Link>
      </main>
    );
  }

  // 행별 최선값 강조용
  const minRisk = Math.min(...companies.map((c) => c.risk_score));
  const maxSalary = Math.max(...companies.map((c) => c.cur_salary));
  const minTurnover = Math.min(...companies.map((c) => c.cur_turnover));

  const Row = ({ label, render }: { label: string; render: (c: Company) => React.ReactNode }) => (
    <tr className="border-t border-primary/[0.06]">
      <th className="whitespace-nowrap py-3 pr-4 text-left text-xs font-medium text-on-surface-variant align-top">{label}</th>
      {companies.map((c) => (
        <td key={c.id} className="py-3 pr-4 align-top text-sm">{render(c)}</td>
      ))}
    </tr>
  );

  return (
    <main className="mx-auto max-w-container px-5 py-8 md:px-12">
      <h1 className="font-head text-3xl font-bold tracking-[-0.01em]">회사 비교</h1>
      <p className="mt-2 mb-6 text-sm text-on-surface-variant">{companies.length}곳 나란히 비교 · 초록 강조 = 항목별 더 나은 값</p>

      <div className="overflow-x-auto rounded-lg border border-primary/[0.08] bg-surface-white">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr>
              <th className="w-28" />
              {companies.map((c) => (
                <td key={c.id} className="p-4 align-top">
                  <Link href={`/company/${c.id}`} className="font-head font-semibold hover:text-primary">{c.biz_name}</Link>
                  <div className="mt-1 text-xs text-on-surface-variant">{c.sigungu} {c.dong}</div>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="위험도" render={(c) => (
              <span className="tnum font-bold" style={{ color: riskTextColor(c.risk_score) }}>
                {c.risk_score} <span className="text-xs font-medium">{c.risk_label}</span>
                {c.risk_score === minRisk && <span className="ml-1 text-risk-safe">✓</span>}
              </span>
            )} />
            <Row label="추정 평균연봉" render={(c) => (
              <span className="tnum font-semibold">
                {won(c.cur_salary)}{c.cur_salary === maxSalary && <span className="ml-1 text-safe-strong">✓</span>}
              </span>
            )} />
            <Row label="회전율" render={(c) => (
              <span className="tnum">{c.cur_turnover}%{c.cur_turnover === minTurnover && <span className="ml-1 text-safe-strong">✓</span>}</span>
            )} />
            <Row label="직원 수" render={(c) => <span className="tnum">{num(c.cur_members)}명</span>} />
            <Row label="업종" render={(c) => <span className="text-xs">{c.industry_name}</span>} />
            <Row label="휴·폐업" render={(c) => (c.is_closed ? <span style={{ color: riskColor(100) }}>휴폐업 신호</span> : "정상 영업")} />
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-center text-xs text-outline">※ 공공데이터(국민연금) 기반 추정치 · 참고용</p>
    </main>
  );
}
