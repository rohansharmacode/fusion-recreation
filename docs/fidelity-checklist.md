# Fusion Design workspace: fidelity checklist

This is a checkable list of how the real Fusion Design workspace looks and behaves (desktop build 2706.1.17,
light theme, Z-up, mm). It drives the polish pass. Every item is a concrete check against the recreation:
tick it only after you have seen it working in the running app (screenshot, or `node tests/e2e/run-all.mjs`).

**Source tags** (every claim cites one):

| tag | source |
|---|---|
| `[TT]` | install: `Fusion\UI\FusionUI\Resources\Toolbar\TabToolbars.xml` (tabs, panels, control order) |
| `[MM]` | install: `Fusion\UI\FusionUI\Resources\MarkingMenus\MarkingMenus.xml` |
| `[CD]` | install: `Fusion\UI\FusionUI\Resources\CommandDefinitions\CommandDefinitions.xml` (`HotKey=`, tooltips) |
| `[NT]` | install: `Neutron\UI\Commands\Resources\Toolbar\Toolbars.xml` (application bar/QAT, File menu, Navigation bar) |
| `[ST]` | install: `Fusion\Build\Common\Tools\Localization\StringTable\en-US\*.xml` (exact English labels) |
| `[PB]` | install: `Neutron\Server\Scene\Resources\Environments\PhotoBooth\PhotoBooth.xml` (canvas, sketch, selection colours); sibling environments (`GreyRoom`, `Studio1–7`, …) are in the same folder |
| `[LT]` / `[HIG]` | install: `LightTheme.xbel` / `HIGLightTheme.xbel` (UI widget colours) |
| `[QML]` | install: `Fusion\Toolbar\src\qml\*.qml`, `Fusion\CommandDialog\src\qml\*.qml` |
| `[PM]` | install: `Applications\ParaMesh\UI\ParaMeshUI\Resources\Toolbar\TabToolbars.xml` (MESH tab) |
| `[H-x]` | Autodesk Fusion help (help.autodesk.com/view/fusion360/ENU), page keys listed at the end |
| `[K]` | general knowledge of the shipping product, not found verbatim in a file. **Verify by eye** before treating it as fact |

Test hooks referenced below are the ones in ARCHITECTURE.md (`data-cmd`, `data-tab`, `data-panel`, `data-input`,
`data-action`, `data-node`, `data-feature`, `.tl-marker`, `.sk-palette`, `.sk-input`, `.mm-root`, `.tbx-root`).

**Automated coverage**: `node tests/e2e/run-all.mjs [--parallel=3] [names…]` writes screenshots to `tests/e2e/out/qa/<scenario>/`.

| scenario | checklist sections exercised |
|---|---|
| `toolbar` | §2 tabs/panels/dropdowns/tooltips |
| `core-loop` | §10 sketch entry + HUD, §12a/b/c dialogs, §4 timeline edit, §15 |
| `modeling` | §12 dialogs on an API-made sketch, auto-Cut, Edit Feature, undo of an edit |
| `sketch` | §10 tools/colours/dimensions, §11 palette |
| `viewcube` / `navigation` | §6, §7 (mouse scheme, nav bar, Display Settings, Grid and Snaps) |
| `marking-menu` / `toolbox` | §8, §9 |
| `browser` / `timeline` | §3, §4 |
| `undo-redo` / `save-open` / `parameters` / `shortcuts` | §1, §14, §15 |
| `look` | §0, §5, §12 styling, §13 hover/selection tints (screen pixels) |
| `small-screen` / `robustness` | §16 |

---

## 0. Global look and theme

The current default "Light Gray" theme is the Weave/HIG theme (`HIGLightTheme.xbel`). The older blue-hover theme is
`LightTheme.xbel`. For a modern look, use HIG values.

- [ ] Panel and menu backgrounds are white: `WidgetContainer1/4/9 = #FFFFFF`, `DropDownMenuBackground = #FFFFFF` `[HIG]`.
- [ ] The app chrome behind the panels is light grey: `Container1 #EFEFEF`, `Container2 #E1E1E1` `[HIG]` `[LT]`.
- [ ] Hover on toolbar buttons, menu rows and tree rows is a **neutral grey veil**, `rgba(128,128,128,0.10)` (`HoverContainer1 #8080801A`).
      Pressed or active is `rgba(128,128,128,0.20)` (`DropDownButtonClickedBackground #80808033`) `[HIG]`. (The legacy theme used the blue
      gradient `#D1EBFA→#C6E8F7` with a `#0160BF` outline `[LT]`.)
- [ ] The accent and focus colour is Autodesk blue `#0696D7`: search-box focus border `#0696D7`, halo `#0696D73F`, focus outline `#0696D75A` `[HIG]`.
- [ ] Body text is `#3C3C3C` (`FontNormal1`), secondary text `#737373` (`FontLight1`), active or link text `#0160BF` (`FontActive1`) `[HIG]`.
- [ ] Input borders are `#CCCCCC` (`SearchBoxNormalBorder`, `WidgetOutline2`). Separators are `rgba(0,0,0,0.15)` (`Separator1 #00000026`) `[HIG]`.
- [ ] Tooltips have background `#EFEFEF→#ECECEC` and border `#606060` `[HIG]`.
- [ ] The UI font is Artifakt Element, a sans-serif. Fall back to Segoe UI. Base size is about 12 px and panel labels about 11 px `[K]`.
- [ ] Nothing shows an Autodesk logo, wordmark or the original icon artwork (ARCHITECTURE rule). Help → About says
      "Unofficial hackathon recreation — not affiliated with or endorsed by Autodesk".

## 1. Application bar (top strip)

From left to right `[H-UI]` `[NT]`:
- [ ] **Home** (house icon) `ShowFusionHomeCmd` `[NT]`. It may be a stub. Shortcut Ctrl+0 `[CD]`.
- [ ] **Show Data Panel** (3×3 grid icon) `DashboardModeSwitchCommand` `[NT]`. Ctrl+Alt+P `[CD]` `[H-KS]`.
- [ ] **File** menu (page icon + ▾) `FileSubMenuCommand`. Item order `[NT]`: New Design (Ctrl+N), New Drawing ▸, New Drawing Template, Open… (Ctrl+O),
      Recover Documents, Upload, ─, Save (Ctrl+S), Save As, Save As Latest, Export…, ─, 3D Print, Capture Image, Share ▸, ─, View ▸
      (Show/Hide ViewCube, Browser, Comments, Text Commands, Navigation Bar, Toolbar, Data Panel …, ─, Reset to Default Layout).
