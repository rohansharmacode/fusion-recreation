// Planar arrangement of sketch curves -> closed profiles (regions).
// Curves are split at every intersection, dangling edges are pruned, and the
// faces of the resulting planar graph are traced with a half-edge walk.
// Splines and ellipses take part as parametric "pcurve" geoms (see curves.js).
import { freeformGeom, pcurveIntersect, pcurveNearest, pcurveSamples, bezierAt, bezierDer } from "./curves.js";
import { textContours, contourPolyline, asParametric } from "./curves2.js";

const TAU = Math.PI * 2;
const EPS = 1e-6;

const norm = (a) => ((a % TAU) + TAU) % TAU;

export function curveGeom(sk, id) {
  const cv = sk.curves[id];
  const P = (pid) => [sk.points[pid].x, sk.points[pid].y];
  if (cv.type === "spline" || cv.type === "ellipse" || cv.type === "earc" || cv.type === "cvspline" || cv.type === "conic") return freeformGeom(sk, id);
  if (cv.type === "text" || cv.type === "c3d") return null;
  if (cv.type === "line") return { kind: "line", id, a: P(cv.p1), b: P(cv.p2) };
  if (cv.type === "circle") {
    const c = P(cv.c);
    return { kind: "circle", id, c, r: Math.abs(cv.r) };
  }
  if (cv.type === "arc") {
    const c = P(cv.c), a = P(cv.p1), b = P(cv.p2);
    const r = Math.abs(cv.r);
    const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
    const a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
    let sweep = norm(a1 - a0);
    if (sweep < 1e-9) sweep = TAU;
    return { kind: "arc", id, c, r, a0, sweep, pa: a, pb: b };
  }
  return null;
}

// point on curve at param
function at(g, t) {
  if (g.kind === "line") return [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t];
  if (g.kind === "pcurve") return g.at(t);
  const ang = g.kind === "circle" ? t : g.a0 + t;
  return [g.c[0] + g.r * Math.cos(ang), g.c[1] + g.r * Math.sin(ang)];
}

// param of a point known to lie on the curve; returns null if outside range
function paramOf(g, p, tol) {
  if (g.kind === "pcurve") {
    const n = pcurveNearest(g, p);
    if (!n || n.d > Math.max(tol * 10, 1e-9)) return null;
    return g.closed ? ((n.t % g.T) + g.T) % g.T : Math.max(0, Math.min(g.T, n.t));
  }
  if (g.kind === "line") {
    const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1];
    const L2 = dx * dx + dy * dy;
    if (L2 < 1e-18) return null;
    const t = ((p[0] - g.a[0]) * dx + (p[1] - g.a[1]) * dy) / L2;
    const L = Math.sqrt(L2);
    if (t < -tol / L || t > 1 + tol / L) return null;
    return Math.min(1, Math.max(0, t));
  }
  const ang = Math.atan2(p[1] - g.c[1], p[0] - g.c[0]);
  if (g.kind === "circle") return norm(ang);
  let s = norm(ang - g.a0);
  const angTol = tol / Math.max(g.r, 1e-9);
  if (s > g.sweep + angTol) {
    if (TAU - s < angTol) s = 0;
    else return null;
  }
  return Math.min(s, g.sweep);
}

function onCurveDist(g, p) {
  if (g.kind === "pcurve") { const n = pcurveNearest(g, p); return n ? n.d : Infinity; }
  if (g.kind === "line") {
    const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1];
    const L = Math.hypot(dx, dy) || 1e-12;
    return Math.abs(((p[0] - g.a[0]) * dy - (p[1] - g.a[1]) * dx) / L);
  }
  return Math.abs(Math.hypot(p[0] - g.c[0], p[1] - g.c[1]) - g.r);
}

function circleOf(g) {
  return { c: g.c, r: g.r };
}

