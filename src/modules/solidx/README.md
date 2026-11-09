# solidx module: remaining SOLID Modify and Construct tools

Files: `index.js` (init), `construct.js` (construction axes / points / extra plane modes + their dialogs),
`refs.js` (reference resolution and line / plane / point intersections), `render.js` (axis / point display,
picking, plane preview), `faces.js` (face tools), `occ.js` (OCCT algorithms), `align.js`, `basefeature.js`,
`editface.js`, `automodel.js`, `style.css`.

## Commands (Fusion ids)
| id | dialog rows (Fusion labels) | timeline feature |
|---|---|---|
| ConstructionTangentPlaneCommand | Face, Angle, Reference Object | `cplane` mode `tangent` |
| ConstructionPlanePerpendicularToPlaneCommand | Face, Object (point or line), Distance | `cplane` mode `perpendicular` |
| ConstructionPlaneFromTwoEdgesCommand | Edge 1, Edge 2 | `cplane` mode `twoEdges` |
| ConstructionPlaneFromThreePointsCommand | Point 1, Point 2, Point 3 | `cplane` mode `threePoints` |
| ConstructionPlaneAlongPathCommand | Path, Distance Type (Proportional / Physical), Distance | `cplane` mode `alongPath` |
| ConstructionAxisThroughCylinderCommand | Face (cylinder / cone / torus) | `caxis` mode `cylinder` |
| ConstructionAxisNormalToFaceCommand | Face, Point (optional: the face pick point) | `caxis` mode `normal` |
| ConstructionAxisFromTwoPlanesCommand | Plane 1, Plane 2 | `caxis` mode `twoPlanes` |
| ConstructionAxisThroughTwoPointsCommand | Point 1, Point 2 | `caxis` mode `twoPoints` |
| ConstructionAxisThroughEdgeCommand | Edge | `caxis` mode `edge` |
| ConstructionPointFromPointCommand | Point | `cpoint` mode `vertex` |
| ConstructionPointThroughTwoEdgesCommand | Edge 1, Edge 2 | `cpoint` mode `twoEdges` |
| ConstructionPointFromThreePlanesCommand | Plane 1, Plane 2, Plane 3 | `cpoint` mode `threePlanes` |
| ConstructionPointFromCircleOrSphereCommand | Face/Edge | `cpoint` mode `center` |
| ConstructionPointAtEdgeAndPlaneCommand | Edge, Plane | `cpoint` mode `edgePlane` |
| ConstructionPointAlongPathCommand | Path, Distance Type, Distance | `cpoint` mode `alongPath` |
| FusionOffsetFacesCommand | Faces, Distance (+ arrow) | `offsetface` |
| FusionReplaceFaceCommand | Source Faces, Tangent Chain, Target Faces (faces, planes, bodies) | `replaceface` |
| FusionSplitFaceCommand | Faces to Split, Splitting Tool, Extend Splitting Tool | `splitface` |
| FusionRemoveFacesCommand | Faces | `removefaces` |
| FusionRemoveFeaturesCommand | Bodies, Feature Size, Fillets, Chamfers, Holes | `removefeatures` |
| AlignCmd | Objects (Bodies / Components), From, To, Flip, Angle | `align` |
| BaseFeatureCreationCommand / BaseFeatureStop | BASE FEATURE environment, FINISH BASE FEATURE | `basefeature` |
| EditFaceCommand | Face, Length Factor, Width Factor, control point handles | `editface` |
| AutomatedModelingCommand | Faces to Connect, Bodies to Avoid, Generate Shapes, Alternatives, Volume, Operation | `automodel` |

