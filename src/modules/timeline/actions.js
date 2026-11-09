// Document actions shared by the timeline and the browser (each is one undoable step).
import { esc, confirmBox } from "../browser/ui.js";
import { dependentsOf } from "./deps.js";

/**
 * confirmBox, but application-modal like Fusion's message boxes: while it is up no shortcut
 * (Ctrl+Z / Ctrl+Y, E, Delete, F2 ...) reaches the app and the canvas takes no input, so the
 * document cannot change under the question. Esc / Enter still answer it (confirmBox's own
 * capture listener runs first); Tab / Space keep their default focus/press behaviour.
 */
export function modalConfirm(app, opts) {
  const onKey = (ev) => {
    if (ev.key === "Escape" || ev.key === "Enter") return;
    ev.stopPropagation();
    if (ev.key !== "Tab" && ev.key !== " ") ev.preventDefault();
  };
  window.addEventListener("keydown", onKey, true);
  const swallow = () => true;
  let pop = null;
  try {
    pop = app.input && app.input.push ? app.input.push({
      name: "timeline-confirm", modal: true,
      onKeyDown: swallow, onCancel: swallow, onPointerDown: swallow, onPointerMove: swallow,
      onPointerUp: swallow, onDoubleClick: swallow, onContextMenu: swallow,
    }) : null;
  } catch (e) { console.error(e); }
  const done = () => {
    window.removeEventListener("keydown", onKey, true);
    if (typeof pop === "function") pop();
  };
  return confirmBox(app, opts).then((v) => { done(); return v; }, (e) => { done(); throw e; });
}

/**
 * Changing only a feature's display fields (visible, name) must not force the evaluator to
 * recompute everything after it. Its cache signature starts with JSON.stringify(feature), so
 * we re-key those entries to the edited JSON; if the format ever differs we simply fall back
 * to a normal recompute.
 */
function patchCacheSigs(app, beforeJson) {
  const cache = app.evaluator && app.evaluator.cache;
  if (!Array.isArray(cache)) return;
  app.doc.features.forEach((f, i) => {
    const old = beforeJson.get(f.id);
    const c = cache[i];
    if (!old || !c || c.id !== f.id || typeof c.sig !== "string") return;
    if (!c.sig.startsWith(old + "|")) return;
    c.sig = JSON.stringify(f) + c.sig.slice(old.length);
  });
}

/** Patch display-only fields of features (visible / name) as one undoable step. */
export function setFeatureFields(app, ids, patch, label) {
  ids = ids.filter((id) => app.feature(id));
  if (!ids.length) return;
  const before = new Map(ids.map((id) => [id, JSON.stringify(app.feature(id))]));
  const previewing = app.previewing;
  app.mutate(label, (doc) => {
    for (const id of ids) {
      const f = doc.features.find((x) => x.id === id);
      if (f) Object.assign(f, patch);
    }
  }, { recompute: false });
  patchCacheSigs(app, before);
  if (previewing) app.emit("model", { result: app.result, preview: true });
  else app.recompute();
}

export function setFeatureVisible(app, ids, visible) {
  setFeatureFields(app, ids, { visible: !!visible }, visible ? "Show" : "Hide");
}

export function renameFeature(app, id, name) {
  name = String(name || "").trim();
  const f = app.feature(id);
  if (!f || !name || name === f.name) return;
  setFeatureFields(app, [id], { name }, "Rename");
}

// bodies of a pasted occurrence ("b1@o2") share their component's body data (app.bodyMeta): act on the base body
const bodyKey = (app, id) => (app.M && app.M.instanceBase ? app.M.instanceBase(id) : id);

export function setBodiesVisible(app, ids, visible) {
  ids = [...new Set(ids.map((id) => bodyKey(app, id)))].filter((id) => app.doc.bodies[id]);
  if (!ids.length) return;
  app.mutate(visible ? "Show" : "Hide", (doc) => {
    for (const id of ids) if (doc.bodies[id]) doc.bodies[id].visible = !!visible;
  });
}

/** Show/hide bodies and display features (sketches, planes) together as one undoable step. */
export function setVisibility(app, { bodies = [], features = [] }, visible) {
  bodies = [...new Set(bodies.map((id) => bodyKey(app, id)))].filter((id) => app.doc.bodies[id]);
  features = features.filter((id) => app.feature(id));
  if (!bodies.length && !features.length) return;
  const before = new Map(features.map((id) => [id, JSON.stringify(app.feature(id))]));
  app.mutate(visible ? "Show" : "Hide", (doc) => {
    for (const id of bodies) if (doc.bodies[id]) doc.bodies[id].visible = !!visible;
    for (const id of features) { const f = doc.features.find((x) => x.id === id); if (f) f.visible = !!visible; }
  }, { recompute: false });
  patchCacheSigs(app, before);
  if (app.previewing) app.emit("model", { result: app.result, preview: true });
  else app.recompute();
}

