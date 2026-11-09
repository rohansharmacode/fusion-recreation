// Marking menu (right-click radial + overflow list) and a generic context-menu list.
//
// Layout follows Fusion's own Design marking menu definition (MarkingMenus.xml,
// EnvId FusionSolidEnvironment / FusionSketchEnvironment, TypeId BaseMenu) and the look of the
// real menu (light theme): eight white rectangular buttons around the cursor —
//   N "Repeat <last>" · NW "Delete ✖" · NE "Press Pull" · W "Undo ↶" · E "Redo ↷" (grey when unavailable)
//   SW "Move/Copy ✥" · SE "Hole" · S "Sketch ▼" (2nd tier: Finish Sketch, 2-Point Rectangle, Spline,
//   Project, Line, Offset, Sketch Dimension, Center Diameter Circle). Inside a command: W Cancel, E OK.
// Left-hand buttons read "label icon", right-hand ones "icon label".
// The overflow list (TypeId Overflow) sits directly above the radial, centred on the cursor:
//   OK Return, Cancel Esc, Pan, Zoom, Constrained Orbit, Set/Reset Orbit Center, the selection's
//   commands in the XML's order, Remove | Show All | Unisolate, Workspace ▸ | the environment's
//   Shortcuts (Design: Extrude E, Fillet F, Insert Component; Sketch: Line L, 2-Point Rectangle R, …).
// The sketch environment uses the same eight buttons (FusionSketchEnvironment BaseMenu is identical;
// Finish Sketch is N of the Sketch tier); its overflow lists the sketch commands for the selection
// and, with nothing selected, goes Remove | Show All | Unisolate, Workspace ▸ | Line, 2-Point
// Rectangle, Center Diameter Circle (Fusion 2706, ref 11).
//
// Interaction: the item in the pointer's direction is highlighted (classic marking menu);
// click runs it. Right-press-drag ("flick") toward an item and release runs it without waiting.
import { el, esc, iconHtml, glyphHtml, shortcutOf } from "./util.js";
import { SHORTCUT_LABELS } from "./shortcuts.js";
import { MARKING_MENUS, TAB_ENVIRONMENTS } from "../shell/spec.js";

const POS = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"]; // index = round(angle/45) (screen y down)
// Button placement relative to the cursor (measured on Fusion 2706, light theme, 21 px buttons):
// cx = centred, left = left edge offset, right = right edge offset; top = top edge offset.
const PLACE = {
  N: { cx: 0, top: -67 }, NE: { left: 23, top: -37 }, E: { left: 43, top: -10 }, SE: { left: 23, top: 17 },
  S: { cx: 0, top: 47 }, SW: { right: -23, top: 17 }, W: { right: -43, top: -10 }, NW: { right: -23, top: -37 },
};
const LEFT_SIDE = new Set(["W", "NW", "SW"]);
const DEAD = 14; // centre dead zone radius
const REACH = 320; // beyond this the click closes the menu instead of running the sector item
const OV_GAP = 74; // overflow list bottom edge sits this far above the cursor

export const BASE_MENU = [
  { pos: "N", id: "RepeatCommand" },
  { pos: "NE", id: "FusionPressPullCommand" },
  { pos: "E", id: "RedoCommand" },
  { pos: "SE", id: "FusionHoleCommand" },
  { pos: "S", submenu: "sketch", label: "Sketch" },
  { pos: "SW", id: "FusionMoveCommand" },
  { pos: "W", id: "UndoCommand" },
  { pos: "NW", id: "FusionDeleteCommand" },
];
export const SKETCH_MENU = [
  { pos: "N", id: "SketchStop" },
  { pos: "NE", id: "ShapeRectangleTwoPoint" },
  { pos: "E", id: "DrawSpline" },
  { pos: "SE", id: "ProjectNewCmd" },
  { pos: "S", id: "DrawPolyline" },
  { pos: "SW", id: "Offset" },
  { pos: "W", id: "SketchDimension" },
  { pos: "NW", id: "CircleCenterRadius" },
];

// Fusion names for ids that may not be registered in this build.
export const FALLBACK_LABELS = {
  RepeatCommand: "Repeat", FusionPressPullCommand: "Press Pull", RedoCommand: "Redo", Redo: "Redo",
  FusionHoleCommand: "Hole", FusionMoveCommand: "Move/Copy", UndoCommand: "Undo", Undo: "Undo",
  FusionDeleteCommand: "Delete", SketchStop: "Finish Sketch", ShapeRectangleTwoPoint: "2-Point Rectangle",
  DrawSpline: "Fit Point Spline", ProjectNewCmd: "Project", DrawPolyline: "Line", Offset: "Offset",
  SketchDimension: "Sketch Dimension", CircleCenterRadius: "Center Diameter Circle", SketchCreate: "Create Sketch",
  Extrude: "Extrude", ConstructionPlaneOffsetFromPlaneCommand: "Offset Plane", FusionFilletEdgesCommand: "Fillet",
  FusionChamferCommand: "Chamfer", FusionShellBodyCommand: "Shell", PhysicalMaterialCommand: "Physical Material",
  AppearanceCommand: "Appearance", FusionPropertiesCommand: "Properties", LookAtCommand: "Look At",
  PanCommand: "Pan", ZoomCommand: "Zoom", ConstrainedOrbitCommand: "Constrained Orbit", FreeOrbitCommand: "Orbit",
  SetOrbitCenterCommand: "Set Orbit Center", ResetOrbitCenterCommand: "Reset Orbit Center",
  SketchActivate: "Edit Sketch", FusionEditFeatureCommand: "Edit Feature", VisibilityToggleCmd: "Show/Hide",
  ShowAllBodiesCmd: "Show All Bodies", ShowAllComponentsCmd: "Show All", FusionSuppressCommand: "Suppress Features", FusionUnsuppressCommand: "Unsuppress Features",
  FusionSaveAsSTLCommand: "Save As Mesh", FindInBrowser: "Find in Browser", FindInWindow: "Find in Window",
  FusionFindInTimeline: "Find in Timeline", RenameBrowserCmd: "Rename", IsolateCmd: "Isolate", UnisolateCmd: "Unisolate", UnisolateAllCmd: "Unisolate",
  SoftDeleteCommand: "Remove",
  ConstraintCoincident: "Coincident", ConstraintCollinear: "Collinear", ConstraintConcentric: "Concentric",
  ConstraintMidPoint: "Midpoint", ConstraintFix: "Fix/Unfix", ConstraintParallel: "Parallel", ConstraintPerpendicular: "Perpendicular",
  ConstraintHorizontalVertical: "Horizontal/Vertical", ConstraintTangent: "Tangent", ConstraintEqual: "Equal",
  ConstraintSymmetry: "Symmetry", SketchConstructionCmd: "Normal/Construction", MeasureCommand: "Measure",
  ...SHORTCUT_LABELS,
};

