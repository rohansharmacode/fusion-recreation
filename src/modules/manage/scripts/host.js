// Script host: runs JavaScript scripts and add-ins against the recreation's Fusion-style API
// (adsk.core / adsk.fusion), one undo step per run, with Application / UserInterface objects,
// message and input boxes, active selections, command definitions with command inputs (shown in
// the app's own command dialog), toolbar panel controls (added to the panels' dropdowns) and a
// log that the code editor shows. Scripts are compiled with new Function; hosts whose Content
// Security Policy forbids that get a clear message instead.
import { makeCore, Base, Event, ObjectCollection, ValueInput, DialogResults, MessageBoxButtonTypes, Point3D } from "./core.js";
import { createFusion, Session, ScriptError } from "./fusion.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Can this page compile code at run time? (false under a strict CSP without 'unsafe-eval') */
export function canCompile() {
  try { return new Function("return 2")() === 2; } catch { return false; }
}

/** Remove TypeScript-style module syntax the in-browser runner does not need. */
export function prepareSource(src) {
  return String(src || "")
    .replace(/^\s*import\s+[^;\n]*from\s+["']@adsk\/[^"']+["'];?[ \t]*$/gm, "")
    .replace(/^\s*import\s+["']@adsk\/[^"']+["'];?[ \t]*$/gm, "")
    .replace(/^(\s*)export\s+(async\s+)?function\s/gm, "$1$2function ")
    .replace(/^(\s*)export\s+(const|let|var)\s/gm, "$1$2 ");
}

let LINE_OFFSET = null;
function lineOffset() {
  if (LINE_OFFSET !== null) return LINE_OFFSET;
  LINE_OFFSET = 0;
  try {
    const f = new Function("adsk", "console", "exports", "module", "\"use strict\";\nthrow new Error(\"probe\");");
    f();
  } catch (e) {
    const m = /<anonymous>:(\d+):\d+/.exec(String(e && e.stack));
    if (m) LINE_OFFSET = Number(m[1]) - 1;
  }
  return LINE_OFFSET;
}
/** Script line of an error (1-based) from its stack, or null. */
export function errorLine(e) {
  const m = /<anonymous>:(\d+):(\d+)/.exec(String(e && e.stack));
  if (!m) return null;
  const n = Number(m[1]) - lineOffset();
  return n > 0 ? n : null;
}

