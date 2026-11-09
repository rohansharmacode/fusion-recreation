// insertx module: the INSERT panel and the assembly helpers around it (see README.md).
//   Insert Component (FusionImportCommandFromToolbar), Edit In Place (EIPToolbar)   xref.js   features 'insertcomp', 'eipref'
//   Insert Derive (PullDeriveCommand), Derive (PushDeriveCommand)                    derive.js feature 'derive'
//   Fasteners (FusionFastenersCommand), Fastener Stack Analysis                      fasteners.js feature 'fastener'
//   Decal (FusionAddEditDecalCommand)                                                decal.js feature 'decal'
//   Arrange, Find Similar Components, Replace with Primitives                        layout.js features 'arrange', 'replaceprim'
import "./style.css";
import { initXref } from "./xref.js";
import { initDerive } from "./derive.js";
import { initFasteners } from "./fasteners.js";
import { initDecal } from "./decal.js";
import { initLayout } from "./layout.js";

const PARTS = [
  ["external components", "xref", initXref],
  ["derive", "derive", initDerive],
  ["fasteners", "fasteners", initFasteners],
  ["decal", "decal", initDecal],
  ["arrange, similar, primitives", "layout", initLayout],
];

export function init(app) {
  const api = {};
  for (const [name, key, fn] of PARTS) {
    try { api[key] = fn(app, api) || null; } catch (e) { console.warn(`[insertx] ${name} failed to start`, e); }
  }
  app.insertx = api;
}