// Canonical command ids for XML ids that this recreation registers under another id.
export const CANON = { UndoCommand: "Undo", RedoCommand: "Redo", VisibilityToggleCmd: "ToggleVisibility", SketchFixConstraintCmd: "ConstraintFix" };

// ---------------------------------------------------------------------------
// Original glyphs (simple shapes drawn for this recreation)
// ---------------------------------------------------------------------------
const svg = (body, size = 16, vb = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}" aria-hidden="true">${body}</svg>`;
export const MM_GLYPHS = {
  redX: () => svg('<path d="M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8" stroke="#e8170c" stroke-width="2.5" fill="none"/>'),
  greenCheck: () => svg('<path d="M2.4 8.6l3.7 3.6 7.6-8.4" stroke="#3d9a13" stroke-width="2.4" fill="none" stroke-linejoin="round"/>'),
  undo: () => svg('<path d="M5.2 3.6L2.2 6.6l3 3" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round" stroke-linecap="round"/><path d="M2.8 6.6h6.4a4 4 0 0 1 4 4v2" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>'),
  redo: () => svg('<path d="M10.8 3.6l3 3-3 3" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round" stroke-linecap="round"/><path d="M13.2 6.6H6.8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>'),
  move: () => svg('<path d="M8 2.6v10.8M2.6 8h10.8" stroke="currentColor" stroke-width="1.5"/><path d="M8 .6l2.5 3H5.5zM8 15.4l2.5-3h-5zM.6 8l3-2.5v5zM15.4 8l-3-2.5v5z" fill="currentColor"/>'),
  repeat: () => svg('<path d="M12.6 7.2A4.8 4.8 0 1 0 11.4 11" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M13.8 3.6v4.2H9.6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>'),
  down: () => svg('<path d="M2.6 5.2h8.8L7 10.4z" fill="currentColor"/>', 14, 14),
  right: () => svg('<path d="M4.5 2.5L10 7l-5.5 4.5z" fill="currentColor"/>', 14, 14),
  unisolate: () => svg('<path d="M1.5 1.5h5v5h-5zM9.5 1.5h5v5h-5zM1.5 9.5h5v5h-5zM9.5 9.5h5v5h-5z" fill="none" stroke="#4a4a4a" stroke-width="1"/>'),
  remove: () => svg('<circle cx="10.6" cy="8" r="3.4" fill="#1f7fd8"/><path d="M1 8l3.4-2.6v5.2z" fill="#1f7fd8"/><path d="M4 8h3.6" stroke="#1f7fd8" stroke-width="1.6"/>'),
  orbitSet: () => svg('<circle cx="8" cy="8" r="5.9" fill="none" stroke="#4a4a4a" stroke-width="1.1"/><circle cx="8" cy="8" r="3.3" fill="#3aaa35"/>'),
  orbitReset: () => svg('<circle cx="5" cy="10.8" r="3.6" fill="#3aaa35"/><path d="M6.2 5.4l3.2-2.6v5.2z" fill="#1e1e1e"/><path d="M9 5.4h6" stroke="#1e1e1e" stroke-width="1.8"/>'),
  eye: () => svg('<path d="M1 8c1.8-3.2 4.2-4.8 7-4.8s5.2 1.6 7 4.8c-1.8 3.2-4.2 4.8-7 4.8S2.8 11.2 1 8z" fill="#3c3c3c"/><circle cx="8" cy="8" r="2.9" fill="#fff"/><circle cx="8" cy="8" r="1.6" fill="#3c3c3c"/>'),
};
// Overflow-list glyphs (plain Fusion-style list icons).
const OV_GLYPH = {
  SetOrbitCenterCommand: "orbitSet", ResetOrbitCenterCommand: "orbitReset", SoftDeleteCommand: "remove",
  UnisolateAllCmd: "unisolate", UnisolateCmd: "unisolate", ShowAllComponentsCmd: "eye", ShowAllBodiesCmd: "eye",
};
// Radial-button glyphs that differ from the toolbar icons (Fusion uses plain glyphs here).
const RADIAL_GLYPH = {
  FusionDeleteCommand: "redX", Undo: "undo", UndoCommand: "undo", Redo: "redo", RedoCommand: "redo", FusionMoveCommand: "move",
};

// ---------------------------------------------------------------------------
// Selection context helpers
// ---------------------------------------------------------------------------
const BODYISH = new Set(["body", "face", "edge", "vertex"]);
function featureOf(app, r) {
  if (!r) return null;
  if (r.kind === "feature" || r.kind === "cplane") return app.feature(r.id);
  if (r.kind === "profile" || r.kind === "sketchCurve" || r.kind === "sketchPoint" || r.kind === "sketchDim") return app.feature(r.sketch);
  return null;
}
function planeRef(app, r) {
  if (!r) return false;
  if (r.kind === "face") return r.planar !== false;
  if (r.kind === "originPlane" || r.kind === "cplane") return true;
  if (r.kind === "feature") { const f = app.feature(r.id); return !!f && (f.type === "cplane" || f.type === "sketch"); }
  return false;
}

