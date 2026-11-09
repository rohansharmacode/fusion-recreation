// createx: Bounding Solid (StockModelCommand). Feature 'boundingsolid': a box, cylinder or tube around the
// selected bodies (relative offsets or a fixed size), oriented to the model, the smallest box (Automatic),
// a coordinate system or a Z axis/plane and X axis. The result is a new body.
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import * as R0 from "../dialogs/util.js";
import { toBodyRef } from "../dialogs/common.js";
import { V, WORLD, orthoFrame, toFrame, fromFrame, bodyPoints, principalAxes, minAreaRect, minCircle } from "./geom.js";
import { frameOf, snapFrame } from "./csys.js";
import { markerSet } from "./markers.js";
import * as MD from "../../meshdata.js";

const R = K.R;
const LEN = ["side", "top", "bottom", "px", "nx", "py", "ny", "pz", "nz", "radial", "front", "back", "inner", "roundUp", "width", "depth", "height", "xOffset", "yOffset", "zOffset", "diameter", "length", "posOffset"];
const AX = { x: 0, y: 1, z: 2 };

// ---------------------------------------------------------------- evaluation
/** Orientation frame of a bounding solid (origin at the world origin unless a coordinate system gives one). */
function orientFrame(st, f, pts) {
  if (f.orient === "csys") {
    const F = frameOf(st, f.csys);
    if (!F) throw new Error("Select a coordinate system");
    return F;
  }
  if (f.orient === "zx") {
    let z = null;
    if (f.zPlane) { const pl = M.resolvePlane(f.zPlane, st); if (pl) z = pl.n; }
    else if (f.zAxis) z = M.axisFromRef(st, f.zAxis).d;
    if (!z) throw new Error("Select the Z axis or plane");
    const x = f.xAxis ? M.axisFromRef(st, f.xAxis).d : null;
    return orthoFrame([0, 0, 0], z, x);
  }
  if (f.orient === "auto") return smallestBoxFrame(pts);
  return { ...WORLD };
}

/** Frame of (nearly) the smallest box around points: principal axes, each refined by a minimum-area rectangle. */
function smallestBoxFrame(pts) {
  if (pts.length < 4) return { ...WORLD };
  const step = Math.max(1, Math.floor(pts.length / 4000));
  const P = step > 1 ? pts.filter((_, i) => i % step === 0) : pts;
  const cand = [{ ...WORLD }];
  const ax = principalAxes(P);
  for (let k = 0; k < 3; k++) {
    const z = ax[k], F0 = orthoFrame([0, 0, 0], z, ax[(k + 1) % 3]);
    const q = P.map((p) => [V.dot(p, F0.x), V.dot(p, F0.y)]);
    const r = minAreaRect(q);
    const c = Math.cos(r.angle), s = Math.sin(r.angle);
    cand.push(orthoFrame([0, 0, 0], z, V.add(V.mul(F0.x, c), V.mul(F0.y, s))));
  }
  for (const zw of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    const F0 = orthoFrame([0, 0, 0], zw);
    const r = minAreaRect(P.map((p) => [V.dot(p, F0.x), V.dot(p, F0.y)]));
    const c = Math.cos(r.angle), s = Math.sin(r.angle);
    cand.push(orthoFrame([0, 0, 0], zw, V.add(V.mul(F0.x, c), V.mul(F0.y, s))));
  }
  let best = null, bv = Infinity;
  for (const F of cand) {
    const e = extents(F, P);
    const vol = (e.max[0] - e.min[0]) * (e.max[1] - e.min[1]) * (e.max[2] - e.min[2]);
    if (vol < bv * (1 - 1e-6)) { bv = vol; best = F; }
  }
  // tidy the axes: Z closest to world Z, X closest to world X, right-handed
  const axes = [best.x, best.y, best.z];
  const pick = (w, from) => from.reduce((a, b) => (Math.abs(V.dot(b, w)) > Math.abs(V.dot(a, w)) ? b : a));
  let z = pick([0, 0, 1], axes);
  if (z[2] < 0) z = V.mul(z, -1);
  const rest = axes.filter((a) => a !== z && Math.abs(V.dot(a, z)) < 0.999);
  let x = rest.length ? pick([1, 0, 0], rest) : best.x;
  if (V.dot(x, [1, 0, 0]) < 0) x = V.mul(x, -1);
  return orthoFrame([0, 0, 0], z, x);
}

