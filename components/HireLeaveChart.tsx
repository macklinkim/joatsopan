import { ymLabel } from "@/lib/format";

interface Row {
  ym: string;
  hires: number;
  leaves: number;
}

export default function HireLeaveChart({ data }: { data: Row[] }) {
  const W = 640,
    H = 220,
    pad = { t: 16, r: 16, b: 28, l: 36 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxV = Math.max(1, ...data.map((d) => Math.max(d.hires, d.leaves)));
  const group = iw / data.length;
  const bw = Math.min(10, group / 2.6);
  const y = (v: number) => pad.t + ih - (ih * v) / maxV;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="입사·퇴사 흐름 차트">
      <line x1={pad.l} y1={y(0)} x2={W - pad.r} y2={y(0)} stroke="#c4c7c7" />
      {data.map((d, i) => {
        const cx = pad.l + group * i + group / 2;
        return (
          <g key={d.ym}>
            <rect x={cx - bw - 1} y={y(d.hires)} width={bw} height={y(0) - y(d.hires)} fill="#2A8D5C" rx="1" />
            <rect x={cx + 1} y={y(d.leaves)} width={bw} height={y(0) - y(d.leaves)} fill="#D8362A" rx="1" />
            {(i % 3 === 0 || i === data.length - 1) && (
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="#747878">
                {ymLabel(d.ym)}
              </text>
            )}
          </g>
        );
      })}
      {/* legend */}
      <g>
        <rect x={pad.l} y={2} width="9" height="9" fill="#2A8D5C" rx="1" />
        <text x={pad.l + 13} y={10} fontSize="10" fill="#444748">입사</text>
        <rect x={pad.l + 44} y={2} width="9" height="9" fill="#D8362A" rx="1" />
        <text x={pad.l + 57} y={10} fontSize="10" fill="#444748">퇴사</text>
      </g>
    </svg>
  );
}
