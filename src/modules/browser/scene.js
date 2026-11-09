// Canvas-side helpers shared by the browser and the timeline: which bodies a feature produced,
// Find in Window (frame an object), Isolate / Unisolate, Selectable / Unselectable, Opacity
// Control, the status text for browser/timeline selections, and highlighting the bodies of a
// selected timeline feature (Fusion shows them navy with light-blue edges).
//
// The viewport owns rendering; the hooks below only decorate its public objects when they are
// present and fall back to a toast otherwise.

/** Body ids a feature produced or modified (alive in the current result). */
export function featureBodies(app, f) {
  if (!f) return [];
  const r = (app.result && app.result.results && app.result.results[f.id]) || {};
  if (r.rolled || r.suppressed || f.suppressed) return [];
  if (f.type === "sketch" || f.type === "cplane") return [];
  const st = app.result && app.result.state;
  if (!st || !st.bodies) return [];
  const alive = { has: (id) => st.bodies.has(id) || !!(st.meshBodies && st.meshBodies.has(id)) };
  const cands = [...(r.affected || []), f.newBody, ...(f.newBodies || [])];
  if (!cands.some((id) => id && alive.has(id))) {
    cands.push(...(f.edges || []).map((e) => e && e.body), ...(f.faces || []).map((x) => x && x.body), ...(Array.isArray(f.bodies) ? f.bodies : []), f.target);
  }
  const out = [];
  for (const id of cands) if (id && typeof id === "string" && alive.has(id) && !out.includes(id)) out.push(id);
  return out;
}

const vpInternal = (app) => (app.viewport && app.viewport._vp) || null;

// Refs whose bodies are drawn with the selection look while a timeline context menu is open
// (Fusion highlights the right-clicked feature's body without changing the selection).
let ctxRefs = [];
export function setContextHighlight(app, refs) {
  ctxRefs = refs || [];
  const hl = vpInternal(app) && vpInternal(app).highlighter;
  if (hl && hl._brFeatures) hl.update();
}

// ---------------------------------------------------------------------------
// Highlight the bodies of selected timeline features (selection look).
// ---------------------------------------------------------------------------
export function installFeatureHighlight(app) {
  const hl = vpInternal(app) && vpInternal(app).highlighter;
  if (!hl || typeof hl.update !== "function" || typeof hl._add !== "function" || hl._brFeatures) return false;
  const orig = hl.update.bind(hl);
  hl._brFeatures = true;
  hl.update = function update(...args) {
    const ret = orig(...args);
    try {
      const sel = app.selection.items || [];
      const selBodies = new Set(sel.filter((r) => r.kind === "body").map((r) => r.body));
      const extra = new Set();
      const refs = hl.handlesFeatures ? ctxRefs : [...sel, ...ctxRefs]; // the viewport may draw feature selections itself
      for (const r of refs) {
        if (r.kind === "body" && !selBodies.has(r.body)) { extra.add(r.body); continue; }
        if (r.kind !== "feature") continue;
        // the viewport draws the faces of a feature itself when it can (right-click, Edit Feature)
        if (hl.handlesFeatures && typeof hl._feature === "function" && hl._feature(r.id, true)) { if (hl.vp && hl.vp.requestRender) hl.vp.requestRender(); continue; }
        for (const b of featureBodies(app, app.feature(r.id))) if (!selBodies.has(b)) extra.add(b);
      }
      if (extra.size) {
        for (const b of extra) hl._add({ kind: "body", body: b }, true);
        if (hl.vp && hl.vp.requestRender) hl.vp.requestRender();
      }
    } catch (e) { console.error(e); }
    return ret;
  };
  return true;
}