/** All intersection points between two curve geometries. */
export function intersect(g1, g2, tol = 1e-6) {
  const pts = [];
  if (g1.kind === "pcurve" || g2.kind === "pcurve") {
    // parametric curves: roots along the pcurve, kept when they fall inside the other curve's range
    const [P, Q] = g1.kind === "pcurve" ? [g1, g2] : [g2, g1];
    for (const r of pcurveIntersect(P, Q, tol)) {
      if (Q.kind !== "pcurve" && paramOf(Q, r.p, tol) === null) continue;
      pts.push(r.p);
    }
    return pts;
  }
  const push = (p) => {
    if (paramOf(g1, p, tol) !== null && paramOf(g2, p, tol) !== null) pts.push(p);
  };
  if (g1.kind === "line" && g2.kind === "line") {
    const [x1, y1] = g1.a, [x2, y2] = g1.b, [x3, y3] = g2.a, [x4, y4] = g2.b;
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(d) < 1e-12) {
      // parallel: check endpoint overlaps (collinear touching)
      for (const p of [g2.a, g2.b]) if (onCurveDist(g1, p) < tol) push(p);
      for (const p of [g1.a, g1.b]) if (onCurveDist(g2, p) < tol) push(p);
      return pts;
    }
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
    push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]);
    // also endpoint-on-curve (handles near-tangent numerics)
    return pts;
  }
  if (g1.kind === "line" || g2.kind === "line") {
    const L = g1.kind === "line" ? g1 : g2;
    const C = circleOf(g1.kind === "line" ? g2 : g1);
    const dx = L.b[0] - L.a[0], dy = L.b[1] - L.a[1];
    const fx = L.a[0] - C.c[0], fy = L.a[1] - C.c[1];
    const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - C.r * C.r;
    let disc = b * b - 4 * a * c;
    const scaleTol = 2 * tol * Math.sqrt(a) * C.r * 4;
    if (disc < -scaleTol) return pts;
    if (disc < 0) disc = 0;
    const sq = Math.sqrt(disc);
    const ts = disc === 0 ? [-b / (2 * a)] : [(-b - sq) / (2 * a), (-b + sq) / (2 * a)];
    for (const t of ts) push([L.a[0] + t * dx, L.a[1] + t * dy]);
    return pts;
  }
  // circle/arc vs circle/arc
  const A = circleOf(g1), B = circleOf(g2);
  const dx = B.c[0] - A.c[0], dy = B.c[1] - A.c[1];
  const d = Math.hypot(dx, dy);
  if (d < 1e-12) return pts; // concentric (identical circles ignored)
  if (d > A.r + B.r + tol || d < Math.abs(A.r - B.r) - tol) return pts;
  const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d);
  let h2 = A.r * A.r - a * a;
  if (h2 < 0) h2 = 0;
  const h = Math.sqrt(h2);
  const mx = A.c[0] + (a * dx) / d, my = A.c[1] + (a * dy) / d;
  if (h < tol) push([mx, my]);
  else {
    push([mx + (h * -dy) / d, my + (h * dx) / d]);
    push([mx - (h * -dy) / d, my - (h * dx) / d]);
  }
  return pts;
}

function sampleEdge(e, fwd, segsFull = 64) {
  // returns points from start->end following half-edge direction (excluding start)
  const out = [];
  if (e.kind === "line") {
    out.push(fwd ? e.pv : e.pu);
    return out;
  }
  if (e.kind === "pcurve") {
    const g = e.g;
    const n = Math.max(2, Math.ceil(((e.t1 - e.t0) / g.T) * Math.max(segsFull, g.T * g.per)));
    for (let i = 1; i <= n; i++) {
      const t = fwd ? e.t0 + ((e.t1 - e.t0) * i) / n : e.t1 - ((e.t1 - e.t0) * i) / n;
      out.push(i === n ? (fwd ? e.pv : e.pu) : g.at(t));
    }
    return out;
  }
  const n = Math.max(2, Math.ceil((e.sweep / TAU) * segsFull));
  for (let i = 1; i <= n; i++) {
    const s = fwd ? (e.sweep * i) / n : e.sweep * (1 - i / n);
    const ang = e.s0 + s;
    out.push([e.c[0] + e.r * Math.cos(ang), e.c[1] + e.r * Math.sin(ang)]);
  }
  return out;
}

function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

