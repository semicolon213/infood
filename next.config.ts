import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components는 끈다. 거의 모든 화면이 로그인 세션(쿠키)을 읽는데,
  // 켜 두면 세션 읽기마다 <Suspense> 경계가 필요하다 (06_ARCHITECTURE 13장 ADR 11).
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
