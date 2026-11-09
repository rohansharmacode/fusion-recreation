// Sketch data model and editing operations.
import { solveSketch, curvePoints, degenerateCurves } from "./solver.js";
import { computeRegions, curveGeom, intersect } from "./regions.js";
import { pcurveNearest, pcurveSamples, outwardTangent, splineFit, splineGeom, ellipseFrame, ellipseGeom, ellipseAngle, isFreeform } from "./curves.js";
import { splitCurve2 } from "./ops2.js";
import { patternValues as _patternValues } from "./solver2.js";
export { splineFit, splineGeom, ellipseFrame, ellipseGeom, isFreeform };
export * from "./ops2.js";
export { cvsplineGeomFrom, conicGeomFrom, textContours, textFrame, contourPolyline, cvDegree, conicWeight as conicW, arcLengthTable, asParametric, splitConic, conicAt } from "./curves2.js";
export { curveGeom } from "./regions.js";
export { handleDerivs, curvatureToward, outwardTangent } from "./curves.js";
export { patternValues, sharedEnd } from "./solver2.js";

export function newSketch() {
  return {
    points: { o: { x: 0, y: 0, fixed: true, origin: true } },
    curves: {},
    constraints: [],
    nid: 1,
  };
}

const nid = (sk, prefix) => `${prefix}${sk.nid++}`;

export function addPoint(sk, x, y, extra = {}) {
  const id = nid(sk, "p");
  sk.points[id] = { x, y, ...extra };
  return id;
}
export function addLine(sk, p1, p2, cons = false) {
  const id = nid(sk, "l");
  sk.curves[id] = { type: "line", p1, p2, cons };
  return id;
}
export function addCircle(sk, c, r, cons = false) {
  const id = nid(sk, "c");
  sk.curves[id] = { type: "circle", c, r, cons };
  return id;
}
export function addArc(sk, c, p1, p2, cons = false) {
  const id = nid(sk, "a");
  const P = sk.points;
  const r = Math.hypot(P[p1].x - P[c].x, P[p1].y - P[c].y);
  sk.curves[id] = { type: "arc", c, p1, p2, r, cons };
  return id;
}
export function addSketchPoint(sk, p) {
  const id = nid(sk, "k");
  sk.curves[id] = { type: "point", p };
  return id;
}
/** Fit point spline through point ids pts (closed: periodic through all of them). */
export function addSpline(sk, pts, opts = {}) {
  const id = nid(sk, "s");
  sk.curves[id] = { type: "spline", pts: [...pts], ...(opts.closed ? { closed: true } : {}), cons: !!opts.cons };
  if (opts.tan0) sk.curves[id].tan0 = opts.tan0;
  if (opts.tan1) sk.curves[id].tan1 = opts.tan1;
  if (opts.hr) sk.curves[id].hr = opts.hr;
  return id;
}
/**
 * Ellipse with centre point c, first-axis end a and second-axis end b (point ids), plus Fusion's
 * construction axis lines through the centre (midpoint constraints). Returns {curve, axes, points}.
 */
export function addEllipse(sk, c, a, b, cons = false, opts = {}) {
  const id = nid(sk, "e");
  sk.curves[id] = { type: "ellipse", c, a, b, cons };
  const P = (q) => [sk.points[q].x, sk.points[q].y];
  const C = P(c);
  const axes = [], points = [];
  if (opts.axes !== false) {
    for (const e of [a, b]) {
      const E = P(e);
      const o = addPoint(sk, 2 * C[0] - E[0], 2 * C[1] - E[1]);
      points.push(o);
      const l = addLine(sk, o, e, true);
      // internal (no glyph), like Fusion's ellipse axes
      addConstraint(sk, "midpoint", [c, l], { internal: true });
      axes.push(l);
    }
  }
  return { curve: id, axes, points };
}
export function addEllipticArc(sk, c, a, b, p1, p2, cons = false) {
  const id = nid(sk, "e");
  sk.curves[id] = { type: "earc", c, a, b, p1, p2, cons };
  return id;
}
/** Ellipse radius through q given the first axis (centre c, axis end a): the second radius, or null. */
export function ellipseSecondRadius(c, a, q) {
  const ax = [a[0] - c[0], a[1] - c[1]];
  const r1 = Math.hypot(ax[0], ax[1]);
  if (r1 < 1e-12) return null;
  const ux = [ax[0] / r1, ax[1] / r1], uy = [-ux[1], ux[0]];
  const d = [q[0] - c[0], q[1] - c[1]];
  const u = (d[0] * ux[0] + d[1] * ux[1]) / r1, v = d[0] * uy[0] + d[1] * uy[1];
  if (u * u >= 0.995) return null;
  const r2 = Math.abs(v) / Math.sqrt(1 - u * u);
  return r2 > 1e-9 ? { r2, side: Math.sign(v) || 1, uy } : null;
}
export function addConstraint(sk, type, refs, extra = {}) {
  const id = nid(sk, "k");
  const c = { id, type, refs, ...extra };
  sk.constraints.push(c);
  return c;
}

export function addRect2pt(sk, a, b, cons = false) {
  const [x0, y0] = a, [x1, y1] = b;
  const p = [addPoint(sk, x0, y0), addPoint(sk, x1, y0), addPoint(sk, x1, y1), addPoint(sk, x0, y1)];
  const l = [0, 1, 2, 3].map((i) => addLine(sk, p[i], p[(i + 1) % 4], cons));
  addConstraint(sk, "horizontal", [l[0]]);
  addConstraint(sk, "vertical", [l[1]]);
  addConstraint(sk, "horizontal", [l[2]]);
  addConstraint(sk, "vertical", [l[3]]);
  return { points: p, lines: l };
}

export function addCenterRect(sk, c, corner, centerPointId = null) {
  const [cx, cy] = c;
  const dx = corner[0] - cx, dy = corner[1] - cy;
  const r = addRect2pt(sk, [cx - dx, cy - dy], [cx + dx, cy + dy]);
  const d1 = addLine(sk, r.points[0], r.points[2], true);
  const d2 = addLine(sk, r.points[1], r.points[3], true);
  const cp = centerPointId || addPoint(sk, cx, cy);
  addConstraint(sk, "midpoint", [cp, d1]);
  addConstraint(sk, "midpoint", [cp, d2]);
  return { ...r, diagonals: [d1, d2], center: cp };
}

export function addPolygon(sk, c, v, n = 6, mode = "circumscribed", centerPointId = null) {
  const [cx, cy] = c;
  let R = Math.hypot(v[0] - cx, v[1] - cy);
  let a0 = Math.atan2(v[1] - cy, v[0] - cx);
  if (mode === "circumscribed") {
    // cursor sets the inscribed-circle (apothem) point; vertices further out
    R = R / Math.cos(Math.PI / n);
    a0 += Math.PI / n;
  }
  const cp = centerPointId || addPoint(sk, cx, cy);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * 2 * Math.PI) / n;
    pts.push(addPoint(sk, cx + R * Math.cos(a), cy + R * Math.sin(a)));
  }
  const lines = pts.map((p, i) => addLine(sk, p, pts[(i + 1) % n]));
  const apothem = R * Math.cos(Math.PI / n);
  const circ = addCircle(sk, cp, mode === "circumscribed" ? apothem : R, true);
  if (mode === "circumscribed") {
    for (const l of lines) addConstraint(sk, "tangent", [l, circ]);
  } else {
    for (const p of pts) addConstraint(sk, "onCurve", [p, circ]);
  }
  for (let i = 1; i < n; i++) addConstraint(sk, "equal", [lines[0], lines[i]]);
  return { points: pts, lines, center: cp, circle: circ };
}

