// Command dialog framework (app.ui.dialog). See README.md in this folder for the API.
// Look: Fusion's docked command panel (light theme): "− TITLE ... »" header, label / control
// columns, faint control frames, (i) + OK / Cancel footer. On the canvas: block-arrow manipulators
// and one HUD value box that has focus with its text selected, so typing a value + Enter works.
import * as THREE from "three";
import { refKey, clone, prepareFeature } from "../../app/core.js";
import * as M from "../../model.js";
import { identifiers } from "../../expr.js";
import { g } from "./glyphs.js";
import { Manipulators } from "./manip.js";
import { SelectionOverlay } from "./highlight.js";
import { fmt, withUnit, remapRef } from "./util.js";

const OVERLAY_KINDS = new Set(["face", "edge"]);
const GEOM_KINDS = new Set(["face", "edge", "vertex"]);
const KIND_ALIAS = { caxis: "originAxis", cpoint: "originPoint" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function div(cls, html) { const d = document.createElement("div"); if (cls) d.className = cls; if (html !== undefined) d.innerHTML = html; return d; }

/** Turn raw kernel failures into a Fusion-like message with a hint for the feature type. */
export function friendlyError(msg, f) {
  let m = String(msg || "");
  if (!m || /WebAssembly\.Exception|^\[object |RuntimeError|table index|unreachable|^\d+$/i.test(m)) m = "The geometry kernel could not compute this feature";
  if (/could not compute this feature/.test(m)) {
    const hint = { fillet: "Try a smaller radius or fewer edges.", chamfer: "Try a smaller distance.", shell: "Try a smaller thickness.", extrude: "Check the distance and taper angle.", revolve: "Check that the axis does not cross the profile.", hole: "Check the hole size and depth.", draft: "Try a smaller angle." }[f && f.type];
    return `Compute failed: ${m}.${hint ? " " + hint : ""}`;
  }
  return m;
}

export function createFramework(app) {
  const fw = { current: null, offset: null };
  const api = {
    /** Open a command dialog (closes any open one). Returns the Dialog. */
    open(spec) { return new Dialog(app, fw, spec); },
    get current() { return fw.current; },
    isOpen(id) { return !!fw.current && (!id || fw.current.id === id); },
    ok() { return fw.current ? fw.current.ok() : false; },
    cancel() { if (fw.current) fw.current.cancel(); },
    fmt,
    withUnit,
    glyph: g,
  };
  app.on("command-start", () => { if (fw.current && !fw.current._opening) fw.current.cancel(); });
  app.on("doc", (d) => {
    const c = fw.current;
    if (!c || c._committing) return;
    if (d.replaced) c.cancel();
    else c.docChanged();
  });
  app.on("mode", (d) => { if (d.mode === "sketch" && fw.current) fw.current.cancel(); });
  return api;
}

export class Dialog {
  constructor(app, fw, spec) {
    this.app = app;
    this.fw = fw;
    this.spec = spec;
    this.id = spec.id;
    this.editId = spec.editId || null;
    this.title = spec.title || spec.id;
    this.closed = false;
    this._opening = true;
    if (fw.current) fw.current.cancel();
    fw.current = this;

    this.defs = {};
    this.selIds = [];
    this.order = [];
    this._collect(spec.rows || []);
    this.values = {};
    for (const id of this.order) {
      const d = this.defs[id];
      if (d.type === "group" || d.type === "custom" || d.type === "text") continue;
      let v = d.default;
      if (typeof v === "function") v = v(this);
      if (v === undefined) v = d.type === "selection" ? [] : d.type === "check" ? false : d.type === "value" ? (d.kind === "angle" ? "0.0 deg" : d.kind === "none" ? "1" : "0.00 mm") : (d.options && d.options[0] ? d.options[0].value : "");
      this.values[id] = d.type === "selection" ? [...v] : v;
    }
    Object.assign(this.values, clone(spec.values || {}));
    this.touched = new Set(spec.touched || []);
    this.orig = this.editId ? clone(app.feature(this.editId)) : null;
    this.feature = null;
    this.previewRes = null;
    this.active = null;
    this._params = null;
    this.baseState = this._computeBase();
    if (spec.init) { try { spec.init(this); } catch (e) { console.error(e); } }

    this.manips = new Manipulators(app, this);
    this.overlay = new SelectionOverlay(app);
    this._prevFilter = app.selection.filter;
    this._buildDom();
    this._inputOff = app.input.push(this._handler());
    this._offSel = app.on("selection", () => this._externalSelection());
    app.activeCommand = { id: this.id, ok: () => this.ok(), cancel: () => this.cancel(), dialog: this };

    if (spec.preselect && spec.preselect.length) this.applyPreselection(spec.preselect);
    if (spec.onOpen) { try { spec.onOpen(this); } catch (e) { console.error(e); } }
    const firstEmpty = this.selIds.find((id) => this._visible(id) && (this.values[id] || []).length < (this.defs[id].min ?? 1));
    const act = typeof spec.activate === "function" ? spec.activate(this) : spec.activate;
    this.activate(act === false ? null : act || firstEmpty || this.selIds.find((id) => this._visible(id)) || null);
    for (const r of Object.values(this.rowEls)) r.update();
    this.refresh();
    this._opening = false;
    this.previewNow();
    app.emit("dialog", { open: true, id: this.id, edit: !!this.editId });
  }

  // ---------------------------------------------------------------- rows
  _collect(rows, parent = null) {
    for (const r of rows) {
      if (!r || !r.id) continue;
      this.defs[r.id] = { ...r, parent };
      this.order.push(r.id);
      if (r.type === "selection") this.selIds.push(r.id);
      if (r.type === "group") this._collect(r.rows || [], r.id);
    }
  }
  _visible(id) {
    const d = this.defs[id];
    if (!d) return false;
    if (d.parent && !this._visible(d.parent)) return false;
    try { return d.visible ? !!d.visible(this.values, this) : true; } catch { return true; }
  }
  _enabled(id) {
    const d = this.defs[id];
    try { return d.enabled ? !!d.enabled(this.values, this) : true; } catch { return true; }
  }

  /** Model parameters of the committed document (for validating expressions). */
  params() {
    if (!this._params) { try { this._params = M.buildParams(this.app.doc); } catch { this._params = null; } }
    return this._params;
  }
  /** Evaluate a value row: {ok, value, error}. */
  evalValue(id, expr, kindOverride) {
    const d = this.defs[id] || {};
    const src = expr !== undefined ? expr : this.values[id];
    try {
      const P = this.params();
      // editing a feature: its own parameters (d1 = this distance ...) would make a cycle
      if (P && this.editId) {
        for (const n of identifiers(src)) {
          const e = P.get(n);
          if (e && e.owner === this.editId) throw new Error(`Circular reference: ${n} is this feature's own parameter`);
        }
      }
      const v = P ? P.eval(src, kindOverride || d.kind || "length") : Number.parseFloat(src);
      if (!Number.isFinite(v)) throw new Error("Invalid value");
      if (d.positive && !(v > 0)) throw new Error("Value must be greater than zero");
      if (d.nonNegative && v < 0) throw new Error("Value must not be negative");
      if (d.min !== undefined && v < d.min) throw new Error(`Value must be at least ${d.min}`);
      if (d.max !== undefined && v > d.max) throw new Error(`Value must be at most ${d.max}`);
      if (d.integer && Math.abs(v - Math.round(v)) > 1e-9) throw new Error("Value must be a whole number");
      return { ok: true, value: v };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }
  /** Numeric value of a value row (NaN when invalid). */
  num(id) { const r = this.evalValue(id); return r.ok ? r.value : NaN; }
  /** A typed string with the row's default unit appended to a bare number. */
  withUnitFor(id, s) { const d = this.defs[id] || {}; return withUnit(s, d.kind || "length"); }
  fmt(v, kind) { return fmt(v, kind); }

  get(id) { return this.values[id]; }

  /** Set a non-selection value. opts: {user, fromInput, noPreview, delay, throttle} */
  set(id, v, opts = {}) {
    const d = this.defs[id];
    if (d && d.type === "selection") return this.setSelection(id, v, opts);
    if (this.values[id] === v && !opts.force) return;
    this.values[id] = v;
    if (opts.user) this.touched.add(id);
    const re = this.rowEls && this.rowEls[id];
    if (re) re.update(opts.fromInput);
    this._changed(id, opts);
  }

  setSelection(id, refs, opts = {}) {
    const d = this.defs[id];
    if (!d) return;
    const seen = new Set();
    const list = [];
    for (const r of refs || []) { if (!r) continue; const k = refKey(r); if (seen.has(k)) continue; seen.add(k); list.push(r); }
    this.values[id] = list;
    if (opts.user !== false) this.touched.add(id);
    const re = this.rowEls && this.rowEls[id];
    if (re) re.update();
    this._syncSelection();
    if (!this._opening && !this.closed) this._updateOrigin();
    this._changed(id, { ...opts, delay: opts.delay ?? 10 });
  }

  _changed(id, opts = {}) {
    if (this.spec.onChange) { try { this.spec.onChange(id, this, opts); } catch (e) { console.error(e); } }
    if (this._opening || this.closed) return;
    this.refresh();
    if (!opts.noPreview) this.schedulePreview(opts.delay ?? (opts.fromInput ? 220 : 40), opts.throttle);
  }

  /** Distribute refs over the selection rows that accept them (preselection). */
  applyPreselection(refs) {
    for (const r0 of refs) {
      for (const id of this.selIds) {
        const d = this.defs[id];
        if (!this._visible(id)) continue;
        const r = GEOM_KINDS.has(r0.kind) ? remapRef(r0, this.baseState) : r0;
        if (!r || !this._accepts(d, r)) continue;
        const cur = this.values[id] || [];
        if (d.max && cur.length >= d.max) continue;
        let add = d.mapRef ? d.mapRef(r, this) : r;
        if (!add) continue;
        this.values[id] = [...cur, ...(Array.isArray(add) ? add : [add])];
        this.touched.add(id);
        if (this.spec.onChange) { try { this.spec.onChange(id, this, { preselect: true }); } catch (e) { console.error(e); } }
        break;
      }
    }
    this._syncSelection();
  }

  _accepts(d, ref) {
    // construction axes / points (solidx) count wherever origin axes / points are accepted
    const alias = ref && KIND_ALIAS[ref.kind];
    if (!d || !ref || !((d.kinds || []).includes(ref.kind) || (alias && (d.kinds || []).includes(alias)))) return false;
    if (ref.kind === "face" && d.planar && ref.planar === false) return false;
    if (GEOM_KINDS.has(ref.kind) || ref.kind === "body") {
      // body only exists in the preview; mesh-like bodies only where the row allows them (meshBodies: true)
      const mesh = d.meshBodies && ref.kind === "body" && this.baseState.meshBodies && this.baseState.meshBodies.has(ref.body);
      if (!this.baseState.bodies.has(ref.body) && !mesh) return false;
    }
    if (d.filter) { try { if (!d.filter(ref, this)) return false; } catch { return false; } }
    return true;
  }

  /** Make a selection row the active one (it drives app.selection.filter). */
  activate(id) {
    if (this.closed) return;
    this.active = id && this.defs[id] ? id : null;
    for (const sid of this.selIds) { const re = this.rowEls[sid]; if (re) re.update(); }
    const d = this.active && this.defs[this.active];
    this.app.selection.filter = d ? (ref) => this._accepts(d, ref) : () => false;
    this._updateOrigin();
    this._updatePrompt();
  }

  /** Show the origin planes/axes while the active selection row wants them and is still empty. */
  _updateOrigin() {
    const d = this.active && this.defs[this.active];
    const wants = !!d && (d.kinds || []).some((k) => k === "originPlane" || k === "originAxis" || k === "originPoint");
    this._setOrigin(!!this.spec.showOrigin || (wants && !(this.values[this.active] || []).length));
  }

  _setOrigin(on) {
    const vp = this.app.viewport;
    if (!vp || typeof vp.setOriginVisible !== "function") return;
    if (on && !this._originOn) { this._originOn = true; try { vp.setOriginVisible(true); } catch { /* ignore */ } }
    else if (!on && this._originOn) { this._originOn = false; try { vp.setOriginVisible(false); } catch { /* ignore */ } }
  }

  /** Canvas click with a hit while a selection row is active. */
  pickRef(id, ref0) {
    const d = this.defs[id];
    if (!d) return;
    let ref = GEOM_KINDS.has(ref0.kind) ? remapRef(ref0, this.baseState) : ref0;
    if (!ref || !this._accepts(d, ref)) return;
    let adds = d.mapRef ? d.mapRef(ref, this) : ref;
    if (!adds) return;
    adds = Array.isArray(adds) ? adds : [adds];
    let list = [...(this.values[id] || [])];
    const has = (r) => list.some((x) => refKey(x) === refKey(r));
    if (d.max === 1) {
      if (d.toggle !== false && adds.length === 1 && has(adds[0])) list = [];
      else list = [adds[adds.length - 1]];
    } else if (adds.length === 1 && has(adds[0])) {
      if (d.toggle !== false) list = list.filter((x) => refKey(x) !== refKey(adds[0]));
    } else {
      // a group pick (e.g. all edges of a face): add the missing ones, or remove them all if all present
      if (adds.every(has)) list = list.filter((x) => !adds.some((a) => refKey(a) === refKey(x)));
      else for (const a of adds) if (!has(a)) list.push(a);
      if (d.max) list = list.slice(-d.max);
    }
    this.setSelection(id, list);
    if (!this.closed && d.max === 1 && list.length === 1 && d.advance !== false) this._advanceFrom(id);
  }

  _advanceFrom(id) {
    const i = this.selIds.indexOf(id);
    for (let k = i + 1; k < this.selIds.length; k++) {
      const sid = this.selIds[k];
      if (this._visible(sid) && (this.values[sid] || []).length < (this.defs[sid].min ?? 1)) { this.activate(sid); return; }
    }
  }

  /** Items selected elsewhere (browser tree, timeline) while the dialog is open go to the selection rows. */
  _externalSelection() {
    if (this._syncing || this.closed || this._opening || this._inExternal) return;
    const mine = new Set();
    for (const id of this.selIds) for (const r of this.values[id] || []) mine.add(refKey(r));
    const added = this.app.selection.items.filter((r) => !mine.has(refKey(r)));
    this._inExternal = true;
    try {
      for (const r of added) {
        const rows = this.active ? [this.active, ...this.selIds.filter((x) => x !== this.active)] : this.selIds;
        const row = rows.find((id) => this._visible(id) && this._accepts(this.defs[id], GEOM_KINDS.has(r.kind) ? remapRef(r, this.baseState) || r : r));
        if (row) this.pickRef(row, r);
      }
    } finally { this._inExternal = false; }
    this._syncSelection();
  }

  _syncSelection() {
    const all = [];
    for (const id of this.selIds) if (this._visible(id)) all.push(...(this.values[id] || []));
    const stable = all.filter((r) => !OVERLAY_KINDS.has(r.kind));
    const sel = this.app.selection;
    const same = stable.length === sel.items.length && stable.every((r, i) => refKey(r) === refKey(sel.items[i]));
    if (!same) { this._syncing = true; try { sel.set(stable); } finally { this._syncing = false; } }
    this.overlay.set(all.filter((r) => OVERLAY_KINDS.has(r.kind)), this.baseState);
  }

  // ---------------------------------------------------------------- evaluation
  _computeBase() {
    const app = this.app;
    try {
      const upto = this.editId ? Math.max(0, app.featureIndex(this.editId)) : app.doc.marker;
      return app.evaluator.run(app.doc, { upto }).state;
    } catch (e) {
      console.error(e);
      return app.result ? app.result.state : { bodies: new Map(), sketches: new Map(), planes: new Map() };
    }
  }

  docChanged() {
    this._params = null;
    this.baseState = this._computeBase();
    this.schedulePreview(30);
  }

  schedulePreview(delay = 60, throttle = false) {
    if (this.closed || this._opening) return;
    if (throttle && this._pt) return;
    clearTimeout(this._pt);
    this._pt = setTimeout(() => { this._pt = null; this.previewNow(); }, delay);
  }

  _inputsValid() {
    for (const id of this.order) {
      const d = this.defs[id];
      if (d.type !== "value" || !this._visible(id) || !this._enabled(id)) continue;
      if (!this.evalValue(id).ok) return false;
    }
    return true;
  }
  _selectionsSatisfied() {
    for (const id of this.selIds) {
      if (!this._visible(id)) continue;
      const d = this.defs[id];
      if ((this.values[id] || []).length < (d.min ?? 1)) return false;
    }
    return true;
  }

  _showBase() {
    const app = this.app;
    if (this.editId && this.orig) {
      try { app.preview({ ...this.orig, suppressed: true }, { replaceId: this.editId }); return; } catch (e) { console.error(e); }
    }
    app.endPreview();
  }

  previewNow() {
    clearTimeout(this._pt);
    this._pt = null;
    if (this.closed) return;
    const app = this.app, vp = app.viewport;
    let f = null, err = null;
    this.buildError = null;
    const valid = this._inputsValid();
    if (!valid && this.previewRes && this.previewRes.ok !== false && this.feature && this._selectionsSatisfied()) {
      // an expression is mid-edit / invalid: keep showing the last good preview (no flicker)
      this._updateManips();
      this._updateOK();
      this._updateStatus();
      return;
    }
    if (valid) {
      try { f = this.spec.build ? this.spec.build(this.values, this) : null; } catch (e) { err = e.message || String(e); }
    }
    this.feature = f || null;
    this.buildError = err;
    this._previewedOnce = true;
    if (!f || this.spec.preview === false) {
      this.previewRes = null;
      this.previewFeature = null;
      this._setXray(null);
      if (this.spec.preview !== false || this.editId) this._showBase();
      try { vp && vp.clearPreview && vp.clearPreview(); } catch { /* ignore */ }
      this._setMsg(err ? { kind: "error", text: err } : null);
    } else {
      let r = null;
      try { r = app.preview(f, { replaceId: this.editId || undefined }); } catch (e) { console.error(e); err = e.message; }
      const res = r ? r.result.results[r.feature.id] : null;
      this.previewRes = res || (err ? { ok: false, error: err } : null);
      this.previewFeature = r ? r.feature : null;
      if (this.previewRes && this.previewRes.ok === false) this._setMsg({ kind: "error", text: friendlyError(this.previewRes.error, f) });
      else if (res && res.warning) this._setMsg({ kind: "warning", text: res.warning });
      else this._setMsg(null);
      const items = [];
      const xray = this.spec.toolPreview === "xray";
      let xrayTool = null;
      if (res && res.ok !== false && res.tool && this.spec.showTool !== false) {
        const op = f.operation;
        if (xray) xrayTool = res.tool;
        else if (op === "cut" || f.type === "hole") items.push({ shape: res.tool, color: "cut", opacity: 0.32 });
        else if (op === "intersect") items.push({ shape: res.tool, color: "#e8862e", opacity: 0.25 });
      }
      if (this.spec.extraPreview) { try { items.push(...(this.spec.extraPreview(this, res) || [])); } catch (e) { console.error(e); } }
      try { vp && vp.setPreview && vp.setPreview(items); } catch (e) { console.error(e); }
      // Fusion's hole preview: the body stays whole and the tool is drawn red, seen through the body
      if (xray && xrayTool) this._showBase();
      this._setXray(xrayTool);
    }
    try { app.selection.setHover(null); } catch { /* ignore */ }
    this._syncSelection();
    this._updateManips();
    this._updateOK();
    this._updateStatus();
    if (this.spec.afterPreview) { try { this.spec.afterPreview(this); } catch (e) { console.error(e); } }
    this._maybeFocusHud();
  }

  /** Red see-through tool body drawn over the model (hole preview). */
  _setXray(shape) {
    const vp = this.app.viewport;
    if (this._xray) {
      if (this._xray.shape === shape) return;
      this._xray.mesh.parent && this._xray.mesh.parent.remove(this._xray.mesh);
      this._xray.mesh.geometry.dispose();
      this._xray.mesh.material.dispose();
      this._xray = null;
    }
    if (!shape || !vp || !vp.groups || !vp.groups.overlay) { if (vp) vp.requestRender(); return; }
    let md = null;
    try { md = this.app.K.meshBody(shape, 50); } catch (e) { console.error(e); }
    if (!md) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(md.vertices, 3));
    geo.setIndex(new THREE.BufferAttribute(md.triangles, 1));
    const n = md.normals, cols = new Float32Array(n.length);
    const L = [0.35, -0.45, 0.82];
    const base = [0.86, 0.2, 0.17];
    for (let i = 0; i < n.length; i += 3) {
      const k = 0.62 + 0.38 * Math.abs(n[i] * L[0] + n[i + 1] * L[1] + n[i + 2] * L[2]);
      cols[i] = Math.min(1, base[0] * k + 0.08); cols[i + 1] = base[1] * k + 0.05; cols[i + 2] = base[2] * k + 0.05;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 900;
    mesh.userData.noPick = true;
    vp.groups.overlay.add(mesh);
    this._xray = { shape, mesh };
    vp.requestRender();
  }

  _updateManips() {
    let defs = [];
    if (this.spec.manipulators) { try { defs = this.spec.manipulators(this) || []; } catch (e) { console.error(e); } }
    this.manips.set(defs);
    if (!this.manips.size) this._hudFocused = false;
  }

  /**
   * Fusion puts the keyboard focus in the on-canvas value box (text selected) as soon as a
   * manipulator appears, so "E, 10, Enter" works without touching the mouse. Done once per
   * appearance and never while the user is typing in another field.
   */
  _maybeFocusHud() {
    if (this.spec.focusHud === false || this.closed || this._opening || this._hudFocused || !this.manips.size) return;
    const ae = document.activeElement;
    const busy = ae && ae !== document.body && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable) && !ae.classList.contains("dlg-manip-input");
    if (busy) return;
    if (this.manips.focusActive()) this._hudFocused = true;
  }

  /**
   * Helper for distance manipulators bound to a value row.
   * opts: {origin, dir, scale=1, sign=1, min, max, id, fixedDir, hudAnchor}
   */
  valueManip(field, opts) {
    const d = this.defs[field] || {};
    const val = this._manipValue(field);
    if (!Number.isFinite(val) || !opts.origin || !opts.dir) return null;
    const sign = opts.sign ?? 1;
    const kind = d.kind || "length";
    return {
      id: opts.id || field,
      type: "distance",
      origin: opts.origin,
      dir: opts.dir,
      value: val * sign,
      scale: opts.scale ?? 1,
      min: opts.min,
      max: opts.max,
      fixedDir: opts.fixedDir,
      hudAnchor: opts.hudAnchor,
      text: this.values[field],
      field,
      kind,
      onDrag: (v, final) => {
        const txt = fmt(v * sign, kind);
        this.set(field, txt, { user: true, delay: final ? 0 : 40, throttle: !final });
        if (final) this.previewNow();
        return txt;
      },
      onText: (s, final) => {
        if (final) s = withUnit(s, kind);
        this.set(field, s, { user: true, delay: final ? 0 : 250 });
      },
    };
  }

  /** Current value of a row for manipulators: the last valid value while the text is mid-edit. */
  _manipValue(field) {
    this._lastGood = this._lastGood || {};
    const r = this.evalValue(field);
    if (r.ok) this._lastGood[field] = r.value;
    return r.ok ? r.value : this._lastGood[field];
  }

  /** Angle manipulator bound to a value row (revolve). opts: {center, axis, ref, radius, min, max, sign} */
  angleManip(field, opts) {
    const val = this._manipValue(field);
    if (!Number.isFinite(val) || !opts.center || !opts.axis || !opts.ref) return null;
    const sign = opts.sign ?? 1;
    return {
      id: opts.id || field,
      field,
      kind: "angle",
      type: "angle",
      center: opts.center, axis: opts.axis, ref: opts.ref, radius: opts.radius,
      value: val * sign,
      min: opts.min, max: opts.max, step: opts.step || 1,
      hudAnchor: opts.hudAnchor,
      text: this.values[field],
      onDrag: (v, final) => {
        const txt = fmt(v * sign, "angle");
        this.set(field, txt, { user: true, delay: final ? 0 : 60, throttle: !final });
        if (final) this.previewNow();
        return txt;
      },
      onText: (s, final) => {
        if (final) s = withUnit(s, "angle");
        this.set(field, s, { user: true, delay: final ? 0 : 250 });
      },
    };
  }

  /** Taper-angle manipulator: screen-sized arc + grip around `center` in the plane of `up` and `side`. */
  taperManip(field, opts) {
    const val = this._manipValue(field);
    if (!Number.isFinite(val) || !opts.center || !opts.up || !opts.side) return null;
    const m = this.angleManip(field, { center: opts.center, axis: [0, 0, 1], ref: [1, 0, 0], radius: 1, min: opts.min ?? -89, max: opts.max ?? 89, id: opts.id, hudAnchor: opts.hudAnchor });
    if (!m) return null;
    return { ...m, type: "taper", up: opts.up, side: opts.side };
  }

  canOK() {
    if (this.closed) return false;
    if (!this._selectionsSatisfied() || !this._inputsValid()) return false;
    if (this.spec.validate) { try { if (this.spec.validate(this)) return false; } catch { return false; } }
    if (this.spec.noFeature) return true;
    if (!this.feature) return false;
    if (this.spec.preview !== false && this.previewRes && this.previewRes.ok === false) return false;
    return true;
  }

  _updateOK() {
    if (!this.okBtn) return;
    const dis = !this.canOK();
    this.okBtn.disabled = dis;
    if (this.footEl) this.footEl.classList.toggle("ok-disabled", dis);
  }

  /** Bottom-right status text of the canvas (Fusion: "1 Profile | Area : 800.00 mm^2", "Edge"). */
  _updateStatus() {
    if (this.closed || typeof this.app.setStatus !== "function") return;
    let t = "";
    if (this.spec.status) { try { t = this.spec.status(this) || ""; } catch { t = ""; } }
    this.app.setStatus(t);
  }

  // ---------------------------------------------------------------- commit / close
  ok() {
    if (this.closed) return false;
    const ae = document.activeElement;
    if (ae && (this.el.contains(ae) || ae.classList.contains("dlg-manip-input")) && ae.tagName === "INPUT" && ae.type !== "checkbox") ae.dispatchEvent(new Event("change"));
    if (this._pt || !this._previewedOnce) this.previewNow();
    if (!this.canOK()) {
      this.el.classList.remove("dlg-shake");
      void this.el.offsetWidth;
      this.el.classList.add("dlg-shake");
      if (!this.msgEl.textContent) {
        const missing = this.selIds.find((id) => this._visible(id) && (this.values[id] || []).length < (this.defs[id].min ?? 1));
        if (missing) this._setMsg({ kind: "warning", text: this.defs[missing].prompt || `Select ${this.defs[missing].label}` });
        else if (!this._inputsValid()) this._setMsg({ kind: "warning", text: "Check the highlighted inputs" });
      }
      return false;
    }
    this._committing = true;
    let out;
    try {
      out = this.spec.commit ? this.spec.commit(this.feature, this) : this.commitFeature(this.feature);
    } catch (e) {
      console.error(e);
      this._committing = false;
      this.app.toast(`${this.title}: ${e.message || e}`, "error");
      return false;
    }
    this._committing = false;
    this.close(true);
    if (this.spec.afterCommit) { try { this.spec.afterCommit(out, this); } catch (e) { console.error(e); } }
    return true;
  }

  /**
   * Insert the feature at the marker (or replace the edited feature) as one undoable step.
   * opts.hideSketches: sketch feature ids to hide (consumed profiles), opts.label.
   */
  commitFeature(f, opts = {}) {
    const app = this.app;
    const editId = this.editId;
    const label = opts.label || (editId ? `Edit ${this.spec.featureLabel || this.title}` : this.spec.featureLabel || this.title);
    const hide = opts.hideSketches || [];
    return app.mutate(label, (doc) => {
      let nf;
      if (editId) {
        const old = doc.features.find((x) => x.id === editId);
        if (!old) throw new Error("The feature no longer exists");
        // occ / newOcc / newComp: the component the feature belongs to and the one its New Component operation made
        const keep = { id: old.id, name: old.name, p: old.p, newBody: old.newBody, newBodies: old.newBodies, suppressed: old.suppressed, visible: old.visible, occ: old.occ, newOcc: old.newOcc, newComp: old.newComp };
        for (const k of Object.keys(old)) delete old[k];
        Object.assign(old, clone(f));
        for (const [k, v] of Object.entries(keep)) if (v !== undefined) old[k] = v;
        prepareFeature(doc, old);
        nf = old;
      } else {
        nf = clone(f);
        prepareFeature(doc, nf);
        doc.features.splice(doc.marker, 0, nf);
        doc.marker += 1;
      }
      for (const sid of hide) {
        const s = doc.features.find((x) => x.id === sid);
        if (s && s.type === "sketch" && doc.features.indexOf(s) < doc.features.indexOf(nf)) s.visible = false;
      }
      return nf;
    });
  }

  cancel() {
    if (this.closed) return;
    if (this.spec.onCancel) { try { this.spec.onCancel(this); } catch (e) { console.error(e); } }
    this.close(false);
  }

  close(committed = false) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this._pt);
    this._closeMenu();
    const app = this.app;
    try { this.manips.dispose(); } catch (e) { console.error(e); }
    try { this._setXray(null); } catch (e) { console.error(e); }
    try { this.overlay.dispose(); } catch (e) { console.error(e); }
    if (this._inputOff) this._inputOff();
    if (this._offSel) this._offSel();
    if (this._offs) for (const off of this._offs) off();
    this.el.remove();
    if (this.promptEl) this.promptEl.remove();
    app.selection.filter = this._prevFilter || null;
    try { app.viewport && app.viewport.clearPreview && app.viewport.clearPreview(); } catch { /* ignore */ }
    if (!committed) app.endPreview();
    this._setOrigin(false);
    app.selection.clear();
    app.selection.setHover(null);
    try { if (typeof app.setStatus === "function") app.setStatus(""); } catch { /* ignore */ }
    if (app.activeCommand && app.activeCommand.dialog === this) app.activeCommand = null;
    if (this.fw.current === this) this.fw.current = null;
    app.emit("dialog", { open: false, id: this.id, ok: committed });
    if (this.spec.onClose) { try { this.spec.onClose(this, committed); } catch (e) { console.error(e); } }
  }

  // ---------------------------------------------------------------- input handler
  _handler() {
    const self = this;
    const app = this.app;
    return {
      name: `dialog:${this.id}`,
      onPointerDown(ev, ctx) {
        if (ctx.button !== 0) return false;
        if (self.manips.down(ev, ctx)) return true;
        if (self.spec.onCanvasDown) { try { if (self.spec.onCanvasDown(ctx, self)) return true; } catch (e) { console.error(e); } }
        const h = ctx.hit;
        if (h && self.active) self.pickRef(self.active, h.ref);
        return true;
      },
      onPointerMove(ev, ctx) {
        self._promptAt(ctx.x, ctx.y);
        if (self.manips.move(ev, ctx)) { app.selection.setHover(null); return true; }
        if (self.spec.onCanvasMove) { try { if (self.spec.onCanvasMove(ctx, self)) return true; } catch (e) { console.error(e); } }
        return false;
      },
      onPointerUp(ev, ctx) { self.manips.up(ev, ctx); return true; },
      onDoubleClick() { return true; },
      onKeyDown(ev) {
        if (ev.key === "Enter") { self.ok(); return true; }
        if (ev.key === "Tab" && self.manips.size) { self.manips.cycle(ev.shiftKey ? -1 : 1, true); return true; }
        if (/^[-0-9.+(]$/.test(ev.key) && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
          const box = self.manips.activeBox();
          if (box) { self.manips.focusActive(); box.value = ev.key; box.setSelectionRange(1, 1); box.dispatchEvent(new Event("input")); return true; }
        }
        return false;
      },
    };
  }

  // ---------------------------------------------------------------- DOM
  _buildDom() {
    const app = this.app;
    const host = app.dom.dialogHost || document.body;
    const el = div("dlg");
    el.dataset.dialog = this.id;
    if (this.editId) el.dataset.edit = this.editId;
    if (this.spec.labelWidth) el.style.setProperty("--dlg-label-w", `${this.spec.labelWidth}px`);
    if (this.spec.ctrlWidth) el.style.setProperty("--dlg-ctl-w", `${this.spec.ctrlWidth}px`);
    const head = div("dlg-head");
    const titleText = this.editId ? "Edit Feature" : this.title;
    head.innerHTML = `<button type="button" class="dlg-hbtn dlg-min" title="Minimize">${g("minus")}</button><span class="dlg-title">${esc(titleText).toUpperCase()}</span><span class="dlg-sp"></span><button type="button" class="dlg-hbtn dlg-hide" title="Collapse">${g("dockHide")}</button>`;
    el.appendChild(head);
    const body = div("dlg-body");
    el.appendChild(body);
    this.msgEl = div("dlg-msg");
    el.appendChild(this.msgEl);
    const foot = div("dlg-foot");
    foot.innerHTML = `<button type="button" class="dlg-hbtn dlg-info" title="${esc(this.spec.help || this.title)}">${g("infoFilled")}</button><span class="dlg-sp"></span><button type="button" class="dlg-btn dlg-ok" data-action="ok">OK</button><button type="button" class="dlg-btn dlg-cancel" data-action="cancel">Cancel</button>`;
    el.appendChild(foot);
    this.footEl = foot;
    this.okBtn = foot.querySelector("[data-action=ok]");
    this.okBtn.addEventListener("click", () => this.ok());
    foot.querySelector("[data-action=cancel]").addEventListener("click", () => this.cancel());
    const minBtn = head.querySelector(".dlg-min");
    minBtn.addEventListener("click", () => {
      el.classList.toggle("collapsed");
      minBtn.innerHTML = g(el.classList.contains("collapsed") ? "plus" : "minus");
      minBtn.title = el.classList.contains("collapsed") ? "Expand" : "Minimize";
      app.emit("layout", {});
    });
    const hideBtn = head.querySelector(".dlg-hide");
    hideBtn.addEventListener("click", () => {
      el.classList.toggle("hidden-panel");
      const hid = el.classList.contains("hidden-panel");
      hideBtn.innerHTML = g(hid ? "dockShow" : "dockHide");
      hideBtn.title = hid ? "Expand" : "Collapse";
      app.emit("layout", {});
    });
    // drag the header to undock the panel (it then floats with a frame); double-click docks it again
    head.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      const o = this.fw.offset || { x: 0, y: 0 };
      const st = { x: e.clientX, y: e.clientY, ox: o.x, oy: o.y, moved: false };
      head.setPointerCapture(e.pointerId);
      const mv = (m) => {
        const dx = m.clientX - st.x, dy = m.clientY - st.y;
        if (!st.moved && Math.hypot(dx, dy) < 5) return;
        st.moved = true;
        let x = st.ox + dx, y = st.oy + dy;
        const hr = host.getBoundingClientRect(), w = el.offsetWidth;
        x = Math.min(Math.max(x, -(hr.right - w)), window.innerWidth - hr.right);
        y = Math.min(Math.max(y, -hr.top), window.innerHeight - hr.top - 40);
        this.fw.offset = { x, y };
        el.classList.add("floating");
        el.style.transform = `translate(${x}px, ${y}px)`;
      };
      const upf = () => { head.removeEventListener("pointermove", mv); head.removeEventListener("pointerup", upf); };
      head.addEventListener("pointermove", mv);
      head.addEventListener("pointerup", upf);
    });
    head.addEventListener("dblclick", (e) => { if (e.target.closest("button")) return; this.fw.offset = null; el.style.transform = ""; el.classList.remove("floating"); });
    if (this.fw.offset) { el.classList.add("floating"); el.style.transform = `translate(${this.fw.offset.x}px, ${this.fw.offset.y}px)`; }
    // no canvas / marking-menu context menu over the dialog
    el.addEventListener("contextmenu", (e) => { if (e.target.tagName !== "INPUT") e.preventDefault(); e.stopPropagation(); });
    // keys handled by a focused dropdown / button must not also reach the global shortcut handler
    // (where Enter = OK); Enter on a focused non-input control triggers that control only.
    el.addEventListener("keydown", (e) => {
      const t = e.target;
      if (!t || t.tagName === "INPUT") return;
      if (["Enter", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && t.closest(".dlg-dd, button")) e.stopPropagation();
    });

    this.rowEls = {};
    this.el = el;
    this.bodyEl = body;
    for (const r of this.spec.rows || []) this._buildRow(this.defs[r.id], body);
    host.appendChild(el);
    this._fitHeight();

    const ll = app.viewport && app.viewport.labelLayer;
    if (ll) {
      this.promptEl = div("dlg-prompt");
      this.promptEl.style.display = "none";
      ll.appendChild(this.promptEl);
      const c = app.viewport.canvas;
      const leave = () => { if (this.promptEl) this.promptEl.style.display = "none"; };
      c.addEventListener("pointerleave", leave);
      this._offs = [() => c.removeEventListener("pointerleave", leave)];
    }
    const onResize = () => this._fitHeight();
    window.addEventListener("resize", onResize);
    (this._offs = this._offs || []).push(() => window.removeEventListener("resize", onResize));
  }

  /** Keep the panel above the bottom of the canvas (the rows scroll, like Fusion's). */
  _fitHeight() {
    const ws = this.app.dom.workspace || (this.el && this.el.parentElement && this.el.parentElement.parentElement);
    const host = this.app.dom.dialogHost;
    if (!ws || !host || !this.el) return;
    const top = host.offsetTop || 0;
    const avail = (ws.clientHeight || window.innerHeight) - top - 36;
    this.el.style.maxHeight = `${Math.max(160, avail)}px`;
  }

  /** Label column: widest visible label (Fusion sizes its form layout to the labels). */
  _layoutColumns() {
    if (this.spec.labelWidth || !this.el) return;
    let w = 0;
    for (const lab of this.el.querySelectorAll(".dlg-body > .dlg-row > .dlg-label, .dlg-body > .dlg-group:not(.own-cols) .dlg-row > .dlg-label")) {
      if (!lab.offsetParent) continue;
      w = Math.max(w, lab.scrollWidth);
    }
    if (!w) return;
    const lw = Math.max(64, Math.ceil(w) + 5);
    if (this._lw !== lw) { this._lw = lw; this.el.style.setProperty("--dlg-label-w", `${lw}px`); }
  }

  _buildRow(d, parent) {
    if (!d) return;
    if (d.type === "value" && d.embed) return; // rendered by a custom row through embedInput()
    if (d.type === "group") {
      const gEl = div("dlg-group" + (d.collapsed ? " collapsed" : "") + (d.sep ? " sep" : "") + (d.labelWidth ? " own-cols" : ""));
      gEl.dataset.group = d.id;
      const head = div("dlg-group-head", `<span class="dlg-caret">${g("groupCaret")}</span><span class="dlg-group-label">${esc(d.label)}</span>`);
      head.addEventListener("click", () => { gEl.classList.toggle("collapsed"); this._layoutColumns(); });
      const body = div("dlg-group-body");
      if (d.labelWidth) body.style.setProperty("--dlg-label-w", `${d.labelWidth}px`);
      if (d.ctrlWidth) body.style.setProperty("--dlg-ctl-w", `${d.ctrlWidth}px`);
      if (d.labelClip) body.style.setProperty("--dlg-label-clip", `${d.labelClip}px`);
      gEl.append(head, body);
      parent.appendChild(gEl);
      this.rowEls[d.id] = { row: gEl, head, def: d, update() {} };
      for (const r of d.rows || []) this._buildRow(this.defs[r.id], body);
      return;
    }
    const row = div("dlg-row dlg-row-" + d.type + (d.sep ? " sep" : ""));
    row.dataset.row = d.id;
    if (d.space) row.style.marginTop = `${d.space}px`;
    let lab = null;
    if (d.label !== undefined && d.type !== "custom") {
      lab = div("dlg-label");
      lab.textContent = d.label;
      if (d.tooltip) lab.title = d.tooltip;
      else lab.title = d.label;
      row.appendChild(lab);
    }
    const ctl = div("dlg-ctl");
    row.appendChild(ctl);
    parent.appendChild(row);
    const re = { row, ctl, def: d, label: lab, update() {} };
    this.rowEls[d.id] = re;
    const id = d.id;
    switch (d.type) {
      case "selection": {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "dlg-sel";
        b.dataset.input = id;
        if (d.tooltip) b.title = d.tooltip;
        b.innerHTML = `<span class="dlg-sel-arrow">${g("selCursor")}</span><span class="dlg-sel-text">Select</span>`;
        b.addEventListener("click", () => this.activate(id));
        const x = document.createElement("button");
        x.type = "button";
        x.className = "dlg-sel-x";
        x.title = "Clear selection";
        x.innerHTML = g("clear");
        x.addEventListener("click", () => { this.setSelection(id, []); this.activate(id); });
        ctl.append(b, x);
        re.update = () => {
          const n = (this.values[id] || []).length;
          let txt = n ? `${n} selected` : "Select";
          if (d.selText) { try { txt = d.selText(n, this); } catch { /* keep */ } }
          b.querySelector(".dlg-sel-text").textContent = txt;
          b.classList.toggle("active", this.active === id);
          b.classList.toggle("has", n > 0);
          x.classList.toggle("has", n > 0 && d.clearButton !== false);
          b.dataset.count = String(n);
        };
        break;
      }
      case "value": {
        const inp = this._valueInput(d, "dlg-input");
        ctl.appendChild(inp);
        re.input = inp;
        re.update = (fromInput) => this._updateValueInput(inp, d, fromInput);
        break;
      }
      case "dropdown": {
        const dd = div("dlg-dd" + (d.noCaret ? " no-caret" : ""));
        dd.tabIndex = 0;
        dd.dataset.input = id;
        if (d.tooltip) dd.title = d.tooltip;
        dd.innerHTML = `<span class="dlg-dd-icon"></span><span class="dlg-dd-text"></span><span class="dlg-dd-caret">${g("ddCaret")}</span>`;
        Object.defineProperty(dd, "value", { get: () => this.values[id], set: (v) => this.set(id, v, { user: true }) });
        dd.addEventListener("click", () => { if (!dd.classList.contains("disabled")) this._openMenu(d, dd); });
        dd.addEventListener("keydown", (e) => {
          const opts = (d.options || []).filter((o) => !o.disabled);
          const i = opts.findIndex((o) => o.value === this.values[id]);
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const n = opts[(i + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length];
            if (n) this.set(id, n.value, { user: true });
          } else if (e.key === " " || e.key === "Enter") { e.preventDefault(); this._openMenu(d, dd); }
        });
        ctl.appendChild(dd);
        re.update = () => {
          const o = (d.options || []).find((x) => x.value === this.values[id]) || {};
          const ic = dd.querySelector(".dlg-dd-icon");
          ic.innerHTML = o.icon ? g(o.icon) : "";
          ic.style.display = o.icon ? "" : "none";
          dd.querySelector(".dlg-dd-text").textContent = o.label || String(this.values[id] ?? "");
          dd.dataset.value = String(this.values[id] ?? "");
        };
        break;
      }
      case "buttons": {
        const bg = div("dlg-bg");
        bg.dataset.input = id;
        Object.defineProperty(bg, "value", { get: () => this.values[id], set: (v) => this.set(id, v, { user: true }) });
        for (const o of d.options || []) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "dlg-bg-btn" + (o.icon ? "" : " text");
          b.dataset.option = o.value;
          b.title = o.disabled ? `${o.label} (not available in this recreation)` : o.label;
          b.innerHTML = o.icon ? g(o.icon, d.iconSize || 18) : esc(o.label);
          // options this recreation does not implement look like Fusion's but explain themselves
          if (o.disabled) b.classList.add("na");
          b.setAttribute("aria-disabled", o.disabled ? "true" : "false");
          b.addEventListener("click", () => {
            if (o.disabled) { this.app.toast(`${o.label} is not available in this recreation`, "info", 2200); return; }
            this.set(id, o.value, { user: true });
          });
          bg.appendChild(b);
        }
        ctl.appendChild(bg);
        re.update = () => {
          for (const b of bg.children) b.classList.toggle("on", b.dataset.option === String(this.values[id]));
          bg.dataset.value = String(this.values[id] ?? "");
        };
        break;
      }
      case "check": {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "dlg-check";
        cb.dataset.input = id;
        cb.addEventListener("change", () => this.set(id, cb.checked, { user: true }));
        ctl.appendChild(cb);
        re.input = cb;
        re.update = () => { cb.checked = !!this.values[id]; };
        break;
      }
      case "custom": {
        let c = null;
        try { c = d.render ? d.render(this) : null; } catch (e) { console.error(e); }
        if (c) ctl.appendChild(c);
        row.classList.add("dlg-row-full");
        if (d.flush) row.classList.add("flush");
        re.update = () => { if (d.update && c) { try { d.update(c, this); } catch (e) { console.error(e); } } };
        break;
      }
      case "text": {
        const t = div("dlg-text");
        ctl.appendChild(t);
        re.update = () => { try { t.textContent = d.text ? d.text(this) : ""; } catch { t.textContent = ""; } };
        break;
      }
      default: break;
    }
    if (d.extra) { try { const x = d.extra(this, re); if (x) ctl.appendChild(x); } catch (e) { console.error(e); } }
  }

  /** An <input> wired to a value row (used by value rows and by embedded inputs in custom rows). */
  _valueInput(d, cls) {
    const id = d.id;
    const inp = document.createElement("input");
    inp.className = cls;
    inp.dataset.input = id;
    inp.spellcheck = false;
    inp.autocomplete = "off";
    if (d.tooltip) inp.title = d.tooltip;
    inp.addEventListener("input", () => this.set(id, inp.value, { user: true, fromInput: true }));
    inp.addEventListener("change", () => {
      const v = withUnit(inp.value, d.kind || "length");
      if (v !== inp.value) inp.value = v;
      this.set(id, v, { user: true, fromInput: true, delay: 0, force: true });
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        inp.dispatchEvent(new Event("change"));
        this.ok();
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const r = this.evalValue(id);
        if (!r.ok) return;
        e.preventDefault();
        const step = d.step ?? 1;
        const v = r.value + (e.key === "ArrowUp" ? step : -step);
        this.set(id, fmt(v, d.kind || "length"), { user: true });
        inp.select();
      }
    });
    // select-all happens synchronously on focus (a deferred select would swallow fast typing);
    // the first click into an unfocused field keeps that selection instead of placing the caret
    inp.addEventListener("mousedown", (e) => { if (document.activeElement !== inp && !inp.disabled) { e.preventDefault(); inp.focus(); } });
    inp.addEventListener("focus", () => { try { inp.select(); } catch { /* ignore */ } });
    return inp;
  }

  _updateValueInput(inp, d, fromInput) {
    const id = d.id;
    if (!fromInput && inp.value !== (this.values[id] ?? "")) inp.value = this.values[id] ?? "";
    const r = this.evalValue(id);
    inp.classList.toggle("invalid", !r.ok);
    inp.title = r.ok ? (d.tooltip || "") : r.error;
  }

  /**
   * The input of an embedded value row ({type:'value', embed:true}) for custom rows (fillet table,
   * hole diagram callouts). Created once; visibility follows the row's visible().
   */
  embedInput(id, cls = "dlg-input") {
    const re0 = this.rowEls && this.rowEls[id];
    if (re0 && re0.input) return re0.input;
    const d = this.defs[id];
    if (!d) return null;
    const inp = this._valueInput(d, cls);
    const re = { row: inp, input: inp, def: d, label: null, embedded: true, update: (fromInput) => this._updateValueInput(inp, d, fromInput) };
    this.rowEls[id] = re;
    re.update();
    return inp;
  }

  refresh() {
    if (!this.rowEls || this.closed) return;
    for (const id of this.order) {
      const re = this.rowEls[id];
      if (!re) continue;
      const vis = this._visible(id);
      re.row.style.display = vis ? "" : "none";
      const en = this._enabled(id);
      if (!re.embedded) re.row.classList.toggle("disabled", !en);
      if (re.input) re.input.disabled = !en;
      const d = this.defs[id];
      if (d.type === "custom" || d.type === "text") re.update();
      if (d.labelFn && re.label) { try { re.label.textContent = d.labelFn(this.values, this); } catch { /* ignore */ } }
      if (d.type === "group" && d.header && re.head) { let h = true; try { h = !!d.header(this.values, this); } catch { /* ignore */ } re.row.classList.toggle("headless", !h); }
    }
    if (this.active && !this._visible(this.active)) {
      const n = this.selIds.find((sid) => this._visible(sid) && (this.values[sid] || []).length < (this.defs[sid].min ?? 1)) || this.selIds.find((sid) => this._visible(sid));
      this.activate(n || null);
    }
    this._layoutColumns();
    this._updateOK();
    this._updatePrompt();
  }

  /** Generic popup menu next to an anchor element. items: [{label, icon, disabled, current, run}] */
  openMenu(anchor, items, opts = {}) {
    this._closeMenu();
    const host = this.app.dom.overlay || document.body;
    const menu = div("dlg-dd-menu");
    if (opts.id) menu.dataset.menu = opts.id;
    for (const o of items) {
      const it = div("dlg-dd-item" + (o.disabled ? " disabled" : "") + (o.current ? " current" : ""));
      if (o.value !== undefined) it.dataset.option = o.value;
      it.innerHTML = `${opts.icons === false ? "" : `<span class="dlg-dd-icon">${o.icon ? g(o.icon) : ""}</span>`}<span>${esc(o.label)}</span>`;
      if (o.disabled && o.disabledTitle !== false) it.title = o.disabledTitle || "Not available in this recreation";
      it.addEventListener("pointerdown", (e) => e.stopPropagation());
      it.addEventListener("click", (e) => {
        e.stopPropagation();
        if (o.disabled) return;
        this._closeMenu();
        if (o.run) o.run();
      });
      menu.appendChild(it);
    }
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.round(r.left)}px`;
    menu.style.top = `${Math.round(r.bottom + 1)}px`;
    if (opts.matchWidth !== false) menu.style.minWidth = `${Math.round(r.width)}px`;
    host.appendChild(menu);
    const mr = menu.getBoundingClientRect();
    if (mr.bottom > window.innerHeight - 4) menu.style.top = `${Math.round(r.top - mr.height - 1)}px`;
    if (mr.right > window.innerWidth - 4) menu.style.left = `${Math.round(window.innerWidth - 4 - mr.width)}px`;
    const away = (e) => { if (!menu.contains(e.target)) this._closeMenu(); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); this._closeMenu(); } };
    setTimeout(() => { window.addEventListener("pointerdown", away, true); window.addEventListener("keydown", key, true); }, 0);
    this._menu = { menu, off: () => { window.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", key, true); } };
    return menu;
  }

  _openMenu(d, anchor) {
    const menu = this.openMenu(anchor, (d.options || []).map((o) => ({
      label: o.label, icon: o.icon, value: o.value, disabled: o.disabled, current: o.value === this.values[d.id],
      run: () => { this.set(d.id, o.value, { user: true }); anchor.focus(); },
    })), { id: d.id, icons: (d.options || []).some((o) => o.icon) });
    return menu;
  }
  _closeMenu() {
    if (!this._menu) return;
    this._menu.off();
    this._menu.menu.remove();
    this._menu = null;
  }

  _setMsg(m) {
    if (!this.msgEl) return;
    if (!m || !m.text) { this.msgEl.className = "dlg-msg"; this.msgEl.innerHTML = ""; return; }
    this.msgEl.className = `dlg-msg show ${m.kind}`;
    this.msgEl.innerHTML = `<span class="dlg-msg-icon">${g(m.kind === "error" ? "error" : "warning")}</span><span class="dlg-msg-text">${esc(m.text)}</span>`;
  }
  /** Show a message in the dialog's message area: kind 'error' | 'warning' | 'info'. */
  message(text, kind = "warning") { this._setMsg(text ? { kind, text } : null); }

  _promptText() {
    if (this.spec.prompt) { try { const t = this.spec.prompt(this); if (t !== undefined) return t; } catch { /* ignore */ } }
    const d = this.active && this.defs[this.active];
    if (d && (this.values[this.active] || []).length < (d.min ?? 1)) return d.prompt || "";
    return "";
  }
  _updatePrompt() {
    if (!this.promptEl) return;
    const t = this._promptText();
    this.promptEl.textContent = t;
    if (!t) this.promptEl.style.display = "none";
  }
  _promptAt(x, y) {
    if (!this.promptEl) return;
    const t = this._promptText();
    if (!t || (this.manips.drag && !this.spec.promptWhileDragging)) { this.promptEl.style.display = "none"; return; }
    if (this.promptEl.textContent !== t) this.promptEl.textContent = t;
    this.promptEl.style.display = "";
    this.promptEl.style.left = `${Math.round(x + 6)}px`;
    this.promptEl.style.top = `${Math.round(y + 26)}px`;
  }
}
