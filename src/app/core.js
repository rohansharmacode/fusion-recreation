// App core: document + evaluation, events, selection, commands, input routing,
// undo/redo and small UI services. Every UI module talks to the rest of the app
// only through this object (see ARCHITECTURE.md for the contract).
import * as M from "../model.js";
import * as K from "../kernel.js";
import * as S from "../sketch/sketch.js";
import * as E from "../expr.js";

export { M, K, S, E };

// ---------------------------------------------------------------------------
// Refs (things that can be hovered / selected)
// ---------------------------------------------------------------------------
// {kind:'body', body}
// {kind:'face', body, index, p:[x,y,z], n:[x,y,z], planar:boolean}
// {kind:'edge', body, index, p:[x,y,z]}            p = point on edge (midpoint)
// {kind:'vertex', body, p:[x,y,z]}
// {kind:'profile', sketch, key, c:[u,v]}            sketch = feature id
// {kind:'sketchCurve', sketch, curve}
// {kind:'sketchPoint', sketch, point}
// {kind:'sketchDim', sketch, cid}
// {kind:'originPlane', name:'XY'|'XZ'|'YZ'}
// {kind:'originAxis', name:'X'|'Y'|'Z'}
// {kind:'originPoint'}
// {kind:'cplane', id}                               construction plane feature id
// {kind:'feature', id}                              timeline / browser item
export function refKey(r) {
  if (!r) return "";
  switch (r.kind) {
    case "body": return `body:${r.body}`;
    case "face": return `face:${r.body}:${r.index}`;
    case "edge": return `edge:${r.body}:${r.index}`;
    case "vertex": return `vertex:${r.body}:${r.p.map((v) => v.toFixed(5)).join(",")}`;
    case "profile": return `profile:${r.sketch}:${r.key}`;
    case "sketchCurve": return `sc:${r.sketch}:${r.curve}`;
    case "sketchPoint": return `sp:${r.sketch}:${r.point}`;
    case "sketchDim": return `sd:${r.sketch}:${r.cid}`;
    case "originPlane": return `op:${r.name}`;
    case "originAxis": return `oa:${r.name}`;
    case "originPoint": return "opt";
    case "cplane": return `cp:${r.id}`;
    case "feature": return `f:${r.id}`;
    default: return `${r.kind}:${JSON.stringify(r)}`;
  }
}

