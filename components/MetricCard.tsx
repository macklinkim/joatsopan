export default function MetricCard({
  label,
  value,
  sub,
  contrib,
  danger,
}: {
  label: string;
  value: string;
  sub: string;
  contrib: number;
  danger?: boolean;
}) {
  const pos = contrib > 0;
  return (
    <div className="rounded-lg border border-primary/[0.08] bg-surface-white p-4 flex flex-col gap-1">
      <div className="text-xs text-on-surface-variant">{label}</div>
      <div className="tnum text-2xl font-semibold leading-tight" style={{ color: danger ? "#D8362A" : "#1A1A1A" }}>
        {value}
      </div>
      <div className="text-xs text-on-surface-variant">{sub}</div>
      <div className="mt-1">
        <span
          className="tnum inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
          style={
            pos
              ? { background: "rgba(216,54,42,0.10)", color: "#C92B20" }
              : { background: "rgba(42,141,92,0.10)", color: "#1F7A4D" }
          }
        >
          {pos ? `+${contrib}` : "0"}
        </span>
        <span className="ml-1.5 text-[11px] text-outline">위험도 기여</span>
      </div>
    </div>
  );
}
