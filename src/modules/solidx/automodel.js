// CREATE > Automated Modeling (AutomatedModelingCommand), local version: Fusion sends the faces to a cloud
// solver; here "Generate Shapes" builds three alternatives in the browser (Smooth Connections: smooth loft
// through the faces' outlines, Sharp Connections: ruled loft, Strut: round bars between the face centres),
// each with the Bodies to Avoid cut away. Pick a tile, adjust Volume, OK adds a timeline feature.
//
// automodel {faces:[{body,p,n}], avoid:[bodyId], style:'smooth'|'sharp'|'strut', volume, operation, bodies:[ids]}
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import * as U from "../dialogs/util.js";
import { beginModelCommand } from "../dialogs/common.js";

const V = K.V;
const R = K.R;
export const STYLES = [
  { value: "smooth", label: "Smooth Connections" },
  { value: "sharp", label: "Sharp Connections" },
  { value: "strut", label: "Strut" },
];

/** Connecting shape between the faces (in selection order) with the avoided bodies cut away. */
export function connectingShape(st, f, volume) {
  const k = Math.max(0.1, Math.min(4, Number(volume) || 1));
  const faces = [];
  try {
    for (const ref of f.faces || []) {
      const b = st.bodies.get(ref.body);
      if (!b) throw new Error("The referenced body is missing");
      const i = M.locateFace(b.shape, ref);
      if (i < 0) throw new Error("The referenced face could not be found");
      const [face] = K.facesAt(b.shape, [i]);
      const bb = K.bboxOf(face);
      faces.push({ face, info: K.topoOf(b.shape).faces[i], size: bb ? V.len(V.sub(bb.max, bb.min)) : 10, c: bb ? V.mul(V.add(bb.min, bb.max), 0.5) : ref.p });
    }
    if (faces.length < 2) throw new Error("Select at least two faces to generate shapes between them.");
    let tool = null;
    if (f.style === "strut") {
      const parts = [];
      for (let i = 0; i + 1 < faces.length; i++) {
        const a = faces[i].c, b = faces[i + 1].c;
        const L = V.len(V.sub(b, a));
        if (L < 1e-6) continue;
        const r = Math.max(0.2, 0.18 * k * Math.min(faces[i].size, faces[i + 1].size));
        parts.push(R.makeCylinder(r, L, a, V.mul(V.sub(b, a), 1 / L)));
      }
      if (!parts.length) throw new Error("The faces are too close to connect");
      tool = M.fuseTemp(parts);
    } else {
      const wires = faces.map(({ face, c }) => {
        const w = face.outerWire();
        if (Math.abs(k - 1) < 1e-9) return w;
        const s = w.scale(k, c);
        return s;
      });
      tool = R.loft(wires, { ruled: f.style === "sharp" });
      K.del(wires);
    }
    for (const id of f.avoid || []) {
      const b = st.bodies.get(id);
      if (!b || !K.boxesOverlap(K.bboxOf(b.shape), K.bboxOf(tool))) continue;
      const n = K.cut(tool, b.shape);
      K.del(tool);
      tool = n;
    }
    if (K.isEmptyShape(tool)) throw new Error("The alternative is fully inside the bodies to avoid");
    return tool;
  } finally { K.del(faces.map((x) => x.face)); }
}

export const AUTO_MODEL = {
  label: "Automated Modeling", stem: "Automated Modeling", fields: { volume: "none" }, icon: "AutomatedModelingCommand",
  makesBodies: () => true,
  apply(st, f, P, doc) {
    const tool = connectingShape(st, f, M.fval(P, f, "volume"));
    return { affected: M.applyOp(st, f, tool, doc) };
  },
  touches: (f) => f.bodies || [],
};

// ---------------------------------------------------------------------------------------------
// dialog
// ---------------------------------------------------------------------------------------------
const OPS = [{ value: "join", label: "Join", icon: "join" }, { value: "new", label: "New Body", icon: "newBody" }, { value: "newComponent", label: "New Component", icon: "newComponent" }];
const solidFace = (state) => (r) => { const b = state.bodies.get(r.body); return !!b && M.shapeKind(b.shape) === "solid"; };

