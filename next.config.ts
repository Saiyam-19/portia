import type { NextConfig } from "next";
import { wgslTurbopackRule } from "@vgpu/wgsl/next";

// Every route that builds the agent can run a turn (the chat routes start and resume
// them; /api/libfx continues them from the queue), so each needs the tariff files the
// workspace mounts at /ports and just-bash's runtime assets.
const agentAssets = ["./data/ports/**/*", "./node_modules/just-bash/dist/**/*"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["just-bash"],
  devIndicators: { position: "bottom-right" },
  // The landing page's .wgsl imports are prepared at build time, so the browser never ships the WGSL parser.
  turbopack: { rules: { "*.wgsl": wgslTurbopackRule() } },
  outputFileTracingIncludes: {
    "/api/chat": agentAssets,
    "/api/chat/*": agentAssets,
    "/api/libfx": agentAssets,
  },
};

export default nextConfig;
