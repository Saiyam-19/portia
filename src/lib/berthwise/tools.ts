import "server-only";
import { tool, type ToolSet } from "ai";
import Decimal from "decimal.js";
import { z } from "zod";
import { portBooks, resolvePort, type PortMatch } from "./rulebook/books";
import { estimate, money, versionFor, type Estimate, type EstimateRequest } from "./rulebook/calculate";
import { coverage, describeTariff, type TariffView } from "./rulebook/describe";
import { CHARGE_GROUPS, type CompanyExcerptsCard, type ComparisonCard, type CoverageCard, type DocumentExcerptsCard, type EstimateCall, type EstimateCard, type FleetCard, type ShipCard, type TariffCard, type TariffComparisonCard } from "./card-types";
import { searchDocuments } from "./documents";
import { keepRate, keepShip, keepStay, readConversation, type Conversation } from "./user-input";
import { fleetShipSchema, findShip, type FleetAccess, type FleetShip } from "./fleet";
import { applyAgreedRates, type AgreedRate } from "./agreed-rates";
import type { CompanyAccess } from "./account-access";
import { freshnessNotices, tariffNotices, type SourceStatus } from "./rulebook/watch";
import { chargeTypeSchema, statusSchema, vesselTypeSchema, type ChargeType, type PortBook } from "./rulebook/schema";

/** Berthwise business tools. Each returns { card, summary }: the card is drawn on
 * screen, the summary is what later turns of the chat remember. */

const today = () => new Date().toISOString().slice(0, 10);
const decimalText = (what: string) => z.preprocess(
  value => typeof value === "number" ? String(value) : typeof value === "string" ? value.replace(/,/g, "").trim() : value,
  z.string().regex(/^\d+(?:\.\d+)?$/, "Use digits only, e.g. 32450 or 0.5."),
).describe(what);
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Call date as YYYY-MM-DD, only when the user gave one. Leave out for today.");

const shipSchema = z.object({
  name: z.string().min(1).max(80).optional().describe("The ship's name. A ship saved in the user's fleet fills in its own details."),
  imo: z.string().regex(/^\d{7}$/).optional().describe("7-digit IMO number, only if given."),
  grt: decimalText("Gross tonnage (GRT or GT).").optional(),
  nrt: decimalText("Net tonnage (NRT), only if given.").optional(),
  loa: decimalText("Length overall in metres, only if given.").optional(),
  type: vesselTypeSchema.optional().describe("Ship type. Leave out if unknown: the port's usual type is assumed and shown."),
  status: statusSchema.optional().describe("foreign: foreign-going (international voyage). coastal: Indian coastal voyage. Leave out if unknown."),
}).strict();

const stay = {
  hoursAlongside: decimalText("Hours alongside the berth, from first line to last line off.").optional(),
  anchorageHours: decimalText("Hours waiting at anchorage, only if the user mentions anchorage.").optional(),
  tugs: z.number().int().min(0).max(10).optional().describe("Tugs used, only if given."),
  cargo: z.object({
    class: z.string().min(1).max(40).optional().describe("Cargo kind, e.g. coal, iron-ore, steel, fertilizer, containers."),
    tonnes: decimalText("Cargo tonnes handled.").optional(),
    teu: decimalText("Containers handled, in TEU.").optional(),
  }).strict().optional(),
};

const callSchema = z.object({
  port: z.string().min(1).max(120).describe("Just the port, terminal or berth name as the user wrote it, e.g. 'Nhava Sheva', 'Kandla', 'NSICT'."),
  terminal: z.string().min(1).max(120).optional(),
  berth: z.string().min(1).max(120).optional(),
  date: dateText.optional(),
  ...stay,
}).strict();

const usdToInr = decimalText("Rupees per US dollar, only when the user gives an exchange rate. Never estimate one.").optional();
const chargesField = z.array(chargeTypeSchema).min(1).max(9).optional().describe("Only when the user asks for particular charges, e.g. 'just berth hire'. Leave out for berthing charges, port costs or the cost of a call: those mean the whole standard bill.");

