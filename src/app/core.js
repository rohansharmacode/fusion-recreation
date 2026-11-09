// App core: document + evaluation, events, selection, commands, input routing,
// undo/redo and small UI services. Every UI module talks to the rest of the app
// only through this object (see ARCHITECTURE.md for the contract).
import * as M from "../model.js";
import * as K from "../kernel.js";
import * as S from "../sketch/sketch.js";
import * as E from "../expr.js";
import { installComponents } from "./components.js";

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
// {kind:'occurrence', occ}                          a component occurrence ('root' = the root component)
// {kind:'meshFace', body, tri, group, p, n}         triangle `tri` of a mesh body; group = its face group
//                                                   (-1 / undefined when the mesh has none). Two meshFace refs of
//                                                   the same group are the same selection unless triOnly:true.
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
    case "meshFace": return r.group != null && r.group >= 0 && !r.triOnly ? `mfg:${r.body}:${r.group}` : `mf:${r.body}:${r.tri}`;
    case "occurrence": return `occ:${r.occ}`;
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
    // commands of a contextual environment (when: 'form', 'basefeature' ...) only run inside it;
    // 'model' / 'sketch' keep their own enabled() rules (sketch tools start a sketch from the model)
    if (d.when && d.when !== "model" && d.when !== "sketch" && !d.stub && !this.app.inMode(d.when)) return false;
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
    const ws = this.app.workspace || DESIGN_WORKSPACE;
    for (const d of this.defs.values()) {
      const sc = Array.isArray(d.shortcut) ? d.shortcut : d.shortcut ? [d.shortcut] : [];
      if (!sc.includes(key)) continue;
      // outside the Design workspace only that workspace's commands and application-wide ui/view commands answer keys
      if (ws !== DESIGN_WORKSPACE && d.workspace !== ws && (d.workspace || d.kind === "feature" || d.kind === "tool")) continue;
      if (ws === DESIGN_WORKSPACE && d.workspace && d.workspace !== ws) continue;
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

// Feature types that create a body when their operation is new/join (registered types: def.makesBodies, M.assignBodies).
const BODY_MAKERS = new Set(["extrude", "revolve", "loft", "sweep", "box", "cylinder", "sphere", "torus"]);

// Workspaces in the order of Fusion's workspace switcher (DESIGN ▾) for a part design. Modules register
// real ones with app.registerWorkspace({id, ...}); the others show a placeholder.
export const DESIGN_WORKSPACE = "FusionSolidEnvironment";
export const WORKSPACE_ORDER = [
  { id: "FusionSolidEnvironment", label: "Design" },
  { id: "GenerativeEnvironment", label: "Generative Design" },
  { id: "FusionRenderEnvironment", label: "Render" },
  { id: "Publisher3DEnvironment", label: "Animation" },
  { id: "SimulationEnvironment", label: "Simulation" },
  { id: "CAMEnvironment", label: "Manufacture" },
  { id: "FusionDocumentationEnvironment", label: "Drawing" },
];

// Built-in look of body kinds (modules extend / override with app.registerBodyKind).
const BUILTIN_BODY_KINDS = {
  solid: { label: "Body", brep: true },
  surface: { label: "Surface Body", brep: true },
  mesh: { label: "Mesh Body", brep: false },
  tspline: { label: "T-Spline Body", brep: false },
};

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
    // Insert Mesh features (type 'mesh', Fusion's mesh base feature) reopen the Insert Mesh dialog
    this.featureEditors.mesh = (app, id) => app.commands.run("ParaMeshInsertAlignCommand", { editId: id });
    this.appearances = clone(DEFAULT_APPEARANCES); // id -> {name, color, metalness, roughness, opacity?}; inspect module extends
    this.ui = {}; // modules publish their public objects here (app.ui.toolbar, app.ui.dialog, ...)
    this.viewport = null; // set by the viewport module
    this.mode = "model"; // 'model' | 'sketch'
    this.activeSketch = null; // feature id while in the sketch environment
    this.activeCommand = null; // {id, cancel(), ok()} while a command dialog is open
    this.dirty = false;
    this.status = ""; // bottom-right canvas status text (Fusion: "1 Profile | Area : 800.00 mm^2", "Edge", "Body1")
    this.bodyKinds = clone(BUILTIN_BODY_KINDS); // kind -> hooks (see registerBodyKind)
    this._envStack = []; // contextual environments (enterEnvironment), innermost last
    this._workspaces = new Map(); // id -> registered workspace def
    this.workspace = DESIGN_WORKSPACE;
    this._workspaces.set(DESIGN_WORKSPACE, { id: DESIGN_WORKSPACE, label: "Design", builtin: true });
    // Edit Feature entries of registered feature types (app.featureEditors[type] set by a module wins)
    this._offFeatureReg = M.onFeatureRegistered((type) => this.emit("feature-types", { type }));
    this._prepareFeature = prepareFeature;
    this.components = installComponents(this); // components, occurrences, positions (src/app/components.js)
    this._installKeyboard();
  }

  // ----- feature types (registry in model.js) -----
  /** Edit Feature entry for a feature type: app.featureEditors[type], else the registered def.editor. */
  featureEditor(type) {
    if (this.featureEditors[type]) return this.featureEditors[type];
    const d = M.featureDef(type);
    return d && typeof d.editor === "function" ? d.editor : null;
  }
  hasFeatureEditor(type) { return !!this.featureEditor(type); }
  /** Label of a feature type ("Extrude", "Rib" ...). */
  featureLabel(type) { const d = M.featureDef(type); return (d && d.label) || M.TYPE_LABEL[type] || type; }

  // ----- body kinds -----
  /**
   * Register / extend how a body kind is shown and handled (merged into app.bodyKinds[kind]):
   *   { label: "T-Spline Body",              browser tooltip / status text
   *     icon: "<svg ...>",                   browser row icon (16 px markup; default per kind)
   *     brep: false,                         true = OCCT shape in st.bodies, false = st.meshBodies entry
   *     mesh(body, app) -> {positions, indices?, normals?, groups?}   triangles to draw / pick (default body.mesh)
   *     render(body, app) -> THREE.Object3D | null   extra scene objects (cage, control points), rebuilt with the body
   *     pick(body, x, y, ray, opts) -> hits[]   extra pick hits (same format as viewport pick providers)
   *     edges: 'groups' | 'sharp' | 'none'   which mesh edges to draw (default 'groups': open + face-group borders)
   *     info(body) -> {volume?, area?, triangles?}   Properties / BOM numbers
   *     exportSTL: true }                   included in STL export (mesh-like kinds)
   */
  registerBodyKind(kind, hooks = {}) {
    if (!kind) throw new Error("registerBodyKind needs a kind");
    this.bodyKinds[kind] = { ...(this.bodyKinds[kind] || { label: `${kind} Body`, brep: false }), ...hooks };
    this.emit("body-kinds", { kind });
    if (this.result && !this.previewing) this.emit("model", { result: this.result, preview: false });
    return this.bodyKinds[kind];
  }
  /** Kind of body `id` in the visible result ('solid' | 'surface' | 'mesh' | 'tspline' | ...), or null. */
  bodyKind(id) { return this.result ? M.bodyKind(this.result.state, id) : null; }
  /** Every body alive in the visible result, any kind: [{id, kind, shape?, mesh?, data?, meta}] (B-rep first). */
  allBodies() {
    if (!this.result) return [];
    const st = this.result.state;
    const out = [];
    for (const b of st.bodies.values()) out.push({ id: b.id, kind: b.kind || M.shapeKind(b.shape) || "solid", shape: b.shape, sheetMetal: b.sheetMetal, meta: this.bodyMeta(b.id) });
    if (st.meshBodies) for (const b of st.meshBodies.values()) out.push({ id: b.id, kind: b.kind || "mesh", mesh: this.bodyMesh(b), data: b.data, entry: b, meta: this.bodyMeta(b.id) });
    return out;
  }
  /** One body of any kind ({id, kind, shape?, mesh?, data?, meta}) or null. */
  anyBody(id) {
    if (!this.result) return null;
    const st = this.result.state;
    const b = st.bodies.get(id);
    if (b) return { id, kind: b.kind || M.shapeKind(b.shape) || "solid", shape: b.shape, sheetMetal: b.sheetMetal, meta: this.bodyMeta(id) };
    const m = st.meshBodies && st.meshBodies.get(id);
    return m ? { id, kind: m.kind || "mesh", mesh: this.bodyMesh(m), data: m.data, entry: m, meta: this.bodyMeta(id) } : null;
  }
  /** Triangle mesh to display a mesh-like body entry (kind hook mesh(), else entry.mesh). */
  bodyMesh(entry) {
    const k = this.bodyKinds[entry.kind || "mesh"];
    if (k && typeof k.mesh === "function") { try { return k.mesh(entry, this) || entry.mesh || null; } catch (e) { console.error(e); } }
    return entry.mesh || null;
  }
  /** Numbers for Properties / BOM: {id, kind, name, volume (mm3), area (mm2), bbox, triangles?} or null. */
  bodyInfo(id) {
    const b = this.anyBody(id);
    if (!b) return null;
    const out = { id, kind: b.kind, name: b.meta && b.meta.name, volume: 0, area: 0, bbox: null };
    try {
      if (b.shape) {
        out.bbox = K.bboxOf(b.shape);
        out.volume = b.kind === "solid" ? K.volumeOf(b.shape) : 0;
        try { out.area = K.R.measureArea(b.shape); } catch { out.area = 0; }
      } else {
        const hook = this.bodyKinds[b.kind] && this.bodyKinds[b.kind].info;
        const extra = typeof hook === "function" ? hook(b.entry || b, this) || {} : {};
        const mesh = b.mesh;
        if (mesh) {
          out.bbox = M.meshOps.bbox(mesh);
          out.triangles = M.meshOps.triCount(mesh);
          out.area = M.meshOps.area(mesh);
          out.volume = Math.abs(M.meshOps.volume(mesh));
        }
        Object.assign(out, extra);
      }
    } catch (e) { console.warn("bodyInfo", e); }
    return out;
  }

  // ----- contextual environments -----
  /**
   * Enter a contextual environment (Fusion's FORM, BASE FEATURE, FLAT PATTERN, DIRECT EDIT ... tabs):
   *   { id, mode (app.mode while active; commands with when:<mode> become available), label,
   *     tab: tabId from spec CONTEXTUAL_TABS | {id, label, panels:[panelIds]} | [several],
   *     panels?: {panelId: {label, controls, dropdown, finish?}}   extra panel definitions,
   *     finishCommand?: command id of the green FINISH <NAME> button, finishLabel?,
   *     baseTabs?: null (all persistent tabs stay) | [] (none) | [tabIds],
   *     markingMenu?: 'TSplineEnvironment' | [{pos, id}] radial layout, shortcuts?: [ids] default S-toolbox row,
   *     feature?: featureId being edited, onExit(reason) }   reason 'finish' | 'cancel' | 'exit' | 'replaced'
   * Environments nest (a sketch inside a Form). Emits 'environment' {env, action:'enter'} and 'mode'.
   */
  enterEnvironment(spec) {
    if (!spec || !spec.id) throw new Error("enterEnvironment needs an id");
    const env = { ...spec, mode: spec.mode || spec.id, prevMode: this.mode, prevSketch: this.activeSketch, enteredAt: Date.now() };
    const i = this._envStack.findIndex((e) => e.id === spec.id);
    if (i >= 0) this.exitEnvironment(spec.id, { reason: "replaced" });
    if (this.activeCommand) { try { this.activeCommand.cancel(); } catch { /* ignore */ } }
    this._envStack.push(env);
    this.emit("environment", { env, action: "enter" });
    this._setModeRaw(env.mode, null);
    return env;
  }
  /** Leave environment `id` (and any nested inside it); onExit(reason) runs once. Returns true when it was active. */
  exitEnvironment(id, opts = {}) {
    const i = id ? this._envStack.findIndex((e) => e.id === id) : this._envStack.length - 1;
    if (i < 0) return false;
    const gone = this._envStack.splice(i);
    const env = gone[0];
    for (const e of gone.reverse()) {
      try { if (typeof e.onExit === "function") e.onExit(opts.reason || "exit", e); } catch (err) { console.error(err); }
      this.emit("environment", { env: e, action: "exit", reason: opts.reason || "exit" });
    }
    const top = this._envStack[this._envStack.length - 1];
    this._setModeRaw(top ? top.mode : (env.prevMode && env.prevMode !== env.mode && env.prevMode !== "sketch" ? env.prevMode : "model"), null);
    return true;
  }
  /** Innermost active environment: a registered one, the sketch (built-in), or null in the plain model. */
  get environment() {
    if (this.mode === "sketch") return { id: "sketch", mode: "sketch", label: "SKETCH", tab: "SketchTab", finishCommand: "SketchStop", builtin: true, sketch: this.activeSketch };
    return this._envStack[this._envStack.length - 1] || null;
  }
  get environments() { return this._envStack.slice(); }
  /** True when `mode` is the current mode or the mode of an enclosing environment. */
  inMode(mode) { return this.mode === mode || this._envStack.some((e) => e.mode === mode); }

  // ----- workspaces -----
  /**
   * Register a workspace (DESIGN ▾ switcher entry):
   *   { id: "FusionRenderEnvironment", label: "Render",
   *     tabs: [{id, label, panels:[panelIds]}], panels: {panelId: {label, controls, dropdown}},
   *     enter(app), exit(app),
   *     timeline?: false | (host, app) => dispose?   replace the bottom strip (false hides the timeline),
   *     browser?: true | false,                   show the browser (default true)
   *     canvas?: (host, app) => dispose?          optional overlay over the canvas }
   * Unregistered Fusion workspaces still appear in the switcher with a placeholder.
   */
  registerWorkspace(def) {
    if (!def || !def.id) throw new Error("registerWorkspace needs an id");
    const known = WORKSPACE_ORDER.find((w) => w.id === def.id);
    const d = { label: (known && known.label) || def.id, ...def };
    this._workspaces.set(def.id, d);
    this.emit("workspaces", { id: def.id });
    if (this.workspace === def.id) this.emit("workspace", { id: def.id, def: d, prev: def.id, refresh: true });
    return d;
  }
  /** Ordered switcher list: [{id, label, registered, def}] (Fusion's workspaces first, then other registered ones). */
  workspaceList() {
    const out = WORKSPACE_ORDER.map((w) => ({ ...w, registered: this._workspaces.has(w.id), def: this._workspaces.get(w.id) || null }));
    for (const [id, d] of this._workspaces) if (!out.some((w) => w.id === id)) out.push({ id, label: d.label || id, registered: true, def: d });
    return out;
  }
  workspaceDef(id = this.workspace) { return this._workspaces.get(id) || null; }
  /** Switch workspace (finishes the sketch / leaves environments first). Emits 'workspace' {id, prev, def}. */
  setWorkspace(id) {
    if (!id || id === this.workspace) return false;
    const entry = this.workspaceList().find((w) => w.id === id);
    if (!entry) throw new Error(`Unknown workspace ${id}`);
    if (this.activeCommand) { try { this.activeCommand.cancel(); } catch { /* ignore */ } }
    if (this.mode === "sketch") {
      const stop = this.commands.get("SketchStop");
      if (stop && !stop.stub) this.commands.run("SketchStop"); else this.setMode("model");
    }
    while (this._envStack.length) this.exitEnvironment(this._envStack[this._envStack.length - 1].id, { reason: "workspace" });
    const prev = this.workspace;
    const pd = this._workspaces.get(prev);
    try { if (pd && typeof pd.exit === "function") pd.exit(this); } catch (e) { console.error(e); }
    this.workspace = id;
    const nd = this._workspaces.get(id) || null;
    this.selection.clear();
    try { if (nd && typeof nd.enter === "function") nd.enter(this); } catch (e) { console.error(e); this.reportError(e, { where: entry.label }); }
    this.emit("workspace", { id, prev, def: nd, label: entry.label });
    return true;
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
  /** B-rep bodies (solids and surfaces, OCCT shapes) alive in the current result: [{id, shape, meta, kind}]. allBodies() adds mesh-like kinds. */
  bodies() {
    if (!this.result) return [];
    return [...this.result.state.bodies.values()].map((b) => ({ id: b.id, shape: b.shape, meta: this.bodyMeta(b.id), kind: b.kind || M.shapeKind(b.shape) || "solid" }));
  }
  body(id) { const b = this.result && this.result.state.bodies.get(id); return b ? { id, shape: b.shape, meta: this.bodyMeta(id), kind: b.kind || M.shapeKind(b.shape) || "solid" } : null; }
  bodyMeta(id) {
    if (M.isInstanceId(id)) id = M.instanceBase(id); // bodies of a pasted occurrence share their component's body data
    if (!this.doc.bodies[id] && this.previewing && this._previewMeta && this._previewMeta[id]) return this._previewMeta[id];
    if (!this.doc.bodies[id]) {
      // default names share M.nextBody's name counter (counters.bodyName), so names never repeat
      const c = this.doc.counters;
      if (c.bodyName === undefined) c.bodyName = c.body || 0;
      c.bodyName += 1;
      this.doc.bodies[id] = { name: `Body${c.bodyName}`, visible: true, appearance: "steel-satin", material: "steel" };
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
    this._syncBodyMeta(r.state, (id) => this.bodyMeta(id));
    this.emit("model", { result: r, preview: false });
    return r;
  }
  /** Mirror derived body data (kind, sheet metal) into the body metadata so the browser / files can read it. */
  _syncBodyMeta(st, metaOf) {
    for (const id of M.allBodyIds(st)) {
      const meta = metaOf(id);
      if (!meta) continue;
      const kind = M.bodyKind(st, id) || "solid";
      if (kind === "solid") { if (meta.kind && meta.kind !== "solid") delete meta.kind; } else if (meta.kind !== kind) meta.kind = kind;
      const b = st.bodies.get(id);
      const sm = b && b.sheetMetal ? (typeof b.sheetMetal === "object" ? b.sheetMetal : true) : undefined;
      if (sm) meta.sheetMetal = sm; else if (meta.sheetMetal && b) delete meta.sheetMetal;
    }
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
      // an edited feature stays in its component (and keeps the component its New Component operation made)
      const old = doc.features[i];
      if (old) for (const k of ["occ", "newOcc", "newComp"]) if (nf[k] === undefined && old[k] !== undefined) nf[k] = old[k];
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
    for (const id of M.allBodyIds(r.state)) if (!this.doc.bodies[id]) this._previewMeta[id] = clone(doc.bodies[id] || { name: "Body", visible: true, appearance: "steel-satin", material: "steel" });
    this._syncBodyMeta(r.state, (id) => this._previewMeta[id] || null);
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
    return this.mutate(label || `Create ${this.featureLabel(f.type)}`, (doc) => {
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
    const ed = this.featureEditor(f.type);
    if (!ed) { this.toast(`Editing ${this.featureLabel(f.type)} is not available yet`, "info"); return; }
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
    while (this._envStack.length) this.exitEnvironment(this._envStack[this._envStack.length - 1].id, { reason: "document" });
    this._replaceDoc(d);
    this.emit("history", {});
  }
  loadDocument(doc) {
    this.history.undoStack = [];
    this.history.redoStack = [];
    this.evaluator.invalidate();
    this.dirty = false;
    try { M.migrateDoc(doc); } catch (e) { console.warn("document migration failed", e); }
    while (this._envStack.length) this.exitEnvironment(this._envStack[this._envStack.length - 1].id, { reason: "document" });
    this._replaceDoc(doc);
    this.emit("history", {});
  }

  // ----- modes -----
  /**
   * 'model' | 'sketch' | an environment mode. Leaving the sketch ('model') inside an environment returns to
   * that environment's mode (a sketch made in the Form environment goes back to the Form).
   */
  setMode(mode, sketchId = null) {
    if (mode === "model" && this._envStack.length) mode = this._envStack[this._envStack.length - 1].mode;
    this._setModeRaw(mode, sketchId);
  }
  _setModeRaw(mode, sketchId = null) {
    this.mode = mode;
    this.activeSketch = mode === "sketch" ? sketchId : null;
    this.emit("mode", { mode, sketch: this.activeSketch, env: this.environment });
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
  if (!f.id) {
    // a new feature belongs to the active component; uncaptured component positions are captured before it
    if (f.occ === undefined && doc.activeOcc && doc.occurrences && doc.occurrences[doc.activeOcc]) f.occ = doc.activeOcc;
    if (f.type !== "snapshot" && doc.positions && Object.keys(doc.positions).length) M.capturePositions(doc);
    doc.counters.feature += 1; f.id = `f${doc.counters.feature}`;
  }
  if (!f.name) f.name = M.nextName(doc, f.type);
  M.assignParams(doc, f);
  M.assignBodies(doc, f); // registered types (def.makesBodies) and the built-in body makers
  const op = f.operation || "new";
  if (BODY_MAKERS.has(f.type) && (op === "new" || op === "join" || op === "newComponent") && !f.newBody) f.newBody = M.nextBody(doc);
  // operation New Component: the body goes into a new component (Component1:1) under the feature's component
  if (op === "newComponent" && !(f.newOcc && doc.occurrences && doc.occurrences[f.newOcc])) { const c = M.newComponentMeta(doc); f.newComp = c.comp; f.newOcc = c.occ; }
  if (f.type === "mirror" && f.operation !== "join" && (!f.newBodies || f.newBodies.length < (f.bodies || []).length)) {
    f.newBodies = (f.bodies || []).map((_, i) => (f.newBodies && f.newBodies[i]) || M.nextBody(doc));
  }
  if (f.type === "move" && f.copy && (!f.newBodies || f.newBodies.length < (f.bodies || []).length)) {
    f.newBodies = (f.bodies || []).map((_, i) => (f.newBodies && f.newBodies[i]) || M.nextBody(doc));
  }
  return f;
}
