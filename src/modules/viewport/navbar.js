// Navigation bar (bottom-centre, transparent like Fusion's) + every view command the viewport owns.
// Item list/order from Neutron\UI\Commands\Resources\Toolbar\Toolbars.xml (NavToolbar):
// Orbit ▾ | Look At | Pan | Zoom | Fit ▾ | Display Settings ▾ | Grid and Snaps ▾ | Viewports ▾
// Display Settings menu per the reference capture: Visual Style ▸, Environment ▸, Graphics Preset ▸,
// Effects ▸, Object Visibility ▸, Camera ▸, Ground Plane Offset | Enter Full Screen Ctrl+Shift+F.
import { NAV_ICONS } from "./navicons.js";
import { VISUAL_STYLES } from "./bodies.js";

// Environment list as in Fusion 2706 (Theme-optimized / Other); backgrounds and layout-grid colours
// from each environment's XML (Background RGB, LayoutGrid ARGB).
export const ENVIRONMENTS = {
  ViewEnvMatchThemeCommand: { label: "Match Theme", group: "theme", bg: "#ffffff", grid: "#333333", gridOpacity: 0.07, sketchGridOpacity: 0.025 },
  ViewEnvPhotoBoothCommand: { label: "Photo Booth", group: "theme", bg: "#ffffff", grid: "#333333", gridOpacity: 0.07, sketchGridOpacity: 0.025 },
  ViewEnvRiverRubicon: { label: "River Rubicon", group: "theme", bg: ["#3b4352", "#2e3440", "#262b34"], grid: "#e6e6e6", gridOpacity: 0.15, dark: true },
  ViewEnvDarkSkyCommand: { label: "Dark Sky", group: "other", bg: "#2a2a2a", grid: "#cccccc", gridOpacity: 0.1, dark: true },
  ViewEnvGreyRoomCommand: { label: "Grey Room", group: "other", bg: "#818181", grid: "#e6e6e6", gridOpacity: 0.15, dark: true },
  ViewEnvInfinityPool: { label: "Infinity Pool", group: "other", bg: "#ffffff", grid: "#404040", gridOpacity: 0.15 },
  ViewEnvTranquilityBlueCommand: { label: "Tranquility Blue", group: "other", bg: "#0054a6", grid: "#e6e6e6", gridOpacity: 0.15, dark: true },
};
const LEGACY_ENV = { ViewEnvInfinityPoolCommand: "ViewEnvInfinityPool" };

