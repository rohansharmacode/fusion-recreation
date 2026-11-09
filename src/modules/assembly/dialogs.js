// assembly: command dialogs. Joint / As-built Joint / Joint Constraint / As-Built Constraint, Joint Origin, Rigid
// Group, Motion Link, Drive Joints, Edit Joint Limits, New Contact Set and the component constraints (Constrain
// Components, Align, Angle, Center, Tangent).
import * as M from "../../model.js";
import * as X from "./math.js";
import * as S from "./solver.js";
import * as F from "./features.js";
import * as MO from "./motion.js";

const V = X.V;
const SNAP_KINDS = ["face", "edge", "vertex", "feature"];
const OCC_KINDS = ["occurrence", "body", "face", "edge"];
export const TYPE_OPTIONS = F.JOINT_TYPES.map((t) => ({ value: t, label: S.TYPE_LABEL[t] }));
const AXIS_OPTIONS = [{ value: "z", label: "Z Axis" }, { value: "x", label: "X Axis" }, { value: "y", label: "Y Axis" }];
export const JOINT_KINDS = ["joint", "constraint"];

export function nextName(app, stem) {
  const used = new Set(app.doc.features.map((f) => f.name));
  for (let i = 1; ; i++) if (!used.has(`${stem}${i}`)) return `${stem}${i}`;
}
const storeRef = (r) => (!r ? null : r.kind === "feature" ? { kind: "feature", id: r.id } : { kind: r.kind, body: r.body, p: r.p ? r.p.slice() : undefined, ...(r.n ? { n: r.n.slice() } : {}) });
/** A stored snap reference as a selection ref of the state (face / edge index found again). */
export function liveRef(st, r) {
  if (!r) return null;
  if (r.kind === "feature" || r.kind === "vertex") return { ...r };
  const b = st.bodies.get(r.body);
  if (!b) return null;
  try {
    const idx = r.kind === "face" ? M.locateFace(b.shape, { ...r }) : M.locateEdge(b.shape, { ...r });
    return idx >= 0 ? { ...r, index: idx } : null;
  } catch { return null; }
}
export const occOfRef = (st, r) => (!r ? null : r.kind === "occurrence" ? r.occ : r.body ? F.ownerOf(st, r.body) : null);
const toOcc = (r, dlg) => { const o = occOfRef(dlg.baseState, r); return o ? { kind: "occurrence", occ: o } : null; };
const isFeat = (app, id, types) => { const f = app.feature(id); return !!f && types.includes(f.type); };
export const labelOf = (app, o) => (o === F.ROOT ? "(root)" : (app.components && app.components.label(o)) || o);

/** Animate button (custom row): runs fn(dlg) once, the second click stops it. */
function animateRow(id, fn, opts = {}) {
  return {
    id, type: "custom", label: "", visible: opts.visible,
    render(dlg) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dlg-btn asm-animate";
      b.dataset.input = id;
      b.textContent = "Animate";
      b.title = "Plays the motion of the joint";
      b.addEventListener("click", () => {
        if (MO.animating()) { MO.stopAnim(); return; }
        try { fn(dlg, () => { b.classList.remove("on"); b.textContent = "Animate"; }); b.classList.add("on"); b.textContent = "Stop"; } catch (e) { console.warn("[assembly] animate", e); }
      });
      return b;
    },
  };
}
/** Two tabs (Position / Motion) driving the hidden dropdown `tab`. */
function tabsRow() {
  return {
    id: "tabs", type: "custom", label: "", flush: true,
    render(dlg) {
      const el = document.createElement("div");
      el.className = "asm-tabs";
      for (const [v, t] of [["position", "Position"], ["motion", "Motion"]]) {
        const s = document.createElement("button");
        s.type = "button";
        s.className = "asm-tab";
        s.dataset.tab = v;
        s.textContent = t;
        s.addEventListener("click", () => { dlg.set("tab", v, { user: true, noPreview: true }); dlg.refresh(); });
        el.appendChild(s);
      }
      return el;
    },
    update(el, dlg) { for (const s of el.children) s.classList.toggle("on", s.dataset.tab === dlg.values.tab); },
  };
}
const motionRows = (pos) => [
  { id: "jointType", type: "dropdown", label: "Type", options: TYPE_OPTIONS, default: "rigid", visible: pos },
  { id: "rotAxis", type: "dropdown", label: "Rotate", options: AXIS_OPTIONS, default: "z", visible: (v, d) => pos(v, d) && ["revolute", "cylindrical", "pinslot"].includes(v.jointType) },
  { id: "normalAxis", type: "dropdown", label: "Normal", options: AXIS_OPTIONS, default: "z", visible: (v, d) => pos(v, d) && v.jointType === "planar" },
  { id: "ballAxis", type: "dropdown", label: "Pitch", options: AXIS_OPTIONS, default: "z", visible: (v, d) => pos(v, d) && v.jointType === "ball" },
  { id: "slideAxis", type: "dropdown", label: "Slide", options: AXIS_OPTIONS, default: "z", visible: (v, d) => pos(v, d) && ["slider", "pinslot"].includes(v.jointType) },
];
const rotAxisOf = (v) => (v.jointType === "planar" ? v.normalAxis : v.jointType === "ball" ? v.ballAxis : v.rotAxis) || "z";
function loadMotion(dlg, f0) {
  Object.assign(dlg.values, { jointType: f0.jointType || "rigid", rotAxis: f0.rotAxis || "z", normalAxis: f0.rotAxis || "z", ballAxis: f0.rotAxis || "z", slideAxis: f0.slideAxis || (f0.jointType === "pinslot" ? "x" : "z") });
}
const animatePreview = (app) => (dlg, done) => {
  const id = dlg.previewFeature && dlg.previewFeature.id;
  if (!id || !MO.animateLive(app, id, { done })) { done(); app.toast("This joint has no motion to animate.", "info"); }
};
/** Stop the animation and clear display poses when a dialog closes. */
const closeAnim = () => { try { MO.stopAnim(); } catch { /* ignore */ } };

