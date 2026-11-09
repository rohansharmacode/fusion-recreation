// Canvas navigation with Fusion's default mouse scheme (MMB pan, Shift+MMB orbit, wheel zoom to cursor,
// double-MMB fit) and the navigation bar (Orbit, Look At, Pan, Zoom, Fit, Display Settings, Grid and Snaps).
import { defineScenario, mainIfDirect, apiBox, fmt } from "../lib.mjs";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const angle = (a, b) => (Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180) / Math.PI;

const scenario = defineScenario({
  name: "navigation",
  title: "Mouse navigation + navigation bar",
  async run(t) {
    await apiBox(t, { L: "40 mm", W: "20 mm", H: "10 mm" });
    await t.setView("home");
    const c = await t.mouseToCanvas(0.5, 0.5);

    t.step("MMB drag pans");
    let a = await t.camera();
    await t.page.mouse.down({ button: "middle" });
    await t.page.mouse.move(c.x + 120, c.y + 40, { steps: 8 });
    await t.page.mouse.up({ button: "middle" });
    await t.cameraStable(1500);
    let b = await t.camera();
    t.check("MMB drag moves the view (target moves)", dist(a.target, b.target) > 1, `target moved ${fmt(dist(a.target, b.target), 2)} mm`);
    t.check("MMB pan keeps the view direction", angle(a.dir, b.dir) < 0.5, `rotated ${fmt(angle(a.dir, b.dir), 2)}°`);
    t.check("no selection/command side effects from MMB", (await t.state()).selection.length === 0);

    t.step("Shift+MMB drag orbits");
    a = b;
    await t.page.keyboard.down("Shift");
    await t.page.mouse.move(c.x, c.y);
    await t.page.mouse.down({ button: "middle" });
    await t.page.mouse.move(c.x + 150, c.y + 30, { steps: 10 });
    await t.page.mouse.up({ button: "middle" });
    await t.page.keyboard.up("Shift");
    await t.cameraStable(1500);
    b = await t.camera();
    t.check("Shift+MMB drag rotates the view (> 10°)", angle(a.dir, b.dir) > 10, `rotated ${fmt(angle(a.dir, b.dir), 1)}°`);
    t.check("orbit keeps Z up (no roll)", Math.abs(b.right[2]) < 0.05, `right.z=${fmt(b.right[2], 3)}`);

    t.step("wheel zooms towards the cursor");
    await t.setView("home");
    a = await t.camera();
    const px = { x: c.x + 200, y: c.y - 100 };
    const before = await t.app(({ x, y }) => { const vp = window.app.viewport; const r = vp.canvas.getBoundingClientRect(); const R = vp.ray(x - r.left, y - r.top); return R; }, px);
    await t.page.mouse.move(px.x, px.y);
    for (let i = 0; i < 4; i++) { await t.page.mouse.wheel(0, -120); await t.frames(2); }
    await t.cameraStable(1500);
    b = await t.camera();
    t.check("wheel up zooms in (camera closer to target)", dist(b.pos, b.target) < dist(a.pos, a.target) * 0.95, `${fmt(dist(a.pos, a.target))} -> ${fmt(dist(b.pos, b.target))}`);
    const after = await t.app(({ x, y }) => { const vp = window.app.viewport; const r = vp.canvas.getBoundingClientRect(); return vp.ray(x - r.left, y - r.top); }, px);
    t.check("zoom is centred on the cursor (ray under the cursor keeps its direction)", angle(before.d, after.d) < 1.5, `ray turned ${fmt(angle(before.d, after.d), 2)}°`);
    for (let i = 0; i < 4; i++) { await t.page.mouse.wheel(0, 120); await t.frames(2); }

    t.step("double-click MMB fits");
    await t.page.mouse.move(c.x, c.y);
    for (let i = 0; i < 12; i++) { await t.page.mouse.wheel(0, 240); }
    await t.cameraStable(1500);
    const far = await t.camera();
    await t.page.mouse.click(c.x, c.y, { button: "middle", clickCount: 2 });
    await t.app(() => {
      // a real double middle-click also fires 'auxclick' detail=2 / dblclick on some platforms; emit it explicitly
      const cv = window.app.viewport.canvas, r = cv.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, button: 1, buttons: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, detail: 2 };
      cv.dispatchEvent(new MouseEvent("auxclick", o));
    });
    await t.cameraStable(2000);
    const fit = await t.camera();
    t.check("double-click MMB fits the model (camera much closer after being zoomed far out)", dist(fit.pos, fit.target) < dist(far.pos, far.target) * 0.6, `${fmt(dist(far.pos, far.target))} -> ${fmt(dist(fit.pos, fit.target))}`);
    await t.shot("after-fit");

    // ---------- navigation bar ----------
    t.step("nav bar: Fit");
    for (let i = 0; i < 10; i++) await t.page.mouse.wheel(0, 240);
    await t.cameraStable(1500);
    const far2 = await t.camera();
    const fitBtn = await t.click('#navbar-host [data-cmd="FitCommand"], #navbar-host [data-cmd="ZoomFitCommandGroup"], #navbar-host [data-cmd="ViewFit"]');
    t.check("nav bar Fit button clickable", fitBtn);
    await t.cameraStable(2000);
    const fit2 = await t.camera();
    t.check("Fit brings the model back into view", dist(fit2.pos, fit2.target) < dist(far2.pos, far2.target) * 0.6, `${fmt(dist(far2.pos, far2.target))} -> ${fmt(dist(fit2.pos, fit2.target))}`);
    const proj = await t.app(() => {
      const vp = window.app.viewport; const r = vp.canvas.getBoundingClientRect();
      const pts = [[-20, -10, 0], [20, -10, 0], [20, 10, 0], [-20, 10, 0], [-20, -10, 10], [20, -10, 10], [20, 10, 10], [-20, 10, 10]].map((p) => vp.toScreen(p));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { w: (Math.max(...xs) - Math.min(...xs)) / r.width, h: (Math.max(...ys) - Math.min(...ys)) / r.height, inside: xs.every((x) => x >= 0 && x <= r.width) && ys.every((y) => y >= 0 && y <= r.height) };
    });
    t.check("after Fit the whole model is on screen and fills a good part of it", proj.inside && Math.max(proj.w, proj.h) > 0.25, JSON.stringify(proj));

    t.step("nav bar: Look At a selected face");
    await t.setView("home");
    const aim = await t.aim([[5, -10, 5], [0, -10, 5], [-5, -10, 3]], "h && h.ref && h.ref.kind === 'face' && h.ref.n[1] < -0.99");
    if (aim) {
      await t.canvasClick(aim.x, aim.y);
      await t.click('#navbar-host [data-cmd="LookAtCommand"]');
      await t.cameraStable(2500);
      const la = await t.camera();
      t.check("Look At turns the camera to face the selected front face (looks along +Y)", la.dir[1] > 0.99, `dir=${la.dir.map((v) => fmt(v, 3))}`);
      await t.key("Escape");
    } else t.check("front face pickable for Look At", false);

    t.step("nav bar: Orbit tool then left-drag");
    await t.setView("home");
    a = await t.camera();
    const orb = await t.click('#navbar-host [data-cmd="OrbitCommand"]');
    t.check("Orbit button clickable", orb);
    await t.page.mouse.move(c.x, c.y);
    await t.page.mouse.down();
    await t.page.mouse.move(c.x + 120, c.y, { steps: 8 });
    await t.page.mouse.up();
    await t.cameraStable(1500);
    b = await t.camera();
    t.check("with Orbit active, left-drag orbits", angle(a.dir, b.dir) > 10, `rotated ${fmt(angle(a.dir, b.dir), 1)}°`);
    t.check("left-drag in Orbit mode does not window-select", (await t.state()).selection.length === 0);
    await t.key("Escape");
    await t.settle(150);
    a = await t.camera();
    await t.page.mouse.move(c.x - 200, c.y + 150);
    await t.page.mouse.down();
    await t.page.mouse.move(c.x - 80, c.y + 200, { steps: 6 });
    await t.page.mouse.up();
    b = await t.camera();
    t.check("Esc leaves Orbit mode (left-drag no longer orbits)", angle(a.dir, b.dir) < 0.5, `rotated ${fmt(angle(a.dir, b.dir), 2)}°`);

    t.step("nav bar: Display Settings menu");
    const ds = await t.click('#navbar-host [data-cmd="ViewDisplayCommand"]');
    await t.settle(250);
    const txt = await t.overlayText();
    await t.shot("display-settings");
    t.check("Display Settings button opens a menu", ds && txt.length > 0);
    for (const s of ["Visual Style", "Environment", "Effects", "Object Visibility", "Camera"]) t.check(`Display Settings has "${s}"`, txt.includes(s), txt.replace(/\s+/g, " ").slice(0, 160));
    await t.escapeAll();

    t.step("nav bar: Grid and Snaps menu toggles the layout grid");
    const gs = await t.click('#navbar-host [data-cmd="ViewLayoutGridCommand"]');
    await t.settle(250);
    const gtxt = await t.overlayText();
    t.check("Grid and Snaps menu has Layout Grid / Snap to Grid / Grid Settings", gs && /Layout Grid/.test(gtxt) && /Snap to Grid/.test(gtxt) && /Grid Settings/.test(gtxt), gtxt.replace(/\s+/g, " ").slice(0, 160));
    const gridBefore = await t.app(() => { let n = 0; window.app.viewport.scene.traverse((o) => { if (/grid/i.test(o.name || "") && o.visible) n++; }); return n; });
    const lg = await t.app(() => { const e = [...document.querySelectorAll("#overlay *")].find((x) => x.offsetParent && x.children.length <= 3 && /^\s*Layout Grid\s*$/.test(x.textContent || "")); if (e) { e.setAttribute("data-qa-grid", "1"); return true; } return false; });
    if (lg) {
      await t.click('[data-qa-grid="1"]');
      await t.settle(250);
      const gridAfter = await t.app(() => { let n = 0; window.app.viewport.scene.traverse((o) => { if (/grid/i.test(o.name || "") && o.visible) n++; }); return n; });
      if (gridBefore > 0) t.check("Layout Grid toggle hides the grid", gridAfter < gridBefore, `visible grid objects ${gridBefore} -> ${gridAfter}`);
      else t.note("no scene object named *grid*; Layout Grid toggle not verified");
      await t.shot("grid-off");
    }
    await t.escapeAll();
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
