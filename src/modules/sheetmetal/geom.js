// sheetmetal: the sheet-metal body model and its OCCT geometry.
//
// A sheet-metal body is a solid (st.bodies entry with sheetMetal) plus derived data in st.smData
// (Map bodyId -> data, see README.md): flanges and bends in ONE flat coordinate system (u, v, w). The
// sheet occupies w in [w0, w0 + T]; "flat" space is the flat pattern. Flange f is placed in the world by
//   M_f = frame * B(b1) * B(b2) ...   (bends on the path from the root flange to f)
// where a folded bend B(b) = Rot(axis, A) * Trans(-BA q) and a flat (unfolded) bend is the identity.
// BA = A (R + K T) is the developed length of the bend, so unfolding is exact for the K-factor.
//
// Geometry is never re-derived from the data alone: the solid keeps whatever other features did to
// it (holes, cuts). Re-folding operations (unfold, refold, fold, jog, flat pattern) cut the current
// solid into flange pieces (prisms of their bottom faces, found by seed points), bend pieces (the
// solid inside each bend wedge) and strip pieces (flat bends), move each piece and re-wrap bends.
import * as K from "../../kernel.js";
import { V, V2, I4, fromFrame, mul, apply, applyDir, inv, trans, rotAxis, isIdentity, axisAngle, pointInPoly, area2, clone, triangulate } from "./math.js";

const R = () => K.R;
const del = (...a) => K.del(...a);
const EPS = 1e-4;

// ---------------------------------------------------------------- data
export function newData({ T, K: kf, R: r, rule, w0, frame, extra }) {
  return { v: 1, kind: "sheet", T, K: kf, R: r, rule, w0, frame, root: "F1", nid: 1, flanges: { F1: { id: "F1", bend: null, seeds: [] } }, bends: {}, ...(extra || {}) };
}
export const cloneData = (d) => clone(d);
export function nextId(d, p) { d.nid = (d.nid || 1) + 1; return `${p}${d.nid}`; }

/** Bends from the root to flange fid (root first). */
export function chain(d, fid) {
  const out = [];
  let f = d.flanges[fid], guard = 0;
  while (f && f.bend && guard++ < 1000) {
    const b = d.bends[f.bend];
    if (!b) break;
    out.unshift(b);
    f = d.flanges[b.parent];
  }
  return out;
}
export const bendBA = (b, T) => b.A * (b.R + b.K * T);
/** Bend axis in flat space: {o:[u,v,w], dir} (rotation by +A about dir folds the child). */
export function bendAxis(d, b) {
  const wa = b.sgn > 0 ? d.w0 + d.T + b.R : d.w0 - b.R;
  return { o: [b.o[0], b.o[1], wa], dir: V.mul([b.q[1], -b.q[0], 0], b.sgn) };
}
/** Flat-space transform of one bend (identity when the bend is flat). */
export function bendT(d, b) {
  if (b.flat) return I4();
  const ax = bendAxis(d, b);
  const BA = bendBA(b, d.T);
  return mul(rotAxis(ax.o, ax.dir, b.A), trans([-BA * b.q[0], -BA * b.q[1], 0]));
}
/** Flat -> world transform of flange fid. */
export function flangeM(d, fid) {
  const f = d.flanges[fid];
  if (f && f.M) return f.M; // explicit placement (descriptions of solids that are not sheet metal yet)
  let m = d.frame;
  for (const b of chain(d, fid)) m = mul(m, bendT(d, b));
  return m;
}
/** Flat -> world transform that applies to points of bend b's zone (its parent's). */
export const parentM = (d, b) => flangeM(d, b.parent);
/** Flat-space chain transform (without the frame). */
export function chainT(d, fid) {
  let m = I4();
  for (const b of chain(d, fid)) m = mul(m, bendT(d, b));
  return m;
}
/** Keep flange sid where it is in the world after the data's bend states changed (old = data before). */
export function keepStationary(oldD, d, sid) {
  if (!sid || !d.flanges[sid] || !oldD.flanges[sid]) return;
  const Mold = flangeM(oldD, sid);
  d.frame = mul(Mold, inv(chainT(d, sid)));
}
/** Subtree flange ids of fid (including fid). */
export function subtree(d, fid) {
  const out = [fid];
  for (let i = 0; i < out.length; i++) for (const b of Object.values(d.bends)) if (b.parent === out[i] && !out.includes(b.child)) out.push(b.child);
  return out;
}

