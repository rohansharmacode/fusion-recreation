// Parametric document model: features in a timeline, evaluated in order.
import { ParamTable } from "./expr.js";
import * as S from "./sketch/sketch.js";
import * as K from "./kernel.js";

const { R, V } = K;

export const FIELDS = {
  sketch: {},
  extrude: { distance: "length", distance2: "length", taper: "angle", taper2: "angle", startOffset: "length" },
  revolve: { angle: "angle", angle2: "angle" },
  fillet: { radius: "length" },
  chamfer: { distance: "length" },
  shell: { thickness: "length" },
  hole: { diameter: "length", depth: "length", tipAngle: "angle", cbD: "length", cbDepth: "length", csD: "length", csAngle: "angle" },
  box: { length: "length", width: "length", height: "length" },
  cylinder: { diameter: "length", height: "length" },
  sphere: { diameter: "length" },
  torus: { d1: "length", d2: "length" },
  cplane: { offset: "length", angle: "angle" },
  rpattern: { q1: "none", d1: "length", q2: "none", d2: "length" },
  cpattern: { count: "none", angle: "angle" },
  move: { tx: "length", ty: "length", tz: "length", rx: "angle", ry: "angle", rz: "angle" },
  mirror: {},
  combine: {},
  loft: {},
  sweep: {},
  delete: {},
  draft: { angle: "angle" },
};

export const TYPE_LABEL = {
  sketch: "Sketch", extrude: "Extrude", revolve: "Revolve", fillet: "Fillet", chamfer: "Chamfer",
  shell: "Shell", hole: "Hole", box: "Box", cylinder: "Cylinder", sphere: "Sphere", torus: "Torus",
  cplane: "Plane", rpattern: "Rectangular Pattern", cpattern: "Circular Pattern", move: "Move",
  mirror: "Mirror", combine: "Combine", loft: "Loft", sweep: "Sweep", delete: "Delete", draft: "Draft",
};
const NAME_STEM = { ...TYPE_LABEL, cplane: "Offset Plane", rpattern: "Rectangular Pattern", cpattern: "Circular Pattern" };

export function newDoc(name = "Untitled") {
  return {
    version: 1,
    name,
    params: [], // user parameters {name, expr, kind, comment}
    features: [],
    marker: 0,
    bodies: {}, // id -> {name, visible, appearance, material}
    counters: {},
    origin: { visible: false },
    savedVersion: 0,
  };
}

export function nextName(doc, type) {
  const stem = NAME_STEM[type] || type;
  doc.counters[stem] = (doc.counters[stem] || 0) + 1;
  return `${stem.replace(/\s+/g, " ")}${doc.counters[stem]}`;
}
export function nextParam(doc) {
  doc.counters.d = (doc.counters.d || 0) + 1;
  return `d${doc.counters.d}`;
}
export function nextBody(doc, meta = {}) {
  doc.counters.body = (doc.counters.body || 0) + 1;
  const id = `b${doc.counters.body}`;
  doc.bodies[id] = { name: `Body${doc.counters.body}`, visible: true, appearance: "steel-satin", material: "steel", ...meta };
  return id;
}

/** Give every numeric field of a feature a model parameter name. */
export function assignParams(doc, f) {
  f.p = f.p || {};
  for (const key of Object.keys(FIELDS[f.type] || {})) {
    if (f[key] === undefined || f[key] === null || f[key] === "") continue;
    if (!f.p[key]) f.p[key] = nextParam(doc);
  }
}

export function buildParams(doc) {
  const pt = new ParamTable();
  for (const up of doc.params) pt.set(up.name, up.expr, up.kind || "length", { user: true, comment: up.comment || "" });
  for (const f of doc.features) {
    const defs = FIELDS[f.type] || {};
    if (f.p) for (const [key, name] of Object.entries(f.p)) {
      if (f[key] === undefined || f[key] === null || f[key] === "") continue;
      pt.set(name, f[key], defs[key] || "length", { owner: f.id, field: key });
    }
    if (f.type === "sketch") {
      for (const c of f.sk.constraints) if (c.param && c.expr !== undefined) pt.set(c.param, c.expr, c.type === "angle" ? "angle" : "length", { owner: f.id, cid: c.id });
    }
  }
  return pt;
}

function fval(params, f, key) {
  const kind = (FIELDS[f.type] || {})[key] || "length";
  const name = f.p && f.p[key];
  if (name && params.has(name)) return params.value(name);
  return params.eval(f[key], kind);
}

// ---------- state ----------
function cloneState(st) {
  return { bodies: new Map(st.bodies), sketches: new Map(st.sketches), planes: new Map(st.planes) };
}

// ---------- robust geometric references ----------
// Face/edge refs are {body, p[, n]}: p is a point on the entity when it was picked. After an
// upstream edit p may no longer lie on that entity (a taller extrude moves the top edges up). So on
// every successful resolve the ref gets a geometric signature `sig` (curve/surface type, direction,
// adjacent-face normals, relative position in the body box; see kernel edgeSignature/faceSignature)
// and `p` (and `n`) are moved onto the entity again. This is derived, deterministic data written into
// the feature object; later evaluations re-find the entity by signature first and nearest point
// second. Refs without a signature (older documents, fresh picks) keep the old nearest-point
// behaviour and get one on their first resolve.

const EDGE_LEGACY_MAX = 5; // mm: point refs without a signature accept the nearest edge within 5 mm
const moved = (a, b, tol = 1e-7) => !Array.isArray(a) || !Array.isArray(b) || V.len(V.sub(a, b)) > tol;

