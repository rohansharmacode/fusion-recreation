// SOLID tab command icons (CREATE / MODIFY / ASSEMBLE / CONSTRUCT / INSPECT / INSERT / SELECT ...).
// Original artwork built from the shared isometric kit.
import {
  S, ctx, C, ln, pl, pg, pa, ci, elp, rc, tx, dash, arrow, arcPts, bez, regPoly, spt, plane2, prism, box, cylinder, circ2,
  tint, shift, revolve, v3, isoEllipse, badge, cplane, facePlane, caxis, cpoint, sphere2, cursor, page, puck, cubeAt, stdBlock,
  hatch, triad, refresh, bolt, table, triGrid, picture, hquad,
} from "./parts.js";
import { hole2, tube, loftRings, xform, reverseFaces, pencil, lineArrow, skl, skg, construction } from "./draw.js";

const up = (n) => n[2] > 0.9;
const R = {};

// ---------------------------------------------------------------- CREATE
/** Oblique sketch sheet: map(u,v) in [0,1]^2 -> screen. */
export const sheet = (BL = [2, 27], BR = [22, 27], TL = [10, 13]) => (u, v) => [BL[0] + u * (BR[0] - BL[0]) + v * (TL[0] - BL[0]), BL[1] + u * (BR[1] - BL[1]) + v * (TL[1] - BL[1])];
R.SketchCreate = () => {
  const m = sheet([1.5, 28.5], [22.5, 28.5], [9.5, 11]);
  let o = pg([m(0, 0), m(1, 0), m(1, 1), m(0, 1)], "#e1e9f1", "#56636f", 1);
  const rect = [m(0.1, 0.14), m(0.5, 0.14), m(0.5, 0.62), m(0.1, 0.62)];
  o += skg(rect);
  const circ = [];
  for (let i = 0; i < 20; i++) { const a = (i / 20) * 2 * Math.PI; circ.push(m(0.74 + 0.16 * Math.cos(a), 0.42 + 0.26 * Math.sin(a))); }
  o += skg(circ);
  o += spt(...rect[0]) + spt(...rect[2]);
  const tip = m(0.88, 0.86);
  o += pencil(tip[0], tip[1], 15, 128, 4.6);
  return o;
};

/** Timeline / browser sketch feature: the sheet and its profiles, no pencil (reads better at 16px). */
R.SketchFeature = () => {
  const m = sheet([1, 28], [25, 28], [7, 6]);
  let o = pg([m(0, 0), m(1, 0), m(1, 1), m(0, 1)], "#e1e9f1", "#56636f", 1);
  o += skg([m(0.12, 0.16), m(0.55, 0.16), m(0.55, 0.66), m(0.12, 0.66)]);
  const circ = [];
  for (let i = 0; i < 20; i++) { const a = (i / 20) * 2 * Math.PI; circ.push(m(0.75 + 0.15 * Math.cos(a), 0.5 + 0.27 * Math.sin(a))); }
  return o + skg(circ);
};

R.Extrude = () => {
  const s = S(23);
  const f = tint(box(-6.5, -6.5, 0, 6.5, 6.5, 6.5), up, "blue");
  s.add(f);
  s.raw(s.line([[-6.5, 6.5, 0], [6.5, 6.5, 0], [6.5, -6.5, 0]], C.sketch, 1.7));
  const c = s.P([0, 0, 6.5]);
  s.raw(arrow([[c[0], c[1] + 1], [c[0], 1.2]], { w: 2.6, hw: 7.4, hl: 6 }));
  return s.svg();
};

R.Revolve = () => {
  const s = S(24, 0.95);
  s.raw(s.line([[0, 0, -2], [0, 0, 14]], C.ink, 1, dash(3, 1.6)));
  const f = revolve([[2.6, 0], [8, 0], [8, 6], [2.6, 6]], 90, 360, 28, { closed: true });
  tint(f, (n, c, ff) => ff.tag === "cap", "blue");
  s.add(f);
  const ring = [];
  for (let a = 105; a <= 345; a += 12) { const t = (a * Math.PI) / 180; ring.push(s.P([8.6 * Math.cos(t), 8.6 * Math.sin(t), 9.5])); }
  s.raw(arrow(ring, { w: 2.2, hw: 6.4, hl: 5.4 }));
  return s.svg();
};

R.FusionHoleCommand = () => {
  const s = S(22);
  s.add(box(-7.5, -7.5, 0, 7.5, 7.5, 6.5));
  s.raw(hole2(s, [0, 0, 6.5], 4.8, 1.5, { wall: "#7cbaf0", floor: "#4f9ae0" }));
  s.raw(hole2(s, [0, 0, 5], 2.5, 6, { wall: "#3f8fdc", floor: "#1b5c9c", edge: "#0e4d88" }));
  return s.svg();
};

R.PatternRectangular = () => {
  const s = S(21);
  const a = 5, pos = [[-6, -6], [3.5, -6], [-6, 3.5], [3.5, 3.5]];
  pos.forEach(([x, y], i) => cubeAt(s, x, y, 0, a, i === 0 ? "blue" : "steel"));
  return s.svg();
};

R.PatternCircular = () => {
  const s = S(20);
  const e = isoEllipse(s, [0, 0, 0], 7.5);
  s.raw(elp(e.cx, e.cy, e.rx, e.ry, null, C.inkLight, 1, dash(2, 1.5)));
  s.raw(s.line([[0, 0, -2], [0, 0, 9]], C.ink, 1, dash(3, 1.6)));
  const items = [];
  for (let i = 0; i < 6; i++) { const t = ((i * 60 + 15) * Math.PI) / 180; items.push([7.5 * Math.cos(t), 7.5 * Math.sin(t), i]); }
  items.sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
  for (const [x, y, i] of items) cubeAt(s, x, y, 0, 3.8, i === 3 ? "blue" : "steel");
  return s.svg();
};

R.PatternOnPath = () => {
  const s = S(21);
  const path = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; path.push([-9 + 18 * t, 6 * Math.sin(t * Math.PI * 1.1) - 3, 0]); }
  s.raw(s.line(path, C.sketch, 1.3, dash(2.2, 1.4)));
  [0.1, 0.4, 0.7, 0.96].forEach((t, i) => { const p = path[Math.round(t * 16)]; cubeAt(s, p[0], p[1], 0, 4, i === 0 ? "blue" : "steel"); });
  return s.svg();
};

R.FusionPatternGeometricCommand = () => {
  const s = S(22);
  s.add(box(-9, -9, 0, 9, 9, 1.2), "light");
  [[-5, -5, 3], [1, -5, 4.5], [-5, 1, 2], [1.5, 1.5, 5.5]].forEach(([x, y, h], i) => s.add(box(x, y, 1.2, x + 3.6, y + 3.6, 1.2 + h), i === 0 ? "blue" : "steel"));
  return s.svg();
};

R.MirrorCommand = () => {
  const s = S(20);
  const prof = [[-6, 0], [6, 0], [6, 3], [-1.5, 3], [-1.5, 7.5], [-6, 7.5]];
  s.add(prism(prof, -6.5, -1.2, "y"));
  s.add([[[-8.5, 0, -1], [8.5, 0, -1], [8.5, 0, 10], [-8.5, 0, 10]]], "plane", { two: true });
  s.add(prism(prof, 1.2, 6.5, "y"), "blue");
  return s.svg();
};

R.Sweep = () => {
  const s = S(21);
  const path = bez([-2, 9, 0], [-2, -2, 0], [2, 4, 10], [4, -7, 10], 18);
  const f = tube(path, 2.8, 16);
  tint(f, (n, c, ff) => ff.tag === "cap0", "orange");
  s.add(f, "steel", { crease: 0.8 });
  s.raw(skl([s.P([4, -7, 10]), s.P([4.8, -11, 10])], { w: 1.2, dash: true }));
  return s.svg();
};

R.SolidLoft = () => {
  const s = S(23);
  const N = 16;
  const sq = [];
  for (let i = 0; i < N; i++) {
    const t = i / N; const side = Math.floor(t * 4), u = t * 4 - side, h = 6.5;
    const pts = [[-h, -h], [h, -h], [h, h], [-h, h]];
    const a = pts[side], b = pts[(side + 1) % 4];
    sq.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 0]);
  }
  const cir = [];
  for (let i = 0; i < N; i++) { const a = ((225 + (i * 360) / N) * Math.PI) / 180; cir.push([4.6 * Math.cos(a), 4.6 * Math.sin(a), 10]); }
  // align circle start with square start (-h,-h)
  const rings = [];
  for (let k = 0; k <= 5; k++) {
    const t = k / 5, e = t * t * (3 - 2 * t);
    rings.push(sq.map((p, i) => [p[0] + (cir[i][0] - p[0]) * e, p[1] + (cir[i][1] - p[1]) * e, 10 * t]));
  }
  const f = loftRings(rings);
  tint(f, (n, c, ff) => ff.tag === "top", "orange");
  s.add(f, "steel", { crease: 0.75 });
  s.raw(s.line([[-6.5, 6.5, 0], [6.5, 6.5, 0], [6.5, -6.5, 0]], C.sketch, 1.6));
  return s.svg();
};

R.FusionRibCommand = () => {
  const s = S(22);
  s.add(box(-8, -8, 0, 8, 8, 2));
  s.add(box(-8, -8, 2, 8, -5.5, 12));
  s.add(prism([[-5.5, 2], [6, 2], [-5.5, 10]], -1.1, 1.1, "x"), "blue");
  return s.svg();
};

R.FusionWebCommand = () => {
  const s = S(22);
  s.add(box(-8, -8, 0, 8, 8, 2));
  s.add(box(-8, -8, 2, 8, -6.4, 9));
  for (const y of [-2.4, 2.6]) s.add(box(-8, y - 0.8, 2, 8, y + 0.8, 6), "blue");
  return s.svg();
};

