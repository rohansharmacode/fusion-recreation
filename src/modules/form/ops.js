// T-spline cage operations (pure functions: cage in, new cage out; errors are user-facing messages).
// Topology: delete, extrude (Alt-drag), insert edge, subdivide, insert point, weld / unweld, bridge, fill hole,
// erase and fill, bevel, slide, merge edge, thicken, mirror / circular duplicate, repair.
// Shape: smooth, flatten, straighten, cylindrify, interpolate, make uniform, pull, match, fit to targets.
import {
  V, cloneCage, compact, tidy, topo, otherEnd, chains, boundaryLoops, faceNormal, faceCentroid, vertexNormal, ek,
  assertNotFrozen, frozenSet, orient, bbox, refVerts, isClosed,
} from "./cage.js";
import { limitOfCage, subdivide, ekey } from "./subdiv.js";

const rot = (fc, v) => { const i = fc.indexOf(v); return i < 0 ? null : [...fc.slice(i), ...fc.slice(0, i)]; };
const dedupe = (fc) => { const o = []; for (const v of fc) if (o[o.length - 1] !== v) o.push(v); while (o.length > 1 && o[0] === o[o.length - 1]) o.pop(); return o; };
function findDirected(F, a, b) {
  for (let g = 0; g < F.length; g++) { const fc = F[g]; const i = fc.indexOf(a); if (i >= 0 && fc[(i + 1) % fc.length] === b) return g; }
  return -1;
}
/** Insert vertex x between u and w in every face (except skip) that has u, w consecutive. */
function insertInEdge(F, u, w, x, skip = -1) {
  for (let g = 0; g < F.length; g++) {
    if (g === skip) continue;
    const fc = F[g];
    for (let i = 0; i < fc.length; i++) {
      const a = fc[i], b = fc[(i + 1) % fc.length];
      if ((a === u && b === w) || (a === w && b === u)) { fc.splice(i + 1, 0, x); break; }
    }
  }
}
const finish = (c, P, F, extra = {}) => tidy({ ...c, v: P, f: F, ...extra });

// ---------------------------------------------------------------- fitting (surface passes through targets)
/**
 * Move vertices `which` (default all) so that their limit positions approach `targets` (array aligned with c.v,
 * null = no target). Jacobi iteration on the limit stencil (converges: its eigenvalues are in (0, 1]).
 */
export function fitToTargets(c, targets, iters = 10, which = null) {
  let cur = cloneCage(c);
  const idx = which ? [...which] : cur.v.map((_, i) => i);
  for (let it = 0; it < iters; it++) {
    const L = limitOfCage(cur);
    let err = 0;
    for (const i of idx) {
      const t = targets[i];
      if (!t) continue;
      const d = V.sub(t, L[i]);
      err = Math.max(err, V.len(d));
      cur.v[i] = V.add(cur.v[i], d);
    }
    if (err < 1e-7) break;
    cur = { ...cur };
  }
  return tidy(cur);
}

// ---------------------------------------------------------------- delete
export function deleteElements(c, refs) {
  const fz = frozenSet(c);
  const F = c.f.map((x) => x.slice());
  const kill = new Set();
  const t = topo(c);
  for (const r of refs) if (r.kind === "tsFace") kill.add(r.f);
  // vertices: remove the faces around them; interior vertices get the ring filled with one face
  const fills = [];
  for (const r of refs) {
    if (r.kind !== "tsVertex") continue;
    if (fz.has(r.v)) throw new Error("This operation affects one or more frozen regions.");
    const fs = t.vFaces[r.v];
    const interior = t.vEdges[r.v].every((e) => t.eFaces[e].length === 2);
    for (const f of fs) kill.add(f);
    if (interior && fs.length >= 2) {
      // ring polygon: walk the faces around v, collecting each face's vertices except v
      const ring = [];
      let f = fs[0];
      const seen = new Set();
      for (let guard = 0; guard < 64 && !seen.has(f); guard++) {
        seen.add(f);
        const fc = rot(c.f[f], r.v);
        ring.push(...fc.slice(1, -1));
        const last = fc[fc.length - 1]; // edge last -> v belongs to the next face (as v -> last)
        const nf = findDirected(c.f, r.v, last);
        if (nf < 0) break;
        f = nf;
      }
      if (seen.size === fs.length && new Set(ring).size === ring.length && ring.length >= 3) fills.push(ring);
    }
  }
  let G = F.filter((_, i) => !kill.has(i));
  for (const ring of fills) G.push(ring);
  // edges: dissolve interior edges (merge faces), boundary edges remove their face
  for (const r of refs) {
    if (r.kind !== "tsEdge") continue;
    const g1 = findDirected(G, r.a, r.b), g2 = findDirected(G, r.b, r.a);
    if (g1 >= 0 && g2 >= 0) {
      const A = rot(G[g1], r.b), B = rot(G[g2], r.a);
      const merged = dedupe([...A, ...B.slice(1, -1)]);
      if (new Set(merged).size !== merged.length || merged.length < 3) continue;
      G[g1] = merged;
      G.splice(g2, 1);
    } else if (g1 >= 0 || g2 >= 0) G.splice(g1 >= 0 ? g1 : g2, 1);
  }
  return compact({ ...c, f: G }).cage;
}