Every feature has Edit Feature (timeline double-click / browser), undo / redo and a save / open round trip.
Construction planes are named `Plane<n>`, axes `Axis<n>`, points `Point<n>` (Fusion's names).

## Data formats
```
caxis   {mode, face?, point?, p1?, p2?, pt1?, pt2?, edge?}            -> st.axes  Map id -> {id, o, d, seg:[A, B], name}
cpoint  {mode, point?, e1?, e2?, p1..p3?, target?, edge?, plane?, path?, distType, distance (0..1), offset (mm)}
                                                                       -> st.points Map id -> {id, p, name}
cplane  extra modes: tangent {face, angle, ref?}, perpendicular {base, object, offset}, twoEdges {e1, e2},
        threePoints {pt1, pt2, pt3}, alongPath {path, distType, distance, offset}
offsetface {faces:[{body,p,n}], distance}       replaceface {source, target:[toolRef], tangentChain}
splitface {faces, tools:[toolRef], extend}      removefaces {faces}     removefeatures {bodies, size, fillets, chamfers, holes}
align {objType, bodies:[id], from: geo, to: geo, flip, angle}
basefeature {breps: {bodyId: BRep text}, removed: [bodyId]}
editface {face, uCount, vCount, moves: {"a,b": [dx,dy,dz]}}
automodel {faces, avoid:[bodyId], style:'smooth'|'sharp'|'strut', volume, operation, bodies}
```
Stored refs: line `{kind:'edge', body, p} | {kind:'sketchLine', sketch, curve} | {kind:'origin', name} | {kind:'caxis', id}`;
point `{kind:'vertex', body, p} | {kind:'sketchPoint', sketch, point} | {kind:'origin'} | {kind:'cpoint', id}`;
plane = model.js planeRef; toolRef `{kind:'face', body, p, n} | {kind:'origin', name} | {kind:'cplane', id} | {kind:'body', body}`.

## API for other modules
* Selection refs `{kind:'caxis', id}` and `{kind:'cpoint', id}`: the canvas pick provider returns them while the active
  selection filter accepts them, else the plain `{kind:'feature', id}` (browser, Delete, V, rename work as for any feature).
  Dialog rows that list `originAxis` / `originPoint` accept them automatically (framework alias).
* `M.axisFromRef(st, {kind:'caxis', id})`, `U.axisFromRef / refFromAxis / axisLine` (dialogs util) and Scale's point
  handle construction axes / points, so Revolve, Rectangular / Circular Pattern, Plane at Angle and Scale take them.
* `M.registerCPlaneMode(mode, fn(st, f, P) -> {o, x, n})` (model.js) adds construction plane modes.
* `app.ui.solidx.construction`: `{items, screenPoint(id), dispose()}` (axis / point display).
* `occ.js`: `rebuildByCells(shape, faceIdx, targets)` (remove faces and heal with the extended neighbours),
  `offsetFaces`, `replaceFaces`, `splitFaces`, `editFaceShape`, `extendedFace`; `faces.js findFeatures(shape, opts)`.

## Notes
* Healing (Remove Faces / Remove Features / Replace Face / Offset Face): the wasm has no BRepAlgoAPI_Defeaturing. The
  enlarged bounding box is split by every remaining face, the neighbours of the removed faces extended (planes,
  cylinders, spheres) and the target surfaces; cells that stay inside the box and hold material are fused and
  same-domain faces unified. Neighbours of other surface types are not extended (such removals may fail).
* Align moves the body that owns the From geometry. With Objects = Components the owner occurrence is moved through
  model.js `moveOccurrence` (components contract); root bodies move directly.
* Base Feature: features made inside are ordinary while you work; FINISH BASE FEATURE stores the bodies they made or
  changed as BRep text in the base feature and removes them (sketches and construction geometry stay).
* Edit Face works on four-sided faces; the boundary stays fixed so the body stays closed. `moves` are surface
  displacements at the grid nodes: the control displacements solve the separable Bernstein system, so the face passes
  through each dragged handle.
* Automated Modeling is local (Fusion uses a cloud solver): smooth / ruled loft through the face outlines or round
  struts between the face centres, with the Bodies to Avoid cut away.
