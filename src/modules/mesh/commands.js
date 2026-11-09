// MESH tab command dialogs (Fusion ids). Each command opens a dialog of the framework (app.ui.dialog) whose OK
// commits one timeline feature of the matching type (features.js); Edit Feature reopens it. Inside DIRECT MESH
// EDITING the same dialogs write their result into the active Base Mesh Feature instead (direct.js).
import { prepareFeature } from "../../app/core.js";
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import * as A from "./algo.js";
import { planeRefFromRef, refFromPlaneRef } from "../dialogs/util.js";
import { PAL, setMode, brushRefs, meshEntryOf, workFor } from "./palette.js";
import { separateRegions, movedPlane } from "./features.js";
import { directActive, directCommit } from "./direct.js";

// ------------------------------------------------------------------ shared rows
const isMesh = (dlg, id) => { const e = dlg.baseState.meshBodies && dlg.baseState.meshBodies.get(id); return !!(e && e.mesh && (!e.kind || e.kind === "mesh")); };
const isBrep = (dlg, id) => !!(dlg.baseState.bodies && dlg.baseState.bodies.has(id));
/**
 * Mesh selection row: bodies, face groups or faces following the Mesh Palette's Selection Filter (modes the row
 * accepts; the first is used when the palette's filter is not one of them).
 */
function meshRow(id, label, prompt, { modes = ["body", "group", "face"], max, min, sameBody = false, tooltip } = {}) {
  const modeOf = () => (modes.includes(PAL.mode) ? PAL.mode : modes[0]);
  return {
    id, type: "selection", label, prompt, tooltip, kinds: ["body", "meshFace"], meshBodies: true, meshRow: true, max, min, modes,
    filter(ref, dlg) {
      if (!isMesh(dlg, ref.body)) return false;
      const m = modeOf();
      if (sameBody) { const cur = dlg.values[id] || []; if (cur.length && cur[0].body !== ref.body) return false; }
      return m === "body" ? ref.kind === "body" : ref.kind === "meshFace";
    },
    mapRef(ref, dlg) {
      if (ref.kind !== "meshFace") return ref;
      if (modeOf() === "face") return brushRefs(dlg.app, ref, dlg.baseState);
      return { kind: "meshFace", body: ref.body, tri: ref.tri, group: ref.group >= 0 ? ref.group : 0, p: ref.p, n: ref.n };
    },
  };
}
const bodyRow = (id, label, prompt, opts = {}) => ({
  id, type: "selection", label, prompt, kinds: ["body"], meshBodies: true, max: opts.max ?? 1, min: opts.min,
  filter: (ref, dlg) => (opts.brep ? isBrep(dlg, ref.body) : isMesh(dlg, ref.body)) && (!opts.not || !(dlg.values[opts.not] || []).some((r) => r.body === ref.body)),
});
const planeRow = (id, label, prompt) => ({ id, type: "selection", label, prompt, kinds: ["originPlane", "cplane", "face"], planar: true, max: 1 });
const val = (id, label, kind, dflt, extra = {}) => ({ id, type: "value", label, kind, default: dflt, ...extra });
const unit01 = (id, label, dflt = "0.50", extra = {}) => val(id, label, "none", dflt, { min: 0, max: 1, step: 0.05, ...extra });
const dd = (id, label, options, dflt, extra = {}) => ({ id, type: "dropdown", label, options: options.map(([value, l, more]) => ({ value, label: l, ...(more || {}) })), default: dflt, ...extra });
const chk = (id, label, dflt, extra = {}) => ({ id, type: "check", label, default: dflt, ...extra });
const previewRow = () => chk("preview", "Preview", true, { sep: true, tooltip: "Displays a preview of the result in the canvas." });

/** Selection refs -> compact feature targets [{body, groups?, tris?}]. */
export function targetsOf(refs) {
  const m = new Map();
  for (const r of refs || []) {
    if (!r || !r.body) continue;
    let e = m.get(r.body);
    if (!e) { e = { body: r.body, whole: false, groups: new Set(), tris: new Set() }; m.set(r.body, e); }
    if (r.kind === "body") e.whole = true;
    else if (r.kind === "meshFace" && r.triOnly) e.tris.add(r.tri);
    else if (r.kind === "meshFace") e.groups.add(r.group >= 0 ? r.group : 0);
  }
  return [...m.values()].map((e) => {
    if (e.whole) return { body: e.body };
    const t = { body: e.body };
    if (e.groups.size) t.groups = [...e.groups].sort((a, b) => a - b);
    if (e.tris.size) t.tris = [...e.tris].sort((a, b) => a - b);
    return t;
  });
}
/** Feature targets -> selection refs (Edit Feature). */
export function refsOf(app, targets, st) {
  const out = [];
  for (const t of targets || []) {
    if (!t || !t.body) continue;
    if ((!t.groups || !t.groups.length) && (!t.tris || !t.tris.length)) { out.push({ kind: "body", body: t.body }); continue; }
    const e = meshEntryOf(app, t.body, st);
    const W = e ? workFor(e.mesh) : null;
    for (const g of t.groups || []) {
      let tri = 0;
      if (W) for (let k = 0; k < A.tcount(W); k++) if ((W.G[k] ?? 0) === g) { tri = k; break; }
      out.push({ kind: "meshFace", body: t.body, tri, group: g });
    }
    for (const tr of t.tris || []) out.push({ kind: "meshFace", body: t.body, tri: tr, group: W ? W.G[tr] ?? 0 : 0, triOnly: true });
  }
  return out;
}
const bodyRefs = (ids) => (ids || []).filter(Boolean).map((b) => ({ kind: "body", body: b }));
const firstBody = (v, id) => ((v[id] || [])[0] || {}).body || null;
const str = (x, d) => (x === undefined || x === null || x === "" ? d : String(x));

/** Name for a new mesh body: MeshBody<n> (Fusion's default mesh body name). */
export function meshName(doc, taken = []) {
  let n = 0;
  for (const m of [...Object.values(doc.bodies || {}).map((b) => b && b.name), ...taken]) { const r = /^MeshBody(\d+)$/.exec(m || ""); if (r) n = Math.max(n, Number(r[1])); }
  return `MeshBody${n + 1}`;
}

// ------------------------------------------------------------------ generic dialog
const CMDS = {};
/**
 * cfg: {id, title, type, help, rows(app, f0), init(dlg, f0), make(v, dlg) -> feature|null, newBodies(f, doc) -> names,
 *       single (newBody instead of newBodies), after(doc, nf) (same undo step), manipulators, status, onChange, defaultMode}
 */
