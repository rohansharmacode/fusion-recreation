// sheetmetal module: SHEET METAL tab: rules, flanges, bends, unfold, flat pattern (see README.md).
import "./style.css";
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import { FEATURES } from "./features.js";
import { EXTRA_FEATURES } from "./convert.js";
import { registerSheetMetalIcons } from "./icons.js";
import { openFlange, openLoft, openUnfold, openFold, openRip, openCorner, openSMEdge } from "./dialogs.js";
import { openConvert, openJoinByBend } from "./convert.js";
import { openRulesDialog, openLibraryDialog } from "./rules-ui.js";
import { createFlatEnv, pickStationaryFace, flatOf, flatDXF } from "./flat.js";
import * as R from "./rules.js";

const EDITORS = {
  smBaseFlange: (app, id) => openFlange(app, { editId: id }),
  smEdgeFlange: (app, id) => openFlange(app, { editId: id }),
  smContourFlange: (app, id) => openFlange(app, { editId: id }),
  smHem: (app, id) => openFlange(app, { editId: id }),
  smLoft: (app, id) => openLoft(app, { editId: id }),
  smFold: (app, id) => openFold(app, { editId: id }),
  smJog: (app, id) => openFold(app, { editId: id, jog: true }),
  smUnfold: (app, id) => openUnfold(app, { editId: id }),
  smRefold: (app, id) => openUnfold(app, { editId: id, refold: true }),
  smRip: (app, id) => openRip(app, { editId: id }),
  smCorner: (app, id) => openCorner(app, { editId: id }),
  smFillet: (app, id) => openSMEdge(app, { editId: id }),
  smChamfer: (app, id) => openSMEdge(app, { editId: id, chamfer: true }),
  smConvert: (app, id) => openConvert(app, { editId: id }),
  smJoinBend: (app, id) => openJoinByBend(app, { editId: id }),
};

/** Sheet metal bodies at the marker with unfolded bends (Fusion swaps Unfold for Refold Faces then). */
function hasUnfolded(app) {
  const st = app.result && app.result.state;
  if (!st || !(st.smData instanceof Map)) return false;
  for (const d of st.smData.values()) if (Object.values(d.bends || {}).some((b) => b.flat)) return true;
  return false;
}
const sheetBodies = (app) => {
  const st = app.result && app.result.state;
  return st && st.smData instanceof Map ? [...st.smData.keys()].filter((id) => st.bodies.has(id)) : [];
};

export function init(app) {
  // every part starts on its own: one failing must not take the others (or the app) down
  const part = (name, fn) => { try { fn(); } catch (e) { console.error(`[sheetmetal] ${name} failed to start`, e); } };
  part("icons", () => registerSheetMetalIcons());
  part("features", () => {
    for (const [type, def] of Object.entries({ ...FEATURES, ...EXTRA_FEATURES })) {
      if (M.isFeatureType(type) && M.featureDef(type) && !M.featureDef(type).builtin && M.featureDef(type).apply === def.apply) continue;
      M.registerFeature(type, { ...def, editor: EDITORS[type] });
    }
  });
  let flat = null;
  part("flat", () => { flat = createFlatEnv(app); app.ui.sheetMetal = { flatOf: (id) => flatOf(app, id), flatDXF, enterFlat: (id) => flat.enter(id), exitFlat: () => flat.exit(), get flatActive() { return flat.active ? flat.active.bodyId : null; }, rules: R }; });
  part("commands", () => registerCommands(app, () => flat));
  // the browser module starts after this one: add the Flat Pattern folder once it exists
  let browserDone = false;
  const tryBrowser = () => { if (!browserDone && app.ui.browser && typeof app.ui.browser.registerFolder === "function") { browserDone = true; part("browser", () => registerBrowser(app, () => flat)); } };
  tryBrowser();
  if (!browserDone) { const off = app.on("ready", () => { tryBrowser(); if (typeof off === "function") off(); }); }
}

