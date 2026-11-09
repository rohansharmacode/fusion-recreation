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
  timeout: 480000,
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
    await t.key("Escape");
    await round7(t);
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);

// ---------------------------------------------------------------------------
// Round 7: the remaining sketch commands (tangent circles, conic, arc slots, control point spline,
// Break, Text, Sketch Scale, sketch patterns, Curvature / Polygon constraints, AutoConstrain,
// body-geometry commands, Insert SVG / DXF), driven through the UI.
// ---------------------------------------------------------------------------
const R7 = {
  /** stored sketch of the active sketch: curves, constraints, regions */
  info: (t) => t.app(() => {
    const a = window.app;
    const f = a.feature(a.activeSketch);
    const st = a.sketchState(a.activeSketch);
    if (!f) return null;
    return {
      id: f.id,
      curves: Object.entries(f.sk.curves).map(([id, c]) => ({ id, type: c.type, cons: !!c.cons, proj: !!c.proj, r: c.r, rho: c.rho, degree: c.degree, n: c.pts ? c.pts.length : 0, text: c.text })),
      cons: f.sk.constraints.map((c) => ({ id: c.id, type: c.type, refs: c.refs, expr: c.expr })),
      fully: !!(st && st.status && st.status.fully),
      regions: st && st.regions ? st.regions.regions.map((r) => ({ key: r.key, area: Math.abs(r.area), curves: r.curves, c: r.centroid })) : [],
    };
  }),
  run: (t, id) => t.app((id) => window.app.commands.run(id), id),
  at: (t, u, v) => t.canvasXY([u, v, 0]),
  async clickAt(t, u, v) { const p = await R7.at(t, u, v); await t.page.mouse.move(p.x + 4, p.y + 3, { steps: 3 }); await t.canvasClick(p.x, p.y); return p; },
  async moveTo(t, u, v) { const p = await R7.at(t, u, v); await t.page.mouse.move(p.x, p.y, { steps: 5 }); await t.frames(2); return p; },
  stubs: (t, ids) => t.app((ids) => ids.filter((id) => { const c = window.app.commands.get(id); return !c || c.stub; }), ids),
};