// Exact signed area of a cycle (Green: 1/2 of the sum of x dy - y dx along each half-edge), so a
// profile's "Area" is exact for arcs, ellipses and splines rather than its sampled polygon's.
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const GL5 = [[0, 0.5688888888888889], [-0.5384693101056831, 0.4786286704993665], [0.5384693101056831, 0.4786286704993665], [-0.906179845938664, 0.2369268850561891], [0.906179845938664, 0.2369268850561891]];
function halfEdgeArea2(h, vertices) {
  const e = h.e;
  const a = vertices[h.from], b = vertices[h.to];
  if (e.kind === "line") return cross2(a, b);
  // curved edges: ∫ (P - c) x dP (exact) + c x (b - a) with the loop's own vertices, so the sum
  // stays consistent with the neighbouring line edges (chord + segment area)
  const ba = [b[0] - a[0], b[1] - a[1]];
  if (e.kind === "arc") {
    const sw = h.fwd ? e.sweep : -e.sweep;
    return e.r * e.r * sw + cross2(e.c, ba);
  }
  if (e.kind === "pcurve") {
    const g = e.g;
    const t0 = h.fwd ? e.t0 : e.t1, t1 = h.fwd ? e.t1 : e.t0;
    if (g.sub === "ellipse") return g.E.r1 * g.E.r2 * (t1 - t0) + cross2(g.E.c, ba);
    // spline: piecewise cubic in t, integrate (P - a) x P' span by span with 5-point Gauss (exact for degree 5)
    let s = cross2(a, b);
    const lo = Math.min(t0, t1), hi = Math.max(t0, t1);
    const brk = [lo];
    for (let k = Math.floor(lo) + 1; k < hi; k++) brk.push(k);
    brk.push(hi);
    let q = 0;
    for (let i = 0; i + 1 < brk.length; i++) {
      const u0 = brk[i], u1 = brk[i + 1], hm = (u1 - u0) / 2, mid = (u0 + u1) / 2;
      if (hm <= 0) continue;
      for (const [x, w] of GL5) {
        const t = mid + hm * x;
        const P = g.at(t);
        q += w * hm * cross2([P[0] - a[0], P[1] - a[1]], g.der(t));
      }
    }
    return s + (t1 >= t0 ? q : -q);
  }
  return 0;
}
function cycleArea(hes, vertices) {
  let s = 0;
  for (const h of hes) s += halfEdgeArea2(h, vertices);
  return s / 2;
}

export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Compute closed profiles for a sketch.
 * @returns {{regions: Array, edges: Array, vertices: Array}}
 */