// ---------------------------------------------------------------- extrude (Alt-drag)
/** Extrude a face region: returns {cage, faces (same indices, now the moved copies), verts (moved vertex set)}. */
export function extrudeFaces(c, faceIdx) {
  const sel = new Set(faceIdx);
  const t = topo(c);
  assertNotFrozen(c, refVerts(c, faceIdx.map((f) => ({ kind: "tsFace", f }))));
  const P = c.v.map((p) => p.slice());
  const F = c.f.map((x) => x.slice());
  const isRegionBoundary = (e) => t.eFaces[e].filter((f) => sel.has(f)).length === 1;
  const dup = new Map();
  for (const f of sel) for (const e of t.fEdges[f]) if (isRegionBoundary(e)) for (const v of t.edges[e]) if (!dup.has(v)) { dup.set(v, P.length); P.push(P[v].slice()); }
  const sides = [];
  for (const f of sel) {
    const fc = c.f[f];
    for (let i = 0; i < fc.length; i++) {
      const a = fc[i], b = fc[(i + 1) % fc.length];
      if (!isRegionBoundary(t.edge(a, b))) continue;
      sides.push([a, b, dup.get(b), dup.get(a)]);
    }
    F[f] = fc.map((v) => (dup.has(v) ? dup.get(v) : v));
  }
  const moved = new Set();
  for (const f of sel) for (const v of F[f]) moved.add(v);
  // creases of the region move with it
  const crease = (c.crease || []).map(([a, b]) => (sel.size && dup.has(a) && dup.has(b) ? [dup.get(a), dup.get(b)] : [a, b]));
  return { cage: finish(c, P, [...F, ...sides], { crease }), faces: [...sel], verts: moved };
}
/** Extrude boundary edges into new faces: {cage, edges: [[a', b']], verts}. */
export function extrudeEdges(c, edgeRefs) {
  const t = topo(c);
  const P = c.v.map((p) => p.slice());
  const F = c.f.map((x) => x.slice());
  const dup = new Map();
  const d = (v) => { if (!dup.has(v)) { dup.set(v, P.length); P.push(P[v].slice()); } return dup.get(v); };
  const out = [];
  for (const r of edgeRefs) {
    const e = t.edge(r.a, r.b);
    if (e < 0 || t.eFaces[e].length !== 1) throw new Error("Only boundary edges can be extruded");
    const fc = c.f[t.eFaces[e][0]];
    const i = fc.indexOf(r.a);
    const [a, b] = fc[(i + 1) % fc.length] === r.b ? [r.a, r.b] : [r.b, r.a];
    F.push([b, a, d(a), d(b)]);
    out.push([d(a), d(b)]);
  }
  return { cage: finish(c, P, F), edges: out, verts: new Set(dup.values()) };
}

// ---------------------------------------------------------------- insert edge
/**
 * Insert edges parallel to the selected edges, at ratio t across the neighbouring faces.
 * side: 'both' | 'single' (left of each chain). exact: fit the new vertices back onto the old surface.
 * Returns {cage, verts: new vertex indices}.
 */
export function insertEdges(c, edgeRefs, { side = "both", t = 0.5, exact = false } = {}) {
  const T = topo(c);
  const eIdx = edgeRefs.map((r) => T.edge(r.a, r.b)).filter((e) => e >= 0);
  if (!eIdx.length) throw new Error("Select T-Spline edges");
  t = Math.min(0.98, Math.max(0.02, t));
  const P = c.v.map((p) => p.slice());
  const F = c.f.map((x) => x.slice());
  const created = new Map(), onEdge = new Map(), fresh = new Set();
  const tasks = [];
  for (const ch of chains(c, eIdx)) {
    for (let i = 0; i < ch.length - 1; i++) {
      const p = ch[i], q = ch[i + 1];
      if (findDirected(c.f, p, q) >= 0) tasks.push([p, q]);
      if (side === "both" && findDirected(c.f, q, p) >= 0) tasks.push([q, p]);
      if (side !== "both" && findDirected(c.f, p, q) < 0 && findDirected(c.f, q, p) >= 0) tasks.push([q, p]);
    }
  }
  const cross = (u, w, g) => {
    if (fresh.has(w)) return w;
    const key = `${u}>${w}`;
    if (created.has(key)) return created.get(key);
    const x = P.length;
    P.push(V.lerp(P[u], P[w], t));
    created.set(key, x); fresh.add(x); onEdge.set(x, [u, w, t]);
    insertInEdge(F, u, w, x, g);
    return x;
  };
  for (const [a, b] of tasks) {
    const g = findDirected(F, a, b);
    if (g < 0) continue;
    const fc = rot(F[g], a);
    const n = fc.length;
    if (n < 3) continue;
    const c1 = fc[2 % n], c0 = fc[n - 1];
    if (c1 === a || c0 === b) continue;
    const X = cross(b, c1, g);
    const Y = cross(a, c0, g);
    const cur = rot(F[g], a); // X / Y were inserted into this face too only when reused; rebuild from the original order
    void cur;
    const rest = fc.slice(2);
    F[g] = dedupe([a, b, X, Y]);
    F.push(dedupe([X, ...rest, Y]));
  }
  // crease edges split by a new vertex stay creased on both halves
  const crease = [];
  const cs = new Set((c.crease || []).map(([a, b]) => ek(a, b)));
  for (const [x, [u, w]] of onEdge) if (cs.has(ek(u, w))) crease.push([u, x], [x, w]);
  let out = finish(c, P, F.filter((fc) => fc.length >= 3), { crease: [...(c.crease || []), ...crease] });
  if (exact && fresh.size) out = fitNewPoints(c, out, onEdge);
  return { cage: out, verts: [...fresh], onEdge };
}
/** Exact mode: fit inserted edge points (on old edge u-w at ratio t) back onto the old limit curves. */
function fitNewPoints(old, cur, onEdge) {
  const sub = subdivide(old, 3, { track: true });
  const targets = new Array(cur.v.length).fill(null);
  for (const [x, [u, w, t]] of onEdge) {
    const ch = sub.chains.get(ekey(u, w));
    if (!ch) continue;
    const arr = u < w ? ch : Array.from(ch).reverse();
    const s = t * (arr.length - 1), i = Math.min(arr.length - 2, Math.floor(s)), f = s - i;
    const p = (k) => [sub.P[3 * arr[k]], sub.P[3 * arr[k] + 1], sub.P[3 * arr[k] + 2]];
    targets[x] = V.lerp(p(i), p(i + 1), f);
  }
  return fitToTargets(cur, targets, 8, [...onEdge.keys()]);
}

