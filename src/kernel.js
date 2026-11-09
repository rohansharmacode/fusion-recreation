// Thin wrapper around replicad / OpenCascade for the modelling features.
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { cycleSegments } from "./sketch/regions.js";

export { R };

export async function initKernel(wasmBinary) {
  // This OCCT build ignores Module.wasmBinary, so hand it a pre-instantiated module instead
  // (lets the app ship the wasm gzip'd and inflate it itself).
  const opts = {};
  let failed;
  const failure = new Promise((_, reject) => (failed = reject));
  if (wasmBinary) {
    opts.instantiateWasm = (imports, done) => {
      // A compile/link failure (CSP without 'wasm-unsafe-eval', out of memory) would otherwise leave
      // opencascade() pending forever; surface it so the loader can show an error.
      WebAssembly.instantiate(wasmBinary, imports).then((r) => done(r.instance, r.module), (e) => failed(e));
      return {};
    };
  }
  const oc = await Promise.race([opencascade(opts), failure]);
  R.setOC(oc);
  return oc;
}

// ---------- vector helpers ----------
export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};

export const ORIGIN_PLANES = {
  XY: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] },
  XZ: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] },
  YZ: { o: [0, 0, 0], x: [0, 1, 0], n: [1, 0, 0] },
};
export const ORIGIN_AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

export function planeY(pl) {
  return V.cross(pl.n, pl.x);
}
export function toWorld(pl, u, v) {
  const y = planeY(pl);
  return [pl.o[0] + pl.x[0] * u + y[0] * v, pl.o[1] + pl.x[1] * u + y[1] * v, pl.o[2] + pl.x[2] * u + y[2] * v];
}
export function toLocal(pl, p) {
  const d = V.sub(p, pl.o);
  return [V.dot(d, pl.x), V.dot(d, planeY(pl))];
}
export function rPlane(pl) {
  return new R.Plane(pl.o, pl.x, pl.n);
}
export function offsetPlane(pl, d) {
  return { o: V.add(pl.o, V.mul(pl.n, d)), x: pl.x, n: pl.n };
}

/** Pick a sensible sketch x-axis for an arbitrary normal (world-axis aligned when possible). */
export function planeFromNormal(p, n) {
  n = V.norm(n);
  let x;
  if (Math.abs(n[2]) > 0.9) {
    x = V.norm(V.sub([1, 0, 0], V.mul(n, n[0])));
  } else {
    x = V.norm(V.cross([0, 0, 1], n));
  }
  // sketch origin = world origin projected onto the plane (as Fusion does)
  return { o: V.mul(n, V.dot(p, n)), x, n };
}

// ---------- regions -> drawings ----------
function cycleDrawing(cycle, vertices) {
  const segs = cycleSegments(cycle, vertices);
  if (segs.length === 1 && segs[0].kind === "arc") {
    const s = segs[0];
    return R.drawCircle(s.r).translate(s.c[0], s.c[1]);
  }
  let pen = R.draw(segs[0].a);
  for (const s of segs) {
    if (s.kind === "line") pen = pen.lineTo(s.b);
    else {
      // guard against degenerate (collinear) arcs which crash OCCT
      const cr = (s.mid[0] - s.a[0]) * (s.b[1] - s.a[1]) - (s.mid[1] - s.a[1]) * (s.b[0] - s.a[0]);
      if (Math.abs(cr) < 1e-10) pen = pen.lineTo(s.b);
      else pen = pen.threePointsArcTo(s.b, s.mid);
    }
  }
  return pen.close();
}

export function regionDrawing(region, vertices) {
  let d = cycleDrawing(region.outer, vertices);
  for (const h of region.holes) d = d.cut(cycleDrawing(h, vertices));
  return d;
}

export function regionsDrawing(regs, vertices) {
  let d = null;
  for (const r of regs) {
    const rd = regionDrawing(r, vertices);
    d = d ? d.fuse(rd) : rd;
  }
  return d;
}

function asList(sk) {
  // Sketch | Sketches -> array of Sketch
  if (!sk) return [];
  if (Array.isArray(sk.sketches)) return sk.sketches;
  return [sk];
}

/** Fuse freshly made shapes into one; inputs and intermediate results are released. */
function fuseAll(shapes) {
  let s = null;
  for (const x of shapes) {
    if (!s) { s = x; continue; }
    const n = fuse(s, x);
    del(s, x);
    s = n;
  }
  return s;
}

/** Face of a replicad (Compound)Sketch, then the sketch is released. */
function sketchFace(s) {
  try { return s.face(); } finally { try { s.delete(); } catch { /* already consumed */ } }
}

/** Extrude a 2D drawing on a plane with optional taper. */
export function extrudeDrawing(drawing, pl, start, dist, taperDeg = 0) {
  // start: offset of the start face along n; dist: signed length
  if (Math.abs(dist) < 1e-9) throw new Error("Extrude distance cannot be zero");
  const base = offsetPlane(pl, start);
  const rp = rPlane(base);
  if (Math.abs(taperDeg) < 1e-9) {
    const sks = asList(drawing.sketchOnPlane(rp));
    del(rp);
    const v = V.mul(V.norm(pl.n), dist);
    const solids = sks.map((s) => { const f = sketchFace(s); try { return prism(f, v); } finally { del(f); } });
    return fuseAll(solids);
  }
  // taper via loft between profile and offset profile
  const off = Math.abs(dist) * Math.tan((taperDeg * Math.PI) / 180);
  const topDrawing = drawing.offset(off);
  const topPl = rPlane(offsetPlane(pl, start + dist));
  const a = asList(drawing.sketchOnPlane(rp));
  const b = asList(topDrawing.sketchOnPlane(topPl));
  if (a.length !== b.length) throw new Error("Taper changes the profile topology");
  const solids = a.map((s, i) => s.loftWith(b[i], { ruled: true }));
  return fuseAll(solids);
}

export function revolveDrawing(drawing, pl, axisOrigin, axisDir, angleDeg) {
  const rp = rPlane(pl);
  const sks = asList(drawing.sketchOnPlane(rp));
  del(rp);
  const solids = sks.map((s) => { const f = sketchFace(s); try { return revolveFace(f, axisOrigin, axisDir, angleDeg); } finally { del(f); } });
  return fuseAll(solids);
}

// ---------- sketch regions straight to 3D faces ----------
// The extrude/revolve hot path (every preview while dragging) builds profile faces directly with
// OCCT edges on the sketch plane instead of replicad's 2D drawing -> sketchOnPlane conversion,
// which leaks a few KB per call. Same geometry: lines, three-point arcs, full circles.
function cycleWire(cycle, vertices, pl) {
  const O = OC();
  const segs = cycleSegments(cycle, vertices);
  const W = (q) => toWorld(pl, q[0], q[1]);
  const wb = new O.BRepBuilderAPI_MakeWire();
  const tmp = [];
  try {
    const addEdge = (me) => { tmp.push(me); const e = me.Edge(); tmp.push(e); wb.Add(e); };
    if (segs.length === 1 && segs[0].kind === "arc") {
      const s = segs[0];
      const ax = gpAx2(W(s.c), pl.n);
      const circ = new O.gp_Circ(ax, s.r);
      tmp.push(ax, circ);
      addEdge(new O.BRepBuilderAPI_MakeEdge(circ));
    } else {
      for (const s of segs) {
        const a = gpPnt(W(s.a)), b = gpPnt(W(s.b));
        tmp.push(a, b);
        // degenerate (collinear) arcs crash OCCT: draw them as lines
        const cr = s.kind === "arc" ? (s.mid[0] - s.a[0]) * (s.b[1] - s.a[1]) - (s.mid[1] - s.a[1]) * (s.b[0] - s.a[0]) : 0;
        if (s.kind === "line" || Math.abs(cr) < 1e-10) addEdge(new O.BRepBuilderAPI_MakeEdge(a, b));
        else {
          const m = gpPnt(W(s.mid));
          const mk = new O.GC_MakeArcOfCircle(a, m, b);
          const crv = mk.Value();
          tmp.push(m, mk, crv);
          addEdge(new O.BRepBuilderAPI_MakeEdge(crv));
        }
      }
    }
    wb.Build();
    if (!wb.IsDone()) throw new Error("Profile is not a closed loop");
    return wb.Wire();
  } finally { del(tmp, wb); }
}