function registerCommands(app, flatEnv) {
  const C = (id, label, run, extra = {}) => app.commands.register({ id, label, kind: "feature", run: (a, ctx = {}) => { try { run(a, ctx); } catch (e) { a.reportError ? a.reportError(e, { where: label }) : a.toast(String(e.message || e), "error"); } }, ...extra });
  C("FusionSheetMetalRulesCommand", "Sheet Metal Rules", (a) => openRulesDialog(a), { kind: "tool" });
  C("FusionSheetMetalRulesLibraryCommand", "Sheet Metal Rules Library", (a) => openLibraryDialog(a), { kind: "tool" });
  C("FusionSheetMetalFlangeCommand", "Flange", (a, ctx) => openFlange(a, { preselect: ctx.preselect }));
  C("FusionSheetMetalHemFlangeCommand", "Hem", (a, ctx) => openFlange(a, { type: "hem", preselect: ctx.preselect }));
  C("FusionSheetMetalLoftCommand", "Lofted Flange", (a, ctx) => openLoft(a, { preselect: ctx.preselect }));
  C("FusionSheetMetalJogCommand", "Jog", (a, ctx) => openFold(a, { jog: true, preselect: ctx.preselect }));
  C("SheetMetalFoldCmd", "Fold", (a, ctx) => openFold(a, { preselect: ctx.preselect }));
  C("FusionSheetMetalRipCommand", "Rip", (a, ctx) => openRip(a, { preselect: ctx.preselect }));
  C("FusionSheetMetalCornerCommand", "Corner Closure", (a, ctx) => openCorner(a, { preselect: ctx.preselect }));
  C("FusionSheetMetalFilletCommand", "Sheet Metal Fillet", (a, ctx) => openSMEdge(a, { preselect: ctx.preselect }));
  C("FusionSheetMetalChamferCommand", "Sheet Metal Chamfer", (a, ctx) => openSMEdge(a, { chamfer: true, preselect: ctx.preselect }));
  C("FusionSheetmetalUnfoldCommand", "Unfold", (a, ctx) => openUnfold(a, { refold: hasUnfolded(a), preselect: ctx.preselect }), {
    // like Fusion, the button becomes Refold while bends are unfolded
    face: (a) => (hasUnfolded(a) ? { label: "Refold", tooltip: "Returns the model to its folded shape.", icon: "FusionSheetmetalRefoldCommand" } : null),
  });
  C("FusionSheetmetalRefoldCommand", "Refold", (a, ctx) => openUnfold(a, { refold: true, preselect: ctx.preselect }));
  C("FusionJoinByBendCommand", "Join by Bend", (a, ctx) => openJoinByBend(a, { preselect: ctx.preselect }));
  C("ConvertToSheetMetalCmd", "Convert to Sheet Metal", (a, ctx) => openConvert(a, { preselect: ctx.preselect }));
  C("FusionSheetMetalFlatPatternCmd", "Create Flat Pattern", (a) => createFlatPattern(a, flatEnv()));
  C("ExportFlatPatternCmd", "Export Flat Pattern", (a) => openExport(a, flatEnv()), { when: "flatpattern", kind: "tool" });
  C("FusionSheetMetalExitFlatPatternCmd", "Finish Flat Pattern", (a) => { const f = flatEnv(); if (f && f.active) f.exit("finish"); else a.exitEnvironment("flatpattern", { reason: "finish" }); }, { when: "flatpattern", kind: "ui" });
}

/** Create Flat Pattern: pick the stationary face, store it, enter the FLAT PATTERN environment. */
function createFlatPattern(app, flat) {
  if (!flat) return;
  if (app.mode === "sketch") { const stop = app.commands.get("SketchStop"); if (stop && !stop.stub) stop.run(app, { fromCommand: true }); }
  const bodies = sheetBodies(app);
  if (!bodies.length) { app.toast("Create a sheet metal body first (Flange)", "warning", 3000); return; }
  pickStationaryFace(app, (ref) => {
    const flats = R.smDoc(app.doc).flats || {};
    const face = { body: ref.body, p: ref.p, n: ref.n };
    const prev = flats[ref.body];
    // validate before storing it
    try { flatOf(app, ref.body, face); } catch (e) { app.toast(e.message || String(e), "error", 4000); return; }
    if (!prev || JSON.stringify(prev.face) !== JSON.stringify(face)) {
      app.mutate(prev ? "Edit Flat Pattern" : "Create Flat Pattern", (doc) => { const sm = R.ensureDoc(doc); sm.flats[ref.body] = { face }; });
    }
    flat.enter(ref.body);
  });
}

