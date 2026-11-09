// Shared headless-browser harness (playwright-core driving the installed Microsoft Edge;
// playwright-core Chromium off Windows or with QA_BROWSER=chromium, see scripts/browser.mjs).
//
//   import { launch } from "./harness.mjs";
//   const h = await launch({ only: "viewport,sketch", outDir: "build/e2e-me", port: 5301, shots: "tests/e2e/out/me" });
//   await h.page.evaluate(() => app.commands.run("SketchCreate"));
//   await h.shot("after-sketch");          // -> tests/e2e/out/me/after-sketch.png
//   console.log(h.errors);                 // console errors + page errors collected so far
//   await h.close();
//
// Options: only (comma list of modules, default all), outDir (build output, default build/e2e),
// port (default 5300), shots (screenshot dir), width/height (default 1600x900), build (default true),
// headless (default true), release (true: minified release build; outDir defaults to "release" —
// with build:false it just serves an existing release/ dir, e.g. launch({ release: true, build: false })).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build } from "../../scripts/build.mjs";
import { serve } from "../../scripts/serve.mjs";
import { browserOptions } from "../../scripts/browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function launch(opts = {}) {
  const outDir = opts.outDir || (opts.release ? "release" : "build/e2e");
  const port = opts.port || 5300;
  const shotsDir = path.resolve(root, opts.shots || "tests/e2e/out");
  if (opts.build !== false) await build({ out: outDir, only: opts.only, release: !!opts.release });
  const server = await serve({ dir: outDir, port });
  const browser = await chromium.launch(browserOptions({ headless: opts.headless !== false, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] }));
  const page = await browser.newPage({ viewport: { width: opts.width || 1600, height: opts.height || 900 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}\n${e.stack || ""}`));
  page.on("console", (m) => { if (opts.verbose) console.log(`[page ${m.type()}] ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${port}/`);
  try {
    await page.waitForFunction(() => (window.app && window.app.isReady) || document.querySelector("#splash.error"), null, { timeout: opts.timeout || 90000 });
  } catch (e) {
    const splash = await page.evaluate(() => document.querySelector(".splash-msg")?.textContent).catch(() => "?");
    await browser.close().catch(() => {});
    await new Promise((r) => server.close(r));
    throw new Error(`App did not become ready (splash: ${splash})\n${errors.join("\n")}`);
  }
  if (await page.evaluate(() => !!document.querySelector("#splash.error"))) {
    const splash = await page.evaluate(() => document.querySelector(".splash-msg")?.textContent);
    await browser.close().catch(() => {});
    await new Promise((r) => server.close(r));
    throw new Error(`App failed to boot: ${splash}\n${errors.join("\n")}`);
  }
  fs.mkdirSync(shotsDir, { recursive: true });
  const h = {
    page,
    browser,
    errors,
    url: `http://127.0.0.1:${port}/`,
    async shot(name, o = {}) {
      const file = path.join(shotsDir, `${name}.png`);
      await page.screenshot({ path: file, ...o });
      return file;
    },
    /** Wait for the next animation frames so the canvas has redrawn. */
    async frames(n = 3) { await page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n); },
    async close() { await browser.close().catch(() => {}); await new Promise((r) => server.close(r)); },
  };
  return h;
}
