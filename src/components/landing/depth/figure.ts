// The depth stack as data: three isometric layers that build an estimate from the bottom up.
// L0 is the port (a harbour chart plate: quay, cranes, breakwater, soundings, the tariff books),
// L1 the vessel (a measuring bed with the ship on keel blocks, a beam caliper and a GRT dial),
// L2 the estimate (nine charge tiles, each carrying the thing it bills; the total is the gold one).
// World units: x and y on the floor, z up; the stack stands on the origin. Pure, no DOM: every
// static path is computed once here and the live component only moves groups and one needle.

import {
  type Flat,
  type Plane,
  type Point3,
  type Projection,
  type SolidPaths,
  axisVector,
  beamOf,
  boxOf,
  circleRing,
  cylinderOf,
  extrude,
  iso,
  loftOf,
  pathOf,
  poly,
  ringSeam,
  roundedPlan,
  seg,
} from "../ship/iso";

export const P: Projection = { origin: [0, 0], scale: 1, azimuth: 45, elevation: 30 };

/** Resting height of each layer's top face, and the extra lift once the estimate is complete. */
export const LAYER_Z = [0, 64, 128];
export const LIFT = [0, 14, 28];

/** Screen offset (viewBox units) of a world vector. */
export const screenOf = (d: Point3) => axisVector(P, d);

// ---------------------------------------------------------------- markup helpers

type Material = "steel" | "concrete" | "hull" | "deck" | "dark" | "rust" | "gold" | "pale" | "cream" | "sea" | "paper";

const path = (cls: string, d: string, extra = "") => (d ? `<path class="${cls}" d="${d}"${extra}/>` : "");
const lines = (d: string, cls = "sh-l") => path(cls, d);

function solid(p: SolidPaths, m: Material, inner = "", top = "sh-t") {
  const shades = p.shades.map((d, i) => path(`sh-${i}`, d)).join("");
  return `<g class="sh-m-${m}">${path("sh-f", p.fill)}${shades}${path(top, p.top)}${path("sh-c", p.crease)}${inner}${path("sh-o", p.outline)}</g>`;
}

const plan = (x: number, y: number, w: number, d: number, r: number, steps = 6) => roundedPlan({ x, y, w, d, r }, steps);
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => boxOf(x0, y0, z0, x1, y1, z1, P);
const cyl = (cx: number, cy: number, r: number, z: number, h: number, steps = 18) => cylinderOf(cx, cy, r, z, h, P, steps);
/** A turned frustum (cone, tapered tower) from radius r0 at z to r1 at z + h. */
const frustum = (cx: number, cy: number, r0: number, r1: number, z: number, h: number, steps = 18) =>
  loftOf(circleRing(cx, cy, r0, steps), z, circleRing(cx, cy, r1, steps), z + h, P);
const ellipseTop = (cx: number, cy: number, r: number, z: number, steps = 18) =>
  poly(circleRing(cx, cy, r, steps).map(([x, y]): Point3 => [x, y, z]), P, true);
const s = (a: Point3, b: Point3) => seg(a, b, P);
/** Round-capped zero-length strokes: dots that keep their css size at any figure width. */
const dots = (pts: Point3[]) => pts.map((p) => { const [x, y] = iso(p, P); const t = `${r1(x)} ${r1(y)}`; return `M${t}L${t}`; }).join("");
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Keep the part of a convex plan ring on one side of y = at (Sutherland–Hodgman, one edge). */
function clipY(ring: Plane[], at: number, keepBelow: boolean): Plane[] {
  const inside = ([, y]: Plane) => (keepBelow ? y <= at : y >= at);
  const out: Plane[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (at - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, at]);
    }
  }
  return out;
}

/** A label plate on a face of constant y: three rule lines standing for engraved text, screws at its corners. */
function labelPlateY(x0: number, x1: number, y: number, z0: number, z1: number) {
  const rule: string[] = [];
  const w = x1 - x0;
  const rows = [0.72, 0.5, 0.28];
  rows.forEach((f, i) => rule.push(s([x0 + w * 0.18, y, z0 + (z1 - z0) * f], [x0 + w * (0.82 - i * 0.16), y, z0 + (z1 - z0) * f])));
  const screws = dots([[x0 + 1.4, y, z1 - 1.1], [x1 - 1.4, y, z1 - 1.1], [x0 + 1.4, y, z0 + 1.1], [x1 - 1.4, y, z0 + 1.1]]);
  return path("dp-plate", poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], P, true)) + lines(rule.join(""), "dp-rule") + path("dp-screw", screws);
}

/** Corner screws on a top face, a ring and a dot each. */
const screwsTop = (pts: Plane[], z: number) => pts.map(([x, y]) => path("dp-ring", ellipseTop(x, y, 1.3, z, 12))).join("") + path("dp-screw", dots(pts.map(([x, y]): Point3 => [x, y, z])));