export function computeRegions(sk) {
  const geoms = [];
  for (const id of Object.keys(sk.curves)) {
    const cv = sk.curves[id];
    if (cv.cons || cv.type === "point") continue;
    let g = null;
    try { g = curveGeom(sk, id); } catch { g = null; }
    if (!g) continue;
    if (g.kind === "line" && Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) < 1e-9) continue;
    if (g.kind === "pcurve") {
      const S = pcurveSamples(g);
      let L = 0;
      for (let k = 1; k < S.length; k++) L += Math.hypot(S[k].p[0] - S[k - 1].p[0], S[k].p[1] - S[k - 1].p[1]);
      if (!(L > 1e-9)) continue;
    } else if (g.kind !== "line" && g.r < 1e-9) continue;
    geoms.push(g);
  }
  // scale-aware tolerance
  let ext = 1;
  for (const g of geoms) {
    if (g.kind === "line") ext = Math.max(ext, Math.abs(g.a[0]), Math.abs(g.a[1]), Math.abs(g.b[0]), Math.abs(g.b[1]));
    else if (g.kind === "pcurve") for (const s of pcurveSamples(g)) ext = Math.max(ext, Math.abs(s.p[0]), Math.abs(s.p[1]));
    else ext = Math.max(ext, Math.abs(g.c[0]) + g.r, Math.abs(g.c[1]) + g.r);
  }
  const tol = Math.max(1e-7, ext * 1e-8) * 100;

  const vertices = [];
  const vid = (p) => {
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if (Math.abs(v[0] - p[0]) < tol && Math.abs(v[1] - p[1]) < tol) return i;
    }
    vertices.push([p[0], p[1]]);
    return vertices.length - 1;
  };
  const splits = geoms.map((g) => {
    const s = [];
    if (g.kind === "line") { s.push(0, 1); vid(g.a); vid(g.b); }
    else if (g.kind === "arc") { s.push(0, g.sweep); vid(g.pa); vid(g.pb); }
    else if (g.kind === "pcurve" && !g.closed) { s.push(0, g.T); vid(g.at(0)); vid(g.at(g.T)); }
    return s;
  });
  for (let i = 0; i < geoms.length; i++) {
    for (let j = i + 1; j < geoms.length; j++) {
      for (const p of intersect(geoms[i], geoms[j], tol)) {
        const pi = paramOf(geoms[i], p, tol), pj = paramOf(geoms[j], p, tol);
        if (pi === null || pj === null) continue;
        splits[i].push(pi);
        splits[j].push(pj);
      }
    }
  }
  // build edges
  const edges = [];
  geoms.forEach((g, gi) => {
    let s = [...new Set(splits[gi].map((v) => +v.toFixed(12)))].sort((a, b) => a - b);
    if (g.kind === "pcurve") {
      // drop split parameters whose points coincide (within tol) with the previous one
      const far = (t0, t1) => { const a = g.at(t0), b = g.at(t1); return Math.hypot(a[0] - b[0], a[1] - b[1]) > tol || Math.abs(t1 - t0) > 0.25 * g.T; };
      if (g.closed) {
        s = s.filter((v, k) => k === 0 || far(s[k - 1], v));
        if (s.length > 1 && !far(s[s.length - 1], s[0] + g.T)) s.pop();
        if (s.length === 0) s = [0];
        for (let k = 0; k < s.length; k++) {
          const t0 = s[k], t1 = k + 1 < s.length ? s[k + 1] : s[0] + g.T;
          const u = vid(g.at(t0)), v = vid(g.at(t1));
          edges.push({ kind: "pcurve", curve: g.id, u, v, pu: vertices[u], pv: vertices[v], g, t0, t1 });
        }
      } else {
        const keep = [s[0]];
        for (let k = 1; k < s.length; k++) {
          if (far(keep[keep.length - 1], s[k])) keep.push(s[k]);
          else if (k === s.length - 1) keep[keep.length - 1] = s[k]; // keep the true end parameter
        }
        s = keep;
        for (let k = 0; k + 1 < s.length; k++) {
          const u = vid(g.at(s[k])), v = vid(g.at(s[k + 1]));
          if (u === v && !(s.length === 2)) continue;
          edges.push({ kind: "pcurve", curve: g.id, u, v, pu: vertices[u], pv: vertices[v], g, t0: s[k], t1: s[k + 1] });
        }
      }
      return;
    }
    if (g.kind === "line") {
      const L = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
      s = s.filter((v, k) => k === 0 || (v - s[k - 1]) * L > tol);
      for (let k = 0; k + 1 < s.length; k++) {
        const pa = at(g, s[k]), pb = at(g, s[k + 1]);
        const u = vid(pa), v = vid(pb);
        if (u === v) continue;
        edges.push({ kind: "line", curve: g.id, u, v, pu: vertices[u], pv: vertices[v], t0: s[k], t1: s[k + 1] });
      }
    } else {
      const angTol = tol / g.r;
      if (g.kind === "circle") {
        s = s.filter((v, k) => k === 0 || v - s[k - 1] > angTol);
        if (s.length > 1 && TAU - s[s.length - 1] + s[0] < angTol) s.pop();
        if (s.length === 0) s = [0];
        for (let k = 0; k < s.length; k++) {
          const s0 = s[k];
          const s1 = k + 1 < s.length ? s[k + 1] : s[0] + TAU;
          const pa = at(g, s0), pb = at(g, s1);
          const u = vid(pa), v = vid(pb);
          edges.push({ kind: "arc", curve: g.id, u, v, pu: vertices[u], pv: vertices[v], c: g.c, r: g.r, s0, sweep: s1 - s0 });
        }
      } else {
        s = s.filter((v, k) => k === 0 || v - s[k - 1] > angTol);
        for (let k = 0; k + 1 < s.length; k++) {
          const pa = at(g, s[k]), pb = at(g, s[k + 1]);
          const u = vid(pa), v = vid(pb);
          const closed = u === v && Math.abs(g.sweep - TAU) < 1e-9;
          if (u === v && !closed) continue;
          edges.push({ kind: "arc", curve: g.id, u, v, pu: vertices[u], pv: vertices[v], c: g.c, r: g.r, s0: g.a0 + s[k], sweep: s[k + 1] - s[k] });
        }
      }
    }
  });
  // prune dangling edges
  let alive = edges.map(() => true);
  for (let changed = true; changed; ) {
    changed = false;
    const deg = new Array(vertices.length).fill(0);
    edges.forEach((e, i) => {
      if (!alive[i]) return;
      deg[e.u]++;
      deg[e.v]++;
    });
    edges.forEach((e, i) => {
      if (alive[i] && (deg[e.u] < 2 || deg[e.v] < 2)) { alive[i] = false; changed = true; }
    });
  }
  const live = edges.filter((_, i) => alive[i]);
  // half-edges
  const hes = [];
  live.forEach((e) => {
    const h0 = { e, from: e.u, to: e.v, fwd: true };
    const h1 = { e, from: e.v, to: e.u, fwd: false };
    h0.twin = h1; h1.twin = h0;
    for (const h of [h0, h1]) {
      let q;
      if (e.kind === "line") q = h.fwd ? e.pv : e.pu;
      else if (e.kind === "pcurve") {
        // a point just along the edge; far enough from the vertex for a stable direction
        const o = vertices[h.from];
        let frac = Math.min((e.t1 - e.t0) * 1e-3, 1e-3);
        for (let k = 0; k < 6; k++) {
          q = e.g.at(h.fwd ? e.t0 + frac : e.t1 - frac);
          if (Math.hypot(q[0] - o[0], q[1] - o[1]) > tol * 0.5 || frac >= (e.t1 - e.t0) * 0.1) break;
          frac *= 4;
        }
      } else {
        const frac = Math.min(e.sweep * 1e-3, 1e-3);
        const ang = h.fwd ? e.s0 + frac : e.s0 + e.sweep - frac;
        q = [e.c[0] + e.r * Math.cos(ang), e.c[1] + e.r * Math.sin(ang)];
      }
      const o = vertices[h.from];
      h.angle = Math.atan2(q[1] - o[1], q[0] - o[0]);
      hes.push(h);
    }
  });
  const out = new Map();
  for (const h of hes) {
    if (!out.has(h.from)) out.set(h.from, []);
    out.get(h.from).push(h);
  }
  for (const list of out.values()) list.sort((a, b) => a.angle - b.angle);
  for (const h of hes) {
    const list = out.get(h.to);
    const t = h.twin;
    const i = list.indexOf(t);
    h.next = list[(i - 1 + list.length) % list.length];
  }
  // trace cycles
  const cycles = [];
  const seen = new Set();
  for (const h of hes) {
    if (seen.has(h)) continue;
    const cyc = [];
    let g = h;
    let guard = 0;
    while (!seen.has(g) && guard++ < 100000) {
      seen.add(g);
      cyc.push(g);
      g = g.next;
    }
    const poly = [vertices[cyc[0].from]];
    for (const hh of cyc) poly.push(...sampleEdge(hh.e, hh.fwd));
    poly.pop();
    let area = polyArea(poly);
    try { const ex = cycleArea(cyc, vertices); if (Number.isFinite(ex) && Math.sign(ex) === Math.sign(area)) area = ex; } catch { /* keep the polygon area */ }
    cycles.push({ hes: cyc, poly, area });
  }
  const faces = cycles.filter((c) => c.area > tol * tol);
  const outers = cycles.filter((c) => c.area < -tol * tol);
  const regions = faces.map((f) => ({ outer: f, holes: [], area: f.area }));
  const textRegs = [];
  try { textRegs.push(...textRegions(sk, vid, vertices, tol)); } catch (e) { void e; }
  for (const o of outers) {
    const probe = o.poly[0];
    let best = null;
    for (const r of regions) {
      if (r.outer.area <= -o.area + tol) continue;
      if (r.outer.hes.some((h) => o.hes.some((k) => k.e === h.e))) continue;
      if (!pointInPoly(probe, r.outer.poly)) continue;
      // make sure probe isn't on this outer boundary component
      if (!best || r.outer.area < best.outer.area) best = r;
    }
    if (best) { best.holes.push(o); best.area += o.area; }
  }
  // keys
  const sig = (c) => c.hes.map((h) => `${h.e.curve}${h.fwd ? "+" : "-"}`).sort().join(",");
  const counts = new Map();
  regions.forEach((r) => {
    const base = sig(r.outer) + (r.holes.length ? "|" + r.holes.map(sig).sort().join("|") : "");
    r.baseKey = base;
    let cx = 0, cy = 0;
    for (const p of r.outer.poly) { cx += p[0]; cy += p[1]; }
    r.centroid = [cx / r.outer.poly.length, cy / r.outer.poly.length];
    if (!counts.has(base)) counts.set(base, []);
    counts.get(base).push(r);
  });
  for (const list of counts.values()) {
    list.sort((a, b) => a.centroid[0] - b.centroid[0] || a.centroid[1] - b.centroid[1]);
    list.forEach((r, i) => (r.key = list.length > 1 ? `${r.baseKey}#${i}` : r.baseKey));
  }
  regions.forEach((r) => (r.curves = [...new Set([...r.outer.hes, ...r.holes.flatMap((h) => h.hes)].map((h) => h.e.curve))]));
  for (const r of textRegs) regions.push(r);
  return { regions, vertices, edges: live };
}

