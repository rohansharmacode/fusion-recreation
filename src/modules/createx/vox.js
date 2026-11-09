// createx: voxel engine for the volumetric features.
//   grid(bbox, h, pad)            regular node grid {o, h, nx, ny, nz, n}
//   meshSDF(grid, tris, band)     signed distance of a closed triangle mesh (negative inside), exact within
//                                 `band` of the surface (clamped beyond); inside by ray parity along +X
//   unsignedDist(grid, tris, sel, band)   distance to a subset of triangles (sel(t) true), clamped to band
//   march(grid, field)            iso-surface 0 by naive surface nets (welded, outward normals)
//   latticeValue / textureValue   implicit fields (negative = material / height 0..1)

export function grid(bb, h, pad = 2) {
  const o = [bb.min[0] - pad * h, bb.min[1] - pad * h, bb.min[2] - pad * h];
  const nx = Math.max(2, Math.ceil((bb.max[0] - bb.min[0]) / h) + 2 * pad + 1);
  const ny = Math.max(2, Math.ceil((bb.max[1] - bb.min[1]) / h) + 2 * pad + 1);
  const nz = Math.max(2, Math.ceil((bb.max[2] - bb.min[2]) / h) + 2 * pad + 1);
  return { o, h, nx, ny, nz, n: nx * ny * nz };
}

/** Node spacing so that the grid over bb has at most maxNodes nodes (and at most `want`). */
export function spacingFor(bb, want, maxNodes = 1.4e6, pad = 2) {
  const d = [0, 1, 2].map((i) => Math.max(1e-6, bb.max[i] - bb.min[i]));
  let h = want;
  for (let it = 0; it < 40; it++) {
    const n = d.reduce((m, x) => m * (Math.ceil(x / h) + 2 * pad + 1), 1);
    if (n <= maxNodes) break;
    h *= 1.08;
  }
  return h;
}

// squared distance from point to triangle (Ericson, Real-Time Collision Detection 5.1.5)
function triDist2(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let qx, qy, qz;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
  else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + v * abx; qy = ay + v * aby; qz = az + v * abz; }
      else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + w * acx; qy = ay + w * acy; qz = az + w * acz; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); qx = bx + w * (cx - bx); qy = by + w * (cy - by); qz = bz + w * (cz - bz); }
            else { const den = 1 / (va + vb + vc); const v = vb * den, w = vc * den; qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w; }
          }
        }
      }
    }
  }
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Unsigned distance (clamped to band) to the triangles t with sel(t) (all when sel is null): exact within
 * 1.75 cells of the surface, propagated further by a 3x3x3 chamfer transform (a few % high).
 */
export function unsignedDist(G, T, sel, bandOut) {
  const { o, h, nx, ny, nz } = G;
  const band = Math.min(bandOut, 1.75 * h);
  const D = new Float32Array(G.n).fill(band * band);
  const P = T.positions, I = T.indices, nt = I.length / 3;
  const cl = (v, n) => Math.max(0, Math.min(n - 1, v));
  for (let t = 0; t < nt; t++) {
    if (sel && !sel(t)) continue;
    const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
    const ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[b], by = P[b + 1], bz = P[b + 2], cx = P[c], cy = P[c + 1], cz = P[c + 2];
    const i0 = cl(Math.floor((Math.min(ax, bx, cx) - band - o[0]) / h), nx), i1 = cl(Math.ceil((Math.max(ax, bx, cx) + band - o[0]) / h), nx);
    const j0 = cl(Math.floor((Math.min(ay, by, cy) - band - o[1]) / h), ny), j1 = cl(Math.ceil((Math.max(ay, by, cy) + band - o[1]) / h), ny);
    const k0 = cl(Math.floor((Math.min(az, bz, cz) - band - o[2]) / h), nz), k1 = cl(Math.ceil((Math.max(az, bz, cz) + band - o[2]) / h), nz);
    for (let k = k0; k <= k1; k++) {
      const pz = o[2] + k * h;
      for (let j = j0; j <= j1; j++) {
        const py = o[1] + j * h;
        let idx = i0 + nx * (j + ny * k);
        for (let i = i0; i <= i1; i++, idx++) {
          const d2 = triDist2(o[0] + i * h, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz);
          if (d2 < D[idx]) D[idx] = d2;
        }
      }
    }
  }
  for (let i = 0; i < D.length; i++) D[i] = D[i] >= band * band ? bandOut : Math.sqrt(D[i]);
  if (bandOut > band) chamfer(G, D, bandOut);
  return D;
}

