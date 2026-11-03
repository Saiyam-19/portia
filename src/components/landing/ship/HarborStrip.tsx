"use client";

import { memo, useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/landing/motion";
import { createOcean } from "../ocean/renderer";
import { REAR_ENGINE } from "./engine";
import { REAR } from "./scene";
import { STRIP_SEA } from "./strip-sea";
import "./ShipHarbor.css";

const LABEL =
  "Drawing of the harbour seen from behind the quay, straight on and low: the container yard and two ship-to-shore cranes in front, and beyond them three container ships coming alongside, then being unloaded onto the quay.";

const VIEWBOX = `0 0 ${REAR.VIEW_W} ${REAR.VIEW_H}`;
const SEA_BAND = { top: `${(STRIP_SEA.top / REAR.VIEW_H) * 100}%`, height: `${(STRIP_SEA.height / REAR.VIEW_H) * 100}%` };

/** The drawing never re-renders: the engine owns every node inside it. */
const Drawing = memo(function Drawing() {
  return (
    <>
      <div className="strip-sea" style={SEA_BAND} aria-hidden="true">
        <canvas />
      </div>
      <svg className="sh-water" viewBox={VIEWBOX} aria-hidden="true" dangerouslySetInnerHTML={{ __html: REAR_ENGINE.WAKE_MARKUP }} />
      <svg className="sh-svg" viewBox={VIEWBOX} role="img" aria-label={LABEL} dangerouslySetInnerHTML={{ __html: REAR_ENGINE.MARKUP }} />
      <svg className="sh-static sh-front" viewBox={VIEWBOX} aria-hidden="true" dangerouslySetInnerHTML={{ __html: REAR_ENGINE.FRONT_MARKUP }} />
    </>
  );
});

/**
 * The depth section's closing strip: the hero's harbour from the land side. Nothing here takes
 * input. The first time the strip is mostly in view the ships sail in, berth, and are unloaded one
 * after another at the cranes' nominal pace; it runs once, forward only, and holds still once done.
 * Off screen it simply waits where it is. The sea under it is the hero's ocean, live.
 */
export function HarborStrip() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    const svg = el?.querySelector<SVGSVGElement>(".sh-svg");
    const water = el?.querySelector<SVGSVGElement>(".sh-water");
    const sea = el?.querySelector<HTMLCanvasElement>(".strip-sea canvas");
    if (!el || !svg || !water || !sea) return;
    const harbor = REAR_ENGINE.createHarbor(svg, water, { start: false, paused: false, announce: () => {} });
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        harbor.setStart(true);
        io.disconnect();
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    // The sea's GPU set-up (device, shader compiles) runs once the page is idle, or a screen ahead
    // if the reader gets there first, so it never lands mid-scroll. The renderer then draws only
    // while the strip is on screen. No WebGPU: a still dot field (CSS).
    let ocean: ReturnType<typeof createOcean> | null = null;
    let ro: ResizeObserver | null = null;
    const still = () => sea.parentElement!.classList.add("is-still");
    const boot = () => {
      if (ocean) return;
      near.disconnect();
      cancelIdle();
      if (!("gpu" in navigator)) return still();
      const o = (ocean = createOcean(sea, { still: prefersReducedMotion(), camera: STRIP_SEA.camera, pointer: false, transparent: true }));
      const place = () => {
        const k = sea.clientWidth / REAR.VIEW_W;
        o.setAnchor([STRIP_SEA.anchor[0] * k, STRIP_SEA.anchor[1] * k]);
      };
      ro = new ResizeObserver(place);
      o.ready.then(() => ro?.observe(sea), still);
    };
    const near = new IntersectionObserver(([e]) => e?.isIntersecting && boot(), { rootMargin: "100% 0px" });
    near.observe(el);
    const cancelIdle = (() => {
      if ("requestIdleCallback" in window) {
        const id = requestIdleCallback(boot, { timeout: 4000 });
        return () => cancelIdleCallback(id);
      }
      const id = setTimeout(boot, 2500);
      return () => clearTimeout(id);
    })();
    return () => {
      io.disconnect();
      near.disconnect();
      cancelIdle();
      ro?.disconnect();
      ocean?.dispose();
      harbor.destroy();
    };
  }, []);

  return (
    <div ref={root} className="strip" data-strip>
      <div className="sh strip-fig">
        <Drawing />
      </div>
    </div>
  );
}
