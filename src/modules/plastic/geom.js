// Geometry helpers of the plastic features (no DOM: also used by node tests).
// 2D sketch chains (lines + arcs) -> exact planar faces (bands around a curve, regions swept from a
// curve), prisms, "to next" trimming (keep the pieces of a tool that touch its seed and end on a
// face), ray hits, junction edges for root fillets, revolved profiles.
import * as K from "../../kernel.js";

const V = K.V;
const R = K.R;
export const TOL = 1e-4;

// ---------------------------------------------------------------- 2D segments
// line {kind:'line', a:[u,v], b:[u,v]}   arc {kind:'arc', c:[u,v], r, t0, sw}  (sw signed sweep, rad)
const v2 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, s) => [a[0] * s, a[1] * s],
  len: (a) => Math.hypot(a[0], a[1]),
  norm: (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; },
  dot: (a, b) => a[0] * b[0] + a[1] * b[1],
  left: (a) => [-a[1], a[0]],
};
export { v2 };

const arcPt = (s, t) => [s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)];
export const segStart = (s) => (s.kind === "line" ? s.a : arcPt(s, s.t0));
export const segEnd = (s) => (s.kind === "line" ? s.b : arcPt(s, s.t0 + s.sw));
export const segMid = (s) => (s.kind === "line" ? v2.mul(v2.add(s.a, s.b), 0.5) : arcPt(s, s.t0 + s.sw / 2));
export const segLen = (s) => (s.kind === "line" ? v2.len(v2.sub(s.b, s.a)) : Math.abs(s.sw) * s.r);
/** Unit tangent at the start (0) / end (1) of a segment, in the travel direction. */
export function segTan(s, at = 0) {
  if (s.kind === "line") return v2.norm(v2.sub(s.b, s.a));
  const t = s.t0 + s.sw * at;
  const k = Math.sign(s.sw) || 1;
  return [-Math.sin(t) * k, Math.cos(t) * k];
}
export function segReverse(s) {
  if (s.kind === "line") return { kind: "line", a: s.b, b: s.a };
  return { kind: "arc", c: s.c, r: s.r, t0: s.t0 + s.sw, sw: -s.sw };
}

/** Lines / arcs / circles of sketch `sk` (ids) as 2D segments (unordered). Other curve types are skipped. */
export function sketchSegs(sk, ids) {
  const P = (id) => { const q = sk.points[id]; return q ? [q.x, q.y] : null; };
  const out = [];
  for (const id of ids || []) {
    const cv = sk.curves[id];
    if (!cv) continue;
    if (cv.type === "line") {
      const a = P(cv.p1), b = P(cv.p2);
      if (a && b && v2.len(v2.sub(b, a)) > 1e-9) out.push({ kind: "line", a, b, curve: id });
    } else if (cv.type === "arc") {
      const c = P(cv.c), a = P(cv.p1), b = P(cv.p2);
      if (!c || !a || !b) continue;
      const t0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
      let t1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
      while (t1 <= t0 + 1e-12) t1 += 2 * Math.PI;
      out.push({ kind: "arc", c, r: v2.len(v2.sub(a, c)), t0, sw: t1 - t0, curve: id });
    } else if (cv.type === "circle") {
      const c = P(cv.c);
      if (c && cv.r > 0) out.push({ kind: "arc", c, r: cv.r, t0: 0, sw: 2 * Math.PI, curve: id, full: true });
    }
  }
  return out;
}

/** Order segments head to tail. Returns {segs, closed}; throws when they are not one connected chain. */
export function chain2d(raw) {
  const close = (p, q) => v2.len(v2.sub(p, q)) < 1e-6;
  const left = raw.slice();
  if (!left.length) return { segs: [], closed: false };
  if (left.length === 1 && left[0].full) return { segs: left, closed: true };
  const touches = (p, g0) => left.some((g) => g !== g0 && (close(p, segStart(g)) || close(p, segEnd(g))));
  let i0 = left.findIndex((g) => !touches(segStart(g), g) || !touches(segEnd(g), g));
  if (i0 < 0) i0 = 0;
  let first = left[i0];
  if (touches(segStart(first), first) && !touches(segEnd(first), first)) first = segReverse(first);
  left.splice(i0, 1);
  const out = [first];
  while (left.length) {
    const end = segEnd(out[out.length - 1]);
    let i = left.findIndex((g) => close(segStart(g), end));
    if (i >= 0) { out.push(left.splice(i, 1)[0]); continue; }
    i = left.findIndex((g) => close(segEnd(g), end));
    if (i >= 0) { out.push(segReverse(left.splice(i, 1)[0])); continue; }
    throw new Error("The curves must form one connected chain");
  }
  return { segs: out, closed: close(segStart(out[0]), segEnd(out[out.length - 1])) };
}

