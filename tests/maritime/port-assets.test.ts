import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import nextConfig from "../../next.config";
import { PORT_ASSET_MANIFEST, SUPPORTED_PORTS, loadPortTariffDocuments } from "../../src/lib/maritime/ports";

it("matches every tariff checksum and traces the assets into the chat route", async () => {
  expect(Object.keys(PORT_ASSET_MANIFEST)).toHaveLength(17);
  expect(SUPPORTED_PORTS).toHaveLength(16);
  for (const [relative, checksum] of Object.entries(PORT_ASSET_MANIFEST)) {
    const contents = await readFile(new URL(`../../data/ports/${relative}`, import.meta.url));
    expect(createHash("sha256").update(contents).digest("hex"), relative).toBe(checksum);
  }
  expect(nextConfig.outputFileTracingIncludes?.["/api/chat"]).toContain("./data/ports/**/*");
});

it("loads only allowlisted port slugs, under /ports", async () => {
  const documents = await loadPortTariffDocuments("bpcl-liquid-cargo-jetty");
  expect(documents.map(document => document.path)).toEqual([
    "/ports/bpcl-liquid-cargo-jetty/BPCL Liquid Cargo Jetty SOR.md",
    "/ports/bpcl-liquid-cargo-jetty/Lighterage.md",
  ]);
  await expect(loadPortTariffDocuments("../backend")).rejects.toThrow(/Unsupported port/);
});
