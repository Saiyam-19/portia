import { expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { AuthoritySession } from "../../src/lib/authority/session";
import { parsePacket, quoteCore } from "../../src/lib/authority/contract";
import { quoteCommandSchema, safe, type QuoteCommand } from "../../src/lib/portia/quotes";
import { QuoteSession } from "../../src/lib/portia/session";
import { nullableToolSchema } from "../../src/lib/portia/tool-schema";

const command = (value: unknown) => value as QuoteCommand;
const receipt = (result: unknown, id: string): ModelMessage => ({ role: "tool", content: [{ type: "tool-result", toolName: "manage_quote", toolCallId: id, output: { type: "json", value: JSON.parse(JSON.stringify(result)) } }] });

async function propose(session: QuoteSession, authority: AuthoritySession, value: unknown) {
  session.bindAuthority(authority);
  const result = await session.executeCommand(command(value));
  expect(result).toHaveProperty("approvalRequired", true);
  const operation = parsePacket(authority.pending()!.payload).operations.at(-1);
  if (!operation || operation.kind !== "quote") throw new Error("Expected quote operation");
  return { operation, applied: await session.applyApprovedQuote(operation) };
}

it("uses typed billing on the new command boundary and rejects raw dimensional fields", () => {
  expect(quoteCommandSchema.safeParse({ action: "create", pricing: "supplied", lines: [{ name: "launch", currency: "USD", amount: "83", unit: "movement" }] }).success).toBe(false);
  expect(quoteCommandSchema.safeParse({ action: "create", pricing: "supplied", lines: [{ name: "launch", currency: "USD", billing: { kind: "quantity", price: "13.75", quantity: "3", quantityLabel: "launch jobs" } }] }).success).toBe(true);
});

it("accepts explicit billing kinds with genuinely unknown dimensional facts", () => {
  for (const billing of [
    { kind: "flat", basis: "user-stated-flat" },
    { kind: "time", price: "17" },
    { kind: "gt-time", periodHours: "4" },
    { kind: "movement", price: "8" },
    { kind: "tonne", quantity: "12.5" },
    { kind: "quantity", price: "3", quantityLabel: "jobs" },
    { kind: "quantity", quantity: "5", quantityLabel: "items" },
  ]) expect(quoteCommandSchema.safeParse({ action: "create", pricing: "supplied", lines: [{ name: "partial", currency: "USD", billing }] }).success, JSON.stringify(billing)).toBe(true);
});

it("persists an incomplete typed recipe as an unapproved draft and reloads every known fact", async () => {
  const session = new QuoteSession("partial-recipe"), authority = new AuthoritySession(); session.bindAuthority(authority); await session.initialize([]);
  const result = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [{ name: "watch", currency: "USD", billing: { kind: "time", price: "17", duration: { hours: "4", minutes: "0" } }, minimumDurationHours: "6", minimum: { amount: "70", per: "call" } }] }));
  expect(result).not.toHaveProperty("approvalRequired"); expect(authority.hasPending()).toBe(false);
  expect(result.questions.join(" ")).toMatch(/billing period.*part periods/i);
  if (!("draft" in result)) throw new Error("Draft missing");
  expect(result.draft.quote.lines[0]).toMatchObject({ rate: "17", unit: "time", billingScope: "line", duration: { hours: "4", minutes: "0" }, minimumDurationHours: "6", minimum: { amount: "70", per: "call" } });
  const reload = new QuoteSession("partial-recipe"); reload.bindAuthority(new AuthoritySession()); await reload.initialize([receipt(result, "partial")]);
  expect(JSON.parse(reload.context()).drafts[0].quote.lines[0]).toEqual(result.draft.quote.lines[0]);
});