export function buildContext(app) {
  const items = app.selection.items.slice();
  const kinds = new Set(items.map((r) => r.kind));
  const feats = items.map((r) => featureOf(app, r)).filter(Boolean);
  let hiddenBodies = false;
  try { hiddenBodies = app.bodies().some((b) => b.meta && b.meta.visible === false); } catch { /* ignore */ }
  const sketchKinds = ["sketchCurve", "sketchPoint", "sketchDim"];
  const curves = [];
  if (app.mode === "sketch" && app.activeSketch) {
    const st = app.sketchState(app.activeSketch);
    const f = app.feature(app.activeSketch);
    const sk = (st && st.sk) || (f && f.sk);
    for (const r of items) if (r.kind === "sketchCurve" && sk && sk.curves[r.curve]) curves.push(sk.curves[r.curve].type);
  }
  return {
    app, mode: app.mode, items, kinds, feats, hiddenBodies,
    n: items.length,
    has: (...k) => k.some((x) => kinds.has(x)),
    only: (...k) => items.length > 0 && items.every((r) => k.includes(r.kind)),
    bodyish: items.some((r) => BODYISH.has(r.kind)),
    bodies: items.some((r) => r.kind === "body"),
    planar: items.length === 1 && planeRef(app, items[0]),
    sketchSel: items.some((r) => sketchKinds.includes(r.kind)),
    lines: curves.filter((t) => t === "line").length,
    circles: curves.filter((t) => t === "circle" || t === "arc").length,
    points: items.filter((r) => r.kind === "sketchPoint").length,
    curves: curves.length,
    sketchFeature: feats.find((f) => f.type === "sketch") || null,
    inCommand: !!app.activeCommand,
  };
}

const always = () => true;
// Overflow list for the Design (solid) environment, in MarkingMenus.xml order.
// Each entry: [id | id[] (first registered wins), when(ctx)] or "-" (separator).
const NAV = [
  ["PanCommand", always],
  ["ZoomCommand", always],
  [["ConstrainedOrbitCommand", "FreeOrbitCommand", "OrbitCommand"], always],
  ["SetOrbitCenterCommand", always],
  ["ResetOrbitCenterCommand", always],
];
const OVERFLOW_MODEL = [
  ...NAV,
  "-",
  ["FusionMoveCommand", (c) => c.bodies],
  "-",
  ["SketchCreate", (c) => c.planar],
  ["Extrude", (c) => c.has("profile") || (c.n === 1 && c.has("face") && c.planar)],
  ["ConstructionPlaneOffsetFromPlaneCommand", (c) => c.planar],
  ["FusionFilletEdgesCommand", (c) => c.only("edge")],
  ["FusionChamferCommand", (c) => c.only("edge")],
  ["FusionShellBodyCommand", (c) => c.only("face", "body")],
  "-",
  ["SketchActivate", (c) => c.n === 1 && !!c.sketchFeature],
  ["FusionEditFeatureCommand", (c) => c.n === 1 && c.has("feature", "cplane") && c.feats.length === 1 && c.feats[0].type !== "sketch"],
  "-",
  ["PhysicalMaterialCommand", (c) => c.bodyish],
  ["AppearanceCommand", (c) => c.bodyish],
  [["FusionPropertiesCommand", "PropertiesCommand", "Properties"], (c) => c.bodyish],
  "-",
  ["FusionSaveAsSTLCommand", (c) => c.only("body")],
  "-",
  ["FusionDeleteCommand", (c) => c.n > 0 && !c.has("originPlane", "originAxis", "originPoint")],
  ["SoftDeleteCommand", (c) => c.n === 0 || c.bodyish],
  ["RenameBrowserCmd", (c) => c.n === 1 && c.has("body", "feature", "cplane")],
  "-",
  ["LookAtCommand", (c) => c.planar || (c.n === 1 && !!c.sketchFeature)],
  "-",
  ["FusionSuppressCommand", (c) => c.feats.length > 0 && c.has("feature", "cplane") && c.feats.some((f) => !f.suppressed)],
  ["FusionUnsuppressCommand", (c) => c.feats.length > 0 && c.has("feature", "cplane") && c.feats.some((f) => f.suppressed)],
  "-",
  ["VisibilityToggleCmd", (c) => c.has("body", "feature", "cplane", "profile", "sketchCurve")],
  ["ShowAllComponentsCmd", (c) => c.n === 0],
  ["ShowAllBodiesCmd", (c) => c.n > 0 && c.hiddenBodies],
  "-",
  ["IsolateCmd", (c) => c.only("body")],
  ["UnisolateAllCmd", (c) => c.n === 0],
  "-",
  ["FindInBrowser", (c) => c.n === 1],
  ["FindInWindow", (c) => c.n === 1 && c.has("feature")],
  ["FusionFindInTimeline", (c) => c.n === 1 && c.feats.length === 1],
];

