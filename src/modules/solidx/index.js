// solidx module: the remaining SOLID Modify and Construct tools (see README.md).
import "./style.css";
import { registerConstruct } from "./construct.js";
import { createConstructionView } from "./render.js";
import { registerFaceTools } from "./faces.js";
import { registerAlign } from "./align.js";
import { registerBaseFeature } from "./basefeature.js";
import { registerEditFace } from "./editface.js";
import { registerAutomatedModeling } from "./automodel.js";

export function init(app) {
  const ui = (app.ui.solidx = app.ui.solidx || {});
  const step = (name, fn) => { try { fn(); } catch (e) { console.error(`[solidx] ${name}`, e); } };
  step("construction", () => registerConstruct(app));
  step("construction display", () => { ui.construction = createConstructionView(app); });
  step("face tools", () => registerFaceTools(app));
  step("align", () => registerAlign(app));
  step("base feature", () => registerBaseFeature(app));
  step("edit face", () => registerEditFace(app));
  step("automated modeling", () => registerAutomatedModeling(app));
}
