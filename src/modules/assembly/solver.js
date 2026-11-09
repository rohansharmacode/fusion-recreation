// assembly: pure kinematics. A model is {T: Map oid -> world 3x4, parent: Map oid -> oid, grounded: Set,
// joints: [J], welds: [[oid, ...]], links: [L]} with J = {id, jointType, a, b, FA, FB, off, rotAxis, slideAxis,
// drive, limits}. A joint holds  T(a) = T(b) * FB * Off * Motion(drive) * inverse(FA)  (FA / FB are the joint
// frames in the local space of a / b). Open chains are solved exactly by a breadth-first walk from the anchors
// (root, pinned occurrences); joints that close a loop are relaxed numerically (damped least squares, best effort).
import * as X from "./math.js";

export const ROOT = "root";
export const DOFS = {
  rigid: [], revolute: ["rot"], slider: ["slide"], cylindrical: ["rot", "slide"], pinslot: ["rot", "slide"],
  planar: ["slide", "slide2", "rot"], ball: ["pitch", "yaw", "roll"], angle: [], tangent: [], center: [],
};
/** Constraints that only hold a relation (Angle, Tangent, Center): never a placement edge, always a loop residual. */
export const LOOP_ONLY = new Set(["angle", "tangent", "center"]);
export const TYPE_LABEL = { rigid: "Rigid", revolute: "Revolute", slider: "Slider", cylindrical: "Cylindrical", pinslot: "Pin-slot", planar: "Planar", ball: "Ball" };
export const DOF_LABEL = { rot: "Rotation", slide: "Distance", slide2: "Distance 2", pitch: "Pitch", yaw: "Yaw", roll: "Roll" };
export const isRot = (dof) => dof !== "slide" && dof !== "slide2";
const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const NEXT = { x: "y", y: "z", z: "x" };

/** Unit axes of the joint motion in the joint frame: {rot?, slide?, slide2?, pitch?, yaw?, roll?}. */
export function axes(J) {
  const r = J.rotAxis in AX ? J.rotAxis : "z";
  switch (J.jointType) {
    case "revolute": return { rot: AX[r] };
    case "cylindrical": return { rot: AX[r], slide: AX[r] };
    case "slider": return { slide: AX[J.slideAxis in AX ? J.slideAxis : "z"] };
    case "pinslot": return { rot: AX[r], slide: AX[J.slideAxis in AX ? J.slideAxis : "x"] };
    case "planar": return { rot: AX[r], slide: AX[NEXT[r]], slide2: AX[NEXT[NEXT[r]]] };
    case "ball": return { pitch: AX[r], yaw: AX[NEXT[r]], roll: AX[NEXT[NEXT[r]]] };
    default: return {};
  }
}
export function motion(J, d = {}) {
  const a = axes(J), v = (k) => Number(d[k]) || 0;
  switch (J.jointType) {
    case "revolute": return X.rot(a.rot, v("rot"));
    case "slider": return X.trans(X.V.mul(a.slide, v("slide")));
    case "cylindrical": case "pinslot": return X.mul(X.trans(X.V.mul(a.slide, v("slide"))), X.rot(a.rot, v("rot")));
    case "planar": return X.mul(X.trans(X.V.add(X.V.mul(a.slide, v("slide")), X.V.mul(a.slide2, v("slide2")))), X.rot(a.rot, v("rot")));
    case "ball": return X.mulAll(X.rot(a.pitch, v("pitch")), X.rot(a.yaw, v("yaw")), X.rot(a.roll, v("roll")));
    default: return X.I.slice();
  }
}
/** Alignment of frame A in frame B at zero motion: offsets, angle about Z, and the Z axes opposed unless flipped. */
export function offset(J) {
  const o = J.off;
  if (!o) return X.I.slice();
  let m = X.mul(X.trans([o.x || 0, o.y || 0, o.z || 0]), X.rot(AX.z, o.angle || 0));
  if (!o.flip) m = X.mul(m, X.rot(AX.x, 180));
  return m;
}
export const jointX = (J, d) => X.mulAll(J.FB, offset(J), motion(J, d), X.inv(J.FA));