/** Soft shadow under a rounded plan: four faint nested footprints, no filter, so it never costs a repaint. */
const shadow = (x: number, y: number, w: number, d: number, r: number, z: number) =>
  [12, 7, 3, 0].map((e) => path("dp-shadow", poly(plan(x - e, y - e, w + 2 * e, d + 2 * e, r + e).map(([px, py]): Point3 => [px, py, z]), P, true))).join("");

const ticksTop = (from: number, to: number, step: number, every: number, edge: number, dir: number, z: number, axis: "x" | "y") => {
  const minor: string[] = [];
  const major: string[] = [];
  for (let at = from, i = 0; at <= to + 1e-6; at += step, i++) {
    const big = i % every === 0;
    const len = (big ? 4.2 : 2.2) * dir;
    const a: Point3 = axis === "x" ? [at, edge, z] : [edge, at, z];
    const b: Point3 = axis === "x" ? [at, edge + len, z] : [edge + len, at, z];
    (big ? major : minor).push(s(a, b));
  }
  return lines(minor.join(""), "dp-tick") + lines(major.join(""), "dp-tick-major");
};

// ---------------------------------------------------------------- pieces

export interface Piece {
  id: string;
  layer: number;
  /** Order of arrival within its layer (tiles); 0 for plates. */
  order: number;
  html: string;
  /** viewBox of this piece's own svg: [x, y, w, h], padded for stroke width. */
  box: [number, number, number, number];
  /** Its extent at rest, which is what the figure is framed on. */
  rest: [number, number, number, number];
}


/** Extent of every coordinate pair in the markup, grown to cover its extra poses. */
function extentOf(html: string, reach: Flat[] = [], pad = 18): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const m of html.matchAll(/ d="([^"]+)"/g)) {
    const nums = m[1]!.match(/-?\d+(?:\.\d+)?/g) ?? [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = +nums[i]!;
      const y = +nums[i + 1]!;
      for (const [dx, dy] of [[0, 0], ...reach]) {
        x0 = Math.min(x0, x + dx!);
        x1 = Math.max(x1, x + dx!);
        y0 = Math.min(y0, y + dy!);
        y1 = Math.max(y1, y + dy!);
      }
    }
  }
  return [Math.floor(x0 - pad), Math.floor(y0 - pad), Math.ceil(x1 - x0 + pad * 2), Math.ceil(y1 - y0 + pad * 2)];
}

/**
 * Collects markup into named parts, in painter's order. Every part becomes its own svg, so a part
 * that moves is moved whole by the compositor and nothing is re-rasterised while scrolling.
 */
function collector(first: string) {
  const parts = new Map<string, string[]>();
  let at = first;
  return {
    to: (id: string) => void (at = id),
    push: (...html: string[]) => {
      if (!parts.has(at)) parts.set(at, []);
      parts.get(at)!.push(...html);
    },
    parts: () => [...parts].map(([id, html]) => ({ id, html: html.join("") })),
  };
}

// ================================================================= L0: the port

/** How far each L0 detail travels in as it arrives (world z). */
export const BUOY_DROP = 9;
export const BOOK_DROP = 14;

