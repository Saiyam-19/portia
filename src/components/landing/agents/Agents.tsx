"use client";

import { memo, useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/landing/motion";
import { Icon, type IconName } from "./icons";
import { Threads } from "./threads";
import "./Agents.css";

/*
 * Lev's agent stack (lev/src/agent-stack.ts), with Lassie's orbit (lassie/src/sections.ts,
 * infographic) in place of Lev's source-icon shader: the sources circle in from beyond the
 * viewport around the headline, then the ring tightens onto the first chat card as it rises and
 * they fold in behind it. From there it is Lev's flow: the first chat plays once its card pins, then
 * the other three play in turn on their own clock while the rail slides through them; a card
 * nearing the centre starts at once without waiting its turn. Every conversation plays once per
 * page load; scrolling back never replays it.
 *
 * Scroll positions are in "units" of 1svh, as Lev's 280-unit runway is 280svh.
 */

type Tile = { id: string; img?: string; glyph?: IconName; angle: number; r: number; depth: number };

// Ten sources a tariff arrives as, spread round the ring. depth 1 is nearest (full size, sharp).
const TILES: Tile[] = [
  { id: "pdf", img: "pdf", angle: -96, r: 1, depth: 1 },
  { id: "anchor", glyph: "anchor", angle: -58, r: 0.92, depth: 0.72 },
  { id: "excel", img: "excel", angle: -22, r: 1.04, depth: 0.95 },
  { id: "book", glyph: "book", angle: 14, r: 0.9, depth: 0.66 },
  { id: "word", img: "word", angle: 50, r: 1, depth: 0.9 },
  { id: "ship", glyph: "ship", angle: 88, r: 0.94, depth: 0.78 },
  { id: "csv", img: "csv", angle: 126, r: 1.02, depth: 0.7 },
  { id: "calc", glyph: "calculator", angle: 160, r: 0.92, depth: 0.86 },
  { id: "zip", img: "zip", angle: 196, r: 1.04, depth: 0.74 },
  { id: "ppt", img: "powerpoint", angle: 230, r: 0.96, depth: 0.92 },
];

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
const expo = (v: number) => (v >= 1 ? 1 : 1 - 2 ** (-10 * clamp(v)));
const out3 = (v: number) => 1 - (1 - clamp(v)) ** 3;
const inOut = (v: number) => {
  const t = clamp(v);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
const RAD = Math.PI / 180;

// React Bits' Gradual Blur (MIT, bezier curve, no tint) as one layer rather than its eight:
// stacked backdrop filters (even two) re-blur each other's clipped output and haze the
// viewport's edge to white. One blur, its mask easing in toward the edge.
const ease = (from: number) => [0, 0.25, 0.5, 0.75, 1].map((u) => `rgba(0,0,0,${(u * u * (3 - 2 * u)).toFixed(3)}) ${(from + (100 - from) * u).toFixed(1)}%`).join(",");
const EDGE_LAYERS = [{ blur: "blur(16px)", stops: ease(8) }];
const Edge = ({ side }: { side: "left" | "right" }) => (
  <div className={`ag-edge ag-edge-${side}`}>
    {EDGE_LAYERS.map((l, i) => {
      const mask = `linear-gradient(to ${side}, ${l.stops})`;
      return <div key={i} style={{ backdropFilter: l.blur, WebkitBackdropFilter: l.blur, maskImage: mask, WebkitMaskImage: mask }} />;
    })}
  </div>
);

/** Static markup; the effect below owns every moving node. */
const Stage = memo(function Stage() {
  return (
    <>
      <div className="ag-harbor" aria-hidden="true">
        <div className="ag-harbor-pin">
          <div className="ag-harbor-img" data-harbor />
        </div>
      </div>
      <div className="ag-orbit" aria-hidden="true">
        <div className="ag-orbit-stage">
          {TILES.map((t) => (
            <div key={t.id} className="ag-tile" data-tile>
              <div className={`ag-tile-face${t.depth < 0.75 ? " is-far" : ""}`}>
                {t.img ? <img src={`/media/sources/${t.img}.webp`} alt="" width={56} height={56} decoding="async" /> : <Icon name={t.glyph!} stroke={1.6} />}
              </div>
            </div>
          ))}
        </div>
      </div>
      <header className="ag-intro">
        <div className="ag-intro-pin">
          <h2 id="ag-title" className="ag-title" data-title>
            <span>Every tariff, one question away.</span>
            <span className="ag-title-sub">Ask in plain words. Berthwise reads the schedules and shows its working.</span>
          </h2>
        </div>
      </header>
      <div className="ag-runway">
        <div className="ag-pin" data-pin>
          <div className="ag-track" data-track>
            <Threads />
          </div>
        </div>
        <div className="ag-spacer" />
      </div>
      <div className="ag-edges" aria-hidden="true">
        <div className="ag-edges-pin">
          <Edge side="left" />
          <Edge side="right" />
        </div>
      </div>
    </>
  );
});


/** When each step of a conversation lands, as a fraction of its run. */
type Timeline = { ms: number; work: number; report: number; table: number; row: number; insight: number; chips: number };
// The first conversation keeps Lev's timings (its steps list runs .42 → .7, then collapses).
const LEAD: Timeline = { ms: 3600, work: 0.66, report: 0.72, table: 0.78, row: 0.016, insight: 0.89, chips: 0.94 };
const FOLLOW: Timeline = { ms: 2600, work: 0.5, report: 0.56, table: 0.62, row: 0.03, insight: 0.84, chips: 0.9 };
// The tariff check ticks its three rows off one by one before it sums up.
const CHECK: Timeline = { ms: 4000, work: 0.46, report: 0.5, table: 0.56, row: 0.02, insight: 0.9, chips: 0.94 };
const CHECK_STEP = 0.09;
/** Breath between one conversation finishing and the next starting. */
const GAP = 500;

export function Agents() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current!;
    const intro = el.querySelector<HTMLElement>(".ag-intro")!;
    const title = el.querySelector<HTMLElement>("[data-title]")!;
    const tiles = [...el.querySelectorAll<HTMLElement>("[data-tile]")];
    const stage = el.querySelector<HTMLElement>(".ag-orbit-stage")!;
    const pin = el.querySelector<HTMLElement>("[data-pin]")!;
    const track = el.querySelector<HTMLElement>("[data-track]")!;
    const cards = [...track.children] as HTMLElement[];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const harbor = el.querySelector<HTMLElement>("[data-harbor]")!;

    // Writes are skipped when unchanged: most frames move only a few nodes.
    type Prop = "transform" | "transformOrigin" | "opacity" | "display" | "visibility" | "maxHeight" | "maskImage";
    let written = new WeakMap<Element, Partial<Record<Prop, string>>>();
    const set = (node: HTMLElement | SVGElement, prop: Prop, v: string) => {
      let prev = written.get(node);
      if (!prev) written.set(node, (prev = {}));
      if (prev[prop] === v) return;
      prev[prop] = v;
      node.style[prop] = v;
    };
    const reveal = (node: HTMLElement, phase: number, start: number, lift = 10, span = 0.07, scale = 0) => {
      const p = expo((phase - start) / span);
      set(node, "display", phase < start ? "none" : "");
      set(node, "opacity", p.toFixed(3));
      set(node, "transform", p >= 1 ? "none" : `translate3d(0,${((1 - p) * lift).toFixed(2)}px,0) scale(${(1 - (1 - p) * scale).toFixed(4)})`);
    };

    // ── One player per conversation: each plays once per page load and never resets ──
    const players = cards.map((card, n) => {
      const q = <T extends Element = HTMLElement>(s: string) => card.querySelector<T>(s)!;
      const f = (name: string) => q(`[data-f="${name}"]`);
      const steps = card.querySelector<HTMLElement>("[data-steps]");
      const watch = card.querySelector<HTMLElement>(".ag-watch");
      return {
        t: n === 0 ? LEAD : watch ? CHECK : FOLLOW,
        phase: 0,
        wait: n ? GAP : 0,
        started: false,
        typed: -2,
        checked: -1,
        seq: q("[data-seq]"),
        composer: q("[data-composer]"),
        prompt: f("prompt"),
        text: f("prompt").textContent!.replace(/\s+/g, " ").trim(),
        status: f("status"),
        work: q("[data-work]"),
        done: q("[data-done]"),
        chev: q<SVGElement>(".ag-steps-chev"),
        steps,
        stepRows: steps ? [...steps.querySelectorAll<HTMLElement>("li > div")] : [],
        report: f("report"),
        table: f("table"),
        rows: [...f("table").querySelectorAll<HTMLElement>("[data-row]")],
        insight: card.querySelector<HTMLElement>('[data-f="insight"]'),
        followups: f("followups"),
        chips: [...f("followups").children] as HTMLElement[],
        checks: watch ? [...watch.querySelectorAll<HTMLElement>("[data-watch-row]")] : [],
        count: watch?.querySelector<HTMLElement>("[data-watch-count]") ?? null,
      };
    });
    type Player = (typeof players)[number];
    const lead = players[0];

    // A conversation longer than its window shows its latest turn, as the app scrolls to the end.
    function fit(p: Player) {
      const c = p.seq.firstElementChild as HTMLElement;
      const over = Math.max(0, c.scrollHeight - p.seq.clientHeight);
      set(c, "transform", over ? `translate3d(0,${-over}px,0)` : "none");
      set(p.seq, "maskImage", over > 4 ? "linear-gradient(to bottom,transparent 0,#000 28px)" : "none");
    }

    // Lev's thread as a pure function of phase: type, send, work, answer, table, follow-ups.
    function render(p: Player) {
      const { phase, t } = p;
      const count = Math.round(clamp((phase - 0.04) / 0.23) * p.text.length);
      const typing = phase < 0.3 && count > 0;
      const shown = typing ? count + (phase < 0.27 ? 0.5 : 0) : -1;
      if (shown !== p.typed) {
        p.typed = shown;
        p.composer.classList.toggle("is-typing", typing);
        p.composer.textContent = typing ? p.text.slice(0, count) : "Ask a follow-up…";
        if (typing && phase < 0.27) p.composer.insertAdjacentHTML("beforeend", '<span class="ag-caret"></span>');
      }
      reveal(p.prompt, phase, 0.3, 12, 0.05, 0.015);
      reveal(p.status, phase, 0.37, 8);
      set(p.work, "opacity", (1 - smooth((phase - t.work) / 0.02)).toFixed(3));
      set(p.work, "display", phase > t.work + 0.03 ? "none" : ""); // stops the shimmer once it's gone
      set(p.done, "opacity", smooth((phase - t.work - 0.03) / 0.02).toFixed(3));
      let collapse = 1;
      if (p.steps) {
        p.stepRows.forEach((r, i) => reveal(r, phase, 0.42 + 0.045 * i, 4, 0.045));
        collapse = expo(smooth((phase - 0.7) / 0.09));
        set(p.steps, "maxHeight", `${(14 * (1 - collapse)).toFixed(3)}rem`);
        set(p.steps, "opacity", (1 - collapse).toFixed(3));
      }
      set(p.chev, "transform", `rotate(${(-90 * collapse).toFixed(2)}deg)`);
      reveal(p.report, phase, t.report, 8);
      reveal(p.table, phase, t.table, 12, 0.07, 0.02);
      p.rows.forEach((r, i) => reveal(r, phase, t.table + 0.01 + t.row * i, 8));
      if (p.checks.length) check(p);
      if (p.insight) reveal(p.insight, phase, t.insight, 8);
      set(p.followups, "display", phase < t.chips ? "none" : "");
      p.chips.forEach((c, i) => reveal(c, phase, t.chips + 0.014 * i, 6, 0.05));
      fit(p);
    }

    // The tariff check: each row waits, spins, then ticks, one after another.
    function check(p: Player) {
      const from = p.t.table + 0.04;
      const total = p.checks.length;
      const n = Math.max(0, Math.min(total, Math.floor((p.phase - from) / CHECK_STEP)));
      const live = p.phase >= from && n < total;
      const key = n * 2 + (live ? 1 : 0);
      if (key === p.checked) return;
      p.checked = key;
      p.checks.forEach((r, i) => {
        const next = i < n ? "done" : i === n && live ? "check" : "wait";
        if (r.dataset.watchRow === next) return;
        r.dataset.watchRow = next;
        if (next === "done" && !reduced.matches) r.animate([{ opacity: 0.4, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.22,1,.36,1)" });
      });
      p.count!.textContent = n === total ? `${n} of ${total} current` : `${n} of ${total} checked`;
      p.report.textContent = n === total ? "All three schedules are current." : "Checking each schedule against the port’s latest revision.";
    }

    let W = 0;
    let H = 0;
    let introH = 0;
    let sectionH = 0;
    let chatY = 0;
    let cardW = 0;
    let cardH = 0;
    let gap = 24;
    let tileW = 0;
    let tileH = 0;
    let clock = 0;
    let raf = 0;
    let visible = false;

    // One ticker for every conversation still playing; it sleeps when none is. Each hands off to the next.
    const playing = () => players.some((p) => p.started && p.phase < 1);
    function tick(now: number) {
      raf = 0;
      if (document.hidden || !visible) return;
      const dt = clock ? now - clock : 0;
      clock = now;
      players.forEach((p, n) => {
        if (!p.started || p.phase >= 1) return;
        if (p.wait > 0) return void (p.wait -= dt);
        p.phase = clamp(p.phase + dt / p.t.ms);
        render(p);
        if (p.phase >= 1 && players[n + 1]) players[n + 1].started = true;
      });
      if (playing()) raf = requestAnimationFrame(tick);
    }
    function wake() {
      if (raf || !visible || document.hidden || !playing()) return;
      clock = 0;
      raf = requestAnimationFrame(tick);
    }
    function sleep() {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    // Starting skips any wait left from the hand-off.
    const start = (p: Player) => {
      p.wait = 0;
      if (p.started) return;
      p.started = true;
      wake();
    };
    // Reduced motion: show it finished.
    const finish = (p: Player) => {
      if (p.phase >= 1) return;
      p.started = true;
      p.phase = 1;
      render(p);
    };

    // ── Scroll: orbit, headline, rail ────────────────────────────────────────────────
    function update() {
      const top = el.getBoundingClientRect().top;
      const s = -top; // px scrolled past the section's top
      const hold = introH - H; // the headline sits centred for this long
      const pinAt = introH - chatY; // the first card sticks here

      // Orbit: in from beyond the viewport to a ring round the headline, a slow turn while it
      // holds, then the ring closes onto the rising card and the tiles fold in behind it.
      const live = s > -H && s < pinAt + 2;
      set(stage, "visibility", live ? "" : "hidden");
      if (live) {
        const enter = out3((s + H) / H);
        const close = inOut((s - hold) / Math.max(1, pinAt - hold));
        const turn = clamp((s + H) / (pinAt + H));
        const R = (2.1 - 1.1 * enter) * (1 - 0.08 * clamp(s / Math.max(1, hold))) * (1 - close);
        const rx = W * (W < 768 ? 0.44 : 0.4);
        const ry = H * (W < 768 ? 0.34 : 0.37);
        // The card's centre, in the stage's frame (the stage is stuck at the viewport's top).
        const cardMid = Math.max(chatY, top + introH) + cardH / 2 - H / 2;
        const fade = 1 - smooth((close - 0.72) / 0.26);
        tiles.forEach((node, i) => {
          const t = TILES[i];
          const a = (t.angle - 150 * (1 - turn)) * RAD;
          const x = Math.cos(a) * rx * R * t.r - tileW / 2;
          const y = Math.sin(a) * ry * R * t.r + cardMid * close - tileH / 2;
          const k = t.depth * (1 - 0.5 * close);
          set(node, "transform", `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${k.toFixed(3)})`);
          set(node, "opacity", fade.toFixed(3));
        });
      }

      const rise = smooth((s + 0.62 * H) / (0.42 * H));
      const leave = smooth((s - hold) / (0.34 * H));
      set(title, "opacity", (rise * (1 - leave)).toFixed(3));
      set(title, "transform", `translate3d(0,${((1 - rise) * 30).toFixed(1)}px,0)`);

      // The harbour slides up on its own clock as the first card nears its seat, and back down
      // the same way when scrolled back above it.
      harbor.classList.toggle("is-in", s >= hold + 0.85 * (pinAt - hold));

      // Everything unsticks together at the end; the section shrinks as it leaves:
      // 95% by the time it is out of view, carrying on to 92% unseen.
      const exit = clamp((H - top - sectionH) / (1.6 * H));
      set(el, "transform", exit > 0 ? `scale(${(1 - 0.08 * exit).toFixed(4)})` : "");
      set(el, "transformOrigin", exit > 0 ? `50% ${(H / 2 - top).toFixed(1)}px` : "");

      // Lev's runway: chat by unit 60, the next cards arrive by 72, the rail runs 72 → 252.
      const units = ((s - pinAt) / H) * 100;
      const i = units - 72;
      const ramp = (x: number) => 12 * ((x / 12) ** 3 - 0.5 * (x / 12) ** 4);
      const position = i <= 0 ? 0 : i >= 180 ? 3 : (3 * (i < 12 ? ramp(i) : i > 168 ? 168 - ramp(180 - i) : i - 6)) / 168;
      const arrive = smooth((units - 60) / 12);
      set(track, "transform", `translate3d(${(-position * (cardW + gap)).toFixed(1)}px,0,0)`);
      cards.forEach((c, n) => {
        const d = clamp(Math.abs(position - n));
        set(c, "opacity", (n ? arrive : 1).toFixed(3)); // no falloff: frosted glass reads clear when faded
        set(c, "transform", `translate3d(${n ? (28 * (1 - arrive)).toFixed(1) : 0}px,0,0) scale(${(1 - 0.04 * d).toFixed(4)})`);
      });

      // The first conversation plays once its card pins; the rest follow it in turn, or jump
      // the queue as their card nears the centre.
      if (units >= 0) start(lead);
      players.forEach((p, n) => n && position >= n - 0.35 && start(p));
    }

    function measure() {
      W = window.innerWidth;
      H = window.innerHeight;
      introH = intro.offsetHeight;
      sectionH = el.offsetHeight;
      chatY = parseFloat(getComputedStyle(pin).top) || 0;
      cardW = cards[0].offsetWidth;
      cardH = cards[0].offsetHeight;
      gap = parseFloat(getComputedStyle(track).columnGap) || 24;
      tileW = tiles[0].offsetWidth;
      tileH = tiles[0].offsetHeight;
      players.forEach(render);
      if (!reduced.matches) update();
    }

    // ── Wiring ───────────────────────────────────────────────────────────────────────
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) wake();
      else sleep();
    });
    io.observe(pin);
    const onScroll = () => {
      if (!reduced.matches) update();
    };
    const onVisibility = () => (document.hidden ? sleep() : wake());
    const applyMotion = () => {
      el.classList.toggle("is-reduced", reduced.matches);
      if (reduced.matches) {
        sleep();
        harbor.classList.add("is-in");
        el.style.transform = el.style.transformOrigin = "";
        written = new WeakMap();
        [track, ...cards, ...tiles, title].forEach((n) => (n.style.transform = n.style.opacity = ""));
        players.forEach(finish);
      }
      measure();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", applyMotion);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (prefersReducedMotion()) players.forEach((p) => (p.phase = 1));
    applyMotion();

    return () => {
      sleep();
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", applyMotion);
    };
  }, []);

  return (
    <section ref={root} className="ag" id="assistant" aria-labelledby="ag-title">
      <Stage />
    </section>
  );
}
