"use client";

import { useEffect, useRef, useState } from "react";
import { bootProgress, lifted, markBooted, onBootProgress, settle } from "@/lib/landing/boot";
import { gsap } from "@/lib/landing/motion";
import { LogoMark } from "./Logo";
import { getLenis } from "./SmoothScroll";

/** Never hold the page hostage: whatever hasn't settled by then is skipped. */
const MAX_WAIT = 8000;

/**
 * First-load cover: the emblem fills from the waterline up as the hero's fonts, ocean and harbour
 * settle, then the panel lifts away and the hero's entrance plays underneath it.
 */
export function Loader() {
  const root = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(lifted);

  useEffect(() => {
    const el = root.current;
    if (!el || lifted) return;
    const lenis = getLenis();
    lenis?.stop();
    const fill = { p: 0 };
    const draw = () => el.style.setProperty("--p", fill.p.toFixed(4));

    const ctx = gsap.context(() => {
      const exit = () =>
        gsap
          .timeline({ onComplete: () => setGone(true) })
          .to(el, { yPercent: -100, duration: 1, ease: "expo.inOut" })
          .to(".loader-mark", { y: -40, opacity: 0, duration: 0.5, ease: "power2.in" }, 0)
          .call(() => {
            document.documentElement.classList.remove("is-loading");
            lenis?.start();
            markBooted();
          }, undefined, 0.45);

      // Chase the real progress; at least ~0.6s for a full fill so a warm cache still reads as a fill.
      const update = () => {
        const target = bootProgress();
        gsap.to(fill, {
          p: target,
          duration: 0.6,
          ease: "sine.out",
          overwrite: true,
          onUpdate: draw,
          onComplete: () => void (target === 1 && exit()),
        });
      };
      const off = onBootProgress(update);
      update();
      return off;
    }, el);

    document.fonts.ready.then(() => settle("fonts"));
    const timeout = window.setTimeout(() => (["fonts", "ocean", "harbor"] as const).forEach(settle), MAX_WAIT);
    return () => {
      window.clearTimeout(timeout);
      ctx.revert();
    };
  }, []);

  if (gone) return null;
  return (
    <div ref={root} className="loader" aria-hidden="true">
      <div className="loader-mark">
        <LogoMark className="loader-ghost" />
        <LogoMark className="loader-fill" />
      </div>
    </div>
  );
}
