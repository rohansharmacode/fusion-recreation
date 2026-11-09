// configure module: Fusion's design configurations (SOLID / SURFACE / MESH / SHEET METAL / PLASTIC > CONFIGURE).
//   FusionStartDesignConfigModeCmd   Configure: opens the Configuration Table and enters Configuration Mode
//   FusionShowDesignConfigPanelCmd   Display Configuration Table: shows / hides the table (checked while shown)
//   FusionConfigurationRulesCmd      Create Configuration Rules: the rules editor (rules evaluated locally)
//   ConfigureFeatureCmd / ConfigureEntityCmd   "Configure" in the Timeline / Browser context menus
// Data lives in doc.configurations (data.js); activating a configuration writes its values into the
// document through app.mutate (parameters, f.suppressed, body visibility / appearance / material) and the
// normal evaluator recomputes, so undo/redo and save/open work like any other edit.
// Public API: app.ui.configure (see README.md).
import "./style.css";
import * as D from "./data.js";
import * as RL from "./rules.js";
import { createTable } from "./table.js";
import { createMode } from "./mode.js";
import { createSelector } from "./selector.js";
import { openConfigure, openParameters } from "./dialogs.js";
import { openRules } from "./rules-ui.js";

const POSITIVE = new Set(["fillet.radius", "chamfer.distance", "shell.thickness", "hole.diameter", "hole.depth", "hole.cbD", "hole.cbDepth", "hole.csD",
  "box.length", "box.width", "box.height", "cylinder.diameter", "cylinder.height", "sphere.diameter", "torus.d1", "torus.d2",
  "coil.diameter", "coil.revolutions", "coil.sectionSize", "pipe.sectionSize", "thread.length", "scale.factor", "scale.sx", "scale.sy", "scale.sz"]);
const COUNT = new Set(["rpattern.q1", "rpattern.q2", "cpattern.count"]);

