// Geometric constraint solver for 2D sketches.
// Levenberg–Marquardt over point coordinates and circle radii, with a
// sparse numeric Jacobian. Also reports which variables remain free so the
// UI can colour fully-constrained geometry black (as Fusion does).

const D2R = Math.PI / 180;

function solveLinear(A, b, n) {
  // Gaussian elimination with partial pivoting; A is n*n row-major (mutated)
  for (let k = 0; k < n; k++) {
    let piv = k;
    let max = Math.abs(A[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i * n + k]);
      if (v > max) { max = v; piv = i; }
    }
    if (max < 1e-14) continue;
    if (piv !== k) {
      for (let j = 0; j < n; j++) {
        const t = A[k * n + j]; A[k * n + j] = A[piv * n + j]; A[piv * n + j] = t;
      }
      const t = b[k]; b[k] = b[piv]; b[piv] = t;
    }
    const akk = A[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k] / akk;
      if (f === 0) continue;
      for (let j = k; j < n; j++) A[i * n + j] -= f * A[k * n + j];
      b[i] -= f * b[k];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j];
    const d = A[i * n + i];
    x[i] = Math.abs(d) < 1e-14 ? 0 : s / d;
  }
  return x;
}

function jacobiEigen(S, n, sweeps = 30) {
  // Symmetric eigen decomposition; returns {values, vectors(col-major n*n)}
  const A = Float64Array.from(S);
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sw = 0; sw < sweeps; sw++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (Math.abs(apq) < 1e-18) continue;
        const app = A[p * n + p], aqq = A[q * n + q];
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k * n + p], akq = A[k * n + q];
          A[k * n + p] = c * akp - s * akq;
          A[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p * n + k], aqk = A[q * n + k];
          A[p * n + k] = c * apk - s * aqk;
          A[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p], vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq;
          V[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = A[i * n + i];
  return { values, vectors: V };
}

/**
 * Build the variable map and residual list for a sketch.
 * opts.dims: map constraintId -> numeric value (already evaluated)
 * opts.pinned: Set of point ids held fixed for this solve (e.g. dragged)
 * extra.pinR: Set of circle/arc ids whose radius is held constant for this solve
 * extra.keep: [lineId] soft "keep your current length" residuals (flagged soft:true)
 */
