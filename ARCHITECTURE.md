# Architecture & module contract

Browser recreation of Fusion's Design workspace. Plain ES modules + DOM + three.js, bundled by
esbuild. **No UI framework.** The OpenCascade kernel (replicad) runs on the main thread.

```
index.html                 shell markup: host elements (see "Hosts")
src/main.js                boot: inflate occt.wasm.gz -> initKernel -> new App -> module init() in order
src/app/core.js            App (document, evaluation, events, selection, commands, input, undo)  [orchestrator-owned]
src/app/components.js      app.components: components, occurrences, positions (see "Components")
src/app/layout.css         grid layout + theme tokens (CSS variables)                               [orchestrator-owned]
src/modules.js             module start-up order                                                     [orchestrator-owned]
src/modules/<name>/index.js   each UI module: `export function init(app)` (may be async)
src/modules/icons/icons.js    shared original SVG icon library (not an init module)
src/model.js kernel.js expr.js   parametric document + evaluator (+ feature-type registry), replicad/OCCT wrapper, expression/ParamTable
src/meshdata.js               triangle-mesh helpers (mesh bodies): weld, bbox, volume, transforms, STL writers, base64
src/sketch/                   solver.js (LM constraint solver + DOF), regions.js (profiles), sketch.js (model + ops),
                              curves.js (spline / ellipse / elliptical-arc geometry)
scripts/                      build.mjs (esbuild bundle, --release), serve.mjs (static server, --artifact),
                              verify-release.mjs (packaging checks), icon-gallery.mjs
tests/*.mjs                   Node engine tests;  tests/e2e/  headless Edge harness + QA scenarios
```

UI modules (start-up order in `src/modules.js`): `viewport`, `sketch`, `dialogs`, `inspect`, `manage`, `annotate`,
`configure`, `assembly`, `insertx`, `surface`, `mesh`, `sheetmetal`, `plastic`, `createx`, `solidx`, `form`, `render`,
`drawing`, `shell`, `browser`, `timeline`, `menus`. `assembly`, `insertx`, `render` and `drawing` are empty placeholders
for wave 2b. Animation, Simulation, Manufacture and Generative Design were cut by the user: no module owns them and the
DESIGN switcher lists them as placeholder workspaces. `icons` is a shared library, not a module. Every module folder has a
README.md (commands, data, API). Files per module (the feature modules are listed in their READMEs):
* viewport: index, camera, bodies, grid, highlight, origin, pick, selection, viewcube, navbar, navicons, navtools, menu
* sketch: index, env, tools, modify, freeform, constraints, dimension, snap, pick, render, hud, palette, status, ctx, glyphs
* dialogs: framework, manip, highlight, common, util, commands (registration), cmd-create / cmd-extrude / cmd-hole /
  cmd-modify / cmd-construct / cmd-coil-pipe / cmd-split-scale / cmd-thread, threads, cosmetic, glyphs, fallback (see its README.md)
* inspect: measure, section, properties, appearance, library, analyses, geom, overlay, ui, canvas (Insert Canvas),
  mesh + insert (Insert Mesh STL/OBJ), bom (Bill of Materials), interference
