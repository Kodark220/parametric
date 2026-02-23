import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  webpack(config, { isServer }) {
    // Ignore problematic thread-stream package imported by walletconnect/pino
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /thread-stream/ })
    );
    // alias the module to false so imports resolve to an empty module
    if (!config.resolve) config.resolve = {} as any;
    config.resolve.alias = {
      ...config.resolve.alias,
      'thread-stream': false,
      // also alias any subpath imports
      'thread-stream/*': false,
      '@walletconnect/universal-provider': false,
      '@walletconnect/ethereum-provider': false,
    };

    // during server build, mark walletconnect packages external to avoid pulling their deps
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        '@walletconnect/universal-provider',
        '@walletconnect/ethereum-provider',
        'thread-stream',
      ];
    }

    return config;
  },
};

export default nextConfig;