/** Index of the edge of `shape` an edge ref points at (or -1); refreshes ref.sig / ref.p. */
function locateEdge(shape, ref) {
  let idx = -1, dist = Infinity;
  if (ref.sig) {
    const m = K.matchEdge(shape, ref.sig, ref.p);
    if (m) { idx = m.index; dist = m.dist; }
  }
  if (idx < 0 && Array.isArray(ref.p)) {
    const ne = K.nearestEdgeIndex(shape, ref.p);
    if (ne && ne.dist < EDGE_LEGACY_MAX) { idx = ne.index; dist = ne.dist; }
  }
  if (idx < 0) return -1;
  const sig = K.edgeSignature(shape, idx);
  if (sig) ref.sig = sig;
  const e = K.topoOf(shape).edges[idx];
  if (e && !(dist <= 1e-3) && moved(ref.p, e.m)) ref.p = K.roundVec(e.m);
  return idx;
}

/**
 * Index of the face of `shape` a face ref points at (or -1); refreshes ref.sig / ref.p / ref.n.
 * anyOrientation: sketch-plane refs store the normal of the side the sketch was made on, which
 * may be the inward one; it keeps that side.
 */
function locateFace(shape, ref, anyOrientation = false) {
  let idx = -1;
  if (ref.sig) {
    const m = K.matchFace(shape, ref.sig, ref.p);
    if (m) idx = m.index;
  }
  if (idx < 0 && Array.isArray(ref.p)) {
    const nf = K.nearestFaceIndex(shape, ref.p, Array.isArray(ref.n) ? V.norm(ref.n) : null, anyOrientation);
    if (nf) idx = nf.index;
  }
  if (idx < 0) return -1;
  const fi = K.topoOf(shape).faces[idx];
  const sig = K.faceSignature(shape, idx);
  if (sig) ref.sig = sig;
  if (Array.isArray(ref.p) && fi) {
    let p = ref.p;
    if (fi.type === "PLANE" && fi.d !== undefined) p = V.add(p, V.mul(fi.n, fi.d - V.dot(fi.n, p)));
    // keep the point on the face itself, not only on its plane (the face may have shrunk)
    const c = K.closestOnFace(shape, idx, p);
    if (c && c.p && c.dist > 1e-4) p = c.p;
    if (moved(ref.p, p)) ref.p = K.roundVec(p);
    if (fi.type === "PLANE") {
      let n = fi.n;
      if (anyOrientation && Array.isArray(ref.n) && V.dot(ref.n, n) < 0) n = V.mul(n, -1);
      if (!Array.isArray(ref.n) || V.dot(V.norm(ref.n), n) < 1 - 1e-9) ref.n = K.roundVec(n);
    }
  }
  return idx;
}

/** Faces of a body for a list of face refs (unresolvable refs are skipped). Caller deletes them. */
function locateFaces(shape, refs) {
  const idx = [];
  for (const r of refs) { const i = locateFace(shape, r); if (i >= 0 && !idx.includes(i)) idx.push(i); }
  return K.facesAt(shape, idx);
}

/** Rotate vector v by the rotation that takes unit a onto unit b. */
function rotateTo(v, a, b) {
  const axis = V.cross(a, b);
  const s = V.len(axis), c = V.dot(a, b);
  if (s < 1e-12) return c > 0 ? v : V.mul(v, -1);
  const k = V.mul(axis, 1 / s);
  // Rodrigues
  return V.add(V.add(V.mul(v, c), V.mul(V.cross(k, v), s)), V.mul(k, V.dot(k, v) * (1 - c)));
}
const samePlane = (a, b) => !!a && !!b && !moved(a.o, b.o, 1e-9) && !moved(a.x, b.x, 1e-12) && !moved(a.n, b.n, 1e-12);

/**
 * Current plane of a planar-face planeRef {kind:'face', body, p, n, plane}: the face is re-found on
 * the body (signature first) and the stored plane `base` is moved/rotated onto it, keeping its x axis
 * and sketch side. Returns base itself when nothing moved, a new plane otherwise, null if the face is lost.
 */
function followFacePlane(st, ref, base) {
  const pl0 = base || ref.plane;
  const b = ref && st.bodies.get(ref.body);
  if (!b || !pl0 || !pl0.n) return null;
  const idx = locateFace(b.shape, ref, true);
  if (idx < 0) return null;
  const fi = K.topoOf(b.shape).faces[idx];
  if (!fi || fi.type !== "PLANE") return null;
  const n0 = V.norm(pl0.n);
  const n = V.dot(fi.n, n0) < 0 ? V.mul(fi.n, -1) : fi.n; // keep the side the sketch was made on
  const rotated = V.dot(n, n0) < 1 - 1e-12;
  const nn = rotated ? n : pl0.n;
  const x = rotated ? V.norm(rotateTo(pl0.x, n0, n)) : pl0.x;
  const on = Array.isArray(ref.p) ? ref.p : fi.c; // a point on the face (locateFace moved it there)
  const o = V.add(pl0.o, V.mul(nn, V.dot(V.sub(on, pl0.o), nn)));
  const np = { o, x, n: nn };
  return samePlane(np, pl0) ? pl0 : np;
}

function resolvePlane(ref, st) {
  if (!ref) return null;
  if (ref.kind === "origin") return K.ORIGIN_PLANES[ref.name];
  if (ref.kind === "cplane") {
    const p = st.planes.get(ref.id);
    if (!p) throw new Error("Referenced construction plane is missing");
    return p.plane;
  }
  if (ref.kind === "face") {
    // follow the face after upstream edits (falls back to the stored plane if it is lost)
    let np = null;
    try { np = followFacePlane(st, ref, ref.plane); } catch { np = null; }
    if (np && np !== ref.plane) ref.plane = np;
    return ref.plane;
  }
  if (ref.kind === "plane") return ref.plane;
  return null;
}

function resolveRegion(st, prof) {
  const s = st.sketches.get(prof.sketch);
  if (!s) throw new Error("Profile sketch is missing or after the marker");
  const regs = s.regions.regions;
  let r = regs.find((x) => x.key === prof.key);
  if (!r && prof.c) {
    // fall back to geometric containment of the remembered interior point
    r = regs.find((x) => x.outer.poly && pointInRegion(prof.c, x));
  }
  if (!r) throw new Error("Profile is no longer closed");
  return { region: r, sketch: s };
}

