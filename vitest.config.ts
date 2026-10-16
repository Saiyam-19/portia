import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { ensureProviderPatch } from "./scripts/patch-provider-cancellation.mjs";

ensureProviderPatch({checkOnly:true});

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: { root, include: ["tests/**/*.test.{ts,tsx}","tests/audit/**/*.audit.{ts,tsx}"], setupFiles:["tests/audit/no-network.ts"] },
});
