// Bootstrap: global error safety net -> download + inflate the OpenCascade wasm (real progress on the
// splash) -> initKernel -> new App -> UI module init() in order -> 'ready'.
//
// Single-link friendly: everything is in app.js / app.css; the only other request is the kernel,
// fetched relative to the page as occt.gz.wasm (gzip data under a .wasm name, so hosts with an
// extension allow-list and a 20 MiB per-file cap can serve it; the old name occt.wasm.gz is still
// accepted). No inline scripts, no eval, no external hosts.
import "./app/layout.css";
import "./splash.css";
import { App } from "./app/core.js";
import { initKernel } from "./kernel.js";
import { MODULES } from "./modules.js";
import { gunzipSync } from "three/examples/jsm/libs/fflate.module.js";

/* global __WASM_FILE__, __WASM_GZ_BYTES__ */
const WASM_URLS = [typeof __WASM_FILE__ === "string" ? __WASM_FILE__ : "occt.gz.wasm", "occt.wasm.gz"];
const WASM_GZ_BYTES = typeof __WASM_GZ_BYTES__ === "number" ? __WASM_GZ_BYTES__ : 7.25e6; // progress fallback when no Content-Length
const MODULE_INIT_TIMEOUT_MS = 20000;
const KERNEL_START_TIMEOUT_MS = 120000;

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Boot timings (window.__boot): ms since navigation start
// ---------------------------------------------------------------------------
const bootInfo = { marks: { appJs: Math.round(performance.now()) }, errors: [] };
const mark = (k) => (bootInfo.marks[k] = Math.round(performance.now()));
try { window.__boot = bootInfo; } catch { /* ignore */ }

// ---------------------------------------------------------------------------
// Global safety net: any uncaught error / rejected promise becomes a toast, never a dead UI.
// (The browser still logs it to the console, so tests and devtools see it.)
// ---------------------------------------------------------------------------
let theApp = null;
let netOn = false; // set just before 'ready' so errors in ready handlers are reported too
const BENIGN = /ResizeObserver loop|^Script error\.?$/i;
function onUncaught(err, logged = true) {
  const msg = String((err && err.message) || err || "");
  if (BENIGN.test(msg)) return;
  if (netOn && theApp && theApp.reportError) {
    try { theApp.reportError(err, { logged }); } catch { /* never throw from the safety net */ }
  } else if (bootInfo.errors.length < 20) {
    bootInfo.errors.push(msg); // during boot the loader reports failures itself
  }
}
window.addEventListener("error", (ev) => {
  // resource load errors (img/script/link) don't bubble to window; this is a script error
  onUncaught(ev.error || ev.message);
});
window.addEventListener("unhandledrejection", (ev) => onUncaught(ev.reason));

