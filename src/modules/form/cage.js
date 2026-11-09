// T-spline control cage: data format, topology queries, selection helpers and symmetry.
//
// Stored in the Form feature (doc JSON):
//   { id: bodyId, v: [[x,y,z]], f: [[vertex indices, CCW seen from outside]], crease: [[a,b]] (a < b),
//     cv: [creased vertices], frozen: [vertex indices], iso: [vertices isolated from symmetry],
//     sym: null | {type:'mirror', planes:[{o, n}]} | {type:'circular', o, d, count}, converted?: true }
// Refs used for selection: {kind:'tsVertex', body, v} {kind:'tsEdge', body, a, b} (a < b) {kind:'tsFace', body, f}.

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  avg: (pts) => { const s = [0, 0, 0]; for (const p of pts) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } const k = 1 / Math.max(1, pts.length); return [s[0] * k, s[1] * k, s[2] * k]; },
};
const r6 = (x) => Math.round(x * 1e6) / 1e6;
export const roundP = (p) => [r6(p[0]), r6(p[1]), r6(p[2])];

export const vRef = (body, v) => ({ kind: "tsVertex", body, v });
export const eRef = (body, a, b) => ({ kind: "tsEdge", body, a: Math.min(a, b), b: Math.max(a, b) });
export const fRef = (body, f) => ({ kind: "tsFace", body, f });
export const TS_KINDS = ["tsVertex", "tsEdge", "tsFace"];
export const isTsRef = (r) => !!r && TS_KINDS.includes(r.kind);
export const ek = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);

export function emptyCage(id) { return { id, v: [], f: [], crease: [], cv: [], frozen: [], iso: [], sym: null }; }
export function cloneCage(c) {
  return {
    ...c, v: c.v.map((p) => p.slice()), f: c.f.map((x) => x.slice()), crease: (c.crease || []).map((e) => e.slice()),
    cv: (c.cv || []).slice(), frozen: (c.frozen || []).slice(), iso: (c.iso || []).slice(), sym: c.sym ? JSON.parse(JSON.stringify(c.sym)) : null,
  };
}
/** Round positions, sort crease pairs, drop duplicates (doc-friendly). */
export function tidy(c) {
  c.v = c.v.map(roundP);
  const seen = new Set();
  c.crease = (c.crease || []).map(([a, b]) => (a < b ? [a, b] : [b, a])).filter(([a, b]) => { const k = `${a},${b}`; if (seen.has(k) || a === b) return false; seen.add(k); return true; });
  c.cv = [...new Set(c.cv || [])].sort((a, b) => a - b);
  c.frozen = [...new Set(c.frozen || [])].sort((a, b) => a - b);
  c.iso = [...new Set(c.iso || [])].sort((a, b) => a - b);
  if (c.sym === undefined) c.sym = null;
  return c;
}

// ---------------------------------------------------------------- topology
const TOPO = new WeakMap();
/** Edges and adjacency of a cage (cached per cage object; never mutate a cage after calling this). */
export function topo(c) {
  let t = TOPO.get(c);
  if (t) return t;
  const emap = new Map(), edges = [], eFaces = [], fEdges = [];
  const vEdges = c.v.map(() => []), vFaces = c.v.map(() => []);
  c.f.forEach((fc, fi) => {
    const fe = [];
    for (let i = 0; i < fc.length; i++) {
      const a = fc[i], b = fc[(i + 1) % fc.length];
      const k = ek(a, b);
      let e = emap.get(k);
      if (e === undefined) {
        e = edges.length; emap.set(k, e); edges.push(a < b ? [a, b] : [b, a]); eFaces.push([]);
        vEdges[a].push(e); vEdges[b].push(e);
      }
      eFaces[e].push(fi);
      fe.push(e);
      vFaces[a].push(fi);
    }
    fEdges.push(fe);
  });
  const crease = new Set((c.crease || []).map(([a, b]) => ek(a, b)));
  t = { emap, edges, eFaces, fEdges, vEdges, vFaces, crease, edge: (a, b) => emap.get(ek(a, b)) ?? -1, boundary: (e) => eFaces[e].length === 1 };
  TOPO.set(c, t);
  return t;
}
export const otherEnd = (t, e, v) => (t.edges[e][0] === v ? t.edges[e][1] : t.edges[e][0]);
/** Face where the directed edge a->b appears, or -1. */
export function faceWithDirected(c, a, b) {
  const t = topo(c);
  const e = t.edge(a, b);
  if (e < 0) return -1;
  for (const f of t.eFaces[e]) { const fc = c.f[f]; const i = fc.indexOf(a); if (fc[(i + 1) % fc.length] === b) return f; }
  return -1;
}

