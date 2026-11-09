// Icon gallery: renders every icon from src/modules/icons/icons.js into build/icons/gallery.html
// and screenshots it (headless Edge via playwright-core) for visual review.
//
//   node scripts/icon-gallery.mjs                 # html + screenshots -> tests/e2e/out/icons/
//   node scripts/icon-gallery.mjs --no-shots      # html only
//   node scripts/icon-gallery.mjs --filter=Sketch # only ids containing "Sketch"
//   node scripts/icon-gallery.mjs --per=60        # icons per screenshot chunk
//   node scripts/icon-gallery.mjs --coverage      # check ids against the local Fusion install's
//        TabToolbars.xml (read in place; set FUSION_INSTALL to override the path) and exit
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const outDir = path.join(root, "build/icons");
const shotDir = path.join(root, "tests/e2e/out/icons");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const mod = await import(pathToFileURL(path.join(root, typeof args.entry === "string" ? args.entry : "src/modules/icons/icons.js")).href + `?t=${Date.now()}`);
const { icon, featureIcon, uiIcon, hasIcon, iconIds, uiIconNames, featureTypes, iconGroups } = mod;

if (typeof args.big === "string") {
  // --big=Id1,Id2  -> tests/e2e/out/icons/big.png with those icons at 256px (detail review)
  const ids = args.big.split(",").filter(Boolean);
  const file = path.join(outDir, "big.html");
  fs.writeFileSync(file, `<!doctype html><html><body style="background:#fff;margin:4px;display:flex;gap:8px">${ids.map((id) => icon(id, { size: 256 })).join("")}</body></html>`);
  const { chromium } = await import("playwright-core");
  const { browserOptions } = await import("./browser.mjs");
  const browser = await chromium.launch(browserOptions({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 266 * ids.length, height: 266 } });
  await page.goto(pathToFileURL(file).href);
  await page.screenshot({ path: path.join(shotDir, "big.png") });
  await browser.close();
  console.log("shot big.png");
  process.exit(0);
}

if (args.coverage) {
  const install = process.env.FUSION_INSTALL || path.join(process.env.LOCALAPPDATA || "", "Autodesk/webdeploy/production/39e8a3d5e919c70b05ef3ebfe9c6bfc8d9ee001e");
  const panelsOf = (file) => {
    if (!fs.existsSync(file)) return null;
    const x = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
    const out = {};
    for (const m of x.matchAll(/<Panel\s+Id="([^"]+)"[\s\S]*?<\/Panel>/g)) {
      if (out[m[1]]) continue;
      const ids = (s) => [...(s || "").matchAll(/<(?:Button|DropDownButton|SplitButton|CheckBox)[^>]*\sId="([^"]+)"/g)].map((a) => a[1]);
      out[m[1]] = { controls: ids((/<Controls>([\s\S]*?)<\/Controls>/.exec(m[0]) || [])[1]), dropdown: ids((/<PanelDropdown[^>]*>([\s\S]*?)<\/PanelDropdown>/.exec(m[0]) || [])[1]) };
    }
    return out;
  };
  const P = panelsOf(path.join(install, "Fusion/UI/FusionUI/Resources/Toolbar/TabToolbars.xml"));
  const PM = panelsOf(path.join(install, "Applications/ParaMesh/UI/ParaMeshUI/Resources/Toolbar/TabToolbars.xml")) || {};
  if (!P) { console.log(`Fusion install not found at ${install}`); process.exit(0); }
  const own = new Set(iconIds());
  const check = (label, panels, src, which = ["controls", "dropdown"]) => {
    const ids = [...new Set(panels.flatMap((p) => which.flatMap((k) => (src[p] && src[p][k]) || [])))];
    const miss = ids.filter((id) => !own.has(id));
    console.log(`${label}: ${ids.length} ids, ${miss.length ? `no dedicated icon: ${miss.join(" ")}` : "all have dedicated icons"}`);
  };
  check("SOLID + SKETCH tabs", ["SolidCreatePanel", "SolidModifyPanel", "AssemblePanel", "ConstructionPanel", "InspectPanel", "InsertPanel", "SelectPanel", "ConfigurePanel", "PartAssemblePanel", "SnapshotPanel", "SketchCreatePanel", "SketchModifyPanel", "SketchConstraintsPanel", "StopSketchPanel"], P);
  check("SURFACE / SHEET METAL / PLASTIC / UTILITIES", ["SurfaceCreatePanel", "SurfaceModifyPanel", "SheetMetalCreatePanel", "SheetMetalModifyPanel", "SheetmetalRefoldPanel", "PlasticPartsSetupPanel", "PlasticPartsCreatePanel", "PlasticPartsAssemblePanel", "PlasticPartsInspectPanel", "ModelingTogglePanel", "MakePanel", "SolidScriptsAddinsPanel", "UtilityPanel", "ToolsInspectPanel", "Annotate3DPanel"], P);
  check("MESH", ["ParaMeshCreatePanel", "ParaMeshPreparePanel", "ParaMeshModifyPanel", "ParaMeshSelectPanel", "ParaMeshExportPanel"], PM);
  process.exit(0);
}
const filter = typeof args.filter === "string" ? args.filter.toLowerCase() : null;
const keep = (id) => !filter || id.toLowerCase().includes(filter);
const per = Number(args.per) || 30;

