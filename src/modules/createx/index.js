// UNDER ACTIVE DEVELOPMENT by the createx engineer: integration engineers, do not edit; stub this module with --only if it breaks a test.
// createx module: the remaining SOLID Create tools (see README.md).
//   Bounding Solid (StockModelCommand)                 bounding.js   feature 'boundingsolid'
//   Fluid Volume (EnclosureCommand)                    fluid.js      feature 'fluidvolume'
//   Pattern on Path (PatternOnPath)                    pathpattern.js feature 'pathpattern'
//   Geometric Pattern (FusionPatternGeometricCommand)  geopattern.js feature 'geopattern'
//   Coordinate System (CoordinateSystemCommand)        csys.js       feature 'csys'
//   Volumetric Lattice / Texture (VolField*)           lattice.js    features 'vlattice', 'vtexture' (+ vox.js)
import "./style.css";
import { beginModelCommand } from "../dialogs/common.js";
import { registerCsysFeature, installCsysDisplay, openCsys } from "./csys.js";
import { registerBoundingFeature, openBoundingSolid } from "./bounding.js";
import { registerFluidFeature, openFluidVolume } from "./fluid.js";
import { registerPathPatternFeature, openPathPattern } from "./pathpattern.js";
import { registerGeoPatternFeature, openGeoPattern } from "./geopattern.js";
import { registerLatticeFeatures, openLattice, openTexture } from "./lattice.js";

const COMMANDS = [
  ["StockModelCommand", "Bounding Solid", "Creates a solid component around a selected component, body, or set of bodies.", openBoundingSolid],
  ["EnclosureCommand", "Fluid Volume", "Creates the surrounding volume from selected bodies. Surrounding volume can be internal or external to the bodies.", openFluidVolume],
  ["PatternOnPath", "Pattern on Path", "Duplicates faces, bodies, features, or components in a design and distributes them to create a pattern along a specific path.", openPathPattern],
  ["FusionPatternGeometricCommand", "Geometric Pattern", "Spreads features across a face with changing size and spacing.", openGeoPattern],
  ["CoordinateSystemCommand", "Coordinate System", "Creates a custom coordinate system that you can reference in assembly relationships, manufacturing setups or other downstream workflows.", openCsys],
  ["VolFieldCreateLatticeCommand", "Volumetric Lattice", "Modify existing solid bodies or mesh bodies to create complex volumetric lattices that alter the shape and appearance of a design.", openLattice],
  ["VolFieldTextureCommand", "Volumetric Texture", "Applies a volumetric texture inside a body.", openTexture],
];

const PARTS = [
  ["coordinate system", registerCsysFeature],
  ["bounding solid", registerBoundingFeature],
  ["fluid volume", registerFluidFeature],
  ["pattern on path", registerPathPatternFeature],
  ["geometric pattern", registerGeoPatternFeature],
  ["volumetric", registerLatticeFeatures],
];

export function init(app) {
  for (const [name, fn] of PARTS) {
    try { fn(app); } catch (e) { console.warn(`[createx] ${name} failed to start`, e); }
  }
  for (const [id, label, tooltip, open] of COMMANDS) {
    try {
      app.commands.register({
        id, label, tooltip, kind: "feature",
        run: (a, ctx = {}) => { const pre = beginModelCommand(a); return open(a, { preselect: ctx.preselect || pre, editId: ctx.editId }); },
      });
    } catch (e) { console.warn(`[createx] ${id}`, e); }
  }
  // the coordinate-system triads need the viewport (created by an earlier module)
  try { installCsysDisplay(app); } catch (e) { console.warn("[createx] coordinate system display", e); }
}
