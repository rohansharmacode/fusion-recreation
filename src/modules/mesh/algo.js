// Mesh algorithms of the MESH tab (plain JS, no three.js / DOM: usable in node tests).
// Work mesh W = {P: number[] (x,y,z per vertex), T: number[] (a,b,c per triangle, counter-clockwise = outward),
//                G: number[] (face group per triangle), hasGroups: bool}
// fromMesh / toMesh convert from / to the src/meshdata.js format ({positions, indices, groups?}).
// Every operation returns a NEW work mesh or edits the one it is given (callers pass copies: cached
// evaluation states share their meshes).

// ------------------------------------------------------------------ vectors
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------------ conversion
/** Work mesh from a meshdata mesh (indexed or soup; soups are welded). */
export function fromMesh(m) {
  if (!m || !m.positions) return { P: [], T: [], G: [], hasGroups: false };
  let P, T;
  if (m.indices) { P = Array.from(m.positions); T = Array.from(m.indices); }
  else { const w = weldArrays(Array.from(m.positions), null, 0); P = w.P; T = w.T; }
  const n = T.length / 3;
  const G = m.groups && m.groups.length >= n ? Array.from(m.groups).slice(0, n) : new Array(n).fill(0);
  return { P, T, G, hasGroups: !!m.groups };
}
/** meshdata mesh from a work mesh (unused vertices dropped). */
export function toMesh(W, extra = {}) {
  const C = compact(W);
  const out = { positions: Float32Array.from(C.P), indices: Uint32Array.from(C.T) };
  if (C.hasGroups) out.groups = Uint32Array.from(C.G.map((g) => (g >= 0 ? g : 0)));
  if (C.Q) out.quadPair = Int32Array.from(C.Q);
  return Object.assign(out, extra);
}
export const clone = (W) => ({ P: W.P.slice(), T: W.T.slice(), G: W.G.slice(), hasGroups: W.hasGroups, Q: W.Q ? W.Q.slice() : undefined });
export const vcount = (W) => (W.P.length / 3) | 0;
export const tcount = (W) => (W.T.length / 3) | 0;
export const vtx = (W, i) => [W.P[3 * i], W.P[3 * i + 1], W.P[3 * i + 2]];
function setV(W, i, p) { W.P[3 * i] = p[0]; W.P[3 * i + 1] = p[1]; W.P[3 * i + 2] = p[2]; }
function addV(W, p) { W.P.push(p[0], p[1], p[2]); return W.P.length / 3 - 1; }

/** Drop unused vertices and dead triangles (T entries < 0). */
export function compact(W) {
  const n = vcount(W);
  const map = new Int32Array(n).fill(-1);
  const P = [], T = [], G = [];
  const Q = W.Q ? [] : null;
  const tmap = W.Q ? new Int32Array(tcount(W)).fill(-1) : null;
  for (let t = 0; t < W.T.length / 3; t++) {
    const a = W.T[3 * t], b = W.T[3 * t + 1], c = W.T[3 * t + 2];
    if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) continue;
    for (const v of [a, b, c]) if (map[v] < 0) { map[v] = P.length / 3; P.push(W.P[3 * v], W.P[3 * v + 1], W.P[3 * v + 2]); }
    if (tmap) tmap[t] = T.length / 3;
    T.push(map[a], map[b], map[c]);
    G.push(W.G[t] ?? 0);
  }
  if (Q) for (let t = 0; t < W.T.length / 3; t++) if (tmap[t] >= 0) Q.push(W.Q[t] >= 0 && tmap[W.Q[t]] >= 0 ? tmap[W.Q[t]] : -1);
  return { P, T, G, hasGroups: W.hasGroups, Q: Q || undefined };
}

/** Merge vertices closer than tol (grid hashing); tol 0 = identical coordinates. Degenerate triangles dropped. */
export function weldArrays(P, T, tol) {
  const nIn = P.length / 3;
  const idx = T || Array.from({ length: nIn }, (_, i) => i);
  const q = tol > 0 ? (v) => Math.round(v / tol) : (v) => v;
  const map = new Map();
  const rep = new Int32Array(nIn).fill(-1);
  const outP = [];
  for (let i = 0; i < nIn; i++) {
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    const key = `${q(x)},${q(y)},${q(z)}`;
    let j = map.get(key);
    if (j === undefined && tol > 0) {
      // neighbouring cells (points near a cell border)
      const qx = q(x), qy = q(y), qz = q(z);
      outer: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const k = map.get(`${qx + dx},${qy + dy},${qz + dz}`);
        if (k !== undefined && Math.hypot(outP[3 * k] - x, outP[3 * k + 1] - y, outP[3 * k + 2] - z) <= tol) { j = k; break outer; }
      }
    }
    if (j === undefined) { j = outP.length / 3; map.set(key, j); outP.push(x, y, z); }
    rep[i] = j;
  }
  const outT = [];
  const keep = [];
  for (let t = 0; t < idx.length / 3; t++) {
    const a = rep[idx[3 * t]], b = rep[idx[3 * t + 1]], c = rep[idx[3 * t + 2]];
    if (a !== b && b !== c && a !== c) { outT.push(a, b, c); keep.push(t); }
  }
  return { P: outP, T: outT, keep };
}
/** Weld a work mesh in place (returns it). */
export function weld(W, tol = 0) {
  const r = weldArrays(W.P, W.T, tol);
  W.G = r.keep.map((t) => W.G[t] ?? 0);
  W.P = r.P; W.T = r.T;
  W.Q = undefined;
  return W;
}

// ------------------------------------------------------------------ measures
export function bbox(W) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < W.P.length; i += 3) for (let k = 0; k < 3; k++) { const v = W.P[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  return { min, max, size: W.P.length ? Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) : 0, c: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] };
}
export function triNormalRaw(W, t) {
  const a = 3 * W.T[3 * t], b = 3 * W.T[3 * t + 1], c = 3 * W.T[3 * t + 2], P = W.P;
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
  const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}
export const triNormal = (W, t) => norm(triNormalRaw(W, t));
export const triArea = (W, t) => len(triNormalRaw(W, t)) / 2;
export function triCentroid(W, t) {
  const P = W.P, a = 3 * W.T[3 * t], b = 3 * W.T[3 * t + 1], c = 3 * W.T[3 * t + 2];
  return [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3];
}
export function volume(W) {
  let v = 0;
  const P = W.P;
  for (let t = 0; t < W.T.length; t += 3) {
    const a = 3 * W.T[t], b = 3 * W.T[t + 1], c = 3 * W.T[t + 2];
    v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  return v / 6;
}
export function area(W) { let s = 0; for (let t = 0; t < tcount(W); t++) s += triArea(W, t); return s; }
export function avgEdge(W, sel = null) {
  let s = 0, n = 0;
  for (let t = 0; t < tcount(W); t++) {
    if (sel && !sel[t]) continue;
    for (let k = 0; k < 3; k++) {
      const a = W.T[3 * t + k], b = W.T[3 * t + ((k + 1) % 3)];
      s += Math.hypot(W.P[3 * a] - W.P[3 * b], W.P[3 * a + 1] - W.P[3 * b + 1], W.P[3 * a + 2] - W.P[3 * b + 2]);
      n++;
    }
  }
  return n ? s / n : 1;
}

// ------------------------------------------------------------------ topology
const ekey = (a, b, n) => (a < b ? a * n + b : b * n + a);
/** Undirected edge -> triangles: Map key -> [t...]. */
export function edgeTris(W) {
  const n = vcount(W) + 1;
  const m = new Map();
  for (let t = 0; t < W.T.length / 3; t++) {
    for (let k = 0; k < 3; k++) {
      const a = W.T[3 * t + k], b = W.T[3 * t + ((k + 1) % 3)];
      if (a < 0) continue;
      const key = ekey(a, b, n);
      const e = m.get(key);
      if (e) e.push(t); else m.set(key, [t]);
    }
  }
  return m;
}
/** Neighbour triangle across each edge k of t (edge k = T[3t+k] -> T[3t+(k+1)%3]): -1 boundary, -2 non-manifold. */
export function triNeighbors(W) {
  const n = vcount(W) + 1;
  const m = edgeTris(W);
  const N = new Int32Array(W.T.length).fill(-1);
  for (let t = 0; t < W.T.length / 3; t++) {
    for (let k = 0; k < 3; k++) {
      const a = W.T[3 * t + k], b = W.T[3 * t + ((k + 1) % 3)];
      if (a < 0) continue;
      const e = m.get(ekey(a, b, n));
      if (e.length === 2) N[3 * t + k] = e[0] === t ? e[1] : e[0];
      else if (e.length > 2) N[3 * t + k] = -2;
    }
  }
  return N;
}
/** Vertex -> triangles (CSR arrays). */
export function vertTris(W) {
  const n = vcount(W);
  const start = new Int32Array(n + 1);
  for (let i = 0; i < W.T.length; i++) if (W.T[i] >= 0) start[W.T[i] + 1]++;
  for (let v = 0; v < n; v++) start[v + 1] += start[v];
  const list = new Int32Array(start[n]);
  const fill = start.slice(0, n);
  for (let t = 0; t < W.T.length / 3; t++) for (let k = 0; k < 3; k++) { const v = W.T[3 * t + k]; if (v >= 0) list[fill[v]++] = t; }
  return { start, list, of: (v) => list.subarray(start[v], start[v + 1]) };
}
/** Vertex neighbours (Set per vertex). */
export function vertNeighbors(W) {
  const n = vcount(W);
  const N = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < W.T.length / 3; t++) {
    const a = W.T[3 * t], b = W.T[3 * t + 1], c = W.T[3 * t + 2];
    if (a < 0) continue;
    N[a].add(b); N[a].add(c); N[b].add(a); N[b].add(c); N[c].add(a); N[c].add(b);
  }
  return N;
}
/** Boundary half-edges (edges of one triangle only) as [a, b, t] in the triangle's direction. */
export function boundaryEdges(W) {
  const n = vcount(W) + 1;
  const m = edgeTris(W);
  const out = [];
  for (let t = 0; t < W.T.length / 3; t++) {
    for (let k = 0; k < 3; k++) {
      const a = W.T[3 * t + k], b = W.T[3 * t + ((k + 1) % 3)];
      if (a < 0) continue;
      if (m.get(ekey(a, b, n)).length === 1) out.push([a, b, t]);
    }
  }
  return out;
}
/** Boundary loops (vertex lists in the triangles' edge direction). Open chains (non-manifold) are returned too. */
export function boundaryLoops(W) {
  const be = boundaryEdges(W);
  const from = new Map();
  for (const e of be) { const l = from.get(e[0]); if (l) l.push(e); else from.set(e[0], [e]); }
  const used = new Set();
  const loops = [];
  for (const e0 of be) {
    if (used.has(e0)) continue;
    const loop = [];
    let e = e0;
    while (e && !used.has(e)) {
      used.add(e);
      loop.push(e[0]);
      const nx = (from.get(e[1]) || []).filter((x) => !used.has(x));
      e = nx.length ? nx[0] : null;
    }
    if (loop.length >= 3) for (const l of splitPinched(loop)) loops.push(l);
  }
  return loops;
}
/** Split a boundary loop that passes a vertex twice (holes touching at a vertex) into simple loops. */
function splitPinched(loop) {
  const out = [];
  const stack = [loop];
  while (stack.length) {
    const L = stack.pop();
    const seen = new Map();
    let cut = null;
    for (let i = 0; i < L.length; i++) { if (seen.has(L[i])) { cut = [seen.get(L[i]), i]; break; } seen.set(L[i], i); }
    if (!cut) { if (L.length >= 3) out.push(L); continue; }
    const [i, j] = cut;
    stack.push(L.slice(i, j), [...L.slice(0, i), ...L.slice(j)]);
  }
  return out;
}
/** Edge-connected components: Int32Array comp per triangle + count. */
export function components(W, Nb = null) {
  const N = Nb || triNeighbors(W);
  const m = W.T.length / 3;
  const comp = new Int32Array(m).fill(-1);
  let c = 0;
  const stack = [];
  // non-manifold edges still connect: use the edge map for those
  let em = null;
  for (let s = 0; s < m; s++) {
    if (comp[s] >= 0 || W.T[3 * s] < 0) continue;
    comp[s] = c; stack.push(s);
    while (stack.length) {
      const t = stack.pop();
      for (let k = 0; k < 3; k++) {
        let nb = N[3 * t + k];
        if (nb === -2) {
          em = em || edgeTris(W);
          const n = vcount(W) + 1;
          for (const u of em.get(ekey(W.T[3 * t + k], W.T[3 * t + ((k + 1) % 3)], n))) if (comp[u] < 0) { comp[u] = c; stack.push(u); }
          continue;
        }
        if (nb >= 0 && comp[nb] < 0) { comp[nb] = c; stack.push(nb); }
      }
    }
    c++;
  }
  return { comp, count: c };
}
/** Quick analysis like Fusion's: closed, oriented, positive volume, shells, boundaries, triangles. */
export function analyze(W) {
  const n = vcount(W) + 1;
  const em = edgeTris(W);
  let open = 0, nonManifold = 0, flipped = 0;
  for (const [, ts] of em) { if (ts.length === 1) open++; else if (ts.length > 2) nonManifold++; }
  // orientation: a shared edge must run opposite in its two triangles
  const dir = new Map();
  for (let t = 0; t < W.T.length / 3; t++) for (let k = 0; k < 3; k++) {
    const a = W.T[3 * t + k], b = W.T[3 * t + ((k + 1) % 3)];
    const key = a * n + b;
    if (dir.has(key)) flipped++; else dir.set(key, t);
  }
  const vol = volume(W);
  const { count } = components(W);
  let degenerate = 0;
  const bb = bbox(W);
  const eps = (bb.size * 1e-7) ** 2;
  for (let t = 0; t < tcount(W); t++) if (triArea(W, t) <= eps) degenerate++;
  return { closed: open === 0 && nonManifold === 0, oriented: flipped === 0, positive: vol > 0, volume: vol, shells: count, openEdges: open, nonManifold, flipped, degenerate, triangles: tcount(W), vertices: vcount(W), holes: boundaryLoops(W).length };
}

