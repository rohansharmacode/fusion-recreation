// CREATE > Create Base Feature (BaseFeatureCreationCommand): the BASE FEATURE contextual environment.
//
// basefeature {breps: {bodyId: brep}, removed: [bodyId]}   (brep = OCCT BRep text, replicad serialize())
// Create Base Feature adds the (empty) feature at the marker and enters the environment (BasefeatureSolidTab /
// BasefeatureSurfaceTab, FINISH BASE FEATURE). Everything modelled inside is ordinary features while you
// work; Finish Base Feature bakes the bodies those features made or changed into the base feature and drops
// the features (history-free, like Fusion), keeping the ones that did not touch bodies (sketches, planes,
// axes, points). Edit (Edit Feature) rolls the timeline to the base feature and enters the environment again.
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import { beginModelCommand } from "../dialogs/common.js";

const ENV = "basefeature";
const SHAPES = new Map(); // brep text -> shape (stable objects keep downstream evaluation caches valid)

function shapeOf(brep) {
  let s = SHAPES.get(brep);
  if (!s) {
    s = K.singleSolid(K.R.deserializeShape(brep));
    if (SHAPES.size > 64) SHAPES.delete(SHAPES.keys().next().value);
    SHAPES.set(brep, s);
  }
  return s;
}

export const BASE_FEATURE = {
  label: "Base Feature", stem: "Base Feature", fields: {}, icon: "BaseFeatureCreationCommand",
  apply(st, f) {
    for (const id of f.removed || []) { st.bodies.delete(id); if (st.meshBodies) st.meshBodies.delete(id); }
    const ids = [];
    for (const [id, brep] of Object.entries(f.breps || {})) {
      if (typeof brep !== "string" || !brep) continue;
      st.bodies.set(id, { id, shape: shapeOf(brep), from: f.id });
      ids.push(id);
    }
    return { affected: ids };
  },
  touches: (f) => [...Object.keys(f.breps || {}), ...(f.removed || [])],
};

const sameBodies = (a, b) => {
  if (!a || !b || a.size !== b.size) return false;
  for (const [id, x] of a) { const y = b.get(id); if (!y || y.shape !== x.shape) return false; }
  return true;
};

function bake(app, env) {
  const bfId = env.feature;
  const doc = app.doc;
  const i = doc.features.findIndex((f) => f.id === bfId);
  if (i < 0) return;
  try { if (app.previewing) app.endPreview(); } catch { /* ignore */ }
  const end = Math.min(doc.marker, doc.features.length);
  const inside = doc.features.slice(i + 1, end);
  const restoreEnd = env.restoreEnd;
  if (!inside.length) {
    if (restoreEnd && doc.marker < doc.features.length) app.setMarker(doc.features.length);
    return;
  }
  // per-feature states of the committed evaluation
  app.recompute();
  const cache = (app.evaluator && app.evaluator.cache) || [];
  const S0 = cache[i] && cache[i].state;
  const S1 = app.result && app.result.state;
  if (!S0 || !S1) { app.toast("The base feature could not be finished", "error"); return; }
  const bf = doc.features[i];
  const bodies = { ...(bf.breps || {}) };
  const removed = new Set(bf.removed || []);
  let skippedMesh = 0;
  for (const [id, b] of S1.bodies) {
    const old = S0.bodies.get(id);
    if (old && old.shape === b.shape) continue;
    try { bodies[id] = b.shape.serialize(); removed.delete(id); } catch (e) { console.error("[solidx] base feature body", e); }
  }
  for (const id of S0.bodies.keys()) if (!S1.bodies.has(id)) { delete bodies[id]; if (!(bf.breps || {})[id]) removed.add(id); }
  if (S1.meshBodies) for (const id of S1.meshBodies.keys()) if (!S0.meshBodies || !S0.meshBodies.has(id)) skippedMesh++;
  // features that changed bodies are baked; the others (sketches, construction geometry) stay
  const drop = new Set();
  for (let k = i + 1; k < end; k++) {
    const prev = cache[k - 1] && cache[k - 1].state, cur = cache[k] && cache[k].state;
    const f = doc.features[k];
    const meshMaker = cur && prev && cur.meshBodies && prev.meshBodies && cur.meshBodies.size !== prev.meshBodies.size;
    if (!prev || !cur || (!sameBodies(prev.bodies, cur.bodies) && !meshMaker) || (f.suppressed && f.type !== "sketch")) drop.add(f.id);
  }
  app.mutate("Finish Base Feature", (d) => {
    const nbf = d.features.find((f) => f.id === bfId);
    if (!nbf) return;
    nbf.breps = bodies;
    nbf.removed = [...removed];
    const keptInside = d.features.slice(i + 1, end).filter((f) => !drop.has(f.id)).length;
    d.features = d.features.filter((f) => !drop.has(f.id));
    d.marker = restoreEnd ? d.features.length : Math.min(d.features.length, d.features.indexOf(nbf) + 1 + keptInside);
  });
  if (skippedMesh) app.toast("Mesh bodies made inside the base feature stay as their own features", "warning");
}

function enter(app, bfId, restoreEnd) {
  return app.enterEnvironment({
    id: ENV, mode: ENV, label: "BASE FEATURE",
    tab: ["BasefeatureSolidTab", "BasefeatureSurfaceTab"],
    finishCommand: "BaseFeatureStop",
    feature: bfId,
    restoreEnd,
    onExit(reason, env) {
      if (reason === "document" || reason === "replaced") return;
      try { bake(app, env || this); } catch (e) { console.error("[solidx] Finish Base Feature", e); app.toast(`Finish Base Feature failed: ${e.message || e}`, "error"); }
    },
  });
}

export function createBaseFeature(app) {
  beginModelCommand(app);
  if (app.inMode(ENV)) { app.toast("A base feature is already being edited", "warning"); return null; }
  const restoreEnd = app.doc.marker >= app.doc.features.length;
  const f = app.addFeature({ type: "basefeature", breps: {}, removed: [] }, "Create Base Feature");
  if (!f) return null;
  return enter(app, f.id, restoreEnd);
}

export function editBaseFeature(app, id) {
  beginModelCommand(app);
  if (app.inMode(ENV)) app.exitEnvironment(ENV, { reason: "finish" });
  const i = app.doc.features.findIndex((f) => f.id === id);
  if (i < 0) return null;
  const restoreEnd = app.doc.marker >= app.doc.features.length;
  if (app.doc.marker !== i + 1) app.setMarker(i + 1);
  return enter(app, id, restoreEnd);
}

export function finishBaseFeature(app) {
  if (app.activeCommand) { try { app.activeCommand.ok(); } catch { /* keep going */ } }
  if (app.mode === "sketch") { const s = app.commands.get("SketchStop"); try { if (s && !s.stub) s.run(app, { fromCommand: true }); } catch { /* ignore */ } }
  app.exitEnvironment(ENV, { reason: "finish" });
}

export function registerBaseFeature(app) {
  try { M.registerFeature("basefeature", { ...BASE_FEATURE, editor: (a, id) => editBaseFeature(a, id) }); } catch (e) { console.error("[solidx]", e); }
  app.commands.register({ id: "BaseFeatureCreationCommand", label: "Create Base Feature", tooltip: "Starts a history-free base feature; edits inside it are not recorded in the timeline.", kind: "feature", run: (a) => createBaseFeature(a) });
  app.commands.register({ id: "BaseFeatureStop", label: "Finish Base Feature", tooltip: "Finishes the base feature and returns to parametric modelling.", kind: "tool", when: ENV, run: (a) => finishBaseFeature(a) });
}