export function buildSystem(sk, dimValues = {}, pinned = new Set(), extra = {}) {
  const pinR = extra.pinR || new Set();
  const idx = new Map(); // `${pointId}.x` -> var index
  const x0 = [];
  const fixedPts = new Set(pinned);
  for (const c of sk.constraints) if (c.type === "fix") for (const r of c.refs) {
    if (sk.points[r]) fixedPts.add(r);
    const cv = sk.curves[r];
    if (cv) for (const p of curvePoints(cv)) fixedPts.add(p);
  }
  for (const [id, p] of Object.entries(sk.points)) {
    if (p.fixed || fixedPts.has(id)) continue;
    idx.set(id + ".x", x0.length); x0.push(p.x);
    idx.set(id + ".y", x0.length); x0.push(p.y);
  }
  const fixedCurveR = new Set();
  for (const c of sk.constraints) if (c.type === "fix") for (const r of c.refs) if (sk.curves[r]) fixedCurveR.add(r);
  for (const [id, cv] of Object.entries(sk.curves)) {
    if (cv.type === "circle" || cv.type === "arc") {
      if (cv.proj || fixedCurveR.has(id) || pinR.has(id)) continue;
      idx.set(id + ".r", x0.length); x0.push(cv.r);
    }
  }
  const P = (pid) => {
    const p = sk.points[pid];
    const ix = idx.get(pid + ".x");
    if (ix === undefined) return { vars: [], get: () => [p.x, p.y] };
    const iy = ix + 1;
    return { vars: [ix, iy], get: (x) => [x[ix], x[iy]] };
  };
  const Rr = (cid) => {
    const cv = sk.curves[cid];
    const ir = idx.get(cid + ".r");
    if (ir === undefined) return { vars: [], get: () => cv.r };
    return { vars: [ir], get: (x) => x[ir] };
  };
  const res = []; // {vars, f, cid}
  const add = (cid, vars, f) => res.push({ vars: [...new Set(vars)], f, cid });
  const line = (lid) => {
    const l = sk.curves[lid];
    return [P(l.p1), P(l.p2)];
  };
  const circ = (cid) => {
    const c = sk.curves[cid];
    return [P(c.c), Rr(cid)];
  };
  // implicit arc constraints
  for (const [id, cv] of Object.entries(sk.curves)) {
    if (cv.type !== "arc") continue;
    const c = P(cv.c), r = Rr(id), a = P(cv.p1), b = P(cv.p2);
    add("arc:" + id, [...c.vars, ...r.vars, ...a.vars], (x) => {
      const [cx, cy] = c.get(x), [ax, ay] = a.get(x);
      return Math.hypot(ax - cx, ay - cy) - r.get(x);
    });
    add("arc:" + id, [...c.vars, ...r.vars, ...b.vars], (x) => {
      const [cx, cy] = c.get(x), [bx, by] = b.get(x);
      return Math.hypot(bx - cx, by - cy) - r.get(x);
    });
  }
  const isRound = (id) => sk.curves[id] && (sk.curves[id].type === "circle" || sk.curves[id].type === "arc");
  const isLine = (id) => sk.curves[id] && sk.curves[id].type === "line";
  const distPtLine = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1e-9;
    return ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
  };

  for (const c of sk.constraints) {
    if (c.suppressed) continue;
    const R = c.refs;
    const val = dimValues[c.id];
    switch (c.type) {
      case "coincident": {
        const [a, b] = [P(R[0]), P(R[1])];
        add(c.id, [...a.vars, ...b.vars], (x) => a.get(x)[0] - b.get(x)[0]);
        add(c.id, [...a.vars, ...b.vars], (x) => a.get(x)[1] - b.get(x)[1]);
        break;
      }
      case "onCurve": {
        const p = P(R[0]);
        if (isLine(R[1])) {
          const [a, b] = line(R[1]);
          add(c.id, [...p.vars, ...a.vars, ...b.vars], (x) => distPtLine(p.get(x), a.get(x), b.get(x)));
        } else if (isRound(R[1])) {
          const [cc, r] = circ(R[1]);
          add(c.id, [...p.vars, ...cc.vars, ...r.vars], (x) => {
            const pp = p.get(x), q = cc.get(x);
            return Math.hypot(pp[0] - q[0], pp[1] - q[1]) - r.get(x);
          });
        }
        break;
      }
      case "midpoint": {
        const p = P(R[0]);
        const [a, b] = line(R[1]);
        const v = [...p.vars, ...a.vars, ...b.vars];
        add(c.id, v, (x) => p.get(x)[0] - (a.get(x)[0] + b.get(x)[0]) / 2);
        add(c.id, v, (x) => p.get(x)[1] - (a.get(x)[1] + b.get(x)[1]) / 2);
        break;
      }
      case "horizontal":
      case "vertical": {
        const k = c.type === "horizontal" ? 1 : 0;
        let a, b;
        if (R.length === 1) [a, b] = line(R[0]);
        else [a, b] = [P(R[0]), P(R[1])];
        add(c.id, [...a.vars, ...b.vars], (x) => a.get(x)[k] - b.get(x)[k]);
        break;
      }
      case "parallel":
      case "perpendicular": {
        const [a, b] = line(R[0]), [d, e] = line(R[1]);
        add(c.id, [...a.vars, ...b.vars, ...d.vars, ...e.vars], (x) => {
          const A = a.get(x), B = b.get(x), D = d.get(x), E = e.get(x);
          const u = [B[0] - A[0], B[1] - A[1]], w = [E[0] - D[0], E[1] - D[1]];
          const lu = Math.hypot(...u) || 1e-9, lw = Math.hypot(...w) || 1e-9;
          const v = c.type === "parallel" ? u[0] * w[1] - u[1] * w[0] : u[0] * w[0] + u[1] * w[1];
          return (v / (lu * lw)) * 10;
        });
        break;
      }
      case "collinear": {
        const [a, b] = line(R[0]), [d, e] = line(R[1]);
        add(c.id, [...a.vars, ...b.vars, ...d.vars], (x) => distPtLine(d.get(x), a.get(x), b.get(x)));
        add(c.id, [...a.vars, ...b.vars, ...e.vars], (x) => distPtLine(e.get(x), a.get(x), b.get(x)));
        break;
      }
      case "equal": {
        if (isLine(R[0]) && isLine(R[1])) {
          const [a, b] = line(R[0]), [d, e] = line(R[1]);
          add(c.id, [...a.vars, ...b.vars, ...d.vars, ...e.vars], (x) => {
            const A = a.get(x), B = b.get(x), D = d.get(x), E = e.get(x);
            return Math.hypot(B[0] - A[0], B[1] - A[1]) - Math.hypot(E[0] - D[0], E[1] - D[1]);
          });
        } else if (isRound(R[0]) && isRound(R[1])) {
          const r1 = Rr(R[0]), r2 = Rr(R[1]);
          add(c.id, [...r1.vars, ...r2.vars], (x) => r1.get(x) - r2.get(x));
        }
        break;
      }
      case "concentric": {
        const a = P(sk.curves[R[0]].c), b = P(sk.curves[R[1]].c);
        add(c.id, [...a.vars, ...b.vars], (x) => a.get(x)[0] - b.get(x)[0]);
        add(c.id, [...a.vars, ...b.vars], (x) => a.get(x)[1] - b.get(x)[1]);
        break;
      }
      case "tangent": {
        let [l, k] = R;
        if (isLine(k)) [l, k] = [k, l];
        if (isLine(l) && isRound(k)) {
          const [a, b] = line(l), [cc, r] = circ(k);
          add(c.id, [...a.vars, ...b.vars, ...cc.vars, ...r.vars], (x) =>
            Math.abs(distPtLine(cc.get(x), a.get(x), b.get(x))) - r.get(x));
        } else if (isRound(l) && isRound(k)) {
          const [c1, r1] = circ(l), [c2, r2] = circ(k);
          const internal = c.mode === "int";
          add(c.id, [...c1.vars, ...r1.vars, ...c2.vars, ...r2.vars], (x) => {
            const A = c1.get(x), B = c2.get(x);
            const d = Math.hypot(A[0] - B[0], A[1] - B[1]);
            return internal ? d - Math.abs(r1.get(x) - r2.get(x)) : d - (r1.get(x) + r2.get(x));
          });
        }
        break;
      }
      case "symmetric": {
        const a = P(R[0]), b = P(R[1]);
        const [d, e] = line(R[2]);
        const v = [...a.vars, ...b.vars, ...d.vars, ...e.vars];
        add(c.id, v, (x) => {
          const A = a.get(x), B = b.get(x);
          return distPtLine([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], d.get(x), e.get(x));
        });
        add(c.id, v, (x) => {
          const A = a.get(x), B = b.get(x), D = d.get(x), E = e.get(x);
          const u = [B[0] - A[0], B[1] - A[1]], w = [E[0] - D[0], E[1] - D[1]];
          const lw = Math.hypot(...w) || 1e-9;
          return (u[0] * w[0] + u[1] * w[1]) / lw;
        });
        break;
      }
      case "fix":
        break;
      // ---- temporary soft "grab" used while dragging (never stored in a document) ----
      // {type:'grab', refs:[pointId|curveId], x, y, t?, w?}: pulls a point / the point at
      // parameter t of a line / the rim of a circle towards (x, y) with weight w.
      case "grab": {
        const w = c.w ?? 0.05;
        if (sk.points[R[0]]) {
          const p = P(R[0]);
          add(c.id, p.vars, (x) => w * (p.get(x)[0] - c.x));
          add(c.id, p.vars, (x) => w * (p.get(x)[1] - c.y));
        } else if (isLine(R[0])) {
          const [a, b] = line(R[0]);
          const t = c.t ?? 0.5;
          const v = [...a.vars, ...b.vars];
          add(c.id, v, (x) => { const A = a.get(x), B = b.get(x); return w * (A[0] + (B[0] - A[0]) * t - c.x); });
          add(c.id, v, (x) => { const A = a.get(x), B = b.get(x); return w * (A[1] + (B[1] - A[1]) * t - c.y); });
        } else if (isRound(R[0])) {
          const [cc, r] = circ(R[0]);
          add(c.id, [...cc.vars, ...r.vars], (x) => { const q = cc.get(x); return w * (Math.hypot(c.x - q[0], c.y - q[1]) - r.get(x)); });
        } else if (sk.curves[R[0]] && sk.curves[R[0]].type === "point") {
          const p = P(sk.curves[R[0]].p);
          add(c.id, p.vars, (x) => w * (p.get(x)[0] - c.x));
          add(c.id, p.vars, (x) => w * (p.get(x)[1] - c.y));
        }
        break;
      }
      // ---- driving dimensions ----
      case "distance": {
        if (val === undefined || c.driven) break;
        let a, b;
        if (R.length === 1) [a, b] = line(R[0]);
        else [a, b] = [P(R[0]), P(R[1])];
        const mode = c.dimType || "aligned";
        add(c.id, [...a.vars, ...b.vars], (x) => {
          const A = a.get(x), B = b.get(x);
          if (mode === "horizontal") return Math.abs(B[0] - A[0]) - val;
          if (mode === "vertical") return Math.abs(B[1] - A[1]) - val;
          return Math.hypot(B[0] - A[0], B[1] - A[1]) - val;
        });
        break;
      }
      case "pointLine": {
        if (val === undefined || c.driven) break;
        const p = P(R[0]);
        const [a, b] = line(R[1]);
        add(c.id, [...p.vars, ...a.vars, ...b.vars], (x) => Math.abs(distPtLine(p.get(x), a.get(x), b.get(x))) - val);
        break;
      }
      case "diameter":
      case "radius": {
        if (val === undefined || c.driven) break;
        const r = Rr(R[0]);
        const k = c.type === "diameter" ? 2 : 1;
        add(c.id, r.vars, (x) => k * r.get(x) - val);
        break;
      }
      case "angle": {
        if (val === undefined || c.driven) break;
        const s1 = c.flip1 ? -1 : 1, s2 = c.flip2 ? -1 : 1;
        if (R.length === 1) {
          // angle between one line and the sketch X axis (typed angle of a first Line segment)
          const [a, b] = line(R[0]);
          add(c.id, [...a.vars, ...b.vars], (x) => {
            const A = a.get(x), B = b.get(x);
            const u = [s1 * (B[0] - A[0]), s1 * (B[1] - A[1])];
            const ang = Math.abs(Math.atan2(-u[1] * s2, u[0] * s2));
            return (ang - val * D2R) * 20;
          });
          break;
        }
        const [a, b] = line(R[0]), [d, e] = line(R[1]);
        add(c.id, [...a.vars, ...b.vars, ...d.vars, ...e.vars], (x) => {
          const A = a.get(x), B = b.get(x), D = d.get(x), E = e.get(x);
          const u = [s1 * (B[0] - A[0]), s1 * (B[1] - A[1])], w = [s2 * (E[0] - D[0]), s2 * (E[1] - D[1])];
          const ang = Math.abs(Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1]));
          return (ang - val * D2R) * 20;
        });
        break;
      }
      default:
        break;
    }
  }
  // soft "keep the current length" terms (minimal-change preference: rotate a line rather than stretch it)
  for (const lid of extra.keep || []) {
    if (!isLine(lid)) continue;
    const [a, b] = line(lid);
    const A0 = a.get(x0), B0 = b.get(x0);
    const L0 = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]);
    const v = [...new Set([...a.vars, ...b.vars])];
    if (v.length) res.push({ vars: v, cid: "__keep", soft: true, f: (x) => { const A = a.get(x), B = b.get(x); return 0.1 * (Math.hypot(B[0] - A[0], B[1] - A[1]) - L0); } });
  }
  return { idx, x0, res, fixedPts };
}

