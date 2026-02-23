import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  webpack(config, { isServer }) {
    // Alias problematic walletconnect/thread-stream modules out of the bundle.
    if (!config.resolve) config.resolve = {} as any;
    config.resolve.alias = {
      ...config.resolve.alias,
      "thread-stream": false,
      "thread-stream/*": false,
      "@walletconnect/universal-provider": false,
      "@walletconnect/ethereum-provider": false,
    };

    // During server build, mark walletconnect packages external.
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        "@walletconnect/universal-provider",
        "@walletconnect/ethereum-provider",
        "thread-stream",
      ];
    }

    return config;
  },
};

export default nextConfig;
