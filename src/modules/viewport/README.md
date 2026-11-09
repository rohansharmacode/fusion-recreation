# viewport module

three.js canvas: camera and navigation, ViewCube, navigation bar, grid, origin, body display, picking, selection,
highlight, display settings. The public API (`app.viewport`) and refs are in ARCHITECTURE.md ("Viewport", "Refs").

## Body kinds (bodies.js, pick.js, highlight.js)
* Bodies come from `app.allBodies()`: B-rep shapes through `MeshCache.entry(shape)`, mesh-like kinds through
  `MeshCache.meshEntry(mesh, edgesMode)` (cached per mesh object; same entry shape plus `isMesh`).
* Solids: double-sided appearance material. Surfaces: front side in the appearance, back side gold. Meshes: flat-shaded
  facets, edges = open boundary + face-group borders (sharp creases > 30 deg when the mesh has no groups).
* `app.registerBodyKind(kind, {mesh, render, pick, edges})` hooks are used here: `render` adds objects to the body group,
  `pick` adds hits after the built-in ones.
* Picking a mesh gives a `body` hit and a `meshFace` hit (`{body, tri, group, p, n}`); body wins a plain click.
* `setPreview([{mesh: {positions, indices?}}])` previews triangle data like OCCT shapes.

## Commands
Navigation, view, visual style, visibility, grid / snap, ViewCube, selection tools and priorities (see the ownership table
in ARCHITECTURE.md).

## Components
Bodies of hidden components (or of a hidden parent) are not drawn (`app.components.bodyShown`); while a component is
active, bodies outside it are drawn faded (translucent material copy). Display-only occurrence transforms
(`app.components.setDisplayTransform`) set the body group matrices without re-evaluating (`bodies.applyDisplay()`).
`{kind:'occurrence', occ}` refs highlight every body of the occurrence. Select Component Priority
(`SelectComponentPriorityCommand`, priority `'component'`) turns a click on a component's body into its occurrence.
The 'components' app event redraws.

## Feature-face highlight (feature-faces.js, highlight.js)
A feature ref (`{kind:'feature', id}`, or a body ref with the hint `feature: <id>` as the timeline hover sets it)
highlights only the faces that the feature created, or changed when it created none (a Move), like Fusion.
`featureFaces(app, id)` returns `[{body, index}]` or null. Ownership comes from a geometric comparison of every body
before and after each feature (`app.evaluator.cache[i].state` and `K.topoOf`): a face whose surface the previous
shape (or a body the step consumed) does not carry was created by that feature. It is computed on first use and
cached per evaluator state in WeakMaps, so a rebuild only re-compares the steps that changed. The Highlighter draws
one merged mesh of those faces plus their boundary edges (`_feature`), and falls back to the whole bodies when there
is no face information (mesh bodies, sketches, construction planes). `highlighter.handlesFeatures` tells the
browser's feature highlight hook that the viewport draws feature refs itself; `highlighter.featureFaceRefs(id)` is
the same list for tests. Limits: torus and free-form faces match only when identical or through a point probe;
coplanar faces that a later feature merges count as changed by it, not created.