/**
 * Folder visibility (Bodies, Sketches, Construction, the root component). Like Fusion, a folder
 * has its own visibility: hiding it hides its contents and remembers each child's state; showing
 * it restores exactly those states (a child that was hidden stays hidden). Stored in
 * doc.folders[key] = {hidden, saved}. One undoable step.
 */
export function setFolderVisibility(app, key, visible, { bodies = [], features = [] } = {}) {
  bodies = bodies.filter((id) => app.doc.bodies[id]);
  features = features.filter((id) => app.feature(id));
  const before = new Map(features.map((id) => [id, JSON.stringify(app.feature(id))]));
  app.mutate(visible ? "Show" : "Hide", (doc) => {
    doc.folders = { ...(doc.folders || {}) };
    if (!visible) {
      const saved = {};
      for (const id of bodies) if (doc.bodies[id]) { saved[`b:${id}`] = doc.bodies[id].visible !== false; doc.bodies[id].visible = false; }
      for (const id of features) {
        const f = doc.features.find((x) => x.id === id);
        if (f) { saved[`f:${id}`] = f.visible !== false; f.visible = false; }
      }
      doc.folders[key] = { hidden: true, saved };
    } else {
      const st = doc.folders[key];
      const saved = (st && st.hidden && st.saved) || {};
      const want = (k) => (k in saved ? !!saved[k] : true);
      for (const id of bodies) if (doc.bodies[id]) doc.bodies[id].visible = want(`b:${id}`);
      for (const id of features) {
        const f = doc.features.find((x) => x.id === id);
        if (f) f.visible = want(`f:${id}`);
      }
      delete doc.folders[key];
    }
    if (!Object.keys(doc.folders).length) delete doc.folders;
  }, { recompute: false });
  patchCacheSigs(app, before);
  if (app.previewing) app.emit("model", { result: app.result, preview: true });
  else app.recompute();
}

export function renameBody(app, id, name) {
  name = String(name || "").trim();
  id = bodyKey(app, id);
  const meta = app.doc.bodies[id];
  if (!meta || !name || name === meta.name) return;
  app.mutate("Rename", (doc) => { if (doc.bodies[id]) doc.bodies[id].name = name; });
}

export function setSuppressed(app, ids, suppressed) {
  ids = ids.filter((id) => { const f = app.feature(id); return f && !!f.suppressed !== !!suppressed; });
  if (!ids.length) return;
  app.mutate(suppressed ? "Suppress Features" : "Unsuppress Features", (doc) => {
    for (const id of ids) {
      const f = doc.features.find((x) => x.id === id);
      if (!f) continue;
      if (suppressed) f.suppressed = true;
      else delete f.suppressed;
    }
  });
}

/** Roll the history marker so that `n` features are active. */
export function rollTo(app, n) {
  n = Math.max(0, Math.min(app.doc.features.length, n));
  if (n === app.doc.marker) return;
  app.setMarker(n);
}

/** Delete features; when others depend on them, confirm and delete those too (as Fusion does). */
export async function deleteFeatures(app, ids, opts = {}) {
  ids = ids.filter((id) => app.feature(id));
  if (!ids.length) return false;
  let extra = [];
  try { extra = dependentsOf(app, ids); } catch (e) { console.error(e); extra = []; }
  if (extra.length && opts.confirm !== false) {
    const referenced = ids.map((id) => app.feature(id)).filter(Boolean);
    const html = `The following features are referenced by downstream dependent features in the timeline:<ul>${referenced.map((f) => `<li><b>${esc(f.name)}</b></li>`).join("")}</ul>`
      + `Dependent features: ${extra.map((f) => `<b>${esc(f.name)}</b>`).join(", ")}<br><br>Permanently <b>Delete</b> these features and all features that reference them?`;
    const ok = await modalConfirm(app, { title: "Delete", html, ok: "Delete", cancel: "Cancel", danger: true });
    if (!ok) return false;
  }
  const all = new Set([...ids, ...extra.map((f) => f.id)]);
  const names = [...all].map((id) => app.feature(id)?.name).filter(Boolean);
  app.mutate(names.length === 1 ? `Delete ${names[0]}` : "Delete", (doc) => {
    for (let i = doc.features.length - 1; i >= 0; i--) {
      if (!all.has(doc.features[i].id)) continue;
      doc.features.splice(i, 1);
      if (doc.marker > i) doc.marker -= 1;
    }
  });
  app.selection.set(app.selection.items.filter((r) => !(r.kind === "feature" && all.has(r.id)) && !(r.kind === "cplane" && all.has(r.id))));
  return true;
}

/** Delete every feature after the history marker (Fusion: "Delete all features after History Marker"). */
export async function deleteAfterMarker(app) {
  const doc = app.doc;
  const after = doc.features.slice(doc.marker);
  if (!after.length) return false;
  const ok = await modalConfirm(app, {
    title: "Delete",
    html: `Permanently <b>Delete</b> all ${after.length} feature${after.length > 1 ? "s" : ""} after the History Marker?`,
    ok: "Delete", cancel: "Cancel", danger: true,
  });
  if (!ok) return false;
  app.mutate("Delete all features after History Marker", (d) => { d.features.splice(d.marker); });
  return true;
}
