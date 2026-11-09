# configure module: design configurations

Fusion's CONFIGURE panel (SOLID, SURFACE, MESH, SHEET METAL, PLASTIC tabs and the SKETCH contextual tab):

| command id | name | what it does here |
|---|---|---|
| `FusionStartDesignConfigModeCmd` | Configure | Opens the CONFIGURATION TABLE and enters Configuration Mode (toggle; checked while the mode is on). |
| `FusionShowDesignConfigPanelCmd` | Display Configuration Table | Shows / hides the table without entering the mode (checked while shown). |
| `FusionConfigurationRulesCmd` | Create Configuration Rules | Opens the CONFIGURATION RULES editor. With no configured aspects it shows Fusion's "No configured aspects yet" message with *Enter Configuration Mode*. |
| `ConfigureFeatureCmd` / `ConfigureEntityCmd` | Configure | The *Configure* item of the Timeline / Browser body context menus (enters the mode, opens the table and the Configure dialog for that object). Context: `{id}` feature id, or `{ref:{kind:'body', body}}`. |
| `ActivateConfig` | Activate | Activates a configuration (`{row}` id or `{name}`). |

Files: `index.js` (commands, controller, `app.ui.configure`), `data.js` (pure document model), `rules.js` (pure rules engine),
`table.js` (palette), `mode.js` (Configuration Mode), `dialogs.js` (Configure dialog + Parameters "Configured" dialog),
`rules-ui.js` (rules editor), `selector.js` (browser selector), `glyphs.js` (original SVG), `style.css`.

## Workflow (matches the Fusion help "Create or convert a Configured Design")
1. **Configure** (or *Add Aspects* in the table) enters **Configuration Mode**: a bar "CONFIGURATION ✓" sits at the top of the canvas
   (the check mark, or Esc when no dialog is open, exits), features in the Timeline and bodies / sketches / construction planes in the
   Browser are highlighted (already configured ones more strongly). A first-time card lists what can be configured
   ("Don't show this again" is stored in localStorage, wrapped in try/catch).
2. Clicking a highlighted item opens the docked **CONFIGURE** dialog (dialog framework): Feature / Body name, one check box per aspect
   - features: each model parameter (`Distance (d3)`, sketch dimensions `d1 (Linear Dimension)` ...), **Suppression**, and **Visibility** for sketches / planes;
   - bodies: **Visibility**, **Appearance**, **Physical Material**.
   OK adds checked aspects as columns (every configuration gets the current value) and removes unchecked ones; one undo step.
3. **Add Parameters** (fx button) opens a PARAMETERS dialog with a **Configured** column (User Parameters, Model Parameters by feature, filter).
4. The table: `Parameters | Properties` tabs, row count + **Add Configurations** (new rows copy the active configuration, named
   "Configuration N"), Add Aspects, Add Parameters, Configuration Rules, and **More** (Sort Columns A→Z / Z→A / By Design Order,
   Sort Rows A→Z / Z→A, Export Table (CSV) via `app.download`, Edit Configuration Rules).
   - Name column "Configurations": the first row is the Default Configuration ("(Default)", cannot be deleted / moved / sorted); the active
     row has a filled radio and bold name. Double-click a name (or click its radio, or right-click > Activate) to activate.
     Right-click: Activate, Rename (inline), Duplicate (adds "Name (1)" at the bottom), Delete. Ctrl+click selects several rows.
     Drag a row name / a column header to move it.
   - Column headers are grouped by object (Box1 > d3, Cylinder1 > Suppression, Body2 > Visibility, Appearance theme). Right-click:
     Rename Column (for parameters this renames the parameter everywhere, like Fusion), Delete, and for Suppression
     *Suppress All / Unsuppress All / Invert*, for Visibility *Show All / Hide All / Invert*.
   - Cells: parameter expressions (a bare number gets the column unit; invalid expressions, wrong units, non-positive sizes and counts < 1 are
     rejected with a message), Suppressed / Unsuppressed and Visible / Hidden toggles, theme dropdowns.
   - Theme tables below the top table: **Appearance Theme** / **Physical Material Theme** (rows = themes "Theme N", columns = bodies, cells =
     appearance / material library dropdowns with swatches; count + Add Themes; right-click Rename / Duplicate / Delete; title right-click
     Delete ... Theme Table). The top table gets an Appearance / Physical Material column that picks a theme per configuration.
   - Properties tab: Part Number (placeholder = configuration name) and Description per configuration.
5. **Activating** a configuration writes its row into the document through `app.mutate` (parameter expressions, `f.suppressed`,
   body / sketch / plane `visible`, body `appearance` / `material`) and the normal evaluator recomputes. Undo / redo restore it.
6. **Local edits** (Edit Feature, Change Parameters, timeline Suppress / Unsuppress, Show/Hide, Appearance / Physical Material commands ...)
   of a configured aspect are written back into the ACTIVE configuration only (and into the active theme row), inside the same undo step;
   edits of non-configured aspects affect every configuration.
7. **Browser selector** (configured designs): a row under the BROWSER header with the active configuration; expand it for a searchable list
   and click a configuration to activate it. Right-click: Display Configuration Table, Configure.

