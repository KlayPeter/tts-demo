import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*"],
  reactStrictMode: false,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
      config.resolve.alias = {
        ...config.resolve.alias,
        "onnxruntime-node$": false,
      };
    }
    return config;
  },
  turbopack: {
    // Add empty turbopack config to explicitly enable fallback
  },
};

export default nextConfig;