R.EmbossCmd = () => {
  const s = S(22);
  s.add(box(-8, -8, 0, 8, 8, 5));
  const star = [];
  for (let i = 0; i < 10; i++) { const a = ((i * 36 + 9) * Math.PI) / 180, r = i % 2 ? 2.4 : 5.6; star.push([r * Math.cos(a), r * Math.sin(a)]); }
  s.add(prism(star, 5, 7.2, "z"), "blue", { crease: 0.95 });
  return s.svg();
};

R.FusionThreadCommand = () => {
  const s = S(24);
  s.add(cylinder(0, 0, 0, 14, 5, 24));
  let d = "";
  const r = 5.05, turns = 4, pitch = 3.2;
  let pen = false;
  for (let i = 0; i <= turns * 36; i++) {
    const t = (i / 36) * 2 * Math.PI, z = 0.8 + (pitch * i) / 36;
    if (z > 10) break;
    const vis = Math.cos(t - Math.PI / 4) > 0.05;
    const p = s.P([r * Math.cos(t), r * Math.sin(t), z]);
    if (vis) { d += `${pen ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`; pen = true; } else pen = false;
  }
  s.raw(pa(d, null, C.blueEdge, 0.9));
  return s.svg();
};

R.PrimitiveBox = () => { const s = S(21); s.add(box(-6.5, -6.5, 0, 6.5, 6.5, 9)); return s.svg(); };
R.PrimitiveCylinder = () => { const s = S(22); s.add(cylinder(0, 0, 0, 11, 7, 28)); return s.svg(); };
R.PrimitiveSphere = () => sphere2(16, 16, 11);
R.PrimitiveTorus = () => {
  const s = S(18);
  const prof = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * 2 * Math.PI; prof.push([7 + 3.2 * Math.cos(a), 3.2 * Math.sin(a)]); }
  s.add(revolve(prof, 0, 360, 26, { closed: true }), "steel", { crease: 0.6 });
  return s.svg();
};
R.PrimitiveCoil = () => {
  const s = S(26);
  const path = [];
  for (let i = 0; i <= 3.25 * 13; i++) { const t = (i / 13) * 2 * Math.PI; path.push([6 * Math.cos(t), 6 * Math.sin(t), 0.8 + (i / 13) * 4.2]); }
  s.add(tube(path, 1.5, 7), "steel", { crease: 0.5 });
  return s.svg();
};
R.PrimitivePipe = () => {
  const s = S(21);
  const path = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * (Math.PI / 2); path.push([8 - 7 * Math.sin(a), 0, 1 + 7 - 7 * Math.cos(a)]); }
  // path: from (8,0,1) curving up; extend straight ends
  const p3 = [[11, 0, 1], ...path.map(([x, y, z]) => [x - 2, y, z]), [-1, 0, 11]];
  const f = tube(p3, 3.4, 16);
  s.add(f, "steel", { crease: 0.8 });
  // inner bores on the visible end caps
  for (const cap of f.filter((ff) => ff.tag && ff.tag.startsWith("cap"))) {
    const n = v3.norm(v3.cross(v3.sub(cap.pts[1], cap.pts[0]), v3.sub(cap.pts[2], cap.pts[0])));
    if (v3.dot(n, [1, 1, 1]) <= 0) continue;
    const c = cap.pts.reduce((a, p) => v3.add(a, v3.mul(p, 1 / cap.pts.length)), [0, 0, 0]);
    s.raw(pg(cap.pts.map((p) => s.P(v3.add(c, v3.mul(v3.sub(p, c), 0.6)))), "#4b5763", C.edge, 0.8));
  }
  return s.svg();
};

R.StockModelCommand = () => {
  const s = S(21);
  s.add(prism([[-6, 0], [6, 0], [6, 3], [-2, 3], [-2, 8], [-6, 8]], -6, 6, "y"));
  s.add(box(-7, -7, 0, 7, 7, 9), "glass", { edash: true });
  return s.svg();
};

R.TSplineBaseFeatureCreationCommand = () => {
  // smooth "form" body with a control cage
  const blob = "M6 20C4 13 9 6 16 6c7 0 12 5 11 11c-1 6-6 10-12 10c-5 0-8-3-9-7z";
  let o = pa(blob, "#cdbff0", "#5b3d8f", 1.1);
  o += pa("M9 18c1-6 5-9 10-9c4 0 6 2 6 4", null, "#ebe4fb", 2.2);
  o += pa("M6 17C10 15 20 15 27 17M16 6c-2 6-2 14 0 21M9.5 9c3 5 3 12 0 16M23.5 9c-2 6-2 12 0 16", null, "#7a5cb3", 0.7);
  const cage = [[4, 7], [16, 3], [28.5, 8], [29, 22], [16, 29.5], [3.5, 24]];
  o += pg(cage, null, "#7a5cb3", 0.8, dash(1.6, 1.2));
  for (const [x, y] of cage) o += rc(x - 1.5, y - 1.5, 3, 3, "#efe9fb", "#5b3d8f", 0.8);
  return o;
};

R.AutomatedModelingCommand = () => {
  const s = S(22);
  s.add(box(-9, -9, 0, -3, -3, 5));
  s.add(box(3, 3, 0, 9, 9, 5));
  const path = bez([-4, -4, 4], [0, -6, 9], [5, 2, 9], [5, 5, 4], 10);
  s.add(tube(path, 1.6, 10, { caps: false }), "blue", { crease: 0.6 });
  s.raw(badge.spark(26, 6.5, 5.2));
  return s.svg();
};

R.PushDeriveCommand = () => {
  const s = S(23, 0.9, 11);
  s.add(box(-5, -5, 0, 5, 5, 6));
  return s.svg() + page(19, 3, 10.5, 13) + arrow([[12, 14], [20, 9.5]], { w: 2, hl: 4.4, hw: 5.6 });
};
R.PullDeriveCommand = () => {
  const s = S(24, 0.9, 20);
  s.add(box(-5, -5, 0, 5, 5, 6));
  return page(2.5, 3, 10.5, 13) + s.svg() + arrow([[12, 9.5], [20, 14]], { w: 2, hl: 4.4, hw: 5.6 });
};

R.EnclosureCommand = () => {
  // Fluid Volume: the volume inside a part, shown as a blue body inside a glass shell
  const s = S(21);
  s.add(box(-5.6, -5.6, 1.4, 5.6, 5.6, 6.6), "blue");
  s.add(box(-7.5, -7.5, 0, 7.5, 7.5, 8), "glass");
  return s.svg();
};

R.BaseFeatureCreationCommand = () => {
  const s = S(21);
  s.add(box(-6.5, -6.5, 0, 6.5, 6.5, 8));
  s.raw(pg(hquad(s, -9, -9, 9, 9, 0), null, C.ink, 0.9, dash(2, 1.4)));
  return s.svg() + badge.gear(25.5, 25.5, 5.2);
};

const pcb = (s) => {
  s.add(box(-9, -7, 0, 9, 7, 1.3), "pcb");
  s.add(box(-4, -3, 1.3, 2, 3, 3.2), "dark");
  for (let i = -6; i <= 6; i += 3) s.add(box(6, i - 0.6, 1.3, 7.5, i + 0.6, 1.6), "gold", { noEdges: true });
  return s;
};
R.PCBCreateCmd = () => pcb(S(19)).svg() + badge.plus();
R.PCBDeriveCmd = () => pcb(S(19)).svg() + arrow([[20, 27], [30, 21]], { w: 2, hl: 4, hw: 5 });
R.PCBExternalComponentCreationCmd = () => pcb(S(19)).svg() + badge.link(24, 25);

R.JointOrigin = () => {
  const s = S(23);
  s.add(box(-8, -8, 0, 8, 8, 4));
  const c = s.P([0, 0, 4]);
  return s.svg() + puck(c[0], c[1], 5.4, 3.4) + arrow([[c[0], c[1] - 3], [c[0], 3]], { w: 1.8, hl: 4.2, hw: 5 });
};

R.TimelineBuilderCommand = () => {
  let o = rc(2.5, 17, 27, 9, "#e3e8ed", C.paperEdge, 1, { rx: 1 });
  [[4.5, "#f2a64a"], [10.5, "#9fb3c7"], [16.5, "#9fb3c7"], [22.5, "#7fb6ec"]].forEach(([x, f]) => (o += rc(x, 18.8, 4.6, 5.4, f, C.edge, 0.8)));
  return o + badge.spark(16, 8.5, 6);
};

R.FusionSurfaceThickenCommand = () => {
  const s = S(23);
  const prof = [];
  for (let i = 0; i <= 10; i++) { const x = -8 + 1.6 * i; prof.push([x, 2 + 1.8 * Math.sin((i / 10) * Math.PI)]); }
  const band = [...prof, ...prof.slice().reverse().map(([x, z]) => [x, z + 3.2])];
  const f = prism(band, -7, 7, "y");
  tint(f, (n, c) => n[2] > 0.3 && c[2] > 3.5, "blue");
  s.add(f, "steel", { crease: 0.93 });
  const c = s.P([0, 0, 6.2]);
  return s.svg() + arrow([[c[0], c[1]], [c[0], 2]], { w: 2.2, hl: 4.8, hw: 6 });
};

R.SurfaceSculpt = () => {
  // boundary fill: cell bounded by planes, filled blue
  const s = S(21);
  s.add(box(-5, -5, 0, 5, 5, 7), "blue");
  let o = s.svg();
  o += cplane(s, [[-9, 0, -1], [9, 0, -1], [9, 0, 10], [-9, 0, 10]], { op: 0.45 });
  o += cplane(s, [[0, -9, -1], [0, 9, -1], [0, 9, 10], [0, -9, 10]], { op: 0.45 });
  return o;
};

