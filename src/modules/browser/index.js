// BROWSER: the design tree floating at the top-left of the canvas (Fusion's Browser).
//   root component "(Unsaved)" / "Name vN" > Document Settings (Units: mm, g; Part Design),
//   Named Views, Analysis, Origin, Mesh Bodies, Bodies, Canvases, Sketches, Construction (folders appear
//   once they have content; Canvases / Mesh Bodies come from app.ui.insert, nodes canvas:<id> / meshbody:<id>).
//   Eye toggles (folder eyes reflect their children; hiding a folder remembers the children's
//   states and showing it restores them, or shows them all), selection/hover sync with the
//   canvas, rename (double-click / F2), Fusion's right-click menus, « collapse, − minimise,
//   resize, ToggleBrowser (Ctrl+Alt+B).
import "./style.css";
import { refKey } from "../../app/core.js";
import { el, esc, store, glyph, showMenu, hideTip, showTip, inlineEdit, runCmd, friendlyError, notAvailable, syncFeatureIcons, featureGlyph } from "./ui.js";
import {
  featureBodies, findInWindow, isIsolated, isolateBodies, unisolate, isSelectable, toggleSelectable,
  installSelectability, installOpacity, setOpacity, acceptsRef, installStatus, installFeatureHighlight,
} from "./scene.js";
import { creatorFeature } from "../timeline/deps.js";
import {
  setFeatureVisible, setBodiesVisible, setFolderVisibility, setVisibility, renameBody, renameFeature, deleteFeatures,
} from "../timeline/actions.js";