// ---------------------------------------------------------------- OCCT helpers
/** Rigid transform of a shape (a copy). */
export function transformShape(shape, m) {
  if (isIdentity(m)) return K.translated(shape, [0, 0, 0]);
  const { axis, angle, t } = axisAngle(m);
  const rotatedS = angle > 1e-12 ? K.rotated(shape, (angle * 180) / Math.PI, [0, 0, 0], axis) : null;
  try { return K.translated(rotatedS || shape, t); } finally { if (rotatedS) del(rotatedS); }
}
/** Box in flat space: rectangle corners (2D, ccw or cw) x [wa, wb], mapped by m. */
/** Prism of a planar polygon (world points) along v; the loop is oriented so the solid is not inside out. */
export function prismPts(pts, v) {
  let n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n = V.add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
  }
  const f = K.polygonFace(V.dot(n, v) < 0 ? pts.slice().reverse() : pts);
  try { return K.prism(f, v); } finally { del(f); }
}
export function flatPrism(m, poly, wa, wb) {
  return prismPts(poly.map((p) => apply(m, [p[0], p[1], wa])), applyDir(m, [0, 0, wb - wa]));
}
export function rect(o, d, q, s0, s1, u0, u1) {
  const P = (s, u) => [o[0] + d[0] * s + q[0] * u, o[1] + d[1] * s + q[1] * u];
  return [P(s0, u0), P(s1, u0), P(s1, u1), P(s0, u1)];
}
/** Union of solids; consumes (deletes) the inputs. */
export function fuseList(list) {
  const items = list.filter(Boolean);
  if (!items.length) return null;
  let s = items[0];
  for (let i = 1; i < items.length; i++) {
    const n = K.fuse(s, items[i]);
    del(s, items[i]);
    s = n;
  }
  return s;
}
const volume = (s) => { try { return K.volumeOf(s); } catch { return 0; } };

/** Solid of bend b (revolved start section) placed with the parent transform mp. */
export function bendSolid(d, b, mp, extra = 0) {
  const ax = bendAxis(d, b);
  const s0 = b.s0 - extra, s1 = b.s1 + extra;
  const wa = d.w0 - (extra ? Math.min(extra, b.sgn > 0 ? extra : b.R) : 0), wb = d.w0 + d.T + (extra ? (b.sgn > 0 ? Math.min(extra, b.R) : extra) : 0);
  const pts = [[s0, wa], [s1, wa], [s1, wb], [s0, wb]].map(([s, w]) => apply(mp, [b.o[0] + b.d[0] * s, b.o[1] + b.d[1] * s, w]));
  const f = K.polygonFace(pts);
  try { return K.revolveFace(f, apply(mp, ax.o), applyDir(mp, ax.dir), (b.A * 180) / Math.PI); } finally { del(f); }
}
/** Flat strip solid of bend b (the developed bend zone). */
export function stripSolid(d, b, mp, extra = 0) {
  const BA = bendBA(b, d.T);
  return flatPrism(mp, rect(b.o, b.d, b.q, b.s0 - extra, b.s1 + extra, 0, BA), d.w0 - extra, d.w0 + d.T + extra);
}

// ---------------------------------------------------------------- finding pieces of the solid
function faceIdxContaining(shape, cands, p) {
  for (const i of cands) {
    const c = K.closestOnFace(shape, i, p);
    if (c && c.dist < 1e-4) return i;
  }
  return -1;
}
/** Planar faces of the shape lying on plane (point p, outward normal n). */
export function planeFaces(shape, p, n) {
  const T = K.topoOf(shape);
  const out = [];
  T.faces.forEach((f, i) => {
    if (f.type !== "PLANE") return;
    if (V.dot(f.n, n) < 1 - 1e-6) return;
    if (Math.abs(V.dot(f.n, p) - f.d) > 1e-4) return;
    out.push(i);
  });
  return out;
}
/** Bottom (w = w0) face indices of flange fid in its current placement m (seeds pick them). */
export function flangeBottomFaces(shape, d, fid, m = flangeM(d, fid)) {
  const f = d.flanges[fid];
  if (!f || !f.seeds || !f.seeds.length) return [];
  const p0 = apply(m, [0, 0, d.w0]);
  const n = V.norm(applyDir(m, [0, 0, -1]));
  const cands = planeFaces(shape, p0, n);
  const out = [];
  for (const s of f.seeds) {
    const i = faceIdxContaining(shape, cands.filter((c) => !out.includes(c)), apply(m, [s[0], s[1], d.w0]));
    if (i >= 0 && !out.includes(i)) out.push(i);
  }
  return out;
}