export function clamp(J, dof, v) {
  const l = J.limits && J.limits[dof];
  if (!l) return v;
  if (l.minOn && Number.isFinite(l.min) && v < l.min) v = l.min;
  if (l.maxOn && Number.isFinite(l.max) && v > l.max) v = l.max;
  return v;
}
export const linkRatio = (L) => ((Number(L.amount2) || 0) / (Number(L.amount1) || 1)) * (L.reverse ? -1 : 1);

/** Drive values used by a solve: stored values, overrides, motion links (joint 2 follows joint 1), limits. */
export function drives(model, over) {
  const D = new Map();
  for (const J of model.joints) {
    const d = {};
    for (const k of DOFS[J.jointType] || []) d[k] = clamp(J, k, Number((over && over.get(J.id) && over.get(J.id)[k]) ?? (J.drive && J.drive[k])) || 0);
    D.set(J.id, d);
  }
  for (const L of model.links || []) {
    const d1 = D.get(L.joint1), d2 = D.get(L.joint2);
    if (d1 && d2 && L.dof1 in d1 && L.dof2 in d2) d2[L.dof2] = d1[L.dof1] * linkRatio(L);
  }
  return D;
}

/** What a relation-only constraint still violates (mm; angles scaled by 20 mm per radian). */
function relResidual(J, Ta, Tb) {
  const A = X.mul(Ta, J.FA), B = X.mul(Tb, J.FB), V = X.V;
  let zA = X.axis(A, 2);
  const zB = X.axis(B, 2), oA = X.origin(A), oB = X.origin(B);
  if (J.jointType === "angle") {
    if (J.flip) zA = V.mul(zA, -1);
    const t = (Number(J.target) || 0) * X.RAD, c = V.cross(zA, zB);
    if (Math.abs(t) < 1e-9) return V.mul(c, 20);
    return [(Math.atan2(V.len(c), V.dot(zA, zB)) - t) * 20];
  }
  if (J.jointType === "tangent") {
    const d = V.dot(V.sub(oA, oB), zB), r = (Number(J.r) || 0) * (J.flip ? -1 : 1);
    return J.sphere ? [d - r] : [d - r, V.dot(zA, zB) * 20];
  }
  if (J.jointType === "center") {
    const o2 = J.FB2 ? X.origin(X.mul(Tb, J.FB2)) : oB, mid = V.mul(V.add(oB, o2), 0.5);
    let oa = oA;
    if (J.FA2) oa = V.mul(V.add(oA, X.origin(X.mul(Ta, J.FA2))), 0.5);
    return [V.dot(V.sub(oa, mid), zB)];
  }
  return [0];
}
/** What a loop joint still violates: 6 numbers (translation mm, rotation scaled to mm) in the joint frame. */
export function residual(J, Ta, Tb) {
  if (LOOP_ONLY.has(J.jointType)) return relResidual(J, Ta, Tb);
  const Q = X.mul(X.inv(X.mulAll(Tb, J.FB, offset(J))), X.mul(Ta, J.FA));
  let t = X.origin(Q), w = X.rotVec(Q);
  const a = axes(J), V = X.V;
  const drop = (v, k) => V.sub(v, V.mul(k, V.dot(v, k)));
  switch (J.jointType) {
    case "revolute": w = drop(w, a.rot); break;
    case "slider": t = drop(t, a.slide); break;
    case "cylindrical": w = drop(w, a.rot); t = drop(t, a.slide); break;
    case "pinslot": w = drop(w, a.rot); t = drop(t, a.slide); break;
    case "planar": w = drop(w, a.rot); t = V.mul(a.rot, V.dot(t, a.rot)); break;
    case "ball": w = [0, 0, 0]; break;
    default: break;
  }
  return [t[0], t[1], t[2], w[0] * 20, w[1] * 20, w[2] * 20];
}