// ---------------------------------------------------------------- subdivide faces
export function subdivideFaces(c, faceIdx, { k = 2, exact = false } = {}) {
  const sel = [...new Set(faceIdx)].filter((f) => c.f[f]);
  if (!sel.length) throw new Error("Select faces to divide");
  assertNotFrozen(c, refVerts(c, sel.map((f) => ({ kind: "tsFace", f }))));
  k = Math.max(2, Math.min(16, k | 0));
  const T = topo(c);
  const P = c.v.map((p) => p.slice());
  const F = c.f.map((x) => x.slice());
  const edgePts = new Map(); // ekey -> [ids from min to max endpoint]
  const targets = [];
  const L1 = exact ? subdivide(c, 1) : null;
  const nv = c.v.length, ne = T.edges.length;
  const lim = (i) => [L1.P[3 * i], L1.P[3 * i + 1], L1.P[3 * i + 2]];
  const pts = (u, w) => {
    const key = ek(u, w);
    if (!edgePts.has(key)) {
      const lo = Math.min(u, w), hi = Math.max(u, w);
      const ids = [];
      for (let s = 1; s < k; s++) { ids.push(P.length); P.push(V.lerp(P[lo], P[hi], s / k)); }
      if (exact && k === 2) targets.push([ids[0], lim(nv + T.edge(u, w))]);
      edgePts.set(key, ids);
    }
    const ids = edgePts.get(key);
    return u < w ? ids : ids.slice().reverse();
  };
  const newFaces = [];
  const selSet = new Set(sel);
  for (const f of sel) {
    const fc = c.f[f], n = fc.length;
    if (n === 4 && k > 2) {
      // k x k grid
      const g = [];
      const E0 = pts(fc[0], fc[1]), E1 = pts(fc[1], fc[2]), E2 = pts(fc[3], fc[2]), E3 = pts(fc[0], fc[3]);
      for (let i = 0; i <= k; i++) {
        g.push([]);
        for (let j = 0; j <= k; j++) {
          let id;
          if (j === 0) id = i === 0 ? fc[0] : i === k ? fc[1] : E0[i - 1];
          else if (j === k) id = i === 0 ? fc[3] : i === k ? fc[2] : E2[i - 1];
          else if (i === 0) id = E3[j - 1];
          else if (i === k) id = E1[j - 1];
          else {
            const a = V.lerp(P[fc[0]], P[fc[1]], i / k), b = V.lerp(P[fc[3]], P[fc[2]], i / k);
            id = P.length; P.push(V.lerp(a, b, j / k));
          }
          g[i].push(id);
        }
      }
      const cells = [];
      for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) cells.push([g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]]);
      F[f] = cells[0];
      for (const cl of cells.slice(1)) { newFaces.push(F.length); F.push(cl); }
      continue;
    }
    const C = P.length;
    P.push(faceCentroid(c, f));
    if (exact) targets.push([C, lim(nv + ne + f)]);
    const quads = [];
    for (let i = 0; i < n; i++) {
      const a = fc[i], b = fc[(i + 1) % n], p = fc[(i + n - 1) % n];
      quads.push([a, pts(a, b)[0], C, pts(p, a)[0]]);
    }
    F[f] = quads[0];
    for (const q of quads.slice(1)) { newFaces.push(F.length); F.push(q); }
  }
  // neighbours of divided faces get the edge points (T-junctions)
  for (const [key, ids] of edgePts) {
    const [lo, hi] = key.split(",").map(Number);
    for (let g = 0; g < c.f.length; g++) {
      if (selSet.has(g)) continue;
      const fc = F[g];
      for (let i = 0; i < fc.length; i++) {
        const a = fc[i], b = fc[(i + 1) % fc.length];
        if (a === lo && b === hi) { fc.splice(i + 1, 0, ...ids); break; }
        if (a === hi && b === lo) { fc.splice(i + 1, 0, ...ids.slice().reverse()); break; }
      }
    }
  }
  const cs = new Set((c.crease || []).map(([a, b]) => ek(a, b)));
  const crease = [...(c.crease || [])];
  for (const [key, ids] of edgePts) {
    if (!cs.has(key)) continue;
    const [lo, hi] = key.split(",").map(Number);
    const chain = [lo, ...ids, hi];
    for (let i = 0; i < chain.length - 1; i++) crease.push([chain[i], chain[i + 1]]);
  }
  let out = finish(c, P, F, { crease });
  if (exact && targets.length) {
    const tg = new Array(out.v.length).fill(null);
    for (const [i, p] of targets) tg[i] = p;
    out = fitToTargets(out, tg, 8, targets.map((x) => x[0]));
  }
  return { cage: out, faces: [...sel, ...newFaces] };
}

// ---------------------------------------------------------------- insert point
/** pts: [{v} | {a, b, t (from a)}] x2. Splits the face holding both points with a new edge. */
export function insertPoint(c, A, B) {
  const P = c.v.map((p) => p.slice());
  const F = c.f.map((x) => x.slice());
  const place = (q) => {
    if (q.v !== undefined) return q.v;
    const t = Math.min(0.999, Math.max(0.001, q.t));
    const x = P.length;
    P.push(V.lerp(P[q.a], P[q.b], t));
    insertInEdge(F, q.a, q.b, x);
    return x;
  };
  const a = place(A), b = place(B);
  if (a === b) throw new Error("Select two different points");
  const g = F.findIndex((fc) => { const i = fc.indexOf(a), j = fc.indexOf(b); if (i < 0 || j < 0) return false; const d = Math.abs(i - j); return d !== 1 && d !== fc.length - 1; });
  if (g < 0) throw new Error("The two points must lie on the same face and not on the same edge");
  const fc = rot(F[g], a);
  const j = fc.indexOf(b);
  F[g] = fc.slice(0, j + 1);
  F.push([...fc.slice(j), a]);
  const cs = new Set((c.crease || []).map(([u, w]) => ek(u, w)));
  const crease = [...(c.crease || [])];
  for (const [q, x] of [[A, a], [B, b]]) if (q.v === undefined && cs.has(ek(q.a, q.b))) crease.push([q.a, x], [x, q.b]);
  return { cage: finish(c, P, F, { crease }), edge: [a, b] };
}

