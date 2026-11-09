// OpenCascade helpers for the SURFACE tools: edges from sketch curves, wire chaining, prisms and
// revolutions of wires, sewing, filling, offsets, thickening, splitting, cells (Boundary Fill),
// untrim, extension faces and silhouettes. Everything takes and returns replicad shapes; inputs are
// never modified or deleted (callers own what they pass in and what they get back).
// DOM-free so the evaluator (and Node tests) can use it.
import * as K from "../../kernel.js";
import { curveGeom } from "../../sketch/regions.js";
import { splinePieces, pcurvePolyline } from "../../sketch/curves.js";

const R = K.R;
const V = K.V;
const OC = () => R.getOC();
const del = K.del;

export const TOL = 1e-3; // mm: sewing / connectivity tolerance

const pnt = (p) => new (OC().gp_Pnt)(p[0], p[1], p[2]);
const vec = (v) => new (OC().gp_Vec)(v[0], v[1], v[2]);
const dir = (v) => { const n = V.norm(v); return new (OC().gp_Dir)(n[0], n[1], n[2]); };
const xyz = (p) => { const r = [p.X(), p.Y(), p.Z()]; p.delete(); return r; };
function ax1(o, d) { const p = pnt(o), dd = dir(d); try { return new (OC().gp_Ax1)(p, dd); } finally { del(p, dd); } }
function ax2(o, n, x) {
  const p = pnt(o), nn = dir(n);
  try {
    if (!x) return new (OC().gp_Ax2)(p, nn);
    const xx = dir(x);
    try { return new (OC().gp_Ax2)(p, nn, xx); } finally { del(xx); }
  } finally { del(p, nn); }
}

/** replicad wrapper of a raw TopoDS_Shape (the raw handle is released; one-solid compounds unwrapped). */
export function cast(raw) {
  let s;
  try { s = R.cast(raw); } finally { del(raw); }
  return K.singleSolid(s);
}

const KIND = {
  vertex: ["TopAbs_VERTEX", (O, x) => new R.Vertex(O.TopoDS.Vertex(x))],
  edge: ["TopAbs_EDGE", (O, x) => new R.Edge(O.TopoDS.Edge(x))],
  wire: ["TopAbs_WIRE", (O, x) => new R.Wire(O.TopoDS.Wire(x))],
  face: ["TopAbs_FACE", (O, x) => new R.Face(O.TopoDS.Face(x))],
  shell: ["TopAbs_SHELL", (O, x) => new R.Shell(O.TopoDS.Shell(x))],
  solid: ["TopAbs_SOLID", (O, x) => new R.Solid(O.TopoDS.Solid(x))],
};
/** Unique sub-shapes of a kind ('vertex' | 'edge' | 'wire' | 'face' | 'shell' | 'solid'). */
export function explore(shape, kind) {
  const O = OC();
  const SE = O.TopAbs_ShapeEnum;
  const [en, mk] = KIND[kind];
  const ex = new O.TopExp_Explorer(shape.wrapped, SE[en], SE.TopAbs_SHAPE);
  const out = [];
  const seen = new Map();
  try {
    while (ex.More()) {
      const it = ex.Current();
      const h = O.ReplicadShapeHasher.HashCode(it, R.HASH_CODE_MAX);
      const l = seen.get(h);
      if (l && l.some((x) => x.wrapped.IsSame(it))) it.delete();
      else {
        const w = mk(O, it);
        it.delete();
        out.push(w);
        if (l) l.push(w); else seen.set(h, [w]);
      }
      ex.Next();
    }
  } finally { ex.delete(); }
  return out;
}
export const facesOf = (s) => explore(s, "face");
export const edgesOf = (s) => explore(s, "edge");

/** Compound of shapes (the inputs stay owned by the caller; the compound shares their topology). */
export function compound(shapes) {
  const O = OC();
  const b = new O.TopoDS_Builder();
  const c = new O.TopoDS_Compound();
  try {
    b.MakeCompound(c);
    for (const s of shapes) b.Add(c, s.wrapped);
  } finally { del(b); }
  return new R.Compound(c);
}
/** One shape for a list: the single shape itself (copied by reference) or a compound. */
export function combine(shapes) {
  if (shapes.length === 1) return shapes[0];
  return compound(shapes);
}

// ------------------------------------------------------------------ edges and wires
/** End points, mid point and end tangents of an edge (in the edge's own orientation). */
export function edgeInfo(e) {
  const O = OC();
  const ad = new O.BRepAdaptor_Curve(e.wrapped);
  try {
    const t0 = ad.FirstParameter(), t1 = ad.LastParameter();
    const rev = e.wrapped.Orientation() === O.TopAbs_Orientation.TopAbs_REVERSED;
    const P = (t) => xyz(ad.Value(t));
    const D = (t) => {
      const p = new O.gp_Pnt(), v = new O.gp_Vec();
      try { ad.D1(t, p, v); return V.norm([v.X(), v.Y(), v.Z()]); } finally { del(p, v); }
    };
    let a = P(t0), b = P(t1), ta = D(t0), tb = D(t1);
    if (rev) { [a, b] = [b, a]; [ta, tb] = [V.mul(tb, -1), V.mul(ta, -1)]; }
    return { a, b, m: P((t0 + t1) / 2), ta, tb, t0, t1, rev, closed: V.len(V.sub(a, b)) < TOL };
  } finally { del(ad); }
}
/** n + 1 points along an edge (in its orientation) with the tangent at each. */
export function edgeSamples(e, n = 24) {
  const O = OC();
  const ad = new O.BRepAdaptor_Curve(e.wrapped);
  try {
    const t0 = ad.FirstParameter(), t1 = ad.LastParameter();
    const rev = e.wrapped.Orientation() === O.TopAbs_Orientation.TopAbs_REVERSED;
    const out = [];
    for (let i = 0; i <= n; i++) {
      const k = rev ? 1 - i / n : i / n;
      const t = t0 + (t1 - t0) * k;
      const p = new O.gp_Pnt(), v = new O.gp_Vec();
      try {
        ad.D1(t, p, v);
        const tv = V.norm([v.X(), v.Y(), v.Z()]);
        out.push({ p: [p.X(), p.Y(), p.Z()], t: rev ? V.mul(tv, -1) : tv });
      } finally { del(p, v); }
    }
    return out;
  } finally { del(ad); }
}
/** Length of an edge or wire. */
export function lengthOf(s) {
  try { return R.measureLength(s); } catch { return 0; }
}

