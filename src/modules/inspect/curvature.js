// Exact differential geometry for the INSPECT analyses, straight from the OpenCascade B-rep:
//   * per-vertex principal / Gaussian / mean curvature of every face (BRepAdaptor_Surface EvalD2 at the
//     triangulation's own UV nodes, so values line up 1:1 with the display mesh vertices)
//   * curvature samples along edges (BRepAdaptor_Curve EvalD2) and sketch curves (exact for lines / arcs /
//     circles, from the pcurve derivatives for splines / ellipses)
//   * U / V isocurves of faces, trimmed to the face domain with the face triangulation in UV space
//   * concave sharp edges (Minimum Radius "Sharp Edges")
// No three.js here: everything takes the replicad OC instance `O` and replicad shapes, so it also runs in Node.
//
// Sign convention: curvatures are "convexity" curvatures w.r.t. the outward normal of the solid
// (sphere of radius r: k1 = k2 = +1/r; the inside of a fillet / hole: negative).

const del = (...xs) => { for (const o of xs) { try { if (o && typeof o.delete === "function") o.delete(); } catch { /* ignore */ } } };
const vec = (v) => [v.X(), v.Y(), v.Z()];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function typeName(O, t) {
  const A = O.GeomAbs_SurfaceType;
  if (!A) return "other";
  if (t === A.GeomAbs_Plane) return "plane";
  if (t === A.GeomAbs_Cylinder) return "cylinder";
  if (t === A.GeomAbs_Sphere) return "sphere";
  if (t === A.GeomAbs_Cone) return "cone";
  if (t === A.GeomAbs_Torus) return "torus";
  return "other";
}

/** Evaluate S, Su, Sv, Suu, Svv, Suv at (u, v) and free the wasm objects. */
function evalD2(ad, u, v) {
  const r = ad.EvalD2(u, v);
  const out = { P: vec(r.Point), Su: vec(r.D1U), Sv: vec(r.D1V), Suu: vec(r.D2U), Svv: vec(r.D2V), Suv: vec(r.D2UV) };
  del(r.Point, r.D1U, r.D1V, r.D2U, r.D2V, r.D2UV);
  return out;
}

/**
 * Curvature at one surface point from first + second derivatives.
 * flip = -1 for REVERSED faces (outward normal = -(Su x Sv)).
 * -> {k1 (max), k2 (min), K (Gaussian), H (mean), n (outward unit normal)} | null
 */
export function curvatureFromDerivs(d, flip = 1) {
  const nRaw = cross(d.Su, d.Sv);
  const nl = len(nRaw);
  if (!(nl > 1e-12)) return null;
  const n = mul(nRaw, flip / nl);
  const E = dot(d.Su, d.Su), F = dot(d.Su, d.Sv), G = dot(d.Sv, d.Sv);
  const L = dot(d.Suu, n), M = dot(d.Suv, n), N = dot(d.Svv, n);
  const den = E * G - F * F;
  if (!(den > 1e-18)) return null;
  // second fundamental form taken w.r.t. the outward normal; convexity sign = -(normal curvature)
  const K = (L * N - M * M) / den;
  const H = -(E * N - 2 * F * M + G * L) / (2 * den);
  const disc = Math.sqrt(Math.max(0, H * H - K));
  return { k1: H + disc, k2: H - disc, K, H, n };
}

/** Face list in the same order as replicad's shape.faces (index = faceGroups[].face). */
function faceList(shape) { try { return shape.faces; } catch { return []; } }

function orientationFlip(O, face) {
  try { return face.wrapped.Orientation() === O.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1; } catch { return 1; }
}

/**
 * Triangulation of a meshed face in UV space: {uv: Float64Array (2 per node), tris: Int32Array (3 per tri, 0-based), n}
 * or null (face not meshed yet).
 */
export function faceUVMesh(O, face) {
  const loc = new O.TopLoc_Location();
  let tri = null;
  try {
    tri = O.BRep_Tool.Triangulation(face.wrapped, loc, 0);
    if (!tri || (typeof tri.IsNull === "function" && tri.IsNull())) return null;
    const n = tri.NbNodes();
    if (!n || !tri.HasUVNodes()) return null;
    const uv = new Float64Array(n * 2);
    for (let i = 1; i <= n; i++) { const p = tri.UVNode(i); uv[(i - 1) * 2] = p.X(); uv[(i - 1) * 2 + 1] = p.Y(); del(p); }
    const nt = tri.NbTriangles();
    const tris = new Int32Array(nt * 3);
    for (let i = 1; i <= nt; i++) {
      const t = tri.Triangle(i);
      const g = t.Get();
      tris[(i - 1) * 3] = g.theN1 - 1; tris[(i - 1) * 3 + 1] = g.theN2 - 1; tris[(i - 1) * 3 + 2] = g.theN3 - 1;
      del(t);
    }
    return { uv, tris, n };
  } catch {
    return null;
  } finally { del(tri, loc); }
}

