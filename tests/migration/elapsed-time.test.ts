import { describe, expect, it } from "vitest";
import { calculateElapsedTime } from "../../src/lib/migration/elapsed-time";

describe("validated elapsed time", () => {
  it("requires clarification for an ambiguous numeric date even with an Indian time zone", () => {
    expect(calculateElapsedTime({ start: "05/06/2026 at 08:00", end: "06/06/2026 at 20:00", timeZone: "IST" })).toMatchObject({ status: "clarification_required", error: "AMBIGUOUS_DATE" });
  });
  it.each([["DMY", "36"], ["MDY", "756"]] as const)("honours explicitly confirmed %s order", (dateOrder, elapsedHours) => {
    expect(calculateElapsedTime({ start: "05/06/2026 at 08:00", end: "06/06/2026 at 20:00", dateOrder, timeZone: "IST" })).toMatchObject({ status: "ok", elapsedHours });
  });
  it("normalizes mixed zones without billing-rounding", () => {
    expect(calculateElapsedTime({ start: "19 October 2026 at 03:00 UTC", end: "20 October 2026 at 15:30 IST" })).toMatchObject({ status: "ok", startUtc: "2026-10-19T03:00:00.000Z", endUtc: "2026-10-20T10:00:00.000Z", elapsedHours: "31" });
  });
  it("supports ISO offsets, fractional seconds and equal instants", () => {
    expect(calculateElapsedTime({ start: "2026-10-19T03:00:00.125Z", end: "2026-10-19T08:30:00.125+05:30" })).toMatchObject({ status: "ok", elapsedSeconds: "0" });
  });
  it("does not silently normalize nonexistent dates", () => {
    expect(calculateElapsedTime({ start: "29 February 2027 at 10:00 IST", end: "1 March 2027 at 10:00 IST" })).toMatchObject({ error: "INVALID_DATE" });
    expect(calculateElapsedTime({ start: "29 February 2028 at 10:00 IST", end: "1 March 2028 at 10:00 IST" })).toMatchObject({ status: "ok", elapsedHours: "24" });
  });
  it.each(["31 April 2026 at 10:00 UTC", "2026-13-01T10:00Z", "2026-10-19T24:00Z", "2026-10-19T12:60Z"])("rejects invalid date/time %s", start => {
    expect(calculateElapsedTime({ start, end: "2026-12-01T10:00Z" })).toMatchObject({ error: "INVALID_DATE" });
  });
  it("rejects reversed intervals rather than taking their absolute value", () => {
    expect(calculateElapsedTime({ start: "20 October 2026 at 18:00 IST", end: "19 October 2026 at 06:00 IST" })).toMatchObject({ error: "REVERSED_INTERVAL" });
  });
  it("does not guess a missing zone or accept an impossible UTC offset", () => {
    expect(calculateElapsedTime({ start: "19 October 2026 at 03:00", end: "20 October 2026 at 15:30" })).toMatchObject({ error: "MISSING_TIME_ZONE" });
    expect(calculateElapsedTime({ start: "2026-10-19T03:00+14:30", end: "2026-10-20T15:30Z" })).toMatchObject({ error: "INVALID_TIME_ZONE" });
  });
});
