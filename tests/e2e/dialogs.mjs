// E2E test for the dialogs module (command dialog framework + modelling commands).
//   node tests/e2e/dialogs.mjs [--only=viewport,dialogs[,sketch]] [--headed] [--step=name]
import { launch } from "./harness.mjs";

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1];
const only = arg("only") || "viewport,dialogs";
const h = await launch({ only, outDir: process.env.DLG_OUT || "build/dialogs", port: Number(process.env.DLG_PORT) || 5315, shots: process.env.DLG_SHOTS || "tests/e2e/out/dialogs", headless: !process.argv.includes("--headed"), width: 1389, height: 795 });
const { page } = h;
const results = [];
const check = (name, cond, info) => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};
const wait = (ms) => page.waitForTimeout(ms);
const vol = () => page.evaluate(() => app.bodies().reduce((s, b) => s + app.K.R.measureVolume(b.shape), 0));
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
const dlgOpen = (id) => page.evaluate((i) => !!document.querySelector(`.dlg[data-dialog="${i}"]`), id);
async function settle(ms = 350) { await wait(ms); await h.frames(3); }
async function ok() { await page.click(".dlg [data-action=ok]"); await settle(200); }
async function fill(field, value) {
  await page.fill(`.dlg [data-input="${field}"]`, value);
  await page.dispatchEvent(`.dlg [data-input="${field}"]`, "change");
  await settle(400);
}
async function newDoc() {
  await page.evaluate(() => { app.ui.dialog.cancel(); app.newDocument("Test"); });
  await settle(100);
}
const sketchRect = (plane, a, b) => page.evaluate(({ plane, a, b }) => {
  const S = app.S, K = app.K;
  const sk = S.newSketch();
  S.addRect2pt(sk, a, b);
  const pl = typeof plane === "string" ? K.ORIGIN_PLANES[plane] : plane;
  const ref = typeof plane === "string" ? { kind: "origin", name: plane } : { kind: "face", body: "b1", p: plane.o, n: plane.n, plane };
  return app.addFeature({ type: "sketch", plane: pl, planeRef: ref, sk }).id;
}, { plane, a, b });
const sketchCircle = (plane, c, r) => page.evaluate(({ plane, c, r }) => {
  const S = app.S;
  const sk = S.newSketch();
  const cp = S.addPoint(sk, c[0], c[1]);
  S.addCircle(sk, cp, r);
  return app.addFeature({ type: "sketch", plane, planeRef: { kind: "face", body: "b1", p: plane.o, n: plane.n, plane }, sk }).id;
}, { plane, c, r });
async function fitView() { await page.evaluate(() => { app.viewport.setView("home", { animate: false }); app.viewport.fit({ animate: false }); }); await settle(150); }
/** pick through the dialog as a canvas click would (refs are remapped onto the pre-feature state) */
const pick = (row, ref) => page.evaluate(({ row, ref }) => app.ui.dialog.current.pickRef(row, ref), { row, ref });

