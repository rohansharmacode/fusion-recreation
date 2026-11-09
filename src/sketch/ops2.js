// Sketch operations added in round 7 (re-exported by sketch.js, so they are app.S.*):
// control point splines, conic curves, arc slots, 2- / 3-tangent circles, Break, Sketch Scale,
// sketch Rectangular / Circular Pattern, Polygon constraint loops, offset of free-form curves,
// multi-polyline display data (text, 3D curves).
import { curvePoints } from "./solver.js";
import { curveGeom, intersect } from "./regions.js";
import { pcurveNearest, pcurveSamples, splineFit, bezierAt } from "./curves.js";
import { clampedKnots, cvDegree, splitConic, textContours, contourPolyline, asParametric, conicWeight } from "./curves2.js";
import { patternValues } from "./solver2.js";

const TAU = Math.PI * 2;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const nid = (sk, prefix) => `${prefix}${sk.nid++}`;
const P2 = (sk, id) => [sk.points[id].x, sk.points[id].y];
const newPt = (sk, p, extra = {}) => { const id = nid(sk, "p"); sk.points[id] = { x: p[0], y: p[1], ...extra }; return id; };
const newCon = (sk, type, refs, extra = {}) => { const c = { id: nid(sk, "k"), type, refs, ...extra }; sk.constraints.push(c); return c; };
const newLine = (sk, a, b, cons = false) => { const id = nid(sk, "l"); sk.curves[id] = { type: "line", p1: a, p2: b, cons }; return id; };
const newArc = (sk, c, a, b, cons = false) => { const id = nid(sk, "a"); sk.curves[id] = { type: "arc", c, p1: a, p2: b, r: Math.hypot(sk.points[a].x - sk.points[c].x, sk.points[a].y - sk.points[c].y), cons }; return id; };
const newCircle = (sk, c, r, cons = false) => { const id = nid(sk, "c"); sk.curves[id] = { type: "circle", c, r, cons }; return id; };

// ---------------------------------------------------------------------------
// new curves
// ---------------------------------------------------------------------------
/** Control Point Spline through control point ids pts (degree 3 or 5, Fusion's default 3 in this recreation's palette). */
export function addCVSpline(sk, pts, opts = {}) {
  const id = nid(sk, "s");
  sk.curves[id] = { type: "cvspline", pts: [...pts], degree: opts.degree === 5 ? 5 : 3, cons: !!opts.cons, ...(opts.closed ? { closed: true } : {}) };
  if (opts.knots) sk.curves[id].knots = opts.knots;
  return id;
}
/** Conic Curve from p1 to p2 with vertex point v and Rho. */
export function addConic(sk, p1, p2, v, rho = 0.5, cons = false) {
  const id = nid(sk, "n");
  sk.curves[id] = { type: "conic", p1, p2, v, rho: Math.max(0.01, Math.min(0.99, Number(rho) || 0.5)), cons };
  return id;
}

/**
 * Arc slot around centre C (sketch coords) with centre-arc radius R from angle a0 sweeping `sweep`
 * (signed radians) and width w. Creates the construction centre arc, two slot arcs, two end caps
 * and their tangency / equal constraints. opts.center: reuse a point id for C. Returns ids.
 */
export function addArcSlot(sk, C, R, a0, sweep, w, opts = {}) {
  const r = w / 2;
  if (!(R > r + 1e-9) || !(r > 1e-9) || Math.abs(sweep) < 1e-6 || Math.abs(sweep) >= TAU - 1e-6) return null;
  // run the slot counter-clockwise
  let s0 = a0, s1 = a0 + sweep;
  if (sweep < 0) { s0 = a0 + sweep; s1 = a0; }
  const dir = (a) => [Math.cos(a), Math.sin(a)];
  const at = (rad, a) => add(C, mul(dir(a), rad));
  const ic = opts.center && sk.points[opts.center] ? opts.center : newPt(sk, C);
  const iS = opts.startId && sk.points[opts.startId] ? opts.startId : newPt(sk, at(R, s0));
  const iE = opts.endId && sk.points[opts.endId] ? opts.endId : newPt(sk, at(R, s1));
  const Os = newPt(sk, at(R + r, s0)), Is = newPt(sk, at(R - r, s0));
  const Oe = newPt(sk, at(R + r, s1)), Ie = newPt(sk, at(R - r, s1));
  const cons = !!opts.cons;
  const axis = newArc(sk, ic, iS, iE, true);
  sk.curves[axis].r = R;
  const outer = newArc(sk, ic, Os, Oe, cons); sk.curves[outer].r = R + r;
  const inner = newArc(sk, ic, Is, Ie, cons); sk.curves[inner].r = R - r;
  const capS = newArc(sk, iS, Is, Os, cons); sk.curves[capS].r = r;
  const capE = newArc(sk, iE, Oe, Ie, cons); sk.curves[capE].r = r;
  newCon(sk, "tangent", [outer, capS], { mode: "int" });
  newCon(sk, "tangent", [inner, capS]);
  newCon(sk, "tangent", [outer, capE], { mode: "int" });
  newCon(sk, "tangent", [inner, capE]);
  newCon(sk, "equal", [capS, capE]);
  return { center: ic, ends: [iS, iE], axis, arcs: [outer, inner], caps: [capS, capE] };
}