// ------------------------------------------------------------------ selections
/** Uint8Array per triangle for a target {groups?, tris?} (null / empty = every triangle). */
export function selMask(W, target) {
  const m = tcount(W);
  const sel = new Uint8Array(m);
  const gs = target && target.groups && target.groups.length ? new Set(target.groups) : null;
  const ts = target && target.tris && target.tris.length ? target.tris : null;
  if (!gs && !ts) { sel.fill(1); return sel; }
  if (gs) for (let t = 0; t < m; t++) if (gs.has(W.G[t] ?? 0)) sel[t] = 1;
  if (ts) for (const t of ts) if (t >= 0 && t < m) sel[t] = 1;
  return sel;
}
export const allSelected = (sel) => { for (let i = 0; i < sel.length; i++) if (!sel[i]) return false; return true; };
/** Vertices only touched by selected triangles (free to move) + vertices on the selection border. */
export function selVerts(W, sel) {
  const n = vcount(W);
  const inS = new Uint8Array(n), outS = new Uint8Array(n);
  for (let t = 0; t < tcount(W); t++) for (let k = 0; k < 3; k++) { const v = W.T[3 * t + k]; if (v < 0) continue; if (sel[t]) inS[v] = 1; else outS[v] = 1; }
  const free = new Uint8Array(n), border = new Uint8Array(n);
  for (let v = 0; v < n; v++) { if (inS[v] && !outS[v]) free[v] = 1; else if (inS[v] && outS[v]) border[v] = 1; }
  return { free, border, inS };
}
export function nextGroup(W) { let g = -1; for (const x of W.G) if (x > g) g = x; return g + 1; }

/** Open-boundary vertices (on an edge used by one triangle). */
export function boundaryVerts(W) {
  const b = new Uint8Array(vcount(W));
  for (const [a, c] of boundaryEdges(W)) { b[a] = 1; b[c] = 1; }
  return b;
}
/** Vertices on feature edges: open boundary, group borders, creases sharper than sharpDeg (0 = none), selection border. */
export function featureVerts(W, { sharpDeg = 0, groups = true, sel = null } = {}) {
  const n = vcount(W) + 1;
  const em = edgeTris(W);
  const f = new Uint8Array(vcount(W));
  const cos = sharpDeg > 0 ? Math.cos((sharpDeg * Math.PI) / 180) : 2;
  const fe = new Set();
  for (const [key, ts] of em) {
    let keep = ts.length !== 2;
    if (!keep && groups && W.G[ts[0]] !== W.G[ts[1]]) keep = true;
    if (!keep && sel && sel[ts[0]] !== sel[ts[1]]) keep = true;
    if (!keep && cos < 1.5 && dot(triNormal(W, ts[0]), triNormal(W, ts[1])) < cos) keep = true;
    if (keep) { const a = Math.floor(key / n), b = key % n; f[a] = 1; f[b] = 1; fe.add(key); }
  }
  return { verts: f, edges: fe, n };
}

// ------------------------------------------------------------------ normals
/** Angle-weighted vertex normals (Float64Array 3 per vertex). */
export function vertexNormals(W) {
  const N = new Float64Array(W.P.length);
  for (let t = 0; t < W.T.length / 3; t++) {
    const ids = [W.T[3 * t], W.T[3 * t + 1], W.T[3 * t + 2]];
    if (ids[0] < 0) continue;
    const p = ids.map((i) => vtx(W, i));
    const fn = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    for (let k = 0; k < 3; k++) {
      const u = norm(sub(p[(k + 1) % 3], p[k])), w = norm(sub(p[(k + 2) % 3], p[k]));
      const ang = Math.acos(Math.max(-1, Math.min(1, dot(u, w))));
      N[3 * ids[k]] += fn[0] * ang; N[3 * ids[k] + 1] += fn[1] * ang; N[3 * ids[k] + 2] += fn[2] * ang;
    }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}
/** Flip the winding of the triangles in sel (all when null). */
export function reverse(W, sel = null) {
  for (let t = 0; t < tcount(W); t++) {
    if (sel && !sel[t]) continue;
    const b = W.T[3 * t + 1]; W.T[3 * t + 1] = W.T[3 * t + 2]; W.T[3 * t + 2] = b;
  }
  return W;
}
/** Make orientation consistent inside each shell (BFS) and outward (positive shell volume). */
export function orient(W, { outward = true } = {}) {
  const m = tcount(W);
  const n = vcount(W) + 1;
  const em = edgeTris(W);
  const done = new Uint8Array(m);
  const shell = new Int32Array(m).fill(-1);
  let s = 0;
  const has = (t, a, b) => { for (let k = 0; k < 3; k++) if (W.T[3 * t + k] === a && W.T[3 * t + ((k + 1) % 3)] === b) return true; return false; };
  const flip = (t) => { const b = W.T[3 * t + 1]; W.T[3 * t + 1] = W.T[3 * t + 2]; W.T[3 * t + 2] = b; };
  for (let s0 = 0; s0 < m; s0++) {
    if (done[s0] || W.T[3 * s0] < 0) continue;
    const q = [s0];
    done[s0] = 1; shell[s0] = s;
    while (q.length) {
      const t = q.pop();
      for (let k = 0; k < 3; k++) {
        const a = W.T[3 * t + k], b = W.T[3 * t + ((k + 1) % 3)];
        const ts = em.get(ekey(a, b, n));
        if (!ts || ts.length !== 2) continue;
        const u = ts[0] === t ? ts[1] : ts[0];
        if (done[u]) continue;
        if (has(u, a, b)) flip(u); // a consistent neighbour runs the shared edge b -> a
        done[u] = 1; shell[u] = s; q.push(u);
      }
    }
    s++;
  }
  if (outward) {
    // flip shells with negative signed volume, unless the shell lies inside another one (an inner cavity wall)
    const vols = new Float64Array(s);
    const P = W.P;
    for (let t = 0; t < m; t++) {
      if (shell[t] < 0) continue;
      const a = 3 * W.T[3 * t], b = 3 * W.T[3 * t + 1], c = 3 * W.T[3 * t + 2];
      vols[shell[t]] += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    }
    let inner = null;
    if (s > 1) inner = nestedShells(W, shell, s);
    for (let k = 0; k < s; k++) {
      const wantPositive = !inner || inner[k] % 2 === 0;
      if ((vols[k] < 0) === wantPositive) for (let t = 0; t < m; t++) if (shell[t] === k) flip(t);
    }
  }
  return W;
}
/** Nesting depth per shell (how many other shells contain a point of it), by ray parity. */
function nestedShells(W, shell, s) {
  const rep = new Array(s).fill(-1);
  for (let t = 0; t < tcount(W); t++) if (shell[t] >= 0 && rep[shell[t]] < 0) rep[shell[t]] = t;
  const depth = new Array(s).fill(0);
  for (let k = 0; k < s; k++) {
    const p = triCentroid(W, rep[k]);
    for (let j = 0; j < s; j++) {
      if (j === k) continue;
      if (insideShell(W, shell, j, p)) depth[k]++;
    }
  }
  return depth;
}
function insideShell(W, shell, j, p) {
  // ray along a slightly skewed +x direction, count crossings
  const d = norm([1, 0.000731, 0.000419]);
  let c = 0;
  for (let t = 0; t < tcount(W); t++) {
    if (shell[t] !== j) continue;
    const h = rayTri(p, d, vtx(W, W.T[3 * t]), vtx(W, W.T[3 * t + 1]), vtx(W, W.T[3 * t + 2]));
    if (h !== null && h > 1e-9) c++;
  }
  return c % 2 === 1;
}
/** Moller-Trumbore: ray parameter of the hit or null. */
export function rayTri(o, d, a, b, c) {
  const e1 = sub(b, a), e2 = sub(c, a);
  const p = cross(d, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-14) return null;
  const inv = 1 / det;
  const s = sub(o, a);
  const u = dot(s, p) * inv;
  if (u < 0 || u > 1) return null;
  const q = cross(s, e1);
  const v = dot(d, q) * inv;
  if (v < 0 || u + v > 1) return null;
  return dot(e2, q) * inv;
}

// ------------------------------------------------------------------ cleaning
/** Remove degenerate (area ~0), duplicate and (optionally) small-shell triangles. */
export function clean(W, { areaEps = 0, smallShell = 0 } = {}) {
  const m = tcount(W);
  const seen = new Set();
  const kill = new Uint8Array(m);
  for (let t = 0; t < m; t++) {
    const a = W.T[3 * t], b = W.T[3 * t + 1], c = W.T[3 * t + 2];
    if (a === b || b === c || a === c || triArea(W, t) <= areaEps) { kill[t] = 1; continue; }
    const k = [a, b, c].sort((x, y) => x - y).join(",");
    if (seen.has(k)) kill[t] = 1; else seen.add(k);
  }
  if (smallShell > 0) {
    const { comp, count } = components(W);
    const sz = new Int32Array(count);
    for (let t = 0; t < m; t++) if (!kill[t]) sz[comp[t]]++;
    for (let t = 0; t < m; t++) if (sz[comp[t]] < smallShell) kill[t] = 1;
  }
  return filterTris(W, (t) => !kill[t]);
}
export function filterTris(W, keep) {
  const T = [], G = [];
  for (let t = 0; t < tcount(W); t++) if (keep(t)) { T.push(W.T[3 * t], W.T[3 * t + 1], W.T[3 * t + 2]); G.push(W.G[t] ?? 0); }
  return compact({ P: W.P, T, G, hasGroups: W.hasGroups });
}
/** Split boundary edges that have another boundary vertex lying on them (T-junctions after booleans / stitching). */
export function fixTJunctions(W, tol) {
  for (let pass = 0; pass < 3; pass++) {
    const be = boundaryEdges(W);
    if (!be.length) return W;
    const bv = new Set();
    for (const [a, b] of be) { bv.add(a); bv.add(b); }
    const cell = Math.max(tol * 20, avgEdge(W) * 1.5);
    const grid = new Map();
    const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    for (const v of bv) { const k = key(W.P[3 * v], W.P[3 * v + 1], W.P[3 * v + 2]); const l = grid.get(k); if (l) l.push(v); else grid.set(k, [v]); }
    const splits = new Map(); // tri -> {k, verts:[{v, s}]}
    let any = false;
    for (const [a, b, t] of be) {
      const A = vtx(W, a), B = vtx(W, b);
      const d = sub(B, A), L2 = dot(d, d);
      if (L2 < 1e-24) continue;
      const lo = [Math.min(A[0], B[0]) - tol, Math.min(A[1], B[1]) - tol, Math.min(A[2], B[2]) - tol];
      const hi = [Math.max(A[0], B[0]) + tol, Math.max(A[1], B[1]) + tol, Math.max(A[2], B[2]) + tol];
      const on = [];
      for (let ix = Math.floor(lo[0] / cell); ix <= Math.floor(hi[0] / cell); ix++)
        for (let iy = Math.floor(lo[1] / cell); iy <= Math.floor(hi[1] / cell); iy++)
          for (let iz = Math.floor(lo[2] / cell); iz <= Math.floor(hi[2] / cell); iz++) {
            for (const v of grid.get(`${ix},${iy},${iz}`) || []) {
              if (v === a || v === b) continue;
              const p = vtx(W, v);
              const s = dot(sub(p, A), d) / L2;
              if (s <= 1e-6 || s >= 1 - 1e-6) continue;
              const q = add(A, mul(d, s));
              if (len(sub(p, q)) <= tol) on.push({ v, s });
            }
          }
      if (!on.length || splits.has(t)) continue;
      let k = 0;
      for (; k < 3; k++) if (W.T[3 * t + k] === a && W.T[3 * t + ((k + 1) % 3)] === b) break;
      on.sort((x, y) => x.s - y.s);
      splits.set(t, { k, verts: on.map((o) => o.v) });
      any = true;
    }
    if (!any) return W;
    for (const [t, { k, verts }] of splits) {
      const a = W.T[3 * t + k], b = W.T[3 * t + ((k + 1) % 3)], c = W.T[3 * t + ((k + 2) % 3)];
      const chain = [a, ...verts, b];
      const g = W.G[t];
      W.T[3 * t] = chain[0]; W.T[3 * t + 1] = chain[1]; W.T[3 * t + 2] = c;
      for (let i = 1; i + 1 < chain.length; i++) { W.T.push(chain[i], chain[i + 1], c); W.G.push(g); }
    }
  }
  return W;
}

// ------------------------------------------------------------------ polygon triangulation
/** Newell normal of a 3D polygon. */
export function polyNormal(pts) {
  let n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
  }
  return n;
}
export function planeAxes(n) {
  n = norm(n);
  const x = norm(Math.abs(n[0]) < 0.9 ? cross([1, 0, 0], n) : cross([0, 1, 0], n));
  return { n, x: cross(n, x).map((v) => -v), y: x };
}
/**
 * Ear clipping of a simple 2D polygon given as point indices into pts2 (counter-clockwise or clockwise).
 * Returns triangles (index triples into pts2) oriented counter-clockwise in 2D.
 */
