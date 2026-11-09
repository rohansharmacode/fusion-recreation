// Mesh booleans for the MESH tab Combine (Join / Cut / Intersect) on closed triangle meshes.
// Method: only the triangles near the overlap box of the two bodies take part. Each body's near triangles are cut
// into convex fragments by a BSP tree of the other body's near triangles (so no fragment crosses the other
// surface), then every fragment is classified by a ray-parity inside test against the WHOLE other body, probing
// just in front of and just behind the fragment (coplanar faces are kept once, like a solid modeller does).
// The kept fragments are triangulated, welded and their T-junctions split, so the result is a closed mesh again.
import { bbox, tcount, vtx, sub, dot, cross, len, norm, weldArrays, fixTJunctions, clean, compact } from "./algo.js";

const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function polysOf(W, keep) {
  const out = [];
  for (let t = 0; t < tcount(W); t++) {
    if (keep && !keep(t)) continue;
    const v = [vtx(W, W.T[3 * t]), vtx(W, W.T[3 * t + 1]), vtx(W, W.T[3 * t + 2])];
    const c = cross(sub(v[1], v[0]), sub(v[2], v[0]));
    const l = len(c);
    if (!(l > 0)) continue;
    const n = [c[0] / l, c[1] / l, c[2] / l];
    out.push({ v, n, w: dot(n, v[0]), g: W.G[t] ?? 0 });
  }
  return out;
}
function splitPoly(pl, poly, cf, cb, front, back, eps) {
  let type = 0;
  const types = [];
  for (const v of poly.v) {
    const t = dot(pl.n, v) - pl.w;
    const ty = t < -eps ? BACK : t > eps ? FRONT : COPLANAR;
    type |= ty;
    types.push(ty);
  }
  if (type === COPLANAR) (dot(pl.n, poly.n) > 0 ? cf : cb).push(poly);
  else if (type === FRONT) front.push(poly);
  else if (type === BACK) back.push(poly);
  else {
    const f = [], b = [];
    const n = poly.v.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ti = types[i], tj = types[j], vi = poly.v[i], vj = poly.v[j];
      if (ti !== BACK) f.push(vi);
      if (ti !== FRONT) b.push(vi);
      if ((ti | tj) === SPANNING) {
        const d = sub(vj, vi);
        const t = (pl.w - dot(pl.n, vi)) / dot(pl.n, d);
        const p = [vi[0] + d[0] * t, vi[1] + d[1] * t, vi[2] + d[2] * t];
        f.push(p); b.push(p);
      }
    }
    if (f.length >= 3) front.push({ ...poly, v: f });
    if (b.length >= 3) back.push({ ...poly, v: b });
  }
}
function buildBSP(polys, eps, rand) {
  const root = { plane: null, front: null, back: null, polys: [] };
  const st = [[root, polys]];
  while (st.length) {
    const [node, ps] = st.pop();
    if (!ps.length) continue;
    const p = ps[Math.floor(rand() * ps.length)];
    node.plane = { n: p.n, w: p.w };
    const f = [], b = [];
    for (const q of ps) splitPoly(node.plane, q, node.polys, node.polys, f, b, eps);
    if (f.length) { node.front = { plane: null, front: null, back: null, polys: [] }; st.push([node.front, f]); }
    if (b.length) { node.back = { plane: null, front: null, back: null, polys: [] }; st.push([node.back, b]); }
  }
  return root;
}
/**
 * Split polygons lying in a node's plane by the node's own (coplanar) polygons: each overlapping piece is clipped
 * convex-by-convex into the part inside the node polygon and up to one outside part per edge (linear growth).
 */