// forward half of the 26-neighbourhood (the backward pass mirrors it)
const HALF = [];
for (let dk = -1; dk <= 0; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
  if (dk === 0 && (dj > 0 || (dj === 0 && di >= 0))) continue;
  HALF.push([di, dj, dk, Math.sqrt(di * di + dj * dj + dk * dk)]);
}
function chamfer(G, D, cap) {
  const { h, nx, ny, nz } = G;
  const sweep = (sgn) => {
    const ks = sgn > 0 ? 0 : nz - 1, ke = sgn > 0 ? nz : -1;
    const js = sgn > 0 ? 0 : ny - 1, je = sgn > 0 ? ny : -1;
    const is = sgn > 0 ? 0 : nx - 1, ie = sgn > 0 ? nx : -1;
    for (let k = ks; k !== ke; k += sgn) for (let j = js; j !== je; j += sgn) for (let i = is; i !== ie; i += sgn) {
      const idx = i + nx * (j + ny * k);
      let d = D[idx];
      for (const [a, b, c, w] of HALF) {
        const ii = i + sgn * a, jj = j + sgn * b, kk = k + sgn * c;
        if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue;
        const q = D[ii + nx * (jj + ny * kk)] + w * h;
        if (q < d) d = q;
      }
      D[idx] = d < cap ? d : cap;
    }
  };
  sweep(1);
  sweep(-1);
}

/** Inside flags (1 = inside) of a closed triangle mesh by ray parity along +X per (y, z) column. */
export function insideFlags(G, T) {
  const { o, h, nx, ny, nz } = G;
  const cols = new Array(ny * nz);
  const P = T.positions, I = T.indices, nt = I.length / 3;
  const ey = h * 1.37e-4, ez = h * 2.91e-4; // tiny offsets keep rays off edges / vertices
  for (let t = 0; t < nt; t++) {
    const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
    const ay = P[a + 1], az = P[a + 2], by = P[b + 1], bz = P[b + 2], cy = P[c + 1], cz = P[c + 2];
    const area = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    if (Math.abs(area) < 1e-14) continue;
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - o[1] - ey) / h)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - o[1] - ey) / h));
    const k0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - o[2] - ez) / h)), k1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - o[2] - ez) / h));
    for (let k = k0; k <= k1; k++) {
      const z = o[2] + k * h + ez;
      for (let j = j0; j <= j1; j++) {
        const y = o[1] + j * h + ey;
        // barycentric in the yz projection
        const w0 = ((by - y) * (cz - z) - (bz - z) * (cy - y)) / area;
        const w1 = ((cy - y) * (az - z) - (cz - z) * (ay - y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const x = w0 * P[a] + w1 * P[b] + w2 * P[c];
        const ci = j + ny * k;
        (cols[ci] || (cols[ci] = [])).push(x);
      }
    }
  }
  const F = new Uint8Array(G.n);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const xs = cols[j + ny * k];
    if (!xs || xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    let m = 0;
    const base = nx * (j + ny * k);
    for (let i = 0; i < nx; i++) {
      const x = o[0] + i * h;
      while (m < xs.length && xs[m] < x) m++;
      if (m & 1) F[base + i] = 1;
    }
  }
  return F;
}

/** Signed distance of a closed mesh (negative inside), exact within band. */
export function meshSDF(G, T, band) {
  const D = unsignedDist(G, T, null, band);
  const F = insideFlags(G, T);
  for (let i = 0; i < D.length; i++) if (F[i]) D[i] = -D[i];
  return D;
}