// ---------------------------------------------------------------------------
// Find in Window: frame the given refs (bodies, sketches, planes, features).
// ---------------------------------------------------------------------------
export function findInWindow(app, refs) {
  const vp = app.viewport;
  if (!vp || !vp.rig || !vp.THREE) { app.toast("Find in Window is not available", "info"); return false; }
  const K = app.K;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const addPt = (p) => { for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); } };
  const addBody = (id) => {
    const b = app.body(id);
    const bb = b ? K.bboxOf && K.bboxOf(b.shape) : app.result && app.M.bodyBBox ? app.M.bodyBBox(app.result.state, id) : null;
    if (bb) { addPt(bb.min); addPt(bb.max); }
  };
  const addPlane = (pl, size = 20) => {
    if (!pl || !pl.o) return;
    const x = pl.x || [1, 0, 0], n = pl.n || [0, 0, 1];
    const y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addPt([0, 1, 2].map((i) => pl.o[i] + (x[i] * a + y[i] * b) * size));
  };
  const addSketch = (id) => {
    const st = app.sketchState(id);
    if (!st || !st.plane) return;
    const pts = Object.values((st.sk && st.sk.points) || {});
    if (!pts.length) { addPlane(st.plane); return; }
    const pl = st.plane, x = pl.x, n = pl.n;
    const y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
    for (const p of pts) addPt([0, 1, 2].map((i) => pl.o[i] + x[i] * p.x + y[i] * p.y));
    for (const c of Object.values((st.sk && st.sk.curves) || {})) {
      if ((c.type === "circle" || c.type === "arc") && st.sk.points[c.c] && Number.isFinite(c.r)) {
        const cp = st.sk.points[c.c];
        for (const [a, b] of [[-1, -1], [1, 1]]) addPt([0, 1, 2].map((i) => pl.o[i] + x[i] * (cp.x + a * c.r) + y[i] * (cp.y + b * c.r)));
      }
    }
  };
  for (const r of refs || []) {
    if (!r) continue;
    if (r.body) addBody(r.body);
    else if (r.kind === "cplane") { const s = app.planeState(r.id); addPlane(s && s.plane); }
    else if (r.kind === "feature") {
      const f = app.feature(r.id);
      if (!f) continue;
      if (f.type === "sketch") addSketch(f.id);
      else if (f.type === "cplane") { const s = app.planeState(f.id); addPlane(s && s.plane); }
      else for (const b of featureBodies(app, f)) addBody(b);
    } else if (r.kind === "originPlane" && K.ORIGIN_PLANES) addPlane(K.ORIGIN_PLANES[r.name]);
    else if (r.kind === "originAxis" || r.kind === "originPoint") { addPt([-10, -10, -10]); addPt([10, 10, 10]); }
  }
  if (!Number.isFinite(min[0])) { app.toast("Nothing to find in the window", "info"); return false; }
  const THREE = vp.THREE;
  const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const rad = Math.max(1, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  try {
    const st = vp.rig.fitState(c, rad * 1.15, vp.rig.quat);
    vp.rig.animateTo(st, 320);
    if (vp.requestRender) vp.requestRender();
  } catch (e) { console.error(e); return false; }
  return true;
}

// ---------------------------------------------------------------------------
// Isolate / Unisolate (hide every other body; Unisolate restores what was visible).
// ---------------------------------------------------------------------------
export function isIsolated(app) { return !!(app.doc.isolate && app.doc.isolate.saved); }

export function isolateBodies(app, ids) {
  ids = ids.filter((id) => app.doc.bodies[id]);
  if (!ids.length) return;
  app.mutate("Isolate", (doc) => {
    const prev = doc.isolate && doc.isolate.saved;
    const saved = prev ? { ...prev } : {};
    for (const [id, m] of Object.entries(doc.bodies)) {
      if (!prev) saved[id] = m.visible !== false;
      m.visible = ids.includes(id);
    }
    doc.isolate = { bodies: [...ids], saved };
  });
}

export function unisolate(app) {
  if (!isIsolated(app)) return;
  app.mutate("Unisolate", (doc) => {
    const saved = (doc.isolate && doc.isolate.saved) || {};
    for (const [id, m] of Object.entries(doc.bodies)) {
      if (id in saved) m.visible = !!saved[id];
      else m.visible = true;
    }
    delete doc.isolate;
  });
}

