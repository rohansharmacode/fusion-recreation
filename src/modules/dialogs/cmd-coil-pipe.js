// Coil (PrimitiveCoil) and Pipe (PrimitivePipe).
import * as U from "./util.js";
import * as K from "../../kernel.js";
import { OPERATIONS, defaultOperation } from "./common.js";

const V = U.V;

// ------------------------------------------------------------------ Coil
export const COIL_TYPES = [
  { value: "revHeight", label: "Revolution and Height", icon: "coilRevHeight" },
  { value: "revPitch", label: "Revolution and Pitch", icon: "coilRevPitch" },
  { value: "heightPitch", label: "Height and Pitch", icon: "coilHeightPitch" },
  { value: "spiral", label: "Spiral", icon: "coilSpiral" },
];
const COIL_SECTIONS = [
  { value: "circular", label: "Circular", icon: "secCircle" },
  { value: "square", label: "Square", icon: "secSquare" },
  { value: "triExternal", label: "Triangular (External)", icon: "secTriExt" },
  { value: "triInternal", label: "Triangular (Internal)", icon: "secTriInt" },
];
const COIL_POSITIONS = [
  { value: "inside", label: "Inside", icon: "posInside" },
  { value: "center", label: "On Center", icon: "posCenter" },
  { value: "outside", label: "Outside", icon: "posOutside" },
];
const COIL_FIELDS = ["diameter", "revolutions", "height", "pitch", "angle", "sectionSize"];
const uses = {
  revolutions: (t) => t !== "heightPitch",
  height: (t) => t === "revHeight" || t === "heightPitch",
  pitch: (t) => t !== "revHeight",
  angle: (t) => t !== "spiral",
};

/**
 * Fusion's Coil: select a plane, click the centre, move the mouse to size the major diameter and
 * click again (or type it); then finish with the dialog / the diameter and height arrows.
 */
