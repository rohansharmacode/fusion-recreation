// shell module: application bar, toolbar (tabs/panels/dropdowns from spec.js), theme, rich
// tooltips, popup menus, Data Panel and Comments stubs, and a stub registration for every toolbar
// command that no other module implements.
//
// Public objects (see ARCHITECTURE.md "app.ui"):
//   app.ui.toolbar  { activeTab, setTab(id), tabs(), openPanel(panelId), closeMenus(), refresh(), relayout(), show(), hide(),
//                     resetCustomization(), info(id), spec }
//   app.ui.appbar   { refresh(), openFileMenu(), openHelpMenu() }
//   app.ui.menu     { open(items, anchor, opts), closeAll(), isOpen() }      generic popup menus
//   app.ui.tooltip  { attach(el, () => ({title, desc, shortcut}), opts), hide() }
//   app.ui.modal({title, message, buttons:[{label, value, primary}]}) -> Promise<value>  (= app.ui.shell.modal)
//   app.ui.shell    { dataPanelOpen, setDataPanel(bool), toggleDataPanel(), resetLayout(), comments,
//                     modal(opts) -> Promise<value> (small message box),
//                     listDesigns: null | () => [{name, when, thumb?, open()}]  (overrides app.ui.files) }
// Events: emits 'layout' ({dataPanel}|{comments}|{toolbar}|{reset:true}) and 'selection-filters'.
import "./theme.css";
import "./style.css";
import { COMMANDS } from "./spec.js";
import { APP_COMMANDS, stubMessage } from "./common.js";
import { createMenu } from "./menu.js";
import { createTooltip } from "./tooltip.js";
import { buildToolbar } from "./toolbar.js";
import { buildAppbar } from "./appbar.js";
import { buildDataPanel, buildComments, modal } from "./panels.js";
import { WORKSPACE_SPECS, WORKSPACE_PANELS, WORKSPACE_COMMANDS } from "./workspaces-spec.js";
import { installWorkspaces } from "./workspace.js";

// Stub shortcuts that no other module owns (pressing them gives Fusion-like feedback).
const STUB_SHORTCUTS = { JointAssembleCmdNew: "J", JointAsBuiltCmd: "Shift+J", FusionViewColorCyclingToggleCmd: "Shift+N", ScriptsManagerCommand: "Shift+S" };

// Fusion's UI face is Artifakt Element (not redistributable). Fira Sans comes from the same designers and
// matches its widths within ~2 % on the reference screenshots; the CSS stack falls back to Segoe UI offline.
const UI_FONT_CSS = "https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600;700&display=swap";
function loadUiFont(onLoaded) {
  try {
    if (!document.querySelector("link[data-shell-font]")) {
      const pre = document.createElement("link");
      pre.rel = "preconnect"; pre.href = "https://fonts.gstatic.com"; pre.crossOrigin = "anonymous";
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = UI_FONT_CSS; css.setAttribute("data-shell-font", "");
      css.addEventListener("load", () => {
        try { Promise.all(["400", "600", "700"].map((w) => document.fonts.load(`${w} 12px "Fira Sans"`))).then(onLoaded, onLoaded); } catch { onLoaded(); }
      });
      document.head.append(pre, css);
    }
    if (document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener("loadingdone", (ev) => {
        const faces = (ev && ev.fontfaces) || [];
        if (!faces.length || faces.some((f) => /Fira Sans|Artifakt/i.test(f.family || ""))) onLoaded();
      });
    }
  } catch { /* offline or sandboxed: the fallback fonts are fine */ }
}

