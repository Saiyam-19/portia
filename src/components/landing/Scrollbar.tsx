"use client";

import { useEffect, useRef } from "react";
import { getLenis } from "./SmoothScroll";

const MIN = 32; // px, shortest the thumb gets on long pages
const IDLE = 900; // ms after the last scroll before it fades

/**
 * The native bar is hidden (globals.css); this hairline thumb floats over the page instead of
 * taking a gutter. It shows while scrolling or hovered and can be dragged. DOM writes only.
 */
export function Scrollbar() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bar.current!;
    const doc = document.documentElement;
    let size = 0;
    let room = 0; // px the thumb can travel
    let max = 0; // px the page can scroll
    let timer = 0;
    let drag: { y: number; top: number } | null = null;

    const show = () => {
      el.classList.add("is-on");
      clearTimeout(timer);
      timer = window.setTimeout(() => !drag && el.classList.remove("is-on"), IDLE);
    };
    const paint = () => {
      el.style.transform = `translate3d(0,${max ? (window.scrollY / max) * room : 0}px,0)`;
    };
    const measure = () => {
      const vh = window.innerHeight;
      max = doc.scrollHeight - vh;
      size = max > 0 ? Math.max(MIN, (vh * vh) / doc.scrollHeight) : 0;
      room = vh - size;
      el.style.height = `${size}px`;
      el.hidden = !size;
      paint();
    };
    const onScroll = () => {
      paint();
      show();
    };

    const down = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      drag = { y: e.clientY, top: window.scrollY };
      el.classList.add("is-drag");
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const y = Math.min(max, Math.max(0, drag.top + ((e.clientY - drag.y) / room) * max));
      const lenis = getLenis();
      if (lenis) lenis.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
    };
    const up = () => {
      drag = null;
      el.classList.remove("is-drag");
      show();
    };

    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    measure();

    return () => {
      clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return <div ref={bar} className="scrollbar" aria-hidden="true" />;
}