// ------------------------------------------------------------------ Joint / Joint Constraint
/**
 * Joint (JointAssembleCmdNew) and Joint Constraint (JointConstraintCmd): snap Component 1 onto Component 2.
 * opts: {editId, preselect, kind: 'joint'|'constraint'}.
 */
export function openJoint(app, opts = {}) {
  const editId = opts.editId || null, f0 = editId ? app.feature(editId) : null;
  const kind = f0 ? f0.type : opts.kind || "joint";
  const cmd = kind === "constraint" ? "JointConstraintCmd" : "JointAssembleCmdNew";
  const title = kind === "constraint" ? "Joint Constraint" : "Joint";
  const pos = (v) => v.tab === "position", mot = (v) => v.tab === "motion";
  const disp = (app.ui.assembly || {}).display;
  return app.ui.dialog.open({
    id: cmd, title, icon: cmd, editId, featureLabel: title,
    help: kind === "constraint" ? "Connects snap points on two components to position them in the assembly, define their relative motion, and create a Joint Constraint between them." : "Connects two components and defines how they move relative to each other.",
    preselect: (opts.preselect || []).filter((r) => SNAP_KINDS.includes(r.kind)),
    labelWidth: 96,
    rows: [
      { id: "tab", type: "dropdown", label: "Tab", options: [{ value: "position", label: "Position" }, { value: "motion", label: "Motion" }], default: "position", visible: () => false },
      tabsRow(),
      { id: "g1", type: "group", label: "Component 1", visible: pos, rows: [
        { id: "mode1", type: "dropdown", label: "Mode", options: [{ value: "simple", label: "Simple" }, { value: "faces", label: "Between Two Faces", disabled: true }, { value: "edges", label: "Two Edge Intersection", disabled: true }], default: "simple" },
        { id: "snap1", type: "selection", label: "Snap", kinds: SNAP_KINDS, max: 1, prompt: "Select a snap point on component 1", tooltip: "Select a face, an edge, a vertex or a joint origin of the component that moves.",
          filter: (r) => r.kind !== "feature" || isFeat(app, r.id, ["jointorigin"]) },
      ] },
      { id: "g2", type: "group", label: "Component 2", visible: pos, rows: [
        { id: "mode2", type: "dropdown", label: "Mode", options: [{ value: "simple", label: "Simple" }, { value: "faces", label: "Between Two Faces", disabled: true }, { value: "edges", label: "Two Edge Intersection", disabled: true }], default: "simple" },
        { id: "snap2", type: "selection", label: "Snap", kinds: SNAP_KINDS, max: 1, prompt: "Select a snap point on component 2", tooltip: "Select a face, an edge, a vertex or a joint origin of the component that stays.",
          filter: (r) => r.kind !== "feature" || isFeat(app, r.id, ["jointorigin"]) },
      ] },
      { id: "ga", type: "group", label: "Alignment", visible: pos, rows: [
        { id: "angle", type: "value", label: "Angle", kind: "angle", default: "0.0 deg" },
        { id: "offX", type: "value", label: "Offset X", kind: "length", default: "0.00 mm" },
        { id: "offY", type: "value", label: "Offset Y", kind: "length", default: "0.00 mm" },
        { id: "offZ", type: "value", label: "Offset Z", kind: "length", default: "0.00 mm" },
        { id: "flip", type: "check", label: "Flip", tooltip: "Flips the direction of component 1.", default: false },
      ] },
      ...motionRows(mot),
      animateRow("animate", animatePreview(app), { visible: mot }),
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      Object.assign(dlg.values, { snap1: [liveRef(st, f0.ref1)].filter(Boolean), snap2: [liveRef(st, f0.ref2)].filter(Boolean), flip: !!f0.flip });
      for (const k of ["angle", "offX", "offY", "offZ"]) if (f0[k] !== undefined) dlg.values[k] = String(f0[k]);
      loadMotion(dlg, f0);
    },
    onCanvasMove(ctx, dlg) {
      if (!disp) return false;
      const act = dlg.active;
      let W = null;
      if ((act === "snap1" || act === "snap2") && ctx.hit && ctx.hit.ref && dlg._accepts(dlg.defs[act], ctx.hit.ref)) {
        try { W = F.snapOf(dlg.baseState, ctx.hit.ref).F; } catch { W = null; }
      }
      disp.showSnap(W);
      return false;
    },
    build(v, dlg) {
      const r1 = (v.snap1 || [])[0], r2 = (v.snap2 || [])[0];
      if (!r1 || !r2) return null;
      const fr = F.jointFrames(dlg.baseState, r1, r2);
      const f = {
        type: kind, jointType: v.jointType, ref1: storeRef(r1), ref2: storeRef(r2), occ1: fr.occ1, occ2: fr.occ2, frame1: fr.frame1, frame2: fr.frame2,
        angle: v.angle, offX: v.offX, offY: v.offY, offZ: v.offZ, rotAxis: rotAxisOf(v), slideAxis: v.slideAxis || "z", drive: f0 && f0.jointType === v.jointType ? { ...(f0.drive || {}) } : {},
      };
      if (kind === "constraint") f.ctype = "joint";
      if (v.flip) f.flip = true;
      if (f0 && f0.limits && f0.jointType === v.jointType) f.limits = JSON.parse(JSON.stringify(f0.limits));
      if (!f0) f.name = nextName(app, kind === "constraint" ? "Joint Constraint" : S.TYPE_LABEL[v.jointType].replace("-", ""));
      return f;
    },
    manipulators(dlg) {
      const r = dlg.previewFeature, st = app.result && app.result.state;
      const J = r && st && st.joints && st.joints.get(r.id);
      if (!J || dlg.values.tab !== "position") return [];
      const W = X.mulAll(F.occT(st, J.b), J.FB);
      const out = [];
      for (const [k, i] of [["offX", 0], ["offY", 1], ["offZ", 2]]) {
        const d = X.axis(W, i), cur = dlg.num(k);
        const m = dlg.valueManip(k, { origin: V.sub(X.origin(W), V.mul(d, Number.isFinite(cur) ? cur : 0)), dir: d, id: k });
        if (m) out.push(m);
      }
      return out;
    },
    onClose() { closeAnim(); if (disp) disp.showSnap(null); },
  });
}