export function faceCentroid(c, f) { return V.avg(c.f[f].map((i) => c.v[i])); }
export function faceNormal(c, f, P = c.v) {
  const fc = c.f[f];
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < fc.length; i++) {
    const a = P[fc[i]], b = P[fc[(i + 1) % fc.length]];
    x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return V.norm([x, y, z]);
}
export function vertexNormal(c, v, P = c.v) {
  const t = topo(c);
  let n = [0, 0, 0];
  for (const f of t.vFaces[v]) n = V.add(n, faceNormal(c, f, P));
  return V.norm(n);
}
export function bbox(c) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of c.v) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  return { min: lo, max: hi, size: c.v.length ? V.dist(lo, hi) : 0 };
}

/** Vertex indices touched by refs (faces / edges / vertices of one body). */
export function refVerts(c, refs) {
  const s = new Set();
  for (const r of refs) {
    if (r.kind === "tsVertex") s.add(r.v);
    else if (r.kind === "tsEdge") { s.add(r.a); s.add(r.b); }
    else if (r.kind === "tsFace" && c.f[r.f]) for (const v of c.f[r.f]) s.add(v);
    else if (r.kind === "body") c.v.forEach((_, i) => s.add(i));
  }
  return s;
}

/**
 * Remove unused vertices and degenerate faces (repeated consecutive vertices collapse; faces with < 3
 * vertices go). Crease / frozen / iso lists are remapped. Returns {cage, vmap (old -> new or -1)}.
 */