// ---------------------------------------------------------------------------
// Splash / loader UI (markup in index.html, styles in splash.css)
// ---------------------------------------------------------------------------
function splashUI() {
  const root = $("splash");
  const q = (s) => (root ? root.querySelector(s) : null);
  const fill = q(".ld-fill"), msg = q(".splash-msg"), pct = q(".ld-pct");
  const errTitle = q(".ld-err-title"), errText = q(".ld-err-text"), errDetail = q(".ld-err-detail"), retry = q(".ld-retry"), slowEl = q(".ld-slow");
  if (root) root.classList.add("js");
  let shown = 0;
  return {
    root,
    status(text, frac = null) {
      if (msg) msg.textContent = text;
      if (frac === null) return;
      shown = Math.max(shown, Math.min(1, frac)); // never runs backwards
      if (fill) { fill.classList.remove("ld-indet"); fill.style.width = `${(shown * 100).toFixed(1)}%`; }
      if (pct) pct.textContent = `${Math.round(shown * 100)}%`;
    },
    slow(on) {
      if (!root || root.classList.contains("slow") === !!on) return;
      if (on && slowEl) slowEl.textContent = "The download is slow but still running. On a slow connection the first visit can take a minute; later visits load from the browser cache.";
      root.classList.toggle("slow", !!on);
    },
    error({ title, text, detail }, onRetry) {
      if (!root) return;
      root.classList.remove("slow");
      root.classList.add("error");
      if (errTitle) errTitle.textContent = title;
      if (errText) errText.textContent = text;
      if (errDetail) errDetail.textContent = detail || "";
      if (msg) msg.textContent = `${title}. ${text}`; // harness / screen readers read .splash-msg
      if (retry) {
        retry.disabled = false;
        retry.onclick = () => { retry.disabled = true; root.classList.remove("error"); shown = 0; onRetry(); };
        try { retry.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
    },
    done() {
      if (!root) return;
      this.status("Ready", 1);
      root.classList.add("done");
      setTimeout(() => root.remove(), 400);
    },
  };
}

const MB = (n) => (n / 1e6).toFixed(1);

// ---------------------------------------------------------------------------
// Kernel download + inflate
// ---------------------------------------------------------------------------
function kernelError(kind, message, cause) {
  const e = new Error(message);
  e.kind = kind;
  if (cause) e.cause = cause;
  return e;
}

async function readWithProgress(res, total, onProgress) {
  if (!res.body || typeof res.body.getReader !== "function") {
    const b = new Uint8Array(await res.arrayBuffer());
    onProgress(b.length, b.length);
    return b;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, Math.max(total, loaded));
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

async function downloadKernel(onProgress, { reload = false } = {}) {
  for (let i = 0; i < WASM_URLS.length; i++) {
    const url = WASM_URLS[i];
    let res;
    try {
      res = await fetch(url, reload ? { cache: "reload" } : undefined);
    } catch (e) {
      throw kernelError("network", `Network error while downloading ${url}`, e);
    }
    if (res.status === 404 && i < WASM_URLS.length - 1) continue; // builds before pass 2 shipped occt.wasm.gz
    if (!res.ok) throw kernelError(res.status === 404 ? "missing" : "network", `${WASM_URLS[0]}: HTTP ${res.status} ${res.statusText || ""}`.trim());
    const total = Number(res.headers.get("content-length")) || WASM_GZ_BYTES;
    try {
      return await readWithProgress(res, total, onProgress);
    } catch (e) {
      throw kernelError("network", `The download of ${url} was interrupted`, e);
    }
  }
  throw kernelError("missing", `${WASM_URLS[0]} not found`);
}

async function inflateKernel(bytes) {
  const b = bytes;
  if (b[0] === 0x00 && b[1] === 0x61 && b[2] === 0x73 && b[3] === 0x6d) return b; // already plain wasm (host decoded it)
  if (!(b[0] === 0x1f && b[1] === 0x8b)) {
    throw kernelError("corrupt", `The downloaded kernel file is not gzip'd WebAssembly (${b.length} bytes; an error page or a truncated upload?)`);
  }
  if (typeof DecompressionStream === "function") {
    try {
      const stream = new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) {
      console.warn("DecompressionStream failed, using the JS inflater", e);
    }
  }
  try {
    return gunzipSync(b);
  } catch (e) {
    throw kernelError("corrupt", "The downloaded kernel file is damaged (could not inflate it)", e);
  }
}

/** initKernel, but a failing WebAssembly.instantiate (which kernel.js does not propagate) or a hang becomes an error. */
function startKernel(wasm) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, v) => { if (settled) return; settled = true; clearTimeout(timer); window.removeEventListener("unhandledrejection", onRej); fn(v); };
    const isKernelFailure = (r) => {
      if (!r) return false;
      const W = typeof WebAssembly === "object" ? WebAssembly : {};
      if ((W.CompileError && r instanceof W.CompileError) || (W.LinkError && r instanceof W.LinkError) || (W.RuntimeError && r instanceof W.RuntimeError)) return true;
      return r instanceof EvalError || r instanceof RangeError || /WebAssembly|wasm/i.test(String(r.message || r));
    };
    const onRej = (ev) => { if (isKernelFailure(ev.reason)) { ev.preventDefault(); finish(reject, ev.reason); } };
    const timer = setTimeout(() => finish(reject, kernelError("timeout", `The geometry kernel did not start within ${KERNEL_START_TIMEOUT_MS / 1000} s`)), KERNEL_START_TIMEOUT_MS);
    window.addEventListener("unhandledrejection", onRej);
    let p;
    try { p = initKernel(wasm); } catch (e) { finish(reject, e); return; }
    Promise.resolve(p).then((oc) => finish(resolve, oc), (e) => finish(reject, e));
  });
}

