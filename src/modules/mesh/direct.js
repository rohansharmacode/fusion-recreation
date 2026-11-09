// DIRECT MESH EDITING: Direct Edit (ParaMeshBaseFeatureCreateCommand), Create Base Mesh Feature
// (ParaMeshEmptyBaseFeatureCommand) and Finish Direct Edit (ParaMeshBaseFeatureStopCommand).
// A Base Mesh Feature ('meshBase') holds snapshots of mesh bodies in doc.meshData ({items: {bodyId: dataId},
// removed: [bodyIds]}); while the DIRECT MESH EDITING environment is open the timeline is rolled to just after it
// and the MESH commands write their result into it (no timeline entries), like Fusion's base features.
import { prepareFeature } from "../../app/core.js";
import * as M from "../../model.js";

const CUR = { fid: null, restoreEnd: false };
export const directActive = (app) => !!(CUR.fid && app.inMode("meshedit") && app.feature(CUR.fid));
export const directFeature = () => CUR.fid;

function setMarkerQuiet(app, n) {
  n = Math.max(0, Math.min(app.doc.features.length, n));
  if (app.doc.marker === n) return;
  app.doc.marker = n;
  app.recompute();
  app.emit("doc", { label: "Move Timeline Marker" });
}
/** Open the DIRECT MESH EDITING environment on base feature fid. */
export function enterDirect(app, fid) {
  const i = app.featureIndex(fid);
  if (i < 0) return false;
  if (app.activeCommand) { try { app.activeCommand.cancel(); } catch { /* ignore */ } }
  CUR.fid = fid;
  CUR.restoreEnd = app.doc.marker >= app.doc.features.length || app.doc.marker === i + 1 && i + 1 === app.doc.features.length;
  setMarkerQuiet(app, i + 1);
  app.enterEnvironment({
    id: "meshedit", mode: "meshedit", label: "DIRECT MESH EDITING", tab: "ParaMeshBaseFeatureTab",
    finishCommand: "ParaMeshBaseFeatureStopCommand", baseTabs: [], markingMenu: "ParaMeshEnvironment", feature: fid,
    onExit() {
      const restore = CUR.restoreEnd;
      CUR.fid = null;
      if (restore) setMarkerQuiet(app, app.doc.features.length);
    },
  });
  app.toast("You have entered into Mesh Direct Edit.", "info", 2500);
  return true;
}
function dropData(doc, id) {
  if (!id || !doc.meshData || !doc.meshData[id]) return;
  const used = doc.features.some((f) => f.data === id || (f.items && Object.values(f.items).includes(id)));
  if (!used) delete doc.meshData[id];
}
/** Create a base feature (empty, or holding the current mesh of body) at the marker and enter the environment. */
export function createBase(app, body = null) {
  if (directActive(app)) { app.toast("Finish the current direct edit first", "info"); return null; }
  const st = app.result && app.result.state;
  const e = body && st && st.meshBodies.get(body);
  if (body && !(e && e.mesh)) throw new Error("Select a mesh body to edit directly");
  const nf = app.mutate(body ? "Direct Edit" : "Create Base Mesh Feature", (doc) => {
    const f = { type: "meshBase", items: {}, removed: [] };
    if (e) f.items[body] = M.storeMeshData(doc, { positions: e.mesh.positions, indices: e.mesh.indices, groups: e.mesh.groups });
    prepareFeature(doc, f);
    doc.features.splice(doc.marker, 0, f);
    doc.marker += 1;
    return f;
  });
  enterDirect(app, nf.id);
  return nf;
}
/**
 * Commit a MESH command inside the environment: evaluate it once more right after the base feature and copy every
 * mesh body it changed / made / removed into the base feature (one undo step, no timeline entry).
 */