function pointInRegion(p, r) {
  const pip = (q, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return pip(p, r.outer.poly) && !r.holes.some((h) => pip(p, h.poly));
}

function profileGroups(st, profiles) {
  // group regions by sketch (each sketch has its own plane)
  const groups = new Map();
  for (const pr of profiles) {
    const { region, sketch } = resolveRegion(st, pr);
    if (!groups.has(pr.sketch)) groups.set(pr.sketch, { sketch, regions: [] });
    groups.get(pr.sketch).regions.push(region);
  }
  return [...groups.values()];
}

/** {face, info} of a face ref (info = kernel topology summary of the face). Caller deletes face. */
function resolveFace(st, ref) {
  const b = st.bodies.get(ref.body);
  if (!b) throw new Error("Referenced body is missing");
  const idx = locateFace(b.shape, ref);
  const face = idx >= 0 ? K.facesAt(b.shape, [idx])[0] : null;
  if (!face) throw new Error("Referenced face could not be found");
  return { face, info: K.topoOf(b.shape).faces[idx] };
}

function modelSize(st) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const b of st.bodies.values()) {
    const bb = K.bboxOf(b.shape);
    if (!bb) continue;
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); }
  }
  if (!Number.isFinite(mn[0])) return 200;
  return Math.max(50, V.len(V.sub(mx, mn)) * 2 + V.len(mn) + V.len(mx));
}

function touches(a, b) {
  if (!K.boxesOverlap(K.bboxOf(a), K.bboxOf(b), 1e-3)) return false;
  try { return K.shapeDistance(a, b) < 1e-4; } catch { return false; }
}

/** Apply a boolean operation of a tool body into the state. */
function applyOp(st, f, tool, doc, defaultNew) {
  const op = f.operation || "new";
  const participants = (f.bodies && f.bodies.length ? f.bodies : [...st.bodies.keys()].filter((id) => doc.bodies[id]?.visible !== false))
    .filter((id) => st.bodies.has(id));
  if (op === "new" || op === "newComponent") {
    const id = f.newBody || defaultNew;
    st.bodies.set(id, { id, shape: tool, from: f.id });
    return [id];
  }
  if (op === "join") {
    const targets = participants.filter((id) => touches(st.bodies.get(id).shape, tool));
    if (!targets.length) {
      const id = f.newBody || defaultNew;
      st.bodies.set(id, { id, shape: tool, from: f.id });
      return [id];
    }
    let s = K.fuse(st.bodies.get(targets[0]).shape, tool);
    for (const t of targets.slice(1)) { const n = K.fuse(s, st.bodies.get(t).shape); K.del(s); s = n; st.bodies.delete(t); }
    st.bodies.set(targets[0], { id: targets[0], shape: s, from: f.id });
    return [targets[0]];
  }
  const out = [];
  const tb = K.bboxOf(tool);
  for (const id of participants) {
    const b = st.bodies.get(id);
    if (!K.boxesOverlap(K.bboxOf(b.shape), tb)) {
      if (op === "intersect") st.bodies.delete(id);
      continue;
    }
    const r = op === "cut" ? K.cut(b.shape, tool) : K.intersect(b.shape, tool);
    if (K.isEmptyShape(r)) st.bodies.delete(id);
    else st.bodies.set(id, { id, shape: r, from: f.id });
    out.push(id);
  }
  if (!out.length && op === "cut") throw new Error("The cut does not intersect any body");
  return out;
}

function axisFromRef(st, ref) {
  // returns {o, d}
  if (!ref) throw new Error("Select an axis");
  if (ref.kind === "origin") return { o: [0, 0, 0], d: K.ORIGIN_AXES[ref.name] };
  if (ref.kind === "sketchLine") {
    const s = st.sketches.get(ref.sketch);
    if (!s) throw new Error("Axis sketch missing");
    const cv = s.sk.curves[ref.curve];
    if (!cv || cv.type !== "line") throw new Error("Axis line missing");
    const a = s.sk.points[cv.p1], b = s.sk.points[cv.p2];
    const pa = K.toWorld(s.plane, a.x, a.y), pb = K.toWorld(s.plane, b.x, b.y);
    return { o: pa, d: V.norm(V.sub(pb, pa)) };
  }
  if (ref.kind === "edge") {
    const b = st.bodies.get(ref.body);
    if (!b) throw new Error("Axis body missing");
    const idx = Array.isArray(ref.p) || ref.sig ? locateEdge(b.shape, ref) : -1;
    const [e] = idx >= 0 ? K.edgesAt(b.shape, [idx]) : [];
    if (!e) throw new Error("Axis edge missing");
    try {
      const tup = (v) => { const r = v.toTuple(); v.delete(); return r; };
      const s = tup(e.startPoint), t = tup(e.endPoint);
      if (e.geomType === "CIRCLE") {
        // axis of a circular edge: through its centre along its normal
        const m = tup(e.pointAt(0.25)), h = tup(e.pointAt(0.5));
        const c = circumcenter(s, m, h);
        const n = V.norm(V.cross(V.sub(m, c), V.sub(h, c)));
        return { o: c, d: n };
      }
      return { o: s, d: V.norm(V.sub(t, s)) };
    } finally { K.del(e); }
  }
  throw new Error("Unsupported axis");
}

function circumcenter(a, b, c) {
  const ab = V.sub(b, a), ac = V.sub(c, a);
  const n = V.cross(ab, ac);
  const d = 2 * V.dot(n, n) || 1e-12;
  const t1 = V.mul(V.cross(n, ab), V.dot(ac, ac));
  const t2 = V.mul(V.cross(ac, n), V.dot(ab, ab));
  return V.add(a, V.mul(V.add(t1, t2), 1 / d));
}