function makeEdge(me) {
  try {
    if (me.IsDone && !me.IsDone()) throw new Error("Could not build a curve");
    return new R.Edge(me.Edge());
  } finally { del(me); }
}
/** Straight edge a -> b. */
export function lineEdge(a, b) {
  const pa = pnt(a), pb = pnt(b);
  try { return makeEdge(new (OC().BRepBuilderAPI_MakeEdge)(pa, pb)); } finally { del(pa, pb); }
}
/** Interpolating B-spline edge through points (an approximation within tol). */
export function bsplineEdge(pts, tol = 1e-4) {
  const O = OC();
  const arr = new O.NCollection_Array1_gp_Pnt(1, pts.length);
  let api = null, crv = null;
  try {
    pts.forEach((p, i) => { const g = pnt(p); arr.SetValue(i + 1, g); del(g); });
    api = new O.GeomAPI_PointsToBSpline(arr, 3, 8, O.GeomAbs_Shape.GeomAbs_C2, tol);
    crv = api.Curve();
    return makeEdge(new O.BRepBuilderAPI_MakeEdge(crv));
  } finally { del(crv, api, arr); }
}

/** World edges of sketch curves ({sketch, curve} refs of one state); text / unknown curves are skipped. */
export function sketchCurveEdges(st, refs) {
  const out = [];
  try {
    for (const r of refs || []) {
      const s = st.sketches.get(r.sketch);
      if (!s) throw new Error("A sketch curve's sketch is missing");
      const e = sketchCurveEdge(s, r.curve);
      if (e) out.push(e);
    }
  } catch (e) { del(out); throw e; }
  return out;
}
function sketchCurveEdge(s, cid) {
  const O = OC();
  const cv = s.sk.curves[cid];
  if (!cv) throw new Error("A sketch curve is missing");
  const g = curveGeom(s.sk, cid);
  if (!g) return null;
  const pl = s.plane;
  const W = (q) => K.toWorld(pl, q[0], q[1]);
  const tmp = [];
  try {
    if (g.kind === "line") {
      if (V.len(V.sub(W(g.a), W(g.b))) < 1e-9) return null;
      return lineEdge(W(g.a), W(g.b));
    }
    if (g.kind === "circle" || g.kind === "arc") {
      const ax = ax2(W(g.c), pl.n, pl.x);
      const circ = new O.gp_Circ(ax, g.r);
      tmp.push(ax, circ);
      if (g.kind === "circle") return makeEdge(new O.BRepBuilderAPI_MakeEdge(circ));
      return makeEdge(new O.BRepBuilderAPI_MakeEdge(circ, g.a0, g.a0 + g.sweep));
    }
    if (g.kind === "pcurve" && g.sub === "spline" && g.spans) {
      const pieces = splinePieces(g, 0, g.T);
      const k = pieces.length;
      if (!k) return null;
      const poles = new O.NCollection_Array1_gp_Pnt(1, 2 * k + 2);
      const knots = new O.NCollection_Array1_double(1, k + 1);
      const mults = new O.NCollection_Array1_int(1, k + 1);
      tmp.push(poles, knots, mults);
      let idx = 1;
      const setP = (p) => { const q = pnt(W(p)); poles.SetValue(idx++, q); del(q); };
      setP(pieces[0].b[0]);
      for (const pc of pieces) { setP(pc.b[1]); setP(pc.b[2]); }
      setP(pieces[k - 1].b[3]);
      let u = 0;
      knots.SetValue(1, 0); mults.SetValue(1, 4);
      for (let i = 0; i < k; i++) { u += Math.max(pieces[i].L, 1e-9); knots.SetValue(i + 2, u); mults.SetValue(i + 2, i === k - 1 ? 4 : 2); }
      const curve = new O.Geom_BSplineCurve(poles, knots, mults, 3, false);
      tmp.push(curve);
      return makeEdge(new O.BRepBuilderAPI_MakeEdge(curve));
    }
    if (g.kind === "pcurve" && g.sub === "ellipse" && g.E) {
      const E = g.E;
      const major = E.r1 >= E.r2;
      const X2 = major ? E.ux : E.uy;
      const y = K.planeY(pl);
      const Xw = [0, 1, 2].map((i) => pl.x[i] * X2[0] + y[i] * X2[1]);
      const ax = ax2(W(E.c), pl.n, Xw);
      const el = new O.gp_Elips(ax, Math.max(E.r1, E.r2), Math.min(E.r1, E.r2));
      tmp.push(ax, el);
      if (g.closed) return makeEdge(new O.BRepBuilderAPI_MakeEdge(el));
      const off = major ? 0 : -Math.PI / 2;
      return makeEdge(new O.BRepBuilderAPI_MakeEdge(el, g.th0 + off, g.th0 + g.T + off));
    }
    if (g.kind === "pcurve") {
      // other free-form curves (control point splines, conics): fitted through dense samples
      const pts = pcurvePolyline(g, 64).map(W);
      return bsplineEdge(pts);
    }
    return null;
  } finally { del(tmp); }
}

/**
 * Group edges into connected chains (end points within TOL) and build one wire per chain.
 * Returns [{wire, closed, edges}] (edges are the caller's inputs, in chain order).
 */