function extents(F, pts) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) { const q = toFrame(F, p); for (let i = 0; i < 3; i++) { if (q[i] < mn[i]) mn[i] = q[i]; if (q[i] > mx[i]) mx[i] = q[i]; } }
  return { min: mn, max: mx };
}
const roundUp = (L, r) => (r > 1e-9 ? Math.ceil(L / r - 1e-9) * r : L);

/** Points + frame + extents of a bounding solid's objects (used by the dialog for Model Dimensions). */
export function measure(st, f) {
  const ids = (f.bodies || []).filter((id) => (st.bodies && st.bodies.has(id)) || (st.meshBodies && st.meshBodies.has(id)));
  if (!ids.length) throw new Error("Select objects to create a bounding solid around.");
  const pts = ids.flatMap((id) => bodyPoints(st, id));
  if (!pts.length) throw new Error("Select objects to create a bounding solid around.");
  let F = orientFrame(st, f, pts);
  // Flip X / Y / Z Axis: 180 deg turns about another axis (the frame stays right-handed)
  const neg = (v) => V.mul(v, -1);
  if (f.flipX) F = { ...F, x: neg(F.x), y: neg(F.y) };
  if (f.flipY) F = { ...F, y: neg(F.y), z: neg(F.z) };
  if (f.flipZ) F = { ...F, z: neg(F.z), x: neg(F.x) };
  return { F, pts, e: extents(F, pts) };
}

/** Frame-coordinate geometry of the bounding solid: {box:{min,max}} or {cyl:{axis, c:[u,v], r, a0, a1, ri}}. */
export function geometry(st, f, P) {
  const { F, pts, e } = measure(st, f);
  const v = (k) => (f[k] !== undefined && f[k] !== "" ? M.fval(P, f, k) : 0);
  const t = f.bsType || "relBox";
  const dims = [0, 1, 2].map((i) => e.max[i] - e.min[i]);
  if (t === "relBox" || t === "fixBox") {
    let mn = [...e.min], mx = [...e.max];
    if (t === "relBox") {
      const mode = f.offMode || "sym";
      const o = mode === "none" ? [0, 0, 0, 0, 0, 0] : mode === "sym" ? [v("side"), v("side"), v("side"), v("side"), v("top"), v("bottom")] : [v("px"), v("nx"), v("py"), v("ny"), v("pz"), v("nz")];
      // o = [+X, -X, +Y, -Y, +Z, -Z]
      mx = [mx[0] + o[0], mx[1] + o[2], mx[2] + o[4]];
      mn = [mn[0] - o[1], mn[1] - o[3], mn[2] - o[5]];
      const r = v("roundUp");
      for (let i = 0; i < 3; i++) { const L = mx[i] - mn[i], L2 = roundUp(L, r); mn[i] -= (L2 - L) / 2; mx[i] += (L2 - L) / 2; }
    } else {
      const S = [v("width"), v("depth"), v("height")];
      const pos = [f.xPos || "center", f.yPos || "center", f.zPos || "center"];
      const off = [v("xOffset"), v("yOffset"), v("zOffset")];
      for (let i = 0; i < 3; i++) {
        if (!(S[i] > 0)) throw new Error("The size must be greater than zero");
        if (pos[i] === "center") { const c = (e.min[i] + e.max[i]) / 2 + off[i]; mn[i] = c - S[i] / 2; mx[i] = c + S[i] / 2; }
        else if (pos[i] === "left" || pos[i] === "front" || pos[i] === "bottom") { mn[i] = e.min[i] - off[i]; mx[i] = mn[i] + S[i]; }
        else { mx[i] = e.max[i] + off[i]; mn[i] = mx[i] - S[i]; }
      }
    }
    for (let i = 0; i < 3; i++) if (!(mx[i] - mn[i] > 1e-6)) throw new Error("Failed to create the stock model body.");
    return { F, dims, box: { min: mn, max: mx } };
  }
  // cylinder / tube along a frame axis
  const ax = AX[f.axis || "z"], iu = (ax + 1) % 3, iv = (ax + 2) % 3;
  const q = pts.map((p) => toFrame(F, p));
  const circ = minCircle(q.map((x) => [x[iu], x[iv]]));
  let r = circ.r, a0 = e.min[ax], a1 = e.max[ax];
  let c = circ.c;
  let ri = 0;
  if (t === "relCyl" || t === "relTube") {
    r += v("radial");
    a1 += v("front");
    a0 -= v("back");
    const rd = v("roundUp");
    if (rd > 0) { r = roundUp(2 * r, rd) / 2; const L = a1 - a0, L2 = roundUp(L, rd); a0 -= (L2 - L) / 2; a1 += (L2 - L) / 2; }
  } else {
    const D = v("diameter"), L = v("length");
    if (!(D > 0) || !(L > 0)) throw new Error("The size must be greater than zero");
    r = D / 2;
    const pos = f.pos || "center", off = v("posOffset");
    if (pos === "center") { const m = (e.min[ax] + e.max[ax]) / 2 + off; a0 = m - L / 2; a1 = m + L / 2; }
    else if (pos === "front") { a1 = e.max[ax] + off; a0 = a1 - L; }
    else { a0 = e.min[ax] - off; a1 = a0 + L; }
  }
  if (t === "relTube" || t === "fixTube") {
    ri = v("inner") / 2;
    if (!(ri > 0)) throw new Error("The inner diameter must be greater than zero");
    if (ri >= r - 1e-6) throw new Error("The inner diameter must be smaller than the outer diameter");
  }
  if (!(r > 1e-6) || !(a1 - a0 > 1e-6)) throw new Error("Failed to create the stock model body.");
  return { F, dims, cyl: { axis: ax, c, r, a0, a1, ri } };
}

