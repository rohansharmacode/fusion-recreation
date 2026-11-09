// PMI service (app.ui.pmi): after every evaluation each PMI feature is re-resolved on the model
// state at its timeline position (so it follows upstream edits; lost geometry -> orphaned: orange
// graphics + a warning on its timeline / browser item), laid out and drawn. Also the live dialog
// preview, picking, the highlight of the annotated geometry while a PMI is selected and
// double-click to edit.
import { PmiRenderer } from "./render.js";
import { specFor, isPmi, PMI_TYPES } from "./annotations.js";
import * as F from "./format.js";
import { SelectionOverlay } from "../dialogs/highlight.js";

export function createService(app) {
  const renderer = new PmiRenderer(app);
  const specs = new Map(); // id -> spec of the committed annotations
  const warned = new Set(); // ids whose evaluation result carries our warning
  let overlay = null;
  let previewDlg = null;

  /** Model state at a feature's timeline position (the evaluator caches the state after each feature). */
  function stateFor(f) {
    const cache = app.evaluator && app.evaluator.cache;
    if (Array.isArray(cache)) {
      const i = app.doc.features.indexOf(f);
      const c = i >= 0 ? cache[i] : null;
      if (c && c.id === f.id && c.state) return c.state;
      const c2 = cache.find((e) => e && e.id === f.id);
      if (c2 && c2.state) return c2.state;
    }
    return app.result ? app.result.state : null;
  }
  const ctxFor = (state) => ({ app, state, settings: F.settingsOf(app.doc), P: app.result && app.result.params, mainOf: (id) => renderer.mainOf(id) });

  function refresh() {
    if (!app.result) return;
    const res = app.result.results || {};
    const list = [];
    specs.clear();
    for (const f of app.doc.features) {
      if (!isPmi(f)) continue;
      const r = res[f.id];
      const alive = r && !r.rolled && !r.suppressed && !f.suppressed;
      if (!alive) { if (r && warned.has(f.id)) { delete r.warning; warned.delete(f.id); } continue; }
      const st = stateFor(f);
      const spec = st ? specFor(f, ctxFor(st)) : null;
      if (spec) { spec.state = st; specs.set(f.id, spec); }
      if (api.injectWarnings) {
        const warn = spec ? spec.warning : "The annotation compute failed. Please update the geometry selections or annotation properties.";
        if (warn) { r.warning = warn; warned.add(f.id); } else if (warned.has(f.id)) { delete r.warning; warned.delete(f.id); }
      }
      if (spec && f.visible !== false) list.push(spec);
    }
    // annotations attached to other annotations (frames under a dimension) are laid out last
    list.sort((a, b) => (a.after ? 1 : 0) - (b.after ? 1 : 0));
    renderer.setItems(list);
    updateOverlay();
    if (previewDlg && !previewDlg.closed) preview(previewDlg);
  }

  // ---------------------------------------------------------------- dialog preview
  /** Show the feature a PMI dialog is building (dlg.spec.build) on the dialog's base state. */
  function preview(dlg) {
    if (!dlg || dlg.closed) return;
    previewDlg = dlg;
    let f = null;
    try { f = dlg.spec.build ? dlg.spec.build(dlg.values, dlg) : null; } catch (e) { f = null; }
    renderer.setHidden(dlg.editId || null);
    if (!f) { renderer.setPreview(null); return; }
    const spec = specFor({ ...f, id: "__preview__" }, ctxFor(dlg.baseState));
    renderer.setPreview(spec && (spec.general || spec.build) ? spec : null);
  }
  function clearPreview() {
    previewDlg = null;
    renderer.setPreview(null);
    renderer.setHidden(null);
  }
  /** Spec of the dialog preview (tests / dialogs). */
  const previewPrims = () => renderer.primsOf("__preview__");

  // ---------------------------------------------------------------- selection highlight
  function updateOverlay() {
    const sel = app.activeCommand ? [] : app.selection.items.filter((r) => r.kind === "feature" && specs.has(r.id));
    const refs = [];
    let st = null;
    for (const r of sel) { const s = specs.get(r.id); if (!s || !s.selRefs) continue; st = st || s.state; refs.push(...s.selRefs.filter((x) => x && (x.kind === "face" || x.kind === "edge") && x.index >= 0)); }
    if (!refs.length) { if (overlay) { overlay.dispose(); overlay = null; } return; }
    if (!overlay) overlay = new SelectionOverlay(app);
    overlay.set(refs, st);
  }

  // ---------------------------------------------------------------- wiring
  const vp = app.viewport;
  if (vp && typeof vp.addPickProvider === "function") vp.addPickProvider((x, y) => renderer.pick(x, y));
  app.on("model", () => { try { refresh(); } catch (e) { console.error("[annotate] refresh", e); } });
  app.on("camera", () => { try { renderer.onCamera(); } catch (e) { console.error(e); } });
  app.on("selection", () => { renderer.refreshColors(); updateOverlay(); });
  app.on("hover", () => renderer.refreshColors());
  app.on("dialog", () => updateOverlay());
  // double-click an annotation on the canvas: Edit (Fusion's Edit PMI)
  if (app.input) app.input.push({
    name: "pmi-dblclick",
    onDoubleClick(ev, ctx) {
      if (app.activeCommand || app.mode !== "model") return false;
      const h = ctx && ctx.hit;
      if (h && h.ref && h.ref.kind === "feature" && isPmi(app.feature(h.ref.id))) { app.editFeature(h.ref.id); return true; }
      return false;
    },
  });

  const api = {
    injectWarnings: false,
    app, renderer, refresh, preview, clearPreview, previewPrims, stateFor,
    spec: (id) => specs.get(id) || null,
    specs: () => [...specs.values()],
    types: PMI_TYPES,
    /** PMI features of the document in timeline order. */
    features: () => app.doc.features.filter(isPmi),
    settings: () => F.settingsOf(app.doc),
    ctxFor,
  };
  return api;
}
