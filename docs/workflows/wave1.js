export const meta = {
  name: 'everything-wave1-lean',
  description: 'Wave 1 (lean): resume foundation + sketch, inspect, manage, annotate builders from their partial work, then one integration verify',
  phases: [
    { title: 'Build', detail: 'foundation chain + 4 builders resume from partial edits' },
    { title: 'Review', detail: 'cheap fresh-eyes review of each area diff', model: 'haiku' },
    { title: 'Verify', detail: 'confirm review findings, full engine + e2e suite, regressions fixed' },
  ],
}

const ROOT = 'C:/Users/rohan/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/scratch-workspaces/277da8b9-a5df-4bda-a412-d67d2fb496c0/195ff05d-3f34-4f32-95ee-4e7f8caef6d4/scratch-2026-11-08-0e6df6/fusion'
const INSTALL = 'C:/Users/rohan/AppData/Local/Autodesk/webdeploy/production/39e8a3d5e919c70b05ef3ebfe9c6bfc8d9ee001e'
const REFS = 'C:/Users/rohan/AppData/Local/Temp/claude/d91a8036ae0f6b97/34d5b802-0595-4038-8281-0afceb5b9339/scratchpad/fusion-refs'

const BUILD = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    implemented: { type: 'array', items: { type: 'string' } },
    notImplemented: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'] } },
    sharedEdits: { type: 'array', items: { type: 'string' } },
    contracts: { type: 'string' },
    tests: { type: 'array', items: { type: 'string' } },
    knownIssues: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'implemented', 'notImplemented', 'sharedEdits', 'contracts', 'tests', 'knownIssues'],
}
const VERIFY = {
  type: 'object',
  properties: {
    summary: { type: 'string' }, engineTests: { type: 'string' }, e2e: { type: 'string' },
    fixes: { type: 'array', items: { type: 'string' } }, remainingFailures: { type: 'array', items: { type: 'string' } },
    realCommands: { type: 'number' }, stubCommands: { type: 'number' }, stubIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'engineTests', 'e2e', 'fixes', 'remainingFailures', 'realCommands', 'stubCommands', 'stubIds'],
}

