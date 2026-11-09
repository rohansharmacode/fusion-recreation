// Release verification in headless Edge (playwright-core, channel "msedge").
//
//   node scripts/verify-release.mjs                # build release/ then verify it
//   node scripts/verify-release.mjs --no-build     # verify the existing release/
//   node scripts/verify-release.mjs --dir=build/x --port=5339 --shots=tests/e2e/out/packaging
//
// Checks: file set + sizes (<= 20 MiB each), boot with zero console errors + timings, modelling
// round trip, kernel failure isolation, global error safety net, splash progress (throttled
// network), download-failure error card + Retry, WebAssembly-disabled message, phone-size note, and a
// simulated sandboxed artifact host (iframe sandbox="allow-scripts", strict CSP without
// 'unsafe-eval', opaque origin so localStorage throws). Writes <shots>/verify.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build, sizeReport, RELEASE_FILES } from "./build.mjs";
import { serve } from "./serve.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const dir = args.dir || "release";
const port = Number(args.port || 5339);
const shots = path.resolve(root, args.shots || "tests/e2e/out/packaging");
const W = Number(args.width || 1389), H = Number(args.height || 795);
fs.mkdirSync(shots, { recursive: true });

const results = [];
let failed = 0;
function check(label, ok, detail = "") {
  results.push({ label, ok: !!ok, detail: String(detail).slice(0, 400) });
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail && !ok ? `  -- ${String(detail).slice(0, 300)}` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!args["no-build"]) await build({ release: true, out: dir });
const absDir = path.resolve(root, dir);
console.log(`\nverifying ${path.relative(root, absDir)}`);

