import type { NextConfig } from "next";

/** FastAPI 根地址；浏览器只访问 Next，由 rewrite 把 /api 转到此处，避免误打到 3000 上不存在的路由。 */
const backendOrigin = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