export function chainWires(edges) {
  const info = edges.map((e) => edgeInfo(e));
  const left = edges.map((_, i) => i);
  const close = (p, q) => V.len(V.sub(p, q)) < 10 * TOL;
  const out = [];
  while (left.length) {
    // start at a free end when there is one (open chains), else anywhere (loops)
    const free = left.find((i) => {
      const touch = (p) => left.some((j) => j !== i && (close(p, info[j].a) || close(p, info[j].b)));
      return !info[i].closed && (!touch(info[i].a) || !touch(info[i].b));
    });
    const i0 = free !== undefined ? free : left[0];
    left.splice(left.indexOf(i0), 1);
    const chain = [i0];
    let ends = [info[i0].a, info[i0].b];
    if (!info[i0].closed) {
      for (let grew = true; grew;) {
        grew = false;
        for (let k = 0; k < left.length; k++) {
          const j = left[k], g = info[j];
          if (g.closed) continue;
          if (close(ends[1], g.a)) ends = [ends[0], g.b];
          else if (close(ends[1], g.b)) ends = [ends[0], g.a];
          else if (close(ends[0], g.b)) { ends = [g.a, ends[1]]; chain.unshift(j); left.splice(k, 1); grew = true; break; }
          else if (close(ends[0], g.a)) { ends = [g.b, ends[1]]; chain.unshift(j); left.splice(k, 1); grew = true; break; }
          else continue;
          chain.push(j); left.splice(k, 1); grew = true; break;
        }
      }
    }
    const list = chain.map((i) => edges[i]);
    out.push({ wire: wireOf(list), closed: info[i0].closed || (chain.length > 1 && close(ends[0], ends[1])), edges: list });
  }
  return out;
}
/** Wire of connected edges (any order). */
export function wireOf(edges) {
  const O = OC();
  const wb = new O.BRepBuilderAPI_MakeWire();
  const l = new O.NCollection_List_TopoDS_Shape(edges.map((e) => e.wrapped));
  try {
    wb.Add(l);
    if (!wb.IsDone()) throw new Error("The curves are not connected end to end");
    return new R.Wire(wb.Wire());
  } finally { del(l, wb); }
}

/** Outer + hole wires of sketch profiles (regions), with their sketch planes: [{wire, plane, closed:true}]. */
export function profileWires(st, profiles, M) {
  const out = [];
  try {
    for (const g of M.profileGroups(st, profiles || [])) {
      for (const r of K.unionRegions(g.regions)) {
        const f = K.regionFace(r, g.sketch.regions.vertices, g.sketch.plane);
        try {
          for (const w of explore(f, "wire")) out.push({ wire: w, plane: g.sketch.plane, closed: true, sketch: g.sketch.id });
        } finally { del(f); }
      }
    }
  } catch (e) { del(out.map((x) => x.wire)); throw e; }
  return out;
}
/** Outer wires only (one per profile region), for lofts and patches. */
export function profileOuterWires(st, profiles, M) {
  const out = [];
  try {
    for (const pr of profiles || []) {
      const { region, sketch } = M.resolveRegion(st, pr);
      const f = K.regionFace({ outer: region.outer, holes: [] }, sketch.regions.vertices, sketch.plane);
      try {
        const O = OC();
        out.push({ wire: new R.Wire(O.BRepTools.OuterWire(f.wrapped)), plane: sketch.plane, closed: true, sketch: sketch.id });
      } finally { del(f); }
    }
  } catch (e) { del(out.map((x) => x.wire)); throw e; }
  return out;
}

// ------------------------------------------------------------------ sweeps
/** Prism of any shape (edge / wire / face / shell) along v. */
export function prismOf(shape, v) {
  const O = OC();
  const vv = vec(v);
  const b = new O.BRepPrimAPI_MakePrism(shape.wrapped, vv, true, true);
  try {
    if (b.IsDone && !b.IsDone()) throw new Error("The extrusion failed");
    return cast(b.Shape());
  } finally { del(b, vv); }
}
/** Revolution of any shape about the axis (o, d) by angle (deg). */
export function revolOf(shape, o, d, angleDeg) {
  const O = OC();
  const a = ax1(o, d);
  const b = new O.BRepPrimAPI_MakeRevol(shape.wrapped, a, (angleDeg * Math.PI) / 180, true);
  try {
    if (b.IsDone && !b.IsDone()) throw new Error("The revolve failed");
    return cast(b.Shape());
  } finally { del(b, a); }
}
/** Translated / rotated copies (re-exported kernel transforms). */
export const translated = (s, v) => K.translated(s, v);
export const rotated = (s, a, o, d) => K.rotated(s, a, o, d);

/** Surface loft (ThruSections, not solid) through wires. */
export function loftWires(wires, { ruled = false, closed = false } = {}) {
  const O = OC();
  const b = new O.BRepOffsetAPI_ThruSections(false, !!ruled, 1e-6);
  try {
    b.CheckCompatibility(true);
    for (const w of wires) b.AddWire(w.wrapped);
    if (closed && wires.length > 2) b.AddWire(wires[0].wrapped);
    b.Build();
    if (!b.IsDone()) throw new Error("The loft failed; check the profiles");
    return cast(b.Shape());
  } finally { del(b); }
}

/** Surface sweep of a profile (wire / edge) along a spine wire. orientation: 'perpendicular' | 'parallel'. */
export function sweepShell(profile, spine, { orientation = "perpendicular" } = {}) {
  const O = OC();
  const b = new O.BRepOffsetAPI_MakePipeShell(spine.wrapped);
  const tmp = [];
  try {
    if (orientation === "parallel") {
      // fixed trihedron: the profile keeps its orientation along the path
      const i = edgeInfo(explore(spine, "edge")[0]);
      const n = Math.abs(i.ta[2]) < 0.9 ? V.norm(V.cross(i.ta, [0, 0, 1])) : V.norm(V.cross(i.ta, [1, 0, 0]));
      const a = ax2(i.a, i.ta, n);
      tmp.push(a);
      b.SetMode(a);
    } else b.SetMode(false);
    b.SetTransitionMode(O.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RightCorner);
    const w = profile instanceof R.Edge ? wireOf([profile]) : profile;
    if (w !== profile) tmp.push(w);
    b.Add(w.wrapped, false, false);
    b.Build();
    if (!b.IsDone()) throw new Error("The sweep failed; check the profile and the path");
    return cast(b.Shape());
  } finally { del(b, tmp); }
}

/** First `frac` (0..1] of a wire's length as a new wire (the last partial edge is refitted). */
export function trimWire(wire, frac) {
  const edges = explore(wire, "edge");
  if (frac >= 1 - 1e-9) { del(edges); return wire; }
  const ordered = chainWires(edges)[0].edges;
  const lens = ordered.map(lengthOf);
  let want = lens.reduce((a, b) => a + b, 0) * Math.max(1e-3, frac);
  const keep = [];
  const made = [];
  try {
    for (let i = 0; i < ordered.length; i++) {
      if (want >= lens[i] - 1e-9) { keep.push(ordered[i]); want -= lens[i]; if (want <= 1e-9) break; continue; }
      // partial edge: sample its first `want` mm and fit a curve through the samples
      const s = edgeSamples(ordered[i], 64);
      const pts = [s[0].p];
      let acc = 0;
      for (let k = 1; k < s.length; k++) {
        const l = V.len(V.sub(s[k].p, s[k - 1].p));
        if (acc + l >= want) { const t = (want - acc) / l; pts.push(V.add(s[k - 1].p, V.mul(V.sub(s[k].p, s[k - 1].p), t))); break; }
        acc += l;
        pts.push(s[k].p);
      }
      const e = pts.length === 2 ? lineEdge(pts[0], pts[1]) : bsplineEdge(pts);
      made.push(e);
      keep.push(e);
      break;
    }
    return wireOf(keep);
  } finally { del(edges, made); }
}

