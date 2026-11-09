// SURFACE / MESH / SHEET METAL / PLASTIC / UTILITIES tab icons, plus application-level
// commands (file, undo/redo, view navigation, toggles) used by menus, marking menu and nav bar.
import {
  S, ctx, C, ln, pl, pg, pa, ci, elp, rc, tx, dash, arrow, arcPts, bez, regPoly, spt, prism, box, cylinder, circ2, tint,
  revolve, v3, isoEllipse, badge, cplane, sphere2, cursor, page, puck, hquad, refresh, bolt, table, triGrid, picture,
} from "./parts.js";
import { tube, loftRings, pencil, lineArrow, skl, skg, rrect2, normal } from "./draw.js";
import { SOLID, shellBox } from "./cmd-solid.js";
import { UI } from "./ui.js";

const R = {};

// ---------------------------------------------------------------- shared surface / mesh / sheet helpers
/** Wavy two-sided sheet over [x0,x1]x[y0,y1]; returns z(x,y). */
function sheet(s, o = {}) {
  const x0 = o.x0 ?? -9, x1 = o.x1 ?? 9, y0 = o.y0 ?? -9, y1 = o.y1 ?? 9, N = o.n ?? 8;
  const z = o.z ?? ((x, y) => 3 + 2.2 * Math.sin(((x - x0) / (x1 - x0)) * Math.PI) - 1 * Math.cos(((y - y0) / (y1 - y0)) * Math.PI));
  const faces = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < 2; j++) {
    const a = x0 + ((x1 - x0) * i) / N, b = x0 + ((x1 - x0) * (i + 1)) / N, c = y0 + ((y1 - y0) * j) / 2, d = y0 + ((y1 - y0) * (j + 1)) / 2;
    faces.push([[a, c, z(a, c)], [b, c, z(b, c)], [b, d, z(b, d)], [a, d, z(a, d)]]);
  }
  s.add(faces, o.mat ?? "light", { two: true, crease: 0.8 });
  return z;
}
/** Vertical curved wall (surface extrude) along a 2D curve in XY, from z0 to z1. */
function wall(s, curve, z0, z1, mat = "light") {
  const faces = [];
  for (let i = 0; i < curve.length - 1; i++) { const [a, b] = [curve[i], curve[i + 1]]; faces.push([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]]); }
  s.add(faces, mat, { two: true, crease: 0.8 });
}
/** Low-poly faceted ball with every edge drawn (mesh look). */
function meshBall(s, c = [0, 0, 6], r = 8, mat = "light", nu = 10, nv = 6) {
  const prof = [];
  for (let i = 0; i <= nv; i++) { const a = -Math.PI / 2 + (Math.PI * i) / nv; prof.push([r * Math.cos(a), c[2] + r * Math.sin(a)]); }
  const f = revolve(prof, 0, 360, nu, { cx: c[0], cy: c[1], inside: () => c });
  s.add(f, mat, { crease: 1.01, ew: 0.7 });
  return f;
}
function meshBlock(s, b = [-7, -7, 0, 7, 7, 8], mat = "light") {
  s.add(box(...b), mat);
  const [x0, y0, z0, x1, y1, z1] = b;
  s.raw(triGrid(hquad(s, x0, y0, x1, y1, z1), 2) + triGrid([s.P([x1, y0, z1]), s.P([x1, y1, z1]), s.P([x1, y1, z0]), s.P([x1, y0, z0])], 2) + triGrid([s.P([x0, y1, z1]), s.P([x1, y1, z1]), s.P([x1, y1, z0]), s.P([x0, y1, z0])], 2));
}
/** Sheet-metal L bracket (base + flange); flange tinted blue when `hi`. */
function bracket(s, o = {}) {
  const t = o.t ?? 1.3, h = o.h ?? 9, L = o.L ?? 8, rb = o.rb ?? 1.6;
  const prof = [[-L, 0], [L - rb, 0]];
  for (let i = 1; i <= 4; i++) { const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2); prof.push([L - rb + rb * Math.cos(a), rb + rb * Math.sin(a)]); }
  prof.push([L, h], [L - t, h], [L - t, rb]);
  for (let i = 3; i >= 0; i--) { const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2); prof.push([L - rb + (rb - t) * Math.cos(a), rb + (rb - t) * Math.sin(a)]); }
  prof.push([-L, t]);
  const f = prism(prof, -(o.W ?? 7), o.W ?? 7, "y");
  if (o.hi !== false) tint(f, (n, c) => c[0] > L - t - 0.01 && c[2] > rb, "blue");
  s.add(f, "steel", { crease: 0.85 });
  return f;
}
/** Flat sheet with bend lines. */
function flat(s, hi = false) {
  s.add(box(-10, -7, 0, 10, 7, 1), hi ? "blue" : "steel");
  return pl([s.P([3, -7, 1]), s.P([3, 7, 1])], C.ink, 0.9, dash(2, 1.4)) + pl([s.P([-4, -7, 1]), s.P([-4, 7, 1])], C.ink, 0.9, dash(2, 1.4));
}
/** A 16px UI glyph drawn at 32 units with strokes kept proportionate (not doubled). */
const ui32 = (name, color = "#46525e") => {
  const k = ctx.small ? 0.9 : 0.66;
  const inner = (UI[name] ? UI[name]() : "").replace(/stroke-width="([0-9.]+)"/g, (m, v) => `stroke-width="${Math.round(parseFloat(v) * k * 100) / 100}"`);
  return `<g transform="scale(2)" color="${color}">${inner}</g>`;
};

