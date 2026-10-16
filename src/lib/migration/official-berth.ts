import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Decimal from "decimal.js";
import approved from "../../../data/ports/mumbai/approved-2026-05-09/rules.json";
import { currentFacts, type CallContext } from "./call-context";
import { calculateElapsedTime } from "./elapsed-time";
import { calculateChargeBatch } from "./calculator-batch";
import type { QuoteBinding } from "./supplied-quotation";

type Rules = typeof approved;
type Fact = { id: string; field: string; value: string; start: number; end: number; raw: string; source: "user-statement" | "vessel-lookup" };
export type OfficialBerthPlan = { id: string; kind: "official-berth"; binding: QuoteBinding; contextHash: string; sourceTextHash: string;
  rulesHash: string; rules: Rules; facts: Fact[]; gt: string; startUtc: string; endUtc: string; readinessUtc: string };
export type OfficialBerthLedger = { kind: "official-berth"; planId: string; binding: QuoteBinding; contextHash: string; rulesHash: string;
  sourceClass: "official-tariff"; rules: Rules; factBindings: Fact[]; completeness: "scoped-complete"; allInPortCall: false;
  requestedCharges: string[]; pending: string[]; excluded: string[]; elapsedMinutes: string; billableMinutes: string; billableHours: string;
  suppliedGt: string; assessedGt: string; startUtc: string; endUtc: string; readinessUtc: string; chargedUntilUtc: string;
  minima: { grtFloorApplied: boolean; billMinimumApplied: boolean };
  amounts: { berth: string; cgst: string; sgst: string; gst: string; rounding: string; total: string };
  calculations: ReturnType<typeof calculateChargeBatch> };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sourceRoot = path.join(process.cwd(), "data/ports/mumbai/approved-2026-05-09");

/** Only server-owned reviewed rule data can be used; neither the user nor a
 * model can supply a rate, source URL, tax percentage or authority declaration. */
export async function loadOfficialBerthRules(candidate: Rules = approved): Promise<Rules> {
  for (const source of candidate.sources) {
    const bytes = await readFile(path.join(sourceRoot, source.file));
    if (createHash("sha256").update(bytes).digest("hex") !== source.sha256) throw new Error("Approved tariff source checksum mismatch.");
  }
  if (digest(candidate) !== digest(approved) || candidate.status !== "approved") throw new Error("Tariff rule version is not approved.");
  return structuredClone(candidate);
}

/** Bounded ordinary coastal berth-hire scope. Facts come from authenticated
 * current user context, never the specialist's rewritten query or itinerary. */
export async function prepareOfficialBerth(context: CallContext, binding: QuoteBinding): Promise<
  { status: "ready"; plan: OfficialBerthPlan } | { status: "needs-facts"; missing: string[] } | undefined
