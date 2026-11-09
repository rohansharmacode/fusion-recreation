// annotate module: Fusion's 3D annotations (PMI, UTILITIES > CREATE PMI): Note (LeaderLineNoteCommand),
// General Note (GeneralNoteCommand), Sizes and Dimensions (DimensionNoteCommand), Geometric Tolerancing
// (GeometricToleranceNoteCommand) and Hole/Thread Note (HoleThreadNoteCommand), plus Change PMI Settings
// (FusionChangePMISettingsCmd). PMI are timeline features (registered with model.js registerFeature),
// listed under the PMI node of the Browser, drawn on annotation planes over the canvas and stored in
// the document. Docs: ./README.md
import "./style.css";
import { createService } from "./service.js";
import { openNote, openGeneralNote } from "./cmd-note.js";
import { openDimension } from "./cmd-dimension.js";
import { openGdt } from "./cmd-gdt.js";
import { openHoleNote } from "./cmd-hole.js";
import { pmiFolder } from "./browser.js";
import { registerPmiIcons } from "./icons.js";
import { TYPE_LABELS, TYPE_COMMAND, PMI_TYPES, applyPmi, pmiDeps } from "./annotations.js";
import { beginPmiCommand } from "./dlgkit.js";
import * as F from "./format.js";

const OPEN = { pmiNote: openNote, pmiGeneralNote: openGeneralNote, pmiDimension: openDimension, pmiGdt: openGdt, pmiHoleNote: openHoleNote };
const STEMS = { pmiNote: "Note", pmiGeneralNote: "General Note", pmiDimension: "Dimension", pmiGdt: "Geometric Tolerance", pmiHoleNote: "Hole Note" };

export function init(app) {
  registerPmiIcons();
  if (!app.ui.dialog || !app.viewport) return; // needs the dialog framework and the canvas
  const svc = createService(app);
  app.ui.pmi = svc;

  // ---- feature types: timeline entries, Edit Feature, dependency checks, icons
  const editor = (type) => (a, id) => { beginPmiCommand(a); return OPEN[type](a, svc, { editId: id }); };
  for (const type of PMI_TYPES) {
    const def = {
      label: TYPE_LABELS[type], stem: STEMS[type], fields: {}, icon: TYPE_COMMAND[type],
      apply: applyPmi, deps: pmiDeps, editor: editor(type), browser: { folder: "annotations" },
    };
    if (typeof app.M.registerFeature === "function") {
      try { app.M.registerFeature(type, def); } catch (e) { console.error("[annotate]", e); }
    } else {
      // older model.js without a registry: PMI types pass through the evaluator unchanged
      try { Object.assign(app.M.TYPE_LABEL, { [type]: TYPE_LABELS[type] }); } catch { /* frozen */ }
    }
    app.featureEditors[type] = editor(type);
  }
  // with the registry the evaluator reports lost geometry itself (applyPmi); otherwise the service does
  svc.injectWarnings = typeof app.M.registerFeature !== "function";

  // ---- commands (UTILITIES > CREATE PMI)
  const C = (id, label, tooltip, type) => app.commands.register({
    id, label, tooltip, kind: "feature",
    run: (a, ctx = {}) => { const pre = beginPmiCommand(a); return OPEN[type](a, svc, { preselect: ctx.preselect || pre }); },
  });
  C("HoleThreadNoteCommand", "Hole/Thread Note", "Creates a product manufacturing information (PMI) note for a hole or boss, with or without threads.\n\nAdd a leader line and include units, diameter, depth, thread information, tolerance, and text.", "pmiHoleNote");
  C("LeaderLineNoteCommand", "Note", "Creates a product manufacturing information (PMI) general note.\n\nAdd a leader line and include general information, such as instructions, references to standards, or clarifications.", "pmiNote");
  C("DimensionNoteCommand", "Sizes and Dimensions", "Creates a product manufacturing information (PMI) for dimensions.\n\nAdd linear, angular, radius, or diameter dimensions to the model.", "pmiDimension");
  C("GeometricToleranceNoteCommand", "Geometric Tolerancing", "Creates a product manufacturing information (PMI) geometric tolerance annotation.\n\nAdd geometric tolerancing feature control frames and datum icons to annotate geometric tolerances on model geometry.", "pmiGdt");
  C("GeneralNoteCommand", "General Note", "Creates a product manufacturing information (PMI) general note.\n\nAdd a general note and include general information, such as instructions, references to standards, or clarifications.", "pmiGeneralNote");
  app.commands.register({ id: "FusionChangePMISettingsCmd", label: "Change PMI Settings", tooltip: "Change PMI Settings", kind: "feature", hidden: true, run: (a) => openPmiSettings(a) });
  // Edit PMI (context menus): edits the selected annotation
  for (const [type, cmd] of Object.entries(TYPE_COMMAND)) {
    const eid = `Edit${cmd.replace(/Command$/, "")}`;
    app.commands.register({ id: eid, label: "Edit PMI", kind: "feature", hidden: true,
      enabled: (a) => a.selection.items.some((r) => r.kind === "feature" && (a.feature(r.id) || {}).type === type),
      run: (a) => { const r = a.selection.items.find((x) => x.kind === "feature" && (a.feature(x.id) || {}).type === type); if (r) a.editFeature(r.id); } });
  }

  // ---- Browser: the PMI node (after Construction)
  const hookBrowser = () => {
    const br = app.ui.browser;
    if (!br || typeof br.registerFolder !== "function" || hookBrowser.done) return;
    hookBrowser.done = true;
    br.registerFolder({ key: "annotations", label: "PMI", after: "construction:root", before: undefined, build: () => pmiFolder(app, svc) });
  };
  hookBrowser();
  app.on("ready", () => { hookBrowser(); svc.refresh(); });
}