// ---------------------------------------------------------------- SURFACE
R.FusionSurfacePatchCommand = () => {
  const s = S(21);
  const z = sheet(s, { mat: "blue" });
  const loop = [];
  for (let i = 0; i <= 8; i++) loop.push(s.P([-9 + (18 * i) / 8, -9, z(-9 + (18 * i) / 8, -9)]));
  for (let i = 0; i <= 8; i++) loop.push(s.P([9, -9 + (18 * i) / 8, z(9, -9 + (18 * i) / 8)]));
  for (let i = 0; i <= 8; i++) loop.push(s.P([9 - (18 * i) / 8, 9, z(9 - (18 * i) / 8, 9)]));
  for (let i = 0; i <= 8; i++) loop.push(s.P([-9, 9 - (18 * i) / 8, z(-9, 9 - (18 * i) / 8)]));
  return s.svg() + pl(loop, C.sketch, 1.6);
};
R.SurfaceExtrude = () => {
  const s = S(24);
  const curve = bez([-8, 6], [-2, -4], [2, 10], [8, -6], 10);
  wall(s, curve, 0, 8);
  s.raw(s.line(curve.map(([x, y]) => [x, y, 0]), C.sketch, 1.7));
  const c = s.P([0, 2, 8]);
  return s.svg() + arrow([[c[0], c[1] - 1], [c[0], 1.5]], { w: 2, hl: 4.4, hw: 5.6 });
};
R.SurfaceRevolve = () => {
  const s = S(23);
  s.raw(s.line([[0, 0, -2], [0, 0, 13]], C.ink, 0.9, dash(3, 1.5)));
  s.add(revolve([[3, 0], [7, 3], [5, 8], [7, 11]], 90, 360, 24), "light", { two: true, crease: 0.85 });
  const ring = [];
  for (let a = 105; a <= 345; a += 12) { const t = (a * Math.PI) / 180; ring.push(s.P([8.6 * Math.cos(t), 8.6 * Math.sin(t), 13])); }
  return s.svg() + arrow(ring, { w: 1.9, hw: 5.6, hl: 4.8 });
};
R.SurfaceSweep = () => {
  const s = S(21);
  const path = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16, u = -10 + 20 * t, w = 4 * Math.sin(2 * Math.PI * t); path.push([0.707 * (u + w), 0.707 * (-u + w)]); }
  wall(s, path, 0, 6);
  s.raw(s.line(path.map(([x, y]) => [x, y, 0]), C.sketch, 1.4) + s.line([[path[0][0], path[0][1], 0], [path[0][0], path[0][1], 6]], C.sketch, 1.8));
  return s.svg();
};
R.SurfaceLoft = () => {
  const s = S(23);
  const a = bez([-8, 6], [-2, -2], [2, 8], [8, -4], 10).map(([x, y]) => [x, y, 0]);
  const b = bez([-8, 2], [-2, 8], [2, -6], [8, -8], 10).map(([x, y]) => [x, y, 10]);
  const faces = [];
  for (let i = 0; i < 10; i++) faces.push([a[i], a[i + 1], b[i + 1], b[i]]);
  s.add(faces, "light", { two: true, crease: 0.8 });
  return s.svg() + s.line(a, C.sketch, 1.7) + s.line(b, C.sketch, 1.7);
};
R.FusionSurfaceRuledCommand = () => {
  const s = S(23);
  s.add(box(-8, -8, 0, 8, 8, 5));
  s.add([[[8, -8, 5], [8, 8, 5], [14, 8, 9], [14, -8, 9]]], "blue", { two: true });
  return s.svg();
};
R.FusionSurfaceOffsetCommand = () => {
  const s = S(26);
  sheet(s, { z: (x) => 1 + 2 * Math.sin(((x + 9) / 18) * Math.PI) });
  sheet(s, { z: (x) => 8 + 2 * Math.sin(((x + 9) / 18) * Math.PI), mat: "blue" });
  const a = s.P([0, 0, 3]), b = s.P([0, 0, 10]);
  return s.svg() + arrow([a, b], { w: 1.6, hl: 3.6, hw: 4.4 });
};
const surfPrim = (fn) => () => { const svg = fn(); return svg; };
R.SurfPrimitiveBox = () => { const s = S(21); s.add(box(-6.5, -6.5, 0, 6.5, 6.5, 9).filter((f) => f.tag !== "top"), "light", { two: true }); return s.svg(); };
R.SurfPrimitiveCylinder = () => { const s = S(22); s.add(cylinder(0, 0, 0, 11, 7, 24).filter((f) => f.tag === "side"), "light", { two: true }); return s.svg(); };
R.SurfPrimitiveSphere = surfPrim(() => sphere2(16, 16, 11) + pa("M5 16a11 4 0 0 0 22 0", null, C.edge, 0.8));
R.SurfPrimitiveTorus = () => SOLID.PrimitiveTorus();
R.SurfPrimitiveCoil = () => SOLID.PrimitiveCoil();
R.SurfPrimitivePipe = () => SOLID.PrimitivePipe();
R.FusionSurfaceStitchCommand = () => {
  const s = S(21);
  sheet(s, { x1: 0, z: (x) => 3 + 0.25 * x });
  sheet(s, { x0: 0, z: (x) => 3 + 0.25 * x, mat: "blue" });
  let d = "";
  for (let y = -7; y <= 7; y += 2.8) { const a = s.P([-1.2, y, 2.7]), b = s.P([1.2, y, 3.3]); d += `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`; }
  return s.svg() + pa(d, null, C.sketch, 1.4);
};
R.FusionSurfaceUnStitchCommand = () => {
  const s = S(21);
  sheet(s, { x1: -1.5, z: (x) => 3 + 0.25 * x });
  sheet(s, { x0: 1.5, z: (x) => 3 + 0.25 * x, mat: "blue" });
  return s.svg();
};
R.FusionSurfaceTrimCommand = () => {
  const s = S(21);
  const z = sheet(s);
  const cut = [];
  for (let k = 0; k <= 10; k++) { const y = -9 + 1.8 * k, x = 2 + 3 * Math.sin(k / 3); cut.push(s.P([x, y, z(x, y) + 0.05])); }
  return s.svg() + pl(cut, C.sketch, 1.8) + badge.x(25, 9, 4.6);
};
R.FusionSurfaceUntrimCommand = () => {
  const s = S(21);
  sheet(s);
  const e = isoEllipse(s, [0, 0, 4.5], 3.5);
  return s.svg() + elp(e.cx, e.cy, e.rx, e.ry, "#cfe4f7", C.blue, 1.4, dash(2, 1.4));
};
R.FusionExtendCommand = () => {
  const s = S(21, 1, 13);
  sheet(s, { x1: 3, z: (x) => 3 + 0.2 * x });
  sheet(s, { x0: 3, x1: 9, z: (x) => 3 + 0.2 * x, mat: "glass", n: 3 });
  const a = s.P([3, 0, 3.6]), b = s.P([12, 0, 5.4]);
  return s.svg() + arrow([a, b], { w: 1.8, hl: 4, hw: 5 });
};
R.FusionSurfaceMergeCommand = () => {
  const s = S(21);
  sheet(s, { x1: 0, mat: "blue", z: () => 3 });
  sheet(s, { x0: 0, mat: "blue", z: () => 3 });
  return s.svg() + pl([s.P([0, -9, 3]), s.P([0, 9, 3])], C.red, 1.2, dash(1.6, 1.4));
};
R.FusionSurfaceReverseNormalCommand = () => {
  const s = S(23);
  sheet(s, { z: () => 3 });
  const a = s.P([-3, -3, 3]), b = s.P([3, 3, 3]);
  return s.svg() + arrow([a, [a[0], a[1] - 11]], { w: 1.6, hl: 3.6, hw: 4.4 }) + arrow([b, [b[0], b[1] + 8]], { w: 1.6, hl: 3.6, hw: 4.4, fill: C.red, stroke: C.redEdge });
};

