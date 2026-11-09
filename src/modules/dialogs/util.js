// Geometry / reference helpers shared by the command dialogs.
import * as K from "../../kernel.js";
import { bbox as meshBBox } from "../../meshdata.js";
import { regionInteriorPoint, pointInPoly } from "../../sketch/regions.js";

export const V = K.V;

// ---------- formatting ----------
/** Fusion's display format: lengths with 2 decimals ("10.00 mm"), angles with 1 ("118.0 deg"). */
export function fmt(v, kind = "length") {
  if (!Number.isFinite(v)) return "";
  const r = Math.abs(v) < 1e-9 ? 0 : v;
  if (kind === "angle") return `${r.toFixed(1)} deg`;
  if (kind === "none") return `${+r.toFixed(3)}`;
  if (kind === "plain2") return r.toFixed(2);
  return `${r.toFixed(2)} mm`;
}
export function niceStep(x) {
  if (!(x > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / e;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e;
}
/** Append the default unit to a bare number ("15" -> "15 mm"). */
export function withUnit(expr, kind) {
  const s = String(expr ?? "").trim();
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return kind === "angle" ? `${s} deg` : kind === "none" ? s : `${s} mm`;
  return s;
}

// ---------- plane refs ----------
/** Selection ref (originPlane / cplane / planar face) -> document planeRef. */
export function planeRefFromRef(ref) {
  if (!ref) return null;
  if (ref.kind === "originPlane") return { kind: "origin", name: ref.name };
  if (ref.kind === "cplane") return { kind: "cplane", id: ref.id };
  if (ref.kind === "face") return { kind: "face", body: ref.body, p: ref.p, n: ref.n, plane: K.planeFromNormal(ref.p, ref.n) };
  return null;
}
/** Document planeRef -> selection ref (for re-opening a dialog on an existing feature). */
export function refFromPlaneRef(pr, state) {
  if (!pr) return null;
  if (pr.kind === "origin") return { kind: "originPlane", name: pr.name };
  if (pr.kind === "cplane") return { kind: "cplane", id: pr.id };
  if (pr.kind === "face") return faceRef(state, pr.body, pr.p, pr.n);
  return null;
}
export function resolvePlane(pr, state) {
  if (!pr) return null;
  if (pr.kind === "origin") return K.ORIGIN_PLANES[pr.name];
  if (pr.kind === "cplane") { const p = state && state.planes.get(pr.id); return p ? p.plane : null; }
  if (pr.kind === "face" || pr.kind === "plane") return pr.plane;
  return null;
}
/** A point to anchor manipulators on a planeRef (face pick point / plane origin). */
export function planeAnchor(pr, state) {
  const pl = resolvePlane(pr, state);
  if (!pl) return null;
  if (pr.kind === "face" && pr.p) return { o: pr.p, n: pl.n, plane: pl };
  return { o: pl.o, n: pl.n, plane: pl };
}

// ---------- faces / edges ----------
export function indexOfSame(list, item) {
  for (let i = 0; i < list.length; i++) { try { if (list[i].isSame(item)) return i; } catch { /* ignore */ } }
  return -1;
}
export function faceRef(state, body, p, n) {
  const b = state && state.bodies.get(body);
  if (!b) return { kind: "face", body, index: -1, p, n, planar: true };
  const f = K.findFace(b.shape, p, n);
  const idx = f ? indexOfSame(b.shape.faces, f) : -1;
  let planar = true;
  try { planar = f ? f.geomType === "PLANE" : true; } catch { /* ignore */ }
  return { kind: "face", body, index: idx, p, n, planar };
}
export function edgeRef(state, body, p) {
  const b = state && state.bodies.get(body);
  if (!b) return { kind: "edge", body, index: -1, p };
  const fe = K.findEdge(b.shape, p);
  const idx = fe ? indexOfSame(b.shape.edges, fe.edge) : -1;
  return { kind: "edge", body, index: idx, p };
}
/** Map a ref picked on (possibly previewed) geometry onto the same body in `state`. */
export function remapRef(ref, state) {
  if (!ref || !["face", "edge", "vertex"].includes(ref.kind)) return ref;
  const b = state.bodies.get(ref.body);
  if (!b) return null;
  if (ref.kind === "face") {
    const f = K.findFace(b.shape, ref.p, ref.n);
    if (!f) return null;
    const index = indexOfSame(b.shape.faces, f);
    let p = ref.p, n = ref.n, planar = ref.planar;
    try {
      const d = K.R.measureDistanceBetween(f, K.R.makeVertex(ref.p));
      if (d > 1e-4) p = f.center.toTuple();
      n = V.norm(f.normalAt(p).toTuple());
      planar = f.geomType === "PLANE";
    } catch { /* keep */ }
    return { ...ref, index, p, n, planar };
  }
  if (ref.kind === "edge") {
    const fe = K.findEdge(b.shape, ref.p);
    if (!fe) return null;
    const index = indexOfSame(b.shape.edges, fe.edge);
    const p = fe.dist > 1e-4 ? K.edgeMid(fe.edge) : ref.p;
    return { ...ref, index, p };
  }
  return ref;
}
/** Outward normals of the faces adjacent to an edge, at point p. */
export function edgeFaceNormals(shape, edgeIndex, p) {
  try {
    const e = shape.edges[edgeIndex];
    if (!e) return [];
    const out = [];
    for (const f of shape.faces) {
      if (!f.edges.some((x) => x.isSame(e))) continue;
      try { out.push(V.norm(f.normalAt(p).toTuple())); } catch { /* ignore */ }
      if (out.length >= 2) break;
    }
    return out;
  } catch { return []; }
}
export function edgeTangent(shape, edgeIndex) {
  try {
    const e = shape.edges[edgeIndex];
    return V.norm(e.tangentAt(0.5).toTuple());
  } catch { return [1, 0, 0]; }
}
export function isLinearEdge(state, ref) {
  try {
    const b = state.bodies.get(ref.body);
    const e = b && b.shape.edges[ref.index];
    return !!e && e.geomType === "LINE";
  } catch { return false; }
}

// ---------- bodies ----------
/** Centre of the bounding box of bodies `ids` in `state` (null when none resolve). */
export function bodiesCenter(state, ids) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const id of ids) {
    const b = state.bodies.get(id);
    let bb = b && b.shape && b.shape.boundingBox ? b.shape.boundingBox.bounds : null;
    const m = !b && state.meshBodies && state.meshBodies.get(id); // mesh-like body: box of its triangles
    if (m && m.mesh && m.mesh.positions && m.mesh.positions.length) { const mb = meshBBox(m.mesh); bb = [mb.min, mb.max]; }
    if (!bb) continue;
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb[0][i]); mx[i] = Math.max(mx[i], bb[1][i]); }
  }
  if (!Number.isFinite(mn[0])) return null;
  return V.mul(V.add(mn, mx), 0.5);
}
export function visibleBodies(app, state) {
  const out = [];
  for (const b of state.bodies.values()) if (app.doc.bodies[b.id]?.visible !== false) out.push(b);
  return out;
}
const meshCache = new WeakMap();
function bodyMesh(app, shape) {
  let m = meshCache.get(shape);
  if (m) return m;
  try { m = app.viewport && app.viewport.meshFor ? app.viewport.meshFor(shape) : null; } catch { m = null; }
  if (!m || !m.vertices) { try { m = K.meshBody(shape); } catch { m = null; } }
  if (m) meshCache.set(shape, m);
  return m;
}
/** Ray-parity point-in-solid test on the body's mesh (works for compounds of solids too). */
function insideMesh(m, p) {
  const P = m.vertices, T = m.triangles;
  const dirs = [[0.5774, 0.5771, 0.5779], [-0.4471, 0.7071, -0.5477], [0.1213, -0.8137, 0.5684]];
  let votes = 0;
  for (const d of dirs) {
    let hits = 0;
    for (let t = 0; t < T.length; t += 3) {
      const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
      const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const hx = d[1] * e2z - d[2] * e2y, hy = d[2] * e2x - d[0] * e2z, hz = d[0] * e2y - d[1] * e2x;
      const det = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(det) < 1e-12) continue;
      const f = 1 / det;
      const sx = p[0] - P[a], sy = p[1] - P[a + 1], sz = p[2] - P[a + 2];
      const u = f * (sx * hx + sy * hy + sz * hz);
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = f * (d[0] * qx + d[1] * qy + d[2] * qz);
      if (v < 0 || u + v > 1) continue;
      if (f * (e2x * qx + e2y * qy + e2z * qz) > 1e-9) hits++;
    }
    if (hits % 2 === 1) votes++;
  }
  return votes >= 2;
}
export function pointInside(app, state, p, tol = 1e-6) {
  for (const b of visibleBodies(app, state)) {
    const bb = K.bboxOf(b.shape);
    if (!bb) continue;
    if (p[0] < bb.min[0] - 1e-6 || p[1] < bb.min[1] - 1e-6 || p[2] < bb.min[2] - 1e-6 || p[0] > bb.max[0] + 1e-6 || p[1] > bb.max[1] + 1e-6 || p[2] > bb.max[2] + 1e-6) continue;
    try { if (K.R.measureDistanceBetween(b.shape, K.R.makeVertex(p)) < tol) return b.id; } catch { /* ignore */ }
    const m = bodyMesh(app, b.shape);
    if (m && m.triangles && m.triangles.length && insideMesh(m, p)) return b.id;
  }
  return null;
}

