// Construction axes (caxis), points (cpoint) and the extra construction plane modes (cplane:
// tangent, perpendicular, twoEdges, threePoints, alongPath). Feature evaluation + dialogs.
//
// caxis  {mode:'cylinder'|'normal'|'twoPlanes'|'twoPoints'|'edge', face?, point?, p1?, p2?, pt1?, pt2?, edge?}
//        -> st.axes id -> {id, o, d, seg:[A, B], name}
// cpoint {mode:'vertex'|'twoEdges'|'threePlanes'|'center'|'edgePlane'|'alongPath', point?, e1?, e2?, p1?, p2?, p3?,
//         target?, edge?, plane?, path?, distType:'proportional'|'physical', distance (0..1), offset (length)}
//        -> st.points id -> {id, p, name}
// cplane (extra modes, model.js registerCPlaneMode): tangent {face, angle, ref?}, perpendicular {base, object, offset},
//        twoEdges {e1, e2}, threePoints {pt1, pt2, pt3}, alongPath {path, distType, distance, offset}
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import * as U from "../dialogs/util.js";
import { beginModelCommand } from "../dialogs/common.js";
import * as R from "./refs.js";

const V = R.V;

// ---------------------------------------------------------------------------------------------
// evaluation
// ---------------------------------------------------------------------------------------------
function axisSegment(st, o, d, around) {
  const { c, r } = R.modelBounds(st);
  const half = Math.max(r * 0.75, 15);
  const m = around || V.add(o, V.mul(d, V.dot(V.sub(c, o), d)));
  return [V.sub(m, V.mul(d, half)), V.add(m, V.mul(d, half))];
}

function evalAxis(st, f) {
  switch (f.mode) {
    case "cylinder": {
      const a = R.revolutionAxis(st, f.face);
      if (a.kind === "sphere") throw new Error("Select a cylindrical, conical or toroidal face");
      const ext = Math.max((a.v1 - a.v0) * 0.1, 2);
      return { o: a.o, d: a.d, seg: [V.add(a.o, V.mul(a.d, a.v0 - ext)), V.add(a.o, V.mul(a.d, a.v1 + ext))] };
    }
    case "normal": {
      const { b, idx, fi } = R.faceOf(st, f.face);
      let p = f.point ? R.pointOf(st, f.point) : f.face.p;
      const c = K.closestOnFace(b.shape, idx, p);
      if (c && c.p) p = c.p;
      let n = fi.n;
      if (fi.type !== "PLANE") {
        const [face] = K.facesAt(b.shape, [idx]);
        try { const v = face.normalAt(p); n = V.norm(v.toTuple()); v.delete(); } finally { K.del(face); }
      }
      const L = Math.max(R.modelBounds(st).r * 0.5, 10);
      return { o: p, d: n, seg: [V.sub(p, V.mul(n, L * 0.25)), V.add(p, V.mul(n, L))] };
    }
    case "twoPlanes": {
      const a = R.planeOf(st, f.p1), b = R.planeOf(st, f.p2);
      const l = R.planePlane(a, b);
      if (!l) throw new Error("The planes are parallel and do not intersect");
      return { o: l.o, d: l.d, seg: axisSegment(st, l.o, l.d) };
    }
    case "twoPoints": {
      const a = R.pointOf(st, f.pt1), b = R.pointOf(st, f.pt2);
      const L = V.len(V.sub(b, a));
      if (L < 1e-6) throw new Error("Select two different points");
      const d = V.mul(V.sub(b, a), 1 / L);
      const e = Math.max(L * 0.1, 2);
      return { o: a, d, seg: [V.sub(a, V.mul(d, e)), V.add(b, V.mul(d, e))] };
    }
    case "edge": {
      const l = R.lineOf(st, f.edge);
      if (l.a && l.b) {
        const L = V.len(V.sub(l.b, l.a)), e = Math.max(L * 0.1, 2);
        return { o: l.o, d: l.d, seg: [V.sub(l.a, V.mul(l.d, e)), V.add(l.b, V.mul(l.d, e))] };
      }
      return { o: l.o, d: l.d, seg: axisSegment(st, l.o, l.d) };
    }
    default: throw new Error("Unknown construction axis type");
  }
}