// ---------------------------------------------------------------- MESH
R.ParaMeshTessellateCommand = () => {
  const s = S(17, 0.6, 9); s.add(box(-6, -6, 0, 6, 6, 7));
  const t = S(27, 0.65, 22); meshBlock(t, [-6, -6, 0, 6, 6, 7]);
  return s.svg() + arrow([[12, 17], [19, 20.5]], { w: 1.8, hl: 4, hw: 5 }) + t.svg();
};
R.ParaMeshPlanarSectionCommand = () => { const s = S(20); meshBall(s); return s.svg() + cplane(s, [[-11, -11, 6], [11, -11, 6], [11, 11, 6], [-11, 11, 6]], { op: 0.5 }) + (() => { const e = isoEllipse(s, [0, 0, 6], 8); return elp(e.cx, e.cy, e.rx, e.ry, null, C.proj, 1.6); })(); };
const meshWith = (extra, mat = "light") => { const s = S(20); meshBall(s, [0, 0, 6], 8, mat); return s.svg() + extra; };
R.ParaMeshRepairCommand = () => meshWith(badge.check());
R.ParaMeshCalculateFaceGroupsCommand = () => { const s = S(21); const f = box(-7, -7, 0, 7, 7, 8); tint(f, (n) => n[2] > 0.9, "blue"); tint(f, (n) => n[0] > 0.9, "green"); tint(f, (n) => n[1] > 0.9, "gold"); s.add(f); return s.svg() + triGrid(hquad(s, -7, -7, 7, 7, 8), 2, "#20324a", 0.5); };
R.ParaMeshMergeFaceGroupsCommand = () => { const s = S(21); const f = box(-7, -7, 0, 7, 7, 8); tint(f, (n) => n[2] > 0.9 || n[0] > 0.9, "blue"); s.add(f); return s.svg() + triGrid(hquad(s, -7, -7, 7, 7, 8), 2, "#20324a", 0.5); };
R.ParaMeshCreateFaceGroupCommand = () => R.ParaMeshCalculateFaceGroupsCommand() + badge.plus();
R.ParaMeshRemeshCommand = () => { const s = S(20); meshBall(s, [0, 0, 6], 8, "light", 16, 10); return s.svg(); };
R.ParaMeshReduceCommand = () => { const s = S(20); meshBall(s, [0, 0, 6], 8, "light", 6, 4); return s.svg() + arrow([[27, 4], [27, 15]], { w: 1.8, hl: 4, hw: 5 }); };
R.ParaMeshPlaneCutCommand = () => { const s = S(22); meshBall(s, [0, 0, 5], 8); return s.svg() + cplane(s, [[-11, -11, 7], [11, -11, 7], [11, 11, 7], [-11, 11, 7]], { op: 0.55 }); };
R.ParaMeshHollowCommand = () => { const s = S(21); shellBox(s, -7.5, -7.5, 0, 7.5, 7.5, 8, 1.6, "light", "blue"); return s.svg() + triGrid([s.P([7.5, -7.5, 8]), s.P([7.5, 7.5, 8]), s.P([7.5, 7.5, 0]), s.P([7.5, -7.5, 0])], 2) + triGrid([s.P([-7.5, 7.5, 8]), s.P([7.5, 7.5, 8]), s.P([7.5, 7.5, 0]), s.P([-7.5, 7.5, 0])], 2); };
R.ParaMeshCombineCommand = () => { const s = S(21); meshBall(s, [-3, -3, 5], 6); meshBall(s, [3, 3, 5], 6, "blue"); return s.svg(); };
R.ParaMeshScaleCommand = () => { const s = S(24, 0.75, 13); meshBall(s, [0, 0, 5], 6); return s.svg() + arrow([[18, 13], [29, 3]], { w: 1.8, hl: 4, hw: 5 }); };
R.ParaMeshBaseFeatureCreateCommand = () => meshWith(pencil(29, 18, 12, 135, 3.8));
R.ParaMeshEmptyBaseFeatureCommand = () => meshWith(badge.plus());
R.ParaMeshSmoothCommand = () => { const s = S(20); meshBall(s, [0, 0, 6], 8, "light", 14, 8); return s.svg(); };
R.ParaMeshSmoothBoundaryCommand = R.ParaMeshSmoothCommand;
R.ParaMeshReverseNormalsCommand = () => meshWith(arrow([[24, 8], [24, 2]], { w: 1.4, hl: 3, hw: 4, fill: C.red, stroke: C.redEdge }));
R.ParaMeshCloseCracksCommand = () => meshWith(pa("M6 22l3-3 2 2 3-3", null, C.red, 1.4));
R.ParaMeshEraseAndFillCommand = () => meshWith(badge.minus());
R.ParaMeshBridgeCommand = () => { const s = S(22); meshBall(s, [-5, -5, 4], 4.5); meshBall(s, [5, 5, 4], 4.5); return s.svg() + pa("M9 13c3-4 11-4 14 0", null, C.blue, 2); };
R.ParaMeshAlignCommand = () => meshWith(arrow([[3, 27], [11, 22]], { w: 1.6, hl: 3.6, hw: 4.4 }));
R.ParaMeshAttractToReferenceCommand = () => meshWith(pa("M3 27h26", null, C.blue, 1.6));
R.ParaMeshTextureCommand = () => { const s = S(20); meshBall(s, [0, 0, 6], 8, "blue"); return s.svg(); };
R.ParaMeshExtractCommand = () => meshWith(arrow([[22, 10], [29, 4]], { w: 1.6, hl: 3.6, hw: 4.4 }));
R.ParaMeshRemoveCommand = () => meshWith(badge.x());
R.ParaMeshConvertCommand = () => { const s = S(17, 0.6, 9); meshBall(s, [0, 0, 6], 8); const t = S(27, 0.62, 23); t.add(box(-6, -6, 0, 6, 6, 8)); return s.svg() + arrow([[13, 17], [19, 20]], { w: 1.8, hl: 4, hw: 5 }) + t.svg(); };
R.ParaMeshToQuadMeshCommand = () => { const s = S(21); s.add(box(-7, -7, 0, 7, 7, 8), "light"); const grid = (q) => { const [a, b, c, d] = q; let p = ""; for (let i = 1; i < 3; i++) { const t = i / 3; p += `M${a[0] + (b[0] - a[0]) * t} ${a[1] + (b[1] - a[1]) * t}L${d[0] + (c[0] - d[0]) * t} ${d[1] + (c[1] - d[1]) * t}M${a[0] + (d[0] - a[0]) * t} ${a[1] + (d[1] - a[1]) * t}L${b[0] + (c[0] - b[0]) * t} ${b[1] + (c[1] - b[1]) * t}`; } return pa(p, null, C.ink, 0.7); }; return s.svg() + grid(hquad(s, -7, -7, 7, 7, 8)) + grid([s.P([7, -7, 8]), s.P([7, 7, 8]), s.P([7, 7, 0]), s.P([7, -7, 0])]) + grid([s.P([-7, 7, 8]), s.P([7, 7, 8]), s.P([7, 7, 0]), s.P([-7, 7, 0])]); };
R.ParaMeshBaseFeatureStopCommand = () => meshWith(badge.check());
R.ParaMeshShowSelectionPanelCmd = () => meshWith(cursor(19, 14, 0.95));

