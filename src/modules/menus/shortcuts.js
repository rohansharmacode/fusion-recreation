// Environment "Shortcuts" (Fusion: <Workspace> Shortcuts). One list per environment, shown as the
// icon row of the S toolbox and at the bottom of the marking menu's overflow list.
// Defaults match a fresh Fusion install (Design: Extrude, Fillet, Insert Component;
// Sketch: Line, 2-Point Rectangle, Center Diameter Circle). "Pin to Shortcuts" adds a command,
// "Remove from Shortcuts" removes it; the lists persist in localStorage (try/catch via store).
import { store } from "./util.js";

export const DEFAULT_SHORTCUTS = {
  model: ["Extrude", "FusionFilletEdgesCommand", "FusionImportCommandFromToolbar"],
  sketch: ["DrawPolyline", "ShapeRectangleTwoPoint", "CircleCenterRadius"],
};
// Labels for ids that may not be registered in a partial build.
export const SHORTCUT_LABELS = {
  Extrude: "Extrude", FusionFilletEdgesCommand: "Fillet", FusionImportCommandFromToolbar: "Insert Component",
  DrawPolyline: "Line", ShapeRectangleTwoPoint: "2-Point Rectangle", CircleCenterRadius: "Center Diameter Circle",
};

const KEY = (env) => `fusion-rec:shortcuts:${env}`;
const MAX = 24;

export function createShortcuts(app) {
  const env = () => (app.mode === "sketch" ? "sketch" : "model");
  function list(e = env()) {
    const raw = store.getJSON(KEY(e), null);
    if (!Array.isArray(raw)) return DEFAULT_SHORTCUTS[e].slice();
    return raw.filter((x) => typeof x === "string");
  }
  function save(ids, e = env()) {
    try { store.setJSON(KEY(e), ids.slice(0, MAX)); } catch (err) { app.toast(err.message || String(err), "error"); }
    app.emit("shortcuts", { env: e });
  }
  const has = (id, e = env()) => list(e).includes(id);
  function pin(id, e = env()) { save([id, ...list(e).filter((x) => x !== id)], e); }
  function unpin(id, e = env()) { save(list(e).filter((x) => x !== id), e); }
  function toggle(id, on, e = env()) { if (on) pin(id, e); else unpin(id, e); }
  function reset(e = env()) { store.remove(KEY(e)); app.emit("shortcuts", { env: e }); }
  return { env, list, has, pin, unpin, toggle, reset };
}
