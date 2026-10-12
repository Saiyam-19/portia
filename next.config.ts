import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["just-bash"],
  devIndicators: { position: 'bottom-right' },
  outputFileTracingIncludes: {
    '/api/memory': ['./node_modules/just-bash/dist/**/*'],
    '/api/chat': ['./data/ports/**/*', './node_modules/just-bash/dist/**/*'],
    '/api/migration/chat': ['./data/ports/**/*', './node_modules/just-bash/dist/**/*'],
  },
};

export default nextConfig;
