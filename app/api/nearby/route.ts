import { NextRequest, NextResponse } from "next/server";
import { nearbyCompanies } from "@/lib/data";
import type { NearbyResult } from "@/lib/types";

export function GET(req: NextRequest) {
  try {
    const id = (req.nextUrl.searchParams.get("id") ?? "").slice(0, 40);
    const { scope, items } = nearbyCompanies(id, 10);
    const results: NearbyResult[] = items.map((c) => ({
      id: c.id,
      bizName: c.biz_name,
      salary: c.cur_salary,
      members: c.cur_members,
      riskScore: c.risk_score,
      riskLabel: c.risk_label,
    }));
    return NextResponse.json({ scope, results });
  } catch {
    return NextResponse.json({ scope: "all", results: [] }, { status: 500 });
  }
}
