// mesh module: the MESH tab. Mesh body editing (ParaMesh tools) as timeline features, face groups, the Mesh
// Palette, Create Mesh Section Sketch / Fit Curves to Mesh Section, Tessellate / Convert Mesh, Display Mesh Face
// Groups and the DIRECT MESH EDITING environment (Base Mesh Feature). See README.md.
import "./style.css";
import { registerMeshFeatures } from "./features.js";
import { openMeshCommand, meshCommandIds, commandOfType } from "./commands.js";
import { initPalette, setVisible, PAL } from "./palette.js";
import { meshRender, setGroupsDisplay, DISPLAY } from "./display.js";
import { initDirect, enterDirect } from "./direct.js";
import { openSectionSketch, openFitCurves } from "./section.js";
import { analyze, fromMesh } from "./algo.js";

export function init(app) {
  try {
    // feature types (timeline / Edit Feature)
    registerMeshFeatures((type) => {
      if (type === "meshBase") return (a, id) => enterDirect(a, id);
      return (a, id) => { const c = commandOfType(type); if (c) openMeshCommand(a, c.id, { editId: id }); };
    });
    // mesh body display: quad edges, face group colours
    app.registerBodyKind("mesh", { render: meshRender });
    // dialog commands
    for (const id of meshCommandIds()) {
      app.commands.register({ id, label: labelOf(id), tooltip: tipOf(id), kind: "feature", run: (a, ctx = {}) => openMeshCommand(a, id, ctx) });
    }
    app.commands.register({ id: "ParaMeshPlanarSectionCommand", label: "Create Mesh Section Sketch", tooltip: "Creates a sketch that contains a section line where a plane intersects a mesh body.", kind: "feature", run: (a, ctx = {}) => openSectionSketch(a, ctx) });
    app.commands.register({ id: "FitCurvesToSectionCommand", label: "Fit Curves to Mesh Section", tooltip: "Fits lines, arcs, circles or splines to a mesh section in the active sketch.", kind: "tool", when: "sketch", run: (a) => openFitCurves(a) });
    app.commands.register({
      id: "ParaMeshShowSelectionPanelCmd", label: "Mesh Palette", tooltip: "Shows the Mesh Selection Palette: selection filter (mesh bodies, face groups, mesh faces), brush size and Modify Selection tools.",
      kind: "ui", checked: () => PAL.visible, run: () => setVisible(!PAL.visible),
    });
    app.commands.register({
      id: "FacegroupsToggleCmd", label: "Display Mesh Face Groups", shortcut: "Shift+F", kind: "view",
      tooltip: "Display face groups on mesh bodies to make them easier to work with. Hides component colors, physical materials and appearances.\n\nPress Shift+F to show or hide mesh face groups",
      checked: () => DISPLAY.groups, run: (a) => { setGroupsDisplay(a, !DISPLAY.groups); a.emit("commands", { id: "FacegroupsToggleCmd" }); },
    });
    initDirect(app);
    initPalette(app);
    app.ui.mesh = {
      open: (id, opts) => openMeshCommand(app, id, opts), palette: PAL, display: DISPLAY, enterDirect: (id) => enterDirect(app, id),
      /** Fusion's mesh analysis of a mesh body: {closed, oriented, positive, volume, shells, openEdges, nonManifold, holes, ...}. */
      analyze: (id) => { const e = app.result && app.result.state.meshBodies.get(id); return e && e.mesh ? analyze(fromMesh(e.mesh)) : null; },
    };
  } catch (e) {
    console.warn("[mesh] init failed", e);
  }
}

const LABELS = {
  ParaMeshRepairCommand: "Repair", ParaMeshCalculateFaceGroupsCommand: "Generate Face Groups", ParaMeshMergeFaceGroupsCommand: "Combine Face Groups",
  ParaMeshCreateFaceGroupCommand: "Create Face Group", ParaMeshRemeshCommand: "Remesh", ParaMeshReduceCommand: "Reduce", ParaMeshPlaneCutCommand: "Plane Cut",
  ParaMeshHollowCommand: "Shell", ParaMeshCombineCommand: "Combine", ParaMeshSmoothCommand: "Smooth", ParaMeshSmoothBoundaryCommand: "Smooth Boundary",
  ParaMeshReverseNormalsCommand: "Reverse Normal", ParaMeshCloseCracksCommand: "Close Cracks", ParaMeshEraseAndFillCommand: "Erase And Fill",
  ParaMeshBridgeCommand: "Bridge", ParaMeshAlignCommand: "Mesh Align", ParaMeshAttractToReferenceCommand: "Attract to Reference", ParaMeshTextureCommand: "Texture Extrude",
  ParaMeshScaleCommand: "Scale Mesh", ParaMeshRemoveCommand: "Remove", ParaMeshExtractCommand: "Separate", ParaMeshTessellateCommand: "Tessellate",
  ParaMeshConvertCommand: "Convert Mesh", ParaMeshToQuadMeshCommand: "Convert To Quad Mesh",
};
// tooltips: the commands' descriptions in Fusion's string table
const TIPS = {
  ParaMeshRepairCommand: "Repairs a mesh body to prepare it for further design and manufacturing operations.",
  ParaMeshCalculateFaceGroupsCommand: "Automatically generates face groups on a mesh body using the normal angles between faces to determine the boundaries of each face group.",
  ParaMeshMergeFaceGroupsCommand: "Combines two or more adjacent face groups on a mesh body.",
  ParaMeshCreateFaceGroupCommand: "Creates a face group from a selection of faces on a mesh body.",
  ParaMeshRemeshCommand: "Refines or coarsens faces on a mesh body or face groups.",
  ParaMeshReduceCommand: "Reduces the number of faces on a mesh body to minimize complexity.",
  ParaMeshPlaneCutCommand: "Uses a plane to trim or split a mesh body.",
  ParaMeshHollowCommand: "Hollows the interior of a mesh body.",
  ParaMeshCombineCommand: "Joins, intersects, cuts, or merges two or more mesh bodies to create a single mesh body.",
  ParaMeshSmoothCommand: "Smooths rough or creased regions on a mesh body.",
  ParaMeshSmoothBoundaryCommand: "Smooths the boundary edges of a mesh body.",
  ParaMeshReverseNormalsCommand: "Reverses the normal direction of selected faces on a mesh body.",
  ParaMeshCloseCracksCommand: "Closes small cracks and gaps in a mesh body.",
  ParaMeshEraseAndFillCommand: "Removes and replaces faces on a mesh body to fill holes and repair regions.",
  ParaMeshBridgeCommand: "Bridges two regions of a mesh body by creating connecting geometry between them.",
  ParaMeshAlignCommand: "Aligns a face on a mesh body to a plane with one transformation.",
  ParaMeshAttractToReferenceCommand: "Attracts selected faces on a mesh body towards a reference mesh body.",
  ParaMeshTextureCommand: "Uses an image to add surface texture to a mesh body.",
  ParaMeshScaleCommand: "Scales mesh bodies from a reference point.",
  ParaMeshRemoveCommand: "Removes mesh bodies from the design.",
  ParaMeshExtractCommand: "Separates regions of a mesh body into independent mesh bodies.",
  ParaMeshTessellateCommand: "Converts an existing solid or surface body into a mesh body.",
  ParaMeshConvertCommand: "Converts a mesh body to a solid or surface body.",
  ParaMeshToQuadMeshCommand: "Converts a mesh body or face groups with triangular faces to a mesh body or face groups with quad faces.",
};
const labelOf = (id) => LABELS[id] || id;
const tipOf = (id) => TIPS[id] || "";
