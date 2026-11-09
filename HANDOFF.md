# Fusion 360 recreation — handoff

## The task
Fusion 360 × Claude Builders Club hackathon minigame: use Claude, with the **REA**
repo (https://github.com/morluto/rea, "Reverse Engineer Anything"), to recreate
Autodesk Fusion as accurately as possible. Other participants will test the
result, so it has to be **one shareable web link**. The prize is a visit to Fusion HQ.

Target: a browser recreation of Fusion's **Design workspace**. That means its UI
layout, its parametric timeline, sketch → extrude/revolve, real B-rep modelling,
the ViewCube, the marking menu, the S-key toolbox and Fusion's default shortcuts.

### Rules we set
- Do **not** copy Autodesk logos, wordmarks or icon artwork. Draw original SVG icons.
  Layout, behaviour, names, shortcuts and workflows can be reproduced.
- Label the app as an *unofficial hackathon recreation, not affiliated with Autodesk*
  (Help → About).
- Do **not** commit files copied from the Fusion install into any repo. Read them
  in place as evidence.

## What exists in this folder
```
src/expr.js            Fusion-style expression evaluator + ParamTable (units mm/cm/m/in/ft/deg/rad,
                       functions, parameter references, cycle detection)
src/sketch/solver.js   Levenberg–Marquardt constraint solver (sparse numeric Jacobian) + DOF
                       analysis (null space of JᵀJ) → "fully constrained" per entity (blue→black)
src/sketch/regions.js  Planar arrangement of lines/circles/arcs → closed profiles: split at all
                       intersections, prune dangling edges, half-edge face walk, hole assignment,
                       stable region keys (curveId+sense signature)
src/sketch/sketch.js   Sketch data model + ops: rect (2-pt, centre), polygon (in/circumscribed),
                       slot, trim, sketch fillet, offset (circles, closed line loops), mirror,
                       dimension measurement
src/kernel.js          replicad/OpenCascade wrapper: regions→Drawings, extrude (incl. taper via
                       loft of offset profile), revolve, hole tool (simple/counterbore/countersink,
                       drill-point angle), face/edge lookup by geometry, tangent chain, meshing with
                       face/edge groups mapped by hashCode
src/model.js           Parametric document + timeline Evaluator with incremental cache.
                       Features: sketch, extrude (one/two/sym, distance/all, taper, new/join/cut/
                       intersect, face profiles = Press Pull), revolve, fillet, chamfer, shell,
                       draft, hole (single / from sketch points), box, cylinder, sphere, torus,
                       combine, mirror, rectangular & circular pattern, move/copy, delete,
                       construction plane (offset / angle / midplane), loft, sweep.
                       Model parameters d1, d2… auto-assigned; Change Parameters data helper.
tests/                 Node tests (run: `node tests/sketch_test.mjs`, `node tests/kernel_smoke.mjs`,
                       `node tests/kernel2.mjs`). All passing at handoff.
```
Setup: `npm install`. It pulls three@0.169.0, replicad 1.2.1, replicad-opencascadejs 1.2.1 and esbuild.

### Verified so far
- Rectangle plus 2 dims plus origin coincidence gives fully constrained (0 free vars). Expressions like `d1/2` work.
- Profiles: a rectangle with a circle inside gives 2 regions (ring with hole, disc). A splitter line
  and overlapping circles give the correct face set, and the areas sum to the rectangle.
- Polygon, slot, sketch fillet and trim all produce the correct areas.
- Kernel: extrude, fillet, shell, taper loft, revolve, sweep, cut, section (`cutPlane`), STEP/STL
  export, volume and centre-of-mass. Kernel init takes about 0.3 s in Node.

## What's left (in order)
1. **UI shell** (HTML/CSS): application bar (data panel, File ▾, save, undo, redo, document tab,
   right-side icons), toolbar (workspace dropdown DESIGN ▾; tabs SOLID / SURFACE / MESH /
   SHEET METAL / PLASTIC / UTILITIES; groups CREATE / MODIFY / ASSEMBLE / CONSTRUCT / INSPECT /
   INSERT / SELECT with dropdowns), browser tree (Document Settings, Named Views, Origin,
   Bodies, Sketches, Construction, with eye toggles), timeline (playback controls, feature icons,
   draggable marker, right-click Edit/Suppress/Roll here/Delete), navigation bar.
   **Get the exact toolbar contents from Fusion's own `TabToolbars.xml`** (see evidence below).
2. **Viewport** (three.js, Z-up): Fusion mouse scheme (MMB pan, Shift+MMB orbit, wheel zoom to cursor,
   double-MMB fit) plus trackpad heuristics. Gradient background, layout grid, perspective/ortho,
   visual styles. Picking: faces (faceGroups), edges (screen-space), sketch curves/profiles.
   Hover is light blue, selected is blue.
3. **ViewCube**: second small scene with 26 click zones, home button, drag to orbit, axis triad.
   Standard views for Z-up: Front looks from −Y, Right from +X, Top from +Z, Home is iso from (+x, −y, +z).
4. **Sketch environment**: Create Sketch → pick an origin plane or planar face → look-at animation →
   SKETCH contextual tab + Sketch Palette + FINISH SKETCH. Tools: Line (L, chained), 2-Point
   Rectangle (R), Centre Rectangle, Circle (C), 3-pt / centre arc, Polygon, Slot, Point, Fillet,
   Trim (T), Offset (O), Mirror, Project (P), Dimension (D), constraints, construction toggle (X).
   On-canvas length/angle input boxes, snapping with auto H/V/coincident, point dragging through the solver.
   Unconstrained lines are blue, fully constrained black, construction orange dashed, profiles pale orange.
5. **Command dialogs**: a floating panel on the right with selection rows, expression inputs, OK/Cancel,
   live preview (evaluate the document with the tentative feature appended; the cache makes this cheap),
   cut previews in red, and an extrude distance arrow manipulator. Auto operation: extruding away from a
   face joins, into a body cuts, in empty space makes a new body.
6. **Marking menu** (right-click radial + overflow list, drag gestures), **S toolbox** (search),
   keyboard shortcuts, undo/redo (doc JSON snapshots), Change Parameters dialog, Appearance (A) and
   Physical Material, Properties (mass/volume/area/CoM), Measure (I), Section Analysis (`cutPlane`),
   save/open in localStorage, STEP/STL export.
7. **Package and publish**:
   - Bundle with esbuild (`platform=browser`, ESM).
   - The OCCT wasm is 22.9 MB. If the host has a per-file limit (claude.ai artifacts allow 20 MiB per
     file), ship it gzip'd (7.2 MB). Decompress with `DecompressionStream('gzip')` and pass it as
     `wasmBinary` to the `replicad-opencascadejs` factory.
   - Hosting options: GitHub Pages, Vercel, or come back to the original claude.ai chat to publish it
     as an artifact. For artifacts, scripts are only allowed from cdnjs, jsdelivr or unpkg (or bundled),
     page downloads need the `downloads` capability, and localStorage must be wrapped in try/catch.
8. **Test**: run Playwright through the core loop (sketch rect → dimension → extrude → fillet → hole →
   edit in timeline → ViewCube) and check screenshots against Fusion.

## Evidence ledger (REA-style: observed / inferred / unknown)

### Observed: Autodesk public docs
- Shortcuts (help.autodesk.com "Fusion keyboard shortcuts reference"):
  E Extrude, H Hole, Q Press Pull, F Fillet, M Move, V Toggle Visibility, Shift+N Component
  Colors, S Toolbox, A Appearance, Ctrl+B Compute All, J Joint, Shift+J As-built Joint.
  Sketch: L Line, R 2-Point Rectangle, C Centre Diameter Circle, T Trim, O Offset, I Measure,
  P Project, X Normal/Construction, D Sketch Dimension.
  Selection: 1 Window, 2 Freeform, 3 Paint, Del. View: Ctrl+Alt+V ViewCube, Ctrl+Alt+B Browser,
  Ctrl+Alt+N Nav bar, Ctrl+Alt+P Data Panel, Ctrl+Alt+R Reset layout. Ctrl+Z/Y, Ctrl+S,
  Ctrl+Shift+S Recovery Save, Shift+S Scripts and Add-ins, Ctrl+[ / Ctrl+] cycle workspaces.
- Navigation defaults (Preferences reference): Pan = MMB, Orbit = Shift+MMB, Zoom = wheel; default
  modelling orientation **Z up**.
- Interface map: Data Panel; Application Bar (Home, Data Panel, File, Save, Undo/Redo, document tabs,
  New Design, Autodesk Assistant, Extensions, Job Status, Notifications, Help, Profile); Toolbar
  (workspace menu, tabs, contextual tabs, contextual environments); Browser; Canvas; ViewCube;
  Marking Menu; Navigation Bar; Timeline (right-click to edit, drag to reorder).
- Marking menu defaults (Design): Repeat, Delete, Press Pull, Undo, Redo, Move/Copy, Hole, Sketch.
  Inside a command, left = Cancel and right = OK.
- Extrude dialog: Type (Extrude / Thin Extrude), Profiles, Start, Direction (One Side / Two Sides /
  Symmetric), Extent (Distance / To Object / Through Body / All), Taper Angle, Operation (Join / Cut /
  Intersect / New Body / New Component); auto-selects the single visible profile.

### Observed: the user's local Fusion install (version 2706.1.17)
Root: `%LOCALAPPDATA%\Autodesk\webdeploy\production\39e8a3d5e919c70b05ef3ebfe9c6bfc8d9ee001e\`.
**Read these next; they are the highest-value evidence:**
- `Fusion\UI\FusionUI\Resources\Toolbar\TabToolbars.xml`: the real Design toolbar layout.
- `Fusion\UI\FusionUI\Resources\MarkingMenus\MarkingMenus.xml`: the real marking menu layout.
- `Neutron\UI\Commands\Resources\Toolbar\Toolbars.xml`
- `LightTheme.xbel`: theme colours (e.g. Container1 #EFEFEF, Container2 #E1E1E1, Container3 #BBBBBB,
  WidgetContainer5 #CAE2F7). Use these for the UI palette.
- `PhysicalMaterials.xml`, `VisualMaterials.xml`: material and appearance libraries (names, densities).
- `StringTable\en-US\NaFusionUI10.xml`, `NaSketch10.xml`: exact command names and tooltips.
- `Fusion\Toolbar\src\qml\*.qml`, `Fusion\CommandDialog\src\qml\**`: toolbar and dialog QML (sizes,
  spacing, behaviour).
- `API\Python\…` stubs: the Fusion object model, for naming.

REA itself (`npx -y rea-agents@latest …`, e.g. `inspect-desktop-application`, `analyze-javascript-application`)
can run against this install locally. It was blocked in the cloud session.

### Inferred (verify against the files above)
- Marking menu positions: top Repeat, left Undo, right Redo, bottom Sketch; corners Delete / Press Pull /
  Hole / Move-Copy.
- Positive taper grows the profile (Inventor convention). Symmetric extrude defaults to half-length.
- Default hole is 5 mm diameter by 10 mm deep with a 118° drill point. Default fillet radius is 1 mm.
- The XZ sketch plane normal is −Y, with sketch y = world Z.

## Gotchas found
- `R.makeThreePointArc` with collinear points **crashes the wasm** (table index out of bounds).
  `kernel.js` guards against this. Keep the guard.
- Mesh `faceGroups[].faceId` and `edgeGroups[].edgeId` are **hash codes**. Map them through
  `shape.faces[i].hashCode` (done in `meshBody`).
- Take the sketch feature cache signature *after* solving, because the solver moves points.
- Region keys use curve id + traversal sense, with a centroid tie-break. Profile refs also store an
  interior point `c` as a fallback.
