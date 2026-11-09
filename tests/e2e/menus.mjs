// e2e test for the menus module: marking menu (right-click + flick), S toolbox search,
// Parameters dialog edits, save -> new -> open roundtrip, undo/redo, Show/Hide, Delete, export.
//   node tests/e2e/menus.mjs [--only=viewport,menus] [--headed]
import { launch } from "./harness.mjs";

const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7) || "viewport,menus";
const headless = !process.argv.includes("--headed");
const h = await launch({ only, outDir: process.env.MENUS_OUT || "build/menus", port: Number(process.env.MENUS_PORT) || 5317, shots: process.env.MENUS_SHOTS || "tests/e2e/out/menus", headless });
const { page } = h;
let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vol = () => page.evaluate(() => app.bodies().reduce((s, b) => s + app.K.R.measureVolume(b.shape), 0));
// Fusion opens the Parameters tree with the component collapsed: expand like a user (click the chevrons)
const expandParams = async () => {
  for (let i = 0; i < 30; i++) {
    const tog = await page.$('[data-dialog="ChangeParameterCommand"] tr.pm-collapsed .pm-tog');
    if (!tog) break;
    await tog.click();
    await sleep(30);
  }
};

try {
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* ignore */ } });
  const canvas = await page.evaluate(() => { const r = app.viewport.canvas.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const cx = canvas.x + canvas.w / 2, cy = canvas.y + canvas.h / 2;
  // empty-canvas spot (top-left area of the canvas, away from the model)
  const ex = canvas.x + canvas.w * 0.22, ey = canvas.y + canvas.h * 0.45;

  // ---------------------------------------------------------------- model a box
  const box = await page.evaluate(() => {
    const f = app.addFeature({ type: "box", length: "40 mm", width: "20 mm", height: "10 mm", operation: "new", plane: { kind: "origin", name: "XY" } });
    app.viewport.fit && app.viewport.fit({ animate: false });
    return { id: f.id, p: f.p, ok: app.featureResult(f.id).ok };
  });
  check("box feature created", box.ok, JSON.stringify(box.p));
  check("box volume 8000", Math.abs((await vol()) - 8000) < 1e-3);
  await h.frames(4);

  // ---------------------------------------------------------------- marking menu on empty canvas
  await page.mouse.click(ex, ey, { button: "right" });
  await sleep(120);
  const mm1 = await page.evaluate(() => {
    const root = document.querySelector(".mm-root");
    if (!root) return null;
    const items = [...root.querySelectorAll(".mm-item")].map((n) => ({ pos: n.dataset.pos, cmd: n.dataset.cmd || n.dataset.mm || n.dataset.action, label: (n.querySelector(".mm-label")?.textContent || "").trim(), disabled: n.classList.contains("mm-disabled") }));
    return { items, overflow: [...root.querySelectorAll(".mm-overflow .mn-mi")].map((n) => n.textContent.trim()) };
  });
  check("marking menu opens on right-click", !!mm1, mm1 && mm1.items.map((i) => `${i.pos}:${i.label}`).join(" | "));
  const byPos = Object.fromEntries((mm1 ? mm1.items : []).map((i) => [i.pos, i]));
  check("N = Repeat", byPos.N && /^Repeat/.test(byPos.N.label));
  check("W = Undo (enabled)", byPos.W && byPos.W.label === "Undo" && !byPos.W.disabled);
  check("E = Redo (disabled)", byPos.E && byPos.E.label === "Redo" && byPos.E.disabled);
  check("S = Sketch submenu", byPos.S && byPos.S.cmd === "sketch-submenu");
  check("NE/SE/SW/NW = Press Pull/Hole/Move/Delete", byPos.NE && /Press Pull/.test(byPos.NE.label) && /Hole/.test(byPos.SE.label) && /Move/.test(byPos.SW.label) && /Delete/.test(byPos.NW.label));
  await page.mouse.move(ex - 80, ey); // toward West: Undo highlighted
  await sleep(60);
  check("direction highlight (W)", await page.evaluate(() => document.querySelector(".mm-item.mm-hi")?.dataset.pos === "W"));
  await h.shot("01-marking-menu-empty");
  // hover the Sketch submenu item -> 2nd tier
  const sk = await page.evaluate(() => { const r = document.querySelector('.mm-item[data-mm="sketch-submenu"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(sk.x, sk.y, { steps: 4 });
  await sleep(420);
  const tier2 = await page.evaluate(() => ({ level: document.querySelector(".mm-root")?.dataset.level, labels: [...document.querySelectorAll(".mm-root .mm-item")].map((n) => `${n.dataset.pos}:${n.querySelector(".mm-label").textContent}`) }));
  check("Sketch 2nd tier opens", tier2.level === "sketch", tier2.labels.join(" | "));
  await h.shot("02-marking-menu-sketch-tier");
  await page.keyboard.press("Escape");
  await sleep(50);
  check("Esc closes marking menu", await page.evaluate(() => !document.querySelector(".mm-root")));

  // ---------------------------------------------------------------- right-click on the body selects it + body overflow
  await page.evaluate(() => app.selection.clear());
  await page.mouse.click(cx, cy, { button: "right" });
  await sleep(120);
  const mm2 = await page.evaluate(() => ({ sel: app.selection.items.map((r) => r.kind), overflow: [...document.querySelectorAll(".mm-root .mm-overflow .mn-mi-label")].map((n) => n.textContent.trim()) }));
  check("right-click on the model selects it", mm2.sel.length === 1, mm2.sel.join(","));
  check("overflow list shows selection commands", mm2.overflow.length > 0, mm2.overflow.join(" | "));
  await h.shot("03-marking-menu-face");
  await page.keyboard.press("Escape");
  await page.evaluate(() => app.selection.clear());

  // ---------------------------------------------------------------- flick gestures: right-drag West = Undo, East = Redo
  const flick = async (dx, dy) => {
    await page.mouse.move(ex, ey);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(ex + dx * 0.3, ey + dy * 0.3, { steps: 3 });
    await page.mouse.move(ex + dx, ey + dy, { steps: 5 });
    await page.mouse.up({ button: "right" });
    await sleep(150);
  };
  await flick(-110, 0);
  const afterUndo = await page.evaluate(() => ({ n: app.doc.features.length, menu: !!document.querySelector(".mm-root") }));
  check("flick West runs Undo", afterUndo.n === 0 && !afterUndo.menu, JSON.stringify(afterUndo));
  await flick(110, 0);
  const afterRedo = await page.evaluate(() => ({ n: app.doc.features.length, menu: !!document.querySelector(".mm-root") }));
  check("flick East runs Redo", afterRedo.n === 1 && !afterRedo.menu, JSON.stringify(afterRedo));

  // ---------------------------------------------------------------- in-command marking menu: W Cancel, E OK
  await page.evaluate(() => {
    window.__ac = [];
    app.activeCommand = { id: "TestCmd", ok() { window.__ac.push("ok"); app.activeCommand = null; }, cancel() { window.__ac.push("cancel"); app.activeCommand = null; } };
  });
  await page.mouse.click(ex, ey, { button: "right" });
  await sleep(100);
  const inCmd = await page.evaluate(() => [...document.querySelectorAll(".mm-root .mm-item")].map((n) => `${n.dataset.pos}:${n.querySelector(".mm-label").textContent}`));
  check("in-command menu = Cancel(W) / OK(E)", inCmd.join("|") === "E:OK|W:Cancel" || inCmd.sort().join("|") === "E:OK|W:Cancel", inCmd.join(" | "));
  await h.shot("04-marking-menu-in-command");
  await page.mouse.click(ex + 90, ey); // click East sector -> OK
  await sleep(80);
  check("OK runs activeCommand.ok()", await page.evaluate(() => window.__ac.join(",") === "ok"));

  // ---------------------------------------------------------------- S toolbox
  await page.evaluate(() => {
    window.__ran = [];
    app.commands.register({ id: "Extrude", label: "Extrude", shortcut: "E", run: () => window.__ran.push("Extrude") });
    app.commands.register({ id: "ExtendSketchCmd", label: "Extend", when: "sketch", run: () => window.__ran.push("Extend") });
  });
  await page.mouse.move(cx + 120, cy - 60);
  await page.mouse.click(cx + 120, cy - 60); // focus canvas (click empty spot near the model)
  await page.evaluate(() => app.selection.clear());
  await page.keyboard.press("s");
  await sleep(120);
  check("S opens the toolbox", await page.evaluate(() => !!document.querySelector(".tbx-root input") && document.activeElement === document.querySelector(".tbx-root input")));
  await h.shot("05-toolbox");
  await page.keyboard.type("ext");
  await sleep(80);
  const tbx = await page.evaluate(() => ({ rows: [...document.querySelectorAll(".tbx-root .tbx-row")].map((n) => n.dataset.cmd), value: document.querySelector(".tbx-root input").value }));
  check("toolbox search 'ext' finds Extrude", tbx.rows[0] === "Extrude" && tbx.value === "ext", tbx.rows.join(","));
  await h.shot("06-toolbox-search-ext");
  await page.keyboard.press("Enter");
  await sleep(80);
  check("Enter runs the highlighted command", await page.evaluate(() => window.__ran.includes("Extrude") && !document.querySelector(".tbx-root")));
  await page.keyboard.press("s");
  await sleep(60);
  await page.keyboard.type("par");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  const parRows = await page.evaluate(() => [...document.querySelectorAll(".tbx-root .tbx-row")].map((n) => n.dataset.cmd));
  check("toolbox search 'par' finds Change Parameters", parRows.includes("ChangeParameterCommand"), parRows.join(","));
  // pin it: right-click the result -> Add to Toolbox
  await page.click('.tbx-root .tbx-row[data-cmd="ChangeParameterCommand"]', { button: "right" });
  await sleep(60);
  await page.click(".mn-context .mn-mi");
  await sleep(60);
  await page.fill(".tbx-root input", "");
  await sleep(60);
  const grid = await page.evaluate(() => [...document.querySelectorAll(".tbx-root .tbx-cell")].map((n) => n.dataset.cmd + (n.classList.contains("tbx-pinned") ? "*" : "")));
  check("Add to Toolbox pins the command first in the grid", grid[0] === "ChangeParameterCommand*", grid.join(","));
  await page.keyboard.press("Escape");
  await sleep(50);
  check("Esc closes toolbox", await page.evaluate(() => !document.querySelector(".tbx-root")));

  // ---------------------------------------------------------------- Parameters dialog
  await page.evaluate(() => app.commands.run("ChangeParameterCommand"));
  await sleep(150);
  const treeAtOpen = await page.evaluate(() => [...document.querySelectorAll('[data-dialog="ChangeParameterCommand"] tr.pm-group')].map((r) => r.dataset.group + (r.classList.contains("pm-collapsed") ? "+" : "")).join(","));
  check("Parameters tree opens like Fusion (Favorites, User Parameters, Model Parameters > component collapsed)", treeAtOpen === "favorites,user,model,comp+", treeAtOpen);
  await expandParams();
  const pd = await page.evaluate(() => ({ open: !!document.querySelector('[data-dialog="ChangeParameterCommand"]'), rows: [...document.querySelectorAll(".pm-row")].map((r) => r.dataset.param), heads: [...document.querySelectorAll(".pm-table thead th")].map((t) => t.textContent) }));
  check("Parameters dialog opens", pd.open, pd.rows.join(","));
  check("columns Parameter/Name/Unit/Expression/Value/Comments", pd.heads.slice(0, 6).join("|") === "Parameter|Name|Unit|Expression|Value|Comments", pd.heads.join("|"));
  const valCell = await page.evaluate((n) => document.querySelector(`.pm-row[data-param="${n}"] .pm-value`)?.textContent, box.p.length);
  check("Value column shows the number only, like Fusion (40.00)", valCell === "40.00", valCell);
  const d1 = box.p.length;
  await h.shot("07-parameters");
  // invalid expression
  const exprSel = `[data-dialog="ChangeParameterCommand"] [data-input="expr:${d1}"]`;
  await page.fill(exprSel, "40 mm + foo");
  await page.press(exprSel, "Enter");
  await sleep(80);
  const bad = await page.evaluate((s) => ({ invalid: document.querySelector(s).classList.contains("pm-invalid"), tip: document.querySelector(".pm-tip")?.textContent }), exprSel);
  check("invalid expression flagged", bad.invalid && /foo/.test(bad.tip || ""), bad.tip);
  check("volume unchanged after invalid edit", Math.abs((await vol()) - 8000) < 1e-3);
  await h.shot("08-parameters-error");
  await page.fill(exprSel, "60 mm");
  await page.press(exprSel, "Enter");
  await sleep(150);
  check("edit d1 = 60 mm changes volume to 12000", Math.abs((await vol()) - 12000) < 1e-3, String(await vol()));
  // user parameter + reference
  await page.click('[data-dialog="ChangeParameterCommand"] [data-action="add-user-param"]');
  await sleep(100);
  await page.fill('[data-dialog="AddUserParameter"] [data-input="name"]', "wid");
  await page.fill('[data-dialog="AddUserParameter"] [data-input="expression"]', "25");
  await page.click('[data-dialog="AddUserParameter"] [data-action="ok"]');
  await sleep(120);
  const up = await page.evaluate(() => app.doc.params.map((p) => `${p.name}=${p.expr}`));
  check("user parameter added (bare number gets unit)", up.includes("wid=25 mm"), up.join(","));
  const d2Sel = `[data-dialog="ChangeParameterCommand"] [data-input="expr:${box.p.width}"]`;
  await page.fill(d2Sel, "wid");
  await page.press(d2Sel, "Enter");
  await sleep(150);
  check("width = wid -> volume 60*25*10", Math.abs((await vol()) - 15000) < 1e-3, String(await vol()));
  // rename a model parameter: references follow
  const nameSel = `[data-dialog="ChangeParameterCommand"] [data-input="name:wid"]`;
  await page.fill(nameSel, "boxWidth");
  await page.press(nameSel, "Enter");
  await sleep(150);
  const ren = await page.evaluate((k) => ({ expr: app.feature(app.doc.features[0].id)[k], user: app.doc.params.map((p) => p.name) }), "width");
  check("rename user parameter updates references", ren.expr === "boxWidth" && ren.user.includes("boxWidth"), JSON.stringify(ren));
  // delete a referenced parameter is refused
  // Fusion: select the row, then the trash icon in the top row
  await page.click(`[data-dialog="ChangeParameterCommand"] tr.pm-row[data-param="${box.p.length}"] td.pm-param`);
  check("Delete icon is disabled for a model parameter", await page.evaluate(() => document.querySelector('[data-dialog="ChangeParameterCommand"] [data-action="delete-param"]').disabled));
  await page.click('[data-dialog="ChangeParameterCommand"] tr.pm-row[data-param="boxWidth"] td.pm-param');
  check("selected row is highlighted", await page.evaluate(() => document.querySelector('tr.pm-row[data-param="boxWidth"]').classList.contains("pm-sel")));
  await page.click('[data-dialog="ChangeParameterCommand"] [data-action="delete-param"]');
  await sleep(100);
  const delErr = await page.evaluate(() => document.querySelector('[data-dialog="DeleteParamError"] .mn-msg-text')?.textContent || "");
  check("deleting a referenced parameter is refused", /cannot be deleted/.test(delErr), delErr);
  await page.click('[data-dialog="DeleteParamError"] [data-action="ok"]');
  await h.shot("09-parameters-edited");
  const undoBefore = await page.evaluate(() => app.history.undoStack.length);
  await page.click('[data-dialog="ChangeParameterCommand"] [data-action="ok"]');
  await sleep(80);
  const undoAfter = await page.evaluate(() => ({ n: app.history.undoStack.length, label: app.history.undoStack.at(-1).label }));
  check("OK collapses the edits into one undo step", undoAfter.label === "Change Parameters" && undoAfter.n < undoBefore, JSON.stringify(undoAfter));
  await page.evaluate(() => app.viewport.canvas.focus());
  await page.keyboard.press("Control+z");
  await sleep(150);
  check("Ctrl+Z undoes the parameter changes", Math.abs((await vol()) - 8000) < 1e-3 && (await page.evaluate(() => app.doc.params.length)) === 0, String(await vol()));
  await page.keyboard.press("Control+y");
  await sleep(150);
  check("Ctrl+Y redoes them", Math.abs((await vol()) - 15000) < 1e-3, String(await vol()));
  await page.keyboard.press("Control+Shift+z");
  // Cancel reverts
  await page.evaluate(() => app.commands.run("ChangeParameterCommand"));
  await sleep(120);
  await expandParams();
  await page.fill(exprSel, "100 mm");
  await page.press(exprSel, "Enter");
  await sleep(120);
  const mid = await vol();
  await page.click('[data-dialog="ChangeParameterCommand"] [data-action="cancel"]');
  await sleep(120);
  check("Cancel reverts live edits", Math.abs(mid - 25000) < 1e-3 && Math.abs((await vol()) - 15000) < 1e-3, `${mid} -> ${await vol()}`);

  // ---------------------------------------------------------------- save -> new -> open roundtrip
  await page.evaluate(() => app.viewport.canvas.focus());
  await page.keyboard.press("Control+s");
  await sleep(150);
  check("Ctrl+S opens the Save dialog on first save", await page.evaluate(() => !!document.querySelector('[data-dialog="FileSave"]')));
  await page.fill('[data-dialog="FileSave"] [data-input="name"]', "Bracket");
  await h.shot("10-save-dialog");
  await page.click('[data-dialog="FileSave"] [data-action="ok"]');
  await sleep(150);
  const saved = await page.evaluate(() => ({ name: app.doc.name, dirty: app.dirty, ver: app.doc.savedVersion, idx: JSON.parse(localStorage.getItem("fusion-rec:designs") || "[]").map((e) => `${e.name} v${e.version}`) }));
  check("saved to localStorage, name + version updated, not dirty", saved.name === "Bracket" && !saved.dirty && saved.idx[0] === "Bracket v1", JSON.stringify(saved));
  await page.evaluate(() => app.mutate("touch", (d) => { d.params.push({ name: "extra", expr: "3 mm", kind: "length" }); }));
  await page.keyboard.press("Control+s");
  await sleep(120);
  const saved2 = await page.evaluate(() => ({ dialog: !!document.querySelector('[data-dialog="FileSave"]'), ver: app.doc.savedVersion, dirty: app.dirty }));
  check("second save is silent and bumps version", !saved2.dialog && saved2.ver === 2 && !saved2.dirty, JSON.stringify(saved2));
  await page.evaluate(() => app.commands.run("FileNew"));
  await sleep(150);
  const fresh = await page.evaluate(() => ({ n: app.doc.features.length, name: app.doc.name, bodies: app.bodies().length }));
  check("New Design gives an empty Untitled document", fresh.n === 0 && fresh.bodies === 0 && fresh.name === "Untitled", JSON.stringify(fresh));
  // dirty New asks first
  await page.evaluate(() => app.addFeature({ type: "box", length: "5 mm", width: "5 mm", height: "5 mm", operation: "new", plane: { kind: "origin", name: "XY" } }));
  await page.evaluate(() => app.commands.run("FileOpen"));
  await sleep(150);
  check("Open dialog lists the saved design", await page.evaluate(() => !!document.querySelector('[data-dialog="FileOpen"] .mn-open-item[data-design]:not([data-design="recovery"])')));
  await h.shot("11-open-dialog");
  await page.click('[data-dialog="FileOpen"] .mn-open-item:not([data-design="recovery"])');
  await page.click('[data-dialog="FileOpen"] [data-action="ok"]');
  await sleep(150);
  check("opening with unsaved changes asks to save", await page.evaluate(() => !!document.querySelector('[data-dialog="SaveChanges"]')));
  await h.shot("12-save-changes");
  await page.click('[data-dialog="SaveChanges"] [data-action="discard"]');
  await sleep(200);
  const opened = await page.evaluate(() => ({ n: app.doc.features.length, name: app.doc.name, params: app.doc.params.map((p) => p.name), dirty: app.dirty, ver: app.ui.files.current && app.ui.files.current.version }));
  check("roundtrip restores the design", opened.n === 1 && opened.name === "Bracket" && opened.params.includes("extra") && !opened.dirty && opened.ver === 2, JSON.stringify(opened));
  check("roundtrip volume 15000", Math.abs((await vol()) - 15000) < 1e-3, String(await vol()));

  // ---------------------------------------------------------------- V toggles visibility, Delete deletes
  const bid = await page.evaluate(() => app.bodies()[0].id);
  await page.evaluate((b) => { app.selection.set([{ kind: "body", body: b }]); app.viewport.canvas.focus(); }, bid);
  await page.keyboard.press("v");
  await sleep(100);
  check("V hides the selected body", await page.evaluate((b) => app.doc.bodies[b].visible === false, bid));
  await page.evaluate((b) => { app.selection.set([{ kind: "body", body: b }]); }, bid);
  await page.keyboard.press("v");
  await sleep(100);
  check("V shows it again", await page.evaluate((b) => app.doc.bodies[b].visible !== false, bid));
  await page.evaluate((b) => app.selection.set([{ kind: "body", body: b }]), bid);
  await page.keyboard.press("Delete");
  await sleep(150);
  const del = await page.evaluate(() => ({ bodies: app.bodies().length, last: app.doc.features.at(-1).type }));
  check("Delete removes the selected body", del.bodies === 0, JSON.stringify(del));
  await page.keyboard.press("Control+z");
  await sleep(150);
  check("Undo brings it back", await page.evaluate(() => app.bodies().length === 1));

  // ---------------------------------------------------------------- Compute All, export
  await page.keyboard.press("Control+b");
  await sleep(150);
  check("Ctrl+B computes all", await page.evaluate(() => app.result && Object.values(app.result.results).every((r) => r.ok || r.rolled)));
  const ex1 = await page.evaluate(() => { const out = {}; for (const t of ["step", "stl", "json"]) { try { out[t] = app.ui.files.doExport(t, "Bracket").size; } catch (e) { out[t] = `ERR ${e.message}`; } } return out; });
  check("export STEP/STL/JSON produce files", ex1.step > 1000 && ex1.stl > 500 && ex1.json > 100, JSON.stringify(ex1));
  await page.evaluate(() => app.commands.run("FileExport"));
  await sleep(120);
  await h.shot("13-export-dialog");
  await page.selectOption('[data-dialog="FileExport"] [data-input="type"]', "stl");
  await page.click('[data-dialog="FileExport"] [data-action="ok"]');
  await sleep(200);
  check("Export dialog exports STL", await page.evaluate(() => app.ui.files.lastExport && app.ui.files.lastExport.type === "stl" && !document.querySelector('[data-dialog="FileExport"]')));
  await page.evaluate(() => app.commands.run("FileExportSTL"));
  await sleep(120);
  await h.shot("14-3d-print");
  await page.click('[data-dialog="FileExportSTL"] [data-action="ok"]');
  await sleep(200);

  // ---------------------------------------------------------------- shortcuts + about
  await page.evaluate(() => app.commands.run("KeyboardShortcuts"));
  await sleep(120);
  const ks = await page.evaluate(() => [...document.querySelectorAll('[data-dialog="KeyboardShortcuts"] .ks-row')].map((r) => r.textContent).join(" / "));
  check("Keyboard Shortcuts lists Ctrl+Z/S toolbox", /Undo/.test(ks) && /Toolbox/.test(ks), ks.slice(0, 160));
  await h.shot("15-keyboard-shortcuts");
  await page.keyboard.press("Escape");
  await page.evaluate(() => app.commands.run("About"));
  await sleep(120);
  const about = await page.evaluate(() => document.querySelector('[data-dialog="About"]')?.textContent || "");
  check("About has the disclaimer", /Unofficial hackathon recreation — not affiliated with or endorsed by Autodesk/.test(about) && /Fusion Design — unofficial recreation/.test(about));
  await h.shot("16-about");
  await page.keyboard.press("Escape");
  await sleep(60);
  check("Esc closes modal", await page.evaluate(() => !document.querySelector(".mn-backdrop")));

  // ---------------------------------------------------------------- repeat
  await page.evaluate(() => { app.commands.register({ id: "FusionFilletEdgesCommand", label: "Fillet", run: () => window.__ran.push("Fillet") }); app.commands.run("FusionFilletEdgesCommand"); });
  await page.mouse.click(ex, ey, { button: "right" });
  await sleep(100);
  const rep = await page.evaluate(() => document.querySelector('.mm-item[data-pos="N"] .mm-label')?.textContent.trim());
  check("Repeat shows the last command", rep === "Repeat Fillet", rep);
  // the overflow list sits right above the radial (Fusion), so click the Repeat button itself
  const repBox = await page.evaluate(() => { const r = document.querySelector('.mm-item[data-pos="N"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(repBox.x, repBox.y);
  await sleep(80);
  check("Repeat runs it again", await page.evaluate(() => window.__ran.filter((x) => x === "Fillet").length === 2));

  // ---------------------------------------------------------------- gesture through the Sketch submenu (S then S = Line)
  await page.evaluate(() => {
    window.__ran = [];
    if (!app.commands.get("DrawPolyline") || app.commands.get("DrawPolyline").stub) app.commands.register({ id: "DrawPolyline", label: "Line", when: "sketch", kind: "tool", shortcut: "L", run: () => window.__ran.push("Line") });
  });
  await page.mouse.move(ex, ey - 120);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(ex, ey - 60, { steps: 4 });
  await page.mouse.move(ex, ey - 20, { steps: 6 }); // past the Sketch item: 2nd tier opens here
  await page.mouse.move(ex, ey + 70, { steps: 8 }); // keep going South: Line
  const g2 = await page.evaluate(() => ({ level: document.querySelector(".mm-root")?.dataset.level, hi: document.querySelector(".mm-item.mm-hi .mm-label")?.textContent }));
  await page.mouse.up({ button: "right" });
  await sleep(150);
  // in the model environment a sketch tool starts Create Sketch first (no SketchCreate in this build -> runs directly)
  check("flick S,S runs Line from the Sketch tier", g2.level === "sketch" && g2.hi === "Line" && (await page.evaluate(() => window.__ran.includes("Line") || !!app.commands.get("SketchCreate"))), JSON.stringify(g2));

  // ---------------------------------------------------------------- sketch environment: Delete routing + in-tool OK/Cancel
  const skf = await page.evaluate(() => {
    const S = app.S;
    const sk = S.newSketch();
    const a = S.addPoint(sk, 0, 0), b = S.addPoint(sk, 30, 0), c = S.addPoint(sk, 30, 20);
    const l1 = S.addLine(sk, a, b), l2 = S.addLine(sk, b, c);
    const f = app.addFeature({ type: "sketch", plane: app.K.ORIGIN_PLANES.XY, planeRef: { kind: "origin", name: "XY" }, sk });
    app.setMode("sketch", f.id);
    return { id: f.id, l1, l2 };
  });
  await page.evaluate((s) => { app.selection.set([{ kind: "sketchCurve", sketch: s.id, curve: s.l1 }]); app.viewport.canvas.focus(); }, skf);
  await page.mouse.click(ex, ey, { button: "right" });
  await sleep(100);
  const skMenu = await page.evaluate(() => ({ items: [...document.querySelectorAll(".mm-root .mm-item .mm-label")].map((n) => n.textContent), ov: [...document.querySelectorAll(".mm-root .mm-overflow .mn-mi-label")].map((n) => n.textContent) }));
  check("sketch-mode marking menu (XML layout) + overflow", skMenu.items.includes("Undo") && skMenu.ov.length > 0, `${skMenu.items.join(",")} / ${skMenu.ov.join(",")}`);
  await h.shot("17-marking-menu-sketch");
  await page.keyboard.press("Escape");
  await page.evaluate((s) => app.selection.set([{ kind: "sketchCurve", sketch: s.id, curve: s.l1 }]), skf);
  await page.keyboard.press("Delete");
  await sleep(120);
  const afterDel = await page.evaluate((s) => Object.keys(app.feature(s.id).sk.curves), skf);
  check("Delete in a sketch removes the selected curve", !afterDel.includes(skf.l1) && afterDel.includes(skf.l2), afterDel.join(","));
  await page.evaluate(() => {
    window.__tool = [];
    const h = { name: "sketch-tool:DrawPolyline", onCancel() { window.__tool.push("cancel"); off(); return true; } };
    const off = app.input.push(h);
  });
  await page.mouse.click(ex, ey, { button: "right" });
  await sleep(100);
  const toolMenu = await page.evaluate(() => [...document.querySelectorAll(".mm-root .mm-item")].map((n) => `${n.dataset.pos}:${n.querySelector(".mm-label").textContent}`).sort().join("|"));
  check("in-tool marking menu = Cancel / OK", toolMenu === "E:OK|W:Cancel", toolMenu);
  await page.mouse.click(ex - 90, ey);
  await sleep(80);
  check("Cancel ends the tool", await page.evaluate(() => window.__tool.join(",") === "cancel"));
  await page.evaluate(() => app.setMode("model", null));

  // ---------------------------------------------------------------- sketch dimension parameters
  const dim = await page.evaluate(() => {
    const S = app.S;
    let out;
    app.mutate("dim sketch", (doc) => {
      const sk = S.newSketch();
      const a = S.addPoint(sk, 0, 0), b = S.addPoint(sk, 25, 3);
      const l = S.addLine(sk, a, b);
      S.addConstraint(sk, "horizontal", [l]);
      const c = S.addConstraint(sk, "distance", [a, b], { expr: "25 mm", param: app.M.nextParam(doc) });
      const f = { type: "sketch", plane: app.K.ORIGIN_PLANES.XY, planeRef: { kind: "origin", name: "XY" }, sk, name: "SketchDim", id: "fdim" };
      doc.features.splice(doc.marker, 0, f);
      doc.marker += 1;
      out = { param: c.param, a, b };
    });
    return out;
  });
  await page.evaluate(() => app.commands.run("ChangeParameterCommand"));
  await sleep(150);
  await expandParams();
  const dimRow =await page.evaluate((p) => document.querySelector(`.pm-row[data-param="${p}"] .pm-param`)?.textContent, dim.param);
  check("sketch dimension listed as 'Linear Dimension-2' (Fusion numbers from 2)", dimRow === "Linear Dimension-2", dimRow);
  const dSel = `[data-dialog="ChangeParameterCommand"] [data-input="expr:${dim.param}"]`;
  await page.fill(dSel, "42 mm");
  await page.press(dSel, "Enter");
  await sleep(150);
  const solved = await page.evaluate((d) => { const st = app.sketchState("fdim"); const P = st.sk.points; return Math.hypot(P[d.b].x - P[d.a].x, P[d.b].y - P[d.a].y); }, dim);
  check("editing the dimension re-solves the sketch", Math.abs(solved - 42) < 1e-4, String(solved));
  await page.fill(dSel, "-5 mm");
  await page.press(dSel, "Enter");
  await sleep(80);
  check("non-positive dimension rejected", await page.evaluate((s) => document.querySelector(s).classList.contains("pm-invalid"), dSel));
  await page.click('[data-dialog="ChangeParameterCommand"] [data-action="ok"]');
  await sleep(80);

  // ---------------------------------------------------------------- generic context menu API (for browser/timeline)
  await page.evaluate(() => {
    window.__cm = [];
    app.ui.contextMenu.show([{ label: "First", run: () => window.__cm.push(1) }, "-", { label: "Second", run: () => window.__cm.push(2) }, { label: "Off", enabled: false, run: () => window.__cm.push(3) }], 300, 300);
  });
  await sleep(60);
  await page.click(".mn-context .mn-mi:nth-of-type(3)"); // "Second" (separator is the 2nd child)
  await sleep(60);
  check("context menu runs the picked item and closes", await page.evaluate(() => window.__cm.join(",") === "2" && !document.querySelector(".mn-context")));

  // ---------------------------------------------------------------- Open from my computer (design JSON import)
  const json = await page.evaluate(() => JSON.stringify({ format: "fusion-recreation-design", version: 1, doc: { ...app.doc, name: "Imported Part" } }));
  const nFeat = await page.evaluate(() => app.doc.features.length);
  await page.evaluate(() => { app.dirty = false; app.commands.run("FileNew"); });
  await sleep(100);
  await page.evaluate(() => app.commands.run("FileOpen"));
  await sleep(100);
  await page.setInputFiles('[data-dialog="FileOpen"] input[type=file]', { name: "Imported Part.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await sleep(400);
  const imp = await page.evaluate(() => ({ n: app.doc.features.length, name: app.doc.name, bound: !!app.doc.fileId }));
  check("Open from my computer imports a design file", imp.n === nFeat && imp.name === "Imported Part" && !imp.bound, JSON.stringify(imp));

  // ---------------------------------------------------------------- auto-recovery
  await page.evaluate(() => app.mutate("touch2", (d) => { d.params.push({ name: "rec", expr: "1 mm", kind: "length" }); }));
  await sleep(4400);
  const rec = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem("fusion-rec:recovery") || "null"); return r && { dirty: r.dirty, n: r.doc.features.length }; });
  check("auto-recovery copy written after changes", rec && rec.dirty, JSON.stringify(rec));
  await page.evaluate(() => app.commands.run("FileOpen"));
  await sleep(120);
  check("Open dialog offers the recovered document", await page.evaluate(() => !!document.querySelector('[data-dialog="FileOpen"] [data-design="recovery"]')));
  await page.keyboard.press("Escape");

  console.log(`\nconsole/page errors: ${h.errors.length ? "\n" + h.errors.join("\n") : "none"}`);
  if (h.errors.length) failures++;
} catch (e) {
  console.error(e);
  failures++;
  try { await h.shot("zz-failure"); } catch { /* ignore */ }
} finally {
  await h.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exitCode = failures ? 1 : 0;
