import type { MetadataRoute } from "next";

// 실명 사업장 위험도 상세는 검색엔진 색인에서 제외(명예훼손/프라이버시 완화).
// 메인·탐색·코너 페이지는 색인 허용.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/company/", "/api/"] },
    ],
    sitemap: "https://jotsopan.vercel.app/sitemap.xml",
  };
}