export function init(app) {
  const shell = { dataPanelOpen: false, listDesigns: null };
  app.ui.shell = shell;
  const tooltip = createTooltip(app);
  const menu = createMenu(app, tooltip);
  app.ui.tooltip = tooltip;
  app.ui.menu = menu;
  shell.modal = (opts) => modal(app, opts);
  app.ui.modal = shell.modal;
  const svc = { menu, tooltip };

  registerShellCommands(app, shell, svc);
  registerStubs(app);
  shell.workspaces = installWorkspaces(app);

  const guard = (name, fn) => { try { return fn(); } catch (e) { console.error(`[shell] ${name}`, e); return null; } };
  const dataPanel = guard("data panel", () => buildDataPanel(app, svc));
  const comments = guard("comments", () => buildComments(app, svc));
  shell.comments = comments;
  shell.dataPanel = dataPanel;
  shell.setDataPanel = (v) => dataPanel && dataPanel.setOpen(v);
  shell.toggleDataPanel = () => dataPanel && dataPanel.toggle();
  app.ui.appbar = guard("app bar", () => buildAppbar(app, svc));
  app.ui.toolbar = guard("toolbar", () => buildToolbar(app, svc));
  shell.resetLayout = () => app.commands.run("ResetLayout");
  // text widths change when the web font arrives: lay the toolbar out again (once per load burst)
  let fontTimer = 0;
  loadUiFont(() => {
    clearTimeout(fontTimer);
    fontTimer = setTimeout(() => { try { if (app.ui.toolbar && !(app.ui.menu && app.ui.menu.isOpen())) app.ui.toolbar.relayout(); } catch (e) { console.error(e); } }, 30);
  });

  // keep tooltips/menus from lingering when a command starts or the mode changes
  app.on("command-start", () => { tooltip.hide(); });
  app.on("mode", () => { tooltip.hide(); });
}