/**
 * Per-vertex curvature of a body, aligned with a display mesh `md` (K.meshBody output):
 * -> {k1, k2, K, H: Float32Array(nVerts), faceType: string[] per face index, minConcave: number (mm, Infinity if none),
 *     maxAbs: max |k| (1/mm), gaussMax: max |K|}
 */
export function bodyCurvature(O, shape, md) {
  const nv = md.vertices.length / 3;
  const k1 = new Float32Array(nv), k2 = new Float32Array(nv), Ks = new Float32Array(nv), Hs = new Float32Array(nv);
  const faces = faceList(shape);
  const faceType = [];
  let minConcave = Infinity, maxAbs = 0, gaussMax = 0;
  const V = md.vertices, T = md.triangles;
  for (const g of md.faceGroups) {
    const face = faces[g.face];
    if (!face || g.count <= 0) continue;
    let lo = Infinity, hi = -1;
    for (let k = g.start; k < g.start + g.count; k++) { const t = T[k]; if (t < lo) lo = t; if (t > hi) hi = t; }
    if (hi < 0) continue;
    let ad = null, proj = null, surf = null;
    try {
      ad = new O.BRepAdaptor_Surface(face.wrapped, true);
      const type = typeName(O, ad.GetType());
      faceType[g.face] = type;
      if (type === "plane") continue; // all zero
      const flip = orientationFlip(O, face);
      const set = (i, c) => {
        k1[i] = c.k1; k2[i] = c.k2; Ks[i] = c.K; Hs[i] = c.H;
        const a = Math.max(Math.abs(c.k1), Math.abs(c.k2));
        if (a > maxAbs) maxAbs = a;
        if (Math.abs(c.K) > gaussMax) gaussMax = Math.abs(c.K);
        if (c.k2 < -1e-9) { const r = -1 / c.k2; if (r < minConcave) minConcave = r; }
      };
      // the triangulation's UV nodes map 1:1 onto the vertex range of this face group
      const um = faceUVMesh(O, face);
      let uvOf = null;
      if (um && um.n === hi - lo + 1) {
        const chk = (i) => {
          const r = ad.EvalD0(um.uv[i * 2], um.uv[i * 2 + 1]);
          const p = vec(r); del(r);
          const j = (lo + i) * 3;
          return Math.hypot(p[0] - V[j], p[1] - V[j + 1], p[2] - V[j + 2]) < 1e-3 * (1 + Math.abs(V[j]) + Math.abs(V[j + 1]) + Math.abs(V[j + 2]));
        };
        if (chk(0) && chk(um.n - 1) && chk(um.n >> 1)) uvOf = (vi) => [um.uv[(vi - lo) * 2], um.uv[(vi - lo) * 2 + 1]];
      }
      if (!uvOf) {
        // fall back to projecting each vertex onto the surface
        surf = O.BRep_Tool.Surface(face.wrapped);
        proj = new O.GeomAPI_ProjectPointOnSurf();
        uvOf = (vi) => {
          const p = new O.gp_Pnt(V[vi * 3], V[vi * 3 + 1], V[vi * 3 + 2]);
          try {
            proj.Init(p, surf, O.Extrema_ExtAlgo ? O.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad : 0);
            if (!proj.NbPoints()) return null;
            const r = proj.LowerDistanceParameters();
            return [r.U, r.V];
          } catch { return null; } finally { del(p); }
        };
      }
      const u0 = ad.FirstUParameter(), u1 = ad.LastUParameter(), v0 = ad.FirstVParameter(), v1 = ad.LastVParameter();
      const eps = 1e-5;
      const at = (u, v) => {
        let c = curvatureFromDerivs(evalD2(ad, u, v), flip);
        if (!c) {
          // degenerate point (pole of a sphere, apex of a cone): step a little into the domain
          const du = (Number.isFinite(u1 - u0) ? u1 - u0 : 1) * eps, dv = (Number.isFinite(v1 - v0) ? v1 - v0 : 1) * eps;
          c = curvatureFromDerivs(evalD2(ad, Math.min(u1, Math.max(u0, u + du)), Math.min(v1, Math.max(v0, v + (v > (v0 + v1) / 2 ? -dv : dv)))), flip);
        }
        return c;
      };
      if (type === "cylinder" || type === "sphere") {
        const f = uvOf(lo);
        const c = f ? at(f[0], f[1]) : null;
        if (c) for (let i = lo; i <= hi; i++) set(i, c);
      } else {
        for (let i = lo; i <= hi; i++) {
          const f = uvOf(i);
          if (!f) continue;
          const c = at(f[0], f[1]);
          if (c) set(i, c);
        }
      }
    } catch (e) {
      // leave this face at zero curvature (never break the display)
      if (typeof console !== "undefined") console.warn("[inspect] curvature failed on a face", e);
    } finally { del(ad, proj, surf); }
  }
  return { k1, k2, K: Ks, H: Hs, faceType, minConcave, maxAbs, gaussMax };
}

