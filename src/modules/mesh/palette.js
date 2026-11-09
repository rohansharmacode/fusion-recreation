// MESH SELECTION PALETTE (ParaMeshShowSelectionPanelCmd, SELECT > Mesh Palette) and the mesh selection rules
// shared by the MESH dialogs: Selection Filter (Mesh Bodies / Face Groups / Mesh Faces), Brush Size (paint a
// patch of faces with one click), Select Back Faces, and Modify Selection (Grow, Shrink, Invert, Expand to Face
// Group, Expand to Connected). Face selections are meshFace refs with triOnly:true (one per triangle).
import * as A from "./algo.js";

export const PAL = { mode: "body", brush: 0, back: false, visible: false, el: null, app: null };
const MODES = [["body", "Mesh Bodies"], ["group", "Face Groups"], ["face", "Mesh Faces"]];
const listeners = new Set();
export const onPalette = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function changed() { for (const fn of listeners) { try { fn(PAL); } catch (e) { console.error(e); } } render(); }
export function setMode(mode) { if (!MODES.some(([m]) => m === mode) || PAL.mode === mode) return; PAL.mode = mode; changed(); }

/** The current state's mesh entry of a body (dialog base state first). */
export function meshEntryOf(app, body, st = null) {
  const s = st || (app.ui.dialog && app.ui.dialog.current && app.ui.dialog.current.baseState) || (app.result && app.result.state);
  const e = s && s.meshBodies && s.meshBodies.get(body);
  return e && e.mesh && (!e.kind || e.kind === "mesh") ? e : null;
}
/** Work mesh (cached per mesh object) of a body. */
const WCACHE = new WeakMap();
export function workFor(mesh) {
  let w = WCACHE.get(mesh);
  if (!w) { w = A.fromMesh(mesh); WCACHE.set(mesh, w); }
  return w;
}
/** Refs for faces within the brush of a picked triangle. */
export function brushRefs(app, ref, st) {
  const e = meshEntryOf(app, ref.body, st);
  const one = { kind: "meshFace", body: ref.body, tri: ref.tri, group: ref.group, p: ref.p, n: ref.n, triOnly: true };
  if (!e || !(PAL.brush > 0) || !ref.p) return one;
  const vp = app.viewport;
  const mm = vp && typeof vp.pixelSize === "function" ? vp.pixelSize(ref.p) * PAL.brush : PAL.brush;
  const W = workFor(e.mesh);
  const out = [];
  const N = ref.n || [0, 0, 1];
  for (let t = 0; t < A.tcount(W); t++) {
    const c = A.triCentroid(W, t);
    if (A.len(A.sub(c, ref.p)) > mm) continue;
    if (!PAL.back && A.dot(A.triNormal(W, t), N) < 0) continue;
    out.push({ kind: "meshFace", body: ref.body, tri: t, group: W.G[t] ?? 0, triOnly: true });
  }
  return out.length ? out : one;
}
/** Triangle sets per body of a list of refs: Map body -> Set(tri). */
export function trisOfRefs(app, refs, st) {
  const m = new Map();
  for (const r of refs || []) {
    const e = meshEntryOf(app, r.body, st);
    if (!e) continue;
    const W = workFor(e.mesh);
    if (!m.has(r.body)) m.set(r.body, new Set());
    const s = m.get(r.body);
    if (r.kind === "body") for (let t = 0; t < A.tcount(W); t++) s.add(t);
    else if (r.kind === "meshFace" && r.triOnly) s.add(r.tri);
    else if (r.kind === "meshFace") for (let t = 0; t < A.tcount(W); t++) if ((W.G[t] ?? 0) === (r.group >= 0 ? r.group : 0)) s.add(t);
  }
  return m;
}
const triRefs = (body, tris, W) => [...tris].sort((a, b) => a - b).map((t) => ({ kind: "meshFace", body, tri: t, group: W.G[t] ?? 0, triOnly: true }));
/** Modify Selection actions: 'grow' | 'shrink' | 'invert' | 'group' | 'connected'. Returns the new refs. */
export function modifySelection(app, refs, action, st) {
  const sets = trisOfRefs(app, refs, st);
  const out = [];
  for (const [body, set] of sets) {
    const e = meshEntryOf(app, body, st);
    const W = workFor(e.mesh);
    const N = A.triNeighbors(W);
    const m = A.tcount(W);
    let next = new Set(set);
    if (action === "grow") for (const t of set) for (let k = 0; k < 3; k++) { const u = N[3 * t + k]; if (u >= 0) next.add(u); }
    else if (action === "shrink") { next = new Set([...set].filter((t) => [0, 1, 2].every((k) => { const u = N[3 * t + k]; return u < 0 || set.has(u); }))); }
    else if (action === "invert") { next = new Set(); for (let t = 0; t < m; t++) if (!set.has(t)) next.add(t); }
    else if (action === "connected") {
      const { comp } = A.components(W, N);
      const cs = new Set([...set].map((t) => comp[t]));
      next = new Set();
      for (let t = 0; t < m; t++) if (cs.has(comp[t])) next.add(t);
    }
    if (action === "group") {
      const gs = new Set([...set].map((t) => W.G[t] ?? 0));
      for (const g of gs) { let tri = 0; for (let t = 0; t < m; t++) if ((W.G[t] ?? 0) === g) { tri = t; break; } out.push({ kind: "meshFace", body, tri, group: g }); }
      continue;
    }
    if (next.size === m && action === "connected") { out.push({ kind: "body", body }); continue; }
    out.push(...triRefs(body, next, W));
  }
  return out;
}
/** Counts for the palette footer. */
function counts(refs) {
  let b = 0, g = 0, f = 0;
  for (const r of refs || []) { if (r.kind === "body") b++; else if (r.kind === "meshFace" && r.triOnly) f++; else if (r.kind === "meshFace") g++; }
  return { b, g, f };
}

