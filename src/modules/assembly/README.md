# assembly module (wave 2b)

Joints, as-built joints, joint origins, rigid groups, drive joints, motion links, motion studies, contact sets,
component constraints, the assembly analyses, Component Drag and Add To Assembly.

Files: `math.js` (rigid 3x4 helpers), `solver.js` (pure kinematics), `features.js` (timeline feature types, snap
frames, state <-> solver), `motion.js` (display poses, animation, move wrapper, Component Drag), `contact.js` (mesh
interference for drags), `display.js` (joint glyphs, joint origin triads, snap hover glyph, DOF labels),
`dialogs.js`, `analysis.js`, `study.js`, `index.js` (commands, editors, browser folders), `style.css`.

## Design type
A design with components is a Hybrid Design: the toolbar shows `AssemblePanel` in place of `PartAssemblePanel`
(src/modules/shell/toolbar.js `panelsForTab`, checked again after every evaluation).
**Add To Assembly** (`NewAssemblyFromPartCommand`): saves the part in the local design store (when it has changes), then
opens a new "Untitled" design with the part's features and all its bodies in one component named after the part.
Fusion links the part from the cloud as an external component; this is the local equivalent (a copy).

## Commands (Fusion ids)
| id | what |
|---|---|
| `JointAssembleCmdNew` (J) | Joint: tabs Position (Component 1 / Component 2: Mode Simple, Snap; Alignment: Angle, Offset X/Y/Z, Flip) and Motion (Type Rigid / Revolute / Slider / Cylindrical / Pin-slot / Planar / Ball, Rotate / Slide / Normal / Pitch axis, Animate). Live preview, offset arrows, a snap glyph under the cursor. |
| `JointAsBuiltCmd` (Shift+J) | As-built Joint: Components (two), Type and axes, Position (snap; not for Rigid), Animate. The components stay where they are. |
| `JointOrigin` | Joint Origin: Snap, Angle, Offset X/Y/Z, Flip. Pickable triad; joints snap to it. |
| `RigidGroupCmd` | Rigid Group: Components, Include Children. Relative positions are locked as they were when it was made. |
| `FusionMoveJointsCommand` | Drive Joints: Joint, then one value per degree of freedom (live display preview); OK stores the drive values. |
| `FusionMotionRelationshipCommand` | Motion Link: two joints, their motions and amounts, Reverse, Animate. Joint 2 follows joint 1. |
| `FusionMotionStudyCommand` | Motion Study: Joints, step slider (0..100), keyframes (motion + value at the current step), Duration, Loop, Play. |
| `FusionDragCompControlsCmd` | Component Drag toggle (default on, saved in localStorage): drag a component in the canvas. A free component moves (uncaptured position); a jointed one drives its joints (exact for open chains); pinned ones refuse. |
| `EnableContactSetsCmd` / `EnableAllContactCmd` / `DisableAllContactCmd` | contact mode `doc.contact = {mode:'sets'|'all'}` (absent = off). Contact stops a drag at the first interference (the path is sampled, no tunnelling). |
| `ContactSetCmd` | New Contact Set: Components (2+). `doc.contactSets = [{id, name, occs, suppressed?}]`. |
| `AssemblyMateCommand` | Constrain Components: Type Align / Angle / Center / Tangent and the inputs of that type. |
| `AlignConstraintCmd` | Align: two planes (flush, a planar joint), two axes (concentric, cylindrical) or two points (ball); Offset, Flip. Starts from the nearest position. |
| `AngleConstraintCmd` | Angle between two planar faces / linear edges (Angle, Flip). |
| `MidplaneConstraintCmd` | Center: one or two faces of component 1 centred between two faces of component 2. |
| `TangentConstraintCmd` | Tangent: a cylinder or sphere of component 1 on a plane of component 2 (Flip = other side). |
| `JointConstraintCmd` / `AsBuiltConstraintCmd` | the Joint / As-built Joint dialogs that make a `constraint` feature (ctype `joint` / `asbuilt`). |
| `FusionDOFAnalysisCommand` | toggle: labels on the canvas with the remaining degrees of freedom of each component. |
| `FusionComponentConnectionAnalysisCommand` / `FusionEditComponentConnectionAnalysisCommand` | report of joints / rigid groups per component ("Not connected"); OK stores `doc.connectionAnalysis = {occs}`, Edit reopens it. |
| `FusionAssemblyStatisticsCommand` | counts of components, occurrences, bodies, depth, pinned, joints, constraints, joint origins, rigid groups, links, contact sets. |
| `FusionDuplicateWithJointsCommand` | another occurrence of the selected component plus copies of its joints and rigid groups (one undo step). |

Browser: joints, constraints, rigid groups and motion links in the **Joints** folder (menu: Edit Joint, Edit Joint
Limits, Drive Joint, Animate Joint, Suppress / Unsuppress, then the standard items), joint origins in **Joint Origins**,
**Contact Sets** and **Motion Studies** folders. Edit Joint Limits: per motion Minimum / Maximum / Rest (check +
value), Animate; stored as `f.limits = {rot: {minOn, min, maxOn, max, restOn, rest}, ...}`; a drag ends at the rest value.

## Feature types (timeline)
```
joint       {jointType, occ1, occ2, frame1, frame2 (joint frames local to occ1 / occ2), ref1, ref2 (snap refs),
             angle, offX, offY, offZ (expressions), flip, rotAxis, slideAxis, drive: {rot, slide, ...}, limits,
             asBuilt?, comp1?, comp2?}
constraint  same + ctype 'align'|'angle'|'center'|'tangent'|'joint'|'asbuilt'; angle / tangent / center use
             jointType 'angle'|'tangent'|'center' (radius, sphere, frame3 / frame4 = second faces)
jointorigin {occ1, frame1, ref1, angle, offX, offY, offZ, flip}      -> st.jorigins
rigidgroup  {occs, picked, children, rel: {oid: pose relative to occs[0]}}  -> st.rigid
motionlink  {joint1, dof1, amount1, joint2, dof2, amount2, reverse}     -> st.links
```
A joint holds `T(occ1) = T(occ2) * frame2 * Offset * Motion(drive) * inverse(frame1)`; Offset turns component 1 over
(opposed Z axes) unless Flip. Each joint / link / rigid group evaluation solves the joints known so far
(`features.resolve`) and moves the occurrences with `M.moveOccurrence`, so later features see the moved geometry.
Open chains are exact (breadth-first from the root and pinned components); closed loops and the relation-only
constraints (angle, tangent, center) are relaxed numerically (damped least squares, best effort). When the joints
cannot close a relation constraint, the cluster of component 1 gets a free pose. `doc.motionStudies`,
`doc.contactSets`, `doc.contact`, `doc.connectionAnalysis` are plain document data (saved with the design).
Moves of occurrences (`app.components.setTransform(s)`) are wrapped: jointed components drive their joints, rigid
groups (including Bounding Solid rigid groups of createx) move together, a pinned member holds its group.

## API (`app.ui.assembly`)
`display` (glyph items(), showSnap, renderLabels), `model()`, `solve()`, `dofTable()`, `statistics()`,
`connections(occs)`, `animateJoint(id, {ms, done})`, `stopAnimation()`, `animating()`, `commitDrives({jointId:
{dof: v}}, label)`, `contactMode()`, `contactHits({oid: M})`, `componentDrag`, `lastDrag()`, `playStudy(id, opts)`,
`duplicateWithJoints(ctx)`, `addToAssembly()`.

Shared edits: shell/toolbar.js (panel swap), browser/index.js (`def.browser.node(app, f).menuFirst()`), createx/index.js
(the temporary rigid-group wrapper is no longer installed).