export function addSlot(sk, c1, c2, width) {
  const [x1, y1] = c1, [x2, y2] = c2;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const r = width / 2;
  const nx = -Math.sin(ang) * r, ny = Math.cos(ang) * r;
  const pc1 = addPoint(sk, x1, y1), pc2 = addPoint(sk, x2, y2);
  const a = addPoint(sk, x1 + nx, y1 + ny), b = addPoint(sk, x2 + nx, y2 + ny);
  const c = addPoint(sk, x2 - nx, y2 - ny), d = addPoint(sk, x1 - nx, y1 - ny);
  const l1 = addLine(sk, d, c), l2 = addLine(sk, b, a);
  const arc2 = addArc(sk, pc2, c, b);
  const arc1 = addArc(sk, pc1, a, d);
  addConstraint(sk, "tangent", [l1, arc1]);
  addConstraint(sk, "tangent", [l1, arc2]);
  addConstraint(sk, "tangent", [l2, arc1]);
  addConstraint(sk, "tangent", [l2, arc2]);
  addConstraint(sk, "equal", [arc1, arc2]);
  const axis = addLine(sk, pc1, pc2, true);
  return { lines: [l1, l2], arcs: [arc1, arc2], centers: [pc1, pc2], axis };
}

/** Which curves/points reference a point. */
export function curvesUsingPoint(sk, pid) {
  return Object.entries(sk.curves).filter(([, cv]) => curvePoints(cv).includes(pid)).map(([id]) => id);
}

export function removeEntities(sk, ids) {
  const set = new Set(ids);
  // deleting a fit point takes it out of its spline (as Fusion does) while enough points remain
  for (const id of [...set]) {
    if (!sk.points[id]) continue;
    for (const c of curvesUsingPoint(sk, id)) {
      const cv = sk.curves[c];
      if (!cv || cv.type !== "spline" || set.has(c)) continue;
      const rest = cv.pts.filter((p) => p !== id);
      if (rest.length >= (cv.closed ? 3 : 2) && rest.length < cv.pts.length) { cv.pts = rest; delete cv.hr; }
    }
  }
  // removing a point removes curves using it
  for (const id of [...set]) if (sk.points[id]) for (const c of curvesUsingPoint(sk, id)) set.add(c);
  for (const id of set) delete sk.curves[id];
  // text on a path goes with its path; tangent handles go with their spline
  for (const [id, cv] of Object.entries(sk.curves)) {
    if (cv.type === "text" && cv.mode === "path" && !sk.curves[cv.path]) { delete sk.curves[id]; set.add(id); }
    if (cv.type === "spline" && cv.hd) for (const [k, l] of Object.entries(cv.hd)) if (!sk.curves[l]) { delete cv.hd[k]; if (cv.hs) delete cv.hs[k]; }
  }
  // drop orphan points
  const used = new Set(["o"]);
  for (const cv of Object.values(sk.curves)) for (const p of curvePoints(cv)) used.add(p);
  for (const id of Object.keys(sk.points)) if (!used.has(id) && !sk.points[id].keep) set.add(id), delete sk.points[id];
  for (const id of set) if (sk.points[id] && !sk.points[id].origin) delete sk.points[id];
  sk.constraints = sk.constraints.filter((c) => c.refs.every((r) => sk.points[r] || sk.curves[r]));
  return set;
}

export function dimValues(sk, params) {
  const out = {};
  const errors = {};
  for (const c of sk.constraints) {
    if (c.type === "rpattern" || c.type === "cpattern") {
      try { out[c.id + ":pat"] = _patternValues(c, params); } catch (e) { errors[c.id] = e.message; }
      continue;
    }
    if (c.expr === undefined || c.driven) continue;
    try {
      out[c.id] = params.eval(c.expr, c.type === "angle" ? "angle" : "length");
    } catch (e) {
      errors[c.id] = e.message;
    }
  }
  return { values: out, errors };
}

/** Solve and annotate a sketch. Returns status + per-entity constrained flags. */
export function solve(sk, params, opts = {}) {
  const { values, errors } = dimValues(sk, params);
  const res = solveSketch(sk, values, opts);
  const constrained = {};
  for (const [id, cv] of Object.entries(sk.curves)) {
    const pts = curvePoints(cv);
    let free = pts.some((p) => res.freeVars.has(p + ".x") || res.freeVars.has(p + ".y"));
    if (cv.type !== "line" && cv.type !== "point") free = free || res.freeVars.has(id + ".r");
    constrained[id] = !free;
  }
  const ptFree = {};
  for (const id of Object.keys(sk.points)) ptFree[id] = res.freeVars.has(id + ".x") || res.freeVars.has(id + ".y");
  return { ...res, constrained, ptFree, dimErrors: errors, fully: res.freeVars.size === 0 };
}

export function regions(sk) {
  return computeRegions(sk);
}