/** One breadth-first pass with the given drive values. */
export function pass(model, D) {
  const T = new Map(model.T), base = model.T;
  const get = (o) => (o === ROOT ? X.I : T.get(o));
  const adj = new Map();
  const edge = (n, e) => { if (!adj.has(n)) adj.set(n, []); adj.get(n).push(e); };
  const known = (o) => o === ROOT || base.has(o);
  const edges = [];
  for (const J of model.joints) if (J.a !== J.b && known(J.a) && known(J.b) && !LOOP_ONLY.has(J.jointType)) edges.push({ J, a: J.a, b: J.b });
  for (const g of model.welds || []) {
    const m = g.filter(known);
    const rel = g.rel;
    for (let i = 1; i < m.length; i++) {
      // stored: rel[o] = position of o relative to the first member of the group (rel of that member: identity)
      const R = rel && rel[m[i]] && rel[m[0]] ? X.mul(X.inv(rel[m[0]]), rel[m[i]]) : X.mul(X.inv(m[0] === ROOT ? X.I : base.get(m[0])), m[i] === ROOT ? X.I : base.get(m[i]));
      edges.push({ a: m[i], b: m[0], R });
    }
  }
  for (const e of edges) { edge(e.a, e); edge(e.b, e); }
  const under = (o, anc) => { for (let p = model.parent.get(o), i = 0; p && i < 64; p = model.parent.get(p), i++) if (p === anc) return true; return false; };
  const setPose = (o, Tn) => {
    const d = X.mul(Tn, X.inv(T.get(o)));
    T.set(o, Tn);
    for (const k of T.keys()) if (k !== o && under(k, o)) T.set(k, X.mul(d, T.get(k)));
  };
  const solved = new Set(), tree = new Map(), loops = [], used = new Set(), anchors = new Set(), floating = new Set();
  // free pose of an unanchored cluster (relation-only constraints move it): D.get("@" + oid) = {tx..rz}
  const posed = (o) => {
    const p = D.get("@" + o);
    if (!p || o === ROOT || !base.has(o)) return;
    const c = X.origin(base.get(o));
    const d = X.mulAll(X.trans(X.V.add(c, [p.tx || 0, p.ty || 0, p.tz || 0])), X.rot([1, 0, 0], p.rx || 0), X.rot([0, 1, 0], p.ry || 0), X.rot([0, 0, 1], p.rz || 0), X.trans(X.V.mul(c, -1)));
    setPose(o, X.mul(d, base.get(o)));
  };
  const walk = (start) => {
    const q = [start];
    solved.add(start);
    while (q.length) {
      const n = q.shift();
      for (const e of adj.get(n) || []) {
        if (used.has(e)) continue;
        const o = e.a === n ? e.b : e.a;
        if (solved.has(o)) {
          used.add(e);
          if (e.J) { const res = residual(e.J, get(e.a), get(e.b)); loops.push({ J: e.J, res, norm: Math.hypot(...res) }); }
          continue;
        }
        used.add(e);
        const rel = e.J ? jointX(e.J, D.get(e.J.id)) : e.R; // T(a) = T(b) * rel
        setPose(o, o === e.a ? X.mul(get(e.b), rel) : X.mul(get(e.a), X.inv(rel)));
        solved.add(o);
        tree.set(o, { J: e.J || null, from: n, weld: !e.J });
        q.push(o);
      }
    }
  };
  for (const n of adj.keys()) if (n === ROOT || model.grounded.has(n)) anchors.add(n);
  for (const n of anchors) if (!solved.has(n)) walk(n);
  for (const e of edges) {
    // floating cluster: the second component of its earliest joint stays where it is
    if (!solved.has(e.b)) { floating.add(e.b); posed(e.b); walk(e.b); }
    else if (!solved.has(e.a)) { floating.add(e.a); posed(e.a); walk(e.a); }
  }
  for (const J of model.joints) {
    if (!LOOP_ONLY.has(J.jointType) || J.a === J.b || !known(J.a) || !known(J.b)) continue;
    for (const o of [J.a, J.b]) if (!solved.has(o) && o !== ROOT) { solved.add(o); posed(o); }
    const res = residual(J, get(J.a), get(J.b));
    loops.push({ J, res, norm: Math.hypot(...res) });
  }
  return { T, tree, loops, anchors, floating, D };
}

/** Solve Ax = b for a small dense system (Gaussian elimination with partial pivoting). */
function linsolve(A, b) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-14) continue;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      if (!f) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = Math.abs(A[r][r]) < 1e-14 ? 0 : s / A[r][r];
  }
  return x;
}

/**
 * Damped least squares: change the variables until err() is zero. vars: [{get(), set(v), rot}];
 * err() -> array. Returns the final error norm.
 */