export class Selection {
  constructor(app) {
    this.app = app;
    this.items = [];
    this.hover = null;
    /** Optional predicate set by the active command / selection input: (ref) => boolean */
    this.filter = null;
  }
  has(r) { const k = refKey(r); return this.items.some((x) => refKey(x) === k); }
  set(items) { this.items = [...items]; this._changed(); }
  add(r) { if (!this.has(r)) { this.items.push(r); this._changed(); } }
  remove(r) { const k = refKey(r); const n = this.items.length; this.items = this.items.filter((x) => refKey(x) !== k); if (n !== this.items.length) this._changed(); }
  toggle(r) { this.has(r) ? this.remove(r) : this.add(r); }
  clear() { if (this.items.length) { this.items = []; this._changed(); } }
  ofKind(...kinds) { return this.items.filter((x) => kinds.includes(x.kind)); }
  setHover(r) {
    if (refKey(r) === refKey(this.hover)) return;
    this.hover = r || null;
    this.app.emit("hover", { ref: this.hover });
  }
  accepts(r) { return !this.filter || this.filter(r); }
  _changed() { this.app.emit("selection", { items: this.items }); }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
// def: { id, label, tooltip?, icon?, shortcut?: string|string[], when?: 'model'|'sketch',
//        kind?: 'feature'|'tool'|'view'|'ui', stub?: boolean,
//        run(app, ctx), enabled?(app) => boolean, checked?(app) => boolean }
export class CommandRegistry {
  constructor(app) {
    this.app = app;
    this.defs = new Map();
    this.lastRepeatable = null;
  }
  register(def) {
    if (!def || !def.id) throw new Error("command needs an id");
    const prev = this.defs.get(def.id);
    if (prev && !prev.stub && def.stub) return prev; // stubs never replace real commands
    const d = { kind: "feature", icon: def.id, ...def };
    this.defs.set(def.id, d);
    this.app.emit("commands", { id: def.id });
    return d;
  }
  get(id) { return this.defs.get(id); }
  has(id) { return this.defs.has(id); }
  all() { return [...this.defs.values()]; }
  isEnabled(id) {
    const d = this.defs.get(id);
    if (!d) return false;
    try { return d.enabled ? !!d.enabled(this.app) : true; } catch { return false; }
  }
  run(id, ctx = {}) {
    const d = this.defs.get(id);
    if (!d) { this.app.toast(`Command "${id}" is not available in this recreation`, "info"); return; }
    if (!this.isEnabled(id)) return;
    if (d.kind === "feature" || d.kind === "tool") this.app.emit("command-start", { id, def: d });
    if (d.kind === "feature" && !d.stub) this.lastRepeatable = id;
    try {
      return d.run(this.app, ctx);
    } catch (e) {
      console.error(e);
      this.app.toast(`${d.label || id}: ${e.message || e}`, "error");
    }
  }
  /** Find a command bound to a normalized key string ("Ctrl+Z", "Shift+N", "E") in the current mode. */
  forShortcut(key, mode) {
    let fallback = null;
    for (const d of this.defs.values()) {
      const sc = Array.isArray(d.shortcut) ? d.shortcut : d.shortcut ? [d.shortcut] : [];
      if (!sc.includes(key)) continue;
      if (d.when === mode) return d;
      if (!d.when) fallback = fallback || d;
    }
    return fallback;
  }
}

export function keyString(ev) {
  const parts = [];
  if (ev.ctrlKey || ev.metaKey) parts.push("Ctrl");
  if (ev.altKey) parts.push("Alt");
  if (ev.shiftKey) parts.push("Shift");
  let k = ev.key;
  if (k === " ") k = "Space";
  else if (k.length === 1) k = k.toUpperCase();
  if (["Control", "Shift", "Alt", "Meta"].includes(k)) return parts.join("+");
  parts.push(k);
  return parts.join("+");
}

// ---------------------------------------------------------------------------
// Input routing (canvas pointer + keyboard)
// ---------------------------------------------------------------------------
// handler: { name, cursor?, modal?,
//   onPointerDown(ev, ctx), onPointerMove(ev, ctx), onPointerUp(ev, ctx),
//   onDoubleClick(ev, ctx), onContextMenu(ev, ctx), onKeyDown(ev), onCancel() }
// Each method returns true when it consumed the event. Dispatch runs from the top of the
// stack down; a handler with modal:true stops the fall-through.
export class InputStack {
  constructor(app) { this.app = app; this.stack = []; }
  push(h) { this.stack.push(h); this.app.emit("input", { top: this.top() }); return () => this.remove(h); }
  remove(h) {
    const i = this.stack.lastIndexOf(h);
    if (i >= 0) { this.stack.splice(i, 1); this.app.emit("input", { top: this.top() }); }
  }
  top() { return this.stack[this.stack.length - 1] || null; }
  dispatch(method, ev, ctx) {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const h = this.stack[i];
      if (typeof h[method] === "function") {
        let r;
        // A throwing tool must not take the canvas down with it: report it and treat the event as consumed.
        try { r = h[method](ev, ctx); } catch (e) {
          if (this.app && this.app.reportError) this.app.reportError(e, { where: h.name || "tool" }); else console.error(e);
          return true;
        }
        if (r === true) return true;
      }
      if (h.modal) return false;
    }
    return false;
  }
  cursor() {
    for (let i = this.stack.length - 1; i >= 0; i--) if (this.stack[i].cursor) return this.stack[i].cursor;
    return "default";
  }
}

// ---------------------------------------------------------------------------
// Undo / redo: whole-document snapshots
// ---------------------------------------------------------------------------
export class History {
  constructor(app) { this.app = app; this.undoStack = []; this.redoStack = []; }
  push(label, before) {
    this.undoStack.push({ label, doc: before });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.app.emit("history", {});
  }
  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  undo() {
    const e = this.undoStack.pop();
    if (!e) return;
    this.redoStack.push({ label: e.label, doc: clone(this.app.doc) });
    this.app._replaceDoc(e.doc);
    this.app.toast(`Undo: ${e.label}`, "info", 1200);
  }
  redo() {
    const e = this.redoStack.pop();
    if (!e) return;
    this.undoStack.push({ label: e.label, doc: clone(this.app.doc) });
    this.app._replaceDoc(e.doc);
    this.app.toast(`Redo: ${e.label}`, "info", 1200);
  }
}

export const clone = (o) => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

export const DEFAULT_APPEARANCES = {
  "steel-satin": { name: "Steel - Satin", color: "#b9bdc2", metalness: 0.35, roughness: 0.45 },
  "aluminum": { name: "Aluminum - Satin", color: "#c9ccd0", metalness: 0.4, roughness: 0.4 },
  "plastic-white": { name: "Plastic - Matte (White)", color: "#f2f2f2", metalness: 0, roughness: 0.7 },
  "plastic-black": { name: "Plastic - Matte (Black)", color: "#2a2a2a", metalness: 0, roughness: 0.7 },
  "glass": { name: "Glass - Clear", color: "#cfe6f0", metalness: 0, roughness: 0.05, opacity: 0.35 },
};

