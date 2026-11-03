/** Opt-in production benchmark (?profile=1), also available during development.
 * Measures delivered animation cadence, not just JavaScript execution time. */
export function frameSampler(element: Element, phase: () => string = () => "ocean") {
  const history = new URLSearchParams(location.search).get("profile") === "1";
  if (process.env.NODE_ENV !== "development" && !history) return;
  const gaps: number[] = [];
  const samples: object[] = [];
  let last = 0, cpu = 0, started = 0, state = phase();
  element.setAttribute("data-frame-state", "paused");
  return {
    begin(now: number) {
      if (!last) element.setAttribute("data-frame-state", "running");
      const next = phase();
      if (next !== state) { gaps.length = 0; cpu = 0; last = 0; state = next; }
      if (last) gaps.push(now - last);
      last = now;
      started = performance.now();
    },
    end() {
      cpu += performance.now() - started;
      if (gaps.length < 180) return;
      const sorted = [...gaps].sort((a, b) => a - b);
      const sample = { phase: state, frames: gaps.length, fps: +(gaps.length * 1000 / gaps.reduce((a, b) => a + b, 0)).toFixed(1), p95Ms: +sorted[Math.floor(gaps.length * .95)]!.toFixed(1), over25Ms: gaps.filter((n) => n > 25).length, cpuMs: +(cpu / gaps.length).toFixed(2) };
      element.setAttribute("data-frame-stats", JSON.stringify(sample));
      if (history) {
        samples.push(sample);
        if (samples.length > 40) samples.shift();
        element.setAttribute("data-frame-history", JSON.stringify(samples));
      }
      gaps.length = 0;
      cpu = 0;
    },
    reset() { last = 0; gaps.length = 0; cpu = 0; element.setAttribute("data-frame-state", "paused"); },
  };
}
