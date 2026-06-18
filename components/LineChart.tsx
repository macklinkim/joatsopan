import { ymLabel } from "@/lib/format";

interface Pt {
  ym: string;
  value: number;
}

export default function LineChart({
  data,
  color = "#1A1A1A",
  unit = "",
  baseline,
  baselineLabel,
}: {
  data: Pt[];
  color?: string;
  unit?: string;
  baseline?: number;
  baselineLabel?: string;
}) {
  const W = 640,
    H = 220,
    pad = { t: 16, r: 16, b: 28, l: 44 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const vals = data.map((d) => d.value);
  const maxV = Math.max(...vals, baseline ?? 0) * 1.1 || 1;
  const minV = 0;
  const x = (i: number) => pad.l + (iw * i) / Math.max(1, data.length - 1);
  const y = (v: number) => pad.t + ih - (ih * (v - minV)) / (maxV - minV);

  const path = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const area = `${path} L ${x(data.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const last = data[data.length - 1];

  const ticks = 3;
  const gridYs = Array.from({ length: ticks + 1 }, (_, i) => (maxV * i) / ticks);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="시계열 추이 차트">
      {/* gridlines */}
      {gridYs.map((gv, i) => (
        <g key={i}>
          <line x1={pad.l} y1={y(gv)} x2={W - pad.r} y2={y(gv)} stroke="#c4c7c7" strokeWidth="1" />
          <text x={pad.l - 6} y={y(gv) + 4} textAnchor="end" fontSize="10" fill="#747878" className="tnum">
            {Math.round(gv).toLocaleString()}
          </text>
        </g>
      ))}
      {/* baseline (업종 중앙값 등) */}
      {baseline !== undefined && (
        <>
          <line x1={pad.l} y1={y(baseline)} x2={W - pad.r} y2={y(baseline)} stroke="#D8362A" strokeWidth="1.5" strokeDasharray="5 4" />
          {baselineLabel && (
            <text x={W - pad.r} y={y(baseline) - 5} textAnchor="end" fontSize="10" fill="#D8362A">
              {baselineLabel}
            </text>
          )}
        </>
      )}
      <path d={area} fill={color} opacity="0.06" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* 마지막 점 강조 */}
      <circle cx={x(data.length - 1)} cy={y(last.value)} r="4.5" fill={color} />
      {/* x labels (간격 두고) */}
      {data.map((d, i) =>
        i % 3 === 0 || i === data.length - 1 ? (
          <text key={d.ym} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#747878">
            {ymLabel(d.ym)}
          </text>
        ) : null
      )}
      {unit && (
        <text x={pad.l} y={12} fontSize="10" fill="#747878">
          ({unit})
        </text>
      )}
    </svg>
  );
}
