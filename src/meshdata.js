// Triangle-mesh data helpers shared by the model (mesh bodies in the evaluation state), the viewport
// (display / picking) and feature modules (MESH tab, Form). Plain JS, no three.js, usable in node.
//
// Mesh format (mesh bodies: st.meshBodies.get(id).mesh):
//   { positions: Float32Array (x,y,z per vertex, world mm),
//     indices:   Uint32Array | null  (3 per triangle; null = triangle soup: vertices 3k..3k+2 form triangle k),
//     normals?:  Float32Array (per vertex; optional, display computes flat facets when absent),
//     groups?:   Uint32Array | number[]  (face group id per triangle, optional: Fusion "face groups") }
// Stored mesh data (doc.meshData[id], see model.js storeMeshData):
//   { positions: "<base64 Float32>", indices?: "<base64 Uint32>", groups?: "<base64 Uint32>", tris }

/** Base64 <-> typed arrays (little-endian, like the browser). */
export function toB64(arr) {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
function bytes(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
export const f32FromB64 = (b64) => { const u = bytes(b64); return new Float32Array(u.buffer, 0, Math.floor(u.length / 4)); };
export const u32FromB64 = (b64) => { const u = bytes(b64); return new Uint32Array(u.buffer, 0, Math.floor(u.length / 4)); };

export const triCount = (m) => (m ? (m.indices ? m.indices.length / 3 : m.positions.length / 9) | 0 : 0);
export const vertexCount = (m) => (m ? (m.positions.length / 3) | 0 : 0);

/** Vertex indices [a, b, c] of triangle t. */
export function tri(m, t) {
  return m.indices ? [m.indices[3 * t], m.indices[3 * t + 1], m.indices[3 * t + 2]] : [3 * t, 3 * t + 1, 3 * t + 2];
}
export function vert(m, i) { return [m.positions[3 * i], m.positions[3 * i + 1], m.positions[3 * i + 2]]; }

/** Merge identical vertices of a triangle soup (or an indexed mesh): {positions, indices}. Degenerate triangles are dropped. */
export function weld(positions, indices = null, tol = 0) {
  const n = indices ? indices.length : positions.length / 3;
  const map = new Map();
  const outP = [];
  const outI = new Uint32Array(n);
  const q = tol > 0 ? (v) => Math.round(v / tol) : (v) => v;
  for (let k = 0; k < n; k++) {
    const i = indices ? indices[k] : k;
    const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
    const key = `${q(x)},${q(y)},${q(z)}`;
    let j = map.get(key);
    if (j === undefined) { j = outP.length / 3; map.set(key, j); outP.push(x, y, z); }
    outI[k] = j;
  }
  // drop degenerate triangles (two equal corners)
  const keep = [];
  for (let t = 0; t < n / 3; t++) {
    const a = outI[3 * t], b = outI[3 * t + 1], c = outI[3 * t + 2];
    if (a !== b && b !== c && a !== c) keep.push(a, b, c);
  }
  return { positions: Float32Array.from(outP), indices: Uint32Array.from(keep) };
}

/** Triangle soup (9 floats per triangle) of a mesh. */
export function soup(m) {
  if (!m.indices) return m.positions;
  const n = m.indices.length;
  const out = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { const i = m.indices[k]; out[3 * k] = m.positions[3 * i]; out[3 * k + 1] = m.positions[3 * i + 1]; out[3 * k + 2] = m.positions[3 * i + 2]; }
  return out;
}

export function bbox(m) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const p = m && m.positions;
  if (!p || !p.length) return null;
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { const v = p[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  return { min, max };
}

/** New mesh with every vertex mapped through fn([x,y,z]) -> [x,y,z] (indices / groups shared). */
export function transform(m, fn) {
  const p = m.positions;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) { const r = fn([p[i], p[i + 1], p[i + 2]]); out[i] = r[0]; out[i + 1] = r[1]; out[i + 2] = r[2]; }
  return { ...m, positions: out, normals: undefined };
}

/** 3x4 affine matrix helpers: M = [r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz] (row-major). */
export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
export function apply(M, p) {
  return [M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + M[3], M[4] * p[0] + M[5] * p[1] + M[6] * p[2] + M[7], M[8] * p[0] + M[9] * p[1] + M[10] * p[2] + M[11]];
}
export function mul(A, B) {
  const o = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[4 * r + c] = A[4 * r] * B[c] + A[4 * r + 1] * B[4 + c] + A[4 * r + 2] * B[8 + c];
    o[4 * r + 3] = A[4 * r] * B[3] + A[4 * r + 1] * B[7] + A[4 * r + 2] * B[11] + A[4 * r + 3];
  }
  return o;
}
export const translation = (t) => [1, 0, 0, t[0], 0, 1, 0, t[1], 0, 0, 1, t[2]];
export const scaling = (s) => [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0];
/** Rotation by Euler angles in degrees, same convention as THREE.Euler(x, y, z, 'XYZ'): R = Rx * Ry * Rz. */
export function eulerXYZ(rx, ry, rz) {
  const D = Math.PI / 180;
  const a = Math.cos(rx * D), b = Math.sin(rx * D), c = Math.cos(ry * D), d = Math.sin(ry * D), e = Math.cos(rz * D), f = Math.sin(rz * D);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [c * e, -c * f, d, 0, af + be * d, ae - bf * d, -b * c, 0, bf - ae * d, be + af * d, a * c, 0];
}
/** Rotation by angleDeg about the axis through o along d (right-handed). */
export function axisRotation(angleDeg, o, d) {
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  const x = d[0] / l, y = d[1] / l, z = d[2] / l;
  const t = (angleDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), C = 1 - c;
  const R = [c + x * x * C, x * y * C - z * s, x * z * C + y * s, 0, y * x * C + z * s, c + y * y * C, y * z * C - x * s, 0, z * x * C - y * s, z * y * C + x * s, c + z * z * C, 0];
  return mul(translation(o), mul(R, translation([-o[0], -o[1], -o[2]])));
}
export const transformBy = (m, M) => transform(m, (p) => apply(M, p));

/** Enclosed volume (divergence theorem; meaningful for closed, consistently oriented meshes) and surface area. */
export function volume(m) {
  let v = 0;
  const n = triCount(m);
  for (let t = 0; t < n; t++) {
    const [a, b, c] = tri(m, t);
    const A = vert(m, a), B = vert(m, b), C = vert(m, c);
    v += A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0]);
  }
  return v / 6;
}
export function area(m) {
  let s = 0;
  const n = triCount(m);
  for (let t = 0; t < n; t++) {
    const [a, b, c] = tri(m, t);
    const A = vert(m, a), B = vert(m, b), C = vert(m, c);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    s += 0.5 * Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
  }
  return s;
}
/** Face normal of triangle t (unit). */
export function triNormal(m, t) {
  const [a, b, c] = tri(m, t);
  const A = vert(m, a), B = vert(m, b), C = vert(m, c);
  const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}
