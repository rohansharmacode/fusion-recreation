// Build the browser app.
//   node scripts/build.mjs                      -> dist/ (all modules, sourcemaps)
//   node scripts/build.mjs --out=build/x        -> custom output dir
//   node scripts/build.mjs --only=viewport,sketch  -> other UI modules replaced by empty stubs
//   node scripts/build.mjs --release            -> release/ : minified + tree-shaken, no sourcemaps,
//                                                  exactly the 4 publishable files + a size report
//   node scripts/build.mjs --release --analyze  -> also list the biggest inputs of app.js
//   node scripts/build.mjs --watch              -> rebuild on change
//
// Output (any mode): index.html, app.js, app.css, occt.gz.wasm (+ .map files in dev builds).
// occt.gz.wasm is the 23 MB OpenCascade wasm gzip'd to ~7 MB under a .wasm name, so hosts with a
// per-file size limit / extension allow-list (claude.ai artifacts: 20 MiB, no .gz) can serve it.
// src/main.js inflates it in the browser (it still accepts the old name occt.wasm.gz).
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

export const ALL_MODULES = ["viewport", "sketch", "dialogs", "shell", "browser", "timeline", "menus", "inspect", "manage", "annotate", "configure", "assembly", "insertx", "surface", "mesh", "sheetmetal", "plastic", "createx", "solidx", "form", "render", "drawing"];
export const WASM_FILE = "occt.gz.wasm";
export const LEGACY_WASM_FILE = "occt.wasm.gz";
export const RELEASE_FILES = ["index.html", "app.js", "app.css", WASM_FILE];
const MAX_FILE_BYTES = 20 * 1024 * 1024; // claude.ai artifact per-file limit

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