/** Point at arc length fraction f (0..1) of a chain, with its tangent. */
export function chainPoint(segs, f = 0.5) {
  const total = segs.reduce((s, g) => s + segLen(g), 0);
  let left = total * f;
  for (const g of segs) {
    const L = segLen(g);
    if (left <= L + 1e-12 || g === segs[segs.length - 1]) {
      const k = L > 0 ? Math.max(0, Math.min(1, left / L)) : 0;
      if (g.kind === "line") return { p: v2.add(g.a, v2.mul(v2.sub(g.b, g.a), k)), t: segTan(g) };
      return { p: arcPt(g, g.t0 + g.sw * k), t: segTan(g, k) };
    }
    left -= L;
  }
  return { p: segStart(segs[0]), t: segTan(segs[0]) };
}

// ---------------------------------------------------------------- 3D edges / faces
const W = (pl, q) => K.toWorld(pl, q[0], q[1]);

function edge3(pl, s) {
  if (s.kind === "line") return R.makeLine(W(pl, s.a), W(pl, s.b));
  return R.makeThreePointArc(W(pl, segStart(s)), W(pl, segMid(s)), W(pl, segEnd(s)));
}
/** Planar face bounded by a closed loop of 2D segments on plane pl. */
export function loopFace(pl, loop) {
  const edges = loop.map((s) => edge3(pl, s));
  let w = null;
  try {
    w = R.assembleWire(edges);
    return R.makeFace(w);
  } finally { K.del(...edges, w); }
}
/** 3D edges of a 2D chain (caller deletes). */
export const chainEdges = (pl, segs) => segs.map((s) => edge3(pl, s));

/**
 * Faces of the band between left offsets o1 and o2 (o1 < o2) of each segment (lines: rectangles,
 * arcs: annular sectors). ext(i, end) -> extra length added at segment i's start (end 0) or end (1).
 */
export function bandFaces(pl, segs, o1, o2, ext = () => 0) {
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.kind === "line") {
      const t = segTan(s), nl = v2.left(t);
      const a = v2.sub(s.a, v2.mul(t, ext(i, 0))), b = v2.add(s.b, v2.mul(t, ext(i, 1)));
      const p = [v2.add(a, v2.mul(nl, o1)), v2.add(b, v2.mul(nl, o1)), v2.add(b, v2.mul(nl, o2)), v2.add(a, v2.mul(nl, o2))];
      out.push(K.polygonFace(p.map((q) => W(pl, q))));
    } else {
      const k = Math.sign(s.sw) || 1;
      const r1 = s.r - o1 * k, r2 = s.r - o2 * k;
      if (Math.min(r1, r2) <= 1e-6) throw new Error("The thickness is too large for the arc radius");
      const parts = Math.abs(s.sw) > Math.PI * 1.5 ? 2 : 1; // full circles: two halves
      for (let j = 0; j < parts; j++) {
        const sw = s.sw / parts, t0 = s.t0 + sw * j;
        const A = { kind: "arc", c: s.c, r: r1, t0, sw };
        const B = { kind: "arc", c: s.c, r: r2, t0: t0 + sw, sw: -sw };
        out.push(loopFace(pl, [A, { kind: "line", a: segEnd(A), b: segStart(B) }, B, { kind: "line", a: segEnd(B), b: segStart(A) }]));
      }
    }
  }
  return out;
}

/**
 * Faces of the region swept by each segment translated along the in-plane unit vector d by D (arcs are
 * split where their tangent is parallel to d so every piece is a simple region).
 */
