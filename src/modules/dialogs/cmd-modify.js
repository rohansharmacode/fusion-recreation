// Fillet, Chamfer, Shell, Draft, Combine, Move/Copy, Delete.
import * as U from "./util.js";
import { prepareFeature } from "../../app/core.js";
import { g } from "./glyphs.js";
import { faceEdges, faceRefsOf, toBodyRef, beginModelCommand, edgeStatus } from "./common.js";

const V = U.V;

// ------------------------------------------------------------------ edge features
/** Arrow for a fillet/chamfer value at the first selected edge (pointing into the material). */
function edgeValueManip(dlg, field, kind) {
  const e = (dlg.values.edges || [])[0];
  if (!e) return null;
  const b = dlg.baseState.bodies.get(e.body);
  if (!b) return null;
  let p = e.p;
  try { p = dlg.app.K.edgeMid(b.shape.edges[e.index]); } catch { /* keep */ }
  const ns = U.edgeFaceNormals(b.shape, e.index, p);
  if (ns.length < 2) return null;
  const s = V.add(ns[0], ns[1]);
  if (V.len(s) < 1e-6) return null;
  const inward = V.mul(V.norm(s), -1);
  const cb = Math.max(-1, Math.min(1, V.dot(ns[0], ns[1])));
  const beta = Math.acos(cb);
  const scale = kind === "fillet" ? Math.max(0.2, 1 / Math.cos(beta / 2) - 1) : Math.max(0.2, Math.cos((Math.PI - beta) / 2));
  return dlg.valueManip(field, { origin: p, dir: inward, scale, min: 0, fixedDir: true });
}

