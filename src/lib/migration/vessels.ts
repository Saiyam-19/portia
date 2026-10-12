import "server-only";

const VESSEL_BASE = "https://api.vesselapi.com";
const MANUAL_FALLBACK = "Vessel lookup is not configured. Ask the user for vessel particulars (GRT, DWT, LOA and draught).";
const MAX_UPSTREAM_BYTES = 256_000;
const MAX_FIELD_CHARS = 200;
const MAX_TOOL_OUTPUT_CHARS = 12_000;

type VesselOptions = { fetchImpl?: typeof fetch; abortSignal?: AbortSignal };

function display(value: unknown, fallback = "Unknown"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value).slice(0, MAX_FIELD_CHARS);
}

function numberDisplay(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US")
    : "Unknown";
}

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
  if (!response.body) return {};
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
): Promise<string> {
  if (!process.env.VESSEL_API_KEY) return MANUAL_FALLBACK;
  const normalized = query.trim();
  if (!normalized || normalized.length > 160) return "Enter a vessel name, IMO, MMSI, or callsign.";
  try {
    const response = await vesselFetch("/v1/search/vessels", {
      q: normalized,
      "pagination.limit": String(Math.min(Math.max(Math.trunc(limit), 1), 50)),
    }, options);
    if (!response.ok) return `Vessel search is unavailable (status ${response.status}). Ask the user for vessel particulars.`;
    const payload = await readBoundedJson(response) as { vessels?: unknown };
    const vessels = Array.isArray(payload.vessels) ? payload.vessels : [];
    if (vessels.length === 0) return `No vessels found matching '${normalized}'.`;
    return vessels.slice(0, 50).map((item) => {
      const vessel = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return `- **${display(vessel.name, "Unknown vessel")}** | IMO: ${display(vessel.imo)} | MMSI: ${display(vessel.mmsi)} | Type: ${display(vessel.vessel_type)} | Flag: ${display(vessel.country)} | Status: ${display(vessel.operating_status)}`;
    }).join("\n").slice(0, MAX_TOOL_OUTPUT_CHARS);
  } catch (error) {
    if (options.abortSignal?.aborted) throw error;
    return "Vessel search is unavailable. Ask the user for vessel particulars (GRT, DWT, LOA and draught).";
  }
}

export async function getVessel(
  id: string,
  idType: "imo" | "mmsi" = "imo",
  options: VesselOptions = {},
): Promise<string> {
  if (!process.env.VESSEL_API_KEY) return MANUAL_FALLBACK;
  if (idType !== "imo" && idType !== "mmsi") return "id_type must be 'imo' or 'mmsi'.";
  const normalized = id.trim();
  if (!/^\d{5,10}$/.test(normalized)) return "Enter a valid numeric IMO or MMSI identifier.";
  try {
    const response = await vesselFetch(`/v1/vessel/${normalized}`, { "filter.idType": idType }, options);
    if (response.status === 404) return `No vessel found with ${idType.toUpperCase()} ${normalized}.`;
    if (!response.ok) return `Vessel lookup is unavailable (status ${response.status}). Ask the user for vessel particulars.`;
    const payload = await readBoundedJson(response) as { vessel?: unknown };
    const vessel = payload.vessel && typeof payload.vessel === "object"
      ? payload.vessel as Record<string, unknown>
      : {};
    return [
      `**${display(vessel.name, "Unknown vessel")}**`,
      `- IMO: ${display(vessel.imo)} | MMSI: ${display(vessel.mmsi)} | Callsign: ${display(vessel.call_sign)}`,
      `- Type: ${display(vessel.vessel_type)} | Flag: ${display(vessel.country)} (${display(vessel.country_code)})`,
      `- Built: ${display(vessel.year_built)} | Status: ${display(vessel.operating_status)}`,
      `- Dimensions: ${display(vessel.length)}${display(vessel.length_unit, "")} × ${display(vessel.breadth)}${display(vessel.breadth_unit, "")}`,
      `- GRT: ${numberDisplay(vessel.gross_tonnage)} | DWT: ${numberDisplay(vessel.deadweight_tonnage)}`,
      `- Avg draught: ${numberDisplay(vessel.draught_calculated_avg)}m | Max draught: ${numberDisplay(vessel.draught_observed_max)}m`,
      `- Owner: ${display(vessel.owner_name)} | Manager: ${display(vessel.manager_name)}`,
      `- Home port: ${display(vessel.home_port)} | Class: ${display(vessel.class_society)}`,
    ].join("\n");
  } catch (error) {
    if (options.abortSignal?.aborted) throw error;
    return "Vessel lookup is unavailable. Ask the user for vessel particulars (GRT, DWT, LOA and draught).";
  }
}
