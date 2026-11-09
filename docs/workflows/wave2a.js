export const meta = {
  name: 'everything-wave2a',
  description: 'Wave 2a: surface, mesh, sheet metal, plastic, create extras, modify/construct extras, form builders (registry only), cheap review each, one integration verify',
  phases: [
    { title: 'Build', detail: '7 parallel area builders' },
    { title: 'Review', detail: 'cheap fresh-eyes review of each area diff', model: 'haiku' },
    { title: 'Verify', detail: 'confirm review findings, full engine + e2e suite' },
  ],
}

const ROOT = 'C:/Users/rohan/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/scratch-workspaces/277da8b9-a5df-4bda-a412-d67d2fb496c0/195ff05d-3f34-4f32-95ee-4e7f8caef6d4/scratch-2026-11-08-0e6df6/fusion'
const INSTALL = 'C:/Users/rohan/AppData/Local/Autodesk/webdeploy/production/39e8a3d5e919c70b05ef3ebfe9c6bfc8d9ee001e'
const REFS = 'C:/Users/rohan/AppData/Local/Temp/claude/d91a8036ae0f6b97/34d5b802-0595-4038-8281-0afceb5b9339/scratchpad/fusion-refs'
const BASE = args && args.base ? args.base : 'e450b32'

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
const REVIEW = {
  type: 'object',
  properties: { findings: { type: 'array', items: { type: 'object', properties: {
    file: { type: 'string' }, line: { type: 'number' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] }, problem: { type: 'string' },
  }, required: ['file', 'line', 'severity', 'problem'] } } },
  required: ['findings'],
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