// ------------------------------------------------------------------ As-built Joint / As-Built Constraint
export function openAsBuilt(app, opts = {}) {
  const editId = opts.editId || null, f0 = editId ? app.feature(editId) : null;
  const kind = f0 ? f0.type : opts.kind || "joint";
  const cmd = kind === "constraint" ? "AsBuiltConstraintCmd" : "JointAsBuiltCmd";
  const title = kind === "constraint" ? "As-Built Constraint" : "As-built Joint";
  const disp = (app.ui.assembly || {}).display;
  const all = () => true;
  return app.ui.dialog.open({
    id: cmd, title, icon: cmd, editId, featureLabel: title,
    help: kind === "constraint" ? "Creates a As-Built Constraint relationship between two components in their current position and defines their relative motion." : "Creates a Joint relationship between two components in their current position and defines their relative motion.",
    preselect: (opts.preselect || []).filter((r) => OCC_KINDS.includes(r.kind)),
    labelWidth: 96,
    rows: [
      { id: "comps", type: "selection", label: "Components", kinds: OCC_KINDS, max: 2, prompt: "Select two components", tooltip: "Select the two components to join in their current position.", mapRef: toOcc,
        selText: (n) => (n ? `${n} selected` : "Select"), advance: false },
      ...motionRows(all),
      { id: "position", type: "selection", label: "Position", kinds: SNAP_KINDS, max: 1, min: 0, prompt: "Select the joint position", tooltip: "Select a snap point for the joint origin.",
        visible: (v) => v.jointType !== "rigid", filter: (r) => r.kind !== "feature" || isFeat(app, r.id, ["jointorigin"]) },
      animateRow("animate", animatePreview(app), { visible: (v) => v.jointType !== "rigid" }),
    ],
    init(dlg) {
      if (!f0) return;
      dlg.values.comps = [f0.comp1 || f0.occ1, f0.comp2 || f0.occ2].filter(Boolean).map((o) => ({ kind: "occurrence", occ: o }));
      dlg.values.position = [liveRef(dlg.baseState, f0.ref1)].filter(Boolean);
      loadMotion(dlg, f0);
    },
    onChange(id, dlg) { if (id === "comps" && (dlg.values.comps || []).length >= 2 && dlg.values.jointType !== "rigid" && !(dlg.values.position || []).length) dlg.activate("position"); },
    onCanvasMove(ctx, dlg) {
      if (!disp) return false;
      let W = null;
      if (dlg.active === "position" && ctx.hit && ctx.hit.ref && dlg._accepts(dlg.defs.position, ctx.hit.ref)) { try { W = F.snapOf(dlg.baseState, ctx.hit.ref).F; } catch { W = null; } }
      disp.showSnap(W);
      return false;
    },
    validate(dlg) { const v = dlg.values; return v.jointType !== "rigid" && !(v.position || []).length ? "Select the joint position" : null; },
    build(v, dlg) {
      const cs = v.comps || [];
      if (cs.length < 2) return null;
      const st = dlg.baseState;
      const o1 = cs[0].occ, o2 = cs[1].occ;
      const [n1, n2] = F.liftNodes(st, o1, o2);
      const pr = (v.position || [])[0];
      if (v.jointType !== "rigid" && !pr) return null;
      const W = pr ? F.snapOf(st, pr).F : F.occT(st, n1 === F.ROOT ? n2 : n1);
      const f = {
        type: kind, asBuilt: true, jointType: v.jointType, occ1: n1, occ2: n2, comp1: o1, comp2: o2,
        frame1: X.mul(X.inv(F.occT(st, n1)), W), frame2: X.mul(X.inv(F.occT(st, n2)), W), rotAxis: rotAxisOf(v), slideAxis: v.slideAxis || "z",
        drive: f0 && f0.jointType === v.jointType ? { ...(f0.drive || {}) } : {},
      };
      if (pr) f.ref1 = storeRef(pr);
      if (kind === "constraint") f.ctype = "asbuilt";
      if (f0 && f0.limits && f0.jointType === v.jointType) f.limits = JSON.parse(JSON.stringify(f0.limits));
      if (!f0) f.name = nextName(app, kind === "constraint" ? "As-Built Constraint" : S.TYPE_LABEL[v.jointType].replace("-", ""));
      return f;
    },
    onClose() { closeAnim(); if (disp) disp.showSnap(null); },
  });
}

