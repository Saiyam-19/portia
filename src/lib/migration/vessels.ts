import "server-only";
import { z } from "zod";
import { supportRetrySchema } from "../memory/input";
import { safe } from "../portia/quotes";

const VESSEL_BASE = "https://api.vesselapi.com";
const MANUAL_FALLBACK = "Vessel lookup is not configured. Ask the user for vessel particulars (GRT, DWT, LOA and draught).";
const MAX_UPSTREAM_BYTES = 256_000;
const MAX_FIELD_CHARS = 200;
const MAX_TOOL_OUTPUT_CHARS = 12_000;

type VesselOptions = { fetchImpl?: typeof fetch; abortSignal?: AbortSignal };

export const vesselQuerySchema = z.string().trim().min(1).max(160).refine(value => !/[\0\u0001-\u001f\u007f]/.test(value), "Query contains unsupported control characters.");
const imoSchema = z.string().regex(/^\d{7}$/).refine(value => [...value.slice(0, 6)].reduce((sum, digit, index) => sum + Number(digit) * (7 - index), 0) % 10 === Number(value[6]), "IMO checksum is invalid.");
const mmsiSchema = z.string().regex(/^\d{9}$/).refine(value => !/^0+$/.test(value), "MMSI is invalid.");
export const vesselSearchInputSchema = z.object({ query: vesselQuerySchema, retryOf: supportRetrySchema }).strict();
export const vesselGetInputSchema = z.object({ id: z.string().trim().max(9), id_type: z.enum(["imo", "mmsi"]), retryOf: supportRetrySchema }).strict().superRefine((input, context) => {
  const result = (input.id_type === "imo" ? imoSchema : mmsiSchema).safeParse(input.id);
  if (!result.success) context.addIssue({ code: "custom", path: ["id"], message: result.error.issues[0]?.message ?? `Invalid ${input.id_type.toUpperCase()}.` });
});
export type VesselSummary = { name: string; imo?: string; mmsi?: string; callSign?: string; vesselType?: string; country?: string; operatingStatus?: string };
type VesselTarget = { targets: string[]; body: string };
export type VesselLookupResult = VesselTarget & (
  | { status: "completed"; availability: "available"; query?: string; matches?: VesselSummary[]; vessel?: VesselSummary & { grossTonnage?: string; deadweightTonnage?: string; length?: string; breadth?: string; averageDraught?: string; maximumDraught?: string; owner?: string; manager?: string; homePort?: string; classSociety?: string; yearBuilt?: string }; identityVerified?: true }
  | { status: "unresolved"; availability: "unavailable" | "not_found" | "invalid"; error?: string }
);

