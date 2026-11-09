# plastic module: PLASTIC tab and plastic-style solid features

Files: `index.js` (feature types + commands), `features.js` (evaluators, DOM-free), `geom.js` (geometry helpers,
DOM-free), `rules.js` (plastic rules data, DOM-free), `rules-ui.js` (Manage / Edit / Assign rule UI), `dialogs.js`
(feature dialogs), `schematics.js` (original line diagrams that explain the letter inputs), `style.css`.

## Commands (Fusion ids, toolbar placement from shell/spec.js)
| id | what it does |
|---|---|
| `FusionRibCommand` | Rib: open sketch lines / arcs thickened across the sketch plane (Thickness Direction Symmetric / One Side; a negative One Side thickness goes to the other side), grown in the sketch plane To Next (to the nearest faces, chain ends extended until they meet a wall) or by Distance (Depth), Flip Direction, Draft Angle with Start From Top / From Bottom, Draft Pull Direction (plane, face, edge or axis; default the depth direction) and Flip Pull Direction, Fillet Radius on the root edges. |
| `FusionWebCommand` | Web: same inputs (no Draft Pull Direction, like Fusion), thickness in the sketch plane, depth along the sketch normal. |
| `EmbossCmd` | Emboss: Sketch Profiles (also sketch text), Faces, Depth, Effect Emboss / Deboss, Alignment (Horizontal / Vertical Distance, Rotation Angle). Works on planar and curved faces (each face is thickened by the depth, MakeThickSolidBySimple, and intersected with the projected profile); on an outer cylinder whose axis lies in the sketch plane the profile is wrapped (arc length kept). |
| `FusionBossCommand` | Boss with Fusion's Boss / Ribs / Web tabs. Boss: Sketch Points between two bodies, Type (Tapped Hole With Flat End / With Tool Tip / Pinned), Flip, Offset Position, Side 1 (Hole Type Simple / Counterbore / Countersink, Step None / In / Out, D1, B1, E1 hole depth, A1 counterbore or countersink diameter, Countersink Angle, C1 / F1 step, boss draft, R base fillet, O offset clearance; Advanced: counterbore / hole / step drafts, fillets R1..R7) and Side 2 (Step, D2, B2, G2 hole depth or pin length, C2 / F2, draft, R, O; Advanced: hole / step drafts, R3..R7). Ribs (per side): Profile Round / Chamfer, Quantity, Thickness, Draft Angle, Rotation Angle, K rib length, L top offset, M / chamfer angle or RR fillet, outer draft, base and outer fillet radii. Web (per side): Angular Spacing Full / Angle, Number of Ribs, Total Angle, Rotation, Thickness, Depth, Draft Angle; webs run radially to the nearest faces. The whole boss (column, step, ribs, webs) is one revolved / extruded tool that runs To Next from the sketch plane to the nearest body face; fillets and drafts of the column and holes are built into the revolved profiles. |
| `FusionLipCommand` | Lip: Type Lip / Groove / Lip And Groove, Path (edges, Tangent Chain), Guide Type Face Guide (Guide Surface, default the planar face holding the path) or Pull Direction (plane or face), Extent 1 / Extent 2 (point, vertex, face or plane: open paths are lengthened to them), A height, B width, C shoulder width (distance from the path), D reveal height (the shoulder outside the lip is lowered), E clearance (Lip And Groove), Groove Shoulder Include / Exclude, side drafts. Lip And Groove cuts the matching groove (B + 2E wide, A + E deep) in the body that rests on the lip. |
| `FusionRestCommand` | Rest: closed Profile, Body, Top Faces (only the areas over these faces get the rest), Thickness, Thickness Direction (Side 1 / Side 2 / Symmetric), Flip, Offset Position, Trim (cuts the rest back to the body outline), Side 1 (Extent All / To Object, Object, Draft Angle: the removal above the landing) and Side 2 (Extent All / To Object, Object, Draft Angle: how far the rest backs the landing; All = through the body). The landing cuts the material beyond the landing plane inside the profile and backs it with a plate of the thickness; a landing off the body fills down to the nearest faces. |
| `FusionSnapFitCommand` | Snap Fit: Type Parallel Hook And Groove / Perpendicular Hook And Groove / Hook And Loop, Selection Mode Manual (Sketch Points) / Automatic (every sketch point of a sketch), Flip, Rotation Type Uniform (Rotation Angle) / Independent (one angle per snap fit) / Aligned (plane, face, edge, axis, sketch line or point, with Flip), Extent Type To Next / Distance (Depth), Hook (A..H, exit / entry angles, Base Fillet Radius, Ribs + M rib width for Hook And Loop), Groove (J, L, M, R corner radius) or Loop (J, L), Hook Undercut (U width, V length, RU corner radius: a U-shaped relief slot around the beam root). The sketch point is the catch face of the beam; the hook sticks out by F in the rotation direction; the groove (pocket, or a window through the wall for Perpendicular) is cut where it overlaps the mating body, the loop (posts + bar) is joined to it. |
| `FusionAssignPlasticRuleCommand` | Assign Plastic Rule: Component (browser occurrence, or a body / face in the canvas; empty = root component), Plastic Rule (design rules, then library rules), Rule Details. Copies a library rule into the design, sets the physical material of the component's bodies and re-derives the rule-linked inputs of its plastic features. |
| `FusionManagePlasticRuleCommand` | Manage Plastic Rules modal: In This Design / Library lists, Rule Details, per rule Edit, Save to Library / Copy to Design, Set as Default (library), Delete (not for a rule in use or the library default), New Plastic Rule. |

