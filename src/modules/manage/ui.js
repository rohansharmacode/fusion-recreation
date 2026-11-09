// Shared DOM / storage / canvas helpers for the manage module (Utilities, Manage, Automation and
// Select-panel tools). Non-modal palettes (code editor, Navigator, task board, results lists) are
// floating windows in the overlay layer; modal windows use app.ui.modals (menus module).
import * as THREE from "three";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** el("div", {class, text, html, dataset, style, on:{click}}, ...children) */
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === "value") e.value = v;
    else if (k === "checked") e.checked = !!v;
    else if (k === "disabled") e.disabled = !!v;
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}

// ---------------------------------------------------------------------------------------------
// localStorage (always wrapped: the app may run in a sandboxed iframe) with an in-memory fallback
// ---------------------------------------------------------------------------------------------
const mem = new Map();
export const store = {
  get(key, def = null) {
    try {
      const v = window.localStorage.getItem(key);
      if (v !== null && v !== undefined) return JSON.parse(v);
    } catch { /* blocked storage or bad JSON */ }
    return mem.has(key) ? JSON.parse(mem.get(key)) : def;
  },
  set(key, value) {
    const s = JSON.stringify(value);
    mem.set(key, s);
    try { window.localStorage.setItem(key, s); return true; } catch { return false; }
  },
  remove(key) {
    mem.delete(key);
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  },
  get persistent() {
    try { const k = "__mg_probe"; window.localStorage.setItem(k, "1"); window.localStorage.removeItem(k); return true; } catch { return false; }
  },
};

/** Open a URL in a new browser tab; false (and a toast with the address) when the host blocks pop-ups. */
export function openUrl(app, url, what = "page") {
  let w = null;
  try { w = window.open(url, "_blank"); } catch { w = null; }
  if (!w) { app.toast(`The browser blocked the new tab for the ${what}. Address: ${url}`, "warning", 7000); return false; }
  try { w.opener = null; } catch { /* cross-origin: fine */ }
  return true;
}

/** Copy text to the clipboard (best effort). */
export function copyText(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(String(text)).catch(() => {}); return true; } } catch { /* ignore */ }
  return false;
}

/** Leave the sketch environment and close an open command dialog before a tool opens. */
export function beginModel(app) {
  if (app.mode === "sketch") {
    const stop = app.commands.get("SketchStop");
    try { if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model"); } catch { app.setMode("model"); }
  }
  try { if (app.activeCommand) app.activeCommand.cancel(); } catch { /* ignore */ }
}

/** A labelled row inside a dialog-framework custom row (custom rows have no label column of their own). */
export function lrow(label, ctl, title) {
  return el("div", { class: "mg-lrow" }, el("div", { class: "dlg-label", text: label || "", title: title || label || "" }), el("div", { class: "dlg-ctl" }, ctl));
}

export const toBodyRef = (r) => (r && (r.kind === "face" || r.kind === "edge" || r.kind === "vertex") && r.body ? { kind: "body", body: r.body } : r);

export function bodyName(app, id) { const m = app.doc.bodies[id]; return (m && m.name) || id; }

/** Visible, alive bodies of the committed result: [{id, shape, meta}] */
export function visibleBodies(app) {
  return app.bodies().filter((b) => b.shape && (b.meta || {}).visible !== false);
}

/** Face refs (Fusion-style canvas refs) of every face of a body. */
export function faceRefs(app, bodyId) {
  const b = app.body(bodyId);
  if (!b) return [];
  const T = app.K.topoOf(b.shape);
  return T.faces.map((f, i) => ({ kind: "face", body: bodyId, index: i, p: [...f.c], n: [...f.n], planar: f.type === "PLANE" }));
}
/** Edge refs of every (non-seam) edge of a body. */
export function edgeRefs(app, bodyId) {
  const b = app.body(bodyId);
  if (!b) return [];
  const T = app.K.topoOf(b.shape);
  return T.edges.map((e, i) => ({ kind: "edge", body: bodyId, index: i, p: [...e.m] }));
}

export const fmtMM = (v, d = 2) => (Number.isFinite(v) ? `${v.toFixed(d)} mm` : "--");
export const fmtNum = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "--");
export const fmtDate = (t) => { try { return new Date(t).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return String(t); } };
export const fmtDay = (t) => { try { return new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return String(t); } };

