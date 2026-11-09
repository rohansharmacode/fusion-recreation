// Dialog helpers of the SURFACE tools: ref conversions, chain selection (sketch curves, edges, faces),
// ray casting of preview shapes (Trim / Boundary Fill cells) and small formatting helpers.
import * as K from "../../kernel.js";
import * as U from "../dialogs/util.js";
import { OPERATIONS } from "../dialogs/common.js";

const V = K.V;

/** Operation options limited to the given values (Fusion's labels and glyphs). */
export const ops = (...vals) => OPERATIONS.filter((o) => vals.includes(o.value));
export const SURFACE_OPS = ops("join", "new", "newComponent");

/** {sketch, curve} of the sketchCurve refs of a list. */
export const curveRefsOf = (list) => (list || []).filter((r) => r.kind === "sketchCurve").map((r) => ({ sketch: r.sketch, curve: r.curve }));
/** {body, p} of the edge refs of a list. */
export const edgeRefsOf = (list) => (list || []).filter((r) => r.kind === "edge").map((r) => ({ body: r.body, p: r.p }));
/** {body, p, n} of the face refs of a list. */
export const faceRefsOf = (list) => (list || []).filter((r) => r.kind === "face").map((r) => ({ body: r.body, p: r.p, n: r.n }));
export const curveSelRefs = (curves) => (curves || []).map((c) => ({ kind: "sketchCurve", sketch: c.sketch, curve: c.curve }));
export const edgeSelRefs = (st, edges) => (edges || []).map((e) => U.edgeRef(st, e.body, e.p));
export const faceSelRefs = (st, faces) => (faces || []).map((f) => U.faceRef(st, f.body, f.p, f.n));
export const bodySelRefs = (ids) => (ids || []).map((b) => ({ kind: "body", body: b }));

/** Kind of a body in a state ('solid' | 'surface' | ...). */
export function kindOf(app, st, id) {
  try { return app.M.bodyKind(st, id); } catch { return null; }
}
export const isSurface = (app, st, id) => kindOf(app, st, id) === "surface";

/** Sketch curves connected end to end with `cid` in its sketch (Chain Selection). */
export function sketchChain(app, st, sketch, cid) {
  const s = st.sketches.get(sketch);
  if (!s) return [cid];
  const curves = s.sk.curves;
  const ends = (cv) => {
    try { return (app.S.curveEnds(cv) || []).filter(Boolean); } catch { return []; }
  };
  const seen = new Set([cid]);
  const stack = [cid];
  while (stack.length) {
    const id = stack.pop();
    const cv = curves[id];
    if (!cv) continue;
    const pe = ends(cv);
    if (!pe.length) continue;
    for (const [oid, ov] of Object.entries(curves)) {
      if (seen.has(oid) || ov.cons || ov.type === "point" || ov.type === "text") continue;
      if (ends(ov).some((p) => pe.includes(p))) { seen.add(oid); stack.push(oid); }
    }
  }
  return [...seen];
}
export const sketchChainRefs = (app, st, r) => sketchChain(app, st, r.sketch, r.curve).map((c) => ({ kind: "sketchCurve", sketch: r.sketch, curve: c }));

/**
 * Chain of edges from edge `index` of a body: 'tangent' (tangent-continuous neighbours) or 'free'
 * (the connected loop of open edges, for patches). Returns edge refs.
 */
export function edgeChain(st, body, index, mode = "tangent") {
  const b = st.bodies.get(body);
  if (!b) return [];
  const T = K.topoOf(b.shape);
  const E = T.edges;
  const start = E[index];
  if (!start) return [];
  const isFree = (g) => (g.faces || []).length === 1;
  // the open-edge loop only from an open edge (other edges chain by tangency)
  if (mode === "free" && !isFree(start)) mode = "tangent";
  const ok = (g) => (mode === "free" ? isFree(g) : true);
  const close = (p, q) => V.len(V.sub(p, q)) < 1e-4;
  const ends = (g) => [{ p: g.s, t: g.ts }, { p: g.t, t: g.tt }];
  const seen = new Set([index]);
  const queue = [index];
  for (let k = 0; k < queue.length && seen.size < 400; k++) {
    const gi = E[queue[k]];
    E.forEach((g, j) => {
      if (seen.has(j) || !ok(g)) return;
      let link = false;
      for (const a of ends(gi)) for (const c of ends(g)) {
        if (!close(a.p, c.p)) continue;
        if (mode === "free" || Math.abs(V.dot(a.t, c.t)) > 0.9995) link = true;
      }
      if (link) { seen.add(j); queue.push(j); }
    });
  }
  return [...seen].map((i) => ({ kind: "edge", body, index: i, p: E[i].m }));
}

