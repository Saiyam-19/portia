import Decimal from "decimal.js";
import type { Charge, ChargeType, PortBook, RuleVersion, Status, VesselType } from "./schema";

const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });

export type EstimateRequest = {
  date?: string;
  terminal?: string;
  berth?: string;
  status?: Status;
  vesselType?: VesselType;
  grt?: string;
  nrt?: string;
  loa?: string;
  hours?: string;
  anchorageHours?: string;
  movements?: number;
  tugs?: number;
  cargo?: { class?: string; tonnes?: string; teu?: string };
  charges?: ChargeType[];
};

export type EstimateLine = {
  chargeId: string; type: ChargeType; label: string; currency: string; amount: string; display: string;
  working: string; conditions: string[]; source: { title: string; url: string; page: string; section?: string };
};
export type Estimate = {
  port: { id: string; name: string }; terminal?: string; berth?: string;
  version: { id: string; effectiveFrom: string; effectiveTo?: string };
  lines: EstimateLine[];
  totals: Array<{ currency: string; amount: string; display: string }>;
  assumptions: string[];
  notCovered: Array<{ type: ChargeType | string; reason: string }>;
  questions: string[];
  checkedOn: string;
};

const SIZE: Record<string, "grt" | "nrt" | "loa" | "tonnes" | "teu"> = {
  grt: "grt", "grt-hour": "grt", "grt-day": "grt", nrt: "nrt", "loa-hour": "loa", "loa-day": "loa", call: "grt", hour: "grt", tonne: "tonnes", teu: "teu",
};
const LABEL: Record<string, string> = { grt: "GRT", nrt: "NRT", loa: "m length", tonnes: "tonnes", teu: "TEU", hours: "hours" };
const ASK: Record<string, string> = {
  grt: "What is the ship's gross tonnage (GRT)?", nrt: "What is the ship's net tonnage (NRT)?", loa: "What is the ship's length overall (LOA) in metres?",
  hours: "How many hours will the ship be alongside the berth?", anchorageHours: "How many hours will the ship wait at anchorage?", tonnes: "How many tonnes of cargo will be handled?", teu: "How many containers (TEU) will be handled?",
};

