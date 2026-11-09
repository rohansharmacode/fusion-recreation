// pcb: Create 3D PCB, the PCB environment (Define Board, Imprint, Edit Board Sketch, Move Components, Flip
// Component, PCB Status, Finish PCB), Derive PCB from Sketch and Create Linked PCB through the real UI:
// bodies, volumes, components, browser and timeline entries, Edit Feature, undo / redo, save/open.
import { defineScenario, mainIfDirect, near, fmt } from "../lib.mjs";

const IDS = ["PCBCreateCmd", "PCBDeriveCmd", "PCBExternalComponentCreationCmd", "PCBDefineBoardCmd", "PCBImprintCmd", "PCBBoardSketchEditCmd", "PCBMoveComponentsCmd", "PCBFlipComponentCmd", "PCBStatusCmd", "PCBStop"];
const sel = (id, input) => `.dlg[data-dialog="${id}"] [data-input="${input}"]`;

async function openFromPanel(t, id, panel, flyout) {
  await t.escapeAll(1);
  let how = null;
  if (await t.click(`#toolbar [data-panel="${panel}"]`, { timeout: 1500 })) {
    if (flyout) {
      await t.waitFor(`#overlay .sh-mi:has-text("${flyout}")`, { timeout: 1500 });
      await t.hover(`#overlay .sh-mi:has-text("${flyout}")`);
    }
    if ((await t.waitFor(`#overlay [data-cmd="${id}"]`, { timeout: 1500 })) && (await t.click(`#overlay [data-cmd="${id}"]`, { timeout: 1000 }))) how = "toolbar";
  }
  if (!(await t.waitFor(`.dlg[data-dialog="${id}"]`, { timeout: 2500 }))) {
    await t.escapeAll(1);
    await t.app((id) => window.app.commands.run(id), id);
    how = "api";
    if (!(await t.waitFor(`.dlg[data-dialog="${id}"]`, { timeout: 2500 }))) return null;
  }
  if (how === "api") t.note(`${id}: opened through app.commands.run`);
  return how;
}
async function okDialog(t, id) {
  await t.settle(400);
  await t.waitFor((id) => { const b = document.querySelector(`.dlg[data-dialog="${id}"] [data-action="ok"]`); return !!b && !b.disabled; }, { timeout: 8000, arg: id });
  const en = await t.app((id) => { const b = document.querySelector(`.dlg[data-dialog="${id}"] [data-action="ok"]`); return !!b && !b.disabled; }, id);
  if (en) await t.click(`.dlg[data-dialog="${id}"] [data-action="ok"]`);
  await t.waitFor(() => !window.app.activeCommand, { timeout: 30000 });
  return en;
}
async function clickAt(t, points, pred) {
  const a = await t.aim(points, pred);
  if (a) await t.canvasClick(a.x, a.y);
  return a;
}
/** Snapshot of the pcb features: ok, volume, component, body meta. */
const pcbs = (t) => t.app(() => {
  const a = window.app;
  return a.doc.features.filter((f) => f.type === "pcb").map((f) => {
    const r = a.featureResult(f.id) || {};
    const info = f.newBody && a.bodyInfo(f.newBody);
    const meta = f.newBody && a.doc.bodies[f.newBody];
    return {
      id: f.id, name: f.name, ok: !!r.ok, error: r.error, vol: info ? info.volume : null, body: f.newBody || null, occ: f.newOcc,
      comp: a.doc.components[f.newComp] && a.doc.components[f.newComp].name, alive: !!(a.components && a.components.alive(f.newOcc)),
      owner: f.newBody ? a.components.ownerOf(f.newBody) : null, bodyName: meta && meta.name, appearance: meta && meta.appearance,
      tl: !!document.querySelector(`#timeline [data-feature="${f.id}"] svg`), board: r.board ? { size: r.board.size, holes: r.board.holes, cutouts: r.board.cutouts, o: r.board.frame && r.board.frame.o } : null,
      derived: !!f.derived, linked: !!f.linked, boardSketch: f.boardSketch || null,
    };
  });
});
const env = (t) => t.app(() => { const a = window.app; const e = (a.environments || []).find((x) => x.id === "pcb"); return { mode: a.mode, env: !!e, feature: e && e.feature, active: a.components.active, tab: !!document.querySelector('#toolbar [data-tab="PCBTab"]') }; });
const center = (t, body) => t.app((id) => { const i = window.app.bodyInfo(id); const b = i && i.bbox; return b ? [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2) : null; }, body);

