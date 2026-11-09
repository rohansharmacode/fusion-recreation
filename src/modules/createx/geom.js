// createx: shared geometry helpers (frames, rigid transforms, body points / triangles, 2D hull,
// minimal rectangle / circle, path sampling with rotation-minimising frames).
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import * as MD from "../../meshdata.js";
import * as C from "../../sketch/curves.js";

export const V = K.V;

// ---------------------------------------------------------------- 3x3 frames
// A frame is {o, x, y, z} (orthonormal, right-handed). Rotations are 3x3 row-major arrays [9].
export function orthoFrame(o, z, xHint) {
  const Z = V.norm(z);
  let X = xHint ? V.sub(xHint, V.mul(Z, V.dot(xHint, Z))) : null;
  if (!X || V.len(X) < 1e-9) X = Math.abs(Z[2]) > 0.9 ? [1, 0, 0] : V.cross([0, 0, 1], Z);
  X = V.norm(V.sub(X, V.mul(Z, V.dot(X, Z))));
  const Y = V.cross(Z, X);
  return { o: [...o], x: X, y: Y, z: Z };
}
export const WORLD = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
export const toFrame = (F, p) => { const d = V.sub(p, F.o); return [V.dot(d, F.x), V.dot(d, F.y), V.dot(d, F.z)]; };
export const fromFrame = (F, q) => V.add(F.o, V.add(V.mul(F.x, q[0]), V.add(V.mul(F.y, q[1]), V.mul(F.z, q[2]))));

/** Rotation taking frame A's axes onto frame B's axes (row-major 3x3). */
export function frameRotation(A, B) {
  const R = new Array(9).fill(0);
  const a = [A.x, A.y, A.z], b = [B.x, B.y, B.z];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += b[k][i] * a[k][j];
    R[3 * i + j] = s;
  }
  return R;
}
export const rotApply = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];

/** Axis-angle (degrees) of a rotation matrix; angle 0 for the identity. */
export function axisAngle(R) {
  const c = Math.max(-1, Math.min(1, (R[0] + R[4] + R[8] - 1) / 2));
  const ang = Math.acos(c);
  if (ang < 1e-9) return { axis: [0, 0, 1], deg: 0 };
  let ax = [R[7] - R[5], R[2] - R[6], R[3] - R[1]];
  if (V.len(ax) < 1e-6) {
    // 180 deg: axis from the diagonal
    const xx = Math.sqrt(Math.max(0, (R[0] + 1) / 2)), yy = Math.sqrt(Math.max(0, (R[4] + 1) / 2)), zz = Math.sqrt(Math.max(0, (R[8] + 1) / 2));
    ax = xx >= yy && xx >= zz ? [xx, R[1] / (2 * xx), R[2] / (2 * xx)] : yy >= zz ? [R[1] / (2 * yy), yy, R[5] / (2 * yy)] : [R[2] / (2 * zz), R[5] / (2 * zz), zz];
  }
  return { axis: V.norm(ax), deg: (ang * 180) / Math.PI };
}

/** Rigid transform {R, pivot, t}: p -> pivot + R (p - pivot) + t. */
export const rigidPoint = (T, p) => V.add(V.add(T.pivot, rotApply(T.R, V.sub(p, T.pivot))), T.t);
export function rigidShape(T, s) {
  const { axis, deg } = axisAngle(T.R);
  let r = s;
  if (Math.abs(deg) > 1e-9) r = K.rotated(s, deg, T.pivot, axis);
  if (V.len(T.t) > 1e-12) { const n = K.translated(r, T.t); if (r !== s) K.del(r); r = n; }
  if (r === s) r = K.translated(s, [0, 0, 0]);
  return r;
}
export function rigidMatrix(T) {
  const R = T.R, c = V.add(V.sub(T.pivot, rotApply(R, T.pivot)), T.t);
  return [R[0], R[1], R[2], c[0], R[3], R[4], R[5], c[1], R[6], R[7], R[8], c[2]];
}
export const rigidMesh = (T, mesh) => MD.transformBy(mesh, rigidMatrix(T));