## Configuration Rules (local equivalent of Fusion's rules service)
Editor: Toolbox categories (Rules, Logic, Configurations, User Parameters, Modeling Features, Components, Theme Tables; categories without
configured aspects are disabled) and a canvas of Blockly-style blocks: **Rule** (On/Off State Toggle, name, comment, status:
Rule is active / is off / contains warnings / contains errors / Pending...), **Logic** (if / else if / else, gear menu adds else if / else),
**Getter** (`get Category Aspect op value`), **Setter** (`set ...`), **And/Or**, **Not**, **Comment**. Click a statement area or an empty
condition slot (blue outline) to choose where the next toolbox block goes; blocks have move up / down and delete buttons.
Discard reverts to the applied rules; **Apply** stores them (one undo step "Configuration Rules"), enforces them on every configuration and
shows Fusion's banner ("N rules were successfully applied to configurations."). Closing with pending changes asks Apply / Discard / Cancel.

Semantics (rules.js, from Fusion's `ConfigurationRuleGet/SetOperators`): rules run top to bottom against every configuration, statements in
order. Getter ops: `= ≠ > ≥ < ≤ range "any of"` (numbers), `= ≠` (booleans, theme / configuration lists, multi-select chips).
Setter ops: `=` drives the value (cell becomes read-only, lock mark, tooltip "Driven by rule"); `min`, `max`, `range` (min / max /
increment), `any of`, and `≠` / multi-value `=` on lists limit it (funnel mark, "Limited by rule"; violating edits are rejected with
"Value violates rule ... revert to the last valid value"; Apply / new rows clamp to the nearest valid value). Rules with errors do not run;
incomplete blocks are ignored with an "Incomplete block" warning. Column deletion turns referencing blocks into incomplete placeholders.

## Document data (`doc.configurations`, saved with the design)
```
{ version:1, nid, rows:[{id, name, partNumber, description}], active: rowId,
  columns:[{id, kind:'param', user:true, name} | {id, kind:'param', owner, field} | {id, kind:'param', owner, cid}
         | {id, kind:'suppress', feature} | {id, kind:'visibility', body} | {id, kind:'visibility', feature}
         | {id, kind:'theme', table:'appearance'|'material'}  (+ optional title, param)],
  cells:{[rowId]:{[colId]: expr string | bool (suppress: true = suppressed; visibility: true = visible) | theme row id}},
  themes:{appearance?|material?: {rows:[{id,name}], columns:[{id, body}], cells:{[themeRowId]:{[colId]: appearanceId|materialId}}}},
  rules:[{id, name, comment, active, body:[stmt]}]   (see rules.js header) }
```
A document without `configurations` is a standard design; the first edit that needs it (adding a configuration, configuring an aspect)
creates it with one "Configuration 1" row holding the current values.

## API: `app.ui.configure`
```
configured                      bool
configurations() -> [{id, name, active, partNumber, description}]     active() -> {id, name} | null
columns() -> [{id, kind, ..., group, title, tip, missing}]
activate(idOrName)              addConfigurations(n)      setCell(rowId, colId, value) -> bool (validated + rules)
addAspect(template)             configure({kind:'feature'|'body', id})   enterMode() / exitMode()
openRules()  openParameters()   applyRules(rules) -> {changes}
table {visible, show(), hide(), toggle(), render(), startRename(rowId)}   mode {active, enter(), exit()}   selector {render(), setOpen(v)}
data (data.js namespace)        rules (rules.js namespace)   ctl (controller used by the UI)
```
Event: `configure` `{table: bool}` / `{mode: bool}` when the table is shown / hidden or the mode changes.

DOM hooks (QA): palette `[data-cfg-table]`, toolbar buttons `[data-cfg="count"|"add-configurations"|"add-aspects"|"add-parameters"|"rules"|"more"]`,
top table `[data-table="top"]`, name cells `[data-row-name=<rowId>]`, column headers `[data-col=<colId>]`, cell controls
`[data-input="<rowId>:<colId>"]` (suppress / visibility buttons expose `data-value`), theme cells `[data-input="<table>:<themeRowId>:<colId>"]`,
Add Themes `[data-cfg="add-themes:<table>"]`, mode bar `[data-cfg-mode]` with `[data-cfg="exit-mode"]`, browser selector
`[data-cfg-selector-head]` / `[data-cfg-option=<rowId>]`, Configure dialog `.dlg[data-dialog="ConfigureFeatureCmd"|"ConfigureEntityCmd"]`,
Parameters `[data-dialog="ConfigureParameters"] .cfg-pm-check[data-param=<name>]`, rules editor `[data-dialog="FusionConfigurationRulesCmd"]`
(`.cfg-rx-cat[data-cat]`, `.cfg-rx-fb[data-block][data-cat]`, `[data-rule]`, `[data-rule-status]`, `[data-action="apply"|"discard"]`).

## Not reproduced (honest gaps)
Custom theme tables / Move to Theme Table, the Test Row, Sheet Metal / Plastic rule themes (no such rules in this app), component inserts
and joint snaps (no assemblies), thread / hole-type aspect columns (only numeric hole / thread parameters), implicit-suppression display,
Block From Object mode, the "Configure" tab inside modeling dialogs, the Configured Design icon on the document tab / Data Panel,
per-configuration cloud versions (the whole design is one local document).