- [ ] **Save** (disk icon) `PLM360SaveCommand`, Ctrl+S `[NT]` `[CD]`. An untitled design opens a Save dialog (Name + Location).
- [ ] **Undo** and **Redo** are split buttons (arrow + dropdown history) `UndoDropDown`/`RedoDropDown` `HasSplitter="True"` `[NT]`. Ctrl+Z / Ctrl+Y `[H-KS]`.
      They are disabled (greyed) when there is nothing to undo or redo.
- [ ] The **document tab** shows the design name ("Untitled" for a new design) with a close ✕, and the tab is highlighted white. A **+** (New Design) button follows `[H-UI]`.
- [ ] The right side has `[H-UI]` `[NT]` (QATRight): Autodesk Assistant, Extensions, Job Status (cloud/online), Notification Center (bell), Help (?) ▾,
      and a profile avatar (initials in a circle). All may be stubs, but they must be present and have tooltips.
- [ ] The bar is about 36–40 px tall, light grey with icon buttons and no text labels (except the tab) `[K]`.

## 2. Toolbar: workspace switcher, tabs, panels

- [ ] The far-left workspace switcher reads **DESIGN ▾** (`ActivateEnvironmentCommand`, `ShowText="true"`) `[TT]`. The dropdown lists Design,
      Generative Design, Render, Animation, Simulation, Manufacture, Drawing `[K]`. Ctrl+[ / Ctrl+] cycle workspaces `[CD]` `[H-KS]`.
- [ ] The persistent tabs, in order, are **SOLID · SURFACE · MESH · SHEET METAL · PLASTIC · MANAGE · UTILITIES**. Ids: `SolidTab`, `SurfaceTab`,
      `ParaMeshOuterTab`, `SheetMetalTab`, `PlasticTab`, `ManageTab`, `ToolsTab` (label "UTILITIES") `[TT]` `[PM]`. ASSEMBLY and AUTOMATION are
      mode-specific. MANAGE holds hub-dependent panels (Assign, Release, BOM, Task Management), so personal installs often show
      **SOLID · SURFACE · MESH · SHEET METAL · PLASTIC · UTILITIES** only `[K]`. Tab captions are uppercase, the active tab is underlined or bold, and the hook is `[data-tab="SolidTab"]`.
- [ ] **SOLID tab panels, in order** `[TT]`: CREATE · AUTOMATE (Hybrid only) · MODIFY · ASSEMBLE (Hybrid) / CONFIGURE · CONSTRUCT · INSPECT · INSERT ·
      SELECT (plus ASSEMBLE "New Assembly" in Part mode and POSITION). The minimum to show is **CREATE, MODIFY, ASSEMBLE, CONSTRUCT, INSPECT, INSERT, SELECT**.
      Each panel shows a row of large 32 px icon buttons, with an uppercase caption and ▾ underneath. Clicking the caption opens the full panel dropdown
      (`[data-panel="SolidCreatePanel"]`).
- [ ] The **CREATE promoted buttons** (`<Controls>`) are `SketchCreate`, `Extrude`, `Revolve`, `FusionHoleCommand`, `PatternRectangular`,
      `TSplineBaseFeatureCreationCommand` (Create Form), `AutomatedModelingCommand` `[TT]`.
- [ ] **CREATE dropdown order** `[TT]`: Create Sketch, Create Form, Derive, ─, Automated Modeling, Extrude, Revolve, Sweep, Loft, Rib, Web, Emboss, ─,
      Hole, Thread, ─, Box, Cylinder, Sphere, Torus, Coil, Pipe, ─, Bounding Solid, ─, Pattern ▸ (Rectangular Pattern, Circular Pattern, Pattern on Path,
      Geometric Pattern), Mirror, ─, Thicken, Boundary Fill, ─, Find Features, Enclosure, ─, Create Base Feature, Create PCB ▸, Joint Origin, Timeline Builder.
      Labels come from `[ST]`. The ids are `SketchCreate Extrude Revolve Sweep SolidLoft FusionRibCommand FusionWebCommand EmbossCmd FusionHoleCommand
      FusionThreadCommand PrimitiveBox PrimitiveCylinder PrimitiveSphere PrimitiveTorus PrimitiveCoil PrimitivePipe StockModelCommand PatternRectangular
      PatternCircular PatternOnPath MirrorCommand FusionSurfaceThickenCommand SurfaceSculpt BaseFeatureCreationCommand`.
- [ ] The **MODIFY promoted buttons** are Press Pull, Fillet, Shell, Combine, Split Body, Move/Copy (`FusionPressPullCommand FusionFilletEdgesCommand
      FusionShellBodyCommand FusionCombineCommand FusionSplitBodyCommand FusionMoveCommand`) `[TT]`.
- [ ] **MODIFY dropdown order** `[TT]`: Press Pull, Edit Face, ─, Fillet, Chamfer, ─, Shell, Draft, Scale, Combine, Offset Face, Replace Face, Split Face,
      Split Body, Silhouette Split, ─, Move/Copy, Align, Delete, Soft Delete, ─, Arrange, Simplify ▸, ─, (volumetric lattice items), ─, Physical Material,
      Appearance, Manage Materials, ─, **Change Parameters**, **Compute All**, Compute Unresolved, ─, Convert (T-Spline→BRep), ─, Materialized BOM.
- [ ] The **CONSTRUCT** promoted button is Offset Plane (`ConstructionPlaneOffsetFromPlaneCommand`, alias `WorkPlaneOffsetFromPlaneCommand`). The dropdown
      order is `[TT]` Coordinate System, ─, Offset Plane, Plane at Angle, Tangent Plane, Midplane, Plane Through Two Edges, Plane Through Three Points,
      Plane Tangent to Face at Point, Plane Along Path, ─, Axis Through Cylinder/Cone/Torus, Axis Perpendicular at Point, Axis Through Two Planes,
      Axis Through Two Points, Axis Through Edge, ─, Point at Vertex, Point Through Two Edges, Point Through Three Planes, Point at Center of
      Circle/Sphere/Torus, Point at Edge and Plane, Point Along Path.
