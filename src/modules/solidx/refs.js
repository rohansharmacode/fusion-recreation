// Reference resolution shared by the solidx features (construction axes / points / planes, face tools).
// Stored refs (document JSON):
//   line   {kind:'edge', body, p} | {kind:'sketchLine', sketch, curve} | {kind:'origin', name} | {kind:'caxis', id}
//   point  {kind:'vertex', body, p} | {kind:'sketchPoint', sketch, point} | {kind:'origin'} | {kind:'cpoint', id}
//   plane  planeRef of model.js ({kind:'origin'|'cplane'|'face'|'plane', ...})
//   face   {body, p, n} (model.js face refs, re-found by signature)
//   path   {kind:'edge', body, p} | {kind:'sketchCurve', sketch, curve}
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import * as U from "../dialogs/util.js";
import { curvePolyline } from "../../sketch/sketch.js";

export const V = K.V;
const EPS = 1e-9;

// ---------- selection ref <-> stored ref ----------
export function lineRefFromSel(r) {
  if (!r) return null;
  if (r.kind === "edge") return { kind: "edge", body: r.body, p: r.p };
  return U.axisFromRef(r);
}
export function selFromLineRef(x, state) {
  if (!x) return null;
  if (x.kind === "edge") return U.edgeRef(state, x.body, x.p);
  return U.refFromAxis(x, state);
}
export function pointRefFromSel(r) {
  if (!r) return null;
  if (r.kind === "vertex") return { kind: "vertex", body: r.body, p: r.p };
  if (r.kind === "sketchPoint") return { kind: "sketchPoint", sketch: r.sketch, point: r.point };
  if (r.kind === "originPoint") return { kind: "origin" };
  if (r.kind === "cpoint") return { kind: "cpoint", id: r.id };
  return null;
}
export function selFromPointRef(x) {
  if (!x) return null;
  if (x.kind === "vertex") return { kind: "vertex", body: x.body, p: x.p };
  if (x.kind === "sketchPoint") return { kind: "sketchPoint", sketch: x.sketch, point: x.point };
  if (x.kind === "origin") return { kind: "originPoint" };
  if (x.kind === "cpoint") return { kind: "cpoint", id: x.id };
  return null;
}
export const planeRefFromSel = (r) => U.planeRefFromRef(r);
export const selFromPlaneRef = (x, state) => U.refFromPlaneRef(x, state);
export function faceRefFromSel(r) { return r && r.kind === "face" ? { body: r.body, p: r.p, n: r.n } : null; }
export function selFromFaceRef(x, state) { return x ? U.faceRef(state, x.body, x.p, x.n) : null; }
export function pathRefFromSel(r) {
  if (!r) return null;
  if (r.kind === "edge") return { kind: "edge", body: r.body, p: r.p };
  if (r.kind === "sketchCurve") return { kind: "sketchCurve", sketch: r.sketch, curve: r.curve };
  return null;
}
export function selFromPathRef(x, state) {
  if (!x) return null;
  if (x.kind === "edge") return U.edgeRef(state, x.body, x.p);
  if (x.kind === "sketchCurve") return { kind: "sketchCurve", sketch: x.sketch, curve: x.curve };
  return null;
}

// ---------- evaluation-time resolution (st = model state) ----------
function edgeInfo(st, ref) {
  const b = st.bodies.get(ref.body);
  if (!b) throw new Error("The referenced body is missing");
  const idx = M.locateEdge(b.shape, ref);
  const ti = idx >= 0 ? K.topoOf(b.shape).edges[idx] : null;
  if (!ti) throw new Error("The referenced edge could not be found");
  return { b, idx, ti };
}

/** Infinite line {o, d} of a line ref (linear edge, sketch line, origin / construction axis). */
export function lineOf(st, ref) {
  if (!ref) throw new Error("Select an edge, axis or sketch line");
  if (ref.kind === "edge") {
    const { ti } = edgeInfo(st, ref);
    if (ti.type !== "LINE") throw new Error("Select a linear edge");
    return { o: ti.s, d: V.norm(V.sub(ti.t, ti.s)), a: ti.s, b: ti.t };
  }
  const ax = M.axisFromRef(st, ref);
  return { o: ax.o, d: V.norm(ax.d) };
}

