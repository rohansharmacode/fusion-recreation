// External components: the link store (doc.xrefs), the Insert Component feature, the browser decoration of
// external components, and Edit In Place (the EIPToolbar commands).
import { uid, clone, baseName, fileInput, parseDesign, readText, isIdentity, geometryOf, esc, checkListRow, rangeRow } from "./util.js";

let M = null;
const CACHE = new Map(); // key (link uid + referenced shapes) -> { state, results }
const CTX = { bodies: null, session: null }; // host bodies that eipref features read ({get(id) -> {shape}})
const SHAPE_IDS = new WeakMap();
let shapeSeq = 0;
const shapeId = (s) => { let i = SHAPE_IDS.get(s); if (!i) { i = ++shapeSeq; SHAPE_IDS.set(s, i); } return i; };
const NO_DEPS = () => ({ sketches: [], bodies: [], features: [], cplanes: [], geo: [] });

// ------------------------------------------------------------------ link store
export const xrefOf = (doc, id) => (doc && doc.xrefs && doc.xrefs[id]) || null;

/** Add a link record to the document (inside app.mutate). */
export function addXref(d, { file, doc, savedAt }) {
  d.xrefs = d.xrefs || {};
  d.counters = d.counters || {};
  d.counters.xref = (d.counters.xref || 0) + 1;
  const x = { id: `x${d.counters.xref}`, file: file || "design.json", name: baseName(file), stamp: 1, uid: uid(), savedAt: savedAt || 0, doc };
  d.xrefs[x.id] = x;
  return x;
}

const refIdsOf = (xdoc) => (xdoc.features || []).filter((f) => f.type === "eipref" && !f.suppressed).flatMap((f) => f.refs || []);
const refBodiesOf = (xdoc) => new Set((xdoc.features || []).filter((f) => f.type === "eipref").flatMap((f) => f.newBodies || []));

/** Evaluate the linked design (cached per link version and per referenced host shape). */
export function evalXref(x, hostBodies) {
  let key = x.uid;
  for (const r of refIdsOf(x.doc)) { const b = hostBodies && hostBodies.get(r); key += `|${r}:${b && b.shape ? shapeId(b.shape) : 0}`; }
  let hit = CACHE.get(key);
  if (hit) return hit;
  const prev = CTX.bodies;
  CTX.bodies = hostBodies || { get: () => null };
  try {
    const r = new M.Evaluator().run(x.doc, {});
    hit = { state: r.state, results: r.results, params: r.params };
  } finally { CTX.bodies = prev; }
  CACHE.set(key, hit);
  if (CACHE.size > 12) CACHE.delete(CACHE.keys().next().value);
  return hit;
}

/** Ids of the bodies of the linked design that an insert brings in (solid, surface and mesh bodies). */
export function nestedBodyIds(x) {
  const r = evalXref(x, null);
  const skip = refBodiesOf(x.doc);
  const ids = [...r.state.bodies.keys()];
  if (r.state.meshBodies) for (const id of r.state.meshBodies.keys()) ids.push(id);
  return ids.filter((id) => !skip.has(id));
}
export function nestedMeta(x, id) {
  const base = M.isInstanceId && M.isInstanceId(id) ? M.instanceBase(id) : id;
  return (x.doc.bodies && x.doc.bodies[base]) || {};
}
export function copyMeta(d, x, nid, hid) {
  if (!hid || !d.bodies[hid]) return;
  const m = nestedMeta(x, nid);
  d.bodies[hid] = { ...d.bodies[hid], ...clone(m), name: m.name || d.bodies[hid].name };
}

/** Replace the content of a link (inside app.mutate): new version stamp, features that read it are refreshed. */
export function updateXref(d, xid, newDoc, file) {
  const x = d.xrefs && d.xrefs[xid];
  if (!x) return null;
  x.doc = newDoc;
  x.stamp = (x.stamp || 1) + 1;
  x.uid = uid();
  if (file) { x.file = file; x.name = baseName(file); }
  const ids = nestedBodyIds(x);
  for (const f of d.features) {
    if (f.xref !== xid) continue;
    f.xv = x.uid;
    if (f.type !== "insertcomp") continue;
    const src = f.srcBodies || (f.srcBodies = []);
    for (const id of ids) if (!src.includes(id)) src.push(id);
    const before = (f.newBodies || []).length;
    M.assignBodies(d, f);
    for (let i = before; i < src.length; i++) copyMeta(d, x, src[i], f.newBodies[i]);
  }
  return x;
}

