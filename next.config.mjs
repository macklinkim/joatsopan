/** @type {import('next').NextConfig} */
const nextConfig = {
  // 실데이터 JSON(약 44MB)을 서버리스 번들에 포함시켜 런타임 fs 로드가 가능하도록.
  outputFileTracingIncludes: {
    "/**": ["./data/companies.json"],
    "/company/[id]/opengraph-image": ["./assets/Pretendard-Bold.otf"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
