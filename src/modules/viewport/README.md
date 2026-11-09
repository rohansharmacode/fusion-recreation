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
