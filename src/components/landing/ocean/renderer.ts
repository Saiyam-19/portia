// Particle ocean on WebGPU, adapted from vgpu's fft-ocean example (MIT, vercel-labs/vgpu).
//
// Per frame: evolve a Phillips spectrum, inverse-FFT it (two Stockham dispatches at 256²) into a
// displacement field, derive normals/foam, then draw a lattice of dots straight onto the canvas in
// its original axonometric projection (azimuth 60°, elevation 24°, mirrored).
// The example's perspective camera, HDR scene, bloom chain and present pass are dropped:
// dark ink on paper in a parallel projection needs none of them.

import type { Draw, Effect, Frame, Gpu, Target } from "vgpu";
import { frameSampler } from "../frame-sampler";
import ifftAxisWgsl from "./ifft-axis.wgsl";
import ifftTwiddlesWgsl from "./ifft-twiddles.wgsl";
import initialSpectrumWgsl from "./initial-spectrum.wgsl";
import noiseWgsl from "./noise.wgsl";
import normalFoamWgsl from "./normal-foam.wgsl";
import particlesWgsl from "./particles.wgsl";
import spectrumWgsl from "./spectrum.wgsl";

const RESOLUTION = 256; // must match RESOLUTION in noise.wgsl
const SIM_FORMAT = "rgba32float" as const;
const RIPPLES = 8;

const TUNING = {
  oceanSize: 200,
  worldSize: 400, // world units spanned by one tile of the simulation (it wraps)
  timeScale: 0.6,
  spectrumTimeScale: 0.5,
  loopPeriod: 40, // seconds of spectrum time before the sea repeats exactly
  windSpeed: 12.9,
  windAngle: 4.83,
  amplitude: 1.3,
  choppiness: 1.51,
  displacementScale: 0.005,
  pxPerUnit: 9.6, // css px per world unit (sets the swell's on-screen wavelength)
  dotPitch: 15, // css px between dots along each projected world axis (matches the ship's wake)
  heightGain: 2.4,
  sidewaysGain: 0.18,
  dotRadius: 1.4, // css px
  inkAlpha: 1,
};

/** Where the sea is seen from. The hero's is the original ocean camera, independent of the
 *  harbour's composition; the harbour strip shows the same sea from its own low camera. */
export type OceanCamera = {
  azimuth: number; // degrees
  elevation: number; // degrees
  fade: readonly [start: number, end: number]; // fraction of height where dots fade in
};
const HERO_CAMERA: OceanCamera = { azimuth: 60, elevation: 24, fade: [0.3, 0.6] };
const MAX_DOTS = RESOLUTION * RESOLUTION;

const INK = [37 / 255, 40 / 255, 32 / 255, 0] as const;
const PAPER = [247 / 255, 245 / 255, 236 / 255, 1] as const;
const TRANSPARENT = [0, 0, 0, 0] as const;

/** Projection basis and the lattice of dots needed to cover a w×h css-px canvas, with lattice
 *  node (0, 0) at `anchor` (css px) so the ship's wake dots land on the same nodes. */
function layout(w: number, h: number, anchor: readonly [number, number] | null, cam: OceanCamera) {
  const k = TUNING.pxPerUnit;
  const A = (cam.azimuth * Math.PI) / 180, E = (cam.elevation * Math.PI) / 180;
  const ax: [number, number] = [-Math.sin(A) * k, Math.cos(A) * Math.sin(E) * k];
  const ay: [number, number] = [Math.cos(A) * k, Math.sin(A) * Math.sin(E) * k];
  const origin: [number, number] = anchor ? [anchor[0], anchor[1]] : [w / 2, h / 2];
  // Invert the 2×2 basis to find which world cells the canvas corners land on.
  const det = ax[0] * ay[1] - ay[0] * ax[1];
  const toWorld = (sx: number, sy: number) => {
    const dx = sx - origin[0], dy = sy - origin[1];
    return [(dx * ay[1] - ay[0] * dy) / det, (ax[0] * dy - dx * ax[1]) / det];
  };
  const m = 48; // margin for pointer push, ripples and wave lift
  const corners = [toWorld(-m, -m), toWorld(w + m, -m), toWorld(-m, h + m * 3), toWorld(w + m, h + m * 3)];
  // World step per axis so each projected axis has the same on-screen pitch.
  let sx = TUNING.dotPitch / Math.hypot(...ax);
  let sy = TUNING.dotPitch / Math.hypot(...ay);
  const span = (i: 0 | 1) => [Math.min(...corners.map((c) => c[i])), Math.max(...corners.map((c) => c[i]))];
  const [x0, x1] = span(0), [y0, y1] = span(1);
  // Very large screens: thin the lattice rather than exceed the instance budget.
  while (Math.ceil((x1 - x0) / sx) * Math.ceil((y1 - y0) / sy) > MAX_DOTS) (sx *= 1.25), (sy *= 1.25);
  const first = [Math.floor(x0 / sx), Math.floor(y0 / sy)];
  const count = [Math.ceil((x1 - x0) / sx) + 1, Math.ceil((y1 - y0) / sy) + 1];
  const fade = cam === HERO_CAMERA && w < 1024 ? [0.42, 0.66] : cam.fade;
  return {
    axisX: [...ax, ...ay],
    frame: [...origin, Math.cos(E) * k * TUNING.heightGain, sx],
    lattice: [...first, ...count],
    fade: [...fade, TUNING.inkAlpha, sy],
  };
}