function bodiesBBoxCenter(st, ids) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const id of ids) {
    const bb = st.bodies.get(id) && K.bboxOf(st.bodies.get(id).shape);
    if (!bb) continue;
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); }
  }
  if (!Number.isFinite(mn[0])) return [0, 0, 0];
  return V.mul(V.add(mn, mx), 0.5);
}

// ---------- feature implementations ----------
const APPLY = {
  sketch(st, f, P) {
    let plane = f.planeRef && f.planeRef.kind === "cplane" ? resolvePlane(f.planeRef, st) : f.plane;
    let lost = false;
    if (f.planeRef && f.planeRef.kind === "face" && f.plane) {
      // a sketch on a body face follows the face (taller extrude -> the sketch moves up with it)
      let np = null;
      try { np = followFacePlane(st, f.planeRef, f.plane); } catch { np = null; }
      if (np) {
        if (np !== f.plane) { f.plane = np; f.planeRef.plane = { o: [...np.o], x: [...np.x], n: [...np.n] }; }
        plane = f.plane;
      } else lost = true;
    }
    const status = S.solve(f.sk, P);
    const regions = S.regions(f.sk);
    st.sketches.set(f.id, { id: f.id, plane, sk: f.sk, regions, status });
    if (!status.ok) return { warning: "Sketch could not be fully solved" };
    if (lost) return { warning: "The sketch plane's face could not be found; the sketch keeps its last position" };
  },

  extrude(st, f, P, doc) {
    const d1 = fval(P, f, "distance");
    const taper = f.taper !== undefined && f.taper !== "" ? fval(P, f, "taper") : 0;
    const dirType = f.dirType || "one";
    const extentAll = f.extent === "all";
    let tool = null;
    const big = modelSize(st);
    const startOff = f.startType === "offset" && f.startOffset !== undefined ? fval(P, f, "startOffset") : 0;
    const flip = f.flip ? -1 : 1;
    const parts = [];
    for (const g of profileGroups(st, f.profiles || [])) {
      const pl = g.sketch.plane;
      // untapered: faces built straight from the regions (exact union, no 2D booleans); tapered:
      // replicad drawings (2D offset of the profile)
      const ext = (start, dist, tp) => (Math.abs(tp) > 1e-9
        ? K.extrudeDrawing(K.regionsDrawing(g.regions, g.sketch.regions.vertices), pl, start, dist, tp)
        : K.extrudeRegions(g.regions, g.sketch.regions.vertices, pl, start, dist));
      if (dirType === "one") {
        const d = extentAll ? big * flip : d1;
        parts.push(ext(startOff, d, taper));
      } else if (dirType === "sym") {
        const half = extentAll ? big : f.symMeasure === "whole" ? d1 / 2 : d1;
        parts.push(ext(startOff - half, 2 * half, 0));
      } else {
        const all2 = f.extent2 ? f.extent2 === "all" : extentAll; // side 2 may have its own extent
        const d2 = all2 ? big : fval(P, f, "distance2");
        const taper2 = f.taper2 !== undefined && f.taper2 !== "" ? fval(P, f, "taper2") : 0;
        parts.push(ext(startOff, extentAll ? big : d1, taper));
        parts.push(ext(startOff, -Math.abs(d2), taper2));
      }
    }
    for (const fr of f.faces || []) {
      const { face, info } = resolveFace(st, fr);
      const n = info.n;
      const d = extentAll ? big * flip : d1;
      try {
        if (dirType === "sym") {
          const half = f.symMeasure === "whole" ? d / 2 : d;
          const pz = K.prism(face, V.mul(n, 2 * half));
          parts.push(K.translated(pz, V.mul(n, -half)));
          K.del(pz);
        } else {
          parts.push(K.prism(face, V.mul(n, d)));
        }
      } finally { K.del(face); }
    }
    if (!parts.length) throw new Error("Select a profile or face");
    tool = fuseTemp(parts);
    st._tool = tool;
    return { affected: applyOp(st, f, tool, doc) };
  },

  revolve(st, f, P, doc) {
    const ax = axisFromRef(st, f.axis);
    const full = f.revType === "full";
    let ang = full ? 360 : fval(P, f, "angle");
    const parts = [];
    for (const g of profileGroups(st, f.profiles || [])) {
      const rev = (a) => K.revolveRegions(g.regions, g.sketch.regions.vertices, g.sketch.plane, ax.o, ax.d, a);
      if (f.dirType === "sym" && !full) {
        const s = rev(ang);
        parts.push(K.rotated(s, -ang / 2, ax.o, ax.d));
        K.del(s);
      } else if (f.dirType === "two" && !full) {
        const a2 = fval(P, f, "angle2");
        parts.push(rev(ang));
        const s2 = rev(a2);
        parts.push(K.rotated(s2, -a2, ax.o, ax.d));
        K.del(s2);
      } else {
        parts.push(rev(ang));
      }
    }
    if (!parts.length) throw new Error("Select a profile");
    const tool = fuseTemp(parts);
    st._tool = tool;
    return { affected: applyOp(st, f, tool, doc) };
  },

  fillet(st, f, P) { return edgeFeature(st, f, P, "fillet"); },
  chamfer(st, f, P) { return edgeFeature(st, f, P, "chamfer"); },

  shell(st, f, P) {
    const t = fval(P, f, "thickness");
    const byBody = new Map();
    for (const fr of f.faces || []) {
      if (!byBody.has(fr.body)) byBody.set(fr.body, []);
      byBody.get(fr.body).push(fr);
    }
    for (const b of f.bodies || []) if (!byBody.has(b)) byBody.set(b, []);
    if (!byBody.size) throw new Error("Select faces or a body");
    for (const [bid, refs] of byBody) {
      const b = st.bodies.get(bid);
      if (!b) throw new Error("Body missing");
      const faces = locateFaces(b.shape, refs);
      const thick = f.direction === "outside" ? -t : t;
      let s;
      if (!faces.length) throw new Error("Shell without removed faces is not supported; select at least one face");
      try { s = quietFinder(() => K.shellFaces(b.shape, faces, thick)); } finally { K.del(faces); }
      if (K.isEmptyShape(s)) throw new Error("Shell failed — try a smaller thickness");
      st.bodies.set(bid, { id: bid, shape: s, from: f.id });
    }
  },

  draft(st, f, P) {
    const ang = fval(P, f, "angle");
    const byBody = new Map();
    for (const fr of f.faces || []) {
      if (!byBody.has(fr.body)) byBody.set(fr.body, []);
      byBody.get(fr.body).push(fr);
    }
    const pull = resolvePlane(f.plane, st);
    if (!pull) throw new Error("Select a pull direction plane");
    for (const [bid, refs] of byBody) {
      const b = st.bodies.get(bid);
      if (!b) throw new Error("Body missing");
      const faces = locateFaces(b.shape, refs);
      if (!faces.length) throw new Error("Selected faces are missing");
      let s;
      try { s = quietFinder(() => K.draftFaces(b.shape, faces, ang, pull)); } finally { K.del(faces); }
      st.bodies.set(bid, { id: bid, shape: s, from: f.id });
    }
  },

  hole(st, f, P, doc) {
    const h = {
      diameter: fval(P, f, "diameter"),
      depth: f.extent === "all" ? modelSize(st) : fval(P, f, "depth"),
      tip: f.drillPoint || "angle",
      tipAngle: f.tipAngle ? fval(P, f, "tipAngle") : 118,
      type: f.holeType || "simple",
      cbD: f.cbD ? fval(P, f, "cbD") : 0,
      cbDepth: f.cbDepth ? fval(P, f, "cbDepth") : 0,
      csD: f.csD ? fval(P, f, "csD") : 0,
      csAngle: f.csAngle ? fval(P, f, "csAngle") : 90,
    };
    if (h.diameter <= 0) throw new Error("Diameter must be positive");
    const centers = [];
    if (f.placement === "points") {
      for (const sp of f.sketchPoints || []) {
        const s = st.sketches.get(sp.sketch);
        if (!s) continue;
        const pt = s.sk.points[sp.point];
        if (!pt) continue;
        const n = s.plane.n;
        centers.push({ p: K.toWorld(s.plane, pt.x, pt.y), dir: V.mul(n, f.flip ? 1 : -1) });
      }
    } else {
      const { points, normal } = holeOnFace(st, f);
      for (const c of points) centers.push({ p: c, dir: V.mul(normal, f.flip ? 1 : -1) });
    }
    if (!centers.length) throw new Error("Select a hole position");
    const tool = fuseTemp(centers.map((c) => K.holeTool(c.p, c.dir, h)));
    st._tool = tool;
    const fx = { ...f, operation: "cut" };
    return { affected: applyOp(st, fx, tool, doc) };
  },

  box(st, f, P, doc) {
    const pl = resolvePlane(f.plane, st) || K.ORIGIN_PLANES.XY;
    const L = fval(P, f, "length"), W = fval(P, f, "width"), H = fval(P, f, "height");
    const [u, v] = f.center || [0, 0];
    const d = R.drawRectangle(L, W).translate(u, v);
    const tool = K.extrudeDrawing(d, pl, 0, H, 0);
    st._tool = tool;
    return { affected: applyOp(st, f, tool, doc) };
  },
  cylinder(st, f, P, doc) {
    const pl = resolvePlane(f.plane, st) || K.ORIGIN_PLANES.XY;
    const D = fval(P, f, "diameter"), H = fval(P, f, "height");
    const [u, v] = f.center || [0, 0];
    const tool = K.extrudeDrawing(R.drawCircle(D / 2).translate(u, v), pl, 0, H, 0);
    st._tool = tool;
    return { affected: applyOp(st, f, tool, doc) };
  },
  sphere(st, f, P, doc) {
    const pl = resolvePlane(f.plane, st) || K.ORIGIN_PLANES.XY;
    const D = fval(P, f, "diameter");
    const [u, v] = f.center || [0, 0];
    const c = K.toWorld(pl, u, v);
    const sp = R.makeSphere(D / 2);
    const tool = K.translated(sp, c);
    K.del(sp);
    st._tool = tool;
    return { affected: applyOp(st, f, tool, doc) };
  },
  torus(st, f, P, doc) {
    const pl = resolvePlane(f.plane, st) || K.ORIGIN_PLANES.XY;
    const D1 = fval(P, f, "d1"), D2 = fval(P, f, "d2");
    const [u, v] = f.center || [0, 0];
    const c = K.toWorld(pl, u, v);
    // circle in the plane spanned by plane.x and plane.n, revolved about plane.n
    const sec = { o: c, x: pl.x, n: V.mul(K.planeY(pl), -1) };
    const prof = R.drawCircle(D2 / 2).translate(D1 / 2, 0);
    const tool = K.revolveDrawing(prof, sec, c, pl.n, 360);
    st._tool = tool;
    return { affected: applyOp(st, f, tool, doc) };
  },

  combine(st, f) {
    const tgt = st.bodies.get(f.target);
    if (!tgt) throw new Error("Select a target body");
    const tools = (f.tools || []).filter((id) => id !== f.target && st.bodies.has(id));
    if (!tools.length) throw new Error("Select tool bodies");
    let s = tgt.shape;
    for (const id of tools) {
      const t = st.bodies.get(id).shape;
      const n = f.operation === "cut" ? K.cut(s, t) : f.operation === "intersect" ? K.intersect(s, t) : K.fuse(s, t);
      if (s !== tgt.shape) K.del(s);
      s = n;
    }
    if (K.isEmptyShape(s)) throw new Error("Combine produced an empty body");
    st.bodies.set(f.target, { id: f.target, shape: s, from: f.id });
    if (!f.keepTools) for (const id of tools) st.bodies.delete(id);
  },

  mirror(st, f) {
    const pl = resolvePlane(f.plane, st);
    if (!pl) throw new Error("Select a mirror plane");
    (f.bodies || []).forEach((id, i) => {
      const b = st.bodies.get(id);
      if (!b) return;
      const m = K.mirrored(b.shape, pl.n, pl.o);
      const nid = f.newBodies && f.newBodies[i];
      if (f.operation === "join") { st.bodies.set(id, { id, shape: K.fuse(b.shape, m), from: f.id }); K.del(m); }
      else if (nid) st.bodies.set(nid, { id: nid, shape: m, from: f.id });
      else K.del(m);
    });
  },

  rpattern(st, f, P) {
    const q1 = Math.max(1, Math.round(fval(P, f, "q1"))), d1 = fval(P, f, "d1");
    const q2 = f.dir2 ? Math.max(1, Math.round(fval(P, f, "q2"))) : 1;
    const d2 = f.dir2 ? fval(P, f, "d2") : 0;
    const a1 = K.ORIGIN_AXES[f.dir1 || "X"], a2 = f.dir2 ? K.ORIGIN_AXES[f.dir2] : [0, 0, 0];
    const sp1 = f.distType === "extent" && q1 > 1 ? d1 / (q1 - 1) : d1;
    const sp2 = f.distType === "extent" && q2 > 1 ? d2 / (q2 - 1) : d2;
    let k = 0;
    for (const id of f.bodies || []) {
      const b = st.bodies.get(id);
      if (!b) continue;
      for (let i = 0; i < q1; i++) for (let j = 0; j < q2; j++) {
        if (i === 0 && j === 0) continue;
        const off = V.add(V.mul(a1, sp1 * i), V.mul(a2, sp2 * j));
        const nid = (f.newBodies || [])[k++] || `${f.id}_${k}`;
        st.bodies.set(nid, { id: nid, shape: K.translated(b.shape, off), from: f.id });
      }
    }
  },

  cpattern(st, f, P) {
    const n = Math.max(1, Math.round(fval(P, f, "count")));
    const tot = f.angle !== undefined ? fval(P, f, "angle") : 360;
    const ax = axisFromRef(st, f.axis || { kind: "origin", name: "Z" });
    const step = Math.abs(tot - 360) < 1e-9 ? 360 / n : n > 1 ? tot / (n - 1) : 0;
    let k = 0;
    for (const id of f.bodies || []) {
      const b = st.bodies.get(id);
      if (!b) continue;
      for (let i = 1; i < n; i++) {
        const nid = (f.newBodies || [])[k++] || `${f.id}_${k}`;
        st.bodies.set(nid, { id: nid, shape: K.rotated(b.shape, step * i, ax.o, ax.d), from: f.id });
      }
    }
  },

  move(st, f, P) {
    const t = ["tx", "ty", "tz"].map((k) => (f[k] !== undefined ? fval(P, f, k) : 0));
    const r = ["rx", "ry", "rz"].map((k) => (f[k] !== undefined ? fval(P, f, k) : 0));
    const pivot = bodiesBBoxCenter(st, f.bodies || []);
    (f.bodies || []).forEach((id, i) => {
      const b = st.bodies.get(id);
      if (!b) return;
      let s = b.shape;
      const step = (n) => { if (s !== b.shape) K.del(s); s = n; };
      if (r[0]) step(K.rotated(s, r[0], pivot, [1, 0, 0]));
      if (r[1]) step(K.rotated(s, r[1], pivot, [0, 1, 0]));
      if (r[2]) step(K.rotated(s, r[2], pivot, [0, 0, 1]));
      step(K.translated(s, t));
      if (f.copy) {
        const nid = (f.newBodies || [])[i] || `${f.id}_${i}`;
        st.bodies.set(nid, { id: nid, shape: s, from: f.id });
      } else st.bodies.set(id, { id, shape: s, from: f.id });
    });
  },

  delete(st, f) {
    for (const id of f.bodies || []) st.bodies.delete(id);
  },

  cplane(st, f, P) {
    let plane;
    if (f.mode === "angle") {
      const ax = axisFromRef(st, f.axis);
      const ang = (fval(P, f, "angle") * Math.PI) / 180;
      // reference: a plane containing the axis; rotate its normal around the axis
      let ref = V.cross(ax.d, [0, 0, 1]);
      if (V.len(ref) < 1e-6) ref = V.cross(ax.d, [0, 1, 0]);
      ref = V.norm(ref);
      const n0 = V.norm(V.cross(ax.d, ref));
      const n = V.add(V.mul(n0, Math.cos(ang)), V.mul(V.cross(ax.d, n0), Math.sin(ang)));
      plane = { o: ax.o, x: ax.d, n: V.norm(n) };
    } else if (f.mode === "midplane") {
      const a = resolvePlane(f.base, st), b = resolvePlane(f.base2, st);
      const o = V.mul(V.add(a.o, V.add(b.o, V.mul(b.n, V.dot(V.sub(a.o, b.o), b.n)))), 0.5);
      plane = { o: V.mul(V.add(a.o, b.o), 0.5), x: a.x, n: a.n };
      void o;
    } else {
      const base = resolvePlane(f.base, st);
      if (!base) throw new Error("Select a plane or planar face");
      plane = K.offsetPlane(base, fval(P, f, "offset"));
    }
    st.planes.set(f.id, { id: f.id, plane, name: f.name });
  },

  loft(st, f, P, doc) {
    const wires = [];
    for (const pr of f.profiles || []) {
      const { region, sketch } = resolveRegion(st, pr);
      const d = K.regionDrawing(region, sketch.regions.vertices);
      wires.push(K.sketchWire(d, sketch.plane));
    }
    if (wires.length < 2) throw new Error("Select at least two profiles");
    const tool = R.loft(wires, { ruled: !!f.ruled });
    st._tool = tool;
    return { affected: applyOp(st, f, tool, doc) };
  },

  sweep(st, f, P, doc) {
    const { region, sketch } = resolveRegion(st, f.profile || {});
    const prof = K.sketchWire(K.regionDrawing(region, sketch.regions.vertices), sketch.plane);
    const ps = st.sketches.get(f.path && f.path.sketch);
    if (!ps) throw new Error("Select a path");
    const edges = [];
    for (const cid of f.path.curves || []) {
      const cv = ps.sk.curves[cid];
      if (!cv) continue;
      const W = (id) => K.toWorld(ps.plane, ps.sk.points[id].x, ps.sk.points[id].y);
      if (cv.type === "line") edges.push(R.makeLine(W(cv.p1), W(cv.p2)));
      else if (cv.type === "arc") {
        const c = ps.sk.points[cv.c], a = ps.sk.points[cv.p1], b = ps.sk.points[cv.p2];
        let a0 = Math.atan2(a.y - c.y, a.x - c.x), a1 = Math.atan2(b.y - c.y, b.x - c.x);
        if (a1 <= a0) a1 += 2 * Math.PI;
        const m = (a0 + a1) / 2;
        const mid = K.toWorld(ps.plane, c.x + cv.r * Math.cos(m), c.y + cv.r * Math.sin(m));
        edges.push(R.makeThreePointArc(W(cv.p1), mid, W(cv.p2)));
      }
    }
    if (!edges.length) throw new Error("Path has no curves");
    const spine = R.assembleWire(orderEdges(edges));
    const tool = R.genericSweep(prof, spine, { frenet: true, transitionMode: "right" }, false);
    st._tool = tool;
    return { affected: applyOp(st, f, tool, doc) };
  },
};