// ------------------------------------------------------------------ faces
/** Planar face bounded by a closed wire (null when the wire is not planar). */
export function planarFace(wire) {
  const O = OC();
  let mf = null;
  try {
    mf = new O.BRepBuilderAPI_MakeFace(wire.wrapped, true);
    if (!mf.IsDone()) return null;
    return new R.Face(mf.Face());
  } catch { return null; } finally { del(mf); }
}
/**
 * Patch (BRepOffsetAPI_MakeFilling) bounded by edges: [{edge, support?: Face, order: 'G0'|'G1'|'G2'}],
 * optional interior points and curves.
 */
export function fillPatch(bounds, { points = [], curves = [] } = {}) {
  const O = OC();
  const b = new O.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9);
  const tmp = [];
  try {
    const GA = O.GeomAbs_Shape;
    for (const x of bounds) {
      const ord = x.order === "G2" ? GA.GeomAbs_G2 : x.order === "G1" ? GA.GeomAbs_G1 : GA.GeomAbs_C0;
      if (x.support && ord !== GA.GeomAbs_C0) b.Add(x.edge.wrapped, x.support.wrapped, ord, true);
      else b.Add(x.edge.wrapped, GA.GeomAbs_C0, true);
    }
    for (const e of curves) b.Add(e.wrapped, GA.GeomAbs_C0, false);
    for (const p of points) { const q = pnt(p); tmp.push(q); b.Add(q); }
    b.Build();
    if (!b.IsDone()) throw new Error("The patch could not be built for this boundary");
    // angular tangency error (radians) of the last patch with tangent / curvature boundaries
    fillPatch.g1Error = bounds.some((x) => x.support && x.order !== "G0") ? b.G1Error() : 0;
    return cast(b.Shape());
  } finally { del(b, tmp); }
}
fillPatch.g1Error = 0;

/** Faces of a shape as a sewn shell (or the original face). */
export function sew(shapes, tol = TOL, { freeShape = false } = {}) {
  const O = OC();
  const sw = new O.BRepBuilderAPI_Sewing(tol, true, true, true, false);
  try {
    for (const s of shapes) sw.Add(s.wrapped);
    sw.Perform();
    const free = [];
    const edges = [];
    const n = sw.NbFreeEdges();
    for (let i = 1; i <= n; i++) {
      const e = new R.Edge(sw.FreeEdge(i));
      try { free.push(edgeInfo(e).m); } catch { /* degenerate */ }
      if (freeShape) edges.push(e); else del(e);
    }
    const out = { shape: cast(sw.SewedShape()), free };
    if (freeShape) out.freeShape = edges.length ? compound(edges) : null;
    return out;
  } finally { del(sw); }
}
/** True when the shell / face set is closed (no free edges). */
export function isClosedShell(s) {
  try { return !!OC().BRep_Tool.IsClosed(s.wrapped); } catch { return false; }
}
/** Solid bounded by a closed shell (null when it does not enclose a volume). */
export function solidOfShell(shell) {
  const O = OC();
  const fix = new O.ShapeFix_Solid();
  try {
    const s = cast(fix.SolidFromShell(shell.wrapped));
    if (!(s instanceof R.Solid)) { del(s); return null; }
    let v = 0;
    try { v = K.volumeOf(s); } catch { v = 0; }
    if (!(Math.abs(v) > 1e-9)) { del(s); return null; }
    return s;
  } catch { return null; } finally { del(fix); }
}
/**
 * Sew faces / shells into bodies: one entry per connected piece; closed pieces become solids when
 * `solids` is set. Returns {bodies:[shape], free:[midpoints of free edges]}.
 */
export function stitch(shapes, tol = TOL, { solids = true, freeShape = false } = {}) {
  const { shape, free, freeShape: fs } = sew(shapes, tol, { freeShape });
  const pieces = [];
  try {
    const shells = explore(shape, "shell");
    const loose = explore(shape, "face").filter((f) => !shells.some((s) => containsFace(s, f)));
    for (const sh of shells) {
      if (solids && isClosedShell(sh)) {
        const so = solidOfShell(sh);
        if (so) { pieces.push(so); del(sh); continue; }
      }
      pieces.push(sh);
    }
    pieces.push(...loose);
    return { bodies: pieces, free, freeShape: fs || null };
  } finally { if (!pieces.includes(shape)) del(shape); }
}
function containsFace(shell, face) {
  const fs = facesOf(shell);
  try { return fs.some((f) => f.wrapped.IsSame(face.wrapped)); } finally { del(fs); }
}

/** Shape with every face reversed (a surface's front and back sides swap). */
export function reversedShape(shape) {
  return cast(shape.wrapped.Reversed());
}

