# dialogs module — command dialog framework (`app.ui.dialog`) + modelling commands

Look (pass 2, measured on Fusion 2706 captures): the panel is DOCKED at the right edge of the canvas under
the ViewCube (`#dialog-host`, white, no frame/shadow), header "− TITLE ... »", a label column sized to the
labels (or `labelWidth`) + a control column (`ctrlWidth`, default 118), 29 px rows, faint control frames, a
thin divider before rows with `sep:true`, footer (i) ... OK / Cancel (OK disabled until the feature is valid;
Cancel then gets the dark default frame). Dragging the header undocks it; double-click docks it again.

Files: `framework.js` (Dialog class), `manip.js` (on-canvas block arrows, arcs, point handles + HUD box), `highlight.js` (face/edge
selection highlight), `util.js` (geometry/ref helpers), `glyphs.js` (original SVG glyphs),
`common.js`, `cmd-*.js` (commands), `commands.js` (registration + `app.featureEditors`),
`fallback.js` (sketch profile display/picking used only when the sketch module is missing),
`style.css`.

## Opening a dialog

```js
const dlg = app.ui.dialog.open({
  id: "Extrude",                 // Fusion command id -> .dlg[data-dialog="Extrude"]
  title: "Extrude",              // shown upper-case in the title bar ("EDIT FEATURE" when editId is set)
  icon: "Extrude",               // id passed to icons.icon() for the title-bar icon (default: id)
  editId: null,                  // feature id when editing (Edit Feature); preview uses {replaceId}
  featureLabel: "Extrude",       // undo label ("Edit <label>" when editing); default title
  help: "tooltip of the (i) button",
  labelWidth: 134, ctrlWidth: 255,   // optional column widths (label width default: widest label)
  preselect: [...refs],          // refs distributed over the selection rows that accept them
  activate: rowId | false | (dlg) => rowId | false | undefined,  // initial active selection row
                                 // (default: first empty visible selection row; false = none)
  rows: [ ...row defs ],         // see below
  values: {...},                 // initial values (override row defaults)
  init(dlg) {},                  // after dlg.baseState is computed, before the DOM; set dlg.values.* here
  onOpen(dlg) {},                // after DOM + preselection, before the first preview
  onChange(id, dlg, opts) {},    // any value changed (selection or input); may call dlg.set(...)
  build(values, dlg) => feature | null,   // tentative feature for preview / commit (null = not ready)
  validate(dlg) => errorString | null,    // extra OK guard
  manipulators(dlg) => [manip defs],      // re-evaluated after every preview
  prompt(dlg) => "text near the cursor",  // default: the active selection row's prompt
  onCanvasDown(ctx, dlg) => bool,         // custom canvas clicks (e.g. place a primitive's centre)
  onCanvasMove(ctx, dlg) => bool,
  commit(feature, dlg) => any,   // default: dlg.commitFeature(feature)
  afterCommit(result, dlg) {}, onCancel(dlg) {}, onClose(dlg, committed) {},
  afterPreview(dlg) {},          // e.g. extra overlay geometry
  extraPreview(dlg, res) => [{shape, color, opacity}],   // more viewport.setPreview items
  preview: true,                 // false = never call app.preview (selection-only dialogs)
  noFeature: false,              // true = OK does not need build() to return a feature
  showTool: true,                // cut/hole tools shown red via viewport.setPreview
  showOrigin: false,             // keep origin planes/axes visible for picking
  status(dlg) => "1 Profile | Area : 800.00 mm^2",   // bottom-right canvas status (app.setStatus), cleared on close
  toolPreview: "xray",           // hole-style preview: body stays whole, the tool is drawn red see-through
  focusHud: true,                // focus the HUD value box (text selected) when manipulators appear
});
```

Opening a dialog cancels the current one. While open: `app.activeCommand = {id, ok(), cancel(), dialog}`,
`'dialog'` is emitted `{open:true, id, edit}` (and `{open:false, id, ok}` on close), Enter = OK
(canvas or any value field), Esc = Cancel (core), and it cancels itself on `command-start`,
on a document replace (undo/redo/open) and when the sketch environment is entered.

### Row types (all rows: `id`, `label`, `tooltip`, `visible(values, dlg)`, `enabled(values, dlg)`, `default`)