export function openCoil(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const plane = (dlg) => U.resolvePlane(U.planeRefFromRef((dlg.values.plane || [])[0]), dlg.baseState);
  const center = (dlg) => {
    const pl = plane(dlg);
    if (!pl) return null;
    const c = dlg.values.center || [0, 0];
    return { pl, c: K.toWorld(pl, c[0], c[1]) };
  };
  const autoOp = (dlg) => {
    if (dlg.touched.has("operation")) return;
    const cc = center(dlg);
    if (!cc) return;
    const op0 = U.autoOperation(app, dlg.baseState, cc.c, [cc.pl.n]);
    const op = op0 === "cut" ? "join" : op0;
    if (op !== dlg.values.operation) dlg.set("operation", op, { noPreview: true });
  };
  return app.ui.dialog.open({
    id: "PrimitiveCoil",
    title: "Coil",
    icon: "PrimitiveCoil",
    featureLabel: "Coil",
    editId,
    help: "Creates a solid coil. Select a plane then draw a circle to specify the major diameter of the coil. Finish defining the coil using the manipulators or dialog box.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "originPlane" || r.kind === "cplane" || (r.kind === "face" && r.planar !== false)).slice(0, 1),
    activate: (dlg) => ((dlg.values.plane || []).length ? false : undefined),
    ctrlWidth: 172,
    rows: [
      { id: "plane", type: "selection", label: "Plane", kinds: ["originPlane", "cplane", "face"], planar: true, max: 1, toggle: false, prompt: "Select a plane or planar face" },
      { id: "coilType", type: "dropdown", label: "Type", options: COIL_TYPES, default: "revHeight" },
      { id: "diameter", type: "value", label: "Diameter", kind: "length", default: "50.00 mm", positive: true },
      { id: "rotation", type: "dropdown", label: "Rotation", options: [{ value: "cw", label: "Clockwise", icon: "rotCW" }, { value: "ccw", label: "Counterclockwise", icon: "rotCCW" }], default: "cw" },
      { id: "revolutions", type: "value", label: "Revolutions", kind: "none", default: "5", positive: true, visible: (v) => uses.revolutions(v.coilType) },
      { id: "height", type: "value", label: "Height", kind: "length", default: "50.00 mm", positive: true, visible: (v) => uses.height(v.coilType) },
      { id: "pitch", type: "value", label: "Pitch", kind: "length", default: "10.00 mm", positive: true, visible: (v) => uses.pitch(v.coilType) },
      { id: "angle", type: "value", label: "Angle", kind: "angle", default: "0.0 deg", min: -89, max: 89, visible: (v) => uses.angle(v.coilType) },
      { id: "section", type: "dropdown", label: "Section", options: COIL_SECTIONS, default: "circular", sep: true },
      { id: "sectionPosition", type: "dropdown", label: "Section Position", options: COIL_POSITIONS, default: "inside" },
      { id: "sectionSize", type: "value", label: "Section Size", kind: "length", default: "5.00 mm", positive: true },
      { id: "operation", type: "dropdown", label: "Operation", options: OPERATIONS, default: "new", sep: true },
    ],
    init(dlg) {
      dlg._stage = "plane";
      if (!f0) return;
      Object.assign(dlg.values, {
        plane: [U.refFromPlaneRef(f0.plane, dlg.baseState)].filter(Boolean), center: f0.center || [0, 0],
        coilType: f0.coilType || "revHeight", rotation: f0.rotation === "ccw" ? "ccw" : "cw",
        section: f0.section || "circular", sectionPosition: f0.sectionPosition || "inside", operation: f0.operation || "new",
      });
      for (const k of COIL_FIELDS) if (f0[k] !== undefined && f0[k] !== "") dlg.values[k] = String(f0[k]);
      dlg.touched.add("operation");
      dlg._stage = "done";
    },
    onOpen(dlg) {
      if ((dlg.values.plane || []).length && !f0) { dlg.values.center = [0, 0]; dlg._stage = "center"; }
      autoOp(dlg);
    },
    onChange(id, dlg, o) {
      if (id === "plane") {
        if (!f0 && (dlg.values.plane || []).length) { dlg._stage = "center"; dlg.values.center = [0, 0]; }
        if ((dlg.values.plane || []).length) setTimeout(() => { if (!dlg.closed) dlg.activate(null); }, 0);
      }
      // typing a value in the panel (or the HUD) ends the on-canvas placement
      if (o && o.fromInput && dlg._stage !== "done" && dlg._stage !== "plane") dlg._stage = "done";
      if (id === "plane" || id === "center") autoOp(dlg);
    },
    prompt(dlg) {
      if (!(dlg.values.plane || []).length || dlg.active === "plane") return "Select a plane or planar face";
      if (dlg._stage === "center") return "Specify the center point of the coil";
      if (dlg._stage === "diameter") return "Specify the diameter of the coil";
      return dlg.manips.hover || dlg.manips.drag ? "" : "Drag the arrows or enter values";
    },
    onCanvasDown(ctx, dlg) {
      if (dlg.active === "plane" || !(dlg.values.plane || []).length) return false;
      const pl = plane(dlg);
      const rp = pl && app.viewport.rayPlane(ctx.x, ctx.y, pl);
      if (dlg._stage === "center") {
        if (rp) dlg.set("center", [+rp.uv[0].toFixed(4), +rp.uv[1].toFixed(4)], { user: true, delay: 0 });
        dlg._stage = "diameter";
        return true;
      }
      if (dlg._stage === "diameter") {
        if (rp) sizeFromCursor(dlg, rp, true);
        dlg._stage = "done";
        dlg.previewNow();
        return true;
      }
      return false;
    },
    onCanvasMove(ctx, dlg) {
      if (dlg._stage !== "diameter") return false;
      const pl = plane(dlg);
      const rp = pl && app.viewport.rayPlane(ctx.x, ctx.y, pl);
      if (rp) sizeFromCursor(dlg, rp, false);
      return true;
    },
    build(v) {
      const pr = U.planeRefFromRef((v.plane || [])[0]);
      if (!pr) return null;
      const f = { type: "coil", plane: pr, center: v.center || [0, 0], coilType: v.coilType, diameter: v.diameter, rotation: v.rotation, section: v.section, sectionPosition: v.sectionPosition, sectionSize: v.sectionSize, operation: v.operation };
      for (const k of ["revolutions", "height", "pitch", "angle"]) if (uses[k](v.coilType)) f[k] = v[k];
      return f;
    },
    manipulators(dlg) {
      const cc = center(dlg);
      if (!cc || dlg._stage !== "done") return [];
      const out = [dlg.valueManip("diameter", { origin: cc.c, dir: cc.pl.x, scale: 0.5, min: 0.01 })];
      if (uses.height(dlg.values.coilType)) out.push(dlg.valueManip("height", { origin: cc.c, dir: cc.pl.n, min: 0.01 }));
      return out.filter(Boolean);
    },
  });

  function sizeFromCursor(dlg, rp, final) {
    const c = dlg.values.center || [0, 0];
    const r = Math.hypot(rp.uv[0] - c[0], rp.uv[1] - c[1]);
    if (!(r > 1e-3)) return;
    const vp = app.viewport;
    const step = U.niceStep(2 * ((vp && vp.pixelSize && vp.pixelSize(rp.world)) || 0.1));
    const d = Math.max(step, Math.round((2 * r) / step) * step);
    dlg.set("diameter", U.fmt(+d.toFixed(6), "length"), { user: true, delay: final ? 0 : 60, throttle: !final });
  }
}