function edgeRefsFromFeature(st, f) {
  return (f.edges || []).map((er) => U.edgeRef(st, er.body, er.p));
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const edgeCount = (n) => (n === 1 ? "1 Edge" : `${n} Edges`);

/**
 * Fusion's fillet selection-set table: "1 Edge | (icon) 0.00 mm | 0.00 mm (grey) | (icon) Tangent (G1)"
 * with + / x below. One set is supported (the model has one radius per fillet feature).
 */
function setTable(dlg, valueField, opts) {
  const wrap = document.createElement("div");
  wrap.className = "dlg-sets";
  wrap.innerHTML = `<div class="dlg-sets-table"><div class="dlg-set-row current" data-set="0">
      <span class="dlg-set-count"></span>
      <span class="dlg-set-cell dlg-set-radius"><span class="dlg-dd-icon">${g(opts.icon)}</span></span>
      <span class="dlg-set-cell dim">${esc(opts.second || "")}</span>
      <span class="dlg-set-cell" title="${esc(opts.cont)}"><span class="dlg-dd-icon">${g(opts.contIcon)}</span><span class="dlg-set-cont">${esc(opts.cont)}</span></span>
    </div></div>
    <div class="dlg-sets-tools"><button type="button" class="dlg-hbtn dlg-set-add" title="Add a selection set (one set is available in this recreation)">${g("addSet")}</button><button type="button" class="dlg-hbtn dlg-set-remove" title="Remove the selection set">${g("removeSet")}</button></div>`;
  const inp = dlg.embedInput(valueField, "dlg-input");
  wrap.querySelector(".dlg-set-radius").appendChild(inp);
  wrap.querySelector(".dlg-set-remove").addEventListener("click", () => { dlg.setSelection("edges", []); dlg.activate("edges"); });
  wrap.querySelector(".dlg-set-add").addEventListener("click", () => {
    if ((dlg.values.edges || []).length) dlg.app.toast("Additional selection sets are not available in this recreation: one radius per Fillet feature", "info", 2600);
    dlg.activate("edges");
  });
  return wrap;
}
function updateSetTable(el, dlg) {
  const n = (dlg.values.edges || []).length;
  el.querySelector(".dlg-set-count").textContent = edgeCount(n);
  el.querySelector(".dlg-set-remove").disabled = n === 0;
}

export function openFillet(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "FusionFilletEdgesCommand",
    title: "Fillet",
    icon: "FusionFilletEdgesCommand",
    featureLabel: "Fillet",
    editId,
    help: "Rounds edges based on selected edges, faces, or features.",
    preselect: opts.preselect,
    labelWidth: 134,
    ctrlWidth: 255,
    rows: [
      { id: "type", type: "dropdown", label: "Type", options: [{ value: "fillet", label: "Fillet", icon: "filletType" }, { value: "rule", label: "Rule Fillet", icon: "filletType", disabled: true }, { value: "fullRound", label: "Full Round Fillet", icon: "filletType", disabled: true }] },
      { id: "radius", type: "value", embed: true, label: "Radius", kind: "length", default: "0.00 mm", nonNegative: true, tooltip: "Specify the radius value" },
      { id: "sets", type: "custom", render: (dlg) => setTable(dlg, "radius", { icon: "constant", second: "0.00 mm", contIcon: "tangentG1", cont: "Tangent (G1)" }), update: updateSetTable },
      { id: "radiusType", type: "dropdown", label: "Radius Type", options: [{ value: "constant", label: "Constant", icon: "constant" }, { value: "chord", label: "Chord Length", icon: "chordLength", disabled: true }, { value: "variable", label: "Variable", icon: "constant", disabled: true }] },
      { id: "edges", type: "selection", label: "Edges/Faces/Features", kinds: ["edge", "face"], prompt: "Select edges, faces, or features to fillet", mapRef: (r, dlg) => faceEdges(dlg, r), tooltip: "Select edges, faces, or features to create fillets.", selText: () => "Select", clearButton: false },
      { id: "tangentChain", type: "check", label: "Tangent Chain", default: true, tooltip: "Automatically select tangent geometry." },
      { id: "tangencyWeight", type: "value", label: "Tangency Weight", kind: "none", default: "1.00", positive: true, tooltip: "Increase or decrease scale of tangency weight." },
      { id: "cornerType", type: "dropdown", label: "Corner Type", options: [{ value: "rolling", label: "Rolling Ball", icon: "rollingBall" }, { value: "setback", label: "Setback", icon: "setback", disabled: true }], sep: true, tooltip: "Rolling ball and setback corner types." },
    ],
    init(dlg) {
      if (f0) Object.assign(dlg.values, { edges: edgeRefsFromFeature(dlg.baseState, f0), radius: f0.radius ?? "1 mm", tangentChain: f0.tangentChain !== false });
    },
    prompt(dlg) { return (dlg.values.edges || []).length ? (dlg.manips.drag ? "" : "Specify fillet radius") : "Select edges, faces, or features to fillet"; },
    status: (dlg) => edgeStatus(dlg.values.edges),
    validate(dlg) { return (dlg.num("radius") || 0) <= 1e-9 ? "Radius is zero" : null; },
    build(v, dlg) {
      if (!(v.edges || []).length) return null;
      if (!((dlg.num("radius") || 0) > 1e-9)) return null;
      return { type: "fillet", edges: v.edges.map((r) => ({ body: r.body, p: r.p })), radius: v.radius, tangentChain: !!v.tangentChain };
    },
    manipulators(dlg) { return [edgeValueManip(dlg, "radius", "fillet")].filter(Boolean); },
  });
}