// ---------- measurement helpers for dimensions ----------
export function measureDim(sk, c) {
  const P = (id) => [sk.points[id].x, sk.points[id].y];
  const L = (id) => [P(sk.curves[id].p1), P(sk.curves[id].p2)];
  switch (c.type) {
    case "distance": {
      const [a, b] = c.refs.length === 1 ? L(c.refs[0]) : [P(c.refs[0]), P(c.refs[1])];
      if (c.dimType === "horizontal") return Math.abs(b[0] - a[0]);
      if (c.dimType === "vertical") return Math.abs(b[1] - a[1]);
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    case "pointLine": {
      const p = P(c.refs[0]);
      const [a, b] = L(c.refs[1]);
      const dx = b[0] - a[0], dy = b[1] - a[1];
      return Math.abs(((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / (Math.hypot(dx, dy) || 1));
    }
    case "diameter": return 2 * Math.abs(sk.curves[c.refs[0]].r);
    case "radius": return Math.abs(sk.curves[c.refs[0]].r);
    case "angle": {
      // one ref: the angle between the line and the sketch X axis (typed angle of a first Line segment)
      const [a, b] = L(c.refs[0]), [d, e] = c.refs.length === 1 ? [[0, 0], [1, 0]] : L(c.refs[1]);
      const s1 = c.flip1 ? -1 : 1, s2 = c.flip2 ? -1 : 1;
      const u = [s1 * (b[0] - a[0]), s1 * (b[1] - a[1])], w = [s2 * (e[0] - d[0]), s2 * (e[1] - d[1])];
      return (Math.abs(Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1])) * 180) / Math.PI;
    }
    default: return 0;
  }
}

// ---------- trim ----------
/** Split parameters along a curve where other curves cross it. */
function cutParams(sk, id) {
  const g = curveGeom(sk, id);
  const ts = [];
  for (const oid of Object.keys(sk.curves)) {
    if (oid === id || sk.curves[oid].type === "point") continue;
    const og = curveGeom(sk, oid);
    if (!og) continue;
    for (const p of intersect(g, og, 1e-6)) ts.push({ t: paramOnGeom(g, p), p, other: oid });
  }
  return { g, ts };
}
function paramOnGeom(g, p) {
  if (g.kind === "pcurve") { const n = pcurveNearest(g, p); return n ? n.t : 0; }
  if (g.kind === "line") {
    const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1];
    return ((p[0] - g.a[0]) * dx + (p[1] - g.a[1]) * dy) / (dx * dx + dy * dy);
  }
  const ang = Math.atan2(p[1] - g.c[1], p[0] - g.c[0]);
  const base = g.kind === "circle" ? 0 : g.a0;
  return (((ang - base) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

/** Returns the piece of curve `id` under 2D point q: {t0,t1, whole} */
export function trimPiece(sk, id, q) {
  const { g, ts } = cutParams(sk, id);
  const tq = paramOnGeom(g, q);
  if (g.kind === "pcurve") {
    const T = g.T, eps = 1e-7 * Math.max(1, T);
    const cuts = [...new Set(ts.map((x) => +(g.closed ? ((x.t % T) + T) % T : x.t).toFixed(10)))].filter((t) => g.closed || (t > eps && t < T - eps)).sort((a, b) => a - b);
    if (g.closed) {
      if (cuts.length < 2) return { g, whole: true, cuts };
      let t0 = cuts[cuts.length - 1] - T, t1 = cuts[0];
      for (let i = 0; i < cuts.length; i++) {
        const a = cuts[i], b = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + T;
        const tt = tq < a ? tq + T : tq;
        if (tt >= a && tt <= b) { t0 = a; t1 = b; break; }
      }
      return { g, t0, t1, whole: false, cuts };
    }
    let t0 = 0, t1 = T;
    for (const t of cuts) { if (t < tq) t0 = t; else { t1 = t; break; } }
    return { g, t0, t1, whole: t0 === 0 && t1 === T, cuts };
  }
  if (g.kind === "line") {
    const cuts = ts.map((x) => x.t).filter((t) => t > 1e-6 && t < 1 - 1e-6).sort((a, b) => a - b);
    let t0 = 0, t1 = 1;
    for (const t of cuts) { if (t < tq) t0 = t; else { t1 = t; break; } }
    return { g, t0, t1, whole: t0 === 0 && t1 === 1, cuts };
  }
  const span = g.kind === "circle" ? 2 * Math.PI : g.sweep;
  const cuts = [...new Set(ts.map((x) => +x.t.toFixed(9)))].filter((t) => (g.kind === "circle" ? true : t > 1e-6 && t < span - 1e-6)).sort((a, b) => a - b);
  if (g.kind === "circle") {
    if (cuts.length < 2) return { g, whole: true, cuts };
    let t0 = cuts[cuts.length - 1] - 2 * Math.PI, t1 = cuts[0];
    for (let i = 0; i < cuts.length; i++) {
      const a = cuts[i], b = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + 2 * Math.PI;
      const tt = tq < a ? tq + 2 * Math.PI : tq;
      if (tt >= a && tt <= b) { t0 = a; t1 = b; break; }
    }
    return { g, t0, t1, whole: false, cuts };
  }
  let t0 = 0, t1 = span;
  for (const t of cuts) { if (t < tq) t0 = t; else { t1 = t; break; } }
  return { g, t0, t1, whole: t0 === 0 && t1 === span, cuts };
}

export function trimAt(sk, id, q) {
  const cv = sk.curves[id];
  const piece = trimPiece(sk, id, q);
  if (piece.whole) { removeEntities(sk, [id]); return; }
  const { g, t0, t1 } = piece;
  if (g.kind === "pcurve") { trimFreeform(sk, id, g, t0, t1); removeEntities(sk, []); return; }
  const dropCons = (cid) => {
    sk.constraints = sk.constraints.filter((c) => !(c.refs.includes(cid) && ["equal", "tangent", "distance", "diameter", "radius", "midpoint"].includes(c.type) && c.type !== "tangent"));
  };
  if (g.kind === "line") {
    const at = (t) => [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t];
    if (t0 <= 1e-9) {
      const np = addPoint(sk, ...at(t1));
      cv.p1 = np;
    } else if (t1 >= 1 - 1e-9) {
      const np = addPoint(sk, ...at(t0));
      cv.p2 = np;
    } else {
      const pa = addPoint(sk, ...at(t0)), pb = addPoint(sk, ...at(t1));
      const old2 = cv.p2;
      cv.p2 = pa;
      const nl = addLine(sk, pb, old2, cv.cons);
      addConstraint(sk, "collinear", [id, nl]);
    }
    dropCons(id);
  } else if (g.kind === "circle") {
    // circle becomes arc spanning the complement of [t0,t1]
    const P = (a) => [g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)];
    const s = addPoint(sk, ...P(t1)), e = addPoint(sk, ...P(t0));
    sk.curves[id] = { type: "arc", c: cv.c, p1: s, p2: e, r: cv.r, cons: cv.cons };
  } else {
    const P = (a) => [g.c[0] + g.r * Math.cos(g.a0 + a), g.c[1] + g.r * Math.sin(g.a0 + a)];
    if (t0 <= 1e-9) cv.p1 = addPoint(sk, ...P(t1));
    else if (t1 >= g.sweep - 1e-9) cv.p2 = addPoint(sk, ...P(t0));
    else {
      const pa = addPoint(sk, ...P(t0)), pb = addPoint(sk, ...P(t1));
      const oldEnd = cv.p2;
      cv.p2 = pa;
      const na = addArc(sk, cv.c, pb, oldEnd, cv.cons);
      addConstraint(sk, "equal", [id, na]);
    }
  }
  // purge orphan points
  removeEntities(sk, []);
}

/** Chord-length derivative of a spline geom at t: clamping a trimmed end with it keeps the shape. */
function splineChordDer(g, t) {
  const ns = g.T;
  const tt = g.closed ? ((t % ns) + ns) % ns : Math.max(0, Math.min(ns, t));
  const i = Math.min(ns - 1, Math.floor(tt));
  const d = g.der(tt);
  const h = g.fit.h[i] || 1;
  return [d[0] / h, d[1] / h];
}

/** Trim the piece [t0, t1] (curve parameters, see trimPiece) out of a spline / ellipse / elliptical arc. */
function trimFreeform(sk, id, g, t0, t1) {
  const T = g.T, eps = 1e-7 * Math.max(1, T);
  const keep = g.closed ? [[t1, t0 + T]] : [...(t0 > eps ? [[0, t0]] : []), ...(t1 < T - eps ? [[t1, T]] : [])];
  if (!keep.length) { removeEntities(sk, [id]); return; }
  splitFreeform(sk, id, g, keep);
}

/**
 * Replace free-form curve `id` by pieces covering the parameter ranges `keep` (Trim keeps what is
 * left, Break keeps every piece). Returns the ids of the pieces (the first one keeps `id`).
 */
export function splitFreeform(sk, id, g, keep) {
  const cv = sk.curves[id];
  const T = g.T, eps = 1e-7 * Math.max(1, T);
  const newPt = (t) => { const p = g.at(t); return addPoint(sk, p[0], p[1]); };
  const inRange = (t, r) => {
    if (!g.closed) return t >= r[0] - eps && t <= r[1] + eps;
    for (const k of [-1, 0, 1]) { const tt = t + k * T; if (tt >= r[0] - eps && tt <= r[1] + eps) return true; }
    return false;
  };
  const ids = [];
  if (cv.type === "cvspline" || cv.type === "conic") {
    if (cv.type === "cvspline" && cv.closed) {
      // a closed control point spline opens at the cut: one open piece through the kept range
      ids.push(id);
    } else ids.push(...splitCurve2(sk, id, g, keep));
  } else if (g.sub === "ellipse") {
    if (cv.type === "ellipse") {
      sk.curves[id] = { type: "earc", c: cv.c, a: cv.a, b: cv.b, p1: newPt(keep[0][0]), p2: newPt(keep[0][1]), cons: cv.cons };
      ids.push(id);
    } else {
      const oldP1 = cv.p1, oldP2 = cv.p2;
      keep.forEach((r, i) => {
        const p1 = r[0] <= eps ? oldP1 : newPt(r[0]);
        const p2 = r[1] >= T - eps ? oldP2 : newPt(r[1]);
        if (i === 0) { cv.p1 = p1; cv.p2 = p2; ids.push(id); }
        else ids.push(addEllipticArc(sk, cv.c, cv.a, cv.b, p1, p2, cv.cons));
      });
    }
  } else {
    const pts = cv.pts, n = pts.length;
    keep.forEach((r, i) => {
      const [s0, s1] = r;
      // a cut exactly on a fit point reuses it
      const onFit = (s) => Math.abs(s - Math.round(s)) < 1e-6;
      const fitAt = (s) => pts[((Math.round(s) % n) + n) % n];
      const list = [];
      list.push(onFit(s0) ? fitAt(s0) : newPt(s0));
      const k0 = onFit(s0) ? Math.round(s0) + 1 : Math.floor(s0) + 1;
      const k1 = onFit(s1) ? Math.round(s1) : Math.ceil(s1);
      for (let k = k0; k < k1; k++) list.push(pts[((k % n) + n) % n]);
      list.push(onFit(s1) ? fitAt(s1) : newPt(s1));
      const tan0 = !g.closed && s0 <= eps ? cv.tan0 : splineChordDer(g, s0);
      const tan1 = !g.closed && s1 >= T - eps ? cv.tan1 : splineChordDer(g, s1);
      // knot scales: each new span keeps the parameter length it had on the original spline, so the
      // re-fitted piece is exactly the original curve
      const brk = [s0];
      for (let k = k0; k < k1; k++) brk.push(k);
      brk.push(s1);
      const hr = [];
      for (let j = 0; j + 1 < brk.length; j++) {
        const ta = brk[j], tb = brk[j + 1];
        const si = ((Math.floor(ta + 1e-9) % g.T) + g.T) % g.T;
        const A = g.at(ta), B = g.at(tb);
        const chord = Math.hypot(B[0] - A[0], B[1] - A[1]);
        hr.push(chord > 1e-12 ? (g.fit.h[si] * (tb - ta)) / chord : 1);
      }
      if (i === 0) {
        cv.pts = list;
        delete cv.closed;
        if (tan0) cv.tan0 = tan0; else delete cv.tan0;
        if (tan1) cv.tan1 = tan1; else delete cv.tan1;
        cv.hr = hr;
        ids.push(id);
      } else ids.push(addSpline(sk, list, { cons: cv.cons, tan0, tan1, hr }));
    });
  }
  // constraints on the trimmed curve follow the piece they now belong to (or go with the removed part)
  const ends = (cid) => { const c = sk.curves[cid]; return c.type === "spline" || c.type === "cvspline" ? [c.pts[0], c.pts[c.pts.length - 1]] : c.type === "earc" || c.type === "conic" ? [c.p1, c.p2] : []; };
  sk.constraints = sk.constraints.filter((c) => {
    const k = c.refs.indexOf(id);
    if (k < 0) return true;
    if (c.type === "onCurve" && k === 1 && sk.points[c.refs[0]]) {
      const P = sk.points[c.refs[0]];
      const tp = paramOnGeom(g, [P.x, P.y]);
      const at = keep.findIndex((r) => inRange(tp, r));
      if (at < 0) return false;
      c.refs[1] = ids[at];
      return true;
    }
    if ((c.type === "tangent" || c.type === "smooth") && g.sub === "spline") {
      const other = c.refs[1 - k];
      const op = sk.curves[other] ? curvePoints(sk.curves[other]) : [];
      const at = ids.findIndex((pid) => ends(pid).some((e) => op.includes(e)));
      if (at < 0) return false;
      c.refs[k] = ids[at];
      return true;
    }
    return !["equal", "distance", "radius", "diameter"].includes(c.type);
  });
  return ids;
}

/** Mirror a spline / ellipse / elliptical arc (helper for mirrorEntities). */
function mirrorFreeform(sk, cv, mp, reflDir) {
  if (cv.type === "spline") {
    const opts = { cons: cv.cons, closed: cv.closed };
    // the mirrored spline runs the same way through the mirrored points: end directions are reflected
    if (cv.tan0) opts.tan0 = reflDir(cv.tan0);
    if (cv.tan1) opts.tan1 = reflDir(cv.tan1);
    if (cv.hr) opts.hr = [...cv.hr];
    return addSpline(sk, cv.pts.map(mp), opts);
  }
  if (cv.type === "ellipse") { const id = nid(sk, "e"); sk.curves[id] = { type: "ellipse", c: mp(cv.c), a: mp(cv.a), b: mp(cv.b), cons: cv.cons }; return id; }
  if (cv.type === "earc") return addEllipticArc(sk, mp(cv.c), mp(cv.a), mp(cv.b), mp(cv.p2), mp(cv.p1), cv.cons);
  if (cv.type === "cvspline") { const id = nid(sk, "s"); sk.curves[id] = { type: "cvspline", pts: cv.pts.map(mp), degree: cv.degree, cons: cv.cons, ...(cv.closed ? { closed: true } : {}), ...(cv.knots ? { knots: [...cv.knots] } : {}) }; return id; }
  if (cv.type === "conic") { const id = nid(sk, "n"); sk.curves[id] = { type: "conic", p1: mp(cv.p1), p2: mp(cv.p2), v: mp(cv.v), rho: cv.rho, cons: cv.cons }; return id; }
  return null;
}

// ---------- sketch fillet between two lines sharing a point ----------
export function filletCorner(sk, pid, radius) {
  const lines = curvesUsingPoint(sk, pid).filter((id) => sk.curves[id].type === "line");
  if (lines.length !== 2) return null;
  const [l1, l2] = lines;
  const P = (id) => [sk.points[id].x, sk.points[id].y];
  const V = P(pid);
  const other = (l) => (sk.curves[l].p1 === pid ? sk.curves[l].p2 : sk.curves[l].p1);
  const A = P(other(l1)), B = P(other(l2));
  const u = [A[0] - V[0], A[1] - V[1]], w = [B[0] - V[0], B[1] - V[1]];
  const lu = Math.hypot(...u), lw = Math.hypot(...w);
  const un = [u[0] / lu, u[1] / lu], wn = [w[0] / lw, w[1] / lw];
  const cos = un[0] * wn[0] + un[1] * wn[1];
  const half = Math.acos(Math.max(-1, Math.min(1, cos))) / 2;
  if (half < 1e-3 || half > Math.PI / 2 - 1e-3) return null;
  const d = radius / Math.tan(half);
  if (d >= lu || d >= lw) return null;
  const T1 = [V[0] + un[0] * d, V[1] + un[1] * d], T2 = [V[0] + wn[0] * d, V[1] + wn[1] * d];
  const bis = [un[0] + wn[0], un[1] + wn[1]];
  const lb = Math.hypot(...bis);
  const C = [V[0] + (bis[0] / lb) * (radius / Math.sin(half)), V[1] + (bis[1] / lb) * (radius / Math.sin(half))];
  const t1 = addPoint(sk, ...T1), t2 = addPoint(sk, ...T2), cp = addPoint(sk, ...C);
  const rep = (l, np) => { if (sk.curves[l].p1 === pid) sk.curves[l].p1 = np; else sk.curves[l].p2 = np; };
  rep(l1, t1);
  rep(l2, t2);
  // CCW arc direction from t1 to t2?
  const cross = (T1[0] - C[0]) * (T2[1] - C[1]) - (T1[1] - C[1]) * (T2[0] - C[0]);
  const arc = cross > 0 ? addArc(sk, cp, t1, t2) : addArc(sk, cp, t2, t1);
  sk.curves[arc].r = radius;
  addConstraint(sk, "tangent", [l1, arc]);
  addConstraint(sk, "tangent", [l2, arc]);
  // constraints referencing the corner point move off it
  sk.constraints = sk.constraints.filter((c) => !c.refs.includes(pid));
  removeEntities(sk, []);
  return arc;
}

// ---------- offset ----------
export function offsetCurves(sk, ids, dist) {
  const created = [];
  for (const id of ids) {
    const cv = sk.curves[id];
    if (!cv) continue;
    if (cv.type === "circle") {
      const c = addCircle(sk, cv.c, Math.max(0.01, cv.r + dist), cv.cons);
      created.push(c);
    }
  }
  // closed line loops
  const lineIds = ids.filter((id) => sk.curves[id] && sk.curves[id].type === "line");
  if (lineIds.length >= 3) {
    const loop = orderLoop(sk, lineIds);
    if (loop) {
      const P = (id) => [sk.points[id].x, sk.points[id].y];
      const verts = loop.map((s) => P(s.from));
      // orientation
      let area = 0;
      for (let i = 0; i < verts.length; i++) { const a = verts[i], b = verts[(i + 1) % verts.length]; area += a[0] * b[1] - b[0] * a[1]; }
      const sgn = area > 0 ? -1 : 1; // positive dist = outward
      const n = verts.length;
      const offLines = verts.map((a, i) => {
        const b = verts[(i + 1) % n];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        const nx = (dy / L) * dist * sgn, ny = (-dx / L) * dist * sgn;
        return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]];
      });
      const newPts = offLines.map((l, i) => {
        const m = offLines[(i - 1 + n) % n];
        const p = lineLine(m[0], m[1], l[0], l[1]) || l[0];
        return addPoint(sk, p[0], p[1]);
      });
      newPts.forEach((p, i) => {
        const l = addLine(sk, p, newPts[(i + 1) % n]);
        addConstraint(sk, "parallel", [l, loop[i].id]);
        created.push(l);
      });
    }
  }
  return created;
}