/** Offset of faces / shells by d (Skin mode). join: 'sharp' | 'rounded'. */
export function offsetShape(shape, d, { join = "sharp" } = {}) {
  const O = OC();
  const tries = [
    (b) => b.PerformByJoin(shape.wrapped, d, 1e-4, O.BRepOffset_Mode.BRepOffset_Skin, join === "sharp", false, join === "sharp" ? O.GeomAbs_JoinType.GeomAbs_Intersection : O.GeomAbs_JoinType.GeomAbs_Arc, false),
    (b) => b.PerformByJoin(shape.wrapped, d, 1e-4, O.BRepOffset_Mode.BRepOffset_Skin, false, false, O.GeomAbs_JoinType.GeomAbs_Arc, false),
    (b) => b.PerformBySimple(shape.wrapped, d),
  ];
  for (const t of tries) {
    const b = new O.BRepOffsetAPI_MakeOffsetShape();
    try {
      t(b);
      if (!b.IsDone()) continue;
      const s = cast(b.Shape());
      if (K.isEmptyShape(s)) { del(s); continue; }
      return s;
    } catch { /* next method */ } finally { del(b); }
  }
  throw new Error("The offset failed; try a smaller distance");
}
/** Solid of a surface given a thickness t (one side along the normal for t > 0, symmetric when sym). */
export function thickenShape(shape, t, { join = "sharp", sym = false } = {}) {
  const O = OC();
  let base = shape, owned = null;
  if (sym) { owned = base = offsetShape(shape, -t / 2, { join }); }
  const tries = [
    (b) => b.MakeThickSolidByJoin(base.wrapped, new O.NCollection_List_TopoDS_Shape([]), t, 1e-4, O.BRepOffset_Mode.BRepOffset_Skin, join === "sharp", false, join === "sharp" ? O.GeomAbs_JoinType.GeomAbs_Intersection : O.GeomAbs_JoinType.GeomAbs_Arc, false),
    (b) => b.MakeThickSolidBySimple(base.wrapped, t),
  ];
  try {
    for (const tr of tries) {
      const b = new O.BRepOffsetAPI_MakeThickSolid();
      try {
        tr(b);
        if (!b.IsDone()) continue;
        let s = cast(b.Shape());
        const solids = K.solidsOf(s);
        if (!solids.length) { del(s); continue; }
        let v = 0;
        try { v = K.volumeOf(s); } catch { v = 0; }
        if (!(Math.abs(v) > 1e-9)) { del(s); continue; }
        if (v < 0) { const r = reversedShape(s); del(s); s = r; }
        return s;
      } catch { /* next method */ } finally { del(b); }
    }
  } finally { if (owned) del(owned); }
  throw new Error("Thicken operation can be applied only on manifold surfaces");
}

// ------------------------------------------------------------------ split / section
/** General split of `shape` by tools; the result shape (faces of surfaces split, solids divided). */
export function splitBy(shape, tools) {
  const O = OC();
  const sp = new O.BRepAlgoAPI_Splitter();
  const args = new O.NCollection_List_TopoDS_Shape([shape.wrapped]);
  const tl = new O.NCollection_List_TopoDS_Shape(tools.map((t) => t.wrapped));
  try {
    sp.SetArguments(args);
    sp.SetTools(tl);
    sp.Build();
    if (typeof sp.HasErrors === "function" && sp.HasErrors()) throw new Error("The split failed");
    return cast(sp.Shape());
  } finally { del(sp, args, tl); }
}
/** Distance between two shapes (Infinity on failure). */
export function distance(a, b) {
  try { return K.shapeDistance(a, b); } catch { return Infinity; }
}
/** Point probe: minimum distance from p to a shape. */
export function pointDistance(shape, p) {
  const v = R.makeVertex(p);
  try { return distance(v, shape); } finally { del(v); }
}

/** Square planar face of half size `half` in plane {o, n}, centred on the projection of c. */
export const planeFace = (pl, c, half) => K.planeSquareFace(pl, c, half);

/**
 * Faces of `shape` grouped into connected pieces, where faces only connect through edges that do
 * not lie on `cutter` (the trim / split tool). Returns [[face]] (the faces are new wrappers).
 */
export function piecesOf(shape, cutter) {
  const faces = facesOf(shape);
  const T = K.topoOf(shape);
  const parent = faces.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  T.edges.forEach((g) => {
    if (!g.faces || g.faces.length < 2) return;
    if (cutter) {
      const mid = g.m || (g.s && g.t ? V.mul(V.add(g.s, g.t), 0.5) : null);
      if (mid && pointDistance(cutter, mid) < 1e-4) return;
    }
    const [a, ...rest] = g.faces;
    for (const b of rest) parent[find(b)] = find(a);
  });
  const groups = new Map();
  faces.forEach((f, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); });
  return [...groups.values()];
}

// ------------------------------------------------------------------ untrim / extend
/** Underlying-surface face of `face` over its UV bounds grown by `ext` mm (holes and trims dropped). */
export function untrimmedFace(face, ext = 0, { keepHoles = false, outerOnly = false } = {}) {
  const O = OC();
  const tmp = [];
  try {
    if (outerOnly) {
      // only the inner loops go: rebuild on the outer wire
      const ow = O.BRepTools.OuterWire(face.wrapped);
      tmp.push(ow);
      const srf = O.BRep_Tool.Surface(face.wrapped);
      tmp.push(srf);
      const mf = new O.BRepBuilderAPI_MakeFace(srf, ow, true);
      tmp.push(mf);
      if (!mf.IsDone()) throw new Error("Untrim failed");
      return fixFace(new R.Face(mf.Face()), face);
    }
    const uv = O.BRepTools.UVBounds(face.wrapped, 0, 0, 0, 0);
    const ad = new O.BRepAdaptor_Surface(face.wrapped, false);
    tmp.push(ad);
    // parameter growth for ext mm: metric scale of the surface at the middle of the face
    const um = (uv.UMin + uv.UMax) / 2, vm = (uv.VMin + uv.VMax) / 2;
    const p = new O.gp_Pnt(), du = new O.gp_Vec(), dv = new O.gp_Vec();
    tmp.push(p, du, dv);
    ad.D1(um, vm, p, du, dv);
    const su = Math.max(1e-9, du.Magnitude()), sv = Math.max(1e-9, dv.Magnitude());
    let u0 = uv.UMin - ext / su, u1 = uv.UMax + ext / su, v0 = uv.VMin - ext / sv, v1 = uv.VMax + ext / sv;
    // periodic directions never grow past one period
    if (ad.IsUPeriodic()) { const T = ad.UPeriod(); if (u1 - u0 > T) { u0 = uv.UMin; u1 = uv.UMin + T; } }
    if (ad.IsVPeriodic()) { const T = ad.VPeriod(); if (v1 - v0 > T) { v0 = uv.VMin; v1 = uv.VMin + T; } }
    // bounded surfaces (B-splines, spheres in V) keep their natural limits
    const clamp = (a, lo, hi) => Math.min(Math.max(a, lo), hi);
    const U0 = ad.FirstUParameter(), U1 = ad.LastUParameter(), V0 = ad.FirstVParameter(), V1 = ad.LastVParameter();
    if (Number.isFinite(U0) && !ad.IsUPeriodic()) { u0 = clamp(u0, U0, U1); u1 = clamp(u1, U0, U1); }
    if (Number.isFinite(V0) && !ad.IsVPeriodic()) { v0 = clamp(v0, V0, V1); v1 = clamp(v1, V0, V1); }
    const srf = O.BRep_Tool.Surface(face.wrapped);
    tmp.push(srf);
    const mf = new O.BRepBuilderAPI_MakeFace(srf, u0, u1, v0, v1, 1e-6);
    tmp.push(mf);
    if (!mf.IsDone()) throw new Error("Untrim failed");
    let out = new R.Face(mf.Face());
    if (keepHoles) {
      const holes = explore(face, "wire").slice(1);
      if (holes.length) {
        const ow = O.BRepTools.OuterWire(face.wrapped);
        tmp.push(ow);
        const inner = holes.filter((w) => !w.wrapped.IsSame(ow));
        const mk = new O.BRepBuilderAPI_MakeFace(out.wrapped);
        tmp.push(mk);
        for (const w of inner) mk.Add(w.wrapped);
        if (mk.IsDone()) { const f2 = new R.Face(mk.Face()); del(out); out = f2; }
        del(holes);
      }
    }
    return fixFace(out, face);
  } finally { del(tmp); }
}
/** The face rebuilt on its outer wire plus the hole wires for which keep(wire) is true. */
export function faceWithHoles(face, keep) {
  const O = OC();
  const tmp = [];
  try {
    const ow = O.BRepTools.OuterWire(face.wrapped);
    const srf = O.BRep_Tool.Surface(face.wrapped);
    tmp.push(ow, srf);
    const mf = new O.BRepBuilderAPI_MakeFace(srf, ow, true);
    tmp.push(mf);
    const wires = explore(face, "wire");
    tmp.push(wires);
    for (const w of wires) if (!w.wrapped.IsSame(ow) && keep(w)) mf.Add(w.wrapped);
    if (!mf.IsDone()) throw new Error("Untrim failed");
    return fixFace(new R.Face(mf.Face()), face);
  } finally { del(tmp); }
}
/** True when the edge (by its mid point) lies on the face's outer wire. */
export function onOuterWire(face, edge) {
  const O = OC();
  const ow = new R.Wire(O.BRepTools.OuterWire(face.wrapped));
  try { return pointDistance(ow, edgeInfo(edge).m) < 1e-5; } finally { del(ow); }
}
function fixFace(f, like) {
  const O = OC();
  const fix = new O.ShapeFix_Face(f.wrapped);
  try {
    fix.FixOrientation();
    let out = new R.Face(fix.Face());
    del(f);
    // keep the original side up
    if (like && like.wrapped.Orientation() !== out.wrapped.Orientation()) {
      const r = cast(out.wrapped.Reversed());
      del(out);
      out = r;
    }
    return out;
  } finally { del(fix); }
}

