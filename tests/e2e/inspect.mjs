// E2E test for the inspect module: Measure (I), Section Analysis, Center of Mass, Appearance (A),
// Physical Material, Properties.
//   node tests/e2e/inspect.mjs [--only=viewport,dialogs,inspect] [--headed] [--no-build]
import { launch } from "./harness.mjs";

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1];
const h = await launch({
  only: arg("only") || undefined,
  outDir: "build/inspect", port: Number(arg("port")) || 5338, shots: "tests/e2e/out/inspect",
  width: 1389, height: 795, headless: !process.argv.includes("--headed"), build: !process.argv.includes("--no-build"),
});
const { page } = h;
const results = [];
const check = (name, cond, info) => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};
const wait = (ms) => page.waitForTimeout(ms);
const near = (a, b, tol = 1e-3) => Number.isFinite(a) && Math.abs(a - b) <= tol;
async function settle(ms = 300) { await wait(ms); await h.frames(3); }
const dlgOpen = (id) => page.evaluate((i) => !!document.querySelector(`.dlg[data-dialog="${i}"]`), id);
/** page coords of a world point */
const screen = (p) => page.evaluate((p) => { const s = app.viewport.toScreen(p); const r = app.viewport.canvas.getBoundingClientRect(); return [s[0] + r.left, s[1] + r.top]; }, p);
/** average canvas colour around a world point (WebGL buffer is preserved) */
const colorAt = (p, rad = 3) => page.evaluate(({ p, rad }) => {
  const c = app.viewport.canvas;
  const s = app.viewport.toScreen(p);
  const k = c.width / c.clientWidth;
  const cv = document.createElement("canvas");
  cv.width = c.width; cv.height = c.height;
  const g = cv.getContext("2d");
  g.drawImage(c, 0, 0);
  const d = g.getImageData(Math.round(s[0] * k) - rad, Math.round(s[1] * k) - rad, rad * 2 + 1, rad * 2 + 1).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  return [Math.round(r / n), Math.round(gg / n), Math.round(b / n)];
}, { p, rad });
const resultText = (key) => page.evaluate((k) => { const e = document.querySelector(`.dlg[data-dialog="MeasureCommand"] [data-result="${k}"] .insp-val`); return e ? e.textContent : null; }, key);
const edgeRef = (pred) => page.evaluate((src) => {
  const b = app.bodies()[0]; const f = new Function("e", `return (${src})(e)`);
  const list = b.shape.edges.map((e, i) => ({ i, L: e.length, m: e.pointAt(0.5).toTuple(), t: e.geomType }));
  const e = list.find((x) => f(x));
  return e ? { kind: "edge", body: b.id, index: e.i, p: e.m } : null;
}, pred.toString());