export function earClip(pts2, idx) {
  let V = idx.slice();
  // orientation
  let a2 = 0;
  for (let i = 0; i < V.length; i++) { const p = pts2[V[i]], q = pts2[V[(i + 1) % V.length]]; a2 += p[0] * q[1] - q[0] * p[1]; }
  if (a2 < 0) V.reverse();
  const out = [];
  const crs = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const inTri = (p, a, b, c) => crs(a, b, p) >= -1e-12 && crs(b, c, p) >= -1e-12 && crs(c, a, p) >= -1e-12;
  let guard = 0;
  while (V.length > 3 && guard++ < 100000) {
    let clipped = false;
    const n = V.length;
    for (let i = 0; i < n; i++) {
      const ia = V[(i + n - 1) % n], ib = V[i], ic = V[(i + 1) % n];
      const A = pts2[ia], B = pts2[ib], C = pts2[ic];
      if (crs(A, B, C) <= 1e-14) continue; // reflex or degenerate
      let ok = true;
      for (let j = 0; j < n; j++) {
        const v = V[j];
        if (v === ia || v === ib || v === ic) continue;
        const P = pts2[v];
        if ((P[0] === A[0] && P[1] === A[1]) || (P[0] === B[0] && P[1] === B[1]) || (P[0] === C[0] && P[1] === C[1])) continue;
        if (inTri(P, A, B, C)) { ok = false; break; }
      }
      if (!ok) continue;
      out.push([ia, ib, ic]);
      V.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      // numerical trouble: clip the most convex vertex anyway
      let best = 0, bv = -Infinity;
      for (let i = 0; i < V.length; i++) { const c = crs(pts2[V[(i + V.length - 1) % V.length]], pts2[V[i]], pts2[V[(i + 1) % V.length]]); if (c > bv) { bv = c; best = i; } }
      const n2 = V.length;
      out.push([V[(best + n2 - 1) % n2], V[best], V[(best + 1) % n2]]);
      V.splice(best, 1);
    }
  }
  if (V.length === 3) out.push([V[0], V[1], V[2]]);
  return out;
}
/**
 * Triangulate polygons with holes in 2D: outer (ccw after normalisation) + holes (index arrays into pts2).
 * Holes are bridged to the outer boundary (rightmost vertex, like earcut), then ear clipped.
 */