/** gzip the OCCT wasm once (cached in .cache/, keyed on the source size+mtime) and return its path. */
function gzippedWasm() {
  const src = path.join(root, "node_modules/replicad-opencascadejs/dist/replicad_single.wasm");
  const cacheDir = path.join(root, ".cache");
  const cached = path.join(cacheDir, "occt.wasm.gz");
  const st = fs.statSync(src);
  const stamp = `${st.size}-${st.mtimeMs}`;
  const stampFile = cached + ".stamp";
  if (!fs.existsSync(cached) || !fs.existsSync(stampFile) || fs.readFileSync(stampFile, "utf8") !== stamp) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const gz = zlib.gzipSync(fs.readFileSync(src), { level: 9 });
    const tmp = `${cached}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, gz);
    fs.renameSync(tmp, cached); // atomic: parallel builds never see a half-written file
    fs.writeFileSync(stampFile, stamp);
  }
  return cached;
}

function copyWasm(outDir) {
  const gz = gzippedWasm();
  const dst = path.join(outDir, WASM_FILE);
  const tmp = `${dst}.${process.pid}.tmp`;
  fs.copyFileSync(gz, tmp);
  fs.renameSync(tmp, dst);
  // An old-name copy left behind by earlier builds would only waste space (and upload quota).
  try { fs.rmSync(path.join(outDir, LEGACY_WASM_FILE), { force: true }); } catch { /* ignore */ }
  return fs.statSync(dst).size;
}

// ---------------------------------------------------------------------------
// The OpenCascade glue (emscripten embind) builds its function invokers with `new Function(...)`.
// Hosts whose Content-Security-Policy has no 'unsafe-eval' (sandboxed artifact hosts, strict
// static hosting setups) throw EvalError there and the kernel never starts. This plugin keeps the
// original code path and adds an equivalent closure-based fallback that runs only if `new Function`
// throws, so behaviour is unchanged wherever eval is allowed.
// ---------------------------------------------------------------------------
const EMBIND_HELPERS = `
var __fusionNoEval = false; // set after the first blocked eval: skip further (reported) CSP violations
function __fusionInvoker(names, vals, nArgs, isMethod, useDestructors, returns) {
  globalThis.__fusionEmbindFallback = (globalThis.__fusionEmbindFallback || 0) + 1; // tests: proves the CSP-safe path ran
  var H = {};
  for (var i = 0; i < names.length; i++) H[names[i]] = vals[i];
  var toArg = [], dtor = [];
  for (var j = 0; j < nArgs; j++) { toArg.push(H["toArg" + j + "Wire"]); dtor.push(H["arg" + j + "Wired_dtor"] || null); }
  var fn = H.fn, invoker = H.invoker, toThis = H.toClassParamWire, fromRet = H.fromRetWire, runD = H.runDestructors, thisDtor = H.thisWired_dtor || null;
  return function () {
    var destructors = useDestructors ? [] : null;
    var wired = [fn], argW = new Array(nArgs), thisWired;
    if (isMethod) { thisWired = toThis(destructors, this); wired.push(thisWired); }
    for (var k = 0; k < nArgs; k++) { argW[k] = toArg[k](destructors, arguments[k]); wired.push(argW[k]); }
    var rv = invoker.apply(null, wired);
    if (useDestructors) runD(destructors);
    else {
      if (isMethod && thisDtor) thisDtor(thisWired);
      for (var m = 0; m < nArgs; m++) if (dtor[m]) dtor[m](argW[m]);
    }
    if (returns) return fromRet(rv);
  };
}
function __fusionCaller(h, readers, kind, isVoid) {
  return function (handle, methodName, destructorsRef, args) {
    var av = [];
    for (var l = 0; l < readers.length; l++) av.push(readers[l](args + l * 8));
    var r;
    if (kind === 0) r = h.toValue(handle).apply(void 0, av);
    else if (kind === 2) r = Reflect.construct(h.toValue(handle), av);
    else if (kind === 1) { var o = h.toValue(handle); r = o[h.getStringOrSymbol(methodName)].apply(o, av); }
    else r = av[av.length - 1];
    if (!isVoid) return h.emval_returnValue(h.toReturnWire, destructorsRef, r);
  };
}
`;
const EMBIND_PATCHES = [
  {
    // craftInvokerFunction: q = names, d = values, e = arg count, k = class method, m = destructor stack, c = returns
    from: 'b=(new Function(q,n+"}\\n"))(...d);return ac(a,b)}',
    to: 'if(__fusionNoEval)b=__fusionInvoker(q,d,e,k,m,c);else try{b=(new Function(q,n+"}\\n"))(...d)}catch(__e){__fusionNoEval=!0;b=__fusionInvoker(q,d,e,k,m,c)}return ac(a,b)}',
  },
  {
    // _emval_get_method_caller: h = named helpers, g = arg readers, c = call kind, b = return type
    from: "c=(new Function(Object.keys(h),k))(...Object.values(h));",
    to: "if(__fusionNoEval)c=__fusionCaller(h,g,c,!!b.yc);else try{c=(new Function(Object.keys(h),k))(...Object.values(h))}catch(__e){__fusionNoEval=!0;c=__fusionCaller(h,g,c,!!b.yc)}",
  },
];
let embindWarned = false;
const cspSafeEmbind = {
  name: "csp-safe-embind",
  setup(b) {
    b.onLoad({ filter: /replicad-opencascadejs[\\/]dist[\\/]replicad_single\.js$/ }, (a) => {
      let src = fs.readFileSync(a.path, "utf8");
      let applied = 0;
      for (const p of EMBIND_PATCHES) {
        if (src.includes(p.from)) { src = src.replace(p.from, p.to); applied++; }
      }
      if (applied !== EMBIND_PATCHES.length && !embindWarned) {
        embindWarned = true;
        console.warn(`[build] csp-safe-embind: ${applied}/${EMBIND_PATCHES.length} patches applied (replicad-opencascadejs changed?): the kernel will need 'unsafe-eval' on hosts with a strict CSP`);
      }
      if (applied) src = EMBIND_HELPERS + src;
      return { contents: src, loader: "js" };
    });
  },
};

function fmtBytes(n) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MiB` : `${(n / 1024).toFixed(1)} KiB`;
}

