// Runtime for the harbour: one rAF loop that advances the simulation (sim.ts), poses every part,
// re-sorts the painter's order when anything moves, and writes attributes on existing nodes.
// One engine per camera (scene.ts): the hero's, where ships wait for a click, and the depth
// section's strip, where they unload on their own at the cranes' real pace.

import { DepthSorter, applyOrder } from "./depth";
import { type Point3, viewOf } from "./iso";
import { BERTHS, CRANE, HERO, HULL_BOX, PILE, REAR, SHIP, SHIPS, SHIP_BOXES, type Scene, halfWidth } from "./scene";
import { type Phase, type Pose, Harbor } from "./sim";
import { approachesFor, smoothstep } from "./timeline";
import { WAKE_LEVELS, Wake } from "./wake";

const CL = SHIP.y + SHIP.beam / 2;
const NAMES = ["left", "middle", "right"];
const label = (k: number, state: string) => `Container ship at the ${NAMES[k] ?? k + 1} berth, ${state}`;

export interface EngineOptions {
  /** Ships are buttons that start their unloading (the hero); otherwise each unloads once berthed. */
  interactive: boolean;
}

/** Everything one camera needs: its initial markup and the live controller. */
export function createEngine(scene: Scene, { interactive }: EngineOptions) {
  const { ITEMS, CRANE_ITEMS, HULL_ITEMS, PILE_XS, P, VIEW_W, shift, hullHtml, ropesPath } = scene;
  const N = ITEMS.length;
  const approaches = approachesFor(scene);
  const newHarbor = () => new Harbor(approaches, interactive);

  // ---------------------------------------------------------------- pose → item boxes

  /** Screen offset of each item (world vector) and its world box, written into `boxes`. */
  function placeItems(pose: Pose, offsets: Float64Array, boxes: Float64Array) {
    for (let i = 0; i < N; i++) {
      const item = ITEMS[i]!;
      const o = item.owner;
      let ox = 0;
      let oy = 0;
      let oz = 0;
      let box = item.box;
      switch (o.kind) {
        case "ship": {
          const s = pose.ships[o.ship]!;
          ox = BERTHS[o.ship]! + s.dx;
          oy = s.dy;
          oz = s.heave;
          break;
        }
        case "hull": {
          // The hull is redrawn from the waterline up, so only x and y move it.
          const s = pose.ships[o.ship]!;
          ox = BERTHS[o.ship]! + s.dx;
          oy = s.dy;
          box = [box[0]!, box[1]!, box[2]!, box[3]!, 0, HULL_BOX[5]! + s.heave];
          break;
        }
        case "crane":
          ox = pose.cranes[o.crane]!.x;
          break;
        case "trolley":
          ox = pose.cranes[o.crane]!.x;
          oy = pose.cranes[o.crane]!.y;
          break;
        case "spreader":
          ox = pose.cranes[o.crane]!.x;
          oy = pose.cranes[o.crane]!.y;
          oz = pose.cranes[o.crane]!.z;
          break;
        case "ropes": {
          const c = pose.cranes[o.crane]!;
          ox = c.x;
          box = [-1.4, 1.4, c.y - 0.55, c.y + 0.55, c.z + 1.1, CRANE.trolleyZ];
          break;
        }
        case "box":
          ox = pose.boxes[o.box * 3]!;
          oy = pose.boxes[o.box * 3 + 1]!;
          oz = pose.boxes[o.box * 3 + 2]!;
          break;
      }
      offsets[i * 3] = ox;
      offsets[i * 3 + 1] = oy;
      offsets[i * 3 + 2] = oz;
      const k = i * 6;
      boxes[k] = box[0]! + ox;
      boxes[k + 1] = box[1]! + ox;
      boxes[k + 2] = box[2]! + oy;
      boxes[k + 3] = box[3]! + oy;
      boxes[k + 4] = box[4]! + oz;
      boxes[k + 5] = box[5]! + oz;
    }
  }

  // Fixed tie-break priority: rest centre depth, so unrelated parts keep a stable DOM order.
  const PRIO = (() => {
    const v = viewOf(P);
    const depth = ITEMS.map((it) => (it.box[0]! + it.box[1]!) * v[0] + (it.box[2]! + it.box[3]!) * v[1] + (it.box[4]! + it.box[5]!) * v[2]);
    const order = depth.map((_, i) => i).sort((a, b) => depth[a]! - depth[b]! || a - b);
    const prio = new Int32Array(N);
    order.forEach((item, rank) => (prio[item] = rank));
    return prio;
  })();

  function makeSorter() {
    const v = viewOf(P);
    return new DepthSorter(N, PRIO, [v[0], v[1], v[2]], P.azimuth, P.elevation);
  }

  function measureAll(sorter: DepthSorter) {
    for (let i = 0; i < N; i++) sorter.measure(i);
  }

  /** Pure internals, exported for the offline depth check. */
  const internals = { placeItems, makeSorter, measureAll, newHarbor };

  // ---------------------------------------------------------------- initial markup (server and first client render)

  const MARKUP = (() => {
    const harbor = newHarbor();
    const offsets = new Float64Array(N * 3);
    const sorter = makeSorter();
    placeItems(harbor.pose, offsets, sorter.boxes);
    measureAll(sorter);
    sorter.solve();
    const items = Array.from(sorter.order, (i) => {
      const item = ITEMS[i]!;
      const o = item.owner;
      const html =
        o.kind === "hull"
          ? hullHtml(0)
          : o.kind === "ropes"
            ? `<path class="sh-rope" d="${ropesPath(harbor.pose.cranes[o.crane]!.y, harbor.pose.cranes[o.crane]!.z)}"/>`
            : item.html;
      const off: Point3 = [offsets[i * 3]!, offsets[i * 3 + 1]!, offsets[i * 3 + 2]!];
      return `<g data-i="${i}" transform="${shift(off)}">${html}</g>`;
    }).join("");
    const moors = BERTHS.map((berth, k) => `<g data-moor="${k}" transform="${shift([berth, 0, 0])}">${scene.MOORING_HTML}</g>`).join("");
    const hits = interactive
      ? harbor.pose.ships
          .map((s, k) => `<path class="sh-hit" data-ship="${k}" role="button" tabindex="0" aria-label="${label(k, "on its way in. Activate to unload its containers onto the quay.")}" d="${scene.SHIP_HIT}" transform="${shift([BERTHS[k]! + s.dx, s.dy, 0])}"/>`)
          .join("")
      : "";
    return (
      scene.DEFS_HTML +
      `<g class="sh-moors">${moors}</g>` +
      `<g class="sh-items">${items}</g>` +
      hits
    );
  })();

  // Cache the stationary artwork together; all harbour layers remain above the ocean. Seen from
  // behind, the standing yard is the nearest thing in view, so it goes on a layer over the drawing
  // (the strip's sea is a live ocean canvas, under everything).
  const STATIC_MARKUP = scene.rear ? "" : `<g class="sh-piles">${scene.PILES_HTML}</g><g class="sh-base">${scene.BASE_HTML}${scene.YARD_HTML}</g>`;
  const FRONT_MARKUP = scene.rear ? scene.YARD_HTML : "";

  /**
   * The wake lives in its own svg under the drawing, composited apart: it changes every frame, and
   * redrawing it inside the drawing would make the browser re-record every part of the harbour.
   */
  const WAKE_MARKUP = WAKE_LEVELS.map(([r, a]) => `<path class="sh-dot" stroke-opacity="${a}" style="stroke-width:${r * 2}px" d=""/>`).join("");

  // ---------------------------------------------------------------- live controller

  function createHarbor(svg: SVGSVGElement, waterSvg: SVGSVGElement, options: HarborOptions) {
    const layer = svg.querySelector<SVGGElement>(".sh-items")!;
    const els: SVGGElement[] = new Array(N);
    for (const el of Array.from(layer.children) as SVGGElement[]) els[Number(el.dataset.i)] = el;
    const hits = Array.from(svg.querySelectorAll<SVGPathElement>(".sh-hit"));
    const dots = Array.from(waterSvg.querySelectorAll<SVGPathElement>(".sh-dot"));
    const moors = BERTHS.map((_, k) => Array.from(svg.querySelectorAll<SVGPathElement>(`[data-moor="${k}"] .sh-moor`)));
    const beacons = CRANE_ITEMS.map((c) => els[c.beacon]!.querySelector<SVGCircleElement>(".sh-beacon"));
    const ropes = CRANE_ITEMS.map((c) => els[c.ropes]!.firstElementChild as SVGPathElement);

    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const harbor = newHarbor();
    harbor.reduced = reducedQuery.matches;
    const { pose } = harbor;

    const sorter = makeSorter();
    sorter.order = new Int32Array(Array.from(layer.children, (el) => Number((el as SVGGElement).dataset.i)));
    const offsets = new Float64Array(N * 3);
    const transforms: string[] = Array.from(els, (el) => el.getAttribute("transform") ?? "");
    const lastOffsets = new Float64Array(N * 3).fill(NaN);
    const lastBoxes = new Float64Array(N * 6).fill(NaN);
    const wake = new Wake();
    const hullHeave = new Float64Array(SHIPS).fill(NaN);
    const hullPaths = HULL_ITEMS.map((i) => Array.from(els[i]!.querySelectorAll<SVGPathElement>("path")));
    const hullCache = new Map<number, string[]>();
    const hitTransforms = hits.map(() => "");
    const ropeD = CRANE_ITEMS.map(() => "");
    const moorStyles = moors.map((lines) => lines.map(() => ""));
    const beaconOpacity = beacons.map(() => "");

    let paused = options.paused;
    let visible = false;
    let clock = 0;
    let last = 0;
    let raf = 0;
    // Development-only sampling: delivered frame cadence, including browser scheduling stalls.
    const frameGaps: number[] | undefined = process.env.NODE_ENV === "development" ? [] : undefined;
    let frameCpu = 0;

    const summary = (): Phase => {
      const p = harbor.phases;
      if (p.every((x) => x === "waiting")) return "waiting";
      if (p.some((x) => x === "approach")) return "approach";
      if (p.some((x) => x === "unloading")) return "unloading";
      if (p.every((x) => x === "unloaded")) return "unloaded";
      return "berthed";
    };
    harbor.onPhase = (k, phase) => {
      if (!interactive) {
        // No clicks here: each ship is worked as soon as it is alongside, in the order they berth.
        if (phase === "berthed") harbor.request(k);
        svg.dataset.phase = summary();
        return;
      }
      const hit = hits[k]!;
      hit.dataset.phase = phase;
      svg.dataset.phase = summary();
      if (phase === "berthed") hit.setAttribute("aria-label", label(k, "alongside. Activate to unload its containers onto the quay."));
      if (phase === "unloading") options.announce(`Unloading the ship at the ${NAMES[k]} berth: two cranes are moving its containers onto the quay.`);
      if (phase === "unloaded") {
        options.announce(`Unloaded: ${SHIP_BOXES} containers are on the quay at the ${NAMES[k]} berth.`);
        hit.setAttribute("aria-disabled", "true");
        hit.setAttribute("aria-label", label(k, `unloaded. ${SHIP_BOXES} containers are on the quay.`));
      }
    };

    function update(dt: number) {
      clock += dt;
      harbor.advance(dt);
      if (!harbor.reduced) emitWake(dt);
      wake.advance(dt);
    }

    function emitWake(dt: number) {
      const r = () => wake.random();
      pose.ships.forEach((ship, k) => {
        const speed = Math.hypot(ship.vx, ship.vy);
        const sx = BERTHS[k]! + ship.dx;
        const sy = ship.dy;
        const shed = (perMetre: number, emit: () => void) => {
          // Capped per frame: far out the ships are fast and off screen, and dots there are wasted.
          for (let n = Math.min(4, speed * dt * perMetre); n > 0; n--) if (r() < n) emit();
        };
        // Bow wave: shed from the stem shoulder at one lateral speed, so the world-fixed dots draw two
        // clean arms whose angle opens as the ship slows.
        shed(3.2, () => {
          const side = r() < 0.65 ? 1 : -1;
          const x = 53 + r() * 2.5;
          const out = Math.min(6, Math.max(0.6, 0.42 * speed)) * (0.82 + 0.18 * r());
          wake.emit(x + sx, CL + side * (halfWidth(x) + 0.3) + sy, 0, side * out + 0.25 * ship.vy, 3.0 + r(), 0.62);
        });
        // A weaker shoulder wave where the hull reaches full beam.
        shed(1.4, () => {
          const x = 33 + r() * 3;
          wake.emit(x + sx, CL + SHIP.beam / 2 + 0.3 + sy, 0, Math.min(3, 0.2 * speed) * (0.9 + 0.1 * r()) + 0.25 * ship.vy, 2.6 + r(), 0.42);
        });
        // Propeller wash: a dense band astern, drifting back and spreading.
        shed(5.5, () => {
          const y = CL + (r() - 0.5) * 9;
          wake.emit(-SHIP.half - 0.4 + sx, y + sy, -(0.1 * speed + r() * 0.9), (y - CL) * 0.12 + (r() - 0.5) * 0.5, 3.6 + r() * 1.6, 0.5 + 0.12 * r());
        });
        // Once alongside, a faint lap along the waterline.
        if (harbor.phases[k] !== "approach" && harbor.phases[k] !== "waiting") {
          for (let n = dt * 1.2; n > 0; n--) {
            if (r() >= n) continue;
            const x = -56 + r() * 86;
            wake.emit(x + sx, CL + SHIP.beam / 2 + 0.5 + sy, (r() - 0.5) * 0.3, 0.18 + r() * 0.2, 2.6 + r() * 1.5, 0.3);
          }
        }
      });
      // Rings of lap round the piles, steady whatever the ships do.
      for (let n = PILE_XS.length ? dt * 3 : 0; n > 0; n--) {
        if (r() >= n) continue;
        const x = PILE_XS[Math.floor(r() * PILE_XS.length)]!;
        const a = r() * Math.PI;
        wake.emit(x + Math.cos(a) * 0.9, PILE.y + Math.sin(a) * 0.9, Math.cos(a) * 0.25, Math.sin(a) * 0.25, 2.4 + r(), 0.28);
      }
    }

    function render() {
      placeItems(pose, offsets, sorter.boxes);
      let moved = false;
      for (let i = 0; i < N; i++) {
        const p = i * 3;
        if (offsets[p] !== lastOffsets[p] || offsets[p + 1] !== lastOffsets[p + 1] || offsets[p + 2] !== lastOffsets[p + 2]) {
          const t = shift([offsets[p]!, offsets[p + 1]!, offsets[p + 2]!]);
          if (t !== transforms[i]) {
            transforms[i] = t;
            els[i]!.setAttribute("transform", t);
          }
          lastOffsets[p] = offsets[p]!;
          lastOffsets[p + 1] = offsets[p + 1]!;
          lastOffsets[p + 2] = offsets[p + 2]!;
        }
        // Re-sort when a part moves, ignoring the ships' swell (a few cm never changes the order).
        const k = i * 6;
        const kind = ITEMS[i]!.owner.kind;
        const dz = kind === "ship" || kind === "hull" ? 0 : 1;
        if (sorter.boxes[k] !== lastBoxes[k] || sorter.boxes[k + 2] !== lastBoxes[k + 2] || (dz && sorter.boxes[k + 4] !== lastBoxes[k + 4])) {
          moved = true;
          lastBoxes[k] = sorter.boxes[k]!;
          lastBoxes[k + 2] = sorter.boxes[k + 2]!;
          lastBoxes[k + 4] = sorter.boxes[k + 4]!;
        }
      }
      pose.ships.forEach((ship, k) => {
        if (ship.heave === hullHeave[k]) return;
        hullHeave[k] = ship.heave;
        let paths = hullCache.get(ship.heave);
        if (!paths) {
          paths = Array.from(hullHtml(ship.heave).matchAll(/\sd="([^"]*)"/g), (m) => m[1]!);
          if (hullCache.size >= 128) hullCache.delete(hullCache.keys().next().value!);
          hullCache.set(ship.heave, paths);
        }
        hullPaths[k]!.forEach((path, i) => {
          if (path.getAttribute("d") !== paths[i]) path.setAttribute("d", paths[i]!);
        });
      });
      pose.cranes.forEach((c, k) => {
        const d = ropesPath(c.y, c.z);
        if (d !== ropeD[k]) {
          ropeD[k] = d;
          ropes[k]!.setAttribute("d", d);
        }
      });
      if (moved) {
        measureAll(sorter);
        if (sorter.solve()) applyOrder(layer, els, sorter.order);
      }
      const levels = wake.paths(P);
      dots.forEach((el, k) => {
        if (el.getAttribute("d") !== levels[k]) el.setAttribute("d", levels[k]!);
      });
      moors.forEach((lines, k) => {
        const berthed = harbor.phases[k] !== "approach" && harbor.phases[k] !== "waiting";
        if (berthed) moorAt[k] ??= clock;
        lines.forEach((el, j) => {
          const m = !berthed ? 0 : harbor.reduced ? 1 : smoothstep(0, 1.2, clock - moorAt[k]! - j * 0.25);
          const dash = (1 - m).toFixed(3), opacity = m > 0 ? "1" : "0";
          const style = `${dash}:${opacity}`;
          if (style !== moorStyles[k]![j]) {
            moorStyles[k]![j] = style;
            el.style.strokeDashoffset = dash;
            el.style.opacity = opacity;
          }
        });
      });
      beacons.forEach((el, k) => {
        if (!el) return;
        // A short warm flash every 2.4 s, cranes out of step.
        const p = (clock + k * 0.9) % 2.4;
        const o = harbor.reduced ? 1 : 0.25 + 0.75 * Math.max(0, 1 - Math.abs(p - 0.2) / 0.2);
        const opacity = o.toFixed(2);
        if (opacity !== beaconOpacity[k]) { beaconOpacity[k] = opacity; el.style.opacity = opacity; }
      });
      hits.forEach((hit, k) => {
        const s = pose.ships[k]!;
        const ht = shift([BERTHS[k]! + s.dx, s.dy, s.heave]);
        if (ht !== hitTransforms[k]) {
          hitTransforms[k] = ht;
          hit.setAttribute("transform", ht);
        }
      });
    }
    /** When each ship's mooring lines start drawing in (the moment it berths). */
    const moorAt: number[] = [];

    const running = () => visible && !paused && !document.hidden && !harbor.reduced && harbor.started;

    function frame(now: number) {
      raf = 0;
      // Runs at the display's refresh rate; everything advances by elapsed time.
      const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
      if (frameGaps && last) {
        frameGaps.push(now - last);
        if (frameGaps.length === 180) {
          const sorted = [...frameGaps].sort((a, b) => a - b);
          svg.dataset.frameStats = JSON.stringify({ phase: summary(), fps: +(180000 / frameGaps.reduce((a, b) => a + b, 0)).toFixed(1), p95Ms: +sorted[171]!.toFixed(1), over25Ms: frameGaps.filter((n) => n > 25).length, cpuMs: +(frameCpu / 180).toFixed(2) });
          frameGaps.length = 0;
          frameCpu = 0;
        }
      }
      last = now;
      const cpuStart = frameGaps ? performance.now() : 0;
      update(dt);
      render();
      if (frameGaps) frameCpu += performance.now() - cpuStart;
      kick();
    }

    function kick() {
      if (!running()) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
        if (frameGaps) frameGaps.length = 0;
        frameCpu = 0;
      } else if (!raf) raf = requestAnimationFrame(frame);
    }

    /** One still frame (reduced motion, or a state change while stopped). */
    function still() {
      update(0);
      render();
    }

    function trigger(k: number) {
      if (!harbor.request(k)) return;
      if (harbor.phases[k] !== "berthed" || harbor.working >= 0) options.announce(`The ship at the ${NAMES[k]} berth will be unloaded when it is alongside and the cranes are free.`);
      if (harbor.reduced) still();
      kick();
    }

    const shipOf = (e: Event) => Number((e.currentTarget as SVGElement).dataset.ship);
    const onClick = (e: Event) => trigger(shipOf(e));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        trigger(shipOf(e));
      }
    };
    const onVisibility = () => kick();
    const onReduced = () => {
      harbor.reduced = reducedQuery.matches;
      still();
      kick();
    };
    for (const hit of hits) {
      hit.addEventListener("click", onClick);
      hit.addEventListener("keydown", onKey);
    }
    document.addEventListener("visibilitychange", onVisibility);
    reducedQuery.addEventListener("change", onReduced);
    // Match the ocean's 15 css px dot pitch along the harbour's projected world axes.
    const sinA = Math.sin((P.azimuth * Math.PI) / 180);
    const cosA = Math.cos((P.azimuth * Math.PI) / 180);
    const sinE = Math.sin((P.elevation * Math.PI) / 180);
    const fitLattice = () => {
      const pxPerUnit = svg.getBoundingClientRect().width / VIEW_W || 1;
      wake.setStep(15 / (pxPerUnit * P.scale * Math.hypot(sinA, cosA * sinE)), 15 / (pxPerUnit * P.scale * Math.hypot(cosA, sinA * sinE)));
    };
    fitLattice();
    const resize = new ResizeObserver(fitLattice);
    resize.observe(svg);
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1]!.isIntersecting;
        kick();
      },
      { rootMargin: "120px 0px" },
    );
    io.observe(svg);

    svg.dataset.phase = "waiting";
    if (options.start) harbor.start();
    still();

    return {
      setStart(next: boolean) {
        if (next && !harbor.started) {
          harbor.start(); // one-way: once sailing, they arrive
          still();
        }
        kick();
      },
      setPaused(next: boolean) {
        paused = next;
        kick();
      },
      destroy() {
        if (raf) cancelAnimationFrame(raf);
        io.disconnect();
        resize.disconnect();
        for (const hit of hits) {
          hit.removeEventListener("click", onClick);
          hit.removeEventListener("keydown", onKey);
        }
        document.removeEventListener("visibilitychange", onVisibility);
        reducedQuery.removeEventListener("change", onReduced);
      },
    };
  }

  return { MARKUP, STATIC_MARKUP, FRONT_MARKUP, WAKE_MARKUP, createHarbor, internals };
}

export interface HarborOptions {
  start: boolean;
  paused: boolean;
  announce: (text: string) => void;
}

export type Engine = ReturnType<typeof createEngine>;

export const HERO_ENGINE = createEngine(HERO, { interactive: true });
export const REAR_ENGINE = createEngine(REAR, { interactive: false });

/** The hero's engine under its original names (the depth proof and ShipHarbor use these). */
export const { MARKUP, STATIC_MARKUP, WAKE_MARKUP, createHarbor, internals } = HERO_ENGINE;
