import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Real type safety — do not ignore build errors.
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;