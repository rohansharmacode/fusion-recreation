// Note (LeaderLineNoteCommand) and General Note (GeneralNoteCommand).
// Note: "Select geometry on the model. The PMI note appears immediately after the first selection.
// Click in the canvas to anchor the note." Leader with a dot on faces / an arrow on edges and
// vertices, a landing (Leader line extension, signed: the side of the text) and the text on an
// annotation plane (Change annotation plane cycles the candidates; Alternate annotation plane = a face).
import * as K from "../../kernel.js";
import * as G from "./geom.js";
import * as F from "./format.js";
import { DEFAULT_NOTE_TEXT } from "./annotations.js";
import {
  placeRow, planeRow, textRow, placement, cachedCands, dialogPlane, planeIndexOf, commitPmi, GL,
} from "./dlgkit.js";

const V = G.V;
const TIP = {
  geom: "Select geometry on the model.\n\nThe PMI note appears immediately after the first selection. Click in the canvas to anchor the note.",
  position: "Select the position for the leader line note.",
  alt: "Select a face on the model to use as the annotation plane.\n\nUse this when the available annotation planes are not suitable.",
  perp: "Rotates the PMI note 90 degrees from its default orientation.",
  ext: "Sets the offset of the PMI note from the leader line endpoint.\n\nPositive values place the text on one side of the leader line. Negative values place it on the opposite side.",
};

/** Resolved annotated geometry of a dialog: {ref (stored), R} on the dialog's base state. */
export function dialogGeometry(dlg, rowId = "geom") {
  const r = (dlg.values[rowId] || [])[0];
  if (!r) return null;
  const key = JSON.stringify([r.body, r.kind, r.index, r.p]);
  if (dlg[`_geo_${rowId}`] && dlg[`_geo_${rowId}`].key === key) return dlg[`_geo_${rowId}`];
  const ref = G.storeRef(dlg.baseState, r);
  const R = ref ? G.resolveRef(dlg.baseState, ref) : null;
  const out = { key, ref, R };
  dlg[`_geo_${rowId}`] = out;
  return out;
}
export function altFaceOf(dlg) {
  const r = (dlg.values.altPlane || [])[0];
  if (!r) return null;
  const ref = G.storeRef(dlg.baseState, r);
  const R = ref ? G.resolveRef(dlg.baseState, ref) : null;
  return R && R.info && R.info.type === "PLANE" ? { ref, R } : null;
}

export function openNote(app, svc, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const settings = F.settingsOf(app.doc);
  const H = settings.size;
  const cands = (dlg) => {
    const g = dialogGeometry(dlg);
    const alt = altFaceOf(dlg);
    if (!g || !g.R) return [];
    return cachedCands(dlg, `${g.key}|${alt ? alt.R.index + ":" + alt.R.body : ""}`, () => G.planeCandidates(dlg.baseState, [g.R], { custom: alt ? alt.R.info.n : null }));
  };
  const frameOf = (dlg) => {
    const g = dialogGeometry(dlg);
    if (!g || !g.R) return null;
    const pl = dialogPlane(dlg, cands(dlg), svc.renderer.view());
    return pl ? { o: g.R.point, n: pl.n, x: pl.x } : null;
  };
  const place = placement(svc, frameOf);
  return app.ui.dialog.open({
    id: "LeaderLineNoteCommand",
    title: "Note",
    icon: "LeaderLineNoteCommand",
    featureLabel: "Note",
    editId,
    help: "Creates a product manufacturing information (PMI) general note. Add a leader line and include general information, such as instructions, references to standards, or clarifications.",
    preview: false,
    labelWidth: 152,
    ctrlWidth: 132,
    preselect: (opts.preselect || []).filter((r) => ["face", "edge", "vertex"].includes(r.kind)).slice(0, 1),
    values: { text: DEFAULT_NOTE_TEXT, hAlign: "left", vAlign: "middle", pos: null, placing: false, planeIndex: -1 },
    rows: [
      { id: "leader", type: "group", label: "Leader line", tooltip: "Specifies the leader line settings for the PMI note.", rows: [
        { id: "geom", type: "selection", label: "Geometry", kinds: ["face", "edge", "vertex"], max: 1, prompt: "Select geometry on the model", tooltip: TIP.geom },
        placeRow("position", "Leader line position", TIP.position),
        planeRow(cands),
        { id: "altPlane", type: "selection", label: "Alternate annotation plane", kinds: ["face"], planar: true, max: 1, min: 0, advance: false, tooltip: TIP.alt, prompt: "Select a planar face" },
        { id: "perpendicular", type: "check", label: "Perpendicular text", tooltip: TIP.perp },
        { id: "ext", type: "value", label: "Leader line extension", kind: "length", default: F.fmtLen(H, { precision: 2 }) + " mm", tooltip: TIP.ext },
      ] },
      { id: "textGroup", type: "group", label: "Text", tooltip: "Specifies the text shown in the PMI note.", rows: [textRow("text", { vAlign: true, rows: 3 })] },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      const R = G.resolveRef(st, (f0.refs || [])[0]);
      Object.assign(dlg.values, {
        geom: R ? [R.selRef] : [], pos: f0.pos || null, placing: false, placed: true, plane: f0.plane, ext: f0.ext ?? dlg.values.ext,
        perpendicular: !!f0.perpendicular, text: f0.text ?? "", hAlign: f0.hAlign || "left", vAlign: f0.vAlign || "middle",
      });
      const alt = f0.altFace ? G.resolveRef(st, f0.altFace) : null;
      if (alt) dlg.values.altPlane = [alt.selRef];
      dlg.values.planeIndex = planeIndexOf(f0.plane, cands(dlg));
      dlg.values.planeChosen = true;
    },
    onChange(id, dlg) {
      if (id === "geom" || id === "altPlane") {
        dlg._candKey = null;
        if (id === "geom" && !dlg.values.planeChosen) { dlg.values.planeIndex = -1; dlg.values.plane = null; }
        if (id === "altPlane" && (dlg.values.altPlane || []).length) {
          // the alternate face becomes the annotation plane
          const c = cands(dlg);
          const i = c.findIndex((x) => x.type === "custom");
          if (i >= 0) { dlg.values.planeIndex = i; dlg.values.plane = null; dlg.values.planeChosen = true; }
        }
        if (id === "geom" && (dlg.values.geom || []).length && !dlg.values.placed) {
          dlg.values.placing = true;
          setTimeout(() => { if (!dlg.closed && dlg.values.placing) dlg.activate(null); }, 0);
        }
      }
      if (id === "planeIndex") dlg.values.plane = null;
    },
    prompt(dlg) {
      if (!(dlg.values.geom || []).length) return dlg.active === "geom" ? "Select geometry on the model" : "";
      if (dlg.values.placing && !dlg.active) return "Click in the canvas to anchor the note";
      return undefined;
    },
    onCanvasMove: place.onCanvasMove,
    onCanvasDown: place.onCanvasDown,
    status: (dlg) => { const g = dialogGeometry(dlg); return g && g.R ? (g.R.kind === "face" ? "Face" : g.R.kind === "edge" ? "Edge" : "Vertex") : ""; },
    validate(dlg) {
      const g = dialogGeometry(dlg);
      if (!g || !g.R) return "Select geometry on the model";
      if (!String(dlg.values.text ?? "").trim()) return "Enter the note text";
      return null;
    },
    build(v, dlg) {
      const g = dialogGeometry(dlg);
      if (!g || !g.R) return null;
      const pl = dialogPlane(dlg, cands(dlg), svc.renderer.view());
      if (!pl) return null;
      const alt = altFaceOf(dlg);
      const f = {
        type: "pmiNote", refs: [g.ref], target: K.roundVec(g.R.point), plane: { type: pl.type, n: K.roundVec(pl.n), x: K.roundVec(pl.x) },
        pos: v.pos || [3 * H, 3 * H], ext: v.ext, perpendicular: !!v.perpendicular, text: String(v.text ?? ""), hAlign: v.hAlign || "left", vAlign: v.vAlign || "middle",
      };
      if (alt) f.altFace = alt.ref;
      return f;
    },
    afterPreview: (dlg) => svc.preview(dlg),
    commit: (f, dlg) => commitPmi(app, dlg, f, "Note", "Note"),
    onClose: () => svc.clearPreview(),
  });
}