// ---------------------------------------------------------------- body samples
const TRI_CACHE = new WeakMap(); // shape | mesh -> {positions, indices, faceOf, bb}

/** Triangles of any body: {positions Float32Array, indices Uint32Array, faceOf Int32Array|null, bb}. */
export function bodyTriangles(st, id) {
  const b = st.bodies && st.bodies.get(id);
  const key = b ? b.shape : st.meshBodies && st.meshBodies.get(id) && st.meshBodies.get(id).mesh;
  if (!key) return null;
  let t = TRI_CACHE.get(key);
  if (t) return t;
  if (b) {
    const bb = K.bboxOf(b.shape);
    const size = bb ? V.len(V.sub(bb.max, bb.min)) : 100;
    const m = K.meshBody(b.shape, Math.max(1, size) * 0.5);
    const nTri = m.triangles.length / 3;
    const faceOf = new Int32Array(nTri).fill(-1);
    const total = m.faceGroups.reduce((s, g) => s + g.count, 0);
    const unit = total === m.triangles.length ? 3 : 1; // replicad groups count indices
    for (const g of m.faceGroups) for (let k = 0; k < g.count / unit; k++) faceOf[g.start / unit + k] = g.face;
    t = { positions: m.vertices, indices: m.triangles, faceOf, bb };
  } else {
    const mesh = key;
    const indices = mesh.indices || Uint32Array.from({ length: mesh.positions.length / 3 }, (_, i) => i);
    t = { positions: mesh.positions, indices, faceOf: null, bb: MD.bbox(mesh) };
  }
  TRI_CACHE.set(key, t);
  return t;
}

/** Sample points of a body (triangulation vertices), as an array of [x,y,z]. */
export function bodyPoints(st, id) {
  const t = bodyTriangles(st, id);
  if (!t) return [];
  const out = [];
  const P = t.positions;
  for (let i = 0; i < P.length; i += 3) out.push([P[i], P[i + 1], P[i + 2]]);
  return out;
}

// ---------------------------------------------------------------- 2D hull / rectangle / circle
export function hull2(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
/** Minimum-area enclosing rectangle of 2D points: {angle (rad of its first side), area}. */
export function minAreaRect(pts) {
  const H = hull2(pts);
  let best = { angle: 0, area: Infinity };
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(ang), s = Math.sin(ang);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of H) { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const area = (u1 - u0) * (v1 - v0);
    if (area < best.area - 1e-9) best = { angle: ang, area };
  }
  return best;
}
/** Smallest enclosing circle of 2D points (Welzl, iterative): {c:[x,y], r}. */
export function minCircle(pts0) {
  const pts = hull2(pts0);
  if (!pts.length) return { c: [0, 0], r: 0 };
  // deterministic shuffle
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  const inC = (c, p) => Math.hypot(p[0] - c.c[0], p[1] - c.c[1]) <= c.r * (1 + 1e-12) + 1e-9;
  const two = (a, b) => ({ c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r: Math.hypot(a[0] - b[0], a[1] - b[1]) / 2 });
  const three = (a, b, c) => {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < 1e-12) { const l = [two(a, b), two(a, c), two(b, c)]; return l.sort((x, y) => y.r - x.r)[0]; }
    const A = a[0] ** 2 + a[1] ** 2, B = b[0] ** 2 + b[1] ** 2, Cc = c[0] ** 2 + c[1] ** 2;
    const ux = (A * (b[1] - c[1]) + B * (c[1] - a[1]) + Cc * (a[1] - b[1])) / d, uy = (A * (c[0] - b[0]) + B * (a[0] - c[0]) + Cc * (b[0] - a[0])) / d;
    return { c: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) };
  };
  let c = { c: [...pts[0]], r: 0 };
  for (let i = 1; i < pts.length; i++) {
    if (inC(c, pts[i])) continue;
    c = { c: [...pts[i]], r: 0 };
    for (let j = 0; j < i; j++) {
      if (inC(c, pts[j])) continue;
      c = two(pts[i], pts[j]);
      for (let k = 0; k < j; k++) if (!inC(c, pts[k])) c = three(pts[i], pts[j], pts[k]);
    }
  }
  return c;
}

