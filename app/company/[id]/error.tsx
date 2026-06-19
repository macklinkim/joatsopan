"use client";

import Link from "next/link";

export default function CompanyError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-container px-5 py-16 text-center md:px-12">
      <h1 className="font-head text-2xl font-bold">불러오지 못했습니다</h1>
      <p className="mt-2 text-sm text-on-surface-variant">
        일시적인 오류로 회사 정보를 표시하지 못했어요. 다시 시도해 주세요.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-surface-paper hover:opacity-90">
          다시 시도
        </button>
        <Link href="/" className="rounded-lg border border-primary/15 px-5 py-2.5 text-sm font-medium hover:bg-surface-white">
          홈으로
        </Link>
      </div>
    </main>
  );
}
