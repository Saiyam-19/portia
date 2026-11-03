"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "@/lib/landing/motion";

// The secondary sheet's background, the whole viewport once the sheet covers it. Scroll moves it
// along a journey `uJ` with one colour per stop: card (0), sea glass for the port (1.5), sand for
// the vessel (2.5), wheat for the estimate (3.5), and card again by the footer (5). Each stop also
// carries two soft fields, a deeper and a paler tone of itself, that drift as the journey goes on,
// warped a little so they never read as circles. Dithered so the long, faint ramps never band.
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uJ;

const vec3 CARD = vec3(0.992, 0.988, 0.969);
const vec3 PORT = vec3(0.886, 0.922, 0.898);
const vec3 VESSEL = vec3(0.953, 0.929, 0.835);
const vec3 EST = vec3(0.957, 0.890, 0.773);
const vec3 SEA = vec3(0.310, 0.435, 0.416);
const vec3 RUST = vec3(0.690, 0.341, 0.227);

vec3 base(float j) {
  vec3 c = CARD;
  c = mix(c, PORT, smoothstep(0.2, 1.3, j));
  c = mix(c, VESSEL, smoothstep(1.75, 2.25, j));
  c = mix(c, EST, smoothstep(2.75, 3.25, j));
  return mix(c, CARD, smoothstep(4.0, 4.9, j));
}

float field(vec2 p, vec2 c, vec2 r) {
  vec2 d = (p - c) / r;
  return exp(-dot(d, d) * 1.6);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float j = uJ;
  p += 0.06 * vec2(sin(p.y * 2.1 + j * 1.3), cos(p.x * 1.7 - j * 1.1));

  vec3 b = base(j);
  // How far into the coloured part of the journey (0 on the card at either end).
  float on = smoothstep(0.2, 1.3, j) * (1.0 - smoothstep(4.0, 4.9, j));
  vec3 deep = mix(b, mix(SEA, RUST, smoothstep(2.6, 3.6, j)), 0.16);
  vec3 pale = mix(b, vec3(1.0), 0.55);

  vec3 col = b;
  col = mix(col, deep, on * 0.7 * field(p, vec2(aspect * (0.1 + 0.16 * j), 0.15 + 0.12 * j), vec2(0.6 * aspect, 0.55)));
  col = mix(col, pale, on * 0.8 * field(p, vec2(aspect * (0.95 - 0.14 * j), 0.95 - 0.1 * j), vec2(0.5 * aspect, 0.5)));
  col = mix(col, deep, on * 0.35 * field(p, vec2(aspect * (0.75 + 0.05 * sin(j * 1.7)), 0.55 + 0.25 * cos(j * 1.3)), vec2(0.32 * aspect, 0.32)));

  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = vec4(col + (n - 0.5) / 255.0, 1.0);
}`;

const VERT = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

/** Rendered at half the css size: the image is all low frequency, and the browser's upscale is free. */
const RES = 0.5;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * A sticky full-viewport canvas behind everything in the sheet. The journey is keyed to the depth
 * section: its colour arrives as the section does, changes stop with the figure's three layers,
 * and leaves again across the harbour strip toward the footer. It draws only while its value is
 * still easing toward the scroll position and the sheet is on screen.
 */
export function SheetGradient() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    const sheet = cv?.parentElement?.parentElement;
    const section = sheet?.querySelector<HTMLElement>(".depth");
    const track = sheet?.querySelector<HTMLElement>("[data-track]");
    const strip = sheet?.querySelector<HTMLElement>("[data-strip]");
    if (!cv || !sheet || !section || !track) return;
    const gl = cv.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
    if (!gl) {
      cv.parentElement?.classList.add("is-static");
      return;
    }
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, "a");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      cv.parentElement?.classList.add("is-static");
      return;
    }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uJ = gl.getUniformLocation(prog, "uJ");

    // Scroll positions (window scrollY) where the journey reaches each stop; measured on refresh.
    let at = { in0: 0, in1: 1, track0: 1, track1: 2, out1: 3 };
    const measure = () => {
      const y = (el: Element) => el.getBoundingClientRect().top + window.scrollY;
      const vh = window.innerHeight;
      const t0 = y(track) - vh * 0.7;
      const t1 = y(track) + track.offsetHeight - vh;
      const end = strip ? y(strip) + strip.offsetHeight - vh * 0.35 : t1 + vh;
      at = { in0: y(section) - vh, in1: t0, track0: t0, track1: t1, out1: Math.max(end, t1 + 1) };
    };
    const journey = (s: number) => {
      if (s <= at.in1) return 1 * clamp((s - at.in0) / (at.in1 - at.in0 || 1), 0, 1);
      if (s <= at.track1) return 1 + 3 * clamp((s - at.track0) / (at.track1 - at.track0 || 1), 0, 1);
      return 4 + clamp((s - at.track1) / (at.out1 - at.track1), 0, 1);
    };

    let target = 0;
    let now = 0;
    let drawn = -1;
    let visible = false;
    let running = false;

    const draw = () => {
      gl.uniform1f(uJ, now);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawn = now;
    };
    // Exponential follow: scroll sets the target, the colours drift after it and come to rest.
    const tick = (_: number, dt: number) => {
      now += (target - now) * (1 - Math.exp(-dt / 420));
      if (Math.abs(target - now) < 1e-4) now = target;
      if (now !== drawn) draw();
      if (now === target) stop();
    };
    const start = () => {
      if (running || !visible) return;
      running = true;
      gsap.ticker.add(tick);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      gsap.ticker.remove(tick);
    };

    let sized = false; // a remount reuses the canvas at its old size, but this program has no uRes yet
    const resize = () => {
      const w = Math.max(1, Math.round(cv.clientWidth * RES));
      const h = Math.max(1, Math.round(cv.clientHeight * RES));
      if (sized && cv.width === w && cv.height === h) return;
      sized = true;
      cv.width = w;
      cv.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      draw();
    };

    const st = ScrollTrigger.create({
      trigger: sheet,
      start: "top bottom",
      end: "bottom top",
      onUpdate: () => {
        target = journey(window.scrollY);
        start();
      },
      onRefresh: () => {
        measure();
        target = now = journey(window.scrollY);
        draw();
      },
    });
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(sheet);
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    measure();
    resize();

    return () => {
      stop();
      st.kill();
      io.disconnect();
      ro.disconnect();
      // No loseContext(): a remount (StrictMode, fast refresh) gets this same context back from the canvas.
      gl.deleteProgram(prog);
    };
  }, []);

  return (
    <div className="sheet-bg" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