it("fills a missing price without inferring kind or dropping known quantity and constraints", async () => {
  const session = new QuoteSession("missing-price"), authority = new AuthoritySession(); session.bindAuthority(authority); await session.initialize([]);
  const incomplete = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [{ name: "jobs", currency: "USD", billing: { kind: "quantity", quantity: "4", quantityLabel: "jobs" }, minimum: { amount: "50", per: "call" } }] }));
  if (!("quoteId" in incomplete)) throw new Error("Draft missing");
  expect(incomplete).not.toHaveProperty("approvalRequired"); expect(incomplete.questions.join(" ")).toMatch(/amount or supplier rate/i);
  session.beginStep();
  const completed = await session.executeCommand(command({ action: "update", quoteId: incomplete.quoteId, lines: [{ name: "jobs", price: "12.5" }] }));
  expect(completed).toHaveProperty("approvalRequired", true);
  const operation = parsePacket(authority.pending()!.payload).operations.at(-1); if (!operation || operation.kind !== "quote") throw new Error("Operation missing");
  expect(operation.quote.lines[0]).toMatchObject({ rate: "12.5", unit: "quantity", billingScope: "line", quantity: "4", quantityLabel: "jobs", minimum: { amount: "50", per: "call" } });
  expect(operation.preview?.totals[0].amount).toBe("50");
});

it("fills missing same-kind movement/time facts without dropping their known siblings", async () => {
  const movement=new QuoteSession("fill-movement");await movement.initialize([]);
  const m=await movement.executeCommand(command({action:"create",pricing:"supplied",lines:[{name:"move",currency:"USD",billing:{kind:"movement",price:"8"}}]}));if(!("quoteId" in m))throw Error();movement.beginStep();
  const mr=await movement.executeCommand(command({action:"update",quoteId:m.quoteId,lines:[{name:"move",billing:{kind:"movement",quantity:"2"}}]}));expect("totals" in mr&&mr.totals?.[0].amount).toBe("16");expect(movement.quotes.get(m.quoteId)?.lines[0]).toMatchObject({rate:"8",quantity:"2",unit:"movement"});
  const time=new QuoteSession("fill-time");await time.initialize([]);
  const t=await time.executeCommand(command({action:"create",pricing:"supplied",lines:[{name:"watch",currency:"USD",billing:{kind:"time",price:"17",duration:{hours:"4",minutes:"0"}}}]}));if(!("quoteId" in t))throw Error();time.beginStep();
  const tr=await time.executeCommand(command({action:"update",quoteId:t.quoteId,lines:[{name:"watch",billing:{kind:"time",periodHours:"2",commenced:true}}]}));expect("totals" in tr&&tr.totals?.[0].amount).toBe("34");expect(time.quotes.get(t.quoteId)?.lines[0]).toMatchObject({rate:"17",periodHours:"2",commenced:true,duration:{hours:"4",minutes:"0"}});
});

it("does not use call-wide movement or tonnage fallback for incomplete new line recipes", async () => {
  const session = new QuoteSession("no-call-fallback"); await session.initialize([]);
  const result = await session.executeCommand(command({ action: "create", pricing: "supplied", call: { movements: "9", cargoTonnes: "999" }, lines: [
    { name: "move", currency: "USD", billing: { kind: "movement", price: "8" } },
    { name: "parcel", currency: "USD", billing: { kind: "tonne", price: "2" } },
  ] }));
  expect(result.status).toBe("unresolved"); expect("totals" in result ? result.totals?.length ?? 0 : 0).toBe(0);
  expect(result.questions.join(" ")).toMatch(/move.*movement count/i); expect(result.questions.join(" ")).toMatch(/parcel.*cargo tonnage/i);
});

it("keeps explicit zero quantities and zero duration components distinct from missing facts", async () => {
  const session = new QuoteSession("explicit-zero"); await session.initialize([]);
  const result = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [
    { name: "jobs", currency: "USD", billing: { kind: "quantity", price: "12", quantity: "0", quantityLabel: "jobs" } },
    { name: "moves", currency: "USD", billing: { kind: "movement", price: "7", quantity: "0" } },
    { name: "watch", currency: "USD", billing: { kind: "time", price: "9", periodHours: "2", commenced: false, duration: { hours: "4", minutes: "0" } } },
  ] }));
  expect(result.status).toBe("calculated");
  expect("totals" in result && result.totals?.[0]).toMatchObject({ amount: "18", lineAmounts: ["0", "0", "18"] });
  expect(result.questions).toEqual([]);
});