// Naive surface nets: one vertex per grid cell the surface crosses (mean of its edge crossings), one quad
// per grid edge with a sign change (joining the four cells around it). Closed, welded, outward-facing.
const CEDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/** Iso-surface (field < 0 is inside) as a welded mesh {positions, indices} with outward triangles. */
export function march(G, F) {
  const { o, h, nx, ny, nz } = G;
  const sy = nx, sz = nx * ny;
  const cx = nx - 1, cy = ny - 1, cxy = cx * cy;
  const val = (n) => F[n] || 1e-9; // exact zeros count as outside
  const vid = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const pos = [];
  const cv = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const base = i + sy * j + sz * k;
    let neg = 0;
    for (let c = 0; c < 8; c++) { const v = val(base + (c & 1) + (c & 2 ? sy : 0) + (c & 4 ? sz : 0)); cv[c] = v; if (v < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let px = 0, py = 0, pz = 0, m = 0;
    for (const [a, b] of CEDGES) {
      const fa = cv[a], fb = cv[b];
      if ((fa < 0) === (fb < 0)) continue;
      const t = fa / (fa - fb);
      px += (a & 1) + ((b & 1) - (a & 1)) * t;
      py += (a & 2 ? 1 : 0) + ((b & 2 ? 1 : 0) - (a & 2 ? 1 : 0)) * t;
      pz += (a & 4 ? 1 : 0) + ((b & 4 ? 1 : 0) - (a & 4 ? 1 : 0)) * t;
      m++;
    }
    vid[i + cx * j + cxy * k] = pos.length / 3;
    pos.push(o[0] + h * (i + px / m), o[1] + h * (j + py / m), o[2] + h * (k + pz / m));
  }
  const idx = [];
  const P = pos;
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    // split along the shorter diagonal
    const d1 = (P[3 * a] - P[3 * c]) ** 2 + (P[3 * a + 1] - P[3 * c + 1]) ** 2 + (P[3 * a + 2] - P[3 * c + 2]) ** 2;
    const d2 = (P[3 * b] - P[3 * d]) ** 2 + (P[3 * b + 1] - P[3 * d + 1]) ** 2 + (P[3 * b + 2] - P[3 * d + 2]) ** 2;
    if (d1 <= d2) idx.push(a, b, c, a, c, d); else idx.push(a, b, d, b, c, d);
  };
  const C = (i, j, k) => vid[i + cx * j + cxy * k];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const n = i + sy * j + sz * k, a = val(n) < 0, b = val(n + 1) < 0;
    if (a !== b) quad(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k), !a);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const n = i + sy * j + sz * k, a = val(n) < 0, b = val(n + sy) < 0;
    if (a !== b) quad(C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1), !a);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const n = i + sy * j + sz * k, a = val(n) < 0, b = val(n + sz) < 0;
    if (a !== b) quad(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k), !a);
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}


// ---------------------------------------------------------------- lattice cells
const TAU = Math.PI * 2;
// beam cells: segments in unit-cell coordinates
const S = (a, b) => [a, b];
const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const FACES = [[0.5, 0.5, 0], [0.5, 0.5, 1], [0.5, 0, 0.5], [0.5, 1, 0.5], [0, 0.5, 0.5], [1, 0.5, 0.5]];
function octet() {
  const segs = [];
  for (const f of FACES) {
    const ax = f.findIndex((v) => v === 0 || v === 1);
    for (const c of CORNERS) if (c[ax] === f[ax]) segs.push(S(f, c));
  }
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const a = FACES[i], b = FACES[j];
    const ai = a.findIndex((v) => v !== 0.5), bi = b.findIndex((v) => v !== 0.5);
    if (ai !== bi) segs.push(S(a, b));
  }
  return segs;
}
export const BEAMS = {
  cross: [S([0, 0.5, 0.5], [1, 0.5, 0.5]), S([0.5, 0, 0.5], [0.5, 1, 0.5]), S([0.5, 0.5, 0], [0.5, 0.5, 1])],
  xcell: [S([0, 0, 0], [1, 1, 1]), S([1, 0, 0], [0, 1, 1]), S([0, 1, 0], [1, 0, 1]), S([0, 0, 1], [1, 1, 0])],
  octet: octet(),
};
export const CELL_KIND = { gyroid: "tpms", schwarzP: "tpms", schwarzD: "tpms", x25d: "wall", honeycomb: "wall", octet: "beam", xcell: "beam", cross: "beam" };