/**
 * Does the ray o + t*d (eps < t < maxT) pass through material of a visible body? True when it
 * starts inside a body or crosses a body face (mesh triangles) beyond `eps`.
 */
export function rayHitsMaterial(app, state, o, d, maxT = Infinity, eps = 0.02) {
  const u = V.norm(d);
  if (pointInside(app, state, V.add(o, V.mul(u, eps)))) return true;
  for (const b of visibleBodies(app, state)) {
    const m = bodyMesh(app, b.shape);
    if (!m || !m.triangles) continue;
    const P = m.vertices, T = m.triangles;
    for (let t = 0; t < T.length; t += 3) {
      const a = T[t] * 3, bb = T[t + 1] * 3, c = T[t + 2] * 3;
      const e1x = P[bb] - P[a], e1y = P[bb + 1] - P[a + 1], e1z = P[bb + 2] - P[a + 2];
      const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const hx = u[1] * e2z - u[2] * e2y, hy = u[2] * e2x - u[0] * e2z, hz = u[0] * e2y - u[1] * e2x;
      const det = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(det) < 1e-12) continue;
      const f = 1 / det;
      const sx = o[0] - P[a], sy = o[1] - P[a + 1], sz = o[2] - P[a + 2];
      const uu = f * (sx * hx + sy * hy + sz * hz);
      if (uu < 0 || uu > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const vv = f * (u[0] * qx + u[1] * qy + u[2] * qz);
      if (vv < 0 || uu + vv > 1) continue;
      const tt = f * (e2x * qx + e2y * qy + e2z * qz);
      if (tt > eps && tt < maxT) return true;
    }
  }
  return false;
}