const ctx = (key, port) => `You are one of several engineers working IN PARALLEL on an unofficial browser recreation of Autodesk Fusion's Design workspace (a hackathon entry, live at https://rohansharmacode.github.io/fusion-recreation/). Stack: plain ES modules + DOM + three.js (Z-up, millimetres), OpenCascade through replicad (WebAssembly, main thread), bundled with esbuild. Goal: EVERY command that is still a stub (it toasts "isn't available in this unofficial recreation yet") becomes a real, working implementation that matches real Fusion 2706 (Light Gray theme) as closely as possible: names, dialog inputs (labels, order, defaults, units), selection rules, live preview, browser and timeline entries, and results.

Project root: ${ROOT}  (git repo on branch main; Windows with Git Bash and PowerShell; Node 20+). Use absolute paths.
Read first: ARCHITECTURE.md (module contract, App API, refs, document format, test harness), src/modules/dialogs/README.md (dialog framework), and the code you build on. Reuse existing infrastructure (dialog framework, manipulators, selection, pick providers, viewport groups, kernel helpers). ARCHITECTURE.md gains new sections while you work (the foundation engineer documents new contracts there).

TOKEN ECONOMY (the user asked to minimise token usage): work locally. Get dialog names, labels and tooltips from the local Fusion install and the refs below; use web lookups only when a command's dialog cannot be worked out locally, and then read only the one relevant page. Read large files in parts (grep, sed -n, head) instead of whole; never dump big outputs (pipe test output through tail; use --quiet); don't re-read files you already read; take screenshots only when you need to check a visual result. No separate QA engineer will review your work, so test it yourself with the local harness, but efficiently.

Evidence (read in place, NEVER copy into the repo):
- Fusion install: ${INSTALL} . Fusion/UI/FusionUI/Resources/Toolbar/TabToolbars.xml (tabs, panels, ids; other Applications/*/UI/*/Resources/Toolbar/TabToolbars.xml files hold MESH and other environments/workspaces), StringTable/en-US/*.xml and CommandDefinitions.xml (display names, tooltips, many dialog input labels: grep them), QML files.
- Screenshots of this machine's real Fusion: ${REFS} (01..33 *.jpg plus NOTES.md).
- src/modules/shell/spec.js: toolbar placement and display names of every command id.

Hard rules:
1. File ownership: you OWN the files listed in your task; edit only those. Small additive edits to shared files (src/app/core.js, src/model.js, src/kernel.js, src/sketch/*, src/modules/dialogs/framework.js, src/modules/viewport/*, src/modules/browser/*, src/modules/timeline/*, src/modules/shell/*, package.json) only when truly unavoidable: precise Edit-tool replacements, never rewrite a shared file wholesale, keep existing behaviour and tests, list every such edit in your report. Others edit other files at the same time: re-read a shared file right before editing it, keep every file syntactically valid (node --check), never revert or reformat code you did not write.
2. Register real commands with app.commands.register({...}) using Fusion's exact command id (the stub is replaced automatically); keep the toolbar placement from spec.js. Icons: original SVG only; put drawings in a file in your own folder and register them with registerIcons / registerFeatureIcons from src/modules/icons/icons.js.
3. A command is done only when it really works end-to-end like Fusion: dialog, selection, live preview where Fusion has one, OK/Cancel, undo/redo, save/open round-trip, Edit Feature from the timeline for timeline features, sensible errors. Cloud-backed Fusion features get a faithful local equivalent. Leave a stub only if genuinely impossible in a browser, and justify it.
4. No Autodesk logos/wordmarks/icon artwork. Wrap localStorage in try/catch. Files only through app.download(); read files with <input type=file>.
5. No git commits, pushes, branch changes or deploys. Do not touch release/, build/pages-stage or other engineers' build directories.
6. No npm installs unless your task allows it.
7. Keep the UI responsive; cache meshes; no heavy kernel work per pointer move.
8. Write src/modules/<your module>/README.md (when you own a module): commands, data formats, API for other modules.
9. Never write the em dash character (U+2014) in code, comments, docs, test names or your report; use a comma, colon, full stop or brackets. Keep your report brief and factual.

Build and test with ONLY your own directories and ports (key: ${key}, ports ${port}-${port + 9}):
- Build: node scripts/build.mjs --out=build/${key}   (add --only=viewport,sketch,dialogs,inspect,shell,browser,timeline,menus,<your module> if a parallel engineer has temporarily broken a module you do not own).
- QA: QA_OUT=build/${key} QA_SHOTS=tests/e2e/out/${key} QA_PORT=${port} node tests/e2e/run-all.mjs <scenario...> [--no-build] --quiet
- Ad-hoc scripts under tests/e2e/out/${key}/ using launch({ outDir: "build/${key}", port: ${port + 9}, shots: "tests/e2e/out/${key}" }) from tests/e2e/harness.mjs; always close().
- Engine tests (when src/model.js, src/kernel.js or src/sketch/* changed): npm test, node tests/spline_test.mjs, node tests/robust_test.mjs.
- Split up or background commands longer than about 9 minutes.`

const RESUME = (key) => `RESUMING: an earlier engineer started exactly this task and was stopped after about an hour (to save tokens, not because of a problem). Their partial work is committed as WIP commit e450b32 (the last green commit is a000b92), so git diff a000b92 -- <your owned files> shows it (other engineers' changes are in the same diff, so look only at your files). Ignore docs/WIP.md, docs/wip-wave1-workflow.js and skill-log.md. Review it quickly, keep what is good, and finish the task. A tests/e2e/scenarios/${key}.mjs may already exist.`

const tail = (key) => `
Add or finish the QA scenario tests/e2e/scenarios/${key}.mjs that drives your commands through the real UI and checks results (bodies, volumes, browser and timeline entries, undo, save/open). Before you finish, your scenario plus core-loop, modeling, toolbar and undo-redo must pass with zero console errors. Work through the whole list. Final answer = the structured report (implemented ids that really work; notImplemented with reasons; sharedEdits; contracts other engineers can use; tests run and results; honest knownIssues).`

