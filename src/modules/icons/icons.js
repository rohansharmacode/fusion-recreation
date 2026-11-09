// Original SVG icon set for the Fusion Design-workspace recreation (no Autodesk artwork).
//
// Contract (stable, used by every UI module):
//   icon(id, {size=32, title?, class?}) -> SVG markup for a command id (Fusion command ids from
//        TabToolbars.xml / MarkingMenus.xml, e.g. "Extrude", "FusionFilletEdgesCommand", "SketchStop").
//        32x32 viewBox; at size <= 20 strokes are thickened so the icon stays legible at 16px.
//        Unknown ids are matched by keyword (e.g. "MyExtrudeThing" -> Extrude) and finally get a
//        neutral generic icon - icon() never throws and never returns an empty string.
//   featureIcon(type | feature, {size=16, mode?, feature?}) -> timeline / browser icon for a feature type
//        ("sketch", "extrude", "revolve", "fillet", "chamfer", "shell", "draft", "hole", "box",
//        "cylinder", "sphere", "torus", "cplane", "rpattern", "cpattern", "move", "mirror", "combine",
//        "loft", "sweep", "delete", ...). Passing the feature object itself (or {feature}) lets a cplane
//        pick its variant from feature.mode ('offset'|'angle'|'midplane'|'tangent'...).
//   uiIcon(name, {size=16, title?, class?}) -> 16x16 UI glyph. Monochrome glyphs use currentColor
//        (set CSS `color`); browser / status glyphs are coloured. Names: see uiIconNames(), e.g.
//        eye eye-off caret-down caret-right close folder body component sketch origin plane axis point
//        settings play pause first prev next last marker save undo redo file grid home search help
//        bell user data-panel check pin more warning error info ok orbit free-orbit pan zoom fit
//        look-at display viewports camera star plus minus gear lock link light fx clock refresh trash
//        edit copy filter comment ruler keyboard select move flip swap radio checkbox ... (+ aliases)
//   hasIcon(id) -> true when icon(id) resolves to a real (non-generic) icon.
//   iconUrl(id, opts) / uiIconUrl(name, opts) -> "data:image/svg+xml,..." for CSS backgrounds / <img>.
//   iconIds(), iconGroups(), featureTypes(), uiIconNames() -> lists (used by scripts/icon-gallery.mjs).
import { ctx, esc } from "./draw.js";
import { SOLID, SOLID_GROUPS } from "./cmd-solid.js";
import { SKETCH, SKETCH_GROUPS } from "./cmd-sketch.js";
import { OTHER, OTHER_GROUPS } from "./cmd-other.js";
import { UI, UI_ALIASES } from "./ui.js";
import { scene, box, badge } from "./parts.js";

const CMD = Object.assign(Object.create(null), OTHER, SOLID, SKETCH);

