// Toolbar: workspace switcher, tab row (persistent + contextual tabs), panels with 32 px command
// buttons and a panel label that opens the panel dropdown. Layout comes from spec.js (derived from
// Fusion's TabToolbars.xml). Every button runs app.commands.run(id).
//  - Contextual environments (app.enterEnvironment / the sketch): their tab(s) are appended (or replace the
//    persistent tabs when the environment's baseTabs is []) and selected; the FINISH <NAME> panel shows the
//    green check button, and is also offered on the persistent tabs the environment keeps.
//  - Workspaces (app.setWorkspace): the switcher lists app.workspaceList(); a non-Design workspace shows its own
//    tabs (registered def.tabs or the generated WORKSPACE_SPECS) and panels.
import { TABS, CONTEXTUAL_TABS, PANELS, COMMANDS, MODE_TOOLBARS } from "./spec.js";
import { WORKSPACE_SPECS, WORKSPACE_PANELS } from "./workspaces-spec.js";
import { el, cmdIcon, glyph, cmdInfo, frameThrottle, store } from "./common.js";

const DESIGN = "FusionSolidEnvironment";

export const WORKSPACES = [
  { id: "FusionSolidEnvironment", label: "Design", desc: "Create and edit parametric solid, surface, mesh and sheet metal designs." },
  { id: "GenerativeEnvironment", label: "Generative Design", desc: "Explore design outcomes generated from goals and constraints." },
  { id: "FusionRenderEnvironment", label: "Render", desc: "Create photorealistic images of the design." },
  { id: "Publisher3DEnvironment", label: "Animation", desc: "Create exploded views and assembly animations." },
  { id: "SimulationEnvironment", label: "Simulation", desc: "Test the design under loads and conditions." },
  { id: "CAMEnvironment", label: "Manufacture", desc: "Create toolpaths for machining, cutting and additive manufacturing." },
  { id: "FusionDocumentationEnvironment", label: "Drawing", desc: "Create 2D drawings of designs and animations.", items: ["From Design", "From Animation"] },
];

const SELECTION_FILTERS = ["Bodies", "Faces", "Edges", "Vertices", "Sketches", "Sketch Profiles", "Sketch Curves", "Sketch Points", "Construction Planes", "Construction Axes", "Construction Points", "Canvases"];
const PIN_KEY = "fusion-recreation.toolbar.v1";