const VISUAL_STYLE_KEYS = { ViewShadedCommand: "Ctrl+4", ViewShadedHLCommand: "Ctrl+5", ViewShadedWithEdgesHLRCommand: "Ctrl+6", ViewWireframeCommand: "Ctrl+7", ViewWireframeHLCommand: "Ctrl+8", ViewWireframeHLRCommand: "Ctrl+9" };
const PRESETS = [["ViewPresetPerformanceCommand", "Performance"], ["ViewPresetQyalityCommand", "Quality"], ["ViewPresetCustomCommand", "Custom"]];
const EFFECTS = [
  ["ViewGroundPlaneCommand", "groundPlane", "Ground Plane"],
  ["ViewGroundShadowCommand", "groundShadow", "Ground Shadow"],
  ["ViewGroundReflectionCommand", "groundReflection", "Ground Reflection"],
  ["ViewObjectShadowCommand", "objectShadow", "Object Shadow"],
  ["ViewAmbientOcclusionCommand", "ambientOcclusion", "Ambient Occlusion"],
  ["ViewMSAACommand", "antiAliasing", "Anti-Aliasing"],
  ["ViewDomeCommand", "dome", "Environment Dome"],
];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function registerViewCommands(vp) {
  const app = vp.app;
  const reg = (d) => app.commands.register({ kind: "view", ...d });
  const tools = vp.navTools;
  if (LEGACY_ENV[vp.prefs.environment]) vp.prefs.environment = LEGACY_ENV[vp.prefs.environment];

  // ----- navigation -----
  reg({ id: "OrbitCommand", label: "Orbit", tooltip: "Rotates the view around the target.", run: () => tools.toggle(vp.prefs.orbitType === "constrained" ? "orbitConstrained" : "orbitFree"), checked: () => tools.is("orbitFree") || tools.is("orbitConstrained") });
  reg({ id: "FreeOrbitCommand", label: "Free Orbit", tooltip: "Orbits freely around the view target.", run: () => { vp.prefs.orbitType = "free"; vp.savePrefs(); tools.start("orbitFree"); }, checked: () => vp.prefs.orbitType !== "constrained" });
  reg({ id: "ConstrainedOrbitCommand", label: "Constrained Orbit", tooltip: "Orbits around the view target keeping the up direction.", run: () => { vp.prefs.orbitType = "constrained"; vp.savePrefs(); tools.start("orbitConstrained"); }, checked: () => vp.prefs.orbitType === "constrained" });
  reg({ id: "LookAtCommand", label: "Look At", tooltip: "Rotates the view to look directly at a selected face or plane.", run: () => vp.lookAtSelection(), checked: () => tools.is("lookAt") });
  reg({ id: "PanCommand", label: "Pan", tooltip: "Moves the view parallel to the screen.", run: () => tools.toggle("pan"), checked: () => tools.is("pan") });
  reg({ id: "ZoomCommand", label: "Zoom", tooltip: "Drag up or down to zoom the view.", run: () => tools.toggle("zoom"), checked: () => tools.is("zoom") });
  reg({ id: "FitCommand", label: "Fit", shortcut: "F6", tooltip: "Fits the whole design in the view.", run: () => { vp.prefs.fitType = "fit"; vp.savePrefs(); tools.stop(); vp.fit({ animate: true }); vp.updateNavbarState(); } });
  reg({ id: "ZoomWindowCommand", label: "Zoom Window", tooltip: "Drag a window to zoom to that area.", run: () => { vp.prefs.fitType = "window"; vp.savePrefs(); tools.toggle("zoomWindow"); }, checked: () => tools.is("zoomWindow") });
  reg({ id: "ZoomFitCommandGroup", label: "Fit", run: () => app.commands.run(vp.prefs.fitType === "window" ? "ZoomWindowCommand" : "FitCommand") });

  // ----- display settings -----
  reg({ id: "ViewDisplayCommand", label: "Display Settings", kind: "ui", run: () => vp.navbar.openMenu("display") });
  reg({ id: "ViewVisualStyleCommand", label: "Visual Style", kind: "ui", run: () => vp.navbar.openMenu("display") });
  for (const [id, st] of Object.entries(VISUAL_STYLES)) {
    reg({ id, label: st.label, shortcut: VISUAL_STYLE_KEYS[id], run: () => vp.setVisualStyle(id), checked: () => vp.bodies.style === id });
  }
  reg({ id: "ViewEnvCommand", label: "Environment", kind: "ui", run: () => vp.navbar.openMenu("display") });
  for (const [id, env] of Object.entries(ENVIRONMENTS)) {
    reg({ id, label: env.label, run: () => vp.setEnvironment(id), checked: () => vp.prefs.environment === id });
  }
  reg({ id: "ViewGraphicsPresetCommand", label: "Graphics Preset", kind: "ui", run: () => vp.navbar.openMenu("display") });
  for (const [id, label] of PRESETS) {
    reg({ id, label, run: () => vp.setGraphicsPreset(id), checked: () => vp.prefs.graphicsPreset === id });
  }
  reg({ id: "ViewEffectCommand", label: "Effects", kind: "ui", run: () => vp.navbar.openMenu("display") });
  for (const [id, key, label] of EFFECTS) {
    reg({ id, label, run: () => vp.setEffect(key, !vp.prefs.effects[key]), checked: () => !!vp.prefs.effects[key] });
  }
  // Display Component Colors: colour-cycles the bodies. Always confirm the toggle with a short toast, since an
  // empty design (or a click from a dropdown that closes at once) otherwise shows no change at all.
  reg({
    id: "FusionViewColorCyclingToggleCmd", label: "Display Component Colors", shortcut: "Shift+N",
    tooltip: "Shows each component in its own colour.",
    run: () => {
      const on = !vp.prefs.effects.componentColors;
      vp.setEffect("componentColors", on);
      const n = vp.bodies && vp.bodies.objects ? vp.bodies.objects.size : 0;
      app.toast(on ? (n ? "Display Component Colors on (Shift+N)" : "Display Component Colors on: no bodies to colour yet") : "Display Component Colors off", "info", 2600);
    },
    checked: () => !!vp.prefs.effects.componentColors,
  });

  reg({ id: "VisibilityOverrideCommand", label: "Object Visibility", kind: "ui", run: () => vp.navbar.openMenu("display") });
  const VIS = [
    ["ViewVisibilityOriginsCmd", "origins", "Origins"],
    ["ViewVisibilityBodiesCmd", "bodies", "Bodies"],
    ["ViewVisibilitySketchesCmd", "sketches", "Sketches"],
    ["ViewVisibilitySketchDimensionsCmd", "sketchDimensions", "Sketch Dimensions"],
    ["ViewVisibilityConstructionPlanesCmd", "constructionPlanes", "Construction Planes"],
  ];
  vp.visibilityItems = VIS;
  for (const [id, key, label] of VIS) {
    reg({ id, label, run: () => vp.setObjectVisibility(key, !vp.objectVisibility[key]), checked: () => vp.objectVisibility[key] !== false });
  }
  reg({ id: "ViewVisibilityShowAllCmd", label: "Show All", run: () => { for (const [, k] of VIS) vp.setObjectVisibility(k, true); } });
  reg({ id: "ViewVisibilityHideAllCmd", label: "Hide All", run: () => { for (const [, k] of VIS) vp.setObjectVisibility(k, false); } });

  reg({ id: "ViewCameraCommand", label: "Camera", kind: "ui", run: () => vp.navbar.openMenu("display") });
  reg({ id: "ViewCameraOrthoCommand", label: "Orthographic", run: () => vp.setCameraMode("ortho"), checked: () => vp.rig.mode === "ortho" });
  reg({ id: "ViewCameraPerspCommand", label: "Perspective", run: () => vp.setCameraMode("persp"), checked: () => vp.rig.mode === "persp" });
  reg({ id: "ViewCameraPerspWithOrthoFacesCommand", label: "Perspective with Ortho Faces", run: () => vp.setCameraMode("perspOrtho"), checked: () => vp.rig.mode === "perspOrtho" });
  reg({ id: "GroundPlaneOffsetCommand", label: "Ground Plane Offset", tooltip: "Moves the ground plane (ground shadow / reflection) up or down.", kind: "ui", run: () => vp.dialogs.groundOffset() });
  reg({ id: "ShowWorkspaceFullScreenCommand", label: "Enter Full Screen", shortcut: "Ctrl+Shift+F", kind: "ui", run: () => (vp.isFullScreen() ? vp.setFullScreen(false) : vp.setFullScreen(true)) });
  reg({ id: "ShowWorkspaceNormalCommand", label: "Exit Full Screen", kind: "ui", run: () => vp.setFullScreen(false), enabled: () => vp.isFullScreen() });

  // ----- grid and snaps -----
  reg({ id: "ViewLayoutGridCommand", label: "Grid and Snaps", kind: "ui", run: () => vp.navbar.openMenu("grid") });
  reg({ id: "ViewLayoutGrid", label: "Layout Grid", run: () => vp.setGridPref("visible", !vp.prefs.grid.visible), checked: () => !!vp.prefs.grid.visible });
  reg({ id: "ViewLayoutGridLockCommand", label: "Layout Grid Lock", run: () => vp.setGridPref("lock", !vp.prefs.grid.lock), checked: () => !!vp.prefs.grid.lock });
  reg({ id: "ToggleGridSnapCommand", label: "Snap to Grid", run: () => vp.setGridPref("snap", !vp.prefs.grid.snap), checked: () => !!vp.prefs.grid.snap });
  reg({ id: "DefineGridCmd", label: "Grid Settings", tooltip: "Sets the layout grid spacing.", kind: "ui", run: () => vp.dialogs.gridSettings() });
  reg({ id: "ToggleIncrementalMoveCmd", label: "Incremental Move", run: () => vp.setGridPref("incremental", !vp.prefs.grid.incremental), checked: () => !!vp.prefs.grid.incremental });
  reg({ id: "SetSnapValueCmd", label: "Set Increments", kind: "ui", run: () => vp.dialogs.increments() });

  // ----- viewports -----
  reg({ id: "SplitViewWindowSyncCommand", label: "Viewports", kind: "ui", run: () => vp.navbar.openMenu("viewports") });
  reg({ id: "SingleViewCmd", label: "Single View", run: () => {}, checked: () => true });
  reg({ id: "MultiViewCmd", label: "Multiple Views", run: () => app.toast("Multiple views are not available in this recreation", "info") });
  reg({ id: "SplitViewResetCmd", label: "Reset Views", run: () => vp.goHome({ animate: true }) });

  // ----- ViewCube -----
  reg({ id: "ViewCubeGoHome", label: "Go Home", tooltip: "Returns to the home view.", run: () => vp.goHome({ animate: true }) });
  reg({ id: "ViewCubeSetHomeFit", label: "Fit to View", run: () => vp.setHome(true) });
  reg({ id: "ViewCubeSetHomeFixed", label: "Fixed Distance", run: () => vp.setHome(false) });
  reg({ id: "ViewCubeResetHome", label: "Reset Home", run: () => vp.resetHome() });
  reg({ id: "ToggleViewCube", label: "ViewCube", tooltip: "Shows or hides the ViewCube.", shortcut: "Ctrl+Alt+V", kind: "ui", run: () => vp.setWidgetVisible("viewcube", !vp.prefs.showViewCube), checked: () => !!vp.prefs.showViewCube });
  reg({ id: "ToggleNavBar", label: "Navigation Bar", tooltip: "Shows or hides the navigation bar.", shortcut: "Ctrl+Alt+N", kind: "ui", run: () => vp.setWidgetVisible("navbar", !vp.prefs.showNavBar), checked: () => !!vp.prefs.showNavBar });

  // Fusion's own show/hide pairs (application bar View menu)
  reg({ id: "ShowViewCubeCommand", label: "Show ViewCube", kind: "ui", run: () => vp.setWidgetVisible("viewcube", true), enabled: () => !vp.prefs.showViewCube });
  reg({ id: "HideViewCubeCommand", label: "Hide ViewCube", kind: "ui", run: () => vp.setWidgetVisible("viewcube", false), enabled: () => !!vp.prefs.showViewCube });
  reg({ id: "ShowNavigationToolbarCommand", label: "Show Navigation Bar", kind: "ui", run: () => vp.setWidgetVisible("navbar", true), enabled: () => !vp.prefs.showNavBar });
  reg({ id: "HideNavigationToolbarCommand", label: "Hide Navigation Bar", kind: "ui", run: () => vp.setWidgetVisible("navbar", false), enabled: () => !!vp.prefs.showNavBar });

  // ----- selection tools (SELECT panel) -----
  const st = vp.selectTool;
  reg({ id: "SelectCommand", label: "Select", tooltip: "Selects objects using direct, window, freeform, or paint selection.", run: () => { tools.stop(); }, checked: () => !tools.active });
  reg({ id: "selectWindow", label: "Window Selection", shortcut: "1", tooltip: "Selects objects inside a rectangular selection area.", run: () => { st.mode = "window"; tools.stop(); app.emit("commands", { id: "selectWindow" }); }, checked: () => st.mode === "window" });
  reg({ id: "selectFreeForm", label: "Freeform Selection", shortcut: "2", tooltip: "Selects objects inside an irregular selection area.", run: () => { st.mode = "freeform"; tools.stop(); app.emit("commands", { id: "selectFreeForm" }); }, checked: () => st.mode === "freeform" });
  reg({ id: "selectPaint", label: "Paint Selection", shortcut: "3", tooltip: "Selects objects using a brush path.", run: () => { st.mode = "paint"; tools.stop(); app.emit("commands", { id: "selectPaint" }); }, checked: () => st.mode === "paint" });
  const prio = (id, label, p) => reg({ id, label, run: () => { st.priority = p; app.toast(`Selection priority: ${label}`, "info", 1200); }, checked: () => st.priority === p });
  prio("SelectBodyPriorityCommand", "Select Body Priority", "body");
  prio("SelectFacePriorityCommand", "Select Face Priority", "face");
  prio("SelectEdgePriorityCommand", "Select Edge Priority", "edge");
  prio("SelectComponentPriorityCommand", "Select Component Priority", "body");
}

