# sheetmetal module: SHEET METAL tab

Rules, flanges, bends, unfold / refold, fold, flat pattern (FLAT PATTERN environment, DXF / STEP export).

Files: `index.js` (registration, Create Flat Pattern, Export dialog, browser folder), `features.js` (base / edge
flange, hem, fold, jog, unfold, refold, fillet, chamfer, rip, corner closure evaluators), `convert.js` (Convert to
Sheet Metal, Lofted Flange, Join by Bend), `geom.js` (sheet metal model, OCCT pieces, re-folding, flat pattern),
`math.js` (rigid transforms, 2D polygons), `rules.js` (default rules, evaluation), `rules-ui.js` (rules dialogs),
`dialogs.js` (command dialogs), `flat.js` (environment, display, DXF), `icons.js`, `style.css`.

## Commands (Fusion ids)
| id | what |
|---|---|
| FusionSheetMetalFlangeCommand | Flange dialog. Type: Flange (Base/Edge/Contour), Hem, Lofted Flange. Profiles -> **Base Flange** (Orientation Side 1 / Side 2 / Center, Operation New Body / New Component, Rule). Open sketch profile (one click selects the connected chain of lines / arcs) -> **Contour Flange** (Distance, Direction One Side / Two Sides / Symmetric, Distance 2, Orientation, Operation, Rule, Bend override; sharp corners get bends of the rule radius, tangent arcs become bends of their own radius). Edges -> **Edge Flange** (Flange Extent Distance / To Object + Offset, Height, Angle, Edge Extents Full Edge / Symmetric / Two Sides / Two Offsets, Height Datum Inner Faces / Outer Faces / Tangent To Bend, Bend Position Inside / Outside / Adjacent / Tangent, Flip, Chain Selection (a picked edge brings its tangent-connected edges on the same flange face), Miter Corners, Override rules: Bend Radius, Relief Shape / Width / Depth). Height arrow manipulator. |
| FusionSheetMetalHemFlangeCommand | Flange dialog with Type Hem: Flat, Open, Rolled, Teardrop, Rope, Double (Gap, Radius, Angle, Setback, Length), Edge Extents, Bend Position, Flip. |
| FusionSheetMetalLoftCommand | Lofted Flange: two profiles (closed profiles, lines, arcs, circles), Brake Form (facets) or Die Form, Orientation. |
| SheetMetalFoldCmd | Fold: Bend Line (sketch line over a flange face), Reference (stationary face), Bend Angle, Line Position Start / Center / End (in the unfolded state), Flip, Bend Radius. |
| FusionSheetMetalJogCommand | Jog: two opposite bends on a sketch line; Offset between the parallel flanges. |
| FusionSheetmetalUnfoldCommand | Unfold: Reference + Unfold all bends or picked Bends. While bends are unfolded the button becomes **Refold** (label, tooltip and icon, through the shell's def.face hook) and opens the Refold dialog. |
| FusionSheetmetalRefoldCommand | Refold: Reference + Refold all bends or picked bends. Cuts made across an unfolded bend are wrapped onto the refolded bend. |
| FusionSheetMetalRipCommand | Rip: an internal edge (closed corner), two points on opposite edges of a face (Gap Width, Offset 1/2) or a bend face. |
| FusionSheetMetalCornerCommand | Corner Closure: two flange edges at an open corner; Alignment Symmetric Gap (miter) / Overlap Gap (+ Flip Overlap, Overlap 0..1 of the other flange's thickness), Gap, 2-Bend Corner Override: Relief Shape (Round, Square, Tear, Trim to Bend, Linear Weld, Arc Weld, Laser Weld), Relief Size, Relief Placement (Intersection, Tangent, Vertex); without the override the rule's 2-bend relief is cut. |
| FusionSheetMetalFilletCommand / FusionSheetMetalChamferCommand | Fillet / chamfer of thickness edges (corners of flanges), so the flat pattern follows. |
| FusionJoinByBendCommand | Join by Bend: an edge on each of two sheet metal bodies (parallel edges, same thickness) -> one body with a new bend and connecting flange. Face extension Aligned (connector sides run from one edge's ends to the other's) / Perpendicular (connector square to the edges, first edge's width); the first flange is extended up to the bend when needed. |
| ConvertToSheetMetalCmd | Convert to Sheet Metal: Source face; detects the thickness, recognises flanges (parallel face pairs), existing cylindrical bends and sharp corners (rebuilt as bends of the rule radius, outer faces kept); closed corners become seams that need a Rip before unfolding. |
| FusionSheetMetalRulesCommand | SHEET METAL RULES: rules In this design (set default, edit, duplicate, copy to library, delete unused) and the Library (copy to design, use). Rule editor: Rule Name, Thickness, K Factor, Miter gap, Bend Conditions, Corner Conditions. Edits are undoable and update every sheet metal feature. |
| FusionSheetMetalRulesLibraryCommand | SHEET METAL RULES LIBRARY: Fusion's six default rules (read only) plus local rules (localStorage). |
| FusionSheetMetalFlatPatternCmd | Create Flat Pattern: click the stationary face, enters FLAT PATTERN (FlatPatternSolidTab). |
| ExportFlatPatternCmd | (flat pattern only) File Type DXF / STEP, Flat Pattern Name, Units, Center Lines, Extent Lines, Splines to Polylines; through app.download. |
| FusionSheetMetalExitFlatPatternCmd | FINISH FLAT PATTERN. |

Timeline types (M.registerFeature, Edit Feature reopens the dialog): smBaseFlange, smEdgeFlange, smContourFlange, smHem, smLoft, smFold,
smJog, smUnfold, smRefold, smRip, smCorner, smFillet, smChamfer, smConvert, smJoinBend.

## Data
* `doc.sheetMetal = {rules:[rule], active, components:{componentId: ruleId}, flats:{bodyId:{face:{body,p,n}}}, rev}`.
  A rule: `{id, name, material, units, thickness, kFactor, bendRadius, miterGap, reliefShape, reliefWidth, reliefDepth,
  reliefRemnant, corner2Shape, corner2Size, corner2Placement, corner3Shape, corner3Radius}` (expressions; `Thickness`
  is the rule's own thickness). Defaults: Fusion's library (Steel / Stainless Steel / Aluminum, mm and in).
  Rule edits bump `f.rv` on every `sm*` feature so cached evaluations re-run.
* Rules are document-level: a base flange may name its rule (`f.rule`), else the default (`active`). Per-component hook:
  `rules.ruleFor(doc, componentId)` already reads `doc.sheetMetal.components[componentId]` first.
* Evaluation: a sheet metal body is a solid with `st.bodies.get(id).sheetMetal = {rule, thickness, kFactor}` (mirrored to
  `doc.bodies[id].sheetMetal`) plus `st.smData.get(id)`: one flat coordinate system (u, v, w; sheet at w0..w0+T),
  `flanges {id, bend, seeds}` and `bends {parent, child, o, d, q, s0, s1, A, sgn, R, K, flat}`. Flange placement =
  frame x B(b1) x B(b2) ... with B = Rot(axis, A) x Trans(-BA q), BA = A (R + K T): unfolding is exact for the K-factor.
* Geometry stays a real solid: other features (holes, cuts) on sheet metal bodies are kept. Re-folding cuts the solid
  into flange pieces (prisms of their bottom faces, found by seed points), bend pieces and flat strips, moves them and
  re-wraps bends; the flat pattern unwraps the actual bend faces, so cuts across bends show in the flat pattern.

## Shared hook (shell)
shell/common.js cmdInfo honours an optional def.face(app) -> {label, tooltip, icon} on real commands; the toolbar redraws the
button icon when it changes (used by Unfold -> Refold).

## API for other modules
`app.ui.sheetMetal = { flatOf(bodyId) -> {fp:{solid, frame, data, lines}, body, d}, flatDXF(fp, opts) -> string,
enterFlat(bodyId), exitFlat(), flatActive (body id or null), rules (rules.js) }`.

## Limits
Edge flanges need straight edges (a tangent chain through arcs keeps its straight edges only); a contour flange joined to a
sheet metal edge is not built (contour flanges make new bodies). Corner Closure: Width Extents, Bend Transition and the
3-bend corner override are not offered (only 2-bend corners occur). Join by Bend: Relief shape has no effect because the new
bend always spans the first edge. A body moved or patterned after its last sheet metal feature loses its sheet metal placement (new flanges on it
fail with a message). Cosmetic Bend (surface flat patterns) stays a stub. Join by Bend needs both sheets facing the same
side.