const PORT = (() => {
  const Z = LAYER_Z[0]!;
  const out = collector("port");
  const PLATE = plan(-110, -110, 220, 220, 14, 8);
  const LAND_Y = -62;
  const BW = { x0: 78, x1: 94, y1: 44 }; // breakwater
  const LIGHT: Plane = [86, 34];

  out.push(shadow(-110, -110, 220, 220, 14, Z - 26));

  // Plate: a chart table whose top is the water. Groove 3 under the top, label plate on the near face.
  const plate = extrude(PLATE, Z - 10, 10, P);
  out.push(solid(plate, "concrete", lines(ringSeam(PLATE, Z - 3, P), "sh-l") + labelPlateY(-74, -38, 110, Z - 8.2, Z - 3.8), "dp-water"));

  // Soundings: a staggered dot lattice that darkens with depth, banded by the contours.
  const CONTOURS = [-40, -10, 26, 66];
  const inPlate = (x: number, y: number) => {
    const m = 6;
    const ax = Math.max(Math.abs(x) - (110 - 14), 0);
    const ay = Math.max(Math.abs(y) - (110 - 14), 0);
    return Math.hypot(ax, ay) <= 14 - m && Math.abs(x) <= 110 - m && Math.abs(y) <= 110 - m;
  };
  const wave = (c: number, i: number) => (x: number) => c + 3.2 * Math.sin(x * 0.045 + i * 1.7) + 1.6 * Math.sin(x * 0.11 + i);
  const bands: Point3[][] = [[], [], [], [], []];
  const STEP = 6.4;
  for (let j = 0, y = LAND_Y + 4; y < 110; j++, y += STEP * 0.866) {
    for (let x = -110 + (j % 2 ? STEP / 2 : 0); x < 110; x += STEP) {
      if (!inPlate(x, y)) continue;
      if (x > BW.x0 - 3 && x < BW.x1 + 3 && y < BW.y1 + 3) continue;
      if (Math.hypot(x - LIGHT[0], y - LIGHT[1]) < 13) continue;
      if (Math.abs(Math.abs(x) - 100) < 4 && Math.abs(y - 100) < 4) continue;
      const band = CONTOURS.filter((c, i) => y > wave(c, i)(x)).length;
      bands[band]!.push([x, y, Z]);
    }
  }
  bands.forEach((b, i) => {
    out.to(`port-band-${i}`);
    out.push(path(`dp-sound dp-sound-${i}`, dots(b)));
  });
  out.to("port-contours");
  out.push(
    CONTOURS.map((c, i) => {
      const f = wave(c, i);
      const pts: Point3[] = [];
      for (let x = -110; x <= 110 + 1e-6; x += 5) pts.push([x, f(x), Z]);
      return path("dp-contour", poly(pts, P));
    }).join(""),
  );
  out.to("port-land");

  // Land and quay: the plate's back strip, raised 6, with a coping line and fenders on its face.
  const land = clipY(PLATE, LAND_Y, true);
  const quayTop = Z + 6;
  const coping = s([-110, LAND_Y, quayTop - 1.2], [110, LAND_Y, quayTop - 1.2]);
  out.push(solid(extrude(land, Z, 6, P), "concrete", lines(coping, "sh-l")));
  for (let x = -96; x <= 66; x += 18) out.push(solid(box(x - 2, LAND_Y, Z + 1.2, x + 2, LAND_Y + 1.4, Z + 4.4), "dark"));

  // Yard behind the cranes: two rows of boxes, one or two high.
  const colours: Material[] = ["cream", "sea", "pale", "cream", "rust", "cream", "sea", "pale"];
  const tiers = [2, 1, 2, 2, 1, 2, 1, 2];
  for (const [row, y0] of [[0, -104], [1, -98]] as const) {
    for (let i = 0; i < 8; i++) {
      const x0 = -94 + i * 17 + row * 4;
      if (x0 > 46) continue;
      const k = (i * 3 + row * 5) % colours.length;
      const n = row ? Math.max(1, tiers[(i + 3) % 8]! - 1) : tiers[i]!;
      for (let t = 0; t < n; t++) {
        const z0 = quayTop + t * 5;
        const ring: Plane[] = [[x0, y0], [x0 + 14, y0], [x0 + 14, y0 + 5], [x0, y0 + 5]];
        const ribs: string[] = [];
        for (let x = x0 + 1.75; x < x0 + 14; x += 1.75) ribs.push(s([x, y0 + 5, z0 + 0.5], [x, y0 + 5, z0 + 4.5]));
        out.push(solid(box(x0, y0, z0, x0 + 14, y0 + 5, z0 + 5), colours[k]!, lines(ringSeam(ring, z0 + 4.6, P) + ribs.join(""), "sh-r")));
      }
    }
  }

  // Tariff books: the published scales of rates, in the back-right corner of the yard.
  {
    const book = (x0: number, y0: number, x1: number, y1: number, z0: number, h: number, cover: Material) => {
      const c = 0.6;
      const pageRing: Plane[] = [[x0, y0 + 0.8], [x1 - 0.8, y0 + 0.8], [x1 - 0.8, y1], [x0, y1]];
      const leaves: string[] = [];
      for (let z = z0 + c + 0.55; z < z0 + h - c - 0.3; z += 0.55) leaves.push(ringSeam(pageRing, z, P));
      return (
        solid(box(x0, y0, z0, x1, y1, z0 + c), cover) +
        solid(extrude(pageRing, z0 + c, h - 2 * c, P), "paper", lines(leaves.join(""), "dp-leaf")) +
        solid(box(x0, y0, z0 + h - c, x1, y1, z0 + h), cover) +
        solid(box(x0, y1 - 0.01, z0, x1 - 0.8, y1 + 0.7, z0 + h), cover, lines(s([x0 + 3, y1 + 0.7, z0 + h / 2], [x1 - 6, y1 + 0.7, z0 + h / 2]), "sh-c"))
      );
    };
    const ribbon = path("dp-ribbon", s([93.4, -92, quayTop + 9.6], [96.2, -92, quayTop + 9.6]) + s([96.2, -92, quayTop + 9.6], [96.2, -92, quayTop + 4.2]));
    out.to("port-books");
    out.push(book(64, -105, 98, -83.7, quayTop, 4.6, "sea") + book(67, -102, 93.4, -86.7, quayTop + 4.6, 5, "pale") + ribbon);
    out.to("port-land");
  }

  // Two ship-to-shore cranes over the empty berth: portal legs, sill beams, girder and boom,
  // machinery house, trolley, and an A-frame with its stays.
  for (const cx of [-58, -8]) {
    const [yw, yl] = [-70, -86];
    const leg = (x: number, y: number) => solid(box(x - 0.9, y - 0.9, quayTop, x + 0.9, y + 0.9, Z + 27), "pale");
    const parts: string[] = [];
    parts.push(leg(cx - 5, yl), leg(cx + 5, yl));
    parts.push(solid(box(cx - 6.2, yl - 1.1, Z + 27, cx + 6.2, yl + 1.1, Z + 30), "pale"));
    parts.push(solid(box(cx - 4.1, yl - 0.6, Z + 13, cx + 4.1, yl + 0.6, Z + 14.4), "pale"));
    parts.push(leg(cx - 5, yw), leg(cx + 5, yw));
    parts.push(solid(box(cx - 6.2, yw - 1.1, Z + 27, cx + 6.2, yw + 1.1, Z + 30), "pale"));
    parts.push(solid(box(cx - 4.1, yw - 0.6, Z + 13, cx + 4.1, yw + 0.6, Z + 14.4), "pale"));
    const gRing: Plane[] = [[cx - 3, -100], [cx + 3, -100], [cx + 3, -36], [cx - 3, -36]];
    const walk: string[] = [];
    for (let y = -98; y <= -38; y += 4) walk.push(s([cx + 3, y, Z + 30.4], [cx + 3, y, Z + 32.6]));
    parts.push(solid(box(cx - 3, -100, Z + 30, cx + 3, -36, Z + 33), "pale", lines(ringSeam(gRing, Z + 31.5, P) + walk.join(""), "sh-r")));
    parts.push(solid(box(cx - 4, -99, Z + 33, cx + 4, -89, Z + 38.5), "cream", lines(s([cx + 4, -97, Z + 36], [cx + 4, -91, Z + 36]), "sh-l")));
    const ty = cx < -30 ? -66 : -52; // each trolley parked at its own point along the boom
    parts.push(solid(box(cx - 3.6, ty - 3, Z + 33, cx + 3.6, ty + 3, Z + 35.2), "dark") + path("dp-hoist", s([cx, ty, Z + 33], [cx, ty, Z + 20])) + solid(box(cx - 2.4, ty - 2, Z + 18.8, cx + 2.4, ty + 2, Z + 20), "rust"));
    parts.push(solid(beamOf([cx, yl + 2, Z + 33], [cx, -78, Z + 46], 0.7, P), "pale"));
    parts.push(solid(beamOf([cx, yw - 2, Z + 33], [cx, -78, Z + 46], 0.7, P), "pale"));
    parts.push(path("sh-stay", s([cx, -78, Z + 46], [cx, -38, Z + 33]) + s([cx, -78, Z + 46], [cx, -98, Z + 38.5])));
    out.push(parts.join(""));
  }

  // Bollards along the quay edge, between the fenders.
  for (let x = -87; x <= 57; x += 18) out.push(solid(cyl(x, -65.5, 1.2, quayTop, 2.2, 12), "dark") + solid(cyl(x, -65.5, 1.7, quayTop + 2.2, 0.7, 12), "dark"));

  // Breakwater with armour stones along its outer foot, coping line, and the light at its head.
  {
    const ring = clipY(plan(BW.x0, -90, BW.x1 - BW.x0, BW.y1 + 90, 8), LAND_Y, false);
    const stones: Point3[] = [];
    for (let y = -60; y <= 36; y += 2.6) stones.push([BW.x1 + 0.4, y, Z + 0.9 + ((y * 7) % 3 === 0 ? 0.5 : 0)]);
    out.push(solid(extrude(ring, Z, 5, P), "concrete", lines(s([86, LAND_Y, Z + 5], [86, LIGHT[1] - 6, Z + 5]), "sh-l") + path("dp-stone", dots(stones))));
    const [lx, ly] = LIGHT;
    let z = Z + 5;
    out.push(solid(cyl(lx, ly, 6, z, 2), "concrete"));
    z += 2;
    // Tower in four painted bands, tapering 4.2 → 2.7.
    const r = (t: number) => 4.2 - (1.5 * t) / 18.4;
    for (let b = 0; b < 4; b++) out.push(solid(frustum(lx, ly, r(b * 4.6), r(b * 4.6 + 4.6), z + b * 4.6, 4.6), b % 2 ? "rust" : "cream"));
    z += 18.4;
    out.push(solid(cyl(lx, ly, 3.9, z, 1, 16), "dark"));
    out.push(solid(cyl(lx, ly, 2.2, z + 1, 3.4, 14), "pale", lines(ringSeam(circleRing(lx, ly, 2.2, 14), z + 2.7, P), "sh-r")));
    out.push(solid(frustum(lx, ly, 2.8, 0.4, z + 4.4, 3, 14), "dark"));
  }

  // Channel buoys, port hand rust and starboard hand sea, leading in past the light.
  const buoy = (x: number, y: number, m: Material) =>
    solid(cyl(x, y, 2.6, Z, 2.4, 14), m) + solid(frustum(x, y, 2.3, 0.5, Z + 2.4, 4.4, 14), m) + solid(cyl(x, y, 0.9, Z + 6.8, 1.2, 10), "dark");
  // Back to front, so the buoys' own svgs stack in painter's order.
  ([[36, 40, "sea"], [64, 40, "rust"], [32, 84, "sea"], [62, 84, "rust"]] as const).forEach(([x, y, m], i) => {
    out.to(`port-buoy-${i}`);
    out.push(buoy(x, y, m));
  });

  // Plate corners: nothing stands near them, so they ride with the plate.
  out.to("port");
  out.push(screwsTop([[-100, 100], [100, 100]], Z));
  return out.parts();
})();