// ---------------------------------------------------------------- weld / unweld
export function weld(c, verts, { mode = "vertex", tol = 0.1 } = {}) {
  const vs = [...verts];
  if (vs.length < 2) throw new Error("Select at least two vertices");
  const map = new Map();
  const P = c.v.map((p) => p.slice());
  if (mode === "tol") {
    const used = new Set();
    for (const v of vs) {
      if (used.has(v)) continue;
      const grp = vs.filter((w) => !used.has(w) && V.dist(P[v], P[w]) <= tol);
      if (grp.length < 2) continue;
      const m = V.avg(grp.map((w) => P[w]));
      for (const w of grp) { used.add(w); map.set(w, v); }
      P[v] = m;
    }
    if (!map.size) throw new Error("No vertices lie within the weld tolerance");
  } else {
    const target = vs[0];
    P[target] = mode === "mid" ? V.avg(vs.map((w) => P[w])) : P[target];
    for (const w of vs) map.set(w, target);
  }
  const m = (v) => (map.has(v) ? map.get(v) : v);
  const crease = (c.crease || []).map(([a, b]) => [m(a), m(b)]);
  return compact({ ...c, v: P, f: c.f.map((fc) => fc.map(m)), crease, cv: (c.cv || []).map(m), frozen: (c.frozen || []).map(m), iso: (c.iso || []).map(m) }).cage;
}
export function unweld(c, edgeRefs) {
  const T = topo(c);
  const cut = new Set(edgeRefs.map((r) => T.edge(r.a, r.b)).filter((e) => e >= 0 && T.eFaces[e].length === 2));
  if (!cut.size) throw new Error("Select edges between two faces");
  const P = c.v.map((p) => p.slice());
  const F = c.f.map((x) => x.slice());
  const origin = c.v.map((_, i) => i);
  const verts = new Set();
  for (const e of cut) for (const v of T.edges[e]) verts.add(v);
  for (const v of verts) {
    const fs = T.vFaces[v];
    const parent = new Map(fs.map((f) => [f, f]));
    const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
    for (const e of T.vEdges[v]) {
      if (cut.has(e) || T.eFaces[e].length !== 2) continue;
      const [f1, f2] = T.eFaces[e];
      parent.set(find(f1), find(f2));
    }
    const roots = [...new Set(fs.map(find))];
    roots.slice(1).forEach((r) => {
      const nv = P.length;
      P.push(P[v].slice()); origin.push(v);
      for (const f of fs) if (find(f) === r) F[f] = F[f].map((x) => (x === v ? nv : x));
    });
  }
  // creases follow every copy that still forms an edge
  const out = { ...c, v: P, f: F };
  const t2 = topo(out);
  const cs = new Set((c.crease || []).map(([a, b]) => ek(a, b)));
  out.crease = t2.edges.filter(([a, b]) => cs.has(ek(origin[a], origin[b])));
  return tidy(out);
}

// ---------------------------------------------------------------- crease
export function setCrease(c, refs, on) {
  const out = cloneCage(c);
  const T = topo(c);
  const cs = new Map((out.crease || []).map((e) => [ek(e[0], e[1]), e]));
  const cv = new Set(out.cv || []);
  for (const r of refs) {
    if (r.kind === "tsEdge") { if (on) cs.set(ek(r.a, r.b), [r.a, r.b]); else cs.delete(ek(r.a, r.b)); }
    else if (r.kind === "tsVertex") { if (on) cv.add(r.v); else { cv.delete(r.v); for (const e of T.vEdges[r.v]) cs.delete(ek(...T.edges[e])); } }
    else if (r.kind === "tsFace") for (const e of T.fEdges[r.f]) { const [a, b] = T.edges[e]; if (on) cs.set(ek(a, b), [a, b]); else cs.delete(ek(a, b)); }
  }
  out.crease = [...cs.values()];
  out.cv = [...cv];
  return tidy(out);
}

// ---------------------------------------------------------------- bridge
function sideLoop(c, side) {
  // side: {faces:[...]} | {edges:[[a,b]]}; returns {verts:[...], closed, dirs:[unit], remove:[faces]}
  const T = topo(c);
  if (side.faces && side.faces.length) {
    const sel = new Set(side.faces);
    const next = new Map();
    for (const f of sel) {
      const fc = c.f[f];
      for (let i = 0; i < fc.length; i++) {
        const a = fc[i], b = fc[(i + 1) % fc.length];
        if (T.eFaces[T.edge(a, b)].filter((g) => sel.has(g)).length === 1) next.set(b, a); // remaining faces traverse b -> a? keep a->b of the hole
      }
    }
    // order the region boundary as the REMAINING faces will traverse it (reverse of the removed faces)
    const start = next.keys().next().value;
    if (start === undefined) throw new Error("The selected faces have no boundary");
    const verts = [];
    let v = start;
    for (let guard = 0; guard < 100000; guard++) { verts.push(v); v = next.get(v); if (v === start || v === undefined) break; }
    if (verts.length !== next.size) throw new Error("Select a single connected group of faces on each side");
    let n = [0, 0, 0];
    for (const f of sel) n = V.add(n, faceNormal(c, f));
    n = V.norm(n);
    return { verts, closed: true, dirs: verts.map(() => n), remove: [...sel] };
  }
  const eIdx = (side.edges || []).map(([a, b]) => T.edge(a, b)).filter((e) => e >= 0);
  if (!eIdx.length) throw new Error("Select faces or boundary edges");
  if (eIdx.some((e) => T.eFaces[e].length !== 1)) throw new Error("Only boundary edges can be bridged");
  const chs = chains(c, eIdx);
  if (chs.length !== 1) throw new Error("Select one connected chain of edges on each side");
  let verts = chs[0];
  const closed = verts.length > 2 && verts[0] === verts[verts.length - 1];
  if (closed) verts = verts.slice(0, -1);
  // orient like the adjacent faces traverse the boundary
  const a = verts[0], b = verts[1];
  if (findDirected(c.f, a, b) < 0) verts.reverse();
  const dirs = verts.map((v) => {
    let d = [0, 0, 0];
    for (const e of T.vEdges[v]) {
      if (!eIdx.includes(e)) continue;
      const f = T.eFaces[e][0];
      const [x, y] = T.edges[e];
      d = V.add(d, V.norm(V.sub(V.lerp(c.v[x], c.v[y], 0.5), faceCentroid(c, f))));
    }
    return V.norm(d);
  });
  return { verts, closed, dirs, remove: [] };
}
export function bridge(c, sideA, sideB, { segments = 1, twist = 0 } = {}) {
  const A = sideLoop(c, sideA), B = sideLoop(c, sideB);
  if (A.verts.length !== B.verts.length) throw new Error(`Side 1 has ${A.verts.length} edges and side 2 has ${B.verts.length}: select the same number of edges on each side`);
  if (A.closed !== B.closed) throw new Error("Select closed loops (faces) or open chains on both sides");
  assertNotFrozen(c, [...A.verts, ...B.verts]);
  const n = A.verts.length;
  const P = c.v.map((p) => p.slice());
  // B runs against A: reverse it, then pick the best cyclic offset (closed) / direction (open)
  let Bv = B.verts.slice().reverse(), Bd = B.dirs.slice().reverse();
  const cost = (bv, o) => { let s = 0; for (let i = 0; i < n; i++) s += V.dist(P[A.verts[i]], P[bv[(i + o) % n]]); return s; };
  let off = 0;
  if (A.closed) { let best = Infinity; for (let o = 0; o < n; o++) { const s = cost(Bv, o); if (s < best) { best = s; off = o; } } off = (off + (twist | 0) % n + n) % n; }
  const bAt = (i) => Bv[(i + off) % n], bDir = (i) => Bd[(i + off) % n];
  const cA = V.avg(A.verts.map((v) => P[v])), cB = V.avg(Bv.map((v) => P[v]));
  const towards = V.sub(cB, cA);
  const segs = Math.max(1, segments | 0);
  const rows = [A.verts.slice()];
  for (let k = 1; k < segs; k++) {
    const s = k / segs;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    rows.push(A.verts.map((va, i) => {
      const vb = bAt(i);
      const L = V.dist(P[va], P[vb]);
      let ta = A.dirs[i], tb = bDir(i);
      if (V.dot(ta, towards) < 0) ta = V.mul(ta, -1);
      if (V.dot(tb, towards) > 0) tb = V.mul(tb, -1);
      const p = V.add(V.add(V.mul(P[va], h00), V.mul(ta, h10 * L)), V.add(V.mul(P[vb], h01), V.mul(V.mul(tb, -1), h11 * L)));
      P.push(p);
      return P.length - 1;
    }));
  }
  rows.push(A.verts.map((_, i) => bAt(i)));
  const remove = new Set([...A.remove, ...B.remove]);
  const F = c.f.filter((_, i) => !remove.has(i)).map((x) => x.slice());
  const m = A.closed ? n : n - 1;
  for (let k = 0; k < segs; k++) for (let i = 0; i < m; i++) {
    const j = (i + 1) % n;
    F.push([rows[k][j], rows[k][i], rows[k + 1][i], rows[k + 1][j]]);
  }
  return compact(orient({ ...c, v: P, f: F })).cage;
}