/** Alternative ids (older Fusion ids, ids other modules may register, short names). */
const ALIAS = {
  Undo: "UndoCommand", Redo: "RedoCommand", Repeat: "RepeatCommand", RepeatLastCommand: "RepeatCommand",
  ToggleVisibility: "VisibilityToggleCmd", properties: "FusionPropertiesCommand", Properties: "FusionPropertiesCommand", PropertiesCommand: "FusionPropertiesCommand",
  FinishSketch: "SketchStop", SketchFinish: "SketchStop", StopSketch: "SketchStop", EditSketch: "SketchActivate", SketchEdit: "SketchActivate",
  CreateSketch: "SketchCreate", Sketch: "SketchCreate", Line: "DrawPolyline", Point: "DrawPoint", Spline: "DrawSpline", Text: "MTextCmd",
  Project: "ProjectNewCmd", Dimension: "SketchDimension", Trim: "TrimSketchCmd", Extend: "ExtendSketchCmd", Fillet: "FusionFilletEdgesCommand",
  Chamfer: "FusionChamferCommand", Shell: "FusionShellBodyCommand", Draft: "FusionDraftCommand", Hole: "FusionHoleCommand", PressPull: "FusionPressPullCommand",
  Move: "FusionMoveCommand", MoveCopy: "FusionMoveCommand", Combine: "FusionCombineCommand", Delete: "FusionDeleteCommand", Mirror: "MirrorCommand",
  Loft: "SolidLoft", Box: "PrimitiveBox", Cylinder: "PrimitiveCylinder", Sphere: "PrimitiveSphere", Torus: "PrimitiveTorus", Coil: "PrimitiveCoil", Pipe: "PrimitivePipe",
  RectangularPattern: "PatternRectangular", CircularPattern: "PatternCircular", Thread: "FusionThreadCommand", Scale: "ModifyScale", SplitBody: "FusionSplitBodyCommand",
  SplitFace: "FusionSplitFaceCommand", Joint: "AssemblyMateCommand", NewComponent: "FusionCreateNewComponentCommand", Measure: "MeasureCommand",
  SectionAnalysis: "FusionHalfSectionViewCommand", CenterOfMass: "FusionCenterOfMassCommand", Appearance: "AppearanceCommand", PhysicalMaterial: "PhysicalMaterialCommand",
  ChangeParameters: "ChangeParameterCommand", ComputeAll: "FusionComputeAllCommand", OffsetPlane: "ConstructionPlaneOffsetFromPlaneCommand",
  PlaneAtAngle: "ConstructionPlaneAtAngleCommand", MidPlane: "ConstructionMidPlaneCommand", Midplane: "ConstructionMidPlaneCommand",
  ConstructionPlaneTangentCommand: "ConstructionTangentPlaneCommand", WorkPlaneAtAngleCommand: "ConstructionPlaneAtAngleCommand", WorkPlaneMidPlaneCommand: "ConstructionMidPlaneCommand",
  Select: "SelectCommand", WindowSelect: "selectWindow", FreeformSelect: "selectFreeForm", PaintSelect: "selectPaint",
  Orbit: "ConstrainedOrbitCommand", OrbitCommand: "ConstrainedOrbitCommand", FreeOrbit: "FreeOrbitCommand", Pan: "PanCommand", Zoom: "ZoomCommand", ZoomWindow: "ZoomWindowCommand",
  Fit: "FitCommand", FitView: "FitCommand", ZoomFit: "FitCommand", ZoomToFit: "FitCommand", FitToWindow: "FitCommand", ZoomToFitCommand: "FitCommand", FitAll: "FitCommand",
  LookAt: "LookAtCommand", Home: "HomeViewCommand", HomeView: "HomeViewCommand", GoHome: "HomeViewCommand", ViewHome: "HomeViewCommand",
  DisplaySettingsCommand: "DisplaySettings", VisualStyle: "DisplaySettings", GridAndSnaps: "GridSettings", Viewports: "ViewportsCommand",
  Save: "FileSave", SaveAs: "FileSaveAs", Open: "FileOpen", New: "FileNew", NewDesign: "FileNew", Export: "FileExport", ExportSTL: "FileExportSTL", FileExportStl: "FileExportSTL",
  FileExportStep: "FileExportSTEP", ExportSTEP: "FileExportSTEP", Import: "FileImport", Toolbox: "ShowToolbox", Shortcuts: "KeyboardShortcuts", Help: "About",
  Copy: "CopyCommand", Paste: "PasteCommand", Rename: "RenameBrowserCmd", Isolate: "IsolateCmd", Unisolate: "UnisolateCmd", Suppress: "SuppressFeature",
  EditFeatureCommand: "EditFeature", FusionEditFeatureCommand: "EditFeature", FusionPasteNewCommand: "PasteCommand", FusionInsertComponentCommand: "FusionImportCommandFromToolbar",
  JointCommand: "AssemblyMateCommand", AsBuiltJoint: "JointAsBuiltCmd", FusionSaveAsSTLCommand: "FileExportSTL", FusionExportComponentCommand: "FileExport",
  SketchConstruction: "SketchConstructionCmd", ToggleConstruction: "SketchConstructionCmd", NormalConstruction: "SketchConstructionCmd", SketchFixConstraintCmd: "ConstraintFix",
  ShowProfiles: "ShowProfile", HideProfile: "ShowProfile", Slice: "SliceSketchCommand", SurfaceThicken: "FusionSurfaceThickenCommand", Thicken: "FusionSurfaceThickenCommand",
  ShowHideBrowser: "ToggleBrowser", ShowDataPanel: "ToggleDataPanel", TextCommandsCommand: "TextCommands", NamedView: "NamedViewCommand", AddNamedViewCommand: "NamedViewCommand",
  ParaMeshInsertCommand: "ParaMeshInsertAlignCommand", InsertMesh: "ParaMeshInsertAlignCommand", InsertDerive: "PullDeriveCommand", Derive: "PullDeriveCommand",
  InsertSVG: "SketchImportSVG", InsertDXF: "ImportDxfFileCommand", Canvas: "FusionAddCanvasCommand", Decal: "FusionAddEditDecalCommand",
  CoordinateSystem: "CoordinateSystemCommand", ActivateEnvironmentCommand: "ToggleViewCube",
};

