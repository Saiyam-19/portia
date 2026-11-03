"use client";

import { useEffect, useRef, useState } from "react";
import { booted } from "@/lib/landing/boot";
import { CustomEase, DURATION, EASE, gsap, isTouch, prefersReducedMotion } from "@/lib/landing/motion";
import { LogoMark } from "./Logo";
import { getLenis } from "./SmoothScroll";

type Item = { label: string; href: string; tone?: "accent" };

const MAIN: Item[] = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Ports", href: "#ports" },
];
const ACTIONS: Item[] = [
  { label: "Log in", href: "/login" },
  { label: "Try free", href: "/login?tab=signup", tone: "accent" },
];

/** Shared scroll state: Lassie collapses the wordmark past 400px going down, expands going up or above 360px
 * (or when the main nav is hovered or focused, until the next scroll down). */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const up = y < last;
      last = y;
      if (up || y <= 360) setCollapsed(false);
      else if (y >= 400) setCollapsed(true);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return [collapsed, setCollapsed] as const;
}

function Wordmark({ wordRef }: { wordRef?: React.Ref<HTMLSpanElement> }) {
  return (
    <span className="nav-wordmark" aria-label="Berthwise">
      <LogoMark className="nav-mark" aria-hidden="true" />
      <span ref={wordRef} aria-hidden="true" className="nav-wordmark-rest">
        <span>Berthwise</span>
      </span>
    </span>
  );
}

/**
 * Lassie's desktop pill group: each idle item sits on its own white tile; once the group
 * is hovered the tiles drop away and a single highlight slides between items.
 * The first item entered snaps the highlight into place; later moves glide (expo.out, 0.3s).
 * The highlight chases the item's live box every frame rather than tweening to where it was, so it
 * stays on an item that moves under it (the wordmark widening as the group is hovered).
 */
function PillGroup({ items, logo, collapsed, expand, className }: { items: Item[]; logo?: boolean; collapsed?: boolean; expand?: () => void; className: string }) {
  const nav = useRef<HTMLElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const current = useRef<HTMLElement | null>(null);
  // The pill's box, and the box its item had last frame: the item's own motion is carried 1:1, only
  // the gap left by switching items glides.
  const box = useRef<{ x: number; w: number; el: HTMLElement; ix: number; iw: number; out: string } | null>(null);

  // expo.out toward a fixed target is exponential decay: 1 - 2^(-10t/0.3s) ⇒ τ = 0.3s / (10 ln 2).
  // Stable across renders so the ticker can remove the same function it was given.
  const [tick] = useState(() => (_t: number, dt: number) => {
    const p = pill.current, el = current.current;
    if (!p || !el) return;
    const x = el.offsetLeft, w = el.offsetWidth;
    const b = (box.current ??= { x, w, el, ix: x, iw: w, out: "" });
    if (b.el === el) {
      b.x += x - b.ix;
      b.w += w - b.iw;
    }
    Object.assign(b, { el, ix: x, iw: w });
    if (Math.abs(x - b.x) + Math.abs(w - b.w) < 0.1) {
      b.x = x;
      b.w = w;
    } else {
      const k = 1 - Math.exp(-dt / ((DURATION.fast * 1000) / (10 * Math.LN2)));
      b.x += (x - b.x) * k;
      b.w += (w - b.w) * k;
    }
    const out = `${b.x.toFixed(2)},${b.w.toFixed(2)}`;
    if (out === b.out) return;
    b.out = out;
    p.style.transform = `translate3d(${b.x.toFixed(2)}px,0,0)`;
    p.style.width = `${b.w.toFixed(2)}px`;
  });
  // The last item entered gets its tile back without the fade (Lassie's lastFill), and the pill hides a
  // tick later, once the idle tiles are painted: the highlighted item swaps pill for tile with no dip.
  const fill = useRef<HTMLElement | null>(null);
  const idle = () => {
    gsap.ticker.remove(tick);
    current.current = box.current = null;
    setTimeout(() => {
      if (!current.current && pill.current) pill.current.style.width = "0px";
    });
  };
  useEffect(() => idle, []);

  // Wordmark collapses to its initial while scrolling down.
  useEffect(() => {
    const w = word.current;
    if (!logo || !w) return;
    gsap.to(w, { width: collapsed ? 0 : w.scrollWidth, duration: DURATION.medium, ease: EASE });
  }, [collapsed, logo]);

  const enter = (e: React.SyntheticEvent<HTMLAnchorElement>) => {
    if (isTouch()) return;
    const el = e.currentTarget;
    if (!current.current) gsap.ticker.add(tick);
    current.current = el;
    if (fill.current) fill.current.style.transitionDuration = "";
    fill.current = el.querySelector<HTMLElement>(".nav-item-tile");
    if (fill.current) fill.current.style.transitionDuration = "0s";
    if (pill.current) pill.current.style.backgroundColor = getComputedStyle(el).getPropertyValue("--item-bg");
  };

  return (
    <nav
      ref={nav}
      aria-label={logo ? "Main navigation" : "Account"}
      className={`nav-group ${hovered ? "is-hovered" : ""} ${className}`}
      onMouseEnter={() => {
        if (isTouch()) return;
        setHovered(true);
        expand?.();
      }}
      onMouseLeave={() => {
        if (isTouch()) return;
        idle();
        setHovered(false);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          idle();
          setHovered(false);
        }
      }}
      onFocus={() => {
        setHovered(true);
        expand?.();
      }}
    >
      <div className="nav-frame" aria-hidden="true" />
      <div ref={pill} className="nav-pill" aria-hidden="true" />
      {logo && (
        <a href="#top" className="nav-item" onMouseEnter={enter} onFocus={enter}>
          <span className="nav-item-tile" />
          <span className="nav-item-label">
            <Wordmark wordRef={word} />
          </span>
        </a>
      )}
      {items.map((item) => (
        <a
          key={item.label}
          href={item.href}
          className={`nav-item ${item.tone === "accent" ? "nav-item-accent" : ""}`}
          onMouseEnter={enter}
          onFocus={enter}
        >
          <span className="nav-item-tile" />
          <span className="nav-item-label">{item.label}</span>
        </a>
      ))}
    </nav>
  );
}

