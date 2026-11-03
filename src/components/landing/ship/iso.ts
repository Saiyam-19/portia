// Isometric core, trimmed from the Anatomy kit (kit/iso-kit.ts): camera, extruded solids
// shaded in four tones by facing, oriented beams, and path helpers. Pure, no DOM.

export type Flat = [number, number];
export type Point3 = [number, number, number];
export type Plane = [number, number];

export interface Projection {
  origin: Flat;
  scale: number;
  azimuth: number;
  elevation: number;
  /**
   * Mirror the picture left-right as a re-projection, not a flip of the finished drawing: faces,
   * depth and detail stay those of the world, only screen x runs the other way. Shading follows
   * `light`, so the tones are re-assigned for the mirrored composition.
   */
  mirror?: boolean;
  /** Horizontal light direction in world xy (unit); defaults to the kit's front-left light. */
  light?: Plane;
}

export interface SolidPaths {
  fill: string;
  outline: string;
  crease: string;
  top: string;
  shades: string[];
}

export const SHADES = 4;
const RAD = Math.PI / 180;

export function cameraOf({ scale, azimuth, elevation }: Projection) {
  const a = azimuth * RAD;
  const e = elevation * RAD;
  return { sinA: Math.sin(a), cosA: Math.cos(a), sinE: Math.sin(e), cosE: Math.cos(e), k: scale };
}

export function iso([x, y, z]: Point3, P: Projection): Flat {
  const { sinA, cosA, sinE, cosE, k } = cameraOf(P);
  const m = P.mirror ? -1 : 1;
  return [P.origin[0] + m * (x * sinA - y * cosA) * k, P.origin[1] + ((x * cosA + y * sinA) * sinE - z * cosE) * k];
}

/** Screen offset of a world vector (no origin). */
export function axisVector(P: Projection, [dx, dy, dz]: Point3): Flat {
  const { sinA, cosA, sinE, cosE, k } = cameraOf(P);
  const m = P.mirror ? -1 : 1;
  return [m * (dx * sinA - dy * cosA) * k, ((dx * cosA + dy * sinA) * sinE - dz * cosE) * k];
}

/** Unit vector pointing from the scene toward the viewer. */
export function viewOf(P: Projection): Point3 {
  const { sinA, cosA, sinE, cosE } = cameraOf(P);
  return [cosA * cosE, sinA * cosE, sinE];
}

const tenth = (v: number) => {
  const t = (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "");
  return t === "-0" ? "0" : t;
};

export function pathOf(points: Flat[], closed = false) {
  if (!points.length) return "";
  return points.map(([x, y], i) => `${i ? "L" : "M"}${tenth(x)} ${tenth(y)}`).join("") + (closed ? "Z" : "");
}

export const seg = (a: Point3, b: Point3, P: Projection) => pathOf([iso(a, P), iso(b, P)]);
export const poly = (pts: Point3[], P: Projection, closed = false) => pathOf(pts.map((p) => iso(p, P)), closed);

export interface Plan {
  x: number;
  y: number;
  w: number;
  d: number;
  r: number;
}

export function roundedPlan({ x, y, w, d, r }: Plan, steps = 6): Plane[] {
  const radius = Math.max(0, Math.min(r, w / 2, d / 2));
  const corners: [number, number, number][] = [
    [x + w - radius, y + radius, -90],
    [x + w - radius, y + d - radius, 0],
    [x + radius, y + d - radius, 90],
    [x + radius, y + radius, 180],
  ];
  const out: Plane[] = [];
  for (const [cx, cy, start] of corners) {
    const n = radius > 0 ? steps : 0;
    for (let s = 0; s <= n; s++) {
      const a = (start + (n ? (90 * s) / n : 45)) * RAD;
      out.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
    }
  }
  return out;
}

export function circleRing(cx: number, cy: number, r: number, steps = 20): Plane[] {
  return Array.from({ length: steps }, (_, s) => {
    const a = (s / steps) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Plane;
  });
}

function signedArea(points: Plane[] | Flat[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[(i + 1) % points.length]!;
    area += ax * by - bx * ay;
  }
  return area / 2;
}

const oriented = (pts: Flat[]) => (signedArea(pts) < 0 ? [...pts].reverse() : pts);

