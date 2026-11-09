// assembly: timeline features (joint, constraint, jointorigin, rigidgroup, motionlink), snap frames and the
// bridge between the evaluation state and the pure solver (solver.js).
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import * as X from "./math.js";
import * as S from "./solver.js";

const V = X.V;
export const ROOT = M.ROOT;
export const JOINT_TYPES = ["rigid", "revolute", "slider", "cylindrical", "pinslot", "planar", "ball"];
/** Relation-only constraint types (solver.js LOOP_ONLY): Angle, Tangent, Center. */
export const REL_TYPES = ["angle", "tangent", "center"];
export const occT = (st, o) => (o === ROOT || !o ? X.I : (st.occ.get(o) && st.occ.get(o).T) || X.I);
const has = (st, o) => o === ROOT || st.occ.has(o);
/** Owner occurrence of a body ("root" for the root component). */
export const ownerOf = (st, body) => (st.bodyOcc && st.bodyOcc.get(body)) || ROOT;
/** Path root .. o. */
export function pathOf(st, o) {
  const out = [];
  for (let n = o, i = 0; n && n !== ROOT && i < 64; i++) { out.unshift(n); const e = st.occ.get(n); n = e ? e.parent || ROOT : ROOT; }
  out.unshift(ROOT);
  return out;
}
export const isAncestor = (st, a, o) => a !== o && pathOf(st, o).includes(a);
/**
 * The two occurrences that a joint between geometry owned by o1 and o2 connects: the children of their lowest
 * common ancestor (Fusion moves whole top-level components, not the nested part that was picked).
 */
export function liftNodes(st, o1, o2) {
  if (o1 === o2) throw new Error("Select geometry of two different components");
  const p1 = pathOf(st, o1), p2 = pathOf(st, o2);
  let i = 0;
  while (i < p1.length && i < p2.length && p1[i] === p2[i]) i++;
  return [p1[i] || o1, p2[i] || o2];
}

// ---------- snap frames ----------
const nearest = (cands, p) => cands.reduce((b, c) => (!b || V.dist(c.o, p) < V.dist(b.o, p) ? c : b), null);
/**
 * Snap of a pick reference: {F: world frame (3x4), owner: occurrence that owns the geometry, kind}.
 * Faces snap to their centre or to the nearest edge midpoint, end point or circle centre; cylinders, cones and
 * circular edges to their axis; linear edges to start, middle or end; a vertex to itself.
 */