// ---------------------------------------------------------------------------
// tangent circles
// ---------------------------------------------------------------------------
/** Infinite line through a sketch line: {a, u (unit), n (unit normal)}. */
function lineInf(sk, id) {
  const cv = sk.curves[id];
  const a = P2(sk, cv.p1), b = P2(sk, cv.p2);
  const u = unit(sub(b, a));
  return { a, b, u, n: [-u[1], u[0]] };
}
/** 2-Tangent Circle: centre of the radius-r circle tangent to lines l1, l2 nearest the cursor q. */
export function circleTanTan(sk, l1, l2, r, q) {
  const A = lineInf(sk, l1), B = lineInf(sk, l2);
  const cands = [];
  if (Math.abs(cross(A.u, B.u)) < 1e-9) {
    // parallel lines: the circle fits between them; it slides along the middle line
    const d = dot(sub(B.a, A.a), A.n);
    const rr = Math.abs(d) / 2;
    const mid = add(A.a, mul(A.n, d / 2));
    const c = add(mid, mul(A.u, dot(sub(q, mid), A.u)));
    return { c, r: rr, parallel: true };
  }
  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
    const pa = add(A.a, mul(A.n, s1 * r)), pb = add(B.a, mul(B.n, s2 * r));
    const den = cross(A.u, B.u);
    const t = cross(sub(pb, pa), B.u) / den;
    cands.push(add(pa, mul(A.u, t)));
  }
  cands.sort((x, y) => len(sub(x, q)) - len(sub(y, q)));
  return { c: cands[0], r };
}
/** 3-Tangent Circle: the circle tangent to three lines in the region of the cursor q. */
export function circleThreeTan(sk, ids, q) {
  const L = ids.map((id) => lineInf(sk, id));
  const sols = [];
  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) for (const s3 of [-1, 1]) {
    // n_i . c - n_i . a_i = s_i r
    const s = [s1, s2, s3];
    const M = L.map((l, i) => [l.n[0], l.n[1], -s[i]]);
    const rhs = L.map((l) => dot(l.n, l.a));
    const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det3(M);
    if (Math.abs(D) < 1e-12) continue;
    const col = (k) => M.map((row, i) => row.map((v, j) => (j === k ? rhs[i] : v)));
    const cx = det3(col(0)) / D, cy = det3(col(1)) / D, r = det3(col(2)) / D;
    if (!(r > 1e-9)) continue;
    if (sols.some((o) => len(sub(o.c, [cx, cy])) < 1e-7 && Math.abs(o.r - r) < 1e-7)) continue;
    sols.push({ c: [cx, cy], r });
  }
  if (!sols.length) return null;
  // the circle whose tangent point on the last picked line is nearest the cursor (the pick point)
  const l3 = L[2];
  const foot = (o) => sub(o.c, mul(l3.n, dot(l3.n, o.c) - dot(l3.n, l3.a)));
  const score = (o) => len(sub(foot(o), q));
  sols.sort((a, b) => (Math.abs(score(a) - score(b)) > 1e-6 ? score(a) - score(b) : len(sub(a.c, q)) - len(sub(b.c, q))));
  return sols[0];
}