// Sketch environment overflow (FusionSketchEnvironment): sketch-specific entries.
const OVERFLOW_SKETCH = [
  ...NAV,
  "-",
  ["SketchDimension", (c) => c.curves > 0 || c.points > 1],
  [["SketchConstructionCmd", "SketchConstruction", "ToggleConstruction", "ConstructionToggle", "NormalConstruction"], (c) => c.curves > 0],
  "-",
  ["ConstraintCoincident", (c) => c.points >= 1 && c.n === 2],
  ["ConstraintCollinear", (c) => c.lines === 2],
  ["ConstraintConcentric", (c) => c.circles === 2],
  ["ConstraintMidPoint", (c) => c.points === 1 && c.lines === 1],
  ["ConstraintFix", (c) => c.curves > 0 || c.points > 0],
  ["ConstraintParallel", (c) => c.lines === 2],
  ["ConstraintPerpendicular", (c) => c.lines === 2],
  ["ConstraintHorizontalVertical", (c) => c.lines >= 1 && c.circles === 0],
  ["ConstraintTangent", (c) => c.circles >= 1 && c.curves === 2],
  ["ConstraintEqual", (c) => c.curves === 2 && (c.lines === 2 || c.circles === 2)],
  ["ConstraintSymmetry", (c) => c.lines === 1 && c.curves === 3],
  // fit point of a fit point spline: tangent handle (sketch module, app.ui.sketch.fitPointInfo)
  ["AddTangentHandle", (c) => { const f = c.app.ui.sketch && c.app.ui.sketch.fitPointInfo && c.app.ui.sketch.fitPointInfo(c.items); return !!f && !f.active; }],
  ["DeleteTangentCommand", (c) => { const f = c.app.ui.sketch && c.app.ui.sketch.fitPointInfo && c.app.ui.sketch.fitPointInfo(c.items); return !!f && f.active; }],
  ["AddCurvatureHandle", (c) => { const f = c.app.ui.sketch && c.app.ui.sketch.fitPointInfo && c.app.ui.sketch.fitPointInfo(c.items); return !!f && !f.curv; }],
  ["DeleteCurvatureCommand", (c) => { const f = c.app.ui.sketch && c.app.ui.sketch.fitPointInfo && c.app.ui.sketch.fitPointInfo(c.items); return !!f && !!f.curv; }],
  "-",
  ["FusionDeleteCommand", (c) => c.n > 0],
  ["SoftDeleteCommand", (c) => c.n === 0],
  "-",
  ["LookAtCommand", (c) => c.n > 0],
  "-",
  // Fusion 2706 (ref 11): with nothing selected the list goes Remove | Show All | Unisolate — the
  // Sketch Palette Show/Hide Profile, Dimension, … rows are not offered here.
  ["ShowAllComponentsCmd", (c) => c.n === 0],
  ["ShowAllBodiesCmd", (c) => c.n > 0 && c.hiddenBodies],
  "-",
  ["UnisolateAllCmd", (c) => c.n === 0],
];

const WORKSPACES_FALLBACK = [
  { id: "FusionSolidEnvironment", label: "Design" }, { id: "GenerativeEnvironment", label: "Generative Design" },
  { id: "FusionRenderEnvironment", label: "Render" }, { id: "Publisher3DEnvironment", label: "Animation" },
  { id: "SimulationEnvironment", label: "Simulation" }, { id: "CAMEnvironment", label: "Manufacture" },
  { id: "FusionDocumentationEnvironment", label: "Drawing" },
];