export function openChamfer(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "FusionChamferCommand",
    title: "Chamfer",
    icon: "FusionChamferCommand",
    editId,
    help: "Bevels the edges of a solid or surface body by removing material from exterior edges or adding material to interior edges.",
    preselect: opts.preselect,
    labelWidth: 134,
    ctrlWidth: 255,
    rows: [
      { id: "type", type: "dropdown", label: "Type", options: [{ value: "chamfer", label: "Chamfer", icon: "chamferType" }, { value: "partial", label: "Partial Chamfer", icon: "chamferType", disabled: true }] },
      { id: "distance", type: "value", embed: true, label: "Distance", kind: "length", default: "0.00 mm", nonNegative: true },
      { id: "sets", type: "custom", render: (dlg) => setTable(dlg, "distance", { icon: "equalDistance", second: "", contIcon: "equalDistance", cont: "Equal distance" }), update: updateSetTable },
      { id: "chamferType", type: "dropdown", label: "Chamfer Type", options: [{ value: "equal", label: "Equal distance", icon: "equalDistance" }, { value: "two", label: "Two distances", icon: "twoDistances", disabled: true }, { value: "angle", label: "Distance and angle", icon: "distanceAngle", disabled: true }] },
      { id: "edges", type: "selection", label: "Edges/Faces/Features", kinds: ["edge", "face"], prompt: "Select edges, faces, or features to chamfer", mapRef: (r, dlg) => faceEdges(dlg, r), selText: () => "Select", clearButton: false },
      { id: "tangentChain", type: "check", label: "Tangent Chain", default: true },
      { id: "cornerType", type: "dropdown", label: "Corner Type", options: [{ value: "chamfer", label: "Chamfer", icon: "chamferType" }, { value: "setback", label: "Setback", icon: "setback", disabled: true }], sep: true },
    ],
    init(dlg) {
      if (f0) Object.assign(dlg.values, { edges: edgeRefsFromFeature(dlg.baseState, f0), distance: f0.distance ?? "1 mm", tangentChain: f0.tangentChain !== false });
    },
    prompt(dlg) { return (dlg.values.edges || []).length ? (dlg.manips.drag ? "" : "Specify chamfer distance") : "Select edges, faces, or features to chamfer"; },
    status: (dlg) => edgeStatus(dlg.values.edges),
    validate(dlg) { return (dlg.num("distance") || 0) <= 1e-9 ? "Distance is zero" : null; },
    build(v, dlg) {
      if (!(v.edges || []).length) return null;
      if (!((dlg.num("distance") || 0) > 1e-9)) return null;
      return { type: "chamfer", edges: v.edges.map((r) => ({ body: r.body, p: r.p })), distance: v.distance, tangentChain: !!v.tangentChain };
    },
    manipulators(dlg) { return [edgeValueManip(dlg, "distance", "chamfer")].filter(Boolean); },
  });
}

// ------------------------------------------------------------------ Shell
export function openShell(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "FusionShellBodyCommand",
    title: "Shell",
    icon: "FusionShellBodyCommand",
    editId,
    help: "Removes material from the interior of a solid body to create a hollow body with walls of the specified thickness.",
    preselect: opts.preselect,
    ctrlWidth: 118,
    rows: [
      { id: "faces", type: "selection", label: "Faces/Body", kinds: ["face"], prompt: "Select faces to remove or body to shell" },
      { id: "tangentChain", type: "check", label: "Tangent Chain", default: true },
      { id: "thickness", type: "value", label: "Inside Thickness", labelFn: (v) => (v.direction === "outside" ? "Outside Thickness" : "Inside Thickness"), kind: "length", default: "1.00 mm", positive: true },
      { id: "direction", type: "dropdown", label: "Direction", options: [{ value: "inside", label: "Inside", icon: "inside" }, { value: "outside", label: "Outside", icon: "outside" }, { value: "both", label: "Both", icon: "both", disabled: true }] },
      { id: "shellType", type: "dropdown", label: "Shell Type", options: [{ value: "sharp", label: "Sharp", icon: "sharpShell" }, { value: "rounded", label: "Rounded", icon: "roundedShell", disabled: true }], sep: true },
    ],
    init(dlg) {
      if (f0) Object.assign(dlg.values, { faces: (f0.faces || []).map((fr) => U.faceRef(dlg.baseState, fr.body, fr.p, fr.n)), thickness: f0.thickness ?? "1 mm", direction: f0.direction === "outside" ? "outside" : "inside" });
    },
    prompt(dlg) { return (dlg.values.faces || []).length ? "" : "Select faces to remove or body to shell"; },
    status: (dlg) => { const n = (dlg.values.faces || []).length; return n ? (n === 1 ? "Face" : `${n} Faces`) : ""; },
    build(v) {
      const faces = faceRefsOf(v.faces);
      if (!faces.length) return null;
      return { type: "shell", faces, bodies: [], thickness: v.thickness, direction: v.direction === "outside" ? "outside" : "inside" };
    },
    manipulators(dlg) {
      const f = (dlg.values.faces || [])[0];
      if (!f) return [];
      const sgn = dlg.values.direction === "outside" ? 1 : -1;
      return [dlg.valueManip("thickness", { origin: f.p, dir: V.mul(f.n, sgn), min: 0.01, fixedDir: true })].filter(Boolean);
    },
  });
}