/** World point of a point ref. Vertex refs follow the body (nearest vertex) and are moved onto it. */
export function pointOf(st, ref) {
  if (!ref) throw new Error("Select a point");
  if (ref.kind === "origin") return [0, 0, 0];
  if (ref.kind === "cpoint") {
    const c = st.points && st.points.get(ref.id);
    if (!c) throw new Error("The referenced construction point is missing");
    return c.p;
  }
  if (ref.kind === "sketchPoint") {
    const s = st.sketches.get(ref.sketch);
    const q = s && s.sk.points[ref.point];
    if (!q) throw new Error("The referenced sketch point is missing");
    return K.toWorld(s.plane, q.x, q.y);
  }
  if (ref.kind === "vertex") {
    const b = st.bodies.get(ref.body);
    if (!b) throw new Error("The referenced body is missing");
    const T = K.topoOf(b.shape);
    let best = null, bd = Infinity;
    for (const e of T.edges) for (const q of [e.s, e.t]) { const d = V.len(V.sub(q, ref.p)); if (d < bd) { bd = d; best = q; } }
    if (!best) throw new Error("The referenced vertex could not be found");
    if (bd > 1e-7) ref.p = K.roundVec(best);
    return best;
  }
  throw new Error("Unsupported point");
}

export function planeOf(st, ref) {
  const pl = M.resolvePlane(ref, st);
  if (!pl) throw new Error("Select a plane or planar face");
  return { o: pl.o, x: pl.x, n: V.norm(pl.n) };
}

/** Topology info of a face ref ({body, p, n}): {b, idx, fi}. */
export function faceOf(st, ref, anyOrientation = false) {
  if (!ref) throw new Error("Select a face");
  const b = st.bodies.get(ref.body);
  if (!b) throw new Error("The referenced body is missing");
  const idx = M.locateFace(b.shape, ref, anyOrientation);
  const fi = idx >= 0 ? K.topoOf(b.shape).faces[idx] : null;
  if (!fi) throw new Error("The referenced face could not be found");
  return { b, idx, fi };
}

/** Axis of revolution of a cylinder / cone / torus / sphere face: {o, d, r?, v0, v1}. */
export function revolutionAxis(st, ref) {
  const { b, idx, fi } = faceOf(st, ref);
  const O = K.R.getOC();
  const [face] = K.facesAt(b.shape, [idx]);
  let ad = null;
  try {
    ad = new O.BRepAdaptor_Surface(face.wrapped, false);
    const g = O.GeomAbs_SurfaceType;
    const t = ad.GetType();
    const ax3 = (prim) => {
      const ax = prim.Axis();
      const loc = ax.Location(), dir = ax.Direction();
      const out = { o: [loc.X(), loc.Y(), loc.Z()], d: V.norm([dir.X(), dir.Y(), dir.Z()]) };
      K.del(loc, dir, ax, prim);
      return out;
    };
    let a = null;
    if (t === g.GeomAbs_Cylinder) a = { ...ax3(ad.Cylinder()), kind: "cylinder" };
    else if (t === g.GeomAbs_Cone) a = { ...ax3(ad.Cone()), kind: "cone" };
    else if (t === g.GeomAbs_Torus) a = { ...ax3(ad.Torus()), kind: "torus" };
    else if (t === g.GeomAbs_Sphere) {
      const s = ad.Sphere();
      const loc = s.Location();
      a = { o: [loc.X(), loc.Y(), loc.Z()], d: [0, 0, 1], kind: "sphere", r: s.Radius() };
      K.del(loc, s);
    }
    if (!a) throw new Error("Select a cylindrical, conical or toroidal face");
    // axial extent of the face (for display): project the face's edge end points onto the axis
    const T = K.topoOf(b.shape);
    let lo = Infinity, hi = -Infinity;
    for (const e of T.edges) {
      if (!e.faces || !e.faces.includes(idx)) continue;
      for (const q of [e.s, e.t, e.m]) { const s = V.dot(V.sub(q, a.o), a.d); lo = Math.min(lo, s); hi = Math.max(hi, s); }
    }
    if (!Number.isFinite(lo)) { lo = -10; hi = 10; }
    void fi;
    return { ...a, v0: lo, v1: hi };
  } finally { K.del(ad, face); }
}