/** Point of the world on the bend's outer (w0 side for up bends) cylinder -> flat (parent space) coords. */
export function unwrapPoint(d, b, mpInv, P) {
  const ax = bendAxis(d, b);
  const pf = apply(mpInv, P);
  const rel = V.sub(pf, ax.o);
  const dir = ax.dir;
  const t = V.dot(rel, [b.d[0], b.d[1], 0]);
  const radial = V.sub(rel, V.mul(dir, V.dot(rel, dir)));
  const r0 = b.sgn > 0 ? [0, 0, -1] : [0, 0, 1];
  // angle from r0 to radial about dir
  const x = V.dot(radial, r0), y = V.dot(V.cross(r0, radial), dir);
  let th = Math.atan2(y, x);
  if (th < -1e-6) th += 2 * Math.PI;
  const rn = b.R + b.K * d.T;
  const s = Math.min(Math.max(th, 0), b.A) * rn;
  return [b.o[0] + b.q[0] * s + b.d[0] * t, b.o[1] + b.q[1] * s + b.d[1] * t];
}

// ---------------------------------------------------------------- loops of faces
function edgePoints(e, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const v = e.pointAt(i / n);
    out.push(v.toTuple());
    del(v);
  }
  return out;
}
function edgeSamples(e) {
  const t = e.geomType;
  if (t === "LINE") return { pts: edgePoints(e, 1), circle: null };
  if (t === "CIRCLE") {
    let len = 0;
    try { len = e.length; } catch { len = 0; }
    const s = e.startPoint, en = e.endPoint;
    const a = s.toTuple(), b = en.toTuple();
    del(s, en);
    const closed = V.len(V.sub(a, b)) < 1e-7;
    const n = Math.max(8, Math.min(96, Math.ceil(len / 0.8)));
    return { pts: edgePoints(e, n), circle: closed };
  }
  return { pts: edgePoints(e, 32), circle: null };
}
/** Ordered loops of a wire as 3D point lists (closing point not repeated). */
function wireLoop(w) {
  const edges = w.edges;
  const segs = [];
  let circle = null;
  try {
    for (const e of edges) {
      const s = edgeSamples(e);
      if (s.circle && edges.length === 1) {
        let c = null, r = 0;
        try {
          const O = R().getOC();
          const ad = new O.BRepAdaptor_Curve(e.wrapped);
          const ci = ad.Circle();
          const loc = ci.Location();
          c = [loc.X(), loc.Y(), loc.Z()];
          r = ci.Radius();
          del(loc, ci, ad);
        } catch { c = null; }
        if (c) circle = { c, r };
      }
      segs.push(s.pts);
    }
  } finally { del(edges); }
  if (!segs.length) return null;
  const tol = 1e-5;
  const near = (a, b) => V.len(V.sub(a, b)) < tol * 100;
  const out = segs.shift().slice();
  let guard = 0;
  while (segs.length && guard++ < 10000) {
    const end = out[out.length - 1];
    let k = segs.findIndex((s) => near(s[0], end));
    let rev = false;
    if (k < 0) { k = segs.findIndex((s) => near(s[s.length - 1], end)); rev = true; }
    if (k < 0) break;
    const s = segs.splice(k, 1)[0];
    const pts = rev ? s.slice().reverse() : s;
    out.push(...pts.slice(1));
  }
  if (out.length > 2 && near(out[0], out[out.length - 1])) out.pop();
  return { pts: out, circle };
}
/** Loops of face index fi of shape, mapped by fn (3D -> [u, v]): [{pts, circle?, outer}] */
export function faceLoops(shape, fi, fn) {
  const [face] = K.facesAt(shape, [fi]);
  if (!face) return [];
  const loops = [];
  try {
    const ow = face.outerWire();
    try { const l = wireLoop(ow); if (l) loops.push({ ...l, outer: true }); } finally { del(ow); }
    let inner = [];
    try { inner = face.innerWires(); } catch { inner = []; }
    for (const w of inner) { try { const l = wireLoop(w); if (l) loops.push({ ...l, outer: false }); } finally { del(w); } }
  } finally { del(face); }
  return loops.map((l) => ({ ...l, pts: l.pts.map(fn) }));
}
/** Planar face in the world from 2D loops (first = outer) at flat height w, mapped by m. */
export function loopsFace(loops, m, w) {
  const toW = (p) => apply(m, [p[0], p[1], w]);
  const outer = loops.find((l) => l.outer) || loops[0];
  if (!outer || outer.pts.length < 3) throw new Error("Empty profile");
  const ow = K.polygonWire(outer.pts.map(toW));
  let face = null;
  try {
    face = R().makeFace(ow);
    const holes = loops.filter((l) => l !== outer && l.pts.length >= 3).map((l) => K.polygonWire(l.pts.map(toW)));
    if (holes.length) {
      const f2 = R().addHolesInFace(face, holes);
      del(face, holes);
      face = f2;
    }
    return face;
  } finally { del(ow); }
}