// ------------------------------------------------------------------ Draft
export function openDraft(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "FusionDraftCommand",
    title: "Draft",
    icon: "FusionDraftCommand",
    editId,
    help: "Applies a fixed or parting line draft angle to planar faces.",
    preselect: opts.preselect,
    ctrlWidth: 118,
    rows: [
      { id: "type", type: "dropdown", label: "Type", options: [{ value: "fixed", label: "Fixed Plane", icon: "fixedPlane" }, { value: "parting", label: "Parting Line", icon: "partingLine", disabled: true }] },
      { id: "plane", type: "selection", label: "Pull Direction", kinds: ["originPlane", "cplane", "face"], planar: true, max: 1, prompt: "Select a plane that defines the pull direction" },
      { id: "faces", type: "selection", label: "Faces", kinds: ["face"], planar: true, prompt: "Select faces to draft" },
      { id: "tangentChain", type: "check", label: "Tangent Chain", default: true },
      { id: "dirType", type: "dropdown", label: "Direction", options: [{ value: "one", label: "One Side", icon: "oneSide" }, { value: "two", label: "Two Sides", icon: "twoSides", disabled: true }, { value: "sym", label: "Symmetric", icon: "symmetric", disabled: true }] },
      { id: "angle", type: "value", label: "Angle", kind: "angle", default: "5.0 deg" },
    ],
    init(dlg) {
      if (f0) Object.assign(dlg.values, { plane: [U.refFromPlaneRef(f0.plane, dlg.baseState)].filter(Boolean), faces: (f0.faces || []).map((fr) => U.faceRef(dlg.baseState, fr.body, fr.p, fr.n)), angle: f0.angle ?? "5.0 deg" });
    },
    build(v) {
      const plane = U.planeRefFromRef((v.plane || [])[0]);
      const faces = faceRefsOf(v.faces);
      if (!plane || !faces.length) return null;
      return { type: "draft", plane, faces, angle: v.angle };
    },
  });
}

// ------------------------------------------------------------------ Combine
export function openCombine(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const pre = (opts.preselect || []).map(toBodyRef).filter(Boolean);
  return app.ui.dialog.open({
    id: "FusionCombineCommand",
    title: "Combine",
    icon: "FusionCombineCommand",
    editId,
    help: "Joins, cuts, or intersects two or more solid bodies to create a single solid body.",
    preselect: pre,
    ctrlWidth: 118,
    rows: [
      { id: "target", type: "selection", label: "Target Body", kinds: ["body", "face"], max: 1, mapRef: toBodyRef, prompt: "Select target body" },
      { id: "tools", type: "selection", label: "Tool Bodies", kinds: ["body", "face"], mapRef: toBodyRef, prompt: "Select tool bodies", filter: (r, dlg) => !(dlg.values.target || []).some((t) => t.body === r.body) },
      { id: "operation", type: "dropdown", label: "Operation", options: [{ value: "join", label: "Join", icon: "join" }, { value: "cut", label: "Cut", icon: "cut" }, { value: "intersect", label: "Intersect", icon: "intersect" }], sep: true },
      { id: "newComponent", type: "check", label: "New Component", enabled: () => false },
      { id: "keepTools", type: "check", label: "Keep Tools" },
    ],
    init(dlg) {
      if (f0) Object.assign(dlg.values, { target: f0.target ? [{ kind: "body", body: f0.target }] : [], tools: (f0.tools || []).map((b) => ({ kind: "body", body: b })), operation: f0.operation || "join", keepTools: !!f0.keepTools });
    },
    build(v) {
      const target = (v.target || [])[0];
      const tools = (v.tools || []).map((r) => r.body).filter((b) => target && b !== target.body);
      if (!target || !tools.length) return null;
      return { type: "combine", target: target.body, tools, operation: v.operation, keepTools: !!v.keepTools };
    },
  });
}

// ------------------------------------------------------------------ Move / Copy
const bodiesCenter = U.bodiesCenter;

// Fusion's Move/Copy triad: axis-coloured X/Y/Z arrows, planar square handles between the axes,
// rotation ring segments and a free-move ball, all at the moved bodies' centre (they follow the move).
const AXIS_COL = [0xd8372c, 0x45a72c, 0x2d6fd6];
const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const T_FIELDS = ["tx", "ty", "tz"], R_FIELDS = ["rx", "ry", "rz"];

