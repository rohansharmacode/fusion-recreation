// SKETCH contextual tab icons (CREATE / MODIFY / CONSTRAINTS / FINISH SKETCH).
// Sketch geometry is orange with white square points (like sketch curves in the canvas);
// projected / included geometry is purple; constraint icons show existing geometry in dark
// ink and the constrained element in orange.
import {
  S, ctx, C, ln, pl, pg, pa, ci, elp, rc, tx, dash, arrow, arcPts, bez, regPoly, spt, prism, box, cylinder, tint, isoEllipse,
  badge, sphere2, hquad, facePlane,
} from "./parts.js";
import { skl, skg, skp, cpt, construction, lineArrow, rrect2 } from "./draw.js";

const R = {};
const ink = (pts, w = 1.5) => pl(pts, C.ink, w);
const inkDash = (pts) => pl(pts, C.inkLight, 1.1, dash(2, 1.5));
const centerLine = (pts) => pl(pts, C.ink, 0.9, dash(4, 1.4));
const pts = (...ps) => ps.map(([x, y]) => spt(x, y)).join("");
const circle = (cx, cy, r, fill = C.profile) => ci(cx, cy, r, fill, C.sketch, 1.6);
/** Catmull-Rom spline through points, sampled. */
function through(P, n = 8) {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(P[P.length - 1]);
  return out;
}
/** Uniform cubic B-spline (open, clamped approx.) from control points. */
function bspline(P, n = 8) {
  const Q = [P[0], P[0], ...P, P[P.length - 1], P[P.length - 1]];
  const out = [];
  for (let i = 0; i < Q.length - 3; i++) for (let k = 0; k <= n; k++) {
    const t = k / n, b0 = (1 - t) ** 3 / 6, b1 = (3 * t ** 3 - 6 * t * t + 4) / 6, b2 = (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, b3 = t ** 3 / 6;
    out.push([0, 1].map((j) => b0 * Q[i][j] + b1 * Q[i + 1][j] + b2 * Q[i + 2][j] + b3 * Q[i + 3][j]));
  }
  return out;
}
const tri = (x, y, s = 3.2, fill = C.cons) => pg([[x, y - s], [x + s * 0.95, y + s * 0.6], [x - s * 0.95, y + s * 0.6]], fill, C.sketchDark, 0.8);

// ---------------------------------------------------------------- CREATE
R.DrawPolyline = () => skl([[6, 25], [26, 7]]) + pts([6, 25], [26, 7]);
R.SketchMidpointLine = () => skl([[4, 24], [28, 10]]) + pts([4, 24], [28, 10]) + tri(16, 17);
R.SketchConstrainer = () => skg([[5, 9], [27, 9], [27, 24], [5, 24]]) + pts([5, 9], [27, 24]) + badge.lock(24, 24, 0.9, C.cons);
R.ShapeRectangleTwoPoint = () => skg([[5, 8], [27, 8], [27, 24], [5, 24]]) + inkDash([[5, 8], [27, 24]]) + pts([5, 8], [27, 24]);
R.ShapeRectangleThreePoint = () => { const A = [4, 17], B = [15, 6], Cc = [25, 16], D = [14, 27]; return skg([A, B, Cc, D]) + pts(A, B, Cc); };
R.ShapeRectangleCenter = () => skg([[5, 8], [27, 8], [27, 24], [5, 24]]) + inkDash([[16, 16], [27, 24]]) + cpt(16, 16) + pts([27, 24]);
R.CircleCenterRadius = () => circle(16, 16, 11) + inkDash([[5, 16], [27, 16]]) + cpt(16, 16) + pts([27, 16]);
R.CircleTwoPoint = () => circle(16, 16, 11) + inkDash([[8.2, 23.8], [23.8, 8.2]]) + pts([8.2, 23.8], [23.8, 8.2]);
R.CircleThreePoint = () => { const p = (a) => [16 + 11 * Math.cos((a * Math.PI) / 180), 16 + 11 * Math.sin((a * Math.PI) / 180)]; return circle(16, 16, 11) + pts(p(200), p(320), p(80)); };
R.CircleTanTanRadius = () => ink([[3, 26], [29, 26]]) + ink([[6, 3], [6, 29]]) + circle(15, 17, 9) + pts([15, 26], [6, 17]);
R.CircleThreeTangent = () => ink([[2, 27.5], [30, 27.5]]) + ink([[2.5, 29], [17, 2.5]]) + ink([[29.5, 29], [15, 2.5]]) + circle(16, 19.2, 7.5);
R.ArcThreePoint = () => { const P = arcPts(16, 27, 13, 13, 205, 335, 20); return skl(P) + pts(P[0], P[10], P[20]); };
R.ArcCenterTwoPoint = () => { const P = arcPts(8, 25, 17, 17, -78, -8, 16); return inkDash([P[0], [8, 25], P[16]]) + skl(P) + cpt(8, 25) + pts(P[0], P[16]); };
R.ArcTangent = () => { const P = arcPts(15, 15, 9, 9, 90, -60, 16); return ink([[3, 24], [15, 24]]) + skl(P) + pts([15, 24], P[16]); };
R.ShapePolygonCircumscribed = () => skg(regPoly(16, 16, 12.5, 6, 0)) + ci(16, 16, 10.8, null, C.ink, 0.9, dash(2, 1.5)) + cpt(16, 16) + pts([16, 5.2]);
R.ShapePolygonInscribed = () => { const P = regPoly(16, 16, 11, 6, 0); return ci(16, 16, 11.5, null, C.ink, 0.9, dash(2, 1.5)) + skg(P) + cpt(16, 16) + pts(P[0]); };
R.ShapePolygonEdge = () => { const P = regPoly(16, 15, 11.5, 6, 0); return skg(P) + pts(P[1], P[2]); };
R.CircleElipse = () => elp(16, 16, 13, 7.5, C.profile, C.sketch, 1.6, { transform: "rotate(-25 16 16)" }) + inkDash([[4.2, 21.5], [27.8, 10.5]]) + cpt(16, 16) + pts([27.8, 10.5]);
const slot = (x1, x2, y, r) => `M${x1} ${y - r}H${x2}A${r} ${r} 0 0 1 ${x2} ${y + r}H${x1}A${r} ${r} 0 0 1 ${x1} ${y - r}Z`;
R.ShapeSlotCenterToCenter = () => skp(slot(10, 22, 16, 6.5), C.profile) + inkDash([[10, 16], [22, 16]]) + cpt(10, 16) + cpt(22, 16);
R.ShapeSlotOverall = () => skp(slot(10, 22, 16, 6.5), C.profile) + inkDash([[3.5, 16], [28.5, 16]]) + pts([3.5, 16], [28.5, 16]);
R.ShapeSlotCenterPoint = () => skp(slot(10, 22, 16, 6.5), C.profile) + inkDash([[16, 16], [22, 16]]) + cpt(16, 16) + pts([22, 16]);
const arcSlot = () => {
  const cx = 16, cy = 30, rc0 = 17, w = 5;
  const o = arcPts(cx, cy, rc0 + w, rc0 + w, 215, 325, 16), i = arcPts(cx, cy, rc0 - w, rc0 - w, 325, 215, 16);
  const e0 = arcPts(cx + rc0 * Math.cos((325 * Math.PI) / 180), cy + rc0 * Math.sin((325 * Math.PI) / 180), w, w, 325, 505, 8);
  const e1 = arcPts(cx + rc0 * Math.cos((215 * Math.PI) / 180), cy + rc0 * Math.sin((215 * Math.PI) / 180), w, w, 35, 215, 8);
  return { poly: [...o, ...e0, ...i, ...e1], mid: arcPts(cx, cy, rc0, rc0, 215, 325, 2) };
};
R.ShapeArcSlotThreePoint = () => { const a = arcSlot(); return skg(a.poly) + pl(arcPts(16, 30, 17, 17, 215, 325, 12), C.ink, 0.9, dash(2, 1.5)) + pts(...a.mid); };
R.ShapeArcSlotCenterTwoPoint = () => { const a = arcSlot(); return skg(a.poly) + inkDash([a.mid[0], [16, 29], a.mid[2]]) + cpt(16, 29) + pts(a.mid[0], a.mid[2]); };
R.DrawSpline = () => { const P = [[4, 24], [11, 9], [20, 21], [28, 7]]; return skl(through(P)) + pts(...P); };
R.DrawCVMSpline3D = () => { const P = [[4, 25], [8, 6], [22, 27], [28, 7]]; return inkDash(P) + skl(bspline(P)) + P.map(([x, y]) => ci(x, y, 1.9, C.white, C.ptEdge, 0.9)).join(""); };
R.DrawCVMSpline5D = () => { const P = [[3, 25], [6, 8], [14, 6], [17, 26], [26, 26], [29, 8]]; return inkDash(P) + skl(bspline(P)) + P.map(([x, y]) => ci(x, y, 1.9, C.white, C.ptEdge, 0.9)).join(""); };
R.ConicCurveCmd = () => inkDash([[4, 26], [16, 4], [28, 26]]) + skl(bez([4, 26], [16, 4], [28, 26], null, 16)) + pts([4, 26], [28, 26]) + ci(16, 15, 1.9, C.white, C.ptEdge, 0.9);
R.DrawPoint = () => pl([[16, 6], [16, 26]], C.inkLight, 0.9, dash(2, 1.5)) + pl([[6, 16], [26, 16]], C.inkLight, 0.9, dash(2, 1.5)) + spt(16, 16, { s: 5.6 });
R.MTextCmd = () => rc(4, 5, 24, 22, null, C.ink, 0.9, dash(2, 1.5)) + pa("M9 24L16 8L23 24M11.6 18.5H20.4", null, C.sketch, 2.2) + pts([4, 27]);
R.FitCurvesToSectionCommand = () => {
  const P = bez([3, 24], [10, 4], [22, 30], [29, 8], 12);
  return P.map(([x, y], i) => ci(x + (i % 2 ? 0.8 : -0.8), y + (i % 3 ? 0.8 : -0.6), 1.1, "#7d8996")).join("") + skl(P);
};
R.MirrorSketchCommand = () => centerLine([[16, 3], [16, 29]]) + skg([[4, 24], [12, 24], [12, 8]]) + skg([[28, 24], [20, 24], [20, 8]], "#fff1dd") + pts([12, 8], [20, 8]);
R.CircularSketchPatternCommand = () => {
  let o = ci(16, 16, 10, null, C.inkLight, 0.9, dash(2, 1.5)) + cpt(16, 16);
  for (let i = 0; i < 6; i++) { const a = ((i * 60 - 90) * Math.PI) / 180; o += circle(16 + 10 * Math.cos(a), 16 + 10 * Math.sin(a), 3, i ? "#fff1dd" : C.profile); }
  return o;
};
R.RectangularSketchPatternCommand = () => {
  let o = "";
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o += skg([[4 + i * 9, 4 + j * 9], [10 + i * 9, 4 + j * 9], [10 + i * 9, 10 + j * 9], [4 + i * 9, 10 + j * 9]], i + j ? "#fff1dd" : C.profile, { w: 1.3 });
  return o;
};
const purple = (p, w = 1.7) => pl(p, C.proj, w);
R.ProjectNewCmd = () => {
  const s = S(20, 0.9);
  let o = pg(hquad(s, -10, -10, 10, 10, 0), "#e3eaf1", "#5a6876", 1);
  o += purple([s.P([-4, -4, 0]), s.P([4, -4, 0]), s.P([4, 4, 0]), s.P([-4, 4, 0]), s.P([-4, -4, 0])]);
  for (const [x, y] of [[4, -4], [4, 4], [-4, 4]]) o += pl([s.P([x, y, 0]), s.P([x, y, 8])], C.proj, 0.9, dash(1.6, 1.2));
  s.add(box(-4, -4, 8, 4, 4, 13));
  return o + s.svg();
};
R.IntersectCmd = () => {
  const s = S(22, 0.95);
  s.add(cylinder(0, 0, 0, 12, 5.5, 24));
  let o = s.svg();
  o += pg([s.P([-9, -9, 6]), s.P([9, -9, 6]), s.P([9, 9, 6]), s.P([-9, 9, 6])], "#e3eaf1", "#5a6876", 1, { "fill-opacity": 0.55 });
  const e = isoEllipse(s, [0, 0, 6], 5.5);
  return o + elp(e.cx, e.cy, e.rx, e.ry, null, C.proj, 1.8);
};
R.SpunProfileCmd = () => {
  const s = S(19, 0.9);
  let o = pg(hquad(s, -10, -10, 10, 10, 0), "#e3eaf1", "#5a6876", 1);
  o += purple([s.P([-6, 0, 0]), s.P([-6, 3, 0]), s.P([6, 3, 0]), s.P([6, 0, 0])]);
  s.add(cylinder(0, 0, -5, 5, 4, 20, "x").map((f) => ({ ...f, pts: f.pts.map(([x, y, z]) => [x, y - 3, z + 9]) })));
  return o + s.svg();
};
R.Include3DGeometry = () => {
  const s = S(21);
  s.add(box(-7, -7, 0, 7, 7, 8));
  return s.svg() + purple([s.P([-7, 7, 8]), s.P([7, 7, 8]), s.P([7, -7, 8])], 2.2) + purple([s.P([7, 7, 8]), s.P([7, 7, 0])], 2.2);
};
const waveSheet = (s, mat = "light") => {
  const N = 8, sheet = [];
  const z = (x) => 2 + 2.2 * Math.sin(((x + 9) / 18) * Math.PI);
  for (let i = 0; i < N; i++) { const x0 = -9 + (18 * i) / N, x1 = -9 + (18 * (i + 1)) / N; sheet.push([[x0, -9, z(x0)], [x1, -9, z(x1)], [x1, 9, z(x1)], [x0, 9, z(x0)]]); }
  s.add(sheet, mat, { two: true, crease: 0.85 });
  return z;
};
R.ProjectToSurface = () => {
  const s = S(23);
  const z = waveSheet(s);
  let o = s.svg();
  const cur = [], top = [];
  for (let k = 0; k <= 12; k++) { const x = -7 + (14 * k) / 12, y = 4 * Math.sin(k / 2); cur.push(s.P([x, y, z(x) + 0.05])); top.push(s.P([x, y, 12])); }
  o += skl(top) + pl([top[3], cur[3]], C.inkLight, 0.9, dash(1.6, 1.2)) + pl([top[9], cur[9]], C.inkLight, 0.9, dash(1.6, 1.2));
  return o + purple(cur);
};
R.IntersectionCurve = () => {
  const s = S(22);
  waveSheet(s);
  s.add([[[0, -9, -2], [0, 9, -2], [0, 9, 9], [0, -9, 9]]], "glass", { two: true });
  const z = (x) => 2 + 2.2 * Math.sin(((x + 9) / 18) * Math.PI);
  return s.svg() + purple([s.P([0, -9, z(0)]), s.P([0, 9, z(0)])], 2);
};
R.SketchIsoparametricCurve = () => {
  const s = S(22);
  const z = waveSheet(s);
  const c = [];
  for (let k = 0; k <= 8; k++) { const y = -9 + (18 * k) / 8; c.push(s.P([3, y, z(3)])); }
  const d = [];
  for (let k = 0; k <= 12; k++) { const x = -9 + (18 * k) / 12; d.push(s.P([x, -2, z(x)])); }
  return s.svg() + purple(c, 2) + purple(d, 2);
};
R.SketchDimension = () => {
  let o = skl([[5, 25], [27, 25]]) + pts([5, 25], [27, 25]);
  o += ln(5, 22, 5, 9, C.ink, 0.9) + ln(27, 22, 27, 9, C.ink, 0.9);
  o += lineArrow([[5, 12], [27, 12]], C.ink, { both: true, w: 0.9, hl: 3.4, hw: 3.4 });
  if (!ctx.small) o += rc(11, 4.5, 10, 6, C.white, null) + tx(16, 10, "25", 7, C.ink);
  return o;
};
R.SketchConstructionCmd = () => construction([[5, 26], [27, 6]]) + pts([5, 26], [27, 6]);
R.SketchCenterLineCmd = () => centerLine([[5, 26], [27, 6]]) + pts([5, 26], [27, 6]);

// ---------------------------------------------------------------- MODIFY
R.FilletSketchCmd = () => inkDash([[7, 17], [7, 25], [15, 25]]) + skl([[7, 4], [7, 17]]) + skl(arcPts(15, 17, 8, 8, 180, 90, 10)) + skl([[15, 25], [28, 25]]) + pts([7, 17], [15, 25]);
R.TrimSketchCmd = () => ink([[19, 4], [19, 28]]) + skl([[4, 16], [19, 16]]) + pl([[19, 16], [29, 16]], "#6f7b87", 1.3, dash(2, 1.5)) + pa("M22 11l5 5M27 11l-5 5", null, C.red, 1.8);
R.ExtendSketchCmd = () => ink([[25, 4], [25, 28]]) + skl([[4, 18], [14, 18]]) + lineArrow([[14, 18], [25, 18]], C.sketch, { w: 1.2, hl: 3.6, hw: 4 }) + pts([4, 18]);
R.BreakSketchCmd = () => skl([[4, 26], [14, 17]]) + skl([[18, 14], [28, 6]]) + pts([4, 26], [28, 6]) + pa("M14 11l4 9", null, C.red, 1.4) + ci(16, 15.5, 1.8, C.white, C.ptEdge, 0.9);
R.SketchScaleCmd = () => rc(5, 8, 19, 19, null, C.sketch, 1.3, dash(2, 1.5)) + skg([[5, 18], [14, 18], [14, 27], [5, 27]]) + arrow([[13, 19], [26, 6]], { w: 1.6, hl: 4, hw: 4.8 }) + pts([5, 27]);
R.Offset = () => skp("M4 9a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z", C.profile) + skp("M9.5 11.5a1.5 1.5 0 0 1 1.5-1.5h10a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H11a1.5 1.5 0 0 1-1.5-1.5z", C.white) + lineArrow([[28, 16], [22.5, 16]], C.ink, { w: 0.9, hl: 2.8, hw: 3 });
R.BlendG1CurveSketchCmd = () => ink(arcPts(4, 22, 7, 9, -90, 10, 8)) + ink(arcPts(28, 10, 7, 9, 90, 190, 8)) + skl(bez([10.9, 23.6], [15, 24], [17, 8], [21.1, 8.4], 12)) + pts([10.9, 23.6], [21.1, 8.4]);
const chamferBase = () => inkDash([[7, 16], [7, 25], [16, 25]]) + skl([[7, 4], [7, 16]]) + skl([[7, 16], [16, 25]]) + skl([[16, 25], [28, 25]]) + pts([7, 16], [16, 25]);
R.ChamferSketchEqualDistance = () => chamferBase() + pa("M3 19h3M3 21.5h3M18.5 28v-3M21 28v-3", null, C.cons, 1.2);
R.ChamferSketchDistanceAngle = () => chamferBase() + pa("M21 25A6 6 0 0 0 19 20.5", null, C.cons, 1.4) + pa("M3 20h3", null, C.cons, 1.3);
R.ChamferSketchDistanceDistance = () => chamferBase() + pa("M3 18v7M3 21.5h3M16 29h-9M11.5 29v-3", null, C.cons, 1.1);

// ---------------------------------------------------------------- CONSTRAINTS
const cons = (d, w = 1.8) => pa(d, null, C.cons, w);
R.ConstraintHorizontalVertical = () => inkDash([[5, 18], [18, 9]]) + skl([[4, 25], [19, 25]]) + skl([[26, 5], [26, 20]]) + pts([4, 25], [19, 25], [26, 5], [26, 20]);
R.ConstraintCoincident = () => ink([[4, 26], [15, 13]]) + ink([[15, 13], [28, 20]]) + ink([[11, 4], [15, 13]]) + ci(15, 13, 3.4, C.cons, C.sketchDark, 0.9);
R.ConstraintTangent = () => ci(13, 18, 8.5, null, C.ink, 1.5) + skl([[2, 9.5], [29, 9.5]]) + ci(13, 9.5, 2.2, C.cons, C.sketchDark, 0.8);
R.ConstraintEqual = () => ink([[6, 5], [6, 27]]) + ink([[26, 5], [26, 27]]) + pts([6, 5], [6, 27], [26, 5], [26, 27]) + cons("M11 13.5h10M11 18.5h10", 2.4);
R.ConstraintParallel = () => ink([[4, 21], [17, 5]]) + skl([[15, 28], [28, 12]]) + pts([4, 21], [17, 5], [15, 28], [28, 12]);
R.ConstraintPerpendicular = () => ink([[4, 26], [28, 26]]) + skl([[13, 26], [13, 5]]) + pa("M13 20.5h5.5v5.5", null, C.ink, 1) + pts([13, 5], [4, 26], [28, 26]);
const lockGlyph = (x, y, s = 1, fill = C.cons) => pa(`M${x - 3.6 * s} ${y - 1}V${y - 4.6 * s}a${3.6 * s} ${3.6 * s} 0 0 1 ${7.2 * s} 0V${y - 1}`, null, C.edge, 2) + rc(x - 5.4 * s, y - 1.5, 10.8 * s, 8.5 * s, fill, C.sketchDark, 1, { rx: 1.2 }) + ci(x, y + 2.6 * s, 1.3 * s, C.edge);
R.ConstraintFix = () => ink([[3, 27], [12, 20]]) + pts([3, 27]) + lockGlyph(19, 16, 1.15);
R.ConstraintMidPoint = () => ink([[4, 25], [28, 9]]) + pts([4, 25], [28, 9]) + tri(16, 17, 3.6);
R.ConstraintConcentric = () => ci(16, 16, 11.5, null, C.ink, 1.5) + ci(16, 16, 5.5, C.profile, C.sketch, 1.8) + cpt(16, 16);
R.ConstraintCollinear = () => ink([[3, 27], [12, 19.5]]) + pl([[12, 19.5], [20, 12.5]], C.inkLight, 1, dash(1.8, 1.4)) + skl([[20, 12.5], [29, 5]]) + pts([3, 27], [12, 19.5], [20, 12.5], [29, 5]);
R.ConstraintSymmetry = () => centerLine([[16, 3], [16, 29]]) + skl([[4, 8], [11, 23]]) + skl([[28, 8], [21, 23]]) + pts([4, 8], [11, 23], [28, 8], [21, 23]);
R.ConstraintSmooth = () => ink(bez([3, 26], [6, 12], [12, 16], [16, 15], 12)) + skl(bez([16, 15], [20, 14], [26, 18], [29, 5], 12)) + ci(16, 15, 2.4, C.cons, C.sketchDark, 0.8);
const autoGlyphs = () => ink([[5, 9], [24, 9], [24, 24], [5, 24], [5, 9]]) + cons("M12.5 6.5v-2.5M15 6.5v-2.5", 1.2) + cons("M26.5 14h2.5M26.5 17h2.5", 1.2) + pa("M5 19.5h4.5v4.5", null, C.cons, 1.2);
R.SketchAutoConstraintAndDimCmd = () => autoGlyphs() + badge.spark(25, 25, 5.4);
R.SketchAutoConstraintAndDimFromDatumCmd = () => autoGlyphs() + badge.spark(25, 25, 5.4) + ci(5, 24, 2.2, C.cons, C.sketchDark, 0.8);
R.QuickSketchAutoConstraintCommand = () => autoGlyphs() + badge.spark(25, 25, 5.4, "#9fd0f7", C.blueEdge);
R.ADEAutoArrangeDimensionCmd = () => skl([[5, 26], [27, 26]]) + lineArrow([[5, 20], [27, 20]], C.ink, { both: true, w: 0.9 }) + lineArrow([[5, 12], [19, 12]], C.ink, { both: true, w: 0.9 }) + badge.spark(25, 7, 5);
R.SketchPolygonConstraintCmd = () => { const P = regPoly(16, 16, 11, 6, 0); return pg(P, null, C.ink, 1.5) + P.map(([x, y]) => ci(x, y, 2, C.cons, C.sketchDark, 0.7)).join(""); };

// ---------------------------------------------------------------- FINISH
const check = (x = 16, y = 17, s = 1) => pg([[x - 10 * s, y - 1 * s], [x - 6 * s, y - 5 * s], [x - 2.6 * s, y - 1.6 * s], [x + 7.5 * s, y - 11.5 * s], [x + 11.5 * s, y - 7.5 * s], [x - 2.6 * s, y + 6.4 * s]], "#43a83a", "#1f6a17", 1.1);
R.SketchStop = () => {
  const s = S(22, 0.85);
  return pg(hquad(s, -9, -9, 9, 9, 0), "#e3eaf1", "#7d8996", 1) + skl([s.P([-5, -2, 0]), s.P([2, -2, 0]), s.P([2, 5, 0])], { w: 1.4 }) + check(16, 15, 1.05);
};
R.SketchAutoConstrainAndFinish = () => R.SketchStop() + badge.spark(26, 25, 5);

export const SKETCH = R;
export const SKETCH_GROUPS = [
  ["SKETCH / CREATE", ["DrawPolyline", "SketchMidpointLine", "SketchConstrainer", "ShapeRectangleTwoPoint", "ShapeRectangleThreePoint", "ShapeRectangleCenter", "CircleCenterRadius", "CircleTwoPoint", "CircleThreePoint", "CircleTanTanRadius", "CircleThreeTangent", "ArcThreePoint", "ArcCenterTwoPoint", "ArcTangent", "ShapePolygonCircumscribed", "ShapePolygonInscribed", "ShapePolygonEdge", "CircleElipse", "ShapeSlotCenterToCenter", "ShapeSlotOverall", "ShapeSlotCenterPoint", "ShapeArcSlotThreePoint", "ShapeArcSlotCenterTwoPoint", "DrawSpline", "DrawCVMSpline3D", "DrawCVMSpline5D", "ConicCurveCmd", "DrawPoint", "MTextCmd", "FitCurvesToSectionCommand", "MirrorSketchCommand", "CircularSketchPatternCommand", "RectangularSketchPatternCommand", "ProjectNewCmd", "IntersectCmd", "SpunProfileCmd", "Include3DGeometry", "ProjectToSurface", "IntersectionCurve", "SketchIsoparametricCurve", "SketchDimension", "SketchConstructionCmd", "SketchCenterLineCmd"]],
  ["SKETCH / MODIFY", ["FilletSketchCmd", "ChamferSketchEqualDistance", "ChamferSketchDistanceAngle", "ChamferSketchDistanceDistance", "BlendG1CurveSketchCmd", "Offset", "TrimSketchCmd", "ExtendSketchCmd", "BreakSketchCmd", "SketchScaleCmd"]],
  ["SKETCH / CONSTRAINTS", ["SketchAutoConstraintAndDimCmd", "SketchAutoConstraintAndDimFromDatumCmd", "ConstraintHorizontalVertical", "ConstraintCoincident", "ConstraintTangent", "ConstraintEqual", "ConstraintParallel", "ConstraintPerpendicular", "ConstraintFix", "ConstraintMidPoint", "ConstraintConcentric", "ConstraintCollinear", "ConstraintSymmetry", "ConstraintSmooth", "SketchPolygonConstraintCmd", "QuickSketchAutoConstraintCommand", "ADEAutoArrangeDimensionCmd"]],
  ["SKETCH / FINISH", ["SketchStop", "SketchAutoConstrainAndFinish"]],
];