R.FusionFindFeaturesCommand = () => {
  const s = S(22, 0.95, 14);
  s.add(box(-7, -7, 0, 7, 7, 6));
  s.raw(hole2(s, [0, 0, 6], 3, 4, { wall: "#7cbaf0", floor: "#3b7fc0" }));
  return s.svg() + badge.mag(23, 22, 4.6);
};

// ---------------------------------------------------------------- MODIFY
R.FusionPressPullCommand = () => {
  const s = S(21, 1, 13);
  const f = tint(box(-6.5, -6.5, 0, 6.5, 6.5, 8), (n) => n[0] > 0.9, "blue");
  s.add(f);
  const c = s.P([6.5, 0, 4]);
  const d = [0.866, 0.5];
  return s.svg() + arrow([[c[0] - d[0] * 3, c[1] - d[1] * 3], [c[0] + d[0] * 12, c[1] + d[1] * 12]], { both: true, w: 2.2, hl: 4.6, hw: 6.2 });
};

R.EditFaceCommand = () => {
  const s = S(22);
  s.add(box(-7.5, -7.5, 0, 7.5, 7.5, 6));
  const q = hquad(s, -7.5, -7.5, 7.5, 7.5, 6);
  let o = s.svg() + triGrid(q, 3, "#5a6876", 0.6);
  const p = s.P([2.5, 2.5, 6]);
  o += arrow([[p[0], p[1]], [p[0], p[1] - 11]], { w: 1.8, hl: 4, hw: 5 });
  o += ci(p[0], p[1], 1.8, C.blue, C.blueEdge, 0.8);
  return o;
};

R.FusionFilletEdgesCommand = () => {
  const s = S(21);
  const r = 4.5, prof = [[-7, 0], [7, 0], [7, 8 - r]];
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); prof.push([7 - r + r * Math.cos(a), 8 - r + r * Math.sin(a)]); }
  prof.push([-7, 8]);
  const f = prism(prof, -7, 7, "y");
  tint(f, (n) => n[0] > 0.1 && n[2] > 0.1, "blue");
  s.add(f);
  return s.svg();
};

R.FusionChamferCommand = () => {
  const s = S(21);
  const f = prism([[-7, 0], [7, 0], [7, 3.5], [2.5, 8], [-7, 8]], -7, 7, "y");
  tint(f, (n) => n[0] > 0.1 && n[2] > 0.1, "blue");
  s.add(f);
  return s.svg();
};

/** Hollow box (open top) with wall thickness t. */
export function shellBox(s, x0, y0, z0, x1, y1, z1, t, outer = "steel", inner = "blue") {
  const inn = box(x0 + t, y0 + t, z0 + t, x1 - t, y1 - t, z1 + 1).filter((f) => f.tag !== "top");
  const innerFaces = reverseFaces(inn).map((f) => ({ ...f, pts: f.pts.map((p) => [p[0], p[1], Math.min(p[2], z1)]) }));
  s.add(innerFaces, inner);
  const out = box(x0, y0, z0, x1, y1, z1).filter((f) => f.tag !== "top");
  const rim = [
    [[x0, y0, z1], [x1, y0, z1], [x1 - t, y0 + t, z1], [x0 + t, y0 + t, z1]],
    [[x1, y0, z1], [x1, y1, z1], [x1 - t, y1 - t, z1], [x1 - t, y0 + t, z1]],
    [[x1, y1, z1], [x0, y1, z1], [x0 + t, y1 - t, z1], [x1 - t, y1 - t, z1]],
    [[x0, y1, z1], [x0, y0, z1], [x0 + t, y0 + t, z1], [x0 + t, y1 - t, z1]],
  ];
  s.add([...out, ...rim.map((pts) => ({ pts }))], outer, { crease: 0.9 });
  return s;
}

R.FusionShellBodyCommand = () => { const s = S(21); shellBox(s, -7.5, -7.5, 0, 7.5, 7.5, 8, 1.6); return s.svg(); };

R.FusionDraftCommand = () => {
  const s = S(21);
  const f = prism([[-7, 0], [7, 0], [3.5, 8.5], [-7, 8.5]], -7, 7, "y");
  tint(f, (n) => n[0] > 0.3 && n[2] > 0.1, "blue");
  s.add(f);
  const a = s.P([7, 7, 0]), b = s.P([7, 7, 8.5]);
  let o = s.svg() + pl([a, b], C.ink, 1, dash(2, 1.4));
  const top = s.P([3.5, 7, 8.5]);
  o += pl([a, top], C.blueEdge, 1.2);
  return o;
};

R.ModifyScale = () => {
  const s = S(23, 1, 15);
  s.add(box(-7, -7, 0, 0, 0, 5));
  s.add(box(-7, -7, 0, 7, 7, 10), "glass", { edash: true });
  const a = s.P([0, 0, 5]), b = s.P([7, 7, 10]);
  return s.svg() + arrow([[a[0] + 1, a[1] - 1], [b[0] + 6, b[1] - 11]], { w: 1.8, hl: 4.2, hw: 5.2 });
};

R.FusionCombineCommand = () => {
  const s = S(22);
  s.add(box(-8, -8, 0, 3, 3, 6));
  s.add(cylinder(3, 3, 0, 10, 4.6, 24), "blue");
  return s.svg();
};

R.FusionOffsetFacesCommand = () => {
  const s = S(24);
  s.add(box(-7, -7, 0, 7, 7, 6));
  s.add(box(-7, -7, 6, 7, 7, 9), "blue", { op: 0.55, edash: true });
  const c = s.P([0, 0, 9]);
  return s.svg() + arrow([[c[0], c[1] + 2], [c[0], 1.5]], { w: 2, hl: 4.6, hw: 5.8 });
};

R.FusionReplaceFaceCommand = () => {
  const s = S(25);
  s.add(box(-7, -7, 0, 7, 7, 5));
  const N = 8, sheet = [];
  for (let i = 0; i < N; i++) {
    const x0 = -8 + (16 * i) / N, x1 = -8 + (16 * (i + 1)) / N;
    const z = (x) => 10 + 1.6 * Math.sin(((x + 8) / 16) * Math.PI * 2);
    sheet.push([[x0, -8, z(x0)], [x1, -8, z(x1)], [x1, 8, z(x1)], [x0, 8, z(x0)]]);
  }
  s.add(sheet, "blue", { two: true, crease: 0.85 });
  return s.svg();
};

R.FusionSplitFaceCommand = () => {
  const s = S(21);
  s.add(tint(box(-7, -7, 0, 7, 7, 8), up, "blue"));
  const half = hquad(s, -7, -7, 7, 0, 8);
  let o = s.svg() + pg(half, "#f3f5f7", null);
  o += pl([s.P([-7, -7, 8]), s.P([7, -7, 8]), s.P([7, 7, 8]), s.P([-7, 7, 8]), s.P([-7, -7, 8])], C.edge, 1);
  o += pl([s.P([-7, 0, 8]), s.P([7, 0, 8]), s.P([7, 0, 0])], C.sketch, 1.6);
  return o;
};

R.FusionSplitBodyCommand = () => {
  const s = S(21);
  s.add(box(-8, -6.5, 0, -1.6, 6.5, 8));
  s.add([[[0, -9, -1.5], [0, 9, -1.5], [0, 9, 10], [0, -9, 10]]], "plane", { two: true });
  s.add(box(1.6, -6.5, 0, 8, 6.5, 8), "blue");
  return s.svg();
};

R.FusionPartingLineSplitCmd = () => {
  let o = sphere2(16, 17, 11);
  o += pa(`M5 17A11 11 0 0 1 27 17A11 4 0 0 1 5 17Z`, "#6aaeea", null, 1, { "fill-opacity": 0.75 });
  o += pa("M5 17A11 4 0 0 0 27 17", null, C.sketch, 1.6);
  o += ci(16, 17, 11, null, C.edge, 1);
  return o;
};

R.FusionMoveCommand = () => {
  const s = S(21);
  s.add(box(-4.5, -4.5, 0, 4.5, 4.5, 6));
  const c = [16, 17];
  const a = (dx, dy) => arrow([[c[0] + dx * 4, c[1] + dy * 4], [c[0] + dx * 14.5, c[1] + dy * 14.5]], { w: 2.2, hl: 4.6, hw: 6 });
  return s.svg() + a(1, 0) + a(-1, 0) + a(0, 1) + a(0, -1) + ci(c[0], c[1], 2.2, C.blue, C.blueEdge, 0.8);
};

R.AlignCmd = () => {
  const s = S(23, 1, 17);
  s.add(box(-10, -4, 0, -3, 3, 10));
  s.add(box(1, -4, 0, 8, 3, 5), "blue");
  const a = s.P([4.5, -0.5, 5.5]), b = s.P([4.5, -0.5, 10]);
  return s.svg() + pl([s.P([-3, -4, 10]), s.P([8, -4, 10]), s.P([8, 3, 10])], C.blueEdge, 1, dash(2, 1.4)) + arrow([a, b], { w: 1.8, hl: 3.8, hw: 4.8 });
};