try {
  // ------------------------------------------------------------ Extrude (new body) via the E shortcut
  const sk1 = await sketchRect("XY", [-20, -10], [20, 10]);
  await fitView();
  await page.mouse.move(800, 450);
  await page.keyboard.press("e");
  await page.waitForSelector('.dlg[data-dialog="Extrude"]', { timeout: 5000 });
  await settle(400);
  const st1 = await page.evaluate(() => ({
    count: document.querySelector('.dlg [data-input="profiles"]').dataset.count,
    op: document.querySelector('.dlg [data-input="operation"]').dataset.value,
    title: document.querySelector(".dlg .dlg-title").textContent,
    active: !!app.activeCommand && app.activeCommand.id,
    previewing: app.previewing,
  }));
  check("extrude dialog opens with the single profile auto-selected", st1.count === "1" && st1.title === "EXTRUDE" && st1.active === "Extrude", st1);
  check("auto operation in empty space is New Body", st1.op === "new", st1.op);
  await fill("distance", "15");
  const dv = await page.inputValue('.dlg [data-input="distance"]');
  check("bare number gets the default unit", dv === "15 mm", dv);
  await page.evaluate(() => app.viewport.fit({ animate: false }));
  await settle(300);
  await h.shot("01-extrude-dialog");
  // drag the distance arrow
  const before = await page.inputValue('.dlg [data-input="distance"]');
  const sp = await page.evaluate(() => { const p = app.ui.dialog.current.manips.screenPoint("distance"); const r = app.viewport.canvas.getBoundingClientRect(); return p && [p[0] + r.left, p[1] + r.top]; });
  if (sp) {
    await page.mouse.move(sp[0], sp[1]);
    await page.mouse.down();
    await page.mouse.move(sp[0], sp[1] - 30, { steps: 6 });
    await page.mouse.move(sp[0], sp[1] - 60, { steps: 6 });
    await page.mouse.up();
    await settle(500);
  }
  const after = await page.inputValue('.dlg [data-input="distance"]');
  const box = await page.evaluate(() => { const b = document.querySelector(".dlg-manip-input"); return b ? b.value : null; });
  check("dragging the distance arrow changes the distance", sp && after !== before && parseFloat(after) > parseFloat(before), { before, after, box });
  await h.shot("02-extrude-dragged");
  await fill("distance", "15 mm");
  await ok();
  let v = await vol();
  check("extrude 40x20x15 = 12000 mm3", near(v, 12000), v);
  const sk1vis = await page.evaluate((id) => app.feature(id).visible, sk1);
  check("consumed sketch is hidden after OK", sk1vis === false, sk1vis);
  check("dialog closed + activeCommand cleared", !(await dlgOpen("Extrude")) && (await page.evaluate(() => app.activeCommand === null)));

  // ------------------------------------------------------------ Extrude cut (auto op) from a sketch on the top face
  await sketchCircle({ o: [0, 0, 15], x: [1, 0, 0], n: [0, 0, 1] }, [0, 0], 5);
  await page.evaluate(() => app.commands.run("Extrude"));
  await page.waitForSelector('.dlg[data-dialog="Extrude"]');
  await settle(300);
  let op = await page.evaluate(() => app.ui.dialog.current.values.operation);
  check("profile on a body face extruded away -> Join", op === "join", op);
  await fill("distance", "-5 mm");
  op = await page.evaluate(() => app.ui.dialog.current.values.operation);
  check("extruding into the body -> Cut", op === "cut", op);
  const prevItems = await page.evaluate(() => app.viewport.groups.preview.children.length);
  check("cut preview shows the red tool body", prevItems > 0, prevItems);
  await h.shot("03-extrude-cut-preview");
  await ok();
  v = await vol();
  check("cut removes the cylinder", near(v, 12000 - Math.PI * 25 * 5, 1), v);

  // ------------------------------------------------------------ Hole on the top face
  const v0 = await vol();
  await page.keyboard.press("h");
  await page.waitForSelector('.dlg[data-dialog="FusionHoleCommand"]');
  await pick("face", { kind: "face", body: "b1", index: -1, p: [12, 3, 15], n: [0, 0, 1], planar: true });
  await settle(500);
  const hs = await page.evaluate(() => ({ d: document.querySelector('.dlg [data-input="diameter"]').value, depth: document.querySelector('.dlg [data-input="depth"]').value, tip: document.querySelector('.dlg [data-input="tipAngle"]').value, faces: document.querySelector('.dlg [data-input="face"]').dataset.count }));
  check("hole defaults (Fusion 2706): diameter 10 mm / depth 10 mm / 118 deg", hs.d === "10.00 mm" && hs.depth === "10.00 mm" && hs.tip === "118.0 deg" && hs.faces === "1", hs);
  await h.shot("04-hole-dialog");
  await page.click('.dlg [data-input="holeType"] [data-option="counterbore"]');
  await settle(400);
  await h.shot("05-hole-counterbore");
  await page.click('.dlg [data-input="holeType"] [data-option="simple"]');
  await settle(300);
  await ok();
  v = await vol();
  const holeV = Math.PI * 5 * 5 * 10 + (Math.PI * 5 * 5 * (5 / Math.tan((59 * Math.PI) / 180))) / 3;
  check("simple hole removes cylinder + 118 deg tip", near(v0 - v, holeV, 0.6), { removed: v0 - v, expected: holeV });

  // ------------------------------------------------------------ Fillet a vertical edge
  const vf0 = await vol();
  await page.keyboard.press("f");
  await page.waitForSelector('.dlg[data-dialog="FusionFilletEdgesCommand"]');
  await pick("edges", { kind: "edge", body: "b1", index: -1, p: [20, 10, 7.5] });
  await fill("radius", "3 mm");
  await h.shot("06-fillet-dialog");
  await ok();
  v = await vol();
  check("fillet r=3 on a 15 mm edge", near(vf0 - v, (1 - Math.PI / 4) * 9 * 15, 0.3), { removed: vf0 - v });

  // ------------------------------------------------------------ Edit Feature (first extrude)
  const exId = await page.evaluate(() => app.doc.features.find((f) => f.type === "extrude").id);
  await page.evaluate((id) => app.editFeature(id), exId);
  await page.waitForSelector('.dlg[data-dialog="Extrude"][data-edit]');
  await settle(300);
  const es = await page.evaluate(() => ({ title: document.querySelector(".dlg .dlg-title").textContent, dist: document.querySelector('.dlg [data-input="distance"]').value, count: document.querySelector('.dlg [data-input="profiles"]').dataset.count }));
  check("edit feature reopens the dialog with stored values", es.title === "EDIT FEATURE" && es.dist === "15 mm" && es.count === "1", es);
  await h.shot("07-edit-feature");
  await page.fill('.dlg [data-input="distance"]', "25 mm");
  await page.press('.dlg [data-input="distance"]', "Enter");
  await settle(300);
  check("Enter in a value field = OK", !(await dlgOpen("Extrude")));
  const ex = await page.evaluate((id) => app.feature(id).distance, exId);
  check("edited distance stored", ex === "25 mm", ex);
  v = await vol();
  // 40x20x25 block - Ø10x5 pocket - Ø10x10 hole (+tip) - r3 fillet on the 25 mm edge
  check("model recomputed after edit (taller block)", near(v, 20000 - Math.PI * 25 * 5 - holeV - (1 - Math.PI / 4) * 9 * 25, 3), v);

  // ------------------------------------------------------------ Esc cancels without a feature
  const nf = await page.evaluate(() => app.doc.features.length);
  await page.keyboard.press("e");
  await page.waitForSelector('.dlg[data-dialog="Extrude"]');
  await page.keyboard.press("Escape");
  await settle(200);
  check("Esc cancels the dialog", !(await dlgOpen("Extrude")) && (await page.evaluate(() => app.doc.features.length)) === nf && !(await page.evaluate(() => app.previewing)));

  // ------------------------------------------------------------ Box primitive + Shell + Chamfer + Press Pull + Delete
  await newDoc();
  await page.evaluate(() => app.commands.run("PrimitiveBox"));
  await page.waitForSelector('.dlg[data-dialog="PrimitiveBox"]');
  await pick("plane", { kind: "originPlane", name: "XY" });
  await fill("length", "40");
  await fill("width", "40");
  await fill("height", "20");
  await fitView();
  await h.shot("08-box");
  await ok();
  v = await vol();
  check("box 40x40x20", near(v, 32000), v);
  await page.evaluate(() => app.commands.run("FusionShellBodyCommand"));
  await page.waitForSelector('.dlg[data-dialog="FusionShellBodyCommand"]');
  await pick("faces", { kind: "face", body: "b1", index: -1, p: [0, 0, 20], n: [0, 0, 1], planar: true });
  await fill("thickness", "2 mm");
  await h.shot("09-shell");
  await ok();
  v = await vol();
  check("shell 2 mm inside, top removed", near(v, 32000 - 36 * 36 * 18, 2), v);

  await newDoc();
  await page.evaluate(() => app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "30 mm", width: "30 mm", height: "30 mm", operation: "new" }));
  await fitView();
  await page.evaluate(() => app.commands.run("FusionChamferCommand"));
  await page.waitForSelector('.dlg[data-dialog="FusionChamferCommand"]');
  await pick("edges", { kind: "edge", body: "b1", index: -1, p: [15, 0, 30] });
  await fill("distance", "4 mm");
  await ok();
  v = await vol();
  check("chamfer 4 mm on a 30 mm edge", near(27000 - v, 0.5 * 16 * 30, 0.5), v);

  // press pull a face (preselected) with Q
  const top = await page.evaluate(() => {
    const b = app.bodies()[0];
    const idx = b.shape.faces.findIndex((f) => Math.abs(f.center.z - 30) < 1e-6 && f.geomType === "PLANE");
    return { kind: "face", body: b.id, index: idx, p: [-5, -5, 30], n: [0, 0, 1], planar: true };
  });
  const vp0 = await vol();
  await page.evaluate((r) => app.selection.set([r]), top);
  await page.keyboard.press("q");
  await page.waitForSelector('.dlg[data-dialog="FusionPressPullCommand"]');
  await fill("distance", "5 mm");
  await h.shot("10-presspull");
  await ok();
  v = await vol();
  check("press pull +5 mm adds material", v - vp0 > 3000, v - vp0);

  // delete the body via the Delete key
  await page.evaluate(() => app.selection.set([{ kind: "body", body: app.bodies()[0].id }]));
  await page.keyboard.press("Delete");
  await settle(200);
  const nb = await page.evaluate(() => ({ bodies: app.bodies().length, last: app.doc.features[app.doc.features.length - 1].type }));
  check("Delete removes the selected body (delete feature)", nb.bodies === 0 && nb.last === "delete", nb);

  // ------------------------------------------------------------ Revolve around Z
  await newDoc();
  await sketchRect("XZ", [10, 0], [20, 10]);
  await page.evaluate(() => app.commands.run("Revolve"));
  await page.waitForSelector('.dlg[data-dialog="Revolve"]');
  await pick("axis", { kind: "originAxis", name: "Z" });
  await fitView();
  await settle(400);
  await h.shot("11-revolve");
  await ok();
  v = await vol();
  check("revolve 360 around Z", near(v, Math.PI * (400 - 100) * 10, 1), v);

  // ------------------------------------------------------------ Offset plane
  await page.evaluate(() => app.commands.run("WorkPlaneOffsetFromPlaneCommand"));
  await page.waitForSelector('.dlg[data-dialog="ConstructionPlaneOffsetFromPlaneCommand"]');
  await pick("plane", { kind: "originPlane", name: "XY" });
  await fill("offset", "25 mm");
  await h.shot("12-offset-plane");
  await ok();
  const pz = await page.evaluate(() => { const p = [...app.result.state.planes.values()][0]; return p && p.plane.o[2]; });
  check("offset plane at z=25", near(pz, 25, 1e-6), pz);

  // ------------------------------------------------------------ Cylinder / Sphere / Torus quick checks
  await newDoc();
  for (const [cmd, rows, expect] of [
    ["PrimitiveCylinder", { diameter: "20", height: "10" }, Math.PI * 100 * 10],
    ["PrimitiveSphere", { diameter: "20" }, (4 / 3) * Math.PI * 1000],
    ["PrimitiveTorus", { d1: "40", d2: "10" }, 2 * Math.PI * Math.PI * 20 * 25],
  ]) {
    await newDoc();
    await page.evaluate((c) => app.commands.run(c), cmd);
    await page.waitForSelector(`.dlg[data-dialog="${cmd}"]`);
    await pick("plane", { kind: "originPlane", name: "XY" });
    for (const [k, val] of Object.entries(rows)) await fill(k, val);
    await ok();
    v = await vol();
    check(`${cmd} volume`, near(v, expect, expect * 0.002), v);
  }

  // ------------------------------------------------------------ Extrude options through the DOM (dropdown menus)
  await newDoc();
  await sketchRect("XY", [0, 0], [10, 10]);
  await fitView();
  await page.evaluate(() => app.commands.run("Extrude"));
  await page.waitForSelector('.dlg[data-dialog="Extrude"]');
  await page.click('.dlg [data-input="dirType"]');
  await page.click('.dlg-dd-menu [data-option="sym"]');
  await fill("distance", "5 mm");
  await page.click('.dlg [data-input="symMeasure"] [data-option="whole"]');
  await settle(400);
  await h.shot("13-extrude-symmetric");
  await ok();
  v = await vol();
  let bb = await page.evaluate(() => app.bodies()[0].shape.boundingBox.bounds);
  check("symmetric whole length 5 mm", near(v, 500) && near(bb[0][2], -2.5, 1e-6), { v, z: bb[0][2] });
  await newDoc();
  await sketchRect("XY", [0, 0], [10, 10]);
  await page.evaluate(() => app.commands.run("Extrude"));
  await page.waitForSelector('.dlg[data-dialog="Extrude"]');
  await page.click('.dlg [data-input="dirType"]');
  await page.click('.dlg-dd-menu [data-option="two"]');
  await fill("distance", "4 mm");
  await fill("distance2", "6 mm");
  const groups = await page.evaluate(() => [...document.querySelectorAll(".dlg .dlg-group-head")].filter((e) => e.offsetParent).map((e) => e.textContent));
  check("two sides shows Side 1 / Side 2 groups", groups.join("|") === "Side 1|Side 2", groups);
  await h.shot("14-extrude-two-sides");
  await ok();
  v = await vol();
  check("two sides 4 + 6", near(v, 1000), v);
  await newDoc();
  await sketchRect("XY", [0, 0], [10, 10]);
  await page.evaluate(() => app.commands.run("Extrude"));
  await page.waitForSelector('.dlg[data-dialog="Extrude"]');
  await fill("distance", "10 mm");
  await fill("taper", "10 deg");
  await ok();
  v = await vol();
  check("taper 10 deg grows the profile", v > 1000 && v < 2000, v);
  // disabled option is not selectable
  await page.evaluate(() => app.commands.run("Extrude"));
  await page.waitForSelector('.dlg[data-dialog="Extrude"]');
  await page.click('.dlg [data-input="startType"]');
  await page.click('.dlg-dd-menu [data-option="object"]');
  const stv = await page.evaluate(() => app.ui.dialog.current.values.startType);
  check("disabled dropdown options cannot be chosen", stv === "profile", stv);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await settle(100);

  // ------------------------------------------------------------ Hole: real canvas click on a face + from sketch points
  await newDoc();
  await page.evaluate(() => app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "40 mm", width: "40 mm", height: "10 mm", operation: "new" }));
  await fitView();
  const vb = await vol();
  await page.keyboard.press("h");
  await page.waitForSelector('.dlg[data-dialog="FusionHoleCommand"]');
  const sp2 = await page.evaluate(() => { const s = app.viewport.toScreen([5, 5, 10]); const r = app.viewport.canvas.getBoundingClientRect(); return [s[0] + r.left, s[1] + r.top]; });
  await page.mouse.move(sp2[0], sp2[1]);
  await settle(100);
  await page.mouse.click(sp2[0], sp2[1]);
  await settle(500);
  const hc = await page.evaluate(() => { const f = (app.ui.dialog.current.values.face || [])[0]; return f && f.p.map((x) => +x.toFixed(2)); });
  check("canvas click on a face places the hole there", hc && near(hc[0], 5, 0.6) && near(hc[1], 5, 0.6) && near(hc[2], 10, 1e-3), hc);
  await page.click('.dlg [data-input="extent"]');
  await page.click('.dlg-dd-menu [data-option="all"]');
  await page.click('.dlg [data-input="drillPoint"] [data-option="flat"]');
  await settle(300);
  await ok();
  v = await vol();
  check("through-all flat hole", near(vb - v, Math.PI * 25 * 10, 0.8), vb - v);

  await newDoc();
  await page.evaluate(() => app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "40 mm", width: "40 mm", height: "10 mm", operation: "new" }));
  await page.evaluate(() => {
    const S = app.S;
    const sk = S.newSketch();
    for (const [x, y] of [[-10, -10], [10, -10], [0, 10]]) S.addSketchPoint(sk, S.addPoint(sk, x, y));
    const plane = { o: [0, 0, 10], x: [1, 0, 0], n: [0, 0, 1] };
    app.addFeature({ type: "sketch", plane, planeRef: { kind: "face", body: "b1", p: [0, 0, 10], n: [0, 0, 1], plane }, sk });
  });
  const vb2 = await page.evaluate(() => app.bodies().reduce((s, b) => s + app.K.R.measureVolume(b.shape), 0));
  await page.evaluate(() => app.commands.run("FusionHoleCommand"));
  await page.waitForSelector('.dlg[data-dialog="FusionHoleCommand"]');
  await page.click('.dlg [data-input="placement"] [data-option="multi"]');
  await page.evaluate(() => { const d = app.ui.dialog.current; const s = app.sketchState(app.doc.features[1].id); for (const pid of Object.keys(s.sk.points)) if (!s.sk.points[pid].origin) d.pickRef("points", { kind: "sketchPoint", sketch: s.id, point: pid }); });
  await fill("depth", "5 mm");
  await page.click('.dlg [data-input="drillPoint"] [data-option="flat"]');
  await settle(300);
  await h.shot("15-hole-multi");
  await ok();
  v = await vol();
  check("three holes from sketch points", near(vb2 - v, 3 * Math.PI * 25 * 5, 1.5), vb2 - v);

  // ------------------------------------------------------------ Fillet edge via a real canvas click + Edit Feature
  await newDoc();
  await page.evaluate(() => app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "40 mm", width: "40 mm", height: "20 mm", operation: "new" }));
  await fitView();
  await page.keyboard.press("f");
  await page.waitForSelector('.dlg[data-dialog="FusionFilletEdgesCommand"]');
  const ep = await page.evaluate(() => { const s = app.viewport.toScreen([20, 0, 20]); const r = app.viewport.canvas.getBoundingClientRect(); return [s[0] + r.left, s[1] + r.top]; });
  await page.mouse.move(ep[0], ep[1]);
  await settle(80);
  await page.mouse.click(ep[0], ep[1]);
  await settle(400);
  const ecount = await page.evaluate(() => (app.ui.dialog.current.values.edges || []).map((r) => r.kind + ":" + r.index));
  check("canvas click on an edge selects it", ecount.length === 1 && ecount[0].startsWith("edge:"), ecount);
  await fill("radius", "2 mm");
  await h.shot("16-fillet-clicked");
  await ok();
  const filletId = await page.evaluate(() => app.doc.features.find((f) => f.type === "fillet")?.id);
  check("fillet feature committed", !!filletId, filletId);
  if (filletId) {
    await page.evaluate((id) => app.editFeature(id), filletId);
    await page.waitForSelector('.dlg[data-dialog="FusionFilletEdgesCommand"][data-edit]');
    const er = await page.evaluate(() => ({ r: document.querySelector('.dlg [data-input="radius"]').value, n: document.querySelector('.dlg [data-input="edges"]').dataset.count }));
    check("edit fillet restores edges + radius", er.r === "2 mm" && er.n === "1", er);
    await fill("radius", "5 mm");
    await ok();
    v = await vol();
    check("edited fillet radius 5", near(32000 - v, (1 - Math.PI / 4) * 25 * 40, 0.5), 32000 - v);
  }

  // ------------------------------------------------------------ Mirror / Combine / Patterns / Move / Draft
  await newDoc();
  await page.evaluate(() => app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [20, 0], length: "10 mm", width: "10 mm", height: "10 mm", operation: "new" }));
  await page.evaluate(() => app.selection.set([{ kind: "body", body: "b1" }]));
  await page.evaluate(() => app.commands.run("MirrorCommand"));
  await page.waitForSelector('.dlg[data-dialog="MirrorCommand"]');
  await pick("plane", { kind: "originPlane", name: "YZ" });
  await settle(400);
  await ok();
  let nb2 = await page.evaluate(() => app.bodies().length);
  check("mirror creates a second body", nb2 === 2, nb2);
  await page.evaluate(() => app.commands.run("FusionCombineCommand"));
  await page.waitForSelector('.dlg[data-dialog="FusionCombineCommand"]');
  await page.evaluate(() => { const d = app.ui.dialog.current; const ids = app.bodies().map((b) => b.id); d.pickRef("target", { kind: "body", body: ids[0] }); d.pickRef("tools", { kind: "body", body: ids[1] }); });
  await settle(400);
  await ok();
  nb2 = await page.evaluate(() => app.bodies().length);
  v = await vol();
  check("combine join -> one body", nb2 === 1 && near(v, 2000), { nb2, v });
  await page.evaluate(() => app.commands.run("PatternRectangular"));
  await page.waitForSelector('.dlg[data-dialog="PatternRectangular"]');
  await page.evaluate(() => app.ui.dialog.current.pickRef("bodies", { kind: "body", body: app.bodies()[0].id }));
  const rpAct = await page.evaluate(() => ({ ok: document.querySelector(".dlg [data-action=ok]").disabled, dir: document.querySelector('.dlg [data-input="dir1"]')?.dataset.count }));
  check("rectangular pattern: Directions is a selection (OK waits for it)", rpAct.ok === true && rpAct.dir === "0", rpAct);
  // a linear body edge as Direction 1 (the edge along X at y=-5, z=10)
  const rpBody = await page.evaluate(() => app.bodies()[0].id);
  await pick("dir1", { kind: "edge", body: rpBody, index: -1, p: [20, -5, 10] });
  await fill("q1", "2");
  await fill("d1", "100 mm");
  const rpM = await page.evaluate(() => [...app.ui.dialog.current.manips.items.keys()]);
  check("rectangular pattern shows distance + quantity manipulators", rpM.includes("d1") && rpM.includes("q1"), rpM);
  await page.click('.dlg [data-input="flip1"]');
  await settle(400);
  await ok();
  const rpX = await page.evaluate(() => app.bodies().map((b) => Math.round(b.shape.boundingBox.bounds[0][0])).sort((a, b) => a - b));
  check("rectangular pattern x2 along a flipped edge direction", rpX.length === 2 && Math.abs(Math.abs(rpX[1] - rpX[0]) - 100) < 1e-6, rpX);
  await page.evaluate(() => app.commands.run("FusionMoveCommand"));
  await page.waitForSelector('.dlg[data-dialog="FusionMoveCommand"]');
  await page.evaluate(() => app.ui.dialog.current.pickRef("bodies", { kind: "body", body: app.bodies()[0].id }));
  await settle(400);
  const triad = await page.evaluate(() => [...app.ui.dialog.current.manips.items.values()].map((it) => `${it.def.id}:${it.def.type}${it.def.look ? "/" + it.def.look : ""}`));
  check("move shows Fusion's triad (axis arrows, planar handles, rotate rings, free-move ball)", ["tx:distance/axis", "ty:distance/axis", "tz:distance/axis", "pxy:plane", "pyz:plane", "pxz:plane", "free:plane/ball", "rx:angle", "ry:angle", "rz:angle"].every((x) => triad.includes(x)), triad);
  const ty0 = await page.evaluate(() => app.ui.dialog.current.manips.screenPoint("ty"));
  await fill("tz", "30 mm");
  const ty1 = await page.evaluate(() => app.ui.dialog.current.manips.screenPoint("ty"));
  check("the whole triad follows the moved body (Y arrow moves up with tz)", ty0 && ty1 && ty0[1] - ty1[1] > 20, { ty0, ty1 });
  await h.shot("17-move");
  await ok();
  const zmax = await page.evaluate(() => Math.max(...app.bodies().map((b) => b.shape.boundingBox.bounds[1][2])));
  check("move tz 30", near(zmax, 40, 1e-6), zmax);

  await newDoc();
  await page.evaluate(() => app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [30, 0], length: "10 mm", width: "10 mm", height: "10 mm", operation: "new" }));
  await page.evaluate(() => app.commands.run("PatternCircular"));
  await page.waitForSelector('.dlg[data-dialog="PatternCircular"]');
  await page.evaluate(() => { const d = app.ui.dialog.current; d.pickRef("bodies", { kind: "body", body: "b1" }); d.pickRef("axis", { kind: "originAxis", name: "Z" }); });
  await fill("count", "4");
  await ok();
  check("circular pattern x4", (await page.evaluate(() => app.bodies().length)) === 4);

  await newDoc();
  await page.evaluate(() => app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "20 mm", width: "20 mm", height: "20 mm", operation: "new" }));
  await page.evaluate(() => app.commands.run("FusionDraftCommand"));
  await page.waitForSelector('.dlg[data-dialog="FusionDraftCommand"]');
  await pick("plane", { kind: "originPlane", name: "XY" });
  await pick("faces", { kind: "face", body: "b1", index: -1, p: [10, 0, 10], n: [1, 0, 0], planar: true });
  await settle(400);
  const dres = await page.evaluate(() => app.ui.dialog.current.previewRes);
  await ok();
  v = await vol();
  check("draft changes the volume", dres && dres.ok !== false && !near(v, 8000, 1), { v, err: dres && dres.error });

  // ------------------------------------------------------------ Loft + Sweep + planes
  await newDoc();
  await page.evaluate(() => {
    const S = app.S, K = app.K;
    const a = S.newSketch(); S.addRect2pt(a, [-10, -10], [10, 10]);
    app.addFeature({ type: "sketch", plane: K.ORIGIN_PLANES.XY, planeRef: { kind: "origin", name: "XY" }, sk: a });
    const b = S.newSketch(); const c = S.addPoint(b, 0, 0); S.addCircle(b, c, 6);
    const pl = { o: [0, 0, 30], x: [1, 0, 0], n: [0, 0, 1] };
    app.addFeature({ type: "sketch", plane: pl, planeRef: { kind: "face", body: "none", p: pl.o, n: pl.n, plane: pl }, sk: b });
  });
  await page.evaluate(() => app.commands.run("SolidLoft"));
  await page.waitForSelector('.dlg[data-dialog="SolidLoft"]');
  await page.evaluate(() => { const d = app.ui.dialog.current; for (const s of app.result.state.sketches.values()) d.pickRef("profiles", { kind: "profile", sketch: s.id, key: s.regions.regions[0].key, c: [0, 0] }); });
  await settle(500);
  await fitView();
  await h.shot("18-loft");
  await ok();
  v = await vol();
  check("loft square -> circle", v > Math.PI * 36 * 30 && v < 400 * 30, v);

  await page.evaluate(() => app.commands.run("ConstructionPlaneAtAngleCommand"));
  await page.waitForSelector('.dlg[data-dialog="ConstructionPlaneAtAngleCommand"]');
  await pick("axis", { kind: "originAxis", name: "X" });
  await fill("angle", "45 deg");
  await ok();
  check("plane at angle created", (await page.evaluate(() => app.result.state.planes.size)) === 1);
  await page.evaluate(() => app.commands.run("ConstructionMidPlaneCommand"));
  await page.waitForSelector('.dlg[data-dialog="ConstructionMidPlaneCommand"]');
  await pick("p1", { kind: "originPlane", name: "XY" });
  await pick("p2", { kind: "face", body: "b1", index: -1, p: [0, 0, 30], n: [0, 0, 1], planar: true });
  await settle(300);
  await ok();
  const mz = await page.evaluate(() => [...app.result.state.planes.values()].map((p) => p.plane.o[2]));
  check("midplane between z=0 and z=30", mz.some((z) => near(z, 15, 1e-6)), mz);

  // ------------------------------------------------------------ type-to-edit, external (browser) selection, revolve angle arrow
  await newDoc();
  await sketchRect("XY", [0, 0], [10, 10]);
  await fitView();
  await page.evaluate(() => app.commands.run("Extrude"));
  await page.waitForSelector('.dlg[data-dialog="Extrude"]');
  await settle(300);
  await page.mouse.click(200, 700); // focus the canvas (empty space)
  await page.keyboard.type("25");
  await settle(100);
  const typed = await page.evaluate(() => [document.querySelector(".dlg-manip-input").value, document.querySelector('.dlg [data-input="distance"]').value]);
  await page.keyboard.press("Enter");
  await settle(300);
  v = await vol();
  check("typing a number on the canvas edits the manipulator value (dialog field follows); Enter = OK", typed[0] === "25" && typed[1] === "25" && near(v, 2500), { typed, v });
  // negative values typed into the box keep the box alive while the text is mid-edit ("-")
  await sketchRect({ o: [0, 0, 25], x: [1, 0, 0], n: [0, 0, 1] }, [2, 2], [8, 8]);
  await page.evaluate(() => app.commands.run("Extrude"));
  await page.waitForSelector('.dlg[data-dialog="Extrude"]');
  await settle(300);
  await page.mouse.click(200, 700);
  await page.keyboard.type("-5");
  await settle(400);
  const neg = await page.evaluate(() => ({ box: document.querySelector(".dlg-manip-input") && document.querySelector(".dlg-manip-input").value, op: app.ui.dialog.current.values.operation }));
  await page.keyboard.press("Enter");
  await settle(300);
  v = await vol();
  check("typing -5 cuts a pocket (auto Cut)", neg.box === "-5" && neg.op === "cut" && near(v, 2500 - 36 * 5), { neg, v });

  await page.evaluate(() => app.commands.run("ConstructionPlaneOffsetFromPlaneCommand"));
  await page.waitForSelector('.dlg[data-dialog="ConstructionPlaneOffsetFromPlaneCommand"]');
  await page.evaluate(() => app.selection.add({ kind: "originPlane", name: "YZ" })); // e.g. picked in the browser
  await settle(300);
  const ext = await page.evaluate(() => (app.ui.dialog.current.values.plane || []).map((r) => r.kind + ":" + r.name));
  check("selection made in the browser feeds the active selection row", ext.join() === "originPlane:YZ", ext);
  await page.keyboard.press("Escape");
  await settle(100);

  await newDoc();
  await sketchRect("XZ", [10, 0], [20, 10]);
  await page.evaluate(() => app.commands.run("Revolve"));
  await page.waitForSelector('.dlg[data-dialog="Revolve"]');
  await pick("axis", { kind: "originAxis", name: "Z" });
  await fill("angle", "90 deg");
  await fitView();
  await settle(300);
  const ap = await page.evaluate(() => { const p = app.ui.dialog.current.manips.screenPoint("angle"); const r = app.viewport.canvas.getBoundingClientRect(); return p && [p[0] + r.left, p[1] + r.top]; });
  await h.shot("19-revolve-angle");
  if (ap) {
    await page.mouse.move(ap[0], ap[1]);
    await page.mouse.down();
    await page.mouse.move(ap[0] - 40, ap[1] + 10, { steps: 8 });
    await page.mouse.up();
    await settle(400);
  }
  const ang = await page.evaluate(() => app.ui.dialog.current.values.angle);
  check("dragging the revolve angle handle changes the angle", ap && ang !== "90 deg" && ang !== "90.0 deg", ang);
  await fill("angle", "90 deg");
  await ok();
  v = await vol();
  check("revolve 90 deg", near(v, (Math.PI * 300 * 10) / 4, 1), v);

  // ------------------------------------------------------------ Press Pull routing (no preselection) + Delete dialog + Hole edit
  await newDoc();
  await page.evaluate(() => app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "20 mm", width: "20 mm", height: "20 mm", operation: "new" }));
  await fitView();
  await page.keyboard.press("q");
  await page.waitForSelector('.dlg[data-dialog="FusionPressPullCommand"] [data-input="sel"]');
  await pick("sel", { kind: "edge", body: "b1", index: -1, p: [10, 0, 20] });
  await page.waitForSelector('.dlg[data-dialog="FusionFilletEdgesCommand"]');
  const routed = await page.evaluate(() => (app.ui.dialog.current.values.edges || []).length);
  check("press pull on an edge switches to Fillet with the edge", routed === 1, routed);
  await page.keyboard.press("Escape");
  await settle(100);
  await page.keyboard.press("q");
  await page.waitForSelector('.dlg[data-dialog="FusionPressPullCommand"] [data-input="sel"]');
  await pick("sel", { kind: "face", body: "b1", index: -1, p: [0, 0, 20], n: [0, 0, 1], planar: true });
  await page.waitForSelector('.dlg[data-dialog="FusionPressPullCommand"] [data-input="faces"]');
  await fill("distance", "-5 mm");
  await ok();
  v = await vol();
  check("press pull -5 mm removes material (cut)", near(v, 20 * 20 * 15), v);
  const ppId = await page.evaluate(() => app.doc.features.find((f) => f.pressPull)?.id);
  await page.evaluate((id) => app.editFeature(id), ppId);
  await page.waitForSelector('.dlg[data-dialog="FusionPressPullCommand"][data-edit]');
  const ppv = await page.evaluate(() => ({ d: document.querySelector('.dlg [data-input="distance"]').value, n: document.querySelector('.dlg [data-input="faces"]').dataset.count }));
  check("edit press pull restores face + distance", ppv.d === "-5 mm" && ppv.n === "1", ppv);
  await page.keyboard.press("Escape");
  await settle(100);
  await page.evaluate(() => { app.selection.clear(); app.commands.run("FusionDeleteCommand"); });
  await page.waitForSelector('.dlg[data-dialog="FusionDeleteCommand"]');
  await page.evaluate(() => app.ui.dialog.current.pickRef("objects", { kind: "face", body: "b1", index: 0, p: [0, 0, 15], n: [0, 0, 1], planar: true }));
  await settle(100);
  await ok();
  check("Delete dialog deletes the picked body", (await page.evaluate(() => app.bodies().length)) === 0);

  await newDoc();
  await page.evaluate(() => app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "20 mm", width: "20 mm", height: "20 mm", operation: "new" }));
  await page.evaluate(() => app.commands.run("FusionHoleCommand"));
  await page.waitForSelector('.dlg[data-dialog="FusionHoleCommand"]');
  await pick("face", { kind: "face", body: "b1", index: -1, p: [2, 3, 20], n: [0, 0, 1], planar: true });
  await page.click('.dlg [data-input="holeType"] [data-option="countersink"]');
  await settle(300);
  await ok();
  const hid = await page.evaluate(() => app.doc.features.find((f) => f.type === "hole").id);
  await page.evaluate((id) => app.editFeature(id), hid);
  await page.waitForSelector('.dlg[data-dialog="FusionHoleCommand"][data-edit]');
  const hv = await page.evaluate(() => ({ t: document.querySelector('.dlg [data-input="holeType"]').dataset.value, n: document.querySelector('.dlg [data-input="face"]').dataset.count, p: app.ui.dialog.current.values.face[0].p }));
  check("edit hole restores type + face", hv.t === "countersink" && hv.n === "1" && near(hv.p[0], 2, 1e-6), hv);
  await fill("diameter", "6 mm");
  await ok();
  check("edited hole recomputes", (await page.evaluate(() => app.featureResult(app.doc.features.find((f) => f.type === "hole").id).ok)) === true);

  // ------------------------------------------------------------ Box: click on the plane places the centre
  await newDoc();
  await page.evaluate(() => app.selection.set([{ kind: "originPlane", name: "XY" }]));
  await page.evaluate(() => app.commands.run("PrimitiveBox"));
  await page.waitForSelector('.dlg[data-dialog="PrimitiveBox"]');
  await settle(200);
  const act = await page.evaluate(() => app.ui.dialog.current.active);
  const bp = await page.evaluate(() => { const s = app.viewport.toScreen([30, 10, 0]); const r = app.viewport.canvas.getBoundingClientRect(); return [s[0] + r.left, s[1] + r.top]; });
  await page.mouse.click(bp[0], bp[1]);
  await settle(400);
  const ctr = await page.evaluate(() => app.ui.dialog.current.values.center);
  check("preselected plane: next click places the box centre", act === null && ctr && near(ctr[0], 30, 0.8) && near(ctr[1], 10, 0.8), { act, ctr });
  await ok();
  const bbx = await page.evaluate(() => app.bodies()[0].shape.boundingBox.bounds);
  check("box placed at the clicked centre", near((bbx[0][0] + bbx[1][0]) / 2, 30, 0.8), bbx);

  // ------------------------------------------------------------ Fusion keyboard flow (refs 13/14/17): HUD focused on start
  await newDoc();
  await sketchRect("XY", [0, 0], [40, 20]);
  await fitView();
  await page.mouse.move(700, 300);
  await page.keyboard.press("e");
  await page.waitForSelector('.dlg[data-dialog="Extrude"]');
  const kf = await page.evaluate(() => { const a = document.activeElement; return { focus: a && a.dataset.manip, sel: a && a.selectionEnd - a.selectionStart, status: app.status, ok: !document.querySelector(".dlg [data-action=ok]").disabled, dist: document.querySelector(".dlg [data-input=distance]").value, taper: document.querySelector(".dlg [data-input=taper]").value }; });
  check("Extrude: 0.00 mm / 0.0 deg, OK disabled, HUD focused with its text selected, status '1 Profile | Area : 800.00 mm^2'", kf.focus === "distance" && kf.sel === 7 && kf.status === "1 Profile | Area : 800.00 mm^2" && !kf.ok && kf.dist === "0.00 mm" && kf.taper === "0.0 deg", kf);
  await page.keyboard.type("10");
  await page.keyboard.press("Tab");
  await settle(150);
  const tf = await page.evaluate(() => { const a = document.activeElement; return { focus: a && a.dataset.manip, dist: document.querySelector(".dlg [data-input=distance]").value, ok: !document.querySelector(".dlg [data-action=ok]").disabled }; });
  check("typing 10 then Tab sets the distance and moves the HUD to the taper box", tf.focus === "taper" && tf.dist === "10 mm" && tf.ok, tf);
  await page.keyboard.type("5");
  await page.keyboard.press("Enter");
  await settle(300);
  v = await vol();
  check("5 + Enter in the taper box commits a tapered extrude", !(await dlgOpen("Extrude")) && v > 8000 && v < 12000, v);
  check("status text cleared when the dialog closes", !/Profile/.test(await page.evaluate(() => app.status || "")));

  await newDoc();
  await page.evaluate(() => app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "40 mm", width: "40 mm", height: "20 mm", operation: "new" }));
  await fitView();
  await page.keyboard.press("f");
  await page.waitForSelector('.dlg[data-dialog="FusionFilletEdgesCommand"]');
  const fd = await page.evaluate(() => ({ ok: !document.querySelector(".dlg [data-action=ok]").disabled, r: document.querySelector(".dlg [data-input=radius]").value, sel: document.querySelector(".dlg [data-input=edges]").textContent.trim() }));
  const ep2 = await page.evaluate(() => { const s = app.viewport.toScreen([20, 0, 20]); const r = app.viewport.canvas.getBoundingClientRect(); return [s[0] + r.left, s[1] + r.top]; });
  await page.mouse.move(ep2[0], ep2[1]);
  await settle(80);
  await page.mouse.click(ep2[0], ep2[1]);
  await settle(400);
  const ff = await page.evaluate(() => { const a = document.activeElement; return { focus: a && a.dataset.manip, status: app.status, set: document.querySelector(".dlg .dlg-set-count").textContent }; });
  check("Fillet: default 0.00 mm with OK disabled; picking an edge shows '1 Edge', status 'Edge' and focuses the HUD", fd.r === "0.00 mm" && !fd.ok && fd.sel === "Select" && ff.focus === "radius" && ff.status === "Edge" && ff.set === "1 Edge", { fd, ff });
  await page.keyboard.type("2");
  await page.keyboard.press("Enter");
  await settle(300);
  v = await vol();
  check("F, click edge, 2, Enter fillets the edge", !(await dlgOpen("FusionFilletEdgesCommand")) && near(32000 - v, (1 - Math.PI / 4) * 4 * 40, 0.3), 32000 - v);

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
