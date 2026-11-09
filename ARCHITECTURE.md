# Architecture & module contract

Browser recreation of Fusion's Design workspace. Plain ES modules + DOM + three.js, bundled by
esbuild. **No UI framework.** The OpenCascade kernel (replicad) runs on the main thread.

```
index.html                 shell markup: host elements (see "Hosts")
src/main.js                boot: inflate occt.wasm.gz -> initKernel -> new App -> module init() in order
src/app/core.js            App (document, evaluation, events, selection, commands, input, undo)  [orchestrator-owned]
src/app/layout.css         grid layout + theme tokens (CSS variables)                               [orchestrator-owned]
src/modules.js             module start-up order                                                     [orchestrator-owned]
src/modules/<name>/index.js   each UI module: `export function init(app)` (may be async)
src/modules/icons/icons.js    shared original SVG icon library (not an init module)
src/model.js kernel.js expr.js   parametric document + evaluator, replicad/OCCT wrapper, expression/ParamTable
src/sketch/                   solver.js (LM constraint solver + DOF), regions.js (profiles), sketch.js (model + ops),
                              curves.js (spline / ellipse / elliptical-arc geometry)
scripts/                      build.mjs (esbuild bundle, --release), serve.mjs (static server, --artifact),
                              verify-release.mjs (packaging checks), icon-gallery.mjs
tests/*.mjs                   Node engine tests;  tests/e2e/  headless Edge harness + QA scenarios
```

UI modules (start-up order in `src/modules.js`): `viewport`, `sketch`, `dialogs`, `inspect`, `shell`, `browser`,
`timeline`, `menus`. `icons` is a shared library, not a module. Files per module:
* viewport: index, camera, bodies, grid, highlight, origin, pick, selection, viewcube, navbar, navicons, navtools, menu
* sketch: index, env, tools, modify, freeform, constraints, dimension, snap, pick, render, hud, palette, status, ctx, glyphs
* dialogs: framework, manip, highlight, common, util, commands (registration), cmd-create / cmd-extrude / cmd-hole /
  cmd-modify / cmd-construct / cmd-coil-pipe / cmd-split-scale / cmd-thread, threads, cosmetic, glyphs, fallback (see its README.md)
* inspect: measure, section, properties, appearance, library, analyses, geom, overlay, ui, canvas (Insert Canvas),
  mesh + insert (Insert Mesh STL/OBJ), bom (Bill of Materials), interference
* shell: appbar, toolbar, menu, panels, tooltip, spec (toolbar layout), common, theme.css
* browser: index, ui, scene;  timeline: index, actions, deps;  menus: index, files, params, markingmenu, toolbox, shortcuts, info, modal, util
* icons: icons, draw, parts, ui, cmd-solid / cmd-sketch / cmd-other (original SVG only)

