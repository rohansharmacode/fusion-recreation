// inspect module: Fusion's INSPECT tools + appearance / material tools.
//   MeasureCommand (I)                 measure.js
//   FusionHalfSectionViewCommand        section.js   (Section Analysis, stored in doc.analyses)
//   FusionCenterOfMassCommand           com.js       (Center of Mass analysis + glyph)
//   AppearanceCommand (A)               appearance.js
//   PhysicalMaterialCommand             appearance.js
//   FusionPropertiesCommand             properties.js (aliases: PropertiesCommand, Properties, properties)
//   MaterializedBomHybridCmd            bom.js       (Bill of Materials window + CSV export)
//   FusionAddCanvasCommand              canvas.js    (Canvas: reference image on a plane / planar face)
//   ParaMeshInsertAlignCommand          mesh.js      (Insert Mesh: STL / OBJ as a display-only mesh body)
//   InterferenceCheckCommand            interference.js (pairwise overlap volumes, drawn red)
//   Fusion*AnalysisCommand (8 analyses)  analysis-cmds.js (dialogs) + surfanalysis.js (display) + curvature.js (OCCT)
//   MaterialCommand                     materials.js (Manage Materials: Material Browser, libraries, editor)
//   (canvases + mesh bodies: store, rendering, picking, Delete key in insert.js)
//
// Public API (app.ui.inspect):
//   analyses()                 -> [{id, type, name, visible, kindLabel, icon, command}]  (doc.analyses, Fusion's "Analysis" folder;
//                                 type: section | com | zebra | draft | curvatureMap | curvatureComb | isocurve | environmentMap |
//                                 accessibility | minimumRadius, see README.md)
//   setAnalysisVisible(id, v)  editAnalysis(id)  removeAnalysis(id)  renameAnalysis(id, name)  openAnalysis(type, ctx)
//   curvature(bodyId)          exact per-vertex curvature from the B-rep (curvature.js)
//   materialBrowser            Manage Materials (MaterialCommand, materials.js): open(), libraries(), ...
//   measure(refA, refB?)       -> {a, b, pair} numbers for scripts/tests
//   massProperties(bodyIds?)   -> {volume, area, mass, density, com, bbox, inertiaCom, inertiaOrigin}
//   materials / appearances    library tables
// Events: 'analyses' {} whenever the analysis list or a visibility changes.
//
// app.ui.insert (canvases / mesh bodies, read by the browser's Canvases and Mesh Bodies folders):
//   canvases() / meshes()      -> [{id, name, visible, selectable?, missing?, file, tris?}]
//   canvas(id) / mesh(id)      stored definitions (app.doc.canvases / app.doc.meshes)
//   editCanvas(id)  insertCanvas(ctx)  insertMesh(ctx)
//   setVisible('canvas'|'mesh', ids, v)  remove(kind, ids)  rename(kind, id, name)  setSelectable(ids, v)
//   view: {objects(), canvasObject(id), meshObject(id), groups}  bom() -> {rows, total}  bomCSV() -> text
// Events: 'insert' {} after the canvas / mesh scene objects were rebuilt.
import "./style.css";
import "./analysis.css";
import { installAppearances, APPEARANCES, MATERIALS, APPEARANCE_CATEGORIES, MATERIAL_CATEGORIES } from "./library.js";
import { registerMeasure } from "./measure.js";
import { describe, measurePair, massProps, visibleBodyIds } from "./geom.js";
import { createAnalyses } from "./analyses.js";
import { registerSection, openSection, openCom } from "./section.js";
import { registerAppearance, applyAppearance, applyMaterial } from "./appearance.js";
import { registerProperties } from "./properties.js";
import { createInsertStore, createInsertView, installDeleteKey, canvasPlane } from "./insert.js";
import { openCanvas } from "./canvas.js";
import { openInsertMesh } from "./mesh.js";
import { openBOM, bomData, bomCSV } from "./bom.js";
import { openInterference } from "./interference.js";
import { openAnalysis, ANALYSIS_COMMANDS, optimalMinimumRadius } from "./analysis-cmds.js";
import { registerMaterials } from "./materials.js";

