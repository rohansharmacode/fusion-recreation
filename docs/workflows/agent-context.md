# Shared brief for builder, review and integration agents (Windows PC run, 2026-11-09)

Read this file fully, then do the task in your task message (key, ports, task source).

## Paths
- ROOT: `C:/dev/fusion-recreation` (git repo, branch `wip/everything`; Windows 11 with Git Bash and PowerShell; Node 24). Use absolute paths.
- INSTALL: `C:/Users/Rohan Sharma/AppData/Local/Autodesk/webdeploy/production/c657666a51cec7a9bbd042e10872bcd9532508a8` (Fusion 2705.1.25; the path has a space, quote it).
  `src/modules/shell/spec.js` was generated from Fusion 2706.1.17. Where they differ, spec.js wins for command ids, toolbar placement and display names; use INSTALL for dialog labels, tooltips and strings.
- REFS: `C:/dev/fusion-refs` (01..33 *.jpg screenshots of real Fusion plus NOTES.md).

## Project
You are one of several engineers working IN PARALLEL in the same working tree on an unofficial browser recreation of Autodesk Fusion's Design workspace (a hackathon entry, live at https://rohansharmacode.github.io/fusion-recreation/). Stack: plain ES modules + DOM + three.js (Z-up, millimetres), OpenCascade through replicad (WebAssembly, main thread), bundled with esbuild. Goal: every command that is still a stub (it toasts "isn't available in this unofficial recreation yet") becomes a real, working implementation that matches real Fusion 2706 (Light Gray theme) as closely as possible: names, dialog inputs (labels, order, defaults, units), selection rules, live preview, browser and timeline entries, and results.

Read first: ARCHITECTURE.md (module contract, App API, refs, document format, test harness, and the foundation part 1 contracts: feature registry `registerFeature` + `M.helpers`, body kinds + `registerBodyKind`, contextual environments `enterEnvironment`, workspaces; the foundation engineer adds the components contract `app.components` while you work), src/modules/dialogs/README.md (dialog framework), and the code you build on. Reuse existing infrastructure (dialog framework, manipulators, selection, pick providers, viewport groups, kernel helpers, M.helpers). Timeline feature types MUST be added through `registerFeature` from your own module, not by editing the APPLY table in src/model.js. The foundation part 1 report (contract summary) is the `build:foundation-1` entry of docs/wave1-reports.json.

TOKEN ECONOMY (the user asked to minimise token usage): work locally. Get dialog names, labels and tooltips from INSTALL and REFS; use web lookups only when a command's dialog cannot be worked out locally, and then read only the one relevant page. Read large files in parts (grep, sed -n, head) instead of whole; never dump big outputs (pipe test output through tail; use --quiet); do not re-read files you already read; take screenshots only to check a visual result. No separate QA engineer reviews your work, so test it yourself with the local harness, but efficiently.

## Evidence (read in place, NEVER copy into the repo)
- INSTALL: `Fusion/UI/FusionUI/Resources/Toolbar/TabToolbars.xml` (tabs, panels, ids; other `Applications/*/UI/*/Resources/Toolbar/TabToolbars.xml` files hold MESH and other environments and workspaces), `StringTable/en-US/*.xml` and `CommandDefinitions.xml` (display names, tooltips, many dialog input labels: grep them), QML files.
- REFS screenshots.
- src/modules/shell/spec.js (and the contextual tabs it holds), src/modules/shell/workspaces-spec.js.

