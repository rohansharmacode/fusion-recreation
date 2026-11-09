# Integration report (wave 1 + wave 2a review findings)

One line per review finding: area | file:line | fixed / rejected | short reason.

## configure
configure | src/modules/configure/index.js:386 | fixed | ctxTarget recursed forever on a selection ref of another kind (vertex); now recurses once only
configure | src/modules/configure/index.js:299 | fixed | validateExpr temp doc shared the live bodies, so applyRow wrote visibility/appearance into the live doc outside undo; the temp doc now gets per-body copies
configure | src/modules/configure/rules-ui.js:256 | fixed | empty tokens are dropped before Number(), so "10,20," no longer adds 0
configure | src/modules/configure/rules-ui.js:249 | fixed | the three em dash placeholders are now "-"
configure | src/modules/configure/dialogs.js:35 | fixed | comment now says what the stubbed-build fallback does (keeps configured aspects, configures the last)
configure | src/modules/configure/glyphs.js:23 | rejected | unused glyphs, harmless dead data
configure | src/modules/configure/style.css:123 | rejected | unused CSS rules, harmless
configure | src/modules/configure/data.js:259 | rejected | activate() is a tested data-layer API, kept
configure | src/modules/configure/rules.js:272 | rejected | redundant ternary gives the right value; style only
configure | tests/e2e/scenarios/configure.mjs:246 | fixed | /s+/g changed to /\s+/g (only affected the detail text)
configure | src/modules/configure/index.js:320 | rejected | duplication with menus/params.js; both work, refactor out of scope
configure | src/modules/configure/table.js:12 | rejected | duplicated small DOM helpers; style only

## inspect
inspect | src/modules/inspect/mesh.js:100 | fixed | parse3MF now follows build items, objects and component transforms (row-vector 3x4); falls back to raw meshes when a model has no build items
inspect | src/modules/inspect/surfanalysis.js:339 | fixed | geometries the new display no longer uses are disposed at the end of each refresh
inspect | src/modules/inspect/surfanalysis.js:654 | fixed | Accessibility depth maps are cached by direction + geometry ids and reused across slider ticks; unused ones are disposed
inspect | src/modules/inspect/curvature.js:78 | fixed | the Poly_Triangulation handle is deleted in finally
inspect | src/modules/inspect/mesh.js:340 | fixed | Edit with a new file drops the old doc.meshData record when nothing else refers to it
inspect | src/modules/inspect/mesh.js:180 | fixed | a read ticket ignores results of an older file pick
inspect | src/modules/inspect/analysis-cmds.js:204 | fixed | store.display is now created on first use, so Draft / Accessibility def() never sees null
inspect | src/modules/inspect/curvature.js:372 | rejected | only non-tangent edges scan two faces; the result is cached per mesh; no stall seen in tests
inspect | src/modules/inspect/materials.js:531 | rejected | identical ternary branches, style only
inspect | src/modules/inspect/materials.js:565 | fixed | one input listener (SELECT fires input), no double _edit
inspect | src/modules/inspect/materials.js:746 | fixed | the hidden file input is also removed on the cancel event
inspect | src/modules/inspect/analyses.js:13 | rejected | duplicated id/title tables, style only