function evalPoint(st, f, P) {
  switch (f.mode) {
    case "vertex": return R.pointOf(st, f.point);
    case "twoEdges": {
      const r = R.lineLine(R.lineOf(st, f.e1), R.lineOf(st, f.e2));
      if (!r) throw new Error("Construction Point from two edges failed: the edges are parallel");
      if (r.gap > 1e-3) throw new Error("Construction Point from two edges failed: the edges do not intersect");
      return r.p;
    }
    case "threePlanes": {
      const p = R.threePlanes(R.planeOf(st, f.p1), R.planeOf(st, f.p2), R.planeOf(st, f.p3));
      if (!p) throw new Error("Construction Point from three planes failed: valid plane selections are required");
      return p;
    }
    case "center": return R.centerOf(st, f.target).p;
    case "edgePlane": {
      const p = R.linePlane(R.lineOf(st, f.edge), R.planeOf(st, f.plane));
      if (!p) throw new Error("The edge is parallel to the plane");
      return p;
    }
    case "alongPath": {
      const phys = f.distType === "physical";
      return R.pathPoint(st, f.path, phys ? M.fval(P, f, "offset") : M.fval(P, f, "distance"), phys).p;
    }
    default: throw new Error("Unknown construction point type");
  }
}

/** Extra cplane modes (registered with model.js registerCPlaneMode). */
export const PLANE_MODES = {
  tangent(st, f, P) {
    const { b, idx, fi } = R.faceOf(st, f.face);
    const p0 = f.face.p;
    if (fi.type === "PLANE") return { o: p0, x: R.perp(fi.n), n: fi.n };
    const a = R.revolutionAxis(st, f.face);
    const [face] = K.facesAt(b.shape, [idx]);
    let n0;
    try { const v = face.normalAt(p0); n0 = V.norm(v.toTuple()); v.delete(); } finally { K.del(face); }
    const foot = V.add(a.o, V.mul(a.d, V.dot(V.sub(p0, a.o), a.d)));
    let ang = (M.fval(P, f, "angle") * Math.PI) / 180;
    if (f.ref) {
      // reference object: turn the tangent point so its radial direction follows the reference plane normal
      const rn = R.planeOf(st, f.ref).n;
      const want = V.sub(rn, V.mul(a.d, V.dot(rn, a.d)));
      const have = V.sub(p0, foot);
      if (V.len(want) > 1e-9 && V.len(have) > 1e-9) {
        const w = V.norm(want), h = V.norm(have);
        ang += Math.atan2(V.dot(V.cross(h, w), a.d), V.dot(h, w));
      }
    }
    const p = V.add(a.o, R.rotateAbout(V.sub(p0, a.o), a.d, ang));
    const n = V.norm(R.rotateAbout(n0, a.d, ang));
    let x = V.sub(a.d, V.mul(n, V.dot(a.d, n)));
    x = V.len(x) > 1e-9 ? V.norm(x) : R.perp(n);
    return { o: p, x, n };
  },
  perpendicular(st, f, P) {
    const base = R.planeOf(st, f.base);
    const off = M.fval(P, f, "offset") || 0;
    let o, n, x;
    if (f.object && (f.object.kind === "vertex" || f.object.kind === "sketchPoint" || f.object.kind === "cpoint" || f.object.kind === "origin" && !f.object.name)) {
      o = R.pointOf(st, f.object);
      n = V.norm(base.x);
      x = base.n;
    } else if (f.object) {
      const l = R.lineOf(st, f.object);
      let c = V.cross(l.d, base.n);
      if (V.len(c) < 1e-9) c = V.cross(l.d, base.x);
      n = V.norm(c);
      o = l.o;
      x = l.d;
    } else throw new Error("Select a reference point or edge");
    return { o: V.add(o, V.mul(n, off)), x: V.norm(V.sub(x, V.mul(n, V.dot(x, n)))), n };
  },
  twoEdges(st, f) {
    const a = R.lineOf(st, f.e1), b = R.lineOf(st, f.e2);
    let n = V.cross(a.d, b.d);
    const w = V.sub(b.o, a.o);
    if (V.len(n) < 1e-9) n = V.cross(a.d, w);
    if (V.len(n) < 1e-9) throw new Error("The edges are collinear: select two different edges");
    n = V.norm(n);
    if (Math.abs(V.dot(w, n)) > 1e-4) throw new Error("The edges are not coplanar");
    return { o: a.o, x: a.d, n };
  },
  threePoints(st, f) {
    const a = R.pointOf(st, f.pt1), b = R.pointOf(st, f.pt2), c = R.pointOf(st, f.pt3);
    const n = V.cross(V.sub(b, a), V.sub(c, a));
    if (V.len(n) < 1e-9) throw new Error("Construction Plane from Three Points failed: valid Point selections are required");
    return { o: a, x: V.norm(V.sub(b, a)), n: V.norm(n) };
  },
  alongPath(st, f, P) {
    const phys = f.distType === "physical";
    const r = R.pathPoint(st, f.path, phys ? M.fval(P, f, "offset") : M.fval(P, f, "distance"), phys);
    return { o: r.p, x: R.perp(r.t), n: r.t };
  },
};