const bigX = (cx = 16, cy = 16, r = 9, w = 4.2) => {
  const d = w / 2 / Math.SQRT2, e = r;
  const pts = [
    [cx - e, cy - e + 2 * d], [cx - e + 2 * d, cy - e], [cx, cy - 2 * d], [cx + e - 2 * d, cy - e], [cx + e, cy - e + 2 * d], [cx + 2 * d, cy],
    [cx + e, cy + e - 2 * d], [cx + e - 2 * d, cy + e], [cx, cy + 2 * d], [cx - e + 2 * d, cy + e], [cx - e, cy + e - 2 * d], [cx - 2 * d, cy],
  ];
  return pg(pts, C.red, C.redEdge, 1);
};
R.FusionDeleteCommand = () => bigX(16, 16, 10, 4.4);
R.SoftDeleteCommand = () => { const s = S(20, 0.95, 14); s.add(box(-6.5, -6.5, 0, 6.5, 6.5, 8), "glass", { edash: true }); return s.svg() + badge.minus(24.5, 24.5, 5.6); };
R.ArrangeCommand = () => {
  const s = S(17);
  let o = pg(hquad(s, -9.5, -9.5, 9.5, 9.5, 0), "#e3eaf1", "#5a6876", 1);
  for (const [x0, y0, x1, y1, f] of [[-8, -8, -1, -2, C.blueLight], [0, -8, 8, -4, "#cfd7df"], [-8, 0, -3, 8, "#cfd7df"], [-1, -2.5, 8, 8, C.blueLight]]) o += pg(hquad(s, x0, y0, x1, y1, 0), f, C.edge, 0.9);
  return o;
};
R.FusionRemoveFeaturesCommand = () => {
  const s = S(22, 0.95, 14);
  s.add(box(-7, -7, 0, 7, 7, 5));
  s.add(cylinder(0, 0, 5, 9, 3.2, 20), "glass", { edash: true });
  return s.svg() + badge.x(25, 25);
};
R.FusionRemoveFacesCommand = () => {
  const s = S(22, 0.95, 14);
  s.add(box(-7, -7, 0, 7, 7, 6));
  s.raw(hole2(s, [0, 0, 6], 3.4, 3, { wall: "#f0b0aa", floor: "#d9665c", edge: C.redEdge }));
  return s.svg() + badge.x(25, 25);
};
R.ReplaceWithPrimitivesCommand = () => {
  const s = S(17, 0.62, 9);
  s.add(prism([[-6, 0], [6, 0], [6, 3], [-2, 3], [-2, 8], [-6, 8]], -6, 6, "y"));
  const t = S(28, 0.62, 23);
  t.add(cylinder(0, 0, 0, 9, 6, 20), "blue");
  return s.svg() + arrow([[13, 18], [22, 13]], { w: 1.8, hl: 4, hw: 5 }) + t.svg();
};

R.VolFieldCreateLatticeCommand = () => {
  const s = S(21);
  s.add(box(-7, -7, 0, 7, 7, 9), "light");
  let o = s.svg(), d = "";
  for (let i = 1; i < 4; i++) {
    const u = -7 + 3.5 * i;
    for (const seg of [[[u, -7, 9], [u, 7, 9]], [[-7, u, 9], [7, u, 9]], [[7, u, 0], [7, u, 9]], [[u, 7, 0], [u, 7, 9]]]) { const a = s.P(seg[0]), b = s.P(seg[1]); d += `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`; }
    const z = 9 * (i / 4);
    for (const seg of [[[7, -7, z], [7, 7, z]], [[-7, 7, z], [7, 7, z]]]) { const a = s.P(seg[0]), b = s.P(seg[1]); d += `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`; }
  }
  o += pa(d, null, C.blue, 1);
  return o;
};
R.VolFieldTextureCommand = () => {
  const s = S(21);
  s.add(box(-7, -7, 0, 7, 7, 9));
  let o = s.svg();
  for (let i = -5; i <= 5; i += 3.3) for (let j = -5; j <= 5; j += 3.3) { const p = s.P([i, j, 9]); o += elp(p[0], p[1], 1.2, 0.75, C.blue, C.blueEdge, 0.5); }
  for (let i = -5; i <= 5; i += 3.3) for (let z = 1.8; z < 9; z += 3) { const p = s.P([7, i, z]); o += elp(p[0], p[1], 0.75, 1, C.blue, C.blueEdge, 0.5); const q = s.P([i, 7, z]); o += elp(q[0], q[1], 0.75, 1, C.blue, C.blueEdge, 0.5); }
  return o;
};
R.VolFieldModifyModelCommand = () => {
  const s = S(21);
  const f = box(-7, -7, 0, 7, 7, 9);
  s.add(f);
  let o = s.svg();
  const bands = ["#e5483d", "#f2a541", "#f6dc54", "#7ac74f", "#3d8fd9"];
  bands.forEach((col, i) => { const z0 = (9 * i) / 5, z1 = (9 * (i + 1)) / 5; o += pg([s.P([7, -7, z0]), s.P([7, 7, z0]), s.P([7, 7, z1]), s.P([7, -7, z1])], col, null, 1, { "fill-opacity": 0.65 }); o += pg([s.P([-7, 7, z0]), s.P([7, 7, z0]), s.P([7, 7, z1]), s.P([-7, 7, z1])], col, null, 1, { "fill-opacity": 0.45 }); });
  return o + pl([s.P([-7, 7, 0]), s.P([7, 7, 0]), s.P([7, -7, 0])], C.edge, 1);
};

R.PhysicalMaterialCommand = () => {
  let o = sphere2(16, 16, 11, "steel");
  o += pa("M16 5a11 11 0 0 1 0 22a5 11 0 0 1 0-22z", "#d9a73a", null);
  o += pa("M20 9c2 2 3 5 3 8", null, "#fcefc4", 2);
  o += ci(16, 16, 11, null, C.edge, 1) + pa("M16 5a5 11 0 0 1 0 22", null, C.edge, 0.8);
  return o;
};
R.AppearanceCommand = () => {
  let o = ci(16, 16, 11, "#d84a3c", C.edge, 1);
  o += pa("M5.2 14.5A11 11 0 0 1 26.8 14.5C20 12 12 12 5.2 14.5Z", "#3d8fd9", null);
  o += pa("M6 21C12 18.5 20 18.5 26 21A11 11 0 0 1 6 21Z", "#f2b33d", null);
  o += ci(11.5, 10, 2.6, "#ffffff", null, 1, { "fill-opacity": 0.85 });
  return o + ci(16, 16, 11, null, C.edge, 1);
};
R.MaterialCommand = () => {
  let o = rc(3, 6, 6, 21, "#7f9fbf", C.edge, 1) + rc(9, 6, 6, 21, "#c9a04a", C.edge, 1) + pg([[15, 8], [20, 6.5], [24.5, 26], [19.5, 27.5]], "#9a6fb0", C.edge, 1);
  o += ln(4.5, 10, 7.5, 10, "#e7eef5", 1) + ln(10.5, 10, 13.5, 10, "#f7e6c0", 1);
  return o + sphere2(24, 23, 6, "blue");
};

R.ChangeParameterCommand = () => {
  let o = rc(3, 5, 26, 22, C.paper, C.paperEdge, 1, { rx: 1.5 });
  o += tx(16, 21.5, "f(x)", 12.5, C.ink, { "font-style": "italic", "font-family": "Georgia,Times New Roman,serif", "font-weight": 400 });
  if (ctx.small) o = rc(2, 4, 28, 24, C.paper, C.paperEdge, 1, { rx: 2 }) + tx(16, 22, "fx", 17, C.ink, { "font-style": "italic", "font-family": "Georgia,Times New Roman,serif" });
  return o;
};

R.FusionComputeAllCommand = () => {
  const s = S(21);
  s.add(box(-4, -4, 0, 4, 4, 5));
  return s.svg() + refresh(16, 16, 11.5);
};
R.FusionComputeUnresolvedCommand = () => R.FusionComputeAllCommand() + badge.warn(25, 25, 5.4);
R.TSpline2BRepCommand = () => {
  let o = pa("M3 15c0-5 3-9 7-9s6 3 6 7-2 8-6 8-7-2-7-6z", "#cdbff0", "#5b3d8f", 1);
  const s = S(27, 0.62, 24);
  s.add(box(-6, -6, 0, 6, 6, 8));
  return o + arrow([[13, 18], [20, 21]], { w: 1.8, hl: 4, hw: 5 }) + s.svg();
};
R.MaterializedBomHybridCmd = () => table(4, 5, 24, 22, 5, 3);