export function convexHull(points: Flat[]): Flat[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Flat, a: Flat, b: Flat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Flat[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Flat[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function runsOf(flags: boolean[], want: boolean) {
  const n = flags.length;
  const runs: number[][] = [];
  const start = flags.findIndex((f, i) => f !== flags[(i + n - 1) % n]);
  if (start < 0) return flags[0] === want ? [Array.from({ length: n + 1 }, (_, i) => i % n)] : [];
  let run: number[] | null = null;
  for (let s = 0; s < n; s++) {
    const i = (start + s) % n;
    if (flags[i] === want) {
      if (!run) run = [i];
      run.push((i + 1) % n);
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return runs;
}

/** Shade bucket (0 dark … 3 light) for a horizontal face normal, from the projection's light. */
export function shadeOf(nx: number, ny: number, P: Projection) {
  const { sinA, cosA } = cameraOf(P);
  const [lx, ly] = P.light ?? [-sinA, cosA];
  const lit = (nx * lx + ny * ly + 1) / 2;
  return Math.min(SHADES - 1, Math.max(0, Math.floor(lit * SHADES)));
}

/** A vertical prism over a convex plan ring, from z to z + h. */
export function extrude(ring: Plane[], z: number, h: number, P: Projection): SolidPaths {
  const n = ring.length;
  const counter = signedArea(ring) > 0;
  const v = viewOf(P);
  const normals = ring.map(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % n]!;
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy) || 1;
    return (counter ? [dy / l, -dx / l] : [-dy / l, dx / l]) as Plane;
  });
  const facing = normals.map(([nx, ny]) => nx * v[0] + ny * v[1] > 1e-9);
  const top = ring.map(([x, y]) => iso([x, y, z + h], P));
  const bottom = ring.map(([x, y]) => iso([x, y, z], P));
  const outline: string[] = [];
  const crease: string[] = [];
  for (const run of runsOf(facing, false)) outline.push(pathOf(run.map((i) => top[i]!)));
  for (const run of runsOf(facing, true)) {
    crease.push(pathOf(run.map((i) => top[i]!)));
    if (h > 0) outline.push(pathOf(run.map((i) => bottom[i]!)));
  }
  if (h > 0) {
    for (let i = 0; i < n; i++) if (facing[(i + n - 1) % n] !== facing[i]) outline.push(pathOf([top[i]!, bottom[i]!]));
  }
  const buckets: string[][] = Array.from({ length: SHADES }, () => []);
  if (h > 0) {
    for (let i = 0; i < n; i++) {
      if (!facing[i]) continue;
      const [nx, ny] = normals[i]!;
      const j = (i + 1) % n;
      buckets[shadeOf(nx, ny, P)]!.push(pathOf(oriented([top[i]!, top[j]!, bottom[j]!, bottom[i]!]), true));
    }
  }
  return {
    fill: pathOf(convexHull([...top, ...bottom]), true),
    outline: outline.join(""),
    crease: crease.join(""),
    top: pathOf(oriented(top), true),
    shades: buckets.map((p) => p.join("")),
  };
}

/** A seam around the visible near half of a plan ring at height z; it ends on the silhouette. */
export function ringSeam(ring: Plane[], z: number, P: Projection) {
  const n = ring.length;
  const counter = signedArea(ring) > 0;
  const v = viewOf(P);
  const facing = ring.map(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % n]!;
    const [nx, ny] = counter ? [by - ay, -(bx - ax)] : [-(by - ay), bx - ax];
    return nx * v[0] + ny * v[1] > 1e-9;
  });
  return runsOf(facing, true)
    .map((run) => pathOf(run.map((i) => iso([ring[i]![0], ring[i]![1], z], P))))
    .join("");
}

export const slabOf =(plan: Plan, z: number, h: number, P: Projection, steps = 6) => extrude(roundedPlan(plan, steps), z, h, P);
export const boxOf = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, P: Projection) =>
  extrude([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1 - z0, P);
export const cylinderOf = (cx: number, cy: number, r: number, z: number, h: number, P: Projection, steps = 18) =>
  extrude(circleRing(cx, cy, r, steps), z, h, P);

const sub = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Point3, b: Point3): Point3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit3 = (a: Point3): Point3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * A square-section member between two points (slanted legs, struts). Faces are shaded by
 * their normal: near-horizontal faces take the top tone, the rest a side bucket.
 */
