import path from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Allow LAN access during local development (e.g. http://172.x.x.x:3000)
  allowedDevOrigins: ["172.29.96.1"],
  // Monorepo: trace files from the repo root so workspace deps resolve.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;

initOpenNextCloudflareForDev();
