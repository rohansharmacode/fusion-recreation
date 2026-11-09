# createx module: remaining SOLID Create tools

Fusion command ids, dialogs (src/modules/dialogs framework) and timeline feature types registered with
`M.registerFeature` (timeline icon, Edit Feature, undo, save/open work through the core).

| command id | dialog | feature type (timeline name) | file |
|---|---|---|---|
| StockModelCommand (Bounding Solid) | Objects, Type (Relative / Fixed size box, cylinder, tube), Coordinate System group (Orientation: Model orientation, Automatic, Coordinate system, Z axis/plane & X axis; Flip X / Y / Z Axis; Origin Mode: Model origin, Model box point (27 clickable box points on the canvas), Selected point), Axis, Dimensions group (Offset Mode No offset / Symmetrical sides / All directions with Side / Top / Bottom or +-X/Y/Z offsets; Radial / Front / Back Offset; Width (X), Depth (Y), Height (Z) with X/Y/Z Position + Offset; Diameter, Inner Diameter, Length, Position + Offset; Round Up to Nearest), Rigid Group, Model Dimensions | `boundingsolid` (Bounding Solid1), a new component holding the body (`operation: newComponent`) | bounding.js |
| EnclosureCommand (Fluid Volume) | Volume Internal / External, Tool (solid bodies, cap surface bodies, construction / origin planes), Boundary Shape group (Shape Type Box / Cylinder / Sphere / Hemisphere, Shape Direction, Flip Direction, Offset), Split Result | `fluidvolume` (Fluid Volume1), a new component holding the body (one body per volume with Split Result: `<featureId>_<k>`) | fluid.js |
| PatternOnPath | Object Type (Features / Bodies), Objects, Path (sketch curves incl. splines, body edges; chained), Distribution Extent / Spacing, Quantity, Distance, Start Point, Flip, Direction One Direction / Symmetric, Orientation Identical / Path Direction, Suppression (click instance markers on the canvas) | `pathpattern` (PathPattern1); copies `<featureId>_<k>` or re-created features (model.js patternFeatures) | pathpattern.js |
| FusionPatternGeometricCommand (Geometric Pattern) | Object Type Box / Cylinder / Sphere / Custom, Custom Object, Face (planar), Object Distribution group (Rectangular / Circular / Radial / Hexagonal / Triangular, Spacing Type Extent / Increment, U/V Quantity, U/V Distance, U/V Offset, U/V Alignment, Quantity, Radial Distance, Distance, Clear Perimeter, Perimeter Offset), Object Size group (Size Limit 1 / 2, Spread), Orientation, Rotation, Flip, Extent Type Center / Distance, Depth, Operation | `geopattern` (G-Pattern1) | geopattern.js |
| CoordinateSystemCommand | Type Simple / Between Two Faces, Plane 1 / 2, Snap (vertex, sketch point, face, edge, origin), Alignment (axis), X/Y/Z Rotation, X/Y/Z Offset, Flip X / Z; offset arrows on the canvas | `csys` (CoordinateSystem1), Construction folder entry, RGB triad on the canvas | csys.js |
| VolFieldCreateLatticeCommand (Volumetric Lattice) | tabs Setup (Body, Cell Shape Gyroid / Schwarz P / Schwarz D / 2.5D X / Honeycomb / OctetTruss / X / Cross / Custom + Cell Geometry, Cell Size: Proportions, Size or X/Y/Z Direction, Thickness, Lattice Transform: Move / Rotate with X/Y/Z Distance and Angle (arrows and rings on the canvas), Reset), Density (Solidity, Distribution Constant / Gradient Along Path, Path, Start, End), Offset (Add region / Remove region, up to 4 regions: Geometry (faces, bodies, paths, points; clicks on the preview map to the body face), Thickness, Fall Off, Solidity) | `vlattice` (Volumetric Lattice1): the body becomes a `volumetric` body | lattice.js, vox.js |
| VolFieldTextureCommand (Volumetric Texture) | Faces (body or faces), Texture Pattern Perlin / Voronoi / Noise / Leather / Stripe / Wood Grain / Gyroid / Checker Board, Depth, Cell group (Scale, Amplitude, Fractal Depth, Persistence, Seed, Manhattan); tab Clearances (Add region / Remove region, up to 4: Geometry, Thickness, Fall Off: the surface stays plain there) | `vtexture` (Volumetric Texture1): the body becomes a `volumetric` body | lattice.js, vox.js |

Toolbar placement follows shell/spec.js (Fusion 2706 hides Bounding Solid, Fluid Volume and Volumetric Texture
in a Part Design: they are reachable from the S toolbox search). The PCB tools wait for components.