export function compact(c) {
  const faces = [];
  for (const fc of c.f) {
    const out = [];
    for (const v of fc) if (out[out.length - 1] !== v) out.push(v);
    while (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
    if (out.length >= 3 && new Set(out).size === out.length) faces.push(out);
  }
  // duplicate faces (same vertex set) go
  const fk = new Set();
  const f2 = faces.filter((fc) => { const k = [...fc].sort((a, b) => a - b).join(","); if (fk.has(k)) return false; fk.add(k); return true; });
  const used = new Int32Array(c.v.length).fill(-1);
  const v2 = [];
  for (const fc of f2) for (const v of fc) if (used[v] < 0) { used[v] = v2.length; v2.push(c.v[v]); }
  const map = (v) => (v >= 0 && v < used.length ? used[v] : -1);
  const out = {
    ...c, v: v2.map((p) => p.slice()), f: f2.map((fc) => fc.map(map)),
    crease: (c.crease || []).map(([a, b]) => [map(a), map(b)]).filter(([a, b]) => a >= 0 && b >= 0 && a !== b),
    cv: (c.cv || []).map(map).filter((v) => v >= 0), frozen: (c.frozen || []).map(map).filter((v) => v >= 0), iso: (c.iso || []).map(map).filter((v) => v >= 0),
    sym: c.sym ? JSON.parse(JSON.stringify(c.sym)) : null,
  };
  // creases must still be edges
  const t = topo(out);
  out.crease = out.crease.filter(([a, b]) => t.edge(a, b) >= 0);
  return { cage: tidy(out), vmap: used };
}

/** Make face orientation consistent (BFS flipping) and outward for closed cages. */
export function orient(c) {
  const t = topo(c);
  const done = new Int8Array(c.f.length);
  const f = c.f.map((x) => x.slice());
  for (let s = 0; s < f.length; s++) {
    if (done[s]) continue;
    done[s] = 1;
    const q = [s];
    while (q.length) {
      const g = q.pop();
      const fc = f[g];
      for (let i = 0; i < fc.length; i++) {
        const a = fc[i], b = fc[(i + 1) % fc.length];
        const e = t.edge(a, b);
        for (const h of t.eFaces[e]) {
          if (h === g || done[h]) continue;
          const hc = f[h];
          const j = hc.indexOf(a);
          // a neighbour must traverse the shared edge b -> a
          if (hc[(j + 1) % hc.length] === b) hc.reverse();
          done[h] = 1;
          q.push(h);
        }
      }
    }
  }
  const out = { ...c, f };
  // outward: signed volume of a closed cage must be positive
  const vol = signedVolume(out);
  if (vol < 0 && isClosed(out)) out.f = out.f.map((x) => x.slice().reverse());
  return out;
}
export function signedVolume(c) {
  let s = 0;
  for (const fc of c.f) {
    const p0 = c.v[fc[0]];
    for (let i = 1; i < fc.length - 1; i++) s += V.dot(p0, V.cross(c.v[fc[i]], c.v[fc[i + 1]]));
  }
  return s / 6;
}
export function isClosed(c) { const t = topo(c); return c.f.length > 0 && t.eFaces.every((fs) => fs.length === 2); }

/** Boundary loops: arrays of vertices, ordered like the adjacent faces traverse them (a -> b in the face). */
export function boundaryLoops(c) {
  const t = topo(c);
  const next = new Map();
  t.edges.forEach(([a, b], e) => {
    if (t.eFaces[e].length !== 1) return;
    const f = t.eFaces[e][0], fc = c.f[f], i = fc.indexOf(a);
    if (fc[(i + 1) % fc.length] === b) next.set(a, b); else next.set(b, a);
  });
  const loops = [], seen = new Set();
  for (const s of next.keys()) {
    if (seen.has(s)) continue;
    const loop = [];
    let v = s, guard = 0;
    while (v !== undefined && !seen.has(v) && guard++ < 1e6) { seen.add(v); loop.push(v); v = next.get(v); }
    if (loop.length >= 2) loops.push(loop);
  }
  return loops;
}

// ---------------------------------------------------------------- loops / rings (quad topology)
/** The edge continuing `e` straight through vertex v (valence-4 interior or valence-3 boundary rule), or -1. */
export function straightNext(c, e, v) {
  const t = topo(c);
  const es = t.vEdges[v];
  const fe = new Set(t.eFaces[e]);
  if (t.boundary(e)) {
    const b = es.filter((x) => x !== e && t.boundary(x));
    return b.length === 1 && es.length <= 3 ? b[0] : -1;
  }
  if (es.length !== 4) return -1;
  // the edge sharing no face with e
  for (const x of es) {
    if (x === e) continue;
    if (!t.eFaces[x].some((f) => fe.has(f))) return x;
  }
  return -1;
}
/** Edge loop through e: [edge indices] (stops at extraordinary vertices). */
export function edgeLoop(c, e) {
  const t = topo(c);
  const out = [e];
  const seen = new Set([e]);
  for (const dir of [0, 1]) {
    let cur = e, v = t.edges[e][dir];
    for (let guard = 0; guard < 10000; guard++) {
      const n = straightNext(c, cur, v);
      if (n < 0 || seen.has(n)) break;
      seen.add(n);
      if (dir === 0) out.unshift(n); else out.push(n);
      v = otherEnd(t, n, v);
      cur = n;
    }
  }
  return out;
}
/** Edge ring through e (opposite edges of quads). */
export function edgeRing(c, e) {
  const t = topo(c);
  const out = [e], seen = new Set([e]);
  const walk = (start) => {
    let cur = start;
    const q = [];
    for (let guard = 0; guard < 10000; guard++) {
      let moved = false;
      for (const f of t.eFaces[cur]) {
        if (c.f[f].length !== 4) continue;
        const fe = t.fEdges[f];
        const i = fe.indexOf(cur);
        const opp = fe[(i + 2) % 4];
        if (!seen.has(opp)) { seen.add(opp); q.push(opp); cur = opp; moved = true; break; }
      }
      if (!moved) break;
    }
    return q;
  };
  out.push(...walk(e));
  out.unshift(...walk(e).reverse());
  return out;
}
/** Face loop through face f, crossing edge e of f (quads). */
export function faceLoop(c, f, e) {
  const t = topo(c);
  const out = [f], seen = new Set([f]);
  for (const start of [e, t.fEdges[f][(t.fEdges[f].indexOf(e) + 2) % 4]]) {
    let cur = f, edge = start;
    for (let guard = 0; guard < 10000; guard++) {
      const nf = t.eFaces[edge].find((x) => x !== cur);
      if (nf === undefined || seen.has(nf) || c.f[nf].length !== 4) break;
      seen.add(nf);
      out.push(nf);
      const fe = t.fEdges[nf];
      edge = fe[(fe.indexOf(edge) + 2) % 4];
      cur = nf;
    }
  }
  return out;
}
/** Order edges (indices) into chains of consecutive vertices: [[v0, v1, ...]], closed chains repeat v0 at the end. */
export function chains(c, edgeIdx) {
  const t = topo(c);
  const left = new Set(edgeIdx);
  const at = new Map();
  for (const e of left) for (const v of t.edges[e]) { if (!at.has(v)) at.set(v, []); at.get(v).push(e); }
  const out = [];
  const take = (startV, startE) => {
    const ch = [startV];
    let v = startV, e = startE;
    while (e !== undefined) {
      left.delete(e);
      v = otherEnd(t, e, v);
      ch.push(v);
      e = (at.get(v) || []).find((x) => left.has(x));
    }
    return ch;
  };
  // open chains first (start at an end)
  for (const [v, es] of at) if (es.length === 1 && left.has(es[0])) out.push(take(v, es[0]));
  while (left.size) { const e = left.values().next().value; out.push(take(t.edges[e][0], e)); }
  return out;
}

// ---------------------------------------------------------------- selection growth
export function growRefs(c, refs) {
  const t = topo(c);
  const body = refs[0] && refs[0].body;
  const out = new Map(refs.map((r) => [JSON.stringify(r), r]));
  const add = (r) => out.set(JSON.stringify(r), r);
  for (const r of refs) {
    if (r.kind === "tsFace") for (const v of c.f[r.f] || []) for (const f of t.vFaces[v]) add(fRef(body, f));
    else if (r.kind === "tsVertex") for (const e of t.vEdges[r.v] || []) add(vRef(body, otherEnd(t, e, r.v)));
    else if (r.kind === "tsEdge") for (const v of [r.a, r.b]) for (const e of t.vEdges[v] || []) { const [a, b] = t.edges[e]; add(eRef(body, a, b)); }
  }
  return [...out.values()];
}
export function shrinkRefs(c, refs) {
  const t = topo(c);
  const key = (r) => JSON.stringify(r);
  const have = new Set(refs.map(key));
  const body = refs[0] && refs[0].body;
  return refs.filter((r) => {
    if (r.kind === "tsFace") return c.f[r.f].every((v) => t.vFaces[v].every((f) => have.has(key(fRef(body, f)))));
    if (r.kind === "tsVertex") return t.vEdges[r.v].every((e) => have.has(key(vRef(body, otherEnd(t, e, r.v)))));
    if (r.kind === "tsEdge") return [r.a, r.b].every((v) => t.vEdges[v].every((e) => { const [a, b] = t.edges[e]; return have.has(key(eRef(body, a, b))); }));
    return true;
  });
}

// ---------------------------------------------------------------- symmetry
function mirrorFn(o, n) {
  const nn = V.norm(n);
  return { kind: "mirror", p: (p) => { const d = V.dot(V.sub(p, o), nn); return V.sub(p, V.mul(nn, 2 * d)); }, v: (d) => V.sub(d, V.mul(nn, 2 * V.dot(d, nn))) };
}
function rotFn(o, ax, ang) {
  const k = V.norm(ax), cs = Math.cos(ang), sn = Math.sin(ang);
  const rv = (v) => V.add(V.add(V.mul(v, cs), V.mul(V.cross(k, v), sn)), V.mul(k, V.dot(k, v) * (1 - cs)));
  return { kind: "rot", p: (p) => V.add(o, rv(V.sub(p, o))), v: rv };
}
/** Non-identity symmetry transforms of a cage's sym spec: [{p(point), v(vector)}]. */
export function symTransforms(sym) {
  if (!sym) return [];
  if (sym.type === "mirror") {
    const gens = (sym.planes || []).map((pl) => mirrorFn(pl.o, pl.n));
    // group closure of up to three mirrors (compositions)
    const out = [];
    const n = gens.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const chosen = gens.filter((_, i) => mask & (1 << i));
      out.push({ p: (p) => chosen.reduce((q, g) => g.p(q), p), v: (d) => chosen.reduce((q, g) => g.v(q), d), parity: chosen.length % 2 });
    }
    return out;
  }
  if (sym.type === "circular") {
    const out = [];
    for (let k = 1; k < (sym.count || 2); k++) out.push({ ...rotFn(sym.o, sym.d, (2 * Math.PI * k) / sym.count), parity: 0 });
    return out;
  }
  return [];
}
/**
 * Partner tables: partners[g][v] = vertex at transform g of v (or -1). Tolerance relative to the cage size.
 */
