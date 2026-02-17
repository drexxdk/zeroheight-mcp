import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  turbopack: { root: process.cwd() },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "zeroheight-uploads.s3-accelerate.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "zeroheight-uploads.s3.eu-west-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "zeroheight-uploads.s3.eu-west-1.amazonaws.com",
      },
      { protocol: "https", hostname: "cdn.zeroheight.com" },
    ],
  },
};

export default nextConfig;