// ------------------------------------------------------------------ curves
function curveSampleFromDerivs(p, d1, d2) {
  const l = len(d1);
  if (!(l > 1e-12)) return { p, t: [1, 0, 0], k: 0, n: [0, 0, 0] };
  const c = cross(d1, d2);
  const k = len(c) / (l * l * l);
  const t = mul(d1, 1 / l);
  const nn = cross(c, d1);
  const n = k > 1e-9 && len(nn) > 1e-18 ? norm(nn) : [0, 0, 0]; // towards the centre of curvature
  return { p, t, k: k > 1e-9 ? k : 0, n };
}

/** count+1 evenly spaced curvature samples along an edge: [{p, t, k, n (unit, towards the centre)}]. */
export function edgeSamples(O, edge, count) {
  const out = [];
  let ad = null;
  try {
    ad = new O.BRepAdaptor_Curve(edge.wrapped);
    const a = ad.FirstParameter(), b = ad.LastParameter();
    const n = Math.max(1, count | 0);
    for (let i = 0; i <= n; i++) {
      const u = a + ((b - a) * i) / n;
      const r = ad.EvalD2(u);
      out.push(curveSampleFromDerivs(vec(r.Point), vec(r.D1), vec(r.D2)));
      del(r.Point, r.D1, r.D2);
    }
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[inspect] edge curvature failed", e);
  } finally { del(ad); }
  return out;
}

/**
 * Curvature samples of a parametric 2D curve on a plane (sketch curve).
 * geom: {at(t)->[x,y], der(t)->[x,y], T} ; plane {o, x, n}; toWorld([u,v]) -> [x,y,z]
 */
export function planarCurveSamples(geom, plane, count, toWorld) {
  const n = Math.max(1, count | 0);
  const out = [];
  const h = geom.T * 1e-4;
  const y = cross(plane.n, plane.x);
  const w = (v) => add(mul(plane.x, v[0]), mul(y, v[1]));
  for (let i = 0; i <= n; i++) {
    const t = (geom.T * i) / n;
    const p = geom.at(t);
    const d1 = geom.der(t);
    const ta = Math.max(0, t - h), tb = Math.min(geom.T, t + h);
    const da = geom.der(ta), db = geom.der(tb);
    const d2 = [(db[0] - da[0]) / (tb - ta || 1), (db[1] - da[1]) / (tb - ta || 1)];
    out.push(curveSampleFromDerivs(toWorld(p), w(d1), w(d2)));
  }
  return out;
}

// ------------------------------------------------------------------ isocurves
/**
 * Parameter intervals where the line {param[dir] = c} crosses the UV triangulation of a face.
 * dir 0: u = c (returns v intervals); dir 1: v = c (returns u intervals).
 */
export function isoIntervals(um, dir, c) {
  const segs = [];
  const { uv, tris } = um;
  const a = dir, b = 1 - dir;
  for (let t = 0; t < tris.length; t += 3) {
    const P = [tris[t], tris[t + 1], tris[t + 2]].map((i) => [uv[i * 2], uv[i * 2 + 1]]);
    const hits = [];
    for (let e = 0; e < 3; e++) {
      const p = P[e], q = P[(e + 1) % 3];
      const da = p[a] - c, db = q[a] - c;
      if ((da <= 0 && db > 0) || (da > 0 && db <= 0)) {
        const s = da / (da - db);
        hits.push(p[b] + (q[b] - p[b]) * s);
      }
    }
    if (hits.length >= 2) segs.push([Math.min(...hits), Math.max(...hits)]);
  }
  if (!segs.length) return [];
  segs.sort((x, y) => x[0] - y[0]);
  const out = [segs[0].slice()];
  for (let i = 1; i < segs.length; i++) {
    const last = out[out.length - 1];
    const tol = 1e-9 * (1 + Math.abs(last[1]));
    if (segs[i][0] <= last[1] + tol) last[1] = Math.max(last[1], segs[i][1]);
    else out.push(segs[i].slice());
  }
  return out;
}

/**
 * U / V isocurves of a face trimmed to its domain.
 * opts: {count (per direction), dirs: 'uv'|'u'|'v', combs: bool, density, samples}
 * -> [{dir:'u'|'v', pts:[[x,y,z]...], combs?:[{p, t, k, n}]}]
 */