// ---------------------------------------------------------------- the edge -> flange mapping
/**
 * Locate a picked linear edge (world points a, b) on a flange boundary: {fid, a, b (flat 2D), side:
 * 'top'|'bottom', q (outward, flat), len} or null.
 */
export function edgeOnFlange(shape, d, a3, b3) {
  for (const fid of Object.keys(d.flanges)) {
    const m = flangeM(d, fid);
    const mi = inv(m);
    const a = apply(mi, a3), b = apply(mi, b3);
    let side = null;
    if (Math.abs(a[2] - d.w0) < EPS && Math.abs(b[2] - d.w0) < EPS) side = "bottom";
    else if (Math.abs(a[2] - d.w0 - d.T) < EPS && Math.abs(b[2] - d.w0 - d.T) < EPS) side = "top";
    if (!side) continue;
    const faces = flangeBottomFaces(shape, d, fid, m);
    if (!faces.length) continue;
    const ab = V2.sub([b[0], b[1]], [a[0], a[1]]);
    const len = V2.len(ab);
    if (len < 1e-6) continue;
    const dd = V2.norm(ab);
    let q = [dd[1], -dd[0]];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const onFace = (p2) => faceIdxContaining(shape, faces, apply(m, [p2[0], p2[1], d.w0])) >= 0;
    const h = Math.min(0.05, d.T * 0.1);
    const out1 = onFace(V2.add(mid, V2.mul(q, h))), in1 = onFace(V2.sub(mid, V2.mul(q, h)));
    if (out1 && !in1) q = V2.mul(q, -1);
    else if (out1 === in1) continue; // interior or not on this flange
    // the edge must not be a bend line of this flange
    const isBendLine = Object.values(d.bends).some((bd) => {
      const u = bd.parent === fid ? 0 : bd.child === fid ? bendBA(bd, d.T) : null;
      if (u === null || Math.abs(V2.dot(bd.d, dd)) < 1 - 1e-6) return false;
      const p = V2.add(bd.o, V2.mul(bd.q, u));
      return Math.abs(V2.cross(bd.d, V2.sub(mid, p))) < 1e-4;
    });
    if (isBendLine) continue;
    return { fid, a: [a[0], a[1]], b: [b[0], b[1]], side, q, d: dd, len, m };
  }
  return null;
}

// ---------------------------------------------------------------- re-folding (rebuild from pieces)
/** Flanges connected through flat bends (same placement): list of {fids, bends (flat ones)}. */
function flatGroups(d) {
  const seen = new Set();
  const groups = [];
  for (const fid of Object.keys(d.flanges)) {
    if (seen.has(fid)) continue;
    const g = { fids: [fid], bends: [] };
    seen.add(fid);
    for (let i = 0; i < g.fids.length; i++) {
      for (const b of Object.values(d.bends)) {
        if (!b.flat) continue;
        const other = b.parent === g.fids[i] ? b.child : b.child === g.fids[i] ? b.parent : null;
        if (!other) continue;
        if (!g.bends.includes(b)) g.bends.push(b);
        if (!seen.has(other)) { seen.add(other); g.fids.push(other); }
      }
    }
    groups.push(g);
  }
  return groups;
}
function solidsOf(shape) { try { return K.solidsOf(shape); } catch { return [shape]; } }
function containsPoint(shape, p) {
  try {
    const probe = K.pointProbe(p);
    try { return probe.dist(shape) < 1e-5; } finally { probe.delete(); }
  } catch { return false; }
}

/**
 * Cut `shape` (sheet-metal body described by `oldD`) into pieces:
 * {flanges: Map fid -> solid|null, strips: Map bid -> solid (flat bends), bends: Map bid -> solid (folded)}.
 * The caller deletes the solids.
 */
