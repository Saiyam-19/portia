"use client";

import { memo, useEffect, useRef } from "react";
import { settle } from "@/lib/landing/boot";
import { MARKUP, STATIC_MARKUP, WAKE_MARKUP, createHarbor } from "./engine";
import { VIEW_H, VIEW_W } from "./scene";
import "./ShipHarbor.css";

const LABEL =
  "Isometric drawing of a container ship berthing alongside a quay with two ship-to-shore gantry cranes and an empty container yard. Activating the ship starts the cranes unloading its containers onto the quay.";

/** The drawing never re-renders: the engine owns every node inside it. */
const Drawing = memo(function Drawing() {
  return (
    <>
      <svg className="sh-static" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: STATIC_MARKUP }} />
      <svg className="sh-water" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: WAKE_MARKUP }} />
      <svg
      className="sh-svg"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="group"
      aria-label={LABEL}
      dangerouslySetInnerHTML={{ __html: MARKUP }}
      />
    </>
  );
});

export interface ShipHarborProps {
  className?: string;
  /** Sail in when true (one-way: once started the approach completes). */
  start?: boolean;
  /** Freeze the loop in place; resumes with no time jump. */
  paused?: boolean;
}

export function ShipHarbor({ className, start = true, paused = false }: ShipHarborProps) {
  const root = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLSpanElement>(null);
  const harbor = useRef<ReturnType<typeof createHarbor> | null>(null);
  const initial = useRef({ start, paused });

  useEffect(() => {
    const svg = root.current?.querySelector<SVGSVGElement>(".sh-svg");
    const water = root.current?.querySelector<SVGSVGElement>(".sh-water");
    if (!svg || !water) return;
    const h = createHarbor(svg, water, {
      ...initial.current,
      announce: (text) => {
        if (live.current) live.current.textContent = text;
      },
    });
    harbor.current = h;
    settle("harbor");
    return () => {
      h.destroy();
      harbor.current = null;
    };
  }, []);

  useEffect(() => {
    initial.current.start = start;
    harbor.current?.setStart(start);
  }, [start]);

  useEffect(() => {
    initial.current.paused = paused;
    harbor.current?.setPaused(paused);
  }, [paused]);

  return (
    <div ref={root} className={className ? `sh ${className}` : "sh"}>
      <Drawing />
      <span ref={live} className="sh-sr" aria-live="polite" />
    </div>
  );
}