// ------------------------------------------------------------------ Pipe
const PIPE_SECTIONS = [
  { value: "circular", label: "Circular", icon: "secCircle" },
  { value: "square", label: "Square", icon: "secSquare" },
  { value: "triangular", label: "Triangular", icon: "secTriangle" },
];

/** Sketch curves connected end to end with `cid` in its sketch (Chain Selection). */
function sketchChain(state, sketch, cid) {
  const s = state.sketches.get(sketch);
  if (!s) return [cid];
  const curves = s.sk.curves;
  const ends = (cv) => (cv.type === "line" || cv.type === "arc" ? [cv.p1, cv.p2] : []);
  const seen = new Set([cid]);
  const stack = [cid];
  while (stack.length) {
    const id = stack.pop();
    const cv = curves[id];
    if (!cv) continue;
    const pe = ends(cv);
    if (!pe.length) continue;
    for (const [oid, ov] of Object.entries(curves)) {
      if (seen.has(oid) || ov.cons || !(ov.type === "line" || ov.type === "arc")) continue;
      if (ends(ov).some((p) => pe.includes(p))) { seen.add(oid); stack.push(oid); }
    }
  }
  return [...seen];
}

/** World start point + tangent of the first path selection (for the section size arrow). */
function pathStart(state, ref) {
  if (!ref) return null;
  if (ref.kind === "sketchCurve") {
    const s = state.sketches.get(ref.sketch);
    const cv = s && s.sk.curves[ref.curve];
    if (!cv) return null;
    const P = (id) => K.toWorld(s.plane, s.sk.points[id].x, s.sk.points[id].y);
    if (cv.type === "line") { const a = P(cv.p1), b = P(cv.p2); return { p: a, t: V.norm(V.sub(b, a)), n: s.plane.n }; }
    if (cv.type === "arc" || cv.type === "circle") {
      const c = P(cv.c);
      const a = cv.type === "arc" ? P(cv.p1) : V.add(c, V.mul(s.plane.x, cv.r));
      return { p: a, t: V.norm(V.cross(s.plane.n, V.sub(a, c))), n: s.plane.n };
    }
    return null;
  }
  if (ref.kind === "edge") {
    const b = state.bodies.get(ref.body);
    const ti = b && ref.index >= 0 ? K.topoOf(b.shape).edges[ref.index] : null;
    if (!ti) return null;
    return { p: ti.s, t: V.norm(ti.ts), n: null };
  }
  return null;
}

