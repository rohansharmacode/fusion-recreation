// manage module: UTILITIES / MANAGE / AUTOMATION / SELECT tools (see README.md).
//   Scripts and Add-Ins (ScriptsManagerCommand, Shift+S), Fusion API (APIHelpCommand),
//   Design and Make Marketplace (ExchangeAppStoreCommand)                  scripts/*, links.js
//   Select by Name / Size / Boundary / Seed and Boundary, Invert Selection,
//   Selection Filters                                                     select.js
//   Design Advice (DesignAdviceCmd)                                        advice.js
//   Find Features, Generate Timeline, Compute Unresolved                   features.js, timeline.js
//   Navigator (GraphViewCmd)                                               navigator.js
//   Assign Item Number, Quick Release, Release with Change Order, Dashboard,
//   Details, Change Orders (PIM*), New Task, Related Tasks, Open on the Web pim.js, tasks.js
import "./style.css";
import { registerScripts } from "./scripts/index.js";
import { registerLinks } from "./links.js";
import { registerSelect } from "./select.js";
import { registerManageIcons } from "./icons.js";
import { registerAdvice } from "./advice.js";
import { registerFeatureTools } from "./features.js";
import { registerNavigator } from "./navigator.js";
import { registerTimelineTools } from "./timeline.js";
import { registerPim } from "./pim.js";
import { registerTasks } from "./tasks.js";

const PARTS = [
  ["icons", registerManageIcons],
  ["scripts", registerScripts],
  ["links", registerLinks],
  ["select", registerSelect],
  ["advice", registerAdvice],
  ["features", registerFeatureTools],
  ["navigator", registerNavigator],
  ["timeline", registerTimelineTools],
  ["pim", registerPim],
  ["tasks", registerTasks],
];

export function init(app) {
  // each part starts on its own: one failing must not take the others (or the app) down
  for (const [name, fn] of PARTS) {
    try { fn(app); } catch (e) { console.error(`[manage] ${name} failed to start`, e); }
  }
}