export class NavBar {
  constructor(vp, host) {
    this.vp = vp;
    this.app = vp.app;
    const root = el("div", "vp-navbar");
    root.setAttribute("role", "toolbar");
    host.appendChild(root);
    this.root = root;
    const btn = (cmd, iconId, title, cls = "") => {
      const b = el("button", `nb-btn ${cls}`, NAV_ICONS[iconId || cmd] || "");
      b.dataset.cmd = cmd;
      b.title = title;
      b.addEventListener("click", () => this.app.commands.run(cmd));
      return b;
    };
    const caret = (menu, title) => {
      const b = el("button", "nb-caret", NAV_ICONS.caret);
      b.dataset.menu = menu;
      b.title = title;
      b.addEventListener("click", (e) => { e.stopPropagation(); this.openMenu(menu); });
      return b;
    };
    const split = (main, menu, title) => {
      const s = el("div", "nb-split");
      s.append(main, caret(menu, title));
      return s;
    };

    this.orbitBtn = btn("OrbitCommand", "FreeOrbitCommand", "Orbit");
    this.lookBtn = btn("LookAtCommand", null, "Look At");
    this.panBtn = btn("PanCommand", null, "Pan");
    this.zoomBtn = btn("ZoomCommand", null, "Zoom");
    // the Fit split button runs whichever item is current (Fit / Zoom Window)
    this.fitBtn = el("button", "nb-btn", NAV_ICONS.FitCommand);
    this.fitBtn.dataset.cmd = "FitCommand";
    this.fitBtn.title = "Fit";
    this.fitBtn.addEventListener("click", () => this.app.commands.run(this.vp.prefs.fitType === "window" ? "ZoomWindowCommand" : "FitCommand"));
    this.orbitSplit = split(this.orbitBtn, "orbit", "Orbit options");
    this.fitSplit = split(this.fitBtn, "fit", "Fit options");
    const dropBtn = (cmd, menu, title) => {
      const b = el("button", "nb-btn nb-drop", `${NAV_ICONS[cmd]}${NAV_ICONS.caret}`);
      b.dataset.cmd = cmd;
      b.dataset.menu = menu;
      b.title = title;
      b.addEventListener("click", (e) => { e.stopPropagation(); this.openMenu(menu); });
      return b;
    };
    this.displayBtn = dropBtn("ViewDisplayCommand", "display", "Display Settings");
    this.gridBtn = dropBtn("ViewLayoutGridCommand", "grid", "Grid and Snaps");
    this.viewsBtn = dropBtn("SplitViewWindowSyncCommand", "viewports", "Viewports");
    root.append(this.orbitSplit, this.lookBtn, this.panBtn, this.zoomBtn, this.fitSplit, this.displayBtn, this.gridBtn, this.viewsBtn);
    root.addEventListener("pointerdown", (e) => e.stopPropagation());
    root.addEventListener("contextmenu", (e) => e.preventDefault());
    this.update();
  }

