// The harbour as data: world layout, every drawn part with its world box, and the static markup.
// World units are metres: x runs along the quay, y toward the hero's viewer (out to sea), z up;
// z = 0 is the water. Every sortable part is an axis-aligned box that never interpenetrates another,
// which is what lets depth.ts order them exactly with per-axis separation (see depth.ts).
//
// The world is fixed; its drawing is built per camera by `buildScene`. The hero looks in from the
// sea; the depth section's closing strip looks out from behind the quay, straight on and low.

import {
  type Flat,
  type Plane,
  type Point3,
  type Projection,
  type SolidPaths,
  axisVector,
  beamOf,
  boxOf,
  convexHull,
  cylinderOf,
  extrude,
  iso,
  loftOf,
  num,
  pathOf,
  poly,
  ringSeam,
  seg,
  slabOf,
  viewOf,
} from "./iso";
import { DepthSorter } from "./depth";
import { AZIMUTH, ELEVATION } from "./projection";
export { AZIMUTH, ELEVATION } from "./projection";

// ---------------------------------------------------------------- layout

/**
 * The drawing is a harbour strip along the bottom of the hero: the svg box is the hero's width
 * with its bottom on the hero's bottom edge, so 1 unit is 1 px at 1440×900. The centred copy,
 * measured in the hero, reaches x 387–1053 units and down to y 570 at its worst (1280×720), and
 * x 424–1016, y 447 at 1440×900. At rest, tall parts (cranes, masts, superstructure) stay out of
 * TALL_ZONE; low parts (hulls, cargo, yard) clear LOW_ZONE. While unloading, cranes may gantry in
 * behind the copy.
 */
export const VIEW_W = 1440;
export const VIEW_H = 900;
export const TALL_ZONE = { x0: 375, x1: 1080, y1: 582 };
export const LOW_ZONE = { x0: 410, x1: 1040, y1: 459 };
/** A part at most this tall (world z) only has to clear LOW_ZONE. */
export const LOW_TOP = 16;

/**
 * The quay: one uniform strip, deep enough for the crane rails and the yard behind them, running
 * past both edges on piles (deck underside at z 1.4). Constant depth keeps its width on screen
 * the same from end to end.
 */
export const QUAY = { x0: -600, x1: 570, back: -46, top: 3, under: 1.4 };
/** Hull at rest: x ±59 about its berth, far side on the fenders at y = 1.6, loaded waterline at local z = 0. */
export const SHIP = { half: 59, beam: 15.5, deck: 4, y: 1.6, bootTop: 0.35 };
/** Each ship's centre when berthed, left to right on screen (world +x is screen left). */
export const BERTHS = [133, 0, -133];
export const SHIPS = BERTHS.length;
export const BOX = { l: 12.2, w: 2.44, h: 2.59 };
export const BAYS = 6;
export const ROWS = 5;
export const TIERS = 3;
const BAY_X0 = -41;
const BAY_PITCH = 13.7;
const ROW_PITCH = 2.54;
const TIER_PITCH = 2.62;
const HATCH_TOP = 4.6;
const CL = SHIP.y + SHIP.beam / 2; // ship centre line (world y)

/** Bay positions are relative to a ship's centre; add its berth. */
export const bayX = (b: number) => BAY_X0 + b * BAY_PITCH;
export const bayCentre = (b: number) => bayX(b) + BOX.l / 2;
export const shipRowY = (r: number) => SHIP.y + 1.45 + r * ROW_PITCH;
export const shipTierZ = (t: number) => HATCH_TOP + t * TIER_PITCH;
/** Yard rows under the crane backreach; row 0 is nearest the landside legs. */
export const yardRowY = (j: number) => -24.44 - j * ROW_PITCH;
export const yardTierZ = (t: number) => QUAY.top + t * TIER_PITCH;

export const CRANE = {
  legX: 9,
  waterY: -3.5,
  landY: -19.5,
  girderX: 4,
  girderZ: 36,
  girderTop: 38.2,
  beamTop: 40.6,
  tipY: 21.5,
  backY: -38,
  trolleyZ: 35.4,
  apexZ: 55,
  parkY: -12,
  parkZ: 25,
  safeZ: 17.2,
};
/**
 * Where the working cranes rest, either side of the copy: crane 0 at the right (it works the
 * stern-side bays 0–2 of whichever ship is unloading), crane 1 at the left (bow-side bays 3–5), so
 * they never cross.
 */
export const CRANE_HOME = [-154, 141];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- containers (world)

export type BoxColour = "cream" | "char" | "grey" | "gold" | "sea" | "rust" | "pale";

const COLOURS: [BoxColour, number][] = [
  ["cream", 25],
  ["char", 21],
  ["grey", 17],
  ["gold", 11],
  ["sea", 12],
  ["rust", 8],
  ["pale", 6],
];

/** The yard is background: mostly quiet tones, so the ships' cargo keeps the colour. */
const YARD_COLOURS: [BoxColour, number][] = [
  ["cream", 36],
  ["grey", 30],
  ["char", 20],
  ["sea", 6],
  ["gold", 4],
  ["rust", 3],
  ["pale", 1],
];

const pickColour = (rand: () => number, weights: [BoxColour, number][] = COLOURS): BoxColour => {
  let r = rand() * 100;
  for (const [c, w] of weights) if ((r -= w) < 0) return c;
  return "cream";
};

export interface Slot {
  x: number;
  y: number;
  z: number;
}

export interface Container {
  colour: BoxColour;
  pair: boolean;
  ship: number;
  bay: number;
  /** Slot aboard, relative to its ship at rest (x about the ship's centre, z above its waterline). */
  home: Slot;
  /** Slot on the quay it is unloaded to, relative to its ship's berth. */
  yard: Slot;
}

export const CONTAINERS: Container[] = [];

/** Top-tier occupancy per bay; pairs (0,3), (1,4), (2,5) carry equal counts so both cranes keep pace. */
const TOP_TIER: number[][] = [
  [1, 2, 3],
  [0, 1, 2, 3],
  [2, 3],
  [0, 1, 2],
  [1, 2, 3, 4],
  [1, 2],
];

/**
 * Unloading order per ship and bay: top tier down, quay-side row first, so nothing is ever in the
 * way; the yard fills bottom tier first and the far row first, so a lowering box never passes a
 * neighbour.
 */
export const BAY_QUEUE: number[][][] = [];

for (let k = 0; k < SHIPS; k++) {
  const rand = rng(20261021 + k * 7919);
  const queues: number[][] = [];
  for (let b = 0; b < BAYS; b++) {
    const queue: number[] = [];
    for (let t = TIERS - 1; t >= 0; t--) {
      // Mirror the top tier on the middle ship so the three loads differ (counts per bay hold).
      const top = TOP_TIER[b]!.map((r) => (k === 1 ? ROWS - 1 - r : r)).sort((a, c) => a - c);
      const rows = t === TIERS - 1 ? top : [0, 1, 2, 3, 4];
      for (const r of rows) {
        const n = queue.length;
        queue.push(CONTAINERS.length);
        CONTAINERS.push({
          colour: pickColour(rand),
          pair: rand() < 0.17,
          ship: k,
          bay: b,
          home: { x: bayX(b), y: shipRowY(r), z: shipTierZ(t) },
          yard: { x: bayX(b), y: yardRowY(ROWS - 1 - (n % ROWS)), z: yardTierZ(Math.floor(n / ROWS)) },
        });
      }
    }
    queues.push(queue);
  }
  BAY_QUEUE.push(queues);
}

/** Boxes aboard each ship (all ships carry the same count). */
export const SHIP_BOXES = CONTAINERS.length / SHIPS;

// ---------------------------------------------------------------- other world parts

export const PILE = { r: 0.5, y: -0.75, pitch: 8, cap: 0.9 };

/** Mooring lines of a ship relative to its berth: head, forward spring, stern, aft spring. */
export const MOORING: { from: Point3; to: Point3 }[] = [
  { from: [56.6, SHIP.y + 3.2, 6.4], to: [64, -1.3, 3.9] },
  { from: [50.5, SHIP.y + 1.2, 6.4], to: [36, -1.3, 3.9] },
  { from: [-56.8, SHIP.y + 3.0, 5.6], to: [-64, -1.3, 3.9] },
  { from: [-50.5, SHIP.y + 1.2, 5.6], to: [-34, -1.3, 3.9] },
];

