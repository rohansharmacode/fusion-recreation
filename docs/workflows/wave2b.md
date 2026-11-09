# Wave 2b task entries (2026-11-09)

Builders: read `docs/workflows/agent-context.md` fully first. This file overrides it where they differ. Then do the entry
for your key.

## All builders (overrides and additions)
- Base commit of this wave: `e6b38c7` (green: engine tests and all 32 QA scenarios pass). `git diff e6b38c7 -- <path>` shows
  only wave 2b work.
- Components are DONE (not "being added"). Contract: ARCHITECTURE.md section Components, plus the `build:foundation-2`
  entry of `docs/wave1-reports.json`. In short: `doc.components`, `doc.occurrences`, `app.components.*`,
  `M.instanceBase` for instance ids such as "b1@o2", `M.moveOccurrence`, `M.occBodiesDeep(st, oid)`,
  `app.components.worldBodies(oid)`, `app.components.setDisplayTransform` then `clearDisplay` for motion. A pinned
  occurrence refuses `setTransform` unless `{force:true}`.
- Four builders work in the same tree at the same time: assembly, insertx, pcb, rough. The hard rules of
  agent-context.md apply (own files only, precise additive edits to shared files, no destructive git).
- Budget: this is ONE builder pass. No second pass follows. Do the commands in the order of your entry, finish each one
  fully (dialog, undo, save/open, test) before the next, and report honestly what is not done. A working, tested subset
  is better than a complete, broken set.
- Cloud features stay stubs (McMaster-Carr, cloud rendering, Data Panel). Where real Fusion reads from the cloud (Data
  Panel, linked designs), build the local-file equivalent: files through `<input type=file>` and `app.download()`.
- Report: write your final JSON report (the shape in agent-context.md, section Finish) to
  `docs/wave2b-reports/build-<key>.json`. Your final answer is then only: the report path, the count of implemented and
  not implemented ids, the test results (one line), and the known issues (one line each).

## assembly (ports 6000..6009)
Owned: `src/modules/assembly/*`, `tests/e2e/scenarios/assembly.mjs`.
Allowed shared edits: `src/modules/shell/toolbar.js` (panel swap, see 1), `src/modules/createx/bounding.js` and
`src/modules/createx/index.js` (only to remove the temporary rigid-group wrapper, see 4), small additive hooks in browser,
viewport and timeline where the existing APIs cannot do the job.

1. Design type. Fusion 2706 shows `PartAssemblePanel` (only Add To Assembly) for a Part Design and `AssemblePanel` (full
   list, spec.js line 423) for a Hybrid Design. The browser already labels a design with components "Hybrid Design"
   (src/modules/browser/index.js:247). Make the toolbar show `AssemblePanel` in place of `PartAssemblePanel` when the
   design has components, and make Add To Assembly (`NewAssemblyFromPartCommand`) real.
2. Joints: `JointAssembleCmdNew` (Joint), `JointAsBuiltCmd` (As-built Joint), `JointOrigin`. Joint types Rigid, Revolute,
   Slider, Cylindrical, Pin-slot, Planar, Ball; snap points on faces, edges and vertices; offsets, angle, flip; joint
   limits; animate preview; joint glyphs in the viewport; a Joints folder in the browser; timeline entries through
   `registerFeature`; Edit Joint, Edit Joint Limits, Suppress, Delete.
3. Motion: `FusionDragCompControlsCmd` (Component Drag toggle: drag respects the joint degrees of freedom),
   `FusionMoveJointsCommand` (Drive Joints), `FusionMotionRelationshipCommand` (Motion Link),
   `FusionMotionStudyCommand` (Motion Study with a keyframe editor and playback). An open kinematic chain must be exact;
   closed loops are best effort.
4. Groups and contact: `RigidGroupCmd` as a real feature. It replaces the temporary wrapper `installRigidGroups` in
   src/modules/createx/bounding.js (the Bounding Solid rigid group must keep working: test it). `EnableContactSetsCmd`,
   `EnableAllContactCmd`, `DisableAllContactCmd`, `ContactSetCmd` (contact stops a drag at first interference).
5. Component constraints (new in 2706): `AssemblyMateCommand` (Constrain Components), `AlignConstraintCmd`,
   `AngleConstraintCmd`, `MidplaneConstraintCmd` (Center), `TangentConstraintCmd`, `JointConstraintCmd`,
   `AsBuiltConstraintCmd`.
6. Analyses and the rest: `FusionDOFAnalysisCommand`, `FusionComponentConnectionAnalysisCommand`,
   `FusionEditComponentConnectionAnalysisCommand`, `FusionAssemblyStatisticsCommand`,
   `FusionDuplicateWithJointsCommand`.

## insertx (ports 6020..6029)
Owned: `src/modules/insertx/*`, `tests/e2e/scenarios/insertx.mjs` (the scenario `insert.mjs` exists already and belongs
to earlier work: keep it passing, do not rewrite it).

1. `FusionImportCommandFromToolbar` (Insert Component): insert a design from a local file (this app's own document
   format, and STEP if the existing import supports it) as a new component with an occurrence, with the Move
   manipulator that Fusion shows after an insert. Keep a link record (file name, version stamp) so that the browser
   shows the component as external.
2. Edit In Place toolbar (`EIPToolbar`, spec.js line 2425): `EIPNonAssociativeToggleCmd`, `EIPAssociativeToggleCmd`,
   `ReferenceObjectsCmd`, `EIPVisibilityControlCmd`, `EndEditInPlaceCmd`, for an external component from 1.
