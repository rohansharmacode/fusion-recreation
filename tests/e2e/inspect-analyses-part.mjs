// Part of the "inspect" QA scenario (imported by scenarios/inspect.mjs; kept outside scenarios/ because run-all
// loads every .mjs there as a scenario).
// Drives the 8 INSPECT surface analyses and Manage Materials through the real UI: INSPECT / MODIFY dropdowns,
// canvas picks, dialog inputs, the browser Analysis folder (Edit / Delete / eye), undo / redo, a model change
// and a save -> new -> open roundtrip.
import { near } from "./lib.mjs";

/** Open a command from a SOLID toolbar dropdown (falls back to app.commands.run). */
export async function openFromPanel(t, panel, id) {
  await t.escapeAll(2);
  let ok = false;
  if (await t.click(`#toolbar [data-panel="${panel}"]`, { timeout: 1500 })) {
    await t.waitFor(`#overlay [data-cmd="${id}"]`, { timeout: 1500 });
    ok = await t.click(`#overlay [data-cmd="${id}"]`, { timeout: 1000 });
  }
  const sel = id === "MaterialCommand" ? '.insp-mb[data-window="MaterialCommand"]' : `.dlg[data-dialog="${id}"]`;
  if (!(await t.waitFor(sel, { timeout: 2500 }))) {
    await t.escapeAll(1);
    await t.app((id) => window.app.commands.run(id), id);
    ok = false;
    if (!(await t.waitFor(sel, { timeout: 2500 }))) return null;
    t.note(`${id}: opened through app.commands.run`);
  }
  return { fromToolbar: ok };
}

const labels = (t, id) => t.app((id) => [...document.querySelectorAll(`.dlg[data-dialog="${id}"] .dlg-row`)].filter((r) => r.offsetParent).map((r) => (r.querySelector(".dlg-label")?.textContent || "").trim()).filter(Boolean), id);
const values = (t) => t.app(() => { const d = window.app.ui.dialog.current; return d ? JSON.parse(JSON.stringify(d.values)) : null; });
const overlays = (t) => t.app(() => window.app.ui.inspect.analysisObjects());
const analyses = (t) => t.app(() => window.app.ui.inspect.analyses());
const isGreen = (c) => c[1] > c[0] + 35 && c[1] > c[2] + 25;
const isRed = (c) => c[0] > c[1] + 50 && c[0] > c[2] + 40;
const isBlue = (c) => c[2] > c[0] + 40 && c[2] > c[1] + 20;
const isGrey = (c) => Math.abs(c[0] - c[1]) < 14 && Math.abs(c[1] - c[2]) < 14;

/** Click a body on the canvas while a dialog's body row is active (aim at a few points on it). */
async function pickBody(t, pts, body) {
  const a = await t.aim(pts, `h && (h.ref.kind === 'body' || h.ref.kind === 'face') && h.ref.body === ${JSON.stringify(body)}`);
  if (!a) return false;
  await t.canvasClick(a.x, a.y);
  await t.settle(250);
  return true;
}
async function okDialog(t, id) {
  await t.click(`.dlg[data-dialog="${id}"] [data-action=ok]`);
  await t.settle(300);
  return !(await t.visible(`.dlg[data-dialog="${id}"]`));
}
/** Pick the XY origin plane in the browser's Origin folder (goes to the dialog's active selection row). */
async function pickXYInBrowser(t) {
  const row = '#browser-host [data-node="originPlane:XY"]';
  if (!(await t.visible(row))) await t.click('#browser-host [data-node="origin:root"] .br-twisty', { timeout: 1500 });
  await t.settle(150);
  const ok = await t.click(row, { timeout: 1500 });
  await t.settle(400);
  return ok;
}
async function pickOption(t, input, option) {
  await t.click(`.dlg [data-input="${input}"]`);
  await t.settle(120);
  const ok = await t.click(`.dlg-dd-menu [data-option="${option}"]`, { timeout: 1500 });
  await t.settle(250);
  return ok;
}

