// pcb dialogs: Create 3D PCB, Derive PCB from Sketch, Create Linked PCB, Define Board (+ Edit Feature),
// Move Components, Flip Component, PCB Status and Imprint (copy the board outline into a sketch).
// Labels follow Fusion's NaPCBUI string table.
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import * as U from "../dialogs/util.js";
import { newSketch, addPoint, addLine, addCircle, addArc } from "../../sketch/sketch.js";
import { prepareFeature, clone } from "../../app/core.js";
import { profileRefsOf, profileSelRefs, profileStatus } from "../dialogs/common.js";
import { TYPE, DEFAULT_THICKNESS, DEFAULT_NPTH, NO_OUTLINE, hasOutline, currentFrame } from "./feature.js";
import { pcbEnv, activePcb, enterPcb, commitNewPcb, uniqueCompName, hideProfileSketches, BOARD_APPEARANCE } from "./env.js";

const V = K.V;
const MD = M.meshOps;
const ROOT = M.ROOT;
const POINT_KINDS = ["vertex", "sketchPoint", "cpoint"];
const AXIS_KINDS = ["sketchCurve", "edge", "originAxis"];
export const GRID = 1.27; // 2D PCB grid: 50 mil

export const TIPS = {
  PCBCreateCmd: "Creates a 3D PCB document from the selected sketch or face. Select a sketch or face, then select origin and axes orientation. You can convert circles into non-plated through holes (NPTHs).",
  PCBDeriveCmd: "Derives a new 3D PCB from a sketch profile. The PCB follows the sketch: updates to the sketch in the design reflect in the PCB. Select a sketch profile, then select the origin and axes orientation.",
  PCBExternalComponentCreationCmd: "Creates a new 3D PCB as a component with a board outline sketch. Select location, then complete a closed profile in the board outline sketch and use Define Board to finish defining the board.",
  PCBDefineBoardCmd: "Defines the PCB board outline and 2D coordinate system. Select one or more closed profiles, choose a point for the origin of the 2D coordinate system and an edge for the X axis.",
  PCBImprintCmd: "Copies the board outline of the PCB to a sketch. You can copy to a pre-existing sketch, or create a new sketch by selecting a planar face or construction plane.",
  PCBBoardSketchEditCmd: "Edits the primary sketch that defines the board outline.",
  PCBMoveComponentsCmd: "Moves PCB components to new locations on the board. Select a component and move it along the board X and Y axes, or adjust its angle on the board.",
  PCBFlipComponentCmd: "Rotates components along their X-axis and places them on the other side of a double-sided PCB.",
  PCBStatusCmd: "Checks the status of the PCB shape and component positions.",
  PCBStop: "Return to the Model workspace.",
};

// ------------------------------------------------------------------ refs
const storePoint = (r) => {
  if (!r) return null;
  if (r.kind === "vertex") return { kind: "vertex", body: r.body, p: r.p };
  if (r.kind === "sketchPoint") return { kind: "sketchPoint", sketch: r.sketch, point: r.point };
  if (r.kind === "cpoint") return { kind: "cpoint", id: r.id };
  return null;
};
const pointRef = (pt) => (pt && POINT_KINDS.includes(pt.kind) ? { ...pt } : null);
function isLine(dlg, r) {
  if (r.kind === "originAxis") return true;
  if (r.kind === "sketchCurve") {
    const s = dlg.baseState.sketches.get(r.sketch);
    const cv = s && s.sk && s.sk.curves[r.curve];
    return !!cv && cv.type === "line";
  }
  if (r.kind === "edge") return U.isLinearEdge(dlg.baseState, r);
  return false;
}

/** The pcb feature a dialog works on: the edited one, else the PCB of the running environment. */
const pcbOf = (app, id) => { const f = id ? app.feature(id) : activePcb(app); return f && f.type === TYPE ? f : null; };

// ------------------------------------------------------------------ Create 3D PCB / Derive PCB / Define Board
const MODES = {
  create: { id: "PCBCreateCmd", title: "Create 3D PCB", label: "Create 3D PCB", kinds: ["profile", "face"], prompt: "Select sketch profile(s) or face for PCB" },
  derive: { id: "PCBDeriveCmd", title: "Derive PCB from Sketch", label: "Derive PCB", kinds: ["profile"], prompt: "Select sketch profile(s) for PCB" },
  define: { id: "PCBDefineBoardCmd", title: "Define Board", label: "Define Board", kinds: ["profile"], prompt: "Select sketch profile(s) and origin for PCB" },
};