> {
  const text = context.latestText;
  if (!/\bberth[ -]hire\b/i.test(text) || !/\bGST\b/i.test(text)) return;
  // Mentioning calculation in a rule question is not a request for a vessel
  // estimate. Unsupported/non-estimation requests retain the existing path.
  if (!/(?:^|[.!?;\n])\s*(?:(?:please|(?:can|could|would)\s+you)\s+)?(?:estimate|calculate|quote)\b/i.test(text)) return;
  const target = /\bat\s+Mumbai\s+Port\s+Authority['’]s\s+Indira\s+Dock\b/i.exec(text);
  if (!target) return;
  const facts: Fact[] = []; const missing: string[] = [];
  const add = (field: string, m: RegExpMatchArray, value = m[0]) => { const start = m.index!; const id = digest({field,start,raw:m[0]});facts.push({id,field,value,start,end:start+m[0].length,raw:m[0],source:"user-statement"}); };
  const requireFact = (field: string, pattern: RegExp, value?: string) => {
    const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags+"g"))];
    if (matches.length !== 1) { missing.push(field);return undefined; }
    add(field,matches[0],value);return matches[0];
  };
  add("target-port-and-berth",target,"mumbai:Indira Dock");
  const gtFacts = currentFacts(context).filter(f => f.field === "gt" && f.status === "established" && f.origin.text === text);
  if (gtFacts.length !== 1 || context.issues.some(i => i.fields.includes("gt")) || context.activeScopeIds.length !== 1) missing.push("unambiguous current GT and vessel/call scope");
  else { const f=gtFacts[0];facts.push({id:f.id,field:"gt",value:f.value,start:f.origin.start,end:f.origin.end,raw:f.origin.raw,source:"user-statement"}); }
  requireFact("ordinary Indian general-cargo vessel",/\bordinary\s+Indian[ -]flag\s+general[ -]cargo\s+(?:ship|vessel)\b/i,"ordinary-indian-cargo");
  requireFact("dedicated coastal licence throughout call",/\bdedicated\s+coastal\s+service\s+with\s+a\s+valid\s+DG\s+Shipping\s+coastal\s+licen[cs]e\s+throughout\s+the\s+call\b/i,"dedicated-coastal-licensed");
  const modifier = "(?:with|without|under|subject|while|when|after|before|during|using|at|for)";
  const cargoWord = `(?!(?:${modifier})\\b)[a-z]+`;
  requireFact("cargo operation",new RegExp(`\\b(?:discharged|loaded)\\s+${cargoWord}(?:[ -]${cargoWord}){0,5}(?=\\s*(?:[,.;]|${modifier}\\b))`,"i"),"cargo-operation");
  requireFact("berth allotted",/\bberth\s+had\s+been\s+allotted\b/i,"allotted");
  requireFact("time zone",/\ball\s+times\s+are\s+IST\b/i,"Asia/Kolkata");
  const noAdjustments = requireFact("ordinary operation without adjustments",/\b(?:there\s+was|there\s+is)\s+no\s+[^.!?\n]+/i);
  const adjustments = [
    {field:"port-caused idle time",pattern:/\bport[ -]caused\s+idle\s+time\b/i},
    {field:"shifting",pattern:/\bshifting\b/i},
    {field:"false readiness",pattern:/\bfalse\s+readiness(?:\s+signal)?\b/i},
    {field:"priority",pattern:/\bpriority\b/i},
    {field:"ousting",pattern:/\bousting\b/i},
    {field:"penalty",pattern:/\bpenalt(?:y|ies)\b/i},
    {field:"rebate",pattern:/\b(?:special\s+)?rebate\b/i},
  ];
  if (noAdjustments && (!adjustments.every(({pattern})=>pattern.test(noAdjustments[0])) || /\b(?:but|unless|except)\b/i.test(noAdjustments[0]))) missing.push("all relevant idle/priority/penalty/rebate conditions");
  if (noAdjustments) {
    // Inspect these already-required applicability dimensions independently of
    // neutral cargo coverage. Identity/itinerary names are not operating facts.
    const namePatterns=[/\bMV\s+([A-Za-z][A-Za-z '-]{0,80})(?=\s+at\b)/gi,/\b(?:came\s+from|sailed\s+for)\s+([A-Za-z][A-Za-z '-]{0,80})(?=[,.;])/gi];
    const names=namePatterns.flatMap(p=>[...text.matchAll(p)].map(m=>{
      const start=m.index!+m[0].indexOf(m[1]);const qualifier=new RegExp(`\\s+${modifier}\\b`,"i").exec(m[1]);
      return {start,end:start+(qualifier?.index??m[1].length)};
    }));
    const conflicts=adjustments.filter(({pattern})=>[...text.matchAll(new RegExp(pattern.source,"gi"))].some(m=>{
      const at=m.index!;
      if(at>=noAdjustments.index!&&at<noAdjustments.index!+noAdjustments[0].length)return false;
      if(names.some(n=>at>=n.start&&at<n.end))return false;
      return !/\b(?:no|not|without)\s+(?:(?:any|an?)\s+)?$/i.test(text.slice(0,at));
    }));
    if(conflicts.length)return {status:"needs-facts",missing:conflicts.map(({field})=>`conflicting ${field} information: confirm whether it applies; the ordinary-operation clause excludes it`)};
  }
  const ordinary = requireFact("special vessel exclusions",/\b(?:she|it|the\s+vessel)\s+is\s+not\s+an?\s+[^.!?\n]+/i);
  if (ordinary && (![/offshore\s+supply/i,/naval/i,/coast\s*guard/i,/passenger/i,/cruise/i].every(p=>p.test(ordinary[0])) || /\b(?:but|unless|except)\b/i.test(ordinary[0]))) missing.push("all special vessel exclusions");
  requireFact("valid readiness signal and conditions",/\bvalid\s+readiness[ -]to[ -]sail\s+signal\b/i,"valid");
  requireFact("favourable tide and weather",/\bfavou?rable\s+tide\s+and\s+weather\b/i,"favourable");
  requireFact("direct port service to regular registered private customer",/\bport\s+supplies\s+and\s+bills\s+this\s+service\s+directly\s+to\s+(?:our|the)\s+regular\s+GST[ -]registered\s+private\s+shipping\s+company\s+in\s+Maharashtra\b/i,"direct-regular-domestic");
  requireFact("supplier location and place of supply both Maharashtra",/\bboth\s+the\s+supplier\s+location\s+and\s+place\s+of\s+supply\s+are\s+Maharashtra\b/i,"Maharashtra:Maharashtra");
  requireFact("not SEZ",/\b(?:we|they)\s+are\s+not\s+an?\s+SEZ\s+unit\b/i,"not-sez");
  requireFact("no tax exemption or concession",/\bno\s+tax\s+exemption\s+or\s+concessional\s+agreement\b/i,"none");
  requireFact("standalone berth-hire bill",/\bberth\s+hire\s+as\s+a\s+single\s+standalone\s+bill\b/i,"standalone-berth-hire");
  requireFact("other port-call services excluded",/\bleave\s+other\s+port[ -]call\s+services\s+outside\s+this\s+estimate\b/i,"other-services-excluded");

  const month = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";
  const event = (field: string, verb: string, optionalYear=false) => requireFact(field,new RegExp(`\\b${verb}\\s+(\\d{1,2}:\\d{2})\\s+on\\s+(\\d{1,2}\\s+${month})(\\s+\\d{4})${optionalYear?"?":""}\\b`,"i"));
  const start=event("berth taken","(?:took|takes)\\s+(?:it|(?:the\\s+)?berth)\\s+at");
  const end=event("berth left","(?:leaving|left|leaves)\\s+at");
  const ready=event("readiness time","readiness[ -]to[ -]sail\\s+signal\\s+(?:was|is)\\s+at",true);
  // An extra governing clause cannot be silently discarded just because the
  // required positive phrases also occur. Cover supported facts and neutral
  // narrative only; unresolved wording remains a clarification, not a ledger.
  const covered=new Uint8Array(text.length);const cover=(a:number,b:number)=>covered.fill(1,a,b);
  for(const f of facts)cover(f.start,f.end);
  for(const f of currentFacts(context).filter(f=>["nt","loa"].includes(f.field)&&f.status==="established"&&f.origin.text===text))cover(f.origin.start,f.origin.end);
  const neutral=[
    /\bplease\s+estimate\s+the\s+complete\s+berth[ -]hire\s+amount,?\s+including\s+GST,?\s+any\s+applicable\s+minimum\s+and\s+final\s+bill\s+rounding,?\s+for\s+MV\s+[A-Za-z][A-Za-z '-]{0,80}(?=\s+at\b)/gi,
    /\b(?:she|it)\s+is\s+an?\b/gi,/\bof\b/gi,/\bLOA\b/gi,/\b\d+(?:\.\d+)?\s+m\s+arrival\s+draft\b/gi,/\bon\s+a\b/gi,
    /\b(?:she|it)\s+came\s+from\s+[A-Za-z][A-Za-z '-]{0,80}(?=,)/gi,
    /\bsailed\s+for\s+[A-Za-z][A-Za-z '-]{0,80}(?=[.;])/gi,
    /\b(?:the|and\s+she|and\s+have|and|her|with)\b/gi,
    /\bplease\s+treat\b/gi,/\bshow\s+the\s+working\s+and\s+official\s+sources\b/gi,
  ];
  for(const pattern of neutral)for(const m of text.matchAll(pattern))cover(m.index!,m.index!+m[0].length);
  if(text.split("").some((c,i)=>!covered[i]&&!/[\s.,;:!?]/.test(c)))missing.push("interpretation of additional or unsupported request clauses");
  if(noAdjustments && noAdjustments[0].replace(/^there\s+(?:was|is)\s+no\s+/i,"").replace(/port[ -]caused\s+idle\s+time|shifting|false\s+readiness\s+signal|priority|ousting\s+arrangement|penalty|special\s+rebate|\b(?:and|or)\b|[\s,]/gi,"").length)missing.push("unsupported adjustment condition");
  if(ordinary && ordinary[0].replace(/^(?:she|it|the\s+vessel)\s+is\s+not\s+an?\s+/i,"").replace(/offshore\s+supply|naval|coast\s*guard|passenger|cruise|vessel|\b(?:and|or)\b|[\s,]/gi,"").length)missing.push("unsupported vessel-category condition");
  if(missing.length || !start || !end || !ready || !gtFacts[0])return {status:"needs-facts",missing:[...new Set(missing)]};
  const startText=`${start[2]}${start[3]} ${start[1]}`;const endText=`${end[2]}${end[3]} ${end[1]}`;
  const readinessYear=ready[3]??end[3];
  const elapsed=calculateElapsedTime({start:startText,end:endText,timeZone:"IST"});
  const readiness=calculateElapsedTime({start:startText,end:`${ready[2]}${readinessYear} ${ready[1]}`,timeZone:"IST"});
  if(elapsed.status!=="ok" || readiness.status!=="ok" || new Decimal(elapsed.elapsedMinutes).lte(0) || Date.parse(readiness.endUtc)>Date.parse(elapsed.endUtc))return {status:"needs-facts",missing:["ordered berth/readiness times within the same call"]};
  const rules=await loadOfficialBerthRules();
  // When the readiness cap would shorten occupation, the clock's exclusions
  // (including waiting for night navigation) need additional explicit facts.
  // They cannot affect the approved case whose departure precedes that cap.
  if(Date.parse(readiness.endUtc)+new Decimal(rules.readinessAllowanceHours).mul(3_600_000).toNumber()<Date.parse(elapsed.endUtc))return {status:"needs-facts",missing:["readiness-clock exclusions for adverse tide/weather or unavailable night navigation before applying an earlier cutoff"]};
  const from=Date.parse(rules.effectiveFrom+"T00:00:00+05:30"),through=Date.parse(rules.verifiedThrough+"T23:59:59+05:30");
  if(Date.parse(elapsed.startUtc)<from || Date.parse(elapsed.endUtc)>through)return {status:"needs-facts",missing:["approved tariff version for the call dates; this version is verified only from "+rules.effectiveFrom+" through "+rules.verifiedThrough]};
  if(new Decimal(gtFacts[0].value).lte(0) || new Decimal(gtFacts[0].value).gt("1e7"))return {status:"needs-facts",missing:["valid vessel GT"]};
  const plan={kind:"official-berth" as const,binding:{...binding},contextHash:context.hash,sourceTextHash:digest(text),rulesHash:digest(rules),rules,facts,gt:gtFacts[0].value,startUtc:elapsed.startUtc,endUtc:elapsed.endUtc,readinessUtc:readiness.endUtc};
  return {status:"ready",plan:{...plan,id:digest(plan)}};
}

export function calculateOfficialBerth(plan: OfficialBerthPlan): OfficialBerthLedger {
  const {id,...unsigned}=plan;
  if(digest(unsigned)!==id || digest(plan.rules)!==plan.rulesHash || digest(plan.rules)!==digest(approved))throw new Error("Official tariff bindings changed.");
  const r=plan.rules;const elapsedSeconds=new Decimal(Date.parse(plan.endUtc)-Date.parse(plan.startUtc)).div(1000);
  const readySeconds=new Decimal(Date.parse(plan.readinessUtc)-Date.parse(plan.startUtc)).div(1000);
  const calculations=calculateChargeBatch([
    {id:"billable_seconds",expression:`min(${elapsedSeconds.toString()},${readySeconds.toString()}+${r.readinessAllowanceHours}*3600)`},
    {id:"billable_hours",expression:"ceil($billable_seconds/3600)"},
    {id:"assessed_gt",expression:`max(${plan.gt},${r.minimumGrt})`},
    {id:"berth_raw",expression:`$assessed_gt*${r.ratePerGrtStartedHour}*$billable_hours`},
    {id:"berth",expression:`max(${r.minimumBill},$berth_raw)`},
    {id:"cgst",expression:`$berth*${r.cgstPercent}/100`},{id:"sgst",expression:`$berth*${r.sgstPercent}/100`},
    {id:"gst",expression:"$cgst+$sgst"},{id:"unrounded_total",expression:"$berth+$gst"},
    {id:"total",expression:"ceil($unrounded_total)"},{id:"rounding",expression:"$total-$unrounded_total"},
  ]);
  const values=new Map(calculations.map(c=>[c.id,c.result]));const value=(key:string)=>new Decimal(values.get(key)!);
  // The approved slice does not adjudicate fractional-paise tax precedence.
  // Keep that unresolved rather than silently selecting a new tax-rounding rule.
  if(value("cgst").decimalPlaces()>2 || value("sgst").decimalPlaces()>2)throw new Error("Fractional-paise tax rounding requires an approved rule.");
  const billableSeconds=value("billable_seconds");
  return {kind:"official-berth",planId:id,binding:plan.binding,contextHash:plan.contextHash,rulesHash:plan.rulesHash,sourceClass:"official-tariff",rules:r,factBindings:plan.facts,
    completeness:"scoped-complete",allInPortCall:false,requestedCharges:["berth","cgst","sgst","bill-rounding"],pending:[],excluded:["Other port-call services, including port dues, pilotage/tugs, shifting and cargo services","TDS, credits, deposits and settlement adjustments"],
    elapsedMinutes:elapsedSeconds.div(60).toString(),billableMinutes:billableSeconds.div(60).toString(),billableHours:value("billable_hours").toString(),suppliedGt:plan.gt,assessedGt:value("assessed_gt").toString(),
    startUtc:plan.startUtc,endUtc:plan.endUtc,readinessUtc:plan.readinessUtc,chargedUntilUtc:new Date(Date.parse(plan.startUtc)+billableSeconds.toNumber()*1000).toISOString(),
    minima:{grtFloorApplied:new Decimal(plan.gt).lt(r.minimumGrt),billMinimumApplied:value("berth_raw").lt(r.minimumBill)},
    amounts:{berth:value("berth").toFixed(2),cgst:value("cgst").toFixed(2),sgst:value("sgst").toFixed(2),gst:value("gst").toFixed(2),rounding:value("rounding").toFixed(2),total:value("total").toFixed(2)},calculations};
}
export function verifyOfficialBerth(ledger: unknown, plan: OfficialBerthPlan): ledger is OfficialBerthLedger {
  try {return digest(ledger)===digest(calculateOfficialBerth(plan));}catch{return false;}
}
const money=(raw:string)=>"INR "+new Decimal(raw).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,",");
const localTime=(iso:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(iso))+" IST";
export function renderOfficialBerth(l: OfficialBerthLedger): string {
  const r=l.rules;const a=l.amounts;const minutes=new Decimal(l.elapsedMinutes);const hours=minutes.div(60).floor().toString();const remainder=minutes.mod(60).toString();
  return `**Mumbai Port Authority — Indira Dock: complete berth-hire estimate including GST**\n\nBased on your stated ordinary Indian coastal-cargo vessel, valid coastal licence, operating conditions and domestic tax facts. Those facts have not been independently verified.\n\n| Component | Amount |\n|---|---:|\n| Berth hire | ${money(a.berth)} |\n| CGST ${r.cgstPercent}% | ${money(a.cgst)} |\n| SGST ${r.sgstPercent}% | ${money(a.sgst)} |\n| Upward whole-rupee bill adjustment | ${money(a.rounding)} |\n| **Complete scoped total** | **${money(a.total)}** |\n\n- **Time:** ${localTime(l.startUtc)} → ${localTime(l.endUtc)} = ${hours}h ${remainder}m elapsed; **${l.billableHours} commenced hours** billed. Valid readiness ${localTime(l.readinessUtc)} + ${r.readinessAllowanceHours}h; charge ends at the earlier of that cutoff and actual departure (${localTime(l.chargedUntilUtc)}).\n- **Formula:** assessed ${l.assessedGt} GT/GRT × INR ${r.ratePerGrtStartedHour}/GRT/hour or part × ${l.billableHours}h = ${money(a.berth)}. Assessed tonnage uses max(${l.suppliedGt}, ${r.minimumGrt}); the INR ${r.minimumBill} minimum bill is also checked. Tonnage floor ${l.minima.grtFloorApplied ? "applies" : "does not change the result"}; bill minimum ${l.minima.billMinimumApplied ? "applies" : "does not change the result"}. The published coastal INR rate is used directly, with no extra 60% reduction or FX.\n- **GST:** SAC ${r.sac}; ${money(a.gst)} total tax (${money(a.cgst)} + ${money(a.sgst)}), included once. Supplier location and place of supply are both Maharashtra; no IGST is added. Final bill is rounded upward to whole INR.\n- **Scope:** berth hire, GST and bill rounding only; other port-call services and settlement adjustments are excluded as requested. An estimate under the stated facts, not certification of an actual invoice.\n\n**Official sources and validity:** [MbPA May 2026 SOR, physical pp.4,6,22–23; §1.2 and §2.17 row1/notes](${r.sources[0].url}) and [9 May 2026 amendment, p.2](${r.sources[1].url}); [MbPA GST classification, p.38](${r.sources[2].url}); [CBIC services, serial11/heading9967](${r.sources[3].url}) and [intra-state supply, FAQ85](${r.sources[4].url}). Rate effective ${r.effectiveFrom}; this source version is verified through ${r.verifiedThrough}. Annual indexation or later amendments require a new verification; the older GST classification is corroborated by the CBIC table.`;
}