| type | value | extra props |
|---|---|---|
| `selection` | array of refs | `selText(n, dlg)` (button text; default "Select" / "n selected"), `clearButton:false`, `advance:false` (no auto-advance), `kinds:['profile','face',...]`, `meshBodies:true` (body refs of mesh-like bodies are accepted too; default B-rep only), `planar` (faces must be planar), `max` (1 = single), `min` (default 1; 0 = optional), `toggle` (default true: clicking a selected item removes it), `filter(ref, dlg)`, `mapRef(ref, dlg) -> ref \| ref[] \| null` (e.g. face → its edges, face → body), `prompt` |
| `value` | expression string (`"10 mm"`, `"d1/2"`) | `embed:true` (no row: a custom row places `dlg.embedInput(id, cls)`, e.g. the fillet table, hole callouts), `kind:'length'\|'angle'\|'none'`, `positive`, `nonNegative`, `min`, `max`, `integer`, `step` (↑/↓ keys) |
| `dropdown` | option value | `options:[{value, label, icon, disabled}]` (icon = glyph name from glyphs.js), `noCaret` |
| `buttons` | option value | icon toggles, same `options` (disabled ones look normal and explain themselves in a toast) |
| `check` | boolean | |
| `group` | — | `rows:[...]`, `collapsed`, `header(values)` (false = rows shown without a header), `labelWidth`/`labelClip`/`ctrlWidth` (own columns, Fusion-style "Hole Typ..." clipping) |
| `custom` | — | `render(dlg) -> HTMLElement`, `update(el, dlg)` (called on refresh) |
| `text` | — | `text(dlg)` |

`labelFn(values, dlg)` on any row replaces its label text on refresh. `sep:true` draws Fusion's thin divider
above a row (e.g. before Operation), `space:n` adds n px above it, `extra(dlg, re) -> HTMLElement` appends a
control after the row's own (e.g. the hole's flip button).

Value fields select their whole text synchronously on focus (a deferred select-all used to swallow
the first characters typed right after opening Edit Feature) and are never overwritten while the user
types in them. Defaults use Fusion's display format (`"0.00 mm"`, `"0.0 deg"`); `fmt()` gives 2 decimals
for lengths and 1 for angles.

Value rows are evaluated with the document's ParamTable (`M.buildParams(doc)`): invalid
expressions turn red (tooltip = error) and disable OK. A bare number gets the default unit on
change (`15` → `15 mm`).

Selection rows: the active row (blue button) drives `app.selection.filter`; canvas clicks
(`ctx.hit`) add/remove refs of accepted kinds; single rows auto-advance to the next empty row.
Face/edge refs picked on the live preview are remapped onto the *pre-feature* geometry
(`dlg.baseState`) so their indices stay valid, and are highlighted by the dialog itself (not via
`app.selection`); other refs (profiles, sketch curves, origin items, bodies) are mirrored into
`app.selection` so their owners highlight them. Rows accepting origin planes/axes temporarily
call `viewport.setOriginVisible(true)`.

## Dialog object
```
dlg.id, dlg.editId, dlg.values, dlg.touched (Set of ids the user changed), dlg.baseState (state
before the feature: {bodies, sketches, planes}), dlg.feature (last build()), dlg.previewRes
({ok, error, warning, tool}), dlg.previewFeature, dlg.el (.dlg element), dlg.closed
dlg.get(id) / dlg.set(id, value, {user, noPreview, delay}) / dlg.setSelection(id, refs)
dlg.pickRef(rowId, ref)          same as a canvas click on that ref
dlg.activate(rowId|null)         make a selection row active
dlg.num(id) -> number|NaN        evaluated value row;  dlg.evalValue(id, expr?) -> {ok, value, error}
dlg.valueManip(field, {origin, dir, scale=1, sign=1, min, max, fixedDir, id, hudAnchor}) -> distance manip bound to a value row
dlg.angleManip(field, {center, axis, ref, radius, min, max, hudAnchor}) -> arc + grip (revolve)
dlg.taperManip(field, {center, up, side, hudAnchor}) -> screen-sized taper arc + grip (extrude)
dlg.embedInput(id, cls) -> <input> for an embed:true value row;  dlg.openMenu(anchor, [{label, icon, disabled, run}])
dlg.message(text, 'error'|'warning'|'info')
dlg.schedulePreview(ms) / dlg.previewNow() / dlg.refresh()
dlg.ok() / dlg.cancel()
dlg.commitFeature(feature, {hideSketches:[ids], label})   insert at the marker (or replace editId) as one undo step
dlg.manips.screenPoint(id) -> [x, y]   (canvas px) — handy for tests
```
`app.ui.dialog`: `open(spec)`, `current`, `isOpen(id?)`, `ok()`, `cancel()`, `fmt(v, kind)`,
`withUnit(expr, kind)`, `glyph(name, size)`.