// ---------------------------------------------------------------------------
// Selectable / Unselectable: unselectable bodies are skipped by canvas picking.
// ---------------------------------------------------------------------------
export function isSelectable(app, id) {
  const m = app.doc.bodies[id];
  return !m || m.selectable !== false;
}

let acceptsRaw = null;
/** The selection acceptance test without the unselectable-body rule (browser rows use this). */
export function acceptsRef(app, ref) { return acceptsRaw ? acceptsRaw(ref) : app.selection.accepts(ref); }

export function installSelectability(app) {
  const sel = app.selection;
  if (!sel || sel._brSelectable) return;
  const raw = sel.accepts.bind(sel);
  acceptsRaw = raw;
  sel._brSelectable = true;
  sel.accepts = (r) => {
    if (r && typeof r.body === "string" && !isSelectable(app, r.body)) return false;
    return raw(r);
  };
}

export function toggleSelectable(app, ids) {
  ids = ids.filter((id) => app.doc.bodies[id]);
  if (!ids.length) return;
  const anySel = ids.some((id) => isSelectable(app, id));
  app.mutate(anySel ? "Unselectable" : "Selectable", (doc) => {
    for (const id of ids) {
      if (!doc.bodies[id]) continue;
      if (anySel) doc.bodies[id].selectable = false; else delete doc.bodies[id].selectable;
    }
  }, { recompute: false });
  if (anySel) app.selection.set(app.selection.items.filter((r) => !(r.body && ids.includes(r.body))));
}

// ---------------------------------------------------------------------------
// Opacity Control (per-body opacity on top of the appearance).
// ---------------------------------------------------------------------------
export function installOpacity(app) {
  const vp = vpInternal(app);
  const bl = vp && vp.bodies;
  if (!bl || typeof bl.material !== "function" || bl._brOpacity) return !!(bl && bl._brOpacity);
  const orig = bl.material.bind(bl);
  const cache = new Map();
  bl._brOpacity = true;
  bl.material = (meta, cc, variant) => {
    const m = orig(meta, cc, variant);
    const op = meta && meta.opacity != null ? Number(meta.opacity) : 1;
    if (!(op >= 0 && op < 1) || !m || typeof m.clone !== "function") return m;
    const k = `${m.uuid}|${op}`;
    let c = cache.get(k);
    if (!c) {
      c = m.clone();
      c.transparent = true;
      c.opacity = (m.transparent ? m.opacity : 1) * op;
      c.depthWrite = false;
      cache.set(k, c);
    }
    return c;
  };
  return true;
}

export function setOpacity(app, ids, value) {
  ids = ids.filter((id) => app.doc.bodies[id]);
  if (!ids.length) return;
  if (!installOpacity(app)) { app.toast("Opacity Control is not available", "info"); return; }
  const v = Math.max(0, Math.min(1, Number(value)));
  app.mutate("Opacity Control", (doc) => {
    for (const id of ids) {
      if (!doc.bodies[id]) continue;
      if (v >= 1) delete doc.bodies[id].opacity; else doc.bodies[id].opacity = v;
    }
  });
}

/**
 * Bottom-right status text for browser/timeline selections ("Extrude1", "Body1", "Sketch1").
 * Only clears text it set itself, so canvas statuses from other modules are left alone.
 */
export function installStatus(app) {
  if (app._brStatus || typeof app.setStatus !== "function") return;
  app._brStatus = true;
  let own = null;
  const update = () => {
    const t = selectionStatus(app, app.selection.items);
    if (t) { own = t; app.setStatus(t); }
    else if (own != null && app.status === own) { own = null; app.setStatus(""); }
  };
  app.on("selection", update);
  app.on("doc", () => { if (own != null && app.status === own) update(); }); // renamed / deleted
}

/** Status text for a browser/timeline selection ("Extrude1", "Body1"), or null when not ours. */
export function selectionStatus(app, items) {
  if (!items || items.length !== 1) return null;
  const r = items[0];
  if (r.kind === "feature" || r.kind === "cplane") { const f = app.feature(r.id); return f ? f.name : null; }
  if (r.kind === "body") { const m = app.doc.bodies[r.body]; return m ? m.name : null; }
  return null;
}
