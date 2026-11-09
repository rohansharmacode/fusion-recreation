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
src/model.js kernel.js expr.js sketch/*   modelling engine (already built + tested)
scripts/build.mjs serve.mjs  build + static server
tests/e2e/harness.mjs        headless Edge harness (playwright-core, channel "msedge")
```

## Build & test
```
node scripts/build.mjs                                 # all modules -> dist/
node scripts/build.mjs --only=viewport,sketch --out=build/me   # other modules stubbed out
node scripts/serve.mjs --dir=build/me --port=5314      # manual serving
node tests/e2e/boot.mjs                                # smoke test
node tests/sketch_test.mjs; node tests/kernel_smoke.mjs; node tests/kernel2.mjs   # engine tests
```
In your own test scripts use `launch({ only, outDir: "build/<you>", port: <your port>, shots: "tests/e2e/out/<you>" })`
from `tests/e2e/harness.mjs`. It returns `{page, shot(name), frames(n), errors, close()}`. `window.app` is the App.
Screenshots are PNGs you can open with the Read tool to check visuals. Always `close()`.

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
app.setStatus(text) / app.status   bottom-right canvas status text like Fusion ("1 Profile | Area : 800.00 mm^2", "Edge", "Body1"); emits 'status'
app.download(filename, Blob|string, mime) -> Promise<bool>   the ONLY way to offer files (works in the claude.ai artifact sandbox)
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

### Refs (selection / hover / pick results)
```
{kind:'body', body}
{kind:'face', body, index, p:[x,y,z], n:[x,y,z], planar}      p = picked point on the face, n = normal there
{kind:'edge', body, index, p:[x,y,z]}                          p = point on the edge (midpoint when not picked)
{kind:'vertex', body, p}
{kind:'profile', sketch, key, c:[u,v]}                         sketch = sketch feature id; key/c from sketch regions
{kind:'sketchCurve', sketch, curve} {kind:'sketchPoint', sketch, point} {kind:'sketchDim', sketch, cid}
{kind:'originPlane', name:'XY'|'XZ'|'YZ'} {kind:'originAxis', name:'X'|'Y'|'Z'} {kind:'originPoint'}
{kind:'cplane', id}  {kind:'feature', id}
```
`refKey(ref)` (exported from core.js) gives a stable identity string.

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
`doc = {version, name, units:'mm', params:[{name, expr, kind, comment}], features:[...], marker, bodies:{id:meta}, counters, origin:{visible}}`.
Numeric feature fields are **expression strings** (`"10 mm"`, `"d1/2"`, `"30 deg"`) evaluated by the
ParamTable; `M.assignParams` gives each a model parameter name stored in `f.p[field]` (d1, d2 …).
Feature shapes (all have `id, type, name`; `suppressed`, `visible` optional):
```
sketch   {plane:{o,x,n}, planeRef:{kind:'origin',name}|{kind:'face',body,p,n,plane}|{kind:'cplane',id}, sk, visible}
         sk = {points:{id:{x,y,fixed?}}, curves:{id:{type:'line'|'circle'|'arc'|'point', p1,p2|c,r, cons}}, constraints:[{id,type,refs,expr?,param?,dimType?}], nid}
         constraint types: coincident onCurve midpoint horizontal vertical parallel perpendicular collinear equal
         concentric tangent symmetric fix distance pointLine diameter radius angle
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
```
planeRef for a planar face: `{kind:'face', body, p, n, plane:{o,x,n}}` (use `K.planeFromNormal(p, n)`).

## Command ownership (Fusion ids from the local install's TabToolbars.xml)
| module | command ids |
|---|---|
| sketch | SketchCreate, SketchStop (Finish Sketch), DrawPolyline (L), ShapeRectangleTwoPoint (R), ShapeRectangleThreePoint, ShapeRectangleCenter, CircleCenterRadius (C), CircleTwoPoint, CircleThreePoint, ArcThreePoint, ArcCenterTwoPoint, ArcTangent, ShapePolygonCircumscribed, ShapePolygonInscribed, ShapePolygonEdge, ShapeSlotCenterToCenter, ShapeSlotOverall, ShapeSlotCenterPoint, DrawPoint, MirrorSketchCommand, ProjectNewCmd (P), SketchDimension (D), FilletSketchCmd, TrimSketchCmd (T), ExtendSketchCmd, Offset (O), ConstraintHorizontalVertical, ConstraintCoincident, ConstraintTangent, ConstraintEqual, ConstraintParallel, ConstraintPerpendicular, ConstraintFix, ConstraintMidPoint, ConstraintConcentric, ConstraintCollinear, ConstraintSymmetry, construction toggle (X) |
| dialogs | Extrude (E), Revolve, Sweep, SolidLoft, FusionHoleCommand (H), PrimitiveBox, PrimitiveCylinder, PrimitiveSphere, PrimitiveTorus, PatternRectangular, PatternCircular, MirrorCommand, FusionPressPullCommand (Q), FusionFilletEdgesCommand (F), FusionChamferCommand, FusionShellBodyCommand, FusionDraftCommand, FusionCombineCommand, FusionMoveCommand (M), FusionDeleteCommand, ConstructionPlaneOffsetFromPlaneCommand (+ WorkPlaneOffsetFromPlaneCommand alias), ConstructionPlaneAtAngleCommand, ConstructionMidPlaneCommand |
| inspect | MeasureCommand (I), FusionHalfSectionViewCommand, FusionCenterOfMassCommand, AppearanceCommand (A), PhysicalMaterialCommand, properties |
| viewport | navigation bar + view commands, SelectCommand, selectWindow (1), selectFreeForm (2), selectPaint (3), ToggleViewCube (Ctrl+Alt+V), ToggleNavBar (Ctrl+Alt+N) |
| browser | ToggleBrowser (Ctrl+Alt+B) |
| shell | everything else in the toolbar as stubs (`stub:true`, "not available in this recreation"), ToggleDataPanel (Ctrl+Alt+P), ResetLayout (Ctrl+Alt+R) |
| menus | FileNew (Ctrl+N), FileOpen (Ctrl+O), FileSave (Ctrl+S), FileSaveAs, RecoverySave (Ctrl+Shift+S), FileExport, FileExportSTL, Undo (Ctrl+Z), Redo (Ctrl+Y), ShowToolbox (S), RepeatCommand, ChangeParameterCommand, FusionComputeAllCommand (Ctrl+B), ToggleVisibility (V), KeyboardShortcuts, About, delete-key routing |

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