// ------------------------------------------------------------------ Joint Origin
export function openJointOrigin(app, opts = {}) {
  const editId = opts.editId || null, f0 = editId ? app.feature(editId) : null;
  const disp = (app.ui.assembly || {}).display;
  return app.ui.dialog.open({
    id: "JointOrigin", title: "Joint Origin", icon: "JointOrigin", editId, featureLabel: "Joint Origin",
    help: "Places a reusable joint origin on a component.",
    preselect: (opts.preselect || []).filter((r) => ["face", "edge", "vertex"].includes(r.kind)),
    labelWidth: 96,
    rows: [
      { id: "mode", type: "dropdown", label: "Mode", options: [{ value: "simple", label: "Simple" }, { value: "faces", label: "Between Two Faces", disabled: true }, { value: "edges", label: "Two Edge Intersection", disabled: true }], default: "simple" },
      { id: "snap", type: "selection", label: "Snap", kinds: ["face", "edge", "vertex"], max: 1, prompt: "Select a snap point", tooltip: "Select a face, an edge or a vertex to place the joint origin on." },
      { id: "ga", type: "group", label: "Alignment", rows: [
        { id: "angle", type: "value", label: "Angle", kind: "angle", default: "0.0 deg" },
        { id: "offX", type: "value", label: "Offset X", kind: "length", default: "0.00 mm" },
        { id: "offY", type: "value", label: "Offset Y", kind: "length", default: "0.00 mm" },
        { id: "offZ", type: "value", label: "Offset Z", kind: "length", default: "0.00 mm" },
        { id: "flip", type: "check", label: "Flip", default: false },
      ] },
    ],
    init(dlg) {
      if (!f0) return;
      dlg.values.snap = [liveRef(dlg.baseState, f0.ref1)].filter(Boolean);
      dlg.values.flip = !!f0.flip;
      for (const k of ["angle", "offX", "offY", "offZ"]) if (f0[k] !== undefined) dlg.values[k] = String(f0[k]);
    },
    onCanvasMove(ctx, dlg) {
      if (!disp) return false;
      let W = null;
      if (dlg.active === "snap" && ctx.hit && ctx.hit.ref && dlg._accepts(dlg.defs.snap, ctx.hit.ref)) { try { W = F.snapOf(dlg.baseState, ctx.hit.ref).F; } catch { W = null; } }
      disp.showSnap(W);
      return false;
    },
    build(v, dlg) {
      const r = (v.snap || [])[0];
      if (!r) return null;
      const s = F.snapOf(dlg.baseState, r);
      const f = { type: "jointorigin", ref1: storeRef(r), occ1: s.owner, frame1: X.mul(X.inv(F.occT(dlg.baseState, s.owner)), s.F), angle: v.angle, offX: v.offX, offY: v.offY, offZ: v.offZ };
      if (v.flip) f.flip = true;
      return f;
    },
    onClose() { if (disp) disp.showSnap(null); },
  });
}

// ------------------------------------------------------------------ Rigid Group
export function openRigidGroup(app, opts = {}) {
  const editId = opts.editId || null, f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "RigidGroupCmd", title: "Rigid Group", icon: "RigidGroupCmd", editId, featureLabel: "Rigid Group",
    help: "Locks the relative position of the selected components. The components are treated as a single object when moved or when joints are applied.",
    preselect: (opts.preselect || []).filter((r) => OCC_KINDS.includes(r.kind)),
    rows: [
      { id: "comps", type: "selection", label: "Components", kinds: OCC_KINDS, max: 0, min: 2, prompt: "Select components", mapRef: (r, dlg) => { const x = toOcc(r, dlg); return x && x.occ !== F.ROOT ? x : null; }, advance: false },
      { id: "children", type: "check", label: "Include Children", default: true, tooltip: "Includes the child components of the selected components in the rigid group." },
    ],
    init(dlg) {
      if (!f0) return;
      dlg.values.comps = (f0.picked || f0.occs || []).map((o) => ({ kind: "occurrence", occ: o }));
      dlg.values.children = f0.children !== false;
    },
    build(v, dlg) {
      const picked = [...new Set((v.comps || []).map((r) => r.occ))].filter((o) => o && o !== F.ROOT);
      if (picked.length < 2 && !(v.children && picked.length === 1 && M.occSubtree(dlg.baseState, picked[0]).size > 1)) return null;
      let occs = picked.slice();
      if (v.children) for (const o of picked) for (const c of M.occSubtree(dlg.baseState, o)) if (!occs.includes(c)) occs.push(c);
      const T0 = F.occT(dlg.baseState, occs[0]), rel = {};
      for (const o of occs) rel[o] = X.mul(X.inv(T0), F.occT(dlg.baseState, o));
      return { type: "rigidgroup", occs, picked, children: !!v.children, rel, ...(f0 ? {} : { name: nextName(app, "Rigid Group") }) };
    },
  });
}

