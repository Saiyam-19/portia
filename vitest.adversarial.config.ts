import base from "./vitest.config";
import { defineConfig } from "vitest/config";
// Separate, visible blocking gate. Open findings intentionally fail; never
// relabel their failures as ordinary passing regression tests.
export default defineConfig({ ...base, test: { ...base.test, include: ["tests/adversarial/**/*.probe.ts"], maxWorkers: 1 } });
