// Geometry behind the PMI annotations: stored references (face / edge / vertex with the model's
// geometric signatures), re-finding them on the current geometry, annotation-plane candidates
// (Fusion's LeaderLineNotePlaneTypes), hole / boss recognition (hole features, counterbores,
// countersinks, drill points, through holes), thread lookup and dimension measurement.
import * as K from "../../kernel.js";
import * as M from "../../model.js";

export const V = K.V;
const EPS = 1e-6;
const neg = (a) => [-a[0], -a[1], -a[2]];
const dist = (a, b) => V.len(V.sub(a, b));
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------- stored references
/**
 * Selection ref (picked on `state`) -> document ref {kind, body, p, n?, sig?} (+ vertex: the
 * adjacent edge and which end, so the vertex follows the edge).
 */
export function storeRef(state, r) {
  if (!r || !r.body) return null;
  const b = state && state.bodies.get(r.body);
  const out = { kind: r.kind, body: r.body, p: K.roundVec(r.p) };
  if (!b) return out;
  try {
    const T = K.topoOf(b.shape);
    if (r.kind === "face") {
      let idx = r.index;
      if (!(idx >= 0)) { const nf = K.nearestFaceIndex(b.shape, r.p, r.n); idx = nf ? nf.index : -1; }
      if (idx >= 0) { const sig = K.faceSignature(b.shape, idx); if (sig) out.sig = sig; const fi = T.faces[idx]; out.n = K.roundVec(fi && fi.type === "PLANE" ? fi.n : r.n || [0, 0, 1]); }
    } else if (r.kind === "edge") {
      let idx = r.index;
      if (!(idx >= 0)) { const ne = K.nearestEdgeIndex(b.shape, r.p); idx = ne ? ne.index : -1; }
      if (idx >= 0) { const sig = K.edgeSignature(b.shape, idx); if (sig) out.sig = sig; }
    } else if (r.kind === "vertex") {
      let best = null;
      T.edges.forEach((e, i) => {
        for (const end of ["s", "t"]) {
          const d = dist(e[end], r.p);
          if (d < 1e-4 && (!best || d < best.d)) best = { i, end, d };
        }
      });
      if (best) {
        const e = T.edges[best.i];
        out.edge = { body: r.body, p: K.roundVec(e.m), sig: K.edgeSignature(b.shape, best.i) };
        out.end = best.end;
      }
    }
  } catch (e) { console.warn("[annotate] storeRef", e); }
  return out;
}

const resolveCache = new WeakMap(); // shape -> Map(refJson -> resolved)

/**
 * Re-find a stored ref on `state`: {kind, body, index, info (topoOf entry), point (anchor on the
 * entity), selRef (viewport selection ref)} or null when the geometry is lost.
 */
export function resolveRef(state, ref) {
  if (!ref || !state) return null;
  const b = state.bodies.get(ref.body);
  if (!b || !b.shape) return null;
  const key = JSON.stringify(ref);
  let m = resolveCache.get(b.shape);
  if (!m) { m = new Map(); resolveCache.set(b.shape, m); }
  if (m.has(key)) return m.get(key);
  let res = null;
  try { res = resolveNow(b.shape, ref); } catch (e) { console.warn("[annotate] resolve", e); res = null; }
  if (m.size > 400) m.clear();
  m.set(key, res);
  return res;
}

function resolveNow(shape, ref0) {
  const T = K.topoOf(shape);
  const ref = clone(ref0);
  if (ref.kind === "face") {
    const idx = M.locateFace(shape, ref);
    if (idx < 0) return null;
    const fi = T.faces[idx];
    if (ref0.sig && fi.type !== ref0.sig.t) return null;
    const p = ref.p || fi.c;
    const n = faceNormalAt(fi, p, ref.n);
    return { kind: "face", body: ref.body, index: idx, info: fi, point: p, normal: n, selRef: { kind: "face", body: ref.body, index: idx, p, n, planar: fi.type === "PLANE" } };
  }
  if (ref.kind === "edge") {
    const idx = M.locateEdge(shape, ref);
    if (idx < 0) return null;
    const ei = T.edges[idx];
    if (ref0.sig && ei.type !== ref0.sig.t) return null;
    const p = closestOnEdge(ei, ref0.p) || ref.p || ei.m;
    return { kind: "edge", body: ref.body, index: idx, info: ei, point: p, selRef: { kind: "edge", body: ref.body, index: idx, p } };
  }
  if (ref.kind === "vertex") {
    let p = null;
    if (ref.edge) {
      const er = clone(ref.edge);
      const idx = M.locateEdge(shape, er);
      if (idx >= 0) p = T.edges[idx][ref.end === "t" ? "t" : "s"];
    }
    if (!p) {
      let bd = 1e-3;
      for (const e of T.edges) for (const q of [e.s, e.t]) { const d = dist(q, ref.p); if (d < bd) { bd = d; p = q; } }
    }
    if (!p) return null;
    return { kind: "vertex", body: ref.body, index: -1, info: null, point: p, selRef: { kind: "vertex", body: ref.body, p } };
  }
  return null;
}