/** Beacon position on each apex, for the blink. */
export const BEACON: Point3 = [0, CRANE.landY - 0.2, CRANE.apexZ + 1.7];
export const TROLLEY_BOX = [-3.2, 3.2, -2.4, 2.4, CRANE.trolleyZ, CRANE.trolleyZ + 2.5];
export const CAB_BOX = [2.0, 3.2, 0.4, 2.3, 33.0, CRANE.trolleyZ];
export const SPREADER_BOX = [-BOX.l / 2, BOX.l / 2, -BOX.w / 2, BOX.w / 2, 0, 1.1];

/** Hull half-width along the ship: rounded transom, parallel body, fine bow. */
export function halfWidth(x: number) {
  const B = SHIP.beam / 2;
  if (x < -SHIP.half + 3) {
    const dx = x - (-SHIP.half + 3);
    return B - 3 + Math.sqrt(Math.max(0, 9 - dx * dx));
  }
  if (x <= 30) return B;
  const s = Math.min(1, (x - 30) / (SHIP.half - 30));
  return B * Math.pow(Math.max(0, 1 - Math.pow(s, 2.1)), 0.62);
}

function hullRing(from = -SHIP.half, to = SHIP.half): Plane[] {
  const xs: number[] = [];
  for (let i = 0; i <= 8; i++) xs.push(-SHIP.half + (3 * i) / 8);
  xs.push(0);
  for (let i = 0; i <= 18; i++) xs.push(30 + (SHIP.half - 30) * (1 - Math.cos((i / 18) * (Math.PI / 2))));
  const along = xs.filter((x) => x >= from - 1e-9 && x <= to + 1e-9);
  if (along[0]! > from) along.unshift(from);
  if (along[along.length - 1]! < to) along.push(to);
  const near = along.map((x): Plane => [x, CL + halfWidth(x)]);
  const far = along.map((x): Plane => [x, CL - halfWidth(x)]).reverse();
  const ring = [...near, ...far].filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1]![0], p[1] - a[i - 1]![1]) > 1e-6);
  return ring;
}

const HULL_RING = hullRing();

// The waterline plan is finer than the deck plan: the stem rakes forward and the transom aft,
// so lofting between them gives the bow its flare.
const STEM = { from: 30, deck: SHIP.half, water: 55.6 };
const TRANSOM = { from: -55, deck: -SHIP.half, water: -58 };
const toWater = (x: number) =>
  x > STEM.from
    ? STEM.from + ((x - STEM.from) * (STEM.water - STEM.from)) / (STEM.deck - STEM.from)
    : x < TRANSOM.from
      ? TRANSOM.from + ((x - TRANSOM.from) * (TRANSOM.water - TRANSOM.from)) / (TRANSOM.deck - TRANSOM.from)
      : x;
const WATER_RING: Plane[] = HULL_RING.map(([x, y]) => [toWater(x), y]);

/** Hull plan at local height z (0 = loaded waterline, SHIP.deck = deck), extrapolated below 0. */
const ringAt = (z: number): Plane[] => {
  const t = z / SHIP.deck;
  return WATER_RING.map(([x, y], i) => [x + (HULL_RING[i]![0] - x) * t, y + (HULL_RING[i]![1] - y) * t]);
};
export const HULL_BOX = [-SHIP.half, SHIP.half, SHIP.y, SHIP.y + SHIP.beam, 0, SHIP.deck];

/** Clear quay left between a berth's unloading slots and the standing yard's near rows. */
const YARD_GAP = 3;
/** Where each berth's unloading slots are (world x range), kept free of the standing yard. */
const SLOT_SPANS = BERTHS.map((berth) => [berth + bayX(0) - 1, berth + bayX(BAYS - 1) + BOX.l + 1] as const);
const OFFICE_AT: Plane = [BERTHS[0]! + 52, QUAY.back + 0.6];

// ---------------------------------------------------------------- items

export type Owner =
  | { kind: "fixed" }
  | { kind: "ship"; ship: number }
  | { kind: "hull"; ship: number }
  | { kind: "crane"; crane: number }
  | { kind: "trolley"; crane: number }
  | { kind: "spreader"; crane: number }
  | { kind: "ropes"; crane: number }
  | { kind: "box"; box: number };

export interface Item {
  owner: Owner;
  /** World AABB [x0, x1, y0, y1, z0, z1] at the owner's zero offset (a ship's parts: at berth 0). */
  box: number[];
  html: string;
}

type Material = "steel" | "concrete" | "hull" | "deck" | "dark" | "pile" | "rust" | "gold" | "pale";

/** One camera on the harbour: its projection, its svg box, and what of the world it needs. */
export interface Frame {
  /** Prefix of the shared drawings' ids, unique per scene on a page. */
  id: string;
  P: Projection;
  w: number;
  h: number;
  /** Whether a screen point (svg units) is worth drawing at. */
  visible: (at: Flat) => boolean;
  /** Piles down to the box's bottom edge (the hero), or none (seen from behind they hide under the deck). */
  piles: boolean;
  /** Keeps tall parts out of the hero's copy. */
  clearOfCopy?: (b: number[], low?: boolean) => boolean;
}