function lineLine(a, b, c, d) {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

function orderLoop(sk, lineIds) {
  // Build an ordered closed loop out of the given lines (shared endpoints)
  const segs = lineIds.map((id) => ({ id, a: sk.curves[id].p1, b: sk.curves[id].p2 }));
  const coinc = new Map();
  const key = (p) => {
    const P = sk.points[p];
    return `${P.x.toFixed(5)},${P.y.toFixed(5)}`;
  };
  void coinc;
  const out = [];
  let cur = segs[0];
  let from = cur.a;
  const used = new Set();
  for (let k = 0; k < segs.length; k++) {
    used.add(cur.id);
    const to = cur.a === from || key(cur.a) === key(from) ? cur.b : cur.a;
    out.push({ id: cur.id, from, to });
    const nxt = segs.find((s) => !used.has(s.id) && (key(s.a) === key(to) || key(s.b) === key(to)));
    if (!nxt) break;
    from = key(nxt.a) === key(to) ? nxt.a : nxt.b;
    cur = nxt;
  }
  if (out.length !== segs.length) return null;
  if (key(out[out.length - 1].to) !== key(out[0].from)) return null;
  return out;
}

// ---------- mirror ----------
export function mirrorEntities(sk, ids, lineId) {
  const L = sk.curves[lineId];
  const A = sk.points[L.p1], B = sk.points[L.p2];
  const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
  const refl = (p) => {
    const t = ((p.x - A.x) * dx + (p.y - A.y) * dy) / l2;
    const fx = A.x + t * dx, fy = A.y + t * dy;
    return [2 * fx - p.x, 2 * fy - p.y];
  };
  const map = new Map();
  const mp = (pid) => {
    if (map.has(pid)) return map.get(pid);
    const n = addPoint(sk, ...refl(sk.points[pid]));
    addConstraint(sk, "symmetric", [pid, n, lineId]);
    map.set(pid, n);
    return n;
  };
  const created = [];
  for (const id of ids) {
    const cv = sk.curves[id];
    if (!cv || id === lineId) continue;
    if (cv.type === "line") created.push(addLine(sk, mp(cv.p1), mp(cv.p2), cv.cons));
    else if (cv.type === "circle") { const n = addCircle(sk, mp(cv.c), cv.r, cv.cons); addConstraint(sk, "equal", [id, n]); created.push(n); }
    else if (cv.type === "arc") { const n = addArc(sk, mp(cv.c), mp(cv.p2), mp(cv.p1), cv.cons); addConstraint(sk, "equal", [id, n]); created.push(n); }
    else if (isFreeform(cv)) {
      const L = Math.sqrt(l2) || 1, nx = -dy / L, ny = dx / L;
      const reflDir = (v) => { const k = 2 * (v[0] * nx + v[1] * ny); return [v[0] - k * nx, v[1] - k * ny]; };
      const n = mirrorFreeform(sk, cv, mp, reflDir);
      if (n) created.push(n);
    }
  }
  return created;
}

export function cloneSketch(sk) {
  return JSON.parse(JSON.stringify(sk));
}

// ===========================================================================
// Additions for the interactive sketch environment (src/modules/sketch).
// ===========================================================================
const TAU = Math.PI * 2;
const normAng = (a) => ((a % TAU) + TAU) % TAU;
export { curvePoints };

/** Circle through three points: {c:[x,y], r} or null when collinear. */
export function circleFrom3(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  const scale = Math.max(1e-9, Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - a[0], c[1] - a[1]));
  if (Math.abs(d) < 1e-9 * scale) return null;
  const a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
  const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { c: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) };
}