- [ ] The **INSPECT** promoted buttons are (Change Awareness), Measure, Section Analysis (`MeasureCommand FusionHalfSectionViewCommand`). The dropdown
      starts Measure, Section Analysis, Interference, Center of Mass, ─, Curvature Comb, Curvature Map, Draft, Environment Map, Isocurve, Zebra,
      Surface Validate … `[TT]`.
- [ ] The **INSERT** dropdown is `[TT]` Decal, Canvas, Insert Mesh, Insert SVG, Insert DXF, Mesh (ParaMesh insert), Insert into Current Design,
      Fasteners, Duplicate with Joints, Derive, Insert McMaster-Carr Component.
- [ ] The **SELECT** dropdown is `[TT]` Select, ─, Window Selection (1), Freeform Selection (2), Paint Selection (3), ─, Selection Tools ▸, ─,
      (Drag Comp Controls), ─, Selection Priority ▸ (Select Body Priority / Face / Edge / Component), Selection Filters ▸ (checkbox list).
- [ ] The **ASSEMBLE** promoted buttons are Insert into Current Design, New Component, Joint `[TT]`. The hotkeys are J and Shift+J `[H-KS]`.
- [ ] Toolbar buttons are **40×40 px with 32×32 px icons** `[QML]` (`ToolbarPanel.qml` preferredWidth/Height 40, `CommandButton.qml`
      icon 32). Panels are separated by a thin vertical divider, with extra-small spacing between buttons `[QML]`.
- [ ] The **panel caption** ("CREATE ▾") sits centred under its buttons, with the caret to the right of the label `[QML]` (`PanelMenuButton.qml`). Its
      hover and pressed background is the neutral grey veil `[QML]`.
- [ ] **Tooltips**: hovering a button for about 0.5 s shows the command name, its shortcut and a one-line description. Waiting longer expands
      it to the long description, from `<ExpandedContent>` in `[CD]` (for example, Extrude: "Adds depth to open or closed sketch profiles or faces."). Tooltips must
      never cover the hovered button `[K]`.
- [ ] Panel dropdown rows have a 16 px icon, label, right-aligned shortcut letter and ▸ for submenus. Each row has the hook `data-cmd`. Clicking a row runs the
      command and closes the menu. Esc or an outside click closes the menu `[K]`.
- [ ] Commands that are not implemented are greyed out or give a toast. They never throw.

### 2a. SKETCH contextual tab (in sketch mode)

- [ ] On entering a sketch, a contextual **SKETCH** tab appears and becomes active. The SOLID/SURFACE tabs stay visible next to it. At the
      far right is a green-check **FINISH SKETCH** panel (`StopSketchPanel` → `SketchStop`), and its dropdown also has "Finish Sketch with AutoConstrain"
      (`SketchAutoConstrainAndFinish`) `[TT]`.
- [ ] The sketch tab panels, in order, are **CREATE · MODIFY · CONSTRAINTS · CONFIGURE · INSPECT · INSERT · SELECT · FINISH SKETCH** `[TT]`.
- [ ] The sketch **CREATE promoted buttons** are Line, 2-Point Rectangle, Center Diameter Circle, Fit Point Spline, Mirror, Sketch Dimension
      (`DrawPolyline ShapeRectangleTwoPoint CircleCenterRadius DrawSpline MirrorSketchCommand SketchDimension`) `[TT]`.
- [ ] **Sketch CREATE dropdown** `[TT]`: Line, Midpoint Line, (Constrainer), Rectangle ▸ (2-Point, 3-Point, Center), Circle ▸ (Center Diameter, 2-Point,
      3-Point, 2-Tangent, 3-Tangent), Arc ▸ (3-Point, Center Point, Tangent), Polygon ▸ (Circumscribed, Inscribed, Edge), Ellipse, Slot ▸
      (Center to Center, Overall, Center Point, Three Point Arc, Center Point Arc), Spline ▸, Conic Curve, Point, Text, ─, Fit Curves to Section, ─,
      Mirror, Circular Pattern, Rectangular Pattern, ─, Project / Include ▸ (Project, Intersect, Spun Profile, ─, Include 3D Geometry, ─, Project
      to Surface, Intersection Curve, Isoparametric Curve), ─, Sketch Dimension.
- [ ] The sketch **MODIFY promoted buttons** are Fillet, Trim, Offset, Blend Curve. The dropdown is Fillet, Chamfer ▸, Blend Curve, Offset, ─, Trim, Extend, Break,
      Sketch Scale, Move/Copy, ─, Change Parameters `[TT]`.
- [ ] The **CONSTRAINTS** buttons, in order, are AutoConstrain, Horizontal/Vertical, Coincident, Tangent, Equal, Parallel, Perpendicular, Fix/Unfix,
      Midpoint, Concentric, Collinear, Symmetry, Curvature (Smooth) `[TT]`. The icons are shown inline (not just in a dropdown).

## 3. Browser (left panel)

- [ ] It is a floating panel at the top-left of the canvas with the header **BROWSER**, a collapse «/» control and a pin. Ctrl+Alt+B toggles it
      (`ShowBrowserCommand`/`HideBrowserCommand`) `[CD]` `[H-KS]`. The hook is `[data-node]`.
- [ ] The root node is the design name with a version badge, for example "(Unsaved)" or "Untitled v1", and a radio-button "active component" icon `[K]`.
- [ ] The default children, in order, are **Document Settings** (▸ Units: mm, Named Views), **Named Views** (▸ TOP, FRONT, RIGHT, HOME), **Origin**
      (▸ O, X, Y, Z, XY, XZ, YZ), **Bodies**, **Sketches**, **Construction**. Labels from `[ST]` (`DocumentSettingsBrowserLabel`, `OriginBrowserLabel`,
      `BodiesBrowserLabel`, `SketchesBrowserLabel`, `BrowserConstructionLabel`). Bodies, Sketches and Construction appear only once they have content `[K]`.
- [ ] Each row has an expand ▸ arrow, an **eye** toggle for visibility, a type icon and a name. The Origin eye is **off (hidden)** in a new design
      `[H-BASIC]` ("To the left of the Origin folder, click Hidden … to show the origin planes"). The hook is `.br-eye`.
