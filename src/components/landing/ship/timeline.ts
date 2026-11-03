// Motion as pure functions of time: each ship's approach, and the unloading job for each berth.
// A job is the same choreography whichever ship it serves: crane 1 takes the bow-side bays, crane 0
// the stern-side bays, each lifting top tier first and stacking on the quay behind the berth.
// It runs on "process time" (nominal crane seconds); in the hero the sim advances it faster as the
// job gets going, like a time-lapse, and slows it again for the last box. Cranes start and end at home.

import { BAY_QUEUE, BAYS, BERTHS, BOX, CONTAINERS, CRANE, CRANE_HOME, SHIPS, type Scene, bayCentre } from "./scene";

export const smoother = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- approach

/** Out in the fairway, clear of ships already alongside, until the tugs push each one in. */
const FROM_Y = 21;
const ZETA = 0.74;
const OMEGA = 1.45;

export interface Approach {
  /** Seconds after the harbour starts that this ship sets off. */
  delay: number;
  /** Seconds of the long ease-out along the quay. */
  duration: number;
  fromX: number;
  fromY: number;
  lateralAt: number;
  /** The ship counts as berthed (clicks act) this many seconds after it sets off. */
  berthedAt: number;
}

/**
 * They come in as a convoy: the far berth's ship leads, each next one a ship length and a bit
 * further out, all off screen, travelling the same distance a beat apart, so the spacing only ever
 * grows and none has to pass a ship already alongside.
 */
const CONVOY_GAP = 150;
/** The convoy for one camera: each ship starts off that camera's box. */
export function approachesFor(scene: Scene): Approach[] {
  const lead = BERTHS[0]! + scene.approachStartX(BERTHS[0]!, FROM_Y);
  return BERTHS.map((berth, k) => {
    const fromX = lead - k * CONVOY_GAP - berth;
    const duration = 5.5 + Math.abs(fromX) / 140;
    return { delay: k * 0.9, duration, fromX, fromY: FROM_Y, lateralAt: duration - 3.6, berthedAt: duration + 0.6 };
  });
}

export interface ShipMotion {
  dx: number;
  dy: number;
  /** Velocity in world m/s, for the wake. */
  vx: number;
  vy: number;
}

/** A ship at `t` seconds after it sets off (negative: still waiting off screen). */
export function approachAt(a: Approach, t: number): ShipMotion {
  const { duration, fromX, fromY, lateralAt } = a;
  const u = Math.min(1, Math.max(0, t / duration));
  const left = 1 - u;
  const dx = fromX * left * left * left;
  const vx = t > 0 && t < duration ? (-3 * fromX * left * left) / duration : 0;
  let dy = fromY;
  let vy = 0;
  if (t > lateralAt) {
    const s = t - lateralAt;
    const wd = OMEGA * Math.sqrt(1 - ZETA * ZETA);
    const decay = Math.exp(-ZETA * OMEGA * s);
    dy = fromY * decay * (Math.cos(wd * s) + ((ZETA * OMEGA) / wd) * Math.sin(wd * s));
    vy = -fromY * decay * ((OMEGA * OMEGA) / wd) * Math.sin(wd * s);
  }
  return { dx, dy, vx, vy };
}

// ---------------------------------------------------------------- unloading jobs

/** Nominal phase lengths (process seconds) of one crane cycle. */
const D = { travel: 0.85, lower: 0.55, hoist: 0.5, dwell: 0.14, park: 0.9 };
/** Gantry travel along the rails: a fixed start-up plus about 40 m per nominal second. */
const gantryTime = (distance: number) => 1.1 + Math.abs(distance) / 40;

interface Segment {
  t0: number;
  t1: number;
  a: number;
  b: number;
  /** Value is relative to the ship's heave at that end (a landing on a box aboard). */
  aShip?: boolean;
  bShip?: boolean;
}

export class Track {
  readonly segs: Segment[] = [];
  constructor(readonly start: number) {}
  add(seg: Segment) {
    this.segs.push(seg);
  }
  at(t: number, heave: number) {
    let v = this.start;
    for (const s of this.segs) {
      if (t < s.t0) break;
      const a = s.a + (s.aShip ? heave : 0);
      const b = s.b + (s.bShip ? heave : 0);
      v = t >= s.t1 ? b : a + (b - a) * smoother((t - s.t0) / (s.t1 - s.t0));
    }
    return v;
  }
}

export interface CranePlan {
  x: Track;
  y: Track;
  z: Track;
}

export interface BoxPlan {
  crane: number;
  pick: number;
  drop: number;
}

export interface Job {
  ship: number;
  cranes: CranePlan[];
  boxes: Map<number, BoxPlan>;
  /** Process time when both cranes are home again. */
  end: number;
  lastDrop: number;
  drops: number[];
}