/** Arc from a through m to b: {c, r, ccw} (ccw = the arc runs counter-clockwise from a to b). */
export function arcFrom3(a, m, b) {
  const ci = circleFrom3(a, m, b);
  if (!ci) return null;
  const ang = (p) => Math.atan2(p[1] - ci.c[1], p[0] - ci.c[0]);
  const ccw = normAng(ang(m) - ang(a)) < normAng(ang(b) - ang(a));
  return { ...ci, ccw };
}

/** Arc leaving P with unit tangent t and ending at E: {c, r, ccw} or null when E lies on the tangent line. */
export function tangentArc(P, t, E) {
  const nrm = [-t[1], t[0]];
  const d = [E[0] - P[0], E[1] - P[1]];
  const dd = d[0] * d[0] + d[1] * d[1];
  const nd = nrm[0] * d[0] + nrm[1] * d[1];
  if (dd < 1e-18 || Math.abs(nd) < 1e-6 * Math.sqrt(dd)) return null;
  const s = dd / (2 * nd);
  return { c: [P[0] + nrm[0] * s, P[1] + nrm[1] * s], r: Math.abs(s), ccw: s > 0 };
}

/** Add an arc given its orientation flag: ccw arcs run from->to counter-clockwise. */
export function addArcDir(sk, c, from, to, ccw, cons = false) {
  return ccw ? addArc(sk, c, from, to, cons) : addArc(sk, c, to, from, cons);
}

