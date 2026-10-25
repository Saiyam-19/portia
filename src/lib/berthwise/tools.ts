import "server-only";
import { tool, type ToolSet } from "ai";
import Decimal from "decimal.js";
import { z } from "zod";
import { portBooks, resolvePort, type PortMatch } from "./rulebook/books";
import { estimate, money, versionFor, type Estimate, type EstimateRequest } from "./rulebook/calculate";
import { coverage, describeTariff, type TariffView } from "./rulebook/describe";
import { CHARGE_GROUPS, type ComparisonCard, type CoverageCard, type EstimateCall, type EstimateCard, type TariffCard, type TariffComparisonCard } from "./card-types";
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
  name: z.string().min(1).max(80).optional(),
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
  port: z.string().min(1).max(120).describe("Port, terminal or berth as the user wrote it, e.g. 'Nhava Sheva', 'Kandla', 'NSICT'."),
  terminal: z.string().min(1).max(120).optional(),
  berth: z.string().min(1).max(120).optional(),
  date: dateText.optional(),
  ...stay,
}).strict();

const usdToInr = decimalText("Rupees per US dollar, only when the user gives an exchange rate. Never estimate one.").optional();
const chargesField = z.array(chargeTypeSchema).min(1).max(9).optional().describe("Only these charges. Leave out for the whole standard bill.");