// ---------------------------------------------------------------------------
// B-spline helpers (knot insertion for Break / Trim of control point splines)
// ---------------------------------------------------------------------------
function insertKnot(P, U, p, u) {
  let k = p;
  while (k < U.length - p - 2 && !(U[k] <= u && u < U[k + 1])) k++;
  const Q = [];
  for (let i = 0; i <= P.length; i++) {
    if (i <= k - p) Q.push(P[i]);
    else if (i >= k + 1) Q.push(P[i - 1]);
    else {
      const a = (u - U[i]) / ((U[i + p] - U[i]) || 1e-12);
      Q.push([(1 - a) * P[i - 1][0] + a * P[i][0], (1 - a) * P[i - 1][1] + a * P[i][1]]);
    }
  }
  const V = [...U.slice(0, k + 1), u, ...U.slice(k + 1)];
  return { P: Q, U: V };
}
/** Control points + knots of the clamped B-spline on [u0, u1] of (P, U, p). */
export function bsplineSegment(P, U, p, u0, u1) {
  let A = P, K = U;
  const lo = U[p], hi = U[U.length - p - 1];
  const interior = (u) => u > lo + 1e-10 && u < hi - 1e-10;
  for (const u of [u0, u1]) {
    if (!interior(u)) continue;
    let m = K.filter((x) => Math.abs(x - u) < 1e-10).length;
    while (m < p) { const r = insertKnot(A, K, p, u); A = r.P; K = r.U; m++; }
  }
  const first = (u) => K.findIndex((x) => Math.abs(x - u) < 1e-10);
  const s0 = interior(u0) ? first(u0) - 1 : 0;
  const e0 = interior(u1) ? first(u1) - 1 : A.length - 1;
  const ctrl = A.slice(s0, e0 + 1);
  const inner = [...new Set(K.filter((x) => x > u0 + 1e-10 && x < u1 - 1e-10).map((x) => +x.toFixed(12)))];
  const knots = [];
  for (let i = 0; i <= p; i++) knots.push(u0);
  for (const x of inner) { const m = K.filter((y) => Math.abs(y - x) < 1e-10).length; for (let i = 0; i < m; i++) knots.push(x); }
  for (let i = 0; i <= p; i++) knots.push(u1);
  return { P: ctrl, U: knots };
}
/** Knot vector of a control point spline (stored or clamped uniform). */
export function cvKnots(cv, n, p) {
  if (Array.isArray(cv.knots) && cv.knots.length === n + p + 1) return cv.knots.slice();
  return clampedKnots(n, p);
}

// ---------------------------------------------------------------------------
// splitting curves (Break) and trimming the new curve types
// ---------------------------------------------------------------------------
/** Parameter ranges [[a, b]] of the pcurve geom g (t units) -> new curves of the same type as cvspline / conic id. */
export function splitCurve2(sk, id, g, ranges) {
  const cv = sk.curves[id];
  const ids = [];
  const T = g.T;
  if (cv.type === "conic") {
    const A = P2(sk, cv.p1), V = P2(sk, cv.v), B = P2(sk, cv.p2);
    ranges.forEach(([a, b], i) => {
      const s0 = Math.max(0, a / T), s1 = Math.min(1, b / T);
      let piece = { A, V, B, rho: cv.rho };
      if (s0 > 1e-9) piece = splitConic(piece.A, piece.V, piece.B, piece.rho, s0)[1];
      const sl = s0 > 1e-9 ? (s1 - s0) / (1 - s0) : s1;
      if (sl < 1 - 1e-9) piece = splitConic(piece.A, piece.V, piece.B, piece.rho, sl)[0];
      const p1 = s0 <= 1e-9 ? cv.p1 : newPt(sk, piece.A);
      const p2 = s1 >= 1 - 1e-9 ? cv.p2 : newPt(sk, piece.B);
      const v = newPt(sk, piece.V);
      if (i === 0) { cv.p1 = p1; cv.p2 = p2; cv.v = v; cv.rho = piece.rho; ids.push(id); }
      else { const nidc = nid(sk, "n"); sk.curves[nidc] = { type: "conic", p1, p2, v, rho: piece.rho, cons: cv.cons }; ids.push(nidc); }
    });
    return ids;
  }
  if (cv.type === "cvspline") {
    const P = cv.pts.map((q) => P2(sk, q));
    const p = cvDegree(cv, P.length);
    const U = cvKnots(cv, P.length, p);
    // geom parameter -> knot parameter (each Bezier span covers g.pieces units of t)
    const uOf = (t) => {
      const sp = g.uSpans || [];
      if (!sp.length) return U[p] + (t / T) * (U[U.length - p - 1] - U[p]);
      const per = g.pieces || 1;
      let i = Math.floor(t / per);
      if (i >= sp.length) i = sp.length - 1;
      if (i < 0) i = 0;
      const f = Math.max(0, Math.min(1, (t - i * per) / per));
      return sp[i][0] + (sp[i][1] - sp[i][0]) * f;
    };
    ranges.forEach(([a, b], i) => {
      const seg = bsplineSegment(P, U, p, uOf(a), uOf(b));
      const pts = seg.P.map((q, k) => (k === 0 && a <= 1e-9 ? cv.pts[0] : k === seg.P.length - 1 && b >= T - 1e-9 ? cv.pts[cv.pts.length - 1] : newPt(sk, q)));
      if (i === 0) { cv.pts = pts; cv.knots = seg.U; ids.push(id); }
      else { const sid = nid(sk, "s"); sk.curves[sid] = { type: "cvspline", pts, degree: cv.degree, knots: seg.U, cons: cv.cons }; ids.push(sid); }
    });
    return ids;
  }
  return [id];
}

