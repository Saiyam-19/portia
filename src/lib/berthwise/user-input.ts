import type { ModelMessage } from "ai";
import { namesCargo } from "./rulebook/cargo";

/** What the user actually said, so tool inputs the model made up can be dropped.
 * A ship's tonnage, length and IMO number, the stay, anchorage time and an exchange
 * rate are kept only when the user's words (or a tool result) give them. A bare number
 * that answers the assistant's question ("30000" after "What is the ship's GRT?") counts
 * as that answer. With no user messages at all (direct calls), nothing is dropped. */

type Kind = "grt" | "nrt" | "loa" | "hours" | "anchorage" | "rate" | "tonnes" | "teu";
type Figure = { value: number; around: string; wide: string; before: string; after: string };
export type Conversation = { text: string; figures: Figure[]; durations: Set<number> };

const textOf = (message: ModelMessage) => typeof message.content === "string" ? message.content
  : message.content.map(part => part.type === "text" ? part.text : "").join(" ");

// What a question asks for, and the words that mark a figure as that thing.
const ASKED: Array<[Kind, RegExp]> = [
  ["grt", /gross tonnage|\bgrt\b|\bgt\b/i], ["nrt", /net tonnage|\bnrt\b/i], ["loa", /length overall|\bloa\b/i],
  ["anchorage", /anchorage|at anchor/i], ["hours", /how many hours|hours alongside|how long|alongside/i], ["rate", /exchange rate|rupees per|per (?:us )?dollar/i],
  ["tonnes", /tonnes of cargo|how much cargo|cargo quantity/i], ["teu", /how many containers|\(teu\)/i],
];
const SAYS: Record<Kind, string> = { grt: "GRT", nrt: "NRT", loa: "m LOA", hours: "hours alongside", anchorage: "hours at anchorage", rate: "rupees per dollar", tonnes: "tonnes of cargo", teu: "TEU" };
const LABELLED = /\b(?:grt|gt|gross|nrt|nt|net|loa|length|m|metres?|meters?|tons?|tonnes?|tonnage|hours?|hrs?|h|days?|weeks?|teu|usd|inr|rs|rupees?|dollars?|imo|k)\b|₹|\$|%/i;
const NUMBER = /(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s*(k\b)?/gi;

/** Labels the bare numbers in a reply with what the assistant had just asked for. */
function answerTo(question: string, reply: string): string {
  const kinds = ASKED.map(([kind, pattern]) => ({ kind, at: question.search(pattern) })).filter(item => item.at >= 0).sort((a, b) => a.at - b.at).map(item => item.kind);
  if (!kinds.length) return reply;
  let next = 0;
  return reply.replace(NUMBER, (whole, _number, _k, offset: number) => {
    const around = reply.slice(Math.max(0, offset - 12), offset + whole.length + 12);
    if (LABELLED.test(around.replace(whole, " ")) || next >= kinds.length) return whole;
    return `${whole.trimEnd()} ${SAYS[kinds[next++]!]} `;
  });
}

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

export function readConversation(messages: ModelMessage[] | undefined): Conversation | undefined {
  const parts: string[] = [];
  let question = "";
  const fromTools: number[] = [];
  for (const message of messages ?? []) {
    if (message.role === "assistant") question = textOf(message);
    else if (message.role === "user") { parts.push(answerTo(question, textOf(message))); question = ""; }
    else if (message.role === "tool" && Array.isArray(message.content)) {
      // Elapsed times worked out from the user's own dates and times are durations they gave.
      for (const part of message.content) if (part.type === "tool-result" && part.toolName === "calculate_elapsed_time") {
        const hours = (JSON.stringify(part.output).match(/"elapsedHours":"(\d+(?:\.\d+)?)"/) ?? [])[1];
        if (hours) fromTools.push(Number(hours));
      }
    }
  }
  const text = parts.join("\n");
  if (!text.trim()) return undefined;
  const figures = [...text.matchAll(NUMBER)].map(match => ({
    value: Number(match[1]!.replace(/,/g, "")) * (match[2] ? 1000 : 1),
    around: text.slice(Math.max(0, match.index! - 12), match.index! + match[0].length + 12).toLowerCase(),
    wide: text.slice(Math.max(0, match.index! - 14), match.index! + match[0].length + 24).toLowerCase(),
    before: text.slice(Math.max(0, match.index! - 16), match.index!).toLowerCase(),
    after: text.slice(match.index! + match[0].length, match.index! + match[0].length + 16).toLowerCase(),
  }));
  const durations = new Set<number>(fromTools);
  const lower = text.toLowerCase();
  for (const match of lower.matchAll(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/g)) durations.add(Number(match[1]));
  for (const match of lower.matchAll(/(\d+(?:\.\d+)?)\s*days?\b/g)) durations.add(Number(match[1]) * 24);
  for (const match of lower.matchAll(/\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:full\s+)?(day|days|week|weeks)\b/g)) durations.add(WORDS[match[1]!]! * (match[2]!.startsWith("week") ? 168 : 24));
  if (/\bhalf (?:a )?day\b/.test(lower)) durations.add(12);
  return { text, figures, durations };
}