/** Area (mm^2) of a sketch profile ref (outer loop minus holes). */
export function profileArea(state, pr) {
  const pg = profileRegion(state, pr);
  if (!pg) return 0;
  const area = (poly) => { let s = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]); return Math.abs(s / 2); };
  const r = pg.region;
  let a = r.outer && r.outer.poly ? area(r.outer.poly) : 0;
  for (const h of r.holes || []) if (h.poly) a -= area(h.poly);
  return Math.max(0, a);
}
/** Area (mm^2) of a face ref on a body of `state`. */
export function faceArea(state, ref) {
  const b = state && state.bodies.get(ref.body);
  if (!b) return 0;
  try {
    const f = ref.index >= 0 ? b.shape.faces[ref.index] : K.findFace(b.shape, ref.p, ref.n);
    return f ? K.R.measureArea(f) : 0;
  } catch { return 0; }
}
/**
 * Fusion's automatic operation for extrude-like features: starting on a body face and going
 * away from it -> Join; going into a body -> Cut; in empty space -> New Body.
 * dirSides: list of signed unit directions the feature grows in.
 */
export function autoOperation(app, state, origin, dirs) {
  if (!visibleBodies(app, state).length) return "new";
  const eps = 0.02;
  let into = false, onFace = false;
  for (const d of dirs) {
    if (pointInside(app, state, V.add(origin, V.mul(d, eps)))) into = true;
    if (pointInside(app, state, V.sub(origin, V.mul(d, eps)))) onFace = true;
  }
  if (into && dirs.length === 1) return "cut";
  if (into || onFace) return "join";
  return "new";
}

