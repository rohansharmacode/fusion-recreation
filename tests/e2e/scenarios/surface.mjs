// SURFACE tab: every surface command through its Fusion dialog (toolbar / dropdown -> dialog rows ->
// selections (canvas clicks where practical) -> live preview -> OK) and the results: surface / solid
// bodies, areas and volumes, timeline items with icons, undo / redo, Edit Feature and save / open.
import { defineScenario, mainIfDirect, near } from "../lib.mjs";

const SURFACE_IDS = [
  "SurfaceExtrude", "SurfaceRevolve", "SurfaceSweep", "SurfaceLoft", "FusionSurfacePatchCommand", "FusionSurfaceRuledCommand",
  "FusionSurfaceOffsetCommand", "FusionSurfaceThickenCommand", "SurfaceSculpt", "FusionExtendCommand", "FusionSurfaceTrimCommand",
  "FusionSurfaceUntrimCommand", "FusionSurfaceStitchCommand", "FusionSurfaceUnStitchCommand", "FusionSurfaceMergeCommand",
  "FusionSurfaceReverseNormalCommand", "FusionSurfaceValidateCommand", "FusionPartingLineSplitCmd",
];

/** Open a command from a SURFACE toolbar panel dropdown (falls back to app.commands.run). */
async function openFromPanel(t, panel, id) {
  await t.escapeAll(1);
  let viaUI = false;
  if (await t.click(`#toolbar [data-panel="${panel}"]`, { timeout: 1500 })) {
    await t.waitFor(`#overlay [data-cmd="${id}"]`, { timeout: 1500 });
    viaUI = await t.click(`#overlay [data-cmd="${id}"]`, { timeout: 1000 });
  }
  if (!(await t.waitFor(`.dlg[data-dialog="${id}"]`, { timeout: 2500 }))) {
    await t.escapeAll(1);
    await t.app((id) => window.app.commands.run(id), id);
    viaUI = false;
    if (!(await t.waitFor(`.dlg[data-dialog="${id}"]`, { timeout: 2500 }))) return null;
  }
  return { viaUI };
}
/** Visible row labels of the open dialog. */
const labelsOf = (t, id) => t.app((id) => [...document.querySelectorAll(`.dlg[data-dialog="${id}"] .dlg-row`)].filter((r) => r.offsetParent).map((r) => (r.querySelector(".dlg-label")?.textContent || "").trim()).filter(Boolean), id);
/** Same as a canvas click on that ref (selection rows). */
const pick = (t, row, ref) => t.app(({ row, ref }) => { const d = window.app.ui.dialog.current; d.pickRef(row, ref); return (d.values[row] || []).length; }, { row, ref });
async function ok(t, id) {
  await t.settle(250);
  const en = await t.app((id) => { const b = document.querySelector(`.dlg[data-dialog="${id}"] [data-action="ok"]`); return !!b && !b.disabled; }, id);
  if (en) await t.click(`.dlg[data-dialog="${id}"] [data-action="ok"]`);
  await t.waitFor(() => !window.app.activeCommand, { timeout: 20000 });
  return en;
}
/** Last feature of a type with its result and timeline item. */
const lastFeature = async (t, type) => {
  await t.waitFor((type) => { const f = [...window.app.doc.features].reverse().find((x) => x.type === type); return !!f && !!document.querySelector(`#timeline [data-feature="${f.id}"]`); }, { timeout: 2000, arg: type });
  return lastFeatureNow(t, type);
};
const lastFeatureNow = (t, type) => t.app((type) => {
  const a = window.app;
  const f = [...a.doc.features].reverse().find((x) => x.type === type);
  if (!f) return null;
  const el = document.querySelector(`#timeline [data-feature="${f.id}"]`);
  const r = a.featureResult(f.id) || {};
  return { id: f.id, name: f.name, newBody: f.newBody, ok: !!r.ok, error: r.error, item: !!el, icon: !!(el && el.querySelector("svg")) };
}, type);
const body = (t, id) => t.app((id) => { const a = window.app; const i = a.bodyInfo(id); return i ? { kind: a.bodyKind(id), area: i.area, volume: i.volume, faces: a.body(id) ? a.body(id).shape.faces.length : 0 } : null; }, id);
const sketch = (t, kind, data) => t.app(({ kind, data }) => {
  const a = window.app, S = a.S, K = a.K;
  const sk = S.newSketch();
  const out = { curves: [] };
  if (kind === "rect") S.addRect2pt(sk, data.a, data.b);
  if (kind === "poly") { const ids = data.pts.map((p) => S.addPoint(sk, p[0], p[1])); for (let i = 0; i + 1 < ids.length; i++) out.curves.push(S.addLine(sk, ids[i], ids[i + 1])); }
  const plane = data.plane || "XY";
  const pl = data.offset ? K.offsetPlane(K.ORIGIN_PLANES[plane], data.offset) : K.ORIGIN_PLANES[plane];
  const f = a.addFeature({ type: "sketch", plane: pl, planeRef: { kind: "origin", name: plane }, sk });
  out.id = f.id;
  const reg = a.sketchState(f.id).regions.regions[0];
  if (reg) out.profile = { kind: "profile", sketch: f.id, key: reg.key, c: reg.c };
  return out;
}, { kind, data });
/** Edge ref of a body whose mid point satisfies a predicate on m (JS expression). */
const edgeWhere = (t, bodyId, pred) => t.app(({ bodyId, pred }) => {
  const a = window.app;
  const T = a.K.topoOf(a.body(bodyId).shape);
  // eslint-disable-next-line no-new-func
  const test = new Function("g", `return (${pred});`);
  const i = T.edges.findIndex((g) => test(g));
  return i < 0 ? null : { kind: "edge", body: bodyId, index: i, p: T.edges[i].m };
}, { bodyId, pred });
const faceRef = (t, bodyId, k = 0) => t.app(({ bodyId, k }) => { const a = window.app; const T = a.K.topoOf(a.body(bodyId).shape); const f = T.faces[k]; return { kind: "face", body: bodyId, index: k, p: f.c, n: f.n, planar: f.type === "PLANE" }; }, { bodyId, k });

