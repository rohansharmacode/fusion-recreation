// More sketch curve types (geometry only; solver/regions/kernel hooks live in their own files).
//
//   cvspline {type:'cvspline', pts:[controlPointId...], degree:3|5, closed?}
//            Fusion's Control Point Spline: a clamped uniform B-spline through its first and last
//            control points (closed: periodic uniform B-spline). The control points are ordinary
//            sketch points (the solver moves them like any other point).
//   conic    {type:'conic', p1, p2, v, rho}
//            Fusion's Conic Curve: the rational quadratic Bezier p1 -> v (vertex, where the end
//            tangents meet) -> p2 with middle weight rho / (1 - rho); 0 < rho < 1 (0.5 = parabola).
//   text     {type:'text', mode:'box'|'path', frame?:[p0,p1,p2,p3], path?, layout, glyphs, ...}
//            Sketch text: glyph outlines (shaped by the UI with opentype.js and stored in the document)
//            laid out in a frame or along a path curve. Each glyph contour is a closed profile loop.
//   c3d      {type:'c3d', pts3:[[u,v,w]...], closed?, proj:true}
//            A fixed 3D sketch curve (Include 3D Geometry, Intersection Curve, Project to Surface,
//            Isoparametric Curve) in sketch-plane coordinates (w along the plane normal).
//
// cvspline and conic geometry is exposed as a "pcurve" geom with sub:'spline' made of cubic Bezier
// spans (exact for degree <= 3, cubic Hermite pieces otherwise), so regions, trim, picking and the
// kernel's profile-wire builder treat them exactly like fit point splines.
import { bezierAt, bezierDer } from "./curves.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const ptOf = (sk) => (q) => (sk.points[q] ? [sk.points[q].x, sk.points[q].y] : null);

export const isCurve2 = (cv) => !!cv && (cv.type === "cvspline" || cv.type === "conic");

// ---------------------------------------------------------------------------
// B-splines
// ---------------------------------------------------------------------------
/** Knot vector of a clamped uniform B-spline with n control points and degree p. */
export function clampedKnots(n, p) {
  const k = [];
  for (let i = 0; i <= p; i++) k.push(0);
  for (let i = 1; i < n - p; i++) k.push(i);
  for (let i = 0; i <= p; i++) k.push(n - p);
  return k;
}

/** Blossom of a B-spline on knot span k (U[k] <= t < U[k+1]) with arguments args (length p). */
function blossom(P, U, p, k, args) {
  const d = [];
  for (let i = 0; i <= p; i++) d.push(P[k - p + i].slice());
  for (let r = 1; r <= p; r++) {
    const a = args[r - 1];
    for (let j = p; j >= r; j--) {
      const i = k - p + j;
      const den = U[i + p - r + 1] - U[i];
      const al = den > 1e-14 ? (a - U[i]) / den : 0;
      d[j] = lerp(d[j - 1], d[j], al);
    }
  }
  return d[p];
}

/** Bezier control polygons (degree p) of every non-empty knot span: [{b:[...p+1 points], t0, t1}]. */
export function bsplineBeziers(P, U, p, lo = p, hi = U.length - p - 1) {
  const out = [];
  for (let k = lo; k < hi; k++) {
    const a = U[k], b = U[k + 1];
    if (b - a < 1e-12) continue;
    const pts = [];
    for (let j = 0; j <= p; j++) {
      const args = [];
      for (let q = 0; q < p - j; q++) args.push(a);
      for (let q = 0; q < j; q++) args.push(b);
      pts.push(blossom(P, U, p, k, args));
    }
    out.push({ b: pts, t0: a, t1: b });
  }
  return out;
}