export function pieces(shape, oldD) {
  const out = { flanges: new Map(), strips: new Map(), bends: new Map() };
  for (const g of flatGroups(oldD)) {
    const m = flangeM(oldD, g.fids[0]);
    const n = applyDir(m, [0, 0, oldD.T]);
    const faceIdx = [];
    for (const fid of g.fids) for (const i of flangeBottomFaces(shape, oldD, fid, m)) if (!faceIdx.includes(i)) faceIdx.push(i);
    if (!faceIdx.length) { for (const fid of g.fids) out.flanges.set(fid, null); continue; }
    const faces = K.facesAt(shape, faceIdx);
    let rest;
    try { rest = fuseList(faces.map((f) => K.prism(f, n))); } finally { del(faces); }
    // flat bends of the group: their zone becomes a strip piece and is cut out of the rest
    for (const b of g.bends) {
      const big = flatPrism(m, rect(b.o, b.d, b.q, b.s0 - 1e-3, b.s1 + 1e-3, 0, bendBA(b, oldD.T)), oldD.w0 - 1, oldD.w0 + oldD.T + 1);
      try {
        out.strips.set(b.id, K.intersect(rest, big));
        const r2 = K.cut(rest, big);
        del(rest);
        rest = r2;
      } finally { del(big); }
    }
    if (g.fids.length === 1) { out.flanges.set(g.fids[0], rest); continue; }
    // assign the remaining solids to the group's flanges by their seeds
    const parts = solidsOf(rest);
    const owner = new Map();
    for (const part of parts) {
      let who = null;
      for (const fid of g.fids) {
        const f = oldD.flanges[fid];
        if ((f.seeds || []).some((s) => containsPoint(part, apply(m, [s[0], s[1], oldD.w0 + oldD.T / 2])))) { who = fid; break; }
      }
      if (!who) who = g.fids[0];
      if (!owner.has(who)) owner.set(who, []);
      owner.get(who).push(part === rest ? K.translated(rest, [0, 0, 0]) : part);
    }
    del(rest);
    for (const fid of g.fids) {
      const list = owner.get(fid) || [];
      out.flanges.set(fid, list.length ? fuseList(list) : null);
    }
  }
  for (const b of Object.values(oldD.bends)) {
    if (b.flat) continue;
    const mp = parentM(oldD, b);
    const wedge = bendSolid(oldD, b, mp, 1e-3);
    try { out.bends.set(b.id, K.intersect(shape, wedge)); } catch { out.bends.set(b.id, null); } finally { del(wedge); }
  }
  return out;
}

/** Bend piece (folded) -> flat strip solid in flat space of `d` (placed with mp_new), unwrapping its outer face. */
function unwrapBend(oldD, b, piece, mpOld, mpNew) {
  const rOut = b.R + oldD.T;
  const ax = bendAxis(oldD, b);
  const axo = apply(mpOld, ax.o), axd = V.norm(applyDir(mpOld, ax.dir));
  const T = K.topoOf(piece);
  const idx = [];
  T.faces.forEach((f, i) => {
    if (f.type !== "CYLINDRE" || !f.a) return;
    if (Math.abs(Math.abs(V.dot(f.a, axd)) - 1) > 1e-6) return;
    if (Math.abs(f.r - rOut) > 1e-3) return;
    const rel = V.sub(f.ao, axo);
    if (V.len(V.sub(rel, V.mul(axd, V.dot(rel, axd)))) > 1e-3) return;
    idx.push(i);
  });
  if (!idx.length) return null;
  const mi = inv(mpOld);
  // the outer face lies at w0 for up bends (sgn > 0), at w0 + T for down bends
  const solids = [];
  for (const fi of idx) {
    const loops = faceLoops(piece, fi, (P) => unwrapPoint(oldD, b, mi, P));
    if (!loops.length) continue;
    try {
      const f = loopsFace(loops, mpNew, oldD.w0);
      try { solids.push(K.prism(f, applyDir(mpNew, [0, 0, oldD.T]))); } finally { del(f); }
    } catch { /* degenerate loop: skip */ }
  }
  return fuseList(solids);
}