/** One cubic Bezier as a pcurve geom (a single span; the kernel builds it as one exact B-spline edge). */
function bezGeom(b, id) {
  const L = Math.max(1e-9, Math.hypot(b[3][0] - b[0][0], b[3][1] - b[0][1]));
  return { kind: "pcurve", sub: "spline", id, closed: false, T: 1, spans: [b], fit: { h: [L], P: [], m: [] }, per: 16, at: (t) => bezierAt(b, Math.max(0, Math.min(1, t))), der: (t) => bezierDer(b, Math.max(0, Math.min(1, t))) };
}

/**
 * Profiles of sketch text: every glyph contour is a closed loop (lines + cubic Beziers); contours
 * nested an odd number of times are holes of the loop around them. Text does not take part in the
 * curve arrangement (as in Fusion, text profiles are independent of the other sketch curves).
 */
function textRegions(sk, vid, vertices, tol) {
  const out = [];
  for (const [id, cv] of Object.entries(sk.curves)) {
    if (cv.type !== "text" || cv.cons) continue;
    const pathGeom = (pid) => { const c = sk.curves[pid]; if (!c) return null; try { return asParametric(curveGeom(sk, pid)); } catch { return null; } };
    const contours = textContours(sk, id, pathGeom);
    const items = [];
    for (const segs of contours) {
      const poly = contourPolyline(segs, 8);
      if (poly.length < 3) continue;
      if (Math.hypot(poly[0][0] - poly[poly.length - 1][0], poly[0][1] - poly[poly.length - 1][1]) < 1e-12) poly.pop();
      const a = polyArea(poly);
      if (Math.abs(a) < tol * tol) continue;
      items.push({ segs, poly, area: a, depth: 0, parent: null });
    }
    for (const it of items) {
      const probe = it.poly[0];
      for (const o of items) if (o !== it && Math.abs(o.area) > Math.abs(it.area) && pointInPoly(probe, o.poly)) {
        it.depth++;
        if (!it.parent || Math.abs(o.area) < Math.abs(it.parent.area)) it.parent = o;
      }
    }
    const cycleOf = (it, ccw) => {
      let segs = it.segs;
      if ((it.area > 0) !== ccw) segs = segs.slice().reverse().map((g) => (g.kind === "line" ? { kind: "line", a: g.b, b: g.a } : { kind: "bez", a: g.b, c1: g.c2, c2: g.c1, b: g.a }));
      const hes = [];
      for (const g of segs) {
        const u = vid(g.a), v = vid(g.b);
        if (u === v && g.kind === "line") continue;
        let e;
        if (g.kind === "line") e = { kind: "line", curve: id, u, v, pu: vertices[u], pv: vertices[v], t0: 0, t1: 1 };
        else e = { kind: "pcurve", curve: id, u, v, pu: vertices[u], pv: vertices[v], g: bezGeom([vertices[u], g.c1, g.c2, vertices[v]], id), t0: 0, t1: 1 };
        hes.push({ e, from: u, to: v, fwd: true });
      }
      for (let k = 0; k < hes.length; k++) hes[k].next = hes[(k + 1) % hes.length];
      const poly = ccw === it.area > 0 ? it.poly : it.poly.slice().reverse();
      return { hes, poly, area: ccw ? Math.abs(it.area) : -Math.abs(it.area) };
    };
    let k = 0;
    for (const it of items) {
      if (it.depth % 2 !== 0) continue;
      const outer = cycleOf(it, true);
      if (outer.hes.length < 1) continue;
      const holes = items.filter((h) => h.depth === it.depth + 1 && h.parent === it).map((h) => cycleOf(h, false)).filter((h) => h.hes.length);
      let cx = 0, cy = 0;
      for (const q of outer.poly) { cx += q[0]; cy += q[1]; }
      const key = `text:${id}#${k++}`;
      out.push({ outer, holes, area: outer.area + holes.reduce((a, h) => a + h.area, 0), key, baseKey: key, centroid: [cx / outer.poly.length, cy / outer.poly.length], curves: [id], text: id });
    }
  }
  return out;
}

