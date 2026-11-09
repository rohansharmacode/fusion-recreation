// Geometric Tolerancing (GeometricToleranceNoteCommand): feature control frames on surfaces or
// under an existing dimension / hole note, and datum feature symbols (Create Datum).
// Tabs: "Leader line and feature control frame table" | Text. Validation messages are Fusion's.
import * as K from "../../kernel.js";
import * as G from "./geom.js";
import * as F from "./format.js";
import { GDT, GDT_BY_ID, renderBlock } from "./text.js";
import { fcfBlock, gdtProblem, MATERIAL_MODS, DATUM_MODS, ZONES, ASSOCIATED, isPmi } from "./annotations.js";
import { dialogGeometry } from "./cmd-note.js";
import {
  tabsRow, onTab, placeRow, planeRow, textRow, unitsRows, readUnits, writeUnits, placement, cachedCands, dialogPlane,
  planeIndexOf, commitPmi, popupMenu,
} from "./dlgkit.js";

const V = G.V;
const LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ".split(""); // ASME skips I, O, Q
const TIP_SEL = "Select the surfaces to control, or an existing dimension or hole/thread note.";

/** Dark image (data URL) of a block painted by text.js (dialog icons, frame preview). */
export function blockImage(block, S = 22, color = "#262626") {
  try {
    const r = renderBlock(block, S);
    const c = r.canvas.getContext("2d");
    c.globalCompositeOperation = "source-in";
    c.fillStyle = color;
    c.fillRect(0, 0, r.canvas.width, r.canvas.height);
    return { url: r.canvas.toDataURL(), w: r.canvas.width, h: r.canvas.height };
  } catch { return null; }
}
const symImg = (id) => { const g = GDT_BY_ID[id]; return g ? blockImage({ kind: "text", lines: [g.ch] }, 26) : null; };

/** Datum identifiers defined by other Geometric Tolerancing features. */
export function definedDatums(app, exceptId) {
  const out = [];
  for (const f of app.doc.features) if (f.type === "pmiGdt" && f.id !== exceptId && f.datum && f.datum.on && f.datum.id && !out.includes(f.datum.id)) out.push(f.datum.id);
  return out;
}

function symbolRow() {
  return {
    id: "symRow", type: "custom", flush: true,
    render(dlg) {
      const row = document.createElement("div");
      row.className = "pmi-lrow";
      row.innerHTML = '<div class="dlg-label" title="Geometric characteristic of the feature control frame">Symbol</div><div class="dlg-ctl"></div>';
      const dd = document.createElement("div");
      dd.className = "dlg-dd pmi-symdd";
      dd.tabIndex = 0;
      dd.dataset.input = "fcf_sym";
      dd.innerHTML = '<span class="pmi-menu-ico"></span><span class="dlg-dd-text"></span><span class="dlg-dd-caret"></span>';
      try { dd.querySelector(".dlg-dd-caret").innerHTML = dlg.app.ui.dialog.glyph("ddCaret"); } catch { /* no caret */ }
      Object.defineProperty(dd, "value", { get: () => dlg.values.fcf_sym, set: (v) => dlg.set("fcf_sym", v, { user: true }) });
      dd.addEventListener("click", () => {
        popupMenu(dlg.app, dd, [{ value: "", label: "None", current: !dlg.values.fcf_sym, run: () => dlg.set("fcf_sym", "", { user: true }) },
          ...GDT.map((g) => { const im = symImg(g.id); return { value: g.id, label: g.label, img: im && im.url, current: dlg.values.fcf_sym === g.id, run: () => dlg.set("fcf_sym", g.id, { user: true }) }; })], { id: "fcf_sym" });
      });
      row.querySelector(".dlg-ctl").appendChild(dd);
      return row;
    },
    update(el, dlg) {
      const dd = el.querySelector("[data-input=fcf_sym]");
      const g = GDT_BY_ID[dlg.values.fcf_sym];
      const im = g ? symImg(g.id) : null;
      dd.querySelector(".pmi-menu-ico").innerHTML = im ? `<img src="${im.url}" alt="">` : "";
      dd.querySelector(".dlg-dd-text").textContent = g ? g.label : "None";
      dd.dataset.value = dlg.values.fcf_sym || "";
    },
  };
}