export function faceIsoCurves(O, face, opts = {}) {
  const out = [];
  const um = faceUVMesh(O, face);
  if (!um) return out;
  let ad = null;
  try {
    ad = new O.BRepAdaptor_Surface(face.wrapped, true);
    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    for (let i = 0; i < um.n; i++) {
      const u = um.uv[i * 2], v = um.uv[i * 2 + 1];
      if (u < umin) umin = u;
      if (u > umax) umax = u;
      if (v < vmin) vmin = v;
      if (v > vmax) vmax = v;
    }
    const count = Math.max(1, opts.count | 0);
    const dirs = opts.dirs === "u" ? [0] : opts.dirs === "v" ? [1] : [0, 1];
    const steps = Math.max(8, opts.samples || 48);
    for (const dir of dirs) {
      const lo = dir === 0 ? umin : vmin, hi = dir === 0 ? umax : vmax;
      const olo = dir === 0 ? vmin : umin, ohi = dir === 0 ? vmax : umax;
      if (!(hi > lo) || !(ohi > olo)) continue;
      for (let k = 1; k <= count; k++) {
        const c = lo + ((hi - lo) * k) / (count + 1);
        for (const [s0, s1] of isoIntervals(um, dir, c)) {
          if (!(s1 > s0)) continue;
          const n = Math.max(2, Math.ceil((steps * (s1 - s0)) / (ohi - olo)));
          const pts = [];
          for (let i = 0; i <= n; i++) {
            const s = s0 + ((s1 - s0) * i) / n;
            const r = dir === 0 ? ad.EvalD0(c, s) : ad.EvalD0(s, c);
            pts.push(vec(r)); del(r);
          }
          const item = { dir: dir === 0 ? "u" : "v", pts };
          if (opts.combs) {
            const m = Math.max(2, (opts.density | 0) || 50);
            const combs = [];
            for (let i = 0; i <= m; i++) {
              const s = s0 + ((s1 - s0) * i) / m;
              const d = dir === 0 ? evalD2(ad, c, s) : evalD2(ad, s, c);
              // along u = c the curve parameter is v: C' = Sv, C'' = Svv (and the other way round)
              combs.push(dir === 0 ? curveSampleFromDerivs(d.P, d.Sv, d.Svv) : curveSampleFromDerivs(d.P, d.Su, d.Suu));
            }
            item.combs = combs;
          }
          out.push(item);
        }
      }
    }
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[inspect] isocurves failed", e);
  } finally { del(ad); }
  return out;
}

// ------------------------------------------------------------------ sharp concave edges
/**
 * Indices of the edges where two faces meet at a sharp (non-tangent) CONCAVE angle: no cutter radius
 * can reach into them. md (display mesh) supplies a point inside each face next to the edge.
 */
export function concaveSharpEdges(O, shape, md) {
  const out = [];
  let faces, edges;
  try { faces = shape.faces; edges = shape.edges; } catch { return out; }
  const edgeFaces = new Map();
  faces.forEach((f, fi) => {
    try { for (const e of f.edges) { const h = e.hashCode; const a = edgeFaces.get(h); if (!a) edgeFaces.set(h, [fi]); else if (!a.includes(fi)) a.push(fi); } } catch { /* ignore */ }
  });
  const groupOf = new Map(md.faceGroups.map((g) => [g.face, g]));
  const V = md.vertices, T = md.triangles;
  // centroid of the triangle of face fi nearest to p
  const nearCentroid = (fi, p) => {
    const g = groupOf.get(fi);
    if (!g) return null;
    let best = null, bd = Infinity;
    for (let k = g.start; k < g.start + g.count; k += 3) {
      const a = T[k] * 3, b = T[k + 1] * 3, c = T[k + 2] * 3;
      const q = [(V[a] + V[b] + V[c]) / 3, (V[a + 1] + V[b + 1] + V[c + 1]) / 3, (V[a + 2] + V[b + 2] + V[c + 2]) / 3];
      const d = len(sub(q, p));
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  };
  edges.forEach((e, i) => {
    const fl = edgeFaces.get(e.hashCode) || [];
    if (fl.length !== 2) return;
    try {
      const pm = e.pointAt(0.5);
      const p = [pm.x, pm.y, pm.z];
      const n1 = faces[fl[0]].normalAt(pm), n2 = faces[fl[1]].normalAt(pm);
      const a = norm([n1.x, n1.y, n1.z]), b = norm([n2.x, n2.y, n2.z]);
      if (dot(a, b) > 0.996) return; // tangent: not sharp
      const q2 = nearCentroid(fl[1], p), q1 = nearCentroid(fl[0], p);
      if (!q1 || !q2) return;
      // concave when each face rises above the other's tangent plane
      const s = dot(a, sub(q2, p)) + dot(b, sub(q1, p));
      if (s > 1e-9) out.push(i);
    } catch { /* skip */ }
  });
  return out;
}
