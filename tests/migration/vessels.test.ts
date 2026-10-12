import { afterEach, describe, expect, it, vi } from "vitest";
import { getVessel, searchVessels } from "../../src/lib/migration/vessels";

describe("vessel tools", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses a manual fallback when the key is missing", async () => {
    vi.stubEnv("VESSEL_API_KEY", "");
    expect(await searchVessels("Aurora", 5)).toMatch(/Ask the user.*GRT.*DWT.*LOA.*draught/);
    expect(await getVessel("1234567", "imo")).toMatch(/Ask the user.*GRT.*DWT.*LOA.*draught/);
  });

  it("uses only the fixed host, clamps limits and formats null fields safely", async () => {
    vi.stubEnv("VESSEL_API_KEY", "test-key");
    const urls: URL[] = [];
    const redirects: Array<RequestRedirect | undefined> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      urls.push(url);
      redirects.push(init?.redirect);
      if (url.pathname.includes("/search/")) {
        return Response.json({ vessels: [{ name: null, imo: null, gross_tonnage: null }] });
      }
      return Response.json({ vessel: { name: null, gross_tonnage: null, draught_calculated_avg: null } });
    };
    expect(await searchVessels("Aurora", 500, { fetchImpl })).toContain("Unknown vessel");
    expect(await getVessel("1234567", "imo", { fetchImpl })).toContain("Unknown vessel");
    expect(urls.every((url) => url.origin === "https://api.vesselapi.com")).toBe(true);
    expect(urls[0]?.searchParams.get("pagination.limit")).toBe("50");
    expect(redirects).toEqual(["error", "error"]);
  });

  it("rejects malformed identifiers without network access", async () => {
    vi.stubEnv("VESSEL_API_KEY", "test-key");
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await getVessel("../../secret", "imo", { fetchImpl })).toMatch(/valid numeric/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects oversized upstream bodies and bounds displayed fields", async () => {
    vi.stubEnv("VESSEL_API_KEY", "test-key");
    const huge = "x".repeat(300_000);
    const oversized: typeof fetch = async () => new Response(JSON.stringify({ vessels: [{ name: huge }] }));
    expect(await searchVessels("Aurora", 5, { fetchImpl: oversized })).toMatch(/unavailable/);

    const longField: typeof fetch = async () => Response.json({ vessels: [{ name: "x".repeat(2_000) }] });
    const output = await searchVessels("Aurora", 5, { fetchImpl: longField });
    expect(output.length).toBeLessThan(1_000);
  });
});
