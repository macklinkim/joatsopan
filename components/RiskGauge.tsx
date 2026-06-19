import { riskTextColor } from "@/lib/format";

function polar(cx: number, cy: number, r: number, valPct: number) {
  // 0 → 왼쪽(180°), 100 → 오른쪽(0°), 상단 반원
  const theta = (Math.PI * (180 - valPct * 1.8)) / 180;
  return { x: cx + r * Math.cos(theta), y: cy - r * Math.sin(theta) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${r} ${r} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

export default function RiskGauge({
  score,
  label,
}: {
  score: number;
  label: string;
}) {
  const cx = 130,
    cy = 130,
    r = 104;
  const p = polar(cx, cy, r - 14, Math.max(0, Math.min(100, score)));
  return (
    <svg
      viewBox="0 0 260 156"
      width="100%"
      role="img"
      aria-label={`위험도 ${score}점 / 100, 등급 ${label}`}
      className="max-w-[280px]"
    >
      {/* 3단계 트랙: 녹 → 황 → 적 */}
      <path d={arc(cx, cy, r, 0, 20)} stroke="#2A8D5C" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d={arc(cx, cy, r, 20, 50)} stroke="#FEE500" strokeWidth="14" fill="none" />
      <path d={arc(cx, cy, r, 50, 100)} stroke="#D8362A" strokeWidth="14" fill="none" strokeLinecap="round" />
      {/* 포인터 */}
      <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#1A1A1A" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6" fill="#1A1A1A" />
      {/* 숫자 */}
      <text
        x={cx}
        y={cy - 26}
        textAnchor="middle"
        style={{ fontFamily: "var(--font-jetbrains), monospace", fontWeight: 700 }}
        fontSize="40"
        fill={riskTextColor(score)}
      >
        {score}
      </text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="12" fill="#444748">
        위험도 / 100
      </text>
    </svg>
  );
}