- [ ] Clicking the eye hides the item in the canvas immediately, and the eye icon becomes a struck-through or closed eye. V toggles the
      visibility of the current selection (`VisibilityToggleCmd`, hotkey `v`) `[CD]` `[H-KS]`.
- [ ] Bodies are named Body1, Body2 …. Sketches are named Sketch1 …. Double-clicking a name (or right-click → Rename) edits it inline `[K]`.
- [ ] Right-click menus: on a body, Move/Copy, Create Components from Bodies, Show/Hide, Selectable, Isolate, Appearance, Physical Material,
      Properties, Find in Timeline, Rename, Delete. On a sketch, Edit Sketch, Redefine Sketch Plane, Show/Hide, Look At, Rename, Delete `[K]` `[ST]`.
- [ ] Hovering a browser row highlights the matching geometry in the canvas, and selecting a row selects it in the canvas `[K]`.
- [ ] The panel is about 250–300 px wide and semi-opaque white, with tree rows about 22 px high `[K]`.

## 4. Timeline (bottom strip)

- [ ] On the left are the playback controls **Move to Beginning ⏮ · Previous Step ◀ · Play ▶ · Next Step ▶| · Move to End ⏭** (`[data-tl="first|prev|play|next|last"]`)
      `[H-TL]` `[ST]` (`TimelineManagerMoveBeginning/PreviousStep/Play/NextStep/MoveToEnd`). Play becomes **Stop** while it is playing `[ST]`.
- [ ] Each feature is a small icon tile (sketch, extrude, fillet, hole …) in creation order. Hover gives a tooltip with the feature name, for example "Extrude1"
      `[H-BASIC]`. The hook is `[data-feature]`.
- [ ] The **Timeline Marker** is a vertical handle after the last feature. Dragging it left "rolls back" the model: the features after it are greyed
      out and their geometry disappears. Dragging it right rolls forward `[H-TL]`. The hook is `.tl-marker`.
- [ ] **Double-click** a feature to open Edit Feature (for a sketch feature, Edit Sketch) `[K]`.
- [ ] The right-click menu has `[ST]` `[K]`: **Edit Feature** (Edit Sketch for sketches), **Edit Profile Sketch** (extrude/revolve), **Roll Timeline Marker Here**
      (exact label in the string tables; `RollCmd` tooltip: "Move the marker to this feature and shows the design at this point in the timeline"), **Suppress Features** / Unsuppress
      Features, Find in Browser, Find in Window, **Rename**, Create Selection Set, Group, **Delete**, Show Dependencies.
- [ ] Drag a feature to reorder it, but it can't move before a feature it depends on `[H-TL]`.
- [ ] A failed feature turns red and a feature with a warning turns yellow, with a tooltip that gives the error. Suppressed features are drawn struck-through or faded `[K]`.
- [ ] The **Settings** gear is at the far right (`TimelineManagerOptions` → Component Color Swatch, Hide all inactive features, Change to Direct Modeling) `[H-TL]` `[ST]`.
- [ ] The strip is about 36–40 px tall across the bottom of the window, below the canvas `[K]`.

## 5. Canvas background, grid, lighting

- [ ] In the default environment ("Theme (default)" in Display Settings → Environment `[H-NAV]`), the light theme gives a **near-white canvas**. Photo Booth
      has `Background RGB 1 1 1` (white) and `RRTBackground .929 .929 .929` `[PB]`. A very subtle vertical gradient, white at the top and pale
      grey-blue at the bottom (about `#FFFFFF → #DDE3E9`), matches the shipped look `[K]`.
- [ ] The **layout grid** lies on the ground plane (XY, Z-up). The lines are dark grey at about **8 % opacity** (`Grid ARGB 0.08 0.2 0.2 0.2` → `rgba(51,51,51,0.08)`) and
      the layout grid uses the same colour with `scaleFactor 2.0` (major/minor) `[PB]`. The grid adapts its spacing as you zoom and fades into the distance `[K]`.
- [ ] The scene has one directional light in view space (`Direction 0.1 -0.55 -1.0`, gain 0.5) plus IBL ambient, so faces facing the camera are bright and
      no face is ever black `[PB]`.
- [ ] The default body appearance is "Steel - Satin" (light grey, slightly metallic). Model edges are **black** lines (`ModelEdgeColor 1 0 0 0`) `[PB]`.
- [ ] Origin axes are X red, Y green, Z blue (`OriginXAxisColor 1 0 0` …) `[PB]`. Origin and construction planes are orange at 30 % opacity
      (`WorkPlaneColor ARGB 0.3 1 0.647 0` → `rgba(255,165,0,0.3)`), with labels `rgb(230,126,53)` `[PB]`.
- [ ] The view is perspective by default, and the camera menu offers Orthographic, Perspective, and Perspective with Ortho Faces `[H-NAV]` `[H-VC]`.

## 6. ViewCube (top-right of the canvas)

- [ ] It is a cube with named faces **FRONT, BACK, LEFT, RIGHT, TOP, BOTTOM**. Faces are light grey with dark text, and the cube sits on a compass ring `[K]`.
      Z-up: **Front looks from −Y**, Right from +X, Top from +Z (ARCHITECTURE).
- [ ] Clicking a face gives that orthographic view with an animated camera turn of about 0.3–0.5 s. Clicking a corner gives an isometric view. Clicking an edge gives the edge view.
      There are 26 click zones `[H-VC]`.
- [ ] Click-dragging the cube orbits the main camera `[H-VC]`.
- [ ] A **Home** (house) icon appears near the cube on hover and returns to the home view (iso from +x, −y, +z) `[H-VC]`.
- [ ] The hovered face, edge or corner highlights light blue `[K]`.
- [ ] The right-click menu has `[H-VC]` Go Home, Camera ▸ (Orthographic / Perspective / Perspective with Ortho Faces, with a check on the current one), Set current view
      as Home ▸ (Fit to View / Fixed Distance), Reset Home, Set current view as [Front], Reset [Front], ViewCube Size ▸ (Automatic,
      Large, Normal, Small, Tiny).
- [ ] When a face is square-on, small rotate arrows appear: curved arrows to roll 90° and triangle arrows to step to the adjacent face `[K]`.
- [ ] Ctrl+Alt+V toggles the ViewCube (`ShowViewCubeCommand`) `[CD]` `[H-KS]`. The hook is `#viewcube-host canvas`.
- [ ] A small XYZ axis triad (red/green/blue) sits at the cube's bottom-left corner `[K]`.

