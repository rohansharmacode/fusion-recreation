// Free-form sketch curves: Fusion's fit point splines and ellipses / elliptical arcs.
//
//   spline  {type:'spline', pts:[pointId...], closed?, tan0?, tan1?, hr?, cons?}
//           C2 cubic interpolation through the fit points with chord-length parameters ("natural"
//           free ends). An end is clamped when a tangent constraint ties it to the curve it meets
//           (G1: Blend Curve, Tangent constraint) or when tan0 / tan1 hold a stored end direction
//           (what Trim keeps so a trimmed spline keeps its shape, with hr: per-span knot scales). Fit points are ordinary sketch
//           points, so the solver drags / constrains them like any other point.
//   ellipse {type:'ellipse', c, a, b}            centre, end of the first axis, end of the second axis
//   earc    {type:'earc', c, a, b, p1, p2}       elliptical arc, counter-clockwise from p1 to p2
//           Axis directions: ux = unit(a - c), uy = ux turned +90 deg; radii |a - c|, |b - c| (b
//           stays on the perpendicular through c, an implicit solver residual).
//
// The geometry of these curves is exposed as a parametric "pcurve" geom: {kind:'pcurve', sub,
// closed, T, at(t), der(t)} with t in [0, T] (spline: one unit per span; ellipse: the angle).
// Used by the region finder (regions.js), trim, picking, rendering and the kernel conversion.

const TAU = Math.PI * 2;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);

export const isFreeform = (cv) => !!cv && (cv.type === "spline" || cv.type === "ellipse" || cv.type === "earc");

// ---------------------------------------------------------------------------
// linear algebra
// ---------------------------------------------------------------------------
/** Tridiagonal solve (Thomas): a sub-diagonal (a[0] unused), b diagonal, c super (c[n-1] unused), d rhs (numbers). */
function tridiag(a, b, c, d) {
  const n = b.length;
  const cp = new Float64Array(n), dp = new Float64Array(n);
  cp[0] = c[0] / b[0]; dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) {
    const m = b[i] - a[i] * cp[i - 1];
    cp[i] = i < n - 1 ? c[i] / m : 0;
    dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
  }
  const x = new Float64Array(n);
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}
/** Cyclic tridiagonal solve (Sherman-Morrison): a[0] couples row 0 to x[n-1], c[n-1] row n-1 to x[0]. */
function cyclicTridiag(a, b, c, d) {
  const n = b.length;
  const alpha = c[n - 1], beta = a[0];
  const gamma = -b[0];
  const bb = Float64Array.from(b);
  bb[0] = b[0] - gamma;
  bb[n - 1] = b[n - 1] - (alpha * beta) / gamma;
  const x = tridiag(a, bb, c, d);
  const u = new Float64Array(n);
  u[0] = gamma; u[n - 1] = alpha;
  const z = tridiag(a, bb, c, u);
  const fact = (x[0] + (beta * x[n - 1]) / gamma) / (1 + z[0] + (beta * z[n - 1]) / gamma);
  for (let i = 0; i < n; i++) x[i] -= fact * z[i];
  return x;
}

// ---------------------------------------------------------------------------
// fit point spline
// ---------------------------------------------------------------------------
/**
 * Cubic interpolation through P ([[x,y]...]) with chord-length parameters.
 * opts: {closed, d0, d1}: d0 / d1 clamp the end derivatives (directions, chord-length units, so a
 * unit vector is the natural speed); otherwise the ends are natural (zero curvature).
 * Returns {P, h, m, spans:[[p0,c1,c2,p3]...], closed} or null (fewer than two points).
 */