type Place = { match: PortMatch; dropped?: string } | { error: string };
const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Models tend to fill optional fields with placeholders ("Unspecified berth", IMO 0000000,
// NRT 0). Those mean "not given" and must never price anything.
const PLACEHOLDER = /^(?:|n ?a|none|null|nil|unknown|unspecified|not (?:given|specified|provided|known)|any|tbc|tbd|default|standard|general|other|main|0+)$/;
const GENERIC = new Set(["unspecified", "unknown", "ship", "vessel", "the", "a", "an", "our", "my", "bulk", "carrier", "tanker", "container", "general", "cargo", "lng", "lpg", "chemical", "ro", "passenger", "foreign", "coastal", "going", "berth", "terminal", "port", "jetty", "any", "default"]);
const meant = (text?: string) => { const value = text?.trim(); return value && !PLACEHOLDER.test(norm(value)) && !norm(value).split(" ").every(word => GENERIC.has(word)) ? value : undefined; };
const positive = (text?: string) => text !== undefined && Number(text) > 0 ? text : undefined;
const validImo = (imo?: string) => imo && /^\d{7}$/.test(imo) && !/^0+$/.test(imo) ? imo : undefined;

function cleanShip(ship: Ship): Ship {
  const name = meant(ship.name), imo = validImo(ship.imo), grt = positive(ship.grt), nrt = positive(ship.nrt), loa = positive(ship.loa);
  return { ...(name ? { name } : {}), ...(imo ? { imo } : {}), ...(grt ? { grt } : {}), ...(nrt ? { nrt } : {}), ...(loa ? { loa } : {}), ...(ship.type ? { type: ship.type } : {}), ...(ship.status ? { status: ship.status } : {}) };
}
/** Drops zeros and placeholders, and what the user never said (see user-input.ts). */
function cleanStay<T extends Stay>(given: T, heard?: Conversation): T {
  const stay = keepStay(given, heard);
  const cargo = stay.cargo && (positive(stay.cargo.tonnes) || positive(stay.cargo.teu))
    ? { ...(meant(stay.cargo.class) ? { class: stay.cargo.class } : {}), ...(positive(stay.cargo.tonnes) ? { tonnes: stay.cargo.tonnes } : {}), ...(positive(stay.cargo.teu) ? { teu: stay.cargo.teu } : {}) } : undefined;
  const { hoursAlongside, anchorageHours, tugs, cargo: _cargo, ...rest } = stay;
  return {
    ...rest, ...(positive(hoursAlongside) ? { hoursAlongside } : {}), ...(positive(anchorageHours) ? { anchorageHours } : {}),
    ...(tugs !== undefined && tugs > 0 ? { tugs } : {}), ...(cargo ? { cargo } : {}),
  } as T;
}

function place(input: { port: string; terminal?: string; berth?: string }): Place {
  const found = resolvePort(input.port);
  const covered = () => portBooks().map(port => port.name).join(", ");
  if (!found) return { error: `"${input.port}" isn't one of the ports we cover: ${covered()}.` };
  if ("candidates" in found) return { error: `"${input.port}" could mean ${found.candidates.join(" or ")}. Ask which one.` };
  const match: PortMatch = { ...found };
  const ownNames = [found.port.id, found.port.name, ...found.port.aliases].map(norm);
  const pick = (name: string, level: "terminal" | "berth") => {
    const wanted = norm(name);
    const fits = (alias: string) => norm(alias) === wanted || (wanted.length >= 3 && norm(alias).split(" ").join(" ").includes(wanted));
    for (const terminal of found.port.terminals) {
      if (level === "terminal" && [terminal.id, terminal.name, ...terminal.aliases].some(fits)) return { terminal: terminal.id };
      for (const berth of terminal.berths) if (level === "berth" && [berth.id, berth.name, ...berth.aliases].some(fits)) return { terminal: terminal.id, berth: berth.id };
    }
    return undefined;
  };
  const dropped: string[] = [];
  for (const level of ["terminal", "berth"] as const) {
    const name = meant(input[level]);
    // A port whose rates don't vary by terminal or berth needs neither; the port's own name is no terminal.
    if (!name || !found.port.terminals.length || ownNames.includes(norm(name))) continue;
    const hit = pick(name, level) ?? pick(name, level === "terminal" ? "berth" : "terminal");
    if (hit) Object.assign(match, hit);
    else dropped.push(name);
  }
  if (!dropped.length) return { match };
  const options = found.port.terminals.flatMap(t => [t.name, ...t.berths.map(b => b.name)]);
  return { match, dropped: `${found.port.name} has no terminal or berth called ${dropped.map(name => `"${name}"`).join(" or ")} in our rule book, so it was left out. It lists: ${options.join("; ")}.` };
}

type Ship = z.infer<typeof shipSchema>;
type Stay = { hoursAlongside?: string; anchorageHours?: string; tugs?: number; cargo?: { class?: string; tonnes?: string; teu?: string }; date?: string };

function request(match: PortMatch, ship: Ship, details: Stay, charges?: ChargeType[]): EstimateRequest {
  return {
    ...(details.date ? { date: details.date } : {}),
    ...(match.terminal ? { terminal: match.terminal } : {}), ...(match.berth ? { berth: match.berth } : {}),
    ...(ship.status ? { status: ship.status } : {}), ...(ship.type ? { vesselType: ship.type } : {}),
    ...(ship.grt ? { grt: ship.grt } : {}), ...(ship.nrt ? { nrt: ship.nrt } : {}), ...(ship.loa ? { loa: ship.loa } : {}),
    ...(details.hoursAlongside ? { hours: details.hoursAlongside } : {}), ...(details.anchorageHours ? { anchorageHours: details.anchorageHours } : {}),
    ...(details.tugs !== undefined ? { tugs: details.tugs } : {}), ...(details.cargo ? { cargo: details.cargo } : {}),
    ...(charges?.length ? { charges } : {}),
  };
}

/** Where berths differ by cargo and the ship type settles it (a tanker at Kandla's liquid
 * berths), that berth is assumed and shown instead of asked. */
function likelyBerth(match: PortMatch, type?: string): { match: PortMatch; assumption?: string } {
  if (match.berth || !type) return { match };
  const want = ["tanker", "vlcc", "chemical", "lng", "lpg"].includes(type) ? /liquid|lpg|chemical|tanker|oil/ : type === "container" ? /container/ : undefined;
  if (!want) return { match };
  const berths = match.port.terminals.filter(terminal => !match.terminal || terminal.id === match.terminal)
    .flatMap(terminal => terminal.berths.map(berth => ({ terminal: terminal.id, berth })));
  const fits = berths.filter(item => want.test(`${item.berth.id} ${item.berth.name}`.toLowerCase()));
  if (fits.length !== 1) return { match };
  return { match: { ...match, terminal: fits[0]!.terminal, berth: fits[0]!.berth.id }, assumption: `Assumed the ${fits[0]!.berth.name.toLowerCase()}, as for a ${type.replace("-", " ")} ship.` };
}

/** The same ship must be assumed at every port of a voyage or comparison. */
function sameShip(ports: PortBook[], ship: Ship, dates: Array<string | undefined>): Ship {
  const first = versionFor(ports[0]!, dates[0] ?? today());
  return { ...ship, status: ship.status ?? first?.defaults.status ?? "foreign", type: ship.type ?? first?.defaults.vesselType ?? "general-cargo" };
}

type Total = { currency: string; amount: string; display: string };
function addTotals(lists: Total[][]): Total[] {
  const sums = new Map<string, Decimal>();
  for (const list of lists) for (const total of list) sums.set(total.currency, (sums.get(total.currency) ?? new Decimal(0)).plus(total.amount));
  return [...sums].map(([currency, amount]) => ({ currency, amount: amount.toString(), display: money(amount, currency) }));
}
function inRupees(totals: Total[], rate?: string): Total | undefined {
  if (!rate || !totals.length || (totals.length === 1 && totals[0]!.currency === "INR")) return undefined;
  const amount = totals.reduce((sum, total) => sum.plus(new Decimal(total.amount).mul(total.currency === "USD" ? rate : 1)), new Decimal(0));
  return { currency: "INR", amount: amount.toString(), display: money(amount, "INR") };
}
const said = (totals: Total[]) => totals.length ? totals.map(total => `${total.currency} ${total.display}`).join(" + ") : "nothing priced";

function describeShip(ship: Ship) {
  return [ship.name, ship.status && (ship.status === "foreign" ? "foreign-going" : "coastal"), ship.type?.replace("-", " "), ship.grt && `${Number(ship.grt).toLocaleString("en-US")} GRT`].filter(Boolean).join(", ");
}
function summarise(result: Estimate, role?: string) {
  const head = `${role ? role + ": " : ""}${result.port.name}${result.terminal ? ` (${result.terminal})` : ""}, schedule ${result.version.id} from ${result.version.effectiveFrom}`;
  return [
    `${head}. Total before GST: ${said(result.totals)}.`,
    result.lines.length ? `Lines: ${result.lines.map(line => `${line.label} ${line.currency} ${line.display}`).join("; ")}.` : "",
    result.assumptions.length ? `Assumed: ${result.assumptions.join(" ")}` : "",
    result.notCovered.length ? `Not priced: ${result.notCovered.map(item => item.reason).join(" ")}` : "",
    result.questions.length ? `Still needed: ${result.questions.join(" ")}` : "",
  ].filter(Boolean).join(" ");
}

const title = (type: string) => { const text = type.replace(/-/g, " "); return text[0]!.toUpperCase() + text.slice(1).toLowerCase(); };
const exchangeNote = (port: PortBook, date: string) => versionFor(port, date)?.exchangeRate;

/** Fills in what the user didn't say from their saved ship, when they name one. */
async function withFleet(ship: Ship, fleet?: FleetAccess): Promise<{ ship: Ship; filled: string[]; saved?: FleetShip }> {
  if (!fleet || (!ship.name && !ship.imo)) return { ship, filled: [] };
  let saved: FleetShip | undefined;
  try { saved = findShip(await fleet.list(), { name: ship.name, imo: ship.imo }); } catch { return { ship, filled: [] }; }
  if (!saved) return { ship, filled: [] };
  const filled: string[] = [];
  const pick = <K extends "grt" | "nrt" | "loa" | "type" | "status" | "imo">(key: K, label: string) => {
    if (ship[key] === undefined && saved![key] !== undefined) filled.push(label);
    return ship[key] ?? saved![key];
  };
  const merged: Ship = { name: saved.name, imo: pick("imo", "IMO number"), grt: pick("grt", "GRT"), nrt: pick("nrt", "NRT"), loa: pick("loa", "length"), type: pick("type", "ship type"), status: pick("status", "trade") };
  return { ship: Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined)) as Ship, filled, saved };
}
const shipView = (ship: FleetShip) => [ship.name, ship.imo && `IMO ${ship.imo}`, `${Number(ship.grt).toLocaleString("en-US")} GRT`, ship.nrt && `${Number(ship.nrt).toLocaleString("en-US")} NRT`, ship.loa && `${ship.loa} m long`, ship.type?.replace("-", " "), ship.status && (ship.status === "foreign" ? "foreign-going" : "coastal")].filter(Boolean).join(", ");