/** Faces tangent-connected to face `index` of a body (Chain Selection of faces). Returns face refs. */
export function faceChain(st, body, index) {
  const b = st.bodies.get(body);
  if (!b) return [];
  const T = K.topoOf(b.shape);
  const faces = b.shape.faces;
  const nrm = (fi, p) => { try { const v = faces[fi].normalAt(p); const t = v.toTuple(); return V.norm(t); } catch { return null; } };
  const seen = new Set([index]);
  const queue = [index];
  try {
    for (let k = 0; k < queue.length && seen.size < 200; k++) {
      const fi = queue[k];
      T.edges.forEach((g) => {
        const fs = g.faces || [];
        if (fs.length !== 2 || !fs.includes(fi)) return;
        const other = fs[0] === fi ? fs[1] : fs[0];
        if (seen.has(other)) return;
        const a = nrm(fi, g.m), c = nrm(other, g.m);
        if (a && c && V.dot(a, c) > 0.9995) { seen.add(other); queue.push(other); }
      });
    }
  } finally { K.del(faces); }
  return [...seen].map((i) => ({ kind: "face", body, index: i, p: T.faces[i].c, n: T.faces[i].n, planar: T.faces[i].type === "PLANE" }));
}

/** Nearest ray parameter t where the ray hits the triangulation of a shape (or null). */
export function rayShape(app, shape, ray) {
  let m = null;
  try { m = app.viewport && app.viewport.meshFor ? app.viewport.meshFor(shape) : K.meshBody(shape); } catch { m = null; }
  if (!m || !m.vertices || !m.triangles) return null;
  const P = m.vertices, T = m.triangles;
  const o = ray.o, d = ray.d;
  let best = null;
  for (let i = 0; i < T.length; i += 3) {
    const a = [P[3 * T[i]], P[3 * T[i] + 1], P[3 * T[i] + 2]];
    const b = [P[3 * T[i + 1]], P[3 * T[i + 1] + 1], P[3 * T[i + 1] + 2]];
    const c = [P[3 * T[i + 2]], P[3 * T[i + 2] + 1], P[3 * T[i + 2] + 2]];
    const e1 = V.sub(b, a), e2 = V.sub(c, a);
    const pv = V.cross(d, e2);
    const det = V.dot(e1, pv);
    if (Math.abs(det) < 1e-14) continue;
    const inv = 1 / det;
    const tv = V.sub(o, a);
    const u = V.dot(tv, pv) * inv;
    if (u < 0 || u > 1) continue;
    const qv = V.cross(tv, e1);
    const v = V.dot(d, qv) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = V.dot(e2, qv) * inv;
    if (t > 1e-9 && (best === null || t < best)) best = t;
  }
  return best;
}
/** Index of the first shape hit by the ray, the hit point: {i, p} | null. */
export function rayPick(app, shapes, ray) {
  let best = null;
  shapes.forEach((s, i) => {
    if (!s) return;
    const t = rayShape(app, s, ray);
    if (t !== null && (!best || t < best.t)) best = { i, t };
  });
  return best ? { i: best.i, p: V.add(ray.o, V.mul(ray.d, best.t)) } : null;
}

/** Anchor (point + normal) for a distance arrow on the first edge / curve / face of a selection. */
export function selectionAnchor(app, st, list) {
  const r = (list || [])[0];
  if (!r) return null;
  if (r.kind === "profile") return U.profilesAnchor(st, list.filter((x) => x.kind === "profile"));
  if (r.kind === "face") return { o: r.p, n: r.n };
  if (r.kind === "sketchCurve") {
    const s = st.sketches.get(r.sketch);
    if (!s) return null;
    const cv = s.sk.curves[r.curve];
    let q = null;
    try { const poly = app.S.curvePolyline(s.sk, r.curve, 16); q = poly[Math.floor(poly.length / 2)]; } catch { q = null; }
    if (!q && cv && cv.p1) q = [s.sk.points[cv.p1].x, s.sk.points[cv.p1].y];
    if (!q) return null;
    const p = Array.isArray(q) ? q : [q.x, q.y];
    return { o: K.toWorld(s.plane, p[0], p[1]), n: s.plane.n, plane: s.plane };
  }
  if (r.kind === "edge") return { o: r.p, n: [0, 0, 1] };
  return null;
}

/** Status text like Fusion's ("2 Edges", "1 Face", "3 Curves"). */
export function countStatus(list) {
  const n = { profile: 0, sketchCurve: 0, edge: 0, face: 0, body: 0 };
  for (const r of list || []) if (n[r.kind] !== undefined) n[r.kind]++;
  const parts = [];
  const add = (k, one, many) => { if (n[k]) parts.push(`${n[k]} ${n[k] === 1 ? one : many}`); };
  add("profile", "Profile", "Profiles");
  add("sketchCurve", "Curve", "Curves");
  add("edge", "Edge", "Edges");
  add("face", "Face", "Faces");
  add("body", "Body", "Bodies");
  return parts.join(" | ");
}

/** Small DOM helper. */
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
