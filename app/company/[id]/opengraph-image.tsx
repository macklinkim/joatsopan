import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";
import { getCompany } from "@/lib/data";
import { riskTextColor } from "@/lib/format";

export const runtime = "nodejs"; // data.ts가 fs 사용 → edge 불가
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "좋소판별기 회사 위험도 카드";

const fontData = fs.readFileSync(path.join(process.cwd(), "assets/Pretendard-Bold.otf"));

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getCompany(id);
  const name = c?.biz_name ?? "회사를 찾을 수 없음";
  const score = c?.risk_score ?? 0;
  const label = c?.risk_label ?? "—";
  const color = riskTextColor(score);
  const sub = c ? `${c.sigungu} ${c.dong} · ${c.industry_name}` : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", background: "#F7F6F0", padding: 64,
          fontFamily: "Pretendard", color: "#1A1A1A",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 30, color: "#747878" }}>
          좋소판별기<span style={{ color: "#D8362A" }}>.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, color: "#747878", marginBottom: 8 }}>{sub}</div>
          <div style={{ fontSize: 64, lineHeight: 1.1, maxWidth: 760 }}>{name}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 28, color: "#747878" }}>위험도</div>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ fontSize: 140, lineHeight: 1, color }}>{score}</span>
              <span style={{ fontSize: 40, color: "#747878", marginLeft: 12 }}>/ 100</span>
            </div>
          </div>
          <div style={{ fontSize: 44, color, padding: "10px 28px", border: `3px solid ${color}`, borderRadius: 18 }}>
            {label}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Pretendard", data: fontData, style: "normal", weight: 700 }] }
  );
}
