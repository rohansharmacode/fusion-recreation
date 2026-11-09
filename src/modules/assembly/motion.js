// assembly: display poses, joint animation, drive values, the move wrapper (joints and rigid groups follow a
// moved component) and Component Drag.
import * as X from "./math.js";
import * as S from "./solver.js";
import * as F from "./features.js";
import { contactSetup } from "./contact.js";

const V = X.V;
const r6 = (v) => Math.round(v * 1e6) / 1e6;

/**
 * Draw the occurrences at the poses T (Map oid -> world 3x4) without re-evaluating. shown: the poses that the
 * canvas shows right now when they differ from the evaluated state (a dialog preview), else null.
 */
export function showPoses(app, T, shown) {
  const C = app.components, st = app.result.state;
  for (const o of st.occ.keys()) {
    const m = T && T.get(o), base = F.occT(st, o), ref = (shown && shown.get(o)) || base;
    if (!m || X.same(m, ref, 1e-9)) { if (C.displayTransform(o)) C.setDisplayTransform(o, null); continue; }
    C.setDisplayTransform(o, shown ? X.mulAll(m, X.inv(ref), base) : m);
  }
}
export function clearPoses(app) { try { app.components.clearDisplay(); } catch { /* ignore */ } }

let anim = null;
export const animating = () => !!anim;
export function stopAnim() {
  if (!anim) return;
  const a = anim;
  anim = null;
  cancelAnimationFrame(a.raf);
  try { a.done && a.done(false); } catch (e) { console.warn("[assembly] animation", e); }
}
/** Run frame(t) for t = 0..1 over ms milliseconds; done(finished) is always called once. */
export function play(app, { ms, frame, done }) {
  stopAnim();
  const t0 = performance.now(), a = { done };
  const tick = (now) => {
    if (anim !== a) return;
    const t = Math.max(0, Math.min(1, (now - t0) / ms));
    let ok = true;
    try { frame(t); } catch (e) { console.warn("[assembly] animation", e); ok = false; }
    if (t >= 1 || !ok) { anim = null; try { done && done(ok); } catch (e) { console.warn("[assembly] animation", e); } return; }
    a.raf = requestAnimationFrame(tick);
  };
  anim = a;
  a.raf = requestAnimationFrame(tick);
}
/** Value of a degree of freedom along its animation (u = 0..1): through the limits, or a turn / a stroke. */
export function animValue(J, dof, cur, u) {
  const l = (J.limits && J.limits[dof]) || {}, rot = S.isRot(dof);
  const span = rot ? (J.jointType === "ball" && dof !== "roll" ? 30 : 180) : 20;
  if (rot && !l.minOn && !l.maxOn && span === 180) return cur + 360 * u;
  const hi = l.maxOn && Number.isFinite(l.max) ? l.max : cur + span, lo = l.minOn && Number.isFinite(l.min) ? l.min : cur - span;
  if (u < 0.25) return X.lerp(cur, hi, u * 4);
  if (u < 0.75) return X.lerp(hi, lo, (u - 0.25) * 2);
  return X.lerp(lo, cur, (u - 0.75) * 4);
}
/** Animate the degrees of freedom of one joint of a solver model, one after the other. */
export function animateJoint(app, model, jointId, opts = {}) {
  const J = model.joints.find((j) => j.id === jointId), dofs = J ? S.DOFS[J.jointType] || [] : [];
  if (!dofs.length) { if (opts.done) opts.done(false); return false; }
  const d0 = { ...S.drives(model).get(jointId) };
  play(app, {
    ms: (opts.ms || 1600) * dofs.length,
    frame(t) {
      const i = Math.min(dofs.length - 1, Math.floor(t * dofs.length)), k = dofs[i];
      const r = S.solve(model, new Map([[jointId, { ...d0, [k]: animValue(J, k, d0[k], t * dofs.length - i) }]]));
      showPoses(app, r.T, opts.shown);
    },
    done(ok) { clearPoses(app); if (opts.done) opts.done(ok); },
  });
  return true;
}
/** Animate a joint of the current design. */
export const animateLive = (app, jointId, opts) => animateJoint(app, F.liveModel(app), jointId, opts);

