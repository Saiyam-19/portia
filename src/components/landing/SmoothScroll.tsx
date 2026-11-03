"use client";

import Lenis from "lenis";
import { useEffect } from "react";
import { gsap, prefersReducedMotion, ScrollTrigger } from "@/lib/landing/motion";

let lenis: Lenis | null = null;
export const getLenis = () => lenis;

/** Kaiko's scroll engine: Lenis on the window, driven by the GSAP ticker, feeding ScrollTrigger. */
export function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) {
      // Every timed tween resolves on its first frames; scrubbed scenes still follow the scroll.
      gsap.globalTimeline.timeScale(1e3);
      return;
    }
    const instance = new Lenis({ autoRaf: false });
    lenis = instance;
    const raf = (time: number) => instance.raf(time * 1000);
    instance.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(raf);
      instance.destroy();
      lenis = null;
    };
  }, []);
  return null;
}
