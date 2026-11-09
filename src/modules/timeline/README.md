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

## Feature-face highlight and patterns of features
* Hovering an item sets `{kind:'body', body, feature: <id>}` as the selection hover: the viewport highlights only the
  faces of that feature (viewport README, "Feature-face highlight"). A selected item (`{kind:'feature', id}`) and
  the right-click highlight do the same.
* A Rectangular, Circular or Path Pattern or a Mirror with Object Type "Features" (`patternType:'features'`,
  `features:[ids]`) depends on its source features: `refsOf(f).features` holds them, so a reorder of the pattern
  before a source (or of a source after the pattern) is refused. They are also in `refsOf(f).soft`: deleting a source
  does not delete the pattern, and a deleted or suppressed source leaves the pattern in place with the warning
  "Reference Failures: ..." (`.tl-item.warning`, model.js `patternFeatures`); the sources that are left still
  compute. `explicitDeps(..., {noSoft:true})` and `dependentsOf(app, ids, {noSoft:true})` leave the soft ones out.
  Edit Feature on a source recomputes the pattern (it is downstream).