/** Planar face of a sketch region (outer loop minus holes) on plane pl. */
export function regionFace(region, vertices, pl) {
  const O = OC();
  const outer = cycleWire(region.outer, vertices, pl);
  const holes = [];
  let mf = null, f0 = null, fix = null;
  try {
    for (const h of region.holes) holes.push(cycleWire(h, vertices, pl));
    mf = new O.BRepBuilderAPI_MakeFace(outer, true);
    for (const h of holes) mf.Add(h);
    if (!mf.IsDone()) throw new Error("Failed to build the profile face");
    f0 = mf.Face();
    // like replicad's addHolesInFace: make the hole loops run opposite to the outer one
    fix = new O.ShapeFix_Face(f0);
    fix.FixOrientation();
    const face = new R.Face(fix.Face());
    // the face normal must be the sketch normal (as replicad's sketches): the outer loop may run
    // either way round, which flips the face and turns revolved solids inside out
    if (V.dot(planarNormal(face), pl.n) < 0) {
      const rv = face.wrapped.Reversed();
      const flipped = new R.Face(O.TopoDS.Face(rv));
      del(rv, face);
      return flipped;
    }
    return face;
  } finally { del(fix, f0, mf, holes, outer); }
}
/** Outward normal of a planar face (plane axis, frame handedness and face orientation). */
function planarNormal(face) {
  const O = OC();
  const ad = new O.BRepAdaptor_Surface(face.wrapped, false);
  let pl = null, ax3 = null;
  try {
    pl = ad.Plane();
    ax3 = pl.Position();
    const sgn = (ax3.Direct() ? 1 : -1) * (face.wrapped.Orientation() === O.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1);
    return V.mul(V.norm(dir3(ax3.Direction())), sgn);
  } finally { del(ax3, pl, ad); }
}

/**
 * Union of several regions of one sketch arrangement, exactly: half-edges shared by two selected
 * regions are dropped and the rest re-chained into loops (outer loops run counter-clockwise, hole
 * loops clockwise), so adjacent profiles extrude as one solid without fusing coincident faces.
 * Returns pseudo-regions [{outer:{hes}, holes:[{hes}]}] for regionFace.
 */
