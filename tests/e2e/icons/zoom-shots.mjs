// Hi-DPI crops of the toolbar / menus to inspect icon rendering in context.
import { chromium } from "playwright-core";
import { build } from "../../../scripts/build.mjs";
import { serve } from "../../../scripts/serve.mjs";
import { browserOptions } from "../../../scripts/browser.mjs";
const only = "viewport,sketch,dialogs,inspect,shell,browser,timeline,menus";
await build({ out: "build/icons", only });
const server = await serve({ dir: "build/icons", port: 5313 });
const browser = await chromium.launch(browserOptions({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }));
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
try {
  await page.goto("http://127.0.0.1:5313/");
  await page.waitForFunction(() => window.app && window.app.isReady, null, { timeout: 90000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "tests/e2e/out/icons/zoom-toolbar-left.png", clip: { x: 0, y: 36, width: 820, height: 100 } });
  await page.screenshot({ path: "tests/e2e/out/icons/zoom-toolbar-right.png", clip: { x: 800, y: 36, width: 800, height: 100 } });
  for (const panel of ["SolidCreatePanel", "SolidModifyPanel", "ConstructionPanel", "InspectPanel"]) {
    const el = await page.$(`[data-panel="${panel}"]`);
    if (!el) continue;
    await el.click();
    await page.waitForTimeout(250);
    const box = await page.evaluate(() => { const m = [...document.querySelectorAll("#overlay *")].find((e) => e.offsetHeight > 200 && getComputedStyle(e).position !== "static"); if (!m) return null; const r = m.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 860 - r.y) }; });
    if (box) await page.screenshot({ path: `tests/e2e/out/icons/zoom-menu-${panel}.png`, clip: box });
    await page.keyboard.press("Escape");
    await page.mouse.click(800, 600);
    await page.waitForTimeout(150);
  }
  // sketch tab
  await page.evaluate(() => { const a = window.app; const id = a.doc.features?.length; a.commands.run("SketchCreate"); return id; });
  await page.waitForTimeout(500);
  await page.mouse.move(800, 450);
  await page.evaluate(() => {
    const a = window.app;
    try { a.selection.set([{ kind: "originPlane", name: "XY" }]); } catch {}
  });
  await page.waitForTimeout(400);
  await page.mouse.click(800, 500);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "tests/e2e/out/icons/zoom-sketch-toolbar.png", clip: { x: 0, y: 36, width: 1600, height: 100 } });
  await page.screenshot({ path: "tests/e2e/out/icons/zoom-browser-timeline.png", clip: { x: 0, y: 136, width: 300, height: 200 } });
  console.log("mode:", await page.evaluate(() => window.app.mode), "errors:", errs.slice(0, 8));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
