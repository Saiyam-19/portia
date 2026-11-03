// The wake, drawn the way the hero's ocean is: dots on a lattice of the water plane (z = 0), spaced
// ~15 css px along the projected world x and y axes from world (0, 0). Particles shed by the hull
// are world-fixed, so a moving ship leaves a widening V from the bow and a wash astern; each frame
// they excite the nearest lattice node, and every node eases toward its excitation, so dots swell
// and fade in place instead of popping. Emission scales with speed, so the trail thins as she slows.

import { type Projection, iso, num } from "./iso";

const MAX = 480;
/** Dot looks by strength: radius in css px and opacity, matching the ocean's dots. */
export const WAKE_LEVELS: [number, number][] = [
  [1.4, 0.2],
  [1.6, 0.32],
  [1.8, 0.44],
  [2.0, 0.56],
  [2.2, 0.7],
];

interface Node {
  i: number;
  j: number;
  v: number;
  target: number;
}

export class Wake {
  private x = new Float32Array(MAX);
  private y = new Float32Array(MAX);
  private vx = new Float32Array(MAX);
  private vy = new Float32Array(MAX);
  private age = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private amp = new Float32Array(MAX);
  private count = 0;
  private seed = 7;
  private cursor = 0;
  private nodes = new Map<number, Node>();
  private step: [number, number] = [0, 0];

  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  emit(x: number, y: number, vx: number, vy: number, life: number, amp: number) {
    let i = this.count;
    if (i >= MAX) i = this.cursor = (this.cursor + 1) % MAX; // full: overwrite round-robin
    else this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.age[i] = 0;
    this.life[i] = life;
    this.amp[i] = amp;
  }

  /** Lattice spacing in world metres along x and y (it follows the figure's size on screen). */
  setStep(sx: number, sy: number) {
    if (Math.abs(sx - this.step[0]) < 1e-3 && Math.abs(sy - this.step[1]) < 1e-3) return;
    this.step = [sx, sy];
    this.nodes.clear();
  }

  advance(dt: number) {
    const drag = Math.exp(-dt * 0.55);
    for (let i = 0; i < this.count; i++) {
      this.age[i]! += dt;
      if (this.age[i]! >= this.life[i]!) {
        const last = --this.count;
        this.x[i] = this.x[last]!;
        this.y[i] = this.y[last]!;
        this.vx[i] = this.vx[last]!;
        this.vy[i] = this.vy[last]!;
        this.age[i] = this.age[last]!;
        this.life[i] = this.life[last]!;
        this.amp[i] = this.amp[last]!;
        i--;
        continue;
      }
      this.x[i]! += this.vx[i]! * dt;
      this.y[i]! += this.vy[i]! * dt;
      this.vx[i]! *= drag;
      this.vy[i]! *= drag;
    }
    // Excite the lattice, then let every node ease toward its excitation.
    const [sx, sy] = this.step;
    if (!sx || !sy) return;
    for (const node of this.nodes.values()) node.target = 0;
    for (let k = 0; k < this.count; k++) {
      const a = this.age[k]! / this.life[k]!;
      const strength = this.amp[k]! * smoothIn(a / 0.12) * Math.pow(1 - a, 1.4);
      if (strength < 0.05) continue;
      const i = Math.round(this.x[k]! / sx);
      const j = Math.round(this.y[k]! / sy);
      const key = (i + 32768) * 65536 + (j + 32768);
      let node = this.nodes.get(key);
      if (!node) this.nodes.set(key, (node = { i, j, v: 0, target: 0 }));
      node.target = Math.min(1, Math.max(node.target, strength) + 0.15 * strength);
    }
    const ease = 1 - Math.exp(-dt / 0.18);
    for (const [key, node] of this.nodes) {
      node.v += (node.target - node.v) * ease;
      if (node.target === 0 && node.v < 0.04) this.nodes.delete(key);
    }
  }

  get alive() {
    return this.count > 0 || this.nodes.size > 0;
  }

  /** Path data per strength level. */
  paths(P: Projection): string[] {
    const out: string[][] = WAKE_LEVELS.map(() => []);
    const [sx, sy] = this.step;
    for (const node of this.nodes.values()) {
      if (node.v < 0.1) continue;
      const level = Math.min(WAKE_LEVELS.length - 1, Math.floor(((node.v - 0.1) / 0.55) * WAKE_LEVELS.length));
      const y = node.j * sy;
      const [px, py] = iso([node.i * sx, y, 0], P);
      out[level]!.push(`M${num(px)} ${num(py)}h0`);
    }
    return out.map((l) => l.join(""));
  }
}

const smoothIn = (t: number) => (t >= 1 ? 1 : t <= 0 ? 0 : t * t * (3 - 2 * t));