type SheetState = "closed" | "opening" | "open" | "closing";

/** Lassie's mobile bar: "Menu" morphs the pill into a full-width sheet. */
function MobileNav({ collapsed }: { collapsed: boolean }) {
  const nav = useRef<HTMLElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<SheetState>("closed");
  const restWidth = useRef(0);

  useEffect(() => {
    if (sheet.current) gsap.set(sheet.current, { height: 0, opacity: 0 });
  }, []);

  useEffect(() => {
    const w = word.current;
    if (!w || state !== "closed") return;
    gsap.to(w, { width: collapsed ? 0 : w.scrollWidth, duration: DURATION.medium, ease: EASE });
  }, [collapsed, state]);

  const open = () => {
    const n = nav.current, r = row.current, w = word.current, s = sheet.current;
    if (!n || !r || !w || !s) return;
    const ease = CustomEase.create("lassie.sheet", "0.85, 0.05, 0.09, 0.91");
    const from = r.offsetWidth;
    restWidth.current = from - w.offsetWidth;
    setState("opening");
    getLenis()?.stop();
    const to = window.innerWidth - 32;
    const tl = gsap.timeline({ onComplete: () => setState("open") });
    tl.fromTo(n, { width: from }, { width: to, duration: 0.5, ease }, 0)
      .to(r, { x: 4, y: 4, duration: 0.5, ease }, 0)
      .to(w, { width: w.scrollWidth, duration: 0.5, ease }, 0)
      .set(s, { opacity: 1 }, 0.2)
      .fromTo(s, { height: 0 }, { height: "auto", duration: 0.5 * DURATION.fast }, 0.2);
  };

  const close = () => {
    const n = nav.current, r = row.current, w = word.current, s = sheet.current;
    if (!n || !r || !w || !s) return;
    setState("closing");
    const K = { duration: 0.26, ease: "power3.inOut" };
    const target = collapsed ? 0 : w.scrollWidth;
    gsap.to(s, { opacity: 0, duration: 0.6 * K.duration, ease: "power1.in" });
    gsap
      .timeline({
        onComplete: () => {
          gsap.set(n, { clearProps: "width" });
          setState("closed");
          getLenis()?.start();
        },
      })
      .to(s, { height: 0, ...K }, 0)
      .to(n, { width: restWidth.current + target, ...K }, 0)
      .to(r, { x: 0, y: 0, ...K }, 0)
      .to(w, { width: target, ...K }, 0);
  };

  useEffect(() => {
    if (state !== "open") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const isOpen = state === "open" || state === "opening";

  return (
    <nav ref={nav} aria-label="Main navigation" className={`nav-mobile ${state !== "closed" ? "is-active" : ""}`}>
      <div className="nav-frame" aria-hidden="true" />
      <div ref={row} className="nav-mobile-row">
        <a href="#top" className="nav-item">
          <span className="nav-item-tile nav-item-tile-on" />
          <span className="nav-item-label">
            <Wordmark wordRef={word} />
          </span>
        </a>
        <button
          type="button"
          className={`nav-item ${state !== "closed" ? "is-hidden" : ""}`}
          aria-expanded={isOpen}
          aria-controls="mobile-sheet"
          onClick={() => (state === "closed" ? open() : close())}
        >
          <span className="nav-item-tile nav-item-tile-on" />
          <span className="nav-item-label">Menu</span>
        </button>
      </div>
      {state === "open" && (
        <button type="button" className="nav-mobile-close" onClick={close}>
          Close
        </button>
      )}
      <div ref={sheet} id="mobile-sheet" className={`nav-sheet ${isOpen ? "" : "pointer-events-none"}`} hidden={state === "closed"}>
        <ul>
          {MAIN.map((i) => (
            <li key={i.label}>
              <a href={i.href} onClick={close}>
                {i.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="nav-sheet-actions">
          {ACTIONS.map((i) => (
            <a key={i.label} href={i.href} className={`nav-sheet-cta ${i.tone === "accent" ? "is-accent" : ""}`} onClick={close}>
              {i.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}

export function Nav() {
  const [collapsed, setCollapsed] = useCollapsed();
  const root = useRef<HTMLDivElement>(null);

  // Kaiko's nav entrance: items drop in as the loader lifts (y -100 → 0, stagger .05, .8s joe.out).
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const targets = el.querySelectorAll(".nav-group, .nav-mobile");
    if (prefersReducedMotion()) return void gsap.set(targets, { autoAlpha: 1, y: 0 });
    booted.then(() =>
      gsap.fromTo(targets, { y: -100, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.05, duration: 0.8, ease: "joe.out" }),
    );
  }, []);

  return (
    <div ref={root} className="nav-root">
      <PillGroup items={MAIN} logo collapsed={collapsed} expand={() => setCollapsed(false)} className="nav-main" />
      <PillGroup items={ACTIONS} className="nav-actions" />
      <MobileNav collapsed={collapsed} />
    </div>
  );
}
