import { expect, it } from "vitest";
import { nullableToolSchema } from "../../src/lib/portia/tool-schema";
import { quoteInputSchema } from "../../src/lib/portia/quotes";
import { QuoteSession } from "../../src/lib/portia/session";
it("strict optional fields accept null without inventing values or dropping explicit false", async () => {
  const schema = nullableToolSchema(quoteInputSchema);
  const json = await schema.jsonSchema;
  expect(json.required).toEqual(Object.keys(json.properties!));
  const parsed = await schema.validate!({ quoteId: null, name: "Call", pricing: "official", call: { port: "Mumbai", gt: "8000", flag: null, priority: false }, lines: null, services: ["berth"], terms: null });
  expect(parsed.success).toBe(true);
  if (parsed.success) { expect(parsed.value.quoteId).toBeUndefined(); expect(parsed.value.lines).toBeUndefined(); expect(parsed.value.call).toEqual({ port: "Mumbai", gt: "8000", priority: false }); }
});
it("wire nulls in a named correction preserve unrelated minimum and cap", async () => {
  const s = new QuoteSession("bounds"); await s.initialize([]);
  await s.update({ pricing: "supplied", call: { gt: "9000", occupancy: { hours: "25" } }, lines: [{ name: "Berth", currency: "USD", rate: "0.04", unit: "gt-time", periodHours: "12", commenced: true, minimum: { amount: "1100", per: "call" }, maximum: { amount: "1800", per: "call" } }], terms: { taxPercent: "0" } });
  s.beginStep();const id=[...s.quotes.keys()][0];
  const parsed=await nullableToolSchema(quoteInputSchema).validate!({quoteId:id,pricing:null,call:null,lines:[{name:"Berth",rate:"0.05",amount:null,currency:null,minimum:null,maximum:null,removeMinimum:null,removeMaximum:null}]});
  expect(parsed.success).toBe(true);if(!parsed.success)return;
  await s.update(parsed.value);expect(s.quotes.get(id)?.lines[0]).toMatchObject({minimum:{amount:"1100",per:"call"},maximum:{amount:"1800",per:"call"}});
});

it('business cargo-operation input requires a supported category, not narrative',()=>{
 expect(quoteInputSchema.safeParse({pricing:'official',call:{cargoOperation:'Discharged steel coils'}}).success).toBe(false);
 expect(quoteInputSchema.safeParse({pricing:'official',call:{cargoOperation:'discharging'}}).success).toBe(true);
});
it('rule aspects cannot masquerade as extra tariff services',async()=>{
 const {tariffServiceSchema}=await import('../../src/lib/portia/tariff-input');
 for(const aspect of ['part hours','minimum tonnage','minimum bill'])expect(tariffServiceSchema.safeParse(aspect).success).toBe(false);
 expect(tariffServiceSchema.parse('berth')).toBe('berth');
});