export function dls(vars, err, opts = {}) {
  const iters = opts.iters || 12, tol = opts.tol || 1e-6;
  let e = err(), n = Math.hypot(...e);
  for (let it = 0; it < iters && n > tol && vars.length; it++) {
    const m = e.length, cols = [];
    for (const v of vars) {
      const q = v.get(), h = v.rot ? 0.2 : 0.02;
      v.set(q + h);
      const e2 = err();
      v.set(q);
      cols.push(e2.map((x, i) => (x - e[i]) / h));
    }
    const A = [];
    let tr = 0;
    for (let r = 0; r < m; r++) { A.push(new Array(m).fill(0)); for (let c = 0; c < m; c++) { let s = 0; for (const col of cols) s += col[r] * col[c]; A[r][c] = s; } tr = Math.max(tr, A[r][r]); }
    for (let r = 0; r < m; r++) A[r][r] += 1e-5 * tr + 1e-12;
    const y = linsolve(A, e.map((x) => -x));
    const prev = vars.map((v) => v.get());
    let scale = 1;
    const dq = cols.map((col, i) => { let s = 0; for (let r = 0; r < m; r++) s += col[r] * y[r]; const lim = vars[i].rot ? 25 : 40; if (Math.abs(s) > lim) scale = Math.min(scale, lim / Math.abs(s)); return s; });
    vars.forEach((v, i) => v.set(prev[i] + dq[i] * scale));
    let e2 = err(), n2 = Math.hypot(...e2);
    // back off when the step made it worse
    for (let k = 0; k < 4 && n2 > n * 1.0001; k++) { scale *= 0.4; vars.forEach((v, i) => v.set(prev[i] + dq[i] * scale)); e2 = err(); n2 = Math.hypot(...e2); }
    if (n2 > n * 1.0001) { vars.forEach((v, i) => v.set(prev[i])); break; }
    if (Math.abs(n - n2) < 1e-10) { e = e2; n = n2; break; }
    e = e2; n = n2;
  }
  return n;
}

/** Free variables of a solve: every degree of freedom of a tree joint that no motion link drives. */
export function freeVars(model, D, res, only) {
  const slaved = new Set((model.links || []).map((L) => `${L.joint2}|${L.dof2}`));
  const out = [];
  const seen = new Set();
  for (const t of res.tree.values()) {
    const J = t.J;
    if (!J || seen.has(J.id) || (only && !only.has(J.id))) continue;
    seen.add(J.id);
    for (const k of DOFS[J.jointType] || []) {
      if (slaved.has(`${J.id}|${k}`)) continue;
      out.push({ J, dof: k, rot: isRot(k), get: () => D.get(J.id)[k], set: (v) => { D.get(J.id)[k] = clamp(J, k, v); } });
    }
  }
  return out;
}
/** Pose variables of the unanchored clusters that relation-only constraints position (component 1 moves first). */
export function poseVars(model, D, res, only) {
  const rootOf = (n) => { for (let i = 0; res.tree.has(n) && i < 256; i++) n = res.tree.get(n).from; return n; };
  const free = (n) => n !== ROOT && !res.anchors.has(n) && !model.grounded.has(n) && model.T.has(n);
  const roots = new Set();
  for (const J of model.joints) {
    if (!LOOP_ONLY.has(J.jointType) || (only && !only.has(J.id))) continue;
    const ra = rootOf(J.a), rb = rootOf(J.b);
    if (free(ra)) roots.add(ra); else if (free(rb)) roots.add(rb);
  }
  const out = [];
  for (const o of roots) {
    const key = "@" + o;
    if (!D.has(key)) D.set(key, { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 });
    for (const k of ["tx", "ty", "tz", "rx", "ry", "rz"]) out.push({ J: { id: key }, dof: k, rot: k[0] === "r", get: () => D.get(key)[k], set: (v) => { D.get(key)[k] = v; } });
  }
  return out;
}
export const relink = (model, D) => { for (const L of model.links || []) { const a = D.get(L.joint1), b = D.get(L.joint2); if (a && b && L.dof1 in a && L.dof2 in b) b[L.dof2] = a[L.dof1] * linkRatio(L); } };

/**
 * Full solve. over: Map jointId -> {dof: value} (optional). Returns {T, tree, loops, anchors, floating, D,
 * residual} where D holds the drive values that were used (changed by loop closing when there are loops).
 */