export function openAutomatedModeling(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const inputsKey = (v) => JSON.stringify([(v.faces || []).map((r) => [r.body, r.index]), (v.avoid || []).map((r) => r.body), v.volume]);
  const generate = (dlg) => {
    const v = dlg.values;
    const base = { faces: (v.faces || []).map((r) => ({ body: r.body, p: r.p, n: r.n })), avoid: (v.avoid || []).map((r) => r.body) };
    const vol = dlg.num("volume");
    dlg._alts = STYLES.map((s) => {
      let shape = null;
      try {
        const st = { ...dlg.baseState, bodies: new Map(dlg.baseState.bodies) };
        shape = connectingShape(st, { ...base, style: s.value }, vol);
        const volume = Math.abs(K.volumeOf(shape));
        return { ...s, ok: true, volume };
      } catch (e) {
        return { ...s, ok: false, error: e.message || String(e) };
      } finally { K.del(shape); }
    });
    dlg._generatedFor = inputsKey(v);
    const first = dlg._alts.find((a) => a.ok);
    dlg.set("style", first ? first.value : "", { user: true });
    dlg.refresh();
  };
  return app.ui.dialog.open({
    id: "AutomatedModelingCommand", title: "Automated Modeling", icon: "AutomatedModelingCommand", editId, featureLabel: "Automated Modeling",
    help: "Generates alternative shapes that connect the faces and bodies you pick.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "face"),
    labelWidth: 110, ctrlWidth: 190,
    rows: [
      { id: "faces", type: "selection", label: "Faces to Connect", kinds: ["face"], min: 2, advance: false, filter: (r, dlg) => solidFace(dlg.baseState)(r), prompt: "Select faces to connect (only faces that are part of solids)", tooltip: "Select at least two faces that are part of the solids that you want to connect." },
      { id: "avoid", type: "selection", label: "Bodies to Avoid", kinds: ["body"], min: 0, advance: false, filter: (r, dlg) => solidFace(dlg.baseState)(r) && !(dlg.values.faces || []).some((f) => f.body === r.body), prompt: "Select bodies to avoid (only solids)", tooltip: "Select solid bodies that you want to avoid." },
      {
        id: "gen", type: "custom", label: "",
        render(dlg) {
          const box = document.createElement("div");
          box.className = "sx-am";
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "sx-am-gen";
          btn.dataset.input = "generate";
          btn.addEventListener("click", () => { if (!btn.disabled) generate(dlg); });
          const tiles = document.createElement("div");
          tiles.className = "sx-am-tiles";
          box.append(btn, tiles);
          return box;
        },
        update(el, dlg) {
          const btn = el.querySelector(".sx-am-gen"), tiles = el.querySelector(".sx-am-tiles");
          const n = (dlg.values.faces || []).length;
          const stale = dlg._alts && dlg._generatedFor !== inputsKey(dlg.values);
          btn.disabled = n < 2;
          btn.textContent = dlg._alts ? "Regenerate Shapes" : "Generate Shapes";
          btn.title = n < 2 ? "Select at least two faces to generate shapes between them. The shapes appear in the Alternatives field." : "Generates shapes between the faces that you selected. The shapes appear in the Alternatives field.";
          tiles.textContent = "";
          for (const [k, a] of (dlg._alts || []).entries()) {
            const t = document.createElement("button");
            t.type = "button";
            t.className = "sx-am-tile" + (dlg.values.style === a.value ? " sel" : "") + (a.ok ? "" : " bad") + (stale ? " stale" : "");
            t.dataset.option = a.value;
            t.disabled = !a.ok || stale;
            t.title = stale ? "The alternative is out of date because your inputs have changed. Click Regenerate Shapes to update the alternatives." : a.ok ? "The alternative is ready. Select it and click OK to add this shape to your design." : a.error;
            t.innerHTML = `<b>Alternative ${k + 1}</b><span>${a.label}</span><i>${a.ok ? (stale ? "Out of Date" : "Ready") : "Failed"}</i>`;
            t.addEventListener("click", () => { if (!t.disabled) { dlg.set("style", a.value, { user: true }); dlg.refresh(); } });
            tiles.appendChild(t);
          }
        },
      },
      { id: "volume", type: "value", label: "Volume", kind: "none", default: "1.00", min: 0.25, max: 3, step: 0.25, tooltip: "Controls volume of the alternative." },
      { id: "operation", type: "dropdown", label: "Operation", options: OPS, default: "join", sep: true },
      { id: "style", type: "dropdown", label: "Alternative", options: STYLES, default: "", visible: () => false },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, {
        faces: (f0.faces || []).map((x) => U.faceRef(dlg.baseState, x.body, x.p, x.n)).filter(Boolean),
        avoid: (f0.avoid || []).map((id) => ({ kind: "body", body: id })),
        volume: f0.volume || "1.00", operation: f0.operation || "join", style: f0.style,
      });
      dlg._alts = STYLES.map((s) => ({ ...s, ok: true }));
      dlg._generatedFor = inputsKey(dlg.values);
    },
    build(v, dlg) {
      if (!v.style || !dlg._alts || dlg._generatedFor !== inputsKey(v)) return null;
      const faces = (v.faces || []).map((r) => ({ body: r.body, p: r.p, n: r.n }));
      if (faces.length < 2) return null;
      return { type: "automodel", faces, avoid: (v.avoid || []).map((r) => r.body), style: v.style, volume: v.volume, operation: v.operation, bodies: [...new Set(faces.map((x) => x.body))] };
    },
    validate(dlg) { return dlg._alts && dlg.values.style ? null : "Generate the shapes and select an alternative"; },
  });
}

export function registerAutomatedModeling(app) {
  try { M.registerFeature("automodel", { ...AUTO_MODEL, editor: (a, id) => { beginModelCommand(a); return openAutomatedModeling(a, { editId: id }); } }); } catch (e) { console.error("[solidx]", e); }
  app.commands.register({
    id: "AutomatedModelingCommand", label: "Automated Modeling", tooltip: "Generates alternative shapes that connect the faces and bodies you pick.", kind: "feature",
    run: (a, ctx = {}) => { const pre = beginModelCommand(a); return openAutomatedModeling(a, { preselect: ctx.preselect || pre }); },
  });
}