/** Principal axes of a point cloud (columns of the covariance eigenvectors, Jacobi). */
export function principalAxes(pts) {
  const n = pts.length || 1;
  const m = [0, 0, 0];
  for (const p of pts) { m[0] += p[0] / n; m[1] += p[1] / n; m[2] += p[2] / n; }
  const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pts) { const d = V.sub(p, m); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[3 * i + j] += d[i] * d[j]; }
  const E = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = 0;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = A[3 * p + q];
      off += Math.abs(apq);
      if (Math.abs(apq) < 1e-12) continue;
      const th = (A[3 * q + q] - A[3 * p + p]) / (2 * apq);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = A[3 * k + p], akq = A[3 * k + q]; A[3 * k + p] = c * akp - s * akq; A[3 * k + q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = A[3 * p + k], aqk = A[3 * q + k]; A[3 * p + k] = c * apk - s * aqk; A[3 * q + k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const ekp = E[3 * k + p], ekq = E[3 * k + q]; E[3 * k + p] = c * ekp - s * ekq; E[3 * k + q] = s * ekp + c * ekq; }
    }
    if (off < 1e-10) break;
  }
  return [0, 1, 2].map((j) => V.norm([E[j], E[3 + j], E[6 + j]]));
}

// ---------------------------------------------------------------- paths
/** World polyline of one sketch curve ({sketch, curve}) in its own direction, or null. */
function sketchCurvePts(st, ref) {
  const s = st.sketches.get(ref.sketch);
  const cv = s && s.sk.curves[ref.curve];
  if (!cv) return null;
  const P = s.sk.points, W = (x, y) => K.toWorld(s.plane, x, y);
  const up = s.plane.n;
  if (cv.type === "line") return { pts: [W(P[cv.p1].x, P[cv.p1].y), W(P[cv.p2].x, P[cv.p2].y)], up };
  if (cv.type === "arc" || cv.type === "circle") {
    const c = P[cv.c];
    let a0 = 0, sweep = 2 * Math.PI, r = cv.r;
    if (cv.type === "arc") {
      const a = P[cv.p1], b = P[cv.p2];
      r = Math.hypot(a.x - c.x, a.y - c.y);
      a0 = Math.atan2(a.y - c.y, a.x - c.x);
      let a1 = Math.atan2(b.y - c.y, b.x - c.x);
      while (a1 <= a0 + 1e-12) a1 += 2 * Math.PI;
      sweep = a1 - a0;
    }
    const n = Math.max(8, Math.ceil((sweep / (2 * Math.PI)) * 96));
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = a0 + (sweep * i) / n; pts.push(W(c.x + r * Math.cos(t), c.y + r * Math.sin(t))); }
    return { pts, up, closed: cv.type === "circle" };
  }
  if (C.isFreeform(cv)) {
    const g = C.freeformGeom(s.sk, ref.curve);
    if (!g) return null;
    const pl = C.pcurvePolyline(g, 96);
    return { pts: pl.map((q) => W(q[0], q[1])), up, closed: !!cv.closed };
  }
  return null;
}
/** World polyline of a body edge ref ({body, p, sig}). */
function edgePts(st, ref) {
  const b = st.bodies.get(ref.body);
  if (!b) return null;
  const idx = M.locateEdge(b.shape, ref);
  if (idx < 0) return null;
  const ti = K.topoOf(b.shape).edges[idx];
  if (ti && ti.type === "LINE") return { pts: [ti.s, ti.t] };
  const [e] = K.edgesAt(b.shape, [idx]);
  if (!e) return null;
  try {
    const n = 96, pts = [];
    for (let i = 0; i <= n; i++) { const v = e.pointAt(i / n); pts.push(v.toTuple()); v.delete(); }
    const closed = V.len(V.sub(pts[0], pts[n])) < 1e-6;
    return { pts, closed };
  } finally { K.del(e); }
}

/**
 * Path from sketch curves ([{sketch, curve}]) and body edges ([{body, p, sig}]): chained head to tail.
 * Returns a Path (see below) or throws.
 */