/** Feature type (timeline/browser) -> command icon. */
const FEATURE = {
  sketch: "SketchFeature", extrude: "Extrude", revolve: "Revolve", sweep: "Sweep", loft: "SolidLoft",
  fillet: "FusionFilletEdgesCommand", chamfer: "FusionChamferCommand", shell: "FusionShellBodyCommand", draft: "FusionDraftCommand",
  hole: "FusionHoleCommand", thread: "FusionThreadCommand", rib: "FusionRibCommand", web: "FusionWebCommand", emboss: "EmbossCmd",
  box: "PrimitiveBox", cylinder: "PrimitiveCylinder", sphere: "PrimitiveSphere", torus: "PrimitiveTorus", coil: "PrimitiveCoil", pipe: "PrimitivePipe",
  cplane: "ConstructionPlaneOffsetFromPlaneCommand", plane: "ConstructionPlaneOffsetFromPlaneCommand", caxis: "ConstructionAxisThroughTwoPointsCommand",
  axis: "ConstructionAxisThroughTwoPointsCommand", cpoint: "ConstructionPointFromPointCommand", point: "ConstructionPointFromPointCommand",
  rpattern: "PatternRectangular", cpattern: "PatternCircular", ppattern: "PatternOnPath", pattern: "PatternRectangular",
  move: "FusionMoveCommand", mirror: "MirrorCommand", combine: "FusionCombineCommand", delete: "FusionDeleteCommand", remove: "SoftDeleteCommand",
  presspull: "FusionPressPullCommand", offsetface: "FusionOffsetFacesCommand", replaceface: "FusionReplaceFaceCommand", split: "FusionSplitBodyCommand",
  splitbody: "FusionSplitBodyCommand", splitface: "FusionSplitFaceCommand", scale: "ModifyScale", align: "AlignCmd", thicken: "FusionSurfaceThickenCommand",
  joint: "AssemblyMateCommand", asbuiltjoint: "JointAsBuiltCmd", component: "FusionCreateNewComponentCommand", rigidgroup: "RigidGroupCmd",
  form: "TSplineBaseFeatureCreationCommand", basefeature: "BaseFeatureCreationCommand", canvas: "FusionAddCanvasCommand", decal: "FusionAddEditDecalCommand",
  mesh: "MeshCommand", surface: "SurfaceCommand", patch: "FusionSurfacePatchCommand", stitch: "FusionSurfaceStitchCommand", trim: "FusionSurfaceTrimCommand",
  appearance: "AppearanceCommand", material: "PhysicalMaterialCommand", section: "FusionHalfSectionViewCommand", derive: "PullDeriveCommand",
  flange: "FusionSheetMetalFlangeCommand", boundaryfill: "SurfaceSculpt", snapshot: "SnapshotCmd",
};
const CPLANE_MODES = {
  offset: "ConstructionPlaneOffsetFromPlaneCommand", angle: "ConstructionPlaneAtAngleCommand", midplane: "ConstructionMidPlaneCommand",
  tangent: "ConstructionTangentPlaneCommand", twoEdges: "ConstructionPlaneFromTwoEdgesCommand", threePoints: "ConstructionPlaneFromThreePointsCommand",
  alongPath: "ConstructionPlaneAlongPathCommand", perpendicular: "ConstructionPlanePerpendicularToPlaneCommand",
};