/** Fuse freshly made tool shapes into one; the inputs and intermediate results are released. */
function fuseTemp(parts) {
  let s = null;
  for (const p of parts) {
    if (!s) { s = p; continue; }
    const n = K.fuse(s, p);
    K.del(s, p);
    s = n;
  }
  return s;
}

/**
 * Centres + normal of a hole placed on a face. The hole stays on its face like in Fusion: the face
 * is re-found (f.faceRef, signature first) and the centres are projected onto it along its normal,
 * so a taller extrude carries the hole up instead of leaving a hidden void at the old height.
 * Older documents without f.faceRef get one inferred from the face the first centre lies on.
 * Updated centres/normal are written back into the feature (derived data).
 */
function holeOnFace(st, f) {
  let pts = (f.points || []).filter((c) => Array.isArray(c));
  let nrm = Array.isArray(f.normal) ? V.norm(f.normal) : [0, 0, 1];
  if (!pts.length) return { points: pts, normal: nrm };
  let fr = f.faceRef && st.bodies.has(f.faceRef.body) ? f.faceRef : null;
  if (!f.faceRef) {
    // infer: a planar face containing the first centre with the hole's normal
    for (const b of st.bodies.values()) {
      const nf = K.nearestFaceIndex(b.shape, pts[0], nrm);
      if (!nf || nf.dist > 1e-4) continue;
      const fi = K.topoOf(b.shape).faces[nf.index];
      if (!fi || fi.type !== "PLANE" || V.dot(fi.n, nrm) < 0.999) continue;
      fr = f.faceRef = { body: b.id, p: [...pts[0]], n: [...nrm] };
      break;
    }
  }
  if (!fr) return { points: pts, normal: nrm };
  const b = st.bodies.get(fr.body);
  const idx = locateFace(b.shape, fr);
  const fi = idx >= 0 ? K.topoOf(b.shape).faces[idx] : null;
  if (!fi || fi.type !== "PLANE" || fi.d === undefined) return { points: pts, normal: nrm };
  const n = fi.n;
  const np = pts.map((c) => V.add(c, V.mul(n, fi.d - V.dot(n, c))));
  if (np.some((c, i) => moved(c, pts[i]))) { f.points = np.map(K.roundVec); pts = f.points; }
  if (V.dot(n, nrm) < 1 - 1e-9) { f.normal = K.roundVec(n); nrm = n; }
  return { points: pts, normal: nrm };
}

