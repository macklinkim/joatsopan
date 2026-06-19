import type { MetadataRoute } from "next";

const BASE = "https://jotsopan.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/explore", "/monthly", "/memorial", "/awards", "/game"].map((p) => ({
    url: `${BASE}${p}`,
    changeFrequency: "monthly",
    priority: p === "" ? 1 : 0.7,
  }));
}