/** Solid of a geometry() result. */
export function solidOf(g) {
  const F = g.F;
  if (g.box) {
    const { min: mn, max: mx } = g.box;
    const pl = { o: fromFrame(F, [0, 0, mn[2]]), x: F.x, n: F.z };
    const d = R.drawRectangle(mx[0] - mn[0], mx[1] - mn[1]).translate((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2);
    return K.extrudeDrawing(d, pl, 0, mx[2] - mn[2], 0);
  }
  const { axis, c, r, a0, a1, ri } = g.cyl;
  const A = [F.x, F.y, F.z];
  const n = A[axis], x = A[(axis + 1) % 3];
  const o = V.add(F.o, V.mul(n, a0));
  const pl = { o, x, n };
  let d = R.drawCircle(r).translate(c[0], c[1]);
  if (ri > 0) d = d.cut(R.drawCircle(ri).translate(c[0], c[1]));
  return K.extrudeDrawing(d, pl, 0, a1 - a0, 0);
}

/** Frame-coordinate box {min, max} of the bounding solid (cylinders: their enclosing box). */
function boxExt(g) {
  if (g.box) return g.box;
  const { axis, c, r, a0, a1 } = g.cyl;
  const mn = [0, 0, 0], mx = [0, 0, 0], iu = (axis + 1) % 3, iv = (axis + 2) % 3;
  mn[axis] = a0; mx[axis] = a1; mn[iu] = c[0] - r; mx[iu] = c[0] + r; mn[iv] = c[1] - r; mx[iv] = c[1] + r;
  return { min: mn, max: mx };
}
/** Box point [i, j, k] (0 = min, 1 = centre, 2 = max per frame axis) -> frame coordinates. */
const boxPointAt = (ext, bp) => [0, 1, 2].map((a) => ext.min[a] + ((ext.max[a] - ext.min[a]) * bp[a]) / 2);
const BP_NAMES = [["left", "", "right"], ["front", "", "back"], ["bottom", "", "top"]];
/** Display name of a box point, e.g. "Bottom front left", "Top", "Center". */
export function boxPointName(bp) {
  const w = [BP_NAMES[2][bp[2]], BP_NAMES[1][bp[1]], BP_NAMES[0][bp[0]]].filter(Boolean).join(" ");
  return w ? w[0].toUpperCase() + w.slice(1) : "Center";
}
/** World coordinate system of the result: orientation axes + the Origin Mode point. */
function wcsOf(st, f, g) {
  const F = g.F;
  let o = F.o;
  if (f.originMode === "box") o = fromFrame(F, boxPointAt(boxExt(g), f.boxPoint || [1, 1, 0]));
  else if (f.originMode === "point") o = snapFrame(st, f.originPoint || { kind: "originPoint" }).o;
  return { o, x: F.x, y: F.y, z: F.z };
}

export function registerBoundingFeature(app) {
  const fields = Object.fromEntries(LEN.map((k) => [k, "length"]));
  M.registerFeature("boundingsolid", {
    label: "Bounding Solid",
    stem: "Bounding Solid",
    fields,
    makesBodies: true,
    apply(st, f, P) {
      const g = geometry(st, f, P);
      const tool = solidOf(g);
      const id = f.newBody;
      st.bodies.set(id, { id, shape: tool, from: f.id });
      const wcs = wcsOf(st, f, g);
      // the new component's frame is the bounding solid's coordinate system (Origin Mode + Orientation)
      if (f.newOcc && st.occ) {
        const parent = f.occ && st.occ.has(f.occ) ? f.occ : M.ROOT;
        const T = [wcs.x[0], wcs.y[0], wcs.z[0], wcs.o[0], wcs.x[1], wcs.y[1], wcs.z[1], wcs.o[1], wcs.x[2], wcs.y[2], wcs.z[2], wcs.o[2]];
        st.occ.set(f.newOcc, { id: f.newOcc, component: f.newComp, parent, T });
      }
      return { affected: [id], dims: g.dims, wcs, geom: { F: g.F, box: g.box || null, cyl: g.cyl || null, ext: boxExt(g) } };
    },
    deps: (f) => ({ sketches: [f.xAxis, f.zAxis].filter((a) => a && a.sketch).map((a) => a.sketch), bodies: f.bodies || [], features: f.csys ? [f.csys] : [], cplanes: f.zPlane && f.zPlane.kind === "cplane" ? [f.zPlane.id] : [], geo: [] }),
    editor: (a, id) => openBoundingSolid(a, { editId: id }),
    icon: "StockModelCommand",
  });
}

// ---------------------------------------------------------------- dialog
const TYPES = [
  { value: "relBox", label: "Relative size box" }, { value: "relCyl", label: "Relative size cylinder" }, { value: "relTube", label: "Relative size tube" },
  { value: "fixBox", label: "Fixed size box" }, { value: "fixCyl", label: "Fixed size cylinder" }, { value: "fixTube", label: "Fixed size tube" },
];
const isBox = (v) => v.bsType === "relBox" || v.bsType === "fixBox";
const isRel = (v) => v.bsType && v.bsType.startsWith("rel");
const isTube = (v) => v.bsType === "relTube" || v.bsType === "fixTube";
const L0 = "0.00 mm";
const fmt = (x) => `${(Math.round(x * 100) / 100).toFixed(2)} mm`;

const axisSel = (r) => (r.kind === "originAxis" ? { kind: "origin", name: r.name } : r.kind === "sketchCurve" ? { kind: "sketchLine", sketch: r.sketch, curve: r.curve } : r.kind === "edge" ? { kind: "edge", body: r.body, p: r.p } : null);
const axisRef = (a) => (!a ? null : a.kind === "origin" ? { kind: "originAxis", name: a.name } : a.kind === "sketchLine" ? { kind: "sketchCurve", sketch: a.sketch, curve: a.curve } : { kind: "edge", body: a.body, p: a.p, index: -1 });
function linearFilter(r, dlg) {
  if (r.kind === "edge") return R0.isLinearEdge(dlg.baseState, r);
  if (r.kind === "sketchCurve") { const s = dlg.baseState.sketches.get(r.sketch); const cv = s && s.sk.curves[r.curve]; return !!cv && cv.type === "line"; }
  return true;
}

export function openBoundingSolid(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const val = (id, label, def, extra = {}) => ({ id, type: "value", label, kind: "length", default: def, ...extra });
  const rel = (pred) => (v) => isBox(v) && v.bsType === "relBox" && pred(v);
  return app.ui.dialog.open({
    id: "StockModelCommand",
    title: "Bounding Solid",
    icon: "StockModelCommand",
    editId,
    featureLabel: "Bounding Solid",
    help: "Creates a solid around a selected component, body, or set of bodies.",
    labelWidth: 150,
    preselect: (opts.preselect || []).map((r) => (r.kind === "face" ? toBodyRef(r) : r)).filter(Boolean),
    rows: [
      { id: "bodies", type: "selection", label: "Objects", kinds: ["body", "face"], meshBodies: true, mapRef: toBodyRef, prompt: "Select objects to create a bounding solid around.", tooltip: "Select objects to create a bounding solid around." },
      { id: "bsType", type: "dropdown", label: "Type", options: TYPES, default: "relBox" },
      { id: "gcs", type: "group", label: "Coordinate System", rows: [
        { id: "orient", type: "dropdown", label: "Orientation", options: [
          { value: "model", label: "Model orientation" }, { value: "auto", label: "Automatic" }, { value: "csys", label: "Coordinate system" }, { value: "zx", label: "Z axis/plane & X axis" },
        ], default: "model", tooltip: "Orients the bounding solid to align with the coordinate system of the selected objects." },
        { id: "csys", type: "selection", label: "Coordinate System", kinds: ["feature"], max: 1, prompt: "Select a coordinate system", visible: (v) => v.orient === "csys",
          filter: (r, dlg) => { const f = dlg.app.feature(r.id); return !!f && f.type === "csys"; } },
        { id: "zRef", type: "selection", label: "Z Axis", kinds: ["face", "cplane", "originPlane", "originAxis", "edge", "sketchCurve"], max: 1, prompt: "Select a plane or an axis for Z", visible: (v) => v.orient === "zx",
          filter: (r, dlg) => (r.kind === "face" ? r.planar !== false : r.kind === "edge" || r.kind === "sketchCurve" ? linearFilter(r, dlg) : true) },
        { id: "xRef", type: "selection", label: "X Axis", kinds: ["originAxis", "edge", "sketchCurve"], max: 1, min: 0, prompt: "Select an axis for X", visible: (v) => v.orient === "zx", filter: linearFilter },
        { id: "flipX", type: "check", label: "Flip X Axis", default: false, tooltip: "Flips the X axis orientation 180 degrees." },
        { id: "flipY", type: "check", label: "Flip Y Axis", default: false, tooltip: "Flips the Y axis orientation 180 degrees." },
        { id: "flipZ", type: "check", label: "Flip Z Axis", default: false, tooltip: "Flips the Z axis orientation 180 degrees." },
        { id: "originMode", type: "dropdown", label: "Origin Mode", options: [{ value: "model", label: "Model origin" }, { value: "box", label: "Model box point" }, { value: "point", label: "Selected point" }], default: "model", tooltip: "Automatically detects the coordinate system origin of the selected objects." },
        { id: "boxPointText", type: "text", label: "Box Point", text: (dlg) => boxPointName(dlg.values.boxPoint || [1, 1, 0]), visible: (v) => v.originMode === "box", tooltip: "Lets you select a point on the object's bounding box to define the coordinate system origin." },
        { id: "originPoint", type: "selection", label: "Origin Point", kinds: ["vertex", "sketchPoint", "originPoint"], max: 1, prompt: "Select a point to set the origin of the bounding solid.", visible: (v) => v.originMode === "point" },
      ] },
      { id: "axis", type: "dropdown", label: "Axis", tooltip: "Specify the axis of rotation for the cylinder or tube.", options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }, { value: "z", label: "Z" }], default: "z", visible: (v) => !isBox(v) },
      { id: "gd", type: "group", label: "Dimensions", rows: [
        { id: "offMode", type: "dropdown", label: "Offset Mode", options: [{ value: "none", label: "No offset" }, { value: "sym", label: "Symmetrical sides" }, { value: "all", label: "All directions" }], default: "sym", visible: (v) => v.bsType === "relBox" },
        val("side", "Side Offset", L0, { visible: rel((v) => v.offMode === "sym") }),
        val("top", "Top Offset", L0, { visible: rel((v) => v.offMode === "sym") }),
        val("bottom", "Bottom Offset", L0, { visible: rel((v) => v.offMode === "sym") }),
        ...[["px", "+X Offset"], ["nx", "-X Offset"], ["py", "+Y Offset"], ["ny", "-Y Offset"], ["pz", "+Z Offset"], ["nz", "-Z Offset"]].map(([id, l]) => val(id, l, L0, { visible: rel((v) => v.offMode === "all") })),
        val("radial", "Radial Offset", L0, { visible: (v) => v.bsType === "relCyl" || v.bsType === "relTube" }),
        val("front", "Front Offset", L0, { visible: (v) => v.bsType === "relCyl" || v.bsType === "relTube" }),
        val("back", "Back Offset", L0, { visible: (v) => v.bsType === "relCyl" || v.bsType === "relTube" }),
        val("width", "Width (X)", "50.00 mm", { positive: true, visible: (v) => v.bsType === "fixBox" }),
        val("depth", "Depth (Y)", "50.00 mm", { positive: true, visible: (v) => v.bsType === "fixBox" }),
        val("height", "Height (Z)", "50.00 mm", { positive: true, visible: (v) => v.bsType === "fixBox" }),
        { id: "xPos", type: "dropdown", label: "X Position", options: [{ value: "center", label: "Center" }, { value: "left", label: "Offset from left side (-X)" }, { value: "right", label: "Offset from right side (+X)" }], default: "center", visible: (v) => v.bsType === "fixBox" },
        val("xOffset", "Offset", L0, { visible: (v) => v.bsType === "fixBox" }),
        { id: "yPos", type: "dropdown", label: "Y Position", options: [{ value: "center", label: "Center" }, { value: "front", label: "Offset from front (-Y)" }, { value: "back", label: "Offset from back (+Y)" }], default: "center", visible: (v) => v.bsType === "fixBox" },
        val("yOffset", "Offset", L0, { visible: (v) => v.bsType === "fixBox" }),
        { id: "zPos", type: "dropdown", label: "Z Position", options: [{ value: "center", label: "Center" }, { value: "bottom", label: "Offset from bottom (-Z)" }, { value: "top", label: "Offset from top (+Z)" }], default: "center", visible: (v) => v.bsType === "fixBox" },
        val("zOffset", "Offset", L0, { visible: (v) => v.bsType === "fixBox" }),
        val("diameter", "Diameter", "50.00 mm", { positive: true, visible: (v) => v.bsType === "fixCyl" || v.bsType === "fixTube" }),
        val("inner", "Inner Diameter", "10.00 mm", { positive: true, visible: isTube }),
        val("length", "Length", "50.00 mm", { positive: true, visible: (v) => v.bsType === "fixCyl" || v.bsType === "fixTube" }),
        { id: "pos", type: "dropdown", label: "Position", options: [{ value: "center", label: "Center" }, { value: "front", label: "Offset from front" }, { value: "back", label: "Offset from back" }], default: "center", visible: (v) => v.bsType === "fixCyl" || v.bsType === "fixTube" },
        val("posOffset", "Offset", L0, { visible: (v) => v.bsType === "fixCyl" || v.bsType === "fixTube" }),
        val("roundUp", "Round Up to Nearest", L0, { nonNegative: true, visible: isRel, tooltip: "Specifies the rounding up increment for the final bounding solid size." }),
      ] },
      { id: "rigid", type: "check", label: "Rigid Group", default: true, sep: true, tooltip: "Locks the relative position of the bounding solid and selected components, so they move together as one." },
      { id: "gm", type: "group", label: "Model Dimensions", rows: [
        { id: "mdx", type: "text", label: "X", text: (dlg) => modelDim(dlg, 0) },
        { id: "mdy", type: "text", label: "Y", text: (dlg) => modelDim(dlg, 1) },
        { id: "mdz", type: "text", label: "Z", text: (dlg) => modelDim(dlg, 2) },
      ] },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      Object.assign(dlg.values, {
        bodies: (f0.bodies || []).map((b) => ({ kind: "body", body: b })),
        bsType: f0.bsType || "relBox", orient: f0.orient || "model", axis: f0.axis || "z", offMode: f0.offMode || "sym",
        xPos: f0.xPos || "center", yPos: f0.yPos || "center", zPos: f0.zPos || "center", pos: f0.pos || "center",
        csys: f0.csys ? [{ kind: "feature", id: f0.csys }] : [],
        zRef: [f0.zPlane ? R0.refFromPlaneRef(f0.zPlane, st) : axisRef(f0.zAxis)].filter(Boolean),
        xRef: [axisRef(f0.xAxis)].filter(Boolean),
        flipX: !!f0.flipX, flipY: !!f0.flipY, flipZ: !!f0.flipZ, originMode: f0.originMode || "model", rigid: !!f0.rigidGroup,
        originPoint: f0.originPoint ? [{ ...f0.originPoint }] : [],
      });
      if (Array.isArray(f0.boxPoint)) dlg.values.boxPoint = [...f0.boxPoint];
      for (const k of LEN) if (f0[k] !== undefined) dlg.values[k] = String(f0[k]);
    },
    onChange(id, dlg) {
      // picking the orientation geometry comes next (like Fusion activating the new selection)
      if (id === "orient" && (dlg.values.orient === "csys" || dlg.values.orient === "zx")) {
        const row = dlg.values.orient === "csys" ? "csys" : "zRef";
        if (!(dlg.values[row] || []).length) dlg.activate(row);
      }
      // a fixed size starts from the selection size (rounded up to whole millimetres)
      if ((id === "bsType" || id === "bodies" || id === "orient") && dlg.values.bsType.startsWith("fix")) {
        try {
          const { e } = measure(dlg.baseState, buildFeature(dlg.values, true) || { bodies: [] });
          const d = [0, 1, 2].map((i) => Math.ceil(e.max[i] - e.min[i] - 1e-6));
          const ax = AX[dlg.values.axis || "z"];
          const set = (k, x) => { if (!dlg.touched.has(k) && x > 0) dlg.set(k, fmt(x), { noPreview: true }); };
          set("width", d[0]); set("depth", d[1]); set("height", d[2]);
          set("length", d[ax]);
          set("diameter", Math.ceil(Math.hypot(d[(ax + 1) % 3], d[(ax + 2) % 3])));
        } catch { /* nothing selected yet */ }
      }
    },
    build: (v) => buildFeature(v),
    afterPreview(dlg) {
      const r = dlg.previewRes, g = r && r.geom;
      if (!dlg._marks) dlg._marks = markerSet(dlg.app);
      if (dlg.values.originMode !== "box" || !g || !g.ext) { dlg._marks.set([]); return; }
      const cur = (dlg.values.boxPoint || [1, 1, 0]).join(",");
      const pts = [];
      for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) pts.push({ id: i + "," + j + "," + k, p: fromFrame(g.F, boxPointAt(g.ext, [i, j, k])), on: i + "," + j + "," + k === cur });
      dlg._marks.set(pts);
    },
    onCanvasDown(ctx, dlg) {
      if (dlg.values.originMode !== "box" || !dlg._marks) return false;
      const id = dlg._marks.hit(ctx.x, ctx.y);
      if (!id) return false;
      dlg.values.boxPoint = id.split(",").map(Number);
      dlg.touched.add("boxPoint");
      dlg.refresh();
      dlg.schedulePreview(0);
      return true;
    },
    onClose(dlg) { if (dlg._marks) dlg._marks.dispose(); },
    manipulators(dlg) {
      const r = dlg.previewRes, g = r && r.geom;
      if (!g) return [];
      const v = dlg.values, F = g.F, out = [];
      const add = (k, origin, dir, scale = 1) => { if (v[k] === undefined) return; const m = dlg.valueManip(k, { origin, dir, scale, id: k }); if (m) out.push(m); };
      if (g.box) {
        const { min: mn, max: mx } = g.box;
        const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
        const face = (i, s) => { const q = [...c]; q[i] = s > 0 ? mx[i] : mn[i]; return fromFrame(F, q); };
        const A = [F.x, F.y, F.z];
        const back = (k, i, s) => V.sub(face(i, s), V.mul(A[i], s * (dlg.num(k) || 0)));
        if (v.bsType === "relBox" && v.offMode === "sym") { add("side", back("side", 0, 1), F.x); add("top", back("top", 2, 1), F.z); add("bottom", back("bottom", 2, -1), V.mul(F.z, -1)); }
        else if (v.bsType === "relBox" && v.offMode === "all") {
          [["px", 0, 1], ["nx", 0, -1], ["py", 1, 1], ["ny", 1, -1], ["pz", 2, 1], ["nz", 2, -1]].forEach(([k, i, s]) => add(k, back(k, i, s), V.mul(A[i], s)));
        } else if (v.bsType === "fixBox") {
          const cw = fromFrame(F, c);
          add("width", cw, F.x, 0.5); add("depth", cw, F.y, 0.5); add("height", cw, F.z, 0.5);
        }
      } else if (g.cyl) {
        const { axis, c, r: rad, a0, a1 } = g.cyl;
        const A = [F.x, F.y, F.z], n = A[axis], u = A[(axis + 1) % 3], w = A[(axis + 2) % 3];
        const mid = V.add(F.o, V.add(V.mul(n, (a0 + a1) / 2), V.add(V.mul(u, c[0]), V.mul(w, c[1]))));
        if (v.bsType.startsWith("rel")) {
          add("radial", V.add(mid, V.mul(u, rad - (dlg.num("radial") || 0))), u);
          add("front", V.add(mid, V.mul(n, (a1 - a0) / 2 - (dlg.num("front") || 0))), n);
          add("back", V.sub(mid, V.mul(n, (a1 - a0) / 2 - (dlg.num("back") || 0))), V.mul(n, -1));
        } else { add("diameter", mid, u, 0.5); add("length", mid, n, 0.5); }
      }
      return out;
    },
  });
}