export function splineFit(P, opts = {}) {
  const n = P.length;
  if (n < 2) return null;
  const closed = !!opts.closed && n >= 3;
  const ns = closed ? n : n - 1;
  const h = [];
  // chord-length knots; hr scales individual spans (a trimmed spline keeps its original parameters)
  for (let i = 0; i < ns; i++) h.push(Math.max(len(sub(P[(i + 1) % n], P[i])) * (opts.hr && opts.hr[i] > 0 ? opts.hr[i] : 1), 1e-9));
  const del = (i) => { const d = sub(P[(i + 1) % n], P[i]); return [d[0] / h[i], d[1] / h[i]]; };
  const A = new Float64Array(n), B = new Float64Array(n), C = new Float64Array(n);
  const Dx = new Float64Array(n), Dy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (!closed && i === 0) {
      if (opts.d0) { B[0] = 1; Dx[0] = opts.d0[0]; Dy[0] = opts.d0[1]; }
      else { const d = del(0); B[0] = 2; C[0] = 1; Dx[0] = 3 * d[0]; Dy[0] = 3 * d[1]; }
      continue;
    }
    if (!closed && i === n - 1) {
      if (opts.d1) { B[i] = 1; Dx[i] = opts.d1[0]; Dy[i] = opts.d1[1]; }
      else { const d = del(n - 2); A[i] = 1; B[i] = 2; Dx[i] = 3 * d[0]; Dy[i] = 3 * d[1]; }
      continue;
    }
    const ip = (i - 1 + ns) % ns;
    const hp = h[ip], hi = h[i % ns];
    const dp = del(ip), di = del(i % ns);
    A[i] = hi; B[i] = 2 * (hp + hi); C[i] = hp;
    Dx[i] = 3 * (hi * dp[0] + hp * di[0]);
    Dy[i] = 3 * (hi * dp[1] + hp * di[1]);
  }
  const solve = closed ? cyclicTridiag : tridiag;
  const mx = solve(A, B, C, Dx), my = solve(A, B, C, Dy);
  const m = P.map((_, i) => [mx[i], my[i]]);
  const spans = [];
  for (let i = 0; i < ns; i++) {
    const p0 = P[i], p3 = P[(i + 1) % n], m0 = m[i], m1 = m[(i + 1) % n], k = h[i] / 3;
    spans.push([p0, [p0[0] + m0[0] * k, p0[1] + m0[1] * k], [p3[0] - m1[0] * k, p3[1] - m1[1] * k], p3]);
  }
  return { P, h, m, spans, closed };
}

export function bezierAt(b, u) {
  const v = 1 - u;
  const a = v * v * v, c1 = 3 * v * v * u, c2 = 3 * v * u * u, d = u * u * u;
  return [a * b[0][0] + c1 * b[1][0] + c2 * b[2][0] + d * b[3][0], a * b[0][1] + c1 * b[1][1] + c2 * b[2][1] + d * b[3][1]];
}
export function bezierDer(b, u) {
  const v = 1 - u;
  const a = 3 * v * v, c = 6 * v * u, d = 3 * u * u;
  return [a * (b[1][0] - b[0][0]) + c * (b[2][0] - b[1][0]) + d * (b[3][0] - b[2][0]), a * (b[1][1] - b[0][1]) + c * (b[2][1] - b[1][1]) + d * (b[3][1] - b[2][1])];
}
/** Sub-curve of a cubic Bezier for u in [u0, u1] (de Casteljau). */
export function bezierSplit(b, u0, u1) {
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const right = (bb, t) => {
    const p01 = lerp(bb[0], bb[1], t), p12 = lerp(bb[1], bb[2], t), p23 = lerp(bb[2], bb[3], t);
    const p012 = lerp(p01, p12, t), p123 = lerp(p12, p23, t);
    return [lerp(p012, p123, t), p123, p23, bb[3]];
  };
  const left = (bb, t) => {
    const p01 = lerp(bb[0], bb[1], t), p12 = lerp(bb[1], bb[2], t), p23 = lerp(bb[2], bb[3], t);
    const p012 = lerp(p01, p12, t), p123 = lerp(p12, p23, t);
    return [bb[0], p01, p012, lerp(p012, p123, t)];
  };
  let r = u0 > 0 ? right(b, u0) : b;
  if (u1 < 1) r = left(r, (u1 - u0) / (1 - u0));
  return r;
}