const AREAS = [
  {
    key: 'foundation', port: 5400,
    owned: 'src/model.js, src/app/core.js, src/app/layout.css, src/modules/shell/*, src/modules/viewport/*, src/modules/browser/*, src/modules/timeline/*, src/modules/menus/*, src/modules/inspect/mesh.js, src/modules/inspect/insert.js, src/modules/icons/*, ARCHITECTURE.md, and in part 2 also src/modules/dialogs/* for the New Component wiring',
  },
  {
    key: 'sketch', port: 5420,
    owned: 'src/sketch/*, src/modules/sketch/*, src/expr.js, package.json (only to add opentype.js and/or a font package), tests/sketch_*.mjs and a new tests/sketch3_test.mjs',
    task: `TASK: make every remaining SKETCH stub real, 1:1 with Fusion:
- 2-Tangent Circle (CircleTanTanRadius), 3-Tangent Circle (CircleThreeTangent), Conic Curve (ConicCurveCmd, Rho), Center Point Arc Slot (ShapeArcSlotCenterTwoPoint), Three Point Arc Slot (ShapeArcSlotThreePoint).
- Text (MTextCmd): text box, along path and fit-on-path types, font, height, bold/italic/underline, alignment, character spacing, angle, flip; real glyph outlines that become sketch profiles (Extrude works on text). You MAY add the npm package opentype.js and a small OFL-licensed font (e.g. Fira Sans) bundled as a module asset; try the Local Font Access API for installed fonts with the bundled font as fallback. Editable by double-click / Edit Text.
- Break (BreakSketchCmd), Sketch Scale (SketchScaleCmd), sketch Rectangular Pattern (RectangularSketchPatternCommand) and Circular Pattern (CircularSketchPatternCommand), editable.
- Intersect (IntersectCmd), Intersection Curve (IntersectionCurve), Project to Surface (ProjectToSurface), Include 3D Geometry (Include3DGeometry), Isoparametric Curve (SketchIsoparametricCurve), Spun Profile (SpunProfileCmd); add kernel helpers additively in src/kernel.js if needed.
- Control Point Spline (DrawCVMSpline3D) with degree option (new curve type such as 'cvspline'): solver, region, kernel wire, rendering, picking.
- Insert SVG (SketchImportSVG) and Insert DXF (ImportDxfFileCommand) with Fusion's dialogs and your own parsers.
- AutoConstrain (SketchAutoConstraintAndDimCmd), AutoConstrain from Datum (SketchAutoConstraintAndDimFromDatumCmd), Finish with AutoConstrain (SketchAutoConstrainAndFinish).
- Curvature constraint (ConstraintSmooth, G2) and Polygon constraint (SketchPolygonConstraintCmd).
- Tangent/curvature handles on fit-point splines; Offset of splines and ellipses.
Keep the solver robust (existing sketch tests). src/model.js and src/kernel.js are being changed concurrently by the foundation engineer: minimal additive edits only.`,
  },
  {
    key: 'inspect', port: 5440,
    owned: 'src/modules/inspect/* EXCEPT mesh.js and insert.js (foundation engineer)',
    task: `TASK: make every remaining INSPECT analysis real, 1:1 with Fusion: Zebra Analysis (FusionZebraAnalysisCommand), Draft Analysis (FusionDraftAnalysisCommand), Curvature Map Analysis (FusionCurvatureMapAnalysisCommand), Curvature Comb Analysis (FusionCurvatureCombAnalysisCommand), Isocurve Analysis (FusionIsoCurveAnalysisCommand), Environment Map Analysis (FusionEnvironmentMapAnalysisCommand), Accessibility Analysis (FusionAccessibilityAnalysisCommand), Minimum Radius Analysis (FusionMinimumRadiusAnalysisCommand), and Manage Materials (MaterialCommand).
Each analysis: Fusion's dialog inputs and defaults, a live on-canvas display (zebra stripes with direction/size/opacity; draft bands for a pull direction with legend; Gaussian/mean/max/min curvature map with legend and scale; curvature combs on edges and sketch curves with density/scale; U/V isocurves; reflected environment map; accessibility from a direction; minimum-radius highlighting), saved in the browser's Analysis folder (show/hide, edit, delete), persisted in the document, refreshed when the model changes. Curvature from the real surfaces (OCCT surface derivatives through additive kernel helpers), not only mesh normals. If the browser lacks a hook for Analysis folder items, add a minimal additive hook and list it.`,
  },
  {
    key: 'manage', port: 5460,
    owned: 'src/modules/manage/*',
    task: `TASK: make every remaining UTILITIES / MANAGE / AUTOMATION / SELECT stub real (check spec.js for each panel):
- Scripts and Add-Ins (ScriptsManagerCommand): Scripts and Add-Ins tabs, Create (JavaScript), Run, Edit (built-in code editor), Stop, Run on Startup; a JavaScript scripting API modelled on the Fusion API object model (adsk.core.Application.get(), activeProduct Design, rootComponent, sketches.add, sketchLines.addTwoPointRectangle / addByTwoPoints, sketchCircles.addByCenterRadius, Point3D.create, ValueInput.createByString/ByReal, extrudeFeatures.addSimple / createInput+add, fillets, userParameters.add / itemByName, ui.messageBox / inputBox ...) mapped onto the real model, so typical Fusion sample scripts run; scripts persisted in localStorage; sample scripts; a clear message if a strict CSP blocks eval.
- Fusion API (APIHelpCommand: public API reference in a new tab plus an in-app reference for this script API); Design and Make Marketplace (ExchangeAppStoreCommand: public store page in a new tab).
- Design Advice (DesignAdviceCmd: local checks for thin walls, tiny features, sharp internal corners, undercuts with results panel and highlighting), Find Features (FusionFindFeaturesCommand), Navigator (GraphViewCmd: dependency graph), Generate Timeline (TimelineBuilderCommand), Compute Unresolved (FusionComputeUnresolvedCommand).
- Select by Name (SelectByNameCommand), by Size (FusionSelectBodiesBySizeCommand), by Boundary (SelectByBoundaryCommand), Seed and Boundary (FusionSelectSeedAndBoundaryFacesCommand), Invert Selection (SelectByInvertCommand), Selection Filters (SelectionFilterCommand, consistent with the shell's selection-filters state).
- Local PLM/task equivalents stored in the document/localStorage: PIMAssignItemNumberCmd, PIMQuickReleaseCmd, PIMECOReleaseCmd, PIMGoToDashboardCmd, PIMGoToItemDetailsCmd, PIMGoToChangeOrderCmd, TaskManagementCreateTaskCmd, TaskManagementRelatedTasksCmd, TaskManagementOpenTasksCmd (local task board).`,
  },
  {
    key: 'annotate', port: 5480,
    owned: 'src/modules/annotate/*',
    task: `TASK: make Fusion's 3D annotation commands real: Note (LeaderLineNoteCommand), General Note (GeneralNoteCommand), Sizes and Dimensions (DimensionNoteCommand), Geometric Tolerancing (GeometricToleranceNoteCommand: feature control frames, datums), Hole/Thread Note (HoleThreadNoteCommand: reads hole/thread feature data). Annotations attach to faces/edges/points on annotation planes, follow the model (or show as orphaned), render like Fusion's (leaders, arrowheads, text style), are selectable/editable/deletable, appear in the browser where Fusion lists them, and persist in the document. Minimal additive browser hooks only.`,
  },
]