const ctx = (key, port) => `You are one of several engineers working IN PARALLEL on an unofficial browser recreation of Autodesk Fusion's Design workspace (a hackathon entry, live at https://rohansharmacode.github.io/fusion-recreation/). Stack: plain ES modules + DOM + three.js (Z-up, millimetres), OpenCascade through replicad (WebAssembly, main thread), bundled with esbuild. Goal: every command that is still a stub (it toasts "isn't available in this unofficial recreation yet") becomes a real, working implementation that matches real Fusion 2706 (Light Gray theme) as closely as possible: names, dialog inputs (labels, order, defaults, units), selection rules, live preview, browser and timeline entries, and results.

Project root: ${ROOT}  (git repo on branch main; Windows with Git Bash and PowerShell; Node 20+). Use absolute paths.
Read first: ARCHITECTURE.md (module contract, App API, refs, document format, test harness, and the NEW contracts: feature registry registerFeature + helpers, body kinds + registerBodyKind, contextual environments enterEnvironment, workspaces), src/modules/dialogs/README.md (dialog framework), and the code you build on. Reuse existing infrastructure (dialog framework, manipulators, selection, pick providers, viewport groups, kernel helpers, M.helpers). Timeline feature types MUST be added through registerFeature from your own module, not by editing the APPLY table in src/model.js.

TOKEN ECONOMY (the user asked to minimise token usage): work locally. Get dialog names, labels and tooltips from the local Fusion install and the refs below; use web lookups only when a command's dialog cannot be worked out locally, and then read only the one relevant page. Read large files in parts (grep, sed -n, head) instead of whole; never dump big outputs (pipe test output through tail; use --quiet); don't re-read files you already read; take screenshots only to check a visual result. No separate QA engineer will review your work, so test it yourself with the local harness, but efficiently.

Evidence (read in place, NEVER copy into the repo):
- Fusion install: ${INSTALL} . Fusion/UI/FusionUI/Resources/Toolbar/TabToolbars.xml (tabs, panels, ids; other Applications/*/UI/*/Resources/Toolbar/TabToolbars.xml files hold MESH and other environments), StringTable/en-US/*.xml and CommandDefinitions.xml (display names, tooltips, many dialog input labels: grep them), QML files.
- Screenshots of this machine's real Fusion: ${REFS} (01..33 *.jpg plus NOTES.md).
- src/modules/shell/spec.js (and the contextual tabs it now holds): toolbar placement and display names of every command id.

Hard rules:
1. File ownership: you OWN the files listed in your task; edit only those. Small additive edits to shared files (src/app/core.js, src/model.js, src/kernel.js, src/sketch/*, src/modules/dialogs/framework.js, src/modules/viewport/*, src/modules/browser/*, src/modules/timeline/*, src/modules/shell/*, package.json) only when truly unavoidable: precise Edit-tool replacements, never rewrite a shared file wholesale, keep existing behaviour and tests, list every such edit in your report. Others edit other files at the same time (including the foundation engineer, who is adding components to model.js, core.js, browser, viewport, timeline and dialogs right now): re-read a shared file right before editing it, keep every file syntactically valid (node --check), never revert or reformat code you did not write.
2. Register real commands with app.commands.register({...}) using Fusion's exact command id (the stub is replaced automatically); keep the toolbar placement from spec.js. Icons: original SVG only; put drawings in a file in your own folder and register them with registerIcons / registerFeatureIcons from src/modules/icons/icons.js.
3. A command is done only when it really works end-to-end like Fusion: dialog, selection, live preview where Fusion has one, OK/Cancel, undo/redo, save/open round-trip, Edit Feature from the timeline for timeline features, sensible errors. Leave a stub only if genuinely impossible in a browser, and justify it. Cloud-based features are deferred by the user: do not build them.
4. No Autodesk logos/wordmarks/icon artwork. Wrap localStorage in try/catch. Files only through app.download(); read files with <input type=file>.
5. No git commits, pushes, branch changes or deploys. Do not touch release/, build/pages-stage or other engineers' build directories.
6. No npm installs unless your task allows it. The release must stay exactly four files (index.html, app.js, app.css, occt.gz.wasm): inline any extra asset into app.js.
7. Keep the UI responsive; cache meshes; no heavy kernel work per pointer move.
8. Write src/modules/${key}/README.md: commands, data formats, API for other modules.
9. Never write the em dash character (U+2014) in code, comments, docs, test names or your report; use a comma, colon, full stop or brackets. Keep your report brief and factual.
10. Integration engineers may run the full test suite while you work. Keep the app free of console errors at all times: your module's init() must never throw, and an unfinished command must not log errors. Develop your QA scenario as a harness script under tests/e2e/out/${key}/ and copy it to tests/e2e/scenarios/${key}.mjs only once it passes. Put this line at the top of src/modules/${key}/index.js while you work and remove it when you finish: // UNDER ACTIVE DEVELOPMENT by the ${key} engineer: integration engineers, do not edit; stub this module with --only if it breaks a test.

Build and test with ONLY your own directories and ports (key: ${key}, ports ${port}-${port + 9}):
- Build: node scripts/build.mjs --out=build/${key}   (add --only=viewport,sketch,dialogs,inspect,shell,browser,timeline,menus,${key} to stub other modules if a parallel engineer has temporarily broken one).
- QA: QA_OUT=build/${key} QA_SHOTS=tests/e2e/out/${key} QA_PORT=${port} node tests/e2e/run-all.mjs <scenario...> [--no-build] --quiet
- Ad-hoc scripts under tests/e2e/out/${key}/ using launch({ outDir: "build/${key}", port: ${port + 9}, shots: "tests/e2e/out/${key}" }) from tests/e2e/harness.mjs; always close().
- Engine tests (when src/model.js, src/kernel.js or src/sketch/* changed): npm test, node tests/spline_test.mjs, node tests/robust_test.mjs.
- Split up or background commands longer than about 9 minutes.`

const tail = (key) => `
Finish with tests/e2e/scenarios/${key}.mjs driving your commands through the real UI and checking results (bodies, volumes, browser and timeline entries, undo, save/open); it plus core-loop, modeling, toolbar and undo-redo must pass with zero console errors. Work through the whole list. Final answer = the structured report (implemented ids that really work; notImplemented with reasons; sharedEdits; contracts; tests run and results; honest knownIssues).`

