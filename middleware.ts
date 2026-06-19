import { NextRequest, NextResponse } from "next/server";

// /api 경량 레이트리밋 (인스턴스 메모리 기반 토큰버킷 — 버스트/스크래핑 1차 방어).
// 분산 환경에선 인스턴스별이라 완벽하진 않으나 외부 의존 없이 남용을 크게 줄임.
const WINDOW = 10_000; // 10초
const LIMIT = 40; // 윈도우당 IP 허용 요청
const hits = new Map<string, { c: number; t: number }>();

export function middleware(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "anon").split(",")[0].trim();
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now - e.t > WINDOW) {
    hits.set(ip, { c: 1, t: now });
  } else {
    e.c++;
    if (e.c > LIMIT) {
      return new NextResponse(JSON.stringify({ error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "10" },
      });
    }
  }
  // 맵 무한 성장 방지(가벼운 정리)
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t > WINDOW) hits.delete(k);
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