/** Thin wrapped slices of a flat 2D polygon region (flat coords) over bend b, placed with mp. */
export function wrapTool(d, b, region2D, mp) {
  const BA = bendBA(b, d.T);
  const rn = b.R + b.K * d.T;
  const ax = bendAxis(d, b);
  const pts = region2D.map((p) => ({ s: V2.dot(V2.sub(p, b.o), b.q), t: V2.dot(V2.sub(p, b.o), b.d) }));
  let smin = Math.max(0, Math.min(...pts.map((p) => p.s))), smax = Math.min(BA, Math.max(...pts.map((p) => p.s)));
  if (!(smax > smin + 1e-6)) return null;
  const step = Math.max(1e-3, rn * (4 * Math.PI) / 180);
  const n = Math.min(90, Math.max(1, Math.ceil((smax - smin) / step)));
  const slices = [];
  const poly = pts.map((p) => [p.s, p.t]);
  for (let k = 0; k < n; k++) {
    const a = smin + ((smax - smin) * k) / n, c = smin + ((smax - smin) * (k + 1)) / n;
    // clip polygon to the band a <= s <= c (Sutherland-Hodgman twice)
    const clip = (P, keep, inter) => {
      const out = [];
      for (let i = 0; i < P.length; i++) {
        const cur = P[i], prv = P[(i + P.length - 1) % P.length];
        const ci = keep(cur), pi = keep(prv);
        if (ci) { if (!pi) out.push(inter(prv, cur)); out.push(cur); } else if (pi) out.push(inter(prv, cur));
      }
      return out;
    };
    const at = (x) => (p, q) => { const t = (x - p[0]) / (q[0] - p[0]); return [x, p[1] + (q[1] - p[1]) * t]; };
    let P = clip(poly, (p) => p[0] >= a, at(a));
    P = clip(P, (p) => p[0] <= c, at(c));
    if (P.length < 3 || Math.abs(area2(P)) < 1e-9) continue;
    const mid = (a + c) / 2, th = mid / rn;
    // planar slice: the polygon laid on the tangent plane at the slice middle (outer side), then
    // pushed radially through the sheet; tangential offsets are scaled up to the outer radius so
    // neighbouring slices overlap instead of leaving slivers
    const rot = rotAxis([0, 0, 0], ax.dir, th);
    const r0 = b.sgn > 0 ? [0, 0, -1] : [0, 0, 1];
    const radial = applyDir(rot, r0), tang = applyDir(rot, [b.q[0], b.q[1], 0]);
    const rOut = b.R + d.T + 0.05, rIn = Math.max(0, b.R - 0.05);
    const ks = rOut / rn;
    const onCyl = (s, t, r) => V.add(V.add([b.o[0] + b.d[0] * t, b.o[1] + b.d[1] * t, ax.o[2]], V.mul(radial, r)), V.mul(tang, (s - mid) * ks));
    try {
      slices.push(prismPts(P.map(([s, t]) => apply(mp, onCyl(s, t, rOut))), applyDir(mp, V.mul(radial, rIn - rOut))));
    } catch { /* skip */ }
  }
  if (!slices.length) return null;
  // the slices overlap a little: a boolean tool must not self-intersect, so fuse them first
  return fuseList(slices);
}

/** Folded bend solid for a strip piece (flat) of oldD placed now with mpNew: full bend minus cut-outs. */
export function refoldStrip(oldD, newD, b, strip, mpOld, mpNew) {
  const full = bendSolid(newD, b, mpNew);
  if (!strip) return full;
  const exact = stripSolid(oldD, b, mpOld, 0);
  let removed = null;
  try { removed = K.cut(exact, strip); } catch { removed = null; } finally { del(exact); }
  if (!removed || volume(removed) < 1e-6) { if (removed) del(removed); return full; }
  let out = full;
  const mi = inv(mpOld);
  try {
    for (const s of solidsOf(removed)) {
      // bottom face of the removed piece (planar, at w0) -> 2D region
      const n = V.norm(applyDir(mpOld, [0, 0, -1]));
      const fidx = planeFaces(s, apply(mpOld, [0, 0, oldD.w0]), n);
      for (const fi of fidx) {
        const loops = faceLoops(s, fi, (P) => { const q = apply(mi, P); return [q[0], q[1]]; });
        const outer = loops.find((l) => l.outer);
        if (!outer) continue;
        const tool = wrapTool(newD, b, outer.pts, mpNew);
        if (!tool) continue;
        try { const r = K.cut(out, tool); del(out); out = r; } catch { /* keep */ } finally { del(tool); }
      }
    }
  } finally { del(removed); }
  return out;
}

/**
 * New solid for data newD from the pieces of `shape` (described by oldD). Flanges and bends of newD
 * may name their source with `src` (default: same id). Returns the solid (caller owns it).
 */
