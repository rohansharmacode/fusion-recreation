// Core loop through the real UI:
// Create Sketch -> pick XY origin plane on canvas -> R -> two clicks (+ typed dims) -> Finish Sketch ->
// E -> distance -> OK -> F on an edge -> OK -> H on top face -> OK -> double-click Extrude in the
// timeline -> change distance -> OK -> volume changed.
import { defineScenario, mainIfDirect, near, fmt } from "../lib.mjs";

const W = 40, Hh = 20, D1 = 10, D2 = 15;

const scenario = defineScenario({
  name: "core-loop",
  title: "Sketch -> Extrude -> Fillet -> Hole -> edit Extrude in timeline",
  timeout: 180000,
  async run(t) {
    await t.shot("start");

    // ---------- Create Sketch ----------
    t.step("click Create Sketch in the toolbar");
    const clicked = await t.click('#toolbar [data-cmd="SketchCreate"]');
    t.require("toolbar has a visible Create Sketch button (data-cmd=SketchCreate)", clicked);
    await t.settle(300);
    await t.shot("create-sketch-prompt");
    const planesShown = await t.app(() => {
      const g = window.app.viewport.groups.origin;
      let vis = 0; g.traverse((o) => { if (o.visible && (o.isMesh || o.isLine || o.isLineSegments)) vis++; });
      return g.visible !== false && vis > 0;
    });
    t.check("origin planes are shown for picking after Create Sketch", planesShown, "viewport.groups.origin has no visible geometry");

    t.step("pick the XY origin plane on the canvas");
    const cands = [];
    for (const s of [10, 20, 30, 45, 6, 60, 80]) for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0.5, 1], [1, 0.5]]) cands.push([a * s, b * s, 0]);
    await t.cameraStable(3000);
    let aim = null;
    for (let i = 0; i < 6 && !aim; i++) {
      aim = await t.aim(cands, "h && h.ref && h.ref.kind === 'originPlane' && h.ref.name === 'XY'");
      if (!aim) await t.settle(400);
    }
    t.check("an XY origin plane is pickable on the canvas (viewport.pick -> originPlane XY)", !!aim, "no screen point picked {kind:'originPlane', name:'XY'}");
    if (!aim) {
      const p = await t.canvasXY([20, 20, 0]);
      aim = { x: p.x, y: p.y, world: [20, 20, 0] };
      t.note("XY plane not pickable; clicked world (20,20,0) anyway");
    }
    await t.canvasClick(aim.x, aim.y);
    const inSketch = await t.waitFor(() => window.app.mode === "sketch" && !!window.app.activeSketch, { timeout: 6000 });
    await t.cameraStable(3000);
    await t.shot("sketch-entered");
    t.require("clicking the XY plane enters the sketch environment (app.mode === 'sketch')", inSketch, `mode=${(await t.state()).mode}`);

    const sk = await t.app(() => {
      const f = window.app.feature(window.app.activeSketch);
      return f ? { id: f.id, n: f.plane && f.plane.n, type: f.type } : null;
    });
    t.check("active sketch lies on XY (normal ±Z)", sk && sk.n && Math.abs(Math.abs(sk.n[2]) - 1) < 1e-6, JSON.stringify(sk));
    const cam = await t.camera();
    t.check("camera looks at the sketch plane (view direction ≈ -Z)", cam.dir[2] < -0.98, `dir=${cam.dir.map((v) => fmt(v, 3))}`);
    t.check("SKETCH contextual tab is visible", await t.visible('[data-tab="SketchTab"]'), "[data-tab=SketchTab] not visible");
    t.check("Finish Sketch control is visible", await t.visible('[data-cmd="SketchStop"]'), "[data-cmd=SketchStop] not visible");
    t.check("Sketch Palette is visible", await t.visible(".sk-palette"), ".sk-palette not visible");

    // ---------- 2-point rectangle ----------
    t.step("press R, click the first corner, move, type dims (or click the second corner)");
    await t.blur();
    await t.mouseToCanvas(0.5, 0.5);
    await t.key("r");
    const toolOn = await t.app(() => { const top = window.app.input.top(); return top ? top.name || "?" : null; });
    t.note(`input handler after R: ${toolOn}`);
    const c1 = await t.canvasXY([0, 0, 0]);
    const c2 = await t.canvasXY([W, Hh, 0]);
    await t.canvasClick(c1.x, c1.y);
    await t.page.mouse.move(c2.x, c2.y, { steps: 8 });
    await t.frames(3);
    const hud = await t.visible(".sk-input");
    t.check("HUD dimension input boxes (.sk-input) follow the rectangle", hud, "no visible .sk-input after the first corner");
    await t.shot("rect-rubberband");
    let typed = false;
    if (hud) {
      // Fusion focuses the HEIGHT box first (reference capture 08), Tab moves to the width
      await t.type(String(Hh));
      await t.key("Tab");
      await t.type(String(W));
      await t.key("Enter");
      typed = true;
      await t.settle(200);
      // some implementations need a final click to place the rectangle after typing
      const lines = await t.app((id) => Object.values(window.app.feature(id)?.sk?.curves || {}).filter((c) => c.type === "line").length, sk && sk.id);
      if (lines < 4) { await t.canvasClick(c2.x, c2.y); t.note("rectangle needed a click after typing dims"); }
    } else {
      await t.canvasClick(c2.x, c2.y);
    }
    await t.settle(200);
    await t.key("Escape");
    await t.shot("rect-done");

    const geo = await t.app((id) => {
      const a = window.app;
      const f = a.feature(id);
      const st = a.sketchState(id);
      if (!f) return null;
      const lines = Object.values(f.sk.curves).filter((c) => c.type === "line" && !c.cons);
      const pts = st ? st.sk.points : f.sk.points;
      const used = new Set(lines.flatMap((c) => [c.p1, c.p2]));
      const xs = [...used].map((p) => pts[p].x), ys = [...used].map((p) => pts[p].y);
      const regions = st && st.regions ? st.regions.regions : [];
      const area = (poly) => { let s = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]); return Math.abs(s / 2); };
      return {
        lines: lines.length,
        w: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
        h: ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
        dims: f.sk.constraints.filter((c) => c.type === "distance" || c.type === "pointLine").length,
        cons: f.sk.constraints.map((c) => c.type),
        regions: regions.length,
        area: regions[0] && regions[0].outer && regions[0].outer.poly ? area(regions[0].outer.poly) : null,
      };
    }, sk && sk.id);
    t.check("rectangle created: 4 lines in the sketch", geo && geo.lines === 4, JSON.stringify(geo));
    t.check("sketch has exactly one closed profile", geo && geo.regions === 1, JSON.stringify(geo && { regions: geo.regions }));
    const tol = typed ? 0.05 : 2.5;
    t.check(`rectangle is ${W} x ${Hh} mm (${typed ? "typed" : "clicked"}, tol ${tol})`, geo && near(geo.w, W, tol) && near(geo.h, Hh, tol), geo && `w=${fmt(geo.w, 3)} h=${fmt(geo.h, 3)}`);
    if (typed) t.check("typed HUD values become 2 driving dimensions", geo && geo.dims >= 2, geo && `constraints: ${geo.cons.join(",")}`);
    t.check("auto horizontal/vertical constraints were added", geo && geo.cons.filter((c) => c === "horizontal" || c === "vertical").length >= 4, geo && geo.cons.join(","));

    // ---------- Finish Sketch ----------
    t.step("click Finish Sketch");
    await t.click('[data-cmd="SketchStop"]');
    const back = await t.waitFor(() => window.app.mode === "model", { timeout: 3000 });
    await t.cameraStable(2500);
    await t.shot("sketch-finished");
    t.require("Finish Sketch returns to model mode", back, `mode=${(await t.state()).mode}`);
    t.check("SKETCH tab hidden after Finish Sketch", !(await t.visible('[data-tab="SketchTab"]')), "SketchTab still visible");

    await modelChain(t, { sk, typed });
  },
});

