// Original icons of the FORM environment commands (drawn from scratch: purple T-spline bodies with their control
// cage, blue action arrows, orange curves). No Autodesk artwork.
import { registerIcons, registerFeatureIcons } from "../icons/icons.js";
import { ln, pl, pg, pa, ci, rc, tx, dash, arrow, C } from "../icons/draw.js";

const PUR = "#cdbff0", PURD = "#5b3d8f", PURM = "#7a5cb3", HI = "#ebe4fb";
const GREEN = "#2fae3a";
const dot = (x, y, f = "#efe9fb") => rc(x - 1.5, y - 1.5, 3, 3, f, PURD, 0.8);
const blob = (d) => pa(d, PUR, PURD, 1.1);
const grid = (x0, y0, x1, y1, n = 2, m = 2, sk = 0) => {
  // skewed quad grid (a T-spline patch seen at an angle)
  const P = (u, v) => [x0 + (x1 - x0) * u + sk * v, y0 + (y1 - y0) * v];
  let o = pg([P(0, 0), P(1, 0), P(1, 1), P(0, 1)], PUR, PURD, 1);
  for (let i = 1; i < n; i++) o += pl([P(i / n, 0), P(i / n, 1)], PURM, 0.8);
  for (let j = 1; j < m; j++) o += pl([P(0, j / m), P(1, j / m)], PURM, 0.8);
  return o;
};
const cube = () => {
  let o = pg([[6, 11], [17, 6], [27, 10], [16, 15]], "#e2d9f7", PURD, 1);
  o += pg([[6, 11], [16, 15], [16, 27], [6, 22]], PUR, PURD, 1);
  o += pg([[16, 15], [27, 10], [27, 22], [16, 27]], "#b8a6e6", PURD, 1);
  o += pl([[11, 13], [11, 24.5]], PURM, 0.7) + pl([[21.5, 12.5], [21.5, 24.5]], PURM, 0.7) + pl([[6, 16.5], [16, 21], [27, 16]], PURM, 0.7) + pl([[11.5, 8.5], [22, 12.5]], PURM, 0.7);
  return o;
};
const sphereBody = (cx = 16, cy = 16, r = 11) => ci(cx, cy, r, PUR, PURD, 1.1) + pa(`M${cx - r} ${cy}c0 4 ${r * 2} 4 ${r * 2} 0`, null, PURM, 0.7) + pa(`M${cx} ${cy - r}c-4 0-4 ${r * 2} 0 ${r * 2}`, null, PURM, 0.7) + pa(`M${cx - r * 0.55} ${cy - r * 0.55}c2-2 5-2.5 7-2`, null, HI, 1.6);
const blueArrow = (pts, o = {}) => arrow(pts, { w: 1.8, hl: 4.2, hw: 5.2, ...o });
const edgeHi = (pts) => pl(pts, C.blue, 2.2);
const sketchCurve = (d) => pa(d, null, C.sketch, 1.6);