// ---------------------------------------------------------------- SHEET METAL
R.FusionSheetMetalFlangeCommand = () => { const s = S(22); bracket(s); return s.svg(); };
R.DMConvertToSheetMetalCmd = () => {
  const s = S(17, 0.6, 9); s.add(box(-6, -6, 0, 6, 6, 7));
  const t = S(28, 0.62, 22); bracket(t, { hi: false });
  return s.svg() + arrow([[12, 17], [18, 20]], { w: 1.8, hl: 4, hw: 5 }) + t.svg();
};
R.ConvertToSheetMetalCmd = R.DMConvertToSheetMetalCmd;
R.FusionSheetMetalFlatPatternCmd = () => { const s = S(18); const d = flat(s, false); return s.svg() + d; };
R.FusionSheetMetalRulesCommand = () => { const s = S(20, 0.85, 14); bracket(s, { hi: false }); return s.svg() + badge.gear(25, 25, 5.4); };
R.FusionSheetMetalRulesLibraryCommand = () => { const s = S(20, 0.85, 14); bracket(s, { hi: false }); return s.svg() + rc(19, 18, 11, 11, C.paper, C.paperEdge, 1) + pa("M21 21h7M21 23.5h7M21 26h5", null, C.ink, 0.8); };
const plateCorner = (cornerMat, prof) => { const s = S(19); const f = prism(prof, 0, 2.6, "z"); tint(f, (n, c, ff) => ff.tag === "side" && n[0] > 0.2 && n[1] > 0.2, cornerMat); s.add(f); return s.svg(); };
R.FusionSheetMetalFilletCommand = () => { const pts = [[-9, -9], [9, -9], [9, 2]]; for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push([2 + 7 * Math.cos(a), 2 + 7 * Math.sin(a)]); } pts.push([-9, 9]); return plateCorner("blue", pts); };
R.FusionSheetMetalChamferCommand = () => plateCorner("blue", [[-9, -9], [9, -9], [9, 1], [1, 9], [-9, 9]]);
R.FusionSheetmetalRefoldCommand = () => {
  const s = S(17, 0.6, 10); flat(s);
  const t = S(28, 0.62, 22); bracket(t);
  return s.svg() + arrow([[13, 17], [19, 20]], { w: 1.8, hl: 4, hw: 5 }) + t.svg();
};
R.FusionSheetmetalUnfoldCommand = () => {
  const s = S(17, 0.6, 10); bracket(s, { hi: false });
  const t = S(26, 0.62, 21); t.add(box(-10, -7, 0, 10, 7, 1.2), "blue");
  return s.svg() + arrow([[13, 15], [19, 19]], { w: 1.8, hl: 4, hw: 5 }) + t.svg();
};
R.FusionSheetMetalHemFlangeCommand = () => {
  const s = S(22);
  const prof = [[-9, 0], [6, 0]];
  for (let i = 1; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; prof.push([6 + 2.2 * Math.cos(a), 2.2 + 2.2 * Math.sin(a)]); }
  prof.push([0, 4.4], [0, 3.2]);
  for (let i = 7; i >= 1; i--) { const a = -Math.PI / 2 + (i / 8) * Math.PI; prof.push([6 + 1 * Math.cos(a), 2.2 + 1 * Math.sin(a)]); }
  prof.push([6, 1.2], [-9, 1.2]);
  const f = prism(prof, -7, 7, "y");
  tint(f, (n, c) => c[0] > 3.5 || c[2] > 2, "blue");
  s.add(f, "steel", { crease: 0.85 });
  return s.svg();
};
R.FusionSheetMetalLoftCommand = () => { const s = S(22); s.add(loftRings([circ2(0, 0, 4, 16).map(([x, y]) => [x, y, 10]), [[-7, -7], [7, -7], [7, 7], [-7, 7]].flatMap((p, i, a) => { const q = a[(i + 1) % 4]; return [0, 1, 2, 3].map((k) => [p[0] + ((q[0] - p[0]) * k) / 4, p[1] + ((q[1] - p[1]) * k) / 4, 0]); })].reverse(), { caps: false }), "blue", { two: true, crease: 0.8 }); return s.svg(); };
R.SheetMetalFoldCmd = () => { const s = S(24); bracket(s, { h: 7 }); return s.svg() + arrow(arcPts(24, 10, 6, 6, 120, 20, 10), { w: 1.6, hl: 3.6, hw: 4.4 }); };
R.FusionSheetMetalCornerCommand = () => { const s = S(22); s.add(box(-8, -8, 0, 8, 8, 1.3)); s.add(box(6.7, -8, 1.3, 8, 8, 9)); s.add(box(-8, 6.7, 1.3, 6.5, 8, 9), "blue"); return s.svg(); };
R.FusionJoinByBendCommand = () => { const s = S(22); bracket(s); return s.svg() + badge.link(8, 9); };
R.FusionSheetMetalRipCommand = () => { const s = S(22); bracket(s, { hi: false }); return s.svg() + pl([s.P([8, 0, 0]), s.P([8, 0, 9])], C.red, 1.6, dash(1.6, 1.2)); };
R.FusionSheetMetalJogCommand = () => { const s = S(22); s.add(prism([[-9, 0], [-1, 0], [2, 4], [9, 4], [9, 5.3], [1.4, 5.3], [-1.6, 1.3], [-9, 1.3]], -7, 7, "y"), "steel", { crease: 0.85 }); return s.svg(); };

