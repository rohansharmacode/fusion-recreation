// Run every QA scenario against a full build and print a summary table.
//
//   node tests/e2e/run-all.mjs                    # full build -> build/qa, all scenarios, sequential
//   node tests/e2e/run-all.mjs core-loop viewcube # only these scenarios
//   node tests/e2e/run-all.mjs --parallel=3       # run up to 3 browsers at once (ports 5318, 5319, ...)
//   node tests/e2e/run-all.mjs --no-build --quiet --headed
//   node tests/e2e/run-all.mjs --release --out=release core-loop   # minified release build (QA_OUT=release + --no-build reuses one)
//
// Screenshots: tests/e2e/out/qa/<scenario>/NN-*.png    Results: tests/e2e/out/qa/results.json
// Exit code 0 only if every selected scenario passed.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "../../scripts/build.mjs";
import { ROOT, OUT_DIR, SHOTS_ROOT, BASE_PORT, runScenario, printResult, printTable } from "./lib.mjs";

const ORDER = ["toolbar", "core-loop", "viewcube", "marking-menu", "toolbox", "undo-redo", "save-open", "parameters", "browser", "timeline", "modeling", "navigation", "sketch", "shortcuts", "look", "small-screen", "robustness"];

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const wanted = args.filter((a) => !a.startsWith("--"));
const parallel = Math.max(1, Number(opt("parallel", "1")) || 1);

const dir = path.join(ROOT, "tests/e2e/scenarios");
const available = fs.readdirSync(dir).filter((f) => f.endsWith(".mjs")).map((f) => f.slice(0, -4));
const names = (wanted.length ? wanted : [...ORDER.filter((n) => available.includes(n)), ...available.filter((n) => !ORDER.includes(n)).sort()]);
const unknown = names.filter((n) => !available.includes(n));
if (unknown.length) { console.error(`unknown scenario(s): ${unknown.join(", ")}; available: ${available.join(", ")}`); process.exit(2); }

if (!flag("no-build")) await build({ out: opt("out", OUT_DIR), release: flag("release") });

const defs = [];
for (const n of names) {
  const mod = await import(pathToFileURL(path.join(dir, `${n}.mjs`)).href);
  defs.push(mod.default);
}

const t0 = Date.now();
const results = new Array(defs.length);
let next = 0;
async function worker(slot) {
  while (next < defs.length) {
    const i = next++;
    const def = defs[i];
    console.log(`\n>>> ${def.name} (${def.title || ""}) on port ${BASE_PORT + slot}`);
    results[i] = await runScenario(def, { port: BASE_PORT + slot, outDir: opt("out", OUT_DIR), headed: flag("headed"), quiet: flag("quiet") || parallel > 1 });
    printResult(results[i]);
  }
}
await Promise.all(Array.from({ length: Math.min(parallel, defs.length) }, (_, s) => worker(s)));

printTable(results);
console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const outFile = path.join(ROOT, SHOTS_ROOT, "results.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ when: new Date().toISOString(), results }, null, 2));
console.log(`results: ${path.relative(ROOT, outFile)}`);
process.exitCode = results.every((r) => r.status === "PASS") ? 0 : 1;