## Build, test, deploy
```
npm run build                  # node scripts/build.mjs          -> dist/ (all modules, sourcemaps)
npm run watch                  # rebuild on change
npm run release                # node scripts/build.mjs --release -> release/ (minified, tree-shaken, size report)
npm run analyze                # release build to build/analyze with per-package size of app.js
npm run serve                  # dist/ on :5173;  serve:release  release/ on :5174
npm run serve:artifact         # release/ on :5175 with strict CSP; open /__sandbox.html (sandboxed-iframe rehearsal)
npm test                       # engine tests: sketch_test, sketch_engine2, kernel_smoke, kernel2, dialogs_model
node tests/spline_test.mjs; node tests/robust_test.mjs   # extra engine tests (not in `npm test`)
npm run e2e                    # node tests/e2e/run-all.mjs: builds to build/qa, runs every QA scenario in headless Edge
npm run e2e:release            # same against release/ (--release --out=release)
npm run verify                 # scripts/verify-release.mjs: builds release/ and checks packaging + sandbox boot
node scripts/build.mjs --only=viewport,sketch --out=build/me   # other modules stubbed out
```
Release files (exactly four, each < 20 MiB): `index.html`, `app.js`, `app.css`, `occt.gz.wasm` (the OCCT wasm,
gzip'd under a `.wasm` name; main.js inflates it). Deploy: the contents of `release/` are published to the
`gh-pages` branch (GitHub Pages) at https://rohansharmacode.github.io/fusion-recreation/; the same four files also work as a claude.ai artifact.

### QA harness
`tests/e2e/run-all.mjs [scenario ...] [--parallel=N] [--no-build] [--quiet] [--headed] [--release --out=release]`.
Environment variables (read in `tests/e2e/lib.mjs`): `QA_OUT` build dir (default `build/qa`), `QA_SHOTS` screenshot
root (default `tests/e2e/out/qa`; results.json goes there), `QA_PORT` first server port (default 5318; parallel runs use consecutive ports).
Scenarios (`tests/e2e/scenarios/*.mjs`, 20): toolbar, core-loop, viewcube, marking-menu, toolbox, undo-redo, save-open,
parameters, browser, timeline, modeling, navigation, sketch, shortcuts, look, small-screen, robustness, create-modify,
insert, inspect. Each is `defineScenario({name, run(t)})` with helpers from `lib.mjs` (`t.check`, `t.app`, `t.key`, `t.fill`, `t.state`, ...).
`tests/e2e/refshots.mjs [--refs=<dir>] [--only=04,13] [--no-build]` reproduces real-Fusion reference captures through the UI and writes
`[ref | ours]` side-by-side composites to `tests/e2e/out/refpairs/` (reference folder: `$FUSION_REFS`). The older per-module
scripts in `tests/e2e/` (`boot.mjs`, `shell.mjs`, `dialogs.mjs`, ...) can still be run directly.
In your own scripts use `launch({ only, outDir: "build/<you>", port: <your port>, shots: "tests/e2e/out/<you>" })` from
`tests/e2e/harness.mjs`; it returns `{page, shot(name), frames(n), errors, close()}`. `window.app` is the App. Always `close()`.

## Hosts (`app.dom.*`)
`appbar, toolbar, workspace, canvasHost, browserHost, commentsHost, viewcubeHost, navbarHost, paletteHost,
dialogHost, timeline, overlay`. `overlay` is a fixed full-window layer (`pointer-events:none`; direct
children get `pointer-events:auto`) for menus, marking menu, toolbox, modals, tooltips, toasts.
`app.viewport.labelLayer` is a div over the canvas for HTML labels (dimensions, input boxes).

## Theme
Use the CSS variables in `src/app/layout.css` (`--c-panel`, `--c-border`, `--c-hover`, `--c-accent`, `--font-ui` …).
Every module imports its own CSS (`import "./style.css"` from its index.js; esbuild bundles it into app.css).
Prefix class names with your module (`tb-`, `br-`, `tl-`, `dlg-`, `sk-`, `vp-`, `mm-`).
**Never use Autodesk logos, wordmarks or icon artwork.** All icons are original SVG from `icons.js`.

## App (src/app/core.js)
```
app.doc                      plain JSON document (see "Document"); ALWAYS read through app.doc — it is replaced
                             on undo/redo/open. Never keep feature objects across mutations; keep ids.
app.feature(id) / featureIndex(id)
app.mutate(label, fn(doc), {recompute=true}) -> ret    one undoable change (snapshots doc), then recompute
app.addFeature(f, label) -> stored feature              inserts at marker, assigns id/name/params/body ids
app.updateFeature(id, patch, label) / deleteFeature(id) / setMarker(n)
app.recompute()              evaluate timeline -> app.result, emits 'model'
app.preview(f, {replaceId}) -> {result, feature}        tentative evaluation for live preview (emits 'model' {preview:true})
app.endPreview()             go back to the committed result
app.result                   {state:{bodies,sketches,planes}, results:{[featureId]:{ok,error?,warning?,tool?,rolled?,suppressed?}}, params}
app.bodies() -> [{id, shape, meta}]   app.body(id)   app.bodyMeta(id) -> doc.bodies[id] {name, visible, appearance, material}
app.sketchState(id) -> {id, plane, sk, regions, status}   app.planeState(id)   app.featureResult(id)
app.selection                {items, hover, filter, set/add/remove/toggle/clear/has/ofKind/setHover/accepts}
app.commands                 registry: register(def), run(id, ctx), get(id), has(id), all(), isEnabled(id), lastRepeatable
app.input                    pointer/keyboard handler stack: push(handler) -> pop(), dispatch(), top()
app.history                  undo(), redo(), canUndo(), canRedo()
app.featureEditors[type] = (app, featureId) => void     Edit Feature entry points; app.editFeature(id) calls them
app.mode 'model'|'sketch', app.activeSketch (feature id), app.setMode(mode, sketchId)
app.activeCommand            {id, ok(), cancel()} while a command dialog is open (set/cleared by the dialog framework)
app.appearances              {id: {name, color, metalness, roughness, opacity?}}
app.ui.<name>                public objects modules expose to each other (e.g. app.ui.dialog, app.ui.toolbar)
app.toast(msg, kind='info'|'error'|'warning', ms)
app.reportError(err, {where, logged})   non-fatal error -> de-duplicated, rate-limited toast (global safety net in main.js, input dispatch)
app.newDocument(name) / loadDocument(doc) / editFeature(id) / param(name)   document lifecycle, Edit Feature, parameter value
app.setStatus(text) / app.status   bottom-right canvas status text like Fusion ("1 Profile | Area : 800.00 mm^2", "Edge", "Body1"); emits 'status'
app.download(filename, Blob|string|Uint8Array, mime) -> Promise<bool>   the ONLY way to offer files (uses the artifact
                             `downloads` capability when present, else <a download>)
app.M / app.K / app.S / app.E   model.js / kernel.js / sketch.js / expr.js namespaces (K.R = replicad)
app.on(type, fn) -> off;  app.emit(type, detail)
```

### Events
| event | detail | emitted by |
|---|---|---|
| `ready` | | main.js after all modules started |
| `model` | `{result, preview, feature?}` | core after every evaluation |
| `doc` | `{label?, replaced?}` | core after a mutation / doc replace |
| `selection` / `hover` | `{items}` / `{ref}` | core Selection |
| `mode` | `{mode, sketch}` | core setMode |
| `commands` | `{id}` | registry (a command was registered) |
| `command-start` | `{id, def}` | registry before running a feature/tool command — open dialogs & sketch tools cancel themselves |
| `input`, `history` | | core |
| `camera` | | viewport after each rendered frame where the camera/scene changed (reposition HTML labels) |
| `canvas-contextmenu` | `{x, y, clientX, clientY, ctx}` | viewport when a right-click was not consumed by an input handler |
| `dialog` | `{open, id}` | dialog framework |
| `layout` | `{}` | any module that shows/hides a panel |
| `status` | `{text}` | core setStatus (viewport renders it bottom-right of the canvas) |
| `file` | `{action:'save'|'open'|'new'|'export', name, ...}` | menus file operations |
| `marking-menu` | `{open}` | menus |
| `shortcuts` | `{env}` | menus (shortcut bindings changed/reset) |
| `selection-filters` | `{filters}` | shell toolbar (Select panel priority filters) |
| `viewport-visibility` / `viewport-grid` | object visibility / grid prefs | viewport |
| `analyses` / `insert` | `{}` | inspect (analysis list changed / canvas or mesh inserted) |

### Refs (selection / hover / pick results)
```
{kind:'body', body}
{kind:'face', body, index, p:[x,y,z], n:[x,y,z], planar, sig?}  p = picked point on the face, n = normal there
{kind:'edge', body, index, p:[x,y,z], sig?}                    p = point on the edge (midpoint when not picked)
{kind:'vertex', body, p}
{kind:'profile', sketch, key, c:[u,v]}                         sketch = sketch feature id; key/c from sketch regions
{kind:'sketchCurve', sketch, curve} {kind:'sketchPoint', sketch, point} {kind:'sketchDim', sketch, cid}
{kind:'originPlane', name:'XY'|'XZ'|'YZ'} {kind:'originAxis', name:'X'|'Y'|'Z'} {kind:'originPoint'}
{kind:'cplane', id}  {kind:'feature', id}
```
`refKey(ref)` (exported from core.js) gives a stable identity string.

Feature face/edge refs stored in the document are `{body, p[, n][, sig]}`. `sig` is **derived, optional** data written by
`model.js` on every successful resolve (`K.edgeSignature` / `K.faceSignature`: curve/surface type `t`, relative position `q`
in the body box, direction/axis `d`/`a`, radius `r`, adjacent-face types and normals `f`). Later evaluations re-find the entity
by `sig` first (`K.matchEdge` / `K.matchFace`), then by nearest point to `p`, and move `p`/`n` back onto the entity. Refs without
`sig` (old documents, fresh picks) fall back to nearest-point and get one on first resolve. Never author `sig` by hand.

### Commands
`register({id, label, tooltip?, icon?, shortcut?: "E" | ["Ctrl+Z"], when?: 'model'|'sketch', kind?: 'feature'|'tool'|'view'|'ui', stub?, run(app, ctx), enabled?(app), checked?(app)})`.
* Use **Fusion's own command ids** (from `TabToolbars.xml`, table below). A real registration replaces a stub; a
  stub never replaces a real command. `kind:'feature'|'tool'` fires `command-start` (cancels open dialogs/tools);
  `'view'|'ui'` do not (orbit, fit, toggles, menus).
* Shortcut strings are produced by `keyString(ev)`: modifiers `Ctrl+Alt+Shift+` then key (`E`, `Delete`, `Escape`,
  `1`, `[`). Core dispatches shortcuts globally (not while typing in inputs) preferring commands whose `when`
  matches `app.mode`.

### Input routing
The viewport owns canvas DOM events. Navigation is consumed first (MMB pan, Shift+MMB orbit, wheel zoom,
double-MMB fit, trackpad gestures). Everything else is dispatched to `app.input` from the top of the stack down:
`onPointerDown/onPointerMove/onPointerUp/onDoubleClick/onContextMenu(ev, ctx)`, `onKeyDown(ev)`, `onCancel()`
(Esc). Return `true` to consume; `modal:true` blocks fall-through. `ctx = {x, y, button, shift, ctrl, alt, ray:{o,d}, hit}`
where `hit` is a lazy `viewport.pick(x, y, {filter: app.selection.accepts})`. The bottom handler is the viewport's
selection handler (click select, Ctrl/Shift toggle, hover, window select). Esc order: input handlers → active
command dialog cancel → clear selection.

## Viewport (`app.viewport`, owned by the viewport module)
World is **Z-up, millimetres**. Plane objects are `{o, x, n}` with `y = cross(n, x)` (`K.planeY`).
```
THREE, renderer, scene, canvas, camera (getter), target (getter [x,y,z])
groups: {bodies, sketches, construction, origin, preview, overlay}     THREE.Group per layer
labelLayer                          HTML div over the canvas
requestRender()
ray(x,y) -> {o,d}                   x,y = CSS px relative to the canvas
rayPlane(x,y, plane) -> {world, uv:[u,v], t} | null
toScreen([x,y,z]) -> [x,y,depth]    pixelSize([x,y,z]) -> mm per CSS pixel at that point
pick(x,y,{filter, kinds}) -> hit|null    pickAll(...) -> hits sorted best-first
   hit = {ref, point:[x,y,z], depth, screenDist, type:'point'|'curve'|'area'}
   ranking: 'point' hits (≤7px) > 'curve' hits (edges, sketch curves ≤5px) > 'area' hits (nearest depth)
addPickProvider(fn(x, y, ray, opts) -> hits[]) -> remove()       (sketch module registers one)
lookAt(plane, {animate=true}) -> Promise      camera looks along -n with plane y up (Look At / sketch entry)
setView(name, {animate})   'home','top','bottom','front','back','left','right' (+ ViewCube corners/edges)
fit({animate})
setPreview([{shape, color:'cut'|'new'|'#hex', opacity}]) / clearPreview()    transient tool bodies
setOriginVisible(bool)    temporarily show origin planes/axes for picking (Create Sketch)
meshFor(shape) -> cached K.meshBody() data
```
Standard views (Z-up): Front looks from −Y, Right from +X, Top from +Z, Home = iso from (+x, −y, +z).
Body visibility: `doc.bodies[id].visible`; sketches/planes: `feature.visible !== false`; origin: `doc.origin.visible`.

## Document (src/model.js)
`doc = {version, name, units:'mm', params:[{name, expr, kind, comment}], features:[...], marker, bodies:{id:meta}, counters, origin:{visible}, canvases?, meshes?}`
(`canvases` = Insert Canvas images, `meshes` = Insert Mesh STL/OBJ bodies; document data, not timeline features).
Numeric feature fields are **expression strings** (`"10 mm"`, `"d1/2"`, `"30 deg"`) evaluated by the
ParamTable; `M.assignParams` gives each a model parameter name stored in `f.p[field]` (d1, d2 …).
Feature shapes (all have `id, type, name`; `suppressed`, `visible` optional):
```
sketch   {plane:{o,x,n}, planeRef:{kind:'origin',name}|{kind:'face',body,p,n,plane}|{kind:'cplane',id}, sk, visible}
         sk = {points:{id:{x,y,fixed?}}, curves:{id:{type:'line'|'circle'|'arc'|'point'|'spline'|'ellipse'|'earc', cons, ...}}
         line p1,p2 | circle c,r | arc c,p1,p2 | spline pts:[pointIds],closed?,tan0?,tan1? (fit-point, C2 cubic) |
         ellipse c,a,b (centre + two axis end points) | earc c,a,b,p1,p2 (elliptical arc); geometry in src/sketch/curves.js, constraints:[{id,type,refs,expr?,param?,dimType?}], nid}
         constraint types: coincident onCurve midpoint horizontal vertical parallel perpendicular collinear equal
         concentric tangent symmetric fix distance pointLine diameter radius angle (+ internal `grab` drag residual)
extrude  {profiles:[{sketch,key,c}], faces:[{body,p,n}], distance, dirType:'one'|'two'|'sym', distance2,
          symMeasure:'half'|'whole', extent:'distance'|'all', taper, taper2, startType:'profile'|'offset', startOffset,
          flip, operation:'join'|'cut'|'intersect'|'new'|'newComponent', bodies:[participant body ids]}
revolve  {profiles, axis:{kind:'origin',name}|{kind:'sketchLine',sketch,curve}|{kind:'edge',body,p}, revType:'angle'|'full', angle, dirType, angle2, operation}
fillet   {edges:[{body,p}], radius, tangentChain}      chamfer {edges, distance, tangentChain}
shell    {faces:[{body,p,n}], bodies, thickness, direction:'inside'|'outside'}
draft    {faces, plane:planeRef, angle}
hole     {placement:'points'|'face', sketchPoints:[{sketch,point}], points:[[x,y,z]], normal, diameter, depth, extent,
          drillPoint:'angle'|'flat', tipAngle, holeType:'simple'|'counterbore'|'countersink', cbD, cbDepth, csD, csAngle, flip}
box/cylinder/sphere/torus  {plane:planeRef, center:[u,v], length,width,height | diameter,height | diameter | d1,d2, operation}
cplane   {mode:'offset'|'angle'|'midplane', base:planeRef, offset, axis, angle, base2}
rpattern {bodies, dir1, q1, d1, dir2, q2, d2, distType:'spacing'|'extent'}   cpattern {bodies, axis, count, angle}
move     {bodies, tx,ty,tz, rx,ry,rz, copy}   mirror {bodies, plane, operation}   combine {target, tools, operation, keepTools}
loft     {profiles, ruled, operation}   sweep {profile, path:{sketch, curves}, operation}   delete {bodies}
split    Split Body   coil {diameter, revolutions, height, pitch, angle, sectionSize, ...}   pipe {distance, sectionSize, thickness, ...}
scale    {factor | sx,sy,sz}   thread {length, offset, ...}  (modeled + cosmetic threads, dialogs/threads.js)
```
Feature types (`FIELDS` / `TYPE_LABEL` in model.js): sketch, extrude, revolve, fillet, chamfer, shell, hole, box, cylinder,
sphere, torus, cplane, rpattern, cpattern, move, mirror, combine, loft, sweep, delete, draft, split, coil, pipe, scale, thread.
`FIELDS[type]` lists the expression-valued fields and their kind (`length`|`angle`|`none`); each gets a model parameter (d1, d2 ...).
planeRef for a planar face: `{kind:'face', body, p, n, plane:{o,x,n}}` (use `K.planeFromNormal(p, n)`).

## Command ownership (Fusion ids from the local install's TabToolbars.xml)
At runtime 456 ids are registered: 220 real commands, 217 stubs (`stub:true`, toast "isn't available in this unofficial recreation yet"),
the rest hidden aliases. A real registration replaces a stub; a stub never replaces a real command. Registration sites:
`app.commands.register`, the `reg(...)` helpers in sketch/menus/shell/timeline `index.js`, and `C(...)` in `dialogs/commands.js`.
| module | command ids |
|---|---|
| sketch | SketchCreate, SketchStop (Finish Sketch), SketchActivate, SketchLookAt, DrawPolyline (L), SketchMidpointLine, ShapeRectangleTwoPoint (R), ShapeRectangleThreePoint, ShapeRectangleCenter, CircleCenterRadius (C), CircleTwoPoint, CircleThreePoint, CircleElipse, ArcThreePoint, ArcCenterTwoPoint, ArcTangent, ShapePolygonCircumscribed, ShapePolygonInscribed, ShapePolygonEdge, ShapeSlotCenterToCenter, ShapeSlotOverall, ShapeSlotCenterPoint, DrawPoint, DrawSpline (fit point), BlendG1CurveSketchCmd, MirrorSketchCommand, ProjectNewCmd (P), SketchDimension (D), FilletSketchCmd, ChamferSketchEqualDistance / DistanceDistance / DistanceAngle, TrimSketchCmd (T), ExtendSketchCmd, Offset (O), ConstraintHorizontalVertical, ConstraintCoincident, ConstraintTangent, ConstraintEqual, ConstraintParallel, ConstraintPerpendicular, ConstraintFix, SketchFixConstraintCmd, ConstraintMidPoint, ConstraintConcentric, ConstraintCollinear, ConstraintSymmetry, SketchConstructionCmd (X), SketchDeleteCmd |
| dialogs | Extrude (E), Revolve, Sweep, SolidLoft, FusionHoleCommand (H), PrimitiveBox / Cylinder / Sphere / Torus / Coil / Pipe, FusionThreadCommand, PatternRectangular, PatternCircular, MirrorCommand, FusionPressPullCommand (Q), FusionFilletEdgesCommand (F), FusionChamferCommand, FusionShellBodyCommand, FusionDraftCommand, FusionCombineCommand, ModifyScale, FusionSplitBodyCommand, FusionMoveCommand (M), FusionDeleteCommand, ConstructionPlaneOffsetFromPlaneCommand (+ WorkPlaneOffsetFromPlaneCommand alias), ConstructionPlaneAtAngleCommand, ConstructionMidPlaneCommand |
| inspect | MeasureCommand (I), FusionHalfSectionViewCommand, FusionCenterOfMassCommand, AppearanceCommand (A), PhysicalMaterialCommand, FusionPropertiesCommand (+ hidden aliases), FusionAddCanvasCommand, ParaMeshInsertAlignCommand (Insert Mesh), InterferenceCheckCommand, MaterializedBomHybridCmd (Bill of Materials) |
| viewport | Orbit / FreeOrbit / ConstrainedOrbit, Pan, Zoom, ZoomWindow, Fit, LookAtCommand, ViewDisplay / VisualStyle / Env / Effect / GraphicsPreset / GroundPlane commands, ViewCamera* (ortho / perspective), ViewVisibility* (origins, bodies, sketches, planes, ShowAll, HideAll), VisibilityOverrideCommand, grid and snap commands (ViewLayoutGrid*, DefineGridCmd, ToggleGridSnapCommand, SetSnapValueCmd, ToggleIncrementalMoveCmd), SingleViewCmd / MultiViewCmd / SplitView*, ShowWorkspaceFullScreen / Normal, ViewCube* (GoHome, SetHome*, ResetHome), ToggleViewCube (Ctrl+Alt+V), ToggleNavBar (Ctrl+Alt+N), Show/Hide ViewCube and NavigationToolbar, SelectCommand, selectWindow (1), selectFreeForm (2), selectPaint (3), Select{Body,Face,Edge,Component}PriorityCommand |
| browser | ToggleBrowser (Ctrl+Alt+B), FusionChangeActiveUnitsCommand, FindInBrowser, FindInWindow, IsolateCmd, UnisolateCmd, SelectabilityToggleCmd, RenameBrowserCmd, ShowAllBodiesCmd, ShowAllComponentsCmd, SoftDeleteCommand |
| timeline | FusionRollCommand, RollToEndCommand, FusionSuppressCommand, FusionUnsuppressCommand, FusionRenameTimelineEntryCommand, FusionTrimFeaturesCommand, FusionFindInTimeline, ProfileSketchActivate |
| shell | every other toolbar id as a stub; real: ToggleDataPanel (Ctrl+Alt+P), ShowFusionHomeCmd, ToggleComments, ToggleToolbar, ResetLayout (Ctrl+Alt+R), SaveAsImageCommand, FileClose, ThreeDprintCmdDef, ShowCommandHelp, NextWorkspace / PreviousWorkspace; placeholder Undo / Redo / FileNew / About that menus replaces |
| menus | FileNew (Ctrl+N), FileOpen (Ctrl+O), FileSave (Ctrl+S), FileSaveAs, RecoverySave (Ctrl+Shift+S), FileExport (STEP / STL / JSON), FileExportSTL, Undo (Ctrl+Z), Redo (Ctrl+Y), ShowToolbox (S), RepeatCommand, ChangeParameterCommand, FusionComputeAllCommand (Ctrl+B), ToggleVisibility (V), FusionEditFeatureCommand, UnisolateAllCmd, SetOrbitCenterCommand, ResetOrbitCenterCommand, KeyboardShortcuts, About, delete-key routing, marking menu |

## DOM test hooks (keep these stable — e2e tests rely on them)
* Any button/menu item that runs a command: `data-cmd="<commandId>"`.
* Toolbar tabs: `[data-tab="SolidTab"]`; panel dropdown triggers `[data-panel="SolidCreatePanel"]`.
* Command dialog: `.dlg[data-dialog="<commandId>"]`, inputs `[data-input="<fieldId>"]`, buttons `[data-action="ok"|"cancel"]`.
* Browser nodes: `[data-node="<kind>:<id>"]` (kinds: doc, settings, namedviews, origin, bodies, body, sketches, sketch, construction, cplane); visibility toggle `.br-eye`.
* Timeline: items `[data-feature="<featureId>"]`, marker `.tl-marker`, playback `[data-tl="first|prev|play|next|last"]`.
* Sketch palette: `.sk-palette`; on-canvas value input `.sk-input`. Marking menu `.mm-root`; toolbox `.tbx-root input`.
* ViewCube canvas: `#viewcube-host canvas`; nav bar buttons `[data-cmd]` inside `#navbar-host`.

## Rules for module builders
1. Edit only files you own (your `src/modules/<name>/`). Additive, minimal changes to `src/app/core.js`,
   `src/model.js`, `src/kernel.js`, `src/sketch/*` are allowed only when unavoidable — keep existing behaviour,
   keep `node tests/*.mjs` passing, and list them in your report.
2. Other builders work in parallel. Keep your files syntactically valid at all times (`node --check <file>` after
   writing); test with `--only=` builds so unfinished modules don't break you.
3. Never copy files from the Fusion install into the repo; read them in place as evidence. Names, layout,
   behaviour, shortcuts and colours may be reproduced; logos and icon artwork may not.
4. Help → About must say "Unofficial hackathon recreation — not affiliated with or endorsed by Autodesk".
5. localStorage access must be wrapped in try/catch (the app may run in a sandboxed iframe).