export function triangulateWithHoles(pts2, outer, holes = []) {
  const area2 = (L) => { let s = 0; for (let i = 0; i < L.length; i++) { const p = pts2[L[i]], q = pts2[L[(i + 1) % L.length]]; s += p[0] * q[1] - q[0] * p[1]; } return s; };
  let O = outer.slice();
  if (area2(O) < 0) O.reverse();
  const Hs = holes.map((h) => (area2(h) > 0 ? h.slice().reverse() : h.slice()));
  Hs.sort((a, b) => Math.max(...b.map((i) => pts2[i][0])) - Math.max(...a.map((i) => pts2[i][0])));
  for (const H of Hs) {
    let mi = 0;
    for (let i = 1; i < H.length; i++) if (pts2[H[i]][0] > pts2[H[mi]][0]) mi = i;
    const M = pts2[H[mi]];
    // nearest outer edge hit by the ray +x from M
    let best = -1, bx = Infinity;
    for (let i = 0; i < O.length; i++) {
      const a = pts2[O[i]], b = pts2[O[(i + 1) % O.length]];
      if ((a[1] > M[1]) === (b[1] > M[1])) continue;
      const x = a[0] + ((M[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
      if (x >= M[0] - 1e-12 && x < bx) { bx = x; best = a[0] > b[0] ? i : (i + 1) % O.length; }
    }
    if (best < 0) {
      // fall back: nearest outer vertex
      let bd = Infinity;
      for (let i = 0; i < O.length; i++) { const p = pts2[O[i]]; const d = (p[0] - M[0]) ** 2 + (p[1] - M[1]) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    const rotated = [...H.slice(mi), ...H.slice(0, mi), H[mi]];
    O = [...O.slice(0, best + 1), ...rotated, O[best], ...O.slice(best + 1)];
  }
  return earClip(pts2, O);
}

// ------------------------------------------------------------------ hole filling
/**
 * Fill boundary loops. loops: vertex index lists in boundary (triangle edge) direction. The patch triangles are
 * oriented to match the surrounding mesh. type 'minimal' (ear clipping), 'uniform' (refined + relaxed membrane),
 * 'smooth' (refined, relaxed and curved to continue the surface). Returns the new triangle indices.
 */
export function fillLoops(W, loops, { type = "minimal", group = null, edge = 0 } = {}) {
  const made = [];
  for (const loop of loops) {
    if (loop.length < 3) continue;
    const pts = loop.map((v) => vtx(W, v));
    const ax = planeAxes(polyNormal(pts.slice().reverse()));
    const c = pts.reduce((s, p) => add(s, p), [0, 0, 0]).map((v) => v / pts.length);
    const p2 = pts.map((p) => [dot(sub(p, c), ax.x), dot(sub(p, c), ax.y)]);
    const tris = earClip(p2, pts.map((_, i) => i));
    const g = group !== null ? group : W.G.length ? W.G[0] : 0;
    const start = tcount(W);
    // fill polygon = reversed loop; earClip gives ccw in the (x, y) frame of the reversed-loop normal
    for (const [i, j, k] of tris) {
      // order so that the patch runs every loop edge opposite to the boundary edge
      W.T.push(loop[i], loop[k], loop[j]);
      W.G.push(g);
    }
    // orientation check against one boundary edge: the loop edge loop[0] -> loop[1] must appear as loop[1] -> loop[0]
    const ts = [];
    for (let t = start; t < tcount(W); t++) ts.push(t);
    const a = loop[0], b = loop[1];
    let wrong = false;
    for (const t of ts) for (let k = 0; k < 3; k++) if (W.T[3 * t + k] === a && W.T[3 * t + ((k + 1) % 3)] === b) wrong = true;
    if (wrong) for (const t of ts) { const x = W.T[3 * t + 1]; W.T[3 * t + 1] = W.T[3 * t + 2]; W.T[3 * t + 2] = x; }
    if (type !== "minimal" && ts.length > 1) {
      const L = edge > 0 ? edge : Math.max(loopEdge(W, loop), 0.7 * avgEdge(W));
      const sel = new Uint8Array(tcount(W));
      for (const t of ts) sel[t] = 1;
      const r = splitLongEdges(W, sel, L * 1.2, 400000);
      const patch = [];
      for (let t = 0; t < tcount(W); t++) if (r.sel[t]) patch.push(t);
      // relax the interior patch vertices (boundary loop fixed)
      const mask = new Uint8Array(tcount(W));
      for (const t of patch) mask[t] = 1;
      const { free } = selVerts(W, mask);
      for (const v of loop) free[v] = 0;
      flipPass(W, mask, null, true);
      laplace(W, free, type === "smooth" ? 30 : 15, 0.6);
      if (type === "smooth") curvePatch(W, mask, free, loop);
      made.push(...patch);
    } else made.push(...ts);
  }
  return made;
}
function loopEdge(W, loop) {
  let s = 0;
  for (let i = 0; i < loop.length; i++) s += len(sub(vtx(W, loop[i]), vtx(W, loop[(i + 1) % loop.length])));
  return s / loop.length || 1;
}
/** Bulge a relaxed planar patch to continue the surrounding surface (normals and slope at the loop). */
function curvePatch(W, mask, free, loop) {
  const N = vertexNormals(W);
  const pts = loop.map((v) => vtx(W, v));
  const c = pts.reduce((s, p) => add(s, p), [0, 0, 0]).map((v) => v / pts.length);
  const pn = norm(polyNormal(pts.slice().reverse()));
  // inclination of the surrounding surface: rim normals against the patch normal
  let incl = 0;
  for (const v of loop) incl += dot([N[3 * v], N[3 * v + 1], N[3 * v + 2]], pn);
  incl /= loop.length;
  // which side the surrounding surface lies on (one ring away from the loop, outside the patch)
  const onLoop = new Set(loop);
  const NB = vertNeighbors(W);
  let h = 0, nh = 0;
  for (const v of loop) for (const u of NB[v]) if (!onLoop.has(u) && !free[u]) { h += dot(sub(vtx(W, u), c), pn); nh++; }
  if (!nh || Math.abs(h / nh) < 1e-9) return;
  let R = 0;
  for (const p of pts) R = Math.max(R, len(sub(p, c)));
  if (R <= 0) return;
  const bulge = -Math.sign(h) * Math.max(0, Math.min(1, 1 - Math.abs(incl))) * R * 0.6;
  for (let v = 0; v < free.length; v++) {
    if (!free[v]) continue;
    const p = vtx(W, v);
    const r = len(sub(sub(p, c), mul(pn, dot(sub(p, c), pn)))) / R;
    setV(W, v, add(p, mul(pn, bulge * Math.max(0, 1 - r * r))));
  }
  laplace(W, free, 4, 0.3);
}
/** Uniform Laplacian relaxation of the vertices flagged in free. */
export function laplace(W, free, iters, lambda) {
  const NB = vertNeighbors(W);
  const n = vcount(W);
  for (let it = 0; it < iters; it++) {
    const np = W.P.slice();
    for (let v = 0; v < n; v++) {
      if (!free[v] || !NB[v].size) continue;
      let sx = 0, sy = 0, sz = 0;
      for (const u of NB[v]) { sx += W.P[3 * u]; sy += W.P[3 * u + 1]; sz += W.P[3 * u + 2]; }
      const k = NB[v].size;
      np[3 * v] += lambda * (sx / k - W.P[3 * v]);
      np[3 * v + 1] += lambda * (sy / k - W.P[3 * v + 1]);
      np[3 * v + 2] += lambda * (sz / k - W.P[3 * v + 2]);
    }
    W.P = np;
  }
  return W;
}
/** Taubin lambda|mu smoothing (no shrinking) of the free vertices. */
export function taubin(W, free, iters, lambda = 0.5, mu = -0.53) {
  const NB = vertNeighbors(W);
  const n = vcount(W);
  const step = (k) => {
    const np = W.P.slice();
    for (let v = 0; v < n; v++) {
      if (!free[v] || !NB[v].size) continue;
      let sx = 0, sy = 0, sz = 0;
      for (const u of NB[v]) { sx += W.P[3 * u]; sy += W.P[3 * u + 1]; sz += W.P[3 * u + 2]; }
      const c = NB[v].size;
      np[3 * v] += k * (sx / c - W.P[3 * v]);
      np[3 * v + 1] += k * (sy / c - W.P[3 * v + 1]);
      np[3 * v + 2] += k * (sz / c - W.P[3 * v + 2]);
    }
    W.P = np;
  };
  for (let it = 0; it < iters; it++) { step(lambda); step(mu); }
  return W;
}

// ------------------------------------------------------------------ refinement / remeshing
/**
 * Split edges longer than L (midpoint) inside the selected triangles (sel: Uint8Array per triangle or null = all),
 * a few passes until no long edge is left or maxTris is reached. Returns {sel} (grown with the new triangles).
 * hv (optional per-vertex size factors, extended for new vertices): an edge splits when longer than L * mean factor.
 */
export function splitLongEdges(W, sel, L, maxTris = 1e6, hv = null) {
  let S = sel ? Array.from(sel) : new Array(tcount(W)).fill(1);
  const L2 = L * L;
  for (let pass = 0; pass < 12; pass++) {
    const n = vcount(W) + 1;
    const em = edgeTris(W);
    const cand = [];
    for (const [key, ts] of em) {
      if (ts.length > 2) continue;
      if (!ts.every((t) => S[t])) continue;
      const a = Math.floor(key / n), b = key % n;
      const d2 = (W.P[3 * a] - W.P[3 * b]) ** 2 + (W.P[3 * a + 1] - W.P[3 * b + 1]) ** 2 + (W.P[3 * a + 2] - W.P[3 * b + 2]) ** 2;
      const f = hv ? ((hv[a] + hv[b]) / 2) ** 2 : 1;
      if (d2 > L2 * f) cand.push([d2 / f, a, b, ts]);
    }
    if (!cand.length || tcount(W) >= maxTris) break;
    cand.sort((x, y) => y[0] - x[0]);
    const touched = new Uint8Array(tcount(W));
    let did = 0;
    for (const [, a, b, ts] of cand) {
      if (ts.some((t) => touched[t])) continue;
      if (tcount(W) >= maxTris) break;
      const m = addV(W, lerp(vtx(W, a), vtx(W, b), 0.5));
      if (hv) hv[m] = (hv[a] + hv[b]) / 2;
      for (const t of ts) {
        touched[t] = 1;
        let k = 0;
        for (; k < 3; k++) { const x = W.T[3 * t + k], y = W.T[3 * t + ((k + 1) % 3)]; if ((x === a && y === b) || (x === b && y === a)) break; }
        const x = W.T[3 * t + k], y = W.T[3 * t + ((k + 1) % 3)], z = W.T[3 * t + ((k + 2) % 3)];
        W.T[3 * t] = x; W.T[3 * t + 1] = m; W.T[3 * t + 2] = z;
        W.T.push(m, y, z); W.G.push(W.G[t]); S.push(S[t]);
      }
      did++;
    }
    if (!did) break;
  }
  return { sel: Uint8Array.from(S) };
}

/** Edge flips towards valence 6 (4 on boundaries) between nearly coplanar selected triangles. */
export function flipPass(W, sel, locked, planarOnly = false, cosLim = 0.98) {
  const n = vcount(W) + 1;
  const em = edgeTris(W);
  const NB = vertNeighbors(W);
  const bnd = boundaryVerts(W);
  const val = NB.map((s) => s.size);
  const touchedV = new Uint8Array(vcount(W));
  let flips = 0;
  for (const [key, ts] of em) {
    if (ts.length !== 2) continue;
    const [t1, t2] = ts;
    if (sel && (!sel[t1] || !sel[t2])) continue;
    if (W.G[t1] !== W.G[t2]) continue;
    const a = Math.floor(key / n), b = key % n;
    if (locked && locked.has(key)) continue;
    const opp = (t) => { for (let k = 0; k < 3; k++) { const v = W.T[3 * t + k]; if (v !== a && v !== b) return v; } return -1; };
    const c = opp(t1), d = opp(t2);
    if (c < 0 || d < 0 || c === d) continue;
    if (touchedV[a] || touchedV[b] || touchedV[c] || touchedV[d]) continue;
    if (NB[c].has(d)) continue;
    const n1 = triNormal(W, t1), n2 = triNormal(W, t2);
    if (dot(n1, n2) < (planarOnly ? 0.9999 : cosLim)) continue;
    const tgt = (v) => (bnd[v] ? 4 : 6);
    const dev = (va, vb, vc, vd) => Math.abs(va - tgt(a)) + Math.abs(vb - tgt(b)) + Math.abs(vc - tgt(c)) + Math.abs(vd - tgt(d));
    const before = dev(val[a], val[b], val[c], val[d]);
    const after = dev(val[a] - 1, val[b] - 1, val[c] + 1, val[d] + 1);
    let better = after < before;
    if (planarOnly) {
      // hole patches: flip for better angles (Delaunay-like: the opposite angles sum below pi)
      const ang = (o, p, q) => { const u = norm(sub(vtx(W, p), vtx(W, o))), w = norm(sub(vtx(W, q), vtx(W, o))); return Math.acos(Math.max(-1, Math.min(1, dot(u, w)))); };
      better = ang(c, a, b) + ang(d, a, b) > Math.PI + 1e-9;
    }
    if (!better) continue;
    // orientation of t1 (a, b, c) in its own order
    let k1 = 0;
    for (; k1 < 3; k1++) if (W.T[3 * t1 + k1] === a && W.T[3 * t1 + ((k1 + 1) % 3)] === b) break;
    let A = a, B = b;
    if (k1 === 3) { A = b; B = a; }
    // t1 = (A, B, c), t2 = (B, A, d) -> (d, B, c), (c, A, d)
    const c1 = opp(t1), d1 = opp(t2);
    const nn1 = cross(sub(vtx(W, B), vtx(W, d1)), sub(vtx(W, c1), vtx(W, d1)));
    const nn2 = cross(sub(vtx(W, A), vtx(W, c1)), sub(vtx(W, d1), vtx(W, c1)));
    if (dot(nn1, n1) <= 0 || dot(nn2, n1) <= 0) continue;
    W.T[3 * t1] = d1; W.T[3 * t1 + 1] = B; W.T[3 * t1 + 2] = c1;
    W.T[3 * t2] = c1; W.T[3 * t2 + 1] = A; W.T[3 * t2 + 2] = d1;
    val[a]--; val[b]--; val[c]++; val[d]++;
    touchedV[a] = touchedV[b] = touchedV[c] = touchedV[d] = 1;
    flips++;
  }
  return flips;
}

/** Collapse edges shorter than lo between free vertices (link condition, no flips, no new edges longer than hi). */
function collapsePass(W, sel, lo, hi, fixedV, hv = null) {
  const n = vcount(W) + 1;
  const em = edgeTris(W);
  const VT = vertTris(W);
  const NB = vertNeighbors(W);
  const lock = new Uint8Array(vcount(W));
  const dead = new Uint8Array(tcount(W));
  const lo2 = lo * lo, hi2 = hi * hi;
  const cand = [];
  for (const [key, ts] of em) {
    if (ts.length !== 2) continue;
    if (sel && (!sel[ts[0]] || !sel[ts[1]])) continue;
    const a = Math.floor(key / n), b = key % n;
    const d2 = (W.P[3 * a] - W.P[3 * b]) ** 2 + (W.P[3 * a + 1] - W.P[3 * b + 1]) ** 2 + (W.P[3 * a + 2] - W.P[3 * b + 2]) ** 2;
    const f = hv ? ((hv[a] + hv[b]) / 2) ** 2 : 1;
    if (d2 < lo2 * f) cand.push([d2 / f, a, b, ts]);
  }
  cand.sort((x, y) => x[0] - y[0]);
  let did = 0;
  for (const [, a0, b0, ts] of cand) {
    let a = a0, b = b0;
    if (lock[a] || lock[b]) continue;
    if (fixedV[a] && fixedV[b]) continue;
    if (fixedV[b]) { a = b0; b = a0; } // keep the fixed vertex
    if (ts.some((t) => dead[t])) continue;
    // link condition
    let common = 0;
    for (const u of NB[a]) if (NB[b].has(u)) common++;
    if (common !== 2) continue;
    const target = fixedV[a] ? vtx(W, a) : lerp(vtx(W, a), vtx(W, b), 0.5);
    let ok = true;
    for (const u of NB[b]) { if (u === a) continue; const q = vtx(W, u); const f = hv ? ((hv[a] + hv[u]) / 2) ** 2 : 1; if (dot(sub(q, target), sub(q, target)) > hi2 * f) { ok = false; break; } }
    if (!ok) continue;
    // no flipped / degenerate triangles around a and b
    for (const v of [a, b]) {
      for (const t of VT.of(v)) {
        if (dead[t] || ts.includes(t)) continue;
        const ids = [W.T[3 * t], W.T[3 * t + 1], W.T[3 * t + 2]].map((x) => (x === b ? a : x));
        if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) { ok = false; break; }
        const pp = ids.map((x) => (x === a ? target : vtx(W, x)));
        const nn = cross(sub(pp[1], pp[0]), sub(pp[2], pp[0]));
        const no = triNormalRaw(W, t);
        if (dot(nn, no) <= 0.2 * len(nn) * len(no)) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) continue;
    for (const t of ts) dead[t] = 1;
    for (const t of VT.of(b)) { if (dead[t]) continue; for (let k = 0; k < 3; k++) if (W.T[3 * t + k] === b) W.T[3 * t + k] = a; }
    setV(W, a, target);
    lock[a] = lock[b] = 1;
    for (const u of NB[a]) lock[u] = 1;
    for (const u of NB[b]) lock[u] = 1;
    did++;
  }
  if (did) {
    const T = [], G = [], S = [];
    for (let t = 0; t < tcount(W); t++) if (!dead[t]) { T.push(W.T[3 * t], W.T[3 * t + 1], W.T[3 * t + 2]); G.push(W.G[t]); S.push(sel ? sel[t] : 1); }
    W.T = T; W.G = G;
    return { did, sel: sel ? Uint8Array.from(S) : null };
  }
  return { did, sel };
}

/** Grid of triangles for closest-point / ray queries. */
export function triGrid(W, cellSize = 0) {
  const bb = bbox(W);
  const m = tcount(W);
  const cell = cellSize > 0 ? cellSize : Math.max(bb.size / Math.max(8, Math.cbrt(m) * 2), 1e-6);
  const cells = new Map();
  const ix = (v, k) => Math.floor((v - bb.min[k]) / cell);
  for (let t = 0; t < m; t++) {
    const ids = [W.T[3 * t], W.T[3 * t + 1], W.T[3 * t + 2]];
    const lo = [0, 1, 2].map((k) => ix(Math.min(...ids.map((i) => W.P[3 * i + k])), k));
    const hi = [0, 1, 2].map((k) => ix(Math.max(...ids.map((i) => W.P[3 * i + k])), k));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const key = `${x},${y},${z}`;
      const l = cells.get(key);
      if (l) l.push(t); else cells.set(key, [t]);
    }
  }
  return { W, bb, cell, cells, ix };
}
/** Closest point of triangle abc to p (Ericson). */
export function closestOnTri(p, a, b, c) {
  const q = closestOnTri0(p, a, b, c);
  if (Number.isFinite(q[0]) && Number.isFinite(q[1]) && Number.isFinite(q[2])) return q;
  // degenerate triangle (zero-length edge): the nearest corner
  const d = (x) => (x[0] - p[0]) ** 2 + (x[1] - p[1]) ** 2 + (x[2] - p[2]) ** 2;
  return [a, b, c].reduce((m, x) => (d(x) < d(m) ? x : m));
}
function closestOnTri0(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b);
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
  const cp = sub(p, c);
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
  const den = 1 / (va + vb + vc);
  return add(a, add(mul(ab, vb * den), mul(ac, vc * den)));
}
/** Closest point on the grid's mesh: {q, t, d}. maxR limits the search radius (Infinity = until found). */
export function closestPoint(G, p, maxR = Infinity) {
  const { W, cell, cells, bb } = G;
  const c = [0, 1, 2].map((k) => Math.floor((p[k] - bb.min[k]) / cell));
  let best = null, bd = Infinity;
  const seen = new Set();
  const maxRing = Math.min(Math.ceil((Number.isFinite(maxR) ? maxR : bb.size * 2 + len(sub(p, bb.c))) / cell) + 1, 400);
  for (let r = 0; r <= maxRing; r++) {
    for (let x = c[0] - r; x <= c[0] + r; x++) for (let y = c[1] - r; y <= c[1] + r; y++) for (let z = c[2] - r; z <= c[2] + r; z++) {
      if (Math.max(Math.abs(x - c[0]), Math.abs(y - c[1]), Math.abs(z - c[2])) !== r) continue;
      const l = cells.get(`${x},${y},${z}`);
      if (!l) continue;
      for (const t of l) {
        if (seen.has(t)) continue;
        seen.add(t);
        const q = closestOnTri(p, vtx(W, W.T[3 * t]), vtx(W, W.T[3 * t + 1]), vtx(W, W.T[3 * t + 2]));
        const d = len(sub(p, q));
        if (d < bd) { bd = d; best = { q, t, d }; }
      }
    }
    if (best && bd <= r * cell) break;
  }
  return best;
}

/**
 * Isotropic remeshing (split / collapse / flip / tangential relaxation / projection, Botsch & Kobbelt) of the
 * selected triangles. opts: {L (target edge length), iters, preserveBoundary, sharpDeg (0 = no sharp features),
 * adaptive (0..1: shorter edges where the surface curves)}. Unselected triangles and the selection border stay.
 */
export function remesh(W, sel0, { L, iters = 4, preserveBoundary = true, sharpDeg = 0, adaptive = 0, maxTris = 600000 } = {}) {
  const ref = clone(W);
  const grid = triGrid(ref);
  let sel = sel0 ? Uint8Array.from(sel0) : new Uint8Array(tcount(W)).fill(1);
  for (let it = 0; it < iters; it++) {
    const hv = adaptive > 0 ? sizing(W, adaptive) : null;
    const r = splitLongEdges(W, sel, (4 / 3) * L, maxTris, hv);
    sel = r.sel;
    // fixed vertices: selection border, group borders, sharp features, open boundary when preserved
    const fx = featureVerts(W, { sharpDeg, groups: true, sel });
    const fixedV = new Uint8Array(vcount(W));
    const { border } = selVerts(W, sel);
    const bv = boundaryVerts(W);
    for (let v = 0; v < vcount(W); v++) if (border[v] || fx.verts[v] || (bv[v] && preserveBoundary)) fixedV[v] = 1;
    const c = collapsePass(W, sel, (4 / 5) * L, (4 / 3) * L, fixedV, hv);
    sel = c.sel || sel;
    sel = compactKeep(W, sel).sel;
    const fx2 = featureVerts(W, { sharpDeg, groups: true, sel });
    flipPass(W, sel, fx2.edges, false, sharpDeg > 0 ? Math.cos((sharpDeg * Math.PI) / 180) : 0.5);
    // tangential relaxation + projection of the free vertices
    const { free } = selVerts(W, sel);
    const bv2 = boundaryVerts(W);
    for (let v = 0; v < vcount(W); v++) if (fx2.verts[v] || (bv2[v] && preserveBoundary)) free[v] = 0;
    relaxTangential(W, free, 0.6);
    for (let v = 0; v < vcount(W); v++) {
      if (!free[v]) continue;
      const h = closestPoint(grid, vtx(W, v));
      if (h) setV(W, v, h.q);
    }
  }
  return { W, sel };
}
/** Per-vertex size factors for adaptive remeshing: shorter edges where the face normals around a vertex spread. */
function sizing(W, adaptive) {
  const N = vertexNormals(W);
  const VT = vertTris(W);
  const hv = [];
  for (let v = 0; v < vcount(W); v++) {
    const n = [N[3 * v], N[3 * v + 1], N[3 * v + 2]];
    let th = 0;
    for (const t of VT.of(v)) th = Math.max(th, Math.acos(Math.max(-1, Math.min(1, dot(n, triNormal(W, t))))));
    hv.push(Math.max(0.25, Math.min(2, (1 + adaptive) / (1 + adaptive * 8 * th))));
  }
  return hv;
}
function compactKeep(W, sel) {
  // compact keeps triangle order but drops dead / degenerate triangles: drop their selection flags the same way
  let keep = null;
  if (sel) {
    keep = [];
    for (let t = 0; t < W.T.length / 3; t++) {
      const a = W.T[3 * t], b = W.T[3 * t + 1], c = W.T[3 * t + 2];
      if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) continue;
      keep.push(sel[t] ?? 1);
    }
  }
  const C = compact({ P: W.P, T: W.T, G: W.G, hasGroups: W.hasGroups });
  W.P = C.P; W.T = C.T; W.G = C.G;
  return { sel: keep && keep.length === tcount(W) ? Uint8Array.from(keep) : Uint8Array.from({ length: tcount(W) }, () => 1) };
}
/** Move free vertices towards the neighbour centroid within their tangent plane. */
export function relaxTangential(W, free, k = 0.5) {
  const NB = vertNeighbors(W);
  const N = vertexNormals(W);
  const np = W.P.slice();
  for (let v = 0; v < vcount(W); v++) {
    if (!free[v] || NB[v].size < 3) continue;
    let s = [0, 0, 0];
    for (const u of NB[v]) s = add(s, vtx(W, u));
    s = mul(s, 1 / NB[v].size);
    const p = vtx(W, v);
    const n = [N[3 * v], N[3 * v + 1], N[3 * v + 2]];
    let d = sub(s, p);
    d = sub(d, mul(n, dot(d, n)));
    setV({ P: np }, v, add(p, mul(d, k)));
  }
  W.P = np;
  return W;
}

// ------------------------------------------------------------------ quadric decimation
/**
 * Quadric error edge-collapse decimation of the selected triangles. opts: {target (triangle count to reach),
 * tolerance (max geometric error in mm; Infinity = none), preserveBoundary}. Returns W.
 */
export function reduce(W, sel0, { target = 0, tolerance = Infinity, preserveBoundary = true } = {}) {
  const m = tcount(W);
  const n = vcount(W);
  const sel = sel0 ? sel0 : new Uint8Array(m).fill(1);
  const Q = new Float64Array(n * 10);
  const addQ = (v, a, b, c, d, w) => {
    const o = v * 10;
    Q[o] += w * a * a; Q[o + 1] += w * a * b; Q[o + 2] += w * a * c; Q[o + 3] += w * a * d;
    Q[o + 4] += w * b * b; Q[o + 5] += w * b * c; Q[o + 6] += w * b * d;
    Q[o + 7] += w * c * c; Q[o + 8] += w * c * d; Q[o + 9] += w * d * d;
  };
  for (let t = 0; t < m; t++) {
    const nr = triNormalRaw(W, t);
    const ar = len(nr) / 2;
    if (ar <= 0) continue;
    const nn = mul(nr, 1 / (2 * ar));
    const p = vtx(W, W.T[3 * t]);
    const d = -dot(nn, p);
    for (let k = 0; k < 3; k++) addQ(W.T[3 * t + k], nn[0], nn[1], nn[2], d, ar);
  }
  // fixed vertices: outside / border of the selection, open boundary (when preserved), group borders
  const { border, inS } = selVerts(W, sel);
  const fixed = new Uint8Array(n);
  const fv = featureVerts(W, { groups: true, sel });
  const bnd = boundaryVerts(W);
  for (let v = 0; v < n; v++) {
    if (!inS[v] || border[v]) fixed[v] = 1;
    if (fv.verts[v] && !bnd[v]) fixed[v] = 1;
    if (bnd[v] && preserveBoundary) fixed[v] = 1;
  }
  // vertex -> triangle sets
  const VT = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < m; t++) for (let k = 0; k < 3; k++) VT[W.T[3 * t + k]].add(t);
  const dead = new Uint8Array(m);
  let alive = 0;
  for (let t = 0; t < m; t++) if (sel[t]) alive++;
  const totalOther = m - alive;
  const ver = new Int32Array(n);
  const tmp = new Float64Array(10);
  const qerrTmp = (p) => { const [x, y, z] = p; return tmp[0] * x * x + 2 * tmp[1] * x * y + 2 * tmp[2] * x * z + 2 * tmp[3] * x + tmp[4] * y * y + 2 * tmp[5] * y * z + 2 * tmp[6] * y + tmp[7] * z * z + 2 * tmp[8] * z + tmp[9]; };
  const bestE = (a, b) => {
    for (let k = 0; k < 10; k++) tmp[k] = Q[a * 10 + k] + Q[b * 10 + k];
    if (fixed[a] && fixed[b]) return null;
    const pa = vtx(W, a), pb = vtx(W, b);
    let cands;
    if (fixed[a]) cands = [pa];
    else if (fixed[b]) cands = [pb];
    else {
      cands = [pa, pb, lerp(pa, pb, 0.5)];
      const r = solve3([[tmp[0], tmp[1], tmp[2]], [tmp[1], tmp[4], tmp[5]], [tmp[2], tmp[5], tmp[7]]], [-tmp[3], -tmp[6], -tmp[8]]);
      if (r && len(sub(r, lerp(pa, pb, 0.5))) < len(sub(pa, pb)) * 2) cands.push(r);
    }
    let bp = null, be = Infinity;
    for (const c of cands) { const e = qerrTmp(c); if (e < be) { be = e; bp = c; } }
    return { p: bp, e: Math.max(0, be) };
  };
  const heap = new Heap();
  const pushEdge = (a, b) => {
    if (a > b) { const x = a; a = b; b = x; }
    const r = bestE(a, b);
    if (!r) return;
    heap.push(r.e, [a, b, ver[a], ver[b], r.p]);
  };
  {
    const em = edgeTris(W);
    const nn = n + 1;
    for (const [key, ts] of em) {
      if (!ts.every((t) => sel[t])) continue;
      pushEdge(Math.floor(key / nn), key % nn);
    }
  }
  const tol2 = Number.isFinite(tolerance) ? tolerance * tolerance : Infinity;
  let count = alive + totalOther;
  const goal = Math.max(4, target || 0);
  while (heap.size) {
    if (Number.isFinite(tol2) && !target) { if (heap.peekKey() > tol2) break; }
    else if (count <= goal) break;
    const [e, [a, b, va, vb, p]] = heap.pop();
    if (ver[a] !== va || ver[b] !== vb) continue;
    if (Number.isFinite(tol2) && e > tol2) break;
    // shared triangles
    const shared = [];
    for (const t of VT[a]) if (VT[b].has(t)) shared.push(t);
    if (shared.length !== 2 && !(shared.length === 1 && !preserveBoundary)) continue;
    // link condition
    const na = new Set(), nb = new Set();
    for (const t of VT[a]) for (let k = 0; k < 3; k++) na.add(W.T[3 * t + k]);
    for (const t of VT[b]) for (let k = 0; k < 3; k++) nb.add(W.T[3 * t + k]);
    let common = 0;
    for (const u of na) if (u !== a && u !== b && nb.has(u)) common++;
    if (common !== shared.length) continue;
    // flip check
    let ok = true;
    for (const v of [a, b]) {
      for (const t of VT[v]) {
        if (shared.includes(t)) continue;
        const ids = [W.T[3 * t], W.T[3 * t + 1], W.T[3 * t + 2]];
        const pp = ids.map((x) => (x === a || x === b ? p : vtx(W, x)));
        const nn = cross(sub(pp[1], pp[0]), sub(pp[2], pp[0]));
        const no = triNormalRaw(W, t);
        if (dot(nn, no) <= 0.05 * len(nn) * len(no)) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) continue;
    // collapse b into a
    for (const t of shared) { dead[t] = 1; for (let k = 0; k < 3; k++) VT[W.T[3 * t + k]].delete(t); count--; }
    for (const t of VT[b]) { for (let k = 0; k < 3; k++) if (W.T[3 * t + k] === b) W.T[3 * t + k] = a; VT[a].add(t); }
    VT[b].clear();
    setV(W, a, p);
    for (let k = 0; k < 10; k++) Q[a * 10 + k] += Q[b * 10 + k];
    if (fixed[b]) fixed[a] = 1;
    ver[a]++; ver[b]++;
    const ring = new Set();
    for (const t of VT[a]) for (let k = 0; k < 3; k++) ring.add(W.T[3 * t + k]);
    for (const u of ring) if (u !== a) pushEdge(a, u);
  }
  const T = [], G = [];
  for (let t = 0; t < m; t++) if (!dead[t]) { T.push(W.T[3 * t], W.T[3 * t + 1], W.T[3 * t + 2]); G.push(W.G[t]); }
  W.T = T; W.G = G;
  return W;
}
export function solve3(A, r) {
  const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const D = (c) => { const M = A.map((row, i) => row.map((v, j) => (j === c ? r[i] : v))); return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]); };
  return [D(0) / det, D(1) / det, D(2) / det];
}
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  peekKey() { return this.k[0]; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const rk = k[0], rv = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return [rk, rv];
  }
}