  anchorOf(menu) {
    return { orbit: this.orbitSplit, fit: this.fitSplit, display: this.displayBtn, grid: this.gridBtn, viewports: this.viewsBtn }[menu];
  }

  items(menu) {
    const vp = this.vp;
    switch (menu) {
      case "orbit":
        return [
          { label: "Free Orbit", cmd: "FreeOrbitCommand", radio: true },
          { label: "Constrained Orbit", cmd: "ConstrainedOrbitCommand", radio: true },
        ];
      case "fit":
        return [
          { label: "Fit", cmd: "FitCommand", checked: () => vp.prefs.fitType !== "window", radio: true },
          { label: "Zoom Window", cmd: "ZoomWindowCommand", checked: () => vp.prefs.fitType === "window", radio: true },
        ];
      case "display": {
        const envs = (g) => Object.entries(ENVIRONMENTS).filter(([, e]) => e.group === g).map(([id, e]) => ({ label: e.label, cmd: id, radio: true, indent: true }));
        const fs = vp.isFullScreen();
        return [
          { label: "Visual Style", items: Object.entries(VISUAL_STYLES).map(([id, s]) => ({ label: s.label, cmd: id, radio: true })) },
          { label: "Environment", items: [{ header: "Theme-optimized" }, { sep: true }, ...envs("theme"), { sep: true }, { header: "Other" }, ...envs("other")] },
          { label: "Graphics Preset", items: PRESETS.map(([id, label]) => ({ label, cmd: id, radio: true })) },
          { label: "Effects", items: EFFECTS.map(([id, , label]) => ({ label, cmd: id, check: true })) },
          { label: "Object Visibility", items: [
            { label: "Show All", cmd: "ViewVisibilityShowAllCmd" },
            { label: "Hide All", cmd: "ViewVisibilityHideAllCmd" },
            { sep: true },
            ...vp.visibilityItems.map(([id, , label]) => ({ label, cmd: id, check: true })),
          ] },
          { label: "Camera", items: [
            { label: "Orthographic", cmd: "ViewCameraOrthoCommand", radio: true },
            { label: "Perspective", cmd: "ViewCameraPerspCommand", radio: true },
            { label: "Perspective with Ortho Faces", cmd: "ViewCameraPerspWithOrthoFacesCommand", radio: true },
          ] },
          { label: "Ground Plane Offset", cmd: "GroundPlaneOffsetCommand" },
          { sep: true },
          { label: fs ? "Exit Full Screen" : "Enter Full Screen", cmd: "ShowWorkspaceFullScreenCommand", icon: NAV_ICONS.fullScreen },
        ];
      }
      case "grid":
        return [
          { label: "Layout Grid", cmd: "ViewLayoutGrid", check: true },
          { label: "Layout Grid Lock", cmd: "ViewLayoutGridLockCommand", check: true },
          { label: "Snap to Grid", cmd: "ToggleGridSnapCommand", check: true },
          { label: "Grid Settings", cmd: "DefineGridCmd" },
          { sep: true },
          { label: "Incremental Move", cmd: "ToggleIncrementalMoveCmd", check: true },
          { label: "Set Increments", cmd: "SetSnapValueCmd" },
        ];
      case "viewports":
        return [
          { label: "Single View", cmd: "SingleViewCmd", radio: true },
          { label: "Multiple Views", cmd: "MultiViewCmd", radio: true, checked: false },
          { label: "Reset Views", cmd: "SplitViewResetCmd" },
        ];
      default:
        return [];
    }
  }

