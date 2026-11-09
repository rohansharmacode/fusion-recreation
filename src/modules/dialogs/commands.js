// Registers the modelling commands (Fusion command ids) and the Edit Feature entry points.
import { beginModelCommand } from "./common.js";
import { openExtrude, openRevolve, runPressPull, openPressPullFace } from "./cmd-extrude.js";
import { openFillet, openChamfer, openShell, openDraft, openCombine, openMove, runDelete } from "./cmd-modify.js";
import { openHole } from "./cmd-hole.js";
import { openPrimitive, openMirror, openRectPattern, openCircPattern, openLoft, openSweep } from "./cmd-create.js";
import { openOffsetPlane, openPlaneAtAngle, openMidplane } from "./cmd-construct.js";

const wrap = (open) => (app, ctx = {}) => {
  const pre = beginModelCommand(app);
  return open(app, { preselect: ctx.preselect || pre });
};

export function registerCommands(app) {
  const C = (def) => app.commands.register({ kind: "feature", ...def });

  C({ id: "Extrude", label: "Extrude", shortcut: "E", tooltip: "Adds depth to open or closed sketch profiles or faces.", run: wrap(openExtrude) });
  C({ id: "Revolve", label: "Revolve", tooltip: "Revolves a sketch profile or planar face around a selected axis.", run: wrap(openRevolve) });
  C({ id: "Sweep", label: "Sweep", tooltip: "Sweeps a sketch profile along a selected path.", run: wrap(openSweep) });
  C({ id: "SolidLoft", label: "Loft", tooltip: "Creates a transition shape between two or more sketch profiles.", run: wrap(openLoft) });
  C({ id: "FusionHoleCommand", label: "Hole", shortcut: "H", tooltip: "Creates a hole based on user-specified values and selections.", run: wrap(openHole) });
  C({ id: "PrimitiveBox", label: "Box", tooltip: "Creates a box (rectangular solid body).", run: wrap((a, o) => openPrimitive(a, "box", o)) });
  C({ id: "PrimitiveCylinder", label: "Cylinder", tooltip: "Creates a cylindrical solid body.", run: wrap((a, o) => openPrimitive(a, "cylinder", o)) });
  C({ id: "PrimitiveSphere", label: "Sphere", tooltip: "Creates a spherical solid body.", run: wrap((a, o) => openPrimitive(a, "sphere", o)) });
  C({ id: "PrimitiveTorus", label: "Torus", tooltip: "Creates a torus (donut shaped solid body).", run: wrap((a, o) => openPrimitive(a, "torus", o)) });
  C({ id: "PatternRectangular", label: "Rectangular Pattern", tooltip: "Duplicates bodies and distributes them along linear axes in rows and columns.", run: wrap(openRectPattern) });
  C({ id: "PatternCircular", label: "Circular Pattern", tooltip: "Duplicates bodies and distributes them around an axis.", run: wrap(openCircPattern) });
  C({ id: "MirrorCommand", label: "Mirror", tooltip: "Creates a copy of selected bodies, mirrored across a plane.", run: wrap(openMirror) });

  C({ id: "FusionPressPullCommand", label: "Press Pull", shortcut: "Q", tooltip: "Modifies the selected geometry using offset, extrude, or fillet commands. The operation depends on the geometry selected.", run: (a) => runPressPull(a) });
  C({ id: "FusionFilletEdgesCommand", label: "Fillet", shortcut: "F", tooltip: "Rounds the edges of a solid body.", run: wrap(openFillet) });
  C({ id: "FusionChamferCommand", label: "Chamfer", tooltip: "Bevels the edges of a solid body.", run: wrap(openChamfer) });
  C({ id: "FusionShellBodyCommand", label: "Shell", tooltip: "Hollows a solid body, leaving walls of the specified thickness.", run: wrap(openShell) });
  C({ id: "FusionDraftCommand", label: "Draft", tooltip: "Applies a fixed draft angle to planar faces.", run: wrap(openDraft) });
  C({ id: "FusionCombineCommand", label: "Combine", tooltip: "Joins, cuts, or intersects two or more solid bodies to create a single solid body.", run: wrap(openCombine) });
  C({ id: "FusionMoveCommand", label: "Move/Copy", shortcut: "M", tooltip: "Moves the selected bodies a specified distance or angle.", run: wrap(openMove) });
  C({ id: "FusionDeleteCommand", label: "Delete", shortcut: "Delete", when: "model", tooltip: "Deletes the selected objects.", run: (a) => runDelete(a) });

  C({ id: "ConstructionPlaneOffsetFromPlaneCommand", label: "Offset Plane", tooltip: "Creates a Construction Plane that is offset from the selected face or plane.", run: wrap(openOffsetPlane) });
  C({ id: "WorkPlaneOffsetFromPlaneCommand", label: "Offset Plane", tooltip: "Creates a Construction Plane that is offset from the selected face or plane.", icon: "ConstructionPlaneOffsetFromPlaneCommand", run: wrap(openOffsetPlane) });
  C({ id: "ConstructionPlaneAtAngleCommand", label: "Plane at Angle", tooltip: "Creates a Construction Plane through an edge, axis, or line at a specific angle.", run: wrap(openPlaneAtAngle) });
  C({ id: "ConstructionMidPlaneCommand", label: "Midplane", tooltip: "Creates a Construction Plane at the midpoint between two faces or planes.", run: wrap(openMidplane) });

  // ---- Edit Feature (timeline / browser) ----
  const E = app.featureEditors;
  const edit = (open) => (a, id) => { beginModelCommand(a); return open(a, { editId: id }); };
  E.extrude = (a, id) => { beginModelCommand(a); const f = a.feature(id); return f && f.pressPull ? openPressPullFace(a, { editId: id }) : openExtrude(a, { editId: id }); };
  E.revolve = edit(openRevolve);
  E.fillet = edit(openFillet);
  E.chamfer = edit(openChamfer);
  E.shell = edit(openShell);
  E.draft = edit(openDraft);
  E.hole = edit(openHole);
  E.combine = edit(openCombine);
  E.move = edit(openMove);
  E.mirror = edit(openMirror);
  E.rpattern = edit(openRectPattern);
  E.cpattern = edit(openCircPattern);
  E.loft = edit(openLoft);
  E.sweep = edit(openSweep);
  for (const t of ["box", "cylinder", "sphere", "torus"]) E[t] = (a, id) => { beginModelCommand(a); return openPrimitive(a, t, { editId: id }); };
  E.cplane = (a, id) => {
    beginModelCommand(a);
    const f = a.feature(id);
    if (f && f.mode === "angle") return openPlaneAtAngle(a, { editId: id });
    if (f && f.mode === "midplane") return openMidplane(a, { editId: id });
    return openOffsetPlane(a, { editId: id });
  };
}
