// SHEET METAL through the real UI: Flange (base flange from a profile, edge flange from an edge, Edit
// Feature from the timeline), Hem, Sheet Metal Rules (edit the thickness, undo), Create Flat Pattern
// (FLAT PATTERN environment, Export Flat Pattern DXF, Finish), Unfold / Refold Faces, Fold on a sketch
// line, Sheet Metal Fillet, Rip, Corner Closure, Jog, Convert to Sheet Metal, Lofted Flange and Join by
// Bend (App API + results), undo / redo and a save / open round trip.
import { defineScenario, mainIfDirect, near } from "../lib.mjs";

const T = 2.5, R = 2.5, KF = 0.44;
const BA90 = (Math.PI / 2) * (R + KF * T);
const PLATE = 100 * 50 * T;
const EDGE20 = PLATE + (Math.PI / 4) * ((R + T) ** 2 - R ** 2) * 100 + 15 * T * 100; // 20 mm outer-datum flange on the 100 mm edge

async function openSheetMetalTab(t) {
  await t.click('[data-tab="SheetMetalTab"]');
  await t.settle(150);
}
/** Run a SHEET METAL command from its toolbar button, or from the panel dropdown when it is not on the bar. */
async function runCmd(t, id, panel) {
  await openSheetMetalTab(t);
  const onBar = await t.visible(`#toolbar .tb-btn[data-cmd="${id}"]`);
  if (onBar) { await t.click(`#toolbar .tb-btn[data-cmd="${id}"]`); return true; }
  await t.click(`[data-panel="${panel}"]`);
  await t.settle(150);
  const ok = await t.visible(`[data-cmd="${id}"]`);
  if (!ok) return false;
  await t.click(`[data-cmd="${id}"]`);
  return true;
}
/** Label of a SHEET METAL command as the toolbar shows it (panel dropdown item or bar button). */
async function cmdLabel(t, id, panel) {
  await openSheetMetalTab(t);
  await t.click(`[data-panel="${panel}"]`);
  await t.settle(150);
  const r = await t.app((id) => {
    const it = [...document.querySelectorAll(`[data-cmd="${id}"]`)].find((x) => x.offsetParent && !x.classList.contains("tb-btn"));
    const btn = document.querySelector(`#toolbar .tb-btn[data-cmd="${id}"]`);
    return { item: it ? (it.innerText || "").trim() : null, aria: btn ? btn.getAttribute("aria-label") : null, icon: btn ? btn.dataset.icon || null : null };
  }, id);
  await t.key("Escape");
  return r;
}
async function okDialog(t, id) {
  await t.settle(400);
  const enabled = await t.app((id) => { const b = document.querySelector(`.dlg[data-dialog="${id}"] [data-action="ok"]`); return !!b && !b.disabled; }, id);
  const msg = await t.app((id) => (document.querySelector(`.dlg[data-dialog="${id}"] .dlg-msg`)?.innerText || "").trim(), id);
  if (enabled) await t.click(`.dlg[data-dialog="${id}"] [data-action="ok"]`);
  await t.waitFor(() => !window.app.activeCommand, { timeout: 8000 });
  return { enabled, msg };
}
const fitHome = async (t) => {
  await t.setView("home");
  await t.app(() => window.app.viewport.fit && window.app.viewport.fit({ animate: false }));
  await t.cameraStable(2000);
};
const smInfo = (t, body) => t.app((id) => {
  const a = window.app;
  const st = a.result.state;
  const d = st.smData && st.smData.get(id);
  const b = st.bodies.get(id);
  return b ? { vol: a.K.volumeOf(b.shape), bbox: a.K.bboxOf(b.shape), bends: d ? Object.keys(d.bends).length : -1, flat: d ? Object.values(d.bends).filter((x) => x.flat).length : -1, T: d && d.T, meta: a.bodyMeta(id) } : null;
}, body);