export function curvePoints(cv) {
  if (cv.type === "line") return [cv.p1, cv.p2];
  if (cv.type === "circle") return [cv.c];
  if (cv.type === "arc") return [cv.c, cv.p1, cv.p2];
  if (cv.type === "point") return [cv.p];
  return [];
}

function evalRes(res, x) {
  const r = new Float64Array(res.length);
  for (let i = 0; i < res.length; i++) r[i] = res[i].f(x);
  return r;
}

function jacobian(res, x, n) {
  const m = res.length;
  const J = new Float64Array(m * n);
  const xx = Float64Array.from(x);
  for (let i = 0; i < m; i++) {
    const R = res[i];
    const f0 = R.f(xx);
    for (const j of R.vars) {
      const h = 1e-7 * Math.max(1, Math.abs(xx[j]));
      const old = xx[j];
      xx[j] = old + h;
      const f1 = R.f(xx);
      xx[j] = old - h;
      const f2 = R.f(xx);
      xx[j] = old;
      J[i * n + j] = Number.isFinite(f1) && Number.isFinite(f2) ? (f1 - f2) / (2 * h) : (f1 - f0) / h;
    }
  }
  return J;
}

/**
 * Levenberg–Marquardt from x over the residual list. stall: give up early when progress stalls
 * (used for the optional minimal-change stages, which fall back to a full solve).
 */