/** Store drive values (Map jointId -> {dof: value}) in the joint features: one undo step. */
export function commitDrives(app, D, label = "Drive Joints") {
  const ch = [];
  for (const [id, d] of D) {
    const f = app.feature(id);
    if (!f || !d) continue;
    const cur = f.drive || {};
    if (Object.keys(d).some((k) => Math.abs((Number(cur[k]) || 0) - d[k]) > 1e-7)) ch.push([id, Object.fromEntries(Object.entries(d).map(([k, v]) => [k, r6(v)]))]);
  }
  if (!ch.length) return false;
  app.mutate(label, (doc) => { for (const [id, d] of ch) { const f = doc.features.find((x) => x.id === id); if (f) f.drive = { ...(f.drive || {}), ...d }; } });
  return true;
}
/** Drive values after a drag: a degree of freedom with a rest value goes back to it. */
function rested(model, D) {
  for (const J of model.joints) {
    const d = D.get(J.id);
    for (const k of Object.keys((d && J.limits) || {})) { const l = J.limits[k]; if (l && l.restOn && Number.isFinite(l.rest) && k in d) d[k] = S.clamp(J, k, l.rest); }
  }
  S.relink(model, D);
  return D;
}
const cloneD = (D) => new Map([...D].map(([k, v]) => [k, { ...v }]));
const lerpD = (A, B, s) => new Map([...B].map(([k, v]) => [k, Object.fromEntries(Object.keys(v).map((d) => [d, X.lerp((A.get(k) || v)[d], v[d], s)]))]));
const inTree = (res, o) => res.tree.has(o) || res.anchors.has(o) || res.floating.has(o);
const hasJoint = (res, cl) => cl.some((n) => res.tree.get(n) && res.tree.get(n).J);
const hasDof = (res, o) => res.loops.length > 0 || S.chain(res, o).some((J) => (S.DOFS[J.jointType] || []).length);
/** Poses after the members (and what hangs under them) moved by the same rigid delta. */
function rigidPoses(model, members, delta) {
  const T = new Map(model.T), set = new Set(members);
  const under = (o) => { for (let n = o, i = 0; n && i < 64; n = model.parent.get(n), i++) if (set.has(n)) return true; return false; };
  for (const [o, m] of model.T) if (under(o)) T.set(o, X.mul(delta, m));
  return T;
}

/**
 * Plan a move of occurrences ({oid: world 3x4}) on a design with joints or rigid groups. Returns undefined
 * when the plain move applies, else the result of the move.
 */
function planMove(app, map, opts, base) {
  const st = app.result.state, C = app.components, model = F.liveModel(app);
  if (!model.joints.length && !model.welds.length) return undefined;
  const res = S.solve(model, null, { close: false });
  const ids = Object.keys(map || {}).filter((o) => st.occ.has(o) && X.valid(map[o]));
  if (!ids.some((o) => inTree(res, o))) return undefined;
  const out = {}, D = S.drives(model), done = new Set();
  let capture = false, driven = false;
  for (const o of ids) {
    if (done.has(o)) continue;
    if (!inTree(res, o)) { out[o] = map[o]; continue; }
    const cl = S.clusterOf(res, o).filter((n) => n !== F.ROOT && st.occ.has(n));
    const delta = X.mul(map[o], X.inv(model.T.get(o)));
    const together = () => { for (const n of cl) { out[n] = n !== o && ids.includes(n) ? map[n] : X.mul(delta, model.T.get(n)); done.add(n); } };
    if (!hasJoint(res, cl)) {
      // rigid group: the members move alike; a pinned member that is not moved itself holds the group
      if (!opts.force && cl.some((n) => !map[n] && model.grounded.has(n))) { cl.forEach((n) => done.add(n)); continue; }
      together();
      continue;
    }
    // jointed components never keep an uncaptured position: it would pull them out of their joints
    if (!S.anchored(res, o)) { together(); capture = true; continue; }
    if (res.anchors.has(o)) { out[o] = map[o]; capture = true; done.add(o); continue; }
    if (!hasDof(res, o)) { app.toast(`${C.label(o)} is fully constrained by its joints.`, "warning"); done.add(o); continue; }
    S.reach(model, D, o, null, { pose: map[o] }, { iters: 30 });
    driven = true;
    done.add(o);
  }
  let ok = false;
  if (driven) ok = commitDrives(app, D, opts.label || "Move") || ok;
  if (Object.keys(out).length) ok = base(out, capture ? { ...opts, capture: true } : opts) || ok;
  return ok;
}
/** Wrap app.components.setTransform(s): joints and rigid groups take part in every move. */
export function installMoveWrapper(app) {
  const C = app.components;
  if (!C || C.__assemblyMove || typeof C.setTransforms !== "function") return;
  C.__assemblyMove = true;
  const many = C.setTransforms, one = C.setTransform;
  const plan = (map, opts) => { try { return planMove(app, map || {}, opts || {}, many); } catch (e) { console.warn("[assembly] move", e); return undefined; } };
  C.setTransforms = (map, opts) => { const r = plan(map, opts); return r === undefined ? many(map, opts) : r; };
  C.setTransform = (oid, m, opts = {}) => {
    const info = C.info && C.info(oid);
    if (info && info.grounded && !opts.force) return one(oid, m, opts);
    const r = plan({ [oid]: m }, opts);
    return r === undefined ? one(oid, m, opts) : r;
  };
}

