# shell module

Application bar, toolbar (workspace switcher, tabs, panels, dropdowns), tooltips, data panel, comments, stubs.
Contracts are in ARCHITECTURE.md ("Contextual environments", "Workspaces", "Commands").

## Files
* `spec.js`: Design toolbar from the install's TabToolbars.xml: `TABS`, `CONTEXTUAL_TABS` (sketch, FORM, BASE FEATURE
  SOLID/SURFACE, FLAT PATTERN SOLID/SURFACE, DIRECT MESH EDITING, POSITION, PCB), `PANELS`, `COMMANDS` (id -> [label,
  description, shortcut?]), `TAB_ENVIRONMENTS` (tab -> marking-menu environment), `MARKING_MENUS`, `MODE_TOOLBARS`.
* `workspaces-spec.js`: other workspaces' toolbars: `WORKSPACE_SPECS`, `WORKSPACE_PANELS`, `WORKSPACE_COMMANDS`.
* `toolbar.js`: renders the active layout: Design spec, a workspace (registered `def.tabs/panels` over the spec), the
  active environment's contextual tab(s) with the green FINISH panel, the floating mode toolbar.
* `workspace.js`: bottom strip / browser / canvas layer of non-Design workspaces, placeholder card, NextWorkspace /
  PreviousWorkspace (Ctrl+] / Ctrl+[), fallback FINISH commands that leave an environment until its module registers them.
* `index.js`: registers shell commands and a stub for every toolbar id (workspace commands get `workspace:<id>`).

## API
`app.ui.toolbar`: `activeTab`, `setTab(id)`, `refresh()`, `openPanel(pid)`, `panel(pid)` (resolved panel definition),
`tabInfo()`, `info(id)`, `spec` (all tables above), `setVisible(bool)`, `selectionFilters`.
