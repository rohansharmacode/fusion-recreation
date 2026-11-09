# Design workspace recreation (unofficial Fusion hackathon entry)

**Live demo: https://rohansharmacode.github.io/fusion-recreation/** · Source: https://github.com/rohansharmacode/fusion-recreation

A browser recreation of the **Design workspace of Autodesk Fusion**, built with three.js and a real
B-rep kernel (OpenCascade via replicad, compiled to WebAssembly). It runs from one link, with no
install and no account.

> **Unofficial hackathon recreation: not affiliated with or endorsed by Autodesk.**
> Autodesk and Fusion are trademarks of Autodesk, Inc. No Autodesk logos, wordmarks or icon artwork
> are used: every icon is an original SVG drawing.

Best on **desktop Chrome or Edge** with a mouse (middle button pans, Shift+middle orbits, the wheel
zooms) and a keyboard. Other current browsers should work but get less testing. Small and touch screens
are only partly supported.

## What works

- **Fusion layout, light theme**: application bar, DESIGN workspace menu, SOLID / SURFACE / MESH / … tabs
  with the real panel layout and dropdowns, a transparent browser tree, ViewCube, navigation bar,
  parametric timeline, comments panel and bottom-right status text.
- **Sketching**: Create Sketch on an origin plane or a planar face, with a look-at animation, the SKETCH
  contextual tab, the Sketch Palette and Finish Sketch. Tools: Line (L), 2-Point / 3-Point / Center
  Rectangle (R), circles (C), arcs, polygons, slots, point, sketch fillet, Trim (T), Extend, Offset (O),
  fit-point splines, ellipses and elliptical arcs, Blend Curve, Mirror, Project (P), Sketch Dimension (D), the geometric constraints and the construction toggle (X).
  On-canvas value boxes, snapping with automatic H/V/coincident constraints, and a real constraint solver
  (blue lines turn black when fully constrained). Profiles are detected automatically.
- **Solid modelling** on a real B-rep kernel: Extrude (E; one side, two sides, symmetric, taper,
  join / cut / intersect / new body), Revolve, Sweep, Loft, Hole (H; simple, counterbore, countersink),
  Box / Cylinder / Sphere / Torus, Coil, Pipe, Thread, Split Body, Scale, Press Pull (Q), Fillet (F), Chamfer, Shell, Draft, Combine,
  Move/Copy (M), Mirror, Rectangular and Circular Pattern, Delete, and construction planes
  (offset, at angle, midplane). Every command has a docked dialog with a live preview.
- **Parametric history**: timeline playback, drag the marker to roll back, double-click a feature to
  edit it (the model recomputes downstream), and right-click to suppress, delete or roll here.
  Change Parameters, with expressions such as `d1 / 2`, and Compute All (Ctrl+B).
- **Fusion interaction**: right-click marking menu with its overflow list, the S toolbox with
  search, Fusion's default shortcuts, undo/redo (Ctrl+Z / Ctrl+Y), window/freeform/paint selection,
  visual styles, environments, camera modes and grid settings.
- **Inspect and files**: Measure (I), Section Analysis, Properties (volume, area, centre of mass),
  Appearance (A) and Physical Material, Interference, Bill of Materials, and Insert Canvas / Insert Mesh (STL, OBJ). Save and Open use browser storage, falling back to memory when
  storage is blocked. Export to STEP, STL or design JSON.
- **Robustness**: if one feature fails in the kernel, only that feature is marked as failed, and the app
  keeps running. Any unexpected error becomes a toast instead of a frozen UI. The loading screen shows
  real download progress, and if the kernel cannot start it gives a clear error with a Retry button.

Not in this recreation: the other workspaces, and the SURFACE / MESH / SHEET METAL / PLASTIC
commands. Those tabs and buttons are there, but they say "not available in this recreation". Also
missing: components, joints and assemblies; the cloud data panel, versions and sharing; rendering,
drawings and CAM. The geometry kernel runs on the main thread, so a very heavy boolean can make the
page wait until it finishes.

## Quick start (development)

```
npm install
npm run build          # dist/ (all modules, sourcemaps)
npm run serve          # http://127.0.0.1:5173/
npm test               # engine tests (sketch solver, regions, kernel, dialogs model)
npm run release        # release/ = index.html, app.js, app.css, occt.gz.wasm (what is published)
npm run e2e            # 20 QA scenarios in headless Edge (tests/e2e/scenarios; env QA_OUT, QA_SHOTS, QA_PORT)
```

| script | what it does |
|---|---|
| `npm run build` / `npm run watch` | development build into `dist/`, with sourcemaps (watch rebuilds on change) |
| `npm run release` | production build into `release/`: minified, tree-shaken, no sourcemaps, prints a size report |
| `npm run analyze` | release build plus a per-package size breakdown of `app.js` |
| `npm run serve` / `npm run serve:release` | static server for `dist/` (5173) or `release/` (5174) |
| `npm run serve:artifact` | serves `release/` the way a sandboxed artifact host would: strict CSP with no `unsafe-eval`, CORS, and `/__sandbox.html` loads the app in `<iframe sandbox="allow-scripts">` |
| `npm test` | Node engine tests |
| `npm run e2e` / `npm run e2e:release` | all QA scenarios against a dev build or a release build |
| `npm run verify` | builds `release/`, then checks it in headless Edge (see below) |

Requirements: Node 18 or newer. The e2e and verify scripts drive the installed **Microsoft Edge**
through playwright-core (`channel: "msedge"`).

### Testing on Linux (or without Edge)