function planJob(ship: number): Job {
  const berth = BERTHS[ship]!;
  const bays = [
    [0, 1, 2],
    [3, 4, 5],
  ];
  const cranes: CranePlan[] = [];
  const boxes = new Map<number, BoxPlan>();
  const ends: { t: number; cx: number }[] = [];
  for (let c = 0; c < CRANE_HOME.length; c++) {
    const x = new Track(CRANE_HOME[c]!);
    const y = new Track(CRANE.parkY);
    const z = new Track(CRANE.parkZ);
    // Crane 0 works the stern-side bays, so it sets off a beat behind crane 1.
    let t = c === 0 ? 0.6 : 0;
    let cx = CRANE_HOME[c]!;
    let ty = CRANE.parkY;
    let zs = CRANE.parkZ;
    let zShip = false;
    for (const b of bays[c]!) {
      if (b >= BAYS) continue;
      const to = berth + bayCentre(b);
      if (Math.abs(cx - to) > 1e-6) {
        const g = gantryTime(to - cx);
        x.add({ t0: t, t1: t + g, a: cx, b: to });
        cx = to;
        t += g - 0.3;
      }
      for (const index of BAY_QUEUE[ship]![b]!) {
        const box = CONTAINERS[index]!;
        const pickY = box.home.y + BOX.w / 2;
        const pickTop = box.home.z + BOX.h;
        const dropY = box.yard.y + BOX.w / 2;
        const dropTop = box.yard.z + BOX.h;
        // Out over the ship, easing down onto the box as the trolley arrives.
        y.add({ t0: t, t1: t + D.travel, a: ty, b: pickY });
        const lower0 = t + D.travel * 0.72;
        z.add({ t0: lower0, t1: lower0 + D.lower, a: zs, b: pickTop, aShip: zShip, bShip: true });
        const pick = lower0 + D.lower + D.dwell / 2;
        // Hoist, rounding into the traverse once clear of the stack.
        const hoist0 = lower0 + D.lower + D.dwell;
        z.add({ t0: hoist0, t1: hoist0 + D.hoist, a: pickTop, b: CRANE.safeZ, aShip: true });
        const travel0 = hoist0 + D.hoist * 0.7;
        y.add({ t0: travel0, t1: travel0 + D.travel, a: pickY, b: dropY });
        const drop0 = travel0 + D.travel * 0.75;
        z.add({ t0: drop0, t1: drop0 + D.lower, a: CRANE.safeZ, b: dropTop });
        const drop = drop0 + D.lower + D.dwell / 2;
        const up0 = drop0 + D.lower + D.dwell;
        z.add({ t0: up0, t1: up0 + D.hoist, a: dropTop, b: CRANE.safeZ });
        boxes.set(index, { crane: c, pick, drop });
        t = up0 + D.hoist * 0.6;
        ty = dropY;
        zs = CRANE.safeZ;
        zShip = false;
      }
    }
    // Park: trolley back over the apron, spreader up.
    y.add({ t0: t, t1: t + D.park * 1.4, a: ty, b: CRANE.parkY });
    z.add({ t0: t + 0.2, t1: t + 0.2 + D.park * 1.4, a: zs, b: CRANE.parkZ });
    ends.push({ t: t + 0.2 + D.park * 1.4, cx });
    cranes.push({ x, y, z });
  }
  // Both cranes travel home together once the last box is down: crane 0 (right) leads.
  let end = 0;
  const back = Math.max(...ends.map((e) => e.t));
  cranes.forEach((plan, c) => {
    const { cx } = ends[c]!;
    const t0 = back + (c === 0 ? 0 : 0.5);
    const g = gantryTime(CRANE_HOME[c]! - cx);
    plan.x.add({ t0, t1: t0 + g, a: cx, b: CRANE_HOME[c]! });
    end = Math.max(end, t0 + g);
  });
  const drops = [...boxes.values()].map((p) => p.drop).sort((a, b) => a - b);
  return { ship, cranes, boxes, end, lastDrop: drops[drops.length - 1] ?? 0, drops };
}

/** One precomputed job per berth (cranes always start and finish at home). */
export const JOBS: Job[] = Array.from({ length: SHIPS }, (_, k) => planJob(k));

/** Time-lapse rate: builds up over the first boxes, eases off for the last one. */
export function processRate(job: Job, realSinceStart: number, process: number) {
  const MAX = 8;
  const up = smoothstep(1.2, 8, realSinceStart);
  // Ease off for the last box, then pick up a little for the cranes' run home.
  if (process > job.lastDrop) return 1 + 2 * smoothstep(job.lastDrop, job.lastDrop + 1.5, process);
  const down = smoothstep(0, 8, job.lastDrop - process);
  return 1 + (MAX - 1) * up * down;
}

/** Boxes ashore at process time t of a job. */
export function droppedAt(job: Job, t: number) {
  let lo = 0;
  let hi = job.drops.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (job.drops[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
