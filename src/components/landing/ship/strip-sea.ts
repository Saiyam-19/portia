import type { OceanCamera } from "../ocean/renderer";
import { iso } from "./iso";
import { REAR, REAR_ELEVATION } from "./scene";

const TOP = 16; // viewBox units

/**
 * The strip's sea: the hero's FFT ocean, live, seen from the strip's own camera. The band spans the
 * viewBox's full width, from above the horizon down to the quay.
 */
export const STRIP_SEA = {
  top: TOP,
  height: 180,
  camera: { azimuth: -90, elevation: REAR_ELEVATION, fade: [0.12, 0.95] } satisfies OceanCamera,
  /** Lattice node (0, 0) on world (0, 0, 0) in viewBox units, so the wake's dots land on the sea's. */
  anchor: (() => {
    const [x, y] = iso([0, 0, 0], REAR.P);
    return [x, y - TOP] as const;
  })(),
};