* shell: appbar, toolbar, menu, panels, tooltip, spec (Design toolbar layout, contextual tabs, marking menus, mode toolbars),
  workspaces-spec (other workspaces' toolbars), workspace (workspace chrome, placeholder, finish fallbacks), common, theme.css
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
npm test                       # engine tests: sketch_test, sketch_engine2, kernel_smoke, kernel2, dialogs_model, registry_test
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
insert, inspect, foundation (registry, body kinds, environments, workspaces) and the newer module scenarios. Each is `defineScenario({name, run(t)})` with helpers from `lib.mjs` (`t.check`, `t.app`, `t.key`, `t.fill`, `t.state`, ...).
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
app.doc                      plain JSON document (see "Document"); ALWAYS read through app.doc; it is replaced
                             on undo/redo/open. Never keep feature objects across mutations; keep ids.
app.feature(id) / featureIndex(id)
app.mutate(label, fn(doc), {recompute=true}) -> ret    one undoable change (snapshots doc), then recompute
app.addFeature(f, label) -> stored feature              inserts at marker, assigns id/name/params/body ids
app.updateFeature(id, patch, label) / deleteFeature(id) / setMarker(n)
app.recompute()              evaluate timeline -> app.result, emits 'model'
app.preview(f, {replaceId}) -> {result, feature}        tentative evaluation for live preview (emits 'model' {preview:true})
app.endPreview()             go back to the committed result
app.result                   {state:{bodies,sketches,planes}, results:{[featureId]:{ok,error?,warning?,tool?,rolled?,suppressed?}}, params}
app.bodies() -> [{id, shape, meta, kind}]   app.body(id)   B-rep bodies only (solid + surface, OCCT shapes)
app.allBodies() / anyBody(id) -> {id, kind, shape?|mesh?, entry?, meta}   every kind (see "Body kinds")
app.bodyKind(id) -> 'solid'|'surface'|'mesh'|'tspline'|...   app.bodyInfo(id) -> {kind, name, volume, area, bbox, triangles?}
app.bodyMeta(id) -> doc.bodies[id] {name, visible, appearance, material, kind?, sheetMetal?}
app.featureEditor(type) / hasFeatureEditor(type) / featureLabel(type)   (featureEditors[type] or the registered def)
app.registerBodyKind(kind, hooks)   app.enterEnvironment(spec) / exitEnvironment(id) / environment / environments / inMode(mode)
app.registerWorkspace(def) / setWorkspace(id) / workspace / workspaceList() / workspaceDef(id)
app.sketchState(id) -> {id, plane, sk, regions, status}   app.planeState(id)   app.featureResult(id)
app.selection                {items, hover, filter, set/add/remove/toggle/clear/has/ofKind/setHover/accepts}
app.commands                 registry: register(def), run(id, ctx), get(id), has(id), all(), isEnabled(id), lastRepeatable
app.input                    pointer/keyboard handler stack: push(handler) -> pop(), dispatch(), top()
app.history                  undo(), redo(), canUndo(), canRedo()
app.featureEditors[type] = (app, featureId) => void     Edit Feature entry points; app.editFeature(id) calls them
app.mode 'model'|'sketch'|<environment mode>, app.activeSketch (feature id), app.setMode(mode, sketchId)
                             (setMode('model') inside an environment returns to that environment's mode)
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
app.components               component model API (see "Components")
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
| `command-start` | `{id, def}` | registry before running a feature/tool command: open dialogs & sketch tools cancel themselves |
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
| `feature-types` | `{type}` | core when `M.registerFeature` adds a type (timeline / browser refresh icons, labels) |
| `body-kinds` | `{kind}` | core `registerBodyKind` |
| `environment` | `{env, action:'enter'|'exit', reason?}` | core `enterEnvironment` / `exitEnvironment` (a `mode` event follows) |
| `workspace` / `workspaces` | `{id, prev, def}` / `{id}` | core `setWorkspace` / `registerWorkspace` |
| `components` | `{action:'activate'|'visible'|'selectable'|'grounded'|'transform'|'capture'|'revert'|'display'|'create'|'rename'|'remove'|'paste'|..., occ?, occs?}` | app.components (viewport, browser, timeline redraw) |

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
{kind:'occurrence', occ}                    a component occurrence ('root' = the root component); highlights its bodies
{kind:'meshFace', body, tri, group, p, n}   triangle `tri` of a mesh body; group = its face group (-1 none). refKey
                                            treats refs of one group as the same selection unless triOnly:true
```
B-rep surface bodies use the face / edge / vertex refs. A plain click on a mesh body gives `{kind:'body'}`
(meshFace ranks after body); a mesh tool that sets `app.selection.filter = (r) => r.kind === 'meshFace'` gets face groups.
`refKey(ref)` (exported from core.js) gives a stable identity string.

Feature face/edge refs stored in the document are `{body, p[, n][, sig]}`. `sig` is **derived, optional** data written by
`model.js` on every successful resolve (`K.edgeSignature` / `K.faceSignature`: curve/surface type `t`, relative position `q`
in the body box, direction/axis `d`/`a`, radius `r`, adjacent-face types and normals `f`). Later evaluations re-find the entity
by `sig` first (`K.matchEdge` / `K.matchFace`), then by nearest point to `p`, and move `p`/`n` back onto the entity. Refs without
`sig` (old documents, fresh picks) fall back to nearest-point and get one on first resolve. Never author `sig` by hand.

### Commands
`register({id, label, tooltip?, icon?, shortcut?: "E" | ["Ctrl+Z"], when?: 'model'|'sketch'|<env mode>, workspace?, kind?: 'feature'|'tool'|'view'|'ui', stub?, run(app, ctx), enabled?(app), checked?(app)})`.
* `when: 'form'` (any environment mode): enabled only while `app.inMode('form')`; offered by the S toolbox there.
  `workspace: 'CAMEnvironment'`: the command belongs to that workspace (toolbox and shortcuts answer only there).
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
setPreview([{shape | mesh:{positions, indices?}, color:'cut'|'new'|'#hex', opacity}]) / clearPreview()    transient tool bodies
setOriginVisible(bool)    temporarily show origin planes/axes for picking (Create Sketch)
meshFor(shape) -> cached K.meshBody() data
```
Standard views (Z-up): Front looks from −Y, Right from +X, Top from +Z, Home = iso from (+x, −y, +z).
Body visibility: `doc.bodies[id].visible`; sketches/planes: `feature.visible !== false`; origin: `doc.origin.visible`.

## Document (src/model.js)
`doc = {version, name, units:'mm', params:[{name, expr, kind, comment}], features:[...], marker, bodies:{id:meta}, counters, origin:{visible}, canvases?, meshData?,
components?, occurrences?, activeOcc?, positions?}` (components: see "Components"; a feature's `occ` = the occurrence it belongs to)
(`canvases` = Insert Canvas images, document data, not timeline features; `meshData` = triangle data of `mesh` features,
`{[id]: {positions: base64 Float32, indices?: base64 Uint32, groups?: base64 Uint32, tris}}`, written by `M.storeMeshData`).
Older documents with `doc.meshes` (display-only Insert Mesh) are converted on open by `M.migrateDoc` (core `loadDocument`
and menus `loadDoc` call it). Default body names `BodyN` count only default-named bodies (`counters.bodyName`).
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
mesh     {data (doc.meshData id), file, format, units, flipUp, tx,ty,tz, rx,ry,rz, scale, tris, bbox, newBody}  Insert Mesh
component {comp, newOcc, parent?, mode:'empty'|'bodies'|'paste'|'copy', bodies?, source?, T?, newBodies?}   new occurrence
snapshot {positions:{oid: M}}          Fusion's "Position" entry (Capture Position)
every feature: occ? (owner occurrence, absent = root); operation 'newComponent' adds newComp / newOcc
```
Feature types (`FIELDS` / `TYPE_LABEL` in model.js): sketch, extrude, revolve, fillet, chamfer, shell, hole, box, cylinder,
sphere, torus, cplane, rpattern, cpattern, move, mirror, combine, loft, sweep, delete, draft, split, coil, pipe, scale, thread,
mesh, plus every type a module registers (next section).
`FIELDS[type]` lists the expression-valued fields and their kind (`length`|`angle`|`none`); each gets a model parameter (d1, d2 ...).
planeRef for a planar face: `{kind:'face', body, p, n, plane:{o,x,n}}` (use `K.planeFromNormal(p, n)`).

## Feature-type registry (src/model.js)
Modules add timeline feature types without editing model.js: `M.registerFeature(type, def)` (also `app.M.registerFeature`).
It wires FIELDS, TYPE_LABEL, NAME_STEM and the evaluator; core naming / parameters / body ids, the timeline (label, icon,
dependency checks), the browser and Edit Feature then work for the type. Register at module `init` (before documents
that use the type are evaluated; an unknown type fails with "... features are not available in this build").
```js
import * as M from "../../model.js";
M.registerFeature("rib", {
  label: "Rib",                                  // timeline tooltip, undo label "Create Rib", app.featureLabel
  stem: "Rib",                                   // auto names Rib1, Rib2 (default: label)
  fields: { thickness: "length", depth: "length" },   // expression fields -> model parameters d1, d2 (f.p[field])
  makesBodies: (f) => f.operation === "new",     // true: core sets f.newBody; a number n: f.newBodies[0..n-1]
  apply(st, f, P, doc) {                         // st = copy of the state: replace Map entries, never mutate shapes
    const t = M.fval(P, f, "thickness");          // throw new Error("...") = failed feature with that message
    const tool = /* OCCT shape */ null;
    st._tool = tool;                              // optional: shown as result.tool (cut previews)
    return { affected: M.applyOp(st, f, tool, doc) };   // {affected?, warning?, ...} -> app.result.results[f.id]
  },
  deps: (f) => ({ sketches: [f.profile.sketch], cplanes: [], bodies: [], features: [], geo: [] }),  // timeline reorder checks
  touches: (f) => f.bodies || [],                // bodies it modifies (timeline dependency checks)
  editor: (app, id) => openRibDialog(app, id),   // Edit Feature / timeline double-click (app.featureEditors[type] wins)
  icon: "FusionRibCommand",                      // command id whose icon the timeline / browser show
  browser: { folder: "construction" },           // optional: list the feature itself in a browser folder (+ node(app, f))
});
```
Built-in types cannot be replaced unless `replace:true`. Queries: `M.featureDef(type)` (built-ins give `{builtin:true}`),
`M.featureTypes()`, `M.registeredFeatures()`, `M.isFeatureType(type)`, `M.onFeatureRegistered(fn)` (core re-emits `feature-types`).
Evaluator helpers for apply(): `M.helpers` (each also a named export): `fval, cloneState, emptyState, locateEdge, locateFace(s),
resolveFace, resolvePlane, followFacePlane, resolveRegion, pointInRegion, profileGroups, applyOp, axisFromRef, bodiesBBoxCenter,
modelSize, touches, fuseTemp, edgeFeature, edgesForRefs, groupByBody, rotatePoint, rotateTo, circumcenter, splitTool, pipePath,
chainPath, trimPath, orderEdges, patternFeatures, friendly, quietFinder, shapeKind, bodyKind, isSolidBody, isBrepBody, allBodyIds,
bodyBBox, storeMeshData, meshDataOf, stageMeshData, unstageMeshData, meshInsertMatrix`. `locateEdge` / `locateFace` refresh the
stored ref (`sig`, `p`) on every resolve (see "Refs"). Node test: `tests/registry_test.mjs`.

## Body kinds
`doc.bodies[id].kind`: `'solid'` (default, not stored) | `'surface'` | `'mesh'` | `'tspline'` | a registered kind; sheet metal is a
solid with `meta.sheetMetal`. Core mirrors the evaluated kind and `sheetMetal` into the metadata after each evaluation.
Evaluation state (model.js `emptyState()`; `cloneState` copies every Map-valued key, so modules may add their own):
```
st.bodies      Map id -> {id, shape, from, kind?, sheetMetal?}   OCCT shapes: solids and surfaces (open shells / faces;
                                                                  M.shapeKind(shape) tells them apart)
st.meshBodies  Map id -> {id, kind:'mesh'|'tspline'|..., mesh, data?, bbox?, from}   not OCCT. mesh = src/meshdata.js format
               {positions: Float32Array, indices: Uint32Array|null (null = soup), normals?, groups? (face group per triangle)}
```
* Rendering (viewport/bodies.js): solids double-sided; surfaces front side in the appearance and back side gold like Fusion;
  mesh-like kinds flat-shaded facets, edges = open boundary + face-group borders (`edges` hook: 'groups'|'sharp'|'none'|'all').
* Picking: surfaces use face / edge / vertex refs; meshes give `body` and `meshFace` hits (see "Refs").
* Browser: every kind is listed in the Bodies folder with its own icon (solid, surface, mesh, T-spline, sheet metal) and a
  tooltip subtitle ("Mesh Body | 12 triangles"); hide / isolate / rename / Delete (Delete feature) work for all kinds.
* Export: STL writes B-rep and mesh triangles (one file); STEP writes B-rep bodies only (toast when mesh bodies are skipped).
* `app.bodyInfo(id)`: volume / area / bbox for Properties and BOM (mesh volume from the closed triangle mesh; `info` hook).
* Insert Mesh (`ParaMeshInsertAlignCommand`, inspect/mesh.js) adds a `mesh` feature; the body is named after the file, Edit
  Feature reopens the dialog, Move/Copy and Delete handle mesh bodies. Dialog selection rows accept mesh-like bodies
  only with `meshBodies: true` (solid features keep refusing them, like Fusion). Dialog previews use `M.stageMeshData(mesh)` -> `tmp:n`
  ids, committed with `M.storeMeshData(doc, mesh)`.
```js
app.registerBodyKind("tspline", {            // merged into app.bodyKinds[kind]; emits 'body-kinds' and re-renders
  label: "T-Spline Body", icon: "<svg ...>",  // browser subtitle / 16 px icon markup
  brep: false,                               // st.meshBodies entry (true = OCCT shape in st.bodies)
  mesh: (entry, app) => entry.data.evaluatedMesh,      // triangles to draw / pick (default entry.mesh)
  render: (entry, app) => cageObject(entry),           // extra THREE.Object3D in the body group (rebuilt with the body)
  pick: (entry, x, y, ray, opts) => [],                // extra hits, same format as viewport pick providers
  edges: "none",                                       // mesh edge display
  info: (entry) => ({ volume, area }),                 // Properties / BOM numbers
});
```
The bounding box of a mesh-like body is `entry.bbox` (object or function) when set, else computed from `entry.mesh`.

## Components (src/model.js, src/app/components.js)
Fusion's component model. Root component = the design; components hold bodies, sketches, construction; occurrences
("Component1:1", "Component1:2") place a component, nested under the root or another occurrence.
```
doc.components   {cid: {id, name, partNumber?, description?, material?, appearance?}}
doc.occurrences  {oid: {id, component: cid, n (":n"), visible?:false, grounded?:true (Pin), selectable?:false}}
doc.activeOcc    active occurrence (absent = root): new features get f.occ = it (core prepareFeature)
doc.positions    {oid: M} uncaptured positions (Move of components); Capture Position turns them into a snapshot feature
M                rigid transform, 12 numbers, 3x4 row-major [r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz] (meshdata.js)
```
Occurrences exist through timeline features: `component` (New Component, Create Components from Bodies, Paste, Paste New)
or a body feature with operation `newComponent` (Extrude / primitives ... "New Component"). Evaluation state:
```
st.occ      Map oid -> {id, component, parent: oid|'root', T: M (world transform of the occurrence frame), inst?: primary oid}
st.bodyOcc  Map bodyId -> oid    owner (no entry = root). New bodies of a feature go to f.newOcc (newComponent) or f.occ.
```
* Bodies stay in **world space**. Moving an occurrence transforms the bodies, sketches and construction planes of it and of
  its sub-occurrences in the state (`M.moveOccurrence(st, doc, oid, M)`, shapes cached per input + matrix), so features
  after the move see the moved geometry. Join / cut / intersect default participants are the visible solids of the
  feature's component subtree (root features: every body), never instance bodies.
* Paste makes another occurrence of the same component (`inst` = the primary occurrence): its bodies are derived instance
  bodies `"<bodyId>@<oid>"` (refreshed after every feature, share `doc.bodies[bodyId]` through `app.bodyMeta`). Paste New
  copies the bodies into a new component ("Component1 (1)").
* Uncaptured positions (`doc.positions`) are applied on top of the final state (not cached; `st.pending` lists them). While
  they exist the POSITION tab (`EditSnapshotTab`, env `position`) shows FINISH POSITION = Capture Position
  (`SnapshotEditAccept`) and Revert Position (`SnapshotEditCancel`); the timeline shows a Position entry with the same
  menu. Adding any feature captures them first (a `snapshot` feature before it).
* Model helpers (also in `M.helpers`): `ROOT`, `bodyOwner(st, id)`, `occSubtree(st, oid)`, `occBodies` / `occBodiesDeep`,
  `occTransform`, `moveOccurrence`, `transformShape(shape, M)`, `transformMesh`, `transformPlane`, `invRigid`,
  `isInstanceId`, `instanceBase`; doc helpers `newComponentMeta(doc, {name})`, `newOccurrenceMeta(doc, cid)`, `capturePositions(doc)`.

`app.components` (queries read the visible result + doc metadata; changes are one undo step each, then a `components` event):
```js
const C = app.components;
C.list() / C.tree(oid = 'root') / C.info(oid)   // {id, component, name, label 'Name:n', parent, T, inst, visible, grounded, selectable, pending}
C.children(oid) / C.ancestors(oid) / C.label(oid) / C.alive(oid) / C.count(cid)
C.ownerOf(bodyId) / C.bodiesOf(oid, {deep = true}) / C.worldBodies(oid) -> [{id, kind, shape | mesh}]   // world space
C.featuresOf(oid) / C.ownerOfFeature(f)
C.active / C.activate(oid | 'root') / C.inActive(oid) / C.faded(bodyId)
C.create({name, parent, bodies, activate}) -> [oid]      C.createFromBodies(ids)      C.rename(oid, name)   C.remove(oids)
C.setVisible(oids, v) / C.setSelectable(oids, v) / C.setGrounded(oids, v) / C.bodyShown(id) / C.bodySelectable(id)
C.transform(oid) -> M   C.setTransform(oid, M, {capture})   C.setTransforms({oid: M}, {capture, label})
C.pending() / C.hasPending() / C.capture() / C.revert()
C.setDisplayTransform(oid, M | null) / C.displayTransform(oid) / C.clearDisplay()   // drawing only, no evaluation
C.copy(refs) / C.paste() / C.pasteNew() / C.canPaste()   C.rigid(t, rDeg, pivot) -> M
```
For the assembly engineer: (a) a joint / rigid group / constraint is a registered feature whose `apply(st, f, P, doc)` calls
`M.moveOccurrence(st, doc, oid, M)` for the occurrences it positions (later features and the browser follow); (b) world
geometry of any occurrence: `M.occBodiesDeep(st, oid)` / `C.worldBodies(oid)` (state bodies are world space), its frame
`M.occTransform(st, oid)`; (c) motion / animation without recompute: `C.setDisplayTransform(oid, M)` per frame (the viewport
sets body group matrices; picking of edges ignores display overrides), `C.clearDisplay()` at the end. Pinned (grounded)
occurrences refuse `setTransform` unless `{force:true}`.

## Contextual environments (core + shell toolbar)
Fusion's FORM, BASE FEATURE, FLAT PATTERN, DIRECT MESH EDITING ... tabs. The layouts are in `shell/spec.js` CONTEXTUAL_TABS
(ids FormTab, BasefeatureSolidTab, BasefeatureSurfaceTab, FlatPatternSolidTab, FlatPatternSurfaceTab, ParaMeshBaseFeatureTab,
EditSnapshotTab, PCBTab; each `{id, label, mode, env, panels, finish, finishPanel, baseTabs}`); their commands are stubs until
a module registers them. Small floating mode bars (Configure, Edit In Place) are `MODE_TOOLBARS`.
```js
const env = app.enterEnvironment({
  id: "form", mode: "form", label: "FORM",
  tab: "FormTab",                    // CONTEXTUAL_TABS id, {id, label, panels:[ids]} or an array of them
  panels: { MyPanel: { label: "MY", controls: ["MyCmd"], dropdown: [] } },   // optional extra panels
  finishCommand: "TSplineBaseFeatureStop",   // green check FINISH button (panel label from spec, or finishLabel)
  baseTabs: [],                      // persistent tabs kept: [] none (spec default for these tabs), null all, [ids]
  markingMenu: "TSplineEnvironment", // spec MARKING_MENUS id or [{pos, id} | {pos, label, submenu}]
  shortcuts: ["TSplineBoxCommand"],  // default S-toolbox row of the environment
  modeToolbar: "ConfigToolbar", modeLabel: (app) => "Name",   // optional floating mode bar instead of / with a tab
  feature: featureId,                // optional: the feature being edited
  onExit(reason) {},                 // 'finish' | 'cancel' | 'exit' | 'replaced' | 'workspace' | 'document'
});
app.exitEnvironment("form", { reason: "finish" });
```
While active: `app.mode === env.mode`, `app.environment` is the innermost env (the sketch reports
`{id:'sketch', builtin:true}`), commands with `when: env.mode` are enabled, the toolbar shows the contextual tab with its
FINISH panel, the marking menu and S toolbox ("Form Shortcuts") follow the environment and shortcut lists are per mode.
Esc cancels the active command and then the selection, never the environment (like Fusion). A sketch made inside an environment
returns to it on Finish Sketch. Until a module registers the finish command, the shell's fallback leaves the environment
(`exitEnvironment(id, {reason:'finish'})`). New / open document and workspace switches exit every environment.

## Workspaces (core + shell)
The DESIGN switcher lists Fusion's workspaces in Fusion's order (core `WORKSPACE_ORDER`): Design (FusionSolidEnvironment),
Generative Design (GenerativeEnvironment), Render (FusionRenderEnvironment), Animation (Publisher3DEnvironment), Simulation
(SimulationEnvironment), Manufacture (CAMEnvironment), Drawing (FusionDocumentationEnvironment). Toolbar layouts of the
non-Design workspaces, generated from the install, are in `shell/workspaces-spec.js` (`WORKSPACE_SPECS`, `WORKSPACE_PANELS`,
`WORKSPACE_COMMANDS`); their commands are stubs scoped with `workspace: <id>`. An unregistered workspace shows its toolbar,
a placeholder card with "Back to Design", and a labelled bottom strip.
```js
app.registerWorkspace({
  id: "FusionRenderEnvironment",          // label defaults to Fusion's
  tabs: [{ id: "RenderTab", label: "RENDER", panels: ["RenderSetupPanel"] }],   // default: workspaces-spec tabs
  panels: { RenderSetupPanel: { label: "SETUP", controls: ["..."], dropdown: [] } },   // merged over the spec panels
  enter(app) {}, exit(app) {},
  timeline: (host, app) => dispose,       // own bottom strip (false hides it; omitted = placeholder strip)
  browser: true,                          // false hides the browser
  canvas: (layer, app) => dispose,        // optional overlay layer over the canvas
  shortcuts: ["..."],                     // default S-toolbox row
});
app.setWorkspace("FusionRenderEnvironment");   // finishes the sketch, exits environments, emits 'workspace'
```
NextWorkspace / PreviousWorkspace (Ctrl+] / Ctrl+[) step through the list. The timeline and browser of Design are kept
(hidden, not destroyed) while another workspace shows.

## Browser and timeline hooks
`app.ui.browser.registerFolder({key, label, after?: "bodies:root", before?, build(app) -> node|null})` adds a folder to the
root component (node = `{eye?, onEye?, menu?() -> items, children:[{key, label, icon, ref?, eye?, onEye?, onDbl?, menu?,
renamable?, rename?(name), tip?, badge?}]}`; returns remove()); `app.ui.browser.invalidate()` re-renders. Registered feature
types with `browser.folder` are listed in that folder. The timeline reads `def.deps` / `def.touches` for its reorder checks.

## Feature modules (wave 1 + 2a): public APIs and document data
Each module registers its timeline types with `M.registerFeature` from its own folder and documents the details in its
README.md. Summary of what other modules may use:
| module | `app.ui` API | feature types / document data / environments |
|---|---|---|
| inspect | `app.ui.inspect`: analyses(), analysis(id), setAnalysisVisible, removeAnalysis, renameAnalysis, editAnalysis, openAnalysis(type, {preselect, editId}), refreshAnalyses(), curvature(bodyId), optimalMinimumRadius(ids), analysisObjects(), materialBrowser | `doc.analyses` (section, com, zebra, draft, curvature map, minimum radius, environment map, accessibility, comb, isocurve); `mesh` feature (Insert Mesh, triangles in `doc.meshData`) |
| manage | `app.ui.scripts` (store, host, run, stop, edit, open, create, list, reference), `app.ui.pim` (components, item, changeOrders, assign, quickRelease, createChangeOrder, advance, open), `app.ui.tasks` (list, save, remove, related, openBoard, openRelated, newTask) | local PIM items / change orders and tasks (approved by the user as local equivalents of the cloud features), script store in localStorage |
| annotate | `app.ui.pmi`: features(), spec(id), specs(), refresh(), settings(), ctxFor(state), renderer.primsOf(id) | pmiNote, pmiGeneralNote, pmiDimension, pmiGdt, pmiHoleNote; `doc.pmi` settings |
| configure | `app.ui.configure` (data, rules, configurations, active, columns, activate, addConfigurations, addAspect, ...) | `doc.configurations = {version, nid, rows, active, columns, cells, themes, rules}`; floating mode bar `ConfigToolbar` |
| surface | (dialog openers only) | surfExtrude, surfRevolve, surfSweep, surfLoft, surfPatch, surfRuled, surfOffset, surfThicken, surfBoundaryFill, surfExtend, surfTrim, surfUntrim, surfStitch, surfUnstitch, surfMerge, surfReverse, surfSilhouette, surfValidate |
| mesh | `app.ui.mesh = {open(id, opts), palette, display, enterDirect(id), analyze(id)}` | meshRemesh ... meshQuad, meshConvert (Faceted / Prismatic / Organic through the form module's `cageToShape`), meshBase; environment `meshedit` |
| sheetmetal | `app.ui.sheetMetal = {flatOf(id), flatDXF, enterFlat(id), exitFlat(), flatActive, rules}` | smBaseFlange, smEdgeFlange, smHem, smLoft, smFold, smJog, smUnfold, smRefold, smRip, smCorner, smFillet, smChamfer, smConvert, smJoinBend; `doc.sheetMetal {rules, active, components, flats, rev}`; environment `flatpattern` |
| plastic | `app.ui.plastic = {rules, openManage(), openAssign({preselect}), types}` | rib, web, emboss, boss, lip, rest, snapFit; `doc.plastic = {rules, assign}` |
| createx | (dialog openers only) | boundingsolid, fluidvolume, pathpattern, geopattern, csys, vlattice, vtexture; `st.csys`; body kind `volumetric`; Bounding Solid rigid groups (below) |
| solidx | (dialog openers only) | caxis, cpoint (refs `{kind:'caxis'|'cpoint', id}`, `st.axes`, `st.points`), offsetface, replaceface, splitface, removefaces, removefeatures, align, basefeature, editface, automodel; `M.registerCPlaneMode(mode, fn)`; environment `basefeature` |
| form | `app.ui.form = {state, createForm, enter, finish, setDisplay, insertTSplineText, readTSM, writeTSM, cageToShape, cageFromShape, evalCage, ops, cage}` | `{type:'form', bodies:[cage]}`; refs tsVertex, tsEdge, tsFace; body kind `tspline`; environment `form`; event `form` |

**Bounding Solid rigid groups (createx).** A Bounding Solid with Rigid Group on (`f.rigidGroup`) forms a rigid group
with its selected components. The assembly module solves rigid groups (src/modules/assembly); the temporary createx
wrapper of `app.components.setTransform` is removed.

## Command ownership (Fusion ids from the local install's TabToolbars.xml)
At runtime (integration check, 2026-11-09) 1025 ids are registered: 497 real commands (17 of them hidden aliases or shortcut-only)
and 528 stubs (`stub:true`, toast "isn't available in this unofficial recreation yet"; most belong to the placeholder workspaces and
to wave 2b: assembly, insertx, render, drawing, cloud features). A real registration replaces a stub; a stub never replaces a real command. Registration sites:
`app.commands.register`, the `reg(...)` helpers in sketch/menus/shell/timeline `index.js`, and `C(...)` in `dialogs/commands.js`.
| module | command ids |
|---|---|
| sketch | SketchCreate, SketchStop (Finish Sketch), SketchActivate, SketchLookAt, DrawPolyline (L), SketchMidpointLine, ShapeRectangleTwoPoint (R), ShapeRectangleThreePoint, ShapeRectangleCenter, CircleCenterRadius (C), CircleTwoPoint, CircleThreePoint, CircleElipse, ArcThreePoint, ArcCenterTwoPoint, ArcTangent, ShapePolygonCircumscribed, ShapePolygonInscribed, ShapePolygonEdge, ShapeSlotCenterToCenter, ShapeSlotOverall, ShapeSlotCenterPoint, DrawPoint, DrawSpline (fit point), BlendG1CurveSketchCmd, MirrorSketchCommand, ProjectNewCmd (P), SketchDimension (D), FilletSketchCmd, ChamferSketchEqualDistance / DistanceDistance / DistanceAngle, TrimSketchCmd (T), ExtendSketchCmd, Offset (O), ConstraintHorizontalVertical, ConstraintCoincident, ConstraintTangent, ConstraintEqual, ConstraintParallel, ConstraintPerpendicular, ConstraintFix, SketchFixConstraintCmd, ConstraintMidPoint, ConstraintConcentric, ConstraintCollinear, ConstraintSymmetry, SketchConstructionCmd (X), SketchDeleteCmd |
| dialogs | Extrude (E), Revolve, Sweep, SolidLoft, FusionHoleCommand (H), PrimitiveBox / Cylinder / Sphere / Torus / Coil / Pipe, FusionThreadCommand, PatternRectangular, PatternCircular, MirrorCommand, FusionPressPullCommand (Q), FusionFilletEdgesCommand (F), FusionChamferCommand, FusionShellBodyCommand, FusionDraftCommand, FusionCombineCommand, ModifyScale, FusionSplitBodyCommand, FusionMoveCommand (M), FusionDeleteCommand, ConstructionPlaneOffsetFromPlaneCommand (+ WorkPlaneOffsetFromPlaneCommand alias), ConstructionPlaneAtAngleCommand, ConstructionMidPlaneCommand |
| dialogs (components) | FusionCreateNewComponentCommand (New Component), FusionCreateNewCompCmdFromBody, FusionActivateLocalCompCmd, FusionGroundComponents (Pin) / FusionUnGroundComponents (Unpin), CopyCommand (Ctrl+C), PasteCommand (Ctrl+V), FusionPasteNewCommand, SnapshotEditAccept / SnapshotCmd (Capture Position), SnapshotEditCancel (Revert Position) |
| inspect | MeasureCommand (I), FusionHalfSectionViewCommand, FusionCenterOfMassCommand, AppearanceCommand (A), PhysicalMaterialCommand, FusionPropertiesCommand (+ hidden aliases), FusionAddCanvasCommand, ParaMeshInsertAlignCommand (Insert Mesh), InterferenceCheckCommand, MaterializedBomHybridCmd (Bill of Materials) |
| viewport | Orbit / FreeOrbit / ConstrainedOrbit, Pan, Zoom, ZoomWindow, Fit, LookAtCommand, ViewDisplay / VisualStyle / Env / Effect / GraphicsPreset / GroundPlane commands, ViewCamera* (ortho / perspective), ViewVisibility* (origins, bodies, sketches, planes, ShowAll, HideAll), VisibilityOverrideCommand, grid and snap commands (ViewLayoutGrid*, DefineGridCmd, ToggleGridSnapCommand, SetSnapValueCmd, ToggleIncrementalMoveCmd), SingleViewCmd / MultiViewCmd / SplitView*, ShowWorkspaceFullScreen / Normal, ViewCube* (GoHome, SetHome*, ResetHome), ToggleViewCube (Ctrl+Alt+V), ToggleNavBar (Ctrl+Alt+N), Show/Hide ViewCube and NavigationToolbar, SelectCommand, selectWindow (1), selectFreeForm (2), selectPaint (3), Select{Body,Face,Edge,Component}PriorityCommand |
| browser | ToggleBrowser (Ctrl+Alt+B), FusionChangeActiveUnitsCommand, FindInBrowser, FindInWindow, IsolateCmd, UnisolateCmd, SelectabilityToggleCmd, RenameBrowserCmd, ShowAllBodiesCmd, ShowAllComponentsCmd, SoftDeleteCommand |
| timeline | FusionRollCommand, RollToEndCommand, FusionSuppressCommand, FusionUnsuppressCommand, FusionRenameTimelineEntryCommand, FusionTrimFeaturesCommand, FusionFindInTimeline, ProfileSketchActivate |
| shell | every other toolbar id as a stub; real: ToggleDataPanel (Ctrl+Alt+P), ShowFusionHomeCmd, ToggleComments, ToggleToolbar, ResetLayout (Ctrl+Alt+R), SaveAsImageCommand, FileClose, ThreeDprintCmdDef, ShowCommandHelp, NextWorkspace / PreviousWorkspace; placeholder Undo / Redo / FileNew / About that menus replaces |
| menus | FileNew (Ctrl+N), FileOpen (Ctrl+O), FileSave (Ctrl+S), FileSaveAs, RecoverySave (Ctrl+Shift+S), FileExport (STEP / STL / JSON), FileExportSTL, Undo (Ctrl+Z), Redo (Ctrl+Y), ShowToolbox (S), RepeatCommand, ChangeParameterCommand, FusionComputeAllCommand (Ctrl+B), ToggleVisibility (V), FusionEditFeatureCommand, UnisolateAllCmd, SetOrbitCenterCommand, ResetOrbitCenterCommand, KeyboardShortcuts, About, delete-key routing, marking menu |
| inspect (wave 1) | FusionZebraAnalysisCommand, FusionDraftAnalysisCommand, FusionCurvatureMapAnalysisCommand, FusionCurvatureCombAnalysisCommand, FusionIsoCurveAnalysisCommand, FusionEnvironmentMapAnalysisCommand, FusionAccessibilityAnalysisCommand, FusionMinimumRadiusAnalysisCommand, MaterialCommand |
| sketch (wave 1) | CircleTanTanRadius, CircleThreeTangent, ConicCurveCmd, ShapeArcSlotCenterTwoPoint, ShapeArcSlotThreePoint, MTextCmd, BreakSketchCmd, SketchScaleCmd, RectangularSketchPatternCommand, CircularSketchPatternCommand, IntersectCmd, IntersectionCurve, ProjectToSurface, Include3DGeometry, SketchIsoparametricCurve, SpunProfileCmd, DrawCVMSpline3D, SketchImportSVG, ImportDxfFileCommand, SketchAutoConstraintAndDimCmd, SketchAutoConstraintAndDimFromDatumCmd, SketchAutoConstrainAndFinish, ConstraintSmooth, SketchPolygonConstraintCmd, AddTangentHandle, DeleteTangentCommand, AddCurvatureHandle, DeleteCurvatureCommand, Offset |
| dialogs (components, wave 1) | FusionCreateNewComponentCommand, FusionCreateNewCompCmdFromBody, FusionActivateLocalCompCmd, FusionGroundComponents, FusionUnGroundComponents, CopyCommand, PasteCommand, FusionPasteNewCommand, SnapshotEditAccept, SnapshotEditCancel, FusionMoveCommand, FusionDeleteCommand, SelectComponentPriorityCommand, FusionPropertiesCommand, MaterializedBomHybridCmd |
| manage | ScriptsManagerCommand, APIHelpCommand, ExchangeAppStoreCommand, DesignAdviceCmd, FusionFindFeaturesCommand, GraphViewCmd, TimelineBuilderCommand, FusionComputeUnresolvedCommand, SelectByNameCommand, FusionSelectBodiesBySizeCommand, SelectByBoundaryCommand, FusionSelectSeedAndBoundaryFacesCommand, SelectByInvertCommand, SelectionFilterCommand, PIMAssignItemNumberCmd, PIMQuickReleaseCmd, PIMECOReleaseCmd, PIMGoToDashboardCmd, TaskManagementCreateTaskCmd, TaskManagementRelatedTasksCmd, TaskManagementOpenTasksCmd |
| annotate | LeaderLineNoteCommand, GeneralNoteCommand, DimensionNoteCommand, GeometricToleranceNoteCommand, HoleThreadNoteCommand, FusionChangePMISettingsCmd |
| configure | FusionStartDesignConfigModeCmd, FusionShowDesignConfigPanelCmd, FusionConfigurationRulesCmd, ConfigureFeatureCmd, ConfigureEntityCmd, ActivateConfig |
| surface | SurfaceExtrude, SurfaceRevolve, SurfaceSweep, SurfaceLoft, FusionSurfacePatchCommand, FusionSurfaceRuledCommand, FusionSurfaceOffsetCommand, SurfaceSculpt, FusionSurfaceThickenCommand, FusionExtendCommand, FusionSurfaceTrimCommand, FusionSurfaceUntrimCommand, FusionSurfaceStitchCommand, FusionSurfaceUnStitchCommand, FusionSurfaceMergeCommand, FusionSurfaceReverseNormalCommand, FusionSurfaceValidateCommand, FusionPartingLineSplitCmd |
| mesh | ParaMeshAlignCommand, ParaMeshAttractToReferenceCommand, ParaMeshBaseFeatureCreateCommand, ParaMeshBaseFeatureStopCommand, ParaMeshBridgeCommand, ParaMeshCalculateFaceGroupsCommand, ParaMeshCloseCracksCommand, ParaMeshCombineCommand, ParaMeshConvertCommand, ParaMeshCreateFaceGroupCommand, ParaMeshEmptyBaseFeatureCommand, ParaMeshEraseAndFillCommand, ParaMeshExtractCommand, ParaMeshHollowCommand, ParaMeshMergeFaceGroupsCommand, ParaMeshPlanarSectionCommand, ParaMeshPlaneCutCommand, ParaMeshReduceCommand, ParaMeshRemeshCommand, ParaMeshRemoveCommand, ParaMeshRepairCommand, ParaMeshReverseNormalsCommand, ParaMeshScaleCommand, ParaMeshShowSelectionPanelCmd, ParaMeshSmoothBoundaryCommand, ParaMeshSmoothCommand, ParaMeshTessellateCommand, ParaMeshTextureCommand, ParaMeshToQuadMeshCommand, FacegroupsToggleCmd, FitCurvesToSectionCommand |
| sheetmetal | FusionSheetMetalRulesCommand, FusionSheetMetalRulesLibraryCommand, FusionSheetMetalFlangeCommand, FusionSheetMetalHemFlangeCommand, FusionSheetMetalLoftCommand, FusionSheetMetalJogCommand, SheetMetalFoldCmd, FusionSheetmetalUnfoldCommand, FusionSheetmetalRefoldCommand, FusionSheetMetalRipCommand, FusionSheetMetalCornerCommand, FusionSheetMetalFilletCommand, FusionSheetMetalChamferCommand, FusionJoinByBendCommand, ConvertToSheetMetalCmd, FusionSheetMetalFlatPatternCmd, ExportFlatPatternCmd, FusionSheetMetalExitFlatPatternCmd |
| plastic | FusionRibCommand, FusionWebCommand, EmbossCmd, FusionBossCommand, FusionLipCommand, FusionRestCommand, FusionSnapFitCommand, FusionAssignPlasticRuleCommand, FusionManagePlasticRuleCommand |
| createx | StockModelCommand, EnclosureCommand, PatternOnPath, FusionPatternGeometricCommand, CoordinateSystemCommand, VolFieldCreateLatticeCommand, VolFieldTextureCommand |
| solidx | FusionOffsetFacesCommand, FusionReplaceFaceCommand, FusionSplitFaceCommand, EditFaceCommand, FusionRemoveFacesCommand, FusionRemoveFeaturesCommand, AlignCmd, BaseFeatureCreationCommand, BaseFeatureStop, AutomatedModelingCommand, ConstructionAxisFromTwoPlanesCommand, ConstructionAxisNormalToFaceCommand, ConstructionAxisThroughCylinderCommand, ConstructionAxisThroughEdgeCommand, ConstructionAxisThroughTwoPointsCommand, ConstructionPlaneAlongPathCommand, ConstructionPlaneFromThreePointsCommand, ConstructionPlaneFromTwoEdgesCommand, ConstructionPlanePerpendicularToPlaneCommand, ConstructionTangentPlaneCommand, ConstructionPointAlongPathCommand, ConstructionPointAtEdgeAndPlaneCommand, ConstructionPointFromCircleOrSphereCommand, ConstructionPointFromPointCommand, ConstructionPointFromThreePlanesCommand, ConstructionPointThroughTwoEdgesCommand |
| form | TSplineBaseFeatureCreationCommand, TSplineBaseFeatureStop, TSplinePrimitiveBoxCommand, TSplinePrimitivePlaneCommand, TSplinePrimitiveCylinderCommand, TSplinePrimitiveSphereCommand, TSplinePrimitiveTorusCommand, TSplinePrimitiveQuadBallCommand, TSplinePrimitivePipe, TSplineAppendFaceCommand, TSplineExtrudeCommand, TSplineRevolveCommand, TSplineSweepCommand, TSplineLoft, TSplineEditCommand, TSplineEditByCurveCmd, TSplineInsertEdgeCommand, TSplineSubsetCmd, TSplineInsertPointCommand, TSplineMergeEdgeCmd, TSplineBridgeSubDCmd, TSplineFillHoleCmd, TSplineEraseAndFillCmd, TSplineWeldCommand, TSplineUnWeldCommand, TSplineCreasedEdgeCommand, TSplineUnCreaseEdgeCmd, TSplineBevelEdgeCommand, TSplineSlideEdgeCommand, TSplineSmoothCmd, TSplineCylindrifyCmd, TSplinePullSubDCmd, TSplineFlattenSubDCmd, TSplineStraightenCmd, TSplineMatchCmd, TSplineInterpolateSubDCmd, TSplineThickenCommand, TSplineFreezeCmd, TSplineUnFreezeCmd, TSplineInternalMirrorSymmetryCmd, TSplineInternalCircularSymmetryCmd, TSplineReflectionMirrorSymmetryCmd, TSplineReflectionCircularSymmetryCmd, TSplineClearSymmetryCommand, TSplineIsolateSymmetryCmd, TSplineToggleTessModeCmd, TSplineRepairBodyCmd, TSplineMakeUniformCmd, TSpline2BRepCommand, TSplineCapSettingCommand, TSplineImportCommand, TSplineSaveAsTSMCommand |

## DOM test hooks (keep these stable: e2e tests rely on them)
* Any button/menu item that runs a command: `data-cmd="<commandId>"`.
* Toolbar tabs: `[data-tab="SolidTab"]`; panel dropdown triggers `[data-panel="SolidCreatePanel"]`.
* Command dialog: `.dlg[data-dialog="<commandId>"]`, inputs `[data-input="<fieldId>"]`, buttons `[data-action="ok"|"cancel"]`.
* Browser nodes: `[data-node="<kind>:<id>"]` (kinds: doc, settings, namedviews, origin, bodies, body, sketches, sketch, construction, cplane, occ; a component's folders are `bodies:<oid>`, `sketches:<oid>` ...); visibility toggle `.br-eye`, activate radio `.br-right .br-radio`.
* Timeline: uncaptured component positions `.tl-pending`; features of other components while one is active `.tl-item.other-comp`.
* Timeline: items `[data-feature="<featureId>"]`, marker `.tl-marker`, playback `[data-tl="first|prev|play|next|last"]`.
* Sketch palette: `.sk-palette`; on-canvas value input `.sk-input`. Marking menu `.mm-root`; toolbox `.tbx-root input`.
* ViewCube canvas: `#viewcube-host canvas`; nav bar buttons `[data-cmd]` inside `#navbar-host`.

## Rules for module builders
1. Edit only files you own (your `src/modules/<name>/`). Additive, minimal changes to `src/app/core.js`,
   `src/model.js`, `src/kernel.js`, `src/sketch/*` are allowed only when unavoidable; keep existing behaviour,
   keep `node tests/*.mjs` passing, and list them in your report.
2. Other builders work in parallel. Keep your files syntactically valid at all times (`node --check <file>` after
   writing); test with `--only=` builds so unfinished modules don't break you.
3. Never copy files from the Fusion install into the repo; read them in place as evidence. Names, layout,
   behaviour, shortcuts and colours may be reproduced; logos and icon artwork may not.
4. Help → About must say "Unofficial hackathon recreation: not affiliated with or endorsed by Autodesk".
5. localStorage access must be wrapped in try/catch (the app may run in a sandboxed iframe).