export function businessTools(options: { fleet?: FleetAccess; company?: CompanyAccess; sources?: () => Promise<SourceStatus[]> } = {}): ToolSet {
  const { fleet, company, sources } = options;
  const statuses = async () => { try { return sources ? await sources() : []; } catch { return []; } };
  return {
    estimate_port_call: tool({
      description: "Itemised port-call charges (port dues, pilotage, towage, berth hire, mooring and other standard charges; anchorage and wharfage when their inputs are given) from the reviewed rule book, with the working and source page of every line and a total before GST. Give one call, or a departure and an arrival call for a voyage (both are priced for the same ship and added up). Not for comparing ports: use compare_ports for that. Missing facts are assumed and listed; anything that would change the price a lot comes back as a question.",
      inputSchema: z.object({
        ship: shipSchema,
        calls: z.array(callSchema).min(1).max(2).describe("One call, or [departure, arrival] for a voyage the ship actually makes. Never two ports to compare them."),
        charges: chargesField,
        usdToInr,
      }).strict(),
      execute: async ({ ship: given, calls: asked, charges, usdToInr: offered }, { messages }) => {
        const heard = readConversation(messages);
        const rate = keepRate(offered, heard);
        const { ship, filled } = await withFleet(keepShip(cleanShip(given), heard), fleet);
        const calls = asked.map(call => cleanStay(call, heard));
        const places = calls.map(place);
        const failed = places.find((item): item is { error: string } => "error" in item);
        if (failed) return { error: failed.error };
        const matches = places.map(item => (item as { match: PortMatch }).match);
        const voyage = calls.length === 2;
        const vessel = voyage ? sameShip(matches.map(m => m.port), ship, calls.map(c => c.date)) : ship;
        let agreedRates: AgreedRate[] = [];
        try { agreedRates = company ? await company.agreedRates() : []; } catch { agreedRates = []; }
        const changed = await statuses();
        const results = calls.map((call, index) => {
          const berth = likelyBerth(matches[index]!, vessel.type);
          const result = estimate(matches[index]!.port, request(berth.match, vessel, call, charges));
          if (berth.assumption) result.assumptions.push(berth.assumption);
          const dropped = (places[index] as { dropped?: string }).dropped;
          if (dropped) result.assumptions.push(dropped);
          const agreed = applyAgreedRates(result, agreedRates);
          const notices = freshnessNotices(matches[index]!.port, result, changed, call.date ?? today());
          const role: EstimateCall["role"] = voyage ? (index === 0 ? "departure" : "arrival") : undefined;
          const fx = exchangeNote(matches[index]!.port, result.version.effectiveFrom || today());
          return { ...(role ? { role } : {}), estimate: result, ...(notices.length ? { notices } : {}), ...(agreed ? { agreed } : {}), ...(fx ? { exchangeRate: fx } : {}), notes: versionFor(matches[index]!.port, call.date ?? today())?.notes.map(n => n.text) ?? [] };
        });
        const voyageTotals = voyage ? addTotals(results.map(r => r.estimate.totals)) : undefined;
        const rupees = rate ? {
          usdToInr: rate,
          calls: results.map(r => ({ port: r.estimate.port.name, total: inRupees(r.estimate.totals, rate) })),
          ...(voyageTotals ? { voyage: inRupees(voyageTotals, rate) } : {}),
        } : undefined;
        const card: EstimateCard = { kind: "estimate", ship: { ...vessel }, calls: results, ...(voyageTotals ? { voyageTotals } : {}), ...(rupees ? { inRupees: rupees } : {}), ...(filled.length ? { fromFleet: filled } : {}) };
        const summary = [
          `Estimate for ${describeShip(vessel) || "the ship"}.`,
          filled.length ? `From the user's fleet: ${filled.join(", ")}.` : "",
          ...results.map(r => summarise(r.estimate, r.role) + (r.notices ? ` Check: ${r.notices.join(" ")}` : "") + (r.agreed ? ` With the company's agreed rates (${r.agreed.rows.map(row => `${row.label}: ${row.basis}`).join("; ")}): ${said(r.agreed.totals)}.` : "")),
          voyageTotals ? `Voyage total before GST: ${said(voyageTotals)}.` : "",
          rupees ? `At ${rate} rupees per US dollar: ${rupees.calls.map(c => `${c.port} INR ${c.total?.display ?? "n/a"}`).join("; ")}${rupees.voyage ? `; voyage INR ${rupees.voyage.display}` : ""}.` : "",
        ].filter(Boolean).join(" ");
        return { card, summary };
      },
    }),

    compare_ports: tool({
      description: "Compare 2 to 4 ports for the same ship (which is cheaper, how they differ). view 'berth-hire': berth hire only. view 'whole-bill': every standard charge side by side with totals. view 'tariff': how each port charges (rates, bands, minimums, conditions) without needing ship figures. A charge a port doesn't publish is shown as missing, never as zero.",
      inputSchema: z.object({
        ports: z.array(z.string().min(1).max(120)).min(2).max(4).describe("Ports, terminals or berths as the user wrote them."),
        view: z.enum(["berth-hire", "whole-bill", "tariff"]),
        ship: shipSchema,
        date: dateText.optional(),
        ...stay,
        usdToInr,
      }).strict(),
      execute: async ({ ports, view, ship: given, date, usdToInr: offered, ...asked }, { messages }) => {
        const heard = readConversation(messages);
        const rate = keepRate(offered, heard);
        const { ship } = await withFleet(keepShip(cleanShip(given), heard), fleet);
        const details = cleanStay(asked, heard);
        const places = ports.map(name => place({ port: name }));
        const failed = places.find((item): item is { error: string } => "error" in item);
        if (failed) return { error: failed.error };
        const matches = places.map(item => (item as { match: PortMatch }).match);
        const vessel = sameShip(matches.map(m => m.port), ship, [date]);
        const when = date ?? today();
        if (view === "tariff") {
          const views = matches.map(m => describeTariff(m.port, { date: when, status: vessel.status, vesselType: vessel.type, ...(m.terminal ? { terminal: m.terminal } : {}) }));
          const card: TariffComparisonCard = { kind: "tariff-comparison", ship: vessel, date: when, ports: views.map((v, i) => v ?? { port: { id: matches[i]!.port.id, name: matches[i]!.port.name }, missing: `No schedule we hold covers ${when}.` }) };
          const summary = `Tariff comparison for a ${describeShip(vessel)} on ${when}: ` + views.map((v, i) => v
            ? `${v.port.name} (schedule from ${v.version.effectiveFrom}): ${v.charges.map(c => `${c.label}: ${c.rates.map(r => r.text).join(" / ")}`).join("; ")}`
            : `${matches[i]!.port.name}: no schedule for this date`).join(". ");
          return { card, summary: summary.slice(0, 4000) };
        }
        const charges: ChargeType[] | undefined = view === "berth-hire" ? ["berth-hire"] : undefined;
        const results = matches.map(m => {
          const berth = likelyBerth(m, vessel.type);
          const result = estimate(m.port, request(berth.match, vessel, { ...details, date }, charges));
          if (berth.assumption) result.assumptions.push(berth.assumption);
          return result;
        });
        const rows = CHARGE_GROUPS.map(group => ({
          key: group.key, label: group.label,
          cells: results.map(result => {
            const lines = result.lines.filter(line => group.types.includes(line.type));
            if (lines.length) return { totals: addTotals(lines.map(line => [{ currency: line.currency, amount: line.amount, display: line.display }])), lines: lines.map(line => line.label) };
            const missing = result.notCovered.find(item => group.types.includes(item.type));
            return missing ? { missing: missing.reason } : undefined;
          }),
        })).filter(row => row.cells.some(Boolean));
        const totals = results.map(result => result.totals);
        const comparable = rate ? totals.map(list => inRupees(list, rate) ?? list[0]) : totals.map(list => list.length === 1 ? list[0] : undefined);
        const currencies = new Set(comparable.map(total => total?.currency));
        // Only whole bills can be ranked: no open question and no charge left unpriced at any port.
        const gaps = results.flatMap(result => [
          ...result.questions.map(() => `${result.port.name} still needs an answer`),
          ...result.notCovered.map(item => `${result.port.name} has ${item.type === "all" ? "no schedule for this date" : `no price for ${title(String(item.type))}`}`),
        ]);
        const complete = !gaps.length;
        const ranking = complete && currencies.size === 1 && !currencies.has(undefined)
          ? comparable.map((total, index) => ({ port: results[index]!.port.name, total: total! })).sort((a, b) => new Decimal(a.total.amount).cmp(b.total.amount))
          : undefined;
        const card: ComparisonCard = {
          kind: "comparison", view, ship: vessel, ...(date ? { date } : {}), hoursAlongside: details.hoursAlongside,
          ports: results.map(result => ({ port: result.port, terminal: result.terminal, berth: result.berth, version: result.version, totals: result.totals, assumptions: result.assumptions, questions: result.questions, notCovered: result.notCovered, checkedOn: result.checkedOn })),
          rows, estimates: results, ...(ranking ? { ranking } : {}), ...(rate ? { usdToInr: rate } : {}),
          ...(!ranking ? { notRanked: !complete ? `The totals aren't comparable: ${[...new Set(gaps)].join("; ")}.` : "The totals are in different currencies; give an exchange rate to rank them." } : {}),
        };
        const summary = [
          `${view === "berth-hire" ? "Berth hire" : "Whole-bill"} comparison for a ${describeShip(vessel)}${details.hoursAlongside ? `, ${details.hoursAlongside} hours alongside` : ""}.`,
          ...results.map(result => summarise(result)),
          ranking ? `Cheapest first: ${ranking.map(item => `${item.port} ${item.total.currency} ${item.total.display}`).join("; ")}.` : `Not ranked: ${card.notRanked} Don't say which port is cheaper.`,
        ].filter(Boolean).join(" ");
        return { card, summary };
      },
    }),

    port_tariff: tool({
      description: "How one port charges ships: each charge with its rates, bands, minimums and conditions in plain words, the schedule in force and its source documents, when the rates were last checked, notes on anything not priced, and what changed since the previous schedule.",
      inputSchema: z.object({
        port: z.string().min(1).max(120),
        date: dateText.optional(),
        status: statusSchema.optional(),
        vesselType: vesselTypeSchema.optional(),
      }).strict(),
      execute: async ({ port: name, date, status, vesselType }) => {
        const found = place({ port: name });
        if ("error" in found) return { error: found.error };
        const when = date ?? today();
        const view: TariffView | undefined = describeTariff(found.match.port, { date: when, status, vesselType, ...(found.match.terminal ? { terminal: found.match.terminal } : {}) });
        if (!view) return { error: `No ${found.match.port.name} schedule we hold covers ${when}. We hold: ${found.match.port.versions.map(v => `${v.effectiveFrom}${v.effectiveTo ? " to " + v.effectiveTo : " onwards"}`).join("; ")}.` };
        const notices = tariffNotices(found.match.port, view.version.id, await statuses(), when);
        const summary = (notices.length ? `Check: ${notices.join(" ")} ` : "") + `${view.port.name} schedule ${view.version.id} (from ${view.version.effectiveFrom}${view.version.effectiveTo ? ` to ${view.version.effectiveTo}` : ""}, checked ${view.checkedOn}): `
          + view.charges.map(charge => `${charge.label}: ${charge.rates.map(rate => `${rate.appliesTo}: ${rate.text}`).join(" / ")}`).join("; ")
          + (view.changes ? `. Changes since ${view.changes.since.effectiveFrom}: ${view.changes.items.map(item => `${item.label}: ${item.before ?? "new"} -> ${item.after ?? "removed"}`).join("; ") || "none"}` : "");
        const card: TariffCard = { kind: "tariff", ...view, ...(notices.length ? { notices } : {}) };
        return { card, summary: summary.slice(0, 4000) };
      },
    }),

    search_port_documents: tool({
      description: "Search the ports' own documents (berth particulars, berthing policies, pilotage and navigation rules, arrival documents and declarations, working timings, and the rate schedules' conditions). Returns whole pages with their title, date and page number. Answer only from what they say, and cite the document and page.",
      inputSchema: z.object({
        question: z.string().min(2).max(300).describe("What to look for, in the document's likely words, e.g. 'permissible draft at berths' or 'documents required before arrival'."),
        port: z.string().min(1).max(120).optional().describe("Port, terminal or berth as the user wrote it. Leave out to search every port."),
        kind: z.enum(["rules", "tariff"]).optional().describe("rules: berths, rules and procedures. tariff: the rate schedules' wording. Leave out for both."),
      }).strict(),
      execute: async ({ question, port: name, kind }) => {
        const found = name ? place({ port: name }) : undefined;
        if (found && "error" in found) return { error: found.error };
        const port = found && "match" in found ? found.match.port : undefined;
        const names = new Map(portBooks().map(book => [book.id, book.name]));
        const results = searchDocuments(question, { ...(port ? { port: port.id, portNames: [port.id, port.name, ...port.aliases] } : {}), ...(kind ? { kind } : {}) }).map(hit => ({
          port: { id: hit.document.port, name: names.get(hit.document.port) ?? hit.document.port },
          title: hit.document.title, issuer: hit.document.issuer, url: hit.document.url, page: hit.page, kind: hit.document.kind,
          ...(hit.document.publishedOn ? { publishedOn: hit.document.publishedOn } : {}), retrievedOn: hit.document.retrievedOn, excerpt: hit.text,
        }));
        const card: DocumentExcerptsCard = { kind: "document-excerpts", question, ...(port ? { port: { id: port.id, name: port.name } } : {}), results };
        const summary = results.length
          ? `Document excerpts for "${question}"${port ? ` at ${port.name}` : ""}: ` + results.map((hit, i) => `[${i + 1}] ${hit.title} (${hit.port.name}${hit.publishedOn ? `, ${hit.publishedOn}` : ""}), page ${hit.page}: ${hit.excerpt.replace(/\s+/g, " ").slice(0, 600)}`).join(" ")
          : `Nothing in our documents${port ? ` for ${port.name}` : ""} matches "${question}".`;
        return { card, summary };
      },
    }),

    ...(company ? {
      search_company_documents: tool({
        description: "Search the user's own uploaded company documents (contracts, procedures, agreements). Returns matching passages with document title and page. Answer only from them and cite the document and page.",
        inputSchema: z.object({ question: z.string().min(2).max(300).describe("What to look for, in the document's likely words.") }).strict(),
        execute: async ({ question }) => {
          let hits: Awaited<ReturnType<CompanyAccess["search"]>>;
          try { hits = await company.search(question); } catch { return { error: "Your documents couldn't be searched just now." }; }
          const card: CompanyExcerptsCard = { kind: "company-excerpts", question, results: hits };
          const summary = hits.length
            ? `From the company's documents for "${question}": ` + hits.map((hit, i) => `[${i + 1}] ${hit.title}, page ${hit.page}: ${hit.text.replace(/\s+/g, " ").slice(0, 600)}`).join(" ")
            : `Nothing in the company's uploaded documents matches "${question}".`;
          return { card, summary };
        },
      }),
    } : {}),
    ...(fleet ? {
      find_ship: tool({
        description: "Look up one of the user's saved ships by name or IMO number, or list their fleet when neither is given.",
        inputSchema: z.object({ name: z.string().min(1).max(80).optional(), imo: z.string().regex(/^\d{7}$/).optional() }).strict(),
        execute: async ({ name, imo }) => {
          let ships: FleetShip[];
          try { ships = await fleet.list(); } catch { return { error: "The fleet couldn't be read just now. Ask for the ship's details instead." }; }
          if (!name && !imo) {
            const card: FleetCard = { kind: "fleet", ships };
            return { card, summary: ships.length ? `The user's fleet: ${ships.map(shipView).join("; ")}.` : "The user's fleet is empty." };
          }
          const ship = findShip(ships, { name, imo });
          if (!ship) return { found: false, summary: `${name ?? `IMO ${imo}`} isn't in the user's fleet.` };
          const card: ShipCard = { kind: "ship", ship };
          return { card, summary: `Saved ship: ${shipView(ship)}.` };
        },
      }),
      save_ship: tool({
        description: "Save a ship's particulars to the user's fleet (or update the saved ship with the same name or IMO number), so later estimates fill them in. Fill in only what the user gave; leave every other field out.",
        inputSchema: fleetShipSchema,
        execute: async (given, { messages }) => {
          // Keep only what the user actually gave: a zero, placeholder or guess is no particular.
          const clean = keepShip(cleanShip(given), readConversation(messages));
          if (!clean.name || !clean.grt) return { error: "A ship needs at least its name and gross tonnage (GRT) to be saved. Ask the user for them." };
          const input = { ...clean, name: clean.name, grt: clean.grt } as typeof given;
          let result: { id: string; created: boolean };
          try { result = await fleet.save(input); } catch (error) { return { error: `The ship wasn't saved: ${error instanceof Error ? error.message.replace(/^.*?Uncaught ConvexError: /, "") : "the fleet is unavailable"}.` }; }
          const ship: FleetShip = { ...input, id: result.id, updatedAt: Date.now() };
          const card: ShipCard = { kind: "ship", ship, saved: result.created ? "created" : "updated" };
          return { card, summary: `${result.created ? "Saved" : "Updated"} in the user's fleet: ${shipView(ship)}.` };
        },
      }),
    } : {}),

    list_ports: tool({
      description: "The ports Berthwise covers: terminals, the rate schedule in force, when it was last checked, the charges it prices and known gaps.",
      inputSchema: z.object({}).strict(),
      execute: async () => {
        const rows = coverage(portBooks(), today());
        const card: CoverageCard = { kind: "coverage", date: today(), ports: rows };
        return {
          card,
          summary: `Ports covered: ${rows.map(row => `${row.name} (schedule from ${row.inForce?.effectiveFrom ?? "none in force"}, checked ${row.checkedOn})`).join("; ")}.`,
        };
      },
    }),
  };
}
