// Catmull-Clark subdivision with sharp creases, boundaries and corners (written from scratch for the Form module).
//
// Input cage: {v:[[x,y,z]], f:[[i...]], crease:[[a,b]], cv:[i]} (any polygons, CCW = outward).
// Rules per step: face point = centroid; edge point = midpoint on sharp edges (creases, boundary), else
// (a + b + fpL + fpR) / 4; vertex point = fixed on corners (creased vertices, >= 3 sharp edges, valence-2
// boundary corners), (a + 6v + b) / 8 on crease / boundary curves, (Q + 2R + (n - 3) v) / n elsewhere.
// Creases propagate to the child edges (infinitely sharp, like a creased T-spline edge).
// Vertex indices are kept from level to level (vertex points first, then edge points, then face points), so
// cage vertex i is vertex i at every level. The final level is projected onto the limit surface.
// The result also carries, per cage edge, the chain of final-level vertices along it (the edge's curve on
// the surface) and, per cage quad (or per corner of other polygons), the grid of final-level vertices covering
// it (used by the B-rep conversion to fit one bicubic B-spline patch per grid).

const KB = 2097152; // 2^21: numeric edge keys a * KB + b (a < b)
export const ekey = (a, b) => (a < b ? a * KB + b : b * KB + a);

function edgeTable(F) {
  const emap = new Map();
  const E = [];
  const eF = [];
  for (let f = 0; f < F.length; f++) {
    const fc = F[f];
    for (let i = 0; i < fc.length; i++) {
      const a = fc[i], b = fc[(i + 1) % fc.length];
      const k = ekey(a, b);
      let e = emap.get(k);
      if (e === undefined) { e = E.length / 2; emap.set(k, e); E.push(a < b ? a : b, a < b ? b : a); eF.push([f]); }
      else eF[e].push(f);
    }
  }
  return { emap, E, eF };
}