const scenario = defineScenario({
  name: "sheetmetal",
  title: "SHEET METAL tab: flanges, rules, flat pattern + DXF, unfold / refold, fold, modify tools",
  timeout: 300000,
  async run(t) {
    t.step("setup: 100 x 50 rectangle sketch on XY (App API)");
    const sk = await t.app(() => {
      const a = window.app;
      a.newDocument("QA Sheet Metal");
      const sk = a.S.newSketch();
      a.S.addRect2pt(sk, [0, 0], [100, 50]);
      const f = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
      return { id: f.id };
    });
    await fitHome(t);

    t.step("SHEET METAL > Flange: pick the profile -> base flange (New Body, Steel (mm) rule)");
    t.require("Flange button runs", await runCmd(t, "FusionSheetMetalFlangeCommand", "SheetMetalCreatePanel"));
    t.require("Flange dialog open", await t.waitFor('.dlg[data-dialog="FusionSheetMetalFlangeCommand"]', { timeout: 3000 }));
    const rows0 = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="FusionSheetMetalFlangeCommand"] .dlg-row')].filter((r) => r.offsetParent).map((r) => (r.querySelector(".dlg-label")?.innerText || "").trim()).filter(Boolean));
    t.check("dialog rows: Type, Edges/Profiles", rows0[0] === "Type" && rows0[1] === "Edges/Profiles", rows0.join(" | "));
    const prof = await t.aim([[50, 25, 0], [30, 20, 0], [70, 30, 0]], "h && h.ref && h.ref.kind === 'profile'");
    t.require("profile under the cursor", !!prof);
    await t.canvasClick(prof.x, prof.y);
    await t.settle(500);
    const rows1 = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="FusionSheetMetalFlangeCommand"] .dlg-row')].filter((r) => r.offsetParent).map((r) => (r.querySelector(".dlg-label")?.innerText || "").trim()).filter(Boolean));
    t.check("base flange rows: Orientation, Operation, Rule", ["Orientation", "Operation", "Rule"].every((x) => rows1.includes(x)), rows1.join(" | "));
    const ok1 = await okDialog(t, "FusionSheetMetalFlangeCommand");
    t.require("base flange OK enabled", ok1.enabled, ok1.msg);
    let st = await t.state();
    const bf = st.features.find((f) => f.type === "smBaseFlange");
    t.require("Base Flange in the timeline", !!bf && bf.ok, JSON.stringify(bf));
    const body = await t.app((id) => window.app.feature(id).newBodies[0], bf.id);
    let info = await smInfo(t, body);
    t.check("base flange volume 100 x 50 x 2.5", near(info.vol, PLATE, 0.01), info.vol);
    t.check("body is a sheet metal body (browser meta)", !!(info.meta && info.meta.sheetMetal && info.meta.sheetMetal.thickness === T), JSON.stringify(info.meta));
    const brIcon = await t.app((id) => { const n = document.querySelector(`[data-node="body:${id}"]`); return n ? n.innerHTML.length : 0; }, body);
    t.check("body listed in the browser", brIcon > 0);
    await t.shot("base-flange");

    t.step("Flange on the front top edge: Height 20 mm (edge flange)");
    t.require("Flange again", await runCmd(t, "FusionSheetMetalFlangeCommand", "SheetMetalCreatePanel"));
    await t.waitFor('.dlg[data-dialog="FusionSheetMetalFlangeCommand"]', { timeout: 3000 });
    const edge = await t.aim([[50, 0, 2.5], [40, 0, 2.5], [60, 0, 2.5], [30, 0, 2.5]], "h && h.ref && h.ref.kind === 'edge' && Math.abs(h.ref.p[1]) < 0.01 && Math.abs(h.ref.p[2] - 2.5) < 0.01");
    t.require("front top edge under the cursor", !!edge);
    await t.canvasClick(edge.x, edge.y);
    await t.settle(400);
    const rows2 = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="FusionSheetMetalFlangeCommand"] .dlg-row')].filter((r) => r.offsetParent).map((r) => (r.querySelector(".dlg-label")?.innerText || "").trim()).filter(Boolean));
    t.check("edge flange rows", ["Flange Extent", "Height", "Angle", "Edge Extents", "Height Datum", "Bend Position", "Flip", "Miter Corners"].every((x) => rows2.includes(x)), rows2.join(" | "));
    await t.fill('.dlg[data-dialog="FusionSheetMetalFlangeCommand"] [data-input="height"]', "20");
    const ok2 = await okDialog(t, "FusionSheetMetalFlangeCommand");
    t.require("edge flange OK", ok2.enabled, ok2.msg);
    info = await smInfo(t, body);
    t.check("edge flange volume (bend + 15 mm straight)", near(info.vol, EDGE20, 0.05), [info.vol, EDGE20]);
    t.check("edge flange rises to z = 20", near(info.bbox.max[2], 20, 1e-3), info.bbox);
    t.check("one bend tracked", info.bends === 1, info.bends);
    await t.shot("edge-flange");

    t.step("Edit Feature from the timeline: Height 30 mm");
    st = await t.state();
    const ef = st.features.find((f) => f.type === "smEdgeFlange");
    await t.dblclick(`[data-feature="${ef.id}"]`);
    t.require("Edit Flange dialog", await t.waitFor(`.dlg[data-dialog="FusionSheetMetalFlangeCommand"][data-edit="${ef.id}"]`, { timeout: 3000 }));
    await t.fill('.dlg[data-dialog="FusionSheetMetalFlangeCommand"] [data-input="height"]', "30");
    await okDialog(t, "FusionSheetMetalFlangeCommand");
    info = await smInfo(t, body);
    t.check("edited flange rises to z = 30", near(info.bbox.max[2], 30, 1e-3), info.bbox);
    await t.key("Control+z");
    await t.settle(300);
    info = await smInfo(t, body);
    t.check("undo restores 20 mm", near(info.bbox.max[2], 20, 1e-3), info.bbox);

    t.step("Hem on the back top edge (Flat)");
    t.require("Hem command", await runCmd(t, "FusionSheetMetalHemFlangeCommand", "SheetMetalCreatePanel"));
    t.require("Hem dialog", await t.waitFor('.dlg[data-dialog="FusionSheetMetalHemFlangeCommand"]', { timeout: 3000 }));
    await fitHome(t);
    const back = await t.aim([[50, 50, 2.5], [40, 50, 2.5], [60, 50, 2.5], [70, 50, 2.5]], "h && h.ref && h.ref.kind === 'edge' && Math.abs(h.ref.p[1] - 50) < 0.01 && Math.abs(h.ref.p[2] - 2.5) < 0.01");
    t.require("back top edge under the cursor", !!back);
    await t.canvasClick(back.x, back.y);
    const ok3 = await okDialog(t, "FusionSheetMetalHemFlangeCommand");
    t.check("hem OK", ok3.enabled, ok3.msg);
    st = await t.state();
    const hem = st.features.find((f) => f.type === "smHem");
    t.check("Hem in the timeline", !!hem && hem.ok, JSON.stringify(hem));
    info = await smInfo(t, body);
    t.check("two bends tracked", info.bends === 2, info.bends);

    t.step("Sheet Metal Rules: edit Steel (mm) thickness to 2 mm; every flange updates; undo");
    t.require("Rules command", await runCmd(t, "FusionSheetMetalRulesCommand", "SheetMetalModifyPanel"));
    t.require("rules dialog", await t.waitFor('[data-dialog="FusionSheetMetalRulesCommand"]', { timeout: 3000 }));
    const lists = await t.app(() => ({ design: document.querySelectorAll('[data-dialog="FusionSheetMetalRulesCommand"] [data-list="design"] .smr-row').length, lib: document.querySelectorAll('[data-dialog="FusionSheetMetalRulesCommand"] [data-list="library"] .smr-row').length }));
    t.check("In this design + Library (6 default rules)", lists.design >= 1 && lists.lib >= 6, JSON.stringify(lists));
    await t.click('[data-dialog="FusionSheetMetalRulesCommand"] [data-list="design"] .smr-row [data-act="edit"]');
    t.require("rule editor", await t.waitFor('[data-dialog="SheetMetalRuleEditor"]', { timeout: 3000 }));
    await t.fill('[data-dialog="SheetMetalRuleEditor"] [data-field="thickness"]', "2 mm", { commit: false });
    await t.click('[data-dialog="SheetMetalRuleEditor"] [data-action="ok"]');
    await t.settle(600);
    info = await smInfo(t, body);
    t.check("thickness now 2 mm", near(info.T, 2, 1e-9), info.T);
    await t.click('[data-dialog="FusionSheetMetalRulesCommand"] [data-action="ok"]');
    await t.key("Control+z");
    await t.settle(500);
    info = await smInfo(t, body);
    t.check("undo: thickness 2.5 mm again", near(info.T, T, 1e-9), info.T);

    t.step("Create Flat Pattern: click the top face -> FLAT PATTERN environment; Export DXF; Finish");
    await t.escapeAll();
    await fitHome(t);
    t.require("Create Flat Pattern", await runCmd(t, "FusionSheetMetalFlatPatternCmd", "SheetMetalCreatePanel"));
    const top = await t.aim([[50, 25, 2.5], [40, 30, 2.5], [60, 20, 2.5], [30, 25, 2.5]], "h && h.ref && h.ref.kind === 'face' && h.ref.n && h.ref.n[2] > 0.99");
    t.require("top face under the cursor", !!top);
    await t.canvasClick(top.x, top.y);
    await t.settle(800);
    const env = await t.app(() => ({ mode: window.app.mode, flat: window.app.ui.sheetMetal.flatActive, tab: !!document.querySelector('[data-tab="FlatPatternSolidTab"]'), finish: !!document.querySelector('#toolbar [data-cmd="FusionSheetMetalExitFlatPatternCmd"]'), node: !!document.querySelector('[data-node^="flatpattern"]') }));
    t.check("in the FLAT PATTERN environment", env.mode === "flatpattern" && env.flat === body && env.tab && env.finish, JSON.stringify(env));
    t.check("Flat Pattern node in the browser", env.node, JSON.stringify(env));
    const fp = await t.app((id) => { const { fp } = window.app.ui.sheetMetal.flatOf(id); const bb = window.app.K.bboxOf(fp.solid); return { bb, lines: fp.lines.length }; }, body);
    t.check("flat pattern is flat (2.5 mm thick)", near(fp.bb.max[2] - fp.bb.min[2], T, 1e-3), fp.bb);
    t.check("bend lines (2 bends x 3)", fp.lines === 6, fp.lines);
    await t.shot("flat-pattern");
    await t.app(() => { window.__dl = null; const a = window.app; a.__dlOrig = a.download; a.download = async (name, data) => { window.__dl = { name, text: typeof data === "string" ? data : "" }; return true; }; });
    await t.click('#toolbar [data-cmd="ExportFlatPatternCmd"]');
    t.require("Export Flat Pattern dialog", await t.waitFor('.dlg[data-dialog="ExportFlatPatternCmd"]', { timeout: 3000 }));
    await okDialog(t, "ExportFlatPatternCmd");
    const dl = await t.app(() => { const a = window.app; a.download = a.__dlOrig; return window.__dl && { name: window.__dl.name, len: window.__dl.text.length, outer: window.__dl.text.includes("OUTER_PROFILES"), bend: window.__dl.text.includes("BEND_CENTER_LINES"), eof: window.__dl.text.trim().endsWith("EOF") }; });
    t.check("DXF downloaded with profiles and bend lines", !!dl && /\.dxf$/.test(dl.name) && dl.outer && dl.bend && dl.eof, JSON.stringify(dl));
    await t.click('#toolbar [data-cmd="FusionSheetMetalExitFlatPatternCmd"]');
    await t.settle(300);
    const after = await t.app(() => ({ mode: window.app.mode, flat: window.app.ui.sheetMetal.flatActive, bodiesShown: window.app.viewport.groups.bodies.visible }));
    t.check("Finish Flat Pattern returns to the model", after.mode === "model" && !after.flat && after.bodiesShown, JSON.stringify(after));

    t.step("Unfold all bends (Reference = top face), then Refold from the same button (it reads Refold while unfolded)");
    await fitHome(t);
    t.require("Unfold command", await runCmd(t, "FusionSheetmetalUnfoldCommand", "SheetMetalModifyPanel"));
    t.require("Unfold dialog", await t.waitFor('.dlg[data-dialog="FusionSheetmetalUnfoldCommand"]', { timeout: 3000 }));
    const top2 = await t.aim([[50, 25, 2.5], [40, 30, 2.5], [60, 20, 2.5]], "h && h.ref && h.ref.kind === 'face' && h.ref.n && h.ref.n[2] > 0.99");
    await t.canvasClick(top2.x, top2.y);
    await t.click('.dlg[data-dialog="FusionSheetmetalUnfoldCommand"] [data-input="all"]');
    const ok4 = await okDialog(t, "FusionSheetmetalUnfoldCommand");
    t.check("unfold OK", ok4.enabled, ok4.msg);
    info = await smInfo(t, body);
    t.check("unfolded: flat body", near(info.bbox.max[2] - info.bbox.min[2], T, 1e-3) && info.flat === 2, info);
    await t.shot("unfolded");
    const lab = await cmdLabel(t, "FusionSheetmetalUnfoldCommand", "SheetMetalModifyPanel");
    t.check("while unfolded the Unfold command reads Refold", lab.item === "Refold", JSON.stringify(lab));
    await fitHome(t);
    t.require("Unfold button again", await runCmd(t, "FusionSheetmetalUnfoldCommand", "SheetMetalModifyPanel"));
    t.require("it opens Refold Faces", await t.waitFor('.dlg[data-dialog="FusionSheetmetalRefoldCommand"]', { timeout: 3000 }));
    const top3 = await t.aim([[50, 25, 2.5], [40, 30, 2.5], [60, 20, 2.5]], "h && h.ref && h.ref.kind === 'face' && h.ref.n && h.ref.n[2] > 0.99");
    await t.canvasClick(top3.x, top3.y);
    await t.click('.dlg[data-dialog="FusionSheetmetalRefoldCommand"] [data-input="all"]');
    const ok5 = await okDialog(t, "FusionSheetmetalRefoldCommand");
    t.check("refold OK", ok5.enabled, ok5.msg);
    info = await smInfo(t, body);
    t.check("refolded: flange back at z = 20", near(info.bbox.max[2], 20, 1e-3) && info.flat === 0, info);
    const lab2 = await cmdLabel(t, "FusionSheetmetalUnfoldCommand", "SheetMetalModifyPanel");
    t.check("after refolding it reads Unfold again", lab2.item === "Unfold", JSON.stringify(lab2));

    t.step("Contour flange: pick one line of an open U sketch (the whole open profile is selected), Distance 30 mm");
    await t.app(() => {
      const a = window.app;
      a.newDocument("QA SM contour");
      const sk = a.S.newSketch();
      const P = [[0, 40], [0, 0], [60, 0], [60, 40]].map((q) => a.S.addPoint(sk, q[0], q[1]));
      for (let i = 0; i < 3; i++) a.S.addLine(sk, P[i], P[i + 1]);
      a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] }, planeRef: { kind: "origin", name: "XZ" }, sk, visible: true });
    });
    await t.setView("front");
    await t.app(() => window.app.viewport.fit && window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);
    t.require("Flange command (contour)", await runCmd(t, "FusionSheetMetalFlangeCommand", "SheetMetalCreatePanel"));
    await t.waitFor('.dlg[data-dialog="FusionSheetMetalFlangeCommand"]', { timeout: 3000 });
    const cl = await t.aim([[0, 0, 20], [0, 0, 30], [30, 0, 0], [20, 0, 0]], "h && h.ref && h.ref.kind === 'sketchCurve'");
    t.require("open profile line under the cursor", !!cl);
    await t.canvasClick(cl.x, cl.y);
    await t.settle(300);
    const cnt = await t.app(() => document.querySelector('.dlg[data-dialog="FusionSheetMetalFlangeCommand"] [data-input="sel"]')?.getAttribute("data-count"));
    t.check("whole open profile selected (3 curves)", cnt === "3", cnt);
    const rows3 = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="FusionSheetMetalFlangeCommand"] .dlg-row')].filter((r) => r.offsetParent).map((r) => (r.querySelector(".dlg-label")?.innerText || "").trim()).filter(Boolean));
    t.check("contour rows: Distance, Direction, Orientation, Operation, Bend override", ["Distance", "Direction", "Orientation", "Operation", "Bend override"].every((x) => rows3.includes(x)), rows3.join(" | "));
    await t.fill('.dlg[data-dialog="FusionSheetMetalFlangeCommand"] [data-input="cfDistance"]', "30");
    const ok7 = await okDialog(t, "FusionSheetMetalFlangeCommand");
    t.check("contour flange OK", ok7.enabled, ok7.msg);
    const cf = await t.app(() => {
      const a = window.app;
      const f = a.doc.features.find((x) => x.type === "smContourFlange");
      if (!f) return null;
      const id = f.newBody;
      const d = a.result.state.smData.get(id);
      const { fp } = a.ui.sheetMetal.flatOf(id);
      const bb = a.K.bboxOf(fp.solid);
      const ext = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]].sort((x, y) => y - x);
      return { ok: (a.featureResult(f.id) || {}).ok, bends: Object.keys(d.bends).length, bbox: a.K.bboxOf(a.result.state.bodies.get(id).shape), flat: ext };
    });
    t.check("contour flange: U channel with two bends", !!cf && cf.ok && cf.bends === 2 && near(cf.bbox.max[1] - cf.bbox.min[1], 30, 1e-3), JSON.stringify(cf));
    await t.shot("contour-flange");
    t.check("contour flat length 35 + 50 + 35 + 2 bend allowances", !!cf && near(cf.flat[0], 120 + 2 * BA90, 1e-3) && near(cf.flat[2], T, 1e-3), JSON.stringify(cf && cf.flat));

    t.step("Chain Selection: a front edge split in two collinear edges selects both");
    await t.app(() => {
      const a = window.app;
      a.newDocument("QA SM chain");
      const sk = a.S.newSketch();
      const P = [[0, 0], [50, 0], [100, 0], [100, 50], [0, 50]].map((q) => a.S.addPoint(sk, q[0], q[1]));
      P.forEach((p, i) => a.S.addLine(sk, p, P[(i + 1) % P.length]));
      const s = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk, visible: false });
      const reg = a.sketchState(s.id).regions.regions[0];
      a.addFeature({ type: "smBaseFlange", profiles: [{ sketch: s.id, key: reg.key, c: [5, 5] }], orientation: "side1", operation: "new" });
    });
    await fitHome(t);
    t.require("Flange command (chain)", await runCmd(t, "FusionSheetMetalFlangeCommand", "SheetMetalCreatePanel"));
    await t.waitFor('.dlg[data-dialog="FusionSheetMetalFlangeCommand"]', { timeout: 3000 });
    const ce = await t.aim([[25, 0, 2.5], [20, 0, 2.5], [30, 0, 2.5]], "h && h.ref && h.ref.kind === 'edge' && Math.abs(h.ref.p[1]) < 0.01 && Math.abs(h.ref.p[2] - 2.5) < 0.01");
    t.require("front edge under the cursor", !!ce);
    await t.canvasClick(ce.x, ce.y);
    await t.settle(300);
    const c1 = await t.app(() => document.querySelector('.dlg[data-dialog="FusionSheetMetalFlangeCommand"] [data-input="sel"]')?.getAttribute("data-count"));
    t.check("Chain Selection picks the collinear edge too (2 edges)", c1 === "2", c1);
    const ok8 = await okDialog(t, "FusionSheetMetalFlangeCommand");
    t.check("chained edge flange OK", ok8.enabled, ok8.msg);
    const chainBends = await t.app(() => { const a = window.app; const id = a.bodies()[0].id; return Object.keys(a.result.state.smData.get(id).bends).length; });
    t.check("one flange per chained edge (2 bends)", chainBends === 2, chainBends);

    t.step("Corner Closure through the UI with a 2-Bend Corner Override (Square relief); the relief changes the geometry");
    const cc0 = await t.app(() => {
      const a = window.app;
      a.newDocument("QA SM corner");
      const sk = a.S.newSketch(); a.S.addRect2pt(sk, [0, 0], [100, 50]);
      const s = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk, visible: false });
      const reg = a.sketchState(s.id).regions.regions[0];
      const b = a.addFeature({ type: "smBaseFlange", profiles: [{ sketch: s.id, key: reg.key, c: [5, 5] }], orientation: "side1", operation: "new" }).newBodies[0];
      a.addFeature({ type: "smEdgeFlange", edges: [{ body: b, p: [50, 0, 2.5] }, { body: b, p: [100, 25, 2.5] }], height: "20 mm", angle: "90 deg", datum: "outer", position: "adjacent", width: "full" });
      return { b, vol: a.bodyInfo(b).volume };
    });
    await fitHome(t);
    t.require("Corner Closure command", await runCmd(t, "FusionSheetMetalCornerCommand", "SheetMetalModifyPanel"));
    t.require("Corner Closure dialog", await t.waitFor('.dlg[data-dialog="FusionSheetMetalCornerCommand"]', { timeout: 3000 }));
    const e1 = await t.aim([[60, -5, 20], [50, -5, 20], [70, -5, 20], [60, -2.5, 20]], "h && h.ref && h.ref.kind === 'edge' && h.ref.p[1] < -2 && Math.abs(h.ref.p[2] - 20) < 0.01");
    const e2 = await t.aim([[105, 30, 20], [105, 25, 20], [105, 15, 20], [102.5, 30, 20]], "h && h.ref && h.ref.kind === 'edge' && h.ref.p[0] > 102 && Math.abs(h.ref.p[2] - 20) < 0.01");
    t.require("two flange edges under the cursor", !!e1 && !!e2);
    await t.canvasClick(e1.x, e1.y);
    await t.canvasClick(e2.x, e2.y);
    await t.click('.dlg[data-dialog="FusionSheetMetalCornerCommand"] [data-input="reliefOverride"]');
    await t.settle(200);
    await t.app(() => { const el = document.querySelector('.dlg[data-dialog="FusionSheetMetalCornerCommand"] [data-input="relief"]'); el.value = "Square"; });
    await t.settle(300);
    const rows4 = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="FusionSheetMetalCornerCommand"] .dlg-row')].filter((r) => r.offsetParent).map((r) => (r.querySelector(".dlg-label")?.innerText || "").trim()).filter(Boolean));
    t.check("corner rows: Alignment, Gap, override with Relief Shape / Size / Placement", ["Alignment", "Gap", "2-Bend Corner Override", "Relief Shape", "Relief Size", "Relief Placement"].every((x) => rows4.includes(x)), rows4.join(" | "));
    const ok9 = await okDialog(t, "FusionSheetMetalCornerCommand");
    t.check("corner closure OK", ok9.enabled, ok9.msg);
    const cc = await t.app((b) => {
      const a = window.app;
      const f = a.doc.features.find((x) => x.type === "smCorner");
      const stored = { relief: f.relief, override: f.reliefOverride };
      const vSquare = a.bodyInfo(b).volume;
      a.updateFeature(f.id, { relief: "Tear" }, "relief tear");
      const vTear = a.bodyInfo(b).volume;
      a.updateFeature(f.id, { relief: "Round", reliefSize: "8 mm" }, "relief round");
      const vRound = a.bodyInfo(b).volume;
      return { relief: stored.relief, override: stored.override, ok: (a.featureResult(f.id) || {}).ok, vSquare, vTear, vRound };
    }, cc0.b);
    t.check("dialog stored the Square override", cc.relief === "Square" && cc.override === true, JSON.stringify(cc));
    t.check("relief shapes change the geometry (Square < Tear, Round < Tear)", cc.ok && cc.vSquare < cc.vTear - 1 && cc.vRound < cc.vTear - 1 && Math.abs(cc.vSquare - cc.vRound) > 1, JSON.stringify(cc));

    t.step("Fold on a sketch line across a plate (App API plate + sketch, UI dialog)");
    const fb = await t.app(() => {
      const a = window.app;
      a.newDocument("QA SM fold");
      const sk0 = a.S.newSketch(); a.S.addRect2pt(sk0, [0, 0], [100, 50]);
      const s0 = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk: sk0, visible: false });
      const reg = a.sketchState(s0.id).regions.regions[0];
      const bf = a.addFeature({ type: "smBaseFlange", profiles: [{ sketch: s0.id, key: reg.key, c: [5, 5] }], orientation: "side1", operation: "new" });
      const sk = a.S.newSketch();
      a.S.addLine(sk, a.S.addPoint(sk, 70, -10), a.S.addPoint(sk, 70, 60));
      a.addFeature({ type: "sketch", plane: { o: [0, 0, 2.5], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
      return bf.newBodies[0];
    });
    await fitHome(t);
    t.require("Fold command", await runCmd(t, "SheetMetalFoldCmd", "SheetMetalCreatePanel"));
    t.require("Fold dialog", await t.waitFor('.dlg[data-dialog="SheetMetalFoldCmd"]', { timeout: 3000 }));
    const lineHit = await t.aim([[70, 25, 2.5], [70, 30, 2.5], [70, 15, 2.5], [70, 40, 2.5]], "h && h.ref && h.ref.kind === 'sketchCurve'");
    t.require("sketch line under the cursor", !!lineHit);
    await t.canvasClick(lineHit.x, lineHit.y);
    await t.settle(200);
    const st2 = await t.aim([[30, 25, 2.5], [20, 30, 2.5], [40, 20, 2.5]], "h && h.ref && h.ref.kind === 'face' && h.ref.n && h.ref.n[2] > 0.99");
    t.require("stationary face under the cursor", !!st2);
    await t.canvasClick(st2.x, st2.y);
    const ok6 = await okDialog(t, "SheetMetalFoldCmd");
    t.check("fold OK", ok6.enabled, ok6.msg);
    info = await smInfo(t, fb);
    t.check("fold adds a bend and lifts the far side", info.bends === 1 && info.bbox.max[0] < 80 && info.bbox.max[2] > 25 && near(info.bbox.min[0], 0, 1e-6), JSON.stringify(info.bbox));
    await t.shot("folded");

    t.step("Sheet Metal Fillet / Chamfer, Rip, Corner Closure, Jog, Convert, Lofted Flange, Join by Bend (App API)");
    const api = await t.app(() => {
      const a = window.app;
      const res = {};
      const ok = (f) => { const r = a.featureResult(f.id) || {}; return r.ok ? true : r.error || "failed"; };
      const mk = (w, h) => {
        const sk = a.S.newSketch(); a.S.addRect2pt(sk, [0, 0], [w, h]);
        const s = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
        const reg = a.sketchState(s.id).regions.regions[0];
        const bf = a.addFeature({ type: "smBaseFlange", profiles: [{ sketch: s.id, key: reg.key, c: [1, 1] }], orientation: "side1", operation: "new" });
        return bf.newBodies[0];
      };
      a.newDocument("QA SM tools");
      let b = mk(100, 50);
      a.addFeature({ type: "smEdgeFlange", edges: [{ body: b, p: [50, 0, 2.5] }, { body: b, p: [100, 25, 2.5] }], height: "20 mm", angle: "90 deg", datum: "outer", position: "adjacent", width: "full" });
      res.corner = ok(a.addFeature({ type: "smCorner", edges: [{ body: b, p: [50, -5, 10] }, { body: b, p: [105, 25, 10] }], alignment: "symmetric", gap: "0.5 mm" }));
      res.fillet = ok(a.addFeature({ type: "smFillet", edges: [{ body: b, p: [0, 50, 1.25] }], radius: "3 mm" }));
      res.chamfer = ok(a.addFeature({ type: "smChamfer", edges: [{ body: b, p: [0, -3.75, 20] }], distance: "2 mm" }));
      a.newDocument("QA SM rip");
      b = mk(100, 50);
      res.rip = ok(a.addFeature({ type: "smRip", refs: [{ kind: "edge", body: b, p: [30, 0, 2.5] }, { kind: "edge", body: b, p: [30, 50, 2.5] }], gap: "1 mm" }));
      a.newDocument("QA SM jog");
      b = mk(100, 50);
      const sk = a.S.newSketch(); a.S.addLine(sk, a.S.addPoint(sk, 60, -5), a.S.addPoint(sk, 60, 55));
      const s = a.addFeature({ type: "sketch", plane: { o: [0, 0, 2.5], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
      const cid = Object.keys(a.sketchState(s.id).sk.curves)[0];
      res.jog = ok(a.addFeature({ type: "smJog", line: [{ sketch: s.id, curve: cid }], stationary: [{ body: b, p: [20, 25, 2.5], n: [0, 0, 1] }], angle: "90 deg", offset: "15 mm", linePosition: "center" }));
      res.jogTop = a.K.bboxOf(a.result.state.bodies.get(b).shape).max[2];
      a.newDocument("QA SM convert");
      const sk2 = a.S.newSketch();
      const P = [[0, 0], [60, 0], [60, 3], [3, 3], [3, 40], [0, 40]].map((q) => a.S.addPoint(sk2, q[0], q[1]));
      P.forEach((p, i) => a.S.addLine(sk2, p, P[(i + 1) % P.length]));
      const s2 = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] }, planeRef: { kind: "origin", name: "XZ" }, sk: sk2, visible: true });
      const reg2 = a.sketchState(s2.id).regions.regions[0];
      const ex = a.addFeature({ type: "extrude", profiles: [{ sketch: s2.id, key: reg2.key }], distance: "30 mm", operation: "new" });
      res.convert = ok(a.addFeature({ type: "smConvert", face: [{ body: ex.newBody, p: [30, -15, 0], n: [0, 0, -1] }] }));
      res.convertSM = !!(a.bodyMeta(ex.newBody) || {}).sheetMetal;
      a.newDocument("QA SM loft");
      const c1 = a.S.newSketch(); a.S.addCircle(c1, a.S.addPoint(c1, 0, 0), 20);
      const l1 = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk: c1, visible: true });
      const c2 = a.S.newSketch(); a.S.addRect2pt(c2, [-30, -30], [30, 30]);
      const l2 = a.addFeature({ type: "sketch", plane: { o: [0, 0, 40], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk: c2, visible: true });
      const ra = a.sketchState(l1.id).regions.regions[0], rb = a.sketchState(l2.id).regions.regions[0];
      const lf = a.addFeature({ type: "smLoft", p1: { sketch: l1.id, key: ra.key, c: [0, 0] }, p2: { sketch: l2.id, key: rb.key, c: [0, 0] }, method: "press", facets: "16", orientation: "side1" });
      res.loft = ok(lf);
      try { const { fp } = a.ui.sheetMetal.flatOf(lf.newBody); res.loftFlat = fp.lines.length; } catch (e) { res.loftFlat = e.message; }
      a.newDocument("QA SM join");
      b = mk(100, 50);
      const sk3 = a.S.newSketch(); a.S.addRect2pt(sk3, [0, 10], [100, 40]);
      const s3 = a.addFeature({ type: "sketch", plane: { o: [0, 60, 0], x: [1, 0, 0], n: [0, -1, 0] }, planeRef: { kind: "origin", name: "XZ" }, sk: sk3, visible: true });
      const reg3 = a.sketchState(s3.id).regions.regions[0];
      const b2f = a.addFeature({ type: "smBaseFlange", profiles: [{ sketch: s3.id, key: reg3.key, c: [50, 20] }], orientation: "side1", operation: "new" });
      const b2 = b2f.newBodies[0];
      const y2 = a.K.bboxOf(a.result.state.bodies.get(b2).shape).min[1];
      res.join = ok(a.addFeature({ type: "smJoinBend", edges: [{ body: b, p: [50, 50, 2.5] }, { body: b2, p: [50, y2, 10] }] }));
      res.joinBodies = a.bodies().length;
      // Face extension: Aligned runs the connector to B's (narrower) edge, Perpendicular keeps A's width
      const joinVol = (ext) => {
        a.newDocument("QA SM join " + ext);
        const p = mk(100, 50);
        const skj = a.S.newSketch(); a.S.addRect2pt(skj, [20, 10], [80, 40]);
        const sj = a.addFeature({ type: "sketch", plane: { o: [0, 60, 0], x: [1, 0, 0], n: [0, -1, 0] }, planeRef: { kind: "origin", name: "XZ" }, sk: skj, visible: true });
        const rj = a.sketchState(sj.id).regions.regions[0];
        const q = a.addFeature({ type: "smBaseFlange", profiles: [{ sketch: sj.id, key: rj.key, c: [50, 20] }], orientation: "side1", operation: "new" }).newBodies[0];
        const yq = a.K.bboxOf(a.result.state.bodies.get(q).shape).min[1];
        const jf = a.addFeature({ type: "smJoinBend", edges: [{ body: p, p: [50, 50, 2.5] }, { body: q, p: [50, yq, 10] }], extension: ext });
        return ok(jf) === true ? a.bodyInfo(p).volume : NaN;
      };
      res.joinAligned = joinVol("aligned");
      res.joinPerp = joinVol("perpendicular");
      return res;
    });
    for (const k of ["corner", "fillet", "chamfer", "rip", "jog", "convert", "loft", "join"]) t.check(`${k} feature evaluates`, api[k] === true, String(api[k]));
    t.check("jog offset 15 mm", near(api.jogTop, 17.5, 1e-3), api.jogTop);
    t.check("converted body is sheet metal", api.convertSM === true);
    t.check("lofted flange flat pattern has bend lines", typeof api.loftFlat === "number" && api.loftFlat > 0, String(api.loftFlat));
    t.check("join by bend merges into one body", api.joinBodies === 1, api.joinBodies);
    t.check("join face extension Aligned vs Perpendicular changes the geometry", Number.isFinite(api.joinAligned) && Number.isFinite(api.joinPerp) && Math.abs(api.joinAligned - api.joinPerp) > 1, JSON.stringify([api.joinAligned, api.joinPerp]));

    t.step("save / open round trip keeps rules, flat pattern and every feature");
    const rt = await t.app(() => {
      const a = window.app;
      a.newDocument("QA SM roundtrip");
      const sk = a.S.newSketch(); a.S.addRect2pt(sk, [0, 0], [80, 40]);
      const s = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
      const reg = a.sketchState(s.id).regions.regions[0];
      const bf = a.addFeature({ type: "smBaseFlange", profiles: [{ sketch: s.id, key: reg.key, c: [1, 1] }], orientation: "side1", operation: "new" });
      const b = bf.newBodies[0];
      a.addFeature({ type: "smEdgeFlange", edges: [{ body: b, p: [40, 0, 2.5] }], height: "15 mm", angle: "90 deg", datum: "outer", position: "inside", width: "full" });
      a.mutate("rules", (doc) => { doc.sheetMetal = { rules: [{ ...a.ui.sheetMetal.rules.defaultRule(), thickness: "3 mm" }], active: "ADSKRule1", components: {}, flats: { [b]: { face: { body: b, p: [40, 20, 3], n: [0, 0, 1] } } }, rev: 0 }; for (const f of doc.features) if (/^sm/.test(f.type)) f.rv = (f.rv || 0) + 1; });
      const v1 = a.bodyInfo(b).volume;
      const json = JSON.stringify(a.doc);
      a.newDocument("other");
      a.loadDocument(JSON.parse(json));
      const v2 = a.bodyInfo(b).volume;
      return { v1, v2, ok: a.doc.features.every((f) => (a.featureResult(f.id) || {}).ok), T: a.result.state.smData.get(b).T, flats: Object.keys(a.doc.sheetMetal.flats || {}).length };
    });
    t.check("round trip: same volume, all features ok, rule thickness kept", rt.ok && near(rt.v1, rt.v2, 1e-6) && near(rt.T, 3, 1e-9) && rt.flats === 1, JSON.stringify(rt));
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
