import { NextRequest, NextResponse } from "next/server";
import { searchCompanies } from "@/lib/data";
import type { SearchResult } from "@/lib/types";

export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const results: SearchResult[] = searchCompanies(q, 10).map((c) => ({
    id: c.id,
    bizName: c.biz_name,
    bizNo: c.biz_no6,
    industry: c.industry_name,
    members: c.cur_members,
  }));
  return NextResponse.json({ results });
}