const F1_TASK = `TASK (foundation part 1 of 2). Everyone else's work depends on these contracts: design them carefully, document them in ARCHITECTURE.md with short examples, keep all existing tests green. Land part A first.
A. Feature-type registry: registerFeature(type, def) exported from src/model.js (also app.M.registerFeature) so modules add timeline feature types WITHOUT editing model.js. def: { label, stem?, fields? ({field:'length'|'angle'|'none'} expression fields -> parameters d1..), apply(st, f, P, doc), makesBodies? (bool | (f) => number|bool, core assigns newBody/newBodies), deps?(f) (timeline dependency refs), editor?(app, id), icon? }. Wire into FIELDS, TYPE_LABEL, NAME_STEM, APPLY, assignParams/BODY_TYPES, core prepareFeature/BODY_MAKERS, timeline labels/icons/deps, browser. Export evaluator helpers as helpers (fval, resolveFace, locateFace(s), locateEdge, resolvePlane, resolveRegion, profileGroups, applyOp, axisFromRef, bodiesBBoxCenter, ref refresh). Add tests/registry_test.mjs (node; kernel like tests/kernel2.mjs) to npm test.
B. Body kinds: doc.bodies[id].kind = 'solid' (default) | 'surface' (open OCCT shells/faces) | 'mesh' (triangle data {positions, indices, normals?, faceGroups?}, not OCCT) | 'tspline' (form module data rendered through a provider); sheet metal = solid with meta.sheetMetal. Define state representation, rendering (double-sided surfaces; mesh facets/edges like Fusion), picking (surface faces/edges/vertices; mesh triangles/face groups via new ref kinds like {kind:'meshFace', body, tri, group}), selection/highlight, browser folders and icons per kind as in Fusion, hide/isolate, Measure on solids, Properties/BOM, export (STL/STEP where meaningful), save/open. Migrate Insert Mesh (inspect/mesh.js + insert.js, yours) so STL/OBJ become real 'mesh' bodies (old docs with doc.meshes still open). Provide app.registerBodyKind(kind, hooks) (render/pick/bbox) for the mesh and form modules.
C. Contextual environments: app.enterEnvironment({id, mode, label, tab:{id,label,panels}, panels?, finishCommand, onExit}) / exitEnvironment(id) / app.environment; toolbar shows the contextual tab with Fusion's green-check FINISH <NAME> panel; when:<mode> commands become available; marking menu / S toolbox / shortcuts follow the mode; Esc/cancel like Fusion. Extract contextual tab layouts from TabToolbars.xml (Form/T-Spline, Sheet Metal flat pattern, Base Feature, Configure, any others) into spec.js like the existing CONTEXTUAL_TABS and register their ids as stubs.
D. Workspaces: the DESIGN switcher lists Fusion's workspaces in Fusion's order (Design, Generative Design, Render, Animation, Simulation, Manufacture, Drawing; verify locally). app.registerWorkspace({id, label, tabs, panels, enter, exit, timeline?, browser?}), app.setWorkspace(id), app.workspace, 'workspace' event; a workspace module supplies toolbar tabs/panels and can replace the bottom area. Unregistered workspaces show a clear placeholder. Extract each workspace's tabs/panels/ids/names from the install's other TabToolbars.xml files and string tables into src/modules/shell/workspaces-spec.js.
E. Document all contracts in ARCHITECTURE.md; QA scenario tests/e2e/scenarios/foundation.mjs.
Others are concurrently editing src/sketch/*, src/modules/sketch/*, src/modules/inspect/* (not mesh.js/insert.js), src/modules/{manage,annotate}/*; src/modules/configure/* is finished (its engineer made one-line edits in timeline/index.js and browser/index.js for 'Configure' context items: keep them).`

