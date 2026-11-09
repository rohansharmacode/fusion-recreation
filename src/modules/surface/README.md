# surface module: SURFACE tab tools

The SURFACE tab's CREATE and MODIFY tools, Validate (INSPECT) and Silhouette Split (SOLID > MODIFY), with
Fusion's command ids, dialog labels (from the install's `NaFusionSurfaceUI10.xml` / `NaFusionUI10.xml`
string tables), live preview, OK / Cancel, undo / redo, Edit Feature and save / open. Surface bodies are
OCCT faces / shells: core reports them as the `'surface'` body kind (gold back side, Surface Body icon).

Files: `index.js` (command registration), `features.js` (timeline feature types, DOM-free),
`occ.js` (OpenCascade helpers, DOM-free), `dlg-create.js` / `dlg-modify.js` (dialogs, built on
`app.ui.dialog`), `dlg-util.js` (chain selection, ray picking of preview pieces), `style.css`.
No shared files are edited: feature types go through `M.registerFeature`, kernel work through
`K.R.getOC()` in `occ.js`.

## Commands
| command id | dialog rows | feature type |
|---|---|---|
| SurfaceExtrude | Profiles (profiles, open / closed sketch curves), Start, Direction, Measurement, Extent Type, Distance, Taper Angle (Side 1 / Side 2), Operation (Join / New Body / New Component) | surfExtrude |
| SurfaceRevolve | Profile (profiles, sketch curves, edges), Axis, Project Axis, Extent Type (Angle / Full), Direction, Angle, Operation | surfRevolve |
| SurfaceSweep | Type (Single Path), Profile, Path (sketch curves or edges), Chain Selection, Distance (0..1 of the path), Orientation (Perpendicular / Parallel), Operation | surfSweep |
| SurfaceLoft | Profiles (profiles, sketch-curve chains, edge chains; pick order), Chain Selection, Ruled, Closed, Operation | surfLoft |
| FusionSurfacePatchCommand | Boundary Edges (edges, sketch curves, profiles), Chain Selection (open-edge loop), Continuity (Connected G0 / Tangent G1 / Curvature G2), Interior Rails/Points, Operation | surfPatch |
| FusionSurfaceRuledCommand | Type (Normal / Tangent / Direction), Edges, Chain Selection, Direction, Distance, Angle, Alternate Faces, Mitered Corners, Operation | surfRuled |
| FusionSurfaceOffsetCommand | Faces / Surface Bodies, Chain Selection (tangent faces), Offset Type (Sharp / Rounded), Distance, Operation (New Body / New Component) | surfOffset |
| FusionSurfaceThickenCommand | Faces / Surface Bodies, Chain Selection, Thickness, Thicken Type, Direction (One Side / Symmetric), Operation (all five) | surfThicken |
| SurfaceSculpt (Boundary Fill) | Select Tools (bodies, origin / construction planes), cell list (check boxes or click cells on the canvas), Remove Tools, Operation | surfBoundaryFill |
| FusionExtendCommand | Edges (open edges of surface bodies), Chain Selection, Distance, Extend Type (Natural / Tangent / Perpendicular), Edge Alignment (Free Edges = mitered corners / Align Edges = rounded corners) | surfExtend |
| FusionSurfaceTrimCommand | Trim Tool (surface / solid bodies, planes, sketch curves cut along the sketch normal), then click the pieces to remove (drawn red, click again to keep) | surfTrim |
| FusionSurfaceUntrimCommand | Type (All Edges / External Edges / Internal Edges / Manual), Faces or Edges, Extend, Keep Copy | surfUntrim |
| FusionSurfaceStitchCommand | Stitch Surfaces, Tolerance (0.01 mm), Operation; open edges left are drawn red, closed results become solids | surfStitch |
| FusionSurfaceUnStitchCommand | Faces / Bodies, Chain Selection | surfUnstitch |
| FusionSurfaceMergeCommand | Selection (two or more adjacent faces of one body on one surface) | surfMerge |
| FusionSurfaceReverseNormalCommand | Faces (picks the surface body) | surfReverse |
| FusionSurfaceValidateCommand | Validate Bodies, Checking Level (Basic / Standard), Repair, Gap Healing; live "Validate Summary"; OK without Repair adds nothing | surfValidate (Repair only) |
| FusionPartingLineSplitCmd (Silhouette Split) | View Direction (plane / axis / linear edge), Target Body, Operation (Split Faces Only / Split Solid Body / Split Shelled Body) | surfSilhouette |

All commands start with `beginModelCommand` (finish the sketch, take the preselection as `ctx.preselect`).