export function rebuild(shape, oldD, newD) {
  const P = pieces(shape, oldD);
  const parts = [];
  try {
    for (const f of Object.values(newD.flanges)) {
      const src = f.src || f.id;
      const piece = P.flanges.get(src);
      if (!piece || !oldD.flanges[src]) continue;
      let s = piece;
      if (f.clip && f.clip.length) {
        const mOld = flangeM(oldD, src);
        const box = flatPrism(mOld, clipPoly(f.clip), oldD.w0 - 1, oldD.w0 + oldD.T + 1);
        try { s = K.intersect(piece, box); } finally { del(box); }
        if (volume(s) < 1e-9) { del(s); continue; }
      }
      const tm = mul(flangeM(newD, f.id), inv(flangeM(oldD, src)));
      parts.push(transformShape(s, tm));
      if (s !== piece) del(s);
    }
    for (const b of Object.values(newD.bends)) {
      const src = b.src || b.id;
      const ob = oldD.bends[src];
      const mpNew = parentM(newD, b);
      if (!ob && !b.fromStrip) { parts.push(b.flat ? stripSolid(newD, b, mpNew) : bendSolid(newD, b, mpNew)); continue; }
      if (b.fromStrip) {
        // a new bend over a flat zone of an old flange (Fold / Jog)
        const mOld = flangeM(oldD, b.fromStrip);
        const piece = P.flanges.get(b.fromStrip);
        let strip = null;
        if (piece) {
          const big = flatPrism(mOld, rect(b.o, b.d, b.q, b.s0 - 1e-3, b.s1 + 1e-3, 0, bendBA(b, newD.T)), oldD.w0 - 1, oldD.w0 + oldD.T + 1);
          try { strip = K.intersect(piece, big); } finally { del(big); }
        }
        if (b.flat) parts.push(strip ? transformShape(strip, mul(mpNew, inv(mOld))) : stripSolid(newD, b, mpNew));
        else parts.push(refoldStrip(oldD, newD, b, strip, mOld, mpNew));
        if (strip) del(strip);
        continue;
      }
      const mpOld = parentM(oldD, ob);
      if (ob.flat && b.flat) {
        const s = P.strips.get(src);
        parts.push(s ? transformShape(s, mul(mpNew, inv(mpOld))) : stripSolid(newD, b, mpNew));
      } else if (!ob.flat && !b.flat) {
        const s = P.bends.get(src);
        parts.push(s ? transformShape(s, mul(mpNew, inv(mpOld))) : bendSolid(newD, b, mpNew));
      } else if (!ob.flat && b.flat) {
        const s = P.bends.get(src);
        parts.push((s && unwrapBend(oldD, ob, s, mpOld, mpNew)) || stripSolid(newD, b, mpNew));
      } else {
        parts.push(refoldStrip(oldD, newD, b, P.strips.get(src), mpOld, mpNew));
      }
    }
  } finally {
    for (const m of [P.flanges, P.strips, P.bends]) for (const s of m.values()) if (s) del(s);
  }
  if (!parts.length) throw new Error("The sheet metal body has no material left");
  return fuseList(parts);
}
/** Convex clip polygon (2D) from half-planes [{n:[nu,nv], c}] keeping n.x <= c, inside a big square. */
export function clipPoly(hp) {
  const B = 1e4;
  let P = [[-B, -B], [B, -B], [B, B], [-B, B]];
  for (const h of hp) {
    const out = [];
    const val = (p) => V2.dot(h.n, p) - h.c;
    for (let i = 0; i < P.length; i++) {
      const cur = P[i], prv = P[(i + P.length - 1) % P.length];
      const vc = val(cur), vp = val(prv);
      const inter = () => { const t = vp / (vp - vc); return [prv[0] + (cur[0] - prv[0]) * t, prv[1] + (cur[1] - prv[1]) * t]; };
      if (vc <= 0) { if (vp > 0) out.push(inter()); out.push(cur); } else if (vp <= 0) out.push(inter());
    }
    P = out;
    if (P.length < 3) break;
  }
  return P;
}

// ---------------------------------------------------------------- flat pattern
/**
 * Flat pattern of a body: {solid, frame (flat -> world for the laid-out pattern), data (all bends flat),
 * lines: [{kind:'center'|'extent', a:[u,v], b:[u,v], up}], loops (outline in flat 2D)}.
 */