export function money(amount: Decimal.Value, currency: string) {
  return new D(amount).toDecimalPlaces(2).toNumber().toLocaleString(currency === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const plain = (value: Decimal.Value) => new D(value).toNumber().toLocaleString("en-US", { maximumFractionDigits: 6 });

export function versionFor(port: PortBook, date: string): RuleVersion | undefined {
  const fits = port.versions.filter(version => version.effectiveFrom <= date && (!version.effectiveTo || date <= version.effectiveTo));
  return fits.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

export function estimate(port: PortBook, request: EstimateRequest, today = new Date().toISOString().slice(0, 10)): Estimate {
  const date = request.date ?? today;
  const assumptions: string[] = [], questions: string[] = [], notCovered: Estimate["notCovered"] = [], lines: EstimateLine[] = [];
  if (!request.date) assumptions.push(`Call date assumed to be today (${date}).`);
  const version = versionFor(port, date);
  const base = { port: { id: port.id, name: port.name }, checkedOn: port.checkedOn };
  if (!version) {
    const span = port.versions.map(v => `${v.effectiveFrom}${v.effectiveTo ? " to " + v.effectiveTo : " onwards"}`).join("; ");
    return { ...base, version: { id: "none", effectiveFrom: "" }, lines, totals: [], assumptions, notCovered: [{ type: "all", reason: `No rate schedule we hold covers ${date}. We hold: ${span}.` }], questions };
  }
  const defaults = version.defaults;
  const status = request.status ?? defaults.status;
  if (!request.status) assumptions.push(`Assumed a ${status === "foreign" ? "foreign-going" : "coastal"} ship.`);
  const vesselType = request.vesselType ?? defaults.vesselType;
  if (!request.vesselType) assumptions.push(`Assumed a ${vesselType.replace("-", " ")} ship.`);
  const movements = request.movements ?? defaults.movements;
  if (request.movements === undefined) assumptions.push(`Assumed ${movements} movements (arrival and departure).`);
  const terminal = request.terminal ?? defaults.terminal;
  if (!request.terminal && defaults.terminal) assumptions.push(`Assumed the ${nameOf(port, defaults.terminal)} terminal.`);
  const berth = request.berth ?? defaults.berth;
  if (!request.berth && defaults.berth) assumptions.push(`Assumed berth ${nameOf(port, defaults.berth)}.`);
  const sizes: Record<string, string | undefined> = { grt: request.grt, nrt: request.nrt, loa: request.loa, tonnes: request.cargo?.tonnes, teu: request.cargo?.teu, hours: request.hours, anchorageHours: request.anchorageHours };
  let tugs = request.tugs;
  if (tugs === undefined && defaults.tugs && request.grt) {
    tugs = defaults.tugs.find(row => !row.upToGrt || new D(request.grt!).lte(row.upToGrt))?.tugs;
    if (tugs !== undefined) assumptions.push(`Assumed ${tugs} tug${tugs === 1 ? "" : "s"}, as normally required for this size of ship.`);
  }

  // Anchorage and wharfage are added only when asked for or when their inputs are given.
  const wanted = new Set<ChargeType>(request.charges?.length ? request.charges : version.charges.map(charge => charge.type)
    .filter(type => (type !== "wharfage" || request.cargo) && (type !== "anchorage" || request.anchorageHours)));
  const known = { status, vesselType, terminal, berth, cargoClass: request.cargo?.class };
  // Only charges with a rate row for this ship (or one that a question would settle) take part.
  const fits = (charge: Charge) => { const row = pickRate(charge, known); return Boolean(row.rate || row.question); };
  // A combined charge (e.g. pilotage with towage) answers a request for either part.
  const selected = version.charges.filter(charge => fits(charge) && (wanted.has(charge.type) || charge.includes.some(type => wanted.has(type))));
  const parts = (charge: Charge) => [charge.type, ...charge.includes];
  for (const type of wanted) {
    if (selected.some(charge => charge.type === type)) continue;
    const cover = selected.find(charge => charge.includes.includes(type));
    if (cover) { assumptions.push(`${title(type)} is included in ${cover.label.toLowerCase()}.`); continue; }
    const unfit = version.charges.filter(charge => charge.type === type);
    if (!unfit.length) { notCovered.push({ type, reason: `${title(type)} isn't in the ${port.name} rate schedule we hold.` }); continue; }
    // e.g. an LNG terminal's own pilotage replaces the port's pilotage with tugs.
    const replaced = unfit.every(charge => selected.some(other => parts(other).some(part => parts(charge).includes(part))));
    if (!replaced) notCovered.push({ type, reason: `${unfit[0]!.label} has no rate for a ${status} ${vesselType.replace("-", " ")} ship in this schedule.` });
  }

  const asked = new Set<string>();
  const ask = (question: string) => { if (!asked.has(question)) { asked.add(question); questions.push(question); } };
  for (const charge of selected) {
    const row = pickRate(charge, known);
    if (row.question) { ask(row.question(port)); continue; }
    if (!row.rate) { notCovered.push({ type: charge.type, reason: `${charge.label} has no rate for a ${status} ${vesselType.replace("-", " ")} ship in this schedule.` }); continue; }
    const perUnit = !["call", "hour"].includes(charge.basis);
    const sizeKey = charge.bandOn ?? SIZE[charge.basis]!;
    const needs = new Set<string>();
    if (perUnit) needs.add(SIZE[charge.basis]!);
    if (perUnit || charge.bandOn || row.rate.bands.length > 1 || charge.minimumQuantity) needs.add(sizeKey);
    if (timeBased(charge)) needs.add(charge.type === "anchorage" ? "anchorageHours" : "hours");
    const missing = [...needs].filter(key => !sizes[key]);
    if (missing.length) { for (const key of missing) ask(ASK[key]!); continue; }
    if (charge.perTug && tugs === undefined) { ask("How many tugs will the ship use?"); continue; }
    const top = row.rate.bands.at(-1)!.upTo;
    if (top && new D(sizes[sizeKey] ?? 0).gt(top)) { notCovered.push({ type: charge.type, reason: `${charge.label}: the schedule's rates stop at ${plain(top)} ${LABEL[sizeKey]}.` }); continue; }
    lines.push(priceLine(charge, row.rate, version, sizes, { movements, tugs }));
  }

  // A type priced by one charge (e.g. a terminal's own berth hire) is covered.
  const priced = new Set(lines.map(line => line.type));
  const uncovered = notCovered.filter(item => !priced.has(item.type as ChargeType));
  notCovered.length = 0; notCovered.push(...uncovered);
  const totals = [...new Set(lines.map(line => line.currency))].map(currency => {
    const amount = lines.filter(line => line.currency === currency).reduce((sum, line) => sum.plus(line.amount), new D(0));
    return { currency, amount: amount.toString(), display: money(amount, currency) };
  });
  return { ...base, ...(terminal ? { terminal: nameOf(port, terminal) } : {}), ...(berth ? { berth: nameOf(port, berth) } : {}),
    version: { id: version.id, effectiveFrom: version.effectiveFrom, ...(version.effectiveTo ? { effectiveTo: version.effectiveTo } : {}) },
    lines, totals, assumptions, notCovered, questions };
}

function title(type: string) { const text = type.replace(/-/g, " "); return text[0]!.toUpperCase() + text.slice(1); }
function nameOf(port: PortBook, id: string) {
  for (const terminal of port.terminals) {
    if (terminal.id === id) return terminal.name;
    const berth = terminal.berths.find(item => item.id === id);
    if (berth) return berth.name;
  }
  return id;
}
const timeBased = (charge: Charge) => ["grt-hour", "grt-day", "loa-hour", "loa-day", "hour"].includes(charge.basis);

type Known = { status: Status; vesselType: VesselType; terminal?: string; berth?: string; cargoClass?: string };
function pickRate(charge: Charge, known: Known): { rate?: Charge["rates"][number]; question?: (port: PortBook) => string } {
  const undecided = new Set<"terminal" | "berth" | "cargoClass">();
  const matches = charge.rates.filter(rate => {
    const w = rate.when;
    if (w.status && !w.status.includes(known.status)) return false;
    if (w.vesselTypes && !w.vesselTypes.includes(known.vesselType)) return false;
    for (const [field, list] of [["terminal", w.terminals], ["berth", w.berths], ["cargoClass", w.cargoClasses]] as const) {
      if (!list) continue;
      const value = known[field];
      if (value === undefined) { undecided.add(field); return true; }
      if (!list.includes(value)) return false;
    }
    return true;
  });
  const decided = matches.filter(rate => !(["terminal", "berth", "cargoClass"] as const).some(field => {
    const list = field === "terminal" ? rate.when.terminals : field === "berth" ? rate.when.berths : rate.when.cargoClasses;
    return list && known[field] === undefined;
  }));
  if (decided.length >= 1 && undecided.size === 0) return { rate: decided[0] };
  if (matches.length === 1 && undecided.size === 0) return { rate: matches[0] };
  if (undecided.size && matches.length) {
    const field = [...undecided][0]!;
    const options = [...new Set(matches.flatMap(rate => (field === "terminal" ? rate.when.terminals : field === "berth" ? rate.when.berths : rate.when.cargoClasses) ?? []))];
    // One question per port for terminals, even when several charges depend on it.
    return { question: port => field === "cargoClass"
      ? `What cargo is it (${options.join(", ")})?`
      : field === "terminal"
        ? `Which terminal will the ship use: ${port.terminals.map(terminal => terminal.name).join(", ")}?`
        : `Which ${field} will the ship use: ${options.map(option => nameOf(port, option)).join(", ")}?` };
  }
  return {};
}

function timeQuantity(charge: Charge, hours: Decimal) {
  const free = new D(charge.freeHours ?? 0);
  const charged = Decimal.max(hours.minus(free), 0);
  const perDay = charge.basis.endsWith("-day");
  switch (charge.timeRounding) {
    case "started-hour": return { amount: charged.ceil(), unit: "hours" };
    case "started-half-day": return { amount: charged.div(12).ceil().div(2), unit: "days" };
    case "started-day": return { amount: charged.div(24).ceil(), unit: "days" };
    default: return perDay ? { amount: charged.div(24), unit: "days" } : { amount: charged, unit: "hours" };
  }
}

function minimumUnits(charge: Charge, per: "hour" | "day", hours: Decimal) {
  const charged = Decimal.max(hours.minus(charge.freeHours ?? 0), 0);
  if (per === "day") return charged.div(24).ceil();
  return charge.timeRounding === "started-hour" ? charged.ceil() : charged;
}

function priceLine(charge: Charge, rate: Charge["rates"][number], version: RuleVersion, sizes: Record<string, string | undefined>, counts: { movements: number; tugs?: number }): EstimateLine {
  const c = rate.currency;
  const sizeKey = charge.bandOn ?? SIZE[charge.basis]!;
  let size = new D(sizes[sizeKey] ?? 0);
  const steps: string[] = [];
  if (charge.minimumQuantity && size.lt(charge.minimumQuantity)) { steps.push(`charged at the minimum ${plain(charge.minimumQuantity)} ${LABEL[sizeKey]}`); size = new D(charge.minimumQuantity); }
  const bands = rate.bands;
  const index = bands.findIndex(band => !band.upTo || (band.exclusive ? size.lt(band.upTo) : size.lte(band.upTo)));
  const band = bands[index === -1 ? bands.length - 1 : index]!;
  const perUnitBasis = !["call", "hour"].includes(charge.basis);
  let amount: Decimal;
  if (rate.bandMode === "excess") {
    const previous = index > 0 ? new D(bands[index - 1]!.upTo!) : new D(0);
    let below = new D(0);
    for (let i = 0; i < index; i++) below = below.plus(new D(bands[i]!.upTo!).minus(i ? bands[i - 1]!.upTo! : 0).mul(bands[i]!.rate));
    const baseAmount = band.base ? new D(band.base) : below;
    const over = size.minus(previous);
    amount = baseAmount.plus(over.mul(band.rate));
    steps.unshift(index > 0 ? `${c} ${plain(baseAmount)} for the first ${plain(previous)} ${LABEL[sizeKey]} + ${plain(over)} ${LABEL[sizeKey]} × ${c} ${band.rate}` : `${plain(size)} ${LABEL[sizeKey]} × ${c} ${band.rate}`);
  } else if (perUnitBasis) {
    const multiplier = charge.bandOn ? new D(sizes[SIZE[charge.basis]!] ?? 0) : size;
    amount = multiplier.mul(band.rate);
    steps.unshift(`${plain(multiplier)} ${LABEL[SIZE[charge.basis]!]} × ${c} ${band.rate}`);
  } else {
    amount = new D(band.rate);
    steps.unshift(`${c} ${band.rate}${charge.basis === "hour" ? " per hour" : " per call"}${bands.length > 1 ? ` (${plain(size)} ${LABEL[sizeKey]} band)` : ""}`);
  }
  if (timeBased(charge)) {
    const stay = new D((charge.type === "anchorage" ? sizes.anchorageHours : sizes.hours)!);
    const short = rate.minimumHours !== undefined && stay.lt(rate.minimumHours);
    const time = timeQuantity(charge, short ? new D(rate.minimumHours!) : stay);
    amount = amount.mul(time.amount);
    steps.push(`${plain(time.amount)} ${time.unit}${charge.timeRounding?.startsWith("started") ? " (each started period counts)" : ""}${charge.freeHours ? ` after ${charge.freeHours} free hours` : ""}${short ? ` (charged for at least ${plain(rate.minimumHours!)} hours)` : ""}`);
  }
  if (charge.per === "movement") { amount = amount.mul(counts.movements); steps.push(`${counts.movements} movements`); }
  if (charge.perTug) { amount = amount.mul(counts.tugs!); steps.push(`${counts.tugs} tugs`); }
  // A minimum "per hour" or "per day" grows with the stay; each started day counts.
  const units = rate.minimumPer && timeBased(charge) ? minimumUnits(charge, rate.minimumPer, new D((charge.type === "anchorage" ? sizes.anchorageHours : sizes.hours)!)) : undefined;
  const floor = (value: string, what: string) => {
    const least = units ? new D(value).mul(units) : new D(value);
    if (amount.gte(least)) return;
    amount = least;
    steps.push(units ? `minimum charge ${c} ${value} per ${rate.minimumPer}${what} × ${plain(units)} ${rate.minimumPer}s applies` : `minimum charge ${c} ${value}${what} applies`);
  };
  if (band.minimumAmount) floor(band.minimumAmount, " for this size");
  if (rate.minimumAmount) floor(rate.minimumAmount, "");
  if (rate.maximumAmount && amount.gt(rate.maximumAmount)) { amount = new D(rate.maximumAmount); steps.push(`capped at ${c} ${rate.maximumAmount}`); }
  const document = version.documents.find(item => item.id === charge.source.document) ?? version.documents[0]!;
  return {
    chargeId: charge.id, type: charge.type, label: charge.label, currency: c, amount: amount.toString(), display: money(amount, c),
    working: steps.join(" × ").replace(/ × (charged at|minimum charge|capped at)/g, "; $1"),
    conditions: charge.conditions,
    source: { title: document.title, url: document.url, page: String(charge.source.page), ...(charge.source.section ? { section: charge.source.section } : {}) },
  };
}
