# sketch module: sketch environment and sketch commands

Engine (no DOM): `src/sketch/` (`sketch.js` model + ops, `solver.js` / `solver2.js` constraints, `regions.js`
profiles, `curves.js` / `curves2.js` curve geometry, `ops2.js` round-7 operations, `autocon.js` AutoConstrain,
`importers.js` SVG / DXF readers). All of it is `app.S.*`.

## Commands (Fusion ids)
Drawing (also start from the model environment: a plane is picked first): DrawPolyline (L), SketchMidpointLine,
rectangles, circles (CircleCenterRadius (C), CircleTwoPoint, CircleThreePoint, CircleTanTanRadius, CircleThreeTangent),
arcs, polygons, slots (incl. ShapeArcSlotThreePoint, ShapeArcSlotCenterTwoPoint), DrawPoint, DrawSpline (fit point),
DrawCVMSpline3D (Control Point Spline, palette Spline Degree 3 / 5), CircleElipse, ConicCurveCmd (Rho in the HUD;
double-click a conic: Edit Conic Curve), MTextCmd (Text / Text On Path; double-click text: Edit Text).
Modify: TrimSketchCmd (T), ExtendSketchCmd, BreakSketchCmd, Offset (O; lines / arcs as chains, splines / ellipses /
conics as fit point splines, sampled adaptively to within 0.002 mm of the exact offset), FilletSketchCmd, three sketch chamfers, MirrorSketchCommand, SketchScaleCmd,
RectangularSketchPatternCommand / CircularSketchPatternCommand (double-click the pattern glyph: Edit Pattern),
BlendG1CurveSketchCmd.
Project / Include: ProjectNewCmd (P), IntersectCmd, Include3DGeometry, IntersectionCurve, ProjectToSurface,
SketchIsoparametricCurve, SpunProfileCmd. Insert: SketchImportSVG, ImportDxfFileCommand.
Constraints: the CONSTRAINTS table in `constraints.js` (incl. ConstraintSmooth = Curvature G2,
SketchPolygonConstraintCmd), ConstraintFix, SketchDimension (D). AutoConstrain: SketchAutoConstraintAndDimCmd (also the
palette button), SketchAutoConstraintAndDimFromDatumCmd, SketchAutoConstrainAndFinish.
Fit point spline handles (right-click a fit point): AddTangentHandle ("Activate Tangent handle"),
DeleteTangentCommand ("Deactivate Tangent Handle"), AddCurvatureHandle ("Activate Curvature handle", adds the
tangent handle too when missing), DeleteCurvatureCommand ("Deactivate Curvature Handle").

## Data (in `feature.sk`, see ARCHITECTURE.md for the base types)
* `cvspline {pts:[controlPointIds], degree:3|5, closed?, knots?}` clamped uniform B-spline (closed: periodic).
* `conic {p1, p2, v, rho}` rational quadratic Bezier p1 -> v -> p2, middle weight rho / (1 - rho), 0 < rho < 1.
* `text {mode:'box'|'path', frame:[4 pointIds] | path:curveId, text, size, heightExpr, spacing, font, bold, italic,
  underline, halign, valign, flipH, flipV, fit, above, layout, glyphs}`: the shaped glyph outlines are stored
  (`glyphs` in em units), so documents open without the font. Glyph contours are profiles (Extrude works on text).
* `c3d {pts3:[[u, v, w]...], closed?, proj:true}` fixed 3D sketch curve (w along the plane normal).
* spline tangent handles: `spline.hd = {fitIndex: handleLineId}`, `spline.hs = {fitIndex: scale}`; the derivative at
  the fit point is (handle end - fit point) * scale.
* spline curvature handles: `spline.hk = {fitIndex: curvatureLineId}`, a construction line from the tangent handle end q
  to a point r of the osculating parabola: with t the unit handle direction, s = (r - a).t, d = (r - a) x t (a the fit
  point), the curvature is 2 d / s^2. The fit is cut at each curvature handle into pieces with G2 ends (`curvFit` in
  `src/sketch/curves.js`), so the curve is G2 there. Neighbouring handles share a cubic span: their speeds are solved
  so the span meets both curvatures (C1 kept); when the handle directions make that impossible, the shared span keeps
  only the tangents.
* constraints: `smooth [curve, spline]` (G2), `polygon {refs:lineIds, loop, turn}`, `rpattern` / `cpattern`
  (`src`, `copies`, quantities / distances / angle as expressions, `sup` suppressed instances; copies follow the source).

## API for other modules (`app.ui.sketch`)
`active`, `sketchId`, `tool`, `toolObject`, `options`, `create(then)`, `edit(id)`, `finish()`, `deleteSelection()`,
`cancelTool()`, `lookAt()`, `data()` (active sketch: `{id, plane, sk, regions, status}`),
`fitPointInfo(items)` -> `{spline, k, point, active, curv}` when `items` is one fit point of a fit point spline.

## Tests
`node tests/sketch_test.mjs`, `tests/sketch_engine2.mjs`, `tests/sketch3_test.mjs` (round-7 engine),
QA scenario `tests/e2e/scenarios/sketch.mjs` (its `round7(t)` drives every round-7 command through the UI).