export function init(app) {
  const M = app.M;
  let internal = 0;
  let prevUserParams = app.doc.params.map((p) => p.name);
  let evalCache = { ver: -1, res: null };
  let docVer = 0; // bumped on every document change: keys the per-row number / rule caches
  app.on("doc", () => { docVer++; });

  const lib = () => (app.ui.inspect || {});
  const materialAppearance = (id) => { const m = (lib().materials || {})[id]; return m ? m.appearance : null; };
  const applyOpts = { materialAppearance };

  /** One undoable change of configuration data; `apply` re-writes the active row into the document. */
  function change(label, fn, { apply = true, recompute = true } = {}) {
    internal++;
    try {
      return app.mutate(label, (doc) => {
        const r = fn(doc);
        const c = D.get(doc);
        if (c) D.normalize(c);
        if (apply && c) D.applyRow(doc, c.active, M, applyOpts);
        return r;
      }, { recompute });
    } finally { internal--; }
  }
  const leaveSketch = () => {
    if (app.mode !== "sketch") return;
    try { if (app.commands.has("SketchStop") && !app.commands.get("SketchStop").stub) app.commands.run("SketchStop"); } catch (e) { console.error(e); }
    if (app.mode === "sketch") app.setMode("model", null);
  };

  // ------------------------------------------------------------------ controller (used by the UI files)
  const ctl = {
    app,
    get c() { return D.get(app.doc); },
    enterMode() { table.show(); mode.enter(); },
    exitMode() { mode.exit(); },
    showTable() { table.show(); },
    startConfigure() { table.show(); mode.enter(); },
    openParameters() { mode.enter(); table.show(); return openParameters(app, ctl); },
    openRules() { return openRules(app, ctl); },
    configure(target) { if (!table.visible) table.show(); return openConfigure(app, ctl, target); },
    library(table) {
      if (table === "appearance") {
        const src = { ...(lib().appearances || {}), ...(app.appearances || {}) };
        return Object.entries(src).map(([id, a]) => ({ id, name: a.name || id, category: (lib().appearances && lib().appearances[id] && lib().appearances[id].category) || a.category || "" }))
          .sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
      }
      const mats = lib().materials || { steel: { id: "steel", name: "Steel", category: "Metal" } };
      return Object.values(mats).map((m) => ({ id: m.id, name: m.name, category: m.category || "" }))
        .sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
    },
    swatch(table, id) {
      if (table !== "appearance") return null;
      const a = (app.appearances || {})[id] || (lib().appearances || {})[id];
      return a ? a.color : null;
    },

    activate(rowId) {
      const c = D.get(app.doc);
      if (!c || !D.row(c, rowId)) return false;
      if (rowId === c.active) return true;
      leaveSketch();
      const name = D.row(c, rowId).name;
      change(`Activate ${name}`, (doc) => { D.get(doc).active = rowId; });
      return true;
    },
    addConfigurations(n = 1) {
      const made = change(n > 1 ? `Add ${n} Configurations` : "Add Configuration", (doc) => {
        const rows = D.addRows(doc, n);
        RL.enforce(doc, M, rows.map((r) => r.id));
        return rows;
      }, { recompute: false });
      return made;
    },
    duplicate(ids) {
      return change("Duplicate Configuration", (doc) => { const rows = D.duplicateRows(doc, ids); RL.enforce(doc, M, rows.map((r) => r.id)); return rows; }, { recompute: false });
    },
    deleteRows(ids) {
      const c = D.get(app.doc);
      if (!c) return [];
      if (ids.includes(c.rows[0].id)) { app.toast("The first row represents the Default Configuration. It cannot be moved, sorted, or deleted.", "warning", 4000); return []; }
      const wasActive = ids.includes(c.active);
      return change(ids.length > 1 ? "Delete Configurations" : "Delete Configuration", (doc) => D.deleteRows(doc, ids), { recompute: wasActive });
    },
    renameRow(id, name) { return change("Rename Configuration", (doc) => D.renameRow(doc, id, name), { apply: false, recompute: false }); },
    setProperty(rowId, field, value) {
      return change("Edit Configuration Properties", (doc) => {
        const c = D.ensure(doc);
        const r = D.row(c, rowId === "__default" ? c.rows[0].id : rowId);
        if (r) r[field] = String(value || "");
      }, { apply: false, recompute: false });
    },
    /** Number of a parameter cell (cached per document state), undefined when invalid. */
    cellNumber(rowId, colId) {
      const c = D.get(app.doc);
      if (!c) return undefined;
      if (numCache.ver !== docVer || numCache.doc !== app.doc) numCache = { ver: docVer, doc: app.doc, rows: {} };
      if (!numCache.rows[rowId]) numCache.rows[rowId] = D.rowNumbers(app.doc, rowId, M);
      return numCache.rows[rowId][colId];
    },
    /** Edit a top-table cell. Returns false (and says why) when the value is rejected. */
    setCell(rowId, colId, value) {
      const c = D.get(app.doc);
      const col = c && D.column(c, colId);
      if (!col || !D.row(c, rowId)) return false;
      if (col.kind === "param") {
        const expr = String(value).trim();
        if (!expr) { app.toast("Enter an expression", "error"); return false; }
        const t = D.paramTarget(app.doc, col, M);
        if (!t) { app.toast("This aspect no longer exists", "error"); return false; }
        let e2 = expr;
        if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(e2)) e2 = D.numExpr(Number(e2), t.kind); // bare number gets the unit
        const err = validateExpr(rowId, col, e2);
        if (err) { app.toast(`${D.describe(app.doc, col, M).title}: ${err}`, "error", 4000); return false; }
        value = e2;
      } else if (col.kind === "suppress" || col.kind === "visibility") value = !!value;
      const v = RL.checkEdit(app.doc, rowId, colId, value, M);
      if (v) { app.toast(`${v.title}. ${v.text}${v.rule ? ` (Rule: ${v.rule})` : ""}`, "warning", 5000); return false; }
      const isActive = rowId === c.active;
      change("Edit Configuration Table", (doc) => {
        const cc = D.get(doc);
        cc.cells[rowId] = cc.cells[rowId] || {};
        cc.cells[rowId][colId] = value;
        RL.enforce(doc, M, [rowId]);
      }, { apply: isActive, recompute: isActive });
      return true;
    },
    setThemeCell(table, themeRowId, colId, value) {
      const c = D.get(app.doc);
      const th = c && c.themes[table];
      if (!th || !value) return false;
      const top = c.columns.find((x) => x.kind === "theme" && x.table === table);
      const used = top && c.cells[c.active] && c.cells[c.active][top.id] === themeRowId;
      change(table === "appearance" ? "Edit Appearance Theme" : "Edit Physical Material Theme", (doc) => {
        const t = D.get(doc).themes[table];
        t.cells[themeRowId] = t.cells[themeRowId] || {};
        t.cells[themeRowId][colId] = value;
      }, { apply: !!used, recompute: !!used });
      return true;
    },
    addThemes(table, n = 1) {
      const c = D.get(app.doc);
      const top = c && c.columns.find((x) => x.kind === "theme" && x.table === table);
      const src = top && c.cells[c.active] ? c.cells[c.active][top.id] : null;
      return change("Add Themes", (doc) => D.addThemeRows(doc, table, n, src), { apply: false, recompute: false });
    },
    renameTheme(table, id, name) { return change("Rename Theme", (doc) => D.renameThemeRow(doc, table, id, name), { apply: false, recompute: false }); },
    duplicateTheme(table, id) { return change("Duplicate Theme", (doc) => D.duplicateThemeRow(doc, table, id), { apply: false, recompute: false }); },
    deleteTheme(table, id) {
      const c = D.get(app.doc);
      const th = c && c.themes[table];
      if (!th || th.rows[0].id === id) return false;
      return change("Delete Theme", (doc) => D.deleteThemeRow(doc, table, id));
    },
    deleteThemeTable(table) { return change(table === "appearance" ? "Delete Appearance Theme Table" : "Delete Physical Material Theme Table", (doc) => D.deleteThemeTable(doc, table), { apply: false, recompute: false }); },
    renameColumn(colId, title) {
      const c = D.get(app.doc);
      const col = c && D.column(c, colId);
      if (!col) return false;
      title = String(title || "").trim();
      if (!title) return false;
      // Fusion: renaming a parameter column renames the parameter itself
      if (col.kind === "param") {
        const t = D.paramTarget(app.doc, col, M);
        const P = app.ui.parameters;
        if (t && title !== t.name) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(title)) { app.toast("Parameter names must start with a letter and contain only letters, digits and _", "error", 4000); return false; }
          let P2 = null;
          try { P2 = M.buildParams(app.doc); } catch { P2 = null; }
          if (P2 && P2.has(title)) { app.toast(`A parameter named "${title}" already exists`, "error", 4000); return false; }
          const old = t.name;
          change(`Rename Column ${old}`, (doc) => {
            if (P && P.renameInDoc) P.renameInDoc(doc, old, title);
            else renameParamInDoc(doc, col, old, title);
            const cc = D.get(doc);
            const cl = D.column(cc, colId);
            if (cl.user) cl.name = title;
            cl.param = title;
            // configured expressions in every row follow the rename
            const re = new RegExp(`\\b${old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
            for (const r of cc.rows) for (const x of cc.columns) if (x.kind === "param" && typeof (cc.cells[r.id] || {})[x.id] === "string") cc.cells[r.id][x.id] = cc.cells[r.id][x.id].replace(re, title);
          });
          prevUserParams = app.doc.params.map((p) => p.name);
          return true;
        }
        return false;
      }
      return change("Rename Column", (doc) => { D.column(D.get(doc), colId).title = title; }, { apply: false, recompute: false });
    },
    deleteColumn(colId) {
      const c = D.get(app.doc);
      const col = c && D.column(c, colId);
      if (!col) return false;
      // Fusion: when an aspect column is deleted every configuration keeps the active configuration's value
      return change(col.kind === "theme" ? "Delete Theme Table" : "Delete Column", (doc) => D.deleteColumn(doc, colId), { apply: false, recompute: false });
    },
    removeAspect(tmpl) { return change("Delete Column", (doc) => D.removeAspect(doc, tmpl), { apply: false, recompute: false }); },
    bulk(colId, what) {
      const c = D.get(app.doc);
      const col = c && D.column(c, colId);
      if (!col) return false;
      const label = { suppressAll: "Suppress All", unsuppressAll: "Unsuppress All", showAll: "Show All", hideAll: "Hide All", invert: "Invert" }[what] || what;
      return change(label, (doc) => {
        const cc = D.get(doc);
        for (const r of cc.rows) {
          const cells = (cc.cells[r.id] = cc.cells[r.id] || {});
          const cur = col.kind === "visibility" ? cells[colId] !== false : !!cells[colId];
          cells[colId] = what === "suppressAll" || what === "showAll" ? true : what === "unsuppressAll" || what === "hideAll" ? false : !cur;
        }
        RL.enforce(doc, M);
      });
    },
    moveRow(id, to) { return change("Move Configuration", (doc) => D.moveRow(doc, id, to), { apply: false, recompute: false }); },
    moveColumn(id, to) { return change("Move Column", (doc) => D.moveColumn(doc, id, to), { apply: false, recompute: false }); },
    sortRows(dir) { return change(dir > 0 ? "Sort Rows From A to Z" : "Sort Rows From Z to A", (doc) => D.sortRows(doc, dir), { apply: false, recompute: false }); },
    sortColumns(how) { return change({ az: "Sort Columns From A to Z", za: "Sort Columns From Z to A", design: "Sort Columns By Design Order" }[how], (doc) => D.sortColumns(doc, how, M), { apply: false, recompute: false }); },
    /** Configure dialog OK: want[i] = aspect i should be configured. */
    setAspects(target, aspects, want) {
      const doc = app.doc;
      const add = aspects.filter((a, i) => want[i] && !D.isAspectConfigured(doc, a));
      const del = aspects.filter((a, i) => !want[i] && D.isAspectConfigured(doc, a));
      if (!add.length && !del.length) return null;
      const obj = target.kind === "body" ? doc.bodies[target.id] : app.feature(target.id);
      return change(`Configure ${obj ? obj.name : ""}`.trim(), (d) => {
        for (const a of del) D.removeAspect(d, a.col);
        for (const a of add) D.addAspect(d, a.col, M);
      }, { apply: false, recompute: false });
    },
    setParamConfigured(col, on) {
      const a = { col };
      if (on === D.isAspectConfigured(app.doc, a)) return;
      change(on ? "Configure Parameter" : "Unconfigure Parameter", (d) => { if (on) D.addAspect(d, col, M); else D.removeAspect(d, col); }, { apply: false, recompute: false });
    },
    applyRules(rules) {
      let changes = [];
      change("Configuration Rules", (doc) => {
        const c = D.ensure(doc);
        c.rules = D.clone(rules);
        changes = RL.enforce(doc, M);
      });
      return { changes };
    },
    evalAll() {
      const c = D.get(app.doc);
      if (!c) return {};
      if (evalCache.ver === docVer && evalCache.doc === app.doc) return evalCache.res;
      const res = {};
      for (const r of c.rows) res[r.id] = RL.evalRow(app.doc, r.id, M);
      evalCache = { ver: docVer, doc: app.doc, res };
      return res;
    },
    exportCSV() {
      const c = D.get(app.doc);
      if (!c) return;
      const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const cols = c.columns.map((col) => ({ col, d: D.describe(app.doc, col, M) }));
      const lines = [[q("Configurations"), q("Part Number"), q("Description"), ...cols.map(({ d }) => q(`${d.group} ${d.title}`.trim()))].join(",")];
      for (const r of c.rows) {
        lines.push([q(r.name), q(r.partNumber || r.name), q(r.description || ""), ...cols.map(({ col }) => {
          const v = (c.cells[r.id] || {})[col.id];
          if (col.kind === "suppress") return q(v ? "Suppressed" : "Unsuppressed");
          if (col.kind === "visibility") return q(v === false ? "Hidden" : "Visible");
          if (col.kind === "theme") { const th = c.themes[col.table]; return q((th && th.rows.find((x) => x.id === v) || {}).name || ""); }
          return q(v);
        })].join(","));
      }
      app.download(`${app.doc.name || "Untitled"} - Configurations.csv`, lines.join("\r\n"), "text/csv");
    },
  };
  let numCache = { ver: -1, doc: null, rows: {} };

  function validateExpr(rowId, col, expr) {
    const c = D.get(app.doc);
    const tmp = { ...app.doc, params: D.clone(app.doc.params), features: D.clone(app.doc.features), bodies: Object.fromEntries(Object.entries(app.doc.bodies || {}).map(([k, b]) => [k, { ...b }])), configurations: { ...c, cells: { ...c.cells, [rowId]: { ...(c.cells[rowId] || {}), [col.id]: expr } } } };
    D.applyRow(tmp, rowId, M);
    let v;
    try {
      const P = M.buildParams(tmp);
      const t = D.paramTarget(tmp, col, M);
      v = P.value(t.name);
    } catch (e) { return e.message || String(e); }
    if (!Number.isFinite(v)) return "The expression does not evaluate to a number";
    const t = D.paramTarget(app.doc, col, M);
    if (t && t.kind === "angle" && /\b(mm|cm|in|ft)\b/.test(expr) && !/\bdeg|rad\b/.test(expr)) return "The expression has the wrong unit type (expected an angle)";
    if (t && t.kind === "length" && /\b(deg|rad)\b/.test(expr)) return "The expression has the wrong unit type (expected a length)";
    if (!col.user) {
      const f = t && t.owner;
      const key = f ? `${f.type}.${col.field}` : "";
      if (col.cid && v <= 0 && t.kind !== "angle") return "Value must be greater than 0";
      if (POSITIVE.has(key) && v <= 0) return "Value must be greater than 0";
      if (COUNT.has(key) && v < 1) return "Quantity must be at least 1";
    }
    return null;
  }
  function renameParamInDoc(doc, col, old, nw) {
    const re = new RegExp(`\\b${old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    for (const p of doc.params) { if (p.name === old) p.name = nw; p.expr = String(p.expr).replace(re, nw); }
    for (const f of doc.features) {
      if (f.p) for (const [k, n] of Object.entries(f.p)) { if (n === old) f.p[k] = nw; }
      for (const k of Object.keys((M.FIELDS || {})[f.type] || {})) if (typeof f[k] === "string") f[k] = f[k].replace(re, nw);
      if (f.sk && f.sk.constraints) for (const c of f.sk.constraints) { if (c.param === old) c.param = nw; if (typeof c.expr === "string") c.expr = c.expr.replace(re, nw); }
    }
  }

  const table = createTable(app, ctl);
  const mode = createMode(app, ctl);
  const selector = createSelector(app, ctl);

  // ------------------------------------------------------------------ keep the active configuration in step with local edits
  app.on("doc", (d) => {
    if (d.replaced) { prevUserParams = app.doc.params.map((p) => p.name); return; }
    if (internal || d.saved) return;
    const c = D.get(app.doc);
    if (c) {
      // edits of configured aspects made anywhere in the app (Edit Feature, Change Parameters, suppress,
      // visibility, appearance ...) affect only the active configuration: write them into its row. The
      // undo snapshot taken by app.mutate is unaffected, so this is part of the same undoable step.
      D.followRenames(app.doc, prevUserParams);
      if (D.capture(app.doc, M) && c.rules.length) {
        // the edit must still satisfy the Configuration Rules: driven / limited values are re-applied
        const ch = RL.enforce(app.doc, M, [c.active]);
        if (ch.length) {
          D.applyRow(app.doc, c.active, M, applyOpts);
          app.toast(`Changes applied by configuration rule: ${ch.length} value${ch.length === 1 ? "" : "s"} of ${(D.activeRow(c) || {}).name || "the active configuration"} adjusted`, "warning", 4000);
        }
      }
    }
    prevUserParams = app.doc.params.map((p) => p.name);
  });
  app.on("file", (d) => {
    if (d.action === "new") { mode.exit(); table.hide(); }
    else if (d.action === "open") mode.exit();
  });

  // ------------------------------------------------------------------ commands (Fusion ids)
  app.commands.register({
    id: "FusionStartDesignConfigModeCmd", label: "Configure", kind: "tool", icon: "FusionStartDesignConfigModeCmd",
    tooltip: "Opens the Configuration Table, enters Configuration Mode, and highlights configurable features and objects in the Timeline and Browser.",
    checked: () => mode.active,
    run: () => { if (mode.active) { mode.exit(); return; } ctl.startConfigure(); },
  });
  app.commands.register({
    id: "FusionShowDesignConfigPanelCmd", label: "Display Configuration Table", kind: "ui", icon: "FusionShowDesignConfigPanelCmd",
    tooltip: "Shows or hides the configuration table.",
    checked: () => table.visible,
    run: () => table.toggle(),
  });
  app.commands.register({
    id: "FusionConfigurationRulesCmd", label: "Create Configuration Rules", kind: "ui", icon: "FusionConfigurationRulesCmd",
    tooltip: "Adds rules that limit which configurations are valid.",
    run: () => ctl.openRules(),
  });
  const ctxTarget = (ctx = {}) => {
    if (ctx.ref) {
      const r = ctx.ref;
      if (r.kind === "body" || r.kind === "face" || r.kind === "edge") return { kind: "body", id: r.body };
      if (r.kind === "feature" || r.kind === "cplane") return { kind: "feature", id: r.id };
    }
    if (ctx.body) return { kind: "body", id: ctx.body };
    if (ctx.id) return app.doc.bodies[ctx.id] && !app.feature(ctx.id) ? { kind: "body", id: ctx.id } : { kind: "feature", id: ctx.id };
    const s = app.selection.items[0];
    // recurse once only: a selection ref of another kind (a vertex) would otherwise recurse forever
    if (s && !ctx.fromSel) return ctxTarget({ ref: s, fromSel: true });
    return null;
  };
  const runConfigure = (a, ctx) => {
    const tg = ctxTarget(ctx);
    table.show();
    mode.enter();
    if (tg) openConfigure(app, ctl, tg);
  };
  app.commands.register({ id: "ConfigureFeatureCmd", label: "Configure", kind: "ui", icon: "FusionStartDesignConfigModeCmd", tooltip: "Configure aspects of this feature.", run: runConfigure });
  app.commands.register({ id: "ConfigureEntityCmd", label: "Configure", kind: "ui", icon: "FusionStartDesignConfigModeCmd", tooltip: "Configure aspects of this object.", run: runConfigure });
  app.commands.register({ id: "ActivateConfig", label: "Activate", kind: "ui", icon: "FusionShowDesignConfigPanelCmd", tooltip: "Activates a configuration.", run: (a, ctx = {}) => { const c = D.get(app.doc); const id = ctx.row || (c && ctx.name && (c.rows.find((r) => r.name === ctx.name) || {}).id); if (id) ctl.activate(id); } });

  // ------------------------------------------------------------------ public API (app.ui.configure)
  app.ui.configure = {
    data: D,
    rules: RL,
    get configured() { return D.isConfigured(app.doc); },
    get table() { return table; },
    get mode() { return mode; },
    get selector() { return selector; },
    configurations: () => { const c = D.get(app.doc); return c ? c.rows.map((r) => ({ id: r.id, name: r.name, active: r.id === c.active, partNumber: r.partNumber || "", description: r.description || "" })) : []; },
    active: () => { const c = D.get(app.doc); const r = c && D.activeRow(c); return r ? { id: r.id, name: r.name } : null; },
    columns: () => { const c = D.get(app.doc); return c ? c.columns.map((col) => ({ ...D.clone(col), ...D.describe(app.doc, col, M) })) : []; },
    activate: (idOrName) => { const c = D.get(app.doc); const r = c && (D.row(c, idOrName) || c.rows.find((x) => x.name === idOrName)); return r ? ctl.activate(r.id) : false; },
    addConfigurations: (n) => ctl.addConfigurations(n),
    addAspect: (tmpl) => change("Configure", (doc) => D.addAspect(doc, tmpl, M), { apply: false, recompute: false }),
    setCell: (row, col, v) => ctl.setCell(row, col, v),
    configure: (target) => ctl.configure(target),
    enterMode: () => ctl.enterMode(),
    exitMode: () => ctl.exitMode(),
    openRules: () => ctl.openRules(),
    openParameters: () => ctl.openParameters(),
    applyRules: (rules) => ctl.applyRules(rules),
    ctl,
  };
}