it("keeps periods and denominators strictly positive", () => {
  const bad = [
    { kind: "time", price: "9", periodHours: "0", commenced: false },
    { kind: "quantity", price: "9", quantity: "0", quantityLabel: "jobs", perQuantity: "0" },
  ];
  for (const billing of bad) expect(quoteCommandSchema.safeParse({ action: "create", pricing: "supplied", lines: [{ name: "bad", currency: "USD", billing }] }).success).toBe(false);
});

it("normalizes nulls inside a tagged billing recipe at the real strict wire adapter", async () => {
  const schema = nullableToolSchema(quoteCommandSchema);
  const parsed = await schema.validate!({
    action: "create", quoteId: null, name: null, pricing: "supplied", vesselCategoryEvidence: null,
    call: null, services: null, removeLines: null, terms: null, readScope: null, reference: null,
    removeServices: null, removeUnsupportedServices: null, clearCallFields: null, scopeChangeEvidence: null,
    lines: [{ name: "watch", currency: "USD", billing: { kind: "time", price: "11", periodHours: "2", commenced: true, duration: { hours: "2.5", minutes: null }, perQuantity: null }, price: null, minimumDurationHours: "6", removeMinimumDuration: null, minimum: null, maximum: null, removeMinimum: null, removeMaximum: null, statedExtension: null, removeStatedExtension: null }],
  });
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  expect(parsed.value.lines?.[0]).toMatchObject({ billing: { kind: "time", price: "11", periodHours: "2", commenced: true, duration: { hours: "2.5" } }, minimumDurationHours: "6" });
});

it("uses independent generic line quantities instead of shared vessel movements", async () => {
  const session = new QuoteSession("line-quantity"), authority = new AuthoritySession();
  await session.initialize([{ role: "user", content: "Use the supplied launch and escort rates." }]);
  const { applied } = await propose(session, authority, {
    action: "create", pricing: "supplied", call: { movements: "2" }, lines: [
      { name: "launch", currency: "USD", billing: { kind: "quantity", price: "13.75", quantity: "3", quantityLabel: "launch jobs" } },
      { name: "escort", currency: "USD", billing: { kind: "quantity", price: "7.40", quantity: "5", quantityLabel: "escort jobs" } },
      { name: "pilot move", currency: "USD", billing: { kind: "movement", price: "6.25", quantity: "4" } },
    ],
  });
  expect(applied.totals?.[0]).toMatchObject({ amount: "103.25", lineAmounts: ["41.25", "37.00", "25.00"] });
  expect(applied.body).toMatch(/3 launch jobs.*13\.75/);
  expect(applied.body).toMatch(/5 escort jobs.*7\.4/);
  expect(applied.body).toMatch(/4 movements.*6\.25/);
});

it("supports an independent per-line tonne quantity", async () => {
  const session = new QuoteSession("line-tonnes"); await session.initialize([]);
  const result = await session.executeCommand(command({ action: "create", pricing: "supplied", call: { cargoTonnes: "999" }, lines: [{ name: "parcel", currency: "USD", billing: { kind: "tonne", price: "3.20", quantity: "12.5" } }] }));
  expect("totals" in result && result.totals?.[0].amount).toBe("40");
  expect(result.body).toMatch(/12\.5 tonnes.*3\.2/);
});

it.each([
  ["2.5", "33"],
  ["7", "44"],
] as const)("separates a six-hour duration floor from monetary bounds at %sh actual", async (hours, expected) => {
  const session = new QuoteSession(`duration-${hours}`), authority = new AuthoritySession();
  await session.initialize([{ role: "user", content: "Apply the supplied watch rate and six-hour minimum duration." }]);
  const { applied } = await propose(session, authority, {
    action: "create", pricing: "supplied", lines: [{ name: "watch", currency: "USD", billing: { kind: "time", price: "11", periodHours: "2", commenced: true, duration: { hours } }, minimumDurationHours: "6" }],
  });
  expect(applied.totals?.[0].amount).toBe(expected);
  expect(applied.body).toMatch(/minimum billable duration 6 hours/i);
});