function splitByEdges(ps, node, eps) {
  let cur = ps;
  const box = (v) => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const p of v) for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; } return { lo, hi }; };
  const overlap = (a, b) => a.lo.every((x, k) => x <= b.hi[k] + eps) && b.lo.every((x, k) => x <= a.hi[k] + eps);
  for (const q of node.polys) {
    const qb = box(q.v);
    const next = [];
    for (const p of cur) {
      if (!overlap(box(p.v), qb)) { next.push(p); continue; }
      let inside = p;
      for (let i = 0; i < q.v.length && inside; i++) {
        const a = q.v[i], b = q.v[(i + 1) % q.v.length];
        const n = norm(cross(q.n, sub(b, a))); // points into q
        const f = [], bk = [];
        splitPoly({ n, w: dot(n, a) }, inside, f, bk, f, bk, eps);
        for (const x of bk) next.push(x);
        inside = f[0] || null;
      }
      if (inside) next.push(inside);
    }
    cur = next;
  }
  return cur;
}
/** Cut polygons into the cells of the BSP (all pieces kept). Coplanar pieces are refined by both subtrees. */
function fragment(root, polys, eps) {
  const out = [];
  const st = [[root, polys]];
  while (st.length) {
    const [node, ps] = st.pop();
    if (!ps.length) continue;
    if (!node || !node.plane) { for (const p of ps) out.push(p); continue; }
    const f = [], b = [], c = [];
    for (const p of ps) splitPoly(node.plane, p, c, c, f, b, eps);
    if (node.front) st.push([node.front, f]); else for (const p of f) out.push(p);
    if (node.back) st.push([node.back, b]); else for (const p of b) out.push(p);
    if (c.length) {
      let pieces = splitByEdges(c, node, eps);
      if (node.front) pieces = fragment(node.front, pieces, eps);
      if (node.back) pieces = fragment(node.back, pieces, eps);
      for (const p of pieces) out.push(p);
    }
  }
  return out;
}
/** Ray-parity inside test of a closed mesh (rays along +x, +y, +z, majority vote; triangles binned per axis). */
export function insideTester(W) {
  const bb = bbox(W);
  const m = tcount(W);
  const cell = Math.max(bb.size / Math.max(4, Math.sqrt(m)), 1e-9);
  const axes = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
  const bins = axes.map(([, u, v]) => {
    const map = new Map();
    for (let t = 0; t < m; t++) {
      const ids = [W.T[3 * t], W.T[3 * t + 1], W.T[3 * t + 2]];
      const us = ids.map((i) => W.P[3 * i + u]), vs = ids.map((i) => W.P[3 * i + v]);
      const u0 = Math.floor((Math.min(...us) - bb.min[u]) / cell), u1 = Math.floor((Math.max(...us) - bb.min[u]) / cell);
      const v0 = Math.floor((Math.min(...vs) - bb.min[v]) / cell), v1 = Math.floor((Math.max(...vs) - bb.min[v]) / cell);
      for (let a = u0; a <= u1; a++) for (let b = v0; b <= v1; b++) { const k = a * 73856093 ^ b * 19349663; const l = map.get(k); if (l) l.push(t); else map.set(k, [t]); }
    }
    return map;
  });
  const jit = [[0, 1.7e-7, 2.9e-7], [3.1e-7, 0, 1.3e-7], [2.3e-7, 1.1e-7, 0]];
  return (p0) => {
    let votes = 0;
    for (let ai = 0; ai < 3; ai++) {
      const [r, u, v] = axes[ai];
      const p = [p0[0] + jit[ai][0] * bb.size, p0[1] + jit[ai][1] * bb.size, p0[2] + jit[ai][2] * bb.size];
      const a = Math.floor((p[u] - bb.min[u]) / cell), b = Math.floor((p[v] - bb.min[v]) / cell);
      const list = bins[ai].get(a * 73856093 ^ b * 19349663) || [];
      let c = 0;
      for (const t of list) {
        const A = vtx(W, W.T[3 * t]), B = vtx(W, W.T[3 * t + 1]), C = vtx(W, W.T[3 * t + 2]);
        const d = (B[u] - A[u]) * (C[v] - A[v]) - (C[u] - A[u]) * (B[v] - A[v]);
        if (Math.abs(d) < 1e-30) continue;
        const l1 = ((p[u] - A[u]) * (C[v] - A[v]) - (C[u] - A[u]) * (p[v] - A[v])) / d;
        const l2 = ((B[u] - A[u]) * (p[v] - A[v]) - (p[u] - A[u]) * (B[v] - A[v])) / d;
        if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
        const h = A[r] + l1 * (B[r] - A[r]) + l2 * (C[r] - A[r]);
        if (h > p[r]) c++;
      }
      if (c % 2) votes++;
    }
    return votes >= 2;
  };
}
function overlapBox(a, b, pad) {
  const min = [0, 1, 2].map((k) => Math.max(a.min[k], b.min[k]) - pad);
  const max = [0, 1, 2].map((k) => Math.min(a.max[k], b.max[k]) + pad);
  return { min, max, empty: min.some((v, k) => v > max[k]) };
}
function triTouches(W, t, box) {
  for (let k = 0; k < 3; k++) {
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < 3; j++) { const v = W.P[3 * W.T[3 * t + j] + k]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi < box.min[k] || lo > box.max[k]) return false;
  }
  return true;
}
/** 'in' | 'out' | 'same' (coplanar, same orientation as the other surface) | 'opp' for a fragment against inside(). */
function classify(poly, inside, h) {
  const v = poly.v;
  // interior point of the convex fragment: centroid
  let c = [0, 0, 0];
  for (const p of v) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c = [c[0] / v.length, c[1] / v.length, c[2] / v.length];
  const a = inside([c[0] + poly.n[0] * h, c[1] + poly.n[1] * h, c[2] + poly.n[2] * h]);
  const b = inside([c[0] - poly.n[0] * h, c[1] - poly.n[1] * h, c[2] - poly.n[2] * h]);
  if (a && b) return "in";
  if (!a && !b) return "out";
  return b ? "same" : "opp";
}
/**
 * Boolean of two closed work meshes. op 'join' | 'cut' (A minus B) | 'intersect'. Face groups of B are shifted
 * after A's. Returns a work mesh.
 */
