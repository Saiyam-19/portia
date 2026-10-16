import { afterEach, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import { readFile } from "node:fs/promises";
import { emptyConversation, type ConversationField, type ConversationState, type ConversationTask } from "../../src/lib/migration/conversation";
import { reviewedComponents } from "../../src/lib/migration/reviewed-components";
vi.mock("node:fs/promises", async original => { const actual = await original<typeof import("node:fs/promises")>(); return { ...actual, readFile: vi.fn(actual.readFile) }; });
afterEach(() => vi.mocked(readFile).mockClear());
const NSFT = "nhava-sheva-freeport-terminal", NSIGT = "nhava-sheva-gateway-terminal", NSICT = "nhava-sheva-international-container-terminal";
// The component boundary receives established, normalized facts. Shared fact
// extraction/validation is owned by the caller and is not replaced here.
function request(port: string, fields: Partial<Record<ConversationField, string>>, charges = ["handling"]) {
  const scope = "call";
  const state: ConversationState = { ...emptyConversation(), scopes: [{ id: scope, kind: "call", parentId: null, label: "Current call", evidence: { inputId: "user", quote: "Current call" } }],
    facts: Object.entries({ port, ...fields }).filter(([,v]) => v !== undefined).map(([field, value], i) => ({ id: String(i), scopeId: scope, field: field as ConversationField, operation: "assert", value: value!, unit: "", evidence: { inputId: "user", quote: `${field}: ${value}` }, revision: 1, status: "established", inputOrder: 0, supersedes: [] })) };
  const task: ConversationTask = { id: "quote", scopeId: scope, kind: "quote", source: "official", charges, ruleScopeIds: [], evidence: { inputId: "user", quote: `Calculate ${charges.join(" and ")} for this single call` } };
  state.tasks = [task]; return { state, task };
}
async function answer(port: string, fields: Partial<Record<ConversationField, string>>, charges?: string[]) { const { state, task } = request(port, fields, charges); return reviewedComponents(state, task); }
const containers = { callDate: "12 November 2026", service: "foreign", containerSize: "20", ladenContainers: "120", emptyContainers: "80", cargoTraffic: "exim", specialCargo: "false", handlingMode: "road" };
const mumbai = { callDate: "3 November 2026", service: "foreign", vesselCategory: "general-cargo", terminal: "Indira Dock", gt: "14600", durationHours: "20" };
const jaigarh = { callDate: "12 November 2026", operator: "JSW Jaigarh Port Limited", cargoCategory: "mechanized-bulk", gt: "30000", callDays: "5" };
it.each([[NSFT,"road","USD 17,967.20"],[NSFT,"rail","USD 21,757.60"],[NSIGT,"road","INR 1,065,536.80"],[NSIGT,"rail","INR 1,408,026.80"],[NSIGT,"ship-yard","INR 913,318.80"]])("calculates %s %s with exactly one matching landside leg", async (port, mode, expected) => {
  const result = await answer(port, { ...containers, handlingMode: mode, icdRail: "true" });
  expect(result?.status).toBe("calculated"); expect(result?.body).toContain(expected);
  expect(result?.pending).toEqual([]); expect(result?.body).toContain("not a complete bill");
});
it("enforces NSICT port-crane scope and keeps its component paise", async () => {
  const fields = { ...containers, ladenContainers: "15", emptyContainers: "7", handlingMode: "ship-yard", portCrane: "true" };
  const result = await answer(NSICT, fields); expect(result?.body).toContain("INR 139,656.45"); expect(result?.body).toContain("port crane");
  for (const value of [undefined,"false"]) { const denied = await answer(NSICT, { ...fields, portCrane: value }); expect(denied?.status).toBe("unresolved"); expect(denied?.pending.join(" ")).toMatch(/port.crane/i); }
  expect((await answer(NSICT,{ ...fields, handlingMode: "road" }))?.status).toBe("unresolved");
});
it.each([
  ["containerSize", "40"], ["containerSize", undefined], ["ladenContainers",undefined], ["emptyContainers",undefined], ["ladenContainers","1.5"], ["emptyContainers","-1"],
  ["cargoTraffic","transshipment"], ["service","coastal"], ["specialCargo","true"], ["specialCargo",undefined], ["handlingMode",undefined], ["callDate","30 April 2026"],
] as const)("rejects unsupported/missing container predicate %s=%s", async (field,value) => {
  const result = await answer(NSFT,{ ...containers,[field]:value }); expect(result?.status).toBe("unresolved"); expect(result?.calculation).toBeUndefined();
});
it("requires ICD for NSIGT rail and respects its stated annual period", async () => {
  expect((await answer(NSIGT,{ ...containers,handlingMode:"rail" }))?.status).toBe("unresolved");
  expect((await answer(NSIGT,{ ...containers,callDate:"1 April 2027" }))?.status).toBe("unresolved");
  expect((await answer(NSIGT,{ ...containers,callDate:"31 March 2027" }))?.status).toBe("calculated");
});
it("preserves explicit zero counts, changed quantities, currency and missing requested charges", async () => {
  const result = await answer(NSFT,{ ...containers,ladenContainers:"1",emptyContainers:"0" },["handling","berth","gst"]);
  expect(result?.body).toContain("USD 94.78"); expect(result?.body).not.toMatch(/INR\s+[\d,]+\.\d/);
  expect(result?.pending.join(" ")).toContain("berth"); expect(result?.pending.join(" ")).toContain("gst");
  expect((result?.calculation as {currencies:string[]}).currencies).toEqual(["USD"]);
});
it.each([["Indira Dock","USD 4,000.40"],["Ballard Pier","USD 4,000.40"],["Princes Dock","USD 3,182.80"],["Victoria Dock","USD 3,182.80"]])("calculates Mumbai foreign ordinary %s", async (terminal,total) => {
  const result = await answer("mumbai",{ ...mumbai,terminal },["berth"]); expect(result?.body).toContain(total); expect(result?.pending).toEqual([]);
});
it("applies Mumbai assessed tonnage floor and started hours; preserves coastal handler", async () => {
  expect((await answer("mumbai",{ ...mumbai,gt:"500",durationHours:"0.5" },["berth"]))?.body).toContain("USD 13.70");
  expect(await answer("mumbai",{ ...mumbai,service:"coastal" },["berth"])).toBeUndefined();
  for (const terminal of [undefined,"Mumbai","Unknown Dock"]) expect((await answer("mumbai",{ ...mumbai,terminal },["berth"]))?.status).toBe("unresolved");
});
it("uses Indian tariff dates and rejects inconsistent elapsed occupancy", async () => {
  const fields={...mumbai,callDate:undefined,berthStart:"9 May 2026 00:30 IST",berthEnd:"9 May 2026 01:00 IST",durationHours:"0.5"};
  expect((await answer("mumbai",fields,["berth"]))?.status).toBe("calculated");
  expect((await answer("mumbai",{...fields,durationHours:"3"},["berth"]))?.status).toBe("unresolved");
  expect((await answer("mumbai",{...mumbai,callDate:"8 May 2026"},["berth"]))?.status).toBe("unresolved");
});
it("returns exact amounts and service coverage for comparisons without treating unlike bundles as equal",async()=>{
  const road=await answer(NSFT,containers),rail=await answer(NSIGT,{...containers,handlingMode:"rail",icdRail:"true"});
  const crane=await answer(NSICT,{...containers,ladenContainers:"15",emptyContainers:"7",handlingMode:"ship-yard",portCrane:"true"});
  expect(road?.totals).toEqual([{currency:"USD",amount:"17967.20",chargeIds:["container:20ft:normal-exim:ship-yard","container:20ft:normal-exim:yard-road"],basis:"component"}]);
  expect(rail?.totals?.[0].chargeIds).toContain("container:20ft:normal-exim:yard-rail-icd");
  expect(crane?.totals?.[0].chargeIds).toEqual(["container:20ft:normal-exim:ship-yard"]);
  const fractional=await answer("mumbai",{...mumbai,gt:"14601"},["berth"]);
  expect(fractional?.body).toContain("USD 4,000.674");expect(new Decimal(fractional!.totals![0].amount).eq("4000.674")).toBe(true);
});
it("computes NSIGT operator berth without asking for container counts",async()=>{
  const result=await answer(NSIGT,{callDate:"12 November 2026",service:"foreign",gt:"31200",durationHours:"18"},["berth"]);
  expect(result?.body).toContain("INR 1,149,932.16");expect(result?.totals?.[0].chargeIds).toEqual(["berth:ordinary-foreign:gt-hour"]);
});
it("keeps known berth modifiers unresolved for Mumbai and NSIGT even when a useful base is retained",async()=>{
  for(const port of ["mumbai",NSIGT]) for(const field of ["priority","idleTime","penalty","otherAdjustments","shifting","falseReadiness","ousting","rebate"] as const){
    const result=await answer(port,{...mumbai,[field]:"true"},["berth"]);
    expect(result?.status).toBe("calculated");
    expect(result?.pending.join(" ")).toContain(field);
    expect(result?.body).toContain(`Known berth modifiers: ${field}`);
    expect(result?.body).toContain("unadjusted base");
  }
});
it("does not manufacture a berth modifier when normal controls are explicitly false",async()=>{
  for(const port of ["mumbai",NSIGT]){
    const result=await answer(port,{...mumbai,priority:"false",idleTime:"false",penalty:"false",otherAdjustments:"false",shifting:"false",falseReadiness:"false",ousting:"false",rebate:"false"},["berth"]);
    expect(result?.status).toBe("calculated");expect(result?.pending).toEqual([]);expect(result?.body).not.toContain("Known berth modifiers:");
  }
});
it.each([["30000","5","USD 9,900.00"],["5000","30","USD 2,000.00"],["10000","1","USD 3,300.00"]])("calculates Jaigarh J1 %sGT/%sdays with monetary minimum",async(gt,callDays,total)=>{
  const result=await answer("jaigarh",{...jaigarh,gt,callDays},["port-dues"]);expect(result?.body).toContain(total);expect(result?.body).toMatch(/single.call/i);expect(result?.pending).toEqual([]);
});
it.each([["operator",undefined],["operator","Angre"],["cargoCategory","other"],["callDays",undefined],["callDays","31"],["callDays","0"],["callDate","30 April 2026"]] as const)("does not assume Jaigarh predicate %s=%s",async(field,value)=>{
  const result=await answer("jaigarh",{...jaigarh,[field]:value},["port-dues"]);expect(result?.status).toBe("unresolved");expect(result?.calculation).toBeUndefined();
});
it("does not treat the 30-day dues validity as whole-tariff expiry or infer renewal",async()=>{
  const result=await answer("jaigarh",{...jaigarh,callDate:"1 December 2026"},["port-dues","renewal-credit"]);
  expect(result?.status).toBe("calculated");expect(result?.pending.join(" ")).toMatch(/renewal|credit/);
  expect(result?.body).toContain("maximum 30-day");
});
it("refuses changed authoritative source bytes",async()=>{
  vi.mocked(readFile).mockResolvedValueOnce(Buffer.from("changed"));await expect(answer(NSICT,{...containers,ladenContainers:"15",emptyContainers:"7",handlingMode:"ship-yard",portCrane:"true"})).rejects.toThrow(/source hash changed/i);
});