export function createScriptHost(app) {
  const listeners = new Set();
  const logLines = []; // {t, level, text, script}
  const running = new Map(); // script id -> {rec, mod, ctx, cmdDefs:Set, controls:[]}
  const host = {
    session: null,
    get logLines() { return logLines; },
    onLog(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    isRunning: (id) => running.has(id),
    runningIds: () => [...running.keys()],
    canCompile,
    run, stop, stopAll, compile,
    lastError: null,
    document: null,
  };

  function log(text, level = "info", script = null) {
    const line = { t: Date.now(), level, text: String(text), script };
    logLines.push(line);
    if (logLines.length > 2000) logLines.splice(0, logLines.length - 2000);
    for (const fn of listeners) { try { fn(line); } catch { /* ignore */ } }
  }
  host.log = log;

  // ------------------------------------------------------------------ message boxes (queued, Fusion-styled)
  const queue = [];
  let showing = false;
  function pump() {
    if (showing || !queue.length) return;
    const m = app.ui.modals;
    const job = queue.shift();
    if (!m) { app.toast(job.text, "info", 5000); job.resolve(DialogResults.DialogOK); pump(); return; }
    const buttons = {
      [MessageBoxButtonTypes.OKButtonType]: [{ action: "ok", label: "OK", primary: true }],
      [MessageBoxButtonTypes.OKCancelButtonType]: [{ action: "ok", label: "OK", primary: true }, { action: "cancel", label: "Cancel" }],
      [MessageBoxButtonTypes.RetryCancelButtonType]: [{ action: "ok", label: "Retry", primary: true }, { action: "cancel", label: "Cancel" }],
      [MessageBoxButtonTypes.YesNoButtonType]: [{ action: "yes", label: "Yes", primary: true }, { action: "no", label: "No" }],
      [MessageBoxButtonTypes.YesNoCancelButtonType]: [{ action: "yes", label: "Yes", primary: true }, { action: "no", label: "No" }, { action: "cancel", label: "Cancel" }],
    }[job.buttons] || [{ action: "ok", label: "OK", primary: true }];
    const kind = ["info", "question", "info", "warning", "error"][job.icon] || "info";
    let shown;
    try { shown = m.confirm({ id: "ScriptMessageBox", title: job.title || "Fusion", kind, message: esc(job.text).replace(/\n/g, "<br>"), buttons, width: 440 }); } catch {
      // the modal failed: fall back to a toast so the queue keeps moving
      app.toast(job.text, "info", 5000); job.resolve(DialogResults.DialogOK); pump(); return;
    }
    showing = true;
    Promise.resolve(shown).then((a) => {
      showing = false;
      job.resolve(a === "yes" ? DialogResults.DialogYes : a === "no" ? DialogResults.DialogNo : a === "ok" ? DialogResults.DialogOK : DialogResults.DialogCancel);
      pump();
    });
  }
  function messageBoxAsync(text, title = "", buttons = 0, icon = 0) {
    return new Promise((resolve) => { queue.push({ text: String(text ?? ""), title, buttons, icon, resolve }); pump(); });
  }

  // ------------------------------------------------------------------ selections
  function makeSelections(fz) {
    return {
      get count() { return app.selection.items.length; },
      item(i) { const r = app.selection.items[i]; const e = r && fz.wrapRef(r); return e ? { entity: e, point: r.p ? new Point3D(r.p[0] / 10, r.p[1] / 10, r.p[2] / 10) : null, objectType: "adsk::core::Selection" } : null; },
      add(entity) { const r = fz.refOf(entity); if (!r) return false; app.selection.add(r); return true; },
      clear() { app.selection.clear(); return true; },
      get all() { return new ObjectCollection(app.selection.items.map((r) => fz.wrapRef(r)).filter(Boolean)); },
    };
  }
  const FILTER_KINDS = {
    Bodies: ["body"], SolidBodies: ["body"], Faces: ["face"], PlanarFaces: ["face"], CylindricalFaces: ["face"], Edges: ["edge"], LinearEdges: ["edge"], CircularEdges: ["edge"],
    Vertices: ["vertex"], SketchCurves: ["sketchCurve"], SketchLines: ["sketchCurve"], SketchCircles: ["sketchCurve"], SketchPoints: ["sketchPoint"], Profiles: ["profile"],
    ConstructionPlanes: ["originPlane", "cplane"], ConstructionLines: ["originAxis"], ConstructionPoints: ["originPoint"], Features: ["feature"], RootComponents: ["body"], Occurrences: ["body"],
  };
  const kindsFor = (filter) => [...new Set(String(filter || "").split(/[,;\s]+/).filter(Boolean).flatMap((f) => FILTER_KINDS[f] || []))];
  function refPasses(r, filter) {
    const parts = String(filter || "").split(/[,;\s]+/).filter(Boolean);
    if (!parts.length) return true;
    return parts.some((f) => {
      const ks = FILTER_KINDS[f];
      if (!ks || !ks.includes(r.kind)) return false;
      if (f === "PlanarFaces") return r.planar !== false;
      return true;
    });
  }

  // ------------------------------------------------------------------ command definitions (add-ins)
  const cmdDefs = new Map(); // id -> CommandDefinition
  class CommandDefinition extends Base {
    constructor(id, name, tooltip, owner) {
      super();
      this.id = id; this.name = name; this.tooltip = tooltip || ""; this._owner = owner;
      this.commandCreated = new Event("commandCreated");
      this.controlDefinition = { isEnabled: true, isVisible: true, name, objectType: "adsk::core::ButtonControlDefinition" };
    }
    execute() { executeDefinition(this); return true; }
    deleteMe() {
      cmdDefs.delete(this.id);
      const d = app.commands.get(this.id);
      if (d && d._scriptCmd) { app.commands.defs.delete(this.id); app.emit("commands", { id: this.id }); }
      removeControls(this.id);
      return true;
    }
  }
  CommandDefinition._t = "adsk::core::CommandDefinition";
  function makeCommandDefinitions(owner) {
    return {
      get count() { return cmdDefs.size; },
      item(i) { return [...cmdDefs.values()][i] || null; },
      itemById(id) { return cmdDefs.get(id) || null; },
      addButtonDefinition(id, name, tooltip = "", resourceFolder = "") {
        void resourceFolder;
        if (!id || !/^[\w.-]+$/.test(String(id))) throw new ScriptError("The command definition id is not valid");
        if (cmdDefs.has(id) || (app.commands.has(id) && !(app.commands.get(id) || {})._scriptCmd)) throw new ScriptError(`A command definition with the id "${id}" already exists`);
        const def = new CommandDefinition(id, name, tooltip, owner);
        cmdDefs.set(id, def);
        if (owner) owner.cmdDefs.add(id);
        app.commands.register({ id, label: name, tooltip: tooltip || `${name} (script command)`, kind: "tool", icon: "ScriptsManagerCommand", _scriptCmd: true, run: () => executeDefinition(def) });
        return def;
      },
      addCheckBoxDefinition(id, name, tooltip, isChecked) { const d = this.addButtonDefinition(id, name, tooltip); d.controlDefinition.isChecked = !!isChecked; return d; },
    };
  }
  // toolbar controls: commands added by add-ins go into the panel's dropdown (like Fusion's ADD-INS panel)
  const controls = []; // {panelId, id}
  function panelSpec(id) { const t = app.ui.toolbar; return t && t.spec && t.spec.PANELS ? t.spec.PANELS[id] : null; }
  function removeControls(id) {
    for (let i = controls.length - 1; i >= 0; i--) {
      if (controls[i].id !== id) continue;
      const p = panelSpec(controls[i].panelId);
      if (p && Array.isArray(p.dropdown)) { const k = p.dropdown.indexOf(id); if (k >= 0) p.dropdown.splice(k, 1); }
      controls.splice(i, 1);
    }
    try { app.ui.toolbar && app.ui.toolbar.refresh(); } catch { /* ignore */ }
  }
  function makePanel(id) {
    return {
      id,
      get name() { const p = panelSpec(id); return p ? p.label : id; },
      controls: {
        addCommand(def, positionID = "", isBefore = false) {
          void positionID; void isBefore;
          const p = panelSpec(id);
          if (!p) throw new ScriptError(`The toolbar panel "${id}" does not exist`);
          if (!Array.isArray(p.dropdown)) p.dropdown = [];
          if (!p.dropdown.includes(def.id)) p.dropdown.push(def.id);
          controls.push({ panelId: id, id: def.id });
          try { app.ui.toolbar && app.ui.toolbar.refresh(); } catch { /* ignore */ }
          const ctl = { id: def.id, commandDefinition: def, isPromoted: false, isPromotedByDefault: false, isVisible: true, deleteMe: () => { removeControls(def.id); return true; } };
          return ctl;
        },
        itemById(cid) { return controls.some((c) => c.panelId === id && c.id === cid) ? { id: cid, deleteMe: () => { removeControls(cid); return true; }, commandDefinition: cmdDefs.get(cid) || null } : null; },
        get count() { const p = panelSpec(id); return p ? p.dropdown.length : 0; },
      },
    };
  }
  const panels = {
    itemById(id) { return panelSpec(id) ? makePanel(id) : null; },
    get count() { const t = app.ui.toolbar; return t && t.spec ? Object.keys(t.spec.PANELS).length : 0; },
  };
  const workspace = {
    id: "FusionSolidEnvironment", name: "Design", isActive: true,
    toolbarPanels: panels,
    get toolbarTabs() { return { itemById: (tid) => ({ id: tid, toolbarPanels: panels, activate: () => { try { app.ui.toolbar.setTab(tid); } catch { /* ignore */ } return true; } }) }; },
  };

  // command inputs -> the app's command dialog
  class CommandInputs extends Base {
    constructor(cmd) { super(); this._cmd = cmd; this._list = []; }
    get count() { return this._list.length; }
    item(i) { return this._list[i] || null; }
    itemById(id) { const find = (l) => { for (const x of l) { if (x.id === id) return x; if (x.children) { const r = find(x.children._list); if (r) return r; } } return null; }; return find(this._list); }
    get command() { return this._cmd; }
    _add(inp) { if (this.itemById(inp.id)) throw new ScriptError(`An input with the id "${inp.id}" already exists`); inp._cmd = this._cmd; this._list.push(inp); return inp; }
    addValueInput(id, name, unitType, initialValue) { return this._add(new ValueCommandInput(id, name, unitType, initialValue)); }
    addBoolValueInput(id, name, isCheckBox, resourceFolder = "", initialValue = false) { return this._add(new CmdInput(id, name, "bool", { value: !!initialValue })); }
    addStringValueInput(id, name, initialValue = "") { return this._add(new CmdInput(id, name, "string", { value: String(initialValue) })); }
    addIntegerSpinnerCommandInput(id, name, min, max, spinStep, initialValue) { return this._add(new CmdInput(id, name, "int", { value: Math.round(initialValue), min, max, step: spinStep })); }
    addIntegerSliderCommandInput(id, name, min, max) { return this._add(new CmdInput(id, name, "int", { value: Math.round(min), min, max, step: 1 })); }
    addFloatSpinnerCommandInput(id, name, unitType, min, max, spinStep, initialValue) { return this._add(new CmdInput(id, name, "float", { value: Number(initialValue), min, max, step: spinStep, unitType })); }
    addDropDownCommandInput(id, name, style = 0) { return this._add(new DropDownCommandInput(id, name, style)); }
    addSelectionInput(id, name, commandPrompt = "") { return this._add(new SelectionCommandInput(id, name, commandPrompt)); }
    addTextBoxCommandInput(id, name, formattedText = "", numRows = 1, isReadOnly = true) { return this._add(new CmdInput(id, name, "text", { text: String(formattedText), rows: numRows, readOnly: isReadOnly })); }
    addGroupCommandInput(id, name) { const g = new CmdInput(id, name, "group", {}); g.children = new CommandInputs(this._cmd); g.isExpanded = true; return this._add(g); }
  }
  class CmdInput extends Base {
    constructor(id, name, kind, o) { super(); this.id = id; this.name = name; this._kind = kind; Object.assign(this, o); this.isVisible = true; this.isEnabled = true; this.tooltip = ""; }
    get parentCommand() { return this._cmd; }
    get formattedText() { return this.text; }
    set formattedText(v) { this.text = String(v); }
  }
  class ValueCommandInput extends CmdInput {
    constructor(id, name, unitType, init) {
      const kind = /^(deg|rad)$/.test(unitType) ? "angle" : unitType ? "length" : "none";
      let expr;
      if (init instanceof ValueInput && init.valueType === 0) expr = kind === "angle" ? `${+(init.realValue * 180 / Math.PI).toFixed(6)} deg` : kind === "length" ? `${+(init.realValue * 10).toFixed(6)} mm` : String(init.realValue);
      else expr = init instanceof ValueInput ? init.stringValue : String(init ?? "0");
      super(id, name, "value", { expression: expr, unitType, _vkind: kind });
    }
    get value() {
      const d = this._cmd && this._cmd._dlg;
      const expr = d && !d.closed ? d.values[this.id] : this.expression;
      try { const v = app.result.params.eval(String(expr), this._vkind); return this._vkind === "angle" ? v * Math.PI / 180 : this._vkind === "length" ? v / 10 : v; } catch { return NaN; }
    }
    set value(v) { this.expression = this._vkind === "angle" ? `${+(v * 180 / Math.PI).toFixed(6)} deg` : this._vkind === "length" ? `${+(v * 10).toFixed(6)} mm` : String(v); }
  }
  class DropDownCommandInput extends CmdInput {
    constructor(id, name, style) {
      super(id, name, "dropdown", { style });
      const items = [];
      const self = this;
      this.listItems = {
        add(n, isSelected = false) { const it = { name: String(n), isSelected: !!isSelected, index: items.length, deleteMe() { const k = items.indexOf(it); if (k < 0) return false; items.splice(k, 1); return true; } }; if (isSelected) for (const o of items) o.isSelected = false; items.push(it); return it; },
        get count() { return items.length; },
        item(i) { return items[i] || null; },
        clear() { items.length = 0; return true; },
      };
      this._items = items;
      void self;
    }
    get selectedItem() { return this._items.find((x) => x.isSelected) || this._items[0] || null; }
  }
  class SelectionCommandInput extends CmdInput {
    constructor(id, name, prompt) { super(id, name, "selection", { commandPrompt: prompt }); this._filters = []; this._min = 1; this._max = 0; this._sel = []; }
    addSelectionFilter(f) { this._filters.push(String(f)); return true; }
    clearSelectionFilter() { this._filters = []; return true; }
    setSelectionLimits(min, max = 0) { this._min = min; this._max = max; return true; }
    get selectionCount() { return this._refs().length; }
    selection(i) { const r = this._refs()[i]; const fz = this._cmd && this._cmd._fz; const e = r && fz && fz.wrapRef(r); return e ? { entity: e, objectType: "adsk::core::Selection" } : null; }
    addSelection(entity) { const fz = this._cmd && this._cmd._fz; const r = fz && fz.refOf(entity); if (!r) return false; this._sel.push(r); const d = this._cmd._dlg; if (d && !d.closed) d.setSelection(this.id, [...(d.values[this.id] || []), r]); return true; }
    clearSelection() { this._sel = []; const d = this._cmd && this._cmd._dlg; if (d && !d.closed) d.setSelection(this.id, []); return true; }
    _refs() { const d = this._cmd && this._cmd._dlg; return d && !d.closed ? (d.values[this.id] || []) : this._sel; }
  }
  class Command extends Base {
    constructor(def, fz) {
      super();
      this.parentCommandDefinition = def; this._fz = fz;
      this.commandInputs = new CommandInputs(this);
      for (const n of ["execute", "executePreview", "inputChanged", "validateInputs", "destroy", "activate", "deactivate", "select", "preSelect", "keyDown", "mouseClick"]) this[n] = new Event(n);
      this.okButtonText = "OK"; this.cancelButtonText = "Cancel"; this.isOKButtonVisible = true; this.isRepeatable = true; this.isExecutedWhenPreEmpted = true; this.helpFile = ""; this.isAutoExecute = true;
    }
    setDialogInitialSize() { return true; }
    setDialogMinimumSize() { return true; }
    doExecute(terminate = true) { const d = this._dlg; if (d && !d.closed) { if (terminate) d.ok(); else fireExecute(this); } return true; }
  }
  Command._t = "adsk::core::Command";
  const args = (cmd, extra = {}) => ({ command: cmd, firingEvent: { sender: cmd, name: "" }, inputs: cmd.commandInputs, ...extra });

  function fireExecute(cmd) {
    const owner = cmd.parentCommandDefinition._owner;
    const ses = new Session(app, cmd.parentCommandDefinition.name);
    const prev = host.session;
    host.session = ses;
    try { cmd.execute._fire(args(cmd)); }
    catch (e) { reportError(owner ? owner.rec : null, e); }
    finally { ses.end(); host.session = prev; }
  }

  function executeDefinition(def) {
    const owner = def._owner;
    const fz = owner ? owner.fz : createFusion(app, host);
    const cmd = new Command(def, fz);
    const ses0 = new Session(app, def.name);
    const prev = host.session;
    host.session = ses0;
    try { def.commandCreated._fire(args(cmd)); }
    catch (e) { reportError(owner ? owner.rec : null, e); host.session = prev; ses0.end(); return; }
    host.session = prev;
    ses0.end();
    const inputs = cmd.commandInputs._list;
    if (!inputs.length) { fireExecute(cmd); try { cmd.destroy._fire(args(cmd, { terminationReason: 0 })); } catch (e) { reportError(owner && owner.rec, e); } return; }
    openCommandDialog(cmd, fz);
  }

  function inputRows(list, cmd) {
    const rows = [];
    for (const inp of list) {
      const vis = () => inp.isVisible !== false;
      const en = () => inp.isEnabled !== false;
      const base = { id: inp.id, label: inp.name, tooltip: inp.tooltip, visible: vis, enabled: en };
      if (inp._kind === "value") rows.push({ ...base, type: "value", kind: inp._vkind, default: inp.expression });
      else if (inp._kind === "float") rows.push({ ...base, type: "value", kind: /^(deg|rad)$/.test(inp.unitType) ? "angle" : inp.unitType ? "length" : "none", default: String(inp.value), min: inp.min, max: inp.max });
      else if (inp._kind === "int") rows.push({ ...base, type: "value", kind: "none", integer: true, default: String(inp.value), min: inp.min, max: inp.max, step: inp.step });
      else if (inp._kind === "bool") rows.push({ ...base, type: "check", default: !!inp.value });
      else if (inp._kind === "dropdown") rows.push({ ...base, type: "dropdown", default: String((inp.selectedItem || {}).index ?? 0), options: inp._items.map((it, i) => ({ value: String(i), label: it.name })) });
      else if (inp._kind === "selection") rows.push({ ...base, type: "selection", kinds: kindsFor(inp._filters.join(",")).length ? kindsFor(inp._filters.join(",")) : ["body", "face", "edge"], min: inp._min, max: inp._max || undefined, prompt: inp.commandPrompt || `Select ${inp.name}`, filter: (r) => refPasses(r, inp._filters.join(",")) });
      else if (inp._kind === "string") rows.push({ ...base, type: "custom", render(d) { const e = document.createElement("input"); e.type = "text"; e.className = "mg-text"; e.dataset.input = inp.id; e.value = inp.value; e.addEventListener("input", () => { inp.value = e.value; d.values[inp.id] = e.value; changed(cmd, inp); }); return e; }, update() {} });
      else if (inp._kind === "text") rows.push({ ...base, type: "custom", render() { const e = document.createElement("div"); e.className = "mg-cmd-text"; e.dataset.input = inp.id; return e; }, update(e) { e.innerHTML = String(inp.text || ""); } });
      else if (inp._kind === "group") rows.push({ ...base, type: "group", header: () => inp.name, rows: inputRows(inp.children._list, cmd) });
    }
    return rows;
  }
  function changed(cmd, inp) {
    try { cmd.inputChanged._fire(args(cmd, { input: inp })); } catch (e) { reportError(null, e); }
    try { if (cmd._dlg && !cmd._dlg.closed) cmd._dlg.refresh(); } catch { /* ignore */ }
  }
  function syncFromDialog(cmd, d) {
    const walk = (list) => {
      for (const inp of list) {
        const v = d.values[inp.id];
        if (inp._kind === "value") inp.expression = v;
        else if (inp._kind === "int" || inp._kind === "float") { const n = d.num(inp.id); if (Number.isFinite(n)) inp.value = inp._kind === "int" ? Math.round(n) : (inp.unitType && inp.unitType !== "deg" ? n / 10 : inp.unitType === "deg" ? n * Math.PI / 180 : n); }
        else if (inp._kind === "bool") inp.value = !!v;
        else if (inp._kind === "dropdown") inp._items.forEach((it, i) => { it.isSelected = String(i) === String(v); });
        else if (inp._kind === "selection") inp._sel = [...(v || [])];
        if (inp.children) walk(inp.children._list);
      }
    };
    walk(cmd.commandInputs._list);
  }
  function openCommandDialog(cmd, fz) {
    const def = cmd.parentCommandDefinition;
    if (!app.ui.dialog) { fireExecute(cmd); return; }
    let ok = false;
    const d = app.ui.dialog.open({
      id: def.id, title: def.name, icon: "ScriptsManagerCommand", help: def.tooltip,
      preview: false, noFeature: true, ctrlWidth: 160,
      rows: inputRows(cmd.commandInputs._list, cmd),
      onChange(id, dlg) {
        syncFromDialog(cmd, dlg);
        const inp = cmd.commandInputs.itemById(id);
        if (inp) changed(cmd, inp);
      },
      validate() {
        const a = args(cmd, { areInputsValid: true });
        try { cmd.validateInputs._fire(a); } catch { return "Invalid inputs"; }
        return a.areInputsValid ? null : "Invalid inputs";
      },
      commit(_f, dlg) { syncFromDialog(cmd, dlg); ok = true; return true; },
      afterCommit() { fireExecute(cmd); },
      onClose() { cmd._dlg = null; try { cmd.destroy._fire(args(cmd, { terminationReason: ok ? 0 : 1 })); } catch (e) { reportError(def._owner && def._owner.rec, e); } },
    });
    cmd._dlg = d;
    try { if (d && d.el) { const okb = d.el.querySelector('[data-action="ok"]'); if (okb && cmd.okButtonText) okb.textContent = cmd.okButtonText; if (okb && cmd.isOKButtonVisible === false) okb.style.display = "none"; } } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ adsk namespace for one script
  function makeAdsk(owner) {
    const fz = createFusion(app, host);
    if (owner) owner.fz = fz;
    const doc = {
      get name() { return app.doc.name || "Untitled"; },
      get isModified() { return !!app.dirty; },
      get isSaved() { return !!(app.doc.fileId || app.doc.savedVersion); },
      get design() { return fz.design; },
      get products() { return { count: 1, item: (i) => (i === 0 ? fz.design : null), itemByProductType: (t) => (t === "DesignProductType" ? fz.design : null) }; },
      save(description = "") {
        void description;
        const f = app.ui.files;
        if (!f) throw new ScriptError("Saving is not available");
        const cur = f.current;
        f.saveAs(cur ? cur.name : app.doc.name || "Untitled", cur ? cur.id : null);
        return true;
      },
      activate() { return true; },
      close() { throw new ScriptError("Closing the only document is not supported from a script"); },
      objectType: "adsk::fusion::FusionDocument",
    };
    host.document = doc;
    const ui = {
      messageBox(text, title = "", buttons = 0, icon = 0) {
        if (!buttons) { messageBoxAsync(text, title, buttons, icon); return DialogResults.DialogOK; }
        let ok = false;
        try { ok = window.confirm(`${title ? `${title}\n\n` : ""}${text}`); } catch { ok = false; }
        if (buttons === MessageBoxButtonTypes.YesNoButtonType || buttons === MessageBoxButtonTypes.YesNoCancelButtonType) return ok ? DialogResults.DialogYes : DialogResults.DialogNo;
        return ok ? DialogResults.DialogOK : DialogResults.DialogCancel;
      },
      messageBoxAsync,
      inputBox(prompt, title = "", defaultValue = "") {
        let v = null;
        try { v = window.prompt(`${title ? `${title}\n\n` : ""}${prompt}`, defaultValue); } catch { v = null; }
        const r = [v === null ? "" : v, v === null];
        r.value = r[0]; r.cancelled = r[1];
        return r;
      },
      inputBoxAsync(prompt, title = "", defaultValue = "") {
        const m = app.ui.modals;
        if (!m) return Promise.resolve(Object.assign(["", true], { value: "", cancelled: true }));
        return m.prompt({ id: "ScriptInputBox", title: title || "Input", label: prompt, value: defaultValue, validate: () => null }).then((v) => Object.assign([v ?? "", v === null], { value: v ?? "", cancelled: v === null }));
      },
      get activeSelections() { return makeSelections(fz); },
      selectEntity(prompt, filter) {
        const r = app.selection.items.find((x) => refPasses(x, filter));
        const e = r && fz.wrapRef(r);
        if (!e) throw new ScriptError(`${prompt || "Select an entity"}: select it in the canvas before running the script (or use await ui.selectEntityAsync())`);
        return { entity: e, objectType: "adsk::core::Selection" };
      },
      selectEntityAsync(prompt, filter) {
        return new Promise((resolve, reject) => {
          const kinds = kindsFor(filter);
          const prevFilter = app.selection.filter;
          app.selection.filter = (r) => (!kinds.length || kinds.includes(r.kind)) && refPasses(r, filter);
          app.toast(prompt || "Select an entity (Esc cancels)", "info", 4000);
          let off = null;
          const done = (r) => { app.selection.filter = prevFilter; if (off) off(); if (r) resolve({ entity: fz.wrapRef(r), objectType: "adsk::core::Selection" }); else reject(new ScriptError("Selection cancelled")); };
          off = app.input.push({
            name: "script-select", cursor: "pointer",
            onPointerDown(ev, ctx) { if (ctx.button !== 0) return false; const h = ctx.hit; if (h && h.ref) { done(h.ref); return true; } return true; },
            onCancel() { done(null); return true; },
          });
        });
      },
      get commandDefinitions() { return makeCommandDefinitions(owner); },
      get allToolbarPanels() { return panels; },
      get workspaces() { return { itemById: (id) => (id === "FusionSolidEnvironment" ? workspace : null), get count() { return 1; }, item: (i) => (i === 0 ? workspace : null) }; },
      get activeWorkspace() { return workspace; },
      get palettes() { return { itemById: () => null, get count() { return 0; } }; },
      terminateActiveCommand() { try { if (app.activeCommand) app.activeCommand.cancel(); } catch { /* ignore */ } return true; },
      get isTabbedToolbarUI() { return true; },
      objectType: "adsk::core::UserInterface",
    };
    const application = {
      get activeProduct() { return fz.design; },
      get activeDocument() { return doc; },
      get documents() { return { count: 1, item: (i) => (i === 0 ? doc : null), add: () => { throw new ScriptError("This recreation has a single document: use File > New Design"); } }; },
      get userInterface() { return ui; },
      get version() { return "2706.1.17 (unofficial browser recreation)"; },
      get currentUser() { return { displayName: "Local user", userName: "local", objectType: "adsk::core::User" }; },
      get preferences() { return { get defaultUnitsPreferences() { return { get distanceDisplayUnits() { return app.doc.units || "mm"; } }; } }; },
      log(msg, level = 0) { log(msg, level === 2 ? "error" : level === 1 ? "warning" : "info", owner && owner.rec && owner.rec.name); },
      fireCustomEvent() { return false; },
      objectType: "adsk::core::Application",
    };
    const Application = { get: () => application, cast: (o) => (o === application ? o : null) };
    const UserInterface = { cast: (o) => (o === ui ? o : null) };
    const core = makeCore({ Application, UserInterface });
    return {
      core, fusion: fz.ns, cam: {}, drawing: {},
      debug: false,
      terminate() { return true; },
      autoTerminate() { return true; },
      doEvents() { return true; },
      log: (m) => log(m, "info", owner && owner.rec && owner.rec.name),
      parameters: "{}",
      result: "",
    };
  }

  // ------------------------------------------------------------------ compile / run / stop
  function compile(rec) {
    if (!canCompile()) throw new ScriptError("This page's security policy (Content-Security-Policy without 'unsafe-eval') does not allow scripts to be compiled. Open the recreation from its normal web address to run scripts.");
    const body = `"use strict";\n${prepareSource(rec.source)}\n;return { run: typeof run === "function" ? run : (module.exports.run || exports.run), stop: typeof stop === "function" ? stop : (module.exports.stop || exports.stop) };`;
    return new Function("adsk", "console", "exports", "module", body);
  }
  function makeConsole(rec) {
    const out = (level) => (...a) => log(a.map((x) => (typeof x === "string" ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(" "), level, rec.name);
    return { log: out("info"), info: out("info"), debug: out("info"), warn: out("warning"), error: out("error"), table: out("info"), dir: out("info") };
  }

  function reportError(rec, e) {
    const line = errorLine(e);
    const name = rec ? rec.name : "Script";
    const msg = `${e && e.name && e.name !== "Error" ? `${e.name}: ` : ""}${(e && e.message) || e}`;
    host.lastError = { script: rec && rec.id, message: msg, line };
    log(`${name} failed${line ? ` (line ${line})` : ""}: ${msg}`, "error", name);
    const m = app.ui.modals;
    const text = `<b>${esc(name)}</b> failed${line ? ` at line ${line}` : ""}:<br><br>${esc(msg)}`;
    if (m) m.alert({ id: "ScriptError", title: "Error", kind: "error", message: text, width: 480 });
    else app.toast(`${name}: ${msg}`, "error", 6000);
    app.emit("script", { action: "error", id: rec && rec.id, message: msg, line });
  }

  /** Run a script (run once) or start an add-in. Resolves {ok, error?, line?}. */
  async function run(rec, opts = {}) {
    if (!rec) return { ok: false, error: "No script" };
    if (rec.isAddIn && running.has(rec.id)) return { ok: true, already: true };
    host.lastError = null;
    let mod;
    const owner = { rec, cmdDefs: new Set(), fz: null };
    const adsk = makeAdsk(owner);
    const exportsObj = {};
    try {
      mod = compile(rec)(adsk, makeConsole(rec), exportsObj, { exports: exportsObj });
    } catch (e) {
      reportError(rec, e);
      return { ok: false, error: e.message, line: errorLine(e) };
    }
    if (!mod || typeof mod.run !== "function") {
      const e = new ScriptError("The script has no run(context) function");
      reportError(rec, e);
      return { ok: false, error: e.message };
    }
    const ctx = { IsApplicationStartup: !!opts.startup, isApplicationStartup: !!opts.startup };
    const ses = new Session(app, `${rec.isAddIn ? "Add-In" : "Script"}: ${rec.name}`);
    const prev = host.session;
    host.session = ses;
    log(`${rec.isAddIn ? "Starting add-in" : "Running script"} ${rec.name}`, "info", rec.name);
    if (rec.isAddIn) running.set(rec.id, { rec, mod, ctx, owner });
    else running.set(rec.id, { rec, mod, ctx, owner, transient: true });
    app.emit("script", { action: "start", id: rec.id });
    let result = { ok: true };
    try {
      const r = mod.run(ctx);
      if (r && typeof r.then === "function") await r;
    } catch (e) {
      reportError(rec, e);
      result = { ok: false, error: e.message, line: errorLine(e) };
      if (rec.isAddIn) cleanupOwner(owner);
    } finally {
      ses.end();
      host.session = prev;
      if (!rec.isAddIn || !result.ok) running.delete(rec.id);
      app.emit("script", { action: rec.isAddIn && result.ok ? "running" : "stop", id: rec.id });
    }
    if (result.ok) log(`${rec.name} ${rec.isAddIn ? "started" : "finished"}`, "info", rec.name);
    return result;
  }
  function cleanupOwner(owner) {
    for (const id of owner.cmdDefs) { const d = cmdDefs.get(id); if (d) d.deleteMe(); }
    owner.cmdDefs.clear();
  }
  /** Stop a running add-in (calls its stop(context) and removes its commands and controls). */
  function stop(rec) {
    const r = rec && running.get(rec.id);
    if (!r) return false;
    const ses = new Session(app, `Stop ${rec.name}`);
    const prev = host.session;
    host.session = ses;
    try { if (r.mod && typeof r.mod.stop === "function") r.mod.stop({ IsApplicationStartup: false }); }
    catch (e) { reportError(rec, e); }
    finally { ses.end(); host.session = prev; }
    cleanupOwner(r.owner);
    running.delete(rec.id);
    log(`${rec.name} stopped`, "info", rec.name);
    app.emit("script", { action: "stop", id: rec.id });
    return true;
  }
  function stopAll() { for (const r of [...running.values()]) stop(r.rec); }
  return host;
}
