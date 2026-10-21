import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { lookupTariff } from "../../src/lib/portia/tariffs";
import { QuoteSession } from "../../src/lib/portia/session";

vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
afterEach(() => vi.mocked(readFile).mockReset());
const berth = { port: "BMCT", charges: ["berth"], callDate: "2026-10-18", gt: "10000", service: "foreign", durationMinutes: "59" };

it("preserves accepted source precision and reconciles minutes with timestamp instants", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(readFile).mockImplementation(actual.readFile);
  const result = await lookupTariff({ ...berth, gt: "10000.12345678901234567890123456789012345678901", berthStart: "2026-10-18T10:00:00+05:30", berthEnd: "2026-10-18T10:59:00+05:30" });
  expect(result.status, result.body).toBe("calculated");
  expect(result.questions).toEqual([]);
  expect(result.totals?.[0].amount).toBe("23780.29358024427135802442713580244271358024426578");
  const conflicting = await lookupTariff({ ...berth, durationMinutes: "58", berthStart: "2026-10-18T10:00:00+05:30", berthEnd: "2026-10-18T10:59:00+05:30" });
  expect(conflicting.status).toBe("unresolved");
  expect(conflicting.totals).toBeUndefined();
});

it("keeps verified berth amounts when the independent MUC source cannot validate", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(readFile).mockImplementation((async (...args: Parameters<typeof readFile>) =>
    String(args[0]).endsWith("nldsl-muc-2024-2027.pdf") ? Buffer.from("invalid source bytes") : actual.readFile(...args)) as typeof readFile);
  const result = await lookupTariff({ ...berth, charges: ["berth", "muc"], containerCount: "1", cargoTraffic: "exim" });
  expect(result.status).toBe("unresolved");
  expect(result.totals?.[0].amount).toBe("23780");
  expect(result.totals?.[0].chargeIds).toEqual(["berth:ordinary-foreign:gt-hour"]);
  expect(result.issues).toContainEqual(expect.objectContaining({ service: "muc", code: "component-validation-failed" }));
  expect(result.questions).toEqual([]);
});

it("preserves independent KLL pilotage while berth duration and combined GST remain unresolved", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(readFile).mockImplementation(actual.readFile);
  const result = await lookupTariff({ port: "KLL", charges: ["berth", "pilotage", "gst"], callDate: "2026-10-18", gt: "10000",
    scheduledBerthingDate: "2026-10-18", fxDate: "2026-10-17", fxInrPerUsd: "80", fxBasis: "SBI-TT-selling" });
  expect(result.status).toBe("unresolved");
  expect(result.totals?.[0].amount).toBe("160000");
  expect(result.totals?.[0].chargeIds).toEqual(["pilotage:kll:capped"]);
  expect(result.issues).toContainEqual(expect.objectContaining({ code: "kll-incomplete-tax-base" }));
});

it("requires authored base-only scope and retains the original adjustment fact", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(readFile).mockImplementation(actual.readFile);
  const statement = "For BMCT show the unadjusted base only.";
  const session = new QuoteSession("base-only"); await session.initialize([{ role: "user", content: statement }]);
  const call = { port: "BMCT", callDate: "2026-10-18", gt: "10000", service: "foreign" as const, occupancy: { minutes: "59" }, rebate: true, adjustmentScope: "unadjusted-base" as const };
  expect((await session.executeCommand({ action: "create", pricing: "official", call, services: ["berth"] })).status).toBe("error");
  const result = await session.executeCommand({ action: "create", pricing: "official", call: { ...call, adjustmentScopeEvidence: statement }, services: ["berth"] });
  expect(result.status, result.body).toBe("calculated");
  expect([...session.quotes.values()][0].call.rebate).toBe(true);
  expect(result.body).toContain("adjustment amounts excluded");
});