function cmd(cfg) { CMDS[cfg.id] = cfg; return cfg; }
export function openMeshCommand(app, id, opts = {}) {
  const cfg = CMDS[id];
  if (!cfg || !app.ui.dialog) return null;
  if (app.mode === "sketch") { const stop = app.commands.get("SketchStop"); if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model"); }
  const editId = opts.editId && app.feature(opts.editId) && app.feature(opts.editId).type === cfg.type ? opts.editId : null;
  const f0 = editId ? JSON.parse(JSON.stringify(app.feature(editId))) : null;
  const rows = cfg.rows(app, f0);
  const sel0 = (rows.find((r) => r.meshRow) || {}).modes;
  // the Selection Filter follows the command (body tools start with bodies, face tools with faces)
  const pre = (opts.preselect || app.selection.items || []).filter((r) => r && (r.kind === "body" || r.kind === "meshFace"));
  const preMode = pre.length ? (pre[0].kind === "body" ? "body" : pre[0].triOnly ? "face" : "group") : null;
  if (preMode && sel0 && sel0.includes(preMode)) setMode(preMode);
  else if (cfg.defaultMode) setMode(cfg.defaultMode);
  else if (sel0) setMode(sel0[0]);
  const build = (v, d) => { try { return cfg.make(v, d); } catch (e) { d._mshError = e.message || String(e); return null; } };
  return app.ui.dialog.open({
    id, title: cfg.title, icon: id, editId, featureLabel: cfg.title, help: cfg.help,
    ctrlWidth: cfg.ctrlWidth || 130,
    preselect: editId ? [] : pre,
    rows,
    noFeature: rows.some((r) => r.id === "preview"),
    init(dlg) { if (f0 && cfg.init) cfg.init(dlg, f0); },
    onOpen(dlg) { dlg.el.classList.add("msh-dlg"); if (cfg.onOpen) cfg.onOpen(dlg, f0); },
    onChange: cfg.onChange,
    build(v, d) {
      d._mshError = null;
      if (v.preview === false) return null;
      return build(v, d);
    },
    afterPreview(d) {
      if (d._mshError) d.message(d._mshError, "error");
      if (cfg.afterPreview) cfg.afterPreview(d);
    },
    manipulators: cfg.manipulators,
    status: cfg.status,
    prompt: cfg.prompt,
    preview: cfg.preview !== false,
    commit(feature, d) {
      d._mshError = null;
      const f = feature || build(d.values, d);
      if (!f) throw new Error(d._mshError || "Make a selection first");
      if (cfg.commit) return cfg.commit(app, d, f);
      if (directActive(app) && cfg.direct !== false && !editId) return directCommit(app, d, f, cfg);
      if (!feature) {
        // Preview is off: validate once before committing
        const r = app.preview(f, editId ? { replaceId: editId } : {});
        const res = r.result.results[r.feature.id];
        app.endPreview();
        if (res && res.ok === false) throw new Error(res.error);
      }
      if (editId) return d.commitFeature(f);
      return app.mutate(cfg.title, (doc) => {
        const nf = JSON.parse(JSON.stringify(f));
        const names = cfg.newBodies ? cfg.newBodies(nf, doc) : null;
        if (names && names.length) {
          const taken = [];
          const mk = (n) => { if (cfg.brepResult) return M.nextBody(doc); const name = n || meshName(doc, taken); taken.push(name); return M.nextBody(doc, { name, kind: "mesh" }); };
          if (cfg.single) nf.newBody = mk(names[0]);
          else nf.newBodies = names.map(mk);
        }
        prepareFeature(doc, nf);
        doc.features.splice(doc.marker, 0, nf);
        doc.marker += 1;
        if (cfg.after) cfg.after(doc, nf);
        return nf;
      });
    },
    afterCommit(out, d) { if (cfg.afterCommit) cfg.afterCommit(app, out, d); },
    onClose(d) { if (cfg.onClose) cfg.onClose(d); },
  });
}
export const meshCommandIds = () => Object.keys(CMDS);
export const commandOfType = (type) => Object.values(CMDS).find((c) => c.type === type) || null;

// ------------------------------------------------------------------ PREPARE
cmd({
  id: "ParaMeshRepairCommand", title: "Repair", type: "meshRepair",
  help: "Repairs a mesh body to prepare it for further design and manufacturing operations.",
  rows: () => [
    bodyRow("body", "Body", "Select mesh body to repair"),
    dd("repairType", "Repair Type", [["closeHoles", "Close Holes"], ["stitch", "Stitch and Remove"], ["wrap", "Wrap"], ["rebuild", "Rebuild"]], "stitch", { tooltip: "Close Holes fills open boundaries. Stitch and Remove also joins coincident edges, removes degenerate faces, duplicates and small shells and orients the faces. Wrap fills the holes smoothly. Rebuild makes a new watertight mesh from a voxel model of the body." }),
    dd("rebuildType", "Rebuild Type", [["fast", "Fast"], ["accurate", "Accurate"], ["blocky", "Blocky"]], "fast", { visible: (v) => v.repairType === "rebuild" }),
    unit01("density", "Density", "0.50", { visible: (v) => v.repairType === "rebuild", tooltip: "Higher values give a finer voxel model and more faces." }),
    val("offset", "Offset", "length", "0.00 mm", { visible: (v) => v.repairType === "rebuild" && v.rebuildType === "accurate" }),
    { id: "analysis", type: "text", label: "Quick Analysis", sep: true, text: (dlg) => analysisText(dlg, firstBody(dlg.values, "body")) },
    previewRow(),
  ],
  init(dlg, f) { Object.assign(dlg.values, { body: bodyRefs([f.body]), repairType: f.repairType || "stitch", rebuildType: f.rebuildType || "fast", density: str(f.density, "0.50"), offset: str(f.offset, "0.00 mm") }); },
  make(v) {
    const body = firstBody(v, "body");
    if (!body) return null;
    const f = { type: "meshRepair", body, repairType: v.repairType };
    if (v.repairType === "rebuild") { f.rebuildType = v.rebuildType; f.density = v.density; if (v.rebuildType === "accurate") f.offset = v.offset; }
    return f;
  },
});
function analysisText(dlg, body) {
  if (!body) return "";
  const e = dlg.baseState.meshBodies.get(body);
  if (!e || !e.mesh) return "";
  const an = A.analyze(workFor(e.mesh));
  return [an.closed ? "Mesh is closed." : "Mesh is not closed.", an.oriented ? "Mesh is oriented." : "Mesh is not oriented.", an.positive ? "Mesh has a positive volume." : "Mesh does not have positive volume."].join(" ");
}
cmd({
  id: "ParaMeshCalculateFaceGroupsCommand", title: "Generate Face Groups", type: "meshFaceGroups",
  help: "Automatically generates face groups on a mesh body using the normal angles between faces to determine the boundaries of each face group.",
  rows: () => [
    meshRow("targets", "Bodies/Face Groups", "Select mesh body", { tooltip: "Select mesh bodies or face groups to generate new face groups." }),
    dd("method", "Type", [["fast", "Fast"], ["accurate", "Accurate"]], "fast", { tooltip: "Fast grows face groups across edges flatter than the angle threshold. Accurate first finds planar regions within the boundary tolerance." }),
    val("angle", "Angle Threshold", "angle", "15.0 deg", { min: 0.5, max: 90 }),
    val("tol", "Boundary Tolerance", "length", "0.10 mm", { positive: true, visible: (v) => v.method === "accurate" }),
    val("minSize", "Minimum Face Group Size", "none", "0.50", { min: 0, max: 50, step: 0.1, visible: (v) => v.method !== "accurate", tooltip: "Face groups smaller than this percentage of the selected area are merged into a neighbour." }),
    previewRow(),
  ],
  init(dlg, f) { Object.assign(dlg.values, { targets: refsOf(dlg.app, f.targets, dlg.baseState), method: f.method || "fast", angle: str(f.angle, "15.0 deg"), tol: str(f.tol, "0.10 mm"), minSize: str(f.minSize, "0.50") }); },
  make(v) {
    const targets = targetsOf(v.targets);
    if (!targets.length) return null;
    const f = { type: "meshFaceGroups", targets, method: v.method, angle: v.angle };
    if (v.method === "accurate") f.tol = v.tol; else f.minSize = v.minSize;
    return f;
  },
  afterPreview(d) { const r = d.previewRes; if (r && r.ok && r.groups) d.message(`Face Group Count : ${r.groups}`, "info"); },
});
cmd({
  id: "ParaMeshMergeFaceGroupsCommand", title: "Combine Face Groups", type: "meshMergeGroups", defaultMode: "group",
  help: "Combines two or more adjacent face groups on a mesh body.",
  rows: () => [meshRow("groups", "Face Groups", "Select two or more adjacent face groups", { modes: ["group"], min: 2, sameBody: true })],
  init(dlg, f) { dlg.values.groups = refsOf(dlg.app, [{ body: f.body, groups: f.groups }], dlg.baseState); },
  make(v) {
    const refs = v.groups || [];
    if (refs.length < 2) return null;
    return { type: "meshMergeGroups", body: refs[0].body, groups: [...new Set(refs.map((r) => r.group))].sort((a, b) => a - b) };
  },
});
cmd({
  id: "ParaMeshCreateFaceGroupCommand", title: "Create Face Group", type: "meshCreateGroup", defaultMode: "face",
  help: "Creates a face group from a selection of faces on a mesh body.",
  rows: () => [meshRow("faces", "Faces", "Select faces on mesh body", { modes: ["face"], sameBody: true })],
  init(dlg, f) { dlg.values.faces = refsOf(dlg.app, [{ body: f.body, tris: f.tris }], dlg.baseState); },
  make(v) {
    const refs = v.faces || [];
    if (!refs.length) return null;
    return { type: "meshCreateGroup", body: refs[0].body, tris: [...new Set(refs.map((r) => r.tri))].sort((a, b) => a - b) };
  },
});

// ------------------------------------------------------------------ MODIFY
cmd({
  id: "ParaMeshRemeshCommand", title: "Remesh", type: "meshRemesh",
  help: "Refines or coarsens faces on a mesh body or face groups.",
  rows: () => [
    meshRow("targets", "Body/Face Groups", "Select mesh body or face groups to remesh"),
    dd("remeshType", "Remesh Type", [["adaptive", "Adaptive"], ["uniform", "Uniform"]], "adaptive", { tooltip: "Adaptive places more faces where the surface curves; Uniform makes faces of one size." }),
    dd("method", "Method", [["density", "Density"], ["length", "Edge Length"]], "density"),
    unit01("density", "Density", "0.50", { visible: (v) => v.method !== "length", tooltip: "Higher values produce more, smaller faces." }),
    val("edgeLength", "Target Edge Length", "length", "1.00 mm", { positive: true, visible: (v) => v.method === "length" }),
    unit01("shape", "Shape Preservation", "0.50", { visible: (v) => v.remeshType === "adaptive" }),
    chk("sharp", "Preserve Sharp Edges", true),
    chk("boundary", "Preserve Boundaries", true),
    previewRow(),
  ],
  onOpen(dlg, f0) { if (!f0) setEdgeDefault(dlg, "targets", "edgeLength"); },
  onChange(id, dlg) { if (id === "targets" && !dlg.touched.has("edgeLength")) setEdgeDefault(dlg, "targets", "edgeLength"); },
  init(dlg, f) { Object.assign(dlg.values, { targets: refsOf(dlg.app, f.targets, dlg.baseState), remeshType: f.remeshType || "adaptive", method: f.method || "density", density: str(f.density, "0.50"), edgeLength: str(f.edgeLength, "1.00 mm"), shape: str(f.shape, "0.50"), sharp: f.sharp !== false, boundary: f.boundary !== false }); },
  make(v) {
    const targets = targetsOf(v.targets);
    if (!targets.length) return null;
    const f = { type: "meshRemesh", targets, remeshType: v.remeshType, method: v.method, sharp: !!v.sharp, boundary: !!v.boundary };
    if (v.method === "length") f.edgeLength = v.edgeLength; else f.density = v.density;
    if (v.remeshType === "adaptive") f.shape = v.shape;
    return f;
  },
  status: (d) => triStatus(d),
});
function setEdgeDefault(dlg, row, field) {
  const t = targetsOf(dlg.values[row])[0];
  if (!t) return;
  const e = meshEntryOf(dlg.app, t.body, dlg.baseState);
  if (!e) return;
  const W = workFor(e.mesh);
  dlg.set(field, `${A.avgEdge(W, A.selMask(W, t)).toFixed(2)} mm`, { noPreview: true });
}
function triStatus(d) {
  const r = d.previewRes;
  if (!r || !r.ok || !d.previewFeature) return "";
  const ids = (d.previewFeature.targets || []).map((t) => t.body);
  const st = d.app.result && d.app.result.state;
  if (!st || !ids.length) return "";
  const n = ids.reduce((s, id) => { const e = st.meshBodies.get(id); return s + (e && e.mesh && e.mesh.indices ? e.mesh.indices.length / 3 : 0); }, 0);
  return `Triangle Count : ${n.toLocaleString()}`;
}
cmd({
  id: "ParaMeshReduceCommand", title: "Reduce", type: "meshReduce",
  help: "Reduces the number of faces on a mesh body to minimize complexity.",
  rows: () => [
    meshRow("targets", "Body/Face Groups", "Select mesh body or face groups to reduce"),
    dd("reduceType", "Type", [["tolerance", "Tolerance"], ["proportion", "Proportion"], ["count", "Face Count"]], "proportion"),
    val("tolerance", "Tolerance", "length", "0.10 mm", { positive: true, visible: (v) => v.reduceType === "tolerance", tooltip: "Maximum deviation of the reduced mesh from the original." }),
    val("proportion", "Proportion", "none", "50", { min: 0, max: 100, step: 5, visible: (v) => v.reduceType === "proportion", tooltip: "Percentage of the faces to keep." }),
    val("faceCount", "Face Count", "none", "1000", { integer: true, min: 4, visible: (v) => v.reduceType === "count" }),
    chk("boundary", "Preserve Boundaries", true),
    previewRow(),
  ],
  onOpen(dlg, f0) { if (!f0) setCountDefault(dlg); },
  onChange(id, dlg) { if (id === "targets" && !dlg.touched.has("faceCount")) setCountDefault(dlg); },
  init(dlg, f) { Object.assign(dlg.values, { targets: refsOf(dlg.app, f.targets, dlg.baseState), reduceType: f.reduceType || "proportion", tolerance: str(f.tolerance, "0.10 mm"), proportion: str(f.proportion, "50"), faceCount: str(f.faceCount, "1000"), boundary: f.boundary !== false }); },
  make(v) {
    const targets = targetsOf(v.targets);
    if (!targets.length) return null;
    const f = { type: "meshReduce", targets, reduceType: v.reduceType, boundary: !!v.boundary };
    if (v.reduceType === "tolerance") f.tolerance = v.tolerance; else if (v.reduceType === "count") f.faceCount = v.faceCount; else f.proportion = v.proportion;
    return f;
  },
  status: (d) => triStatus(d),
});
function setCountDefault(dlg) {
  const t = targetsOf(dlg.values.targets)[0];
  if (!t) return;
  const e = meshEntryOf(dlg.app, t.body, dlg.baseState);
  if (!e) return;
  const W = workFor(e.mesh);
  const s = A.selMask(W, t);
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i]) n++;
  dlg.set("faceCount", String(Math.max(4, Math.round(n / 2))), { noPreview: true });
}
const planeAt = (dlg, id = "plane") => {
  const pr = planeRefFromRef((dlg.values[id] || [])[0]);
  if (!pr) return null;
  try { return movedPlane(dlg.baseState, pr, 0, 0, 0); } catch { return null; }
};
function planeManips(dlg) {
  const pl0 = planeAt(dlg);
  const body = firstBody(dlg.values, "body");
  if (!pl0) return [];
  // the arrow starts where the plane meets the body's centre line
  let o = pl0.o;
  const e = body && meshEntryOf(dlg.app, body, dlg.baseState);
  if (e) { const c = A.bbox(workFor(e.mesh)).c; o = A.add(c, A.mul(pl0.n, A.dot(A.sub(pl0.o, c), pl0.n))); }
  const m = dlg.valueManip("offset", { origin: o, dir: pl0.n });
  return m ? [m] : [];
}
const transformRows = () => [
  val("offset", "Distance", "length", "0.00 mm", { tooltip: "Moves the plane along its normal." }),
  val("ax", "X Angle", "angle", "0.0 deg", { tooltip: "Tilts the plane about its X direction." }),
  val("ay", "Y Angle", "angle", "0.0 deg", { tooltip: "Tilts the plane about its Y direction." }),
];
cmd({
  id: "ParaMeshPlaneCutCommand", title: "Plane Cut", type: "meshPlaneCut",
  help: "Uses a plane to trim or split a mesh body.",
  rows: () => [
    bodyRow("body", "Body", "Select mesh body to cut"),
    planeRow("plane", "Cut Plane", "Select a cut plane"),
    ...transformRows(),
    dd("cutType", "Type", [["trim", "Trim"], ["split", "Split Body"], ["splitFaces", "Split Faces"]], "trim", { sep: true }),
    dd("fill", "Fill Type", [["none", "No Fill"], ["minimal", "Minimal"], ["uniform", "Uniform"]], "uniform", { visible: (v) => v.cutType !== "splitFaces" }),
    chk("flip", "Flip", false, { tooltip: "Keeps the other side of the plane." }),
    previewRow(),
  ],
  init(dlg, f) { Object.assign(dlg.values, { body: bodyRefs([f.body]), plane: [refFromPlaneRef(f.plane, dlg.baseState)].filter(Boolean), offset: str(f.offset, "0.00 mm"), ax: str(f.ax, "0.0 deg"), ay: str(f.ay, "0.0 deg"), cutType: f.cutType || "trim", fill: f.fill || "uniform", flip: !!f.flip }); },
  make(v) {
    const body = firstBody(v, "body");
    const pr = planeRefFromRef((v.plane || [])[0]);
    if (!body || !pr) return null;
    return { type: "meshPlaneCut", body, plane: pr, offset: v.offset, ax: v.ax, ay: v.ay, cutType: v.cutType, fill: v.fill, flip: !!v.flip };
  },
  newBodies: (f) => (f.cutType === "split" ? [null] : null),
  manipulators: planeManips,
  prompt: (d) => (!(d.values.body || []).length ? "Select mesh body to cut" : !(d.values.plane || []).length ? "Select a cut plane" : "Position cut plane or select cut type and fill type"),
});
cmd({
  id: "ParaMeshHollowCommand", title: "Shell", type: "meshShell",
  help: "Hollows the interior of a mesh body.",
  rows: () => [
    bodyRow("body", "Body", "Select mesh body to shell"),
    val("thickness", "Thickness", "length", "2.00 mm", { positive: true }),
    dd("direction", "Direction", [["inside", "Inside"], ["outside", "Outside"], ["both", "Both"]], "inside"),
    previewRow(),
  ],
  init(dlg, f) { Object.assign(dlg.values, { body: bodyRefs([f.body]), thickness: str(f.thickness, "2.00 mm"), direction: f.direction || "inside" }); },
  make(v) { const body = firstBody(v, "body"); return body ? { type: "meshShell", body, thickness: v.thickness, direction: v.direction } : null; },
  prompt: (d) => (!(d.values.body || []).length ? "Select mesh body to shell" : "Adjust direction and thickness"),
});
cmd({
  id: "ParaMeshCombineCommand", title: "Combine", type: "meshCombine",
  help: "Joins, intersects, cuts, or merges two or more mesh bodies to create a single mesh body.",
  rows: () => [
    bodyRow("target", "Target Body", "Select target body", { not: "tools" }),
    bodyRow("tools", "Tool Bodies", "Select bodies to combine with target body", { max: 0, not: "target" }),
    { id: "operation", type: "buttons", label: "Operation", default: "join", sep: true, options: [{ value: "join", label: "Join", icon: "join" }, { value: "cut", label: "Cut", icon: "cut" }, { value: "intersect", label: "Intersect", icon: "intersect" }, { value: "merge", label: "Merge", icon: "newBody" }] },
    dd("algorithm", "Algorithm", [["standard", "Standard"], ["enhanced", "Enhanced"]], "standard", { visible: (v) => v.operation !== "merge", tooltip: "Select the algorithm to use for the combine operation." }),
    chk("newComponent", "New Component", false, { enabled: () => false, tooltip: "Components are not available in this recreation." }),
    chk("keepTools", "Keep Tools", false),
    previewRow(),
  ],
  init(dlg, f) { Object.assign(dlg.values, { target: bodyRefs([f.target]), tools: bodyRefs(f.tools), operation: f.operation || "join", algorithm: f.algorithm || "standard", keepTools: !!f.keepTools }); },
  make(v) {
    const target = firstBody(v, "target");
    const tools = (v.tools || []).map((r) => r.body).filter((b) => b && b !== target);
    if (!target || !tools.length) return null;
    return { type: "meshCombine", target, tools, operation: v.operation, algorithm: v.algorithm, keepTools: !!v.keepTools };
  },
  prompt: (d) => (!(d.values.target || []).length ? "Select target body" : !(d.values.tools || []).length ? "Select bodies to combine with target body" : "Adjust operation or selection set"),
});
cmd({
  id: "ParaMeshSmoothCommand", title: "Smooth", type: "meshSmooth",
  help: "Smooths rough or creased regions on a mesh body.",
  rows: () => [meshRow("targets", "Body/Face Groups", "Select mesh body or face groups to smooth"), unit01("smoothness", "Smoothness", "0.50"), previewRow()],
  init(dlg, f) { Object.assign(dlg.values, { targets: refsOf(dlg.app, f.targets, dlg.baseState), smoothness: str(f.smoothness, "0.50") }); },
  make(v) { const targets = targetsOf(v.targets); return targets.length ? { type: "meshSmooth", targets, smoothness: v.smoothness } : null; },
});
cmd({
  id: "ParaMeshSmoothBoundaryCommand", title: "Smooth Boundary", type: "meshSmoothBoundary",
  help: "Smooths the boundary edges of a mesh body.",
  rows: () => [
    meshRow("targets", "Body/Face Groups", "Select mesh body or face groups to smooth boundary"),
    unit01("smoothness", "Smoothness", "0.50"),
    val("rings", "Number of Rings", "none", "2", { integer: true, min: 0, max: 20, step: 1 }),
    chk("preserveShape", "Preserve Shape", false, { tooltip: "Keeps the smoothed vertices on the original surface." }),
    previewRow(),
  ],
  init(dlg, f) { Object.assign(dlg.values, { targets: refsOf(dlg.app, f.targets, dlg.baseState), smoothness: str(f.smoothness, "0.50"), rings: str(f.rings, "2"), preserveShape: !!f.preserveShape }); },
  make(v) { const targets = targetsOf(v.targets); return targets.length ? { type: "meshSmoothBoundary", targets, smoothness: v.smoothness, rings: v.rings, preserveShape: !!v.preserveShape } : null; },
});
cmd({
  id: "ParaMeshReverseNormalsCommand", title: "Reverse Normal", type: "meshReverseNormals",
  help: "Reverses the normal direction of selected faces on a mesh body.",
  rows: () => [meshRow("targets", "Body/Face Group", "Select a mesh body, face groups or faces to reverse")],
  init(dlg, f) { dlg.values.targets = refsOf(dlg.app, f.targets, dlg.baseState); },
  make(v) { const targets = targetsOf(v.targets); return targets.length ? { type: "meshReverseNormals", targets } : null; },
});
cmd({
  id: "ParaMeshCloseCracksCommand", title: "Close Cracks", type: "meshCloseCracks",
  help: "Closes small cracks and gaps in a mesh body.",
  rows: () => [bodyRow("body", "Body", "Select a mesh body to close cracks"), { id: "analysis", type: "text", label: "Quick Analysis", sep: true, text: (dlg) => analysisText(dlg, firstBody(dlg.values, "body")) }],
  init(dlg, f) { dlg.values.body = bodyRefs([f.body]); },
  make(v) { const body = firstBody(v, "body"); return body ? { type: "meshCloseCracks", body } : null; },
});
cmd({
  id: "ParaMeshEraseAndFillCommand", title: "Erase And Fill", type: "meshEraseFill", defaultMode: "face",
  help: "Removes and replaces faces on a mesh body to fill holes and repair regions.",
  rows: () => [
    meshRow("targets", "Selection", "Select faces to repair or double-click a face at the edge of a hole to fill", { modes: ["face", "group"] }),
    dd("fillType", "Type", [["minimal", "Minimal"], ["smooth", "Smooth"], ["uniform", "Uniform"]], "smooth"),
    unit01("density", "Density", "0.50", { visible: (v) => v.fillType !== "minimal" }),
    previewRow(),
  ],
  init(dlg, f) { Object.assign(dlg.values, { targets: refsOf(dlg.app, f.targets, dlg.baseState), fillType: f.fillType || "smooth", density: str(f.density, "0.50") }); },
  make(v) { const targets = targetsOf(v.targets); return targets.length ? { type: "meshEraseFill", targets, fillType: v.fillType, density: v.density } : null; },
});
cmd({
  id: "ParaMeshBridgeCommand", title: "Bridge", type: "meshBridge", defaultMode: "group",
  help: "Bridges two regions of a mesh body by creating connecting geometry between them.",
  rows: () => [
    meshRow("targets", "Body/Face Groups", "Select mesh body or face groups to bridge", { modes: ["group", "face", "body"] }),
    unit01("density", "Density", "0.50"),
    chk("newGroup", "Allow Face Group Creation", true),
    previewRow(),
  ],
  init(dlg, f) { Object.assign(dlg.values, { targets: refsOf(dlg.app, f.targets, dlg.baseState), density: str(f.density, "0.50"), newGroup: f.newGroup !== false }); },
  make(v) { const targets = targetsOf(v.targets); return targets.length ? { type: "meshBridge", targets, density: v.density, newGroup: !!v.newGroup } : null; },
});
cmd({
  id: "ParaMeshAlignCommand", title: "Mesh Align", type: "meshAlign", defaultMode: "group",
  help: "Aligns a face on a mesh body to a plane with one transformation. Select a mesh face, then select a plane to align the body to.",
  rows: () => [
    meshRow("from", "From", "Select one face to align the body to a plane", { modes: ["group", "face"], max: 1 }),
    planeRow("to", "To", "Select a plane"),
    chk("flip", "Flip", false),
    previewRow(),
  ],
  init(dlg, f) { Object.assign(dlg.values, { from: refsOf(dlg.app, [f.from], dlg.baseState).slice(0, 1), to: [refFromPlaneRef(f.plane, dlg.baseState)].filter(Boolean), flip: !!f.flip }); },
  make(v) {
    const from = targetsOf(v.from)[0];
    const pr = planeRefFromRef((v.to || [])[0]);
    if (!from || !pr) return null;
    return { type: "meshAlign", from, plane: pr, flip: !!v.flip };
  },
});
cmd({
  id: "ParaMeshAttractToReferenceCommand", title: "Attract to Reference", type: "meshAttract",
  help: "Attracts selected faces on a mesh body towards a reference mesh body. Select faces on a mesh body to edit, select a reference mesh body, then adjust density, smoothness, and offset to control the attraction.",
  rows: () => [
    meshRow("targets", "Selection", "Select a mesh body, face groups or faces to attract"),
    bodyRow("reference", "Reference Mesh", "Select the reference mesh body"),
    unit01("density", "Density", "0.50", { tooltip: "Controls how precisely the selection follows the reference mesh. Higher values produce more triangles." }),
    unit01("smoothness", "Smoothness", "0.30", { tooltip: "Controls the regularity of the modified triangles. Higher values produce more regular triangles." }),
    val("offset", "Offset", "length", "0.00 mm", { tooltip: "Offset distance relative to the reference mesh." }),
    chk("sharp", "Find Sharp Edges", false, { tooltip: "Attempts to retain sharp edges on the modified mesh." }),
    chk("keepGroups", "Preserve Group Boundaries", false),
    chk("keepBoundary", "Preserve Mesh Boundaries", true),
    previewRow(),
  ],
  init(dlg, f) { Object.assign(dlg.values, { targets: refsOf(dlg.app, f.targets, dlg.baseState), reference: bodyRefs([f.reference]), density: str(f.density, "0.50"), smoothness: str(f.smoothness, "0.30"), offset: str(f.offset, "0.00 mm"), sharp: !!f.sharp, keepGroups: !!f.keepGroups, keepBoundary: f.keepBoundary !== false }); },
  make(v) {
    const targets = targetsOf(v.targets);
    const reference = firstBody(v, "reference");
    if (!targets.length || !reference) return null;
    return { type: "meshAttract", targets, reference, density: v.density, smoothness: v.smoothness, offset: v.offset, sharp: !!v.sharp, keepGroups: !!v.keepGroups, keepBoundary: !!v.keepBoundary };
  },
});
// Texture Extrude: the image is read with <input type=file>, reduced to a grey-scale map (max 160 px) and kept in
// the feature ({w, h, data: base64 bytes}) so the document re-evaluates without the file.
async function readImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(`Cannot insert ${file.name}. It may be corrupt, damaged, or in an unsupported file format.`)); im.src = url; });
    const k = Math.min(1, 160 / Math.max(img.width, img.height));
    const w = Math.max(2, Math.round(img.width * k)), h = Math.max(2, Math.round(img.height * k));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = Math.round(0.299 * px[4 * i] + 0.587 * px[4 * i + 1] + 0.114 * px[4 * i + 2]);
    let s = "";
    for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
    return { w, h, data: btoa(s), name: file.name };
  } finally { URL.revokeObjectURL(url); }
}
cmd({
  id: "ParaMeshTextureCommand", title: "Texture Extrude", type: "meshTexture",
  help: "Uses an image to add surface texture to a mesh body. Lighter areas of the image are extruded further.",
  rows: () => [
    meshRow("targets", "Body/Face Groups", "Select face groups or a body to texture"),
    {
      id: "image", type: "text", label: "Image", text: (dlg) => (dlg._img ? dlg._img.name || "Image" : "Select image..."),
      extra: (dlg) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "msh-file-btn";
        b.dataset.input = "imageButton";
        b.title = "Select image...";
        b.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" fill="#fff" stroke="#5b6b7a"/><path d="M2.5 12l3.5-4 2.5 2.5 2-2 3 3.5z" fill="#7fb35b"/><circle cx="11" cy="5.5" r="1.3" fill="#f0b43c"/></svg>';
        const inp = document.createElement("input");
        inp.type = "file"; inp.accept = "image/*"; inp.style.display = "none"; inp.dataset.input = "imageFile";
        inp.addEventListener("change", () => {
          const file = inp.files && inp.files[0];
          inp.value = "";
          if (!file) return;
          readImage(file).then((img) => { if (dlg.closed) return; dlg._img = img; dlg.refresh(); dlg.previewNow(); }).catch((e) => dlg.app.toast(e.message || String(e), "error"));
        });
        b.addEventListener("click", () => inp.click());
        const w = document.createElement("span");
        w.append(b, inp);
        return w;
      },
    },
    dd("projection", "Projection Type", [["planar", "Planar"], ["box", "Box"], ["cylindrical", "Cylindrical"], ["spherical", "Spherical"]], "planar"),
    val("distance", "Extrude Distance", "length", "1.00 mm"),
    dd("extrudeType", "Extrude Type", [["asymmetric", "Asymmetric"], ["symmetric", "Symmetric"]], "asymmetric"),
    chk("flip", "Flip", false, { tooltip: "Extrudes the dark areas instead of the light ones." }),
    chk("repeat", "Repeat", true),
    val("multiplicity", "Multiplicity", "none", "1", { positive: true, step: 1 }),
    unit01("density", "Density", "0.50"),
    val("blend", "Blend Distance", "length", "0.00 mm", { nonNegative: true }),
    previewRow(),
  ],
  init(dlg, f) { dlg._img = f.image || null; Object.assign(dlg.values, { targets: refsOf(dlg.app, f.targets, dlg.baseState), projection: f.projection || "planar", distance: str(f.distance, "1.00 mm"), extrudeType: f.symmetric ? "symmetric" : "asymmetric", flip: !!f.flip, repeat: f.repeat !== false, multiplicity: str(f.multiplicity, "1"), density: str(f.density, "0.50"), blend: str(f.blend, "0.00 mm") }); },
  make(v, d) {
    const targets = targetsOf(v.targets);
    if (!targets.length || !d._img) return null;
    const { name, ...img } = d._img;
    return { type: "meshTexture", targets, image: { ...img, name }, projection: v.projection, distance: v.distance, symmetric: v.extrudeType === "symmetric", flip: !!v.flip, repeat: !!v.repeat, multiplicity: v.multiplicity, density: v.density, blend: v.blend };
  },
  prompt: (d) => (!(d.values.targets || []).length ? "Select face groups or a body to texture" : !d._img ? "Select a texture image in the dialog" : "Adjust extrude and image settings"),
});
const pointWorld = (app, r) => {
  if (!r || r.kind === "originPoint") return [0, 0, 0];
  if (r.kind === "sketchPoint") { const s = app.sketchState(r.sketch); const q = s && s.sk.points[r.point]; return q ? K.toWorld(s.plane, q.x, q.y) : [0, 0, 0]; }
  return r.p || [0, 0, 0];
};
cmd({
  id: "ParaMeshScaleCommand", title: "Scale Mesh", type: "meshScale",
  help: "Scales mesh bodies from a reference point.",
  rows: () => [
    bodyRow("bodies", "Entities", "Select mesh bodies to scale", { max: 0 }),
    { id: "point", type: "selection", label: "Point", kinds: ["vertex", "sketchPoint", "originPoint"], max: 1, toggle: false, prompt: "Select a point to scale from", default: [{ kind: "originPoint" }] },
    dd("scaleType", "Scale Type", [["uniform", "Uniform"], ["nonUniform", "Non Uniform"]], "uniform"),
    val("factor", "Scale Factor", "none", "1.00", { positive: true, step: 0.1, visible: (v) => v.scaleType !== "nonUniform" }),
    val("sx", "X Scale", "none", "1.00", { positive: true, step: 0.1, visible: (v) => v.scaleType === "nonUniform" }),
    val("sy", "Y Scale", "none", "1.00", { positive: true, step: 0.1, visible: (v) => v.scaleType === "nonUniform" }),
    val("sz", "Z Scale", "none", "1.00", { positive: true, step: 0.1, visible: (v) => v.scaleType === "nonUniform" }),
  ],
  init(dlg, f) {
    Object.assign(dlg.values, { bodies: bodyRefs(f.bodies), point: [f.point && f.point.some((x) => x) ? { kind: "vertex", body: null, p: f.point } : { kind: "originPoint" }], scaleType: f.scaleType || "uniform" });
    for (const k of ["factor", "sx", "sy", "sz"]) if (f[k] !== undefined) dlg.values[k] = String(f[k]);
  },
  make(v, d) {
    const bodies = (v.bodies || []).map((r) => r.body).filter(Boolean);
    if (!bodies.length) return null;
    const f = { type: "meshScale", bodies, point: pointWorld(d.app, (v.point || [])[0]), scaleType: v.scaleType };
    if (v.scaleType === "nonUniform") Object.assign(f, { sx: v.sx, sy: v.sy, sz: v.sz }); else f.factor = v.factor;
    return f;
  },
  manipulators(dlg) {
    const ids = (dlg.values.bodies || []).map((r) => r.body);
    const e = ids[0] && meshEntryOf(dlg.app, ids[0], dlg.baseState);
    if (!e || dlg.values.scaleType === "nonUniform") return [];
    const bb = A.bbox(workFor(e.mesh));
    const c = pointWorld(dlg.app, (dlg.values.point || [])[0]);
    let d = A.sub(bb.c, c);
    d = A.len(d) > 1e-6 ? A.norm(d) : [1, 0, 0];
    const m = dlg.valueManip("factor", { origin: c, dir: d, scale: Math.max(1, bb.size / 2), min: 0.01, fixedDir: true });
    return m ? [m] : [];
  },
});
cmd({
  id: "ParaMeshRemoveCommand", title: "Remove", type: "meshRemove",
  help: "Removes mesh bodies from the design (a Remove feature in the timeline).",
  rows: () => [bodyRow("bodies", "Body", "Select bodies to remove", { max: 0 })],
  init(dlg, f) { dlg.values.bodies = bodyRefs(f.bodies); },
  make(v) { const bodies = (v.bodies || []).map((r) => r.body).filter(Boolean); return bodies.length ? { type: "meshRemove", bodies } : null; },
  prompt: (d) => ((d.values.bodies || []).length ? "Adjust selection set" : "Select a mesh body to remove"),
});
cmd({
  id: "ParaMeshExtractCommand", title: "Separate", type: "meshSeparate",
  help: "Separates regions of a mesh body into independent mesh bodies.",
  rows: () => [
    bodyRow("body", "Body", "Select mesh body to separate"),
    dd("sepType", "Type", [["shells", "Mesh Shells"], ["groups", "All Face Groups"], ["selGroups", "Select Face Groups"], ["selFaces", "Select Faces"]], "shells"),
    meshRow("groups", "Face Groups", "Select mesh face groups to separate", { modes: ["group"], sameBody: true, visible: undefined }),
    meshRow("faces", "Faces", "Select mesh faces to separate", { modes: ["face"], sameBody: true }),
    chk("multiple", "Multiple Bodies", true, { visible: (v) => v.sepType === "selGroups" || v.sepType === "selFaces" }),
    chk("keep", "Keep Body", false),
    previewRow(),
  ].map((r) => (r.id === "groups" ? { ...r, visible: (v) => v.sepType === "selGroups", min: 0 } : r.id === "faces" ? { ...r, visible: (v) => v.sepType === "selFaces", min: 0 } : r)),
  onChange(id, dlg) {
    if (id === "sepType") setMode(dlg.values.sepType === "selFaces" ? "face" : dlg.values.sepType === "selGroups" ? "group" : "body");
    if (id === "groups" || id === "faces") { const r = (dlg.values[id] || [])[0]; if (r && !(dlg.values.body || []).length) dlg.set("body", [{ kind: "body", body: r.body }], { noPreview: true }); }
  },
  init(dlg, f) {
    Object.assign(dlg.values, { body: bodyRefs([f.body]), sepType: f.sepType || "shells", multiple: f.multiple !== false, keep: !!f.keep });
    if (f.groups) dlg.values.groups = refsOf(dlg.app, [{ body: f.body, groups: f.groups }], dlg.baseState);
    if (f.tris) dlg.values.faces = refsOf(dlg.app, [{ body: f.body, tris: f.tris }], dlg.baseState);
  },
  make(v, d) {
    const body = firstBody(v, "body") || firstBody(v, v.sepType === "selFaces" ? "faces" : "groups");
    if (!body) return null;
    const f = { type: "meshSeparate", body, sepType: v.sepType, keep: !!v.keep, multiple: !!v.multiple };
    if (v.sepType === "selGroups") { f.groups = [...new Set((v.groups || []).filter((r) => r.body === body).map((r) => r.group))]; if (!f.groups.length) return null; }
    if (v.sepType === "selFaces") { f.tris = [...new Set((v.faces || []).filter((r) => r.body === body).map((r) => r.tri))]; if (!f.tris.length) return null; }
    const e = meshEntryOf(d.app, body, d.baseState);
    if (!e) return null;
    const regions = separateRegions(workFor(e.mesh), f);
    f.count = Math.max(0, regions.length - (f.keep ? 0 : 1));
    if (!f.count) throw new Error("There is nothing to separate: the body has one region");
    if (f.count > 200) throw new Error(`The body would be separated into ${f.count} bodies: select fewer regions`);
    return f;
  },
  newBodies: (f) => new Array(f.count).fill(null),
});

