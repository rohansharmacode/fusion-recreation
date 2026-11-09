// QA scenario toolkit: drives the REAL UI (DOM clicks through the data hooks, page.mouse on the canvas,
// page.keyboard) and asserts on app state (window.app). Owned by the qa module.
//
//   import { defineScenario } from "../lib.mjs";
//   export default defineScenario({ name: "toolbar", title: "...", async run(t) { ... } });
//
// A scenario file can be run on its own:  node tests/e2e/scenarios/toolbar.mjs [--no-build] [--headed]
// or through the runner:                  node tests/e2e/run-all.mjs [names...]
//
// Test context `t`:
//   t.page / t.h            playwright page / harness handle
//   t.step(label)           log a step (shown in the report)
//   t.check(label, ok, detail)    soft assertion: recorded, scenario continues
//   t.require(label, ok, detail)  hard assertion: aborts the scenario on failure
//   t.note(text)            informational line (e.g. "used API fallback for camera setup")
//   t.shot(name)            numbered screenshot in tests/e2e/out/qa/<scenario>/
//   t.app(fn, arg)          page.evaluate(fn, arg) (fn runs in the page; `app` is global there)
//   t.waitFor(fn|selector, {timeout, arg})  -> boolean (never throws)
//   t.visible(sel, within?) -> boolean (first visible match)
//   t.click(sel, {within, button, timeout}) -> boolean (first visible match; waits for it)
//   t.dblclick(sel, opts)   t.hover(sel, opts)
//   t.canvasXY([x,y,z])     -> {x, y} page coords of a world point (via app.viewport.toScreen)
//   t.aim(points, pred)     -> {x, y, world, hit} first world point whose canvas pick satisfies pred(hit) (pred is a string of JS
//                              evaluated in the page with `h` bound to the hit), or null
//   t.canvasClick(x, y, {button, hover}) / t.key(k) / t.type(text) / t.settle(ms) / t.cameraStable()
//   t.fill(sel, text)       focus an input like a user (click, Ctrl+A, type, Tab)
//   t.state()               compact app snapshot {mode, features:[{id,type,name,ok,error}], bodies, volume, marker, ...}
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch } from "./harness.mjs";
import { build } from "../../scripts/build.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const OUT_DIR = process.env.QA_OUT || "build/qa";
export const SHOTS_ROOT = process.env.QA_SHOTS || "tests/e2e/out/qa";
export const BASE_PORT = Number(process.env.QA_PORT) || 5318;

class Abort extends Error {}

export function defineScenario(def) {
  if (!def || !def.name || typeof def.run !== "function") throw new Error("scenario needs name + run");
  return def;
}

/** Run one scenario in a fresh browser/page. Never throws; returns a result record. */
export async function runScenario(def, opts = {}) {
  const port = opts.port || BASE_PORT;
  const shotsRel = path.join(SHOTS_ROOT, def.name);
  const shotsAbs = path.resolve(ROOT, shotsRel);
  fs.rmSync(shotsAbs, { recursive: true, force: true });
  fs.mkdirSync(shotsAbs, { recursive: true });
  const res = { name: def.name, title: def.title || def.name, status: "PASS", checks: [], notes: [], steps: [], shots: [], errors: [], ms: 0 };
  const t0 = Date.now();
  const log = (s) => { if (!opts.quiet) console.log(`  [${def.name}] ${s}`); };
  let h;
  try {
    h = await launch({ outDir: opts.outDir || OUT_DIR, port, shots: shotsRel, build: false, headless: !opts.headed, width: 1600, height: 900, timeout: 120000 });
  } catch (e) {
    res.status = "ERROR";
    res.checks.push({ label: "app boots", ok: false, detail: String(e.message || e).slice(0, 600), hard: true });
    res.ms = Date.now() - t0;
    return res;
  }
  let shotN = 0;
  const t = makeContext(h, res, log, () => ++shotN);
  const timeoutMs = def.timeout || opts.timeout || 150000;
  let timer;
  try {
    await Promise.race([
      (async () => { await def.run(t); })(),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`scenario timed out after ${timeoutMs / 1000}s`)), timeoutMs); }),
    ]);
  } catch (e) {
    if (!(e instanceof Abort)) {
      res.checks.push({ label: "scenario ran to completion", ok: false, detail: String(e && e.stack ? e.stack : e).split("\n").slice(0, 4).join(" | ").slice(0, 600), hard: true });
      log(`EXCEPTION ${e && e.message}`);
    }
    try { await t.shot("failure"); } catch { /* ignore */ }
  } finally {
    clearTimeout(timer);
  }
  // console / page errors are always a check
  const errs = h.errors.filter((e) => !/favicon|DevTools|Download the React/i.test(e));
  res.errors = errs.map((e) => e.split("\n").slice(0, 3).join(" | ").slice(0, 400));
  res.checks.push({ label: "no console errors / page errors", ok: errs.length === 0, detail: errs.length ? `${errs.length} error(s); first: ${res.errors[0]}` : "" });
  await h.close().catch(() => {});
  const failed = res.checks.filter((c) => !c.ok);
  if (res.status !== "ERROR") res.status = failed.length ? "FAIL" : "PASS";
  res.ms = Date.now() - t0;
  return res;
}

