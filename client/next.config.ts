import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Required for optimized Docker image
};

export default nextConfig;