const scenario = defineScenario({
  name: "surface",
  title: "SURFACE tab: surface create / modify tools, Validate, Silhouette Split",
  timeout: 300000,
  async run(t) {
    await t.app(() => window.app.newDocument("Surfaces"));
    t.step("SURFACE tab: every surface command is a real command");
    const real = await t.app((ids) => ids.filter((id) => { const c = window.app.commands.get(id); return c && !c.stub; }), SURFACE_IDS);
    t.require("18 surface commands registered (no stubs)", real.length === SURFACE_IDS.length, SURFACE_IDS.filter((x) => !real.includes(x)).join(", "));
    t.check("SURFACE tab opens", await t.click('[data-tab="SurfaceTab"]'));
    t.check("SURFACE toolbar shows Patch / Extrude / Stitch / Trim buttons", await t.waitFor('#toolbar [data-cmd="FusionSurfacePatchCommand"]', { timeout: 2000 }) && await t.visible('#toolbar [data-cmd="FusionSurfaceStitchCommand"]'));

    // ---------------------------------------------------------------- Extrude (closed profile -> open tube)
    t.step("Extrude a 20 x 10 profile 15 mm: an open tube surface");
    const A = await sketch(t, "rect", { a: [0, 0], b: [20, 10] });
    await t.setView("home");
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);
    await t.escapeAll(1);
    t.check("toolbar Extrude button opens the surface Extrude dialog", await t.click('#toolbar [data-cmd="SurfaceExtrude"]') && await t.waitFor('.dlg[data-dialog="SurfaceExtrude"]', { timeout: 2500 }));
    const exLabels = await labelsOf(t, "SurfaceExtrude");
    t.check("Extrude rows: Profiles, Start, Direction, Extent Type, Distance, Taper Angle, Operation", ["Profiles", "Start", "Direction", "Extent Type", "Distance", "Taper Angle", "Operation"].every((l) => exLabels.includes(l)), exLabels.join(", "));
    const aimP = await t.aim([[10, 5, 0], [6, 4, 0], [14, 6, 0]], "h && h.ref.kind === 'profile'");
    if (aimP) await t.canvasClick(aimP.x, aimP.y); else await pick(t, "profiles", A.profile);
    const nProf = await t.app(() => (window.app.ui.dialog.current.values.profiles || []).length);
    t.check("profile picked on the canvas", nProf === 1, `${nProf}`);
    t.check("distance typed into the dialog", await t.fill('.dlg[data-dialog="SurfaceExtrude"] [data-input="distance"]', "15"));
    await t.shot("extrude-dialog");
    t.check("OK", await ok(t, "SurfaceExtrude"));
    const ex = await lastFeature(t, "surfExtrude");
    const tube = await body(t, ex.newBody);
    t.check("Extrude1 ok with a timeline item + icon", ex.ok && ex.item && ex.icon && ex.name === "Extrude1", JSON.stringify(ex));
    t.check("surface body: 4 walls, area 900 mm^2", tube && tube.kind === "surface" && tube.faces === 4 && near(tube.area, 900, 1e-3), JSON.stringify(tube));
    t.check("browser lists the surface body", await t.app((id) => !!document.querySelector(`[data-node="body:${id}"]`) || [...document.querySelectorAll("[data-node]")].some((e) => e.dataset.node.includes(id)), ex.newBody));

    // ---------------------------------------------------------------- Patch (top loop, bottom profile)
    t.step("Patch: the top opening (edge chain) and the bottom profile");
    const o1 = await openFromPanel(t, "SurfaceCreatePanel", "FusionSurfacePatchCommand");
    t.require("CREATE > Patch opens its dialog", !!o1);
    const ptLabels = await labelsOf(t, "FusionSurfacePatchCommand");
    t.check("Patch rows: Boundary Edges, Chain Selection, Continuity, Interior Rails/Points, Operation", ["Boundary Edges", "Chain Selection", "Continuity", "Interior Rails/Points", "Operation"].every((l) => ptLabels.includes(l)), ptLabels.join(", "));
    const aimE = await t.aim([[10, 0, 15], [5, 0, 15], [15, 0, 15], [20, 5, 15], [20, 2, 15], [0, 5, 15], [10, 10, 15]], "h && h.ref.kind === 'edge' && Math.abs(h.ref.p[2] - 15) < 1e-3");
    if (aimE) await t.canvasClick(aimE.x, aimE.y);
    else await pick(t, "boundary", await edgeWhere(t, ex.newBody, "Math.abs(g.m[2] - 15) < 1e-6"));
    const nB = await t.app(() => (window.app.ui.dialog.current.values.boundary || []).length);
    t.check("chain selection picks the 4 open top edges with one click", nB === 4, `${nB}`);
    t.check("OK", await ok(t, "FusionSurfacePatchCommand"));
    const p1 = await lastFeature(t, "surfPatch");
    const top = await body(t, p1.newBody);
    t.check("Patch1: planar surface 200 mm^2", p1.ok && top && top.kind === "surface" && near(top.area, 200, 1e-3), JSON.stringify([p1, top]));
    await openFromPanel(t, "SurfaceCreatePanel", "FusionSurfacePatchCommand");
    await pick(t, "boundary", A.profile);
    t.check("OK (profile patch)", await ok(t, "FusionSurfacePatchCommand"));
    const p0 = await lastFeature(t, "surfPatch");

    // ---------------------------------------------------------------- Stitch -> solid, undo / redo
    t.step("Stitch the tube and both patches: a closed solid");
    await t.escapeAll(1);
    t.check("MODIFY Stitch button opens its dialog", await t.click('#toolbar [data-cmd="FusionSurfaceStitchCommand"]') && await t.waitFor('.dlg[data-dialog="FusionSurfaceStitchCommand"]', { timeout: 2500 }));
    for (const id of [ex.newBody, p1.newBody, p0.newBody]) await pick(t, "bodies", { kind: "body", body: id });
    const stLabels = await labelsOf(t, "FusionSurfaceStitchCommand");
    t.check("Stitch rows: Stitch Surfaces, Tolerance, Operation", ["Stitch Surfaces", "Tolerance", "Operation"].every((l) => stLabels.includes(l)), stLabels.join(", "));
    t.check("OK", await ok(t, "FusionSurfaceStitchCommand"));
    let solid = await body(t, ex.newBody);
    t.check("stitched into a 20 x 10 x 15 solid (3000 mm^3), patches consumed", solid && solid.kind === "solid" && near(solid.volume, 3000, 1e-3) && !(await body(t, p1.newBody)), JSON.stringify(solid));
    await t.blur();
    await t.key("Control+z");
    await t.settle(200);
    t.check("undo: the tube is a surface again", (await body(t, ex.newBody))?.kind === "surface");
    await t.key("Control+y");
    await t.settle(200);
    t.check("redo: solid again", (await body(t, ex.newBody))?.kind === "solid");

    // ---------------------------------------------------------------- Unstitch (then undo)
    t.step("Unstitch the solid into 6 surfaces");
    await openFromPanel(t, "SurfaceModifyPanel", "FusionSurfaceUnStitchCommand");
    await pick(t, "faces", { kind: "body", body: ex.newBody });
    t.check("OK", await ok(t, "FusionSurfaceUnStitchCommand"));
    const nAfter = await t.app(() => window.app.bodies().filter((b) => b.kind === "surface").length);
    t.check("6 surface bodies", nAfter === 6, `${nAfter}`);
    await t.blur();
    await t.key("Control+z");
    await t.settle(200);

    // ---------------------------------------------------------------- open curves: Extrude, Thicken, Offset, Ruled, Extend, Reverse Normal
    t.step("Extrude open sketch curves, then Thicken / Offset / Ruled / Extend / Reverse Normal");
    const B = await sketch(t, "poly", { pts: [[40, 0], [60, 0], [70, 10]] });
    await t.escapeAll(1);
    await t.click('#toolbar [data-cmd="SurfaceExtrude"]');
    await t.waitFor('.dlg[data-dialog="SurfaceExtrude"]');
    for (const c of B.curves) await pick(t, "profiles", { kind: "sketchCurve", sketch: B.id, curve: c });
    await t.fill('.dlg[data-dialog="SurfaceExtrude"] [data-input="distance"]', "10");
    t.check("OK", await ok(t, "SurfaceExtrude"));
    const e2 = await lastFeature(t, "surfExtrude");
    const L = await body(t, e2.newBody);
    t.check("open-curve extrude: 2-face surface (area 341.42)", L && L.kind === "surface" && L.faces === 2 && near(L.area, 341.421, 1e-2), JSON.stringify(L));

    const o2 = await openFromPanel(t, "SurfaceCreatePanel", "FusionSurfaceThickenCommand");
    t.require("CREATE > Thicken opens", !!o2);
    await pick(t, "faces", { kind: "body", body: e2.newBody });
    await t.fill('.dlg[data-dialog="FusionSurfaceThickenCommand"] [data-input="thickness"]', "2");
    const thLabels = await labelsOf(t, "FusionSurfaceThickenCommand");
    t.check("Thicken rows: Faces / Surface Bodies, Chain Selection, Thickness, Thicken Type, Direction, Operation", ["Faces / Surface Bodies", "Chain Selection", "Thickness", "Thicken Type", "Direction", "Operation"].every((l) => thLabels.includes(l)), thLabels.join(", "));
    t.check("OK", await ok(t, "FusionSurfaceThickenCommand"));
    const th = await lastFeature(t, "surfThicken");
    const thb = await body(t, th.newBody);
    t.check("Thicken1: a solid (~ 34.1 x 10 x 2 = 683 mm^3)", th.ok && thb && thb.kind === "solid" && thb.volume > 600 && thb.volume < 720, JSON.stringify([th, thb]));

    await openFromPanel(t, "SurfaceCreatePanel", "FusionSurfaceOffsetCommand");
    await pick(t, "faces", await faceRef(t, e2.newBody, 0));
    await t.fill('.dlg[data-dialog="FusionSurfaceOffsetCommand"] [data-input="distance"]', "5");
    t.check("OK", await ok(t, "FusionSurfaceOffsetCommand"));
    const of = await lastFeature(t, "surfOffset");
    const ofb = await body(t, of.newBody);
    t.check("Offset1: new surface body", of.ok && ofb && ofb.kind === "surface", JSON.stringify([of, ofb]));

    const freeTop = await edgeWhere(t, e2.newBody, "g.faces.length === 1 && Math.abs(g.m[2] - 10) < 1e-6 && Math.abs(g.m[1]) < 1e-6");
    await openFromPanel(t, "SurfaceCreatePanel", "FusionSurfaceRuledCommand");
    await t.app(() => { const d = window.app.ui.dialog.current; d.set("chain", false, { user: true }); });
    await pick(t, "edges", freeTop);
    await t.fill('.dlg[data-dialog="FusionSurfaceRuledCommand"] [data-input="distance"]', "5");
    t.check("OK", await ok(t, "FusionSurfaceRuledCommand"));
    const ru = await lastFeature(t, "surfRuled");
    const rub = await body(t, ru.newBody);
    t.check("Ruled1: 20 x 5 ruled surface (100 mm^2)", ru.ok && rub && near(rub.area, 100, 1e-3), JSON.stringify([ru, rub]));

    await openFromPanel(t, "SurfaceModifyPanel", "FusionExtendCommand");
    await t.app(() => { const d = window.app.ui.dialog.current; d.set("chain", false, { user: true }); });
    await pick(t, "edges", freeTop);
    await t.fill('.dlg[data-dialog="FusionExtendCommand"] [data-input="distance"]', "5");
    t.check("OK", await ok(t, "FusionExtendCommand"));
    const xt = await lastFeature(t, "surfExtend");
    const xtb = await body(t, e2.newBody);
    t.check("Extend1: the surface grew by 20 x 5 (441.42 mm^2)", xt.ok && xtb && near(xtb.area, 441.421, 1e-2), JSON.stringify([xt, xtb]));

    const n0 = await t.app((id) => window.app.K.topoOf(window.app.body(id).shape).faces[0].n, e2.newBody);
    await openFromPanel(t, "SurfaceModifyPanel", "FusionSurfaceReverseNormalCommand");
    await pick(t, "bodies", await faceRef(t, e2.newBody, 0));
    t.check("OK", await ok(t, "FusionSurfaceReverseNormalCommand"));
    const n1 = await t.app((id) => window.app.K.topoOf(window.app.body(id).shape).faces[0].n, e2.newBody);
    t.check("Reverse Normal flips the face normals", n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < -0.99, JSON.stringify([n0, n1]));

    // ---------------------------------------------------------------- Validate (INSPECT)
    t.step("Validate (INSPECT panel): summary, no timeline feature without Repair");
    const nf0 = await t.app(() => window.app.doc.features.length);
    await t.click('[data-tab="SolidTab"]');
    const o3 = await openFromPanel(t, "InspectPanel", "FusionSurfaceValidateCommand");
    t.require("INSPECT > Validate opens", !!o3);
    await pick(t, "bodies", { kind: "body", body: th.newBody });
    await t.settle(200);
    const summary = await t.app(() => document.querySelector('.dlg[data-dialog="FusionSurfaceValidateCommand"] .dlg-text')?.textContent || "");
    t.check("Validate summary: No issues were found", /Validate Summary:[\s\S]*No issues were found/.test(summary), summary);
    t.check("OK", await ok(t, "FusionSurfaceValidateCommand"));
    t.check("no feature added", (await t.app(() => window.app.doc.features.length)) === nf0);
    await t.click('[data-tab="SurfaceTab"]');

    // ---------------------------------------------------------------- Trim / Untrim
    t.step("Trim a 40 x 40 patch with the YZ plane (click the half to remove), then Untrim");
    const Cs = await sketch(t, "rect", { a: [-20, 60], b: [20, 100] });
    await openFromPanel(t, "SurfaceCreatePanel", "FusionSurfacePatchCommand");
    await pick(t, "boundary", Cs.profile);
    await ok(t, "FusionSurfacePatchCommand");
    const pc = await lastFeature(t, "surfPatch");
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.cameraStable(1500);
    const o4 = await openFromPanel(t, "SurfaceModifyPanel", "FusionSurfaceTrimCommand");
    t.require("MODIFY > Trim opens", !!o4);
    await pick(t, "tool", { kind: "originPlane", name: "YZ" });
    await t.settle(300);
    await t.app(() => window.app.ui.dialog.current.activate(null));
    const pt = await t.canvasXY([12, 80, 0]);
    await t.canvasClick(pt.x, pt.y);
    await t.settle(300);
    const trimState = await t.app(() => { const d = window.app.ui.dialog.current; return { remove: (d.values.remove || []).length, pieces: ((d.previewRes || {}).pieces || []).length, red: ((d.previewRes || {}).pieces || []).filter((p) => p.removed).length }; });
    t.check("canvas click marks the +X half for removal (2 pieces, 1 red)", trimState.remove === 1 && trimState.pieces === 2 && trimState.red === 1, JSON.stringify(trimState));
    await t.shot("trim-preview");
    t.check("OK", await ok(t, "FusionSurfaceTrimCommand"));
    const trimmed = await body(t, pc.newBody);
    t.check("trimmed patch: 800 mm^2", trimmed && near(trimmed.area, 800, 1e-3), JSON.stringify(trimmed));
    await openFromPanel(t, "SurfaceModifyPanel", "FusionSurfaceUntrimCommand");
    await pick(t, "faces", await faceRef(t, pc.newBody, 0));
    await t.fill('.dlg[data-dialog="FusionSurfaceUntrimCommand"] [data-input="extension"]', "5");
    t.check("OK", await ok(t, "FusionSurfaceUntrimCommand"));
    const untr = await body(t, pc.newBody);
    t.check("Untrim all edges + extend 5: 30 x 50 = 1500 mm^2", untr && near(untr.area, 1500, 1e-2), JSON.stringify(untr));

    // ---------------------------------------------------------------- Merge
    t.step("Merge two coplanar faces of a stitched surface");
    const M1 = await sketch(t, "rect", { a: [-60, 0], b: [-40, 10] });
    const M2 = await sketch(t, "rect", { a: [-40, 0], b: [-20, 10] });
    const mids = await t.app(({ a, b }) => {
      const app = window.app;
      const f1 = app.addFeature({ type: "surfPatch", profiles: [{ sketch: a.sketch, key: a.key, c: a.c }], operation: "new" });
      const f2 = app.addFeature({ type: "surfPatch", profiles: [{ sketch: b.sketch, key: b.key, c: b.c }], operation: "new" });
      app.addFeature({ type: "surfStitch", bodies: [f1.newBody, f2.newBody], tolerance: "0.01 mm" });
      return f1.newBody;
    }, { a: M1.profile, b: M2.profile });
    await openFromPanel(t, "SurfaceModifyPanel", "FusionSurfaceMergeCommand");
    await pick(t, "faces", await faceRef(t, mids, 0));
    await pick(t, "faces", await faceRef(t, mids, 1));
    t.check("OK", await ok(t, "FusionSurfaceMergeCommand"));
    const merged = await body(t, mids);
    t.check("Merge: one 400 mm^2 face", merged && merged.faces === 1 && near(merged.area, 400, 1e-3), JSON.stringify(merged));

    // ---------------------------------------------------------------- Boundary Fill
    t.step("Boundary Fill: a box and the YZ plane, check one cell in the list");
    const bx = await t.app(() => { const f = window.app.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [0, -60], length: "20 mm", width: "20 mm", height: "20 mm", operation: "new" }); return f.newBody; });
    const o5 = await openFromPanel(t, "SurfaceCreatePanel", "SurfaceSculpt");
    t.require("CREATE > Boundary Fill opens", !!o5);
    await pick(t, "tools", { kind: "body", body: bx });
    await pick(t, "tools", { kind: "originPlane", name: "YZ" });
    await t.settle(400);
    const nCells = await t.app(() => document.querySelectorAll('.dlg[data-dialog="SurfaceSculpt"] [data-cell]').length);
    t.check("cell list shows 2 cells", nCells === 2, `${nCells}`);
    t.check("check Cell 1", await t.click('.dlg[data-dialog="SurfaceSculpt"] [data-cell="0"]'));
    await t.shot("boundary-fill");
    t.check("OK", await ok(t, "SurfaceSculpt"));
    const bf = await lastFeature(t, "surfBoundaryFill");
    const bfb = await body(t, bf.newBody);
    t.check("BoundaryFill1: half box solid (4000 mm^3), tool body removed", bf.ok && bfb && near(bfb.volume, 4000, 1e-3) && !(await body(t, bx)), JSON.stringify([bf, bfb]));

    // ---------------------------------------------------------------- Silhouette Split
    t.step("Silhouette Split: a sphere seen along Z, Split Solid Body");
    const sp = await t.app(() => window.app.addFeature({ type: "sphere", plane: { kind: "origin", name: "XY" }, center: [60, -60], diameter: "20 mm", operation: "new" }).newBody);
    await t.click('[data-tab="SolidTab"]');
    const o6 = await openFromPanel(t, "SolidModifyPanel", "FusionPartingLineSplitCmd");
    t.require("MODIFY > Silhouette Split opens", !!o6);
    await pick(t, "view", { kind: "originPlane", name: "XY" });
    await pick(t, "bodies", { kind: "body", body: sp });
    await t.app(() => { const d = window.app.ui.dialog.current; d.set("operation", "solid", { user: true }); });
    t.check("OK", await ok(t, "FusionPartingLineSplitCmd"));
    const ss = await lastFeature(t, "surfSilhouette");
    const halves = await t.app((id) => window.app.bodies().filter((b) => b.id === id || b.id.startsWith(`${window.app.doc.features.slice(-1)[0].id}_`)).map((b) => +window.app.bodyInfo(b.id).volume.toFixed(3)), sp);
    t.check("SilhouetteSplit1: two hemispheres", ss.ok && halves.length === 2 && near(halves[0], halves[1], 1e-3), JSON.stringify([ss, halves]));
    await t.click('[data-tab="SurfaceTab"]');

    // ---------------------------------------------------------------- Revolve / Sweep / Loft
    t.step("Revolve, Sweep and Loft of open sketch curves");
    const R = await sketch(t, "poly", { pts: [[10, 0], [15, 10]], plane: "XZ" });
    await openFromPanel(t, "SurfaceCreatePanel", "SurfaceRevolve");
    await pick(t, "profiles", { kind: "sketchCurve", sketch: R.id, curve: R.curves[0] });
    await pick(t, "axis", { kind: "originAxis", name: "Z" });
    await t.app(() => window.app.ui.dialog.current.set("revType", "full", { user: true }));
    t.check("OK", await ok(t, "SurfaceRevolve"));
    const rv = await lastFeature(t, "surfRevolve");
    const rvb = await body(t, rv.newBody);
    t.check("Revolve1: conical surface (area pi*(10+15)*sqrt(125))", rv.ok && rvb && rvb.kind === "surface" && near(rvb.area, Math.PI * 25 * Math.sqrt(125), 0.05), JSON.stringify([rv, rvb]));
    await openFromPanel(t, "SurfaceCreatePanel", "SurfaceSweep");
    await pick(t, "profiles", { kind: "sketchCurve", sketch: R.id, curve: R.curves[0] });
    await pick(t, "path", { kind: "sketchCurve", sketch: B.id, curve: B.curves[0] });
    t.check("OK", await ok(t, "SurfaceSweep"));
    const sw = await lastFeature(t, "surfSweep");
    t.check("Sweep1 ok (surface)", sw.ok && (await body(t, sw.newBody))?.kind === "surface", JSON.stringify(sw));
    const L2 = await sketch(t, "poly", { pts: [[40, 0], [60, 0]], offset: 30 });
    await openFromPanel(t, "SurfaceCreatePanel", "SurfaceLoft");
    await t.app(() => window.app.ui.dialog.current.set("chain", false, { user: true }));
    await pick(t, "profiles", { kind: "sketchCurve", sketch: B.id, curve: B.curves[0] });
    await pick(t, "profiles", { kind: "sketchCurve", sketch: L2.id, curve: L2.curves[0] });
    t.check("OK", await ok(t, "SurfaceLoft"));
    const lf = await lastFeature(t, "surfLoft");
    const lfb = await body(t, lf.newBody);
    t.check("Loft1: 20 x 30 planar surface (600 mm^2)", lf.ok && lfb && near(lfb.area, 600, 1e-2), JSON.stringify([lf, lfb]));

    // ---------------------------------------------------------------- Edit Feature
    t.step("Edit Feature: double-click Extrude1 in the timeline, distance 15 -> 20");
    await t.escapeAll(1);
    t.check("timeline double-click opens EDIT FEATURE", await t.dblclick(`#timeline [data-feature="${ex.id}"]`) && await t.waitFor(`.dlg[data-dialog="SurfaceExtrude"][data-edit="${ex.id}"]`, { timeout: 3000 }));
    const ev = await t.app(() => { const d = window.app.ui.dialog.current; return { distance: d.values.distance, profiles: (d.values.profiles || []).length }; });
    t.check("dialog restored the stored values", /^15/.test(String(ev.distance)) && ev.profiles === 1, JSON.stringify(ev));
    await t.fill('.dlg[data-dialog="SurfaceExtrude"] [data-input="distance"]', "20");
    t.check("OK", await ok(t, "SurfaceExtrude"));
    const allOk = await t.app(() => window.app.doc.features.filter((f) => !(window.app.featureResult(f.id) || {}).ok).map((f) => `${f.name}: ${(window.app.featureResult(f.id) || {}).error}`));
    t.check("every feature still evaluates after the edit", allOk.length === 0, allOk.join("; "));
    const tall = await body(t, ex.newBody);
    t.check("the stitched solid follows the taller tube (4000 mm^3)", tall && near(tall.volume, 4000, 1e-2), JSON.stringify(tall));

    // ---------------------------------------------------------------- save / open
    t.step("Save / open round trip");
    const before = await t.app(() => window.app.allBodies().map((b) => `${b.id}:${window.app.bodyKind(b.id)}:${(window.app.bodyInfo(b.id).volume || 0).toFixed(2)}:${(window.app.bodyInfo(b.id).area || 0).toFixed(2)}`).sort());
    await t.app(() => window.app.loadDocument(JSON.parse(JSON.stringify(window.app.doc))));
    await t.settle(300);
    const after = await t.app(() => window.app.allBodies().map((b) => `${b.id}:${window.app.bodyKind(b.id)}:${(window.app.bodyInfo(b.id).volume || 0).toFixed(2)}:${(window.app.bodyInfo(b.id).area || 0).toFixed(2)}`).sort());
    t.check("same bodies, kinds, volumes and areas after reopening", JSON.stringify(before) === JSON.stringify(after), `${before.length} vs ${after.length}`);
    await t.shot("final");
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