/** Keyword fallbacks for ids we do not know exactly (ordered, first match wins). */
const GUESS = [
  [/(finish|stop).*sketch|sketch.*(stop|finish)/i, "SketchStop"], [/undo/i, "UndoCommand"], [/redo/i, "RedoCommand"], [/repeat/i, "RepeatCommand"],
  [/free.?orbit/i, "FreeOrbitCommand"], [/orbit/i, "ConstrainedOrbitCommand"], [/^pan(command|view)?$|^view.?pan/i, "PanCommand"],
  [/zoom.?window/i, "ZoomWindowCommand"], [/zoom.?(to)?.?fit|fit.?(all|view|window)|^fit/i, "FitCommand"], [/zoom/i, "ZoomCommand"],
  [/look.?at/i, "LookAtCommand"], [/home/i, "HomeViewCommand"], [/view.?cube/i, "ToggleViewCube"], [/nav.?bar|navigation.?bar/i, "ToggleNavBar"],
  [/browser/i, "ToggleBrowser"], [/data.?panel/i, "ToggleDataPanel"], [/reset.?layout/i, "ResetLayout"], [/display|visual.?style|effects/i, "DisplaySettings"],
  [/grid|snap/i, "GridSettings"], [/viewport/i, "ViewportsCommand"], [/named.?view|camera/i, "NamedViewCommand"], [/toolbox/i, "ShowToolbox"],
  [/shortcut|keyboard/i, "KeyboardShortcuts"], [/about/i, "About"], [/text.?command|console/i, "TextCommands"], [/visib|show.?hide/i, "VisibilityToggleCmd"],
  [/recover/i, "RecoverySave"], [/save.?as/i, "FileSaveAs"], [/save/i, "FileSave"], [/open/i, "FileOpen"], [/^file.?new|new.?(design|file|document)/i, "FileNew"],
  [/stl/i, "FileExportSTL"], [/step|\bstp\b/i, "FileExportSTEP"], [/export/i, "FileExport"], [/propert/i, "FusionPropertiesCommand"],
  [/param/i, "ChangeParameterCommand"], [/compute/i, "FusionComputeAllCommand"], [/appearance/i, "AppearanceCommand"], [/material/i, "PhysicalMaterialCommand"],
  [/measure/i, "MeasureCommand"], [/section/i, "FusionHalfSectionViewCommand"], [/center.?of.?mass/i, "FusionCenterOfMassCommand"], [/interfer/i, "InterferenceCheckCommand"],
  [/zebra/i, "FusionZebraAnalysisCommand"], [/curvature/i, "FusionCurvatureMapAnalysisCommand"], [/analys/i, "FusionCurvatureMapAnalysisCommand"],
  [/press.?pull/i, "FusionPressPullCommand"], [/extrude/i, "Extrude"], [/revolve/i, "Revolve"], [/sweep/i, "Sweep"], [/loft/i, "SolidLoft"],
  [/fillet/i, "FusionFilletEdgesCommand"], [/chamfer/i, "FusionChamferCommand"], [/shell/i, "FusionShellBodyCommand"], [/draft/i, "FusionDraftCommand"],
  [/hole/i, "FusionHoleCommand"], [/thread/i, "FusionThreadCommand"], [/emboss/i, "EmbossCmd"], [/thicken/i, "FusionSurfaceThickenCommand"],
  [/pattern.*circ|circ.*pattern/i, "PatternCircular"], [/pattern.*path/i, "PatternOnPath"], [/pattern/i, "PatternRectangular"], [/mirror/i, "MirrorCommand"],
  [/combine|boolean/i, "FusionCombineCommand"], [/split/i, "FusionSplitBodyCommand"], [/scale/i, "ModifyScale"], [/^copy|copycommand/i, "CopyCommand"],
  [/paste/i, "PasteCommand"], [/move|transform/i, "FusionMoveCommand"], [/align/i, "AlignCmd"], [/delete|erase/i, "FusionDeleteCommand"], [/remove/i, "SoftDeleteCommand"],
  [/joint/i, "AssemblyMateCommand"], [/component/i, "FusionCreateNewComponentCommand"], [/rigid/i, "RigidGroupCmd"], [/contact/i, "ContactSetCmd"], [/motion/i, "FusionMotionStudyCommand"],
  [/dimension/i, "SketchDimension"], [/constrain/i, "ConstraintCoincident"], [/coincident/i, "ConstraintCoincident"], [/tangent/i, "ConstraintTangent"],
  [/parallel/i, "ConstraintParallel"], [/perpendicular/i, "ConstraintPerpendicular"], [/concentric/i, "ConstraintConcentric"], [/symmetr/i, "ConstraintSymmetry"],
  [/project/i, "ProjectNewCmd"], [/offset/i, "Offset"], [/trim/i, "TrimSketchCmd"], [/extend/i, "ExtendSketchCmd"], [/break/i, "BreakSketchCmd"],
  [/construction/i, "ConstructionPlaneOffsetFromPlaneCommand"], [/plane/i, "ConstructionPlaneOffsetFromPlaneCommand"], [/axis/i, "ConstructionAxisThroughTwoPointsCommand"],
  [/polyline|\bline\b|line$/i, "DrawPolyline"], [/rect/i, "ShapeRectangleTwoPoint"], [/circle/i, "CircleCenterRadius"], [/\barc\b|^arc|arc$/i, "ArcThreePoint"],
  [/polygon/i, "ShapePolygonInscribed"], [/slot/i, "ShapeSlotCenterToCenter"], [/spline/i, "DrawSpline"], [/ellipse|elipse/i, "CircleElipse"],
  [/text|note/i, "MTextCmd"], [/point/i, "DrawPoint"], [/sketch/i, "SketchCreate"], [/box/i, "PrimitiveBox"], [/cylinder/i, "PrimitiveCylinder"],
  [/sphere/i, "PrimitiveSphere"], [/torus/i, "PrimitiveTorus"], [/coil|spring/i, "PrimitiveCoil"], [/pipe|tube/i, "PrimitivePipe"],
  [/mesh/i, "MeshCommand"], [/surface|patch|stitch/i, "SurfaceCommand"], [/sheet.?metal|flange|unfold/i, "FusionSheetMetalFlangeCommand"],
  [/form|t.?spline/i, "TSplineBaseFeatureCreationCommand"], [/select/i, "SelectCommand"], [/canvas|image/i, "FusionAddCanvasCommand"], [/decal/i, "FusionAddEditDecalCommand"],
  [/svg/i, "SketchImportSVG"], [/dxf/i, "ImportDxfFileCommand"], [/fastener|bolt|screw/i, "FusionFastenersCommand"], [/insert|derive|import/i, "FusionImportCommandFromToolbar"],
  [/script|add.?in/i, "ScriptsManagerCommand"], [/print/i, "ThreeDprintCmdDef"], [/bom|bill.?of/i, "MaterializedBomHybridCmd"], [/config/i, "FusionShowDesignConfigPanelCmd"],
  [/snapshot|position/i, "SnapshotCmd"], [/isolate/i, "IsolateCmd"], [/rename/i, "RenameBrowserCmd"], [/suppress/i, "SuppressFeature"], [/edit/i, "EditFeature"],
  [/find|search/i, "FindInWindow"], [/inspect/i, "MeasureCommand"], [/history|timeline/i, "ModelingToggleCmdDef"],
];

