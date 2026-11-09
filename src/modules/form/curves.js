// Curve input for the FORM create commands: sketch profiles / sketch curves / B-rep edges / T-spline edges as
// world polylines, chained end to end, and corner-preserving resampling to a face count.
import { curveGeom } from "../../sketch/regions.js";
import { V } from "./cage.js";

function samples2D(g) {
  if (!g) return null;
  if (g.kind === "line") return [g.a, g.b];
  if (g.kind === "circle") { const n = 96; return Array.from({ length: n + 1 }, (_, k) => { const a = (2 * Math.PI * k) / n; return [g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)]; }); }
  if (g.kind === "arc") { const n = Math.max(4, Math.ceil(Math.abs(g.sweep) / (Math.PI / 48))); return Array.from({ length: n + 1 }, (_, k) => { const a = g.a0 + (g.sweep * k) / n; return [g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)]; }); }
  if (g.kind === "pcurve" && typeof g.at === "function") { const n = 96; return Array.from({ length: n + 1 }, (_, k) => g.at((g.T * k) / n)); }
  return null;
}

/** Chain polylines (arrays of points) end to end: [{pts, closed}]. */
export function chainPolys(pieces, tol = 1e-5) {
  const left = pieces.filter((p) => p && p.length >= 2).map((p) => p.slice());
  const out = [];
  const same = (a, b) => V.dist(a, b) <= tol;
  while (left.length) {
    let ch = left.shift();
    let grown = true;
    while (grown) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const p = left[i];
        const end = ch[ch.length - 1], start = ch[0];
        if (same(end, p[0])) ch = [...ch, ...p.slice(1)];
        else if (same(end, p[p.length - 1])) ch = [...ch, ...p.slice(0, -1).reverse()];
        else if (same(start, p[p.length - 1])) ch = [...p.slice(0, -1), ...ch];
        else if (same(start, p[0])) ch = [...p.slice(1).reverse(), ...ch];
        else continue;
        left.splice(i, 1);
        grown = true;
        break;
      }
    }
    const closed = ch.length > 2 && same(ch[0], ch[ch.length - 1]);
    if (closed) ch.pop();
    out.push({ pts: ch, closed });
  }
  return out;
}

/**
 * World polylines of curve refs: profiles (outer loop), sketch curves (chained per sketch), B-rep edges (from
 * the viewport's edge polylines), T-spline edges (cage polyline). Returns [{pts, closed, plane?, ts?}].
 */
export function curveChains(app, refs, state) {
  const K = app.K, M = app.M;
  const out = [];
  const sk = new Map();
  const edges = [];
  const tsEdges = [];
  for (const r of refs || []) {
    if (r.kind === "profile") {
      try {
        const { region, sketch } = M.resolveRegion(state, r);
        out.push({ pts: region.outer.poly.map(([u, v]) => K.toWorld(sketch.plane, u, v)), closed: true, plane: sketch.plane });
      } catch { /* profile gone */ }
    } else if (r.kind === "sketchCurve") { if (!sk.has(r.sketch)) sk.set(r.sketch, []); sk.get(r.sketch).push(r.curve); }
    else if (r.kind === "edge") edges.push(r);
    else if (r.kind === "tsEdge") tsEdges.push(r);
  }
  for (const [sid, ids] of sk) {
    const s = state.sketches.get(sid);
    if (!s) continue;
    const pieces = [];
    for (const id of ids) {
      let g = null;
      try { g = curveGeom(s.sk, id); } catch { g = null; }
      const p2 = samples2D(g);
      if (p2) pieces.push(p2.map(([u, v]) => K.toWorld(s.plane, u, v)));
    }
    for (const ch of chainPolys(pieces)) out.push({ ...ch, plane: s.plane });
  }
  if (edges.length && app.viewport && app.viewport.meshFor) {
    const pieces = [];
    for (const r of edges) {
      const b = state.bodies.get(r.body);
      if (!b) continue;
      let md = null;
      try { md = app.viewport.meshFor(b.shape); } catch { md = null; }
      const grp = md && md.edgeGroups && md.edgeGroups.find((g) => g.edge === r.index);
      if (!grp) continue;
      const L = md.lines;
      const seg = [];
      for (let k = grp.start; k < grp.start + grp.count; k += 2) {
        const a = [L[3 * k], L[3 * k + 1], L[3 * k + 2]], c = [L[3 * k + 3], L[3 * k + 4], L[3 * k + 5]];
        if (!seg.length) seg.push(a);
        seg.push(c);
      }
      if (seg.length >= 2) pieces.push(seg);
    }
    for (const ch of chainPolys(pieces)) out.push(ch);
  }
  if (tsEdges.length) out.push(...tsChains(app, tsEdges));
  return out;
}
function tsChains(app, refs) {
  const out = [];
  const byBody = new Map();
  for (const r of refs) { if (!byBody.has(r.body)) byBody.set(r.body, []); byBody.get(r.body).push(r); }
  for (const [id, rs] of byBody) {
    const b = app.anyBody(id);
    const c = b && b.entry && b.entry.data && b.entry.data.cage;
    if (!c) continue;
    const pieces = rs.map((r) => [c.v[r.a], c.v[r.b]]);
    for (const ch of chainPolys(pieces)) out.push({ ...ch, ts: id });
  }
  return out;
}

