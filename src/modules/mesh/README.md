# mesh module: the MESH tab

Mesh bodies are the `mesh` body kind (`st.meshBodies` entries `{id, kind:'mesh', mesh}`, mesh format in
`src/meshdata.js`). Insert Mesh (inspect module) makes them; this module edits them. Every editing command is a
timeline feature (registered with `M.registerFeature`, Edit Feature reopens its dialog) except inside DIRECT MESH
EDITING, where the result is written into the Base Mesh Feature instead.

Files: `algo.js` (pure mesh algorithms, node-testable), `csg.js` (booleans), `brep.js` (Tessellate / Convert),
`features.js` (feature types), `commands.js` (dialogs), `palette.js` (Mesh Selection Palette, selection rules),
`display.js` (face group colours, quad edges), `direct.js` (Direct Edit environment), `section.js` (Create Mesh
Section Sketch, Fit Curves to Mesh Section), `style.css`.

## Commands (Fusion ids) and feature types

| command | label | feature type (timeline name) | dialog rows |
|---|---|---|---|
| ParaMeshTessellateCommand | Tessellate | meshTessellate (MeshTessellate) | Body (B-rep), Refinement Low/Medium/High/Custom, Refinement Settings (Surface Deviation, Normal Deviation, Maximum Edge Length, Aspect Ratio), Preview. B-rep faces become face groups; the source body is hidden; the mesh is named "<body> (Mesh)" |
| ParaMeshPlanarSectionCommand | Create Mesh Section Sketch | built-in `sketch` | Body, Section Plane, Distance, X / Y Angle. Fixed lines flagged `meshSection:true` |
| ParaMeshEmptyBaseFeatureCommand | Create Base Mesh Feature | meshBase | none: enters DIRECT MESH EDITING |
| ParaMeshRepairCommand | Repair | meshRepair (MeshRepair) | Body, Repair Type (Close Holes / Stitch and Remove / Wrap / Rebuild), Rebuild Type (Fast / Accurate / Blocky), Density, Offset, Quick Analysis, Preview |
| ParaMeshCalculateFaceGroupsCommand | Generate Face Groups | meshFaceGroups (GenerateFaceGroups) | Bodies/Face Groups, Type (Fast / Accurate), Angle Threshold, Boundary Tolerance, Minimum Face Group Size, Preview |
| ParaMeshMergeFaceGroupsCommand | Combine Face Groups | meshMergeGroups (CombineFaceGroups) | Face Groups (2+) |
| ParaMeshCreateFaceGroupCommand | Create Face Group | meshCreateGroup (CreateFaceGroup) | Faces |
| ParaMeshRemeshCommand | Remesh | meshRemesh (MeshRemesh) | Body/Face Groups, Remesh Type (Adaptive / Uniform), Method (Density / Edge Length), Density, Target Edge Length, Shape Preservation, Preserve Sharp Edges, Preserve Boundaries, Preview |
| ParaMeshReduceCommand | Reduce | meshReduce (MeshReduce) | Body/Face Groups, Type (Tolerance / Proportion / Face Count), Tolerance, Proportion, Face Count, Preserve Boundaries, Preview |
| ParaMeshPlaneCutCommand | Plane Cut | meshPlaneCut (MeshPlaneCut) | Body, Cut Plane, Distance (arrow), X / Y Angle, Type (Trim / Split Body / Split Faces), Fill Type (No Fill / Minimal / Uniform), Flip, Preview |
| ParaMeshHollowCommand | Shell | meshShell (MeshShell) | Body, Thickness, Direction (Inside / Outside / Both), Preview |
| ParaMeshCombineCommand | Combine | meshCombine (MeshCombine) | Target Body, Tool Bodies, Operation (Join / Cut / Intersect / Merge), Algorithm, New Component (disabled), Keep Tools, Preview |
| ParaMeshSmoothCommand | Smooth | meshSmooth (MeshSmooth) | Body/Face Groups, Smoothness, Preview |
| ParaMeshSmoothBoundaryCommand | Smooth Boundary | meshSmoothBoundary | Body/Face Groups, Smoothness, Number of Rings, Preserve Shape, Preview |
| ParaMeshReverseNormalsCommand | Reverse Normal | meshReverseNormals (MeshReverseNormals) | Body/Face Group |
| ParaMeshCloseCracksCommand | Close Cracks | meshCloseCracks | Body, Quick Analysis |
| ParaMeshEraseAndFillCommand | Erase And Fill | meshEraseFill | Selection (faces / face groups), Type (Minimal / Smooth / Uniform), Density, Preview |
| ParaMeshBridgeCommand | Bridge | meshBridge | Body/Face Groups (two regions with open boundaries), Density, Allow Face Group Creation, Preview |
| ParaMeshAlignCommand | Mesh Align | meshAlign | From (face / face group), To (plane), Flip, Preview |
| ParaMeshAttractToReferenceCommand | Attract to Reference | meshAttract | Selection, Reference Mesh, Density, Smoothness, Offset, Find Sharp Edges, Preserve Group / Mesh Boundaries, Preview |
| ParaMeshTextureCommand | Texture Extrude | meshTexture (MeshTexture) | Body/Face Groups, Image (file), Projection Type (Planar / Box / Cylindrical / Spherical), Extrude Distance, Extrude Type, Flip, Repeat, Multiplicity, Density, Blend Distance, Preview |
| ParaMeshExtractCommand | Separate | meshSeparate (MeshSeparate) | Body, Type (Mesh Shells / All Face Groups / Select Face Groups / Select Faces), Face Groups, Faces, Multiple Bodies, Keep Body, Preview |
| ParaMeshScaleCommand | Scale Mesh | meshScale (Scale) | Entities, Point, Scale Type, Scale Factor / X / Y / Z Scale (arrow) |
| ParaMeshRemoveCommand | Remove | meshRemove (MeshRemove) | Body |
| ParaMeshConvertCommand | Convert Mesh | meshConvert (Convert Mesh) | Body, Operation (Parametric / Base Feature), Method (Faceted / Prismatic; Organic disabled), Preview. New B-rep body (solid when closed, surface otherwise); the mesh is hidden |
| ParaMeshToQuadMeshCommand | Convert To Quad Mesh | meshQuad (MeshToQuadMesh) | Body/Face Groups, Target Edge Length, Preserve Sharp Edges, Preserve Boundaries, Preview. Quad edges drawn from `mesh.quadPair` |
| ParaMeshBaseFeatureCreateCommand | Direct Edit | meshBase (BaseMeshFeature) | Body: enters DIRECT MESH EDITING on a snapshot of the body |
| ParaMeshBaseFeatureStopCommand | Finish Direct Edit | | `when:'meshedit'` |
| ParaMeshShowSelectionPanelCmd | Mesh Palette | | checkable: Mesh Selection Palette |
| FacegroupsToggleCmd | Display Mesh Face Groups (Shift+F) | | checkable: face group colours |
| FitCurvesToSectionCommand | Fit Curves to Mesh Section | | sketch only: Section, Fit Curve Type (Line / Arc / Circle / Spline / Closed Spline), First / Second Point on Section, Path Direction, Spline Fit Tolerance, Max Curve Deviation |