// ---------- sketch profiles ----------
function pointInRegion(p, r) {
  return pointInPoly(p, r.outer.poly) && !r.holes.some((h) => pointInPoly(p, h.poly));
}
export function profileRegion(state, pr) {
  const s = state && state.sketches.get(pr.sketch);
  if (!s || !s.regions) return null;
  const regs = s.regions.regions;
  let r = regs.find((x) => x.key === pr.key);
  if (!r && pr.c) r = regs.find((x) => x.outer.poly && pointInRegion(pr.c, x));
  return r ? { region: r, sketch: s } : null;
}
/** Anchor (world point + normal) for a set of profile refs: average of their interior points. */
export function profilesAnchor(state, profiles) {
  let acc = [0, 0, 0], n = null, plane = null, k = 0;
  for (const pr of profiles || []) {
    const pg = profileRegion(state, pr);
    if (!pg) continue;
    const ip = regionInteriorPoint(pg.region);
    const w = K.toWorld(pg.sketch.plane, ip[0], ip[1]);
    acc = V.add(acc, w);
    k++;
    if (!n) { n = pg.sketch.plane.n; plane = pg.sketch.plane; }
  }
  if (!k) return null;
  return { o: V.mul(acc, 1 / k), n, plane };
}
/** World interior point of every profile ref (one per profile; unresolved ones are skipped). */
export function profilePoints(state, profiles) {
  const out = [];
  for (const pr of profiles || []) {
    const pg = profileRegion(state, pr);
    if (!pg) continue;
    const ip = regionInteriorPoint(pg.region);
    out.push(K.toWorld(pg.sketch.plane, ip[0], ip[1]));
  }
  return out;
}
/** All profiles of visible, evaluated sketches: [{sketch, key, c}] */
export function visibleProfiles(app, state) {
  const out = [];
  for (const s of state.sketches.values()) {
    const f = app.feature(s.id);
    if (!f || f.visible === false) continue;
    for (const r of (s.regions && s.regions.regions) || []) out.push({ kind: "profile", sketch: s.id, key: r.key, c: regionInteriorPoint(r) });
  }
  return out;
}

// ---------- axis refs ----------
export function axisFromRef(ref) {
  if (!ref) return null;
  if (ref.kind === "originAxis") return { kind: "origin", name: ref.name };
  if (ref.kind === "sketchCurve") return { kind: "sketchLine", sketch: ref.sketch, curve: ref.curve };
  if (ref.kind === "edge") return { kind: "edge", body: ref.body, p: ref.p };
  return null;
}
export function refFromAxis(ax, state) {
  if (!ax) return null;
  if (ax.kind === "origin") return { kind: "originAxis", name: ax.name };
  if (ax.kind === "sketchLine") return { kind: "sketchCurve", sketch: ax.sketch, curve: ax.curve };
  if (ax.kind === "edge") return edgeRef(state, ax.body, ax.p);
  return null;
}
/** World line {o, d} of an axis selection ref, for manipulators. */
export function axisLine(ref, state) {
  if (!ref) return null;
  if (ref.kind === "originAxis") return { o: [0, 0, 0], d: K.ORIGIN_AXES[ref.name] };
  if (ref.kind === "sketchCurve") {
    const s = state.sketches.get(ref.sketch);
    const cv = s && s.sk.curves[ref.curve];
    if (!cv || cv.type !== "line") return null;
    const a = s.sk.points[cv.p1], b = s.sk.points[cv.p2];
    const pa = K.toWorld(s.plane, a.x, a.y), pb = K.toWorld(s.plane, b.x, b.y);
    return { o: pa, d: V.norm(V.sub(pb, pa)) };
  }
  if (ref.kind === "edge") {
    const b = state.bodies.get(ref.body);
    const e = b && b.shape.edges[ref.index];
    if (!e) return null;
    const s = e.startPoint.toTuple(), t = e.endPoint.toTuple();
    return { o: s, d: V.norm(V.sub(t, s)) };
  }
  return null;
}

export function sketchLineFilter(state) {
  return (ref) => {
    if (ref.kind !== "sketchCurve") return true;
    const s = state.sketches.get(ref.sketch);
    const cv = s && s.sk.curves[ref.curve];
    return !!cv && cv.type === "line";
  };
}
