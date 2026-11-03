"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { booted } from "@/lib/landing/boot";
import { gsap, ScrollTrigger, SplitText } from "@/lib/landing/motion";
import { Composer } from "./Composer";
import { Ocean } from "./ocean/Ocean";
import { iso } from "./ship/iso";
import { P, VIEW_W } from "./ship/scene";

const TITLE = (
  <>
    Port costs,
    <br />
    <em>before you berth.</em>
  </>
);

type FigureState = { start: boolean; paused: boolean };

/** Anchor the sea's dot lattice at the harbour's waterline in canvas css px. */
function harbourOrigin(hero: HTMLElement | null, canvas: DOMRect): [number, number] | null {
  const svg = hero?.querySelector(".hero-figure .sh-svg");
  if (!svg) return null;
  const box = svg.getBoundingClientRect();
  const [x, y] = iso([0, 0, 0], P);
  const k = box.width / VIEW_W;
  return [box.left - canvas.left + x * k, box.top - canvas.top + y * k];
}

/**
 * Kaiko's hero: three stacked copies of the headline (gold, sea, charcoal) whose characters
 * flicker through in sequence while the stack settles from 1.4×. The hero fills the viewport
 * and is sticky; the sheet starts below the fold and grows to full bleed as it rises over it.
 */
export function Hero({ figure, sheet }: { figure?: (s: FigureState) => ReactNode; sheet: React.RefObject<HTMLElement | null> }) {
  const root = useRef<HTMLElement>(null);
  const [start, setStart] = useState(false);
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    const el = root.current;
    const sheetEl = sheet.current;
    if (!el || !sheetEl) return;

    const ctx = gsap.context(() => {
      const [l1, l2, l3] = gsap.utils.toArray<HTMLElement>("[data-layer]", el).map(
        (layer) => new SplitText(layer, { type: "words, chars", charsClass: "char" }).chars,
      );
      gsap.set([l1, l2, l3], { opacity: 0 });
      gsap.set(".hero-title", { visibility: "visible" }); // hidden by CSS until split, so SSR text never flashes

      // Kaiko intro (C2kuLCsq.js:2298), timings verbatim.
      const intro = gsap
        .timeline({ paused: true })
        .fromTo("[data-layer]", { scale: 1.4 }, { scale: 1, duration: 1.3, ease: "joe.out" }, 0)
        .fromTo("[data-glow]", { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 1.3, ease: "joe.out" }, 0)
        .to(l1, { opacity: 1, stagger: 0.03, duration: 0.5, ease: "joe.out" }, 0)
        .to(l1, { opacity: 0, stagger: 0.03, duration: 0.5, ease: "joe.out" }, 0.4)
        .to(l2, { opacity: 1, stagger: 0.03, duration: 0.5, ease: "joe.out" }, 0.1)
        .to(l2, { opacity: 0, stagger: 0.03, duration: 0.5, ease: "joe.out" }, 0.8)
        .to(l3, { opacity: 1, stagger: 0.03, duration: 0.5, ease: "joe.out" }, 0.2)
        // Preserve the input's original start time after removing the preceding subheading.
        .fromTo("[data-rise]", { y: 20, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.12, duration: 0.8, ease: "joe.out" }, 0.82)
        .call(() => setStart(true), undefined, 0.4)
        .call(() => ScrollTrigger.refresh(), undefined, 1.4);

      // Kaiko scrub: the copy drifts up and fades as the sheet starts to rise.
      gsap
        .timeline({ scrollTrigger: { start: 0, end: () => window.innerHeight * 0.7, scrub: true } })
        .to("[data-copy]", { yPercent: -30, ease: "none", duration: 1 })
        .to("[data-copy]", { autoAlpha: 0, ease: "none", duration: 0.7 }, 0.3);

      // The secondary sheet rises from below the fold, scaling from a 90% card to full bleed (origin:
      // its top edge). It is full width by the time its top is 40% down the viewport, well before it
      // covers the hero, so the content arrives settled.
      gsap.fromTo(
        sheetEl,
        { scale: 0.9, "--sheet-r": "24px" },
        {
          scale: 1,
          "--sheet-r": "0px",
          ease: "none",
          scrollTrigger: { trigger: sheetEl, start: "top bottom", end: "top 40%", scrub: true },
        },
      );

      // Once the sheet's top passes the viewport top the hero is masked; pause its loops.
      ScrollTrigger.create({
        trigger: sheetEl,
        start: "top top",
        onEnter: () => setCovered(true),
        onLeaveBack: () => setCovered(false),
      });

      booted.then(() => intro.play()); // as the loader lifts
    }, el);

    // Stick once the hero's bottom meets the viewport's, so a hero taller than the screen is still seen whole.
    const pin = () => (el.style.top = `${Math.min(0, window.innerHeight - el.offsetHeight)}px`);
    const ro = new ResizeObserver(pin);
    ro.observe(el);
    window.addEventListener("resize", pin);

    return () => {
      ctx.revert();
      ro.disconnect();
      window.removeEventListener("resize", pin);
    };
  }, [sheet]);

  return (
    <section ref={root} id="top" className={covered ? "hero is-covered" : "hero"}>
      <Ocean paused={covered} anchor={(canvas) => harbourOrigin(root.current, canvas)} />
      {/* Keep the harbour in the lower 45%, above the original background ocean. */}
      <div className="hero-figure">{figure?.({ start, paused: covered })}</div>
      <div className="hero-grid">
        <div className="hero-copy" data-copy>
          <h1 className="hero-title">
            <span className="hero-glow" data-glow aria-hidden="true" />
            <span data-layer className="hero-layer hero-layer-1">
              {TITLE}
            </span>
            <span data-layer className="hero-layer hero-layer-2" aria-hidden="true">
              {TITLE}
            </span>
            <span data-layer className="hero-layer hero-layer-3" aria-hidden="true">
              {TITLE}
            </span>
          </h1>
          <div className="hero-capture" data-rise>
            <Composer />
          </div>
        </div>
      </div>
    </section>
  );
}