export const iconErrors = [];
const cache = new Map();

function resolve(id) {
  if (id == null) return null;
  const s = String(id);
  if (CMD[s]) return s;
  if (ALIAS[s] && CMD[ALIAS[s]]) return ALIAS[s];
  const low = s.toLowerCase();
  if (FEATURE[low] && CMD[FEATURE[low]]) return FEATURE[low];
  for (const [re, target] of GUESS) if (re.test(s) && CMD[target]) return target;
  return null;
}

function generic() {
  const s = scene({ ox: 16, oy: 21 });
  s.add(box(-6.5, -6.5, 0, 6.5, 6.5, 8), "light");
  return s.svg() + badge.spark(25, 7, 5, "#9fd0f7", "#0c58a2");
}

function wrap(inner, size, vb, o, name) {
  const cls = o.class ? `ico ${esc(o.class)}` : "ico";
  const a11y = o.title ? `role="img"` : `aria-hidden="true"`;
  const title = o.title ? `<title>${esc(o.title)}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}" ${a11y} focusable="false" data-icon="${esc(name)}">${title}${inner}</svg>`;
}

function render(key, fn, small) {
  const prev = ctx.small;
  ctx.small = small;
  try {
    return fn();
  } catch (e) {
    iconErrors.push(`${key}: ${e && e.message}`);
    return null;
  } finally {
    ctx.small = prev;
  }
}