// ---------------------------------------------------------------- Export Flat Pattern
function openExport(app, flat) {
  if (!flat || !flat.active) { app.toast("Activate a flat pattern first", "warning"); return; }
  const bodyId = flat.active.bodyId;
  const name0 = `${(app.doc.name || "Untitled").replace(/[\\/:*?"<>|]+/g, "_")}_${(app.bodyMeta(bodyId) || {}).name || bodyId}`;
  let nameInput = null;
  const dxf = (v) => v.fileType === "dxf";
  return app.ui.dialog.open({
    id: "ExportFlatPatternCmd", title: "Export Flat Pattern", icon: "ExportFlatPatternCmd",
    featureLabel: "Export Flat Pattern",
    help: "Exports the flat pattern as DXF.",
    noFeature: true, preview: false, activate: false,
    labelWidth: 128, ctrlWidth: 170,
    rows: [
      { id: "fileType", type: "dropdown", label: "File Type", default: "dxf", options: [{ value: "dxf", label: "DXF" }, { value: "step", label: "STEP" }], tooltip: "DXF exports profiles and bend lines to separate layers. STEP exports the flat body." },
      { id: "name", type: "custom", label: "Flat Pattern Name", render: () => { nameInput = document.createElement("input"); nameInput.className = "dlg-input sm-name-input"; nameInput.setAttribute("data-input", "name"); nameInput.value = name0; nameInput.spellcheck = false; return nameInput; }, update: () => {} },
      { id: "units", type: "dropdown", label: "Units", default: "mm", visible: dxf, options: [{ value: "mm", label: "Millimeter" }, { value: "in", label: "Inch" }], tooltip: "Sets the units used in the exported DXF file." },
      { id: "centerLines", type: "check", label: "Center Lines", default: true, visible: dxf, tooltip: "Includes bend center lines in the exported DXF file." },
      { id: "extentLines", type: "check", label: "Extent Lines", default: true, visible: dxf, tooltip: "Includes bend extent lines in the exported DXF file." },
      { id: "splines", type: "check", label: "Splines to Polylines", default: true, visible: dxf, tooltip: "Converts spline geometry to polylines in the exported DXF file." },
    ],
    build: () => null,
    commit(f, dlg) {
      const v = dlg.values;
      const { fp } = flatOf(app, bodyId);
      const base = String((nameInput && nameInput.value) || name0).trim() || name0;
      if (v.fileType === "step") {
        const blob = K.exportSTEPBlob([{ shape: fp.solid, name: base }]);
        app.download(`${base}.step`, blob, "application/step");
      } else {
        app.download(`${base}.dxf`, flatDXF(fp, { centerLines: !!v.centerLines, extentLines: !!v.extentLines, units: v.units }), "application/dxf");
      }
      app.toast(`Exported ${base}.${v.fileType === "step" ? "step" : "dxf"}`, "info", 2200);
      return true;
    },
  });
}

// ---------------------------------------------------------------- browser "Flat Pattern"
const FP_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 9.5l6-3.5 7 4-6 3.5z" fill="#c9d3dc" stroke="#46525e" stroke-width=".9"/><path d="M1.5 9.5v1.4l7 4v-1.4M8.5 13.5l6-3.5v-1.4" fill="none" stroke="#46525e" stroke-width=".8"/><path d="M4.3 8l7 4" stroke="#1f6fd1" stroke-width=".9" stroke-dasharray="1.4 1"/></svg>';
function registerBrowser(app, flatEnv) {
  const B = app.ui.browser;
  if (!B || typeof B.registerFolder !== "function") return;
  B.registerFolder({
    key: "flatpattern", label: "Flat Pattern", after: "bodies:root",
    build(a) {
      const flats = (R.smDoc(a.doc).flats) || {};
      const ids = Object.keys(flats).filter((id) => a.doc.bodies[id]);
      if (!ids.length) return null;
      const flat = flatEnv();
      return {
        children: ids.map((id) => ({
          key: `flatpattern:${id}`,
          label: ids.length > 1 ? `Flat Pattern (${(a.bodyMeta(id) || {}).name || id})` : "Flat Pattern",
          icon: FP_ICON,
          badge: flat && flat.active && flat.active.bodyId === id ? "active" : undefined,
          onDbl: () => flat && flat.enter(id),
          menu: () => [
            { label: "Activate", act: "activate-flat", action: () => flat && flat.enter(id) },
            { label: "Delete", act: "delete-flat", action: () => { if (flat && flat.active && flat.active.bodyId === id) flat.exit("delete"); a.mutate("Delete Flat Pattern", (doc) => { const sm = R.ensureDoc(doc); delete sm.flats[id]; }); } },
          ],
        })),
      };
    },
  });
  for (const ev of ["doc", "environment"]) app.on(ev, () => { try { B.invalidate && B.invalidate(); } catch { /* ignore */ } });
}