/** Polyline length. */
export function polyLength(pts, closed) {
  let s = 0;
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) s += V.dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}
/** Corners (turning more than 25 deg) of a polyline: indices. Open polylines include both ends. */
export function corners(pts, closed) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) { out.push(i); continue; }
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const t1 = V.norm(V.sub(b, a)), t2 = V.norm(V.sub(c, b));
    if (V.dot(t1, t2) < Math.cos((25 * Math.PI) / 180)) out.push(i);
  }
  return out;
}
function runSample(run, k, mode) {
  // k spans over an open run of points
  const L = [0];
  for (let i = 1; i < run.length; i++) L.push(L[i - 1] + V.dist(run[i - 1], run[i]));
  const total = L[L.length - 1] || 1;
  const out = [];
  for (let s = 0; s <= k; s++) {
    let target = (total * s) / k;
    if (mode === "curvature") target = total * (0.5 - 0.5 * Math.cos((Math.PI * s) / k));
    let i = 1;
    while (i < L.length - 1 && L[i] < target) i++;
    const f = L[i] - L[i - 1] > 0 ? (target - L[i - 1]) / (L[i] - L[i - 1]) : 0;
    out.push(V.lerp(run[i - 1], run[i], Math.max(0, Math.min(1, f))));
  }
  return out;
}
/** Resample to n spans keeping corners when n allows. Returns points (closed: no repeat of the first). */
export function resampleChain(pts, closed, n, mode = "uniform") {
  n = Math.max(closed ? 3 : 1, n | 0);
  let cs = corners(pts, closed);
  if (closed && !cs.length) cs = [0];
  const runs = [];
  for (let i = 0; i < cs.length - (closed ? 0 : 1); i++) {
    const a = cs[i], b = closed ? cs[(i + 1) % cs.length] : cs[i + 1];
    const run = [];
    let j = a;
    for (let guard = 0; guard <= pts.length; guard++) { run.push(pts[j]); if (j === b && run.length > 1) break; j = (j + 1) % pts.length; if (!closed && j > b) break; }
    runs.push(run);
  }
  if (n < runs.length) {
    // fewer faces than corners: plain arc-length sampling
    const ring = closed ? [...pts, pts[0]] : pts;
    const s = runSample(ring, n, mode);
    if (closed) s.pop();
    return s;
  }
  const lens = runs.map((r) => polyLength(r, false));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const alloc = lens.map((l) => Math.max(1, Math.floor((n * l) / total)));
  let extra = n - alloc.reduce((a, b) => a + b, 0);
  const order = lens.map((l, i) => [(n * l) / total - Math.floor((n * l) / total), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; extra > 0 && k < order.length * 4; k++, extra--) alloc[order[k % order.length][1]]++;
  for (let k = 0; extra < 0 && k < order.length * 4; k++) { const i = order[order.length - 1 - (k % order.length)][1]; if (alloc[i] > 1) { alloc[i]--; extra++; } }
  const out = [];
  runs.forEach((r, i) => { const s = runSample(r, alloc[i], mode); out.push(...(i === 0 ? s : s.slice(1))); });
  if (closed) out.pop();
  return out;
}
/** Default face count for a chain: one per straight run, else about one per 45 degrees of turning (min 4). */
export function autoFaces(pts, closed) {
  const cs = corners(pts, closed);
  let turn = 0;
  for (let i = 1; i < pts.length - (closed ? 0 : 1); i++) {
    const a = pts[i - 1], b = pts[i], c = pts[(i + 1) % pts.length];
    const t1 = V.norm(V.sub(b, a)), t2 = V.norm(V.sub(c, b));
    const ang = Math.acos(Math.max(-1, Math.min(1, V.dot(t1, t2))));
    if (ang < (25 * Math.PI) / 180) turn += ang;
  }
  const curved = Math.round(turn / (Math.PI / 4));
  const straight = Math.max(closed ? 0 : 1, cs.length - (closed ? 0 : 1));
  return Math.max(closed ? 4 : 1, Math.min(64, straight + curved));
}
