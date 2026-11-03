"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/landing/motion";

/** Illustrative asks; the Mumbai figures match the design's Portia mock estimate. */
const PROMPTS = [
  "Port costs at Mumbai for 32,450 GRT, 48 hours",
  "Compare Mumbai and Jaigarh for 30,000 GRT",
  "Pilotage and towage at Paradip",
  "Estimate a call at Kandla for IMO 9321483",
  "Berth hire at Chennai, two days alongside",
];
const THANKS = "Thanks. Your estimate is on its way.";

/**
 * beUI's text cascade (beui.dev/components/motion/text-animation), in GSAP: the old letters roll
 * up and away at half the stagger while the new ones roll in from below, left to right, each
 * de-blurring as it lands. Old and new are independent layers, so proportional widths never jitter.
 */
function TextCascade({ text, className }: { text: string; className?: string }) {
  const root = useRef<HTMLSpanElement>(null);
  const shown = useRef<string | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || shown.current === text) return;
    const first = shown.current === null;
    shown.current = text;

    const layer = document.createElement("span");
    layer.className = "cascade-layer";
    for (const ch of text) {
      const c = document.createElement("span");
      c.className = "cascade-char";
      c.textContent = ch === " " ? " " : ch;
      layer.append(c);
    }
    const old = [...el.children] as HTMLElement[];
    el.append(layer);
    if (first || prefersReducedMotion()) {
      old.forEach((o) => o.remove());
      return;
    }
    for (const o of old) {
      gsap.killTweensOf(o.children);
      gsap.to(o.children, {
        yPercent: -105,
        opacity: 0,
        filter: "blur(3px)",
        duration: 0.16,
        ease: "expo.out",
        stagger: 0.0125,
        onComplete: () => o.remove(),
      });
    }
    gsap.fromTo(
      layer.children,
      { yPercent: 105, opacity: 0, filter: "blur(3px)" },
      { yPercent: 0, opacity: 1, filter: "blur(0px)", duration: 0.55, ease: "expo.out", stagger: 0.025, clearProps: "filter" },
    );
  }, [text]);

  return <span ref={root} className={className} aria-hidden="true" />;
}

/** The hero's ask box: a frosted composer whose placeholder cascades through example requests. */
export function Composer() {
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  const [i, setI] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (value || sent || prefersReducedMotion()) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % PROMPTS.length), 3400);
    return () => window.clearInterval(id);
  }, [value, sent]);

  return (
    <form
      className="composer input-glass"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) {
          field.current?.focus();
          return;
        }
        // No backend yet: acknowledge locally.
        setSent(true);
        setValue("");
      }}
    >
      <label className="sr-only" htmlFor="composer-input">
        Describe your port call
      </label>
      <div className="composer-field">
        <textarea
          ref={field}
          id="composer-input"
          name="prompt"
          rows={1}
          value={value}
          disabled={sent}
          placeholder={sent ? THANKS : PROMPTS[0]}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <TextCascade className="composer-placeholder" text={sent ? THANKS : PROMPTS[i]!} />
      </div>
      <button type="submit" className="composer-send" aria-label="Get estimate" disabled={sent}>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 15.5V4.5M10 4.5L5 9.5M10 4.5L15 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  );
}