## annotate
annotate | src/modules/annotate/format.js:148 | fixed | limit tolerances keep a valid 0; only an empty or invalid limit falls back to the nominal value (both limit styles)
annotate | src/modules/annotate/annotations.js:75 | fixed | a lost reference without f.plane uses the XY plane, so the note stays visible as an orphan with its warning (also gdtSpec)
annotate | src/modules/annotate/geom.js:398 | fixed | an empty wallEnds list now gives an open end instead of an infinite counterbore depth
annotate | src/modules/annotate/dlgkit.js:435 | fixed | the deferred listener install is skipped when the menu was already closed
annotate | src/modules/annotate/dlgkit.js:413 | rejected | second menu system is a duplication item; both work
annotate | src/modules/annotate/cmd-note.js:157 | rejected | duplicated row markup, style only
annotate | src/modules/annotate/cmd-dimension.js:155 | rejected | duplicated label map, style only
annotate | src/modules/annotate/cmd-gdt.js:115 | rejected | identical ternary branches, harmless
annotate | src/modules/annotate/cmd-gdt.js:15 | rejected | unused constant, harmless
annotate | src/modules/annotate/cmd-hole.js:17 | rejected | unused constant, harmless
annotate | src/modules/annotate/cmd-note.js:219 | rejected | unused re-export, harmless
annotate | src/modules/annotate/cmd-gdt.js:276 | rejected | unused re-export, harmless
annotate | src/modules/annotate/text.js:261 | rejected | empty branch documents the spanned-cell case, harmless
annotate | src/modules/annotate/text.js:84 | rejected | unused helpers, harmless
annotate | src/modules/annotate/icons.js:36 | rejected | unused helper, harmless
annotate | src/modules/annotate/format.js:105 | rejected | unreachable angle-precision branch kept for a future setting, harmless
annotate | src/modules/annotate/render.js:157 | rejected | write-only field, harmless
annotate | (cross-area 1a) src/modules/annotate/dlgkit.js:146 | fixed | the note textarea no longer stops Escape, so Esc closes General Note

## manage
manage | src/modules/manage/scripts/fusion.js:973 | fixed | UserParameter.expression setter rolls back to the old expression when the new one fails, like UserParameters.add
manage | src/modules/manage/scripts/host.js:152 | rejected | matches Fusion: command definitions live for the session, so adding the same id twice fails ("already exists"); scripts delete their definitions first, as in the Fusion samples
manage | src/modules/manage/select.js:447 | fixed | Include Boundary Objects now adds the picked boundary faces and edges themselves (Fusion tooltip: "include the boundary objects in the selection set")
manage | src/modules/manage/scripts/editor.js:49 | fixed | closing with X or Esc keeps the unsaved text as a draft that the next open restores (Modified marker shown); nothing is lost silently
manage | src/modules/manage/scripts/fusion.js:468 | rejected | duplication, style only
manage | src/modules/manage/features.js:21 | rejected | duplication, style only
manage | src/modules/manage/scripts/host.js:10 | rejected | duplication, style only
manage | src/modules/manage/features.js:310 | rejected | void-suppressed imports, style only
manage | src/modules/manage/features.js:111 | rejected | performance only (one prismatic test per run), results are right
manage | src/modules/manage/scripts/host.js:250 | fixed | DropDown item deleteMe() does nothing when the item is already gone
manage | src/modules/manage/scripts/host.js:183 | fixed | addCommand creates the panel dropdown array when it is missing
manage | src/modules/manage/scripts/host.js:78 | fixed | a throwing modal no longer stalls the message queue (toast fallback; showing set only after the modal opened)
manage | src/modules/manage/scripts/manager.js:251 | fixed | the hidden file input is also removed on cancel
manage | src/modules/manage/navigator.js:168 | fixed | the click that ends a pan drag no longer clears the selection
manage | src/modules/manage/pim.js:170 | fixed | Assign Item Number assigns every component in one undo step (per-row schemes kept)

## sketch
sketch | src/sketch/sketch.js:428 | fixed | Trim of a closed control point spline now opens it at the cuts (new ops2 splitClosedCv: exact B-spline segment over two periodic turns); Break of a closed one now works too (it returned null); engine tests added in tests/sketch3_test.mjs
sketch | src/modules/sketch/text.js:214 | fixed | the edit path keeps frameLines; the frame lines themselves are ordinary construction lines that stay when the text is deleted, so no orphan removal is added
sketch | src/sketch/ops2.js:97 | rejected | two parallel lines force the radius to half the gap; a typed radius cannot be met, so the forced radius is the only valid result
sketch | src/sketch/ops2.js:307 | fixed | Sketch Scale leaves curves with a fixed point unscaled (no radius / dimension scaling around a point that cannot move)
sketch | src/modules/sketch/env.js:491 | rejected | sketch points are collected by the pickablePoints loop right after, so they are window-selected
sketch | src/modules/sketch/importx.js:21 | fixed | the picker cancel event resolves null and removes the input
sketch | src/modules/sketch/include3d.js:115 | rejected | projected geometry here is a snapshot in both cases (no associative re-projection exists), so Projection Link has nothing to switch; documented limitation
sketch | src/modules/sketch/autoconstrain.js:116 | rejected | dead branch, harmless
sketch | src/sketch/curves.js:285 | rejected | duplication, style only
sketch | src/modules/sketch/patterns.js:43 | rejected | duplication, style only
sketch | src/sketch/ops2.js:444 | fixed | removePattern also deletes the copies' points that nothing else uses
sketch | package.json:15 | fixed | npm test now runs tests/sketch3_test.mjs (registry_test.mjs was already in it)