export function faceCenter(face) {
  const O = OC();
  const ad = new O.BRepAdaptor_Surface(face.wrapped, true);
  try {
    const uv = O.BRepTools.UVBounds(face.wrapped, 0, 0, 0, 0);
    return xyz(ad.Value((uv.UMin + uv.UMax) / 2, (uv.VMin + uv.VMax) / 2));
  } finally { del(ad); }
}
/** Unit face normal at a point of the face (projection), front side. */
export function normalAt(face, p) {
  let v = null;
  try { v = face.normalAt(p); const t = v.toTuple(); return V.norm(t); } catch { return null; } finally { del(v); }
}

/**
 * Directions of a ruled / extension surface along an edge of `face`:
 * 'tangent' (in the face, away from it), 'normal' (along the face normal), or a fixed vector.
 * Returns samples [{p, d}] (d unit).
 */
export function rulingSamples(edge, face, { type = "tangent", fixed = null, angle = 0, flip = false, n = 24, plane = null } = {}) {
  const S = edgeSamples(edge, n);
  const fc = face ? faceCenter(face) : null;
  const out = [];
  let sideSign = 0;
  for (const s of S) {
    let nrm = face ? normalAt(face, s.p) : plane ? V.norm(plane.n) : null;
    if (!nrm || V.len(nrm) < 0.5) nrm = plane ? V.norm(plane.n) : [0, 0, 1];
    // in-surface direction perpendicular to the edge
    let side = V.norm(V.cross(nrm, s.t));
    if (!sideSign) {
      // away from the face (its centre is on the inside); sketch curves: the left side of the curve
      sideSign = fc && V.dot(side, V.sub(fc, s.p)) > 0 ? -1 : 1;
    }
    side = V.mul(side, sideSign);
    let d;
    if (fixed) d = V.norm(fixed);
    else if (type === "normal") d = nrm;
    else d = side;
    if (Math.abs(angle) > 1e-9 && !fixed) d = rotateAbout(d, s.t, angle);
    else if (Math.abs(angle) > 1e-9 && fixed) d = rotateAbout(d, s.t, angle);
    if (flip) d = V.mul(d, -1);
    out.push({ p: s.p, d: V.norm(d), t: s.t, n: nrm, side });
  }
  return out;
}
function rotateAbout(v, axis, deg) {
  const k = V.norm(axis), a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  // Rodrigues
  return V.add(V.add(V.mul(v, c), V.mul(V.cross(k, v), s)), V.mul(k, V.dot(k, v) * (1 - c)));
}

/** Ruled face from an edge along sampled directions (exact prism when the direction is constant). */
export function ruledFromSamples(edge, samples, dist) {
  const d0 = samples[0].d;
  const constant = samples.every((s) => V.len(V.sub(s.d, d0)) < 1e-7);
  if (constant) return prismOf(edge, V.mul(d0, dist));
  const pts = samples.map((s) => V.add(s.p, V.mul(s.d, dist)));
  const far = bsplineEdge(pts);
  const w1 = wireOf([edge]), w2 = wireOf([far]);
  try { return loftWires([w1, w2], { ruled: true }); } finally { del(w1, w2, far); }
}

/** True when the face lies on a plane. */
export function isPlanarFace(face) {
  const O = OC();
  const ad = new O.BRepAdaptor_Surface(face.wrapped, false);
  try { return ad.GetType() === O.GeomAbs_SurfaceType.GeomAbs_Plane; } catch { return false; } finally { del(ad); }
}
/**
 * Natural extension of `face` beyond `edge` by dist: march on the face's underlying surface away from
 * the face (geodesic-like steps), then loft the edge through the marched rows. Planar faces give a
 * ruled (exact) extension.
 */