export function snapOf(st, r) {
  if (!r) throw new Error("Select a snap point");
  if (r.kind === "feature") {
    const jo = st.jorigins && st.jorigins.get(r.id);
    if (!jo) throw new Error("The joint origin is missing");
    return { F: X.mul(occT(st, jo.occ), jo.F), owner: jo.occ, kind: "origin" };
  }
  const owner = ownerOf(st, r.body), Tn = occT(st, owner);
  const b = st.bodies.get(r.body);
  const xh = X.axis(Tn, 0);
  if (!b) {
    if (st.meshBodies && st.meshBodies.has(r.body) && r.p) return { F: X.frame(r.p, r.n || X.axis(Tn, 2), xh), owner, kind: "point" };
    throw new Error("The snap geometry is missing");
  }
  if (r.kind === "vertex") return { F: X.frame(r.p, X.axis(Tn, 2), xh), owner, kind: "point" };
  const topo = K.topoOf(b.shape);
  if (r.kind === "face") {
    const idx = M.locateFace(b.shape, r);
    const fi = idx >= 0 ? topo.faces[idx] : null;
    if (!fi) throw new Error("The snap face is missing");
    const p = r.p || fi.c;
    if ((fi.type === "CYLINDRE" || fi.type === "CONE") && fi.a) {
      // the middle of the axis segment that the face covers, or its ends when the pick is near a rim
      const ts = topo.edges.filter((e) => e.faces.includes(idx) && e.type === "CIRCLE" && e.c).map((e) => V.dot(V.sub(e.c, fi.ao), fi.a));
      const at = (t) => ({ o: V.add(fi.ao, V.mul(fi.a, t)) });
      const cands = ts.length >= 2 ? [at((Math.min(...ts) + Math.max(...ts)) / 2), at(Math.min(...ts)), at(Math.max(...ts))] : [at(V.dot(V.sub(fi.c || p, fi.ao), fi.a))];
      const tp = at(V.dot(V.sub(p, fi.ao), fi.a)).o;
      return { F: X.frame(nearest(cands, tp).o, fi.a, xh), owner, kind: "axis", r: fi.r };
    }
    if (fi.type === "SPHERE" && fi.ao) return { F: X.frame(fi.ao, X.axis(Tn, 2), xh), owner, kind: "point", r: fi.r };
    const n = fi.type === "PLANE" && fi.n ? fi.n : r.n || fi.n || [0, 0, 1];
    if (fi.type !== "PLANE") return { F: X.frame(p, n, xh), owner, kind: "plane" };
    const cands = [{ o: fi.c }];
    for (const e of topo.edges) {
      if (!e.faces.includes(idx)) continue;
      if (e.type === "CIRCLE" && e.c) cands.push({ o: e.c });
      else cands.push({ o: e.m }, { o: e.s }, { o: e.t });
    }
    const c = nearest(cands, p);
    // keep the snap on the face plane
    const o = V.sub(c.o, V.mul(n, V.dot(V.sub(c.o, fi.c), n)));
    return { F: X.frame(o, n, xh), owner, kind: "plane" };
  }
  if (r.kind === "edge") {
    const idx = M.locateEdge(b.shape, r);
    const ei = idx >= 0 ? topo.edges[idx] : null;
    if (!ei) throw new Error("The snap edge is missing");
    if (ei.type === "CIRCLE" && ei.c) {
      // the normal of an adjacent planar face gives the outward direction
      const fn = (ei.fn || []).find((n) => n && Math.abs(V.dot(n, ei.a)) > 0.99);
      return { F: X.frame(ei.c, fn || ei.a, xh), owner, kind: "axis", r: ei.r };
    }
    const p = r.p || ei.m;
    const c = nearest([{ o: ei.m }, { o: ei.s }, { o: ei.t }], p);
    return { F: X.frame(c.o, ei.type === "LINE" ? ei.d : X.axis(Tn, 2), xh), owner, kind: ei.type === "LINE" ? "line" : "point" };
  }
  throw new Error("Select a face, an edge, a vertex or a joint origin");
}
/** Frames and occurrences of a joint between two snap references: {occ1, occ2, frame1, frame2, s1, s2}. */
export function jointFrames(st, r1, r2, opts = {}) {
  const s1 = snapOf(st, r1), s2 = snapOf(st, r2);
  const [n1, n2] = liftNodes(st, s1.owner, s2.owner);
  // as-built: one world frame (the first snap) for both sides, the components stay where they are
  const F2 = opts.asBuilt ? s1.F : s2.F;
  return { occ1: n1, occ2: n2, frame1: X.mul(X.inv(occT(st, n1)), s1.F), frame2: X.mul(X.inv(occT(st, n2)), F2), s1, s2 };
}

// ---------- state <-> solver ----------
function rigidSets(st, doc) {
  const out = [];
  for (const g of (st.rigid || new Map()).values()) out.push(g.rel ? Object.assign(g.occs.slice(), { rel: g.rel }) : g.occs);
  // Bounding Solid features with Rigid Group (createx): the new occurrence and the owners of the enclosed bodies
  for (const f of (doc && doc.features) || []) {
    if (f.type !== "boundingsolid" || !f.rigidGroup || f.suppressed || !f.newOcc || !st.occ.has(f.newOcc)) continue;
    const set = new Set([f.newOcc]);
    for (const b of f.bodies || []) { const o = st.bodyOcc && st.bodyOcc.get(b); if (o && o !== ROOT && st.occ.has(o)) set.add(o); }
    out.push([...set]);
  }
  // a member that sits inside another member already moves with it
  return out.map((g) => { const m = g.filter((o) => has(st, o) && !g.some((p) => p !== o && isAncestor(st, p, o))); if (g.rel) m.rel = g.rel; return m; }).filter((g) => g.length > 1);
}
export function buildModel(st, doc) {
  const T = new Map(), parent = new Map(), grounded = new Set();
  const occs = (doc && doc.occurrences) || {};
  for (const [oid, o] of st.occ) {
    T.set(oid, o.T || X.I);
    parent.set(oid, o.parent || ROOT);
    if (occs[oid] && occs[oid].grounded) grounded.add(oid);
  }
  return {
    T, parent, grounded,
    joints: [...(st.joints || new Map()).values()].filter((J) => has(st, J.a) && has(st, J.b)),
    welds: rigidSets(st, doc),
    links: [...(st.links || new Map()).values()],
  };
}
/** Solve the assembly of a state and move the occurrences that are off (kernel work: evaluation time only). */
export function resolve(st, doc) {
  const model = buildModel(st, doc);
  if (!model.joints.length) return null;
  const r = S.solve(model);
  const depth = (o) => pathOf(st, o).length;
  const moved = [];
  for (const oid of [...r.T.keys()].sort((a, b) => depth(a) - depth(b))) {
    if (!st.occ.has(oid) || X.same(occT(st, oid), r.T.get(oid), 1e-7)) continue;
    M.moveOccurrence(st, doc, oid, r.T.get(oid));
    moved.push(oid);
  }
  r.moved = moved;
  r.model = model;
  return r;
}
/** Model of the current design (after the timeline marker). */
export const liveModel = (app) => buildModel(app.result.state, app.doc);

