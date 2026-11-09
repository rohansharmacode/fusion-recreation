// OpenCascade helpers for the sketch commands that use body geometry (Intersect, Include 3D
// Geometry, Intersection Curve, Project to Surface, Isoparametric Curve, Spun Profile). They run on
// the shared kernel (app.K, app.K.R.getOC()) and delete every OCCT object they create.
import { ST } from "./ctx.js";

const K = () => ST.app.K;
const OC = () => ST.app.K.R.getOC();
const del = (...xs) => ST.app.K.del(...xs);
const V = () => ST.app.K.V;
const xyz = (p) => { const r = [p.X(), p.Y(), p.Z()]; p.delete(); return r; };

/** World point -> sketch-plane coordinates [u, v, w] (w along the normal). */
export function toPlane3(pl, p) {
  const k = K();
  const uv = k.toLocal(pl, p);
  return [uv[0], uv[1], k.V.dot(k.V.sub(p, pl.o), pl.n)];
}

/** Sample an edge (replicad Edge) as world points. */
export function sampleEdge(e, n = 0) {
  const O = OC();
  const ad = new O.BRepAdaptor_Curve(e.wrapped);
  try {
    const u0 = ad.FirstParameter(), u1 = ad.LastParameter();
    const type = e.geomType;
    const N = n || (type === "LINE" ? 1 : 48);
    const out = [];
    for (let i = 0; i <= N; i++) out.push(xyz(ad.Value(u0 + ((u1 - u0) * i) / N)));
    return out;
  } finally { del(ad); }
}

/** Edges of the section of a shape (replicad Shape) by an infinite plane. */
export function sectionByPlane(shape, pl) {
  const k = K(), O = OC();
  const bb = k.bboxOf(shape);
  const c = bb ? k.V.mul(k.V.add(bb.min, bb.max), 0.5) : pl.o;
  const half = bb ? Math.max(10, k.V.len(k.V.sub(bb.max, bb.min))) * 2 : 1000;
  const face = k.planeSquareFace(pl, c, half);
  let sec = null;
  try {
    sec = new O.BRepAlgoAPI_Section(shape.wrapped, face.wrapped, true);
    const res = sec.Shape();
    const out = [];
    const ex = new O.TopExp_Explorer(res, O.TopAbs_ShapeEnum.TopAbs_EDGE, O.TopAbs_ShapeEnum.TopAbs_SHAPE);
    try {
      while (ex.More()) { out.push(new k.R.Edge(O.TopoDS.Edge(ex.Current()))); ex.Next(); }
    } finally { del(ex, res); }
    return out;
  } finally { del(sec, face); }
}

/** Closest point of shape to p and the distance: {p, d} or null. */
export function closestOn(shape, p) {
  const probe = K().pointProbe(p);
  try {
    const d = probe.dist(shape);
    if (!Number.isFinite(d)) return null;
    const q = probe.closest();
    return q ? { p: q, d } : null;
  } finally { probe.delete(); }
}

/** Where the line p + t d meets shape (nearest to p): world point or null. */
export function rayHit(shape, p, d, L) {
  const R = K().R;
  const k = K();
  const a = k.V.sub(p, k.V.mul(d, L)), b = k.V.add(p, k.V.mul(d, L));
  let edge = null;
  try {
    edge = R.makeLine(a, b);
    const O = OC();
    const dd = new O.BRepExtrema_DistShapeShape();
    try {
      dd.LoadS1(edge.wrapped);
      dd.LoadS2(shape.wrapped);
      dd.Perform();
      if (!dd.IsDone() || dd.NbSolution() < 1 || dd.Value() > 1e-4) return null;
      let best = null;
      for (let i = 1; i <= dd.NbSolution(); i++) {
        const q = xyz(dd.PointOnShape2(i));
        const t = k.V.len(k.V.sub(q, p));
        if (!best || t < best.t) best = { q, t };
      }
      return best ? best.q : null;
    } finally { del(dd); }
  } catch { return null; } finally { del(edge); }
}