All feature commands: live preview, OK / Cancel, undo / redo, Edit Feature (timeline double-click), save / open.

## Data
Feature fields (expression strings get model parameters through `registerFeature` `fields`, listed in `features.js` FIELDS):
```
rib / web {curves:{sketch, curves:[ids]}, thicknessType:'sym'|'one', extent:'next'|'distance', thickness, depth, flip, draft, draftFrom:'top'|'bottom',
           pull?:dirRef, flipPull, fillet}
emboss    {profiles:[{sketch,key,c}], faces:[{body,p,n}], depth, effect:'emboss'|'deboss', hdist, vdist, angle}
boss      {points:[{sketch,point}], flip, bossType:'flat'|'tip'|'pinned', offsetPos, s1Type, s1E, s1A, s1Cs, s1A1, s1R1, s1R2, s2G, and per side
           s1*/s2*: D, B, C, F, Draft, R, O, A2, A3, R3..R7, Step, RibN, RibShape, RibT, RibDraft, RibRot, RibTotal, RibK, RibL, RibM, RibB2, RibRR,
           RibB1, RibBase, RibOuter, WebN, WebSpacing, WebTotal, WebRot, WebT, WebDepth, WebDraft}
lip       {lipType:'lip'|'groove'|'both', edges:[{body,p}], chain, guideType:'face'|'pull', guide?:{body,p,n}, pull?:dirRef, extent1?, extent2?:dirRef,
           height, width, shoulder, reveal, clearance, grooveShoulder:'include'|'exclude', draft1, draft2}
rest      {profiles, body, topFaces?:[{body,p,n}], thickness, direction:'side1'|'side2'|'sym', flip, offset, trim, extent:'all'|'object', object?, draft,
           extent2:'all'|'object', object2?, draft2}
snapFit   {snapType:'parallel'|'perpendicular'|'loop', selectMode:'manual'|'auto', points, autoSketch?, flip, rotationType:'uniform'|'independent'|'aligned',
           rotation, rotations?:[expr], align?:dirRef, alignFlip, bottomExtent:'next'|'distance', depth, hA..hH, hAlpha1, hAlpha2, rootR, hookRibs, ribM,
           gJ, gL, gM, gR, uU, uV, uRU}
dirRef    {kind:'origin',name} | {kind:'cplane',id} | {kind:'axis',axis} | {kind:'sketchPoint',sketch,point} | {kind:'sketchLine',sketch,curve} |
          {kind:'vertex',body,p} | face {body,p,n} | edge {body,p}
rule link {ruleFields:[field ids still at their rule-derived value], plasticRule:ruleId, ruleComp:'root'}
```
Plastic rules live in the document: `doc.plastic = {rules:[rule], assign:{[componentId]: ruleId}}` with
`rule = {id, name, material, units:'mm'|'in', thickness, draftAngle, minimumThickness, maximumThickness, minimumDraftAngle,
nominalRadius, thicknessVariation, knifeEdgeThreshold, revealHeight, clearance}` (expression strings; they may use
`Thickness`, bare numbers use the rule units). The library (8 base rules: ABS (1.5mm) default, ABS (2mm), ABS (0.08in),
PC (2mm), PP (1.5mm), Nylon 6/6 (2mm), POM (1.5mm), HDPE (2mm)) is kept per browser in localStorage
(`fusion-recreation.plasticRules.v1`).

Rule-driven defaults (`rules.js` DERIVE): rib / web thickness = 0.6 x wall thickness (`RIB_RATIO`), draft = rule draft
angle, fillet = nominal radius / 2; boss diameters = hole + 2 x thickness, drafts, base fillets, side 2 offset = clearance;
lip height = thickness, width = thickness / 2, clearance; rest thickness and draft; snap fit A = thickness, C = 0.6 x
thickness. Inputs the user does not change stay linked: editing the rule (Manage Plastic Rules > Edit) or assigning
another rule re-derives them (`RU.rederive(doc, ruleId)`).

## API for other modules
`app.ui.plastic = {rules, openManage(), openAssign({preselect}), types}`: `rules` is `rules.js` (library(),
designRules(doc), effectiveRule(doc, comp), ruleValues(rule), ruleDefaults(type, rule), rederive(doc, id, {comp})).
Components: rules are assigned per component (`doc.components` id, `root` = the design). A body belongs to the component
of the occurrence that owns it (`app.components.ownerOf` + `info(oid).component`); the Assign dialog takes an occurrence
from the browser or a body / face in the canvas. Plastic feature dialogs use the rule of the active component
(`rules-ui.js` `activeComponent`, `componentOfBody`, `componentBodies`).

## Tests
`tests/e2e/scenarios/plastic.mjs` (UI end to end); `tests/e2e/out/plastic/geomtest.mjs` (Node: evaluator volumes).
