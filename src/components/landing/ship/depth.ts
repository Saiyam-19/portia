// Painter's order for axis-aligned boxes, re-solved whenever something moves.
//
// Every drawn part is a world AABB, and parts never interpenetrate. For two disjoint boxes there is
// always an axis on which one lies wholly on the low side of the other; because the camera looks
// along (+x, +y, +z), the low box is farther away and is painted first. If two boxes are separated on
// more than one axis in conflicting directions, their projections cannot overlap, so only pairs whose
// silhouettes really overlap get an edge. A projected box is a hexagon whose edges run only along the
// three projected axes, so the exact overlap test is three interval checks (separating axes).
// The camera may look along -y instead (from behind the quay): then the high box on y is the far
// one. An axis the camera looks straight across (no component along it) never decides an order. Testing
// silhouettes rather than screen rectangles matters: rectangle overlaps invent edges between parts
// that never touch on screen, and those form cycles no order can satisfy. A topological sort of the
// edges (ties broken by a fixed priority, so unrelated parts never reshuffle) gives the order, and
// only nodes outside the longest already-ordered run are moved in the DOM.

const EPS = 0.02;

export class DepthSorter {
  readonly n: number;
  /** World boxes, 6 per item: x0 x1 y0 y1 z0 z1. */
  readonly boxes: Float64Array;
  /** Silhouette extents on the three separating axes, 6 per item. */
  readonly bands: Float64Array;
  /** Per-axis (x, y, z) coefficients of the three separating axes. */
  private readonly coef: number[][];
  private readonly prio: Int32Array;
  private readonly view: [number, number, number];
  /** Per axis: +1 when the camera looks along it, -1 against it, 0 straight across it. */
  private readonly sign: number[];
  private readonly indeg: Int32Array;
  private readonly adj: number[][];
  private readonly heap: number[] = [];
  order: Int32Array;
  /** Cycles broken in the last solve (0 when the scene is modelled cleanly). */
  cycles = 0;

  constructor(n: number, prio: Int32Array, view: [number, number, number], azimuth: number, elevation: number) {
    this.n = n;
    this.boxes = new Float64Array(n * 6);
    this.bands = new Float64Array(n * 6);
    const a = (azimuth * Math.PI) / 180;
    const e = (elevation * Math.PI) / 180;
    // Screen directions of the world axes, and the normal to each (a hexagon edge direction).
    const dirs = [
      [Math.sin(a), Math.cos(a) * Math.sin(e)],
      [-Math.cos(a), Math.sin(a) * Math.sin(e)],
      [0, -Math.cos(e)],
    ];
    this.coef = dirs.map(([nx, ny]) => dirs.map(([dx, dy]) => -ny! * dx! + nx! * dy!));
    this.prio = prio;
    this.view = view;
    this.sign = view.map((v) => (Math.abs(v) < 1e-9 ? 0 : Math.sign(v)));
    this.indeg = new Int32Array(n);
    this.adj = Array.from({ length: n }, () => []);
    this.order = new Int32Array(n);
  }

  /** Refreshes item i's silhouette bands from its box. */
  measure(i: number) {
    const b = this.boxes;
    const k = i * 6;
    for (let axis = 0; axis < 3; axis++) {
      const c = this.coef[axis]!;
      let lo = 0;
      let hi = 0;
      for (let d = 0; d < 3; d++) {
        const v0 = b[k + d * 2]! * c[d]!;
        const v1 = b[k + d * 2 + 1]! * c[d]!;
        lo += Math.min(v0, v1);
        hi += Math.max(v0, v1);
      }
      this.bands[k + axis * 2] = lo;
      this.bands[k + axis * 2 + 1] = hi;
    }
  }

  /** Negative when item a must be painted before item b. */
  private compare(a: number, b: number) {
    const A = this.boxes;
    const pa = a * 6;
    const pb = b * 6;
    for (let d = 0; d < 3; d++) {
      const s = this.sign[d]!;
      if (!s) continue;
      const axis = d * 2;
      if (A[pa + axis + 1]! <= A[pb + axis]! + EPS) return -s;
      if (A[pb + axis + 1]! <= A[pa + axis]! + EPS) return s;
    }
    // Interpenetrating boxes (a modelling slip): fall back to centre depth.
    const [vx, vy, vz] = this.view;
    const da = (A[pa]! + A[pa + 1]!) * vx + (A[pa + 2]! + A[pa + 3]!) * vy + (A[pa + 4]! + A[pa + 5]!) * vz;
    const db = (A[pb]! + A[pb + 1]!) * vx + (A[pb + 2]! + A[pb + 3]!) * vy + (A[pb + 4]! + A[pb + 5]!) * vz;
    return da - db;
  }

