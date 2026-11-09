// Composite drawing parts shared by the command icon groups (all 32x32 units).
import {
  ctx, C, W, el, g, ln, pl, pg, pa, ci, elp, rc, tx, dash, arrow, arcPts, bez, regPoly, spt, plane2,
  scene, prism, box, cylinder, circ2, tint, shift, revolve, v3, isoEllipse, badge,
} from "./draw.js";

export const S = (oy = 20, k = 1, ox = 16) => scene({ ox, oy, k });

/** Iso quad for a horizontal plane square at height z (screen polygon via scene). */
export const hquad = (s, x0, y0, x1, y1, z = 0) => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]].map(s.P);

/** Construction (yellow) plane from 3D corners. */
export const cplane = (s, corners, o = {}) => plane2(corners.map(s.P), o);
/** Light "existing face / origin plane" quad. */
export const facePlane = (s, corners) => pg(corners.map(s.P), "#dde5ed", "#5d6b79", 1);

/** Construction axis line (3D endpoints). */
export const caxis = (s, a, b) => pl([s.P(a), s.P(b)], C.axis, 1.8) + pl([s.P(a), s.P(b)], "#fff3d6", 0.5);
/** Construction point marker (screen). */
export const cpoint = (x, y, r = 2.4) => ci(x, y, r * (ctx.small ? 1.25 : 1), "#f6b73c", "#a76a00", 0.9);

/** Standard 2D shaded sphere (posterised flat shading, no gradients). */
export function sphere2(cx, cy, r, tone = "steel") {
  const T = {
    steel: ["#a5b0bb", "#c3cbd3", "#dde2e7", "#f5f7f8", C.edge],
    blue: ["#3d86cf", "#5ea3e3", "#8cc3f1", "#d3eafc", "#0e4d88"],
    red: ["#c0392b", "#dc5446", "#f08072", "#fbd2cc", "#7c1a12"],
    gold: ["#c08a1e", "#d9a73a", "#efc96a", "#fcefc4", "#6f4c06"],
    purple: ["#9c82cf", "#b29be0", "#cbb9ee", "#efe8fb", "#4a2378"],
  }[tone] || tone;
  return (
    ci(cx, cy, r, T[0], T[4], 1) +
    ci(cx - r * 0.12, cy - r * 0.14, r * 0.8, T[1]) +
    ci(cx - r * 0.25, cy - r * 0.29, r * 0.54, T[2]) +
    ci(cx - r * 0.36, cy - r * 0.4, r * 0.24, T[3]) +
    ci(cx, cy, r, null, T[4], 1)
  );
}

/** Mouse cursor arrow with its tip at (x,y). */
export function cursor(x, y, s = 1) {
  const p = [[0, 0], [0, 13], [3.2, 10.2], [5.4, 15], [7.6, 14], [5.5, 9.4], [9.6, 9.4]].map(([a, b]) => [x + a * s, y + b * s]);
  return pg(p, C.white, "#1d252d", 1);
}

/** Document page with folded corner; optional label text. */
export function page(x, y, w, h, label, o = {}) {
  const f = Math.min(w, h) * 0.3;
  let s = pg([[x, y], [x + w - f, y], [x + w, y + f], [x + w, y + h], [x, y + h]], o.fill ?? C.paper, C.paperEdge, 1);
  s += pg([[x + w - f, y], [x + w - f, y + f], [x + w, y + f]], "#d9dfe5", C.paperEdge, 0.8);
  if (label && !ctx.small) s += tx(x + w / 2, y + h - 3, label, o.fs ?? 6.4, o.color ?? C.ink);
  return s;
}

/** Joint "puck": disc with alternating dark/light quadrants. */
export function puck(cx, cy, r = 4.2, ry = r) {
  const q = (a0, a1, fill) => pg([[cx, cy], ...arcPts(cx, cy, r, ry, a0, a1, 6)], fill, null);
  return elp(cx, cy, r, ry, C.white, null) + q(-90, 0, "#2b3540") + q(90, 180, "#2b3540") + elp(cx, cy, r, ry, null, "#1d252d", 1);
}

/** Small isometric cube at screen position (used for pattern icons etc). */
export function cubeAt(s, x, y, z, a, mat = "steel", h = a) {
  s.add(box(x - a / 2, y - a / 2, z, x + a / 2, y + a / 2, z + h), mat);
  return s;
}

/** Standard block [-7,-7,0]..[7,7,h]. */
export const stdBlock = (s, h = 7, mat = "steel", r = 7) => s.add(box(-r, -r, 0, r, r, h), mat);

/** Hatch lines inside a parallelogram given by 4 screen points (a,b,c,d) - simple diagonal hatch. */
export function hatch(pts, n = 5, stroke = "#24425f", w = 0.7) {
  // lines from edge a-b to edge d-c at increasing t, skewed
  let d = "";
  const [a, b, c, dd] = pts;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const q = [dd[0] + (c[0] - dd[0]) * Math.max(0, t - 0.35), dd[1] + (c[1] - dd[1]) * Math.max(0, t - 0.35)];
    d += `M${p[0]} ${p[1]}L${q[0]} ${q[1]}`;
  }
  return pa(d, null, stroke, w);
}

