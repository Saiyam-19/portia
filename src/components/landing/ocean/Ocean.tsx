"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { settle } from "@/lib/landing/boot";
import { prefersReducedMotion } from "@/lib/landing/motion";
import { createOcean, type OceanRenderer } from "./renderer";

type Anchor = (canvas: DOMRect) => readonly [number, number] | null;

/**
 * The hero sea: an FFT-driven dot ocean on WebGPU, with a static dotted fallback.
 * `anchor` returns where lattice node (0, 0) sits, in css px relative to the canvas.
 */
export function Ocean({ paused = false, anchor, className = "" }: { paused?: boolean; anchor?: Anchor; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<OceanRenderer | null>(null);
  const anchorRef = useRef(anchor);
  const [fallback, setFallback] = useState(false);

  // Keep the latest anchor for the resize observer without re-creating the renderer.
  useLayoutEffect(() => {
    anchorRef.current = anchor;
  });

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const fail = () => {
      setFallback(true);
      settle("ocean");
    };
    if (!("gpu" in navigator)) return fail();
    const ocean = createOcean(c, { still: prefersReducedMotion() });
    renderer.current = ocean;
    const place = () => ocean.setAnchor(anchorRef.current?.(c.getBoundingClientRect()) ?? null);
    const ro = new ResizeObserver(place);
    ocean.ready.then(() => {
      ro.observe(c);
      requestAnimationFrame(() => settle("ocean")); // after its first frame lands
    }, fail);
    return () => {
      ro.disconnect();
      ocean.dispose();
      renderer.current = null;
    };
  }, []);

  useEffect(() => {
    renderer.current?.setPaused(paused);
  }, [paused]);

  return (
    <div className={`ocean ${fallback ? "ocean-fallback" : ""} ${className}`} aria-hidden="true">
      {!fallback && <canvas ref={canvas} />}
    </div>
  );
}