function makeContext(h, res, log, nextShot) {
  const page = h.page;
  const t = {
    page,
    h,
    step(label) { res.steps.push(label); log(`- ${label}`); },
    note(text) { res.notes.push(text); log(`  note: ${text}`); },
    check(label, ok, detail = "") {
      const rec = { label, ok: !!ok, detail: ok ? "" : String(detail ?? "") };
      res.checks.push(rec);
      log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` -- ${rec.detail}`}`);
      return !!ok;
    },
    require(label, ok, detail = "") {
      const rec = { label, ok: !!ok, detail: ok ? "" : String(detail ?? ""), hard: true };
      res.checks.push(rec);
      log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` -- ${rec.detail} (aborting scenario)`}`);
      if (!ok) throw new Abort(label);
      return true;
    },
    async shot(name) {
      const file = await h.shot(`${String(nextShot()).padStart(2, "0")}-${name}`);
      res.shots.push(path.relative(ROOT, file).replace(/\\/g, "/"));
      return file;
    },
    app(fn, arg) { return page.evaluate(fn, arg); },
    async waitFor(cond, o = {}) {
      const timeout = o.timeout ?? 5000;
      try {
        if (typeof cond === "string") {
          await page.locator(cond).first().waitFor({ state: "visible", timeout });
        } else {
          await page.waitForFunction(cond, o.arg, { timeout, polling: 50 });
        }
        return true;
      } catch {
        return false;
      }
    },
    /** Returns true when any element matching sel (inside `within`, default document) is visible. */
    async visible(sel, within) {
      const loc = within ? page.locator(within).locator(sel) : page.locator(sel);
      const n = await loc.count();
      for (let i = 0; i < n; i++) if (await loc.nth(i).isVisible().catch(() => false)) return true;
      return false;
    },
    async firstVisible(sel, within) {
      const loc = within ? page.locator(within).locator(sel) : page.locator(sel);
      const n = await loc.count();
      for (let i = 0; i < n; i++) { const l = loc.nth(i); if (await l.isVisible().catch(() => false)) return l; }
      return null;
    },
    async click(sel, o = {}) {
      const deadline = Date.now() + (o.timeout ?? 3000);
      while (Date.now() < deadline) {
        const l = await t.firstVisible(sel, o.within);
        if (l) {
          try { await l.click({ button: o.button || "left", timeout: 2000, force: !!o.force }); return true; } catch { /* retry */ }
        }
        await page.waitForTimeout(80);
      }
      return false;
    },
    async dblclick(sel, o = {}) {
      const deadline = Date.now() + (o.timeout ?? 3000);
      while (Date.now() < deadline) {
        const l = await t.firstVisible(sel, o.within);
        if (l) { try { await l.dblclick({ timeout: 2000 }); return true; } catch { /* retry */ } }
        await page.waitForTimeout(80);
      }
      return false;
    },
    async hover(sel, o = {}) {
      const l = await t.firstVisible(sel, o.within);
      if (!l) return false;
      try { await l.hover({ timeout: 2000 }); return true; } catch { return false; }
    },
    async box(sel, within) {
      const l = await t.firstVisible(sel, within);
      return l ? l.boundingBox() : null;
    },
    /** World point -> page coordinates (canvas offset added). */
    async canvasXY(p) {
      return page.evaluate((p) => {
        const vp = window.app.viewport;
        const r = vp.canvas.getBoundingClientRect();
        const s = vp.toScreen(p);
        return { x: r.left + s[0], y: r.top + s[1], depth: s[2], inside: s[0] >= 0 && s[1] >= 0 && s[0] <= r.width && s[1] <= r.height };
      }, p);
    },
    /** First world point (of `points`) whose canvas pick satisfies `pred` (JS expression with `h`). */
    async aim(points, pred) {
      return page.evaluate(({ points, pred }) => {
        const vp = window.app.viewport;
        const r = vp.canvas.getBoundingClientRect();
        // eslint-disable-next-line no-new-func
        const test = new Function("h", `return (${pred});`);
        for (const p of points) {
          const s = vp.toScreen(p);
          if (!(s[0] >= 2 && s[1] >= 2 && s[0] <= r.width - 2 && s[1] <= r.height - 2)) continue;
          let hit = null;
          try { hit = vp.pick(s[0], s[1], { filter: (ref) => window.app.selection.accepts(ref) }); } catch (e) { hit = null; }
          let ok = false;
          try { ok = !!test(hit); } catch { ok = false; }
          if (ok) return { x: r.left + s[0], y: r.top + s[1], world: p, hit: hit && { ref: hit.ref, type: hit.type } };
        }
        return null;
      }, { points, pred });
    },
    async canvasClick(x, y, o = {}) {
      if (o.hover !== false) { await page.mouse.move(x - 6, y - 4); await page.mouse.move(x, y, { steps: 4 }); await t.frames(2); }
      await page.mouse.click(x, y, { button: o.button || "left" });
      await t.frames(2);
    },
    async key(k) { await page.keyboard.press(k); await t.frames(2); },
    async type(text) { await page.keyboard.type(String(text), { delay: 15 }); },
    async fill(sel, text, o = {}) {
      const l = await t.firstVisible(sel, o.within);
      if (!l) return false;
      try {
        await l.click({ timeout: 2000 });
        await page.keyboard.press("Control+A");
        await page.keyboard.type(String(text), { delay: 10 });
        if (o.commit !== false) await page.keyboard.press(o.commitKey || "Tab");
        await t.frames(2);
        return true;
      } catch { return false; }
    },
    frames(n = 3) { return h.frames(n); },
    settle(ms = 300) { return page.waitForTimeout(ms); },
    /** Wait until the main camera stops moving (animations finished). */
    async cameraStable(timeout = 3000) {
      return page.evaluate((timeout) => new Promise((resolve) => {
        const t0 = performance.now();
        let last = null, still = 0;
        const tick = () => {
          const c = window.app.viewport && window.app.viewport.camera;
          const cur = c ? [...c.position.toArray(), ...c.quaternion.toArray()].map((v) => v.toFixed(5)).join(",") : "";
          if (cur === last) still++; else still = 0;
          last = cur;
          if (still >= 6) return resolve(true);
          if (performance.now() - t0 > timeout) return resolve(false);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }), timeout);
    },
    state() {
      return page.evaluate(() => {
        const a = window.app;
        const vol = (shape) => { try { return a.K.R.measureVolume(shape); } catch { return NaN; } };
        const bodies = a.bodies();
        return {
          mode: a.mode,
          activeSketch: a.activeSketch,
          activeCommand: a.activeCommand ? a.activeCommand.id || "?" : null,
          marker: a.doc.marker,
          name: a.doc.name,
          features: a.doc.features.map((f) => {
            const r = a.featureResult(f.id) || {};
            return { id: f.id, type: f.type, name: f.name, ok: r.ok, error: r.error, rolled: !!r.rolled, suppressed: !!f.suppressed };
          }),
          bodies: bodies.map((b) => ({ id: b.id, name: b.meta.name, visible: b.meta.visible !== false, volume: vol(b.shape) })),
          volume: bodies.reduce((s, b) => s + vol(b.shape), 0),
          selection: a.selection.items.map((r) => r.kind),
          undo: a.history.undoStack.length,
          redo: a.history.redoStack.length,
          previewing: !!a.previewing,
        };
      });
    },
    /** Point the main camera through the app API (setup only; the scenario notes it). */
    async setView(name) {
      const ok = await page.evaluate((name) => {
        try { window.app.viewport.setView(name, { animate: false }); return true; } catch { return false; }
      }, name);
      await t.cameraStable(2500);
      return ok;
    },
    /** Camera view direction (unit vector from camera towards target) and up vector. */
    camera() {
      return page.evaluate(() => {
        const vp = window.app.viewport;
        const c = vp.camera;
        const tg = vp.target;
        const d = [tg[0] - c.position.x, tg[1] - c.position.y, tg[2] - c.position.z];
        const L = Math.hypot(...d) || 1;
        c.updateMatrixWorld();
        const e = c.matrixWorld.elements;
        return { dir: d.map((v) => v / L), up: [e[4], e[5], e[6]], right: [e[0], e[1], e[2]], pos: c.position.toArray(), target: tg, ortho: !!c.isOrthographicCamera };
      });
    },
    /** Close any open menu/dialog/tool by pressing Escape a few times. */
    async escapeAll(n = 3) { for (let i = 0; i < n; i++) await page.keyboard.press("Escape"); await t.frames(2); },
    /** Visible text inside the overlay (menus, toasts, tooltips). */
    overlayText() { return page.evaluate(() => (document.getElementById("overlay") || document.body).innerText || ""); },
    /** Move the mouse onto the canvas centre (gives the canvas hover focus for shortcuts without clicking). */
    async mouseToCanvas(fx = 0.5, fy = 0.5) {
      const r = await page.evaluate(() => { const b = window.app.viewport.canvas.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
      await page.mouse.move(r.x + r.w * fx, r.y + r.h * fy, { steps: 3 });
      return { x: r.x + r.w * fx, y: r.y + r.h * fy };
    },
    /** Blur any focused control so global shortcuts reach the app. */
    async blur() { await page.evaluate(() => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); }); },
    /** Screen pixels of a page rectangle: {w, h, px(x, y) -> [r,g,b,a]} (from a real PNG screenshot). */
    async pixels(x, y, w = 1, h = 1) {
      const buf = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) }, type: "png" });
      return decodePNG(buf);
    },
    /** Average colour of a small square around (x, y). */
    async colorAt(x, y, r = 2) {
      const img = await t.pixels(x - r, y - r, 2 * r + 1, 2 * r + 1);
      const s = [0, 0, 0];
      for (let j = 0; j < img.h; j++) for (let i = 0; i < img.w; i++) { const p = img.px(i, j); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
      const n = img.w * img.h;
      return s.map((v) => Math.round(v / n));
    },
  };
  return t;
}

/** Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced) for screenshot pixel checks. */
export function decodePNG(buf) {
  let off = 8, w = 0, h = 0, ct = 6, depth = 8;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (depth !== 8 || (ct !== 6 && ct !== 2)) throw new Error(`unsupported PNG (depth ${depth}, colour type ${ct})`);
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = i >= bpp && y > 0 ? out[(y - 1) * stride + i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + i] = v & 255;
    }
  }
  return { w, h, px: (x, y) => { const o = y * stride + x * bpp; return [out[o], out[o + 1], out[o + 2], bpp === 4 ? out[o + 3] : 255]; } };
}

// ---------------------------------------------------------------------------
// shared model setup helpers (state preparation through the App API; the scenario under
// test still exercises its own feature through the UI)
// ---------------------------------------------------------------------------
export async function apiBox(t, o = {}) {
  return t.app((o) => {
    const f = window.app.addFeature({ type: "box", length: o.L || "40 mm", width: o.W || "20 mm", height: o.H || "10 mm", center: o.center || [0, 0], operation: o.op || "new", plane: { kind: "origin", name: "XY" } });
    return { id: f.id, body: f.newBody, ok: !!(window.app.featureResult(f.id) || {}).ok };
  }, o);
}

export const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
export const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------
export function printResult(r) {
  const fails = r.checks.filter((c) => !c.ok);
  console.log(`\n=== ${r.name}: ${r.status}  (${r.checks.length - fails.length}/${r.checks.length} checks, ${(r.ms / 1000).toFixed(1)}s)`);
  for (const c of fails) console.log(`    FAIL ${c.label}${c.detail ? ` -- ${c.detail}` : ""}`);
  for (const n of r.notes) console.log(`    note ${n}`);
  if (r.shots.length) console.log(`    shots: ${path.dirname(r.shots[0])}/ (${r.shots.length})`);
}