function levenberg(res, x, n, maxIter, stall = false) {
  x = Float64Array.from(x);
  let r = evalRes(res, x);
  let err = r.reduce((s, v) => s + v * v, 0);
  if (!res.length || !n) return { x, err };
  let lambda = 1e-3;
  const hist = [];
  for (let it = 0; it < maxIter && err > 1e-20; it++) {
    hist.push(err);
    if (stall && it >= 10 && err > 1e-10 && err > 0.5 * hist[it - 5]) break;
    const J = jacobian(res, x, n);
    const m = res.length;
    const JTJ = new Float64Array(n * n);
    const g = new Float64Array(n);
    for (let i = 0; i < m; i++) {
      const row = res[i].vars;
      for (const a of row) {
        const ja = J[i * n + a];
        if (ja === 0) continue;
        g[a] += ja * r[i];
        for (const b of row) JTJ[a * n + b] += ja * J[i * n + b];
      }
    }
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const A = Float64Array.from(JTJ);
      for (let k = 0; k < n; k++) A[k * n + k] += lambda * (1 + JTJ[k * n + k]);
      const b = g.map((v) => -v);
      const dx = solveLinear(A, b, n);
      const xn = x.map((v, k) => v + dx[k]);
      const rn = evalRes(res, xn);
      const en = rn.reduce((s, v) => s + v * v, 0);
      if (Number.isFinite(en) && en < err) {
        x = xn; r = rn; err = en;
        lambda = Math.max(lambda / 4, 1e-12);
        improved = true;
        break;
      }
      lambda *= 6;
    }
    if (!improved) break;
  }
  return { x, err };
}