// Feature types that create a body when their operation is new/join.
const BODY_MAKERS = new Set(["extrude", "revolve", "loft", "sweep", "box", "cylinder", "sphere", "torus"]);

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export class App extends EventTarget {
  constructor(dom = {}) {
    super();
    this.M = M; this.K = K; this.S = S; this.E = E;
    this.dom = dom; // host elements: appbar, toolbar, workspace, canvasHost, browserHost, viewcubeHost, navbarHost, dialogHost, paletteHost, timeline, overlay
    this.doc = M.newDoc("Untitled");
    this.doc.units = "mm";
    this.evaluator = new M.Evaluator();
    this.result = null; // last evaluation {state, results, params, ms}
    this.previewing = false; // true while the visible result is a command preview
    this.selection = new Selection(this);
    this.commands = new CommandRegistry(this);
    this.input = new InputStack(this);
    this.history = new History(this);
    this.featureEditors = {}; // type -> (app, featureId) => void
    this.appearances = clone(DEFAULT_APPEARANCES); // id -> {name, color, metalness, roughness, opacity?}; inspect module extends
    this.ui = {}; // modules publish their public objects here (app.ui.toolbar, app.ui.dialog, ...)
    this.viewport = null; // set by the viewport module
    this.mode = "model"; // 'model' | 'sketch'
    this.activeSketch = null; // feature id while in the sketch environment
    this.activeCommand = null; // {id, cancel(), ok()} while a command dialog is open
    this.dirty = false;
    this.status = ""; // bottom-right canvas status text (Fusion: "1 Profile | Area : 800.00 mm^2", "Edge", "Body1")
    this._installKeyboard();
  }

  /**
   * Offer a file to the user. Inside a claude.ai artifact the sandbox blocks <a download>, so the
   * artifact "downloads" capability is used when present; otherwise a normal browser download.
   * data: Blob | string | Uint8Array. Returns a Promise<boolean> (false if declined/failed).
   */
  async download(filename, data, mime = "application/octet-stream") {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    try {
      const c = typeof window !== "undefined" && window.claude && typeof window.claude.use === "function" ? window.claude : null;
      if (c) {
        const dl = await Promise.race([c.use("downloads"), new Promise((r) => setTimeout(() => r(null), 3000))]);
        if (dl && typeof dl.save === "function") {
          await dl.save({ filename, data: blob });
          return true;
        }
      }
    } catch (e) {
      console.warn("artifact download failed, falling back", e);
    }
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return true;
    } catch (e) {
      this.toast(`Could not save ${filename}: ${e.message || e}`, "error");
      return false;
    }
  }

  /** Set the bottom-right status text (empty string clears it). Emits 'status' {text}. */
  setStatus(text = "") {
    text = String(text || "");
    if (text === this.status) return;
    this.status = text;
    this.emit("status", { text });
  }

  // ----- events -----
  on(type, fn) {
    const h = (e) => fn(e.detail || {});
    this.addEventListener(type, h);
    return () => this.removeEventListener(type, h);
  }
  emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  // ----- document access -----
  feature(id) { return this.doc.features.find((f) => f.id === id) || null; }
  featureIndex(id) { return this.doc.features.findIndex((f) => f.id === id); }
  /** Bodies alive in the current result: [{id, shape, meta}] */
  bodies() {
    if (!this.result) return [];
    return [...this.result.state.bodies.values()].map((b) => ({ id: b.id, shape: b.shape, meta: this.bodyMeta(b.id) }));
  }
  body(id) { const b = this.result && this.result.state.bodies.get(id); return b ? { id, shape: b.shape, meta: this.bodyMeta(id) } : null; }
  bodyMeta(id) {
    if (!this.doc.bodies[id] && this.previewing && this._previewMeta && this._previewMeta[id]) return this._previewMeta[id];
    if (!this.doc.bodies[id]) {
      this.doc.counters.body = (this.doc.counters.body || 0) + 1;
      this.doc.bodies[id] = { name: `Body${this.doc.counters.body}`, visible: true, appearance: "steel-satin", material: "steel" };
    }
    return this.doc.bodies[id];
  }
  /** Solved sketch state from the last result: {id, plane, sk, regions, status} or null */
  sketchState(id) { return (this.result && this.result.state.sketches.get(id)) || null; }
  planeState(id) { return (this.result && this.result.state.planes.get(id)) || null; }
  featureResult(id) { return (this.result && this.result.results[id]) || null; }
  param(name) { return this.result ? this.result.params.value(name) : undefined; }

  // ----- evaluation -----
  recompute() {
    let r;
    try {
      r = this.evaluator.run(this.doc);
    } catch (e) {
      console.error(e);
      this.evaluator.invalidate();
      r = this.evaluator.run(this.doc);
    }
    this.result = r;
    this.previewing = false;
    for (const id of r.state.bodies.keys()) this.bodyMeta(id);
    this.emit("model", { result: r, preview: false });
    return r;
  }

  /**
   * Evaluate the document with a tentative feature and show it (live preview).
   * opts.replaceId: id of an existing feature being edited (it is replaced in place and
   * the timeline is evaluated up to and including it).
   * Returns {result, feature} where feature is the prepared copy (ids/params assigned) and
   * result.results[feature.id] holds {ok, error?, tool?}.
   */
  preview(f, opts = {}) {
    const doc = clone(this.doc);
    const nf = clone(f);
    let upto;
    if (opts.replaceId) {
      const i = doc.features.findIndex((x) => x.id === opts.replaceId);
      nf.id = opts.replaceId;
      prepareFeature(doc, nf);
      doc.features[i] = nf;
      upto = i + 1;
    } else {
      prepareFeature(doc, nf);
      doc.features.splice(doc.marker, 0, nf);
      upto = doc.marker + 1;
    }
    let r;
    try {
      r = this.evaluator.run(doc, { upto });
    } catch (e) {
      console.error(e);
      this.evaluator.invalidate();
      r = this.evaluator.run(doc, { upto });
    }
    this.result = r;
    this.previewing = true;
    // Bodies that exist only in the preview get transient metadata (never written into app.doc,
    // so a cancelled preview leaves no phantom body and body numbering stays in step with commit).
    this._previewMeta = {};
    for (const id of r.state.bodies.keys()) if (!this.doc.bodies[id]) this._previewMeta[id] = clone(doc.bodies[id] || { name: "Body", visible: true, appearance: "steel-satin", material: "steel" });
    this.emit("model", { result: r, preview: true, feature: nf });
    return { result: r, feature: nf };
  }
  /** Drop any preview and show the committed document again. */
  endPreview() { if (this.previewing) this.recompute(); }

  /** Apply a change to the document as one undoable step. fn(doc) may return a value. */
  mutate(label, fn, opts = {}) {
    const before = clone(this.doc);
    let ret;
    try {
      ret = fn(this.doc);
    } catch (e) {
      this.doc = before;
      throw e;
    }
    this.history.push(label, before);
    this.dirty = true;
    this.emit("doc", { label });
    if (opts.recompute !== false) this.recompute();
    return ret;
  }

  /** Insert a feature at the marker (assigns id, name, parameters, body ids). Returns the stored feature. */
  addFeature(f, label) {
    return this.mutate(label || `Create ${M.TYPE_LABEL[f.type] || f.type}`, (doc) => {
      const nf = clone(f);
      prepareFeature(doc, nf);
      doc.features.splice(doc.marker, 0, nf);
      doc.marker += 1;
      return nf;
    });
  }
  /** Replace fields of an existing feature (used by Edit Feature OK). */
  updateFeature(id, patch, label) {
    return this.mutate(label || "Edit Feature", (doc) => {
      const f = doc.features.find((x) => x.id === id);
      if (!f) throw new Error("Feature not found");
      Object.assign(f, clone(patch));
      prepareFeature(doc, f);
      return f;
    });
  }
  deleteFeature(id) {
    return this.mutate("Delete", (doc) => {
      const i = doc.features.findIndex((x) => x.id === id);
      if (i < 0) return;
      doc.features.splice(i, 1);
      if (doc.marker > i) doc.marker -= 1;
    });
  }
  setMarker(n) {
    n = Math.max(0, Math.min(this.doc.features.length, n));
    if (n === this.doc.marker) return;
    this.mutate("Move Timeline Marker", (doc) => { doc.marker = n; });
  }
  editFeature(id) {
    const f = this.feature(id);
    if (!f) return;
    const ed = this.featureEditors[f.type];
    if (!ed) { this.toast(`Editing ${M.TYPE_LABEL[f.type] || f.type} is not available yet`, "info"); return; }
    this.emit("command-start", { id: `edit:${f.type}` });
    ed(this, id);
  }

  /** Swap in a whole document (open file, undo/redo). */
  _replaceDoc(doc) {
    this.doc = doc;
    this.selection.clear();
    this.emit("doc", { replaced: true });
    this.recompute();
  }
  newDocument(name = "Untitled") {
    const d = M.newDoc(name);
    d.units = "mm";
    this.history.undoStack = [];
    this.history.redoStack = [];
    this.evaluator.invalidate();
    this.dirty = false;
    this._replaceDoc(d);
    this.emit("history", {});
  }
  loadDocument(doc) {
    this.history.undoStack = [];
    this.history.redoStack = [];
    this.evaluator.invalidate();
    this.dirty = false;
    this._replaceDoc(doc);
    this.emit("history", {});
  }

  // ----- modes -----
  setMode(mode, sketchId = null) {
    this.mode = mode;
    this.activeSketch = mode === "sketch" ? sketchId : null;
    this.emit("mode", { mode, sketch: this.activeSketch });
  }

  // ----- keyboard -----
  _installKeyboard() {
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", (ev) => {
      const t = ev.target;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (typing && ev.key !== "Escape") return;
      if (this.input.dispatch("onKeyDown", ev)) { ev.preventDefault(); return; }
      if (ev.key === "Escape") {
        if (this.input.dispatch("onCancel", ev)) { ev.preventDefault(); return; }
        if (this.activeCommand) { this.activeCommand.cancel(); ev.preventDefault(); return; }
        this.selection.clear();
        return;
      }
      if (typing) return;
      const key = keyString(ev);
      const d = this.commands.forShortcut(key, this.mode);
      if (d) {
        ev.preventDefault();
        this.commands.run(d.id, { viaShortcut: true });
      }
    });
  }

  // ----- small UI services -----
  /**
   * Report an unexpected error without taking the UI down: logs it (unless the browser already
   * did, opts.logged) and shows a de-duplicated, rate-limited error toast. Used by the global safety
   * net in main.js (window error / unhandledrejection) and by input dispatch. opts.where = context.
   */
  reportError(err, opts = {}) {
    if (!opts.logged) console.error(opts.where ? `[${opts.where}]` : "[unexpected error]", err);
    let raw = err && err.message ? String(err.message) : String(err ?? "unknown error");
    if (/table index|unreachable|memory access|^\d+$|WebAssembly\.Exception|^\[object /i.test(raw)) raw = "the geometry kernel hit an internal error";
    if (raw.length > 140) raw = `${raw.slice(0, 137)}…`;
    const msg = opts.where ? `${opts.where}: ${raw}` : raw;
    const now = Date.now();
    this._errLog = (this._errLog || []).filter((x) => now - x.at < 10000);
    if (this._errLog.some((x) => x.msg === msg) || this._errLog.length >= 3) return;
    this._errLog.push({ msg, at: now });
    this.toast(`Something went wrong (${msg}). The app is still running: press Esc to reset the current tool, Ctrl+Z to undo.`, "error", 7000);
  }

  toast(msg, kind = "info", ms = 2800) {
    const host = this.dom.overlay || (typeof document !== "undefined" ? document.body : null);
    if (!host) { console.log(`[${kind}] ${msg}`); return; }
    let box = host.querySelector(".toast-stack");
    if (!box) { box = document.createElement("div"); box.className = "toast-stack"; host.appendChild(box); }
    const el = document.createElement("div");
    el.className = `toast toast-${kind}`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, ms);
  }
}

/** Assign id, name, model parameters and result body ids to a new/edited feature. */
export function prepareFeature(doc, f) {
  doc.counters.feature = doc.counters.feature || 0;
  if (!f.id) { doc.counters.feature += 1; f.id = `f${doc.counters.feature}`; }
  if (!f.name) f.name = M.nextName(doc, f.type);
  M.assignParams(doc, f);
  const op = f.operation || "new";
  if (BODY_MAKERS.has(f.type) && (op === "new" || op === "join" || op === "newComponent") && !f.newBody) f.newBody = M.nextBody(doc);
  if (f.type === "mirror" && f.operation !== "join" && (!f.newBodies || f.newBodies.length < (f.bodies || []).length)) {
    f.newBodies = (f.bodies || []).map((_, i) => (f.newBodies && f.newBodies[i]) || M.nextBody(doc));
  }
  if (f.type === "move" && f.copy && (!f.newBodies || f.newBodies.length < (f.bodies || []).length)) {
    f.newBodies = (f.bodies || []).map((_, i) => (f.newBodies && f.newBodies[i]) || M.nextBody(doc));
  }
  return f;
}