// ------------------------------------------------------------------ Motion Link
const dofOptions = (J) => (S.DOFS[J.jointType] || []).map((k) => ({ value: k, label: S.DOF_LABEL[k] }));
export function openMotionLink(app, opts = {}) {
  const editId = opts.editId || null, f0 = editId ? app.feature(editId) : null;
  const J = (dlg, i) => { const r = (dlg.values.joints || [])[i]; return r && dlg.baseState.joints ? dlg.baseState.joints.get(r.id) : null; };
  const dofOf = (dlg, i) => { const j = J(dlg, i); if (!j) return null; const ks = S.DOFS[j.jointType] || []; const v = dlg.values[`dof${i + 1}`]; return ks.includes(v) ? v : ks[0]; };
  const amountKind = (dlg, i) => (S.isRot(dofOf(dlg, i) || "rot") ? "angle" : "length");
  const U = app.ui.dialog;
  return U.open({
    id: "FusionMotionRelationshipCommand", title: "Motion Link", icon: "FusionMotionRelationshipCommand", editId, featureLabel: "Motion Link",
    help: "Links the motion of two joints together.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "feature"),
    labelWidth: 96,
    rows: [
      { id: "joints", type: "selection", label: "Joints", kinds: ["feature"], max: 2, prompt: "Select two joints", advance: false,
        filter: (r, dlg) => { const j = dlg.baseState.joints && dlg.baseState.joints.get(r.id); return !!j && (S.DOFS[j.jointType] || []).length > 0; } },
      { id: "dof1", type: "dropdown", label: "Motion", options: [{ value: "rot", label: "Rotation" }, { value: "slide", label: "Distance" }, { value: "slide2", label: "Distance 2" }, { value: "pitch", label: "Pitch" }, { value: "yaw", label: "Yaw" }, { value: "roll", label: "Roll" }], default: "rot",
        visible: (v, dlg) => { const j = J(dlg, 0); return !!j && (S.DOFS[j.jointType] || []).length > 1; } },
      { id: "amount1", type: "value", label: "Angle", kind: "none", default: "90.0 deg", labelFn: (v, dlg) => (amountKind(dlg, 0) === "angle" ? "Angle" : "Distance"), visible: (v, dlg) => !!J(dlg, 0) },
      { id: "dof2", type: "dropdown", label: "Motion", options: [{ value: "rot", label: "Rotation" }, { value: "slide", label: "Distance" }, { value: "slide2", label: "Distance 2" }, { value: "pitch", label: "Pitch" }, { value: "yaw", label: "Yaw" }, { value: "roll", label: "Roll" }], default: "rot",
        visible: (v, dlg) => { const j = J(dlg, 1); return !!j && (S.DOFS[j.jointType] || []).length > 1; } },
      { id: "amount2", type: "value", label: "Distance", kind: "none", default: "10.00 mm", labelFn: (v, dlg) => (amountKind(dlg, 1) === "angle" ? "Angle" : "Distance"), visible: (v, dlg) => !!J(dlg, 1) },
      { id: "reverse", type: "check", label: "Reverse", default: false, visible: (v, dlg) => !!J(dlg, 1) },
      animateRow("animate", (dlg, done) => {
        const id = dlg.previewFeature && dlg.previewFeature.id, f = dlg.previewFeature;
        if (!id || !f) { done(); return; }
        if (!MO.animateLive(app, f.joint1, { done })) done();
      }, { visible: (v, dlg) => !!J(dlg, 1) }),
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, { joints: [f0.joint1, f0.joint2].map((id) => ({ kind: "feature", id })), dof1: f0.dof1, dof2: f0.dof2, reverse: !!f0.reverse });
      dlg.values.amount1 = f0.expr1 || U.fmt(f0.amount1, S.isRot(f0.dof1) ? "angle" : "length");
      dlg.values.amount2 = f0.expr2 || U.fmt(f0.amount2, S.isRot(f0.dof2) ? "angle" : "length");
    },
    onChange(id, dlg) {
      // the amount fields follow the motion that they measure
      if (id !== "joints" && id !== "dof1" && id !== "dof2") return;
      for (const i of [0, 1]) {
        const k = `amount${i + 1}`, want = amountKind(dlg, i), cur = String(dlg.values[k] || "");
        const isAng = /deg|rad/.test(cur);
        if (J(dlg, i) && (want === "angle") !== isAng && !dlg.touched.has(k)) dlg.set(k, want === "angle" ? "90.0 deg" : "10.00 mm", { noPreview: true });
      }
    },
    build(v, dlg) {
      const js = v.joints || [];
      if (js.length < 2) return null;
      const a1 = dlg.num("amount1"), a2 = dlg.num("amount2");
      if (!Number.isFinite(a1) || !Number.isFinite(a2)) return null;
      return { type: "motionlink", joint1: js[0].id, dof1: dofOf(dlg, 0), amount1: a1, expr1: v.amount1, joint2: js[1].id, dof2: dofOf(dlg, 1), amount2: a2, expr2: v.amount2, reverse: !!v.reverse, ...(f0 ? {} : { name: nextName(app, "Motion Link") }) };
    },
    onClose: closeAnim,
  });
}

