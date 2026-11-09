# insertx module (INSERT panel and assembly helpers)

`init(app)` starts each part in a try/catch and publishes `app.insertx = {xref, derive, fasteners, decal, layout}`.
McMaster-Carr (`InsertMcMasterCarrComponentCommand`) is a cloud feature the user deferred: it stays a stub.
Files are read with `<input type=file data-input=...>` (hidden, one per id) and written with `app.download()`.

## Commands
| command id | file | what it does |
|---|---|---|
| `FusionImportCommandFromToolbar` (Insert Component) | xref.js | picks a design file (this app's JSON export), adds it as a new external component (feature `insertcomp`, New Component), then opens Move/Copy on the new occurrence |
| `EIPAssociativeToggleCmd`, `EIPNonAssociativeToggleCmd`, `ReferenceObjectsCmd`, `EIPVisibilityControlCmd`, `EndEditInPlaceCmd` | xref.js | the Edit In Place mode bar (`EIPToolbar`, env `insertx-eip`) for an external component: right-click the component in the browser, Edit In Place |
| `PullDeriveCommand` (Insert Derive) | derive.js | picks a design file, lists its bodies, sketches, construction planes and user parameters; bodies arrive through a `derive` feature, the rest as copies |
| `PushDeriveCommand` (Derive) | derive.js | writes a new design file that derives the selected bodies (and chosen parameters) from this design |
| `FusionFastenersCommand` (Fasteners) | fasteners.js | ISO / ANSI socket head cap screws, hex bolts, hex nuts and plain washers, sized from the hole, with length choice and a washer / nut stack (feature `fastener`, New Component, Fasteners folder in the browser) |
| `FusionFastenerStackAnalysisCommand` | fasteners.js | table of the fastener stacks with fit and thread engagement checks; a row selects the fastener |
| `FusionAddEditDecalCommand` (Decal) | decal.js | image from a file on a face: X / Y distance, Z angle, width / height (Keep Aspect Ratio), opacity, flips, Chain Faces, manipulators; feature `decal` in the Decals folder |
| `ArrangeCommand` (Arrange) | layout.js | shelf layout of components or bodies on an origin / construction plane (Length x Width), a planar face or a sketch profile; Frame Width, Object Spacing, Allow Rotation (feature `arrange`) |
| `SimilarPartsCommand` (Find Similar Components) | layout.js | ranks the components and root bodies of the open design by a shape signature (volume, sorted box sizes, face and edge counts); OK selects them |
| `ReplaceWithPrimitivesCommand` | layout.js | replaces bodies (or the bodies of components) by their bounding box or bounding cylinder (feature `replaceprim`) |

## Document data
- `doc.xrefs = {x1: {id, file, name, stamp, uid, savedAt, doc}}`: link records. `stamp` is the version shown in the
  browser tooltip (v1, v2 ...); `doc` is the linked design (a full document). Edit In Place and Update From File
  replace `doc` and raise `stamp`.
- `insertcomp` `{xref, xv, srcBodies, newBodies, newOcc, newComp, broken?}`: bodies of the linked design (ids in
  `srcBodies`) mapped to host bodies. `broken` (Break Link) keeps the bodies but drops the external badge.
- `eipref` (inside a linked design only) `{refs: [host body ids], T0}`: Reference Objects of Edit In Place.
- `derive` `{xref, xv, srcBodies, newBodies}`.
- `fastener` `{std:'ISO'|'ANSI', kind:'socket'|'hexbolt'|'nut'|'washer', size:'auto'|'M6'|'1/4-20'..., length:'auto'|mm,
  washer, nut, flip, hole: face or edge ref}`; `newBodies` = [screw or main, head washer, nut washer, nut].
  Result: `{size, length, ideal, grip, holeD, name, warning?}`.
- `decal` `{face, image: {name, data (data URL), w, h}, chain, opacity (0..100), x, y, angle, width, height, keep,
  flipH, flipV}`. Result `decal: {body, face, o, n, x, y, w, h, opacity, flipH, flipV}` drives the viewport overlay
  group `insertx-decals`.
- `arrange` `{objects: [{kind:'occurrence', occ} | {kind:'body', body}], envelope: originPlane / cplane / face /
  profile ref, length, width, frame, spacing, rotate}`. Result `{arranged, overflow, warning?}`.
- `replaceprim` `{bodies, shape:'box'|'cylinder', axis:'auto'|'x'|'y'|'z'}`.

## API (`app.insertx`)
- `xref`: `xrefOf(id)`, `externalFeature(oid)`, `isExternal(oid)`, `insertDesign(file, parsed, opts)`,
  `editInPlace(featureId)`, `stopEditInPlace()`, `session()`.
- `derive`: `open(editId?)`, `push()`. `fasteners`: `open(editId?)`, `analyze()`, `plan(feature)`.
- `decal`: `open(editId?)`, `group()`. `layout`: `arrange(id?)`, `similar()`, `findSimilar(ref, threshold)`, `primitives(id?)`.

Shared hook used: `app.ui.browser.registerOccDecorator(fn)` (added for this module in src/modules/browser/index.js)
decorates occurrence rows (link badge, tooltip, Edit In Place / Update From File / Break Link menu items).
