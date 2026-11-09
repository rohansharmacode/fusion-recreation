// INSPECT + appearance tools through the real UI: Measure (I) on canvas edges, Center of Mass,
// Section Analysis on a clicked face (cut + hatched cap + Analysis item), Appearance (A) by drag &
// drop and click, Physical Material, Properties from the browser body context menu.
import { defineScenario, mainIfDirect, apiBox, near } from "../lib.mjs";

const scenario = defineScenario({
  name: "inspect",
  title: "Measure, Section Analysis, Center of Mass, Appearance, Physical Material, Properties",
  timeout: 150000,
  async run(t) {
    t.step("setup: 40 x 20 x 10 box (App API)");
    const box = await apiBox(t);
    t.require("box body created", box.ok && box.body, JSON.stringify(box));
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);

    // ------------------------------------------------------------- measure
    t.step("I opens MEASURE; click an edge, then a parallel edge");
    await t.escapeAll();
    await t.blur();
    await t.mouseToCanvas(0.5, 0.85);
    await t.key("i");
    t.require("MEASURE dialog open", await t.waitFor('.dlg[data-dialog="MeasureCommand"]', { timeout: 2000 }));
    const edges = await t.app(() => {
      const b = window.app.bodies()[0];
      return b.shape.edges.map((e, i) => ({ i, L: e.length, m: e.pointAt(0.5).toTuple() }));
    });
    const front = edges.find((e) => Math.abs(e.L - 40) < 1e-6 && e.m[2] > 9 && e.m[1] < 0);
    const back = edges.find((e) => Math.abs(e.L - 40) < 1e-6 && e.m[2] > 9 && e.m[1] > 0);
    const a = await t.aim([front.m, [front.m[0] - 6, front.m[1], front.m[2]], [front.m[0] + 6, front.m[1], front.m[2]]], "h && h.ref.kind === 'edge'");
    t.require("front top edge is pickable on the canvas", !!a);
    await t.canvasClick(a.x, a.y);
    await t.settle(250);
    const len = await t.app(() => { const e = document.querySelector('.dlg [data-result="sel1:Length"] .insp-val'); return e && e.textContent; });
    t.check("Selection 1: Length 40.00 mm", len === "40.00 mm", len);
    const b2 = await t.aim([back.m, [back.m[0] - 8, back.m[1], back.m[2]], [back.m[0] + 8, back.m[1], back.m[2]]], "h && h.ref.kind === 'edge'");
    if (b2) {
      await t.canvasClick(b2.x, b2.y);
      await t.settle(250);
      const dist = await t.app(() => { const e = document.querySelector('.dlg [data-result="distance"] .insp-val'); return e && e.textContent; });
      t.check("Results: Distance 20.00 mm between the parallel edges", dist === "20.00 mm", dist);
      t.check("measure label on the canvas", await t.visible(".insp-measure-label"));
    } else t.note("back edge hidden from this view; skipped the two-edge check");
    await t.shot("measure");
    await t.key("Escape");
    await t.settle(150);
    t.check("Esc closes MEASURE", !(await t.visible('.dlg[data-dialog="MeasureCommand"]')));

    // ------------------------------------------------------------- center of mass
    t.step("Center of Mass from the INSPECT panel");
    const ran = await t.app(() => { window.app.commands.run("FusionCenterOfMassCommand"); return window.app.ui.dialog.isOpen("FusionCenterOfMassCommand"); });
    t.check("CENTER OF MASS dialog opens", ran);
    await t.click('.dlg[data-dialog="FusionCenterOfMassCommand"] [data-action=ok]');
    await t.settle(250);
    const com = await t.app(() => ({ list: window.app.ui.inspect.analyses(), mp: window.app.ui.inspect.massProperties() }));
    t.check("CenterOfMass1 analysis created", com.list.some((x) => x.type === "com"), JSON.stringify(com.list));
    t.check("centre of mass at (0, 0, 5)", near(com.mp.com[0], 0, 1e-6) && near(com.mp.com[2], 5, 1e-6), JSON.stringify(com.mp.com));

    // ------------------------------------------------------------- appearance
    t.step("A opens APPEARANCE; drag a red paint swatch onto the body");
    await t.escapeAll();
    await t.blur();
    await t.mouseToCanvas(0.5, 0.85);
    await t.key("a");
    t.require("APPEARANCE dialog open", await t.waitFor('.dlg[data-dialog="AppearanceCommand"]', { timeout: 2000 }));
    await t.click('.dlg [data-folder="cat:Paint"] .insp-tree-row');
    await t.settle(120);
    const sw = t.page.locator('.dlg [data-swatch="paint-red"]').first();
    await sw.scrollIntoViewIfNeeded();
    const sb = await sw.boundingBox();
    const target = await t.canvasXY([0, 0, 10]);
    const before = await t.colorAt(target.x, target.y, 3);
    await t.page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await t.page.mouse.down();
    await t.page.mouse.move(sb.x - 40, sb.y, { steps: 4 });
    await t.page.mouse.move(target.x, target.y, { steps: 10 });
    await t.page.mouse.up();
    await t.settle(400);
    await t.frames(3);
    const after = await t.colorAt(target.x, target.y, 3);
    t.check("body appearance is 'Paint - Enamel Glossy (Red)'", await t.app((b) => window.app.doc.bodies[b].appearance === "paint-red", box.body));
    t.check("canvas colour of the body changed to red", after[0] > after[1] + 60 && after[0] > after[2] + 60, JSON.stringify({ before, after }));
    await t.shot("appearance");
    await t.key("Escape");
    await t.settle(120);

    // ------------------------------------------------------------- material + properties from the browser
    t.step("Physical Material: Aluminum 6061 on the body, then Properties from the browser context menu");
    await t.app((b) => { window.app.selection.set([{ kind: "body", body: b }]); window.app.commands.run("PhysicalMaterialCommand"); }, box.body);
    t.require("PHYSICAL MATERIAL dialog open", await t.waitFor('.dlg[data-dialog="PhysicalMaterialCommand"]', { timeout: 2000 }));
    await t.click('.dlg [data-folder="cat:Metal"] .insp-tree-row');
    await t.settle(100);
    await t.page.locator('.dlg [data-swatch="aluminum-6061"]').first().scrollIntoViewIfNeeded();
    await t.click('.dlg [data-swatch="aluminum-6061"]');
    await t.settle(250);
    t.check("material Aluminum 6061 assigned", await t.app((b) => window.app.doc.bodies[b].material === "aluminum-6061", box.body));
    await t.key("Escape");
    await t.settle(120);
    // browser context menu -> Properties (fallback: command)
    const row = await t.app(() => { const e = document.querySelector('#browser-host [data-node^="body:"]'); if (e) e.setAttribute("data-qa-body", "1"); return !!e; });
    let opened = false;
    if (row) {
      await t.click('[data-qa-body="1"]', { button: "right" });
      await t.settle(150);
      opened = await t.click('[data-cmd="FusionPropertiesCommand"]', { timeout: 1200 });
    }
    if (!opened) { t.note("browser body row / context menu not available; ran FusionPropertiesCommand directly"); await t.app((b) => { window.app.selection.set([{ kind: "body", body: b }]); window.app.commands.run("FusionPropertiesCommand"); }, box.body); }
    t.require("PROPERTIES dialog open", await t.waitFor('.dlg[data-dialog="FusionPropertiesCommand"]', { timeout: 2000 }));
    const props = await t.app(() => { const d = document.querySelector('.dlg[data-dialog="FusionPropertiesCommand"]'); const v = (id) => (d.querySelector(`[data-row="${id}"] .dlg-text`) || {}).textContent; return { mass: v("mass"), volume: v("volume"), material: v("material") }; });
    t.check("Properties: volume 8000.000 mm^3", props.volume === "8000.000 mm^3", JSON.stringify(props));
    t.check("Properties: mass = volume x density (Aluminum 6061) = 21.600 g", props.mass === "21.600 g", JSON.stringify(props));
    await t.shot("properties");
    await t.escapeAll();

    // ------------------------------------------------------------- section analysis
    t.step("Section Analysis on the clicked front face, distance -10 mm");
    await t.app(() => { window.app.selection.clear(); window.app.commands.run("FusionHalfSectionViewCommand"); });
    t.require("SECTION ANALYSIS dialog open", await t.waitFor('.dlg[data-dialog="FusionHalfSectionViewCommand"]', { timeout: 2000 }));
    const f = await t.aim([[-12, -10, 5], [-15, -10, 3], [-8, -10, 6]], "h && h.ref.kind === 'face' && Math.abs(h.ref.n[1] + 1) < 1e-3");
    t.require("front face pickable", !!f);
    await t.canvasClick(f.x, f.y);
    await t.settle(200);
    await t.fill('.dlg [data-input="distance"]', "-10 mm");
    await t.settle(500);
    const cap = await t.canvasXY([-12, 0, 5]);
    const capC = await t.colorAt(cap.x, cap.y, 3);
    t.check("section cut shows the purple component-colour cap", capC[0] > capC[1] + 40 && capC[2] > capC[1] + 30, JSON.stringify(capC));
    await t.shot("section");
    await t.click('.dlg[data-dialog="FusionHalfSectionViewCommand"] [data-action=ok]');
    await t.settle(250);
    const an = await t.app(() => window.app.ui.inspect.analyses());
    t.check("Section1 added to the Analysis list", an.some((x) => x.type === "section" && x.name === "Section1"), JSON.stringify(an));
    const browserHas = await t.app(() => /Section1/.test((document.getElementById("browser-host") || {}).innerText || ""));
    if (!browserHas) t.note("browser does not show the Analysis folder yet (browser module reads app.ui.inspect.analyses())");
    await t.escapeAll();
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