// ---------- degenerate geometry (zero-length lines, zero radii, closed-up arcs) ----------
export const DEGENERATE_TOL = 1e-5;
function degenerateWith(sk, getP, getR) {
  const out = new Set();
  const d = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : Infinity);
  for (const [id, cv] of Object.entries(sk.curves)) {
    if (cv.type === "line") { if (d(getP(cv.p1), getP(cv.p2)) < DEGENERATE_TOL) out.add(id); }
    else if (cv.type === "circle" || cv.type === "arc") {
      const r = getR(id);
      if (Number.isFinite(r) && Math.abs(r) < DEGENERATE_TOL) out.add(id);
      if (cv.type === "arc" && d(getP(cv.p1), getP(cv.p2)) < DEGENERATE_TOL) out.add(id);
    }
  }
  return out;
}
/** Ids of curves that are degenerate at the sketch's stored positions. */
export function degenerateCurves(sk) {
  return degenerateWith(sk, (id) => (sk.points[id] ? [sk.points[id].x, sk.points[id].y] : null), (id) => sk.curves[id].r);
}
function degenerateAt(sk, idx, x) {
  return degenerateWith(sk, (id) => {
    const i = idx.get(id + ".x");
    if (i !== undefined) return [x[i], x[i + 1]];
    return sk.points[id] ? [sk.points[id].x, sk.points[id].y] : null;
  }, (id) => { const i = idx.get(id + ".r"); return i !== undefined ? x[i] : sk.curves[id].r; });
}
const newlyDegenerate = (sk, idx, x, before) => [...degenerateAt(sk, idx, x)].filter((id) => !before.has(id));

