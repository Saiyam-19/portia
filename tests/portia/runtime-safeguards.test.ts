import { afterEach, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { QuoteSession } from "../../src/lib/portia/session";
import { conversationInputs, emptyConversation, reduceInterpretation, currentConversationFact, type Interpretation } from "../../src/lib/migration/conversation";

// Input receipts use the active compatibility codec only. Assertions exercise
// current QuoteSession import, calculation, correction and v2 persistence.
type Variant = "valid" | "foreign-minimum" | "foreign-maximum" | "foreign-rate" | "missing-charge" | "line-tax" | "unknown-rounding" | "money-precision" | "duration-conflict";
function historical(variant: Variant): ModelMessage[] {
  const extra: Record<Variant, string> = { valid: "", "foreign-minimum": "Berth minimum EUR 5000 per call.", "foreign-maximum": "Berth cap EUR 100 per call.", "foreign-rate": "Berth currency USD.", "missing-charge": "Include pilotage too.", "line-tax": "Berth tax 5 percent.", "unknown-rounding": "No rounding mode stated.", "money-precision": "Round each line before adding the total.", "duration-conflict": "The occupancy is 180 minutes." };
  const ruleText = `Berth ${variant === "foreign-rate" ? "EUR" : "USD"} 0.01 per GT per hour, exact time`;
  const text = "Supplied berth quote: GT 20000; stay 2 hours. " + ruleText + ". No tax. " + extra[variant];
  const messages: ModelMessage[] = [{ role: "user", content: text }], inputs = conversationInputs(messages), evidence = (quote: string) => ({ inputId: inputs[0].id, quote });
  const p: Interpretation = { version: 1, baseHash: emptyConversation().hash, inputIds: [inputs[0].id], scopes: [{ id: "call", label: "Call", kind: "call", parentId: null, evidence: evidence(text) }, { id: "rule", label: "Berth", kind: "quotation-rule", parentId: "call", evidence: evidence(ruleText) }], tasks: [{ id: "quote", scopeId: "call", kind: "quote", source: "supplied", charges: variant === "missing-charge" ? ["berth", "pilotage"] : ["berth"], ruleScopeIds: ["rule"], evidence: evidence(text) }], operations: [], unresolved: [] };
  const put = (scopeId: string, field: Interpretation["operations"][number]["field"], value: string, unit: string, quote: string) => p.operations.push({ scopeId, field, value, unit, operation: "assert", evidence: evidence(quote) });
  put("call", "gt", "20000", "GT", "GT 20000"); put("call", "durationHours", "2", "hours", "stay 2 hours"); put("call", "taxPercent", "0", "percent", "No tax");
  put("rule", "charge", "berth", "", ruleText); put("rule", "currency", "USD", "", variant === "foreign-rate" ? "Berth currency USD" : "USD 0.01");
  put("rule", "rate", "0.01", "money", variant === "foreign-rate" ? "EUR 0.01" : "USD 0.01");
  put("rule", "basis", "gt-period", "", "per GT per hour"); put("rule", "periodHours", "1", "hours", "per hour");
  put("rule", "rounding", variant === "unknown-rounding" ? "none" : "exact", "", variant === "unknown-rounding" ? "No rounding mode stated" : "exact time");
  if (variant === "foreign-minimum" || variant === "foreign-maximum") {
    const field = variant === "foreign-minimum" ? "minimum" : "maximum";
    put("rule", field, field === "minimum" ? "5000" : "100", "money", extra[variant]); put("rule", field === "minimum" ? "minimumScope" : "maximumScope", "call", "", extra[variant]);
  }
  if (variant === "line-tax") put("rule", "taxPercent", "5", "percent", extra[variant]);
  if (variant === "money-precision") put("call", "moneyRounding", "line", "", extra[variant]);
  if (variant === "duration-conflict") put("call", "durationMinutes", "180", "minutes", extra[variant]);
  const reduced = reduceInterpretation(emptyConversation(), p, inputs);
  // Establish the adversarial condition, avoiding a false pass from malformed fixtures.
  expect(currentConversationFact(reduced.state, "rule", "rate")?.value).toBe("0.01");
  if (variant === "line-tax") expect(currentConversationFact(reduced.state, "rule", "taxPercent")?.value).toBe("5");
  if (variant === "duration-conflict") expect(currentConversationFact(reduced.state, "call", "durationMinutes")?.value).toBe("180");
  return [...messages, { role: "tool", content: [{ type: "tool-result", toolName: "interpret_request", toolCallId: "saved", output: { type: "json", value: JSON.parse(JSON.stringify(reduced.receipt)) } }] }];
}
const saved = (value: unknown): ModelMessage => ({ role: "tool", content: [{ type: "tool-result", toolName: "manage_quote", toolCallId: "updated", output: { type: "json", value: JSON.parse(JSON.stringify(value)) } }] });
afterEach(() => vi.unstubAllEnvs());
it.each(["foreign-minimum", "foreign-maximum", "foreign-rate", "missing-charge", "line-tax", "unknown-rounding", "money-precision", "duration-conflict"] as const)("historical %s never becomes an apparently complete current quotation", async variant => {
  const history = historical(variant), session = new QuoteSession(variant); await session.initialize(history);
  expect(session.quotes.size).toBe(1); expect(session.warning).toBeUndefined();
  const id = [...session.quotes.keys()][0], result = await session.update({ quoteId: id });
  expect(result.status).toBe("unresolved"); expect(result.questions.length).toBeGreaterThan(0);
  expect("totals" in result ? result.totals?.length ?? 0 : 0).toBe(0); expect(session.quotes.get(id)?.baseline).toBeUndefined();
  // Generic clearing of user-editable terms cannot erase retained source uncertainty.
  const updated = await session.update({ quoteId: id, terms: { unresolvedTerms: [] } });
  const reload = new QuoteSession(variant); await reload.initialize([...history, saved(updated)]);
  expect((await reload.update({ quoteId: id })).status).toBe("unresolved");
});
it("valid historical quote still imports, corrects and reloads", async () => {
  const history = historical("valid"), session = new QuoteSession("valid"); await session.initialize(history);
  const id = [...session.quotes.keys()][0]; expect((await session.update({ quoteId: id })).body).toContain("USD 400.00");
  const result = await session.update({ quoteId: id, call: { gt: "10000" } }); expect(result.body).toContain("USD 200.00");
  const reload = new QuoteSession("valid"); await reload.initialize([...history, saved(result)]); expect((await reload.update({ quoteId: id })).body).toContain("USD 200.00");
});
it.each([true, false])("current session respects form cancellation=%s and keeps human note", async cancelled => {
  const session = new QuoteSession("form"); await session.initialize([{ role: "assistant", content: [{ type: "tool-call", toolCallId: "f", toolName: "ask_user_input", input: { title: "Particulars", fields: [{ name: "nt", label: "Net tonnage", unit: "NT", type: "number", required: true }] } }] }, { role: "tool", content: [{ type: "tool-result", toolCallId: "f", toolName: "ask_user_input", output: { type: "json", value: { cancelled, values: { nt: "5000" }, note: cancelled ? "NT unknown; actual GT 9000 instead" : "GT 9000" } } }] }]);
  const result = await session.update({ pricing: "supplied", call: { nt: "5000", gt: "9000" }, lines: [{ name: "Berth", currency: "USD", amount: "100" }] });
  expect(result.status).toBe(cancelled ? "error" : "calculated");
  if (cancelled) { expect(session.quotes.size).toBe(0); expect((await session.update({ pricing: "supplied", call: { gt: "9000" }, lines: [{ name: "Berth", currency: "USD", amount: "100" }] })).status).toBe("calculated"); }
});
it("independent arithmetic does not conceal invalid quotation arguments", async () => {
  const session = new QuoteSession("partial"); await session.initialize([]);
  session.recordAnswer("math", { status: "calculated", body: "2 + 3 = **5**", questions: [] });
  session.observeTools([], [{ toolCallId: "bad", toolName: "manage_quote", invalid: true, input: { quoteId: "old" } }]);
  const text = await session.answer("All work completed."); expect(text).toContain("**5**"); expect(text).toMatch(/quotation.*(?:failed|could not|incomplete)|business inputs.*not.*validated/i); expect(text).not.toContain("All work completed");
});
it.each(["Berth hire costs two thousand dollars.", "The amount is 2000 USD.", "Total payable: 2k dollars.", "The amount is ٢٠٠٠ USD.", "2000USD", "Tax is 5 %.", "Twenty dollars."])("no-tool financial claim is not published: %s", async prose => {
  const session = new QuoteSession("prose"); await session.initialize([{ role: "user", content: "What will the berth cost?" }]);
  expect(await session.answer(prose)).not.toBe(prose);
});
it("ordinary nonfinancial conversation remains available without tools", async () => {
  const session = new QuoteSession("hello"); await session.initialize([{ role: "user", content: "Hello" }]); expect(await session.answer("Hello! How can I help?")).toBe("Hello! How can I help?");
});

it.each(["GTI", "JSW JNPT Liquid Terminal", "BMCT", "NSIGT"])("%s never prices berth occupancy past source expiry", async port=>{
 const { lookupTariff }=await import("../../src/lib/portia/tariffs");
 const operator=["BMCT","NSIGT"].includes(port),day=operator?"31 March 2027":"30 April 2027",end=operator?"2 April 2027":"2 May 2027";
 for (const interval of [{berthStart:day+" 00:00 IST",berthEnd:end+" 00:00 IST"},{durationHours:"48"}]) {
  const result=await lookupTariff({port,charges:["berth"],service:"foreign",gt:"10000",callDate:day,...interval});
  expect(result.totals?.length ?? 0).toBe(0);expect(result.status).not.toBe("calculated");
 }
});
it("comparison preserves a rounded source invoice or rejects incompatible line conversion",async()=>{
 const session=new QuoteSession("rounding-audit");await session.initialize([]);
 await session.update({pricing:"supplied",lines:[{name:"Service",currency:"USD",amount:"1.005"}],terms:{taxPercent:"0",rounding:{stage:"total",decimals:2}}});
 await session.update({pricing:"supplied",lines:[{name:"Service",currency:"USD",amount:"1.007"}],terms:{taxPercent:"0",rounding:{stage:"total",decimals:2}}});
 const result=await session.compare({quoteIds:[...session.quotes.keys()],currency:"INR",exchangeRates:[{from:"USD",to:"INR",rate:"80"}],rounding:{stage:"line",decimals:2}});
 if("converted" in result) {expect(result.converted.map(row=>row.amount)).toEqual(["80.8","80.8"]);expect(result.difference).toBe("0");}
});

it("tool execution failures stay visible until a matching retry repairs them",async()=>{
 const s=new QuoteSession("errors");await s.initialize([]);s.recordAnswer("math",{status:"calculated",body:"2+3 = **5**",questions:[]});
 s.observeTools([],[],[{toolCallId:"failed",toolName:"manage_quote",input:{quoteId:"a",call:{gt:"1000"}}}]);
 expect(s.finalText("Done")).toMatch(/could not complete/i);
 s.observeTools([{toolCallId:"other",toolName:"manage_quote",input:{quoteId:"b"},output:{status:"calculated"}}]);
 expect(s.finalText("Done")).toMatch(/could not complete/i);
 s.observeTools([{toolCallId:"repair",toolName:"manage_quote",input:{quoteId:"a",call:{gt:"1000"}},output:{status:"calculated"}}]);
 expect(s.finalText("Done")).not.toMatch(/could not complete/i);
});

it("read-only or unresolved sibling calls cannot certify a failed correction",async()=>{
 const s=new QuoteSession("retry");await s.initialize([]);s.recordAnswer("math",{body:"2+3 = **5**",questions:[]});
 const failure={toolCallId:"bad",toolName:"manage_quote",invalid:true,input:{quoteId:"q",lines:[{name:"Water",amount:"-1"}]}};
 s.observeTools([], [failure]);
 s.observeTools([{toolCallId:"read",toolName:"manage_quote",input:{quoteId:"q"},output:{status:"calculated"}}]);expect(s.finalText("")).toMatch(/could not complete/);
 s.observeTools([{toolCallId:"pending",toolName:"manage_quote",input:{quoteId:"q",lines:[{name:"Water",amount:"100"}]},output:{status:"unresolved"}}]);expect(s.finalText("")).toMatch(/could not complete/);
 const repaired={toolCallId:"fixed",toolName:"manage_quote",input:{quoteId:"q",lines:[{name:"Water",amount:"100"}]},output:{status:"calculated"}};
 s.observeTools([repaired]);expect(s.finalText("")).not.toMatch(/could not complete/);
 s.observeTools([repaired],[failure]);expect(s.finalText("")).not.toMatch(/could not complete/);
});
it.each(["Berth hire is the charge for occupying a berth.","I can help compare supplied prices."])("nonfinancial definition/capability remains available: %s",async text=>{
 const s=new QuoteSession("definition");await s.initialize([{role:"user",content:"What is berth hire?"}]);expect(await s.answer(text)).toBe(text);
});