## Manipulators
Manip defs: `{id, type:'distance'|'angle'|'taper'|'point', value, text, onDrag(v, final), onText(str, final), hudAnchor}`
(distance: `origin, dir, scale, min, max, fixedDir`; angle: `center, axis, ref, radius`; taper: `center, up, side`;
point: `point, normal, onMove(p, final), box:false`; plane: `center, a, b` (planar square), `look:'ball'|'point'` (view-plane drag), `offPx`, `offDir`, `getStart()`, `onDelta(dv, final, start)`). Move/Copy's triad uses `look:'axis'` distance arrows (`color, len, gap`), plane handles and angle rings with `screenRadius, span, gripAt, color, lineWidth`; the triad sits at the moved centre so it follows the body. Drawn in `viewport.groups.overlay` (on top) at a
constant screen size like Fusion's: a flat block arrow (white with a dark outline, blue with a white rim
when active), a thin arc with a round grip, a blue point handle. Only the ACTIVE manipulator shows its HUD
value box (`.dlg-hud`: dotted grip, underlined `input.dlg-manip-input[data-manip=<id>]`, ⋮ parameter menu)
below-right of the manipulator (kept clear of the docked panel). When manipulators first appear the HUD box
gets focus with its text selected, so "E, 10, Enter" works; Tab / Shift+Tab move the HUD to the next /
previous manipulator (Extrude: distance -> taper); Enter = OK; digits typed on the canvas go to the HUD.

## Commands (Fusion ids) and Edit Feature
Extrude (E), Revolve, Sweep, SolidLoft, FusionHoleCommand (H), PrimitiveBox/Cylinder/Sphere/Torus,
PatternRectangular, PatternCircular, MirrorCommand, FusionPressPullCommand (Q),
FusionFilletEdgesCommand (F), FusionChamferCommand, FusionShellBodyCommand, FusionDraftCommand,
FusionCombineCommand, FusionMoveCommand (M), FusionDeleteCommand (Delete, model mode),
ConstructionPlaneOffsetFromPlaneCommand (+ WorkPlaneOffsetFromPlaneCommand),
ConstructionPlaneAtAngleCommand, ConstructionMidPlaneCommand.
PrimitiveCoil, PrimitivePipe, FusionThreadCommand (`cmd-coil-pipe.js`, `cmd-thread.js`, ISO table in
`threads.js`), FusionSplitBodyCommand, ModifyScale (`cmd-split-scale.js`).
`app.featureEditors` for extrude (press-pull extrudes reopen Press Pull), revolve, fillet, chamfer,
shell, draft, hole, box, cylinder, sphere, torus, cplane, combine, move, mirror, rpattern,
cpattern, loft, sweep, coil, pipe, thread, scale, split.

* **Rectangular / Circular Pattern**: Object Type Features (default, like Fusion) or Bodies (default when
  bodies / faces are preselected); Faces / Components are greyed out. Features: pick timeline items or a
  face a feature made (hole, extrude, revolve, primitives, loft, sweep, coil, pipe, fillet, chamfer) ->
  `{patternType:'features', features:[ids]}`; model.js `patternFeatures` re-creates each feature's tool
  (cut / join) or its fillet / chamfer edges at every instance (instances that miss the body -> warning).

* **Coil**: Plane, Type (Revolution and Height / Revolution and Pitch / Height and Pitch / Spiral), Diameter,
  Rotation, Revolutions, Height, Pitch, Angle (taper), Section (Circular / Square / Triangular (External) /
  (Internal)), Section Position (Inside / On Center / Outside), Section Size, Operation. After the plane: click
  the centre, move + click for the diameter (or type it), then the diameter / height arrows.
* **Pipe**: Path (sketch lines / arcs / circles, Chain Selection, or body edges), Distance (0..1 of the path),
  Section (Circular / Square / Triangular), Section Size, Hollow + Section Thickness, Operation.
* **Split Body**: Body to Split, Splitting Tool(s) (origin / construction plane, face, body), Extend Splitting
  Tool(s) (planar faces become their infinite plane). Extra pieces become new bodies (`<featureId>_<k>`);
  the preview draws the splitting plane.
* **Scale**: Entities, Point (origin point by default, vertex or sketch point), Scale Type Uniform / Non Uniform,
  Scale Factor or X / Y / Z Scale. Non-uniform scaling rebuilds the body from its triangulation (OCCT's general
  transform is not in this build): exact for planar bodies, faceted for curved ones.
* **Thread**: Faces (cylindrical), Modeled, Full Length (else Offset / Length from the high end), Thread Type
  (ISO Metric profile), Size / Designation / Class (sized from the selected cylinder; 6g / 4g6g external, 6H
  internal), Direction. Cosmetic threads keep the geometry and are drawn as helical lines on the face
  (`cosmetic.js`, from `result.threads`); modeled threads cut a 60° helical groove (one-turn sweeps in one
  multi-tool cut, ~0.5 s per turn). Model commands started in the sketch environment finish the sketch first
(`SketchStop`'s run, or `app.setMode('model')`). `run(app, {preselect})` accepts explicit refs.

## DOM hooks (for tests)
`.dlg[data-dialog=<commandId>]` (+ `[data-edit=<featureId>]` when editing),
`[data-input=<rowId>]` on every control (selection buttons expose `data-count`; dropdowns and
button groups expose `data-value` and a `value` property setter), dropdown menu items
`.dlg-dd-menu [data-option=<value>]`, button-group buttons `[data-option=<value>]`,
`[data-action=ok|cancel]`.
