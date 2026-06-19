"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/lib/types";

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const ac = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ac.signal });
        if (!res.ok) throw new Error(`search ${res.status}`);
        const json = await res.json();
        setResults(json.results ?? []);
        setOpen(true);
        setActive(-1);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setResults([]);
      }
    }, 180);
    return () => {
      clearTimeout(id);
      ac.abort(); // 직전 요청 취소 → stale 응답 덮어쓰기 방지
    };
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (id: string) => router.push(`/company/${id}`);

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0) go(results[active].id);
      else if (results[0]) go(results[0].id);
    }
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-center gap-3 rounded-lg border border-primary/15 bg-surface-white px-5 py-4 shadow-float focus-within:border-primary">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#747878" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKey}
          placeholder="회사명 또는 사업자번호 검색 (예: 소프트)"
          aria-label="회사 검색"
          className="w-full bg-transparent text-base outline-none placeholder:text-outline"
        />
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-primary/10 bg-surface-white shadow-float">
          {results.map((r, i) => (
            <li key={r.id}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r.id)}
                className={`flex w-full items-center gap-2 px-5 py-3 text-left ${
                  active === i ? "bg-surface-paper" : ""
                }`}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate">
                    <span className="font-medium">{r.bizName}</span>
                    <span className="ml-2 text-xs text-on-surface-variant">{r.industry}</span>
                  </span>
                  <span className="truncate text-xs text-outline">
                    {[r.sigungu, r.dong].filter(Boolean).join(" ") || "지역 미상"}
                  </span>
                </span>
                <span className="tnum shrink-0 text-xs text-outline">{r.members.toLocaleString()}명</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && q.trim() && results.length === 0 && (
        <div className="absolute z-20 mt-2 w-full rounded-lg border border-primary/10 bg-surface-white px-5 py-4 text-sm text-on-surface-variant shadow-float">
          검색 결과가 없습니다.
        </div>
      )}
    </div>
  );
}