// ---------- minimal-change staging ----------
// A plain least-change step spreads a correction over every free variable: an undimensioned radius
// grows to meet a line, both circles of a Concentric meet half way, a symmetry axis drifts. Fusion
// instead keeps sizes and leaves the first selection in place: the entity picked first (and a
// symmetry line) stays, the later one moves; a point moves onto a curve / midpoint. So when some
// constraints are violated (a constraint was just added or a dimension changed), first try solving
// with those "anchor" entities and all radii held, then relax step by step; the plain solve is the
// last resort.
function constraintRoles(c) {
  const R = c.refs || [];
  switch (c.type) {
    case "onCurve": case "midpoint": case "pointLine": return { anchors: R.slice(1), movers: R.slice(0, 1) };
    case "symmetric": return { anchors: [R[0], R[2]], movers: [R[1]] };
    case "grab": case "fix": return null;
    default: return R.length >= 2 ? { anchors: R.slice(0, -1), movers: R.slice(-1) } : { anchors: [], movers: R.slice() };
  }
}
function stagePlans(sk, sys, pinned) {
  const x0 = Float64Array.from(sys.x0);
  const viol = new Set();
  for (const r of sys.res) {
    const v = r.f(x0);
    if (!Number.isFinite(v) || Math.abs(v) > 1e-7) viol.add(r.cid);
  }
  if (!viol.size) return [];
  const isRound = (id) => sk.curves[id] && (sk.curves[id].type === "circle" || sk.curves[id].type === "arc");
  const isLine = (id) => sk.curves[id] && sk.curves[id].type === "line";
  const ptsOf = (id) => (sk.points[id] ? [id] : sk.curves[id] ? curvePoints(sk.curves[id]) : []);
  const anchorPts = new Set(), moverPts = new Set(), sizeR = new Set(), moverRound = new Set(), keep = new Set();
  const directPts = new Set();
  for (const c of sk.constraints) {
    if (c.suppressed || !viol.has(c.id)) continue;
    const ro = constraintRoles(c);
    if (!ro) return []; // interactive drag (grab) or unknown: plain solve
    for (const a of ro.anchors) for (const p of ptsOf(a)) anchorPts.add(p);
    for (const m of ro.movers) {
      for (const p of ptsOf(m)) moverPts.add(p);
      if (sk.points[m]) directPts.add(m);
      if (isRound(m)) moverRound.add(m);
    }
    if ((c.type === "radius" || c.type === "diameter") && isRound(c.refs[0])) sizeR.add(c.refs[0]);
    if (c.type === "equal") for (const m of ro.movers) if (isRound(m)) sizeR.add(m);
    if (c.type === "angle" || c.type === "parallel" || c.type === "perpendicular" || c.type === "collinear") for (const m of ro.movers) if (isLine(m)) keep.add(m);
  }
  for (const cid of viol) if (typeof cid === "string" && cid.startsWith("arc:")) sizeR.add(cid.slice(4));
  // an arc whose end point is dragged onto something may change its radius (its other end stays)
  for (const [id, cv] of Object.entries(sk.curves)) if (cv.type === "arc" && (directPts.has(cv.p1) || directPts.has(cv.p2))) sizeR.add(id);
  const rounds = Object.keys(sk.curves).filter((id) => isRound(id) && !sk.curves[id].proj);
  const pinR1 = new Set(rounds.filter((id) => !sizeR.has(id)));
  const pinR2 = new Set([...pinR1].filter((id) => !moverRound.has(id)));
  const pinsA = new Set(pinned);
  // a point shared by the anchor and the moving curve (the vertex of an angle) stays: the curve
  // turns about it; only a point that is itself the moving selection is released
  for (const p of anchorPts) if (!directPts.has(p)) pinsA.add(p);
  const keepL = [...keep];
  const plans = [];
  const seen = new Set();
  const push = (pins, pinR) => {
    const key = [...pins].sort().join(",") + "|" + [...pinR].sort().join(",");
    if (seen.has(key)) return;
    seen.add(key);
    plans.push({ pins, pinR, keep: keepL });
  };
  push(pinsA, pinR1);
  push(pinsA, pinR2);
  push(new Set(pinned), pinR1);
  // the last plan equal to the plain solve adds nothing
  return plans.filter((p) => p.pins.size > pinned.size || p.pinR.size || p.keep.length);
}

/**
 * Solve the sketch in place. Returns {ok, error, freeVars:Set<string>, degenerate?:[curveId]}.
 * opts: {pinned:Set<pointId>, maxIter, writeOnFail, dof:false, staged:false (plain least-change only)}
 * A solution that collapses a curve (zero-length line, zero radius) counts as a failure.
 */
