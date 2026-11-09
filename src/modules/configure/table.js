// CONFIGURATION TABLE palette (Fusion's DesignConfigurationsPalette), docked along the bottom of the canvas.
//   header:  CONFIGURATION TABLE                                     − ×
//   bar:     Parameters | Properties   [1] (+ Add Configurations) | Add Aspects, Add Parameters | Configuration Rules ... (More)
//   top table: "Configurations" name column (row 1 = Default Configuration, active row marked) + one column per
//              configured aspect, grouped under the object name (Extrude1 > d3 / Suppression, Body1 > Visibility ...)
//   theme tables (Appearance Theme / Physical Material Theme) below the top table.
// Every edit goes through the controller (index.js) as one undoable step.
import * as D from "./data.js";
import * as RL from "./rules.js";
import { G } from "./glyphs.js";

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sandboxed */ } },
};
const KEY_H = "fr.configure.tableHeight";

export function createTable(app, ctl) {
  let visible = false, minimized = false, tab = "parameters";
  let height = Math.max(150, Math.min(600, Number(store.get(KEY_H, 236)) || 236));
  const selRows = new Set();
  let pending = false, renaming = null;

  const btn = (cfg, title, glyph, extra = {}) => h("button", { type: "button", class: `cfg-tb${extra.cls ? ` ${extra.cls}` : ""}`, "data-cfg": cfg, title, "aria-label": title, html: glyph, ...extra.attrs });
  const count = h("input", { class: "cfg-count", type: "number", min: "1", max: "100", value: "1", "data-cfg": "count", title: "Add Configuration Row Count" });
  const tabs = h("div", { class: "cfg-tabs", role: "tablist" },
    h("button", { type: "button", class: "cfg-tab on", "data-tab": "parameters", role: "tab", text: "Parameters" }),
    h("button", { type: "button", class: "cfg-tab", "data-tab": "properties", role: "tab", text: "Properties" }));
  const addBtn = btn("add-configurations", "Add Configurations\n\nAdds new Configurations to the Configured Design with column values that match the active Configuration.", G.addConfig());
  const bar = h("div", { class: "cfg-bar" },
    tabs, h("span", { class: "cfg-sep" }), count, addBtn,
    h("span", { class: "cfg-sep" }),
    btn("add-aspects", "Add Aspects\n\nEnters Configuration Mode and highlights configurable features and objects in the Timeline and Browser.\n\nClick a highlighted feature or object, then check each configurable aspect to add it as a column.", G.addAspects()),
    btn("add-parameters", "Add Parameters\n\nEnters Configuration Mode and opens the Parameters dialog.\n\nCheck parameters to add them to the Configuration Table.", G.addParams()),
    h("span", { class: "cfg-sep" }),
    btn("rules", "Configuration Rules", G.rules()),
    h("span", { class: "cfg-grow" }),
    btn("more", "More", G.more()));
  const title = h("span", { class: "cfg-title", text: "CONFIGURATION TABLE" });
  const head = h("div", { class: "cfg-head" }, title, h("span", { class: "cfg-grow" }),
    h("button", { type: "button", class: "cfg-hb", "data-cfg": "minimize", title: "Minimize", html: G.minimize() }),
    h("button", { type: "button", class: "cfg-hb", "data-cfg": "close", title: "Close", html: G.close() }));
  const scroll = h("div", { class: "cfg-scroll" });
  const resizer = h("div", { class: "cfg-resize", title: "Drag to resize" });
  const root = h("div", { class: "cfg-palette", "data-cfg-table": "", role: "region", "aria-label": "Configuration Table" }, resizer, head, bar, scroll);
  root.style.display = "none";
  (app.dom.workspace || document.body).appendChild(root);

  // ------------------------------------------------------------------ chrome
  function applyChrome() {
    root.style.display = visible ? "" : "none";
    root.classList.toggle("min", minimized);
    root.style.height = minimized ? "" : `${height}px`;
    head.querySelector('[data-cfg="minimize"]').innerHTML = minimized ? G.restore() : G.minimize();
    head.querySelector('[data-cfg="minimize"]').title = minimized ? "Restore" : "Minimize";
  }
  head.addEventListener("dblclick", (ev) => { if (!ev.target.closest("button")) { minimized = !minimized; applyChrome(); } });
  resizer.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || minimized) return;
    ev.preventDefault();
    const y0 = ev.clientY, h0 = height;
    const mv = (e) => { height = Math.max(120, Math.min(Math.round(window.innerHeight * 0.75), h0 + (y0 - e.clientY))); root.style.height = `${height}px`; };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); store.set(KEY_H, height); app.emit("layout", {}); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  });
  head.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-cfg]");
    if (!b) return;
    if (b.dataset.cfg === "close") api.hide();
    else if (b.dataset.cfg === "minimize") { minimized = !minimized; applyChrome(); }
  });
  tabs.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-tab]");
    if (!b) return;
    tab = b.dataset.tab;
    for (const x of tabs.children) x.classList.toggle("on", x === b);
    render();
  });
  bar.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-cfg]");
    if (!b) return;
    const what = b.dataset.cfg;
    if (what === "add-configurations") {
      const n = Math.max(1, Math.min(100, parseInt(count.value, 10) || 1));
      ctl.addConfigurations(n);
    } else if (what === "add-aspects") ctl.enterMode();
    else if (what === "add-parameters") ctl.openParameters();
    else if (what === "rules") ctl.openRules();
    else if (what === "more") moreMenu(b);
  });
  count.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); addBtn.click(); } ev.stopPropagation(); });

  function menu(items, anchor, opts = {}) {
    if (app.ui.menu && app.ui.menu.open) return app.ui.menu.open(items, anchor, { className: "cfg-menu", ...opts });
    // fallback: a plain list
    const host = app.dom.overlay || document.body;
    const m = h("div", { class: "cfg-fallback-menu" });
    const close = () => { m.remove(); window.removeEventListener("pointerdown", out, true); };
    const out = (e) => { if (!m.contains(e.target)) close(); };
    for (const it of items) {
      if (it === "-") { m.append(h("div", { class: "cfg-fm-sep" })); continue; }
      const r = h("div", { class: `cfg-fm-item${it.disabled ? " disabled" : ""}`, text: it.label });
      if (!it.disabled && it.onClick) r.addEventListener("click", () => { close(); it.onClick(); });
      m.append(r);
    }
    const p = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, bottom: anchor.y };
    m.style.left = `${p.left}px`; m.style.top = `${p.bottom}px`;
    host.append(m);
    setTimeout(() => window.addEventListener("pointerdown", out, true), 0);
    return { close };
  }
  function moreMenu(anchor) {
    const c = D.get(app.doc);
    const none = !c || !c.columns.length;
    menu([
      { label: "Sort Columns", items: [
        { label: "Sort Columns From A to Z", disabled: none, onClick: () => ctl.sortColumns("az") },
        { label: "Sort Columns From Z to A", disabled: none, onClick: () => ctl.sortColumns("za") },
        { label: "Sort Columns By Design Order", disabled: none, onClick: () => ctl.sortColumns("design") },
      ] },
      { label: "Sort Rows", items: [
        { label: "Sort Rows From A to Z", disabled: !c || c.rows.length < 3, onClick: () => ctl.sortRows(1) },
        { label: "Sort Rows From Z to A", disabled: !c || c.rows.length < 3, onClick: () => ctl.sortRows(-1) },
      ] },
      "-",
      { label: "Export Table (CSV)", disabled: !c, onClick: () => ctl.exportCSV() },
      { label: "Edit Configuration Rules", onClick: () => ctl.openRules() },
    ], anchor, { align: "right" });
  }

  // ------------------------------------------------------------------ rendering
  function scheduleRender() {
    if (!visible) return;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; if (!editingNow()) render(); else deferred = true; });
  }
  let deferred = false;
  const editingNow = () => { const a = document.activeElement; return !!(a && root.contains(a) && (a.tagName === "INPUT" || a.tagName === "SELECT") && a !== count) || !!renaming; };
  root.addEventListener("focusout", () => setTimeout(() => { if (deferred && !editingNow()) { deferred = false; render(); } }, 0));

  function render() {
    if (!visible) return;
    const doc = app.doc;
    const c = D.get(doc);
    const keep = scroll.scrollLeft, keepT = scroll.scrollTop;
    scroll.textContent = "";
    title.textContent = "CONFIGURATION TABLE";
    const rows = c ? c.rows : [{ id: "__default", name: "Configuration 1" }];
    const active = c ? c.active : "__default";
    for (const id of [...selRows]) if (!rows.some((r) => r.id === id)) selRows.delete(id);
    const evals = c && c.rules.length ? ctl.evalAll() : {};
    if (tab === "properties") { scroll.append(propertiesTable(c, rows, active)); restore(); return; }
    scroll.append(topTable(doc, c, rows, active, evals));
    if (c) for (const t of D.THEME_TABLES) if (c.themes[t]) scroll.append(themeTable(doc, c, t));
    if (!c || !c.columns.length) {
      scroll.append(h("div", { class: "cfg-hint" },
        h("span", { text: "Click " }), h("b", { text: "Add Aspects" }), h("span", { text: " to configure features and objects in the Timeline and Browser, or " }),
        h("b", { text: "Add Parameters" }), h("span", { text: " to configure parameters. Configured aspects are added to the table as columns." })));
    }
    restore();
    function restore() { scroll.scrollLeft = keep; scroll.scrollTop = keepT; }
  }

  function nameCell(r, i, active, onCtx, opts = {}) {
    const isActive = r.id === active;
    const td = h("td", { class: `cfg-name${isActive ? " active" : ""}${selRows.has(r.id) ? " sel" : ""}`, "data-row-name": r.id,
      title: i === 0 && !opts.theme ? "The first row represents the Default Configuration. It cannot be moved, sorted, or deleted." : opts.theme ? "Right-click a Theme to rename, duplicate, or delete it." : "Right-click a Configuration Name to activate, rename, duplicate, or delete it." },
      h("span", { class: "cfg-act", html: isActive ? G.active() : G.inactive(), title: isActive ? (opts.theme ? "Active Theme" : "Active Configuration") : (opts.theme ? "" : "Activate") }),
      h("span", { class: "cfg-nm", text: r.name }),
      i === 0 && !opts.theme ? h("span", { class: "cfg-def", text: " (Default)" }) : null);
    td.addEventListener("contextmenu", (ev) => { ev.preventDefault(); ev.stopPropagation(); onCtx(ev); });
    return td;
  }

  function topTable(doc, c, rows, active, evals) {
    const cols = c ? c.columns : [];
    const info = cols.map((col) => ({ col, d: D.describe(doc, col, app.M) }));
    const tbl = h("table", { class: "cfg-grid", "data-table": "top" });
    // header: group row + aspect row
    const g = h("tr", { class: "cfg-grp" }, h("th", { class: "cfg-name-h", rowspan: "2", title: "Right-click a Configuration Name to activate, rename, duplicate, or delete it.\n\nThe first row represents the Default Configuration. It cannot be moved, sorted, or deleted.", text: "Configurations" }));
    const a = h("tr", { class: "cfg-asp" });
    for (let i = 0; i < info.length;) {
      let j = i + 1;
      while (j < info.length && info[j].d.group === info[i].d.group && info[i].col.kind !== "theme") j++;
      g.append(h("th", { class: "cfg-gh", colspan: String(j - i), title: info[i].d.group, text: info[i].col.kind === "theme" ? "" : info[i].d.group }));
      i = j;
    }
    for (const { col, d } of info) {
      const th = h("th", { class: `cfg-ch cfg-k-${d.kind}${d.missing ? " missing" : ""}`, "data-col": col.id, title: d.tip },
        h("span", { class: "cfg-ch-ico", html: d.kind === "suppress" ? G.unsuppressed() : d.kind === "visibility" ? G.eye() : d.kind === "theme" ? G.table() : "" }),
        h("span", { class: "cfg-ch-t", text: d.title }));
      th.addEventListener("contextmenu", (ev) => { ev.preventDefault(); ev.stopPropagation(); columnMenu(col, d, ev); });
      dragReorder(th, "col", col.id, (from, to) => ctl.moveColumn(from, cols.findIndex((x) => x.id === to)));
      a.append(th);
    }
    if (!info.length) { g.append(h("th", { class: "cfg-gh cfg-empty-h", text: "" })); a.append(h("th", { class: "cfg-ch cfg-empty-h", text: "" })); }
    tbl.append(h("thead", {}, g, a));
    const body = h("tbody");
    rows.forEach((r, i) => {
      const tr = h("tr", { class: r.id === active ? "active" : "", "data-row": r.id });
      const nc = nameCell(r, i, active, (ev) => rowMenu(r, i, ev));
      nc.addEventListener("dblclick", (ev) => { if (!ev.target.closest(".cfg-rename")) ctl.activate(r.id); });
      if (i > 0 && c) dragReorder(nc, "row", r.id, (from, to) => ctl.moveRow(from, rows.findIndex((x) => x.id === to)));
      nc.querySelector(".cfg-act").addEventListener("click", (ev) => { ev.stopPropagation(); if (r.id !== active) ctl.activate(r.id); });
      nc.addEventListener("click", (ev) => {
        if (ev.target.closest(".cfg-rename") || ev.target.closest(".cfg-act")) return;
        if (ev.ctrlKey || ev.metaKey) { if (selRows.has(r.id)) selRows.delete(r.id); else selRows.add(r.id); }
        else { selRows.clear(); selRows.add(r.id); }
        for (const x of body.querySelectorAll("td.cfg-name")) x.classList.toggle("sel", selRows.has(x.dataset.rowName));
      });
      tr.append(nc);
      const ev = evals[r.id] || { driven: {}, limits: {} };
      for (const { col, d } of info) tr.append(cellFor(doc, c, r, col, d, ev));
      if (!info.length) tr.append(h("td", { class: "cfg-empty" }));
      body.append(tr);
    });
    tbl.append(body);
    return tbl;
  }

  function cellFor(doc, c, r, col, d, ev) {
    const v = c && c.cells[r.id] ? c.cells[r.id][col.id] : undefined;
    const st = RL.cellState(ev, col.id);
    const td = h("td", { class: `cfg-cell cfg-k-${d.kind}${st.driven ? " driven" : ""}${st.limit ? " limited" : ""}${d.missing ? " missing" : ""}`, "data-cell": `${r.id}:${col.id}` });
    const ruleTip = st.driven ? `Driven by rule\n\nThis aspect's value is driven by a configuration rule. If you need to edit the rule, use the Configuration Rules tool.\n\nRule: ${st.driven.rule}`
      : st.limit ? `Limited by rule\n\nThis aspect's value is limited by a configuration rule. If you need to edit the rule, use the Configuration Rules tool.\n\nRule: ${st.limit.rule}${RL.limitText(st.limit, D.colUnitKind(doc, col, app.M)) ? `\n${RL.limitText(st.limit, D.colUnitKind(doc, col, app.M))}` : ""}` : "";
    const disabled = d.missing || !!st.driven;
    if (d.kind === "expr") {
      const inp = h("input", { class: "cfg-in", value: v === undefined ? "" : String(v), spellcheck: "false", autocomplete: "off", "data-input": `${r.id}:${col.id}`, title: ruleTip || d.tip });
      if (disabled) inp.disabled = true;
      const num = ctl.cellNumber(r.id, col.id);
      if (v !== undefined && num === undefined && !d.missing) inp.classList.add("bad");
      let orig = inp.value;
      inp.addEventListener("focus", () => { orig = inp.value; inp.select(); });
      inp.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); inp.blur(); }
        else if (e.key === "Escape") { e.preventDefault(); inp.value = orig; inp.blur(); }
      });
      inp.addEventListener("change", () => {
        if (inp.value.trim() === orig.trim()) return;
        const okk = ctl.setCell(r.id, col.id, inp.value);
        if (!okk) { inp.value = orig; inp.classList.add("flash-bad"); setTimeout(() => inp.classList.remove("flash-bad"), 900); }
      });
      td.append(inp);
    } else if (d.kind === "suppress") {
      const sup = !!v;
      const b = h("button", { type: "button", class: `cfg-state${sup ? " off" : ""}`, "data-input": `${r.id}:${col.id}`, "data-value": sup ? "suppressed" : "unsuppressed",
        title: ruleTip || (sup ? "Suppressed" : "Unsuppressed"), html: `${sup ? G.suppressed() : G.unsuppressed()}<span>${sup ? "Suppressed" : "Unsuppressed"}</span>` });
      if (disabled) b.disabled = true;
      b.addEventListener("click", () => ctl.setCell(r.id, col.id, !sup));
      td.append(b);
    } else if (d.kind === "visibility") {
      const vis = v !== false;
      const b = h("button", { type: "button", class: `cfg-state${vis ? "" : " off"}`, "data-input": `${r.id}:${col.id}`, "data-value": vis ? "visible" : "hidden",
        title: ruleTip || (vis ? "Visible" : "Hidden"), html: `${vis ? G.eye() : G.eyeOff()}<span>${vis ? "Visible" : "Hidden"}</span>` });
      if (disabled) b.disabled = true;
      b.addEventListener("click", () => ctl.setCell(r.id, col.id, !vis));
      td.append(b);
    } else if (d.kind === "theme") {
      const th = c.themes[col.table];
      const sel = h("select", { class: "cfg-sel", "data-input": `${r.id}:${col.id}`, title: ruleTip || `Select a Theme for each configuration.\n\nActive Theme: ${(th && th.rows.find((x) => x.id === v) || {}).name || ""}` });
      for (const tr of th ? th.rows : []) {
        const allowed = !st.limit || ((!st.limit.list || st.limit.list.includes(tr.id)) && (!st.limit.exclude || !st.limit.exclude.includes(tr.id)));
        const o = h("option", { value: tr.id, text: tr.name });
        if (!allowed) o.disabled = true;
        sel.append(o);
      }
      sel.value = v || (th && th.rows[0] ? th.rows[0].id : "");
      if (disabled) sel.disabled = true;
      sel.addEventListener("keydown", (e) => e.stopPropagation());
      sel.addEventListener("change", () => { if (!ctl.setCell(r.id, col.id, sel.value)) sel.value = v; });
      td.append(sel);
    }
    if (st.driven) td.append(h("span", { class: "cfg-rule-mark", title: ruleTip, html: G.lock() }));
    else if (st.limit) td.append(h("span", { class: "cfg-rule-mark", title: ruleTip, html: G.funnel() }));
    return td;
  }

  function themeTable(doc, c, table) {
    const th = c.themes[table];
    const top = c.columns.find((x) => x.kind === "theme" && x.table === table);
    const activeTheme = top && c.cells[c.active] ? c.cells[c.active][top.id] : null;
    const tcount = h("input", { class: "cfg-count", type: "number", min: "1", max: "100", value: "1", title: "Add Theme Row Count" });
    tcount.addEventListener("keydown", (e) => e.stopPropagation());
    const addT = h("button", { type: "button", class: "cfg-tb", "data-cfg": `add-themes:${table}`, title: table === "appearance" ? "Add Themes\n\nAdds new Appearance Themes to the Configured Design with column values that match the active Appearance Theme." : "Add Themes\n\nAdds new Physical Material Themes to the Configured Design with column values that match the active Physical Material Theme.", html: G.addConfig() });
    addT.addEventListener("click", () => ctl.addThemes(table, Math.max(1, Math.min(100, parseInt(tcount.value, 10) || 1))));
    const titleEl = h("div", { class: "cfg-theme-title" }, h("span", { class: "cfg-theme-name", text: D.THEME_HEADER[table] }), h("span", { class: "cfg-sep" }), tcount, addT);
    titleEl.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      menu([{ label: table === "appearance" ? "Delete Appearance Theme Table" : "Delete Physical Material Theme Table", onClick: () => ctl.deleteThemeTable(table) }], { x: ev.clientX, y: ev.clientY });
    });
    const tbl = h("table", { class: "cfg-grid cfg-theme-grid", "data-table": table });
    const g = h("tr", { class: "cfg-grp" }, h("th", { class: "cfg-name-h", rowspan: "2", text: D.THEME_NAMES[table], title: table === "appearance" ? "In the Browser, right-click a component or body to configure its Appearance.\n\nRight-click a Theme to rename, duplicate, or delete it." : "In the Browser, right-click a component or body to configure its Physical Material.\n\nRight-click a Theme to rename, duplicate, or delete it." }));
    const a = h("tr", { class: "cfg-asp" });
    for (const tc of th.columns) {
      const nm = (doc.bodies[tc.body] && doc.bodies[tc.body].name) || "(aspect no longer exists)";
      g.append(h("th", { class: "cfg-gh", text: nm }));
      const hc = h("th", { class: "cfg-ch", "data-tcol": tc.id, title: table === "appearance" ? "Select an Appearance for the object in each theme." : "Select a Physical Material for the object in each theme.", text: D.THEME_TITLE[table] });
      hc.addEventListener("contextmenu", (ev) => { ev.preventDefault(); menu([{ label: "Delete", onClick: () => ctl.removeAspect({ kind: "theme", table, body: tc.body }) }], { x: ev.clientX, y: ev.clientY }); });
      a.append(hc);
    }
    tbl.append(h("thead", {}, g, a));
    const body = h("tbody");
    const lib = ctl.library(table);
    th.rows.forEach((tr, i) => {
      const row = h("tr", { class: tr.id === activeTheme ? "active" : "", "data-theme-row": tr.id });
      row.append(nameCell(tr, i, activeTheme, (ev) => themeRowMenu(table, tr, i, ev), { theme: true }));
      for (const tc of th.columns) {
        const v = th.cells[tr.id] ? th.cells[tr.id][tc.id] : undefined;
        const td = h("td", { class: "cfg-cell cfg-k-lib", "data-tcell": `${table}:${tr.id}:${tc.id}` });
        const sel = h("select", { class: "cfg-sel", "data-input": `${table}:${tr.id}:${tc.id}`, title: `${table === "appearance" ? "Active Theme Appearance" : "Active Theme material"}: ${(lib.find((x) => x.id === v) || {}).name || v || ""}` });
        const groups = new Map();
        for (const it of lib) { if (!groups.has(it.category)) groups.set(it.category, []); groups.get(it.category).push(it); }
        for (const [cat, items] of groups) {
          const og = cat ? h("optgroup", { label: cat }) : sel;
          for (const it of items) og.append(h("option", { value: it.id, text: it.name }));
          if (og !== sel) sel.append(og);
        }
        if (v && !lib.some((x) => x.id === v)) sel.append(h("option", { value: v, text: v }));
        sel.value = v || "";
        sel.addEventListener("keydown", (e) => e.stopPropagation());
        sel.addEventListener("change", () => ctl.setThemeCell(table, tr.id, tc.id, sel.value));
        if (!doc.bodies[tc.body]) sel.disabled = true;
        const sw = ctl.swatch(table, v);
        if (sw) td.append(h("span", { class: "cfg-swatch", style: `background:${sw}` }));
        td.append(sel);
        row.append(td);
      }
      body.append(row);
    });
    tbl.append(body);
    return h("div", { class: "cfg-theme", "data-theme": table }, titleEl, tbl);
  }

  function propertiesTable(c, rows, active) {
    const tbl = h("table", { class: "cfg-grid", "data-table": "properties" });
    tbl.append(h("thead", {}, h("tr", { class: "cfg-asp" },
      h("th", { class: "cfg-name-h", text: "Configurations" }),
      h("th", { class: "cfg-ch", title: "Part Number of each configuration.", text: "Part Number" }),
      h("th", { class: "cfg-ch cfg-wide", title: "Description of each configuration.", text: "Description" }))));
    const body = h("tbody");
    rows.forEach((r, i) => {
      const tr = h("tr", { class: r.id === active ? "active" : "", "data-row": r.id });
      const nc = nameCell(r, i, active, (ev) => rowMenu(r, i, ev));
      nc.addEventListener("dblclick", () => ctl.activate(r.id));
      tr.append(nc);
      for (const field of ["partNumber", "description"]) {
        const inp = h("input", { class: "cfg-in", value: r[field] || "", placeholder: field === "partNumber" ? r.name : "", "data-input": `${r.id}:${field}` });
        inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") inp.blur(); });
        inp.addEventListener("change", () => ctl.setProperty(r.id, field, inp.value));
        tr.append(h("td", { class: `cfg-cell${field === "description" ? " cfg-wide" : ""}` }, inp));
      }
      body.append(tr);
    });
    tbl.append(body);
    return tbl;
  }

  /** HTML5 drag to move rows / columns ("Move Rows and Columns"). */
  function dragReorder(el, kind, id, onDrop) {
    el.draggable = true;
    el.dataset.drag = kind;
    el.addEventListener("dragstart", (e) => {
      if (renaming) { e.preventDefault(); return; }
      e.dataTransfer.setData(`text/cfg-${kind}`, id);
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      root.dataset.dragging = kind;
    });
    el.addEventListener("dragend", () => { delete root.dataset.dragging; for (const x of root.querySelectorAll(".drop-target")) x.classList.remove("drop-target"); });
    el.addEventListener("dragover", (e) => { if (root.dataset.dragging !== kind) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; el.classList.add("drop-target"); });
    el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
    el.addEventListener("drop", (e) => {
      el.classList.remove("drop-target");
      const from = e.dataTransfer.getData(`text/cfg-${kind}`) || e.dataTransfer.getData("text/plain");
      if (!from || root.dataset.dragging !== kind) return;
      e.preventDefault();
      delete root.dataset.dragging;
      if (from !== id) onDrop(from, id);
    });
  }

  // ------------------------------------------------------------------ context menus
  function rowMenu(r, i, ev) {
    const c = D.get(app.doc);
    const ids = selRows.has(r.id) && selRows.size > 1 ? [...selRows] : [r.id];
    menu([
      { label: "Activate", cmd: "ActivateConfig", disabled: !c || r.id === c.active || ids.length > 1, onClick: () => ctl.activate(r.id) },
      "-",
      { label: "Rename", disabled: ids.length > 1, onClick: () => startRename(r.id) },
      { label: "Duplicate", onClick: () => ctl.duplicate(ids) },
      { label: "Delete", disabled: i === 0 || ids.some((id) => c && c.rows[0].id === id) || !c, onClick: () => ctl.deleteRows(ids) },
    ], { x: ev.clientX, y: ev.clientY });
  }
  function themeRowMenu(table, tr, i, ev) {
    menu([
      { label: "Rename", onClick: () => startRename(tr.id, table) },
      { label: "Duplicate", onClick: () => ctl.duplicateTheme(table, tr.id) },
      { label: "Delete", disabled: i === 0, onClick: () => ctl.deleteTheme(table, tr.id) },
    ], { x: ev.clientX, y: ev.clientY });
  }
  function columnMenu(col, d, ev) {
    const items = [];
    if (col.kind === "suppress") items.push(
      { label: "Suppress All", onClick: () => ctl.bulk(col.id, "suppressAll") },
      { label: "Unsuppress All", onClick: () => ctl.bulk(col.id, "unsuppressAll") },
      { label: "Invert", onClick: () => ctl.bulk(col.id, "invert") }, "-");
    if (col.kind === "visibility") items.push(
      { label: "Show All", onClick: () => ctl.bulk(col.id, "showAll") },
      { label: "Hide All", onClick: () => ctl.bulk(col.id, "hideAll") },
      { label: "Invert", onClick: () => ctl.bulk(col.id, "invert") }, "-");
    if (col.kind !== "theme") items.push({ label: "Rename Column", disabled: d.missing, onClick: () => startColumnRename(col.id) });
    items.push({ label: col.kind === "theme" ? (col.table === "appearance" ? "Delete Appearance Theme Table" : "Delete Physical Material Theme Table") : "Delete", onClick: () => ctl.deleteColumn(col.id) });
    menu(items, { x: ev.clientX, y: ev.clientY });
  }

  // ------------------------------------------------------------------ inline rename
  function inlineEdit(host, value, commit) {
    renaming = true;
    const inp = h("input", { class: "cfg-rename", value, spellcheck: "false" });
    const prev = [...host.childNodes];
    host.textContent = "";
    host.append(inp);
    inp.focus();
    inp.select();
    let done = false;
    const end = (ok) => {
      if (done) return;
      done = true;
      renaming = null;
      const v = inp.value.trim();
      host.textContent = "";
      host.append(...prev);
      if (ok && v && v !== value) commit(v);
      else render();
    };
    inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); end(true); } else if (e.key === "Escape") { e.preventDefault(); end(false); } });
    inp.addEventListener("blur", () => end(true));
    inp.addEventListener("dblclick", (e) => e.stopPropagation());
  }
  function startRename(id, table = null) {
    if (!visible) api.show();
    const sel = table ? `.cfg-theme[data-theme="${table}"] [data-theme-row="${CSS.escape(id)}"] .cfg-nm` : `[data-table="${tab === "properties" ? "properties" : "top"}"] [data-row-name="${CSS.escape(id)}"] .cfg-nm`;
    const span = root.querySelector(sel);
    if (!span) return;
    const c = D.get(app.doc);
    const cur = table ? (c.themes[table].rows.find((x) => x.id === id) || {}).name : (D.row(c, id) || {}).name;
    inlineEdit(span, cur || "", (v) => (table ? ctl.renameTheme(table, id, v) : ctl.renameRow(id, v)));
  }
  function startColumnRename(colId) {
    const span = root.querySelector(`[data-col="${CSS.escape(colId)}"] .cfg-ch-t`);
    if (!span) return;
    inlineEdit(span, span.textContent, (v) => ctl.renameColumn(colId, v));
  }

  // ------------------------------------------------------------------ public
  app.on("doc", scheduleRender);
  app.on("model", (d) => { if (!d.preview) scheduleRender(); });
  const api = {
    get visible() { return visible; },
    get element() { return root; },
    show() { if (visible) { minimized = false; applyChrome(); return; } visible = true; minimized = false; applyChrome(); render(); app.emit("layout", {}); app.emit("configure", { table: true }); },
    hide() { if (!visible) return; visible = false; applyChrome(); app.emit("layout", {}); app.emit("configure", { table: false }); },
    toggle() { if (visible) api.hide(); else api.show(); },
    render,
    refresh: scheduleRender,
    startRename,
    selectTab(t) { const b = tabs.querySelector(`[data-tab="${t}"]`); if (b) b.click(); },
  };
  return api;
}
