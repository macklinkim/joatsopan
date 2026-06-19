"use client";

import { useState } from "react";

export default function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    // 모바일은 네이티브 공유, 데스크톱은 링크 복사
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* 취소 시 복사로 폴백 */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 무시 */
    }
  };

  return (
    <button
      onClick={share}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/15 px-3 py-1.5 text-sm font-medium hover:bg-surface-paper"
      aria-label="이 회사 공유하기"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round" />
      </svg>
      {copied ? "복사됨!" : "공유"}
    </button>
  );
}
