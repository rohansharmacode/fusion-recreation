// dialogs module: the command dialog framework (app.ui.dialog) + the modelling feature commands
// (Extrude, Revolve, Hole, Press Pull, Fillet, Chamfer, Shell, primitives, construction planes, ...).
// API documentation: ./README.md
import "./style.css";
import { createFramework } from "./framework.js";
import { registerCommands } from "./commands.js";
import { installSketchFallback } from "./fallback.js";
import { MODULES } from "../../modules.js";

export function init(app) {
  app.ui.dialog = createFramework(app);
  registerCommands(app);
  // Builds without a working sketch module (e.g. --only=viewport,dialogs) still need to see and
  // pick sketch profiles: install a minimal fallback unless the real sketch environment is there.
  let installed = false;
  const decide = () => {
    if (installed) return;
    let stubbed = false;
    try {
      const entry = (MODULES || []).find(([n]) => n === "sketch");
      stubbed = !entry || !entry[1] || !!entry[1].stub;
    } catch { /* ignore */ }
    const sc = app.commands.get("SketchCreate");
    if (stubbed || !sc || sc.stub) { installed = true; installSketchFallback(app); }
  };
  app.on("ready", decide);
}