/** Unit tangent of a line / arc / spline / elliptical arc at its end point pid, pointing away from the curve. */
const ptOf = (sk) => (q) => (sk.points[q] ? [sk.points[q].x, sk.points[q].y] : null);
export function outwardTangent(sk, id, pid, visiting = new Set(), P = ptOf(sk)) {
  const cv = sk.curves[id];
  if (!cv) return null;
  const unit = (v) => { const l = len(v); return l > 1e-12 ? [v[0] / l, v[1] / l] : null; };
  if (cv.type === "line") {
    if (pid !== cv.p1 && pid !== cv.p2) return null;
    return unit(pid === cv.p1 ? sub(P(cv.p1), P(cv.p2)) : sub(P(cv.p2), P(cv.p1)));
  }
  if (cv.type === "arc") {
    if (pid !== cv.p1 && pid !== cv.p2) return null;
    const r = sub(P(pid), P(cv.c));
    const t = unit([-r[1], r[0]]); // arcs run CCW p1 -> p2
    return t && (pid === cv.p2 ? t : [-t[0], -t[1]]);
  }
  if (cv.type === "earc") {
    if (pid !== cv.p1 && pid !== cv.p2) return null;
    const E = ellipseOf(sk, cv, P);
    if (!E) return null;
    const t = unit(ellipseDer(E, ellipseAngle(E, P(pid))));
    return t && (pid === cv.p2 ? t : [-t[0], -t[1]]);
  }
  if (cv.type === "spline" && !cv.closed) {
    const n = cv.pts.length;
    if (pid !== cv.pts[0] && pid !== cv.pts[n - 1]) return null;
    const f = splineOf(sk, id, visiting, P);
    if (!f) return null;
    if (pid === cv.pts[0]) { const t = unit(f.m[0]); return t && [-t[0], -t[1]]; }
    return unit(f.m[n - 1]);
  }
  return null;
}

/** End derivative clamps of spline `id`: tangent constraints to the curve meeting it at that end, else the stored tan0 / tan1. */
function splineClamps(sk, id, visiting, P) {
  const cv = sk.curves[id];
  const out = { d0: null, d1: null };
  if (cv.closed || cv.pts.length < 2) return out;
  const first = cv.pts[0], last = cv.pts[cv.pts.length - 1];
  for (const c of sk.constraints || []) {
    if (c.type !== "tangent" || c.suppressed || !c.refs.includes(id)) continue;
    const other = c.refs[0] === id ? c.refs[1] : c.refs[0];
    if (!other || other === id || visiting.has(other) || !sk.curves[other]) continue;
    const vis = new Set(visiting); vis.add(id);
    for (const [pid, key, sgn] of [[first, "d0", 1], [last, "d1", -1]]) {
      if (out[key]) continue;
      const t = outwardTangent(sk, other, pid, vis, P);
      if (t) out[key] = [sgn * t[0], sgn * t[1]];
    }
  }
  if (!out.d0 && Array.isArray(cv.tan0)) out.d0 = cv.tan0;
  if (!out.d1 && Array.isArray(cv.tan1)) out.d1 = cv.tan1;
  return out;
}

/** Fitted spline of curve `id` (null when it has fewer than two fit points). */
export function splineOf(sk, id, visiting = new Set(), pt = ptOf(sk)) {
  const cv = sk.curves[id];
  if (!cv || cv.type !== "spline") return null;
  const P = [];
  for (const pid of cv.pts) { const p = pt(pid); if (!p) return null; P.push(p); }
  if (P.length < 2) return null;
  return splineFit(P, { closed: cv.closed, hr: Array.isArray(cv.hr) && cv.hr.length === (cv.closed ? P.length : P.length - 1) ? cv.hr : null, ...splineClamps(sk, id, visiting, pt) });
}

// ---------------------------------------------------------------------------
// ellipse
// ---------------------------------------------------------------------------
export function ellipseFrame(c, a, b) {
  const ax = sub(a, c);
  const r1 = len(ax), r2 = len(sub(b, c));
  if (r1 < 1e-12 || r2 < 1e-12) return null;
  const ux = [ax[0] / r1, ax[1] / r1];
  return { c, ux, uy: [-ux[1], ux[0]], r1, r2 };
}
export const ellipsePoint = (E, th) => [E.c[0] + E.r1 * Math.cos(th) * E.ux[0] + E.r2 * Math.sin(th) * E.uy[0], E.c[1] + E.r1 * Math.cos(th) * E.ux[1] + E.r2 * Math.sin(th) * E.uy[1]];
export const ellipseDer = (E, th) => [-E.r1 * Math.sin(th) * E.ux[0] + E.r2 * Math.cos(th) * E.uy[0], -E.r1 * Math.sin(th) * E.ux[1] + E.r2 * Math.cos(th) * E.uy[1]];
export function ellipseAngle(E, p) {
  const d = sub(p, E.c);
  return Math.atan2(dot(d, E.uy) / E.r2, dot(d, E.ux) / E.r1);
}
/** Signed "distance" of p from the ellipse (exact on the curve, ~distance near it). */
export function ellipseResidual(E, p) {
  const d = sub(p, E.c);
  const u = dot(d, E.ux) / E.r1, v = dot(d, E.uy) / E.r2;
  return (Math.hypot(u, v) - 1) * Math.sqrt(E.r1 * E.r2);
}
/** Support function: distance from the centre to the tangent line with unit normal n. */
export function ellipseSupport(E, n) {
  return Math.hypot(E.r1 * dot(n, E.ux), E.r2 * dot(n, E.uy));
}
export function ellipseOf(sk, cv, pt = ptOf(sk)) {
  const c = pt(cv.c), a = pt(cv.a), b = pt(cv.b);
  return c && a && b ? ellipseFrame(c, a, b) : null;
}