## Data formats
* Selections in features: `targets: [{body, groups?: [g], tris?: [t]}]` (no groups / tris = whole body). Dialog refs:
  `{kind:'body'}`, `{kind:'meshFace', body, tri, group}` (face group) and `{kind:'meshFace', ..., triOnly:true}` (one face).
* Base Mesh Feature: `{type:'meshBase', items: {bodyId: doc.meshData id}, removed: [bodyIds]}`.
* Texture Extrude keeps its image in the feature as a grey-scale map `{w, h, data: base64 bytes, name}` (max 160 px).
* Mesh results may carry `mesh.quadPair` (Int32 partner triangle per triangle, -1 none) for quad display.

## Mesh Selection Palette
Selection Filter Mesh Bodies / Face Groups / Mesh Faces drives every mesh selection row (`meshRow` in commands.js:
`filter` + `mapRef`); a row lists the modes it accepts and falls back to its first one. Brush Size (px) selects the
faces within that radius of the click; Select Back Faces; Modify Selection Grow / Shrink / Invert / Expand to Face
Group / Expand to Connected act on the active dialog row (or `app.selection`).

## DIRECT MESH EDITING
`enterEnvironment({id:'meshedit', tab:'ParaMeshBaseFeatureTab', finishCommand:'ParaMeshBaseFeatureStopCommand'})`;
the marker is rolled to just after the base feature (restored to the end on finish). A MESH dialog's OK evaluates
the command once after the base feature and stores every changed / new / removed mesh body in the base feature (one
undo step, no timeline entry). Tessellate, Convert Mesh and commands of other modules (Move, Insert Mesh) still add
timeline features after the base feature.

## API
`app.ui.mesh = {open(commandId, {editId, preselect}), palette, display, enterDirect(featureId)}`.
Algorithms: `algo.js` (remesh, reduce, planeCut, section, hollow, fillLoops, bridge, generateGroups, voxelRebuild,
attract, orient, analyze ...) and `csg.js` `boolean(A, B, 'join'|'cut'|'intersect')` work on `{P, T, G}` work meshes
(`fromMesh` / `toMesh`). Node test: `tests/e2e/out/mesh/algo-test.mjs`.

## Limits
Organic conversion (T-Spline) is not available. Shell offsets vertices along mitred normals (very thick walls on
concave regions can self-intersect). Booleans need closed meshes (Repair first). Convert Mesh accepts up to 20000 faces.