// ------------------------------------------------------------------ Drive Joints
export function openDriveJoints(app, opts = {}) {
  const U = app.ui.dialog;
  const pre = (opts.preselect || []).filter((r) => r.kind === "feature" && isFeat(app, r.id, JOINT_KINDS));
  const jointOf = (dlg) => { const r = (dlg.values.joint || [])[0]; return r && app.result.state.joints ? app.result.state.joints.get(r.id) : null; };
  const has = (k) => (v, dlg) => { const j = jointOf(dlg); return !!j && (S.DOFS[j.jointType] || []).includes(k); };
  const valRows = ["rot", "slide", "slide2", "pitch", "yaw", "roll"].map((k) => ({ id: k, type: "value", label: S.DOF_LABEL[k], kind: S.isRot(k) ? "angle" : "length", default: S.isRot(k) ? "0.0 deg" : "0.00 mm", visible: has(k) }));
  const over = (dlg) => {
    const j = jointOf(dlg);
    if (!j) return null;
    const d = {};
    for (const k of S.DOFS[j.jointType] || []) { const n = dlg.num(k); d[k] = Number.isFinite(n) ? n : 0; }
    return new Map([[j.id, d]]);
  };
  const show = (dlg) => { const o = over(dlg); if (!o) { MO.clearPoses(app); return; } const r = S.solve(F.liveModel(app), o); MO.showPoses(app, r.T, null); };
  return U.open({
    id: "FusionMoveJointsCommand", title: "Drive Joints", icon: "FusionMoveJointsCommand", featureLabel: "Drive Joints",
    help: "Sets a joint to a chosen angle or distance.",
    preselect: pre, preview: false, noFeature: true,
    rows: [
      { id: "joint", type: "selection", label: "Joint", kinds: ["feature"], max: 1, prompt: "Select a joint to drive",
        filter: (r) => { const j = app.result.state.joints && app.result.state.joints.get(r.id); return !!j && (S.DOFS[j.jointType] || []).length > 0; } },
      ...valRows,
    ],
    onChange(id, dlg) {
      if (id === "joint") {
        const j = jointOf(dlg), f = j && app.feature(j.id);
        if (j) for (const k of S.DOFS[j.jointType] || []) dlg.set(k, U.fmt(Number((f && f.drive && f.drive[k]) || 0), S.isRot(k) ? "angle" : "length"), { noPreview: true });
      }
      try { show(dlg); } catch (e) { console.warn("[assembly] drive", e); }
    },
    onOpen(dlg) { if ((dlg.values.joint || []).length) dlg.spec.onChange("joint", dlg); },
    validate(dlg) { return jointOf(dlg) ? null : "Select a joint to drive"; },
    commit(_f, dlg) {
      const o = over(dlg);
      MO.clearPoses(app);
      if (!o) return false;
      // limits clamp the stored value like the solver does
      const j = jointOf(dlg), d = o.get(j.id);
      for (const k in d) d[k] = S.clamp(j, k, d[k]);
      return MO.commitDrives(app, o, "Drive Joints");
    },
    onClose() { MO.clearPoses(app); },
  });
}

// ------------------------------------------------------------------ Edit Joint Limits
export function openJointLimits(app, jointId) {
  const f0 = app.feature(jointId);
  if (!f0 || !JOINT_KINDS.includes(f0.type)) return null;
  const U = app.ui.dialog;
  const dofs = S.DOFS[f0.jointType] || [];
  if (!dofs.length) { app.toast("A rigid joint has no motion to limit.", "info"); return null; }
  const lim = f0.limits || {};
  const rows = [{ id: "motion", type: "dropdown", label: "Motion", options: dofs.map((k) => ({ value: k, label: S.DOF_LABEL[k] })), default: dofs[0], visible: () => dofs.length > 1 }];
  const values = {};
  for (const k of dofs) {
    const kind = S.isRot(k) ? "angle" : "length", on = (v) => dofs.length === 1 || v.motion === k, l = lim[k] || {};
    for (const [w, label] of [["min", "Minimum"], ["max", "Maximum"], ["rest", "Rest"]]) {
      rows.push({ id: `${w}On_${k}`, type: "check", label, default: !!l[`${w}On`], visible: on });
      rows.push({ id: `${w}_${k}`, type: "value", label: `${label} Value`, kind, visible: (v) => on(v) && v[`${w}On_${k}`] });
      values[`${w}_${k}`] = U.fmt(Number.isFinite(l[w]) ? l[w] : 0, kind);
    }
  }
  const read = (dlg) => {
    const out = {};
    for (const k of dofs) {
      const o = {};
      for (const w of ["min", "max", "rest"]) { if (dlg.values[`${w}On_${k}`]) o[`${w}On`] = true; const n = dlg.num(`${w}_${k}`); if (Number.isFinite(n)) o[w] = n; }
      if (o.minOn || o.maxOn || o.restOn) out[k] = o;
    }
    return out;
  };
  rows.push(animateRow("animate", (dlg, done) => {
    const model = F.liveModel(app), J = model.joints.find((j) => j.id === jointId);
    if (!J) { done(); return; }
    J.limits = read(dlg);
    if (!MO.animateJoint(app, model, jointId, { done })) done();
  }));
  return U.open({
    id: "EditJointLimits", title: "Edit Joint Limits", icon: "JointAssembleCmdNew", featureLabel: "Edit Joint Limits",
    help: "Sets the minimum, maximum and rest positions of a joint motion.", preview: false, noFeature: true, rows, values,
    validate(dlg) {
      const l = read(dlg);
      for (const k in l) if (l[k].minOn && l[k].maxOn && l[k].min > l[k].max) return "The minimum must be smaller than the maximum";
      return null;
    },
    commit(_f, dlg) {
      const l = read(dlg);
      return app.mutate("Edit Joint Limits", (doc) => { const f = doc.features.find((x) => x.id === jointId); if (!f) return; if (Object.keys(l).length) f.limits = l; else delete f.limits; });
    },
    onClose: closeAnim,
  });
}