/**
 * Trim / Break of a closed control point spline: the periodic spline opens at the cuts and becomes open
 * clamped splines over `ranges` ([a, b] in geom t units; b < a or b > T wraps past the seam). The first
 * piece keeps `id`; pieces that meet share their cut point. Returns the piece ids.
 */
export function splitClosedCv(sk, id, g, ranges) {
  const cv = sk.curves[id];
  const P = cv.pts.map((q) => P2(sk, q));
  const n = P.length;
  const p = cvDegree(cv, n);
  // two turns of the periodic spline (cvBeziers' closed layout repeated) so a range can cross the seam
  const Q = [...P, ...P, ...P.slice(0, p)];
  const U = [];
  for (let i = 0; i < Q.length + p + 1; i++) U.push(i);
  const T = g.T;
  const sp = g.uSpans || [];
  const per = g.pieces || 1;
  const wrap = (t) => ((t % T) + T) % T;
  const uOf = (t) => {
    const w = wrap(t);
    if (!sp.length) return p + (w / T) * n;
    const i = Math.min(sp.length - 1, Math.max(0, Math.floor(w / per)));
    const f = Math.max(0, Math.min(1, (w - i * per) / per));
    return sp[i][0] + (sp[i][1] - sp[i][0]) * f;
  };
  const cuts = new Map();
  const cutPt = (t, q) => { const k = wrap(t).toFixed(9); if (!cuts.has(k)) cuts.set(k, newPt(sk, q)); return cuts.get(k); };
  const ids = [];
  ranges.forEach(([a, b], i) => {
    const ua = uOf(a);
    let ub = uOf(b);
    if (ub <= ua + 1e-9) ub += n;
    const seg = bsplineSegment(Q, U, p, ua, ub);
    const last = seg.P.length - 1;
    const pts = seg.P.map((q, k) => (k === 0 ? cutPt(a, q) : k === last ? cutPt(b, q) : newPt(sk, q)));
    if (i === 0) { cv.pts = pts; cv.knots = seg.U; delete cv.closed; ids.push(id); }
    else { const sid = nid(sk, "s"); sk.curves[sid] = { type: "cvspline", pts, degree: cv.degree, knots: seg.U, cons: cv.cons }; ids.push(sid); }
  });
  return ids;
}

/**
 * Break: split curve `id` at the intersections bounding the piece under q (Fusion's Break keeps
 * every piece). Returns the ids of the pieces, or null when nothing crosses the curve.
 */
export function breakAt(S, sk, id, q) {
  const cv = sk.curves[id];
  if (!cv || cv.type === "point" || cv.type === "text" || cv.type === "c3d") return null;
  const piece = S.trimPiece(sk, id, q);
  if (piece.whole) return null;
  const { g, t0, t1 } = piece;
  const dropDims = (cid) => { sk.constraints = sk.constraints.filter((c) => !(c.refs.includes(cid) && ["distance", "diameter", "radius"].includes(c.type) && !c.driven)); };
  if (g.kind === "line") {
    const at = (t) => [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t];
    const cuts = [t0, t1].filter((t) => t > 1e-9 && t < 1 - 1e-9);
    const pts = cuts.map((t) => newPt(sk, at(t)));
    const ends = [cv.p1, ...pts, cv.p2];
    dropDims(id);
    const ids = [id];
    cv.p2 = ends[1];
    for (let k = 1; k + 1 < ends.length; k++) {
      const nl = newLine(sk, ends[k], ends[k + 1], cv.cons);
      newCon(sk, "collinear", [id, nl]);
      ids.push(nl);
    }
    return ids;
  }
  if (g.kind === "circle") {
    const P = (a) => [g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)];
    const a = newPt(sk, P(t0)), b = newPt(sk, P(t1));
    sk.curves[id] = { type: "arc", c: cv.c, p1: a, p2: b, r: cv.r, cons: cv.cons };
    const other = newArc(sk, cv.c, b, a, cv.cons);
    sk.curves[other].r = cv.r;
    newCon(sk, "equal", [id, other]);
    return [id, other];
  }
  if (g.kind === "arc") {
    const P = (t) => [g.c[0] + g.r * Math.cos(g.a0 + t), g.c[1] + g.r * Math.sin(g.a0 + t)];
    const cuts = [t0, t1].filter((t) => t > 1e-9 && t < g.sweep - 1e-9);
    const pts = cuts.map((t) => newPt(sk, P(t)));
    const ends = [cv.p1, ...pts, cv.p2];
    dropDims(id);
    const ids = [id];
    cv.p2 = ends[1];
    for (let k = 1; k + 1 < ends.length; k++) {
      const na = newArc(sk, cv.c, ends[k], ends[k + 1], cv.cons);
      sk.curves[na].r = cv.r;
      newCon(sk, "equal", [id, na]);
      ids.push(na);
    }
    return ids;
  }
  // free-form curves: every piece becomes its own curve
  const T = g.T;
  let ranges;
  if (g.closed) ranges = [[t0, t1], [t1, t0 + T]];
  else ranges = [[0, t0], [t0, t1], [t1, T]].filter(([a, b]) => b - a > 1e-7 * Math.max(1, T));
  if (ranges.length < 2) return null;
  dropDims(id);
  if (cv.type === "cvspline" || cv.type === "conic") {
    if (cv.type === "cvspline" && cv.closed) return splitClosedCv(sk, id, g, ranges);
    return splitCurve2(sk, id, g, ranges);
  }
  return S.splitFreeform(sk, id, g, ranges);
}