/** One Catmull-Clark step. m = {P: Float64Array, F, sharp: Set(ekey), corner: Set(v), group: Int32Array}. */
function step(m, track) {
  const { P, F } = m;
  const nv = P.length / 3, nf = F.length;
  const { emap, E, eF } = edgeTable(F);
  const ne = E.length / 2;
  const out = new Float64Array((nv + ne + nf) * 3);
  // face points
  const FP = nv + ne;
  for (let f = 0; f < nf; f++) {
    const fc = F[f];
    let x = 0, y = 0, z = 0;
    for (const v of fc) { x += P[3 * v]; y += P[3 * v + 1]; z += P[3 * v + 2]; }
    const k = 1 / fc.length, o = 3 * (FP + f);
    out[o] = x * k; out[o + 1] = y * k; out[o + 2] = z * k;
  }
  // edge points
  const isSharp = new Uint8Array(ne);
  for (let e = 0; e < ne; e++) {
    const a = E[2 * e], b = E[2 * e + 1];
    const sh = eF[e].length !== 2 || m.sharp.has(a * KB + b);
    isSharp[e] = sh ? 1 : 0;
    const o = 3 * (nv + e);
    if (sh) {
      for (let c = 0; c < 3; c++) out[o + c] = (P[3 * a + c] + P[3 * b + c]) / 2;
    } else {
      const f0 = 3 * (FP + eF[e][0]), f1 = 3 * (FP + eF[e][1]);
      for (let c = 0; c < 3; c++) out[o + c] = (P[3 * a + c] + P[3 * b + c] + out[f0 + c] + out[f1 + c]) / 4;
    }
  }
  // vertex adjacency
  const vE = Array.from({ length: nv }, () => []);
  const vF = Array.from({ length: nv }, () => []);
  for (let e = 0; e < ne; e++) { vE[E[2 * e]].push(e); vE[E[2 * e + 1]].push(e); }
  for (let f = 0; f < nf; f++) for (const v of F[f]) vF[v].push(f);
  for (let v = 0; v < nv; v++) {
    const o = 3 * v;
    const es = vE[v];
    let s = 0, s0 = -1, s1 = -1;
    for (const e of es) if (isSharp[e]) { if (s === 0) s0 = e; else if (s === 1) s1 = e; s++; }
    const boundaryCorner = es.length === 2 && s === 2 && vF[v].length === 1;
    if (!es.length || m.corner.has(v) || s >= 3 || boundaryCorner) {
      out[o] = P[o]; out[o + 1] = P[o + 1]; out[o + 2] = P[o + 2];
    } else if (s === 2) {
      const a = E[2 * s0] === v ? E[2 * s0 + 1] : E[2 * s0];
      const b = E[2 * s1] === v ? E[2 * s1 + 1] : E[2 * s1];
      for (let c = 0; c < 3; c++) out[o + c] = (P[3 * a + c] + 6 * P[o + c] + P[3 * b + c]) / 8;
    } else {
      const n = es.length;
      if (n < 3 || vF[v].length < 2) { out[o] = P[o]; out[o + 1] = P[o + 1]; out[o + 2] = P[o + 2]; continue; }
      const Q = [0, 0, 0], R = [0, 0, 0];
      for (const f of vF[v]) { const q = 3 * (FP + f); Q[0] += out[q]; Q[1] += out[q + 1]; Q[2] += out[q + 2]; }
      for (const e of es) { const a = E[2 * e], b = E[2 * e + 1]; for (let c = 0; c < 3; c++) R[c] += (P[3 * a + c] + P[3 * b + c]) / 2; }
      const kf = 1 / vF[v].length, ke = 1 / n;
      for (let c = 0; c < 3; c++) out[o + c] = (Q[c] * kf + 2 * R[c] * ke + (n - 3) * P[o + c]) / n;
    }
  }
  // faces (children of face f are contiguous, child k holds corner k)
  const NF = [];
  const group = new Int32Array(F.reduce((s, fc) => s + fc.length, 0));
  const start = new Int32Array(nf);
  for (let f = 0; f < nf; f++) {
    const fc = F[f], n = fc.length;
    start[f] = NF.length;
    for (let k = 0; k < n; k++) {
      const a = fc[k], b = fc[(k + 1) % n], p = fc[(k + n - 1) % n];
      group[NF.length] = m.group[f];
      NF.push([a, nv + emap.get(ekey(a, b)), FP + f, nv + emap.get(ekey(p, a))]);
    }
  }
  // creases propagate (boundary edges are sharp by having one face)
  const sharp = new Set();
  for (const k of m.sharp) {
    const a = Math.floor(k / KB), b = k - a * KB;
    const e = emap.get(k);
    if (e === undefined) continue;
    sharp.add(ekey(a, nv + e)); sharp.add(ekey(nv + e, b));
  }
  const res = { P: out, F: NF, sharp, corner: m.corner, group };
  if (track) {
    // edge chains
    for (const [key, ch] of track.chains) {
      const nc = new Int32Array(ch.length * 2 - 1);
      for (let i = 0; i < ch.length - 1; i++) { nc[2 * i] = ch[i]; nc[2 * i + 1] = nv + emap.get(ekey(ch[i], ch[i + 1])); }
      nc[nc.length - 1] = ch[ch.length - 1];
      track.chains.set(key, nc);
    }
    // patch grids
    for (const g of track.grids) {
      if (g.G === null) {
        // n-gon corner grid, born at level 1
        const fc = F[g.face], n = fc.length, k = g.k;
        const a = fc[k], b = fc[(k + 1) % n], p = fc[(k + n - 1) % n];
        g.n = 2;
        g.G = Int32Array.from([a, nv + emap.get(ekey(p, a)), nv + emap.get(ekey(a, b)), FP + g.face]); // G[i*n + j]: i = u, j = v
        g.C = Int32Array.from([start[g.face] + k]);
        continue;
      }
      const n = g.n, m1 = n - 1, N = 2 * m1 + 1;
      const G = g.G, C = g.C;
      const G2 = new Int32Array(N * N), C2 = new Int32Array(4 * m1 * m1);
      const at = (i, j) => G[i * n + j];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) G2[2 * i * N + 2 * j] = at(i, j);
      for (let i = 0; i < m1; i++) for (let j = 0; j < n; j++) G2[(2 * i + 1) * N + 2 * j] = nv + emap.get(ekey(at(i, j), at(i + 1, j)));
      for (let i = 0; i < n; i++) for (let j = 0; j < m1; j++) G2[2 * i * N + 2 * j + 1] = nv + emap.get(ekey(at(i, j), at(i, j + 1)));
      for (let i = 0; i < m1; i++) for (let j = 0; j < m1; j++) {
        const phi = C[i * m1 + j];
        G2[(2 * i + 1) * N + 2 * j + 1] = FP + phi;
        const fc = F[phi];
        const child = (v) => start[phi] + fc.indexOf(v);
        const M = 2 * m1;
        C2[2 * i * M + 2 * j] = child(at(i, j));
        C2[(2 * i + 1) * M + 2 * j] = child(at(i + 1, j));
        C2[(2 * i + 1) * M + 2 * j + 1] = child(at(i + 1, j + 1));
        C2[2 * i * M + 2 * j + 1] = child(at(i, j + 1));
      }
      g.n = N; g.G = G2; g.C = C2;
    }
  }
  return res;
}

