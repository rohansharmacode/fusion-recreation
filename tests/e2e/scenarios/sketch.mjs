// Sketch environment details: chained Line (L) with HUD length input, Center Diameter Circle (C),
// Sketch Dimension (D) on a line, constraint colours (blue -> black when fully constrained),
// construction toggle (X), Sketch Palette options, Esc ends tools, Finish Sketch via palette.
import { defineScenario, mainIfDirect, near, fmt } from "../lib.mjs";

const luma3 = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const sat3 = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);

async function enterSketchOnXY(t) {
  await t.click('#toolbar [data-cmd="SketchCreate"]');
  await t.settle(250);
  await t.cameraStable(3000);
  const cands = [];
  for (const s of [30, 20, 45, 10, 60, 6]) for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) cands.push([a * s, b * s, 0]);
  let aim = null;
  for (let i = 0; i < 6 && !aim; i++) {
    aim = await t.aim(cands, "h && h.ref && h.ref.kind === 'originPlane' && h.ref.name === 'XY'");
    if (!aim) await t.settle(400);
  }
  if (!aim) return false;
  await t.canvasClick(aim.x, aim.y);
  const ok = await t.waitFor(() => window.app.mode === "sketch", { timeout: 6000 });
  await t.cameraStable(3000);
  return ok;
}

const sketchInfo = (t) => t.app(() => {
  const a = window.app;
  const f = a.feature(a.activeSketch);
  const st = a.sketchState(a.activeSketch);
  if (!f) return null;
  return {
    curves: Object.entries(f.sk.curves).map(([id, c]) => ({ id, type: c.type, cons: !!c.cons, r: c.r })),
    points: st ? st.sk.points : f.sk.points,
    constraints: f.sk.constraints.map((c) => ({ type: c.type, expr: c.expr, param: c.param })),
    status: st ? st.status : null,
    regions: st && st.regions ? st.regions.regions.length : 0,
  };
});