function sizeOf(o, def) { const n = Number(typeof o === "number" ? o : o && o.size); return n > 0 ? n : def; }
/** Accept either an options object or a bare size number (icon(id, 16)). */
const norm = (o) => (o && typeof o === "object" ? o : typeof o === "number" ? { size: o } : {});

export function hasIcon(id) { return !!resolve(id); }

export function icon(id, opts = {}) {
  opts = norm(opts);
  const size = sizeOf(opts, 32);
  const small = size <= 20;
  const key = `c|${id}|${small ? 1 : 0}|${size}|${opts.class || ""}|${opts.title || ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = resolve(id);
  let inner = r ? render(r, CMD[r], small) : null;
  if (inner == null && !r && UI[String(id)]) inner = `<g transform="scale(2)" color="#46525e">${render(id, UI[String(id)], false) || ""}</g>`;
  if (inner == null) inner = render("generic", generic, small) || "";
  const out = wrap(inner, size, 32, opts, String(id));
  cache.set(key, out);
  return out;
}

export function featureIcon(type, opts = {}) {
  opts = norm(opts);
  if (type && typeof type === "object") { opts = { feature: type, ...opts }; type = type.type; }
  const t = String(type || "");
  let id = FEATURE[t] || FEATURE[t.toLowerCase()];
  const mode = opts.mode || (opts.feature && opts.feature.mode);
  if ((t === "cplane" || t === "plane") && mode && CPLANE_MODES[mode]) id = CPLANE_MODES[mode];
  return icon(id || t, { ...opts, size: sizeOf(opts, 16) });
}

export function uiIcon(name, opts = {}) {
  opts = norm(opts);
  const size = sizeOf(opts, 16);
  const key = `u|${name}|${size}|${opts.class || ""}|${opts.title || ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const nm = String(name);
  const fn = UI[nm] || UI[UI_ALIASES[nm]] || UI[nm.toLowerCase()] || UI[UI_ALIASES[nm.toLowerCase()]];
  let out;
  if (fn) out = wrap(render(nm, fn, false) || "", size, 16, opts, nm);
  else if (resolve(nm)) out = icon(nm, { ...opts, size });
  // Unknown name: one neutral glyph whose markup does not depend on the name, so callers can
  // detect "not in the set" by comparing against uiIcon("<anything unknown>").
  else out = wrap(`<circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.2"/>`, size, 16, opts, "unknown");
  cache.set(key, out);
  return out;
}

const toUrl = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
export const iconUrl = (id, opts = {}) => toUrl(icon(id, opts));
export const uiIconUrl = (name, opts = {}) => toUrl(uiIcon(name, opts));

export const iconIds = () => Object.keys(CMD);
export const iconGroups = () => {
  const groups = [...SOLID_GROUPS, ...SKETCH_GROUPS, ...OTHER_GROUPS];
  const seen = new Set(groups.flatMap(([, ids]) => ids));
  const rest = Object.keys(CMD).filter((id) => !seen.has(id));
  return rest.length ? [...groups, ["Other", rest]] : groups;
};
export const featureTypes = () => Object.keys(FEATURE);
export const uiIconNames = () => Object.keys(UI);
export const iconAliases = () => ({ ...ALIAS });