/**
 * mode 'create' | 'derive' | 'define'. opts.editId: the pcb feature (Edit Feature, Define Board); a new PCB
 * otherwise. Define Board without editId edits the PCB of the running environment.
 */
export function openPcbDialog(app, mode, opts = {}) {
  const D = MODES[mode] || MODES.create;
  let editId = opts.editId || null;
  if (mode === "define" && !editId) { const f = activePcb(app); editId = f ? f.id : null; }
  const f0 = editId ? app.feature(editId) : null;
  if (mode === "define" && !f0) { app.toast("Activate a PCB first (PCB environment)", "warning"); return null; }
  const env = pcbEnv(app);
  const point = { id: "origin", type: "selection", label: "Origin", kinds: POINT_KINDS, max: 1, min: 0, prompt: "Select point or vertex for 2D PCB origin", tooltip: "Select point or vertex for 2D PCB origin" };
  const axis = { id: "xAxis", type: "selection", label: "X Axis", kinds: AXIS_KINDS, max: 1, min: 0, filter: (r, dlg) => isLine(dlg, r), prompt: "Select sketch line or edge for X Axis for 2D PCB orientation", tooltip: "Select sketch line or edge for X Axis for 2D PCB orientation" };
  const flipX = { id: "flipX", type: "check", label: "Flip X Axis", tooltip: "Flip X Axis for 2D PCB orientation", default: false };
  const flipZ = { id: "flipZ", type: "check", label: "Flip Z Axis", tooltip: "Flip Z Axis for 2D PCB orientation", default: false };
  const profile = { id: "profile", type: "selection", label: "Profile", kinds: D.kinds, planar: true, prompt: D.prompt, tooltip: D.prompt };
  const thickness = { id: "thickness", type: "value", label: "Thickness", kind: "length", positive: true, default: DEFAULT_THICKNESS };
  let rows;
  if (mode === "define") {
    rows = [
      { id: "gShape", type: "group", label: "Shape", rows: [
        profile,
        { id: "side", type: "dropdown", label: "Profile On", default: "bottom", options: [{ value: "top", label: "PCB Top Layer" }, { value: "bottom", label: "PCB Bottom Layer" }], tooltip: "The PCB layer that the profile lies on." },
        thickness,
      ] },
      { id: "gOrigin", type: "group", label: "Origin", rows: [point, axis, flipX, flipZ] },
    ];
  } else if (mode === "derive") {
    rows = [profile, point, axis, flipX, flipZ];
  } else {
    rows = [
      profile, thickness, point, axis, flipX, flipZ,
      { id: "npth", type: "check", label: "Convert Circles to NPTHs", tooltip: "Selected circle profiles up to the maximum diameter stay holes in the board (non-plated through holes).", default: false, sep: true },
      { id: "maxNpth", type: "value", label: "Max NPTH Diameter", kind: "length", positive: true, default: DEFAULT_NPTH, visible: (v) => !!v.npth },
    ];
  }
  const keepFlags = (f) => {
    if (!f0) { if (mode === "derive") f.derived = true; return f; }
    for (const k of ["derived", "linked", "boardSketch", "pcbType"]) if (f0[k] !== undefined) f[k] = f0[k];
    return f;
  };
  return app.ui.dialog.open({
    id: D.id,
    title: D.title,
    icon: D.id,
    editId,
    featureLabel: D.label,
    help: TIPS[D.id],
    labelWidth: mode === "create" ? 150 : undefined,
    preselect: (opts.preselect || []).filter((r) => D.kinds.includes(r.kind) || POINT_KINDS.includes(r.kind)),
    rows,
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      Object.assign(dlg.values, {
        profile: [...profileSelRefs(f0.profiles || []), ...(f0.faces || []).map((r) => U.faceRef(st, r.body, r.p, r.n))],
        origin: [pointRef(f0.origin)].filter(Boolean),
        xAxis: [f0.xAxis ? U.refFromAxis(f0.xAxis, st) : null].filter(Boolean),
        flipX: !!f0.flipX, flipZ: !!f0.flipZ, npth: !!f0.npth, side: f0.side || "bottom",
      });
      if (f0.thickness) dlg.values.thickness = String(f0.thickness);
      if (f0.maxNpth) dlg.values.maxNpth = String(f0.maxNpth);
    },
    onOpen(dlg) {
      // Define Board edits the PCB but keeps its own title (Edit Feature shows EDIT FEATURE)
      if (mode === "define" && !opts.editId) { const t = dlg.el && dlg.el.querySelector(".dlg-title"); if (t) t.textContent = D.title.toUpperCase(); }
      if (mode === "define" && f0 && !hasOutline(f0)) dlg.message(NO_OUTLINE + ". Select a closed profile of the board outline sketch.", "info");
    },
    validate(dlg) {
      if (!f0) return null;
      const at = app.featureIndex(f0.id);
      const late = profileRefsOf(dlg.values.profile).find((p) => app.featureIndex(p.sketch) > at);
      return late ? "Select a profile of a sketch that comes before the PCB in the timeline" : null;
    },
    build(v) {
      const sel = v.profile || [];
      const profiles = profileRefsOf(sel);
      const faces = sel.filter((r) => r.kind === "face").map((r) => ({ body: r.body, p: r.p, n: r.n }));
      if (!profiles.length && !faces.length) return null;
      const f = { type: TYPE, operation: "newComponent", profiles, thickness: mode === "derive" && !f0 ? DEFAULT_THICKNESS : v.thickness || (f0 && f0.thickness) || DEFAULT_THICKNESS, side: v.side || (f0 && f0.side) || "bottom" };
      if (faces.length) f.faces = faces;
      const o = storePoint((v.origin || [])[0]);
      if (o) f.origin = o;
      const ax = U.axisFromRef((v.xAxis || [])[0]);
      if (ax) f.xAxis = ax;
      if (v.flipX) f.flipX = true;
      if (v.flipZ) f.flipZ = true;
      if (mode === "create" && v.npth) { f.npth = true; f.maxNpth = v.maxNpth || DEFAULT_NPTH; } else if (f0 && f0.npth && mode !== "create") { f.npth = true; f.maxNpth = f0.maxNpth || DEFAULT_NPTH; }
      // a PCB created inside the PCB environment is a sibling of the running PCB
      if (!f0 && env) f.occ = env.prevActive && env.prevActive !== ROOT && app.components && app.components.alive(env.prevActive) ? env.prevActive : null;
      return keepFlags(f);
    },
    status: (dlg) => profileStatus(dlg, dlg.values.profile),
    manipulators(dlg) {
      const b = dlg.previewRes && dlg.previewRes.board;
      if (!b || !b.frame || mode === "derive") return [];
      const F = b.frame, t = dlg.num("thickness");
      if (!Number.isFinite(t)) return [];
      const top = (dlg.values.side || "bottom") === "top";
      const m = top ? dlg.valueManip("thickness", { origin: F.o, dir: V.mul(F.z, -1), min: 0.01 }) : dlg.valueManip("thickness", { origin: V.sub(F.o, V.mul(F.z, t)), dir: F.z, min: 0.01 });
      return m ? [m] : [];
    },
    commit(feature, dlg) {
      if (!dlg.editId) return commitNewPcb(app, feature, D.label, { name: "PCB" });
      const label = opts.editId ? `Edit ${D.label}` : D.label;
      const id = app.mutate(label, (doc) => {
        const old = doc.features.find((x) => x.id === dlg.editId);
        if (!old) throw new Error("The PCB no longer exists");
        const keep = { id: old.id, name: old.name, p: old.p, newBody: old.newBody, suppressed: old.suppressed, visible: old.visible, occ: old.occ, newOcc: old.newOcc, newComp: old.newComp };
        for (const k of Object.keys(old)) delete old[k];
        Object.assign(old, clone(feature));
        for (const [k, v] of Object.entries(keep)) if (v !== undefined) old[k] = v;
        // the first outline of a linked PCB makes its board body
        if (hasOutline(old) && !old.newBody) old.newBody = M.nextBody(doc, { name: "Board", appearance: BOARD_APPEARANCE });
        prepareFeature(doc, old);
        hideProfileSketches(doc, old);
        return old.id;
      });
      return { id, edit: true };
    },
    afterCommit(res) {
      if (res && res.id && !res.edit) enterPcb(app, res.id, { prevActive: res.prevActive });
    },
  });
}

