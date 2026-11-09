// B-rep <-> mesh for Tessellate (ParaMeshTessellateCommand) and Convert Mesh (ParaMeshConvertCommand).
// Uses the app's replicad / OpenCascade kernel (K) passed in by the caller.
import * as A from "./algo.js";

/** Refinement presets of Tessellate (relative to the body size): surface deviation, normal deviation (deg). */
export const REFINEMENT = { low: { dev: 0.002, ang: 20 }, medium: { dev: 0.0006, ang: 10 }, high: { dev: 0.00015, ang: 5 } };

/**
 * Triangulate an OCCT shape into a work mesh whose face groups are the B-rep faces.
 * opts: {dev (mm), ang (deg), maxEdge (mm, 0 = none)}.
 */
export function tessellate(K, shape, { dev, ang, maxEdge = 0 } = {}) {
  const bb = K.bboxOf(shape);
  const size = bb ? Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) : 100;
  const m = shape.mesh({ tolerance: Math.max(1e-4, dev || size * 0.0006), angularTolerance: Math.max(0.5, ang || 10) });
  const P = Array.from(m.vertices);
  const T = Array.from(m.triangles);
  const G = new Array(T.length / 3).fill(0);
  (m.faceGroups || []).forEach((g, i) => { for (let t = g.start / 3; t < (g.start + g.count) / 3; t++) G[t] = i; });
  const w = A.weldArrays(P, T, size * 1e-7);
  let W = { P: w.P, T: w.T, G: w.keep.map((t) => G[t]), hasGroups: true };
  if (maxEdge > 0) A.splitLongEdges(W, null, maxEdge, 800000);
  W = A.compact(W);
  if (A.volume(W) < 0 && A.analyze(W).closed) A.reverse(W);
  return W;
}

/**
 * OCCT shape from a work mesh: every triangle a planar face, sewn; a closed mesh becomes a solid (one per shell),
 * an open one a surface body. unify (Prismatic) merges coplanar neighbours into single planar faces.
 */
export function meshToBrep(K, W, { unify = false } = {}) {
  const R = K.R;
  const O = R.getOC();
  const bb = A.bbox(W);
  const size = bb.size || 1;
  const closed = A.analyze(W).closed;
  const sew = new O.BRepBuilderAPI_Sewing(Math.max(1e-6, size * 1e-7), true, true, true, false);
  let sewn = null, out = null;
  const tmp = [];
  try {
    let n = 0;
    for (let t = 0; t < A.tcount(W); t++) {
      const a = A.vtx(W, W.T[3 * t]), b = A.vtx(W, W.T[3 * t + 1]), c = A.vtx(W, W.T[3 * t + 2]);
      if (A.len(A.cross(A.sub(b, a), A.sub(c, a))) < size * size * 1e-14) continue;
      let f = null;
      try { f = K.polygonFace([a, b, c]); sew.Add(f.wrapped); n++; } catch { /* sliver */ } finally { K.del(f); }
    }
    if (!n) throw new Error("Cannot convert mesh body to solid or surface body.");
    sew.Perform();
    sewn = sew.SewedShape();
    let shape = sewn;
    if (closed) {
      const SE = O.TopAbs_ShapeEnum;
      const ex = new O.TopExp_Explorer(sewn, SE.TopAbs_SHELL, SE.TopAbs_SHAPE);
      const solids = [];
      try {
        for (; ex.More(); ex.Next()) {
          const sh = ex.Current();
          const ms = new O.BRepBuilderAPI_MakeSolid(O.TopoDS.Shell(sh));
          tmp.push(ms, sh);
          solids.push(ms.Solid());
        }
      } finally { ex.delete(); }
      if (solids.length === 1) shape = solids[0];
      else if (solids.length > 1) {
        const bld = new O.BRep_Builder();
        const comp = new O.TopoDS_Compound();
        bld.MakeCompound(comp);
        for (const s of solids) bld.Add(comp, s);
        tmp.push(bld);
        shape = comp;
      }
    }
    if (unify) {
      const uni = new O.ShapeUpgrade_UnifySameDomain(shape, true, true, false);
      uni.Build();
      tmp.push(uni);
      shape = uni.Shape();
    }
    out = R.cast(shape);
    if (closed) {
      try {
        if (K.volumeOf(out) < 0) { const flipped = R.cast(out.wrapped.Reversed()); K.del(out); out = flipped; }
      } catch { /* keep */ }
    }
    return out;
  } finally {
    for (const x of tmp) { try { x.delete(); } catch { /* ignore */ } }
    try { if (sewn) sewn.delete(); } catch { /* ignore */ }
    try { sew.delete(); } catch { /* ignore */ }
  }
}
