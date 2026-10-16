import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildCallContext } from "../../src/lib/migration/call-context";
import { prepareOfficialBerth, calculateOfficialBerth, verifyOfficialBerth, renderOfficialBerth, loadOfficialBerthRules } from "../../src/lib/migration/official-berth";

const input = JSON.parse(readFileSync("output/actual-tariff-20261015/independent/input-v1.json","utf8")).user_message as string;
const oracle = JSON.parse(readFileSync("output/actual-tariff-20261015/independent/oracle-v1.json","utf8"));
const binding = {runId:"test-run",fence:1,revision:1,conversationId:"test-chat"};
const prepare = async (text=input) => prepareOfficialBerth(buildCallContext([{role:"user",content:text}]),binding);
it("computes the untouched independent actual-tariff case with its complete scoped tax total", async () => {
  const prepared=await prepare();expect(prepared?.status).toBe("ready");if(prepared?.status!=="ready")throw new Error(JSON.stringify(prepared));
  const ledger=calculateOfficialBerth(prepared.plan);expect(ledger.amounts.berth).toBe(oracle.expected_amounts_inr.berth_hire);expect(ledger.amounts.cgst).toBe(oracle.expected_amounts_inr.cgst_9_percent);expect(ledger.amounts.sgst).toBe(oracle.expected_amounts_inr.sgst_9_percent);expect(ledger.amounts.total).toBe(oracle.expected_amounts_inr.complete_berth_hire_estimate);
  expect(ledger.billableHours).toBe("20");expect(ledger.elapsedMinutes).toBe("1180");expect(verifyOfficialBerth(ledger,prepared.plan)).toBe(true);
  const rendered=renderOfficialBerth(ledger);for(const text of ["51,094.00","43,300.00","3,897.00","20","0.2165","996752","https://www.mumbaiport.gov.in","https://cbic-gst.gov.in"])expect(rendered).toContain(text);
});
it.each([
  ["10,000 GT","12,000 GT","61313.00"],
  ["10,000 GT","800 GT","5110.00"],
  ["leaving at 03:40","leaving at 04:10","53649.00"],
  ["Mormugao","Chennai","51094.00"],
  ["New Mangalore","Cochin","51094.00"],
  ["Saffron Estuary","Blue Compass","51094.00"],
  [", 5,600 NT, 135 m LOA and 6.2 m arrival draft","","51094.00"],
])("uses changed eligible facts without confusing previous/next ports: %s", async (before,after,total) => {
  const p=await prepare(input.replace(before,after));expect(p?.status).toBe("ready");if(p?.status==="ready")expect(calculateOfficialBerth(p.plan).amounts.total).toBe(total);
});
it.each([
  ["Mumbai Port Authority's Indira Dock","Chennai Port Authority's Indira Dock"],
  ["Indira Dock","Princes Dock"],
  ["ordinary Indian-flag general-cargo ship","naval vessel"],
  ["valid DG Shipping coastal licence","expired DG Shipping coastal licence"],
  ["October 2026","October 2027"],
  ["both the supplier location and place of supply are Maharashtra","supplier location is Maharashtra and place of supply is Gujarat"],
  ["not an SEZ unit","an SEZ unit"],
  ["There was no port-caused idle time","There was port-caused idle time"],
  ["signal was at 03:30 on 11 October","signal was at 20:00 on 10 October"],
])("does not certify an ineligible/unsupported binding: %s", async (before,after) => {
  expect((await prepare(input.replaceAll(before,after)))?.status).not.toBe("ready");
});
it("rejects changed ledger, rule parameters, source hash and revision", async () => {
  const p=await prepare();if(p?.status!=="ready")throw new Error("Expected ready");
  const ledger=calculateOfficialBerth(p.plan);const altered=structuredClone(ledger);altered.amounts.total="1.00";expect(verifyOfficialBerth(altered,p.plan)).toBe(false);
  const stale=structuredClone(p.plan);stale.binding.revision++;expect(()=>calculateOfficialBerth(stale)).toThrow();
  const changed=structuredClone(p.plan);changed.rules.ratePerGrtStartedHour="1";expect(()=>calculateOfficialBerth(changed)).toThrow();
  const rules=await loadOfficialBerthRules();const bad=structuredClone(rules);bad.sources[0].sha256="0".repeat(64);await expect(loadOfficialBerthRules(bad)).rejects.toThrow("checksum");
});
it.each([" First hour free."," Priority berthing was requested."," Actually the vessel is naval."])("does not silently omit an extra governing clause: %s", async clause => {
  expect((await prepare(input+clause))?.status).not.toBe("ready");
});
it("leaves unadjudicated fractional-paise tax rounding unresolved",async()=>{
  const p=await prepare(input.replace("10,000 GT","10,001 GT"));if(p?.status!=="ready")throw new Error("Expected complete input");
  expect(()=>calculateOfficialBerth(p.plan)).toThrow("Fractional-paise");
});