// ---------------------------------------------------------------- PLASTIC
R.FusionAssignPlasticRuleCommand = () => { const s = S(20, 0.85, 13); shellBox(s, -7, -7, 0, 7, 7, 6, 1.2, "steel", "light"); return s.svg() + badge.gear(25, 25, 5.4, C.blue); };
R.FusionManagePlasticRuleCommand = () => table(4, 5, 22, 20, 4, 2) + badge.gear(25, 25, 5.4, C.blue);
R.FusionBossCommand = () => { const s = S(23); s.add(box(-8, -8, 0, 8, 8, 2)); s.add(cylinder(0, 0, 2, 10, 3.8, 22), "blue"); const e = isoEllipse(s, [0, 0, 10], 1.8); return s.svg() + elp(e.cx, e.cy, e.rx, e.ry, "#24425f", null); };
R.FusionSnapFitCommand = () => { const s = S(24); s.add(box(-8, -8, 0, 8, 8, 2)); s.add(prism([[-1, 2], [1, 2], [1, 9], [3.5, 9.5], [1, 12], [-1, 12]], -4, 4, "x"), "blue", { crease: 0.9 }); return s.svg(); };
R.FusionLipCommand = () => { const s = S(22); s.add(box(-9, -7, 0, 9, 7, 6)); s.add(box(-1.2, -7, 6, 1.2, 7, 8.5), "blue"); return s.svg(); };
R.FusionRestCommand = () => { const s = S(22); s.add(box(-8, -8, 0, 8, 8, 3)); s.add(box(-3, -8, 3, 3, 8, 5), "blue"); return s.svg(); };
R.DesignAdviceCmd = () => { const s = S(23, 0.85, 12); s.add(box(-6, -6, 0, 6, 6, 7)); return s.svg() + ui32b("light", 14, 1); };
function ui32b(name, x, y) { return `<g transform="translate(${x} ${y}) scale(1.1)">${UI[name] ? UI[name]() : ""}</g>`; }