## Feature formats (doc.features entries)
Refs: profiles `{sketch, key, c}`, sketch curves `{sketch, curve}`, edges / faces `{body, p[, n][, sig]}`
(re-found by signature / nearest point like every feature), planes = planeRefs, axes = axis refs.
```
surfExtrude   {profiles, curves, dirType:'one'|'two'|'sym', distance, distance2, taper, taper2, startType, startOffset, symMeasure, operation}
surfRevolve   {profiles, curves, edges, axis, revType:'angle'|'full', angle, angle2, dirType, operation}
surfSweep     {profiles, curves, edges, path:{sketch, curves}, pathEdges, distance (0..1), orientation, operation}
surfLoft      {sections:[{profile} | {sketch, curves} | {edges}], ruled, closed, operation}
surfPatch     {edges, curves, profiles, continuity:'G0'|'G1'|'G2', interiorCurves, interiorPoints:[{sketch, point}], operation}
surfRuled     {edges, curves, ruledType:'normal'|'tangent'|'direction', direction:{plane}|{axis}, distance, angle, alternate, mitered, operation}
surfOffset    {faces, surfaces:[bodyIds], offsetType:'sharp'|'rounded', distance, operation}
surfThicken   {faces, surfaces, thickness, thickenType, direction:'one'|'sym', operation, participants?}
surfBoundaryFill {tools:[bodyIds], planes:[planeRef], cells:[{p}] (interior points of the chosen cells), removeTools, operation}
surfExtend    {edges, distance, extendType:'natural'|'tangent'|'perpendicular', alignment:'free'|'align'}
surfTrim      {tools:[bodyIds], toolPlane, toolCurves, remove:[{body, p}] (points on the pieces to remove)}
surfUntrim    {untrimType:'all'|'external'|'internal'|'manual', faces, edges, extension, keepCopy}
surfStitch    {bodies, tolerance, operation}         surfUnstitch {faces, bodies}
surfMerge     {faces}                                 surfReverse  {bodies}
surfSilhouette {view:{plane}|{axis}, bodies:[id], operation:'faces'|'solid'|'shelled'}
surfValidate  {bodies, gap}   (Repair: faces fixed and re-sewn with the gap tolerance)
```
Operation `join` of the surface creators sews the new surface into the visible surface bodies it touches
(the first keeps its id); `new` / `newComponent` make `f.newBody`. Thicken and Boundary Fill use
`M.applyOp` (Join / Cut / Intersect / New Body). Extra result bodies (Stitch pieces, Unstitch faces,
Silhouette Split halves) are `<featureId>_<k>`. Evaluation results carry extra data for the dialogs:
Trim `pieces:[{body, shape, removed}]`, Stitch `free` (open-edge mid points) and `freeEdges` (shape),
Boundary Fill `cells` (count).

## API for other modules
`features.js`: `registerSurfaceFeatures(editors)`, `TYPES`, `sectionsOf(st, {profiles, curves, edges}, bag)`
(wires of profile-like inputs), `surfaceResult(st, f, shape, doc)`, `fillCells(st, f)`, `trimPieces`,
`resolveEdge`, `resolveFaceRef`. `occ.js`: `sketchCurveEdges`, `chainWires`, `prismOf`, `revolOf`,
`loftWires`, `sweepShell`, `fillPatch`, `sew`, `stitch`, `solidOfShell`, `offsetShape`, `thickenShape`,
`splitBy`, `piecesOf`, `untrimmedFace`, `faceWithHoles`, `rulingSamples`, `ruledFromSamples`,
`naturalExtension`, `boundedCells`, `analyze`, `silhouette`, `curtain`.

## Limits (honest notes)
* Tangent / curvature Patch uses OCCT plate filling, which deforms the boundary's best-fit plane: walls
  perpendicular to that plane (a G1 patch on a vertical cylinder rim) cannot be reached; the feature
  then warns. Curvature (G2) is passed to OCCT as G2 but usually behaves like G1.
* Natural Extend marches on the face's underlying surface and lofts through the marched rows (exact for
  planes, a close B-spline approximation for curved faces). Edge Alignment chooses the corner filler
  (Free Edges: mitered, Align Edges: rounded) rather than re-fitting the edges.
* Merge unifies faces that lie on one underlying surface (OCCT UnifySameDomain); faces on different
  surfaces are refused with a message (no surface refit).
* Silhouette Split uses the body's triangulation: a parting line in one plane perpendicular to the view
  (spheres, cylinders, tori ...) splits exactly with that plane; other silhouettes split with a faceted
  curtain (Split Faces Only; Split Solid Body needs a coplanar parting line, like Fusion). Split Shelled
  Body behaves like Split Solid Body.
* Validate counts invalid faces (BRepCheck), face / face contacts (Standard) and small edges; Repair
  re-sews the faces with the gap tolerance. No Small Edge/Face Removal or Refit Bad Surfaces.
* Extent "To Object" and Sweep "Path + Guide Rail" stay disabled, as in the solid dialogs.
