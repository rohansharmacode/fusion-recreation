// Sketch environment e2e test (real mouse + keyboard on the canvas).
//   node tests/e2e/sketch-ui.mjs [--only=viewport,sketch] [--headed]
// Create Sketch on XY -> 2-point rectangle from the origin with typed dimensions -> fully constrained,
// one profile -> circle with typed diameter -> dimension edit -> drag -> trim -> finish -> edit -> undo.
import { launch } from "./harness.mjs";

const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7) || "viewport,sketch";
const headed = process.argv.includes("--headed");
const h = await launch({ only, outDir: process.env.E2E_OUT || "build/sketch", port: Number(process.env.E2E_PORT) || 5314, shots: process.env.E2E_SHOTS || "tests/e2e/out/sketch", headless: !headed });
const { page } = h;
let fails = 0;
const check = (cond, msg, extra) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}${extra !== undefined ? "  " + JSON.stringify(extra) : ""}`); if (!cond) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// page helpers
await page.evaluate(() => {
  window.__sk = {
    canvasRect() { const r = app.viewport.canvas.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
    /** page coords of sketch point (u, v) of the active sketch */
    sk2page(u, v) {
      const s = app.sketchState(app.activeSketch);
      const w = app.K.toWorld(s.plane, u, v);
      const p = app.viewport.toScreen(w);
      const r = app.viewport.canvas.getBoundingClientRect();
      return [r.left + p[0], r.top + p[1]];
    },
    findPlane(name) {
      const r = app.viewport.canvas.getBoundingClientRect();
      for (let y = 20; y < r.height - 20; y += 12) for (let x = 20; x < r.width - 20; x += 12) {
        const hit = app.viewport.pick(x, y, { filter: (q) => q.kind === "originPlane" });
        if (hit && hit.ref.name === name) return [r.left + x, r.top + y];
      }
      return null;
    },
    info() {
      const id = app.activeSketch || (app.doc.features.filter((f) => f.type === "sketch").slice(-1)[0] || {}).id;
      const s = id && app.sketchState(id);
      if (!s) return { id, mode: app.mode };
      const cons = s.sk.constraints;
      return {
        id, mode: app.mode, tool: app.ui.sketch && app.ui.sketch.tool,
        curves: Object.values(s.sk.curves).map((c) => c.type),
        lines: Object.values(s.sk.curves).filter((c) => c.type === "line").length,
        dims: cons.filter((c) => ["distance", "diameter", "radius", "angle", "pointLine"].includes(c.type)).map((c) => ({ type: c.type, expr: c.expr, param: c.param, driven: !!c.driven })),
        regions: s.regions.regions.length,
        areas: s.regions.regions.map((r) => +r.area.toFixed(2)),
        fully: s.status.fully,
        allConstrained: Object.entries(s.status.constrained).every(([, v]) => v),
        usesOrigin: Object.values(s.sk.curves).some((c) => c.p1 === "o" || c.p2 === "o"),
        ok: s.status.ok,
        dimEls: document.querySelectorAll(".sk-dim:not(.preview)").length,
        glyphEls: document.querySelectorAll(".sk-glyph").length,
        palette: !!document.querySelector(".sk-palette") && document.querySelector(".sk-palette").style.display !== "none",
        marker: app.doc.marker,
      };
    },
  };
});

try {
  await h.frames(5);
  await h.shot("01-start");

  // ---- Create Sketch -> pick XY ----
  await page.evaluate(() => app.commands.run("SketchCreate"));
  await h.frames(4);
  const xy = await page.evaluate(() => __sk.findPlane("XY"));
  check(!!xy, "XY origin plane is pickable while creating a sketch", xy);
  if (xy) {
    await page.mouse.move(xy[0], xy[1]);
    await h.frames(3);
    await h.shot("02-plane-hover");
    await page.mouse.click(xy[0], xy[1]);
  }
  await wait(600);
  await h.frames(4);
  let info = await page.evaluate(() => __sk.info());
  check(info.mode === "sketch", "entered sketch mode", info.mode);
  check(info.palette, "sketch palette visible");
  await h.shot("03-sketch-entered");

  // ---- 2-point rectangle from the origin with typed width/height ----
  await page.keyboard.press("r");
  await h.frames(2);
  info = await page.evaluate(() => __sk.info());
  check(info.tool === "ShapeRectangleTwoPoint", "R starts 2-Point Rectangle", info.tool);
  const o = await page.evaluate(() => __sk.sk2page(0, 0));
  await page.mouse.move(o[0] + 3, o[1] - 2, { steps: 4 });
  await h.frames(2);
  await h.shot("04-snap-origin");
  await page.mouse.click(o[0] + 2, o[1] - 2);
  const c2 = await page.evaluate(() => __sk.sk2page(37, 23));
  await page.mouse.move(c2[0], c2[1], { steps: 8 });
  await h.frames(3);
  await h.shot("05-rect-preview");
  const hudCount = await page.evaluate(() => document.querySelectorAll(".sk-input").length);
  check(hudCount === 2, "rectangle shows width + height input boxes", hudCount);
  // Fusion focuses the height box first, Tab moves to the width: 30 high x 50 wide
  await page.keyboard.type("30");
  await page.keyboard.press("Tab");
  await page.keyboard.type("50");
  await h.frames(2);
  await h.shot("06-rect-typed");
  await page.keyboard.press("Enter");
  await h.frames(4);
  info = await page.evaluate(() => __sk.info());
  check(info.lines === 4, "rectangle has 4 lines", info.lines);
  check(info.usesOrigin, "first corner coincides with the sketch origin");
  check(info.dims.length === 2 && info.dims.every((d) => d.param && !d.driven), "two driving dimensions with parameters", info.dims);
  check(info.regions === 1 && Math.abs(info.areas[0] - 1500) < 1e-3, "one closed profile of 50 x 30", info.areas);
  check(info.fully && info.allConstrained, "rectangle fully constrained (black)", { fully: info.fully, all: info.allConstrained });
  check(info.dimEls === 2, "two dimension labels shown", info.dimEls);
  await page.mouse.move(c2[0] + 200, c2[1] + 120, { steps: 2 });
  await h.frames(2);
  const colours = await page.evaluate(() => {
    const out = [];
    app.viewport.groups.sketches.traverse((o) => { if (o.isLineSegments2 && o.userData.ref && o.userData.ref.kind === "sketchCurve") out.push("#" + o.material.color.getHexString()); });
    return out;
  });
  check(colours.length === 4 && colours.every((c) => c === "#000000"), "fully constrained curves render black (SketchFullyConstrainedColor 0,0,0)", colours);
  await page.mouse.move(c2[0] + 200, c2[1] + 120, { steps: 3 });
  await h.frames(3);
  await h.shot("07-rect-done");

  // ---- circle with a typed diameter inside the rectangle ----
  await page.keyboard.press("Escape");
  await page.keyboard.press("c");
  const cc = await page.evaluate(() => __sk.sk2page(25, 15));
  await page.mouse.move(cc[0], cc[1], { steps: 4 });
  await page.mouse.click(cc[0], cc[1]);
  const ce = await page.evaluate(() => __sk.sk2page(31, 15));
  await page.mouse.move(ce[0], ce[1], { steps: 5 });
  await h.frames(2);
  await page.keyboard.type("10");
  await page.keyboard.press("Enter");
  await h.frames(3);
  info = await page.evaluate(() => __sk.info());
  check(info.curves.includes("circle"), "circle created");
  check(info.dims.some((d) => d.type === "diameter" && /10/.test(d.expr)), "diameter dimension from the typed value", info.dims);
  check(info.regions === 2, "rectangle with hole + disc = 2 profiles", info.areas);
  await page.keyboard.press("Escape");
  await h.frames(2);
  await h.shot("08-circle");

  // ---- line chain: drag a free endpoint through the solver ----
  await page.keyboard.press("l");
  const l1 = await page.evaluate(() => __sk.sk2page(-45, 8));
  const l2 = await page.evaluate(() => __sk.sk2page(-20, 22));
  await page.mouse.move(l1[0], l1[1] - 30, { steps: 3 });
  await page.mouse.click(l1[0], l1[1] - 30);
  await page.mouse.move(l2[0], l2[1] - 30, { steps: 6 });
  await page.mouse.click(l2[0], l2[1] - 30);
  await page.keyboard.press("Escape");
  await h.frames(2);
  info = await page.evaluate(() => __sk.info());
  check(info.lines === 5, "free line added", info.lines);
  const end = await page.evaluate(() => {
    const s = app.sketchState(app.activeSketch);
    const ids = Object.keys(s.sk.curves).filter((k) => s.sk.curves[k].type === "line");
    const L = s.sk.curves[ids[ids.length - 1]];
    const P = s.sk.points[L.p2];
    return { pid: L.p2, uv: [P.x, P.y], page: __sk.sk2page(P.x, P.y) };
  });
  await page.mouse.move(end.page[0], end.page[1]);
  await page.mouse.down();
  await page.mouse.move(end.page[0] + 40, end.page[1] + 25, { steps: 8 });
  await h.frames(2);
  await h.shot("09-dragging");
  await page.mouse.up();
  await h.frames(3);
  const moved = await page.evaluate((pid) => { const s = app.sketchState(app.activeSketch); const P = s.sk.points[pid]; return [P.x, P.y]; }, end.pid);
  check(Math.hypot(moved[0] - end.uv[0], moved[1] - end.uv[1]) > 2, "dragging a free endpoint moves it", { before: end.uv, after: moved });
  // a fully constrained corner must not move
  const corner = await page.evaluate(() => __sk.sk2page(50, 30));
  const before = await page.evaluate(() => { const s = app.sketchState(app.activeSketch); return JSON.stringify(Object.values(s.sk.points).map((p) => [+p.x.toFixed(4), +p.y.toFixed(4)])); });
  await page.mouse.move(corner[0], corner[1]);
  await page.mouse.down();
  await page.mouse.move(corner[0] + 30, corner[1] + 30, { steps: 6 });
  await page.mouse.up();
  await h.frames(2);
  const after = await page.evaluate(() => { const s = app.sketchState(app.activeSketch); return JSON.stringify(Object.values(s.sk.points).map((p) => [+p.x.toFixed(4), +p.y.toFixed(4)])); });
  check(before === after, "fully constrained geometry does not move when dragged");

  // ---- edit a dimension by double-clicking its label ----
  const lab = await page.evaluate(() => {
    const el = [...document.querySelectorAll(".sk-dim:not(.preview)")].find((e) => /50\.00/.test(e.textContent));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  });
  check(!!lab, "50 mm dimension label found");
  if (lab) {
    await page.mouse.dblclick(lab[0], lab[1]);
    await h.frames(2);
    await page.keyboard.press("Control+A");
    await page.keyboard.type("60");
    await page.keyboard.press("Enter");
    await h.frames(3);
    info = await page.evaluate(() => __sk.info());
    check(info.dims.some((d) => d.type === "distance" && /60/.test(d.expr)), "dimension edited to 60", info.dims);
    check(info.areas.some((a) => Math.abs(a - (1800 - Math.PI * 25)) < 0.5), "profile follows the edited dimension", info.areas);
  }
  await h.shot("10-dim-edited");

  // ---- trim: remove the free line ----
  await page.keyboard.press("t");
  const tl = await page.evaluate(() => {
    const s = app.sketchState(app.activeSketch);
    const ids = Object.keys(s.sk.curves).filter((k) => s.sk.curves[k].type === "line");
    const L = s.sk.curves[ids[ids.length - 1]];
    const a = s.sk.points[L.p1], b = s.sk.points[L.p2];
    return __sk.sk2page((a.x + b.x) / 2, (a.y + b.y) / 2);
  });
  await page.mouse.move(tl[0], tl[1], { steps: 3 });
  await h.frames(2);
  await h.shot("11-trim-hover");
  await page.mouse.click(tl[0], tl[1]);
  await page.keyboard.press("Escape");
  await h.frames(2);
  info = await page.evaluate(() => __sk.info());
  check(info.lines === 4, "trim removed the free line", info.lines);

  // ---- finish sketch via the palette button ----
  const fin = await page.evaluate(() => { const b = document.querySelector(".sk-palette .sk-finish"); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.click(fin[0], fin[1]);
  await h.frames(4);
  info = await page.evaluate(() => __sk.info());
  check(info.mode === "model" && !info.palette, "Finish Sketch returns to the model", info.mode);
  check(info.dimEls === 0, "dimensions hidden outside the sketch", info.dimEls);
  // Finish Sketch animates the camera back to the view from before the sketch (Fusion capture 12)
  await page.waitForFunction(() => !(app.viewport.isAnimating && app.viewport.isAnimating()), null, { timeout: 4000 }).catch(() => {});
  const camBack = await page.evaluate(() => { const c = app.viewport.camera; const t = app.viewport.target; const d = [t[0] - c.position.x, t[1] - c.position.y, t[2] - c.position.z]; const l = Math.hypot(...d); return d.map((v) => v / l); });
  check(camBack[2] > -0.98, "camera returned to the pre-sketch (non top-down) view", camBack);
  await h.frames(2);
  // hover the ring profile in model mode
  const ring = await page.evaluate(() => {
    const id = app.doc.features.find((f) => f.type === "sketch").id;
    const s = app.sketchState(id);
    const w = app.K.toWorld(s.plane, 8, 8);
    const p = app.viewport.toScreen(w);
    const r = app.viewport.canvas.getBoundingClientRect();
    return [r.left + p[0], r.top + p[1]];
  });
  await page.mouse.move(ring[0], ring[1], { steps: 3 });
  await h.frames(3);
  const hov = await page.evaluate(() => app.selection.hover && app.selection.hover.kind);
  check(hov === "profile", "profile hover in model mode", hov);
  await h.shot("12-model-profile-hover");
  await page.mouse.click(ring[0], ring[1]);
  await h.frames(2);
  const sel = await page.evaluate(() => app.selection.items.map((r) => r.kind));
  check(sel.length === 1 && sel[0] === "profile", "profile selectable in model mode", sel);
  await h.shot("13-model-profile-selected");

  // ---- edit sketch again, undo ----
  await page.evaluate(() => app.editFeature(app.doc.features.find((f) => f.type === "sketch").id));
  await wait(500);
  info = await page.evaluate(() => __sk.info());
  check(info.mode === "sketch", "Edit Sketch re-enters the sketch", info.mode);
  const nCurves = info.curves.length;
  await page.evaluate(() => app.history.undo());
  await h.frames(3);
  info = await page.evaluate(() => __sk.info());
  check(info.mode === "sketch" && info.curves.length === nCurves + 1, "undo inside the sketch restores the trimmed line", info.curves.length);
  await page.evaluate(() => app.commands.run("SketchStop"));
  await h.frames(3);
  await h.shot("14-final");
  info = await page.evaluate(() => __sk.info());
  check(info.mode === "model", "SketchStop finishes", info.mode);
  if (h.errors.length) console.log("page errors:\n" + h.errors.join("\n"));
  check(h.errors.length === 0, "no console errors", h.errors.length);
} catch (e) {
  console.error(e);
  fails++;
  try { await h.shot("zz-error"); } catch { /* ignore */ }
} finally {
  await h.close();
}
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exitCode = fails ? 1 : 0;