function orderEdges(edges) {
  if (edges.length < 2) return edges;
  const out = [edges[0]];
  const rest = edges.slice(1);
  const close = (a, b) => V.len(V.sub(a, b)) < 1e-5;
  while (rest.length) {
    const end = out[out.length - 1].endPoint.toTuple();
    const st = out[0].startPoint.toTuple();
    let i = rest.findIndex((e) => close(e.startPoint.toTuple(), end) || close(e.endPoint.toTuple(), end));
    if (i >= 0) { out.push(rest.splice(i, 1)[0]); continue; }
    i = rest.findIndex((e) => close(e.endPoint.toTuple(), st) || close(e.startPoint.toTuple(), st));
    if (i >= 0) { out.unshift(rest.splice(i, 1)[0]); continue; }
    out.push(...rest.splice(0));
  }
  return out;
}

// replicad's edge/face finders console.error "failed to compute a normal" for degenerate edges
// (e.g. the apex of a drill-point cone) while scanning a body; harmless, so keep it out of the console.
function quietFinder(fn) {
  const ce = console.error;
  console.error = (...a) => { if (typeof a[0] === "string" && a[0].startsWith("failed to compute a normal")) return; ce.apply(console, a); };
  try { return fn(); } finally { console.error = ce; }
}

function edgeFeature(st, f, P, kind) {
  const r = fval(P, f, kind === "fillet" ? "radius" : "distance");
  if (r <= 0) throw new Error("Value must be positive");
  const byBody = new Map();
  for (const er of f.edges || []) {
    if (!byBody.has(er.body)) byBody.set(er.body, []);
    byBody.get(er.body).push(er);
  }
  if (!byBody.size) throw new Error("Select edges");
  for (const [bid, refs] of byBody) {
    const b = st.bodies.get(bid);
    if (!b) throw new Error("Body missing");
    const idx = [];
    for (const er of refs) {
      const i = locateEdge(b.shape, er);
      if (i >= 0 && !idx.includes(i)) idx.push(i);
    }
    if (!idx.length) throw new Error("Selected edges are missing");
    let edges = K.edgesAt(b.shape, idx);
    if (f.tangentChain !== false) edges = K.tangentChain(b.shape, edges);
    let s;
    try {
      s = quietFinder(() => (kind === "fillet" ? K.filletEdges(b.shape, edges, r) : K.chamferEdges(b.shape, edges, r)));
    } finally { K.del(edges); }
    if (K.isEmptyShape(s)) throw new Error(`${kind === "fillet" ? "Fillet" : "Chamfer"} failed — try a smaller value`);
    st.bodies.set(bid, { id: bid, shape: s, from: f.id });
  }
}