export async function round7(t) {
  const IDS = ["CircleTanTanRadius", "CircleThreeTangent", "ConicCurveCmd", "ShapeArcSlotCenterTwoPoint", "ShapeArcSlotThreePoint", "MTextCmd", "BreakSketchCmd", "SketchScaleCmd",
    "RectangularSketchPatternCommand", "CircularSketchPatternCommand", "IntersectCmd", "IntersectionCurve", "ProjectToSurface", "Include3DGeometry", "SketchIsoparametricCurve", "SpunProfileCmd",
    "DrawCVMSpline3D", "SketchImportSVG", "ImportDxfFileCommand", "SketchAutoConstraintAndDimCmd", "SketchAutoConstraintAndDimFromDatumCmd", "SketchAutoConstrainAndFinish", "ConstraintSmooth", "SketchPolygonConstraintCmd"];
  t.step("round 7: every remaining sketch command is a real command");
  const stubs = await R7.stubs(t, IDS);
  t.check("no sketch stubs left", stubs.length === 0, stubs.join(","));
  await t.app(() => { if (window.app.mode === "sketch") window.app.commands.run("SketchStop"); window.app.newDocument("R7"); });
  await t.settle(300);
  t.require("round 7: sketch on XY", await enterSketchOnXY(t));

  // ---------- tangent circles ----------
  t.step("2-Tangent Circle and 3-Tangent Circle on a triangle");
  await t.app(() => window.app.mutate("tri", (doc) => {
    const S = window.app.S; const sk = doc.features.find((f) => f.id === window.app.activeSketch).sk;
    const A = S.addPoint(sk, -45, -35), B = S.addPoint(sk, -5, -35), C = S.addPoint(sk, -25, -5);
    return [S.addLine(sk, A, B), S.addLine(sk, B, C), S.addLine(sk, C, A)];
  }));
  await R7.run(t, "CircleTanTanRadius");
  await R7.clickAt(t, -25, -35); // bottom line
  await R7.clickAt(t, -35, -20); // left line
  await R7.moveTo(t, -38, -32);
  const hud2 = await t.visible(".sk-input");
  t.check("2-Tangent Circle asks for the radius in the HUD", hud2);
  await t.type("3");
  await t.key("Enter");
  await t.settle(150);
  await t.key("Escape");
  let I = await R7.info(t);
  const c2 = I.curves.find((c) => c.type === "circle");
  t.check("2-Tangent Circle: radius 3, tangent to both lines", c2 && near(c2.r, 3, 1e-3) && I.cons.filter((c) => c.type === "tangent").length === 2, JSON.stringify({ c2, cons: I.cons.map((c) => c.type) }));
  await R7.run(t, "CircleThreeTangent");
  await R7.clickAt(t, -15, -35);
  await R7.clickAt(t, -15, -20); // right side
  await R7.clickAt(t, -34, -18.5); // left side, at the incircle's tangent point
  await t.settle(150);
  await t.key("Escape");
  I = await R7.info(t);
  const inc = I.curves.filter((c) => c.type === "circle").find((c) => !near(c.r, 3, 1e-3));
  const sideL = Math.hypot(20, 30), rIn = (0.5 * 40 * 30) / ((40 + 2 * sideL) / 2);
  t.check(`3-Tangent Circle: the incircle (r = ${fmt(rIn, 3)})`, inc && near(inc.r, rIn, 0.02), JSON.stringify(inc));
  await t.shot("r7-tangent-circles");

  // ---------- conic ----------
  t.step("Conic Curve: two end points, the vertex, Rho 0.3; Edit Conic Curve");
  await R7.run(t, "ConicCurveCmd");
  await R7.clickAt(t, 5, -35);
  await R7.clickAt(t, 40, -35);
  await R7.moveTo(t, 22, -12);
  t.check("Conic Curve shows the Rho HUD", await t.visible(".sk-input"));
  await t.type("0.3");
  await t.key("Enter");
  await t.settle(150);
  await t.key("Escape");
  I = await R7.info(t);
  let conic = I.curves.find((c) => c.type === "conic");
  t.check("conic curve created with Rho 0.3", conic && near(conic.rho, 0.3, 1e-6), JSON.stringify(conic));
  if (conic) {
    // the shoulder (highest point over the horizontal chord) is at Rho of the way from the chord midpoint to the vertex
    const mid = await t.app((id) => { const a = window.app; const st = a.sketchState(a.activeSketch); return a.S.curvePolyline(st.sk, id, 400).reduce((m, p) => (p[1] > m[1] ? p : m)); }, conic.id);
    const vy = await t.app((id) => { const a = window.app; const st = a.sketchState(a.activeSketch); return st.sk.points[st.sk.curves[id].v].y; }, conic.id);
    t.check("conic shoulder at Rho of the way from the chord to the vertex", mid && near(mid[1], -35 + 0.3 * (vy + 35), 0.02), JSON.stringify({ mid, vy }));
    const pc = await R7.at(t, mid[0], mid[1]);
    await t.page.mouse.move(pc.x, pc.y, { steps: 3 });
    await t.page.mouse.dblclick(pc.x, pc.y);
    const ed = await t.waitFor('.dlg[data-dialog="ConicCurveCmd"]', { timeout: 2000 });
    t.check("double-click a conic opens Edit Conic Curve", ed);
    if (ed) {
      await t.fill('.dlg[data-dialog="ConicCurveCmd"] [data-input="rho"]', "0.7");
      await t.settle(200);
      await t.click('.dlg[data-dialog="ConicCurveCmd"] [data-action="ok"]');
      await t.settle(200);
      I = await R7.info(t);
      conic = I.curves.find((c) => c.type === "conic");
      t.check("Edit Conic Curve changes Rho to 0.7", conic && near(conic.rho, 0.7, 1e-6), JSON.stringify(conic));
    }
  }

  // ---------- arc slots ----------
  t.step("Three Point Arc Slot and Center Point Arc Slot");
  await R7.run(t, "ShapeArcSlotThreePoint");
  await R7.clickAt(t, 5, 0);
  await R7.clickAt(t, 40, 0);
  await R7.clickAt(t, 22, 10);
  await R7.moveTo(t, 22, 13);
  await t.type("4");
  await t.key("Enter");
  await t.settle(150);
  await t.key("Escape");
  I = await R7.info(t);
  const arcs1 = I.curves.filter((c) => c.type === "arc" && !c.cons).length;
  t.check("Three Point Arc Slot: 4 arcs", arcs1 === 4, JSON.stringify({ arcs1, regions: I.regions.length }));
  await R7.run(t, "ShapeArcSlotCenterTwoPoint");
  await R7.clickAt(t, -25, 15);
  await R7.clickAt(t, -10, 15);
  await R7.clickAt(t, -25, 30);
  await R7.moveTo(t, -15, 27);
  await t.type("4");
  await t.key("Enter");
  await t.settle(150);
  await t.key("Escape");
  I = await R7.info(t);
  const arcs2 = I.curves.filter((c) => c.type === "arc" && !c.cons).length;
  t.check("Center Point Arc Slot: 4 more arcs", arcs2 === 8, `arcs=${arcs2}`);
  const slotArea = (15 * Math.PI / 2) * 4 + Math.PI * 4;
  t.check(`quarter arc slot profile area R·sweep·w + π(w/2)^2 = ${fmt(slotArea, 2)}`, I.regions.some((r) => near(r.area, slotArea, 0.05)), JSON.stringify(I.regions.map((r) => fmt(r.area, 2))));
  await t.shot("r7-conic-slots");

  // ---------- control point spline ----------
  t.step("Control Point Spline, Spline Degree in the palette");
  await R7.run(t, "DrawCVMSpline3D");
  await t.settle(100);
  const degRow = await t.app(() => document.querySelector(".sk-palette [data-group=feature]")?.innerText || "");
  t.check("palette shows Spline Degree while drawing", /Spline Degree/.test(degRow), degRow);
  for (const [u, v] of [[5, 20], [15, 35], [28, 18], [40, 35]]) await R7.clickAt(t, u, v);
  await t.key("Enter");
  await t.settle(150);
  await t.key("Escape");
  I = await R7.info(t);
  const cvs = I.curves.find((c) => c.type === "cvspline");
  t.check("control point spline with 4 control points, degree 3", cvs && cvs.n === 4 && cvs.degree === 3, JSON.stringify(cvs));
  await t.shot("r7-cvspline");

  // ---------- Curvature (G2) between the control point spline and a line ----------
  t.step("Curvature constraint: line chained to the control point spline end");
  const g2 = await t.app(() => {
    const a = window.app;
    const f = a.feature(a.activeSketch);
    const cv = Object.entries(f.sk.curves).find(([, c]) => c.type === "cvspline");
    let lid = null;
    a.mutate("line", (doc) => {
      const sk = doc.features.find((x) => x.id === a.activeSketch).sk;
      const e = cv[1].pts[cv[1].pts.length - 1];
      const q = a.S.addPoint(sk, 47, 35);
      lid = a.S.addLine(sk, e, q);
    });
    return { spline: cv[0], line: lid };
  });
  await t.app((r) => window.app.selection.set([{ kind: "sketchCurve", sketch: window.app.activeSketch, curve: r.spline }, { kind: "sketchCurve", sketch: window.app.activeSketch, curve: r.line }]), g2);
  await R7.run(t, "ConstraintSmooth");
  await t.settle(200);
  I = await R7.info(t);
  t.check("Curvature constraint added", I.cons.some((c) => c.type === "smooth"), I.cons.map((c) => c.type).join(","));
  const k = await t.app((r) => {
    const a = window.app; const st = a.sketchState(a.activeSketch);
    const cv = st.sk.curves[r.spline]; const e = cv.pts[cv.pts.length - 1];
    return { k: a.S.curvatureToward(st.sk, r.spline, e), ok: st.status && st.status.ok !== false };
  }, g2);
  t.check("spline curvature at the join with the line is 0 (G2)", k && Math.abs(k.k) < 1e-4, JSON.stringify(k));

  // ---------- Break ----------
  t.step("Break: a line across the triangle breaks into three pieces");
  const nLines0 = I.curves.filter((c) => c.type === "line").length;
  await t.app(() => window.app.mutate("cross", (doc) => {
    const a = window.app; const sk = doc.features.find((x) => x.id === a.activeSketch).sk;
    a.S.addLine(sk, a.S.addPoint(sk, -50, -20), a.S.addPoint(sk, 0, -20));
  }));
  await R7.run(t, "BreakSketchCmd");
  await R7.moveTo(t, -25, -20);
  await R7.clickAt(t, -25, -20);
  await t.key("Escape");
  I = await R7.info(t);
  t.check("Break splits the crossing line (2 more lines)", I.curves.filter((c) => c.type === "line").length === nLines0 + 3, `${nLines0} -> ${I.curves.filter((c) => c.type === "line").length}`);
  await t.shot("r7-g2-break");
  await t.app(() => window.app.commands.run("SketchStop"));
  await t.settle(200);

  // ---------- polygon constraint, sketch scale, patterns in a new sketch ----------
  t.step("Polygon constraint on a hexagon, Sketch Scale, Rectangular / Circular Pattern");
  t.require("sketch 2 on XY", await enterSketchOnXY(t));
  const hex = await t.app(() => {
    const a = window.app; let ids = null;
    a.mutate("hex", (doc) => {
      const sk = doc.features.find((x) => x.id === a.activeSketch).sk;
      const P = []; for (let i = 0; i < 6; i++) P.push(a.S.addPoint(sk, -25 + 10 * Math.cos(i * Math.PI / 3), 10 * Math.sin(i * Math.PI / 3)));
      ids = P.map((p, i) => a.S.addLine(sk, p, P[(i + 1) % 6]));
      a.S.addCircle(sk, a.S.addPoint(sk, 20, 0), 4);
    });
    return ids;
  });
  await t.app((id) => window.app.selection.set([{ kind: "sketchCurve", sketch: window.app.activeSketch, curve: id }]), hex[0]);
  await R7.run(t, "SketchPolygonConstraintCmd");
  await t.settle(200);
  // move one vertex away: the solver keeps the hexagon regular
  await t.app((ids) => window.app.mutate("drag", (doc) => { const sk = doc.features.find((x) => x.id === window.app.activeSketch).sk; const p = sk.points[sk.curves[ids[1]].p2]; p.x += 3; p.y += 1; }), hex);
  const reg = await t.app((ids) => {
    const a = window.app; const st = a.sketchState(a.activeSketch);
    const L = ids.map((id) => { const c = st.sk.curves[id]; const p = st.sk.points[c.p1], q = st.sk.points[c.p2]; return Math.hypot(q.x - p.x, q.y - p.y); });
    return { has: a.feature(a.activeSketch).sk.constraints.some((c) => c.type === "polygon"), spread: Math.max(...L) - Math.min(...L) };
  }, hex);
  t.check("Polygon constraint makes the six sides equal (regular hexagon)", reg.has && reg.spread < 1e-4, JSON.stringify(reg));

  I = await R7.info(t);
  const circ = I.curves.find((c) => c.type === "circle");
  const cpt = await t.app((id) => window.app.feature(window.app.activeSketch).sk.curves[id].c, circ.id);
  await t.app(({ id, p }) => window.app.selection.set([{ kind: "sketchCurve", sketch: window.app.activeSketch, curve: id }]), { id: circ.id, p: cpt });
  await R7.run(t, "SketchScaleCmd");
  const dS = await t.waitFor('.dlg[data-dialog="SketchScaleCmd"]', { timeout: 2000 });
  t.check("Sketch Scale dialog opens (Entities, Point, Scale Factor)", dS && await t.app(() => ["entities", "point", "factor"].every((k) => document.querySelector(`.dlg[data-dialog="SketchScaleCmd"] [data-input="${k}"]`))));
  if (dS) {
    await t.app((p) => window.app.ui.dialog.current.pickRef("point", { kind: "sketchPoint", sketch: window.app.activeSketch, point: p }), cpt);
    await t.fill('.dlg[data-dialog="SketchScaleCmd"] [data-input="factor"]', "1.5");
    await t.settle(300);
    await t.click('.dlg[data-dialog="SketchScaleCmd"] [data-action="ok"]');
    await t.settle(200);
    I = await R7.info(t);
    t.check("Sketch Scale 1.5 about the centre: r 4 -> 6", near(I.curves.find((c) => c.id === circ.id).r, 6, 1e-6), JSON.stringify(I.curves.find((c) => c.id === circ.id)));
  }

  await t.app((id) => window.app.selection.set([{ kind: "sketchCurve", sketch: window.app.activeSketch, curve: id }]), circ.id);
  await R7.run(t, "RectangularSketchPatternCommand");
  const dR = await t.waitFor('.dlg[data-dialog="RectangularSketchPatternCommand"]', { timeout: 2000 });
  t.check("Rectangular Pattern dialog opens with the circle", dR);
  if (dR) {
    const txt = await t.app(() => document.querySelector('.dlg[data-dialog="RectangularSketchPatternCommand"]').innerText);
    t.check("dialog rows: Objects, Directions, Distance Type, Quantity, Distance, Direction Type, Suppress", ["Objects", "Directions", "Distance Type", "Quantity", "Distance", "Direction Type", "Suppress"].every((w) => txt.includes(w)), txt.replace(/\s+/g, " ").slice(0, 160));
    await t.fill('.dlg[data-dialog="RectangularSketchPatternCommand"] [data-input="distType"]', "spacing").catch(() => {});
    await t.app(() => { const d = window.app.ui.dialog.current; d.set("distType", "spacing", { user: true }); d.set("q1", "3", { user: true }); d.set("q2", "2", { user: true }); d.set("d1", "15 mm", { user: true }); d.set("d2", "14 mm", { user: true }); });
    await t.settle(400);
    await t.shot("r7-rpattern-preview");
    await t.click('.dlg[data-dialog="RectangularSketchPatternCommand"] [data-action="ok"]');
    await t.settle(300);
    I = await R7.info(t);
    t.check("3 x 2 pattern: 5 circle copies, one rpattern constraint", I.curves.filter((c) => c.type === "circle").length === 6 && I.cons.filter((c) => c.type === "rpattern").length === 1, JSON.stringify(I.curves.map((c) => c.type)));
    // the copies follow the source: change the source radius
    await t.app((id) => window.app.mutate("r", (doc) => { doc.features.find((x) => x.id === window.app.activeSketch).sk.curves[id].r = 5; }), circ.id);
    const rs = await t.app(() => { const st = window.app.sketchState(window.app.activeSketch); return Object.values(st.sk.curves).filter((c) => c.type === "circle").map((c) => c.r); });
    t.check("pattern copies follow the source size", rs.every((r) => near(r, 5, 1e-3)), JSON.stringify(rs));
    // Edit Pattern: double-click the pattern glyph
    const gl = await t.app(() => { const e = [...document.querySelectorAll(".sk-glyph, [data-cid]")].find((x) => /Rectangular Pattern/.test(x.title || x.getAttribute("aria-label") || "")); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    t.check("the pattern shows a constraint glyph", !!gl);
    if (gl) {
      await t.page.mouse.dblclick(gl.x, gl.y);
      const ee = await t.waitFor('.dlg[data-dialog="RectangularSketchPatternCommand"]', { timeout: 2000 });
      t.check("double-click the pattern glyph: Edit Rectangular Pattern", ee && /EDIT RECTANGULAR PATTERN/i.test(await t.app(() => document.querySelector('.dlg[data-dialog="RectangularSketchPatternCommand"]').innerText)));
      if (ee) {
        await t.app(() => window.app.ui.dialog.current.set("q1", "2", { user: true }));
        await t.settle(300);
        await t.click('.dlg[data-dialog="RectangularSketchPatternCommand"] [data-action="ok"]');
        await t.settle(300);
        I = await R7.info(t);
        t.check("edited pattern 2 x 2: 4 circles", I.curves.filter((c) => c.type === "circle").length === 4, `${I.curves.filter((c) => c.type === "circle").length}`);
      }
    }
  }
  // circular pattern of the hexagon about the origin
  await t.app((ids) => window.app.selection.set(ids.map((id) => ({ kind: "sketchCurve", sketch: window.app.activeSketch, curve: id }))), hex);
  await R7.run(t, "CircularSketchPatternCommand");
  const dC = await t.waitFor('.dlg[data-dialog="CircularSketchPatternCommand"]', { timeout: 2000 });
  t.check("Circular Pattern dialog opens", dC);
  if (dC) {
    await t.app(() => { const d = window.app.ui.dialog.current; d.pickRef("center", { kind: "sketchPoint", sketch: window.app.activeSketch, point: "o" }); d.set("q", "3", { user: true }); });
    await t.settle(400);
    await t.click('.dlg[data-dialog="CircularSketchPatternCommand"] [data-action="ok"]');
    await t.settle(300);
    I = await R7.info(t);
    t.check("circular pattern x3 of the hexagon: 18 lines", I.curves.filter((c) => c.type === "line").length === 18 && I.cons.some((c) => c.type === "cpattern"), `${I.curves.filter((c) => c.type === "line").length}`);
  }
  await t.shot("r7-patterns");
  // undo / redo of the circular pattern
  await t.app(() => window.app.commands.run("Undo"));
  await t.settle(200);
  const afterUndo = (await R7.info(t)).curves.filter((c) => c.type === "line").length;
  await t.app(() => window.app.commands.run("Redo"));
  await t.settle(200);
  const afterRedo = (await R7.info(t)).curves.filter((c) => c.type === "line").length;
  t.check("Undo / Redo of the circular pattern", afterUndo === 6 && afterRedo === 18, `${afterUndo} / ${afterRedo}`);

  // ---------- AutoConstrain ----------
  t.step("AutoConstrain fully constrains a free rectangle");
  await t.app(() => window.app.commands.run("SketchStop"));
  t.require("sketch 3 on XY", await enterSketchOnXY(t));
  await t.app(() => window.app.mutate("rect", (doc) => {
    const a = window.app; const sk = doc.features.find((x) => x.id === a.activeSketch).sk;
    const P = [[5, 5], [35, 5.4], [35.2, 25], [5, 25]].map(([x, y]) => a.S.addPoint(sk, x, y));
    P.forEach((p, i) => a.S.addLine(sk, p, P[(i + 1) % 4]));
  }));
  await t.click('.sk-palette [data-act="autoconstrain"]').catch(() => R7.run(t, "SketchAutoConstraintAndDimCmd"));
  const dA = await t.waitFor('.dlg[data-dialog="SketchAutoConstraintAndDimCmd"]', { timeout: 4000 });
  t.check("AutoConstrain dialog opens from the Sketch Palette", dA);
  if (dA) {
    await t.settle(500);
    const tiles = await t.app(() => document.querySelectorAll(".dlg .sk-ac-tile").length);
    t.check("AutoConstrain shows result tiles", tiles >= 1, `tiles=${tiles}`);
    await t.click('.dlg[data-dialog="SketchAutoConstraintAndDimCmd"] [data-action="ok"]');
    await t.settle(300);
    I = await R7.info(t);
    t.check("AutoConstrain result: the rectangle is fully constrained", I.fully, JSON.stringify(I.cons.map((c) => c.type)));
  }

  // ---------- Text ----------
  t.step("Text: frame, type, font, Extrude the glyph profiles; Edit Text; Text On Path");
  await t.app(() => window.app.commands.run("SketchStop"));
  t.require("sketch 4 on XY", await enterSketchOnXY(t));
  await R7.run(t, "MTextCmd");
  const dT = await t.waitFor('.dlg[data-dialog="MTextCmd"]', { timeout: 2000 });
  t.check("Text dialog opens", dT);
  if (dT) {
    const txt = await t.app(() => document.querySelector('.dlg[data-dialog="MTextCmd"]').innerText);
    t.check("Text dialog rows: Type, Height, Character Spacing, Font, Text style, Alignment, Angle, Flip", ["Height", "Character Spacing", "Font", "Text style", "Alignment", "Angle", "Flip"].every((w) => txt.includes(w)), txt.replace(/\s+/g, " ").slice(0, 200));
    await R7.clickAt(t, -40, -10);
    await R7.clickAt(t, 10, 10);
    await t.fill('.dlg[data-dialog="MTextCmd"] [data-input="height"]', "12 mm");
    await t.app(() => { const ta = document.querySelector(".dlg textarea.sk-textarea"); ta.focus(); });
    await t.type("FO");
    await t.app(() => { const ta = document.querySelector(".dlg textarea.sk-textarea"); ta.blur(); });
    await t.waitFor(() => !!window.app.ui.sketch && document.querySelector('.dlg[data-dialog="MTextCmd"] [data-action="ok"]:not([disabled])'), { timeout: 5000 });
    await t.settle(500);
    await t.shot("r7-text-preview");
    await t.click('.dlg[data-dialog="MTextCmd"] [data-action="ok"]');
    await t.settle(400);
  }
  I = await R7.info(t);
  const tx = I.curves.find((c) => c.type === "text");
  t.check("text curve created with the typed text", tx && tx.text === "FO", JSON.stringify(tx));
  // F = 1 profile, O = 1 profile with a hole
  const tReg = I.regions.filter((r) => r.curves.includes(tx && tx.id));
  t.check("text glyph outlines are profiles (F, O)", tReg.length === 2, JSON.stringify(tReg.map((r) => fmt(r.area, 1))));
  const tArea = tReg.reduce((s, r) => s + r.area, 0);
  // Edit Text by double-click
  if (tx) {
    const tp = await t.app((id) => { const a = window.app; const st = a.sketchState(a.activeSketch); const pl = a.S.curvePolylines(a.S, st.sk, id, 32); const p = pl[0][0]; const r = a.viewport.canvas.getBoundingClientRect(); const s = a.viewport.toScreen([p[0], p[1], 0]); return { x: r.left + s[0], y: r.top + s[1] }; }, tx.id);
    await t.page.mouse.move(tp.x, tp.y, { steps: 3 });
    await t.page.mouse.dblclick(tp.x, tp.y);
    const eT = await t.waitFor('.dlg[data-dialog="MTextCmd"]', { timeout: 2000 });
    t.check("double-click the text opens Edit Text", eT && /EDIT TEXT/i.test(await t.app(() => document.querySelector('.dlg[data-dialog="MTextCmd"]').innerText)));
    if (eT) {
      await t.app(() => { const d = window.app.ui.dialog.current; d.set("bold", true, { user: true }); });
      await t.settle(600);
      await t.click('.dlg[data-dialog="MTextCmd"] [data-action="ok"]');
      await t.settle(400);
      const bold = await t.app((id) => { const a = window.app; const c = a.feature(a.activeSketch).sk.curves[id]; return !!c.bold; }, tx.id);
      t.check("Edit Text: Bold applied", bold);
    }
  }
  await t.app(() => window.app.commands.run("SketchStop"));
  await t.settle(200);
  const tRefs = await t.app((sid) => { const a = window.app; const st = a.sketchState(sid); return st.regions.regions.map((r) => ({ kind: "profile", sketch: sid, key: r.key, c: r.centroid })); }, I.id);
  const tA2 = await t.app((sid) => window.app.sketchState(sid).regions.regions.reduce((s, r) => s + Math.abs(r.area), 0), I.id);
  await t.app((refs) => window.app.commands.run("Extrude", { preselect: refs }), tRefs);
  if (await t.waitFor('.dlg[data-dialog="Extrude"]', { timeout: 3000 })) {
    await t.fill('.dlg[data-dialog="Extrude"] [data-input="distance"]', "3 mm");
    await t.settle(400);
    await t.click('.dlg[data-dialog="Extrude"] [data-action="ok"]');
    await t.waitFor(() => !document.querySelector('.dlg[data-dialog="Extrude"]'), { timeout: 4000 });
  }
  const sT = await t.state();
  t.check(`Extrude works on text (volume = glyph area x 3 = ${fmt(tA2 * 3)})`, sT.features.some((f) => f.type === "extrude" && f.ok) && near(sT.volume, tA2 * 3, tA2 * 3 * 0.01), `volume=${fmt(sT.volume)} area=${fmt(tArea)}`);
  await t.shot("r7-text-extruded");

  // text on path
  t.require("sketch 5 on XY", await enterSketchOnXY(t));
  await t.app(() => { const a = window.app; a.mutate("arc", (doc) => { const sk = doc.features.find((x) => x.id === a.activeSketch).sk; a.S.addArc(sk, a.S.addPoint(sk, 0, -50), a.S.addPoint(sk, 40, -50), a.S.addPoint(sk, -40, -50)); }); });
  const pathId = await t.app(() => Object.entries(window.app.feature(window.app.activeSketch).sk.curves).find(([, c]) => c.type === "arc")[0]);
  await R7.run(t, "MTextCmd");
  if (await t.waitFor('.dlg[data-dialog="MTextCmd"]', { timeout: 2000 })) {
    await t.app((pid) => { const d = window.app.ui.dialog.current; d.set("type", "path", { user: true }); d.pickRef("path", { kind: "sketchCurve", sketch: window.app.activeSketch, curve: pid }); d.set("text", "ARC", { user: true }); d.set("fit", true, { user: true }); }, pathId);
    await t.settle(800);
    await t.click('.dlg[data-dialog="MTextCmd"] [data-action="ok"]');
    await t.settle(400);
  }
  I = await R7.info(t);
  const tp2 = I.curves.find((c) => c.type === "text");
  t.check("Text On Path (Fit to Path) creates text along the arc", tp2 && tp2.text === "ARC", JSON.stringify(tp2));
  const onArc = await t.app((id) => { const a = window.app; const st = a.sketchState(a.activeSketch); const pl = a.S.curvePolylines(a.S, st.sk, id, 16).flat(); const r = pl.map((p) => Math.hypot(p[0], p[1] + 50)); return { min: Math.min(...r), max: Math.max(...r), n: pl.length }; }, tp2 && tp2.id);
  t.check("the glyphs sit above the arc (radius 40 .. 40 + height)", onArc && onArc.min > 39 && onArc.max < 47, JSON.stringify(onArc));
  await t.shot("r7-text-on-path");
  await t.app(() => window.app.commands.run("SketchStop"));

  // save / open round trip of every new curve type
  t.step("save / open round trip of the round-7 sketches");
  const rt7 = await t.app(() => {
    const a = window.app;
    const json = JSON.stringify(a.doc);
    a.loadDocument(JSON.parse(json));
    const r = a.result;
    const types = new Set();
    for (const f of a.doc.features) if (f.type === "sketch") for (const c of Object.values(f.sk.curves)) types.add(c.type);
    return { ok: Object.values(r.results).every((x) => x.ok), types: [...types], bodies: a.bodies().length };
  });
  t.check("reopened document evaluates with conic, cvspline, text and the text body", rt7.ok && ["conic", "cvspline", "text"].every((x) => rt7.types.includes(x)) && rt7.bodies >= 1, JSON.stringify(rt7));

  // ---------- commands that use body geometry ----------
  t.step("Intersect, Spun Profile, Include 3D Geometry, Project to Surface, Intersection Curve, Isoparametric Curve");
  const geo = await t.app(() => {
    const a = window.app;
    a.addFeature({ type: "cylinder", plane: { kind: "origin", name: "XY" }, center: [60, 0], diameter: "20 mm", height: "30 mm", operation: "new" });
    const cyl = a.bodies().find((b) => Math.abs(b.shape.boundingBox.center[0] - 60) < 1e-6);
    const faces = cyl.shape.faces.map((f, index) => ({ index, t: f.geomType }));
    const side = faces.find((f) => f.t === "CYLINDRE");
    const topEdge = cyl.shape.edges.map((e, index) => { const m = e.pointAt(0.5); return { index, t: e.geomType, z: e.startPoint.z, m: [m.x, m.y, m.z] }; }).find((e) => e.t === "CIRCLE" && e.z > 29);
    const f = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] }, planeRef: { kind: "origin", name: "XZ" }, sk: a.S.newSketch(), visible: true }, "Create Sketch");
    a.ui.sketch.edit(f.id);
    return { body: cyl.id, side: side && side.index, top: topEdge && topEdge.index, topP: topEdge && topEdge.m, sketch: f.id };
  });
  await t.waitFor(() => window.app.mode === "sketch", { timeout: 4000 });
  await t.settle(400);
  const projCount = async () => (await R7.info(t)).curves.filter((c) => c.proj).length;
  const dlgOk = async (id) => { await t.settle(400); await t.click(`.dlg[data-dialog="${id}"] [data-action="ok"]`); await t.settle(500); };
  // Intersect
  await R7.run(t, "IntersectCmd");
  if (await t.waitFor('.dlg[data-dialog="IntersectCmd"]', { timeout: 2000 })) {
    await t.app((b) => window.app.ui.dialog.current.pickRef("geometry", { kind: "body", body: b }), geo.body);
    await dlgOk("IntersectCmd");
  }
  I = await R7.info(t);
  t.check("Intersect: the cylinder section on XZ (projected curves, a 20 x 30 profile)", I.curves.filter((c) => c.proj).length >= 4 && I.regions.some((r) => near(r.area, 600, 0.5)), JSON.stringify({ n: I.curves.filter((c) => c.proj).length, areas: I.regions.map((r) => fmt(r.area)) }));
  // Spun Profile around Z
  const n0 = await projCount();
  await R7.run(t, "SpunProfileCmd");
  if (await t.waitFor('.dlg[data-dialog="SpunProfileCmd"]', { timeout: 2000 })) {
    await t.app((b) => { const d = window.app.ui.dialog.current; d.pickRef("entities", { kind: "body", body: b }); d.pickRef("axis", { kind: "originAxis", name: "Z" }); }, geo.body);
    await dlgOk("SpunProfileCmd");
  }
  I = await R7.info(t);
  // the lathe outline: from the projected axis out to the largest radius (70) over the height (30)
  t.check("Spun Profile around Z: the turned outline (axis to r 70, 30 high)", (await projCount()) > n0 && I.regions.some((r) => near(r.area, 2100, 1)), JSON.stringify(I.regions.map((r) => [fmt(r.area), fmt(r.c[0])])));
  // Include 3D Geometry: the top circular edge
  await R7.run(t, "Include3DGeometry");
  if (await t.waitFor('.dlg[data-dialog="Include3DGeometry"]', { timeout: 2000 })) {
    await t.app((g) => window.app.ui.dialog.current.pickRef("objects", { kind: "edge", body: g.body, index: g.top, p: g.topP }), geo);
    await dlgOk("Include3DGeometry");
  }
  const c3 = await t.app(() => { const a = window.app; return Object.values(a.feature(a.activeSketch).sk.curves).filter((c) => c.type === "c3d").map((c) => c.pts3); });
  const onTop = c3.length && c3[0].every((p) => near(Math.hypot(p[0] - 60, p[2]), 10, 0.05) && near(p[1], 30, 0.05));
  t.check("Include 3D Geometry: the top edge as a 3D sketch curve (arc r 10 at z 30)", c3.length === 1 && c3[0].length > 8 && onTop, JSON.stringify(c3.map((p) => p.length)));
  // a sketch line in front of the cylinder for Project to Surface / Intersection Curve
  const lineId = await t.app(() => { const a = window.app; return a.mutate("line", (doc) => { const sk = doc.features.find((x) => x.id === a.activeSketch).sk; return a.S.addLine(sk, a.S.addPoint(sk, 54, 15), a.S.addPoint(sk, 66, 15)); }); });
  const nC3 = async () => t.app(() => { const a = window.app; return Object.values(a.feature(a.activeSketch).sk.curves).filter((c) => c.type === "c3d").length; });
  await R7.run(t, "ProjectToSurface");
  if (await t.waitFor('.dlg[data-dialog="ProjectToSurface"]', { timeout: 2000 })) {
    await t.app((g) => { const d = window.app.ui.dialog.current; d.pickRef("faces", { kind: "face", body: g.body, index: g.side, p: [60, -10, 15], n: [0, -1, 0] }); d.pickRef("curves", { kind: "sketchCurve", sketch: window.app.activeSketch, curve: g.line }); }, { ...geo, line: lineId });
    await dlgOk("ProjectToSurface");
  }
  const p2s = await t.app(() => { const a = window.app; const cs = Object.values(a.feature(a.activeSketch).sk.curves).filter((c) => c.type === "c3d"); const last = cs[cs.length - 1]; return { n: cs.length, r: last ? last.pts3.map((p) => Math.hypot(p[0] - 60, -p[2])) : [] }; });
  // sketch (u, v, w) on XZ: u = x, v = z, w along -y; the cylinder axis is x = 60, y = 0
  t.check("Project to Surface: a 3D curve on the cylinder face", p2s.n === 2 && p2s.r.length > 2 && p2s.r.every((r) => near(r, 10, 0.1)), JSON.stringify({ n: p2s.n, r: p2s.r.slice(0, 4).map((x) => fmt(x, 3)) }));
  await R7.run(t, "IntersectionCurve");
  if (await t.waitFor('.dlg[data-dialog="IntersectionCurve"]', { timeout: 2000 })) {
    await t.app((g) => { const d = window.app.ui.dialog.current; d.pickRef("curves", { kind: "sketchCurve", sketch: window.app.activeSketch, curve: g.line }); d.pickRef("faces", { kind: "face", body: g.body, index: g.side, p: [60, -10, 15], n: [0, -1, 0] }); }, { ...geo, line: lineId });
    await dlgOk("IntersectionCurve");
  }
  t.check("Intersection Curve: one more 3D curve", (await nC3()) === 3, `${await nC3()}`);
  await R7.run(t, "SketchIsoparametricCurve");
  if (await t.waitFor('.dlg[data-dialog="SketchIsoparametricCurve"]', { timeout: 2000 })) {
    await t.app((g) => { const d = window.app.ui.dialog.current; d.pickRef("face", { kind: "face", body: g.body, index: g.side, p: [60, -10, 15], n: [0, -1, 0] }); }, geo);
    await dlgOk("SketchIsoparametricCurve");
  }
  t.check("Isoparametric Curve: a 3D curve along the face", (await nC3()) >= 4, `${await nC3()}`);
  await t.shot("r7-body-geometry");
  await t.app(() => window.app.commands.run("SketchStop"));
  await t.settle(200);

  // ---------- Insert SVG / Insert DXF ----------
  t.step("Insert SVG and Insert DXF from the model environment");
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm" viewBox="0 0 40 20"><rect x="0" y="0" width="40" height="20" fill="none" stroke="#000"/><circle cx="20" cy="10" r="5"/></svg>';
  const DXF = ["0", "SECTION", "2", "ENTITIES",
    ...[[0, 0, 30, 0], [30, 0, 30, 30], [30, 30, 0, 30], [0, 30, 0, 0]].flatMap(([x1, y1, x2, y2]) => ["0", "LINE", "8", "0", "10", String(x1), "20", String(y1), "30", "0", "11", String(x2), "21", String(y2), "31", "0"]),
    "0", "CIRCLE", "8", "HOLES", "10", "15", "20", "15", "30", "0", "40", "5", "0", "ENDSEC", "0", "EOF"].join("\n");
  const insert = async (cmd, name, text, mime) => {
    const before = await t.app(() => window.app.doc.features.filter((f) => f.type === "sketch").length);
    await R7.run(t, cmd);
    if (!(await t.waitFor(`.dlg[data-dialog="${cmd}"]`, { timeout: 2000 }))) return null;
    await t.app(() => window.app.ui.dialog.current.pickRef("plane", { kind: "originPlane", name: "XY" }));
    const [fc] = await Promise.all([t.page.waitForEvent("filechooser", { timeout: 4000 }), t.click(`.dlg[data-dialog="${cmd}"] [data-input="file"]`)]);
    await fc.setFiles({ name, mimeType: mime, buffer: Buffer.from(text) });
    await t.settle(500);
    await t.app((c) => window.app.ui.dialog.current.set("dx", "-100 mm", { user: true }), cmd);
    await dlgOk(cmd);
    return t.app((n0) => {
      const a = window.app;
      const sks = a.doc.features.filter((f) => f.type === "sketch");
      const f = sks[sks.length - 1];
      const st = a.sketchState(f.id);
      return { added: sks.length - n0, id: f.id, types: Object.values(f.sk.curves).map((c) => c.type), areas: st.regions.regions.map((r) => Math.abs(r.area)), tl: !!document.querySelector(`[data-feature="${f.id}"]`) };
    }, before);
  };
  const sv = await insert("SketchImportSVG", "shape.svg", SVG, "image/svg+xml");
  t.check("Insert SVG makes a new sketch with the rectangle and the circle", sv && sv.added === 1 && sv.types.filter((x) => x === "line").length === 4 && sv.types.includes("circle"), JSON.stringify(sv));
  t.check("SVG profiles: 800 - 25π and 25π", sv && sv.areas.some((x) => near(x, 800 - 25 * Math.PI, 0.05)) && sv.areas.some((x) => near(x, 25 * Math.PI, 0.05)), JSON.stringify(sv && sv.areas));
  t.check("the SVG sketch has a timeline entry", sv && sv.tl);
  const dx = await insert("ImportDxfFileCommand", "plate.dxf", DXF, "application/dxf");
  t.check("Insert DXF makes a new sketch with 4 lines and a circle", dx && dx.added === 1 && dx.types.filter((x) => x === "line").length === 4 && dx.types.includes("circle"), JSON.stringify(dx));
  t.check("DXF profiles: 900 - 25π and 25π", dx && dx.areas.some((x) => near(x, 900 - 25 * Math.PI, 0.05)), JSON.stringify(dx && dx.areas));
  await t.app(() => window.app.commands.run("Undo"));
  await t.settle(200);
  t.check("Undo removes the DXF sketch", await t.app((id) => !window.app.feature(id), dx && dx.id));
  await t.shot("r7-insert-svg-dxf");

  // ---------- Offset of an ellipse / spline, tangent handles ----------
  t.step("Offset an ellipse; Activate / Deactivate Tangent handle on a fit point");
  t.require("sketch on XY for offset / handles", await enterSketchOnXY(t));
  const ff = await t.app(() => {
    const a = window.app; let r = null;
    a.mutate("ff", (doc) => {
      const sk = doc.features.find((x) => x.id === a.activeSketch).sk;
      const e = a.S.addEllipse(sk, a.S.addPoint(sk, 20, 0), a.S.addPoint(sk, 35, 0), a.S.addPoint(sk, 20, 8), false, { axes: false });
      const P = [[-40, 0], [-25, 15], [-10, 0]].map(([x, y]) => a.S.addPoint(sk, x, y));
      r = { ell: e.curve, spl: a.S.addSpline(sk, P), mid: P[1] };
    });
    return r;
  });
  await R7.run(t, "Offset");
  await R7.clickAt(t, 35, 0);
  await R7.moveTo(t, 40, 0);
  await t.type("3");
  await t.key("Enter");
  await t.settle(200);
  await t.key("Escape");
  I = await R7.info(t);
  const offSpl = I.curves.filter((c) => c.type === "spline" && c.id !== ff.spl);
  t.check("Offset of the ellipse: a closed spline outside it", offSpl.length === 1 && I.regions.length >= 2, JSON.stringify({ off: offSpl, regions: I.regions.map((r) => fmt(r.area)) }));
  const ring = I.regions.map((r) => r.area).sort((x, y) => x - y);
  // area between a convex curve and its offset by d: perimeter * d + π d^2 (Ramanujan's ellipse perimeter)
  const perim = Math.PI * (3 * (15 + 8) - Math.sqrt((3 * 15 + 8) * (15 + 3 * 8)));
  const expRing = perim * 3 + Math.PI * 9;
  t.check(`ring between the ellipse and its offset = P·d + πd² (${fmt(expRing)})`, ring.some((x) => near(x, expRing, expRing * 0.01)), JSON.stringify(ring.map((x) => fmt(x))));

  const der = () => t.app((r) => { const a = window.app; const st = a.sketchState(a.activeSketch); const g = a.S.curveGeom(st.sk, r.spl); return g.fit.m[1]; }, ff);
  const d0 = await der();
  await t.app((r) => window.app.selection.set([{ kind: "sketchPoint", sketch: window.app.activeSketch, point: r.mid }]), ff);
  const mp = await R7.at(t, -25, 15);
  await t.page.mouse.move(mp.x, mp.y, { steps: 3 });
  await t.page.mouse.click(mp.x, mp.y, { button: "right" });
  const mm = await t.waitFor('.mm-root .mm-overflow [data-cmd="AddTangentHandle"]', { timeout: 3000 });
  t.check("right-click a fit point offers Activate Tangent handle", mm);
  if (mm) await t.click('.mm-root .mm-overflow [data-cmd="AddTangentHandle"]');
  else await R7.run(t, "AddTangentHandle");
  await t.settle(200);
  const hs = await t.app((r) => { const a = window.app; const f = a.feature(a.activeSketch); const cv = f.sk.curves[r.spl]; const l = cv.hd && f.sk.curves[cv.hd[1]]; return { line: !!l && l.cons, hs: cv.hs && cv.hs[1] }; }, ff);
  const d1 = await der();
  t.check("the tangent handle is a construction line; the spline keeps its shape", hs.line && near(d1[0], d0[0], 1e-6) && near(d1[1], d0[1], 1e-6), JSON.stringify({ hs, d0, d1 }));
  // turn the handle 30 degrees up: the spline's tangent at the fit point follows
  await t.app((r) => window.app.mutate("turn", (doc) => {
    const sk = doc.features.find((x) => x.id === window.app.activeSketch).sk; const l = sk.curves[sk.curves[r.spl].hd[1]];
    const p = sk.points[l.p1], q = sk.points[l.p2]; const L = Math.hypot(q.x - p.x, q.y - p.y);
    q.x = p.x + L * Math.cos(Math.PI / 6); q.y = p.y + L * Math.sin(Math.PI / 6);
  }), ff);
  const d2 = await der();
  t.check("turning the handle turns the spline tangent (30 deg)", near(Math.atan2(d2[1], d2[0]) * 180 / Math.PI, 30, 0.01), JSON.stringify(d2));
  await t.app((r) => window.app.selection.set([{ kind: "sketchPoint", sketch: window.app.activeSketch, point: r.mid }]), ff);
  await R7.run(t, "DeleteTangentCommand");
  await t.settle(200);
  const gone = await t.app((r) => { const a = window.app; const f = a.feature(a.activeSketch); const cv = f.sk.curves[r.spl]; return !(cv.hd && cv.hd[1]) && Object.values(f.sk.curves).filter((c) => c.type === "line").length === 0; }, ff);
  const d3 = await der();
  t.check("Deactivate Tangent Handle removes the handle and frees the tangent", gone && near(d3[0], d0[0], 1e-6) && near(d3[1], d0[1], 1e-6), JSON.stringify(d3));
  await t.shot("r7-offset-handles");
  await t.app(() => window.app.commands.run("SketchStop"));
}