// ---------------------------------------------------------------------------
// Sketch Scale
// ---------------------------------------------------------------------------
/**
 * Scale curves (and their points) by k about base point bp ([u, v]); driving dimensions that only
 * involve scaled entities get their values scaled (expressions replaced by the new value).
 */
export function scaleEntities(sk, curveIds, pointIds, bp, k, params, fmtLen) {
  // a curve with a fixed point keeps its size and its points (scaling its radius or dimensions around a
  // point that cannot move would distort it)
  const isFixed = (p) => !!(sk.points[p] && sk.points[p].fixed);
  curveIds = curveIds.filter((id) => { const cv = sk.curves[id]; return cv && !curvePoints(cv).some(isFixed); });
  const pts = new Set(pointIds || []);
  for (const id of curveIds) { const cv = sk.curves[id]; if (cv) for (const p of curvePoints(cv)) pts.add(p); }
  for (const p of pts) {
    const P = sk.points[p];
    if (!P || P.fixed) continue;
    P.x = bp[0] + (P.x - bp[0]) * k;
    P.y = bp[1] + (P.y - bp[1]) * k;
  }
  const scaled = new Set([...curveIds]);
  for (const id of curveIds) { const cv = sk.curves[id]; if (cv && cv.r !== undefined) cv.r *= k; if (cv && cv.type === "text" && Number(cv.size) > 0) cv.size = Number(cv.size) * k; }
  const inSet = (r) => scaled.has(r) || pts.has(r);
  for (const c of sk.constraints) {
    if (c.expr === undefined || c.driven || !["distance", "pointLine", "radius", "diameter"].includes(c.type)) continue;
    if (!c.refs.every(inSet)) continue;
    let v = NaN;
    try { v = params.eval(c.expr, "length"); } catch { v = NaN; }
    if (Number.isFinite(v)) c.expr = fmtLen(v * k);
  }
  return pts.size;
}

// ---------------------------------------------------------------------------
// sketch patterns
// ---------------------------------------------------------------------------
/** Copy curves with a point transform tf([u,v]) -> [u,v]. Returns {curves:{src:copy}, points:{src:copy}}. */
function copyCurves(sk, ids, tf) {
  const pmap = {}, cmap = {};
  const mp = (pid) => { if (pmap[pid]) return pmap[pid]; const P = sk.points[pid]; pmap[pid] = newPt(sk, tf([P.x, P.y])); return pmap[pid]; };
  for (const id of ids) {
    const cv = sk.curves[id];
    if (!cv) continue;
    const c = JSON.parse(JSON.stringify(cv));
    delete c.proj;
    if (c.type === "line") { c.p1 = mp(cv.p1); c.p2 = mp(cv.p2); }
    else if (c.type === "circle") c.c = mp(cv.c);
    else if (c.type === "arc") { c.c = mp(cv.c); c.p1 = mp(cv.p1); c.p2 = mp(cv.p2); }
    else if (c.type === "point") c.p = mp(cv.p);
    else if (c.type === "spline" || c.type === "cvspline") { c.pts = cv.pts.map(mp); delete c.hd; delete c.hs; delete c.hk; if (c.tan0) c.tan0 = sub(tf(add(P2(sk, cv.pts[0]), cv.tan0)), tf(P2(sk, cv.pts[0]))); if (c.tan1) c.tan1 = sub(tf(add(P2(sk, cv.pts[cv.pts.length - 1]), cv.tan1)), tf(P2(sk, cv.pts[cv.pts.length - 1]))); }
    else if (c.type === "ellipse") { c.c = mp(cv.c); c.a = mp(cv.a); c.b = mp(cv.b); }
    else if (c.type === "earc") { c.c = mp(cv.c); c.a = mp(cv.a); c.b = mp(cv.b); c.p1 = mp(cv.p1); c.p2 = mp(cv.p2); }
    else if (c.type === "conic") { c.p1 = mp(cv.p1); c.p2 = mp(cv.p2); c.v = mp(cv.v); }
    else continue;
    const k = nid(sk, id.replace(/[0-9]+$/, "") || "c");
    sk.curves[k] = c;
    cmap[id] = k;
  }
  return { curves: cmap, points: pmap };
}