/** Edit Feature of a pcb feature (timeline double-click). */
export function editPcb(app, id) {
  const f = app.feature(id);
  if (!f || f.type !== TYPE) return null;
  const mode = f.derived ? "derive" : hasOutline(f) && !f.linked ? "create" : "define";
  return openPcbDialog(app, mode, { editId: id });
}

// ------------------------------------------------------------------ Create Linked PCB
function planeOfRef(app, r) {
  if (!r) return null;
  if (r.kind === "originPlane" && K.ORIGIN_PLANES[r.name]) return { planeRef: { kind: "origin", name: r.name }, plane: { ...K.ORIGIN_PLANES[r.name] } };
  if (r.kind === "cplane") { const ps = app.planeState(r.id); return ps && ps.plane ? { planeRef: { kind: "cplane", id: r.id }, plane: { ...ps.plane } } : null; }
  if (r.kind === "face" && r.p && r.n) { const plane = K.planeFromNormal(r.p, r.n); return { planeRef: { kind: "face", body: r.body, p: r.p, n: r.n, plane }, plane }; }
  return null;
}

/** Local equivalent of Fusion's Linked PCB: a PCB component with an empty "Board Outline" sketch and no board yet. */
export function openLinkedPcb(app, opts = {}) {
  const pre = (opts.preselect || []).filter((r) => r.kind === "originPlane" || r.kind === "cplane" || (r.kind === "face" && r.planar !== false)).slice(0, 1);
  return app.ui.dialog.open({
    id: "PCBExternalComponentCreationCmd",
    title: "Create Linked PCB",
    icon: "PCBExternalComponentCreationCmd",
    featureLabel: "Create Linked PCB",
    help: TIPS.PCBExternalComponentCreationCmd,
    preview: false,
    noFeature: true,
    activate: false,
    values: { plane: pre.length ? pre : [{ kind: "originPlane", name: "XY" }] },
    rows: [
      { id: "plane", type: "selection", label: "Location", kinds: ["originPlane", "cplane", "face"], planar: true, max: 1, toggle: false, prompt: "Select a plane or planar face for the board outline sketch", tooltip: "The plane of the board outline sketch." },
      { id: "info", type: "text", label: "", text: () => "Then edit the board outline sketch, draw a closed profile and use Define Board." },
    ],
    validate: (dlg) => (planeOfRef(app, (dlg.values.plane || [])[0]) ? null : "Select a plane"),
    commit(_f, dlg) {
      const pr = planeOfRef(app, (dlg.values.plane || [])[0]);
      if (!pr) throw new Error("Select a plane");
      const C = app.components;
      const env = pcbEnv(app);
      const prevActive = env ? env.prevActive : C ? C.active : null;
      const id = app.mutate("Create Linked PCB", (doc) => {
        const c = M.newComponentMeta(doc, { name: uniqueCompName(doc, "PCB") });
        const pf = { type: TYPE, operation: "newComponent", newComp: c.comp, newOcc: c.occ, profiles: [], thickness: DEFAULT_THICKNESS, side: "bottom", linked: true };
        if (env) pf.occ = prevActive && prevActive !== ROOT && doc.occurrences && doc.occurrences[prevActive] ? prevActive : null;
        const sk = { type: "sketch", name: "Board Outline", plane: pr.plane, planeRef: pr.planeRef, sk: newSketch(), visible: true, occ: c.occ };
        // the sketch comes first: Define Board then picks its profile (a PCB only uses earlier sketches)
        prepareFeature(doc, sk);
        prepareFeature(doc, pf);
        pf.boardSketch = sk.id;
        doc.features.splice(doc.marker, 0, sk, pf);
        doc.marker += 2;
        doc.activeOcc = c.occ;
        return pf.id;
      });
      return { id, prevActive };
    },
    afterCommit(res) {
      if (!res || !res.id) return;
      enterPcb(app, res.id, { prevActive: res.prevActive, quiet: true });
      app.toast("Board outline not defined. Edit the outline sketch to draw a closed profile, then Define board to select a profile to create the PCB body.", "info", 5200);
    },
  });
}