function segDist(px, py, pz, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L2 = dx * dx + dy * dy + dz * dz || 1e-18;
  let u = ((px - a[0]) * dx + (py - a[1]) * dy + (pz - a[2]) * dz) / L2;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const qx = a[0] + u * dx - px, qy = a[1] + u * dy - py, qz = a[2] + u * dz - pz;
  return Math.sqrt(qx * qx + qy * qy + qz * qz);
}
const fract = (v) => v - Math.floor(v);

/**
 * Lattice field at p (mm, in the lattice frame): negative inside material, roughly a distance in mm.
 * c = [cx, cy, cz] cell size, thick = beam diameter / wall thickness, solidity 0..1 (TPMS sheets).
 */
export function latticeValue(type, x, y, z, c, thick, solidity, segsWorld) {
  const kind = CELL_KIND[type];
  if (kind === "tpms") {
    const X = (TAU * x) / c[0], Y = (TAU * y) / c[1], Z = (TAU * z) / c[2];
    let g, range;
    if (type === "gyroid") { g = Math.sin(X) * Math.cos(Y) + Math.sin(Y) * Math.cos(Z) + Math.sin(Z) * Math.cos(X); range = 1.5; }
    else if (type === "schwarzP") { g = Math.cos(X) + Math.cos(Y) + Math.cos(Z); range = 3; }
    else { g = Math.sin(X) * Math.sin(Y) * Math.sin(Z) + Math.sin(X) * Math.cos(Y) * Math.cos(Z) + Math.cos(X) * Math.sin(Y) * Math.cos(Z) + Math.cos(X) * Math.cos(Y) * Math.sin(Z); range = 1.41; }
    const t = Math.max(0.02, Math.min(0.98, solidity)) * range * 0.9;
    const cm = (c[0] + c[1] + c[2]) / 3;
    return ((Math.abs(g) - t) * cm) / (TAU * (type === "schwarzP" ? 1.1 : 1.0));
  }
  const r = thick / 2;
  const u = fract(x / c[0]), v = fract(y / c[1]), w = fract(z / c[2]);
  if (type === "x25d") {
    // two diagonal walls in XY, extruded along Z
    const px = u * c[0], py = v * c[1];
    const d1 = Math.abs(px * c[1] - py * c[0]) / Math.hypot(c[0], c[1]);
    const d2 = Math.abs(px * c[1] + py * c[0] - c[0] * c[1]) / Math.hypot(c[0], c[1]);
    return Math.min(d1, d2) - r;
  }
  if (type === "honeycomb") {
    // pointy-top hexagon walls (flat-to-flat c[0]) in XY, extruded along Z
    const wv = c[0], rh = (wv * Math.sqrt(3)) / 2;
    const jr = Math.round(y / rh);
    let best = Infinity;
    for (let jj = jr - 1; jj <= jr + 1; jj++) {
      const off = jj & 1 ? wv / 2 : 0;
      const ii = Math.round((x - off) / wv);
      for (let i2 = ii - 1; i2 <= ii + 1; i2++) {
        const qx = Math.abs(x - (i2 * wv + off)), qy = Math.abs(y - jj * rh);
        const hn = Math.max(qx, qx / 2 + (qy * Math.sqrt(3)) / 2);
        if (hn < best) best = hn;
      }
    }
    return Math.abs(best - wv / 2) - r;
  }
  const px = u * c[0], py = v * c[1], pz = w * c[2];
  let d = Infinity;
  for (const s of segsWorld) { const q = segDist(px, py, pz, s[0], s[1]); if (q < d) d = q; }
  return d - r;
}
/** Beam segments of a cell type scaled to the cell size. */
export function scaledSegments(type, c) {
  return (BEAMS[type] || []).map(([a, b]) => [[a[0] * c[0], a[1] * c[1], a[2] * c[2]], [b[0] * c[0], b[1] * c[1], b[2] * c[2]]]);
}