// ---------- evaluator with incremental cache ----------
export class Evaluator {
  constructor() {
    this.cache = [];
  }
  invalidate() {
    this.cache = [];
  }
  run(doc, opts = {}) {
    const P = buildParams(doc);
    let st = { bodies: new Map(), sketches: new Map(), planes: new Map() };
    const results = {};
    const upto = opts.upto ?? doc.marker;
    let broken = false;
    const t0 = performance.now();
    for (let i = 0; i < doc.features.length; i++) {
      const f = doc.features[i];
      if (i >= upto) { results[f.id] = { rolled: true }; continue; }
      if (f.suppressed) {
        // A suppressed feature passes the state through. Record that in the cache so that
        // (un)suppressing it invalidates everything after it — otherwise later features would
        // reuse cached states computed with (or without) it.
        results[f.id] = { suppressed: true };
        const ssig = `suppressed:${f.id}`;
        const sc = this.cache[i];
        if (!sc || sc.sig !== ssig || sc.id !== f.id) broken = true;
        this.cache[i] = { sig: ssig, state: st, result: results[f.id], id: f.id };
        continue;
      }
      let sig;
      try {
        sig = JSON.stringify(f) + "|" + paramSig(P, f);
      } catch (e) {
        sig = Math.random().toString();
      }
      const c = this.cache[i];
      if (!broken && c && c.sig === sig && c.id === f.id) {
        st = c.state;
        results[f.id] = c.result;
        continue;
      }
      broken = true;
      const ns = cloneState(st);
      let result;
      try {
        const r = APPLY[f.type] ? APPLY[f.type](ns, f, P, doc) : null;
        result = { ok: true, ...(r || {}) };
        st = ns;
      } catch (e) {
        result = { ok: false, error: friendly(e) };
      }
      if (f.type === "sketch" && result.ok === false) {
        // keep sketch visible even if solve threw
      }
      const tool = ns._tool;
      delete ns._tool;
      result.tool = tool;
      results[f.id] = result;
      // the sig must be taken after evaluation: sketches move their coordinates when solved and
      // geometric refs are refreshed (signature / point on the entity) when resolved
      try { sig = JSON.stringify(f) + "|" + paramSig(P, f); } catch { /* keep the pre-evaluation sig */ }
      this.cache[i] = { sig, state: st, result, id: f.id };
    }
    this.cache.length = Math.min(this.cache.length, doc.features.length);
    // features after `upto` were not evaluated: if anything upstream was recomputed their
    // cached states are stale (e.g. a sketch edited while the timeline is rolled back to it)
    if (broken && this.cache.length > upto) this.cache.length = upto;
    return { state: st, results, params: P, ms: performance.now() - t0 };
  }
}

