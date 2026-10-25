import Decimal from "decimal.js";
import { versionFor } from "./calculate";
import type { Charge, PortBook, RuleVersion, Status, VesselType } from "./schema";

/** Plain-English views of the rule book: what each port charges and how, and what changed. */

const UNIT: Record<string, string> = {
  grt: "per GRT", "grt-hour": "per GRT per hour", "grt-day": "per GRT per day", nrt: "per NRT",
  "loa-hour": "per metre of length per hour", "loa-day": "per metre of length per day",
  call: "per call", hour: "per hour", tonne: "per tonne", teu: "per TEU", percent: "",
};
const SIZE_UNIT: Record<string, string> = { grt: "GRT", "grt-hour": "GRT", "grt-day": "GRT", nrt: "NRT", "loa-hour": "m", "loa-day": "m", call: "GRT", hour: "GRT", tonne: "tonnes", teu: "TEU", percent: "" };
const ROUNDING: Record<string, string> = { "started-hour": "each started hour counts", "started-half-day": "each started half day counts", "started-day": "each started day counts" };

const figure = (value: string) => new Decimal(value).toNumber().toLocaleString("en-US", { maximumFractionDigits: 6 });

export type RateView = { appliesTo: string; currency: string; text: string };
export type ChargeView = { id: string; type: string; label: string; rates: RateView[]; conditions: string[]; source: { title: string; url: string; page: string; section?: string } };
export type TariffView = {
  port: { id: string; name: string };
  version: { id: string; effectiveFrom: string; effectiveTo?: string; documents: Array<{ title: string; url: string }> };
  checkedOn: string; charges: ChargeView[]; notes: string[]; exchangeRate?: string;
  changes?: { since: { id: string; effectiveFrom: string; effectiveTo?: string }; items: Array<{ label: string; before?: string; after?: string }> };
};

export function describeRate(charge: Charge, rate: Charge["rates"][number]): string {
  const c = rate.currency;
  if (charge.basis === "percent") return `${rate.bands[0]!.rate}% of ${(charge.percentOf ?? []).map(id => id.replace(/-/g, " ")).join(" and ")}`;
  const unit = UNIT[charge.basis]!;
  const sizeUnit = charge.bandOn ? (charge.bandOn === "tonnes" ? "tonnes" : charge.bandOn.toUpperCase()) : SIZE_UNIT[charge.basis]!;
  const perUnit = !["call", "hour"].includes(charge.basis);
  const parts = rate.bands.map((band, index) => {
    const previous = index > 0 ? rate.bands[index - 1]!.upTo : undefined;
    const range = rate.bands.length === 1 ? ""
      : band.upTo ? `${previous ? `${band.exclusive ? "from" : "over"} ${figure(previous)} ${band.exclusive ? "to under" : "up to"}` : band.exclusive ? "under" : "up to"} ${figure(band.upTo)} ${sizeUnit}: `
      : `over ${figure(previous!)} ${sizeUnit}: `;
    const amount = Number(band.rate) === 0 && band.minimumAmount ? `${c} ${figure(band.minimumAmount)} lump sum`
      : rate.bandMode === "excess" && index > 0
        ? `${c} ${figure(band.base ?? "0")} + ${c} ${band.rate} ${unit} above ${figure(previous!)}`
        : `${c} ${band.rate} ${perUnit ? unit : charge.basis === "hour" ? "per hour" : "per call"}`;
    const least = band.minimumAmount && Number(band.rate) !== 0 ? ` (minimum ${c} ${figure(band.minimumAmount)}${rate.minimumPer ? ` per ${rate.minimumPer}` : ""})` : "";
    return range + amount + least;
  });
  const extras = [
    rate.minimumAmount && `minimum ${c} ${figure(rate.minimumAmount)}${rate.minimumPer ? ` per ${rate.minimumPer}` : ""}`,
    rate.maximumAmount && `maximum ${c} ${figure(rate.maximumAmount)}`,
    rate.minimumHours && `charged for at least ${figure(rate.minimumHours)} hours`,
    charge.minimumQuantity && `charged on at least ${figure(charge.minimumQuantity)} ${sizeUnit}`,
    charge.timeRounding && ROUNDING[charge.timeRounding],
    charge.freeHours && `first ${figure(charge.freeHours)} hours free`,
    charge.per === "movement" && "for each movement in and out",
    charge.perTug && "for each tug",
  ].filter(Boolean);
  return parts.join("; ") + (extras.length ? ` (${extras.join(", ")})` : "");
}

function appliesTo(rate: Charge["rates"][number], port: PortBook) {
  const w = rate.when;
  const names = (ids: string[] | undefined) => ids?.map(id => port.terminals.find(t => t.id === id)?.name ?? port.terminals.flatMap(t => t.berths).find(b => b.id === id)?.name ?? id);
  const bits = [
    w.status?.map(s => s === "foreign" ? "foreign-going" : "coastal").join(" or "),
    w.vesselTypes && (w.vesselTypes.length >= 8 ? "most ship types" : w.vesselTypes.map(t => t.replace("-", " ")).join(", ")),
    names(w.terminals)?.join(", "), names(w.berths)?.join(", "), w.cargoClasses?.join(", "),
  ].filter(Boolean);
  return bits.length ? bits.join("; ") : "all ships";
}