/** Isoparametric curves of a face: dir 'u'|'v', at surface parameter value(s); world polylines. */
export function isoCurves(face, dir, params, n = 64) {
  const O = OC();
  const ad = new O.BRepAdaptor_Surface(face.wrapped, true);
  const out = [];
  let surf = null;
  try {
    surf = O.BRep_Tool.Surface(face.wrapped);
    const u0 = ad.FirstUParameter(), u1 = ad.LastUParameter(), v0 = ad.FirstVParameter(), v1 = ad.LastVParameter();
    const probe = (p) => closestOn(face, p);
    for (const t of params) {
      const pts = [];
      let run = [];
      for (let i = 0; i <= n; i++) {
        const s = dir === "u" ? v0 + ((v1 - v0) * i) / n : u0 + ((u1 - u0) * i) / n;
        const p = dir === "u" ? xyz(ad.Value(t, s)) : xyz(ad.Value(s, t));
        // trimmed faces: keep the runs that lie on the face
        const c = probe(p);
        if (c && c.d < 1e-4) run.push(p);
        else if (run.length) { if (run.length > 1) pts.push(run); run = []; }
      }
      if (run.length > 1) pts.push(run);
      out.push(...pts);
    }
    return out;
  } finally { del(ad, surf); }
}
/** Surface parameters (u, v) of a world point on a face, and the face's parameter box. */
export function faceUV(face, p) {
  const O = OC();
  const ad = new O.BRepAdaptor_Surface(face.wrapped, true);
  let surf = null, gp = null, prj = null;
  try {
    surf = O.BRep_Tool.Surface(face.wrapped);
    gp = new O.gp_Pnt(p[0], p[1], p[2]);
    prj = new O.GeomAPI_ProjectPointOnSurf(gp, surf, O.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad);
    const box = [ad.FirstUParameter(), ad.LastUParameter(), ad.FirstVParameter(), ad.LastVParameter()];
    if (!prj.NbPoints()) return { u: (box[0] + box[1]) / 2, v: (box[2] + box[3]) / 2, box };
    const U = { current: 0 }, Vv = { current: 0 };
    try { prj.LowerDistanceParameters(U, Vv); } catch { /* binding may differ */ }
    let u = U.current, v = Vv.current;
    if (!Number.isFinite(u) || !Number.isFinite(v) || (u === 0 && v === 0)) {
      // fall back to a parameter search on the adaptor
      let best = null;
      for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) {
        const uu = box[0] + ((box[1] - box[0]) * i) / 24, vv = box[2] + ((box[3] - box[2]) * j) / 24;
        const q = xyz(ad.Value(uu, vv));
        const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        if (!best || d < best.d) best = { d, u: uu, v: vv };
      }
      u = best.u; v = best.v;
    }
    return { u, v, box };
  } finally { del(prj, gp, ad, surf); }
}

/**
 * Spun profile of shapes about an axis (o, a): the outline r(h) of the geometry revolved about the
 * axis. Points come from the body triangulation and sampled edges. Returns [[h, r]] sorted by h.
 */
export function spunEnvelope(shapes, o, a, tol = 0.1) {
  const k = K();
  const pts = [];
  for (const s of shapes) {
    try {
      const m = ST.app.viewport && ST.app.viewport.meshFor ? ST.app.viewport.meshFor(s) : k.meshBody(s);
      const v = m.vertices;
      for (let i = 0; i < v.length; i += 3) pts.push([v[i], v[i + 1], v[i + 2]]);
      const L = m.lines || [];
      for (let i = 0; i < L.length; i += 3) pts.push([L[i], L[i + 1], L[i + 2]]);
    } catch (e) { console.error(e); }
  }
  if (!pts.length) return [];
  const hr = pts.map((p) => {
    const d = k.V.sub(p, o);
    const h = k.V.dot(d, a);
    const r = k.V.len(k.V.sub(d, k.V.mul(a, h)));
    return [h, r];
  });
  let hmin = Infinity, hmax = -Infinity;
  for (const [h] of hr) { hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
  const span = hmax - hmin;
  if (!(span > 1e-9)) return [];
  const bins = Math.min(2000, Math.max(16, Math.ceil(span / Math.max(tol / 2, span / 2000))));
  const rmax = new Float64Array(bins + 1).fill(-1);
  const hAt = (i) => hmin + (span * i) / bins;
  for (const [h, r] of hr) { const i = Math.round(((h - hmin) / span) * bins); if (r > rmax[i]) rmax[i] = r; }
  // fill empty bins by interpolation
  const out = [];
  for (let i = 0; i <= bins; i++) if (rmax[i] >= 0) out.push([hAt(i), rmax[i]]);
  return simplify(out, tol);
}

/** Douglas-Peucker polyline simplification. */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const a = pts[i], b = pts[j];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-12;
    let best = -1, bd = 0;
    for (let k2 = i + 1; k2 < j; k2++) {
      const d = Math.abs((pts[k2][0] - a[0]) * dy - (pts[k2][1] - a[1]) * dx) / L;
      if (d > bd) { bd = d; best = k2; }
    }
    if (best >= 0 && bd > tol) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export { V, del };