/**
 * Rectangle from 4 corners (in order). opts.ids: existing point ids to reuse per corner,
 * opts.cons: construction, opts.aligned (default true): horizontal/vertical constraints,
 * otherwise perpendicular + parallel (3-point rectangle).
 */
export function addRectCorners(sk, corners, opts = {}) {
  const ids = opts.ids || [];
  const p = corners.map((q, i) => (ids[i] && sk.points[ids[i]] ? ids[i] : addPoint(sk, q[0], q[1])));
  const l = [0, 1, 2, 3].map((i) => addLine(sk, p[i], p[(i + 1) % 4], !!opts.cons));
  if (opts.aligned !== false) {
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      addConstraint(sk, Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? "horizontal" : "vertical", [l[i]]);
    }
  } else {
    addConstraint(sk, "perpendicular", [l[0], l[1]]);
    addConstraint(sk, "parallel", [l[0], l[2]]);
    addConstraint(sk, "parallel", [l[1], l[3]]);
  }
  return { points: p, lines: l };
}

/** Points that cannot move (sketch origin, projected, fixed or "fix"-constrained). */
export function fixedPointSet(sk) {
  const s = new Set();
  for (const [id, p] of Object.entries(sk.points)) if (p.fixed) s.add(id);
  for (const c of sk.constraints) if (c.type === "fix") for (const r of c.refs) {
    if (sk.points[r]) s.add(r);
    if (sk.curves[r]) for (const p of curvePoints(sk.curves[r])) s.add(p);
  }
  return s;
}

/**
 * Connected component (through shared points and constraints, but not through fixed points)
 * of the given entity ids. Returns {points:Set, curves:Set, constraints:Array}.
 */
export function componentOf(sk, ids) {
  const fixed = fixedPointSet(sk);
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b); adj.get(b).add(a);
  };
  for (const [id, cv] of Object.entries(sk.curves)) for (const p of curvePoints(cv)) link(id, p);
  for (const c of sk.constraints) {
    const node = "#" + c.id;
    for (const r of c.refs) link(node, r);
  }
  const seen = new Set();
  const stack = [...ids].filter((x) => sk.points[x] || sk.curves[x]);
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    if (fixed.has(n)) continue; // do not propagate through immovable points
    for (const m of adj.get(n) || []) if (!seen.has(m)) stack.push(m);
  }
  const points = new Set(), curves = new Set();
  for (const n of seen) { if (sk.points[n]) points.add(n); else if (sk.curves[n]) curves.add(n); }
  const constraints = sk.constraints.filter((c) => seen.has("#" + c.id));
  for (const c of constraints) for (const r of c.refs) {
    if (sk.points[r]) points.add(r);
    else if (sk.curves[r]) { curves.add(r); for (const p of curvePoints(sk.curves[r])) points.add(p); }
  }
  for (const id of curves) for (const p of curvePoints(sk.curves[id])) points.add(p);
  return { points, curves, constraints };
}

function subSketch(sk, ids) {
  const comp = componentOf(sk, ids);
  const fixed = fixedPointSet(sk);
  const sub = { points: {}, curves: {}, constraints: comp.constraints.map((c) => ({ ...c })), nid: sk.nid };
  for (const id of comp.points) sub.points[id] = { ...sk.points[id], ...(fixed.has(id) ? { fixed: true } : {}) };
  for (const id of comp.curves) sub.curves[id] = { ...sk.curves[id] };
  return sub;
}

/**
 * Interactive drag through the solver. grabs: [{ref: pointId|curveId, x, y, t?}] pull entities
 * towards sketch coordinates (x, y). Only the connected component is solved. Writes the result into
 * sk and returns true when a valid (all constraints satisfied) configuration was found.
 */
export function dragSolve(sk, params, grabs) {
  const { values } = dimValues(sk, params);
  const sub = subSketch(sk, grabs.map((g) => g.ref));
  const hard = sub.constraints;
  sub.constraints = hard.concat(grabs.map((g, i) => ({ id: `__grab${i}`, type: "grab", refs: [g.ref], x: g.x, y: g.y, t: g.t, w: g.w })));
  const degBefore = degenerateCurves(sub);
  solveSketch(sub, values, { dof: false, maxIter: 40, writeOnFail: true, staged: false });
  sub.constraints = hard;
  const r = solveSketch(sub, values, { dof: false, maxIter: 80, staged: false });
  if (!r.ok) return false;
  // never drag a line down to zero length / a circle to zero radius
  if ([...degenerateCurves(sub)].some((id) => !degBefore.has(id))) return false;
  for (const [id, p] of Object.entries(sub.points)) if (sk.points[id] && !sk.points[id].fixed) { sk.points[id].x = p.x; sk.points[id].y = p.y; }
  for (const [id, cv] of Object.entries(sub.curves)) if (cv.r !== undefined && sk.curves[id]) sk.curves[id].r = cv.r;
  return true;
}

/**
 * Check whether constraints can be added: solves a copy with and without them.
 * Returns {ok, reason?: 'conflict'|'redundant', sk?: solved copy, status?}.
 */
export function tryConstraints(sk, params, cons) {
  const before = cloneSketch(sk);
  const s0 = solve(before, params);
  const test = cloneSketch(sk);
  for (const c of cons) test.constraints.push(c);
  const s1 = solve(test, params);
  if (!s1.ok) return { ok: false, reason: "conflict", ...(s1.degenerate ? { degenerate: s1.degenerate } : {}) };
  // a spline end made tangent (G1) is shaped by the other curve, it removes no degree of freedom
  if (cons.every((c) => (c.type === "tangent" || c.type === "smooth") && c.refs.some((r) => sk.curves[r] && sk.curves[r].type === "spline"))) return { ok: true, sk: test, status: s1 };
  if (s0.ok && s0.nullity !== undefined && s1.nullity !== undefined && s1.nullity >= s0.nullity) return { ok: false, reason: "redundant", sk: test, status: s1 };
  return { ok: true, sk: test, status: s1 };
}

/** Nearest point on a curve to q: {p, d, t} (t = 0..1 along lines, angle for round curves). */
export function nearestOnCurve(sk, id, q) {
  const cv = sk.curves[id];
  if (cv && cv.type === "point") { const P = sk.points[cv.p]; return { p: [P.x, P.y], d: Math.hypot(q[0] - P.x, q[1] - P.y), t: 0 }; }
  const g = cv ? curveGeom(sk, id) : null;
  if (!g) return null;
  if (g.kind === "pcurve") { const n = pcurveNearest(g, q); return n ? { p: n.p, d: n.d, t: n.t } : null; }
  if (g.kind === "line") {
    const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1];
    const L2 = dx * dx + dy * dy || 1e-18;
    const t = Math.max(0, Math.min(1, ((q[0] - g.a[0]) * dx + (q[1] - g.a[1]) * dy) / L2));
    const p = [g.a[0] + dx * t, g.a[1] + dy * t];
    return { p, d: Math.hypot(q[0] - p[0], q[1] - p[1]), t };
  }
  const ang = Math.atan2(q[1] - g.c[1], q[0] - g.c[0]);
  let a = ang;
  if (g.kind === "arc") {
    const s = normAng(ang - g.a0);
    if (s > g.sweep) a = (s - g.sweep < TAU - s) ? g.a0 + g.sweep : g.a0;
  }
  const p = [g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)];
  return { p, d: Math.hypot(q[0] - p[0], q[1] - p[1]), t: a };
}