const AREAS = [
  {
    key: 'surface', port: 5700,
    task: `TASK: the SURFACE tab. Make every stub in the SurfaceCreatePanel and SurfaceModifyPanel real (check spec.js; ids placed only in the Form environment belong to the form engineer): surface Extrude / Revolve / Sweep / Loft (SurfaceExtrude, SurfaceRevolve, SurfaceSweep, SurfaceLoft; or the surface variants of the existing commands, whichever spec.js shows), Patch (FusionSurfacePatchCommand), Ruled (FusionSurfaceRuledCommand), Offset (FusionSurfaceOffsetCommand), Boundary Fill (SurfaceSculpt), Thicken (FusionSurfaceThickenCommand), Extend (FusionExtendCommand), Trim (FusionSurfaceTrimCommand), Untrim (FusionSurfaceUntrimCommand), Stitch (FusionSurfaceStitchCommand), Unstitch (FusionSurfaceUnStitchCommand), Merge (FusionSurfaceMergeCommand), Reverse Normal (FusionSurfaceReverseNormalCommand), Validate (FusionSurfaceValidateCommand), Silhouette Split (FusionPartingLineSplitCmd). Surface bodies use the 'surface' body kind. The wasm exposes BRepOffsetAPI_MakeFilling, BRepOffsetAPI_ThruSections, BRepBuilderAPI_Sewing, BRepOffsetAPI_MakeOffsetShape, BRepOffsetAPI_MakeThickSolid, BRepOffsetAPI_MakePipeShell, BRepAlgoAPI_Splitter, BRepAlgoAPI_Section, ShapeUpgrade_UnifySameDomain, ShapeFix_Solid, BRepBuilderAPI_MakeSolid (check node_modules/replicad-opencascadejs/dist/replicad_single.d.ts); add kernel helpers additively in src/kernel.js. Also make Extrude/Revolve/Sweep/Loft accept open profiles and surface output where Fusion does.`,
    owned: 'src/modules/surface/*',
  },
  {
    key: 'mesh', port: 5720,
    task: `TASK: the MESH tab. Make every ParaMesh* stub and the mesh-related stubs real: ParaMeshAlignCommand, ParaMeshAttractToReferenceCommand, ParaMeshBaseFeatureCreateCommand (Direct Edit), ParaMeshBridgeCommand, ParaMeshCalculateFaceGroupsCommand, ParaMeshCloseCracksCommand, ParaMeshCombineCommand, ParaMeshConvertCommand (mesh to faceted / prismatic B-rep), ParaMeshCreateFaceGroupCommand, ParaMeshEmptyBaseFeatureCommand, ParaMeshEraseAndFillCommand, ParaMeshExtractCommand (Separate), ParaMeshHollowCommand (Shell), ParaMeshMergeFaceGroupsCommand, ParaMeshPlanarSectionCommand (Create Mesh Section Sketch), ParaMeshPlaneCutCommand, ParaMeshReduceCommand, ParaMeshRemeshCommand, ParaMeshRemoveCommand, ParaMeshRepairCommand, ParaMeshReverseNormalsCommand, ParaMeshScaleCommand, ParaMeshShowSelectionPanelCmd (Mesh Palette), ParaMeshSmoothBoundaryCommand, ParaMeshSmoothCommand, ParaMeshTessellateCommand (B-rep to mesh), ParaMeshTextureCommand (Texture Extrude), ParaMeshToQuadMeshCommand, FacegroupsToggleCmd, FitCurvesToSectionCommand. Mesh bodies use the 'mesh' body kind (registerBodyKind); Insert Mesh already creates them. Write the mesh algorithms yourself in src/modules/mesh/ (half-edge or indexed structure, quadric reduce, isotropic remesh, Laplacian/Taubin smooth, hole fill, crack closing, plane cut, face groups by normal clustering, offset for hollow). You MAY add the npm package manifold-3d for robust mesh booleans, plane cuts and hollow if needed; inline its wasm into app.js (base64) so the release stays four files.`,
    owned: 'src/modules/mesh/*, package.json (only to add manifold-3d)',
  },
  {
    key: 'sheetmetal', port: 5740,
    task: `TASK: the SHEET METAL tab. Make every sheet-metal stub real: Sheet Metal Rules (FusionSheetMetalRulesCommand) and Rules Library (FusionSheetMetalRulesLibraryCommand) with Fusion's default rules (thickness, K-factor, bend radius, relief shapes and sizes, miter gap), Flange (FusionSheetMetalFlangeCommand: from a closed profile as a base flange and from edges as edge flanges, with height datum, bend position, bend angle, flip, chain), Hem (FusionSheetMetalHemFlangeCommand), Jog (FusionSheetMetalJogCommand), Lofted Flange (FusionSheetMetalLoftCommand), Rip (FusionSheetMetalRipCommand), Corner Closure (FusionSheetMetalCornerCommand), Sheet Metal Fillet / Chamfer (FusionSheetMetalFilletCommand, FusionSheetMetalChamferCommand), Unfold (FusionSheetmetalUnfoldCommand) and Refold (SheetMetalFoldCmd), Join by Bend (FusionJoinByBendCommand), Convert to Sheet Metal (ConvertToSheetMetalCmd), Create Flat Pattern (FusionSheetMetalFlatPatternCmd) with Fusion's flat pattern contextual environment (bend lines, extents, Export DXF through app.download). Sheet metal bodies are solids with meta.sheetMetal; track bends (axis, radius, angle, K-factor) in your own data so unfold is exact (developed length from the K-factor). Rules are document-level for now; leave a clear hook for per-component rules (components are being added in parallel).`,
    owned: 'src/modules/sheetmetal/*',
  },
  {
    key: 'plastic', port: 5760,
    task: `TASK: the PLASTIC tab and plastic-style solid features. Make these stubs real: Rib (FusionRibCommand), Web (FusionWebCommand), Emboss (EmbossCmd: emboss/deboss sketch profiles and text onto planar and curved faces, depth, wrap), Boss (FusionBossCommand), Lip (FusionLipCommand: lip and groove), Rest (FusionRestCommand), Snap Fit (FusionSnapFitCommand), Assign Plastic Rule (FusionAssignPlasticRuleCommand), Manage Plastic Rules (FusionManagePlasticRuleCommand) with Fusion's default plastic rules (nominal thickness, draft, radii, rib ratios). Add timeline feature types through registerFeature.`,
    owned: 'src/modules/plastic/*',
  },
  {
    key: 'createx', port: 5780,
    task: `TASK: the remaining SOLID Create tools (except the PCB tools, which wait for components): Bounding Solid (StockModelCommand), Fluid Volume (EnclosureCommand), Pattern on Path (PatternOnPath: bodies, faces and features along a sketch or edge path, orientation options), Geometric Pattern (FusionPatternGeometricCommand), Coordinate System (CoordinateSystemCommand), Volumetric Lattice (VolFieldCreateLatticeCommand: lattice infill of a body with cell type, size and beam thickness; generate the result as a mesh or solid body as Fusion does) and Volumetric Texture (VolFieldTextureCommand). Add timeline feature types through registerFeature.`,
    owned: 'src/modules/createx/*',
  },
  {
    key: 'solidx', port: 5800,
    task: `TASK: the remaining SOLID Modify and Construct tools: Offset Face (FusionOffsetFacesCommand), Replace Face (FusionReplaceFaceCommand), Split Face (FusionSplitFaceCommand), Edit Face (EditFaceCommand), Remove Faces (FusionRemoveFacesCommand, defeaturing: the wasm has no BRepAlgoAPI_Defeaturing, so remove faces and heal by extending neighbours / filling and sewing), Remove Features (FusionRemoveFeaturesCommand), Align (AlignCmd: bodies now; leave a hook for components), Create Base Feature (BaseFeatureCreationCommand: the Base Feature contextual environment with FINISH BASE FEATURE, non-parametric editing inside), Automated Modeling (AutomatedModelingCommand: generate connecting bodies between selected faces while avoiding bodies; a local version), and every remaining construction command: ConstructionAxisFromTwoPlanesCommand, ConstructionAxisNormalToFaceCommand, ConstructionAxisThroughCylinderCommand, ConstructionAxisThroughEdgeCommand, ConstructionAxisThroughTwoPointsCommand, ConstructionPlaneAlongPathCommand, ConstructionPlaneFromThreePointsCommand, ConstructionPlaneFromTwoEdgesCommand, ConstructionPlanePerpendicularToPlaneCommand, ConstructionTangentPlaneCommand, ConstructionPointAlongPathCommand, ConstructionPointAtEdgeAndPlaneCommand, ConstructionPointFromCircleOrSphereCommand, ConstructionPointFromPointCommand, ConstructionPointFromThreePlanesCommand, ConstructionPointThroughTwoEdgesCommand. Construction axes and points need new feature types (registerFeature), rendering and picking like Fusion, a Construction folder entry in the browser, and must be usable wherever Fusion accepts them (sketch planes, revolve/pattern axes, hole/point references): additive edits to the plane/axis resolution helpers in src/model.js are allowed for that, and the new plane variants may extend the existing cplane modes.`,
    owned: 'src/modules/solidx/*',
  },
  {
    key: 'form', port: 5820,
    task: `TASK: the Form (T-Spline) environment. Create Form (TSplineBaseFeatureCreationCommand) enters Fusion's FORM contextual environment (its tab layout is in spec.js; use app.enterEnvironment) and every command in that tab becomes real: primitives (Box, Plane, Cylinder, Sphere, Torus, Quadball, Pipe, Face; ids such as SurfPrimitiveBox / SurfPrimitiveCylinder / SurfPrimitiveSphere / SurfPrimitiveTorus / SurfPrimitivePipe / SurfPrimitiveCoil wherever spec.js places them), Extrude / Revolve / Sweep / Loft of T-splines, Edit Form (translate/rotate/scale manipulator on vertices, edges and faces, with selection modifiers like loop/ring and Alt-drag to extrude), Insert Edge, Subdivide, Insert Point, Merge Edge, Bridge, Fill Hole, Weld / Unweld Vertices, Crease / Uncrease, Bevel Edge, Slide Edge, Pull, Flatten, Match, Interpolate, Thicken, Freeze / Unfreeze, Symmetry (mirror internal, circular internal, mirror/circular duplicate, clear symmetry), Display Mode (box / control frame / smooth), Repair Body, Make Uniform, Convert (TSpline2BRepCommand: to a B-rep body; regular Catmull-Clark patches are bicubic B-splines, so build Geom_BSplineSurface patches or use GeomAPI_PointsToBSplineSurface and sew them; faceted fallback), Insert T-Spline (TSplineImportCommand: .tsm text format), FINISH FORM. T-spline bodies use the 'tspline' body kind (registerBodyKind); the form feature (Form1) is a timeline feature added through registerFeature whose result is the converted body when finished. Implement Catmull-Clark subdivision with creases yourself.`,
    owned: 'src/modules/form/*',
  },
]