export function flatPattern(shape, d, stationary) {
  const fd = cloneData(d);
  for (const b of Object.values(fd.bends)) b.flat = true;
  keepStationary(d, fd, stationary || d.root);
  const solid = rebuild(shape, d, fd);
  const lines = [];
  for (const b of Object.values(fd.bends)) {
    const BA = bendBA(b, d.T);
    const L = (u) => ({ a: V2.add(b.o, V2.add(V2.mul(b.d, b.s0), V2.mul(b.q, u))), b: V2.add(b.o, V2.add(V2.mul(b.d, b.s1), V2.mul(b.q, u))) });
    lines.push({ kind: "extent", ...L(0), bend: b.id });
    lines.push({ kind: "extent", ...L(BA), bend: b.id });
    lines.push({ kind: "center", ...L(BA / 2), bend: b.id, up: b.sgn > 0, angle: b.A, R: b.R });
  }
  return { solid, frame: fd.frame, data: fd, lines };
}
/** Outline loops (2D flat coords) of a flat solid: top-face loops at w0 + T. */
export function flatLoops(solid, fd) {
  const m = fd.frame;
  const mi = inv(m);
  const n = V.norm(applyDir(m, [0, 0, 1]));
  const idx = planeFaces(solid, apply(m, [0, 0, fd.w0 + fd.T]), n);
  const loops = [];
  for (const fi of idx) {
    for (const l of faceLoops(solid, fi, (P) => { const q = apply(mi, P); return [q[0], q[1]]; })) {
      const lc = l.circle ? { c: (() => { const q = apply(mi, l.circle.c); return [q[0], q[1]]; })(), r: l.circle.r } : null;
      loops.push({ pts: l.pts, outer: l.outer, circle: lc });
    }
  }
  return loops;
}

// ---------------------------------------------------------------- building blocks for features
/** Data and solid of a base flange from a planar face (world) on plane frame m (flat -> world). */
export function seedsForPoly(poly, n = 6) {
  const tris = triangulate(poly);
  const pts = tris.map(([a, b, c]) => [(poly[a][0] + poly[b][0] + poly[c][0]) / 3, (poly[a][1] + poly[b][1] + poly[c][1]) / 3]);
  pts.sort(() => 0);
  const step = Math.max(1, Math.floor(pts.length / n));
  const out = [];
  for (let i = 0; i < pts.length && out.length < n; i += step) out.push(pts[i]);
  return out.filter((p) => pointInPoly(p, poly));
}

/** Seed points (flat 2D) inside faces fidx of shape (mapped by mi world -> flat), optionally filtered. */
export function seedsOnFaces(shape, fidx, mi, keep = () => true, n = 6) {
  const out = [];
  for (const fi of fidx) {
    const loops = faceLoops(shape, fi, (P) => { const q = apply(mi, P); return [q[0], q[1]]; });
    const outer = loops.find((l) => l.outer);
    if (!outer || outer.pts.length < 3) continue;
    const holes = loops.filter((l) => !l.outer);
    for (const s of seedsForPoly(outer.pts, n * 3)) {
      if (holes.some((h) => pointInPoly(s, h.pts))) continue;
      if (!keep(s)) continue;
      out.push(s);
      if (out.length >= n * fidx.length) break;
    }
  }
  return out;
}
/** Re-derive the seeds of flanges fids from the solid (after cuts moved material away from old seeds). */
export function refreshSeeds(shape, d, fids = Object.keys(d.flanges)) {
  for (const fid of fids) {
    const f = d.flanges[fid];
    if (!f || !f.seeds || !f.seeds.length) continue;
    // a flange next to a flat bend shares its bottom face with its neighbours: keep its seeds
    if (Object.values(d.bends).some((b) => b.flat && (b.parent === fid || b.child === fid))) continue;
    const m = flangeM(d, fid);
    const faces = flangeBottomFaces(shape, d, fid, m);
    if (!faces.length) continue;
    const s = seedsOnFaces(shape, faces, inv(m), f.keep ? (p) => keepSeed(f.keep, p) : undefined);
    if (s.length) f.seeds = s;
  }
}
/**
 * True when unfolding bends `ids` keeps every closed loop (seam: two flanges touching without a bend)
 * open: a seam that is not ripped must not have an unfolded bend on the tree path between its flanges.
 */
export function seamsOpen(d, ids) {
  for (const s of d.seams || []) {
    if (s.ripped) continue;
    const ca = chain(d, s.a).map((b) => b.id), cb = chain(d, s.b).map((b) => b.id);
    const path = [...ca.filter((x) => !cb.includes(x)), ...cb.filter((x) => !ca.includes(x))];
    if (path.some((x) => ids.includes(x))) return false;
  }
  return true;
}
/** Half-plane filters [{n, c}] (n.p <= c keeps p). */
export const keepSeed = (hp, p) => hp.every((h) => V2.dot(h.n, p) <= h.c + 1e-9);

export { V, V2, apply, applyDir, inv, mul, fromFrame, I4 };
