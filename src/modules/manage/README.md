# manage module: UTILITIES / MANAGE / AUTOMATION / SELECT tools

Files: `index.js` (starts each part on its own), `ui.js` (DOM, storage, palette and face-painter helpers),
`style.css` (prefix `mg-`), `icons.js` (original icons of the PIM and task commands; the others are in
`icons/cmd-other.js`), `raycast.js` (triangle BVH for local analyses) and one file per tool group below.

## Commands (Fusion ids, toolbar placement from `shell/spec.js`)
| id | file | what it does |
|---|---|---|
| ScriptsManagerCommand (Shift+S) | scripts/manager.js | Scripts and Add-Ins dialog: Search, Favorites, filters (Type / Status / Source), table (Name, Run, Run on Startup), Details; + menu (marketplace, script from device, Create script or add-in). Running a script closes the dialog; an add-in's switch starts / stops it in place. |
| (code editor) | scripts/editor.js | "Edit in code editor": line numbers, colouring, Save (Ctrl+S), Run / Stop (F5 / Shift+F5), Revert, Download, Output pane, error line. |
| APIHelpCommand | links.js | Opens Autodesk's public Fusion API reference in a new tab and the in-app reference of this script API. |
| ExchangeAppStoreCommand | links.js | Opens the public Design and Make Marketplace page in a new tab. |
| SelectByNameCommand, FusionSelectBodiesBySizeCommand, SelectByBoundaryCommand, FusionSelectSeedAndBoundaryFacesCommand, SelectByInvertCommand, SelectionFilterCommand | select.js | Selection tools (dialogs pre-highlight matches; OK selects). Selection Filters opens the SELECT panel list; the shell's `selection-filters` state filters canvas picks. |
| DesignAdviceCmd | advice.js | Plastic rule checks of a body with a pull direction: Thickness (too thin / too thick / variation), Undercuts, Draft, Knife Edges; alert lists, Ignore, Isolate, painted regions. |
| FusionFindFeaturesCommand | features.js | Recognises holes, fillets, chamfers, extrudes, revolves, mirrors and patterns; results in `doc.foundFeatures` and a browser "Features" folder. |
| GraphViewCmd | navigator.js | Navigator palette: dependency graph of sketches, planes, features and bodies. |
| TimelineBuilderCommand | timeline.js | Generate Timeline: rebuilds a prismatic body as sketches + extrudes and opens it as "<name> AutoTimeline". |
| FusionComputeUnresolvedCommand | timeline.js | Recomputes features whose references failed. |
| PIMAssignItemNumberCmd, PIMQuickReleaseCmd, PIMECOReleaseCmd, PIMGoToDashboardCmd, PIMGoToItemDetailsCmd, PIMGoToChangeOrderCmd | pim.js | Local Fusion Manage: item numbers, Quick Release, change orders with a workflow, "Fusion Manage" palette (Dashboard / Details / Change Orders). |
| TaskManagementCreateTaskCmd, TaskManagementRelatedTasksCmd, TaskManagementOpenTasksCmd | tasks.js | Local task system: New Task dialog, Related Tasks palette, task board ("Open on the Web"). |

## Data
* `doc.pim` (document data, undoable, saved): `{seq:{item, co}, items:{root:{itemNumber:'ITM-000001', scheme, name,
  lifecycle:'Unreleased'|'Pre Release'|'Production', revision:'-'|'1'..|'A'.., changeOrder, released?, history:[{t, action,
  lifecycle, revision}]}}, changeOrders:[{id, number:'CO-000001', title, description, items:[key], targets:{key:{lifecycle,
  revision}}, state:'Open'|'In Review'|'Released'|'Cancelled', created, closed?, history}]}`. Quick Release: Unreleased ->
  Pre Release 1 -> 2 ...; Production only through an approved change order (A, B ...). Configured designs are refused.
  The recreation has one component, so the only item key is `root` (the design).
* `doc.foundFeatures`: `[{id, type, name, body, faces:[{p, n}], params, label}]` (Find Features).
* Browser storage (`ui.store`, try/catch + memory fallback): scripts `fusionrec.manage.scripts.v1` (see scripts/store.js),
  tasks `fusionrec.manage.tasks.v1` = `{seq, tasks:[{id, number:'T-0001', title, description, assignee, due, priority,
  status:'Open'|'In Progress'|'Done', design, refs:[{kind:'body', body, label}|{kind:'feature', id, label}], created, modified}]}`.

## Script API
JavaScript scripts get `adsk.core` / `adsk.fusion` (scripts/core.js, scripts/fusion.js) mapped onto the real model:
`Application.get()`, `activeProduct` (Design), `rootComponent`, `sketches.add`, sketch lines / circles / arcs / splines,
constraints and dimensions, profiles, `extrudeFeatures.addSimple` / `createInput` + `add`, revolve, fillet, chamfer,
shell, hole, combine, mirror, patterns, move, construction planes, `userParameters`, `ui.messageBox` / `inputBox`,
command definitions with inputs, toolbar panel controls (add-ins). One run = one undo step. Units are Fusion's
(cm, radians). The full list is the in-app reference (APIHelpCommand, `links.js` REFERENCE). Under a CSP without
`unsafe-eval` scripts do not compile and the user gets a clear message.

## API for other modules
```
app.ui.scripts   {store, host, run(id), stop(id), edit(id), open(), create({name, source, isAddIn}), list(), reference(), canCompile()}
app.ui.pim       {components(), item(key), changeOrders(), assign(keys, scheme), quickRelease(keys),
                  createChangeOrder({title, description, keys}), advance(coId, 'submit'|'approve'|'reject'|'cancel', comment), open(tab)}
app.ui.tasks     {list(), save(rec), remove(id), related(refs), openBoard(), openRelated(), newTask({task?, preselect?})}
app.ui.findFeatures {recognize(bodyId, types), list(), faces(found)}     app.ui.timelineBuilder {generate(bodyId), open(doc), last}
```
Events: `tasks` (task list changed), `script` (script started / stopped / logged), `scripts` (library changed),
`design-advice` `{result}`, `timeline-builder`.

## Tests
`tests/e2e/scenarios/manage.mjs` drives every command through the UI (toolbar, dialogs, palettes) and checks item
data, change-order workflow with undo / redo, tasks, selections, Design Advice alerts, Find Features, Navigator,
script runs (bodies, volume, timeline, one undo), add-in start / stop, links, Generate Timeline and a JSON round trip.