/** Points referenced by the pattern source curves. */
const srcPointsOf = (sk, ids) => [...new Set(ids.flatMap((id) => (sk.curves[id] ? curvePoints(sk.curves[id]) : [])))];

/** Instance index lists of a pattern (rect: [[i, j]], circ: [k]) excluding the original. */
export function patternInstances(c, vals) {
  const out = [];
  if (c.type === "rpattern") {
    const r1 = c.sym1 ? [-(vals.q1 - 1), vals.q1 - 1] : [0, vals.q1 - 1];
    const r2 = c.sym2 ? [-(vals.q2 - 1), vals.q2 - 1] : [0, vals.q2 - 1];
    for (let i = r1[0]; i <= r1[1]; i++) for (let j = r2[0]; j <= r2[1]; j++) if (i || j) out.push([i, j]);
  } else {
    if (c.angType === "sym") { for (let k = -(vals.q - 1); k <= vals.q - 1; k++) if (k) out.push([k]); }
    else for (let k = 1; k < vals.q; k++) out.push([k]);
  }
  return out;
}
const instKey = (ix) => ix.join(",");

/**
 * (Re)build the copies of pattern constraint c (stored in sk.constraints): old copies are removed and
 * new ones created at the current values. Internal constraints of the source (equal, tangent, ...)
 * are copied for each instance. Returns the pattern constraint.
 */
export function buildPattern(sk, c, params) {
  const vals = patternValues(c, params);
  // remove old copies
  const old = new Set(c.copies || []);
  if (old.size) {
    for (const id of old) delete sk.curves[id];
    sk.constraints = sk.constraints.filter((k) => k === c || !k.patternOf || k.patternOf !== c.id);
    const used = new Set(["o"]);
    for (const cv of Object.values(sk.curves)) for (const p of curvePoints(cv)) used.add(p);
    for (const p of Object.keys(sk.points)) if (!used.has(p) && !sk.points[p].keep && !sk.points[p].origin) delete sk.points[p];
  }
  const src = c.src.filter((id) => sk.curves[id]);
  c.src = src;
  c.srcPts = srcPointsOf(sk, src);
  c.pairs = [];
  c.rpairs = [];
  c.copies = [];
  const sup = new Set((c.sup || []).map(instKey));
  const srcSet = new Set(src);
  const inner = sk.constraints.filter((k) => k !== c && !k.patternOf && k.refs.length && k.refs.every((r) => srcSet.has(r) || c.srcPts.includes(r)) && ["equal", "tangent", "parallel", "perpendicular", "horizontal", "vertical", "coincident", "onCurve", "midpoint", "concentric", "collinear", "smooth"].includes(k.type));
  const u1 = c.dir1 && c.dir1.line && sk.curves[c.dir1.line] ? unit(sub(P2(sk, sk.curves[c.dir1.line].p2), P2(sk, sk.curves[c.dir1.line].p1))) : [Math.cos((c.dir1 && c.dir1.ang) || 0), Math.sin((c.dir1 && c.dir1.ang) || 0)];
  const u1s = c.dir1 && c.dir1.rev ? mul(u1, -1) : u1;
  let u2 = c.dir2 && c.dir2.line && sk.curves[c.dir2.line] ? unit(sub(P2(sk, sk.curves[c.dir2.line].p2), P2(sk, sk.curves[c.dir2.line].p1))) : [-u1s[1], u1s[0]];
  if (c.dir2 && c.dir2.rev) u2 = mul(u2, -1);
  const C = c.type === "cpattern" && sk.points[c.center] ? P2(sk, c.center) : null;
  for (const ix of patternInstances(c, vals)) {
    if (sup.has(instKey(ix))) continue;
    let tf;
    if (c.type === "rpattern") {
      const off = add(mul(u1s, ix[0] * vals.step1), mul(u2, ix[1] * vals.step2));
      tf = (p) => add(p, off);
    } else {
      if (!C) break;
      const th = ix[0] * vals.step * (c.flip ? -1 : 1);
      const cs = Math.cos(th), sn = Math.sin(th);
      tf = (p) => { const d = sub(p, C); return [C[0] + cs * d[0] - sn * d[1], C[1] + sn * d[0] + cs * d[1]]; };
    }
    const m = copyCurves(sk, src, tf);
    for (const [s, k] of Object.entries(m.points)) c.pairs.push([s, k, ...ix]);
    for (const [s, k] of Object.entries(m.curves)) {
      c.copies.push(k);
      if (sk.curves[s].r !== undefined && sk.curves[k].r !== undefined) c.rpairs.push([s, k]);
    }
    const mapRef = (r) => m.curves[r] || m.points[r] || null;
    for (const k of inner) {
      if (k.type === "horizontal" || k.type === "vertical") { if (c.type === "cpattern") continue; }
      const refs = k.refs.map(mapRef);
      if (refs.some((x) => !x)) continue;
      const { id: _i, refs: _r, param: _p, expr: _e, ...rest } = k;
      void _i; void _r; void _p; void _e;
      newCon(sk, k.type, refs, { ...rest, patternOf: c.id, internal: true });
    }
  }
  c.refs = [...new Set([...c.srcPts, ...c.pairs.map((q) => q[1]), ...(c.center ? [c.center] : []), ...(c.dir1 && c.dir1.line ? [c.dir1.line] : []), ...(c.dir2 && c.dir2.line ? [c.dir2.line] : [])])].filter((r) => sk.points[r] || sk.curves[r]);
  return c;
}