function moveTriad(dlg) {
  const v = dlg.values;
  const ids = (v.bodies || []).map((r) => r.body);
  const pivot = bodiesCenter(dlg.baseState, ids);
  if (!pivot) return [];
  const t = T_FIELDS.map((k) => (v.moveType === "rotate" ? 0 : dlg.num(k)));
  if (t.some((x) => !Number.isFinite(x))) return [];
  const c = V.add(pivot, t); // the model rotates about the pivot, then translates
  const vp = dlg.app.viewport;
  const out = [];
  if (v.moveType !== "rotate") {
    T_FIELDS.forEach((k, i) => {
      const m = dlg.valueManip(k, { origin: c, dir: AXES[i], fixedDir: true });
      if (!m) return;
      m.origin = V.sub(c, V.mul(AXES[i], m.value)); // arrow base = current centre
      Object.assign(m, { look: "axis", color: AXIS_COL[i], len: 120, gap: 11 });
      out.push(m);
    });
    // drag in a plane (two fields) or in the view plane (free move: all three)
    const planeDrag = (fields) => ({
      getStart: () => fields.map((k) => dlg.num(k) || 0),
      onDelta: (dv, final, start) => {
        const step = U.niceStep(2 * ((vp && vp.pixelSize && vp.pixelSize(c)) || 0.1));
        fields.forEach((k, j) => {
          const ax = AXES[T_FIELDS.indexOf(k)];
          const val = Math.round(((start ? start[j] : 0) + V.dot(dv, ax)) / step) * step;
          dlg.set(k, U.fmt(+val.toFixed(6), "length"), { user: true, delay: final ? 0 : 40, throttle: !final });
        });
        if (final) dlg.previewNow();
      },
    });
    const planes = [["pxy", 0, 1, 2], ["pyz", 1, 2, 0], ["pxz", 0, 2, 1]];
    for (const [id, a, b, nrm] of planes) {
      out.push({ id, type: "plane", value: 0, center: c, a: AXES[a], b: AXES[b], offPx: 32, color: AXIS_COL[nrm], box: false, ...planeDrag([T_FIELDS[a], T_FIELDS[b]]) });
    }
    if (v.moveType === "free") out.push({ id: "free", type: "plane", look: "ball", value: 0, center: c, box: false, ...planeDrag(T_FIELDS) });
  }
  if (v.moveType !== "translate") {
    // ring segment about each axis, its grip between the two other axes
    const refs = [[0, 1, 0], [0, 0, 1], [1, 0, 0]];
    R_FIELDS.forEach((k, i) => {
      const m = dlg.angleManip(k, { center: c, axis: AXES[i], ref: refs[i], radius: 1, min: -360, max: 360 });
      if (!m) return;
      Object.assign(m, { screenRadius: 80, span: 22, gripAt: 45, color: AXIS_COL[i], lineWidth: 2.4 });
      out.push(m);
    });
  }
  return out;
}

