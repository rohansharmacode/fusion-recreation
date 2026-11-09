// solidx QA scenario: construction axes / points / planes, Offset / Split / Replace / Remove Faces, Remove Features,
// Align, Base Feature, Edit Face and Automated Modeling through their dialogs; undo / redo, Edit Feature, save / open.
import { defineScenario, mainIfDirect, apiBox, near, fmt } from "../lib.mjs";

/** In-page helpers installed once: face / edge refs of a body by predicate. */
async function installHelpers(t) {
  await t.app(() => {
    const A = window.app;
    window.qa = {
      faces(body) { const s = A.body(body).shape; return A.K.topoOf(s).faces.map((f, i) => ({ i, ...f })); },
      edges(body) { const s = A.body(body).shape; return A.K.topoOf(s).edges.map((e, i) => ({ i, ...e })); },
      faceRef(body, pred) {
        const f = this.faces(body).find(pred);
        return f ? { kind: "face", body, index: f.i, p: f.c, n: f.n, planar: f.type === "PLANE" } : null;
      },
      edgeRef(body, pred) {
        const e = this.edges(body).find(pred);
        return e ? { kind: "edge", body, index: e.i, p: e.m } : null;
      },
      vertexRef(body, p) { return { kind: "vertex", body, p }; },
      dlgOk() { const b = document.querySelector('.dlg [data-action="ok"]'); if (!b || b.disabled) return false; b.click(); return true; },
      last() { const fs = A.doc.features; return fs[fs.length - 1]; },
    };
  });
}
const near3 = (a, b, tol = 1e-3) => Array.isArray(a) && Array.isArray(b) && a.every((v, i) => Math.abs(v - b[i]) <= tol);