function registerShellCommands(app, shell, svc) {
  const reg = (def) => app.commands.register({ kind: "ui", ...def, label: def.label || (APP_COMMANDS[def.id] || [])[0], tooltip: def.tooltip || (APP_COMMANDS[def.id] || [])[1] });

  reg({
    id: "ToggleDataPanel", shortcut: "Ctrl+Alt+P",
    run: () => shell.toggleDataPanel && shell.toggleDataPanel(),
    checked: () => !!shell.dataPanelOpen,
  });
  reg({
    id: "ShowFusionHomeCmd", label: "Show Home", tooltip: "Shows your designs and recent work (the Data Panel in this recreation).",
    run: () => shell.setDataPanel && shell.setDataPanel(true),
  });
  reg({
    id: "ToggleComments",
    run: () => { const c = shell.comments; if (c) c.setVisible(!c.visible); },
    checked: () => !!(shell.comments && shell.comments.visible),
  });
  reg({
    id: "ToggleToolbar",
    run: () => { const t = app.ui.toolbar; if (t) t.setVisible(!t.visible); },
    checked: () => !!(app.ui.toolbar && app.ui.toolbar.visible),
  });
  reg({
    id: "ResetLayout", shortcut: "Ctrl+Alt+R",
    run: () => {
      svc.menu.closeAll();
      if (app.ui.toolbar) app.ui.toolbar.show();
      if (shell.comments) { shell.comments.setVisible(true); shell.comments.setExpanded(false); }
      if (shell.setDataPanel) shell.setDataPanel(false);
      for (const id of ["ToggleBrowser", "ToggleViewCube", "ToggleNavBar"]) {
        const d = app.commands.get(id);
        if (!d || d.stub || typeof d.checked !== "function") continue;
        try { if (!d.checked(app)) app.commands.run(id, { source: "reset-layout" }); } catch (e) { console.error(e); }
      }
      app.emit("layout", { reset: true });
      app.toast("Layout reset to default", "info", 1500);
    },
  });
  reg({
    id: "SaveAsImageCommand",
    run: () => {
      const vp = app.viewport;
      const c = vp && vp.canvas;
      if (!c) { app.toast("There is no canvas to capture", "warning"); return; }
      try { vp.requestRender && vp.requestRender(); } catch { /* ignore */ }
      requestAnimationFrame(() => {
        let url;
        try { url = c.toDataURL("image/png"); } catch (e) { app.toast(`Could not capture the image: ${e.message || e}`, "error"); return; }
        const name = `${(app.doc && app.doc.name) || "Untitled"}.png`.replace(/[\\/:*?"<>|]+/g, "_");
        try {
          Promise.resolve().then(() => { const bin = atob(url.split(",")[1]); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return app.download(name, new Blob([u8], { type: "image/png" }), "image/png"); }).then((ok) => { if (ok) app.toast(`Image saved as ${name}`, "info"); });
        } catch (e) { app.toast(`Could not save the image: ${e.message || e}`, "error"); }
      });
    },
  });
  reg({
    id: "FileClose",
    run: () => closeDocument().catch((e) => { console.error(e); app.toast(`Close: ${e.message || e}`, "error"); }),
  });
  async function closeDocument() {
    // With a single document tab, Close behaves like New Design. Prefer the File module's flow
    // (it asks to save with its own dialog and unbinds the saved-design slot).
    const fileNew = app.commands.get("FileNew");
    if (fileNew && !fileNew.stub) { await app.commands.run("FileNew", { source: "close" }); return; }
    {
      if (app.activeCommand) { try { app.activeCommand.cancel(); } catch { /* ignore */ } }
      if (app.dirty) {
        const name = (app.doc && app.doc.name) || "Untitled";
        const canSave = app.commands.has("FileSave") && !app.commands.get("FileSave").stub;
        const v = await modal(app, {
          title: "Close",
          message: `Save changes to "${name}" before closing?`,
          buttons: [
            ...(canSave ? [{ label: "Save", value: "save", primary: true }] : []),
            { label: "Don't Save", value: "discard", primary: !canSave },
            { label: "Cancel", value: "cancel" },
          ],
        });
        if (v === "cancel") return;
        if (v === "save") {
          await app.commands.run("FileSave", { source: "close" });
          if (app.dirty) return; // save was cancelled or failed
        }
      }
      if (app.mode !== "model") { try { app.setMode("model"); } catch { /* ignore */ } }
      app.newDocument("Untitled");
    }
  }
  reg({
    id: "ThreeDprintCmdDef",
    label: COMMANDS.ThreeDprintCmdDef[0], tooltip: COMMANDS.ThreeDprintCmdDef[1],
    run: () => {
      const d = app.commands.get("FileExportSTL");
      if (d && !d.stub) return app.commands.run("FileExportSTL", { source: "3dprint" });
      app.toast(stubMessage("3D Print"), "info");
    },
  });
  reg({
    id: "ShowCommandHelp", label: "Help for Command", tooltip: "Opens help for the command under the cursor.", shortcut: "Ctrl+/",
    run: () => app.toast("Online help isn't available in this unofficial recreation. Hover a tool for its description, or see Help > Keyboard Shortcuts.", "info", 4500),
  });
  // NextWorkspace / PreviousWorkspace: workspace.js
}

function registerStubs(app) {
  const stub = (id, label, tooltip, extra = {}) => {
    if (app.commands.has(id)) return;
    app.commands.register({
      id, label, tooltip, stub: true, kind: "ui",
      run: () => app.toast(stubMessage(label), "info"),
      ...extra,
    });
  };
  for (const [id, c] of Object.entries(COMMANDS)) {
    const extra = { shortcutHint: c[2] };
    if (STUB_SHORTCUTS[id]) extra.shortcut = STUB_SHORTCUTS[id];
    stub(id, c[0], c[1], extra);
  }
  // commands of the other workspaces' toolbars (workspaces-spec.js), scoped to their workspace
  const wsOf = new Map();
  for (const w of WORKSPACE_SPECS) {
    const panels = WORKSPACE_PANELS[w.id] || {};
    const walk = (arr) => { for (const x of arr || []) { if (typeof x === "string") { if (x !== "-" && !wsOf.has(x)) wsOf.set(x, w.id); } else if (x && x.id) { if (!wsOf.has(x.id)) wsOf.set(x.id, w.id); } else if (x && x.items) walk(x.items); } };
    for (const pnl of Object.values(panels)) { walk(pnl.controls); walk(pnl.dropdown); }
  }
  for (const [id, c] of Object.entries(WORKSPACE_COMMANDS)) stub(id, c[0], c[1], { workspace: wsOf.get(id) });
  // Fallbacks for application commands owned by other modules (replaced when those register).
  const L = (id) => APP_COMMANDS[id];
  stub("Undo", L("Undo")[0], L("Undo")[1], { shortcut: "Ctrl+Z", run: () => app.history.undo(), enabled: () => app.history.canUndo() });
  stub("Redo", L("Redo")[0], L("Redo")[1], { shortcut: "Ctrl+Y", run: () => app.history.redo(), enabled: () => app.history.canRedo() });
  stub("FileNew", L("FileNew")[0], L("FileNew")[1], { shortcut: "Ctrl+N", run: () => app.commands.run("FileClose") });
  stub("About", L("About")[0], L("About")[1], { run: () => app.toast("Unofficial hackathon recreation — not affiliated with or endorsed by Autodesk", "info", 5000) });
  for (const id of ["FileOpen", "FileSave", "FileSaveAs", "RecoverySave", "FileExport", "FileExportSTL", "KeyboardShortcuts", "ToggleBrowser", "ToggleViewCube", "ToggleNavBar"]) {
    stub(id, L(id)[0], L(id)[1]);
  }
}