/** Create a Rectangular / Circular sketch pattern constraint and its copies. */
export function addPattern(sk, spec, params) {
  const c = { id: nid(sk, "k"), refs: [], ...spec };
  sk.constraints.push(c);
  buildPattern(sk, c, params);
  return c;
}

/** Remove a pattern: its copies (and internal constraints) go, the source stays. */
export function removePattern(sk, cid) {
  const c = sk.constraints.find((k) => k.id === cid);
  if (!c) return false;
  const pts = new Set();
  for (const id of c.copies || []) { const cv = sk.curves[id]; if (cv) for (const p of curvePoints(cv)) pts.add(p); delete sk.curves[id]; }
  sk.constraints = sk.constraints.filter((k) => k !== c && k.patternOf !== cid);
  // the copies' points go too unless another curve or a constraint still uses them
  const used = new Set();
  for (const cv of Object.values(sk.curves)) for (const p of curvePoints(cv)) used.add(p);
  for (const k of sk.constraints) for (const r of k.refs || []) used.add(r);
  for (const p of pts) if (!used.has(p)) delete sk.points[p];
  return true;
}

// ---------------------------------------------------------------------------
// Polygon constraint
// ---------------------------------------------------------------------------
/**
 * Ordered closed loop of lines for a Polygon constraint: {loop:[[lineId, from, to]], turn} or
 * {error}. The lines must already form a regular polygon (same lengths, equal angles, shared vertices).
 */
export function polygonLoop(sk, ids) {
  const lines = ids.filter((id) => sk.curves[id] && sk.curves[id].type === "line");
  if (lines.length < 3 || lines.length !== ids.length) return { error: "Select the lines of a closed polygon" };
  const loop = [];
  const used = new Set();
  let cur = lines[0], from = sk.curves[cur].p1;
  for (let k = 0; k < lines.length; k++) {
    used.add(cur);
    const cv = sk.curves[cur];
    const to = cv.p1 === from ? cv.p2 : cv.p1;
    loop.push([cur, from, to]);
    const nx = lines.find((l) => !used.has(l) && (sk.curves[l].p1 === to || sk.curves[l].p2 === to));
    if (!nx) break;
    from = to;
    cur = nx;
  }
  const bad = "Cannot apply Polygon constraint. The geometry you selected is not a regular polygon. The lines should be the same length, the interior angles equal, and the vertices coincident.";
  if (loop.length !== lines.length || loop[loop.length - 1][2] !== loop[0][1]) return { error: bad };
  const n = loop.length;
  const vec = ([, f, t]) => sub(P2(sk, t), P2(sk, f));
  const L0 = len(vec(loop[0]));
  let area = 0;
  for (const [, f, t] of loop) { const a = P2(sk, f), b = P2(sk, t); area += a[0] * b[1] - b[0] * a[1]; }
  const turn = (Math.sign(area) || 1) * (TAU / n);
  for (let k = 0; k < n; k++) {
    const u = vec(loop[k]), w = vec(loop[(k + 1) % n]);
    if (Math.abs(len(u) - L0) > 1e-4 * Math.max(1, L0)) return { error: bad };
    const a = Math.atan2(cross(u, w), dot(u, w));
    if (Math.abs(a - turn) > 1e-3) return { error: bad };
  }
  return { loop, turn };
}