// ------------------------------------------------------------------ New Contact Set
export function openContactSet(app, opts = {}) {
  const editIdx = opts.editSet || null;
  const s0 = editIdx ? (app.doc.contactSets || []).find((s) => s.id === editIdx) : null;
  return app.ui.dialog.open({
    id: "ContactSetCmd", title: "Contact Set", icon: "ContactSetCmd", featureLabel: "Contact Set",
    help: "Groups components that should collide with each other.", preview: false, noFeature: true,
    preselect: (opts.preselect || []).filter((r) => OCC_KINDS.includes(r.kind)),
    rows: [{ id: "comps", type: "selection", label: "Components", kinds: OCC_KINDS, max: 0, min: 2, prompt: "Select the components of the contact set", advance: false, mapRef: toOcc }],
    init(dlg) { if (s0) dlg.values.comps = s0.occs.map((o) => ({ kind: "occurrence", occ: o })); },
    validate(dlg) { return new Set((dlg.values.comps || []).map((r) => r.occ)).size < 2 ? "Select at least two components" : null; },
    commit(_f, dlg) {
      const occs = [...new Set((dlg.values.comps || []).map((r) => r.occ))];
      return app.mutate(s0 ? "Edit Contact Set" : "New Contact Set", (doc) => {
        doc.contactSets = (doc.contactSets || []).slice();
        if (s0) { const s = doc.contactSets.find((x) => x.id === s0.id); if (s) s.occs = occs; return s; }
        doc.counters.contactSet = (doc.counters.contactSet || 0) + 1;
        const s = { id: `cs${doc.counters.contactSet}`, name: `Contact Set${doc.counters.contactSet}`, occs };
        doc.contactSets.push(s);
        // a new contact set turns contact sets on (Fusion)
        if (!doc.contact || doc.contact.mode !== "all") doc.contact = { mode: "sets" };
        return s;
      });
    },
    afterCommit() { try { app.ui.browser.invalidate(); } catch { /* ignore */ } },
  });
}

