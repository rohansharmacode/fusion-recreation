// Sketch environment module: Create/Edit/Finish Sketch, sketch rendering + picking for every
// visible sketch, drawing tools, dimensions, constraints, modify tools and the Sketch Palette.
import "./style.css";
import { ST, initCtx, onLocal, activeData, isSketchRef } from "./ctx.js";
import { initRender, rebuild, restyle, onCamera, applySlice, updateOverlay } from "./render.js";
import { installPick } from "./pick.js";
import { initPalette } from "./palette.js";
import { initStatus } from "./status.js";
import { initEnv, startCreateSketch, cancelPlanePick, planePickActive, enterSketch, finishSketch, lookAtSketch, deleteSelection } from "./env.js";
import { endTool, makeDrawTool } from "./tools.js";
import { DimensionTool, initDimension, closeEdit } from "./dimension.js";
import { CONSTRAINTS, runConstraint, runFix } from "./constraints.js";
import { TrimTool, ExtendTool, OffsetTool, FilletTool, ChamferTool, MirrorTool, ProjectTool, toggleConstruction, projectRefs } from "./modify.js";
import { SplineTool, BlendTool, makeEllipseTool } from "./freeform.js";

const inSketch = (app) => app.mode === "sketch";

// Drawing commands (they also work from the model environment: a plane is picked first,
// matching Fusion's PlaneSelectionInput for these commands).
const DRAW = [
  ["DrawPolyline", "Line", "L", "Creates lines and arcs. Select a start and end point to define a line segment. Click and drag the end point of a segment to define an arc."],
  ["SketchMidpointLine", "Midpoint Line", null, "Draws a line outwards from its midpoint."],
  ["ShapeRectangleTwoPoint", "2-Point Rectangle", "R", "Creates a rectangle defined by two diagonal corner points."],
  ["ShapeRectangleThreePoint", "3-Point Rectangle", null, "Creates a rectangle from three points: two corners of one edge and the height."],
  ["ShapeRectangleCenter", "Center Rectangle", null, "Creates a rectangle from a center point and a corner."],
  ["CircleCenterRadius", "Center Diameter Circle", "C", "Creates a circle from a center point and a diameter."],
  ["CircleTwoPoint", "2-Point Circle", null, "Creates a circle from the two end points of its diameter."],
  ["CircleThreePoint", "3-Point Circle", null, "Creates a circle through three points."],
  ["ArcThreePoint", "3-Point Arc", null, "Creates an arc from a start point, an end point and a point on the arc."],
  ["ArcCenterTwoPoint", "Center Point Arc", null, "Creates an arc from a center point, a start point and an end point."],
  ["ArcTangent", "Tangent Arc", null, "Creates an arc tangent to the end of an existing line or arc."],
  ["ShapePolygonCircumscribed", "Circumscribed Polygon", null, "Creates a polygon outside a construction circle."],
  ["ShapePolygonInscribed", "Inscribed Polygon", null, "Creates a polygon inside a construction circle."],
  ["ShapePolygonEdge", "Edge Polygon", null, "Creates a polygon from one edge."],
  ["ShapeSlotCenterToCenter", "Center to Center Slot", null, "Creates a slot from the two arc centers and the width."],
  ["ShapeSlotOverall", "Overall Slot", null, "Creates a slot from its overall length and width."],
  ["ShapeSlotCenterPoint", "Center Point Slot", null, "Creates a slot from its center, an arc center and the width."],
  ["DrawPoint", "Point", null, "Creates a sketch point."],
  ["DrawSpline", "Fit Point Spline", null, "Creates a spline through the selected fit points. Select the first point to start the spline. Select additional points as fit points."],
  ["CircleElipse", "Ellipse", null, "Creates an ellipse defined by a center point, major axis and a point on the ellipse."],
];
const FREEFORM_TOOLS = { DrawSpline: () => new SplineTool(), CircleElipse: () => makeEllipseTool() };

function startDrawTool(app, id, label) {
  const go = () => { const t = FREEFORM_TOOLS[id] ? FREEFORM_TOOLS[id]() : makeDrawTool(id, label); if (t) t.start(); };
  if (!inSketch(app)) { startCreateSketch(go); return; }
  go();
}