/** Every drawing of the harbour for one camera. Pure: the same frame gives the same markup. */
export function buildScene(frame: Frame) {
  const { P } = frame;
  const VIEW_W = frame.w;
  const VIEW_H = frame.h;
  const view = viewOf(P);
  /**
   * Seen from behind the quay (looking out to sea). Then the quay deck is drawn among the sorted
   * parts (the ships beyond pass behind it), the standing yard is drawn over them (it is nearer
   * than everything that moves), and details on faces go on the landward face, the one in view.
   */
  const rear = view[1] < 0;
  const nearY = (lo: number, hi: number) => (rear ? lo : hi);
  const visible = (x: number, y = 0, z = 0) => frame.visible(iso([x, y, z], P));
  const clearOfCopy = frame.clearOfCopy ?? (() => true);
  const ref = (name: string) => `${frame.id}-${name}`;

  const shift = (d: Point3) => {
    const [x, y] = axisVector(P, d);
    return `translate(${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100})`;
  };

  // ---------------------------------------------------------------- markup helpers

  /** Shared drawings, placed with <use> wherever a part repeats. */
  const DEFS: string[] = [];

  const path = (cls: string, d: string) => (d ? `<path class="${cls}" d="${d}"/>` : "");

  /** One solid in four side tones plus its top, crease and outline; `inner` sits under the outline. */
  function solid(p: SolidPaths, m: Material, inner = "") {
    const shades = p.shades.map((d, i) => path(`sh-${i}`, d)).join("");
    return `<g class="sh-m-${m}">${path("sh-f", p.fill)}${shades}${path("sh-t", p.top)}${path("sh-c", p.crease)}${inner}${path("sh-o", p.outline)}</g>`;
  }

  const lines = (d: string, cls = "sh-l") => path(cls, d);

  /** A closed quad on a vertical face, for windows and openings. */
  const quad = (pts: Point3[]) => poly(pts, P, true);

  const ellipseOnFaceY = (x: number, y: number, z: number, r: number, steps = 14) =>
    poly(
      Array.from({ length: steps }, (_, i): Point3 => {
        const a = (i / steps) * Math.PI * 2;
        return [x + r * Math.cos(a), y, z + r * Math.sin(a)];
      }),
      P,
      true,
    );

  const ITEMS: Item[] = [];
  const add = (owner: Owner, box: number[], html: string) => {
    ITEMS.push({ owner, box, html });
    return ITEMS.length - 1;
  };
  const FIXED: Owner = { kind: "fixed" };

  // ---------------------------------------------------------------- containers

  function containerSymbol(id: string, pieces: [number, number][]) {
    const face = nearY(0, BOX.w);
    const parts = pieces.map(([x0, x1]) => {
      const b = boxOf(x0, 0, 0, x1, BOX.w, BOX.h, P);
      const ring: Plane[] = [[x0, 0], [x1, 0], [x1, BOX.w], [x0, BOX.w]];
      const rails = ringSeam(ring, BOX.h - 0.2, P) + ringSeam(ring, 0.16, P);
      const ribs: string[] = [];
      const count = Math.round((x1 - x0) / 0.8);
      for (let i = 1; i < count; i++) {
        const x = x0 + ((x1 - x0) * i) / count;
        ribs.push(seg([x, face, 0.16], [x, face, BOX.h - 0.2], P));
      }
      const door = seg([x1, BOX.w / 2, 0], [x1, BOX.w / 2, BOX.h], P);
      const bars = [0.3, 0.7].map((f) => seg([x1, BOX.w * f, 0.16], [x1, BOX.w * f, BOX.h - 0.2], P)).join("");
      const shades = b.shades.map((d, i) => path(`sh-${i}`, d)).join("");
      return `${path("sh-f", b.fill)}${shades}${path("sh-t", b.top)}${path("sh-r", ribs.join("") + bars)}${path("sh-l", rails + door)}${path("sh-c", b.crease)}${path("sh-o", b.outline)}`;
    });
    return `<g id="${id}">${parts.join("")}</g>`;
  }
  const C40 = ref("c40");
  const C20 = ref("c20");
  DEFS.push(containerSymbol(C40, [[0, BOX.l]]), containerSymbol(C20, [[0, BOX.l / 2 - 0.05], [BOX.l / 2 + 0.05, BOX.l]]));

  /** The standing yard's boxes: faces, top and outline only (they are background, and many). */
  const YARD_BOX = ref("cy");
  {
    const b = boxOf(0, 0, 0, BOX.l, BOX.w, BOX.h, P);
    const shades = b.shades.map((d, i) => path(`sh-${i}`, d)).join("");
    DEFS.push(`<g id="${YARD_BOX}">${path("sh-f", b.fill)}${shades}${path("sh-t", b.top)}${path("sh-o", b.outline)}</g>`);
  }

  // ---------------------------------------------------------------- quay (base layers, never sorted)

  /** The quay deck: a concrete strip on the pile caps, its apron markings, rails, coping and fenders. */
  function quayBase() {
    const z = QUAY.top;
    const ring: Plane[] = [[QUAY.x0, QUAY.back], [QUAY.x1, QUAY.back], [QUAY.x1, 0], [QUAY.x0, 0]];
    const slab = extrude(ring, QUAY.under, z - QUAY.under, P);
    const top: string[] = [];
    // Expansion joints run edge to edge across the apron.
    for (let x = QUAY.x1 - 4; x > QUAY.x0; x -= 22) if (visible(x, QUAY.back) || visible(x)) top.push(seg([x, QUAY.back, z], [x, -0.5, z], P));
    // Painted slots under each berth's backreach, waiting for boxes.
    for (const berth of BERTHS)
      for (let b = 0; b < BAYS; b++)
        for (let j = 0; j < ROWS; j++) {
          const x0 = berth + bayX(b) - 0.15;
          const y0 = yardRowY(j) - 0.12;
          top.push(poly([[x0, y0, z], [x0 + BOX.l + 0.3, y0, z], [x0 + BOX.l + 0.3, y0 + BOX.w + 0.24, z], [x0, y0 + BOX.w + 0.24, z]], P, true));
        }
    // Truck lane between the crane rails.
    top.push(seg([QUAY.x0, -11.2, z], [QUAY.x1, -11.2, z], P), seg([QUAY.x0, -11.8, z], [QUAY.x1, -11.8, z], P));
    // Face seam under the coping, edge to edge, on whichever long face is in view.
    const faceY = nearY(QUAY.back, 0);
    const face = seg([QUAY.x0, faceY, 2.5], [QUAY.x1, faceY, 2.5], P);
    const rails: string[] = [];
    for (const y of [CRANE.waterY, CRANE.landY]) rails.push(seg([QUAY.x0, y - 0.35, z], [QUAY.x1, y - 0.35, z], P), seg([QUAY.x0, y + 0.35, z], [QUAY.x1, y + 0.35, z], P));
    const coping = solid(boxOf(QUAY.x0, -0.5, z, QUAY.x1, 0, z + 0.22, P), "pale");
    // The fenders hang on the seaward face, out of sight from behind.
    const fenders: string[] = [];
    if (!rear) {
      DEFS.push(`<g id="${ref("fender")}">${solid(slabOf({ x: -1.1, y: 0, w: 2.2, d: 1.45, r: 0.5 }, 0.4, 2.3, P, 4), "dark", lines(ringSeam([[-1.1, 0], [1.1, 0], [1.1, 1.45], [-1.1, 1.45]], 1.55, P), "sh-hl"))}</g>`);
      for (let x = QUAY.x1 - 10; x > QUAY.x0; x -= 15) if (visible(x)) fenders.push(`<use href="#${ref("fender")}" transform="${shift([x, 0, 0])}"/>`);
    }
    return [solid(slab, "concrete", lines(top.join(""), "sh-k") + lines(face, "sh-l") + lines(rails.join(""), "sh-rail")), coping, ...fenders].join("");
  }

  // ---------------------------------------------------------------- piles (drawn behind everything but the water)

  /**
   * Piles extend below the drawing. The hero clips them at the viewport edge, including on mobile;
   * clipping at VIEW_H would leave their feet floating halfway down a taller phone viewport.
   * Bound their length and keep them on the static layer to avoid repainting long columns.
   */
  const PILE_FOOT = -(VIEW_H + 40 - iso([QUAY.x0, PILE.y, PILE.cap], P)[1]) / (Math.cos((P.elevation * Math.PI) / 180) * P.scale);
  const PILE_XS: number[] = [];
  if (frame.piles) for (let x = QUAY.x1 - 1.2; x > QUAY.x0 + 1; x -= PILE.pitch) if (visible(x, PILE.y, PILE.cap)) PILE_XS.push(x);

  /**
   * A row of piles under the seaward edge, tied by a cap beam under the deck and cross-braced near
   * the top. Every pile stands wholly behind the ships (y < 0 < hull) and below the deck, so one
   * fixed layer under the sorted parts is exact.
   */
  function pilesHtml() {
    if (!frame.piles) return "";
    const braces: string[] = [];
    const [hi, lo] = [PILE.cap, -3.2];
    for (let i = 0; i + 1 < PILE_XS.length; i++) {
      const [a, b] = [PILE_XS[i]!, PILE_XS[i + 1]!];
      braces.push(seg([a, PILE.y, hi], [b, PILE.y, lo], P), seg([a, PILE.y, lo], [b, PILE.y, hi], P));
    }
    // Every pile is the same column, so one is drawn and the rest are placed copies (far to near).
    DEFS.push(`<g id="${ref("pile")}">${solid(cylinderOf(0, 0, PILE.r, PILE_FOOT, PILE.cap - PILE_FOOT, P, 14), "pile")}</g>`);
    const columns = [...PILE_XS].reverse().map((x) => `<use href="#${ref("pile")}" transform="${shift([x, PILE.y, 0])}"/>`).join("");
    const cap = solid(boxOf(QUAY.x0, PILE.y - 0.7, PILE.cap, QUAY.x1, PILE.y + 0.7, QUAY.under, P), "pile");
    return lines(braces.join(""), "sh-brace") + columns + cap;
  }

  // ---------------------------------------------------------------- mooring lines (base layer, drawn in once berthed)

  function mooringPath({ from, to }: { from: Point3; to: Point3 }) {
    const pts: Point3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const sag = Math.sin(Math.PI * t) * 0.6;
      pts.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t - sag]);
    }
    return poly(pts, P);
  }

  // Seen from behind, the deck is one sorted part: the ships beyond go behind it, and everything
  // standing on it goes in front.
  if (rear) add(FIXED, [QUAY.x0, QUAY.x1, QUAY.back, 0, QUAY.under, QUAY.top], quayBase());

  // ---------------------------------------------------------------- bollards (sorted: cranes roll past them)

  DEFS.push(`<g id="${ref("bollard")}">${solid(cylinderOf(0, 0, 0.32, 0, 0.78, P, 16), "dark") + solid(cylinderOf(0, 0, 0.5, 0.78, 0.27, P, 16), "dark")}</g>`);
  {
    // Every berth's mooring bollards, then more along the edge wherever there is room.
    const xs = BERTHS.flatMap((berth) => MOORING.map((m) => berth + m.to[0]));
    for (let x = QUAY.x1 - 6; x > QUAY.x0; x -= 14) if (xs.every((o) => Math.abs(o - x) > 6)) xs.push(x);
    const y = -1.3;
    for (const x of xs) {
      if (!visible(x, y, QUAY.top)) continue;
      add(FIXED, [x - 0.5, x + 0.5, y - 0.5, y + 0.5, QUAY.top, QUAY.top + 1.05], `<use href="#${ref("bollard")}" transform="${shift([x, y, QUAY.top])}"/>`);
    }
  }

  // ---------------------------------------------------------------- crane parts (built at centre line x = 0)

  const CRANE_PARTS: { box: number[]; id: string }[] = [];
  const cranePart = (id: string, box: number[], html: string) => {
    DEFS.push(`<g id="${ref(`cr-${id}`)}">${html}</g>`);
    CRANE_PARTS.push({ box, id });
  };

  {
    const { legX, waterY, landY, girderX, girderZ, girderTop, beamTop, tipY, backY, apexZ } = CRANE;
    const z = QUAY.top;
    for (const sx of [-legX, legX])
      for (const rail of [waterY, landY]) {
        const bogie = boxOf(sx - 2.2, rail - 0.65, z, sx + 2.2, rail + 0.65, z + 1.3, P);
        const wheels = [-1.6, -0.55, 0.55, 1.6].map((dx) => ellipseOnFaceY(sx + dx, nearY(rail - 0.65, rail + 0.65), z + 0.42, 0.3, 12)).join("");
        const col = boxOf(sx - 0.8, rail - 0.8, z + 1.3, sx + 0.8, rail + 0.8, girderTop, P);
        const colRing: Plane[] = [[sx - 0.8, rail - 0.8], [sx + 0.8, rail - 0.8], [sx + 0.8, rail + 0.8], [sx - 0.8, rail + 0.8]];
        const seams = ringSeam(colRing, 12.6, P) + ringSeam(colRing, 26, P);
        // Ladder cage on the outer face of each leg.
        const ox = sx + Math.sign(sx) * 0.8;
        const ladder = sx > 0 ? seg([ox, rail - 0.3, z + 1.3], [ox, rail - 0.3, 36.8], P) + seg([ox, rail + 0.3, z + 1.3], [ox, rail + 0.3, 36.8], P) : "";
        cranePart(`bogie${sx}${rail}`, [sx - 2.2, sx + 2.2, rail - 0.65, rail + 0.65, z, z + 1.3], solid(bogie, "dark", lines(wheels, "sh-hl")));
        cranePart(`leg${sx}${rail}`, [sx - 0.8, sx + 0.8, rail - 0.8, rail + 0.8, z + 1.3, girderTop], solid(col, "steel", lines(seams, "sh-l") + lines(ladder, "sh-l")));
      }
    for (const sx of [-legX, legX]) {
      cranePart(`sill${sx}`, [sx - 0.6, sx + 0.6, landY + 0.8, waterY - 0.8, 12.6, 14.2], solid(boxOf(sx - 0.6, landY + 0.8, 12.6, sx + 0.6, waterY - 0.8, 14.2, P), "steel"));
      const mid = (waterY + landY) / 2;
      const brace =
        solid(beamOf([sx, waterY - 1.3, 14.5], [sx, mid, 36.5], 0.28, P), "steel") + solid(beamOf([sx, mid, 36.5], [sx, landY + 1.3, 14.5], 0.28, P), "steel");
      cranePart(`brace${sx}`, [sx - 0.3, sx + 0.3, landY + 0.95, waterY - 0.95, 14.25, 36.78], brace);
      cranePart(`top${sx}`, [sx - 0.7, sx + 0.7, landY + 0.8, waterY - 0.8, 36.8, girderTop], solid(boxOf(sx - 0.7, landY + 0.8, 36.8, sx + 0.7, waterY - 0.8, girderTop, P), "steel"));
    }
    for (const rail of [waterY, landY]) {
      const beam = boxOf(-legX - 0.8, rail - 0.8, girderTop, legX + 0.8, rail + 0.8, beamTop, P);
      const ring: Plane[] = [[-legX - 0.8, rail - 0.8], [legX + 0.8, rail - 0.8], [legX + 0.8, rail + 0.8], [-legX - 0.8, rail + 0.8]];
      cranePart(`cross${rail}`, [-legX - 0.8, legX + 0.8, rail - 0.8, rail + 0.8, girderTop, beamTop], solid(beam, "steel", lines(ringSeam(ring, girderTop + 1.2, P), "sh-l")));
    }
    for (const gx of [-girderX, girderX]) {
      const g = boxOf(gx - 0.6, backY, girderZ, gx + 0.6, tipY, girderTop, P);
      const ribs: string[] = [];
      for (let y = backY + 3; y < tipY - 1; y += 3) ribs.push(seg([gx + 0.6, y, girderZ], [gx + 0.6, y, girderTop], P), seg([gx - 0.6, y, girderTop], [gx + 0.6, y, girderTop], P));
      // Trolley rail on the inner edge of the girder top.
      const rail = seg([gx - 0.25 * Math.sign(gx), backY, girderTop], [gx - 0.25 * Math.sign(gx), tipY, girderTop], P);
      cranePart(`girder${gx}`, [gx - 0.6, gx + 0.6, backY, tipY, girderZ, girderTop], solid(g, "steel", lines(ribs.join(""), "sh-l") + lines(rail, "sh-l")));
    }
    cranePart("tip", [-3.4, 3.4, tipY - 0.6, tipY, 36.6, girderTop], solid(boxOf(-3.4, tipY - 0.6, 36.6, 3.4, tipY, girderTop, P), "steel"));
    cranePart("back", [-3.4, 3.4, backY, backY + 0.6, 36.4, girderTop], solid(boxOf(-3.4, backY, 36.4, 3.4, backY + 0.6, girderTop, P), "steel"));
    {
      const [x0, x1, y0, y1, z0, z1] = [-5.2, 5.2, -37.6, -30.4, girderTop, 42.4];
      const fy = nearY(y0, y1);
      const louvres: string[] = [];
      for (let zz = z0 + 0.9; zz < z1 - 0.4; zz += 0.55) louvres.push(seg([x0, fy, zz], [x0 + 3.6, fy, zz], P));
      louvres.push(seg([x0 + 3.6, fy, z0 + 0.9 - 0.2], [x0 + 3.6, fy, z1], P));
      const door = quad([[x1, y1 - 2.6, z0], [x1, y1 - 1.4, z0], [x1, y1 - 1.4, z0 + 2.1], [x1, y1 - 2.6, z0 + 2.1]]);
      const roof = solid(boxOf(-2.4, -36.2, z1, 1.6, -33.8, z1 + 0.6, P), "steel");
      cranePart("house", [x0, x1, y0, y1, z0, z1 + 0.6], solid(boxOf(x0, y0, z0, x1, y1, z1, P), "steel", lines(louvres.join(""), "sh-l") + lines(door, "sh-win")) + roof);
    }
    for (const gx of [-girderX, girderX]) {
      cranePart(`post${gx}`, [gx - 0.5, gx + 0.5, landY - 0.8, landY + 0.4, beamTop, apexZ], solid(boxOf(gx - 0.5, landY - 0.8, beamTop, gx + 0.5, landY + 0.4, apexZ, P), "steel"));
      cranePart(`rear${gx}`, [gx - 0.35, gx + 0.35, -29.4, -20.5, girderTop + 0.05, apexZ - 0.1], solid(beamOf([gx, -20.85, apexZ - 0.45], [gx, -29.0, girderTop + 0.4], 0.35, P), "steel"));
    }
    cranePart(
      "apex",
      [-4.6, 4.6, landY - 0.8, landY + 0.4, apexZ, apexZ + 1.7],
      solid(boxOf(-4.6, landY - 0.8, apexZ, 4.6, landY + 0.4, apexZ + 1.2, P), "steel") + solid(cylinderOf(0, landY - 0.2, 0.32, apexZ + 1.2, 0.5, P, 12), "dark"),
    );
    // Forestays, split where they pass over the waterside cross beam so each piece separates cleanly.
    const stayZ = (y: number) => apexZ - 0.4 - ((y - (landY + 0.6)) / (tipY - 0.3 - (landY + 0.6))) * (apexZ - 0.4 - girderTop);
    const cuts = [landY + 0.6, waterY - 0.8, waterY + 0.8, tipY - 0.3];
    for (const gx of [-girderX, girderX])
      for (let i = 0; i < 3; i++) {
        const [ya, yb] = [cuts[i]!, cuts[i + 1]!];
        const [za, zb] = [stayZ(ya), stayZ(yb)];
        cranePart(`stay${gx}${i}`, [gx, gx, ya, yb, zb, za], lines(seg([gx, ya, za], [gx, yb, zb], P), "sh-stay"));
      }
  }

  // Moving crane parts, built at trolley y = 0 and spreader bottom z = 0.
  const TROLLEY_HTML = (() => {
    const z0 = CRANE.trolleyZ;
    const t = boxOf(-3.2, -2.4, z0, 3.2, 2.4, z0 + 2.5, P);
    const ring: Plane[] = [[-3.2, -2.4], [3.2, -2.4], [3.2, 2.4], [-3.2, 2.4]];
    const wheels = [-1.6, 1.6].map((y) => seg([3.2, y - 0.5, z0 + 2.1], [3.2, y + 0.5, z0 + 2.1], P)).join("");
    return solid(t, "steel", lines(ringSeam(ring, z0 + 0.9, P) + wheels, "sh-l"));
  })();

  const CAB_HTML = (() => {
    const [x0, x1, y0, y1, z0, z1] = [2.0, 3.2, 0.4, 2.3, 33.0, CRANE.trolleyZ];
    const fy = nearY(y0, y1);
    const glass =
      quad([[x0 + 0.15, fy, z0 + 0.9], [x1 - 0.15, fy, z0 + 0.9], [x1 - 0.15, fy, z1 - 0.4], [x0 + 0.15, fy, z1 - 0.4]]) +
      quad([[x1, y0 + 0.2, z0 + 0.9], [x1, y1 - 0.2, z0 + 0.9], [x1, y1 - 0.2, z1 - 0.4], [x1, y0 + 0.2, z1 - 0.4]]);
    return solid(boxOf(x0, y0, z0, x1, y1, z1, P), "steel", lines(glass, "sh-win"));
  })();

  const SPREADER_HTML = (() => {
    const frameBox = boxOf(-BOX.l / 2, -BOX.w / 2, 0, BOX.l / 2, BOX.w / 2, 0.5, P);
    const ring: Plane[] = [[-BOX.l / 2, -BOX.w / 2], [BOX.l / 2, -BOX.w / 2], [BOX.l / 2, BOX.w / 2], [-BOX.l / 2, BOX.w / 2]];
    const head = boxOf(-1.8, -0.9, 0.5, 1.8, 0.9, 1.1, P);
    return solid(frameBox, "gold", lines(ringSeam(ring, 0.22, P), "sh-l")) + solid(head, "dark");
  })();

  /** The four hoist ropes from trolley sheaves to the headblock, for trolley y and spreader bottom z. */
  function ropesPath(ty: number, zs: number) {
    const out: string[] = [];
    for (const dx of [-1.4, 1.4]) for (const dy of [-0.55, 0.55]) out.push(seg([dx, ty + dy, CRANE.trolleyZ], [dx, ty + dy, zs + 1.1], P));
    return out.join("");
  }

  // ---------------------------------------------------------------- ships: parts drawn once, placed per berth

  /** Each ship part is one shared drawing, built at berth 0; ships place it with <use>. */
  const SHIP_PARTS: { box: number[]; id: string }[] = [];
  function shipPart(box: number[], html: string) {
    const id = ref(`sp-${SHIP_PARTS.length}`);
    DEFS.push(`<g id="${id}">${html}</g>`);
    SHIP_PARTS.push({ box, id });
  }

  /** Hull drawn from the waterline up, so it rises out of the water as the ship lightens. */
  function hullHtml(heave: number) {
    const boot = SHIP.bootTop;
    const band = loftOf(ringAt(-heave), 0, ringAt(boot), boot + heave, P);
    const side = loftOf(ringAt(boot), boot + heave, HULL_RING, SHIP.deck + heave, P);
    const nearSide = nearY(SHIP.y, SHIP.y + SHIP.beam);
    const deck = SHIP.deck + heave;
    const welds: string[] = [];
    for (let x = -50; x <= 28; x += 13) welds.push(seg([x, nearSide, boot + heave], [x, nearSide, deck - 0.5], P));
    const hawseZ = SHIP.deck - 1.1;
    const hawseX = 47;
    const onNear = (y: number) => (rear ? y < CL : y > CL);
    const hawseY = ringAt(hawseZ).reduce((best, [x, y]) => (onNear(y) && Math.abs(x - hawseX) < Math.abs(best[0] - hawseX) ? [x, y] : best), [0, 0] as Plane)[1];
    const hawse = ellipseOnFaceY(hawseX, hawseY, hawseZ + heave, 0.42, 12);
    const details = lines(ringSeam(ringAt(SHIP.deck - 0.5), deck - 0.5, P), "sh-hl") + lines(welds.join(""), "sh-hw") + lines(hawse, "sh-win");
    return solid(band, "rust") + solid(side, "hull", details);
  }

  {
    // Forecastle: raised bow deck with windlass, bitts and the foremast.
    const z0 = SHIP.deck;
    const fz = z0 + 2.4;
    const ring = hullRing(45, SHIP.half);
    // The forecastle continues the stem's rake up to its own deck.
    const raked: Plane[] = ring.map(([x, y]) => [45 + (x - 45) * (16.1 / 14), y]);
    const deck = loftOf(ring, z0, raked, fz, P);
    const kit = [
      solid(cylinderOf(51.5, CL - 2.4, 0.65, fz, 0.8, P, 14), "steel"),
      solid(cylinderOf(51.5, CL + 2.4, 0.65, fz, 0.8, P, 14), "steel"),
      solid(boxOf(51.1, CL - 1.7, fz, 51.9, CL + 1.7, fz + 0.5, P), "dark"),
      ...[-3.0, 3.0].flatMap((dy) => [solid(cylinderOf(47, CL + dy - 0.35, 0.22, fz, 0.6, P, 10), "dark"), solid(cylinderOf(47, CL + dy + 0.35, 0.22, fz, 0.6, P, 10), "dark")]),
      solid(cylinderOf(55.2, CL, 0.2, fz, 6.6, P, 10), "steel"),
      solid(boxOf(55.05, CL - 1.1, fz + 5.4, 55.35, CL + 1.1, fz + 5.6, P), "steel"),
    ];
    const seamRing: Plane[] = ring.map(([x, y]) => [45 + (x - 45) * (1 + (2.1 / 14) * ((2.4 - 0.35) / 2.4)), y]);
    shipPart([45, 61.2, SHIP.y, SHIP.y + SHIP.beam, z0, fz + 6.6], solid(deck, "hull", lines(ringSeam(seamRing, fz - 0.35, P), "sh-hl")) + kit.join(""));

    // Breakwater shielding the forward bay.
    const bx = [42.3, 43.1];
    const stiff: string[] = [];
    for (let y = SHIP.y + 2; y < SHIP.y + SHIP.beam - 1; y += 1.8) stiff.push(seg([bx[1]!, y, z0], [bx[1]!, y, z0 + 3.2], P));
    shipPart([bx[0]!, bx[1]!, SHIP.y + 0.6, SHIP.y + SHIP.beam - 0.6, z0, z0 + 3.2], solid(boxOf(bx[0]!, SHIP.y + 0.6, z0, bx[1]!, SHIP.y + SHIP.beam - 0.6, z0 + 3.2, P), "steel", lines(stiff.join(""), "sh-l")));

    // Hatch covers under each bay, panel joint at the 20 ft mark.
    for (let b = 0; b < BAYS; b++) {
      const [x0, x1, y0, y1] = [bayX(b) - 0.05, bayX(b) + BOX.l + 0.05, SHIP.y + 1.0, SHIP.y + SHIP.beam - 1.0];
      const joint = seg([(x0 + x1) / 2, y0, HATCH_TOP], [(x0 + x1) / 2, y1, HATCH_TOP], P) + seg([(x0 + x1) / 2, nearY(y0, y1), z0], [(x0 + x1) / 2, nearY(y0, y1), HATCH_TOP], P);
      shipPart([x0, x1, y0, y1, z0, HATCH_TOP], solid(boxOf(x0, y0, z0, x1, y1, HATCH_TOP, P), "deck", lines(joint, "sh-l")));
    }

    // Lashing bridges between bays: two posts, a walkway and its rail.
    for (let b = 0; b < BAYS; b++) {
      const [x0, x1] = [bayX(b) - 1.35, bayX(b) - 0.15];
      const [y0, y1] = [SHIP.y + 0.9, SHIP.y + SHIP.beam - 0.9];
      const top = 9.6;
      const posts = [y0, y1 - 0.7].map((y) => solid(boxOf(x0 + 0.2, y, z0, x1 - 0.2, y + 0.7, top, P), "steel")).join("");
      const frameLines: string[] = [];
      for (let r = 1; r < ROWS; r++) frameLines.push(seg([x1 - 0.2, shipRowY(r) - 0.05, z0], [x1 - 0.2, shipRowY(r) - 0.05, top], P));
      frameLines.push(seg([x1 - 0.2, y0 + 0.7, 7.1], [x1 - 0.2, y1 - 0.7, 7.1], P));
      const walk = solid(boxOf(x0, y0, top, x1, y1, top + 0.3, P), "steel");
      const rail: string[] = [seg([x1, y0, top + 1.1], [x1, y1, top + 1.1], P)];
      for (let y = y0; y <= y1 + 1e-6; y += (y1 - y0) / 7) rail.push(seg([x1, y, top + 0.3], [x1, y, top + 1.1], P));
      shipPart([x0, x1, y0, y1, z0, top + 1.1], lines(frameLines.join(""), "sh-l") + posts + walk + lines(rail.join(""), "sh-l"));
    }

    // Deck railing along the near side.
    {
      const y = nearY(SHIP.y + 0.15, SHIP.y + SHIP.beam - 0.15);
      const rail: string[] = [seg([-43, y, z0 + 1], [44, y, z0 + 1], P), seg([-43, y, z0 + 0.5], [44, y, z0 + 0.5], P)];
      for (let x = -43; x <= 44; x += 1.74) rail.push(seg([x, y, z0], [x, y, z0 + 1], P));
      shipPart([-43, 44, y, y, z0, z0 + 1], lines(rail.join(""), "sh-l"));
    }

    // Accommodation block, bridge, mast, funnel and lifeboat, all aft.
    const windowsY = (x0: number, x1: number, y: number, z: number) => {
      const out: string[] = [];
      for (let x = x0 + 0.9; x + 0.8 <= x1 - 0.5; x += 1.55) out.push(quad([[x, y, z], [x + 0.8, y, z], [x + 0.8, y, z + 0.85], [x, y, z + 0.85]]));
      return out.join("");
    };
    const windowsX = (y0: number, y1: number, x: number, z: number) => {
      const out: string[] = [];
      for (let y = y0 + 0.8; y + 0.8 <= y1 - 0.5; y += 1.55) out.push(quad([[x, y, z], [x, y + 0.8, z], [x, y + 0.8, z + 0.85], [x, y, z + 0.85]]));
      return out.join("");
    };
    {
      const [x0, x1, y0, y1, z1] = [-53.6, -44.2, SHIP.y + 1.0, SHIP.y + SHIP.beam - 1.0, 9.4];
      const ring: Plane[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const fy = nearY(y0, y1);
      const glass = windowsY(x0, x1, fy, z0 + 1.0) + windowsY(x0, x1, fy, z0 + 3.65) + windowsX(y0, y1, x1, z0 + 1.0) + windowsX(y0, y1, x1, z0 + 3.65);
      shipPart([x0, x1, y0, y1, z0, z1], solid(boxOf(x0, y0, z0, x1, y1, z1, P), "steel", lines(ringSeam(ring, z0 + 2.65, P), "sh-l") + lines(glass, "sh-win")));
    }
    {
      const [x0, x1, y0, y1, za, z1] = [-53.2, -44.6, SHIP.y + 2.0, SHIP.y + SHIP.beam - 2.0, 9.4, 17.4];
      const ring: Plane[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      let glass = "";
      for (const z of [za + 1.0, za + 3.65, za + 6.3]) glass += windowsY(x0, x1, nearY(y0, y1), z) + windowsX(y0, y1, x1, z);
      shipPart([x0, x1, y0, y1, za, z1], solid(boxOf(x0, y0, za, x1, y1, z1, P), "steel", lines(ringSeam(ring, za + 2.65, P) + ringSeam(ring, za + 5.3, P), "sh-l") + lines(glass, "sh-win")));
    }
    {
      const [x0, x1, y0, y1, za, z1] = [-52.6, -45.0, SHIP.y + 0.3, SHIP.y + SHIP.beam - 0.3, 17.4, 19.9];
      const fy = nearY(y0, y1);
      const band =
        quad([[x0 + 0.3, fy, za + 1.0], [x1 - 0.2, fy, za + 1.0], [x1 - 0.2, fy, za + 2.0], [x0 + 0.3, fy, za + 2.0]]) +
        quad([[x1, y0 + 0.3, za + 1.0], [x1, y1 - 0.3, za + 1.0], [x1, y1 - 0.3, za + 2.0], [x1, y0 + 0.3, za + 2.0]]);
      const mullions: string[] = [];
      for (let y = y0 + 1.2; y < y1 - 0.4; y += 1.0) mullions.push(seg([x1, y, za + 1.0], [x1, y, za + 2.0], P));
      const top = solid(boxOf(-52.0, CL - 3, z1, -46.4, CL + 3, z1 + 0.35, P), "steel");
      shipPart([x0, x1, y0, y1, za, z1 + 0.35], solid(boxOf(x0, y0, za, x1, y1, z1, P), "steel", lines(band, "sh-win") + lines(mullions.join(""), "sh-hl")) + top);
    }
    {
      const x = -49.4;
      const z1 = 20.25;
      const mast = solid(boxOf(x - 0.3, CL - 0.3, z1, x + 0.3, CL + 0.3, z1 + 6.4, P), "steel");
      const arm = solid(boxOf(x - 0.15, CL - 2.2, z1 + 5.2, x + 0.15, CL + 2.2, z1 + 5.45, P), "steel");
      const radar = solid(boxOf(x + 0.3, CL - 1.8, z1 + 3.1, x + 0.55, CL + 1.8, z1 + 3.35, P), "dark");
      shipPart([x - 0.3, x + 0.55, CL - 2.2, CL + 2.2, z1, z1 + 6.4], mast + radar + arm);
    }
    {
      const plan = { x: -57.8, y: CL - 1.7, w: 3.2, d: 3.4, r: 0.9 };
      const body = slabOf(plan, z0, 15.8, P, 5);
      const band = slabOf(plan, z0 + 15.8, 1.0, P, 5);
      const cap = slabOf(plan, z0 + 16.8, 0.8, P, 5);
      const pipes = [-0.6, 0.6].map((dy) => solid(cylinderOf(-56.6, CL + dy, 0.24, z0 + 17.6, 1.0, P, 10), "dark")).join("");
      shipPart([-57.8, -54.6, CL - 1.7, CL + 1.7, z0, z0 + 18.6], solid(body, "steel") + solid(band, "gold") + solid(cap, "dark") + pipes);
    }
    {
      const [x0, x1, y0, y1] = [-58.8, -55.0, SHIP.y + SHIP.beam - 3.6, SHIP.y + SHIP.beam - 1.2];
      const legs = [x0 + 0.6, x1 - 1.0].map((x) => solid(boxOf(x, y0 + 0.5, z0, x + 0.4, y1 - 0.5, 7.0, P), "steel")).join("");
      const hull = solid(slabOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: 1.1 }, 7.0, 1.2, P, 5), "rust");
      const canopy = solid(slabOf({ x: x0 + 0.5, y: y0 + 0.35, w: x1 - x0 - 1.0, d: y1 - y0 - 0.7, r: 0.8 }, 8.2, 0.7, P, 5), "rust");
      shipPart([x0, x1, y0, y1, z0, 8.9], legs + hull + canopy);
    }
  }

  /** Per ship: the hull (redrawn as it rises) and its click target's index order. */
  const HULL_ITEMS: number[] = [];
  for (let k = 0; k < SHIPS; k++) {
    HULL_ITEMS.push(add({ kind: "hull", ship: k }, HULL_BOX, ""));
    for (const part of SHIP_PARTS) add({ kind: "ship", ship: k }, part.box, `<use href="#${part.id}"/>`);
  }
  for (const [i, c] of CONTAINERS.entries()) {
    add({ kind: "box", box: i }, [0, BOX.l, 0, BOX.w, 0, BOX.h], `<use href="#${c.pair ? C20 : C40}" class="sh-k-${c.colour}"/>`);
  }

  /** Beacon dot drawn inside the apex item (local crane x = 0). */
  const BEACON_HTML = (() => {
    const [x, y] = iso(BEACON, P);
    return `<circle class="sh-beacon" cx="${num(x)}" cy="${num(y)}" r="1.6"/>`;
  })();

  // Cranes: shared parts via <use>, plus the trolley, cab, spreader and ropes of each.
  const CRANE_ITEMS: { trolley: number; cab: number; spreader: number; ropes: number; beacon: number }[] = [];
  for (let c = 0; c < CRANE_HOME.length; c++) {
    let beacon = -1;
    for (const part of CRANE_PARTS) {
      const at = add({ kind: "crane", crane: c }, part.box, `<use href="#${ref(`cr-${part.id}`)}"/>${part.id === "apex" ? BEACON_HTML : ""}`);
      if (part.id === "apex") beacon = at;
    }
    CRANE_ITEMS.push({
      trolley: add({ kind: "trolley", crane: c }, TROLLEY_BOX, TROLLEY_HTML),
      cab: add({ kind: "trolley", crane: c }, CAB_BOX, CAB_HTML),
      spreader: add({ kind: "spreader", crane: c }, SPREADER_BOX, SPREADER_HTML),
      ropes: add({ kind: "ropes", crane: c }, [0, 0, 0, 0, 0, 0], ""),
      beacon,
    });
  }

  // ---------------------------------------------------------------- terminal yard (static layer)

  function lightMast(x: number, y: number): { b: number[]; html: string } {
    const z = QUAY.top;
    const fy = nearY(y - 0.45, y + 0.45);
    const ring = (r: number) => Array.from({ length: 14 }, (_, i) => [x + r * Math.cos((i / 14) * Math.PI * 2), y + r * Math.sin((i / 14) * Math.PI * 2)] as Plane);
    const base = solid(boxOf(x - 0.8, y - 0.8, z, x + 0.8, y + 0.8, z + 0.7, P), "concrete");
    const pole = solid(cylinderOf(x, y, 0.28, z + 0.7, 24.3, P, 14), "steel", lines(ringSeam(ring(0.28), z + 9, P) + ringSeam(ring(0.28), z + 17, P), "sh-l"));
    const head = solid(
      boxOf(x - 1.5, y - 0.45, z + 25, x + 1.5, y + 0.45, z + 25.9, P),
      "steel",
      lines([-1, 0, 1].map((d) => quad([[x + d - 0.35, fy, z + 25.2], [x + d + 0.35, fy, z + 25.2], [x + d + 0.35, fy, z + 25.7], [x + d - 0.35, fy, z + 25.7]])).join(""), "sh-win"),
    );
    return { b: [x - 1.5, x + 1.5, y - 0.8, y + 0.8, z, z + 25.9], html: base + pole + head };
  }

  function office(x0: number, y0: number): { b: number[]; html: string } {
    const [x1, y1, z0] = [x0 + 9, y0 + 4.8, QUAY.top];
    const z1 = z0 + 6.6;
    const fy = nearY(y0, y1);
    const ring: Plane[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const glass: string[] = [];
    for (const z of [z0 + 1.1, z0 + 4.2]) {
      for (let x = x0 + 0.8; x + 1.1 <= x1 - 0.6; x += 1.7) glass.push(quad([[x, fy, z], [x + 1.1, fy, z], [x + 1.1, fy, z + 1.2], [x, fy, z + 1.2]]));
      for (let y = y0 + 0.8; y + 1.1 <= y1 - 0.6; y += 1.7) glass.push(quad([[x1, y, z], [x1, y + 1.1, z], [x1, y + 1.1, z + 1.2], [x1, y, z + 1.2]]));
    }
    const door = quad([[x0 + 1.2, fy, z0], [x0 + 2.6, fy, z0], [x0 + 2.6, fy, z0 + 2.2], [x0 + 1.2, fy, z0 + 2.2]]);
    const body = solid(boxOf(x0, y0, z0, x1, y1, z1, P), "steel", lines(ringSeam(ring, z0 + 3.1, P), "sh-l") + lines(glass.join("") + door, "sh-win"));
    const parapet = lines(poly([[x0 + 0.3, y0 + 0.3, z1], [x1 - 0.3, y0 + 0.3, z1], [x1 - 0.3, y1 - 0.3, z1], [x0 + 0.3, y1 - 0.3, z1]], P, true), "sh-l");
    const plant = solid(boxOf(x0 + 1.5, y0 + 1.2, z1, x0 + 4.2, y0 + 3.2, z1 + 1.1, P), "steel") + solid(boxOf(x0 + 5.2, y0 + 1.5, z1, x0 + 6.6, y0 + 2.9, z1 + 0.8, P), "steel");
    return { b: [x0, x1, y0, y1, z0, z1 + 1.1], html: body + parapet + plant };
  }

  /**
   * The standing yard: stacks behind the crane rails all along the strip (deep rows everywhere, the
   * near rows only between berths, where no ship unloads), with light masts along the back edge and
   * an office. Everything here sits behind (lower y than) the crane legs and below the crane
   * girders, so the whole layer is pre-sorted once and drawn before the sorted parts (from the
   * sea), or after them (from behind the quay, where it is the nearest thing in view).
   */
  /** World boxes of the standing yard, for the depth proof (they must never need to cover a sorted part). */
  const STATIC_BOXES: number[][] = [];

  function standingYard() {
    const rand = rng(1021);
    const placed: { b: number[]; html: string }[] = [];
    const freeOfSlots = (x0: number, x1: number) => SLOT_SPANS.every(([a, b]) => x1 <= a - YARD_GAP || x0 >= b + YARD_GAP);
    const clearOfOffice = (x0: number, x1: number, y: number) => y + BOX.w < OFFICE_AT[1] + 4.8 + 0.5 && y > OFFICE_AT[1] - 0.5 ? x1 <= OFFICE_AT[0] - 0.5 || x0 >= OFFICE_AT[0] + 9.5 : true;
    for (let bx = QUAY.x1 - BOX.l - 2; bx > QUAY.x0; bx -= BOX.l + 1.6) {
      for (let r = 0; r < ROWS + 3; r++) {
        const y = yardRowY(r);
        if (r < ROWS && !freeOfSlots(bx, bx + BOX.l)) continue;
        if (!clearOfOffice(bx, bx + BOX.l, y)) continue;
        if (y < QUAY.back + 0.6) continue;
        const roll = rand();
        const tiers = roll < 0.22 ? 0 : roll < 0.55 ? 1 : roll < 0.85 ? 2 : 3;
        for (let t = 0; t < tiers; t++) {
          const z = yardTierZ(t);
          const b = [bx, bx + BOX.l, y, y + BOX.w, z, z + BOX.h];
          if (!visible(bx, y, z) && !visible(bx + BOX.l, y + BOX.w, z + BOX.h)) continue;
          placed.push({ b, html: `<use href="#${YARD_BOX}" class="sh-k-${pickColour(rand, YARD_COLOURS)}" transform="${shift([bx, y, z])}"/>` });
        }
      }
    }
    for (let x = QUAY.x1 - 20; x > QUAY.x0; x -= 64) {
      const mast = lightMast(x, QUAY.back + 1.2);
      if (visible(x, QUAY.back) && clearOfCopy(mast.b)) placed.push(mast);
    }
    placed.push(office(OFFICE_AT[0], OFFICE_AT[1]));
    for (const p of placed) STATIC_BOXES.push(p.b);
    const prio = new Int32Array(placed.length).map((_, i) => i);
    const sorter = new DepthSorter(placed.length, prio, [view[0], view[1], view[2]], P.azimuth, P.elevation);
    placed.forEach((p, i) => {
      sorter.boxes.set(p.b, i * 6);
      sorter.measure(i);
    });
    sorter.solve();
    return Array.from(sorter.order, (i) => placed[i]!.html).join("");
  }

  // ---------------------------------------------------------------- static markup

  const PILES_HTML = pilesHtml();
  const BASE_HTML = rear ? "" : quayBase();
  const YARD_HTML = standingYard();
  const DEFS_HTML = `<defs>${DEFS.join("")}</defs>`;
  /** Mooring lines of one ship at berth 0 (each ship's group is shifted to its berth). */
  const MOORING_HTML = MOORING.map((m) => `<path class="sh-moor" pathLength="1" d="${mooringPath(m)}"/>`).join("");

  /**
   * Seen from behind, the sea beyond the quay drawn the way the hero's ocean is: a staggered dot
   * lattice on the water plane, about 15 css px apart at desktop size. This camera has no horizon,
   * so the rows thin out with distance and are gone before they would climb behind the cranes.
   */

  /**
   * How far along the quay (world -x, from its berth) a ship starts so that, at lateral offset `dy`,
   * its nearest point is a full ship length past the right edge of the box: entirely off screen.
   */
  function approachStartX(berth: number, dy: number) {
    const pts: Point3[] = [];
    for (const x of [-SHIP.half - 1, SHIP.half + 2]) for (const y of [SHIP.y, SHIP.y + SHIP.beam]) for (const z of [0, 27]) pts.push([berth + x, y, z]);
    const xs = (dx: number, oy: number) => pts.map(([x, y, z]) => iso([x + dx, y + oy, z], P)[0]);
    const rest = xs(0, 0);
    const length = Math.max(...rest) - Math.min(...rest);
    // Screen units per metre of world -x (world +x runs to the left in both cameras).
    const k = -axisVector(P, [1, 0, 0])[0];
    return -(VIEW_W + length - Math.min(...xs(0, dy))) / k;
  }

  /** Screen silhouette of a ship at berth 0 (hull and everything on it), for its click target. */
  const SHIP_HIT = (() => {
    const pts: Point3[] = [];
    for (const [x, y] of HULL_RING) pts.push([x, y, 0], [x, y, SHIP.deck]);
    const stackTop = shipTierZ(TIERS) + 0.2;
    for (const x of [bayX(0), bayX(BAYS - 1) + BOX.l]) for (const y of [shipRowY(0), shipRowY(ROWS - 1) + BOX.w]) pts.push([x, y, stackTop]);
    for (const x of [-53.6, -44.2]) for (const y of [SHIP.y + 0.3, SHIP.y + SHIP.beam - 0.3]) pts.push([x, y, 20.3]);
    pts.push([-49.4, CL, 26.6], [-56.2, CL, 22.6], [55.2, CL, 13]);
    return pathOf(convexHull(pts.map((p) => iso(p, P))), true);
  })();

  return {
    frame,
    P,
    rear,
    VIEW_W,
    VIEW_H,
    ITEMS,
    HULL_ITEMS,
    CRANE_ITEMS,
    PILE_XS,
    STATIC_BOXES,
    PILES_HTML,
    BASE_HTML,
    YARD_HTML,
    DEFS_HTML,
    MOORING_HTML,
    SHIP_HIT,
    shift,
    hullHtml,
    ropesPath,
    approachStartX,
  };
}

