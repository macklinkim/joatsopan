// 차트 공용 툴팁 — LineChart/HireLeaveChart 공유(중복 제거).

// 한글(CJK)은 폭이 넓으므로 글자별 가중치로 글상자 너비 추정.
export function textWidth(s: string): number {
  return Array.from(s).reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 13 : 7.4), 0);
}

export function ChartTooltip({
  x, y, label, color, W, dy = 10,
}: {
  x: number; y: number; label: string; color: string; W: number; dy?: number;
}) {
  const w = textWidth(label) + 28;
  const h = 26;
  const tx = Math.max(4, Math.min(W - w - 4, x - w / 2));
  const ty = Math.max(2, y - h - dy);
  return (
    <g pointerEvents="none">
      <rect x={tx} y={ty} width={w} height={h} rx="6" fill="#1A1A1A" />
      <circle cx={tx + 11} cy={ty + h / 2} r="4" fill={color} />
      <text x={tx + 20} y={ty + h / 2 + 4.5} fontSize="12.5" fill="#fff" className="tnum">
        {label}
      </text>
    </g>
  );
}
