// MODIFY > Edit Face (EditFaceCommand): a four-sided face becomes a grid of control points (Length / Width
// Factor faces along each direction) that are dragged on the canvas; the face is rebuilt as a smooth
// B-spline patch (boundary kept, so the body stays closed) and sewn back into its solid or surface body.
//
// editface {face:{body,p,n}, uCount, vCount, moves: {"a,b": [dx,dy,dz]}}   (a = 1..uCount-1, b = 1..vCount-1)
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import * as U from "../dialogs/util.js";
import { beginModelCommand } from "../dialogs/common.js";
import * as X from "./occ.js";

const V = K.V;
const clampN = (n) => Math.max(2, Math.min(8, Math.round(Number(n) || 2)));

export const EDIT_FACE = {
  label: "Edit Face", stem: "Edit Face", fields: { uCount: "none", vCount: "none" }, icon: "EditFaceCommand",
  apply(st, f, P) {
    const b = st.bodies.get(f.face && f.face.body);
    if (!b) throw new Error("The referenced body is missing");
    const i = M.locateFace(b.shape, f.face);
    if (i < 0) throw new Error("The referenced face could not be found");
    const nu = clampN(M.fval(P, f, "uCount")), nv = clampN(M.fval(P, f, "vCount"));
    const shape = X.editFaceShape(b.shape, i, nu, nv, f.moves || {});
    st.bodies.set(b.id, { ...b, shape, from: f.id });
    return { affected: [b.id] };
  },
  touches: (f) => (f.face ? [f.face.body] : []),
};

const fourSided = (state, r) => {
  const b = state.bodies.get(r.body);
  if (!b) return false;
  const es = K.topoOf(b.shape).edges.filter((e) => (e.faces || []).includes(r.index));
  return es.length === 4 && es.every((e) => (e.faces || []).length === 2 && e.faces[0] !== e.faces[1]);
};

export function openEditFace(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  let gridKey = "", grid = null;
  const gridOf = (dlg) => {
    const r = (dlg.values.face || [])[0];
    const nu = clampN(dlg.num("uCount")), nv = clampN(dlg.num("vCount"));
    if (!r) return null;
    const key = `${r.body}|${r.index}|${nu}|${nv}`;
    if (key !== gridKey) {
      gridKey = key; grid = null;
      const b = dlg.baseState.bodies.get(r.body);
      try { if (b) grid = X.faceGrid(b.shape, r.index, nu, nv); } catch { grid = null; }
    }
    return grid;
  };
  return app.ui.dialog.open({
    id: "EditFaceCommand", title: "Edit Face", icon: "EditFaceCommand", editId, featureLabel: "Edit Face",
    help: "Converts the selected face to T-Spline faces, edges, and vertices for modification. Select the face to modify. Increase the length and width factors to add faces to give more control.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "face").slice(0, 1),
    rows: [
      { id: "face", type: "selection", label: "Face", kinds: ["face"], max: 1, toggle: false, prompt: "Select a face to edit", filter: (r, dlg) => fourSided(dlg.baseState, r) },
      { id: "uCount", type: "value", label: "Length Factor", kind: "none", default: "3", integer: true, min: 2, max: 8 },
      { id: "vCount", type: "value", label: "Width Factor", kind: "none", default: "3", integer: true, min: 2, max: 8 },
      { id: "hint", type: "text", text: () => "Drag the control points to push or pull the face." },
    ],
    init(dlg) {
      dlg.values.moves = {};
      if (f0) Object.assign(dlg.values, { face: [U.faceRef(dlg.baseState, f0.face.body, f0.face.p, f0.face.n)].filter(Boolean), uCount: f0.uCount || "3", vCount: f0.vCount || "3", moves: { ...(f0.moves || {}) } });
    },
    onChange(id, dlg) { if (id === "face" || id === "uCount" || id === "vCount") dlg.values.moves = {}; },
    build(v) {
      const r = (v.face || [])[0];
      if (!r) return null;
      const moves = {};
      for (const [k, d] of Object.entries(v.moves || {})) if (d && V.len(d) > 1e-9) moves[k] = d.map((x) => Math.round(x * 1e6) / 1e6);
      return { type: "editface", face: { body: r.body, p: r.p, n: r.n }, uCount: v.uCount, vCount: v.vCount, moves };
    },
    manipulators(dlg) {
      const g = gridOf(dlg);
      if (!g) return [];
      const vp = app.viewport;
      let view = [0, 0, -1];
      try { const c = vp.canvas; const ry = vp.ray(c.clientWidth / 2, c.clientHeight / 2); view = ry.d; } catch { /* default */ }
      const out = [];
      for (let a = 1; a < g.nu; a++) for (let b = 1; b < g.nv; b++) {
        const key = `${a},${b}`;
        const base = g.pts[a][b], n = g.nrm[a][b];
        const d = (dlg.values.moves || {})[key] || [0, 0, 0];
        // drag plane: contains the face normal and faces the camera as much as possible
        let pn = V.sub(view, V.mul(n, V.dot(view, n)));
        if (V.len(pn) < 1e-6) pn = V.cross(n, Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
        out.push({
          id: `cp${key}`, type: "point", value: 0, point: V.add(base, d), normal: V.norm(pn), box: false,
          onMove(p, final) {
            dlg.values.moves = { ...(dlg.values.moves || {}), [key]: V.sub(p, base) };
            dlg.touched.add("moves");
            if (final) dlg.previewNow(); else dlg.schedulePreview(120);
          },
        });
      }
      return out;
    },
  });
}

export function registerEditFace(app) {
  try { M.registerFeature("editface", { ...EDIT_FACE, editor: (a, id) => { beginModelCommand(a); return openEditFace(a, { editId: id }); } }); } catch (e) { console.error("[solidx]", e); }
  app.commands.register({
    id: "EditFaceCommand", label: "Edit Face", tooltip: "Turns a face into T-Spline geometry so you can push and pull it.", kind: "feature",
    run: (a, ctx = {}) => { const pre = beginModelCommand(a); return openEditFace(a, { preselect: ctx.preselect || pre }); },
  });
}