/** Turn a kernel start failure into words a visitor can act on. */
function explain(e) {
  const m = String((e && e.message) || e || "");
  const detail = e ? `${e.name && e.name !== "Error" ? `${e.name}: ` : ""}${m}${e.cause ? `\n(${e.cause.message || e.cause})` : ""}` : "";
  if (typeof WebAssembly !== "object" || e?.kind === "nowasm") {
    return { title: "WebAssembly is not available", text: "This browser has WebAssembly turned off or does not support it, and the geometry kernel needs it. Use a current desktop Chrome, Edge or Firefox, and check that no security setting disables it (for example Edge's enhanced security for this site, or Safari's Lockdown Mode).", detail };
  }
  if (/Content Security Policy|unsafe-eval|wasm-eval|Refused to compile|not allowed by|CSP/i.test(m) || e instanceof EvalError) {
    return { title: "The host blocks WebAssembly", text: "The site serving this page does not allow WebAssembly to run (Content-Security-Policy). Host the files somewhere that allows 'wasm-unsafe-eval', or open them from a plain static host.", detail };
  }
  if (e?.kind === "missing") {
    return { title: "The geometry kernel file is missing", text: `${WASM_URLS[0]} was not found next to index.html. Upload it together with index.html, app.js and app.css.`, detail };
  }
  if (e?.kind === "network") {
    return { title: "Could not download the geometry kernel", text: "The 7 MB kernel download failed. Check your connection and retry.", detail };
  }
  if (e?.kind === "corrupt") {
    return { title: "The geometry kernel download is damaged", text: "Retry; if it keeps failing, re-upload occt.gz.wasm (it must be the unmodified gzip file from the build).", detail };
  }
  if (e?.kind === "timeout") {
    return { title: "The geometry kernel is taking too long", text: "Starting the kernel timed out. Close other heavy tabs and retry.", detail };
  }
  if (e instanceof RangeError || /out of memory|allocation|Memory/i.test(m)) {
    return { title: "Not enough memory", text: "The browser could not reserve memory for the geometry kernel. Close other tabs or windows and retry (a 64-bit desktop browser is required).", detail };
  }
  return { title: "Could not start the geometry kernel", text: "Something went wrong while starting the modelling engine. Retry, or reload the page.", detail };
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function loadKernel(ui, attempt) {
  if (typeof WebAssembly !== "object" || typeof WebAssembly.instantiate !== "function") throw kernelError("nowasm", "WebAssembly is not available in this browser");
  ui.status("Downloading geometry kernel…", 0.02);
  let lastTick = Date.now();
  const watchdog = setInterval(() => ui.slow(Date.now() - lastTick > 20000), 2000);
  let bytes;
  try {
    bytes = await downloadKernel((loaded, total) => {
      lastTick = Date.now();
      ui.slow(false);
      ui.status(`Downloading geometry kernel… ${MB(loaded)} of ${MB(total)} MB`, 0.02 + 0.76 * (loaded / total));
    }, { reload: attempt > 0 });
  } finally {
    clearInterval(watchdog);
    ui.slow(false);
  }
  mark("kernelDownloaded");
  ui.status("Unpacking geometry kernel…", 0.8);
  await new Promise((r) => setTimeout(r, 0)); // let the splash paint
  const wasm = await inflateKernel(bytes);
  bytes = null;
  mark("kernelInflated");
  ui.status("Starting geometry kernel…", 0.84);
  await startKernel(wasm);
  mark("kernelReady");
}

async function initModules(app, ui) {
  const n = MODULES.length;
  let i = 0;
  for (const [name, mod] of MODULES) {
    i++;
    ui.status("Building workspace…", 0.88 + 0.1 * (i / n));
    if (!mod || mod.stub || typeof mod.init !== "function") continue;
    let timer;
    try {
      const r = mod.init(app);
      if (r && typeof r.then === "function") {
        await Promise.race([
          r,
          new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`still starting after ${MODULE_INIT_TIMEOUT_MS / 1000} s`)), MODULE_INIT_TIMEOUT_MS); }),
        ]);
      }
    } catch (e) {
      console.error(`[module ${name}]`, e);
      app.toast(`UI module "${name}" failed to start: ${e.message || e}`, "error", 8000);
    } finally {
      clearTimeout(timer);
    }
  }
}

function smallOrTouchScreen() {
  try {
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;
    return coarse || window.innerWidth < 900 || window.innerHeight < 500;
  } catch { return false; }
}

async function boot() {
  const ui = splashUI();
  const app = new App({
    root: $("app"),
    appbar: $("appbar"),
    toolbar: $("toolbar"),
    workspace: $("workspace"),
    canvasHost: $("canvas-host"),
    browserHost: $("browser-host"),
    viewcubeHost: $("viewcube-host"),
    navbarHost: $("navbar-host"),
    dialogHost: $("dialog-host"),
    paletteHost: $("palette-host"),
    commentsHost: $("comments-host"),
    timeline: $("timeline"),
    overlay: $("overlay"),
  });
  theApp = app;
  window.app = app; // handy for debugging and the e2e tests
  let readyResolve;
  app.ready = new Promise((r) => (readyResolve = r));
  app.isReady = false;
  app.bootInfo = bootInfo;

  // 1. kernel (retryable without reloading the page)
  let attempt = 0;
  for (;;) {
    try {
      await loadKernel(ui, attempt);
      break;
    } catch (e) {
      console.error("[kernel]", e);
      const info = explain(e);
      await new Promise((resume) => ui.error(info, resume));
      attempt++;
    }
  }

  // 2. UI modules
  await initModules(app, ui);
  mark("modulesReady");

  // 3. first evaluation + ready (a failure here must not leave the splash up)
  try {
    app.recompute();
  } catch (e) {
    console.error("[recompute]", e);
    app.toast(`Could not evaluate the design: ${e.message || e}`, "error", 8000);
  }
  netOn = true;
  app.emit("doc", { replaced: true });
  app.emit("ready", {});
  ui.done(); // pointer-events off at once, fades out over 0.35 s
  app.isReady = true;
  mark("ready");
  readyResolve(app);

  const m = bootInfo.marks;
  console.info(`[boot] ready ${m.ready} ms after navigation (app.js running at ${m.appJs} ms, kernel downloaded ${m.kernelDownloaded}, inflated ${m.kernelInflated}, started ${m.kernelReady}, UI ${m.modulesReady})`);
  if (smallOrTouchScreen()) app.toast("Best on desktop Chrome or Edge with a mouse and keyboard; small and touch screens are only partly supported.", "info", 7000);
}

boot().catch((e) => {
  // last resort: never leave a dead splash behind
  console.error("[boot]", e);
  const ui = splashUI();
  ui.error({ title: "Could not start", text: "The app failed to start. Reload the page to try again.", detail: String((e && e.stack) || e) }, () => { try { location.reload(); } catch { /* ignore */ } });
});