const LABEL: Record<"grt" | "nrt" | "loa", RegExp> = {
  grt: /\b(?:grt|gt|gross|tons?|tonnes?|tonnage)\b/, nrt: /\b(?:nrt|nt|net)\b/, loa: /\b(?:loa|length|long|m|metres?|meters?)\b/,
};
const TYPE_WORDS: Record<string, RegExp> = {
  "general-cargo": /general[ -]cargo|break[ -]?bulk|multipurpose/, bulk: /bulk|bulker/, container: /container|box ?ship/, tanker: /tanker|crude|product carrier/,
  vlcc: /vlcc|very large crude/, chemical: /chemical/, lng: /\blng\b/, lpg: /\blpg\b|gas carrier/, "ro-ro": /ro-?ro|car carrier|pctc/, passenger: /passenger|cruise|ferry/, other: /./,
};

type ShipInput = { name?: string; imo?: string; grt?: string; nrt?: string; loa?: string; type?: string; status?: string };

/** The ship details the user gave; a GRT isn't reused as an NRT or a length. */
export function keepShip<T extends ShipInput>(ship: T, heard: Conversation | undefined): T {
  if (!heard) return ship;
  const figure = (value: string | undefined, field: "grt" | "nrt" | "loa") =>
    value !== undefined && heard.figures.some(item => item.value === Number(value) && LABEL[field].test(item.around)) ? value : undefined;
  const words = heard.text.toLowerCase();
  const status = ship.status && (ship.status === "coastal" ? /coastal/ : /foreign|international|overseas|import|export/).test(words) ? ship.status : undefined;
  const type = ship.type && TYPE_WORDS[ship.type]?.test(words) ? ship.type : undefined;
  const kept = { name: ship.name, imo: ship.imo && heard.text.includes(ship.imo) ? ship.imo : undefined, grt: figure(ship.grt, "grt"), nrt: figure(ship.nrt, "nrt"), loa: figure(ship.loa, "loa"), type, status };
  return Object.fromEntries(Object.entries(kept).filter(([, value]) => value !== undefined)) as T;
}

type CargoInput = { class?: string; tonnes?: string; teu?: string; fortyFoot?: string; direction?: "import" | "export" };
type StayInput = { hoursAlongside?: string; anchorageHours?: string; tugs?: number; cargo?: CargoInput };

/** The cargo the user gave: its kind in their words, tonnes and TEU as figures they said. */
function keepCargo(cargo: CargoInput | undefined, heard: Conversation): CargoInput | undefined {
  if (!cargo) return undefined;
  // The unit right after the figure ("50,000 tonnes"), or a word right before it ("cargo of 50,000").
  const figure = (value: string | undefined, after: RegExp, before: RegExp) =>
    value !== undefined && heard.figures.some(item => item.value === Number(value) && (after.test(item.after) || before.test(item.before))) ? value : undefined;
  const text = heard.text.toLowerCase();
  const kept: CargoInput = {
    class: cargo.class && namesCargo(cargo.class, text) ? cargo.class : undefined,
    tonnes: figure(cargo.tonnes, /^\s*(?:tonnes?|tons?|mt|t|metric)\b/, /(?:cargo|quantity|parcel)(?: of)?\s*:?\s*$/),
    teu: figure(cargo.teu, /^\s*(?:teu|containers?|boxes)\b/, /(?:teu|containers?)\s*:?\s*$/),
    fortyFoot: cargo.fortyFoot !== undefined && heard.figures.some(item => item.value === Number(cargo.fortyFoot) && /40|forty|\bfeu\b/.test(item.wide)) ? cargo.fortyFoot : undefined,
    direction: cargo.direction === "import" ? (/import|discharg|unload/.test(text) ? "import" : undefined)
      : cargo.direction === "export" ? (/export|\bload(?:ing|ed|s)?\b|shipment/.test(text) ? "export" : undefined) : undefined,
  };
  const out = Object.fromEntries(Object.entries(kept).filter(([, value]) => value !== undefined)) as CargoInput;
  return out.tonnes || out.teu ? out : undefined;
}

/** The stay the user gave: hours alongside and at anchorage only as durations they said
 * (2 days = 48 hours), tugs and cargo only when mentioned. */
export function keepStay<T extends StayInput>(stay: T, heard: Conversation | undefined): T {
  if (!heard) return stay;
  const text = heard.text.toLowerCase();
  const said = (hours?: string) => hours !== undefined && heard.durations.has(Number(hours)) ? hours : undefined;
  const anchorage = /anchor|wait/.test(text);
  // A wrong figure for the only stay the user gave is replaced by theirs.
  const only = !anchorage && heard.durations.size === 1 ? String([...heard.durations][0]) : undefined;
  return {
    ...stay,
    hoursAlongside: said(stay.hoursAlongside) ?? (stay.hoursAlongside !== undefined ? only : undefined),
    anchorageHours: anchorage ? said(stay.anchorageHours) : undefined,
    tugs: /\btugs?\b/.test(text) ? stay.tugs : undefined,
    cargo: keepCargo(stay.cargo, heard),
  };
}

/** An exchange rate the user wrote, next to words that make it one ("84.5 rupees per dollar", "₹84.5/USD"). */
export function keepRate(rate: string | undefined, heard: Conversation | undefined): string | undefined {
  if (!rate || !(Number(rate) > 1 && Number(rate) < 1000)) return undefined;
  if (!heard) return rate;
  return heard.figures.some(item => item.value === Number(rate) && /exchange|rate\b|rupees?|₹|\binr\b|\brs\b|per (?:us )?(?:dollar|usd|\$)|\/\s*(?:usd|\$)|usd\s*=|dollar/.test(item.wide)) ? rate : undefined;
}