/** The insert feature of an external occurrence (null for internal components and broken links). */
export function externalFeature(doc, oid) {
  if (!doc || !doc.features) return null;
  for (let i = 0; i < doc.marker && i < doc.features.length; i++) {
    const f = doc.features[i];
    if (f.type === "insertcomp" && f.newOcc === oid && !f.broken && !f.suppressed) return f;
  }
  return null;
}

// ------------------------------------------------------------------ feature types
function registerFeatures(app) {
  M.registerFeature("insertcomp", {
    label: "Insert Component",
    stem: "Insert",
    fields: {},
    makesBodies: (f) => (f.srcBodies || []).length,
    apply(st, f, P, doc) {
      const x = xrefOf(doc, f.xref);
      if (!x) throw new Error("The source design of this component is missing");
      const r = evalXref(x, st.bodies);
      const parent = f.occ && st.occ && st.occ.has(f.occ) ? f.occ : M.ROOT;
      const T = st.occ ? M.occTransform(st, parent) : null;
      const move = T && !isIdentity(T);
      const skip = refBodiesOf(x.doc);
      const affected = [];
      (f.srcBodies || []).forEach((nid, i) => {
        const hid = f.newBodies && f.newBodies[i];
        if (!hid || skip.has(nid)) return;
        const nb = r.state.bodies.get(nid);
        if (nb) {
          st.bodies.set(hid, { ...nb, id: hid, shape: move ? M.transformShape(nb.shape, T) : nb.shape, from: f.id });
          affected.push(hid);
          return;
        }
        const mb = r.state.meshBodies && r.state.meshBodies.get(nid);
        if (mb && st.meshBodies) {
          let mesh = mb;
          try { if (move && mb.mesh && M.transformMesh) mesh = { ...mb, mesh: M.transformMesh(mb.mesh, T) }; } catch { mesh = mb; }
          st.meshBodies.set(hid, { ...mesh, id: hid, from: f.id });
          affected.push(hid);
        }
      });
      return { affected, file: x.file, stamp: x.stamp };
    },
    deps: NO_DEPS,
    editor: (a, id) => startEditInPlace(a, id),
    icon: "FusionImportCommandFromToolbar",
  });

  M.registerFeature("eipref", {
    label: "Reference",
    stem: "Reference",
    fields: {},
    makesBodies: (f) => (f.refs || []).length,
    apply(st, f) {
      const src = CTX.bodies || CTX.session;
      const affected = [];
      const missing = [];
      (f.refs || []).forEach((rid, i) => {
        const id = f.newBodies && f.newBodies[i];
        const b = src ? src.get(rid) : null;
        if (!id) return;
        if (!b || !b.shape) { missing.push(rid); return; }
        const shape = f.T0 && !isIdentity(f.T0) ? M.transformShape(b.shape, f.T0) : b.shape;
        st.bodies.set(id, { id, shape, from: f.id });
        affected.push(id);
      });
      return { affected, missing };
    },
    deps: NO_DEPS,
    icon: "ReferenceObjectsCmd",
  });
}

