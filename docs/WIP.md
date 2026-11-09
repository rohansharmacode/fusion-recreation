# Work in progress: "add everything" (handover to a cloud session, 2026-11-09)

If you are the session that continues this work (on the user's Windows PC or in the cloud): read this file fully, then
continue. Branch: `wip/everything`. Do not merge into `main` or deploy to `gh-pages` until the full QA suite passes, and
ask the user before deploying.

## On the Windows PC (preferred: it runs 24/7)
- Clone `rohansharmacode/fusion-recreation`, `git checkout wip/everything`, `npm install`. Microsoft Edge is used by the
  QA harness as on the laptop, so no Chromium step is needed.
- Fusion evidence: if Fusion is installed on the PC, its files are under
  `%LOCALAPPDATA%\Autodesk\webdeploy\production\<hash>\` (find the folder that holds `Fusion\UI\FusionUI\Resources\Toolbar\TabToolbars.xml`).
  Set that as `INSTALL` in the workflow scripts. If Fusion is not installed, use `src/modules/shell/spec.js` and the
  public Autodesk help pages instead.
- Reference screenshots: the user has `fusion-refs.zip` (33 real-Fusion captures + NOTES.md). Unzip it outside the repo
  and set that folder as `REFS` in the workflow scripts. Never commit these files.
- Set `ROOT` in the workflow scripts to the PC checkout path. Everything else below applies, except the Chromium notes.

## Goal and user decisions
- Every command that is still a stub becomes a real implementation that matches Fusion 2706 (Light Gray) as closely as possible.
- Scope cuts by the user: wave 3 is only the Render and Drawing workspaces. Remove the unused module slots
  `src/modules/{animation,simulation,manufacture,generative}` (and their entries in `src/modules.js` and
  `ALL_MODULES` in `scripts/build.mjs`) after wave 1; the workspace switcher shows them as placeholders.
- Deferred by the user (build last, only if the user approves later): cloud-based features. Leave these as stubs:
  McMaster-Carr insert, cloud rendering, Data Panel.
- Approved by the user on 2026-11-09: the local equivalents of `PIM*` (item number, release, change orders, dashboard,
  details) and `TaskManagement*` that the manage builder built (`src/modules/manage/pim.js`, `tasks.js`) stay registered.
- Token economy: the user wants minimal token use. Use local evidence and local tests; web lookups only when needed.

## The user's working rules (apply them)
- The orchestrating session is a supervisor: it spawns subagents to write code and is accountable for their work.
- After every change, a review subagent with a cheap model (Haiku) and minimal context reviews the diff with fresh eyes.
- Never write the em dash character (U+2014) anywhere (code, comments, docs, commits, messages).
- Brief replies in Simplified Technical English, active voice. End each reply with the next action.
- Do not guess: check, or ask. Before saying "we do X" / "we don't have X", open the code and cite file:line.
- YAGNI, no scope growth without permission. Discuss options with the user before big plan changes.
- No Autodesk logos or icon artwork; Help > About keeps the "unofficial, not affiliated with Autodesk" label.
  Never commit files copied from the Fusion install or the private reference screenshots.

## Status at handover
- Last green commit: `a000b92` (prep: module slots, icon registry). Everything after it is untested WIP.
- configure: DONE. inspect (analyses, Manage Materials): DONE. annotate: DONE.
  Their builder reports and the Haiku review findings are in `docs/wave1-reports.json`. The findings are not yet
  checked or fixed: the integration step must check each one against the code and fix the real ones.
- foundation part 1 (feature registry, body kinds, contextual environments, workspaces): DONE, not yet reviewed.
  Its report (`build:foundation-1` in `docs/wave1-reports.json`) is the contract summary to pass to wave 2a as `args.f1`;
  details are in ARCHITECTURE.md. Run its Haiku review in the integration step.
- manage (utilities, scripts API, select tools, design advice, navigator): DONE, reviewed (`review:manage`).
- sketch (remaining sketch tools): DONE on the Windows PC run, reviewed (`build:sketch`, `review:sketch`).
- foundation part 2 (components): DONE on the Windows PC run (`build:foundation-2`); its review covers parts 1 and 2.
- Windows PC run (2026-11-09): paths and the shared agent brief are in `docs/workflows/agent-context.md`. Wave 2a (DONE)
  builders ran in parallel; their reports and reviews are in `docs/wave2a-reports.json`.
- Integration run (2026-11-09): DONE. All 188 review findings checked (99 fixed, 89 rejected), one line each in
  `docs/integration-report.md`. Unused module slots removed, CRLF files normalised to LF, no U+2014 left.
  Engine tests and all 32 QA scenarios pass; release is four files. Booted app: 497 real commands, 528 stubs
  (61 in Design, 467 in placeholder workspaces).
- Next: wave 2b (assembly, insertx, PCB tools, rough edges), then wave 3 (Render, Drawing). Also open: the six
  SURFACE > CREATE primitives (`SurfPrimitive*`) are still stubs.
- Cloud prep: `tests/e2e/harness.mjs` falls back to Chromium off Windows (or with `QA_BROWSER=chromium`), and
  `docs/fusion-evidence.json` holds command names, short dialog labels and toolbar layouts extracted from the
  local Fusion install by `scripts/fusion-evidence.mjs` (names and labels only). Check both exist; if the harness
  fallback is missing, add it.

## How to continue (Linux cloud container)
1. `npm install`, then `npx playwright install --with-deps chromium`. Use `QA_BROWSER=chromium` for every QA run.
2. Build and smoke test first: `node scripts/build.mjs --out=build/qa`, then
   `QA_BROWSER=chromium node tests/e2e/run-all.mjs core-loop --no-build --quiet`. Fix the build if the WIP broke it.
3. Workflow scripts are in `docs/workflows/`. Before running one, set `ROOT` to this checkout and replace the
   Fusion-install and screenshot evidence lines in its `ctx` text with: "Evidence: docs/fusion-evidence.json (names,
   labels, layouts) and src/modules/shell/spec.js". Keep the token-economy and em dash rules in the prompts.
   - `wave1.js`: drop the inspect and annotate builders and foundation part 1 (done). Run foundation part 2
     (components, resume from partial edits; pass it the part 1 report), sketch (resume), a Haiku review
     per area (also for foundation part 1 and manage), then the integration verify, which must also check the configure, inspect
     and annotate review findings in `docs/wave1-reports.json`.
   - `wave2a.js`: surface, mesh, sheetmetal, plastic, createx, solidx, form. It needs only foundation part 1, so it can
     run in parallel with the rest of wave 1: pass the part 1 report as `args.f1` and `args.base` = the handover commit.
   - wave 2b (write it in the same style): assembly (joints, as-built joints, joint origins, rigid groups, drive joints,
     motion links and studies, contact sets, component constraints, DOF / connection / statistics analyses,
     duplicate with joints, add to assembly), insertx (Insert Component, Insert Derive / Derive, Fasteners, Decal, Arrange,
     Find Similar, Replace with Primitives; no McMaster-Carr), the PCB tools (`PCBCreateCmd`, `PCBDeriveCmd`,
     `PCBExternalComponentCreationCmd`) and the rough edges (feature-face highlight instead of whole body, timeline
     dependencies for patterned features, sweep along splines, faster modeled threads, Manage Threads Library). Needs components.
   - wave 3: Render and Drawing workspaces through `app.registerWorkspace` (local rendering only).
4. Commit to `wip/everything` after each wave with the attribution line
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and push, so the user can follow progress.
5. At the end: full QA (`QA_BROWSER=chromium node tests/e2e/run-all.mjs --parallel=4 --quiet`), engine tests
   (`npm test`, `node tests/spline_test.mjs`, `node tests/robust_test.mjs`), `node scripts/build.mjs --release`
   (exactly four files), then ask the user before merging to `main` and deploying.

## Deploy (only with the user's OK)
`docs/workflows/deploy.sh` shows the old laptop deploy: copy `release/{index.html,app.js,app.css,occt.gz.wasm}` plus
`.nojekyll` into a checkout of the `gh-pages` branch, commit, push; then push `main`. Live site:
https://rohansharmacode.github.io/fusion-recreation/

## Handover note (cloud prep was cut short)
- `docs/fusion-evidence.json` was NOT generated (the laptop had to close). Use the names in `src/modules/shell/spec.js` and, sparingly, the public Autodesk Fusion help pages for dialog labels.