export type Scene = ReturnType<typeof buildScene>;

// ---------------------------------------------------------------- the hero's camera

/** Light from the upper left of the mirrored picture: lit ends, broadsides a step darker. */
const LIGHT: Plane = [0.906, -0.423];

/** Units per metre, and where the middle berth's quay edge (deck level) sits on screen. */
const SCALE = 3.6;
const MIDDLE_AT: Flat = [720, 697];

const HERO_P: Projection = (() => {
  const unit: Projection = { origin: [0, 0], scale: 1, azimuth: AZIMUTH, elevation: ELEVATION, mirror: true, light: LIGHT };
  const [mx, my] = iso([0, 0, QUAY.top], unit);
  return { ...unit, scale: SCALE, origin: [MIDDLE_AT[0] - mx * SCALE, MIDDLE_AT[1] - my * SCALE] };
})();

/**
 * True when a world box's silhouette stays out of the copy at rest. Low parts only have to clear
 * LOW_ZONE when berthed or idle (`low`); in passing they may run under it.
 */
export function clearOfCopy(b: number[], low = true) {
  const pts: Flat[] = [];
  for (const x of [b[0]!, b[1]!]) for (const y of [b[2]!, b[3]!]) for (const z of [b[4]!, b[5]!]) pts.push(iso([x, y, z], HERO_P));
  const hull = convexHull(pts);
  // Separating axes between the silhouette (convex) and the zone (a rectangle open at the top).
  const clear = (zone: { x0: number; x1: number; y1: number }) => {
    const rect: Flat[] = [[zone.x0, -1e4], [zone.x1, -1e4], [zone.x1, zone.y1], [zone.x0, zone.y1]];
    const axes: Flat[] = [[1, 0], [0, 1]];
    for (let i = 0; i < hull.length; i++) {
      const [ax, ay] = hull[i]!;
      const [bx, by] = hull[(i + 1) % hull.length]!;
      axes.push([ay - by, bx - ax]);
    }
    return axes.some(([nx, ny]) => {
      const span = (list: Flat[]) => list.map(([x, y]) => x * nx + y * ny);
      const h = span(hull);
      const r = span(rect);
      return Math.max(...h) <= Math.min(...r) || Math.max(...r) <= Math.min(...h);
    });
  };
  return (!low || clear(LOW_ZONE)) && (b[5]! <= LOW_TOP || clear(TALL_ZONE));
}

