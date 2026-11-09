// Viewport e2e: navigation, standard views, ViewCube, picking, highlight, origin, nav bar.
//   node tests/e2e/viewport.mjs [--only=viewport] [--keep]
import { launch } from "./harness.mjs";

const only = (process.argv.find((a) => a.startsWith("--only=")) || "--only=viewport").slice(7) || undefined;
const h = await launch({ only, outDir: process.env.VP_OUT || "build/viewport", port: Number(process.env.VP_PORT) || 5311, shots: process.env.VP_SHOTS || "tests/e2e/out/viewport" });
const { page } = h;
let fails = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fails++;
};
const settle = async (ms = 450) => { await page.waitForTimeout(ms); await h.frames(3); };

try {
  // ---- API surface ----
  const api = await page.evaluate(() => {
    const v = app.viewport;
    const keys = ["THREE", "renderer", "scene", "canvas", "camera", "target", "groups", "labelLayer", "requestRender", "ray", "rayPlane", "toScreen", "pixelSize", "pick", "pickAll", "addPickProvider", "lookAt", "setView", "fit", "setPreview", "clearPreview", "setOriginVisible", "meshFor"];
    const missing = keys.filter((k) => v[k] === undefined);
    const groups = ["bodies", "sketches", "construction", "origin", "preview", "overlay"].filter((g) => !v.groups[g]);
    return { missing, groups, cam: v.camera.type, target: v.target };
  });
  check("api complete", api.missing.length === 0 && api.groups.length === 0, JSON.stringify(api));
  await settle(300);
  await h.shot("01-empty-home");

  // ---- model a box + cylinder ----
  const ids = await page.evaluate(() => {
    const f = app.addFeature({ type: "box", length: "40 mm", width: "30 mm", height: "20 mm", center: [30, 20], operation: "new", plane: { kind: "origin", name: "XY" } });
    const body = app.bodies()[0].id;
    const fl = app.addFeature({ type: "fillet", edges: [{ body, p: [50, 35, 10] }, { body, p: [10, 35, 10] }], radius: "5 mm" });
    const cy = app.addFeature({ type: "cylinder", diameter: "10 mm", height: "20 mm", center: [30, 20], operation: "cut", plane: { kind: "origin", name: "XY" } });
    const ok = (id) => { const r = app.featureResult(id); return r && (r.ok ? "ok" : r.error); };
    return { box: f.id, fillet: ok(fl.id), cyl: ok(cy.id), bodies: app.bodies().map((b) => b.id) };
  });
  check("box created", ids.bodies.length === 1, JSON.stringify(ids));
  await page.evaluate(() => app.viewport.fit({ animate: false }));
  await settle();
  await h.shot("02-box-home");

  // ---- standard views ----
  for (const v of ["front", "top", "right", "home"]) {
    await page.evaluate((name) => app.viewport.setView(name, { animate: false }), v);
    await settle(200);
    await h.shot(`03-view-${v}`);
  }
  const front = await page.evaluate(async () => {
    await app.viewport.setView("front", { animate: false });
    const c = app.viewport.camera;
    const d = new app.viewport.THREE.Vector3(); c.getWorldDirection(d);
    return { d: d.toArray().map((x) => +x.toFixed(3)), up: c.up.toArray().map((x) => +x.toFixed(3)) };
  });
  check("front looks +Y from -Y", Math.abs(front.d[1] - 1) < 1e-3 && Math.abs(front.up[2] - 1) < 1e-3, JSON.stringify(front));
  const top = await page.evaluate(async () => {
    await app.viewport.setView("top", { animate: false });
    const c = app.viewport.camera; const d = new app.viewport.THREE.Vector3(); c.getWorldDirection(d);
    return d.toArray().map((x) => +x.toFixed(3));
  });
  check("top looks -Z", Math.abs(top[2] + 1) < 1e-3, JSON.stringify(top));
  const right = await page.evaluate(async () => {
    await app.viewport.setView("right", { animate: false });
    const c = app.viewport.camera; const d = new app.viewport.THREE.Vector3(); c.getWorldDirection(d);
    return d.toArray().map((x) => +x.toFixed(3));
  });
  check("right looks -X", Math.abs(right[0] + 1) < 1e-3, JSON.stringify(right));

  // animated lookAt resolves
  const la = await page.evaluate(async () => {
    const t0 = performance.now();
    const r = await app.viewport.lookAt(app.K.ORIGIN_PLANES.XZ);
    return { r, ms: performance.now() - t0 };
  });
  check("lookAt promise resolves after animation", la.r === true && la.ms > 150, JSON.stringify(la));

  // ---- picking on the home view ----
  await page.evaluate(() => app.viewport.goHome({ animate: false }));
  await settle(200);
  const pk = await page.evaluate(() => {
    const v = app.viewport;
    const out = {};
    // top face centre (box spans x 0..40? use world centre of top face)
    const b = app.bodies()[0];
    const bb = app.K.bboxOf(b.shape);
    out.bb = bb;
    const cx = (bb.min[0] + bb.max[0]) / 2, cy = (bb.min[1] + bb.max[1]) / 2, zt = bb.max[2];
    const s = v.toScreen([cx - 10, cy - 8, zt]); // top face, clear of the hole
    const h1 = v.pick(s[0], s[1]);
    out.top = h1 && { kind: h1.ref.kind, n: h1.ref.n && h1.ref.n.map((x) => +x.toFixed(2)), planar: h1.ref.planar, type: h1.type };
    // an edge: midpoint of the top front edge
    const se = v.toScreen([cx, bb.min[1], zt]);
    const h2 = v.pick(se[0] + 1, se[1] + 2);
    out.edge = h2 && { kind: h2.ref.kind, type: h2.type, d: h2.screenDist };
    // a vertex: front-right-top corner
    const sv = v.toScreen([bb.max[0], bb.min[1], zt]);
    const h3 = v.pick(sv[0] + 2, sv[1] - 2);
    out.vertex = h3 && { kind: h3.ref.kind, p: h3.ref.p };
    // empty space
    out.empty = v.pick(5, 5);
    // filter: bodies only
    const h4 = v.pick(s[0], s[1], { filter: (r) => r.kind === "body" });
    out.body = h4 && h4.ref.kind;
    // hidden back vertex should not be pickable (back-left-bottom corner)
    const sh = v.toScreen([bb.min[0], bb.max[1], bb.min[2]]);
    const h5 = v.pick(sh[0], sh[1], { kinds: ["vertex"] });
    out.hiddenVertex = h5 ? h5.ref.kind : null;
    out.screens = { s, se, sv };
    return out;
  });
  check("pick top face", pk.top && pk.top.kind === "face" && pk.top.planar && pk.top.n[2] === 1, JSON.stringify(pk.top));
  check("pick edge near edge", pk.edge && pk.edge.kind === "edge" && pk.edge.type === "curve", JSON.stringify(pk.edge));
  check("pick vertex near corner", pk.vertex && pk.vertex.kind === "vertex", JSON.stringify(pk.vertex));
  check("pick empty -> null", pk.empty === null);
  check("filter body", pk.body === "body");
  check("hidden vertex not pickable", pk.hiddenVertex === null, String(pk.hiddenVertex));

  // ---- selection highlight: select the top face via a click; hover an edge ----
  const box = await page.locator("#canvas-host canvas").boundingBox();
  await page.mouse.click(box.x + pk.screens.s[0], box.y + pk.screens.s[1]);
  await settle(100);
  const sel = await page.evaluate(() => app.selection.items.map((r) => r.kind));
  check("click selects face", sel.length === 1 && sel[0] === "face", JSON.stringify(sel));
  await page.mouse.move(box.x + pk.screens.se[0] + 1, box.y + pk.screens.se[1] + 2);
  await settle(100);
  const hov = await page.evaluate(() => app.selection.hover && app.selection.hover.kind);
  check("hover edge", hov === "edge", String(hov));
  await h.shot("04-selected-face-hovered-edge");
  // click empty clears
  await page.mouse.click(box.x + 30, box.y + 200);
  await settle(100);
  check("click empty clears", await page.evaluate(() => app.selection.items.length === 0));

  // ---- window selection (left-to-right) around the whole box ----
  const wb = await page.evaluate(() => {
    const v = app.viewport; const b = app.bodies()[0]; const bb = app.K.bboxOf(b.shape);
    const pts = [];
    for (const x of [bb.min[0], bb.max[0]]) for (const y of [bb.min[1], bb.max[1]]) for (const z of [bb.min[2], bb.max[2]]) pts.push(v.toScreen([x, y, z]));
    return { x0: Math.min(...pts.map((p) => p[0])) - 20, x1: Math.max(...pts.map((p) => p[0])) + 20, y0: Math.min(...pts.map((p) => p[1])) - 20, y1: Math.max(...pts.map((p) => p[1])) + 20 };
  });
  await page.mouse.move(box.x + wb.x0, box.y + wb.y0);
  await page.mouse.down();
  await page.mouse.move(box.x + (wb.x0 + wb.x1) / 2, box.y + (wb.y0 + wb.y1) / 2, { steps: 4 });
  await page.mouse.move(box.x + wb.x1, box.y + wb.y1, { steps: 4 });
  await h.shot("05-window-drag");
  await page.mouse.up();
  await settle(100);
  const wsel = await page.evaluate(() => app.selection.items.map((r) => r.kind));
  check("window select picks body", wsel.length === 1 && wsel[0] === "body", JSON.stringify(wsel));
  await h.shot("06-body-selected");
  await page.evaluate(() => app.selection.clear());

  // ---- origin visible ----
  await page.evaluate(() => app.viewport.setOriginVisible(true));
  await settle(150);
  await h.shot("07-origin-visible");
  const op = await page.evaluate(() => {
    const v = app.viewport;
    const u = v._vp.origin.unit;
    const s = v.toScreen([u * 0.75, u * 0.75, 0]);
    const hit = v.pickAll(s[0], s[1]).find((x) => x.ref.kind === "originPlane");
    const sa = v.toScreen([u * 1.08, 0, 0]); // axes reach 1.13 units (Fusion plane-pick layout)
    const ha = v.pick(sa[0], sa[1]);
    return { plane: hit && hit.ref.name, axis: ha && ha.ref.kind === "originAxis" ? ha.ref.name : ha && ha.ref.kind };
  });
  check("pick origin plane XY", op.plane === "XY", JSON.stringify(op));
  check("pick origin X axis", op.axis === "X", JSON.stringify(op));
  await page.evaluate(() => app.viewport.setOriginVisible(false));

  // ---- ViewCube hover + click ----
  const vc = await page.locator("#viewcube-host canvas").boundingBox();
  check("viewcube canvas present", !!vc);
  await page.mouse.move(vc.x + vc.width * 0.5, vc.y + vc.height * 0.62, { steps: 4 });
  await settle(120);
  const vh = await page.evaluate(() => app.viewport.viewCube.hover);
  await h.shot("08-viewcube-hover");
  check("viewcube hover zone", !!vh, String(vh));
  await page.mouse.click(vc.x + vc.width * 0.5, vc.y + vc.height * 0.62);
  await settle(600);
  const after = await page.evaluate(() => { const d = new app.viewport.THREE.Vector3(); app.viewport.camera.getWorldDirection(d); return d.toArray().map((x) => +x.toFixed(3)); });
  console.log("view after cube click", vh, after);
  await h.shot("09-after-cube-click");

  // ---- ViewCube nudge / roll arrows in a face-on view ----
  await page.evaluate(() => app.viewport.setView("front", { animate: false }));
  await page.mouse.move(vc.x + 40, vc.y + 40, { steps: 3 });
  await settle(150);
  await page.locator("#viewcube-host").screenshot({ path: "tests/e2e/out/viewport/08b-cube-front-arrows.png" });
  await page.click(".vc-up");
  await settle(450);
  const upv = await page.evaluate(() => { const d = new app.viewport.THREE.Vector3(); app.viewport.camera.getWorldDirection(d); return { d: d.toArray().map((x) => +x.toFixed(2)), up: app.viewport.camera.up.toArray().map((x) => +x.toFixed(2)) }; });
  check("nudge up from FRONT goes to TOP", upv.d[2] === -1 && upv.up[1] === 1, JSON.stringify(upv));
  await page.mouse.move(vc.x + 42, vc.y + 40, { steps: 2 });
  await page.click(".vc-roll-cw");
  await settle(450);
  const rv = await page.evaluate(() => app.viewport.camera.up.toArray().map((x) => +x.toFixed(2)));
  check("roll clockwise turns the picture clockwise", rv[0] === -1, JSON.stringify(rv));

  // ---- navigation: wheel zoom, MMB pan, Shift+MMB orbit ----
  await page.evaluate(() => app.viewport.goHome({ animate: false }));
  await settle(100);
  const d0 = await page.evaluate(() => app.viewport.rig.dist);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await settle(100);
  const d1 = await page.evaluate(() => app.viewport.rig.dist);
  check("wheel forward zooms in", d1 < d0, `${d0.toFixed(1)} -> ${d1.toFixed(1)}`);
  const t0 = await page.evaluate(() => app.viewport.target);
  await page.mouse.move(box.x + 600, box.y + 400);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + 700, box.y + 420, { steps: 5 });
  await page.mouse.up({ button: "middle" });
  const t1 = await page.evaluate(() => app.viewport.target);
  check("MMB drag pans", Math.hypot(t1[0] - t0[0], t1[1] - t0[1], t1[2] - t0[2]) > 1e-3, JSON.stringify([t0, t1]));
  const q0 = await page.evaluate(() => app.viewport.rig.quat.toArray());
  await page.keyboard.down("Shift");
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + 800, box.y + 450, { steps: 5 });
  await page.mouse.up({ button: "middle" });
  await page.keyboard.up("Shift");
  const q1 = await page.evaluate(() => ({ q: app.viewport.rig.quat.toArray(), up: app.viewport.camera.up.toArray() }));
  check("Shift+MMB orbits keeping Z up", JSON.stringify(q0) !== JSON.stringify(q1.q) && q1.up[2] > 0, JSON.stringify(q1.up));
  await settle(100);
  await h.shot("10-after-nav");

  // ---- nav bar + menus ----
  const nbCmds = await page.evaluate(() => [...document.querySelectorAll("#navbar-host [data-cmd]")].map((b) => b.dataset.cmd));
  check("navbar buttons", ["OrbitCommand", "LookAtCommand", "PanCommand", "ZoomCommand", "FitCommand", "ViewDisplayCommand", "ViewLayoutGridCommand", "SplitViewWindowSyncCommand"].every((c) => nbCmds.includes(c)), nbCmds.join(","));
  await page.click('#navbar-host [data-cmd="ViewDisplayCommand"]');
  await settle(150);
  await page.hover('.vp-menu .vp-menu-item:has-text("Visual Style")');
  await settle(250);
  await h.shot("11-display-menu");
  await page.click('.vp-menu [data-cmd="ViewWireframeCommand"]');
  await settle(150);
  check("wireframe style applied", await page.evaluate(() => app.viewport.visualStyle === "ViewWireframeCommand"));
  await h.shot("12-wireframe");
  await page.evaluate(() => app.commands.run("ViewShadedWithEdgesHLRCommand"));
  await page.click('#navbar-host [data-cmd="ViewLayoutGridCommand"]');
  await settle(150);
  await h.shot("13-grid-menu");
  await page.keyboard.press("Escape");
  await page.evaluate(() => app.commands.run("ViewCameraOrthoCommand"));
  await settle(150);
  check("ortho camera", await page.evaluate(() => app.viewport.camera.isOrthographicCamera === true));
  await h.shot("14-ortho");
  await page.evaluate(() => app.commands.run("ViewCameraPerspCommand"));

  // ---- preview shapes ----
  await page.evaluate(() => {
    const R = app.K.R;
    const tool = R.makeCylinder(6, 30, [20, 15, -5], [0, 0, 1]);
    app.viewport.setPreview([{ shape: tool, color: "cut" }]);
  });
  await settle(150);
  await h.shot("15-preview-cut");
  await page.evaluate(() => app.viewport.clearPreview());

  // ---- shortcuts ----
  await page.keyboard.press("Control+Alt+V");
  await settle(80);
  check("Ctrl+Alt+V hides ViewCube", await page.evaluate(() => getComputedStyle(document.querySelector(".vc-root")).display === "none"));
  await page.keyboard.press("Control+Alt+V");
  await page.keyboard.press("2");
  check("2 -> freeform selection", await page.evaluate(() => app.viewport.selectionMode === "freeform"));
  await page.keyboard.press("1");

  // ---- trackpad heuristics (synthetic wheel events) ----
  await page.evaluate(() => app.viewport.goHome({ animate: false }));
  await settle(100);
  const tp = await page.evaluate(() => {
    const c = app.viewport.canvas;
    const r = c.getBoundingClientRect();
    const fire = (o) => c.dispatchEvent(new WheelEvent("wheel", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true, deltaMode: 0, ...o }));
    const rig = app.viewport.rig;
    const d0 = rig.dist; fire({ deltaY: -8.5, ctrlKey: true }); const d1 = rig.dist;
    const t0 = app.viewport.target; fire({ deltaX: 12.5, deltaY: 7.25 }); const t1 = app.viewport.target;
    const q0 = rig.quat.toArray().join(); fire({ deltaX: 6.5, deltaY: 3.5, shiftKey: true }); const q1 = rig.quat.toArray().join();
    return { pinchIn: d1 < d0, panned: t0.join() !== t1.join(), orbit: q0 !== q1 };
  });
  check("pinch zooms in", tp.pinchIn);
  check("two-finger scroll pans", tp.panned);
  check("shift two-finger orbits", tp.orbit);
  await page.waitForTimeout(300);
  const dw0 = await page.evaluate(() => app.viewport.rig.dist);
  await page.mouse.move(box.x + 700, box.y + 400);
  await page.mouse.wheel(0, 100);
  await settle(50);
  const dw1 = await page.evaluate(() => app.viewport.rig.dist);
  check("mouse wheel back zooms out", dw1 > dw0, `${dw0.toFixed(1)} -> ${dw1.toFixed(1)}`);

  // ---- touch (synthetic pointer events): one-finger drag orbits, two-finger pinch zooms, tap selects ----
  const touchRes = await page.evaluate(() => {
    const c = app.viewport.canvas; const r = c.getBoundingClientRect(); const rig = app.viewport.rig;
    const pe = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 11, clientX: r.left + x, clientY: r.top + y, button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true }));
    const q0 = rig.quat.toArray().join();
    pe("pointerdown", 11, 700, 400); pe("pointermove", 11, 720, 405); pe("pointermove", 11, 760, 420); pe("pointerup", 11, 760, 420);
    const orbited = rig.quat.toArray().join() !== q0;
    const d0 = rig.dist;
    pe("pointerdown", 11, 700, 400); pe("pointerdown", 12, 800, 400);
    pe("pointermove", 11, 650, 400); pe("pointermove", 12, 850, 400);
    pe("pointerup", 11, 650, 400); pe("pointerup", 12, 850, 400);
    const pinched = rig.dist < d0;
    return { orbited, pinched };
  });
  check("touch drag orbits", touchRes.orbited);
  check("touch pinch zooms in", touchRes.pinched);

  // ---- double-click MMB fits ----
  await page.evaluate(() => { app.viewport.rig.zoomAbout(null, 4); app.viewport.requestRender(); });
  const farDist = await page.evaluate(() => app.viewport.rig.dist);
  await page.mouse.move(box.x + 500, box.y + 300);
  await page.mouse.click(box.x + 500, box.y + 300, { button: "middle" });
  await page.mouse.click(box.x + 500, box.y + 300, { button: "middle" });
  await settle(500);
  const fitDist = await page.evaluate(() => app.viewport.rig.dist);
  check("double MMB fits", fitDist < farDist * 0.5, `${farDist.toFixed(1)} -> ${fitDist.toFixed(1)}`);

  // ---- Look At with a selected face ----
  const lookRes = await page.evaluate(async () => {
    const v = app.viewport;
    const b = app.bodies()[0]; const bb = app.K.bboxOf(b.shape);
    await v.setView("home", { animate: false });
    const s = v.toScreen([(bb.min[0] + bb.max[0]) / 2 - 10, bb.min[1], (bb.min[2] + bb.max[2]) / 2]);
    const h = v.pick(s[0], s[1], { kinds: ["face"] });
    app.selection.set([h.ref]);
    await app.commands.run("LookAtCommand");
    const d = new v.THREE.Vector3(); v.camera.getWorldDirection(d);
    app.selection.clear();
    return { n: h.ref.n.map((x) => +x.toFixed(2)), d: d.toArray().map((x) => +x.toFixed(2)) };
  });
  check("Look At selected front face", lookRes.d[1] === 1, JSON.stringify(lookRes));

  // ---- crossing selection (right-to-left) touching the body ----
  await page.evaluate(() => app.viewport.goHome({ animate: false }));
  await settle(150);
  const cr = await page.evaluate(() => {
    const v = app.viewport; const b = app.bodies()[0]; const bb = app.K.bboxOf(b.shape);
    const p = v.toScreen([bb.max[0], bb.min[1], bb.max[2]]);
    return { x0: p[0] + 60, y0: p[1] - 20, x1: p[0] - 30, y1: p[1] + 40 };
  });
  await page.mouse.move(box.x + cr.x0, box.y + cr.y0);
  await page.mouse.down();
  await page.mouse.move(box.x + cr.x1, box.y + cr.y1, { steps: 6 });
  await h.shot("16-crossing-drag");
  await page.mouse.up();
  const csel = await page.evaluate(() => app.selection.items.map((r) => r.kind));
  check("crossing select picks body", csel.length === 1 && csel[0] === "body", JSON.stringify(csel));
  await page.evaluate(() => app.selection.clear());

  // ---- visual styles ----
  for (const st of ["ViewShadedCommand", "ViewShadedHLCommand", "ViewWireframeHLCommand", "ViewWireframeHLRCommand"]) {
    await page.evaluate((id) => app.commands.run(id), st);
    await settle(120);
    await h.shot(`17-style-${st}`);
  }
  await page.evaluate(() => app.commands.run("ViewShadedWithEdgesHLRCommand"));

  // ---- effects + environment + object visibility ----
  await page.evaluate(() => { app.commands.run("ViewGroundShadowCommand"); app.commands.run("ViewObjectShadowCommand"); });
  await settle(150);
  await h.shot("18-shadows");
  await page.evaluate(() => { app.commands.run("ViewGroundShadowCommand"); app.commands.run("ViewObjectShadowCommand"); app.commands.run("ViewEnvDarkSkyCommand"); });
  await settle(150);
  await h.shot("19-dark-sky");
  await page.evaluate(() => app.commands.run("ViewEnvPhotoBoothCommand"));
  await page.evaluate(() => app.commands.run("ViewVisibilityBodiesCmd"));
  check("object visibility hides bodies", await page.evaluate(() => app.viewport.groups.bodies.visible === false && app.viewport.pick(800, 450, { kinds: ["face"] }) === null));
  await page.evaluate(() => app.commands.run("ViewVisibilityBodiesCmd"));

  // ---- sketch mode moves the layout grid onto the sketch plane ----
  const gp = await page.evaluate(() => {
    const f = app.addFeature({ type: "sketch", plane: app.K.ORIGIN_PLANES.XZ, planeRef: { kind: "origin", name: "XZ" }, sk: app.S.newSketch() });
    app.setMode("sketch", f.id);
    const n = app.viewport._vp.grid.plane.n.slice();
    app.setMode("model");
    return { n, back: app.viewport._vp.grid.plane.n.slice() };
  });
  check("grid follows sketch plane", gp.n[1] === -1 && gp.back[2] === 1, JSON.stringify(gp));

  console.log("errors:", h.errors.length ? h.errors.join("\n") : "none");
  check("no console errors", h.errors.length === 0);
} catch (e) {
  console.error(e);
  fails++;
} finally {
  await h.close();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exitCode = fails ? 1 : 0;