function faceNormalAt(fi, p, fallback) {
  if (fi.type === "PLANE") return fi.n;
  if ((fi.type === "CYLINDRE" || fi.type === "CONE") && fi.a && fi.ao) {
    const w = V.sub(p, fi.ao);
    const radial = V.sub(w, V.mul(fi.a, V.dot(w, fi.a)));
    if (V.len(radial) > EPS) {
      const wc = V.sub(fi.c, fi.ao);
      const rc = V.sub(wc, V.mul(fi.a, V.dot(wc, fi.a)));
      const outward = V.dot(rc, fi.n) >= 0;
      return V.mul(V.norm(radial), outward ? 1 : -1);
    }
  }
  if (fi.type === "SPHERE" && fi.ao) { const d = V.sub(p, fi.ao); if (V.len(d) > EPS) return V.mul(V.norm(d), V.dot(V.sub(fi.c, fi.ao), fi.n) >= 0 ? 1 : -1); }
  return Array.isArray(fallback) ? V.norm(fallback) : fi.n;
}

/** Closest point on a topo edge (lines and circles exactly, other curves: nearest sample). */
export function closestOnEdge(e, p) {
  if (!e || !Array.isArray(p)) return null;
  if (e.type === "LINE") {
    const ab = V.sub(e.t, e.s), L2 = V.dot(ab, ab);
    const t = L2 > 1e-18 ? Math.max(0, Math.min(1, V.dot(V.sub(p, e.s), ab) / L2)) : 0;
    return V.add(e.s, V.mul(ab, t));
  }
  if (e.type === "CIRCLE" && e.c && e.a) {
    const w = V.sub(p, e.c);
    let r = V.sub(w, V.mul(e.a, V.dot(w, e.a)));
    if (V.len(r) < EPS) r = V.sub(e.m, e.c);
    const q = V.add(e.c, V.mul(V.norm(r), e.r));
    // arcs: clamp to the nearer end when outside the arc
    const closed = dist(e.s, e.t) < 1e-9;
    if (closed) return q;
    const onArc = arcContains(e, q);
    return onArc ? q : dist(q, e.s) < dist(q, e.t) ? e.s : e.t;
  }
  let best = e.m, bd = dist(p, e.m);
  for (const q of [e.s, e.t]) { const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
  return best;
}
function arcContains(e, q) {
  const u = V.norm(V.sub(e.s, e.c)), w = V.cross(e.a, u);
  const ang = (x) => { const d = V.sub(x, e.c); let a = Math.atan2(V.dot(d, w), V.dot(d, u)); if (a < 0) a += 2 * Math.PI; return a; };
  let at = ang(e.t), am = ang(e.m), aq = ang(q);
  if (am > at) { at = 2 * Math.PI - at; am = 2 * Math.PI - am; aq = (2 * Math.PI - aq) % (2 * Math.PI); }
  return aq <= at + 1e-9;
}

// ---------------------------------------------------------------- annotation planes
export const PLANE_TYPES = {
  face: "Normal to face",
  custom: "Normal to custom face",
  circle: "Normal to circular edge",
  axis: "Axis of cylinder or cone",
  xy: "Principal XY",
  yz: "Principal YZ",
  zx: "Principal ZX",
};

/** Topology record of a resolved entity's body. */
function topoFor(state, R) { const b = R && state.bodies.get(R.body); return b ? K.topoOf(b.shape) : null; }

/**
 * Candidate annotation planes for a list of resolved entities (first = annotated geometry):
 * [{type, n}] (n unnormalised sign; orientToView flips it toward the camera).
 * opts.contain: unit direction(s) the plane must contain (dimension measurement direction).
 */
export function planeCandidates(state, list, opts = {}) {
  const out = [];
  const contain = (opts.contain || []).filter((d) => d && V.len(d) > EPS).map(V.norm);
  const add = (type, n, extra = {}) => {
    if (!n || V.len(n) < EPS) return;
    let nn = V.norm(n);
    for (const d of contain) {
      if (Math.abs(V.dot(nn, d)) > 1e-6) {
        if (type === "xy" || type === "yz" || type === "zx") {
          const q = V.sub(nn, V.mul(d, V.dot(nn, d)));
          if (V.len(q) < 1e-3) return;
          nn = V.norm(q);
        } else return;
      }
    }
    if (out.some((c) => Math.abs(V.dot(c.n, nn)) > 0.9999)) return;
    out.push({ type, n: nn, ...extra });
  };
  const R = list[0];
  const T = R ? topoFor(state, R) : null;
  if (R && T) {
    if (R.kind === "face") {
      const fi = R.info;
      if (fi.type === "PLANE") add("face", fi.n, { face: R.index });
      if ((fi.type === "CYLINDRE" || fi.type === "CONE") && fi.a) add("axis", fi.a);
      for (const fj of adjacentPlanarFaces(T, R.index)) add("face", T.faces[fj].n, { face: fj });
    } else if (R.kind === "edge") {
      const e = R.info;
      for (const fj of e.faces || []) if (T.faces[fj] && T.faces[fj].type === "PLANE") add("face", T.faces[fj].n, { face: fj });
      if (e.type === "CIRCLE" && e.a) add("circle", e.a);
      if (e.type === "LINE") contain.push(e.d);
    } else if (R.kind === "vertex") {
      const fs = new Set();
      T.edges.forEach((e) => { if (dist(e.s, R.point) < 1e-6 || dist(e.t, R.point) < 1e-6) for (const f of e.faces || []) fs.add(f); });
      for (const fj of fs) if (T.faces[fj] && T.faces[fj].type === "PLANE") add("face", T.faces[fj].n, { face: fj });
    }
  }
  for (const R2 of list.slice(1)) {
    if (R2 && R2.kind === "face" && R2.info && R2.info.type === "PLANE") add("face", R2.info.n, { face: R2.index, second: true });
    if (R2 && R2.kind === "edge" && R2.info) { const T2 = topoFor(state, R2); for (const fj of R2.info.faces || []) if (T2 && T2.faces[fj] && T2.faces[fj].type === "PLANE") add("face", T2.faces[fj].n, { face: fj, second: true }); }
  }
  if (opts.custom) add("custom", opts.custom);
  add("xy", [0, 0, 1]);
  add("yz", [1, 0, 0]);
  add("zx", [0, 1, 0]);
  return out;
}

export function adjacentPlanarFaces(T, fi) {
  const out = [];
  for (const e of T.edges) {
    if (!(e.faces || []).includes(fi)) continue;
    for (const f of e.faces) if (f !== fi && T.faces[f] && T.faces[f].type === "PLANE" && !out.includes(f)) out.push(f);
  }
  return out;
}

/** Normal pointing toward the viewer (view = {f: camera forward}). */
export function orientToView(n, view) {
  if (!view || !view.f) return n;
  return V.dot(n, view.f) > 0 ? neg(n) : n;
}

/** In-plane x axis of an annotation plane: horizontal in the world where possible. */
export function planeX(n) {
  n = V.norm(n);
  let x;
  if (Math.abs(n[2]) > 0.95) x = V.sub([1, 0, 0], V.mul(n, n[0]));
  else x = V.cross([0, 0, 1], n);
  if (V.len(x) < EPS) x = V.cross(n, [0, 1, 0]);
  return V.norm(x);
}

/** Index of the candidate that best faces the viewer (geometry-derived planes first). */
export function defaultPlaneIndex(cands, view) {
  if (!cands.length) return -1;
  const f = (view && view.f) || [0, 0, -1];
  let best = 0, bs = -Infinity;
  cands.forEach((c, i) => {
    const s = Math.abs(V.dot(c.n, f)) + (["face", "circle", "axis", "custom"].includes(c.type) ? 0.35 : 0);
    if (s > bs + 1e-9) { bs = s; best = i; }
  });
  return best;
}

/**
 * Stored plane {type, n, x} on the current candidates: the candidate of the same type closest
 * to the stored normal (keeping the stored side and rotating x with it), else the stored plane.
 */
export function followPlane(stored, cands) {
  if (!stored || !stored.n) return null;
  const n0 = V.norm(stored.n);
  let best = null, bd = -1;
  for (const c of cands) {
    if (c.type !== stored.type) continue;
    const d = Math.abs(V.dot(c.n, n0));
    if (d > bd) { bd = d; best = c; }
  }
  if (!best || bd < 0.5) return { type: stored.type, n: n0, x: V.norm(stored.x || planeX(n0)), stale: !best };
  const n = V.dot(best.n, n0) < 0 ? neg(best.n) : best.n;
  let x = stored.x ? M.rotateTo(V.norm(stored.x), n0, n) : planeX(n);
  x = V.sub(x, V.mul(n, V.dot(x, n)));
  if (V.len(x) < EPS) x = planeX(n);
  return { type: stored.type, n, x: V.norm(x) };
}

/** Build a stored plane from a candidate, facing the viewer. */
export function planeFromCandidate(c, view) {
  const n = orientToView(c.n, view);
  return { type: c.type, n: K.roundVec(n), x: K.roundVec(planeX(n)) };
}

// ---------------------------------------------------------------- holes and bosses
/** Cylinder behind a resolved face or circular edge: {body, face, o, a, r, len, internal} or null. */
export function cylinderOf(state, R) {
  if (!R) return null;
  const b = state.bodies.get(R.body);
  if (!b) return null;
  const T = K.topoOf(b.shape);
  let fi = -1;
  if (R.kind === "face" && R.info && R.info.type === "CYLINDRE") fi = R.index;
  else if (R.kind === "edge" && R.info && R.info.type === "CIRCLE") {
    const e = R.info;
    // prefer the cylinder of the same radius across the edge (the hole wall), else any coaxial cylinder
    let cand = (e.faces || []).filter((f) => T.faces[f] && T.faces[f].type === "CYLINDRE" && T.faces[f].a && Math.abs(Math.abs(V.dot(T.faces[f].a, e.a)) - 1) < 1e-6);
    cand.sort((p, q) => Math.abs(T.faces[p].r - e.r) - Math.abs(T.faces[q].r - e.r));
    if (cand.length) fi = cand[0];
  }
  if (fi < 0) return null;
  const ci = K.cylinderFaceInfo(b.shape, fi);
  if (!ci) return null;
  return { body: R.body, face: fi, ...ci, a: V.norm(ci.a) };
}

const axisDist = (p, o, a) => { const w = V.sub(p, o); return V.len(V.sub(w, V.mul(a, V.dot(w, a)))); };
const coaxial = (f, cyl) => f && f.a && Math.abs(Math.abs(V.dot(V.norm(f.a), cyl.a)) - 1) < 1e-6 && (!f.ao || axisDist(f.ao, cyl.o, cyl.a) < 1e-4);
const circleCoaxial = (e, cyl) => e && e.type === "CIRCLE" && e.a && Math.abs(Math.abs(V.dot(e.a, cyl.a)) - 1) < 1e-6 && axisDist(e.c, cyl.o, cyl.a) < 1e-4;

function featureValue(P, f, key, kind) {
  const name = f.p && f.p[key];
  try { if (name && P && P.has(name)) return P.value(name); } catch { /* fall through */ }
  try { return P ? P.eval(f[key], kind) : Number.parseFloat(f[key]); } catch { return NaN; }
}

/** Hole centres + drilling directions of a hole feature: [{p, d}]. */
function holeCenters(state, f) {
  const out = [];
  if (f.placement === "points") {
    for (const sp of f.sketchPoints || []) {
      const s = state.sketches.get(sp.sketch);
      const pt = s && s.sk.points[sp.point];
      if (!pt) continue;
      out.push({ p: K.toWorld(s.plane, pt.x, pt.y), d: V.mul(s.plane.n, f.flip ? 1 : -1) });
    }
  } else {
    const n = Array.isArray(f.normal) ? V.norm(f.normal) : [0, 0, 1];
    for (const c of f.points || []) if (Array.isArray(c)) out.push({ p: c, d: V.mul(n, f.flip ? 1 : -1) });
  }
  return out;
}

/** The Hole feature that made this cylinder (axis through one of its centres, matching size). */
export function matchHoleFeature(app, state, cyl) {
  const P = app.result && app.result.params;
  const res = (app.result && app.result.results) || {};
  for (const f of app.doc.features) {
    if (f.type !== "hole" || f.suppressed) continue;
    const r = res[f.id];
    if (!r || r.ok === false || r.rolled) continue;
    const D = featureValue(P, f, "diameter", "length");
    const cbD = f.holeType === "counterbore" ? featureValue(P, f, "cbD", "length") : NaN;
    const csD = f.holeType === "countersink" ? featureValue(P, f, "csD", "length") : NaN;
    const centers = holeCenters(state, f);
    const hit = centers.find((c) => Math.abs(Math.abs(V.dot(V.norm(c.d), cyl.a)) - 1) < 1e-4 && axisDist(c.p, cyl.o, cyl.a) < 1e-3);
    if (!hit) continue;
    if (!(Math.abs(cyl.r - D / 2) < 1e-3 || Math.abs(cyl.r - cbD / 2) < 1e-3)) continue;
    const data = {
      feature: f.id, featureName: f.name, diameter: D, holeType: f.holeType || "simple",
      through: f.extent === "all", depth: f.extent === "all" ? NaN : featureValue(P, f, "depth", "length"),
      drillPoint: f.drillPoint || "angle", tipAngle: f.drillPoint === "flat" ? 0 : (f.tipAngle ? featureValue(P, f, "tipAngle", "angle") : 118),
      quantity: centers.length, entry: hit.p, dir: V.norm(hit.d),
    };
    if (f.holeType === "counterbore") data.cb = { d: cbD, depth: featureValue(P, f, "cbDepth", "length") };
    if (f.holeType === "countersink") data.cs = { d: csD, angle: featureValue(P, f, "csAngle", "angle") };
    if (f.thread || f.designation) data.threadFromHole = { designation: f.designation || (f.thread && f.thread.designation), tclass: f.tclass || (f.thread && f.thread.tclass) };
    return data;
  }
  return null;
}

/**
 * Hole / boss description from the geometry (and the Hole feature when there is one):
 * {kind:'hole'|'boss', diameter, depth, through, bottom:'flat'|'angle'|'open', tipAngle,
 *  cb:{d, depth}?, cs:{d, angle}?, quantity, entry, exit, dir (entry -> into the material), cyl}
 */
export function holeData(app, state, R) {
  const cyl = cylinderOf(state, R);
  if (!cyl) return null;
  const b = state.bodies.get(cyl.body);
  const T = K.topoOf(b.shape);
  const z = (p) => V.dot(V.sub(p, cyl.o), cyl.a);
  // the main bore: the coaxial cylinder of smallest radius sharing an end with the picked one
  const ends = [];
  T.edges.forEach((e, i) => { if ((e.faces || []).includes(cyl.face) && circleCoaxial(e, cyl)) ends.push({ i, e, z: z(e.c) }); });
  ends.sort((p, q) => p.z - q.z);
  const lo = ends[0], hi = ends[ends.length - 1];
  const classify = (end, sgn) => {
    // what lies across this end of the cylinder (sgn: +1 = looking toward +a)
    if (!end) return { kind: "open" };
    const other = (end.e.faces || []).find((f) => f !== cyl.face);
    const fo = T.faces[other];
    if (!fo) return { kind: "open" };
    const circles = T.edges.filter((e) => (e.faces || []).includes(other) && e.type === "CIRCLE");
    const others = T.edges.filter((e) => (e.faces || []).includes(other));
    if (fo.type === "PLANE" && Math.abs(Math.abs(V.dot(fo.n, cyl.a)) - 1) < 1e-6) {
      if (others.length === circles.length && circles.every((e) => circleCoaxial(e, cyl) && e.r <= cyl.r + 1e-6)) return { kind: "flat", z: end.z };
      // a shoulder: a larger coaxial circle on the same face leads to a counterbore wall
      const big = circles.filter((e) => circleCoaxial(e, cyl) && e.r > cyl.r + 1e-6).sort((p, q) => p.r - q.r)[0];
      if (big) {
        const wall = (big.faces || []).find((f) => f !== other && T.faces[f] && T.faces[f].type === "CYLINDRE" && coaxial(T.faces[f], cyl));
        if (wall !== undefined) {
          const wallEnds = T.edges.filter((e) => (e.faces || []).includes(wall) && circleCoaxial(e, cyl)).map((e) => z(e.c));
          if (!wallEnds.length) return { kind: "open", z: end.z };
          const far = sgn > 0 ? Math.max(...wallEnds) : Math.min(...wallEnds);
          return { kind: "cb", d: 2 * big.r, depth: Math.abs(far - end.z), z: end.z, top: far };
        }
      }
      return { kind: "open", z: end.z };
    }
    if (fo.type === "CONE" && coaxial(fo, cyl)) {
      const cr = circles.filter((e) => circleCoaxial(e, cyl)).map((e) => ({ r: e.r, z: z(e.c) }));
      const far = cr.filter((c) => Math.abs(c.z - end.z) > 1e-6);
      if (!far.length || far.every((c) => c.r < 1e-6)) {
        // drill point: the cone closes on the axis; its normal makes the semi-angle with the radial direction
        return { kind: "angle", z: end.z, tipAngle: coneAngle(fo, cyl) };
      }
      const wide = far.sort((p, q) => q.r - p.r)[0];
      if (wide.r > cyl.r + 1e-6) {
        const h = Math.abs(wide.z - end.z);
        return { kind: "cs", d: 2 * wide.r, angle: h > 1e-9 ? (2 * Math.atan((wide.r - cyl.r) / h) * 180) / Math.PI : 90, z: end.z, top: wide.z };
      }
    }
    return { kind: "open", z: end.z };
  };
  const cl = classify(lo, -1), ch = classify(hi, +1);
  const isBottom = (c) => c.kind === "flat" || c.kind === "angle";
  const internal = !!cyl.internal;
  const len = hi && lo ? hi.z - lo.z : cyl.len;
  // the entry is the open (or counterbored / countersunk) end; a through hole enters at +a's end
  let entryHigh = true;
  if (!internal) entryHigh = isBottom(ch) || !isBottom(cl); // a boss is annotated at its free end
  else if (isBottom(ch) && !isBottom(cl)) entryHigh = false;
  else if (isBottom(cl) && !isBottom(ch)) entryHigh = true;
  else if ((cl.kind === "cb" || cl.kind === "cs") && !(ch.kind === "cb" || ch.kind === "cs")) entryHigh = false;
  const ent = entryHigh ? ch : cl, ex = entryHigh ? cl : ch;
  const zE = entryHigh ? (hi ? hi.z : cyl.len) : (lo ? lo.z : 0);
  const zX = entryHigh ? (lo ? lo.z : 0) : (hi ? hi.z : cyl.len);
  const dir = entryHigh ? neg(cyl.a) : cyl.a;
  const topZ = ent.top !== undefined ? ent.top : zE;
  const at = (zz) => V.add(cyl.o, V.mul(cyl.a, zz));
  const out = {
    kind: internal ? "hole" : "boss",
    diameter: 2 * cyl.r,
    depth: Math.abs(topZ - zX),
    boreLength: Math.abs(len),
    through: internal && !isBottom(cl) && !isBottom(ch),
    bottom: isBottom(ex) ? ex.kind : "open",
    tipAngle: ex.kind === "angle" ? ex.tipAngle : 0,
    quantity: 1,
    entry: at(topZ), exit: at(zX), dir, cyl,
  };
  if (ent.kind === "cb") out.cb = { d: ent.d, depth: ent.depth };
  if (ent.kind === "cs") out.cs = { d: ent.d, angle: ent.angle };
  if (internal) {
    const feat = matchHoleFeature(app, state, cyl);
    if (feat) {
      out.feature = feat.feature;
      out.featureName = feat.featureName;
      out.quantity = feat.quantity;
      if (Math.abs(cyl.r - feat.diameter / 2) < 1e-3) out.diameter = feat.diameter;
      if (feat.through) out.through = true;
      if (feat.drillPoint === "flat" && out.bottom === "angle") out.bottom = "flat";
      if (feat.cb && !out.cb) out.cb = feat.cb;
      if (feat.cs && !out.cs) out.cs = feat.cs;
      if (feat.threadFromHole) out.threadFromHole = feat.threadFromHole;
    }
  }
  // identical holes / bosses on the same body (Display quantity counts them)
  if (!out.feature) out.quantity = countMatching(T, cyl, out);
  return out;
}

/** Included angle (deg) of a cone face: its normal makes the semi-angle with the radial direction. */
function coneAngle(fo, cyl) {
  if (!fo.n) return 118;
  const nAx = Math.abs(V.dot(V.norm(fo.n), cyl.a));
  const nRad = Math.sqrt(Math.max(0, 1 - nAx * nAx));
  return (2 * Math.atan2(nAx, nRad) * 180) / Math.PI;
}

function countMatching(T, cyl, data) {
  // one per axis: OCCT may split a cylinder into several faces (seam halves)
  const axes = [];
  T.faces.forEach((f) => {
    if (f.type !== "CYLINDRE" || !f.a || Math.abs(f.r - cyl.r) > 1e-4) return;
    if (Math.abs(Math.abs(V.dot(V.norm(f.a), cyl.a)) - 1) > 1e-6) return;
    const wc = V.sub(f.c, f.ao), rc = V.sub(wc, V.mul(f.a, V.dot(wc, f.a)));
    const internal = V.dot(rc, f.n) < 0;
    if (internal !== (data.kind === "hole")) return;
    if (!axes.some((o) => axisDist(o, f.ao, cyl.a) < 1e-4)) axes.push(f.ao);
  });
  return Math.max(1, axes.length);
}

/** Thread feature data on a cylinder: {feature, designation, tclass, size, threadType, left, length, full, pitch} or null. */
export function threadOn(app, cyl) {
  const res = (app.result && app.result.results) || {};
  for (const f of app.doc.features) {
    if (f.type !== "thread" || f.suppressed) continue;
    const r = res[f.id];
    if (!r || !r.ok || !Array.isArray(r.threads)) continue;
    for (const t of r.threads) {
      if (t.body !== cyl.body || Math.abs(t.r - cyl.r) > 1e-3) continue;
      if (Math.abs(Math.abs(V.dot(V.norm(t.a), cyl.a)) - 1) > 1e-4 || axisDist(t.o, cyl.o, cyl.a) > 1e-3) continue;
      return {
        feature: f.id, featureName: f.name, threadType: f.threadType || "ISO Metric profile", size: f.size, designation: f.designation,
        tclass: f.tclass, left: f.rightHanded === false, length: t.z1 - t.z0, full: f.fullLength !== false, pitch: t.pitch, modeled: !!f.modeled,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------- dimensions
/** Measurable primitive of a resolved entity. */
export function primitiveOf(R) {
  if (!R) return null;
  if (R.kind === "vertex") return { k: "pt", p: R.point };
  const i = R.info;
  if (R.kind === "edge") {
    if (i.type === "LINE") return { k: "line", p: i.s, d: i.d, s: i.s, t: i.t };
    if (i.type === "CIRCLE") return { k: "circle", c: i.c, a: i.a, r: i.r, full: dist(i.s, i.t) < 1e-9, e: i };
    return { k: "pt", p: R.point };
  }
  if (i.type === "PLANE") return { k: "plane", p: R.point, n: i.n };
  if (i.type === "CYLINDRE") return { k: "cyl", o: i.ao, a: V.norm(i.a), r: i.r, p: R.point };
  if (i.type === "CONE") return { k: "line", p: i.ao, d: V.norm(i.a), s: i.ao, t: V.add(i.ao, i.a), axis: true };
  if (i.type === "SPHERE") return { k: "sphere", c: i.ao, r: i.r };
  return { k: "pt", p: R.point };
}

const footOnLine = (p, o, d) => V.add(o, V.mul(d, V.dot(V.sub(p, o), d)));
const angleBetween = (a, b) => (Math.acos(Math.max(-1, Math.min(1, V.dot(V.norm(a), V.norm(b))))) * 180) / Math.PI;

/**
 * What a dimension measures for one or two entities:
 *  {type:'linear', A, B, dir}  {type:'diameter'|'radius', c, a, r, sphere?}
 *  {type:'angular', V:vertex, d1, d2, n, angle}   or {error}
 */
export function measure(prims) {
  const [a, b] = prims;
  if (!a) return { error: "Select geometry to dimension" };
  if (!b) {
    if (a.k === "line" && !a.axis) return { type: "linear", A: a.s, B: a.t, dir: a.d, single: true };
    if (a.k === "circle") return a.full ? { type: "diameter", c: a.c, a: a.a, r: a.r } : { type: "radius", c: a.c, a: a.a, r: a.r, e: a.e };
    if (a.k === "cyl") return { type: "diameter", c: footOnLine(a.p, a.o, a.a), a: a.a, r: a.r };
    if (a.k === "sphere") return { type: "diameter", c: a.c, a: [0, 0, 1], r: a.r, sphere: true };
    return { error: "Select a second item to measure to" };
  }
  // normalise: centres of circles / cylinders act as points / axis lines
  const asPt = (x) => (x.k === "pt" ? x.p : x.k === "circle" ? x.c : x.k === "sphere" ? x.c : null);
  const asLine = (x) => (x.k === "line" ? { o: x.s || x.p, d: V.norm(x.d) } : x.k === "cyl" ? { o: x.o, d: x.a } : null);
  const asPlane = (x) => (x.k === "plane" ? { p: x.p, n: V.norm(x.n) } : null);
  const pa = asPt(a), pb = asPt(b), la = asLine(a), lb = asLine(b), qa = asPlane(a), qb = asPlane(b);
  if (pa && pb) return { type: "linear", A: pa, B: pb, dir: V.sub(pb, pa) };
  if (pa && lb) { const B = footOnLine(pa, lb.o, lb.d); return { type: "linear", A: pa, B, dir: V.sub(B, pa), refLine: lb.d }; }
  if (la && pb) { const A = footOnLine(pb, la.o, la.d); return { type: "linear", A, B: pb, dir: V.sub(pb, A), refLine: la.d }; }
  if (pa && qb) { const B = V.sub(pa, V.mul(qb.n, V.dot(V.sub(pa, qb.p), qb.n))); return { type: "linear", A: pa, B, dir: qb.n }; }
  if (qa && pb) { const A = V.sub(pb, V.mul(qa.n, V.dot(V.sub(pb, qa.p), qa.n))); return { type: "linear", A, B: pb, dir: qa.n }; }
  if (la && lb) {
    const c = V.cross(la.d, lb.d);
    if (V.len(c) < 1e-6) {
      // parallel lines: distance between them, measured at the first line's middle
      const mid = a.k === "line" ? V.mul(V.add(a.s, a.t), 0.5) : (a.p || la.o);
      const B = footOnLine(mid, lb.o, lb.d);
      return { type: "linear", A: mid, B, dir: V.sub(B, mid), refLine: la.d };
    }
    // intersecting (coplanar) lines: angle; skew lines: their common normal distance
    const w = V.sub(lb.o, la.o);
    const nrm = V.norm(c);
    if (Math.abs(V.dot(w, nrm)) > 1e-4) {
      const A = closestBetween(la, lb);
      return { type: "linear", A: A.p, B: A.q, dir: V.sub(A.q, A.p) };
    }
    const X = closestBetween(la, lb).p;
    const d1 = towardEntity(a, X, la.d), d2 = towardEntity(b, X, lb.d);
    return { type: "angular", V: X, d1, d2, n: nrm, angle: angleBetween(d1, d2), e1: a, e2: b };
  }
  if ((la && qb) || (qa && lb)) {
    const L = la || lb, Q = qa || qb, eL = la ? a : b;
    if (Math.abs(V.dot(L.d, Q.n)) < 1e-6) {
      const mid = eL.k === "line" ? V.mul(V.add(eL.s, eL.t), 0.5) : L.o;
      const B = V.sub(mid, V.mul(Q.n, V.dot(V.sub(mid, Q.p), Q.n)));
      return la ? { type: "linear", A: mid, B, dir: Q.n } : { type: "linear", A: B, B: mid, dir: Q.n };
    }
    return { error: "The selected line and face are not parallel" };
  }
  if (qa && qb) {
    const c = V.cross(qa.n, qb.n);
    if (V.len(c) < 1e-6) {
      const B = V.sub(qa.p, V.mul(qb.n, V.dot(V.sub(qa.p, qb.p), qb.n)));
      return { type: "linear", A: qa.p, B, dir: qb.n };
    }
    // dihedral angle: measured in the plane normal to the intersection line, through the first anchor
    const nrm = V.norm(c);
    const u1 = V.norm(V.cross(nrm, qa.n)), u2 = V.norm(V.cross(nrm, qb.n));
    const X = planesMeet(qa, qb, nrm);
    const d1 = V.dot(V.sub(qa.p, X), u1) >= 0 ? u1 : neg(u1);
    const d2 = V.dot(V.sub(qb.p, X), u2) >= 0 ? u2 : neg(u2);
    return { type: "angular", V: X, d1, d2, n: nrm, angle: angleBetween(d1, d2), planes: true };
  }
  return { error: "These items cannot be dimensioned together" };
}

function towardEntity(e, X, d) {
  if (e.k === "line" && e.s && e.t) {
    const m = V.mul(V.add(e.s, e.t), 0.5);
    return V.dot(V.sub(m, X), d) >= 0 ? V.norm(d) : neg(V.norm(d));
  }
  return V.norm(d);
}
function closestBetween(l1, l2) {
  const w0 = V.sub(l1.o, l2.o);
  const a = V.dot(l1.d, l1.d), b = V.dot(l1.d, l2.d), c = V.dot(l2.d, l2.d), d = V.dot(l1.d, w0), e = V.dot(l2.d, w0);
  const den = a * c - b * b;
  const s = Math.abs(den) > 1e-12 ? (b * e - c * d) / den : 0;
  const t = Math.abs(den) > 1e-12 ? (a * e - b * d) / den : e / c;
  return { p: V.add(l1.o, V.mul(l1.d, s)), q: V.add(l2.o, V.mul(l2.d, t)) };
}
function planesMeet(qa, qb, dirL) {
  // a point on both planes nearest to qa.p
  const n1 = qa.n, n2 = qb.n;
  const d1 = V.dot(n1, qa.p), d2 = V.dot(n2, qb.p);
  const c = V.cross(n1, n2);
  const p0 = V.mul(V.add(V.mul(V.cross(n2, c), d1), V.mul(V.cross(c, n1), d2)), 1 / V.dot(c, c));
  return footOnLine(qa.p, p0, dirL);
}

/** Feature of size: cylindrical face / circular edge / sphere (material condition modifiers apply). */
export function isFeatureOfSize(R) {
  if (!R || !R.info) return false;
  if (R.kind === "face") return ["CYLINDRE", "SPHERE", "CONE"].includes(R.info.type);
  if (R.kind === "edge") return R.info.type === "CIRCLE";
  return false;
}
