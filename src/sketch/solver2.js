// Residuals for the constraint types added in round 7 (see solver.js buildSystem):
//   rpattern / cpattern  sketch Rectangular / Circular Pattern (copies follow their source)
//   polygon              Polygon constraint (a closed chain of lines stays a regular polygon)
//   tangent / smooth     G1 / G2 joins at the end of a control point spline or conic curve
import { curvatureToward } from "./curves.js";

const D2R = Math.PI / 180;

const curveEndsOf = (cv) => {
  if (!cv) return [];
  if (cv.type === "line" || cv.type === "arc" || cv.type === "earc") return [cv.p1, cv.p2];
  if (cv.type === "conic") return [cv.p1, cv.p2];
  if ((cv.type === "spline" || cv.type === "cvspline") && !cv.closed && cv.pts && cv.pts.length >= 2) return [cv.pts[0], cv.pts[cv.pts.length - 1]];
  return [];
};
const pointsOf = (cv) => {
  if (!cv) return [];
  if (cv.type === "line") return [cv.p1, cv.p2];
  if (cv.type === "circle") return [cv.c];
  if (cv.type === "arc") return [cv.c, cv.p1, cv.p2];
  if (cv.type === "spline" || cv.type === "cvspline") return [...new Set(cv.pts || [])];
  if (cv.type === "ellipse") return [cv.c, cv.a, cv.b];
  if (cv.type === "earc") return [cv.c, cv.a, cv.b, cv.p1, cv.p2];
  if (cv.type === "conic") return [cv.p1, cv.p2, cv.v];
  return [];
};

/** The point where an end of a meets an end of b (the G1 / G2 joint), or null. */
export function sharedEnd(sk, a, b) {
  const ea = curveEndsOf(sk.curves[a]), eb = curveEndsOf(sk.curves[b]);
  return ea.find((p) => eb.includes(p)) || null;
}

/** Pattern values from the constraint's expressions: {step1, step2, q1, q2} / {step, q, total}. */
export function patternValues(c, params) {
  const ev = (e, kind, def) => {
    if (e === undefined || e === null || e === "") return def;
    if (typeof e === "number") return e;
    return params ? params.eval(String(e), kind) : Number.parseFloat(e);
  };
  if (c.type === "rpattern") {
    const q1 = Math.max(1, Math.round(ev(c.q1, "none", 2))), q2 = Math.max(1, Math.round(ev(c.q2, "none", 1)));
    const d1 = ev(c.d1, "length", 10), d2 = ev(c.d2, "length", 10);
    const spacing = c.distType === "spacing";
    const st = (q, d) => (spacing ? d : q > 1 ? d / (q - 1) : 0);
    return { q1, q2, d1, d2, step1: st(q1, d1), step2: st(q2, d2) };
  }
  const q = Math.max(1, Math.round(ev(c.q, "none", 3)));
  const A = ev(c.angle, "angle", 360) * D2R;
  let step;
  if (c.angType === "angle") step = q > 1 ? A / (q - 1) : 0;
  else if (c.angType === "sym") step = q > 1 ? A / 2 / (q - 1) : 0;
  else step = (2 * Math.PI) / q;
  return { q, total: A, step };
}

/** Unit direction of a pattern direction spec ({line} or {ang} radians) at variable state x. */
function dirAt(spec, ctx, x, fallback) {
  if (spec && spec.line && ctx.line && ctx.sk.curves[spec.line] && ctx.sk.curves[spec.line].type === "line") {
    const [a, b] = ctx.line(spec.line);
    const A = a.get(x), B = b.get(x);
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1e-9;
    const s = spec.rev ? -1 : 1;
    return [(s * (B[0] - A[0])) / L, (s * (B[1] - A[1])) / L];
  }
  if (spec && Number.isFinite(spec.ang)) return [Math.cos(spec.ang), Math.sin(spec.ang)];
  return fallback;
}

