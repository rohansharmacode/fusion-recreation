# Fusion Design workspace recreation: handoff

## What this is
An **unofficial** browser recreation of the Design workspace of Autodesk Fusion, built for the Fusion x Claude
Builders Club hackathon (testers get one shareable link; the prize is a visit to Fusion HQ). Plain ES modules,
three.js (Z-up, mm) and a real B-rep kernel (OpenCascade through replicad, WebAssembly), bundled by esbuild. No framework.

- **Live:** https://rohansharmacode.github.io/fusion-recreation/
- **Repo:** https://github.com/rohansharmacode/fusion-recreation (branch `main`)
- **Hosting:** GitHub Pages from the `gh-pages` branch. The published files are the four outputs of
  `node scripts/build.mjs --release` (`npm run release`): `index.html`, `app.js`, `app.css`, `occt.gz.wasm`.
  Same four files also work as a claude.ai artifact (`npm run serve:artifact` rehearses the sandbox).
- Contract and API: [ARCHITECTURE.md](ARCHITECTURE.md). Run/build/release details: [README.md](README.md).
  Per-dialog notes: `src/modules/dialogs/README.md`. Visual checklist: `docs/fidelity-checklist.md`.

History (git): initial recreation, then refinement rounds 2 to 5 (side-by-side fixes against real Fusion; power-user
modelling fixes; sketch-solver and marking-menu fixes; splines/ellipses and the Split/Coil/Pipe/Scale/Thread/BOM/Insert group).

## What works (by area)
- **Shell**: Fusion light theme, application bar, DESIGN workspace menu, all SOLID/SURFACE/MESH/SHEET METAL/PLASTIC/UTILITIES
  tabs with the real panel layout and dropdowns (from TabToolbars.xml), tooltips, transparent browser tree, comments panel,
  bottom-right status text, small-screen note.
- **Viewport**: Fusion mouse scheme (MMB pan, Shift+MMB orbit, wheel zoom, double-MMB fit) plus trackpad, ViewCube (26 zones,
  home, drag), navigation bar, visual styles, environments, camera modes, grid and snap settings, origin/axis display,
  picking with point > curve > area ranking, window/freeform/paint selection, selection priority filters.
- **Sketch**: Create Sketch on origin planes or planar faces with look-at, palette, Finish Sketch. Line, 2-pt/3-pt/center rectangle,
  circles (centre, 2-pt, 3-pt), 3-pt/centre/tangent arcs, polygons, slots, point, **fit-point spline, ellipse, elliptical arc**,
  midpoint line, fillet and chamfers, **blend curve (G1)**, trim, extend, offset, mirror, project, dimensions, 12+ constraints,
  construction toggle. LM solver with DOF analysis (blue to black), selection-order-aware (first pick stays fixed), refuses
  degenerate geometry, drag through the solver, on-canvas value boxes, snapping with auto constraints. Region finder gives
  exact profiles for lines, arcs, circles, splines and ellipses.
- **Modelling** (28 feature types incl. sketch): Extrude (one/two/symmetric, distance/all, taper, join/cut/intersect/new body,
  Press Pull), Revolve, Sweep, Loft, Hole (simple/counterbore/countersink), Box/Cylinder/Sphere/Torus, **Coil, Pipe, Thread
  (modeled and cosmetic)**, Fillet, Chamfer, Shell, Draft, Combine, **Split Body, Scale**, Mirror, Rectangular/Circular Pattern,
  Move/Copy, Delete, construction planes (offset, angle, midplane). Docked dialogs with live preview and on-canvas manipulators.
  Face/edge references carry a derived geometric signature (`sig`) so features survive upstream edits.
- **Parametric history**: timeline with playback, drag marker, roll, suppress/unsuppress, rename, trim, edit feature (downstream
  recompute), Change Parameters with expressions (`d1/2`, units), Compute All, undo/redo (JSON snapshots).
- **Inspect / insert**: Measure, Section Analysis, Properties, Center of Mass, Appearance and Physical Material libraries,
  **Interference check, Bill of Materials, Insert Canvas, Insert Mesh (STL/OBJ)**.
- **Interaction**: marking menu with overflow, S toolbox with search, Fusion default shortcuts (rebindable), Repeat command.
- **Files**: Save/Open in browser storage (memory fallback), export STEP/STL/design JSON, Save As Image.
- **Robustness**: per-feature kernel failure isolation, global error safety net (toast, not a frozen UI), real loading progress and
  an error card with Retry if the kernel fails to load.

