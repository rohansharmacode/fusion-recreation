# inspect module

Fusion's INSPECT tools, the appearance / physical material tools and Manage Materials.
(`mesh.js` and `insert.js` — Insert Mesh and the canvas / mesh-body store — belong to the foundation engineer.)

| command id | name | files |
|---|---|---|
| MeasureCommand (I) | Measure | measure.js, geom.js, overlay.js |
| FusionHalfSectionViewCommand | Section Analysis | section.js, analyses.js |
| FusionCenterOfMassCommand | Center of Mass | section.js, analyses.js |
| InterferenceCheckCommand | Interference | interference.js |
| FusionZebraAnalysisCommand | Zebra Analysis | analysis-cmds.js, surfanalysis.js |
| FusionDraftAnalysisCommand | Draft Analysis | analysis-cmds.js, surfanalysis.js |
| FusionCurvatureMapAnalysisCommand | Curvature Map Analysis | analysis-cmds.js, surfanalysis.js, curvature.js |
| FusionCurvatureCombAnalysisCommand | Curvature Comb Analysis | analysis-cmds.js, surfanalysis.js, curvature.js |
| FusionIsoCurveAnalysisCommand | Isocurve Analysis | analysis-cmds.js, surfanalysis.js, curvature.js |
| FusionEnvironmentMapAnalysisCommand | Environment Map Analysis | analysis-cmds.js, surfanalysis.js |
| FusionAccessibilityAnalysisCommand | Accessibility Analysis | analysis-cmds.js, surfanalysis.js |
| FusionMinimumRadiusAnalysisCommand | Minimum Radius Analysis | analysis-cmds.js, surfanalysis.js, curvature.js |
| AppearanceCommand (A) / PhysicalMaterialCommand | Appearance / Physical Material | appearance.js, library.js |
| MaterialCommand | Manage Materials (Material Browser) | materials.js, library.js |
| FusionPropertiesCommand | Properties | properties.js |
| MaterializedBomHybridCmd | Bill of Materials | bom.js |
| FusionAddCanvasCommand | Canvas | canvas.js (+ insert.js) |

## Surface analyses