export function unionRegions(regions) {
  if (regions.length < 2) return regions;
  const H = new Set();
  for (const r of regions) for (const c of [r.outer, ...r.holes]) for (const h of c.hes) H.add(h);
  const keep = new Set([...H].filter((h) => !(h.twin && H.has(h.twin))));
  const sample = (h) => {
    const e = h.e;
    if (e.kind === "line") return [e.pu && e.pv ? (h.fwd ? e.pu : e.pv) : null].filter(Boolean);
    const n = Math.max(2, Math.ceil(Math.abs(e.sweep) / 0.3));
    const out = [];
    for (let k = 0; k < n; k++) {
      const t = h.fwd ? e.s0 + (e.sweep * k) / n : e.s0 + e.sweep - (e.sweep * k) / n;
      out.push([e.c[0] + e.r * Math.cos(t), e.c[1] + e.r * Math.sin(t)]);
    }
    return out;
  };
  const loops = [];
  const used = new Set();
  for (const h0 of keep) {
    if (used.has(h0)) continue;
    const hes = [];
    let h = h0, guard = 0;
    while (h && !used.has(h) && guard++ < 100000) {
      used.add(h);
      hes.push(h);
      // next boundary half-edge: walk around the end vertex through the merged regions
      let g = h.next, spin = 0;
      while (g && !keep.has(g) && spin++ < 1000) g = g.twin && g.twin.next;
      h = g;
    }
    const poly = hes.flatMap(sample);
    let a = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
    loops.push({ hes, poly, area: a / 2 });
  }
  const pip = (q, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const outers = loops.filter((l) => l.area > 0).map((l) => ({ outer: l, holes: [] }));
  for (const l of loops.filter((x) => x.area < 0)) {
    let best = null;
    for (const o of outers) {
      if (o.outer.area <= -l.area || !pip(l.poly[0], o.outer.poly)) continue;
      if (!best || o.outer.area < best.outer.area) best = o;
    }
    if (best) best.holes.push(l);
  }
  return outers;
}

/** Extrude sketch regions on plane pl (start offset along n, signed distance), no taper. */
export function extrudeRegions(regions, vertices, pl, start, dist) {
  if (Math.abs(dist) < 1e-9) throw new Error("Extrude distance cannot be zero");
  const base = offsetPlane(pl, start);
  const v = V.mul(V.norm(pl.n), dist);
  const solids = [];
  try {
    for (const r of unionRegions(regions)) {
      const f = regionFace(r, vertices, base);
      try { solids.push(prism(f, v)); } finally { del(f); }
    }
  } catch (e) { del(solids); throw e; }
  return fuseAll(solids);
}

/** Revolve sketch regions on plane pl about the axis (o, d) by angle degrees. */
export function revolveRegions(regions, vertices, pl, axisOrigin, axisDir, angleDeg) {
  const solids = [];
  try {
    for (const r of unionRegions(regions)) {
      const f = regionFace(r, vertices, pl);
      try { solids.push(revolveFace(f, axisOrigin, axisDir, angleDeg)); } finally { del(f); }
    }
  } catch (e) { del(solids); throw e; }
  return fuseAll(solids);
}

export function sketchWire(drawing, pl) {
  const sks = asList(drawing.sketchOnPlane(rPlane(pl)));
  if (sks.length !== 1) throw new Error("Profile must be a single closed loop");
  return sks[0].wire;
}

// ---------- memory hygiene ----------
// replicad frees an OCCT object only when its JS wrapper is garbage-collected (FinalizationRegistry).
// Wrappers are tiny, so the JS GC can run long after the wasm heap has grown. The lookups below scan
// whole bodies (distance solvers, curve/surface adaptors, points, face/edge wrappers): every
// temporary they create is deleted explicitly. Never delete objects that are returned to callers.
export function del(...xs) {
  for (const x of xs) {
    if (!x) continue;
    if (Array.isArray(x)) { for (const y of x) del(y); continue; }
    try { if (typeof x.delete === "function") x.delete(); } catch { /* already deleted */ }
  }
}
const OC = () => R.getOC();
const pt3 = (p) => { const r = [p.X(), p.Y(), p.Z()]; p.delete(); return r; };
const dir3 = (d) => { const r = [d.X(), d.Y(), d.Z()]; d.delete(); return r; };
const tupDel = (v) => { const t = v.toTuple(); del(v); return t; };

// ---------- leak-free shape operations ----------
// replicad wraps every operation result with cast(raw) and never deletes `raw`, and the OCCT embind
// glue only auto-finalizes smart pointers: that raw TopoDS_Shape handle lives for the whole session
// and keeps the result's entire B-rep (plus its mesh triangulation) in wasm memory — every live
// preview leaked a body. The modelling hot paths therefore run here with the same OCCT calls and
// options as replicad, deleting raw handles and builders deterministically.
function own(raw) {
  let s;
  try { s = R.cast(raw); } finally { del(raw); }
  return singleSolid(s);
}
function countSub(shape, type) {
  const O = OC();
  const ex = new O.TopExp_Explorer(shape, type, O.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let n = 0;
  try { while (ex.More()) { n++; ex.Next(); } } finally { ex.delete(); }
  return n;
}
/**
 * OCCT booleans and fillets return a compound even when it holds one solid. A Fusion body is a
 * solid, and solids answer point-containment (distance 0 inside) where compounds do not, so a
 * compound made of exactly one solid (and nothing else) is unwrapped. Face/edge order is unchanged.
 */
export function singleSolid(s) {
  if (!s || !(s instanceof R.Compound)) return s;
  const O = OC();
  const SE = O.TopAbs_ShapeEnum;
  if (countSub(s.wrapped, SE.TopAbs_SOLID) !== 1) return s;
  const ex = new O.TopExp_Explorer(s.wrapped, SE.TopAbs_SOLID, SE.TopAbs_SHAPE);
  let solid = null;
  try { solid = ex.Current(); } finally { ex.delete(); }
  try {
    if (countSub(solid, SE.TopAbs_FACE) !== countSub(s.wrapped, SE.TopAbs_FACE)) return s;
    const out = new R.Solid(O.TopoDS.Solid(solid));
    del(s);
    return out;
  } finally { del(solid); }
}
function own3D(raw, what) {
  const s = own(raw);
  if (!R.isShape3D(s)) { del(s); throw new Error(`Could not ${what} as a 3d shape`); }
  return s;
}
const gpPnt = (p) => new (OC().gp_Pnt)(p[0], p[1], p[2]);
const gpVec = (v) => new (OC().gp_Vec)(v[0], v[1], v[2]);
const gpDir = (v) => { const n = V.norm(v); return new (OC().gp_Dir)(n[0], n[1], n[2]); };
function gpAx1(o, d) {
  const p = gpPnt(o), dd = gpDir(d);
  try { return new (OC().gp_Ax1)(p, dd); } finally { del(p, dd); }
}
function gpAx2(o, d) {
  const p = gpPnt(o), dd = gpDir(d);
  try { return new (OC().gp_Ax2)(p, dd); } finally { del(p, dd); }
}
function boolOp(cls, a, b, what) {
  const bl = new (OC()[cls])(a.wrapped, b.wrapped);
  try {
    bl.Build();
    bl.SimplifyResult(true, true, 1e-3);
    return own3D(bl.Shape(), what);
  } finally { del(bl); }
}
/** a ∪ b (same as replicad shape.fuse with default options). */
export function fuse(a, b) { return boolOp("BRepAlgoAPI_Fuse", a, b, "fuse"); }
/** a − b (same as replicad shape.cut). */
export function cut(a, b) { return boolOp("BRepAlgoAPI_Cut", a, b, "cut"); }
/** a ∩ b (same as replicad shape.intersect). */
export function intersect(a, b) { return boolOp("BRepAlgoAPI_Common", a, b, "intersect"); }

/** Constant-radius fillet of the given edges (Edge objects of `shape`). */
export function filletEdges(shape, edges, r) {
  if (!edges.length) throw new Error("Could not fillet, no edge was selected");
  const O = OC();
  const b = new O.BRepFilletAPI_MakeFillet(shape.wrapped, O.ChFi3d_FilletShape.ChFi3d_Rational);
  try {
    for (const e of edges) b.Add(r, e.wrapped);
    return own3D(b.Shape(), "fillet");
  } finally { del(b); }
}
/** Equal-distance chamfer of the given edges (Edge objects of `shape`). */
export function chamferEdges(shape, edges, d) {
  if (!edges.length) throw new Error("Could not chamfer, no edge was selected");
  const b = new (OC().BRepFilletAPI_MakeChamfer)(shape.wrapped);
  try {
    for (const e of edges) b.Add(d, e.wrapped);
    return own3D(b.Shape(), "chamfer");
  } finally { del(b); }
}
/** Volume of a shape (temporaries released). */
export function volumeOf(s) {
  const O = OC();
  const gp = new O.GProp_GProps();
  try { O.BRepGProp.VolumeProperties(s.wrapped, gp, false, false, false); return gp.Mass(); } finally { del(gp); }
}
/** BRepCheck validity of a shape (false when the check itself fails). */
export function isValidShape(s) {
  let a = null;
  try { a = new (OC().BRepCheck_Analyzer)(s.wrapped, true, false, false); return !!a.IsValid(); } catch { return false; } finally { del(a); }
}
/**
 * A shell result is accepted only if it is a valid non-empty solid whose volume changed (an inside
 * shell must lose material). BRepOffsetAPI_MakeThickSolid reports success and returns the input
 * unchanged when it cannot handle a configuration (a removed face tangent to a fillet, hole tubes
 * meeting the walls): that must count as a failure, not as a shell.
 */
function shellPlausible(s, v0, inside) {
  if (!s || isEmptyShape(s) || !R.isShape3D(s)) return false;
  let v;
  try { v = volumeOf(s); } catch { return false; }
  if (!(v > 1e-9) || Math.abs(v - v0) <= 1e-7 * Math.max(1, v0)) return false;
  if (inside && v >= v0) return false;
  return isValidShape(s);
}
function thickSolid(shape, faces, offset, tolerance, inter) {
  const O = OC();
  const list = new O.NCollection_List_TopoDS_Shape();
  const b = new O.BRepOffsetAPI_MakeThickSolid();
  try {
    for (const f of faces) list.Append(f.wrapped);
    b.MakeThickSolidByJoin(shape.wrapped, list, offset, tolerance, O.BRepOffset_Mode.BRepOffset_Skin, inter, false, O.GeomAbs_JoinType.GeomAbs_Arc, false);
    return own3D(b.Shape(), "shell");
  } finally { del(b, list); }
}
/** Closed offset of a whole solid by d (< 0: eroded inwards, > 0: grown), arc joins, as a solid. */
function offsetSolidOnce(shape, d, tolerance, inter) {
  const O = OC();
  const b = new O.BRepOffsetAPI_MakeOffsetShape();
  let fix = null;
  try {
    b.PerformByJoin(shape.wrapped, d, tolerance, O.BRepOffset_Mode.BRepOffset_Skin, inter, false, O.GeomAbs_JoinType.GeomAbs_Arc, false);
    if (!b.IsDone()) throw new Error("offset failed");
    let raw = b.Shape();
    if (raw.IsNull()) { del(raw); throw new Error("offset failed"); }
    if (raw.ShapeType() === O.TopAbs_ShapeEnum.TopAbs_SHELL) {
      fix = new O.ShapeFix_Solid();
      let solid;
      try { solid = fix.SolidFromShell(O.TopoDS.Shell(raw)); } finally { del(raw); }
      raw = solid;
    }
    return own3D(raw, "offset");
  } finally { del(b, fix); }
}
/** offsetSolidOnce with neighbour intersections first, then all offset faces intersected; checked by volume. */
function offsetSolid(shape, d, tolerance = 1e-3) {
  const v0 = volumeOf(shape);
  for (const inter of [false, true]) {
    let s = null;
    try { s = offsetSolidOnce(shape, d, tolerance, inter); } catch { s = null; }
    let v = NaN;
    try { v = s ? volumeOf(s) : NaN; } catch { v = NaN; }
    if (s && v > 1e-9 && (d < 0 ? v < v0 : v > v0)) return s;
    del(s);
  }
  throw new Error("offset failed");
}
/**
 * Through/blind holes of a solid: concave cylinders and cones (outward normal towards the axis),
 * merged per axis line. Each is {a, ao, h0, h1, r0, r1}: axis, axial range and radius at both ends.
 */
function holeVoids(shape) {
  const O = OC();
  const T = topoOf(shape);
  const out = [];
  const faces = facesOf(shape);
  try {
    T.faces.forEach((fi0, i) => {
      let fi = fi0;
      if (fi.type !== "CYLINDRE" && fi.type !== "CONE") return;
      let ad = null;
      try {
        ad = new O.BRepAdaptor_Surface(faces[i].wrapped, false);
        fi = { ...fi0 };
        const uv = O.BRepTools.UVBounds(faces[i].wrapped, 0, 0, 0, 0);
        if (!fi.a || !fi.ao) {
          // no gp_Cone binding: the axis from an iso-v circle of the surface (centre + normal)
          const vm = (uv.VMin + uv.VMax) / 2, du = (uv.UMax - uv.UMin) / 3;
          const [p0, p1, p2] = [0, 1, 2].map((k) => pt3(ad.Value(uv.UMin + k * du, vm)));
          const ab = V.sub(p1, p0), ac = V.sub(p2, p0);
          const nn = V.cross(ab, ac);
          const n2 = V.dot(nn, nn);
          if (n2 < 1e-18) return;
          const t1 = V.mul(V.cross(nn, ab), V.dot(ac, ac)), t2 = V.mul(V.cross(ac, nn), V.dot(ab, ab));
          fi.ao = V.add(p0, V.mul(V.add(t1, t2), 1 / (2 * n2)));
          fi.a = V.norm(nn);
        }
        const rel = V.sub(fi.c, fi.ao);
        const radial = V.sub(rel, V.mul(fi.a, V.dot(rel, fi.a)));
        if (V.len(radial) < 1e-9 || V.dot(fi.n, radial) >= 0) return; // convex: a boss, not a hole
        const um = (uv.UMin + uv.UMax) / 2;
        const ends = [uv.VMin, uv.VMax].map((v) => {
          const p = pt3(ad.Value(um, v));
          const q = V.sub(p, fi.ao);
          const h = V.dot(q, fi.a);
          return { h, r: V.len(V.sub(q, V.mul(fi.a, h))) };
        });
        ends.sort((x, y) => x.h - y.h);
        let [e0, e1] = ends;
        if (e1.h - e0.h < 1e-9) return;
        // same hole split into several faces (seams, booleans): merge cylinders on one axis line
        const g = fi.type === "CYLINDRE" && out.find((o) => o.cyl && Math.abs(o.r0 - fi.r) < 1e-7 && Math.abs(Math.abs(V.dot(o.a, fi.a)) - 1) < 1e-9 &&
          V.len(V.sub(V.sub(fi.ao, o.ao), V.mul(o.a, V.dot(V.sub(fi.ao, o.ao), o.a)))) < 1e-6);
        if (g) {
          for (const e of ends) {
            const h = V.dot(V.sub(V.add(fi.ao, V.mul(fi.a, e.h)), g.ao), g.a);
            g.h0 = Math.min(g.h0, h); g.h1 = Math.max(g.h1, h);
          }
          return;
        }
        if (fi.type === "CYLINDRE" && Number.isFinite(fi.r)) { e0 = { ...e0, r: fi.r }; e1 = { ...e1, r: fi.r }; }
        out.push({ a: fi.a, ao: fi.ao, h0: e0.h, h1: e1.h, r0: e0.r, r1: e1.r, cyl: fi.type === "CYLINDRE" });
      } catch { /* not usable */ } finally { del(ad); }
    });
  } finally { del(faces); }
  return out;
}
/** Solid of revolution of a hole void (cylinder or cone frustum) between axial h0..h1 with radii r0, r1. */
function voidSolid(a, ao, h0, h1, r0, r1) {
  return revolveProfile(a, ao, [[h0, 0], [h1, 0], [h1, r1], [h0, r0]]);
}
/** Solid of revolution of a closed (h, ρ) profile about the axis (ao, a). */
function revolveProfile(a, ao, prof) {
  const w = V.norm(Math.abs(a[0]) < 0.9 ? V.cross(a, [1, 0, 0]) : V.cross(a, [0, 1, 0]));
  const at = ([h, r]) => V.add(V.add(ao, V.mul(a, h)), V.mul(w, Math.max(0, r)));
  const f = polygonFace(prof.map(at));
  try { return revolveFace(f, ao, a, 360); } finally { del(f); }
}
/**
 * The hole void grown by T (its dilation, i.e. everything within T of it): a body of revolution
 * whose meridian profile is the void's trapezoid offset by T with round corners (polygonal arcs),
 * clipped at the axis.
 */
function grownVoidSolid(h, T) {
  let P = [[h.h0, 0], [h.h1, 0], [h.h1, h.r1], [h.h0, h.r0]].filter((q, i, arr) => i === 0 || Math.hypot(q[0] - arr[i - 1][0], q[1] - arr[i - 1][1]) > 1e-9);
  if (Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) <= 1e-9) P.pop();
  const n = P.length;
  const nrm = P.map((p, i) => { const q = P[(i + 1) % n]; const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return [dy / l, -dx / l]; });
  const out = [];
  for (let i = 0; i < n; i++) {
    const n0 = nrm[(i - 1 + n) % n], n1 = nrm[i];
    let a0 = Math.atan2(n0[1], n0[0]), a1 = Math.atan2(n1[1], n1[0]);
    while (a1 < a0 - 1e-12) a1 += 2 * Math.PI;
    const k = Math.max(1, Math.ceil((a1 - a0) / (Math.PI / 8)));
    for (let j = 0; j <= k; j++) { const t = a0 + ((a1 - a0) * j) / k; out.push([P[i][0] + T * Math.cos(t), P[i][1] + T * Math.sin(t)]); }
  }
  // keep ρ >= 0 (Sutherland–Hodgman against the axis)
  const clip = [];
  for (let i = 0; i < out.length; i++) {
    const p = out[i], q = out[(i + 1) % out.length];
    if (p[1] >= 0) clip.push(p);
    if ((p[1] >= 0) !== (q[1] >= 0)) { const t = p[1] / (p[1] - q[1]); clip.push([p[0] + (q[0] - p[0]) * t, 0]); }
  }
  return revolveProfile(h.a, h.ao, clip);
}
/** Planar faces of `body` lying on the plane (n, d) that touch `ref` (a face). Caller deletes them. */
function coplanarFacesTouching(body, n, d, ref) {
  const T = topoOf(body);
  const idx = [];
  T.faces.forEach((fi, i) => { if (fi.type === "PLANE" && V.dot(fi.n, n) > 1 - 1e-9 && Math.abs(fi.d - d) < 1e-6) idx.push(i); });
  const fs = facesAt(body, idx);
  const out = [];
  for (const f of fs) {
    let dist = Infinity;
    try { dist = shapeDistance(f, ref); } catch { /* keep */ }
    if (dist < 1e-6) out.push(f); else del(f);
  }
  return out;
}
/**
 * Shell by booleans, for what MakeThickSolid cannot do (removed faces tangent to kept fillets,
 * hole tubes meeting the walls). Inside (t > 0): the walls are S − cavity with
 *   cavity = (erode(A, t) ∪ openings) − ∪ grow(hole_i, t),   A = S with its holes filled,
 * because erosion distributes over S = A − ∪hole_i. Openings: the eroded removed face extruded back
 * up to the removed face (planar removed faces). Outside (t < 0): (grow(S) − slabs) − S.
 */
function shellByBooleans(shape, faces, t) {
  const inside = t > 0;
  const T = Math.abs(t);
  const rem = faces.map((f) => faceGeom(f));
  if (rem.some((g) => g.type !== "PLANE" || g.d === undefined)) throw new Error("Shell failed — try a smaller thickness");
  const tmp = [];
  try {
    let A = shape;
    const grown = [];
    if (inside) {
      for (const h of holeVoids(shape)) {
        const vs = voidSolid(h.a, h.ao, h.h0, h.h1, h.r0, h.r1);
        tmp.push(vs);
        let fused = null;
        try { fused = fuse(A, vs); } catch { continue; }
        // a real hole is empty space: filling it adds its whole volume (a concave fillet does not)
        const dv = volumeOf(fused) - volumeOf(A) - volumeOf(vs);
        if (Math.abs(dv) > 1e-6 * Math.max(1, volumeOf(vs))) { del(fused); continue; }
        tmp.push(fused);
        A = fused;
        const gv = grownVoidSolid(h, T);
        tmp.push(gv);
        grown.push(gv);
      }
    }
    const off = offsetSolid(A, inside ? -T : T);
    tmp.push(off);
    const vOff = volumeOf(off), vA = volumeOf(A);
    if (!(vOff > 1e-9) || (inside ? vOff >= vA : vOff <= vA)) throw new Error("offset failed");
    // openings: the offset copy of every removed face, extruded back onto the removed face
    const slabs = [];
    for (let i = 0; i < faces.length; i++) {
      const g = rem[i];
      const sh = V.mul(g.n, inside ? -T : T);
      const moved = translated(faces[i], sh);
      tmp.push(moved);
      for (const ef of coplanarFacesTouching(off, g.n, g.d + (inside ? -T : T), moved)) {
        try { const sl = prism(ef, V.mul(sh, -1)); tmp.push(sl); slabs.push(sl); } finally { del(ef); }
      }
    }
    if (!slabs.length) throw new Error("no opening");
    let body = off;
    if (inside) {
      for (const s of slabs) { const n = fuse(body, s); tmp.push(n); body = n; }
      for (const gsol of grown) { const n = cut(body, gsol); tmp.push(n); body = n; }
      return cut(shape, body);
    }
    for (const s of slabs) { const n = cut(body, s); tmp.push(n); body = n; }
    return cut(body, shape);
  } finally {
    for (const x of tmp) if (x !== shape) del(x);
  }
}
/**
 * Hollow `shape` removing `faces` (Face objects of it); thickness > 0 = walls inside (replicad shell).
 * OCCT's thick solid first (plain, then intersecting all offset faces), then the boolean shell; a
 * result that did not actually hollow the body is never returned.
 */
export function shellFaces(shape, faces, thickness, tolerance = 1e-3) {
  const inside = thickness > 0;
  const v0 = volumeOf(shape);
  for (const inter of [false, true]) {
    let s = null;
    try { s = thickSolid(shape, faces, -thickness, tolerance, inter); } catch { s = null; }
    if (s && shellPlausible(s, v0, inside)) return s;
    del(s);
  }
  let s = null;
  try { s = shellByBooleans(shape, faces, thickness); } catch { s = null; }
  if (s && shellPlausible(s, v0, inside)) return s;
  del(s);
  throw new Error("Shell failed — try a smaller thickness");
}
/** Draft `faces` (Face objects of `shape`) by angle (deg) about the neutral plane pl {o, n}. */
export function draftFaces(shape, faces, angleDeg, pl) {
  const O = OC();
  const b = new O.BRepOffsetAPI_DraftAngle(shape.wrapped);
  const p = gpPnt(pl.o), dir = gpDir(pl.n);
  const pln = new O.gp_Pln(p, dir);
  try {
    for (const f of faces) b.Add(f.wrapped, dir, (angleDeg * Math.PI) / 180, pln, false);
    b.Build();
    return own3D(b.ModifiedShape(shape.wrapped), "draft");
  } finally { del(b, pln, p, dir); }
}
/** Prism of a face along vector v (replicad basicFaceExtrusion). */
export function prism(face, v) {
  const vec = gpVec(v);
  const b = new (OC().BRepPrimAPI_MakePrism)(face.wrapped, vec, false, true);
  try { return own(b.Shape()); } finally { del(b, vec); }
}
/** Revolution of a face about the axis (o, d) by angle degrees. */
export function revolveFace(face, o, d, angleDeg = 360) {
  const ax = gpAx1(o, d);
  const b = new (OC().BRepPrimAPI_MakeRevol)(face.wrapped, ax, (angleDeg * Math.PI) / 180, false);
  try { return own(b.Shape()); } finally { del(b, ax); }
}
function transformed(shape, setup) {
  const O = OC();
  const trsf = new O.gp_Trsf();
  let t = null;
  try {
    setup(trsf);
    t = new O.BRepBuilderAPI_Transform(shape.wrapped, trsf, true, false);
    return own(t.ModifiedShape(shape.wrapped));
  } finally { del(t, trsf); }
}
/** Translated copy of a shape (the input is kept). */
export function translated(shape, v) {
  return transformed(shape, (t) => { const vec = gpVec(v); try { t.SetTranslation(vec); } finally { del(vec); } });
}
/** Rotated copy (angle in degrees about the axis through o along d; the input is kept). */
export function rotated(shape, angleDeg, o = [0, 0, 0], d = [0, 0, 1]) {
  return transformed(shape, (t) => { const ax = gpAx1(o, d); try { t.SetRotation(ax, (angleDeg * Math.PI) / 180); } finally { del(ax); } });
}
/** Mirrored copy about the plane through o with normal n (the input is kept). */
export function mirrored(shape, n, o = [0, 0, 0]) {
  return transformed(shape, (t) => { const ax = gpAx2(o, n); try { t.SetMirror(ax); } finally { del(ax); } });
}

/** Distance solver from a fixed point to many shapes (one BRepExtrema solver). Call delete() after use. */
export function pointProbe(p) {
  const O = OC();
  const v = R.makeVertex(p);
  const d = new O.BRepExtrema_DistShapeShape();
  d.LoadS1(v.wrapped);
  return {
    dist(shape) {
      try {
        d.LoadS2(shape.wrapped);
        d.Perform();
        if (!d.IsDone() || d.NbSolution() < 1) return Infinity;
        return d.Value();
      } catch { return Infinity; }
    },
    /** closest point on the shape measured last */
    closest() { try { return pt3(d.PointOnShape2(1)); } catch { return null; } },
    delete() { del(d, v); },
  };
}

/** Minimum distance between two shapes (solver deleted afterwards). */
export function shapeDistance(a, b) {
  const d = new (OC().BRepExtrema_DistShapeShape)();
  try {
    d.LoadS1(a.wrapped);
    d.LoadS2(b.wrapped);
    d.Perform();
    if (!d.IsDone() || d.NbSolution() < 1) return Infinity;
    return d.Value();
  } finally { del(d); }
}

// ---------- face / edge lookup ----------
/**
 * Faces or edges of a shape as replicad Face/Edge objects, in the same order (same indices) as
 * replicad's shape.faces / shape.edges. replicad's iterator keeps every explorer item it has seen
 * and never deletes them (raw handles are not garbage-collected), which pins each sub-shape's
 * geometry for the whole session; this one releases them.
 */
export function subShapes(shape, kind) {
  const O = OC();
  const SE = O.TopAbs_ShapeEnum;
  const isFace = kind === "face";
  const ex = new O.TopExp_Explorer(shape.wrapped, isFace ? SE.TopAbs_FACE : SE.TopAbs_EDGE, SE.TopAbs_SHAPE);
  const out = [];
  const byHash = new Map();
  try {
    while (ex.More()) {
      const it = ex.Current();
      const h = O.ReplicadShapeHasher.HashCode(it, R.HASH_CODE_MAX);
      const l = byHash.get(h);
      if (l && l.some((x) => x.wrapped.IsSame(it))) it.delete();
      else {
        const w = isFace ? new R.Face(O.TopoDS.Face(it)) : new R.Edge(O.TopoDS.Edge(it));
        it.delete();
        out.push(w);
        if (l) l.push(w); else byHash.set(h, [w]);
      }
      ex.Next();
    }
  } finally { ex.delete(); }
  return out;
}
export const facesOf = (shape) => subShapes(shape, "face");
export const edgesOf = (shape) => subShapes(shape, "edge");

// Every module reads shape.faces / shape.edges (viewport meshing and picking, dialogs, sketch
// projection, timeline checks); with replicad's iterator each read pinned that body's faces/edges
// (geometry + mesh triangulation) for the session. Swap in the leak-free iterator: same order,
// same Face/Edge classes, same deduplication (IsSame), so indices and behaviour are unchanged.
(function patchReplicadIterators() {
  const proto = R.Shape && R.Shape.prototype;
  if (!proto) return;
  for (const [name, kind] of [["faces", "face"], ["edges", "edge"]]) {
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (!d || typeof d.get !== "function" || d.get.leakFree) continue;
    const get = function () { return subShapes(this, kind); };
    get.leakFree = true;
    Object.defineProperty(proto, name, { get, configurable: true, enumerable: !!d.enumerable });
  }
})();

/**
 * Point and outward unit normal of a face at surface parameters (u, v): Du x Dv of the surface
 * adaptor (a BRepAdaptor_Surface of the face, so located), reversed for reversed faces.
 */
function normalAtUV(face, u, v, ad = null) {
  const O = OC();
  const own = !ad;
  if (own) ad = new O.BRepAdaptor_Surface(face.wrapped, false);
  const P = new O.gp_Pnt(), du = new O.gp_Vec(), dv = new O.gp_Vec();
  try {
    ad.D1(u, v, P, du, dv);
    let n = V.norm(V.cross([du.X(), du.Y(), du.Z()], [dv.X(), dv.Y(), dv.Z()]));
    if (face.wrapped.Orientation() === O.TopAbs_Orientation.TopAbs_REVERSED) n = V.mul(n, -1);
    return { p: [P.X(), P.Y(), P.Z()], n };
  } finally { del(P, du, dv); if (own) del(ad); }
}
/** Outward unit normal of a face at a 3D point (projects the point; for curved faces). */
function normalAtPoint(face, p) {
  return V.norm(tupDel(face.normalAt(p)));
}

export function faceInfo(face) {
  let c = [0, 0, 0];
  let n = null;
  let planar = false;
  let type = "OTHER";
  try { c = tupDel(face.center); } catch { /* keep */ }
  try {
    type = face.geomType;
    planar = type === "PLANE";
    n = tupDel(face.normalAt(c));
  } catch {
    n = [0, 0, 1];
  }
  return { center: c, normal: V.norm(n), planar, type };
}

/** Normal of face i of `shape` at p: constant for planes (from the topology cache), projected otherwise. */
function faceNormalNear(T, face, i, p) {
  const fi = T && T.faces[i];
  if (fi && fi.type === "PLANE") return fi.n;
  return normalAtPoint(face, p);
}

export function findFace(shape, p, n) {
  let best = null, bd = Infinity;
  const T = n ? topoOf(shape) : null;
  const faces = facesOf(shape);
  const probe = pointProbe(p);
  try {
    faces.forEach((f, i) => {
      let d = probe.dist(f);
      if (!Number.isFinite(d)) return;
      if (n) {
        try {
          const dot = V.dot(faceNormalNear(T, f, i, p), n);
          if (dot < 0.5) d += 1000 * (1 - dot);
        } catch { /* non-planar ok */ }
      }
      if (d < bd) { bd = d; best = f; }
    });
  } finally {
    probe.delete();
    for (const f of faces) if (f !== best) del(f);
  }
  if (!best || bd > 1e3) { del(best); return null; }
  return best;
}

export function findEdge(shape, p) {
  let best = null, bd = Infinity;
  const edges = edgesOf(shape);
  const probe = pointProbe(p);
  try {
    for (const e of edges) {
      const d = probe.dist(e);
      if (d < bd) { bd = d; best = e; }
    }
  } finally {
    probe.delete();
    for (const e of edges) if (e !== best) del(e);
  }
  return best ? { edge: best, dist: bd } : null;
}

export function edgeMid(e) {
  let ad = null;
  try {
    ad = new (OC().BRepAdaptor_Curve)(e.wrapped);
    return pt3(ad.Value((ad.FirstParameter() + ad.LastParameter()) / 2));
  } catch {
    try { return tupDel(e.startPoint); } catch { return [0, 0, 0]; }
  } finally { del(ad); }
}

/** Edge objects of `shape` at the given indices (the other wrappers are released). */
export function edgesAt(shape, indices) {
  const all = edgesOf(shape);
  const keep = new Set(indices);
  const out = indices.map((i) => all[i]).filter(Boolean);
  all.forEach((e, i) => { if (!keep.has(i)) del(e); });
  return out;
}
/** Face objects of `shape` at the given indices (the other wrappers are released). */
export function facesAt(shape, indices) {
  const all = facesOf(shape);
  const keep = new Set(indices);
  const out = indices.map((i) => all[i]).filter(Boolean);
  all.forEach((f, i) => { if (!keep.has(i)) del(f); });
  return out;
}

// ---------- topology summary (cached per shape) ----------
// Plain-data description of every face and edge of a body: geometry type, normals/directions,
// radii, edge->face adjacency. Used to re-find "the same" face or edge after an upstream edit
// (geometric signatures, see faceSignature/edgeSignature/matchFace/matchEdge) and for tangent chains.
// replicad shapes are immutable (operations return new shapes), so caching by object identity is safe.
const TOPO = new WeakMap();
let CURVE_TYPES = null, SURF_TYPES = null;
function curveTypeName(ad) {
  if (!CURVE_TYPES) {
    const g = OC().GeomAbs_CurveType;
    CURVE_TYPES = new Map([[g.GeomAbs_Line, "LINE"], [g.GeomAbs_Circle, "CIRCLE"], [g.GeomAbs_Ellipse, "ELLIPSE"], [g.GeomAbs_Hyperbola, "HYPERBOLA"], [g.GeomAbs_Parabola, "PARABOLA"], [g.GeomAbs_BezierCurve, "BEZIER_CURVE"], [g.GeomAbs_BSplineCurve, "BSPLINE_CURVE"], [g.GeomAbs_OffsetCurve, "OFFSET_CURVE"], [g.GeomAbs_OtherCurve, "OTHER_CURVE"]]);
  }
  return CURVE_TYPES.get(ad.GetType()) || "OTHER_CURVE";
}
function surfTypeName(ad) {
  if (!SURF_TYPES) {
    const g = OC().GeomAbs_SurfaceType;
    SURF_TYPES = new Map([[g.GeomAbs_Plane, "PLANE"], [g.GeomAbs_Cylinder, "CYLINDRE"], [g.GeomAbs_Cone, "CONE"], [g.GeomAbs_Sphere, "SPHERE"], [g.GeomAbs_Torus, "TORUS"], [g.GeomAbs_BezierSurface, "BEZIER_SURFACE"], [g.GeomAbs_BSplineSurface, "BSPLINE_SURFACE"], [g.GeomAbs_SurfaceOfRevolution, "REVOLUTION_SURFACE"], [g.GeomAbs_SurfaceOfExtrusion, "EXTRUSION_SURFACE"], [g.GeomAbs_OffsetSurface, "OFFSET_SURFACE"], [g.GeomAbs_OtherSurface, "OTHER_SURFACE"]]);
  }
  return SURF_TYPES.get(ad.GetType()) || "OTHER_SURFACE";
}

function faceGeom(f) {
  const O = OC();
  // c: point of the surface at the middle of the face's parameter range (cheap, stable; for a
  // planar face the centre of its parameter-space box), n: outward normal there
  const out = { type: "OTHER_SURFACE", c: [0, 0, 0], n: [0, 0, 1] };
  let ad = null;
  try {
    ad = new O.BRepAdaptor_Surface(f.wrapped, false);
    out.type = surfTypeName(ad);
    const uv = O.BRepTools.UVBounds(f.wrapped, 0, 0, 0, 0);
    const um = (uv.UMin + uv.UMax) / 2, vm = (uv.VMin + uv.VMax) / 2;
    if (out.type === "PLANE") {
      // constant normal: plane axis, flipped for a left-handed frame and for a reversed face
      const pl = ad.Plane();
      const ax3 = pl.Position();
      const sgn = (ax3.Direct() ? 1 : -1) * (f.wrapped.Orientation() === O.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1);
      out.n = V.mul(V.norm(dir3(ax3.Direction())), sgn);
      del(ax3, pl);
      out.c = pt3(ad.Value(um, vm));
    } else {
      const mid = normalAtUV(f, um, vm, ad);
      out.c = mid.p;
      if (V.len(mid.n) > 0.5) out.n = mid.n;
    }
    if (out.type === "CYLINDRE" || out.type === "CONE") {
      const g = out.type === "CYLINDRE" ? ad.Cylinder() : ad.Cone();
      const ax = g.Axis();
      out.a = V.norm(dir3(ax.Direction()));
      out.ao = pt3(ax.Location());
      out.r = out.type === "CYLINDRE" ? g.Radius() : g.RefRadius();
      del(ax, g);
    } else if (out.type === "SPHERE") {
      const g = ad.Sphere();
      out.r = g.Radius();
      out.ao = pt3(g.Location());
      del(g);
    }
    if (out.type === "PLANE") out.d = V.dot(out.n, out.c);
  } catch { /* keep partial info */ } finally { del(ad); }
  return out;
}

function edgeGeom(e) {
  const O = OC();
  const out = { type: "OTHER_CURVE", s: [0, 0, 0], t: [0, 0, 0], m: [0, 0, 0], d: [1, 0, 0], ts: [0, 0, 0], tt: [0, 0, 0], len: 0 };
  let ad = null;
  try {
    ad = new O.BRepAdaptor_Curve(e.wrapped);
    out.type = curveTypeName(ad);
    const u0 = ad.FirstParameter(), u1 = ad.LastParameter();
    out.s = pt3(ad.Value(u0));
    out.t = pt3(ad.Value(u1));
    out.m = pt3(ad.Value((u0 + u1) / 2));
    // tangents without D1 (by-reference outputs are slow through embind); the sign is irrelevant
    if (out.type === "LINE") {
      out.len = V.len(V.sub(out.t, out.s));
      if (out.len > 1e-12) out.d = V.norm(V.sub(out.t, out.s));
      out.ts = out.tt = out.d;
    } else if (out.type === "CIRCLE") {
      const c = ad.Circle();
      const ax = c.Axis();
      out.r = c.Radius();
      out.a = V.norm(dir3(ax.Direction()));
      out.c = pt3(c.Location());
      out.len = out.r * Math.abs(u1 - u0);
      del(ax, c);
      const tan = (q) => V.norm(V.cross(out.a, V.sub(q, out.c)));
      out.ts = tan(out.s); out.tt = tan(out.t); out.d = tan(out.m);
    } else {
      const h = (u1 - u0) * 1e-4;
      const fd = (u, sgn) => { const q = pt3(ad.Value(u + sgn * h)); const b = pt3(ad.Value(u)); return V.norm(V.mul(V.sub(q, b), sgn)); };
      try { out.ts = fd(u0, 1); out.tt = fd(u1, -1); out.d = V.norm(V.sub(pt3(ad.Value((u0 + u1) / 2 + h)), out.m)); } catch { /* keep */ }
      const gp = new O.GProp_GProps();
      try { O.BRepGProp.LinearProperties(e.wrapped, gp, true, false); out.len = gp.Mass(); } finally { del(gp); }
    }
  } catch { /* keep partial info */ } finally { del(ad); }
  return out;
}

/** Cached plain-data topology of a solid: {faces:[...], edges:[...], bb}. */
export function topoOf(shape) {
  let t = TOPO.get(shape);
  if (t) return t;
  const faces = facesOf(shape), edges = edgesOf(shape);
  try {
    const byHash = new Map();
    edges.forEach((e, i) => { const h = e.hashCode; const l = byHash.get(h); if (l) l.push(i); else byHash.set(h, [i]); });
    const adj = edges.map(() => []);
    const O = OC();
    const SE = O.TopAbs_ShapeEnum;
    const F = faces.map((f, fi) => {
      const info = faceGeom(f);
      // edge -> face adjacency straight from the explorer (no wrappers)
      const ex = new O.TopExp_Explorer(f.wrapped, SE.TopAbs_EDGE, SE.TopAbs_SHAPE);
      try {
        while (ex.More()) {
          const it = ex.Current();
          const l = byHash.get(O.ReplicadShapeHasher.HashCode(it, R.HASH_CODE_MAX)) || [];
          const i = l.length === 1 ? l[0] : l.find((k) => edges[k].wrapped.IsSame(it));
          if (i !== undefined && !adj[i].includes(fi)) adj[i].push(fi);
          it.delete();
          ex.Next();
        }
      } finally { ex.delete(); }
      return info;
    });
    const E = edges.map((e, i) => {
      const g = edgeGeom(e);
      g.faces = adj[i];
      // normals of the adjacent faces along the edge: planar faces only (curved neighbours are
      // matched by surface type; their normal along the edge would need slow pcurve evaluations)
      g.fn = adj[i].map((fi) => (F[fi].type === "PLANE" ? F[fi].n : null));
      return g;
    });
    t = { faces: F, edges: E, bb: bboxOf(shape) || { min: [0, 0, 0], max: [0, 0, 0] } };
  } finally {
    del(faces, edges);
  }
  TOPO.set(shape, t);
  return t;
}

const r6 = (x) => Math.round(x * 1e6) / 1e6 + 0; // (+0 turns -0 into 0)
const r6v = (v) => v.map(r6);
export { r6v as roundVec };
/** Direction with a canonical sign (first significant component positive). */
function canon(d) {
  for (const c of d) { if (Math.abs(c) > 1e-9) return c < 0 ? V.mul(d, -1) : d; }
  return d;
}
function relPos(bb, p) {
  return [0, 1, 2].map((i) => {
    const w = bb.max[i] - bb.min[i];
    return w > 1e-9 ? (p[i] - bb.min[i]) / w : 0.5;
  });
}
const diagOf = (bb) => Math.max(1e-6, V.len(V.sub(bb.max, bb.min)));

/** Geometric signature of edge `index` of `shape` (plain JSON, stored on refs). */
export function edgeSignature(shape, index) {
  const T = topoOf(shape);
  const e = T.edges[index];
  if (!e) return null;
  const sig = { t: e.type, q: r6v(relPos(T.bb, e.m)), f: e.faces.map((fi, k) => (e.fn[k] ? { t: T.faces[fi].type, n: r6v(e.fn[k]) } : { t: T.faces[fi].type })) };
  if (e.type === "LINE") sig.d = r6v(canon(e.d));
  if (e.type === "CIRCLE" && e.a) { sig.a = r6v(canon(e.a)); sig.r = r6(e.r); }
  return sig;
}
/** Geometric signature of face `index` of `shape` (plain JSON, stored on refs). */
export function faceSignature(shape, index) {
  const T = topoOf(shape);
  const f = T.faces[index];
  if (!f) return null;
  const sig = { t: f.type, n: r6v(f.n), q: r6v(relPos(T.bb, f.c)) };
  if (f.a) sig.a = r6v(canon(f.a));
  if (f.r !== undefined) sig.r = r6(f.r);
  return sig;
}

function segDist(p, a, b) {
  const ab = V.sub(b, a);
  const L2 = V.dot(ab, ab);
  const t = L2 > 1e-24 ? Math.max(0, Math.min(1, V.dot(V.sub(p, a), ab) / L2)) : 0;
  return V.len(V.sub(p, V.add(a, V.mul(ab, t))));
}
/**
 * Distance estimate from p to an edge described by topoOf: {lb, est} where lb is a lower bound
 * (exact for segments and full circles) and est a cheap estimate used for scoring.
 */
function edgeDist(e, p) {
  const pts = Math.min(V.len(V.sub(p, e.s)), V.len(V.sub(p, e.m)), V.len(V.sub(p, e.t)));
  if (e.type === "LINE") { const d = segDist(p, e.s, e.t); return { lb: d, est: d, exact: true }; }
  if (e.type === "CIRCLE" && e.c && e.a) {
    const w = V.sub(p, e.c);
    const h = V.dot(w, e.a);
    const radial = V.len(V.sub(w, V.mul(e.a, h)));
    const full = Math.hypot(h, radial - e.r);
    const closed = V.len(V.sub(e.s, e.t)) < 1e-9;
    return { lb: full, est: closed ? full : Math.max(full, Math.min(pts, full + 0.25 * e.len)), exact: closed };
  }
  return { lb: 0, est: pts, exact: false };
}
/** Distance from p to the underlying surface of a face described by topoOf (a lower bound). */
function faceDistLB(f, p) {
  if (f.type === "PLANE" && f.d !== undefined) return Math.abs(V.dot(f.n, p) - f.d);
  if (f.type === "CYLINDRE" && f.a && f.ao) {
    const w = V.sub(p, f.ao);
    return Math.abs(V.len(V.sub(w, V.mul(f.a, V.dot(w, f.a)))) - f.r);
  }
  if (f.type === "SPHERE" && f.ao) return Math.abs(V.len(V.sub(p, f.ao)) - f.r);
  return 0;
}

function adjacencyMatches(T, e, sigF) {
  if (!Array.isArray(sigF) || sigF.length !== e.faces.length) return false;
  const used = new Set();
  for (const sf of sigF) {
    let hit = -1;
    for (let k = 0; k < e.faces.length; k++) {
      if (used.has(k)) continue;
      if (T.faces[e.faces[k]].type !== sf.t) continue;
      if (sf.n && e.fn[k] && V.dot(e.fn[k], sf.n) < 0.99) continue;
      hit = k;
      break;
    }
    if (hit < 0) return false;
    used.add(hit);
  }
  return true;
}
const qDist = (a, b) => (Array.isArray(a) && Array.isArray(b) ? V.len(V.sub(a, b)) : 0);
const ON = 1e-5; // "the remembered point still lies on it" (refs store points rounded to 1e-6)

/** Exact distances from p to the listed sub-shapes (index lists of shape.edges / shape.faces). */
function exactDistances(shape, kind, indices, p) {
  if (!indices.length) return [];
  const items = kind === "edge" ? edgesAt(shape, indices) : facesAt(shape, indices);
  const probe = pointProbe(p);
  try { return items.map((x) => probe.dist(x)); } finally { probe.delete(); del(items); }
}

/**
 * Best edge of `shape` for a signature and the remembered point p.
 *  tier 0: same curve type, direction/axis and adjacent faces (type + normal at the edge)
 *  tier 1: same type and direction;  tier 2: same type near its old relative position.
 * Within a tier: an edge that still contains p wins (geometry unchanged); otherwise the smallest
 * change of relative position in the body box plus a small movement term.
 * Returns {index, tier, dist} or null.
 */
export function matchEdge(shape, sig, p) {
  if (!sig || !sig.t) return null;
  const T = topoOf(shape);
  const diag = diagOf(T.bb);
  const tiers = [[], [], []];
  T.edges.forEach((e, i) => {
    if (e.type !== sig.t) return;
    let dirOk = true;
    if (sig.d && e.type === "LINE") dirOk = Math.abs(V.dot(e.d, sig.d)) > 0.999;
    else if (sig.a && e.type === "CIRCLE" && e.a) dirOk = Math.abs(V.dot(e.a, sig.a)) > 0.999;
    if (dirOk && adjacencyMatches(T, e, sig.f)) tiers[0].push(i);
    else if (dirOk) tiers[1].push(i);
    else tiers[2].push(i);
  });
  for (let tier = 0; tier < 3; tier++) {
    const list = tiers[tier];
    if (!list.length) continue;
    const dq = new Map(list.map((i) => [i, qDist(relPos(T.bb, T.edges[i].m), sig.q)]));
    if (p && tier < 2) {
      const near = [], check = [];
      for (const i of list) {
        const d = edgeDist(T.edges[i], p);
        if (d.lb > ON) continue;
        if (d.exact) near.push(i); else check.push(i);
      }
      exactDistances(shape, "edge", check, p).forEach((d, k) => { if (d < ON) near.push(check[k]); });
      if (near.length) {
        near.sort((a, b) => dq.get(a) - dq.get(b));
        return { index: near[0], tier, dist: 0 };
      }
    }
    let best = -1, bs = Infinity, bd = Infinity;
    for (const i of list) {
      const e = T.edges[i];
      if (tier === 2 && dq.get(i) > 0.25) continue;
      const dp = p ? edgeDist(e, p).est : 0;
      let s = dq.get(i) + (0.5 * dp) / diag;
      if (sig.r !== undefined && e.r !== undefined) s += (0.5 * Math.abs(e.r - sig.r)) / Math.max(sig.r, 1e-3);
      if (s < bs) { bs = s; best = i; bd = dp; }
    }
    if (best >= 0) return { index: best, tier, dist: bd };
  }
  return null;
}

/**
 * Best face of `shape` for a signature and the remembered point p.
 *  tier 0: same surface type and normal (planes) / axis (cylinders, cones);  tier 1: same type nearby.
 * Within a tier a face that still contains p wins, otherwise the smallest change of relative position.
 * Returns {index, tier, dist} or null.
 */
export function matchFace(shape, sig, p) {
  if (!sig || !sig.t) return null;
  const T = topoOf(shape);
  const diag = diagOf(T.bb);
  const tiers = [[], []];
  T.faces.forEach((f, i) => {
    if (f.type !== sig.t) return;
    let ok = true;
    if (f.type === "PLANE" && sig.n) ok = V.dot(f.n, sig.n) > 0.999;
    else if (sig.a && f.a) ok = Math.abs(V.dot(f.a, sig.a)) > 0.999;
    (ok ? tiers[0] : tiers[1]).push(i);
  });
  for (let tier = 0; tier < 2; tier++) {
    const list = tiers[tier];
    if (!list.length) continue;
    const dq = new Map(list.map((i) => [i, qDist(relPos(T.bb, T.faces[i].c), sig.q)]));
    if (p && tier === 0) {
      const check = list.filter((i) => faceDistLB(T.faces[i], p) <= ON);
      const near = [];
      exactDistances(shape, "face", check, p).forEach((d, k) => { if (d < ON) near.push(check[k]); });
      if (near.length) {
        near.sort((a, b) => dq.get(a) - dq.get(b));
        return { index: near[0], tier, dist: 0 };
      }
    }
    let best = -1, bs = Infinity, bd = Infinity;
    for (const i of list) {
      const f = T.faces[i];
      if (tier === 1 && dq.get(i) > 0.25) continue;
      const dp = p ? faceDistLB(f, p) : 0;
      let s = dq.get(i) + (0.5 * dp) / diag;
      if (sig.r !== undefined && f.r !== undefined) s += (0.5 * Math.abs(f.r - sig.r)) / Math.max(sig.r, 1e-3);
      if (s < bs) { bs = s; best = i; bd = dp; }
    }
    if (best >= 0) return { index: best, tier, dist: bd };
  }
  return null;
}
/** Index + exact distance of the edge nearest to p (legacy point refs). */
export function nearestEdgeIndex(shape, p) {
  const edges = edgesOf(shape);
  const probe = pointProbe(p);
  let best = -1, bd = Infinity;
  try {
    edges.forEach((e, i) => { const d = probe.dist(e); if (d < bd) { bd = d; best = i; } });
  } finally { probe.delete(); del(edges); }
  return best >= 0 ? { index: best, dist: bd } : null;
}

/**
 * Index of the face nearest to p (legacy point refs) with the old findFace normal preference.
 * anyOrientation: compare |dot| (sketch-plane refs may store the flipped normal).
 */
export function nearestFaceIndex(shape, p, n, anyOrientation = false) {
  const T = n ? topoOf(shape) : null;
  const faces = facesOf(shape);
  const probe = pointProbe(p);
  let best = -1, bs = Infinity, bd = Infinity;
  try {
    faces.forEach((f, i) => {
      const d = probe.dist(f);
      if (!Number.isFinite(d)) return;
      let s = d;
      if (n) {
        try {
          let dot = V.dot(faceNormalNear(T, f, i, p), n);
          if (anyOrientation) dot = Math.abs(dot);
          if (dot < 0.5) s += 1000 * (1 - dot);
          else s += 1e-6 * (1 - dot); // on a shared edge prefer the face whose normal matches
        } catch { /* non-planar ok */ }
      }
      if (s < bs) { bs = s; best = i; bd = d; }
    });
  } finally { probe.delete(); del(faces); }
  if (best < 0 || bs > 1e3) return null;
  return { index: best, dist: bd };
}

/** Closest point on face `index` of `shape` to p: {p, dist} or null. */
export function closestOnFace(shape, index, p) {
  const [f] = facesAt(shape, [index]);
  if (!f) return null;
  const probe = pointProbe(p);
  try {
    const d = probe.dist(f);
    return Number.isFinite(d) ? { p: probe.closest(), dist: d } : null;
  } finally { probe.delete(); del(f); }
}

/** Grow an edge set along tangent-continuous neighbours. */
export function tangentChain(shape, edges) {
  const T = topoOf(shape);
  const all = edgesOf(shape);
  const inSet = new Set();
  const out = [...edges];
  const queue = [];
  for (const e of edges) {
    const i = all.findIndex((x) => x.isSame(e));
    if (i >= 0 && !inSet.has(i)) { inSet.add(i); queue.push(i); }
  }
  const ends = (g) => [{ p: g.s, t: g.ts }, { p: g.t, t: g.tt }];
  for (let k = 0; k < queue.length && out.length < 200; k++) {
    const ei = ends(T.edges[queue[k]]);
    T.edges.forEach((g, j) => {
      if (inSet.has(j)) return;
      let tangent = false;
      for (const a of ei) for (const b of ends(g)) {
        if (V.len(V.sub(a.p, b.p)) < 1e-5 && Math.abs(V.dot(a.t, b.t)) > 0.9995) tangent = true;
      }
      if (tangent) { inSet.add(j); queue.push(j); out.push(all[j]); }
    });
  }
  const used = new Set(out);
  for (const e of all) if (!used.has(e)) del(e);
  return out;
}

// ---------- meshing ----------
export function meshBody(shape, size = 100) {
  const tol = Math.max(0.005, size * 0.0006);
  const m = shape.mesh({ tolerance: tol, angularTolerance: 8 });
  const em = shape.meshEdges({ tolerance: tol, angularTolerance: 8 });
  const faces = facesOf(shape);
  const fmap = new Map(faces.map((f, i) => [f.hashCode, i]));
  const edges = edgesOf(shape);
  const emap = new Map(edges.map((e, i) => [e.hashCode, i]));
  del(faces, edges);
  return {
    vertices: Float32Array.from(m.vertices),
    normals: Float32Array.from(m.normals),
    triangles: Uint32Array.from(m.triangles),
    faceGroups: m.faceGroups.map((g) => ({ start: g.start, count: g.count, face: fmap.get(g.faceId) ?? -1 })),
    lines: Float32Array.from(em.lines),
    edgeGroups: em.edgeGroups.map((g) => ({ start: g.start, count: g.count, edge: emap.get(g.edgeId) ?? -1 })),
  };
}

const BBOX = new WeakMap(); // shape -> bounds (replicad shapes are immutable)
export function bboxOf(shape) {
  if (!shape || typeof shape !== "object") return null;
  let b = BBOX.get(shape);
  if (!b) {
    let box = null;
    try {
      box = shape.boundingBox;
      b = box.bounds;
    } catch {
      return null;
    } finally { del(box); }
    BBOX.set(shape, b);
  }
  return { min: [...b[0]], max: [...b[1]] };
}

export function boxesOverlap(a, b, tol = 1e-4) {
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a.max[i] < b.min[i] - tol || b.max[i] < a.min[i] - tol) return false;
  return true;
}