// ---------------------------------------------------------------- Change PMI Settings
const STANDARDS = [{ value: "ASME", label: "ASME" }, { value: "ISO", label: "ISO" }, { value: "infer", label: "Infer from Units" }];
const GN_SIZES = [{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }, { value: "custom", label: "Custom" }];

/** Document PMI settings (Fusion: Standard, Size, Default Precision / Tolerance, Leading / Trailing Zero, General Note Size). */
export function openPmiSettings(app) {
  const s = F.settingsOf(app.doc);
  return app.ui.dialog.open({
    id: "FusionChangePMISettingsCmd",
    title: "Change PMI Settings",
    icon: "GeneralNoteCommand",
    help: "Sets the document-level standard, size and display defaults of the PMI.",
    preview: false,
    noFeature: true,
    labelWidth: 150,
    ctrlWidth: 130,
    activate: false,
    values: {
      standard: s.standard, size: `${F.fmtNum(s.size, { precision: 2 })} mm`, precision: String(s.precision), tolerance: `${F.fmtNum(s.tolerance, { precision: 2 })} mm`,
      leading: !!s.leadingZero, trailing: !!s.trailingZero, gn: s.generalNoteSize, gnCustom: String(s.generalNoteCustom),
    },
    rows: [
      { id: "standard", type: "dropdown", label: "Standard", options: STANDARDS, tooltip: "Sets the default standard for PMI: ISO, ASME or inferred from the document units." },
      { id: "size", type: "value", label: "Size", kind: "length", positive: true, tooltip: "Sets the size of PMI graphics in the document." },
      { id: "precision", type: "dropdown", label: "Default Precision", options: F.PRECISION_OPTIONS, tooltip: "Sets the default number of decimal places for PMI." },
      { id: "tolerance", type: "value", label: "Default Tolerance", kind: "length", nonNegative: true, tooltip: "Sets the default symmetric tolerance for PMI." },
      { id: "leading", type: "check", label: "Leading Zero", tooltip: "Sets whether PMI values display a leading zero." },
      { id: "trailing", type: "check", label: "Trailing Zero", tooltip: "Sets whether PMI values display trailing zeros." },
      { id: "gn", type: "dropdown", label: "General Note Size", options: GN_SIZES, sep: true, tooltip: "Sets the default size for general notes." },
      { id: "gnCustom", type: "value", label: "Custom General Note Size", kind: "none", positive: true, visible: (v) => v.gn === "custom", tooltip: "Sets a custom default size for general notes (pixels)." },
    ],
    commit(f, dlg) {
      const v = dlg.values;
      const pmi = {
        standard: v.standard, size: dlg.num("size"), precision: Number(v.precision), tolerance: dlg.num("tolerance"),
        leadingZero: !!v.leading, trailingZero: !!v.trailing, generalNoteSize: v.gn, generalNoteCustom: Number(dlg.num("gnCustom")) || 15,
      };
      app.mutate("Change PMI Settings", (doc) => { doc.pmi = pmi; });
    },
  });
}