/** Point / derivative of a degree-p Bezier at u (de Casteljau). */
export function bezierN(b, u) {
  let q = b.map((x) => x.slice());
  for (let r = 1; r < b.length; r++) for (let i = 0; i < b.length - r; i++) q[i] = lerp(q[i], q[i + 1], u);
  return q[0];
}
export function bezierNDer(b, u) {
  const n = b.length - 1;
  if (n < 1) return [0, 0];
  const d = [];
  for (let i = 0; i < n; i++) d.push([(b[i + 1][0] - b[i][0]) * n, (b[i + 1][1] - b[i][1]) * n]);
  return bezierN(d, u);
}

/** Cubic pieces of a Bezier of any degree: exact for degree <= 3, else m Hermite cubic pieces. */
function cubicPieces(b, m = 4) {
  const n = b.length - 1;
  if (n === 1) { const [a, c] = b; return [[a, lerp(a, c, 1 / 3), lerp(a, c, 2 / 3), c]]; }
  if (n === 2) { const [a, c, d] = b; return [[a, lerp(a, c, 2 / 3), lerp(d, c, 2 / 3), d]]; }
  if (n === 3) return [b.map((x) => x.slice())];
  const out = [];
  for (let i = 0; i < m; i++) {
    const u0 = i / m, u1 = (i + 1) / m, du = u1 - u0;
    const p0 = bezierN(b, u0), p3 = bezierN(b, u1);
    const d0 = bezierNDer(b, u0), d1 = bezierNDer(b, u1);
    out.push([p0, [p0[0] + (d0[0] * du) / 3, p0[1] + (d0[1] * du) / 3], [p3[0] - (d1[0] * du) / 3, p3[1] - (d1[1] * du) / 3], p3]);
  }
  return out;
}

/** pcurve geom from cubic Bezier spans of equal parameter length h. */
function spansGeom(spans, h, closed, id, extra = {}) {
  const ns = spans.length;
  if (!ns) return null;
  const loc = (t) => {
    let tt = t;
    if (closed) tt = ((t % ns) + ns) % ns;
    let i = Math.floor(tt);
    if (i >= ns) i = ns - 1;
    if (i < 0) i = 0;
    return [i, Math.min(1, Math.max(0, tt - i))];
  };
  return {
    kind: "pcurve", sub: "spline", id, closed, T: ns, spans, per: 24,
    fit: { h: Array.isArray(h) ? h : spans.map(() => h), P: [], m: [] },
    at: (t) => { const [i, u] = loc(t); return bezierAt(spans[i], u); },
    der: (t) => { const [i, u] = loc(t); return bezierDer(spans[i], u); },
    ...extra,
  };
}

/** Effective degree of a control point spline (lower while it has few control points). */
export function cvDegree(cv, n = (cv.pts || []).length) {
  const p = cv.degree === 5 ? 5 : cv.degree === 2 ? 2 : cv.degree === 1 ? 1 : 3;
  return Math.max(1, Math.min(p, n - 1));
}

/** Bezier spans (degree p) of a control point spline from its control points P (knots: optional clamped knot vector). */
export function cvBeziers(P, degree, closed, knots = null) {
  const n = P.length;
  if (n < 2) return [];
  const p = Math.max(1, Math.min(degree, n - 1));
  if (closed && n >= 3) {
    const Q = [...P, ...P.slice(0, p)];
    const U = [];
    for (let i = 0; i < Q.length + p + 1; i++) U.push(i);
    return bsplineBeziers(Q, U, p, p, n + p);
  }
  const U = Array.isArray(knots) && knots.length === n + p + 1 ? knots : clampedKnots(n, p);
  return bsplineBeziers(P, U, p);
}

export function cvsplineGeomFrom(P, degree, closed, id = null, knots = null) {
  const bz = cvBeziers(P, degree, closed && P.length >= 3, knots);
  if (!bz.length) return null;
  const m = bz[0].b.length - 1 > 3 ? 4 : 1;
  const spans = [];
  const hs = [];
  for (const s of bz) { const pc = cubicPieces(s.b, m); spans.push(...pc); for (let i = 0; i < pc.length; i++) hs.push(Math.max(1e-9, (s.t1 - s.t0) / m)); }
  return spansGeom(spans, hs, !!closed && P.length >= 3, id, { ctype: "cvspline", cps: P, degree: bz[0].b.length - 1, uSpans: bz.map((s) => [s.t0, s.t1]), pieces: m });
}