// ---------------------------------------------------------------------------
// offset of free-form curves (splines, ellipses, conics, control point splines)
// ---------------------------------------------------------------------------
/** Offset a free-form curve by d (positive: left of its direction) as a fit point spline. */
export function offsetFreeform(sk, id, d) {
  const g = curveGeom(sk, id);
  if (!g || g.kind !== "pcurve") return null;
  const exact = (t) => {
    const p = g.at(t), dv = g.der(t);
    const l = len(dv);
    return l < 1e-12 ? null : add(p, mul([-dv[1] / l, dv[0] / l], d));
  };
  // uniform samples, then halve every span whose fitted cubic is more than tol from the exact offset
  const n = g.sub === "ellipse" ? 24 : Math.max(8, Math.min(48, Math.ceil(g.T * 4)));
  const tol = 2e-3, MAX = 160;
  let ts = [];
  for (let i = 0; i < (g.closed ? n : n + 1); i++) if (exact((g.T * i) / n)) ts.push((g.T * i) / n);
  let pts = ts.map(exact);
  for (let round = 0; round < 5 && pts.length >= (g.closed ? 3 : 2); round++) {
    const f = splineFit(pts, { closed: !!g.closed });
    if (!f) break;
    const refine = new Set();
    for (let i = 0; i < f.spans.length; i++) {
      const q = exact((ts[i] + (i + 1 < ts.length ? ts[i + 1] : g.T)) / 2);
      if (!q) continue;
      let best = Infinity;
      for (let k = 0; k <= 32; k++) best = Math.min(best, len(sub(bezierAt(f.spans[i], k / 32), q)));
      if (best > tol) refine.add(i);
    }
    if (!refine.size || ts.length + refine.size > MAX) break;
    const nt = [];
    for (let i = 0; i < ts.length; i++) {
      nt.push(ts[i]);
      const tm = (ts[i] + (i + 1 < ts.length ? ts[i + 1] : g.T)) / 2;
      if (refine.has(i) && exact(tm)) nt.push(tm);
    }
    ts = nt;
    pts = ts.map(exact);
  }
  if (pts.length < (g.closed ? 3 : 2)) return null;
  const ids = pts.map((p) => newPt(sk, p));
  const sid = nid(sk, "s");
  sk.curves[sid] = { type: "spline", pts: ids, cons: !!sk.curves[id].cons, ...(g.closed ? { closed: true } : {}) };
  return sid;
}
/** Which side of a free-form curve q is on (+1 left of its direction, -1 right). */
export function freeformSide(sk, id, q) {
  const g = curveGeom(sk, id);
  if (!g || g.kind !== "pcurve") return 1;
  const nn = pcurveNearest(g, q);
  if (!nn) return 1;
  const dv = g.der(nn.t);
  return cross(dv, sub(q, nn.p)) >= 0 ? 1 : -1;
}

// ---------------------------------------------------------------------------
// display data
// ---------------------------------------------------------------------------
/** Polylines that draw curve id: text has one per glyph contour; 3D curves [[u,v,w]...]. */
export function curvePolylines(S, sk, id, segs = 64) {
  const cv = sk.curves[id];
  if (!cv) return [];
  if (cv.type === "text") {
    const pathGeom = (pid) => { try { return sk.curves[pid] ? asParametric(curveGeom(sk, pid)) : null; } catch { return null; } };
    return textContours(sk, id, pathGeom).map((c) => { const p = contourPolyline(c, 6); p.push(p[0]); return p; });
  }
  if (cv.type === "c3d") return [cv.closed ? [...cv.pts3, cv.pts3[0]] : cv.pts3];
  const pl = S.curvePolyline(sk, id, segs);
  return pl.length ? [pl] : [];
}

/** Text: the frame corners or the start of its path (for glyphs / selection boxes). */
export function textAnchor(sk, id) {
  const cv = sk.curves[id];
  if (!cv) return null;
  if (cv.frame && sk.points[cv.frame[0]]) return P2(sk, cv.frame[0]);
  const g = cv.path && sk.curves[cv.path] ? curveGeom(sk, cv.path) : null;
  if (g) { const pg = asParametric(g); return pg.at(0); }
  return null;
}

export { conicWeight, pcurveSamples, intersect };
