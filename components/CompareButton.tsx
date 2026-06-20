"use client";

import { useEffect, useState } from "react";

const KEY = "jotso:compare";
const MAX = 4;

type Item = { id: string; name: string };

function read(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function write(items: Item[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("compare-change"));
}

export default function CompareButton({ id, name }: { id: string; name: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(read().some((x) => x.id === id));
    sync();
    window.addEventListener("compare-change", sync);
    return () => window.removeEventListener("compare-change", sync);
  }, [id]);

  const toggle = () => {
    const items = read();
    if (items.some((x) => x.id === id)) {
      write(items.filter((x) => x.id !== id));
    } else {
      if (items.length >= MAX) {
        alert(`비교는 최대 ${MAX}곳까지 가능합니다.`);
        return;
      }
      write([...items, { id, name }]);
    }
  };

  return (
    <button
      onClick={toggle}
      aria-pressed={on}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${
        on ? "border-primary bg-primary text-surface-paper" : "border-primary/15 hover:bg-surface-paper"
      }`}
    >
      {on ? "✓ 비교 담음" : "+ 비교 담기"}
    </button>
  );
}