export function openMove(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const pre = (opts.preselect || []).map(toBodyRef).filter(Boolean);
  return app.ui.dialog.open({
    id: "FusionMoveCommand",
    title: "Move/Copy",
    icon: "FusionMoveCommand",
    featureLabel: "Move",
    editId,
    help: "Moves the selected face, body, sketch, or construction geometry a specified distance or angle.",
    preselect: pre,
    ctrlWidth: 130,
    rows: [
      { id: "objType", type: "buttons", label: "Move Object", options: [{ value: "components", label: "Components", icon: "components", disabled: true }, { value: "bodies", label: "Bodies", icon: "bodies" }, { value: "faces", label: "Faces", icon: "faces", disabled: true }], default: "bodies" },
      { id: "bodies", type: "selection", label: "Selection", kinds: ["body", "face"], meshBodies: true, mapRef: toBodyRef, prompt: "Select bodies to move" },
      { id: "moveType", type: "buttons", label: "Move Type", options: [{ value: "free", label: "Free Move", icon: "freeMove" }, { value: "translate", label: "Translate", icon: "translate" }, { value: "rotate", label: "Rotate", icon: "rotate" }], default: "free" },
      { id: "tx", type: "value", label: "X Distance", kind: "length", default: "0.00 mm", visible: (v) => v.moveType !== "rotate" },
      { id: "ty", type: "value", label: "Y Distance", kind: "length", default: "0.00 mm", visible: (v) => v.moveType !== "rotate" },
      { id: "tz", type: "value", label: "Z Distance", kind: "length", default: "0.00 mm", visible: (v) => v.moveType !== "rotate" },
      { id: "rx", type: "value", label: "X Angle", kind: "angle", default: "0.0 deg", visible: (v) => v.moveType !== "translate" },
      { id: "ry", type: "value", label: "Y Angle", kind: "angle", default: "0.0 deg", visible: (v) => v.moveType !== "translate" },
      { id: "rz", type: "value", label: "Z Angle", kind: "angle", default: "0.0 deg", visible: (v) => v.moveType !== "translate" },
      { id: "copy", type: "check", label: "Create Copy", sep: true },
    ],
    init(dlg) {
      if (f0) {
        Object.assign(dlg.values, { bodies: (f0.bodies || []).map((b) => ({ kind: "body", body: b })), copy: !!f0.copy });
        for (const k of ["tx", "ty", "tz", "rx", "ry", "rz"]) if (f0[k] !== undefined) dlg.values[k] = f0[k];
      }
    },
    status: (dlg) => { const n = (dlg.values.bodies || []).length; if (!n) return ""; if (n > 1) return `${n} Bodies`; const m = dlg.app.bodyMeta && dlg.app.bodyMeta(dlg.values.bodies[0].body); return (m && m.name) || "Body"; },
    build(v) {
      const bodies = (v.bodies || []).map((r) => r.body);
      if (!bodies.length) return null;
      const f = { type: "move", bodies, copy: !!v.copy };
      for (const k of ["tx", "ty", "tz"]) f[k] = v.moveType === "rotate" ? "0 mm" : v[k];
      for (const k of ["rx", "ry", "rz"]) f[k] = v.moveType === "translate" ? "0.0 deg" : v[k];
      return f;
    },
    manipulators: moveTriad,
  });
}

// ------------------------------------------------------------------ Delete
export function runDelete(app) {
  const items = [...app.selection.items];
  const bodies = new Set();
  const feats = new Set();
  for (const r of items) {
    if (r.kind === "body") bodies.add(r.body);
    else if (r.kind === "feature" || r.kind === "cplane") feats.add(r.id);
    else if (r.kind === "sketch") feats.add(r.id || r.sketch);
  }
  if (!bodies.size && !feats.size) return openDeleteDialog(app);
  deleteThings(app, [...bodies], [...feats]);
}

function deleteThings(app, bodies, feats) {
  app.mutate("Delete", (doc) => {
    for (const id of feats) {
      const i = doc.features.findIndex((x) => x.id === id);
      if (i < 0) continue;
      doc.features.splice(i, 1);
      if (doc.marker > i) doc.marker -= 1;
    }
    const live = bodies.filter((b) => app.result && (app.result.state.bodies.has(b) || !!(app.result.state.meshBodies && app.result.state.meshBodies.has(b))));
    if (live.length) {
      const nf = { type: "delete", bodies: live };
      prepareFeature(doc, nf);
      doc.features.splice(doc.marker, 0, nf);
      doc.marker += 1;
    }
  });
  app.selection.clear();
}

function openDeleteDialog(app) {
  return app.ui.dialog.open({
    id: "FusionDeleteCommand",
    title: "Delete",
    icon: "FusionDeleteCommand",
    help: "Deletes the selected bodies (adds a Delete feature to the timeline).",
    preview: false,
    noFeature: true,
    ctrlWidth: 118,
    rows: [{ id: "objects", type: "selection", label: "Objects", kinds: ["body", "face"], mapRef: toBodyRef, prompt: "Select bodies to delete" }],
    commit(f, dlg) {
      const ids = (dlg.values.objects || []).map((r) => r.body);
      if (ids.length) deleteThings(app, ids, []);
    },
  });
}

export { beginModelCommand };