const scenario = defineScenario({
  name: "sketch",
  title: "Sketch tools, HUD input, dimensions, palette",
  timeout: 150000,
  async run(t) {
    t.require("enter a sketch on XY by clicking the origin plane", await enterSketchOnXY(t));
    await t.shot("sketch-on-xy");

    // ---------- palette ----------
    t.step("Sketch Palette content");
    const pal = await t.app(() => document.querySelector(".sk-palette")?.innerText || "");
    t.check("palette titled SKETCH PALETTE", /SKETCH PALETTE/i.test(pal), pal.slice(0, 60));
    for (const lbl of ["Options", "Linetype", "Look At", "Sketch Grid", "Snap", "Slice", "Profile", "Points", "Dimensions", "Constraints", "Projected Geometries", "3D Sketch"]) {
      t.check(`palette option "${lbl}"`, pal.includes(lbl), "");
    }
    t.check("palette has Finish Sketch", /Finish Sketch/i.test(pal));
    const palBox = await t.box(".sk-palette");
    t.check("palette docked on the right side of the canvas", palBox && palBox.x > 1600 * 0.6, palBox && `x=${Math.round(palBox.x)}`);

    // ---------- line chain with HUD ----------
    t.step("L: click, type length 30, Enter, click, Esc");
    await t.blur();
    await t.mouseToCanvas(0.5, 0.5);
    await t.key("l");
    const p0 = await t.canvasXY([-40, -20, 0]);
    const p1 = await t.canvasXY([-10, -20, 0]);
    const p2 = await t.canvasXY([-10, 0, 0]);
    await t.canvasClick(p0.x, p0.y);
    await t.page.mouse.move(p1.x + 3, p1.y + 1, { steps: 6 });
    await t.frames(2);
    const hud = await t.visible(".sk-input");
    t.check("Line shows HUD length/angle inputs (.sk-input)", hud);
    await t.shot("line-hud");
    if (hud) { await t.type("30"); await t.key("Enter"); await t.settle(150); }
    else await t.canvasClick(p1.x, p1.y);
    await t.page.mouse.move(p2.x, p2.y, { steps: 6 });
    await t.canvasClick(p2.x, p2.y);
    await t.key("Escape");
    await t.settle(150);
    let info = await sketchInfo(t);
    const lines = info.curves.filter((c) => c.type === "line");
    t.check("chained Line produced 2 connected segments", lines.length === 2, JSON.stringify(info.curves));
    const L1 = await t.app(() => {
      const a = window.app; const f = a.feature(a.activeSketch); const st = a.sketchState(a.activeSketch);
      const pts = st ? st.sk.points : f.sk.points;
      const ln = Object.values(f.sk.curves).filter((c) => c.type === "line")[0];
      return ln ? Math.hypot(pts[ln.p2].x - pts[ln.p1].x, pts[ln.p2].y - pts[ln.p1].y) : NaN;
    });
    if (hud) t.check("typed 30 gives a 30 mm first segment", near(L1, 30, 0.01), `length=${fmt(L1, 3)}`);
    t.check("first segment got an automatic horizontal constraint", info.constraints.some((c) => c.type === "horizontal"), info.constraints.map((c) => c.type).join(","));
    t.check("Esc ends the Line tool (tool handler popped)", await t.app(() => !/line|polyline/i.test((window.app.input.top() || {}).name || "")));

    // ---------- circle ----------
    t.step("C: centre, radius");
    await t.key("c");
    const cc = await t.canvasXY([30, 20, 0]);
    const ce = await t.canvasXY([38, 20, 0]);
    await t.canvasClick(cc.x, cc.y);
    await t.page.mouse.move(ce.x, ce.y, { steps: 6 });
    const chud = await t.visible(".sk-input");
    t.check("Circle shows a diameter HUD input", chud);
    if (chud) { await t.type("16"); await t.key("Enter"); }
    else await t.canvasClick(ce.x, ce.y);
    await t.settle(150);
    await t.key("Escape");
    info = await sketchInfo(t);
    const circ = info.curves.find((c) => c.type === "circle");
    t.check("circle created", !!circ, JSON.stringify(info.curves));
    if (chud && circ) t.check("typed diameter 16 -> r = 8", near(circ.r, 8, 0.01), `r=${circ && circ.r}`);
    t.check("closed circle gives a profile", info.regions >= 1, `regions=${info.regions}`);
    await t.shot("line-and-circle");

    // ---------- colours ----------
    t.step("colours sampled from the screen");
    await t.page.mouse.move(5, 500); // park the mouse off the canvas so nothing is hovered
    await t.frames(4);
    const hexOf = (c) => "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
    const bluest = async (world) => {
      const p = await t.canvasXY(world);
      const img = await t.pixels(p.x - 4, p.y - 4, 9, 9);
      let best = null;
      for (let j = 0; j < img.h; j++) for (let i = 0; i < img.w; i++) { const c = img.px(i, j); if (!best || c[2] - c[0] > best[2] - best[0]) best = c; }
      return best;
    };
    const lineCol = await bluest([-10, -10, 0]); // the free vertical segment (no dimension)
    t.note(`under-constrained line pixel ${hexOf(lineCol)} (Fusion SketchLineColor #0596d6)`);
    t.check("under-constrained curves are Fusion blue (≈ #0596D6: bright, not navy)", lineCol[2] >= 170 && lineCol[0] <= 90 && lineCol[1] >= 100 && lineCol[1] <= 200, hexOf(lineCol));
    const pc = await t.canvasXY([26, 23, 0]); // inside the circle, away from its dimension lines
    const prof = await t.colorAt(pc.x, pc.y, 1);
    t.note(`profile fill pixel ${hexOf(prof)} (PhotoBooth SketchProfileColor = rgb(5,150,214) @ 20% -> ≈ #cde9f6 on white)`);
    // Evidence conflicts: PhotoBooth/help say light blue; the Studio* environments use orange @40% (the classic peach look).
    // Fusion capture 09/10 (Light Gray theme): the unselected profile is barely visible -- its interior stays
    // white on the white canvas (only grid lines inside pick up a faint blue). No opaque/peach fill.
    t.check("closed profile shading is barely visible (interior ≈ canvas white, as in the Fusion capture)", luma3(prof) >= 240 && sat3(prof) <= 20, hexOf(prof));
    t.note(prof[2] > prof[0] ? "profile tint leans blue (PhotoBooth/help)" : "profile tint is neutral/warm");

    // ---------- dimension ----------
    t.step("D: dimension the free vertical line, type 25");
    await t.mouseToCanvas(0.5, 0.5);
    await t.key("d");
    const onLine = await t.canvasXY([-10, -8, 0]);
    await t.canvasClick(onLine.x, onLine.y);
    const place = await t.canvasXY([-2, -8, 0]);
    await t.canvasClick(place.x, place.y);
    await t.settle(250);
    const dimIn = await t.visible(".sk-input, .sk-dim-input, #canvas-host input");
    t.check("placing a dimension opens a value input", dimIn);
    if (dimIn) { await t.page.keyboard.press("Control+A"); await t.type("25"); await t.key("Enter"); await t.settle(250); }
    await t.key("Escape");
    info = await sketchInfo(t);
    const vlen = await t.app(() => {
      const a = window.app; const f = a.feature(a.activeSketch); const st = a.sketchState(a.activeSketch);
      const pts = st ? st.sk.points : f.sk.points;
      const ln = Object.values(f.sk.curves).filter((c) => c.type === "line")[1];
      return ln ? Math.hypot(pts[ln.p2].x - pts[ln.p1].x, pts[ln.p2].y - pts[ln.p1].y) : NaN;
    });
    t.check("a second distance dimension was added", info.constraints.filter((c) => c.type === "distance" || c.type === "pointLine").length >= 2, info.constraints.map((c) => c.type).join(","));
    t.check("the dimension drives the line (length 25)", near(vlen, 25, 0.01), `length=${fmt(vlen, 3)}`);
    const dimLabel = await t.app(() => (window.app.viewport.labelLayer.innerText || ""));
    t.check("dimension text drawn on the canvas (label layer shows 25.00)", /25(\.00)?/.test(dimLabel), dimLabel.replace(/\s+/g, " ").slice(0, 80));
    t.step("D on the already-dimensioned circle becomes a driven dimension");
    await t.key("d");
    const onCirc = await t.canvasXY([30, 28, 0]);
    await t.canvasClick(onCirc.x, onCirc.y);
    const place2 = await t.canvasXY([44, 34, 0]);
    await t.canvasClick(place2.x, place2.y);
    await t.settle(250);
    await t.key("Escape");
    await t.key("Escape");
    const drv = await t.app(() => { const a = window.app; const f = a.feature(a.activeSketch); return f.sk.constraints.filter((c) => c.type === "diameter" || c.type === "radius").map((c) => !!(c.driven || c.reference || c.dimType === "driven")); });
    if (drv.length >= 2) t.check("an over-constraining dimension is added as driven (shown in parentheses)", drv.some(Boolean), JSON.stringify(drv));
    else t.note(`second dimension on the already-dimensioned circle was not created (diameter dims: ${JSON.stringify(drv)})`);
    await t.shot("dimensioned");

    // ---------- construction ----------
    t.step("select the second line and press X");
    const mid = await t.canvasXY([-10, -10, 0]);
    await t.canvasClick(mid.x, mid.y);
    await t.settle(100);
    const sel = await t.app(() => window.app.selection.items.map((r) => r.kind));
    t.check("clicking a sketch line selects it", sel.includes("sketchCurve"), JSON.stringify(sel));
    await t.key("x");
    await t.settle(150);
    info = await sketchInfo(t);
    t.check("X toggles the selected line to construction", info.curves.some((c) => c.type === "line" && c.cons), JSON.stringify(info.curves));
    await t.key("Escape");
    await t.shot("construction");

    // ---------- palette toggles ----------
    t.step("palette: turn off Dimensions");
    const tog = await t.app(() => {
      const pal = document.querySelector(".sk-palette");
      const row = [...pal.querySelectorAll("label, .sk-row, div, li")].find((r) => /^\s*(Show )?Dimensions\s*$/.test(r.innerText || "") || ((r.innerText || "").trim() === "Dimensions"));
      const cb = row && (row.querySelector("input[type=checkbox]") || row.closest("label, .sk-row, div")?.querySelector("input[type=checkbox]"));
      if (cb) { cb.setAttribute("data-qa-dims", "1"); return true; }
      return false;
    });
    if (tog) {
      await t.click('[data-qa-dims="1"]', { force: true });
      await t.settle(200);
      const txt = await t.app(() => {
        // sketch dimension labels only (the viewport's grid numbers live in the same label layer)
        const ll = window.app.viewport.labelLayer;
        return [...ll.querySelectorAll(".sk-dim, .sk-overlay *")].filter((e) => e.offsetParent && /\d/.test(e.innerText || "")).length;
      });
      t.check("unchecking Dimensions hides dimension labels", txt === 0, `${txt} visible numeric labels`);
      await t.click('[data-qa-dims="1"]', { force: true });
    } else t.check("palette Dimensions checkbox found", false);

    // ---------- finish ----------
    t.step("Finish Sketch from the palette");
    const fin = await t.app(() => {
      const b = [...document.querySelectorAll(".sk-palette button, .sk-palette [data-cmd]")].find((e) => e.offsetParent && (e.getAttribute("data-cmd") === "SketchStop" || /Finish Sketch/i.test(e.innerText)));
      if (b) { b.setAttribute("data-qa-fin", "1"); return true; }
      return false;
    });
    t.check("palette has a Finish Sketch button", fin);
    if (fin) await t.click('[data-qa-fin="1"]');
    else await t.click('[data-cmd="SketchStop"]');
    t.check("back in model mode", await t.waitFor(() => window.app.mode === "model", { timeout: 3000 }));
    t.check("palette hidden in model mode", !(await t.visible(".sk-palette")));
    const sk = await t.state();
    t.check("sketch feature is in the timeline", (await t.app(() => document.querySelectorAll("#timeline [data-feature]").length)) === sk.features.length && sk.features[0].type === "sketch");
    await t.shot("finished");
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