/** Unchained world polylines of sketch curves and body edges (region / cell geometry). */
export function curvePolylines(st, curves = [], edges = []) {
  const out = [];
  for (const r of curves) { const q = sketchCurvePts(st, r); if (q) out.push(q.pts); }
  for (const r of edges) { const q = edgePts(st, r); if (q) out.push(q.pts); }
  return out;
}
/** World point of a stored point ref (sketch point, vertex, origin point), or null. */
export function pointOf(st, r) {
  if (!r) return null;
  if (r.kind === "sketchPoint") {
    const sk = st.sketches.get(r.sketch);
    const q = sk && sk.sk.points[r.point];
    return q ? K.toWorld(sk.plane, q.x, q.y) : null;
  }
  if (r.kind === "originPoint") return [0, 0, 0];
  return Array.isArray(r.p) ? [...r.p] : null;
}

export function buildPath(st, curves = [], edges = []) {
  const parts = [];
  let up = null;
  for (const r of curves) { const q = sketchCurvePts(st, r); if (q) { parts.push(q); up = up || q.up; } }
  for (const r of edges) { const q = edgePts(st, r); if (q) parts.push(q); }
  if (!parts.length) throw new Error("Select a path");
  if (parts.length === 1) return new Path(parts[0].pts, !!parts[0].closed, up);
  const tol = 1e-3;
  const close = (a, b) => V.len(V.sub(a, b)) < tol;
  const left = parts.map((p) => p.pts);
  const ends = (l) => [l[0], l[l.length - 1]];
  const touches = (pt, self) => left.some((l) => l !== self && ends(l).some((e) => close(e, pt)));
  let i0 = left.findIndex((l) => !touches(l[0], l) || !touches(l[l.length - 1], l));
  if (i0 < 0) i0 = 0;
  let chain = left.splice(i0, 1)[0];
  if (touches(chain[0], null) && !touches(chain[chain.length - 1], null)) chain = chain.slice().reverse();
  while (left.length) {
    const end = chain[chain.length - 1];
    let i = left.findIndex((l) => close(l[0], end));
    if (i >= 0) { chain = chain.concat(left.splice(i, 1)[0].slice(1)); continue; }
    i = left.findIndex((l) => close(l[l.length - 1], end));
    if (i >= 0) { chain = chain.concat(left.splice(i, 1)[0].slice().reverse().slice(1)); continue; }
    throw new Error("The path must be a connected chain of curves");
  }
  const closed = close(chain[0], chain[chain.length - 1]);
  return new Path(chain, closed, up);
}

