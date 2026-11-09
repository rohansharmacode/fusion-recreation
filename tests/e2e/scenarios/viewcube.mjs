// ViewCube: click the FRONT face -> camera looks from -Y (Z up). Also TOP via a second click,
// drag-to-orbit, and the standard view API agreeing with the cube.
import { defineScenario, mainIfDirect, apiBox, fmt } from "../lib.mjs";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Page coords of a cube face centre on the ViewCube canvas, assuming the cube is centred in its canvas and
 *  mirrors the main camera orientation; `k` = cube half-size as a fraction of the canvas size. */
async function faceOnCube(t, faceDir, k) {
  const cam = await t.camera();
  const box = await t.box("#viewcube-host canvas");
  if (!box) return null;
  const s = Math.min(box.width, box.height) * k;
  const sx = dot(faceDir, cam.right), sy = dot(faceDir, cam.up);
  return { x: box.x + box.width / 2 + sx * s, y: box.y + box.height / 2 - sy * s, box };
}

const scenario = defineScenario({
  name: "viewcube",
  title: "ViewCube face click -> standard view",
  async run(t) {
    await apiBox(t, { L: "40 mm", W: "20 mm", H: "10 mm" });
    t.require("ViewCube canvas exists (#viewcube-host canvas)", await t.visible("#viewcube-host canvas"));
    const vb = await t.box("#viewcube-host canvas");
    t.check("ViewCube is in the top-right corner", vb && vb.x > 1600 * 0.75 && vb.y < 900 * 0.35, JSON.stringify(vb));
    t.check("ViewCube size is ~80–160 px", vb && vb.width >= 70 && vb.width <= 200, vb && `${vb.width}x${vb.height}`);

    // ---------- FRONT ----------
    t.step("click FRONT on the ViewCube");
    let front = false, attempt = 0, lastDir = null;
    for (const k of [0.27, 0.2, 0.34]) {
      attempt++;
      await t.setView("home");
      await t.shot(`home-before-front-${attempt}`);
      const p = await faceOnCube(t, [0, -1, 0], k);
      if (!p) break;
      await t.page.mouse.move(p.x, p.y, { steps: 3 });
      await t.frames(3);
      if (attempt === 1) await t.shot("hover-front");
      await t.page.mouse.click(p.x, p.y);
      await t.settle(150);
      await t.cameraStable(3000);
      const c = await t.camera();
      lastDir = c.dir;
      if (c.dir[1] > 0.995) { front = true; break; }
      t.note(`attempt ${attempt} (k=${k}) gave view dir ${c.dir.map((v) => fmt(v, 3))}`);
    }
    await t.shot("after-front");
    t.check("FRONT click: camera looks from -Y towards +Y (dir ≈ [0,1,0])", front, `last dir=${lastDir && lastDir.map((v) => fmt(v, 3))}`);
    if (front) {
      const c = await t.camera();
      t.check("FRONT view keeps Z up (camera up ≈ +Z)", c.up[2] > 0.99, `up=${c.up.map((v) => fmt(v, 3))}`);
      t.check("FRONT view: +X points right on screen", c.right[0] > 0.99, `right=${c.right.map((v) => fmt(v, 3))}`);
      if (attempt > 1) t.note(`FRONT face hit on attempt ${attempt} (cube not at the default size/position)`);
    }

    // ---------- animated transition ----------
    t.step("transition is animated (camera moves over several frames)");
    await t.setView("home");
    const p2 = await faceOnCube(t, [0, -1, 0], 0.27);
    if (p2) {
      await t.page.mouse.click(p2.x, p2.y);
      const mid = await t.app(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const vp = window.app.viewport, c = vp.camera, tg = vp.target;
        const d = [tg[0] - c.position.x, tg[1] - c.position.y, tg[2] - c.position.z];
        const L = Math.hypot(...d); r(d.map((v) => v / L));
      }))));
      await t.cameraStable(3000);
      const end = await t.camera();
      const midAng = Math.acos(Math.max(-1, Math.min(1, dot(mid, end.dir)))) * 180 / Math.PI;
      t.check("view change is animated (2 frames in, not yet at the final direction)", midAng > 1, `${fmt(midAng, 2)}° from the final direction; mid=${mid.map((v) => fmt(v, 3))} end=${end.dir.map((v) => fmt(v, 3))}`);
    }

    // ---------- TOP from FRONT ----------
    t.step("click TOP on the ViewCube from the home view");
    await t.setView("home");
    const pt = await faceOnCube(t, [0, 0, 1], 0.27);
    if (pt) {
      await t.page.mouse.click(pt.x, pt.y);
      await t.settle(100);
      await t.cameraStable(3000);
      const c = await t.camera();
      t.check("TOP click: camera looks down -Z", c.dir[2] < -0.995, `dir=${c.dir.map((v) => fmt(v, 3))}`);
      t.check("TOP view: +Y up on screen (FRONT at the bottom)", c.up[1] > 0.99, `up=${c.up.map((v) => fmt(v, 3))}`);
      await t.shot("after-top");
    }

    // ---------- drag orbit ----------
    t.step("drag on the ViewCube orbits the camera");
    await t.setView("home");
    const before = await t.camera();
    const b = await t.box("#viewcube-host canvas");
    if (b) {
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      await t.page.mouse.move(cx, cy);
      await t.page.mouse.down();
      await t.page.mouse.move(cx + 25, cy + 4, { steps: 6 });
      await t.page.mouse.move(cx + 50, cy + 8, { steps: 6 });
      await t.page.mouse.up();
      await t.cameraStable(2000);
      const after = await t.camera();
      const ang = Math.acos(Math.max(-1, Math.min(1, dot(before.dir, after.dir)))) * 180 / Math.PI;
      t.check("dragging the cube rotates the view by > 10°", ang > 10, `rotated ${fmt(ang)}°`);
      t.check("drag did not snap to a standard view by accident", Math.abs(after.dir[1]) < 0.995 && Math.abs(after.dir[2]) < 0.995, `dir=${after.dir.map((v) => fmt(v, 3))}`);
      await t.shot("after-drag");
    }

    // ---------- API agreement ----------
    t.step("standard view API matches the Z-up convention");
    const views = {};
    for (const v of ["front", "right", "top", "home"]) { await t.setView(v); views[v] = await t.camera(); }
    t.check("setView('front') looks along +Y", views.front.dir[1] > 0.995, views.front.dir.map((v) => fmt(v, 3)).join(","));
    t.check("setView('right') looks along -X (from +X)", views.right.dir[0] < -0.995, views.right.dir.map((v) => fmt(v, 3)).join(","));
    t.check("setView('top') looks along -Z", views.top.dir[2] < -0.995, views.top.dir.map((v) => fmt(v, 3)).join(","));
    const hd = views.home.dir;
    t.check("home is iso from (+x, -y, +z)", hd[0] < -0.3 && hd[1] > 0.3 && hd[2] < -0.3, hd.map((v) => fmt(v, 3)).join(","));
    await t.shot("home-final");

    // ---------- context menu ----------
    t.step("right-click the ViewCube");
    if (b) {
      await t.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: "right" });
      await t.settle(250);
      const txt = await t.overlayText();
      t.check("ViewCube context menu offers Go Home / Orthographic / Perspective", /Home/i.test(txt) && /Orthographic/i.test(txt) && /Perspective/i.test(txt), txt.replace(/\s+/g, " ").slice(0, 160));
      await t.shot("viewcube-menu");
      await t.escapeAll();
    }
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