type Filter = { status?: Status; vesselType?: VesselType; terminal?: string };
const matches = (rate: Charge["rates"][number], filter: Filter) =>
  (!filter.status || !rate.when.status || rate.when.status.includes(filter.status))
  && (!filter.vesselType || !rate.when.vesselTypes || rate.when.vesselTypes.includes(filter.vesselType))
  && (!filter.terminal || !rate.when.terminals || rate.when.terminals.includes(filter.terminal));

function chargesOf(port: PortBook, version: RuleVersion, filter: Filter): ChargeView[] {
  return version.charges.flatMap(charge => {
    const rates = charge.rates.filter(rate => matches(rate, filter));
    if (!rates.length) return [];
    const document = version.documents.find(doc => doc.id === charge.source.document) ?? version.documents[0]!;
    return [{
      id: charge.id, type: charge.type, label: charge.label, conditions: charge.conditions,
      rates: rates.map(rate => ({ appliesTo: appliesTo(rate, port), currency: rate.currency, text: describeRate(charge, rate) })),
      source: { title: document.title, url: document.url, page: String(charge.source.page), ...(charge.source.section ? { section: charge.source.section } : {}) },
    }];
  });
}

/** What a port charges on a date, optionally narrowed to one kind of ship, and what changed since the previous schedule. */
export function describeTariff(port: PortBook, options: Filter & { date: string }): TariffView | undefined {
  const version = versionFor(port, options.date);
  if (!version) return undefined;
  const charges = chargesOf(port, version, options);
  const ordered = [...port.versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const previous = ordered[ordered.indexOf(version) - 1];
  let changes: TariffView["changes"];
  if (previous) {
    const before = chargesOf(port, previous, options);
    // Name who a rate applies to only when the charge has more than one.
    const text = (view?: ChargeView) => view?.rates.map(rate => view.rates.length > 1 ? `${rate.appliesTo}: ${rate.text}` : rate.text).join(" | ");
    const items: NonNullable<TariffView["changes"]>["items"] = [];
    for (const now of charges) {
      const then = before.find(item => item.id === now.id) ?? before.find(item => item.type === now.type && item.label === now.label);
      if (text(then) !== text(now)) items.push({ label: now.label, ...(then ? { before: text(then) } : {}), after: text(now) });
    }
    for (const then of before) if (!charges.some(now => now.id === then.id || (now.type === then.type && now.label === then.label))) items.push({ label: then.label, before: text(then) });
    changes = { since: { id: previous.id, effectiveFrom: previous.effectiveFrom, ...(previous.effectiveTo ? { effectiveTo: previous.effectiveTo } : {}) }, items };
  }
  return {
    port: { id: port.id, name: port.name },
    version: { id: version.id, effectiveFrom: version.effectiveFrom, ...(version.effectiveTo ? { effectiveTo: version.effectiveTo } : {}), documents: version.documents.map(doc => ({ title: doc.title, url: doc.url })) },
    checkedOn: port.checkedOn, charges, notes: version.notes.map(item => item.text),
    ...(version.exchangeRate ? { exchangeRate: version.exchangeRate } : {}), ...(changes ? { changes } : {}),
  };
}

export type CoverageRow = {
  id: string; name: string; kind: string; terminals: string[]; checkedOn: string;
  inForce?: { id: string; effectiveFrom: string; effectiveTo?: string };
  versions: Array<{ id: string; effectiveFrom: string; effectiveTo?: string }>;
  charges: string[]; gaps: string[];
};

/** Which ports and charges the rule book covers, for the coverage page and "which ports do you cover?". */
export function coverage(ports: PortBook[], date: string): CoverageRow[] {
  return ports.map(port => {
    const version = versionFor(port, date) ?? port.versions.at(-1)!;
    const inForce = versionFor(port, date);
    return {
      id: port.id, name: port.name, kind: port.kind, terminals: port.terminals.map(t => t.name), checkedOn: port.checkedOn,
      ...(inForce ? { inForce: { id: inForce.id, effectiveFrom: inForce.effectiveFrom, ...(inForce.effectiveTo ? { effectiveTo: inForce.effectiveTo } : {}) } } : {}),
      versions: port.versions.map(v => ({ id: v.id, effectiveFrom: v.effectiveFrom, ...(v.effectiveTo ? { effectiveTo: v.effectiveTo } : {}) })),
      charges: [...new Set(version.charges.map(charge => charge.label))],
      gaps: version.notes.map(item => item.text).filter(text => /not (priced|entered|added|applied)/i.test(text)),
    };
  });
}