export function init(app) {
  installAppearances(app);
  const api = {
    appearances: APPEARANCES,
    materials: MATERIALS,
    appearanceCategories: APPEARANCE_CATEGORIES,
    materialCategories: MATERIAL_CATEGORIES,
    analyses: () => store.list(),
    analysis: (id) => store.get(id),
    setAnalysisVisible: (id, v) => store.setVisible(id, v),
    removeAnalysis: (id) => store.remove(id),
    renameAnalysis: (id, name) => store.rename(id, name),
    editAnalysis(id) {
      const a = store.get(id);
      if (!a) return null;
      if (ANALYSIS_COMMANDS[a.type]) {
        app.emit("command-start", { id: ANALYSIS_COMMANDS[a.type].id });
        return openAnalysis(app, store, a.type, { editId: id });
      }
      app.emit("command-start", { id: a.type === "section" ? "FusionHalfSectionViewCommand" : "FusionCenterOfMassCommand" });
      return a.type === "section" ? openSection(app, store, { editId: id }) : openCom(app, store, { editId: id });
    },
    /** Surface analyses: open one (type: zebra|draft|curvatureMap|curvatureComb|isocurve|environmentMap|accessibility|minimumRadius). */
    openAnalysis: (type, ctx = {}) => openAnalysis(app, store, type, ctx),
    /** Exact curvature of a body from the B-rep surfaces: {k1, k2, K, H (per display vertex), minConcave, maxAbs, gaussMax}. */
    curvature: (bodyId) => (store.display ? store.display.curvatureOf(bodyId) : null),
    optimalMinimumRadius: (ids) => optimalMinimumRadius(app, store.display, ids),
    /** Overlay objects of the visible surface analyses (for tests). */
    analysisObjects: () => (store.display ? store.display.objects() : []),
    refreshAnalyses: () => store.refresh(),
    get clipping() { return store.clipping; },
    measure(a, b) {
      const da = a ? describe(app, a) : null, db = b ? describe(app, b) : null;
      return { a: da, b: db, pair: a && b ? measurePair(app, a, b, da, db) : null };
    },
    massProperties(ids) { return massProps(app, ids && ids.length ? ids : visibleBodyIds(app)); },
    applyAppearance: (refs, id) => applyAppearance(app, refs, id),
    applyMaterial: (refs, id) => applyMaterial(app, refs, id),
  };
  const store = createAnalyses(app);
  app.ui.inspect = api;
  registerMeasure(app);
  registerSection(app, store);
  registerAppearance(app);
  registerProperties(app);
  registerInsert(app);
  for (const [type, c] of Object.entries(ANALYSIS_COMMANDS)) {
    app.commands.register({ id: c.id, label: c.title, tooltip: c.tooltip, icon: c.id, kind: "tool", run: (a, ctx = {}) => openAnalysis(a, store, type, ctx) });
  }
  api.materialBrowser = registerMaterials(app);
}

function registerInsert(app) {
  const store = createInsertStore(app);
  const view = createInsertView(app, store);
  installDeleteKey(app, store);
  app.ui.insert = {
    store,
    view,
    canvases: () => store.canvases().map((c) => ({ id: c.id, name: c.name, file: c.file, visible: c.visible !== false, selectable: c.selectable !== false, missing: !canvasPlane(app, c) })),
    meshes: () => store.meshes().map((m) => ({ id: m.id, name: m.name, file: m.file, visible: m.visible !== false, tris: m.tris })),
    canvas: (id) => store.canvas(id),
    mesh: (id) => store.mesh(id),
    editCanvas(id) { app.emit("command-start", { id: "FusionAddCanvasCommand" }); return openCanvas(app, store, view, { editId: id }); },
    insertCanvas: (ctx = {}) => app.commands.run("FusionAddCanvasCommand", ctx),
    insertMesh: (ctx = {}) => app.commands.run("ParaMeshInsertAlignCommand", ctx),
    setVisible: (kind, ids, v) => store.setVisible(kind, ids, v),
    remove: (kind, ids) => store.remove(kind, ids),
    rename: (kind, id, name) => store.rename(kind, id, name),
    setSelectable: (ids, v) => store.setSelectable(ids, v),
    bom: () => bomData(app),
    bomCSV: () => bomCSV(app),
  };
  app.commands.register({
    id: "FusionAddCanvasCommand", label: "Canvas", kind: "tool", icon: "FusionAddCanvasCommand",
    tooltip: "Places an image on a planar face or sketch plane.",
    run: (a, ctx = {}) => openCanvas(a, store, view, ctx),
  });
  app.commands.register({
    id: "ParaMeshInsertAlignCommand", label: "Insert Mesh", kind: "tool", icon: "ParaMeshInsertAlignCommand",
    tooltip: "Inserts an existing STL or OBJ file as a mesh body into the active component in a design.",
    run: (a, ctx = {}) => openInsertMesh(a, store, view, ctx),
  });
  app.commands.register({
    id: "InterferenceCheckCommand", label: "Interference", kind: "tool", icon: "InterferenceCheckCommand",
    tooltip: "Finds where the selected bodies or components overlap.",
    run: (a, ctx = {}) => openInterference(a, ctx),
  });
  app.commands.register({
    id: "MaterializedBomHybridCmd", label: "Bill of Materials", kind: "tool", icon: "MaterializedBomHybridCmd",
    tooltip: "Opens the bill of materials for this design.",
    run: (a) => openBOM(a),
  });
}