// ---------------------------------------------------------------- ASSEMBLE
const component = (s, x0, y0, z0, x1, y1, z1, mat = "light") => s.add(box(x0, y0, z0, x1, y1, z1), mat, { ew: 1.1 });
R.FusionImportCommandFromToolbar = () => {
  const s = S(24, 1, 14);
  component(s, -6.5, -6.5, 0, 6.5, 6.5, 7);
  return s.svg() + arrow([[28, 2], [20.5, 12]], { w: 2.2, hl: 5, hw: 6 });
};
R.FusionCreateNewComponentCommand = () => {
  const s = S(21, 1, 14);
  component(s, -6.5, -6.5, 0, 6.5, 6.5, 8);
  const q = hquad(s, -6.5, -6.5, 6.5, 6.5, 8);
  return s.svg() + pg(q, null, C.blue, 1.2) + badge.plus(25, 25, 5.6);
};
const jointPair = (s) => {
  s.add(box(-8, -8, 0, 8, 8, 3));
  s.add(box(-3.5, -3.5, 6, 3.5, 3.5, 11), "blue");
  return s;
};
R.AssemblyMateCommand = () => {
  const s = jointPair(S(24));
  const c = s.P([0, 0, 4.5]);
  return s.svg() + puck(c[0], c[1], 4.6, 2.9);
};
R.JointConstraintCmd = () => R.AssemblyMateCommand() + badge.lock(26, 7, 0.8);
R.JointAssembleCmdNew = () => {
  const s = S(25);
  s.add(box(-8, -8, 0, 8, 8, 3));
  s.add(box(-3, -3, 9, 4, 4, 13), "blue");
  const a = s.P([0.5, 0.5, 9]), b = s.P([0.5, 0.5, 3.4]);
  return s.svg() + arrow([[a[0], a[1] - 0.5], [b[0], b[1]]], { w: 2, hl: 4, hw: 5 });
};
R.JointAsBuiltCmd = () => {
  const s = S(23);
  s.add(box(-8, -8, 0, 2, 2, 4));
  s.add(box(-2, -2, 4, 8, 8, 8), "blue");
  const c = s.P([0, 0, 4]);
  return s.svg() + puck(c[0], c[1], 4.4, 2.8);
};
R.AsBuiltConstraintCmd = () => R.JointAsBuiltCmd() + badge.lock(26, 7, 0.8);
R.FusionDuplicateWithJointsCommand = () => {
  const s = S(23, 0.8, 14);
  s.add(box(-10, -10, 0, 10, 10, 2.5));
  s.add(box(-7, -7, 2.5, -2, -2, 7.5), "blue");
  s.add(box(2, 2, 2.5, 7, 7, 7.5), "blue", { op: 0.6 });
  return s.svg() + badge.plus(26, 26, 5);
};
R.AlignConstraintCmd = () => {
  const s = S(22, 1, 17);
  s.add(box(-10, -4, 0, -2, 3, 8));
  s.add(box(0, -4, 0, 8, 3, 8), "blue");
  return s.svg() + pl([s.P([-12, -4, 8]), s.P([10, -4, 8])], C.sketch, 1.3, dash(2, 1.4));
};
R.AngleConstraintCmd = () => {
  const s = S(23);
  s.add(box(-8, -8, 0, 8, 8, 2));
  s.add(prism([[7, 2], [5.4, 2], [-4.6, 12], [-3, 12]], -7, 7, "x"), "blue");
  const c = s.P([0, 7, 2]);
  return s.svg() + pa(`M${c[0] - 7} ${c[1] - 3.5}A7 7 0 0 1 ${c[0] - 2.6} ${c[1] - 7.6}`, null, C.sketch, 1.5);
};
R.MidplaneConstraintCmd = () => {
  const s = S(21);
  s.add(box(-8, -8, 0, -5.5, 8, 9));
  s.add([[[0, -9, -1], [0, 9, -1], [0, 9, 10], [0, -9, 10]]], "plane", { two: true });
  s.add(box(5.5, -8, 0, 8, 8, 9), "blue");
  return s.svg();
};
R.TangentConstraintCmd = () => {
  const s = S(22);
  s.add(box(-9, -9, 0, 9, 9, 2));
  s.add(cylinder(0, 0, -6, 6, 4.5, 20, "y").map((f) => ({ ...f, pts: f.pts.map(([x, y, z]) => [x, y, z + 6.5]) })), "blue");
  return s.svg();
};
R.RigidGroupCmd = () => {
  const s = S(24, 1, 17);
  s.add(box(-10, -4, 0, -2.5, 3, 6));
  s.add(box(0.5, -4, 0, 8, 3, 6), "blue");
  return s.svg() + badge.lock(16, 8, 1.15);
};
R.FusionMoveJointsCommand = () => {
  const s = jointPair(S(25));
  const c = s.P([0, 0, 4.5]);
  return s.svg() + puck(c[0], c[1], 4, 2.5) + arrow(arcPts(16, 6, 10, 3.6, 160, 380, 14), { w: 1.8, hl: 4, hw: 4.8 });
};
R.FusionMotionRelationshipCommand = () => puck(9, 11, 6, 6) + puck(23, 21, 6, 6) + pl([[13, 15], [19, 17]], C.blue, 2) + ci(13, 15, 1.4, C.blue) + ci(19, 17, 1.4, C.blue);
R.FusionMotionStudyCommand = () => {
  let o = rc(3, 5, 26, 22, C.paper, C.paperEdge, 1);
  o += pl([[5, 22], [10, 12], [16, 18], [22, 8], [27, 14]], C.blue, 1.6);
  for (const [x, y] of [[10, 12], [16, 18], [22, 8]]) o += pg([[x, y - 2.4], [x + 2.4, y], [x, y + 2.4], [x - 2.4, y]], C.yellow, "#8a6400", 0.8);
  return o + ln(3, 25, 29, 25, C.ink, 1);
};
const contactPair = () => { const s = S(22); s.add(box(-8, -8, 0, 8, 8, 3)); s.add(box(-4, -4, 3, 4, 4, 9), "blue"); return s.svg() + badge.spark(9, 16.5, 4.4, "#f2b51c", "#9a6c00"); };
R.EnableContactSetsCmd = () => contactPair() + badge.check();
R.EnableAllContactCmd = () => contactPair() + badge.check();
R.DisableAllContactCmd = () => contactPair() + badge.x();
R.ContactSetCmd = () => contactPair() + badge.plus();
R.NewAssemblyFromPartCommand = () => {
  const s = S(15, 0.6, 9);
  component(s, -6, -6, 0, 6, 6, 7);
  const t = S(28, 0.6, 22);
  component(t, -8, -8, 0, 0, 0, 6); component(t, 1, 1, 0, 8, 8, 6, "blue");
  return s.svg() + arrow([[12, 16], [19, 19]], { w: 1.8, hl: 4, hw: 5 }) + t.svg();
};

// ---------------------------------------------------------------- CONSTRUCT
const offsetPlanes = () => {
  const s = S(22);
  let o = facePlane(s, [[-8, -8, 0], [8, -8, 0], [8, 8, 0], [-8, 8, 0]]);
  o += cplane(s, [[-8, -8, 9], [8, -8, 9], [8, 8, 9], [-8, 8, 9]]);
  const a = s.P([5, 5, 0.5]), b = s.P([5, 5, 9]);
  return o + arrow([a, b], { w: 1.8, hl: 4, hw: 5 });
};
R.ConstructionPlaneOffsetFromPlaneCommand = offsetPlanes;
R.WorkPlaneOffsetFromPlaneCommand = offsetPlanes;
R.ConstructionPlaneAtAngleCommand = () => {
  const s = S(22);
  let o = facePlane(s, [[-8, -8, 0], [8, -8, 0], [8, 8, 0], [-8, 8, 0]]);
  const t = (55 * Math.PI) / 180;
  o += cplane(s, [[-8, 0, 0], [8, 0, 0], [8, -9 * Math.cos(t), 9 * Math.sin(t)], [-8, -9 * Math.cos(t), 9 * Math.sin(t)]]);
  o += caxis(s, [-10, 0, 0], [10, 0, 0]);
  const c = s.P([4, 0, 0]);
  o += pa(`M${c[0] - 3.4} ${c[1] + 2}A5 5 0 0 1 ${c[0] - 1.6} ${c[1] - 5}`, null, C.blue, 1.4);
  return o;
};
R.ConstructionTangentPlaneCommand = () => {
  const s = S(26);
  s.add(cylinder(0, 0, -7, 7, 5, 22, "x").map((f) => ({ ...f, pts: f.pts.map(([x, y, z]) => [x, y, z + 5]) })));
  return s.svg() + cplane(s, [[-9, -9, 10], [9, -9, 10], [9, 9, 10], [-9, 9, 10]]);
};
R.ConstructionMidPlaneCommand = () => {
  const s = S(21);
  s.add(box(-8, -8, 0, 8, -6, 9), "light");
  s.add([[[-9, 0, -1], [9, 0, -1], [9, 0, 10], [-9, 0, 10]]], "plane", { two: true });
  s.add(box(-8, 6, 0, 8, 8, 9), "light");
  return s.svg();
};
R.ConstructionPlanePerpendicularToPlaneCommand = () => {
  const s = S(23);
  let o = facePlane(s, [[-8, -8, 0], [8, -8, 0], [8, 8, 0], [-8, 8, 0]]);
  o += cplane(s, [[-8, 0, 0], [8, 0, 0], [8, 0, 11], [-8, 0, 11]]);
  const c = s.P([0, 0, 0]);
  o += pl([[c[0] + 2.6, c[1] + 1.5], [c[0] + 2.6, c[1] - 1.5], [c[0], c[1] - 3]], C.blue, 1.2);
  return o;
};
R.ConstructionPlaneFromTwoEdgesCommand = () => {
  const s = S(24, 1, 18);
  const a0 = [-6, 6, 0], a1 = [6, -6, 0], d = [-6, -2, 8];
  const ext = (p, q, t) => v3.add(p, v3.mul(v3.sub(q, p), t));
  let o = cplane(s, [a0, a1, v3.add(a1, d), v3.add(a0, d)]);
  o += pl([s.P(ext(a0, a1, -0.15)), s.P(ext(a0, a1, 1.15))], C.blue, 1.8);
  o += pl([s.P(ext(v3.add(a0, d), v3.add(a1, d), -0.15)), s.P(ext(v3.add(a0, d), v3.add(a1, d), 1.15))], C.blue, 1.8);
  return o;
};
R.ConstructionPlaneFromThreePointsCommand = () => {
  const s = S(20);
  let o = cplane(s, [[-8, -8, 2], [8, -8, 0], [8, 8, 4], [-8, 8, 6]]);
  for (const p of [[-5, -5, 2.5], [5, -4, 1], [2, 5, 5]]) { const q = s.P(p); o += cpoint(q[0], q[1]); }
  return o;
};
R.ConstructionPlaneAlongPathCommand = () => {
  const s = S(23);
  const path = bez([-9, 6, 0], [-3, 6, 2], [3, -6, 6], [9, -6, 8], 14);
  let o = s.line(path, C.blue, 1.8);
  o += cplane(s, [[0, -5, -2], [0, 5, -2], [0, 5, 9], [0, -5, 9]].map(([x, y, z]) => [x + y * 0.3, y, z + 2]));
  const mid = s.P([0, 0, 4]);
  return o + s.line(path.slice(7), C.blue, 1.8) + cpoint(mid[0], mid[1], 1.8);
};
R.ConstructionAxisThroughCylinderCommand = () => {
  const s = S(24);
  let o = caxis(s, [0, 0, -4], [0, 0, 6]);
  s.add(cylinder(0, 0, 0, 10, 5.5, 24));
  o += s.svg();
  return o + caxis(s, [0, 0, 10], [0, 0, 18]);
};
R.ConstructionAxisNormalToFaceCommand = () => {
  const s = S(24);
  s.add(box(-8, -8, 0, 8, 8, 4));
  const c = s.P([1, 1, 4]);
  return s.svg() + caxis(s, [1, 1, 4], [1, 1, 17]) + cpoint(c[0], c[1], 1.8);
};
R.ConstructionAxisFromTwoPlanesCommand = () => {
  const s = S(20);
  let o = cplane(s, [[-8, -8, 4], [8, -8, 4], [8, 8, 4], [-8, 8, 4]], { op: 0.5 });
  o += cplane(s, [[0, -8, -3], [0, 8, -3], [0, 8, 11], [0, -8, 11]], { op: 0.5 });
  return o + caxis(s, [0, -11, 4], [0, 11, 4]);
};
R.ConstructionAxisThroughTwoPointsCommand = () => {
  const a = [7, 23], b = [25, 9];
  return pl([[3, 26], [29, 6]], C.axis, 1.8) + cpoint(a[0], a[1]) + cpoint(b[0], b[1]);
};
R.ConstructionAxisThroughEdgeCommand = () => {
  const s = S(22);
  s.add(box(-7, -7, 0, 7, 7, 8));
  return s.svg() + caxis(s, [7, -12, 8], [7, 12, 8]);
};
R.ConstructionPointFromPointCommand = () => {
  const s = S(21);
  s.add(box(-7, -7, 0, 7, 7, 8));
  const c = s.P([7, 7, 8]);
  return s.svg() + cpoint(c[0], c[1], 2.8);
};
R.ConstructionPointThroughTwoEdgesCommand = () => pl([[4, 8], [28, 24]], C.blue, 1.8) + pl([[5, 25], [27, 7]], C.blue, 1.8) + cpoint(16, 16, 2.8);
R.ConstructionPointFromThreePlanesCommand = () => {
  const s = S(20);
  let o = cplane(s, [[-8, -8, 0], [8, -8, 0], [8, 8, 0], [-8, 8, 0]], { op: 0.45 });
  o += cplane(s, [[0, -8, -6], [0, 8, -6], [0, 8, 8], [0, -8, 8]], { op: 0.45 });
  o += cplane(s, [[-8, 0, -6], [8, 0, -6], [8, 0, 8], [-8, 0, 8]], { op: 0.45 });
  const c = s.P([0, 0, 0]);
  return o + cpoint(c[0], c[1], 2.8);
};
R.ConstructionPointFromCircleOrSphereCommand = () => sphere2(16, 16, 11) + cpoint(16, 16, 2.8);
R.ConstructionPointAtEdgeAndPlaneCommand = () => {
  const s = S(19);
  let o = pl([s.P([-6, -6, 12]), s.P([0, 0, 0])], C.blue, 1.8);
  o += cplane(s, [[-9, -9, 0], [9, -9, 0], [9, 9, 0], [-9, 9, 0]]);
  o += pl([s.P([0, 0, 0]), s.P([4, 4, -8])], C.blue, 1.8);
  const c = s.P([0, 0, 0]);
  return o + cpoint(c[0], c[1], 2.6);
};
R.ConstructionPointAlongPathCommand = () => pl(bez([3, 25], [10, 4], [20, 30], [29, 8], 20), C.blue, 1.8) + cpoint(16, 17.5, 2.8);
R.CoordinateSystemCommand = () => { const s = S(22); return triad(s, [0, 0, 0], 11); };