/** Limit positions of a mesh whose faces are all quads (any level >= 1). */
function limitProject(m) {
  const { P, F } = m;
  const nv = P.length / 3;
  const { E, eF } = edgeTable(F);
  const ne = E.length / 2;
  const vE = Array.from({ length: nv }, () => []);
  const vF = Array.from({ length: nv }, () => []);
  for (let e = 0; e < ne; e++) { vE[E[2 * e]].push(e); vE[E[2 * e + 1]].push(e); }
  for (let f = 0; f < F.length; f++) for (const v of F[f]) vF[v].push(f);
  const L = new Float64Array(P.length);
  for (let v = 0; v < nv; v++) {
    const o = 3 * v, es = vE[v];
    let s = 0, s0 = -1, s1 = -1;
    for (const e of es) {
      const a = E[2 * e], b = E[2 * e + 1];
      if (eF[e].length !== 2 || m.sharp.has(a * KB + b)) { if (s === 0) s0 = e; else if (s === 1) s1 = e; s++; }
    }
    const boundaryCorner = es.length === 2 && s === 2 && vF[v].length === 1;
    if (!es.length || m.corner.has(v) || s >= 3 || boundaryCorner) { L[o] = P[o]; L[o + 1] = P[o + 1]; L[o + 2] = P[o + 2]; continue; }
    if (s === 2) {
      const a = E[2 * s0] === v ? E[2 * s0 + 1] : E[2 * s0];
      const b = E[2 * s1] === v ? E[2 * s1 + 1] : E[2 * s1];
      for (let c = 0; c < 3; c++) L[o + c] = (P[3 * a + c] + 4 * P[o + c] + P[3 * b + c]) / 6;
      continue;
    }
    const n = es.length;
    if (n < 3 || vF[v].length !== n) { L[o] = P[o]; L[o + 1] = P[o + 1]; L[o + 2] = P[o + 2]; continue; }
    const acc = [n * n * P[o], n * n * P[o + 1], n * n * P[o + 2]];
    for (const e of es) { const w = E[2 * e] === v ? E[2 * e + 1] : E[2 * e]; for (let c = 0; c < 3; c++) acc[c] += 4 * P[3 * w + c]; }
    for (const f of vF[v]) {
      const fc = F[f];
      const d = fc[(fc.indexOf(v) + 2) % 4];
      for (let c = 0; c < 3; c++) acc[c] += P[3 * d + c];
    }
    const k = 1 / (n * (n + 5));
    for (let c = 0; c < 3; c++) L[o + c] = acc[c] * k;
  }
  return L;
}

function cageMesh(cage) {
  const P = new Float64Array(cage.v.length * 3);
  cage.v.forEach((p, i) => { P[3 * i] = p[0]; P[3 * i + 1] = p[1]; P[3 * i + 2] = p[2]; });
  const sharp = new Set();
  for (const [a, b] of cage.crease || []) sharp.add(ekey(a, b));
  return { P, F: cage.f.map((fc) => fc.slice()), sharp, corner: new Set(cage.cv || []), group: Int32Array.from(cage.f.map((_, i) => i)) };
}

/**
 * Subdivide a cage `levels` times (>= 1) and project onto the limit surface.
 * opts.track: also return edge chains and patch grids.
 */
export function subdivide(cage, levels = 3, opts = {}) {
  let m = cageMesh(cage);
  const track = opts.track ? { chains: new Map(), grids: [] } : null;
  if (track) {
    for (const fc of cage.f) for (let i = 0; i < fc.length; i++) {
      const a = fc[i], b = fc[(i + 1) % fc.length];
      const k = ekey(a, b);
      if (!track.chains.has(k)) track.chains.set(k, Int32Array.from(a < b ? [a, b] : [b, a]));
    }
    cage.f.forEach((fc, f) => {
      if (fc.length === 4) track.grids.push({ face: f, k: -1, n: 2, G: Int32Array.from([fc[0], fc[3], fc[1], fc[2]]), C: Int32Array.from([f]) });
      else for (let k = 0; k < fc.length; k++) track.grids.push({ face: f, k, n: 0, G: null, C: null });
    });
  }
  const L = Math.max(1, levels | 0);
  for (let i = 0; i < L; i++) m = step(m, track);
  const limit = limitProject(m);
  return { P: limit, raw: m.P, F: m.F, group: m.group, sharp: m.sharp, nv0: cage.v.length, level: L, chains: track ? track.chains : null, grids: track ? track.grids : null };
}

