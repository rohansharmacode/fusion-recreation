// Application bar, laid out like Fusion 2706 (Toolbars.xml QAT / QATRight):
//   grey block: Home, Data Panel, File ▾, Save, Undo | ▾, Redo | ▾
//   white document tab filling the middle: cube icon + name centred, close x at the right end
//   grey block: + (New Design), Autodesk Assistant, Extensions, Job Status (orange dot),
//               Notification Center, Help, profile avatar
import { el, glyph, cmdInfo, frameThrottle, store } from "./common.js";

const PROFILE_KEY = "fusion-recreation.profile.v1";

export function buildAppbar(app, svc) {
  const host = app.dom.appbar;
  if (!host) return null;
  const { menu, tooltip } = svc;
  host.innerHTML = "";
  host.classList.add("ab-host");

  const run = (id, ctx) => app.commands.run(id, ctx || { source: "appbar" });
  const tip = (b, info) => tooltip.attach(b, typeof info === "function" ? info : () => info, { placement: "below", size: "small" });
  const iconBtn = (cls, glyphName, attrs, info) => {
    const b = el("button", `ab-btn ${cls || ""}`, { type: "button", ...attrs, html: glyph(glyphName) });
    if (info) tip(b, info);
    return b;
  };
  const cmdTip = (id, title) => () => { const i = cmdInfo(app, id); return { title: title || i.label, shortcut: i.shortcut, more: false }; };
  const later = (what) => () => app.toast(`${what} isn't available in this unofficial recreation`, "info");

  // ---------------------------------------------------------------- left block
  const left = el("div", "ab-left");
  const homeBtn = iconBtn("ab-home", "sh-home", { "data-cmd": "ShowFusionHomeCmd", "aria-label": "Show Home" }, cmdTip("ShowFusionHomeCmd", "Show Home"));
  homeBtn.addEventListener("click", () => run("ShowFusionHomeCmd"));
  const dataBtn = iconBtn("ab-data", "sh-grid", { "data-cmd": "ToggleDataPanel", "aria-label": "Show Data Panel" },
    () => ({ title: app.ui.shell && app.ui.shell.dataPanelOpen ? "Hide Data Panel" : "Show Data Panel", shortcut: "Ctrl+Alt+P", more: false }));
  dataBtn.addEventListener("click", () => run("ToggleDataPanel"));

  const fileBtn = el("button", "ab-btn ab-file", { type: "button", "data-menu": "file", "aria-haspopup": "menu", "aria-label": "File", html: glyph("sh-file") + glyph("sh-caret-ab") });
  tip(fileBtn, { title: "File", more: false });
  fileBtn.addEventListener("click", () => {
    if (menu.isOpenFor(fileBtn)) { menu.closeAll(); return; }
    fileBtn.classList.add("ab-open");
    const r = host.getBoundingClientRect();
    const b = fileBtn.getBoundingClientRect();
    menu.open(fileMenuItems(), { left: b.left - 1, right: b.left - 1, top: r.bottom, bottom: r.bottom, width: 0, height: 0 },
      { owner: fileBtn, className: "ab-file-menu", onClose: () => fileBtn.classList.remove("ab-open") });
  });

  const saveBtn = iconBtn("ab-save", "sh-save", { "data-cmd": "FileSave", "aria-label": "Save" }, cmdTip("FileSave"));
  saveBtn.addEventListener("click", () => run("FileSave"));

  const lastLabel = (stack) => (stack && stack.length ? stack[stack.length - 1].label : "");
  const undoBtn = iconBtn("ab-undo", "sh-undo", { "data-cmd": "Undo", "aria-label": "Undo" },
    () => { const l = lastLabel(app.history.undoStack); return { title: l ? `Undo ${l}` : "Undo", shortcut: "Ctrl+Z", more: false }; });
  undoBtn.addEventListener("click", () => { if (!undoBtn.classList.contains("ab-disabled")) run("Undo"); });
  const undoDrop = el("button", "ab-btn ab-split", { type: "button", "aria-label": "Undo history", "data-menu": "undo-history", html: glyph("sh-tri-down") });
  tip(undoDrop, { title: "Undo History", more: false });
  undoDrop.addEventListener("click", () => historyMenu(undoDrop, undoBtn, "undo"));

  const redoBtn = iconBtn("ab-redo", "sh-redo", { "data-cmd": "Redo", "aria-label": "Redo" },
    () => { const l = lastLabel(app.history.redoStack); return { title: l ? `Redo ${l}` : "Redo", shortcut: "Ctrl+Y", more: false }; });
  redoBtn.addEventListener("click", () => { if (!redoBtn.classList.contains("ab-disabled")) run("Redo"); });
  const redoDrop = el("button", "ab-btn ab-split", { type: "button", "aria-label": "Redo history", "data-menu": "redo-history", html: glyph("sh-tri-down") });
  tip(redoDrop, { title: "Redo History", more: false });
  redoDrop.addEventListener("click", () => historyMenu(redoDrop, redoBtn, "redo"));

  function historyMenu(drop, btn, kind) {
    if (menu.isOpenFor(drop)) { menu.closeAll(); return; }
    if (drop.classList.contains("ab-disabled")) return;
    const st = ((kind === "undo" ? app.history.undoStack : app.history.redoStack) || []).slice().reverse().slice(0, 25);
    const cmd = kind === "undo" ? "Undo" : "Redo";
    const items = st.length
      ? st.map((e, i) => ({ key: `${kind}-${i}`, label: e.label || "Change", onClick: () => { for (let k = 0; k <= i; k++) run(cmd); } }))
      : [{ header: true, note: true, label: kind === "undo" ? "Nothing to undo" : "Nothing to redo" }];
    drop.classList.add("ab-open");
    const r = host.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    menu.open(items, { left: b.left, right: b.left, top: r.bottom, bottom: r.bottom, width: 0, height: 0 },
      { owner: drop, className: "ab-history-menu", onClose: () => drop.classList.remove("ab-open") });
  }

  left.append(homeBtn, dataBtn, fileBtn, saveBtn, undoBtn, undoDrop, redoBtn, redoDrop);

  // ---------------------------------------------------------------- document tab
  const tabs = el("div", "ab-tabs");
  const docTab = el("div", "ab-doctab ab-doctab-active", { role: "tab", "data-doc-tab": "active", "aria-selected": "true" });
  const center = el("span", "ab-doc-center");
  const docIcon = el("span", "ab-doc-icon", { html: glyph("sh-doc") });
  const docName = el("span", "ab-doc-name");
  const docVer = el("span", "ab-doc-ver");
  center.append(docIcon, docName, docVer);
  const docClose = el("button", "ab-doc-close", { type: "button", "data-cmd": "FileClose", "aria-label": "Close", html: glyph("sh-close") });
  docClose.addEventListener("click", (ev) => { ev.stopPropagation(); run("FileClose"); });
  tip(docClose, { title: "Close", more: false });
  docTab.append(center, docClose);
  docTab.addEventListener("auxclick", (ev) => { if (ev.button === 1) run("FileClose"); });
  docTab.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    menu.open([
      item("FileSave", { label: "Save" }),
      item("FileSaveAs", { label: "Save As" }),
      "-",
      { key: "FileClose", label: "Close", cmd: "FileClose", onClick: () => run("FileClose") },
    ], { x: ev.clientX, y: ev.clientY });
  });
  tooltip.attach(center, () => ({ title: app.doc.name || "Untitled", desc: app.dirty ? "Unsaved changes" : "Saved", more: false }), { placement: "below", size: "large", delay: 800 });
  tabs.append(docTab);

  // ---------------------------------------------------------------- right block
  const right = el("div", "ab-right");
  const newTab = iconBtn("ab-newtab", "sh-plus", { "data-cmd": "FileNew", "aria-label": "New Design" }, cmdTip("FileNew", "New Design"));
  newTab.addEventListener("click", () => run("FileNew"));
  const assistBtn = iconBtn("ab-assist", "sh-assist", { "aria-label": "Autodesk Assistant", "data-menu": "assistant" }, { title: "Autodesk Assistant", more: false });
  assistBtn.addEventListener("click", () => popover(assistBtn, "Autodesk Assistant", [
    { header: true, note: true, label: "The assistant isn't available in this unofficial recreation. Press S for the toolbox to search commands." },
  ]));
  const extBtn = iconBtn("ab-ext", "sh-ext", { "aria-label": "Extensions", "data-menu": "extensions" }, { title: "Extensions", more: false });
  extBtn.addEventListener("click", () => popover(extBtn, "Extensions", [
    { header: true, note: true, label: "No extensions are installed." },
    "-",
    { key: "browse-ext", label: "Browse Extensions...", onClick: later("Extensions") },
  ]));
  const jobBtn = iconBtn("ab-job", "sh-job", { "aria-label": "Job Status", "data-menu": "jobs" }, { title: "Job Status", more: false });
  jobBtn.append(el("span", "ab-job-dot"));
  jobBtn.addEventListener("click", () => popover(jobBtn, "Job Status", [
    { header: true, note: true, label: "No jobs are running." },
    { header: true, note: true, label: "Designs are saved in this browser, not in the cloud." },
  ]));
  const bellBtn = iconBtn("ab-bell", "sh-bell", { "aria-label": "Notification Center", "data-menu": "notifications" }, { title: "Notification Center", more: false });
  bellBtn.addEventListener("click", () => popover(bellBtn, "Notifications", [
    { header: true, note: true, label: "You're all caught up." },
  ]));
  const helpBtn = el("button", "ab-btn ab-help", { type: "button", "aria-label": "Help", "data-menu": "help", "aria-haspopup": "menu", html: glyph("sh-help") });
  tip(helpBtn, { title: "Help", more: false });
  helpBtn.addEventListener("click", () => {
    if (menu.isOpenFor(helpBtn)) { menu.closeAll(); return; }
    helpBtn.classList.add("ab-open");
    menu.open(helpMenuItems(), helpBtn, { owner: helpBtn, align: "right", className: "ab-help-menu", onClose: () => helpBtn.classList.remove("ab-open") });
  });
  const profile = store.get(PROFILE_KEY, { name: "Guest User" });
  const initials = String(profile.name || "Guest User").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "GU";
  const avatar = el("button", "ab-avatar", { type: "button", "aria-label": "Profile", "data-menu": "profile", text: initials });
  tip(avatar, { title: profile.name || "Guest User", more: false });
  avatar.addEventListener("click", () => {
    if (menu.isOpenFor(avatar)) { menu.closeAll(); return; }
    menu.open([
      { header: true, label: profile.name || "Guest User" },
      { header: true, note: true, label: "Not signed in. Work is kept in this browser." },
      "-",
      { key: "prefs", label: "Preferences", onClick: later("Preferences") },
      { key: "KeyboardShortcuts", label: "Keyboard Shortcuts", cmd: "KeyboardShortcuts", onClick: () => run("KeyboardShortcuts") },
      "-",
      { key: "ResetLayout", label: "Reset to Default Layout", cmd: "ResetLayout", shortcut: "Ctrl+Alt+R", onClick: () => run("ResetLayout") },
    ], avatar, { owner: avatar, align: "right", minWidth: 220, className: "ab-profile-menu" });
  });
  right.append(newTab, assistBtn, extBtn, jobBtn, bellBtn, helpBtn, el("span", "ab-avatar-wrap", null, avatar));

  function popover(btn, title, items) {
    if (menu.isOpenFor(btn)) { menu.closeAll(); return; }
    btn.classList.add("ab-open");
    menu.open(items, btn, { owner: btn, align: "right", title, minWidth: 260, className: "ab-popover", onClose: () => btn.classList.remove("ab-open") });
  }

  host.append(left, tabs, right);

  // ---------------------------------------------------------------- menus
  const item = (id, extra = {}) => {
    const i = cmdInfo(app, id);
    return { key: id, cmd: id, label: extra.label || i.label, shortcut: extra.shortcut ?? i.shortcut, disabled: i.registered && !i.enabled, onClick: () => run(id), ...extra };
  };
  // "Hide X" / "Show X" according to the toggle command's checked() (true = currently shown).
  const toggleItem = (id, noun) => {
    const i = cmdInfo(app, id);
    const shown = i.def && typeof i.def.checked === "function" ? i.checked : true;
    return { key: id, cmd: id, label: `${shown ? "Hide" : "Show"} ${noun}`, onClick: () => run(id) };
  };
  const files = () => app.ui.files || null;
  const everSaved = () => { const f = files(); return !!((f && f.current) || (app.doc && app.doc.savedVersion)); };
  const recoveredCount = () => {
    try {
      const f = files();
      const rec = f && typeof f.recovery === "function" ? f.recovery() : null;
      return rec && rec.doc && Array.isArray(rec.doc.features) && rec.doc.features.length ? 1 : 0;
    } catch { return 0; }
  };

  // Fusion 2706 File menu (Toolbars.xml FileSubMenuCommand; items Fusion hides for a local design left out)
  function fileMenuItems() {
    const rc = recoveredCount();
    const saved = everSaved();
    return [
      item("FileNew", { label: "New...", shortcut: "" }),
      item("NewAssemblyFromPartCommand", { label: "Add To Assembly", shortcut: "" }),
      item("FileOpen", { label: "Open...", shortcut: "Ctrl+O" }),
      { key: "NotifyAutoSaveFilesCommand", cmd: "NotifyAutoSaveFilesCommand", label: `Open Recovered Documents (${rc})`, disabled: rc === 0, onClick: () => run("FileOpen", { source: "appbar", recover: true }) },
      { key: "UploadCommand", cmd: "FileOpen", label: "Upload...", onClick: () => run("FileOpen", { source: "appbar", upload: true }) },
      "-",
      item("FileSave", { label: "Save", shortcut: "Ctrl+S" }),
      { ...item("FileSaveAs", { label: "Save As", shortcut: "" }), disabled: !saved || (cmdInfo(app, "FileSaveAs").registered && !cmdInfo(app, "FileSaveAs").enabled) },
      { key: "PLM360SaveAsLatestOnQATCommand", label: "Save As Latest", disabled: true },
      item("FileExport", { label: "Export...", shortcut: "" }),
      "-",
      { key: "CreateVersionCommand", label: "Create Version", icon: glyph("sh-bookmark"), disabled: !saved, onClick: () => run("FileSave", { source: "appbar", createVersion: true }) },
      "-",
      item("ThreeDprintCmdDef", { label: "3D Print", shortcut: "" }),
      item("SaveAsImageCommand", { label: "Capture Image...", shortcut: "" }),
      { key: "SimpleSharingPublicLinkCommand", label: "Share File Link", disabled: true },
      "-",
      { key: "PLM360OpenDetailsCommand", label: "View Details on Web", disabled: true },
      { key: "View", label: "View", items: [
        toggleItem("ToggleViewCube", "ViewCube"),
        toggleItem("ToggleBrowser", "Browser"),
        toggleItem("ToggleComments", "Comments"),
        { key: "TextCommands", label: "Show Text Commands", onClick: later("Text Commands") },
        toggleItem("ToggleNavBar", "Navigation Bar"),
        toggleItem("ToggleToolbar", "Command Toolbar"),
        toggleItem("ToggleDataPanel", "Data Panel"),
        "-",
        item("ResetLayout", { label: "Reset to Default Layout", shortcut: "" }),
      ] },
    ];
  }

  function helpMenuItems() {
    return [
      { header: true, note: true, className: "ab-disclaimer", label: "Unofficial hackathon recreation — not affiliated with or endorsed by Autodesk" },
      "-",
      { key: "Walkthrough", label: "Take a Tour", onClick: later("Take a Tour") },
      { key: "Learning", label: "Learning and Documentation", items: [
        { key: "SelfPaced", label: "Self-Paced Learning", onClick: later("Self-Paced Learning") },
        { key: "Docs", label: "Product Documentation", onClick: later("Product Documentation") },
        { key: "API", label: "Fusion API", onClick: later("The Fusion API reference") },
      ] },
      { key: "QuickSetup", label: "Quick Setup", onClick: later("Quick Setup") },
      { key: "Community", label: "Community", items: [
        { key: "Forum", label: "Forum", onClick: later("The forum") },
        { key: "Insider", label: "Insider Program", onClick: later("The Insider Program") },
        { key: "Blog", label: "Blog", onClick: later("The blog") },
      ] },
      { key: "Support", label: "Support and Diagnostics", items: [
        { key: "GetSupport", label: "Get Support", onClick: later("Support") },
        { key: "Logs", label: "Diagnostic Log Files", onClick: later("Diagnostic log files") },
        { key: "Graphics", label: "Graphics Diagnostic", onClick: later("Graphics diagnostics") },
      ] },
      "-",
      item("KeyboardShortcuts", { shortcut: "" }),
      { key: "WhatsNew", label: "What's New", onClick: later("What's New") },
      { key: "ReleaseNotes", label: "Release Notes", onClick: later("Release notes") },
      item("About", { shortcut: "" }),
    ];
  }

  // ---------------------------------------------------------------- state refresh
  let lastTitle = "";
  const cmdEnabled = (id, fallback) => { const d = app.commands.get(id); return d ? app.commands.isEnabled(id) : fallback; };
  function refresh() {
    const canUndo = cmdEnabled("Undo", app.history.canUndo()), canRedo = cmdEnabled("Redo", app.history.canRedo());
    undoBtn.classList.toggle("ab-disabled", !canUndo);
    undoBtn.setAttribute("aria-disabled", String(!canUndo));
    undoDrop.classList.toggle("ab-disabled", !app.history.canUndo());
    redoBtn.classList.toggle("ab-disabled", !canRedo);
    redoBtn.setAttribute("aria-disabled", String(!canRedo));
    redoDrop.classList.toggle("ab-disabled", !app.history.canRedo());
    const name = (app.doc && app.doc.name) || "Untitled";
    docName.textContent = name;
    const ver = app.doc && app.doc.savedVersion;
    docVer.textContent = ver ? `v${ver}` : "";
    docTab.classList.toggle("ab-has-ver", !!ver);
    docTab.classList.toggle("ab-dirty", !!app.dirty);
    docName.setAttribute("data-dirty", app.dirty ? "true" : "false");
    const open = !!(app.ui.shell && app.ui.shell.dataPanelOpen);
    dataBtn.classList.toggle("ab-active", open);
    dataBtn.setAttribute("aria-label", open ? "Hide Data Panel" : "Show Data Panel");
    const title = `${name}${app.dirty ? "*" : ""} - Design (unofficial recreation)`;
    if (title !== lastTitle) { lastTitle = title; try { document.title = title; } catch { /* ignore */ } }
  }
  const schedule = frameThrottle(refresh);
  for (const ev of ["history", "doc", "model", "layout", "saved", "file", "commands", "dialog", "input"]) app.on(ev, schedule);
  // app.dirty is a plain flag (no event when a save clears it), so poll it cheaply too.
  setInterval(() => { try { refresh(); } catch { /* ignore */ } }, 700);
  refresh();

  return { refresh, el: host, openFileMenu: () => fileBtn.click(), openHelpMenu: () => helpBtn.click() };
}