function paramSig(P, f) {
  const vals = [];
  if (f.p) for (const name of Object.values(f.p)) {
    try { vals.push(P.value(name)); } catch (e) { vals.push("E:" + e.message); }
  }
  if (f.type === "sketch") for (const c of f.sk.constraints) if (c.param) {
    try { vals.push(P.value(c.param)); } catch (e) { vals.push("E"); }
  }
  return vals.join(",");
}

function friendly(e) {
  const m = String(e && e.message ? e.message : e);
  if (/table index|unreachable|memory access|RuntimeError/i.test(m)) return "The geometry kernel could not compute this feature";
  if (/^\d+$/.test(m)) return "The geometry kernel could not compute this feature";
  if (/WebAssembly\.Exception|^\[object /.test(m)) return "The geometry kernel could not compute this feature";
  return m;
}

export function featureParamsList(doc, P) {
  // For the Change Parameters dialog
  const rows = [];
  for (const f of doc.features) {
    const defs = FIELDS[f.type] || {};
    const items = [];
    if (f.p) for (const [key, name] of Object.entries(f.p)) {
      if (f[key] === undefined || f[key] === "") continue;
      let value, error;
      try { value = P.value(name); } catch (e) { error = e.message; }
      items.push({ name, key, expr: f[key], kind: defs[key] || "length", value, error, feature: f.id });
    }
    if (f.type === "sketch") for (const c of f.sk.constraints) if (c.param) {
      let value, error;
      try { value = P.value(c.param); } catch (e) { error = e.message; }
      items.push({ name: c.param, cid: c.id, expr: c.expr, kind: c.type === "angle" ? "angle" : "length", value, error, feature: f.id, label: dimLabel(c) });
    }
    if (items.length) rows.push({ feature: f, items });
  }
  return rows;
}

function dimLabel(c) {
  return { distance: "Linear Dimension", diameter: "Diameter Dimension", radius: "Radial Dimension", angle: "Angular Dimension", pointLine: "Linear Dimension" }[c.type] || "Dimension";
}