## Test status (re-run for this handoff)
- Engine tests: `npm test` passes (sketch_test, sketch_engine2, kernel_smoke, kernel2, dialogs_model). Also passing:
  `node tests/spline_test.mjs` ("ALL PASS") and `node tests/robust_test.mjs` (119/119). The last two are not in `npm test`.
- QA scenarios: `npm run e2e` gives **20/20 scenarios passed, zero console errors** in headless Edge (toolbar, core-loop,
  viewcube, marking-menu, toolbox, undo-redo, save-open, parameters, browser, timeline, modeling, navigation, sketch,
  shortcuts, look, small-screen, robustness, create-modify, insert, inspect). Full run is about 5 min with `--parallel=3`.
- Not re-run for this handoff: `npm run verify` (packaging/sandbox checks) and `npm run e2e:release`. Run both before any new deploy.

## Known gaps
- Command coverage: 456 ids registered, **220 real, 217 stubs** (stubs toast "isn't available in this unofficial recreation yet").
  The stubs are the SURFACE, MESH (ParaMesh*), SHEET METAL, PLASTIC and T-Spline tools, joints/assembly/motion, construction
  axes and points (only the three construction-plane commands are real), analyses other than section/measure/interference
  (draft, curvature, zebra, etc.), Emboss/Rib/Web/Boss, Offset Faces/Replace Face/Remove, sketch patterns, 3-tangent circles,
  conic/3D spline, SVG/DXF import, Drawings/Render/CAM/Simulation workspaces, PIM/task management, scripts manager.
- No components or assemblies (one flat design; "Isolate" and visibility work on bodies).
- No cloud: Data Panel, versions, sharing and comments are UI placeholders. Storage is the browser only.
- The kernel runs on the main thread, so a very heavy boolean blocks the page until it returns (no worker yet).
- Only the SOLID tab workflow is deeply tested; the other tabs are layout-faithful but mostly stubs.
- Touch and phone screens are only partly supported; best on desktop Chrome/Edge with a mouse.
- `sig` matching is geometric: unusual topology changes can still make a face/edge ref fail to resolve (the feature shows an error, the app keeps running).
- `refshots.mjs` needs the private reference captures (`$FUSION_REFS`), which are not in the repo.

## Next steps
1. Run `npm run verify` and `npm run e2e:release`, then redeploy `release/` to `gh-pages` after any change.
2. Move the kernel to a Web Worker (largest UX win for heavy models).
3. Construction axes/points and the remaining sketch tools (3-tangent circle, sketch patterns, DXF/SVG import).
4. Offset Faces, Replace Face, Remove, Rib, Emboss; basic surface commands (Patch, Stitch, Thicken, Surface Extrude).
5. Components and joints (a component tree in the browser, As-built/Rigid joints) if assembly fidelity is wanted.
6. Keep comparing against real Fusion with `refshots.mjs` and `docs/fidelity-checklist.md`; update ARCHITECTURE.md when ids, events or ref formats change.

## Evidence rules (keep following these)
- **No Autodesk artwork.** Never use Autodesk logos, wordmarks or icon artwork. All icons are original SVG (`src/modules/icons`).
  Names, layout, behaviour, shortcuts and colours may be reproduced.
- **Unofficial label.** Help > About must say "Unofficial hackathon recreation, not affiliated with or endorsed by Autodesk",
  and the README keeps the same disclaimer.
- **Read Fusion install files in place only.** The local install (webdeploy `production\<hash>\`: `TabToolbars.xml`,
  `MarkingMenus.xml`, `LightTheme.xbel`, string tables, QML) is evidence to read where it lives. Never copy those files, or
  reference captures, into the repo or the release.
- Evidence ledger: public Autodesk docs (shortcuts, navigation defaults, interface map, dialog fields) and the install
  files above are "observed"; anything else (marking-menu corner positions, default taper sign, default hole 5 x 10 mm, default
  fillet 1 mm) is "inferred" and should be re-checked before being relied on.

## Gotchas
- `R.makeThreePointArc` with collinear points crashes the wasm; `kernel.js` guards it. Keep the guard.
- Mesh `faceGroups[].faceId` / `edgeGroups[].edgeId` are hash codes; map through `shape.faces[i].hashCode` (done in `meshBody`).
- Take the sketch feature cache signature after solving, because the solver moves points.
- Region keys use curve id + traversal sense with a centroid tie-break; profile refs also store an interior point `c` as fallback.
- localStorage must always be wrapped in try/catch (sandboxed artifact iframe); files go through `app.download()`.