type Place = { match: PortMatch } | { error: string };
const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function place(input: { port: string; terminal?: string; berth?: string }): Place {
  const found = resolvePort(input.port);
  const covered = () => portBooks().map(port => port.name).join(", ");
  if (!found) return { error: `"${input.port}" isn't one of the ports we cover: ${covered()}.` };
  if ("candidates" in found) return { error: `"${input.port}" could mean ${found.candidates.join(" or ")}. Ask which one.` };
  const match: PortMatch = { ...found };
  const pick = (name: string, level: "terminal" | "berth") => {
    const wanted = norm(name);
    for (const terminal of found.port.terminals) {
      if (level === "terminal" && [terminal.id, terminal.name, ...terminal.aliases].some(alias => norm(alias) === wanted || norm(alias).includes(wanted))) return { terminal: terminal.id };
      for (const berth of terminal.berths) if (level === "berth" && [berth.id, berth.name, ...berth.aliases].some(alias => norm(alias) === wanted || norm(alias).includes(wanted))) return { terminal: terminal.id, berth: berth.id };
    }
    return undefined;
  };
  for (const level of ["terminal", "berth"] as const) {
    const name = input[level];
    if (!name) continue;
    const hit = pick(name, level) ?? pick(name, level === "terminal" ? "berth" : "terminal");
    if (!hit) {
      const options = found.port.terminals.flatMap(t => [t.name, ...t.berths.map(b => b.name)]);
      return { error: `${found.port.name} has no ${level} called "${name}" in our rule book${options.length ? `. It lists: ${options.join("; ")}` : ""}.` };
    }
    Object.assign(match, hit);
  }
  return { match };
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

const exchangeNote = (port: PortBook, date: string) => versionFor(port, date)?.exchangeRate;

export function businessTools(): ToolSet {
  return {
    estimate_port_call: tool({
      description: "Itemised port-call charges (port dues, pilotage, towage, berth hire, mooring and other standard charges; anchorage and wharfage when their inputs are given) from the reviewed rule book, with the working and source page of every line and a total before GST. Give one call, or a departure and an arrival call for a voyage (both are priced for the same ship and added up). Missing facts are assumed and listed; anything that would change the price a lot comes back as a question.",
      inputSchema: z.object({
        ship: shipSchema,
        calls: z.array(callSchema).min(1).max(2).describe("One call, or [departure, arrival] for a voyage."),
        charges: chargesField,
        usdToInr,
      }).strict(),
      execute: async ({ ship, calls, charges, usdToInr: rate }) => {
        const places = calls.map(place);
        const failed = places.find((item): item is { error: string } => "error" in item);
        if (failed) return { error: failed.error };
        const matches = places.map(item => (item as { match: PortMatch }).match);
        const voyage = calls.length === 2;
        const vessel = voyage ? sameShip(matches.map(m => m.port), ship, calls.map(c => c.date)) : ship;
        const results = calls.map((call, index) => {
          const result = estimate(matches[index]!.port, request(matches[index]!, vessel, call, charges));
          const role: EstimateCall["role"] = voyage ? (index === 0 ? "departure" : "arrival") : undefined;
          const fx = exchangeNote(matches[index]!.port, result.version.effectiveFrom || today());
          return { ...(role ? { role } : {}), estimate: result, ...(fx ? { exchangeRate: fx } : {}), notes: versionFor(matches[index]!.port, call.date ?? today())?.notes.map(n => n.text) ?? [] };
        });
        const voyageTotals = voyage ? addTotals(results.map(r => r.estimate.totals)) : undefined;
        const rupees = rate ? {
          usdToInr: rate,
          calls: results.map(r => ({ port: r.estimate.port.name, total: inRupees(r.estimate.totals, rate) })),
          ...(voyageTotals ? { voyage: inRupees(voyageTotals, rate) } : {}),
        } : undefined;
        const card: EstimateCard = { kind: "estimate", ship: { ...vessel }, calls: results, ...(voyageTotals ? { voyageTotals } : {}), ...(rupees ? { inRupees: rupees } : {}) };
        const summary = [
          `Estimate for ${describeShip(vessel) || "the ship"}.`,
          ...results.map(r => summarise(r.estimate, r.role)),
          voyageTotals ? `Voyage total before GST: ${said(voyageTotals)}.` : "",
          rupees ? `At ${rate} rupees per US dollar: ${rupees.calls.map(c => `${c.port} INR ${c.total?.display ?? "n/a"}`).join("; ")}${rupees.voyage ? `; voyage INR ${rupees.voyage.display}` : ""}.` : "",
        ].filter(Boolean).join(" ");
        return { card, summary };
      },
    }),

    compare_ports: tool({
      description: "Compare 2 to 4 ports for the same ship. view 'berth-hire': berth hire only. view 'whole-bill': every standard charge side by side with totals. view 'tariff': how each port charges (rates, bands, minimums, conditions) without needing ship figures. A charge a port doesn't publish is shown as missing, never as zero.",
      inputSchema: z.object({
        ports: z.array(z.string().min(1).max(120)).min(2).max(4).describe("Ports, terminals or berths as the user wrote them."),
        view: z.enum(["berth-hire", "whole-bill", "tariff"]),
        ship: shipSchema,
        date: dateText.optional(),
        ...stay,
        usdToInr,
      }).strict(),
      execute: async ({ ports, view, ship, date, usdToInr: rate, ...details }) => {
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
        const results = matches.map(m => estimate(m.port, request(m, vessel, { ...details, date }, charges)));
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
        const complete = results.every(result => !result.questions.length);
        const ranking = complete && currencies.size === 1 && !currencies.has(undefined)
          ? comparable.map((total, index) => ({ port: results[index]!.port.name, total: total! })).sort((a, b) => new Decimal(a.total.amount).cmp(b.total.amount))
          : undefined;
        const card: ComparisonCard = {
          kind: "comparison", view, ship: vessel, ...(date ? { date } : {}), hoursAlongside: details.hoursAlongside,
          ports: results.map(result => ({ port: result.port, terminal: result.terminal, berth: result.berth, version: result.version, totals: result.totals, assumptions: result.assumptions, questions: result.questions, notCovered: result.notCovered, checkedOn: result.checkedOn })),
          rows, estimates: results, ...(ranking ? { ranking } : {}), ...(rate ? { usdToInr: rate } : {}),
          ...(!ranking ? { notRanked: !complete ? "Some ports still need answers before they can be ranked." : "The totals are in different currencies; give an exchange rate to rank them." } : {}),
        };
        const summary = [
          `${view === "berth-hire" ? "Berth hire" : "Whole-bill"} comparison for a ${describeShip(vessel)}${details.hoursAlongside ? `, ${details.hoursAlongside} hours alongside` : ""}.`,
          ...results.map(result => summarise(result)),
          ranking ? `Cheapest first: ${ranking.map(item => `${item.port} ${item.total.currency} ${item.total.display}`).join("; ")}.` : "",
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
        const summary = `${view.port.name} schedule ${view.version.id} (from ${view.version.effectiveFrom}${view.version.effectiveTo ? ` to ${view.version.effectiveTo}` : ""}, checked ${view.checkedOn}): `
          + view.charges.map(charge => `${charge.label}: ${charge.rates.map(rate => `${rate.appliesTo}: ${rate.text}`).join(" / ")}`).join("; ")
          + (view.changes ? `. Changes since ${view.changes.since.effectiveFrom}: ${view.changes.items.map(item => `${item.label}: ${item.before ?? "new"} -> ${item.after ?? "removed"}`).join("; ") || "none"}` : "");
        const card: TariffCard = { kind: "tariff", ...view };
        return { card, summary: summary.slice(0, 4000) };
      },
    }),

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