// ------------------------------------------------------------------ plane cut / section
/**
 * Split triangles along the plane {o, n} (exact cut). Returns {W, side: Int8Array per triangle (-1 below, +1 above)}.
 */
export function splitByPlane(W0, pl) {
  const W = clone(W0);
  const n = norm(pl.n);
  const bb = bbox(W);
  const eps = Math.max(1e-9, bb.size * 1e-9);
  const nv = vcount(W);
  const d = new Float64Array(nv);
  for (let v = 0; v < nv; v++) { let s = dot(sub(vtx(W, v), pl.o), n); if (Math.abs(s) < eps) s = 0; d[v] = s; }
  const D = Array.from(d);
  const cut = new Map();
  const NN = nv + 1;
  const mid = (a, b) => {
    const key = ekey(a, b, NN);
    let m = cut.get(key);
    if (m === undefined) {
      const t = D[a] / (D[a] - D[b]);
      m = addV(W, lerp(vtx(W, a), vtx(W, b), t));
      D.push(0);
      cut.set(key, m);
    }
    return m;
  };
  const T = [], G = [], side = [];
  const m = tcount(W);
  for (let t = 0; t < m; t++) {
    const ids = [W.T[3 * t], W.T[3 * t + 1], W.T[3 * t + 2]];
    const s = ids.map((i) => Math.sign(D[i]));
    const g = W.G[t];
    if (s.every((x) => x >= 0) || s.every((x) => x <= 0)) {
      T.push(...ids); G.push(g);
      side.push(s.some((x) => x > 0) ? 1 : s.some((x) => x < 0) ? -1 : 0);
      continue;
    }
    // walk the polygon, inserting cut points, then split into the two sides
    const poly = [];
    for (let k = 0; k < 3; k++) {
      const a = ids[k], b = ids[(k + 1) % 3];
      poly.push(a);
      if ((D[a] > 0 && D[b] < 0) || (D[a] < 0 && D[b] > 0)) poly.push(mid(a, b));
    }
    for (const sg of [1, -1]) {
      const part = poly.filter((v) => (sg > 0 ? D[v] >= 0 : D[v] <= 0));
      for (let k = 1; k + 1 < part.length; k++) { T.push(part[0], part[k], part[k + 1]); G.push(g); side.push(sg); }
    }
  }
  W.T = T; W.G = G;
  // triangles lying in the plane (side 0) go with the kept side of their neighbours: assign to +1
  return { W, side: Int8Array.from(side.map((x) => (x === 0 ? 1 : x))), dist: D };
}
/** Fill the open loops of W lying in plane pl (within eps); polygons with holes are handled. Returns new triangles. */
export function capPlane(W, pl, { type = "minimal", group = null } = {}) {
  const n = norm(pl.n);
  const bb = bbox(W);
  const eps = Math.max(1e-7, bb.size * 1e-6);
  const loops = boundaryLoops(W).filter((L) => L.every((v) => Math.abs(dot(sub(vtx(W, v), pl.o), n)) <= eps));
  if (!loops.length) return [];
  const ax = planeAxes(n);
  const P2 = [];
  const vid = [];
  const loops2 = loops.map((L) => L.map((v) => { const p = sub(vtx(W, v), pl.o); P2.push([dot(p, ax.x), dot(p, ax.y)]); vid.push(v); return P2.length - 1; }));
  // nesting: a loop inside an odd number of others is a hole
  const inside = (pt, L) => {
    let c = false;
    for (let i = 0, j = L.length - 1; i < L.length; j = i++) {
      const a = P2[L[i]], b = P2[L[j]];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  const depth = loops2.map((L, i) => {
    const pt = P2[L[0]];
    let d = 0;
    loops2.forEach((M, j) => { if (j !== i && inside(pt, M)) d++; });
    return d;
  });
  const g = group !== null ? group : nextGroup(W);
  const start = tcount(W);
  loops2.forEach((L, i) => {
    if (depth[i] % 2) return;
    const holes = loops2.filter((M, j) => depth[j] === depth[i] + 1 && inside(P2[M[0]], L));
    const tris = triangulateWithHoles(P2, L, holes);
    for (const [a, b, c] of tris) { W.T.push(vid[a], vid[b], vid[c]); W.G.push(g); }
  });
  // orient the cap against the plane normal side of the kept part: consistent with the open edges
  const made = [];
  for (let t = start; t < tcount(W); t++) made.push(t);
  orientPatch(W, made);
  if (type !== "minimal" && made.length) {
    const sel = new Uint8Array(tcount(W));
    for (const t of made) sel[t] = 1;
    const L = avgEdge(W) * 1.2;
    const r = splitLongEdges(W, sel, L, 600000);
    const { free } = selVerts(W, r.sel);
    flipPass(W, r.sel, null, true);
    // relax inside the plane only
    const NB = vertNeighbors(W);
    for (let it = 0; it < 12; it++) {
      for (let v = 0; v < vcount(W); v++) {
        if (!free[v] || !NB[v].size) continue;
        let s = [0, 0, 0];
        for (const u of NB[v]) s = add(s, vtx(W, u));
        s = mul(s, 1 / NB[v].size);
        const p = vtx(W, v);
        let dd = sub(s, p);
        dd = sub(dd, mul(n, dot(dd, n)));
        setV(W, v, add(p, mul(dd, 0.6)));
      }
    }
    return Array.from(r.sel).map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  }
  return made;
}
/** Orient new patch triangles so that they run the open edges of the rest opposite (BFS inside the patch). */
export function orientPatch(W, tris) {
  if (!tris.length) return;
  const set = new Set(tris);
  const n = vcount(W) + 1;
  const dirOut = new Map(); // directed edges of the non-patch triangles
  for (let t = 0; t < tcount(W); t++) {
    if (set.has(t)) continue;
    for (let k = 0; k < 3; k++) dirOut.set(W.T[3 * t + k] * n + W.T[3 * t + ((k + 1) % 3)], t);
  }
  const flip = (t) => { const b = W.T[3 * t + 1]; W.T[3 * t + 1] = W.T[3 * t + 2]; W.T[3 * t + 2] = b; };
  // patch components
  const em = new Map();
  for (const t of tris) for (let k = 0; k < 3; k++) { const a = W.T[3 * t + k], b = W.T[3 * t + ((k + 1) % 3)]; const key = ekey(a, b, n); const l = em.get(key); if (l) l.push(t); else em.set(key, [t]); }
  const done = new Set();
  for (const s of tris) {
    if (done.has(s)) continue;
    // BFS consistent orientation inside the component
    const comp = [s];
    done.add(s);
    for (let i = 0; i < comp.length; i++) {
      const t = comp[i];
      for (let k = 0; k < 3; k++) {
        const a = W.T[3 * t + k], b = W.T[3 * t + ((k + 1) % 3)];
        for (const u of em.get(ekey(a, b, n)) || []) {
          if (u === t || done.has(u)) continue;
          let same = false;
          for (let j = 0; j < 3; j++) if (W.T[3 * u + j] === a && W.T[3 * u + ((j + 1) % 3)] === b) same = true;
          if (same) flip(u);
          done.add(u); comp.push(u);
        }
      }
    }
    // vote against the surrounding mesh
    let good = 0, bad = 0;
    for (const t of comp) for (let k = 0; k < 3; k++) {
      const a = W.T[3 * t + k], b = W.T[3 * t + ((k + 1) % 3)];
      if (dirOut.has(b * n + a)) good++;
      if (dirOut.has(a * n + b)) bad++;
    }
    if (bad > good) for (const t of comp) flip(t);
  }
}
/**
 * Plane cut. mode 'trim' (keep the side opposite the normal; flip keeps the other), 'split' (two bodies),
 * 'splitFaces' (keep everything, the far side gets new face groups). fill 'none' | 'minimal' | 'uniform'.
 * Returns {parts: [W...]}.
 */
export function planeCut(W0, pl, { mode = "trim", fill = "minimal", flip = false } = {}) {
  const { W, side } = splitByPlane(W0, pl);
  const keepSide = flip ? 1 : -1;
  if (mode === "splitFaces") {
    const g0 = nextGroup(W);
    const remap = new Map();
    for (let t = 0; t < tcount(W); t++) if (side[t] === -keepSide) { const g = W.G[t]; if (!remap.has(g)) remap.set(g, g0 + remap.size); W.G[t] = remap.get(g); }
    W.hasGroups = true;
    return { parts: [compact(W)] };
  }
  const part = (sg) => {
    const P = filterTris(W, (t) => side[t] === sg);
    if (!tcount(P)) return null;
    if (fill !== "none") { capPlane(P, pl, { type: fill === "uniform" ? "uniform" : "minimal" }); P.hasGroups = true; }
    return compact(P);
  };
  const a = part(keepSide);
  if (mode === "split") {
    const b = part(-keepSide);
    return { parts: [a, b].filter(Boolean) };
  }
  return { parts: a ? [a] : [] };
}
/** Section polylines of the mesh with the plane: [{pts: [[x,y,z]...], closed}]. */
export function section(W, pl) {
  const n = norm(pl.n);
  const nv = vcount(W);
  const bb = bbox(W);
  const eps = Math.max(1e-9, bb.size * 1e-9);
  const D = new Float64Array(nv);
  for (let v = 0; v < nv; v++) { let s = dot(sub(vtx(W, v), pl.o), n); if (Math.abs(s) < eps) s = eps; D[v] = s; } // nudge vertices on the plane
  const NN = nv + 1;
  const segs = [];
  const pt = new Map();
  const ptOf = (a, b) => {
    const key = ekey(a, b, NN);
    if (!pt.has(key)) { const t = D[a] / (D[a] - D[b]); pt.set(key, lerp(vtx(W, a), vtx(W, b), t)); }
    return key;
  };
  for (let t = 0; t < tcount(W); t++) {
    const ids = [W.T[3 * t], W.T[3 * t + 1], W.T[3 * t + 2]];
    const ks = [];
    for (let k = 0; k < 3; k++) { const a = ids[k], b = ids[(k + 1) % 3]; if ((D[a] > 0) !== (D[b] > 0)) ks.push(ptOf(a, b)); }
    if (ks.length === 2) segs.push(ks);
  }
  // chain segments through shared edge points
  const adj = new Map();
  for (let i = 0; i < segs.length; i++) for (const k of segs[i]) { const l = adj.get(k); if (l) l.push(i); else adj.set(k, [i]); }
  const used = new Uint8Array(segs.length);
  const out = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const chain = [segs[s0][0], segs[s0][1]];
    const grow = (front) => {
      for (;;) {
        const end = front ? chain[0] : chain[chain.length - 1];
        const nx = (adj.get(end) || []).find((i) => !used[i]);
        if (nx === undefined) return;
        used[nx] = 1;
        const other = segs[nx][0] === end ? segs[nx][1] : segs[nx][0];
        if (front) chain.unshift(other); else chain.push(other);
      }
    };
    grow(false); grow(true);
    const closed = chain.length > 2 && chain[0] === chain[chain.length - 1];
    if (closed) chain.pop();
    out.push({ pts: chain.map((k) => pt.get(k)), closed });
  }
  return out;
}
/** Douglas-Peucker simplification of a 3D polyline (closed loops keep their first point). */
export function simplify(pts, tol, closed = false) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  const dp = (i, j) => {
    let best = -1, bd = tol;
    const a = pts[i], b = pts[j];
    const ab = sub(b, a), L2 = dot(ab, ab);
    for (let k = i + 1; k < j; k++) {
      const ap = sub(pts[k], a);
      const s = L2 > 0 ? Math.max(0, Math.min(1, dot(ap, ab) / L2)) : 0;
      const d = len(sub(ap, mul(ab, s)));
      if (d > bd) { bd = d; best = k; }
    }
    if (best >= 0) { keep[best] = 1; dp(i, best); dp(best, j); }
  };
  if (closed) {
    // split the loop at its farthest point from the start
    let far = 1, fd = 0;
    for (let k = 1; k < pts.length; k++) { const d = len(sub(pts[k], pts[0])); if (d > fd) { fd = d; far = k; } }
    keep[0] = keep[far] = 1;
    const ext = [...pts, pts[0]];
    const keep2 = new Uint8Array(ext.length);
    const dp2 = (i, j) => {
      let best = -1, bd = tol;
      const a = ext[i], b = ext[j];
      const ab = sub(b, a), L2 = dot(ab, ab);
      for (let k = i + 1; k < j; k++) {
        const ap = sub(ext[k], a);
        const s = L2 > 0 ? Math.max(0, Math.min(1, dot(ap, ab) / L2)) : 0;
        const d = len(sub(ap, mul(ab, s)));
        if (d > bd) { bd = d; best = k; }
      }
      if (best >= 0) { keep2[best] = 1; dp2(i, best); dp2(best, j); }
    };
    dp2(0, far); dp2(far, ext.length - 1);
    return pts.filter((_, k) => keep[k] || keep2[k]);
  }
  keep[0] = keep[pts.length - 1] = 1;
  dp(0, pts.length - 1);
  return pts.filter((_, k) => keep[k]);
}