/** Triangles of face group g (all triangles when the mesh has no groups). */
export function groupTriangles(m, g) {
  const n = triCount(m);
  const out = [];
  if (!m.groups || g == null || g < 0) { for (let t = 0; t < n; t++) out.push(t); return out; }
  for (let t = 0; t < n; t++) if (m.groups[t] === g) out.push(t);
  return out;
}
/**
 * Edges to draw for a mesh: open boundary edges and face-group borders (pairs of vertex indices).
 * sharpDeg > 0 also adds creases sharper than that angle (used when the mesh has no groups).
 */
export function featureEdges(m, sharpDeg = 0) {
  const n = triCount(m);
  if (!m.indices) return [];
  const edges = new Map(); // "a,b" -> [t1, t2?]
  for (let t = 0; t < n; t++) {
    const [a, b, c] = tri(m, t);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? `${u},${v}` : `${v},${u}`;
      const e = edges.get(k);
      if (e) e.push(t); else edges.set(k, [t]);
    }
  }
  const cosLim = sharpDeg > 0 ? Math.cos((sharpDeg * Math.PI) / 180) : 2;
  const out = [];
  for (const [k, ts] of edges) {
    let keep = ts.length !== 2;
    if (!keep && m.groups) keep = m.groups[ts[0]] !== m.groups[ts[1]];
    if (!keep && cosLim < 1.5) {
      const n1 = triNormal(m, ts[0]), n2 = triNormal(m, ts[1]);
      keep = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < cosLim;
    }
    if (keep) { const [u, v] = k.split(",").map(Number); out.push(u, v); }
  }
  return out;
}

/** Binary STL (little-endian) from a list of triangle soups (Float32Array, 9 floats per triangle). */
export function stlBinary(soups, header = "fusion-recreation") {
  let n = 0;
  for (const s of soups) n += s.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  for (let i = 0; i < Math.min(80, header.length); i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  let o = 84;
  for (const s of soups) {
    for (let t = 0; t < s.length; t += 9) {
      const u = [s[t + 3] - s[t], s[t + 4] - s[t + 1], s[t + 5] - s[t + 2]], w = [s[t + 6] - s[t], s[t + 7] - s[t + 1], s[t + 8] - s[t + 2]];
      let nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
      for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + 4 * k, s[t + k], true);
      dv.setUint16(o + 48, 0, true);
      o += 50;
    }
  }
  return new Uint8Array(buf);
}
/** ASCII STL text from triangle soups. */
export function stlAscii(soups, name = "fusion-recreation") {
  const out = [`solid ${name}`];
  const f = (v) => v.toExponential(6);
  for (const s of soups) {
    for (let t = 0; t < s.length; t += 9) {
      const u = [s[t + 3] - s[t], s[t + 4] - s[t + 1], s[t + 5] - s[t + 2]], w = [s[t + 6] - s[t], s[t + 7] - s[t + 1], s[t + 8] - s[t + 2]];
      let nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
      const l = Math.hypot(nx, ny, nz) || 1;
      out.push(`  facet normal ${f(nx / l)} ${f(ny / l)} ${f(nz / l)}`, "    outer loop");
      for (let k = 0; k < 9; k += 3) out.push(`      vertex ${f(s[t + k])} ${f(s[t + k + 1])} ${f(s[t + k + 2])}`);
      out.push("    endloop", "  endfacet");
    }
  }
  out.push(`endsolid ${name}`);
  return out.join("\n");
}