/** E -> distance -> OK -> F on an edge -> OK -> H on the top face -> OK -> double-click Extrude in the
 *  timeline -> new distance -> OK. Expects one visible W x Hh profile on XY at (0,0)-(W,Hh) and model mode.
 *  Shared with the "modeling" scenario (which creates the sketch through the API). */
export async function modelChain(t, { sk, typed }) {
    // ---------- Extrude ----------
    t.step("press E, type distance, OK");
    await t.blur();
    await t.mouseToCanvas(0.6, 0.6);
    await t.key("e");
    const dlgE = await t.waitFor('.dlg[data-dialog="Extrude"]', { timeout: 3000 });
    t.require("E opens the Extrude dialog (.dlg[data-dialog=Extrude])", dlgE);
    const autoSel = await t.app(() => {
      const items = window.app.selection.ofKind("profile");
      return items.length;
    });
    const rowText = await t.app(() => document.querySelector('.dlg[data-dialog="Extrude"]')?.innerText || "");
    t.check("single visible profile is auto-selected", autoSel === 1 || /1 selected/i.test(rowText), `profiles selected: ${autoSel}`);
    if (!autoSel && !/1 selected/i.test(rowText)) {
      const pc = await t.canvasXY([W / 2, Hh / 2, 0]);
      await t.canvasClick(pc.x, pc.y);
      t.note("clicked the profile because it was not auto-selected");
    }
    for (const lbl of ["Profiles", "Start", "Direction", "Extent", "Distance", "Taper Angle", "Operation"]) {
      t.check(`Extrude dialog shows row "${lbl}"`, rowText.toLowerCase().includes(lbl.toLowerCase()), `dialog text: ${rowText.replace(/\s+/g, " ").slice(0, 160)}`);
    }
    // Fusion: with a profile selected the distance box has focus, so "E, 10, Enter" works without clicking
    await t.settle(350);
    const focus = await t.app(() => { const a = document.activeElement; return a && a !== document.body ? `${a.tagName}.${a.className}[${a.getAttribute("data-input") || ""}]` : null; });
    const focusedDist = /distance|sk-input|hud|manip/i.test(focus || "") && /INPUT/.test(focus || "");
    t.check("distance box focused on start (type the value right away)", focusedDist, `activeElement=${focus}`);
    const distSel = '.dlg[data-dialog="Extrude"] [data-input="distance"]';
    t.require("Extrude dialog has a distance input ([data-input=distance])", await t.visible(distSel));
    if (focusedDist) { await t.page.keyboard.press("Control+A"); await t.type(`${D1} mm`); await t.key("Tab"); await t.settle(150); }
    const typedVal = await (await t.firstVisible(distSel))?.inputValue().catch(() => "");
    if (!focusedDist || !String(typedVal).includes(String(D1))) await t.fill(distSel, `${D1} mm`);
    const distVal = await (await t.firstVisible(distSel))?.inputValue().catch(() => "");
    t.check(`distance input reads ${D1} mm`, /^\s*10(\.0+)?\s*mm\s*$/.test(distVal || ""), `distance="${distVal}"`);
    await t.settle(250);
    const prevOn = await t.app(() => window.app.previewing || window.app.viewport.groups.preview.children.length > 0);
    t.check("live preview while the Extrude dialog is open", prevOn, "app.previewing false and no preview meshes");
    await t.shot("extrude-dialog");
    t.require("OK button clicked", await t.click('.dlg[data-dialog="Extrude"] [data-action="ok"]'));
    const closedE = await t.waitFor(() => !document.querySelector('.dlg[data-dialog="Extrude"]') || !document.querySelector('.dlg[data-dialog="Extrude"]').offsetParent, { timeout: 3000 });
    t.check("Extrude dialog closes on OK", closedE);
    let s = await t.state();
    const ext = s.features.find((f) => f.type === "extrude");
    t.require("an extrude feature was added and computed OK", ext && ext.ok, JSON.stringify(s.features));
    t.check("one body exists", s.bodies.length === 1, `bodies=${s.bodies.length}`);
    t.check(`volume = ${W}*${Hh}*${D1} = ${W * Hh * D1} mm^3`, near(s.volume, W * Hh * D1, typed ? 1 : 400), `volume=${fmt(s.volume)}`);
    await t.waitFor(() => document.querySelectorAll("#timeline [data-feature]").length >= 2, { timeout: 1500 });
    t.check("timeline shows the sketch and the extrude", (await t.app(() => document.querySelectorAll("#timeline [data-feature]").length)) >= 2, "fewer than 2 [data-feature] items in #timeline");
    const skVis = await t.app((id) => window.app.feature(id)?.visible, sk && sk.id);
    t.check("consumed sketch is auto-hidden after Extrude (Fusion default 'Auto hide sketch on feature creation')", skVis === false, `sketch.visible=${skVis}`);
    const brw = await t.app(() => ({ sketch: !!document.querySelector('#browser-host [data-node^="sketch:"]'), body: !!document.querySelector('#browser-host [data-node^="body:"]') }));
    t.check("browser lists Sketch1 under Sketches and Body1 under Bodies", brw.sketch && brw.body, JSON.stringify(brw));
    await t.shot("extruded");

    // camera to an iso view so edges and the top face are clearly visible (setup via API)
    await t.setView("home");
    t.note("camera set to Home through app.viewport.setView for edge/face aiming");
    await t.shot("home-view");

    // ---------- Fillet ----------
    t.step("press F, click an edge, OK");
    const vol0 = s.volume;
    await t.blur();
    await t.mouseToCanvas(0.5, 0.15);
    await t.key("f");
    const dlgF = await t.waitFor('.dlg[data-dialog="FusionFilletEdgesCommand"]', { timeout: 3000 });
    t.require("F opens the Fillet dialog (.dlg[data-dialog=FusionFilletEdgesCommand])", dlgF);
    // top front edge (y=0, z=D1) — candidates along it, then the other top edges
    const edgePts = [];
    for (const u of [0.5, 0.4, 0.6, 0.3, 0.7]) edgePts.push([W * u, 0, D1]);
    for (const u of [0.5, 0.35, 0.65]) edgePts.push([W, Hh * u, D1], [W * u, Hh, D1], [0, Hh * u, D1]);
    const eAim = await t.aim(edgePts, "h && h.ref && h.ref.kind === 'edge'");
    const filletL = eAim && eAim.world && (Math.abs(eAim.world[1]) < 1e-6 || Math.abs(eAim.world[1] - Hh) < 1e-6) ? W : Hh;
    t.check("a body edge is pickable on the canvas", !!eAim, "no candidate point picked {kind:'edge'}");
    if (eAim) {
      await t.canvasClick(eAim.x, eAim.y);
      await t.settle(200);
    }
    const fText = await t.app(() => document.querySelector('.dlg[data-dialog="FusionFilletEdgesCommand"]')?.innerText || "");
    const eSel = await t.app(() => window.app.selection.ofKind("edge").length);
    t.check("clicked edge is selected in the Fillet dialog", eSel >= 1 || /1 selected|1 Edge\b/i.test(fText), `edges in selection: ${eSel}`);
    const rIn = await t.firstVisible('.dlg[data-dialog="FusionFilletEdgesCommand"] [data-input="radius"]');
    t.check("Fillet dialog has a radius input", !!rIn);
    if (rIn) { const v = await rIn.inputValue().catch(() => ""); t.check("default fillet radius is 0.00 mm (Fusion 2706, ref 17)", /^\s*0(\.0+)?\s*mm\s*$/.test(v), `radius="${v}"`); }
    await t.fill('.dlg[data-dialog="FusionFilletEdgesCommand"] [data-input="radius"]', "2 mm");
    await t.settle(250);
    await t.shot("fillet-dialog");
    t.require("Fillet OK clicked", await t.click('.dlg[data-dialog="FusionFilletEdgesCommand"] [data-action="ok"]'));
    await t.waitFor(() => !window.app.activeCommand, { timeout: 3000 });
    s = await t.state();
    const fil = s.features.find((f) => f.type === "fillet");
    t.check("fillet feature added and OK", fil && fil.ok, JSON.stringify(s.features.map((f) => [f.type, f.ok, f.error])));
    // r = 2 on one straight edge of length L removes (1 - pi/4) * r^2 * L (L = W for the front/back edges)
    t.check("fillet removed material (volume decreased by ≈ (1-π/4)·r²·L)", s.volume < vol0 - 1, `before=${fmt(vol0)} after=${fmt(s.volume)} expected≈-${fmt((1 - Math.PI / 4) * 4 * filletL)}`);
    await t.shot("filleted");

    // ---------- Hole ----------
    t.step("press H, click the top face, OK");
    const vol1 = s.volume;
    await t.blur();
    await t.mouseToCanvas(0.5, 0.15);
    await t.key("h");
    const dlgH = await t.waitFor('.dlg[data-dialog="FusionHoleCommand"]', { timeout: 3000 });
    t.require("H opens the Hole dialog (.dlg[data-dialog=FusionHoleCommand])", dlgH);
    const facePts = [[W * 0.6, Hh * 0.55, D1], [W * 0.5, Hh * 0.5, D1], [W * 0.7, Hh * 0.6, D1], [W * 0.4, Hh * 0.6, D1]];
    const fAim = await t.aim(facePts, "h && h.ref && h.ref.kind === 'face' && Math.abs(h.ref.n[2] - 1) < 1e-3");
    t.check("top face is pickable", !!fAim, "no candidate picked a +Z face");
    if (fAim) { await t.canvasClick(fAim.x, fAim.y); await t.settle(300); }
    const hText = await t.app(() => document.querySelector('.dlg[data-dialog="FusionHoleCommand"]')?.innerText || "");
    const dIn = await t.firstVisible('.dlg[data-dialog="FusionHoleCommand"] [data-input="diameter"]');
    if (dIn) { const v = await dIn.inputValue().catch(() => ""); t.check("default hole diameter is 10 mm (Fusion 2706, refs 18/19)", /^\s*10(\.0+)?\s*mm\s*$/.test(v), `diameter="${v}"`); }
    else t.check("Hole dialog has a diameter input", false, "no [data-input=diameter]");
    const depIn = await t.firstVisible('.dlg[data-dialog="FusionHoleCommand"] [data-input="depth"]');
    if (depIn) { const v = await depIn.inputValue().catch(() => ""); t.check("default hole depth is 10 mm", /^\s*10(\.0+)?\s*mm\s*$/.test(v), `depth="${v}"`); }
    t.note(`hole dialog text: ${hText.replace(/\s+/g, " ").slice(0, 140)}`);
    await t.shot("hole-dialog");
    t.require("Hole OK clicked", await t.click('.dlg[data-dialog="FusionHoleCommand"] [data-action="ok"]'));
    await t.waitFor(() => !window.app.activeCommand, { timeout: 3000 });
    s = await t.state();
    const hole = s.features.find((f) => f.type === "hole");
    t.check("hole feature added and OK", hole && hole.ok, JSON.stringify(s.features.map((f) => [f.type, f.ok, f.error])));
    t.check("hole removed material", s.volume < vol1 - 50, `before=${fmt(vol1)} after=${fmt(s.volume)}`);
    await t.shot("holed");

    // ---------- Edit Extrude from the timeline ----------
    t.step("double-click Extrude in the timeline, change distance, OK");
    const vol2 = s.volume;
    const dbl = await t.dblclick(`#timeline [data-feature="${ext.id}"]`);
    t.require(`timeline item for ${ext.name} is double-clickable`, dbl);
    const dlgE2 = await t.waitFor('.dlg[data-dialog="Extrude"]', { timeout: 3000 });
    t.require("double-click opens the Extrude edit dialog", dlgE2);
    const cur = await (await t.firstVisible('.dlg[data-dialog="Extrude"] [data-input="distance"]'))?.inputValue().catch(() => "");
    t.check("edit dialog shows the current distance", cur && cur.includes(String(D1)), `distance="${cur}"`);
    await t.settle(400); // human-like pause before typing
    await t.fill('.dlg[data-dialog="Extrude"] [data-input="distance"]', `${D2} mm`);
    await t.settle(250);
    const editVal = await (await t.firstVisible('.dlg[data-dialog="Extrude"] [data-input="distance"]'))?.inputValue().catch(() => "");
    t.check(`typed "${D2} mm" lands intact in the edit dialog's distance box`, /^\s*15(\.0+)?\s*mm\s*$/.test(editVal || ""), `distance box="${editVal}" (keystrokes lost?)`);
    await t.shot("edit-extrude");
    await t.click('.dlg[data-dialog="Extrude"] [data-action="ok"]');
    await t.waitFor(() => !window.app.activeCommand, { timeout: 3000 });
    s = await t.state();
    const ext2 = await t.app((id) => window.app.feature(id)?.distance, ext.id);
    t.check(`extrude distance updated to ${D2} mm`, String(ext2).includes(String(D2)), `distance=${ext2}`);
    t.check("all features still compute after the edit", s.features.every((f) => f.ok), JSON.stringify(s.features.map((f) => [f.name, f.ok, f.error])));
    t.check(`volume increased by ≈ ${W * Hh * (D2 - D1)} mm^3`, near(s.volume - vol2, W * Hh * (D2 - D1), 300), `before=${fmt(vol2)} after=${fmt(s.volume)} delta=${fmt(s.volume - vol2)}`);
    t.check("feature count unchanged by edit (4 features)", s.features.length === 4, `features=${s.features.map((f) => f.type).join(",")}`);
    const fillet2 = s.features.find((f) => f.type === "fillet");
    t.check("fillet survives the upstream distance edit (edge re-found on the taller body)", fillet2 && fillet2.ok, fillet2 && fillet2.error);
    // the hole should move up with the top face it was placed on (Fusion references the face)
    const hc = hole && await t.app((id) => { const f = window.app.feature(id); return (f.points && f.points[0]) || null; }, hole.id);
    if (hc) {
      await t.setView("top");
      const open = await t.aim([[hc[0], hc[1], D2]], `!h || !h.point || h.point[2] < ${D2 - 0.5}`);
      t.check("hole still opens on the moved top face after the edit", !!open, `top face at z=${D2} still closed above the hole centre (${hc.map((v) => fmt(v, 1))})`);
    }
    const expVol = W * Hh * D2 - (1 - Math.PI / 4) * 4 * filletL - (Math.PI * 5 * 5 * 10 + Math.PI * 5 * 5 * (5 / Math.tan((59 * Math.PI) / 180)) / 3);
    t.check(`final volume ≈ ${fmt(expVol)} (block - fillet r2 - hole Ø10x10 with 118° tip)`, near(s.volume, expVol, typed ? 3 : 450), `volume=${fmt(s.volume)}`);
    await t.setView("home");
    await t.shot("final");
}

export default scenario;
await mainIfDirect(import.meta.url, scenario);