## foundation (components, model, viewport)
foundation | src/model.js:382 | rejected | by design (ARCHITECTURE.md): a root feature's scope is the root subtree, i.e. every component, like Fusion where a cut made with the root active lists bodies of all components in Objects To Cut; an active sub-component limits it to its subtree
foundation | src/model.js:1854 | rejected | the feature reports ok:false with "not available in this build" on the timeline; the state is not replaced, so later features evaluate on the previous state and only those that use its bodies fail (more honest than a silent ok:true)
foundation | src/modules/browser/index.js:587 | fixed | eye toggle, Show/Hide and Rename of a pasted-occurrence body ("b1@o2") act on its base body, which app.bodyMeta already shares (timeline/actions.js)
foundation | src/app/components.js:104 | rejected | kept as undoable, dirtying steps: no install or REFS evidence for a different Fusion behaviour, and Fusion records show/hide, rename and property edits as undoable changes that need a save
foundation | src/model.js:1673 | fixed | transformShape / transformMesh keep at most 6 matrices per input (LRU); dropped entries are left to replicad's GC finaliser instead of K.del, so a state that still holds one stays valid; a drag no longer grows the cache per pointer move
foundation | src/app/core.js:533 | fixed | lazy bodyMeta names use counters.bodyName like M.nextBody (and no longer bump the id counter)
foundation | src/modules/viewport/bodies.js:367 | fixed | one shared empty display entry for render-only bodies; render-hook extras are disposed when a body group is rebuilt or removed
foundation | src/modules/dialogs/cmd-component.js:186 | rejected | duplication, style only
foundation | src/modules/inspect/insert.js:18 | rejected | dead helpers, harmless
foundation | src/model.js:559 | fixed | meshDataOf keys by the record object first and otherwise by a full-string FNV hash (prefix/suffix fingerprints collided for local edits of same-size meshes)
foundation | src/app/components.js:53 | fixed | info(ROOT).T is a copy of IDENTITY
foundation | src/modules/configure/rules-ui.js:249 | fixed | same em dash item as configure (replaced by "-")

## solidx
solidx | src/modules/solidx/occ.js:219 | fixed | Replace Face extends only single-face targets; a body target (several faces) is used as it is instead of an enlarged copy of its first face
solidx | src/modules/solidx/occ.js:340 | fixed | handle drags are surface displacements: control displacements now solve the separable Bernstein system, so the face passes through the handle at its grid node (checked numerically: exact at the dragged node, 0 at the others)
solidx | src/modules/solidx/render.js:203 | fixed | dispose() also removes the preview-plane group and frees its geometry, materials and the dot texture
solidx | src/modules/solidx/refs.js:175 | rejected | unreachable (the dialog accepts circular edges only)
solidx | src/modules/solidx/faces.js:261 | fixed | Remove Features counts the features really removed (the one-at-a-time fallback stops at the first failure)
solidx | src/modules/solidx/automodel.js:88 | fixed | inputsKey includes Volume, so a Volume change marks the alternatives stale
solidx | src/modules/solidx/automodel.js:49 | rejected | replicad's scale() deletes the original wire (node_modules/replicad dist: this.delete()), no leak
solidx | src/modules/solidx/occ.js:56 | rejected | replicad's translate() deletes the untranslated solid, no leak
solidx | src/modules/solidx/refs.js:299 | fixed | spline, control point spline and conic paths are sampled on the real curve (sketch curvePolyline), not through their points
solidx | src/modules/solidx/faces.js:20 | rejected | dead code, harmless
solidx | src/modules/solidx/occ.js:320 | rejected | unused variable passed to K.del, harmless
solidx | src/modules/solidx/editface.js:30 | rejected | duplication, style only
solidx | src/modules/solidx/occ.js:376 | rejected | duplication, style only