// ------------------------------------------------------------------ face groups
/**
 * Generate face groups on the selected triangles. method 'fast' (grow across edges whose dihedral angle is below
 * the threshold) or 'accurate' (planar regions first, within tol of their fitted plane; the rest by dihedral angle).
 * Groups smaller than minArea (fraction of the selected area) are merged into their best neighbour. New ids start at nextGroup(W).
 */
export function generateGroups(W, sel, { angle = 15, method = "fast", tol = 0.1, minArea = 0 } = {}) {
  const m = tcount(W);
  const N = triNeighbors(W);
  const nrm = [];
  const ar = new Float64Array(m);
  for (let t = 0; t < m; t++) { const r = triNormalRaw(W, t); ar[t] = len(r) / 2; nrm.push(norm(r)); }
  const cosA = Math.cos((angle * Math.PI) / 180);
  const lab = new Int32Array(m).fill(-1);
  let g = 0;
  const order = [];
  for (let t = 0; t < m; t++) if (!sel || sel[t]) order.push(t);
  order.sort((a, b) => ar[b] - ar[a]);
  if (method === "accurate") {
    // planar regions: grow from the largest triangles while the triangle stays within tol of the region plane
    for (const s of order) {
      if (lab[s] >= 0) continue;
      const region = [s];
      lab[s] = g;
      let nsum = mul(nrm[s], ar[s]);
      let csum = mul(triCentroid(W, s), ar[s]);
      let asum = ar[s];
      for (let i = 0; i < region.length; i++) {
        const t = region[i];
        for (let k = 0; k < 3; k++) {
          const u = N[3 * t + k];
          if (u < 0 || lab[u] >= 0 || (sel && !sel[u])) continue;
          const pn = norm(nsum), pc = mul(csum, 1 / asum);
          if (dot(nrm[u], pn) < cosA) continue;
          let ok = true;
          for (let j = 0; j < 3; j++) if (Math.abs(dot(sub(vtx(W, W.T[3 * u + j]), pc), pn)) > tol) { ok = false; break; }
          if (!ok) continue;
          lab[u] = g; region.push(u);
          nsum = add(nsum, mul(nrm[u], ar[u])); csum = add(csum, mul(triCentroid(W, u), ar[u])); asum += ar[u];
        }
      }
      if (region.length < 3) { for (const t of region) lab[t] = -1; continue; }
      g++;
    }
  }
  for (const s of order) {
    if (lab[s] >= 0) continue;
    lab[s] = g;
    const st = [s];
    while (st.length) {
      const t = st.pop();
      for (let k = 0; k < 3; k++) {
        const u = N[3 * t + k];
        if (u < 0 || lab[u] >= 0 || (sel && !sel[u])) continue;
        if (dot(nrm[t], nrm[u]) < cosA) continue;
        lab[u] = g; st.push(u);
      }
    }
    g++;
  }
  // merge groups smaller than minArea (fraction of the selected area) into the neighbour sharing the most edges
  if (minArea > 0) {
    let total = 0;
    for (const t of order) total += ar[t];
    const lim = total * minArea;
    for (let pass = 0; pass < 3; pass++) {
      const size = new Float64Array(g);
      for (const t of order) size[lab[t]] += ar[t];
      let changed = false;
      for (const t of order) {
        if (size[lab[t]] >= lim) continue;
        const votes = new Map();
        for (let k = 0; k < 3; k++) { const u = N[3 * t + k]; if (u >= 0 && lab[u] >= 0 && lab[u] !== lab[t]) votes.set(lab[u], (votes.get(lab[u]) || 0) + 1 + size[lab[u]] * 1e-9); }
        let bg = -1, bv = 0;
        for (const [k, v] of votes) if (v > bv) { bv = v; bg = k; }
        if (bg >= 0) { size[lab[t]] -= ar[t]; lab[t] = bg; size[bg] += ar[t]; changed = true; }
      }
      if (!changed) break;
    }
  }
  // renumber compactly after the existing groups of the unselected triangles
  let base = 0;
  if (sel) for (let t = 0; t < m; t++) if (!sel[t] && W.G[t] + 1 > base) base = W.G[t] + 1;
  const map = new Map();
  for (const t of order) { const l = lab[t]; if (!map.has(l)) map.set(l, base + map.size); W.G[t] = map.get(l); }
  W.hasGroups = true;
  return map.size;
}

