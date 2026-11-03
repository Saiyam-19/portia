// The harbour as a simulation, with no DOM: ships sailing in and berthing, a queue of unloading
// jobs (one at a time, both cranes), the swell, and where every moving part is. The engine draws
// it; the depth proof drives it through the same states the reader can reach.

import { BERTHS, BOX, CONTAINERS, CRANE, CRANE_HOME, SHIPS, SHIP_BOXES } from "./scene";
import { type Approach, JOBS, type Job, approachAt, droppedAt, processRate, smoothstep } from "./timeline";

export type Phase = "waiting" | "approach" | "berthed" | "unloading" | "unloaded";

/** How far a hull rises once every box is ashore (metres). */
const RISE = 1.5;

export interface ShipPose {
  /** Offset from its berth, world x and y. */
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  heave: number;
}

export interface Pose {
  ships: ShipPose[];
  cranes: { x: number; y: number; z: number }[];
  /** Container corner positions (world), 3 per container. */
  boxes: Float64Array;
}

export class Harbor {
  readonly pose: Pose;
  readonly phases: Phase[] = Array.from({ length: SHIPS }, () => "waiting" as Phase);
  started = false;
  reduced = false;
  /** Called when a ship's phase changes. */
  onPhase?: (ship: number, phase: Phase) => void;

  private clock = 0;
  private sailing = 0;
  private heaveUnload = new Float64Array(SHIPS);
  private queue: number[] = [];
  private job: { plan: Job; tau: number; real: number } | null = null;

  /**
   * `timeLapse` speeds the middle of each unloading job up (the hero, where a reader is waiting on
   * a click); without it every crane cycle runs at its nominal pace.
   */
  constructor(
    readonly approaches: Approach[],
    readonly timeLapse = true,
  ) {
    this.pose = {
      ships: BERTHS.map(() => ({ dx: 0, dy: 0, vx: 0, vy: 0, heave: 0 })),
      cranes: CRANE_HOME.map((x) => ({ x, y: CRANE.parkY, z: CRANE.parkZ })),
      boxes: new Float64Array(CONTAINERS.length * 3),
    };
    this.advance(0);
  }

  /** The ship currently being unloaded, if any. */
  get working() {
    return this.job?.plan.ship ?? -1;
  }

  /** Something is still moving (beyond the idle swell). */
  get busy() {
    return this.phases.some((p) => p === "approach" || p === "unloading") || this.queue.length > 0;
  }

  start() {
    this.started = true;
  }

  /** Asks for ship k to be unloaded: one-way, queued behind any job running or until it berths. */
  request(k: number) {
    if (this.phases[k] === "unloaded" || this.working === k || this.queue.includes(k)) return false;
    this.queue.push(k);
    return true;
  }

  private setPhase(k: number, phase: Phase) {
    if (this.phases[k] === phase) return;
    this.phases[k] = phase;
    this.onPhase?.(k, phase);
  }

  advance(dt: number) {
    this.clock += dt;
    if (this.started) this.sailing += dt;
    const { pose } = this;
    // Ships: sail in, berth.
    for (let k = 0; k < SHIPS; k++) {
      const a = this.approaches[k]!;
      const t = this.reduced && this.started ? a.berthedAt : this.sailing - a.delay;
      if (this.started && this.phases[k] === "waiting") this.setPhase(k, "approach");
      if (this.phases[k] === "approach" && t >= a.berthedAt) this.setPhase(k, "berthed");
      const m = approachAt(a, t);
      Object.assign(pose.ships[k]!, m);
    }
    // Jobs: one at a time, in the order asked, each once its ship is alongside.
    if (!this.job) {
      const next = this.queue.findIndex((k) => this.phases[k] === "berthed");
      if (next >= 0) {
        const [k] = this.queue.splice(next, 1);
        this.job = { plan: JOBS[k!]!, tau: 0, real: 0 };
        this.setPhase(k!, "unloading");
      }
    }
    const job = this.job;
    if (job) {
      job.real += dt;
      const rate = this.timeLapse ? processRate(job.plan, job.real, job.tau) : 1;
      job.tau = this.reduced ? job.plan.end : Math.min(job.plan.end, job.tau + rate * dt);
    }
    // Each hull rises as its boxes go ashore, under a slow swell of a few centimetres.
    for (let k = 0; k < SHIPS; k++) {
      const done = this.phases[k] === "unloaded" || (job?.plan.ship === k && job.tau >= job.plan.end);
      const ashore = done ? SHIP_BOXES : job?.plan.ship === k ? droppedAt(job.plan, job.tau) : 0;
      const target = (RISE * ashore) / SHIP_BOXES;
      const h = this.heaveUnload;
      h[k] = this.reduced ? target : h[k]! + (target - h[k]!) * (1 - Math.exp(-dt / 0.9));
      const sinceBerth = this.sailing - this.approaches[k]!.delay - (this.approaches[k]!.berthedAt - 4);
      const swell = this.reduced ? 0 : smoothstep(0, 4, sinceBerth) * (0.11 * Math.sin(((this.clock + k * 2.3) / 6.4) * Math.PI * 2) + 0.045 * Math.sin(((this.clock + k * 1.1) / 2.7) * Math.PI * 2 + 1));
      // Quantised to 2 cm (under 0.1 px): the idle swell then repaints every ~10th frame.
      pose.ships[k]!.heave = Math.round((h[k]! + swell) / 0.02) * 0.02;
    }
    // Cranes: at home, or wherever the job has them.
    pose.cranes.forEach((crane, c) => {
      if (!job) {
        crane.x = CRANE_HOME[c]!;
        crane.y = CRANE.parkY;
        crane.z = CRANE.parkZ;
        return;
      }
      const heave = pose.ships[job.plan.ship]!.heave;
      crane.x = job.plan.cranes[c]!.x.at(job.tau, heave);
      crane.y = job.plan.cranes[c]!.y.at(job.tau, heave);
      crane.z = job.plan.cranes[c]!.z.at(job.tau, heave);
    });
    // Boxes: aboard, on a spreader, or ashore behind their berth.
    const B = pose.boxes;
    CONTAINERS.forEach((box, i) => {
      const k = box.ship;
      const ship = pose.ships[k]!;
      const berth = BERTHS[k]!;
      let x = berth + ship.dx + box.home.x;
      let y = box.home.y + ship.dy;
      let z = box.home.z + ship.heave;
      const ashore = this.phases[k] === "unloaded";
      const plan = job?.plan.ship === k ? job.plan.boxes.get(i) : undefined;
      if (ashore || (plan && job!.tau >= plan.drop)) {
        x = berth + box.yard.x;
        y = box.yard.y;
        z = box.yard.z;
      } else if (plan && job!.tau >= plan.pick) {
        const crane = pose.cranes[plan.crane]!;
        x = crane.x - BOX.l / 2;
        y = crane.y - BOX.w / 2;
        z = crane.z - BOX.h;
      }
      B[i * 3] = x;
      B[i * 3 + 1] = y;
      B[i * 3 + 2] = z;
    });
    if (job && job.tau >= job.plan.end) {
      this.setPhase(job.plan.ship, "unloaded");
      this.job = null;
    }
  }
}