export function naturalExtension(edge, face, dist, n = 24) {
  const S = rulingSamples(edge, face, { type: "tangent", n });
  if (isPlanarFace(face)) return ruledFromSamples(edge, S, dist);
  const O = OC();
  const srf = O.BRep_Tool.Surface(face.wrapped);
  const ad = new O.BRepAdaptor_Surface(face.wrapped, false);
  const proj = new O.GeomAPI_ProjectPointOnSurf();
  const steps = 12, marks = new Map([[4, 0], [8, 1], [12, 2]]);
  const rows = [[], [], []];
  const tmp = [srf, ad, proj];
  try {
    for (const s of S) {
      const g = pnt(s.p);
      let U = null, Vv = null;
      try {
        proj.Init(g, srf, O.Extrema_ExtAlgo ? O.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad : 0);
        if (proj.NbPoints()) { const r = proj.LowerDistanceParameters(); U = r.U; Vv = r.V; }
      } catch { U = null; } finally { del(g); }
      let p = s.p, side = s.side;
      const h = dist / steps;
      for (let i = 1; i <= steps; i++) {
        let q = null;
        if (U !== null) {
          const P0 = new O.gp_Pnt(), du = new O.gp_Vec(), dv = new O.gp_Vec();
          try {
            ad.D1(U, Vv, P0, du, dv);
            const a = [du.X(), du.Y(), du.Z()], b = [dv.X(), dv.Y(), dv.Z()];
            const w = V.mul(side, h);
            // least squares: a*x + b*y = w
            const aa = V.dot(a, a), ab = V.dot(a, b), bb = V.dot(b, b);
            const det = aa * bb - ab * ab;
            if (Math.abs(det) > 1e-18) {
              const x = (V.dot(a, w) * bb - V.dot(b, w) * ab) / det;
              const y = (V.dot(b, w) * aa - V.dot(a, w) * ab) / det;
              U += x; Vv += y;
              q = xyz(ad.Value(U, Vv));
            }
          } catch { q = null; } finally { del(P0, du, dv); }
        }
        if (!q) q = V.add(p, V.mul(side, h));
        const step = V.sub(q, p);
        if (V.len(step) > 1e-12) side = V.norm(step);
        p = q;
        if (marks.has(i)) rows[marks.get(i)].push(p);
      }
    }
  } finally { del(tmp); }
  const curves = rows.map((r) => bsplineEdge(r));
  const wires = [wireOf([edge]), ...curves.map((c) => wireOf([c]))];
  try { return loftWires(wires, { ruled: false }); } finally { del(wires, curves); }
}

/** Planar corner filler between two ruled faces meeting at vertex v (rulings d1, d2, length L). */
export function cornerFace(v, d1, d2, L, mitered) {
  const c = V.dot(V.norm(d1), V.norm(d2));
  if (c > 1 - 1e-6) return null;
  const p1 = V.add(v, V.mul(d1, L)), p2 = V.add(v, V.mul(d2, L));
  if (!mitered || c < -0.95) {
    // rounded: sector swept by the ruling about the corner
    const axis = V.cross(d1, d2);
    if (V.len(axis) < 1e-9) return null;
    const seg = lineEdge(v, p1);
    try {
      const ang = (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
      return revolOf(seg, v, axis, ang);
    } finally { del(seg); }
  }
  const bis = V.norm(V.add(V.norm(d1), V.norm(d2)));
  const half = Math.acos(Math.max(-1, Math.min(1, c))) / 2;
  const m = V.add(v, V.mul(bis, L / Math.cos(half)));
  return K.polygonFace([v, p1, m, p2]);
}

// ------------------------------------------------------------------ Boundary Fill cells
/**
 * Closed cells bounded by the tool shapes: a box around the tools split by every tool, minus the
 * cells that touch the box. Returns [{shape, p (interior point), volume}] largest first.
 */
export function boundedCells(tools) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const t of tools) {
    const bb = K.bboxOf(t);
    if (!bb) continue;
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); }
  }
  if (!Number.isFinite(mn[0])) return [];
  const pad = Math.max(1, V.len(V.sub(mx, mn)) * 0.1);
  mn = mn.map((x) => x - pad); mx = mx.map((x) => x + pad);
  const box = R.makeBox(mn, mx);
  let split = null;
  const cells = [];
  try {
    split = splitBy(box, tools);
    for (const s of K.solidsOf(split)) {
      const bb = K.bboxOf(s);
      const touches = [0, 1, 2].some((i) => bb.min[i] <= mn[i] + 1e-6 || bb.max[i] >= mx[i] - 1e-6);
      if (touches) { if (s !== split) del(s); continue; }
      let v = 0;
      try { v = K.volumeOf(s); } catch { v = 0; }
      if (!(v > 1e-6)) { if (s !== split) del(s); continue; }
      cells.push({ shape: s, volume: v, p: interiorPoint(s) });
    }
  } finally { del(box); if (split && !cells.some((c) => c.shape === split)) del(split); }
  cells.sort((a, b) => b.volume - a.volume);
  return cells;
}
/** A point strictly inside a solid (centre of mass when inside, else a grid search). */
export function interiorPoint(solid) {
  const inside = (p) => pointDistance(solid, p) < 1e-9 && !onBoundary(solid, p);
  let c = null;
  try { const props = R.measureShapeVolumeProperties(solid); c = props.centerOfMass; del(props); } catch { c = null; }
  if (c && inside(c)) return c;
  const bb = K.bboxOf(solid);
  for (const n of [3, 5, 9]) {
    for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) for (let k = 1; k < n; k++) {
      const p = [0, 1, 2].map((a) => bb.min[a] + ((bb.max[a] - bb.min[a]) * [i, j, k][a]) / n);
      if (inside(p)) return p;
    }
  }
  return c || V.mul(V.add(bb.min, bb.max), 0.5);
}
function onBoundary(solid, p) {
  const fs = facesOf(solid);
  try { return fs.some((f) => pointDistance(f, p) < 1e-6); } finally { del(fs); }
}
/** True when p is inside the solid (distance 0, not on its boundary). */
export function containsPoint(solid, p) {
  return pointDistance(solid, p) < 1e-9 && !onBoundary(solid, p);
}

