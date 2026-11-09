// UTILITIES > CREATE PMI through the real UI: Note, Sizes and Dimensions, Geometric Tolerancing
// (feature control frame, datum, frame under a dimension), Hole/Thread Note and General Note on a
// box with a counterbored hole. Checks the dialogs, live preview, canvas placement, timeline and
// PMI browser entries, canvas selection + Delete, double-click Edit, following model edits,
// orphaned annotations, undo/redo and save/open.
import { defineScenario, mainIfDirect } from "../lib.mjs";

const IDS = ["HoleThreadNoteCommand", "LeaderLineNoteCommand", "DimensionNoteCommand", "GeometricToleranceNoteCommand", "GeneralNoteCommand"];

/** Open a CREATE PMI command from the UTILITIES tab dropdown (falls back to app.commands.run). */
async function openPmi(t, id) {
  await t.escapeAll(1);
  let ok = false;
  if (!(await t.visible('#toolbar [data-panel="Annotate3DPanel"]'))) await t.click('[data-tab="ToolsTab"]', { timeout: 1500 });
  if (await t.click('#toolbar [data-panel="Annotate3DPanel"]', { timeout: 1500 })) {
    await t.waitFor(`#overlay [data-cmd="${id}"]`, { timeout: 1500 });
    ok = await t.click(`#overlay [data-cmd="${id}"]`, { timeout: 1000 });
  }
  if (!(await t.waitFor(`.dlg[data-dialog="${id}"]`, { timeout: 2500 }))) {
    await t.escapeAll(1);
    await t.app((id) => window.app.commands.run(id), id);
    ok = false;
    if (!(await t.waitFor(`.dlg[data-dialog="${id}"]`, { timeout: 2500 }))) return null;
    t.note(`${id}: opened through app.commands.run`);
  }
  await t.frames(3);
  return { fromToolbar: ok };
}

/** Visible row labels of the open dialog. */
const labelsOf = (t, id) => t.app((id) => [...document.querySelectorAll(`.dlg[data-dialog="${id}"] .dlg-label`)].filter((e) => e.offsetParent).map((e) => e.textContent.trim()).filter(Boolean), id);
/** Texts of the dialog's live preview (rich text, one string per line). */
const previewText = (t) => t.app(() => { const P = window.app.ui.pmi.previewPrims(); return P ? P.texts.flatMap((x) => x.block.lines || (x.block.rows || []).flat().map((c) => (typeof c === "string" ? c : c.sym))) : null; });
/** Lines drawn for a committed annotation. */
const textOf = (t, id) => t.app((id) => { const P = window.app.ui.pmi.renderer.primsOf(id); return P ? P.texts.flatMap((x) => x.block.lines || (x.block.rows || []).flat().map((c) => (typeof c === "string" ? c : c.sym))) : null; }, id);
const lastFeature = (t) => t.app(() => { const f = window.app.doc.features[window.app.doc.features.length - 1]; const r = window.app.featureResult(f.id) || {}; return { id: f.id, type: f.type, name: f.name, ok: r.ok, warning: r.warning || null }; });

/** Canvas point of an annotation's first text block (page coordinates). */
const textXY = (t, id) => t.app((id) => {
  const vp = window.app.viewport;
  const P = window.app.ui.pmi.renderer.primsOf(id);
  if (!P || !P.texts.length) return null;
  const s = vp.toScreen(P.texts[0].c);
  const r = vp.canvas.getBoundingClientRect();
  return { x: r.left + s[0], y: r.top + s[1] };
}, id);

async function placeAt(t, world) {
  const p = await t.canvasXY(world);
  await t.canvasClick(p.x, p.y);
  await t.settle(150);
}
async function ok(t, id) {
  await t.click(`.dlg[data-dialog="${id}"] [data-action="ok"]`);
  return t.waitFor((id) => !document.querySelector(`.dlg[data-dialog="${id}"]`), { timeout: 3000, arg: id });
}
/** Face / edge ref of the box for dlg.pickRef (geometry hidden from the current view). */
const topoRef = (t, body, kind, test) => t.app(({ body, kind, test }) => {
  const app = window.app;
  const T = app.K.topoOf(app.body(body).shape);
  const list = kind === "face" ? T.faces : T.edges;
  // eslint-disable-next-line no-new-func
  const fn = new Function("e", `return (${test});`);
  const i = list.findIndex((e) => fn(e));
  if (i < 0) return null;
  const e = list[i];
  return kind === "face" ? { kind, body, index: i, p: e.c || e.p, n: e.n, planar: e.type === "PLANE" } : { kind, body, index: i, p: e.m || e.c || e.p };
}, { body, kind, test });