const scenario = defineScenario({
  name: "pcb",
  title: "3D PCB and the PCB environment",
  timeout: 280000,
  async run(t) {
    const stubs = await t.app((ids) => ids.filter((id) => { const c = window.app.commands.get(id); return !c || c.stub; }), IDS);
    t.require("all ten PCB commands are registered (no stubs)", stubs.length === 0, stubs.join(","));

    t.step("model: board sketch on XY (60 x 40 rectangle, a 3 mm hole, a 10 x 6 cutout)");
    const sk1 = await t.app(() => {
      const a = window.app, S = a.S, K = a.K;
      const sk = S.newSketch();
      const poly = (pts) => { const p = pts.map(([x, y]) => S.addPoint(sk, x, y)); for (let i = 0; i < p.length; i++) S.addLine(sk, p[i], p[(i + 1) % p.length]); };
      poly([[0, 0], [60, 0], [60, 40], [0, 40]]);
      S.addCircle(sk, S.addPoint(sk, 5, 5), 1.5);
      poly([[30, 20], [40, 20], [40, 26], [30, 26]]);
      return a.addFeature({ type: "sketch", plane: K.ORIGIN_PLANES.XY, planeRef: { kind: "origin", name: "XY" }, sk, visible: true }, "Sketch").id;
    });
    await t.setView("home");
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.frames(4);

    // ------------------------------------------------------------ Create 3D PCB
    t.step("Create 3D PCB: SOLID > CREATE > Create PCB flyout, pick the board profile, OK");
    t.check("Create 3D PCB opens from the toolbar", (await openFromPanel(t, "PCBCreateCmd", "SolidCreatePanel", "Create PCB")) === "toolbar");
    const labels = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="PCBCreateCmd"] .dlg-row')].filter((r) => r.offsetParent).map((r) => (r.querySelector(".dlg-label") || {}).textContent).filter(Boolean));
    t.check("dialog rows: Profile, Thickness, Origin, X Axis, Flip X Axis, Flip Z Axis, Convert Circles to NPTHs", ["Profile", "Thickness", "Origin", "X Axis", "Flip X Axis", "Flip Z Axis", "Convert Circles to NPTHs"].every((l) => labels.includes(l)), labels.join("|"));
    t.check("board profile picked on the canvas", !!(await clickAt(t, [[45, 32, 0], [50, 10, 0], [20, 30, 0]], `h && h.ref && h.ref.kind === 'profile' && h.ref.sketch === '${sk1}'`)));
    const thk = await t.app(() => document.querySelector('.dlg[data-dialog="PCBCreateCmd"] [data-input="thickness"]').value);
    t.check("Thickness default 1.60 mm", /1\.60 mm/.test(thk), thk);
    await t.shot("create-pcb-dialog");
    t.check("Create 3D PCB OK", await okDialog(t, "PCBCreateCmd"));
    await t.waitFor(() => { const f = window.app.doc.features.find((x) => x.type === "pcb"); return !!f && !!document.querySelector(`#timeline [data-feature="${f.id}"] svg`); }, { timeout: 3000 });
    let P = await pcbs(t);
    const p1 = P[0];
    const A1 = (2400 - Math.PI * 2.25 - 60) * 1.6;
    t.check("pcb feature with a timeline icon, Board body = (2400 - 7.07 - 60) x 1.6 mm^3", p1 && p1.ok && p1.tl && near(p1.vol, A1, 0.5), JSON.stringify(p1));
    t.check("the PCB is a component 'PCB' that owns the green Board body", p1 && p1.comp === "PCB" && p1.alive && p1.owner === p1.occ && p1.bodyName === "Board" && p1.appearance === "pcb-green", JSON.stringify(p1));
    t.check("board 60 x 40 mm, 1 hole, 1 cutout, 2D origin on the top face", p1 && p1.board && near(p1.board.size[0], 60, 1e-6) && near(p1.board.size[1], 40, 1e-6) && p1.board.holes === 1 && p1.board.cutouts === 1 && near(p1.board.o[2], 1.6, 1e-9), JSON.stringify(p1 && p1.board));
    let E = await env(t);
    t.check("PCB environment entered: mode pcb, PCB tab, PCB component active", E.env && E.mode === "pcb" && E.tab && E.active === p1.occ && E.feature === p1.id, JSON.stringify(E));
    t.check("browser lists the PCB component", await t.waitFor((o) => !!document.querySelector(`[data-node="occ:${o}"]`), { timeout: 3000, arg: p1.occ }));
    await t.shot("pcb-environment");

    t.step("PCB Status (PCB tab > MODIFY)");
    t.check("PCB Status opens from the PCB tab", (await openFromPanel(t, "PCBStatusCmd", "PCBModifyPanel")) === "toolbar");
    const stxt = await t.app(() => document.querySelector('.dlg[data-dialog="PCBStatusCmd"]').innerText);
    t.check("status: Board Shape 60.00 mm x 40.00 mm, Board Height 1.60 mm, 1 hole, 1 cutout, 0 components", /60\.00 mm x 40\.00 mm/.test(stxt) && /1\.60 mm/.test(stxt) && /Holes\s*1/.test(stxt) && /Cutouts\s*1/.test(stxt) && /PCB Components\s*0/.test(stxt), stxt);
    await okDialog(t, "PCBStatusCmd");

    // ------------------------------------------------------------ components on the board
    t.step("a component U1 on the PCB with a 4 x 4 x 2 box on the top face");
    const u1 = await t.app((pocc) => {
      const a = window.app;
      const [oid] = a.components.create({ name: "U1", parent: pocc, activate: true });
      const f = a.addFeature({ type: "box", length: "4 mm", width: "4 mm", height: "2 mm", center: [0, 0], operation: "new", plane: { kind: "face", body: null, p: [10, 10, 1.6], n: [0, 0, 1], plane: { o: [10, 10, 1.6], x: [1, 0, 0], n: [0, 0, 1] } } });
      return { oid, body: f.newBody, ok: !!(a.featureResult(f.id) || {}).ok, owner: a.components.ownerOf(f.newBody) };
    }, p1.occ);
    E = await env(t);
    t.check("U1 box inside the PCB, environment still running", u1.ok && u1.owner === u1.oid && E.env && E.mode === "pcb", JSON.stringify({ u1, E }));
    const c0 = await center(t, u1.body);

    t.step("Move Components: pick U1, X 5 mm, Y 3 mm, Angle 90 deg");
    t.check("Move Components opens from the PCB tab", (await openFromPanel(t, "PCBMoveComponentsCmd", "PCBModifyPanel")) === "toolbar");
    t.check("U1 picked on the canvas", !!(await clickAt(t, [[10, 10, 3.6], [11, 9, 3.6], [10, 8, 2.6]], `h && h.ref && h.ref.body === '${u1.body}'`)));
    await t.fill(sel("PCBMoveComponentsCmd", "dx"), "5 mm");
    await t.fill(sel("PCBMoveComponentsCmd", "dy"), "3 mm");
    await t.fill(sel("PCBMoveComponentsCmd", "angle"), "90 deg");
    await t.settle(200);
    const disp = await t.app((o) => !!window.app.components.displayTransform(o), u1.oid);
    t.check("live preview through a display transform", disp);
    await t.shot("move-components");
    t.check("Move Components OK", await okDialog(t, "PCBMoveComponentsCmd"));
    const c1 = await center(t, u1.body);
    const T1 = await t.app((o) => window.app.components.transform(o), u1.oid);
    t.check("U1 moved by (5, 3) on the board and turned 90 deg", c1 && near(c1[0] - c0[0], 5, 1e-6) && near(c1[1] - c0[1], 3, 1e-6) && near(c1[2], c0[2], 1e-6) && near(T1[0], 0, 1e-9) && near(T1[4], 1, 1e-9), JSON.stringify({ c0, c1, T1 }));
    const pend = await t.app(() => window.app.components.hasPending());
    t.check("the move is captured (no uncaptured positions)", !pend);

    t.step("Flip Component: U1 goes to the bottom side");
    t.check("Flip Component opens from the PCB tab", (await openFromPanel(t, "PCBFlipComponentCmd", "PCBModifyPanel")) === "toolbar");
    t.check("U1 picked", !!(await clickAt(t, [[c1[0], c1[1], 3.6], [c1[0] + 1, c1[1], 3.6], [c1[0], c1[1] - 1.9, 2.6]], `h && h.ref && h.ref.body === '${u1.body}'`)));
    t.check("Flip Component OK", await okDialog(t, "PCBFlipComponentCmd"));
    const c2 = await center(t, u1.body);
    t.check("U1 flipped to the bottom: centre z 2.6 -> -1.0, x / y kept", c2 && near(c2[2], -1, 1e-6) && near(c2[0], c1[0], 1e-6) && near(c2[1], c1[1], 1e-6), JSON.stringify(c2));
    await t.blur();
    await t.key("Control+z");
    await t.settle(300);
    const cu = await center(t, u1.body);
    t.check("Ctrl+Z puts U1 back on the top", cu && near(cu[2], c1[2], 1e-6), JSON.stringify(cu));
    await t.key("Control+y");
    await t.settle(300);
    const cr = await center(t, u1.body);
    t.check("Ctrl+Y flips it again", cr && near(cr[2], -1, 1e-6), JSON.stringify(cr));

    // ------------------------------------------------------------ Define Board
    t.step("Define Board: thickness 2 mm");
    await t.app((pocc) => window.app.components.activate(pocc), p1.occ);
    t.check("Define Board opens from the PCB tab", (await openFromPanel(t, "PCBDefineBoardCmd", "PCBCreatePanel")) === "toolbar");
    const dtitle = await t.app(() => document.querySelector('.dlg[data-dialog="PCBDefineBoardCmd"] .dlg-title').textContent);
    const dlabels = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="PCBDefineBoardCmd"] .dlg-row')].filter((r) => r.offsetParent).map((r) => (r.querySelector(".dlg-label") || {}).textContent).filter(Boolean));
    t.check("Define Board dialog: title, Profile, Profile On, Thickness, Origin, X Axis", dtitle === "DEFINE BOARD" && ["Profile", "Profile On", "Thickness", "Origin", "X Axis"].every((l) => dlabels.includes(l)), `${dtitle} ${dlabels.join("|")}`);
    await t.fill(sel("PCBDefineBoardCmd", "thickness"), "2 mm");
    t.check("Define Board OK", await okDialog(t, "PCBDefineBoardCmd"));
    P = await pcbs(t);
    t.check("board volume follows the new thickness", P[0].ok && near(P[0].vol, A1 / 1.6 * 2, 0.5), JSON.stringify(P[0]));

    // ------------------------------------------------------------ Imprint
    t.step("Imprint: copy the board outline into a new sketch on XY");
    t.check("Imprint opens from the PCB tab", (await openFromPanel(t, "PCBImprintCmd", "PCBModifyPanel")) === "toolbar");
    await t.app(() => window.app.ui.dialog.current.pickRef("dest", { kind: "originPlane", name: "XY" }));
    t.check("Imprint OK", await okDialog(t, "PCBImprintCmd"));
    const imp = await t.app(() => {
      const a = window.app, f = [...a.doc.features].reverse().find((x) => x.type === "sketch");
      const s = a.sketchState(f.id);
      return { name: f.name, curves: Object.keys(f.sk.curves).length, regions: s && s.regions ? s.regions.regions.length : 0 };
    });
    t.check("PCB Profile sketch with the 9 outline curves and closed profiles", imp.name === "PCB Profile" && imp.curves === 9 && imp.regions >= 3, JSON.stringify(imp));

    // ------------------------------------------------------------ Edit Board Sketch / Finish PCB
    t.step("Edit Board Sketch, Finish Sketch returns to the PCB environment");
    t.check("Edit Board Sketch from the PCB tab", await t.click('#toolbar [data-panel="PCBModifyPanel"]') && (await t.click('#overlay [data-cmd="PCBBoardSketchEditCmd"]', { timeout: 1500 })));
    await t.settle(300);
    const sm = await t.app(() => ({ mode: window.app.mode, sk: window.app.activeSketch }));
    t.check("the board sketch is open", sm.mode === "sketch" && sm.sk === sk1, JSON.stringify(sm));
    await t.app(() => window.app.commands.run("SketchStop"));
    await t.settle(300);
    E = await env(t);
    t.check("back in the PCB environment", E.mode === "pcb" && E.env, JSON.stringify(E));
    t.check("Finish PCB button", await t.click('#toolbar [data-cmd="PCBStop"]'));
    await t.settle(200);
    E = await env(t);
    t.check("Finish PCB: model mode, root active", !E.env && E.mode === "model" && E.active === "root", JSON.stringify(E));
    await t.app((o) => window.app.components.activate(o), p1.occ);
    await t.settle(200);
    E = await env(t);
    t.check("activating the PCB component enters the PCB environment again", E.env && E.mode === "pcb" && E.feature === p1.id, JSON.stringify(E));
    await t.app(() => window.app.commands.run("PCBStop"));

    t.step("Edit Feature from the timeline: back to 1.6 mm");
    await t.app((id) => window.app.editFeature(id), p1.id);
    t.check("Edit Feature reopens Create 3D PCB", await t.waitFor(`.dlg[data-dialog="PCBCreateCmd"][data-edit="${p1.id}"]`, { timeout: 3000 }));
    await t.fill(sel("PCBCreateCmd", "thickness"), "1.6 mm");
    await okDialog(t, "PCBCreateCmd");
    P = await pcbs(t);
    t.check("edited board volume", P[0].ok && near(P[0].vol, A1, 0.5) && P[0].bodyName === "Board", JSON.stringify(P[0]));

    // ------------------------------------------------------------ Derive PCB from Sketch
    t.step("Derive PCB from Sketch: a 40 mm circle, then the sketch changes");
    const sk2 = await t.app(() => {
      const a = window.app, S = a.S, K = a.K;
      const sk = S.newSketch();
      S.addCircle(sk, S.addPoint(sk, 100, 0), 20);
      return a.addFeature({ type: "sketch", plane: K.ORIGIN_PLANES.XY, planeRef: { kind: "origin", name: "XY" }, sk, visible: true }, "Sketch").id;
    });
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.frames(3);
    t.check("Derive PCB from Sketch opens from the toolbar", (await openFromPanel(t, "PCBDeriveCmd", "SolidCreatePanel", "Create PCB")) === "toolbar");
    t.check("circle profile picked", !!(await clickAt(t, [[100, 0, 0], [105, 5, 0], [95, -8, 0]], `h && h.ref && h.ref.kind === 'profile' && h.ref.sketch === '${sk2}'`)));
    t.check("Derive PCB OK", await okDialog(t, "PCBDeriveCmd"));
    P = await pcbs(t);
    const p2 = P[1];
    t.check("derived PCB 'PCB (1)': disc volume pi x 400 x 1.6", p2 && p2.ok && p2.derived && p2.comp === "PCB (1)" && near(p2.vol, Math.PI * 400 * 1.6, 0.5), JSON.stringify(p2));
    await t.app((id) => { const a = window.app; a.mutate("Edit Sketch", (doc) => { const f = doc.features.find((x) => x.id === id); const c = Object.values(f.sk.curves).find((x) => x.type === "circle"); c.r = 25; }); }, sk2);
    P = await pcbs(t);
    t.check("the derived PCB follows the sketch (r 25)", P[1].ok && near(P[1].vol, Math.PI * 625 * 1.6, 0.5), JSON.stringify(P[1]));
    await t.app(() => window.app.commands.run("PCBStop"));

    // ------------------------------------------------------------ Create Linked PCB + Define Board
    t.step("Create Linked PCB: component without a board, then Define Board on its outline sketch");
    t.check("Create Linked PCB opens from the toolbar", (await openFromPanel(t, "PCBExternalComponentCreationCmd", "SolidCreatePanel", "Create PCB")) === "toolbar");
    t.check("Create Linked PCB OK (Location XY)", await okDialog(t, "PCBExternalComponentCreationCmd"));
    P = await pcbs(t);
    const p3 = P[2];
    E = await env(t);
    t.check("linked PCB: component 'PCB (2)' without a body, Board Outline sketch, environment entered", p3 && p3.ok && p3.linked && !p3.body && p3.alive && p3.boardSketch && E.env && E.feature === p3.id, JSON.stringify({ p3, E }));
    await t.app(() => window.app.commands.run("PCBStatusCmd"));
    await t.waitFor('.dlg[data-dialog="PCBStatusCmd"]', { timeout: 2000 });
    const st3 = await t.app(() => document.querySelector('.dlg[data-dialog="PCBStatusCmd"]').innerText);
    t.check("status says Board outline not defined", /Board outline not defined/.test(st3), st3);
    await okDialog(t, "PCBStatusCmd");
    await t.app((sid) => {
      const a = window.app, S = a.S;
      a.mutate("Edit Sketch", (doc) => { const f = doc.features.find((x) => x.id === sid); const p = [[0, -80], [30, -80], [30, -60], [0, -60]].map(([x, y]) => S.addPoint(f.sk, x, y)); for (let i = 0; i < 4; i++) S.addLine(f.sk, p[i], p[(i + 1) % 4]); });
    }, p3.boardSketch);
    t.check("Define Board opens", (await openFromPanel(t, "PCBDefineBoardCmd", "PCBCreatePanel")) === "toolbar");
    await t.app((sid) => { const a = window.app, s = a.sketchState(sid), r = s.regions.regions[0]; a.ui.dialog.current.pickRef("profile", { kind: "profile", sketch: sid, key: r.key, c: [15, -70] }); }, p3.boardSketch);
    t.check("Define Board OK", await okDialog(t, "PCBDefineBoardCmd"));
    P = await pcbs(t);
    t.check("the linked PCB gets its 30 x 20 x 1.6 Board body", P[2].ok && P[2].body && P[2].bodyName === "Board" && near(P[2].vol, 960, 0.5), JSON.stringify(P[2]));
    await t.blur();
    await t.key("Control+z");
    await t.settle(300);
    P = await pcbs(t);
    t.check("Ctrl+Z: no board again", P[2] && !P[2].body, JSON.stringify(P[2]));
    await t.key("Control+z");
    await t.key("Control+z");
    await t.settle(300);
    P = await pcbs(t);
    E = await env(t);
    t.check("undoing the Linked PCB removes it and leaves the PCB environment", P.length === 2 && !E.env, JSON.stringify({ n: P.length, E }));
    await t.key("Control+y");
    await t.key("Control+y");
    await t.key("Control+y");
    await t.settle(300);
    P = await pcbs(t);
    t.check("Ctrl+Y brings the Linked PCB and its board back", P.length === 3 && P[2].ok && near(P[2].vol, 960, 0.5), JSON.stringify(P[2]));

    // ------------------------------------------------------------ save / open
    t.step("save / open round trip");
    const rt = await t.app(() => {
      const a = window.app;
      const snap = () => a.doc.features.filter((f) => f.type === "pcb").map((f) => { const r = a.featureResult(f.id) || {}; const i = f.newBody && a.bodyInfo(f.newBody); return { ok: !!r.ok, v: i ? Math.round(i.volume * 10) / 10 : null }; });
      const before = snap();
      const json = JSON.stringify(a.doc);
      a.newDocument("tmp");
      a.loadDocument(JSON.parse(json));
      return { before, after: snap(), mode: a.mode };
    });
    t.check("every PCB recomputes with the same volumes after open", rt.before.length === 3 && rt.before.every((b, i) => b.ok && rt.after[i].ok && b.v === rt.after[i].v) && rt.mode === "model", JSON.stringify(rt));
    t.note(`volumes ${fmt(A1)} / ${fmt(Math.PI * 625 * 1.6)} / 960`);

    // ------------------------------------------------------------ SURFACE > CREATE primitives
    t.step("surface primitives: Box from SURFACE > CREATE, then Cylinder, Sphere, Torus, Coil and Pipe");
    await t.app(() => window.app.newDocument("QA surface primitives"));
    const SP = ["SurfPrimitiveBox", "SurfPrimitiveCylinder", "SurfPrimitiveSphere", "SurfPrimitiveTorus", "SurfPrimitiveCoil", "SurfPrimitivePipe", "FusionSheetMetalCosmeticBendCmd", "VolFieldModifyModelCommand"];
    const stubs2 = await t.app((ids) => ids.filter((id) => { const c = window.app.commands.get(id); return !c || c.stub; }), SP);
    t.check("leftover commands registered (no stubs)", stubs2.length === 0, stubs2.join(","));
    await t.click('#toolbar [data-tab="SurfaceTab"]');
    t.check("Surface Box opens from SURFACE > CREATE", (await openFromPanel(t, "SurfPrimitiveBox", "SurfaceCreatePanel")) === "toolbar");
    await t.app(() => window.app.ui.dialog.current.pickRef("plane", { kind: "originPlane", name: "XY" }));
    await t.settle(300);
    const ops = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="SurfPrimitiveBox"] [data-input="operation"]')].length);
    t.check("Box dialog has an Operation row", ops === 1);
    t.check("Surface Box OK", await okDialog(t, "SurfPrimitiveBox"));
    const surfInfo = async (type) => { await t.waitFor((type) => { const f = [...window.app.doc.features].reverse().find((x) => x.type === type); return !!f && !!document.querySelector(`#timeline [data-feature="${f.id}"] svg`); }, { timeout: 3000, arg: type }); return surfInfo0(type); };
    const surfInfo0 = (type) => t.app((type) => {
      const a = window.app, f = [...a.doc.features].reverse().find((x) => x.type === type);
      if (!f) return null;
      const r = a.featureResult(f.id) || {};
      const i = f.newBody ? a.bodyInfo(f.newBody) : null;
      return { id: f.id, ok: !!r.ok, error: r.error, kind: f.newBody ? a.bodyKind(f.newBody) : null, area: i ? i.area : null, name: f.name, tl: !!document.querySelector(`#timeline [data-feature="${f.id}"] svg`) };
    }, type);
    const sb = await surfInfo("surfBox");
    t.check("surface box: a surface body 20 x 20 x 20 (area 2400), timeline icon", sb && sb.ok && sb.kind === "surface" && near(sb.area, 2400, 1) && sb.tl, JSON.stringify(sb));
    const expect = { SurfPrimitiveCylinder: ["surfCylinder", 2 * Math.PI * 100 + Math.PI * 20 * 20], SurfPrimitiveSphere: ["surfSphere", 4 * Math.PI * 100], SurfPrimitiveTorus: ["surfTorus", null], SurfPrimitiveCoil: ["surfCoil", null] };
    for (const [cmd, [type, area]] of Object.entries(expect)) {
      await t.app((id) => window.app.commands.run(id, { preselect: [{ kind: "originPlane", name: "XY" }] }), cmd);
      await t.waitFor(`.dlg[data-dialog="${cmd}"]`, { timeout: 2500 });
      await t.app(() => { const d = window.app.ui.dialog.current; if (d && !(d.values.plane || []).length) d.pickRef("plane", { kind: "originPlane", name: "XY" }); });
      const okc = await okDialog(t, cmd);
      const si = await surfInfo(type);
      t.check(`${cmd}: surface body${area ? ` (area ${fmt(area)})` : ""}`, okc && si && si.ok && si.kind === "surface" && (!area || near(si.area, area, area * 0.01)), JSON.stringify(si));
    }
    await t.app(() => {
      const a = window.app, S = a.S, K = a.K;
      const sk = S.newSketch();
      S.addLine(sk, S.addPoint(sk, 0, -60), S.addPoint(sk, 50, -60));
      a.addFeature({ type: "sketch", plane: K.ORIGIN_PLANES.XY, planeRef: { kind: "origin", name: "XY" }, sk, visible: true }, "Sketch");
    });
    await t.app(() => window.app.commands.run("SurfPrimitivePipe"));
    await t.waitFor('.dlg[data-dialog="SurfPrimitivePipe"]', { timeout: 2500 });
    await t.app(() => { const a = window.app, f = [...a.doc.features].reverse().find((x) => x.type === "sketch"); a.ui.dialog.current.pickRef("path", { kind: "sketchCurve", sketch: f.id, curve: Object.keys(f.sk.curves)[0] }); });
    t.check("Surface Pipe OK", await okDialog(t, "SurfPrimitivePipe"));
    const sp = await surfInfo("surfPipe");
    t.check("surface pipe along the 50 mm line: a surface body", sp && sp.ok && sp.kind === "surface", JSON.stringify(sp));
    await t.app((id) => window.app.editFeature(id), sb.id);
    t.check("Edit Feature reopens the surface Box", await t.waitFor(`.dlg[data-dialog="SurfPrimitiveBox"][data-edit="${sb.id}"]`, { timeout: 3000 }));
    await t.fill('.dlg[data-dialog="SurfPrimitiveBox"] [data-input="height"]', "10 mm");
    await okDialog(t, "SurfPrimitiveBox");
    const sb2 = await surfInfo("surfBox");
    t.check("edited surface box 20 x 20 x 10 (area 1600)", sb2.ok && near(sb2.area, 1600, 1), JSON.stringify(sb2));
    await t.blur();
    await t.key("Control+z");
    await t.settle(300);
    const sb3 = await surfInfo("surfBox");
    t.check("Ctrl+Z: area 2400 again", near(sb3.area, 2400, 1), JSON.stringify(sb3));
    const rt2 = await t.app(() => {
      const a = window.app;
      const snap = () => a.doc.features.filter((f) => f.type.startsWith("surf")).map((f) => { const r = a.featureResult(f.id) || {}; const i = f.newBody && a.bodyInfo(f.newBody); return { ok: !!r.ok, k: a.bodyKind(f.newBody), ar: i ? Math.round(i.area) : null }; });
      const before = snap(); const json = JSON.stringify(a.doc);
      a.newDocument("tmp"); a.loadDocument(JSON.parse(json));
      return { before, after: snap() };
    });
    t.check("surface primitives survive save / open", rt2.before.length === 6 && rt2.before.every((b, i) => b.ok && b.k === "surface" && rt2.after[i].ok && rt2.after[i].ar === b.ar), JSON.stringify(rt2));

    // ------------------------------------------------------------ Cosmetic Bend
    t.step("Cosmetic Bend: a sheet metal plate, flat pattern, a sketch line on it, Cosmetic Bend (press brake, down)");
    await t.app(() => {
      const a = window.app;
      a.newDocument("QA cosmetic bend");
      const sk = a.S.newSketch();
      const P = [[0, 0], [80, 0], [80, 50], [0, 50]].map((q) => a.S.addPoint(sk, q[0], q[1]));
      P.forEach((p, i) => a.S.addLine(sk, p, P[(i + 1) % P.length]));
      const s = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk, visible: false });
      const reg = a.sketchState(s.id).regions.regions[0];
      a.addFeature({ type: "smBaseFlange", profiles: [{ sketch: s.id, key: reg.key, c: [5, 5] }], orientation: "side1", operation: "new" });
      const s2 = a.S.newSketch();
      a.S.addLine(s2, a.S.addPoint(s2, 40, 0), a.S.addPoint(s2, 40, 50));
      a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk: s2, visible: true });
    });
    const smb = await t.app(() => { const a = window.app; const f = a.doc.features.find((x) => x.type === "smBaseFlange"); return f && (f.newBodies || [])[0]; });
    const flatOk = await t.app((b) => window.app.ui.sheetMetal.enterFlat(b), smb);
    t.check("flat pattern entered", flatOk && (await t.app(() => window.app.mode)) === "flatpattern");
    // Fusion 2706 shows Cosmetic Bend in the FLAT PATTERN SURFACE tab only: in the solid flat pattern it comes from the S toolbox
    await t.mouseToCanvas(0.6, 0.6);
    await t.key("s");
    let cbHow = null;
    if (await t.waitFor(".tbx-root input", { timeout: 2000 })) {
      await t.type("Cosmetic Bend");
      await t.settle(250);
      if (await t.click('.tbx-root [data-cmd="FusionSheetMetalCosmeticBendCmd"]', { timeout: 1500 })) cbHow = "toolbox";
    }
    if (!(await t.waitFor('.dlg[data-dialog="FusionSheetMetalCosmeticBendCmd"]', { timeout: 2000 }))) { await t.escapeAll(1); await t.app(() => window.app.commands.run("FusionSheetMetalCosmeticBendCmd")); cbHow = "api"; }
    t.check("Cosmetic Bend opens in the flat pattern (S toolbox)", cbHow === "toolbox" && (await t.waitFor('.dlg[data-dialog="FusionSheetMetalCosmeticBendCmd"]', { timeout: 2500 })), cbHow);
    await t.app(() => { const a = window.app, f = [...a.doc.features].reverse().find((x) => x.type === "sketch"); a.ui.dialog.current.pickRef("lines", { kind: "sketchCurve", sketch: f.id, curve: Object.keys(f.sk.curves)[0] }); });
    await t.app(() => { const d = window.app.ui.dialog.current; d.set("bendType", "pressBrake"); d.set("direction", "down"); });
    t.check("Cosmetic Bend OK", await okDialog(t, "FusionSheetMetalCosmeticBendCmd"));
    const cb = await t.app(() => {
      const a = window.app, f = a.doc.features.find((x) => x.type === "smCosmeticBend"), r = a.featureResult(f.id) || {};
      const grp = a.viewport.scene.getObjectByName("sm-cosmetic-bends");
      const sm = a.doc.features.find((x) => x.type === "smBaseFlange");
      return { ok: !!r.ok, lines: (r.cosmetic || []).length, drawn: !!(grp && grp.children.length), vol: a.bodyInfo(sm.newBodies[0]).volume, tl: !!document.querySelector(`#timeline [data-feature="${f.id}"] svg`), f: JSON.parse(JSON.stringify(f)) };
    });
    t.check("cosmetic bend feature: 1 line drawn on the flat pattern, folded model unchanged, timeline icon", cb.ok && cb.lines === 1 && cb.drawn && cb.tl && cb.f.bendType === "pressBrake" && cb.f.direction === "down" && /90/.test(cb.f.angle), JSON.stringify(cb));
    await t.app(() => window.app.commands.run("FusionSheetMetalExitFlatPatternCmd"));
    await t.settle(200);
    const cbGone = await t.app(() => { const g = window.app.viewport.scene.getObjectByName("sm-cosmetic-bends"); return !g || !g.children.length; });
    t.check("bend lines only in the flat pattern (gone after Finish Flat Pattern)", cbGone);
    await t.blur();
    await t.key("Control+z");
    await t.settle(200);
    t.check("Ctrl+Z removes the cosmetic bend", !(await t.app(() => window.app.doc.features.some((x) => x.type === "smCosmeticBend"))));
    await t.key("Control+y");
    await t.settle(200);
    const cbRt = await t.app(() => { const a = window.app; const json = JSON.stringify(a.doc); a.newDocument("tmp"); a.loadDocument(JSON.parse(json)); const f = a.doc.features.find((x) => x.type === "smCosmeticBend"); return !!(f && (a.featureResult(f.id) || {}).ok); });
    t.check("Ctrl+Y and save / open keep the cosmetic bend", cbRt);

    // ------------------------------------------------------------ Modify Model
    t.step("Modify Model: a volumetric lattice, then Modify Model opens its settings");
    await t.app(() => { const a = window.app; a.newDocument("QA modify model"); a.addFeature({ type: "box", length: "20 mm", width: "20 mm", height: "20 mm", center: [0, 0], operation: "new", plane: { kind: "origin", name: "XY" } }); });
    const vb = await t.app(() => window.app.doc.features[0].newBody);
    await t.app((b) => window.app.commands.run("VolFieldCreateLatticeCommand", { preselect: [{ kind: "body", body: b }] }), vb);
    await t.waitFor('.dlg[data-dialog="VolFieldCreateLatticeCommand"]', { timeout: 3000 });
    await okDialog(t, "VolFieldCreateLatticeCommand");
    const vk = await t.app((b) => window.app.bodyKind(b), vb);
    t.check("the box is a volumetric model", vk === "volumetric", vk);
    await t.app(() => window.app.selection.clear());
    await t.app(() => window.app.commands.run("VolFieldModifyModelCommand"));
    t.check("Modify Model dialog opens", await t.waitFor('.dlg[data-dialog="VolFieldModifyModelCommand"]', { timeout: 2500 }));
    await t.app((b) => window.app.ui.dialog.current.pickRef("model", { kind: "body", body: b }), vb);
    await okDialog(t, "VolFieldModifyModelCommand");
    const lat = await t.app(() => window.app.doc.features.find((x) => x.type === "vlattice").id);
    t.check("Modify Model opens the lattice settings (Edit Feature)", await t.waitFor(`.dlg[data-dialog="VolFieldCreateLatticeCommand"][data-edit="${lat}"]`, { timeout: 3000 }));
    await t.escapeAll(2);
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