// ------------------------------------------------------------------ Insert Component
/** Insert a parsed design as a new external component. Returns the insert feature (or null). */
export function insertDesign(app, file, parsed, opts = {}) {
  let made = null;
  let count = 0;
  app.mutate("Insert Component", (d) => {
    const x = addXref(d, { file, doc: parsed.doc, savedAt: parsed.savedAt });
    const ids = nestedBodyIds(x);
    count = ids.length;
    const f = { type: "insertcomp", operation: "newComponent", xref: x.id, xv: x.uid, srcBodies: ids };
    app._prepareFeature(d, f);
    ids.forEach((nid, i) => copyMeta(d, x, nid, f.newBodies && f.newBodies[i]));
    if (f.newComp && d.components && d.components[f.newComp]) d.components[f.newComp].name = x.name;
    d.features.splice(d.marker, 0, f);
    d.marker += 1;
    made = f;
  });
  if (!made) return null;
  if (!count) app.toast(`${baseName(file)} has no bodies`, "warn");
  if (opts.move !== false && made.newOcc && app.components && app.components.alive(made.newOcc)) {
    try {
      app.selection.set([{ kind: "occurrence", occ: made.newOcc }]);
      app.commands.run("FusionMoveCommand", {});
    } catch (e) { console.warn("insertx: move after insert", e); }
  }
  return made;
}

function pickDesign(app, inputId, onDesign) {
  const input = fileInput(inputId, ".json,application/json", async (file) => {
    try {
      const parsed = parseDesign(app, await readText(file));
      onDesign(file.name || "design.json", parsed);
    } catch (e) {
      app.toast(String((e && e.message) || e), "error");
    }
  });
  try { input.click(); } catch { /* the test harness sets the file directly */ }
  return input;
}

function runInsert(app) {
  if (app.mode === "sketch") { app.toast("Finish the sketch before inserting a component", "warn"); return null; }
  app.setStatus && app.setStatus("Select a design file (.json exported from this app) to insert");
  return pickDesign(app, "insertComponentFile", (name, parsed) => insertDesign(app, name, parsed));
}

// ------------------------------------------------------------------ browser decoration
const LINK_SVG = '<svg class="ix-link" viewBox="0 0 16 16" width="12" height="12" aria-label="External component"><path d="M6.5 9.5l3-3M7 4.6l1.2-1.2a2.6 2.6 0 013.7 3.7L10.7 8.3M9 11.4l-1.2 1.2a2.6 2.6 0 01-3.7-3.7L5.3 7.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

function decorate(node, oid, app) {
  const f = externalFeature(app.doc, oid);
  if (!f) return;
  const x = xrefOf(app.doc, f.xref);
  if (!x) return;
  node.badge = (node.badge || "") + LINK_SVG;
  node.external = true;
  node.tip = `${node.tip ? `${node.tip}<br>` : ""}External component: ${esc(x.file)} v${x.stamp}`;
  const base = node.menu;
  node.menu = () => {
    const items = typeof base === "function" ? base() || [] : [];
    return [
      ...items, "-",
      { label: "Edit In Place", action: () => startEditInPlace(app, f.id) },
      { label: "Update From File", action: () => updateFromFile(app, f.xref) },
      { label: "Break Link", action: () => breakLink(app, f.id) },
    ];
  };
}

export function updateFromFile(app, xid) {
  return pickDesign(app, "updateComponentFile", (name, parsed) => {
    if (!xrefOf(app.doc, xid)) return;
    app.mutate("Update Component", (d) => { updateXref(d, xid, parsed.doc, name); });
    const x = xrefOf(app.doc, xid);
    app.toast(`${x.name} updated to v${x.stamp}`, "info");
  });
}

export function breakLink(app, fid) {
  app.mutate("Break Link", (d) => { const f = d.features.find((q) => q.id === fid); if (f) f.broken = true; });
  if (app.ui.browser) app.ui.browser.invalidate();
}

// ------------------------------------------------------------------ Edit In Place
let SESSION = null;
let ghost = null;
const ENV = "insertx-eip";

export const editInPlaceSession = () => SESSION;

function clearGhost(app) {
  if (!ghost) return;
  const vp = app.viewport;
  try {
    vp.scene.remove(ghost);
    ghost.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (ghost.userData.material) ghost.userData.material.dispose();
  } catch { /* viewport gone */ }
  ghost = null;
  vp && vp.requestRender && vp.requestRender();
}

