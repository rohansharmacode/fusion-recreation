// Shell module e2e: app bar, toolbar tabs/panels/dropdowns, contextual SKETCH tab, tooltips,
// File/Help menus, Data Panel, Comments, stub commands, layout reset.
//   node tests/e2e/shell.mjs [--only=shell,viewport] [--no-build]
import { launch } from "./harness.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const only = arg("only", "shell,viewport");
const h = await launch({ only: only === "all" ? undefined : only, outDir: arg("out", "build/shell"), port: Number(arg("port", "5312")), shots: arg("shots", "tests/e2e/out/shell"), build: !process.argv.includes("--no-build") });
const { page } = h;
const fails = [];
const check = (cond, msg) => { if (!cond) { fails.push(msg); console.log("  FAIL", msg); } else console.log("  ok  ", msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await h.frames(4);
  // ---- structure
  const s = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll("#toolbar [data-tab]")].map((e) => e.textContent),
    active: app.ui.toolbar.activeTab,
    panels: [...document.querySelectorAll("#toolbar [data-panel]")].map((e) => e.textContent.trim()),
    buttons: document.querySelectorAll("#toolbar .tb-btn[data-cmd]").length,
    ws: document.querySelector(".tb-ws")?.textContent,
    doc: document.querySelector(".ab-doc-name")?.textContent,
    stubs: app.commands.all().filter((d) => d.stub).length,
    hasToggle: app.commands.has("ToggleDataPanel") && app.commands.has("ResetLayout"),
  }));
  console.log(JSON.stringify(s));
  // Fusion 2706, new Part Design (reference screenshots): 8 persistent tabs; SOLID panels in this order
  check(s.tabs.join(",") === "SOLID,SURFACE,MESH,SHEET METAL,PLASTIC,MANAGE,UTILITIES,AUTOMATION", "tabs in Fusion order");
  check(s.panels.join(",") === "CREATE,MODIFY,CONFIGURE,CONSTRUCT,INSPECT,INSERT,ASSEMBLE,SELECT", "SOLID panels");
  check(s.buttons >= 15, "toolbar has command buttons");
  check(/DESIGN/.test(s.ws || ""), "workspace switcher");
  check(s.doc === "Untitled", "document tab shows doc name");
  check(s.stubs > 200 && s.hasToggle, "stub + shell commands registered");
  await h.shot("01-solid");

  // ---- stub click -> toast
  await page.click('#toolbar .tb-btn[data-cmd="AutomatedModelingCommand"]', { timeout: 3000 }).catch(() => {});
  const toast = await page.evaluate(() => [...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|"));
  check(/isn't available/.test(toast), "stub button toasts");

  // ---- SELECT looks pressed only while no other command runs (Fusion: SelectCommand is the default "checked" command)
  const selState = () => page.evaluate(() => document.querySelector('#toolbar .tb-btn[data-cmd="SelectCommand"]').classList.contains("tb-checked"));
  const selIdle = await selState();
  await page.evaluate(() => { app.activeCommand = { id: "Extrude", ok() {}, cancel() { app.activeCommand = null; } }; app.emit("dialog", { open: true, id: "Extrude" }); });
  await h.frames(2);
  const selBusy = await selState();
  const extBusy = await page.evaluate(() => document.querySelector('#toolbar .tb-btn[data-cmd="Extrude"]').classList.contains("tb-checked"));
  await page.evaluate(() => { app.activeCommand = null; app.emit("dialog", { open: false, id: "Extrude" }); });
  await h.frames(2);
  check(selIdle && !selBusy && extBusy && (await selState()), "SELECT pressed when idle, released (and the running command pressed) while a command is active");

  // ---- CREATE dropdown with Pattern flyout
  await page.click('#toolbar [data-panel="SolidCreatePanel"]');
  await sleep(120);
  const items = await page.evaluate(() => [...document.querySelectorAll(".sh-menu .sh-mi")].map((e) => e.querySelector(".sh-mi-label")?.textContent));
  check(items.includes("Extrude") && items.includes("Pattern") && items.includes("Box"), "CREATE dropdown items");
  await page.hover('.sh-menu .sh-mi[data-menu-item="Pattern"]');
  await sleep(400);
  const fly = await page.evaluate(() => document.querySelectorAll(".sh-menu").length);
  check(fly === 2, "Pattern flyout opens");
  await page.hover('.sh-menu[data-level="1"] .sh-mi[data-cmd="PatternCircular"]');
  await sleep(1000);
  await h.shot("02-create-dropdown");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await sleep(100);
  check(await page.evaluate(() => !app.ui.menu.isOpen()), "Esc closes menus");

  // ---- pin a dropdown command to the toolbar via the item's "more" button, then reset
  await page.click('#toolbar [data-panel="SolidCreatePanel"]');
  await sleep(100);
  await page.hover('.sh-menu .sh-mi[data-cmd="Sweep"]');
  await page.click('.sh-menu .sh-mi[data-cmd="Sweep"] .sh-mi-more');
  await sleep(150);
  await page.click('.sh-menu[data-level="1"] .sh-mi[data-menu-item="pin"]');
  await sleep(150);
  check(await page.evaluate(() => !!document.querySelector('#toolbar .tb-btn[data-cmd="Sweep"]')), "Pin to Toolbar adds a button");
  await page.click('#toolbar .tb-btn[data-cmd="Sweep"]', { button: "right" });
  await page.click('.sh-menu .sh-mi[data-menu-item="reset-all"]');
  await sleep(150);
  check(await page.evaluate(() => !document.querySelector('#toolbar .tb-btn[data-cmd="Sweep"]')), "Reset Entire Toolbar removes it");

  // ---- workspace switcher
  await page.click("#toolbar .tb-ws");
  await sleep(100);
  const wsItems = await page.evaluate(() => [...document.querySelectorAll(".sh-menu .sh-mi-label")].map((e) => e.textContent).join(","));
  check(wsItems === "Design,Generative Design,Render,Animation,Simulation,Manufacture,Drawing", "workspace menu");
  await page.click('.sh-menu .sh-mi[data-menu-item="FusionRenderEnvironment"]');
  await sleep(100);
  check(await page.evaluate(() => [...document.querySelectorAll(".toast")].some((t) => /Render workspace/.test(t.textContent))), "other workspaces toast");

  // ---- tooltip on a toolbar button (small then expanded)
  await page.hover('#toolbar .tb-btn[data-cmd="Extrude"]');
  await sleep(700);
  const tip1 = await page.evaluate(() => { const t = document.querySelector(".sh-tip"); return t && t.style.display !== "none" ? t.textContent : ""; });
  check(/Extrude/.test(tip1) && /E/.test(tip1), "small tooltip with shortcut");
  await sleep(1300);
  const tip2 = await page.evaluate(() => document.querySelector(".sh-tip")?.textContent || "");
  check(/depth/.test(tip2), "tooltip expands with description");
  await h.shot("03-tooltip");
  await page.mouse.move(800, 600);

  // ---- tab switching
  await page.click('#toolbar [data-tab="SurfaceTab"]');
  const sp = await page.evaluate(() => [...document.querySelectorAll("#toolbar [data-panel]")].map((e) => e.textContent.trim()).join(","));
  check(sp.startsWith("CREATE,MODIFY"), "SURFACE tab panels");
  await page.click('#toolbar [data-tab="ParaMeshOuterTab"]');
  const mp = await page.evaluate(() => [...document.querySelectorAll("#toolbar [data-panel]")].map((e) => e.textContent.trim()).join(","));
  check(mp.includes("PREPARE") && mp.includes("EXPORT"), "MESH tab panels");
  await h.shot("04-mesh");
  await page.click('#toolbar [data-tab="SolidTab"]');

  // ---- contextual SKETCH tab
  await page.evaluate(() => app.setMode("sketch", "f1"));
  await h.frames(2);
  const sk = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll("#toolbar [data-tab]")].map((e) => e.textContent).join(","),
    active: app.ui.toolbar.activeTab,
    panels: [...document.querySelectorAll("#toolbar [data-panel]")].map((e) => e.textContent.trim()).join(","),
    finish: !!document.querySelector('#toolbar .tb-btn[data-cmd="SketchStop"]'),
  }));
  console.log(JSON.stringify(sk));
  check(sk.tabs.endsWith("SKETCH") && sk.active === "SketchTab", "SKETCH tab appears and is selected");
  check(sk.panels === "CREATE,MODIFY,CONSTRAINTS,CONFIGURE,INSPECT,INSERT,ASSEMBLE,SELECT,FINISH SKETCH" && sk.finish, "SKETCH panels incl. FINISH SKETCH");
  await h.shot("05-sketch");
  await page.click('#toolbar [data-tab="SolidTab"]');
  const fin = await page.evaluate(() => !!document.querySelector('#toolbar .tb-btn[data-cmd="SketchStop"]'));
  check(fin, "Finish Sketch stays available on SOLID tab while sketching");
  await page.click('#toolbar [data-panel="SketchCreatePanel"]').catch(() => {});
  await page.click('#toolbar [data-tab="SketchTab"]');
  await page.click('#toolbar [data-panel="SketchCreatePanel"]');
  await sleep(100);
  await page.hover('.sh-menu .sh-mi[data-menu-item="Rectangle"]');
  await sleep(400);
  await h.shot("06-sketch-create-dropdown");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.evaluate(() => app.setMode("model"));
  await h.frames(2);
  const back = await page.evaluate(() => ({ t: app.ui.toolbar.activeTab, tabs: document.querySelectorAll("#toolbar [data-tab]").length }));
  check(back.t === "SolidTab" && back.tabs === 8, "leaving sketch restores the last tab");

  // ---- File menu with View flyout
  await page.click('#appbar [data-menu="file"]');
  await sleep(100);
  const fileItems = await page.evaluate(() => [...document.querySelectorAll(".sh-menu .sh-mi-label")].map((e) => e.textContent));
  check(["New...", "Add To Assembly", "Open...", "Open Recovered Documents (0)", "Upload...", "Save", "Save As", "Save As Latest", "Export...", "Create Version", "3D Print", "Capture Image...", "Share File Link", "View Details on Web", "View"].join("|") === fileItems.join("|"), "File menu items (Fusion 2706 order)");
  await page.hover('.sh-menu .sh-mi[data-menu-item="View"]');
  await sleep(400);
  await h.shot("07-file-menu");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");

  // ---- Help menu
  await page.click('#appbar [data-menu="help"]');
  await sleep(100);
  const helpText = await page.evaluate(() => document.querySelector(".sh-menu")?.textContent || "");
  check(/not affiliated/.test(helpText) && /Keyboard Shortcuts/.test(helpText) && /About/.test(helpText), "Help menu");
  await h.shot("08-help-menu");
  await page.keyboard.press("Escape");

  // ---- undo/redo state
  const ur0 = await page.evaluate(() => document.querySelector('#appbar [data-cmd="Undo"]').classList.contains("ab-disabled"));
  await page.evaluate(() => app.addFeature({ type: "box", length: "40 mm", width: "20 mm", height: "10 mm", operation: "new", plane: { kind: "origin", name: "XY" } }));
  await h.frames(2);
  const ur1 = await page.evaluate(() => ({ u: document.querySelector('#appbar [data-cmd="Undo"]').classList.contains("ab-disabled"), dirty: document.querySelector(".ab-doctab").classList.contains("ab-dirty") }));
  check(ur0 && !ur1.u && ur1.dirty, "undo enables + unsaved marker after a change");

  // ---- data panel
  await page.keyboard.press("Control+Alt+KeyP");
  await sleep(350);
  check(await page.evaluate(() => app.ui.shell.dataPanelOpen && document.querySelector(".dp-root.dp-open") !== null), "Ctrl+Alt+P opens the Data Panel");
  await h.shot("09-data-panel");
  await page.click('.dp-root [data-action="close-data-panel"]');
  await sleep(300);
  check(await page.evaluate(() => !app.ui.shell.dataPanelOpen), "Data Panel closes");

  // ---- comments + hide/reset layout
  await page.click(".cm-add");
  await page.fill(".cm-input", "Check the wall thickness");
  await page.click(".cm-post");
  check(await page.evaluate(() => /wall thickness/.test(document.querySelector(".cm-list").textContent)), "comment posted");
  await h.shot("10-comments");
  await page.evaluate(() => { app.commands.run("ToggleComments"); app.commands.run("ToggleToolbar"); });
  await h.frames(2);
  check(await page.evaluate(() => getComputedStyle(app.dom.toolbar).display === "none" && getComputedStyle(app.dom.commentsHost).display === "none"), "toolbar and comments hide");
  await page.keyboard.press("Control+Alt+KeyR");
  await h.frames(2);
  check(await page.evaluate(() => getComputedStyle(app.dom.toolbar).display !== "none" && getComputedStyle(app.dom.commentsHost).display !== "none"), "Ctrl+Alt+R resets the layout");

  // ---- narrow window: panels compress instead of overflowing
  await page.setViewportSize({ width: 1000, height: 700 });
  await sleep(300);
  const narrow = await page.evaluate(() => ({ demoted: document.querySelectorAll(".tb-demoted").length, labels: document.querySelectorAll("#toolbar [data-panel]").length }));
  check(narrow.demoted > 0 && narrow.labels === 8, "narrow window demotes buttons, keeps every panel");
  await h.shot("11-narrow");
  // very narrow + sketching: panels fold into MORE, FINISH SKETCH always stays visible
  await page.evaluate(() => app.setMode("sketch", "f1"));
  await page.setViewportSize({ width: 640, height: 600 });
  await sleep(350);
  const tiny = await page.evaluate(() => ({
    finish: !!document.querySelector('#toolbar .tb-btn[data-cmd="SketchStop"]'),
    more: !!document.querySelector('#toolbar [data-panel="ToolbarOverflow"]'),
    fits: (() => { const r = document.querySelector("#toolbar .tb-panels"); return r.scrollWidth <= r.clientWidth + 1; })(),
  }));
  check(tiny.finish && tiny.more && tiny.fits, "tiny window: MORE overflow panel, Finish Sketch kept");
  await page.click('#toolbar [data-panel="ToolbarOverflow"]');
  await sleep(150);
  check(await page.evaluate(() => document.querySelectorAll(".sh-menu .sh-mi-sub").length > 0), "MORE lists the folded panels");
  await h.shot("11b-tiny-more");
  await page.keyboard.press("Escape");
  await page.evaluate(() => app.setMode("model"));
  await page.setViewportSize({ width: 1600, height: 900 });
  await sleep(300);
  check(await page.evaluate(() => !document.querySelector('#toolbar [data-panel="ToolbarOverflow"]') && document.querySelectorAll("#toolbar [data-panel]").length === 8), "wide again: all panels back");

  // ---- close dirty document via the tab x -> modal
  await page.click('#appbar .ab-doc-close');
  await sleep(150);
  // shell's own dialog, or the File module's "Save Changes" dialog when menus is loaded
  const hasModal = await page.evaluate(() => !!document.querySelector('[data-action="discard"]'));
  check(hasModal, "closing an unsaved design asks first");
  await h.shot("12-close-modal");
  await page.click('[data-action="discard"]');
  await h.frames(2);
  check(await page.evaluate(() => app.doc.features.length === 0 && !app.dirty), "Don't Save starts a fresh design");

  if (h.errors.length) { console.log("page errors:\n" + h.errors.join("\n")); fails.push("page errors"); }
} catch (e) {
  console.error(e);
  fails.push(String(e.message || e));
  await h.shot("zz-failure").catch(() => {});
} finally {
  await h.close();
}
console.log(fails.length ? `FAIL (${fails.length})` : "PASS");
process.exitCode = fails.length ? 1 : 0;