// ---------------------------------------------------------------- UTILITIES
R.ModelingToggleCmdDef = () => rc(3, 12, 26, 9, "#e3e8ed", C.paperEdge, 1, { rx: 1 }) + [6, 12, 18].map((x) => rc(x, 14, 4.4, 5, "#9fb3c7", C.edge, 0.8)).join("") + rc(24, 9, 2.6, 15, C.sketch, C.sketchDark, 0.8);
R.ThreeDprintCmdDef = () => {
  const s = S(27, 0.9);
  let o = "";
  for (let z = 0; z < 6; z += 1.5) { s.add(box(-6, -6, z, 6, 6, z + 1.5), z > 3 ? "blue" : "steel", { crease: 0.95 }); }
  o += s.svg();
  o += pg([[13, 3], [19, 3], [19, 8], [16.8, 11], [15.2, 11], [13, 8]], "#7d8996", C.edge, 1) + ln(16, 11, 16, 14.5, C.sketch, 1.6);
  return o;
};
R.ScriptsManagerCommand = () => pa("M10 9l-6 7 6 7M22 9l6 7-6 7", null, C.ink, 2) + pa("M18 6l-4 20", null, C.blue, 2);
R.ExchangeAppStoreCommand = () => pg([[6, 11], [26, 11], [24, 28], [8, 28]], C.blue, C.blueEdge, 1) + pa("M11 11V9a5 5 0 0 1 10 0v2", null, C.ink, 1.6);
R.APIHelpCommand = () => rc(5, 4, 20, 24, C.paper, C.paperEdge, 1) + rc(5, 4, 4, 24, "#9fb3c7", C.paperEdge, 1) + (ctx.small ? "" : tx(17, 21, "?", 13, C.blue));
R.FusionManageThreadsLibraryCommand = () => SOLID.FusionThreadCommand() + rc(19, 19, 11, 11, C.paper, C.paperEdge, 1) + pa("M21 22h7M21 24.5h7M21 27h5", null, C.ink, 0.8);
const note = (inner) => { const s = S(23, 0.85, 12); s.add(box(-6, -6, 0, 6, 6, 6)); return s.svg() + inner; };
R.HoleThreadNoteCommand = () => note(lineArrow([[24, 9], [17, 15]], C.ink, { w: 1, hl: 3, hw: 3 }) + rc(20, 3, 10, 7, C.paper, C.ink, 0.9) + (ctx.small ? "" : tx(25, 8.8, "M6", 5.5, C.ink)));
R.LeaderLineNoteCommand = () => note(lineArrow([[27, 6], [21, 6], [16, 13]], C.ink, { w: 1, hl: 3, hw: 3 }));
R.DimensionNoteCommand = () => note(lineArrow([[3, 4], [29, 4]], C.ink, { both: true, w: 1, hl: 3, hw: 3 }) + ln(3, 2, 3, 9, C.ink, 0.8) + ln(29, 2, 29, 12, C.ink, 0.8));
R.GeometricToleranceNoteCommand = () => rc(3, 10, 26, 10, C.paper, C.ink, 1) + ln(11, 10, 11, 20, C.ink, 0.9) + ln(21, 10, 21, 20, C.ink, 0.9) + ci(7, 15, 2.6, null, C.ink, 0.9) + ln(7, 11.5, 7, 18.5, C.ink, 0.8) + ln(3.5, 15, 10.5, 15, C.ink, 0.8) + pa("M13 15h6", null, C.ink, 1) + pa("M23 13l4 4M23 17l4-4", null, C.ink, 0.9);
R.GeneralNoteCommand = () => rc(4, 6, 24, 20, C.paper, C.ink, 1) + pa("M8 12h16M8 16h16M8 20h10", null, C.ink, 1.1);