// ------------------------------------------------------------------ PCB components (Move / Flip)
/** Occurrences inside a PCB (deep), excluding the PCB occurrence itself. */
export function pcbComponents(app, f) {
  const C = app.components;
  if (!C || !f || !f.newOcc || !C.alive(f.newOcc)) return [];
  const out = [];
  const walk = (o) => { for (const c of C.children(o)) { out.push(c); walk(c); } };
  walk(f.newOcc);
  return out;
}
/** Selection ref -> {kind:'occurrence', occ} of the top-level component on the PCB that holds it, or null. */
function toPcbComp(app, f) {
  return (r) => {
    const C = app.components;
    if (!C || !f) return null;
    let o = r.kind === "occurrence" ? r.occ : r.body ? C.ownerOf(r.body) : null;
    if (!o || o === ROOT) return null;
    const chain = C.ancestors(o);
    const i = chain.indexOf(f.newOcc);
    if (i <= 0) return null; // outside the PCB or the PCB itself
    return { kind: "occurrence", occ: chain[i - 1] };
  };
}
function compCenter(app, oid) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const b of app.components.worldBodies(oid) || []) {
    let bb = null;
    try { bb = b.shape ? K.bboxOf(b.shape) : null; } catch { bb = null; }
    if (!bb) continue;
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); }
  }
  if (!Number.isFinite(mn[0])) { const T = app.components.transform(oid); return [T[3], T[7], T[11]]; }
  return V.mul(V.add(mn, mx), 0.5);
}
const snapGrid = (v, on) => (on ? Math.round(v / GRID) * GRID : v);

