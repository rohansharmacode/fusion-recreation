# form module: the FORM (T-Spline) contextual environment

Fusion's freeform modelling. **Create Form** (`TSplineBaseFeatureCreationCommand`, SOLID > CREATE) adds a Form feature
to the timeline and enters the FORM contextual environment (`app.enterEnvironment`, tab `FormTab` from shell/spec.js,
marking menu `TSplineEnvironment`, S toolbox "Form Shortcuts"). **FINISH FORM** (`TSplineBaseFeatureStop`) leaves it:
the T-spline bodies become B-rep bodies (solid when closed, surface when open). Double-clicking the Form in the timeline
(Edit Feature) re-enters the environment (the timeline is rolled back to the form while editing). An empty form that was
just created is dropped again on finish.

T-spline bodies are Catmull-Clark control cages (any polygons, quads preferred) with infinitely sharp creases, creased
vertices, boundaries, frozen vertices and mirror / circular symmetry. All of it is implemented here (no T-spline kernel):
`subdiv.js` subdivides, `brep.js` converts, `ops.js` edits.

## Files
| file | content |
|---|---|
| index.js | registrations (commands, feature type, body kind, key bindings), `app.ui.form` |
| feature.js | `form` feature type (`registerFeature`), module state `FORM`, cage evaluation cache, `tspline` body-kind hooks |
| env.js | enter / leave the environment, Create / Finish Form, double-click loop selection, Delete key, display modes |
| cage.js | cage format, topology (edges, adjacency, loops, rings, boundary loops), selection refs, symmetry (partners, symmetrize) |
| subdiv.js | Catmull-Clark subdivision with creases + limit projection, display meshes (smooth / box), edge chains and patch grids |
| brep.js | cage -> OCCT shape: one bicubic B-spline face per cage quad (per corner quad of other polygons), sewn, solid when closed; faceted fallback |
| ops.js | topology and shape operations (pure functions, cage in, cage out) |
| prims.js | primitives and curve-based cages (extrude, revolve, sweep, loft, pipe) |
| curves.js | sketch profiles / curves / edges as world polylines, chaining, corner-preserving resampling |
| view.js | control frame / T-spline edge drawing (render hook), pick hook, selection and hover highlight |
| common.js | edited form access, selection rows for T-spline refs, `openFormDialog` (preview + one undo step) |
| cmd-create.js, cmd-edit.js, cmd-modify.js, cmd-sym.js, cmd-util.js | the command dialogs |
| tsm.js | TSM text files (Insert T-Spline / Save *.tsm) |
| icons.js | original SVG icons of the FORM commands |

