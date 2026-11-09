# timeline module

The design timeline: feature items with icons, marker drag (roll back), reorder with dependency checks, suppress,
rename, delete, playback, Edit Feature (double-click), Edit Profile Sketch, Find in Timeline.

* Labels: `app.featureLabel(type)`; icons: `featureGlyph(type)` (registered types: `def.icon` via `syncFeatureIcons`).
* `deps.js`: references of a feature (`refsOf`) and bodies it changes (`bodiesTouched`); registered types add theirs
  with `def.deps(f)` / `def.touches(f)`.
* Edit Feature: `app.editFeature(id)` (featureEditors[type], else the registered `def.editor`).
* DOM hooks: `[data-feature="<id>"]`, `.tl-marker`, `[data-tl="first|prev|play|next|last"]`.
* `app.ui.timeline`: `reveal(id)`, `refresh()`, `edit(id)`, `rename(id)`.

## Components
`component` features (New Component, From Bodies, Paste, Paste New) and `snapshot` features ("Position", Capture
Position) have their own icons. While a component is active, features of other components are dimmed
(`.tl-item.other-comp`). Uncaptured component positions show a Position entry at the end (`.tl-pending`): click or
right-click for Capture Position / Revert Position.