export function symPartners(c, tol) {
  const T = symTransforms(c.sym);
  if (!T.length) return { T, partners: [] };
  const size = bbox(c).size || 1;
  const eps = tol || size * 1e-4 + 1e-6;
  const cell = eps * 4;
  const grid = new Map();
  const key = (p) => `${Math.round(p[0] / cell)},${Math.round(p[1] / cell)},${Math.round(p[2] / cell)}`;
  c.v.forEach((p, i) => { const k = key(p); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  const near = (q) => {
    const bx = Math.round(q[0] / cell), by = Math.round(q[1] / cell), bz = Math.round(q[2] / cell);
    let best = -1, bd = eps;
    for (let x = bx - 1; x <= bx + 1; x++) for (let y = by - 1; y <= by + 1; y++) for (let z = bz - 1; z <= bz + 1; z++) {
      for (const i of grid.get(`${x},${y},${z}`) || []) { const d = V.dist(c.v[i], q); if (d <= bd) { bd = d; best = i; } }
    }
    return best;
  };
  const iso = new Set(c.iso || []);
  const partners = T.map((g) => c.v.map((p, i) => (iso.has(i) ? -1 : near(g.p(p)))));
  return { T, partners };
}
/**
 * Re-impose symmetry after the vertices in `moved` changed (P = new positions, base = cage before the edit
 * used for the partner tables). Partners of moved vertices follow; vertices on a mirror plane / the axis
 * are projected back onto it. Returns the new positions array.
 */
export function symmetrize(base, P, moved) {
  const { T, partners } = symPartners(base);
  if (!T.length) return P;
  const out = P.map((p) => p.slice());
  const order = [...moved].sort((a, b) => a - b);
  const driven = new Set();
  const iso = new Set(base.iso || []);
  for (const v of order) {
    if (driven.has(v)) continue;
    T.forEach((g, gi) => {
      const w = partners[gi][v];
      if (w < 0 || iso.has(w) || iso.has(v)) return;
      if (w === v) { out[v] = V.mul(V.add(out[v], g.p(out[v])), 0.5); return; }
      out[w] = g.p(out[v]);
      driven.add(w);
    });
  }
  // fixed points of rotations: project onto the axis (average of all images)
  if (base.sym && base.sym.type === "circular") {
    for (const v of order) {
      if (!partners.every((tab) => tab[v] === v)) continue;
      const imgs = [out[v], ...T.map((g) => g.p(out[v]))];
      out[v] = V.avg(imgs);
    }
  }
  return out;
}
/** Refs plus their symmetric partners (same body). */
export function withSymmetry(c, refs) {
  const { T, partners } = symPartners(c);
  if (!T.length) return refs;
  const t = topo(c);
  const out = new Map(refs.map((r) => [JSON.stringify(r), r]));
  const add = (r) => { if (r) out.set(JSON.stringify(r), r); };
  for (const r of refs) {
    partners.forEach((tab) => {
      if (r.kind === "tsVertex") { const w = tab[r.v]; if (w >= 0) add(vRef(r.body, w)); }
      else if (r.kind === "tsEdge") { const a = tab[r.a], b = tab[r.b]; if (a >= 0 && b >= 0 && t.edge(a, b) >= 0) add(eRef(r.body, a, b)); }
      else if (r.kind === "tsFace") {
        const vs = c.f[r.f].map((v) => tab[v]);
        if (vs.some((v) => v < 0)) return;
        const key = [...vs].sort((a, b) => a - b).join(",");
        const f = c.f.findIndex((fc) => fc.length === vs.length && [...fc].sort((a, b) => a - b).join(",") === key);
        if (f >= 0) add(fRef(r.body, f));
      }
    });
  }
  return [...out.values()];
}
/** Edges lying on a symmetry plane / axis (drawn green, like Fusion's symmetry lines). */
export function symmetryEdges(c) {
  const { partners } = symPartners(c);
  if (!partners.length) return [];
  const t = topo(c);
  return t.edges.filter(([a, b]) => partners.some((tab) => tab[a] === a && tab[b] === b));
}

/** Vertices that may not move (frozen). */
export const frozenSet = (c) => new Set(c.frozen || []);
export function assertNotFrozen(c, verts) {
  const fz = frozenSet(c);
  for (const v of verts) if (fz.has(v)) throw new Error("This operation affects one or more frozen regions.");
}