export function solve(model, over, opts = {}) {
  const D = drives(model, over);
  let r = pass(model, D);
  if (opts.close !== false && r.loops.some((l) => l.norm > 1e-6)) {
    // the joints that the caller drives keep their value when the loop can close without them
    const hold = opts.hold || (over ? new Set(over.keys()) : new Set());
    // joint motion first; the free pose of an unanchored cluster only when the joints cannot close the loops
    const jv = freeVars(model, D, r);
    const err = () => { relink(model, D); const p = pass(model, D); return p.loops.flatMap((l) => l.res); };
    const fj = jv.filter((v) => !hold.has(v.J.id));
    let n = fj.length ? dls(fj, err, { iters: 30 }) : Infinity;
    // only the relation constraints that are still open give their cluster a free pose
    const open = new Set(pass(model, D).loops.filter((l) => l.norm > 1e-4 && LOOP_ONLY.has(l.J.jointType)).map((l) => l.J.id));
    const all = [...jv, ...(open.size ? poseVars(model, D, r, open) : [])];
    const free = all.filter((v) => !hold.has(v.J.id));
    if (n > 1e-4 && free.length > fj.length) n = dls(free, err, { iters: 30 });
    if (n > 1e-4 && free.length < all.length) n = dls(all, err, { iters: 30 });
    relink(model, D);
    r = pass(model, D);
  }
  r.residual = r.loops.reduce((m, l) => Math.max(m, l.norm), 0);
  return r;
}

/** Tree joints between a node and its anchor (nearest first). */
export function chain(res, node) {
  const out = [];
  for (let n = node, i = 0; res.tree.has(n) && i < 256; i++) { const t = res.tree.get(n); if (t.J) out.push(t.J); n = t.from; }
  return out;
}
/** True when the node hangs (through joints or welds) on the root or on a pinned occurrence. */
export function anchored(res, node) {
  let n = node;
  for (let i = 0; res.tree.has(n) && i < 256; i++) n = res.tree.get(n).from;
  return res.anchors.has(n);
}
/** Every node of the cluster (connected set) that contains `node`. */
export function clusterOf(res, node) {
  const rootOf = (n) => { for (let i = 0; res.tree.has(n) && i < 256; i++) n = res.tree.get(n).from; return n; };
  const r = rootOf(node), out = [];
  if (!res.tree.has(node) && !res.anchors.has(node) && !res.floating.has(node)) return [node];
  for (const n of [...res.tree.keys(), ...res.anchors, ...res.floating]) if (rootOf(n) === r && !out.includes(n)) out.push(n);
  return out;
}

/**
 * Drag: move the drive values so that the point pLocal of `node` reaches the target (a point, or the nearest
 * point of a ray {o, d}), or so that the node reaches the pose target.pose. Returns the solve result.
 */
export function reach(model, D, node, pLocal, target, opts = {}) {
  let r = pass(model, D);
  const only = new Set(chain(r, node).map((J) => J.id));
  const vars = freeVars(model, D, r, opts.allJoints || r.loops.length ? null : only);
  const goal = (p) => {
    if (!target.d) return target.p || target;
    const t = X.V.dot(X.V.sub(p, target.o), target.d);
    return X.V.add(target.o, X.V.mul(target.d, t));
  };
  const err = () => {
    relink(model, D);
    const p = pass(model, D), T = p.T.get(node);
    if (!T) return [0, 0, 0];
    const loops = p.loops.flatMap((l) => l.res.map((x) => x * 4));
    if (target.pose) { const w = X.rotVec(X.mul(target.pose, X.inv(T))); return [target.pose[3] - T[3], target.pose[7] - T[7], target.pose[11] - T[11], w[0] * 20, w[1] * 20, w[2] * 20, ...loops]; }
    const w = X.apply(T, pLocal), g = goal(w);
    return [g[0] - w[0], g[1] - w[1], g[2] - w[2], ...p.loops.flatMap((l) => l.res.map((x) => x * 4))];
  };
  dls(vars, err, { iters: opts.iters || 10, tol: 1e-4 });
  relink(model, D);
  r = pass(model, D);
  r.residual = r.loops.reduce((m, l) => Math.max(m, l.norm), 0);
  return r;
}