  openMenu(menu) {
    const anchor = this.anchorOf(menu) || this.root;
    const r = anchor.getBoundingClientRect();
    this.vp.menu.open(this.items(menu), { x: r.left + 2, y: r.top - 1, above: true, owner: anchor, toggle: true, cls: `vp-menu-nav vp-menu-${menu}` });
  }

  /** Reflect active tools / current split items. */
  update() {
    const vp = this.vp;
    const t = vp.navTools;
    const orbitIcon = vp.prefs.orbitType === "constrained" ? "ConstrainedOrbitCommand" : "FreeOrbitCommand";
    if (this._orbitIcon !== orbitIcon) { this.orbitBtn.innerHTML = NAV_ICONS[orbitIcon]; this._orbitIcon = orbitIcon; }
    this.orbitBtn.title = vp.prefs.orbitType === "constrained" ? "Constrained Orbit" : "Free Orbit";
    const fitIcon = vp.prefs.fitType === "window" ? "ZoomWindowCommand" : "FitCommand";
    if (this._fitIcon !== fitIcon) { this.fitBtn.innerHTML = NAV_ICONS[fitIcon]; this._fitIcon = fitIcon; }
    this.fitBtn.dataset.cmd = fitIcon;
    this.fitBtn.title = vp.prefs.fitType === "window" ? "Zoom Window" : "Fit";
    this.orbitBtn.classList.toggle("active", !!t && (t.is("orbitFree") || t.is("orbitConstrained")));
    this.lookBtn.classList.toggle("active", !!t && t.is("lookAt"));
    this.panBtn.classList.toggle("active", !!t && t.is("pan"));
    this.zoomBtn.classList.toggle("active", !!t && t.is("zoom"));
    this.fitBtn.classList.toggle("active", !!t && t.is("zoomWindow"));
  }