// ---------------------------------------------------------------------------
// parametric geoms
// ---------------------------------------------------------------------------
/** pcurve geom of a spline / ellipse / elliptical arc, or null. */
export function freeformGeom(sk, id, pt = ptOf(sk)) {
  const cv = sk.curves[id];
  if (!cv) return null;
  if (cv.type === "spline") return splineGeom(splineOf(sk, id, new Set(), pt), id);
  if (cv.type === "ellipse" || cv.type === "earc") return ellipseGeom(ellipseOf(sk, cv, pt), cv.type === "earc" ? [pt(cv.p1), pt(cv.p2)] : null, id);
  return null;
}

/** pcurve geom of a fitted spline (splineFit result). */
export function splineGeom(f, id = null) {
  {
    if (!f) return null;
    const ns = f.spans.length;
    const loc = (t) => {
      let tt = t;
      if (f.closed) tt = ((t % ns) + ns) % ns;
      let i = Math.floor(tt);
      if (i >= ns) i = ns - 1;
      if (i < 0) i = 0;
      return [i, Math.min(1, Math.max(0, tt - i))];
    };
    return {
      kind: "pcurve", sub: "spline", id, closed: f.closed, T: ns, fit: f, spans: f.spans, per: 24,
      at: (t) => { const [i, u] = loc(t); return bezierAt(f.spans[i], u); },
      der: (t) => { const [i, u] = loc(t); return bezierDer(f.spans[i], u); },
    };
  }
}

/** pcurve geom of an ellipse frame; ends = [p1, p2] for a CCW elliptical arc. */
export function ellipseGeom(E, ends = null, id = null) {
  {
    if (!E) return null;
    let th0 = 0, T = TAU, closed = true;
    if (ends) {
      const [p1, p2] = ends;
      if (!p1 || !p2) return null;
      th0 = ellipseAngle(E, p1);
      T = (((ellipseAngle(E, p2) - th0) % TAU) + TAU) % TAU;
      if (T < 1e-9) T = TAU;
      closed = false;
    }
    return {
      kind: "pcurve", sub: "ellipse", id, closed, T, E, th0, per: 96 / TAU,
      at: (t) => ellipsePoint(E, th0 + t),
      der: (t) => ellipseDer(E, th0 + t),
    };
  }
}

/** Polyline samples [{t, p}] of a pcurve (cached on the geom). */
export function pcurveSamples(g, minN = 0) {
  if (g._samples && g._samples.length >= minN) return g._samples;
  const n = Math.max(minN, 8, Math.ceil(g.T * g.per));
  const out = [];
  for (let i = 0; i <= n; i++) { const t = (g.T * i) / n; out.push({ t, p: g.at(t) }); }
  g._samples = out;
  return out;
}
export function pcurvePolyline(g, n = 0) { return pcurveSamples(g, n).map((s) => s.p); }