/** Centre of a circular edge / sketch circle or arc / sphere or torus face. */
export function centerOf(st, ref) {
  if (!ref) throw new Error("Select a circular edge or spherical face");
  if (ref.kind === "edge") {
    const { ti } = edgeInfo(st, ref);
    if (ti.type === "CIRCLE" && ti.c) return { p: ti.c, n: ti.a };
    if (ti.type === "ELLIPSE") {
      // ellipse centre: midpoint of the edge's opposite points is not general; use the bbox centre of samples
      return { p: V.mul(V.add(ti.s, ti.m), 0.5), n: null };
    }
    throw new Error("Select a circular edge or spherical face");
  }
  if (ref.kind === "sketchCurve") {
    const s = st.sketches.get(ref.sketch);
    const cv = s && s.sk.curves[ref.curve];
    if (!cv || !(cv.type === "circle" || cv.type === "arc" || cv.type === "ellipse" || cv.type === "earc")) throw new Error("Select a circle or arc");
    const c = s.sk.points[cv.c];
    return { p: K.toWorld(s.plane, c.x, c.y), n: s.plane.n };
  }
  if (ref.kind === "face") {
    const a = revolutionAxis(st, ref);
    if (a.kind !== "sphere" && a.kind !== "torus") throw new Error("Select a circular edge or spherical face");
    return { p: a.o, n: a.d };
  }
  throw new Error("Select a circular edge or spherical face");
}

// ---------- intersections ----------
/** Line of intersection of two planes (null when parallel). */
export function planePlane(a, b) {
  const d = V.cross(a.n, b.n);
  const L = V.len(d);
  if (L < 1e-9) return null;
  const dn = V.mul(d, 1 / L);
  // point: solve n1.x = d1, n2.x = d2 with x in span(n1, n2)
  const d1 = V.dot(a.n, a.o), d2 = V.dot(b.n, b.o);
  const n11 = V.dot(a.n, a.n), n22 = V.dot(b.n, b.n), n12 = V.dot(a.n, b.n);
  const det = n11 * n22 - n12 * n12;
  const c1 = (d1 * n22 - d2 * n12) / det, c2 = (d2 * n11 - d1 * n12) / det;
  return { o: V.add(V.mul(a.n, c1), V.mul(b.n, c2)), d: dn };
}
/** Point where three planes meet (null when two are parallel). */
export function threePlanes(a, b, c) {
  const n1 = a.n, n2 = b.n, n3 = c.n;
  const det = V.dot(n1, V.cross(n2, n3));
  if (Math.abs(det) < 1e-9) return null;
  const d1 = V.dot(n1, a.o), d2 = V.dot(n2, b.o), d3 = V.dot(n3, c.o);
  const p = V.add(V.add(V.mul(V.cross(n2, n3), d1), V.mul(V.cross(n3, n1), d2)), V.mul(V.cross(n1, n2), d3));
  return V.mul(p, 1 / det);
}
/** Closest points of two lines; {p, gap} (p = midpoint) or null when parallel. */
export function lineLine(l1, l2) {
  const w = V.sub(l1.o, l2.o);
  const a = V.dot(l1.d, l1.d), b = V.dot(l1.d, l2.d), c = V.dot(l2.d, l2.d), d = V.dot(l1.d, w), e = V.dot(l2.d, w);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-12) return null;
  const s = (b * e - c * d) / den, t = (a * e - b * d) / den;
  const p1 = V.add(l1.o, V.mul(l1.d, s)), p2 = V.add(l2.o, V.mul(l2.d, t));
  return { p: V.mul(V.add(p1, p2), 0.5), gap: V.len(V.sub(p1, p2)) };
}
/** Point where a line crosses a plane (null when parallel). */
export function linePlane(l, pl) {
  const den = V.dot(l.d, pl.n);
  if (Math.abs(den) < 1e-12) return null;
  const t = V.dot(V.sub(pl.o, l.o), pl.n) / den;
  return V.add(l.o, V.mul(l.d, t));
}
/** A unit vector perpendicular to n. */
export function perp(n) {
  let x = V.cross(n, [0, 0, 1]);
  if (V.len(x) < 1e-6) x = V.cross(n, [1, 0, 0]);
  return V.norm(x);
}
export function rotateAbout(v, axis, ang) {
  const k = V.norm(axis), c = Math.cos(ang), s = Math.sin(ang);
  return V.add(V.add(V.mul(v, c), V.mul(V.cross(k, v), s)), V.mul(k, V.dot(k, v) * (1 - c)));
}

// ---------- paths ----------
/**
 * Point and unit tangent at a distance along a path ref. dist is a fraction 0..1 (proportional) or a
 * length (physical). Body edges of any curve type, sketch lines / arcs / circles / splines (sampled).
 */
