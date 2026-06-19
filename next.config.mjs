/** @type {import('next').NextConfig} */
const nextConfig = {
  // 실데이터 JSON(8MB)을 서버리스 번들에 포함시켜 런타임 fs 로드가 가능하도록.
  outputFileTracingIncludes: {
    "/**": ["./data/companies.json"],
  },
};

export default nextConfig;