export function buildToolbar(app, svc) {
  const host = app.dom.toolbar;
  if (!host) return null;
  const { menu, tooltip } = svc;
  host.innerHTML = "";
  host.classList.add("tb-host");

  const state = {
    tab: "SolidTab",
    lastBase: "SolidTab",
    custom: sanitizeCustom(store.get(PIN_KEY, {})),
    filters: Object.fromEntries(SELECTION_FILTERS.map((f) => [f, true])),
    openPanel: null,
    visible: true,
    hidden: new Set(), // panels folded into the MORE overflow panel
  };

  const root = el("div", "tb-root");
  const wsCol = el("div", "tb-ws-col");
  const ws = el("button", "tb-ws", { type: "button", "data-ws": "FusionSolidEnvironment", "aria-haspopup": "menu", "aria-label": "Change Workspace" },
    el("span", "tb-ws-label", { text: "DESIGN" }), el("span", "tb-caret", { html: glyph("sh-caret") }));
  wsCol.append(ws);
  const main = el("div", "tb-main");
  const tabsRow = el("div", "tb-tabs", { role: "tablist" });
  const panelsRow = el("div", "tb-panels");
  main.append(tabsRow, panelsRow);
  root.append(wsCol, main);
  host.append(root);

  // ---------------------------------------------------------------- workspace switcher
  tooltip.attach(ws, () => ({ title: "Change Workspace", desc: "Switches to another workspace.", more: false }), { placement: "below", size: "small" });
  const wsList = () => (typeof app.workspaceList === "function" ? app.workspaceList() : WORKSPACES.map((w) => ({ ...w, registered: w.id === DESIGN })));
  const switchTo = (id, ctx) => {
    if (typeof app.setWorkspace !== "function") { app.toast("Other workspaces aren't available in this unofficial recreation", "info"); return; }
    try { app.setWorkspace(id, ctx); } catch (e) { app.toast(e.message || String(e), "error"); }
  };
  ws.addEventListener("click", () => {
    if (menu.isOpenFor(ws)) { menu.closeAll(); return; }
    ws.classList.add("tb-open");
    const cur = app.workspace || DESIGN;
    const items = wsList().map((w) => {
      const meta = WORKSPACES.find((x) => x.id === w.id) || {};
      const sub = meta.items;
      return {
        key: w.id,
        label: w.label,
        checked: w.id === cur,
        check: true,
        checkStyle: "tick",
        items: sub ? sub.map((label) => ({ label, onClick: () => switchTo(w.id, { from: label }) })) : undefined,
        tooltip: () => ({ title: `${w.label} Workspace`, desc: meta.desc || (w.def && w.def.desc) || "", note: w.registered ? "" : "Placeholder in this recreation: its toolbar is shown, the tools are not built yet.", more: false }),
        onClick: () => switchTo(w.id),
      };
    });
    menu.open(items, ws, { owner: ws, minWidth: Math.max(160, ws.offsetWidth), className: "tb-ws-menu", onClose: () => ws.classList.remove("tb-open") });
  });
  function syncWorkspaceLabel() {
    const cur = app.workspace || DESIGN;
    const w = wsList().find((x) => x.id === cur);
    ws.setAttribute("data-ws", cur);
    ws.querySelector(".tb-ws-label").textContent = String((w && w.label) || "Design").toUpperCase();
  }

  // ---------------------------------------------------------------- tabs
  // ---- layout sources: Design (spec.js) or the active workspace; contextual environment tabs on top
  const wsLayout = () => {
    const cur = app.workspace || DESIGN;
    if (cur === DESIGN) return null;
    const def = app.workspaceDef ? app.workspaceDef(cur) : null;
    const gen = WORKSPACE_SPECS.find((w) => w.id === cur) || null;
    return {
      id: cur,
      tabs: (def && Array.isArray(def.tabs) && def.tabs.length ? def.tabs : gen ? gen.tabs : []).map((t) => ({ ...t, label: String(t.label || t.id).toUpperCase() })),
      ctxTabs: (def && def.contextualTabs) || (gen ? gen.contextualTabs : []),
      panels: { ...(gen ? WORKSPACE_PANELS[gen.id] || {} : {}), ...((def && def.panels) || {}) },
      registered: !!def,
    };
  };
  const envOf = () => { try { return app.environment || null; } catch { return null; } };
  /** Panel definition: environment-supplied, workspace, or the Design spec. */
  function PANEL(pid) {
    const env = envOf();
    if (env && env.panels && env.panels[pid]) return env.panels[pid];
    const w = wsLayout();
    if (w && w.panels[pid]) return w.panels[pid];
    return PANELS[pid] || null;
  }
  /** Contextual tabs of the active environment: env.tab (spec id(s) or {id,label,panels}), else spec tabs of its env/mode. */
  function activeCtx() {
    const env = envOf();
    if (!env) return [];
    const w = wsLayout();
    const lookup = (t) => (typeof t === "string" ? CONTEXTUAL_TABS.find((c) => c.id === t) || (w && w.ctxTabs.find((c) => c.id === t)) || null : t);
    let tabs;
    if (env.tab) tabs = (Array.isArray(env.tab) ? env.tab : [env.tab]).map(lookup).filter(Boolean);
    else tabs = CONTEXTUAL_TABS.filter((c) => (c.env && c.env === env.id) || c.mode === env.mode);
    return tabs.map((t, i) => {
      const finish = env.finishCommand || t.finish;
      let finishPanel = t.finishPanel;
      if (!finishPanel && finish) finishPanel = (t.panels || []).find((pid) => { const P = PANEL(pid); return P && P.finish; });
      return { ...t, label: String((i === 0 && env.tabLabel) || t.label || env.label || t.id).toUpperCase(), finish, finishPanel, ctx: true };
    });
  }
  /** Persistent tabs the active environment keeps (null = all; [] = none, Fusion's AvailableBaseTabs="{none}"). */
  function baseTabsFilter() {
    const env = envOf();
    if (!env) return null;
    if (env.baseTabs !== undefined) return env.baseTabs;
    const c = activeCtx()[0];
    return c && c.baseTabs !== undefined ? c.baseTabs : null;
  }
  const persistentTabs = () => { const w = wsLayout(); return w ? w.tabs : TABS; };
  const isCtx = (id) => activeCtx().some((c) => c.id === id) || CONTEXTUAL_TABS.some((c) => c.id === id);
  const tabList = () => {
    const base = baseTabsFilter();
    const keep = persistentTabs().filter((t) => !base || base.includes(t.id));
    return [...keep.map((t) => ({ ...t, ctx: false })), ...activeCtx()];
  };
  const tabDef = (id) => tabList().find((t) => t.id === id);

  function renderTabs() {
    tabsRow.innerHTML = "";
    for (const t of tabList()) {
      // the caption plus a hidden bold copy that reserves the active (bold) width
      const b = el("button", `tb-tab${t.ctx ? " tb-tab-ctx" : ""}${t.id === state.tab ? " tb-tab-active" : ""}`,
        { type: "button", role: "tab", "data-tab": t.id, "aria-selected": t.id === state.tab ? "true" : "false" },
        el("span", "tb-tab-label", { text: t.label }));
      b.prepend(el("span", "tb-tab-sizer", { "aria-hidden": "true", "data-label": t.label }));
      b.addEventListener("click", () => setTab(t.id));
      tabsRow.append(b);
    }
  }

  function setTab(id) {
    if (!tabDef(id)) return;
    if (id === state.tab) return;
    menu.closeAll();
    state.tab = id;
    if (!isCtx(id)) state.lastBase = id;
    render();
  }

  // ---------------------------------------------------------------- customization (pin to toolbar)
  function sanitizeCustom(c) {
    const out = {};
    if (!c || typeof c !== "object") return out;
    for (const [pid, v] of Object.entries(c)) {
      if (!PANELS[pid] || !v) continue;
      const ok = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && COMMANDS[x]) : []);
      out[pid] = { add: ok(v.add), remove: ok(v.remove) };
    }
    return out;
  }
  function controlsFor(pid) {
    const P = PANEL(pid);
    const c = state.custom[pid];
    let ids = P.controls.slice();
    if (c) {
      ids = ids.filter((x) => !c.remove.includes(x));
      for (const a of c.add) if (!ids.includes(a)) ids.push(a);
    }
    if (!ids.length) ids = P.controls.slice(0, 1);
    return ids;
  }
  function saveCustom() { store.set(PIN_KEY, state.custom); }
  function setPinned(pid, id, pinned) {
    const P = PANEL(pid);
    const c = state.custom[pid] || (state.custom[pid] = { add: [], remove: [] });
    if (pinned) {
      c.remove = c.remove.filter((x) => x !== id);
      if (!P.controls.includes(id) && !c.add.includes(id)) c.add.push(id);
    } else {
      c.add = c.add.filter((x) => x !== id);
      if (P.controls.includes(id) && !c.remove.includes(id)) c.remove.push(id);
      if (controlsFor(pid).length === 0) c.remove = c.remove.filter((x) => x !== id);
    }
    if (!c.add.length && !c.remove.length) delete state.custom[pid];
    saveCustom();
    renderPanels();
  }
  const isCustomized = (pid) => !!state.custom[pid];
  function resetGroup(pid) { delete state.custom[pid]; saveCustom(); renderPanels(); }
  function resetAll() { state.custom = {}; saveCustom(); renderPanels(); }

  // Context menu of a toolbar button / dropdown row (Fusion's CommandButton.qml / CommandMenuItem.qml).
  function pinItems(pid, id, forButton = true) {
    const pinned = controlsFor(pid).includes(id);
    const onlyOne = pinned && controlsFor(pid).length <= 1;
    const items = [
      { key: "pin", label: "Pin to Toolbar", checked: pinned, check: true, checkStyle: "tick", disabled: onlyOne, onClick: () => setPinned(pid, id, !pinned) },
      { key: "pin-shortcuts", label: "Pin to Shortcuts", check: true, checkStyle: "tick", disabled: true },
      { key: "change-shortcut", label: "Change keyboard shortcut...", disabled: true },
    ];
    if (forButton) items.push("-",
      { key: "reset-group", label: "Reset Toolbar Group", disabled: !isCustomized(pid), onClick: () => resetGroup(pid) },
      { key: "reset-all", label: "Reset Entire Toolbar", disabled: !Object.keys(state.custom).length, onClick: resetAll });
    return items;
  }
  function pinMenu(ev, pid, id, forButton = true) {
    menu.open(pinItems(pid, id, forButton), { x: ev.clientX, y: ev.clientY }, { className: "tb-ctx-menu" });
  }

  // ---------------------------------------------------------------- panels
  const belowToolbar = () => host.getBoundingClientRect().bottom + 3;
  const tipInfo = (id) => {
    const i = cmdInfo(app, id);
    return { title: i.label, shortcut: i.shortcut, desc: i.desc, note: i.stub ? "Not available in this recreation yet." : "" };
  };

  function buttonEl(id, pid) {
    const i = cmdInfo(app, id);
    const b = el("button", "tb-btn", { type: "button", "data-cmd": id, "aria-label": i.label });
    // Finish Sketch / Form / Base Feature ...: Fusion's big green disc with a white tick (drawn by the shell, see common.js)
    const PP = PANEL(pid);
    b.innerHTML = id === "SketchStop" || (PP && PP.finish === id) ? glyph("sh-finish") : cmdIcon(id, 32);
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      tooltip.hide();
      b.blur();
      if (b.classList.contains("tb-disabled")) return;
      app.commands.run(id, { source: "toolbar" });
    });
    b.addEventListener("pointerdown", (ev) => { if (ev.button === 0) menu.closeAll(); });
    b.addEventListener("contextmenu", (ev) => { ev.preventDefault(); pinMenu(ev, pid, id); });
    tooltip.attach(b, () => tipInfo(id), { placement: "below", size: "small", minY: belowToolbar });
    return b;
  }


  function cmdItem(id, pid, checkable) {
    const i = cmdInfo(app, id);
    return {
      key: id,
      cmd: id,
      label: i.label,
      icon: cmdIcon(id, 16),
      shortcut: i.shortcut,
      disabled: i.registered && !i.enabled,
      checked: i.checked,
      check: !!checkable,
      onClick: () => app.commands.run(id, { source: "toolbar-dropdown" }),
      onContext: (ev) => pinMenu(ev, pid, id, false),
      more: () => pinItems(pid, id, false),
      tooltip: () => ({ ...tipInfo(id), more: true }),
    };
  }

  function filterItems() {
    const all = SELECTION_FILTERS.every((f) => state.filters[f]);
    const toggle = (f) => (row) => {
      if (f === "*") { const v = !all; for (const k of SELECTION_FILTERS) state.filters[k] = v; }
      else state.filters[f] = !state.filters[f];
      app.ui.toolbar.selectionFilters = { ...state.filters };
      app.emit("selection-filters", { filters: { ...state.filters } });
      // re-render the open flyout in place
      const parent = row.closest(".sh-menu");
      if (parent) for (const r of parent.querySelectorAll(".sh-mi")) {
        const k = r.getAttribute("data-menu-item");
        const on = k === "Select All" ? SELECTION_FILTERS.every((x) => state.filters[x]) : !!state.filters[k];
        r.classList.toggle("sh-mi-checked", on);
        r.setAttribute("aria-checked", String(on));
        if (r._item) r._item.checked = on;
        const ck = r.querySelector(".sh-mi-checkbox");
        if (ck) ck.innerHTML = on ? glyph("sh-check", 10) : "";
      }
    };
    return [
      { key: "Select All", label: "Select All", check: true, checked: all, keepOpen: true, onClick: toggle("*") },
      "-",
      ...SELECTION_FILTERS.map((f) => ({ key: f, label: f, check: true, checked: !!state.filters[f], keepOpen: true, onClick: toggle(f) })),
    ];
  }

  function menuItems(items, pid) {
    const out = [];
    for (const it of items) {
      if (it === "-") { out.push("-"); continue; }
      if (typeof it === "string") { out.push(cmdItem(it, pid)); continue; }
      if (it.checklist) {
        const i = cmdInfo(app, it.id);
        out.push({ key: it.id, label: i.label, icon: cmdIcon(it.id, 16), items: filterItems() });
        continue;
      }
      if (it.items) {
        // flyout groups (Pattern, Create PCB, Simplify ...) have no icon in Fusion's dropdowns
        out.push({ key: it.label, label: it.label, icon: "", items: menuItems(it.items, pid) });
        continue;
      }
      if (it.id) out.push(cmdItem(it.id, pid, it.checkable));
    }
    return out;
  }

  function openDropdown(pid, labelEl, panelEl) {
    const P = PANEL(pid);
    tooltip.hide();
    state.openPanel = pid;
    labelEl.classList.add("tb-open");
    panelEl.classList.add("tb-panel-open");
    // Fusion drops the menu from the caption strip: left edges aligned, directly under it
    const lr = labelEl.getBoundingClientRect();
    menu.open(menuItems(P.dropdown, pid), { left: lr.left - 4, right: lr.right, top: lr.top, bottom: lr.bottom, width: lr.width + 4, height: lr.height }, {
      owner: labelEl,
      className: "tb-dropdown",
      gap: 0,
      onClose: () => {
        labelEl.classList.remove("tb-open");
        panelEl.classList.remove("tb-panel-open");
        if (state.openPanel === pid) state.openPanel = null;
      },
    });
  }

  function panelEl(pid) {
    const P = PANEL(pid);
    const wrap = el("div", `tb-panel${P.finish ? " tb-panel-finish" : ""}`, { "data-panel-id": pid });
    const btns = el("div", "tb-btns");
    for (const id of controlsFor(pid)) btns.append(buttonEl(id, pid));
    const env = envOf();
    const caption = P.finish && env && env.finishLabel && P.finish === env.finishCommand ? String(env.finishLabel).toUpperCase() : P.label;
    const label = el("button", "tb-plabel", { type: "button", "data-panel": pid, "aria-haspopup": "menu" },
      el("span", "tb-plabel-text", { text: caption }), el("span", "tb-caret", { html: glyph("sh-caret") }));
    label.addEventListener("click", () => {
      if (menu.isOpenFor(label)) { menu.closeAll(); return; }
      openDropdown(pid, label, wrap);
    });
    // menu-bar behaviour: while one dropdown is open, hovering another panel label switches to it
    label.addEventListener("pointerenter", () => {
      if (state.openPanel && state.openPanel !== pid && menu.isOpen()) openDropdown(pid, label, wrap);
    });
    label.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      menu.open([
        { label: "Reset Toolbar Group", disabled: !isCustomized(pid), onClick: () => resetGroup(pid) },
        { label: "Reset Entire Toolbar", disabled: !Object.keys(state.custom).length, onClick: resetAll },
      ], { x: ev.clientX, y: ev.clientY }, { className: "tb-ctx-menu" });
    });
    wrap.append(btns, label);
    return wrap;
  }

  // right-click on empty toolbar space: Reset Toolbar Group (inside a panel) / Reset Entire Toolbar (Toolbar.qml)
  panelsRow.addEventListener("contextmenu", (ev) => {
    if (ev.defaultPrevented) return; // a button or caption already showed its own menu
    ev.preventDefault();
    const p = ev.target.closest && ev.target.closest(".tb-panel[data-panel-id]");
    const pid = p && PANEL(p.getAttribute("data-panel-id")) ? p.getAttribute("data-panel-id") : null;
    const items = [{ key: "reset-all", label: "Reset Entire Toolbar", disabled: !Object.keys(state.custom).length, onClick: resetAll }];
    if (pid) items.unshift({ key: "reset-group", label: "Reset Toolbar Group", disabled: !isCustomized(pid), onClick: () => resetGroup(pid) });
    menu.open(items, { x: ev.clientX, y: ev.clientY }, { className: "tb-ctx-menu" });
  });

  function panelsForTab() {
    const t = tabDef(state.tab) || tabList()[0];
    if (!t) return [];
    const list = (t.panels || []).slice();
    if (!t.ctx) for (const c of activeCtx()) if (c.finishPanel && !list.includes(c.finishPanel)) list.push(c.finishPanel);
    return list.filter((p) => PANEL(p));
  }

  // Panels collapsed into the overflow ("MORE") panel when the window is too narrow, in this order.
  const HIDE_ORDER = ["ConfigurePanel", "InsertPanel", "ParaMeshExportPanel", "Annotate3DPanel", "AssemblePanel", "PlasticPartsAssemblePanel",
    "ParaMeshPreparePanel", "PlasticPartsSetupPanel", "InspectPanel", "PlasticPartsInspectPanel", "ToolsInspectPanel", "ConstructionPanel",
    "UtilityPanel", "SolidScriptsAddinsPanel", "SketchConstraintsPanel", "SelectPanel", "ParaMeshSelectPanel"];

  function overflowPanelEl(hidden) {
    const wrap = el("div", "tb-panel tb-panel-more", { "data-panel-id": "ToolbarOverflow" });
    const btn = el("button", "tb-btn tb-more-btn", { type: "button", "data-action": "toolbar-overflow", "aria-label": "More tools", html: glyph("sh-more", 20) });
    const label = el("button", "tb-plabel", { type: "button", "data-panel": "ToolbarOverflow", "aria-haspopup": "menu" },
      el("span", "tb-plabel-text", { text: "MORE" }), el("span", "tb-caret", { html: glyph("sh-caret") }));
    const open = () => {
      if (menu.isOpenFor(label)) { menu.closeAll(); return; }
      tooltip.hide();
      label.classList.add("tb-open");
      const items = hidden.map((pid) => ({ key: pid, label: PANEL(pid).label, icon: cmdIcon(controlsFor(pid)[0], 16), items: menuItems(PANEL(pid).dropdown, pid) }));
      menu.open(items, label.getBoundingClientRect(), { owner: label, className: "tb-dropdown", gap: 0, onClose: () => label.classList.remove("tb-open") });
    };
    btn.addEventListener("click", open);
    label.addEventListener("click", open);
    tooltip.attach(btn, () => ({ title: "More tools", desc: `Panels that don't fit: ${hidden.map((p) => PANEL(p).label).join(", ")}.`, more: false }), { placement: "below", size: "small" });
    wrap.append(el("div", "tb-btns", null, btn), label);
    return wrap;
  }

  function buildPanels() {
    panelsRow.innerHTML = "";
    const list = panelsForTab().filter((p) => !state.hidden.has(p));
    const hidden = panelsForTab().filter((p) => state.hidden.has(p));
    const seq = list.filter((p) => !PANEL(p).finish);
    if (hidden.length) seq.push("__more");
    seq.push(...list.filter((p) => PANEL(p).finish));
    // dividers between panels; Fusion draws none in front of the contextual FINISH panel
    seq.forEach((pid, i) => {
      if (i > 0 && !(pid !== "__more" && PANEL(pid).finish)) panelsRow.append(el("div", "tb-div"));
      panelsRow.append(pid === "__more" ? overflowPanelEl(hidden) : panelEl(pid));
    });
  }

  function renderPanels() {
    menu.closeAll();
    panelsRow.setAttribute("data-active-tab", state.tab);
    fit();
  }

  function render() {
    if (!tabDef(state.tab)) {
      const first = tabList()[0];
      state.tab = state.lastBase && tabDef(state.lastBase) ? state.lastBase : tabDef("SolidTab") ? "SolidTab" : first ? first.id : "SolidTab";
    }
    syncWorkspaceLabel();
    renderTabs();
    renderPanels();
  }

  const overflowing = () => panelsRow.scrollWidth > panelsRow.clientWidth + 1;
  // Demote buttons (largest panels first) until the row fits, like Fusion's panel manager.
  function demote() {
    let guard = 300;
    while (overflowing() && guard-- > 0) {
      let best = null, bestN = 1;
      for (const p of panelsRow.querySelectorAll(".tb-panel:not(.tb-panel-more)")) {
        const vis = p.querySelectorAll(".tb-btn:not(.tb-demoted)");
        if (vis.length > bestN || (vis.length === bestN && best && vis.length > 1)) { bestN = vis.length; best = vis; }
      }
      if (!best || bestN <= 1) break;
      best[best.length - 1].classList.add("tb-demoted");
    }
  }
  // 1) demote buttons; 2) compact labels; 3) fold whole panels into MORE (never the Finish panel).
  function fit() {
    state.hidden = new Set();
    panelsRow.classList.remove("tb-compact");
    buildPanels();
    demote();
    if (overflowing()) { panelsRow.classList.add("tb-compact"); demote(); }
    if (overflowing()) {
      const all = panelsForTab();
      const candidates = [...HIDE_ORDER.filter((p) => all.includes(p)), ...all.slice(1).reverse().filter((p) => !HIDE_ORDER.includes(p))]
        .filter((p) => !PANEL(p).finish);
      for (const p of candidates) {
        if (!overflowing()) break;
        state.hidden.add(p);
        buildPanels();
        demote();
      }
    }
    panelsRow.classList.toggle("tb-overflow", overflowing());
    refreshStates();
  }

  // ---------------------------------------------------------------- state refresh
  // The command whose button should look pressed: an open command dialog, the active sketch tool,
  // or Create Sketch while its plane pick is running.
  function activeCommandId() {
    if (app.activeCommand && app.activeCommand.id) return app.activeCommand.id;
    try {
      const t = app.ui.sketch && app.ui.sketch.tool;
      if (t) return t;
      const top = app.input.top();
      const name = top && top.name ? String(top.name) : "";
      if (name.startsWith("sketch-tool:")) return name.slice(12);
      if (name === "sketch-planepick") return "SketchCreate";
    } catch { /* ignore */ }
    return null;
  }
  // Select is Fusion's default (checked) command; it must not look pressed while another command,
  // sketch tool or pick mode is running, whatever SelectCommand.checked() reports.
  const SELECT_FAMILY = new Set(["SelectCommand", "selectWindow", "selectFreeForm", "selectPaint"]);
  function refreshStates() {
    const active = activeCommandId();
    const busy = !!active && !SELECT_FAMILY.has(active);
    for (const b of panelsRow.querySelectorAll(".tb-btn[data-cmd]")) {
      const id = b.getAttribute("data-cmd");
      const i = cmdInfo(app, id);
      const disabled = i.registered && !i.enabled;
      b.classList.toggle("tb-disabled", disabled);
      const selIdle = i.def && typeof i.def.checked === "function" ? i.checked : true;
      const checked = id === "SelectCommand" ? selIdle && !busy : (!!i.checked || (!!active && active === id));
      b.classList.toggle("tb-checked", checked);
      b.classList.toggle("tb-stub", i.stub);
      if (disabled) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled");
      b.setAttribute("aria-label", i.label);
    }
  }
  const scheduleRefresh = frameThrottle(refreshStates);
  for (const ev of ["commands", "selection", "doc", "history", "dialog", "input", "command-start"]) app.on(ev, scheduleRefresh);
  app.on("model", (d) => { if (!d || !d.preview) scheduleRefresh(); });

  // entering an environment selects its (first) contextual tab; leaving it returns to the tab used before
  const onEnvChange = () => {
    const ctxTabs = activeCtx();
    if (ctxTabs.length) {
      if (!ctxTabs.some((c) => c.id === state.tab)) {
        if (!isCtx(state.tab)) state.lastBase = state.tab;
        state.tab = ctxTabs[0].id;
      }
    } else if (isCtx(state.tab) || !tabDef(state.tab)) {
      state.tab = state.lastBase && tabDef(state.lastBase) ? state.lastBase : (tabList()[0] || { id: "SolidTab" }).id;
    }
    render();
    renderModeBar();
  };
  app.on("mode", onEnvChange);
  app.on("environment", onEnvChange);
  app.on("workspace", ({ id, prev, refresh } = {}) => {
    menu.closeAll();
    if (!refresh || id !== prev) {
      const first = tabList()[0];
      state.tab = first ? first.id : "SolidTab";
      state.lastBase = state.tab;
    }
    render();
    renderModeBar();
  });
  app.on("workspaces", () => syncWorkspaceLabel());

  // ---------------------------------------------------------------- mode toolbar (Configure / Edit In Place ...)
  // An environment with modeToolbar ({commands} or a MODE_TOOLBARS id) shows Fusion's small floating bar at the
  // top of the canvas: the edited object's name (env.modeLabel) and the buttons (the last one ends the mode).
  let modeBar = null;
  function renderModeBar() {
    if (modeBar) { modeBar.remove(); modeBar = null; }
    const env = envOf();
    const spec = env && env.modeToolbar ? (typeof env.modeToolbar === "string" ? MODE_TOOLBARS[env.modeToolbar] || null : env.modeToolbar) : null;
    const hostEl = app.dom.workspace || app.dom.canvasHost;
    if (!spec || !hostEl) return;
    modeBar = el("div", "tb-modebar", { "data-modebar": env.id });
    let name = "";
    try { name = typeof env.modeLabel === "function" ? env.modeLabel(app) : env.modeLabel || env.label || ""; } catch { name = ""; }
    if (name) modeBar.append(el("span", "tb-modebar-label", { text: name }));
    for (const id of spec.commands || []) {
      const i = cmdInfo(app, id);
      const b = el("button", "tb-modebar-btn", { type: "button", "data-cmd": id, text: i.label });
      b.addEventListener("click", () => app.commands.run(id, { source: "modebar" }));
      modeBar.append(b);
    }
    hostEl.append(modeBar);
  }

  let lastWidth = -1;
  const refit = frameThrottle(() => {
    const w = host.clientWidth;
    if (w === lastWidth || !state.visible) return;
    lastWidth = w;
    fit();
  });
  if (typeof ResizeObserver === "function") new ResizeObserver(refit).observe(host);
  window.addEventListener("resize", refit);

  if (activeCtx().length) state.tab = activeCtx()[0].id;
  render();

  function setVisible(v) {
    v = !!v;
    if (v === state.visible) return;
    state.visible = v;
    host.style.display = v ? "" : "none";
    menu.closeAll();
    app.emit("layout", { toolbar: v });
    if (v) requestAnimationFrame(fit);
  }

  return {
    get activeTab() { return state.tab; },
    get visible() { return state.visible; },
    tabs: () => tabList().map((t) => t.id),
    setTab,
    refresh: () => { scheduleRefresh(); },
    rerender: render,
    relayout: () => { if (state.visible) fit(); },
    openPanel(pid) {
      const label = panelsRow.querySelector(`[data-panel="${pid}"]`);
      if (!label) return false;
      openDropdown(pid, label, label.closest(".tb-panel"));
      return true;
    },
    closeMenus: () => menu.closeAll(),
    show: () => setVisible(true),
    hide: () => setVisible(false),
    setVisible,
    resetCustomization: resetAll,
    selectionFilters: { ...state.filters },
    spec: { TABS, CONTEXTUAL_TABS, PANELS, COMMANDS, WORKSPACES, WORKSPACE_SPECS, WORKSPACE_PANELS, MODE_TOOLBARS },
    /** Panel definition as the toolbar resolves it (environment / workspace / Design spec). */
    panel: (pid) => PANEL(pid),
    /** Tabs currently in the tab row ([{id, label, ctx}]). */
    tabInfo: () => tabList().map((t) => ({ id: t.id, label: t.label, ctx: !!t.ctx })),
    info: (id) => cmdInfo(app, id),
  };
}