/** Pre-highlight refs on the canvas (light-blue tint) without touching app.selection. */
export function previewHighlight(app, refs) {
  try { const h = app.viewport && app.viewport._vp && app.viewport._vp.highlighter; if (h) h.setPreview(refs || []); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------------------------
// Non-modal palette window (Fusion's floating palettes: white card, upper-case title, x)
// ---------------------------------------------------------------------------------------------
const palettes = new Map();
export function palette(app, opts = {}) {
  const id = opts.id || "palette";
  const old = palettes.get(id);
  if (old && !old.closed) { old.front(); return old; }
  const host = app.dom.overlay || document.body;
  const root = el("div", { class: `mg-pal ${opts.className || ""}`, dataset: { palette: id }, role: "dialog" });
  if (opts.width) root.style.width = `${opts.width}px`;
  if (opts.height) root.style.height = `${opts.height}px`;
  const title = el("span", { class: "mg-pal-title", text: opts.title || "" });
  const x = el("button", { class: "mg-pal-x", type: "button", title: "Close", "data-action": "close", html: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.2"/></svg>' });
  const head = el("div", { class: "mg-pal-head" }, title, opts.headExtra || null, x);
  const body = el("div", { class: "mg-pal-body" });
  if (opts.body instanceof Node) body.append(opts.body);
  const foot = el("div", { class: "mg-pal-foot" });
  root.append(head, body);
  if (opts.foot !== false) root.append(foot);
  host.append(root);
  // initial position: centred in the canvas area (or opts.left/top)
  const r = (app.dom.canvasHost || host).getBoundingClientRect();
  const w = root.offsetWidth, h = root.offsetHeight;
  root.style.left = `${Math.max(8, Math.round(opts.left ?? (r.left + (r.width - w) / 2)))}px`;
  root.style.top = `${Math.max(8, Math.round(opts.top ?? (r.top + Math.max(10, (r.height - h) / 2))))}px`;
  const handle = {
    id, root, body, foot, head, closed: false,
    setTitle(t) { title.textContent = t; },
    front() { host.append(root); },
    close() {
      if (handle.closed) return;
      handle.closed = true;
      root.remove();
      palettes.delete(id);
      try { opts.onClose && opts.onClose(); } catch (e) { console.warn(e); }
      app.emit("layout", {});
    },
  };
  x.addEventListener("click", () => handle.close());
  head.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || ev.target.closest("button,input,select")) return;
    const rr = root.getBoundingClientRect();
    const ox = ev.clientX - rr.left, oy = ev.clientY - rr.top;
    const move = (e) => {
      root.style.left = `${Math.max(-rr.width + 60, Math.min(window.innerWidth - 60, e.clientX - ox))}px`;
      root.style.top = `${Math.max(0, Math.min(window.innerHeight - 28, e.clientY - oy))}px`;
    };
    const up = () => { window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    ev.preventDefault();
  });
  root.addEventListener("pointerdown", () => { if (host.lastElementChild !== root && !root.contains(document.activeElement)) host.append(root); }, true);
  // Esc inside the palette closes it (not while typing in a text area)
  root.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !(ev.target && ev.target.tagName === "TEXTAREA")) { ev.stopPropagation(); handle.close(); }
  });
  palettes.set(id, handle);
  app.emit("layout", {});
  return handle;
}
export function getPalette(id) { const p = palettes.get(id); return p && !p.closed ? p : null; }
export function closePalette(id) { const p = palettes.get(id); if (p) p.close(); }

// ---------------------------------------------------------------------------------------------
// Canvas overlay: paint faces of a body in a colour (Design Advice alerts, Find Features)
// ---------------------------------------------------------------------------------------------
export function createFacePainter(app, name) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.noPick = true;
  let added = false;
  const ensure = () => {
    const vp = app.viewport;
    if (!added && vp && vp.groups && vp.groups.overlay) { vp.groups.overlay.add(group); added = true; }
  };
  function clear() {
    for (const c of [...group.children]) { group.remove(c); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }
    try { app.viewport && app.viewport.requestRender(); } catch { /* ignore */ }
  }
  /** items: [{body, faces:[index], color:'#hex', opacity}] or per-vertex colour lists {body, face, colors} */
  function paint(items) {
    clear();
    ensure();
    for (const it of items || []) {
      const b = app.body(it.body);
      if (!b || !b.shape) continue;
      let md;
      try { md = app.viewport.meshFor(b.shape); } catch { md = null; }
      if (!md || !md.triangles) continue;
      const want = new Set(it.faces || []);
      const idx = [];
      for (const g of md.faceGroups) if (want.has(g.face)) for (let k = g.start; k < g.start + g.count; k++) idx.push(md.triangles[k]);
      if (!idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(md.vertices, 3));
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ color: it.color || "#e0302a", transparent: true, opacity: it.opacity ?? 0.75, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 5;
      m.userData.noPick = true;
      group.add(m);
    }
    try { app.viewport.requestRender(); } catch { /* ignore */ }
  }
  function dispose() { clear(); if (added && group.parent) group.parent.remove(group); added = false; }
  return { paint, clear, dispose, group };
}