// ------------------------------------------------------------------ CREATE / convert
cmd({
  id: "ParaMeshTessellateCommand", title: "Tessellate", type: "meshTessellate", single: true, direct: false,
  help: "Converts an existing solid or surface body into a mesh body. The B-rep faces become face groups.",
  rows: () => [
    bodyRow("body", "Body", "Select a solid or surface body to tessellate", { brep: true }),
    dd("refinement", "Refinement", [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["custom", "Custom"]], "medium"),
    {
      id: "settings", type: "group", label: "Refinement Settings", visible: (v) => v.refinement === "custom",
      rows: [
        val("surfDev", "Surface Deviation", "length", "0.05 mm", { positive: true }),
        val("normDev", "Normal Deviation", "angle", "10.0 deg", { positive: true }),
        val("maxEdge", "Maximum Edge Length", "length", "0.00 mm", { nonNegative: true, tooltip: "0 = no limit" }),
        val("aspect", "Aspect Ratio", "none", "0.00", { nonNegative: true }),
      ],
    },
    previewRow(),
  ],
  init(dlg, f) { Object.assign(dlg.values, { body: bodyRefs([f.body]), refinement: f.refinement || "medium" }); for (const k of ["surfDev", "normDev", "maxEdge", "aspect"]) if (f[k] !== undefined) dlg.values[k] = String(f[k]); },
  make(v) {
    const body = firstBody(v, "body");
    if (!body) return null;
    const f = { type: "meshTessellate", body, refinement: v.refinement };
    if (v.refinement === "custom") Object.assign(f, { surfDev: v.surfDev, normDev: v.normDev, maxEdge: v.maxEdge, aspect: v.aspect });
    return f;
  },
  newBodies: (f, doc) => [((doc.bodies[f.body] || {}).name || "Body") + " (Mesh)"],
  after(doc, nf) { if (doc.bodies[nf.body]) doc.bodies[nf.body].visible = false; },
  status: (d) => { const r = d.previewRes; return r && r.ok && r.triangles ? `Triangle Count : ${r.triangles.toLocaleString()}` : ""; },
  prompt: (d) => ((d.values.body || []).length ? "Adjust refinement settings" : "Select a solid or surface body to tessellate"),
});
cmd({
  id: "ParaMeshConvertCommand", title: "Convert Mesh", type: "meshConvert", single: true, brepResult: true, direct: false,
  help: "Converts a mesh body to a solid or surface body. Faceted makes one face per triangle; Prismatic merges coplanar faces into planar faces.",
  rows: () => [
    bodyRow("body", "Body", "Select mesh body to convert"),
    dd("operation", "Operation", [["parametric", "Parametric", { tooltip: "Converts the mesh body to a solid or surface body in the timeline." }], ["baseFeature", "Base Feature"]], "parametric"),
    dd("method", "Method", [["faceted", "Faceted"], ["prismatic", "Prismatic"], ["organic", "Organic"]], "prismatic", { tooltip: "Faceted: one face per triangle. Prismatic: coplanar triangles merge into planar faces. Organic: a smooth body through the mesh (quads from Convert To Quad Mesh give the best result)." }),
    previewRow(),
  ],
  init(dlg, f) { Object.assign(dlg.values, { body: bodyRefs([f.body]), operation: f.operation || "parametric", method: f.method || "prismatic" }); },
  make(v, d) {
    const body = firstBody(v, "body");
    if (!body) return null;
    const e = meshEntryOf(d.app, body, d.baseState);
    if (e && e.mesh.indices && e.mesh.indices.length / 3 > 10000) d.message("This mesh has more than 10000 Triangles. Calculation will take a considerable amount of time.", "warning");
    return { type: "meshConvert", body, operation: v.operation, method: v.method };
  },
  newBodies: () => [null],
  after(doc, nf) { if (doc.bodies[nf.body]) doc.bodies[nf.body].visible = false; },
});
cmd({
  id: "ParaMeshToQuadMeshCommand", title: "Convert To Quad Mesh", type: "meshQuad",
  help: "Converts a mesh body or face groups with triangular faces to a mesh body or face groups with quad faces.",
  rows: () => [
    meshRow("targets", "Body/Face Groups", "Select mesh body or face groups to convert"),
    val("edgeLength", "Target Edge Length", "length", "1.00 mm", { positive: true }),
    chk("sharp", "Preserve Sharp Edges", true),
    chk("boundary", "Preserve Boundaries", true),
    previewRow(),
  ],
  onOpen(dlg, f0) { if (!f0) setEdgeDefault(dlg, "targets", "edgeLength"); },
  onChange(id, dlg) { if (id === "targets" && !dlg.touched.has("edgeLength")) setEdgeDefault(dlg, "targets", "edgeLength"); },
  init(dlg, f) { Object.assign(dlg.values, { targets: refsOf(dlg.app, f.targets, dlg.baseState), edgeLength: str(f.edgeLength, "1.00 mm"), sharp: f.sharp !== false, boundary: f.boundary !== false }); },
  make(v) { const targets = targetsOf(v.targets); return targets.length ? { type: "meshQuad", targets, edgeLength: v.edgeLength, sharp: !!v.sharp, boundary: !!v.boundary } : null; },
});