## 7. Navigation bar (bottom-centre of the canvas, above the timeline)

- [ ] The order is `[NT]` (NavToolbar) `[H-NAV]`: **Orbit ▾** (Free Orbit / Constrained Orbit, remembers the last mode) · **Look At** · **Pan** · **Zoom** ·
      **Fit ▾** (Fit / Zoom Window, remembers the last) │ **Display Settings ▾** · **Grid and Snaps ▾** · **Viewports ▾**.
- [ ] **Display Settings** submenus `[H-NAV]` `[NT]`: Visual Style ▸ (Shaded, Shaded with Hidden Edges, Shaded with Visible Edges Only, Wireframe, Wireframe
      with Hidden Edges, Wireframe with Visible Edges Only), Environment ▸ (Theme (default), Photo Booth, River Rubicon, Dark Sky, Infinity Pool,
      Grey Room, Tranquility Blue), Graphics Preset ▸, Effects ▸ (checkbox list), Object Visibility ▸ (checkbox list), Camera ▸ (Orthographic,
      Perspective, Perspective with Ortho Faces), Ground Plane Offset, ─, Enter Full Screen.
- [ ] **Grid and Snaps** `[H-NAV]`: Layout Grid ☑, Layout Grid Lock, Snap to Grid, Grid Settings…, Incremental Move, Set Increments….
- [ ] **Viewports** `[H-NAV]`: Single View, Multiple Views, Reset Views (plus Synchronize Views).
- [ ] It is a small rounded-corner pill of 16–20 px icons on a white or translucent background `[K]`. Ctrl+Alt+N toggles it `[CD]`. The hook is `#navbar-host [data-cmd]`.
- [ ] **Mouse scheme** `[H-KS]`: Pan = hold MMB, Zoom = wheel (zooms toward the cursor), Orbit = Shift+MMB, Orbit around a point = Shift+click MMB on the model.
      Double-click MMB = Fit `[K]`. F6 = Fit (`FitCommand HotKey F6`) `[CD]`.

## 8. Marking menu (right-click on the canvas)

- [ ] A right-click (a press and release without dragging) opens a **radial menu of 8 wedges** around the cursor, with an **overflow context menu** list below it `[H-MM]`.
- [ ] **Design / solid, positions** `[MM]` (`FusionSolidEnvironment` BaseMenu):
      **N = Repeat [last command]** (`RepeatCommand`), **NE = Press Pull**, **E = Redo**, **SE = Hole**, **S = Sketch ▸** (second tier), **SW = Move/Copy**,
      **W = Undo**, **NW = Delete**. The labels are Repeat <cmd>, Press Pull, Redo, Hole, Sketch, Move/Copy, Undo, Delete `[H-MM]`.
- [ ] Hovering **S (Sketch)** opens the **second tier** `[MM]`: N = Finish Sketch, NE = 2-Point Rectangle, E = Fit Point Spline, SE = Project,
      S = Line, SW = Offset, W = Sketch Dimension, NW = Center Diameter Circle. An up arrow at the centre returns to the first tier `[H-MM]`.
- [ ] The same layout applies in the sketch environment (`FusionSketchEnvironment` is identical) `[MM]`.
- [ ] The overflow list starts `[MM]` `[H-MM]` with the navigation items Pan, Zoom, Orbit (Constrained), Set/Reset Orbit Center, ─, then object-specific
      commands (Edit Feature, Edit Sketch, Fillet, Chamfer, Extrude…, Isolate/Unisolate, Show/Hide, Find in Browser, Find in Timeline,
      Properties), the workspace list, and saved shortcuts.
- [ ] Moving towards a wedge highlights it. Clicking anywhere in the highlighted wedge runs the command. Clicking the centre, clicking outside or pressing Esc dismisses the menu `[H-MM]`.
- [ ] **Gestures** `[H-MM]`: right-press, drag quickly in a direction and release, and the command runs without the full menu being drawn. For example, drag straight down twice for Line,
      down then up-right for 2-Point Rectangle, down then halfway up for Finish Sketch.
- [ ] **Inside an active command** the wedges change to contextual ones: **E = OK**, **W = Cancel** (a right-drag to the right = OK) `[H-MM]` `[K]`.
- [ ] Note the ids. The marking menu uses `UndoCommand`/`RedoCommand` `[MM]`, but this recreation's menus module owns `Undo`/`Redo`, so both should resolve.
      The hook is `.mm-root`.

## 9. S toolbox ("Design Shortcuts")

- [ ] Pressing **S** with the canvas focused opens a small floating panel at the cursor. It has a **Search** box at the top, focused, and below it a grid
      of pinned shortcut icons (by default some of Extrude, Fillet, Hole, Sketch, Press Pull …) `[H-BASIC]` `[H-KS]` ("Model Toolbox | S").
- [ ] Typing filters a dropdown list of matching commands. Enter or a click runs the top match. Each result row has an "Add to Shortcuts" pin
      that adds it to the grid `[H-BASIC]`.
- [ ] Esc or an outside click closes the panel. While a text field has focus, keyboard shortcuts don't fire `[H-KS]` ("Keyboard shortcuts will not work while a text field is active").
- [ ] The hook is `.tbx-root input`.

## 10. Sketch environment: entry, colours, HUD

- [ ] **Create Sketch** (`SketchCreate`, toolbar CREATE first button and marking menu S) with nothing selected **shows the origin planes** XY/XZ/YZ
      as orange translucent squares and prompts "Select a plane or planar face". Hovering a plane highlights it. Clicking one starts the sketch on it `[K]`.
      Selecting a planar body face starts the sketch on that face.
- [ ] The camera **animates to Look At** the sketch plane (about 0.4 s). The XY sketch is viewed from +Z with X to the right `[K]`.
- [ ] The SKETCH contextual tab appears (§2a), along with the **Sketch Palette** on the right (§11), the green FINISH SKETCH button, and a new sketch in the
      browser and timeline. The sketch grid shows on the plane `[K]`.