/** Convert a cycle into an ordered list of primitive segments in traversal order. */
export function cycleSegments(cycle, vertices) {
  return cycle.hes.map((h) => {
    const e = h.e;
    const a = vertices[h.from], b = vertices[h.to];
    if (e.kind === "line") return { kind: "line", a, b };
    // spline / ellipse piece: the curve geom, its parameter range and the traversal direction
    if (e.kind === "pcurve") return { kind: "pcurve", a, b, g: e.g, sub: e.g.sub, t0: e.t0, t1: e.t1, fwd: h.fwd, full: h.from === h.to };
    const midAng = e.s0 + e.sweep / 2;
    const mid = [e.c[0] + e.r * Math.cos(midAng), e.c[1] + e.r * Math.sin(midAng)];
    return { kind: "arc", a, b, mid, c: e.c, r: e.r, full: h.from === h.to };
  });
}

/** Centroid & area-weighted interior sample point for labels / arrows. */
export function regionInteriorPoint(region) {
  // try centroid, then scan for a point inside outer and not inside holes
  const inside = (p) => pointInPoly(p, region.outer.poly) && !region.holes.some((h) => pointInPoly(p, h.poly));
  let [cx, cy] = [0, 0];
  let A = 0;
  const poly = region.outer.poly;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; A += f;
  }
  if (Math.abs(A) > 1e-12) { cx /= 3 * A; cy /= 3 * A; }
  if (inside([cx, cy])) return [cx, cy];
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of poly) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
  for (let k = 1; k < 12; k++) for (let j = 1; j < 12; j++) {
    const p = [minx + ((maxx - minx) * k) / 12, miny + ((maxy - miny) * j) / 12];
    if (inside(p)) return p;
  }
  return [cx, cy];
}

/** Points along a half-edge from its start vertex (included) towards its end (excluded). */
export function halfEdgeSamples(h, per = 0.3) {
  const e = h.e;
  if (e.kind === "line") return [h.fwd ? e.pu : e.pv];
  if (e.kind === "pcurve") {
    const g = e.g;
    const n = Math.max(2, Math.ceil(((e.t1 - e.t0) / g.T) * g.T * g.per));
    const out = [];
    for (let k = 0; k < n; k++) out.push(k === 0 ? (h.fwd ? e.pu : e.pv) : g.at(h.fwd ? e.t0 + ((e.t1 - e.t0) * k) / n : e.t1 - ((e.t1 - e.t0) * k) / n));
    return out;
  }
  const n = Math.max(2, Math.ceil(Math.abs(e.sweep) / per));
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = h.fwd ? e.s0 + (e.sweep * k) / n : e.s0 + e.sweep - (e.sweep * k) / n;
    out.push([e.c[0] + e.r * Math.cos(t), e.c[1] + e.r * Math.sin(t)]);
  }
  return out;
}