Evidence: the install's string table (`NaFusionUI10.xml`: dialog labels, tooltips, prompts; `NaFusion10.xml`:
`*AnalysisDefaultUserName` -> browser names), the Fusion help reference pages and the Fusion API
`*AnalysisInput` pages (defaults). Analyses are **not** timeline features (Fusion API: "analyses are not timeline
features and have no timeline position"); they live in the browser's **Analysis** folder.

| type | dialog rows (order, defaults) | browser name |
|---|---|---|
| zebra | Bodies; Direction Horizontal / **Vertical**; Repeats **20** (1-100); Opacity **100**; Lock Stripes off; High Quality off | Zebra1 |
| draft | Body; Direction (planar / cylindrical / conical face, linear edge, plane, axis, sketch line) + flip; Draft Angle **-2.0 / 2.0 deg** (-15..15); Tolerance Zone on; Tolerance **-0.5 / 0.5 deg** (-5..5); Opacity 100; High Quality off | Draft1 |
| curvatureMap | Bodies; Type **Gaussian** / Principal Minimum / Principal Maximum; Display **Smooth** / Bands and Scale **1.0** (Gaussian); Maximum Limit (Principal Minimum) / Minimum Limit (Principal Maximum); Opacity 100; High Quality off | CurvatureMap1 |
| curvatureComb | Edges (body edges and sketch curves); Density **50** (2-100); Scale **10** | Curvature1 |
| isocurve | Bodies/Faces; Type **U and V** / U / V; Isocurves **5** (1-20); Curvature Combs off (+ Density 50, Scale 10) | IsoCurve1 |
| environmentMap | Bodies; Environment (Photo Booth ...); Rotate 0.0 deg; Apply Mirror on; Opacity 100; High Quality off | Environment Map1 |
| accessibility | Body; Direction; Change Direction **No Change in Direction** / Flip Direction / Both Directions; Opacity 100 | Accessibility1 |
| minimumRadius | Body; Maximum Tool Radius **25.00 mm**; Minimum Radius **0.00 mm**; Optimal Minimum Radius (read-out, "-" if none); Opacity 100; Sharp Edges off | MinimumRadius1 |

Display (surfanalysis.js): extra meshes over the body meshes inside `viewport.groups.bodies` (so Section Analysis
clipping, body visibility and the Bodies toggle apply), never pickable, rebuilt on every `model` / `doc` event
(geometry and curvature cached per display mesh). Picked bodies are kept out of `app.selection` while an analysis
dialog is open so the solid selection highlight does not hide the live preview.

* zebra: reflected parallel light strips (azimuth of the reflected view ray), view-locked unless Lock Stripes
  (then the view rotation at lock time is stored in `lockRot`). High Quality re-meshes the body 5x finer.
* draft: draft angle = asin(n . pull). Fusion's colours: green = OK along the pull direction, blue = OK against
  it, red = not enough draft, yellow / cyan = the tolerance zones (`angle .. angle + tolerance`). Legend bottom-right.
* curvatureMap: exact per-vertex principal curvatures from the B-rep (below). Gaussian: sign(K) sqrt|K| scaled by
  (model size / 4) x Scale onto violet-indigo-blue-green-yellow-orange-red (Bands quantises to 7 bands).
  Principal Minimum: red where the flattest direction's radius exceeds Maximum Limit; Principal Maximum: red where
  the tightest radius is below Minimum Limit, else green.
* curvatureComb / isocurve combs: teeth on the side away from the centre of curvature, coloured blue (low) to red
  (high), dark-blue envelope; Scale 10 makes the tallest tooth 1/10 of the model size.
* isocurve: U lines red-orange, V lines blue, trimmed to the face with the face's UV triangulation.
* environmentMap: chrome (Apply Mirror) or the body colour with reflections, procedural equirect environments
  (PMREM), rotation about the world up axis.
* accessibility: GPU depth map rendered along the direction (orthographic, 2048^2), per-pixel comparison (shadow
  mapping); faces turned away from the tool are unreachable. Both Directions = reachable from either side.
* minimumRadius: concave regions coloured by their radius (red below Minimum Radius, orange-yellow-green-blue up to
  Maximum Tool Radius); Sharp Edges draws concave non-tangent edges thick red. Optimal Minimum Radius = tightest
  concave radius on the selected bodies.

Inferred (not documented by Autodesk, re-check against real Fusion): Gaussian colour scale normalisation, comb /
isocurve colours, legend placement, default Maximum / Minimum Limit (100 / 1 mm), environment pictures.

### Exact curvature (curvature.js, OCCT through replicad)
`bodyCurvature(O, shape, md)` evaluates `BRepAdaptor_Surface.EvalD2` at the face triangulation's own UV nodes
(`BRep_Tool.Triangulation` + `UVNode`), which map 1:1 onto the display mesh's vertex range of each face group;
fallback: `GeomAPI_ProjectPointOnSurf`. Returns per-vertex `k1 >= k2` (convexity sign: convex positive w.r.t. the
outward normal), Gaussian `K`, mean `H`, `minConcave` (tightest concave radius). Also `edgeSamples` (curve EvalD2),
`planarCurveSamples` (sketch curves), `faceIsoCurves`, `concaveSharpEdges`. No three.js: runs in Node too.

## Document format
`doc.analyses = [{id:'a<n>', type, name, visible, ...params}]` (undoable through `app.mutate`, saved with the design):
* bodies: `bodies:[bodyId]`; comb: `edges:[{kind:'edge', body, index, p} | {kind:'sketchCurve', sketch, curve}]`;
  isocurve: `targets:[{kind:'body', body} | {kind:'face', body, index, p, n}]` (edge / face refs re-resolved by
  index + point, then nearest to `p`, after model changes)
* direction (draft / accessibility): `direction` ref (`face|edge|originPlane|originAxis|cplane|sketchCurve`) +
  `dir` (unit vector fallback), draft `flip`, accessibility `mode:'one'|'flip'|'both'`
* zebra `{direction:'vertical'|'horizontal', repeats, opacity, locked, lockRot, highQuality}`; draft `{angleNeg,
  anglePos, toleranceZone, tolNeg, tolPos}` (angle expressions); curvatureMap `{mapType:'gaussian'|'principalMin'|
  'principalMax', display:'smooth'|'bands', scale, maxLimit, minLimit}`; comb `{density, scale}`; isocurve `{uv:'both'|'u'|'v',
  count, combs, density, scale}`; environmentMap `{environment, rotate, mirror}`; minimumRadius `{maxToolRadius,
  minRadius, sharpEdges}`; every coloured analysis `{opacity 0..100}`.

Custom materials a design uses: `doc.customMaterials {id: material}` and `doc.customAppearances {id: appearance}`
(copied in when assigned, so a design renders and weighs the same without the user's libraries).

## Manage Materials (materials.js)
Material Browser window (`.insp-mb[data-window="MaterialCommand"]`, modeless, draggable): Physical / Appearance
tabs, Search, In This Design, Library tree (Favorites, Fusion Material / Appearance Library + categories, user
libraries), item list, Material Editor (Identity / Appearance / Physical; read-only for the Fusion libraries),
Library menu (Create New Library, Open Existing Library..., Export Library..., Rename / Remove Library, Create /
Delete Category), Create menu (Create New Material, Duplicate Selected Material), right-click (Assign to Selection,
Add to <library>, Duplicate, Edit, Rename, Delete), Apply / OK. Fusion stores user libraries in the Autodesk cloud;
here they live in `localStorage["fusionrec.materialLibraries.v1"]` (memory fallback, shown in the footer) and are
exported / opened as JSON files (`app.download`, `<input type=file>`). DOM hooks: `[data-mb-tab]`,
`[data-mb-node="lib:<id>"|"cat:<lib>:<category>"]`, `[data-mb-item=<id>]`, `[data-mb-action=library|new|editor|apply|ok|close]`,
`[data-mb-menu=<action>]`, `[data-mb-field=<name>|props.<key>]`.

## API (`app.ui.inspect`)
```
analyses() -> [{id, type, name, visible, kindLabel, icon, command}]   analysis(id)
setAnalysisVisible(id, v)  removeAnalysis(id)  renameAnalysis(id, name)  editAnalysis(id)
openAnalysis(type, {preselect, editId})        refreshAnalyses()
curvature(bodyId) -> {k1, k2, K, H (Float32Array per display vertex), minConcave, maxAbs, gaussMax}
optimalMinimumRadius(bodyIds) -> mm (Infinity if no concave region)
analysisObjects() -> [{mesh, line, userData}]  (overlay objects, tests)
materialBrowser: {open(ctx), close(), isOpen(), libraries(), window, store}
  store: libraries(), items(kind, libId, category?), categories(kind, libId), inDesign(kind), find(kind, id),
         createLibrary(name), renameLibrary, removeLibrary, exportLibrary(id) -> JSON, importLibrary(json),
         createCategory / deleteCategory(kind, libId, name), addTo(kind, id, libId), create(kind, libId, category),
         duplicate(kind, id), update(kind, id, patch), remove(kind, id), assign(kind, id, refs), onChange(fn)
measure(a, b)  massProperties(ids)  applyAppearance(refs, id)  applyMaterial(refs, id)  appearances  materials
```
library.js: `materialById(id)`, `appearanceById(id)`, `customMaterial(id)`, `physicalProps(material)`,
`setCustomMaterials(app, mats, aps)`; `materialOf(meta)` resolves custom materials too.
Events: `analyses` (list / visibility changed), `materials` (libraries or the design's custom materials changed).
