"use client";

import { useState } from "react";
import { ymLabel } from "@/lib/format";
import { useChartWidth } from "./useChartWidth";
import { ChartTooltip } from "./chartTooltip";

interface Row {
  ym: string;
  hires: number;
  leaves: number;
}

type Hover = { i: number; kind: "hire" | "leave" } | null;

export default function HireLeaveChart({ data }: { data: Row[] }) {
  const [hover, setHover] = useState<Hover>(null);
  const { ref, w: W } = useChartWidth(640);
  const compact = W < 420;
  const H = 240,
    pad = { t: 24, r: 14, b: 32, l: 42 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxV = Math.max(1, ...data.map((d) => Math.max(d.hires, d.leaves)));
  const group = iw / data.length;
  const bw = Math.min(16, group * 0.36);
  const y = (v: number) => pad.t + ih - (ih * v) / maxV;

  const ticks = 3;
  const gridYs = Array.from({ length: ticks + 1 }, (_, i) => (maxV * i) / ticks);
  const labelEvery = compact ? 4 : 3;

  const set = (i: number, kind: "hire" | "leave") => setHover({ i, kind });

  const active =
    hover &&
    (() => {
      const d = data[hover.i];
      const cx = pad.l + group * hover.i + group / 2;
      const val = hover.kind === "hire" ? d.hires : d.leaves;
      const bx = hover.kind === "hire" ? cx - bw - 1 + bw / 2 : cx + 1 + bw / 2;
      const label = `${ymLabel(d.ym)} · ${val.toLocaleString()}명 ${hover.kind === "hire" ? "입사" : "퇴사"}`;
      return { x: bx, y: y(val), label, color: hover.kind === "hire" ? "#2A8D5C" : "#D8362A" };
    })();

  return (
    <div ref={ref} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden="true" onPointerLeave={() => setHover(null)}>
        {/* y gridlines + labels */}
        {gridYs.map((gv, i) => (
          <g key={i}>
            <line x1={pad.l} y1={y(gv)} x2={W - pad.r} y2={y(gv)} stroke={i === 0 ? "#c4c7c7" : "#e3e5e5"} strokeWidth="1" />
            <text x={pad.l - 7} y={y(gv) + 4} textAnchor="end" fontSize="11" fill="#747878" className="tnum">
              {Math.round(gv).toLocaleString()}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + group * i + group / 2;
          const hoveringMonth = hover?.i === i;
          return (
            <g key={d.ym}>
              {hoveringMonth && (
                <rect x={pad.l + group * i} y={pad.t} width={group} height={ih} fill="#1A1A1A" opacity="0.04" />
              )}
              <rect
                x={cx - bw - 1}
                y={y(d.hires)}
                width={bw}
                height={y(0) - y(d.hires)}
                fill="#2A8D5C"
                rx="1.5"
                opacity={hover && !(hoveringMonth && hover.kind === "hire") ? 0.45 : 1}
                onPointerEnter={() => set(i, "hire")}
                onPointerDown={() => set(i, "hire")}
                style={{ cursor: "pointer" }}
              />
              <rect
                x={cx + 1}
                y={y(d.leaves)}
                width={bw}
                height={y(0) - y(d.leaves)}
                fill="#D8362A"
                rx="1.5"
                opacity={hover && !(hoveringMonth && hover.kind === "leave") ? 0.45 : 1}
                onPointerEnter={() => set(i, "leave")}
                onPointerDown={() => set(i, "leave")}
                style={{ cursor: "pointer" }}
              />
              {(i % labelEvery === 0 || (i === data.length - 1 && i % labelEvery >= 2)) && (
                <text x={cx} y={H - 10} textAnchor="middle" fontSize="11" fill="#747878">
                  {ymLabel(d.ym)}
                </text>
              )}
            </g>
          );
        })}
        {/* legend */}
        <g>
          <rect x={pad.l} y={5} width="10" height="10" fill="#2A8D5C" rx="1.5" />
          <text x={pad.l + 15} y={14} fontSize="11" fill="#444748">입사</text>
          <rect x={pad.l + 50} y={5} width="10" height="10" fill="#D8362A" rx="1.5" />
          <text x={pad.l + 65} y={14} fontSize="11" fill="#444748">퇴사</text>
        </g>
        {/* 툴팁 */}
        {active && <ChartTooltip x={active.x} y={active.y} label={active.label} color={active.color} W={W} dy={8} />}
      </svg>
      {/* 스크린리더용 데이터 표 */}
      <table className="sr-only">
        <caption>월별 입사·퇴사</caption>
        <thead>
          <tr><th>월</th><th>입사</th><th>퇴사</th></tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.ym}>
              <td>{ymLabel(d.ym)}</td>
              <td>{d.hires.toLocaleString()}명</td>
              <td>{d.leaves.toLocaleString()}명</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
