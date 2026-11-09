// Change Parameters: Fusion's PARAMETERS dialog (2706 layout, light theme):
//   top row: filter toggles (fx all · user fx · ★ favourites), "Filter all parameters",
//            + (add user parameter), copy, delete, import, export, ☑ Automatic Compute
//   columns: Parameter ▾ | Name | Unit | Expression | Value | Comments
//   tree:    Favorites · fx User Parameters · ⌄ Model Parameters › (Unsaved) › Sketch1 ›
//            "☆ Linear Dimension-2 | d1 | mm | 40 mm | 40.00"
//   footer:  (i) at the left, blue OK at the right; × in the title bar.
// Edits apply live through app.mutate (the model updates while the dialog is open); invalid
// expressions are flagged in place and not applied. OK keeps the changes as one undo step,
// × / Esc restores the design as it was when the dialog opened.
import { featureIcon } from "../icons/icons.js";
import { el, esc, clone, glyphHtml } from "./util.js";

const LEN_UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
const ANG_UNITS = { deg: 1, rad: 180 / Math.PI };
const UNIT_CHOICES = ["mm", "cm", "m", "in", "ft", "deg", "rad", "No Units"];
const RESERVED = new Set(["mm", "cm", "m", "in", "inch", "ft", "um", "deg", "rad", "PI", "pi", "E",
  "sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "abs", "floor", "ceil", "round", "ln", "log", "exp"]);

// Fusion-style parameter names for feature fields.
const PARAM_LABEL = {
  extrude: { distance: "AlongDistance", distance2: "AgainstDistance", taper: "TaperAngle", taper2: "AgainstTaperAngle", startOffset: "StartOffset" },
  revolve: { angle: "AlongAngle", angle2: "AgainstAngle" },
  fillet: { radius: "Radius" },
  chamfer: { distance: "Distance" },
  shell: { thickness: "Thickness" },
  hole: { diameter: "HoleDiameter", depth: "HoleDepth", tipAngle: "TipAngle", cbD: "CounterboreDiameter", cbDepth: "CounterboreDepth", csD: "CountersinkDiameter", csAngle: "CountersinkAngle" },
  box: { length: "Length", width: "Width", height: "Height" },
  cylinder: { diameter: "Diameter", height: "Height" },
  sphere: { diameter: "Diameter" },
  torus: { d1: "InnerDiameter", d2: "TorusDiameter" },
  cplane: { offset: "Offset", angle: "Angle" },
  rpattern: { q1: "QuantityOne", d1: "DistanceOne", q2: "QuantityTwo", d2: "DistanceTwo" },
  cpattern: { count: "Quantity", angle: "TotalAngle" },
  move: { tx: "XDistance", ty: "YDistance", tz: "ZDistance", rx: "XAngle", ry: "YAngle", rz: "ZAngle" },
  draft: { angle: "Angle" },
};
// Fields whose value must be > 0.
const POSITIVE = new Set(["fillet.radius", "chamfer.distance", "shell.thickness", "hole.diameter", "hole.depth", "hole.cbD", "hole.cbDepth", "hole.csD",
  "box.length", "box.width", "box.height", "cylinder.diameter", "cylinder.height", "sphere.diameter", "torus.d1", "torus.d2",
  "rpattern.q1", "rpattern.q2", "cpattern.count"]);
const COUNT = new Set(["rpattern.q1", "rpattern.q2", "cpattern.count"]);

function unitKind(unit) { return unit in ANG_UNITS ? "angle" : unit === "No Units" || unit === "" ? "none" : "length"; }
function defaultUnit(kind) { return kind === "angle" ? "deg" : kind === "none" ? "No Units" : "mm"; }
function isBareNumber(s) { return /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i.test(s); }
/** Value column: the number in the parameter's unit, like Fusion ("40.00", angles "90.0"). */
function fmt(v, unit, kind) {
  if (!Number.isFinite(v)) return "";
  if (kind === "none" || unit === "No Units" || unit === "") return v.toFixed(2);
  if (kind === "angle") { const f = ANG_UNITS[unit] || 1; return (v / f).toFixed(unit === "rad" ? 3 : 1); }
  const x = v / (LEN_UNITS[unit] || 1);
  return (Math.abs(x) < 5e-10 ? 0 : x).toFixed(unit === "m" || unit === "in" || unit === "ft" ? 3 : 2);
}
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ----------------------------------------------------------------------------- glyphs (original drawings)
const sv = (body, w = 16, h = 16) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;
const G = {
  fx: () => sv('<text x="1" y="14.2" font-family="Times New Roman, Georgia, serif" font-style="italic" font-size="17" fill="currentColor">fx</text>', 20, 18),
  fxSmall: () => sv('<text x="1.5" y="12" font-family="Times New Roman, Georgia, serif" font-style="italic" font-size="13" fill="currentColor">fx</text>', 16, 16),
  fxUser: () => sv('<text x="0.5" y="11" font-family="Times New Roman, Georgia, serif" font-style="italic" font-size="12.5" fill="currentColor">fx</text><circle cx="13" cy="10.6" r="2" fill="#1a7fd6"/><path d="M9.6 16c.3-2.2 1.7-3.3 3.4-3.3s3.1 1.1 3.4 3.3z" fill="#1a7fd6"/>', 18, 16),
  starFilled: () => sv('<path d="M8 1.4l1.95 4.2 4.6.5-3.42 3.12.96 4.53L8 11.45l-4.09 2.3.96-4.53L1.45 6.1l4.6-.5z" fill="currentColor"/>'),
  starOutline: () => sv('<path d="M8 1.9l1.8 3.9 4.27.47-3.17 2.9.89 4.2L8 11.22l-3.79 2.15.89-4.2-3.17-2.9 4.27-.47z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/>'),
  plus: () => sv('<path d="M8 2.2v11.6M2.2 8h11.6" stroke="currentColor" stroke-width="1.9"/>'),
  copy: () => sv('<path d="M3 1.6h6.2v10.6H3z" fill="currentColor" opacity=".55"/><path d="M6.2 4.4h4.6l2.6 2.6v7.6H6.2z" fill="currentColor"/>'),
  trash: () => sv('<path d="M2.6 3.4h10.8v1.4H2.6zM6.2 1.8h3.6v1.6H6.2z" fill="currentColor"/><path d="M3.8 5.6h8.4l-.7 8.8H4.5z" fill="currentColor"/>'),
  import: () => sv('<path d="M6.4 1.6h4.4l3 3v9.8H6.4v-3.4h1.4v2h4.6V5.4H10V3H7.8v3H6.4z" fill="currentColor"/><path d="M6.4 1.6h4.4l3 3v9.8H6.4z" fill="currentColor"/><path d="M1.2 7.4h5.2V5.2l3.4 3.2-3.4 3.2V9.4H1.2z" fill="currentColor" stroke="#fff" stroke-width=".9"/>'),
  export: () => sv('<path d="M2.4 1.6h4.4l3 3v9.8H2.4z" fill="currentColor"/><path d="M7.2 7.4h4.4V5.2L15 8.4l-3.4 3.2V9.4H7.2z" fill="currentColor" stroke="#fff" stroke-width=".9"/>'),
  check: () => sv('<rect x=".5" y=".5" width="12" height="12" rx="1.6" fill="#3c3c3c" stroke="#3c3c3c"/><path d="M3.2 6.6l2.2 2.2 4.4-4.6" stroke="#fff" stroke-width="1.7" fill="none"/>', 13, 13),
  uncheck: () => sv('<rect x=".5" y=".5" width="12" height="12" rx="1.6" fill="#fff" stroke="#8a8a8a"/>', 13, 13),
  chevRight: () => sv('<path d="M3.6 2l3.2 3-3.2 3" stroke="currentColor" stroke-width="1.3" fill="none"/>', 10, 10),
  chevDown: () => sv('<path d="M2 3.6l3 3.2 3-3.2" stroke="currentColor" stroke-width="1.3" fill="none"/>', 10, 10),
  tri: () => sv('<path d="M1.5 3h7L5 7.2z" fill="currentColor"/>', 10, 10),
  info: () => sv('<circle cx="7" cy="7" r="6.4" fill="#3c3c3c"/><rect x="6.2" y="5.8" width="1.6" height="4.6" fill="#fff"/><circle cx="7" cy="3.9" r=".95" fill="#fff"/>', 14, 14),
  model: () => sv('<path d="M4.2 2.6h7.6l1.6 1.6v8.4l-1.6 1.6H4.2l-1.6-1.6V4.2z" fill="#fff" stroke="#5a5a5a" stroke-width="1"/><path d="M2.6 4.2h9.2v9.8" fill="none" stroke="#5a5a5a" stroke-width=".9"/>'),
  component: () => sv('<path d="M3.4 4.6h4.4v9H3.4z" fill="#fff" stroke="#5a5a5a"/><path d="M7.8 8.6h4.8v5H7.8z" fill="#fff" stroke="#5a5a5a"/><path d="M5 2.2l3.2 1.6v3.6" fill="none" stroke="#5a5a5a"/>'),
};

// Tree expansion persists for the session (Fusion remembers it while the app runs).
const TREE = { collapsed: new Set(["comp"]), expandedFeatures: new Set(), colWidths: null };

export function createParams(app, modals) {
  const { M, E } = app;

  // ------------------------------------------------------------------ data
  function params() {
    try { return M.buildParams(app.doc); } catch { return null; }
  }

  function computeRows() {
    const P = params();
    const val = (name) => { try { return { value: P.value(name) }; } catch (e) { return { error: e.message || String(e) }; } };
    const comments = app.doc.paramComments || {};
    const favs = new Set(app.doc.paramFavorites || []);
    const user = (app.doc.params || []).map((up, i) => {
      const kind = up.kind || "length";
      const unit = up.unit || defaultUnit(kind);
      const r = val(up.name);
      return { user: true, index: i, name: up.name, expr: String(up.expr), kind, unit, comment: up.comment || "", fav: favs.has(up.name), label: "", ...r };
    });
    const groups = [];
    let list = [];
    try { list = M.featureParamsList(app.doc, P); } catch (e) { console.error(e); }
    for (const g of list) {
      const f = g.feature;
      // Fusion numbers a sketch's dimensions from 2 ("Linear Dimension-2" is the first one, ref 31)
      let dimN = 1;
      const items = g.items.map((it) => {
        const kind = it.kind || "length";
        const label = it.cid ? `${it.label || "Dimension"}-${++dimN}` : (PARAM_LABEL[f.type] && PARAM_LABEL[f.type][it.key]) || it.key;
        const r = val(it.name);
        return { user: false, feature: f.id, ftype: f.type, key: it.key, cid: it.cid, name: it.name, expr: String(it.expr), kind, unit: kind === "angle" ? "deg" : kind === "none" ? "" : "mm", comment: comments[it.name] || "", fav: favs.has(it.name), label, ...r };
      });
      groups.push({ feature: f, items });
    }
    return { user, groups, P };
  }

  function findRow(rows, name) {
    return rows.user.find((r) => r.name === name) || rows.groups.flatMap((g) => g.items).find((r) => r.name === name) || null;
  }

  function setExpr(doc, row, expr) {
    if (row.user) { const up = doc.params.find((p) => p.name === row.name); if (up) up.expr = expr; return; }
    const f = doc.features.find((x) => x.id === row.feature);
    if (!f) throw new Error("Feature not found");
    if (row.cid) { const c = f.sk.constraints.find((x) => x.id === row.cid); if (c) c.expr = expr; }
    else f[row.key] = expr;
  }

  function unitError(expr, kind) {
    const ids = E.identifiers(expr);
    const hasAng = ids.some((t) => t === "deg" || t === "rad");
    const hasLen = ids.some((t) => t in LEN_UNITS || t === "inch" || t === "um");
    if (kind === "length" && hasAng) return "The expression has angle units but the parameter is a length";
    if (kind === "angle" && hasLen) return "The expression has length units but the parameter is an angle";
    if (kind === "none" && (hasAng || hasLen)) return "The parameter has no units; remove the units from the expression";
    return null;
  }

  /** Validate a new expression for row; returns {error} or {value}. */
  function validateExpr(row, expr) {
    if (!expr.trim()) return { error: "Enter an expression" };
    const ue = unitError(expr, row.kind);
    if (ue) return { error: ue };
    const d = clone(app.doc);
    try { setExpr(d, row, expr); } catch (e) { return { error: e.message }; }
    let v;
    try {
      const P = M.buildParams(d);
      v = P.value(row.name);
    } catch (e) { return { error: e.message || String(e) }; }
    if (!Number.isFinite(v)) return { error: "The expression does not evaluate to a number" };
    const k = `${row.ftype}.${row.key}`;
    if (row.cid && v <= 0 && row.kind !== "angle") return { error: "Value must be greater than 0" };
    if (!row.user && POSITIVE.has(k) && v <= 0) return { error: "Value must be greater than 0" };
    if (!row.user && COUNT.has(k) && v < 1) return { error: "Quantity must be at least 1" };
    return { value: v };
  }

  function validateName(name, old) {
    if (!name) return "Enter a name";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return "Names must start with a letter and contain only letters, digits and _";
    if (RESERVED.has(name)) return `"${name}" is a reserved word`;
    if (name !== old) { const P = params(); if (P && P.has(name)) return `A parameter named "${name}" already exists`; }
    return null;
  }

  function renameInDoc(doc, oldName, newName) {
    const re = new RegExp(`(?<![A-Za-z0-9_])${reEsc(oldName)}(?![A-Za-z0-9_])`, "g");
    const fix = (s) => (typeof s === "string" ? s.replace(re, newName) : s);
    for (const up of doc.params) { if (up.name === oldName) up.name = newName; up.expr = fix(up.expr); }
    for (const f of doc.features) {
      if (f.p) for (const k of Object.keys(f.p)) if (f.p[k] === oldName) f.p[k] = newName;
      for (const k of Object.keys(M.FIELDS[f.type] || {})) if (typeof f[k] === "string") f[k] = fix(f[k]);
      if (f.type === "sketch" && f.sk) for (const c of f.sk.constraints) { if (c.param === oldName) c.param = newName; if (typeof c.expr === "string") c.expr = fix(c.expr); }
    }
    if (doc.paramComments && oldName in doc.paramComments) { doc.paramComments[newName] = doc.paramComments[oldName]; delete doc.paramComments[oldName]; }
    if (Array.isArray(doc.paramFavorites)) doc.paramFavorites = doc.paramFavorites.map((n) => (n === oldName ? newName : n));
    // keep model-parameter counters ahead of a d<N> name so new features never collide with it
    const m = /^d(\d+)$/.exec(newName);
    if (m) doc.counters.d = Math.max(doc.counters.d || 0, Number(m[1]));
  }

  /** Who references `name`? Returns the first referencing parameter name or null. */
  function referencedBy(name) {
    const uses = (expr) => E.identifiers(String(expr ?? "")).includes(name);
    for (const up of app.doc.params) if (up.name !== name && uses(up.expr)) return up.name;
    for (const f of app.doc.features) {
      if (f.p) for (const [k, pn] of Object.entries(f.p)) if (f[k] !== undefined && uses(f[k])) return pn;
      if (f.type === "sketch" && f.sk) for (const c of f.sk.constraints) if (c.param && uses(c.expr)) return c.param;
    }
    return null;
  }

  function uniqueName(base) {
    const P = params();
    let n = 1;
    let name = base;
    while ((P && P.has(name)) || RESERVED.has(name)) name = `${base}_${n++}`;
    return name;
  }

  // ------------------------------------------------------------------ CSV (Export / Import icons)
  const csvCell = (s) => { const t = String(s ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  function toCSV() {
    const rows = computeRows();
    const lines = [["Name", "Unit", "Expression", "Value", "Comments", "Favorite"].join(",")];
    for (const r of [...rows.user, ...rows.groups.flatMap((g) => g.items)]) {
      lines.push([r.name, r.user ? r.unit : r.unit || "No Units", r.expr, r.error ? "" : fmt(r.value, r.unit, r.kind), r.comment, r.fav ? "true" : "false"].map(csvCell).join(","));
    }
    return lines.join("\r\n") + "\r\n";
  }
  function parseCSV(text) {
    const out = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((c) => c.trim())) out.push(row); row = []; }
      else cell += ch;
    }
    row.push(cell);
    if (row.some((c) => c.trim())) out.push(row);
    return out;
  }

  // ------------------------------------------------------------------ dialog
  let current = null;

  function open() {
    if (current && !current.handle.closed) { current.handle.modal.querySelector(".pm-search")?.focus(); return current.handle; }
    const session = { startLen: app.history.undoStack.length, before: clone(app.doc), redo: app.history.redoStack.slice(), dirty: app.dirty, changed: false };
    // current: the tree's current item before anything is selected -- Fusion opens the dialog with the
    // design's component row ("(Unsaved)") current, drawn with a faint full-row tint (ref 29).
    const state = { filter: "", show: "all", selected: null, current: "comp", auto: true, pendingCompute: false, sort: 0 };

    // ---- top row
    const toggle = (key, title, html) => {
      const b = el("button", { type: "button", class: `pm-toggle${state.show === key ? " on" : ""}`, title, "aria-pressed": String(state.show === key), "data-action": `show-${key}`, html });
      b.addEventListener("click", () => { state.show = key; for (const t of toggles) { const on = t.dataset.action === `show-${key}`; t.classList.toggle("on", on); t.setAttribute("aria-pressed", String(on)); } render(); });
      return b;
    };
    const toggles = [
      toggle("all", "Show All Parameters", G.fx()),
      toggle("user", "Show User Parameters", G.fxUser()),
      toggle("fav", "Show Favorites", G.starFilled()),
    ];
    const search = el("input", { type: "text", class: "pm-search", placeholder: "Filter all parameters", spellcheck: "false", "data-input": "search", "data-no-submit": "" });
    const iconBtn = (action, title, html) => el("button", { type: "button", class: "pm-icon-btn", title, "data-action": action, html });
    const addBtn = iconBtn("add-user-param", "Add User Parameter\nCreates a new user parameter.", G.plus());
    const copyBtn = iconBtn("copy-param", "Copy Parameter\nCreates a user parameter from the selected parameter.", G.copy());
    const delBtn = iconBtn("delete-param", "Delete Parameter\nDeletes the selected user parameter.", G.trash());
    const impBtn = iconBtn("import-params", "Import Parameters\nImports parameters from a CSV file.", G.import());
    const expBtn = iconBtn("export-params", "Export Parameters\nExports all parameters to a CSV file.", G.export());
    const importInput = el("input", { type: "file", accept: ".csv,text/csv", style: { display: "none" } });
    const autoBox = el("span", { class: "pm-check-box", html: G.check() });
    const autoChk = el("label", { class: "pm-auto", "data-input": "auto-compute", title: "Automatic Compute\nRecomputes the design after each change. Turn off to apply several changes at once." }, autoBox, el("span", { text: "Automatic Compute" }));
    const top = el("div", { class: "pm-top" },
      toggles[0], toggles[1], toggles[2], search, el("div", { class: "pm-spacer" }),
      addBtn, copyBtn, delBtn, impBtn, expBtn, importInput, autoChk);

    const tableWrap = el("div", { class: "pm-wrap" });
    const body = el("div", { class: "pm-body" }, top, tableWrap);
    const info = el("span", { class: "pm-info", title: "Displays the Parameters dialog, where you can create and manage equations and relationships to control the size of objects.\nClick a row to select it; edit Name, Expression or Comments in place. Enter applies a change.", html: G.info() });

    const W = window.innerWidth, H = window.innerHeight;
    const handle = modals.open({
      id: "ChangeParameterCommand",
      title: "Parameters",
      width: Math.max(560, Math.min(1159, W - 40)),
      height: Math.max(300, Math.min(463, H - 40)),
      className: "pm-dialog",
      body,
      footLeft: info,
      enterSubmits: false,
      focus: false,
      buttons: [
        { action: "ok", label: "OK", primary: true, onClick: () => { commitSession(); return true; } },
      ],
      onCancel: () => { revertSession(); },
      onClose: () => { offDoc(); hideTip(); current = null; },
    });
    current = { handle, state, expandAll, render };

    search.addEventListener("input", () => { state.filter = search.value.trim().toLowerCase(); render(); });
    addBtn.addEventListener("click", () => addUserParamDialog());
    copyBtn.addEventListener("click", () => copySelected());
    delBtn.addEventListener("click", () => { const s = state.selected; if (s && s.user) deleteUserParam(s.name); });
    expBtn.addEventListener("click", () => {
      const name = `${(app.doc.name || "Untitled").replace(/[\\/:*?"<>|]+/g, "_")}_parameters.csv`;
      app.download(name, new Blob([toCSV()], { type: "text/csv" }), "text/csv");
    });
    impBtn.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", async () => {
      const file = importInput.files && importInput.files[0];
      importInput.value = "";
      if (file) importCSV(await file.text());
    });
    autoChk.addEventListener("click", (ev) => {
      ev.preventDefault();
      state.auto = !state.auto;
      autoBox.innerHTML = state.auto ? G.check() : G.uncheck();
      if (state.auto && state.pendingCompute) { state.pendingCompute = false; skipNext = true; try { app.recompute(); } finally { skipNext = false; } refreshValues(); }
    });

    // keep the table in step with outside changes (undo, timeline edits)
    let skipNext = false;
    const offDoc = app.on("model", (d) => { if (skipNext || (d && d.preview)) return; if (!handle.closed) scheduleRender(); });

    function mutate(label, fn, opts = {}) {
      session.changed = true;
      skipNext = true; // app.mutate recomputes synchronously; our own 'model' event must not re-render
      const recompute = opts.recompute !== false && state.auto;
      if (opts.recompute !== false && !state.auto) state.pendingCompute = true;
      try { return app.mutate(label, fn, { ...opts, recompute }); } finally { skipNext = false; }
    }

    // keyboard: Delete removes the selected user parameter (when not typing)
    handle.modal.addEventListener("keydown", (ev) => {
      const t = ev.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if ((ev.key === "Delete" || ev.key === "Backspace") && state.selected && state.selected.user) { ev.preventDefault(); deleteUserParam(state.selected.name); }
    });

    // ------------------------------------------------ render
    let renderTimer = 0;
    function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 0); }

    function matches(r, fname) {
      if (!state.filter) return true;
      return [r.name, r.label, r.expr, r.comment, fname].some((s) => String(s || "").toLowerCase().includes(state.filter));
    }
    const isCollapsed = (key) => {
      if (state.filter) return false;
      if (key.startsWith("f:")) return !TREE.expandedFeatures.has(key);
      return TREE.collapsed.has(key);
    };
    function setCollapsed(key, c) {
      if (key.startsWith("f:")) { if (c) TREE.expandedFeatures.delete(key); else TREE.expandedFeatures.add(key); }
      else if (c) TREE.collapsed.add(key); else TREE.collapsed.delete(key);
    }
    function expandAll() {
      TREE.collapsed.clear();
      for (const f of app.doc.features) TREE.expandedFeatures.add(`f:${f.id}`);
      render();
    }

    function sorted(items) {
      if (!state.sort) return items;
      const k = (r) => String(r.label || r.name).toLowerCase();
      return items.slice().sort((a, b) => (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0) * state.sort);
    }

    function render() {
      clearTimeout(renderTimer);
      if (handle.closed) return;
      // remember focus
      const ae = document.activeElement;
      const focusKey = ae && tableWrap.contains(ae) ? ae.dataset.input : null;
      const caret = focusKey && typeof ae.selectionStart === "number" ? [ae.selectionStart, ae.selectionEnd] : null;
      const scroll = tableWrap.scrollTop;

      const rows = computeRows();
      const table = el("table", { class: "pm-table" });
      const cols = ["pm-c-param", "pm-c-name", "pm-c-unit", "pm-c-expr", "pm-c-value", "pm-c-comment"].map((c, i) => el("col", { class: c, style: TREE.colWidths ? { width: `${TREE.colWidths[i]}%` } : undefined }));
      table.appendChild(el("colgroup", {}, ...cols));
      const sortBtn = el("span", { class: "pm-sort", title: "Sort", html: G.tri() });
      sortBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const r = sortBtn.getBoundingClientRect();
        const cm = app.ui.contextMenu;
        const set = (v) => () => { state.sort = v; render(); };
        if (cm) cm.show([{ label: "Sort A to Z", icon: false, checked: state.sort === 1, run: set(1) }, { label: "Sort Z to A", icon: false, checked: state.sort === -1, run: set(-1) }, { label: "Timeline Order", icon: false, checked: !state.sort, run: set(0) }], r.left, r.bottom + 2);
      });
      const th0 = el("th", {}, el("span", { class: "pm-th-text", text: "Parameter" }));
      th0.appendChild(sortBtn);
      table.appendChild(el("thead", {}, el("tr", {}, th0,
        el("th", {}, el("span", { class: "pm-th-text", text: "Name" })), el("th", {}, el("span", { class: "pm-th-text", text: "Unit" })),
        el("th", {}, el("span", { class: "pm-th-text", text: "Expression" })), el("th", {}, el("span", { class: "pm-th-text", text: "Value" })),
        el("th", {}, el("span", { class: "pm-th-text", text: "Comments" })))));
      // drag a header separator to resize the two columns next to it (Fusion's columns are resizable)
      [...table.querySelectorAll("thead th")].forEach((th, i, ths) => {
        if (i === ths.length - 1) return;
        const grip = el("span", { class: "pm-col-grip", title: "" });
        th.appendChild(grip);
        grip.addEventListener("pointerdown", (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          const total = table.getBoundingClientRect().width;
          const px = ths.map((t) => t.getBoundingClientRect().width);
          const x0 = ev.clientX;
          const move = (e) => {
            const d = Math.max(-px[i] + 40, Math.min(px[i + 1] - 40, e.clientX - x0));
            const w = px.slice(); w[i] += d; w[i + 1] -= d;
            TREE.colWidths = w.map((v) => (v / total) * 100);
            cols.forEach((c, k) => { c.style.width = `${TREE.colWidths[k]}%`; });
          };
          const up = () => { window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); };
          window.addEventListener("pointermove", move, true);
          window.addEventListener("pointerup", up, true);
        });
      });
      const tb = el("tbody");
      table.appendChild(tb);

      const all = [...rows.user, ...rows.groups.flatMap((g) => g.items)];
      const showFav = state.show === "all" || state.show === "fav";
      const showUser = state.show === "all" || state.show === "user";
      const showModel = state.show === "all";

      if (showFav) {
        const favs = sorted(all.filter((r) => r.fav && matches(r)));
        tb.appendChild(groupRow({ key: "favorites", label: "Favorites", level: 0, bold: true, kids: favs.length, plain: true }));
        if (!isCollapsed("favorites")) for (const r of favs) tb.appendChild(paramRow(r, 1, true));
      }
      if (showUser) {
        const us = sorted(rows.user.filter((r) => matches(r)));
        tb.appendChild(groupRow({ key: "user", label: "User Parameters", level: 0, bold: true, icon: G.fxSmall(), iconClass: "pm-gico-fx", kids: us.length }));
        if (!isCollapsed("user")) for (const r of us) tb.appendChild(paramRow(r, 1));
      }
      if (showModel) {
        const groups = rows.groups.map((g) => ({ g, items: sorted(g.items.filter((r) => matches(r, g.feature.name))) })).filter((x) => x.items.length);
        tb.appendChild(groupRow({ key: "model", label: "Model Parameters", level: 0, bold: true, icon: G.model(), kids: 1 }));
        if (!isCollapsed("model")) {
          const compName = app.doc.fileId ? app.doc.name || "Untitled" : "(Unsaved)";
          tb.appendChild(groupRow({ key: "comp", label: compName, level: 1, icon: G.component(), kids: groups.length }));
          if (!isCollapsed("comp")) {
            for (const { g, items } of groups) {
              const fkey = `f:${g.feature.id}`;
              const res = app.featureResult(g.feature.id);
              const extra = res && res.ok === false ? el("span", { class: "pm-ferr", title: res.error || "Feature failed to compute", html: `${glyphHtml("warning", 14)} ${esc(res.error || "Error")}` })
                : res && res.rolled ? el("span", { class: "pm-dim", text: " (rolled back)" }) : g.feature.suppressed ? el("span", { class: "pm-dim", text: " (suppressed)" }) : null;
              tb.appendChild(groupRow({ key: fkey, label: g.feature.name, level: 2, icon: featureIconHtml(g.feature), kids: items.length, extra, featureId: g.feature.id }));
              if (!isCollapsed(fkey)) for (const r of items) tb.appendChild(paramRow(r, 3));
            }
          }
        }
      }

      tableWrap.innerHTML = "";
      tableWrap.appendChild(table);
      tableWrap.scrollTop = scroll;
      updateButtons();
      if (focusKey) {
        const n = tableWrap.querySelector(`[data-input="${CSS.escape(focusKey)}"]`);
        if (n) { n.focus({ preventScroll: true }); if (caret && n.setSelectionRange) { try { n.setSelectionRange(caret[0], caret[1]); } catch { /* ignore */ } } }
      }
    }

    function updateButtons() {
      const s = state.selected;
      copyBtn.disabled = !(s && s.param);
      delBtn.disabled = !(s && s.user);
    }

    function select(sel, tr) {
      state.selected = sel;
      state.current = null;
      for (const n of tableWrap.querySelectorAll("tr.pm-cur")) n.classList.remove("pm-cur");
      for (const n of tableWrap.querySelectorAll("tr.pm-sel")) n.classList.remove("pm-sel");
      if (tr) tr.classList.add("pm-sel");
      updateButtons();
    }
    const isSelected = (sel) => {
      const s = state.selected;
      return !!s && ((s.param && sel.param && s.name === sel.name && !!s.fav === !!sel.fav) || (s.group && sel.group && s.key === sel.key));
    };

    function featureIconHtml(f) { try { return featureIcon(f, { size: 16 }); } catch { return ""; } }

    /** Tree node row. Indentation follows Fusion: chevron 9 + 19·level, icon 28 + 19·level, text 39 + 19·level. */
    function groupRow(o) {
      const collapsed = isCollapsed(o.key);
      const hasKids = o.kids > 0;
      const sel = { group: true, key: o.key };
      const tr = el("tr", { class: `pm-group pm-l${o.level}${o.bold ? " pm-bold" : ""}${collapsed && hasKids ? " pm-collapsed" : ""}${isSelected(sel) ? " pm-sel" : !state.selected && state.current === o.key ? " pm-cur" : ""}`, dataset: { group: o.key } });
      if (o.featureId) tr.dataset.feature = o.featureId;
      const td = el("td", { colspan: "6" });
      const cell = el("div", { class: "pm-node", style: { paddingLeft: `${19 * o.level}px` } });
      const tog = el("span", { class: "pm-tog", html: hasKids ? (collapsed ? G.chevRight() : G.chevDown()) : "" });
      cell.appendChild(tog);
      if (o.icon) cell.appendChild(el("span", { class: `pm-gico ${o.iconClass || ""}`, html: o.icon }));
      else if (!o.plain) cell.appendChild(el("span", { class: "pm-gico" }));
      cell.appendChild(el("span", { class: `pm-glabel${o.plain ? " pm-glabel-plain" : ""}`, text: o.label }));
      if (o.extra) cell.appendChild(o.extra);
      td.appendChild(cell);
      tr.appendChild(td);
      const flip = () => { if (!hasKids || state.filter) return; setCollapsed(o.key, !isCollapsed(o.key)); render(); };
      tog.addEventListener("click", (ev) => { ev.stopPropagation(); flip(); });
      tr.addEventListener("click", () => select(sel, tr));
      tr.addEventListener("dblclick", flip);
      return tr;
    }

    function paramRow(r, level, inFav = false) {
      const pre = inFav ? "fav:" : "";
      const sel = { param: true, name: r.name, user: r.user, fav: inFav };
      const tr = el("tr", { class: `pm-row${r.user ? " pm-user" : ""}${r.error ? " pm-row-err" : ""}${isSelected(sel) ? " pm-sel" : ""}`, dataset: { param: r.name } });
      tr.addEventListener("click", (ev) => { if (ev.target.closest("input, select, button")) { if (!isSelected(sel)) select(sel, tr); return; } select(sel, tr); });
      // Parameter column: favourite star + Fusion's parameter name
      const star = el("button", { type: "button", class: `pm-star${r.fav ? " on" : ""}`, title: r.fav ? "Remove from Favorites" : "Add to Favorites", html: r.fav ? G.starFilled() : G.starOutline() });
      star.addEventListener("click", (ev) => {
        ev.stopPropagation();
        mutate(r.fav ? "Remove Favorite" : "Add Favorite", (doc) => {
          const s = new Set(doc.paramFavorites || []);
          if (s.has(r.name)) s.delete(r.name); else s.add(r.name);
          doc.paramFavorites = [...s];
        }, { recompute: false });
        render();
      });
      const pcell = el("div", { class: "pm-node", style: { paddingLeft: `${19 * level}px` } }, el("span", { class: "pm-tog" }), star, el("span", { class: "pm-plabel", text: r.label || "" }));
      tr.appendChild(el("td", { class: "pm-param", title: r.user ? "User Parameter" : r.label }, pcell));

      // name (editable)
      const name = el("input", { type: "text", class: "pm-in pm-name", value: r.name, spellcheck: "false", "data-input": `${pre}name:${r.name}` });
      bindCommit(name, r.name, (v) => {
        if (v === r.name) return null;
        const e = validateName(v, r.name);
        if (e) return e;
        mutate("Rename Parameter", (doc) => renameInDoc(doc, r.name, v));
        if (state.selected && state.selected.name === r.name) state.selected.name = v;
        scheduleRender();
        return null;
      });
      tr.appendChild(el("td", {}, name));

      // unit
      if (r.user) {
        const selU = el("select", { class: "pm-in pm-unit", "data-input": `${pre}unit:${r.name}` }, ...UNIT_CHOICES.map((u) => el("option", { value: u, text: u, selected: u === r.unit })));
        selU.addEventListener("change", () => {
          const u = selU.value;
          const kind = unitKind(u);
          const ue = unitError(r.expr, kind);
          if (ue) { app.toast(ue, "error", 3500); selU.value = r.unit; return; }
          mutate("Change Parameter Unit", (doc) => { const up = doc.params.find((p) => p.name === r.name); if (up) { up.unit = u; up.kind = kind; } });
          scheduleRender();
        });
        tr.appendChild(el("td", {}, selU));
      } else tr.appendChild(el("td", { class: "pm-unit-ro", text: r.unit }));

      // expression
      const ex = el("input", { type: "text", class: `pm-in pm-expr${r.error ? " pm-invalid" : ""}`, value: r.expr, spellcheck: "false", "data-input": `${pre}expr:${r.name}`, title: r.error || "" });
      bindCommit(ex, r.expr, (v) => {
        if (v === r.expr) return null;
        let expr = v;
        if (r.user && isBareNumber(expr) && r.unit !== "No Units" && r.kind !== "none") expr = `${expr.trim()} ${r.unit}`;
        const res = validateExpr(r, expr);
        if (res.error) return res.error;
        mutate("Change Parameter", (doc) => setExpr(doc, r, expr));
        r.expr = expr;
        ex.value = expr;
        refreshValues();
        return null;
      });
      tr.appendChild(el("td", {}, ex));

      // value
      tr.appendChild(el("td", { class: "pm-value", text: r.error ? "Error" : fmt(r.value, r.unit, r.kind), title: r.error || "" }));

      // comment
      const cm = el("input", { type: "text", class: "pm-in pm-comment", value: r.comment, "data-input": `${pre}comment:${r.name}` });
      bindCommit(cm, r.comment, (v) => {
        if (v === r.comment) return null;
        mutate("Change Parameter Comment", (doc) => {
          if (r.user) { const up = doc.params.find((p) => p.name === r.name); if (up) up.comment = v; }
          else { doc.paramComments = doc.paramComments || {}; if (v) doc.paramComments[r.name] = v; else delete doc.paramComments[r.name]; }
        }, { recompute: false });
        r.comment = v;
        return null;
      });
      tr.appendChild(el("td", {}, cm));
      return tr;
    }

    /** Commit on Enter / blur; Esc reverts. commit(v) returns an error string or null. */
    function bindCommit(input, original, commit) {
      let orig = original;
      const showErr = (e) => {
        input.classList.toggle("pm-invalid", !!e);
        input.title = e || "";
        const tr = input.closest("tr");
        if (e) showTip(input, e); else hideTip();
        if (tr && !e) tr.classList.remove("pm-row-err");
      };
      const doCommit = () => {
        const v = input.value.trim();
        if (v === orig) { showErr(null); return true; }
        let e;
        try { e = commit(v); } catch (ex) { e = ex.message || String(ex); }
        if (e) { showErr(e); return false; }
        orig = v;
        showErr(null);
        return true;
      };
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); doCommit(); }
        else if (ev.key === "Escape") {
          if (input.value.trim() !== orig || input.classList.contains("pm-invalid")) { ev.preventDefault(); ev.stopPropagation(); input.value = orig; showErr(null); }
        }
      });
      input.addEventListener("blur", () => { doCommit(); });
      input.addEventListener("focus", () => { if (input.classList.contains("pm-invalid") && input.title) showTip(input, input.title); });
    }

    let tip = null;
    function showTip(input, msg) {
      hideTip();
      const r = input.getBoundingClientRect();
      tip = el("div", { class: "pm-tip", text: msg });
      handle.root.appendChild(tip);
      tip.style.left = `${Math.round(r.left)}px`;
      tip.style.top = `${Math.round(r.bottom + 3)}px`;
    }
    function hideTip() { if (tip) { tip.remove(); tip = null; } }

    /** Update value/error cells in place (keeps focus) after an expression change. */
    function refreshValues() {
      const rows = computeRows();
      for (const tr of tableWrap.querySelectorAll("tr.pm-row")) {
        const r = findRow(rows, tr.dataset.param);
        if (!r) continue;
        const vc = tr.querySelector(".pm-value");
        if (vc) { vc.textContent = r.error ? "Error" : fmt(r.value, r.unit, r.kind); vc.title = r.error || ""; }
        tr.classList.toggle("pm-row-err", !!r.error);
        const ex = tr.querySelector(".pm-expr");
        if (ex && document.activeElement !== ex) { ex.value = r.expr; ex.classList.toggle("pm-invalid", !!r.error); ex.title = r.error || ""; }
      }
      for (const tr of tableWrap.querySelectorAll("tr.pm-group[data-feature]")) {
        const res = app.featureResult(tr.dataset.feature);
        const node = tr.querySelector(".pm-node");
        const old = node && node.querySelector(".pm-ferr");
        if (old) old.remove();
        if (node && res && res.ok === false) node.appendChild(el("span", { class: "pm-ferr", title: res.error || "", html: `${glyphHtml("warning", 14)} ${esc(res.error || "Error")}` }));
      }
    }

    async function deleteUserParam(name) {
      const by = referencedBy(name);
      if (by) {
        await modals.alert({ id: "DeleteParamError", title: "Parameter deletion failed.", kind: "error", message: `Parameter '${esc(name)}' cannot be deleted.  It is used in the expression of another parameter, '${esc(by)}'.` });
        return;
      }
      mutate("Delete Parameter", (doc) => {
        doc.params = doc.params.filter((p) => p.name !== name);
        if (Array.isArray(doc.paramFavorites)) doc.paramFavorites = doc.paramFavorites.filter((n) => n !== name);
      });
      if (state.selected && state.selected.name === name) state.selected = null;
      render();
    }

    function copySelected() {
      const s = state.selected;
      if (!s || !s.param) return;
      const r = findRow(computeRows(), s.name);
      if (!r) return;
      const nm = uniqueName(`${r.name}_copy`);
      const unit = r.user ? r.unit : r.kind === "angle" ? "deg" : r.kind === "none" ? "No Units" : "mm";
      mutate("Copy Parameter", (doc) => { doc.params.push({ name: nm, expr: r.expr, kind: unitKind(unit), unit, comment: r.comment || "" }); });
      TREE.collapsed.delete("user");
      state.selected = { param: true, name: nm, user: true };
      render();
    }

    function importCSV(text) {
      const rowsCsv = parseCSV(text);
      if (!rowsCsv.length) { app.toast("The file has no parameters", "warning"); return; }
      const head = rowsCsv[0].map((h) => h.trim().toLowerCase());
      const col = (n) => head.indexOf(n);
      const iName = col("name"), iUnit = col("unit"), iExpr = col("expression"), iCom = col("comments") >= 0 ? col("comments") : col("comment");
      if (iName < 0 || iExpr < 0) { app.toast("The CSV file needs Name and Expression columns", "error", 4000); return; }
      let added = 0, updated = 0;
      const errors = [];
      for (const line of rowsCsv.slice(1)) {
        const nm = (line[iName] || "").trim();
        const expr = (line[iExpr] || "").trim();
        if (!nm || !expr) continue;
        const rows = computeRows();
        const existing = findRow(rows, nm);
        if (existing) {
          if (existing.expr === expr) continue;
          const res = validateExpr(existing, expr);
          if (res.error) { errors.push(`${nm}: ${res.error}`); continue; }
          mutate("Import Parameters", (doc) => setExpr(doc, existing, expr));
          updated++;
        } else {
          const e1 = validateName(nm, null);
          if (e1) { errors.push(`${nm}: ${e1}`); continue; }
          let unit = iUnit >= 0 ? (line[iUnit] || "").trim() : "mm";
          if (!UNIT_CHOICES.includes(unit)) unit = unit === "" ? "No Units" : "mm";
          const kind = unitKind(unit);
          const d = clone(app.doc);
          d.params.push({ name: nm, expr, kind, unit, comment: iCom >= 0 ? (line[iCom] || "").trim() : "" });
          try { const v = M.buildParams(d).value(nm); if (!Number.isFinite(v)) throw new Error("not a number"); } catch (ex) { errors.push(`${nm}: ${ex.message || ex}`); continue; }
          mutate("Import Parameters", (doc) => { doc.params.push({ name: nm, expr, kind, unit, comment: iCom >= 0 ? (line[iCom] || "").trim() : "" }); });
          added++;
        }
      }
      render();
      app.toast(`Imported parameters: ${added} added, ${updated} updated${errors.length ? `, ${errors.length} skipped (${errors[0]})` : ""}`, errors.length ? "warning" : "info", 4000);
    }

    function addUserParamDialog() {
      const P = params();
      let n = 1;
      while (P && P.has(`user${n}`)) n++;
      const name = el("input", { type: "text", class: "mn-input", value: "", placeholder: `user${n}`, "data-input": "name", spellcheck: "false" });
      const unit = el("select", { class: "mn-select", "data-input": "unit" }, ...UNIT_CHOICES.map((u) => el("option", { value: u, text: u, selected: u === "mm" })));
      const expr = el("input", { type: "text", class: "mn-input", value: "1 mm", "data-input": "expression", spellcheck: "false" });
      const comment = el("input", { type: "text", class: "mn-input", value: "", "data-input": "comment" });
      const err = el("div", { class: "mn-field-error" });
      unit.addEventListener("change", () => {
        const u = unit.value;
        const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+))\s*(mm|cm|m|in|ft|deg|rad)?\s*$/.exec(expr.value);
        if (m) expr.value = u === "No Units" ? m[1] : `${m[1]} ${u}`;
      });
      modals.open({
        id: "AddUserParameter",
        title: "Add User Parameter",
        width: 360,
        body: el("div", { class: "mn-form" },
          el("label", { class: "mn-row" }, el("span", { class: "mn-label", text: "Name" }), name),
          el("label", { class: "mn-row" }, el("span", { class: "mn-label", text: "Unit" }), unit),
          el("label", { class: "mn-row" }, el("span", { class: "mn-label", text: "Expression" }), expr),
          el("label", { class: "mn-row" }, el("span", { class: "mn-label", text: "Comment" }), comment),
          err),
        buttons: [
          { action: "ok", label: "OK", primary: true, onClick: () => {
            const nm = name.value.trim() || `user${n}`;
            const e1 = validateName(nm, null);
            if (e1) { err.textContent = e1; name.focus(); return false; }
            const u = unit.value;
            const kind = unitKind(u);
            let x = expr.value.trim();
            if (isBareNumber(x) && kind !== "none") x = `${x} ${u}`;
            const ue = unitError(x, kind);
            if (ue) { err.textContent = ue; expr.focus(); return false; }
            const d = clone(app.doc);
            d.params.push({ name: nm, expr: x, kind, unit: u, comment: comment.value.trim() });
            try { const v = M.buildParams(d).value(nm); if (!Number.isFinite(v)) throw new Error("The expression does not evaluate to a number"); } catch (ex) { err.textContent = ex.message || String(ex); expr.focus(); return false; }
            mutate("Add User Parameter", (doc) => { doc.params.push({ name: nm, expr: x, kind, unit: u, comment: comment.value.trim() }); });
            TREE.collapsed.delete("user");
            state.selected = { param: true, name: nm, user: true };
            render();
            return true;
          } },
          { action: "cancel", label: "Cancel" },
        ],
      });
    }

    function commitSession() {
      hideTip();
      if (state.pendingCompute) { state.pendingCompute = false; app.recompute(); }
      if (!session.changed) return;
      const h = app.history;
      const start = Math.min(session.startLen, h.undoStack.length);
      const n = h.undoStack.length - start;
      if (n > 1) {
        h.undoStack.splice(start);
        h.undoStack.push({ label: "Change Parameters", doc: session.before });
        app.emit("history", {});
      }
    }
    function revertSession() {
      hideTip();
      if (!session.changed) { if (state.pendingCompute) app.recompute(); return; }
      const h = app.history;
      h.undoStack.length = Math.min(session.startLen, h.undoStack.length);
      h.redoStack = session.redo;
      app._replaceDoc(clone(session.before));
      app.dirty = session.dirty;
      app.emit("history", {});
    }

    handle.modal.addEventListener("scroll", hideTip, true);
    render();
    return handle;
  }

  return { open, computeRows, validateExpr, validateName, renameInDoc, toCSV, parseCSV, get current() { return current; } };
}
