// Planar arrangement of sketch curves -> closed profiles (regions).
// Curves are split at every intersection, dangling edges are pruned, and the
// faces of the resulting planar graph are traced with a half-edge walk.

const TAU = Math.PI * 2;
const EPS = 1e-6;

const norm = (a) => ((a % TAU) + TAU) % TAU;

export function curveGeom(sk, id) {
  const cv = sk.curves[id];
  const P = (pid) => [sk.points[pid].x, sk.points[pid].y];
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
  const ang = g.kind === "circle" ? t : g.a0 + t;
  return [g.c[0] + g.r * Math.cos(ang), g.c[1] + g.r * Math.sin(ang)];
}

// param of a point known to lie on the curve; returns null if outside range
function paramOf(g, p, tol) {
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
    const g = curveGeom(sk, id);
    if (!g) continue;
    if (g.kind === "line" && Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) < 1e-9) continue;
    if (g.kind !== "line" && g.r < 1e-9) continue;
    geoms.push(g);
  }
  // scale-aware tolerance
  let ext = 1;
  for (const g of geoms) {
    if (g.kind === "line") ext = Math.max(ext, Math.abs(g.a[0]), Math.abs(g.a[1]), Math.abs(g.b[0]), Math.abs(g.b[1]));
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
      else {
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
    cycles.push({ hes: cyc, poly, area: polyArea(poly) });
  }
  const faces = cycles.filter((c) => c.area > tol * tol);
  const outers = cycles.filter((c) => c.area < -tol * tol);
  const regions = faces.map((f) => ({ outer: f, holes: [], area: f.area }));
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
  return { regions, vertices, edges: live };
}

/** Convert a cycle into an ordered list of primitive segments in traversal order. */
export function cycleSegments(cycle, vertices) {
  return cycle.hes.map((h) => {
    const e = h.e;
    const a = vertices[h.from], b = vertices[h.to];
    if (e.kind === "line") return { kind: "line", a, b };
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