## Feature data
```
boundingsolid {bodies, bsType:'relBox'|'relCyl'|'relTube'|'fixBox'|'fixCyl'|'fixTube', orient:'model'|'auto'|'csys'|'zx',
               csys (csys feature id), zPlane (planeRef) | zAxis (axis ref), xAxis, axis:'x'|'y'|'z', offMode:'none'|'sym'|'all',
               side, top, bottom, px, nx, py, ny, pz, nz, radial, front, back, inner, roundUp, width, depth, height,
               xPos:'center'|'left'|'right', yPos:'center'|'front'|'back', zPos:'center'|'bottom'|'top', xOffset, yOffset, zOffset,
               diameter, length, pos:'center'|'front'|'back', posOffset, flipX, flipY, flipZ, originMode:'model'|'box'|'point',
               boxPoint:[i,j,k] (0 min, 1 centre, 2 max per axis), originPoint (point ref), rigidGroup}
fluidvolume   {volume:'internal'|'external', bodies (solids + cap surface bodies), planes:[planeRef], shape, dir, flip, offset, split}
pathpattern   {patternType?:'features', features | bodies, path:[{sketch, curve}], edges:[{body, p}], distType:'extent'|'spacing',
               quantity, distance, start, flip, dirType:'one'|'sym', orientation:'identical'|'path', suppressInstances:[k]}
geopattern    {objType, custom (body id), faces:[{body, p, n}], distrib:'rect'|'circular'|'radial'|'hex'|'tri', spacing, uq, vq,
               ud, vd, uoff, voff, ualign, valign, quantity, radialDist, dist, clear, perimOff, size1, size2, spread,
               orientation:'parallel'|'face', rotation, flip, extent:'center'|'distance', depth, operation}
csys          {csysType:'simple'|'twoFaces', snap, face1, face2, align (axis ref), xRot, yRot, zRot, xOff, yOff, zOff, flipX, flipZ}
vlattice      {body, cell, proportions, size | sx, sy, sz, thickness, solidity, distribution:'constant'|'path', path, edges,
               startSolidity, endSolidity, startThickness, endThickness, lx, ly, lz, lrx, lry, lrz (Lattice Transform),
               cellGeom (Custom cell: {faces, bodies, curves, edges, points}), regions:[geometry] + rt<i>, rf<i>, rs<i>}
               (older documents: regionFaces, regionThickness, falloff = one region)
vtexture      {body, faces (empty = every face), pattern, depth, scale, amplitude, octaves, persistence, seed, manhattan,
               regions:[geometry] + ct<i>, cf<i> (Clearances)}
```
All numeric fields are expressions with model parameters.

## API for other modules
* Evaluation state `st.csys`: Map csys feature id -> `{id, o, x, y, z}` (world frame). `frameOf(st, id)` in csys.js.
* Body kind `volumetric` (`app.registerBodyKind`): an `st.meshBodies` entry `{kind:'volumetric', mesh}` (welded closed
  triangle mesh). Mesh tools that accept mesh-like bodies (`meshBodies: true`) accept it; STL export includes it.
* Coordinate systems are pickable as `{kind:'feature', id}` (viewport pick provider) and selectable in the browser.
* Rigid Group: `installRigidGroups(app)` wraps `app.components.setTransform(s)`: moving one occurrence of a Bounding Solid
  rigid group (the bounding solid's component + the components of the selected bodies) moves the others by the same rigid
  motion in the same undo step. The new component's frame (`st.occ` T) is the bounding solid's coordinate system.
* markers.js: `markerSet(app)` clickable canvas point markers for dialogs (suppression toggles, box points).
* vox.js: `grid`, `spacingFor`, `meshSDF` (signed distance of a closed triangle mesh), `unsignedDist`, `insideFlags`,
  `march` (naive surface nets iso-surface), `latticeValue`, `textureValue`.
* geom.js: frames and rigid transforms, `bodyTriangles` / `bodyPoints` (cached per shape / mesh), 2D hull, minimum
  rectangle / circle, `buildPath` + `Path` (arc-length sampling with rotation-minimising frames), `fuseMany`.

## Notes and limits
* Volumetric models are sampled on a voxel grid (at most about 0.9 M nodes): sharp body edges are slightly rounded and a
  warning appears when the grid is coarse for the cell size / thickness. The lattice frame is the world axes centred on
  the body box moved / rotated by Lattice Transform. Custom cells use the selected geometry at its real size: one cell of
  Cell Size centred on the geometry is repeated (bodies as solids, faces and paths as plates / beams of Thickness).
  Offset regions below full solidity raise the cell solidity (TPMS) or thickness (beams) near the geometry.
* Geometric Pattern works on planar faces; a custom object is scaled uniformly to the size limits.
* Bounding Solid and Fluid Volume use the components contract: the dialog stores `operation: "newComponent"`, core gives the
  feature `newComp` / `newOcc` and the new bodies belong to that occurrence. Rigid Group: see above.