/** Arc-length parametrised polyline with rotation-minimising frames. */
export class Path {
  constructor(pts, closed, up) {
    const P = [pts[0]];
    for (let i = 1; i < pts.length; i++) if (V.len(V.sub(pts[i], P[P.length - 1])) > 1e-9) P.push(pts[i]);
    if (P.length < 2) throw new Error("The path is too short");
    this.pts = P;
    this.closed = !!closed;
    this.s = [0];
    for (let i = 1; i < P.length; i++) this.s.push(this.s[i - 1] + V.len(V.sub(P[i], P[i - 1])));
    this.length = this.s[this.s.length - 1];
    // tangents (central differences) and double-reflection RMF normals
    const n = P.length;
    this.t = P.map((_, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      if (this.closed && (i === 0 || i === n - 1)) return V.norm(V.sub(P[1], P[n - 2]));
      return V.norm(V.sub(b, a));
    });
    let r0 = up && Math.abs(V.dot(V.norm(up), this.t[0])) < 0.999 ? V.norm(V.sub(up, V.mul(this.t[0], V.dot(up, this.t[0])))) : orthoFrame([0, 0, 0], this.t[0]).x;
    this.r = [r0];
    for (let i = 0; i < n - 1; i++) {
      const v1 = V.sub(P[i + 1], P[i]);
      const c1 = V.dot(v1, v1) || 1e-18;
      const rL = V.sub(this.r[i], V.mul(v1, (2 / c1) * V.dot(v1, this.r[i])));
      const tL = V.sub(this.t[i], V.mul(v1, (2 / c1) * V.dot(v1, this.t[i])));
      const v2 = V.sub(this.t[i + 1], tL);
      const c2 = V.dot(v2, v2);
      let ri = c2 < 1e-18 ? rL : V.sub(rL, V.mul(v2, (2 / c2) * V.dot(v2, rL)));
      ri = V.norm(V.sub(ri, V.mul(this.t[i + 1], V.dot(ri, this.t[i + 1]))));
      this.r.push(ri);
    }
  }
  _seg(s) {
    let lo = 0, hi = this.s.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
    const L = this.s[hi] - this.s[lo] || 1;
    return { i: lo, j: hi, u: Math.max(0, Math.min(1, (s - this.s[lo]) / L)) };
  }
  /** Map s into [0, length] (wrapping on closed paths); null when outside an open path. */
  wrap(s) {
    const L = this.length;
    if (this.closed) return ((s % L) + L) % L;
    if (s < -1e-6 || s > L + 1e-6) return null;
    return Math.max(0, Math.min(L, s));
  }
  point(s) { const { i, j, u } = this._seg(s); return V.add(this.pts[i], V.mul(V.sub(this.pts[j], this.pts[i]), u)); }
  /** Frame at s: x = tangent, y = RMF normal, z = x cross y. */
  frame(s) {
    const { i, j, u } = this._seg(s);
    const t = V.norm(V.add(V.mul(this.t[i], 1 - u), V.mul(this.t[j], u)));
    let r = V.add(V.mul(this.r[i], 1 - u), V.mul(this.r[j], u));
    r = V.norm(V.sub(r, V.mul(t, V.dot(r, t))));
    return { o: this.point(s), x: t, y: r, z: V.cross(t, r) };
  }
  /** Arc length of the path point nearest to p. */
  nearest(p) {
    let best = { s: 0, d: Infinity };
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i], d = V.sub(this.pts[i + 1], a);
      const L2 = V.dot(d, d) || 1e-18;
      const u = Math.max(0, Math.min(1, V.dot(V.sub(p, a), d) / L2));
      const q = V.add(a, V.mul(d, u));
      const dd = V.len(V.sub(p, q));
      if (dd < best.d) best = { s: this.s[i] + u * Math.sqrt(L2), d: dd };
    }
    return best;
  }
}

/** Path refs of a dialog selection: {curves:[{sketch, curve}], edges:[{body, p}]}. */
export function pathRefs(list) {
  const curves = [], edges = [];
  for (const r of list || []) {
    if (r.kind === "sketchCurve") curves.push({ sketch: r.sketch, curve: r.curve });
    else if (r.kind === "edge") edges.push({ body: r.body, p: r.p });
  }
  return { curves, edges };
}

/** Bounding box of several bodies (B-rep or mesh) in a state, or null. */
export function bodiesBox(st, ids) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const id of ids) {
    const bb = M.bodyBBox(st, id);
    if (!bb) continue;
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); }
  }
  return Number.isFinite(mn[0]) ? { min: mn, max: mx } : null;
}

/** Fuse several solids in one General Fuse (one result shape; the inputs are kept). */
export function fuseMany(shapes) {
  if (!shapes.length) return null;
  if (shapes.length === 1) return K.translated(shapes[0], [0, 0, 0]);
  const R = K.R, O = R.getOC();
  const bl = new O.BRepAlgoAPI_Fuse();
  const A = new O.NCollection_List_TopoDS_Shape([shapes[0].wrapped]);
  const B = new O.NCollection_List_TopoDS_Shape(shapes.slice(1).map((s) => s.wrapped));
  try {
    bl.SetArguments(A);
    bl.SetTools(B);
    bl.Build();
    try { bl.SimplifyResult(true, true, 1e-3); } catch { /* optional */ }
    const raw = bl.Shape();
    let s;
    try { s = R.cast(raw); } finally { K.del(raw); }
    return K.singleSolid(s);
  } finally { K.del(bl, A, B); }
}

/** Compound of shapes (copies kept by OCCT reference; the inputs stay owned by the caller). */
export function compoundOf(shapes) {
  if (shapes.length === 1) return shapes[0];
  return K.R.makeCompound(shapes);
}