// ---------------------------------------------------------------- INSPECT
R.MeasureCommand = () => {
  const ruler = [[3, 22], [22, 3], [29, 10], [10, 29]];
  let o = pg(ruler, "#f5d36b", "#8a6400", 1);
  let d = "";
  for (let i = 1; i < 9; i++) { const t = i / 9, p = [3 + 19 * t, 22 - 19 * t], L = i % 2 ? 3 : 5; d += `M${p[0]} ${p[1]}l${L * 0.707} ${L * 0.707}`; }
  return o + pa(d, null, "#5a4300", 0.9);
};
R.FusionHalfSectionViewCommand = () => {
  const s = S(22);
  const prof = [[-8, 0], [8, 0], [8, 8], [2.5, 8], [2.5, 3], [-2.5, 3], [-2.5, 8], [-8, 8]];
  const f = prism(prof, -8, 0, "y");
  tint(f, (n) => n[1] > 0.9, "blue");
  s.add(f);
  let o = s.svg();
  const cut = (pts) => pts.map(([x, z]) => s.P([x, 0, z]));
  o += hatch(cut([[-8, 0], [-8, 8], [-2.5, 8], [-2.5, 0]]), 4, "#0e4d88", 0.7);
  o += hatch(cut([[2.5, 0], [2.5, 8], [8, 8], [8, 0]]), 4, "#0e4d88", 0.7);
  o += cplane(s, [[-10, 0, -2], [10, 0, -2], [10, 0, 11], [-10, 0, 11]], { op: 0.32 });
  return o;
};
R.InterferenceCheckCommand = () => {
  const s = S(21);
  s.add(box(-8, -8, 0, 2, 2, 8));
  s.add(box(-2, -2, 0, 7, 7, 8), "glass");
  s.add(box(-2, -2, 0, 2, 2, 8), "red", { op: 0.9 });
  return s.svg();
};
R.FusionCenterOfMassCommand = () => {
  const cx = 16, cy = 16, r = 9;
  const q = (a0, a1, fill) => pg([[cx, cy], ...arcPts(cx, cy, r, r, a0, a1, 8)], fill, null);
  return ln(3, 16, 29, 16, C.ink, 1) + ln(16, 3, 16, 29, C.ink, 1) + ci(cx, cy, r, C.white, null) + q(-90, 0, "#26313c") + q(90, 180, "#26313c") + ci(cx, cy, r, null, "#1d252d", 1.2);
};
R.FusionCurvatureCombAnalysisCommand = () => {
  const pts = bez([3, 24], [10, 6], [20, 28], [29, 10], 14);
  let d = "", env = [];
  pts.forEach((p, i) => {
    if (i === 0 || i === pts.length - 1) return;
    const a = pts[i - 1], b = pts[i + 1], t = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...t);
    const n = [-t[1] / l, t[0] / l];
    const k = 6 * Math.sin((i / pts.length) * Math.PI * 2);
    const e = [p[0] + n[0] * k, p[1] + n[1] * k];
    env.push(e); d += `M${p[0]} ${p[1]}L${e[0]} ${e[1]}`;
  });
  return pa(d, null, "#9b59b6", 0.8) + pl(env, "#9b59b6", 1) + pl(pts, C.ink, 1.6);
};
const bandSphere = (cols, horizontal = true) => {
  let o = ci(16, 16, 11, cols[0], null);
  const n = cols.length;
  for (let i = 1; i < n; i++) {
    const y = 5 + (22 * i) / n;
    const h = Math.sqrt(Math.max(0, 121 - (y - 16) ** 2));
    o += pa(horizontal ? `M${16 - h} ${y}A11 11 0 0 0 ${16 + h} ${y}Z` : "", cols[i], null);
  }
  return o + ci(12, 11, 3, "#ffffff", null, 1, { "fill-opacity": 0.4 }) + ci(16, 16, 11, null, C.edge, 1);
};
R.FusionCurvatureMapAnalysisCommand = () => bandSphere(["#e5483d", "#f2a541", "#f6dc54", "#7ac74f", "#3d8fd9"]);
R.FusionZebraAnalysisCommand = () => ci(16, 16, 11, "#f4f6f8", null) + zebraClip() + ci(16, 16, 11, null, C.edge, 1);
function zebraClip() {
  let d = "";
  for (let i = 0; i < 4; i++) {
    const y0 = 7 + i * 5.4;
    const pts = [];
    for (let x = 5; x <= 27; x += 1) { const y = y0 + 2.2 * Math.sin((x - 5) / 4); if ((x - 16) ** 2 + (y - 16) ** 2 < 118) pts.push([x, y]); }
    const pts2 = [];
    for (let x = 27; x >= 5; x -= 1) { const y = y0 + 2.6 + 2.2 * Math.sin((x - 5) / 4); if ((x - 16) ** 2 + (y - 16) ** 2 < 118) pts2.push([x, y]); }
    if (pts.length > 1 && pts2.length > 1) d += pg([...pts, ...pts2], "#2b3540", null);
  }
  return d;
}
R.FusionDraftAnalysisCommand = () => {
  const s = S(21);
  const f = prism([[-7, 0], [7, 0], [4, 8], [-7, 8]], -7, 7, "y");
  tint(f, (n) => n[2] > 0.9, "green");
  tint(f, (n) => n[0] > 0.3 && n[2] > 0.1, "red");
  tint(f, (n) => Math.abs(n[1]) > 0.9, "gold");
  s.add(f);
  return s.svg();
};
R.FusionEnvironmentMapAnalysisCommand = () => {
  let o = ci(16, 16, 11, "#8fa3b8", C.edge, 1);
  o += pa("M5.5 13c4-3 17-3 21 0", null, "#ffffff", 2.6) + pa("M6 20c5 2 15 2 20 0", null, "#3e4e5f", 2.2) + ci(11.5, 10, 2.3, "#ffffff");
  return o + ci(16, 16, 11, null, C.edge, 1);
};
R.FusionIsoCurveAnalysisCommand = () => {
  const s = S(22);
  const N = 6, sheet = [];
  const z = (x, y) => 4 + 2.4 * Math.sin(((x + 8) / 16) * Math.PI) + 1.2 * Math.cos(((y + 8) / 16) * Math.PI * 1.5);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x0 = -8 + (16 * i) / N, x1 = -8 + (16 * (i + 1)) / N, y0 = -8 + (16 * j) / N, y1 = -8 + (16 * (j + 1)) / N;
    sheet.push([[x0, y0, z(x0, y0)], [x1, y0, z(x1, y0)], [x1, y1, z(x1, y1)], [x0, y1, z(x0, y1)]]);
  }
  s.add(sheet, "light", { two: true, crease: 0.7 });
  let o = s.svg();
  for (let i = 1; i < N; i++) {
    const u = -8 + (16 * i) / N, a = [], b = [];
    for (let k = 0; k <= 12; k++) { const v = -8 + (16 * k) / 12; a.push(s.P([u, v, z(u, v)])); b.push(s.P([v, u, z(v, u)])); }
    o += pl(a, C.blue, 0.9) + pl(b, C.blue, 0.9);
  }
  return o;
};
R.FusionSurfaceValidateCommand = () => R.FusionIsoCurveAnalysisCommand() + badge.check();
R.FusionAccessibilityAnalysisCommand = () => {
  const s = S(23);
  const f = prism([[-8, 0], [8, 0], [8, 7], [3, 7], [3, 3], [-3, 3], [-3, 7], [-8, 7]], -7, 7, "y");
  tint(f, (n) => n[2] > 0.9, "green");
  tint(f, (n, c) => n[0] > 0.9 && c[0] < 0, "red");
  s.add(f);
  return s.svg() + arrow([[16, 1.5], [16, 8]], { w: 1.8, hl: 4, hw: 5 });
};
R.FusionMinimumRadiusAnalysisCommand = () => pl(bez([3, 26], [6, 4], [26, 4], [29, 26], 20), C.ink, 1.6) + ci(16, 11.5, 4.5, null, C.red, 1.2, dash(1.6, 1.2)) + ln(16, 11.5, 16, 7, C.red, 1);
const graph = (extra = "") => {
  const nodes = [[16, 7], [7, 17], [25, 17], [12, 26], [22, 26]];
  let o = pa("M16 7L7 17M16 7L25 17M7 17L12 26M25 17L22 26M12 26H22", null, C.ink, 1.2);
  nodes.forEach(([x, y], i) => (o += ci(x, y, 3.2, i ? "#dfe5eb" : C.blueLight, C.edge, 1)));
  return o + extra;
};
R.GraphViewCmd = () => graph();
R.FusionComponentConnectionAnalysisCommand = () => graph(badge.mag(24, 23, 4));
R.FusionEditComponentConnectionAnalysisCommand = () => graph() + pencil(29, 18, 12, 135, 3.6);
R.FusionFastenerStackAnalysisCommand = () => {
  const s = S(20, 0.9);
  s.add(box(-9, -9, 0, 9, 9, 2.6));
  s.add(box(-9, -9, 3, 9, 9, 5.6), "light");
  return s.svg() + bolt(16, 2, 0.9);
};
R.FusionDOFAnalysisCommand = () => {
  const s = S(20);
  let o = triad(s, [0, 0, 0], 10);
  o += pa("M8 9a10 4 0 0 1 16 0", null, "#9b59b6", 1.3);
  return o;
};
R.FusionViewColorCyclingToggleCmd = () => {
  const s = S(22);
  s.add(box(-8, -8, 0, -1, -1, 6), "red");
  s.add(box(1, -8, 0, 8, -1, 6), "green");
  s.add(box(-8, 1, 0, -1, 8, 6), "gold");
  s.add(box(1, 1, 0, 8, 8, 6), "blue");
  return s.svg();
};
R.FacegroupsToggleCmd = () => {
  const s = S(21);
  const f = box(-7, -7, 0, 7, 7, 8);
  tint(f, (n) => n[2] > 0.9, "blue");
  tint(f, (n) => n[0] > 0.9, "green");
  tint(f, (n) => n[1] > 0.9, "gold");
  s.add(f);
  const g = "#20324a";
  return s.svg() + triGrid(hquad(s, -7, -7, 7, 7, 8), 2, g, 0.5) + triGrid([s.P([7, -7, 8]), s.P([7, 7, 8]), s.P([7, 7, 0]), s.P([7, -7, 0])], 2, g, 0.5) + triGrid([s.P([-7, 7, 8]), s.P([7, 7, 8]), s.P([7, 7, 0]), s.P([-7, 7, 0])], 2, g, 0.5);
};
R.FusionAssemblyStatisticsCommand = () => {
  let o = ln(4, 27, 28, 27, C.ink, 1.2) + ln(4, 27, 4, 4, C.ink, 1.2);
  [[7, 15, C.blue], [13, 9, "#3db0a0"], [19, 18, C.sketch], [24, 12, C.blue]].forEach(([x, y, f]) => (o += rc(x, y, 4, 27 - y, f, C.edge, 0.7)));
  return o;
};
R.SimilarPartsCommand = () => {
  const s = S(17, 0.65, 10); s.add(box(-6, -6, 0, 6, 6, 7));
  const t = S(27, 0.65, 20); t.add(box(-6, -6, 0, 6, 6, 7), "blue");
  return s.svg() + t.svg() + badge.mag(24, 10, 4.2);
};
R.ShowHistoryToolbarCmd = () => ci(16, 16, 11, C.paper, C.ink, 1.4) + pl([[16, 9], [16, 16], [21, 19]], C.ink, 1.6) + arrow(arcPts(16, 16, 11, 11, 150, 215, 6), { w: 1.4, hl: 3.4, hw: 4.2, fill: C.ink, stroke: C.ink });
R.ShowChangeAwarenessToolbarCmd = () => page(5, 3, 18, 24) + ci(23, 23, 6, C.blue, C.blueEdge, 0.8) + pl([[20, 23], [22.5, 25.5], [26.5, 20.5]], C.white, 1.5);

