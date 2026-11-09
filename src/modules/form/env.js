// FORM contextual environment: Create Form / Edit Form Feature enter it, FINISH FORM leaves it.
// While active: the edited Form feature evaluates to T-spline bodies, double-click selects edge / face loops,
// Delete removes T-spline faces / edges / vertices, Alt+1 / Alt+2 / Alt+3 switch the display mode.
import { FORM, displayOf } from "./feature.js";
import { edgeLoop, faceLoop, topo, eRef, fRef, isTsRef, V, withSymmetry } from "./cage.js";
import { deleteElements } from "./ops.js";
import { formFeature, cageOf, shownCage, commitChange, byBody } from "./common.js";

export const FORM_SHORTCUTS = ["TSplineEditCommand", "TSplinePrimitiveBoxCommand", "TSplineInsertEdgeCommand", "TSplineSubsetCmd", "TSplineCreasedEdgeCommand", "TSplineToggleTessModeCmd"];

/** Drop the evaluator cache from the feature onwards (its evaluation depends on FORM.editing). */
export function bust(app, fid) {
  const i = app.featureIndex(fid);
  const ev = app.evaluator;
  if (ev && Array.isArray(ev.cache) && i >= 0 && ev.cache.length > i) ev.cache.length = i;
}

let handlerOff = null;
let session = null; // {fid, oldMarker, featureCount, fresh}

export function enterForm(app, fid, { fresh = false } = {}) {
  const f = app.feature(fid);
  if (!f) return;
  if (app.mode === "sketch") {
    const stop = app.commands.get("SketchStop");
    if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model");
  }
  if (FORM.editing && FORM.editing !== fid) app.exitEnvironment("form", { reason: "replaced" });
  const idx = app.featureIndex(fid);
  session = { fid, oldMarker: app.doc.marker, count: app.doc.features.length, fresh, rolled: false };
  // Edit Form Feature on an older form rolls the timeline back to it (later features are suppressed while editing)
  if (idx + 1 < app.doc.marker) { app.doc.marker = idx + 1; session.rolled = true; }
  FORM.editing = fid;
  bust(app, fid);
  app.recompute();
  app.enterEnvironment({
    id: "form", mode: "form", label: "FORM", tab: "FormTab", finishCommand: "TSplineBaseFeatureStop",
    markingMenu: "TSplineEnvironment", shortcuts: FORM_SHORTCUTS, feature: fid,
    onExit: (reason) => leave(app, reason),
  });
  if (!handlerOff) handlerOff = app.input.push(formHandler(app));
  app.emit("form", { action: "enter", feature: fid });
}

function leave(app, reason) {
  const s = session;
  session = null;
  if (handlerOff) { handlerOff(); handlerOff = null; }
  const fid = FORM.editing;
  FORM.editing = null;
  if (reason === "document" || !fid || !app.feature(fid)) { app.emit("form", { action: "exit", reason }); return; }
  bust(app, fid);
  if (s && s.rolled) app.doc.marker = Math.min(app.doc.features.length, s.oldMarker + (app.doc.features.length - s.count));
  app.selection.clear();
  const f = app.feature(fid);
  const empty = !(f.bodies || []).length;
  const st = app.history && app.history.undoStack;
  const top = Array.isArray(st) ? st[st.length - 1] : null;
  if (empty && s && s.fresh && top && top.label === "Create Form" && typeof app._replaceDoc === "function") {
    // nothing was made: no empty Form is left behind (the Create Form step is dropped)
    st.pop();
    app._replaceDoc(top.doc);
    app.emit("history", {});
  } else {
    app.recompute();
  }
  app.emit("form", { action: "exit", reason });
}

export function finishForm(app) {
  if (app.environments.some((e) => e.id === "form")) { app.exitEnvironment("form", { reason: "finish" }); return; }
  // another environment in the form mode (foundation tests): leave the innermost one
  const env = [...app.environments].reverse().find((e) => e.mode === "form");
  if (env) app.exitEnvironment(env.id, { reason: "finish" });
}

export function createForm(app) {
  if (FORM.editing) { app.toast("A Form is already being edited", "info"); return; }
  if (app.mode === "sketch") {
    const stop = app.commands.get("SketchStop");
    if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model");
  }
  const f = app.addFeature({ type: "form", bodies: [] }, "Create Form");
  enterForm(app, f.id, { fresh: true });
}

/** Leave the environment when undo / open removes the edited feature. */
export function watchDoc(app) {
  app.on("doc", () => {
    if (FORM.editing && !app.feature(FORM.editing) && app.environments.some((e) => e.id === "form")) {
      app.exitEnvironment("form", { reason: "exit" });
    }
  });
}

// ---------------------------------------------------------------- loop selection (double-click)
export function loopRefs(app, ref, point) {
  const c = shownCage(app, ref.body);
  if (!c) return [ref];
  const t = topo(c);
  if (ref.kind === "tsEdge") {
    const e = t.edge(ref.a, ref.b);
    if (e < 0) return [ref];
    return edgeLoop(c, e).map((x) => eRef(ref.body, ...t.edges[x]));
  }
  if (ref.kind === "tsFace") {
    const fe = t.fEdges[ref.f];
    if (!fe || c.f[ref.f].length !== 4) return [ref];
    // cross the edge nearest the clicked point
    let best = fe[0], bd = Infinity;
    for (const e of fe) {
      const [a, b] = t.edges[e];
      const m = V.lerp(c.v[a], c.v[b], 0.5);
      const d = point ? V.dist(m, point) : 0;
      if (d < bd) { bd = d; best = e; }
    }
    return faceLoop(c, ref.f, best).map((f) => fRef(ref.body, f));
  }
  return [ref];
}

function formHandler(app) {
  return {
    name: "form",
    onDoubleClick(ev, ctx) {
      if (app.mode !== "form") return false;
      const h = ctx.hit;
      if (!h || !isTsRef(h.ref) || h.ref.kind === "tsVertex") return false;
      const loop = loopRefs(app, h.ref, h.point);
      const key = (r) => JSON.stringify(r);
      const cur = ctx.shift || ctx.ctrl ? app.selection.items : [];
      const m = new Map([...cur, ...loop].map((r) => [key(r), r]));
      app.selection.set([...m.values()]);
      return true;
    },
  };
}

// ---------------------------------------------------------------- Delete key, display mode
export function deleteSelected(app) {
  const refs = app.selection.items.filter(isTsRef);
  const bodies = app.selection.items.filter((r) => r.kind === "body" && cageOf(app, r.body));
  if (!refs.length && !bodies.length) return false;
  const ch = { set: new Map(), remove: new Set(bodies.map((r) => r.body)) };
  try {
    for (const [id, rs] of byBody(refs)) {
      if (ch.remove.has(id)) continue;
      const c = cageOf(app, id);
      if (!c) continue;
      const out = deleteElements(c, withSymmetry(c, rs));
      if (!out.f.length) ch.remove.add(id); else ch.set.set(id, out);
    }
  } catch (e) { app.toast(e.message || String(e), "error"); return true; }
  app.selection.clear();
  commitChange(app, "Delete", ch);
  return true;
}

export function setDisplay(app, mode, ids = null) {
  const f = formFeature(app);
  const all = ((f && f.bodies) || []).map((c) => c.id);
  const target = ids && ids.length ? ids : all;
  for (const id of target) FORM.display.set(id, mode);
  redraw(app);
}
/** Re-render the bodies (display mode changed: the tspline kind's mesh hook answers differently). */
export function redraw(app) { if (app.result) app.emit("model", { result: app.result, preview: !!app.previewing }); }
export { displayOf };