// ---------------------------------------------------------------- APPLICATION / VIEW
R.FileNew = () => page(6, 3, 18, 25) + badge.plus(24, 24, 5.6);
R.FileOpen = () => pa("M3 8h8l2 2h12v4H8l-5 13z", "#d6dde5", C.paperEdge, 1) + pg([[8, 14], [30, 14], [25, 27], [3, 27]], "#eef2f5", C.paperEdge, 1);
const floppy = () => rc(5, 5, 22, 22, "#4f8fd2", C.blueEdge, 1, { rx: 2 }) + rc(9, 5, 13, 8, "#eef4fa", C.blueEdge, 0.9) + rc(18, 6.5, 2.4, 5, C.blueEdge) + rc(9, 17, 14, 10, "#ffffff", C.blueEdge, 0.9);
R.FileSave = floppy;
R.FileSaveAs = () => floppy() + pencil(29, 16, 13, 135, 3.8);
R.RecoverySave = () => floppy() + ci(25, 25, 5.4, C.white, C.ink, 1.1) + pl([[25, 22], [25, 25], [27.4, 26.4]], C.ink, 1.1);
R.FileExport = () => page(4, 3, 18, 25) + arrow([[16, 18], [30, 18]], { w: 2.2, hl: 5, hw: 6.2 });
R.FileImport = () => page(10, 3, 18, 25) + arrow([[1, 18], [16, 18]], { w: 2.2, hl: 5, hw: 6.2 });
R.FileExportSTL = () => page(6, 3, 20, 26, "STL") + (() => { const s = S(16, 0.55); meshBall(s, [0, 0, 4], 6); return s.svg(); })();
R.FileExportSTEP = () => page(6, 3, 20, 26, "STEP", { fs: 5.6 }) + (() => { const s = S(16, 0.55); s.add(box(-6, -6, 0, 6, 6, 6)); return s.svg(); })();
const curveArrow = (rev) => {
  const P = arcPts(16, 19, 10, 9, 200, 340, 14);
  const pts = rev ? P : P.slice().reverse();
  return arrow(pts, { w: 3, hl: 7, hw: 9, fill: "#56626e", stroke: "#2f3943" });
};
R.UndoCommand = () => ui32("undo");
R.RedoCommand = () => ui32("redo");
R.RepeatCommand = () => arrow(arcPts(16, 16, 10, 10, 150, 450 - 40, 24), { w: 2.6, hl: 6, hw: 8, fill: "#56626e", stroke: "#2f3943" });
R.ShowToolbox = () => rc(4, 11, 24, 16, "#d9534f", "#8f2320", 1, { rx: 1.5 }) + pa("M12 11V8h8v3", null, C.ink, 1.8) + rc(4, 16, 24, 2, "#a33a37") + rc(14, 15, 4, 4, "#f2f2f2", C.edge, 0.8);
R.KeyboardShortcuts = () => ui32("keyboard");
R.About = () => ci(16, 16, 12, C.blue, C.blueEdge, 1) + ln(16, 14.5, 16, 23, C.white, 2.6) + ci(16, 9.5, 1.8, C.white);
R.VisibilityToggleCmd = () => ui32("eye");
R.ToggleViewCube = () => { const s = S(20); s.add(box(-6.5, -6.5, 0, 6.5, 6.5, 9), "light"); return s.svg(); };
R.ToggleNavBar = () => rc(3, 12, 26, 9, "#e9edf1", C.paperEdge, 1, { rx: 4.5 }) + [8, 13, 18, 24].map((x) => ci(x, 16.5, 1.7, C.ink)).join("");
R.ToggleBrowser = () => ui32("browser");
R.ToggleDataPanel = () => ui32("data-panel");
R.ResetLayout = () => rc(3, 4, 26, 22, C.paper, C.paperEdge, 1) + rc(3, 4, 26, 4, "#c9d6e3", C.paperEdge, 1) + rc(3, 8, 7, 18, "#e3e8ed", C.paperEdge, 1) + refresh(21, 18, 5.5, { w: 1.4, hl: 3, hw: 3.8 });
R.FusionPropertiesCommand = () => page(5, 3, 18, 25) + pa("M9 11h10M9 15h10M9 19h6", null, C.ink, 1) + badge.info(24, 24, 5.6);
R.PanCommand = () => ui32("pan");
R.ZoomCommand = () => ui32("zoom");
R.ZoomWindowCommand = () => ui32("zoom-window");
R.ConstrainedOrbitCommand = () => ui32("orbit");
R.FreeOrbitCommand = () => ui32("free-orbit");
R.LookAtCommand = () => ui32("look-at");
R.FitCommand = () => ui32("fit");
R.HomeViewCommand = () => ui32("home");
R.SetOrbitCenterCommand = () => ui32("orbit") + ci(16, 16, 2.4, C.sketch, C.sketchDark, 0.8);
R.ResetOrbitCenterCommand = () => ui32("orbit") + badge.x(25, 25, 4.6);
R.DisplaySettings = () => ui32("display");
R.GridSettings = () => ui32("grid");
R.ViewportsCommand = () => ui32("viewports");
R.CopyCommand = () => ui32("copy");
R.PasteCommand = () => ui32("paste");
R.RenameBrowserCmd = () => rc(3, 10, 26, 12, C.white, C.ink, 1) + ln(8, 13, 8, 19, C.ink, 1.2) + pa("M11 16h12", null, C.inkLight, 1.4);
R.IsolateCmd = () => { const s = S(22); s.add(box(-4, -4, 0, 4, 4, 6), "blue"); return rc(3, 3, 26, 26, null, C.inkLight, 1, dash(2, 1.6)) + s.svg(); };
R.UnisolateCmd = () => { const s = S(22); s.add(box(-9, -9, 0, -3, -3, 5)); s.add(box(3, 3, 0, 9, 9, 5)); s.add(box(-4, -4, 0, 4, 4, 6), "blue"); return s.svg(); };
R.FindInBrowser = () => ui32("browser") + badge.mag(23, 22, 4.2);
R.FindInWindow = () => { const s = S(21, 0.9, 13); s.add(box(-6, -6, 0, 6, 6, 7), "blue"); return s.svg() + badge.mag(23, 22, 4.2); };
R.FusionFindInTimeline = () => R.ModelingToggleCmdDef() + badge.mag(23, 22, 4.2);
R.SketchActivate = () => SOLID.SketchCreate();
R.ShowProfile = () => skg([[5, 8], [27, 8], [27, 24], [5, 24]]);
R.SliceSketchCommand = () => { const s = S(22); s.add(box(-7, -7, 0, 7, 0, 8)); return s.svg() + cplane(s, [[-9, 0, -1], [9, 0, -1], [9, 0, 10], [-9, 0, 10]], { op: 0.45 }); };
R.FusionDeleteFeature = () => SOLID.FusionDeleteCommand();
R.EditFeature = () => { const s = S(22, 0.9, 12); s.add(box(-6, -6, 0, 6, 6, 7)); return s.svg() + pencil(18, 19, 13, 135, 4); };
R.SuppressFeature = () => { const s = S(21); s.add(box(-6.5, -6.5, 0, 6.5, 6.5, 8), "glass", { edash: true }); return s.svg() + pa("M6 26L26 6", null, C.red, 2); };
R.RollToHere = () => R.ModelingToggleCmdDef();
R.MeshCommand = () => meshWith("");
R.SurfaceCommand = () => { const s = S(21); sheet(s, { mat: "blue" }); return s.svg(); };
R.NamedViewCommand = () => ui32("camera");
R.TextCommands = () => ui32("text-commands");
R.ScriptsAndAddins = R.ScriptsManagerCommand;