export function cvsplineGeom(sk, id, pt = ptOf(sk)) {
  const cv = sk.curves[id];
  if (!cv || cv.type !== "cvspline") return null;
  const P = [];
  for (const q of cv.pts) { const p = pt(q); if (!p) return null; P.push(p); }
  if (P.length < 2) return null;
  return cvsplineGeomFrom(P, cvDegree(cv, P.length), !!cv.closed, id, cv.closed ? null : cv.knots);
}

// ---------------------------------------------------------------------------
// conic
// ---------------------------------------------------------------------------
export const CONIC_PIECES = 8;
export function conicWeight(rho) {
  const r = Math.max(1e-4, Math.min(1 - 1e-4, Number(rho) || 0.5));
  return r / (1 - r);
}
/** Rational quadratic point / derivative at s in [0, 1]. */
export function conicAt(A, V, B, w, s) {
  const a = (1 - s) * (1 - s), b = 2 * w * s * (1 - s), c = s * s;
  const W = a + b + c;
  return [(a * A[0] + b * V[0] + c * B[0]) / W, (a * A[1] + b * V[1] + c * B[1]) / W];
}
export function conicDer(A, V, B, w, s) {
  const a = (1 - s) * (1 - s), b = 2 * w * s * (1 - s), c = s * s;
  const da = -2 * (1 - s), db = 2 * w * (1 - 2 * s), dc = 2 * s;
  const W = a + b + c, dW = da + db + dc;
  const N = [a * A[0] + b * V[0] + c * B[0], a * A[1] + b * V[1] + c * B[1]];
  const dN = [da * A[0] + db * V[0] + dc * B[0], da * A[1] + db * V[1] + dc * B[1]];
  return [(dN[0] * W - N[0] * dW) / (W * W), (dN[1] * W - N[1] * dW) / (W * W)];
}
export function conicGeomFrom(A, V, B, rho, id = null) {
  if (!A || !V || !B) return null;
  if (len(sub(A, B)) < 1e-12) return null;
  const w = conicWeight(rho);
  const m = CONIC_PIECES, spans = [];
  for (let i = 0; i < m; i++) {
    const s0 = i / m, s1 = (i + 1) / m, ds = s1 - s0;
    const p0 = conicAt(A, V, B, w, s0), p3 = conicAt(A, V, B, w, s1);
    const d0 = conicDer(A, V, B, w, s0), d1 = conicDer(A, V, B, w, s1);
    spans.push([p0, [p0[0] + (d0[0] * ds) / 3, p0[1] + (d0[1] * ds) / 3], [p3[0] - (d1[0] * ds) / 3, p3[1] - (d1[1] * ds) / 3], p3]);
  }
  return spansGeom(spans, 1 / m, false, id, { ctype: "conic", A, V, B, w, rho });
}
export function conicGeom(sk, id, pt = ptOf(sk)) {
  const cv = sk.curves[id];
  if (!cv || cv.type !== "conic") return null;
  return conicGeomFrom(pt(cv.p1), pt(cv.v), pt(cv.p2), cv.rho, id);
}

/**
 * Split a conic at parameter s (0..1 along the conic): two conics [{A, V, B, rho}] in standard form
 * (end weights 1), so each piece is again a Fusion conic curve with its own vertex and Rho.
 */