export function isEmptyShape(s) {
  let ex = null;
  try {
    if (!s || s.isNull) return true;
    const O = OC();
    ex = new O.TopExp_Explorer(s.wrapped, O.TopAbs_ShapeEnum.TopAbs_FACE, O.TopAbs_ShapeEnum.TopAbs_SHAPE);
    return !ex.More();
  } catch {
    return true;
  } finally { del(ex); }
}

// ---------- hole tool ----------
export function holeTool(p, dir, h) {
  // dir: unit vector into the material; h: {diameter, depth, tip, tipAngle, type, cbD, cbDepth, csD, csAngle}
  dir = V.norm(dir);
  let u = V.cross(dir, [0, 0, 1]);
  if (V.len(u) < 1e-6) u = V.cross(dir, [1, 0, 0]);
  u = V.norm(u);
  const nrm = V.norm(V.cross(u, dir));
  const pl = { o: p, x: u, n: nrm };
  const r = h.diameter / 2;
  const e = 0.02;
  const pts = [[0, -e]];
  if (h.type === "counterbore") {
    const rc = Math.max(h.cbD / 2, r + 0.01);
    pts.push([rc, -e], [rc, h.cbDepth], [r, h.cbDepth]);
  } else if (h.type === "countersink") {
    const rs = Math.max(h.csD / 2, r + 0.01);
    const half = ((h.csAngle || 90) * Math.PI) / 360;
    const sinkDepth = (rs - r) / Math.tan(half);
    pts.push([rs + e * Math.tan(half), -e], [r, sinkDepth]);
  } else {
    pts.push([r, -e]);
  }
  pts.push([r, h.depth]);
  if (h.tip === "angle") {
    const half = ((h.tipAngle || 118) * Math.PI) / 360;
    pts.push([0, h.depth + r / Math.tan(half)]);
  } else {
    pts.push([0, h.depth]);
  }
  // the profile is built straight in 3D (replicad's 2D->3D sketch conversion leaks a few KB per call
  // and hole previews run on every drag step)
  const f = polygonFace(pts.map(([a, b]) => toWorld(pl, a, b)));
  try { return revolveFace(f, p, dir, 360); } finally { del(f); }
}