/** Nearest point of a pcurve to q: {t, p, d}. Range (t0, t1) optional. */
export function pcurveNearest(g, q, t0 = 0, t1 = g.T) {
  const S = pcurveSamples(g);
  let best = null;
  for (let k = 0; k + 1 < S.length; k++) {
    const a = S[k], b = S[k + 1];
    if (b.t < t0 - 1e-12 || a.t > t1 + 1e-12) continue;
    const ab = sub(b.p, a.p);
    const L2 = dot(ab, ab) || 1e-30;
    const s = Math.max(0, Math.min(1, dot(sub(q, a.p), ab) / L2));
    const p = [a.p[0] + ab[0] * s, a.p[1] + ab[1] * s];
    const d = len(sub(q, p));
    if (!best || d < best.d) best = { d, t: a.t + (b.t - a.t) * s };
  }
  if (!best) return null;
  let t = Math.max(t0, Math.min(t1, best.t));
  const t00 = t, p00 = g.at(t), d00 = len(sub(q, p00));
  for (let it = 0; it < 12; it++) {
    const p = g.at(t), dv = g.der(t);
    const dd = dot(dv, dv);
    if (dd < 1e-24) break;
    const step = dot(sub(p, q), dv) / dd;
    let tn = t - step;
    if (g.closed && t0 === 0 && t1 === g.T) tn = ((tn % g.T) + g.T) % g.T;
    else tn = Math.max(t0, Math.min(t1, tn));
    if (Math.abs(tn - t) < 1e-14) { t = tn; break; }
    t = tn;
  }
  const p = g.at(t);
  const d = len(sub(q, p));
  // Newton wandered off (far from the curve): keep the sampled estimate
  return d <= d00 ? { t, p, d } : { t: t00, p: p00, d: d00 };
}

// root of f on [a, b] with f(a), f(b) of opposite signs (Illinois regula falsi)
function rootIn(f, a, b, fa, fb) {
  if (fa === 0) return a;
  if (fb === 0) return b;
  let side = 0;
  for (let it = 0; it < 80; it++) {
    const c = (a * fb - b * fa) / (fb - fa);
    const fc = f(c);
    if (Math.abs(fc) < 1e-14 || Math.abs(b - a) < 1e-15) return c;
    if (fc * fb > 0) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; }
    else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
  }
  return (a * fb - b * fa) / (fb - fa);
}
/** Parameters where the scalar function f(t) along pcurve g vanishes (sign changes + near-zero samples). */
function pcurveRoots(g, f, tol) {
  const S = pcurveSamples(g);
  const vals = S.map((s) => f(s.t));
  const ts = [];
  const refine = (t, lo, hi) => {
    const e = 1e-7 * Math.max(1, g.T);
    for (let it = 0; it < 20; it++) {
      const v = f(t);
      if (Math.abs(v) < 1e-14) break;
      const dv = (f(Math.min(hi, t + e)) - f(Math.max(lo, t - e))) / (Math.min(hi, t + e) - Math.max(lo, t - e));
      if (!(Math.abs(dv) > 1e-14)) break;
      const tn = t - v / dv;
      if (!(tn >= lo && tn <= hi)) break;
      if (Math.abs(tn - t) < 1e-15) { t = tn; break; }
      t = tn;
    }
    return t;
  };
  for (let k = 0; k < S.length; k++) {
    if (Math.abs(vals[k]) <= tol) {
      // a sample (almost) on the other curve: an end point resting on it, or a crossing near a sample
      const lo = k > 0 ? S[k - 1].t : g.closed ? S[k].t - g.T / (S.length - 1) : 0;
      const hi = k + 1 < S.length ? S[k + 1].t : g.closed ? S[k].t + g.T / (S.length - 1) : g.T;
      ts.push(Math.abs(vals[k]) < 1e-12 ? S[k].t : refine(S[k].t, lo, hi));
      continue;
    }
    if (k + 1 < S.length && Math.abs(vals[k + 1]) > tol && vals[k] * vals[k + 1] < 0) ts.push(rootIn(f, S[k].t, S[k + 1].t, vals[k], vals[k + 1]));
  }
  const norm = (t) => (g.closed ? ((t % g.T) + g.T) % g.T : t);
  const out = [];
  const eps = 1e-9 * Math.max(1, g.T);
  for (const t of ts.map(norm).sort((a, b) => a - b)) if (!out.length || Math.abs(t - out[out.length - 1]) > eps) out.push(t);
  if (g.closed && out.length > 1 && Math.abs(out[out.length - 1] - g.T) < eps && out[0] < eps) out.pop();
  return out;
}

