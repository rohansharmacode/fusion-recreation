# annotate module: 3D annotations (PMI)

UTILITIES > CREATE PMI after Fusion 2706. Every annotation is a timeline feature (registered with
`app.M.registerFeature`), listed under the **PMI** node of the Browser, drawn on an annotation plane
in the viewport overlay and stored in the document like any other feature (undo/redo, save/open,
Edit Feature, suppress, roll back, rename, Show/Hide, Delete).

## Commands

| id | name | feature type | notes |
|---|---|---|---|
| `LeaderLineNoteCommand` | Note | `pmiNote` | face (dot) / edge or vertex (arrow), leader + landing + text |
| `GeneralNoteCommand` | General Note | `pmiGeneralNote` | screen-fixed text in a canvas corner (Change note quadrant) |
| `DimensionNoteCommand` | Sizes and Dimensions | `pmiDimension` | linear / diameter / radius / angular from 1 or 2 faces, edges, vertices |
| `GeometricToleranceNoteCommand` | Geometric Tolerancing | `pmiGdt` | feature control frame (14 characteristics, modifiers, datums, composite) and/or datum feature symbol; on a surface or under a dimension / hole note |
| `HoleThreadNoteCommand` | Hole/Thread Note | `pmiHoleNote` | reads Hole features (counterbore, countersink, depth, THRU, quantity) and Thread features; bosses too |
| `FusionChangePMISettingsCmd` | Change PMI Settings | (doc.pmi) | PMI folder context menu: Standard, Size, Default Precision / Tolerance, Leading / Trailing Zero, General Note Size |
| `EditLeaderLineNote`, `EditGeneralNote`, `EditDimensionNote`, `EditGeometricToleranceNote`, `EditHoleThreadNote` (hidden) | Edit PMI | | edit the selected annotation |

Dialog flow (all): select geometry, the note follows the cursor on the annotation plane, a click anchors
it (a click on the preview text picks it up again). Change annotation plane cycles the candidate planes;
Alternate annotation plane uses a planar face. Values have Modeled / override / tolerance groups, Units and
precision, Secondary units; Text tabs hold a template where `%1%` (`%2%` ...) are the generated values.
Canvas: click selects, double-click edits, Delete deletes; selecting an annotation highlights its geometry.

## Document data

Common: `{type, refs:[{kind:'face'|'edge'|'vertex', body, p, n?, sig?}], target, plane:{type, n, x},
pos:[du, dv] (text offset in the plane from the anchor), ext (landing, expression), perpendicular, text, hAlign, vAlign,
altFace?, disp:{unit, precision, leading, trailing, abbrev}, secondary:{on, unit, precision}}`.
* `pmiDimension`: `dimType`, `alignment`, `sector`, `lockedSector?`, `modeled`, `value?`, `tol:{on, type, upper, lower, hole, shaft}`, `internal`
* `pmiGdt`: `fcf:{sym, dia, tol, mat, free, tangent, proj:{on, value}, zone, assoc, datums:[{id, mod}], composite:{on, tol, datums}}`,
  `datum:{on, id, leader, ext, offset}`, `annot?` (id of the dimension / hole note it hangs under; then no refs)
* `pmiHoleNote`: `boss`, `through`, `flip`, `quantity`, `dia`, `depth`, `radius`, `cb`, `cs`, `thread` (value groups as above), `snapshot` (last generated lines, shown when orphaned)
* `pmiGeneralNote`: `text, hAlign, quadrant:'ul'|'ur'|'ll'|'lr'`
* `doc.pmi` = PMI settings (`format.js` DEFAULT_SETTINGS); names use `doc.counters['pmi:<stem>']`.

Refs are re-resolved on the model state at the annotation's timeline position (signature, then nearest
point). Lost geometry: the evaluator returns a warning (timeline / browser badge) and the annotation is
drawn orange (orphaned) at its last place.

## API (`app.ui.pmi`)
`features()`, `spec(id)` (`{orphan, warning, selRefs, plane, measured?, lines?}`), `specs()`, `refresh()`,
`settings()`, `renderer.primsOf(id)` (`{segs, tris, texts:[{block, c, H}]}`; `"__preview__"` = dialog preview),
`previewPrims()`, `ctxFor(state)`. Browser: `registerFolder({key:'annotations', label:'PMI'})`.

## Files
`index.js` (registration, Change PMI Settings), `service.js` (evaluation follow-up, preview, picking, highlight),
`annotations.js` (feature -> render spec, evaluator step), `geom.js` (refs, planes, holes, measurements),
`layout.js` (leaders, dimensions, frames), `text.js` (text / symbol / frame painter), `format.js` (numbers,
tolerances, fits, settings), `render.js` (three.js overlay, general notes), `dlgkit.js` (shared dialog rows),
`cmd-*.js` (dialogs), `browser.js` (PMI folder), `icons.js` (original SVG).
Test: `tests/e2e/scenarios/annotate.mjs`.