export function printTable(results) {
  const rows = results.map((r) => {
    const fails = r.checks.filter((c) => !c.ok);
    const first = fails[0] ? `${fails[0].label}${fails[0].detail ? `: ${fails[0].detail}` : ""}` : "";
    return [r.name, r.status, `${r.checks.length - fails.length}/${r.checks.length}`, String(r.errors.length), `${(r.ms / 1000).toFixed(1)}s`, first.replace(/\s+/g, " ").slice(0, 90)];
  });
  const head = ["scenario", "status", "checks", "errors", "time", "first failure"];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => "| " + cells.map((c, i) => c.padEnd(w[i])).join(" | ") + " |";
  console.log("\n" + line(head));
  console.log("|" + w.map((n) => "-".repeat(n + 2)).join("|") + "|");
  for (const r of rows) console.log(line(r));
  const pass = results.filter((r) => r.status === "PASS").length;
  console.log(`\n${pass}/${results.length} scenarios passed`);
}

/** Standalone entry: `node tests/e2e/scenarios/x.mjs [--no-build] [--headed] [--port=N]`. */
export async function mainIfDirect(importMetaUrl, def) {
  if (!process.argv[1] || pathToFileURL(path.resolve(process.argv[1])).href !== importMetaUrl) return;
  const args = process.argv.slice(2);
  const portArg = args.find((a) => a.startsWith("--port="));
  if (!args.includes("--no-build")) await build({ out: OUT_DIR });
  const r = await runScenario(def, { port: portArg ? Number(portArg.slice(7)) : BASE_PORT, headed: args.includes("--headed") });
  printResult(r);
  process.exitCode = r.status === "PASS" ? 0 : 1;
}