## Commands (Fusion ids)
* Environment: TSplineBaseFeatureCreationCommand (Create Form), TSplineBaseFeatureStop (FINISH FORM).
* CREATE: TSplinePrimitiveBoxCommand (Rectangle 2-Point / Center, Length / Width / Height + Faces, Direction, Symmetry
  None / Mirror with Length / Width / Height Symmetry), TSplinePrimitivePlaneCommand, TSplinePrimitiveCylinderCommand
  (open, Diameter Faces / Height Faces, Symmetry None / Mirror / Circular), TSplinePrimitiveSphereCommand (Longitude /
  Latitude Faces), TSplinePrimitiveTorusCommand (Diameter 1 / 2 + Faces), TSplinePrimitiveQuadBallCommand (Span Faces),
  TSplinePrimitivePipe (Path, Global Diameter, Segments, Faces, End Type Open / Square / Spike), TSplineAppendFaceCommand
  (Face, Mode Simple: click 4 corners or several and close on the first, clicked T-spline vertices attach the face to
  that body; Edge: click a boundary edge, then two points; Chain: click a boundary edge, then pairs of points for a strip),
  TSplineExtrudeCommand (sketch profiles / curves, or boundary edges of a T-spline body; One Side / Two Side / Symmetric,
  Distance, Front / Back Faces, Faces, Spacing Uniform / Curvature, Angle), TSplineRevolveCommand (Profile, Axis, Full /
  Angle, Faces, Profile Faces), TSplineSweepCommand (Profile, Path, Faces, Profile Faces, Orientation), TSplineLoft.
  The plane / centre are picked on the canvas like Fusion; manipulators drag the sizes. Operation New Body or New
  Component (the new bodies go into one new component, Component1:1, under the form's component). Round primitives and curve-based
  bodies are fitted so the smooth surface passes through the requested geometry (the control frame lies outside);
  a Box's control frame is the box itself.
* MODIFY: TSplineEditCommand (Edit Form: T-Spline Entity, Transform Mode Multi / Translation / Rotation / Scale,
  Coordinate Space World / View / Local, Selection Filter, Selection Options Grow / Shrink / Loop / Ring / Invert, Soft
  Modification, Numerical Inputs, Display Mode; triad of arrows, plane handles, free ball, rotation rings and a scale
  handle; the numbers accumulate over the drags of one selection (a new selection folds them into the shape);
  **Alt-drag** extrudes the selected faces or boundary edges;
  double-click selects an edge loop / face loop; symmetry is kept), TSplineEditByCurveCmd (driving Bezier curve of degree
  1..5 over an edge chain, control-point handles), TSplineInsertEdgeCommand (Both / Single side, Insert Location, Simple /
  Exact), TSplineSubsetCmd (Subdivide: Simple / Exact, Faces per side), TSplineInsertPointCommand (click two points on
  edges / vertices of one face), TSplineMergeEdgeCmd, TSplineBridgeSubDCmd (faces or boundary edges, Faces, Twists),
  TSplineFillHoleCmd (Reduced Star / Fill Star / Collapse), TSplineEraseAndFillCmd, TSplineWeldCommand (Vertex to Vertex /
  to Midpoint / to Tolerance), TSplineUnWeldCommand, TSplineCreasedEdgeCommand / TSplineUnCreaseEdgeCmd (edges or
  vertices), TSplineBevelEdgeCommand (Relative Offset / Bevel Width, Segments), TSplineSlideEdgeCommand, TSplineSmoothCmd (Selection, or Brush: drag over the surface with a Brush Size),
  TSplineCylindrifyCmd, TSplinePullSubDCmd (Control / Surface Points onto bodies or faces), TSplineFlattenSubDCmd (Best Fit
  / Parallel / Plane), TSplineStraightenCmd (Best Fit / Line / Parallel / Two Points), TSplineMatchCmd (Connected G0 / Tangent G1 / Curvature G2: the
  boundary, then one or two rows inside it follow; targets edges, sketch curves, faces), TSplineInterpolateSubDCmd (Surface Points / Control Points), TSplineThickenCommand (Sharp / Soft /
  No Edge, One Side / Symmetric), TSplineFreezeCmd / TSplineUnFreezeCmd. In the FORM tab, MODIFY > Delete
  (FusionDeleteCommand) and the Delete key remove T-spline faces (holes), edges (merge faces) and vertices; Move/Copy opens
  Edit Form on T-spline selections.
* SYMMETRY: TSplineInternalMirrorSymmetryCmd (master / mirror element -> plane between them),
  TSplineInternalCircularSymmetryCmd (axis + Symmetric Faces), TSplineReflectionMirrorSymmetryCmd (Mirror - Duplicate,
  Weld Center Vertices), TSplineReflectionCircularSymmetryCmd (Circular - Duplicate), TSplineClearSymmetryCommand,
  TSplineIsolateSymmetryCmd. Symmetry lines are drawn green.
* UTILITIES: TSplineToggleTessModeCmd (Display Mode: Box / Control Frame / Smooth; also **Alt+1 / Alt+2 / Alt+3**),
  TSplineRepairBodyCmd (counts + weld / orientation / non-manifold repair), TSplineMakeUniformCmd, TSpline2BRepCommand
  (Convert: T-Spline to BRep, BRep to T-Spline, Mesh to T-Spline; also on the SOLID tab), TSplineCapSettingCommand
  (Enable Better Performance toggle).
* INSERT: TSplineImportCommand (Insert T-Spline: .tsm text, OBJ-style polygon meshes, simple XML); hidden
  TSplineSaveAsTSMCommand (Save *.tsm file of the selected T-spline body).

## Data
Form feature: `{type:'form', id, name, bodies:[cage]}` (no expression fields). Cage (cage.js):
```
{ id: bodyId, v: [[x,y,z]], f: [[vertex indices, CCW from outside]], crease: [[a,b]], cv: [creased vertices],
  frozen: [vertices], iso: [vertices isolated from symmetry],
  sym: null | {type:'mirror', planes:[{o,n}]} | {type:'circular', o, d, count}, converted?: true }
```
Body ids come from `M.nextBody(doc)` when a body is added (names Body1, Body2 ...). Evaluation (`apply`): while the FORM
environment edits the feature, each cage is a `tspline` body in `st.meshBodies` (`{kind:'tspline', mesh: smooth limit
mesh, data:{cage, ev, form}}`); otherwise (and for `converted` cages) a B-rep body in `st.bodies` (`brep.js`, cached by
geometry; bounding box seeded with `K.seedBBox`). Display modes are a view setting (`FORM.display`, not saved).

Refs: `{kind:'tsVertex', body, v}`, `{kind:'tsEdge', body, a, b}` (a < b), `{kind:'tsFace', body, f}`; the pick hook
returns them (point / curve / area hits), view.js highlights them.

TSM text written by Save *.tsm: `tsm 1`, `v x y z`, `f i j k l` (1-based), `crease a b`, `cv i`, `sym mirror ox oy oz
nx ny nz`, `sym circular ox oy oz dx dy dz n`.

## API for other modules (`app.ui.form`)
`state` (FORM: editing, display, perf), `createForm()`, `enter(featureId)`, `finish()`, `setDisplay(mode, ids?)`,
`insertTSplineText(text, name)`, `readTSM(text)`, `writeTSM(cage)`, `cageToShape(cage)`, `cageFromShape(shape)`,
`evalCage(cage)`, `ops` (ops.js), `cage` (cage.js). Event `form` `{action:'enter'|'exit', feature?, reason?}`.

## Limitations
* Pure Catmull-Clark: T-points are represented by n-gons with a vertex in an edge (Insert Edge / Subdivide next to
  unselected faces); "Exact" modes refit the new vertices to the old surface, they do not keep it exactly.
* UnWeld needs edge chains that close or reach a boundary (a lone interior edge cannot open).
* Edit By Curve uses a fitted Bezier driving curve (no curve sketched on the surface).
* Match G1 / G2 keep the T-spline's own tangent / curvature next to the matched boundary (rows move with it); they do
  not blend to the tangent of a target surface.
* The Autodesk TSM file schema could not be checked offline: Insert T-Spline reads this module's text format, OBJ-style
  polygon meshes and XML files that list vertices and faces.