/** Rigid world transforms {oid: M} that a Move / Flip dialog would give its selection. */
function movedTransforms(app, f, dlg, kind) {
  const F = currentFrame(app, f);
  const C = app.components;
  const out = {};
  if (!F) return out;
  for (const r of dlg.values.sel || []) {
    const oid = r.occ;
    if (!C.alive(oid)) continue;
    const T = C.transform(oid);
    const c = compCenter(app, oid);
    let D;
    if (kind === "flip") {
      const mid = V.sub(F.o, V.mul(F.z, F.thickness / 2));
      const q = V.sub(c, V.mul(F.z, V.dot(V.sub(c, mid), F.z)));
      D = MD.axisRotation(180, q, F.x);
    } else {
      const grid = !!dlg.values.grid;
      const dx = snapGrid(dlg.num("dx") || 0, grid), dy = snapGrid(dlg.num("dy") || 0, grid);
      const ang = dlg.num("angle") || 0; // degrees
      const R = Math.abs(ang) > 1e-9 ? MD.axisRotation(ang, c, F.z) : MD.IDENTITY;
      D = MD.mul(MD.translation(V.add(V.mul(F.x, dx), V.mul(F.y, dy))), R);
    }
    out[oid] = MD.mul(D, T);
  }
  return out;
}

function showMoved(app, f, dlg, kind) {
  const C = app.components;
  const map = movedTransforms(app, f, dlg, kind);
  const keep = new Set(Object.keys(map));
  for (const o of dlg._shown || []) if (!keep.has(o)) C.setDisplayTransform(o, null);
  for (const [o, m] of Object.entries(map)) C.setDisplayTransform(o, m);
  dlg._shown = [...keep];
}

function openComponentsDialog(app, kind) {
  const f = activePcb(app);
  if (!f) { app.toast("Activate a PCB first (PCB environment)", "warning"); return null; }
  if (!pcbComponents(app, f).length) { app.toast("The PCB has no components. Add components to the PCB first (New Component).", "warning", 3600); return null; }
  const C = app.components;
  const id = kind === "flip" ? "PCBFlipComponentCmd" : "PCBMoveComponentsCmd";
  const title = kind === "flip" ? "Flip Component" : "Move Components";
  const map = toPcbComp(app, f);
  const pre = app.selection.items.map(map).filter(Boolean);
  const rows = [
    { id: "sel", type: "selection", label: "Selection", kinds: ["occurrence", "body", "face", "edge", "vertex"], mapRef: map, prompt: "Select PCB components", tooltip: "Select PCB components",
      selText: (n, dlg) => (n === 1 ? C.label(dlg.values.sel[0].occ) : n ? `${n} selected` : "Select") },
  ];
  if (kind !== "flip") {
    rows.push(
      { id: "dx", type: "value", label: "X Distance", kind: "length", default: "0.00 mm", tooltip: "Distance along the X axis of the 2D PCB" },
      { id: "dy", type: "value", label: "Y Distance", kind: "length", default: "0.00 mm", tooltip: "Distance along the Y axis of the 2D PCB" },
      { id: "angle", type: "value", label: "Angle", kind: "angle", default: "0.0 deg", tooltip: "Rotation about the board normal" },
      { id: "grid", type: "check", label: "Use 2D PCB Grid", tooltip: "Snaps the distances to the 2D PCB grid (1.27 mm)", default: false, sep: true },
    );
  }
  return app.ui.dialog.open({
    id, title, icon: id, featureLabel: title, help: TIPS[id],
    preview: false, noFeature: true,
    preselect: pre,
    rows,
    onOpen: (dlg) => showMoved(app, f, dlg, kind),
    onChange: (_id, dlg) => showMoved(app, f, dlg, kind),
    validate: (dlg) => ((dlg.values.sel || []).length ? null : "Select PCB components"),
    commit(_f, dlg) {
      const moved = movedTransforms(app, f, dlg, kind);
      C.clearDisplay();
      if (!Object.keys(moved).length) return null;
      C.setTransforms(moved, { capture: true, label: kind === "flip" ? "Flip Component" : "Move PCB Components" });
      return moved;
    },
    onClose: () => { try { C.clearDisplay(); } catch { /* ignore */ } },
  });
}
export const openMoveComponents = (app) => openComponentsDialog(app, "move");
export const openFlipComponent = (app) => openComponentsDialog(app, "flip");