- [ ] **Sketch colours** `[PB]`:
  - [ ] Under-constrained curves are **blue** `SketchLineColor rgb(5,150,214)` (`#0596D6`).
  - [ ] Fully constrained curves are **black** `SketchFullyConstrainedColor rgb(0,0,0)`.
  - [ ] Fixed curves are **green** `SketchFixedLineColor rgb(148,189,64)`.
  - [ ] **Construction** curves are dashed orange-brown `SketchConstructionColor rgb(140,51,0)` (`#8C3300`).
  - [ ] Projected curves are purple `SketchProjectedLineColor rgb(171,99,207)`.
  - [ ] **Closed profiles** have a light translucent fill. The evidence conflicts: Photo Booth uses `SketchProfileColor ARGB 0.2 0.02 0.59 0.84` → `rgba(5,150,214,0.2)`,
        and the current help says "Show Profile: … blue shading" `[H-SKP]`. The `Studio1–7` environments use `ARGB 0.4 1 0.647 0` → orange at 40% (the classic
        peach look that many tutorials show) `[PB]`. Pick one, make it consistent, and don't use an opaque fill.
  - [ ] Constraint glyphs are green `rgb(148,189,64)`. Conflicting ones are red `rgb(222,33,33)`. A selected constraint is `rgb(5,150,214)` `[PB]`.
  - [ ] Inference lines (dotted alignment guides) are `rgb(0,128,199)` `[PB]`.
  - [ ] Dimensions are black text with thin leaders, driven (reference) dimensions dark grey `rgb(61,61,61)` `[PB]`.
  - [ ] Sketch points are small squares or dots in the curve colour. Endpoints are filled `[K]`.
- [ ] **Line (L)**: click, click … chains segments. The rubber band shows **length and angle HUD input boxes** next to the cursor, and you type a value then Tab to switch
      fields (`.sk-input`). Esc or a double-click ends the chain `[K]`. Holding Shift while hovering a line snaps to its midpoint `[H-KS]`.
- [ ] **2-Point Rectangle (R)**: first click a corner, then move the mouse, and **two dimension input boxes** (width, height) follow the rectangle. Type a number, press Tab, type a number,
      press Enter, and that commits it with two driving dimensions. Clicking the second corner commits it without dimensions `[K]`.
- [ ] **Auto-constraints while drawing**: horizontal/vertical glyphs, coincident to the origin point, and coincident on curves are added automatically and drawn as
      small green glyph boxes `[K]`.
- [ ] **Dimension (D)**: click an entity, then click to place the dimension, and an edit box appears. The value can be an expression like `d1/2` or `20 mm` `[K]`.
- [ ] Drag an unconstrained point and the solver keeps the constraints. Fully constrained geometry turns black `[K]`.
- [ ] **X** toggles Normal/Construction (`SketchConstructionCmd HotKey x`). **T** = Trim, **O** = Offset, **P** = Project, **C** = Circle, **D** = Dimension `[CD]`.
- [ ] **Finish Sketch** (green check button, marking-menu S→N, or `SketchStop`) leaves the camera where it is, switches back to the SOLID tab and keeps the profiles visible `[K]`.
- [ ] When a feature consumes a sketch's profile (Extrude/Revolve OK), the sketch is **auto-hidden**: its browser eye turns off. This is the Preferences → Design
      "Auto hide sketch on feature creation" option, on by default `[K]`.

## 11. Sketch Palette (right side, in sketch mode)

- [ ] It is a floating panel titled **SKETCH PALETTE** with collapsible **Options** (`SKETCH_OPTIONS_GROUP`) `[ST]` `[H-SKP]`. Rows in order:
      Contextual Options (tool-specific), **Linetype** (Construction, Centerline icons), **Look At**, **Sketch Grid** ☑, **Snap** ☑, **Slice** ☐,
      **Show Profile** ☑, **Show Points** ☑, **Show Dimensions** ☑, **Show Constraints** ☑, **Show Projected Geometries** ☑, **3D Sketch** ☐ `[H-SKP]`
      (current string-table labels: "Profile", "Points", "Dimensions", "Constraints", "Projected Geometries", "Construction Geometries", "3D Sketch",
      "AutoConstrain on Finish" `[ST]`).
- [ ] The bottom has a **Finish Sketch** button `[K]`. The hook is `.sk-palette`.
- [ ] Turning a checkbox off immediately hides the corresponding item: profile shading, points, dimensions or constraint glyphs `[H-SKP]`.

## 12. Command dialogs (right-side floating panel)

General `[QML]` `[K]`:
- [ ] The dialog floats at the top-right of the canvas, left of the ViewCube area, about 300–320 px wide. The header holds the command name in uppercase, for example **EXTRUDE**, with
      a ⓘ or ✕ on the right. A divider sits under the header `[QML]` (`InputsPanel.qml`: header, Divider, rows).
- [ ] Each row has the label on the left (about 40 %) and the control on the right. Selection rows show **"Select"** (blue, a pulsing arrow, required) or **"1 selected ✕"**.
      Value rows are text fields that accept expressions (`fx`), with a unit shown, for example `10 mm` `[K]`.
- [ ] The footer is right-aligned, with an ⓘ help icon at the far left. **OK** is solid blue/primary and **Cancel** is an outline button `[QML]` (`DefaultInputsFooter.qml`: OK
      `Button.Solid`, Cancel `Button.Outline`). OK is disabled (faded) until the required selections are made `[QML]` (`commitEnabled`).
      Order: classic Fusion dialogs read **[OK] [Cancel]** left-to-right `[K]`. The 2706 QML footer uses `layoutDirection: Qt.RightToLeft`, which
      puts OK rightmost. Either is acceptable, and [OK] [Cancel] is what long-time users expect.
- [ ] Enter = OK (`CommitCommand HotKey Return`) and Esc = Cancel (`CancelCommand HotKey Escape`) `[CD]`. Inside a command, marking-menu E = OK and W = Cancel.
- [ ] The **live preview** updates as values change. Cut previews are **red** at 30 % (`TBCutPreviewColor ARGB 0.3 1 0 0`), new-body previews follow the body
      appearance, and errors are highlighted red `[PB]`. Hooks: `.dlg[data-dialog=<id>]`, `[data-input]`, `[data-action="ok"|"cancel"]`.
- [ ] The dialog can be dragged by its header and collapsed to a pill `[K]`.