/** Small SVG glyphs drawn for this module (16 px, original). */
const S16 = (b, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true">${b}</svg>`;
export const GL = {
  caret: S16('<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4"/>'),
  caretR: S16('<path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4"/>'),
  play: S16('<path d="M5 3.5v9l7-4.5z" fill="currentColor"/>'),
  stop: S16('<rect x="4.5" y="4.5" width="7" height="7" fill="currentColor"/>'),
  plus: S16('<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5"/>'),
  edit: S16('<path d="M3 13l.7-2.8L10.6 3.3l2.1 2.1-6.9 6.9z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M9.4 4.5l2.1 2.1" stroke="currentColor" stroke-width="1.2"/>'),
  folder: S16('<path d="M1.8 4.2h4.3l1.3 1.4h6.8v7.2H1.8z" fill="none" stroke="currentColor" stroke-width="1.2"/>'),
  unlink: S16('<path d="M6.5 9.5l-1.8 1.8a2 2 0 0 1-2.8-2.8l1.8-1.8M9.5 6.5l1.8-1.8a2 2 0 0 1 2.8 2.8l-1.8 1.8M3 3l2 2M11 11l2 2" fill="none" stroke="currentColor" stroke-width="1.2"/>'),
  star: S16('<path d="M8 2l1.8 3.8 4.1.5-3 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1-3-2.9 4.1-.5z" fill="none" stroke="currentColor" stroke-width="1.1"/>'),
  starOn: S16('<path d="M8 2l1.8 3.8 4.1.5-3 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1-3-2.9 4.1-.5z" fill="#f2b705" stroke="#c48f00" stroke-width="1.1"/>'),
  search: S16('<circle cx="6.8" cy="6.8" r="4.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10 10l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
  info: S16('<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7v4.5M8 4.6v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
  check: S16('<path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#3a9d23" stroke-width="1.8"/>'),
  alert: S16('<path d="M8 1.8l6.6 12H1.4z" fill="#e6a700" stroke="#9c7200" stroke-width=".8"/><path d="M8 6v4M8 11.6v.2" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>'),
  error: S16('<circle cx="8" cy="8" r="6.4" fill="#d9302c"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" stroke-width="1.5"/>'),
  eye: S16('<path d="M1.5 8s2.5-4.2 6.5-4.2S14.5 8 14.5 8s-2.5 4.2-6.5 4.2S1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="8" cy="8" r="2" fill="currentColor"/>'),
  fit: S16('<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.3"/>'),
  trash: S16('<path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 9h5.6l.7-9" fill="none" stroke="currentColor" stroke-width="1.2"/>'),
  doc: S16('<path d="M3.5 1.8h6l3 3v9.4h-9z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M9.5 1.8v3h3" fill="none" stroke="currentColor" stroke-width="1.1"/>'),
  user: S16('<circle cx="8" cy="5.5" r="2.7" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.8 14c.6-3 2.7-4.4 5.2-4.4s4.6 1.4 5.2 4.4" fill="none" stroke="currentColor" stroke-width="1.2"/>'),
  clock: S16('<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 4.5V8l2.5 1.6" fill="none" stroke="currentColor" stroke-width="1.2"/>'),
  external: S16('<path d="M9 2.5h4.5V7M13.5 2.5L7 9M11.5 9.5v4h-9v-9h4" fill="none" stroke="currentColor" stroke-width="1.2"/>'),
  save: S16('<path d="M2.5 2.5h9l2 2v9h-11z" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5 2.5v3.5h5V2.5M4.5 13.5V9h7v4.5" fill="none" stroke="currentColor" stroke-width="1.1"/>'),
  download: S16('<path d="M8 2v8M4.8 7l3.2 3.2L11.2 7M2.5 13.5h11" fill="none" stroke="currentColor" stroke-width="1.3"/>'),
};
