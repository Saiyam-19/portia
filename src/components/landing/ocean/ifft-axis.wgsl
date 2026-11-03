import { cmul } from "./ocean-common.wgsl";

// One workgroup owns a complete row/column. Keep the eight Stockham stages in
// shared memory instead of round-tripping the whole field through render targets.
struct AxisUniforms { horizontal: u32 };
@group(0) @binding(0) var<uniform> u: AxisUniforms;
@group(0) @binding(1) var u_input: texture_2d<f32>;
@group(0) @binding(2) var u_output: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var u_twiddles: texture_2d<f32>;
var<workgroup> values: array<vec4f, 256>;

@compute @workgroup_size(256)
fn cs_main(@builtin(local_invocation_index) lane: u32, @builtin(workgroup_id) group: vec3u) {
  let coord = select(vec2u(group.x, lane), vec2u(lane, group.x), u.horizontal != 0u);
  values[lane] = textureLoad(u_input, coord, 0);
  workgroupBarrier();
  for (var stage = 1u; stage <= 8u; stage++) {
    let size = f32(1u << stage);
    let index = f32(lane);
    let evenIndex = u32(floor(index / size) * (size * 0.5) + (index % (size * 0.5)));
    let even = values[evenIndex];
    let odd = values[evenIndex + 128u];
    let twiddle = textureLoad(u_twiddles, vec2u(lane, stage - 1u), 0).xy;
    let result = vec4f(even.xy + cmul(twiddle, odd.xy), even.zw + cmul(twiddle, odd.zw));
    // All lanes must finish reading the previous stage before any overwrite it.
    workgroupBarrier();
    values[lane] = result;
    workgroupBarrier();
  }
  textureStore(u_output, coord, values[lane]);
}
