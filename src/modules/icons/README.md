# icons: shared original SVG icon library

Not an init module: other modules import it. Original artwork only (no Autodesk icons are traced or copied).

Files: `icons.js` (API and registry), `draw.js` and `parts.js` (drawing helpers, 32x32 viewBox), `ui.js` (16 px UI glyphs),
`cmd-solid.js`, `cmd-sketch.js`, `cmd-other.js` (built-in command drawings).

## API (src/modules/icons/icons.js)
| function | result |
|---|---|
| `icon(id, {size = 32, title?, class?})` | SVG markup for a Fusion command id. Unknown ids are matched by keyword, then a neutral generic icon: it never throws and never returns an empty string. At size <= 20 strokes are thickened. |
| `featureIcon(type or feature, {size = 16, mode?})` | timeline / browser icon of a feature type (a cplane picks its variant from `feature.mode`) |
| `uiIcon(name, {size = 16})` | 16 px UI glyph (`uiIconNames()` lists them; monochrome glyphs use `currentColor`) |
| `iconUrl(id)`, `uiIconUrl(name)` | the same as data URLs |
| `registerIcons({CommandId: (ctx) => "<svg inner markup>"})` | a module's own drawings (keep them in the module folder; `ctx.small` while drawing at <= 20 px) |
| `registerFeatureIcons({featureType: "CommandId"})` | timeline / browser icon of a registered feature type |
| `hasIcon(id)`, `iconIds()`, `iconGroups()`, `featureTypes()`, `iconAliases()`, `iconErrors` | introspection (icon gallery, tests) |

`node scripts/icon-gallery.mjs` writes a gallery page of every icon for a visual check.