it("keeps monetary minimum separate from duration and quantity", async () => {
  const session = new QuoteSession("money-floor"), authority = new AuthoritySession();
  await session.initialize([{ role: "user", content: "Use the supplied job rate with its monetary call minimum." }]);
  const { applied } = await propose(session, authority, {
    action: "create", pricing: "supplied", lines: [{ name: "job", currency: "USD", billing: { kind: "quantity", price: "4", quantity: "3", quantityLabel: "jobs" }, minimum: { amount: "50", per: "call" } }],
  });
  expect(applied.totals?.[0].amount).toBe("50");
  expect(applied.body).toMatch(/minimum USD 50\/call/i);
});

it("price-only correction preserves duration, quantity, currency and monetary bounds through approval and reload", async () => {
  const session = new QuoteSession("price-only"), firstAuthority = new AuthoritySession();
  await session.initialize([{ role: "user", content: "Use the supplied watch rate and all stated constraints." }]);
  const first = await propose(session, firstAuthority, {
    action: "create", pricing: "supplied", lines: [{ name: "watch", currency: "USD", billing: { kind: "time", price: "11", periodHours: "2", commenced: true, duration: { hours: "2.5" } }, minimumDurationHours: "6", minimum: { amount: "50", per: "call" }, maximum: { amount: "95", per: "call" } }],
  });
  const nextAuthority = new AuthoritySession({ quotes: [AuthoritySession.binding(quoteCore(first.operation.quote))], comparisons: [] });
  session.bindAuthority(nextAuthority); session.beginStep();
  const changed = await propose(session, nextAuthority, { action: "update", quoteId: first.applied.quoteId, lines: [{ name: "watch", price: "20.25" }] });
  expect(changed.applied.totals?.[0].amount).toBe("60.75");
  expect(changed.applied.record.quote.lines[0]).toMatchObject({ currency: "USD", rate: "20.25", unit: "time", periodHours: "2", commenced: true, duration: { hours: "2.5" }, minimumDurationHours: "6", minimum: { amount: "50", per: "call" }, maximum: { amount: "95", per: "call" } });

  const reload = new QuoteSession("price-only");
  await reload.initialize([receipt(first.applied, "first"), receipt(changed.applied, "changed")]);
  expect(reload.quotes.get(first.applied.quoteId)?.lines[0]).toEqual(changed.applied.record.quote.lines[0]);
});

it("uniform price correction cannot masquerade as a flat-to-rate kind change", async () => {
  const session = new QuoteSession("flat-price"); await session.initialize([]);
  const created = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [{ name: "permit", currency: "USD", billing: { kind: "flat", price: "83", basis: "user-stated-flat" } }] }));
  if (!("quoteId" in created)) throw new Error("Missing quote");
  session.beginStep();
  const corrected = await session.executeCommand(command({ action: "update", quoteId: created.quoteId, lines: [{ name: "permit", price: "6.5" }] }));
  expect("totals" in corrected && corrected.totals?.[0].amount).toBe("6.5");
  expect(session.quotes.get(created.quoteId)?.lines[0]).toMatchObject({ amount: "6.5", amountBasis: "user-stated-flat", unit: "amount" });
  expect(session.quotes.get(created.quoteId)?.lines[0]).not.toHaveProperty("rate");
});