// ---------------------------------------------------------------- textures (height 0..1)
function hash3(i, j, k, seed) {
  let n = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 144269504) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967295;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(i, j, k, seed, x, y, z) {
  const hsh = Math.floor(hash3(i, j, k, seed) * 12);
  const G = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]][hsh];
  return G[0] * x + G[1] * y + G[2] * z;
}
/** Perlin gradient noise in [-1, 1]. */
export function perlin(x, y, z, seed) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const fx = x - i, fy = y - j, fz = z - k;
  const u = fade(fx), v = fade(fy), w = fade(fz);
  const L = (a, b, t) => a + (b - a) * t;
  const n000 = grad(i, j, k, seed, fx, fy, fz), n100 = grad(i + 1, j, k, seed, fx - 1, fy, fz);
  const n010 = grad(i, j + 1, k, seed, fx, fy - 1, fz), n110 = grad(i + 1, j + 1, k, seed, fx - 1, fy - 1, fz);
  const n001 = grad(i, j, k + 1, seed, fx, fy, fz - 1), n101 = grad(i + 1, j, k + 1, seed, fx - 1, fy, fz - 1);
  const n011 = grad(i, j + 1, k + 1, seed, fx, fy - 1, fz - 1), n111 = grad(i + 1, j + 1, k + 1, seed, fx - 1, fy - 1, fz - 1);
  return L(L(L(n000, n100, u), L(n010, n110, u), v), L(L(n001, n101, u), L(n011, n111, u), v), w);
}
/** Value noise in [0, 1]. */
function valueNoise(x, y, z, seed) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const u = fade(x - i), v = fade(y - j), w = fade(z - k);
  const L = (a, b, t) => a + (b - a) * t;
  const h = (a, b, c) => hash3(i + a, j + b, k + c, seed);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
/** Voronoi F1, F2 (cell units). */
function voronoi(x, y, z, seed, manhattan) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  let f1 = Infinity, f2 = Infinity;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const ci = i + a, cj = j + b, ck = k + c;
    const px = ci + hash3(ci, cj, ck, seed), py = cj + hash3(ci, cj, ck, seed + 7), pz = ck + hash3(ci, cj, ck, seed + 13);
    const dx = px - x, dy = py - y, dz = pz - z;
    const d = manhattan ? Math.abs(dx) + Math.abs(dy) + Math.abs(dz) : Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return [f1, f2];
}

/** Texture height in [0, 1] at p (mm). o = {pattern, scale, amplitude, octaves, persistence, seed, manhattan}. */
export function textureValue(o, x, y, z) {
  const s = o.scale;
  const X = x / s, Y = y / s, Z = z / s;
  const seed = o.seed | 0;
  const fbm = (fn) => {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < Math.max(1, o.octaves | 0); i++) { sum += a * fn(X * f, Y * f, Z * f, seed + i * 31); norm += a; a *= o.persistence; f *= 2; }
    return sum / norm;
  };
  let v;
  switch (o.pattern) {
    case "perlin": v = 0.5 + 0.5 * fbm(perlin) * 1.6; break;
    case "noise": v = fbm(valueNoise); break;
    case "voronoi": { const [f1, f2] = voronoi(X, Y, Z, seed, o.manhattan); v = 1 - Math.min(1, (f2 - f1) * 4); break; }
    case "leather": { const [f1, f2] = voronoi(X, Y, Z, seed, o.manhattan); v = Math.min(1, 0.65 * (1 - Math.min(1, (f2 - f1) * 6)) + 0.35 * valueNoise(X * 4, Y * 4, Z * 4, seed)); break; }
    case "stripe": v = 0.5 + 0.5 * Math.sin(TAU * X); break;
    case "woodGrain": { const r = Math.hypot(X, Y) + 0.35 * perlin(X * 0.5, Y * 0.5, Z * 0.2, seed); v = 0.5 + 0.5 * Math.sin(TAU * r * 2); break; }
    case "gyroid": { const g = Math.sin(TAU * X) * Math.cos(TAU * Y) + Math.sin(TAU * Y) * Math.cos(TAU * Z) + Math.sin(TAU * Z) * Math.cos(TAU * X); v = 0.5 + g / 3; break; }
    case "checkerBoard": v = (Math.floor(X) + Math.floor(Y) + Math.floor(Z)) & 1 ? 1 : 0; break;
    default: v = 0;
  }
  v = v < 0 ? 0 : v > 1 ? 1 : v;
  return v * o.amplitude;
}