const prompt = (a) => `${ctx(a.key, a.port)}

${a.task}

Files you own: ${a.owned}.
Foundation part 1 report (the contracts you build on; details in ARCHITECTURE.md): ${args && args.f1 ? args.f1 : 'see ARCHITECTURE.md'}
${tail(a.key)}`

const review = (key) => agent(`Review a code change with fresh eyes. Project: ${ROOT} (browser JavaScript, ES modules, three.js, an OpenCascade wasm kernel). Run git status --short -- src/modules/${key} tests/e2e/scenarios/${key}.mjs and git diff --stat ${BASE} -- src/modules/${key} , then read the new and changed files of src/modules/${key} and tests/e2e/scenarios/${key}.mjs one at a time. Find real problems only: bugs, crashes, wrong logic or geometry, broken undo/redo or save/open, event-listener or memory leaks, unhandled errors, code that cannot work, duplicated code, and em dash characters (U+2014). Do not edit files and do not run the app. Report each problem with file, line number, severity and one short sentence. Return an empty list if you find nothing.`, { label: 'review:' + key, phase: 'Review', schema: REVIEW, model: 'haiku' })

phase('Build')
const results = await parallel(AREAS.map((a) => async () => {
  const r = await agent(prompt(a), { label: 'build:' + a.key, phase: 'Build', schema: BUILD })
  if (!r) return null
  const rv = await review(a.key)
  return { key: a.key, ...r, findings: (rv && rv.findings) || [] }
}))