/** Sample a curve as a polyline in sketch coordinates. */
export function curvePolyline(sk, id, segs = 64) {
  const cv = sk.curves[id];
  if (!cv) return [];
  const P = (pid) => [sk.points[pid].x, sk.points[pid].y];
  if (cv.type === "line") return [P(cv.p1), P(cv.p2)];
  if (cv.type === "point") return [P(cv.p)];
  const g = curveGeom(sk, id);
  if (!g) return [];
  if (g.kind === "pcurve") {
    const n = g.sub === "spline" ? Math.max(segs, 12 * g.T) : Math.max(8, Math.ceil((segs * 1.5 * g.T) / TAU));
    return pcurveSamples(g, n).map((s) => s.p);
  }
  const sweep = g.kind === "circle" ? TAU : g.sweep;
  const a0 = g.kind === "circle" ? 0 : g.a0;
  const n = Math.max(8, Math.ceil((segs * sweep) / TAU));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push([g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)]);
  }
  return out;
}

/** Endpoints of an open curve as [startPointId, endPointId] (arcs: p1, p2). */
export function curveEnds(cv) {
  if (!cv) return [];
  if (cv.type === "line" || cv.type === "arc" || cv.type === "earc" || cv.type === "conic") return [cv.p1, cv.p2];
  if ((cv.type === "spline" || cv.type === "cvspline") && !cv.closed && cv.pts.length >= 2) return [cv.pts[0], cv.pts[cv.pts.length - 1]];
  return [];
}

/** Unit direction continuing a line/arc past its endpoint pid. */
export function tangentAt(sk, id, pid) {
  const cv = sk.curves[id];
  if (cv && (cv.type === "spline" || cv.type === "earc" || cv.type === "cvspline" || cv.type === "conic")) return outwardTangent(sk, id, pid);
  const P = (q) => [sk.points[q].x, sk.points[q].y];
  if (cv.type === "line") {
    const a = P(cv.p1), b = P(cv.p2);
    const d = pid === cv.p1 ? [a[0] - b[0], a[1] - b[1]] : [b[0] - a[0], b[1] - a[1]];
    const L = Math.hypot(d[0], d[1]) || 1;
    return [d[0] / L, d[1] / L];
  }
  if (cv.type === "arc") {
    const c = P(cv.c), p = P(pid);
    const r = [p[0] - c[0], p[1] - c[1]];
    const L = Math.hypot(r[0], r[1]) || 1;
    const ccwT = [-r[1] / L, r[0] / L]; // arcs run CCW p1 -> p2
    return pid === cv.p2 ? ccwT : [-ccwT[0], -ccwT[1]];
  }
  return null;
}

/** Ordered chain of curves connected end-to-end through points shared by exactly two curves. */
export function chainOf(sk, id, opts = {}) {
  const start = sk.curves[id];
  if (!start || start.type === "point" || start.type === "circle") return { ids: [id], closed: !!start && start.type === "circle" };
  if (start.type === "ellipse" || ((start.type === "spline" || start.type === "cvspline") && start.closed) || start.type === "text" || start.type === "c3d") return { ids: [id], closed: start.type === "ellipse" || !!start.closed };
  const filt = (cid) => sk.curves[cid] && (opts.linesArcs ? ["line", "arc"] : ["line", "arc", "earc", "spline", "cvspline", "conic"]).includes(sk.curves[cid].type) && !((sk.curves[cid].type === "spline" || sk.curves[cid].type === "cvspline") && sk.curves[cid].closed) && (!opts.sameType || !!sk.curves[cid].cons === !!start.cons);
  const users = (pid) => curvesUsingPoint(sk, pid).filter((c) => filt(c) && curveEnds(sk.curves[c]).includes(pid));
  const seq = [id];
  const used = new Set([id]);
  let closed = false;
  for (const dir of [1, 0]) {
    let cur = id;
    let pid = curveEnds(sk.curves[id])[dir];
    for (let guard = 0; guard < 1000; guard++) {
      const us = users(pid).filter((c) => c !== cur);
      if (us.length !== 1) break;
      const nx = us[0];
      if (used.has(nx)) { if (nx === id) closed = true; break; }
      used.add(nx);
      if (dir === 1) seq.push(nx); else seq.unshift(nx);
      const ends = curveEnds(sk.curves[nx]);
      pid = ends[0] === pid ? ends[1] : ends[0];
      cur = nx;
    }
    if (closed) break;
  }
  return { ids: seq, closed };
}

/** Order curve ids into a traversal {segs:[{id, from, to}], closed}. Null if not a simple chain. */
export function orderChain(sk, ids) {
  const segs = ids.filter((id) => sk.curves[id] && (sk.curves[id].type === "line" || sk.curves[id].type === "arc"));
  if (!segs.length) return null;
  const ends = (id) => curveEnds(sk.curves[id]);
  const deg = new Map();
  for (const id of segs) for (const p of ends(id)) deg.set(p, (deg.get(p) || 0) + 1);
  if ([...deg.values()].some((d) => d > 2)) return null;
  let startId = segs[0], startP = ends(segs[0])[0];
  outer: for (const id of segs) for (const p of ends(id)) if (deg.get(p) === 1) { startId = id; startP = p; break outer; }
  const out = [];
  const used = new Set();
  let cur = startId, from = startP;
  while (cur && !used.has(cur)) {
    used.add(cur);
    const e = ends(cur);
    const to = e[0] === from ? e[1] : e[0];
    out.push({ id: cur, from, to });
    from = to;
    cur = segs.find((s) => !used.has(s) && ends(s).includes(to));
  }
  if (out.length !== segs.length) return null;
  const closed = out.length > 1 && out[out.length - 1].to === out[0].from;
  return { segs: out, closed };
}