// ---------------------------------------------------------------------------
export function createMarkingMenu(app, opts = {}) {
  const S = { root: null, cx: 0, cy: 0, level: "base", hi: -1, slots: [], gesture: false, ctx: null, hoverTimer: 0, removeInput: null, openedAt: 0 };
  const resolveId = opts.resolveId || ((id) => CANON[id] || id);
  const shortcuts = opts.shortcuts || null;

  const host = () => app.dom.overlay || document.body;
  const def = (id) => app.commands.get(id);
  const labelOf = (id) => { const d = def(id); return (d && d.label) || FALLBACK_LABELS[id] || id; };

  function isOpen() { return !!S.root; }

  function close() {
    if (!S.root) return;
    clearTimeout(S.hoverTimer);
    S.root.remove();
    S.root = null;
    S.hi = -1;
    if (S.removeInput) { S.removeInput(); S.removeInput = null; }
    app.emit("marking-menu", { open: false });
  }

  // Which items occupy the 8 positions right now
  function radialSlots(level, ctx) {
    const slots = new Array(8).fill(null);
    const put = (pos, item) => { slots[POS.indexOf(pos)] = item; };
    if (level === "base" && (ctx.inCommand || ctx.tool)) {
      const okEnabled = commandCanOk();
      put("W", { kind: "action", action: "cancel", label: "Cancel", glyph: "redX", enabled: true });
      put("E", { kind: "action", action: "ok", label: "OK", glyph: "greenCheck", enabled: okEnabled, ok: true });
      return slots;
    }
    const spec = level === "sketch" ? SKETCH_MENU : level === "base" ? baseMenu() : (envSubmenus[level] || BASE_MENU);
    for (const s of spec) {
      if (s.submenu) { put(s.pos, { kind: "submenu", submenu: s.submenu, label: s.label, enabled: true }); continue; }
      const id = resolveId(s.id);
      const d = def(id);
      let label = labelOf(id);
      let enabled = !!d && app.commands.isEnabled(id);
      let icon = id, glyph = RADIAL_GLYPH[s.id] || RADIAL_GLYPH[id] || null;
      if (s.id === "RepeatCommand") {
        const last = app.commands.lastRepeatable;
        const ld = last && def(last);
        label = ld ? `Repeat ${ld.label || last}` : "Repeat";
        enabled = !!ld && (app.commands.isEnabled(last) || (!ld.stub && ld.when === "sketch" && app.mode !== "sketch" && app.commands.has("SketchCreate")));
        icon = ld ? last : null;
        glyph = ld ? null : "repeat";
      }
      // sketch tools from the model environment: start Create Sketch first (Fusion does the same)
      if (!enabled && d && !d.stub && d.when === "sketch" && app.mode !== "sketch" && s.id !== "SketchStop" && app.commands.has("SketchCreate")) enabled = true;
      put(s.pos, { kind: "cmd", id, xmlId: s.id, label, icon, glyph, enabled, stub: !!(d && d.stub), missing: !d });
    }
    return slots;
  }

  function filtered(spec, ctx, seen) {
    const out = [];
    for (const e of spec) {
      if (e === "-") { if (out.length && out[out.length - 1] !== "-") out.push("-"); continue; }
      const [ids, when] = e;
      const cand = (Array.isArray(ids) ? ids : [ids]).map(resolveId);
      const id = cand.find((x) => { const d = def(x); return d && !d.stub; });
      if (!id || seen.has(id)) continue;
      let ok = false;
      try { ok = !!when(ctx); } catch { ok = false; }
      if (!ok) continue;
      seen.add(id);
      const d = def(id);
      out.push({ id, label: labelOf(id), enabled: app.commands.isEnabled(id), shortcut: shortcutOf(d), icon: OV_GLYPH[id] ? false : id, glyph: OV_GLYPH[id] });
    }
    while (out.length && out[out.length - 1] === "-") out.pop();
    while (out.length && out[0] === "-") out.shift();
    return out;
  }

  // Radial layout of the active environment (MarkingMenus.xml per EnvId): a contextual environment's own
  // (env.markingMenu: an EnvId of spec MARKING_MENUS or an explicit [{pos, id}] list), else the active toolbar
  // tab's TabEnvironment (SURFACE -> FusionSurfaceEnvironment, SHEET METAL -> FusionSheetMetalEnvironment),
  // else the Design menu. Second tiers named "Sketch" reuse the sketch tier.
  const envSubmenus = {};
  function adoptMenu(items) {
    if (!Array.isArray(items) || !items.length) return null;
    return items.map((it) => {
      if (!it.submenu || typeof it.submenu === "string") return it;
      const key = /^sketch$/i.test(it.label || "") ? "sketch" : `env-${String(it.label || "more").toLowerCase().replace(/\W+/g, "-")}`;
      if (key !== "sketch") envSubmenus[key] = it.submenu;
      return { pos: it.pos, submenu: key, label: it.label || "More" };
    });
  }
  function baseMenu() {
    let env = null;
    try { env = app.environment; } catch { env = null; }
    if (env && env.mode !== "sketch" && env.markingMenu) {
      const m = adoptMenu(Array.isArray(env.markingMenu) ? env.markingMenu : MARKING_MENUS[env.markingMenu]);
      if (m) return m;
    }
    const tab = app.ui.toolbar && app.ui.toolbar.activeTab;
    const te = tab && TAB_ENVIRONMENTS[tab];
    if (!env && te && MARKING_MENUS[te]) { const m = adoptMenu(MARKING_MENUS[te]); if (m) return m; }
    return BASE_MENU;
  }

  function workspaceItems() {
    let ws = WORKSPACES_FALLBACK.map((w) => ({ ...w, registered: w.id === "FusionSolidEnvironment" }));
    try { if (typeof app.workspaceList === "function") ws = app.workspaceList(); } catch { /* ignore */ }
    const cur = app.workspace || "FusionSolidEnvironment";
    return ws.map((w) => ({
      label: w.label, icon: false, checked: w.id === cur,
      run: () => { if (w.id === cur) return; if (typeof app.setWorkspace === "function") app.setWorkspace(w.id); else app.toast(`The ${w.label} workspace isn't available in this unofficial recreation`, "info"); },
    }));
  }

  function overflowItems(ctx) {
    const inCmd = ctx.inCommand || ctx.tool;
    const okEnabled = commandCanOk();
    const out = [
      { action: "ok", label: "OK", shortcut: "Return", glyph: "greenCheck", enabled: okEnabled },
      { action: "cancel", label: "Cancel", shortcut: "Esc", glyph: "redX", enabled: true },
    ];
    const seen = new Set();
    const spec = inCmd ? NAV : ctx.mode === "sketch" ? OVERFLOW_SKETCH : OVERFLOW_MODEL;
    out.push(...filtered(spec, ctx, seen));
    if (!inCmd) {
      out.push({ label: "Workspace", icon: false, submenu: workspaceItems(), dataset: { mm: "workspace" } });
      const sc = shortcuts ? shortcuts.list() : [];
      const rows = [];
      for (const id of sc) {
        const d = def(id);
        const enabled = !!d && !d.stub && app.commands.isEnabled(id);
        // sketch tools are offered in the model environment too (they start Create Sketch first)
        const viaSketch = !!d && !d.stub && d.when === "sketch" && app.mode !== "sketch" && app.commands.has("SketchCreate");
        rows.push({ id, label: labelOf(id), shortcut: shortcutOf(d), enabled: enabled || viaSketch, shortcutItem: true });
      }
      if (rows.length) out.push("-", ...rows);
    }
    return out;
  }

  /** Is OK available for the running command? (canOk() when provided, else the dialog's OK button state) */
  function commandCanOk() {
    const ac = app.activeCommand;
    if (!ac) return true;
    try {
      if (typeof ac.canOk === "function") return !!ac.canOk();
      const b = document.querySelector(`.dlg[data-dialog="${CSS.escape(ac.id)}"] [data-action="ok"]`);
      if (b) return !b.disabled && b.getAttribute("aria-disabled") !== "true" && !b.classList.contains("disabled");
    } catch { /* ignore */ }
    return true;
  }

  function activeTool() {
    // A tool handler on top of the input stack (e.g. a sketch Line tool) gets OK/Cancel.
    const st = app.input.stack;
    for (let i = st.length - 1; i >= 0; i--) {
      const h = st[i];
      if (!h || h.__menus) continue;
      if (h.name === "select") return null;
      const nm = String(h.name || "");
      const named = nm && app.commands.get(nm.replace(/^(sketch-)?tool:/, ""));
      if (h.tool === true || h.isTool === true || /^(sketch-)?tool:/.test(nm) || (named && (named.kind === "tool" || named.kind === "feature"))) return h;
      return null;
    }
    return null;
  }

  // ------------------------------------------------------------------ render
  function itemIcon(it) {
    if (it.glyph) return MM_GLYPHS[it.glyph] ? MM_GLYPHS[it.glyph]() : glyphHtml(it.glyph, 16);
    if (it.icon) return iconHtml(it.icon, 16);
    return "";
  }

  function render() {
    const root = S.root;
    root.innerHTML = "";
    root.dataset.level = S.level;
    const ctx = S.ctx;
    S.slots = radialSlots(S.level, ctx);

    S.slots.forEach((it, i) => {
      if (!it) return;
      const pos = POS[i];
      const node = el("div", {
        class: `mm-item mm-pos-${pos}${LEFT_SIDE.has(pos) ? " mm-left" : ""}${it.enabled ? "" : " mm-disabled"}${it.stub ? " mm-stub" : ""}${it.kind === "submenu" ? " mm-sub" : ""}${it.ok ? " mm-ok" : ""}`,
        dataset: { pos, index: String(i) },
      });
      if (it.kind === "cmd") node.dataset.cmd = it.id;
      if (it.kind === "action") node.dataset.action = it.action;
      if (it.kind === "submenu") node.dataset.mm = `${it.submenu}-submenu`;
      const ic = it.kind === "submenu" ? `<span class="mm-caret">${MM_GLYPHS.down()}</span>` : `<span class="mm-ico">${itemIcon(it)}</span>`;
      const label = `<span class="mm-label">${esc(it.label)}</span>`;
      // Fusion: left-hand buttons and the Sketch submenu read "label icon", the others "icon label"
      node.innerHTML = LEFT_SIDE.has(pos) || it.kind === "submenu" ? label + ic : ic + label;
      if (it.stub) node.title = `${it.label} is not available in this recreation`;
      root.appendChild(node);
      const p = PLACE[pos];
      const w = node.offsetWidth;
      let x;
      if (p.cx !== undefined) x = S.cx + p.cx - w / 2;
      else if (p.left !== undefined) x = S.cx + p.left;
      else x = S.cx + p.right - w;
      node.style.left = `${Math.round(x)}px`;
      node.style.top = `${Math.round(S.cy + p.top)}px`;
      node.addEventListener("pointerenter", () => { if (!S.gesture) setHi(i, true); });
    });

    // gesture trail (only while flicking)
    if (S.gesture) {
      const trail = el("div", { class: "mm-trail", html: `<svg width="1" height="1"><line class="mm-trail-line" x1="0" y1="0" x2="0" y2="0"/><circle class="mm-trail-dot" r="2.5"/></svg>` });
      root.appendChild(trail);
    }

    // overflow list
    if (S.level === "base") {
      const items = overflowItems(ctx);
      if (items.length) {
        const ov = buildList(items, (it) => runOverflow(it), "mm-overflow");
        root.appendChild(ov);
        placeOverflow(ov);
      }
    }
    updateHighlight();
  }

  function radialBounds() {
    let l = S.cx, r = S.cx, t = S.cy, b = S.cy;
    for (const n of S.root.querySelectorAll(".mm-item")) {
      const x = parseFloat(n.style.left) || 0, y = parseFloat(n.style.top) || 0;
      l = Math.min(l, x); r = Math.max(r, x + n.offsetWidth); t = Math.min(t, y); b = Math.max(b, y + n.offsetHeight);
    }
    return { l, r, t, b };
  }

  function placeOverflow(ov) {
    const W = window.innerWidth, H = window.innerHeight;
    const w = ov.offsetWidth, h = ov.offsetHeight;
    // Fusion: directly above the radial, centred on the cursor
    let x = S.cx - w / 2;
    let y = S.cy - OV_GAP - h;
    if (y < 4) {
      // not enough room above: beside the radial (right, else left), as high as fits
      const rb = radialBounds();
      x = rb.r + 10;
      if (x + w > W - 4) x = rb.l - 10 - w;
      y = Math.max(4, Math.min(S.cy - h / 2, H - 4 - h));
      if (h > H - 8) { ov.style.maxHeight = `${H - 8}px`; y = 4; }
    }
    x = Math.max(4, Math.min(W - 4 - w, x));
    ov.style.left = `${Math.round(x)}px`;
    ov.style.top = `${Math.round(y)}px`;
  }

  function setHi(i, fromHover = false) {
    if (S.hi !== i) {
      S.hi = i;
      updateHighlight();
      clearTimeout(S.hoverTimer);
      S.hoverTimer = 0;
    }
    const it = i >= 0 ? S.slots[i] : null;
    // resting on the submenu item opens the 2nd tier
    if (it && it.kind === "submenu" && fromHover && !S.hoverTimer) {
      S.hoverTimer = setTimeout(() => { S.hoverTimer = 0; if (S.root && S.hi === i) openSubmenu(it, null); }, 260);
    }
  }

  function updateHighlight() {
    if (!S.root) return;
    for (const n of S.root.querySelectorAll(".mm-item")) n.classList.toggle("mm-hi", Number(n.dataset.index) === S.hi);
  }

  function updateTrail(x, y) {
    const t = S.root && S.root.querySelector(".mm-trail svg");
    if (!t) return;
    const l = t.querySelector("line");
    l.setAttribute("x1", S.cx); l.setAttribute("y1", S.cy); l.setAttribute("x2", x); l.setAttribute("y2", y);
    const d = t.querySelector("circle");
    d.setAttribute("cx", S.cx); d.setAttribute("cy", S.cy);
  }

  function sectorAt(x, y) {
    const dx = x - S.cx, dy = y - S.cy;
    const d = Math.hypot(dx, dy);
    if (d < DEAD || d > REACH) return -1;
    let k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    k = ((k % 8) + 8) % 8;
    return S.slots[k] ? k : -1;
  }

  function overOverflow(t) { return t && t.closest && t.closest(".mm-overflow, .mn-submenu"); }

  // ------------------------------------------------------------------ open / run
  function open(x, y, o = {}) {
    close();
    app.emit("marking-menu", { open: true });
    S.ctx = buildContext(app);
    S.ctx.tool = activeTool();
    S.level = "base";
    S.gesture = !!o.gesture;
    S.openedAt = performance.now();
    const W = window.innerWidth, H = window.innerHeight;
    S.cx = Math.max(110, Math.min(W - 110, x));
    S.cy = Math.max(80, Math.min(H - 80, y));
    S.hi = -1;
    const root = el("div", { class: "mm-root", role: "menu" });
    S.root = root;
    host().appendChild(root);
    render();

    root.addEventListener("contextmenu", (ev) => ev.preventDefault());
    root.addEventListener("pointermove", (ev) => {
      if (S.gesture) return; // window handler drives gestures
      if (overOverflow(ev.target)) { setHi(-1); return; }
      const t = ev.target.closest && ev.target.closest(".mm-item");
      if (t) return; // pointerenter handled it
      setHi(sectorAt(ev.clientX, ev.clientY));
    });
    // click mode: press and release in the same direction runs the item
    const indexAt = (ev) => {
      const t = ev.target.closest && ev.target.closest(".mm-item");
      return t ? Number(t.dataset.index) : sectorAt(ev.clientX, ev.clientY);
    };
    S.downIdx = -1;
    root.addEventListener("pointerdown", (ev) => {
      if (S.gesture) return;
      if (overOverflow(ev.target)) return;
      if (ev.button === 2) { ev.preventDefault(); close(); return; }
      if (ev.button !== 0) { close(); return; }
      const i = indexAt(ev);
      if (i < 0) { close(); return; }
      ev.preventDefault();
      S.downIdx = i;
    });
    root.addEventListener("pointerup", (ev) => {
      if (S.gesture || ev.button !== 0 || S.downIdx < 0) return;
      const i = indexAt(ev);
      S.downIdx = -1;
      if (i >= 0) activate(i, { x: ev.clientX, y: ev.clientY });
    });
    root.addEventListener("wheel", () => close(), { passive: true });

    S.removeInput = app.input.push({
      name: "marking-menu", __menus: true, modal: true,
      onKeyDown(ev) { if (ev.key === "Escape") { close(); return true; } return true; },
      onCancel() { close(); return true; },
    });
    return root;
  }

  function openSubmenu(it, at) {
    if (!S.root || it.kind !== "submenu") return;
    clearTimeout(S.hoverTimer);
    S.hoverTimer = 0;
    S.downIdx = -1;
    let x, y;
    if (at) { x = at.x; y = at.y; } else {
      const n = S.root.querySelector(`.mm-item[data-mm="${it.submenu}-submenu"]`);
      const r = n ? n.getBoundingClientRect() : null;
      x = r ? r.left + r.width / 2 : S.cx;
      y = r ? r.top + r.height / 2 : S.cy + 57;
    }
    const W = window.innerWidth, H = window.innerHeight;
    S.cx = Math.max(110, Math.min(W - 110, x));
    S.cy = Math.max(80, Math.min(H - 80, y));
    S.level = it.submenu;
    S.hi = -1;
    render();
  }

  function runAction(action) {
    const ac = app.activeCommand;
    const tool = S.ctx && S.ctx.tool;
    close();
    setTimeout(() => {
      try {
        if (ac) { action === "ok" ? ac.ok() : ac.cancel(); return; }
        if (tool) {
          if (action === "ok" && typeof tool.onOk === "function") tool.onOk();
          else if (action === "ok" && typeof tool.onKeyDown === "function") tool.onKeyDown(new KeyboardEvent("keydown", { key: "Enter" }));
          else if (typeof tool.onCancel === "function") tool.onCancel();
          else app.input.remove(tool);
          return;
        }
        // no command running: Cancel behaves like Esc (clears the selection), OK like Return
        if (action === "cancel") app.selection.clear();
      } catch (e) { console.error(e); app.toast(String(e.message || e), "error"); }
    }, 0);
  }

  function activate(i, at) {
    const it = S.slots[i];
    if (!it) return;
    if (it.kind === "submenu") { openSubmenu(it, at); return; }
    if (!it.enabled) {
      if (it.kind === "cmd" && (it.stub || it.missing)) { close(); app.commands.run(it.id); }
      return;
    }
    if (it.kind === "action") { runAction(it.action); return; }
    runCommand(it.id, at);
  }

  function runOverflow(it) {
    if (it.action) { runAction(it.action); return; }
    if (it.run) { close(); setTimeout(() => it.run(), 0); return; }
    if (it.id) runCommand(it.id);
  }

  function runCommand(id, at) {
    close();
    setTimeout(() => {
      const target = id === "RepeatCommand" && app.commands.lastRepeatable ? app.commands.lastRepeatable : id;
      const d = app.commands.get(target);
      if (d && !d.stub && d.when === "sketch" && app.mode !== "sketch" && target !== "SketchStop" && opts.runInNewSketch) {
        opts.runInNewSketch(target);
        return;
      }
      app.commands.run(id, { source: "marking-menu", clientX: at && at.x, clientY: at && at.y });
    }, 0);
  }

  // ------------------------------------------------------------------ gestures
  // Right-press on the canvas, drag beyond a few px: the menu opens at the press point in
  // gesture mode; releasing over a direction runs that item ("flick").
  let press = null;
  let suppressUntil = 0;
  function attachGestures(canvas) {
    if (!canvas) return;
    canvas.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 2) return;
      press = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, moved: false, t: performance.now() };
    });
    window.addEventListener("pointermove", (ev) => {
      if (!press) return;
      if (!(ev.buttons & 2)) { press = null; return; }
      const d = Math.hypot(ev.clientX - press.x, ev.clientY - press.y);
      if (!press.moved && d > 10) {
        press.moved = true;
        if (!isOpen()) open(press.x, press.y, { gesture: true });
        else { S.gesture = true; render(); }
      }
      if (press.moved && isOpen()) {
        updateTrail(ev.clientX, ev.clientY);
        if (overOverflow(document.elementFromPoint(ev.clientX, ev.clientY))) { setHi(-1); return; }
        const i = sectorAt(ev.clientX, ev.clientY);
        setHi(i);
        // gesture through a submenu item: switch to the 2nd tier at the pointer
        const it = i >= 0 ? S.slots[i] : null;
        if (it && it.kind === "submenu" && Math.hypot(ev.clientX - S.cx, ev.clientY - S.cy) > 60) openSubmenu(it, { x: ev.clientX, y: ev.clientY });
      }
    }, true);
    window.addEventListener("pointerup", (ev) => {
      if (!press || ev.button !== 2) return;
      const p = press;
      press = null;
      if (!p.moved) return; // plain right-click: the contextmenu event opens the menu
      suppressUntil = performance.now() + 600; // swallow the contextmenu that follows the release
      if (!isOpen()) return;
      const t = document.elementFromPoint(ev.clientX, ev.clientY);
      const ovItem = t && t.closest && t.closest(".mm-overflow .mn-mi");
      if (ovItem && !ovItem.classList.contains("mn-disabled")) { ovItem.click(); return; }
      const i = sectorAt(ev.clientX, ev.clientY);
      S.gesture = false;
      if (i >= 0 && S.slots[i] && S.slots[i].kind !== "submenu") activate(i, { x: ev.clientX, y: ev.clientY });
      else if (i < 0) close();
      else render(); // released on the submenu item: stay open in click mode
    }, true);
    window.addEventListener("contextmenu", (ev) => {
      if (performance.now() < suppressUntil) { ev.preventDefault(); ev.stopPropagation(); suppressUntil = 0; }
    }, true);
  }

  return { open, close, isOpen, attachGestures, buildList, activeTool, buildContext: () => buildContext(app), overflowItems: () => overflowItems(buildContext(app)), get state() { return S; } };

  // ------------------------------------------------------------------ list rendering (overflow + context menus)
  function buildList(items, onPick, cls = "") {
    const ov = el("div", { class: `mn-menu ${cls}`, role: "menu" });
    for (const it of items) {
      if (it === "-") { ov.appendChild(el("div", { class: "mn-sep" })); continue; }
      const row = el("div", { class: `mn-mi${it.enabled === false ? " mn-disabled" : ""}${it.checked ? " mn-checked" : ""}`, role: "menuitem" });
      if (it.id) row.dataset.cmd = it.id;
      if (it.action) row.dataset.action = it.action;
      if (it.dataset) Object.assign(row.dataset, it.dataset);
      const ic = it.glyph ? (MM_GLYPHS[it.glyph] ? MM_GLYPHS[it.glyph]() : glyphHtml(it.glyph, 16)) : it.icon === false ? "" : iconHtml(it.icon || it.id || "", 16);
      row.innerHTML = `<span class="mn-mi-ico">${it.checked ? MM_GLYPHS.greenCheck() : ic}</span><span class="mn-mi-label">${esc(it.label)}</span><span class="mn-mi-sc">${esc(it.shortcut || "")}</span>${it.submenu ? `<span class="mn-mi-caret">${MM_GLYPHS.right()}</span>` : ""}`;
      row.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      row.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (it.enabled === false || it.submenu) return;
        onPick(it, ev);
      });
      if (it.submenu) {
        // fixed-position flyout next to the row (the list itself may scroll and would clip it)
        let sub = null, timer = 0;
        const closeSub = () => { clearTimeout(timer); if (sub) { sub.remove(); sub = null; } };
        const later = () => { clearTimeout(timer); timer = setTimeout(closeSub, 220); };
        row.addEventListener("pointerenter", () => {
          clearTimeout(timer);
          if (sub) return;
          sub = buildList(it.submenu, onPick, "mn-submenu");
          sub.style.position = "fixed";
          (ov.parentElement || app.dom.overlay || document.body).appendChild(sub);
          const r = row.getBoundingClientRect();
          const sr = sub.getBoundingClientRect();
          let x = r.right - 1, y = r.top - 2;
          if (x + sr.width > window.innerWidth - 4) x = r.left - sr.width + 1;
          if (y + sr.height > window.innerHeight - 4) y = window.innerHeight - 4 - sr.height;
          sub.style.left = `${Math.round(x)}px`; sub.style.top = `${Math.round(y)}px`;
          sub.addEventListener("pointerenter", () => clearTimeout(timer));
          sub.addEventListener("pointerleave", later);
        });
        row.addEventListener("pointerleave", later);
      }
      ov.appendChild(row);
    }
    return ov;
  }
}

