"use client";

import { memo, useEffect, useRef } from "react";
import { gsap, ScrollTrigger, SplitText } from "@/lib/landing/motion";
import { ButtonLink } from "../Button";
import { getLenis } from "../SmoothScroll";
import "../ship/ShipHarbor.css";
import { BOOK_DROP, BUOY_DROP, DIAL, JAW_OPEN, LIFT, PIECES, SHIP_DROP, TILE_DROP, VIEW, needleOf, screenOf } from "./figure";

const LAYERS = [
  {
    title: "The port",
    body: "Every major and private Indian port’s latest scale of rates, with its berths, depths and dues, kept current as tariffs change.",
    cta: ["See covered ports", "#ports"],
  },
  {
    title: "The vessel",
    body: "Enter an IMO number and Berthwise fills in GRT, NRT, length and type. Change any figure and the estimate follows.",
    cta: ["Try your vessel", "/login?tab=signup"],
  },
  {
    title: "The estimate",
    body: "Port dues, pilotage, towage, berth hire and more, itemised with their sources and compared side by side across ports.",
    cta: ["Compare ports", "#compare"],
  },
] as const;

const LABEL =
  "Isometric drawing of three stacked layers. At the bottom, a harbour chart with a quay, cranes, a breakwater and lighthouse, channel buoys and a stack of tariff books. Above it, a measuring bed holding a bulk carrier on keel blocks, a caliper closed on its beam and a tonnage dial. On top, nine tiles, one per charge, each carrying the thing it bills, with the total in gold.";

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const out3 = (t: number) => 1 - (1 - t) ** 3;
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const rise = (z: number) => screenOf([0, 0, z]);