function lineIntersect(a, b, c, d) {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** Side of q relative to an ordered chain: +1 left of the traversal direction, -1 right. */
export function chainSide(sk, chain, q) {
  let best = null;
  for (const s of chain.segs) {
    const n = nearestOnCurve(sk, s.id, q);
    if (n && (!best || n.d < best.n.d)) best = { s, n };
  }
  if (!best) return 1;
  const cv = sk.curves[best.s.id];
  const P = (id) => [sk.points[id].x, sk.points[id].y];
  if (cv.type === "line") {
    const a = P(best.s.from), b = P(best.s.to);
    const cr = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    return cr >= 0 ? 1 : -1;
  }
  const c = P(cv.c);
  const inside = Math.hypot(q[0] - c[0], q[1] - c[1]) < Math.abs(cv.r);
  const ccw = best.s.from === cv.p1; // CCW traversal: left side is inside
  return inside === ccw ? 1 : -1;
}

/**
 * Offset an ordered chain of lines/arcs (open or closed), and circles, by d
 * (chains: positive = left of the traversal direction; circles: positive = outward).
 * Returns {curves:[ids], firstLine?: {line, point, orig}} or null.
 */
export function offsetChain(sk, ids, d) {
  const created = [];
  const circles = ids.filter((id) => sk.curves[id] && sk.curves[id].type === "circle");
  for (const id of circles) {
    const cv = sk.curves[id];
    const r = Math.abs(cv.r) + d;
    if (r <= 1e-6) continue;
    created.push(addCircle(sk, cv.c, r, cv.cons));
  }
  const rest = ids.filter((id) => !circles.includes(id));
  if (!rest.length) return created.length ? { curves: created } : null;
  const chain = orderChain(sk, rest);
  if (!chain) return created.length ? { curves: created } : null;
  const P = (id) => [sk.points[id].x, sk.points[id].y];
  const segs = chain.segs.map((s) => {
    const cv = sk.curves[s.id];
    const a = P(s.from), b = P(s.to);
    if (cv.type === "line") {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
      return { s, kind: "line", a: [a[0] + n[0] * d, a[1] + n[1] * d], b: [b[0] + n[0] * d, b[1] + n[1] * d] };
    }
    const c = P(cv.c);
    const ccw = s.from === cv.p1;
    const r0 = Math.abs(cv.r);
    const r = ccw ? r0 - d : r0 + d;
    const off = (p) => { const L = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1; return [c[0] + ((p[0] - c[0]) / L) * r, c[1] + ((p[1] - c[1]) / L) * r]; };
    return { s, kind: "arc", c, r, ccw, a: off(a), b: off(b) };
  });
  if (segs.some((g) => g.kind === "arc" && g.r <= 1e-6)) return created.length ? { curves: created } : null;
  const n = segs.length;
  const joints = [];
  const jointPoint = (g1, g2) => {
    const e = g1.b, s = g2.a;
    const m = [(e[0] + s[0]) / 2, (e[1] + s[1]) / 2];
    if (Math.hypot(e[0] - s[0], e[1] - s[1]) < 1e-6) return { p: m, tangent: true };
    if (g1.kind === "line" && g2.kind === "line") return { p: lineIntersect(g1.a, g1.b, g2.a, g2.b) || m };
    const ext = (g) => (g.kind === "line"
      ? { kind: "line", a: [g.a[0] - (g.b[0] - g.a[0]) * 1e3, g.a[1] - (g.b[1] - g.a[1]) * 1e3], b: [g.b[0] + (g.b[0] - g.a[0]) * 1e3, g.b[1] + (g.b[1] - g.a[1]) * 1e3] }
      : { kind: "circle", c: g.c, r: g.r });
    let best = null;
    for (const p of intersect(ext(g1), ext(g2), 1e-6)) if (!best || Math.hypot(p[0] - m[0], p[1] - m[1]) < Math.hypot(best[0] - m[0], best[1] - m[1])) best = p;
    return { p: best || m };
  };
  for (let i = 0; i < n; i++) {
    if (i === n - 1 && !chain.closed) break;
    joints[i] = jointPoint(segs[i], segs[(i + 1) % n]);
  }
  const startPt = chain.closed ? null : addPoint(sk, ...segs[0].a);
  const jointIds = joints.map((j) => (j ? addPoint(sk, j.p[0], j.p[1]) : null));
  const endPt = chain.closed ? null : addPoint(sk, ...segs[n - 1].b);
  const sId = (i) => (i === 0 ? (chain.closed ? jointIds[n - 1] : startPt) : jointIds[i - 1]);
  const eId = (i) => (i === n - 1 ? (chain.closed ? jointIds[n - 1] : endPt) : jointIds[i]);
  const newIds = [];
  let firstLine = null;
  segs.forEach((g, i) => {
    const cv = sk.curves[g.s.id];
    const a = sId(i), b = eId(i);
    let id;
    if (g.kind === "line") {
      id = addLine(sk, a, b, cv.cons);
      addConstraint(sk, "parallel", [id, g.s.id]);
      if (!firstLine) firstLine = { line: id, point: a, orig: g.s.id };
    } else {
      id = g.ccw ? addArc(sk, cv.c, a, b, cv.cons) : addArc(sk, cv.c, b, a, cv.cons);
      sk.curves[id].r = g.r;
    }
    newIds.push(id);
  });
  for (let i = 0; i < n; i++) {
    if (!joints[i] || !joints[i].tangent) continue;
    const k1 = newIds[i], k2 = newIds[(i + 1) % n];
    if (sk.curves[k1].type === "arc" || sk.curves[k2].type === "arc") addConstraint(sk, "tangent", [k1, k2]);
  }
  return { curves: [...created, ...newIds], firstLine };
}

/** Extend a line or arc end (the one nearer q) to the nearest intersection with another curve. */
export function extendAt(sk, id, q) {
  const cv = sk.curves[id];
  if (!cv || (cv.type !== "line" && cv.type !== "arc")) return false;
  const g = curveGeom(sk, id);
  const others = Object.keys(sk.curves).filter((o) => o !== id && sk.curves[o].type !== "point").map((o) => curveGeom(sk, o)).filter(Boolean);
  const P = (pid) => [sk.points[pid].x, sk.points[pid].y];
  let target = null, which = null;
  if (cv.type === "line") {
    const a = g.a, b = g.b;
    const useB = Math.hypot(q[0] - b[0], q[1] - b[1]) <= Math.hypot(q[0] - a[0], q[1] - a[1]);
    const E = useB ? b : a, F = useB ? a : b;
    const L = Math.hypot(E[0] - F[0], E[1] - F[1]) || 1;
    const dir = [(E[0] - F[0]) / L, (E[1] - F[1]) / L];
    const ray = { kind: "line", a: E, b: [E[0] + dir[0] * 1e6, E[1] + dir[1] * 1e6] };
    let best = Infinity;
    for (const og of others) for (const p of intersect(ray, og, 1e-6)) {
      const t = (p[0] - E[0]) * dir[0] + (p[1] - E[1]) * dir[1];
      if (t > 1e-6 && t < best) { best = t; target = p; }
    }
    which = useB ? "p2" : "p1";
  } else {
    const pa = P(cv.p1), pb = P(cv.p2);
    const useB = Math.hypot(q[0] - pb[0], q[1] - pb[1]) <= Math.hypot(q[0] - pa[0], q[1] - pa[1]);
    const full = { kind: "circle", c: g.c, r: g.r };
    const endAng = useB ? g.a0 + g.sweep : g.a0;
    let best = Infinity;
    for (const og of others) for (const p of intersect(full, og, 1e-6)) {
      const ang = Math.atan2(p[1] - g.c[1], p[0] - g.c[0]);
      const delta = useB ? normAng(ang - endAng) : normAng(endAng - ang);
      if (delta > 1e-6 && delta < TAU - g.sweep + 1e-9 && delta < best) { best = delta; target = p; }
    }
    which = useB ? "p2" : "p1";
  }
  if (!target) return false;
  const pid = cv[which];
  if (curvesUsingPoint(sk, pid).length > 1 || sk.points[pid].fixed) cv[which] = addPoint(sk, target[0], target[1]);
  else { sk.points[pid].x = target[0]; sk.points[pid].y = target[1]; }
  // a driving length dimension on the extended line no longer holds
  sk.constraints = sk.constraints.filter((c) => !(c.type === "distance" && c.refs.length === 1 && c.refs[0] === id && !c.driven));
  return true;
}

/** Remove constraints by id. Returns the number removed. */
export function removeConstraints(sk, cids) {
  const set = new Set(cids);
  const n = sk.constraints.length;
  sk.constraints = sk.constraints.filter((c) => !set.has(c.id));
  return n - sk.constraints.length;
}