/** Component Drag: drag a component in the canvas; joints, rigid groups and contact are respected. */
export function installDrag(app, isOn) {
  let d = null;
  const stop = () => { if (d && d.moved) clearPoses(app); d = null; };
  const begin = (ctx) => {
    const st = app.result.state, C = app.components, model = F.liveModel(app), res = S.solve(model, null, { close: false });
    const path = F.pathOf(st, d.owner).slice(1);
    const node = [...path].reverse().find((o) => inTree(res, o)) || path[0];
    if (!node || !model.T.has(node)) return false;
    const pinned = (o) => { app.toast(`${C.label(o)} is pinned. Unpin it to move it.`, "warning"); return false; };
    const cl = inTree(res, node) ? S.clusterOf(res, node).filter((n) => n !== F.ROOT && st.occ.has(n)) : [node];
    if (inTree(res, node) && hasJoint(res, cl) && S.anchored(res, node)) {
      if (res.anchors.has(node)) return pinned(node);
      if (!hasDof(res, node)) { app.toast(`${C.label(node)} is fully constrained by its joints.`, "warning"); return false; }
      d.mode = "ik";
      d.q = S.drives(model);
    } else {
      const g = cl.find((n) => model.grounded.has(n));
      if (g && !hasJoint(res, cl)) return pinned(g);
      d.mode = "free";
      d.members = cl;
      d.q = [0, 0, 0];
    }
    Object.assign(d, { node, model, T0: model.T.get(node), pl: X.apply(X.inv(model.T.get(node)), d.p), moved: true });
    // the base handler started a window selection on the press: drop it
    const sel = app.input.stack.find((h) => h.name === "select");
    try { if (sel && sel.onCancel) sel.onCancel(); } catch { /* ignore */ }
    try { app.selection.setHover(null); } catch { /* ignore */ }
    try { d.contact = contactSetup(app, model); } catch (e) { console.warn("[assembly] contact", e); d.contact = null; }
    return true;
  };
  const posesOf = (q) => (d.mode === "ik" ? S.solve(d.model, q).T : rigidPoses(d.model, d.members, X.trans(q)));
  const mix = (a, b, s) => (d.mode === "ik" ? lerpD(a, b, s) : [0, 1, 2].map((i) => X.lerp(a[i], b[i], s)));
  const step = (ctx) => {
    let q;
    if (d.mode === "ik") {
      q = cloneD(d.q);
      S.reach(d.model, q, d.node, d.pl, ctx.ray, { iters: 8 });
    } else {
      const den = V.dot(ctx.ray.d, d.n);
      if (Math.abs(den) < 1e-9) return;
      q = V.sub(V.add(ctx.ray.o, V.mul(ctx.ray.d, V.dot(V.sub(d.p, ctx.ray.o), d.n) / den)), d.p);
    }
    let T = posesOf(q);
    // the path from the last pose is checked too, so a fast move cannot pass through another component
    let first = null;
    if (d.contact) for (const s of [0.2, 0.4, 0.6, 0.8, 1]) if (d.contact.hits(s === 1 ? T : posesOf(mix(d.q, q, s)))) { first = s; break; }
    if (first !== null) {
      // back to the last step without interference
      let lo = 0, hi = first;
      for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; if (d.contact.hits(posesOf(mix(d.q, q, mid)))) hi = mid; else lo = mid; }
      q = mix(d.q, q, lo);
      T = posesOf(q);
      d.blocked = true;
    }
    d.q = q;
    showPoses(app, T, null);
  };
  const finish = () => {
    const x = d;
    d = null;
    h.last = { mode: x.mode, node: x.node, contact: !!x.contact, blocked: !!x.blocked };
    try {
      if (x.mode === "ik") commitDrives(app, rested(x.model, cloneD(x.q)), "Drag Component");
      else if (V.len(x.q) > 1e-6) app.components.setTransforms({ [x.node]: X.mul(X.trans(x.q), x.T0) }, { label: "Drag Component" });
    } finally { clearPoses(app); }
    if (x.blocked) app.setStatus && app.setStatus("Contact stopped the drag");
  };
  const h = {
    name: "assembly-drag",
    onPointerDown(ev, ctx) {
      d = null;
      if (!isOn() || app.activeCommand || app.mode === "sketch" || app.input.top() !== h || ctx.button !== 0 || ctx.shift || ctx.ctrl || ctx.alt) return false;
      const hit = ctx.hit, body = hit && hit.ref && hit.ref.body;
      if (!body || !Array.isArray(hit.point)) return false;
      const st = app.result.state, owner = F.ownerOf(st, body);
      if (owner === F.ROOT || !st.occ.has(owner)) return false;
      d = { x: ctx.x, y: ctx.y, owner, p: hit.point.slice(0, 3), n: ctx.ray.d.slice(0, 3), moved: false };
      return false;
    },
    onPointerMove(ev, ctx) {
      if (!d) return false;
      if (!(ev.buttons & 1)) { stop(); return false; }
      if (!d.moved) {
        if (Math.hypot(ctx.x - d.x, ctx.y - d.y) < 5) return false;
        if (!begin(ctx)) { d = null; return false; }
      }
      step(ctx);
      return true;
    },
    onPointerUp() {
      if (!d || !d.moved) { d = null; return false; }
      finish();
      return true;
    },
    onCancel() { if (d && d.moved) { stop(); return true; } return false; },
  };
  app.input.push(h);
  return h;
}
