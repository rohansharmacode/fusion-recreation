// Viewport inside the full app (all modules): sketch -> extrude via the App API, hover/select a
// face, marking menu over the canvas, ViewCube click, idle rendering stays at 0 fps.
//   node tests/e2e/viewport_integration.mjs
import { launch } from "./harness.mjs";

const h = await launch({ outDir: process.env.VP_OUT || "build/viewport-all", port: Number(process.env.VP_PORT) || 5311, shots: process.env.VP_SHOTS || "tests/e2e/out/viewport" });
const { page } = h;
let fails = 0;
const check = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` - ${extra}` : ""}`); if (!cond) fails++; };
try {
  await page.waitForTimeout(500);
  const idle = async () => {
    const f0 = await page.evaluate(() => app.viewport.stats.frames);
    await page.waitForTimeout(700);
    return (await page.evaluate(() => app.viewport.stats.frames)) - f0;
  };
  check("idle: no renders", (await idle()) === 0);
  const r = await page.evaluate(() => {
    const sk = app.S.newSketch();
    app.S.addRect2pt(sk, [-20, -15], [20, 15]);
    const s = app.addFeature({ type: "sketch", plane: app.K.ORIGIN_PLANES.XY, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
    const st = app.sketchState(s.id);
    const reg = st && st.regions && (st.regions.regions || st.regions)[0];
    const e = app.addFeature({ type: "extrude", profiles: [{ sketch: s.id, key: reg.key, c: [0, 0] }], distance: "15 mm", dirType: "one", extent: "distance", operation: "new" });
    const res = app.featureResult(e.id);
    app.viewport.fit({ animate: false });
    return { ok: !!(res && res.ok), bodies: app.bodies().length };
  });
  check("sketch + extrude", r.ok && r.bodies === 1, JSON.stringify(r));
  await page.waitForTimeout(1000);
  const n = await idle();
  check("idle after model: render loop settles", n <= 1, `${n} frames in 0.7 s`);
  const box = await page.locator("#canvas-host canvas").boundingBox();
  const s = await page.evaluate(() => app.viewport.toScreen([5, 5, 15]));
  await page.mouse.move(box.x + s[0], box.y + s[1], { steps: 3 });
  await page.waitForTimeout(100);
  check("hover top face", await page.evaluate(() => app.selection.hover && app.selection.hover.kind === "face"));
  await page.mouse.click(box.x + s[0], box.y + s[1]);
  await page.waitForTimeout(100);
  check("click selects face", await page.evaluate(() => app.selection.items.length === 1 && app.selection.items[0].kind === "face"));
  await h.shot("60-full-selected-face");
  await page.mouse.click(box.x + s[0], box.y + s[1], { button: "right" });
  await page.waitForTimeout(300);
  await h.shot("61-full-marking-menu");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const pt = await page.evaluate(() => { const c = app.viewport.viewCube; const T = app.viewport.THREE; const p = new T.Vector3(0, 0, 1).project(c.camera); const rr = c.canvas.getBoundingClientRect(); return [rr.left + (p.x + 1) / 2 * rr.width, rr.top + (1 - p.y) / 2 * rr.height]; });
  await page.mouse.move(pt[0], pt[1], { steps: 3 });
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForTimeout(600);
  const d = await page.evaluate(() => { const v = new app.viewport.THREE.Vector3(); app.viewport.camera.getWorldDirection(v); return v.z; });
  check("ViewCube TOP click", d < -0.999, String(d));
  await h.shot("62-full-top");
  console.log("errors:", h.errors.length ? h.errors.join("\n") : "none");
  check("no console errors", h.errors.length === 0);
} catch (e) { console.error(e); fails++; } finally { await h.close(); }
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exitCode = fails ? 1 : 0;