// ---------------------------------------------------------------- INSERT
R.FusionAddCanvasCommand = () => { const s = S(19); return picture(hquad(s, -9, -9, 9, 9, 0)); };
R.FusionAddEditDecalCommand = () => {
  const s = S(21);
  s.add(box(-7.5, -7.5, 0, 7.5, 7.5, 8));
  return s.svg() + picture([s.P([7.5, -5, 6.5]), s.P([7.5, 5, 6.5]), s.P([7.5, 5, 1.5]), s.P([7.5, -5, 1.5])]);
};
R.TSplineImportCommand = () => pa("M5 21c-1-5 2-10 7-10s9 3 9 7-3 8-8 8-7-2-8-5z", "#cdbff0", "#5b3d8f", 1) + arrow([[27, 2], [20, 11]], { w: 2, hl: 4.6, hw: 5.6 });
R.SketchImportSVG = () => page(5, 2, 20, 27, "SVG") + pa("M9 16c2-6 6-6 7-2s5 4 6-2", null, C.sketch, 1.5);
R.ImportDxfFileCommand = () => page(5, 2, 20, 27, "DXF") + pl([[9, 17], [13, 9], [17, 15], [21, 9]], C.sketch, 1.5);
R.ParaMeshInsertAlignCommand = () => {
  const s = S(24, 0.95, 14);
  s.add(box(-7, -7, 0, 7, 7, 7), "light");
  let o = s.svg();
  o += triGrid(hquad(s, -7, -7, 7, 7, 7), 2) + triGrid([s.P([7, -7, 7]), s.P([7, 7, 7]), s.P([7, 7, 0]), s.P([7, -7, 0])], 2) + triGrid([s.P([-7, 7, 7]), s.P([7, 7, 7]), s.P([7, 7, 0]), s.P([-7, 7, 0])], 2);
  return o + arrow([[29, 2], [22, 10]], { w: 2, hl: 4.4, hw: 5.6 });
};
R.FusionFastenersCommand = () => bolt(16, 3, 1.3);
R.InsertMcMasterCarrComponentCommand = () => page(3, 3, 17, 23) + bolt(22, 10, 0.9) + arrow([[29, 2], [24, 7]], { w: 1.6, hl: 3.4, hw: 4.4 });