export function splitConic(A, V, B, rho, s) {
  const w = conicWeight(rho);
  // homogeneous control points
  const H = [[A[0], A[1], 1], [V[0] * w, V[1] * w, w], [B[0], B[1], 1]];
  const L = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  const a1 = L(H[0], H[1], s), b1 = L(H[1], H[2], s), m = L(a1, b1, s);
  const norm = (h0, h1, h2) => {
    // reparametrize so end weights are 1: w' = h1.w / sqrt(h0.w * h2.w)
    const w0 = h0[2], w1 = h1[2], w2 = h2[2];
    const wn = w1 / Math.sqrt(Math.abs(w0 * w2));
    const P0 = [h0[0] / w0, h0[1] / w0], P1 = [h1[0] / w1, h1[1] / w1], P2 = [h2[0] / w2, h2[1] / w2];
    return { A: P0, V: P1, B: P2, rho: wn / (1 + wn) };
  };
  return [norm(H[0], a1, m), norm(m, b1, H[2])];
}

// ---------------------------------------------------------------------------
// text
// ---------------------------------------------------------------------------
/** Placement frame of a box text: origin (bottom-left), baseline direction, up direction, size. */
export function textFrame(sk, cv, pt = ptOf(sk)) {
  if (!cv.frame || cv.frame.length < 4) return null;
  const [a, b, , d] = cv.frame.map(pt);
  if (!a || !b || !d) return null;
  const ux0 = sub(b, a), uy0 = sub(d, a);
  const w = len(ux0), h = len(uy0);
  if (w < 1e-9 || h < 1e-9) return null;
  const ux = [ux0[0] / w, ux0[1] / w];
  // the frame may be drawn either way round: "up" is the side of d
  const s = Math.sign(ux[0] * uy0[1] - ux[1] * uy0[0]) || 1;
  const uy = [-ux[1] * s, ux[0] * s];
  return { o: a, ux, uy, w, h, flip: s < 0 };
}

/**
 * Text glyph contours in sketch coordinates: [[{kind:'line'|'bez', a, b, c1?, c2?}...]...] (each
 * contour closed). Layout data (font units -> em): cv.layout = {lines:[{w, g:[[x, glyphKey]]}],
 * asc, desc, ul?:[pos, thickness]}, cv.glyphs = {key: {c:[[segments...]]}} with segments
 * ['M',x,y] / ['L',x,y] / ['Q',cx,cy,x,y] / ['C',c1x,c1y,c2x,c2y,x,y] in em units (y up).
 * size = height in sketch units; spacing (percent of the font default) is applied by the UI.
 */
