// Hole/Thread Note (HoleThreadNoteCommand): "Select a hole or boss on the model. Click on the canvas
// to place the PMI." Fusion reads the feature geometry (Hole features, counterbores, countersinks,
// drill points, through holes, bosses) and Thread features and pre-fills the note; every value can
// be overridden ("Modeled <x>" off) and toleranced. Tabs after Fusion 2706: Leader line | Diameter |
// Counterbore | Countersink | Thread | Text.
import * as K from "../../kernel.js";
import * as G from "./geom.js";
import * as F from "./format.js";
import { holeNoteLines, defaultTemplate, isPlaceholderOnly } from "./annotations.js";
import { dialogGeometry } from "./cmd-note.js";
import { THREAD_TYPES, sizeOptions, designationOptions, classOptions } from "../dialogs/threads.js";
import {
  tabsRow, onTab, placeRow, planeRow, textRow, valueRows, readValue, writeValue, unitsRows, readUnits, writeUnits,
  placement, cachedCands, dialogPlane, planeIndexOf, commitPmi,
} from "./dlgkit.js";

const V = G.V;
const DIRECTIONS = [{ value: "right", label: "Right hand" }, { value: "left", label: "Left hand" }];

/** Hole / thread data of the dialog's selection (cached): {g, hd, th}. */
function holeOf(app, dlg) {
  const g = dialogGeometry(dlg);
  if (!g || !g.R) return null;
  if (dlg._hole && dlg._hole.key === g.key) return dlg._hole;
  const hd = G.holeData(app, dlg.baseState, g.R);
  const th = hd ? G.threadOn(app, hd.cyl) : null;
  dlg._hole = { key: g.key, g, hd, th };
  return dlg._hole;
}