function buildFeature(v, loose = false) {
  const bodies = (v.bodies || []).map((r) => r.body).filter(Boolean);
  if (!bodies.length && !loose) return null;
  // like Fusion, the bounding solid is a standalone component (core gives it newComp / newOcc)
  const f = { type: "boundingsolid", operation: "newComponent", bodies, bsType: v.bsType, orient: v.orient, axis: v.axis, offMode: v.offMode, xPos: v.xPos, yPos: v.yPos, zPos: v.zPos, pos: v.pos };
  for (const k of LEN) if (v[k] !== undefined) f[k] = v[k];
  for (const k of ["flipX", "flipY", "flipZ"]) if (v[k]) f[k] = true;
  if (v.rigid) f.rigidGroup = true;
  f.originMode = v.originMode || "model";
  if (f.originMode === "box") f.boxPoint = v.boxPoint || [1, 1, 0];
  if (f.originMode === "point") {
    const p = (v.originPoint || [])[0];
    if (!p) return loose ? { ...f, originMode: "model" } : null;
    f.originPoint = p.kind === "sketchPoint" ? { kind: "sketchPoint", sketch: p.sketch, point: p.point } : p.kind === "vertex" ? { kind: "vertex", body: p.body, p: p.p } : { kind: "originPoint" };
  }
  if (v.orient === "csys") { const c = (v.csys || [])[0]; if (!c) return loose ? { ...f, orient: "model" } : null; f.csys = c.id; }
  if (v.orient === "zx") {
    const z = (v.zRef || [])[0];
    if (!z) return loose ? { ...f, orient: "model" } : null;
    if (z.kind === "face" || z.kind === "cplane" || z.kind === "originPlane") f.zPlane = R0.planeRefFromRef(z);
    else f.zAxis = axisSel(z);
    const x = (v.xRef || [])[0];
    if (x) f.xAxis = axisSel(x);
  }
  return f;
}