export function directCommit(app, dlg, f, cfg) {
  const fid = CUR.fid;
  const base = dlg.baseState;
  const r = app.preview(f);
  const res = r.result.results[r.feature.id];
  const st = r.result.state;
  const meta = { ...(app._previewMeta || {}) };
  app.endPreview();
  if (!res || res.ok === false) throw new Error((res && res.error) || `${cfg.title} failed`);
  const changed = [];
  const removed = [];
  for (const [id, e] of st.meshBodies) if (base.meshBodies.get(id) !== e && e.mesh) changed.push([id, e.mesh]);
  for (const id of base.meshBodies.keys()) if (!st.meshBodies.has(id)) removed.push(id);
  if (!changed.length && !removed.length) throw new Error("The command did not change the mesh");
  return app.mutate(cfg.title, (doc) => {
    const bf = doc.features.find((x) => x.id === fid);
    if (!bf) throw new Error("The base feature no longer exists");
    bf.items = bf.items || {};
    bf.removed = bf.removed || [];
    for (const [id, mesh] of changed) {
      let nid = id;
      if (!doc.bodies[id]) {
        let n = 0;
        for (const b of Object.values(doc.bodies)) { const m = /^MeshBody(\d+)$/.exec((b && b.name) || ""); if (m) n = Math.max(n, Number(m[1])); }
        nid = M.nextBody(doc, { name: (meta[id] && /^MeshBody/.test(meta[id].name) && meta[id].name) || `MeshBody${n + 1}`, kind: "mesh" });
      }
      const old = bf.items[nid];
      bf.items[nid] = M.storeMeshData(doc, { positions: mesh.positions, indices: mesh.indices, groups: mesh.groups });
      bf.removed = bf.removed.filter((x) => x !== nid);
      dropData(doc, old);
    }
    for (const id of removed) {
      if (bf.items[id]) { const old = bf.items[id]; delete bf.items[id]; dropData(doc, old); }
      if (!bf.removed.includes(id)) bf.removed.push(id);
    }
    return bf;
  });
}
export function initDirect(app) {
  // an undo / open that removes the base feature leaves the environment
  app.on("doc", () => { if (CUR.fid && !app.feature(CUR.fid) && app.inMode("meshedit")) app.exitEnvironment("meshedit", { reason: "document" }); });
  app.commands.register({
    id: "ParaMeshBaseFeatureStopCommand", label: "Finish Direct Edit", tooltip: "Finish directly editing the mesh body and return to parametric modeling in the Design workspace.",
    kind: "tool", when: "meshedit",
    run: (a) => { if (a.activeCommand) { try { a.activeCommand.cancel(); } catch { /* ignore */ } } a.exitEnvironment("meshedit", { reason: "finish" }); },
  });
  app.commands.register({
    id: "ParaMeshEmptyBaseFeatureCommand", label: "Create Base Mesh Feature", tooltip: "Creates an empty Mesh Base Feature.", kind: "feature",
    run: (a) => { try { createBase(a, null); } catch (e) { a.toast(e.message || String(e), "error"); } },
  });
  app.commands.register({
    id: "ParaMeshBaseFeatureCreateCommand", label: "Direct Edit", kind: "feature",
    tooltip: "Creates a mesh base feature that you can edit directly.\n\nSelect the mesh body to edit. A mesh base feature displays on the timeline and you can make local modifications to the mesh body without capturing the changes in the parametric history of the design.",
    run: (a, ctx = {}) => openDirectEdit(a, ctx),
  });
}
function openDirectEdit(app, ctx) {
  if (directActive(app)) { app.toast("You are already editing a base mesh feature", "info"); return null; }
  if (app.mode === "sketch") { const stop = app.commands.get("SketchStop"); if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model"); }
  const isMesh = (dlg, id) => { const e = dlg.baseState.meshBodies && dlg.baseState.meshBodies.get(id); return !!(e && e.mesh && (!e.kind || e.kind === "mesh")); };
  return app.ui.dialog.open({
    id: "ParaMeshBaseFeatureCreateCommand", title: "Direct Edit", icon: "ParaMeshBaseFeatureCreateCommand",
    help: "Use the Direct Edit command to make local modifications to mesh bodies outside the parametric timeline of the design.",
    preview: false, noFeature: true,
    preselect: (ctx.preselect || app.selection.items || []).filter((r) => r.kind === "body"),
    rows: [{ id: "body", type: "selection", label: "Body", kinds: ["body"], meshBodies: true, max: 1, prompt: "Select a mesh body to edit directly", filter: (ref, d) => isMesh(d, ref.body) }],
    build: () => null,
    commit(f, d) {
      const body = ((d.values.body || [])[0] || {}).body;
      if (!body) throw new Error("Select a mesh body to edit directly");
      // the environment opens after the dialog has closed
      setTimeout(() => { try { createBase(app, body); } catch (e) { app.toast(e.message || String(e), "error"); } }, 0);
      return true;
    },
  });
}