function refsDeps(f) {
  const out = { sketches: [], cplanes: [], bodies: [], features: [], geo: [] };
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (typeof o.sketch === "string") out.sketches.push(o.sketch);
    if (o.kind === "cplane" && o.id) out.cplanes.push(o.id);
    if ((o.kind === "caxis" || o.kind === "cpoint") && o.id) out.features.push(o.id);
    if (typeof o.body === "string" && Array.isArray(o.p)) out.geo.push({ kind: o.kind === "edge" ? "edge" : "face", body: o.body, p: o.p, n: o.n });
    for (const [k, v] of Object.entries(o)) if (k !== "p" && k !== "n" && k !== "sig") walk(v);
  };
  for (const k of ["face", "point", "p1", "p2", "p3", "pt1", "pt2", "pt3", "edge", "e1", "e2", "target", "plane", "path", "base", "object", "ref"]) walk(f[k]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// dialogs
// ---------------------------------------------------------------------------------------------
const topoFace = (state, r) => { const b = state.bodies.get(r.body); return b ? K.topoOf(b.shape).faces[r.index] : null; };
const topoEdge = (state, r) => { const b = state.bodies.get(r.body); return b ? K.topoOf(b.shape).edges[r.index] : null; };

/** Selection row presets by reference type. */
const SEL = {
  line: { kinds: ["edge", "sketchCurve", "originAxis", "caxis"], filter: (r, dlg) => (r.kind === "edge" ? U.isLinearEdge(dlg.baseState, r) : r.kind === "sketchCurve" ? U.sketchLineFilter(dlg.baseState)(r) : true), toRef: R.lineRefFromSel, fromRef: R.selFromLineRef },
  point: { kinds: ["vertex", "sketchPoint", "originPoint", "cpoint"], toRef: R.pointRefFromSel, fromRef: (x) => R.selFromPointRef(x) },
  plane: { kinds: ["originPlane", "cplane", "face"], planar: true, toRef: R.planeRefFromSel, fromRef: R.selFromPlaneRef },
  face: { kinds: ["face"], toRef: R.faceRefFromSel, fromRef: R.selFromFaceRef },
  cyl: { kinds: ["face"], filter: (r, dlg) => { const t = topoFace(dlg.baseState, r); return !!t && ["CYLINDRE", "CONE", "TORUS"].includes(t.type); }, toRef: R.faceRefFromSel, fromRef: R.selFromFaceRef },
  tanface: { kinds: ["face"], filter: (r, dlg) => { const t = topoFace(dlg.baseState, r); return !!t && ["PLANE", "CYLINDRE", "CONE", "SPHERE", "TORUS"].includes(t.type); }, toRef: R.faceRefFromSel, fromRef: R.selFromFaceRef },
  center: {
    kinds: ["edge", "face", "sketchCurve"],
    filter: (r, dlg) => {
      if (r.kind === "edge") { const t = topoEdge(dlg.baseState, r); return !!t && t.type === "CIRCLE"; }
      if (r.kind === "face") { const t = topoFace(dlg.baseState, r); return !!t && ["SPHERE", "TORUS"].includes(t.type); }
      const s = dlg.baseState.sketches.get(r.sketch); const cv = s && s.sk.curves[r.curve];
      return !!cv && ["circle", "arc", "ellipse", "earc"].includes(cv.type);
    },
    toRef: (r) => (r.kind === "face" ? { kind: "face", body: r.body, p: r.p, n: r.n } : R.pathRefFromSel(r)),
    fromRef: (x, st) => (x && x.kind === "face" ? R.selFromFaceRef(x, st) : R.selFromPathRef(x, st)),
  },
  path: { kinds: ["edge", "sketchCurve"], filter: (r, dlg) => { if (r.kind !== "sketchCurve") return true; const s = dlg.baseState.sketches.get(r.sketch); const cv = s && s.sk.curves[r.curve]; return !!cv && cv.type !== "point"; }, toRef: R.pathRefFromSel, fromRef: R.selFromPathRef },
  planeOrPoint: {
    kinds: ["edge", "sketchCurve", "originAxis", "caxis", "vertex", "sketchPoint", "cpoint"],
    filter: (r, dlg) => (r.kind === "edge" ? U.isLinearEdge(dlg.baseState, r) : r.kind === "sketchCurve" ? U.sketchLineFilter(dlg.baseState)(r) : true),
    toRef: (r) => R.pointRefFromSel(r) || R.lineRefFromSel(r),
    fromRef: (x, st) => R.selFromPointRef(x) || R.selFromLineRef(x, st),
  },
};

const DIST_TYPES = [{ value: "proportional", label: "Proportional", icon: "distance" }, { value: "physical", label: "Physical", icon: "distance" }];

/**
 * Construction command table: id -> {title, help, type, mode, sels:[{id, label, sel, prompt, optional}], values?}.
 * Labels and prompts are Fusion's (NaFusionUI string table).
 */
export const CONSTRUCT = {
  // ---- planes ----
  ConstructionTangentPlaneCommand: { title: "Tangent Plane", type: "cplane", mode: "tangent", help: "Creates a Construction Plane that is tangent to a face. Optionally, select a reference point or plane to align to.", sels: [{ id: "face", label: "Face", sel: "tanface", prompt: "Select a face." }], angle: true, ref: true },
  ConstructionPlanePerpendicularToPlaneCommand: { title: "Perpendicular Plane", type: "cplane", mode: "perpendicular", help: "Creates a Construction Plane perpendicular to a face or plane, passing through a point.", sels: [{ id: "base", label: "Face", sel: "plane", prompt: "Select a face or plane" }, { id: "object", label: "Object", sel: "planeOrPoint", prompt: "Select a reference point or face" }], offset: true },
  ConstructionPlaneFromTwoEdgesCommand: { title: "Plane Through Two Edges", type: "cplane", mode: "twoEdges", help: "Creates a Construction Plane that passes through two edges or axes.", sels: [{ id: "e1", label: "Edge 1", sel: "line", prompt: "Select the first edge or axis." }, { id: "e2", label: "Edge 2", sel: "line", prompt: "Select the second edge or axis." }] },
  ConstructionPlaneFromThreePointsCommand: { title: "Plane Through Three Points", type: "cplane", mode: "threePoints", help: "Creates a Construction Plane that passes through three points or vertices.", sels: [{ id: "pt1", label: "Point 1", sel: "point", prompt: "Select the first vertex, point, sketch point or snap" }, { id: "pt2", label: "Point 2", sel: "point", prompt: "Select the second vertex, point, sketch point or snap" }, { id: "pt3", label: "Point 3", sel: "point", prompt: "Select the third vertex, point, sketch point or snap" }] },
  ConstructionPlaneAlongPathCommand: { title: "Plane Along Path", type: "cplane", mode: "alongPath", help: "Creates a Construction Plane normal to an edge or sketch line.", sels: [{ id: "path", label: "Path", sel: "path", prompt: "Select edges or sketch curves" }], along: true },
  // ---- axes ----
  ConstructionAxisThroughCylinderCommand: { title: "Axis Through Cylinder/Cone/Torus", type: "caxis", mode: "cylinder", help: "Creates a Construction Axis through the center of a cylinder, cone, or torus.", sels: [{ id: "face", label: "Face", sel: "cyl", prompt: "Select a cylindrical, conical or toroidal Face" }] },
  ConstructionAxisNormalToFaceCommand: { title: "Axis Perpendicular at Point", type: "caxis", mode: "normal", help: "Creates a Construction Axis that is perpendicular to a face and passes through a specific point.", sels: [{ id: "face", label: "Face", sel: "face", prompt: "Select a location on a face" }, { id: "point", label: "Point", sel: "point", prompt: "Select a vertex, point, sketch point or snap", optional: true }] },
  ConstructionAxisFromTwoPlanesCommand: { title: "Axis Through Two Planes", type: "caxis", mode: "twoPlanes", help: "Creates a Construction Axis coincident with the intersection of two faces or planes.", sels: [{ id: "p1", label: "Plane 1", sel: "plane", prompt: "Select the first face, plane or profile." }, { id: "p2", label: "Plane 2", sel: "plane", prompt: "Select the second face, plane or profile." }] },
  ConstructionAxisThroughTwoPointsCommand: { title: "Axis Through Two Points", type: "caxis", mode: "twoPoints", help: "Creates a Construction Axis that passes through two points or vertices.", sels: [{ id: "pt1", label: "Point 1", sel: "point", prompt: "Select the first vertex, point, sketch point or snap" }, { id: "pt2", label: "Point 2", sel: "point", prompt: "Select the second vertex, point, sketch point or snap" }] },
  ConstructionAxisThroughEdgeCommand: { title: "Axis Through Edge", type: "caxis", mode: "edge", help: "Creates a Construction Axis along a linear edge or sketch curve.", sels: [{ id: "edge", label: "Edge", sel: "line", prompt: "Select an edge, axis or sketch line" }] },
  // ---- points ----
  ConstructionPointFromPointCommand: { title: "Point At Vertex", type: "cpoint", mode: "vertex", help: "Creates a Construction Point at an existing point or vertex.", sels: [{ id: "point", label: "Point", sel: "point", prompt: "Select a vertex, point, sketch point or snap" }] },
  ConstructionPointThroughTwoEdgesCommand: { title: "Point Through Two Edges", type: "cpoint", mode: "twoEdges", help: "Creates a Construction Point at the intersection or extended intersection of two edges.", sels: [{ id: "e1", label: "Edge 1", sel: "line", prompt: "Select first edge, axes or sketch objects" }, { id: "e2", label: "Edge 2", sel: "line", prompt: "Select second edge, axes or sketch objects" }] },
  ConstructionPointFromThreePlanesCommand: { title: "Point Through Three Planes", type: "cpoint", mode: "threePlanes", help: "Creates a Construction Point at the intersection or extended intersection of three non-parallel planes or faces.", sels: [{ id: "p1", label: "Plane 1", sel: "plane", prompt: "Select the first face, plane or profile" }, { id: "p2", label: "Plane 2", sel: "plane", prompt: "Select the second face, plane or profile" }, { id: "p3", label: "Plane 3", sel: "plane", prompt: "Select the third face, plane or profile" }] },
  ConstructionPointFromCircleOrSphereCommand: { title: "Point At Center Of Circle/Sphere/Torus", type: "cpoint", mode: "center", help: "Creates a Construction Point at the center of a circle, sphere, or torus.", sels: [{ id: "target", label: "Face/Edge", sel: "center", prompt: "Select a circular edge or spherical face" }] },
  ConstructionPointAtEdgeAndPlaneCommand: { title: "Point At Edge And Plane", type: "cpoint", mode: "edgePlane", help: "Creates a Construction Point at the intersection of a linear edge, sketch line, or axis with a face or plane.", sels: [{ id: "edge", label: "Edge", sel: "line", prompt: "Select an edge, axis or sketch line" }, { id: "plane", label: "Plane", sel: "plane", prompt: "Select a plane, planar face or sketch profiles" }] },
  ConstructionPointAlongPathCommand: { title: "Point Along Path", type: "cpoint", mode: "alongPath", help: "Creates a Construction Point at a specific distance along a path", sels: [{ id: "path", label: "Path", sel: "path", prompt: "Select edges or sketch curves" }], along: true },
};
export const MODE_COMMAND = {};
for (const [id, c] of Object.entries(CONSTRUCT)) MODE_COMMAND[`${c.type}:${c.mode}`] = id;

function nextPlaneName(doc) {
  let n = 0;
  for (const f of doc.features) { const m = /^Plane(\d+)$/.exec(f.name || ""); if (m) n = Math.max(n, +m[1]); }
  return `Plane${n + 1}`;
}

/** Open the dialog of a construction command (new or Edit Feature). */
export function openConstruct(app, cmdId, opts = {}) {
  const C = CONSTRUCT[cmdId];
  if (!C) return null;
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const pre = (opts.preselect || []).slice();
  const rows = [];
  for (const s of C.sels) {
    const P = SEL[s.sel];
    rows.push({ id: s.id, type: "selection", label: s.label, kinds: P.kinds, planar: P.planar, filter: P.filter, max: 1, min: s.optional ? 0 : 1, toggle: false, prompt: s.prompt });
  }
  if (C.angle) rows.push({ id: "angle", type: "value", label: "Angle", kind: "angle", default: "0.0 deg" });
  if (C.ref) rows.push({ id: "ref", type: "selection", label: "Reference Object", kinds: SEL.plane.kinds, planar: true, max: 1, min: 0, toggle: false, advance: false, prompt: "Select a reference object." });
  if (C.offset) rows.push({ id: "offset", type: "value", label: "Distance", kind: "length", default: "0.00 mm" });
  if (C.along) {
    rows.push({ id: "distType", type: "dropdown", label: "Distance Type", options: DIST_TYPES, default: "proportional" });
    rows.push({ id: "distance", type: "value", label: "Distance", kind: "none", default: "0.00", min: 0, max: 1, visible: (v) => v.distType !== "physical" });
    rows.push({ id: "offset", type: "value", label: "Distance", kind: "length", default: "0.00 mm", nonNegative: true, visible: (v) => v.distType === "physical" });
  }
  // keep only preselected refs some row accepts
  return app.ui.dialog.open({
    id: cmdId,
    title: C.title,
    icon: cmdId,
    editId,
    featureLabel: C.title,
    help: C.help,
    preselect: pre,
    rows,
    init(dlg) {
      if (!f0) return;
      for (const s of C.sels) {
        const r = SEL[s.sel].fromRef(f0[s.id], dlg.baseState);
        dlg.values[s.id] = r ? [r] : [];
      }
      if (C.angle && f0.angle) dlg.values.angle = f0.angle;
      if (C.ref) { const r = f0.ref ? R.selFromPlaneRef(f0.ref, dlg.baseState) : null; dlg.values.ref = r ? [r] : []; }
      if (C.offset || C.along) dlg.values.offset = f0.offset || "0.00 mm";
      if (C.along) { dlg.values.distType = f0.distType || "proportional"; dlg.values.distance = f0.distance || "0.00"; }
    },
    build(v) {
      const f = { type: C.type, mode: C.mode };
      for (const s of C.sels) {
        const sel = (v[s.id] || [])[0];
        const ref = sel ? SEL[s.sel].toRef(sel) : null;
        if (!ref && !s.optional) return null;
        if (ref) f[s.id] = ref;
      }
      if (C.angle) f.angle = v.angle;
      if (C.ref) { const r = (v.ref || [])[0]; if (r) f.ref = R.planeRefFromSel(r); }
      if (C.offset) f.offset = v.offset;
      if (C.along) { f.distType = v.distType; f.distance = v.distance; f.offset = v.offset; }
      return f;
    },
    manipulators(dlg) { return constructManips(dlg, C); },
    commit(f, dlg) {
      if (!dlg.editId && C.type === "cplane") f = { ...f, name: nextPlaneName(app.doc) };
      return dlg.commitFeature(f);
    },
  });
}

function constructManips(dlg, C) {
  const app = dlg.app;
  const st = app.result && app.result.state;
  const fid = dlg.previewFeature && dlg.previewFeature.id;
  if (!st || !fid || (dlg.previewRes && dlg.previewRes.ok === false)) return [];
  const out = [];
  try {
    if (C.offset && C.mode === "perpendicular") {
      const ps = st.planes.get(fid);
      const off = dlg.num("offset");
      if (ps && Number.isFinite(off)) out.push(dlg.valueManip("offset", { origin: V.sub(ps.plane.o, V.mul(ps.plane.n, off)), dir: ps.plane.n }));
    }
    if (C.angle) {
      const sel = (dlg.values.face || [])[0];
      const t = sel && topoFace(dlg.baseState, sel);
      if (t && t.type !== "PLANE" && t.a && t.ao) {
        const ps = st.planes.get(fid);
        if (ps) out.push(dlg.angleManip("angle", { center: V.add(t.ao, V.mul(t.a, V.dot(V.sub(ps.plane.o, t.ao), t.a))), axis: t.a, ref: V.norm(V.sub(sel.p, V.add(t.ao, V.mul(t.a, V.dot(V.sub(sel.p, t.ao), t.a))))), radius: (t.r || 10) * 1.3 }));
      }
    }
    if (C.along && dlg.values.distType === "physical") {
      const path = R.pathRefFromSel((dlg.values.path || [])[0]);
      if (path) {
        const r0 = R.pathPoint(dlg.baseState, JSON.parse(JSON.stringify(path)), 0, true);
        out.push(dlg.valueManip("offset", { origin: r0.p, dir: r0.t, min: 0, max: r0.total }));
      }
    }
  } catch { /* manipulators are optional */ }
  return out.filter(Boolean);
}

// ---------------------------------------------------------------------------------------------
// registration
// ---------------------------------------------------------------------------------------------
export function registerConstruct(app) {
  const defs = {
    caxis: {
      label: "Axis", stem: "Axis", fields: {}, icon: "ConstructionAxisThroughEdgeCommand",
      apply(st, f) {
        if (!(st.axes instanceof Map)) st.axes = new Map();
        const a = evalAxis(st, f);
        st.axes.set(f.id, { id: f.id, o: a.o, d: V.norm(a.d), seg: a.seg, name: f.name });
        return {};
      },
      deps: refsDeps,
      editor: (a, id) => { const f = a.feature(id); beginModelCommand(a); return openConstruct(a, MODE_COMMAND[`caxis:${f && f.mode}`], { editId: id }); },
      browser: { folder: "construction" },
    },
    cpoint: {
      label: "Point", stem: "Point", fields: { distance: "none", offset: "length" }, icon: "ConstructionPointFromPointCommand",
      apply(st, f, P) {
        if (!(st.points instanceof Map)) st.points = new Map();
        const p = evalPoint(st, f, P);
        st.points.set(f.id, { id: f.id, p, name: f.name });
        return {};
      },
      deps: refsDeps,
      editor: (a, id) => { const f = a.feature(id); beginModelCommand(a); return openConstruct(a, MODE_COMMAND[`cpoint:${f && f.mode}`], { editId: id }); },
      browser: { folder: "construction" },
    },
  };
  for (const [type, def] of Object.entries(defs)) {
    try { M.registerFeature(type, def); } catch (e) { console.error("[solidx]", e); }
  }
  for (const [mode, fn] of Object.entries(PLANE_MODES)) {
    try { M.registerCPlaneMode(mode, fn); } catch (e) { console.error("[solidx]", e); }
  }
  // Edit Feature of the new plane modes (cplane is a built-in type edited by the dialogs module)
  const prev = app.featureEditors.cplane;
  app.featureEditors.cplane = (a, id) => {
    const f = a.feature(id);
    const cmd = f && MODE_COMMAND[`cplane:${f.mode}`];
    if (cmd) { beginModelCommand(a); return openConstruct(a, cmd, { editId: id }); }
    return prev ? prev(a, id) : undefined;
  };
  for (const [id, C] of Object.entries(CONSTRUCT)) {
    app.commands.register({
      id, label: C.title, tooltip: C.help, kind: "feature",
      run: (a, ctx = {}) => { const pre = beginModelCommand(a); return openConstruct(a, id, { preselect: ctx.preselect || pre }); },
    });
  }
}