const F2_TASK = (r1) => `TASK (foundation part 2 of 2: components). Part 1 (report below; contracts in ARCHITECTURE.md) added the registry, body kinds, environments and workspaces. Now add Fusion's component model:
- Root component, components and occurrences ("Component1:1"), nested. Each component owns bodies, sketches, construction, origin; Fusion's browser tree (document > Document Settings, Named Views, Analysis, Origin, Joints, Sketches, Bodies, Component1:1 > ...), visibility/selectability, Activate Component (radio button + context command; inactive components fade), Ground/Unground, rename, isolate, delete, Create Components from Bodies, Copy/Paste and Paste New, occurrence numbering.
- New Component (FusionCreateNewComponentCommand: Empty Component / From Bodies, Parent, Name), extrude/primitive 'New Component' operation, Move/Copy of components (Capture Position / Revert prompt), features belong to the component they were created in (Fusion's timeline behaviour), Properties/BOM/material per component, component selection priority.
- Occurrence transforms that later features see (state tracks occurrence transforms and world-space bodies) plus a display-only transform override for motion/animation without re-evaluation.
- Document app.components (create, tree, occurrence(id), transform get/set, bodies of an occurrence, active component, events) in ARCHITECTURE.md for the assembly engineer who adds joints, joint origins, rigid groups, motion, contact and component constraints through the registry: (a) timeline features that set occurrence transforms during evaluation, (b) world-space geometry queries for any occurrence, (c) animation without recompute.
- Old documents still open; everything that works now keeps working (all existing scenarios). Add tests/e2e/scenarios/components.mjs.
Part 1 report: ${JSON.stringify(r1)}`

const prompt = (a, task, resume) => `${ctx(a.key, a.port)}

${resume ? RESUME(a.key) + '\n\n' : ''}${task}

Files you own: ${a.owned}.
${tail(a.key)}`