const scenario = defineScenario({
  name: "solidx",
  title: "SOLID Modify / Construct tools: construction axes, points, planes, face tools, align, base feature",
  timeout: 280000,
  async run(t) {
    t.step("setup: Box1 40x20x10 and a cylinder");
    const b = await apiBox(t);
    await installHelpers(t);
    const body = b.body;
    t.require("box computed", b.ok);

    // ---- construction: run each command with preselected refs, press OK, check the evaluated geometry ----
    const run = async (cmd, refsJs) => {
      await t.app(({ cmd, refsJs }) => {
        // eslint-disable-next-line no-new-func
        const refs = new Function("qa", "app", `return (${refsJs});`)(window.qa, window.app);
        window.app.commands.run(cmd, { preselect: refs });
      }, { cmd, refsJs });
      await t.settle(250);
      const open = await t.app((cmd) => !!document.querySelector(`.dlg[data-dialog="${cmd}"]`), cmd);
      const ok = open && (await t.app(() => window.qa.dlgOk()));
      await t.settle(250);
      const f = await t.app(() => { const f = window.qa.last(); const r = window.app.featureResult(f.id) || {}; return { id: f.id, type: f.type, mode: f.mode, name: f.name, ok: r.ok !== false, error: r.error }; });
      return { open, ok, f };
    };
    const axisOf = (id) => t.app((id) => { const a = window.app.result.state.axes && window.app.result.state.axes.get(id); return a ? { o: a.o, d: a.d } : null; }, id);
    const pointOf = (id) => t.app((id) => { const p = window.app.result.state.points && window.app.result.state.points.get(id); return p ? p.p : null; }, id);
    const planeOf = (id) => t.app((id) => { const p = window.app.planeState(id); return p ? p.plane : null; }, id);

    t.step("Axis Through Edge on the bottom front edge (along X)");
    let r = await run("ConstructionAxisThroughEdgeCommand", `[qa.edgeRef("${body}", (e) => e.type === "LINE" && Math.abs(e.d[0]) > 0.99 && e.m[1] < -9 && e.m[2] < 1)]`);
    t.check("dialog opened and OK", r.open && r.ok, JSON.stringify(r));
    t.check("Axis1 created", r.f.type === "caxis" && r.f.name === "Axis1" && r.f.ok, JSON.stringify(r.f));
    const ax1 = r.f.id;
    let a = await axisOf(ax1);
    t.check("axis along X through (.., -10, 0)", a && Math.abs(Math.abs(a.d[0]) - 1) < 1e-6 && near(a.o[1], -10, 1e-6) && near(a.o[2], 0, 1e-6), JSON.stringify(a));

    t.step("Axis Through Two Planes (XZ origin plane and the top face)");
    r = await run("ConstructionAxisFromTwoPlanesCommand", `[{ kind: "originPlane", name: "XZ" }, qa.faceRef("${body}", (f) => f.type === "PLANE" && f.n[2] > 0.99)]`);
    a = await axisOf(r.f.id);
    t.check("axis along X at z = 10, y = 0", r.f.ok && a && Math.abs(Math.abs(a.d[0]) - 1) < 1e-6 && near(a.o[2], 10, 1e-6) && near(a.o[1], 0, 1e-6), JSON.stringify({ f: r.f, a }));

    t.step("Point At Vertex, Point Through Three Planes, Point At Edge And Plane");
    r = await run("ConstructionPointFromPointCommand", `[qa.vertexRef("${body}", [20, 10, 10])]`);
    let p = await pointOf(r.f.id);
    t.check("Point1 at (20, 10, 10)", r.f.name === "Point1" && near3(p, [20, 10, 10]), JSON.stringify({ f: r.f, p }));
    const pt1 = r.f.id;
    r = await run("ConstructionPointFromThreePlanesCommand", `[{ kind: "originPlane", name: "XY" }, { kind: "originPlane", name: "XZ" }, qa.faceRef("${body}", (f) => f.type === "PLANE" && f.n[0] > 0.99)]`);
    p = await pointOf(r.f.id);
    t.check("three planes meet at (20, 0, 0)", r.f.ok && near3(p, [20, 0, 0]), JSON.stringify({ f: r.f, p }));
    r = await run("ConstructionPointAtEdgeAndPlaneCommand", `[{ kind: "originAxis", name: "Z" }, qa.faceRef("${body}", (f) => f.type === "PLANE" && f.n[2] > 0.99)]`);
    p = await pointOf(r.f.id);
    t.check("Z axis meets the top face at (0, 0, 10)", r.f.ok && near3(p, [0, 0, 10]), JSON.stringify({ f: r.f, p }));

    t.step("Axis Through Two Points (origin point and Point1)");
    r = await run("ConstructionAxisThroughTwoPointsCommand", `[{ kind: "originPoint" }, { kind: "cpoint", id: "${pt1}" }]`);
    a = await axisOf(r.f.id);
    t.check("axis from the origin towards (20, 10, 10)", r.f.ok && a && near3(a.d, [20 / Math.hypot(20, 10, 10), 10 / Math.hypot(20, 10, 10), 10 / Math.hypot(20, 10, 10)], 1e-6), JSON.stringify({ f: r.f, a }));

    t.step("Plane Through Three Points, Plane Through Two Edges, Plane Along Path");
    r = await run("ConstructionPlaneFromThreePointsCommand", `[qa.vertexRef("${body}", [-20, -10, 10]), qa.vertexRef("${body}", [20, -10, 10]), qa.vertexRef("${body}", [20, 10, 0])]`);
    let pl = await planeOf(r.f.id);
    t.check("three-point plane is a cplane named Plane<n>", r.f.type === "cplane" && r.f.mode === "threePoints" && /^Plane\d+$/.test(r.f.name) && pl, JSON.stringify(r.f));
    t.check("its normal is perpendicular to X (diagonal plane)", pl && Math.abs(pl.n[0]) < 1e-6 && Math.abs(Math.abs(pl.n[2]) - Math.abs(pl.n[1]) * 2) < 1e-6, JSON.stringify(pl));
    r = await run("ConstructionPlaneFromTwoEdgesCommand", `[qa.edgeRef("${body}", (e) => e.type === "LINE" && Math.abs(e.d[0]) > 0.99 && e.m[1] < -9 && e.m[2] > 9), qa.edgeRef("${body}", (e) => e.type === "LINE" && Math.abs(e.d[0]) > 0.99 && e.m[1] > 9 && e.m[2] < 1)]`);
    pl = await planeOf(r.f.id);
    t.check("plane through two opposite edges", r.f.ok && pl && Math.abs(pl.n[0]) < 1e-6, JSON.stringify({ f: r.f, pl }));
    r = await run("ConstructionPlaneAlongPathCommand", `[qa.edgeRef("${body}", (e) => e.type === "LINE" && Math.abs(e.d[0]) > 0.99 && e.m[1] < -9 && e.m[2] < 1)]`);
    pl = await planeOf(r.f.id);
    t.check("plane along path is normal to the edge at its start", r.f.ok && pl && Math.abs(Math.abs(pl.n[0]) - 1) < 1e-6 && near(Math.abs(pl.o[0]), 20, 1e-6), JSON.stringify({ f: r.f, pl }));

    t.step("Tangent Plane on a cylinder, Axis Through Cylinder, Point At Center, Axis Perpendicular at Point");
    const cyl = await t.app(() => { const f = window.app.addFeature({ type: "cylinder", diameter: "10 mm", height: "10 mm", center: [40, 0], operation: "new", plane: { kind: "origin", name: "XY" } }); return { id: f.id, body: f.newBody }; });
    r = await run("ConstructionAxisThroughCylinderCommand", `[qa.faceRef("${cyl.body}", (f) => f.type === "CYLINDRE")]`);
    a = await axisOf(r.f.id);
    t.check("axis through the cylinder centre (40, 0) along Z", r.f.ok && a && Math.abs(Math.abs(a.d[2]) - 1) < 1e-6 && near(a.o[0], 40, 1e-6) && near(a.o[1], 0, 1e-6), JSON.stringify({ f: r.f, a }));
    const cylAxis = r.f.id;
    r = await run("ConstructionTangentPlaneCommand", `[qa.faceRef("${cyl.body}", (f) => f.type === "CYLINDRE")]`);
    pl = await planeOf(r.f.id);
    const distAxis = pl ? Math.hypot(pl.o[0] - 40, pl.o[1]) : NaN;
    t.check("tangent plane touches the cylinder (5 mm from its axis, normal radial)", r.f.ok && near(distAxis, 5, 1e-4) && Math.abs(pl.n[2]) < 1e-6, JSON.stringify({ f: r.f, pl }));
    r = await run("ConstructionPointFromCircleOrSphereCommand", `[qa.edgeRef("${cyl.body}", (e) => e.type === "CIRCLE" && e.m[2] > 9)]`);
    p = await pointOf(r.f.id);
    t.check("point at the centre of the top circle", r.f.ok && near3(p, [40, 0, 10]), JSON.stringify({ f: r.f, p }));
    r = await run("ConstructionAxisNormalToFaceCommand", `[qa.faceRef("${body}", (f) => f.type === "PLANE" && f.n[2] > 0.99)]`);
    a = await axisOf(r.f.id);
    t.check("axis normal to the top face", r.f.ok && a && Math.abs(a.d[2] - 1) < 1e-6 && near(a.o[2], 10, 1e-6), JSON.stringify({ f: r.f, a }));

    t.step("construction axis used by Revolve and Circular Pattern; construction point by Scale");
    const rev = await t.app((ax) => {
      const A = window.app;
      const f = A.addFeature({ type: "cpattern", bodies: [A.doc.features.find((x) => x.type === "cylinder").newBody], axis: { kind: "caxis", id: ax }, count: "3", angle: "360 deg" });
      return { ok: (A.featureResult(f.id) || {}).ok, n: A.bodies().length };
    }, ax1);
    t.check("circular pattern around Axis1 evaluates", rev.ok, JSON.stringify(rev));
    const accepts = await t.app(() => {
      const A = window.app;
      A.commands.run("Revolve");
      const d = A.ui.dialog.current;
      const axDef = d && d.defs && d.defs.axis;
      const ok = !!axDef && d._accepts(axDef, { kind: "caxis", id: "x" });
      d && d.cancel();
      return ok;
    });
    t.check("Revolve's Axis row accepts construction axes", accepts);

    t.step("browser Construction folder lists axes and points; canvas pick of an axis");
    const br = await t.app(() => [...document.querySelectorAll('[data-node^="feature:"]')].map((n) => n.textContent.trim()).filter((s) => /^(Axis|Point)\d+/.test(s)));
    t.check("browser shows Axis1 and Point1", br.some((s) => s.startsWith("Axis1")) && br.some((s) => s.startsWith("Point1")), JSON.stringify(br));
    const pick = await t.app((id) => {
      const A = window.app, v = A.ui.solidx.construction;
      const s = v.screenPoint(id);
      const h = s && A.viewport.pick(s[0], s[1]);
      return h && h.ref;
    }, cylAxis);
    t.check("picking a construction axis gives its feature", pick && pick.kind === "feature" && pick.id === cylAxis, JSON.stringify(pick));

    t.step("UI: CONSTRUCT menu > Axis Through Cylinder/Cone/Torus, pick the cylinder on the canvas, OK");
    await t.escapeAll(2);
    await t.app(() => window.app.selection.clear());
    await t.click('#toolbar [data-panel="ConstructionPanel"]');
    await t.settle(200);
    t.check("CONSTRUCT menu item is real", await t.click('[data-cmd="ConstructionAxisThroughCylinderCommand"]'));
    await t.settle(300);
    t.check("dialog opened from the menu", await t.app(() => !!document.querySelector('.dlg[data-dialog="ConstructionAxisThroughCylinderCommand"]')));
    const aimPts = [];
    for (let k = 0; k < 12; k++) { const th = (k / 12) * 2 * Math.PI; aimPts.push([40 + 5 * Math.cos(th), 5 * Math.sin(th), 5]); }
    const aim = await t.aim(aimPts, `h && h.ref.kind === "face" && h.ref.body === "${cyl.body}"`);
    t.check("cylinder face is pickable for the Face row", !!aim);
    if (aim) await t.canvasClick(aim.x, aim.y);
    await t.settle(300);
    t.check("face row filled by the canvas click", await t.app(() => { const d = window.app.ui.dialog.current; return !!d && (d.values.face || []).length === 1; }));
    await t.click('.dlg [data-action="ok"]');
    await t.settle(300);
    r = { f: await t.app(() => { const f = window.qa.last(); return { id: f.id, type: f.type, name: f.name, ok: (window.app.featureResult(f.id) || {}).ok !== false }; }) };
    a = await axisOf(r.f.id);
    t.check("axis made through the UI runs along Z at (40, 0)", r.f.type === "caxis" && r.f.ok && a && near(a.o[0], 40, 1e-6) && near(a.o[1], 0, 1e-6), JSON.stringify({ f: r.f, a }));

    t.step("Edit Feature of a point (At Vertex -> another vertex) and undo");
    await t.app((id) => window.app.editFeature(id), pt1);
    await t.settle(250);
    t.check("Edit Feature opens Point At Vertex", await t.app(() => !!document.querySelector('.dlg[data-dialog="ConstructionPointFromPointCommand"][data-edit]')));
    await t.escapeAll(1);

    t.step("save / open round trip keeps construction geometry");
    const rt = await t.app(async () => {
      const A = window.app;
      const json = JSON.stringify(A.doc);
      const nA = A.result.state.axes.size, nP = A.result.state.points.size;
      A.loadDocument(JSON.parse(json));
      await new Promise((r) => setTimeout(r, 50));
      return { nA, nP, nA2: A.result.state.axes.size, nP2: A.result.state.points.size, ok: A.doc.features.every((f) => (A.featureResult(f.id) || {}).ok !== false) };
    });
    t.check("axes and points survive a reload", rt.nA === rt.nA2 && rt.nP === rt.nP2 && rt.ok, JSON.stringify(rt));
    await t.shot("construction");

    // =========================== face tools ===========================
    t.step("new document: Box 40x20x10, Offset Face on the top face (+5 mm) through the dialog");
    await t.app(() => window.app.newDocument("QA solidx faces"));
    await t.settle(200);
    const box2 = await apiBox(t);
    const B = box2.body;
    const bodyVol = (id) => t.app((id) => (window.app.bodyInfo(id) || {}).volume, id);
    const nFaces = (id) => t.app((id) => window.app.K.topoOf(window.app.body(id).shape).faces.length, id);
    const openCmd = async (cmd, refsJs) => {
      await t.app(({ cmd, refsJs }) => {
        // eslint-disable-next-line no-new-func
        const refs = new Function("qa", "app", `return (${refsJs});`)(window.qa, window.app);
        window.app.commands.run(cmd, { preselect: refs });
      }, { cmd, refsJs });
      await t.settle(300);
      return t.app((cmd) => !!document.querySelector(`.dlg[data-dialog="${cmd}"]`), cmd);
    };
    const ok = async () => { const r = await t.app(() => window.qa.dlgOk()); await t.settle(400); return r; };
    const lastRes = () => t.app(() => { const f = window.qa.last(); const r = window.app.featureResult(f.id) || {}; return { id: f.id, type: f.type, name: f.name, ok: r.ok !== false, error: r.error, warning: r.warning }; });
    const TOP = (bid) => `qa.faceRef("${bid}", (f) => f.type === "PLANE" && f.n[2] > 0.99)`;

    t.check("Offset Face dialog opens with the top face", await openCmd("FusionOffsetFacesCommand", `[${TOP(B)}]`));
    await t.fill('.dlg [data-input="distance"]', "5 mm");
    await t.settle(500);
    t.check("OK commits Offset Face", await ok());
    let res = await lastRes();
    t.check("Offset Face1 in the timeline", res.type === "offsetface" && res.ok && res.name === "Offset Face1", JSON.stringify(res));
    t.check("body volume 40x20x15 = 12000", near(await bodyVol(B), 12000, 0.5), fmt(await bodyVol(B)));
    await t.blur();
    await t.key("Control+z");
    await t.settle(300);
    t.check("undo restores 8000", near(await bodyVol(B), 8000, 0.5), fmt(await bodyVol(B)));
    await t.key("Control+y");
    await t.settle(300);
    t.check("redo gives 12000 again", near(await bodyVol(B), 12000, 0.5), fmt(await bodyVol(B)));
    const offId = res.id;

    t.step("Split Face: top face split by the YZ origin plane");
    const nf0 = await nFaces(B);
    t.check("Split Face dialog opens", await openCmd("FusionSplitFaceCommand", `[${TOP(B)}]`));
    await t.app(() => { const d = window.app.ui.dialog.current; d.pickRef("tools", { kind: "originPlane", name: "YZ" }); });
    await t.settle(400);
    t.check("OK commits Split Face", await ok());
    res = await lastRes();
    const nf1 = await nFaces(B);
    t.check("Split Face1 evaluates and adds a face", res.type === "splitface" && res.ok && nf1 === nf0 + 1, JSON.stringify({ res, nf1, nf0 }));
    t.check("volume unchanged by the split", near(await bodyVol(B), 12000, 0.5));

    t.step("Remove Faces: a through hole is removed and healed");
    await t.app((bid) => window.app.addFeature({ type: "cylinder", diameter: "6 mm", height: "40 mm", center: [10, 0], operation: "cut", bodies: [bid], plane: { kind: "origin", name: "XY" } }), B);
    await t.settle(300);
    const vHole = await bodyVol(B);
    t.check("hole cut", near(vHole, 12000 - Math.PI * 9 * 15, 1), fmt(vHole));
    t.check("Remove Faces dialog opens", await openCmd("FusionRemoveFacesCommand", `[qa.faceRef("${B}", (f) => f.type === "CYLINDRE")]`));
    t.check("OK commits Remove Faces", await ok());
    res = await lastRes();
    t.check("Remove Faces1 heals the body back to 12000", res.type === "removefaces" && res.ok && near(await bodyVol(B), 12000, 0.5), JSON.stringify({ res, v: await bodyVol(B) }));

    t.step("Remove Features: a 2 mm fillet and a 4 mm hole are found and removed");
    await t.app((bid) => {
      const A = window.app;
      A.addFeature({ type: "cylinder", diameter: "4 mm", height: "40 mm", center: [-10, 0], operation: "cut", bodies: [bid], plane: { kind: "origin", name: "XY" } });
      const e = window.qa.edgeRef(bid, (e) => e.type === "LINE" && Math.abs(e.d[0]) > 0.99 && e.m[1] < -9 && e.m[2] > 14);
      A.addFeature({ type: "fillet", edges: [{ body: bid, p: e.p }], radius: "2 mm" });
    }, B);
    await t.settle(300);
    const vFeat = await bodyVol(B);
    t.check("fillet + hole made", vFeat < 12000 - 100, fmt(vFeat));
    t.check("Remove Features dialog opens", await openCmd("FusionRemoveFeaturesCommand", `[{ kind: "body", body: "${B}" }]`));
    t.check("OK commits Remove Features", await ok());
    res = await lastRes();
    t.check("Remove Features1 restores 12000", res.type === "removefeatures" && res.ok && near(await bodyVol(B), 12000, 0.5), JSON.stringify({ res, v: await bodyVol(B) }));

    t.step("Replace Face: top face replaced by an offset plane at z = 20");
    const cp = await t.app(() => window.app.addFeature({ type: "cplane", mode: "offset", base: { kind: "origin", name: "XY" }, offset: "20 mm" }).id);
    t.check("Replace Face dialog opens", await openCmd("FusionReplaceFaceCommand", `[${TOP(B)}]`));
    await t.app((cp) => { const d = window.app.ui.dialog.current; d.pickRef("target", { kind: "cplane", id: cp }); }, cp);
    await t.settle(400);
    t.check("OK commits Replace Face", await ok());
    res = await lastRes();
    t.check("Replace Face1 grows the body to z = 20 (16000)", res.type === "replaceface" && res.ok && near(await bodyVol(B), 16000, 0.5), JSON.stringify({ res, v: await bodyVol(B) }));

    t.step("Edit Feature of Offset Face from the timeline (distance 5 -> 2)");
    await t.dblclick(`[data-feature="${offId}"]`);
    await t.settle(400);
    t.check("Offset Face reopens for editing", await t.app(() => !!document.querySelector('.dlg[data-dialog="FusionOffsetFacesCommand"][data-edit]')));
    await t.fill('.dlg [data-input="distance"]', "2 mm");
    await t.settle(400);
    await ok();
    t.check("downstream features still evaluate", await t.app(() => window.app.doc.features.every((f) => (window.app.featureResult(f.id) || {}).ok !== false)), await t.app(() => JSON.stringify(window.app.doc.features.map((f) => [f.name, (window.app.featureResult(f.id) || {}).error]))));
    t.check("replace face still ends at z = 20", near(await bodyVol(B), 16000, 0.5), fmt(await bodyVol(B)));

    // =========================== align ===========================
    t.step("Align: a second box's bottom face onto the first box's top face");
    const b3 = await apiBox(t, { center: [100, 0] });
    t.check("Align dialog opens", await openCmd("AlignCmd", `[qa.faceRef("${b3.body}", (f) => f.type === "PLANE" && f.n[2] < -0.99)]`));
    await t.app((bid) => { const d = window.app.ui.dialog.current; d.pickRef("to", window.qa.faceRef(bid, (f) => f.type === "PLANE" && f.n[2] > 0.99)); }, B);
    await t.settle(400);
    t.check("OK commits Align", await ok());
    res = await lastRes();
    const bb3 = await t.app((id) => window.app.bodyInfo(id).bbox, b3.body);
    t.check("Align1 puts the box on top (z 20..30, centred on the first box)", res.type === "align" && res.ok && bb3 && near(bb3.min[2], 20, 1e-3) && near(bb3.max[2], 30, 1e-3) && near((bb3.min[0] + bb3.max[0]) / 2, 0, 1e-3), JSON.stringify({ res, bb3 }));

    // =========================== base feature ===========================
    t.step("Create Base Feature: environment, a box made inside, Finish Base Feature bakes it");
    await t.click('#toolbar [data-panel="SolidCreatePanel"]');
    await t.settle(200);
    t.check("CREATE menu lists Create Base Feature", await t.app(() => !!document.querySelector('[data-cmd="BaseFeatureCreationCommand"]')));
    await t.escapeAll(1);
    await t.app(() => window.app.commands.run("BaseFeatureCreationCommand"));
    await t.settle(300);
    t.check("BASE FEATURE environment active with FINISH BASE FEATURE", await t.app(() => window.app.inMode("basefeature") && !!document.querySelector('#toolbar [data-cmd="BaseFeatureStop"]')));
    const nBefore = await t.app(() => window.app.doc.features.length);
    await t.app(() => window.app.addFeature({ type: "box", length: "10 mm", width: "10 mm", height: "10 mm", center: [0, 60], operation: "new", plane: { kind: "origin", name: "XY" } }));
    await t.settle(200);
    await t.click('#toolbar [data-cmd="BaseFeatureStop"]');
    await t.settle(500);
    const bf = await t.app(() => {
      const A = window.app;
      const f = A.doc.features.find((x) => x.type === "basefeature");
      return { env: A.inMode("basefeature"), n: A.doc.features.length, ok: f && (A.featureResult(f.id) || {}).ok, nb: f ? Object.keys(f.breps || {}).length : -1, name: f && f.name };
    });
    t.check("environment closed, box baked into Base Feature1", !bf.env && bf.n === nBefore && bf.ok && bf.nb === 1 && bf.name === "Base Feature1", JSON.stringify({ bf, nBefore }));
    await t.key("Control+z");
    await t.settle(300);
    t.check("undo of Finish Base Feature brings the box feature back", await t.app((n) => window.app.doc.features.length === n + 1, nBefore));
    await t.key("Control+y");
    await t.settle(300);

    // =========================== edit face ===========================
    t.step("Edit Face: move a control point of the top face of a new box");
    const b4 = await apiBox(t, { center: [0, -60] });
    const v4 = await bodyVol(b4.body);
    t.check("Edit Face dialog opens", await openCmd("EditFaceCommand", `[${TOP(b4.body)}]`));
    t.check("control point handles are shown", await t.app(() => { const d = window.app.ui.dialog.current; return !!d && !!d.manips && typeof d.manips.screenPoint === "function" && !!d.manips.screenPoint("cp1,1"); }));
    await t.app(() => { const d = window.app.ui.dialog.current; d.values.moves = { "1,1": [0, 0, 4] }; d.previewNow(); });
    await t.settle(500);
    t.check("OK commits Edit Face", await ok());
    res = await lastRes();
    const v4b = await bodyVol(b4.body);
    t.check("Edit Face1 bulges the face (volume grows)", res.type === "editface" && res.ok && v4b > v4 + 50, JSON.stringify({ res, v4, v4b }));

    // =========================== automated modeling ===========================
    t.step("Automated Modeling: connect two facing faces of separate boxes");
    const b5 = await apiBox(t, { center: [0, 120], L: "10 mm", W: "10 mm" });
    const b6 = await apiBox(t, { center: [30, 120], L: "10 mm", W: "10 mm" });
    t.check("Automated Modeling dialog opens", await openCmd("AutomatedModelingCommand", `[qa.faceRef("${b5.body}", (f) => f.type === "PLANE" && f.n[0] > 0.99), qa.faceRef("${b6.body}", (f) => f.type === "PLANE" && f.n[0] < -0.99)]`));
    await t.click('.dlg [data-input="generate"]');
    await t.settle(600);
    const tiles = await t.app(() => [...document.querySelectorAll(".sx-am-tile")].map((x) => ({ v: x.dataset.option, sel: x.classList.contains("sel"), dis: x.disabled })));
    t.check("three alternatives, the first selected", tiles.length === 3 && tiles[0].sel && !tiles[0].dis, JSON.stringify(tiles));
    t.check("OK commits Automated Modeling", await ok());
    res = await lastRes();
    const v56 = await bodyVol(b5.body);
    t.check("the connecting shape joins both boxes into one body", res.type === "automodel" && res.ok && v56 > 2000 + 1500 && !(await t.app((id) => !!window.app.body(id), b6.body)), JSON.stringify({ res, v56 }));

    t.step("save / open round trip of all features");
    const before = await t.app(() => window.app.bodies().map((b) => [b.id, Math.round(window.app.bodyInfo(b.id).volume)]));
    const after = await t.app(async () => {
      const A = window.app;
      A.loadDocument(JSON.parse(JSON.stringify(A.doc)));
      await new Promise((r) => setTimeout(r, 50));
      return { vols: A.bodies().map((b) => [b.id, Math.round(A.bodyInfo(b.id).volume)]), ok: A.doc.features.every((f) => (A.featureResult(f.id) || {}).ok !== false) };
    });
    t.check("reopened document evaluates to the same bodies", after.ok && JSON.stringify(after.vols) === JSON.stringify(before), JSON.stringify({ before, after }));
    await t.shot("face-tools");
  },
});
export default scenario;
await mainIfDirect(import.meta.url, scenario);
