import { SUPPORTED_PORTS } from "./ports";
import { isAsserted, maximalSpans, operationAt } from "./request-semantics";

// Identity-only mappings reviewed against the bundled headings/definitions and
// docs/portia-reliability/official-source-review.md. These grant no tariff authority.
export const PORT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "bpcl-cargo-jetty": ["BPCL Cargo Jetty"],
  "bpcl-liquid-cargo-jetty": ["BPCL Liquid Cargo Jetty"],
  "gateway-terminals-india-pvt-ltd": ["GTI", "Gateway Terminals India", "Gateway Terminal India"],
  ictpl: ["ICTPL", "Indira Container Terminal"],
  jaigarh: ["Jaigarh", "JSW Jaigarh"],
  "jawahar-nehru-port-authority-jnpa": ["JNPA", "JNPT", "Jawaharlal Nehru Port", "Jawahar Nehru Port"],
  "jsw-jnpt-liquid-terminal": ["JSW JNPT Liquid Terminal", "JJLTPL"],
  "konkan-lng-ltd": ["Konkan LNG", "KLL"],
  mumbai: ["Mumbai", "Mumbai Port", "Mumbai Port Authority", "MbPA", "MBPT"],
  "mumbai-container-terminal": ["BMCT", "Bharat Mumbai Container Terminal", "Bharat Mumbai Container Terminals", "PSA Mumbai"],
  "mumbai-cruise-terminal": ["Mumbai Cruise Terminal"],
  "nhava-sheva-freeport-terminal": ["NSFT", "NSFTPL", "Nhava Sheva Freeport Terminal"],
  "nhava-sheva-gateway-terminal": ["NSIGT", "Nhava Sheva India Gateway Terminal", "Nhava Sheva Gateway Terminal", "Nhava Sheva (India) Gateway Terminal"],
  "nhava-sheva-international-container-terminal": ["NSICT", "Nhava Sheva International Container Terminal"],
  "ranpar-finolex": ["Ranpar", "Ranpar Finolex", "Finolex", "Finolex jetty", "Finolex terminal"],
  redi: ["Redi"],
};

const ambiguous: Readonly<Record<string, readonly string[]>> = {
  Gateway: ["gateway-terminals-india-pvt-ltd", "nhava-sheva-gateway-terminal"],
  "Nhava Sheva": ["jawahar-nehru-port-authority-jnpa", "nhava-sheva-freeport-terminal", "nhava-sheva-gateway-terminal", "nhava-sheva-international-container-terminal"],
  "Mumbai Container Terminal": ["mumbai-container-terminal", "ictpl"],
  BPCL: ["bpcl-cargo-jetty", "bpcl-liquid-cargo-jetty"],
  Adani: ["nhava-sheva-freeport-terminal"], // Even one catalog candidate does not identify an operator's terminal.
};
export type PortMention = { start: number; end: number; text: string; candidates: string[]; ambiguous: boolean };
export type PortSelection = { status: "identified" | "comparison" | "ambiguous" | "unresolved"; candidates: string[]; mentions: PortMention[]; rejectedCandidates?: string[]; operation?: "preserve" };
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function resolvePortIdentity(text: string): PortSelection | undefined {
  const matches: PortMention[] = [];
  const collect = (alias: string, candidates: readonly string[], isAmbiguous: boolean, exact = false) => {
    const pattern = exact ? escape(alias) : alias.split(/[ -]+/).map(escape).join("[\\s-]+");
    for (const m of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, "giu"))) {
      matches.push({ start: m.index, end: m.index + m[0].length, text: m[0], candidates: [...candidates], ambiguous: isAmbiguous });
    }
  };
  // Exact identifiers remain compatible. Longest spans prevent Mumbai inside BMCT,
  // JNPT inside JSW JNPT, and Gateway inside GTI from authorizing another facility.
  for (const slug of SUPPORTED_PORTS) collect(slug, [slug], false, true);
  for (const [slug, aliases] of Object.entries(PORT_ALIASES)) if (SUPPORTED_PORTS.includes(slug))
    for (const alias of aliases) collect(alias, [slug], false);
  for (const [alias, candidates] of Object.entries(ambiguous)) collect(alias, candidates, true);
  matches.sort((a, b) => Number(a.ambiguous) - Number(b.ambiguous));
  const maximal = maximalSpans(matches);
  const selected = maximal.filter(m => isAsserted(text, m.start));
  const rejectedCandidates = [...new Set(maximal.filter(m => operationAt(text, m.start) === "reject").flatMap(m => m.candidates))];
  if (!selected.length) return rejectedCandidates.length ? { status: "unresolved", candidates: [], mentions: [], rejectedCandidates } : undefined;
  const candidates = [...new Set(selected.flatMap(m => m.candidates))];
  const comparison = /\b(?:compare|comparison|versus|vs\.?|both)\b/i.test(text);
  return { status: selected.some(m => m.ambiguous) ? "ambiguous" : candidates.length === 1 ? "identified" : comparison ? "comparison" : "ambiguous", candidates, mentions: selected,
    ...(selected.every(m => operationAt(text, m.start) === "preserve") ? { operation: "preserve" as const } : {}) };
}

// Reviewed berth identities used by the existing official handlers. Catalog
// identity establishes a name only; it never establishes a tariff or eligibility.
const BERTH_IDENTITIES=[{canonical:'Indira Dock',port:'mumbai',aliases:['Indira Dock','indira-dock']}];
const identityText=(s:string)=>s.normalize('NFKC').replace(/[‐‑‒–—_]/g,'-').replace(/\s+/g,' ').trim();
const identityKey=(s:string)=>identityText(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function resolveCatalogLocation(field:'port'|'terminal',proposed:string,authored:string):string {
  const name=identityText(proposed),text=identityText(authored);
  const berth=BERTH_IDENTITIES.find(b=>b.aliases.some(a=>identityKey(a)===identityKey(name)));
  if(berth){
    const key=identityKey(text);
    const hits=berth.aliases.flatMap(a=>[...key.matchAll(new RegExp(`\\b${escape(identityKey(a))}\\b`,'g'))]);
    if(!hits.some(m=>isAsserted(key,m.index!)))throw new Error('Catalog berth identity is absent or not asserted.');
    const port=resolvePortIdentity(text);
    if(port&&(!port.candidates.includes(berth.port)||port.status==='ambiguous'))throw new Error('Catalog berth conflicts with the stated port identity.');
    return field==='terminal'?berth.canonical:berth.port;
  }
  const requested=resolvePortIdentity(name),actual=resolvePortIdentity(text);
  if(requested?.status==='ambiguous'||actual?.status==='ambiguous')throw new Error('Catalog identity is ambiguous; no terminal is selected.');
  if(requested?.status==='identified'){
    if(actual?.status!=='identified'||actual.candidates[0]!==requested.candidates[0])throw new Error('Proposed catalog identity does not match the authored location.');
    return actual.candidates[0];
  }
  if(actual)throw new Error('Proposed location is not the identified catalog entry.');
  // An unsupported label stays unsupported. It cannot become a catalog ID or
  // acquire authority just because the model supplied it.
  return name;
}