// ------------------------------------------------------------------ offsets / shell
/** Offset of every vertex along its mitred normal: distance d (negative = inwards). */
export function offsetVerts(W, d) {
  const VT = vertTris(W);
  const out = W.P.slice();
  const fn = [];
  for (let t = 0; t < tcount(W); t++) fn.push(triNormal(W, t));
  for (let v = 0; v < vcount(W); v++) {
    const ts = VT.of(v);
    if (!ts.length) continue;
    // distinct face normals, least squares solve n_i . x = 1
    const ns = [];
    for (const t of ts) { const n = fn[t]; if (!ns.some((m) => dot(m, n) > 0.999)) ns.push(n); }
    let x;
    if (ns.length === 1) x = ns[0];
    else {
      const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
      for (const n of ns) for (let i = 0; i < 3; i++) { r[i] += n[i]; for (let j = 0; j < 3; j++) A[i][j] += n[i] * n[j]; }
      x = ns.length >= 3 ? solve3(A, r) : null;
      if (!x) {
        // two planes (or a degenerate system): the bisector scaled to touch both offset planes
        let s = [0, 0, 0];
        for (const n of ns) s = add(s, n);
        const b = norm(s);
        const c = Math.max(0.3, Math.min(...ns.map((n) => dot(n, b))));
        x = mul(b, 1 / c);
      }
      if (len(x) > 3) x = mul(norm(x), 3);
    }
    out[3 * v] += x[0] * d; out[3 * v + 1] += x[1] * d; out[3 * v + 2] += x[2] * d;
  }
  return out;
}
/** Hollow a closed mesh: wall of thickness t inside / outside / both. */
export function hollow(W0, t, direction = "inside") {
  const W = clone(W0);
  let outerP = W.P, innerP;
  if (direction === "outside") { outerP = offsetVerts(W, t); innerP = W.P; }
  else if (direction === "both") { outerP = offsetVerts(W, t / 2); innerP = offsetVerts(W, -t / 2); }
  else innerP = offsetVerts(W, -t);
  const n = vcount(W);
  const P = [...outerP, ...innerP];
  const T = W.T.slice();
  const G = W.G.slice();
  const gi = nextGroup(W);
  for (let k = 0; k < W.T.length; k += 3) { T.push(W.T[k] + n, W.T[k + 2] + n, W.T[k + 1] + n); G.push(gi + (W.G[k / 3] || 0)); }
  // open meshes: close the gap between the outer and inner boundary loops
  const loops = boundaryLoops(W);
  for (const L of loops) {
    for (let i = 0; i < L.length; i++) {
      const a = L[i], b = L[(i + 1) % L.length];
      T.push(b, a, a + n, b, a + n, b + n); G.push(gi, gi);
    }
  }
  return { P, T, G, hasGroups: true };
}

// ------------------------------------------------------------------ bridges
/**
 * Bridge two selected regions: each region's open boundary loop is joined to the other's by a strip of
 * triangles (rings = extra rows for the density). Throws with Fusion's messages when the selection does not
 * define two separate regions with boundary edges.
 */
export function bridge(W, sel, { rings = 0, group = null } = {}) {
  const { comp } = components(W);
  const regions = new Map();
  for (let t = 0; t < tcount(W); t++) if (sel[t]) { const c = comp[t]; if (!regions.has(c)) regions.set(c, []); regions.get(c).push(t); }
  let regs = [...regions.values()];
  if (regs.length === 1) {
    // one shell: split the selection into its own connected parts
    const sub1 = new Uint8Array(tcount(W));
    for (const t of regs[0]) sub1[t] = 1;
    const N = triNeighbors(W);
    const lab = new Int32Array(tcount(W)).fill(-1);
    const parts = [];
    for (const s of regs[0]) {
      if (lab[s] >= 0) continue;
      const p = [s]; lab[s] = parts.length;
      for (let i = 0; i < p.length; i++) for (let k = 0; k < 3; k++) { const u = N[3 * p[i] + k]; if (u >= 0 && sub1[u] && lab[u] < 0) { lab[u] = parts.length; p.push(u); } }
      parts.push(p);
    }
    regs = parts;
  }
  if (regs.length !== 2) throw new Error("Cannot create a bridge: the selection doesn't define two separate regions.");
  const loops = boundaryLoops(W);
  const pick = (reg) => {
    const vs = new Set();
    for (const t of reg) for (let k = 0; k < 3; k++) vs.add(W.T[3 * t + k]);
    const cand = loops.filter((L) => L.some((v) => vs.has(v)));
    if (!cand.length) throw new Error("Cannot create a bridge: both regions must contain boundary edges.");
    if (cand.length > 1) {
      cand.sort((a, b) => b.filter((v) => vs.has(v)).length - a.filter((v) => vs.has(v)).length);
    }
    return cand[0];
  };
  const A = pick(regs[0]), B0 = pick(regs[1]);
  if (A === B0) throw new Error("Cannot create a bridge: the regions contain multiple boundaries.");
  // the strip runs A forward and B backward (opposite boundary directions face each other)
  const pa = A.map((v) => vtx(W, v));
  let best = null;
  for (const dir of [1, -1]) {
    const B = dir > 0 ? B0.slice() : B0.slice().reverse();
    const pb = B.map((v) => vtx(W, v));
    // best start offset: closest point of B to A[0]
    let off = 0, bd = Infinity;
    for (let j = 0; j < pb.length; j++) { const d = len(sub(pb[j], pa[0])); if (d < bd) { bd = d; off = j; } }
    const Br = [...B.slice(off), ...B.slice(0, off)];
    const pbr = Br.map((v) => vtx(W, v));
    let cost = 0;
    for (let i = 0; i < pa.length; i++) cost += len(sub(pa[i], pbr[Math.round((i * pbr.length) / pa.length) % pbr.length]));
    if (!best || cost < best.cost) best = { cost, B: Br };
  }
  const B = best.B;
  const g = group !== null ? group : W.G[0] || 0;
  const start = tcount(W);
  // intermediate rings
  const rowsV = [A];
  for (let r = 1; r <= rings; r++) {
    const s = r / (rings + 1);
    const row = A.map((v, i) => addV(W, lerp(vtx(W, v), vtx(W, B[Math.round((i * B.length) / A.length) % B.length]), s)));
    rowsV.push(row);
  }
  rowsV.push(B);
  const zip = (R1, R2) => {
    const n1 = R1.length, n2 = R2.length;
    let i = 0, j = 0;
    while (i < n1 || j < n2) {
      const a = R1[i % n1], a2 = R1[(i + 1) % n1], b = R2[j % n2], b2 = R2[(j + 1) % n2];
      const advA = j >= n2 || (i < n1 && len(sub(vtx(W, a2), vtx(W, b))) <= len(sub(vtx(W, b2), vtx(W, a))));
      if (advA) { W.T.push(a, a2, b); i++; } else { W.T.push(a, b2, b); j++; }
      W.G.push(g);
    }
  };
  for (let r = 0; r + 1 < rowsV.length; r++) zip(rowsV[r], rowsV[r + 1]);
  const made = [];
  for (let t = start; t < tcount(W); t++) made.push(t);
  orientPatch(W, made);
  return made;
}

// ------------------------------------------------------------------ quads
/** Greedy pairing of adjacent selected triangles into quads (best right-angle quality). Q[t] = partner or -1. */
export function pairQuads(W, sel, { sharpDeg = 30 } = {}) {
  const m = tcount(W);
  const N = triNeighbors(W);
  const Q = new Int32Array(m).fill(-1);
  const cand = [];
  const cosS = Math.cos((sharpDeg * Math.PI) / 180);
  for (let t = 0; t < m; t++) {
    if (sel && !sel[t]) continue;
    for (let k = 0; k < 3; k++) {
      const u = N[3 * t + k];
      if (u <= t || (sel && !sel[u]) || W.G[u] !== W.G[t]) continue;
      if (dot(triNormal(W, t), triNormal(W, u)) < cosS) continue;
      const a = W.T[3 * t + k], b = W.T[3 * t + ((k + 1) % 3)], c = W.T[3 * t + ((k + 2) % 3)];
      let d = -1;
      for (let j = 0; j < 3; j++) { const v = W.T[3 * u + j]; if (v !== a && v !== b) d = v; }
      const q = [a, d, b, c].map((v) => vtx(W, v));
      let err = 0;
      for (let i = 0; i < 4; i++) {
        const e1 = norm(sub(q[(i + 1) % 4], q[i])), e2 = norm(sub(q[(i + 3) % 4], q[i]));
        err += Math.abs(dot(e1, e2));
      }
      cand.push([err, t, u]);
    }
  }
  cand.sort((x, y) => x[0] - y[0]);
  for (const [err, t, u] of cand) { if (err > 1.6) break; if (Q[t] < 0 && Q[u] < 0) { Q[t] = u; Q[u] = t; } }
  return Q;
}
/** Display edges of a quad-paired mesh (all triangle edges except the quad diagonals): vertex index pairs. */
export function quadEdges(mesh) {
  const T = mesh.indices, Q = mesh.quadPair;
  if (!T || !Q) return [];
  const m = T.length / 3;
  const out = [];
  const seen = new Set();
  const n = mesh.positions.length / 3 + 1;
  for (let t = 0; t < m; t++) {
    for (let k = 0; k < 3; k++) {
      const a = T[3 * t + k], b = T[3 * t + ((k + 1) % 3)];
      const key = ekey(a, b, n);
      if (seen.has(key)) continue;
      seen.add(key);
      const u = Q[t];
      if (u >= 0) {
        let shared = 0;
        for (let j = 0; j < 3; j++) if (T[3 * u + j] === a || T[3 * u + j] === b) shared++;
        if (shared === 2) continue; // the diagonal
      }
      out.push(a, b);
    }
  }
  return out;
}

