// One dot per lattice point, riding the FFT surface (vgpu fft-ocean example, MIT), drawn in the
// ocean's original axonometric projection, behind the harbour artwork.
//
// Changes from the example:
// - Orthographic (azimuth 60°, elevation 24°, mirrored, z up) instead of a perspective camera:
//   the square lattice projects to staggered rows of evenly sized dots, with no horizon.
// - Ink on paper with ordinary alpha blending instead of additive light + bloom; the sea fades
//   out toward the top of the hero, where the headline sits.
// - Screen-space push away from the pointer, plus expanding rings from pointer travel (small)
//   and presses (wide). Both are stateless: the CPU only feeds positions and ages.

struct ParticleUniforms {
  axisX: vec4f,    // screen px per world unit along world x (xy), along world y (zw)
  frame: vec4f,    // origin px (xy), height px per world unit, lattice step along world x
  lattice: vec4f,  // first lattice index x, y, count x, count y
  viewport: vec4f, // width, height (device px), dpr, sim resolution
  sim: vec4f,      // world units per sim texel, displacement scale, dot radius (css px), sideways gain
  fade: vec4f,     // fade start, fade end (fraction of height), ink alpha, lattice step along world y
  ink: vec4f,      // rgb, conservative interaction/radius bound (device px)
  pointer: vec4f,  // x, y (device px), strength 0..1, reach (device px)
  ripples: array<vec4f, 8>, // x, y (device px), age (s), strength (presses 1, travel < 0.5)
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) pointCoord: vec2f,
  @location(1) alpha: f32,
};

@group(0) @binding(0) var<uniform> u: ParticleUniforms;
@group(0) @binding(1) var u_displacement: texture_2d<f32>;
@group(0) @binding(2) var u_normalFoam: texture_2d<f32>;

fn quadCorner(vertexIndex: u32) -> vec2f {
  switch (vertexIndex) {
    case 0u: { return vec2f(-1.0, -1.0); }
    case 1u: { return vec2f( 1.0, -1.0); }
    case 2u: { return vec2f(-1.0,  1.0); }
    default: { return vec2f( 1.0,  1.0); }
  }
}

fn toScreen(world: vec3f) -> vec2f {
  return u.frame.xy + world.x * u.axisX.xy + world.y * u.axisX.zw - vec2f(0.0, world.z * u.frame.z);
}

@vertex fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOut {
  var out: VertexOut;
  let nx = u32(u.lattice.z);
  if (instanceIndex >= nx * u32(u.lattice.w)) {
    out.position = vec4f(2.0, 2.0, 2.0, 1.0); // spare instance: off-screen, clipped
    return out;
  }
  let cell = vec2f(f32(instanceIndex % nx), f32(instanceIndex / nx)) + u.lattice.xy;
  let base = cell * vec2f(u.frame.w, u.fade.w);

  let res = i32(u.viewport.w);
  let tex = vec2u(((vec2i(floor(base / u.sim.x)) % res) + res) % res);
  let disp = textureLoad(u_displacement, tex, 0).xyz * u.sim.y;

  // Displacement is (x, height, y) in the simulation's y-up frame. Sideways chop is damped so
  // the lattice keeps its staggered rows and the swell reads as rows rising and falling.
  let dpr = u.viewport.z;
  let px = toScreen(vec3f(base + disp.xz * u.sim.w, disp.y)) * dpr;
  // Displaced positions are known now. Skip only dots guaranteed to remain
  // outside the viewport or in the fully transparent part of the fade.
  let margin = u.ink.w;
  if (px.x + margin < 0.0 || px.x - margin > u.viewport.x ||
      px.y + margin < u.fade.x * u.viewport.y || px.y - margin > u.viewport.y) {
    out.position = vec4f(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  let nf = textureLoad(u_normalFoam, tex, 0);

  let toDot = px - u.pointer.xy;
  let d = max(length(toDot), 0.001);
  let reach = u.pointer.w;
  let near = clamp(1.0 - d / reach, 0.0, 1.0);
  var offset = (toDot / d) * near * near * reach * 0.42 * u.pointer.z;
  var lift = near * near * u.pointer.z;

  for (var r = 0u; r < 8u; r++) {
    let ripple = u.ripples[r];
    if (ripple.w <= 0.0) { continue; }
    // Presses travel far and slowly fade: a wide, gentle ring. Travel rings stay small.
    let wide = smoothstep(0.5, 1.0, ripple.w);
    let speed = mix(170.0, 520.0, wide) * dpr;
    let width = mix(18.0, 46.0, wide) * dpr;
    let decay = mix(1.6, 0.55, wide);
    let toR = px - ripple.xy;
    let dr = max(length(toR), 0.001);
    let front = dr - ripple.z * speed;
    let falloff = min(ripple.w, 0.5) * 2.0 * exp(-ripple.z * decay);
    let ring = (exp(-pow(front / width, 2.0)) + 0.45 * exp(-pow((front + width * 2.6) / width, 2.0))) * falloff;
    offset += (toR / dr) * ring * 6.0 * dpr;
    lift += ring * 0.55;
  }
  let pos = px + offset;

  let crest = smoothstep(-0.5, 1.5, disp.y);
  let foam = clamp(nf.w, 0.0, 1.0);
  let y = pos.y / u.viewport.y;
  let fade = smoothstep(u.fade.x, u.fade.y, y);
  let radiusPx = u.sim.z * dpr * (1.0 + crest * 0.45 + lift * 0.5);

  let corner = quadCorner(vertexIndex);
  let ndc = vec2f(pos.x / u.viewport.x * 2.0 - 1.0, 1.0 - pos.y / u.viewport.y * 2.0);
  out.position = vec4f(ndc + corner * 2.0 * radiusPx / u.viewport.xy, 0.0, 1.0);
  out.pointCoord = corner;
  out.alpha = clamp((0.3 + crest * 0.45 + foam * 0.3 + lift * 0.35) * fade * u.fade.z, 0.0, 1.0);
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let r = length(in.pointCoord);
  if (r > 1.0) { discard; }
  let edge = 1.0 - smoothstep(0.55, 1.0, r);
  return vec4f(u.ink.rgb, in.alpha * edge);
}
