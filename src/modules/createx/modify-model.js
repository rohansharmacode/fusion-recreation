// createx: Modify Model (VolFieldModifyModelCommand). Changes the settings of an existing volumetric model:
// select the model (a body of kind 'volumetric'), then the dialog of the feature that made it opens in Edit
// Feature mode (Volumetric Lattice or Volumetric Texture), so the change stays one timeline edit.
import { beginModelCommand } from "../dialogs/common.js";

const TYPES = new Set(["vlattice", "vtexture"]);
const TIP = "Changes the volumetric model settings. Select a volumetric model to edit its lattice or texture settings.";

/** The last vlattice / vtexture feature (before the marker) that made body `id`, or null. */
export function modelFeatureOf(app, id) {
  const doc = app.doc;
  const n = Math.min(doc.marker ?? doc.features.length, doc.features.length);
  for (let i = n - 1; i >= 0; i--) {
    const f = doc.features[i];
    if (TYPES.has(f.type) && f.body === id && !f.suppressed) return f;
  }
  return null;
}
const isModel = (app, r) => !!(r && r.body && app.bodyKind(r.body) === "volumetric" && modelFeatureOf(app, r.body));

export function openModifyModel(app, opts = {}) {
  const pre = (opts.preselect || []).filter((r) => isModel(app, r)).map((r) => ({ kind: "body", body: r.body }));
  // a selected model opens its settings straight away
  if (pre.length === 1) return app.editFeature(modelFeatureOf(app, pre[0].body).id);
  return app.ui.dialog.open({
    id: "VolFieldModifyModelCommand", title: "Modify Model", icon: "VolFieldModifyModelCommand", featureLabel: "Modify Model", help: TIP,
    preview: false, noFeature: true,
    preselect: pre,
    rows: [
      { id: "model", type: "selection", label: "Volumetric Model", kinds: ["body", "meshFace"], meshBodies: true, max: 1,
        mapRef: (r) => (r.body ? { kind: "body", body: r.body } : null), filter: (r) => isModel(app, r),
        prompt: "Select a volumetric model", tooltip: "Select a volumetric model." },
    ],
    validate: (dlg) => ((dlg.values.model || []).length ? null : "Select a volumetric model"),
    commit: (_f, dlg) => { const f = modelFeatureOf(app, dlg.values.model[0].body); return f ? f.id : null; },
    afterCommit: (fid) => { if (fid) setTimeout(() => app.editFeature(fid), 0); },
  });
}

export function registerModifyModel(app) {
  app.commands.register({
    id: "VolFieldModifyModelCommand", label: "Modify Model", tooltip: TIP, kind: "feature",
    run: (a, ctx = {}) => { const pre = beginModelCommand(a); return openModifyModel(a, { preselect: ctx.preselect || pre }); },
  });
}
