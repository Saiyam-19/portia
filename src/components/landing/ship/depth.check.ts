// Offline proof of the painter's order and of the layout. Drives the simulation the way a reader
// can: all ships sail in and berth, then every ship is clicked and the queued jobs run back to
// back. In each sampled frame it solves the order and fails on any cycle, any pair of parts that
// interpenetrate, any overlapping pair painted the wrong way round, any standing-yard part (drawn
// before everything sorted) that would have to cover a sorted part, or any part that reaches into
// the copy while berthed or unloaded (and, during the approach, any crane or quay part).
//   bun src/components/ship/depth.check.ts   (from the repo root)

import { DepthSorter } from "./depth";
import { internals } from "./engine";
import { viewOf } from "./iso";
import { ITEMS, P, SHIPS, STATIC_BOXES, clearOfCopy } from "./scene";

const N = ITEMS.length;
const harbor = internals.newHarbor();
const v = viewOf(P);

const statics = new DepthSorter(STATIC_BOXES.length, new Int32Array(STATIC_BOXES.length), [v[0], v[1], v[2]], P.azimuth, P.elevation);
STATIC_BOXES.forEach((b, i) => {
  statics.boxes.set(b, i * 6);
  statics.measure(i);
});

/** Negative when box a lies on the far side of box b on some axis (a is painted first). */
function before(A: Float64Array, a: number, B: Float64Array, b: number) {
  for (let k = 0; k < 6; k += 2) {
    if (A[a * 6 + k + 1]! <= B[b * 6 + k]! + 0.02) return -1;
    if (B[b * 6 + k + 1]! <= A[a * 6 + k]! + 0.02) return 1;
  }
  return 0;
}
const overlap = (S: Float64Array, i: number, T: Float64Array, j: number) => {
  for (let k = 0; k < 6; k += 2) if (S[i * 6 + k]! >= T[j * 6 + k + 1]! - 0.01 || T[j * 6 + k]! >= S[i * 6 + k + 1]! - 0.01) return false;
  return true;
};

const describe = (i: number, b: Float64Array) => `#${i} ${ITEMS[i]!.owner.kind} [${Array.from(b.subarray(i * 6, i * 6 + 6), (x) => x.toFixed(1)).join(", ")}]`;
let frames = 0;
let cycles = 0;
let wrong = 0;
let clashes = 0;
let covers = 0;
let intrusions = 0;
const seen = new Set<string>();
const once = (key: string, text: () => string) => {
  if (seen.has(key) || seen.size > 40) return;
  seen.add(key);
  console.log(text());
};

function check(name: string, atRest: boolean, low: boolean, withStatics: boolean) {
  frames++;
  const sorter = internals.makeSorter();
  internals.placeItems(harbor.pose, new Float64Array(N * 3), sorter.boxes);
  internals.measureAll(sorter);
  sorter.solve();
  cycles += sorter.cycles;
  const B = sorter.boxes;
  const S = sorter.bands;
  if (atRest)
    for (let i = 0; i < N; i++) {
      // Ships in transit may pass under the copy's lower edge; only what stands still is held to it.
      const kind = ITEMS[i]!.owner.kind;
      if (!low && (kind === "ship" || kind === "hull" || kind === "box")) continue;
      if (clearOfCopy(Array.from(B.subarray(i * 6, i * 6 + 6)), low)) continue;
      intrusions++;
      once(`copy${i}`, () => `in the copy ${name} ${describe(i, B)}`);
    }
  const rank = new Int32Array(N);
  sorter.order.forEach((item, k) => (rank[item] = k));
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      if (!overlap(S, i, S, j)) continue;
      const rel = before(B, i, B, j);
      if (!rel) {
        clashes++;
        once(`x${i}-${j}`, () => `interpenetrate ${name} ${describe(i, B)} ${describe(j, B)}`);
      } else if (rel < 0 !== rank[i]! < rank[j]!) {
        wrong++;
        once(`w${i}-${j}`, () => `wrong order ${name} ${describe(i, B)} ${describe(j, B)}`);
      }
    }
  if (withStatics)
    for (let j = 0; j < STATIC_BOXES.length; j++)
      for (let i = 0; i < N; i++) {
        if (!overlap(statics.bands, j, S, i)) continue;
        if (before(statics.boxes, j, B, i) < 0) continue;
        covers++;
        once(`s${j}-${i}`, () => `standing yard over a sorted part ${name} static #${j} [${Array.from(statics.boxes.subarray(j * 6, j * 6 + 6), (x) => x.toFixed(1)).join(", ")}] ${describe(i, B)}`);
      }
}

check("before sailing", true, true, true);
harbor.start();
for (let t = 0, f = 0; harbor.phases.some((p) => p !== "berthed"); t += 0.05, f++) {
  harbor.advance(0.05);
  check(`approach ${t.toFixed(2)}s`, true, false, f % 4 === 0);
}
for (let s = 0; s < 3; s++) harbor.advance(1);
check("all berthed", true, true, true);
for (let k = 0; k < SHIPS; k++) harbor.request(k);
for (let t = 0, f = 0; harbor.phases.some((p) => p !== "unloaded"); t += 0.025, f++) {
  harbor.advance(0.025);
  check(`unload ${t.toFixed(2)}s (ship ${harbor.working})`, false, false, f % 8 === 0);
}
harbor.advance(1);
check("all unloaded", true, true, true);

console.log(`${frames} frames · cycles ${cycles} · interpenetrations ${clashes} · wrong pairs ${wrong} · yard covers ${covers} · copy intrusions ${intrusions}`);
if (cycles || clashes || wrong || covers || intrusions) process.exit(1);