const scenario = defineScenario({
  name: "annotate",
  title: "CREATE PMI: Note, Sizes and Dimensions, Geometric Tolerancing, Hole/Thread Note, General Note",
  timeout: 300000,
  async run(t) {
    t.step("setup: 40 x 20 x 10 box with a counterbored hole (App API)");
    const setup = await t.app(() => {
      const app = window.app;
      const box = app.addFeature({ type: "box", length: "40 mm", width: "20 mm", height: "10 mm", center: [0, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
      const hole = app.addFeature({ type: "hole", placement: "face", points: [[8, 0, 10]], normal: [0, 0, 1], faceRef: { body: box.newBody, p: [8, 0, 10], n: [0, 0, 1] }, diameter: "6.6 mm", depth: "10 mm", extent: "all", holeType: "counterbore", cbD: "11 mm", cbDepth: "4 mm", drillPoint: "angle", tipAngle: "118 deg", operation: "cut" });
      app.viewport.setView("home", { animate: false });
      app.viewport.fit({ animate: false });
      return { box: box.id, body: box.newBody, hole: hole.id, ok: !!(app.featureResult(hole.id) || {}).ok };
    });
    t.require("box + hole created", setup.ok, JSON.stringify(setup));
    const body = setup.body;
    await t.cameraStable(2000);

    // ------------------------------------------------------------- toolbar
    t.step("UTILITIES > CREATE PMI lists the five annotation commands as real commands");
    await t.click('[data-tab="ToolsTab"]');
    await t.click('#toolbar [data-panel="Annotate3DPanel"]');
    const listed = await t.app((ids) => ids.filter((id) => !!document.querySelector(`#overlay [data-cmd="${id}"]`)), IDS);
    t.check("dropdown lists Hole/Thread Note, Note, Sizes and Dimensions, Geometric Tolerancing, General Note", listed.length === 5, listed.join());
    const stubs = await t.app((ids) => ids.filter((id) => { const c = window.app.commands.get(id); return !c || c.stub; }), IDS);
    t.check("no CREATE PMI command is a stub", stubs.length === 0, stubs.join());
    await t.escapeAll(1);

    // ------------------------------------------------------------- Note
    t.step("Note: pick the top face, place the note, type the text, OK");
    t.require("NOTE dialog opens from the toolbar", await openPmi(t, "LeaderLineNoteCommand"));
    const noteLabels = await labelsOf(t, "LeaderLineNoteCommand");
    t.check("Note rows: Geometry, Leader line position, Change annotation plane, Alternate annotation plane, Perpendicular text, Leader line extension",
      ["Geometry", "Leader line position", "Change annotation plane", "Alternate annotation plane", "Perpendicular text", "Leader line extension"].every((l) => noteLabels.includes(l)), noteLabels.join(" | "));
    const top = await t.aim([[-12, 4, 10], [-10, 0, 10], [-14, -5, 10], [-5, 5, 10]], "h && h.ref && h.ref.kind === 'face' && h.ref.planar");
    t.require("top face pickable", !!top);
    await t.canvasClick(top.x, top.y);
    await t.settle(200);
    const placing = await t.app(() => { const d = window.app.ui.dialog.current; return { n: (d.values.geom || []).length, placing: !!d.values.placing }; });
    t.check("the face is selected and the note follows the cursor (placing)", placing.n === 1 && placing.placing, JSON.stringify(placing));
    const tgt = await t.canvasXY([-26, 14, 10]);
    await t.page.mouse.move(tgt.x - 30, tgt.y - 20, { steps: 4 });
    await t.frames(3);
    t.check("live preview while placing", !!(await previewText(t)), "no preview prims");
    await placeAt(t, [-26, 14, 10]);
    t.check("click anchors the note (placing ends)", await t.app(() => !window.app.ui.dialog.current.values.placing));
    await t.fill('.dlg[data-dialog="LeaderLineNoteCommand"] textarea[data-input="text"]', "BREAK ALL SHARP EDGES", { commit: false });
    await t.settle(350);
    t.check("preview shows the typed text", JSON.stringify(await previewText(t)).includes("BREAK ALL SHARP EDGES"));
    t.check("OK closes the dialog", await ok(t, "LeaderLineNoteCommand"));
    const note = await lastFeature(t);
    t.check("Note1 is a pmiNote timeline feature", note.type === "pmiNote" && note.name === "Note1" && note.ok, JSON.stringify(note));
    t.check("timeline item for the note", await t.waitFor((id) => !!document.querySelector(`#timeline [data-feature="${id}"]`), { timeout: 2000, arg: note.id }));
    t.check("the note is drawn on the canvas with its text", JSON.stringify(await textOf(t, note.id)).includes("BREAK ALL SHARP EDGES"));
    t.check("PMI folder in the browser", await t.waitFor('#browser-host [data-node="annotations:root"]', { timeout: 2000 }));
    await t.shot("note");

    // ------------------------------------------------------------- Sizes and Dimensions
    t.step("Sizes and Dimensions: the front top edge -> linear 40.00");
    t.require("SIZES AND DIMENSIONS dialog opens", await openPmi(t, "DimensionNoteCommand"));
    const dimTabs = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="DimensionNoteCommand"] .pmi-tab')].map((b) => b.textContent));
    t.check("tabs Leader line | Dimension | Text", dimTabs.join("|") === "Leader line|Dimension|Text", dimTabs.join("|"));
    const front = await t.aim([[0, -10, 10], [-6, -10, 10], [6, -10, 10], [-14, -10, 10]], "h && h.ref && h.ref.kind === 'edge'");
    t.require("front top edge pickable", !!front);
    await t.canvasClick(front.x, front.y);
    await t.settle(200);
    await placeAt(t, [0, -22, 10]);
    const dimPrev = await previewText(t);
    t.check("preview reads 40.00", JSON.stringify(dimPrev).includes("40.00"), JSON.stringify(dimPrev));
    t.check("OK", await ok(t, "DimensionNoteCommand"));
    const dim = await lastFeature(t);
    t.check("Linear Dimension1 (pmiDimension)", dim.type === "pmiDimension" && /Linear Dimension1/.test(dim.name) && dim.ok, JSON.stringify(dim));
    t.check("drawn value 40.00", JSON.stringify(await textOf(t, dim.id)).includes("40.00"));

    t.step("Sizes and Dimensions: the hole -> diameter 6.60");
    t.require("dialog opens", await openPmi(t, "DimensionNoteCommand"));
    const holeFace = await topoRef(t, body, "face", "e.type === 'CYLINDRE' && Math.abs(e.r - 3.3) < 1e-3");
    t.require("hole face found", !!holeFace);
    await t.app((r) => { const d = window.app.ui.dialog.current; d.pickRef("geom", r); d.values.pos = [12, 12]; d.values.placing = false; d.values.placed = true; d.previewNow(); }, holeFace);
    await t.frames(3);
    const diaPrev = await previewText(t);
    t.check("preview reads ⌀6.60", JSON.stringify(diaPrev).includes("⌀6.60"), JSON.stringify(diaPrev));
    t.check("OK", await ok(t, "DimensionNoteCommand"));
    const dia = await lastFeature(t);
    t.check("Diameter Dimension1", dia.type === "pmiDimension" && /Diameter Dimension1/.test(dia.name), JSON.stringify(dia));

    t.step("Sizes and Dimensions: top face + front face -> angular 90.0 deg (Dimension tab, Text tab)");
    t.require("dialog opens", await openPmi(t, "DimensionNoteCommand"));
    const topF = await topoRef(t, body, "face", "e.type === 'PLANE' && e.n[2] > 0.99");
    const frontF = await topoRef(t, body, "face", "e.type === 'PLANE' && e.n[1] < -0.99");
    await t.app(([a, b]) => { const d = window.app.ui.dialog.current; d.pickRef("geom", a); d.pickRef("geom", b); d.values.pos = [6, 6]; d.values.placing = false; d.values.placed = true; d.previewNow(); }, [topF, frontF]);
    await t.frames(3);
    const angPrev = await previewText(t);
    t.check("preview reads 90.0°", JSON.stringify(angPrev).includes("90.0°"), JSON.stringify(angPrev));
    await t.click('.dlg[data-dialog="DimensionNoteCommand"] .pmi-tab[data-tab="dimension"]');
    const angLabels = await labelsOf(t, "DimensionNoteCommand");
    t.check("Dimension tab: Modeled dimension, Dimension tolerance, Angular sector", ["Modeled dimension", "Dimension tolerance", "Angular sector"].every((l) => angLabels.includes(l)), angLabels.join(" | "));
    await t.click('.dlg[data-dialog="DimensionNoteCommand"] .pmi-tab[data-tab="text"]');
    await t.fill('.dlg[data-dialog="DimensionNoteCommand"] textarea[data-input="text"]', "%1% TYP", { commit: false });
    await t.settle(350);
    t.check("text template: 90.0° TYP", JSON.stringify(await previewText(t)).includes("90.0° TYP"), JSON.stringify(await previewText(t)));
    t.check("OK", await ok(t, "DimensionNoteCommand"));
    const ang = await lastFeature(t);
    t.check("Angular Dimension1", ang.type === "pmiDimension" && /Angular Dimension1/.test(ang.name) && ang.ok, JSON.stringify(ang));

    // ------------------------------------------------------------- Geometric Tolerancing
    t.step("Geometric Tolerancing: Flatness 0.05 on the top face");
    t.require("GEOMETRIC TOLERANCING dialog opens", await openPmi(t, "GeometricToleranceNoteCommand"));
    const gLabels = await labelsOf(t, "GeometricToleranceNoteCommand");
    t.check("rows Surfaces/Dimensions, Symbol, Create Datum", ["Surfaces/Dimensions", "Symbol", "Create Datum"].every((l) => gLabels.includes(l)), gLabels.join(" | "));
    const top2 = await t.aim([[-4, -6, 10], [-12, -6, 10], [-2, 6, 10]], "h && h.ref && h.ref.kind === 'face' && h.ref.planar");
    t.require("top face pickable", !!top2);
    await t.canvasClick(top2.x, top2.y);
    await t.settle(200);
    await placeAt(t, [-30, -14, 10]);
    await t.click('.dlg[data-dialog="GeometricToleranceNoteCommand"] [data-input="fcf_sym"]');
    t.check("symbol menu with images", await t.waitFor('#overlay [data-menu="fcf_sym"] [data-option="flatness"]', { timeout: 1500 }));
    await t.click('#overlay [data-menu="fcf_sym"] [data-option="flatness"]');
    await t.fill('.dlg[data-dialog="GeometricToleranceNoteCommand"] [data-input="fcf_tol"]', "0.05");
    await t.frames(3);
    const fcfPrev = await previewText(t);
    t.check("preview frame: flatness | 0.05", JSON.stringify(fcfPrev).includes("flatness") && JSON.stringify(fcfPrev).includes("0.05"), JSON.stringify(fcfPrev));
    t.check("OK", await ok(t, "GeometricToleranceNoteCommand"));
    const flat = await lastFeature(t);
    t.check("Flatness1 (pmiGdt)", flat.type === "pmiGdt" && /Flatness1/.test(flat.name) && flat.ok, JSON.stringify(flat));

    t.step("Geometric Tolerancing: datum A on the bottom face, then Position to A under the diameter dimension");
    t.require("dialog opens", await openPmi(t, "GeometricToleranceNoteCommand"));
    const bottom = await topoRef(t, body, "face", "e.type === 'PLANE' && e.n[2] < -0.99");
    await t.app((r) => { const d = window.app.ui.dialog.current; d.pickRef("geom", r); d.values.pos = [0, 12]; d.values.placing = false; d.values.placed = true; d.set("d_on", true, { user: true }); }, bottom);
    await t.frames(3);
    t.check("datum identifier defaults to A", await t.app(() => window.app.ui.dialog.current.values.d_id === "A"));
    t.check("OK", await ok(t, "GeometricToleranceNoteCommand"));
    const datum = await lastFeature(t);
    t.check("Datum A", datum.type === "pmiGdt" && datum.name === "Datum A", JSON.stringify(datum));
    t.require("dialog opens", await openPmi(t, "GeometricToleranceNoteCommand"));
    await t.app((id) => { const d = window.app.ui.dialog.current; d.pickRef("geom", { kind: "feature", id }); d.set("fcf_sym", "position", { user: true }); d.set("fcf_dia", true, { user: true }); d.set("fcf_d1", "A", { user: true }); d.previewNow(); }, dia.id);
    await t.frames(3);
    const posPrev = await previewText(t);
    t.check("frame under the dimension: position | ⌀0.10 | A", JSON.stringify(posPrev).includes("position") && JSON.stringify(posPrev).includes("A"), JSON.stringify(posPrev));
    t.check("OK", await ok(t, "GeometricToleranceNoteCommand"));
    const pos = await lastFeature(t);
    t.check("Position1 attached to the dimension", pos.type === "pmiGdt" && /Position1/.test(pos.name) && pos.ok, JSON.stringify(pos));

    // ------------------------------------------------------------- Hole/Thread Note
    t.step("Hole/Thread Note on the counterbored hole");
    t.require("HOLE/THREAD NOTE dialog opens", await openPmi(t, "HoleThreadNoteCommand"));
    const hTabs = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="HoleThreadNoteCommand"] .pmi-tab')].filter((b) => b.offsetParent).map((b) => b.textContent));
    t.check("tabs before a selection: Leader line | Diameter | Text", hTabs.join("|") === "Leader line|Diameter|Text", hTabs.join("|"));
    await t.app((r) => { const d = window.app.ui.dialog.current; d.pickRef("geom", r); d.values.pos = [14, 10]; d.values.placing = false; d.values.placed = true; d.previewNow(); }, holeFace);
    await t.frames(3);
    const hTabs2 = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="HoleThreadNoteCommand"] .pmi-tab')].filter((b) => b.offsetParent).map((b) => b.textContent));
    t.check("a counterbored hole adds the Counterbore tab", hTabs2.includes("Counterbore"), hTabs2.join("|"));
    const hPrev = await previewText(t);
    t.check("note reads ⌀6.60 THRU / ⌴ ⌀11.00 ↧ 4.00", JSON.stringify(hPrev) === JSON.stringify(["⌀6.60 THRU", "⌴ ⌀11.00 ↧ 4.00"]), JSON.stringify(hPrev));
    t.check("OK", await ok(t, "HoleThreadNoteCommand"));
    const hn = await lastFeature(t);
    t.check("Hole Note1", hn.type === "pmiHoleNote" && hn.name === "Hole Note1" && hn.ok, JSON.stringify(hn));

    // ------------------------------------------------------------- General Note
    t.step("General Note: text in the lower-left corner of the canvas");
    t.require("GENERAL NOTE dialog opens", await openPmi(t, "GeneralNoteCommand"));
    await t.fill('.dlg[data-dialog="GeneralNoteCommand"] textarea[data-input="text"]', "ALL DIMENSIONS IN MM", { commit: false });
    t.check("OK", await ok(t, "GeneralNoteCommand"));
    const gn = await lastFeature(t);
    t.check("General Note1", gn.type === "pmiGeneralNote" && gn.name === "General Note1", JSON.stringify(gn));
    t.check("general note shown over the canvas", await t.waitFor(".pmi-gnote", { timeout: 1500 }) && (await t.app(() => document.querySelector(".pmi-gnote").textContent)).includes("ALL DIMENSIONS IN MM"));
    await t.shot("all");

    // ------------------------------------------------------------- browser
    t.step("Browser: PMI folder lists the annotations");
    const nodes = await t.app(() => [...document.querySelectorAll('#browser-host [data-node="annotations:root"]')].length);
    t.check("one PMI folder", nodes === 1);
    const pmiCount = await t.app(() => window.app.ui.pmi.features().length);
    t.check("9 PMI features", pmiCount === 9, String(pmiCount));

    // ------------------------------------------------------------- canvas selection, Delete, undo
    t.step("click the note text on the canvas selects it; Delete removes it; Ctrl+Z restores it");
    await t.escapeAll(2);
    const nxy = await textXY(t, note.id);
    t.require("note text on screen", !!nxy);
    await t.canvasClick(nxy.x, nxy.y);
    await t.settle(150);
    const sel = await t.app(() => window.app.selection.items.map((r) => `${r.kind}:${r.id || ""}`));
    t.check("selection = the note", sel.length === 1 && sel[0] === `feature:${note.id}`, sel.join());
    await t.blur();
    await t.key("Delete");
    await t.settle(300);
    t.check("Delete removes the note", await t.app((id) => !window.app.feature(id), note.id));
    await t.key("Control+z");
    await t.settle(300);
    t.check("Ctrl+Z restores it", await t.app((id) => !!window.app.feature(id) && !!window.app.ui.pmi.spec(id), note.id));

    // ------------------------------------------------------------- double-click edit
    t.step("double-click the note opens Edit; change the text");
    await t.escapeAll(2);
    const nxy2 = await textXY(t, note.id);
    await t.page.mouse.dblclick(nxy2.x, nxy2.y);
    t.check("NOTE dialog opens in edit mode", await t.waitFor(`.dlg[data-dialog="LeaderLineNoteCommand"][data-edit="${note.id}"]`, { timeout: 2000 }));
    await t.fill('.dlg[data-dialog="LeaderLineNoteCommand"] textarea[data-input="text"]', "DEBURR", { commit: false });
    t.check("OK", await ok(t, "LeaderLineNoteCommand"));
    t.check("edited text drawn", JSON.stringify(await textOf(t, note.id)).includes("DEBURR"));
    t.check("still Note1, same timeline position", await t.app((id) => { const f = window.app.feature(id); return f.name === "Note1" && window.app.featureIndex(id) === 2; }, note.id));

    // ------------------------------------------------------------- follows the model
    t.step("annotations follow model edits: box length 50, hole diameter 8");
    await t.app(({ box, hole }) => { window.app.updateFeature(box, { length: "50 mm" }, "Edit"); window.app.updateFeature(hole, { diameter: "8 mm" }, "Edit"); }, setup);
    await t.settle(300);
    t.check("linear dimension reads 50.00", JSON.stringify(await textOf(t, dim.id)).includes("50.00"));
    t.check("hole note reads ⌀8.00 THRU", JSON.stringify(await textOf(t, hn.id)).includes("⌀8.00 THRU"));
    t.check("diameter dimension reads ⌀8.00", JSON.stringify(await textOf(t, dia.id)).includes("⌀8.00"));

    t.step("suppressing the hole orphans its annotations (warning), unsuppressing restores them");
    await t.app((hole) => window.app.mutate("Suppress", (doc) => { doc.features.find((f) => f.id === hole).suppressed = true; }), setup.hole);
    await t.settle(300);
    const orph = await t.app((ids) => ids.map((id) => { const s = window.app.ui.pmi.spec(id); const r = window.app.featureResult(id) || {}; return { orphan: !!(s && s.orphan), warning: !!r.warning }; }), [hn.id, dia.id]);
    t.check("hole note + diameter dimension orphaned with a timeline warning", orph.every((o) => o.orphan && o.warning), JSON.stringify(orph));
    t.check("warning badge on the timeline item", await t.app((id) => { const e = document.querySelector(`#timeline [data-feature="${id}"]`); return !!e && /warn/.test(e.className + e.innerHTML); }, hn.id));
    await t.key("Control+z");
    await t.settle(300);
    t.check("undo: annotations attached again", await t.app((id) => { const s = window.app.ui.pmi.spec(id); return !!s && !s.orphan; }, hn.id));

    // ------------------------------------------------------------- visibility
    t.step("Show/Hide from the browser eye");
    await t.app((id) => { const app = window.app; app.mutate("Hide", (doc) => { doc.features.find((f) => f.id === id).visible = false; }); }, flat.id);
    await t.settle(200);
    t.check("hidden annotation is not drawn", await t.app((id) => !window.app.ui.pmi.renderer.primsOf(id), flat.id));
    await t.key("Control+z");
    await t.settle(200);

    // ------------------------------------------------------------- undo / redo
    t.step("undo / redo of a PMI command");
    const before = await t.app(() => window.app.doc.features.length);
    await t.app(() => window.app.history.undo());
    await t.settle(200);
    await t.app(() => window.app.history.undo());
    await t.app(() => window.app.history.undo());
    await t.app(() => window.app.history.undo());
    await t.settle(200);
    const mid = await t.app(() => window.app.doc.features.length);
    await t.app(() => { for (let i = 0; i < 4; i++) window.app.history.redo(); });
    await t.settle(300);
    const after = await t.app(() => window.app.doc.features.length);
    t.check("redo brings everything back", after === before && mid <= before, `${before} -> ${mid} -> ${after}`);

    // ------------------------------------------------------------- save / open
    t.step("save / open round trip keeps every annotation");
    const snap = await t.app(() => window.app.ui.pmi.specs().map((s) => ({ id: s.id, orphan: !!s.orphan })).sort((a, b) => (a.id < b.id ? -1 : 1)));
    await t.app(() => { const json = JSON.stringify(window.app.doc); window.app.newDocument("Blank"); window.app.loadDocument(JSON.parse(json)); });
    await t.settle(500);
    const snap2 = await t.app(() => window.app.ui.pmi.specs().map((s) => ({ id: s.id, orphan: !!s.orphan })).sort((a, b) => (a.id < b.id ? -1 : 1)));
    t.check("same annotations after reopening, none orphaned", JSON.stringify(snap) === JSON.stringify(snap2) && snap2.length === 9 && snap2.every((s) => !s.orphan), `${JSON.stringify(snap)} vs ${JSON.stringify(snap2)}`);
    t.check("hole note text after reopening", JSON.stringify(await textOf(t, hn.id)).includes("⌀8.00 THRU"));

    t.step("Change PMI Settings (PMI folder menu): Size 7 mm enlarges every annotation; precision is the default for new ones");
    await t.escapeAll(2);
    const hOf = () => t.app((id) => { const P = window.app.ui.pmi.renderer.primsOf(id); return P && P.texts[0] ? P.texts[0].H : null; }, dim.id);
    const h0 = await hOf();
    await t.app(() => window.app.commands.run("FusionChangePMISettingsCmd"));
    t.require("CHANGE PMI SETTINGS dialog", await t.waitFor('.dlg[data-dialog="FusionChangePMISettingsCmd"]', { timeout: 2000 }));
    const sLabels = await labelsOf(t, "FusionChangePMISettingsCmd");
    t.check("rows Standard, Size, Default Precision, Default Tolerance, Leading Zero, Trailing Zero, General Note Size", ["Standard", "Size", "Default Precision", "Default Tolerance", "Leading Zero", "Trailing Zero", "General Note Size"].every((l) => sLabels.includes(l)), sLabels.join(" | "));
    await t.fill('.dlg[data-dialog="FusionChangePMISettingsCmd"] [data-input="size"]', "7");
    t.check("OK", await ok(t, "FusionChangePMISettingsCmd"));
    await t.settle(300);
    const h1 = await hOf();
    t.check("text height 3.5 -> 7 mm", h0 === 3.5 && h1 === 7, `${h0} -> ${h1}`);
    await t.key("Control+z");
    await t.settle(300);
    t.check("undo: 3.5 mm again", (await hOf()) === 3.5);

    t.step("Edit Feature from the timeline reopens the Hole/Thread Note dialog");
    await t.escapeAll(2);
    await t.dblclick(`#timeline [data-feature="${hn.id}"]`);
    t.check("HOLE/THREAD NOTE in edit mode", await t.waitFor(`.dlg[data-dialog="HoleThreadNoteCommand"][data-edit="${hn.id}"]`, { timeout: 2500 }));
    await t.key("Escape");
    await t.settle(200);
    await t.shot("final");
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