export function pathPoint(st, ref, dist, physical = false) {
  if (!ref) throw new Error("Select edges or sketch curves");
  let segs = null, owned = [];
  if (ref.kind === "edge") {
    const r = M.pipePath(st, { edges: [ref] });
    segs = r.segs; owned = r.owned;
  } else if (ref.kind === "sketchCurve") {
    const s = st.sketches.get(ref.sketch);
    const cv = s && s.sk.curves[ref.curve];
    if (!cv) throw new Error("Missing paths");
    if (cv.type === "line" || cv.type === "arc" || cv.type === "circle") segs = M.pipePath(st, { path: { sketch: ref.sketch, curves: [ref.curve] } }).segs;
    else segs = polySegs(sampleSketchCurve(s, cv));
  } else throw new Error("Missing paths");
  try {
    const lens = segs.map(segLength);
    const total = lens.reduce((a, b) => a + b, 0);
    if (!(total > EPS)) throw new Error("Missing paths");
    let want = physical ? dist : dist * total;
    want = Math.max(0, Math.min(total, want));
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i], L = lens[i];
      if (want > L + 1e-9 && i < segs.length - 1) { want -= L; continue; }
      const k = L > EPS ? Math.max(0, Math.min(1, want / L)) : 0;
      return { ...segAt(g, k), total };
    }
    return { ...segAt(segs[segs.length - 1], 1), total };
  } finally { K.del(owned); }
}
function segLength(g) { return g.kind === "line" ? V.len(V.sub(g.b, g.a)) : g.kind === "arc" ? g.r * Math.abs(g.ang) : g.len || 0; }
function segAt(g, k) {
  if (g.kind === "line") return { p: V.add(g.a, V.mul(V.sub(g.b, g.a), k)), t: V.norm(V.sub(g.b, g.a)) };
  if (g.kind === "arc") {
    const p = K.arcPoint(g, g.ang * k);
    return { p, t: V.norm(V.cross(g.ax, V.sub(p, g.c))) };
  }
  // general body edge (replicad Edge, normalised parameter 0..1)
  const u = g.rev ? 1 - k : k;
  const tup = (v) => { const r = v.toTuple(); v.delete(); return r; };
  const p = tup(g.edge.pointAt(u));
  let t = V.norm(tup(g.edge.tangentAt(u)));
  if (g.rev) t = V.mul(t, -1);
  return { p, t };
}
function sampleSketchCurve(s, cv) {
  const S = s.sk;
  const out = [];
  try {
    // splines / control point splines / conics: sampled on the real curve (not the fit or control points)
    const id = Object.keys(S.curves).find((k) => S.curves[k] === cv);
    const pts = (cv.pts || []).map((pid) => S.points[pid]).filter(Boolean);
    if ((cv.type === "spline" || cv.type === "cvspline" || cv.type === "conic") && id) {
      for (const q of curvePolyline(S, id, 96)) out.push(K.toWorld(s.plane, q[0], q[1]));
    }
    if (!out.length && cv.type === "spline" && pts.length >= 2) for (const q of pts) out.push(K.toWorld(s.plane, q.x, q.y));
    else if ((cv.type === "ellipse" || cv.type === "earc") && S.points[cv.c] && S.points[cv.a] && S.points[cv.b]) {
      const c = S.points[cv.c], a = S.points[cv.a], b = S.points[cv.b];
      const ax = [a.x - c.x, a.y - c.y], bx = [b.x - c.x, b.y - c.y];
      for (let i = 0; i <= 64; i++) { const t = (i / 64) * 2 * Math.PI; out.push(K.toWorld(s.plane, c.x + ax[0] * Math.cos(t) + bx[0] * Math.sin(t), c.y + ax[1] * Math.cos(t) + bx[1] * Math.sin(t))); }
    }
  } catch { /* fall through */ }
  if (out.length < 2) throw new Error("Select edges or sketch curves");
  return out;
}
function polySegs(pts) {
  const segs = [];
  for (let i = 0; i + 1 < pts.length; i++) if (V.len(V.sub(pts[i + 1], pts[i])) > EPS) segs.push({ kind: "line", a: pts[i], b: pts[i + 1] });
  return segs;
}

/** Model bounding box of the state's B-rep bodies: {c, r} (centre, half diagonal). */
export function modelBounds(st) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const b of st.bodies.values()) {
    let bb = null;
    try { bb = K.bboxOf(b.shape); } catch { bb = null; }
    if (!bb) continue;
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); }
  }
  if (!Number.isFinite(mn[0])) return { c: [0, 0, 0], r: 0 };
  return { c: V.mul(V.add(mn, mx), 0.5), r: V.len(V.sub(mx, mn)) / 2 };
}
