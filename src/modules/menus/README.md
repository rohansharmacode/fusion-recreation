# menus module

File menu (New, Open, Save, Save As, Recovery, Export STEP / STL / JSON), Undo / Redo, Change Parameters, marking menu,
S toolbox, shortcut lists, Delete-key routing, Show/Hide (V), Edit Feature, About.

* Marking menu (`markingmenu.js`): Design / Sketch radial layouts; an environment's `markingMenu` (spec `MARKING_MENUS`
  id or a list) or the active tab's environment (SURFACE, SHEET METAL) replaces the Design layout.
* S toolbox (`toolbox.js`): titled after the environment / workspace ("Form Shortcuts"); lists commands of the current
  workspace and mode (`when`, `workspace` fields).
* Shortcut lists (`shortcuts.js`): one per mode / workspace; defaults from `env.shortcuts` / workspace `def.shortcuts`.
* Export: STL holds every visible body kind (mesh triangles included); STEP holds B-rep bodies only.
* Open: `normalizeDoc` + `M.migrateDoc` (older `doc.meshes` become mesh features).
* `app.ui.files`: `save()`, `saveAs(name)`, `openById(id)`, `loadDoc(doc)`, `doExport(type, name, {bodies?})`, `fileNew()`.