export function textContours(sk, id, pathGeomOf = null, pt = ptOf(sk), sizeOverride) {
  const cv = sk.curves[id];
  if (!cv || cv.type !== "text" || !cv.layout || !cv.glyphs) return [];
  const H = Number.isFinite(sizeOverride) ? sizeOverride : Number(cv.size) > 0 ? Number(cv.size) : 5;
  const L = cv.layout;
  const lines = L.lines || [];
  const lh = (L.lh || 1.2) * H; // line pitch
  const placed = []; // per glyph: transform (em -> sketch)
  if (cv.mode === "path") {
    const g = pathGeomOf ? pathGeomOf(cv.path) : null;
    if (!g) return [];
    const S = arcLengthTable(g);
    const total = S.total;
    const line = lines[0] || { w: 0, g: [] };
    const glyphs = line.g || [];
    const widthEm = line.w || 0;
    const n = glyphs.length;
    let scaleX = 1, start = 0;
    const tw = widthEm * H;
    if (cv.fit && n > 1) {
      // Fit to Path: the glyphs spread evenly over the whole path
      scaleX = total > 0 && tw > 0 ? total / tw : 1;
      start = 0;
    } else {
      const al = cv.halign || "left";
      start = al === "center" ? (total - tw) / 2 : al === "right" ? total - tw : 0;
    }
    const below = cv.above === false;
    // the text reads left to right: a path running right-to-left at its middle is followed backwards
    const dm = g.der(S.locate(total / 2));
    const backwards = dm[0] < -1e-9 || (Math.abs(dm[0]) <= 1e-9 && dm[1] < 0);
    const rev = !!cv.flipH !== backwards;
    for (const [x, key, adv] of glyphs) {
      const gw = (adv || 0) * H;
      // arc length of the glyph's centre
      let sMid = start + (x * H + gw / 2) * scaleX;
      if (rev) sMid = total - sMid;
      const at = S.locate(Math.max(0, Math.min(total, sMid)));
      const p = g.at(at), dv = g.der(at);
      const l = len(dv) || 1;
      let ux = [dv[0] / l, dv[1] / l];
      if (rev) ux = [-ux[0], -ux[1]];
      let uy = [-ux[1], ux[0]];
      let base = p;
      if (below) base = [p[0] - uy[0] * H * (L.asc || 0.75), p[1] - uy[1] * H * (L.asc || 0.75)];
      if (cv.flipV) { uy = [-uy[0], -uy[1]]; if (!below) base = [p[0] - uy[0] * H * (L.asc || 0.75), p[1] - uy[1] * H * (L.asc || 0.75)]; else base = p; }
      const ox = -gw / 2;
      placed.push({ key, T: (u, v) => { const X = u * H + ox, Y = v * H; return [base[0] + ux[0] * X + uy[0] * Y, base[1] + ux[1] * X + uy[1] * Y]; } });
    }
  } else {
    const F = textFrame(sk, cv, pt);
    if (!F) return [];
    const asc = (L.asc || 0.75) * H, desc = (L.desc || 0.25) * H;
    const blockH = asc + desc + Math.max(0, lines.length - 1) * lh;
    const va = cv.valign || "bottom";
    // first baseline measured down from the frame's top edge
    let top = F.h;
    if (va === "middle") top = F.h / 2 + blockH / 2;
    else if (va === "bottom") top = blockH;
    lines.forEach((ln, li) => {
      const lw = (ln.w || 0) * H;
      const ha = cv.halign || "left";
      const x0 = ha === "center" ? (F.w - lw) / 2 : ha === "right" ? F.w - lw : 0;
      const yb = top - asc - li * lh;
      for (const [x, key] of ln.g || []) {
        let X0 = x0 + x * H, Y0 = yb;
        placed.push({
          key,
          T: (u, v) => {
            let X = X0 + u * H, Y = Y0 + v * H;
            if (cv.flipH) X = F.w - X;
            if (cv.flipV) Y = F.h - Y;
            return [F.o[0] + F.ux[0] * X + F.uy[0] * Y, F.o[1] + F.ux[1] * X + F.uy[1] * Y];
          },
        });
      }
      if (cv.underline && L.ul && lw > 0) {
        const [pos, th] = L.ul;
        const y0 = yb + pos * H - (th * H) / 2, y1 = y0 + th * H;
        placed.push({ key: null, rect: [x0, y0, x0 + lw, y1], T: (X, Y) => { if (cv.flipH) X = F.w - X; if (cv.flipV) Y = F.h - Y; return [F.o[0] + F.ux[0] * X + F.uy[0] * Y, F.o[1] + F.ux[1] * X + F.uy[1] * Y]; } });
      }
    });
  }
  const out = [];
  for (const pl of placed) {
    if (pl.rect) {
      const [x0, y0, x1, y1] = pl.rect;
      const q = [pl.T(x0, y0), pl.T(x1, y0), pl.T(x1, y1), pl.T(x0, y1)];
      out.push(q.map((a, i) => ({ kind: "line", a, b: q[(i + 1) % 4] })));
      continue;
    }
    const gl = cv.glyphs[pl.key];
    if (!gl || !gl.c) continue;
    for (const c of gl.c) {
      const segs = [];
      let cur = null, start = null;
      for (const s of c) {
        if (s[0] === "M") { cur = pl.T(s[1], s[2]); start = cur; }
        else if (s[0] === "L") { const b = pl.T(s[1], s[2]); if (cur && len(sub(b, cur)) > 1e-9) segs.push({ kind: "line", a: cur, b }); cur = b; }
        else if (s[0] === "Q") {
          const q = pl.T(s[1], s[2]), b = pl.T(s[3], s[4]);
          segs.push({ kind: "bez", a: cur, c1: lerp(cur, q, 2 / 3), c2: lerp(b, q, 2 / 3), b });
          cur = b;
        } else if (s[0] === "C") {
          const c1 = pl.T(s[1], s[2]), c2 = pl.T(s[3], s[4]), b = pl.T(s[5], s[6]);
          segs.push({ kind: "bez", a: cur, c1, c2, b });
          cur = b;
        }
      }
      if (cur && start && len(sub(cur, start)) > 1e-9) segs.push({ kind: "line", a: cur, b: start });
      if (segs.length >= 2 || (segs.length === 1 && segs[0].kind === "bez")) out.push(segs);
    }
  }
  return out;
}