/** Size report for a build dir; returns {files:{name:{bytes,gzip}}, oversize:[...]} */
export function sizeReport(outDir, { print = true } = {}) {
  const files = {};
  const oversize = [];
  for (const f of RELEASE_FILES) {
    const p = path.join(outDir, f);
    if (!fs.existsSync(p)) continue;
    const buf = fs.readFileSync(p);
    const gzip = f === WASM_FILE ? buf.length : zlib.gzipSync(buf, { level: 9 }).length;
    files[f] = { bytes: buf.length, gzip };
    if (buf.length > MAX_FILE_BYTES) oversize.push(f);
  }
  if (print) {
    for (const [f, s] of Object.entries(files)) {
      console.log(`  ${f.padEnd(14)} ${fmtBytes(s.bytes).padStart(10)}${f === WASM_FILE ? "   (gzip data, inflated in the browser)" : `   gzip ${fmtBytes(s.gzip)}`}`);
    }
    const total = Object.values(files).reduce((a, s) => a + s.gzip, 0);
    console.log(`  ${"transfer".padEnd(14)} ${fmtBytes(total).padStart(10)}   (what a first visit downloads with gzip on)`);
    if (oversize.length) console.warn(`  WARNING: over the 20 MiB per-file limit: ${oversize.join(", ")}`);
  }
  return { files, oversize };
}

export async function build(opts = {}) {
  const release = !!opts.release;
  const outDir = path.resolve(root, opts.out || (release ? "release" : "dist"));
  const only = opts.only ? String(opts.only).split(",").map((s) => s.trim()).filter(Boolean) : null;
  fs.mkdirSync(outDir, { recursive: true });
  if (release) {
    // the release dir must hold exactly the publishable files (no stale maps / old wasm names)
    for (const f of ["app.js.map", "app.css.map", LEGACY_WASM_FILE]) fs.rmSync(path.join(outDir, f), { force: true });
  }

  const stubPlugin = {
    name: "module-stubs",
    setup(b) {
      b.onResolve({ filter: /^@module\// }, (a) => {
        const name = a.path.slice("@module/".length);
        if (only && !only.includes(name)) return { path: name, namespace: "module-stub" };
        return { path: path.join(root, "src/modules", name, "index.js") };
      });
      b.onLoad({ filter: /.*/, namespace: "module-stub" }, () => ({
        contents: "export const stub = true; export function init() {}",
        loader: "js",
      }));
    },
  };

  const wasmGz = gzippedWasm();
  const config = {
    absWorkingDir: root,
    entryPoints: { app: path.join(root, "src/main.js") },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outdir: outDir,
    sourcemap: !release,
    minify: release,
    treeShaking: true,
    legalComments: release ? "eof" : "inline",
    metafile: !!opts.analyze,
    external: ["node:*"],
    plugins: [stubPlugin, cspSafeEmbind],
    loader: { ".svg": "text", ".png": "dataurl" },
    logLevel: "warning",
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __RELEASE__: JSON.stringify(release),
      __WASM_FILE__: JSON.stringify(WASM_FILE),
      __WASM_GZ_BYTES__: String(fs.statSync(wasmGz).size),
      "process.env.NODE_ENV": JSON.stringify(release ? "production" : "development"),
    },
  };

  const copyStatic = () => {
    fs.copyFileSync(path.join(root, "index.html"), path.join(outDir, "index.html"));
    copyWasm(outDir);
  };

  if (opts.watch) {
    const ctx = await esbuild.context({
      ...config,
      plugins: [...config.plugins, { name: "copy", setup(b) { b.onEnd(() => copyStatic()); } }],
    });
    await ctx.watch();
    console.log(`watching -> ${outDir}`);
    return ctx;
  }
  const t0 = Date.now();
  const res = await esbuild.build(config);
  copyStatic();
  console.log(`built ${release ? "RELEASE " : ""}${only ? `[${only.join(",")}] ` : ""}-> ${path.relative(root, outDir) || "."} in ${Date.now() - t0} ms`);
  if (release || opts.sizes) {
    const rep = sizeReport(outDir);
    if (rep.oversize.length && release) throw new Error(`release files over 20 MiB: ${rep.oversize.join(", ")}`);
  }
  if (opts.analyze && res.metafile) {
    console.log(await esbuild.analyzeMetafile(res.metafile, { verbose: false }));
    const out = Object.values(res.metafile.outputs).find((o) => o.entryPoint);
    if (out) {
      const pkgs = {};
      for (const [file, info] of Object.entries(out.inputs)) {
        const m = /node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(file);
        const key = m ? m[1] : file.startsWith("src") ? file.split(/[\\/]/).slice(0, 3).join("/") : file;
        pkgs[key] = (pkgs[key] || 0) + info.bytesInOutput;
      }
      console.log("app.js by package / source dir:");
      for (const [k, v] of Object.entries(pkgs).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${fmtBytes(v).padStart(10)}  ${k}`);
    }
  }
  return outDir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  build(a).catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
