import { PI } from "./ocean-common.wgsl";

// These coefficients depend only on the FFT lane and stage, never on time.
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let index = position.x - 0.5;
  let size = f32(1u << (u32(position.y - 0.5) + 1u));
  let angle = 2.0 * PI * (index / size);
  return vec4f(cos(angle), sin(angle), 0.0, 0.0);
}