const num = (P, f, k) => { try { const v = M.fval(P, f, k); return Number.isFinite(v) ? v : 0; } catch { return 0; } };
export function jointRecord(f, P) {
  const drive = {};
  for (const k of S.DOFS[f.jointType] || []) drive[k] = Number(f.drive && f.drive[k]) || 0;
  return {
    id: f.id, jointType: f.jointType, a: f.occ1, b: f.occ2, FA: f.frame1, FB: f.frame2,
    off: f.asBuilt || REL_TYPES.includes(f.jointType) ? null : { x: num(P, f, "offX"), y: num(P, f, "offY"), z: num(P, f, "offZ"), angle: num(P, f, "angle"), flip: !!f.flip },
    rotAxis: f.rotAxis || "z", slideAxis: f.slideAxis || (f.jointType === "pinslot" ? "x" : "z"), drive, limits: f.limits || null,
    kind: f.type, name: f.name,
    // relation-only constraints
    target: f.jointType === "angle" ? num(P, f, "angle") : 0, r: Number(f.radius) || 0, sphere: !!f.sphere, flip: !!f.flip,
    FB2: X.valid(f.frame3) ? f.frame3 : null, FA2: X.valid(f.frame4) ? f.frame4 : null,
  };
}
function applyJoint(st, f, P, doc) {
  if (!JOINT_TYPES.includes(f.jointType) && !(f.type === "constraint" && REL_TYPES.includes(f.jointType))) throw new Error("Unknown joint type");
  if (!f.occ1 || !f.occ2 || !has(st, f.occ1) || !has(st, f.occ2)) throw new Error("A component of the joint is missing");
  if (f.occ1 === f.occ2) throw new Error("Select geometry of two different components");
  if (!X.valid(f.frame1) || !X.valid(f.frame2)) throw new Error("Select two snap points");
  st.joints = new Map(st.joints || []);
  st.joints.set(f.id, jointRecord(f, P));
  const r = resolve(st, doc);
  const out = { affected: r ? r.moved.flatMap((o) => M.occBodiesDeep(st, o)) : [], dof: (S.DOFS[f.jointType] || []).length };
  if (r && r.moved.length) out.poses = Object.fromEntries(r.moved.map((o) => [o, r.T.get(o)]));
  const loop = r && r.loops.find((l) => l.J.id === f.id);
  if (loop && loop.norm > 1e-3) out.warning = "The joint conflicts with other joints or pinned components and could not be solved";
  else if (r && r.residual > 1e-3) out.warning = "The assembly could not be solved exactly";
  return out;
}
/** Drive values that bring a (pose Ta) as close as possible to where it is now, given b at Tb. */
export function nearestDrive(J, Ta, Tb) {
  const d = {};
  for (const k of S.DOFS[J.jointType] || []) d[k] = 0;
  const vars = Object.keys(d).map((k) => ({ rot: S.isRot(k), get: () => d[k], set: (v) => { d[k] = S.clamp(J, k, v); } }));
  const err = () => { const Q = X.mulAll(X.inv(Ta), Tb, S.jointX(J, d)), w = X.rotVec(Q); return [Q[3], Q[7], Q[11], w[0] * 20, w[1] * 20, w[2] * 20]; };
  S.dls(vars, err, { iters: 40, tol: 1e-7 });
  for (const k in d) d[k] = Math.round(d[k] * 1e6) / 1e6;
  return d;
}
export function originFrame(f, P) {
  let off = X.mul(X.trans([num(P, f, "offX"), num(P, f, "offY"), num(P, f, "offZ")]), X.rot([0, 0, 1], num(P, f, "angle")));
  if (f.flip) off = X.mul(off, X.rot([1, 0, 0], 180));
  return X.mul(f.frame1, off);
}
const refBodies = (...rs) => rs.filter((r) => r && r.body).map((r) => r.body);
const depsOf = (f, feats = []) => ({ sketches: [], bodies: refBodies(f.ref1, f.ref2, ...(f.refs || [])), features: feats.filter(Boolean), cplanes: [], geo: [f.ref1, f.ref2, ...(f.refs || [])].filter((r) => r && r.body) });

