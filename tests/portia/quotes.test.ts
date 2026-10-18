import { expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { QuoteSession } from "../../src/lib/portia/session";
import { quoteInputSchema, type QuoteInput } from "../../src/lib/portia/quotes";
import { d19, d19Correction } from "../migration/pass1/golden";
const input: QuoteInput = { pricing: "supplied", name: "Vessel quotation", lines: [
  { name: "berth hire", currency: "USD", amount: "720" }, { name: "pilotage", currency: "USD", amount: "240" }, { name: "water supply", currency: "USD", amount: "45" },
], terms: { taxPercent: "0" } };
function history(result: unknown): ModelMessage[] { return [{ role: "tool", content: [{ type: "tool-result", toolName: "manage_quote", toolCallId: "saved", output: { type: "json", value: JSON.parse(JSON.stringify(result)) } }] }]; }
it("C2 named correction retains unrelated lines, exact change and reload state", async () => {
  const s = new QuoteSession("alice-chat"); await s.initialize([]);
  const first = await s.update(input); expect(first.body).toContain("USD 1,005.00");
  const quote = [...s.quotes.values()][0]; s.beginStep();
  const changed = await s.update({ quoteId: quote.id, lines: [{ name: "water supply", amount: "60" }] });
  for (const amount of ["720.00", "240.00", "60.00", "1,020.00", "15.00"]) expect(changed.body).toContain(amount);
  expect(changed.body).toContain("Unchanged amounts: berth hire, pilotage");
  const restored = new QuoteSession("alice-chat"); await restored.initialize([...history(first), ...history(changed)]);
  expect(restored.quotes.get(quote.id)?.lines).toEqual(s.quotes.get(quote.id)?.lines);
  expect((await restored.update({ quoteId: quote.id })).body).toContain("USD 1,020.00");
  await expect(new QuoteSession("bob-chat").initialize(history(first))).rejects.toThrow(/identity/);
});
it.each(["original", "reworded"])("preserves the retained 1280 → 1295 named-line regression (%s)", async () => {
  const s = new QuoteSession("regression"); await s.initialize([]);
  await s.update({ ...input, lines: input.lines!.map((line, i) => ({ ...line, amount: ["825", "390", "65"][i] })) });
  expect(s.finalText("")).toContain("USD 1,280.00"); s.beginStep();
  const id = [...s.quotes.keys()][0]; const result = await s.update({ quoteId: id, lines: [{ name: "water supply", amount: "80" }] });
  for (const amount of ["825.00", "390.00", "80.00", "1,295.00"]) expect(result.body).toContain(amount);
});
it("C4 code converts original duration components and corrects only occupancy", async () => {
  const s = new QuoteSession("blocks"); await s.initialize([]);
  const first = await s.update({ pricing: "supplied", call: { occupancy: { hours: "13", minutes: "10" } }, lines: [{ name: "berth hire", currency: "USD", rate: "75", unit: "time", periodHours: "6", commenced: true }], terms: { taxPercent: "0" } });
  expect(first.body).toContain("USD 225.00"); expect(first.body).toContain("billable periods 3");
  s.beginStep(); const id = [...s.quotes.keys()][0];
  const correction = await s.update({ quoteId: id, call: { occupancy: { hours: "12" } } });
  expect(correction.body).toContain("USD 150.00"); expect(correction.body).toContain("billable periods 2"); expect(correction.body).not.toContain("Unchanged amounts: berth hire");
  const reload = new QuoteSession("blocks"); await reload.initialize([...history(first), ...history(correction)]);
  expect(reload.quotes.get(id)?.call.occupancy).toEqual({ hours: "12" });
});
it("C3 compares saved quotes using exact directional supplied FX", async () => {
  const s = new QuoteSession("fx"); await s.initialize([{ role: "user", content: "Compare Amber USD 950 and Blue EUR 900." }]);
  for (const [name, currency, amount] of [["Amber", "USD", "950"], ["Blue", "EUR", "900"]] as const) await s.update({ pricing: "supplied", name, lines: [{ name: "berth hire", currency, amount }], terms: { taxPercent: "0" } });
  const quoteIds = [...s.quotes.keys()];
  const result = await s.compare({ quoteIds, currency: "USD", exchangeRates: [{ from: "EUR", to: "USD", rate: "1.10" }] });
  for (const text of ["USD 950.00", "EUR 900.00", "USD 990.00", "USD 40.00", "**Amber** has the lower"]) expect(result.body).toContain(text);
  expect((await s.compare({ quoteIds, currency: "USD" })).status).toBe("error");
});
it("bounds inputs and rejects duplicate/stale same-step updates", async () => {
  expect(quoteInputSchema.safeParse({ ...input, officialRate: "12" }).success).toBe(false);
  const s = new QuoteSession("fences"); await s.initialize([]); await s.update(input); s.beginStep();
  const id = [...s.quotes.keys()][0];
  const replies = await Promise.all([s.update({ quoteId: id, lines: [{ name: "water supply", amount: "60" }] }), s.update({ quoteId: id, lines: [{ name: "water supply", amount: "999" }] })]);
  expect(replies[1].status).toBe("error"); expect(s.quotes.get(id)?.lines[2].amount).toBe("60");
  const controller = new AbortController(); controller.abort();
  await expect(s.update(input, controller.signal)).rejects.toThrow();
});
it("old corrected receipt reopens without resurrecting superseded rates", async () => {
  const original = d19(), first = original.apply();
  const oldMessages: ModelMessage[] = [...original.messages, { role: "tool", content: [{ type: "tool-result", toolName: "interpret_request", toolCallId: "old1", output: { type: "json", value: JSON.parse(JSON.stringify(first.receipt)) } }] }];
  const correction = d19Correction(first.state, oldMessages), second = correction.apply();
  const saved: ModelMessage[] = [...correction.messages, { role: "tool", content: [{ type: "tool-result", toolName: "interpret_request", toolCallId: "old2", output: { type: "json", value: JSON.parse(JSON.stringify(second.receipt)) } }] }];
  const s = new QuoteSession("old-chat"); await s.initialize(saved);
  const quote = [...s.quotes.values()][0]; expect(quote.lines[2].amount).toBe("80");
  const result = await s.update({ quoteId: quote.id, lines: [{ name: "water supply", amount: "90" }] });
  expect(result.body).toContain("USD 1,305.00"); expect(result.body).toContain("USD 825.00"); expect(result.body).not.toContain("USD 65.00");
  expect(result.body).toContain("USD 10.00"); expect(result.body).toContain("imported saved");
  const reload = new QuoteSession("old-chat"); await reload.initialize([...saved, ...history(result)]);
  expect(reload.quotes.get(quote.id)?.lines[2].amount).toBe("90");
});

it("database object-key reordering preserves receipt integrity and corrections",async()=>{
 const s=new QuoteSession("serialized");await s.initialize([]);const first=await s.update(input);
 const reorder=(value:unknown):unknown=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,reorder(v)])):value;
 const restored=new QuoteSession("serialized");await restored.initialize(reorder(history(first)) as ModelMessage[]);
 const id=[...restored.quotes.keys()][0];expect(id).toBeTruthy();const changed=await restored.update({quoteId:id,lines:[{name:'water supply',amount:'60'}]});expect(changed.body).toContain('USD 1,020.00');
});