type Ripple = [x: number, y: number, age: number, strength: number];

export type OceanRenderer = {
  ready: Promise<void>;
  setPaused(paused: boolean): void;
  /** Lattice origin in css px relative to the canvas (null = centred). */
  setAnchor(anchor: readonly [number, number] | null): void;
  dispose(): void;
};

type OceanOptions = {
  still: boolean;
  camera?: OceanCamera;
  /** Push and ripple the dots under the pointer (default true). */
  pointer?: boolean;
  /** Dots only, over whatever is behind the canvas, instead of on paper. */
  transparent?: boolean;
};

export function createOcean(canvas: HTMLCanvasElement, opts: OceanOptions): OceanRenderer {
  const cam = opts.camera ?? HERO_CAMERA;
  const paper = opts.transparent ? TRANSPARENT : PAPER;
  let disposed = false;
  let paused = false;
  let visible = true;
  let gpu: Gpu | undefined;
  let pixelRatio = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
  let resizeSurface: (() => void) | undefined;
  let sizeObserver: ResizeObserver | undefined;
  let loop: { stop(): void } | undefined;
  let unsubscribe: (() => void) | undefined;
  let render: ((time: number, dt: number) => void) | undefined;
  let time = 0;
  let last = 0;
  const sampler = frameSampler(canvas);
  let anchor: readonly [number, number] | null = null;
  let relayout: (() => void) | undefined;
  let bounds = canvas.getBoundingClientRect();
  const updateBounds = () => { bounds = canvas.getBoundingClientRect(); };

  // Pointer state, all in device pixels relative to the canvas.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, on: false, strength: 0 };
  const ripples: Ripple[] = Array.from({ length: RIPPLES }, () => [0, 0, 0, 0]);
  let nextRipple = 0;
  let travel = 0;

  const spawn = (x: number, y: number, strength: number) => {
    ripples[nextRipple] = [x, y, 0, strength];
    nextRipple = (nextRipple + 1) % RIPPLES;
  };

  const ready = (async () => {
    const vgpu = await import("vgpu");
    if (disposed) return;
    const g = await vgpu.init({ powerPreference: "low-power" });
    if (disposed) return g.dispose();
    gpu = g;
    if (process.env.NODE_ENV === "development") {
      const info = g.gpu.adapterInfo;
      canvas.dataset.adapter = JSON.stringify({ vendor: info?.vendor, architecture: info?.architecture, device: info?.device, description: info?.description });
    }
    // vgpu's default autoResize reads clientWidth/clientHeight at the start of
    // every frame. After SVG/GSAP writes that forces synchronous page layout.
    // Keep the same pixel resolution, but measure only when the canvas resizes.
    const out = vgpu.surface(g, canvas, { autoResize: false, dpr: pixelRatio, clearColor: paper, alphaMode: opts.transparent ? "premultiplied" : "opaque" });
    resizeSurface = () => {
      pixelRatio = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
      out.resize([Math.round(canvas.clientWidth * pixelRatio), Math.round(canvas.clientHeight * pixelRatio)]);
      relayout?.();
      if (!loop) render?.(time, 0);
    };
    sizeObserver = new ResizeObserver(() => resizeSurface?.());
    sizeObserver.observe(canvas);

    const sim = (name: string) => vgpu.target(g, { size: [RESOLUTION, RESOLUTION], format: SIM_FORMAT, label: `ocean-${name}` });
    const noise = sim("noise"), h0 = sim("h0"), spectrum = sim("spectrum"), normals = sim("normals");
    const twiddles = vgpu.target(g, { size: [RESOLUTION, 8], format: SIM_FORMAT, label: "ocean-ifft-twiddles" });
    const twiddlesFx = vgpu.effect(g, ifftTwiddlesWgsl);

    const fx = (shader: Parameters<typeof vgpu.effect>[1], bindings: Record<string, unknown>) =>
      vgpu.effect(g, shader).set(bindings);
    const noiseFx = vgpu.effect(g, noiseWgsl);
    const initialFx = fx(initialSpectrumWgsl, {
      u: { resolution: RESOLUTION, size: TUNING.oceanSize, windSpeed: TUNING.windSpeed, windAngle: TUNING.windAngle, amplitude: TUNING.amplitude },
      u_noise: noise,
    });
    const evolveFx = fx(spectrumWgsl, {
      u: { resolution: RESOLUTION, size: TUNING.oceanSize, time: 0, choppiness: TUNING.choppiness, loopPeriod: TUNING.loopPeriod },
      u_initialSpectrum: h0,
    });
    const field = (label: string) => vgpu.texture(g, { kind: "2d", size: [RESOLUTION, RESOLUTION], format: SIM_FORMAT, usage: ["texture_binding", "storage_binding", "copy_src"], label });
    const horizontal = field("ocean-ifft-horizontal");
    const displacement = field("ocean-ifft-displacement");
    const axes = [
      vgpu.compute(g, ifftAxisWgsl).set({ u: { horizontal: 1 }, u_input: spectrum, u_output: horizontal, u_twiddles: twiddles }),
      vgpu.compute(g, ifftAxisWgsl).set({ u: { horizontal: 0 }, u_input: horizontal, u_output: displacement, u_twiddles: twiddles }),
    ];
    const normalsFx = fx(normalFoamWgsl, {
      u: { resolution: RESOLUTION, worldSize: TUNING.worldSize, displacementScale: TUNING.displacementScale, foamThreshold: 0 },
      u_displacement: displacement,
    });
    const makeParticles = (): Draw => vgpu
      .draw(g, {
        shader: particlesWgsl,
        geometry: { vertexCount: 4, topology: "triangle-strip" },
        instances: MAX_DOTS,
        blend: {
          color: { src: "src-alpha", dst: "one-minus-src-alpha" },
          alpha: { src: "one", dst: "one-minus-src-alpha" },
        },
      })
      .set({ u_displacement: displacement, u_normalFoam: normals });
    const particles = makeParticles();
    let dotCount = 0;

    const setConstants = () => {
      const l = layout(out.size[0] / pixelRatio, out.size[1] / pixelRatio, anchor ? [anchor[0], anchor[1]] : null, cam);
      dotCount = Math.min(MAX_DOTS, l.lattice[2]! * l.lattice[3]!);
      particles.set({
        u: {
          axisX: l.axisX,
          frame: l.frame,
          lattice: l.lattice,
          viewport: [out.size[0], out.size[1], pixelRatio, RESOLUTION],
          sim: [TUNING.worldSize / RESOLUTION, TUNING.displacementScale, TUNING.dotRadius, TUNING.sidewaysGain],
          fade: l.fade,
          ink: INK,
          pointer: [0, 0, 0, 1],
          ripples,
        },
      });
    };
    setConstants();
    relayout = setConstants;
    unsubscribe = out.onResize(() => { updateBounds(); setConstants(); });

    await Promise.all([
      noiseFx.compile(noise),
      twiddlesFx.compile(twiddles),
      initialFx.compile(h0),
      evolveFx.compile(spectrum),
      ...axes.map((axis) => axis.compile()),
      normalsFx.compile(normals),
      particles.compile(out),
    ]);
    if (disposed) return;

    let seeded = false;
    const pass = (f: Frame, target: Target, drawable: Draw | Effect) =>
      f.pass({ target, clear: TRANSPARENT }, (encoder) => encoder.draw(drawable));

    render = (t, dt) => {
      // Ease the pointer push in/out and toward the cursor; age the ripples.
      pointer.strength += ((pointer.on ? 1 : 0) - pointer.strength) * Math.min(1, dt * 6);
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 14);
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 14);
      for (const r of ripples) if (r[3] > 0 && (r[2] += dt) > 4.5) r[3] = 0;

      const spectrumTime = (t * TUNING.timeScale * TUNING.spectrumTimeScale) % TUNING.loopPeriod;
      evolveFx.set({ u: { time: spectrumTime } });
      const activeRipples = ripples.reduce((n, r) => n + (r[3] > 0 ? 1 : 0), 0);
      // Conservative bounds on every pointer/ripple displacement and dot radius.
      // Allows exact culling of invisible vertices, without thinning the lattice.
      const reach = pixelRatio * (110 * .42 * pointer.strength + activeRipples * 8.7 + TUNING.dotRadius * (1.45 + (pointer.strength + activeRipples * .7975) * .5) + 1);
      const dynamic = { pointer: [pointer.x, pointer.y, pointer.strength, 110 * pixelRatio], ripples, ink: [INK[0], INK[1], INK[2], reach] };
      particles.set({ u: dynamic });

      vgpu.frame(g, (f) => {
        if (!seeded) {
          pass(f, twiddles, twiddlesFx);
          pass(f, noise, noiseFx);
          pass(f, h0, initialFx);
          seeded = true;
        }
        pass(f, spectrum, evolveFx);
        f.computePass((encoder) => { for (const axis of axes) encoder.dispatch(axis, RESOLUTION); });
        pass(f, normals, normalsFx);
        f.pass({ target: out, clear: paper }, (encoder) => encoder.draw(particles, { instances: dotCount }));
      });
    };

    if (process.env.NODE_ENV === "development" && new URLSearchParams(location.search).has("verifyFFT")) {
      const { verifyFFT } = await import("./fft.check");
      canvas.dataset.fftComparison = JSON.stringify(await verifyFFT(vgpu, g, spectrum, displacement, render));
    }
    render(time, 0);
    start();
  })();

  // Our own clock, so pausing freezes the sea and resuming carries on without a jump.
  // Runs at the display's refresh rate.
  function start() {
    if (opts.still || disposed || paused || !visible || document.hidden || !render || loop || !gpu) return;
    last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      sampler?.begin(now);
      last = now;
      time += dt;
      render?.(time, dt);
      sampler?.end();
    });
    loop = { stop: () => cancelAnimationFrame(raf) };
  }
  function stop() {
    loop?.stop();
    loop = undefined;
    sampler?.reset();
  }

  // Pointer input, translated into canvas device pixels.
  const local = (e: PointerEvent) => {
    const r = bounds;
    const dpr = pixelRatio;
    return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const p = local(e);
    if (!pointer.on) {
      pointer.x = p.x;
      pointer.y = p.y;
    }
    travel += Math.hypot(p.x - pointer.tx, p.y - pointer.ty);
    pointer.tx = p.x;
    pointer.ty = p.y;
    pointer.on = p.inside && !paused;
    // Leave a soft ring behind every stretch of travel.
    if (pointer.on && travel > 90 * pixelRatio) {
      travel = 0;
      spawn(p.x, p.y, 0.35);
    }
  };
  const onLeave = () => (pointer.on = false);
  const onDown = (e: PointerEvent) => {
    if (paused || (e.target as Element).closest("a,button,input,label,[role=button],[data-no-ripple]")) return;
    const p = local(e);
    if (p.inside) spawn(p.x, p.y, 1);
  };
  const onVisibility = () => (document.hidden ? stop() : start());
  const onResize = () => { updateBounds(); resizeSurface?.(); };
  window.addEventListener("resize", onResize, { passive: true });
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
    else stop();
  });

  if (!opts.still && opts.pointer !== false) {
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", updateBounds, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerdown", onDown, { passive: true });
  }
  if (!opts.still) {
    document.addEventListener("visibilitychange", onVisibility);
    io.observe(canvas);
  }

  return {
    ready,
    setAnchor(next) {
      anchor = next;
      relayout?.();
      if (loop === undefined) render?.(time, 0);
    },
    setPaused(next) {
      paused = next;
      if (next) {
        pointer.on = false;
        stop();
      } else start();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", updateBounds);
      window.removeEventListener("resize", onResize);
      sizeObserver?.disconnect();
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe?.();
      gpu?.dispose();
    },
  };
}
