// sheetmetal: small vector / rigid-transform helpers (no OCCT).
// A rigid transform M is a plain array of 12 numbers, rows of [R | t]: p' = R p + t.

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
export const V2 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, s) => [a[0] * s, a[1] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1],
  cross: (a, b) => a[0] * b[1] - a[1] * b[0],
  len: (a) => Math.hypot(a[0], a[1]),
  norm: (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; },
  perp: (a) => [-a[1], a[0]],
};

export const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
/** Frame (origin o, axes x, y, z) as the transform local -> world. */
export const fromFrame = (o, x, y, z) => [x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2]];
export function mul(a, b) {
  const r = new Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j];
    r[i * 4 + 3] = a[i * 4] * b[3] + a[i * 4 + 1] * b[7] + a[i * 4 + 2] * b[11] + a[i * 4 + 3];
  }
  return r;
}
export const apply = (m, p) => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
];
export const applyDir = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[4] * v[0] + m[5] * v[1] + m[6] * v[2],
  m[8] * v[0] + m[9] * v[1] + m[10] * v[2],
];
export function inv(m) {
  // rigid: R^T, -R^T t
  const r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0];
  const t = [m[3], m[7], m[11]];
  r[3] = -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]);
  r[7] = -(r[4] * t[0] + r[5] * t[1] + r[6] * t[2]);
  r[11] = -(r[8] * t[0] + r[9] * t[1] + r[10] * t[2]);
  return r;
}
export const trans = (v) => [1, 0, 0, v[0], 0, 1, 0, v[1], 0, 0, 1, v[2]];
/** Rotation by angle (rad) about the axis through o along unit d. */
export function rotAxis(o, d, ang) {
  const [x, y, z] = V.norm(d);
  const c = Math.cos(ang), s = Math.sin(ang), k = 1 - c;
  const R = [
    c + x * x * k, x * y * k - z * s, x * z * k + y * s,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k,
  ];
  const m = [R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0];
  const ro = applyDir(m, o);
  m[3] = o[0] - ro[0]; m[7] = o[1] - ro[1]; m[11] = o[2] - ro[2];
  return m;
}
export const isIdentity = (m, tol = 1e-9) => I4().every((v, i) => Math.abs(v - m[i]) < (i % 4 === 3 ? tol * 1e3 : tol));

/** Axis-angle + translation decomposition of a rigid transform: {axis, angle (rad), t}. */
export function axisAngle(m) {
  const tr = m[0] + m[5] + m[10];
  const c = Math.max(-1, Math.min(1, (tr - 1) / 2));
  const angle = Math.acos(c);
  let axis = [m[9] - m[6], m[2] - m[8], m[4] - m[1]];
  if (angle < 1e-9) return { axis: [0, 0, 1], angle: 0, t: [m[3], m[7], m[11]] };
  if (Math.PI - angle < 1e-6) {
    // 180 degrees: axis from the largest diagonal of (R + I) / 2
    const xx = (m[0] + 1) / 2, yy = (m[5] + 1) / 2, zz = (m[10] + 1) / 2;
    if (xx >= yy && xx >= zz) { const x = Math.sqrt(xx); axis = [x, m[1] / (2 * x), m[2] / (2 * x)]; }
    else if (yy >= zz) { const y = Math.sqrt(yy); axis = [m[1] / (2 * y), y, m[6] / (2 * y)]; }
    else { const z = Math.sqrt(zz); axis = [m[2] / (2 * z), m[6] / (2 * z), z]; }
  }
  return { axis: V.norm(axis), angle, t: [m[3], m[7], m[11]] };
}

// ---------- 2D polygons ----------
export function area2(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]);
  return a / 2;
}
export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function segDist(p, a, b) {
  const ab = V2.sub(b, a), l2 = V2.dot(ab, ab);
  const t = l2 > 1e-18 ? Math.max(0, Math.min(1, V2.dot(V2.sub(p, a), ab) / l2)) : 0;
  return V2.len(V2.sub(p, V2.add(a, V2.mul(ab, t))));
}
export function polyBoundaryDist(p, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(p, poly[j], poly[i]));
  return d;
}
/** Ear-clipping triangulation of a simple polygon (indices). */
export function triangulate(poly) {
  const n = poly.length;
  if (n < 3) return [];
  const idx = [...Array(n).keys()];
  if (area2(poly) < 0) idx.reverse();
  const out = [];
  const isEar = (i0, i1, i2, rest) => {
    const a = poly[i0], b = poly[i1], c = poly[i2];
    if (V2.cross(V2.sub(b, a), V2.sub(c, b)) <= 1e-12) return false;
    for (const k of rest) {
      if (k === i0 || k === i1 || k === i2) continue;
      const p = poly[k];
      const s1 = V2.cross(V2.sub(b, a), V2.sub(p, a)), s2 = V2.cross(V2.sub(c, b), V2.sub(p, b)), s3 = V2.cross(V2.sub(a, c), V2.sub(p, c));
      if (s1 >= -1e-12 && s2 >= -1e-12 && s3 >= -1e-12) return false;
    }
    return true;
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
      if (isEar(i0, i1, i2, idx)) { out.push([i0, i1, i2]); idx.splice(i, 1); cut = true; break; }
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
/** A point well inside a simple polygon (centroid of the largest ear). */
export function interiorPoint(poly) {
  const tris = triangulate(poly);
  let best = null, ba = -1;
  for (const [a, b, c] of tris) {
    const ar = Math.abs(V2.cross(V2.sub(poly[b], poly[a]), V2.sub(poly[c], poly[a])));
    if (ar > ba) { ba = ar; best = [(poly[a][0] + poly[b][0] + poly[c][0]) / 3, (poly[a][1] + poly[b][1] + poly[c][1]) / 3]; }
  }
  return best || poly[0];
}
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;
export const clone = (o) => JSON.parse(JSON.stringify(o));