export const OTHER = R;
export const OTHER_GROUPS = [
  ["SURFACE", ["FusionSurfacePatchCommand", "SurfaceExtrude", "SurfaceRevolve", "SurfaceSweep", "SurfaceLoft", "FusionSurfaceRuledCommand", "FusionSurfaceOffsetCommand", "SurfPrimitiveBox", "SurfPrimitiveCylinder", "SurfPrimitiveSphere", "SurfPrimitiveTorus", "SurfPrimitiveCoil", "SurfPrimitivePipe", "FusionSurfaceStitchCommand", "FusionSurfaceUnStitchCommand", "FusionSurfaceTrimCommand", "FusionSurfaceUntrimCommand", "FusionExtendCommand", "FusionSurfaceMergeCommand", "FusionSurfaceReverseNormalCommand"]],
  ["MESH", ["ParaMeshInsertAlignCommand", "ParaMeshTessellateCommand", "ParaMeshPlanarSectionCommand", "ParaMeshEmptyBaseFeatureCommand", "ParaMeshRepairCommand", "ParaMeshCalculateFaceGroupsCommand", "ParaMeshMergeFaceGroupsCommand", "ParaMeshCreateFaceGroupCommand", "ParaMeshRemeshCommand", "ParaMeshReduceCommand", "ParaMeshPlaneCutCommand", "ParaMeshHollowCommand", "ParaMeshCombineCommand", "ParaMeshScaleCommand", "ParaMeshBaseFeatureCreateCommand", "ParaMeshSmoothCommand", "ParaMeshSmoothBoundaryCommand", "ParaMeshReverseNormalsCommand", "ParaMeshCloseCracksCommand", "ParaMeshEraseAndFillCommand", "ParaMeshBridgeCommand", "ParaMeshAlignCommand", "ParaMeshAttractToReferenceCommand", "ParaMeshTextureCommand", "ParaMeshExtractCommand", "ParaMeshRemoveCommand", "ParaMeshConvertCommand", "ParaMeshToQuadMeshCommand", "ParaMeshBaseFeatureStopCommand", "ParaMeshShowSelectionPanelCmd"]],
  ["SHEET METAL", ["DMConvertToSheetMetalCmd", "ConvertToSheetMetalCmd", "FusionSheetMetalFlangeCommand", "FusionSheetMetalHemFlangeCommand", "FusionSheetMetalLoftCommand", "SheetMetalFoldCmd", "FusionSheetMetalFlatPatternCmd", "FusionSheetMetalRulesCommand", "FusionSheetMetalRulesLibraryCommand", "FusionSheetmetalUnfoldCommand", "FusionSheetMetalCornerCommand", "FusionJoinByBendCommand", "FusionSheetMetalRipCommand", "FusionSheetMetalJogCommand", "FusionSheetMetalFilletCommand", "FusionSheetMetalChamferCommand", "FusionSheetmetalRefoldCommand"]],
  ["PLASTIC", ["FusionAssignPlasticRuleCommand", "FusionManagePlasticRuleCommand", "FusionBossCommand", "FusionSnapFitCommand", "FusionLipCommand", "FusionRestCommand", "DesignAdviceCmd"]],
  ["UTILITIES", ["ModelingToggleCmdDef", "ThreeDprintCmdDef", "ScriptsManagerCommand", "ExchangeAppStoreCommand", "APIHelpCommand", "FusionManageThreadsLibraryCommand", "HoleThreadNoteCommand", "LeaderLineNoteCommand", "DimensionNoteCommand", "GeometricToleranceNoteCommand", "GeneralNoteCommand"]],
  ["APPLICATION + VIEW", ["FileNew", "FileOpen", "FileSave", "FileSaveAs", "RecoverySave", "FileExport", "FileImport", "FileExportSTL", "FileExportSTEP", "UndoCommand", "RedoCommand", "RepeatCommand", "ShowToolbox", "KeyboardShortcuts", "About", "VisibilityToggleCmd", "ToggleViewCube", "ToggleNavBar", "ToggleBrowser", "ToggleDataPanel", "ResetLayout", "FusionPropertiesCommand", "PanCommand", "ZoomCommand", "ZoomWindowCommand", "ConstrainedOrbitCommand", "FreeOrbitCommand", "LookAtCommand", "FitCommand", "HomeViewCommand", "SetOrbitCenterCommand", "ResetOrbitCenterCommand", "DisplaySettings", "GridSettings", "ViewportsCommand", "CopyCommand", "PasteCommand", "RenameBrowserCmd", "IsolateCmd", "UnisolateCmd", "FindInBrowser", "FindInWindow", "FusionFindInTimeline", "SketchActivate", "ShowProfile", "SliceSketchCommand", "EditFeature", "SuppressFeature", "FusionDeleteFeature", "RollToHere", "ScriptsAndAddins", "MeshCommand", "SurfaceCommand", "NamedViewCommand", "TextCommands"]],
];
