// UNDER ACTIVE DEVELOPMENT by the form engineer: integration engineers, do not edit; stub this module with --only if it breaks a test.
// form module: Fusion's FORM (T-Spline) contextual environment. Create Form enters it and adds a Form feature to
// the timeline; primitives, curve-based creation, Edit Form, the modify / symmetry / utility tools edit T-spline
// bodies (Catmull-Clark control cages with creases, subdivided here); FINISH FORM converts them to B-rep bodies.
// Docs: ./README.md
import "./style.css";
import { registerFormIcons } from "./icons.js";
import { FORM, registerFormFeature, tsplineKind, evalCage } from "./feature.js";
import { createView } from "./view.js";
import { createForm, enterForm, finishForm, watchDoc, deleteSelected, setDisplay, FORM_SHORTCUTS, bust } from "./env.js";
import * as CC from "./cmd-create.js";
import * as CE from "./cmd-edit.js";
import * as CM from "./cmd-modify.js";
import * as CS from "./cmd-sym.js";
import * as CU from "./cmd-util.js";
import * as OPS from "./ops.js";
import * as CAGE from "./cage.js";
import { readTSM, writeTSM } from "./tsm.js";
import { cageToShape } from "./brep.js";
import { isTsRef } from "./cage.js";

export function init(app) {
  registerFormIcons();
  try { registerFormFeature(app.M, app.K, (a, id) => enterForm(a, id)); } catch (e) { console.error("[form]", e); }
  if (!app.viewport || !app.ui.dialog) return;
  const view = createView(app);
  app.registerBodyKind("tspline", tsplineKind(view));
  watchDoc(app);

  const pre = (ctx) => (ctx && ctx.preselect) || app.selection.items.slice();
  const F = (id, label, tooltip, run, extra = {}) => app.commands.register({ id, label, tooltip, kind: "feature", when: "form", run: (a, ctx = {}) => run(a, { ...ctx, preselect: pre(ctx) }), ...extra });

  // ---- environment
  app.commands.register({
    id: "TSplineBaseFeatureCreationCommand", label: "Create Form", kind: "feature",
    tooltip: "Creates a new form feature and enters the Form contextual environment, where you can create and edit T-Spline bodies.",
    enabled: (a) => !FORM.editing && a.mode !== "form",
    run: (a) => createForm(a),
  });
  app.commands.register({
    id: "TSplineBaseFeatureStop", label: "Finish Form", kind: "tool", when: "form",
    tooltip: "Finishes the form feature and leaves the Form environment. The T-Spline bodies become solid or surface bodies.",
    run: (a) => finishForm(a),
  });

  // ---- CREATE
  F("TSplinePrimitiveBoxCommand", "Box", "Creates a T-Spline box.", (a, c) => CC.openPrimitive(a, "box", c));
  F("TSplinePrimitivePlaneCommand", "Plane", "Creates a T-Spline plane.", (a, c) => CC.openPrimitive(a, "plane", c));
  F("TSplinePrimitiveCylinderCommand", "Cylinder", "Creates a T-Spline cylinder.", (a, c) => CC.openPrimitive(a, "cylinder", c));
  F("TSplinePrimitiveSphereCommand", "Sphere", "Creates a T-Spline sphere.", (a, c) => CC.openPrimitive(a, "sphere", c));
  F("TSplinePrimitiveTorusCommand", "Torus", "Creates a T-Spline torus.", (a, c) => CC.openPrimitive(a, "torus", c));
  F("TSplinePrimitiveQuadBallCommand", "Quadball", "Creates a T-Spline quadball.", (a, c) => CC.openPrimitive(a, "quadball", c));
  F("TSplinePrimitivePipe", "Pipe", "Creates a T-Spline pipe along a path.", (a, c) => CC.openPipe(a, c));
  F("TSplineAppendFaceCommand", "Face", "Creates individual T-Spline faces.", (a) => CC.openFace(a));
  F("TSplineExtrudeCommand", "Extrude", "Creates or modifies a T-Spline body by adding faces along a vector.", (a, c) => CC.openExtrude(a, c));
  F("TSplineRevolveCommand", "Revolve", "Creates a T-Spline body by revolving edges or sketch geometry around a selected axis.", (a, c) => CC.openRevolve(a, c));
  F("TSplineSweepCommand", "Sweep", "Creates a T-Spline body by sweeping edges or sketch curves along a selected path.", (a, c) => CC.openSweep(a, c));
  F("TSplineLoft", "Loft", "Creates a T-Spline body that lofts between two or more profiles.", (a, c) => CC.openLoft(a, c));

  // ---- MODIFY
  F("TSplineEditCommand", "Edit Form", "Manipulates faces, edges and vertices with transform, scale and rotate editing.", (a, c) => CE.openEditForm(a, c));
  F("TSplineEditByCurveCmd", "Edit By Curve", "Manipulates T-Spline edges using a driving curve.", (a, c) => CE.openEditByCurve(a, c));
  F("TSplineInsertEdgeCommand", "Insert Edge", "Inserts edges at a specified position from the original edge.", (a, c) => CM.openInsertEdge(a, c));
  F("TSplineSubsetCmd", "Subdivide", "Divides one or more faces into a subset of faces.", (a, c) => CM.openSubdivide(a, c));
  F("TSplineInsertPointCommand", "Insert Point", "Inserts an edge by selecting two points.", (a) => CM.openInsertPoint(a));
  F("TSplineMergeEdgeCmd", "Merge Edge", "Aligns the first set of selected edges to a second set of selected edges.", (a) => CM.openMergeEdge(a));
  F("TSplineBridgeSubDCmd", "Bridge", "Creates segments to connect two opposing faces within a body or between two bodies.", (a) => CM.openBridge(a));
  F("TSplineFillHoleCmd", "Fill Hole", "Fills an internal hole in T-Spline body.", (a, c) => CM.openFillHole(a, c));
  F("TSplineEraseAndFillCmd", "Erase And Fill", "Deletes a part of connected T-Spline geometry and fills new gaps with faces.", (a, c) => CM.openEraseAndFill(a, c));
  F("TSplineWeldCommand", "Weld Vertices", "Joins two or more vertices.", (a, c) => CM.openWeld(a, c));
  F("TSplineUnWeldCommand", "UnWeld Edges", "Disconnects an edge or loop.", (a, c) => CM.openUnweld(a, c));
  F("TSplineCreasedEdgeCommand", "Crease", "Creates a sharp edge between faces.", (a, c) => CM.openCrease(a, true, c));
  F("TSplineUnCreaseEdgeCmd", "UnCrease", "Restores previously creased edges to their original state.", (a, c) => CM.openCrease(a, false, c));
  F("TSplineBevelEdgeCommand", "Bevel Edge", "Creates a bevel on a T-spline body along selected edges.", (a, c) => CM.openBevel(a, c));
  F("TSplineSlideEdgeCommand", "Slide Edge", "Moves the selected edge along the control polygon.", (a, c) => CM.openSlide(a, c));
  F("TSplineSmoothCmd", "Smooth", "Smoothes an area of the T-Spline geometry.", (a, c) => CM.openSmooth(a, c));
  F("TSplineCylindrifyCmd", "Cylindrify", "Forms uneven T-Spline geometry into a smooth cylindrical shape.", (a, c) => CM.openCylindrify(a, c));
  F("TSplinePullSubDCmd", "Pull", "Snaps selected T-Spline vertices to a face or surface.", (a, c) => CM.openPull(a, c));
  F("TSplineFlattenSubDCmd", "Flatten", "Projects vertices to a best fit or user defined plane.", (a, c) => CM.openFlatten(a, c));
  F("TSplineStraightenCmd", "Straighten", "Straightens vertices to a best fit line, an existing line, or a line through two selected points.", (a, c) => CM.openStraighten(a, c));
  F("TSplineMatchCmd", "Match", "Matches T-Spline edges to target edges, curves or faces.", (a, c) => CM.openMatch(a, c));
  F("TSplineInterpolateSubDCmd", "Interpolate", "Switches the location of the surface and the control points to improve fitting.", (a, c) => CM.openInterpolate(a, c));
  F("TSplineThickenCommand", "Thicken", "Creates a body offset.", (a, c) => CM.openThicken(a, c));
  F("TSplineFreezeCmd", "Freeze", "Freezes faces and edges on the model to prevent accidental changes.", (a, c) => CM.openFreeze(a, true, c));
  F("TSplineUnFreezeCmd", "UnFreeze", "Unfreezes faces and edges that have previously been frozen.", (a, c) => CM.openFreeze(a, false, c));

  // ---- SYMMETRY
  F("TSplineInternalMirrorSymmetryCmd", "Mirror - Internal", "Creates a mirror symmetry with the elements of a T-Spline body.", (a) => CS.openMirrorInternal(a));
  F("TSplineInternalCircularSymmetryCmd", "Circular - Internal", "Creates circular symmetry with the elements of a T-Spline body.", (a) => CS.openCircularInternal(a));
  F("TSplineReflectionMirrorSymmetryCmd", "Mirror - Duplicate", "Create a duplicate body mirrored across a specified plane.", (a, c) => CS.openMirrorDuplicate(a, c));
  F("TSplineReflectionCircularSymmetryCmd", "Circular - Duplicate", "Create specified number of duplicate bodies around a selected axis.", (a, c) => CS.openCircularDuplicate(a, c));
  F("TSplineClearSymmetryCommand", "Clear Symmetry", "Remove symmetry constraint from individual bodies or a series of bodies.", (a, c) => CS.openClearSymmetry(a, c));
  F("TSplineIsolateSymmetryCmd", "Isolate Symmetry", "Prevents symmetric transformations from being applied to the selected vertex, edge or face.", (a, c) => CS.openIsolateSymmetry(a, c));

  // ---- UTILITIES
  F("TSplineToggleTessModeCmd", "Display Mode", "Sets the body display to smooth, box, or control frame.", (a, c) => CU.openDisplayMode(a, c));
  F("TSplineRepairBodyCmd", "Repair Body", "Analyzes the T-Spline body and displays information about the mesh.", (a, c) => CU.openRepair(a, c));
  F("TSplineMakeUniformCmd", "Make Uniform", "Evenly distributes the angles at the intersection of star points and makes faces as uniform as possible.", (a, c) => CU.openMakeUniform(a, c));
  app.commands.register({
    id: "TSplineCapSettingCommand", label: "Enable Better Performance", kind: "ui", when: "form",
    tooltip: "Toggles between better performance or better display. Better display shows the bodies at highest quality.",
    checked: () => !!FORM.perf, run: (a) => CU.toggleBetterPerformance(a),
  });
  // Convert works in the FORM environment and on the SOLID tab (no `when`)
  app.commands.register({ id: "TSpline2BRepCommand", label: "Convert", kind: "feature", tooltip: "Changes the body type of the selected object: T-Spline to BRep, BRep or mesh to T-Spline.", run: (a, c = {}) => CU.openConvert(a, { preselect: pre(c) }) });
  app.commands.register({ id: "TSplineImportCommand", label: "Insert T-Spline", kind: "feature", tooltip: "Inserts a T-Spline Mesh (TSM) file as a T-Spline body.", run: (a) => CU.insertTSpline(a) });
  app.commands.register({ id: "TSplineSaveAsTSMCommand", label: "Save *.tsm file", kind: "ui", hidden: true, tooltip: "Saves the selected T-Spline body as a TSM file.", run: (a) => CU.saveTSM(a) });

  // ---- keys: Delete removes T-spline elements, Alt+1/2/3 display modes
  app.commands.register({
    id: "TSplineDeleteSelection", label: "Delete", kind: "ui", hidden: true, when: "form", shortcut: ["Delete", "Backspace"],
    run: (a) => { if (!deleteSelected(a) && a.selection.items.length) { const d = a.commands.get("FusionDeleteCommand"); if (d && !d.stub) a.commands.run("FusionDeleteCommand"); } },
  });
  const disp = (id, label, mode, key) => app.commands.register({ id, label, kind: "ui", hidden: true, when: "form", shortcut: key, run: (a) => { const ids = [...new Set(a.selection.items.filter((r) => r.body).map((r) => r.body))]; setDisplay(a, mode, ids.length ? ids : null); } });
  disp("TSplineBoxDisplayCmd", "Box Display", "box", "Alt+1");
  disp("TSplineControlFrameDisplayCmd", "Control Frame Display", "frame", "Alt+2");
  disp("TSplineSmoothDisplayCmd", "Smooth Display", "smooth", "Alt+3");

  // In the FORM tab, MODIFY > Delete and Move/Copy act on T-spline geometry (wrapped once all modules are up)
  app.on("ready", () => {
    const del = app.commands.get("FusionDeleteCommand");
    if (del && !del.stub && !del._formWrapped) {
      const orig = del.run;
      del.run = (a, ctx) => (a.mode === "form" && a.selection.items.some((r) => isTsRef(r) || (r.kind === "body" && CAGE && FORM.editing && (a.feature(FORM.editing).bodies || []).some((c) => c.id === r.body))) && deleteSelected(a) ? undefined : orig(a, ctx));
      del._formWrapped = true;
    }
    const mv = app.commands.get("FusionMoveCommand");
    if (mv && !mv.stub && !mv._formWrapped) {
      const orig = mv.run;
      mv.run = (a, ctx = {}) => {
        const ts = a.selection.items.filter((r) => isTsRef(r) || (r.kind === "body" && FORM.editing && (a.feature(FORM.editing).bodies || []).some((c) => c.id === r.body)));
        if (a.mode === "form" && ts.length) return CE.openEditForm(a, { preselect: ts });
        return orig(a, ctx);
      };
      mv._formWrapped = true;
    }
  });

  // public API (tests, other modules)
  app.ui.form = {
    state: FORM, shortcuts: FORM_SHORTCUTS, createForm: () => createForm(app), enter: (id) => enterForm(app, id), finish: () => finishForm(app),
    setDisplay: (mode, ids) => setDisplay(app, mode, ids), evalCage, cageToShape: (c) => cageToShape(app.K, c), bust: (id) => bust(app, id),
    insertTSplineText: (text, name) => CU.insertTSplineText(app, text, name), readTSM, writeTSM, ops: OPS, cage: CAGE,
    cageFromShape: (shape) => CU.cageFromShape(app, shape),
  };
}