const KEY_W = "fusionrec.browser.width";
const KEY_COLLAPSED = "fusionrec.browser.collapsed";
const KEY_MIN = "fusionrec.browser.minimized";
const KEY_HIDDEN = "fusionrec.browser.hidden";
const UNITS = [["mm", "Millimeter"], ["cm", "Centimeter"], ["m", "Meter"], ["in", "Inch"], ["ft", "Foot"]];
const VIEWS = [["top", "TOP"], ["front", "FRONT"], ["right", "RIGHT"], ["home", "HOME"]];
const ORIGIN_ITEMS = [
  ["O", "originPoint", "br-point"], ["X", "originAxis", "br-axis"], ["Y", "originAxis", "br-axis"], ["Z", "originAxis", "br-axis"],
  ["XY", "originPlane", "br-plane"], ["XZ", "originPlane", "br-plane"], ["YZ", "originPlane", "br-plane"],
];
const INDENT = 17; // chevron column step per depth
const PAD0 = 17; // left edge of the depth-0 chevron
const OPACITY_STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export function init(app) {
  const host = app.dom.browserHost;
  if (!host) return;
  installSelectability(app);
  installStatus(app);
  const hookViewport = () => { installFeatureHighlight(app); installOpacity(app); };
  hookViewport();

  // ------------------------------------------------------------------ state
  const expanded = new Map([
    ["doc:root", true], ["settings:root", true], ["namedviews:root", false], ["origin:root", false],
    ["bodies:root", false], ["sketches:root", false], ["construction:root", false],
  ]);
  let width = clampW(store.get(KEY_W, 285));
  let collapsed = !!store.get(KEY_COLLAPSED, false);
  let minimized = !!store.get(KEY_MIN, false);
  let hidden = !!store.get(KEY_HIDDEN, false);
  let committed = { bodies: [] }; // body ids alive in the last committed (non-preview) result
  let specs = new Map(); // row key -> node spec
  let rowEls = new Map(); // row key -> row element
  let parentOf = new Map(); // row key -> parent row key
  let editing = null; // {key, cancel}
  let pendingRender = false;
  let lastKey = null; // last clicked row (F2)
  let hoverKey = null; // refKey the browser set as hover
  let unitsEditing = false;
  let folderPick = null; // {key, sig}: a folder whose contents were selected by clicking it
  let ctxKey = null; // row whose context menu is open
  const selSig = () => app.selection.items.map(refKey).sort().join("|");

  // ------------------------------------------------------------------ DOM
  const collapseBtn = el("button", { class: "br-hbtn br-collapse", title: "Collapse", "aria-label": "Collapse browser" });
  const title = el("span", { class: "br-title", text: "BROWSER" });
  const minBtn = el("button", { class: "br-hbtn br-min", title: "Minimize", "aria-label": "Minimize browser" });
  const header = el("div", { class: "br-header" }, collapseBtn, title, minBtn);
  const body = el("div", { class: "br-body", role: "tree" });
  const resizer = el("div", { class: "br-resize", title: "" });
  const panel = el("div", { class: "br-panel", "data-browser": "" }, header, body, resizer);
  host.appendChild(panel);

  function applyChrome() {
    panel.style.width = `${width}px`;
    panel.classList.toggle("collapsed", collapsed);
    panel.classList.toggle("minimized", minimized && !collapsed);
    host.style.display = hidden ? "none" : "";
    collapseBtn.innerHTML = glyph(collapsed ? "br-expand" : "br-collapse");
    collapseBtn.title = collapsed ? "Expand" : "Collapse";
    minBtn.innerHTML = glyph(minimized ? "br-plus" : "br-minus");
    minBtn.title = minimized ? "Restore" : "Minimize";
    fitHeight();
  }
  function clampW(w) { return Math.max(180, Math.min(520, Number(w) || 285)); }

  function fitHeight() {
    const ws = app.dom.workspace;
    if (!ws) return;
    let h = ws.clientHeight - 6;
    const ch = app.dom.commentsHost;
    if (ch && ch.offsetHeight > 0) h -= ch.offsetHeight + 8;
    h -= 46; // keep clear of the navigation bar row
    panel.style.maxHeight = `${Math.max(120, h)}px`;
  }
  if (typeof ResizeObserver !== "undefined" && app.dom.workspace) new ResizeObserver(fitHeight).observe(app.dom.workspace);
  app.on("layout", fitHeight);

  const toggleCollapsed = () => { collapsed = !collapsed; store.set(KEY_COLLAPSED, collapsed); applyChrome(); app.emit("layout", {}); };
  const toggleMinimized = () => { minimized = !minimized; store.set(KEY_MIN, minimized); applyChrome(); app.emit("layout", {}); };
  collapseBtn.addEventListener("click", (ev) => { ev.stopPropagation(); toggleCollapsed(); });
  minBtn.addEventListener("click", (ev) => { ev.stopPropagation(); toggleMinimized(); });
  header.addEventListener("dblclick", (ev) => { if (!ev.target.closest(".br-hbtn")) toggleMinimized(); });

  // resize by dragging the right edge
  resizer.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const x0 = ev.clientX, w0 = width;
    resizer.setPointerCapture(ev.pointerId);
    panel.classList.add("resizing");
    const move = (e) => { width = clampW(w0 + e.clientX - x0); panel.style.width = `${width}px`; };
    const up = () => {
      resizer.removeEventListener("pointermove", move);
      resizer.removeEventListener("pointerup", up);
      resizer.removeEventListener("pointercancel", up);
      panel.classList.remove("resizing");
      store.set(KEY_W, width);
      app.emit("layout", {});
    };
    resizer.addEventListener("pointermove", move);
    resizer.addEventListener("pointerup", up);
    resizer.addEventListener("pointercancel", up);
  });

  // ------------------------------------------------------------------ helpers
  const results = () => (app.result && app.result.results) || {};
  const exists = (f) => {
    const r = results()[f.id];
    return !!r && !r.rolled && !r.suppressed;
  };
  const isVisibleFeature = (f) => f.visible !== false;
  const accepts = (ref) => !!ref && acceptsRef(app, ref);
  const sel = (ref) => {
    if (!accepts(ref)) return; // not valid for the active selection input
    // while a command collects a selection (filter set) clicking adds/removes like in the canvas
    if (app.selection.filter) app.selection.toggle(ref);
    else app.selection.set([ref]);
  };
  const toggleSel = (ref) => { if (accepts(ref)) app.selection.toggle(ref); };
  const bodyIdsAlive = () => committed.bodies.filter((id) => app.doc.bodies[id]);
  // components (app.components): every list below is per component; the root shows its own items + child occurrences
  const ROOT = "root";
  const comps = () => app.components || null;
  const ownerOf = (id) => (comps() ? comps().ownerOf(id) : ROOT);
  const featOcc = (f) => (comps() ? comps().ownerOfFeature(f) : ROOT);
  const sketchFeatures = () => app.doc.features.filter((f) => f.type === "sketch" && exists(f));
  const regFolder = (f) => { const d = app.M.featureDef && app.M.featureDef(f.type); return d && !d.builtin && d.browser ? d.browser.folder || null : null; };
  const planeFeatures = () => app.doc.features.filter((f) => (f.type === "cplane" || regFolder(f) === "construction") && exists(f));
  const folderFeatures = (folder) => app.doc.features.filter((f) => regFolder(f) === folder && exists(f));
  const originItemVisible = (name) => !(app.doc.origin && app.doc.origin.items && app.doc.origin.items[name] === false);
  const folderFlag = (key) => !!(app.doc.folders && app.doc.folders[key] && app.doc.folders[key].hidden);
  // A folder's eye reflects its contents: open while any child is shown, closed when every child
  // is hidden (e.g. sketches auto-hidden by Extrude). An empty folder follows its own flag.
  const folderEye = (key, childVis) => (childVis.length ? childVis.some(Boolean) : !folderFlag(key));
  // Folder eye click. Hide: hide every child and remember their states (doc.folders[key]).
  // Show: restore the remembered states when that shows something (Fusion keeps a child that was
  // hidden before the folder hidden), otherwise show every child. One undoable step either way.
  function toggleFolder(key, shown, { bodies = [], features = [] } = {}) {
    if (shown) { setFolderVisibility(app, key, false, { bodies, features }); return; }
    const st = app.doc.folders && app.doc.folders[key];
    const saved = st && st.hidden && st.saved;
    const restoresSome = !!saved && (bodies.some((id) => saved[`b:${id}`] !== false) || features.some((id) => saved[`f:${id}`] !== false));
    if (restoresSome) setFolderVisibility(app, key, true, { bodies, features });
    else setVisibility(app, { bodies, features }, true);
  }

  function setOriginVisible(v) {
    app.mutate(v ? "Show Origin" : "Hide Origin", (doc) => { doc.origin = { ...(doc.origin || {}), visible: !!v }; });
  }
  function setOriginItemVisible(name, v) {
    app.mutate(v ? "Show" : "Hide", (doc) => {
      doc.origin = { ...(doc.origin || {}) };
      doc.origin.items = { ...(doc.origin.items || {}) };
      if (v) delete doc.origin.items[name]; else doc.origin.items[name] = false;
      if (v && !doc.origin.visible) {
        // showing one item of a hidden origin: show the folder with only that item on
        doc.origin.visible = true;
        for (const [n] of ORIGIN_ITEMS) if (n !== name) doc.origin.items[n] = false;
      }
    });
  }
  function selectionRefsOfKind(ref, kinds) {
    // a menu on an item that is part of the selection acts on the whole selection
    if (ref && app.selection.has(ref)) return app.selection.items.filter((r) => kinds.includes(r.kind));
    return ref ? [ref] : [];
  }
  function bodyTargets(id) {
    return selectionRefsOfKind({ kind: "body", body: id }, ["body"]).map((r) => r.body).filter((b) => app.doc.bodies[b]);
  }
  function featureTargets(id, kind = "feature") {
    const ref = kind === "cplane" ? { kind: "cplane", id } : { kind: "feature", id };
    const ids = selectionRefsOfKind(ref, ["feature", "cplane"]).map((r) => r.id);
    return ids.filter((x) => app.feature(x));
  }
  function editFeat(id) {
    if (app.ui.timeline && app.ui.timeline.edit) app.ui.timeline.edit(id);
    else app.editFeature(id);
  }
  function lookAtPlane(plane) {
    if (!plane || !app.viewport || !app.viewport.lookAt) return;
    try { app.viewport.lookAt(plane, { animate: true }); } catch (e) { console.error(e); }
  }
  function findInTimeline(featureId) {
    if (!featureId) { app.toast("This object has no timeline feature", "info"); return; }
    if (app.ui.timeline && app.ui.timeline.reveal) app.ui.timeline.reveal(featureId);
    else app.selection.set([{ kind: "feature", id: featureId }]);
  }
  function deleteBody(id) {
    const ids = bodyTargets(id);
    app.selection.set(ids.map((b) => ({ kind: "body", body: b })));
    const d = app.commands.get("FusionDeleteCommand");
    if (d && !d.stub) { app.commands.run("FusionDeleteCommand", { source: "browser" }); return; }
    app.addFeature({ type: "delete", bodies: ids }, "Delete");
  }
  function removeBody(id) {
    const ids = bodyTargets(id);
    if (!ids.length) return;
    // Remove keeps the body's history and drops it from the design with a "RemoveN" feature
    let n = 1;
    for (const f of app.doc.features) { const m = /^Remove(\d+)$/.exec(f.name || ""); if (m) n = Math.max(n, Number(m[1]) + 1); }
    app.addFeature({ type: "delete", bodies: ids, name: `Remove${n}` }, "Remove");
    app.selection.set(app.selection.items.filter((r) => !(r.body && ids.includes(r.body))));
  }
  function runOnBody(id, cmd, label) {
    const ids = bodyTargets(id);
    app.selection.set(ids.map((b) => ({ kind: "body", body: b })));
    runCmd(app, cmd, { source: "browser" }, null, label);
  }
  const runOrSay = (ids, label, ctx = {}) => runCmd(app, ids, ctx, () => notAvailable(app, label), label);

  // ------------------------------------------------------------------ tree model
  function buildTree() {
    const doc = app.doc;
    const kids = [];

    // Document Settings > Units, design type
    kids.push({
      key: "settings:root", label: "Document Settings", icon: glyph("br-gear"), noEye: true,
      menu: () => [{ label: "Change Active Units", cmd: "FusionChangeActiveUnitsCommand", action: () => editUnits() }],
      children: [{
        key: "units:root", label: `Units: ${doc.units || "mm"}, g`, icon: glyph("br-units"), noEye: true, units: true,
        onDbl: () => editUnits(),
        menu: () => [{ label: "Change Active Units", cmd: "FusionChangeActiveUnitsCommand", action: () => editUnits() }],
      }, {
        // a design with components is a hybrid design (bodies and components); otherwise a part design
        key: "doctype:root", label: comps() && comps().list().length ? "Hybrid Design" : "Part Design", icon: glyph("br-part"), noEye: true,
      }],
    });

    // Named Views
    kids.push({
      key: "namedviews:root", label: "Named Views", icon: glyph("br-folder"), noEye: true,
      children: VIEWS.map(([id, label]) => ({
        key: `view:${id}`, label, icon: glyph("br-view"), noEye: true,
        onClick: () => { if (app.viewport && app.viewport.setView) app.viewport.setView(id, { animate: true }); },
        menu: () => [{ label: "Go to View", act: "go-view", action: () => app.viewport && app.viewport.setView(id, { animate: true }) }],
      })),
    });

    // Analysis (Section Analysis / Center of Mass from the inspect module)
    const ins = app.ui.inspect;
    let ans = [];
    try { ans = ins && typeof ins.analyses === "function" ? (ins.analyses() || []) : []; } catch { ans = []; }
    if (ans.length) {
      const anyVis = ans.some((a) => a.visible !== false);
      const setVis = (a, v) => { try { ins.setAnalysisVisible(a.id, v); } catch (e) { console.error(e); } };
      const toggleAll = () => { if (anyVis) for (const a of ans) { if (a.visible !== false) setVis(a, false); } else setVis(ans[ans.length - 1], true); };
      kids.push({
        key: "analysis:root", label: "Analysis", icon: glyph("br-folder"), eye: anyVis,
        onEye: toggleAll,
        menu: () => [{ label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", icon: "m-eye", hint: "V", action: toggleAll }],
        children: ans.map((a) => {
          const vis = a.visible !== false;
          const kind = a.kindLabel || (a.type === "section" ? "Section Analysis" : "Center of Mass"); // kindLabel/icon: inspect hook (surface analyses)
          return {
            key: `analysis:${a.id}`, label: a.name, icon: a.icon || glyph(a.type === "section" ? "br-section" : "br-com"), eye: vis, renamable: true,
            tip: `<b>${esc(a.name)}</b><div class="br-tip-sub">${kind}</div>`,
            onEye: () => setVis(a, !vis),
            onDbl: () => { try { ins.editAnalysis(a.id); } catch (e) { console.error(e); } },
            rename: (name) => { try { ins.renameAnalysis(a.id, name); } catch (e) { console.error(e); } },
            menu: () => [
              { label: `Edit ${kind}`, act: "edit-analysis", icon: "m-editfeature", action: () => { try { ins.editAnalysis(a.id); } catch (e) { console.error(e); } } },
              "-",
              { label: "Delete", act: "delete", hint: "Del", icon: "m-delete", action: () => { try { ins.removeAnalysis(a.id); } catch (e) { console.error(e); } } },
              { label: "Rename", cmd: "RenameBrowserCmd", act: "rename", action: () => startRename(`analysis:${a.id}`) },
              "-",
              { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", hint: "V", icon: "m-eye", action: () => setVis(a, !vis) },
            ],
          };
        }),
      });
    }

    // Origin
    const ov = !!(doc.origin && doc.origin.visible);
    kids.push({
      key: "origin:root", label: "Origin", icon: glyph("br-folder"), eye: ov,
      onEye: () => setOriginVisible(!ov),
      menu: () => [{ label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", icon: "m-eye", hint: "V", action: () => setOriginVisible(!ov) }],
      children: ORIGIN_ITEMS.map(([name, kind, ico]) => {
        const ref = kind === "originPoint" ? { kind } : { kind, name };
        const iv = ov && originItemVisible(name);
        return {
          key: `${kind}:${name}`, label: name, icon: glyph(ico), eye: iv, eyeDim: !ov, ref,
          onEye: () => setOriginItemVisible(name, !iv),
          menu: () => [
            kind === "originPlane" ? { label: "Look At", cmd: "LookAtCommand", act: "look-at", action: () => lookAtPlane(app.K.ORIGIN_PLANES[name]) } : null,
            kind === "originPlane" ? "-" : null,
            { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", icon: "m-eye", hint: "V", action: () => setOriginItemVisible(name, !iv) },
            "-",
            { label: "Find in Window", cmd: "FindInWindow", act: "find-window", action: () => findInWindow(app, [ref]) },
          ].filter(Boolean),
        };
      }),
    });

    // Mesh Bodies (Insert Mesh) and Canvases (Canvas) from the inspect module's app.ui.insert
    const ins2 = app.ui.insert;
    const insList = (fn) => { try { return ins2 && typeof ins2[fn] === "function" ? (ins2[fn]() || []) : []; } catch { return []; } };
    const meshItems = insList("meshes");
    if (meshItems.length) kids.push(insertFolder("mesh", meshItems));

    // Bodies
    const allBodyIds = bodyIdsAlive();
    const bodyIds = allBodyIds.filter((id) => ownerOf(id) === ROOT);
    if (bodyIds.length) {
      const vis = folderEye("bodies", bodyIds.map((id) => app.doc.bodies[id].visible !== false));
      const toggle = () => toggleFolder("bodies", vis, { bodies: bodyIds });
      kids.push({
        key: "bodies:root", label: "Bodies", icon: glyph("br-folder"), eye: vis,
        selectAll: bodyIds.map((id) => ({ kind: "body", body: id })),
        onEye: toggle,
        menu: () => [
          { label: "Create Components from Bodies", cmd: "FusionCreateNewCompCmdFromBody", act: "comps-from-bodies", action: () => compsFromBodies(bodyIds) },
          { label: "Create Selection Set", act: "selection-set", icon: "m-selset", action: () => notAvailable(app, "Create Selection Set") },
          "-",
          { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", icon: "m-eye", hint: "V", action: toggle },
          { label: "Show All Bodies", cmd: "ShowAllBodiesCmd", act: "show-all", action: () => setBodiesVisible(app, bodyIds, true) },
          "-",
          { label: "Selectable/Unselectable", cmd: "SelectabilityToggleCmd", act: "selectable", action: () => toggleSelectable(app, bodyIds) },
          "-",
          { label: "Opacity Control", cmd: "OpacityControlCmd", act: "opacity", submenu: opacityMenu(bodyIds) },
          "-",
          { label: "Find in Window", cmd: "FindInWindow", act: "find-window", action: () => findInWindow(app, bodyIds.map((b) => ({ kind: "body", body: b }))) },
        ],
        children: bodyIds.map((id) => bodyNode(id)),
      });
    }

    const canvasItems = insList("canvases");
    if (canvasItems.length) kids.push(insertFolder("canvas", canvasItems));

    // Sketches
    const allSks = sketchFeatures();
    const sks = allSks.filter((f) => featOcc(f) === ROOT);
    if (sks.length) {
      const vis = folderEye("sketches", sks.map(isVisibleFeature));
      const toggle = () => toggleFolder("sketches", vis, { features: sks.map((f) => f.id) });
      kids.push({
        key: "sketches:root", label: "Sketches", icon: glyph("br-folder"), eye: vis,
        selectAll: sks.map((f) => ({ kind: "feature", id: f.id })),
        onEye: toggle,
        menu: () => [
          { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", icon: "m-eye", hint: "V", action: toggle },
          { label: "Show All Sketches", act: "show-all-sketches", action: () => setFeatureVisible(app, sks.map((f) => f.id), true) },
          "-",
          { label: "Find in Window", cmd: "FindInWindow", act: "find-window", action: () => findInWindow(app, sks.map((f) => ({ kind: "feature", id: f.id }))) },
        ],
        children: sks.map((f) => sketchNode(f)),
      });
    }

    // Construction
    const allPls = planeFeatures();
    const pls = allPls.filter((f) => featOcc(f) === ROOT);
    if (pls.length) {
      const vis = folderEye("construction", pls.map(isVisibleFeature));
      const toggle = () => toggleFolder("construction", vis, { features: pls.map((f) => f.id) });
      kids.push({
        key: "construction:root", label: "Construction", icon: glyph("br-folder"), eye: vis,
        selectAll: pls.map((f) => (f.type === "cplane" ? { kind: "cplane", id: f.id } : { kind: "feature", id: f.id })),
        onEye: toggle,
        menu: () => [
          { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", icon: "m-eye", hint: "V", action: toggle },
          "-",
          { label: "Find in Window", cmd: "FindInWindow", act: "find-window", action: () => findInWindow(app, pls.map((f) => (f.type === "cplane" ? { kind: "cplane", id: f.id } : { kind: "feature", id: f.id }))) },
        ],
        children: pls.map((f) => (f.type === "cplane" ? planeNode(f) : featureNode(f))),
      });
    }

    // folders contributed by modules (app.ui.browser.registerFolder) and registered feature folders
    insertModuleFolders(kids);

    // occurrences of the root component (Component1:1 ...), after the folders like Fusion
    if (comps()) for (const oid of comps().children(ROOT)) { try { kids.push(occNode(oid)); } catch (e) { console.error("[browser] component", e); } }

    // root component
    const everything = [...allBodyIds.map((id) => app.doc.bodies[id].visible !== false), ...allSks.map(isVisibleFeature), ...allPls.map(isVisibleFeature)];
    const rootVis = folderEye("root", everything);
    const ver = Number(doc.savedVersion) || 0;
    const rootLabel = ver > 0 ? `${doc.name || "Untitled"} v${ver}` : "(Unsaved)";
    const allRefs = bodyIds.map((id) => ({ kind: "body", body: id }));
    return {
      key: "doc:root", label: rootLabel, icon: glyph("br-component"), eye: rootVis, root: true,
      onEye: () => toggleFolder("root", rootVis, { bodies: allBodyIds, features: [...allSks, ...allPls].map((f) => f.id) }),
      menu: () => [
        { label: "Create Selection Set", act: "selection-set", icon: "m-selset", action: () => notAvailable(app, "Create Selection Set") },
        "-",
        comps() && comps().active !== ROOT ? { label: "Activate Component", cmd: "FusionActivateLocalCompCmd", act: "activate", action: () => comps().activate(ROOT) } : null,
        comps() ? { label: "New Component", cmd: "FusionCreateNewComponentCommand", act: "new-component", action: () => runCmd(app, "FusionCreateNewComponentCommand", { parent: ROOT }, null, "New Component") } : null,
        comps() && comps().canPaste() ? { label: "Paste", cmd: "PasteCommand", hint: "Ctrl+V", act: "paste", action: () => app.commands.run("PasteCommand") } : null,
        comps() && comps().canPaste() ? { label: "Paste New", cmd: "FusionPasteNewCommand", act: "paste-new", action: () => app.commands.run("FusionPasteNewCommand") } : null,
        { label: "Show All Bodies", cmd: "ShowAllBodiesCmd", act: "show-all", action: () => setBodiesVisible(app, allBodyIds, true) },
        { label: "Show All Sketches", act: "show-all-sketches", action: () => setFeatureVisible(app, allSks.map((f) => f.id), true) },
        comps() && comps().list().length ? { label: "Show All Components", cmd: "ShowAllComponentsCmd", act: "show-all-components", action: () => comps().setVisible(comps().list().map((o) => o.id), true) } : null,
        isIsolated(app) ? { label: "Unisolate", cmd: "UnisolateCmd", act: "unisolate", action: () => unisolate(app) } : null,
        "-",
        { label: "Opacity Control", cmd: "OpacityControlCmd", act: "opacity", submenu: opacityMenu(bodyIds) },
        "-",
        { label: "Find in Window", cmd: "FindInWindow", act: "find-window", disabled: !allRefs.length, action: () => findInWindow(app, allRefs) },
      ],
      right: `<span class="br-radio" title="Activate component" data-activate="root">${glyph(!comps() || comps().active === ROOT ? "br-radio" : "br-radio-off")}</span>`,
      onRight: () => { if (comps()) comps().activate(ROOT); },
      children: kids,
    };
  }

  // Canvases / Mesh Bodies folders (items stored by the inspect module in app.doc.canvases / meshes)
  function insertFolder(kind, items) {
    const ins = app.ui.insert;
    const isCanvas = kind === "canvas";
    const refKind = isCanvas ? "canvas" : "meshBody";
    const nodeKind = isCanvas ? "canvas" : "meshbody";
    const ids = items.map((x) => x.id);
    const anyVis = items.some((x) => x.visible);
    const call = (fn, ...a) => { try { return ins && ins[fn] ? ins[fn](...a) : undefined; } catch (e) { console.error(e); return undefined; } };
    const setVis = (tids, v) => call("setVisible", kind, tids, v);
    const targets = (id) => {
      const ref = { kind: refKind, id };
      return app.selection.has(ref) ? app.selection.items.filter((r) => r.kind === refKind).map((r) => r.id) : [id];
    };
    const toggleAll = () => setVis(ids, !anyVis);
    const refs = ids.map((id) => ({ kind: refKind, id }));
    return {
      key: isCanvas ? "canvases:root" : "meshbodies:root", label: isCanvas ? "Canvases" : "Mesh Bodies", icon: glyph("br-folder"), eye: anyVis,
      selectAll: refs,
      onEye: toggleAll,
      menu: () => [
        { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", icon: "m-eye", hint: "V", action: toggleAll },
        isCanvas ? "-" : null,
        isCanvas ? { label: "Selectable/Unselectable", cmd: "SelectabilityToggleCmd", act: "selectable", action: () => call("setSelectable", ids, !items.every((x) => x.selectable)) } : null,
      ].filter(Boolean),
      children: items.map((it) => {
        const key = `${nodeKind}:${it.id}`;
        const ref = { kind: refKind, id: it.id };
        const vis = !!it.visible;
        const del = () => call("remove", kind, targets(it.id));
        const showHide = () => setVis(targets(it.id), !vis);
        const sub = isCanvas ? (it.missing ? "Canvas (missing plane)" : "Canvas") : `Mesh Body${it.tris ? ` | ${Number(it.tris).toLocaleString()} triangles` : ""}`;
        return {
          key, label: it.name, icon: glyph(isCanvas ? "br-canvas" : "br-mesh"), eye: vis, ref, renamable: true,
          badge: it.missing ? glyph("warning", 14) : "",
          tip: `<b>${esc(it.name)}</b><div class="br-tip-sub">${esc(sub)}</div>`,
          onEye: showHide,
          onDbl: () => (isCanvas ? call("editCanvas", it.id) : startRename(key)),
          rename: (name) => call("rename", kind, it.id, name),
          menu: () => (isCanvas ? [
            { label: "Edit Canvas", cmd: "FusionEditCanvasCommand", act: "edit-canvas", icon: "m-editfeature", action: () => call("editCanvas", it.id) },
            { label: "Calibrate", cmd: "FusionCalibrateCanvasCommand", act: "calibrate", action: () => notAvailable(app, "Calibrate") },
            "-",
            { label: "Delete", act: "delete", hint: "Del", icon: "m-delete", action: del },
            { label: "Rename", cmd: "RenameBrowserCmd", act: "rename", action: () => startRename(key) },
            "-",
            { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", hint: "V", icon: "m-eye", action: showHide },
            "-",
            { label: "Selectable/Unselectable", cmd: "SelectabilityToggleCmd", act: "selectable", action: () => call("setSelectable", targets(it.id), !it.selectable) },
          ] : [
            { label: "Delete", act: "delete", hint: "Del", icon: "m-delete", action: del },
            { label: "Rename", cmd: "RenameBrowserCmd", act: "rename", action: () => startRename(key) },
            "-",
            { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", hint: "V", icon: "m-eye", action: showHide },
          ]),
        };
      }),
    };
  }

  function opacityMenu(ids) {
    const cur = ids.length ? Math.round(100 * (Number(app.doc.bodies[ids[0]] && app.doc.bodies[ids[0]].opacity) || 1)) : 100;
    return OPACITY_STEPS.map((p) => ({
      label: `${p}%`, act: `opacity-${p}`, checked: ids.length > 0 && cur === p,
      action: () => setOpacity(app, ids, p / 100),
    }));
  }

  /** Browser icon + subtitle of a body by kind (solid, surface, mesh, T-spline, sheet metal, registered kinds). */
  function bodyLook(id, meta) {
    const kind = app.bodyKind ? app.bodyKind(id) || meta.kind || "solid" : meta.kind || "solid";
    const hooks = (app.bodyKinds && app.bodyKinds[kind]) || {};
    if (meta.sheetMetal && kind === "solid") return { kind, icon: glyph("br-sheetmetal"), sub: "Sheet Metal Body" };
    const icons = { solid: "br-body", surface: "br-surface", mesh: "br-mesh", tspline: "br-tspline" };
    let sub = hooks.label || (kind === "solid" ? "Body" : `${kind} Body`);
    if (kind === "mesh") {
      try { const b = app.anyBody(id); const n = b && b.mesh ? app.M.meshOps.triCount(b.mesh) : 0; if (n) sub = `Mesh Body | ${n.toLocaleString()} triangles`; } catch { /* ignore */ }
    }
    return { kind, icon: hooks.icon || glyph(icons[kind] || "br-body"), sub };
  }

  function bodyNode(id) {
    const meta = app.doc.bodies[id] || app.bodyMeta(id);
    const vis = meta.visible !== false;
    const ref = { kind: "body", body: id };
    const isolated = isIsolated(app);
    const look = bodyLook(id, meta);
    return {
      key: `body:${id}`, label: meta.name, icon: look.icon, eye: vis, ref, renamable: true, bodyKind: look.kind,
      tip: look.kind !== "solid" || meta.sheetMetal ? `<b>${esc(meta.name)}</b><div class="br-tip-sub">${esc(look.sub)}</div>` : null,
      unselectable: !isSelectable(app, id),
      onEye: () => setBodiesVisible(app, bodyTargetsForEye(id), !vis),
      onDbl: () => startRename(`body:${id}`),
      rename: (name) => renameBody(app, id, name),
      // Fusion's body menu (Light theme, 2026): same items, order and separators
      menu: () => [
        { label: "Move/Copy", cmd: "FusionMoveCommand", hint: "M", icon: "m-move", action: () => runOnBody(id, "FusionMoveCommand", "Move/Copy") },
        { label: "Move to Group", act: "move-to-group", icon: "m-group", action: () => notAvailable(app, "Move to Group") },
        "-",
        { label: "Create Selection Set", act: "selection-set", icon: "m-selset", action: () => notAvailable(app, "Create Selection Set") },
        "-",
        { label: "Configure", cmd: "ConfigureEntityCmd", icon: "m-configure", action: () => runOrSay("ConfigureEntityCmd", "Configure", { ref: { kind: "body", body: id } }) },
        "-",
        { label: "Physical Material", cmd: "PhysicalMaterialCommand", icon: "m-material", action: () => runOnBody(id, "PhysicalMaterialCommand", "Physical Material") },
        { label: "Appearance", cmd: "AppearanceCommand", hint: "A", icon: "m-appearance", action: () => runOnBody(id, "AppearanceCommand", "Appearance") },
        { label: "Texture Map Controls", cmd: "TextureMappingCommand", icon: "m-texture", action: () => runOnBody(id, "TextureMappingCommand", "Texture Map Controls") },
        { label: "Properties", cmd: "FusionPropertiesCommand", action: () => runOnBody(id, ["FusionPropertiesCommand", "PropertiesCommand", "Properties", "properties"], "Properties") },
        "-",
        { label: "Save As Mesh", cmd: "FusionSaveAsSTLCommand", action: () => runOnBody(id, ["FusionSaveAsSTLCommand", "FileExportSTL"], "Save As Mesh") },
        "-",
        { label: "Copy", cmd: "CopyCommand", hint: "Ctrl+C", action: () => runOrSay(["CopyCommand"], "Copy") },
        { label: "Cut", cmd: "CutCommand", hint: "Ctrl+X", action: () => runOrSay(["CutCommand"], "Cut") },
        { label: "Delete", cmd: "FusionDeleteCommand", act: "delete", hint: "Del", icon: "m-delete", action: () => deleteBody(id) },
        { label: "Remove", cmd: "SoftDeleteCommand", act: "remove", icon: "m-remove", action: () => removeBody(id) },
        { label: "Rename", cmd: "RenameBrowserCmd", act: "rename", action: () => startRename(`body:${id}`) },
        "-",
        { label: "Display Detail Control", cmd: "TessellationControlCmd", action: () => notAvailable(app, "Display Detail Control") },
        "-",
        { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", hint: "V", icon: "m-eye", action: () => setBodiesVisible(app, bodyTargetsForEye(id), !vis) },
        "-",
        { label: "Selectable/Unselectable", cmd: "SelectabilityToggleCmd", act: "selectable", action: () => toggleSelectable(app, bodyTargets(id)) },
        "-",
        { label: "Opacity Control", cmd: "OpacityControlCmd", act: "opacity", submenu: opacityMenu(bodyTargets(id)) },
        isolated
          ? { label: "Unisolate", cmd: "UnisolateCmd", act: "unisolate", icon: "m-isolate", action: () => unisolate(app) }
          : { label: "Isolate", cmd: "IsolateCmd", act: "isolate", icon: "m-isolate", action: () => isolateBodies(app, bodyTargets(id)) },
        "-",
        { label: "Find in Window", cmd: "FindInWindow", act: "find-window", action: () => findInWindow(app, bodyTargets(id).map((b) => ({ kind: "body", body: b }))) },
      ],
    };
  }
  // ------------------------------------------------------------------ components
  function occTargets(oid) {
    const ref = { kind: "occurrence", occ: oid };
    if (!app.selection.has(ref)) return [oid];
    return app.selection.ofKind("occurrence").map((r) => r.occ).filter((o) => o !== ROOT);
  }
  function compsFromBodies(ids) {
    const C = comps();
    if (!C) return;
    const d = app.commands.get("FusionCreateNewCompCmdFromBody");
    if (d && !d.stub) { app.commands.run("FusionCreateNewCompCmdFromBody", { bodies: ids }); return; }
    C.createFromBodies(ids);
  }
  function runOnOcc(ids, cmd, label) {
    const C = comps();
    const bodies = [...new Set(ids.flatMap((o) => C.bodiesOf(o)))];
    app.selection.set(bodies.map((b) => ({ kind: "body", body: b })));
    runCmd(app, cmd, { source: "browser" }, null, label);
  }
  /** Occurrence node plus the row decorators of other modules (api.registerOccDecorator: badge, tip, menu items). */
  function occNode(oid) {
    const node = occNodeBase(oid);
    for (const fn of occNode.decorators || []) {
      try { fn(node, oid, app); } catch (e) { console.warn("[browser] occurrence decorator", e); }
    }
    return node;
  }
  /** Browser node of an occurrence ("Component1:1"): Origin, Bodies, Sketches, Construction, its occurrences. */
  function occNodeBase(oid) {
    const C = comps();
    const inf = C.info(oid);
    const vis = inf.visible;
    const ref = { kind: "occurrence", occ: oid };
    const own = committed.bodies.filter((id) => (app.doc.bodies[id] || id.includes("@")) && ownerOf(id) === oid);
    const sk = sketchFeatures().filter((f) => featOcc(f) === oid);
    const pl = planeFeatures().filter((f) => featOcc(f) === oid);
    const kids = [];
    kids.push({
      key: `origin:${oid}`, label: "Origin", icon: glyph("br-folder"), noEye: true,
      children: ORIGIN_ITEMS.map(([name, , ico]) => ({ key: `corigin:${oid}:${name}`, label: name, icon: glyph(ico), noEye: true })),
    });
    if (own.length) {
      const metaVis = (id) => (app.doc.bodies[id] || app.bodyMeta(id)).visible !== false;
      const fv = folderEye(`bodies:${oid}`, own.map(metaVis));
      const real = own.filter((id) => app.doc.bodies[id]);
      kids.push({
        key: `bodies:${oid}`, label: "Bodies", icon: glyph("br-folder"), eye: fv,
        selectAll: own.map((id) => ({ kind: "body", body: id })),
        onEye: () => toggleFolder(`bodies:${oid}`, fv, { bodies: real }),
        menu: () => [
          { label: "Create Components from Bodies", cmd: "FusionCreateNewCompCmdFromBody", act: "comps-from-bodies", disabled: !real.length, action: () => compsFromBodies(real) },
          "-",
          { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", icon: "m-eye", hint: "V", action: () => toggleFolder(`bodies:${oid}`, fv, { bodies: real }) },
          { label: "Show All Bodies", cmd: "ShowAllBodiesCmd", act: "show-all", action: () => setBodiesVisible(app, real, true) },
        ],
        children: own.map((id) => bodyNode(id)),
      });
    }
    if (sk.length) {
      const fv = folderEye(`sketches:${oid}`, sk.map(isVisibleFeature));
      kids.push({
        key: `sketches:${oid}`, label: "Sketches", icon: glyph("br-folder"), eye: fv,
        selectAll: sk.map((f) => ({ kind: "feature", id: f.id })),
        onEye: () => toggleFolder(`sketches:${oid}`, fv, { features: sk.map((f) => f.id) }),
        children: sk.map((f) => sketchNode(f)),
      });
    }
    if (pl.length) {
      const fv = folderEye(`construction:${oid}`, pl.map(isVisibleFeature));
      kids.push({
        key: `construction:${oid}`, label: "Construction", icon: glyph("br-folder"), eye: fv,
        selectAll: pl.map((f) => (f.type === "cplane" ? { kind: "cplane", id: f.id } : { kind: "feature", id: f.id })),
        onEye: () => toggleFolder(`construction:${oid}`, fv, { features: pl.map((f) => f.id) }),
        children: pl.map((f) => (f.type === "cplane" ? planeNode(f) : featureNode(f))),
      });
    }
    for (const c of C.children(oid)) kids.push(occNode(c));
    const active = C.isActive(oid);
    const creator = app.doc.features.find((f) => f.newOcc === oid && (f.type === "component" || f.operation === "newComponent"));
    const sub = inf.inst ? `Component | occurrence of ${esc(inf.name)}` : "Component";
    return {
      key: `occ:${oid}`, label: inf.label, icon: glyph("br-component") + (inf.grounded ? `<span class="br-pinmark" title="Pinned">${glyph("br-pin", 10)}</span>` : ""),
      eye: vis, ref, renamable: true, unselectable: !inf.selectable, activeComp: active,
      tip: `<b>${esc(inf.label)}</b><div class="br-tip-sub">${sub}${inf.grounded ? " | Pinned" : ""}</div>`,
      onEye: () => C.setVisible(occTargets(oid), !vis),
      onDbl: () => C.activate(oid),
      rename: (name) => C.rename(oid, name),
      right: `<span class="br-radio${active ? " on" : ""}" title="Activate component" data-activate="${esc(oid)}">${glyph(active ? "br-radio" : "br-radio-off")}</span>`,
      onRight: () => C.activate(oid),
      menu: () => {
        const ids = occTargets(oid);
        return [
          { label: "Activate Component", cmd: "FusionActivateLocalCompCmd", act: "activate", disabled: active, action: () => C.activate(oid) },
          { label: "New Component", cmd: "FusionCreateNewComponentCommand", act: "new-component", action: () => runCmd(app, "FusionCreateNewComponentCommand", { parent: oid }, null, "New Component") },
          "-",
          { label: "Move/Copy", cmd: "FusionMoveCommand", hint: "M", icon: "m-move", action: () => { app.selection.set(ids.map((o) => ({ kind: "occurrence", occ: o }))); runCmd(app, "FusionMoveCommand", { source: "browser" }, null, "Move/Copy"); } },
          inf.grounded
            ? { label: "Unpin", cmd: "FusionUnGroundComponents", act: "unpin", action: () => C.setGrounded(ids, false) }
            : { label: "Pin", cmd: "FusionGroundComponents", act: "pin", action: () => C.setGrounded(ids, true) },
          "-",
          { label: "Physical Material", cmd: "PhysicalMaterialCommand", icon: "m-material", action: () => runOnOcc(ids, "PhysicalMaterialCommand", "Physical Material") },
          { label: "Appearance", cmd: "AppearanceCommand", hint: "A", icon: "m-appearance", action: () => runOnOcc(ids, "AppearanceCommand", "Appearance") },
          { label: "Properties", cmd: "FusionPropertiesCommand", act: "properties", action: () => runCmd(app, ["FusionPropertiesCommand", "PropertiesCommand"], { occ: oid, source: "browser" }, null, "Properties") },
          "-",
          { label: "Copy", cmd: "CopyCommand", hint: "Ctrl+C", act: "copy", action: () => C.copy([ref]) },
          { label: "Paste", cmd: "PasteCommand", hint: "Ctrl+V", act: "paste", disabled: !C.canPaste(), action: () => app.commands.run("PasteCommand") },
          { label: "Paste New", cmd: "FusionPasteNewCommand", act: "paste-new", disabled: !C.canPaste(), action: () => app.commands.run("FusionPasteNewCommand") },
          { label: "Delete", cmd: "FusionDeleteCommand", act: "delete", hint: "Del", icon: "m-delete", action: () => C.remove(ids) },
          { label: "Rename", cmd: "RenameBrowserCmd", act: "rename", action: () => startRename(`occ:${oid}`) },
          "-",
          { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", hint: "V", icon: "m-eye", action: () => C.setVisible(ids, !vis) },
          { label: "Selectable/Unselectable", cmd: "SelectabilityToggleCmd", act: "selectable", action: () => C.setSelectable(ids, !inf.selectable) },
          isIsolated(app)
            ? { label: "Unisolate", cmd: "UnisolateCmd", act: "unisolate", icon: "m-isolate", action: () => unisolate(app) }
            : { label: "Isolate", cmd: "IsolateCmd", act: "isolate", icon: "m-isolate", action: () => isolateBodies(app, [...new Set(ids.flatMap((o) => C.bodiesOf(o)))].filter((b) => app.doc.bodies[b])) },
          "-",
          { label: "Find in Window", cmd: "FindInWindow", act: "find-window", action: () => findInWindow(app, C.bodiesOf(oid).map((b) => ({ kind: "body", body: b }))) },
          { label: "Find in Timeline", cmd: "FusionFindInTimeline", act: "find-timeline", action: () => findInTimeline(creator && creator.id) },
        ];
      },
      children: kids,
    };
  }

  function featureEyeTargets(id, type) {
    const ref = type === "cplane" ? { kind: "cplane", id } : { kind: "feature", id };
    if (!app.selection.has(ref)) return [id];
    return app.selection.items.filter((r) => (r.kind === "feature" || r.kind === "cplane") && app.feature(r.id)?.type === type).map((r) => r.id);
  }
  function bodyTargetsForEye(id) {
    const ref = { kind: "body", body: id };
    return app.selection.has(ref) ? app.selection.ofKind("body").map((r) => r.body) : [id];
  }

  function sketchNode(f) {
    const r = results()[f.id] || {};
    const st = app.sketchState(f.id);
    const fully = !!(st && st.status && st.status.fully);
    const ref = { kind: "feature", id: f.id };
    const vis = isVisibleFeature(f);
    const badge = r.ok === false ? glyph("error", 14) : r.warning ? glyph("warning", 14) : "";
    return {
      key: `sketch:${f.id}`, label: f.name, icon: glyph("br-sketch") + (fully ? `<span class="br-lock">${glyph("lock", 9)}</span>` : ""),
      eye: vis, ref, renamable: true, badge,
      tip: r.ok === false ? `<b>${esc(f.name)}</b><div class="br-tip-err">${esc(friendlyError(r.error || "Error"))}</div>` : r.warning ? `<b>${esc(f.name)}</b><div class="br-tip-warn">${esc(r.warning)}</div>` : null,
      active: app.mode === "sketch" && app.activeSketch === f.id,
      onEye: () => setFeatureVisible(app, featureEyeTargets(f.id, "sketch"), !vis),
      onDbl: () => editFeat(f.id),
      rename: (name) => renameFeature(app, f.id, name),
      menu: () => [
        { label: "Edit Sketch", cmd: "SketchActivate", act: "edit-sketch", icon: "m-editprofile", action: () => editFeat(f.id) },
        { label: "Redefine Sketch Plane", cmd: "SketchRedefineCommand", action: () => runOrSay("SketchRedefineCommand", "Redefine Sketch Plane", { feature: f.id }) },
        { label: "Save As DXF", cmd: "SketchExportToDXFCommand", action: () => runOrSay("SketchExportToDXFCommand", "Save As DXF", { feature: f.id }) },
        "-",
        { label: "Delete", act: "delete", hint: "Del", icon: "m-delete", action: () => deleteFeatures(app, featureTargets(f.id)) },
        { label: "Rename", cmd: "RenameBrowserCmd", act: "rename", action: () => startRename(`sketch:${f.id}`) },
        "-",
        { label: "Look At", cmd: "LookAtCommand", act: "look-at", action: () => lookAtPlane(st ? st.plane : f.plane) },
        "-",
        { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", hint: "V", icon: "m-eye", action: () => setFeatureVisible(app, featureEyeTargets(f.id, "sketch"), !vis) },
        "-",
        { label: "Find in Window", cmd: "FindInWindow", act: "find-window", action: () => findInWindow(app, [ref]) },
        { label: "Find in Timeline", cmd: "FusionFindInTimeline", act: "find-timeline", action: () => findInTimeline(f.id) },
      ],
    };
  }

  /** Node of a registered feature type listed in a folder (construction axes / points, module features ...). */
  function featureNode(f) {
    const r = results()[f.id] || {};
    const ref = { kind: "feature", id: f.id };
    const vis = isVisibleFeature(f);
    const def = app.M.featureDef ? app.M.featureDef(f.type) : null;
    let custom = {};
    if (def && def.browser && typeof def.browser.node === "function") { try { custom = def.browser.node(app, f) || {}; } catch (e) { console.error(e); } }
    return {
      key: `feature:${f.id}`, label: f.name, icon: featureGlyph(f.type), eye: vis, ref, renamable: true,
      badge: r.ok === false ? glyph("error", 14) : r.warning ? glyph("warning", 14) : "",
      tip: r.ok === false ? `<b>${esc(f.name)}</b><div class="br-tip-err">${esc(friendlyError(r.error || "Error"))}</div>` : null,
      onEye: () => setFeatureVisible(app, featureEyeTargets(f.id, f.type), !vis),
      onDbl: () => editFeat(f.id),
      rename: (name) => renameFeature(app, f.id, name),
      menu: () => [
        // def.browser.node may return menuFirst() -> items shown before the standard ones (assembly: Edit Joint Limits ...)
        ...(typeof custom.menuFirst === "function" ? [...(custom.menuFirst() || []), "-"] : []),
        { label: "Edit Feature", act: "edit-feature", icon: "m-editfeature", disabled: !app.hasFeatureEditor(f.type), action: () => editFeat(f.id) },
        "-",
        { label: "Delete", act: "delete", hint: "Del", icon: "m-delete", action: () => deleteFeatures(app, featureTargets(f.id)) },
        { label: "Rename", cmd: "RenameBrowserCmd", act: "rename", action: () => startRename(`feature:${f.id}`) },
        "-",
        { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", hint: "V", icon: "m-eye", action: () => setFeatureVisible(app, featureEyeTargets(f.id, f.type), !vis) },
        "-",
        { label: "Find in Window", cmd: "FindInWindow", act: "find-window", action: () => findInWindow(app, [ref]) },
        { label: "Find in Timeline", cmd: "FusionFindInTimeline", act: "find-timeline", action: () => findInTimeline(f.id) },
      ],
      ...custom,
    };
  }

  // Module folders: app.ui.browser.registerFolder({key, label, after?|before?, build(app) -> node|null}) and folders
  // named by registered feature types (def.browser.folder other than "construction").
  const moduleFolders = [];
  const FOLDER_LABELS = { joints: "Joints", jointorigins: "Joint Origins", annotations: "PMI", decals: "Decals", configurations: "Configurations" };
  function insertModuleFolders(kids) {
    const keyIndex = (k) => kids.findIndex((n) => n && n.key === k);
    const place = (node, spec) => {
      if (!node) return;
      let i = -1;
      if (spec.before) i = keyIndex(spec.before);
      if (i < 0 && spec.after) { const j = keyIndex(spec.after); if (j >= 0) i = j + 1; }
      if (i < 0 || i > kids.length) kids.push(node); else kids.splice(i, 0, node);
    };
    for (const spec of moduleFolders) {
      let node = null;
      try { node = spec.build(app); } catch (e) { console.error(`[browser] folder ${spec.key}`, e); }
      if (node) place({ key: `${spec.key}:root`, label: spec.label, icon: glyph("br-folder"), noEye: node.eye === undefined, ...node }, spec);
    }
    const folders = new Set();
    for (const f of app.doc.features) { const fo = regFolder(f); if (fo && fo !== "construction") folders.add(fo); }
    for (const fo of folders) {
      if (moduleFolders.some((m) => m.key === fo)) continue;
      const list = folderFeatures(fo);
      if (!list.length) continue;
      const vis = folderEye(fo, list.map(isVisibleFeature));
      place({
        key: `${fo}:root`, label: FOLDER_LABELS[fo] || fo.replace(/^./, (c) => c.toUpperCase()), icon: glyph("br-folder"), eye: vis,
        selectAll: list.map((f) => ({ kind: "feature", id: f.id })),
        onEye: () => toggleFolder(fo, vis, { features: list.map((f) => f.id) }),
        children: list.map((f) => featureNode(f)),
      }, { before: "sketches:root", after: "bodies:root" });
    }
  }

  function planeNode(f) {
    const r = results()[f.id] || {};
    const ps = app.planeState(f.id);
    const ref = { kind: "cplane", id: f.id };
    const vis = isVisibleFeature(f);
    return {
      key: `cplane:${f.id}`, label: f.name, icon: glyph("br-cplane"), eye: vis, ref, renamable: true,
      badge: r.ok === false ? glyph("error", 14) : r.warning ? glyph("warning", 14) : "",
      tip: r.ok === false ? `<b>${esc(f.name)}</b><div class="br-tip-err">${esc(friendlyError(r.error || "Error"))}</div>` : null,
      onEye: () => setFeatureVisible(app, featureEyeTargets(f.id, "cplane"), !vis),
      onDbl: () => editFeat(f.id),
      rename: (name) => renameFeature(app, f.id, name),
      menu: () => [
        { label: "Edit Feature", act: "edit-feature", icon: "m-editfeature", action: () => editFeat(f.id) },
        "-",
        { label: "Delete", act: "delete", hint: "Del", icon: "m-delete", action: () => deleteFeatures(app, featureTargets(f.id, "cplane")) },
        { label: "Rename", cmd: "RenameBrowserCmd", act: "rename", action: () => startRename(`cplane:${f.id}`) },
        "-",
        { label: "Look At", cmd: "LookAtCommand", act: "look-at", action: () => lookAtPlane(ps && ps.plane) },
        "-",
        { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", hint: "V", icon: "m-eye", action: () => setFeatureVisible(app, featureEyeTargets(f.id, "cplane"), !vis) },
        "-",
        { label: "Find in Window", cmd: "FindInWindow", act: "find-window", action: () => findInWindow(app, [ref]) },
        { label: "Find in Timeline", cmd: "FusionFindInTimeline", act: "find-timeline", action: () => findInTimeline(f.id) },
      ],
    };
  }

  // ------------------------------------------------------------------ render
  function render() {
    pendingRender = false;
    if (editing) { pendingRender = true; return; }
    const scroll = body.scrollTop;
    const tree = buildTree();
    specs = new Map();
    rowEls = new Map();
    parentOf = new Map();
    const frag = document.createDocumentFragment();
    renderNode(tree, 0, frag, false, null);
    body.textContent = "";
    body.appendChild(frag);
    body.scrollTop = scroll;
    updateStates();
  }
  function scheduleRender() {
    if (pendingRender) return;
    pendingRender = true;
    requestAnimationFrame(() => { if (pendingRender) render(); });
  }

  function renderNode(n, depth, parent, parentHidden, parentKey) {
    specs.set(n.key, n);
    if (parentKey) parentOf.set(n.key, parentKey);
    const hasKids = !!(n.children && n.children.length);
    const open = hasKids && (expanded.has(n.key) ? expanded.get(n.key) : false);
    const row = el("div", {
      class: `br-row${n.root ? " br-root" : ""}${n.active ? " active" : ""}${n.activeComp ? " active-comp" : ""}${n.eye === false || parentHidden ? " hidden-item" : ""}${n.unselectable ? " unselectable" : ""}`,
      role: "treeitem",
      "aria-expanded": hasKids ? String(open) : null,
      "aria-level": String(depth + 1),
      dataset: { node: n.key },
      style: { paddingLeft: `${PAD0 + depth * INDENT}px` },
    });
    row.appendChild(el("span", { class: `br-twisty${hasKids ? "" : " empty"}`, "data-expand": hasKids ? "" : null, title: hasKids ? (open ? "Collapse" : "Expand") : null, html: hasKids ? glyph(open ? "br-chev-down" : "br-chev-right") : "" }));
    if (!n.noEye) row.appendChild(el("span", { class: `br-eye${n.eye ? "" : " off"}${n.eyeDim ? " dim" : ""}`, title: n.eye ? "Hide" : "Show", html: glyph(n.eye ? "br-eye" : "br-eye-off") }));
    const hl = el("span", { class: "br-hl" },
      el("span", { class: "br-icon", html: n.icon }),
      el("span", { class: "br-label", text: n.label }),
      n.badge ? el("span", { class: "br-badge", html: n.badge }) : null);
    row.appendChild(hl);
    if (n.units) row.appendChild(el("span", { class: "br-edit", title: "Change Active Units", html: glyph("edit", 14), dataset: { cmd: "FusionChangeActiveUnitsCommand" } }));
    if (n.right) row.appendChild(el("span", { class: "br-right", html: n.right }));
    rowEls.set(n.key, row);
    parent.appendChild(row);
    if (hasKids) {
      // collapsed children stay in the DOM (hidden) so their data-node hooks always exist
      const box = el("div", { class: "br-children", role: "group", hidden: !open });
      const hide = parentHidden || n.eye === false;
      for (const c of n.children) renderNode(c, depth + 1, box, hide && !n.root, n.key);
      parent.appendChild(box);
    }
  }

  function commandRefs() {
    const out = [];
    try {
      const d = app.activeCommand && app.activeCommand.dialog;
      if (d && !d.closed && d.values && Array.isArray(d.selIds)) for (const id of d.selIds) for (const r of d.values[id] || []) if (r && typeof r === "object") out.push(r);
    } catch { /* dialog internals unavailable */ }
    return out;
  }

  function updateStates() {
    const hov = refKey(app.selection.hover);
    const selKeys = new Set(app.selection.items.map(refKey));
    const marked = new Set(); // folders that hold the selection / the context-menu target
    for (const [key, row] of rowEls) {
      const n = specs.get(key);
      row.classList.toggle("ctx", key === ctxKey);
      if (!n) continue;
      if (n.selectAll) {
        row.classList.toggle("sel", !!folderPick && folderPick.key === key && folderPick.sig === selSig());
        continue;
      }
      if (!n.ref) continue;
      const k = refKey(n.ref);
      const s = selKeys.has(k);
      row.classList.toggle("sel", s);
      row.classList.toggle("hov", !!hov && hov === k && key !== ctxKey);
      if (s || key === ctxKey) { const p = parentOf.get(key); if (p && p !== "doc:root") marked.add(p); }
    }
    // sub-entities (profiles / sketch geometry, faces / edges / vertices) underline the node that
    // owns them and its folder -- Fusion marks "Sketches" while Extrude holds a profile, "Bodies"
    // while Fillet / Hole hold an edge / face (a command dialog keeps face / edge picks out of
    // app.selection, so its selection rows are read too).
    for (const it of [...app.selection.items, ...commandRefs()]) {
      const own = it && (it.sketch ? `sketch:${it.sketch}` : it.body && it.kind !== "body" ? `body:${it.body}` : null);
      if (!own || !rowEls.has(own)) continue;
      marked.add(own);
      const p = parentOf.get(own);
      if (p && p !== "doc:root") marked.add(p);
    }
    for (const [key, row] of rowEls) row.classList.toggle("has-sel", marked.has(key) && !row.classList.contains("sel"));
  }

  // ------------------------------------------------------------------ interaction
  const rowOf = (t) => (t && t.closest ? t.closest(".br-row") : null);
  body.addEventListener("click", (ev) => {
    const row = rowOf(ev.target);
    if (!row) return;
    const key = row.dataset.node;
    const n = specs.get(key);
    if (!n) return;
    hideTip();
    if (ev.target.closest(".br-twisty") && n.children && n.children.length) {
      expanded.set(key, !(expanded.get(key) ?? false));
      render();
      return;
    }
    if (ev.target.closest(".br-eye")) { if (n.onEye) n.onEye(); return; }
    if (ev.target.closest(".br-edit")) { editUnits(); return; }
    if (ev.target.closest(".br-right")) { if (n.onRight) n.onRight(ev); return; }
    lastKey = key;
    if (n.ref) {
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey) toggleSel(n.ref);
      else sel(n.ref);
    } else if (n.selectAll && n.selectAll.length) {
      // a folder (Bodies, Sketches, Construction) selects its contents
      const refs = n.selectAll.filter((r) => accepts(r));
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey) for (const r of refs) app.selection.add(r);
      else if (refs.length) app.selection.set(refs);
      folderPick = { key, sig: selSig() };
      updateStates();
    } else if (n.children && n.children.length && !n.onClick && !n.root) {
      // folders without selectable contents (Document Settings, Named Views, Origin) open/close
      expanded.set(key, !(expanded.get(key) ?? false));
      render();
    }
    if (n.onClick) n.onClick(ev);
  });
  body.addEventListener("dblclick", (ev) => {
    const row = rowOf(ev.target);
    if (!row || ev.target.closest(".br-eye") || ev.target.closest(".br-twisty")) return;
    const n = specs.get(row.dataset.node);
    if (n && n.onDbl) { ev.preventDefault(); n.onDbl(); }
  });
  body.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    const row = rowOf(ev.target);
    if (!row) return;
    const key = row.dataset.node;
    const n = specs.get(key);
    if (!n || !n.menu) return;
    lastKey = key;
    // Fusion marks the right-clicked node (dotted outline) and names it in the status bar; the
    // selection is left alone and the object stays unhighlighted in the canvas (ref 27: the body
    // keeps its grey look), so the row-hover pre-highlight is dropped while the menu is open.
    ctxKey = key;
    const prevStatus = app.status || "";
    let statusSet = null;
    if (hoverKey && refKey(app.selection.hover) === hoverKey) app.selection.setHover(null);
    hoverKey = null;
    if (n.ref && (n.ref.kind === "body" || n.ref.kind === "feature" || n.ref.kind === "cplane")) { statusSet = n.label; app.setStatus(n.label); }
    updateStates();
    // Fusion (ref 27) opens the menu just below-left of the cursor and keeps it anchored there even
    // when it runs past the bottom of the app window (the last row may be partly cut off)
    showMenu(app, n.menu(), ev.clientX, ev.clientY, {
      className: "br-ctx-browser", dx: -3, dy: 2, overflowY: 16,
      onClose: () => {
        if (ctxKey === key) ctxKey = null;
        if (hoverKey && refKey(app.selection.hover) === hoverKey) app.selection.setHover(null);
        hoverKey = null;
        if (statusSet != null && app.status === statusSet && !app.selection.items.length) app.setStatus(prevStatus === statusSet ? "" : prevStatus);
        updateStates();
      },
    });
  });
  body.addEventListener("mouseover", (ev) => {
    if (ctxKey) return;
    const row = rowOf(ev.target);
    const n = row && specs.get(row.dataset.node);
    if (n && n.ref && accepts(n.ref)) {
      hoverKey = refKey(n.ref);
      app.selection.setHover(n.ref);
    } else if (hoverKey && refKey(app.selection.hover) === hoverKey) {
      hoverKey = null;
      app.selection.setHover(null);
    }
    if (n && n.tip && !ev.target.closest(".br-eye")) {
      const r = row.getBoundingClientRect();
      showTip(app, n.tip, r.left + 40, r.top, {});
    } else hideTip();
  });
  body.addEventListener("mouseleave", () => {
    hideTip();
    if (ctxKey) return;
    if (hoverKey && refKey(app.selection.hover) === hoverKey) app.selection.setHover(null);
    hoverKey = null;
  });
  panel.addEventListener("pointerdown", (ev) => { if (ev.button === 1) ev.preventDefault(); });

  // F2 rename (last clicked row, or the single selected body/sketch/plane)
  window.addEventListener("keydown", (ev) => {
    if (ev.key !== "F2" || hidden) return;
    const t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    let key = null;
    const items = app.selection.items;
    if (items.length === 1) {
      const r = items[0];
      key = r.kind === "body" ? `body:${r.body}` : r.kind === "occurrence" && r.occ !== ROOT ? `occ:${r.occ}` : r.kind === "cplane" ? `cplane:${r.id}` : r.kind === "feature" && app.feature(r.id)?.type === "sketch" ? `sketch:${r.id}` : null;
    }
    if (!key && lastKey && specs.get(lastKey)?.renamable) key = lastKey;
    if (key && specs.get(key)?.renamable) { ev.preventDefault(); startRename(key); }
  });

  function startRename(key) {
    if (collapsed || minimized) { collapsed = false; minimized = false; store.set(KEY_COLLAPSED, false); store.set(KEY_MIN, false); applyChrome(); }
    revealKey(key, false);
    const row = rowEls.get(key);
    const n = specs.get(key);
    if (!row || !n || !n.rename) return;
    const label = row.querySelector(".br-label");
    if (editing) editing.cancel();
    const ed = inlineEdit(label, n.label, (v) => n.rename(v), {
      onEnd: () => { editing = null; if (pendingRender) scheduleRender(); else render(); },
    });
    editing = { key, cancel: ed.cancel };
  }

  function editUnits() {
    if (unitsEditing) return;
    revealKey("units:root", false);
    const row = rowEls.get("units:root");
    if (!row) return;
    const label = row.querySelector(".br-label");
    const select = el("select", { class: "br-units", "data-input": "units", title: "Unit Type" },
      ...UNITS.map(([u, name]) => el("option", { value: u, text: `${name} (${u})`, selected: (app.doc.units || "mm") === u })));
    label.textContent = "Units: ";
    label.appendChild(select);
    label.style.overflow = "visible";
    unitsEditing = true;
    editing = { key: "units:root", cancel: () => finish(false) };
    let done = false;
    function finish(commit) {
      if (done) return;
      done = true;
      unitsEditing = false;
      editing = null;
      const v = select.value;
      if (commit && v !== (app.doc.units || "mm")) app.mutate("Change Active Units", (doc) => { doc.units = v; });
      render();
    }
    select.addEventListener("change", () => finish(true));
    select.addEventListener("blur", () => finish(false));
    select.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Escape") finish(false); if (ev.key === "Enter") finish(true); });
    select.addEventListener("click", (ev) => ev.stopPropagation());
    select.addEventListener("dblclick", (ev) => ev.stopPropagation());
    requestAnimationFrame(() => select.focus());
  }

  /** Expand the ancestors of a row, render, scroll it into view (and optionally flash it). */
  function revealKey(key, flash = true) {
    if (!rowEls.get(key)) render();
    let changed = false;
    for (let p = parentOf.get(key); p; p = parentOf.get(p)) if (!expanded.get(p)) { expanded.set(p, true); changed = true; }
    if (!parentOf.get(key)) {
      // not rendered yet (e.g. right after a model change): expand the usual chain
      const kind = key.split(":")[0];
      const chain = key === "units:root" ? ["doc:root", "settings:root"] : ({
        body: ["doc:root", "bodies:root"], sketch: ["doc:root", "sketches:root"], cplane: ["doc:root", "construction:root"],
        originPlane: ["doc:root", "origin:root"], originAxis: ["doc:root", "origin:root"], originPoint: ["doc:root", "origin:root"],
        view: ["doc:root", "namedviews:root"],
      })[kind] || ["doc:root"];
      for (const k of chain) if (!expanded.get(k)) { expanded.set(k, true); changed = true; }
    }
    if (collapsed || minimized) { collapsed = false; minimized = false; store.set(KEY_COLLAPSED, false); store.set(KEY_MIN, false); applyChrome(); changed = true; }
    if (hidden) { setHidden(false); changed = true; }
    if (changed || !rowEls.get(key)) render();
    const row = rowEls.get(key);
    if (!row) return false;
    row.scrollIntoView({ block: "nearest" });
    if (flash) {
      row.classList.remove("flash");
      void row.offsetWidth;
      row.classList.add("flash");
      setTimeout(() => row.classList.remove("flash"), 1300);
    }
    return true;
  }

  function setHidden(v) {
    hidden = !!v;
    store.set(KEY_HIDDEN, hidden);
    applyChrome();
    app.emit("layout", {});
  }

  // ------------------------------------------------------------------ events
  app.on("model", (d) => {
    if (d && d.preview) { updateStates(); return; } // keep showing the committed design while a command previews
    committed = { bodies: orderedBodies() };
    scheduleRender();
  });
  app.on("doc", () => scheduleRender());
  app.on("history", () => scheduleRender());
  app.on("mode", () => scheduleRender());
  app.on("selection", () => { if (folderPick && folderPick.sig !== selSig()) folderPick = null; updateStates(); });
  app.on("hover", () => updateStates());
  app.on("dialog", () => updateStates());
  app.on("ready", () => { hookViewport(); fitHeight(); scheduleRender(); });
  app.on("file", () => scheduleRender()); // save / open: root "Name vN" label
  syncFeatureIcons(app);
  app.on("feature-types", () => { syncFeatureIcons(app); scheduleRender(); });
  app.on("body-kinds", () => scheduleRender());
  app.on("components", () => scheduleRender());

  function orderedBodies() {
    if (!app.result || app.previewing) return committed.bodies;
    const alive = new Set(app.M.allBodyIds ? app.M.allBodyIds(app.result.state) : app.result.state.bodies.keys());
    const order = Object.keys(app.doc.bodies);
    const out = order.filter((id) => alive.has(id));
    for (const id of alive) if (!out.includes(id)) out.push(id);
    return out;
  }

  // ------------------------------------------------------------------ commands
  const selBodies = () => {
    const ids = app.selection.items.filter((r) => r.kind === "body").map((r) => r.body);
    for (const r of app.selection.items) if (r.kind === "occurrence" && comps()) ids.push(...comps().bodiesOf(r.occ));
    return [...new Set(ids)].filter((id) => app.doc.bodies[id]);
  };
  app.commands.register({
    id: "ToggleBrowser", label: "Browser", tooltip: "Show or hide the Browser", shortcut: "Ctrl+Alt+B", kind: "ui",
    checked: () => !hidden,
    run: () => setHidden(!hidden),
  });
  app.commands.register({
    id: "FusionChangeActiveUnitsCommand", label: "Change Active Units", kind: "ui",
    run: () => editUnits(),
  });
  app.commands.register({
    id: "FindInBrowser", label: "Find in Browser", kind: "ui",
    enabled: () => app.selection.items.length > 0,
    run: (a, ctx = {}) => {
      const r = ctx.ref || app.selection.items[0];
      if (!r) return;
      api.reveal(r);
    },
  });
  app.commands.register({
    id: "FindInWindow", label: "Find in Window", kind: "ui",
    tooltip: "Zooms the canvas to the selected objects.",
    enabled: () => app.selection.items.length > 0,
    run: (a, ctx = {}) => findInWindow(app, ctx.refs || app.selection.items),
  });
  app.commands.register({
    id: "IsolateCmd", label: "Isolate", kind: "ui",
    tooltip: "Hides every other body.",
    enabled: () => selBodies().length > 0,
    run: () => isolateBodies(app, selBodies()),
  });
  app.commands.register({
    id: "UnisolateCmd", label: "Unisolate", kind: "ui",
    enabled: () => isIsolated(app),
    run: () => unisolate(app),
  });
  app.commands.register({
    id: "SelectabilityToggleCmd", label: "Selectable/Unselectable", kind: "ui",
    enabled: () => selBodies().length > 0,
    run: () => toggleSelectable(app, selBodies()),
  });
  app.commands.register({
    id: "RenameBrowserCmd", label: "Rename", kind: "ui",
    enabled: () => app.selection.items.length === 1 && ["body", "cplane", "feature", "occurrence"].includes(app.selection.items[0].kind),
    run: () => {
      const r = app.selection.items[0];
      if (!r) return;
      const key = r.kind === "body" ? `body:${r.body}` : r.kind === "occurrence" ? (r.occ === ROOT ? "doc:root" : `occ:${r.occ}`) : r.kind === "cplane" ? `cplane:${r.id}` : `sketch:${r.id}`;
      if (specs.get(key)?.renamable || rowEls.get(key)) startRename(key);
      else if (r.kind === "feature" && app.ui.timeline && app.ui.timeline.rename) app.ui.timeline.rename(r.id);
    },
  });

  // ------------------------------------------------------------------ public API
  const api = {
    get visible() { return !hidden; },
    get collapsed() { return collapsed; },
    get minimized() { return minimized; },
    show() { setHidden(false); },
    hide() { setHidden(true); },
    toggle() { setHidden(!hidden); },
    setCollapsed(v) { collapsed = !!v; store.set(KEY_COLLAPSED, collapsed); applyChrome(); app.emit("layout", {}); },
    setMinimized(v) { minimized = !!v; store.set(KEY_MIN, minimized); applyChrome(); app.emit("layout", {}); },
    /** Expand / collapse a folder row ("bodies:root", "sketches:root", ...). */
    expand(key, v = true) { expanded.set(key, !!v); render(); },
    refresh() { render(); },
    /** Reveal a browser row for a ref ({kind:'body'|'feature'|'cplane'|'originPlane'...}) or a row key. */
    reveal(target) {
      if (!target) return false;
      let key = typeof target === "string" ? target : null;
      if (!key) {
        const r = target;
        if (r.kind === "body" || r.kind === "face" || r.kind === "edge" || r.kind === "vertex" || r.kind === "meshFace") key = `body:${r.body}`;
        else if (r.kind === "occurrence") key = r.occ === ROOT ? "doc:root" : `occ:${r.occ}`;
        else if (r.kind === "cplane") key = `cplane:${r.id}`;
        else if (r.kind === "feature" || r.kind === "profile" || r.kind === "sketchCurve" || r.kind === "sketchPoint") {
          const fid = r.kind === "feature" ? r.id : r.sketch;
          const f = app.feature(fid);
          if (f && f.type === "sketch") key = `sketch:${fid}`;
          else if (f && f.type === "cplane") key = `cplane:${fid}`;
          else if (f && regFolder(f)) key = `feature:${fid}`;
          else if (f) {
            // a modelling feature: show the body it produced
            const b = featureBodies(app, f).find((id) => committed.bodies.includes(id));
            if (b) key = `body:${b}`;
          }
        } else if (r.kind === "originPlane" || r.kind === "originAxis" || r.kind === "originPoint") key = `${r.kind}:${r.name || "O"}`;
      }
      if (!key) { app.toast("Nothing to show in the Browser for this selection", "info"); return false; }
      const ok = revealKey(key, true);
      const n = specs.get(key);
      if (ok && n && n.ref && typeof target !== "string" && target.kind !== "feature" && accepts(n.ref) && !app.selection.has(n.ref)) app.selection.set([n.ref]);
      return ok;
    },
    rename(key) { startRename(key); },
    get element() { return panel; },
    /**
     * Add a folder to the root component: {key, label, after?: rowKey ("bodies:root"), before?: rowKey,
     * build(app) -> node | null}. node = {eye?, onEye?, menu?() -> items, children: [{key, label, icon, ref?, eye?,
     * onEye?, onDbl?, menu?, renamable?, rename?(name), tip?, badge?}]}; null hides the folder. Returns remove().
     */
    registerFolder(spec) {
      if (!spec || !spec.key || typeof spec.build !== "function") throw new Error("registerFolder needs {key, build}");
      const i = moduleFolders.findIndex((m) => m.key === spec.key);
      if (i >= 0) moduleFolders.splice(i, 1);
      moduleFolders.push({ label: spec.key, ...spec });
      scheduleRender();
      return () => { const j = moduleFolders.findIndex((m) => m.key === spec.key); if (j >= 0) moduleFolders.splice(j, 1); scheduleRender(); };
    },
    /** Decorate occurrence rows: fn(node, oid, app) may set node.badge (html), node.tip, or wrap node.menu. Returns remove(). */
    registerOccDecorator(fn) {
      if (typeof fn !== "function") throw new Error("registerOccDecorator needs a function");
      (occNode.decorators = occNode.decorators || []).push(fn);
      scheduleRender();
      return () => { const j = (occNode.decorators || []).indexOf(fn); if (j >= 0) occNode.decorators.splice(j, 1); scheduleRender(); };
    },
    /** Re-render soon (modules call this when their folder content changed). */
    invalidate() { scheduleRender(); },
    /** Isolate these bodies (hide every other body; app.components.isolate uses it). */
    isolateBodies(ids) { isolateBodies(app, ids.filter((id) => app.doc.bodies[id])); return true; },
  };
  app.ui.browser = api;
  void creatorFeature;

  applyChrome();
  committed = { bodies: orderedBodies() };
  render();
}