// ------------------------------------------------------------------ transforms
export function transformPoints(W, fn) {
  for (let v = 0; v < vcount(W); v++) setV(W, v, fn(vtx(W, v)));
  return W;
}
/** Rotation matrix (3x3 rows) taking unit vector a onto unit vector b. */
export function rotBetween(a, b) {
  a = norm(a); b = norm(b);
  const v = cross(a, b), c = dot(a, b);
  if (c < -0.999999) {
    const ax = norm(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
    return [[2 * ax[0] * ax[0] - 1, 2 * ax[0] * ax[1], 2 * ax[0] * ax[2]], [2 * ax[1] * ax[0], 2 * ax[1] * ax[1] - 1, 2 * ax[1] * ax[2]], [2 * ax[2] * ax[0], 2 * ax[2] * ax[1], 2 * ax[2] * ax[2] - 1]];
  }
  const k = 1 / (1 + c);
  return [
    [v[0] * v[0] * k + c, v[0] * v[1] * k - v[2], v[0] * v[2] * k + v[1]],
    [v[1] * v[0] * k + v[2], v[1] * v[1] * k + c, v[1] * v[2] * k - v[0]],
    [v[2] * v[0] * k - v[1], v[2] * v[1] * k + v[0], v[2] * v[2] * k + c],
  ];
}
export const applyR = (R, p) => [dot(R[0], p), dot(R[1], p), dot(R[2], p)];
/** Area-weighted plane {o, n} of the triangles in list. */
export function fitPlane(W, tris) {
  let n = [0, 0, 0], c = [0, 0, 0], a = 0;
  for (const t of tris) { const r = triNormalRaw(W, t); const ar = len(r) / 2; n = add(n, r); c = add(c, mul(triCentroid(W, t), ar)); a += ar; }
  return { o: a > 0 ? mul(c, 1 / a) : [0, 0, 0], n: norm(n), area: a };
}

// ------------------------------------------------------------------ voxel rebuild
/**
 * Rebuild a watertight mesh from an inside / outside voxel grid of the input (ray parity along x, y and z, majority
 * vote, so small holes do not leak). res = cells along the longest side. type 'blocky' (voxel faces), 'fast'
 * (surface nets), 'accurate' (surface nets projected back onto the input, offset along the normal).
 */
export function voxelRebuild(W, { res = 64, type = "fast", offset = 0 } = {}) {
  const bb = bbox(W);
  const ext = [0, 1, 2].map((k) => bb.max[k] - bb.min[k]);
  const L = Math.max(...ext);
  if (!(L > 0)) throw new Error("The mesh is empty");
  const h = L / res;
  const pad = 2;
  const nx = Math.ceil(ext[0] / h) + 2 * pad, ny = Math.ceil(ext[1] / h) + 2 * pad, nz = Math.ceil(ext[2] / h) + 2 * pad;
  if (nx * ny * nz > 12e6) throw new Error("The rebuild density is too high for this mesh");
  const o = [bb.min[0] - pad * h + h / 2, bb.min[1] - pad * h + h / 2, bb.min[2] - pad * h + h / 2]; // voxel centres
  const votes = new Uint8Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  // parity along each axis: bin triangles by their projection
  const axes = [[0, 1, 2], [1, 2, 0], [2, 0, 1]]; // [ray axis, u axis, v axis]
  const dims = [nx, ny, nz];
  for (const [ra, ua, va] of axes) {
    const nu = dims[ua], nvv = dims[va];
    const bins = new Map();
    for (let t = 0; t < tcount(W); t++) {
      const ids = [W.T[3 * t], W.T[3 * t + 1], W.T[3 * t + 2]];
      const us = ids.map((i) => (W.P[3 * i + ua] - o[ua]) / h), vs = ids.map((i) => (W.P[3 * i + va] - o[va]) / h);
      const u0 = Math.max(0, Math.ceil(Math.min(...us))), u1 = Math.min(nu - 1, Math.floor(Math.max(...us)));
      const v0 = Math.max(0, Math.ceil(Math.min(...vs))), v1 = Math.min(nvv - 1, Math.floor(Math.max(...vs)));
      for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) { const key = u + nu * v; const l = bins.get(key); if (l) l.push(t); else bins.set(key, [t]); }
    }
    for (const [key, ts] of bins) {
      const u = key % nu, v = Math.floor(key / nu);
      const pu = o[ua] + u * h + 1e-7 * h, pv = o[va] + v * h + 1.3e-7 * h;
      const hits = [];
      for (const t of ts) {
        const ids = [W.T[3 * t], W.T[3 * t + 1], W.T[3 * t + 2]];
        const A = ids.map((i) => [W.P[3 * i + ua], W.P[3 * i + va], W.P[3 * i + ra]]);
        // 2D barycentric of (pu, pv) in the projected triangle
        const d = (A[1][0] - A[0][0]) * (A[2][1] - A[0][1]) - (A[2][0] - A[0][0]) * (A[1][1] - A[0][1]);
        if (Math.abs(d) < 1e-18) continue;
        const l1 = ((pu - A[0][0]) * (A[2][1] - A[0][1]) - (A[2][0] - A[0][0]) * (pv - A[0][1])) / d;
        const l2 = ((A[1][0] - A[0][0]) * (pv - A[0][1]) - (pu - A[0][0]) * (A[1][1] - A[0][1])) / d;
        if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
        hits.push(A[0][2] + l1 * (A[1][2] - A[0][2]) + l2 * (A[2][2] - A[0][2]));
      }
      if (hits.length < 2) continue;
      hits.sort((x, y) => x - y);
      for (let q = 0; q + 1 < hits.length; q += 2) {
        const r0 = Math.max(0, Math.ceil((hits[q] - o[ra]) / h)), r1 = Math.min(dims[ra] - 1, Math.floor((hits[q + 1] - o[ra]) / h));
        for (let r = r0; r <= r1; r++) {
          const c = [0, 0, 0];
          c[ra] = r; c[ua] = u; c[va] = v;
          votes[id(c[0], c[1], c[2])]++;
        }
      }
    }
  }
  const occ = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && votes[id(i, j, k)] >= 2;
  const P = [], T = [];
  if (type === "blocky") {
    const vmap = new Map();
    const vert = (i, j, k) => { const key = i + (nx + 1) * (j + (ny + 1) * k); let v = vmap.get(key); if (v === undefined) { v = P.length / 3; vmap.set(key, v); P.push(o[0] - h / 2 + i * h, o[1] - h / 2 + j * h, o[2] - h / 2 + k * h); } return v; };
    const quad = (a, b, c, d) => T.push(a, b, c, a, c, d);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!occ(i, j, k)) continue;
      if (!occ(i + 1, j, k)) quad(vert(i + 1, j, k), vert(i + 1, j + 1, k), vert(i + 1, j + 1, k + 1), vert(i + 1, j, k + 1));
      if (!occ(i - 1, j, k)) quad(vert(i, j, k), vert(i, j, k + 1), vert(i, j + 1, k + 1), vert(i, j + 1, k));
      if (!occ(i, j + 1, k)) quad(vert(i, j + 1, k), vert(i, j + 1, k + 1), vert(i + 1, j + 1, k + 1), vert(i + 1, j + 1, k));
      if (!occ(i, j - 1, k)) quad(vert(i, j, k), vert(i + 1, j, k), vert(i + 1, j, k + 1), vert(i, j, k + 1));
      if (!occ(i, j, k + 1)) quad(vert(i, j, k + 1), vert(i + 1, j, k + 1), vert(i + 1, j + 1, k + 1), vert(i, j + 1, k + 1));
      if (!occ(i, j, k - 1)) quad(vert(i, j, k), vert(i, j + 1, k), vert(i + 1, j + 1, k), vert(i + 1, j, k));
    }
    return { P, T, G: new Array(T.length / 3).fill(0), hasGroups: false };
  }
  // surface nets: one vertex per cell (8 voxel centres) with mixed occupancy, quads across sign-changing edges
  const cid = (i, j, k) => i + (nx + 1) * (j + (ny + 1) * k);
  const cv = new Map();
  const cellVert = (i, j, k) => {
    const key = cid(i, j, k);
    let v = cv.get(key);
    if (v !== undefined) return v;
    // average of crossing edge midpoints of the cell spanned by voxel centres (i..i+1, j..j+1, k..k+1)
    let s = [0, 0, 0], c = 0;
    const corner = (a, b, d) => occ(i + a, j + b, k + d);
    const E = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
    for (const e of E) if (corner(e[0], e[1], e[2]) !== corner(e[3], e[4], e[5])) { s = add(s, [(e[0] + e[3]) / 2, (e[1] + e[4]) / 2, (e[2] + e[5]) / 2]); c++; }
    if (!c) s = [0.5, 0.5, 0.5]; else s = mul(s, 1 / c);
    v = P.length / 3;
    P.push(o[0] + (i + s[0]) * h, o[1] + (j + s[1]) * h, o[2] + (k + s[2]) * h);
    cv.set(key, v);
    return v;
  };
  const quad = (a, b, c, d, flip) => { if (flip) T.push(a, c, b, a, d, c); else T.push(a, b, c, a, c, d); };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = occ(i, j, k);
    // edge to +x neighbour: the 4 cells around it share the voxel edge
    if (i + 1 < nx && a !== occ(i + 1, j, k) && j > 0 && k > 0) quad(cellVert(i, j - 1, k - 1), cellVert(i, j, k - 1), cellVert(i, j, k), cellVert(i, j - 1, k), !a);
    if (j + 1 < ny && a !== occ(i, j + 1, k) && i > 0 && k > 0) quad(cellVert(i - 1, j, k - 1), cellVert(i - 1, j, k), cellVert(i, j, k), cellVert(i, j, k - 1), !a);
    if (k + 1 < nz && a !== occ(i, j, k + 1) && i > 0 && j > 0) quad(cellVert(i - 1, j - 1, k), cellVert(i, j - 1, k), cellVert(i, j, k), cellVert(i - 1, j, k), !a);
  }
  let R = { P, T, G: new Array(T.length / 3).fill(0), hasGroups: false };
  if (volume(R) < 0) reverse(R);
  const free = new Uint8Array(vcount(R)).fill(1);
  taubin(R, free, type === "accurate" ? 4 : 6, 0.5, -0.53);
  if (type === "accurate") {
    const grid = triGrid(W);
    const N = vertexNormals(R);
    for (let v = 0; v < vcount(R); v++) {
      const h2 = closestPoint(grid, vtx(R, v), h * 3);
      if (h2) setV(R, v, add(h2.q, mul([N[3 * v], N[3 * v + 1], N[3 * v + 2]], offset)));
    }
  } else if (offset) {
    R.P = offsetVerts(R, offset);
  }
  return R;
}

// ------------------------------------------------------------------ attract / texture helpers
/** Move the free vertices onto the reference mesh (closest point + offset along its normal). */
export function attract(W, free, ref, { offset = 0, smooth = 0, iters = 3, sharp = false } = {}) {
  const grid = triGrid(ref);
  const bb = bbox(ref);
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < vcount(W); v++) {
      if (!free[v]) continue;
      const h = closestPoint(grid, vtx(W, v), bb.size);
      if (!h) continue;
      const n = triNormal(ref, h.t);
      setV(W, v, add(h.q, mul(n, offset)));
    }
    if (smooth > 0 && it + 1 < iters) {
      let fr = free;
      if (sharp) {
        // keep vertices whose reference triangle meets a crease (they hold the sharp edges)
        fr = Uint8Array.from(free);
        const N = triNeighbors(ref);
        for (let v = 0; v < vcount(W); v++) {
          if (!fr[v]) continue;
          const h = closestPoint(grid, vtx(W, v), bb.size);
          if (!h) continue;
          const n0 = triNormal(ref, h.t);
          for (let k = 0; k < 3; k++) { const u = N[3 * h.t + k]; if (u >= 0 && dot(triNormal(ref, u), n0) < 0.8) { fr[v] = 0; break; } }
        }
      }
      taubin(W, fr, Math.round(1 + smooth * 4));
    }
  }
  return W;
}