it("same-kind full recipe update retains omitted governing quantities and constraints", async () => {
  const session = new QuoteSession("same-kind"); await session.initialize([]);
  const created = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [{ name: "watch", currency: "USD", billing: { kind: "time", price: "9", periodHours: "3", commenced: true, duration: { hours: "4" } }, minimumDurationHours: "6", minimum: { amount: "40", per: "call" } }] }));
  if (!("quoteId" in created)) throw new Error("Missing quote");
  session.beginStep();
  await session.executeCommand(command({ action: "update", quoteId: created.quoteId, lines: [{ name: "watch", billing: { kind: "time", price: "12", periodHours: "2", commenced: false } }] }));
  expect(session.quotes.get(created.quoteId)?.lines[0]).toMatchObject({ rate: "12", unit: "time", periodHours: "2", commenced: false, duration: { hours: "4" }, minimumDurationHours: "6", minimum: { amount: "40", per: "call" } });
});

it("full unit replacement clears old dimensions only when incompatible constraints are explicitly removed", async () => {
  const session = new QuoteSession("unit-replace"); await session.initialize([]);
  const created = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [{ name: "watch", currency: "USD", billing: { kind: "time", price: "11", periodHours: "2", commenced: true, duration: { hours: "2.5" } }, minimumDurationHours: "6", minimum: { amount: "50", per: "call" } }] }));
  if (!("quoteId" in created)) throw new Error("Missing quote");
  session.beginStep();
  const blocked = await session.executeCommand(command({ action: "update", quoteId: created.quoteId, lines: [{ name: "watch", billing: { kind: "quantity", price: "20", quantity: "3", quantityLabel: "jobs" } }] }));
  expect(blocked).toMatchObject({ status: "error" });
  expect(blocked.body).toMatch(/remove.*minimum billable duration|minimum billable duration.*remove/i);
  expect(session.quotes.get(created.quoteId)?.lines[0].unit).toBe("time");

  const replaced = await session.executeCommand(command({ action: "update", quoteId: created.quoteId, lines: [{ name: "watch", billing: { kind: "quantity", price: "20", quantity: "3", quantityLabel: "jobs" }, removeMinimumDuration: true }] }));
  expect("totals" in replaced && replaced.totals?.[0].amount).toBe("60");
  expect(session.quotes.get(created.quoteId)?.lines[0]).toMatchObject({ rate: "20", unit: "quantity", quantity: "3", quantityLabel: "jobs", minimum: { amount: "50", per: "call" } });
  expect(session.quotes.get(created.quoteId)?.lines[0]).not.toHaveProperty("periodHours");
  expect(session.quotes.get(created.quoteId)?.lines[0]).not.toHaveProperty("duration");
  expect(session.quotes.get(created.quoteId)?.lines[0]).not.toHaveProperty("minimumDurationHours");
});

it("checks a stated extension after backend quantity arithmetic and rounding", async () => {
  const session = new QuoteSession("extension"), authority = new AuthoritySession(); session.bindAuthority(authority);
  await session.initialize([{ role: "user", content: "Use the supplied unit rate, quantity, stated extension and line rounding." }]);
  const mismatch = await session.executeCommand(command({ action: "create", pricing: "supplied", terms: { rounding: { stage: "line", decimals: 2 } }, lines: [{ name: "units", currency: "USD", billing: { kind: "quantity", price: "2.345", quantity: "7", quantityLabel: "items" }, statedExtension: "16.40" }] }));
  expect(mismatch).not.toHaveProperty("approvalRequired");
  expect(mismatch.questions.join(" ")).toMatch(/stated extension.*16\.4.*16\.42/i);
  if (!("quoteId" in mismatch)) throw new Error("Draft missing");
  session.beginStep();
  const corrected = await session.executeCommand(command({ action: "update", quoteId: mismatch.quoteId, lines: [{ name: "units", statedExtension: "16.42" }] }));
  expect(corrected).toHaveProperty("approvalRequired", true);
});

