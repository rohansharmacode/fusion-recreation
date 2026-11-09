# browser module

The BROWSER panel: document root, Document Settings, Named Views, Origin, Analysis, Bodies, Canvases, Sketches,
Construction and module folders; eyes, isolate, selectability, opacity, rename, context menus, Find in Window.

* Every body kind is in the Bodies folder with its own icon (`ui.js` glyphs `br-body`, `br-surface`, `br-mesh`,
  `br-tspline`, `br-sheetmetal`; a kind's `icon` / `label` hook from `app.registerBodyKind` wins).
* Registered feature types (`M.registerFeature`) get their icon from `def.icon`; with `def.browser.folder` the feature is
  listed in that folder ("construction" joins Construction).
* `app.ui.browser`: `reveal(target)`, `rename(key)`, `element`, `registerFolder({key, label, after?, before?, build(app)})`
  -> remove(), `invalidate()`. Folder node format: ARCHITECTURE.md "Browser and timeline hooks".
* DOM hooks: `[data-node="<kind>:<id>"]`, `.br-eye`, `.br-twisty`.

## Components
The root lists its own Bodies / Sketches / Construction and then its occurrences (`[data-node="occ:<oid>"]`, label
"Name:n"); each occurrence holds Origin, Bodies (`bodies:<oid>`), Sketches, Construction and its own occurrences, built
from `app.components` (ownerOf / ownerOfFeature). The radio (`.br-right .br-radio`, also on the root) activates a
component; double-click activates too. Component menu: Activate Component, New Component, Move/Copy, Pin / Unpin,
Physical Material, Appearance, Properties, Copy, Paste, Paste New, Delete, Rename, Show/Hide, Selectable/Unselectable,
Isolate, Find in Window, Find in Timeline. The Bodies folders offer Create Components from Bodies. Pinned components carry
a pin badge; Document Settings says "Hybrid Design" once the design has components. Bodies of pasted occurrences
(`<bodyId>@<oid>`) are listed under their occurrence and share the component body's metadata. `api.isolateBodies(ids)`.
