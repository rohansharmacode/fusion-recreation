// surface module: SURFACE tab: surface bodies and surface create / modify tools (Fusion command ids).
// Feature types: features.js (registerFeature), geometry: occ.js, dialogs: dlg-create.js / dlg-modify.js.
import "./style.css";
import { beginModelCommand } from "../dialogs/common.js";
import { registerSurfaceFeatures } from "./features.js";
import * as C from "./dlg-create.js";
import * as Mo from "./dlg-modify.js";
import { registerSurfacePrimitives } from "./primitives.js";

/** Command id -> [label, tooltip, open(app, opts), feature type (Edit Feature) | null]. */
const COMMANDS = {
  SurfaceExtrude: ["Extrude", "Extrudes profiles or sketch curves into surfaces.", C.openSurfExtrude, "surfExtrude"],
  SurfaceRevolve: ["Revolve", "Revolves a sketch profile or planar face around a selected axis.", C.openSurfRevolve, "surfRevolve"],
  SurfaceSweep: ["Sweep", "Sweeps a sketch profile or planar face along a selected path.", C.openSurfSweep, "surfSweep"],
  SurfaceLoft: ["Loft", "Lofts a surface between two or more profiles, sketch curves or edges.", C.openSurfLoft, "surfLoft"],
  FusionSurfacePatchCommand: ["Patch", "Creates a planar or 3D surface within the boundary of a specified closed loop.", C.openPatch, "surfPatch"],
  FusionSurfaceRuledCommand: ["Ruled", "Creates a ruled surface at a specified distance and angle from selected edges.", C.openRuled, "surfRuled"],
  FusionSurfaceOffsetCommand: ["Offset", "Creates a new surface body at a given distance from the selected face or surface body.", C.openSurfOffset, "surfOffset"],
  FusionSurfaceThickenCommand: ["Thicken", "Adds thickness to surface faces to create a solid body.", C.openThicken, "surfThicken"],
  SurfaceSculpt: ["Boundary Fill", "Creates, joins or removes volumes using bounding volumes formed by tool selections.", C.openBoundaryFill, "surfBoundaryFill"],
  FusionExtendCommand: ["Extend", "Enlarges a surface by extending its edges a specified distance.", Mo.openExtend, "surfExtend"],
  FusionSurfaceTrimCommand: ["Trim", "Removes the selected area of a surface body using the specified cutting tool.", Mo.openTrim, "surfTrim"],
  FusionSurfaceUntrimCommand: ["Untrim", "Extends trimmed surfaces and fills gaps, holes, or empty regions.", Mo.openUntrim, "surfUntrim"],
  FusionSurfaceStitchCommand: ["Stitch", "Joins surfaces to make a single surface body or solid body.", Mo.openStitch, "surfStitch"],
  FusionSurfaceUnStitchCommand: ["Unstitch", "Breaks joined surfaces into individual surfaces.", Mo.openUnstitch, "surfUnstitch"],
  FusionSurfaceMergeCommand: ["Merge", "Combines the selected faces into a single face.", Mo.openMerge, "surfMerge"],
  FusionSurfaceReverseNormalCommand: ["Reverse Normal", "Flips the positive direction of all faces on a selected surface body.", Mo.openReverseNormal, "surfReverse"],
  FusionSurfaceValidateCommand: ["Validate", "Checks the quality of selected surfaces and attempts to heal surfaces before stitching into quilts and solids.", Mo.openValidate, "surfValidate"],
  FusionPartingLineSplitCmd: ["Silhouette Split", "Splits a body using surfaces generated from its silhouette curves.", Mo.openSilhouetteSplit, "surfSilhouette"],
};

export function init(app) {
  const ready = () => !!(app.ui && app.ui.dialog && typeof app.ui.dialog.open === "function");
  const open = (fn, opts) => {
    if (!ready()) { app.toast("The command dialogs are not available in this build", "warning"); return null; }
    return fn(app, opts);
  };
  const editors = {};
  for (const [, , fn, type] of Object.values(COMMANDS)) {
    if (!type) continue;
    editors[type] = (a, fid) => { beginModelCommand(a); return open(fn, { editId: fid }); };
  }
  try { registerSurfaceFeatures(editors); } catch (e) { console.error(e); }
  try { registerSurfacePrimitives(app); } catch (e) { console.warn("[surface] primitives", e); }
  for (const [id, [label, tooltip, fn]] of Object.entries(COMMANDS)) {
    try {
      app.commands.register({
        id, label, tooltip, kind: "feature",
        run: (a, ctx = {}) => { const pre = beginModelCommand(a); return open(fn, { preselect: ctx.preselect || pre }); },
      });
    } catch (e) { console.error(e); }
  }
}