/** Polyline of one text contour. */
export function contourPolyline(segs, per = 8) {
  const out = [];
  for (const s of segs) {
    if (!out.length) out.push(s.a);
    if (s.kind === "line") out.push(s.b);
    else { const b = [s.a, s.c1, s.c2, s.b]; for (let i = 1; i <= per; i++) out.push(bezierAt(b, i / per)); }
  }
  return out;
}

/** Arc-length table of a pcurve / line / arc geom: {total, locate(s) -> parameter}. */
export function arcLengthTable(g) {
  const N = Math.max(64, Math.ceil((g.T || 1) * 48));
  const T = g.T || 1;
  const ts = [0], ss = [0];
  let prev = g.at(0), acc = 0;
  for (let i = 1; i <= N; i++) {
    const t = (T * i) / N;
    const p = g.at(t);
    acc += len(sub(p, prev));
    prev = p;
    ts.push(t); ss.push(acc);
  }
  return {
    total: acc,
    locate(s) {
      if (s <= 0) return 0;
      if (s >= acc) return T;
      let lo = 0, hi = N;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] < s) lo = m; else hi = m; }
      const f = (s - ss[lo]) / ((ss[hi] - ss[lo]) || 1);
      return ts[lo] + (ts[hi] - ts[lo]) * f;
    },
  };
}

/** A line / arc / circle geom from regions.js as a pcurve-like {at, der, T} (for text paths). */
export function asParametric(g) {
  if (!g) return null;
  if (g.kind === "pcurve") return g;
  if (g.kind === "line") return { T: 1, at: (t) => lerp(g.a, g.b, t), der: () => sub(g.b, g.a) };
  const a0 = g.kind === "circle" ? 0 : g.a0, sw = g.kind === "circle" ? Math.PI * 2 : g.sweep;
  return {
    T: 1,
    at: (t) => [g.c[0] + g.r * Math.cos(a0 + sw * t), g.c[1] + g.r * Math.sin(a0 + sw * t)],
    der: (t) => [-g.r * sw * Math.sin(a0 + sw * t), g.r * sw * Math.cos(a0 + sw * t)],
  };
}

// ---------------------------------------------------------------------------
// curvature helpers
// ---------------------------------------------------------------------------
/** Signed curvature of a pcurve at parameter t (finite differences of der). */
export function pcurveCurvature(g, t) {
  const h = 1e-4 * Math.max(1, g.T);
  const ta = Math.max(0, Math.min(g.T, t - h)), tb = Math.max(0, Math.min(g.T, t + h));
  const d1 = g.der(t);
  const d2 = [(g.der(tb)[0] - g.der(ta)[0]) / (tb - ta), (g.der(tb)[1] - g.der(ta)[1]) / (tb - ta)];
  const l = len(d1);
  if (l < 1e-12) return 0;
  return (d1[0] * d2[1] - d1[1] * d2[0]) / (l * l * l);
}
