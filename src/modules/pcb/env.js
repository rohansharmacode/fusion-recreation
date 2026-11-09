// The PCB contextual environment (Fusion: "PCB Mechanical Environment", toolbar tab PCBTab) and the
// one-step creation of a pcb feature together with its component.
import * as M from "../../model.js";
import { prepareFeature, clone } from "../../app/core.js";
import { TYPE, hasOutline } from "./feature.js";

export const ENV = "pcb";
export const BOARD_APPEARANCE = "pcb-green";

/** The running PCB environment, or null. */
export const pcbEnv = (app) => (app.environments || []).find((e) => e.id === ENV) || null;

/** The pcb feature that the running environment edits, or null. */
export function activePcb(app) {
  const env = pcbEnv(app);
  const f = env ? app.feature(env.feature) : null;
  return f && f.type === TYPE ? f : null;
}

/**
 * Enters the PCB environment for a pcb feature and activates its component.
 * opts.prevActive: the occurrence to activate again on Finish PCB (default: the one active now).
 */
export function enterPcb(app, featureId, opts = {}) {
  const f = app.feature(featureId);
  if (!f || f.type !== TYPE) return null;
  const C = app.components;
  const cur = pcbEnv(app);
  let prevActive = opts.prevActive !== undefined ? opts.prevActive : cur ? cur.prevActive : C ? C.active : null;
  if (!prevActive || prevActive === f.newOcc) prevActive = C ? C.ROOT : null;
  if (!cur || cur.feature !== featureId) {
    app.enterEnvironment({
      id: ENV, mode: ENV, label: "PCB", tab: "PCBTab", finishCommand: "PCBStop", finishLabel: "Finish PCB",
      feature: featureId, prevActive,
      onExit(reason, e) {
        // undo, a new document and a replaced environment leave the active component alone
        if (reason !== "finish" && reason !== "cancel") return;
        const comps = app.components;
        if (!comps) return;
        try {
          const back = e.prevActive && comps.alive(e.prevActive) ? e.prevActive : comps.ROOT;
          if (comps.active !== back) comps.activate(back);
        } catch (err) { console.error("[pcb] could not restore the active component", err); }
      },
    });
    if (!opts.quiet) { try { app.toast("You have entered into the PCB Mechanical Environment.", "info", 2600); } catch { /* ignore */ } }
  }
  try {
    if (C && f.newOcc && C.alive(f.newOcc) && C.active !== f.newOcc) C.activate(f.newOcc);
  } catch (err) { console.error("[pcb] could not activate the PCB component", err); }
  return pcbEnv(app);
}

/** Finish PCB: ends a running command and sketch, leaves the environment, activates the previous component. */
export function finishPcb(app) {
  if (!pcbEnv(app)) return false;
  if (app.activeCommand) { try { app.activeCommand.cancel(); } catch { /* ignore */ } }
  if (app.mode === "sketch") {
    const s = app.commands.get("SketchStop");
    try { if (s && !s.stub) s.run(app, { fromCommand: true }); } catch { /* ignore */ }
  }
  return app.exitEnvironment(ENV, { reason: "finish" });
}

/** "PCB", "PCB (1)", "PCB (2)": a component name that is not used yet. */
export function uniqueCompName(doc, base) {
  const names = new Set(Object.values(doc.components || {}).map((c) => c.name));
  if (!names.has(base)) return base;
  let k = 1;
  while (names.has(`${base} (${k})`)) k++;
  return `${base} (${k})`;
}

/** Hides the sketches of the board profiles (like every profile feature does), when they lie before the feature. */
export function hideProfileSketches(doc, nf) {
  const at = doc.features.indexOf(nf);
  for (const sid of new Set((nf.profiles || []).map((p) => p.sketch))) {
    const s = doc.features.find((x) => x.id === sid);
    if (s && s.type === "sketch" && doc.features.indexOf(s) < at) s.visible = false;
  }
}

/**
 * Adds a new pcb feature with its component in ONE undo step and makes the PCB the active component.
 * Returns {id, prevActive}. A PCB that is created inside the PCB environment becomes a sibling of the
 * running PCB, not a child.
 */
export function commitNewPcb(app, f, label, opts = {}) {
  const C = app.components;
  const env = pcbEnv(app);
  const prevActive = env ? env.prevActive : C ? C.active : null;
  const id = app.mutate(label, (doc) => {
    const nf = clone(f);
    delete nf.id;
    if (env) nf.occ = prevActive && prevActive !== M.ROOT && doc.occurrences && doc.occurrences[prevActive] ? prevActive : null;
    const c = M.newComponentMeta(doc, { name: uniqueCompName(doc, opts.name || "PCB") });
    nf.operation = "newComponent";
    nf.newComp = c.comp;
    nf.newOcc = c.occ;
    if (hasOutline(nf)) nf.newBody = M.nextBody(doc, { name: "Board", appearance: BOARD_APPEARANCE });
    prepareFeature(doc, nf);
    doc.features.splice(doc.marker, 0, nf);
    doc.marker += 1;
    hideProfileSketches(doc, nf);
    doc.activeOcc = nf.newOcc;
    return nf.id;
  });
  return { id, prevActive };
}