  setVisible(v) { this.root.style.display = v ? "" : "none"; }
}

/** Small Fusion-style command dialogs owned by the viewport (Grid Settings, Set Increments, Ground Plane Offset). */
export class ViewDialogs {
  constructor(vp) {
    this.vp = vp;
    this.app = vp.app;
    this.cur = null;
  }

  close() {
    if (this.cur) { this.cur.remove(); this.cur = null; }
  }

  _dialog(id, title, rows, onOk) {
    this.close();
    const d = el("div", "vp-dlg");
    d.dataset.dialog = id;
    d.innerHTML = `<div class="vp-dlg-head"><span class="vp-dlg-title"></span><button class="vp-dlg-x" data-action="cancel" title="Cancel">&times;</button></div><div class="vp-dlg-body"></div><div class="vp-dlg-foot"><button class="vp-dlg-btn primary" data-action="ok">OK</button><button class="vp-dlg-btn" data-action="cancel">Cancel</button></div>`;
    d.querySelector(".vp-dlg-title").textContent = title;
    const body = d.querySelector(".vp-dlg-body");
    const inputs = {};
    for (const r of rows) {
      const row = el("label", "vp-dlg-row");
      const lab = el("span", "vp-dlg-label");
      lab.textContent = r.label;
      let inp;
      if (r.type === "check") {
        inp = el("input");
        inp.type = "checkbox";
        inp.checked = !!r.value;
      } else {
        inp = el("input", "vp-dlg-input");
        inp.type = "text";
        inp.value = r.value;
      }
      inp.dataset.input = r.id;
      inputs[r.id] = inp;
      row.append(lab, inp);
      body.appendChild(row);
      if (r.onChange) inp.addEventListener("input", () => r.onChange(inputs));
    }
    for (const r of rows) if (r.onChange) r.onChange(inputs);
    const ok = () => {
      try {
        if (onOk(inputs) === false) return;
      } catch (e) { this.app.toast(String(e.message || e), "error"); return; }
      this.close();
    };
    d.querySelector('[data-action="ok"]').addEventListener("click", ok);
    for (const b of d.querySelectorAll('[data-action="cancel"]')) b.addEventListener("click", () => this.close());
    d.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); ok(); }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.close(); }
    });
    (this.app.dom.overlay || document.body).appendChild(d);
    this.cur = d;
    const first = d.querySelector(".vp-dlg-input");
    if (first) setTimeout(() => { first.focus(); first.select(); }, 0);
    return d;
  }

  _num(str, kind) {
    const E = this.app.E;
    const v = E.evaluate(String(str), () => undefined, kind);
    if (typeof v !== "number" || !isFinite(v)) throw new Error(`Invalid value: ${str}`);
    return v;
  }

  gridSettings() {
    const g = this.vp.prefs.grid;
    this._dialog("DefineGridCmd", "Grid Settings", [
      { id: "adaptive", label: "Adaptive", type: "check", value: g.adaptive !== false, onChange: (i) => { i.major && (i.major.disabled = i.adaptive.checked); i.minor && (i.minor.disabled = i.adaptive.checked); } },
      { id: "major", label: "Major Grid Spacing", value: `${g.major} mm` },
      { id: "minor", label: "Minor Subdivisions", value: String(g.subdivisions) },
    ], (i) => {
      const major = this._num(i.major.value, "length");
      const sub = Math.round(Number(i.minor.value));
      if (!(major > 0)) throw new Error("Major Grid Spacing must be greater than zero");
      if (!(sub >= 1 && sub <= 100)) throw new Error("Minor Subdivisions must be between 1 and 100");
      this.vp.setGridPref("adaptive", i.adaptive.checked, false);
      this.vp.setGridPref("major", major, false);
      this.vp.setGridPref("subdivisions", sub);
    });
  }

  increments() {
    const g = this.vp.prefs.grid;
    this._dialog("SetSnapValueCmd", "Set Increments", [
      { id: "linear", label: "Linear Increments", value: `${g.linearIncrement} mm` },
      { id: "rotation", label: "Rotation Increments", value: `${g.angularIncrement} deg` },
    ], (i) => {
      const lin = this._num(i.linear.value, "length");
      const ang = this._num(i.rotation.value, "angle");
      if (!(lin > 0)) throw new Error("Linear Increments must be greater than zero");
      if (!(ang > 0)) throw new Error("Rotation Increments must be greater than zero");
      this.vp.setGridPref("linearIncrement", lin, false);
      this.vp.setGridPref("angularIncrement", ang);
    });
  }

  groundOffset() {
    const cur = this.vp.prefs.groundOffset || 0;
    this._dialog("GroundPlaneOffsetCommand", "Ground Plane Offset", [
      { id: "offset", label: "Offset", value: `${cur} mm` },
    ], (i) => {
      const v = this._num(i.offset.value, "length");
      this.vp.setGroundOffset(v);
    });
  }
}
