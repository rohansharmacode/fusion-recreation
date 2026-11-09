# Work in progress: "add everything" (paused 2026-11-09)

Goal: turn every remaining stub command into a real implementation, then add the other workspaces.

Status of wave 1 (partial edits are in this commit; nothing here is deployed):
- configure: DONE (src/modules/configure, README inside).
- foundation part 1 (feature registry, body kinds, contextual environments, workspaces): IN PROGRESS, partial edits in
  src/model.js, src/app/core.js, shell, viewport, browser, timeline, menus, inspect/mesh.js, inspect/insert.js.
- foundation part 2 (components): NOT STARTED.
- sketch, inspect analyses, manage (utilities/scripts/select/PLM), annotate: IN PROGRESS (partial).
- The tree may not build or pass QA yet. Last green commit: a000b92.

To resume: run docs/wip-wave1-workflow.js as a Workflow script (fix the ROOT/INSTALL/REFS paths for the machine);
each builder is told to continue from the partial edits. Then wave 2 (assembly, insertx, surface, mesh, sheetmetal,
plastic, createx, solidx, form, rough edges) and wave 3 (render, animation, simulation, manufacture, drawing,
generative), each module already has a placeholder folder in src/modules/. Fusion install evidence is only on the
laptop (webdeploy/production/39e8a3d5...).