const brief = results.filter(Boolean).map((r) => ({ key: r.key, implemented: r.implemented, notImplemented: r.notImplemented, knownIssues: r.knownIssues, sharedEdits: r.sharedEdits }))
const reviews = Object.fromEntries(results.filter(Boolean).map((r) => [r.key, r.findings]))

phase('Verify')
const v = await agent(`${ctx('verify2a', 5900)}

ROLE: integration engineer for wave 2a. These areas were just built in parallel: ${JSON.stringify(brief)}. Other engineers (assembly, insert, rough edges) may be working in parallel in other module folders: leave folders whose index.js starts with "UNDER ACTIVE DEVELOPMENT" alone (stub them with --only if they break a test, and say so).
0. Cheap fresh-eyes reviewers flagged these possible problems (they can be wrong): ${JSON.stringify(reviews)}. Check each against the code, fix the real ones, and list in fixes which you fixed and which you rejected (one line each).
1. Run all engine tests (npm test, node tests/spline_test.mjs, node tests/robust_test.mjs) and the full QA suite: QA_OUT=build/verify2a QA_SHOTS=tests/e2e/out/verify2a QA_PORT=5900 node tests/e2e/run-all.mjs --parallel=4 --quiet (background + poll if it exceeds 9 minutes).
2. Fix every failure at its root cause with minimal edits (don't redesign others' work; fix code rather than weaken tests unless the expectation is wrong for real Fusion). Re-run until all pass with zero console errors. Confirm a release build (node scripts/build.mjs --release) still has exactly four files and boots without console errors.
3. Remove any leftover "UNDER ACTIVE DEVELOPMENT" header lines in the wave 2a module folders listed above.
4. In a booted app count app.commands.all() real vs stub and list the remaining stub ids.
Return the structured report.`, { label: 'verify2a', phase: 'Verify', schema: VERIFY })

return { brief, reviews, verify: v }