// ---------------------------------------------------------------- fill hole / erase and fill
function fillLoop(P, F, loop, mode) {
  const n = loop.length;
  const ring = loop.slice().reverse(); // the fill traverses the hole edges against the existing faces
  if (mode === "collapse") return { collapse: ring };
  if (mode === "ngon" || n <= 4) { F.push(ring); return {}; }
  const C = P.length;
  P.push(V.avg(ring.map((v) => P[v])));
  for (let i = 0; i + 1 < n; i += 2) {
    const a = ring[i], b = ring[(i + 1) % n], d = ring[(i + 2) % n];
    if (i + 2 > n) break;
    F.push([a, b, d, C]);
  }
  if (n % 2) F.push([ring[n - 1], ring[0], C]);
  return {};
}
/** Fill the hole whose boundary holds the edge a-b. mode: 'reduced' (quads around a star) | 'ngon' (fill star) | 'collapse'. */
export function fillHole(c, edge, mode = "reduced") {
  const loops = boundaryLoops(c);
  const loop = loops.find((l) => l.includes(edge.a) && l.includes(edge.b));
  if (!loop) throw new Error("Select a boundary edge of the hole");
  const P = c.v.map((p) => p.slice());
  const F = c.f.map((x) => x.slice());
  const r = fillLoop(P, F, loop, mode);
  if (r.collapse) return weld({ ...c, v: P, f: F }, r.collapse, { mode: "mid" });
  return compact({ ...c, v: P, f: F }).cage;
}
export function eraseAndFill(c, faceIdx, mode = "reduced") {
  if (!faceIdx.length) throw new Error("Select faces to erase and fill");
  assertNotFrozen(c, refVerts(c, faceIdx.map((f) => ({ kind: "tsFace", f }))));
  const before = new Set(boundaryLoops(c).flat());
  const del = compact({ ...c, f: c.f.filter((_, i) => !faceIdx.includes(i)) });
  let cur = del.cage;
  const loops = boundaryLoops(cur).filter((l) => l.some((v) => !before.has(del.vmap.indexOf(v))));
  if (!loops.length) throw new Error("Erasing these faces leaves no hole to fill");
  for (const l of loops) {
    const P = cur.v.map((p) => p.slice()), F = cur.f.map((x) => x.slice());
    const r = fillLoop(P, F, l, mode);
    cur = r.collapse ? weld({ ...cur, v: P, f: F }, r.collapse, { mode: "mid" }) : tidy({ ...cur, v: P, f: F });
  }
  return compact(cur).cage;
}