// ================================================================= L1: the vessel

export const SHIP_DROP = 26;
/** The caliper's sliding jaw rests this far open (world y) before it closes on the hull. */
export const JAW_OPEN = 28;
/** The GRT dial: centre, radius, sweep. The needle is rebuilt per frame from these. */
export const DIAL = { cx: -52, cy: 56, r: 9.6, z: 0, from: -0.75 * Math.PI, span: 1.5 * Math.PI, value: 0.68 };

const VESSEL = (() => {
  const Z = LAYER_Z[1]!;
  DIAL.z = Z + 4.9;
  const out = collector("vessel");
  const PLATE = plan(-100, -100, 200, 200, 12, 8);
  out.push(shadow(-100, -100, 200, 200, 12, Z - 30));

  // Bed plate with a 20-unit graticule running edge to edge.
  const grid: string[] = [];
  for (let v = -80; v <= 80; v += 20) grid.push(s([v, -100, Z], [v, 100, Z]), s([-100, v, Z], [100, v, Z]));
  out.push(solid(extrude(PLATE, Z - 6, 6, P), "steel", lines(ringSeam(PLATE, Z - 2.4, P), "sh-l") + labelPlateY(44, 76, 100, Z - 5, Z - 1.2)));
  out.push(lines(grid.join(""), "dp-grid"));

  // Rulers along the far-right and near-left edges.
  out.push(solid(box(88, -80, Z, 96, 80, Z + 1.4), "pale") + ticksTop(-78, 78, 4, 5, 88, 1, Z + 1.4, "y"));
  out.push(solid(box(-80, 88, Z, 80, 96, Z + 1.4), "pale") + ticksTop(-78, 78, 4, 5, 88, 1, Z + 1.4, "x"));

  // Caliper bar, far half (it runs under the hull between the keel blocks), and its fixed jaw.
  const BAR = { x0: 18, x1: 22, z1: Z + 2.4 };
  const vernier = (y0: number, y1: number) => {
    const t: string[] = [];
    for (let y = y0; y <= y1; y += 3) t.push(s([BAR.x1, y, BAR.z1], [BAR.x1 - 1.6, y, BAR.z1]));
    return lines(t.join(""), "dp-tick-major");
  };
  out.push(solid(box(BAR.x0, -18, Z, BAR.x1, 2, BAR.z1), "steel"));
  out.push(solid(box(BAR.x0 - 0.6, -18, Z, BAR.x1 + 0.6, -12, Z + 20), "steel", lines(s([BAR.x1 + 0.6, -12, Z + 3], [BAR.x1 + 0.6, -12, Z + 19]), "sh-l")));

  // Keel blocks.
  for (const x of [-40, 0, 40]) out.push(solid(box(x - 5, -7, Z, x + 5, 7, Z + 6), "rust", lines(ringSeam([[x - 5, -7], [x + 5, -7], [x + 5, 7], [x - 5, 7]], Z + 3, P), "sh-c")));

  // The ship, a bulk carrier, built at rest on the blocks and lowered in as one group.
  const ship: string[] = [];
  const K = Z + 6; // keel
  const D = K + 12; // deck
  const hullPlan = (x0: number, x1: number, xb: number, hb: number): Plane[] => [
    [x0 + 2.5, -hb],
    [xb, -hb],
    [xb + (x1 - xb) * 0.62, -hb * 0.6],
    [x1, 0],
    [xb + (x1 - xb) * 0.62, hb * 0.6],
    [xb, hb],
    [x0 + 2.5, hb],
    [x0, hb * 0.55],
    [x0, -hb * 0.55],
  ];
  const keelRing = hullPlan(-64, 58, 42, 9);
  const deckRing = hullPlan(-70, 70, 50, 12);
  const at = (t: number) => keelRing.map(([x, y], i): Plane => [x + (deckRing[i]![0] - x) * t, y + (deckRing[i]![1] - y) * t]);
  const boot = 4;
  ship.push(solid(loftOf(keelRing, K, at(boot / 12), K + boot, P), "rust"));
  const welds: string[] = [];
  const sideY = (z: number) => 9 + (3 * (z - K)) / 12;
  for (let x = -44; x <= 40; x += 14) welds.push(s([x, sideY(K + boot + 0.3), K + boot + 0.3], [x, sideY(D - 0.6), D - 0.6]));
  ship.push(solid(loftOf(at(boot / 12), K + boot, deckRing, D, P), "hull", lines(ringSeam(at(11.4 / 12), D - 0.6, P), "sh-hl") + lines(welds.join(""), "sh-hw")));

  // Accommodation, bridge with wings, funnel: all aft, drawn before the hatches in front of them.
  const windows = (x: number, y0: number, y1: number, z: number) => {
    const w: string[] = [];
    for (let y = y0 + 1.6; y + 1.4 <= y1 - 1; y += 2.6) w.push(poly([[x, y, z], [x, y + 1.4, z], [x, y + 1.4, z + 1.3], [x, y, z + 1.3]], P, true));
    return path("sh-win", w.join(""));
  };
  ship.push(solid(box(-67, -10, D, -51, 10, D + 10), "cream", windows(-51, -10, 10, D + 2.6) + windows(-51, -10, 10, D + 6.2)));
  ship.push(solid(box(-65, -13.5, D + 10, -53, 13.5, D + 14), "cream", windows(-53, -13.5, 13.5, D + 11.6)));
  ship.push(solid(cyl(-63, 0, 0.5, D + 14, 7, 10), "dark"));
  ship.push(solid(box(-62.5, -3.6, D + 14, -56.5, 3.6, D + 23), "dark", lines(ringSeam([[-62.5, -3.6], [-56.5, -3.6], [-56.5, 3.6], [-62.5, 3.6]], D + 20, P), "dp-band")));

  // Five hatch covers, deck cranes in the gaps with their jibs stowed aft on the cover behind.
  for (let i = 0; i < 5; i++) {
    const x0 = -42 + i * 17.5;
    const ring: Plane[] = [[x0, -8], [x0 + 13, -8], [x0 + 13, 8], [x0, 8]];
    const ribs: string[] = [];
    for (let x = x0 + 2.6; x < x0 + 13; x += 2.6) ribs.push(s([x, -8, D + 3.4], [x, 8, D + 3.4]), s([x, 8, D + 0.6], [x, 8, D + 3.4]));
    ship.push(solid(box(x0, -8, D, x0 + 13, 8, D + 3.4), "sea", lines(ribs.join("") + ringSeam(ring, D + 0.6, P), "sh-c")));
    if (i < 4) {
      const px = x0 + 15.25;
      ship.push(solid(cyl(px, 0, 1.3, D, 10.5, 12), "pale"));
      ship.push(solid(box(px - 2, -2, D + 10.5, px + 2, 2, D + 13.5), "pale", windows(px + 2, -2, 2, D + 11.6)));
      ship.push(solid(beamOf([px - 1.8, 0, D + 12], [px - 11.5, 0, D + 3.4 + 0.6], 0.6, P), "pale"));
    }
  }
  // Forecastle kit: windlass drums and the foremast.
  ship.push(solid(cyl(56, -3, 1, D, 1.6, 12), "dark") + solid(cyl(56, 3, 1, D, 1.6, 12), "dark"));
  ship.push(solid(cyl(61, 0, 0.5, D, 9, 10), "steel"));
  out.to("vessel-ship");
  out.push(ship.join(""));

  // Caliper bar, near half, and the sliding jaw that closes on the hull's beam.
  out.to("vessel-bar");
  out.push(solid(box(BAR.x0, 2, Z, BAR.x1, 58, BAR.z1), "steel", vernier(16, 56)));
  out.to("vessel-jaw");
  out.push(
    `${solid(box(BAR.x0 - 0.6, 12, Z, BAR.x1 + 0.6, 18, Z + 20), "steel", lines(s([BAR.x1 + 0.6, 12, Z + 3], [BAR.x1 + 0.6, 12, Z + 19]), "sh-l"))}${solid(cyl(BAR.x1 + 0.6 + 1.6, 15, 1.6, Z + 1.2, 2.2, 12), "dark")}`,
  );

  // The GRT dial: body, bezel, face with a 270° scale; needle and hub are live.
  const { cx, cy, r } = DIAL;
  out.to("vessel-dial");
  out.push(solid(cyl(cx, cy, r + 2.4, Z, 3.6, 24), "dark"));
  out.push(solid(cyl(cx, cy, r + 1.2, Z + 3.6, 1.3, 24), "steel", "", "dp-face"));
  const ticks: string[] = [];
  const major: string[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = DIAL.from + (DIAL.span * i) / 20;
    const len = i % 5 ? 1.3 : 2.4;
    const [sx, sy] = [Math.sin(a), -Math.cos(a)];
    (i % 5 ? ticks : major).push(s([cx + sx * (r - len), cy + sy * (r - len), DIAL.z], [cx + sx * r, cy + sy * r, DIAL.z]));
  }
  out.push(lines(ticks.join(""), "dp-tick") + lines(major.join(""), "dp-tick-major"));
  // The needle sweeps its whole scale, so its svg is framed on every reading it can show.
  out.to("vessel-needle");
  out.push(`<path class="dp-needle" data-k="needle" d=""/>`, path("dp-hub", dots([[cx, cy, DIAL.z]])));
  out.push(`<path fill="none" d="${[0, 0.25, 0.5, 0.75, 1].map(needleOf).join("")}"/>`);

  out.to("vessel");
  out.push(screwsTop([[-91, -91], [91, -91], [-91, 91], [91, 91]], Z));
  return out.parts();
})();