## Hard rules
1. File ownership: you OWN the files listed for your task; edit only those. Small additive edits to shared files (src/app/core.js, src/model.js, src/kernel.js, src/sketch/*, src/modules/dialogs/framework.js, src/modules/viewport/*, src/modules/browser/*, src/modules/timeline/*, src/modules/shell/*, package.json) only when truly unavoidable: precise Edit-tool replacements, never rewrite a shared file wholesale, keep existing behaviour and tests, list every such edit in your report. Others edit other files at the same time (the foundation engineer adds components to model.js, core.js, browser, viewport, timeline and dialogs right now): re-read a shared file right before editing it, keep every file syntactically valid (node --check), never revert or reformat code you did not write.
2. Register real commands with `app.commands.register({...})` using Fusion's exact command id (the stub is replaced automatically); keep the toolbar placement from spec.js. Icons: original SVG only; put drawings in a file in your own folder and register them with registerIcons / registerFeatureIcons from src/modules/icons/icons.js.
3. A command is done only when it really works end-to-end like Fusion: dialog, selection, live preview where Fusion has one, OK/Cancel, undo/redo, save/open round-trip, Edit Feature from the timeline for timeline features, sensible errors. Leave a stub only if genuinely impossible in a browser, and justify it. Cloud-based features are deferred by the user: do not build them (PIM*, TaskManagement*, McMaster-Carr, cloud rendering, Data Panel stay stubs).
4. No Autodesk logos, wordmarks or icon artwork. Wrap localStorage in try/catch. Files only through app.download(); read files with `<input type=file>`.
5. Git: no commits, pushes, branch changes, deploys, and NO `git stash`, `git checkout -- <file>`, `git restore`, `git reset` or `git clean`: other engineers have uncommitted work in this tree. Read-only git (status, diff, log, show) is fine. Do not touch release/, build/pages-stage or other engineers' build directories.
6. No npm installs unless your task allows it. The release must stay exactly four files (index.html, app.js, app.css, occt.gz.wasm): inline any extra asset into app.js.
7. Keep the UI responsive; cache meshes; no heavy kernel work per pointer move.
8. Write or update src/modules/<your module>/README.md: commands, data formats, API for other modules.
9. Never write the em dash character (U+2014) in code, comments, docs, test names or your report; use a comma, colon, full stop or brackets.
10. Keep the app free of console errors at all times: your module's init() must never throw, and an unfinished command must not log errors. Develop your QA scenario as a harness script under tests/e2e/out/<key>/ and copy it to tests/e2e/scenarios/<key>.mjs only once it passes. Module-owning builders: put this line at the top of src/modules/<key>/index.js while you work and remove it when you finish: `// UNDER ACTIVE DEVELOPMENT by the <key> engineer: integration engineers, do not edit; stub this module with --only if it breaks a test.`

## Build and test (only your own directories and ports: key <key>, ports <port>..<port+9>; commands in Git Bash)
- Build: `node scripts/build.mjs --out=build/<key>` (add `--only=viewport,sketch,dialogs,inspect,shell,browser,timeline,menus,<your module>` to stub other modules if a parallel engineer has temporarily broken one).
- QA: `QA_OUT=build/<key> QA_SHOTS=tests/e2e/out/<key> QA_PORT=<port> node tests/e2e/run-all.mjs <scenario...> [--no-build] --quiet`
- Ad-hoc scripts under tests/e2e/out/<key>/ using `launch({ outDir: "build/<key>", port: <port+9>, shots: "tests/e2e/out/<key>" })` from tests/e2e/harness.mjs; always close().
- Engine tests (when src/model.js, src/kernel.js or src/sketch/* changed): `npm test`, `node tests/spline_test.mjs`, `node tests/robust_test.mjs`.
- Split up or background commands longer than about 9 minutes.

## Resumed builders
If your task message says RESUMING: an earlier engineer started exactly this task and was stopped (to save tokens, not because of a problem). Their partial work is in the working tree and in the WIP commits after a000b92 (the last green commit). `git diff a000b92 -- <your owned files>` shows it; other engineers' changes are in the same diff, so look only at your area. Ignore docs/WIP.md and docs/workflows/* except this file and your task entry. Review the partial work quickly, keep what is good, and finish the task. Your QA scenario may already exist.

## Finish (builders)
Finish with tests/e2e/scenarios/<key>.mjs driving your commands through the real UI and checking results (bodies, volumes, browser and timeline entries, undo, save/open); it plus core-loop, modeling, toolbar and undo-redo must pass with zero console errors. Work through the whole list. End your final answer with ONE JSON object and nothing after it:
`{"summary": str, "implemented": [ids that really work], "notImplemented": [{"id": str, "reason": str}], "sharedEdits": [str], "contracts": str, "tests": [str], "knownIssues": [str]}`
Keep it brief, factual and honest.