// ---------------------------------------------------------------- slide / bevel
/** Side neighbours of the vertices of an edge chain: {v: [leftNeighbour, rightNeighbour]}. */
function chainSides(c, ch) {
  const out = new Map();
  for (let i = 0; i < ch.length - 1; i++) {
    const p = ch[i], q = ch[i + 1];
    const L = findDirected(c.f, p, q), R = findDirected(c.f, q, p);
    for (const v of [p, q]) {
      const cur = out.get(v) || [null, null];
      if (L >= 0) { const fc = c.f[L], k = fc.indexOf(v); const nb = v === p ? fc[(k + fc.length - 1) % fc.length] : fc[(k + 1) % fc.length]; if (cur[0] === null) cur[0] = nb; }
      if (R >= 0) { const fc = c.f[R], k = fc.indexOf(v); const nb = v === p ? fc[(k + 1) % fc.length] : fc[(k + fc.length - 1) % fc.length]; if (cur[1] === null) cur[1] = nb; }
      out.set(v, cur);
    }
  }
  return out;
}
export function slideEdges(c, edgeRefs, s) {
  const T = topo(c);
  const eIdx = edgeRefs.map((r) => T.edge(r.a, r.b)).filter((e) => e >= 0);
  if (!eIdx.length) throw new Error("Select T-Spline edges");
  const P = c.v.map((p) => p.slice());
  const moved = new Set();
  for (const ch of chains(c, eIdx)) {
    const sides = chainSides(c, ch);
    for (const [v, [l, r]] of sides) {
      const nb = s >= 0 ? l : r;
      if (nb === null || moved.has(v)) continue;
      P[v] = V.lerp(c.v[v], c.v[nb], Math.min(0.95, Math.abs(s)));
      moved.add(v);
    }
  }
  assertNotFrozen(c, moved);
  return tidy({ ...cloneCage(c), v: P });
}
/** Bevel: two edge loops at `ratio` either side, the original edges dissolved, `segments` faces across. */
export function bevelEdges(c, edgeRefs, { ratio = 0.3, segments = 1 } = {}) {
  const T = topo(c);
  const eIdx = edgeRefs.map((r) => T.edge(r.a, r.b)).filter((e) => e >= 0);
  if (!eIdx.length) throw new Error("Select edges between non-parallel faces");
  if (eIdx.some((e) => T.eFaces[e].length !== 2)) throw new Error("Bevel works on edges between two faces");
  assertNotFrozen(c, refVerts(c, edgeRefs));
  const orig = new Set();
  for (const e of eIdx) for (const v of T.edges[e]) orig.add(v);
  const ins = insertEdges(c, edgeRefs, { side: "both", t: Math.min(0.45, Math.max(0.03, ratio)) });
  let cur = ins.cage;
  // dissolve the original edges (merge the two faces either side)
  cur = deleteElements(cur, edgeRefs.map((r) => ({ kind: "tsEdge", a: r.a, b: r.b })));
  // drop original chain vertices left in the middle of merged faces (degree 2)
  const t2 = topo(cur);
  const dropV = new Set();
  for (let v = 0; v < cur.v.length; v++) if (orig.has(v) && t2.vEdges[v] && t2.vEdges[v].length === 2) dropV.add(v);
  cur = compact({ ...cur, f: cur.f.map((fc) => fc.filter((v) => !dropV.has(v))) }).cage;
  segments = Math.max(1, Math.min(12, segments | 0));
  if (segments > 1) {
    // split the bevel strip into bands: strip quads hold only inserted points; their cross edges join two
    // points inserted from the same original chain vertex
    const pk = (p) => p.map((x) => x.toFixed(5)).join(",");
    const from = new Map();
    for (const [x, [u]] of ins.onEdge) from.set(pk(ins.cage.v[x]), u);
    const srcOf = cur.v.map((p) => from.get(pk(p)));
    const P = cur.v.map((p) => p.slice());
    const F = [];
    const cut = new Map();
    const pts = (a, b) => {
      const key = ek(a, b);
      if (!cut.has(key)) {
        const lo = Math.min(a, b), hi = Math.max(a, b), ids = [];
        for (let s = 1; s < segments; s++) { ids.push(P.length); P.push(V.lerp(P[lo], P[hi], s / segments)); }
        cut.set(key, ids);
      }
      const ids = cut.get(key);
      return a < b ? ids : ids.slice().reverse();
    };
    for (const fc of cur.f) {
      if (fc.length !== 4 || fc.some((v) => srcOf[v] === undefined)) { F.push(fc.slice()); continue; }
      // rotate so fc[0]-fc[1] is a cross edge (same source vertex)
      let q = fc;
      if (srcOf[q[0]] !== srcOf[q[1]]) q = [q[1], q[2], q[3], q[0]];
      if (srcOf[q[0]] !== srcOf[q[1]] || srcOf[q[2]] !== srcOf[q[3]]) { F.push(fc.slice()); continue; }
      const A = [q[0], ...pts(q[0], q[1]), q[1]], B = [q[3], ...pts(q[3], q[2]), q[2]];
      for (let s = 0; s < segments; s++) F.push([A[s], A[s + 1], B[s + 1], B[s]]);
    }
    for (const [key, ids] of cut) {
      const [lo, hi] = key.split(",").map(Number);
      let prev = lo;
      for (const x of ids) { insertInEdge(F, prev, hi, x); prev = x; }
    }
    cur = tidy({ ...cur, v: P, f: F });
  }
  return cur;
}

// ---------------------------------------------------------------- merge edge
/** Move chain A onto chain B (same edge count) and weld. Chains are vertex lists. */
export function mergeChains(c, chA, chB) {
  if (chA.length !== chB.length) throw new Error(`Edge Group One has ${chA.length - 1} edges and Edge Group Two has ${chB.length - 1}: select the same number of edges`);
  let B = chB.slice();
  const d1 = V.dist(c.v[chA[0]], c.v[B[0]]) + V.dist(c.v[chA[chA.length - 1]], c.v[B[B.length - 1]]);
  const d2 = V.dist(c.v[chA[0]], c.v[B[B.length - 1]]) + V.dist(c.v[chA[chA.length - 1]], c.v[B[0]]);
  if (d2 < d1) B = B.reverse();
  const map = new Map();
  chA.forEach((v, i) => { if (v !== B[i]) map.set(v, B[i]); });
  const m = (v) => (map.has(v) ? map.get(v) : v);
  const out = compact({ ...c, f: c.f.map((fc) => fc.map(m)), crease: (c.crease || []).map(([a, b]) => [m(a), m(b)]), cv: (c.cv || []).map(m), frozen: (c.frozen || []).map(m), iso: (c.iso || []).map(m) }).cage;
  return compact(orient(out)).cage;
}

// ---------------------------------------------------------------- thicken
export function thicken(c, { thickness = 2, type = "sharp", direction = "one" } = {}) {
  if (!c.f.length) throw new Error("The body has no faces");
  const P0 = c.v.map((p) => p.slice());
  const n = c.v.map((_, i) => vertexNormal(c, i));
  const outer = direction === "sym" ? thickness / 2 : 0;
  const inner = direction === "sym" ? -thickness / 2 : -thickness;
  const nv = P0.length;
  const P = P0.map((p, i) => V.add(p, V.mul(n[i], outer)));
  for (let i = 0; i < nv; i++) P.push(V.add(P0[i], V.mul(n[i], inner)));
  const F = c.f.map((fc) => fc.slice());
  for (const fc of c.f) F.push(fc.map((v) => v + nv).reverse());
  const crease = [...(c.crease || []), ...(c.crease || []).map(([a, b]) => [a + nv, b + nv])];
  if (type !== "noedge") {
    for (const loop of boundaryLoops(c)) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        // existing face traverses a -> b, the wall traverses b -> a on the outer sheet
        F.push([b, a, a + nv, b + nv]);
        if (type === "sharp") crease.push([a, b], [a + nv, b + nv]);
      }
    }
  }
  return tidy({ ...cloneCage(c), v: P, f: F, crease, cv: [...(c.cv || []), ...(c.cv || []).map((v) => v + nv)], frozen: [], iso: [] });
}

