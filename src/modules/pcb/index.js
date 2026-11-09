// pcb module: Create 3D PCB, Derive PCB from Sketch, Create Linked PCB and the PCB contextual environment (see README.md).
//   feature.js   timeline type 'pcb' (a component with a board body)
//   env.js       the PCB environment (PCBTab) and the one-step creation of a PCB component
//   dialogs.js   command dialogs
//   icons.js     original icons of the environment commands
import * as M from "../../model.js";
import { beginModelCommand } from "../dialogs/common.js";
import { TYPE, PCB_FEATURE, pcbFeatureOfOcc } from "./feature.js";
import { ENV, BOARD_APPEARANCE, pcbEnv, activePcb, enterPcb, finishPcb } from "./env.js";
import { TIPS, openPcbDialog, editPcb, openLinkedPcb, openMoveComponents, openFlipComponent, openPcbStatus, openImprint } from "./dialogs.js";
import { registerPcbIcons } from "./icons.js";

/** The sketch that defines the board outline of a pcb feature (Linked PCB sketch, else the first profile sketch), or null. */
export function boardSketchOf(app, f) {
  if (!f) return null;
  const ids = [f.boardSketch, ...(f.profiles || []).map((p) => p.sketch)].filter(Boolean);
  for (const id of ids) { const s = app.feature(id); if (s && s.type === "sketch") return s.id; }
  return null;
}

function editBoardSketch(app) {
  const f = activePcb(app);
  const sid = boardSketchOf(app, f);
  if (!sid) { app.toast("This PCB has no board outline sketch", "warning"); return false; }
  if (app.activeCommand) { try { app.activeCommand.cancel(); } catch { /* ignore */ } }
  if (app.ui.sketch && typeof app.ui.sketch.edit === "function") return app.ui.sketch.edit(sid);
  return app.editFeature(sid);
}

export function init(app) {
  try {
    if (!M.isFeatureType(TYPE)) M.registerFeature(TYPE, { ...PCB_FEATURE, editor: (a, id) => { beginModelCommand(a); return editPcb(a, id); } });
  } catch (e) { console.warn("[pcb] feature type", e); }
  try { registerPcbIcons(); } catch (e) { console.warn("[pcb] icons", e); }
  try {
    if (app.appearances && !app.appearances[BOARD_APPEARANCE]) app.appearances[BOARD_APPEARANCE] = { name: "PCB Green (FR-4)", color: "#1f6e3d", metalness: 0, roughness: 0.62 };
  } catch (e) { console.warn("[pcb] appearance", e); }

  const ready = () => !!(app.ui && app.ui.dialog && typeof app.ui.dialog.open === "function");
  const dialog = (fn) => (a, ctx = {}) => {
    const pre = beginModelCommand(a);
    if (!ready()) { a.toast("The command dialogs are not available in this build", "warning"); return null; }
    return fn(a, { preselect: ctx.preselect || pre, editId: ctx.editId });
  };
  const inPcb = (a) => !!activePcb(a);
  const defs = [
    { id: "PCBCreateCmd", label: "Create 3D PCB", kind: "feature", run: dialog((a, o) => openPcbDialog(a, "create", o)) },
    { id: "PCBDeriveCmd", label: "Derive PCB from Sketch", kind: "feature", run: dialog((a, o) => openPcbDialog(a, "derive", o)) },
    { id: "PCBExternalComponentCreationCmd", label: "Create Linked PCB", kind: "feature", run: dialog((a, o) => openLinkedPcb(a, o)) },
    { id: "PCBDefineBoardCmd", label: "Define Board", kind: "feature", when: ENV, enabled: inPcb, run: dialog((a, o) => openPcbDialog(a, "define", { preselect: o.preselect })) },
    { id: "PCBImprintCmd", label: "Imprint", kind: "feature", when: ENV, enabled: inPcb, run: dialog((a) => openImprint(a)) },
    { id: "PCBBoardSketchEditCmd", label: "Edit Board Sketch", kind: "tool", when: ENV, enabled: (a) => !!boardSketchOf(a, activePcb(a)), run: (a) => editBoardSketch(a) },
    { id: "PCBMoveComponentsCmd", label: "Move Components", kind: "feature", when: ENV, enabled: inPcb, run: dialog((a) => openMoveComponents(a)) },
    { id: "PCBFlipComponentCmd", label: "Flip Component", kind: "feature", when: ENV, enabled: inPcb, run: dialog((a) => openFlipComponent(a)) },
    { id: "PCBStatusCmd", label: "PCB Status", kind: "tool", when: ENV, enabled: inPcb, run: dialog((a) => openPcbStatus(a)) },
    { id: "PCBStop", label: "Finish PCB", kind: "ui", when: ENV, run: (a) => finishPcb(a) },
  ];
  for (const d of defs) {
    try { app.commands.register({ tooltip: TIPS[d.id], icon: d.id, ...d }); } catch (e) { console.warn(`[pcb] ${d.id}`, e); }
  }

  // Activating a PCB component enters the PCB environment (Fusion: Edit on the PCB); activating a
  // component outside the running PCB leaves it. Undo of the PCB leaves it too.
  try {
    app.on("components", (e) => {
      if (!e || e.action !== "activate") return;
      try {
        const C = app.components;
        const env = pcbEnv(app);
        const f = pcbFeatureOfOcc(app, C.active);
        if (!env && f && f.newOcc === C.active) enterPcb(app, f.id);
        else if (env && (!f || f.id !== env.feature)) {
          if (f && f.newOcc === C.active) enterPcb(app, f.id, { prevActive: env.prevActive });
          else app.exitEnvironment(ENV, { reason: "exit" });
        }
      } catch (err) { console.warn("[pcb] activate", err); }
    });
    app.on("doc", () => {
      const env = pcbEnv(app);
      if (env && !activePcb(app)) { try { app.exitEnvironment(ENV, { reason: "exit" }); } catch (err) { console.warn("[pcb] exit", err); } }
    });
  } catch (e) { console.warn("[pcb] events", e); }

  app.ui.pcb = {
    env: () => pcbEnv(app), active: () => activePcb(app), enter: (id) => enterPcb(app, id), finish: () => finishPcb(app),
    boardSketch: (id) => boardSketchOf(app, app.feature(id)),
  };
}