function registerCommands(app) {
  const reg = (d) => app.commands.register(d);
  reg({
    id: "SketchCreate", label: "Create Sketch", kind: "feature",
    tooltip: "Creates a new sketch on a selected plane or planar face.",
    run: () => startCreateSketch(null),
  });
  reg({
    id: "SketchStop", label: "Finish Sketch", kind: "tool", when: "sketch",
    tooltip: "Finishes the active sketch.",
    enabled: inSketch,
    run: () => { closeEdit(); finishSketch(); },
  });
  reg({
    id: "SketchActivate", label: "Edit Sketch", kind: "tool",
    tooltip: "Edits the selected sketch.",
    run: (a, ctx = {}) => {
      let id = ctx.id || ctx.featureId;
      if (!id) {
        const r = a.selection.items.find((x) => (x.kind === "feature" && a.feature(x.id) && a.feature(x.id).type === "sketch") || x.kind === "profile" || isSketchRef(x, null));
        id = r ? r.id || r.sketch : null;
      }
      if (!id) { a.toast("Select a sketch to edit", "info", 1800); return; }
      enterSketch(id);
    },
  });
  reg({ id: "SketchLookAt", label: "Look At", kind: "view", when: "sketch", enabled: inSketch, run: () => lookAtSketch(true) });
  for (const [id, label, sc, tip] of DRAW) {
    reg({ id, label, tooltip: tip, shortcut: sc || undefined, kind: "tool", run: (a) => startDrawTool(a, id, label) });
  }
  const sketchTool = (id, label, shortcut, tooltip, make) => reg({
    id, label, tooltip, shortcut: shortcut || undefined, kind: "tool", when: "sketch", enabled: inSketch,
    run: () => { if (!inSketch(app)) return; make(); },
  });
  sketchTool("SketchDimension", "Sketch Dimension", "D", "Creates a dimension. Select geometry, place the dimension, then enter a value or expression.", () => new DimensionTool().start());
  sketchTool("TrimSketchCmd", "Trim", "T", "Trims a curve to the nearest intersecting curves. Hover to preview the segment to remove.", () => new TrimTool().start());
  sketchTool("ExtendSketchCmd", "Extend", null, "Extends a curve to the nearest intersecting curve.", () => new ExtendTool().start());
  sketchTool("Offset", "Offset", "O", "Creates a copy of the selected curves at a specified distance.", () => new OffsetTool().start());
  sketchTool("FilletSketchCmd", "Fillet", null, "Rounds the corner between two lines with a tangent arc.", () => new FilletTool().start());
  sketchTool("ChamferSketchEqualDistance", "Equal Distance Chamfer", null, "Cuts a sketch corner with the same distance on both sides.", () => new ChamferTool("equal").start());
  sketchTool("ChamferSketchDistanceDistance", "Two Distance Chamfer", null, "Cuts a sketch corner with a different distance on each side.", () => new ChamferTool("dd").start());
  sketchTool("ChamferSketchDistanceAngle", "Distance and Angle Chamfer", null, "Cuts a sketch corner using one distance and an angle.", () => new ChamferTool("da").start());
  sketchTool("MirrorSketchCommand", "Mirror", null, "Mirrors sketch geometry about a line.", () => new MirrorTool().start());
  sketchTool("BlendG1CurveSketchCmd", "Blend Curve", null, "Creates a tangent or curvature continuous blend curve between the endpoints of two sketch curves or edges. Select two sketch curves or edges in the canvas to blend.", () => new BlendTool().start());
  sketchTool("ProjectNewCmd", "Project", "P", "Projects edges and faces of bodies onto the sketch plane.", () => {
    const pre = app.selection.items.filter((r) => r.kind === "edge" || r.kind === "face" || r.kind === "body");
    if (pre.length) { projectRefs(pre); app.selection.clear(); }
    new ProjectTool().start();
  });
  for (const [id, def] of Object.entries(CONSTRAINTS)) sketchTool(id, def.label, null, `Applies a ${def.label.toLowerCase()} constraint.`, () => runConstraint(id));
  sketchTool("ConstraintFix", "Fix/UnFix", null, "Fixes or unfixes the selected sketch geometry.", () => runFix());
  reg({ id: "SketchFixConstraintCmd", label: "Fix/UnFix", kind: "tool", when: "sketch", enabled: inSketch, run: () => runFix() });
  reg({
    id: "SketchConstructionCmd", label: "Normal/Construction", shortcut: "X", kind: "ui", when: "sketch",
    tooltip: "Toggles the selected curves between normal and construction geometry.",
    enabled: inSketch, checked: () => !!ST.opts.construction,
    run: () => toggleConstruction(),
  });
  reg({
    id: "SketchDeleteCmd", label: "Delete", shortcut: ["Delete", "Backspace"], kind: "ui", when: "sketch",
    enabled: inSketch, run: () => deleteSelection(),
  });
}

export function init(app) {
  initCtx(app);
  if (!app.viewport) { console.warn("sketch module: no viewport"); return; }
  initRender();
  installPick();
  initPalette();
  initEnv();
  initDimension();
  initStatus();
  registerCommands(app);
  app.featureEditors.sketch = (a, id) => enterSketch(id);

  app.on("model", () => rebuild());
  app.on("mode", () => rebuild());
  app.on("selection", () => restyle());
  app.on("hover", () => restyle());
  app.on("camera", () => onCamera());
  app.on("viewport-visibility", () => rebuild());
  app.on("command-start", (d) => {
    const id = d && d.id;
    if (ST.tool) endTool();
    if (planePickActive() && id !== "SketchCreate") cancelPlanePick();
    closeEdit();
  });
  onLocal((type) => {
    if (type === "opts") { rebuild(); applySlice(); }
    if (type === "tool") { if (ST.overlay) ST.overlay.classList.toggle("tool-active", !!ST.tool); updateOverlay(); }
  });

  app.ui.sketch = {
    /** true while a sketch is being edited */
    get active() { return app.mode === "sketch"; },
    get sketchId() { return ST.sketchId; },
    get tool() { return ST.tool ? ST.tool.id : null; },
    get toolObject() { return ST.tool; },
    options: ST.opts,
    create: (then) => startCreateSketch(then || null),
    edit: (id) => enterSketch(id),
    finish: () => finishSketch(),
    deleteSelection: () => deleteSelection(),
    cancelTool: () => endTool(),
    lookAt: () => lookAtSketch(true),
    data: () => activeData(),
  };
  rebuild();
}