// ---------------------------------------------------------------- symmetric duplicates
export function mirrorDuplicate(c, plane, { weldCenter = true, tol = 0.01 } = {}) {
  const o = plane.o, nn = V.norm(plane.n);
  const nv = c.v.length;
  const m = (p) => V.sub(p, V.mul(nn, 2 * V.dot(V.sub(p, o), nn)));
  const P = c.v.map((p) => p.slice());
  const map = c.v.map((p, i) => {
    if (weldCenter && Math.abs(V.dot(V.sub(p, o), nn)) <= tol) { P[i] = V.sub(p, V.mul(nn, V.dot(V.sub(p, o), nn))); return i; }
    P.push(m(p));
    return P.length - 1;
  });
  void nv;
  const F = [...c.f.map((fc) => fc.slice()), ...c.f.map((fc) => fc.map((v) => map[v]).reverse())];
  const crease = [...(c.crease || []), ...(c.crease || []).map(([a, b]) => [map[a], map[b]])];
  const planes = [...((c.sym && c.sym.type === "mirror" && c.sym.planes) || []), { o: o.slice(), n: nn }];
  return compact({ ...c, v: P, f: F, crease, cv: [...(c.cv || []), ...(c.cv || []).map((v) => map[v])], sym: { type: "mirror", planes } }).cage;
}
export function circularDuplicate(c, axis, count, { weld: doWeld = true, tol = 0.01 } = {}) {
  count = Math.max(2, Math.min(64, count | 0));
  const k = V.norm(axis.d);
  const rotP = (p, ang) => { const cs = Math.cos(ang), sn = Math.sin(ang); const v = V.sub(p, axis.o); const r = V.add(V.add(V.mul(v, cs), V.mul(V.cross(k, v), sn)), V.mul(k, V.dot(k, v) * (1 - cs))); return V.add(axis.o, r); };
  const P = [], F = [], crease = [];
  for (let j = 0; j < count; j++) {
    const base = P.length;
    for (const p of c.v) P.push(rotP(p, (2 * Math.PI * j) / count));
    for (const fc of c.f) F.push(fc.map((v) => v + base));
    for (const [a, b] of c.crease || []) crease.push([a + base, b + base]);
  }
  let out = tidy({ ...c, v: P, f: F, crease, cv: [], frozen: [], iso: [], sym: { type: "circular", o: axis.o.slice(), d: k, count } });
  if (doWeld) {
    // weld coincident vertices (seams, on-axis points)
    const cell = Math.max(tol, 1e-6) * 2;
    const grid = new Map();
    const map = P.map((_, i) => i);
    P.forEach((p, i) => {
      const key = p.map((x) => Math.round(x / cell)).join(",");
      const hit = (grid.get(key) || []).find((j) => V.dist(P[j], p) <= tol);
      if (hit !== undefined) map[i] = hit; else { if (!grid.has(key)) grid.set(key, []); grid.get(key).push(i); }
    });
    out = compact({ ...out, f: out.f.map((fc) => fc.map((v) => map[v])), crease: out.crease.map(([a, b]) => [map[a], map[b]]) }).cage;
  }
  return out;
}

// ---------------------------------------------------------------- repair
export function analyze(c) {
  const T = topo(c);
  let ngons = 0, stars = 0, free = 0;
  c.f.forEach((fc) => { if (fc.length !== 4) ngons++; });
  for (let v = 0; v < c.v.length; v++) {
    const es = T.vEdges[v];
    if (!es.length) continue;
    const bd = es.some((e) => T.eFaces[e].length !== 2);
    if (!bd && es.length !== 4) stars++;
  }
  T.eFaces.forEach((fs) => { if (fs.length === 1) free++; });
  const nonManifold = T.eFaces.filter((fs) => fs.length > 2).length;
  return { vertices: c.v.length, faces: c.f.length, edges: T.edges.length, ngons, stars, free, nonManifold, tpoints: 0, closed: isClosed(c) };
}
export function repair(c, { tol } = {}) {
  const size = bbox(c).size || 1;
  const eps = tol ?? size * 1e-6;
  // weld coincident vertices
  const map = c.v.map((_, i) => i);
  for (let i = 0; i < c.v.length; i++) for (let j = 0; j < i; j++) if (map[j] === j && V.dist(c.v[i], c.v[j]) <= eps) { map[i] = j; break; }
  let out = compact({ ...c, f: c.f.map((fc) => fc.map((v) => map[v])), crease: (c.crease || []).map(([a, b]) => [map[a], map[b]]) }).cage;
  // drop faces on non-manifold edges beyond the second
  const T = topo(out);
  const drop = new Set();
  T.eFaces.forEach((fs) => { if (fs.length > 2) for (const f of fs.slice(2)) drop.add(f); });
  if (drop.size) out = compact({ ...out, f: out.f.filter((_, i) => !drop.has(i)) }).cage;
  return compact(orient(out)).cage;
}

