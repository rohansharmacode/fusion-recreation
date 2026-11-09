// T-spline cage -> B-rep body (Convert / Finish Form).
// Every cage quad (or every corner quad of another polygon) becomes one bicubic B-spline face that interpolates
// a grid of limit-surface points (clamped cubic interpolation with uniform parameters, done here in JS, so the
// boundary curve of a patch depends on its boundary points only: neighbouring patches share their boundary
// curves exactly). The faces are sewn; a closed result becomes a solid. Faceted fallback: the subdivided
// triangles sewn into a polyhedral body.
import { subdivide, displayMesh } from "./subdiv.js";

// ---------------------------------------------------------------- 1D clamped cubic interpolation
const SOLVERS = new Map();
function basisAt(U, i, t) {
  // Cox-de Boor, degree 3 (t strictly inside the knot range)
  const N = (j, p) => {
    if (p === 0) return U[j] <= t && t < U[j + 1] ? 1 : 0;
    let a = 0, b = 0;
    const d1 = U[j + p] - U[j], d2 = U[j + p + 1] - U[j + 1];
    if (d1 > 0) a = ((t - U[j]) / d1) * N(j, p - 1);
    if (d2 > 0) b = ((U[j + p + 1] - t) / d2) * N(j + 1, p - 1);
    return a + b;
  };
  return N(i, 3);
}
/** Solver for m+1 uniform samples -> m+3 poles (end tangents from second-order differences). */
function solverFor(m) {
  if (SOLVERS.has(m)) return SOLVERS.get(m);
  const n = m + 3;
  const U = [0, 0, 0, 0];
  for (let k = 1; k < m; k++) U.push(k);
  U.push(m, m, m, m);
  const A = Array.from({ length: n }, () => new Float64Array(n));
  A[0][0] = 1;
  A[1][0] = -1; A[1][1] = 1;
  for (let k = 1; k < m; k++) for (let i = 0; i < n; i++) A[k + 1][i] = basisAt(U, i, k);
  A[n - 2][n - 2] = -1; A[n - 2][n - 1] = 1;
  A[n - 1][n - 1] = 1;
  // LU with partial pivoting
  const piv = new Int32Array(n).map((_, i) => i);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [piv[c], piv[p]] = [piv[p], piv[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      A[r][c] = f;
      for (let k = c + 1; k < n; k++) A[r][k] -= f * A[c][k];
    }
  }
  const solve = (rhs) => {
    const b = Array.from(piv, (pi) => rhs[pi]);
    for (let r = 0; r < n; r++) for (let k = 0; k < r; k++) b[r] -= A[r][k] * b[k];
    for (let r = n - 1; r >= 0; r--) { for (let k = r + 1; k < n; k++) b[r] -= A[r][k] * b[k]; b[r] /= A[r][r]; }
    return b;
  };
  const s = { n, U, solve };
  SOLVERS.set(m, s);
  return s;
}
/** Poles of the clamped cubic interpolating Q[0..m] (array of [x,y,z]). */
export function interpCurve(Q) {
  const m = Q.length - 1;
  const S = solverFor(m);
  const D0 = m >= 2 ? Q[0].map((_, c) => (-3 * Q[0][c] + 4 * Q[1][c] - Q[2][c]) / 2) : Q[0].map((_, c) => Q[1][c] - Q[0][c]);
  const Dm = m >= 2 ? Q[0].map((_, c) => (3 * Q[m][c] - 4 * Q[m - 1][c] + Q[m - 2][c]) / 2) : Q[0].map((_, c) => Q[m][c] - Q[m - 1][c]);
  const out = Array.from({ length: S.n }, () => [0, 0, 0]);
  for (let c = 0; c < 3; c++) {
    const rhs = new Array(S.n).fill(0);
    rhs[0] = Q[0][c]; rhs[1] = D0[c] / 3;
    for (let k = 1; k < m; k++) rhs[k + 1] = Q[k][c];
    rhs[S.n - 2] = Dm[c] / 3; rhs[S.n - 1] = Q[m][c];
    const x = S.solve(rhs);
    for (let i = 0; i < S.n; i++) out[i][c] = x[i];
  }
  return out;
}
/** Tensor-product interpolation of a (m+1) x (m+1) grid G[i][j] -> poles[i][j] (n x n). */
export function interpGrid(G) {
  const m = G.length - 1;
  const rowsU = [];
  for (let j = 0; j <= m; j++) rowsU.push(interpCurve(G.map((col) => col[j])));
  const n = m + 3;
  const P = [];
  for (let i = 0; i < n; i++) P.push(interpCurve(rowsU.map((r) => r[i])));
  return P; // P[i][j]
}

// ---------------------------------------------------------------- OCCT
const CACHE = new Map();
const keyOf = (c, L) => JSON.stringify([c.v, c.f, c.crease || [], c.cv || [], L]);