/** Planar face bounded by the closed polygon through 3D points (consecutive duplicates skipped). */
export function polygonFace(pts) {
  const O = OC();
  const P = pts.filter((q, i) => i === 0 || V.len(V.sub(q, pts[i - 1])) > 1e-9);
  if (P.length > 2 && V.len(V.sub(P[0], P[P.length - 1])) < 1e-9) P.pop();
  if (P.length < 3) throw new Error("Degenerate profile");
  const wb = new O.BRepBuilderAPI_MakeWire();
  let w = null, mf = null;
  try {
    for (let i = 0; i < P.length; i++) {
      const a = gpPnt(P[i]), b = gpPnt(P[(i + 1) % P.length]);
      const me = new O.BRepBuilderAPI_MakeEdge(a, b);
      const e = me.Edge();
      wb.Add(e);
      del(e, me, a, b);
    }
    wb.Build();
    w = wb.Wire();
    mf = new O.BRepBuilderAPI_MakeFace(w, false);
    if (!mf.IsDone()) throw new Error("Failed to build the profile face");
    return new R.Face(mf.Face());
  } finally { del(mf, w, wb); }
}

export function exportSTEPBlob(items) {
  return R.exportSTEP(items.map((b) => ({ shape: b.shape, name: b.name, color: b.color })));
}
