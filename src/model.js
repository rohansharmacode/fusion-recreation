// Parametric document model: features in a timeline, evaluated in order.
import { ParamTable } from "./expr.js";
import * as S from "./sketch/sketch.js";
import * as K from "./kernel.js";
import * as MD from "./meshdata.js";

const { R, V } = K;
export { MD as meshOps };

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
  cplane: { offset: "length", angle: "angle", distance: "none" },
  rpattern: { q1: "none", d1: "length", q2: "none", d2: "length" },
  cpattern: { count: "none", angle: "angle" },
  move: { tx: "length", ty: "length", tz: "length", rx: "angle", ry: "angle", rz: "angle" },
  mirror: {},
  combine: {},
  loft: {},
  sweep: {},
  delete: {},
  draft: { angle: "angle" },
  split: {},
  coil: { diameter: "length", revolutions: "none", height: "length", pitch: "length", angle: "angle", sectionSize: "length" },
  pipe: { distance: "none", sectionSize: "length", thickness: "length" },
  scale: { factor: "none", sx: "none", sy: "none", sz: "none" },
  thread: { length: "length", offset: "length" },
  mesh: {},
  component: {},
  snapshot: {},
};

export const TYPE_LABEL = {
  sketch: "Sketch", extrude: "Extrude", revolve: "Revolve", fillet: "Fillet", chamfer: "Chamfer",
  shell: "Shell", hole: "Hole", box: "Box", cylinder: "Cylinder", sphere: "Sphere", torus: "Torus",
  cplane: "Plane", rpattern: "Rectangular Pattern", cpattern: "Circular Pattern", move: "Move",
  mirror: "Mirror", combine: "Combine", loft: "Loft", sweep: "Sweep", delete: "Delete", draft: "Draft",
  split: "Split Body", coil: "Coil", pipe: "Pipe", scale: "Scale", thread: "Thread", mesh: "Mesh",
  component: "Component", snapshot: "Position",
};
export const NAME_STEM = { ...TYPE_LABEL, cplane: "Offset Plane", rpattern: "Rectangular Pattern", cpattern: "Circular Pattern" };

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
/**
 * New body id and metadata. Default names count only default-named bodies (counters.bodyName), so a mesh body
 * named after its file does not use up "BodyN" (Fusion names the next solid Body2, not Body3).
 */
export function nextBody(doc, meta = {}) {
  const c = doc.counters;
  if (c.bodyName === undefined) c.bodyName = c.body || 0; // older documents: every body took the shared counter
  c.body = (c.body || 0) + 1;
  const id = `b${c.body}`;
  const name = meta.name || `Body${++c.bodyName}`;
  doc.bodies[id] = { visible: true, appearance: "steel-satin", material: "steel", ...meta, name };
  return id;
}
/** New component definition + its first occurrence in the document metadata: {comp, occ}. Default names ComponentN. */
export function newComponentMeta(doc, { name } = {}) {
  doc.components = doc.components || {};
  doc.occurrences = doc.occurrences || {};
  const c = doc.counters;
  c.comp = (c.comp || 0) + 1;
  const comp = `c${c.comp}`;
  if (!name) { c.compName = (c.compName || 0) + 1; name = `Component${c.compName}`; }
  doc.components[comp] = { id: comp, name: String(name) };
  return { comp, occ: newOccurrenceMeta(doc, comp) };
}
/** New occurrence of component `comp` (numbered :1, :2 ... per component). */
export function newOccurrenceMeta(doc, comp) {
  doc.occurrences = doc.occurrences || {};
  const c = doc.counters;
  c.occ = (c.occ || 0) + 1;
  const id = `o${c.occ}`;
  const n = 1 + Math.max(0, ...Object.values(doc.occurrences).filter((o) => o.component === comp).map((o) => o.n || 0));
  doc.occurrences[id] = { id, component: comp, n };
  return id;
}
/** Capture Position: uncaptured doc.positions become a 'snapshot' feature at the marker. Returns it (or null). */
export function capturePositions(doc) {
  const pos = doc.positions;
  if (!pos || !Object.keys(pos).length) { delete doc.positions; return null; }
  doc.counters.feature = (doc.counters.feature || 0) + 1;
  const f = { id: `f${doc.counters.feature}`, type: "snapshot", name: nextName(doc, "snapshot"), positions: JSON.parse(JSON.stringify(pos)) };
  doc.features.splice(doc.marker, 0, f);
  doc.marker += 1;
  delete doc.positions;
  return f;
}

/** Give every numeric field of a feature a model parameter name. */
export function assignParams(doc, f) {
  f.p = f.p || {};
  for (const key of Object.keys(FIELDS[f.type] || {})) {
    if (f[key] === undefined || f[key] === null || f[key] === "") continue;
    if (!f.p[key]) f.p[key] = nextParam(doc);
  }
  // body makers the app core does not know about get their result body id here (prepareFeature
  // calls assignParams for every new / edited / previewed feature)
  if (BODY_TYPES.has(f.type) && !f.newBody && ["new", "join", "newComponent", undefined].includes(f.operation)) f.newBody = nextBody(doc);
}
const BODY_TYPES = new Set(["coil", "pipe"]);

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

/** Value of an expression-valued feature field (model parameter when assigned, else the expression). */
export function fval(params, f, key) {
  const kind = (FIELDS[f.type] || {})[key] || "length";
  const name = f.p && f.p[key];
  if (name && params.has(name)) return params.value(name);
  return params.eval(f[key], kind);
}

