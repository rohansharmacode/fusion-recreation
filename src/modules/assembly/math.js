// assembly: small vector and rigid 3x4 matrix helpers (row-major 12 numbers, the same layout as src/meshdata.js).
export const I = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
export const RAD = Math.PI / 180;

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1]; },
};

export function mul(A, B) {
  const o = new Array(12);
  for (let r = 0; r < 3; r++) {
    const a0 = A[r * 4], a1 = A[r * 4 + 1], a2 = A[r * 4 + 2];
    o[r * 4] = a0 * B[0] + a1 * B[4] + a2 * B[8];
    o[r * 4 + 1] = a0 * B[1] + a1 * B[5] + a2 * B[9];
    o[r * 4 + 2] = a0 * B[2] + a1 * B[6] + a2 * B[10];
    o[r * 4 + 3] = a0 * B[3] + a1 * B[7] + a2 * B[11] + A[r * 4 + 3];
  }
  return o;
}
export const mulAll = (...ms) => ms.reduce((a, b) => mul(a, b));
/** Inverse of a rigid transform. */
export function inv(A) {
  const t = [A[3], A[7], A[11]];
  return [
    A[0], A[4], A[8], -(A[0] * t[0] + A[4] * t[1] + A[8] * t[2]),
    A[1], A[5], A[9], -(A[1] * t[0] + A[5] * t[1] + A[9] * t[2]),
    A[2], A[6], A[10], -(A[2] * t[0] + A[6] * t[1] + A[10] * t[2]),
  ];
}
export const apply = (A, p) => [
  A[0] * p[0] + A[1] * p[1] + A[2] * p[2] + A[3],
  A[4] * p[0] + A[5] * p[1] + A[6] * p[2] + A[7],
  A[8] * p[0] + A[9] * p[1] + A[10] * p[2] + A[11],
];
export const dir = (A, d) => [A[0] * d[0] + A[1] * d[1] + A[2] * d[2], A[4] * d[0] + A[5] * d[1] + A[6] * d[2], A[8] * d[0] + A[9] * d[1] + A[10] * d[2]];
export const trans = (t) => [1, 0, 0, t[0], 0, 1, 0, t[1], 0, 0, 1, t[2]];
/** Rotation by deg about a unit axis through the origin (or through point o). */
export function rot(axis, deg, o) {
  const [x, y, z] = V.norm(axis), a = deg * RAD, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  const R = [t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0, t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0, t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0];
  return o ? mulAll(trans(o), R, trans(V.mul(o, -1))) : R;
}
export const origin = (A) => [A[3], A[7], A[11]];
export const axis = (A, k) => [A[k], A[4 + k], A[8 + k]];
export function perp(z) {
  const a = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return V.norm(V.cross(V.cross(z, a), z));
}
/** Frame matrix with origin o, Z axis z and (optional) X hint. */
export function frame(o, z, xHint) {
  const Z = V.norm(z);
  let X = xHint ? V.sub(xHint, V.mul(Z, V.dot(xHint, Z))) : null;
  X = X && V.len(X) > 1e-6 ? V.norm(X) : perp(Z);
  const Y = V.cross(Z, X);
  return [X[0], Y[0], Z[0], o[0], X[1], Y[1], Z[1], o[1], X[2], Y[2], Z[2], o[2]];
}
export function same(A, B, tol = 1e-7) {
  if (!A || !B) return false;
  for (let i = 0; i < 12; i++) if (Math.abs(A[i] - B[i]) > tol) return false;
  return true;
}
export const isI = (A) => same(A, I);
export const valid = (A) => Array.isArray(A) && A.length === 12 && A.every(Number.isFinite);
/** Rotation vector (axis times angle in radians) of the rotation part. */
export function rotVec(A) {
  const c = Math.max(-1, Math.min(1, (A[0] + A[5] + A[10] - 1) / 2)), ang = Math.acos(c);
  const v = [A[9] - A[6], A[2] - A[8], A[4] - A[1]];
  const s = V.len(v);
  if (s < 1e-9) {
    if (c > 0) return [0, 0, 0];
    // angle of 180 degrees: the axis comes from the diagonal
    const ax = [Math.sqrt(Math.max(0, (A[0] + 1) / 2)), Math.sqrt(Math.max(0, (A[5] + 1) / 2)), Math.sqrt(Math.max(0, (A[10] + 1) / 2))];
    if (A[1] + A[4] < 0) ax[1] = -ax[1];
    if (A[2] + A[8] < 0) ax[2] = -ax[2];
    return V.mul(V.norm(ax), Math.PI);
  }
  return V.mul(v, ang / s);
}
/** Signed angle (degrees) of the rotation part about a unit axis (valid when the rotation is about that axis). */
export function angleAbout(A, k) {
  const u = perp(k), w = dir(A, u);
  return Math.atan2(V.dot(V.cross(u, w), k), V.dot(u, w)) / RAD;
}
export const lerp = (a, b, t) => a + (b - a) * t;
