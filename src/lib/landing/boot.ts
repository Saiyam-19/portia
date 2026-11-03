/**
 * First-load gate. The loader's emblem fills as each hero step settles, then lifts;
 * entrances (hero title, nav) wait on `booted` so they play as the page is revealed.
 */
const STEPS = ["fonts", "ocean", "harbor"] as const;
export type BootStep = (typeof STEPS)[number];

const done = new Set<BootStep>();
const listeners = new Set<() => void>();

export function settle(step: BootStep) {
  if (done.has(step)) return;
  done.add(step);
  listeners.forEach((f) => f());
}

export const bootProgress = () => done.size / STEPS.length;

export function onBootProgress(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}

let lift: () => void = () => {};
export let lifted = false;
export const booted = new Promise<void>((resolve) => (lift = resolve));
export function markBooted() {
  lifted = true;
  lift();
}