// ---------- 1. files ----------
const present = fs.readdirSync(absDir).sort();
check(`release dir holds exactly ${RELEASE_FILES.join(", ")}`, RELEASE_FILES.every((f) => present.includes(f)) && present.length === RELEASE_FILES.length, present.join(", "));
const sizes = sizeReport(absDir, { print: true });
check("every file <= 20 MiB (artifact per-file limit)", sizes.oversize.length === 0, sizes.oversize.join(", "));
const appJs = fs.readFileSync(path.join(absDir, "app.js"), "utf8");
const avgLine = Math.round(appJs.length / appJs.split("\n").length); // template literals (shaders, glue) keep some newlines
check("app.js is minified, no sourcemap", !/sourceMappingURL/.test(appJs) && avgLine > 200, `avg line ${avgLine} chars`);
check("no external URLs fetched by app.js", !/fetch\(\s*["'`]https?:/.test(appJs));
const gzHead = fs.readFileSync(path.join(absDir, "occt.gz.wasm")).subarray(0, 2);
check("occt.gz.wasm is gzip data", gzHead[0] === 0x1f && gzHead[1] === 0x8b);

// ---------- browser helpers ----------
const server = await serve({ dir, port });
const artifactPort = Number(args["artifact-port"] || port + 99); // 5438 by default (QA uses port+100)
const artifactServer = await serve({ dir, port: artifactPort, artifact: true });
const browser = await chromium.launch({ channel: "msedge", headless: !args.headed, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const url = `http://127.0.0.1:${port}/`;

async function newPage(o = {}) {
  const ctx = await browser.newContext({ viewport: { width: o.width || W, height: o.height || H }, isMobile: !!o.isMobile, hasTouch: !!o.hasTouch, deviceScaleFactor: o.dsf || 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  const infos = [];
  page.on("console", (m) => { if (m.type() === "info") infos.push(m.text()); });
  return { ctx, page, errors, infos };
}
const waitReadyOrError = (page, timeout = 120000) => page.waitForFunction(() => (window.app && window.app.isReady) || document.querySelector("#splash.error"), null, { timeout, polling: 100 });

try {
  // ---------- 2. boot + timings + zero errors ----------
  {
    const { ctx, page, errors, infos } = await newPage();
    const t0 = Date.now();
    await page.goto(url);
    await waitReadyOrError(page);
    const wall = Date.now() - t0;
    const st = await page.evaluate(() => ({ ready: !!(window.app && window.app.isReady), boot: window.__boot, splash: !!document.querySelector("#splash:not(.done)"), embindFallback: window.__fusionEmbindFallback || 0, wasmReqs: performance.getEntriesByType("resource").filter((r) => /occt/.test(r.name)).map((r) => ({ name: r.name.split("/").pop(), size: r.transferSize, dur: Math.round(r.duration) })) }));
    check("release boots (app.isReady)", st.ready, JSON.stringify(st));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(shots, "verify-01-ready.png") });
    check("splash removed after ready", !(await page.evaluate(() => !!document.getElementById("splash"))));
    check("kernel fetched once (preload reused by main.js)", st.wasmReqs.length === 1, JSON.stringify(st.wasmReqs));
    check("normal hosts keep the original (eval-built) kernel bindings", st.embindFallback === 0, st.embindFallback);
    console.log(`  boot: ${JSON.stringify(st.boot.marks)}  wall ${wall} ms`);
    console.log(`  ${infos.find((x) => /\[boot\]/.test(x)) || ""}`);
    results.push({ label: "timings", ok: true, detail: JSON.stringify({ ...st.boot.marks, wallMs: wall }) });

    // modelling round trip
    const model = await page.evaluate(async () => {
      const app = window.app;
      const box = app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "30 mm", width: "30 mm", height: "20 mm", operation: "new" });
      const body = app.bodies()[0];
      const fl = app.addFeature({ type: "fillet", edges: [{ body: body.id, p: [15, 15, 10] }], radius: "2 mm", tangentChain: true });
      const ok = app.featureResult(fl.id);
      return { bodies: app.bodies().length, box: app.featureResult(box.id).ok, fillet: ok && ok.ok };
    });
    check("box + fillet evaluate in the release build", model.bodies === 1 && model.box && model.fillet, JSON.stringify(model));

    // kernel failure in one feature is isolated
    const iso = await page.evaluate(async () => {
      const app = window.app;
      const body = app.bodies()[0];
      const t0 = performance.now();
      const bad = app.addFeature({ type: "fillet", edges: [{ body: body.id, p: [-15, -15, 10] }], radius: "500 mm", tangentChain: true });
      const r = app.featureResult(bad.id);
      const ms = performance.now() - t0;
      const stillBodies = app.bodies().length;
      app.history.undo();
      const afterUndo = app.doc.features.length;
      const again = app.addFeature({ type: "chamfer", edges: [{ body: body.id, p: [-15, -15, 10] }], distance: "1 mm", tangentChain: true });
      return { badOk: r && r.ok, err: r && r.error, ms: Math.round(ms), stillBodies, afterUndo, chamferOk: app.featureResult(again.id).ok };
    });
    check("a failing kernel op (fillet r=500) is reported on that feature only", iso.badOk === false && iso.stillBodies === 1, JSON.stringify(iso));
    check("app keeps working after the kernel failure (undo + new chamfer)", iso.afterUndo === 2 && iso.chamferOk === true, JSON.stringify(iso));

    // global safety net
    const e0 = errors.length;
    const net = await page.evaluate(async () => {
      const app = window.app;
      const toasts = () => [...document.querySelectorAll(".toast-error")].map((t) => t.textContent);
      const off = app.input.push({ name: "Broken tool", onPointerMove() { throw new Error("boom from a tool"); } });
      const r = app.viewport.canvas.getBoundingClientRect();
      for (let i = 0; i < 30; i++) app.viewport.canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + 200 + i, clientY: r.top + 200, bubbles: true, pointerId: 1, pointerType: "mouse" }));
      off();
      await new Promise((res) => setTimeout(res, 50));
      const afterTool = toasts().filter((t) => /boom from a tool/.test(t)).length;
      setTimeout(() => { throw new Error("boom from a timer"); }, 0);
      Promise.reject(new Error("boom from a promise"));
      await new Promise((res) => setTimeout(res, 120));
      return { afterTool, all: toasts(), inputTop: app.input.top() && app.input.top().name };
    });
    check("an exception in a tool becomes ONE toast (rate-limited), not a dead canvas", net.afterTool === 1, JSON.stringify(net));
    check("uncaught errors + rejections become toasts", net.all.some((t) => /timer/.test(t)) && net.all.some((t) => /promise/.test(t)), JSON.stringify(net.all));
    const injected = errors.slice(e0).filter((e) => /boom from/.test(e)).length;
    check("injected errors are still logged to the console (tests/devtools see them)", injected >= 3, errors.slice(e0).join(" | "));
    const real = errors.filter((e) => !/boom from/.test(e));
    check("zero unexpected console errors during boot + modelling", real.length === 0, real.join(" | "));
    const vol = await page.evaluate(() => { window.app.commands.run("FusionComputeAllCommand"); return window.app.bodies().length; });
    check("UI still responsive after the injected errors", vol === 1);
    await page.screenshot({ path: path.join(shots, "verify-02-safety-net.png") });
    await ctx.close();
  }

  // ---------- 3. splash with real download progress (throttled network) ----------
  {
    const { ctx, page, errors } = await newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 2.5e6, uploadThroughput: 1e6 });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "commit" });
    let progress = [];
    for (let i = 0; i < 40; i++) {
      const s = await page.evaluate(() => { const m = document.querySelector("#splash .splash-msg"); const p = document.querySelector("#splash .ld-pct"); return m ? `${m.textContent}|${p ? p.textContent : ""}` : null; }).catch(() => null);
      if (s) progress.push(s);
      if (s && /Downloading geometry kernel… [1-9]/.test(s) && progress.filter((x) => /Downloading/.test(x)).length > 3) break;
      await sleep(150);
    }
    await page.screenshot({ path: path.join(shots, "verify-03-splash-progress.png") });
    const uniq = [...new Set(progress)];
    check("splash shows real kernel download progress (MB + %)", uniq.some((x) => /Downloading geometry kernel… \d+\.\d of \d+\.\d MB\|\d+%/.test(x)) && uniq.length >= 3, uniq.slice(0, 8).join(" ; "));
    await waitReadyOrError(page);
    const marks = await page.evaluate(() => window.__boot && window.__boot.marks);
    const ready20 = await page.evaluate(() => !!(window.app && window.app.isReady));
    check("boot completes on a 20 Mbit/s, 40 ms link", ready20, `${Date.now() - t0} ms`);
    console.log(`  20 Mbit/s boot: ${JSON.stringify(marks)}`);
    results.push({ label: "timings at 20 Mbit/s (2.5 MB/s, 40 ms latency)", ok: true, detail: JSON.stringify(marks) });
    check("no console errors in throttled boot", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---------- 4. download failure -> friendly error -> Retry ----------
  {
    const { ctx, page, errors } = await newPage();
    await page.route(/occt\.(gz\.wasm|wasm\.gz)/, (r) => r.abort("failed"));
    await page.goto(url);
    await waitReadyOrError(page, 30000);
    const err = await page.evaluate(() => ({ error: !!document.querySelector("#splash.error"), title: document.querySelector(".ld-err-title")?.textContent, text: document.querySelector(".ld-err-text")?.textContent, retry: !!document.querySelector(".ld-retry:not([disabled])") }));
    await page.screenshot({ path: path.join(shots, "verify-04-error-network.png") });
    check("network failure shows a friendly error card with Retry", err.error && /download/i.test(err.title) && err.retry, JSON.stringify(err));
    await page.unroute(/occt\.(gz\.wasm|wasm\.gz)/);
    await page.click(".ld-retry");
    await waitReadyOrError(page, 60000);
    const ok = await page.evaluate(() => !!(window.app && window.app.isReady) && !document.querySelector("#splash.error"));
    check("Retry boots the app without reloading the page", ok);
    const unexpected = errors.filter((e) => !/ERR_FAILED|Failed to load resource|\[kernel\]|Failed to fetch|Network error|preload/i.test(e));
    check("only the expected download errors were logged", unexpected.length === 0, unexpected.join(" | "));
    await ctx.close();
  }

  // ---------- 5. missing file / corrupt file ----------
  {
    const { ctx, page } = await newPage();
    await page.route(/occt\.(gz\.wasm|wasm\.gz)/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Not found</title>" }));
    await page.goto(url);
    await waitReadyOrError(page, 30000);
    const t = await page.evaluate(() => document.querySelector(".ld-err-title")?.textContent);
    check("an HTML error page instead of the wasm gives the 'damaged' message", /damaged/i.test(t || ""), t);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage();
    await page.route(/occt\.(gz\.wasm|wasm\.gz)/, (r) => r.fulfill({ status: 404, contentType: "text/plain", body: "not found" }));
    await page.goto(url);
    await waitReadyOrError(page, 30000);
    const t = await page.evaluate(() => document.querySelector(".ld-err-title")?.textContent);
    check("a missing occt.gz.wasm says the file is missing", /missing/i.test(t || ""), t);
    await ctx.close();
  }

  // ---------- 6. WebAssembly disabled ----------
  {
    const { ctx, page } = await newPage();
    await page.addInitScript(() => { try { delete window.WebAssembly; } catch { /* ignore */ } });
    await page.goto(url);
    await waitReadyOrError(page, 30000);
    const err = await page.evaluate(() => ({ title: document.querySelector(".ld-err-title")?.textContent, text: document.querySelector(".ld-err-text")?.textContent }));
    await page.screenshot({ path: path.join(shots, "verify-05-error-nowasm.png") });
    check("WebAssembly disabled -> clear message", /WebAssembly is not available/.test(err.title || ""), JSON.stringify(err));
    await ctx.close();
  }

  // ---------- 7. phone-size / touch ----------
  {
    const { ctx, page, errors } = await newPage({ width: 390, height: 844, isMobile: true, hasTouch: true, dsf: 2 });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 20, downloadThroughput: 4e6, uploadThroughput: 1e6 });
    await page.goto(url, { waitUntil: "commit" });
    await page.waitForSelector("#splash .ld-note", { state: "visible", timeout: 20000 }).catch(() => {});
    const noteVisible = await page.evaluate(() => { const n = document.querySelector("#splash .ld-note"); return !!n && getComputedStyle(n).display !== "none"; });
    await page.screenshot({ path: path.join(shots, "verify-06-phone-splash.png") });
    check("phone-size screen shows the 'best on desktop' note on the splash", noteVisible);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await waitReadyOrError(page);
    const toast = await page.evaluate(() => [...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" | "));
    check("phone-size screen gets a 'best on desktop' toast after loading", /desktop/i.test(toast), toast);
    check("no console errors on phone-size boot", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---------- 8. simulated sandboxed artifact host ----------
  {
    const { ctx, page, errors } = await newPage();
    await page.goto(`http://127.0.0.1:${artifactPort}/__sandbox.html`);
    const frame = await (async () => {
      for (let i = 0; i < 100; i++) {
        const f = page.frames().find((x) => /index\.html$/.test(x.url()));
        if (f) return f;
        await sleep(100);
      }
      return null;
    })();
    check("artifact simulation: app loads inside the sandboxed iframe", !!frame);
    if (frame) {
      await frame.waitForFunction(() => (window.app && window.app.isReady) || document.querySelector("#splash.error"), null, { timeout: 120000, polling: 200 });
      const env = await frame.evaluate(async () => {
        const out = { ready: !!(window.app && window.app.isReady), splashError: document.querySelector(".splash-msg")?.textContent };
        out.embindFallback = window.__fusionEmbindFallback || 0; // > 0 only when the page CSP blocked new Function
        try { window.localStorage.getItem("x"); out.localStorage = "ok"; } catch { out.localStorage = "throws"; }
        out.origin = String(window.origin);
        if (out.ready) {
          const app = window.app;
          app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "20 mm", width: "20 mm", height: "20 mm", operation: "new" });
          out.bodies = app.bodies().length;
          out.download = await app.download("test.txt", "hello", "text/plain").catch((e) => `threw ${e.message}`);
        }
        return out;
      });
      await page.screenshot({ path: path.join(shots, "verify-07-artifact-sandbox.png") });
      check("artifact simulation: CSP blocks eval and the CSP-safe kernel bindings take over", env.embindFallback > 0, JSON.stringify(env));
      check("artifact simulation: opaque origin (localStorage throws)", env.localStorage === "throws" && env.origin === "null", JSON.stringify(env));
      check("artifact simulation: kernel starts without 'unsafe-eval' and models a box", env.ready && env.bodies === 1, JSON.stringify(env));
      const unexpected = errors.filter((e) => !/Download is disallowed|sandbox|download/i.test(e));
      check("artifact simulation: no console errors", unexpected.length === 0, unexpected.join(" | "));
    }
    await ctx.close();
  }
} catch (e) {
  check("verification ran to completion", false, e.stack || e);
} finally {
  await browser.close().catch(() => {});
  await new Promise((r) => server.close(r));
  await new Promise((r) => artifactServer.close(r));
}

fs.writeFileSync(path.join(shots, "verify.json"), JSON.stringify({ when: new Date().toISOString(), dir, sizes: sizes.files, results }, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed -> ${path.relative(root, path.join(shots, "verify.json"))}`);
process.exitCode = failed ? 1 : 0;