function buildGhost(app, hostState, hostDoc, exclude, inv) {
  const vp = app.viewport;
  if (!vp || !vp.THREE || !vp.scene) return;
  const THREE = vp.THREE;
  const mat = new THREE.MeshBasicMaterial({ color: 0x8a9bb0, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
  const g = new THREE.Group();
  g.name = "insertx-eip-context";
  g.userData.material = mat;
  const m4 = new THREE.Matrix4().set(inv[0], inv[1], inv[2], inv[3], inv[4], inv[5], inv[6], inv[7], inv[8], inv[9], inv[10], inv[11], 0, 0, 0, 1);
  for (const [id, b] of hostState.bodies) {
    if (exclude.has(id) || !b.shape) continue;
    const meta = hostDoc.bodies[M.isInstanceId && M.isInstanceId(id) ? M.instanceBase(id) : id];
    if (meta && meta.visible === false) continue;
    try {
      const mesh = new THREE.Mesh(geometryOf(THREE, vp.meshFor(b.shape)), mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(m4);
      mesh.renderOrder = 2;
      mesh.raycast = () => {};
      g.add(mesh);
    } catch (e) { console.warn("insertx: context body", e); }
  }
  vp.scene.add(g);
  ghost = g;
  vp.requestRender && vp.requestRender();
}

function syncModeBar() {
  const bar = document.querySelector(`.tb-modebar[data-modebar="${ENV}"]`);
  if (!bar || !SESSION) return;
  const on = (id, v) => { const b = bar.querySelector(`.tb-modebar-btn[data-cmd="${id}"]`); if (b) { b.classList.toggle("ix-on", !!v); b.setAttribute("aria-pressed", v ? "true" : "false"); } };
  on("EIPAssociativeToggleCmd", SESSION.assoc);
  on("EIPNonAssociativeToggleCmd", !SESSION.assoc);
  const ref = bar.querySelector('.tb-modebar-btn[data-cmd="ReferenceObjectsCmd"]');
  if (ref) { ref.classList.toggle("ix-off", !SESSION.assoc); ref.title = SESSION.assoc ? "Creates associative references between the current design and other components, bodies, sketches, and construction geometry in an assembly." : "Unavailable during non-associative Edit In Place."; }
}

export function startEditInPlace(app, fid) {
  if (SESSION) { app.toast("A component is being edited in place already", "warn"); return false; }
  if (app.mode === "sketch") { app.toast("Finish the sketch first", "warn"); return false; }
  if (app._envStack && app._envStack.length) { app.toast("Finish the current environment first", "warn"); return false; }
  const hostDoc = app.doc;
  const f = hostDoc.features.find((q) => q.id === fid && q.type === "insertcomp");
  const x = f && !f.broken ? xrefOf(hostDoc, f.xref) : null;
  if (!f || !x) { app.toast("This component is not an external component", "warn"); return false; }
  const st = app.result && app.result.state;
  if (!st || !st.occ || !st.occ.has(f.newOcc)) { app.toast("The component is not part of the current design state", "warn"); return false; }
  const T = M.occTransform(st, f.newOcc);
  const inv = M.invRigid(T);
  const own = new Set(M.occBodiesDeep(st, f.newOcc));
  const index = hostDoc.features.indexOf(f);
  // host bodies that exist before the insert feature: the objects Reference Objects can link to (evaluated lazily)
  const context = {
    map: null,
    load() { if (!this.map) { try { this.map = new M.Evaluator().run(hostDoc, { upto: index }).state.bodies; } catch (e) { console.warn("insertx: context", e); this.map = new Map(); } } return this.map; },
    get(id) { return this.load().get(id) || null; },
  };
  const nested = clone(x.doc);
  const startJson = JSON.stringify(nested);
  nested.eip = { file: x.file, xref: x.id };
  const label = (app.components && app.components.label(f.newOcc)) || x.name;
  SESSION = { host: hostDoc, fid, xref: x.id, file: x.file, name: label, inv, assoc: true, context, startJson, undo: app.history.undoStack, redo: app.history.redoStack, ctxVisible: true, ctxOpacity: 25 };
  CTX.session = context;
  const hostState = st;
  app.enterEnvironment({
    id: ENV, mode: "model", label: "Edit In Place",
    modeToolbar: "EIPToolbar", modeLabel: `${label} : Edit In Place`,
    onExit: (reason) => endSession(app, reason),
  });
  app.history.undoStack = [];
  app.history.redoStack = [];
  app.evaluator.invalidate();
  app._replaceDoc(nested);
  buildGhost(app, hostState, hostDoc, own, inv);
  setTimeout(syncModeBar, 0);
  app.setStatus && app.setStatus(`Editing ${label} in place. Stop Edit In Place returns to the assembly.`);
  return true;
}

function endSession(app, reason) {
  const s = SESSION;
  if (!s) return;
  SESSION = null;
  CTX.session = null;
  clearGhost(app);
  if (reason === "document") return; // New / Open replaced the document: the host design is dropped with the session
  const edited = clone(app.doc);
  delete edited.eip;
  const changed = JSON.stringify(edited) !== s.startJson;
  app.history.undoStack = s.undo;
  app.history.redoStack = s.redo;
  app.evaluator.invalidate();
  app._replaceDoc(s.host);
  if (changed && xrefOf(app.doc, s.xref)) {
    app.mutate("Edit In Place", (d) => { updateXref(d, s.xref, edited); });
    const x = xrefOf(app.doc, s.xref);
    app.toast(`${x.name} saved as v${x.stamp}`, "info");
  }
}

function needSession(app) {
  if (SESSION) return true;
  app.toast("Available while a component is edited in place (right-click an external component: Edit In Place)", "info");
  return false;
}

function setAssociative(app, v) {
  if (!needSession(app)) return;
  SESSION.assoc = !!v;
  syncModeBar();
  app.setStatus && app.setStatus(v ? "Associative: references to the assembly are kept" : "Non-associative: only local edits");
}

function openReferenceObjects(app) {
  if (!needSession(app)) return null;
  if (!SESSION.assoc) { app.toast("Unavailable during non-associative Edit In Place.", "warn"); return null; }
  const s = SESSION;
  const map = s.context.load();
  const used = new Set(refIdsOf(app.doc));
  const items = [...map.keys()].filter((id) => !used.has(id)).map((id) => ({ key: id, label: (s.host.bodies[id] && s.host.bodies[id].name) || id }));
  return app.ui.dialog.open({
    id: "ReferenceObjectsCmd",
    title: "Reference Objects",
    icon: "ReferenceObjectsCmd",
    featureLabel: "Reference Objects",
    help: "Creates associative references between the current design and other components, bodies, sketches, and construction geometry in an assembly.",
    preview: false, noFeature: true, activate: false, ctrlWidth: 170,
    rows: [checkListRow("refs", "Objects", () => items, { empty: "No bodies of the assembly come before this component" })],
    validate: (dlg) => ((dlg.values.refs || []).length ? null : "Expected at least one selection"),
    status: (dlg) => `${(dlg.values.refs || []).length} selected`,
    commit(_f, dlg) {
      const refs = (dlg.values.refs || []).filter((id) => map.has(id));
      if (!refs.length) return null;
      const f = app.addFeature({ type: "eipref", refs, T0: s.inv.slice() }, "Reference Objects");
      if (f && f.newBodies) {
        app.mutate("Reference Objects", (d) => {
          refs.forEach((rid, i) => { const m = d.bodies[f.newBodies[i]]; const h = s.host.bodies[rid]; if (m && h) m.name = `${h.name} (Reference)`; });
        }, { recompute: false });
      }
      return f;
    },
  });
}

function applyGhostLook(app) {
  if (!ghost || !SESSION) return;
  ghost.visible = SESSION.ctxVisible;
  const mat = ghost.userData.material;
  if (mat) { mat.opacity = Math.max(0.03, Math.min(1, SESSION.ctxOpacity / 100)); mat.depthWrite = SESSION.ctxOpacity >= 99; mat.needsUpdate = true; }
  app.viewport && app.viewport.requestRender && app.viewport.requestRender();
}

function openVisibilityControl(app) {
  if (!needSession(app)) return null;
  const s = SESSION;
  const before = { v: s.ctxVisible, o: s.ctxOpacity };
  return app.ui.dialog.open({
    id: "EIPVisibilityControlCmd",
    title: "Visibility Control",
    icon: "EIPVisibilityControlCmd",
    featureLabel: "Visibility Control",
    help: "Control component visibility and transparency during Edit In Place sessions.",
    preview: false, noFeature: true, activate: false, ctrlWidth: 170,
    rows: [
      { id: "show", type: "check", label: "Show Assembly", tooltip: "Shows the other components of the assembly as context", default: s.ctxVisible },
      rangeRow("opacity", "Opacity", 5, 100, 5, (v) => { if (SESSION) { SESSION.ctxOpacity = v; applyGhostLook(app); } }, { unit: "%" }),
    ],
    init(dlg) { dlg.values.opacity = s.ctxOpacity; },
    onChange(_id, dlg) { if (SESSION) { SESSION.ctxVisible = dlg.values.show !== false; applyGhostLook(app); } },
    commit(_f, dlg) { if (SESSION) { SESSION.ctxVisible = dlg.values.show !== false; SESSION.ctxOpacity = Number(dlg.values.opacity) || 25; applyGhostLook(app); } return true; },
    onClose(dlg, committed) { if (!committed && SESSION) { SESSION.ctxVisible = before.v; SESSION.ctxOpacity = before.o; applyGhostLook(app); } },
  });
}

export function stopEditInPlace(app) {
  if (!needSession(app)) return false;
  app.exitEnvironment(ENV, { reason: "finish" });
  return true;
}

// ------------------------------------------------------------------ init
export function initXref(app) {
  M = app.M;
  registerFeatures(app);

  const reg = (c) => app.commands.register({ kind: "tool", ...c });
  reg({
    id: "FusionImportCommandFromToolbar", label: "Insert Component", icon: "FusionImportCommandFromToolbar",
    tooltip: "Inserts a design from a local file as an external component of this design. The component keeps a link to the file it came from.",
    run: (a) => runInsert(a),
  });
  reg({ id: "EIPAssociativeToggleCmd", label: "Associative", tooltip: "Creates associative references between this external component and other components in the assembly.", checked: () => !!(SESSION && SESSION.assoc), run: (a) => setAssociative(a, true) });
  reg({ id: "EIPNonAssociativeToggleCmd", label: "Non-associative", tooltip: "Only allows local edits. Does not create associative references between this external component and other components in the assembly.", checked: () => !!(SESSION && !SESSION.assoc), run: (a) => setAssociative(a, false) });
  reg({ id: "ReferenceObjectsCmd", label: "Reference Objects", tooltip: "Creates associative references between the current design and other components, bodies, sketches, and construction geometry in an assembly.", run: (a) => openReferenceObjects(a) });
  reg({ id: "EIPVisibilityControlCmd", label: "Visibility Control", tooltip: "Control component visibility and transparency during Edit In Place sessions.", run: (a) => openVisibilityControl(a) });
  reg({ id: "EndEditInPlaceCmd", label: "Stop Edit In Place", tooltip: "Stops editing the component in place and returns to the assembly.", run: (a) => stopEditInPlace(a) });

  app.on("environment", () => setTimeout(syncModeBar, 0));
  const hook = () => {
    const b = app.ui && app.ui.browser;
    if (!b || typeof b.registerOccDecorator !== "function" || hook.done) return;
    hook.done = true;
    b.registerOccDecorator(decorate);
  };
  hook();
  app.on("ready", hook);
  setTimeout(hook, 0);

  return {
    xrefOf: (id) => xrefOf(app.doc, id),
    externalFeature: (oid) => externalFeature(app.doc, oid),
    isExternal: (oid) => !!externalFeature(app.doc, oid),
    insertDesign: (file, parsed, opts) => insertDesign(app, file, parsed, opts),
    editInPlace: (fid) => startEditInPlace(app, fid),
    stopEditInPlace: () => stopEditInPlace(app),
    session: () => (SESSION ? { xref: SESSION.xref, file: SESSION.file, associative: SESSION.assoc } : null),
  };
}