function framePreviewRow(svc) {
  return {
    id: "fcfPreview", type: "custom", flush: true,
    render() {
      const d = document.createElement("div");
      d.className = "pmi-fcf-preview";
      d.dataset.input = "fcfPreview";
      return d;
    },
    update(el, dlg) {
      let f = null;
      try { f = dlg.spec.build(dlg.values, dlg); } catch { f = null; }
      const b = f ? fcfBlock(f, svc.ctxFor(dlg.baseState)) : null;
      const key = b ? JSON.stringify(b) : "";
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      if (!b) { el.innerHTML = '<span class="pmi-fcf-empty">No feature control frame</span>'; return; }
      const im = blockImage(b, 18);
      el.innerHTML = im ? `<img src="${im.url}" width="${Math.round(im.w * 0.8)}" height="${Math.round(im.h * 0.8)}" alt="feature control frame">` : "";
    },
  };
}

export function openGdt(app, svc, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const settings = F.settingsOf(app.doc);
  const H = settings.size;
  const annotOf = (dlg) => { const r = (dlg.values.geom || [])[0]; return r && r.kind === "feature" ? r.id : null; };
  const surf = (dlg) => { const r = (dlg.values.geom || [])[0]; return !!r && r.kind !== "feature"; };
  const cands = (dlg) => {
    const g = surf(dlg) ? dialogGeometry(dlg) : null;
    if (!g || !g.R) return [];
    return cachedCands(dlg, g.key, () => G.planeCandidates(dlg.baseState, [g.R]));
  };
  const frameOf = (dlg) => {
    const g = surf(dlg) ? dialogGeometry(dlg) : null;
    if (!g || !g.R) return null;
    const pl = dialogPlane(dlg, cands(dlg), svc.renderer.view());
    return pl ? { o: g.R.point, n: pl.n, x: pl.x } : null;
  };
  const place = placement(svc, frameOf);
  const used = definedDatums(app, editId);
  const nextLetter = LETTERS.find((l) => !used.includes(l)) || "A";
  const datumOptions = [{ value: "", label: "None" }, ...LETTERS.map((l) => ({ value: l, label: used.includes(l) ? l : `${l}` }))];
  const fcfVis = onTab("main");
  const datumRows = [1, 2, 3].flatMap((i) => [
    { id: `fcf_d${i}`, type: "dropdown", label: ["Primary datum", "Secondary datum", "Tertiary datum"][i - 1], options: datumOptions, default: "", visible: (v) => i === 1 || !!v[`fcf_d${i - 1}`] },
    { id: `fcf_d${i}m`, type: "dropdown", label: "Modifier", options: DATUM_MODS, default: "", visible: (v) => !!v[`fcf_d${i}`] },
  ]);
  const compositeOptions = (v) => {
    const ds = [v.fcf_d1, v.fcf_d2, v.fcf_d3].filter(Boolean);
    const out = [{ value: "", label: "None" }];
    for (let k = 1; k <= ds.length; k++) out.push({ value: ds.slice(0, k).join(","), label: ds.slice(0, k).join(" ") });
    return out;
  };
  return app.ui.dialog.open({
    id: "GeometricToleranceNoteCommand",
    title: "Geometric Tolerancing",
    icon: "GeometricToleranceNoteCommand",
    featureLabel: "Geometric Tolerancing",
    editId,
    help: "Creates a product manufacturing information (PMI) geometric tolerance annotation. Add geometric tolerancing feature control frames and datum icons to annotate geometric tolerances on model geometry.",
    preview: false,
    labelWidth: 152,
    ctrlWidth: 132,
    preselect: (opts.preselect || []).filter((r) => ["face", "edge"].includes(r.kind) || (r.kind === "feature" && ["pmiDimension", "pmiHoleNote"].includes((app.feature(r.id) || {}).type))).slice(0, 1),
    values: { tab: "main", text: "%1%", hAlign: "left", pos: null, placing: false, planeIndex: -1, fcf_tol: `${F.fmtNum(settings.tolerance, { precision: 2 })} mm`, d_id: nextLetter },
    rows: [
      tabsRow([{ id: "main", label: "Leader line and feature control frame table" }, { id: "text", label: "Text" }]),
      { id: "selGroup", type: "group", label: "Leader line", visible: fcfVis, rows: [
        { id: "geom", type: "selection", label: "Surfaces/Dimensions", kinds: ["face", "edge", "feature"], max: 1, tooltip: TIP_SEL, prompt: "Select surfaces or a dimension",
          filter: (r) => r.kind !== "feature" || (r.id !== editId && ["pmiDimension", "pmiHoleNote"].includes((app.feature(r.id) || {}).type)) },
        placeRow("position", "Leader line position", "Select the position for the feature control frame."),
        planeRow(cands, { visible: (v, d) => surf(d) }),
        { id: "ext", type: "value", label: "Leader line extension", kind: "length", default: `${F.fmtNum(H, { precision: 2 })} mm`, visible: (v, d) => surf(d), tooltip: "Sets the offset of the PMI note from the leader line endpoint." },
        { id: "perpendicular", type: "check", label: "Perpendicular text", visible: (v, d) => surf(d), tooltip: "Rotates the PMI note 90 degrees from its default orientation." },
      ] },
      { id: "fcfGroup", type: "group", label: "Feature Control Frame", visible: fcfVis, rows: [
        framePreviewRow(svc),
        symbolRow(),
        { id: "fcf_dia", type: "check", label: "Diameter zone", tooltip: "Adds the diameter symbol to the tolerance zone (cylindrical zone).", visible: (v) => !!v.fcf_sym },
        { id: "fcf_tol", type: "value", label: "Tolerance", kind: "length", positive: true, visible: (v) => !!v.fcf_sym },
        { id: "fcf_mat", type: "dropdown", label: "Material condition", options: MATERIAL_MODS, default: "", visible: (v) => !!v.fcf_sym },
        ...datumRows.map((r) => ({ ...r, visible: (v) => !!v.fcf_sym && r.visible(v) })),
        { id: "fcf_free", type: "check", label: "Free State", visible: (v) => !!v.fcf_sym, sep: true },
        { id: "fcf_tan", type: "check", label: "Tangent Plane", visible: (v) => !!v.fcf_sym },
        { id: "fcf_proj", type: "check", label: "Projected Tolerance Zone", visible: (v) => !!v.fcf_sym },
        { id: "fcf_projV", type: "value", label: "Value", kind: "length", default: "0.00 mm", nonNegative: true, visible: (v) => !!v.fcf_sym && !!v.fcf_proj },
        { id: "fcf_zone", type: "dropdown", label: "Zone", options: ZONES, default: "", visible: (v) => !!v.fcf_sym },
        { id: "fcf_assoc", type: "dropdown", label: "Associated feature", options: ASSOCIATED, default: "", visible: (v) => !!v.fcf_sym },
        { id: "fcf_comp", type: "check", label: "Composite Control", visible: (v) => !!v.fcf_sym, sep: true },
        { id: "fcf_ctol", type: "value", label: "Tolerance", kind: "length", positive: true, default: `${F.fmtNum(settings.tolerance / 2, { precision: 2 })} mm`, visible: (v) => !!v.fcf_sym && !!v.fcf_comp },
        { id: "fcf_cdat", type: "dropdown", label: "Datums", options: [{ value: "", label: "None" }], default: "", visible: (v) => !!v.fcf_sym && !!v.fcf_comp },
      ] },
      { id: "datumGroup", type: "group", label: "Create Datum", visible: fcfVis, rows: [
        { id: "d_on", type: "check", label: "Create Datum", tooltip: "Adds a datum feature symbol to the selected geometry." },
        { id: "d_id", type: "dropdown", label: "Datum Identifier", options: LETTERS.map((l) => ({ value: l, label: l })), visible: (v) => !!v.d_on },
        { id: "d_leader", type: "check", label: "Leader Line", visible: (v, d) => !!v.d_on && surf(d) && !v.fcf_sym },
        { id: "d_ext", type: "value", label: "Datum extension", kind: "length", default: "0.00 mm", visible: (v) => !!v.d_on },
        { id: "d_off", type: "value", label: "Offset", kind: "length", default: "0.00 mm", visible: (v) => !!v.d_on && !!v.fcf_sym },
      ] },
      ...unitsRows(settings, fcfVis, { label: "Precision", noUnit: true, noSecondary: true, collapsed: true }),
      { id: "textGroup", type: "group", label: "Text", visible: onTab("text"), rows: [textRow("text", { rows: 3, tooltip: "Specifies the text shown in the PMI note. You can add or edit text; values from other dialog areas may update the note automatically.\n\n%1% is the feature control frame: lines above it are shown above the frame, lines below it under the frame." })] },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      const v = dlg.values;
      if (f0.annot) v.geom = [{ kind: "feature", id: f0.annot }];
      else { const R = G.resolveRef(st, (f0.refs || [])[0]); v.geom = R ? [R.selRef] : []; }
      Object.assign(v, { pos: f0.pos || null, placed: true, plane: f0.plane, ext: f0.ext ?? v.ext, perpendicular: !!f0.perpendicular, text: f0.text ?? "%1%" });
      const c = f0.fcf || {};
      Object.assign(v, { fcf_sym: c.sym || "", fcf_dia: !!c.dia, fcf_tol: c.tol ?? v.fcf_tol, fcf_mat: c.mat || "", fcf_free: !!c.free, fcf_tan: !!c.tangent, fcf_proj: !!(c.proj && c.proj.on), fcf_zone: c.zone || "", fcf_assoc: c.assoc || "" });
      if (c.proj && c.proj.value) v.fcf_projV = c.proj.value;
      (c.datums || []).forEach((d, i) => { if (d) { v[`fcf_d${i + 1}`] = d.id || ""; v[`fcf_d${i + 1}m`] = d.mod || ""; } });
      if (c.composite) { v.fcf_comp = !!c.composite.on; if (c.composite.tol) v.fcf_ctol = c.composite.tol; v.fcf_cdat = (c.composite.datums || []).map((d) => d.id).join(","); }
      const d = f0.datum || {};
      Object.assign(v, { d_on: !!d.on, d_id: d.id || v.d_id, d_leader: !!d.leader });
      if (d.ext) v.d_ext = d.ext;
      if (d.offset) v.d_off = d.offset;
      writeUnits(v, f0);
      v.planeIndex = planeIndexOf(f0.plane, cands(dlg));
      v.planeChosen = true;
      dlg.defs.fcf_cdat.options = compositeOptions(v);
    },
    onChange(id, dlg) {
      const v = dlg.values;
      if (id === "geom") {
        dlg._candKey = null;
        if (!v.planeChosen) { v.planeIndex = -1; v.plane = null; }
        if ((v.geom || []).length && surf(dlg) && !v.placed) { v.placing = true; setTimeout(() => { if (!dlg.closed && v.placing) dlg.activate(null); }, 0); }
        if (!surf(dlg)) v.placing = false;
      }
      if (id === "planeIndex") v.plane = null;
      if (/^fcf_d\d$/.test(id) || id === "fcf_comp") {
        dlg.defs.fcf_cdat.options = compositeOptions(v);
        if (!dlg.defs.fcf_cdat.options.some((o) => o.value === v.fcf_cdat)) v.fcf_cdat = "";
        const re = dlg.rowEls && dlg.rowEls.fcf_cdat;
        if (re) re.update();
      }
    },
    prompt(dlg) {
      if (!(dlg.values.geom || []).length) return dlg.active === "geom" ? "Select surfaces or a dimension" : "";
      if (dlg.values.placing && !dlg.active) return "Click in the canvas to place the feature control frame";
      return undefined;
    },
    onCanvasMove: place.onCanvasMove,
    onCanvasDown: place.onCanvasDown,
    status: (dlg) => { const r = (dlg.values.geom || [])[0]; return r ? (r.kind === "feature" ? (app.feature(r.id) || {}).name || "" : r.kind === "face" ? "Face" : "Edge") : ""; },
    validate(dlg) {
      const v = dlg.values;
      const r = (v.geom || [])[0];
      if (!r) return "Select surfaces or a dimension";
      if (!v.fcf_sym && !v.d_on) return "Select a geometric characteristic or create a datum";
      const annot = annotOf(dlg);
      if (annot) {
        const other = app.doc.features.find((x) => x.type === "pmiGdt" && x.id !== editId && x.annot === annot);
        if (other) return "The selected annotation is already referenced by another Geometric Tolerance note.";
      }
      if (v.d_on && definedDatums(app, editId).includes(v.d_id)) return `Datum ${v.d_id} already exists in the design.`;
      const f = dlg.feature || (() => { try { return dlg.spec.build(v, dlg); } catch { return null; } })();
      if (!f) return "Select surfaces or a dimension";
      const R0 = surf(dlg) ? (dialogGeometry(dlg) || {}).R : null;
      return gdtProblem(f, R0, annot ? app.feature(annot) : null, svc.ctxFor(dlg.baseState).P);
    },
    build(v, dlg) {
      const r = (v.geom || [])[0];
      if (!r) return null;
      const u = readUnits(v);
      const datums = [1, 2, 3].map((i) => (v[`fcf_d${i}`] ? { id: v[`fcf_d${i}`], mod: v[`fcf_d${i}m`] || "" } : null)).filter(Boolean);
      const f = {
        type: "pmiGdt", refs: [], pos: v.pos || [3 * H, 3 * H], ext: v.ext, perpendicular: !!v.perpendicular, text: String(v.text ?? "%1%"),
        fcf: {
          sym: v.fcf_sym || "", dia: !!v.fcf_dia, tol: v.fcf_tol, mat: v.fcf_mat || "", free: !!v.fcf_free, tangent: !!v.fcf_tan,
          proj: { on: !!v.fcf_proj, value: v.fcf_projV }, zone: v.fcf_zone || "", assoc: v.fcf_assoc || "", datums,
          composite: { on: !!v.fcf_comp, tol: v.fcf_ctol, datums: String(v.fcf_cdat || "").split(",").filter(Boolean).map((id) => ({ id, mod: (datums.find((d) => d.id === id) || {}).mod || "" })) },
        },
        datum: { on: !!v.d_on, id: v.d_id || "A", leader: !!v.d_leader, ext: v.d_ext, offset: v.d_off },
        disp: { precision: u.disp.precision, leading: u.disp.leading, trailing: u.disp.trailing },
      };
      if (r.kind === "feature") { f.annot = r.id; delete f.pos; return f; }
      const g = dialogGeometry(dlg);
      if (!g || !g.R) return null;
      const pl = dialogPlane(dlg, cands(dlg), svc.renderer.view());
      if (!pl) return null;
      f.refs = [g.ref];
      f.target = K.roundVec(g.R.point);
      f.plane = { type: pl.type, n: K.roundVec(pl.n), x: K.roundVec(pl.x) };
      return f;
    },
    afterPreview(dlg) {
      svc.preview(dlg);
      const msg = dlg.spec.validate(dlg);
      if (msg && (dlg.values.geom || []).length && (dlg.values.fcf_sym || dlg.values.d_on)) dlg.message(msg, "error");
      else if (dlg.values.fcf_sym) {
        const missing = [1, 2, 3].map((i) => dlg.values[`fcf_d${i}`]).filter(Boolean).filter((id) => !definedDatums(app, editId).includes(id) && !(dlg.values.d_on && dlg.values.d_id === id));
        if (missing.length) dlg.message(`Datum ${missing.join(", ")} is not defined in the design yet.`, "warning");
      }
    },
    commit: (f, dlg) => commitPmi(app, dlg, f, (nf) => (nf.fcf && nf.fcf.sym ? (GDT_BY_ID[nf.fcf.sym] || {}).label || "Geometric Tolerance" : { name: `Datum ${nf.datum.id}` }), "Geometric Tolerancing"),
    onClose: () => svc.clearPreview(),
  });
}

export { isPmi };