export const HERO = buildScene({
  id: "sh",
  P: HERO_P,
  w: VIEW_W,
  h: VIEW_H,
  piles: true,
  // The smaller figure exposes the drawing beyond its viewBox on wide hero viewports.
  visible: ([sx, sy]) => sx > -900 && sx < VIEW_W + 900 && sy < VIEW_H + 20,
  clearOfCopy,
});

export const P = HERO.P;
export const ITEMS = HERO.ITEMS;
export const STATIC_BOXES = HERO.STATIC_BOXES;

// ---------------------------------------------------------------- the strip's camera

/**
 * The depth section's closing strip: the same harbour seen from the land side, looking straight
 * out to sea along +y with the camera low (about level with the ships' stacks), so the yard and
 * cranes stand in front and the ships lie beyond them. Light from the viewer's right and above.
 */
export const REAR_ELEVATION = 11;
export const REAR_W = 1440;
const REAR_SCALE = 3.6;

export const REAR = (() => {
  const unit: Projection = { origin: [0, 0], scale: 1, azimuth: -90, elevation: REAR_ELEVATION, light: [0.906, 0.423] };
  // Frame from the crane apex down to the foot of the quay's landward face, berth 1 centred.
  const top = iso([0, CRANE.landY, CRANE.apexZ + 3], unit)[1];
  const bottom = iso([0, QUAY.back, QUAY.under], unit)[1];
  const pad = 4;
  const h = Math.ceil((bottom - top) * REAR_SCALE + pad * 2);
  const P: Projection = { ...unit, scale: REAR_SCALE, origin: [REAR_W / 2, pad - top * REAR_SCALE] };
  return buildScene({
    id: "shr",
    P,
    w: REAR_W,
    h,
    piles: false,
    visible: ([sx, sy]) => sx > -260 && sx < REAR_W + 260 && sy > -20 && sy < h + 20,
  });
})();