it("shows an explicitly unapproved subtotal while retaining an unresolved unpriced line", async () => {
  const session = new QuoteSession("partial-budget"), authority = new AuthoritySession(); session.bindAuthority(authority);
  await session.initialize([{ role: "user", content: "Budget the known launch amount and retain the unpriced standby line." }]);
  const result = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [
    { name: "launch", currency: "USD", billing: { kind: "flat", price: "137", basis: "user-stated-flat" } },
    { name: "standby", currency: "USD" },
  ] }));
  expect(result).not.toHaveProperty("approvalRequired"); expect(authority.hasPending()).toBe(false);
  expect(result.body).toMatch(/Unapproved identified subtotal/i);
  expect(result.body).toContain("USD 137.00");
  expect(result.body).not.toMatch(/Total of supplied lines/i);
  expect(result.questions.join(" ")).toMatch(/standby.*amount|standby.*rate/i);
});

it("preserves individually grounded supplied metadata without requiring synthetic cooccurrence context", async () => {
  const session = new QuoteSession("literal-metadata"), authority = new AuthoritySession();
  await session.initialize([{ role: "user", content: "Use label Harbor [A&B] #7. Supplier reference R_[9]. The booked location is Dock | <East>. Supplied berth amount USD 83." }]);
  const { applied } = await propose(session, authority, { action: "create", name: "Harbor [A&B] #7", pricing: "supplied", call: { reference: "R_[9]", port: "Dock | <East>" }, lines: [{ name: "berth *core*", currency: "USD", billing: { kind: "flat", price: "83", basis: "user-stated-flat" } }] });
  expect(applied.record.quote.call).toMatchObject({ reference: "R_[9]", port: "Dock | <East>" });
  session.beginStep();
  const read = await session.executeCommand({ action: "read", readScope: "current-chat", quoteId: applied.quoteId });
  expect(read.body).toContain("Harbor \\[A&amp;B\\] \\#7");
  expect(read.body).toContain("R\\_\\[9\\]");
  expect(read.body).toContain("Dock \\| &lt;East&gt;");
  expect(read.body).toContain("berth \\*core\\*");
});

it("escapes Markdown syntax without deleting visible punctuation", () => {
  expect(safe("Dock | <East> *A* [B] #7")).toBe("Dock \\| &lt;East&gt; \\*A\\* \\[B\\] \\#7");
});

it("rejects a pricing-mode change before mode-specific metadata validation", async () => {
  const session = new QuoteSession("mode-order"); await session.initialize([]);
  const created = await session.executeCommand({ action: "create", pricing: "official", services: ["berth"], call: { port: "Redi", gt: "8123" } });
  if (!("quoteId" in created)) throw new Error("Missing quote");
  const result = await session.executeCommand(command({ action: "update", quoteId: created.quoteId, pricing: "supplied", call: { reference: "not grounded" } }));
  expect(result).toMatchObject({ status: "error" });
  expect(result.body).toMatch(/cannot become.*create a separate quotation/i);
  expect(result.body).not.toMatch(/reference.*grounded|official-source request/i);
});

it("rejects ignored model-supplied rounding on official pricing and routes invoice rounding through source scope", async () => {
  const rejected = new QuoteSession("official-rounding-rejected"); await rejected.initialize([]);
  const bad = await rejected.executeCommand({ action: "create", pricing: "official", services: ["berth"], call: { port: "BMCT", gt: "8231", callDate: "19 October 2026", service: "foreign", occupancy: { hours: "1" } }, terms: { rounding: { stage: "total", decimals: 2 } } });
  expect(bad).toMatchObject({ status: "error" }); expect(bad.body).toMatch(/official-source.*rounding.*(?:rounding service|reportingRounding)/i); expect(rejected.quotes.size).toBe(0);

  const routed = new QuoteSession("official-rounding-service"); await routed.initialize([]);
  const result = await routed.executeCommand({ action: "create", pricing: "official", services: ["berth", "rounding"], call: { port: "BMCT", gt: "8231", callDate: "19 October 2026", service: "foreign", occupancy: { hours: "1" } } });
  expect(result.status).toBe("unresolved");
  expect(`${result.body} ${result.questions.join(" ")} ${("limitations" in result ? result.limitations ?? [] : []).join(" ")}`).toMatch(/rounding.*combined|combined.*rounding/i);
});
