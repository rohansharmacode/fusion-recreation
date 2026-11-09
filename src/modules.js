// UI modules in start-up order. `@module/<name>` resolves to src/modules/<name>/index.js;
// `node scripts/build.mjs --only=a,b` swaps every other module for an empty stub.
import * as viewport from "@module/viewport";
import * as sketch from "@module/sketch";
import * as dialogs from "@module/dialogs";
import * as inspect from "@module/inspect";
import * as manage from "@module/manage";
import * as annotate from "@module/annotate";
import * as configure from "@module/configure";
import * as assembly from "@module/assembly";
import * as insertx from "@module/insertx";
import * as surface from "@module/surface";
import * as mesh from "@module/mesh";
import * as sheetmetal from "@module/sheetmetal";
import * as plastic from "@module/plastic";
import * as createx from "@module/createx";
import * as solidx from "@module/solidx";
import * as form from "@module/form";
import * as render from "@module/render";
import * as animation from "@module/animation";
import * as simulation from "@module/simulation";
import * as manufacture from "@module/manufacture";
import * as drawing from "@module/drawing";
import * as generative from "@module/generative";
import * as shell from "@module/shell";
import * as browser from "@module/browser";
import * as timeline from "@module/timeline";
import * as menus from "@module/menus";

export const MODULES = [
  ["viewport", viewport], // creates app.viewport (scene, camera, picking, ViewCube, nav bar)
  ["sketch", sketch], // sketch environment + sketch rendering
  ["dialogs", dialogs], // command dialog framework + modelling feature commands
  ["inspect", inspect], // measure, section analysis, properties, appearance, materials
  ["manage", manage], // Utilities / Manage / Automation tools
  ["annotate", annotate], // 3D annotations
  ["configure", configure], // Design configurations
  ["assembly", assembly], // Joints
  ["insertx", insertx], // Insert Component / Derive / Fasteners / McMaster-Carr / Decal
  ["surface", surface], // SURFACE tab
  ["mesh", mesh], // MESH tab
  ["sheetmetal", sheetmetal], // SHEET METAL tab
  ["plastic", plastic], // PLASTIC tab and solid plastic-style features
  ["createx", createx], // Remaining SOLID Create tools
  ["solidx", solidx], // Remaining SOLID Modify / Construct tools
  ["form", form], // Form (T-Spline) contextual environment
  ["render", render], // RENDER workspace
  ["animation", animation], // ANIMATION workspace
  ["simulation", simulation], // SIMULATION workspace
  ["manufacture", manufacture], // MANUFACTURE workspace
  ["drawing", drawing], // DRAWING workspace
  ["generative", generative], // GENERATIVE DESIGN workspace
  ["shell", shell], // application bar + toolbar (renders after commands are registered)
  ["browser", browser], // browser tree
  ["timeline", timeline], // parametric timeline
  ["menus", menus], // marking menu, S toolbox, shortcuts, parameters, file ops, about
];