function patchFace(O, P) {
  const n = P.length, m = n - 3;
  const poles = new O.NCollection_Array2_gp_Pnt(1, n, 1, n);
  const kn = new O.NCollection_Array1_double(1, m + 1), mu = new O.NCollection_Array1_int(1, m + 1);
  const tmp = [poles, kn, mu];
  try {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const p = new O.gp_Pnt(P[i][j][0], P[i][j][1], P[i][j][2]); poles.SetValue(i + 1, j + 1, p); p.delete(); }
    for (let k = 0; k <= m; k++) { kn.SetValue(k + 1, k); mu.SetValue(k + 1, k === 0 || k === m ? 4 : 1); }
    const bs = new O.Geom_BSplineSurface(poles, kn, kn, mu, mu, 3, 3, false, false);
    tmp.push(bs);
    const mf = new O.BRepBuilderAPI_MakeFace(bs, 1e-7);
    tmp.push(mf);
    if (!mf.IsDone()) throw new Error("patch face failed");
    return mf.Face();
  } finally { for (const x of tmp) { try { x.delete(); } catch { /* ignore */ } } }
}

function sewFaces(K, faces, size) {
  const O = K.R.getOC();
  const tol = Math.max(1e-5, size * 2e-5);
  const sew = new O.BRepBuilderAPI_Sewing(tol, true, true, true, false);
  const tmp = [sew];
  try {
    for (const f of faces) { sew.Add(f); }
    sew.Perform();
    const sewn = sew.SewedShape();
    tmp.push(sewn);
    const SE = O.TopAbs_ShapeEnum;
    const shells = [];
    const ex = new O.TopExp_Explorer(sewn, SE.TopAbs_SHELL, SE.TopAbs_SHAPE);
    try { while (ex.More()) { shells.push(ex.Current()); ex.Next(); } } finally { ex.delete(); }
    const free = typeof sew.NbFreeEdges === "function" ? sew.NbFreeEdges() : -1;
    const out = [];
    if (shells.length && free === 0) {
      for (const sh of shells) {
        let ms = null;
        try {
          ms = new O.BRepBuilderAPI_MakeSolid(O.TopoDS.Shell(sh));
          const solidRaw = ms.Solid();
          let s = K.R.cast(solidRaw);
          try { solidRaw.delete(); } catch { /* ignore */ }
          if (K.volumeOf(s) < 0) { const rr = s.wrapped.Reversed(); const s2 = K.R.cast(rr); try { rr.delete(); } catch { /* ignore */ } s = s2; }
          out.push(s);
        } finally { if (ms) ms.delete(); try { sh.delete(); } catch { /* ignore */ } }
      }
    } else {
      for (const sh of shells) out.push(K.R.cast(sh));
      if (!shells.length) out.push(K.R.cast(sewn));
    }
    if (out.length === 1) return K.singleSolid ? K.singleSolid(out[0]) : out[0];
    return K.R.makeCompound(out);
  } finally { for (const x of tmp) { try { x.delete(); } catch { /* ignore */ } } }
}

/**
 * Convert a cage into an OCCT shape: {shape, faceted, ms}. Cached by geometry (callers must not delete it).
 * opts.level: subdivision level of the sample grids (default 3, 2 for big cages).
 */
export function cageToShape(K, cage, opts = {}) {
  const L = opts.level || (cage.f.length > 300 ? 2 : 3);
  const key = keyOf(cage, L);
  if (CACHE.has(key)) { const hit = CACHE.get(key); CACHE.delete(key); CACHE.set(key, hit); return hit; }
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const sub = subdivide(cage, L, { track: true });
  let size = 1;
  {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < sub.P.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], sub.P[i + c]); hi[c] = Math.max(hi[c], sub.P[i + c]); }
    size = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  }
  const O = K.R.getOC();
  let res = null;
  const faces = [];
  try {
    for (const g of sub.grids) {
      const n = g.n;
      const G = [];
      for (let i = 0; i < n; i++) { G.push([]); for (let j = 0; j < n; j++) { const v = g.G[i * n + j]; G[i].push([sub.P[3 * v], sub.P[3 * v + 1], sub.P[3 * v + 2]]); } }
      faces.push(patchFace(O, interpGrid(G)));
    }
    const shape = sewFaces(K, faces, size);
    if (!shape || (K.isEmptyShape && K.isEmptyShape(shape))) throw new Error("empty");
    res = { shape, faceted: false };
  } catch (e) {
    void e;
    res = null;
  } finally { for (const f of faces) { try { f.delete(); } catch { /* ignore */ } } }
  if (!res) res = { shape: faceted(K, cage, size), faceted: true };
  res.ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  CACHE.set(key, res);
  while (CACHE.size > 24) CACHE.delete(CACHE.keys().next().value);
  return res;
}

/** Polyhedral fallback: subdivided triangles sewn into a body. */
export function faceted(K, cage, size) {
  const sub = subdivide(cage, cage.f.length > 200 ? 1 : 2);
  const m = displayMesh(sub, cage.f.length);
  const P = m.positions, I = m.indices;
  const faces = [];
  try {
    for (let t = 0; t < I.length; t += 3) {
      const tri = [I[t], I[t + 1], I[t + 2]].map((i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
      try { const f = K.polygonFace(tri); faces.push(f.wrapped); } catch { /* sliver */ }
    }
    return sewFaces(K, faces, size);
  } finally { for (const f of faces) { try { f.delete(); } catch { /* ignore */ } } }
}