### 12a. EXTRUDE (`Extrude`, E) `[H-EXT]`
- [ ] Rows in order: **Type** (Extrude | Thin Extrude, icon toggle), **Profiles** (selection), **Start** (Profile Plane | Offset | Object), **Direction**
      (One Side | Two Sides | Symmetric), *(Symmetric only)* **Measurement** (Half Length | Whole Length), **Extent Type** (Distance | To Object | All),
      **Distance**, **Taper Angle**, **Operation** (Join | Cut | Intersect | New Body | New Component).
- [ ] With **only one visible profile**, it is auto-selected when Extrude starts `[H-EXT]` ("When you invoke the Extrude tool, and there is only one profile visible in your
      design, it is automatically selected").
- [ ] When it starts with a profile selected, the Distance box is **focused with its text selected**, so the user can type a value straight away and press Enter `[forum]` `[K]`.
- [ ] A blue **arrow manipulator** sits on the profile. Dragging it changes the distance live, and a small HUD distance box shows next to it `[K]`.
- [ ] The default Taper Angle is `0.0 deg`. The Operation defaults automatically: **New Body** in empty space, **Join** when the extrusion touches a body
      in the outward direction, **Cut** when it goes into a body (the dropdown shows the chosen value) `[K]`.
- [ ] Two Sides shows Side 1 / Side 2 groups, each with its own Extent/Distance/Taper `[H-EXT]` (`ExtrudeFeatSide1Dir/Side2Dir` `[ST]`).
- [ ] All shows a **Flip** toggle `[H-EXT]`. When editing a Cut, **Objects To Cut** appears `[H-EXT]`.
- [ ] Labels are verbatim from `[ST]`: "Profiles", "Direction", "One Side", "Symmetric", "Extents", "Distance", "Taper Angle", "Side 1", "Side 2", "Wall Thickness".

### 12b. FILLET (`FusionFilletEdgesCommand`, F) `[H-FIL]`
- [ ] Rows in order: **Type** (Fillet | Rule Fillet | Full Round Fillet), **Edges/Faces/Features** selection with a **selection-set table**
      (columns: Selection Set, Radius Type, Radius, Continuity, with +/✕ buttons), **Radius Type** (Constant | Chord Length | Variable | Asymmetric),
      **Radius**, **Continuity** (Tangent (G1) | Curvature (G2)), **Tangent Chain** ☑, **Tangency Weight**, **Corner Type** (Rolling Ball | Setback).
- [ ] The default radius is **1 mm**, Tangent Chain is on, and Corner Type is Rolling Ball `[K]`.
- [ ] Selected edges highlight blue. A **radius drag arrow** appears on the first edge, and the preview updates live `[K]`.
- [ ] Rule Fillet adds **Rule** (All Edges | Between Faces/Features) and **Round/Fillets** (Rounds and Fillets | Rounds Only | Fillets Only) `[H-FIL]`.

### 12c. HOLE (`FusionHoleCommand`, H) `[H-HOLE]`
- [ ] Rows in order: **Placement** (At Point (Single Hole) | From Sketch (Multiple Holes)), **Face/Point**, **References** (At Point only, edges for
      offset dimensions), **Extents** (Distance | To | All), **Flip**, **Hole Type** (Simple | Counterbore | Countersink), **Hole Tap Type**
      (Simple | Clearance | Tapped | Taper Tapped), **Drill Point** (Flat | Angle), then a **dimension diagram** with Depth, Diameter, Tip Angle
      (plus Counterbore Depth/Diameter, Countersink Diameter/Angle when applicable).
- [ ] Defaults: **Diameter 5 mm, Depth 10 mm, Drill Point Angle 118 deg**, Simple / Simple, Extents Distance (HANDOFF "inferred"; verify) `[K]`.
- [ ] Clicking a face places the hole at the clicked point. Offset dimensions to edges appear once references are picked `[H-HOLE]`.
- [ ] The preview is a red cut cylinder with a cone tip `[PB]` (cut preview colour).

## 13. Selection and highlight colours

- [ ] **Selected** faces get a blue tint, base `rgba(0,102,255,0.5)` (`SelectEffectInfo BaseColorRGBA 0 0.4 1 0.5`), with blue lines `rgb(0,128,255)`
      (`LineColorRGBA 0 0.5 1 1`), a 2 px line width and a white halo `[PB]`.
- [ ] Hidden lines of the selection show through at `rgba(0,128,255,0.5)` (`UseHiddenLines=1`) `[PB]`.
- [ ] **Pre-highlight (hover)** gives faces a light veil, base `rgba(255,255,255,0.3)` with a white halo (3 px), and black lines `[PB]` (`HighlightEffectInfo`). In practice
      the hovered edge or face reads as lighter, with the edge drawn bold. Fusion users perceive hover as **light blue**, so a pale blue `#9fd2f5` veil is
      acceptable, but it must stay distinct from selection blue `[K]`.
- [ ] Selected sketch curves use the line colour `rgb(47,109,198)` (`SketchSelectEffectInfo LineColorRGBA 0.184 0.427 0.776 1`) with a glow `[PB]`.
- [ ] Errors use the red base `rgba(255,26,26,0.75)` (`ErrorHighlightEffectInfo`) `[PB]`.
- [ ] Origin and construction plane: the selected plane is `rgba(0,120,255,0.5)` and the hovered one is `rgba(77,128,255,0.5)` (`PlaneSelectionManipulatorPlane`) `[PB]`.
- [ ] Clicking empty canvas clears the selection. Ctrl/Shift+click toggles. Dragging from empty space makes a window selection: left→right is a solid window (fully inside),
      right→left is a dashed crossing window `[K]`. 1 / 2 / 3 switch to Window / Freeform / Paint selection `[CD]`.

## 14. Keyboard shortcuts (defaults)

From `[CD]` `HotKey=` attributes, cross-checked with `[H-KS]`. Each one must work when the canvas has focus and **must not** fire while typing in an input.

| key | command (id) | | key | command (id) |
|---|---|---|---|---|
| E | Extrude (`Extrude`) | | L | Line (`DrawPolyline`) |
| H | Hole (`FusionHoleCommand`) | | R | 2-Point Rectangle (`ShapeRectangleTwoPoint`) |
| Q | Press Pull (`FusionPressPullCommand`) | | C | Center Diameter Circle (`CircleCenterRadius`) |
| F | Fillet (`FusionFilletEdgesCommand`) | | T | Trim (`TrimSketchCmd`) |
| M | Move/Copy (`FusionMoveCommand`) | | O | Offset (`Offset`) |
| V | Toggle Visibility (`VisibilityToggleCmd`) | | P | Project (`ProjectNewCmd`) |
| A | Appearance (`AppearanceCommand`) | | X | Normal/Construction (`SketchConstructionCmd`) |
| S | Toolbox | | D | Sketch Dimension (`SketchDimension`) |
| I | Measure (`MeasureCommand`) | | J / Shift+J | Joint / As-built Joint |
| Shift+N | Display Component Colors | | Shift+S | Scripts and Add-Ins |
| 1 / 2 / 3 | Window / Freeform / Paint Selection | | Delete | Delete (`FusionDeleteCommand`) |
| Ctrl+Z / Ctrl+Y | Undo / Redo | | Ctrl+B | Compute All (`FusionComputeAllCommand`) |
| Ctrl+N / Ctrl+O / Ctrl+S | New / Open / Save | | Ctrl+Shift+S | Recovery Save |
| Ctrl+Alt+V / B / N / P / R | ViewCube / Browser / Nav bar / Data Panel / Reset layout | | Ctrl+Alt+A / C | Comments / Text Commands |
| Ctrl+[ / Ctrl+] | Cycle workspaces | | F6 | Fit (`FitCommand`) |
| Enter | OK in a dialog (`CommitCommand`) | | Esc | Cancel (`CancelCommand`) |
| Shift+V | Visual faces | | Shift+F | Face groups toggle |
| Ctrl+C / V / X | Copy / Paste / Cut | | Ctrl+0 | Home |

- [ ] Each key above triggers its command (or an explicit "not available" toast). There is no browser default action: Ctrl+S must not open the browser's Save Page dialog, and
      Ctrl+O must not open a file picker unless the recreation implements Open.
- [ ] Esc order: the active sketch tool, then the open command dialog, then the selection `[K]` (ARCHITECTURE input routing).

## 15. Core-loop behaviours a Fusion user will try first

- [ ] Create Sketch, then click the XY plane, then R, click, click, type 40 Tab 20 Enter, then Finish Sketch, then E (profile auto-selected), type 10 Enter. The result is one body, 40×20×10 mm.
- [ ] F, then click an edge, then the radius arrow, type 2, Enter. The fillet appears in the timeline and the edge is rounded.
- [ ] H, then click the top face, then OK. A Ø5×10 mm hole with a 118° tip.
- [ ] Double-click Extrude1 in the timeline, change Distance to 15, then OK. The fillet and hole recompute (they survive), and the volume changes.
- [ ] Click FRONT on the ViewCube and the camera looks along +Y (from −Y). Click Home to return to iso.
- [ ] Ctrl+Z / Ctrl+Y step through each of the operations above. Undo inside a sketch undoes the last sketch entity `[K]`.
- [ ] Modify → Change Parameters lists the user parameters (with a + to add one) and the model parameters d1, d2 … grouped by feature, with Name / Unit /
      Expression / Value / Comments columns. Editing d-values recomputes the model `[H-MODES]` `[K]`.
- [ ] Save then Open restores the same timeline and geometry. The document tab shows the saved name.

## 16. Robustness for a shared link (not Fusion fidelity, but testers will hit these first)

Checked by `tests/e2e/scenarios/robustness.mjs` and `small-screen.mjs`:
- [ ] Every toolbar button on every tab, every SOLID dropdown item and every letter key can be pressed, then Esc, with no console error. Each time,
      Esc returns to a clean state: no dialog, no tool on the input stack, no leftover preview, model mode.
- [ ] At 1280×720 and 1024×640 the page doesn't scroll, the toolbar collapses instead of wrapping, the ViewCube, nav bar, timeline and browser stay
      visible, long dropdowns fit or scroll, and a command dialog's OK button stays on screen.
- [ ] Upstream edits keep downstream features alive: changing the Extrude distance keeps the Fillet (edge re-found) and the Hole (follows its face).
      Fusion users expect this from the timeline, and it is the most visible place where the recreation can fall short.
- [ ] Save → reload → Open restores the same timeline and geometry (localStorage, wrapped in try/catch).

---

### Help page keys
- `[H-UI]` Fusion interface (desktop): `?guid=GS-THE-FUSION-INTERFACE`
- `[H-BASIC]` Perform basic tasks: `?guid=GS-BASIC-OPERATIONS`
- `[H-KS]` Fusion keyboard shortcuts reference: `?guid=GUID-F0491540-0324-470A-B651-2238D0EFAC30`
- `[H-MM]` Marking menu reference: `?guid=GUID-6514ABC1-CB75-4F0B-AB0E-316FAD36BA93`
- `[H-NAV]` Navigation bar reference: `?guid=GS-NAVIGATION-BAR`
- `[H-VC]` ViewCube reference: `?guid=GS-VIEWCUBE`
- `[H-TL]` / `[H-MODES]` Modeling modes and timeline: `?guid=ASM-DESIGN-MODELING-MODES`
- `[H-SKP]` Sketch Palette: `?guid=GUID-4183A4B7-E002-4396-AD5A-7FF3C8B2F33A` (via `?contextId=SKT-3D-SKETCH`)
- `[H-EXT]` Extrude reference: `?guid=SLD-REF-EXTRUDE`
- `[H-FIL]` Fillet reference: `?guid=SLD-REF-FILLET`
- `[H-HOLE]` Hole reference: `?guid=GUID-3A76B269-8C8D-437B-8F4A-85D0B2BBA492`
- `[forum]` forums.autodesk.com thread "When will we be able to set custom hotkeys" (Extrude distance field focused on start)

### Known id mismatches to resolve in the polish pass
- The marking menu XML uses `UndoCommand`/`RedoCommand`/`RepeatCommand`, while ARCHITECTURE assigns `Undo`/`Redo`/`RepeatCommand` to menus. Alias them so both work.
- Visibility toggle: the install id is `VisibilityToggleCmd` (hotkey v), but ARCHITECTURE lists `ToggleVisibility (V)`. Register an alias.
- The toolbox has no id in the install (`S` is documented as "Model Toolbox"). ARCHITECTURE uses `ShowToolbox`.
- Browser and ViewCube toggles: the install has Show/Hide pairs (`ShowBrowserCommand`/`HideBrowserCommand`), while ARCHITECTURE uses single toggles (`ToggleBrowser`).
