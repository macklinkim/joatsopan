"use client";

import { useState } from "react";
import { ymLabel } from "@/lib/format";
import { useChartWidth } from "./useChartWidth";

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
  const [hi, setHi] = useState<number | null>(null);
  const { ref, w: W } = useChartWidth(640);
  const compact = W < 420; // 모바일 폭이면 라벨 간격을 넓혀 겹침 방지
  const H = 210,
    pad = { t: 20, r: 14, b: 30, l: 50 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const vals = data.map((d) => d.value);
  const maxData = Math.max(...vals, 1);
  const minData = Math.min(...vals);
  // baseline이 데이터보다 크게 위에 있으면 스케일에서 제외(데이터 추이를 살림).
  const baselineInScale = baseline !== undefined && baseline <= maxData * 1.15;
  // 변동이 작아도 추이가 보이도록 0 대신 데이터 하단에 약간의 여유를 둔 바닥 사용.
  const span = maxData - minData;
  const minV = span === 0 ? 0 : Math.max(0, minData - span * 0.35);
  const maxV = (baselineInScale ? Math.max(maxData, baseline!) : maxData) * 1.08 || 1;
  const x = (i: number) => pad.l + (iw * i) / Math.max(1, data.length - 1);
  const y = (v: number) => pad.t + ih - (ih * (v - minV)) / (maxV - minV || 1);

  const path = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const area = `${path} L ${x(data.length - 1).toFixed(1)} ${y(minV).toFixed(1)} L ${x(0).toFixed(1)} ${y(minV).toFixed(1)} Z`;
  const last = data[data.length - 1];

  const ticks = 3;
  const gridYs = Array.from({ length: ticks + 1 }, (_, i) => minV + ((maxV - minV) * i) / ticks);
  const labelEvery = compact ? 4 : 3;

  const cw = iw / Math.max(1, data.length - 1); // 히트 컬럼 폭

  return (
    <div ref={ref} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="시계열 추이 차트" onPointerLeave={() => setHi(null)}>
        {/* gridlines */}
        {gridYs.map((gv, i) => (
          <g key={i}>
            <line x1={pad.l} y1={y(gv)} x2={W - pad.r} y2={y(gv)} stroke="#e3e5e5" strokeWidth="1" />
            <text x={pad.l - 7} y={y(gv) + 4} textAnchor="end" fontSize="11" fill="#747878" className="tnum">
              {Math.round(gv).toLocaleString()}
            </text>
          </g>
        ))}
        {/* baseline (업종 중앙값 등) — 범위 안이면 라인, 범위 위면 상단에 ▲ 표기 */}
        {baseline !== undefined && baselineInScale && (
          <>
            <line x1={pad.l} y1={y(baseline)} x2={W - pad.r} y2={y(baseline)} stroke="#D8362A" strokeWidth="1.5" strokeDasharray="5 4" />
            {baselineLabel && (
              <text x={W - pad.r} y={y(baseline) - 5} textAnchor="end" fontSize="11" fill="#D8362A">
                {baselineLabel} {Math.round(baseline).toLocaleString()}
              </text>
            )}
          </>
        )}
        {baseline !== undefined && !baselineInScale && (
          <>
            <line x1={pad.l} y1={pad.t} x2={W - pad.r} y2={pad.t} stroke="#D8362A" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x={W - pad.r} y={pad.t - 5} textAnchor="end" fontSize="11" fill="#D8362A">
              ▲ {baselineLabel ?? "기준"} {Math.round(baseline).toLocaleString()}
            </text>
          </>
        )}
        <path d={area} fill={color} opacity="0.06" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* 호버 가이드 + 강조점 */}
        {hi !== null && (
          <>
            <line x1={x(hi)} y1={pad.t} x2={x(hi)} y2={pad.t + ih} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
            <circle cx={x(hi)} cy={y(data[hi].value)} r="5.5" fill="#fff" stroke={color} strokeWidth="2.5" />
          </>
        )}
        {/* 마지막 점 강조 (호버 중 아니면) */}
        {hi === null && <circle cx={x(data.length - 1)} cy={y(last.value)} r="4.5" fill={color} />}

        {/* x labels (간격 두고) */}
        {data.map((d, i) =>
          i % labelEvery === 0 || (i === data.length - 1 && i % labelEvery >= 2) ? (
            <text key={d.ym} x={x(i)} y={H - 9} textAnchor="middle" fontSize="11" fill="#747878">
              {ymLabel(d.ym)}
            </text>
          ) : null
        )}
        {unit && (
          <text x={pad.l - 2} y={13} fontSize="11" fill="#747878">
            ({unit})
          </text>
        )}

        {/* 투명 히트 컬럼 — 마우스 호버 + 터치 탭 모두 지원 */}
        {data.map((d, i) => (
          <rect
            key={`hit-${d.ym}`}
            x={x(i) - cw / 2}
            y={pad.t}
            width={cw}
            height={ih}
            fill="transparent"
            onPointerEnter={() => setHi(i)}
            onPointerDown={() => setHi(i)}
            style={{ cursor: "pointer" }}
          />
        ))}

        {/* 툴팁 */}
        {hi !== null && (
          <LineTooltip
            x={x(hi)}
            y={y(data[hi].value)}
            label={`${ymLabel(data[hi].ym)} · ${Math.round(data[hi].value).toLocaleString()}${unit}`}
            color={color}
            W={W}
          />
        )}
      </svg>
    </div>
  );
}

// 한글(CJK)은 폭이 넓으므로 글자별로 가중치를 줘서 글상자 너비를 추정.
function textWidth(s: string) {
  return Array.from(s).reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 13 : 7.4), 0);
}

function LineTooltip({ x, y, label, color, W }: { x: number; y: number; label: string; color: string; W: number }) {
  const w = textWidth(label) + 28;
  const h = 26;
  const tx = Math.max(4, Math.min(W - w - 4, x - w / 2));
  const ty = Math.max(2, y - h - 10);
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