export function boolean(A, B, op) {
  const ba = bbox(A), bb = bbox(B);
  const size = Math.max(ba.size, bb.size, 1e-6);
  const eps = size * 1e-9;
  const h = size * 2e-6;
  const ob = overlapBox(ba, bb, size * 1e-6);
  let gmax = 0;
  for (const g of A.G) if (g > gmax) gmax = g;
  const goff = gmax + 1;
  const out = [];
  const push = (poly, flip, g) => {
    const v = flip ? poly.v.slice().reverse() : poly.v;
    out.push({ v, g });
  };
  if (ob.empty) {
    if (op === "join") { for (const p of polysOf(A)) push(p, false, p.g); for (const p of polysOf(B)) push(p, false, p.g + goff); }
    else if (op === "cut") for (const p of polysOf(A)) push(p, false, p.g);
    return assemble(out, size);
  }
  const nearA = (t) => triTouches(A, t, ob), nearB = (t) => triTouches(B, t, ob);
  const farA = polysOf(A, (t) => !nearA(t)), farB = polysOf(B, (t) => !nearB(t));
  const pa = polysOf(A, nearA), pb = polysOf(B, nearB);
  const rand = rng(pa.length * 31 + pb.length * 7 + 1);
  const bspB = buildBSP(pb, eps, rand);
  const bspA = buildBSP(pa, eps, rand);
  const fa = fragment(bspB, pa, eps);
  const fb = fragment(bspA, pb, eps);
  const inA = insideTester(A), inB = insideTester(B);
  // far triangles: A far ones are outside B, B far ones are outside A
  if (op === "join") { for (const p of farA) push(p, false, p.g); for (const p of farB) push(p, false, p.g + goff); }
  else if (op === "cut") for (const p of farA) push(p, false, p.g);
  for (const p of fa) {
    const c = classify(p, inB, h);
    if (op === "join" && (c === "out" || c === "same")) push(p, false, p.g);
    else if (op === "intersect" && (c === "in" || c === "same")) push(p, false, p.g);
    else if (op === "cut" && (c === "out" || c === "opp")) push(p, false, p.g);
  }
  for (const p of fb) {
    const c = classify(p, inA, h);
    if (op === "join" && c === "out") push(p, false, p.g + goff);
    else if (op === "intersect" && c === "in") push(p, false, p.g + goff);
    else if (op === "cut" && c === "in") push(p, true, p.g + goff);
  }
  return assemble(out, size);
}
function assemble(polys, size) {
  const P = [], T = [], G = [];
  for (const p of polys) {
    const base = P.length / 3;
    for (const v of p.v) P.push(v[0], v[1], v[2]);
    for (let k = 1; k + 1 < p.v.length; k++) { T.push(base, base + k, base + k + 1); G.push(p.g); }
  }
  const w = weldArrays(P, T, size * 1e-7);
  let W = { P: w.P, T: w.T, G: w.keep.map((t) => G[t]), hasGroups: true };
  fixTJunctions(W, size * 1e-6);
  W = clean(W, { areaEps: (size * 1e-9) ** 2 });
  return compact(W);
}
/** Append B to A (Merge: no boolean). */
export function merge(A, B) {
  const n = A.P.length / 3;
  let gmax = 0;
  for (const g of A.G) if (g > gmax) gmax = g;
  return { P: [...A.P, ...B.P], T: [...A.T, ...B.T.map((v) => v + n)], G: [...A.G, ...B.G.map((g) => g + gmax + 1)], hasGroups: A.hasGroups || B.hasGroups };
}
export { norm };
