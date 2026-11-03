// Flatten the long quay edge while retaining the original receding-edge angle.
// For an orthographic camera: long slope = cot(a) sin(e), depth slope = tan(a) sin(e).
const RAD = Math.PI / 180;
const longSlope = Math.tan(7 * RAD);
const depthSlope = Math.tan(60 * RAD) * Math.sin(24 * RAD);
export const AZIMUTH = Math.atan(Math.sqrt(depthSlope / longSlope)) / RAD;
export const ELEVATION = Math.asin(Math.sqrt(depthSlope * longSlope)) / RAD;