/** Triad (X red, Y green, Z blue) at origin o (3D) with length L. */
export function triad(s, o = [0, 0, 0], L = 9) {
  const x = s.P(v3.add(o, [L, 0, 0])), y = s.P(v3.add(o, [0, L, 0])), z = s.P(v3.add(o, [0, 0, L])), c = s.P(o);
  const ar = (to, fill, stroke) => arrow([c, to], { w: 1.6, hl: 4, hw: 4.6, fill, stroke, sw: 0.6 });
  return ar(y, "#46a33a", "#24661a") + ar(x, "#e0483b", "#8f1e15") + ar(z, "#2f86dc", "#0e4d88") + ci(c[0], c[1], 1.6, "#f6f7f8", C.edge, 0.8);
}

/** Circular "refresh" arrows around (cx,cy). */
export function refresh(cx, cy, r, o = {}) {
  const a = arrow(arcPts(cx, cy, r, r, 200, 330, 10), { w: 2, hl: 4.2, hw: 5.4, ...o });
  const b = arrow(arcPts(cx, cy, r, r, 20, 150, 10), { w: 2, hl: 4.2, hw: 5.4, ...o });
  return a + b;
}

/** Bolt (hex head + threaded shank), vertical, head top centre at (x,y). */
export function bolt(x, y, s = 1) {
  let o = "";
  const hw = 6 * s, hh = 3.4 * s, sw = 2.6 * s, L = 13 * s;
  o += pg([[x - sw, y + hh], [x + sw, y + hh], [x + sw, y + hh + L], [x - sw, y + hh + L]], "#c3cbd3", C.edge, 1);
  let th = "";
  for (let i = 1; i < 6; i++) { const yy = y + hh + (L * i) / 6; th += `M${x - sw} ${yy}L${x + sw} ${yy - 1.2 * s}`; }
  o += pa(th, null, "#6d7884", 0.7);
  o += pg([[x - hw, y], [x + hw, y], [x + hw, y + hh], [x - hw, y + hh]], "#dfe4e9", C.edge, 1);
  o += ln(x - hw / 3, y, x - hw / 3, y + hh, "#8d98a4", 0.8) + ln(x + hw / 3, y, x + hw / 3, y + hh, "#8d98a4", 0.8);
  return o;
}

/** Table / list with header row (for parameters, BOM, configurations). */
export function table(x, y, w, h, rows = 4, cols = 2, o = {}) {
  let s = rc(x, y, w, h, C.paper, C.paperEdge, 1);
  const rh = h / rows;
  s += rc(x, y, w, rh, o.head ?? "#c9d6e3", C.paperEdge, 1);
  let d = "";
  for (let i = 2; i < rows; i++) d += `M${x} ${y + rh * i}H${x + w}`;
  for (let j = 1; j < cols; j++) d += `M${x + (w * j) / cols} ${y}V${y + h}`;
  return s + pa(d, null, "#9aa5b1", 0.8);
}

/** Small mesh (triangulated) overlay on a quad given by 4 screen points. */
export function triGrid(pts, n = 3, stroke = "#33404c", w = 0.6) {
  const [a, b, c, d] = pts;
  const at = (u, v) => { const p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; const q = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u]; return [p[0] + (q[0] - p[0]) * v, p[1] + (q[1] - p[1]) * v]; };
  let s = "";
  for (let i = 0; i <= n; i++) { const p = at(i / n, 0), q = at(i / n, 1); s += `M${p[0]} ${p[1]}L${q[0]} ${q[1]}`; const r = at(0, i / n), t = at(1, i / n); s += `M${r[0]} ${r[1]}L${t[0]} ${t[1]}`; }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const p = at(i / n, j / n), q = at((i + 1) / n, (j + 1) / n); s += `M${p[0]} ${p[1]}L${q[0]} ${q[1]}`; }
  return pa(s, null, stroke, w);
}

/** Mountains picture (for canvas / decal icons) in a screen parallelogram a,b,c,d. */
export function picture(pts) {
  const [a, b, c, d] = pts;
  const at = (u, v) => { const p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; const q = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u]; return [p[0] + (q[0] - p[0]) * v, p[1] + (q[1] - p[1]) * v]; };
  let s = pg(pts, "#bfe1f7", C.edge, 1);
  s += pg([at(0, 1), at(0, 0.7), at(0.3, 0.35), at(0.55, 0.7), at(0.72, 0.5), at(1, 0.8), at(1, 1)], "#4caf50", null);
  s += pg([at(0.3, 0.35), at(0.38, 0.45), at(0.22, 0.45)], "#f4f8fb", null);
  const sun = at(0.78, 0.25);
  s += ci(sun[0], sun[1], 2, "#f6c344");
  s += pg(pts, null, C.edge, 1);
  return s;
}

export { ctx, C, W, el, g, ln, pl, pg, pa, ci, elp, rc, tx, dash, arrow, arcPts, bez, regPoly, spt, plane2, scene, prism, box, cylinder, circ2, tint, shift, revolve, v3, isoEllipse, badge };
