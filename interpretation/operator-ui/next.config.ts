import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  // Cloud Run friendly standalone output
  output: "standalone",
};

export default config;