export function patternResiduals(sk, c, ctx) {
  const out = [];
  const vals = ctx.values[c.id + ":pat"];
  if (!vals) return out;
  const { P, Rr, line } = ctx;
  const cc = { sk, line };
  const dirVars = (spec) => (spec && spec.line && sk.curves[spec.line] && sk.curves[spec.line].type === "line" ? line(spec.line).flatMap((q) => q.vars) : []);
  if (c.type === "rpattern") {
    const dv = [...dirVars(c.dir1), ...dirVars(c.dir2)];
    for (const [src, cp, i, j] of c.pairs || []) {
      if (!sk.points[src] || !sk.points[cp]) continue;
      const a = P(src), b = P(cp);
      const vars = [...a.vars, ...b.vars, ...dv];
      const off = (x) => {
        const u1 = dirAt(c.dir1, cc, x, [1, 0]);
        const u2 = dirAt(c.dir2, cc, x, [-u1[1], u1[0]]);
        return [i * vals.step1 * u1[0] + j * vals.step2 * u2[0], i * vals.step1 * u1[1] + j * vals.step2 * u2[1]];
      };
      out.push({ vars, f: (x) => b.get(x)[0] - a.get(x)[0] - off(x)[0] });
      out.push({ vars, f: (x) => b.get(x)[1] - a.get(x)[1] - off(x)[1] });
    }
  } else {
    if (!sk.points[c.center]) return out;
    const C = P(c.center);
    for (const [src, cp, k] of c.pairs || []) {
      if (!sk.points[src] || !sk.points[cp]) continue;
      const a = P(src), b = P(cp);
      const vars = [...a.vars, ...b.vars, ...C.vars];
      const th = k * vals.step * (c.flip ? -1 : 1);
      const cs = Math.cos(th), sn = Math.sin(th);
      const tgt = (x) => {
        const o = C.get(x), p = a.get(x);
        const dx = p[0] - o[0], dy = p[1] - o[1];
        return [o[0] + cs * dx - sn * dy, o[1] + sn * dx + cs * dy];
      };
      out.push({ vars, f: (x) => b.get(x)[0] - tgt(x)[0] });
      out.push({ vars, f: (x) => b.get(x)[1] - tgt(x)[1] });
    }
  }
  for (const [s0, s1] of c.rpairs || []) {
    const A = sk.curves[s0], B = sk.curves[s1];
    if (!A || !B || A.r === undefined || B.r === undefined) continue;
    const ra = Rr(s0), rb = Rr(s1);
    out.push({ vars: [...ra.vars, ...rb.vars], f: (x) => rb.get(x) - ra.get(x) });
  }
  return out;
}

/** Regular polygon: c.loop = [[lineId, fromPid, toPid]...] in order, c.turn = +-2pi/n. */
export function polygonResiduals(sk, c, ctx) {
  const out = [];
  const loop = (c.loop || []).filter(([l]) => sk.curves[l] && sk.curves[l].type === "line");
  const n = loop.length;
  if (n < 3) return out;
  const { P } = ctx;
  const seg = loop.map(([, f, t]) => [P(f), P(t)]);
  const vec = (k, x) => { const [a, b] = seg[k]; const A = a.get(x), B = b.get(x); return [B[0] - A[0], B[1] - A[1]]; };
  const vars = (k) => [...seg[k][0].vars, ...seg[k][1].vars];
  const turn = Number.isFinite(c.turn) ? c.turn : (2 * Math.PI) / n;
  for (let k = 1; k < n; k++) {
    out.push({ vars: [...vars(0), ...vars(k)], f: (x) => { const u = vec(0, x), w = vec(k, x); return Math.hypot(w[0], w[1]) - Math.hypot(u[0], u[1]); } });
  }
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    out.push({
      vars: [...vars(k), ...vars(k2)],
      f: (x) => {
        const u = vec(k, x), w = vec(k2, x);
        const a = Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1]);
        let d = a - turn;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return d * 10;
      },
    });
  }
  return out;
}

/**
 * G1 (and with g2 also G2) where an end of a control point spline / conic meets the other curve.
 * Residuals: the outward end tangents are anti-parallel; (g2) the curvatures continue.
 */
export function endJoinResiduals(sk, c, ctx) {
  const out = [];
  const [a, b] = c.refs;
  if (!sk.curves[a] || !sk.curves[b]) return out;
  const J = sharedEnd(sk, a, b);
  if (!J) return out;
  const { P, ptAt, outwardTangent } = ctx;
  const vars = [...pointsOf(sk.curves[a]), ...pointsOf(sk.curves[b])].filter((q) => sk.points[q]).flatMap((q) => P(q).vars);
  // the size of the curves sets the curvature scale (residuals of comparable size to point offsets)
  const size = (() => {
    let mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
    for (const q of [...pointsOf(sk.curves[a]), ...pointsOf(sk.curves[b])]) { const p = sk.points[q]; if (!p) continue; mn = [Math.min(mn[0], p.x), Math.min(mn[1], p.y)]; mx = [Math.max(mx[0], p.x), Math.max(mx[1], p.y)]; }
    return Math.max(1, Math.hypot(mx[0] - mn[0], mx[1] - mn[1]));
  })();
  out.push({
    vars,
    f: (x) => {
      const pt = ptAt(x);
      const ta = outwardTangent(sk, a, J, new Set(), pt), tb = outwardTangent(sk, b, J, new Set(), pt);
      if (!ta || !tb) return 0;
      return (ta[0] * tb[1] - ta[1] * tb[0]) * 10;
    },
  });
  if (ctx.g2) {
    out.push({
      vars,
      f: (x) => {
        const pt = ptAt(x);
        const ka = curvatureToward(sk, a, J, new Set(), pt), kb = curvatureToward(sk, b, J, new Set(), pt);
        if (ka === null || kb === null) return 0;
        return (ka + kb) * size;
      },
    });
  }
  return out;
}
