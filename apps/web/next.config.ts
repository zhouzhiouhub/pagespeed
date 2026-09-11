import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN access during local development (e.g. http://172.x.x.x:3000)
  allowedDevOrigins: ["172.29.96.1"],
};

export default nextConfig;