// ------------------------------------------------------------------ Component constraints
const CTYPES = [
  { value: "align", label: "Align", cmd: "AlignConstraintCmd" },
  { value: "angle", label: "Angle", cmd: "AngleConstraintCmd" },
  { value: "center", label: "Center", cmd: "MidplaneConstraintCmd" },
  { value: "tangent", label: "Tangent", cmd: "TangentConstraintCmd" },
];
const CT_HELP = {
  align: "Aligns selected geometry so they are flush, coincident, or concentric to create an Align Constraint relationship between two components.",
  angle: "Positions selected geometry with a relative angle them to create an Angle Constraint relationship between two components.",
  center: "Positions one component between two faces of another component to create a Center Constraint between them.",
  tangent: "Constrains two components so one selection from the first component maintains tangency with geometry on a second component to create a Tangent Constraint.",
};
/** The joint type that an Align constraint between two snaps becomes (flush planes, concentric axes, coincident points). */
function alignType(s1, s2) {
  const k = (s) => (s.kind === "plane" ? "plane" : s.kind === "axis" || s.kind === "line" ? "axis" : "point");
  const a = k(s1), b = k(s2);
  if (a === "plane" && b === "plane") return "planar";
  if (a === "axis" && b === "axis") return "cylindrical";
  if (a === "point" && b === "point") return "ball";
  throw new Error("Select two planar faces, two axes or cylinders, or two points");
}
const ctypeOf = (f) => f.ctype || "align";
export function openConstraint(app, opts = {}) {
  const editId = opts.editId || null, f0 = editId ? app.feature(editId) : null;
  const ctype0 = f0 ? ctypeOf(f0) : opts.ctype || "align";
  const cmd = opts.cmd || (f0 ? (CTYPES.find((c) => c.value === ctype0) || {}).cmd : "AssemblyMateCommand") || "AssemblyMateCommand";
  const title = cmd === "AssemblyMateCommand" ? "Constrain Components" : `${CTYPES.find((c) => c.value === ctype0).label} Constraint`;
  const isC = (t) => (v) => v.ctype === t;
  const faceOf = (dlg, r) => { try { return F.snapOf(dlg.baseState, r); } catch { return null; } };
  return app.ui.dialog.open({
    id: cmd, title, icon: cmd, editId, featureLabel: title === "Constrain Components" ? "Constraint" : title,
    help: CT_HELP[ctype0] || "Positions components relative to each other with assembly constraints.",
    preselect: (opts.preselect || []).filter((r) => ["face", "edge", "vertex"].includes(r.kind)),
    labelWidth: 100,
    rows: [
      { id: "ctype", type: "dropdown", label: "Type", options: CTYPES.map((c) => ({ value: c.value, label: c.label })), default: ctype0 },
      { id: "sel1", type: "selection", label: "Component 1", kinds: ["face", "edge", "vertex"], max: 1, prompt: "Select geometry on the component that moves",
        filter: (r, dlg) => { const v = dlg.values; if (v.ctype === "tangent") { const s = faceOf(dlg, r); return !!s && r.kind === "face" && Number(s.r) > 0; } if (v.ctype === "angle") { const s = faceOf(dlg, r); return !!s && (s.kind === "plane" || s.kind === "line" || s.kind === "axis"); } return true; },
        labelFn: (v) => (v.ctype === "center" ? "Center" : "Component 1"), visible: (v) => v.ctype !== "center" },
      { id: "csel1", type: "selection", label: "Faces 1", kinds: ["face"], planar: true, max: 2, prompt: "Select one or two faces of the component to center", visible: isC("center"), advance: false },
      { id: "sel2", type: "selection", label: "Component 2", kinds: ["face", "edge", "vertex"], max: 1, prompt: "Select geometry on the other component",
        filter: (r, dlg) => { const v = dlg.values; if (v.ctype === "tangent" || v.ctype === "angle") { const s = faceOf(dlg, r); return !!s && (v.ctype === "tangent" ? s.kind === "plane" : s.kind === "plane" || s.kind === "line" || s.kind === "axis"); } return true; },
        visible: (v) => v.ctype !== "center" },
      { id: "csel2", type: "selection", label: "Faces 2", kinds: ["face"], planar: true, max: 2, min: 2, prompt: "Select the two faces to center between", visible: isC("center"), advance: false },
      { id: "offset", type: "value", label: "Offset", kind: "length", default: "0.00 mm", visible: isC("align") },
      { id: "angle", type: "value", label: "Angle", kind: "angle", default: "90.0 deg", visible: isC("angle") },
      { id: "flip", type: "check", label: "Flip", default: false, visible: (v) => v.ctype !== "center" },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState, lr = (r) => liveRef(st, r);
      dlg.values.ctype = ctype0;
      dlg.values.flip = !!f0.flip;
      if (ctype0 === "center") {
        dlg.values.csel1 = [f0.ref1, ...(f0.refs || []).slice(1, 2)].map(lr).filter(Boolean);
        dlg.values.csel2 = [f0.ref2, (f0.refs || [])[0]].map(lr).filter(Boolean);
      } else { dlg.values.sel1 = [lr(f0.ref1)].filter(Boolean); dlg.values.sel2 = [lr(f0.ref2)].filter(Boolean); }
      if (f0.offZ !== undefined) dlg.values.offset = String(f0.offZ);
      if (f0.angle !== undefined) dlg.values.angle = String(f0.angle);
    },
    build(v, dlg) {
      const st = dlg.baseState;
      const base = { type: "constraint", ctype: v.ctype, ...(f0 ? {} : { name: nextName(app, `${CTYPES.find((c) => c.value === v.ctype).label}`) }) };
      if (v.flip) base.flip = true;
      if (v.ctype === "center") {
        const a = v.csel1 || [], b = v.csel2 || [];
        if (!a.length || b.length < 2) return null;
        const sa = a.map((r) => F.snapOf(st, r)), sb = b.map((r) => F.snapOf(st, r));
        if (sa.some((s) => s.owner !== sa[0].owner) || sb[1].owner !== sb[0].owner) throw new Error("The faces of each side must belong to one component");
        const [n1, n2] = F.liftNodes(st, sa[0].owner, sb[0].owner);
        const L1 = X.inv(F.occT(st, n1)), L2 = X.inv(F.occT(st, n2));
        return { ...base, jointType: "center", occ1: n1, occ2: n2, ref1: storeRef(a[0]), ref2: storeRef(b[0]), refs: [storeRef(b[1]), ...(a[1] ? [storeRef(a[1])] : [])],
          frame1: X.mul(L1, sa[0].F), frame2: X.mul(L2, sb[0].F), frame3: X.mul(L2, sb[1].F), ...(sa[1] ? { frame4: X.mul(L1, sa[1].F) } : {}) };
      }
      const r1 = (v.sel1 || [])[0], r2 = (v.sel2 || [])[0];
      if (!r1 || !r2) return null;
      const fr = F.jointFrames(st, r1, r2);
      const f = { ...base, occ1: fr.occ1, occ2: fr.occ2, ref1: storeRef(r1), ref2: storeRef(r2), frame1: fr.frame1, frame2: fr.frame2 };
      if (v.ctype === "angle") return { ...f, jointType: "angle", angle: v.angle };
      if (v.ctype === "tangent") return { ...f, jointType: "tangent", radius: Number(fr.s1.r) || 0, ...(fr.s1.kind === "point" ? { sphere: true } : {}) };
      // Align: a planar, cylindrical or ball joint that starts as close to the current position as it can
      const jt = alignType(fr.s1, fr.s2);
      const off = dlg.num("offset");
      const J = { id: "tmp", jointType: jt, a: fr.occ1, b: fr.occ2, FA: fr.frame1, FB: fr.frame2, off: { x: 0, y: 0, z: Number.isFinite(off) ? off : 0, angle: 0, flip: !!v.flip }, rotAxis: "z", slideAxis: "z", drive: {} };
      return { ...f, jointType: jt, offZ: v.offset, rotAxis: "z", drive: F.nearestDrive(J, F.occT(st, fr.occ1), F.occT(st, fr.occ2)) };
    },
  });
}