const ICONS = {
  TSplinePrimitiveBoxCommand: () => cube(),
  TSplinePrimitivePlaneCommand: () => grid(4, 11, 24, 23, 3, 2, 4),
  TSplinePrimitiveCylinderCommand: () => pa("M7 9v14c0 3 4 5 9 5s9-2 9-5V9", PUR, PURD, 1.1) + pa("M7 9c0-3 4-5 9-5s9 2 9 5-4 5-9 5-9-2-9-5z", "#e2d9f7", PURD, 1) + pl([[12, 13.5], [12, 27.5]], PURM, 0.7) + pl([[20, 13.5], [20, 27.5]], PURM, 0.7) + pa("M7 16c0 3 4 5 9 5s9-2 9-5", null, PURM, 0.7),
  TSplinePrimitiveSphereCommand: () => sphereBody(),
  TSplinePrimitiveTorusCommand: () => pa("M3 16c0-5 6-9 13-9s13 4 13 9-6 9-13 9S3 21 3 16z", PUR, PURD, 1.1) + pa("M10 16c0-2 3-3 6-3s6 1 6 3-3 3-6 3-6-1-6-3z", "#fff", PURD, 1) + pa("M3 16c3 2 7 3 7 0M29 16c-3 2-7 3-7 0", null, PURM, 0.7),
  TSplinePrimitiveQuadBallCommand: () => sphereBody() + pg([[10, 10], [22, 10], [22, 22], [10, 22]], null, PURM, 0.7),
  TSplinePrimitivePipe: () => sketchCurve("M4 27c4-10 8-18 24-21") + pa("M4 23c4-9 9-16 22-19l3 5C17 12 12 18 9 26z", PUR, PURD, 1) + pa("M6.5 25c4-9 8-15 21-18", null, PURM, 0.7),
  TSplineAppendFaceCommand: () => pg([[5, 23], [14, 8], [27, 11], [24, 26]], PUR, PURD, 1.1) + dot(5, 23) + dot(14, 8) + dot(27, 11) + dot(24, 26),
  TSplineExtrudeCommand: () => pa("M5 26l7-4h14l-7 4z", null, C.sketch, 1.6) + pa("M5 26V12l7-4h14v14l-7 4", PUR, PURD, 1) + pl([[12, 8], [12, 22]], PURM, 0.7) + pl([[5, 19], [12, 15], [26, 15]], PURM, 0.7) + blueArrow([[19, 15], [19, 3]]),
  TSplineRevolveCommand: () => ln(16, 2, 16, 30, C.axis, 1.2, dash(2.4, 1.6)) + pa("M16 6c-8 0-11 4-11 10s3 10 11 10c8 0 11-4 11-10S24 6 16 6z", PUR, PURD, 1.1) + pa("M16 6c-3 3-4 6-4 10s1 7 4 10", null, PURM, 0.7) + sketchCurve("M16 6c4 3 5 6 5 10s-1 7-5 10"),
  TSplineSweepCommand: () => sketchCurve("M4 26c6 0 8-3 10-8s6-11 14-11") + pa("M2 22c6 0 8-3 10-8s6-10 14-10l4 6c-7 0-9 4-11 9s-6 11-13 11z", PUR, PURD, 1) + pl([[12, 14], [16, 19]], PURM, 0.7),
  TSplineLoft: () => pa("M5 8c4-3 9-3 13 0M9 26c3-2 8-2 12 0", null, C.sketch, 1.6) + pa("M5 8c4-3 9-3 13 0l3 18c-4-2-9-2-12 0z", PUR, PURD, 1) + pa("M7 17c4-2 9-2 13 0", null, PURM, 0.7),
  TSplineEditCommand: () => grid(3, 14, 21, 27, 2, 2, 5) + blueArrow([[16, 20], [16, 4]]) + blueArrow([[16, 20], [29, 20]], { fill: C.red, stroke: C.redEdge }),
  TSplineEditByCurveCmd: () => grid(3, 13, 22, 27, 2, 2, 5) + sketchCurve("M4 11c6-6 14 4 24-3") + ci(4, 11, 1.6, "#fff", C.sketchDark, 0.9) + ci(16, 9, 1.6, "#fff", C.sketchDark, 0.9) + ci(28, 8, 1.6, "#fff", C.sketchDark, 0.9),
  TSplineInsertEdgeCommand: () => grid(3, 8, 23, 26, 2, 2, 5) + edgeHi([[8.3, 8], [13.3, 26]]) + pl([[10.8, 8], [15.8, 26]], C.green, 1.4, dash(2, 1.4)),
  TSplineSubsetCmd: () => grid(3, 7, 22, 26, 1, 1, 6) + pl([[12.5, 7], [15.5, 26]], C.blue, 1.4) + pl([[6, 16.5], [25, 16.5]], C.blue, 1.4),
  TSplineInsertPointCommand: () => grid(3, 8, 22, 26, 2, 1, 5) + edgeHi([[3, 17], [27.5, 17]]) + ci(3, 17, 2, "#fff", C.blueEdge, 1) + ci(27.5, 17, 2, "#fff", C.blueEdge, 1),
  TSplineMergeEdgeCmd: () => grid(2, 6, 13, 26, 1, 2) + grid(19, 6, 30, 26, 1, 2) + blueArrow([[13, 16], [19, 16]], { both: true }),
  TSplineBridgeSubDCmd: () => grid(2, 4, 12, 12, 1, 1) + grid(20, 20, 30, 28, 1, 1) + pa("M12 12c4 1 7 4 8 8M2 12c6 4 12 9 18 16", null, C.blue, 1.4, dash(2, 1.4)),
  TSplineFillHoleCmd: () => grid(3, 5, 29, 27, 3, 3) + pg([[11.7, 12.3], [20.3, 12.3], [20.3, 19.7], [11.7, 19.7]], "#fff", C.blue, 1.5, dash(2, 1.2)),
  TSplineEraseAndFillCmd: () => grid(3, 5, 29, 27, 3, 3) + pg([[11.7, 12.3], [20.3, 12.3], [20.3, 19.7], [11.7, 19.7]], "#9fd0f7", C.blue, 1.2) + ln(12.5, 13, 19.5, 19, C.red, 1.6) + ln(19.5, 13, 12.5, 19, C.red, 1.6),
  TSplineWeldCommand: () => grid(2, 8, 14, 26, 1, 2) + grid(18, 8, 30, 26, 1, 2) + ci(16, 17, 2.4, C.blue, C.blueEdge, 1) + ln(14, 17, 18, 17, C.blueEdge, 1.2),
  TSplineUnWeldCommand: () => grid(2, 8, 14, 26, 1, 2) + grid(18, 8, 30, 26, 1, 2) + edgeHi([[14, 8], [14, 26]]) + edgeHi([[18, 8], [18, 26]]),
  TSplineCreasedEdgeCommand: () => pa("M3 25l13-17 13 17z", PUR, PURD, 1.1) + edgeHi([[16, 8], [16, 25]]) + pa("M3 25l13-6 13 6", null, PURM, 0.7),
  TSplineUnCreaseEdgeCmd: () => pa("M3 25c3-12 8-17 13-17s10 5 13 17z", PUR, PURD, 1.1) + edgeHi([[16, 8], [16, 25]]),
  TSplineBevelEdgeCommand: () => pa("M3 26V12l6-6h20v20z", PUR, PURD, 1.1) + pg([[3, 12], [9, 6], [12, 9], [6, 15]], "#9fd0f7", C.blue, 1) + pl([[6, 15], [6, 26]], PURM, 0.7) + pl([[12, 9], [29, 9]], PURM, 0.7),
  TSplineSlideEdgeCommand: () => grid(3, 8, 23, 26, 2, 2, 5) + edgeHi([[13, 8], [18, 26]]) + blueArrow([[13, 4], [23, 4]], { both: true }),
  TSplineSmoothCmd: () => pa("M3 22c4-12 8-4 13-10s8 2 13-4v18H3z", PUR, PURD, 1.1) + pa("M3 22c6-6 14-6 26-8", null, C.blue, 1.4, dash(2, 1.2)),
  TSplineCylindrifyCmd: () => pa("M7 8c3-2 15-2 18 0v16c-3 2-15 2-18 0z", PUR, PURD, 1.1) + pa("M7 8c3 2 15 2 18 0", null, PURD, 0.9) + pa("M10 8.5c-1 4 1 9-1 15M22 8.5c1 5-1 9 1 15", null, C.blue, 1.2),
  TSplinePullSubDCmd: () => pa("M2 27h28", null, "#7f8a95", 2) + grid(4, 6, 26, 14, 2, 1, 2) + blueArrow([[15, 15], [15, 26]]),
  TSplineFlattenSubDCmd: () => pa("M3 20c5-9 9-12 13-12s8 3 13 12z", PUR, PURD, 1.1) + ln(2, 21, 30, 21, C.blue, 1.6) + blueArrow([[16, 10], [16, 19]]),
  TSplineStraightenCmd: () => pa("M3 22c5-8 9-1 13-8s8-3 13-7", null, PURD, 1.4) + ln(3, 22, 29, 7, C.blue, 1.4, dash(2, 1.4)) + dot(3, 22) + dot(16, 14) + dot(29, 7),
  TSplineMatchCmd: () => grid(3, 6, 20, 26, 2, 2) + pa("M26 4c3 7 3 15 0 24", null, C.sketch, 1.8) + blueArrow([[20, 16], [26, 16]]),
  TSplineInterpolateSubDCmd: () => pa("M3 23c5-12 9-12 13-6s8 6 13-6", null, PURD, 1.4) + pl([[3, 23], [9, 6], [22, 26], [29, 11]], PURM, 0.8, dash(1.6, 1.2)) + dot(9, 6) + dot(22, 26),
  TSplineThickenCommand: () => pa("M3 14c6-6 20-6 26 0v6c-6-6-20-6-26 0z", PUR, PURD, 1.1) + blueArrow([[16, 9], [16, 3]]) + pa("M3 20c6-6 20-6 26 0", null, PURM, 0.7),
  TSplineFreezeCmd: () => grid(3, 9, 23, 27, 2, 2, 5) + pa("M22 3v12M16.8 6l10.4 6M16.8 12l10.4-6", null, "#4a7bd0", 1.6),
  TSplineUnFreezeCmd: () => grid(3, 9, 23, 27, 2, 2, 5) + pa("M22 3v12M16.8 6l10.4 6M16.8 12l10.4-6", null, "#4a7bd0", 1.6) + ln(16, 15, 28, 3, C.red, 1.6),
  TSplineInternalMirrorSymmetryCmd: () => pa("M4 10c4-6 8-6 12-2 4-4 8-4 12 2v12c-4 6-8 6-12 2-4 4-8 4-12-2z", PUR, PURD, 1.1) + ln(16, 3, 16, 29, GREEN, 1.6),
  TSplineInternalCircularSymmetryCmd: () => sphereBody() + ln(16, 5, 16, 27, GREEN, 1.4) + ln(5, 16, 27, 16, GREEN, 1.4),
  TSplineReflectionMirrorSymmetryCmd: () => pa("M3 9c4-4 9-3 11 2v10c-2 5-7 6-11 2z", PUR, PURD, 1.1) + pa("M29 9c-4-4-9-3-11 2v10c2 5 7 6 11 2z", "#e2d9f7", PURD, 1) + ln(16, 3, 16, 29, GREEN, 1.4, dash(2, 1.4)),
  TSplineReflectionCircularSymmetryCmd: () => ci(16, 16, 3, null, GREEN, 1.2) + ci(16, 6, 4, PUR, PURD, 1) + ci(25, 21, 4, "#e2d9f7", PURD, 1) + ci(7, 21, 4, "#e2d9f7", PURD, 1),
  TSplineClearSymmetryCommand: () => pa("M4 10c4-6 8-6 12-2 4-4 8-4 12 2v12c-4 6-8 6-12 2-4 4-8 4-12-2z", PUR, PURD, 1.1) + ln(16, 3, 16, 29, GREEN, 1.4) + ln(8, 6, 24, 26, C.red, 1.8),
  TSplineIsolateSymmetryCmd: () => pa("M4 10c4-6 8-6 12-2 4-4 8-4 12 2v12c-4 6-8 6-12 2-4 4-8 4-12-2z", PUR, PURD, 1.1) + ln(16, 3, 16, 29, GREEN, 1.4) + pg([[19, 11], [26, 11], [26, 19], [19, 19]], "#f3b3b0", C.red, 1),
  TSplineToggleTessModeCmd: () => pg([[3, 8], [14, 5], [14, 25], [3, 22]], "#e2d9f7", PURD, 1, dash(1.6, 1.2)) + pa("M16 8c6-4 13 0 13 8s-7 12-13 8z", PUR, PURD, 1.1),
  TSplineRepairBodyCmd: () => grid(3, 10, 23, 28, 2, 2, 5) + pa("M21 4l6 6-3 3-6-6zM18 7l-5 5", "#9aa5b1", "#46525e", 1),
  TSplineMakeUniformCmd: () => grid(3, 6, 29, 26, 3, 3) + ci(16, 16, 2, C.blue, C.blueEdge, 0.8),
  TSplineCapSettingCommand: () => sphereBody(14, 16, 10) + pa("M23 26l3-8 3 8z", "#f4c430", "#a07a00", 0.9),
  TSplineBaseFeatureStop: () => ci(16, 16, 12, C.green, C.greenEdge, 1) + pl([[10, 16.5], [14.5, 21], [22.5, 11.5]], "#fff", 2.6),
  TSplineSaveAsTSMCommand: () => grid(3, 6, 21, 22, 2, 2) + rc(16, 18, 13, 11, "#fff", C.ink, 1) + tx(22.5, 26.3, "TSM", 5.2, C.ink),
};

export function registerFormIcons() {
  registerIcons(ICONS);
  registerFeatureIcons({ form: "TSplineBaseFeatureCreationCommand" });
}