export function openPipe(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const pathFilter = (r, dlg) => {
    if (r.kind === "sketchCurve") {
      const s = dlg.baseState.sketches.get(r.sketch);
      const cv = s && s.sk.curves[r.curve];
      if (!cv || !["line", "arc", "circle"].includes(cv.type)) return false;
      const first = (dlg.values.path || [])[0];
      return !first || first.kind !== "sketchCurve" || first.sketch === r.sketch;
    }
    return true;
  };
  return app.ui.dialog.open({
    id: "PrimitivePipe",
    title: "Pipe",
    icon: "PrimitivePipe",
    featureLabel: "Pipe",
    editId,
    help: "Creates a solid pipe that follows a selected path. Select the path then specify the section and size.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "sketchCurve" || r.kind === "edge"),
    ctrlWidth: 150,
    rows: [
      {
        id: "path", type: "selection", label: "Path", kinds: ["sketchCurve", "edge"], prompt: "Select a path", filter: pathFilter,
        mapRef: (r, dlg) => (r.kind === "sketchCurve" && dlg.values.chain !== false ? sketchChain(dlg.baseState, r.sketch, r.curve).map((c) => ({ kind: "sketchCurve", sketch: r.sketch, curve: c })) : r),
      },
      { id: "chain", type: "check", label: "Chain Selection", default: true, tooltip: "Automatically selects chained sketch geometry." },
      { id: "distance", type: "value", label: "Distance", kind: "none", default: "1.00", min: 0, max: 1, positive: true, step: 0.05 },
      { id: "section", type: "dropdown", label: "Section", options: PIPE_SECTIONS, default: "circular", sep: true },
      { id: "sectionSize", type: "value", label: "Section Size", kind: "length", default: "5.00 mm", positive: true },
      { id: "hollow", type: "check", label: "Hollow" },
      { id: "thickness", type: "value", label: "Section Thickness", kind: "length", default: "1.00 mm", positive: true, visible: (v) => !!v.hollow },
      { id: "operation", type: "dropdown", label: "Operation", options: OPERATIONS, default: "new", sep: true },
    ],
    init(dlg) {
      if (!f0) { dlg.values.operation = defaultOperation(app, dlg.baseState); return; }
      const path = [];
      if (f0.path && f0.path.sketch) for (const c of f0.path.curves || []) path.push({ kind: "sketchCurve", sketch: f0.path.sketch, curve: c });
      for (const er of f0.edges || []) path.push(U.edgeRef(dlg.baseState, er.body, er.p));
      Object.assign(dlg.values, { path, section: f0.section || "circular", hollow: !!f0.hollow, operation: f0.operation || "new" });
      for (const k of ["distance", "sectionSize", "thickness"]) if (f0[k] !== undefined && f0[k] !== "") dlg.values[k] = String(f0[k]);
      dlg.touched.add("operation");
    },
    status: (dlg) => { const n = (dlg.values.path || []).length; return n ? (n === 1 ? "1 Path" : `${n} Paths`) : ""; },
    build(v) {
      const path = v.path || [];
      if (!path.length) return null;
      const curves = path.filter((r) => r.kind === "sketchCurve");
      const edges = path.filter((r) => r.kind === "edge").map((r) => ({ body: r.body, p: r.p }));
      const f = { type: "pipe", distance: v.distance, section: v.section, sectionSize: v.sectionSize, hollow: !!v.hollow, operation: v.operation };
      if (curves.length) f.path = { sketch: curves[0].sketch, curves: curves.map((r) => r.curve) };
      if (edges.length) f.edges = edges;
      if (v.hollow) f.thickness = v.thickness;
      return f;
    },
    manipulators(dlg) {
      const st = pathStart(dlg.baseState, (dlg.values.path || [])[0]);
      if (!st) return [];
      let u = st.n && Math.abs(V.dot(st.n, st.t)) < 0.99 ? st.n : V.cross(st.t, [0, 0, 1]);
      if (V.len(u) < 1e-6) u = V.cross(st.t, [1, 0, 0]);
      u = V.norm(V.sub(u, V.mul(st.t, V.dot(u, st.t))));
      return [dlg.valueManip("sectionSize", { origin: st.p, dir: u, scale: 0.5, min: 0.01 })].filter(Boolean);
    },
    commit(f, dlg) { return dlg.commitFeature(f, { hideSketches: editId || !f.path ? [] : [f.path.sketch] }); },
  });
}