  private push(i: number) {
    const h = this.heap;
    const p = this.prio;
    h.push(i);
    let k = h.length - 1;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (p[h[up]!]! <= p[i]!) break;
      h[k] = h[up]!;
      k = up;
    }
    h[k] = i;
  }

  private pop() {
    const h = this.heap;
    const p = this.prio;
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length) {
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        if (l >= h.length) break;
        const r = l + 1;
        const c = r < h.length && p[h[r]!]! < p[h[l]!]! ? r : l;
        if (p[h[c]!]! >= p[last]!) break;
        h[k] = h[c]!;
        k = c;
      }
      h[k] = last;
    }
    return top;
  }

  /** Solves the order into `this.order`; returns true when it changed. */
  solve() {
    const { n, bands: S, adj, indeg } = this;
    const G = 0.01;
    indeg.fill(0);
    for (let i = 0; i < n; i++) adj[i]!.length = 0;
    for (let i = 0; i < n; i++) {
      const si = i * 6;
      for (let j = i + 1; j < n; j++) {
        const sj = j * 6;
        if (S[si]! >= S[sj + 1]! - G || S[sj]! >= S[si + 1]! - G) continue;
        if (S[si + 2]! >= S[sj + 3]! - G || S[sj + 2]! >= S[si + 3]! - G) continue;
        if (S[si + 4]! >= S[sj + 5]! - G || S[sj + 4]! >= S[si + 5]! - G) continue;
        if (this.compare(i, j) < 0) {
          adj[i]!.push(j);
          indeg[j]!++;
        } else {
          adj[j]!.push(i);
          indeg[i]!++;
        }
      }
    }
    this.heap.length = 0;
    this.cycles = 0;
    for (let i = 0; i < n; i++) if (!indeg[i]) this.push(i);
    const next = new Int32Array(n);
    const placed = new Uint8Array(n);
    let count = 0;
    while (count < n) {
      if (!this.heap.length) {
        // A cycle (a modelling slip): release the part with the fewest unmet constraints.
        let best = -1;
        for (let i = 0; i < n; i++) if (!placed[i] && (best < 0 || indeg[i]! < indeg[best]! || (indeg[i] === indeg[best] && this.prio[i]! < this.prio[best]!))) best = i;
        this.cycles++;
        indeg[best] = 0;
        this.push(best);
      }
      const i = this.pop();
      if (placed[i]) continue;
      placed[i] = 1;
      next[count++] = i;
      for (const j of adj[i]!) if (--indeg[j]! === 0 && !placed[j]) this.push(j);
    }
    let changed = false;
    for (let k = 0; k < n; k++)
      if (next[k] !== this.order[k]) {
        changed = true;
        break;
      }
    this.order = next;
    return changed;
  }
}

/** Reorders `parent`'s children to `order`, moving only nodes outside the longest kept run. */
export function applyOrder(parent: Element, els: Element[], order: Int32Array) {
  const current = Array.from(parent.children);
  const pos = new Map<Element, number>();
  current.forEach((el, i) => pos.set(el, i));
  const seq = Array.from(order, (i) => pos.get(els[i]!) ?? -1);
  // Longest increasing subsequence of current positions: those nodes stay put.
  const tails: number[] = [];
  const prev = new Int32Array(seq.length).fill(-1);
  const tailIdx: number[] = [];
  for (let k = 0; k < seq.length; k++) {
    const v = seq[k]!;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid]! < v) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = v;
    tailIdx[lo] = k;
    prev[k] = lo > 0 ? tailIdx[lo - 1]! : -1;
  }
  const keep = new Uint8Array(seq.length);
  for (let k = tailIdx[tails.length - 1] ?? -1; k >= 0; k = prev[k]!) keep[k] = 1;
  let after: Element | null = null;
  for (let k = order.length - 1; k >= 0; k--) {
    const el = els[order[k]!]!;
    if (!keep[k]) parent.insertBefore(el, after);
    after = el;
  }
}