const REVIEW = {
  type: 'object',
  properties: { findings: { type: 'array', items: { type: 'object', properties: {
    file: { type: 'string' }, line: { type: 'number' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] }, problem: { type: 'string' },
  }, required: ['file', 'line', 'severity', 'problem'] } } },
  required: ['findings'],
}
const REVIEW_PATHS = {
  foundation: 'src/model.js src/app src/modules.js scripts/build.mjs src/modules/shell src/modules/viewport src/modules/browser src/modules/timeline src/modules/menus src/modules/inspect/mesh.js src/modules/inspect/insert.js src/modules/icons src/modules/dialogs tests/registry_test.mjs tests/e2e/scenarios/foundation.mjs tests/e2e/scenarios/components.mjs',
  sketch: 'src/sketch src/modules/sketch src/expr.js package.json tests/sketch3_test.mjs tests/e2e/scenarios/sketch.mjs',
  inspect: 'src/modules/inspect tests/e2e/scenarios/inspect.mjs',
  manage: 'src/modules/manage tests/e2e/scenarios/manage.mjs',
  annotate: 'src/modules/annotate tests/e2e/scenarios/annotate.mjs',
  configure: 'src/modules/configure tests/e2e/scenarios/configure.mjs',
}
const review = (key) => agent(`Review a code change with fresh eyes. Project: ${ROOT} (browser JavaScript, ES modules, three.js, an OpenCascade wasm kernel). Run git diff --stat a000b92 -- ${REVIEW_PATHS[key]} , then read the diff one file at a time (git diff a000b92 -- <file>). Find real problems only: bugs, crashes, wrong logic, broken undo/redo or save/open, event-listener or memory leaks, unhandled errors, code that cannot work, duplicated code, and em dash characters (U+2014) in added lines. Do not edit files and do not run the app. Report each problem with file, line number in the new file, severity and one short sentence. Return an empty list if you find nothing.`, { label: 'review:' + key, phase: 'Review', schema: REVIEW, model: 'haiku' })

phase('Build')
const configureReview = review('configure')
const reports = await parallel(AREAS.map((a) => async () => {
  if (a.key === 'foundation') {
    const r1 = await agent(prompt(a, F1_TASK, true), { label: 'build:foundation-1', phase: 'Build', schema: BUILD })
    if (!r1) return null
    const r2 = await agent(prompt(a, F2_TASK(r1), false), { label: 'build:foundation-2', phase: 'Build', schema: BUILD })
    const rv = await review(a.key)
    return { key: a.key, part1: r1, part2: r2, review: rv }
  }
  const r = await agent(prompt(a, a.task, true), { label: 'build:' + a.key, phase: 'Build', schema: BUILD })
  if (!r) return null
  const rv = await review(a.key)
  return { key: a.key, ...r, review: rv }
}))
const reviews = { configure: ((await configureReview) || {}).findings || [] }
for (const r of reports.filter(Boolean)) reviews[r.key] = (r.review && r.review.findings) || []

const brief = reports.filter(Boolean).map((r) => r.key === 'foundation'
  ? { key: 'foundation', implemented: [...r.part1.implemented, ...((r.part2 && r.part2.implemented) || [])], notImplemented: [...r.part1.notImplemented, ...((r.part2 && r.part2.notImplemented) || [])], knownIssues: [...r.part1.knownIssues, ...((r.part2 && r.part2.knownIssues) || [])], contracts: r.part1.contracts + '\n' + ((r.part2 && r.part2.contracts) || 'PART 2 FAILED') }
  : { key: r.key, implemented: r.implemented, notImplemented: r.notImplemented, knownIssues: r.knownIssues, sharedEdits: r.sharedEdits })

phase('Verify')
const v = await agent(`${ctx('verify', 5600)}

ROLE: integration engineer. These areas were just built in parallel in this working tree: ${JSON.stringify(brief)}. Also finished earlier: configure (Configure, configuration table, rules: ${args && args.configure ? args.configure : 'see src/modules/configure/README.md'}).
0. Cheap fresh-eyes reviewers flagged these possible problems per area (they can be wrong): ${JSON.stringify(reviews)}. Check each against the code, fix the real ones, and list in fixes which you fixed and which you rejected (one line each).
1. Run all engine tests (npm test, node tests/spline_test.mjs, node tests/robust_test.mjs, plus tests/registry_test.mjs and tests/sketch3_test.mjs if present) and the full QA suite: QA_OUT=build/verify QA_SHOTS=tests/e2e/out/verify QA_PORT=5600 node tests/e2e/run-all.mjs --parallel=4 --quiet (background + poll if it exceeds 9 minutes).
2. Fix every failure at its root cause with minimal edits (any file now; don't redesign others' work; fix code rather than weaken tests unless the expectation is wrong for real Fusion). Re-run until all pass with zero console errors. Then do a release build (node scripts/build.mjs --release) and run the core-loop, modeling, sketch, foundation and components scenarios against release/ (check run-all.mjs for the release flags) and confirm it boots without console errors.
3. In a booted app count app.commands.all() real vs stub and list remaining stub ids.
4. Make ARCHITECTURE.md's module and command-ownership tables list the new modules (manage, annotate, configure) and contracts; fix contradictions.
Return the structured report.`, { label: 'verify', phase: 'Verify', schema: VERIFY })

return { brief, reviews, verify: v }