/** Intersections of pcurve g with a line / circle / arc / pcurve geom h: [{t (on g), p}]. */
export function pcurveIntersect(g, h, tol = 1e-6) {
  const out = [];
  if (h.kind === "line") {
    const d = sub(h.b, h.a);
    const L = len(d) || 1e-12;
    const f = (t) => { const p = g.at(t); return ((p[0] - h.a[0]) * d[1] - (p[1] - h.a[1]) * d[0]) / L; };
    for (const t of pcurveRoots(g, f, tol)) out.push({ t, p: g.at(t) });
    return out;
  }
  if (h.kind === "circle" || h.kind === "arc") {
    const f = (t) => len(sub(g.at(t), h.c)) - h.r;
    for (const t of pcurveRoots(g, f, tol)) out.push({ t, p: g.at(t) });
    return out;
  }
  if (h.kind === "pcurve") {
    const A = pcurveSamples(g), B = pcurveSamples(h);
    const found = [];
    for (let i = 0; i + 1 < A.length; i++) {
      const a0 = A[i].p, a1 = A[i + 1].p;
      const minx = Math.min(a0[0], a1[0]) - tol, maxx = Math.max(a0[0], a1[0]) + tol, miny = Math.min(a0[1], a1[1]) - tol, maxy = Math.max(a0[1], a1[1]) + tol;
      for (let j = 0; j + 1 < B.length; j++) {
        const b0 = B[j].p, b1 = B[j + 1].p;
        if (Math.max(b0[0], b1[0]) < minx || Math.min(b0[0], b1[0]) > maxx || Math.max(b0[1], b1[1]) < miny || Math.min(b0[1], b1[1]) > maxy) continue;
        const r = segSeg(a0, a1, b0, b1, tol);
        if (!r) continue;
        // Newton on A(s) - B(u) = 0
        let s = A[i].t + (A[i + 1].t - A[i].t) * r[0], u = B[j].t + (B[j + 1].t - B[j].t) * r[1];
        for (let it = 0; it < 20; it++) {
          const F = sub(g.at(s), h.at(u));
          if (len(F) < 1e-13) break;
          const ds = g.der(s), du = h.der(u);
          const det = ds[0] * -du[1] - -du[0] * ds[1];
          if (Math.abs(det) < 1e-18) break;
          s -= (F[0] * -du[1] - -du[0] * F[1]) / det;
          u -= (ds[0] * F[1] - ds[1] * F[0]) / det;
          if (!g.closed) s = Math.max(0, Math.min(g.T, s));
          if (!h.closed) u = Math.max(0, Math.min(h.T, u));
        }
        if (g.closed) s = ((s % g.T) + g.T) % g.T;
        if (h.closed) u = ((u % h.T) + h.T) % h.T;
        const p = g.at(s);
        if (len(sub(p, h.at(u))) > tol) continue;
        if (found.some((q) => len(sub(q.p, p)) < tol)) continue;
        found.push({ t: s, u, p });
      }
    }
    return found;
  }
  return out;
}
function segSeg(a, b, c, d, tol) {
  const r = sub(b, a), s = sub(d, c);
  const den = r[0] * s[1] - r[1] * s[0];
  const qp = sub(c, a);
  if (Math.abs(den) < 1e-18) return null;
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  const et = tol / (len(r) || 1), eu = tol / (len(s) || 1);
  if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) return null;
  return [Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, u))];
}

/**
 * Cubic Bezier pieces covering t in [t0, t1] of a spline pcurve (t1 may pass T on closed splines),
 * each with its chord-length parameter length: [{b:[p0,c1,c2,p3], L}].
 */
export function splinePieces(g, t0, t1) {
  const out = [];
  const ns = g.spans.length;
  const h = g.fit.h;
  let t = t0;
  for (let guard = 0; t < t1 - 1e-12 && guard < 4 * ns + 4; guard++) {
    let i = Math.floor(t + 1e-12);
    const u0 = t - i;
    const end = Math.min(t1, i + 1);
    const u1 = end - i;
    const si = ((i % ns) + ns) % ns;
    if (u1 - u0 > 1e-12) out.push({ b: bezierSplit(g.spans[si], Math.max(0, u0), Math.min(1, u1)), L: h[si] * (u1 - u0) });
    t = end;
  }
  return out;
}

/** Signed area enclosed by a closed polyline. */
export function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
