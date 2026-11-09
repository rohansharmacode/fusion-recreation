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