3. `PullDeriveCommand` (Insert Derive: pick a local design file, then choose bodies, components, sketches, construction
   geometry and parameters to derive; a Derive timeline feature) and `PushDeriveCommand` (Derive: send the selected
   objects to a new design file through `app.download`).
4. `FusionFastenersCommand` (Fasteners): a local library of standard fasteners (ISO and ANSI screws, bolts, nuts,
   washers) generated parametrically, placed on holes like Fusion (pick the hole edge or face, size from the hole,
   length choice, stack with washer and nut). `FusionFastenerStackAnalysisCommand` (Fastener Stack Analysis).
5. `FusionAddEditDecalCommand` (Decal): image from a local file on a face, with the move, rotate and scale
   manipulator, opacity, flip, chain faces; a Decals folder in the browser; Edit Decal; save/open keeps the image.
6. `ArrangeCommand` (Arrange: lay out bodies or components on a plane or sketch profile envelope, with spacing and
   rotation options), `SimilarPartsCommand` (Find Similar Components: compare inside the open design by a shape
   signature), `ReplaceWithPrimitivesCommand` (Replace with Primitives).
`InsertMcMasterCarrComponentCommand` stays a stub.

## pcb (ports 6040..6049)
Owned: `src/modules/pcb/*` (new module), `tests/e2e/scenarios/pcb.mjs`, plus one new file in each of
`src/modules/surface/`, `src/modules/sheetmetal/` and `src/modules/createx/` for the leftover stubs in 3.
Allowed shared edits: the module slot (see 1), and one import plus one init call in the `index.js` of surface,
sheetmetal and createx.

1. Module slot. Create `src/modules/pcb/index.js` with a valid `init(app)` FIRST. Only after that add `pcb` to
   `src/modules.js` (after insertx) and to `ALL_MODULES` in `scripts/build.mjs`, so that no other builder's build breaks.
2. PCB: `PCBCreateCmd` (Create 3D PCB), `PCBDeriveCmd` (Derive PCB from Sketch), `PCBExternalComponentCreationCmd`
   (Create Linked PCB: real Fusion links a cloud Electronics design; build the local equivalent or leave a stub with
   the reason). The PCB contextual environment (`PCBTab`, spec.js line 288, through `app.enterEnvironment`) with
   `PCBDefineBoardCmd`, `PCBImprintCmd`, `PCBBoardSketchEditCmd`, `PCBMoveComponentsCmd`, `PCBFlipComponentCmd`,
   `PCBStatusCmd` and `PCBStop` (Finish PCB). A PCB is a component with a board body (outline profile, thickness,
   holes and cutouts), shown in the browser and timeline like Fusion.
3. Leftover stubs from wave 2a:
   - `SurfPrimitiveBox`, `SurfPrimitiveCylinder`, `SurfPrimitiveSphere`, `SurfPrimitiveTorus`, `SurfPrimitiveCoil`,
     `SurfPrimitivePipe` (SURFACE > CREATE, spec.js line 701): the surface variants of the solid primitives (same
     dialogs, the result is a body of kind 'surface'). Reuse the solid primitive code.
   - `FusionSheetMetalCosmeticBendCmd` (Cosmetic Bend, spec.js line 1529).
   - `VolFieldModifyModelCommand` (Modify Model, spec.js line 1581).

## rough (ports 6060..6069)
Owned: no module folder. `tests/e2e/scenarios/rough.mjs`. This task is the rough edges in existing shared code, so
shared edits are the task itself: keep each edit small and precise, re-read each file right before the edit, and list
every edit in the report. Run the engine tests after every change to `src/model.js` or `src/kernel.js`.

1. Feature-face highlight. Hovering or selecting a timeline feature (and Edit Feature) highlights only the faces
   that the feature created or changed, like Fusion, not the whole body. Find the cheapest correct source of
   face-to-feature ownership (face history from the kernel, or a geometric comparison of the body before and after the
   feature, cached per rebuild).
2. Timeline dependencies for patterned features. A Rectangular, Circular or Mirror pattern of features must depend on
   its source features: reordering before the source is refused, deleting or suppressing the source gives the Fusion
   warning state on the pattern, and Edit Feature on the source recomputes the pattern.
3. Sweep along splines. Sweep must accept a spline path (sketch splines and spline edges), with the Fusion
   orientation options that the dialog offers already.
4. Faster modeled threads. A modeled thread costs about 0.5 s per turn today (src/modules/dialogs/README.md line 160).
   Find a faster construction (one helical sweep per thread, or a cached single-turn tool with a pattern) with the same
   geometry; measure before and after and put both numbers in the report.
5. `FusionManageThreadsLibraryCommand` (Manage Threads Library, spec.js line 1149): add, edit, copy and delete custom
   thread definitions; the Thread and Hole dialogs then offer them; the library is saved (localStorage in try/catch,
   plus export and import through files).

## Review prompt (one Haiku reviewer per area, after its builder finishes)
Review a code change with fresh eyes. Project: `C:/dev/fusion-recreation` (browser JavaScript, ES modules, three.js, an
OpenCascade wasm kernel). The change must do this: <one sentence>. Run `git status --short` and
`git diff e6b38c7 --stat -- <paths>`, then read the new and changed files one at a time (for a changed shared file read
only the diff). Report only defects that you can tie to a concrete input or user action: crashes, wrong logic or
geometry, broken undo/redo or save/open, leaks, unhandled errors, em dash characters (U+2014). Skip intended behaviour,
style, and code that the diff did not touch. For each finding give file, line, severity (high / medium / low),
confidence (high / low), the failing scenario in one sentence and a suggested fix. Do not edit files and do not run the
app. Write the findings as a JSON array to `docs/wave2b-reports/review-<key>.json` (an empty array if there are none)
and answer with only the count per severity.