// ------------------------------------------------------------------ validation
/** Quality report of a shape: {valid, invalidFaces:[i], freeEdges, smallEdges, intersecting:[[i,j]]}. */
export function analyze(shape, { standard = false, tol = 0.01 } = {}) {
  const O = OC();
  const out = { valid: K.isValidShape(shape), invalidFaces: [], freeEdges: 0, smallEdges: 0, intersecting: [] };
  const faces = facesOf(shape);
  try {
    faces.forEach((f, i) => {
      let a = null;
      try { a = new O.BRepCheck_Analyzer(f.wrapped, true, false, false); if (!a.IsValid()) out.invalidFaces.push(i); } catch { out.invalidFaces.push(i); } finally { del(a); }
    });
    const T = K.topoOf(shape);
    for (const g of T.edges) {
      if (g.faces && g.faces.length === 1) out.freeEdges++;
      if ((g.len || 0) < tol) out.smallEdges++;
    }
    if (standard && faces.length <= 40) {
      // non-adjacent face pairs that touch or cross
      const adj = new Set();
      for (const g of T.edges) for (const a of g.faces || []) for (const b of g.faces || []) if (a !== b) adj.add(`${a}:${b}`);
      const bbs = faces.map((f) => K.bboxOf(f));
      for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
        if (adj.has(`${i}:${j}`) || !K.boxesOverlap(bbs[i], bbs[j], tol)) continue;
        if (sharesVertex(faces[i], faces[j])) continue;
        if (distance(faces[i], faces[j]) < tol) out.intersecting.push([i, j]);
      }
    }
  } finally { del(faces); }
  return out;
}
function sharesVertex(a, b) {
  const va = explore(a, "vertex"), vb = explore(b, "vertex");
  try { return va.some((x) => vb.some((y) => x.wrapped.IsSame(y.wrapped))); } finally { del(va, vb); }
}

// ------------------------------------------------------------------ silhouettes
/**
 * Silhouette of a body seen along direction d, from its triangulation: inside faces, the zero set of
 * (surface normal . d) interpolated along triangle edges (the vertex normals are the exact surface
 * normals); across sharp edges, mesh edges between faces turned to and away from d. Returns segments
 * [[a, b]], their points, and a plane {o, n} when every point lies in one plane perpendicular to d
 * (the usual case: the parting line of spheres, cylinders, tori ...).
 */
export function silhouette(shape, d) {
  const m = K.meshBody(shape, Math.max(10, diag(shape)));
  const P = m.vertices, N = m.normals, T = m.triangles;
  const dd = V.norm(d);
  const at = (i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  const g = (i) => { const v = N[3 * i] * dd[0] + N[3 * i + 1] * dd[1] + N[3 * i + 2] * dd[2]; return Math.abs(v) < 1e-12 ? 1e-12 : v; };
  const segs = [];
  // triangle -> face
  const faceOf = new Int32Array(T.length / 3).fill(-1);
  for (const fg of m.faceGroups) for (let k = fg.start; k < fg.start + fg.count; k += 3) faceOf[k / 3] = fg.face;
  const flat = new Set();
  for (let t = 0; t < T.length; t += 3) {
    const ids = [T[t], T[t + 1], T[t + 2]];
    const gs = ids.map(g);
    if (gs.every((x) => Math.abs(x) < 1e-9)) { flat.add(t / 3); continue; }
    const cross = [];
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      if (gs[i] * gs[j] < 0) {
        const k = gs[i] / (gs[i] - gs[j]);
        const a = at(ids[i]), b = at(ids[j]);
        cross.push(V.add(a, V.mul(V.sub(b, a), k)));
      }
    }
    if (cross.length === 2 && V.len(V.sub(cross[0], cross[1])) > 1e-9) segs.push(cross);
  }
  // sharp edges between faces turned towards / away from d
  const key = (i) => `${Math.round(P[3 * i] * 1e4)},${Math.round(P[3 * i + 1] * 1e4)},${Math.round(P[3 * i + 2] * 1e4)}`;
  const edges = new Map();
  for (let t = 0; t < T.length; t += 3) {
    const a = at(T[t]), b = at(T[t + 1]), c = at(T[t + 2]);
    const n = V.cross(V.sub(b, a), V.sub(c, a));
    if (V.len(n) < 1e-14) continue;
    const s = V.dot(V.norm(n), dd);
    const ks = [key(T[t]), key(T[t + 1]), key(T[t + 2])];
    for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) {
      const k = ks[x] < ks[y] ? `${ks[x]}|${ks[y]}` : `${ks[y]}|${ks[x]}`;
      const e = edges.get(k);
      const item = { s, face: faceOf[t / 3], a: [a, b, c][x], b: [a, b, c][y] };
      if (e) e.push(item); else edges.set(k, [item]);
    }
  }
  for (const e of edges.values()) {
    if (e.length !== 2 || e[0].face === e[1].face) continue;
    if (e[0].s * e[1].s < 0 && Math.abs(e[0].s) > 1e-6 && Math.abs(e[1].s) > 1e-6) segs.push([e[0].a, e[0].b]);
  }
  const pts = segs.flat();
  if (!segs.length) return { segs: [], plane: null, pts };
  // planar parting line perpendicular to d?
  const hs = pts.map((p) => V.dot(p, dd));
  const h0 = Math.min(...hs), h1 = Math.max(...hs);
  const size = Math.max(1, diag(shape));
  let plane = null;
  if (h1 - h0 < 2e-3 * size) {
    const h = hs.reduce((a, b) => a + b, 0) / hs.length;
    plane = { o: V.mul(dd, h), n: dd };
  }
  return { segs, plane, pts };
}
function diag(shape) {
  const bb = K.bboxOf(shape);
  return bb ? V.len(V.sub(bb.max, bb.min)) : 100;
}
/** Curtain of planar quads through silhouette segments, extended by L along ±d (a faceted split tool). */
export function curtain(segs, d, L) {
  const faces = [];
  const dd = V.mul(V.norm(d), L);
  for (const [a, b] of segs) {
    if (V.len(V.sub(a, b)) < 1e-9) continue;
    try { faces.push(K.polygonFace([V.sub(a, dd), V.sub(b, dd), V.add(b, dd), V.add(a, dd)])); } catch { /* degenerate */ }
  }
  if (!faces.length) throw new Error("Failed to create parting lines");
  const { shape } = sew(faces, 1e-6);
  del(faces);
  return shape;
}

/** Faces of a list of shapes, flattened (new wrappers). */
export function allFaces(shapes) {
  const out = [];
  for (const s of shapes) out.push(...facesOf(s));
  return out;
}