// ---------------------------------------------------------------- shape operations
const movable = (c, verts) => { const fz = frozenSet(c); return [...verts].filter((v) => !fz.has(v)); };
export function smooth(c, verts, rate = 0.5, iters = 3) {
  const T = topo(c);
  let P = c.v.map((p) => p.slice());
  const vs = movable(c, verts);
  for (let it = 0; it < iters; it++) {
    const Q = P.map((p) => p.slice());
    for (const v of vs) {
      const nb = T.vEdges[v].map((e) => P[otherEnd(T, e, v)]);
      if (!nb.length) continue;
      const bd = T.vEdges[v].some((e) => T.eFaces[e].length !== 2);
      if (bd) continue;
      Q[v] = V.lerp(P[v], V.avg(nb), rate);
    }
    P = Q;
  }
  return tidy({ ...cloneCage(c), v: P });
}
/** Best-fit plane of points (PCA): {o, n}. */
export function fitPlane(pts) {
  const o = V.avg(pts);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) { const d = V.sub(p, o); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  return { o, n: eigenMin(C), dir: eigenMax(C) };
}
function eigenMax(C) {
  let v = [1, 0.7, 0.3];
  for (let i = 0; i < 60; i++) { v = V.norm([C[0][0] * v[0] + C[0][1] * v[1] + C[0][2] * v[2], C[1][0] * v[0] + C[1][1] * v[1] + C[1][2] * v[2], C[2][0] * v[0] + C[2][1] * v[1] + C[2][2] * v[2]]); }
  return v;
}
function eigenMin(C) {
  const tr = C[0][0] + C[1][1] + C[2][2] + 1e-9;
  const D = C.map((row, i) => row.map((x, j) => (i === j ? tr - x : -x)));
  return eigenMax(D);
}
export function flatten(c, verts, plane = null) {
  const vs = movable(c, verts);
  if (vs.length < 3 && !plane) throw new Error("Select at least three vertices to flatten");
  const pl = plane || fitPlane(vs.map((v) => c.v[v]));
  const n = V.norm(pl.n);
  const P = c.v.map((p) => p.slice());
  for (const v of vs) P[v] = V.sub(P[v], V.mul(n, V.dot(V.sub(P[v], pl.o), n)));
  return tidy({ ...cloneCage(c), v: P });
}
export function straighten(c, verts, line = null) {
  const vs = movable(c, verts);
  if (vs.length < 2) throw new Error("Select vertices to straighten");
  let o, d;
  if (line) { o = line.o; d = V.norm(line.d); }
  else { const pl = fitPlane(vs.map((v) => c.v[v])); o = pl.o; d = pl.dir; }
  const P = c.v.map((p) => p.slice());
  for (const v of vs) P[v] = V.add(o, V.mul(d, V.dot(V.sub(P[v], o), d)));
  return tidy({ ...cloneCage(c), v: P });
}
export function cylindrify(c, faceIdx) {
  const verts = refVerts(c, faceIdx.map((f) => ({ kind: "tsFace", f })));
  const vs = movable(c, verts);
  if (vs.length < 4) throw new Error("Select faces to cylindrify");
  // axis: the direction the face normals avoid (smallest normal covariance)
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const f of faceIdx) { const n = faceNormal(c, f); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += n[i] * n[j]; }
  const ax = eigenMin(C);
  const pts = vs.map((v) => c.v[v]);
  // circle fit (Kasa) in the plane normal to the axis
  const u = V.norm(V.cross(ax, Math.abs(ax[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), w = V.cross(ax, u);
  const o0 = V.avg(pts);
  let Sxx = 0, Sxy = 0, Syy = 0, Sx = 0, Sy = 0, Sz = 0, Sxz = 0, Syz = 0;
  const q = pts.map((p) => { const d = V.sub(p, o0); return [V.dot(d, u), V.dot(d, w)]; });
  for (const [x, y] of q) { const z = x * x + y * y; Sxx += x * x; Sxy += x * y; Syy += y * y; Sx += x; Sy += y; Sz += z; Sxz += x * z; Syz += y * z; }
  const n = q.length;
  const M = [[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, n]], b = [Sxz, Syz, Sz];
  const sol = solve3(M, b);
  const cx = sol ? sol[0] / 2 : 0, cy = sol ? sol[1] / 2 : 0;
  const ctr = V.add(o0, V.add(V.mul(u, cx), V.mul(w, cy)));
  const R = q.reduce((s, [x, y]) => s + Math.hypot(x - cx, y - cy), 0) / n;
  const P = c.v.map((p) => p.slice());
  for (const v of vs) {
    const d = V.sub(P[v], ctr);
    const along = V.dot(d, ax);
    const radial = V.sub(d, V.mul(ax, along));
    const l = V.len(radial) || 1;
    P[v] = V.add(V.add(ctr, V.mul(ax, along)), V.mul(radial, R / l));
  }
  return tidy({ ...cloneCage(c), v: P });
}
function solve3(M, b) {
  const A = M.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    if (Math.abs(A[p][i]) < 1e-12) return null;
    [A[i], A[p]] = [A[p], A[i]];
    for (let r = 0; r < 3; r++) { if (r === i) continue; const f = A[r][i] / A[i][i]; for (let k = i; k < 4; k++) A[r][k] -= f * A[i][k]; }
  }
  return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
}
/** Interpolate: 'surface' = the surface passes through the current control points; 'control' = control points move onto the surface. */
export function interpolate(c, verts, mode = "surface") {
  const vs = movable(c, verts);
  if (!vs.length) throw new Error("Select vertices or a T-Spline body");
  if (mode === "control") {
    const L = limitOfCage(c);
    const P = c.v.map((p) => p.slice());
    for (const v of vs) P[v] = L[v];
    return tidy({ ...cloneCage(c), v: P });
  }
  const targets = c.v.map((p, i) => (vs.includes(i) ? p.slice() : null));
  return fitToTargets(c, targets, 12, vs);
}
/** Make Uniform: tangential relaxation of interior vertices (keeps the shape, evens the spacing). */
export function makeUniform(c, iters = 6) {
  const T = topo(c);
  let P = c.v.map((p) => p.slice());
  const fz = frozenSet(c);
  const sharp = new Set((c.crease || []).map(([a, b]) => ek(a, b)));
  const cv = new Set(c.cv || []);
  for (let it = 0; it < iters; it++) {
    const Q = P.map((p) => p.slice());
    for (let v = 0; v < P.length; v++) {
      if (fz.has(v) || cv.has(v)) continue;
      const es = T.vEdges[v];
      if (!es.length || es.some((e) => T.eFaces[e].length !== 2 || sharp.has(ek(...T.edges[e])))) continue;
      const nb = es.map((e) => P[otherEnd(T, e, v)]);
      const m = V.avg(nb);
      const n = vertexNormal(c, v, P);
      const d = V.sub(m, P[v]);
      Q[v] = V.add(P[v], V.mul(V.sub(d, V.mul(n, V.dot(d, n))), 0.5));
    }
    P = Q;
  }
  return tidy({ ...cloneCage(c), v: P });
}
/** Pull vertices onto a target: closest(p) -> nearest point. mode 'control' | 'surface'. */
export function pull(c, verts, closest, mode = "control") {
  const vs = movable(c, verts);
  if (!vs.length) throw new Error("Select vertices to pull");
  if (mode === "control") {
    const P = c.v.map((p) => p.slice());
    for (const v of vs) { const q = closest(P[v]); if (q) P[v] = q; }
    return tidy({ ...cloneCage(c), v: P });
  }
  const L = limitOfCage(c);
  const targets = c.v.map((_, i) => (vs.includes(i) ? closest(L[i]) : null));
  return fitToTargets(c, targets, 10, vs);
}
/** Generic "move vertices to positions" helper with symmetry left to the caller. */
export function moveVerts(c, pos) {
  const P = c.v.map((p) => p.slice());
  assertNotFrozen(c, pos.keys());
  for (const [v, p] of pos) P[v] = p.slice();
  return tidy({ ...cloneCage(c), v: P });
}
