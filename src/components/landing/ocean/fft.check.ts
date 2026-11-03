import type { Gpu, Target, Texture } from "vgpu";
import referenceWgsl from "./ifft-stage.wgsl";

/** GPU regression seam: ?verifyFFT in development compares every float against
 * the original sixteen-pass renderer at six points across the wave loop. */
export async function verifyFFT(vgpu: typeof import("vgpu"), gpu: Gpu, spectrum: Target, displacement: Texture, render: (time: number, dt: number) => void) {
  const resolution = 256;
  const ping = vgpu.target(gpu, { size: [resolution, resolution], format: "rgba32float" });
  const pong = vgpu.target(gpu, { size: [resolution, resolution], format: "rgba32float" });
  const stages = Array.from({ length: 16 }, (_, index) => {
    const output = index % 2 ? pong : ping;
    const input = index === 0 ? spectrum : output === ping ? pong : ping;
    const effect = vgpu.effect(gpu, referenceWgsl).set({ u: { resolution, subtransformSize: 2 ** ((index % 8) + 1), horizontal: index < 8 ? 1 : 0 }, u_input: input });
    return { effect, output };
  });
  try {
    await Promise.all(stages.map(({ effect, output }) => effect.compile(output)));
    const comparisons = [];
    for (const time of [0, 1, 7.25, 31, 79, 133.3]) {
      render(time, 0);
      vgpu.frame(gpu, (frame) => { for (const stage of stages) frame.pass(stage.output, (pass) => pass.draw(stage.effect)); });
      const [actual, reference] = await Promise.all([displacement.read({ mipLevel: 0, region: "all" }), pong.color.read({ mipLevel: 0, region: "all" })]);
      const a = new Float32Array(actual.buffer, actual.byteOffset, actual.byteLength / 4);
      const b = new Float32Array(reference.buffer, reference.byteOffset, reference.byteLength / 4);
      let maxError = 0, mismatches = 0;
      for (let i = 0; i < a.length; i++) {
        if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) throw new Error(`Non-finite FFT output at ${time}:${i}`);
        maxError = Math.max(maxError, Math.abs(a[i]! - b[i]!));
        if (a[i] !== b[i]) mismatches++;
      }
      comparisons.push({ time, maxError, mismatches, values: a.length });
    }
    return comparisons;
  } finally {
    stages.forEach(({ effect }) => effect.dispose());
    ping.color.destroy();
    pong.color.destroy();
  }
}
