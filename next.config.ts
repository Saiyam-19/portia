import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["just-bash"],
  devIndicators: { position: 'bottom-right' },
  // Keep local research, lab state and environment files out of deployable
  // traces. The rule book is bundled through imports in src/lib/berthwise/rulebook/books.ts.
  outputFileTracingExcludes: {
    '/*': ['./output/**/*', './.local/**/*', './.git/**/*', './.vercel/**/*', './.env*', './backend/.env*', './docs/portia-reliability/evidence/**/*'],
  },
  outputFileTracingIncludes: {
    '/api/memory': ['./node_modules/just-bash/dist/**/*'],
    '/api/chat': ['./node_modules/just-bash/dist/**/*'],
    '/api/migration/chat': ['./node_modules/just-bash/dist/**/*'],
  },
};

export default nextConfig;