try {
  // ---------------------------------------------------------------- setup
  const setup = await page.evaluate(() => {
    const f = app.addFeature({ type: "box", length: "40 mm", width: "20 mm", height: "10 mm", center: [0, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
    app.viewport.fit({ animate: false });
    return { body: f.newBody, ok: !!(app.featureResult(f.id) || {}).ok };
  });
  check("setup: 40x20x10 box body", setup.ok && setup.body, setup);
  await settle(300);

  // ---------------------------------------------------------------- measure
  await page.mouse.move(700, 650);
  await page.keyboard.press("i");
  await settle(250);
  check("I opens MEASURE (MeasureCommand)", await dlgOpen("MeasureCommand"));
  check("app.activeCommand = MeasureCommand", await page.evaluate(() => app.activeCommand && app.activeCommand.id === "MeasureCommand"));
  const labels = await page.evaluate(() => [...document.querySelectorAll('.dlg[data-dialog="MeasureCommand"] .dlg-label')].filter((e) => e.offsetParent).map((e) => e.textContent));
  check("measure rows: Selection Filter, Precision, Secondary Units, Show Snap Points", ["Selection Filter", "Precision", "Secondary Units", "Show Snap Points"].every((l) => labels.includes(l)), labels);
  check("default precision is 0.12", await page.evaluate(() => document.querySelector('.dlg [data-input="precision"]').dataset.value === "2"));
  check("footer: Close (no OK)", await page.evaluate(() => { const d = document.querySelector('.dlg[data-dialog="MeasureCommand"]'); return d.querySelector("[data-action=cancel]").textContent === "Close" && d.querySelector("[data-action=ok]").offsetParent === null; }));
  // click the top front 40 mm edge on the canvas
  const top = await edgeRef((e) => Math.abs(e.L - 40) < 1e-6 && e.m[2] > 9 && e.m[1] < 0);
  const tp = await screen(top.p);
  await page.mouse.move(tp[0], tp[1]);
  await settle(120);
  await page.mouse.click(tp[0], tp[1]);
  await settle(300);
  let sel = await page.evaluate(() => (app.ui.dialog.current.values.sel || []).map((r) => r.kind));
  check("canvas click picks the edge as Selection 1", sel.length === 1 && sel[0] === "edge", sel);
  check("edge Length = 40.00 mm", (await resultText("sel1:Length")) === "40.00 mm", await resultText("sel1:Length"));
  check("canvas label shows the edge length", await page.evaluate(() => [...document.querySelectorAll(".insp-measure-label")].some((e) => e.textContent === "40.00 mm")));
  check("status text reports the selection", /Length : 40\.00 mm/.test(await page.evaluate(() => app.status)), await page.evaluate(() => app.status));
  await h.shot("measure-edge");
  // precision 0.123 through the dropdown
  await page.click('.dlg [data-input="precision"]');
  await settle(100);
  await page.click('.dlg-dd-menu [data-option="3"]');
  await settle(200);
  check("precision 0.123 -> 40.000 mm", (await resultText("sel1:Length")) === "40.000 mm", await resultText("sel1:Length"));
  // second selection: the vertical edge at (20,-10)
  const vert = await edgeRef((e) => Math.abs(e.L - 10) < 1e-6 && e.m[0] > 19 && e.m[1] < -9);
  await page.evaluate((r) => app.ui.dialog.current.pickRef("sel", r), vert);
  await settle(250);
  check("two edges: Distance 0.000 mm (they meet)", (await resultText("distance")) === "0.000 mm", await resultText("distance"));
  check("two edges: Angle 90.0 deg", /^90\.0+ deg$/.test(await resultText("angle") || ""), await resultText("angle"));
  // parallel opposite edge -> distance 20
  const back = await edgeRef((e) => Math.abs(e.L - 40) < 1e-6 && e.m[2] > 9 && e.m[1] > 0);
  await page.evaluate((r) => { const d = app.ui.dialog.current; d.setSelection("sel", []); d.pickRef("sel", r); }, top);
  await page.evaluate((r) => app.ui.dialog.current.pickRef("sel", r), back);
  await settle(250);
  check("parallel edges 20 mm apart: Distance 20.000 mm", (await resultText("distance")) === "20.000 mm", await resultText("distance"));
  check("XYZ delta: Y Delta 20.000 mm", (await resultText("dy")) === "20.000 mm", await resultText("dy"));
  check("measure line drawn on the canvas", await page.evaluate(() => { const g = app.viewport.groups.overlay.children.find((c) => c.name === "inspect-measure"); return !!g && g.children.length >= 1; }));
  await h.shot("measure-pair");
  // body filter -> face/area of the body
  await page.click('.dlg [data-input="filter"] [data-option="body"]');
  await settle(150);
  await page.evaluate((b) => app.ui.dialog.current.pickRef("sel", { kind: "body", body: b }), setup.body);
  await settle(250);
  check("Body filter: body Area = 2800.000 mm^2", (await resultText("sel1:Area")) === "2800.000 mm^2", await resultText("sel1:Area"));
  await page.keyboard.press("Escape");
  await settle(150);
  check("Esc closes MEASURE and clears its overlay + status", !(await dlgOpen("MeasureCommand")) && (await page.evaluate(() => !document.querySelector(".insp-measure-label") && app.status === "")));

  // ---------------------------------------------------------------- center of mass
  await page.evaluate(() => app.commands.run("FusionCenterOfMassCommand"));
  await settle(250);
  check("Center of Mass dialog opens with the root bodies preselected", await page.evaluate(() => app.ui.dialog.isOpen("FusionCenterOfMassCommand") && (app.ui.dialog.current.values.objects || []).length === 1));
  await page.click('.dlg[data-dialog="FusionCenterOfMassCommand"] [data-action=ok]');
  await settle(250);
  const com = await page.evaluate(() => ({ list: app.ui.inspect.analyses(), mp: app.ui.inspect.massProperties(), glyph: !!app.viewport.groups.overlay.children.find((c) => c.name === "inspect-com" && c.children.length) }));
  check("CoM analysis added (CenterOfMass1)", com.list.some((a) => a.type === "com" && a.name === "CenterOfMass1"), com.list);
  check("CoM = (0, 0, 5)", near(com.mp.com[0], 0, 1e-6) && near(com.mp.com[1], 0, 1e-6) && near(com.mp.com[2], 5, 1e-6), com.mp.com);
  check("CoM glyph drawn", com.glyph);
  await h.shot("com");

  // ---------------------------------------------------------------- appearance
  await page.mouse.move(700, 650);
  await page.keyboard.press("a");
  await settle(250);
  check("A opens APPEARANCE", await dlgOpen("AppearanceCommand"));
  const apUi = await page.evaluate(() => { const d = document.querySelector('.dlg[data-dialog="AppearanceCommand"]'); return { text: d.innerText, folders: [...d.querySelectorAll("[data-folder^='cat:']")].map((e) => e.dataset.folder.slice(4)), close: d.querySelector("[data-action=cancel]").textContent }; });
  check("appearance panel: Apply To, In This Design, Library", /Apply To:/.test(apUi.text) && /In This Design/.test(apUi.text) && /Library/.test(apUi.text) && /Fusion Appearance Library/.test(apUi.text), apUi.text.slice(0, 160));
  check("library folders Metal, Plastic, Glass, Paint, Wood", ["Metal", "Plastic", "Glass", "Paint", "Wood"].every((c) => apUi.folders.includes(c)), apUi.folders);
  check("library has ~40+ appearances", await page.evaluate(() => Object.keys(app.ui.inspect.appearances).length >= 40));
  const before = await colorAt([0, 0, 10]);
  await page.click('.dlg [data-folder="cat:Paint"] .insp-tree-row');
  await settle(150);
  const red = page.locator('.dlg [data-swatch="paint-red"]').first();
  await red.scrollIntoViewIfNeeded();
  const rb = await red.boundingBox();
  const dropAt = await screen([0, 0, 10]);
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x - 40, rb.y + 10, { steps: 4 });
  await page.mouse.move(dropAt[0], dropAt[1], { steps: 8 });
  await page.mouse.up();
  await settle(400);
  const after = await colorAt([0, 0, 10]);
  check("drag 'Paint - Enamel Glossy (Red)' onto the body sets its appearance", await page.evaluate((b) => app.doc.bodies[b].appearance === "paint-red", setup.body));
  check("canvas colour of the body turns red", after[0] > after[1] + 60 && after[0] > after[2] + 60, { before, after });
  check("'In This Design' lists the new appearance", await page.evaluate(() => !!document.querySelector('.dlg [data-list="inDesign"] [data-swatch="paint-red"]')));
  await h.shot("appearance-red");
  // click a swatch, then click a body
  await page.click('.dlg [data-swatch="paint-blue"]');
  await settle(100);
  await page.mouse.click(dropAt[0], dropAt[1]);
  await settle(350);
  check("click swatch + click body applies 'Paint - Enamel Glossy (Blue)'", await page.evaluate((b) => app.doc.bodies[b].appearance === "paint-blue", setup.body));
  await page.keyboard.press("Escape");
  await settle(100);
  check("Esc closes APPEARANCE (assignments stay)", !(await dlgOpen("AppearanceCommand")) && (await page.evaluate((b) => app.doc.bodies[b].appearance === "paint-blue", setup.body)));
  await page.keyboard.press("Control+z");
  await settle(300);
  check("Ctrl+Z undoes the last appearance assignment (back to red)", await page.evaluate((b) => app.doc.bodies[b].appearance === "paint-red", setup.body));

  // ---------------------------------------------------------------- physical material + properties
  await page.evaluate((b) => { app.ui.dialog.cancel(); app.selection.set([{ kind: "body", body: b }]); app.commands.run("PhysicalMaterialCommand"); }, setup.body);
  await settle(250);
  check("PHYSICAL MATERIAL opens", await dlgOpen("PhysicalMaterialCommand"));
  check("material library lists names from PhysicalMaterials.xml", await page.evaluate(() => ["Aluminum 6061", "ABS Plastic", "Stainless Steel", "Wood (Oak)", "Titanium"].every((n) => Object.values(app.ui.inspect.materials).some((m) => m.name === n))));
  await page.click('.dlg [data-folder="cat:Metal"] .insp-tree-row');
  await settle(100);
  await page.locator('.dlg [data-swatch="aluminum-6061"]').first().scrollIntoViewIfNeeded();
  await page.click('.dlg [data-swatch="aluminum-6061"]');
  await settle(300);
  const mat = await page.evaluate((b) => app.doc.bodies[b], setup.body);
  check("click 'Aluminum 6061' with the body preselected assigns the material", mat.material === "aluminum-6061", mat);
  check("appearance override is kept (Fusion: overrides win over the material look)", mat.appearance === "paint-red", mat.appearance);
  await page.keyboard.press("Escape");
  await settle(100);
  await page.evaluate((b) => { app.selection.set([{ kind: "body", body: b }]); app.commands.run("FusionPropertiesCommand"); }, setup.body);
  await settle(300);
  const props = await page.evaluate(() => { const d = document.querySelector('.dlg[data-dialog="FusionPropertiesCommand"]'); const v = (id) => { const r = d.querySelector(`[data-row="${id}"] .dlg-text`); return r ? r.textContent : null; }; return { mass: v("mass"), volume: v("volume"), density: v("density"), material: v("material"), com: v("com"), len: v("bboxLength"), ixx: d.querySelector('[data-tensor="inertiaCom"] [data-i="Ixx"]')?.textContent }; });
  check("PROPERTIES: material Aluminum 6061", props.material === "Aluminum 6061", props);
  check("PROPERTIES: volume 8000.000 mm^3", props.volume === "8000.000 mm^3", props.volume);
  check("PROPERTIES: mass = volume x density = 21.600 g", props.mass === "21.600 g", props.mass);
  check("PROPERTIES: bounding box length 40.000 mm", props.len === "40.000 mm", props.len);
  check("PROPERTIES: Ixx at CoM = m(w^2+h^2)/12 = 900.000", /900\.000$/.test(props.ixx || ""), props.ixx);
  check("Properties aliases registered (Properties / properties / PropertiesCommand)", await page.evaluate(() => ["Properties", "properties", "PropertiesCommand"].every((id) => app.commands.has(id))));
  await h.shot("properties");
  await page.keyboard.press("Escape");
  await settle(100);

  // ---------------------------------------------------------------- section analysis
  const pre = await colorAt([0, -10, 5]);
  await page.evaluate(() => { app.selection.clear(); app.commands.run("FusionHalfSectionViewCommand"); });
  await settle(250);
  check("SECTION ANALYSIS opens", await dlgOpen("FusionHalfSectionViewCommand"));
  // click the front face (y = -10) on the canvas
  const fp = await screen([-12, -10, 5]);
  await page.mouse.move(fp[0], fp[1]);
  await settle(100);
  await page.mouse.click(fp[0], fp[1]);
  await settle(300);
  const picked = await page.evaluate(() => (app.ui.dialog.current.values.plane || []).map((r) => r.kind));
  check("canvas click picks the planar face as the cut plane", picked.length === 1 && picked[0] === "face", picked);
  await page.fill('.dlg [data-input="distance"]', "-10 mm");
  await page.dispatchEvent('.dlg [data-input="distance"]', "change");
  await settle(500);
  const clip = await page.evaluate(() => app.ui.inspect.clipping);
  check("live preview clips the bodies at y = 0", clip && near(clip.normal[1], 1, 1e-6) && near(clip.constant, 0, 1e-6), clip);
  const capC = await colorAt([-12, 0, 5]);
  check("cut face shows the component colour cap (purple + hatch)", capC[0] > capC[1] + 40 && capC[2] > capC[1] + 30, { pre, capC });
  await h.shot("section-preview");
  await page.click('.dlg[data-dialog="FusionHalfSectionViewCommand"] [data-action=ok]');
  await settle(300);
  const an = await page.evaluate(() => app.ui.inspect.analyses());
  check("OK adds 'Section1' to the analyses (browser Analysis folder)", an.some((a) => a.type === "section" && a.name === "Section1" && a.visible), an);
  check("section stays active after OK", !!(await page.evaluate(() => app.ui.inspect.clipping)));
  await page.evaluate(() => { const a = app.ui.inspect.analyses().find((x) => x.type === "section"); app.ui.inspect.setAnalysisVisible(a.id, false); });
  await settle(250);
  check("hiding the analysis removes the cut", !(await page.evaluate(() => app.ui.inspect.clipping)));
  await page.keyboard.press("Control+z");
  await settle(250);
  check("Ctrl+Z restores the visible section", !!(await page.evaluate(() => app.ui.inspect.clipping)));
  await h.shot("section-after");

  check("no console errors", h.errors.length === 0, h.errors.slice(0, 5));
} catch (e) {
  console.error(e);
  await h.shot("zz-failure").catch(() => {});
  check("test script ran to completion", false, String(e && e.message));
} finally {
  await h.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