export function beamOf(from: Point3, to: Point3, half: number, P: Projection): SolidPaths {
  const a = unit3(sub(to, from));
  const up: Point3 = Math.abs(a[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1];
  const u = unit3(cross3(a, up));
  const w = unit3(cross3(u, a));
  const corner = (p: Point3, su: number, sw: number): Point3 => [
    p[0] + (u[0] * su + w[0] * sw) * half,
    p[1] + (u[1] * su + w[1] * sw) * half,
    p[2] + (u[2] * su + w[2] * sw) * half,
  ];
  const signs: Plane[] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const A = signs.map(([su, sw]) => corner(from, su, sw));
  const B = signs.map(([su, sw]) => corner(to, su, sw));
  const v = viewOf(P);
  const faces: { pts: Point3[]; n: Point3 }[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const [su, sw] = signs[i]!;
    const [tu, tw] = signs[j]!;
    const n = unit3([u[0] * (su + tu) + w[0] * (sw + tw), u[1] * (su + tu) + w[1] * (sw + tw), u[2] * (su + tu) + w[2] * (sw + tw)]);
    faces.push({ pts: [A[i]!, A[j]!, B[j]!, B[i]!], n });
  }
  faces.push({ pts: A, n: [-a[0], -a[1], -a[2]] }, { pts: B, n: a });
  const buckets: string[][] = Array.from({ length: SHADES }, () => []);
  const tops: string[] = [];
  const all: Flat[] = [];
  const edges: string[] = [];
  for (const f of faces) {
    const flat = f.pts.map((p) => iso(p, P));
    all.push(...flat);
    if (dot3(f.n, v) <= 1e-6) continue;
    const d = pathOf(oriented(flat), true);
    edges.push(d);
    if (f.n[2] > 0.7) tops.push(d);
    else buckets[shadeOf(f.n[0], f.n[1], P)]!.push(d);
  }
  const hull = convexHull(all);
  return { fill: pathOf(hull, true), outline: pathOf(hull, true), crease: edges.join(""), top: tops.join(""), shades: buckets.map((b) => b.join("")) };
}

/**
 * A ruled solid between two convex plan rings with matching points (a raked stem, a flared bow):
 * bottom ring at zb, top ring at zt. Side faces are shaded by their normal like `extrude`.
 */
export function loftOf(bottom: Plane[], zb: number, top: Plane[], zt: number, P: Projection): SolidPaths {
  const n = bottom.length;
  const counter = signedArea(top) > 0;
  const v = viewOf(P);
  const B = bottom.map(([x, y]): Point3 => [x, y, zb]);
  const T = top.map(([x, y]): Point3 => [x, y, zt]);
  const buckets: string[][] = Array.from({ length: SHADES }, () => []);
  const facing: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const along = sub(B[j]!, B[i]!);
    const alongTop = sub(T[j]!, T[i]!);
    const up = sub(T[i]!, B[i]!);
    const edge: Point3 = Math.hypot(...along) > 1e-6 ? along : alongTop;
    let normal = unit3(cross3(edge, up));
    if (!counter) normal = [-normal[0], -normal[1], -normal[2]];
    const visible = dot3(normal, v) > 1e-6;
    facing.push(visible);
    if (!visible) continue;
    const face = [B[i]!, B[j]!, T[j]!, T[i]!].map((p) => iso(p, P));
    buckets[shadeOf(normal[0], normal[1], P)]!.push(pathOf(oriented(face), true));
  }
  const topFlat = T.map((p) => iso(p, P));
  const all = [...topFlat, ...B.map((p) => iso(p, P))];
  const crease = runsOf(facing, true).map((run) => pathOf(run.map((i) => topFlat[i]!)));
  const hull = convexHull(all);
  return { fill: pathOf(hull, true), outline: pathOf(hull, true), crease: crease.join(""), top: pathOf(oriented(topFlat), true), shades: buckets.map((b) => b.join("")) };
}

export const num = tenth;