// ------------------------------------------------------------------ PCB Status
export function pcbStatus(app, f) {
  const res = (app.result && app.result.results && app.result.results[f.id]) || {};
  const b = res.board || null;
  const fmt = (v) => `${v.toFixed(2)} mm`;
  return {
    defined: hasOutline(f) && !!b,
    shape: hasOutline(f) ? (b && b.size ? `${fmt(b.size[0])} x ${fmt(b.size[1])}` : res.error || "Not computed") : NO_OUTLINE,
    height: b ? fmt(b.thickness) : String(f.thickness || DEFAULT_THICKNESS),
    holes: b ? b.holes : 0,
    cutouts: b ? b.cutouts : 0,
    components: pcbComponents(app, f).length,
    ok: !!res.ok,
  };
}
export function openPcbStatus(app) {
  const f = activePcb(app);
  if (!f) { app.toast("Activate a PCB first (PCB environment)", "warning"); return null; }
  const s = pcbStatus(app, f);
  return app.ui.dialog.open({
    id: "PCBStatusCmd", title: "PCB Status", icon: "PCBStatusCmd", featureLabel: "PCB Status", help: TIPS.PCBStatusCmd,
    preview: false, noFeature: true, activate: false, ctrlWidth: 170,
    rows: [
      { id: "shape", type: "text", label: "Board Shape", text: () => s.shape },
      { id: "height", type: "text", label: "Board Height", text: () => s.height },
      { id: "holes", type: "text", label: "Holes", text: () => String(s.holes) },
      { id: "cutouts", type: "text", label: "Cutouts", text: () => String(s.cutouts) },
      { id: "components", type: "text", label: "PCB Components", text: () => String(s.components) },
      { id: "state", type: "text", label: "Status", text: () => (s.defined ? (s.ok ? "Unchanged" : "Changed") : NO_OUTLINE) },
    ],
    commit: () => s,
  });
}

// ------------------------------------------------------------------ Imprint (copy the board outline to a sketch)
/** Board outline edges (top face) of a pcb feature, as 3D curves {type:'line'|'circle'|'arc'|'poly', ...}. */
export function boardOutline(app, f) {
  const F = currentFrame(app, f);
  const body = f.newBody ? app.body(f.newBody) : null;
  if (!F || !body || !body.shape) return [];
  const topo = K.topoOf(body.shape);
  const fi = topo.faces.findIndex((x) => x.type === "PLANE" && x.n && V.dot(x.n, F.z) > 0.999 && Math.abs(V.dot(V.sub(x.c, F.o), F.z)) < 1e-4);
  if (fi < 0) return [];
  const out = [];
  for (const e of topo.edges) {
    if (!(e.faces || []).includes(fi)) continue;
    if (e.type === "LINE") out.push({ type: "line", s: e.s, t: e.t });
    else if (e.type === "CIRCLE" && e.c) out.push(V.len(V.sub(e.s, e.t)) < 1e-6 ? { type: "circle", c: e.c, r: e.r, a: e.a } : { type: "arc", c: e.c, r: e.r, a: e.a, s: e.s, m: e.m, t: e.t });
    else out.push({ type: "poly", pts: [e.s, e.m, e.t] });
  }
  return out;
}