/** Size of the selected objects along a frame axis (Model Dimensions group). */
function modelDim(dlg, i) {
  const r = dlg.previewRes;
  return r && r.dims ? fmt(r.dims[i]) : "";
}

// ---------------------------------------------------------------- Rigid Group
/** Occurrence groups of the Bounding Solid features with Rigid Group: [newOcc, owners of the selected bodies]. */
function rigidGroups(app) {
  const C = app.components, out = [];
  for (const f of app.doc.features) {
    if (f.type !== "boundingsolid" || !f.rigidGroup || f.suppressed || !f.newOcc) continue;
    const r = app.featureResult(f.id);
    if (!r || r.ok === false || r.rolled) continue;
    const set = new Set([f.newOcc]);
    for (const b of f.bodies || []) { const o = C.ownerOf(b); if (o && o !== M.ROOT) set.add(o); }
    const list = [...set].filter((o) => C.alive(o));
    if (list.length > 1) out.push(list);
  }
  return out;
}
/** Add the rigid-group partners of moved occurrences (same rigid motion) to a {oid: M} map. */
export function expandRigid(app, map, opts = {}) {
  const C = app.components;
  const out = { ...map };
  const grounded = (o) => { try { const i = C.info && C.info(o); return !!(i && i.grounded); } catch { return false; } };
  let grew = true;
  for (let pass = 0; grew && pass < 4; pass++) {
    grew = false;
    for (const g of rigidGroups(app)) {
      const lead = g.find((o) => out[o]);
      if (!lead) continue;
      // a grounded member holds the whole rigid group in place (unless forced): nothing in it moves
      if (!opts.force && g.some((o) => !map[o] && grounded(o))) { for (const o of g) delete out[o]; continue; }
      const delta = MD.mul(out[lead], M.invRigid(C.transform(lead)));
      for (const o of g) if (!out[o]) { out[o] = MD.mul(delta, C.transform(o)); grew = true; }
    }
  }
  return out;
}
/** Moves of an occurrence carry the other members of its Bounding Solid rigid group along (one undo step). */
export function installRigidGroups(app) {
  const hook = () => {
    const C = app.components;
    if (!C || C.__createxRigid || typeof C.setTransforms !== "function") return;
    C.__createxRigid = true;
    const many = C.setTransforms, one = C.setTransform;
    C.setTransforms = (map, opts) => { let m = map; try { m = expandRigid(app, map || {}, opts || {}); } catch (e) { console.warn("[createx] rigid group", e); } return many(m, opts); };
    C.setTransform = (oid, m, opts = {}) => {
      let ex = null;
      try { ex = expandRigid(app, { [oid]: m }, opts); } catch { ex = null; }
      if (ex && !ex[oid]) return false; // held by a grounded member of its rigid group
      if (!ex || Object.keys(ex).length === 1) return one(oid, m, opts);
      const info = C.info && C.info(oid);
      if (info && info.grounded && !opts.force) return one(oid, m, opts);
      return many(ex, opts);
    };
  };
  hook();
  app.on("ready", hook);
}