const unavailable = (targets: string[], body = MANUAL_FALLBACK): VesselLookupResult => ({ status: "unresolved", availability: "unavailable", targets, body });
const invalidUpstream = (targets: string[]): VesselLookupResult => ({ status: "unresolved", availability: "invalid", targets, body: "Vessel lookup returned an invalid or mismatched response. Ask the user for vessel particulars.", error: "The upstream vessel response failed identity or shape validation." });
const visible = (value: string) => safe(value.normalize("NFKC").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`).slice(0, MAX_FIELD_CHARS));

function field(record: Record<string, unknown>, name: string): string | undefined {
  const value = record[name];
  if (value === null || value === undefined || value === "") return;
  if (typeof value !== "string" && typeof value !== "number" || typeof value === "number" && !Number.isFinite(value)) throw new Error("INVALID_VESSEL_SHAPE");
  return String(value).trim().slice(0, MAX_FIELD_CHARS);
}
function identifier(record: Record<string, unknown>, name: "imo" | "mmsi"): string | undefined {
  const value = field(record, name);
  if (value === undefined) return;
  if (!(name === "imo" ? imoSchema : mmsiSchema).safeParse(value).success) throw new Error("INVALID_VESSEL_IDENTITY");
  return value;
}
function positiveQuantity(record: Record<string, unknown>, name: string): string | undefined { const value=record[name]; if(value===null||value===undefined||value==="")return; if(typeof value!=="number"||!Number.isFinite(value)||value<=0||value>1e18)throw new Error("INVALID_VESSEL_SHAPE"); return String(value); }
function summary(record: Record<string, unknown>): VesselSummary {
  const imo=identifier(record,"imo"),mmsi=identifier(record,"mmsi"),callSign=field(record,"call_sign"),name=field(record,"name")??"Unknown vessel";
  if(name==="Unknown vessel"&&!imo&&!mmsi&&!callSign)throw new Error("INVALID_VESSEL_IDENTITY");
  return {name,...(imo?{imo}:{}),...(mmsi?{mmsi}:{}),...(callSign?{callSign}:{}),...(field(record,"vessel_type")?{vesselType:field(record,"vessel_type")} : {}),...(field(record,"country")?{country:field(record,"country")} : {}),...(field(record,"operating_status")?{operatingStatus:field(record,"operating_status")} : {})};
}
const shown=(value:string|undefined,fallback="Unknown")=>value===undefined?fallback:visible(value);

async function vesselFetch(
  path: string,
  params: Record<string, string>,
  options: VesselOptions,
): Promise<Response> {
  const key = process.env.VESSEL_API_KEY;
  if (!key) throw new Error(MANUAL_FALLBACK);
  const url = new URL(path, VESSEL_BASE);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  if (url.origin !== VESSEL_BASE) throw new Error("Invalid vessel endpoint.");
  const timeout = AbortSignal.timeout(10_000);
  const signal = options.abortSignal
    ? AbortSignal.any([options.abortSignal, timeout])
    : timeout;
  return await (options.fetchImpl ?? fetch)(url, {
    method: "GET",
    redirect: "error",
    signal,
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_UPSTREAM_BYTES) throw new Error("Vessel response is too large.");
  if (!response.body) throw new Error("INVALID_VESSEL_SHAPE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_UPSTREAM_BYTES) {
      await reader.cancel();
      throw new Error("Vessel response is too large.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(combined));
}

export async function searchVessels(
  query: string,
  limit = 5,
  options: VesselOptions = {},
): Promise<VesselLookupResult> {
  const parsed=vesselQuerySchema.safeParse(query),normalized=parsed.success?parsed.data:query.trim().slice(0,160),targets=normalized?[normalized]:[];
  if(!parsed.success)return {status:"unresolved",availability:"invalid",targets,body:"Enter a vessel name, valid IMO, MMSI, or callsign.",error:parsed.error.issues[0]?.message};
  if (!process.env.VESSEL_API_KEY) return unavailable(targets);
  try {
    const response = await vesselFetch("/v1/search/vessels", {
      q: parsed.data,
      "pagination.limit": String(Math.min(Math.max(Math.trunc(limit), 1), 50)),
    }, options);
    if (!response.ok) return unavailable(targets,`Vessel search is unavailable (status ${response.status}). Ask the user for vessel particulars.`);
    const payload=await readBoundedJson(response);
    if(!payload||typeof payload!=="object"||Array.isArray(payload)||!("vessels" in payload)||!Array.isArray((payload as {vessels?:unknown}).vessels))return invalidUpstream(targets);
    const matches=(payload as {vessels:unknown[]}).vessels.map(item=>{if(!item||typeof item!=="object"||Array.isArray(item))throw new Error("INVALID_VESSEL_SHAPE");return summary(item as Record<string,unknown>);}).slice(0,50);
    if(!matches.length)return {status:"unresolved",availability:"not_found",targets,body:`No vessels found matching '${visible(parsed.data)}'.`};
    const rows:string[]=[];
    for(const vessel of matches){const row=`- **${shown(vessel.name)}** | IMO: ${shown(vessel.imo)} | MMSI: ${shown(vessel.mmsi)} | Type: ${shown(vessel.vesselType)} | Flag: ${shown(vessel.country)} | Status: ${shown(vessel.operatingStatus)}`;if(rows.join("\n").length+row.length+1>MAX_TOOL_OUTPUT_CHARS)break;rows.push(row);}
    return {status:"completed",availability:"available",targets,query:parsed.data,matches,body:rows.join("\n")};
  } catch (error) {
    if (options.abortSignal?.aborted) throw error;
    return String(error).includes("INVALID_VESSEL")?invalidUpstream(targets):unavailable(targets,"Vessel search is unavailable. Ask the user for vessel particulars (GRT, DWT, LOA and draught).");
  }
}

export async function getVessel(
  id: string,
  idType: "imo" | "mmsi" = "imo",
  options: VesselOptions = {},
): Promise<VesselLookupResult> {
  const normalized=id.trim(),target=`${idType.toUpperCase()} ${normalized}`,targets=normalized?[target]:[],parsed=vesselGetInputSchema.safeParse({id,id_type:idType});
  if(!parsed.success)return {status:"unresolved",availability:"invalid",targets,body:`Enter a valid ${idType.toUpperCase()} identifier.`,error:parsed.error.issues[0]?.message};
  if (!process.env.VESSEL_API_KEY) return unavailable(targets);
  try {
    const response = await vesselFetch(`/v1/vessel/${normalized}`, { "filter.idType": idType }, options);
    if(response.status===404)return {status:"unresolved",availability:"not_found",targets,body:`No vessel found with ${target}.`};
    if(!response.ok)return unavailable(targets,`Vessel lookup is unavailable (status ${response.status}). Ask the user for vessel particulars.`);
    const payload=await readBoundedJson(response);
    if(!payload||typeof payload!=="object"||Array.isArray(payload)||!("vessel" in payload)||!(payload as {vessel?:unknown}).vessel||typeof (payload as {vessel:unknown}).vessel!=="object"||Array.isArray((payload as {vessel:unknown}).vessel))return invalidUpstream(targets);
    const record=(payload as {vessel:Record<string,unknown>}).vessel;
    if(identifier(record,idType)!==normalized)return invalidUpstream(targets);
    const base=summary(record),vessel={...base,
      ...(positiveQuantity(record,"gross_tonnage")?{grossTonnage:positiveQuantity(record,"gross_tonnage")} : {}),...(positiveQuantity(record,"deadweight_tonnage")?{deadweightTonnage:positiveQuantity(record,"deadweight_tonnage")} : {}),
      ...(positiveQuantity(record,"length")?{length:positiveQuantity(record,"length")} : {}),...(positiveQuantity(record,"breadth")?{breadth:positiveQuantity(record,"breadth")} : {}),
      ...(positiveQuantity(record,"draught_calculated_avg")?{averageDraught:positiveQuantity(record,"draught_calculated_avg")} : {}),...(positiveQuantity(record,"draught_observed_max")?{maximumDraught:positiveQuantity(record,"draught_observed_max")} : {}),
      ...(field(record,"owner_name")?{owner:field(record,"owner_name")} : {}),...(field(record,"manager_name")?{manager:field(record,"manager_name")} : {}),...(field(record,"home_port")?{homePort:field(record,"home_port")} : {}),...(field(record,"class_society")?{classSociety:field(record,"class_society")} : {}),...(field(record,"year_built")?{yearBuilt:field(record,"year_built")} : {})};
    const body=[`**${shown(vessel.name)}**`,`- IMO: ${shown(vessel.imo)} | MMSI: ${shown(vessel.mmsi)} | Callsign: ${shown(vessel.callSign)}`,`- Type: ${shown(vessel.vesselType)} | Flag: ${shown(vessel.country)} | Status: ${shown(vessel.operatingStatus)}`,`- Built: ${shown(vessel.yearBuilt)}`,`- Dimensions: ${shown(vessel.length)} × ${shown(vessel.breadth)}`,`- GRT: ${shown(vessel.grossTonnage)} | DWT: ${shown(vessel.deadweightTonnage)}`,`- Avg draught: ${shown(vessel.averageDraught)}m | Max draught: ${shown(vessel.maximumDraught)}m`,`- Owner: ${shown(vessel.owner)} | Manager: ${shown(vessel.manager)}`,`- Home port: ${shown(vessel.homePort)} | Class: ${shown(vessel.classSociety)}`].join("\n");
    return {status:"completed",availability:"available",targets,vessel,identityVerified:true,body};
  } catch (error) {
    if (options.abortSignal?.aborted) throw error;
    return String(error).includes("INVALID_VESSEL")?invalidUpstream(targets):unavailable(targets,"Vessel lookup is unavailable. Ask the user for vessel particulars (GRT, DWT, LOA and draught).");
  }
}