/** Needle path for a dial reading t (0..1). */
export function needleOf(t: number) {
  const { cx, cy, r, z, from, span } = DIAL;
  const a = from + span * t;
  const [sx, sy] = [Math.sin(a), -Math.cos(a)];
  return pathOf([iso([cx - sx * 2.2, cy - sy * 2.2, z], P), iso([cx + sx * (r - 1.2), cy + sy * (r - 1.2), z], P)]);
}

// ================================================================= L2: the estimate

export const TILE_DROP = 62;

export const CHARGES = [
  "Light dues",
  "Pilotage",
  "Towage",
  "Port dues",
  "Wharfage",
  "Berth hire",
  "Mooring",
  "Agency",
  "Total",
] as const;

/** Arrival order of the tiles (index into CHARGES); the total always lands last. */
export const ARRIVAL = [3, 0, 1, 4, 2, 6, 5, 7, 8];

function tile(i: number) {
  const Z = LAYER_Z[2]!;
  const T = Z + 8; // tile top
  const cx = ((i % 3) - 1) * 62;
  const cy = (Math.floor(i / 3) - 1) * 62;
  const total = i === 8;
  const ring = plan(cx - 27, cy - 27, 54, 54, 6, 5);
  const out: string[] = [shadow(cx - 27, cy - 27, 54, 54, 6, Z - 22)];
  const rule: string[] = [];
  [0, 1, 2].forEach((k) => rule.push(s([cx - 20, cy + 15.5 + k * 3.4, T], [cx - 20 + [22, 15, 9][k]!, cy + 15.5 + k * 3.4, T])));
  out.push(solid(extrude(ring, Z, 8, P), total ? "gold" : "steel", lines(ringSeam(ring, Z + 2.6, P), "sh-l")));
  out.push(lines(rule.join(""), "dp-rule") + screwsTop([[cx - 21, cy - 21], [cx + 21, cy - 21], [cx + 21, cy + 21]], T));

  // What each charge bills, standing on its tile a little behind the printed lines.
  const ox = cx;
  const oy = cy - 4;
  const o: string[] = [];
  switch (CHARGES[i]) {
    case "Light dues": {
      o.push(solid(cyl(ox, oy, 6, T, 2), "concrete"));
      const r = (t: number) => 4.2 - (1.6 * t) / 20;
      for (let b = 0; b < 4; b++) o.push(solid(frustum(ox, oy, r(b * 5), r(b * 5 + 5), T + 2 + b * 5, 5), b % 2 ? "rust" : "cream"));
      o.push(solid(cyl(ox, oy, 3.6, T + 22, 0.9, 16), "dark"));
      o.push(solid(cyl(ox, oy, 2, T + 22.9, 3, 14), "pale"));
      o.push(solid(frustum(ox, oy, 2.6, 0.4, T + 25.9, 2.8, 14), "dark"));
      break;
    }
    case "Pilotage": {
      const hp = (x0: number, x1: number, hb: number): Plane[] => [[x0 + 1.5, -hb], [x1 - 7, -hb], [x1, 0], [x1 - 7, hb], [x0 + 1.5, hb], [x0, hb * 0.5], [x0, -hb * 0.5]].map(([x, y]) => [ox + x!, oy + y!] as Plane);
      o.push(solid(loftOf(hp(-13, 13, 4.4), T, hp(-15, 16, 5.6), T + 4, P), "dark", lines(ringSeam(hp(-14.6, 15.4, 5.4), T + 3.2, P), "sh-hl")));
      o.push(solid(box(ox - 9, oy - 3.6, T + 4, ox + 2, oy + 3.6, T + 8.4), "rust", path("sh-win", poly([[ox + 2, oy - 2.4, T + 6], [ox + 2, oy + 2.4, T + 6], [ox + 2, oy + 2.4, T + 7.4], [ox + 2, oy - 2.4, T + 7.4]], P, true))));
      o.push(solid(cyl(ox - 4, oy, 0.45, T + 8.4, 6, 8), "dark"));
      break;
    }
    case "Towage": {
      o.push(solid(box(ox - 12, oy - 4.5, T, ox + 12, oy + 4.5, T + 2), "dark"));
      o.push(solid(cyl(ox - 7, oy, 3, T + 2, 10, 16), "dark"));
      o.push(solid(box(ox - 7, oy - 1.2, T + 7, ox + 7, oy + 1.2, T + 9), "dark", lines(s([ox - 4, oy + 1.2, T + 8], [ox + 4, oy + 1.2, T + 8]), "sh-hl")));
      o.push(solid(cyl(ox + 7, oy, 3, T + 2, 10, 16), "dark"));
      break;
    }
    case "Port dues": {
      o.push(solid(cyl(ox, oy, 7, T, 1.2, 20), "dark"));
      o.push(solid(cyl(ox, oy, 6, T + 1.2, 4.6, 20), "rust", lines(ringSeam(circleRing(ox, oy, 6, 20), T + 3.6, P), "sh-c")));
      o.push(solid(frustum(ox, oy, 5.4, 1.1, T + 5.8, 9.5, 20), "rust"));
      o.push(solid(cyl(ox, oy, 1.6, T + 15.3, 2.4, 12), "dark"));
      break;
    }
    case "Wharfage": {
      const [x0, x1, y0, y1] = [ox - 13, ox + 13, oy - 5, oy + 5];
      const ribs: string[] = [];
      for (let x = x0 + 1.6; x < x1 - 0.5; x += 1.6) ribs.push(s([x, y1, T + 0.7], [x, y1, T + 9.3]));
      const doors = s([x1, (y0 + y1) / 2, T + 0.6], [x1, (y0 + y1) / 2, T + 9.4]) + s([x1, y0 + 2.2, T + 0.6], [x1, y0 + 2.2, T + 9.4]) + s([x1, y1 - 2.2, T + 0.6], [x1, y1 - 2.2, T + 9.4]);
      const rails = ringSeam([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], T + 9.4, P) + ringSeam([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], T + 0.6, P);
      o.push(solid(box(x0, y0, T, x1, y1, T + 10), "sea", lines(ribs.join("") + doors + rails, "sh-c")));
      break;
    }
    case "Berth hire": {
      o.push(solid(cyl(ox, oy, 6.4, T, 1.6, 20), "dark"));
      o.push(solid(cyl(ox, oy, 3.6, T + 1.6, 7.6, 18), "dark"));
      o.push(solid(cyl(ox, oy, 5, T + 9.2, 2.4, 20), "dark", lines(ringSeam(circleRing(ox, oy, 5, 20), T + 10.4, P), "sh-hl")));
      break;
    }
    case "Mooring": {
      for (let k = 0; k < 4; k++) {
        const ring = circleRing(ox + (k % 2) * 0.6, oy, 9.5 - k * 0.3, 24);
        const twist: string[] = [];
        for (let a = 0; a < 24; a += 2) {
          const [x, y] = ring[a]!;
          twist.push(s([x, y, T + k * 1.9 + 0.3], [x, y, T + k * 1.9 + 1.6]));
        }
        o.push(solid(extrude(ring, T + k * 1.9, 1.9, P), "pale", lines(twist.join(""), "sh-r")));
      }
      o.push(path("dp-hole", ellipseTop(ox + 0.6, oy, 4.2, T + 7.6, 18)));
      o.push(path("dp-rope", s([ox + 9.5, oy + 1, T + 6.6], [ox + 15, oy + 9, T])));
      break;
    }
    case "Agency": {
      o.push(solid(box(ox - 10, oy - 6.5, T, ox + 10, oy + 6.5, T + 1.2), "rust"));
      o.push(solid(box(ox - 9, oy - 5.5, T + 1.2, ox + 9, oy + 5.5, T + 5.4), "dark", lines(ringSeam([[ox - 9, oy - 5.5], [ox + 9, oy - 5.5], [ox + 9, oy + 5.5], [ox - 9, oy + 5.5]], T + 4.4, P), "sh-hl")));
      o.push(solid(frustum(ox, oy, 2.8, 1.8, T + 5.4, 6, 14), "pale"));
      o.push(solid(cyl(ox, oy, 4.6, T + 11.4, 3.4, 20), "pale", lines(ringSeam(circleRing(ox, oy, 4.6, 20), T + 12.6, P), "sh-r")));
      break;
    }
    case "Total": {
      const coins: [number, number][] = [[0, 0], [0.8, -0.4], [-0.5, 0.6], [0.3, 0.2], [-0.2, -0.5]];
      coins.forEach(([dx, dy], k) => {
        const ring = circleRing(ox + dx, oy + dy, 8, 28);
        const reeds: string[] = [];
        for (let a = 0; a < 28; a++) {
          const [x, y] = ring[a]!;
          reeds.push(s([x, y, T + k * 1.8 + 0.35], [x, y, T + k * 1.8 + 1.45]));
        }
        o.push(solid(extrude(ring, T + k * 1.8, 1.8, P), "pale", lines(reeds.join(""), "sh-r")));
      });
      o.push(path("dp-coin", ellipseTop(ox + 0.1, oy - 0.3, 5.4, T + 9, 24)));
      break;
    }
  }
  out.push(o.join(""));
  return out.join("");
}

// ---------------------------------------------------------------- assembly

const up = (z: number) => screenOf([0, 0, z]);

const piece =
  (layer: number, order: number) =>
  ({ id, html }: { id: string; html: string }): Piece => ({ id, layer, order, html, box: extentOf(html, [], 6), rest: extentOf(html, [], 0) });

export const PIECES: Piece[] = [
  ...PORT.map(piece(0, 0)),
  ...VESSEL.map(piece(1, 0)),
  ...CHARGES.map((_, i) => piece(2, ARRIVAL.indexOf(i))({ id: `tile-${i}`, html: tile(i) })),
];

/** The whole figure's extent with every layer at rest and at full lift. */
export const VIEW = (() => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of PIECES) {
    const [bx, by, bw, bh] = p.rest;
    const [, ly] = up(LIFT[p.layer]!);
    x0 = Math.min(x0, bx);
    x1 = Math.max(x1, bx + bw);
    y0 = Math.min(y0, by + ly);
    y1 = Math.max(y1, by + bh);
  }
  const pad = 6;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
})();
