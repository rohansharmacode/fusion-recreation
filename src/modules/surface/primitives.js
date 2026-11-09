// surface: the SURFACE > CREATE primitives (SurfPrimitiveBox ... SurfPrimitivePipe). Same dialogs as the solid
// primitives (dialogs module), the result is a surface body: the closed outer shell of the solid primitive.
// Feature types surfBox, surfCylinder, surfSphere, surfTorus, surfCoil, surfPipe store the solid primitive's
// fields (plane, center, sizes / path) plus operation 'new' | 'newComponent'.
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import { explore, combine } from "./occ.js";
import { beginModelCommand } from "../dialogs/common.js";
import { openPrimitive } from "../dialogs/cmd-create.js";
import { openCoil, openPipe } from "../dialogs/cmd-coil-pipe.js";

/** Surface type -> {prim (solid feature type), cmd (Fusion id), label, tip, open(app, opts)}. */
export const SURF_PRIMS = {
  surfBox: { prim: "box", cmd: "SurfPrimitiveBox", label: "Box", tip: "Creates a box surface.", open: (a, o) => openPrimitive(a, "box", o) },
  surfCylinder: { prim: "cylinder", cmd: "SurfPrimitiveCylinder", label: "Cylinder", tip: "Creates a cylindrical surface.", open: (a, o) => openPrimitive(a, "cylinder", o) },
  surfSphere: { prim: "sphere", cmd: "SurfPrimitiveSphere", label: "Sphere", tip: "Creates a spherical surface.", open: (a, o) => openPrimitive(a, "sphere", o) },
  surfTorus: { prim: "torus", cmd: "SurfPrimitiveTorus", label: "Torus", tip: "Creates a torus surface.", open: (a, o) => openPrimitive(a, "torus", o) },
  surfCoil: { prim: "coil", cmd: "SurfPrimitiveCoil", label: "Coil", tip: "Creates a coil surface.", open: openCoil },
  surfPipe: { prim: "pipe", cmd: "SurfPrimitivePipe", label: "Pipe", tip: "Creates a pipe surface that follows a selected path.", open: openPipe },
};
const SURF_OPS = [
  { value: "new", label: "New Body", icon: "newBody" },
  { value: "newComponent", label: "New Component", icon: "newComponent" },
];
const TMP = "__surfprim";

/** Evaluator: the solid primitive on a scratch state, then its shell(s) as a surface body. */
function surfApply(st, f, P, doc) {
  const S = SURF_PRIMS[f.type];
  const def = S && M.featureDef(S.prim);
  if (!def || typeof def.apply !== "function") throw new Error(`${S ? S.label : f.type} primitives are not available in this build`);
  const scratch = M.cloneState(st);
  def.apply(scratch, { ...f, type: S.prim, operation: "new", newBody: TMP, bodies: [] }, P, doc);
  const made = scratch.bodies.get(TMP);
  if (!made || !made.shape) throw new Error(`The ${S.label.toLowerCase()} could not be created`);
  let shells;
  try { shells = explore(made.shape, "shell"); } finally { K.del(made.shape); }
  if (!shells.length) throw new Error(`The ${S.label.toLowerCase()} could not be created`);
  const shape = combine(shells);
  const op = f.operation === "newComponent" ? "newComponent" : "new";
  return { affected: M.applyOp(st, { ...f, operation: op }, shape, doc) };
}

/** Opens the solid primitive's dialog as the surface command: own id / icon, surface operations, surface feature. */
export function openSurfPrimitive(app, type, opts = {}) {
  const S = SURF_PRIMS[type];
  const D = app.ui && app.ui.dialog;
  if (!S || !D) return null;
  const orig = D.open;
  D.open = function surfOpen(spec) {
    D.open = orig;
    const s = { ...spec, id: S.cmd, icon: S.cmd, help: S.tip };
    s.rows = (spec.rows || []).map((r) => (r.id === "operation" ? { ...r, options: SURF_OPS, default: "new" } : r));
    const fixOp = (dlg) => { if (!SURF_OPS.some((o) => o.value === dlg.values.operation)) dlg.values.operation = "new"; };
    s.init = (dlg) => { if (spec.init) spec.init(dlg); dlg.touched.add("operation"); fixOp(dlg); };
    s.onOpen = (dlg) => { if (spec.onOpen) spec.onOpen(dlg); fixOp(dlg); };
    s.onChange = (id, dlg, o) => { if (spec.onChange) spec.onChange(id, dlg, o); fixOp(dlg); };
    s.build = (v, dlg) => {
      const f = spec.build ? spec.build(v, dlg) : null;
      if (!f) return null;
      return { ...f, type, operation: f.operation === "newComponent" ? "newComponent" : "new" };
    };
    return orig.call(D, s);
  };
  try { return S.open(app, opts); } finally { D.open = orig; }
}

let registered = false;
/** Registers the six feature types and the six SURFACE > CREATE commands. */
export function registerSurfacePrimitives(app) {
  if (!registered) {
    registered = true;
    for (const [type, S] of Object.entries(SURF_PRIMS)) {
      if (M.isFeatureType(type)) continue;
      const base = M.featureDef(S.prim) || {};
      M.registerFeature(type, {
        label: S.label, stem: S.label, icon: S.cmd,
        fields: { ...(base.fields || {}) },
        makesBodies: () => true,
        apply: surfApply,
        deps: (f) => ({
          sketches: f.path && f.path.sketch ? [f.path.sketch] : [],
          cplanes: f.plane && f.plane.kind === "cplane" ? [f.plane.id] : [],
          bodies: [...new Set([...(f.plane && f.plane.kind === "face" && f.plane.body ? [f.plane.body] : []), ...(f.edges || []).map((e) => e.body)])],
          features: [],
          geo: [...(f.plane && f.plane.kind === "face" && f.plane.body ? [{ kind: "face", body: f.plane.body, p: f.plane.p, n: f.plane.n }] : []), ...(f.edges || []).map((e) => ({ kind: "edge", body: e.body, p: e.p }))],
        }),
        editor: (a, id) => { beginModelCommand(a); return openSurfPrimitive(a, type, { editId: id }); },
      });
    }
  }
  for (const [type, S] of Object.entries(SURF_PRIMS)) {
    try {
      app.commands.register({
        id: S.cmd, label: S.label, tooltip: S.tip, kind: "feature",
        run: (a, ctx = {}) => { const pre = beginModelCommand(a); return openSurfPrimitive(a, type, { preselect: ctx.preselect || pre }); },
      });
    } catch (e) { console.warn(`[surface] ${S.cmd}`, e); }
  }
}