## surface
surface | src/modules/surface/occ.js:384 | fixed | trimWire deletes the chain wires it does not use and gives a clear error for an empty path
surface | src/modules/surface/occ.js:494 | fixed | stitch deletes the face wrappers it drops and finds loose faces with one hash-bucketed pass (was faces x shells x faces)
surface | src/modules/surface/occ.js:658 | fixed | untrim keepHoles keeps every wire except BRepTools.OuterWire (the explorer's first wire is not always the outer one); unused wrappers are deleted
surface | src/modules/surface/occ.js:349 | rejected | closing a two-profile loft would run back over the same surface (A to B to A); Closed needs three or more profiles
surface | src/modules/surface/features.js:164 | fixed | sewnOrSingle deletes the parts after sewing (extrude, revolve, sweep, ruled)
surface | src/modules/surface/dlg-modify.js:325 | rejected | with Repair on, ShapeFix + sewing at the gap tolerance merges the edges below it, which is the count shown; with Repair off it shows 0 (the stale-text part is fixed under dlg-modify.js:303)
surface | tests/e2e/scenarios/surface.mjs:351 | rejected | checked by running: surface passes 72/72 including the 4000 mm^3 check after the edit
surface | src/modules/surface/occ.js:364 | fixed | sweepShell deletes the edge wrappers it explores
surface | src/modules/surface/occ.js:542 | fixed | thickenShape deletes its empty NCollection_List and the extra solidsOf wrappers
surface | src/modules/surface/occ.js:751 | rejected | identical branches, harmless
surface | src/modules/surface/occ.js:882 | fixed | a cell without a bounding box is skipped like a boundary cell
surface | src/modules/surface/occ.js:693 | rejected | no mergeFaces in surface/occ.js (stale reference); mergeApply calls a helper that returns its own result
surface | src/modules/surface/occ.js:1009 | fixed | min / max of the samples by a loop (spread overflowed the stack on large meshes)
surface | src/modules/surface/features.js:669 | fixed | new faceRefIndex() gives the index without a face wrapper (lines 589, 644, 669)
surface | src/modules/surface/features.js:772 | fixed | validateApply deletes the fixed face wrappers after stitching
surface | src/modules/surface/features.js:430 | rejected | the evaluator works on a cloned state and drops it when the feature fails, so removed tools come back
surface | src/modules/surface/features.js:510 | rejected | a body that cannot be split is skipped on purpose; the feature fails with a message when nothing splits
surface | src/modules/surface/dlg-create.js:404 | fixed | toolsKey uses the whole refs
surface | src/modules/surface/dlg-create.js:409 | rejected | every display path calls cellsOf() first, which returns the new cells, so a deleted shape is never drawn again
surface | src/modules/surface/dlg-modify.js:303 | fixed | the report cache key includes Repair
surface | src/modules/surface/dlg-modify.js:274 | rejected | a shelled body is a solid; splitting it with the silhouette surface gives the two shelled halves; separate inner-silhouette handling is a refinement, not a bug
surface | src/modules/surface/index.js:40 | rejected | the app is a singleton per page, so init runs once

## mesh
mesh | src/modules/mesh/brep.js:15 | fixed | Tessellate Normal Deviation is converted from degrees to radians for OCCT's angular deflection (replicad passes it through; its default 0.1 is radians); features.js:640 goes through the same function
mesh | src/modules/mesh/features.js:663 | rejected | Base Feature would need a stored B-rep without history, which the document format does not have; the result geometry is the same, so Parametric stands in for both
mesh | src/modules/mesh/features.js:348 | fixed | Preserve Shape projects only the vertices smoothing moved (boundary loops and relaxed rings)
mesh | src/modules/mesh/algo.js:74 | rejected | a same-cell hit is within about 1.7 x tol, and the weld tolerances are tiny (size x 1e-7); exact checking would need multi-entry cells for no visible gain
mesh | src/modules/mesh/algo.js:1002 | fixed | compactKeep drops the selection flags of dead / degenerate triangles the same way compact drops the triangles
mesh | src/modules/mesh/algo.js:952 | fixed | closestOnTri falls back to the nearest corner when a degenerate triangle gives a non-finite point
mesh | src/modules/mesh/algo.js:565 | rejected | performance only; hole loops of real meshes are small
mesh | src/modules/mesh/features.js:394 | fixed | the Erase And Fill patch takes the face group of the erased region
mesh | src/modules/mesh/features.js:607 | rejected | Fusion's Combine Face Groups does not require adjacent groups
mesh | src/modules/mesh/direct.js:124 | rejected | duplication, style only
mesh | tests/e2e/scenarios/mesh.mjs:238 | fixed | the Mesh Align check now requires the From face group to lie on XY (the "|| true" is gone)
mesh | (cross-area 1d) src/modules/mesh/features.js | fixed | Convert Mesh Organic is enabled: the mesh (quad pairs merged) becomes a T-spline cage converted with the Form module's cageToShape (smooth limit surface; up to 2,000 cage faces); e2e check added

## sheetmetal
sheetmetal | src/modules/sheetmetal/features.js:649 | fixed | flangeM composes the bends below an ancestor with an explicit placement onto that placement, so descendants of a flange detached by Rip stay in place (geom.js)
sheetmetal | src/modules/sheetmetal/convert.js:473 | fixed | reroot no longer clears the bend that the previous step of the walk gave the old child (trees deeper than one bend in Join by Bend)
sheetmetal | src/modules/sheetmetal/features.js:580 | fixed | collinear lines in a contour flange merge into one straight segment (convert.js applyContour), so no segment has a null turn
sheetmetal | src/modules/sheetmetal/flat.js:54 | fixed | DXF $INSUNITS is 1 for inches and 4 for millimetres
sheetmetal | src/modules/sheetmetal/convert.js:299 | fixed | an inside-out lofted flange solid is reversed (makeSolid([solid]) was wrong)
sheetmetal | src/modules/sheetmetal/convert.js:675 | rejected | Join by Bend corner relief geometry is not modelled; the stored choice is kept for when it is
sheetmetal | src/modules/sheetmetal/geom.js:526 | fixed | rebuild frees the parts made so far when a later piece throws
sheetmetal | src/modules/sheetmetal/features.js:259 | fixed | applyEdgeChain frees the cut and add tools made so far when a later edge throws
sheetmetal | src/modules/sheetmetal/flat.js:41 | fixed | loftFlat frees the previous flat solid when the body changed, like flatOf
sheetmetal | src/modules/sheetmetal/geom.js:642 | fixed | the no-op sort is removed
sheetmetal | src/modules/sheetmetal/index.js:127 | rejected | the DXF writer always writes polylines, which is the checked state; SPLINE entities are not written
sheetmetal | src/modules/sheetmetal/flat.js:86 | fixed | extents by a loop; an empty pattern gets 0 extents instead of Infinity
sheetmetal | src/modules/sheetmetal/geom.js:410 | rejected | the fallback to a full bend solid is deliberate and keeps the body valid; only holes inside that bend zone are lost
sheetmetal | src/modules/sheetmetal/convert.js:13 | rejected | duplication, style only
sheetmetal | src/modules/sheetmetal/convert.js:282 | rejected | an open shell makes makeSolid fail with a feature error, not a silent result
sheetmetal | src/modules/sheetmetal/convert.js:325 | fixed | the unfold walk throws a clear error instead of indexing past flatPos
sheetmetal | tests/e2e/scenarios/sheetmetal.mjs:183 | rejected | the restore is skipped only after a hard failure, which ends the scenario

## createx
createx | src/modules/createx/vox.js:21 | fixed | spacingFor starts at the spacing the volume allows (cbrt(volume / budget)) and grows up to 400 steps, so the node budget always holds
createx | src/modules/createx/bounding.js:480 | fixed | a grounded member holds its whole rigid group: no member moves unless forced (setTransform returns false)
createx | src/modules/createx/geopattern.js:127 | fixed | triangle / hexagon layouts estimate the lattice count first and refuse more than a million points before generating them
createx | src/modules/createx/lattice.js:167 | rejected | performance only: the custom cell signature is part of the cache key
createx | src/modules/createx/lattice.js:158 | fixed | the hidden uniform Solidity is not validated in gradient mode
createx | src/modules/createx/pathpattern.js:86 | fixed | instances past 999 get a separated id; smaller patterns keep their saved ids
createx | src/modules/createx/pathpattern.js:92 | fixed | missing bodies give a warning on the feature instead of a silent success
createx | src/modules/createx/geopattern.js:233 | rejected | stray assignment, harmless
createx | src/modules/createx/fluid.js:117 | fixed | every split piece is tracked from the start, so the error path frees the unexamined ones too
createx | src/modules/createx/csys.js:133 | rejected | identical branches and duplication, style only
createx | src/modules/createx/lattice.js:177 | rejected | duplicated constants, style only
createx | src/modules/createx/vox.js:304 | rejected | duplication, style only

## plastic
plastic | src/modules/plastic/features.js:197 | rejected | the depth + 1 tolerance is deliberate for open-ended pieces; no failing case found
plastic | src/modules/plastic/features.js:210 | fixed | a fillet warning is appended to a draft warning instead of replacing it
plastic | src/modules/plastic/features.js:265 | rejected | error path only; replicad's GC finaliser frees the temporaries
plastic | src/modules/plastic/features.js:812 | rejected | error path only; replicad's GC finaliser frees the temporaries
plastic | src/modules/plastic/features.js:1027 | rejected | an unused expression field with no UI, harmless
plastic | src/modules/plastic/index.js:26 | rejected | the evaluator's affected list already reports the bodies these features modify; touches() only adds bodies of failed features
plastic | src/modules/plastic/geom.js:311 | rejected | unused functions, harmless
plastic | src/modules/plastic/dialogs.js:56 | rejected | identical ternary branches, harmless
plastic | src/modules/plastic/features.js:66 | rejected | duplicated helper, style only
plastic | src/modules/plastic/schematics.js:5 | fixed | every schematic SVG gets its own marker id
plastic | src/modules/plastic/rules-ui.js:127 | fixed | the async row actions and New Plastic Rule report failures with a toast instead of an unhandled rejection
plastic | src/modules/plastic/dialogs.js:511 | rejected | in Automatic mode only the sketch of the ref is used (dlgPoints), the point id is a placeholder by design

## form
form | src/modules/form/ops.js:283 | fixed | Subdivide of a non-quad face with Count > 2 uses every edge point in its corner regions (the middle point is shared), so no T-junction cracks against the neighbours
form | src/modules/form/ops.js:549 | fixed | Erase And Fill finds each further hole again by vertex position after a collapse weld renumbers the cage
form | src/modules/form/cmd-modify.js:99 | rejected | exact mode refits the new points through their positions on the old edges; an exact fit would need projection onto the old limit surface (approximation, documented)
form | src/modules/form/cmd-create.js:313 | fixed | for T-Spline boundary edges the Direction, back distance and Angle rows are hidden (they do not apply), so nothing is ignored silently
form | src/modules/viewport/bodies.js:363 | fixed | render-hook extras (the cage display) are disposed when a body group is rebuilt or removed (same fix as foundation bodies.js:367)
form | src/modules/form/index.js:130 | rejected | checked: outside the form selection the generic Delete adds a Delete feature after the Form feature, so the body stays deleted on recompute
form | src/modules/form/cmd-edit.js:227 | fixed | a drag of another handle starts even when an earlier drag ended without a final callback
form | src/modules/form/cmd-edit.js:322 | fixed | Loop / Ring skip stale edge refs (edge index -1)
form | src/modules/form/cmd-create.js:350 | fixed | extrudeTsEdges reports a missing body or stale edge with a clear error
form | src/modules/form/brep.js:216 | rejected | evicted cache shapes may still be held by a state; replicad's GC finaliser frees them safely, K.del could free a live body
form | src/modules/form/brep.js:161 | fixed | the open-shell branch deletes the explorer shells after casting
form | src/modules/form/brep.js:213 | rejected | the limit points come from a dense subdivision; the 0.2% margin covers the bulge between samples in practice
form | src/modules/form/cmd-sym.js:78 | rejected | matches Fusion: Mirror / Circular - Duplicate make one T-Spline body holding the original and its copies (welded at the centre)
form | src/modules/form/common.js:113 | fixed | formChange is cleared before compute(), so a throwing compute cannot leave the previous change for OK
form | src/modules/form/cmd-util.js:190 | fixed | Convert of several bodies is one undo step (new addTSplineBodies)
form | src/modules/form/ops.js:341 | fixed | Insert Point replaces the crease pair of a split edge by its two halves
form | src/modules/form/ops.js:747 | rejected | the cage is a polygon mesh without T-points, so 0 is the true count
form | src/modules/form/cmd-create.js:118 | rejected | identical branches and import style, harmless
form | src/modules/form/cmd-util.js:90 | rejected | dead code and duplication, style only
form | src/modules/form/tsm.js:17 | fixed | TSM text keeps frozen and iso vertex lists (write and read; checked by a round trip)
form | tests/e2e/scenarios/form.mjs:301 | fixed | the Insert Point check requires exactly one more face

## Cross-area items
- a. annotate: the General Note text box no longer stops Escape (src/modules/annotate/dlgkit.js), so Esc closes the dialog; checked in a booted dev and release app (focus the text box, type, Esc: dialog closed).
- b. Line endings: the 64 files stored as i/crlf (`git ls-files --eol`) are LF in the working tree now (content unchanged; `git diff --ignore-cr-at-eol` shows only real edits). Note: core.autocrlf is true on this PC, so the other files are CRLF in the working tree and LF in the index, as before.
- c. Em dashes: none left in src, tests (outside tests/e2e/out), scripts, docs, README.md, ARCHITECTURE.md, index.html (28 files; " - " in log strings, ": " in prose, "-" for empty-value placeholders). The About disclaimer now reads "Unofficial hackathon recreation: not affiliated with or endorsed by Autodesk" (tests updated the same way).
- d. mesh: Convert Mesh Organic is wired (see the mesh section).
- e. Scope cut: src/modules/{animation,simulation,manufacture,generative} deleted, removed from src/modules.js and ALL_MODULES in scripts/build.mjs; the DESIGN switcher still lists those workspaces as placeholders (shell/workspace.js placeholder card).
- f. Cloud features: per the orchestrator's update, the local PIM* and TaskManagement* equivalents stay registered (approved by the user). No McMaster-Carr or cloud rendering implementation exists (insertx and render are empty placeholders); the Data Panel is the original shell stub panel (toasts only), so nothing else needed unregistering.
- g. createx rigid groups: kept and documented in ARCHITECTURE.md and the createx / assembly READMEs as a temporary hook that the wave 2b assembly module must replace.
- h. npm test runs tests/registry_test.mjs (already) and now tests/sketch3_test.mjs.

## Other fixes found while verifying
- tests/e2e/scenarios/robustness.mjs: the reset now leaves a contextual environment with its FINISH command (Create Form entered FORM, and Esc never leaves an environment in Fusion), so the 161 "not clean" probes after Create Form are gone. The expectation "Esc returns to model mode" was wrong for real Fusion inside an environment.
- src/modules/shell/index.js: in an opaque-origin sandbox (artifact hosts) the remote UI font is not requested; the strict CSP refused it and logged a console error (scripts/verify-release.mjs "artifact simulation: no console errors" failed).
- src/modules/createx/pathpattern.js: `warn` is `let` (the new missing-bodies warning reassigns it).
- READMEs added for icons and the wave 2b placeholders (assembly, drawing, insertx, render); mesh, solidx and createx READMEs follow the fixes.
- tests/e2e/scenarios/create-modify.mjs: the Thread "Modeled" step waits until the dialog really has Modeled on before OK (it failed once under load with removed=0; it passes alone and with the wait).

## Verification (2026-11-09)
- Engine tests: npm test (now with sketch3_test: 63 checks), tests/spline_test.mjs, tests/robust_test.mjs (119): all pass.
- QA suite (dev build, `--parallel=4`): 32/32 scenarios pass with zero console errors (run3); in the last full run (run4) create-modify failed once under extra load at the thread step, then passed 3 times alone (the last with the hardened wait).
- Release: `node scripts/build.mjs --release` gives exactly index.html, app.js (4,066,521 bytes), app.css, occt.gz.wasm. core-loop, modeling, sketch, foundation and components pass against release/ (QA_OUT=release, --no-build); scripts/verify-release.mjs --no-build: 36/36 (boot, round trip, sandboxed artifact simulation, zero console errors).
- Booted app: 1025 command ids, 497 real (17 hidden aliases / shortcut-only), 528 stubs: 61 in the Design workspace (assembly joints and analyses, insert tools, McMaster-Carr, render / decal / texture, PCB, surface primitives SurfPrimitive*, sheet metal cosmetic bend, volumetric modify), 467 in the placeholder workspaces (Generative 43, Render 4, Animation 11, Simulation 116, Manufacture 183, Drawing 110).
- Remaining gap noticed: SURFACE > CREATE primitives (SurfPrimitiveBox / Cylinder / Sphere / Torus / Coil / Pipe) are still stubs and are not in the surface builder's not-implemented list.

## Fresh-eyes review of the integration diff

13 findings: 3 confirmed and fixed, 10 discarded.

Fixed:
- src/modules/mesh/features.js:696-709 organicCage: a larger-index triangle was skipped even when its partner failed to form a quad, leaving a hole. Now only partners that really emitted a quad are skipped (a `merged` Set).
- src/modules/createx/lattice.js:163-166 gradient mode: startV and endV are now range-checked (solidity in (0,1) for TPMS cells, thickness > 0 otherwise), with the same messages as the uniform checks.
- src/modules/manage/scripts/editor.js:25,35-37,54 DRAFTS: a draft is stored as `{ base, text }` and used at open only when the script source still equals `base`; otherwise it is dropped.

Discarded:
- mesh/brep.js:15 angular tolerance: correct fix (Fusion normal deviation is in degrees, OCCT wants radians); QA passes.
- timeline/actions.js:81 occurrence body ids map to the base body: intended, occurrences share component body data.
- model.js:559 meshDataOf cache: records are created once per id (model.js:530-540) and never edited in place; collision risk negligible for a 32-entry cache.
- sketch/ops2.js:265 splitClosedCv: `cons` is the construction flag (a boolean), and orphan points are purged by trim (sketch.js:354) and break (sketch/tools2.js:490).
- createx/bounding.js:462 grounded rigid group does not move: matches Fusion (a grounded member holds the group).
- manage/select.js:445 boundary edges in the set: matches Fusion's include-boundary option; selection sets hold any ref kind.
- inspect/surfanalysis.js:873 try/finally: needs an exception in rendering, which is not expected; YAGNI.
- sheetmetal/convert.js:326 throw instead of break: a clear error is better than a silently wrong flat pattern.
- createx/geopattern.js:122 estimate factor: a rough hang guard at 1e6, far above the instance cap; precision does not matter.
- manage/navigator.js:158 panned flag: every pointerup recomputes it, so no click is swallowed.