const groups = (iconGroups ? iconGroups() : [["Commands", iconIds()]]).map(([name, ids]) => [name, ids.filter(keep)]).filter(([, ids]) => ids.length);
const features = (featureTypes ? featureTypes() : []).filter(keep);
const uis = (uiIconNames ? uiIconNames() : []).filter(keep);

let problems = [];
const cell = (label, big, small, extra = "") => `<div class="cell" data-id="${label}">${big}${small}${extra}<div class="lbl">${label}</div></div>`;

function chunks(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

let html = `<!doctype html><html><head><meta charset="utf-8"><title>Icon gallery</title><style>
body{font:11px "Segoe UI",Arial,sans-serif;background:#efefef;margin:12px;color:#222}
h2{font-size:13px;margin:16px 0 6px}
.chunk{display:grid;grid-template-columns:repeat(6,190px);gap:4px;background:#fefefe;padding:8px;border:1px solid #bbb;width:max-content;margin-bottom:10px}
.cell{display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 2px;border:1px solid #eee;background:#fff}
.cell .row{display:flex;align-items:center;gap:8px}
.lbl{font-size:10px;max-width:186px;overflow-wrap:anywhere;text-align:center;color:#444;line-height:1.1}
.px{image-rendering:pixelated;width:48px;height:48px}
.dark{background:#3c3c3c}
</style></head><body>`;

let chunkId = 0;
const chunkList = [];
const addChunk = (title, cellsHtml) => { const id = `c${chunkId++}`; chunkList.push({ id, title }); html += `<h2>${title}</h2><div class="chunk" id="${id}">${cellsHtml}</div>`; };

for (const [name, ids] of groups) {
  chunks(ids, per).forEach((part, i) => {
    let cells = "";
    for (const id of part) {
      if (!hasIcon(id)) problems.push(`no icon: ${id}`);
      let big, small;
      try { big = icon(id, { size: 32 }); small = icon(id, { size: 16 }); } catch (e) { problems.push(`${id}: ${e.message}`); big = small = "ERR"; }
      cells += cell(id, `<div class="row">${icon(id, { size: 64 })}${big}<canvas class="px" width="16" height="16" data-svg="${encodeURIComponent(small)}"></canvas>${small}</div>`, "");
    }
    addChunk(`${name} (${ids.length})${i ? ` part ${i + 1}` : ""}`, cells);
  });
}
if (features.length) {
  let cells = "";
  for (const t of features) { const s = featureIcon(t, { size: 16 }); cells += cell(t, `<div class="row">${featureIcon(t, { size: 64 })}${featureIcon(t, { size: 32 })}<canvas class="px" width="16" height="16" data-svg="${encodeURIComponent(s)}"></canvas>${s}</div>`, ""); }
  addChunk(`Feature icons (${features.length})`, cells);
}
if (uis.length) {
  chunks(uis, per * 2).forEach((part, i) => {
    let cells = "";
    for (const n of part) {
      const s = uiIcon(n, { size: 16 });
      cells += cell(n, `<div class="row">${uiIcon(n, { size: 48 })}<canvas class="px" width="16" height="16" data-svg="${encodeURIComponent(s)}"></canvas>${s}<span class="dark" style="color:#eee;display:inline-flex;padding:2px">${s}</span></div>`, "");
    }
    addChunk(`UI glyphs (${uis.length})${i ? ` part ${i + 1}` : ""}`, cells);
  });
}
html += `<script>
(async () => {
  const cs = [...document.querySelectorAll('canvas[data-svg]')];
  await Promise.all(cs.map((c) => new Promise((res) => {
    let svg = decodeURIComponent(c.dataset.svg);
    if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    svg = svg.replace(/currentColor/g, '#333');
    const img = new Image();
    img.onload = () => { c.getContext('2d').drawImage(img, 0, 0, 16, 16); res(); };
    img.onerror = () => { c.style.outline = '2px solid red'; res(); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  })));
  document.body.dataset.ready = '1';
})();
</script></body></html>`;

const file = path.join(outDir, "gallery.html");
fs.writeFileSync(file, html);
const total = groups.reduce((n, [, ids]) => n + ids.length, 0);
console.log(`gallery -> ${path.relative(root, file)}  (${total} command icons, ${features.length} feature icons, ${uis.length} ui glyphs)`);
if (problems.length) console.log(problems.join("\n"));

if (!args["no-shots"]) {
  const { chromium } = await import("playwright-core");
  const { browserOptions } = await import("./browser.mjs");
  const browser = await chromium.launch(browserOptions({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: Number(args.dsf) || 1.5 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => document.body.dataset.ready === "1", null, { timeout: 30000 });
  for (const c of chunkList) {
    const name = (filter ? `f-${filter}-` : "") + c.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/-+$/, "").toLowerCase();
    await page.locator(`#${c.id}`).screenshot({ path: path.join(shotDir, `${name}.png`) });
    console.log(`shot ${name}.png`);
  }
  if (errs.length) console.log("page errors:\n" + errs.join("\n"));
  await browser.close();
}
