// menus module: marking menu, S toolbox, file commands (New/Open/Save/Save As/Recovery/Export/3D Print),
// Undo/Redo/Repeat, Change Parameters, Compute All, Show/Hide (V), Keyboard Shortcuts, About,
// Delete-key routing, and Fusion-styled modal dialogs + a generic context menu for other modules.
import "./style.css";
import { createModals } from "./modal.js";
import { createMarkingMenu, createContextMenu } from "./markingmenu.js";
import { createToolbox } from "./toolbox.js";
import { createFiles } from "./files.js";
import { createParams } from "./params.js";
import { createInfo } from "./info.js";
import { createShortcuts } from "./shortcuts.js";

const DELETE_ROUTER = "_menusDeleteSelection";
const DELETE_ROUTER_SKETCH = "_menusDeleteSketchSelection";

export function init(app) {
  const modals = createModals(app);
  const files = createFiles(app, modals);
  const params = createParams(app, modals);
  const info = createInfo(app, modals);
  const shortcuts = createShortcuts(app);
  const mm = createMarkingMenu(app, { runInNewSketch, shortcuts });
  const contextMenu = createContextMenu(app, mm);
  const toolbox = createToolbox(app, { runInNewSketch, contextMenu, shortcuts });

  // ------------------------------------------------------------------ pointer position (toolbox opens at the cursor)
  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, known: false };
  window.addEventListener("pointermove", (ev) => { mouse.x = ev.clientX; mouse.y = ev.clientY; mouse.known = true; }, { passive: true, capture: true });
  function cursor() {
    if (mouse.known) return mouse;
    const h = app.dom.canvasHost;
    if (h) { const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    return mouse;
  }

  // ------------------------------------------------------------------ helpers
  /** Run a sketch tool from the model environment: Create Sketch first, then the tool once the sketch is active. */
  function runInNewSketch(id) {
    if (!app.commands.has("SketchCreate")) { app.commands.run(id); return; }
    let offMode = null, offCmd = null, timer = 0;
    const cleanup = () => { offMode && offMode(); offCmd && offCmd(); clearTimeout(timer); };
    offMode = app.on("mode", ({ mode }) => {
      if (mode !== "sketch") return;
      cleanup();
      setTimeout(() => app.commands.run(id, { source: "deferred" }), 0);
    });
    offCmd = app.on("command-start", ({ id: cid }) => { if (cid !== "SketchCreate") cleanup(); });
    timer = setTimeout(cleanup, 120000);
    app.commands.run("SketchCreate");
  }

  const reg = (d) => app.commands.register(d);
  /** Register only when no real command with this id exists yet (other modules own it otherwise). */
  const regIfFree = (d) => { const p = app.commands.get(d.id); if (!p || p.stub) reg(d); };
  const alias = (id, target, extra = {}) => {
    const t = app.commands.get(target);
    regIfFree({
      id, kind: "ui", alias: true, icon: target,
      label: extra.label || (t && t.label) || id,
      enabled: () => app.commands.isEnabled(target),
      run: (a, ctx) => app.commands.run(target, ctx),
      ...extra,
    });
  };
  /** register() copies the definition, so dynamic properties are re-attached as getters afterwards. */
  const dyn = (d, props) => { for (const [k, get] of Object.entries(props)) Object.defineProperty(d, k, { get, enumerable: true, configurable: true }); return d; };

  function stopEditingForHistory() {
    // If undo/redo removed the active sketch, leave the sketch environment.
    // (SketchStop would try to finish a sketch that no longer exists, so switch modes directly.)
    if (app.mode === "sketch" && app.activeSketch && !app.feature(app.activeSketch)) app.setMode("model", null);
  }

  // ------------------------------------------------------------------ commands: file
  reg({ id: "FileNew", label: "New Design", tooltip: "Creates a new design.", shortcut: "Ctrl+N", kind: "ui", icon: "FileNew", run: () => files.fileNew() });
  reg({ id: "FileOpen", label: "Open", tooltip: "Opens a design saved in this browser, or a design file from your computer.", shortcut: "Ctrl+O", kind: "ui", run: () => files.openDialog() });
  reg({ id: "FileSave", label: "Save", tooltip: "Saves the active design.", shortcut: "Ctrl+S", kind: "ui", run: () => files.save() });
  // Fusion greys Save As out until the design has been saved once (Save asks for the name then)
  reg({ id: "FileSaveAs", label: "Save As", tooltip: "Saves the active design under a new name.", kind: "ui", enabled: () => !!files.current, run: () => files.saveAsCmd() });
  reg({ id: "RecoverySave", label: "Recovery Save", tooltip: "Manually backs up the active design so it can be recovered.", shortcut: "Ctrl+Shift+S", kind: "ui", run: () => files.recoverySave() });
  reg({ id: "FileExport", label: "Export", tooltip: "Exports the design as STEP, STL or a design file.", kind: "ui", run: () => files.exportDialog() });
  reg({ id: "FileExportSTL", label: "3D Print", tooltip: "Exports the selected bodies as an STL mesh for 3D printing.", kind: "ui", run: () => files.print3dDialog() });

  // ------------------------------------------------------------------ commands: edit
  reg({
    id: "Undo", label: "Undo", tooltip: "Undoes the last action.", shortcut: "Ctrl+Z", kind: "ui",
    enabled: () => app.history.canUndo() || !!app.activeCommand,
    run: () => {
      if (app.activeCommand) { app.activeCommand.cancel(); return; }
      mm.close(); toolbox.close();
      app.history.undo();
      stopEditingForHistory();
    },
  });
  reg({
    id: "Redo", label: "Redo", tooltip: "Redoes the last undone action.", shortcut: ["Ctrl+Y", "Ctrl+Shift+Z"], kind: "ui",
    enabled: () => app.history.canRedo() && !app.activeCommand,
    run: () => { app.history.redo(); stopEditingForHistory(); },
  });
  dyn(reg({
    id: "RepeatCommand", label: "Repeat", tooltip: "Repeats the last command.", kind: "ui",
    enabled: () => { const l = app.commands.lastRepeatable; return !!l && app.commands.isEnabled(l); },
    run: () => { const l = app.commands.lastRepeatable; if (l) app.commands.run(l, { repeat: true }); },
  }), {
    label: () => { const l = app.commands.lastRepeatable; const d = l && app.commands.get(l); return d ? `Repeat ${d.label || l}` : "Repeat"; },
    icon: () => app.commands.lastRepeatable || "RepeatCommand",
  });
  reg({
    id: "ShowToolbox", label: "Toolbox", tooltip: "Shows the toolbox at the cursor: search and run any command.", shortcut: "S", kind: "ui",
    run: () => { if (toolbox.isOpen()) { toolbox.close(); return; } mm.close(); contextMenu.close(); const c = cursor(); toolbox.open(c.x, c.y); },
  });
  // Delete key: a sketch-mode router and a model fallback. Commands registered earlier by other
  // modules for the same key (FusionDeleteCommand, a sketch delete) take precedence in core's lookup.
  reg({
    id: DELETE_ROUTER_SKETCH, label: "Delete", hidden: true, kind: "ui", when: "sketch", shortcut: ["Delete", "Backspace"],
    enabled: () => app.selection.items.length > 0,
    run: () => deleteSelection(),
  });
  reg({
    id: DELETE_ROUTER, label: "Delete", hidden: true, kind: "ui", shortcut: ["Delete", "Backspace"],
    enabled: () => app.selection.items.length > 0,
    run: () => deleteSelection(),
  });

  // ------------------------------------------------------------------ commands: modify / inspect / view
  reg({ id: "ChangeParameterCommand", label: "Change Parameters", tooltip: "Displays the Parameters dialog, where you can create and manage equations and relationships to control the size of objects.", kind: "tool", run: () => { app.commands.lastRepeatable = "ChangeParameterCommand"; return params.open(); } });
  reg({
    id: "FusionComputeAllCommand", label: "Compute All", tooltip: "Recomputes every feature in the timeline.", shortcut: "Ctrl+B", kind: "ui",
    enabled: () => !app.activeCommand,
    run: () => {
      const t0 = performance.now();
      app.evaluator.invalidate();
      app.recompute();
      const ms = performance.now() - t0;
      const errs = Object.values(app.result.results).filter((r) => r && r.ok === false).length;
      if (errs) app.toast(`Compute All finished — ${errs} feature${errs === 1 ? "" : "s"} could not be computed`, "warning", 3000);
      else app.toast(`Compute All complete (${ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`})`, "info", 1800);
    },
  });
  reg({
    id: "ToggleVisibility", label: "Show/Hide", tooltip: "Toggles the visibility of the selected objects.", shortcut: "V", kind: "ui",
    enabled: () => visTargets().count > 0,
    run: () => toggleVisibility(),
  });
  reg({ id: "KeyboardShortcuts", label: "Keyboard Shortcuts", tooltip: "Lists the keyboard shortcuts.", kind: "ui", run: () => info.shortcutsDialog() });
  reg({ id: "About", label: "About", tooltip: "About this recreation.", kind: "ui", run: () => info.aboutDialog() });

  // Fusion's own ids for the same commands (marking menu / application bar / help menu use these)
  alias("UndoCommand", "Undo");
  alias("RedoCommand", "Redo");
  alias("VisibilityToggleCmd", "ToggleVisibility", { label: "Show/Hide" });
  alias("NewDocumentCommand", "FileNew");
  alias("OpenCommand", "FileOpen");
  alias("OpenDocumentCommand", "FileOpen");
  alias("SaveDocumentCommand", "FileSave");
  alias("PLM360SaveCommand", "FileSave");
  alias("PLM360SaveAsCommand", "FileSaveAs");
  alias("ExportCommand", "FileExport");
  alias("AboutBoxCommand", "About");
  alias("CommandShortcutsManagerCommand", "KeyboardShortcuts");
  alias("NotifyAutoSaveFilesCommand", "FileOpen", { label: "Recover Documents" });
  regIfFree({
    id: "FusionSaveAsSTLCommand", label: "Save As Mesh", alias: true, kind: "ui", icon: "FileExportSTL",
    enabled: () => app.bodies().length > 0,
    run: () => files.print3dDialog(app.selection.items.filter((r) => r.kind === "body").map((r) => r.body)),
  });

  // ------------------------------------------------------------------ context (marking menu overflow) commands
  // Registered only when no other module provides them.
  const selFeature = () => {
    const it = app.selection.items;
    if (it.length !== 1) return null;
    const r = it[0];
    if (r.kind === "feature" || r.kind === "cplane") return app.feature(r.id);
    if (r.kind === "profile" || r.kind === "sketchCurve" || r.kind === "sketchPoint" || r.kind === "sketchDim") return app.feature(r.sketch);
    return null;
  };
  regIfFree({
    id: "SketchActivate", label: "Edit Sketch", kind: "ui",
    enabled: () => { const f = selFeature(); return !!f && f.type === "sketch" && app.mode !== "sketch"; },
    run: () => { const f = selFeature(); if (f) app.editFeature(f.id); },
  });
  regIfFree({
    id: "FusionEditFeatureCommand", label: "Edit Feature", kind: "ui",
    enabled: () => { const f = selFeature(); return !!f && (app.hasFeatureEditor ? app.hasFeatureEditor(f.type) : !!app.featureEditors[f.type]); },
    run: () => { const f = selFeature(); if (f) app.editFeature(f.id); },
  });
  const selFeatures = () => app.selection.items.filter((r) => r.kind === "feature" || r.kind === "cplane").map((r) => app.feature(r.id)).filter(Boolean);
  regIfFree({
    id: "FusionSuppressCommand", label: "Suppress Features", kind: "ui",
    enabled: () => selFeatures().some((f) => !f.suppressed),
    run: () => { const ids = selFeatures().map((f) => f.id); app.mutate("Suppress Features", (doc) => { for (const f of doc.features) if (ids.includes(f.id)) f.suppressed = true; }); },
  });
  regIfFree({
    id: "FusionUnsuppressCommand", label: "Unsuppress Features", kind: "ui",
    enabled: () => selFeatures().some((f) => f.suppressed),
    run: () => { const ids = selFeatures().map((f) => f.id); app.mutate("Unsuppress Features", (doc) => { for (const f of doc.features) if (ids.includes(f.id)) delete f.suppressed; }); },
  });
  regIfFree({
    id: "ShowAllBodiesCmd", label: "Show All Bodies", kind: "ui",
    enabled: () => app.bodies().some((b) => b.meta && b.meta.visible === false),
    run: () => app.mutate("Show All Bodies", (doc) => { for (const b of app.bodies()) { const m = doc.bodies[b.id]; if (m) m.visible = true; } }),
  });
  regIfFree({
    id: "LookAtCommand", label: "Look At", kind: "ui",
    enabled: () => !!lookAtPlane() && !!(app.viewport && app.viewport.lookAt),
    run: () => { const p = lookAtPlane(); if (p) app.viewport.lookAt(p, { animate: true }); },
  });

  // Overflow-list commands of the marking menu (Remove, Show All, Isolate/Unisolate, orbit centre).
  const bodiesOfSelection = () => [...new Set(app.selection.items.filter((r) => r.kind === "body" || r.kind === "face" || r.kind === "edge" || r.kind === "vertex").map((r) => r.body).filter((b) => b && app.body(b)))];
  regIfFree({
    id: "SoftDeleteCommand", label: "Remove", tooltip: "Removes bodies or components and records it in the timeline.", kind: "ui",
    run: () => {
      const ids = bodiesOfSelection();
      if (!ids.length) { app.toast("Select the bodies to remove, then choose Remove", "info", 2600); return; }
      app.selection.clear();
      app.addFeature({ type: "delete", bodies: ids }, "Remove");
    },
  });
  regIfFree({
    id: "ShowAllComponentsCmd", label: "Show All", tooltip: "Shows all bodies in the design.", kind: "ui",
    run: () => {
      if (!app.bodies().some((b) => b.meta && b.meta.visible === false)) return;
      app.mutate("Show All", (doc) => { for (const b of app.bodies()) { const m = doc.bodies[b.id]; if (m) m.visible = true; } });
    },
  });
  const isolation = { hidden: null };
  regIfFree({
    id: "IsolateCmd", label: "Isolate", tooltip: "Hides everything except the selected bodies.", kind: "ui",
    enabled: () => bodiesOfSelection().length > 0,
    run: () => {
      const keep = new Set(bodiesOfSelection());
      const hide = app.bodies().filter((b) => !keep.has(b.id) && !(b.meta && b.meta.visible === false)).map((b) => b.id);
      isolation.hidden = [...new Set([...(isolation.hidden || []), ...hide])];
      if (hide.length) app.mutate("Isolate", (doc) => { for (const id of hide) if (doc.bodies[id]) doc.bodies[id].visible = false; });
    },
  });
  regIfFree({
    id: "UnisolateAllCmd", label: "Unisolate", tooltip: "Shows the bodies hidden by Isolate.", kind: "ui",
    run: () => {
      const ids = (isolation.hidden || []).filter((id) => app.body(id));
      isolation.hidden = null;
      if (ids.length) app.mutate("Unisolate", (doc) => { for (const id of ids) if (doc.bodies[id]) doc.bodies[id].visible = true; });
    },
  });
  alias("UnisolateCmd", "UnisolateAllCmd", { label: "Unisolate" });
  // Orbit centre: the view does not jump; the orbit target moves to the picked point's depth.
  function viewBack(v) {
    const T = app.viewport && app.viewport.THREE;
    if (!T) return null;
    return new T.Vector3(0, 0, 1).applyQuaternion(new T.Quaternion(...v.quat));
  }
  function setOrbitDepth(p) {
    const vp = app.viewport;
    if (!vp || !vp.getView || !vp.setViewState) return false;
    const v = vp.getView();
    const back = viewBack(v);
    if (!back) return false;
    const T = vp.THREE;
    const eye = new T.Vector3(...v.target).addScaledVector(back, v.dist);
    const d = eye.clone().sub(new T.Vector3(...p)).dot(back);
    if (!(d > 1e-6)) return false;
    const target = eye.clone().addScaledVector(back, -d);
    vp.setViewState({ target: target.toArray(), quat: v.quat, dist: d }, { animate: false });
    return true;
  }
  regIfFree({
    id: "SetOrbitCenterCommand", label: "Set Orbit Center", tooltip: "Sets the point the view orbits around.", kind: "ui",
    run: () => {
      let off = null;
      const done = () => { if (off) { off(); off = null; } app.setStatus && app.setStatus(""); };
      app.setStatus && app.setStatus("Select a point to set the orbit center");
      off = app.input.push({
        name: "set-orbit-center", __menus: true, cursor: "crosshair",
        onPointerDown(ev, ctx) {
          if (ev.button !== 0) return false;
          const h = ctx && ctx.hit;
          if (h && h.point) { setOrbitDepth(h.point); done(); }
          return true;
        },
        onCancel() { done(); return true; },
      });
    },
  });
  regIfFree({
    id: "ResetOrbitCenterCommand", label: "Reset Orbit Center", tooltip: "Resets the orbit center to the middle of the design.", kind: "ui",
    run: () => {
      let c = [0, 0, 0];
      try {
        const bs = app.bodies().filter((b) => b.shape && !(b.meta && b.meta.visible === false));
        if (bs.length) {
          const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
          for (const b of bs) { const bb = b.shape.boundingBox.bounds; for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], bb[0][i]); hi[i] = Math.max(hi[i], bb[1][i]); } }
          c = lo.map((v, i) => (v + hi[i]) / 2);
        }
      } catch { /* keep the origin */ }
      setOrbitDepth(c);
    },
  });

  function lookAtPlane() {
    const K = app.K;
    const it = app.selection.items;
    const r = it.length === 1 ? it[0] : null;
    try {
      if (r && r.kind === "face" && r.planar !== false && r.p && r.n) return K.planeFromNormal(r.p, r.n);
      if (r && r.kind === "originPlane") return K.ORIGIN_PLANES[r.name];
      if (r && (r.kind === "cplane" || r.kind === "feature")) {
        const f = app.feature(r.id);
        if (f && f.type === "cplane") { const ps = app.planeState(f.id); return ps && ps.plane; }
        if (f && f.type === "sketch") { const ss = app.sketchState(f.id); return (ss && ss.plane) || f.plane; }
      }
      if (r && r.sketch) { const ss = app.sketchState(r.sketch); return ss && ss.plane; }
      if (app.mode === "sketch" && app.activeSketch) { const ss = app.sketchState(app.activeSketch); const f = app.feature(app.activeSketch); return (ss && ss.plane) || (f && f.plane); }
    } catch { /* ignore */ }
    return null;
  }

  // ------------------------------------------------------------------ Show/Hide
  function visTargets() {
    const bodies = new Set(), feats = new Set(), canvases = new Set(), meshes = new Set();
    let origin = false;
    for (const r of app.selection.items) {
      if (r.kind === "body" || r.kind === "face" || r.kind === "edge" || r.kind === "vertex") { if (r.body) bodies.add(r.body); }
      else if (r.kind === "feature" || r.kind === "cplane") {
        const f = app.feature(r.id);
        if (f && (f.type === "sketch" || f.type === "cplane")) feats.add(f.id);
        else if (f && f.newBody && app.body(f.newBody)) bodies.add(f.newBody);
      } else if (r.kind === "profile" || r.kind === "sketchCurve" || r.kind === "sketchPoint" || r.kind === "sketchDim") {
        if (app.mode !== "sketch" && r.sketch) feats.add(r.sketch);
      } else if (r.kind === "originPlane" || r.kind === "originAxis" || r.kind === "originPoint") origin = true;
      else if (r.kind === "canvas") canvases.add(r.id);
      else if (r.kind === "meshBody") meshes.add(r.id);
    }
    return { bodies, feats, origin, canvases, meshes, count: bodies.size + feats.size + (origin ? 1 : 0) + canvases.size + meshes.size };
  }
  function toggleVisibility() {
    const t = visTargets();
    if (!t.count) return;
    app.mutate("Show/Hide", (doc) => {
      for (const id of t.bodies) { const m = app.bodyMeta(id); m.visible = m.visible === false; }
      for (const f of doc.features) if (t.feats.has(f.id)) f.visible = f.visible === false;
      if (t.origin) { doc.origin = doc.origin || {}; doc.origin.visible = !doc.origin.visible; }
      // canvases / mesh bodies (inspect module's INSERT objects)
      for (const c of doc.canvases || []) if (t.canvases.has(c.id)) c.visible = c.visible === false;
      for (const m of doc.meshes || []) if (t.meshes.has(m.id)) m.visible = m.visible === false;
    });
    app.selection.clear();
  }

  // ------------------------------------------------------------------ Delete key routing
  function deleteSelection() {
    const items = app.selection.items.slice();
    if (!items.length) return;
    if (app.mode === "sketch") {
      const own = app.commands.all().find((d) => d.id !== DELETE_ROUTER && d.id !== DELETE_ROUTER_SKETCH && d.when === "sketch" && !d.stub && [].concat(d.shortcut || []).includes("Delete"));
      if (own) { app.commands.run(own.id); return; }
      if (app.ui.sketch && typeof app.ui.sketch.deleteSelection === "function") { app.ui.sketch.deleteSelection(); return; }
      const sid = app.activeSketch;
      const ents = items.filter((r) => r.sketch === sid && (r.kind === "sketchCurve" || r.kind === "sketchPoint")).map((r) => r.curve || r.point);
      const cids = items.filter((r) => r.sketch === sid && r.kind === "sketchDim").map((r) => r.cid);
      if (!ents.length && !cids.length) return;
      app.mutate("Delete", (doc) => {
        const f = doc.features.find((x) => x.id === sid);
        if (!f || !f.sk) return;
        if (cids.length) f.sk.constraints = f.sk.constraints.filter((c) => !cids.includes(c.id));
        if (ents.length) app.S.removeEntities(f.sk, ents);
      });
      app.selection.clear();
      return;
    }
    const del = app.commands.get("FusionDeleteCommand");
    if (del && !del.stub) { app.commands.run("FusionDeleteCommand"); return; }
    // fallback: delete features (timeline/browser selection) and bodies (Delete feature)
    const featIds = new Set();
    const bodyIds = new Set();
    for (const r of items) {
      if (r.kind === "feature" || r.kind === "cplane") featIds.add(r.id);
      else if (r.kind === "body" || r.kind === "face" || r.kind === "edge") bodyIds.add(r.body);
    }
    if (!featIds.size && !bodyIds.size) return;
    app.selection.clear();
    if (featIds.size) {
      app.mutate("Delete", (doc) => {
        for (const id of featIds) {
          const i = doc.features.findIndex((x) => x.id === id);
          if (i < 0) continue;
          doc.features.splice(i, 1);
          if (doc.marker > i) doc.marker -= 1;
        }
      });
    }
    if (bodyIds.size) app.addFeature({ type: "delete", bodies: [...bodyIds] }, "Delete");
  }

  // ------------------------------------------------------------------ marking menu wiring
  app.on("canvas-contextmenu", (d) => {
    if (modals.top()) return;
    toolbox.close();
    contextMenu.close();
    // right-clicking an object with nothing selected selects it (the menu then offers its commands)
    try {
      if (!app.activeCommand && !mm.activeTool() && app.selection.items.length === 0 && d && d.ctx) {
        const h = d.ctx.hit;
        if (h && h.ref) app.selection.set([h.ref]);
      }
    } catch (e) { console.warn(e); }
    const x = d && Number.isFinite(d.clientX) ? d.clientX : cursor().x;
    const y = d && Number.isFinite(d.clientY) ? d.clientY : cursor().y;
    mm.open(x, y);
  });
  const attach = () => { if (app.viewport && app.viewport.canvas && !attach.done) { attach.done = true; mm.attachGestures(app.viewport.canvas); } };
  attach();
  app.on("ready", attach);

  app.on("command-start", () => { mm.close(); toolbox.close(); contextMenu.close(); });
  // Fusion's "Repeat <command>" also repeats sketch tools and Change Parameters (refs 11, 32);
  // core only records kind:'feature' commands, so record tools here too.
  const NO_REPEAT = new Set(["SketchStop", "SketchActivate", "RepeatCommand", "ShowToolbox"]);
  app.on("command-start", ({ id, def }) => {
    const d = def || app.commands.get(id);
    if (d && !d.stub && !d.alias && d.kind === "tool" && d.repeatable !== false && !NO_REPEAT.has(id)) app.commands.lastRepeatable = id;
  });
  app.on("mode", () => { mm.close(); contextMenu.close(); });
  app.on("doc", (d) => { if (d && d.replaced) { mm.close(); contextMenu.close(); } });
  window.addEventListener("blur", () => { mm.close(); contextMenu.close(); });
  window.addEventListener("resize", () => { mm.close(); contextMenu.close(); });

  // unsaved-changes guard (plus an immediate recovery copy)
  window.addEventListener("beforeunload", (ev) => {
    if (!app.dirty) return;
    files.recoverySave(true);
    ev.preventDefault();
    ev.returnValue = "";
  });

  // ------------------------------------------------------------------ public API
  const api = {
    markingMenu: mm, contextMenu, toolbox, modals, files, params, info,
    openMarkingMenu: (x, y, o) => mm.open(x, y, o),
    showContextMenu: (items, x, y) => contextMenu.show(items, x, y),
    runInNewSketch,
    deleteSelection,
  };
  app.ui.menus = api;
  app.ui.markingMenu = mm;
  app.ui.contextMenu = contextMenu;
  app.ui.toolbox = toolbox;
  app.ui.modals = modals; // (app.ui.modal is the shell's small message box function)
  app.ui.files = files;
  app.ui.parameters = params;
  // the shell's Data Panel lists designs saved in this browser
  if (app.ui.shell && typeof app.ui.shell === "object") {
    app.ui.shell.listDesigns = () => files.index().map((e) => ({
      id: e.id, name: e.name, when: e.modified, thumb: e.thumb || "", version: `v${e.version || 1}`,
      open: () => { files.openById(e.id); },
    }));
  }
}
