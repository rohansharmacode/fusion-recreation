// Helpers for sketch commands that use the shared command-dialog framework (app.ui.dialog):
// live previews of a modified copy of the active sketch (drawn through ST.live, like a drag) and
// small conversions between sketch and world coordinates.
import { ST, activeData, activeFeature, params, toWorld } from "./ctx.js";
import { rebuild, clearToolPreview } from "./render.js";

/** Show sketch copy `sk` instead of the active sketch (solved; profiles recomputed). */
export function showLive(sk) {
  const d = activeData();
  if (!d || !sk) return;
  const S = ST.app.S;
  let status = null, regions = null;
  try { status = S.solve(sk, params()); } catch { status = d.status; }
  try { regions = S.regions(sk); } catch { regions = { regions: [] }; }
  ST.live = { id: ST.sketchId, plane: d.plane, sk, regions, status };
  rebuild();
}
/** Back to the stored sketch. */
export function endLive() {
  clearToolPreview();
  if (ST.live) { ST.live = null; rebuild(); }
}

/** The stored (document) sketch data of the active sketch, ignoring a live preview. */
export function storedSketch() {
  const f = activeFeature();
  return f ? f.sk : null;
}
export function storedState() {
  const id = ST.sketchId;
  return id ? ST.app.sketchState(id) : null;
}

/** Sketch uv -> world on the active plane. */
export function W(uv) {
  const d = activeData();
  return d ? toWorld(d.plane, uv[0], uv[1]) : [uv[0], uv[1], 0];
}
/** Sketch direction -> world direction on the active plane. */
export function Wdir(v) {
  const d = activeData();
  if (!d) return [v[0], v[1], 0];
  const K = ST.app.K;
  const y = K.planeY(d.plane);
  const x = d.plane.x;
  return [x[0] * v[0] + y[0] * v[1], x[1] * v[0] + y[1] * v[1], x[2] * v[0] + y[2] * v[1]];
}

/** A sketch-curve ref filter for selection rows: curves of the stored active sketch. */
export function curveOfActive(pred = null) {
  return (r) => {
    if (!r || r.kind !== "sketchCurve" || r.sketch !== ST.sketchId) return false;
    const sk = storedSketch();
    const cv = sk && sk.curves[r.curve];
    if (!cv) return false;
    return pred ? !!pred(cv, r.curve, sk) : true;
  };
}
export function pointOfActive(pred = null) {
  return (r) => {
    if (!r || r.kind !== "sketchPoint" || r.sketch !== ST.sketchId) return false;
    const sk = storedSketch();
    return !!(sk && sk.points[r.point]) && (!pred || pred(sk.points[r.point], r.point, sk));
  };
}

/** Labels + paired inputs in one dialog row (Fusion's two-column Quantity / Distance rows). */
export function pairRow(dlg, label, ids, extra = null) {
  const el = document.createElement("div");
  el.className = "sk-pair-row";
  const lab = document.createElement("div");
  lab.className = "dlg-label";
  lab.textContent = label;
  lab.title = label;
  const box = document.createElement("div");
  box.className = "sk-pair";
  for (const id of ids) {
    const inp = dlg.embedInput(id, "dlg-input sk-pair-input");
    if (inp) box.appendChild(inp);
  }
  if (extra) box.appendChild(extra);
  el.append(lab, box);
  return el;
}

export function closeOtherDialog() {
  const ui = ST.app.ui && ST.app.ui.dialog;
  if (ui && ui.current) ui.current.cancel();
}

export { params };