// ---------------------------------------------------------------- General Note
const QUADRANTS = [
  ["ul", "Upper left quadrant"], ["ur", "Upper right quadrant"], ["ll", "Lower left quadrant"], ["lr", "Lower right quadrant"],
];
function quadrantRow() {
  return {
    id: "quadrantRow", type: "custom", flush: true,
    render(dlg) {
      const row = document.createElement("div");
      row.className = "pmi-lrow";
      const lab = document.createElement("div");
      lab.className = "dlg-label";
      lab.textContent = "Change note quadrant";
      lab.title = "Changes the General Note quadrant.";
      const ctl = document.createElement("div");
      ctl.className = "dlg-ctl";
      const g = document.createElement("div");
      g.className = "pmi-tgroup";
      g.dataset.input = "quadrant";
      for (const [q, label] of QUADRANTS) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pmi-ibtn";
        b.innerHTML = GL[q];
        b.title = label;
        b.dataset.option = q;
        b.addEventListener("click", () => dlg.set("quadrant", q, { user: true }));
        g.appendChild(b);
      }
      ctl.appendChild(g);
      row.append(lab, ctl);
      return row;
    },
    update(el, dlg) {
      const g = el.querySelector("[data-input=quadrant]");
      g.dataset.value = dlg.values.quadrant;
      for (const b of g.children) b.classList.toggle("on", b.dataset.option === dlg.values.quadrant);
    },
  };
}

export function openGeneralNote(app, svc, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "GeneralNoteCommand",
    title: "General Note",
    icon: "GeneralNoteCommand",
    featureLabel: "General Note",
    editId,
    help: "Creates a product manufacturing information (PMI) general note. Add a general note and include general information, such as instructions, references to standards, or clarifications.",
    preview: false,
    labelWidth: 140,
    ctrlWidth: 140,
    activate: false,
    values: { text: "", hAlign: "left", quadrant: "ll" },
    rows: [
      { id: "textGroup", type: "group", label: "Text", tooltip: "Specifies the text shown in the PMI note.", rows: [textRow("text", { rows: 4 })] },
      quadrantRow(),
    ],
    init(dlg) {
      if (f0) Object.assign(dlg.values, { text: f0.text ?? "", hAlign: f0.hAlign || "left", quadrant: f0.quadrant || "ll" });
    },
    onOpen(dlg) { setTimeout(() => { const ta = dlg.el && dlg.el.querySelector("textarea[data-input=text]"); if (ta && !dlg.closed) ta.focus(); }, 0); },
    validate: (dlg) => (String(dlg.values.text ?? "").trim() ? null : "Enter the note text"),
    build: (v) => ({ type: "pmiGeneralNote", text: String(v.text ?? ""), hAlign: v.hAlign || "left", quadrant: v.quadrant || "ll" }),
    afterPreview: (dlg) => svc.preview(dlg),
    commit: (f, dlg) => commitPmi(app, dlg, f, "General Note", "General Note"),
    onClose: () => svc.clearPreview(),
  });
}

export { V };