it("read-only follow-up renders verified saved totals and changes without a new mutation",async()=>{
 const s=new QuoteSession('read');await s.initialize([]);const first=await s.update(input);s.beginStep();const id=[...s.quotes.keys()][0];const changed=await s.update({quoteId:id,lines:[{name:'water supply',amount:'60'}]});
 const read=new QuoteSession('read');await read.initialize([...history(first),...history(changed)]);const revision=read.quotes.get(id)!.revision;
 const answer=await read.answer('The total increased by USD 15.00.');expect(answer).toContain('USD 1,020.00');expect(answer).toContain('USD 15.00');expect(answer).toContain('Unchanged amounts: berth hire, pilotage');expect(read.quotes.get(id)!.revision).toBe(revision);
});
it('unresolved corrected lines do not claim a full-quotation decrease',async()=>{
 const s=new QuoteSession('partial');await s.initialize([]);await s.update(input);s.beginStep();const id=[...s.quotes.keys()][0];
 const result=await s.update({quoteId:id,lines:[{name:'water supply',rate:'60',unit:'time',periodHours:'6',commenced:true}]});
 expect(result.questions.length).toBeGreaterThan(0);expect(result.body).not.toContain('Decrease from');
});
it('no-rounding correction removes a saved rule explicitly and survives reload',async()=>{
 const s=new QuoteSession('rounding');await s.initialize([]);const first=await s.update({pricing:'supplied',lines:[{name:'Service',currency:'USD',amount:'12.1234'}],terms:{taxPercent:'0',rounding:{stage:'total',decimals:2}}});const id=[...s.quotes.keys()][0];
 const restored=new QuoteSession('rounding');await restored.initialize([...history(first),{role:'user',content:'Recalculate without monetary rounding.'}]);
 expect((await restored.update({quoteId:id})).status).toBe('error');const corrected=await restored.update({quoteId:id,terms:{removeRounding:true}});expect(corrected.body).toContain('USD 12.1234');
 const reload=new QuoteSession('rounding');await reload.initialize([...history(first),...history(corrected)]);expect(reload.quotes.get(id)?.terms.rounding).toBeUndefined();
});