export function sweptFaces(pl, segs, d, D) {
  const out = [];
  const off = v2.mul(d, D);
  const pieces = [];
  for (const s of segs) {
    if (s.kind === "line") { pieces.push(s); continue; }
    // split angles where the radius is perpendicular to d
    const base = Math.atan2(d[1], d[0]);
    const cuts = [];
    for (let k = -4; k <= 4; k++) {
      const t = base + Math.PI / 2 + k * Math.PI;
      const f = (t - s.t0) / s.sw;
      if (f > 1e-6 && f < 1 - 1e-6) cuts.push(f);
    }
    cuts.sort((x, y) => x - y);
    let f0 = 0;
    for (const f of [...cuts, 1]) { pieces.push({ kind: "arc", c: s.c, r: s.r, t0: s.t0 + s.sw * f0, sw: s.sw * (f - f0) }); f0 = f; }
  }
  for (const s of pieces) {
    const a = segStart(s), b = segEnd(s);
    if (s.kind === "line" && Math.abs(v2.dot(v2.norm(v2.sub(b, a)), v2.left(d))) < 1e-9) continue; // parallel to d
    const moved = s.kind === "line" ? { kind: "line", a: v2.add(b, off), b: v2.add(a, off) } : { kind: "arc", c: v2.add(s.c, off), r: s.r, t0: s.t0 + s.sw, sw: -s.sw };
    out.push(loopFace(pl, [s, { kind: "line", a: b, b: v2.add(b, off) }, moved, { kind: "line", a: v2.add(a, off), b: a }]));
  }
  return out;
}

/** Fused prisms of faces along vec, starting `start` (a vector) away from the faces. Faces are deleted. */
export function prismUnion(faces, vec, start = null) {
  const solids = [];
  try {
    for (const f of faces) {
      const p = K.prism(f, vec);
      if (start && V.len(start) > 1e-12) { solids.push(K.translated(p, start)); K.del(p); } else solids.push(p);
    }
  } finally { K.del(...faces); }
  return fuseAll(solids);
}
/** Fuse a list of solids (inputs deleted). */
export function fuseAll(list) {
  const xs = list.filter(Boolean);
  if (!xs.length) return null;
  let s = xs[0];
  for (const t of xs.slice(1)) { const n = K.fuse(s, t); K.del(s, t); s = n; }
  return s;
}

// ---------------------------------------------------------------- queries
/** Min distance between shapes (Infinity on failure). */
export function dist(a, b) { try { return K.shapeDistance(a, b); } catch { return Infinity; } }

/** Pieces (solids) of `shape` that touch any of the seed shapes. Non-kept solids are deleted. */
export function piecesTouching(shape, seeds, tol = TOL) {
  const keep = [];
  for (const s of K.solidsOf(shape)) {
    if (seeds.some((q) => dist(s, q) < tol)) keep.push(s); else K.del(s);
  }
  return keep;
}

/** Extent [min, max] of a shape's bounding box projected on direction d from origin o. */
export function extentAlong(shape, o, d) {
  const bb = K.bboxOf(shape);
  if (!bb) return [0, 0];
  let lo = Infinity, hi = -Infinity;
  for (const x of [bb.min[0], bb.max[0]]) for (const y of [bb.min[1], bb.max[1]]) for (const z of [bb.min[2], bb.max[2]]) {
    const t = V.dot(V.sub([x, y, z], o), d);
    lo = Math.min(lo, t); hi = Math.max(hi, t);
  }
  return [lo, hi];
}

/** Does the segment p -> p + dir*len touch the shape? */
function segTouches(shape, p, dir, len, eps) {
  const a = V.add(p, V.mul(dir, eps)), b = V.add(p, V.mul(dir, Math.max(len, eps * 2)));
  const e = R.makeLine(a, b);
  try { return dist(e, shape) < 1e-7; } finally { K.del(e); }
}
/**
 * First hit of the ray p + t*dir (eps < t <= maxLen) on any of `bodies` ([{id, shape}]):
 * {id, t} of the nearest one, or null. Bisection on segment / shape distance.
 */
export function rayHit(bodies, p, dir, maxLen, eps = 1e-3) {
  const d = V.norm(dir);
  let best = null;
  for (const b of bodies) {
    if (!segTouches(b.shape, p, d, maxLen, eps)) continue;
    let lo = eps, hi = maxLen;
    for (let i = 0; i < 30 && hi - lo > 1e-5; i++) {
      const m = (lo + hi) / 2;
      if (segTouches(b.shape, p, d, m, eps)) hi = m; else lo = m;
    }
    if (!best || hi < best.t) best = { id: b.id, t: hi };
  }
  return best;
}

