# pcb module: 3D PCB and the PCB environment

Files: `index.js` (registration, activation hooks, `app.ui.pcb`), `feature.js` (timeline type `pcb`), `env.js` (PCB
environment, one-step creation of the PCB component), `dialogs.js` (command dialogs), `icons.js` (original icons).

## Commands
| id | what it does |
|---|---|
| PCBCreateCmd | Create 3D PCB (SOLID > CREATE > Create PCB, and the PCB tab). Profile (sketch profiles or planar faces), Thickness 1.60 mm, Origin (point / vertex / sketch point), X Axis (sketch line, linear edge, origin axis), Flip X Axis, Flip Z Axis, Convert Circles to NPTHs + Max NPTH Diameter. OK makes a component "PCB" (then "PCB (1)" ...) with a green "Board" body and enters the PCB environment. Inside the environment a new PCB is a sibling of the running one. |
| PCBDeriveCmd | Derive PCB from Sketch: same as Create with sketch profiles only (`derived: true`); the board follows later sketch edits. Fusion derives a cloud 3D PCB document: the local equivalent is a PCB component in this design. |
| PCBExternalComponentCreationCmd | Create Linked PCB: Location (plane / planar face, default XY). Makes the PCB component without a board plus an empty "Board Outline" sketch in it (before the pcb feature), enters the environment and says "Board outline not defined". Fusion links a cloud Electronics design: the local equivalent is this unlinked PCB whose outline is drawn here. |
| PCBDefineBoardCmd | (PCB tab) Define Board: Shape (Profile, Profile On PCB Top / Bottom Layer, Thickness) and Origin (Origin, X Axis, Flip X Axis, Flip Z Axis) of the running PCB, with live preview. The first outline of a Linked PCB creates its Board body. Profiles must come from sketches before the PCB in the timeline. |
| PCBImprintCmd | (PCB tab) Imprint (Fusion: Copy EAGLE Profile): copies the board outline (top face loops) into the selected sketch, or into a new sketch "PCB Profile" on the selected plane / planar face. Lines, circles and arcs stay exact; other curves become lines. |
| PCBBoardSketchEditCmd | (PCB tab) Edit Board Sketch: opens the board outline sketch (Linked PCB sketch, else the sketch of the first profile); Finish Sketch returns to the PCB environment. Disabled for face-based PCBs. |
| PCBMoveComponentsCmd | (PCB tab) Move Components: Selection (components inside the PCB; a picked body maps to its top-level component on the board), X Distance, Y Distance (along the 2D PCB axes), Angle (about the board normal, around the component centre), Use 2D PCB Grid (1.27 mm). Live preview through display transforms; OK captures the positions (one Position feature, one undo step). |
| PCBFlipComponentCmd | (PCB tab) Flip Component: rotates the selected components 180 deg about the board X axis through the board mid-plane, so they go to the other side. Preview and capture like Move. |
| PCBStatusCmd | (PCB tab) PCB Status: Board Shape (size, or "Board outline not defined"), Board Height, Holes, Cutouts, PCB Components, Status. |
| PCBStop | FINISH PCB: leaves the environment and activates the component that was active before. |

Activating a PCB component (browser radio or `app.components.activate`) enters the PCB environment; activating a
component outside the running PCB, or undoing the PCB, leaves it.

## Data
`pcb` feature (registered with `M.registerFeature`, operation `newComponent`):
`{ profiles: [{sketch, key, c}], faces?: [{body, p, n}], thickness: "1.60 mm", side: "top" | "bottom", origin?, xAxis?,
flipX?, flipZ?, npth?, maxNpth?, derived?, linked?, boardSketch?, newComp, newOcc, newBody? }`.
The board runs from the profile plane away from the PCB top (side "top") or towards it (side "bottom", the default).
`flipZ` turns the board over. A pcb feature without profiles and faces (Linked PCB before Define Board) only makes the
component. Result `results[id].board = {thickness, maxNpth, holes, cutouts, size: [x, y], frame: {o (on the top face), x,
y, z}, T0}`. The board appearance `pcb-green` is registered in `app.appearances` at init.

## API
`app.ui.pcb = { env(), active() (pcb feature of the running environment), enter(featureId), finish(), boardSketch(featureId) }`.
`feature.js`: `currentFrame(app, f)` (board frame following a moved PCB), `pcbFeatureOfOcc(app, oid)`.

## Wave 2b leftovers built by this engineer (outside this folder)
* `src/modules/surface/primitives.js`: SURFACE > CREATE `SurfPrimitiveBox`, `SurfPrimitiveCylinder`, `SurfPrimitiveSphere`,
  `SurfPrimitiveTorus`, `SurfPrimitiveCoil`, `SurfPrimitivePipe`. The solid primitive dialogs (dialogs module) open under
  the surface id with the operations New Body / New Component; features `surfBox`, `surfCylinder`, `surfSphere`,
  `surfTorus`, `surfCoil`, `surfPipe` store the solid primitive's fields and evaluate it on a scratch state, then keep its
  closed shell as a surface body. Edit Feature reopens the dialog.
* `src/modules/sheetmetal/cosmetic.js`: `FusionSheetMetalCosmeticBendCmd` (FLAT PATTERN environment): Profiles (straight
  sketch lines on the flat pattern), Bend type (Crease / Press brake), Direction (Up / Down), Bend angle, Bend radius
  (press brake; default from the sheet metal rule). Feature `smCosmeticBend {body, lines, bendType, direction, angle,
  radius}` does not change the folded model; the flat pattern view draws the lines (crease solid, press brake dashed;
  up blue, down red). Fusion 2706 places the command in the FLAT PATTERN SURFACE tab only, so in the solid flat pattern
  it runs from the S toolbox. The DXF export does not include cosmetic bends yet.
* `src/modules/createx/modify-model.js`: `VolFieldModifyModelCommand` (Modify Model): select a volumetric model, then the
  Volumetric Lattice / Texture dialog of the feature that made it opens in Edit Feature mode.

Test: `tests/e2e/scenarios/pcb.mjs` (PCB commands, environment, undo / redo, save / open, and the leftovers above).