export function solveSketch(sk, dimValues = {}, opts = {}) {
  const pinned = opts.pinned || new Set();
  let sys = buildSystem(sk, dimValues, pinned);
  const degBefore = degenerateCurves(sk);
  let x = null;
  let ok = false;
  let err = 0;
  let degenerate = [];
  if (opts.staged !== false && sys.res.length && sys.x0.length) {
    for (const plan of stagePlans(sk, sys, pinned)) {
      const s = buildSystem(sk, dimValues, plan.pins, { pinR: plan.pinR, keep: plan.keep });
      const n = s.x0.length;
      let xs = Float64Array.from(s.x0);
      const hard = s.res.filter((r) => !r.soft);
      if (hard.length !== s.res.length) xs = levenberg(s.res, xs, n, 60, true).x;
      const out = levenberg(hard, xs, n, 80, true);
      if (!(out.err < 1e-10) || newlyDegenerate(sk, s.idx, out.x, degBefore).length) continue;
      for (const [key, i] of s.idx) {
        const [id, comp] = key.split(".");
        if (comp === "r") sk.curves[id].r = out.x[i];
        else sk.points[id][comp] = out.x[i];
      }
      sys = buildSystem(sk, dimValues, pinned);
      x = Float64Array.from(sys.x0);
      err = evalRes(sys.res, x).reduce((a, v) => a + v * v, 0);
      ok = true;
      break;
    }
  }
  const { idx, x0, res } = sys;
  const n = x0.length;
  if (!x) {
    const out = levenberg(res, x0, n, opts.maxIter || 120);
    x = out.x;
    err = out.err;
    ok = !(res.length && n) || err < 1e-10;
    degenerate = newlyDegenerate(sk, idx, x, degBefore);
    if (degenerate.length) ok = false;
    // write back
    if (ok || opts.writeOnFail) {
      for (const [key, i] of idx) {
        const [id, comp] = key.split(".");
        if (comp === "r") sk.curves[id].r = x[i];
        else sk.points[id][comp] = x[i];
      }
    }
  }
  // degrees of freedom analysis
  const freeVars = new Set();
  let nullity = opts.dof === false ? undefined : 0; // number of remaining degrees of freedom
  if (n) {
    if (!res.length) {
      for (const k of idx.keys()) freeVars.add(k);
      nullity = n;
    } else if (opts.dof !== false) {
      const J = jacobian(res, x, n);
      const m = res.length;
      // decouple: JᵀJ is block diagonal over groups of variables that share residuals, so the
      // eigen analysis runs per block (cheap for sketches made of many independent shapes)
      const parent = Int32Array.from({ length: n }, (_, i) => i);
      const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
      for (let i = 0; i < m; i++) {
        const row = res[i].vars;
        for (let k = 1; k < row.length; k++) { const ra = find(row[0]), rb = find(row[k]); if (ra !== rb) parent[ra] = rb; }
      }
      const blocks = new Map();
      for (let i = 0; i < n; i++) { const r = find(i); if (!blocks.has(r)) blocks.set(r, []); blocks.get(r).push(i); }
      const rowsOf = new Map();
      for (let i = 0; i < m; i++) {
        if (!res[i].vars.length) continue;
        const r = find(res[i].vars[0]);
        if (!rowsOf.has(r)) rowsOf.set(r, []);
        rowsOf.get(r).push(i);
      }
      // global scale for the zero-eigenvalue tolerance (max diagonal of JᵀJ bounds the spectrum)
      let maxDiag = 0;
      {
        const diag = new Float64Array(n);
        for (let i = 0; i < m; i++) for (const a of res[i].vars) diag[a] += J[i * n + a] ** 2;
        for (let i = 0; i < n; i++) maxDiag = Math.max(maxDiag, diag[i]);
      }
      const freeness = new Float64Array(n);
      for (const [r, vars] of blocks) {
        const k = vars.length;
        const local = new Map(vars.map((v, i) => [v, i]));
        const Sb = new Float64Array(k * k);
        for (const i of rowsOf.get(r) || []) {
          const row = res[i].vars;
          for (const a of row) for (const b of row) Sb[local.get(a) * k + local.get(b)] += J[i * n + a] * J[i * n + b];
        }
        const { values, vectors } = jacobiEigen(Sb, k, k > 120 ? 12 : 30);
        let maxv = 0;
        for (const v of values) maxv = Math.max(maxv, Math.abs(v));
        const tol = 1e-9 * Math.max(1, maxv, maxDiag);
        for (let c = 0; c < k; c++) {
          if (Math.abs(values[c]) > tol) continue;
          nullity++;
          for (let j = 0; j < k; j++) freeness[vars[j]] += vectors[j * k + c] ** 2;
        }
      }
      for (const [key, i] of idx) if (freeness[i] > 1e-6) freeVars.add(key);
    }
  }
  return { ok, error: err, freeVars, nVars: n, nRes: res.length, nullity, ...(degenerate.length ? { degenerate } : {}) };
}

/** Constraint residual check for detecting over-constraint before adding. */
export function residualOf(sk, dimValues, cid) {
  const { x0, res } = buildSystem(sk, dimValues);
  let s = 0;
  for (const r of res) if (r.cid === cid) s += r.f(Float64Array.from(x0)) ** 2;
  return Math.sqrt(s);
}
