// Sketch environment with every module: toolbar Create Sketch -> rectangle -> Finish -> Extrude ->
// edit the sketch from the timeline -> change a dimension -> body updates.
//   node tests/e2e/sketch-integration.mjs
import { launch } from "./harness.mjs";

const h = await launch({ only: process.env.E2E_ONLY || undefined, outDir: process.env.E2E_OUT || "build/sketch-all", port: Number(process.env.E2E_PORT) || 5314, shots: process.env.E2E_SHOTS || "tests/e2e/out/sketch", build: !process.argv.includes("--nobuild") });
const { page } = h;
let fails = 0;
const check = (cond, msg, extra) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}${extra !== undefined ? "  " + JSON.stringify(extra) : ""}`); if (!cond) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const P = (u, v) => page.evaluate(([u, v]) => { const s = app.sketchState(app.activeSketch); const q = app.viewport.toScreen(app.K.toWorld(s.plane, u, v)); const r = app.viewport.canvas.getBoundingClientRect(); return [r.left + q[0], r.top + q[1]]; }, [u, v]);
async function clickAt(u, v) { const p = await P(u, v); await page.mouse.move(p[0], p[1], { steps: 3 }); await page.mouse.click(p[0], p[1]); await h.frames(1); }

try {
  await h.frames(5);
  await h.shot("i01-start");
  const btn = await page.$('#toolbar [data-cmd="SketchCreate"]');
  check(!!btn, "toolbar has a Create Sketch button");
  if (btn) await btn.click(); else await page.evaluate(() => app.commands.run("SketchCreate"));
  await h.frames(4);
  const xy = await page.evaluate(() => {
    const r = app.viewport.canvas.getBoundingClientRect();
    for (let y = 20; y < r.height - 20; y += 10) for (let x = 20; x < r.width - 20; x += 10) {
      const hit = app.viewport.pick(x, y, { filter: (q) => q.kind === "originPlane" });
      if (hit && hit.ref.name === "XY") return [r.left + x, r.top + y];
    }
    return null;
  });
  check(!!xy, "XY plane found");
  await page.mouse.move(xy[0], xy[1], { steps: 3 });
  await page.mouse.click(xy[0], xy[1]);
  await wait(600);
  check(await page.evaluate(() => app.mode === "sketch"), "in sketch mode");
  await h.shot("i02-sketch-mode");
  const tab = await page.evaluate(() => { const t = document.querySelector('[data-tab="SketchTab"]'); return t ? getComputedStyle(t).display !== "none" : null; });
  console.log("     sketch tab visible:", tab);
  await page.keyboard.press("r");
  await clickAt(0, 0);
  const c = await P(30, 20);
  await page.mouse.move(c[0], c[1], { steps: 6 });
  await page.keyboard.type("20"); // height box first (as in Fusion), Tab -> width
  await page.keyboard.press("Tab");
  await page.keyboard.type("40");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await h.frames(3);
  const info = await page.evaluate(() => { const s = app.sketchState(app.activeSketch); return { regions: s.regions.regions.length, fully: s.status.fully }; });
  check(info.regions === 1 && info.fully, "fully constrained 40 x 20 rectangle", info);
  await h.shot("i03-rect");
  // finish via the toolbar if available
  const fin = await page.$('#toolbar [data-cmd="SketchStop"]');
  if (fin && (await fin.isVisible())) await fin.click(); else await page.evaluate(() => app.commands.run("SketchStop"));
  await h.frames(3);
  check(await page.evaluate(() => app.mode === "model"), "Finish Sketch");
  await h.shot("i04-finished");
  // extrude
  await page.mouse.move(400, 400);
  await page.keyboard.press("e");
  await wait(400);
  const dlg = await page.evaluate(() => !!document.querySelector('.dlg[data-dialog="Extrude"]'));
  check(dlg, "Extrude dialog opens with E");
  await h.shot("i05-extrude-dialog");
  if (dlg) {
    const profiles = await page.evaluate(() => app.selection.items.filter((r) => r.kind === "profile").length);
    console.log("     selected profiles:", profiles);
    // Fusion opens Extrude with Distance 0 and OK disabled: type the distance into the focused box first
    const din = await page.$('.dlg[data-dialog="Extrude"] [data-input="distance"]');
    if (din) { await din.click({ clickCount: 3 }).catch(() => {}); }
    await page.keyboard.press("Control+A");
    await page.keyboard.type("10 mm");
    await page.keyboard.press("Tab");
    await wait(200);
    const ok = await page.$('.dlg[data-dialog="Extrude"] [data-action="ok"]');
    if (ok) await ok.click({ timeout: 5000 }).catch(async () => { await page.keyboard.press("Enter"); });
    await wait(400);
  }
  const bodies = await page.evaluate(() => app.bodies().length);
  check(bodies === 1, "extrude made a body", bodies);
  await h.frames(3);
  await h.shot("i06-extruded");
  // edit the sketch from the timeline (double-click) and change a dimension
  const sk = await page.evaluate(() => app.doc.features.find((f) => f.type === "sketch").id);
  const item = await page.$(`[data-feature="${sk}"]`);
  check(!!item, "timeline item for the sketch");
  if (item) await item.dblclick(); else await page.evaluate((id) => app.editFeature(id), sk);
  await wait(600);
  const st = await page.evaluate(() => ({ mode: app.mode, marker: app.doc.marker, n: app.doc.features.length, bodies: app.bodies().length }));
  check(st.mode === "sketch" && st.marker === 1, "editing the sketch rolls the timeline back to it", st);
  await h.shot("i07-edit-sketch");
  await page.evaluate(() => {
    const s = app.sketchState(app.activeSketch);
    const c = s.sk.constraints.find((k) => k.type === "distance" && /40/.test(k.expr));
    app.mutate("Edit Dimension", (doc) => { const f = doc.features.find((x) => x.id === app.activeSketch); f.sk.constraints.find((k) => k.id === c.id).expr = "60 mm"; });
  });
  await page.evaluate(() => app.commands.run("SketchStop"));
  await wait(300);
  const after = await page.evaluate(() => ({ mode: app.mode, marker: app.doc.marker, n: app.doc.features.length, vol: app.bodies().length ? app.K.R.measureVolume(app.bodies()[0].shape) : 0 }));
  check(after.mode === "model" && after.marker === after.n, "finishing restores the timeline marker", after);
  console.log("     body volume after edit:", after.vol.toFixed(1));
  await h.frames(3);
  await h.shot("i08-after-edit");
  // undo the dimension edit
  await page.keyboard.press("Control+z");
  await wait(300);
  const und = await page.evaluate(() => ({ mode: app.mode, marker: app.doc.marker, n: app.doc.features.length, vol: app.bodies().length ? app.K.R.measureVolume(app.bodies()[0].shape) : 0 }));
  console.log("     after undo:", JSON.stringify(und));
  check(und.marker === und.n, "undo after finishing keeps the full timeline", und);
  if (h.errors.length) console.log("page errors:\n" + h.errors.slice(0, 10).join("\n"));
  check(h.errors.length === 0, "no console errors", h.errors.length);
} catch (e) {
  console.error(e);
  fails++;
  try { await h.shot("zz-int-error"); } catch { /* ignore */ }
} finally {
  await h.close();
}
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exitCode = fails ? 1 : 0;