Off Windows, the e2e and verify scripts launch playwright-core's own Chromium (see `scripts/browser.mjs`).
Install it once with `npx playwright-core install --with-deps chromium` (`npx playwright install --with-deps chromium`
also works if its version matches playwright-core). Set `QA_BROWSER=chromium` to use Chromium on Windows too, and
`QA_CHROMIUM_PATH=/path/to/chrome` to use a specific Chromium binary.

## Release checklist

1. `npm ci`
2. `npm test`. All engine tests must pass.
3. `npm run release`. `release/` must contain exactly these 4 files:

   | file | size | notes |
   |---|---|---|
   | `index.html` | 3 KB | shell markup and loading screen |
   | `app.js` | ~1.9 MB (~0.6 MB gzip) | everything: UI, three.js, replicad, OpenCascade glue |
   | `app.css` | ~80 KB | |
   | `occt.gz.wasm` | 6.9 MB | the 23 MB OpenCascade wasm, **gzip'd**, under a `.wasm` name; the app inflates it itself |

   Every file is under 20 MiB. There are no other requests: no CDN, no fonts, no external hosts.
4. `npm run verify`. This checks: the file set and sizes; boot with zero console errors; a box and a
   fillet; that a failing kernel operation stays isolated; the error safety net; real download progress
   on a throttled network; the error card and Retry after a failed download; a clear message for a
   missing or damaged kernel file and for disabled WebAssembly; the phone-size note; and the simulated
   sandboxed artifact host (strict CSP, opaque origin, localStorage throwing). Results go to
   `tests/e2e/out/packaging/verify.json`, with screenshots alongside.
5. `npm run e2e:release` (or `QA_OUT=release node tests/e2e/run-all.mjs --no-build core-loop`) runs the
   UI scenarios against the minified build.
6. Publish the 4 files using one of the options below. Open the link in a clean browser profile, then
   draw a sketch, extrude it, fillet an edge and press Ctrl+Z.

### Host on GitHub Pages
```
npm run release
npx gh-pages -d release          # pushes release/ to the gh-pages branch of this repo
```
Then set Settings → Pages → Source: "Deploy from a branch", `gh-pages` / root. Alternatives: commit
the 4 files to a `docs/` folder and publish that folder, or upload `release/` with the
`actions/upload-pages-artifact` + `actions/deploy-pages` workflow. GitHub Pages serves `.wasm` as
`application/wasm`. The app doesn't depend on the content type, because it reads the bytes itself.

### Host on Vercel / Netlify / Cloudflare Pages / any static host
Upload the `release/` folder as a static site: `npx vercel deploy release --prod`,
`npx netlify-cli deploy --dir=release --prod`, or drag and drop it into the host's dashboard. No build
step, rewrites or headers are needed. Hosts that compress responses on the fly are fine: the browser undoes their encoding, and the
app still receives the gzip file. If the host serves raw wasm, the app detects that and skips the
inflate step.

### Publish as a claude.ai artifact
Publish the 4 files from `release/` as one artifact. Keep the names as they are, all in the root:
`index.html` (entry), `app.js`, `app.css`, `occt.gz.wasm`. This build is made for that sandbox:
- every file is ≤ 20 MiB, and the extensions are `.html .js .css .wasm` only (the gzip'd kernel ships as
  `.wasm`, not `.gz`)
- scripts are bundled (no inline scripts, no CDN), and the only fetch is `occt.gz.wasm` on the same origin
- no `eval` is needed: the OpenCascade bindings fall back to closures when the CSP blocks `new Function`,
  so only `'wasm-unsafe-eval'` is required
- no `alert` / `confirm` / `prompt` / `window.open`; files are offered through `app.download()`, which uses
  the artifact `downloads` capability when it is present
- localStorage is always wrapped in try/catch; Save/Open fall back to memory for the session

To rehearse locally, run `npm run serve:artifact` and open `http://127.0.0.1:5175/__sandbox.html`.

### Performance (measured with `npm run verify`, localhost, headless Edge)
- First visit transfer: about 7.5 MB, almost all of it the kernel. `index.html` preloads
  `occt.gz.wasm`, so it downloads in parallel with `app.js`.
- On localhost the app is ready about 1 s after navigation: app.js is running at about 0.15 s, the
  kernel is inflated at about 0.4 s and started at about 0.6 s, and the UI modules take about 0.4 s.
- On a simulated 20 Mbit/s link with 40 ms latency (served uncompressed, the worst case) the app is
  ready at about 4.6 s. app.js is running at about 1.9 s, and the kernel has finished downloading in
  parallel by about 4.0 s. On a host that gzips `app.js`, about 0.5 s of that goes away. Later visits
  load from the browser cache.
- three.js and the `three/examples` imports (Line2, RoomEnvironment, fflate) are tree-shaken. Most of
  `app.js` is three.js (~670 KB) and replicad (~350 KB). Run `npm run analyze` for the breakdown.

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md) for the module contract. In short: `src/main.js` (boot and
loader), `src/app/core.js` (App: document, evaluation, commands, input, undo), `src/model.js` /
`src/kernel.js` / `src/sketch/*` (modelling engine), and `src/modules/<name>/` (UI modules: viewport,
sketch, dialogs, inspect, shell, browser, timeline, menus). `scripts/` holds the build, the server and
release verification; `tests/` holds the engine tests and the e2e harness and scenarios.

## Credits and licences

- [three.js](https://threejs.org) (MIT), [replicad](https://replicad.xyz) (MIT), and
  [OpenCascade Technology](https://dev.opencascade.org) via `replicad-opencascadejs` (LGPL-2.1).
  `occt.gz.wasm` is the unmodified `replicad_single.wasm`, gzip'd. The build adds a CSP-safe
  fallback to its JS glue (see `scripts/build.mjs`) and changes nothing else.
- [esbuild](https://esbuild.github.io) (MIT) bundles the app; playwright-core (Apache-2.0) runs the
  tests.
