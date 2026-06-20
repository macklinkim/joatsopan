"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const KEY = "jotso:compare";
type Item = { id: string; name: string };

export default function CompareTray() {
  const [items, setItems] = useState<Item[]>([]);
  const router = useRouter();

  useEffect(() => {
    const sync = () => {
      try {
        setItems(JSON.parse(localStorage.getItem(KEY) || "[]"));
      } catch {
        setItems([]);
      }
    };
    sync();
    window.addEventListener("compare-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("compare-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (items.length === 0) return null;

  const clear = () => {
    localStorage.setItem(KEY, "[]");
    window.dispatchEvent(new Event("compare-change"));
  };
  const go = () => router.push(`/compare?ids=${items.map((x) => x.id).join(",")}`);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-primary/10 bg-surface-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-container items-center gap-3 px-5 py-3 md:px-12">
        <span className="min-w-0 flex-1 truncate text-sm">
          <b className="tnum">{items.length}</b>곳 담음 · <span className="text-on-surface-variant">{items.map((x) => x.name).join(", ")}</span>
        </span>
        <button onClick={clear} className="shrink-0 rounded-lg border border-primary/15 px-3 py-1.5 text-sm hover:bg-surface-paper">비우기</button>
        <button onClick={go} disabled={items.length < 2} className="shrink-0 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-surface-paper disabled:opacity-40">
          비교하기
        </button>
      </div>
    </div>
  );
}