/** Register the feature types; extra[type] adds editor / browser / icon hooks (index.js). */
export function registerFeatures(extra = {}) {
  const reg = (type, def) => M.registerFeature(type, { ...def, ...(extra[type] || {}) });
  const FIELDS = { angle: "angle", offX: "length", offY: "length", offZ: "length" };
  const originsOf = (f) => [f.ref1, f.ref2].filter((r) => r && r.kind === "feature").map((r) => r.id);
  reg("joint", { label: "Joint", stem: "Joint", fields: FIELDS, apply: applyJoint, deps: (f) => depsOf(f, originsOf(f)) });
  reg("constraint", { label: "Constraint", stem: "Constraint", fields: FIELDS, apply: applyJoint, deps: (f) => depsOf(f, originsOf(f)) });
  reg("jointorigin", {
    label: "Joint Origin", stem: "JointOrigin", fields: FIELDS,
    apply(st, f, P) {
      if (!X.valid(f.frame1)) throw new Error("Select a snap point");
      const occ = f.occ1 || ROOT;
      if (!has(st, occ)) throw new Error("The component of the joint origin is missing");
      st.jorigins = new Map(st.jorigins || []);
      st.jorigins.set(f.id, { id: f.id, occ, F: originFrame(f, P) });
      return {};
    },
    deps: (f) => depsOf(f),
  });
  reg("rigidgroup", {
    label: "Rigid Group", stem: "RigidGroup",
    apply(st, f, P, doc) {
      const occs = (f.occs || []).filter((o) => st.occ.has(o));
      if (occs.length < 2) throw new Error("A rigid group needs at least two components");
      st.rigid = new Map(st.rigid || []);
      // rel: the positions relative to the first member when the group was made (they stay locked)
      const rel = f.rel && occs.every((o) => X.valid(f.rel[o])) ? f.rel : null;
      st.rigid.set(f.id, { id: f.id, occs, rel });
      const r = st.joints && st.joints.size ? resolve(st, doc) : null;
      const out = { affected: r ? r.moved.flatMap((o) => M.occBodiesDeep(st, o)) : [] };
      if ((f.occs || []).length > occs.length) out.warning = "Some components of the rigid group are missing";
      return out;
    },
  });
  reg("motionlink", {
    label: "Motion Link", stem: "MotionLink",
    apply(st, f, P, doc) {
      const j1 = st.joints && st.joints.get(f.joint1), j2 = st.joints && st.joints.get(f.joint2);
      if (!j1 || !j2 || f.joint1 === f.joint2) throw new Error("Select two different joints");
      if (!(S.DOFS[j1.jointType] || []).includes(f.dof1) || !(S.DOFS[j2.jointType] || []).includes(f.dof2)) throw new Error("The joints do not have the linked motion");
      if (!(Math.abs(Number(f.amount1)) > 1e-9)) throw new Error("The first amount must not be zero");
      st.links = new Map(st.links || []);
      st.links.set(f.id, { id: f.id, joint1: f.joint1, dof1: f.dof1, joint2: f.joint2, dof2: f.dof2, amount1: Number(f.amount1), amount2: Number(f.amount2) || 0, reverse: !!f.reverse });
      const r = resolve(st, doc);
      return { affected: r ? r.moved.flatMap((o) => M.occBodiesDeep(st, o)) : [] };
    },
    deps: (f) => depsOf(f, [f.joint1, f.joint2]),
  });
  // Captured positions must not pull jointed components apart: the joints are solved again after a Position.
  const snap = M.featureDef("snapshot");
  if (snap && typeof snap.apply === "function" && !snap.apply.__assembly) {
    const base = snap.apply;
    const apply = (st, f, P, doc) => {
      const out = base(st, f, P, doc);
      if (st.joints && st.joints.size) { try { resolve(st, doc); } catch (e) { console.warn("[assembly] snapshot", e); } }
      return out;
    };
    apply.__assembly = true;
    const { builtin, type, ...rest } = snap;
    M.registerFeature("snapshot", { ...rest, apply, replace: true });
  }
}