/** The drawing never re-renders: the scroll scene owns every node inside it. */
const Figure = memo(function Figure() {
  return (
    <div className="dp-fit" role="img" aria-label={LABEL} style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}`, ["--dp-ratio" as string]: VIEW.w / VIEW.h }}>
      {PIECES.map((p) => {
        const [x, y, w, h] = p.box;
        return (
          <svg
            key={p.id}
            className="dp-piece"
            data-piece={p.id}
            data-layer={p.layer}
            data-order={p.order}
            viewBox={`${x} ${y} ${w} ${h}`}
            aria-hidden="true"
            style={{
              left: `${((x - VIEW.x) / VIEW.w) * 100}%`,
              top: `${((y - VIEW.y) / VIEW.h) * 100}%`,
              width: `${(w / VIEW.w) * 100}%`,
              height: `${(h / VIEW.h) * 100}%`,
            }}
            dangerouslySetInnerHTML={{ __html: p.html }}
          />
        );
      })}
    </div>
  );
});

/**
 * Kaiko's "scale comes from depth" section: a heading, then a 300vh track whose sticky slide
 * pairs a three-item accordion with an isometric stack that builds one layer per third of the
 * track. Everything is a pure function of scroll progress, so scrubbing back unbuilds it.
 */
export function Depth() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const track = el.querySelector<HTMLElement>("[data-track]")!;
    const fit = el.querySelector<HTMLElement>(".dp-fit")!;
    const txt = el.querySelector<HTMLElement>("[data-txt]")!;
    const cols = [...el.querySelectorAll<HTMLElement>("[data-col]")];
    const pieces = [...fit.querySelectorAll<SVGSVGElement>("[data-piece]")];
    const part = (id: string) => pieces.find((p) => p.dataset.piece === id)!;
    const starting = (prefix: string) => pieces.filter((p) => p.dataset.piece!.startsWith(prefix));
    const port = part("port");
    const land = part("port-land");
    const contours = part("port-contours");
    const books = part("port-books");
    const bands = starting("port-band-");
    const buoys = starting("port-buoy-");
    const vessel = ["vessel", "vessel-bar", "vessel-dial", "vessel-needle"].map(part);
    const ship = part("vessel-ship");
    const jaw = part("vessel-jaw");
    const needle = part("vessel-needle").querySelector<SVGPathElement>(".dp-needle")!;
    const tiles = pieces.filter((p) => p.dataset.layer === "2");

    let unit = 1; // css px per viewBox unit
    let active = -1;
    let needleAt = -1;
    let last = 0;

    // Every part is its own svg, moved whole: transform, opacity and filter only, so the
    // compositor does all the work and nothing re-rasterises. Writes are skipped when unchanged.
    const cache = new WeakMap<Element, string>();
    // A layer that has handed focus up the stack is washed toward the paper, not made
    // translucent: solids seen through solids read as mud.
    const place = (node: SVGSVGElement, [x, y]: [number, number], opacity: number, dim = 0) => {
      const v = `translate3d(${(x * unit).toFixed(2)}px,${(y * unit).toFixed(2)}px,0)`;
      // contrast() pulls toward mid grey; the brightness after it puts white back at white.
      const c = 1 - 0.42 * dim;
      const f = dim > 0.001 ? `grayscale(${(0.4 * dim).toFixed(3)}) contrast(${c.toFixed(3)}) brightness(${(1 / (0.5 + 0.5 * c)).toFixed(3)})` : "none";
      const id = v + opacity.toFixed(3) + f;
      if (cache.get(node) === id) return;
      cache.set(node, id);
      node.style.transform = v;
      node.style.opacity = opacity.toFixed(3);
      node.style.filter = f;
    };
    const plus = (a: [number, number], b: [number, number]): [number, number] => [a[0] + b[0], a[1] + b[1]];

    const setActive = (i: number) => {
      if (i === active) return;
      active = i;
      cols.forEach((c, k) => {
        c.classList.toggle("is-active", k === i);
        c.setAttribute("aria-expanded", String(k === i));
      });
    };

    function render(p: number) {
      last = p;
      const t0 = clamp(p * 3);
      const t1 = clamp(p * 3 - 1);
      const t2 = clamp(p * 3 - 2);
      setActive(p < 1 / 3 ? 0 : p < 2 / 3 ? 1 : 2);

      // L0, the port: the plate rises in, the soundings settle shallow to deep and the contours
      // after them, the tariff books drop onto the quay and the buoys onto their moorings.
      const base = out3(span(t0, 0, 0.42));
      const at0 = rise(-46 * (1 - base));
      const dim0 = out3(span(t1, 0, 0.5));
      place(port, at0, base, dim0);
      place(land, at0, base, dim0);
      bands.forEach((b, i) => place(b, at0, base * out3(span(t0, 0.16 + i * 0.07, 0.46 + i * 0.07)), dim0));
      place(contours, at0, base * out3(span(t0, 0.34, 0.66)), dim0);
      const bq = out3(span(t0, 0.5, 0.8));
      place(books, plus(at0, rise(BOOK_DROP * (1 - bq))), bq, dim0);
      buoys.forEach((b, i) => {
        const q = out3(span(t0, 0.44 + i * 0.06, 0.7 + i * 0.06));
        place(b, plus(at0, rise(BUOY_DROP * (1 - q))), q, dim0);
      });

      // L1, the vessel: the bed comes down onto its slot, the ship is lowered onto the keel
      // blocks, the caliper closes on its beam and the dial reads the tonnage.
      const bed = out3(span(t1, 0, 0.42));
      const lift = inOut(span(t2, 0.78, 1));
      const at1 = rise(70 * (1 - bed) + LIFT[1]! * lift);
      const dim1 = out3(span(t2, 0, 0.5));
      vessel.forEach((v) => place(v, at1, bed, dim1));
      const lower = out3(span(t1, 0.2, 0.58));
      place(ship, plus(at1, rise(SHIP_DROP * (1 - lower))), bed * clamp(span(t1, 0.16, 0.36)), dim1);
      place(jaw, plus(at1, screenOf([0, JAW_OPEN * (1 - inOut(span(t1, 0.56, 0.8))), 0])), bed, dim1);
      // The needle is the one path rebuilt per frame, inside an svg that holds nothing else.
      const reading = Math.round(out3(span(t1, 0.62, 0.94)) * DIAL.value * 400) / 400;
      if (reading !== needleAt) {
        needleAt = reading;
        needle.setAttribute("d", needleOf(reading));
      }

      // L2, the estimate: the charge tiles land one by one, the gold total last; then the
      // finished stack opens up so each layer reads on its own.
      for (const tile of tiles) {
        const o = +tile.dataset.order!;
        const q = out3(span(t2, o * 0.064, o * 0.064 + 0.22));
        place(tile, rise(TILE_DROP * (1 - q) + LIFT[2]! * lift), clamp(q * 1.6));
      }
    }

    const measure = () => {
      unit = fit.clientWidth / VIEW.w;
      fit.style.setProperty("--px", (1 / unit).toFixed(4));
      // The column holds the height of its tallest state, so opening one item never shifts the rest.
      txt.style.height = "auto";
      const keep = active;
      let tallest = 0;
      for (let i = 0; i < cols.length; i++) {
        cols.forEach((c, k) => c.classList.toggle("is-active", k === i));
        tallest = Math.max(tallest, txt.scrollHeight);
      }
      active = -1;
      setActive(Math.max(0, keep));
      txt.style.height = `${Math.ceil(tallest)}px`;
      pieces.forEach((p) => cache.delete(p));
      render(last);
    };

    const ctx = gsap.context(() => {
      // HomeKaiko heading reveal (C2kuLCsq.js:848): words fade in on arrival.
      const head = el.querySelector<HTMLElement>("[data-head]")!;
      const title = new SplitText(head.querySelector("h2"), { type: "words" }).words;
      const sub = new SplitText(head.querySelector("p"), { type: "words" }).words;
      gsap
        .timeline({ defaults: { ease: "joe.out", duration: 1.2 }, scrollTrigger: { trigger: head, start: "top 75%", once: true } })
        .from(title, { opacity: 0, stagger: 0.01 }, 0)
        .from(sub, { opacity: 0, stagger: 0.01 }, 0.15);
    }, el);

    // Begins while the stage is still rising into view, so the first layer is already
    // assembling when the slide pins.
    const scene = ScrollTrigger.create({
      trigger: track,
      start: "top 70%",
      end: "bottom bottom",
      onUpdate: (s) => render(s.progress),
      onRefresh: (s) => render(s.progress),
    });

    // Lands each layer mostly built. The port's third mostly scrolls by before the pin, so
    // it targets its finished state instead, which is the first point the slide is pinned.
    const go = (i: number) => {
      const y = scene.start + (scene.end - scene.start) * ((i + (i ? 0.62 : 0.92)) / 3);
      const lenis = getLenis();
      if (lenis) lenis.scrollTo(y, { duration: 1.2 });
      else window.scrollTo({ top: y, behavior: "smooth" });
    };
    const clicks = cols.map((c, i) => {
      const on = (e: Event) => {
        if ((e.target as Element).closest("a")) return;
        go(i);
      };
      c.addEventListener("click", on);
      return () => c.removeEventListener("click", on);
    });

    const ro = new ResizeObserver(measure);
    ro.observe(fit);
    ro.observe(txt.parentElement!);
    measure();
    document.fonts.ready.then(measure);

    return () => {
      ro.disconnect();
      clicks.forEach((off) => off());
      scene.kill();
      ctx.revert();
    };
  }, []);

  return (
    <section ref={root} className="depth" id="how-it-works" aria-labelledby="depth-title">
      <header className="depth-head" data-head>
        <h2 id="depth-title" className="depth-title">
          In port costs, speed comes from depth.
        </h2>
        <p className="depth-sub">Estimates built from published tariffs, read line by line, and kept current as rates change.</p>
      </header>
      <div className="depth-track" data-track>
        <div className="depth-slide">
          <div className="depth-grid">
            <div className="depth-txt" data-txt>
              {LAYERS.map((l, i) => (
                <div key={l.title} className={`depth-col${i === 0 ? " is-active" : ""}`} data-col role="button" tabIndex={0} aria-expanded={i === 0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.currentTarget.click();
                    }
                  }}
                >
                  <h3 className="depth-col-title">{l.title}</h3>
                  <div className="depth-reveal">
                    <div className="depth-reveal-in">
                      <p className="depth-col-body">{l.body}</p>
                      <ButtonLink href={l.cta[1]} className="depth-cta">
                        {l.cta[0]}
                      </ButtonLink>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="depth-stage">
              <Figure />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
