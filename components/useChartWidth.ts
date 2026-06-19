"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 컨테이너의 실제 픽셀 폭을 측정해 SVG viewBox 폭으로 쓰기 위한 훅.
 * 폭이 줄어도 viewBox가 따라 줄어 글자/획이 실제 px로 또렷하게 유지된다
 * (고정 viewBox를 width:100%로 늘릴 때 생기는 텍스트 축소 문제를 피함).
 */
export function useChartWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.max(260, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}
