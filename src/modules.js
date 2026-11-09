// UI modules in start-up order. `@module/<name>` resolves to src/modules/<name>/index.js;
// `node scripts/build.mjs --only=a,b` swaps every other module for an empty stub.
import * as viewport from "@module/viewport";
import * as sketch from "@module/sketch";
import * as dialogs from "@module/dialogs";
import * as inspect from "@module/inspect";
import * as shell from "@module/shell";
import * as browser from "@module/browser";
import * as timeline from "@module/timeline";
import * as menus from "@module/menus";

export const MODULES = [
  ["viewport", viewport], // creates app.viewport (scene, camera, picking, ViewCube, nav bar)
  ["sketch", sketch], // sketch environment + sketch rendering
  ["dialogs", dialogs], // command dialog framework + modelling feature commands
  ["inspect", inspect], // measure, section analysis, properties, appearance, materials
  ["shell", shell], // application bar + toolbar (renders after commands are registered)
  ["browser", browser], // browser tree
  ["timeline", timeline], // parametric timeline
  ["menus", menus], // marking menu, S toolbox, shortcuts, parameters, file ops, about
];