// ---------- state ----------
// Evaluation state (one per timeline step; features get a shallow copy and replace entries):
//   bodies      Map id -> {id, shape, from, kind?, sheetMetal?}   B-rep bodies (OCCT shapes): solids and
//               surfaces (open shells / faces). kind is optional: shapeKind(shape) derives it.
//   meshBodies  Map id -> {id, kind:'mesh'|'tspline'|..., mesh:{positions, indices?, normals?, groups?}, data?, from}
//               bodies that are not OCCT shapes (triangle meshes, T-spline forms with their evaluated mesh)
//   sketches    Map id -> {id, plane, sk, regions, status}      planes  Map id -> {id, plane, name}
// Modules may add their own Map-valued keys (st.axes, st.points ...): cloneState copies every Map.
//   occ         Map oid -> {id, component, parent, T, inst?}   occurrences (see "components" below)
//   bodyOcc     Map bodyId -> oid                               owner occurrence (no entry = root component)
export function emptyState() {
  return { bodies: new Map(), sketches: new Map(), planes: new Map(), meshBodies: new Map(), occ: new Map(), bodyOcc: new Map() };
}
export function cloneState(st) {
  const n = {};
  for (const [k, v] of Object.entries(st)) {
    if (k === "_tool") continue;
    n[k] = v instanceof Map ? new Map(v) : v;
  }
  if (!n.meshBodies) n.meshBodies = new Map();
  if (!n.occ) n.occ = new Map();
  if (!n.bodyOcc) n.bodyOcc = new Map();
  return n;
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
export function locateEdge(shape, ref) {
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
export function locateFace(shape, ref, anyOrientation = false) {
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
export function locateFaces(shape, refs) {
  const idx = [];
  for (const r of refs) { const i = locateFace(shape, r); if (i >= 0 && !idx.includes(i)) idx.push(i); }
  return K.facesAt(shape, idx);
}

/** Rotate vector v by the rotation that takes unit a onto unit b. */
export function rotateTo(v, a, b) {
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
export function followFacePlane(st, ref, base) {
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

export function resolvePlane(ref, st) {
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

export function resolveRegion(st, prof) {
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

export function pointInRegion(p, r) {
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

export function profileGroups(st, profiles) {
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
export function resolveFace(st, ref) {
  const b = st.bodies.get(ref.body);
  if (!b) throw new Error("Referenced body is missing");
  const idx = locateFace(b.shape, ref);
  const face = idx >= 0 ? K.facesAt(b.shape, [idx])[0] : null;
  if (!face) throw new Error("Referenced face could not be found");
  return { face, info: K.topoOf(b.shape).faces[idx] };
}

export function modelSize(st) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const b of st.bodies.values()) {
    const bb = K.bboxOf(b.shape);
    if (!bb) continue;
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); }
  }
  if (!Number.isFinite(mn[0])) return 200;
  return Math.max(50, V.len(V.sub(mx, mn)) * 2 + V.len(mn) + V.len(mx));
}

export function touches(a, b) {
  if (!K.boxesOverlap(K.bboxOf(a), K.bboxOf(b), 1e-3)) return false;
  try { return K.shapeDistance(a, b) < 1e-4; } catch { return false; }
}

/**
 * Apply a boolean operation of a tool body into the state. Participants: f.bodies when given, else every
 * visible solid body (surface bodies only take part when listed explicitly, like Fusion's solid features).
 */
export function applyOp(st, f, tool, doc, defaultNew) {
  const op = f.operation || "new";
  const explicit = !!(f.bodies && f.bodies.length);
  // default participants: visible solids of the feature's component (and its sub-components); bodies of
  // pasted occurrences (instances "b1@o2") only take part when listed explicitly
  const scope = !explicit && f.occ && st.occ && st.occ.has(f.occ) ? occSubtree(st, f.occ) : null;
  const participants = (explicit ? f.bodies : [...st.bodies.keys()].filter((id) => doc.bodies[id]?.visible !== false && !isInstanceId(id) && (!scope || scope.has(bodyOwner(st, id)))))
    .filter((id) => st.bodies.has(id) && (explicit || isSolidBody(st, id)));
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

export function axisFromRef(st, ref) {
  // returns {o, d}
  if (!ref) throw new Error("Select an axis");
  if (ref.kind === "origin") return { o: [0, 0, 0], d: K.ORIGIN_AXES[ref.name] };
  if (ref.kind === "caxis") {
    // construction axis feature (solidx module): st.axes id -> {o, d}
    const a = st.axes && st.axes.get(ref.id);
    if (!a) throw new Error("Referenced construction axis is missing");
    return { o: a.o, d: a.d };
  }
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

export function circumcenter(a, b, c) {
  const ab = V.sub(b, a), ac = V.sub(c, a);
  const n = V.cross(ab, ac);
  const d = 2 * V.dot(n, n) || 1e-12;
  const t1 = V.mul(V.cross(n, ab), V.dot(ac, ac));
  const t2 = V.mul(V.cross(ac, n), V.dot(ab, ab));
  return V.add(a, V.mul(V.add(t1, t2), 1 / d));
}

export function bodiesBBoxCenter(st, ids) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const id of ids) {
    const bb = bodyBBox(st, id);
    if (!bb) continue;
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); }
  }
  if (!Number.isFinite(mn[0])) return [0, 0, 0];
  return V.mul(V.add(mn, mx), 0.5);
}

// ---------- body kinds ----------
// Every body has a kind: 'solid' (default) | 'surface' (open OCCT shell / faces) | 'mesh' (triangle mesh,
// st.meshBodies) | 'tspline' (form module data + evaluated mesh, st.meshBodies) | a kind a module registered.
// Sheet-metal bodies are solids whose state entry (and doc.bodies meta) carries sheetMetal.
const KIND_CACHE = new WeakMap();
/** 'solid' when the shape holds a solid, 'surface' for faces / shells (cached per shape). */
export function shapeKind(shape) {
  if (!shape || typeof shape !== "object") return null;
  let k = KIND_CACHE.get(shape);
  if (k) return k;
  try {
    if (shape instanceof R.Solid || (R.CompSolid && shape instanceof R.CompSolid)) k = "solid";
    else if (shape instanceof R.Shell || shape instanceof R.Face) k = "surface";
    else {
      const solids = K.solidsOf(shape);
      k = solids.length ? "solid" : K.isEmptyShape(shape) ? "solid" : "surface";
      K.del(solids.filter((s) => s !== shape));
    }
  } catch { k = "solid"; }
  KIND_CACHE.set(shape, k);
  return k;
}
/** Kind of body `id` in a state ('solid' | 'surface' | 'mesh' | 'tspline' | ...), null when absent. */
export function bodyKind(st, id) {
  const b = st && st.bodies && st.bodies.get(id);
  if (b) return b.kind || shapeKind(b.shape) || "solid";
  const m = st && st.meshBodies && st.meshBodies.get(id);
  if (m) return m.kind || "mesh";
  return null;
}
export const isSolidBody = (st, id) => bodyKind(st, id) === "solid";
export const isBrepBody = (st, id) => !!(st && st.bodies && st.bodies.has(id));
/** All body ids of a state (B-rep first, then mesh-like bodies). */
export function allBodyIds(st) {
  return [...(st.bodies ? st.bodies.keys() : []), ...(st.meshBodies ? st.meshBodies.keys() : [])];
}
/** World bounding box {min, max} of any body (B-rep or mesh), or null. */
export function bodyBBox(st, id) {
  const b = st.bodies && st.bodies.get(id);
  if (b) return K.bboxOf(b.shape);
  const m = st.meshBodies && st.meshBodies.get(id);
  if (m && m.bbox) return typeof m.bbox === "function" ? m.bbox() : m.bbox;
  return m && m.mesh ? MD.bbox(m.mesh) : null;
}

// ---------- stored mesh data (Insert Mesh, mesh base features) ----------
// doc.meshData = { [id]: {positions: base64 Float32, indices?: base64 Uint32, groups?: base64 Uint32, tris} }
// Kept out of the feature objects so the evaluator's per-feature signature stays small.
const MESH_DATA_CACHE = new Map(); // fingerprint -> decoded {positions, indices, groups}
/** Store triangle data in the document; returns its id. mesh = {positions, indices?, groups?}. */
export function storeMeshData(doc, mesh) {
  doc.meshData = doc.meshData && typeof doc.meshData === "object" ? doc.meshData : {};
  doc.counters = doc.counters || {};
  doc.counters.meshData = (doc.counters.meshData || 0) + 1;
  const id = `md${doc.counters.meshData}`;
  const rec = { positions: typeof mesh.positions === "string" ? mesh.positions : MD.toB64(Float32Array.from(mesh.positions)) };
  if (mesh.indices) rec.indices = typeof mesh.indices === "string" ? mesh.indices : MD.toB64(Uint32Array.from(mesh.indices));
  if (mesh.groups) rec.groups = typeof mesh.groups === "string" ? mesh.groups : MD.toB64(Uint32Array.from(mesh.groups));
  rec.tris = mesh.tris || (mesh.indices && typeof mesh.indices !== "string" ? mesh.indices.length / 3 : 0) || 0;
  doc.meshData[id] = rec;
  return id;
}
// Staged (not yet stored) mesh data for live previews: "tmp:<n>" ids resolve here, so a dialog can preview a
// feature without writing the triangles into the document; commit with storeMeshData(doc, data).
const STAGED = new Map();
let stagedN = 0;
export function stageMeshData(mesh) {
  const id = `tmp:${++stagedN}`;
  STAGED.set(id, { positions: Float32Array.from(mesh.positions), indices: mesh.indices ? Uint32Array.from(mesh.indices) : null, groups: mesh.groups ? Uint32Array.from(mesh.groups) : null });
  return id;
}
export const stagedMeshData = (id) => STAGED.get(id) || null;
export function unstageMeshData(id) { STAGED.delete(id); }

/** Decoded mesh data {positions, indices|null, groups|null} for doc.meshData[id] (cached), or null. */
export function meshDataOf(doc, id) {
  if (typeof id === "string" && id.startsWith("tmp:")) return STAGED.get(id) || null;
  const rec = doc && doc.meshData && doc.meshData[id];
  if (!rec || typeof rec.positions !== "string") return null;
  const hit = MESH_REC_CACHE.get(rec);
  if (hit && hit.src === rec.positions) return hit.m;
  // full-string hash: a prefix / suffix fingerprint collides for local edits of a mesh with the same size
  const fp = (s) => { if (!s) return "-"; let a = 2166136261; for (let i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 16777619) >>> 0; return `${s.length}:${a.toString(36)}`; };
  const key = `${fp(rec.positions)}|${fp(rec.indices)}|${fp(rec.groups)}`;
  let m = MESH_DATA_CACHE.get(key);
  if (!m) {
    m = { positions: MD.f32FromB64(rec.positions), indices: rec.indices ? MD.u32FromB64(rec.indices) : null, groups: rec.groups ? MD.u32FromB64(rec.groups) : null };
    if (MESH_DATA_CACHE.size > 32) MESH_DATA_CACHE.delete(MESH_DATA_CACHE.keys().next().value);
    MESH_DATA_CACHE.set(key, m);
  }
  MESH_REC_CACHE.set(rec, { src: rec.positions, m });
  return m;
}
const MESH_REC_CACHE = new WeakMap(); // doc.meshData record -> decoded data (skips the hash for a known record)
export const MESH_UNIT_MM = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
const num0 = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
/**
 * File -> world matrix of an Insert Mesh placement {units, flipUp, scale, rx, ry, rz, tx, ty, tz, bbox (file units)}:
 * T(t) T(c) R T(-c) L, where L = unit scale (and Y-up -> Z-up flip), c = scaled centre of the file box, R = XYZ Euler.
 */
export function meshInsertMatrix(m) {
  const k = (MESH_UNIT_MM[m.units] || 1) * num0(m.scale, 1);
  const L = m.flipUp ? [k, 0, 0, 0, 0, 0, -k, 0, 0, k, 0, 0] : MD.scaling([k, k, k]);
  const b = m.bbox || { min: [0, 0, 0], max: [0, 0, 0] };
  const c = MD.apply(L, [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]);
  let M = MD.mul(MD.translation([-c[0], -c[1], -c[2]]), L);
  M = MD.mul(MD.eulerXYZ(num0(m.rx), num0(m.ry), num0(m.rz)), M);
  M = MD.mul(MD.translation([num0(m.tx) + c[0], num0(m.ty) + c[1], num0(m.tz) + c[2]]), M);
  return M;
}

/**
 * Bring an older document up to date (idempotent; returns true when something changed):
 *  - doc.meshes (display-only Insert Mesh store before mesh bodies were real bodies) become `mesh`
 *    timeline features at the start of the timeline with their data in doc.meshData.
 */
export function migrateDoc(doc) {
  if (!doc || typeof doc !== "object") return false;
  let changed = false;
  if (Array.isArray(doc.meshes) && doc.meshes.length) {
    doc.features = Array.isArray(doc.features) ? doc.features : [];
    doc.counters = doc.counters || {};
    doc.bodies = doc.bodies || {};
    const add = [];
    for (const m of doc.meshes) {
      if (!m || typeof m.data !== "string") continue;
      const data = storeMeshData(doc, { positions: m.data, tris: m.tris });
      doc.counters.feature = (doc.counters.feature || 0) + 1;
      const f = {
        id: `f${doc.counters.feature}`, type: "mesh", name: nextName(doc, "mesh"), data,
        file: m.file, format: m.format, units: m.units || "mm", flipUp: !!m.flipUp,
        tx: num0(m.tx), ty: num0(m.ty), tz: num0(m.tz), rx: num0(m.rx), ry: num0(m.ry), rz: num0(m.rz), scale: num0(m.scale, 1),
        tris: m.tris, bbox: m.bbox,
      };
      f.newBody = nextBody(doc, { name: m.name || "Mesh", visible: m.visible !== false, kind: "mesh" });
      add.push(f);
    }
    doc.features.unshift(...add);
    doc.marker = (Number(doc.marker) || 0) + add.length;
    delete doc.meshes;
    changed = true;
  }
  return changed;
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
      // like Fusion: the axis must lie in the profile plane (an axis along the plane normal sweeps
      // the profile flat onto itself: a zero-volume "body")
      if (Math.abs(V.dot(V.norm(ax.d), V.norm(g.sketch.plane.n))) > 1e-6) { K.del(parts); throw new Error("The axis must lie in the plane of the profile"); }
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
    let vol = 0;
    try { vol = K.volumeOf(tool); } catch { vol = 0; }
    if (!(vol > 1e-9)) { K.del(tool); throw new Error("The revolve has no volume; check the axis and the profile"); }
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
      if (K.isEmptyShape(s)) throw new Error("Shell failed: try a smaller thickness");
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

  rpattern(st, f, P, doc) {
    const q1 = Math.max(1, Math.round(fval(P, f, "q1"))), d1 = fval(P, f, "d1");
    const q2 = f.dir2 ? Math.max(1, Math.round(fval(P, f, "q2"))) : 1;
    const d2 = f.dir2 ? fval(P, f, "d2") : 0;
    // a direction is an origin axis name ("X") or an axis ref (origin axis / sketch line / linear edge)
    const dirOf = (d, flip) => V.mul(typeof d === "string" ? K.ORIGIN_AXES[d] : axisFromRef(st, d).d, flip ? -1 : 1);
    const a1 = dirOf(f.dir1 || "X", f.flip1), a2 = f.dir2 ? dirOf(f.dir2, f.flip2) : [0, 0, 0];
    const sp1 = f.distType === "extent" && q1 > 1 ? d1 / (q1 - 1) : d1;
    const sp2 = f.distType === "extent" && q2 > 1 ? d2 / (q2 - 1) : d2;
    if (f.patternType === "features") {
      const xs = [];
      for (let i = 0; i < q1; i++) for (let j = 0; j < q2; j++) {
        if (i === 0 && j === 0) continue;
        const off = V.add(V.mul(a1, sp1 * i), V.mul(a2, sp2 * j));
        xs.push({ shape: (s) => K.translated(s, off), point: (p) => V.add(p, off) });
      }
      return patternFeatures(st, f, P, doc, xs);
    }
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

  cpattern(st, f, P, doc) {
    const n = Math.max(1, Math.round(fval(P, f, "count")));
    const tot = f.angle !== undefined ? fval(P, f, "angle") : 360;
    const ax = axisFromRef(st, f.axis || { kind: "origin", name: "Z" });
    const step = Math.abs(tot - 360) < 1e-9 ? 360 / n : n > 1 ? tot / (n - 1) : 0;
    if (f.patternType === "features") {
      const xs = [];
      for (let i = 1; i < n; i++) xs.push({ shape: (s) => K.rotated(s, step * i, ax.o, ax.d), point: (p) => rotatePoint(p, step * i, ax.o, ax.d) });
      return patternFeatures(st, f, P, doc, xs);
    }
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
      const mb = st.meshBodies && st.meshBodies.get(id);
      if (mb && mb.mesh) {
        // mesh bodies move like B-rep bodies: rotations about the selection centre, then the translation
        let Mx = MD.IDENTITY;
        if (r[0]) Mx = MD.mul(MD.axisRotation(r[0], pivot, [1, 0, 0]), Mx);
        if (r[1]) Mx = MD.mul(MD.axisRotation(r[1], pivot, [0, 1, 0]), Mx);
        if (r[2]) Mx = MD.mul(MD.axisRotation(r[2], pivot, [0, 0, 1]), Mx);
        Mx = MD.mul(MD.translation(t), Mx);
        const moved = { ...mb, mesh: MD.transformBy(mb.mesh, Mx), from: f.id };
        if (f.copy) {
          const nid = (f.newBodies || [])[i] || `${f.id}_${i}`;
          st.meshBodies.set(nid, { ...moved, id: nid });
        } else st.meshBodies.set(id, moved);
        return;
      }
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
    for (const id of f.bodies || []) { st.bodies.delete(id); if (st.meshBodies) st.meshBodies.delete(id); }
  },

  // components (see "components and occurrences"): new / from bodies / paste (another occurrence) / paste new (copy)
  component(st, f, P, doc) { return applyComponent(st, f, doc); },
  // captured occurrence positions (Fusion's "Position" timeline entry, Capture Position)
  snapshot(st, f, P, doc) {
    let n = 0;
    for (const [oid, M] of Object.entries(f.positions || {})) if (st.occ.has(oid) && validM(M)) { moveOccurrence(st, doc, oid, M); n++; }
    return n ? {} : { warning: "The captured components are not in the design" };
  },

  // Insert Mesh (Fusion's "Mesh Base Feature"): a mesh body from stored triangle data (doc.meshData),
  // placed by the Insert Mesh transform (file units, Flip Up Direction, X/Y/Z angles about the file box
  // centre, uniform scale, X/Y/Z distance).
  mesh(st, f, P, doc) {
    const md = meshDataOf(doc, f.data);
    if (!md) throw new Error("The mesh data of this feature is missing");
    const id = f.newBody;
    if (!id) throw new Error("The mesh body is missing");
    const M = meshInsertMatrix(f);
    const mesh = MD.transformBy({ positions: md.positions, indices: md.indices, groups: md.groups || undefined }, M);
    st.meshBodies.set(id, { id, kind: "mesh", mesh, from: f.id });
    return { affected: [id], triangles: MD.triCount(mesh) };
  },

  cplane(st, f, P) {
    let plane;
    const ext = CPLANE_MODES.get(f.mode); // extra plane modes registered by modules (registerCPlaneMode)
    if (ext) plane = ext(st, f, P);
    else if (f.mode === "angle") {
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

  // Split Body: bodies divided by a plane / (extended) face / body; extra pieces become new bodies
  split(st, f) {
    const ids = (f.bodies || []).filter((id) => st.bodies.has(id));
    if (!ids.length) throw new Error("Select Body to split");
    const tool = splitTool(st, f, ids);
    const affected = [];
    let k = 0;
    try {
      for (const id of ids) {
        if ((f.tools || []).includes(id)) continue;
        const b = st.bodies.get(id);
        let parts = K.splitShape(b.shape, tool.shapes);
        if (parts.length < 2) { K.del(parts); continue; }
        if (tool.n) {
          const key = (s) => { const bb = K.bboxOf(s); return bb ? V.dot(V.mul(V.add(bb.min, bb.max), 0.5), tool.n) : 0; };
          parts = parts.map((s) => ({ s, k: key(s) })).sort((a, c) => a.k - c.k).map((x) => x.s);
        } else {
          parts = parts.map((s) => ({ s, k: K.volumeOf(s) })).sort((a, c) => c.k - a.k).map((x) => x.s);
        }
        st.bodies.set(id, { id, shape: parts[0], from: f.id });
        affected.push(id);
        for (const s of parts.slice(1)) {
          const nid = (f.newBodies || [])[k] || `${f.id}_${k + 1}`;
          k++;
          st.bodies.set(nid, { id: nid, shape: s, from: f.id });
          affected.push(nid);
        }
      }
    } finally { K.del(tool.owned); }
    if (!affected.length) throw new Error("No intersection between target(s) and split tool.");
    return { affected };
  },

  coil(st, f, P, doc) {
    const pl = resolvePlane(f.plane, st) || K.ORIGIN_PLANES.XY;
    const [u, v] = f.center || [0, 0];
    const num = (key) => (f[key] !== undefined && f[key] !== null && f[key] !== "" ? fval(P, f, key) : NaN);
    const D = num("diameter"), s = num("sectionSize");
    const ty = f.coilType || "revHeight";
    let turns, pitch;
    if (ty === "revHeight") { turns = num("revolutions"); pitch = num("height") / turns; }
    else if (ty === "heightPitch") { pitch = num("pitch"); turns = num("height") / pitch; }
    else { turns = num("revolutions"); pitch = num("pitch"); }
    if (!(D > 0)) throw new Error("The coil radius is too small!");
    const tool = K.coilSolid({
      o: K.toWorld(pl, u, v), n: pl.n, x: pl.x, D, s, section: f.section || "circular", position: f.sectionPosition || "inside",
      pitch, turns, taper: ty === "spiral" ? 0 : num("angle") || 0, left: f.rotation === "ccw", spiral: ty === "spiral",
    });
    st._tool = tool;
    return { affected: applyOp(st, f, tool, doc) };
  },

  pipe(st, f, P, doc) {
    const { segs, up, owned } = pipePath(st, f);
    try {
      const frac = f.distance !== undefined && f.distance !== "" ? fval(P, f, "distance") : 1;
      if (!(frac > 1e-6) || frac > 1 + 1e-9) throw new Error("Distance must be between 0 and 1");
      const size = fval(P, f, "sectionSize");
      const t = f.hollow ? fval(P, f, "thickness") : 0;
      if (f.hollow && !(t > 0)) throw new Error("Section thickness must be positive");
      const path = trimPath(segs, frac).map((g) => (g.kind === "edge" ? { kind: "edge", edge: g.edge, s: segStart(g), t0: g.t0 } : g));
      const tool = K.pipeSolid(path, { section: f.section || "circular", size, thickness: t, up });
      st._tool = tool;
      return { affected: applyOp(st, f, tool, doc) };
    } finally { K.del(owned); }
  },

  scale(st, f, P) {
    const ids = (f.bodies || []).filter((id) => st.bodies.has(id));
    if (!ids.length) throw new Error("Select bodies to scale");
    const c = scaleCenter(st, f.point);
    let s3;
    if (f.scaleType === "nonUniform") s3 = ["sx", "sy", "sz"].map((key) => fval(P, f, key));
    else { const k = fval(P, f, "factor"); s3 = [k, k, k]; }
    if (!s3.every((x) => x > 1e-9)) throw new Error("The scale factor must be positive");
    const uniform = Math.abs(s3[0] - s3[1]) < 1e-12 && Math.abs(s3[0] - s3[2]) < 1e-12;
    for (const id of ids) {
      const b = st.bodies.get(id);
      const s = uniform ? K.scaledUniform(b.shape, s3[0], c) : K.scaledNonUniform(b.shape, s3, c);
      st.bodies.set(id, { id, shape: s, from: f.id });
    }
    return { affected: ids };
  },

  // Thread: cosmetic (geometry unchanged; the result lists the helices for display) or modeled
  thread(st, f, P) {
    const threads = [];
    const affected = [];
    const pitch = Number(f.pitch);
    if (!(pitch > 0)) throw new Error("Select a thread size");
    for (const fr of f.faces || []) {
      const b = st.bodies.get(fr.body);
      if (!b) throw new Error("missing faces");
      const idx = locateFace(b.shape, fr);
      const ci = idx >= 0 ? K.cylinderFaceInfo(b.shape, idx) : null;
      if (!ci) throw new Error("Select a cylindrical face");
      let z0 = 0, z1 = ci.len;
      if (f.fullLength === false) {
        const L = fval(P, f, "length"), off = f.offset !== undefined && f.offset !== "" ? fval(P, f, "offset") : 0;
        // measured from the high end of the cylinder (Fusion's default thread location)
        z1 = Math.min(ci.len, ci.len - off);
        z0 = Math.max(0, z1 - L);
        if (!(z1 - z0 > 1e-6)) throw new Error("The thread length must be positive");
      }
      const major = Number(f.major), minor = Number(f.minor);
      const depth = major > minor && minor > 0 ? (major - minor) / 2 : 0.6134 * pitch;
      const t = { o: ci.o, a: ci.a, r: ci.r, z0, z1, pitch, depth, internal: ci.internal, left: f.rightHanded === false };
      if (f.modeled) {
        const s = K.threadedShape(st.bodies.get(fr.body).shape, t);
        st.bodies.set(fr.body, { id: fr.body, shape: s, from: f.id });
      }
      threads.push({ body: fr.body, ...t });
      if (!affected.includes(fr.body)) affected.push(fr.body);
    }
    if (!threads.length) throw new Error("Select faces to apply Thread");
    return { affected, threads, modeled: !!f.modeled };
  },
};

// ---------- feature-type registry ----------
// Feature modules add timeline feature types without editing this file:
//   registerFeature("rib", {
//     label: "Rib",                      // timeline / browser / undo label ("Create Rib")
//     stem: "Rib",                       // auto-naming stem: Rib1, Rib2 ... (default: label)
//     fields: { thickness: "length", depth: "length" },   // expression-valued fields -> model parameters d1, d2 ...
//     apply(st, f, P, doc) { ... },      // evaluator: same contract as the built-in APPLY entries (see below)
//     makesBodies: (f) => f.operation === "new",   // true / count / fn: core gives f.newBody (true) or f.newBodies (n)
//     deps: (f) => ({ sketches: [f.profile.sketch], bodies: [], features: [], cplanes: [], geo: [] }),
//     touches: (f) => [bodyIds the feature modifies],   // optional, for timeline dependency checks
//     editor: (app, featureId) => openRibDialog(app, featureId),   // Edit Feature (double-click in the timeline)
//     icon: "FusionRibCommand",          // command id whose icon the timeline / browser show
//     browser: { folder: "construction" },  // optional: list the feature itself in a browser folder
//   });
// apply(st, f, P, doc): st = a fresh copy of the state (replace map entries, never mutate shapes in place);
// P = ParamTable (use fval(P, f, key)); return undefined or {affected?: bodyIds, warning?, ...} (copied into
// app.result.results[f.id]); throw an Error with a user-facing message to fail the feature. Set st._tool to a
// tool shape to have it shown as the result's `tool` (live preview of cuts).
const BUILTIN_TYPES = new Set(Object.keys(APPLY));
const REGISTRY = new Map(); // type -> def
const REG_LISTENERS = new Set();
const BUILTIN_BODY_MAKERS = new Set(["extrude", "revolve", "loft", "sweep", "box", "cylinder", "sphere", "torus", "coil", "pipe", "mesh"]);

/**
 * Extra construction plane modes (cplane features with f.mode = mode): fn(st, f, P) -> plane {o, x, n}
 * (throw for a failed feature). Used by the solidx module (tangent, two edges, three points, along path, ...).
 */
const CPLANE_MODES = new Map();
export function registerCPlaneMode(mode, fn) {
  if (typeof fn !== "function") throw new Error("registerCPlaneMode needs a function");
  CPLANE_MODES.set(String(mode), fn);
}

export function registerFeature(type, def) {
  if (!type || typeof type !== "string") throw new Error("registerFeature: type must be a string");
  if (!def || typeof def.apply !== "function") throw new Error(`registerFeature(${type}): def.apply(st, f, P, doc) is required`);
  if (BUILTIN_TYPES.has(type) && !def.replace) throw new Error(`registerFeature(${type}): '${type}' is a built-in feature type (pass replace:true to override it)`);
  const d = { ...def, type, label: def.label || type, stem: def.stem || def.label || type, fields: { ...(def.fields || {}) } };
  REGISTRY.set(type, d);
  FIELDS[type] = d.fields;
  TYPE_LABEL[type] = d.label;
  NAME_STEM[type] = d.stem;
  APPLY[type] = d.apply;
  for (const fn of REG_LISTENERS) { try { fn(type, d); } catch (e) { console.error(e); } }
  return d;
}
/** Registered definition of a feature type; built-in types get {type, label, stem, fields, builtin:true}. */
export function featureDef(type) {
  if (REGISTRY.has(type)) return REGISTRY.get(type);
  if (BUILTIN_TYPES.has(type)) return { type, label: TYPE_LABEL[type] || type, stem: NAME_STEM[type] || type, fields: FIELDS[type] || {}, builtin: true, apply: APPLY[type] };
  return null;
}
export const featureTypes = () => [...new Set([...BUILTIN_TYPES, ...REGISTRY.keys()])];
export const registeredFeatures = () => [...REGISTRY.values()];
export const isFeatureType = (type) => BUILTIN_TYPES.has(type) || REGISTRY.has(type);
/** Called with (type, def) for every later registration; returns an unsubscribe function. */
export function onFeatureRegistered(fn) { REG_LISTENERS.add(fn); return () => REG_LISTENERS.delete(fn); }

/**
 * Result body ids of a new / edited feature: built-in body makers (new/join), registered types with
 * makesBodies (true -> f.newBody, a number n -> f.newBodies of length n). Mirror / Move-copy are done by core.
 */
export function assignBodies(doc, f) {
  const op = f.operation || "new";
  const def = REGISTRY.get(f.type);
  if (def && def.makesBodies) {
    let n = def.makesBodies;
    if (typeof n === "function") { try { n = n(f); } catch { n = false; } }
    if (n === true) { if (!f.newBody) f.newBody = nextBody(doc); }
    else if (typeof n === "number" && n > 0) {
      const cur = Array.isArray(f.newBodies) ? f.newBodies : [];
      if (cur.length < n) f.newBodies = Array.from({ length: n }, (_, i) => cur[i] || nextBody(doc));
    }
    return f;
  }
  if (BUILTIN_BODY_MAKERS.has(f.type) && ["new", "join", "newComponent"].includes(op) && !f.newBody) f.newBody = nextBody(doc);
  return f;
}

/** Named evaluator helpers for feature modules (also exported individually). */
export const helpers = {
  fval, cloneState, emptyState, locateEdge, locateFace, locateFaces, resolveFace, resolvePlane, followFacePlane,
  resolveRegion, pointInRegion, profileGroups, applyOp, axisFromRef, bodiesBBoxCenter, modelSize, touches,
  fuseTemp, edgeFeature, quietFinder, rotatePoint, rotateTo, circumcenter, holeOnFace, scaleCenter, splitTool,
  pipePath, chainPath, trimPath, orderEdges, patternFeatures, friendly, shapeKind, bodyKind, isSolidBody,
  isBrepBody, allBodyIds, bodyBBox, storeMeshData, meshDataOf, stageMeshData, unstageMeshData, meshInsertMatrix, edgesForRefs, groupByBody,
  occSubtree, bodyOwner, occBodies, occBodiesDeep, moveOccurrence, transformShape, transformMesh, transformPlane, invRigid, occTransform, isInstanceId, instanceBase,
};

/** Refs grouped by body: Map bodyId -> [ref]. */
export function groupByBody(refs) {
  const m = new Map();
  for (const r of refs || []) { if (!r || !r.body) continue; if (!m.has(r.body)) m.set(r.body, []); m.get(r.body).push(r); }
  return m;
}
/**
 * Edge objects of `shape` for edge refs (signature / nearest point; refs are refreshed like Fillet's), optionally
 * extended along tangent chains. The caller deletes the returned edges (K.del). Throws when none resolve.
 */
export function edgesForRefs(shape, refs, { tangentChain = false } = {}) {
  const idx = [];
  for (const er of refs || []) { const i = locateEdge(shape, er); if (i >= 0 && !idx.includes(i)) idx.push(i); }
  if (!idx.length) throw new Error("Selected edges are missing");
  let edges = K.edgesAt(shape, idx);
  if (tangentChain) edges = K.tangentChain(shape, edges);
  return edges;
}

/** Splitting tool shapes of a split feature: {shapes, owned (to delete), n (plane normal or null)}. */
export function splitTool(st, f, ids) {
  if (f.tools && f.tools.length) {
    const shapes = f.tools.map((id) => st.bodies.get(id)).filter(Boolean).map((b) => b.shape);
    if (!shapes.length) throw new Error("missing split tool");
    return { shapes, owned: [], n: null };
  }
  const tr = f.tool;
  if (!tr) throw new Error("Select the splitting Tool(s)");
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const id of ids) {
    const bb = K.bboxOf(st.bodies.get(id).shape);
    if (!bb) continue;
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); }
  }
  const c = Number.isFinite(mn[0]) ? V.mul(V.add(mn, mx), 0.5) : [0, 0, 0];
  const half = (Number.isFinite(mn[0]) ? V.len(V.sub(mx, mn)) : 100) * 2 + 10;
  const square = (pl) => { const face = K.planeSquareFace(pl, c, half); return { shapes: [face], owned: [face], n: V.norm(pl.n) }; };
  if (tr.kind === "face") {
    const b = st.bodies.get(tr.body);
    if (!b) throw new Error("missing split tool");
    const idx = locateFace(b.shape, tr);
    const fi = idx >= 0 ? K.topoOf(b.shape).faces[idx] : null;
    if (!fi) throw new Error("missing split tool");
    if (fi.type === "PLANE" && f.extend !== false) return square({ o: Array.isArray(tr.p) ? tr.p : fi.c, n: fi.n });
    const [face] = K.facesAt(b.shape, [idx]);
    return { shapes: [face], owned: [face], n: fi.type === "PLANE" ? fi.n : null };
  }
  const pl = resolvePlane(tr, st);
  if (!pl) throw new Error("missing split tool");
  return square(pl);
}

/** Centre of a scale feature: origin, a sketch point or a stored point (vertex). */
export function scaleCenter(st, pt) {
  if (!pt || pt.kind === "origin") return [0, 0, 0];
  if (pt.kind === "sketchPoint") {
    const s = st.sketches.get(pt.sketch);
    const q = s && s.sk.points[pt.point];
    if (!q) throw new Error("The scale point is missing");
    return K.toWorld(s.plane, q.x, q.y);
  }
  if (pt.kind === "cpoint") {
    // construction point feature (solidx module): st.points id -> {p}
    const c = st.points && st.points.get(pt.id);
    if (!c) throw new Error("The scale point is missing");
    return c.p;
  }
  if (Array.isArray(pt.p)) return pt.p;
  return [0, 0, 0];
}

/**
 * Path of a pipe as oriented segments (head to tail): sketch lines / arcs / circles of f.path and
 * body edges of f.edges. {segs, up (sketch plane normal), owned (edge wrappers to delete)}.
 */
export function pipePath(st, f) {
  const raw = [];
  const owned = [];
  let up = null;
  if (f.path && f.path.sketch) {
    const ps = st.sketches.get(f.path.sketch);
    if (!ps) throw new Error("The path for pipe cannot be found!");
    up = ps.plane.n;
    const pl = ps.plane, pts = ps.sk.points;
    const W = (id) => K.toWorld(pl, pts[id].x, pts[id].y);
    for (const cid of f.path.curves || []) {
      const cv = ps.sk.curves[cid];
      if (!cv) continue;
      if (cv.type === "line") raw.push({ kind: "line", a: W(cv.p1), b: W(cv.p2) });
      else if (cv.type === "arc") {
        const c = pts[cv.c], a = pts[cv.p1], b = pts[cv.p2];
        const a0 = Math.atan2(a.y - c.y, a.x - c.x);
        let a1 = Math.atan2(b.y - c.y, b.x - c.x);
        while (a1 <= a0 + 1e-12) a1 += 2 * Math.PI;
        raw.push({ kind: "arc", c: W(cv.c), ax: [...pl.n], r: Math.hypot(a.x - c.x, a.y - c.y), s: W(cv.p1), ang: a1 - a0 });
      } else if (cv.type === "circle") {
        const c = pts[cv.c];
        raw.push({ kind: "arc", c: W(cv.c), ax: [...pl.n], r: cv.r, s: K.toWorld(pl, c.x + cv.r, c.y), ang: 2 * Math.PI });
      }
    }
  }
  for (const er of f.edges || []) {
    const b = st.bodies.get(er.body);
    if (!b) throw new Error("missing paths");
    const idx = locateEdge(b.shape, er);
    const ti = idx >= 0 ? K.topoOf(b.shape).edges[idx] : null;
    if (!ti) throw new Error("missing paths");
    if (ti.type === "LINE") raw.push({ kind: "line", a: ti.s, b: ti.t });
    else if (ti.type === "CIRCLE" && ti.r > 0) raw.push({ kind: "arc", c: ti.c, ax: ti.a, r: ti.r, s: ti.s, ang: ti.len / ti.r });
    else {
      const [e] = K.edgesAt(b.shape, [idx]);
      owned.push(e);
      raw.push({ kind: "edge", edge: e, s: ti.s, e: ti.t, t0: ti.ts, t1: ti.tt, len: ti.len });
    }
  }
  if (!raw.length) throw new Error("The path for pipe cannot be found!");
  return { segs: chainPath(raw), up, owned };
}
const segStart = (g) => (g.kind === "line" ? g.a : g.kind === "edge" && g.rev ? g.e : g.s);
const segEnd = (g) => (g.kind === "line" ? g.b : g.kind === "arc" ? K.arcPoint(g, g.ang) : g.rev ? g.s : g.e);
const segLen = (g) => (g.kind === "line" ? V.len(V.sub(g.b, g.a)) : g.kind === "arc" ? g.r * Math.abs(g.ang) : g.len || 0);
function segReverse(g) {
  if (g.kind === "line") return { ...g, a: g.b, b: g.a };
  if (g.kind === "arc") return { ...g, s: K.arcPoint(g, g.ang), ax: V.mul(g.ax, -1) };
  return { ...g, rev: !g.rev, t0: V.mul(g.t1 || g.t0, -1), t1: V.mul(g.t0, -1) };
}
/** Order path segments head to tail (starting at a free end of an open chain). */
export function chainPath(raw) {
  const close = (p, q) => V.len(V.sub(p, q)) < 1e-4;
  const left = raw.slice();
  const touches = (p, g0) => left.some((g) => g !== g0 && (close(p, segStart(g)) || close(p, segEnd(g))));
  let i0 = left.findIndex((g) => !touches(segStart(g), g) || !touches(segEnd(g), g));
  if (i0 < 0) i0 = 0;
  let first = left[i0];
  if (touches(segStart(first), first) && !touches(segEnd(first), first)) first = segReverse(first);
  left.splice(i0, 1);
  const out = [first];
  while (left.length) {
    const end = segEnd(out[out.length - 1]);
    let i = left.findIndex((g) => close(segStart(g), end));
    if (i >= 0) { out.push(left.splice(i, 1)[0]); continue; }
    i = left.findIndex((g) => close(segEnd(g), end));
    if (i >= 0) { out.push(segReverse(left.splice(i, 1)[0])); continue; }
    throw new Error("The path must be a connected chain of curves");
  }
  return out;
}
/** First `frac` (0..1] of a path's length (lines and arcs are cut exactly, other edges kept whole). */
export function trimPath(segs, frac) {
  if (frac >= 1 - 1e-9) return segs;
  const total = segs.reduce((s, g) => s + segLen(g), 0);
  let want = total * frac;
  const out = [];
  for (const g of segs) {
    const L = segLen(g);
    if (want >= L - 1e-9) { out.push(g); want -= L; if (want <= 1e-9) break; continue; }
    const k = want / L;
    if (g.kind === "line") out.push({ ...g, b: V.add(g.a, V.mul(V.sub(g.b, g.a), k)) });
    else if (g.kind === "arc") out.push({ ...g, ang: g.ang * k });
    else out.push(g);
    break;
  }
  return out;
}

/** Fuse freshly made tool shapes into one; the inputs and intermediate results are released. */
export function fuseTemp(parts) {
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
export function holeOnFace(st, f) {
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

export function orderEdges(edges) {
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
export function quietFinder(fn) {
  const ce = console.error;
  console.error = (...a) => { if (typeof a[0] === "string" && a[0].startsWith("failed to compute a normal")) return; ce.apply(console, a); };
  try { return fn(); } finally { console.error = ce; }
}

export function edgeFeature(st, f, P, kind) {
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
    if (K.isEmptyShape(s)) throw new Error(`${kind === "fillet" ? "Fillet" : "Chamfer"} failed: try a smaller value`);
    st.bodies.set(bid, { id: bid, shape: s, from: f.id });
  }
}

// ---------- feature patterns (rpattern / cpattern with patternType 'features') ----------
/** p rotated by angleDeg about the axis through o along d (right-handed, like K.rotated). */
export function rotatePoint(p, angleDeg, o, d) {
  const k = V.norm(d), v = V.sub(p, o), t = (angleDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return V.add(o, V.add(V.add(V.mul(v, c), V.mul(V.cross(k, v), s)), V.mul(k, V.dot(k, v) * (1 - c))));
}

/**
 * Re-create f.features at every instance transform xs [{shape(s) -> moved copy, point(p)}].
 * Tool features (hole, extrude, revolve, primitives ...) re-evaluate their tool on a scratch copy of
 * the state and cut / join a moved copy of it; fillet / chamfer re-apply on the moved edge points.
 * Instances that reach no geometry are skipped with a warning (an error when none computes).
 */
export function patternFeatures(st, f, P, doc, xs) {
  const ids = f.features || [];
  if (!ids.length) throw new Error("Select features to pattern");
  let failed = 0, total = 0, k = 0;
  const affected = new Set();
  for (const fid of ids) {
    const src0 = (doc.features || []).find((x) => x.id === fid);
    if (!src0 || src0.id === f.id) throw new Error("A patterned feature is missing");
    if (src0.suppressed || src0.type === "rpattern" || src0.type === "cpattern" || !APPLY[src0.type]) throw new Error(`${src0.name} cannot be patterned`);
    // evaluation refreshes geometric refs in place: work on a copy so the document stays untouched
    const src = JSON.parse(JSON.stringify(src0));
    if (src.type === "fillet" || src.type === "chamfer") {
      for (const x of xs) {
        total++;
        const edges = [];
        for (const e of src.edges || []) {
          const b = st.bodies.get(e.body), p = Array.isArray(e.p) ? x.point(e.p) : null;
          const ne = b && p ? K.nearestEdgeIndex(b.shape, p) : null;
          if (ne && ne.dist < 1e-2) edges.push({ body: e.body, p });
        }
        try {
          if (!edges.length) throw new Error("no edge");
          edgeFeature(st, { ...src, id: f.id, edges }, P, src.type);
          for (const e of edges) affected.add(e.body);
        } catch { failed++; }
      }
      continue;
    }
    const scratch = cloneState(st);
    try { APPLY[src.type](scratch, src, P, doc); } catch { /* the tool may have been made before the failure */ }
    const tool = scratch._tool;
    for (const [id, b] of scratch.bodies) if (b.shape !== tool && st.bodies.get(id)?.shape !== b.shape) K.del(b.shape);
    if (!tool) throw new Error(`${src0.name} cannot be patterned`);
    const op = src.type === "hole" ? "cut" : src.operation || "new";
    for (const x of xs) {
      total++;
      const t = x.shape(tool);
      try {
        for (const id of applyOp(st, { ...src, id: f.id, operation: op, newBody: null }, t, doc, (f.newBodies || [])[k] || `${f.id}_${k + 1}`)) affected.add(id);
      } catch { failed++; }
      k++;
      let kept = false;
      for (const b of st.bodies.values()) if (b.shape === t) { kept = true; break; }
      if (!kept) K.del(t);
    }
    K.del(tool);
  }
  if (total && failed >= total) throw new Error("No pattern instance could be computed");
  return { affected: [...affected], ...(failed ? { warning: `${failed} pattern instance${failed > 1 ? "s" : ""} could not be computed` } : {}) };
}

// ---------- evaluator with incremental cache ----------
// ---------- components and occurrences ----------
// Fusion's component model. The document keeps the component definitions and occurrence metadata:
//   doc.components  {cid: {id, name, partNumber?, description?, material?, appearance?}}
//   doc.occurrences {oid: {id, component: cid, n (the ":n" number), visible?, grounded?, selectable?}}
//   doc.activeOcc   active occurrence id (absent = root);  doc.positions {oid: M} uncaptured positions (world)
//   feature.occ     occurrence the feature was created in (absent = root): features belong to that component
// Occurrences come into being through timeline features ('component', or the operation 'newComponent' of a body
// feature, which carries f.newComp / f.newOcc). The evaluation state tracks them (st.occ, st.bodyOcc; see emptyState).
// Transforms M are rigid 3x4 row-major matrices (meshdata.js format), T = world transform of the occurrence frame.
// Bodies stay in world space: moving an occurrence (snapshot feature, uncaptured position, a module's feature such
// as a joint calling moveOccurrence) transforms the bodies, sketches and construction planes it owns, so later
// features see the moved geometry. A pasted occurrence (inst = primary occurrence of the same component) shows the
// primary's bodies through derived instance bodies "<bodyId>@<oid>" (refreshed after every feature).
export const ROOT = "root";
export function isInstanceId(id) { return typeof id === "string" && id.includes("@"); }
export function instanceBase(id) { return isInstanceId(id) ? id.slice(0, id.indexOf("@")) : id; }
const validM = (M) => Array.isArray(M) && M.length === 12 && M.every((v) => Number.isFinite(Number(v)));
const isIdentityM = (M, tol = 1e-9) => M.every((v, i) => Math.abs(v - MD.IDENTITY[i]) <= tol);
/** Inverse of a rigid 3x4 transform (R^T, -R^T t). */
export function invRigid(M) {
  const r = [M[0], M[4], M[8], M[1], M[5], M[9], M[2], M[6], M[10]];
  const t = [M[3], M[7], M[11]];
  const row = (i) => -(r[3 * i] * t[0] + r[3 * i + 1] * t[1] + r[3 * i + 2] * t[2]);
  return [r[0], r[1], r[2], row(0), r[3], r[4], r[5], row(1), r[6], r[7], r[8], row(2)];
}
/** Owner occurrence of a body in a state (ROOT when it belongs to the root component). */
export function bodyOwner(st, id) { return (st && st.bodyOcc && st.bodyOcc.get(id)) || ROOT; }
/** World transform of an occurrence in a state (identity for the root / unknown ids). */
export function occTransform(st, oid) { const o = st && st.occ && st.occ.get(oid); return o ? o.T : MD.IDENTITY; }
/** Set of the occurrence and every occurrence below it (ROOT = all). */
export function occSubtree(st, oid) {
  const out = new Set([oid]);
  if (!st || !st.occ) return out;
  if (oid === ROOT) { for (const k of st.occ.keys()) out.add(k); return out; }
  let grew = true;
  while (grew) { grew = false; for (const o of st.occ.values()) if (!out.has(o.id) && out.has(o.parent)) { out.add(o.id); grew = true; } }
  return out;
}
/** Bodies owned directly by an occurrence (ROOT: bodies of the root component). */
export function occBodies(st, oid) {
  return allBodyIds(st).filter((id) => bodyOwner(st, id) === oid);
}
/** Bodies of an occurrence and its sub-occurrences. */
export function occBodiesDeep(st, oid) {
  const set = occSubtree(st, oid);
  return allBodyIds(st).filter((id) => set.has(bodyOwner(st, id)));
}
const SHAPE_X = new WeakMap(); // shape -> Map(matrix key -> transformed shape)
const MESH_X = new WeakMap();
const mKey = (M) => M.map((v) => Number(v).toFixed(9)).join(",");
// at most X_KEEP matrices per input (a drag makes one per pointer move): the oldest entry is dropped from the
// cache, not deleted, so a state that still holds it keeps a valid shape (replicad frees it on GC)
const X_KEEP = 6;
const xGet = (m, k) => { const v = m.get(k); m.delete(k); m.set(k, v); return v; };
const xSet = (m, k, v) => { m.set(k, v); while (m.size > X_KEEP) m.delete(m.keys().next().value); };
/** Rigidly transformed copy of an OCCT shape (cached per input shape and matrix; the input is kept). */
export function transformShape(shape, M) {
  if (!shape || isIdentityM(M)) return shape;
  let m = SHAPE_X.get(shape);
  if (!m) { m = new Map(); SHAPE_X.set(shape, m); }
  const k = mKey(M);
  if (m.has(k)) return xGet(m, k);
  // rotation part as axis + angle (OCCT gp_Trsf rotation), then the translation
  const tr = M[0] + M[5] + M[10];
  const ang = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
  let s = shape;
  if (ang > 1e-12) {
    let ax;
    if (Math.PI - ang > 1e-6) ax = [M[9] - M[6], M[2] - M[8], M[4] - M[1]];
    else {
      const d = [M[0], M[5], M[10]].map((v) => Math.sqrt(Math.max(0, (v + 1) / 2)));
      const i = d.indexOf(Math.max(...d));
      ax = [0, 0, 0];
      ax[i] = d[i];
      const off = [[0, M[1], M[2]], [M[4], 0, M[6]], [M[8], M[9], 0]];
      for (let j = 0; j < 3; j++) if (j !== i) ax[j] = off[i][j] / (2 * d[i]);
    }
    s = K.rotated(shape, (ang * 180) / Math.PI, [0, 0, 0], ax);
  }
  const t = [M[3], M[7], M[11]];
  if (Math.hypot(...t) > 1e-12) { const n = K.translated(s, t); if (s !== shape) K.del(s); s = n; }
  xSet(m, k, s);
  return s;
}
/** Transformed copy of a mesh body mesh (cached). */
export function transformMesh(mesh, M) {
  if (!mesh || isIdentityM(M)) return mesh;
  let m = MESH_X.get(mesh);
  if (!m) { m = new Map(); MESH_X.set(mesh, m); }
  const k = mKey(M);
  if (!m.has(k)) {
    const out = MD.transformBy(mesh, M);
    if (mesh.normals) { // rotate normals (transformBy drops them)
      const n = new Float32Array(mesh.normals.length);
      for (let i = 0; i < n.length; i += 3) { const a = mesh.normals; n[i] = M[0] * a[i] + M[1] * a[i + 1] + M[2] * a[i + 2]; n[i + 1] = M[4] * a[i] + M[5] * a[i + 1] + M[6] * a[i + 2]; n[i + 2] = M[8] * a[i] + M[9] * a[i + 1] + M[10] * a[i + 2]; }
      out.normals = n;
    }
    xSet(m, k, out);
  }
  return xGet(m, k);
}
const rotV = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[4] * v[0] + M[5] * v[1] + M[6] * v[2], M[8] * v[0] + M[9] * v[1] + M[10] * v[2]];
/** Plane {o, x, n} moved by M. */
export function transformPlane(pl, M) {
  if (!pl || !pl.o) return pl;
  return { ...pl, o: MD.apply(M, pl.o), x: pl.x ? rotV(M, pl.x) : pl.x, n: pl.n ? rotV(M, pl.n) : pl.n };
}
/**
 * Put an occurrence at world transform M in the state: its sub-occurrences follow, and the bodies, sketches and
 * construction planes they own are transformed (cached, so re-evaluations reuse the shapes). Returns true if moved.
 */
export function moveOccurrence(st, doc, oid, M) {
  const o = st.occ && st.occ.get(oid);
  if (!o || !validM(M)) return false;
  const D = MD.mul(M.map(Number), invRigid(o.T));
  if (isIdentityM(D)) return false;
  const set = occSubtree(st, oid);
  for (const id of set) { const e = st.occ.get(id); if (e) st.occ.set(id, { ...e, T: MD.mul(D, e.T) }); }
  for (const [bid, owner] of st.bodyOcc) {
    if (!set.has(owner) || isInstanceId(bid)) continue;
    const b = st.bodies.get(bid);
    if (b) { st.bodies.set(bid, { ...b, shape: transformShape(b.shape, D) }); continue; }
    const mb = st.meshBodies && st.meshBodies.get(bid);
    if (mb && mb.mesh) st.meshBodies.set(bid, { ...mb, mesh: transformMesh(mb.mesh, D), bbox: undefined });
  }
  for (const f of (doc && doc.features) || []) {
    if (!f.occ || !set.has(f.occ)) continue;
    const s = st.sketches.get(f.id);
    if (s) st.sketches.set(f.id, { ...s, plane: transformPlane(s.plane, D) });
    const p = st.planes.get(f.id);
    if (p) st.planes.set(f.id, { ...p, plane: transformPlane(p.plane, D) });
  }
  return true;
}
function primaryOcc(st, comp) {
  for (const o of st.occ.values()) if (o.component === comp && !o.inst) return o.id;
  return null;
}
function applyComponent(st, f, doc) {
  if (!f.newOcc || !f.comp) throw new Error("The component data of this feature is missing");
  const parent = f.parent && f.parent !== ROOT && st.occ.has(f.parent) ? f.parent : ROOT;
  const mode = f.mode || "empty";
  if (mode === "paste" || mode === "copy") {
    const src = st.occ.get(f.source);
    if (!src) throw new Error("The copied component is not in the design");
    const T = validM(f.T) ? f.T.map(Number) : src.T;
    if (mode === "paste") {
      st.occ.set(f.newOcc, { id: f.newOcc, component: src.component, parent, T, inst: src.inst || src.id });
      return {};
    }
    st.occ.set(f.newOcc, { id: f.newOcc, component: f.comp, parent, T });
    const D = MD.mul(T, invRigid(src.T));
    occBodies(st, f.source).filter((id) => !isInstanceId(id)).forEach((bid, i) => {
      const nid = (f.newBodies || [])[i] || `${f.id}_${i}`;
      const b = st.bodies.get(bid);
      if (b) st.bodies.set(nid, { ...b, id: nid, shape: transformShape(b.shape, D), from: f.id });
      else {
        const mb = st.meshBodies.get(bid);
        if (!mb) return;
        st.meshBodies.set(nid, { ...mb, id: nid, mesh: transformMesh(mb.mesh, D), bbox: undefined, from: f.id });
      }
      st.bodyOcc.set(nid, f.newOcc);
    });
    return {};
  }
  st.occ.set(f.newOcc, { id: f.newOcc, component: f.comp, parent, T: occTransform(st, parent) });
  if (mode === "bodies") {
    const missing = [];
    for (const b of f.bodies || []) { if (st.bodies.has(b) || (st.meshBodies && st.meshBodies.has(b))) st.bodyOcc.set(b, f.newOcc); else missing.push(b); }
    if (missing.length) return { warning: `${missing.length} of the bodies are no longer in the design` };
  }
  return {};
}
/** After a feature: its new bodies belong to the component it was created in (or to its new component). */
function claimBodies(prev, ns, f) {
  if (!ns.occ) return;
  let owner = f.occ && ns.occ.has(f.occ) ? f.occ : null;
  if (f.operation === "newComponent" && f.newOcc && f.newComp) {
    const parent = owner || ROOT;
    if (!ns.occ.has(f.newOcc)) ns.occ.set(f.newOcc, { id: f.newOcc, component: f.newComp, parent, T: occTransform(ns, parent) });
    owner = f.newOcc;
  }
  if (!owner) return;
  for (const id of ns.bodies.keys()) if (!prev.bodies.has(id) && !ns.bodyOcc.has(id)) ns.bodyOcc.set(id, owner);
  if (ns.meshBodies) for (const id of ns.meshBodies.keys()) if (!(prev.meshBodies && prev.meshBodies.has(id)) && !ns.bodyOcc.has(id)) ns.bodyOcc.set(id, owner);
}
/** Instance bodies of pasted occurrences ("<bodyId>@<oid>"), derived from the primary occurrence's bodies. */
function refreshInstances(st) {
  if (!st.occ) return;
  const insts = [...st.occ.values()].filter((o) => o.inst);
  const stale = new Set([...st.bodies.keys(), ...(st.meshBodies ? st.meshBodies.keys() : [])].filter(isInstanceId));
  for (const o of insts) {
    const prim = st.occ.get(o.inst);
    if (!prim) continue;
    const D = MD.mul(o.T, invRigid(prim.T));
    for (const bid of occBodies(st, prim.id)) {
      if (isInstanceId(bid)) continue;
      const id = `${bid}@${o.id}`;
      stale.delete(id);
      const b = st.bodies.get(bid);
      if (b) st.bodies.set(id, { ...b, id, shape: transformShape(b.shape, D), instance: bid });
      else { const mb = st.meshBodies.get(bid); if (mb) st.meshBodies.set(id, { ...mb, id, mesh: transformMesh(mb.mesh, D), bbox: undefined, instance: bid }); }
      st.bodyOcc.set(id, o.id);
    }
  }
  for (const id of stale) { st.bodies.delete(id); if (st.meshBodies) st.meshBodies.delete(id); st.bodyOcc.delete(id); }
}
/** Uncaptured positions (doc.positions) applied on top of the evaluated state (a copy; never cached). */
function applyPending(st, doc) {
  const pend = doc.positions && Object.entries(doc.positions).filter(([oid, M]) => st.occ.has(oid) && validM(M));
  if (!pend || !pend.length) return st;
  const ns = cloneState(st);
  for (const [oid, M] of pend) moveOccurrence(ns, doc, oid, M);
  refreshInstances(ns);
  ns.pending = pend.map(([oid]) => oid);
  return ns;
}

export class Evaluator {
  constructor() {
    this.cache = [];
  }
  invalidate() {
    this.cache = [];
  }
  run(doc, opts = {}) {
    const P = buildParams(doc);
    let st = emptyState();
    const results = {};
    const upto = opts.upto ?? doc.marker;
    let broken = false;
    const t0 = performance.now();
    for (let i = 0; i < doc.features.length; i++) {
      const f = doc.features[i];
      if (i >= upto) { results[f.id] = { rolled: true }; continue; }
      if (f.suppressed) {
        // A suppressed feature passes the state through. Record that in the cache so that
        // (un)suppressing it invalidates everything after it: otherwise later features would
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
        if (!APPLY[f.type]) throw new Error(`${TYPE_LABEL[f.type] || f.type} features are not available in this build`);
        const r = APPLY[f.type](ns, f, P, doc);
        claimBodies(st, ns, f);
        if (ns.occ.size && [...ns.occ.values()].some((o) => o.inst)) refreshInstances(ns);
        result = { ok: true, ...(r || {}) };
        // derived body flags (sheet metal) survive features that rebuild the entry without them
        for (const [id, b] of ns.bodies) {
          const old = st.bodies.get(id);
          if (old && old !== b && old.sheetMetal && b.sheetMetal === undefined) ns.bodies.set(id, { ...b, sheetMetal: old.sheetMetal });
        }
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
    // uncaptured component positions (Move of components before Capture Position) sit on top of the timeline
    if (doc.positions && upto >= doc.features.length) { try { st = applyPending(st, doc); } catch (e) { console.warn("component positions", e); } }
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

export function friendly(e) {
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