/** Limit-surface positions of the cage vertices themselves (one subdivision step + limit stencil). */
export function limitOfCage(cage) {
  if (!cage.f.length) return cage.v.map((p) => p.slice());
  const s = subdivide(cage, 1);
  return cage.v.map((_, i) => [s.P[3 * i], s.P[3 * i + 1], s.P[3 * i + 2]]);
}

/**
 * Triangle mesh of a subdivision result: shared vertices except across sharp edges (split normals there),
 * area-weighted normals, groups = cage face per triangle, ranges[f] = [firstTriangle, count].
 */
export function displayMesh(sub, nCageFaces) {
  const { P, F, group, sharp } = sub;
  const nf = F.length;
  const { E, eF, emap } = edgeTable(F);
  // corner union-find across smooth edges
  const parent = new Int32Array(nf * 4).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let e = 0; e < E.length / 2; e++) {
    const fs = eF[e];
    if (fs.length !== 2) continue;
    const a = E[2 * e], b = E[2 * e + 1];
    if (sharp.has(a * KB + b)) continue;
    const [f1, f2] = fs;
    unite(4 * f1 + F[f1].indexOf(a), 4 * f2 + F[f2].indexOf(a));
    unite(4 * f1 + F[f1].indexOf(b), 4 * f2 + F[f2].indexOf(b));
  }
  void emap;
  // face normals (Newell, area-weighted)
  const fn = new Float64Array(nf * 3);
  for (let f = 0; f < nf; f++) {
    const fc = F[f];
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < 4; i++) {
      const a = 3 * fc[i], b = 3 * fc[(i + 1) % 4];
      x += (P[a + 1] - P[b + 1]) * (P[a + 2] + P[b + 2]);
      y += (P[a + 2] - P[b + 2]) * (P[a] + P[b]);
      z += (P[a] - P[b]) * (P[a + 1] + P[b + 1]);
    }
    fn[3 * f] = x / 2; fn[3 * f + 1] = y / 2; fn[3 * f + 2] = z / 2;
  }
  const cls = new Int32Array(nf * 4).fill(-1);
  const idOf = new Map();
  const pos = [], nrm = [];
  for (let c = 0; c < nf * 4; c++) {
    const r = find(c);
    let id = idOf.get(r);
    if (id === undefined) {
      id = pos.length / 3;
      idOf.set(r, id);
      const v = F[(c / 4) | 0][c % 4];
      pos.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]);
      nrm.push(0, 0, 0);
    }
    cls[c] = id;
    const f = (c / 4) | 0;
    nrm[3 * id] += fn[3 * f]; nrm[3 * id + 1] += fn[3 * f + 1]; nrm[3 * id + 2] += fn[3 * f + 2];
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
  }
  const idx = new Uint32Array(nf * 6);
  const groups = new Uint32Array(nf * 2);
  const d2 = (a, b) => { const x = P[3 * a] - P[3 * b], y = P[3 * a + 1] - P[3 * b + 1], z = P[3 * a + 2] - P[3 * b + 2]; return x * x + y * y + z * z; };
  for (let f = 0; f < nf; f++) {
    const fc = F[f], c0 = cls[4 * f], c1 = cls[4 * f + 1], c2 = cls[4 * f + 2], c3 = cls[4 * f + 3];
    const o = 6 * f;
    if (d2(fc[0], fc[2]) <= d2(fc[1], fc[3])) { idx.set([c0, c1, c2, c0, c2, c3], o); }
    else { idx.set([c0, c1, c3, c1, c2, c3], o); }
    groups[2 * f] = groups[2 * f + 1] = group[f];
  }
  const ranges = [];
  for (let f = 0; f < nf; f++) {
    const g = group[f];
    if (!ranges[g]) ranges[g] = [2 * f, 0];
    ranges[g][1] += 2;
  }
  for (let g = 0; g < (nCageFaces || 0); g++) if (!ranges[g]) ranges[g] = [0, 0];
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nrm), indices: idx, groups, ranges };
}

/** Flat-shaded triangle mesh of the cage polygons themselves (Box display). */
export function boxMesh(cage) {
  const pos = [], nrm = [], idx = [], groups = [], ranges = [];
  cage.f.forEach((fc, f) => {
    const pts = fc.map((i) => cage.v[i]);
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const l = Math.hypot(x, y, z) || 1;
    const base = pos.length / 3;
    for (const p of pts) { pos.push(p[0], p[1], p[2]); nrm.push(x / l, y / l, z / l); }
    ranges[f] = [idx.length / 3, pts.length - 2];
    for (let i = 1; i < pts.length - 1; i++) { idx.push(base, base + i, base + i + 1); groups.push(f); }
  });
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nrm), indices: Uint32Array.from(idx), groups: Uint32Array.from(groups), ranges };
}
