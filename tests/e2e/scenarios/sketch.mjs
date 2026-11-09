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

    // ---------- Ctrl+Z / Ctrl+Y while the Line tool is active ----------
    t.step("L: three clicks, Ctrl+Z removes the last segment and keeps drawing; Ctrl+Y restores it");
    const nLines = async () => t.app(() => { const a = window.app; const f = a.feature(a.activeSketch); return Object.values(f.sk.curves).filter((c) => c.type === "line").length; });
    const lineTop = async () => t.app(() => /DrawPolyline/.test((window.app.input.top() || {}).name || ""));
    await t.blur();
    await t.mouseToCanvas(0.5, 0.5);
    await t.key("l");
    const n0 = await nLines();
    for (const w of [[40, -40, 0], [70, -40, 0], [70, -20, 0]]) {
      const q = await t.canvasXY(w);
      await t.page.mouse.move(q.x, q.y, { steps: 4 });
      await t.canvasClick(q.x, q.y);
      await t.settle(100);
    }
    t.check("setup: two segments drawn", (await nLines()) === n0 + 2, `${n0} -> ${await nLines()}`);
    await t.key("Control+z");
    await t.settle(150);
    t.check("Ctrl+Z during Line removes the last segment", (await nLines()) === n0 + 1, `lines ${await nLines()} (expected ${n0 + 1})`);
    t.check("the Line tool stays active after Ctrl+Z", await lineTop());
    await t.key("Control+y");
    await t.settle(150);
    t.check("Ctrl+Y during Line puts the segment back", (await nLines()) === n0 + 2, `lines ${await nLines()} (expected ${n0 + 2})`);
    await t.key("Control+z");
    await t.settle(150);
    const q3 = await t.canvasXY([90, -40, 0]);
    await t.page.mouse.move(q3.x, q3.y, { steps: 4 });
    await t.canvasClick(q3.x, q3.y);
    await t.settle(150);
    const cont = await t.app(() => {
      const a = window.app; const f = a.feature(a.activeSketch); const st = a.sketchState(a.activeSketch);
      const pts = st ? st.sk.points : f.sk.points;
      const ls = Object.values(f.sk.curves).filter((c) => c.type === "line");
      const l = ls[ls.length - 1];
      return l ? [pts[l.p1].x, pts[l.p1].y] : null;
    });
    t.check("after Ctrl+Z the next click continues from the end of the remaining segment (70, -40)", !!cont && near(cont[0], 70, 0.5) && near(cont[1], -40, 0.5), JSON.stringify(cont));
    await t.key("Escape");
    await t.key("Escape");

    // ---------- typed length + angle: dimension labels must not stack ----------
    t.step("L with typed length, Tab, 90 on every segment: labels stay apart");
    const dimIds = async () => t.app(() => [...document.querySelectorAll(".sk-overlay .sk-dim")].map((e) => e.dataset.cid));
    const before = new Set(await dimIds());
    await t.blur();
    await t.mouseToCanvas(0.5, 0.5);
    await t.key("l");
    const goW = async (w) => { const q = await t.canvasXY(w); await t.page.mouse.move(q.x, q.y, { steps: 4 }); await t.frames(2); return q; };
    const s0 = await goW([-90, 30, 0]);
    await t.canvasClick(s0.x, s0.y);
    await t.settle(100);
    await goW([-50, 30, 0]);
    await t.type("60"); await t.key("Enter"); await t.settle(120);
    for (const [w, L] of [[[-30, 38, 0], "10"], [[-60, 40, 0], "50"], [[-80, 70, 0], "40"], [[-88, 80, 0], "10"], [[-90, 50, 0], "50"]]) {
      await goW(w);
      await t.type(L); await t.key("Tab"); await t.type("90"); await t.key("Enter"); await t.settle(150);
    }
    await t.key("Escape");
    await t.page.mouse.move(5, 500);
    await t.frames(4);
    const lab = await t.app(() => [...document.querySelectorAll(".sk-overlay .sk-dim")].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return { cid: e.dataset.cid, t: e.textContent, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }));
    const added = lab.filter((l) => !before.has(l.cid));
    t.check("typed L chain added 6 length + 5 angle dimensions", added.length === 11, added.map((l) => l.t).join(" "));
    const clashes = [];
    for (const a of added) for (const b of lab) {
      if (a.cid === b.cid || (!before.has(b.cid) && b.cid < a.cid)) continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 2 && oy > 2) clashes.push(`${a.t}/${b.t}`);
    }
    t.check("no dimension label overlaps another one", clashes.length === 0, clashes.join(", "));
    await t.shot("typed-l-dims");

    // ---------- solver: no zero-length edges, minimal change keeps sizes ----------
    t.step("Coincident on both ends of one edge is refused; Tangent keeps the circle's radius");
    await t.key("Escape");
    const geo = await t.app(() => {
      const a = window.app;
      let out;
      a.mutate("QA solver geometry", (doc) => {
        const f = doc.features.find((x) => x.id === a.activeSketch);
        const r = a.S.addRect2pt(f.sk, [60, 45], [90, 65]);
        const c = a.S.addPoint(f.sk, 75, 80);
        out = { lines: r.lines, center: c, circle: a.S.addCircle(f.sk, c, 5) };
      });
      const f = a.feature(a.activeSketch);
      const e = f.sk.curves[out.lines[0]];
      return { ...out, p1: e.p1, p2: e.p2, n: f.sk.constraints.length };
    });
    const solverState = () => t.app((g) => {
      const a = window.app; const f = a.feature(a.activeSketch); const st = a.sketchState(a.activeSketch);
      const pts = st ? st.sk.points : f.sk.points;
      const L = (id) => { const c = f.sk.curves[id]; return Math.hypot(pts[c.p2].x - pts[c.p1].x, pts[c.p2].y - pts[c.p1].y); };
      return { n: f.sk.constraints.length, types: f.sk.constraints.map((c) => c.type), lens: g.lines.map(L), r: f.sk.curves[g.circle].r, c: [pts[g.center].x, pts[g.center].y], topY: pts[f.sk.curves[g.lines[2]].p1].y, ok: st ? st.status.ok : null };
    }, geo);
    await t.app((g) => { const a = window.app; a.selection.set([{ kind: "sketchPoint", sketch: a.activeSketch, point: g.p1 }, { kind: "sketchPoint", sketch: a.activeSketch, point: g.p2 }]); a.commands.run("ConstraintCoincident"); }, geo);
    await t.settle(250);
    let sv = await solverState();
    const warnTxt = await t.overlayText();
    t.check("Coincident on the two ends of one rectangle edge is refused", sv.n === geo.n, sv.types.slice(-3).join(","));
    t.check("no rectangle edge collapsed to zero length", sv.lens.every((l) => l > 1), sv.lens.map((l) => fmt(l, 2)).join(" "));
    t.check("the refusal is reported (conflict warning)", /unable|conflict/i.test(warnTxt), warnTxt.replace(/\s+/g, " ").slice(0, 120));
    await t.key("Escape");
    await t.settle(150);
    await t.app((g) => { const a = window.app; a.selection.set([{ kind: "sketchCurve", sketch: a.activeSketch, curve: g.circle }, { kind: "sketchCurve", sketch: a.activeSketch, curve: g.lines[2] }]); a.commands.run("ConstraintTangent"); }, geo);
    await t.settle(250);
    sv = await solverState();
    t.check("Tangent circle -> line was applied", sv.types.includes("tangent") && sv.ok === true, sv.types.slice(-2).join(","));
    t.check("Tangent keeps the circle's radius (r = 5)", near(sv.r, 5, 1e-6), `r=${fmt(sv.r, 4)}`);
    t.check("Tangent keeps the first pick (circle centre stays at 75, 80)", near(sv.c[0], 75, 1e-6) && near(sv.c[1], 80, 1e-6), JSON.stringify(sv.c.map((v) => +v.toFixed(4))));
    t.check("the line (second pick) moved up to touch the circle (y = 75)", near(sv.topY, 75, 1e-6), `y=${fmt(sv.topY, 4)}`);
    await t.shot("solver-minimal-change");
    await t.key("Escape");

    // helpers for the checks below (sketch coordinates == world XY on this sketch; grid snap is on, so
    // clicks use multiples of 10 mm, clear of the geometry above)
    const skNow = () => t.app(() => { const a = window.app; const st = a.sketchState(a.activeSketch); return JSON.parse(JSON.stringify({ curves: st.sk.curves, points: st.sk.points, constraints: st.sk.constraints })); });
    const at = async (u, v) => t.canvasXY([u, v, 0]);
    const clickW = async (u, v) => { const q = await at(u, v); await t.canvasClick(q.x, q.y); await t.settle(80); };
    const lineAt = (s, a, b, tol = 0.05) => Object.entries(s.curves).find(([, c]) => {
      if (c.type !== "line") return false;
      const p = [s.points[c.p1], s.points[c.p2]];
      const m = (P, Q) => Math.hypot(P.x - Q[0], P.y - Q[1]) <= tol;
      return (m(p[0], a) && m(p[1], b)) || (m(p[0], b) && m(p[1], a));
    });

    // ---------- first Line segment: the typed angle is kept as a dimension ----------
    t.step("L: click, type 25 Tab 45 Enter (no mouse move): the angle becomes a dimension");
    await t.blur();
    await t.key("l");
    await clickW(100, -80);
    await t.type("25"); await t.key("Tab"); await t.type("45"); await t.key("Enter"); await t.settle(150);
    await t.key("Escape"); await t.key("Escape");
    let s = await skNow();
    const angLine = lineAt(s, [100, -80], [100 + 25 * Math.SQRT1_2, -80 + 25 * Math.SQRT1_2]);
    t.check("typed 25 / 45 deg gives a 25 mm line at 45 degrees", !!angLine, JSON.stringify(Object.values(s.curves).slice(-2)));
    const angDim = angLine && s.constraints.find((c) => c.type === "angle" && c.refs.includes(angLine[0]));
    t.check("the typed first-segment angle is recorded as an angle dimension (45 deg)", !!angDim && /^45(\.0+)?\s*deg$/.test(angDim.expr || ""), JSON.stringify(s.constraints.filter((c) => angLine && c.refs.includes(angLine[0]))));

    // ---------- Extend: the extended end stays on the target curve ----------
    t.step("Extend a short vertical line up to a horizontal line: the new end is constrained to it");
    await t.key("l"); await clickW(90, 90); await clickW(130, 90); await t.key("Escape"); await t.key("Escape");
    await t.key("l"); await clickW(100, 60); await clickW(100, 80); await t.key("Escape"); await t.key("Escape");
    s = await skNow();
    const hLine = lineAt(s, [90, 90], [130, 90]), vLine = lineAt(s, [100, 60], [100, 80]);
    t.check("setup: horizontal and vertical lines drawn", !!hLine && !!vLine);
    await t.app(() => window.app.commands.run("ExtendSketchCmd"));
    await clickW(100, 77);
    await t.key("Escape");
    s = await skNow();
    const vc = vLine && s.curves[vLine[0]];
    const top = vc && [vc.p1, vc.p2].find((p) => Math.abs(s.points[p].y - 90) < 1e-6);
    t.check("Extend reaches the horizontal line (100, 80 -> 100, 90)", !!top && Math.abs(s.points[top].x - 100) < 1e-6, vc && JSON.stringify([s.points[vc.p1], s.points[vc.p2]]));
    const extCon = top && hLine && s.constraints.find((c) => (c.type === "onCurve" && c.refs[0] === top && c.refs[1] === hLine[0]) || (c.type === "coincident" && c.refs.includes(top)));
    t.check("the extended end gets a coincident / on-curve constraint to the target line", !!extCon, JSON.stringify(s.constraints.filter((c) => top && c.refs.includes(top))));

    // ---------- Midpoint Line and Equal Distance Chamfer (formerly stubs) ----------
    t.step("Midpoint Line: click the midpoint, then an end");
    await t.app(() => window.app.commands.run("SketchMidpointLine"));
    await clickW(120, -50); await clickW(140, -50); await t.key("Escape");
    s = await skNow();
    const mLine = lineAt(s, [100, -50], [140, -50]);
    t.check("Midpoint Line draws a line centred on the first click", !!mLine, JSON.stringify(Object.values(s.curves).slice(-2)));
    t.check("Midpoint Line adds a midpoint constraint", !!mLine && s.constraints.some((c) => c.type === "midpoint" && c.refs[1] === mLine[0]));
    t.step("Equal Distance Chamfer on a rectangle corner, then select the profile");
    await t.key("r"); await clickW(100, 10); await clickW(140, 40); await t.key("Escape"); await t.key("Escape");
    await t.app(() => window.app.commands.run("ChamferSketchEqualDistance"));
    await clickW(140, 40);
    await t.type("5"); await t.key("Enter"); await t.settle(150);
    await t.key("Escape"); await t.key("Escape");
    s = await skNow();
    t.check("Equal Distance Chamfer cuts the corner with a 5 mm set-back line", !!lineAt(s, [135, 40], [140, 35]), JSON.stringify(Object.values(s.curves).slice(-3)));
    t.check("the chamfered rectangle is still one closed profile", await t.app(() => window.app.sketchState(window.app.activeSketch).regions.regions.some((r) => Math.abs(Math.abs(r.area) - (40 * 30 - 12.5)) < 0.5)));

    // ---------- selected profile: Fusion's blue, boundary drawn darker ----------
    await clickW(110, 32);
    await t.page.mouse.move(5, 500);
    await t.frames(4);
    const selKinds = await t.app(() => window.app.selection.items.map((r) => r.kind));
    t.check("clicking inside the rectangle selects its profile", selKinds.includes("profile"), JSON.stringify(selKinds));
    const fillPt = await at(110, 32);
    const fill = await t.colorAt(fillPt.x, fillPt.y, 1);
    t.check("selected profile fill matches Fusion capture 13 (≈ rgb(55,139,253) on the white canvas)", Math.abs(fill[0] - 55) <= 18 && Math.abs(fill[1] - 139) <= 18 && fill[2] >= 235, hexOf(fill));
    const edgePt = await at(110, 10);
    const col = await t.pixels(edgePt.x, edgePt.y - 4, 1, 9);
    let darkest = null;
    for (let j = 0; j < col.h; j++) { const c = col.px(0, j); if (!darkest || luma3(c) < luma3(darkest)) darkest = c; }
    t.check("selected profile boundary is drawn in a darker blue (sketch curves stay readable on the fill)", !!darkest && darkest[2] > darkest[0] + 90 && luma3(darkest) < 115, darkest && hexOf(darkest));
    await t.shot("profile-selected");
    await t.key("Escape");

    // ---------- Fit Point Spline (DrawSpline), Ellipse (CircleElipse), Blend Curve ----------
    t.step("Fit Point Spline: click four fit points, click the first again -> closed spline profile");
    const curvesOf = (s, type) => Object.entries(s.curves).filter(([, c]) => c.type === type);
    const regionAreas = () => t.app(() => window.app.sketchState(window.app.activeSketch).regions.regions.map((r) => Math.abs(r.area)));
    const nSpl0 = curvesOf(await skNow(), "spline").length;
    await t.app(() => window.app.commands.run("DrawSpline"));
    t.check("DrawSpline starts the Fit Point Spline tool", await t.app(() => /DrawSpline/.test((window.app.input.top() || {}).name || "")));
    const splPts = [[-70, -50], [-50, -70], [-30, -60], [-50, -40]];
    for (const [u, v] of splPts) await clickW(u, v);
    const prevSpl = await t.app(() => window.app.viewport.groups.sketches.getObjectByName("sketch-module") && true);
    t.check("the spline preview is drawn while placing fit points", prevSpl);
    await t.shot("spline-placing");
    await clickW(-70, -50);
    s = await skNow();
    const spl = curvesOf(s, "spline").slice(nSpl0)[0];
    t.check("clicking the first fit point closes the spline (one closed spline, 4 fit points)", !!spl && spl[1].closed === true && spl[1].pts.length === 4, JSON.stringify(spl));
    const splArea = await t.app((pts) => { const a = window.app; const sk = a.S.newSketch(); a.S.addSpline(sk, pts.map((p) => a.S.addPoint(sk, p[0], p[1])), { closed: true }); return Math.abs(a.S.regions(sk).regions[0].area); }, splPts);
    t.check("the closed spline is a profile with the spline's area", (await regionAreas()).some((x) => Math.abs(x - splArea) < 0.05), `expected ${fmt(splArea, 2)}`);
    t.check("the Fit Point Spline tool stays active after a spline", await t.app(() => /DrawSpline/.test((window.app.input.top() || {}).name || "")));
    t.step("open spline finished with Enter; a fit point drags like a sketch point; Ctrl+Z undoes the drag");
    await clickW(-110, -60); await clickW(-100, -40); await clickW(-90, -60);
    await t.key("Enter"); await t.settle(150);
    s = await skNow();
    const open = curvesOf(s, "spline").slice(nSpl0)[1];
    t.check("Enter finishes an open spline through the three clicks", !!open && !open[1].closed && open[1].pts.length === 3, JSON.stringify(open));
    await clickW(-110, -90); await clickW(-100, -80);
    const dq = await at(-90, -90);
    await t.page.mouse.move(dq.x, dq.y, { steps: 4 }); await t.frames(2);
    await t.page.mouse.dblclick(dq.x, dq.y); await t.settle(150);
    s = await skNow();
    const dbl = curvesOf(s, "spline").slice(nSpl0)[2];
    t.check("double-click places the last fit point and finishes the spline", !!dbl && dbl[1].pts.length === 3 && !dbl[1].closed, JSON.stringify(dbl));
    await clickW(50, -30); await clickW(60, -20);
    const rq = await at(70, -30);
    await t.page.mouse.move(rq.x, rq.y, { steps: 3 }); await t.frames(2);
    await t.page.mouse.click(rq.x, rq.y, { button: "right" }); await t.settle(150);
    s = await skNow();
    const rc = curvesOf(s, "spline").slice(nSpl0)[3];
    t.check("right-click (OK) finishes the spline with the points placed so far", !!rc && rc[1].pts.length === 2, JSON.stringify(rc));
    t.check("no context menu opens while finishing the spline", !(await t.visible(".ctx-menu, .mm-root")));
    await t.key("Escape"); await t.key("Escape");
    if (spl) {
      const pid = spl[1].pts[2];
      const a0 = await at(-30, -60), a1 = await at(-20, -70);
      await t.page.mouse.move(a0.x, a0.y, { steps: 3 }); await t.frames(2);
      await t.page.mouse.down(); await t.page.mouse.move(a1.x, a1.y, { steps: 8 }); await t.frames(3); await t.page.mouse.up(); await t.settle(200);
      s = await skNow();
      const P = s.points[pid];
      t.check("dragging a fit point moves it (and reshapes the spline)", !!P && Math.hypot(P.x + 20, P.y + 70) < 2.5, JSON.stringify(P));
      t.check("the dragged spline is still one closed profile", (await regionAreas()).some((x) => Math.abs(x - splArea) > 1 && x > 100));
      await t.key("Control+z"); await t.settle(200);
      s = await skNow();
      t.check("Ctrl+Z puts the fit point back", Math.hypot(s.points[pid].x + 30, s.points[pid].y + 60) < 1e-6, JSON.stringify(s.points[pid]));
    }
    t.step("Ellipse: centre, first axis point, point on the ellipse");
    await t.app(() => window.app.commands.run("CircleElipse"));
    const ePrompt = await t.app(() => document.querySelector(".sk-prompt")?.textContent || "");
    t.check("CircleElipse prompt asks for the center point", /Place center point/i.test(ePrompt), ePrompt);
    await clickW(10, -70); await clickW(40, -70);
    const q2 = await at(10, -60);
    await t.page.mouse.move(q2.x, q2.y, { steps: 4 }); await t.frames(3);
    await t.shot("ellipse-placing");
    await clickW(10, -60);
    await t.key("Escape"); await t.key("Escape");
    s = await skNow();
    const ell = curvesOf(s, "ellipse")[0];
    const rr = ell && [Math.hypot(s.points[ell[1].a].x - s.points[ell[1].c].x, s.points[ell[1].a].y - s.points[ell[1].c].y), Math.hypot(s.points[ell[1].b].x - s.points[ell[1].c].x, s.points[ell[1].b].y - s.points[ell[1].c].y)];
    t.check("ellipse created with radii 30 and 10", !!ell && near(rr[0], 30, 0.05) && near(rr[1], 10, 0.05), JSON.stringify(rr));
    t.check("the ellipse comes with its two construction axis lines", !!ell && Object.values(s.curves).filter((c) => c.type === "line" && c.cons && [ell[1].a, ell[1].b].some((p) => c.p1 === p || c.p2 === p)).length === 2);
    t.check("the ellipse is a profile with area π·30·10", (await regionAreas()).some((x) => Math.abs(x - Math.PI * 300) < 0.05), JSON.stringify((await regionAreas()).map((x) => +x.toFixed(2))));
    const ellPix = await at(10, -80);
    const ellCol = await t.pixels(ellPix.x - 3, ellPix.y - 3, 7, 7);
    let ellBlue = 0;
    for (let i = 0; i < ellCol.w; i++) for (let j = 0; j < ellCol.h; j++) { const c = ellCol.px(i, j); if (c[2] > c[0] + 60) ellBlue++; }
    t.check("the ellipse is drawn in the under-constrained sketch blue", ellBlue > 0, `${ellBlue} blue px`);
    const ellStatus = await t.app((id) => { const a = window.app; a.selection.set([{ kind: "sketchCurve", sketch: a.activeSketch, curve: id }]); return a.status; }, ell && ell[0]);
    t.check("selecting the ellipse shows 'Sketch Elliptical Curve' in the status", /Sketch Elliptical Curve/.test(ellStatus || ""), ellStatus);
    await t.app(() => window.app.selection.clear());
    t.step("Blend Curve between the ends of two lines (G1)");
    await t.key("l"); await clickW(50, -70); await clickW(60, -70); await t.key("Escape"); await t.key("Escape");
    await t.key("l"); await clickW(80, -90); await clickW(80, -80); await t.key("Escape"); await t.key("Escape");
    s = await skNow();
    const bA = lineAt(s, [50, -70], [60, -70]), bB = lineAt(s, [80, -90], [80, -80]);
    t.check("setup: two lines for the blend", !!bA && !!bB);
    await t.app(() => window.app.commands.run("BlendG1CurveSketchCmd"));
    await clickW(58, -70); await clickW(80, -82);
    await t.key("Escape"); await t.key("Escape");
    s = await skNow();
    const bl = curvesOf(s, "spline").find(([id, c]) => c.pts.length === 2 && s.constraints.some((k) => k.type === "tangent" && k.refs.includes(id)));
    const tans = bl ? s.constraints.filter((c) => c.type === "tangent" && c.refs.includes(bl[0])) : [];
    t.check("Blend Curve adds a 2-point spline tangent to both curves", !!bl && tans.length === 2, JSON.stringify(bl));
    const g1 = bl && await t.app((id) => {
      const a = window.app; const st = a.sketchState(a.activeSketch);
      const pl = a.S.curvePolyline(st.sk, id, 64);
      const d0 = [pl[1][0] - pl[0][0], pl[1][1] - pl[0][1]], n = pl.length;
      const d1 = [pl[n - 1][0] - pl[n - 2][0], pl[n - 1][1] - pl[n - 2][1]];
      return [Math.atan2(d0[1], d0[0]) * 180 / Math.PI, Math.atan2(d1[1], d1[0]) * 180 / Math.PI, pl[0], pl[n - 1]];
    }, bl[0]);
    t.check("the blend leaves the first line along it (0°) and meets the second line along it (-90°)", !!g1 && Math.abs(g1[0]) < 3 && Math.abs(g1[1] + 90) < 3, JSON.stringify(g1));
    await t.shot("spline-ellipse-blend");

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

    // ---------- the ellipse and closed spline profiles extrude; the document round-trips ----------
    t.step("Extrude the ellipse + closed spline profiles 10 mm; save/open round trip keeps the sketch curves");
    const ffProf = await t.app(() => {
      const a = window.app; const id = a.doc.features[0].id; const st = a.sketchState(id);
      const ell = Object.entries(st.sk.curves).find(([, c]) => c.type === "ellipse");
      const spl = Object.entries(st.sk.curves).find(([, c]) => c.type === "spline" && c.closed);
      const pick = (cid) => st.regions.regions.filter((r) => r.curves.length === 1 && r.curves[0] === cid);
      const regs = [...(ell ? pick(ell[0]) : []), ...(spl ? pick(spl[0]) : [])];
      return { id, refs: regs.map((r) => ({ kind: "profile", sketch: id, key: r.key, c: r.centroid })), area: regs.reduce((s, r) => s + Math.abs(r.area), 0) };
    });
    t.check("ellipse and closed spline profiles found", ffProf.refs.length === 2, JSON.stringify(ffProf.refs.map((r) => r.key)));
    await t.app((refs) => window.app.commands.run("Extrude", { preselect: refs }), ffProf.refs);
    const dlgX = await t.waitFor('.dlg[data-dialog="Extrude"]', { timeout: 3000 });
    t.check("Extrude opens with the free-form profiles", dlgX);
    if (dlgX) {
      await t.fill('.dlg[data-dialog="Extrude"] [data-input="distance"]', "10 mm");
      await t.settle(300);
      await t.click('.dlg[data-dialog="Extrude"] [data-action="ok"]');
      await t.waitFor(() => !document.querySelector('.dlg[data-dialog="Extrude"]'), { timeout: 3000 });
      const sx = await t.state();
      const ex = sx.features.find((f) => f.type === "extrude");
      t.check("extrude of the ellipse + spline computes", !!ex && ex.ok, JSON.stringify(sx.features));
      t.check(`volume ≈ profile area × 10 (${fmt(ffProf.area * 10)} mm^3)`, near(sx.volume, ffProf.area * 10, ffProf.area * 10 * 2e-3), `volume=${fmt(sx.volume)}`);
      await t.shot("ellipse-spline-extruded");
    }
    const rt = await t.app(() => {
      const a = window.app;
      const d = JSON.parse(JSON.stringify(a.doc));
      const r = new a.M.Evaluator().run(d);
      const st = r.state.sketches.get(d.features[0].id);
      const types = Object.values(st.sk.curves).map((c) => c.type);
      return { spline: types.filter((x) => x === "spline").length, ellipse: types.filter((x) => x === "ellipse").length, ok: Object.values(r.results).every((x) => x.ok), bodies: r.state.bodies.size };
    });
    t.check("saved JSON reopens with the splines, the ellipse and the extruded body", rt.spline >= 3 && rt.ellipse === 1 && rt.ok && rt.bodies >= 1, JSON.stringify(rt));

    t.step("Project the elliptical and spline edges of the extruded bodies into a new sketch");
    t.require("enter a new sketch on XY", await enterSketchOnXY(t));
    const proj = await t.app(() => {
      const a = window.app;
      const refs = [];
      for (const b of a.bodies()) b.shape.edges.forEach((e, index) => { if ((e.geomType === "ELLIPSE" || e.geomType === "BSPLINE_CURVE") && e.startPoint.z > 5) refs.push({ kind: "edge", body: b.id, index }); });
      a.selection.set(refs);
      a.commands.run("ProjectNewCmd");
      const st = a.sketchState(a.activeSketch);
      const cs = Object.values(st.sk.curves);
      return { n: refs.length, ell: cs.filter((c) => c.type === "ellipse" && c.proj).length, spl: cs.filter((c) => c.type === "spline" && c.proj && c.closed).length, areas: st.regions.regions.map((r) => Math.abs(r.area)) };
    });
    await t.key("Escape");
    t.check("Project turns the elliptical edge into a projected ellipse and the B-spline edge into a projected closed spline", proj.ell === 1 && proj.spl === 1, JSON.stringify(proj));
    t.check("the projected ellipse is a profile (area π·30·10)", proj.areas.some((x) => Math.abs(x - Math.PI * 300) < 0.05), JSON.stringify(proj.areas));
    t.check("the projected spline matches the original spline profile", proj.areas.some((x) => Math.abs(x - splArea) < 0.05), `${JSON.stringify(proj.areas)} vs ${splArea}`);
    await t.shot("projected-ellipse-spline");
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
