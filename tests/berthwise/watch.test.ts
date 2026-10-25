/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import betterAuthTest from "@convex-dev/better-auth/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { portBooks } from "../../src/lib/berthwise/rulebook/books";
import { estimate } from "../../src/lib/berthwise/rulebook/calculate";
import { freshnessNotices, watchList } from "../../src/lib/berthwise/rulebook/watch";

const book = (id: string) => portBooks().find(item => item.id === id)!;

describe("which rate documents are watched", () => {
  it("watches every current rate document except fuel-surcharge notices", () => {
    const list = watchList(portBooks(), "2026-10-26");
    expect(list.some(doc => /fuel surcharge/i.test(doc.title))).toBe(false);
    expect(list.map(doc => doc.documentId)).toContain("bpts-2026-06-15");
    // Paradip's indexed schedule ended on 9 October 2026.
    expect(list.some(doc => doc.portId === "paradip" && doc.documentId === "sor-indexed-2026-27")).toBe(false);
    expect(new Set(list.map(doc => doc.url)).size).toBe(list.length);
  });

  it("warns about a fuel surcharge older than a fortnight, and a changed document", () => {
    const mundra = book("mundra");
    const call = (date: string) => estimate(mundra, { date, status: "foreign", vesselType: "bulk", grt: "30000", charges: ["pilotage"] });
    expect(freshnessNotices(mundra, call("2026-10-10"), [], "2026-10-10")).toEqual([]);
    expect(freshnessNotices(mundra, call("2026-10-26"), [], "2026-10-26")).toEqual(["The fuel surcharge is from the notice of 1 October 2026. Adani Mundra Port usually revises it about twice a month, so check the latest trade notice before relying on it."]);
    const changed = [{ url: "", portId: "mundra", documentId: "bpts-2026-06-15", status: "changed" as const, since: Date.parse("2026-11-03T03:15:00Z") }];
    expect(freshnessNotices(mundra, call("2026-10-10"), changed, "2026-10-10")[0]).toContain("has changed on the port's website since we read it (noticed 3 November 2026)");
  });
});

describe("the monthly check in Convex", () => {
  beforeEach(() => { vi.stubEnv("MIGRATION_DEV_ENABLED", "true"); vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT", "brilliant-whale-380"); vi.stubEnv("CONVEX_SITE_URL", "https://brilliant-whale-380.convex.site"); vi.stubEnv("PORTIA_AUTH_MODE", "basic"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("records unchanged, changed and unreachable documents and reports the changes", async () => {
    const t = convexTest(schema, import.meta.glob("../../convex/**/*.ts")); agentTest.register(t); betterAuthTest.register(t);
    const due = watchList().slice(0, 8);
    const changedUrl = due[1]!.url, missingUrl = due[2]!.url;
    // Every document comes back as its recorded bytes, except one changed file and one missing one.
    const { readFileSync } = await import("node:fs");
    const files = new Map(portBooks().flatMap(item => item.versions.flatMap(version => version.documents.map(doc => [doc.url, doc.file] as const))));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url === missingUrl ? new Response("gone", { status: 404 })
      : new Response(url === changedUrl ? "a newer schedule" : readFileSync(files.get(url)!), { status: 200 })));
    expect(await t.action(internal.sourceWatch.checkDue, {})).toBe(8);
    const now = Date.now();
    const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "S", email: "a@example.com", emailVerified: false, createdAt: now, updatedAt: now } } });
    const session = await t.mutation(components.betterAuth.adapter.create, { input: { model: "session", data: { userId: user._id, token: "x", expiresAt: now + 3600000, createdAt: now, updatedAt: now } } });
    const signedIn = t.withIdentity({ subject: user._id, sessionId: session._id });
    expect((await signedIn.query(api.sourceWatch.sourceStatus, {})).map(item => [item.url, item.status])).toEqual([[changedUrl, "changed"]]);
    expect(await t.query(api.sourceWatch.sourceStatus, {})).toEqual([]);
    // The next run checks the next documents; checked ones wait a month.
    const second = await t.action(internal.sourceWatch.checkDue, {});
    expect(second).toBe(Math.min(8, watchList().length - 8));
  });
});