export async function analysesPart(t) {
  t.step("analyses setup: new design, 40 x 20 x 10 box with a 8 mm through hole and R3 vertical fillets, and a 16 mm sphere");
  const setup = await t.app(() => {
    const app = window.app;
    app.newDocument();
    const f = app.addFeature({ type: "box", length: "40 mm", width: "20 mm", height: "10 mm", center: [0, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
    const body = f.newBody;
    app.addFeature({ type: "cylinder", diameter: "8 mm", height: "10 mm", center: [0, 0], operation: "cut", plane: { kind: "origin", name: "XY" } });
    const sh = app.body(body).shape;
    const vert = sh.edges.filter((e) => { try { return e.geomType === "LINE" && Math.abs(e.endPoint.z - e.startPoint.z) > 1; } catch { return false; } });
    const fl = app.addFeature({ type: "fillet", edges: vert.map((e) => ({ body, p: e.pointAt(0.5).toTuple() })), radius: "3 mm", tangentChain: true });
    const sp = app.addFeature({ type: "sphere", diameter: "16 mm", center: [40, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
    app.viewport.setView("home", { animate: false });
    app.viewport.fit({ animate: false });
    return { box: f.id, body, sphere: sp.newBody, ok: app.doc.features.every((x) => (app.featureResult(x.id) || {}).ok), fillet: fl.id };
  });
  t.require("box, hole, fillets and sphere computed", setup.ok && setup.body && setup.sphere, JSON.stringify(setup));
  await t.cameraStable(2000);
  const boxTop = [[-14, -6, 10], [-12, 5, 10], [12, -6, 10], [10, 5, 10]];
  const sphPts = [[40, -3, 6], [37, -4, 5], [42, -5, 4], [40, 0, 8]];

  // ------------------------------------------------------------- zebra
  t.step("Zebra Analysis from the INSPECT dropdown: click the box, Repeats 30, OK");
  let o = await openFromPanel(t, "InspectPanel", "FusionZebraAnalysisCommand");
  t.require("ZEBRA ANALYSIS dialog opens", !!o);
  t.check("Zebra Analysis is in the INSPECT dropdown", o.fromToolbar);
  let L = await labels(t, "FusionZebraAnalysisCommand");
  t.check("Zebra rows: Bodies, Direction, Repeats, Opacity, Lock Stripes, High Quality", L.join("|") === "Bodies|Direction|Repeats|Opacity|Lock Stripes|High Quality", L.join("|"));
  let v = await values(t);
  t.check("Zebra defaults: Vertical, Repeats 20, Opacity 100, Lock off, High Quality off", v.direction === "vertical" && v.repeats === "20" && v.opacity === "100" && !v.locked && !v.highQuality, JSON.stringify(v));
  t.check("Zebra: the Bodies prompt is shown", /Select bodies to analyze/.test(await t.app(() => document.querySelector(".dlg-prompt, .dlg-cursor-prompt")?.textContent || window.app.ui.dialog.current.spec.prompt(window.app.ui.dialog.current))), "");
  t.require("clicked the box on the canvas", await pickBody(t, boxTop, setup.body));
  v = await values(t);
  t.check("Bodies: 1 selected", (v.bodies || []).length === 1 && v.bodies[0].body === setup.body, JSON.stringify(v.bodies));
  await t.fill('.dlg [data-input="repeats"]', "30");
  await t.settle(250);
  let ov = await overlays(t);
  t.check("live preview: zebra stripes drawn on the box", ov.some((x) => x.mesh && x.userData.analysis), JSON.stringify(ov));
  let top = await t.canvasXY([-12, -5, 10]);
  let c = await t.colorAt(top.x, top.y, 2);
  t.check("zebra colours the face black / white (no body grey)", isGrey(c) && (c[0] < 70 || c[0] > 200), JSON.stringify(c));
  await t.shot("zebra");
  t.check("OK closes Zebra Analysis", await okDialog(t, "FusionZebraAnalysisCommand"));
  let an = await analyses(t);
  const zebra = an.find((a) => a.type === "zebra");
  t.check("Zebra1 in the Analysis folder (Repeats 30 stored)", zebra && zebra.name === "Zebra1" && (await t.app((id) => window.app.ui.inspect.analysis(id).repeats, zebra.id)) === 30, JSON.stringify(an));
  t.check("zebra stays on the canvas after OK", (await overlays(t)).some((x) => x.mesh));
  await t.app((id) => window.app.ui.inspect.setAnalysisVisible(id, false), zebra && zebra.id);

  // ------------------------------------------------------------- draft
  t.step("Draft Analysis: box, pull direction = top face, Draft Angle +5 deg");
  o = await openFromPanel(t, "InspectPanel", "FusionDraftAnalysisCommand");
  t.require("DRAFT ANALYSIS dialog opens", !!o);
  L = await labels(t, "FusionDraftAnalysisCommand");
  t.check("Draft rows: Body, Direction, Draft Angle, Tolerance Zone, Tolerance, Opacity, High Quality", L.join("|") === "Body|Direction|Draft Angle|Tolerance Zone|Tolerance|Opacity|High Quality", L.join("|"));
  v = await values(t);
  t.check("Draft defaults: -2.0 / 2.0 deg, tolerance on, -0.5 / 0.5 deg", v.angleNeg === "-2.0 deg" && v.anglePos === "2.0 deg" && v.toleranceZone === true && v.tolNeg === "-0.5 deg" && v.tolPos === "0.5 deg", JSON.stringify(v));
  t.require("clicked the box", await pickBody(t, boxTop, setup.body));
  await t.click('.dlg [data-input="direction"]');
  await t.settle(120);
  const fa = await t.aim(boxTop, `h && h.ref.kind === 'face' && Math.abs(h.ref.n[2] - 1) < 1e-3`);
  t.require("top face pickable as the pull direction", !!fa);
  await t.canvasClick(fa.x, fa.y);
  await t.settle(400);
  v = await values(t);
  t.check("Direction: 1 selected (planar face)", (v.direction || []).length === 1 && v.direction[0].kind === "face", JSON.stringify(v.direction));
  // the picked face is drawn with the blue selection tint: switch the direction to the XY plane (browser Origin
  // folder, same pull direction) so the face shows the plain analysis colours
  t.check("Direction replaced by the XY plane from the browser", (await pickXYInBrowser(t)) && (await values(t)).direction.map((r) => r.kind).join() === "originPlane", JSON.stringify((await values(t)).direction));
  top = await t.canvasXY([-12, -5, 10]);
  const front = await t.canvasXY([-8, -10, 5]);
  c = await t.colorAt(top.x, top.y, 2);
  const cf = await t.colorAt(front.x, front.y, 2);
  t.check("top face (facing the pull direction) is green", isGreen(c), JSON.stringify(c));
  t.check("vertical wall (zero draft) is red", isRed(cf), JSON.stringify(cf));
  t.check("draft legend shown on the canvas", /Draft Angle/.test(await t.app(() => document.querySelector(".insp-legends")?.innerText || "")));
  await t.fill('.dlg [data-input="anglePos"]', "5 deg");
  await t.settle(300);
  t.check("legend follows the Draft Angle (>= 5.5 deg with the tolerance)", /5\.5 deg/.test(await t.app(() => document.querySelector(".insp-legends")?.innerText || "")));
  await t.shot("draft");
  t.check("OK closes Draft Analysis", await okDialog(t, "FusionDraftAnalysisCommand"));
  an = await analyses(t);
  const draft = an.find((a) => a.type === "draft");
  t.check("Draft1 in the Analysis folder", draft && draft.name === "Draft1", JSON.stringify(an));

  // ------------------------------------------------------------- browser: Analysis folder, Edit, eye
  t.step("browser Analysis folder: expand, right-click Draft1 > Edit Draft Analysis, change the angle, OK");
  const rowSel = `#browser-host [data-node="analysis:${draft && draft.id}"]`;
  if (!(await t.visible(rowSel))) await t.click('#browser-host [data-node="analysis:root"] .br-twisty', { timeout: 1500 });
  await t.settle(200);
  t.check("Draft1 row (with its own icon) in the browser", await t.visible(rowSel) && (await t.app((s) => !!document.querySelector(s + " .br-icon svg"), rowSel)));
  await t.click(rowSel, { button: "right" });
  await t.settle(200);
  const edited = await t.click('#overlay [data-action="edit-analysis"]', { timeout: 1500 });
  t.check("context menu has Edit Draft Analysis", edited);
  if (!edited) await t.app((id) => window.app.ui.inspect.editAnalysis(id), draft.id);
  t.require("Edit opens the Draft dialog with the stored values", await t.waitFor('.dlg[data-dialog="FusionDraftAnalysisCommand"]', { timeout: 2000 }));
  v = await values(t);
  t.check("edit dialog shows Draft Angle 5 deg and the pull direction", /^5/.test(v.anglePos) && (v.direction || []).length === 1, JSON.stringify({ a: v.anglePos, d: v.direction }));
  await t.fill('.dlg [data-input="anglePos"]', "3 deg");
  await t.settle(200);
  await okDialog(t, "FusionDraftAnalysisCommand");
  t.check("edited Draft1 stored (3 deg), still one draft analysis", (await t.app((id) => window.app.ui.inspect.analysis(id).anglePos, draft.id)) === "3 deg" && (await analyses(t)).filter((a) => a.type === "draft").length === 1);
  t.step("undo / redo the edit (Ctrl+Z / Ctrl+Y)");
  await t.blur();
  await t.mouseToCanvas(0.5, 0.92);
  await t.key("Control+z");
  await t.settle(300);
  t.check("undo restores 5 deg", /^5/.test(await t.app((id) => (window.app.ui.inspect.analysis(id) || {}).anglePos, draft.id)));
  await t.key("Control+y");
  await t.settle(300);
  t.check("redo re-applies 3 deg", (await t.app((id) => (window.app.ui.inspect.analysis(id) || {}).anglePos, draft.id)) === "3 deg");
  t.step("eye icon hides / shows Draft1");
  await t.click(`${rowSel} .br-eye`);
  await t.settle(250);
  t.check("eye hides Draft1 (no draft legend)", (await t.app((id) => window.app.ui.inspect.analyses().find((a) => a.id === id).visible, draft.id)) === false && !(await t.visible(".insp-legends")));

  // ------------------------------------------------------------- curvature map
  t.step("Curvature Map Analysis: sphere, exact curvature, Principal Maximum with Minimum Limit 10 mm");
  o = await openFromPanel(t, "InspectPanel", "FusionCurvatureMapAnalysisCommand");
  t.require("CURVATURE MAP ANALYSIS dialog opens", !!o);
  L = await labels(t, "FusionCurvatureMapAnalysisCommand");
  t.check("Curvature Map rows: Bodies, Type, Display, Scale, Opacity, High Quality", L.join("|") === "Bodies|Type|Display|Scale|Opacity|High Quality", L.join("|"));
  t.require("clicked the sphere", await pickBody(t, sphPts, setup.sphere));
  const curv = await t.app((b) => { const c = window.app.ui.inspect.curvature(b); let mn = Infinity, mx = -Infinity; for (const k of c.k1) { mn = Math.min(mn, k); mx = Math.max(mx, k); } return { mn, mx, K: c.K[0] }; }, setup.sphere);
  t.check("sphere curvature from the B-rep: k = 1/8 everywhere, K = 1/64", near(curv.mn, 0.125, 1e-4) && near(curv.mx, 0.125, 1e-4) && near(curv.K, 1 / 64, 1e-5), JSON.stringify(curv));
  const sph = await t.canvasXY([40, -4, 5]);
  c = await t.colorAt(sph.x, sph.y, 2);
  t.check("Gaussian map: the sphere (positive curvature) is warm (red / orange)", c[0] > c[2] + 60, JSON.stringify(c));
  t.check("Gaussian legend shown", /Gaussian/.test(await t.app(() => document.querySelector(".insp-legends")?.innerText || "")));
  t.check("Type -> Principal Maximum", await pickOption(t, "mapType", "principalMax"));
  L = await labels(t, "FusionCurvatureMapAnalysisCommand");
  t.check("Principal Maximum shows Minimum Limit (no Display / Scale)", L.includes("Minimum Limit") && !L.includes("Scale") && !L.includes("Display"), L.join("|"));
  await t.fill('.dlg [data-input="minLimit"]', "10 mm");
  await t.settle(300);
  c = await t.colorAt(sph.x, sph.y, 2);
  t.check("sphere R8 < Minimum Limit 10 mm: red", isRed(c), JSON.stringify(c));
  await t.fill('.dlg [data-input="minLimit"]', "5 mm");
  await t.settle(300);
  c = await t.colorAt(sph.x, sph.y, 2);
  t.check("sphere R8 >= Minimum Limit 5 mm: green", isGreen(c), JSON.stringify(c));
  await t.shot("curvature-map");
  await okDialog(t, "FusionCurvatureMapAnalysisCommand");
  an = await analyses(t);
  t.check("CurvatureMap1 added", an.some((a) => a.type === "curvatureMap" && a.name === "CurvatureMap1"), JSON.stringify(an));

  // ------------------------------------------------------------- minimum radius
  t.step("Minimum Radius Analysis: box, Optimal Minimum Radius = hole radius 4 mm, Minimum Radius 5 mm");
  await t.app(() => { for (const a of window.app.ui.inspect.analyses()) if (a.visible) window.app.ui.inspect.setAnalysisVisible(a.id, false); });
  o = await openFromPanel(t, "InspectPanel", "FusionMinimumRadiusAnalysisCommand");
  t.require("MINIMUM RADIUS ANALYSIS dialog opens", !!o);
  L = await labels(t, "FusionMinimumRadiusAnalysisCommand");
  t.check("Minimum Radius rows: Body, Maximum Tool Radius, Minimum Radius, Optimal Minimum Radius, Opacity, Sharp Edges", L.join("|") === "Body|Maximum Tool Radius|Minimum Radius|Optimal Minimum Radius|Opacity|Sharp Edges", L.join("|"));
  v = await values(t);
  t.check("defaults: Maximum Tool Radius 25.00 mm, Minimum Radius 0.00 mm", v.maxToolRadius === "25.00 mm" && v.minRadius === "0.00 mm", JSON.stringify(v));
  t.require("clicked the box", await pickBody(t, boxTop, setup.body));
  await t.settle(200);
  const opt = await t.app(() => document.querySelector('.dlg [data-row="optimal"] .dlg-text')?.textContent);
  t.check("Optimal Minimum Radius reads 4.00 mm (the hole; convex R3 fillets do not count)", opt === "4.00 mm", opt);
  await t.fill('.dlg [data-input="minRadius"]', "5 mm");
  await t.settle(300);
  t.check("minimum radius overlay drawn", (await overlays(t)).some((x) => x.mesh));
  await t.click('.dlg [data-input="sharpEdges"]');
  await t.settle(200);
  await t.shot("minimum-radius");
  await okDialog(t, "FusionMinimumRadiusAnalysisCommand");
  const mr = (await analyses(t)).find((a) => a.type === "minimumRadius");
  t.check("MinimumRadius1 stored with Minimum Radius 5 mm, Sharp Edges on", mr && (await t.app((id) => { const a = window.app.ui.inspect.analysis(id); return a.minRadius === "5 mm" && a.sharpEdges === true; }, mr.id)));

  // ------------------------------------------------------------- accessibility
  t.step("Accessibility Analysis: box from the top face direction, then Flip Direction");
  await t.app(() => { for (const a of window.app.ui.inspect.analyses()) if (a.visible) window.app.ui.inspect.setAnalysisVisible(a.id, false); });
  o = await openFromPanel(t, "InspectPanel", "FusionAccessibilityAnalysisCommand");
  t.require("ACCESSIBILITY ANALYSIS dialog opens", !!o);
  L = await labels(t, "FusionAccessibilityAnalysisCommand");
  t.check("Accessibility rows: Body, Direction, Change Direction, Opacity", L.join("|") === "Body|Direction|Change Direction|Opacity", L.join("|"));
  t.require("clicked the box", await pickBody(t, boxTop, setup.body));
  await t.click('.dlg [data-input="direction"]');
  const fa2 = await t.aim(boxTop, `h && h.ref.kind === 'face' && Math.abs(h.ref.n[2] - 1) < 1e-3`);
  if (fa2) { await t.canvasClick(fa2.x, fa2.y); await t.settle(400); }
  t.check("Direction: top face picked", (await values(t)).direction.map((r) => r.kind).join() === "face");
  await pickXYInBrowser(t);
  t.check("Direction: XY plane from the browser", (await values(t)).direction.map((r) => r.kind).join() === "originPlane");
  top = await t.canvasXY([-12, -5, 10]);
  c = await t.colorAt(top.x, top.y, 2);
  t.check("top face reachable from +Z: green", isGreen(c), JSON.stringify(c));
  t.check("Change Direction -> Flip Direction", await pickOption(t, "mode", "flip"));
  c = await t.colorAt(top.x, top.y, 2);
  t.check("flipped (tool from below): top face not reachable, red", isRed(c), JSON.stringify(c));
  await t.shot("accessibility");
  await okDialog(t, "FusionAccessibilityAnalysisCommand");
  t.check("Accessibility1 added", (await analyses(t)).some((a) => a.type === "accessibility" && a.name === "Accessibility1"));

  // ------------------------------------------------------------- isocurve
  t.step("Isocurve Analysis: sphere, 8 isocurves, curvature combs on");
  await t.app(() => { for (const a of window.app.ui.inspect.analyses()) if (a.visible) window.app.ui.inspect.setAnalysisVisible(a.id, false); });
  o = await openFromPanel(t, "InspectPanel", "FusionIsoCurveAnalysisCommand");
  t.require("ISOCURVE ANALYSIS dialog opens", !!o);
  L = await labels(t, "FusionIsoCurveAnalysisCommand");
  t.check("Isocurve rows: Bodies/Faces, Type, Isocurves, Curvature Combs", L.join("|") === "Bodies/Faces|Type|Isocurves|Curvature Combs", L.join("|"));
  v = await values(t);
  t.check("Isocurve defaults: U and V, 5 isocurves, combs off", v.uv === "both" && v.count === "5" && v.combs === false, JSON.stringify(v));
  t.require("clicked the sphere", await pickBody(t, sphPts, setup.sphere));
  await t.fill('.dlg [data-input="count"]', "8");
  await t.click('.dlg [data-input="combs"]');
  await t.settle(400);
  L = await labels(t, "FusionIsoCurveAnalysisCommand");
  t.check("Curvature Combs shows Density and Scale", L.includes("Density") && L.includes("Scale"), L.join("|"));
  ov = await overlays(t);
  t.check("U and V isocurves and their combs drawn", ov.some((x) => x.userData.iso === "u") && ov.some((x) => x.userData.iso === "v") && ov.some((x) => x.userData.comb), JSON.stringify(ov.map((x) => x.userData)));
  await t.shot("isocurve");
  await okDialog(t, "FusionIsoCurveAnalysisCommand");
  t.check("IsoCurve1 added", (await analyses(t)).some((a) => a.type === "isocurve" && a.name === "IsoCurve1"));

  // ------------------------------------------------------------- curvature comb
  t.step("Curvature Comb Analysis: the hole's top edge, Density 20");
  await t.app(() => { for (const a of window.app.ui.inspect.analyses()) if (a.visible) window.app.ui.inspect.setAnalysisVisible(a.id, false); });
  o = await openFromPanel(t, "InspectPanel", "FusionCurvatureCombAnalysisCommand");
  t.require("CURVATURE COMB ANALYSIS dialog opens", !!o);
  L = await labels(t, "FusionCurvatureCombAnalysisCommand");
  v = await values(t);
  t.check("Comb rows Edges, Density, Scale with defaults 50 / 10", L.join("|") === "Edges|Density|Scale" && v.density === "50" && v.scale === "10", L.join("|") + JSON.stringify(v));
  const ed = await t.aim([[2.83, -2.83, 10], [-2.83, -2.83, 10], [4, 0, 10], [0, -4, 10], [-4, 0, 10]], "h && h.ref.kind === 'edge'");
  t.require("hole rim edge pickable", !!ed);
  await t.canvasClick(ed.x, ed.y);
  await t.settle(300);
  await t.fill('.dlg [data-input="density"]', "20");
  await t.settle(300);
  ov = await overlays(t);
  t.check("comb teeth + envelope drawn", ov.some((x) => x.userData.comb) && ov.some((x) => x.userData.combEnvelope), JSON.stringify(ov.map((x) => x.userData)));
  await t.shot("curvature-comb");
  await okDialog(t, "FusionCurvatureCombAnalysisCommand");
  t.check("Curvature1 added (Fusion's default comb name)", (await analyses(t)).some((a) => a.type === "curvatureComb" && a.name === "Curvature1"));

  // ------------------------------------------------------------- environment map
  t.step("Environment Map Analysis: sphere, Dark Sky, Rotate 45 deg");
  await t.app(() => { for (const a of window.app.ui.inspect.analyses()) if (a.visible) window.app.ui.inspect.setAnalysisVisible(a.id, false); });
  o = await openFromPanel(t, "InspectPanel", "FusionEnvironmentMapAnalysisCommand");
  t.require("ENVIRONMENT MAP ANALYSIS dialog opens", !!o);
  L = await labels(t, "FusionEnvironmentMapAnalysisCommand");
  t.check("Environment Map rows: Bodies, Environment, Rotate, Apply Mirror, Opacity, High Quality", L.join("|") === "Bodies|Environment|Rotate|Apply Mirror|Opacity|High Quality", L.join("|"));
  t.require("clicked the sphere", await pickBody(t, sphPts, setup.sphere));
  const before = await t.colorAt(sph.x, sph.y, 3);
  t.check("Environment -> Dark Sky", await pickOption(t, "environment", "darkSky"));
  await t.fill('.dlg [data-input="rotate"]', "45 deg");
  await t.settle(400);
  const after = await t.colorAt(sph.x, sph.y, 3);
  t.check("the chrome sphere reflects the darker environment", after[0] + after[1] + after[2] < before[0] + before[1] + before[2] - 30, JSON.stringify({ before, after }));
  await t.shot("environment-map");
  await okDialog(t, "FusionEnvironmentMapAnalysisCommand");
  t.check("Environment Map1 added", (await analyses(t)).some((a) => a.type === "environmentMap" && a.name === "Environment Map1"));

  // ------------------------------------------------------------- model change, save / open, delete
  t.step("model change: the box becomes 60 mm long; visible analyses follow");
  const mrId = mr && mr.id;
  await t.app((id) => window.app.ui.inspect.setAnalysisVisible(id, true), mrId);
  await t.app((id) => { const app = window.app; app.updateFeature(id, { length: "60 mm" }, "Edit Box"); }, setup.box);
  await t.settle(400);
  const bb = await t.app((b) => window.app.K.bboxOf(window.app.body(b).shape), setup.body);
  t.check("box now 60 mm long", near(bb.max[0] - bb.min[0], 60, 1e-6), JSON.stringify(bb));
  t.check("minimum radius analysis re-drawn on the new body", (await overlays(t)).some((x) => x.mesh));
  t.check("Optimal Minimum Radius still 4 mm on the edited body", near(await t.app((b) => window.app.ui.inspect.optimalMinimumRadius([b]), setup.body), 4, 1e-6));

  t.step("save -> new design -> open: the Analysis folder comes back");
  const names = (await analyses(t)).map((a) => a.name).sort();
  const rt = await t.app(async () => {
    const app = window.app;
    const e = app.ui.files.saveAs("QA Analyses");
    app.newDocument();
    const empty = app.ui.inspect.analyses().length;
    const ok = await app.ui.files.openById(e.id);
    return { ok, empty, names: app.ui.inspect.analyses().map((a) => a.name).sort() };
  });
  t.check("reopened design has the same 8 analyses", rt.ok && rt.empty === 0 && rt.names.join() === names.join() && names.length === 8, JSON.stringify({ rt, names }));
  await t.settle(400);
  t.check("visible analysis drawn again after open", (await overlays(t)).some((x) => x.mesh));

  t.step("Delete from the browser context menu, then undo");
  await t.click('#browser-host [data-node="analysis:root"] .br-twisty', { timeout: 1500 });
  const target = (await analyses(t)).find((a) => a.type === "zebra");
  const zsel = `#browser-host [data-node="analysis:${target && target.id}"]`;
  await t.settle(150);
  if (!(await t.visible(zsel))) await t.click('#browser-host [data-node="analysis:root"] .br-twisty', { timeout: 1500 });
  await t.click(zsel, { button: "right" });
  await t.settle(150);
  t.check("context menu Delete", await t.click('#overlay [data-action="delete"]', { timeout: 1500 }));
  await t.settle(250);
  t.check("Zebra1 deleted", !(await analyses(t)).some((a) => a.type === "zebra"));
  await t.blur();
  await t.mouseToCanvas(0.5, 0.92);
  await t.key("Control+z");
  await t.settle(300);
  t.check("undo brings Zebra1 back", (await analyses(t)).some((a) => a.type === "zebra" && a.name === "Zebra1"));
  await t.escapeAll();
}

export async function materialsPart(t) {
  t.step("Manage Materials from the MODIFY dropdown: Material Browser");
  await t.app(() => {
    const app = window.app;
    app.newDocument();
    app.addFeature({ type: "box", length: "40 mm", width: "20 mm", height: "10 mm", center: [0, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
    try { app.ui.inspect.materialBrowser.store.reset(); } catch { /* ignore */ }
  });
  const o = await openFromPanel(t, "SolidModifyPanel", "MaterialCommand");
  t.require("MATERIAL BROWSER opens", !!o);
  t.check("Manage Materials is in the MODIFY dropdown", o.fromToolbar);
  const head = await t.app(() => { const w = document.querySelector(".insp-mb"); return { title: w.querySelector(".insp-mb-title").textContent, tabs: [...w.querySelectorAll("[data-mb-tab]")].map((b) => b.textContent), tree: w.querySelector("[data-mb-tree]").innerText }; });
  t.check("Physical / Appearance tabs, Favorites + Fusion Material Library", head.title === "MATERIAL BROWSER" && head.tabs.join() === "Physical,Appearance" && /Favorites/.test(head.tree) && /Fusion Material Library/.test(head.tree), JSON.stringify(head));
  await t.click('[data-mb-node="cat:fusion-materials:Metal"]');
  await t.click('[data-mb-item="aluminum-6061"]');
  await t.settle(150);
  const ro = await t.app(() => ({ name: document.querySelector("[data-mb-edname]")?.textContent, ro: !!document.querySelector(".insp-mb-ro") }));
  t.check("Aluminum 6061 selected: editor shows it read-only", ro.name === "Aluminum 6061" && ro.ro, JSON.stringify(ro));
  await t.click('[data-mb-item="aluminum-6061"]', { button: "right" });
  await t.click('[data-mb-menu="addTo:favorites"]');
  await t.settle(150);
  const fav = await t.app(() => window.app.ui.inspect.materialBrowser.store.items("physical", "favorites").map((m) => m.name));
  t.check("right-click > Add to Favorites copies it", fav.join() === "Aluminum 6061", JSON.stringify(fav));

  t.step("Library menu > Create New Library 'Shop Stock'; Create New Material; edit name + density; Apply");
  await t.click('[data-mb-action="library"]');
  await t.click('[data-mb-menu="createLibrary"]');
  await t.fill("[data-mb-prompt]", "Shop Stock", { commit: false });
  await t.click("[data-mb-pok]");
  await t.settle(150);
  const libs = await t.app(() => window.app.ui.inspect.materialBrowser.libraries().map((l) => l.name));
  t.check("library created", libs.includes("Shop Stock"), JSON.stringify(libs));
  await t.click('[data-mb-action="new"]');
  await t.click('[data-mb-menu="createMaterial"]');
  await t.settle(150);
  const newId = await t.app(() => window.app.ui.inspect.materialBrowser.window.sel.physical);
  t.check("new material created in Shop Stock", /^u:lib/.test(newId || ""), newId);
  await t.fill('[data-mb-field="name"]', "Tool Steel H13", { commit: false });
  await t.click('[data-mb-edtab="physical"]');
  await t.fill('[data-mb-field="density"]', "7.8", { commit: false });
  await t.click('[data-mb-action="apply"]');
  await t.settle(150);
  const item = await t.app((id) => window.app.ui.inspect.materialBrowser.store.find("physical", id).item, newId);
  t.check("Apply saved name and density", item.name === "Tool Steel H13" && item.density === 7.8, JSON.stringify(item));
  t.check("library kept in browser storage", await t.app(() => { try { return /Tool Steel H13/.test(localStorage.getItem("fusionrec.materialLibraries.v1") || ""); } catch { return false; } }));
  await t.shot("material-browser");

  t.step("Assign to Selection (the box) -> mass from the new density; Physical Material panel lists the library");
  await t.app(() => { const b = window.app.bodies()[0]; window.app.selection.set([{ kind: "body", body: b.id }]); });
  await t.click(`[data-mb-item="${newId}"]`, { button: "right" });
  t.check("context menu Assign to Selection", await t.click('[data-mb-menu="assign"]'));
  await t.settle(250);
  const mass = await t.app(() => window.app.ui.inspect.massProperties().mass);
  t.check("mass = 8000 mm^3 x 7.8 g/cm^3 = 62.4 g", near(mass, 62.4, 1e-6), String(mass));
  await t.click('[data-mb-action="ok"]');
  await t.settle(150);
  t.check("OK closes the Material Browser", !(await t.visible(".insp-mb")));
  await t.app(() => window.app.commands.run("PhysicalMaterialCommand"));
  await t.waitFor('.dlg[data-dialog="PhysicalMaterialCommand"]', { timeout: 2000 });
  const panel = await t.app(() => document.querySelector('.dlg[data-dialog="PhysicalMaterialCommand"]').innerText);
  t.check("Physical Material panel shows the design's custom material and the Shop Stock library", /Tool Steel H13/.test(panel) && /Shop Stock/.test(panel), panel.slice(0, 200));
  await t.escapeAll();

  t.step("save -> new -> open keeps the custom material in the design");
  const rt = await t.app(async () => {
    const app = window.app;
    const e = app.ui.files.saveAs("QA Materials");
    app.newDocument();
    const ok = await app.ui.files.openById(e.id);
    const b = app.bodies()[0];
    return { ok, mat: app.doc.bodies[b.id].material, custom: Object.keys(app.doc.customMaterials || {}), mass: app.ui.inspect.massProperties().mass };
  });
  t.check("custom material + mass survive the roundtrip", rt.ok && rt.mat === newId && rt.custom.includes(newId) && near(rt.mass, 62.4, 1e-6), JSON.stringify(rt));
  t.step("undo the assignment");
  await t.app(() => window.app.mutate("Physical Material: Steel", (doc) => { for (const m of Object.values(doc.bodies)) m.material = "steel"; }));
  t.check("mass back to steel (62.8 g)", near(await t.app(() => window.app.ui.inspect.massProperties().mass), 62.8, 1e-6));
  await t.app(() => { try { window.app.ui.inspect.materialBrowser.store.reset(); } catch { /* ignore */ } });
}