/** Is point p inside (or on) the solid? */
export function inside(shape, p) {
  const pr = K.pointProbe(p);
  try { return pr.dist(shape) < 1e-7; } finally { pr.delete(); }
}

/**
 * Edges of `result` where a joined tool meets the original body: on the tool's edges, on the body's
 * surface, and not one of the body's own edges (root edges of ribs, bosses, lips).
 */
export function junctionEdges(result, tool, body) {
  const out = [];
  const tEdges = K.edgesOf(tool), bEdges = K.edgesOf(body);
  let tc = null, bc = null;
  try {
    tc = R.makeCompound(tEdges);
    bc = R.makeCompound(bEdges);
    for (const e of K.edgesOf(result)) {
      let keep = false;
      try {
        const m = K.edgeMid(e);
        const pr = K.pointProbe(m);
        try { keep = pr.dist(tc) < TOL && pr.dist(body) < TOL && pr.dist(bc) > TOL; } finally { pr.delete(); }
      } catch { keep = false; }
      if (keep) out.push(e); else K.del(e);
    }
  } finally { K.del(...tEdges, ...bEdges, tc, bc); }
  return out;
}

/** Fillet the junction edges of a joined tool; {shape, warning}. `result` is replaced when it worked. */
export function filletJunction(result, tool, body, r) {
  if (!(r > 1e-6)) return { shape: result };
  const edges = junctionEdges(result, tool, body);
  if (!edges.length) return { shape: result };
  try {
    const s = K.filletEdges(result, edges, r);
    if (!s || K.isEmptyShape(s) || !(K.volumeOf(s) > 0)) { K.del(s); return { shape: result, warning: "The fillet could not be applied; try a smaller fillet radius" }; }
    K.del(result);
    return { shape: s };
  } catch {
    return { shape: result, warning: "The fillet could not be applied; try a smaller fillet radius" };
  } finally { K.del(...edges); }
}

// ---------------------------------------------------------------- revolved profiles
/**
 * Solid of revolution of a closed (r, z) polyline about the axis through o along d (z along d,
 * r measured along any perpendicular). Points with r = 0 lie on the axis.
 */
export function revolveRZ(o, d, pts) {
  d = V.norm(d);
  let u = V.cross(d, [0, 0, 1]);
  if (V.len(u) < 1e-6) u = V.cross(d, [1, 0, 0]);
  u = V.norm(u);
  const w = pts.map(([r, z]) => V.add(o, V.add(V.mul(u, r), V.mul(d, z))));
  const f = K.polygonFace(w);
  try { return K.revolveFace(f, o, d, 360); } finally { K.del(f); }
}

/** Unit vector perpendicular to n (stable choice). */
export function perp(n) {
  let u = V.cross(n, [0, 0, 1]);
  if (V.len(u) < 1e-6) u = V.cross(n, [1, 0, 0]);
  return V.norm(u);
}

/** Box-like prism of a rectangle (center c, axes a (length la) and b (length lb)) along vector h. */
export function boxSolid(c, a, la, b, lb, h) {
  const A = V.mul(V.norm(a), la / 2), B = V.mul(V.norm(b), lb / 2);
  const p = [V.sub(V.sub(c, A), B), V.sub(V.add(c, A), B), V.add(V.add(c, A), B), V.add(V.sub(c, A), B)];
  const f = K.polygonFace(p);
  try { return K.prism(f, h); } finally { K.del(f); }
}

/** Prism of a 3D polygon along h. */
export function polyPrism(pts, h) {
  const f = K.polygonFace(pts);
  try { return K.prism(f, h); } finally { K.del(f); }
}

/** Thicken a face by `t` along its normal (OCCT MakeThickSolidBySimple; t may be negative). */
export function thickenFace(face, t) {
  const O = R.getOC();
  const b = new O.BRepOffsetAPI_MakeThickSolid();
  try {
    b.MakeThickSolidBySimple(face.wrapped, t);
    const raw = b.Shape();
    let s = R.cast(raw);
    if (!R.isShape3D(s)) { K.del(s); throw new Error("thicken failed"); }
    // the solid comes out inside-out for one offset side: turn it the right way round
    if (K.volumeOf(s) < 0) { const rv = R.cast(s.wrapped.Reversed()); K.del(s); s = rv; }
    return s;
  } finally { K.del(b); }
}