/** Adds 3D outline curves to sketch data sk (plane pl), projected onto the plane. Returns the number of curves. */
export function addOutlineToSketch(sk, pl, curves) {
  const y = K.planeY(pl);
  const uv = (p) => { const d = V.sub(p, pl.o); return [V.dot(d, pl.x), V.dot(d, y)]; };
  const pts = new Map();
  const pid = (p) => {
    const q = uv(p);
    const key = `${Math.round(q[0] * 1e4)},${Math.round(q[1] * 1e4)}`;
    if (!pts.has(key)) pts.set(key, addPoint(sk, q[0], q[1]));
    return pts.get(key);
  };
  let n = 0;
  for (const c of curves) {
    const par = c.a ? Math.abs(V.dot(V.norm(c.a), pl.n)) > 0.999 : false;
    if (c.type === "line") { const a = pid(c.s), b = pid(c.t); if (a !== b) { addLine(sk, a, b); n++; } } else if (c.type === "circle" && par) { addCircle(sk, addPoint(sk, ...uv(c.c)), c.r); n++; } else if (c.type === "arc" && par) {
      const cc = uv(c.c), s = uv(c.s), m = uv(c.m), t = uv(c.t);
      const ang = (p) => Math.atan2(p[1] - cc[1], p[0] - cc[0]);
      const TAU = Math.PI * 2, nm = (a) => ((a % TAU) + TAU) % TAU;
      // sketch arcs run counter-clockwise from p1 to p2: keep the side of the mid point
      const ccw = nm(ang(m) - ang(s)) <= nm(ang(t) - ang(s));
      const ci = addPoint(sk, cc[0], cc[1]);
      const a = pid(ccw ? c.s : c.t), b = pid(ccw ? c.t : c.s);
      addArc(sk, ci, a, b);
      n++;
    } else {
      const list = c.type === "poly" ? c.pts : c.type === "circle" ? [] : [c.s, c.m, c.t];
      for (let i = 0; i + 1 < list.length; i++) { const a = pid(list[i]), b = pid(list[i + 1]); if (a !== b) { addLine(sk, a, b); n++; } }
    }
  }
  return n;
}

export function openImprint(app) {
  const f = activePcb(app);
  if (!f) { app.toast("Activate a PCB first (PCB environment)", "warning"); return null; }
  if (!hasOutline(f)) { app.toast(`${NO_OUTLINE}. Use Define Board first.`, "warning"); return null; }
  const sketchOf = (r) => (r && (r.kind === "profile" || r.kind === "sketchCurve" || r.kind === "sketchPoint") ? r.sketch : null);
  return app.ui.dialog.open({
    id: "PCBImprintCmd", title: "Imprint", icon: "PCBImprintCmd", featureLabel: "Imprint", help: TIPS.PCBImprintCmd,
    preview: false, noFeature: true,
    rows: [
      { id: "dest", type: "selection", label: "Destination", kinds: ["originPlane", "cplane", "face", "profile", "sketchCurve"], planar: true, max: 1, prompt: "Select destination plane or sketch", tooltip: "Select destination plane or sketch" },
    ],
    validate: (dlg) => ((dlg.values.dest || []).length ? null : "Select destination plane or sketch"),
    commit(_f, dlg) {
      const r = (dlg.values.dest || [])[0];
      const curves = boardOutline(app, f);
      if (!curves.length) throw new Error("The board outline could not be read");
      const sid = sketchOf(r);
      if (sid) {
        const s = app.sketchState(sid);
        if (!s || !s.plane) throw new Error("The destination sketch is missing");
        return app.mutate("Imprint", (doc) => {
          const sf = doc.features.find((x) => x.id === sid);
          const n = addOutlineToSketch(sf.sk, s.plane, curves);
          sf.visible = true;
          return { sketch: sid, curves: n };
        });
      }
      const pr = planeOfRef(app, r);
      if (!pr) throw new Error("Select a plane or planar face");
      const sk = newSketch();
      const n = addOutlineToSketch(sk, pr.plane, curves);
      const nf = app.addFeature({ type: "sketch", name: "PCB Profile", plane: pr.plane, planeRef: pr.planeRef, sk, visible: true }, "Imprint");
      return { sketch: nf && nf.id, curves: n };
    },
  });
}