// ------------------------------------------------------------------ UI
/** The refs the palette acts on: the active selection row of an open dialog, else app.selection. */
function target(app) {
  const d = app.ui.dialog && app.ui.dialog.current;
  if (d && !d.closed && d.active && d.defs[d.active] && d.defs[d.active].meshRow) return { refs: d.values[d.active] || [], set: (r) => d.setSelection(d.active, r), st: d.baseState };
  return { refs: app.selection.items, set: (r) => app.selection.set(r), st: null };
}
function render() {
  const el = PAL.el;
  if (!el) return;
  el.style.display = PAL.visible ? "" : "none";
  for (const b of el.querySelectorAll("[data-mode]")) b.classList.toggle("on", b.dataset.mode === PAL.mode);
  const br = el.querySelector('[data-input="brush"]');
  if (br && document.activeElement !== br) br.value = String(PAL.brush);
  const bv = el.querySelector('[data-input="brushValue"]');
  if (bv) bv.textContent = String(PAL.brush);
  const bk = el.querySelector('[data-input="back"]');
  if (bk) bk.checked = PAL.back;
  if (PAL.app) {
    const c = counts(target(PAL.app).refs);
    const ct = el.querySelector(".msh-pal-counts");
    if (ct) ct.innerHTML = `<div>Selected Mesh Bodies<b>${c.b}</b></div><div>Selected Face Groups<b>${c.g}</b></div><div>Selected Faces<b>${c.f}</b></div>`;
  }
}
const GLYPH = {
  body: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 6l6-3 6 3v6l-6 3-6-3z" fill="#cfd8e3" stroke="#3b5675"/><path d="M3 6l6 3 6-3M9 9v6" fill="none" stroke="#3b5675"/></svg>',
  group: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 6l6-3 6 3v6l-6 3-6-3z" fill="#eef1f4" stroke="#3b5675"/><path d="M3 6l6 3v6l-6-3z" fill="#5aa0e6" stroke="#3b5675"/><path d="M3 6l6 3 6-3" fill="none" stroke="#3b5675"/></svg>',
  face: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 6l6-3 6 3v6l-6 3-6-3z" fill="#eef1f4" stroke="#3b5675"/><path d="M3 6l6 3-3 4.5z" fill="#5aa0e6" stroke="#3b5675"/><path d="M3 6l6 3 6-3M9 9v6M9 9l-3 4.5M9 9l3 4.5" fill="none" stroke="#3b5675" stroke-width=".7"/></svg>',
};
export function initPalette(app) {
  PAL.app = app;
  const host = app.dom.overlay || document.body;
  const el = document.createElement("div");
  el.className = "msh-pal";
  el.dataset.palette = "mesh";
  el.style.display = "none";
  el.innerHTML = `
    <div class="msh-pal-head"><span>MESH SELECTION PALETTE</span><button type="button" class="msh-pal-x" data-act="close" title="Close">&#215;</button></div>
    <div class="msh-pal-body">
      <div class="msh-pal-row"><label>Selection Filter</label><span class="msh-pal-modes">${MODES.map(([m, l]) => `<button type="button" data-mode="${m}" title="${l}">${GLYPH[m]}</button>`).join("")}</span></div>
      <div class="msh-pal-row"><label>Brush Size</label><span><input type="range" min="0" max="60" step="1" data-input="brush"><i data-input="brushValue">0</i></span></div>
      <div class="msh-pal-row"><label>Select Back Faces</label><span><input type="checkbox" data-input="back"></span></div>
      <div class="msh-pal-sec">Modify Selection</div>
      <div class="msh-pal-acts">
        <button type="button" data-act="grow">Grow</button><button type="button" data-act="shrink">Shrink</button><button type="button" data-act="invert">Invert</button>
        <button type="button" data-act="group">Expand to Face Group</button><button type="button" data-act="connected">Expand to Connected</button>
      </div>
      <div class="msh-pal-counts"></div>
    </div>`;
  el.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.mode) { setMode(b.dataset.mode); return; }
    const act = b.dataset.act;
    if (act === "close") { setVisible(false); return; }
    if (act) {
      const tg = target(app);
      if (!tg.refs.length) { app.toast("Select mesh faces, face groups or a body first", "info", 2500); return; }
      try { tg.set(modifySelection(app, tg.refs, act, tg.st)); } catch (e) { console.error(e); }
      render();
    }
  });
  el.querySelector('[data-input="brush"]').addEventListener("input", (ev) => { PAL.brush = Number(ev.target.value) || 0; if (PAL.brush > 0 && PAL.mode !== "face") PAL.mode = "face"; changed(); });
  el.querySelector('[data-input="back"]').addEventListener("change", (ev) => { PAL.back = !!ev.target.checked; changed(); });
  host.appendChild(el);
  PAL.el = el;
  const place = () => {
    const c = app.dom.canvasHost && app.dom.canvasHost.getBoundingClientRect();
    if (!c) return;
    el.style.left = `${Math.round(c.left + 12)}px`;
    el.style.top = `${Math.round(Math.max(c.top + 60, c.bottom - 330))}px`;
  };
  place();
  app.on("layout", place);
  window.addEventListener("resize", place);
  app.on("selection", render);
  app.on("dialog", () => setTimeout(render, 0));
  render();
}
export function setVisible(on) {
  PAL.visible = !!on;
  render();
  if (PAL.app) { PAL.app.emit("layout", {}); PAL.app.emit("commands", { id: "ParaMeshShowSelectionPanelCmd" }); }
}
export const refreshPalette = render;