// ---------------------------------------------------------------- SELECT
const selBox = (mat = "steel", tintFn) => { const s = S(19, 0.9, 13); const f = box(-6.5, -6.5, 0, 6.5, 6.5, 8); if (tintFn) tintFn(f); s.add(f, mat); return s; };
R.SelectCommand = () => cursor(11, 6, 1.35);
R.selectWindow = () => rc(3.5, 4.5, 21, 17, "#d8e9f8", C.blueEdge, 1.1, { ...dash(2.4, 1.6), "fill-opacity": 0.7 }) + cursor(19, 15, 1);
R.selectFreeForm = () => pa("M6 18c-4-6 2-13 10-13s13 4 11 10-9 6-14 5c-4-1-5 4-1 6", "#d8e9f8", C.blueEdge, 1.1, { ...dash(2.4, 1.6), "fill-opacity": 0.7 }) + cursor(19, 15, 1);
R.selectPaint = () => pa("M4 22c4-8 8-8 10-4s6 4 9-6", null, "#7cbaf0", 4.5) + pa("M4 22c4-8 8-8 10-4s6 4 9-6", null, C.blueEdge, 1) + cursor(19, 15, 1);
R.SelectByNameCommand = () => rc(2.5, 6, 22, 10, C.paper, C.paperEdge, 1) + (ctx.small ? ln(5, 11, 19, 11, C.ink, 2) : tx(13.5, 14, "Abc", 7.5, C.ink)) + cursor(18, 14, 1);
R.SelectByBoundaryCommand = () => pg([[5, 9], [17, 4], [28, 11], [24, 26], [8, 25]], "#cfe4f7", C.blueEdge, 1.4) + pl([[11, 4], [11, 29]], C.sketch, 1.4) + pl([[3, 18], [29, 18]], C.sketch, 1.4) + ci(18, 12, 2.2, C.blue);
R.FusionSelectBodiesBySizeCommand = () => {
  const s = S(16, 0.55, 8); s.add(box(-5, -5, 0, 5, 5, 6));
  const t = S(28, 0.95, 20); t.add(box(-5, -5, 0, 5, 5, 7), "blue");
  return s.svg() + t.svg() + cursor(4, 16, 0.85);
};
R.SelectByInvertCommand = () => rc(3, 3, 11, 11, C.blueLight, C.blueEdge, 1) + rc(18, 18, 11, 11, "#e3e8ed", C.paperEdge, 1) + arrow([[18, 7], [26, 7], [26, 14]], { w: 1.6, hl: 3.6, hw: 4.4 }) + arrow([[14, 25], [6, 25], [6, 18]], { w: 1.6, hl: 3.6, hw: 4.4 });
R.FusionSelectSeedAndBoundaryFacesCommand = () => {
  const s = selBox("steel", (f) => tint(f, (n) => n[2] > 0.9, "blue"));
  return s.svg() + cursor(16, 13, 0.9) + ci(13, 11, 1.6, C.sketch);
};
R.FusionDragCompControlsCmd = () => {
  const s = S(21);
  component(s, -5, -5, 0, 5, 5, 6);
  return s.svg() + arrow([[16, 16], [29, 8]], { w: 1.8, hl: 4, hw: 5 }) + cursor(6, 4, 0.9);
};
R.SelectBodyPriorityCommand = () => selBox("blue").svg() + cursor(19, 15, 1);
R.SelectFacePriorityCommand = () => selBox("steel", (f) => tint(f, (n) => n[0] > 0.9, "blue")).svg() + cursor(19, 15, 1);
R.SelectEdgePriorityCommand = () => { const s = selBox(); return s.svg() + pl([s.P([6.5, -6.5, 8]), s.P([6.5, 6.5, 8])], C.blue, 2.4) + cursor(19, 15, 1); };
R.SelectComponentPriorityCommand = () => { const s = S(19, 0.9, 13); component(s, -6.5, -6.5, 0, 6.5, 6.5, 8, "blue"); return s.svg() + cursor(19, 15, 1); };
R.SelectionFilterCommand = () => pg([[4, 5], [28, 5], [19, 16], [19, 26], [13, 29], [13, 16]], "#dfe5eb", C.edge, 1.2) + ln(6, 8, 26, 8, C.blue, 1.6);

// ---------------------------------------------------------------- CONFIGURE / POSITION
R.FusionStartDesignConfigModeCmd = () => table(3, 5, 22, 20, 4, 3) + badge.gear(24, 24, 5.4);
R.FusionShowDesignConfigPanelCmd = () => table(3, 5, 26, 22, 4, 3, { head: "#bcd6ef" });
R.FusionConfigurationRulesCmd = () => table(3, 5, 22, 20, 4, 2) + pl([[20, 24], [23, 27], [29, 20]], C.green, 2);
R.SnapshotCmd = () => rc(4, 9, 24, 17, "#5e6a76", C.edge, 1, { rx: 2 }) + rc(10, 6, 8, 4, "#5e6a76", C.edge, 1) + ci(16, 17.5, 5.6, "#cfe4f7", "#22303c", 1.2) + ci(16, 17.5, 2.4, C.blue);
R.AsBuiltPositionsCmd = () => R.SnapshotCmd() + badge.check(25, 25, 5);

export const SOLID = R;

export const SOLID_GROUPS = [
  ["SOLID / CREATE", ["SketchCreate", "SketchFeature", "Extrude", "Revolve", "Sweep", "SolidLoft", "FusionRibCommand", "FusionWebCommand", "EmbossCmd", "FusionHoleCommand", "FusionThreadCommand", "PrimitiveBox", "PrimitiveCylinder", "PrimitiveSphere", "PrimitiveTorus", "PrimitiveCoil", "PrimitivePipe", "StockModelCommand", "PatternRectangular", "PatternCircular", "PatternOnPath", "FusionPatternGeometricCommand", "MirrorCommand", "FusionSurfaceThickenCommand", "SurfaceSculpt", "TSplineBaseFeatureCreationCommand", "AutomatedModelingCommand", "PushDeriveCommand", "FusionFindFeaturesCommand", "EnclosureCommand", "BaseFeatureCreationCommand", "PCBExternalComponentCreationCmd", "PCBDeriveCmd", "PCBCreateCmd", "JointOrigin", "TimelineBuilderCommand"]],
  ["SOLID / MODIFY", ["FusionPressPullCommand", "EditFaceCommand", "FusionFilletEdgesCommand", "FusionChamferCommand", "FusionShellBodyCommand", "FusionDraftCommand", "ModifyScale", "FusionCombineCommand", "FusionOffsetFacesCommand", "FusionReplaceFaceCommand", "FusionSplitFaceCommand", "FusionSplitBodyCommand", "FusionPartingLineSplitCmd", "FusionMoveCommand", "AlignCmd", "FusionDeleteCommand", "SoftDeleteCommand", "ArrangeCommand", "FusionRemoveFeaturesCommand", "FusionRemoveFacesCommand", "ReplaceWithPrimitivesCommand", "VolFieldCreateLatticeCommand", "VolFieldTextureCommand", "VolFieldModifyModelCommand", "PhysicalMaterialCommand", "AppearanceCommand", "MaterialCommand", "ChangeParameterCommand", "FusionComputeAllCommand", "FusionComputeUnresolvedCommand", "TSpline2BRepCommand", "MaterializedBomHybridCmd"]],
  ["SOLID / ASSEMBLE", ["FusionImportCommandFromToolbar", "FusionCreateNewComponentCommand", "FusionDuplicateWithJointsCommand", "AssemblyMateCommand", "AlignConstraintCmd", "AngleConstraintCmd", "MidplaneConstraintCmd", "TangentConstraintCmd", "JointConstraintCmd", "JointAssembleCmdNew", "JointAsBuiltCmd", "AsBuiltConstraintCmd", "RigidGroupCmd", "FusionMoveJointsCommand", "FusionMotionRelationshipCommand", "FusionMotionStudyCommand", "EnableContactSetsCmd", "EnableAllContactCmd", "DisableAllContactCmd", "ContactSetCmd", "NewAssemblyFromPartCommand"]],
  ["SOLID / CONSTRUCT", ["ConstructionPlaneOffsetFromPlaneCommand", "WorkPlaneOffsetFromPlaneCommand", "CoordinateSystemCommand", "ConstructionPlaneAtAngleCommand", "ConstructionTangentPlaneCommand", "ConstructionMidPlaneCommand", "ConstructionPlanePerpendicularToPlaneCommand", "ConstructionPlaneFromTwoEdgesCommand", "ConstructionPlaneFromThreePointsCommand", "ConstructionPlaneAlongPathCommand", "ConstructionAxisThroughCylinderCommand", "ConstructionAxisNormalToFaceCommand", "ConstructionAxisFromTwoPlanesCommand", "ConstructionAxisThroughTwoPointsCommand", "ConstructionAxisThroughEdgeCommand", "ConstructionPointFromPointCommand", "ConstructionPointThroughTwoEdgesCommand", "ConstructionPointFromThreePlanesCommand", "ConstructionPointFromCircleOrSphereCommand", "ConstructionPointAtEdgeAndPlaneCommand", "ConstructionPointAlongPathCommand"]],
  ["SOLID / INSPECT", ["MeasureCommand", "FusionHalfSectionViewCommand", "InterferenceCheckCommand", "FusionCenterOfMassCommand", "FusionCurvatureCombAnalysisCommand", "FusionCurvatureMapAnalysisCommand", "FusionDraftAnalysisCommand", "FusionEnvironmentMapAnalysisCommand", "FusionIsoCurveAnalysisCommand", "FusionZebraAnalysisCommand", "FusionSurfaceValidateCommand", "FusionAccessibilityAnalysisCommand", "FusionMinimumRadiusAnalysisCommand", "FusionComponentConnectionAnalysisCommand", "FusionFastenerStackAnalysisCommand", "GraphViewCmd", "FusionDOFAnalysisCommand", "FusionEditComponentConnectionAnalysisCommand", "FusionViewColorCyclingToggleCmd", "FacegroupsToggleCmd", "FusionAssemblyStatisticsCommand", "SimilarPartsCommand", "ShowHistoryToolbarCmd", "ShowChangeAwarenessToolbarCmd"]],
  ["SOLID / INSERT", ["PullDeriveCommand", "FusionAddEditDecalCommand", "FusionAddCanvasCommand", "TSplineImportCommand", "SketchImportSVG", "ImportDxfFileCommand", "ParaMeshInsertAlignCommand", "FusionFastenersCommand", "InsertMcMasterCarrComponentCommand"]],
  ["SOLID / SELECT", ["SelectCommand", "selectWindow", "selectFreeForm", "selectPaint", "SelectByNameCommand", "SelectByBoundaryCommand", "FusionSelectBodiesBySizeCommand", "SelectByInvertCommand", "FusionSelectSeedAndBoundaryFacesCommand", "FusionDragCompControlsCmd", "SelectBodyPriorityCommand", "SelectFacePriorityCommand", "SelectEdgePriorityCommand", "SelectComponentPriorityCommand", "SelectionFilterCommand"]],
  ["SOLID / CONFIGURE + POSITION", ["FusionStartDesignConfigModeCmd", "FusionShowDesignConfigPanelCmd", "FusionConfigurationRulesCmd", "SnapshotCmd", "AsBuiltPositionsCmd"]],
];
