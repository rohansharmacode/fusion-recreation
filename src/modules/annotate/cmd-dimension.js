// Sizes and Dimensions (DimensionNoteCommand): linear, angular, radius and diameter PMI dimensions.
// Tabs after Fusion 2706: Leader line (Selection, Point position, annotation plane, Leader line,
// Units and precision, Secondary units) | Dimension (Modeled dimension, Dimension tolerance,
// Measurement alignment, Angular sector) | Text (%1% = the measured value).
import * as K from "../../kernel.js";
import * as G from "./geom.js";
import * as F from "./format.js";
import { dimensionMeasure } from "./annotations.js";
import {
  tabsRow, onTab, placeRow, planeRow, textRow, valueRows, readValue, writeValue, unitsRows, readUnits, writeUnits,
  placement, cachedCands, dialogPlane, planeIndexOf, commitPmi,
} from "./dlgkit.js";

const V = G.V;
const ALIGN = [
  { value: "auto", label: "Automatic" }, { value: "parallel", label: "Parallel" }, { value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" },
];
const SECTOR = [
  { value: "auto", label: "Automatic" }, { value: "acute", label: "Acute" }, { value: "obtuse", label: "Obtuse" }, { value: "locked", label: "Locked" },
];
const STEM = { linear: "Linear Dimension", angular: "Angular Dimension", diameter: "Diameter Dimension", radius: "Radius Dimension" };

/** {refs, m (measurement)} of the dialog selection on its base state (cached). */
function measured(dlg) {
  const sel = dlg.values.geom || [];
  const key = JSON.stringify(sel.map((r) => [r.body, r.kind, r.index, r.p]));
  if (dlg._meas && dlg._meas.key === key) return dlg._meas;
  const refs = sel.map((r) => G.storeRef(dlg.baseState, r)).filter(Boolean);
  const r = refs.length ? dimensionMeasure({ refs }, dlg.baseState) : { m: { error: "Select geometry to dimension" }, R: [] };
  dlg._meas = { key, refs, m: r.m, R: r.R || [] };
  return dlg._meas;
}

export function openDimension(app, svc, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const settings = F.settingsOf(app.doc);
  const H = settings.size;
  const type = (dlg) => { const m = measured(dlg).m; return m && !m.error ? m.type : null; };
  const cands = (dlg) => {
    const ms = measured(dlg);
    const m = ms.m;
    if (!m || m.error) return [];
    return cachedCands(dlg, `${ms.key}|${(dlg.values.altPlane || []).map((r) => r.index).join()}`, () => {
      if (m.type === "angular") return [{ type: "face", n: V.norm(m.n) }];
      const alt = (dlg.values.altPlane || [])[0];
      let custom = null;
      if (alt) { const R = G.resolveRef(dlg.baseState, G.storeRef(dlg.baseState, alt)); if (R && R.info && R.info.type === "PLANE") custom = R.info.n; }
      const contain = m.type === "linear" ? [V.sub(m.B, m.A)] : [];
      return G.planeCandidates(dlg.baseState, ms.R.filter(Boolean), { contain, custom });
    });
  };
  const originOf = (dlg) => {
    const m = measured(dlg).m;
    if (!m || m.error) return null;
    if (m.type === "linear") return V.mul(V.add(m.A, m.B), 0.5);
    if (m.type === "angular") return m.V;
    return m.c;
  };
  const frameOf = (dlg) => {
    const o = originOf(dlg);
    const pl = dialogPlane(dlg, cands(dlg), svc.renderer.view());
    return o && pl ? { o, n: pl.n, x: pl.x } : null;
  };
  // while placing, a click on more geometry adds it (two-item dimensions) instead of placing
  const addPick = (ctx, dlg) => {
    const hRef = ctx.hit && ctx.hit.ref;
    if (!hRef || !["face", "edge", "vertex"].includes(hRef.kind) || (dlg.values.geom || []).length >= 2) return false;
    const sel = dlg.values.geom || [];
    if (sel.some((r) => r.kind === hRef.kind && r.body === hRef.body && r.index === hRef.index)) return false;
    dlg.pickRef("geom", hRef);
    return true;
  };
  const place = placement(svc, frameOf, { allowActive: true, addPick });
  const unitsVis = onTab("leader");
  return app.ui.dialog.open({
    id: "DimensionNoteCommand",
    title: "Sizes and Dimensions",
    icon: "DimensionNoteCommand",
    featureLabel: "Sizes and Dimensions",
    editId,
    help: "Creates a product manufacturing information (PMI) for dimensions. Add linear, angular, radius, or diameter dimensions to the model.",
    preview: false,
    labelWidth: 152,
    ctrlWidth: 132,
    preselect: (opts.preselect || []).filter((r) => ["face", "edge", "vertex"].includes(r.kind)).slice(0, 2),
    values: { tab: "leader", text: "%1%", hAlign: "center", pos: null, placing: false, planeIndex: -1 },
    rows: [
      tabsRow([{ id: "leader", label: "Leader line" }, { id: "dimension", label: "Dimension" }, { id: "text", label: "Text" }]),
      { id: "selGroup", type: "group", label: "Selection", visible: onTab("leader"), rows: [
        { id: "geom", type: "selection", label: "Selection", kinds: ["face", "edge", "vertex"], max: 2, prompt: "Select geometry to dimension", tooltip: "Select one or two faces, edges or vertices to dimension." },
        placeRow("position", "Point position", "Select the position for the Dimension Note."),
        planeRow(cands, { visible: (v, d) => type(d) !== "angular" }),
        { id: "altPlane", type: "selection", label: "Alternate annotation plane", kinds: ["face"], planar: true, max: 1, min: 0, advance: false, visible: (v, d) => type(d) !== "angular", tooltip: "Select a face on the model to use as the annotation plane.\n\nUse this when the available annotation planes are not suitable." },
      ] },
      { id: "leaderGroup", type: "group", label: "Leader line", visible: onTab("leader"), rows: [
        { id: "ext", type: "value", label: "Leader line extension", kind: "length", default: `${F.fmtNum(H, { precision: 2 })} mm`, tooltip: "Sets the offset of the dimension text from the knuckle on the leader line." },
        { id: "perpendicular", type: "check", label: "Perpendicular text", tooltip: "Rotates the PMI note 90 degrees from its default orientation." },
      ] },
      ...unitsRows(settings, unitsVis),
      { id: "dimGroup", type: "group", label: "Dimension", visible: onTab("dimension"), rows: [
        ...valueRows("dim", { label: "Dimension", modeledLabel: "Modeled dimension", valueLabel: "Dimension", tolLabel: "Dimension tolerance", kind: "length", visible: (v, d) => type(d) !== "angular", tolTooltip: "Adds a tolerance to the dimension shown in the PMI note." }),
        ...valueRows("dimA", { label: "Dimension", modeledLabel: "Modeled dimension", valueLabel: "Dimension", tolLabel: "Dimension tolerance", kind: "angle", tolTypes: F.TOL_TYPES.filter((t) => !F.isFit(t.value) && t.value !== "basic"), visible: (v, d) => type(d) === "angular" }),
        { id: "alignment", type: "dropdown", label: "Measurement alignment", options: ALIGN, default: "auto", visible: (v, d) => type(d) === "linear", tooltip: "Orientation of the dimension: automatic, parallel to the measured edge, horizontal, or vertical.", sep: true },
        { id: "sector", type: "dropdown", label: "Angular sector", options: SECTOR, default: "auto", visible: (v, d) => type(d) === "angular", tooltip: "Which of the angles formed by the selected geometry is measured.", sep: true },
      ] },
      { id: "textGroup", type: "group", label: "Text", visible: onTab("text"), rows: [textRow("text", { rows: 3, tooltip: "Specifies the text shown in the PMI note.\n\n%1% is replaced by the measured dimension." })] },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      const sel = (f0.refs || []).map((r) => G.resolveRef(st, r)).filter(Boolean).map((R) => R.selRef);
      Object.assign(dlg.values, {
        geom: sel, pos: f0.pos || null, placed: true, plane: f0.plane, ext: f0.ext ?? dlg.values.ext, perpendicular: !!f0.perpendicular,
        alignment: f0.alignment || "auto", sector: f0.sector || "auto", text: f0.text ?? "%1%", hAlign: f0.hAlign || "center",
      });
      writeUnits(dlg.values, f0);
      writeValue(dlg.values, f0.dimType === "angular" ? "dimA" : "dim", { modeled: f0.modeled, value: f0.value, tol: f0.tol });
      if (f0.altFace) { const a = G.resolveRef(st, f0.altFace); if (a) dlg.values.altPlane = [a.selRef]; }
      dlg.values.planeIndex = planeIndexOf(f0.plane, cands(dlg));
      dlg.values.planeChosen = true;
      if (f0.lockedSector) dlg.values.lockedSector = f0.lockedSector;
    },
    onChange(id, dlg) {
      if (id === "geom" || id === "altPlane") {
        dlg._candKey = null;
        if (!dlg.values.planeChosen || id === "geom") { dlg.values.planeIndex = -1; dlg.values.plane = null; }
        const n = (dlg.values.geom || []).length;
        const m = measured(dlg).m;
        if (id === "geom" && n && !dlg.values.placed) dlg.values.placing = true;
        if (id === "geom" && n >= 2) setTimeout(() => { if (!dlg.closed && dlg.values.placing) dlg.activate(null); }, 0);
        // the modeled value is the default override value
        if (m && !m.error && !dlg.touched.has("dim_value") && m.type !== "angular") {
          const nominal = m.type === "linear" ? V.len(V.sub(m.B, m.A)) : m.type === "diameter" ? 2 * m.r : m.r;
          dlg.values.dim_value = `${F.fmtNum(nominal, { precision: 2 })} mm`;
        }
        if (m && !m.error && m.type === "angular" && !dlg.touched.has("dimA_value")) dlg.values.dimA_value = `${F.fmtNum(m.angle, { precision: 1 })} deg`;
      }
      if (id === "planeIndex") dlg.values.plane = null;
      if (id === "sector" && dlg.values.sector === "locked") {
        const P = svc.previewPrims();
        if (P && P.sectorRange) dlg.values.lockedSector = P.sectorRange;
      }
    },
    prompt(dlg) {
      const n = (dlg.values.geom || []).length;
      if (!n) return "Select geometry to dimension";
      const m = measured(dlg).m;
      if (m && m.error) return n < 2 ? "Select a second item to measure to" : m.error;
      if (dlg.values.placing) return n < 2 ? "Click to place the dimension, or select a second item" : "Click to place the dimension";
      return undefined;
    },
    onCanvasMove: place.onCanvasMove,
    onCanvasDown: place.onCanvasDown,
    status: (dlg) => { const m = measured(dlg).m; return m && !m.error ? ({ linear: "Linear Dimension", angular: "Angular Dimension", diameter: "Diameter Dimension", radius: "Radius Dimension" })[m.type] : ""; },
    validate(dlg) {
      const m = measured(dlg).m;
      if (!m || m.error) return (m && m.error) || "Select geometry to dimension";
      const t = m.type === "angular" ? "dimA" : "dim";
      if (!dlg.values[`${t}_modeled`]) { const r = dlg.evalValue(`${t}_value`); if (!r.ok || !(r.value > 0)) return "The dimension value must be greater than zero"; }
      return null;
    },
    build(v, dlg) {
      const ms = measured(dlg);
      const m = ms.m;
      if (!m || m.error || !ms.refs.length) return null;
      const pl = dialogPlane(dlg, cands(dlg), svc.renderer.view());
      if (!pl) return null;
      const key = m.type === "angular" ? "dimA" : "dim";
      const val = readValue(v, key);
      const u = readUnits(v);
      const H0 = H;
      const f = {
        type: "pmiDimension", dimType: m.type, refs: ms.refs, plane: { type: pl.type, n: K.roundVec(pl.n), x: K.roundVec(pl.x) },
        pos: v.pos || (m.type === "linear" ? [0, 3 * H0] : [3 * H0, 3 * H0]), ext: v.ext, perpendicular: !!v.perpendicular,
        alignment: v.alignment || "auto", sector: v.sector || "auto", modeled: val.modeled, tol: val.tol,
        disp: u.disp, secondary: u.secondary, text: String(v.text ?? "%1%"), hAlign: v.hAlign || "center",
      };
      if (!val.modeled) f.value = val.value;
      if (f.sector === "locked" && v.lockedSector) f.lockedSector = v.lockedSector;
      const alt = (v.altPlane || [])[0];
      if (alt) f.altFace = G.storeRef(dlg.baseState, alt);
      if (m.type === "diameter" || m.type === "radius") { const R0 = ms.R[0]; f.internal = !!(R0 && R0.info && G.cylinderOf(dlg.baseState, R0) && G.cylinderOf(dlg.baseState, R0).internal); }
      return f;
    },
    afterPreview: (dlg) => svc.preview(dlg),
    commit: (f, dlg) => commitPmi(app, dlg, f, (nf) => STEM[nf.dimType] || "Dimension", "Sizes and Dimensions"),
    onClose: () => svc.clearPreview(),
  });
}
