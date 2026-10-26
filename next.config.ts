import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["just-bash"],
  devIndicators: { position: 'bottom-right' },
  // Keep local research, lab state and environment files out of deployable
  // traces. The rule book is bundled through imports in src/lib/berthwise/rulebook/books.ts;
  // the chat routes read the ports' documents (Markdown copies) from data/sources at runtime.
  outputFileTracingExcludes: {
    '/*': ['./output/**/*', './.local/**/*', './.git/**/*', './.vercel/**/*', './.env*', './backend/.env*', './data/sources/**/*.pdf', './data/sources/**/*.html'],
  },
  outputFileTracingIncludes: {
    '/api/memory': ['./node_modules/just-bash/dist/**/*'],
    '/api/chat': ['./data/sources/**/*.md', './data/sources/**/sources.json', './node_modules/just-bash/dist/**/*'],
    '/api/migration/chat': ['./data/sources/**/*.md', './data/sources/**/sources.json', './node_modules/just-bash/dist/**/*'],
  },
};

export default nextConfig;
