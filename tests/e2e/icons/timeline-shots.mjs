// Timeline / browser / sketch-dropdown icons in context (hi-DPI crops).
import { chromium } from "playwright-core";
import { build } from "../../../scripts/build.mjs";
import { serve } from "../../../scripts/serve.mjs";
import { browserOptions } from "../../../scripts/browser.mjs";
await build({ out: "build/icons", only: "viewport,sketch,dialogs,inspect,shell,browser,timeline,menus" });
const server = await serve({ dir: "build/icons", port: 5313 });
const browser = await chromium.launch(browserOptions({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }));
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
try {
  await page.goto("http://127.0.0.1:5313/");
  await page.waitForFunction(() => window.app && window.app.isReady, null, { timeout: 90000 });
  const out = await page.evaluate(() => {
    const app = window.app; const res = [];
    const pl = { kind: "origin", name: "XY" };
    const tries = [
      { type: "box", plane: pl, center: [0, 0], length: "20 mm", width: "20 mm", height: "10 mm", operation: "new" },
      { type: "cylinder", plane: pl, center: [30, 0], diameter: "10 mm", height: "20 mm", operation: "new" },
      { type: "sphere", plane: pl, center: [0, 30], diameter: "10 mm", operation: "new" },
      { type: "torus", plane: pl, center: [30, 30], d1: "20 mm", d2: "4 mm", operation: "new" },
      { type: "cplane", mode: "offset", base: pl, offset: "15 mm" },
      { type: "cplane", mode: "angle", base: pl, axis: { kind: "origin", name: "X" }, angle: "30 deg" },
    ];
    for (const f of tries) { try { app.addFeature(f); res.push(f.type + " ok"); } catch (e) { res.push(f.type + " ERR " + e.message); } }
    try { app.recompute(); } catch (e) { res.push("recompute " + e.message); }
    return res;
  });
  console.log(out.join(", "));
  await page.waitForTimeout(800);
  await page.screenshot({ path: "tests/e2e/out/icons/zoom-timeline.png", clip: { x: 0, y: 856, width: 520, height: 44 } });
  // expand browser bodies / construction
  for (const sel of ['[data-node="bodies:root"] .br-twisty', '[data-node="construction:root"] .br-twisty', '[data-node="origin:root"] .br-twisty']) { const e = await page.$(sel); if (e) { await e.click(); await page.waitForTimeout(150); } }
  await page.screenshot({ path: "tests/e2e/out/icons/zoom-browser.png", clip: { x: 0, y: 136, width: 300, height: 360 } });
  await page.screenshot({ path: "tests/e2e/out/icons/app-with-features.png" });
  console.log("errors:", errs.slice(0, 8));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
