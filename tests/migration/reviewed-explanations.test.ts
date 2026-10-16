import { expect, it, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { conversationInputs, emptyConversation, reduceInterpretation, type Interpretation } from "../../src/lib/migration/conversation";
import { reviewedComponents } from "../../src/lib/migration/reviewed-components";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
afterEach(() => vi.mocked(readFile).mockClear());

const ports = {
  "BPCL Liquid Cargo Jetty": "bpcl-liquid-cargo-jetty",
  "Konkan LNG": "konkan-lng-ltd", ICTPL: "ictpl",
  "Mumbai Cruise Terminal": "mumbai-cruise-terminal", Jaigarh: "jaigarh",
  "BPCL Cargo Jetty": "bpcl-cargo-jetty",
};
function request(name: keyof typeof ports, kind: "rule" | "quote" = "rule", charges = ["berth"], date?: string) {
  const message = `${kind === "rule" ? "Explain" : "Calculate"} ${charges.join(" and ")} for ${name}.${date ? ` Call ${date}.` : ""}`;
  const inputs = conversationInputs([{ role: "user", content: message }]);
  const evidence = (quote: string) => ({ inputId: inputs[0].id, quote });
  const p: Interpretation = { version: 1, baseHash: emptyConversation().hash, inputIds: [inputs[0].id],
    scopes: [{ id: "call", kind: "call", parentId: null, label: name, evidence: evidence(message) }],
    tasks: [{ id: "task", scopeId: "call", kind, source: "official", charges, ruleScopeIds: [], evidence: evidence(message) }],
    operations: [{ scopeId: "call", field: "port", value: ports[name], unit: "", operation: "assert", evidence: evidence(name) }], unresolved: [] };
  if (date) p.operations.push({ scopeId: "call", field: "callDate", value: date, unit: "timestamp", operation: "assert", evidence: evidence(`Call ${date}`) });
  const state = reduceInterpretation(emptyConversation(), p, inputs).state;
  expect(state.facts.find(f => f.field === "port")?.status).toBe("established");
  return { state, task: state.tasks[0] };
}
async function answer(...args: Parameters<typeof request>) { const r = request(...args); return reviewedComponents(r.state, r.task); }

it.each(["BPCL Liquid Cargo Jetty", "Konkan LNG", "ICTPL", "Mumbai Cruise Terminal"] as const)("explains %s with identity alone and no vessel intake", async name => {
  const result = await answer(name);
  expect(result?.status).toBe("explained");
  expect(result?.sourceClass).toBe("official-tariff");
  expect(result?.body).toMatch(/https:\/\//);
  expect(result?.pending.join(" ")).not.toMatch(/provide.*(?:GT|IMO|passenger count)|gross tonnage|arrival.*departure/i);
  expect(result?.calculation).toBeUndefined();
});
it("keeps BPCL hourly support separate from an unverified minimum and identity", async () => {
  const result = await answer("BPCL Liquid Cargo Jetty");
  expect(result?.body).toContain("hour or part");
  expect(result?.pending.join(" ")).toMatch(/minimum.*(?:clause|basis)/i);
  expect(await answer("BPCL Cargo Jetty")).toBeUndefined();
});
it("states KLL's operative November boundary and does not transfer old delay conditions", async () => {
  const result = await answer("Konkan LNG", "rule", ["berth"], "20 October 2026");
  expect(result?.body).toContain("1 November 2026");
  expect(result?.body).toContain("0.359");
  expect(result?.body).toMatch(/not.*October/);
  expect(result?.pending.join(" ")).toMatch(/continuation.*36-hour|36-hour.*continuation/);
  expect(result?.body).toMatch(/not.*base.*waiver|no.*base.*waiver/);
});
it("does not promote ICTPL historical rules to current authority", async () => {
  const result = await answer("ICTPL", "rule", ["berth"], "20 October 2026");
  expect(result?.body).toMatch(/Historical/);
  expect(result?.body).toContain("31 March 2021");
  expect(result?.body).toContain("1.3");
  expect(result?.pending.join(" ")).toMatch(/operative.*(?:version|instrument)|current.*authority/i);
});
it("explains cruise units without calculating, stacking or certifying an expired call", async () => {
  const result = await answer("Mumbai Cruise Terminal", "rule", ["berth"], "2 April 2027");
  expect(result?.body).toContain("USD 6/passenger");
  expect(result?.body).toContain("31 March 2027");
  expect(result?.pending.join(" ")).toMatch(/requested call date.*outside/);
  expect(result?.pending.join(" ")).toMatch(/stacking|interaction/);
});
it("never upgrades explanation packets into monetary quotes or silently drops requested charges", async () => {
  for (const name of ["BPCL Liquid Cargo Jetty", "Konkan LNG", "ICTPL", "Mumbai Cruise Terminal"] as const) expect(await answer(name, "quote")).toBeUndefined();
  const jaigarh=await answer("Jaigarh", "quote", ["port-dues"]);expect(jaigarh?.status).toBe("unresolved");expect(jaigarh?.calculation).toBeUndefined();
  const mixed = await answer("BPCL Liquid Cargo Jetty", "rule", ["berth", "cargo-handling"]);
  expect(mixed?.pending.join(" ")).toContain("cargo-handling");
  expect(await answer("BPCL Liquid Cargo Jetty", "rule", ["cargo-handling"])).toBeUndefined();
});
it.each([
  ["BPCL Liquid Cargo Jetty", "30 April 2026", true],
  ["BPCL Liquid Cargo Jetty", "1 May 2026", false],
  ["BPCL Liquid Cargo Jetty", "30 April 2027", false],
  ["BPCL Liquid Cargo Jetty", "1 May 2027", true],
  ["Mumbai Cruise Terminal", "31 March 2027", false],
] as const)("retains the source period for %s on %s", async (name, date, outside) => {
  const result = await answer(name, "rule", ["berth"], date);
  expect(result?.status).toBe("explained");
  expect(result?.pending.some(p => p.includes("requested call date is outside"))).toBe(outside);
});
it("refuses a reviewed explanation when the retained source bytes change", async () => {
  vi.mocked(readFile).mockResolvedValueOnce(Buffer.from("changed source"));
  await expect(answer("BPCL Liquid Cargo Jetty")).rejects.toThrow(/source hash changed/i);
});