/**
 * Generic context menu (app.ui.contextMenu.show; used for the toolbox's Pin/Remove menu and by
 * any module that wants a Fusion-style right-click list).
 * items: [{label, id?(command id), run?(), enabled?, checked?, shortcut?, icon?, glyph?, submenu?:[...]}, "-", ...]
 */
export function createContextMenu(app, mm) {
  let cur = null;
  function close() {
    if (!cur) return;
    cur.el.remove();
    for (const s of document.querySelectorAll(".mn-submenu")) if (!s.closest(".mm-root")) s.remove();
    window.removeEventListener("pointerdown", cur.outside, true);
    window.removeEventListener("keydown", cur.key, true);
    cur = null;
  }
  function show(items, x, y) {
    close();
    const norm = items.map((it) => {
      if (it === "-") return it;
      if (it.id && it.enabled === undefined) {
        const d = app.commands.get(it.id);
        return { ...it, label: it.label || (d && d.label) || it.id, enabled: !!d && !d.stub && app.commands.isEnabled(it.id), shortcut: it.shortcut ?? shortcutOf(d) };
      }
      return it;
    });
    const list = mm.buildList(norm, (it) => {
      close();
      setTimeout(() => {
        try { if (it.run) it.run(); else if (it.id) app.commands.run(it.id, { source: "context-menu" }); } catch (e) { console.error(e); app.toast(String(e.message || e), "error"); }
      }, 0);
    }, "mn-context");
    (app.dom.overlay || document.body).appendChild(list);
    const r = list.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    list.style.left = `${Math.round(Math.max(4, Math.min(x, W - r.width - 4)))}px`;
    list.style.top = `${Math.round(Math.max(4, y + r.height > H - 4 ? H - r.height - 4 : y))}px`;
    list.addEventListener("contextmenu", (ev) => ev.preventDefault());
    const outside = (ev) => { if (!list.contains(ev.target) && !(ev.target.closest && ev.target.closest(".mn-submenu"))) close(); };
    const key = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); ev.preventDefault(); close(); } };
    setTimeout(() => { if (cur && cur.el === list) { window.addEventListener("pointerdown", outside, true); window.addEventListener("keydown", key, true); } }, 0);
    cur = { el: list, outside, key };
    return list;
  }
  return { show, close, isOpen: () => !!cur };
}