export function openHoleNote(app, svc, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const settings = F.settingsOf(app.doc);
  const H = settings.size;
  const filterCache = new Map();
  const isHoleRef = (r, dlg) => {
    if (!r || !r.body || !(r.index >= 0)) return false;
    const k = `${r.body}:${r.kind}:${r.index}`;
    if (filterCache.has(k)) return filterCache.get(k);
    let ok = false;
    try {
      const st = dlg.baseState;
      const b = st.bodies.get(r.body);
      const T = b && K.topoOf(b.shape);
      const info = T && (r.kind === "face" ? T.faces[r.index] : T.edges[r.index]);
      ok = !!info && !!G.cylinderOf(st, { kind: r.kind, body: r.body, index: r.index, info });
    } catch { ok = false; }
    filterCache.set(k, ok);
    return ok;
  };
  const hole = (dlg) => holeOf(app, dlg);
  const hasCb = (v, dlg) => { const h = hole(dlg); return !!(h && h.hd && h.hd.cb); };
  const hasCs = (v, dlg) => { const h = hole(dlg); return !!(h && h.hd && h.hd.cs); };
  const hasTh = (v, dlg) => { const h = hole(dlg); return !!(h && h.th); };
  const isHole = (v, dlg) => { const h = hole(dlg); return !h || !h.hd || h.hd.kind === "hole"; };
  const through = (v, dlg) => isHole(v, dlg) && !!v.thru;
  const cands = (dlg) => {
    const h = hole(dlg);
    if (!h || !h.hd) return [];
    return cachedCands(dlg, `${h.key}`, () => G.planeCandidates(dlg.baseState, [h.g.R]));
  };
  const center = (dlg) => { const h = hole(dlg); return h && h.hd ? (dlg.values.flip ? h.hd.exit : h.hd.entry) : null; };
  const frameOf = (dlg) => {
    const c = center(dlg);
    const pl = dialogPlane(dlg, cands(dlg), svc.renderer.view());
    return c && pl ? { o: c, n: pl.n, x: pl.x } : null;
  };
  const place = placement(svc, frameOf);
  const setOptions = (dlg, id, options) => {
    dlg.defs[id].options = options;
    if (!options.some((o) => o.value === dlg.values[id])) dlg.values[id] = options[0] ? options[0].value : "";
    const re = dlg.rowEls && dlg.rowEls[id];
    if (re) re.update();
  };
  const tab = (t, extra) => onTab(t, extra);

  /** Fill the dialog from the model when a hole is selected (Fusion pre-fills every value). */
  function fromModel(dlg) {
    const h = hole(dlg);
    if (!h || !h.hd) return;
    const v = dlg.values, hd = h.hd, th = h.th;
    const t = (id) => dlg.touched.has(id);
    const mm = (x) => `${F.fmtNum(x, { precision: 2 })} mm`;
    if (!t("thru")) v.thru = !!hd.through;
    if (!t("dia_value")) v.dia_value = mm(hd.diameter);
    if (!t("depth_value") && Number.isFinite(hd.depth)) v.depth_value = mm(hd.depth);
    if (!t("height_value")) v.height_value = mm(hd.boreLength || hd.depth || 0);
    if (!t("rad_value")) v.rad_value = mm(hd.diameter / 2);
    if (hd.cb) { if (!t("cbd_value")) v.cbd_value = mm(hd.cb.d); if (!t("cbdep_value")) v.cbdep_value = mm(hd.cb.depth); }
    if (hd.cs) { if (!t("csd_value")) v.csd_value = mm(hd.cs.d); if (!t("csa_value")) v.csa_value = `${F.fmtNum(hd.cs.angle, { precision: 1 })} deg`; }
    if (th) {
      if (!t("t_size") && th.size) { v.t_size = th.size; setOptions(dlg, "t_designation", designationOptions(th.size)); }
      if (!t("t_designation") && th.designation) v.t_designation = th.designation;
      if (!t("t_class") && th.tclass) { setOptions(dlg, "t_class", classOptions(hd.kind === "hole")); v.t_class = th.tclass; }
      if (!t("t_dir")) v.t_dir = th.left ? "left" : "right";
      if (!t("t_thru")) v.t_thru = !!(th.full && hd.through);
      if (!t("tdep_value")) v.tdep_value = mm(th.length);
    }
    for (const id of Object.keys(dlg.rowEls || {})) { const re = dlg.rowEls[id]; if (re && re.def && re.def.type !== "custom") re.update(); }
    regenText(dlg);
  }
  /** Regenerate the placeholder text when the number of generated lines changes (user text is kept). */
  function regenText(dlg) {
    if (!isPlaceholderOnly(dlg.values.text)) return;
    const f = dlg.spec.build(dlg.values, dlg);
    const h = hole(dlg);
    if (!f || !h || !h.hd) return;
    const lines = holeNoteLines(f, h.hd, h.th, svc.ctxFor(dlg.baseState));
    const tpl = defaultTemplate(lines.length);
    if (tpl !== dlg.values.text) {
      dlg.values.text = tpl;
      const re = dlg.rowEls && dlg.rowEls.textBox;
      if (re) re.update();
    }
  }

  return app.ui.dialog.open({
    id: "HoleThreadNoteCommand",
    title: "Hole/Thread Note",
    icon: "HoleThreadNoteCommand",
    featureLabel: "Hole/Thread Note",
    editId,
    help: "Creates a product manufacturing information (PMI) note for a hole or boss, with or without threads. Add a leader line and include units, diameter, depth, thread information, tolerance, and text.",
    preview: false,
    labelWidth: 152,
    ctrlWidth: 132,
    preselect: (opts.preselect || []).filter((r) => (r.kind === "face" && r.planar === false) || r.kind === "edge").slice(0, 1),
    values: {
      tab: "leader", text: "%1%", hAlign: "left", vAlign: "middle", pos: null, placing: false, planeIndex: -1, quantity: true, flip: false,
      t_type: THREAD_TYPES[0].value, t_size: "10.0", t_designation: "M10x1.5", t_class: "6H", t_dir: "right", t_on: true, t_thru: false,
    },
    rows: [
      tabsRow([
        { id: "leader", label: "Leader line" }, { id: "diameter", label: "Diameter" },
        { id: "counterbore", label: "Counterbore", visible: (d) => hasCb(d.values, d) }, { id: "countersink", label: "Countersink", visible: (d) => hasCs(d.values, d) },
        { id: "thread", label: "Thread", visible: (d) => hasTh(d.values, d) }, { id: "text", label: "Text" },
      ]),
      { id: "leaderGroup", type: "group", label: "Leader line", tooltip: "Identifies the line that connects the selected hole or boss to the PMI note.", visible: tab("leader"), rows: [
        { id: "geom", type: "selection", label: "Point", kinds: ["face", "edge"], max: 1, prompt: "Select a hole or boss", tooltip: "Select point to draw the hole thread note.", filter: (r, dlg) => isHoleRef(r, dlg) },
        placeRow("position", "Leader line position", "Select the position for the hole/thread note."),
        planeRow(cands),
        { id: "perpendicular", type: "check", label: "Perpendicular text", tooltip: "Rotates the PMI note 90 degrees from its default orientation." },
        { id: "ext", type: "value", label: "Leader line extension", kind: "length", default: `${F.fmtNum(H, { precision: 2 })} mm`, tooltip: "Sets the offset of the PMI note from the leader line endpoint.\n\nPositive values place the text on one side of the leader line. Negative values place it on the opposite side." },
        { id: "flip", type: "check", label: "Flip hole", tooltip: "Place the annotation at the bottom of the hole." },
        { id: "quantity", type: "check", label: "Display quantity", tooltip: "Adds a quantity prefix to the PMI note when it applies to multiple matching holes or bosses." },
      ] },
      ...unitsRows(settings, tab("leader")),
      { id: "diaGroup", type: "group", label: "Diameter", tooltip: "Shows the diameter of the selected hole or boss in the PMI note.", visible: tab("diameter"), rows: [
        ...valueRows("dia", { modeledLabel: "Modeled diameter", modeledTooltip: "Displays the modeled diameter of the selected hole or boss.", valueLabel: "Diameter", tolLabel: "Diameter tolerance", tolTooltip: "Adds a tolerance to the diameter shown in the PMI note." }),
        { id: "thru", type: "check", label: "Through hole", tooltip: "Indicates that the hole extends completely through the model.", visible: isHole, sep: true },
      ] },
      { id: "depthGroup", type: "group", label: "Depth", tooltip: "Shows the depth of the selected hole in the PMI note.", visible: tab("diameter", (v, d) => isHole(v, d) && !through(v, d)), rows: [
        ...valueRows("depth", { modeledLabel: "Modeled depth", modeledTooltip: "Displays the modeled depth of the selected hole.", valueLabel: "Depth", tolLabel: "Depth tolerance", tolTooltip: "Adds a tolerance to the depth shown in the PMI note." }),
      ] },
      { id: "heightGroup", type: "group", label: "Height", tooltip: "Shows the height of the selected boss in the PMI note.", visible: tab("diameter", (v, d) => !isHole(v, d)), rows: [
        ...valueRows("height", { modeledLabel: "Modeled height", modeledTooltip: "Displays the modeled height of the selected boss.", valueLabel: "Height", tolLabel: "Height tolerance", tolTooltip: "Adds a tolerance to the height shown in the PMI note." }),
      ] },
      { id: "radGroup", type: "group", label: "Radius", tooltip: "Shows the radius of the selected hole in the PMI note.", collapsed: true, visible: tab("diameter", isHole), rows: [
        ...valueRows("rad", { onLabel: "Radius", onDefault: false, modeledLabel: "Modeled radius", modeledTooltip: "Displays the modeled radius of the selected hole.", valueLabel: "Radius", tolLabel: "Radius tolerance" }),
      ] },
      { id: "cbGroup", type: "group", label: "Counterbore", tooltip: "Shows counterbore information for the selected hole in the PMI note.", visible: tab("counterbore", hasCb), rows: [
        ...valueRows("cbd", { onLabel: "Counterbore", modeledLabel: "Modeled diameter", modeledTooltip: "Displays the modeled counterbore diameter.", valueLabel: "Diameter", tolLabel: "Counterbore tolerance" }),
        ...valueRows("cbdep", { onLabel: "Counterbore depth", modeledLabel: "Modeled depth", modeledTooltip: "Displays the modeled counterbore depth.", valueLabel: "Depth", tolLabel: "Counterbore depth tolerance", visible: (v) => !!v.cbd_on }),
        ...valueRows("cbr", { onLabel: "Counterbore radius", onDefault: false, modeledLabel: "Modeled radius", valueLabel: "Radius", tolLabel: "Counterbore radius tolerance", visible: (v) => !!v.cbd_on }),
      ] },
      { id: "csGroup", type: "group", label: "Countersink", tooltip: "Shows countersink information for the selected hole in the PMI note.", visible: tab("countersink", hasCs), rows: [
        ...valueRows("csd", { onLabel: "Countersink", modeledLabel: "Modeled diameter", modeledTooltip: "Displays the modeled countersink diameter.", valueLabel: "Diameter", tolLabel: "Countersink tolerance" }),
        ...valueRows("csa", { onLabel: "Countersink angle", modeledLabel: "Modeled angle", modeledTooltip: "Displays the modeled countersink angle.", valueLabel: "Angle", kind: "angle", noTol: true, visible: (v) => !!v.csd_on }),
      ] },
      { id: "thGroup", type: "group", label: "Thread", tooltip: "Shows thread information in the PMI note.", visible: tab("thread", hasTh), rows: [
        { id: "t_on", type: "check", label: "Thread", tooltip: "Shows thread information in the PMI note." },
        { id: "t_type", type: "dropdown", label: "Thread type", options: THREAD_TYPES, visible: (v) => !!v.t_on, tooltip: "Sets the thread standard and profile used in the PMI note." },
        { id: "t_size", type: "dropdown", label: "Size", options: sizeOptions(), visible: (v) => !!v.t_on, tooltip: "Sets the nominal thread diameter shown in the PMI note.\n\nAvailable sizes depend on the selected thread type." },
        { id: "t_designation", type: "dropdown", label: "Designation", options: designationOptions("10.0"), visible: (v) => !!v.t_on, tooltip: "Sets the full thread designation shown in the PMI note." },
        { id: "t_class", type: "dropdown", label: "Class", options: classOptions(true), visible: (v) => !!v.t_on, tooltip: "Sets the thread tolerance class shown in the PMI note." },
        { id: "t_dir", type: "dropdown", label: "Direction", options: DIRECTIONS, visible: (v) => !!v.t_on, tooltip: "Sets the thread direction shown in the PMI note.\n\nRight-hand threads tighten when turned clockwise. Left-hand threads tighten when turned counterclockwise." },
        { id: "t_thru", type: "check", label: "Threaded through", visible: (v) => !!v.t_on, sep: true, tooltip: "Indicates that the thread extends through full depth of the hole.\n\nDeselect to specify a finite thread depth and related tolerance." },
        ...valueRows("tdep", { onLabel: "Thread depth", modeledLabel: "Modeled thread depth", modeledTooltip: "Displays the thread depth from the model, if available.", valueLabel: "Thread depth", tolLabel: "Depth tolerance", visible: (v) => !!v.t_on && !v.t_thru }),
      ] },
      { id: "textGroup", type: "group", label: "Text", tooltip: "Specifies the text shown in the PMI note.", visible: tab("text"), rows: [textRow("text", { vAlign: true, rows: 4, tooltip: "Specifies the text shown in the PMI note.\n\nValues in angle brackets, for example %1% or %2%, are automatically populated from settings on other tabs in this dialog. You can add your own text anywhere, but avoid changing or removing these placeholders unless you want to override the automatic values." })] },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      const v = dlg.values;
      const R = G.resolveRef(st, (f0.refs || [])[0]);
      Object.assign(v, {
        geom: R ? [R.selRef] : [], pos: f0.pos || null, placed: true, plane: f0.plane, ext: f0.ext ?? v.ext, perpendicular: !!f0.perpendicular,
        flip: !!f0.flip, quantity: f0.quantity !== false, text: f0.text ?? "%1%", hAlign: f0.hAlign || "left", vAlign: f0.vAlign || "middle",
      });
      if (f0.through !== undefined && f0.through !== null) { v.thru = !!f0.through; dlg.touched.add("thru"); }
      writeUnits(v, f0);
      writeValue(v, "dia", f0.dia);
      writeValue(v, f0.boss ? "height" : "depth", f0.depth);
      writeValue(v, "rad", f0.radius, { onLabel: true });
      if (f0.cb) { writeValue(v, "cbd", { on: f0.cb.on, ...(f0.cb.dia || {}) }, { onLabel: true }); writeValue(v, "cbdep", f0.cb.depth, { onLabel: true }); writeValue(v, "cbr", f0.cb.radius, { onLabel: true }); }
      if (f0.cs) { writeValue(v, "csd", { on: f0.cs.on, ...(f0.cs.dia || {}) }, { onLabel: true }); writeValue(v, "csa", f0.cs.angle, { onLabel: true }); }
      const t = f0.thread || {};
      if (t.on !== undefined) v.t_on = !!t.on;
      for (const [k, key] of [["threadType", "t_type"], ["size", "t_size"], ["designation", "t_designation"], ["tclass", "t_class"], ["direction", "t_dir"]]) if (t[k]) { v[key] = t[k]; dlg.touched.add(key); }
      if (t.through !== undefined && t.through !== null) { v.t_thru = !!t.through; dlg.touched.add("t_thru"); }
      writeValue(v, "tdep", t.depth, { onLabel: true });
      for (const k of Object.keys(v)) if (/_(value|modeled|tolOn|on)$/.test(k)) dlg.touched.add(k);
      dlg.defs.t_designation.options = designationOptions(v.t_size);
      v.planeIndex = planeIndexOf(f0.plane, cands(dlg));
      v.planeChosen = true;
    },
    onOpen(dlg) { if ((dlg.values.geom || []).length && !f0) { fromModel(dlg); dlg.values.placing = true; } },
    onChange(id, dlg) {
      const v = dlg.values;
      if (id === "geom") {
        dlg._candKey = null;
        if (!v.planeChosen) { v.planeIndex = -1; v.plane = null; }
        if (!f0 || dlg.touched.has("geom")) fromModel(dlg);
        if ((v.geom || []).length && !v.placed) { v.placing = true; setTimeout(() => { if (!dlg.closed && v.placing) dlg.activate(null); }, 0); }
      }
      if (id === "planeIndex") v.plane = null;
      if (id === "t_size") setOptions(dlg, "t_designation", designationOptions(v.t_size));
      if (/_on$|thru|quantity|^t_|_modeled$|_tolOn$/.test(id)) regenText(dlg);
    },
    prompt(dlg) {
      if (!(dlg.values.geom || []).length) return dlg.active === "geom" ? "Select a hole or boss" : "";
      if (dlg.values.placing && !dlg.active) return "Click in the canvas to place the note";
      return undefined;
    },
    onCanvasMove: place.onCanvasMove,
    onCanvasDown: place.onCanvasDown,
    status: (dlg) => { const h = hole(dlg); return h && h.hd ? (h.hd.featureName || (h.hd.kind === "hole" ? "Hole" : "Boss")) : ""; },
    validate(dlg) {
      const h = hole(dlg);
      if (!h || !h.hd) return "Select a hole or boss";
      return null;
    },
    build(v, dlg) {
      const h = hole(dlg);
      if (!h || !h.hd) return null;
      const pl = dialogPlane(dlg, cands(dlg), svc.renderer.view());
      if (!pl) return null;
      const u = readUnits(v);
      const boss = h.hd.kind !== "hole";
      const cbd = readValue(v, "cbd", { onLabel: true });
      const csd = readValue(v, "csd", { onLabel: true });
      const f = {
        type: "pmiHoleNote", refs: [h.g.ref], target: K.roundVec(h.hd.entry), plane: { type: pl.type, n: K.roundVec(pl.n), x: K.roundVec(pl.x) },
        pos: v.pos || [3 * H, 3 * H], ext: v.ext, perpendicular: !!v.perpendicular, flip: !!v.flip, quantity: v.quantity !== false,
        disp: u.disp, secondary: u.secondary, boss,
        through: boss ? false : !!v.thru,
        dia: readValue(v, "dia"),
        depth: readValue(v, boss ? "height" : "depth"),
        radius: readValue(v, "rad", { onLabel: true }),
        cb: { on: cbd.on, dia: { modeled: cbd.modeled, value: cbd.value, tol: cbd.tol }, depth: readValue(v, "cbdep", { onLabel: true }), radius: readValue(v, "cbr", { onLabel: true }) },
        cs: { on: csd.on, dia: { modeled: csd.modeled, value: csd.value, tol: csd.tol }, angle: readValue(v, "csa", { onLabel: true, noTol: true }) },
        thread: { on: !!v.t_on, threadType: v.t_type, size: v.t_size, designation: v.t_designation, tclass: v.t_class, direction: v.t_dir, through: !!v.t_thru, depth: readValue(v, "tdep", { onLabel: true }) },
        text: String(v.text ?? "%1%"), hAlign: v.hAlign || "left", vAlign: v.vAlign || "middle",
      };
      if (boss) f.cyl = "boss";
      // the generated lines are kept with the note so an orphaned note still shows its last text
      try { f.snapshot = holeNoteLines(f, h.hd, h.th, svc.ctxFor(dlg.baseState)); } catch { /* optional */ }
      return f;
    },
    afterPreview: (dlg) => svc.preview(dlg),
    commit: (f, dlg) => commitPmi(app, dlg, f, "Hole Note", "Hole/Thread Note"),
    onClose: () => svc.clearPreview(),
  });
}
