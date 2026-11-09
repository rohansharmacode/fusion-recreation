// Sketch tools e2e: every drawing / dimension / constraint / modify tool driven with the real mouse.
//   node tests/e2e/sketch-tools.mjs [--only=viewport,sketch]
import { launch } from "./harness.mjs";

const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7) || "viewport,sketch";
const h = await launch({ only, outDir: process.env.E2E_OUT || "build/sketch", port: Number(process.env.E2E_PORT) || 5314, shots: process.env.E2E_SHOTS || "tests/e2e/out/sketch", build: !process.argv.includes("--nobuild") });
const { page } = h;
let fails = 0;
const check = (cond, msg, extra) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}${extra !== undefined ? "  " + JSON.stringify(extra) : ""}`); if (!cond) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.evaluate(() => {
  window.__t = {
    p(u, v) {
      const s = app.sketchState(app.activeSketch);
      const q = app.viewport.toScreen(app.K.toWorld(s.plane, u, v));
      const r = app.viewport.canvas.getBoundingClientRect();
      return [r.left + q[0], r.top + q[1]];
    },
    sk() { return app.sketchState(app.activeSketch).sk; },
    st() { return app.sketchState(app.activeSketch); },
    counts() {
      const s = app.sketchState(app.activeSketch);
      const c = {};
      for (const cv of Object.values(s.sk.curves)) c[cv.type] = (c[cv.type] || 0) + 1;
      const k = {};
      for (const x of s.sk.constraints) k[x.type] = (k[x.type] || 0) + 1;
      return { curves: c, cons: k, regions: s.regions.regions.length, ok: s.status.ok, nCurves: Object.keys(s.sk.curves).length };
    },
    frame(u0, v0, u1, v1) {
      const s = app.sketchState(app.activeSketch);
      const t = app.K.toWorld(s.plane, (u0 + u1) / 2, (v0 + v1) / 2);
      const view = app.viewport.getView();
      const size = Math.max(u1 - u0, (v1 - v0) * 1.8);
      const fov = (app.viewport.camera.fov || 30) * Math.PI / 180;
      return app.viewport.setViewState({ target: t, quat: view.quat, dist: size / (2 * Math.tan(fov / 2)) * 1.1 }, { animate: false });
    },
    newSketch() {
      if (app.mode === "sketch") app.commands.run("SketchStop");
      app.selection.set([{ kind: "originPlane", name: "XY" }]);
      app.commands.run("SketchCreate");
    },
  };
});
const P = (u, v) => page.evaluate(([u, v]) => __t.p(u, v), [u, v]);
const counts = () => page.evaluate(() => __t.counts());
async function clickAt(u, v) { const p = await P(u, v); await page.mouse.move(p[0], p[1], { steps: 3 }); await page.mouse.click(p[0], p[1]); await h.frames(1); }
async function moveTo(u, v) { const p = await P(u, v); await page.mouse.move(p[0], p[1], { steps: 4 }); await h.frames(1); }
async function cmd(id) { await page.evaluate((i) => app.commands.run(i), id); await h.frames(1); }
async function esc() { await page.keyboard.press("Escape"); await h.frames(1); }
async function fresh() {
  await page.evaluate(() => __t.newSketch());
  await wait(450);
  await page.evaluate(() => { app.viewport.setGridPlane && app.viewport._vp && app.viewport._vp.setGridPref && app.viewport._vp.setGridPref("snap", false, false); });
}

try {
  // ======== sketch 1: lines, tangent arc, close ========
  await fresh();
  let c = await counts();
  check(c.nCurves === 0, "new empty sketch via pre-selected XY plane");
  await page.keyboard.press("l");
  await clickAt(0, 0);
  await clickAt(40, 0);
  await clickAt(40, 20);
  // click-drag from the last point -> tangent arc
  const a0 = await P(40, 20), a1 = await P(20, 40);
  await page.mouse.move(a0[0], a0[1]);
  await page.mouse.down();
  await page.mouse.move((a0[0] + a1[0]) / 2 - 20, (a0[1] + a1[1]) / 2, { steps: 4 });
  await page.mouse.move(a1[0], a1[1], { steps: 6 });
  await h.frames(2);
  await h.shot("t01-tangent-arc-drag");
  await page.mouse.up();
  await h.frames(2);
  await clickAt(0, 40);
  await clickAt(0, 0); // close on the start point
  await h.frames(2);
  c = await counts();
  check(c.curves.line === 4 && c.curves.arc === 1, "line chain with a tangent arc", c.curves);
  check(c.cons.tangent >= 1, "tangent constraint on the drag arc", c.cons);
  check(c.cons.horizontal >= 1 && c.cons.vertical >= 1, "auto horizontal/vertical constraints", c.cons);
  check(c.regions === 1, "closed loop gives one profile", c.regions);
  await esc();
  await h.shot("t02-line-arc-closed");

  // ---- dimension tool: single line, then angle between two lines ----
  await page.keyboard.press("d");
  await clickAt(20, 0); // bottom line
  await moveTo(20, -8);
  await h.frames(1);
  await h.shot("t03-dim-preview");
  await clickAt(20, -8);
  await page.keyboard.type("45");
  await page.keyboard.press("Enter");
  await h.frames(2);
  c = await counts();
  check(c.cons.distance === 1, "Sketch Dimension on a line", c.cons);
  const w = await page.evaluate(() => { const s = __t.sk(); const d = s.constraints.find((k) => k.type === "distance"); const l = s.curves[d.refs[0]]; return Math.hypot(s.points[l.p1].x - s.points[l.p2].x, s.points[l.p1].y - s.points[l.p2].y); });
  check(Math.abs(w - 45) < 1e-6, "line driven to 45 mm", w);
  await esc();
  await esc();

  // ---- construction toggle on a selected line, then delete it ----
  await page.keyboard.press("l");
  await clickAt(60, 0);
  await clickAt(80, 30);
  await esc();
  await esc();
  const mid = await P(70, 15);
  await page.mouse.click(mid[0], mid[1]);
  await page.keyboard.press("x");
  await h.frames(2);
  let cons = await page.evaluate(() => Object.values(__t.sk().curves).filter((x) => x.cons).length);
  check(cons === 1, "X toggles the selected line to construction", cons);
  await h.shot("t04-construction");
  await page.mouse.click(mid[0], mid[1]);
  await page.keyboard.press("Delete");
  await h.frames(2);
  c = await counts();
  check(c.curves.line === 4, "Delete removes the selected line", c.curves);

  // ---- constraints: a free line made parallel then equal to the bottom line ----
  await page.keyboard.press("l");
  await clickAt(60, 10);
  await clickAt(75, 25);
  await esc();
  await esc();
  await cmd("ConstraintParallel");
  await clickAt(67.5, 17.5);
  await clickAt(10, 0);
  await h.frames(2);
  c = await counts();
  check(c.cons.parallel === 1, "Parallel constraint by picking two lines", c.cons);
  await esc();
  await cmd("ConstraintEqual");
  const sel = await page.evaluate(() => { const s = __t.sk(); const ids = Object.keys(s.curves).filter((k) => s.curves[k].type === "line"); const L = s.curves[ids[ids.length - 1]]; return [(s.points[L.p1].x + s.points[L.p2].x) / 2, (s.points[L.p1].y + s.points[L.p2].y) / 2]; });
  await clickAt(sel[0], sel[1]);
  await clickAt(10, 0);
  await h.frames(2);
  c = await counts();
  check(c.cons.equal === 1, "Equal constraint", c.cons);
  const lens = await page.evaluate(() => { const s = __t.sk(); return Object.values(s.curves).filter((x) => x.type === "line").map((L) => +Math.hypot(s.points[L.p1].x - s.points[L.p2].x, s.points[L.p1].y - s.points[L.p2].y).toFixed(3)); });
  check(lens.filter((x) => Math.abs(x - 45) < 1e-3).length >= 2, "equal line follows the 45 mm dimension", lens);
  await esc();
  await h.shot("t05-constraints");
  // redundant constraint is refused
  const hBefore = (await counts()).cons.horizontal;
  await cmd("ConstraintHorizontalVertical");
  await clickAt(10, 0);
  await h.frames(2);
  c = await counts();
  check(c.cons.horizontal === hBefore, "already-horizontal line is not constrained twice", c.cons);
  await esc();

  // ======== sketch 2: shapes ========
  await fresh();
  // 3-point rectangle
  await cmd("ShapeRectangleThreePoint");
  await clickAt(0, 0);
  await clickAt(20, 10);
  await clickAt(10, 30);
  // center rectangle
  await cmd("ShapeRectangleCenter");
  await clickAt(60, 10);
  await clickAt(70, 18);
  // 2-point circle and 3-point circle
  await cmd("CircleTwoPoint");
  await clickAt(-40, 0);
  await clickAt(-20, 0);
  await cmd("CircleThreePoint");
  await clickAt(-40, 30);
  await clickAt(-30, 40);
  await clickAt(-20, 30);
  await esc();
  c = await counts();
  check(c.curves.circle === 2, "2-point and 3-point circles", c.curves);
  check(c.curves.line === 10, "3-point + center rectangles (with construction diagonals)", c.curves);
  // arcs
  await cmd("ArcThreePoint");
  await clickAt(0, -30);
  await clickAt(20, -30);
  await clickAt(10, -24);
  await cmd("ArcCenterTwoPoint");
  await clickAt(50, -30);
  await clickAt(60, -30);
  await moveTo(57, -23);
  await moveTo(50, -20);
  await clickAt(42, -25);
  await esc();
  c = await counts();
  check(c.curves.arc === 2, "3-point and center point arcs", c.curves);
  // polygon with 5 sides typed
  await cmd("ShapePolygonInscribed");
  await clickAt(-40, -30);
  await moveTo(-30, -30);
  await page.keyboard.press("Tab");
  await page.keyboard.type("5");
  await page.keyboard.press("Enter");
  await h.frames(2);
  c = await counts();
  check(c.curves.line === 15, "inscribed pentagon from the typed edge count", c.curves);
  // slot
  await cmd("ShapeSlotCenterToCenter");
  await clickAt(40, -55);
  await clickAt(60, -55);
  await clickAt(60, -51);
  await esc();
  c = await counts();
  check(c.curves.arc === 4, "center-to-center slot adds two arcs", c.curves);
  // point
  await cmd("DrawPoint");
  await clickAt(70, 40);
  await esc();
  c = await counts();
  check(c.curves.point === 1, "sketch point", c.curves);
  check(c.ok, "sketch still solves", c.ok);
  await page.mouse.move(10, 10);
  await h.frames(2);
  await h.shot("t06-shapes");
  check(c.regions === 6, "all closed shapes are profiles (arcs are open)", c.regions);

  // ======== sketch 3: fillet, offset, mirror, extend, trim ========
  await fresh();
  await page.keyboard.press("r");
  await clickAt(0, 0);
  await clickAt(40, 30);
  await esc();
  await cmd("FilletSketchCmd");
  await clickAt(40, 30); // corner point
  await page.keyboard.type("5");
  await page.keyboard.press("Enter");
  await h.frames(2);
  c = await counts();
  check(c.curves.arc === 1 && c.cons.radius === 1, "sketch fillet with radius dimension", { curves: c.curves, cons: c.cons });
  await esc();
  await h.shot("t07-fillet");
  // offset the whole loop outward by 3
  await page.keyboard.press("o");
  await clickAt(20, 0);
  await moveTo(20, -4);
  await page.keyboard.type("3");
  await page.keyboard.press("Enter");
  await h.frames(2);
  c = await counts();
  check(c.curves.line === 8 && c.curves.arc === 2, "offset chain (lines + arc)", c.curves);
  const areas = await page.evaluate(() => __t.st().regions.regions.map((r) => +r.area.toFixed(1)).sort((a, b) => a - b));
  check(areas.length === 2, "offset gives a ring profile + the inner profile", areas);
  await esc();
  await h.shot("t08-offset");
  // mirror a circle about a line
  await cmd("CircleCenterRadius");
  await clickAt(-20, 10);
  await clickAt(-15, 10);
  await esc();
  await page.keyboard.press("l");
  await clickAt(-5, -10);
  await clickAt(-5, 40);
  await esc();
  await esc();
  await cmd("MirrorSketchCommand");
  await clickAt(-15, 10); // objects: circle
  await page.click('.sk-dlg [data-input="line"]');
  await clickAt(-5, 20); // mirror line
  await h.frames(1);
  await h.shot("t09-mirror-preview");
  await page.click('.sk-dlg [data-action="ok"]');
  await h.frames(2);
  c = await counts();
  check(c.curves.circle === 2 && c.cons.symmetric >= 1, "mirror creates a symmetric circle", { curves: c.curves, cons: c.cons });
  // extend a short line to the mirror line
  await page.keyboard.press("l");
  await clickAt(-30, 30);
  await clickAt(-20, 30);
  await esc();
  await esc();
  await cmd("ExtendSketchCmd");
  await moveTo(-21, 30);
  await h.frames(1);
  await h.shot("t10-extend-hover");
  await clickAt(-21, 30);
  await esc();
  const ext = await page.evaluate(() => { const s = __t.sk(); const ids = Object.keys(s.curves).filter((k) => s.curves[k].type === "line"); const L = s.curves[ids[ids.length - 1]]; return Math.max(s.points[L.p1].x, s.points[L.p2].x); });
  check(Math.abs(ext - -5) < 1e-6, "extend reaches the mirror line", ext);
  await h.shot("t11-sketch3");

  // ======== sketch 4: model-mode Line (plane pick first), more constraints + dimensions ========
  await page.evaluate(() => { if (app.mode === "sketch") app.commands.run("SketchStop"); for (const f of app.doc.features) if (f.type === "sketch") f.visible = false; app.recompute(); app.viewport.setView("home", { animate: false }); });
  await wait(400);
  await page.mouse.move(300, 300);
  await page.keyboard.press("l"); // model mode: asks for a plane first
  await h.frames(3);
  const pp = await page.evaluate(() => app.input.top() && app.input.top().name);
  check(pp === "sketch-planepick", "L in the model environment starts the plane pick", pp);
  const xz = await page.evaluate(() => {
    const r = app.viewport.canvas.getBoundingClientRect();
    for (let y = 20; y < r.height - 20; y += 10) for (let x = 20; x < r.width - 320; x += 10) {
      const hit = app.viewport.pick(x, y, { filter: (q) => q.kind === "originPlane" });
      if (hit && hit.ref.name === "XZ") return [r.left + x, r.top + y];
    }
    return null;
  });
  check(!!xz, "XZ plane pickable", xz);
  if (xz) { await page.mouse.move(xz[0], xz[1], { steps: 2 }); await page.mouse.click(xz[0], xz[1]); }
  await wait(500);
  const lt = await page.evaluate(() => ({ mode: app.mode, tool: app.ui.sketch.tool, n: app.feature(app.activeSketch).plane.n }));
  check(lt.mode === "sketch" && lt.tool === "DrawPolyline" && lt.n[1] === -1, "sketch created on XZ and the Line tool continues", lt);
  await page.evaluate(() => app.viewport._vp && app.viewport._vp.setGridPref && app.viewport._vp.setGridPref("snap", false, false));
  await page.evaluate(() => __t.frame(-20, -30, 110, 50));
  await h.frames(3);
  // two separate lines
  await clickAt(0, 0); await clickAt(30, 5); await page.keyboard.press("Enter");
  await clickAt(0, 20); await clickAt(30, 30); await esc();
  // Esc semantics: first Esc ended the tool, a second Esc clears the selection
  const l2mid = await P(15, 25);
  await page.mouse.click(l2mid[0], l2mid[1]);
  const nsel = await page.evaluate(() => app.selection.items.length);
  await esc();
  const nsel2 = await page.evaluate(() => app.selection.items.length);
  check(nsel === 1 && nsel2 === 0, "Esc clears the selection when no tool is active", [nsel, nsel2]);
  const ids = await page.evaluate(() => Object.keys(__t.sk().curves));
  // perpendicular via pre-selection
  await page.evaluate((ids) => { app.selection.set(ids.map((id) => ({ kind: "sketchCurve", sketch: app.activeSketch, curve: id }))); app.commands.run("ConstraintPerpendicular"); }, ids);
  await h.frames(2);
  c = await counts();
  check(c.cons.perpendicular === 1 && c.ok, "Perpendicular from the pre-selection", c.cons);
  // angle dimension (two lines) is redundant now -> driven
  await page.keyboard.press("d");
  const m1 = await page.evaluate((id) => { const s = __t.sk(); const L = s.curves[id]; return [(s.points[L.p1].x + s.points[L.p2].x) / 2, (s.points[L.p1].y + s.points[L.p2].y) / 2]; }, ids[0]);
  const m2 = await page.evaluate((id) => { const s = __t.sk(); const L = s.curves[id]; return [(s.points[L.p1].x + s.points[L.p2].x) / 2, (s.points[L.p1].y + s.points[L.p2].y) / 2]; }, ids[1]);
  await clickAt(m1[0], m1[1]);
  await clickAt(m2[0], m2[1]);
  await moveTo(m1[0] + 8, m1[1] + 12);
  await h.shot("t13-angle-dim-preview");
  await clickAt(m1[0] + 8, m1[1] + 12);
  await page.keyboard.press("Enter");
  await h.frames(2);
  c = await counts();
  const ang = await page.evaluate(() => __t.sk().constraints.filter((k) => k.type === "angle").map((k) => ({ driven: !!k.driven, expr: k.expr })));
  check(ang.length === 1 && ang[0].driven, "angle dimension on perpendicular lines becomes driven", ang);
  // point-to-point dimension (two endpoints)
  const e0 = await page.evaluate((id) => { const s = __t.sk(); const L = s.curves[id]; return [s.points[L.p1].x, s.points[L.p1].y]; }, ids[0]);
  const e1 = await page.evaluate((id) => { const s = __t.sk(); const L = s.curves[id]; return [s.points[L.p1].x, s.points[L.p1].y]; }, ids[1]);
  await clickAt(e0[0], e0[1]);
  await clickAt(e1[0], e1[1]);
  await clickAt(Math.max(e0[0], e1[0]) + 10, (e0[1] + e1[1]) / 2);
  await page.keyboard.type("25");
  await page.keyboard.press("Enter");
  await h.frames(2);
  const pdist = await page.evaluate(() => { const s = __t.sk(); const k = s.constraints.find((x) => x.type === "distance" && x.refs.length === 2); if (!k) return null; const a = s.points[k.refs[0]], b = s.points[k.refs[1]]; return { dimType: k.dimType, v: k.dimType === "vertical" ? Math.abs(a.y - b.y) : k.dimType === "horizontal" ? Math.abs(a.x - b.x) : Math.hypot(a.x - b.x, a.y - b.y) }; });
  check(pdist && Math.abs(pdist.v - 25) < 1e-6, "point-to-point dimension placed beside -> vertical 25", pdist);
  await esc(); await esc();
  // circle + arc: concentric, then tangent line, radius dimension
  await cmd("CircleCenterRadius");
  await clickAt(60, 10); await clickAt(66, 10);
  await cmd("ArcThreePoint");
  await clickAt(75, 10); await clickAt(95, 10); await clickAt(85, 18);
  await esc();
  const rc = await page.evaluate(() => { const s = __t.sk(); return { circle: Object.keys(s.curves).find((k) => s.curves[k].type === "circle"), arc: Object.keys(s.curves).find((k) => s.curves[k].type === "arc") }; });
  await page.evaluate((r) => { app.selection.set([{ kind: "sketchCurve", sketch: app.activeSketch, curve: r.circle }, { kind: "sketchCurve", sketch: app.activeSketch, curve: r.arc }]); app.commands.run("ConstraintConcentric"); }, rc);
  await h.frames(2);
  c = await counts();
  check(c.cons.concentric === 1 && c.ok, "Concentric circle + arc", c.cons);
  await page.keyboard.press("d");
  const arcPt = await page.evaluate((id) => { const s = __t.sk(); const a = s.curves[id]; const P = s.points[a.p1]; return [P.x, P.y]; }, rc.arc);
  const cc = await page.evaluate((id) => { const s = __t.sk(); const a = s.curves[id]; const C = s.points[a.c]; return [C.x, C.y, Math.abs(a.r)]; }, rc.arc);
  const onArc = await page.evaluate(([id, cx, cy, r]) => { const s = __t.sk(); const pl = app.S.curvePolyline(s, id, 16); return pl[Math.floor(pl.length / 2)]; }, [rc.arc, ...cc]);
  await clickAt(onArc[0], onArc[1]);
  await clickAt(onArc[0] + 6, onArc[1] + 6);
  await page.keyboard.type("12");
  await page.keyboard.press("Enter");
  await h.frames(2);
  const rad = await page.evaluate((id) => Math.abs(__t.sk().curves[id].r), rc.arc);
  check(Math.abs(rad - 12) < 1e-6, "radius dimension drives the arc", rad);
  void arcPt;
  await esc(); await esc();
  // fix / unfix a line
  await page.evaluate((id) => { app.selection.set([{ kind: "sketchCurve", sketch: app.activeSketch, curve: id }]); app.commands.run("ConstraintFix"); }, ids[0]);
  await h.frames(2);
  c = await counts();
  check(c.cons.fix === 1, "Fix/UnFix fixes the selected line", c.cons);
  const fixedCls = await page.evaluate((id) => !!__t.st().status.constrained[id], ids[0]);
  check(fixedCls, "fixed line reports fully constrained");
  await page.evaluate((id) => { app.selection.set([{ kind: "sketchCurve", sketch: app.activeSketch, curve: id }]); app.commands.run("ConstraintFix"); }, ids[0]);
  await h.frames(1);
  c = await counts();
  check(!c.cons.fix, "Fix/UnFix again unfixes", c.cons);
  // midpoint: point of line 2 onto line 1
  await cmd("ConstraintMidPoint");
  const l2s = await page.evaluate((id) => { const s = __t.sk(); const L = s.curves[id]; return [s.points[L.p1].x, s.points[L.p1].y]; }, ids[1]);
  await clickAt(l2s[0], l2s[1]);
  const l1m = await page.evaluate((id) => { const s = __t.sk(); const L = s.curves[id]; return [(s.points[L.p1].x + s.points[L.p2].x) / 2, (s.points[L.p1].y + s.points[L.p2].y) / 2]; }, ids[0]);
  await clickAt(l1m[0], l1m[1]);
  await h.frames(2);
  c = await counts();
  check(c.cons.midpoint === 1 && c.ok, "Midpoint constraint by picking a point and a line", c.cons);
  await esc();
  await h.shot("t14-constraints2");
  // glyph selection + delete removes the constraint
  const g = await page.evaluate(() => { const el = document.querySelector('.sk-glyph[data-type="midpoint"]'); if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  check(!!g, "midpoint glyph shown");
  if (g) {
    await page.mouse.click(g[0], g[1]);
    await page.keyboard.press("Delete");
    await h.frames(2);
    c = await counts();
    check(!c.cons.midpoint, "selecting a constraint glyph and pressing Delete removes it", c.cons);
  }
  // drag a free endpoint onto another endpoint -> coincident
  await page.keyboard.press("l");
  await clickAt(-18, -10); await clickAt(-8, -14); await page.keyboard.press("Enter");
  await clickAt(-4, -20); await clickAt(-12, -26); await esc();
  const da = await P(-8, -14), db = await P(-4, -20);
  await page.mouse.move(da[0], da[1]);
  await page.mouse.down();
  await page.mouse.move((da[0] + db[0]) / 2, (da[1] + db[1]) / 2, { steps: 4 });
  await page.mouse.move(db[0] + 2, db[1] + 1, { steps: 4 });
  await h.frames(3);
  await h.shot("t15-drop-coincident");
  await page.mouse.up();
  await h.frames(2);
  c = await counts();
  check(c.cons.coincident === 1 && c.ok, "dropping a dragged endpoint on another point adds a coincident constraint", c.cons);
  await cmd("SketchStop");

  // ======== sketch on a body face + project ========
  await page.evaluate(() => { if (app.mode === "sketch") app.commands.run("SketchStop"); app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [150, 0], length: "30 mm", width: "20 mm", height: "10 mm", operation: "new" }); });
  await h.frames(3);
  const top = await page.evaluate(() => {
    app.viewport.setView("home", { animate: false });
    return null;
  });
  void top;
  await wait(400);
  const face = await page.evaluate(() => {
    const r = app.viewport.canvas.getBoundingClientRect();
    for (let y = 20; y < r.height - 20; y += 8) for (let x = 20; x < r.width - 300; x += 8) {
      const hit = app.viewport.pick(x, y, { filter: (q) => q.kind === "face" });
      if (hit && hit.ref.n && hit.ref.n[2] > 0.99) return [r.left + x, r.top + y];
    }
    return null;
  });
  check(!!face, "top face of the box found", face);
  if (face) {
    await cmd("SketchCreate");
    await page.mouse.move(face[0], face[1], { steps: 3 });
    await page.mouse.click(face[0], face[1]);
    await wait(500);
    const f = await page.evaluate(() => { const f = app.feature(app.activeSketch); return { mode: app.mode, ref: f && f.planeRef && f.planeRef.kind, n: f && f.plane.n, o: f && f.plane.o }; });
    check(f.mode === "sketch" && f.ref === "face" && f.n[2] > 0.99 && Math.abs(f.o[2] - 10) < 1e-6, "sketch on a planar face", f);
    await cmd("ProjectNewCmd");
    const fp = await page.evaluate(() => { const q = app.viewport.toScreen([150, 0, 10]); const r = app.viewport.canvas.getBoundingClientRect(); return [r.left + q[0], r.top + q[1]]; });
    if (fp) { await page.mouse.move(fp[0], fp[1], { steps: 2 }); await page.mouse.click(fp[0], fp[1]); }
    await h.frames(2);
    await esc();
    c = await counts();
    check(c.curves.line === 4 && c.regions === 1, "Project face -> 4 projected lines forming a profile", c);
    const proj = await page.evaluate(() => Object.values(__t.sk().curves).every((x) => x.proj));
    check(proj, "projected curves are flagged/fixed");
    await h.shot("t12-face-project");
    await cmd("SketchStop");
  }
  if (h.errors.length) console.log("page errors:\n" + h.errors.join("\n"));
  check(h.errors.length === 0, "no console errors", h.errors.length);
} catch (e) {
  console.error(e);
  fails++;
  try { await h.shot("zz-tools-error"); } catch { /* ignore */ }
} finally {
  await h.close();
}
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exitCode = fails ? 1 : 0;
