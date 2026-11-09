// createx: Coordinate System, Bounding Solid, Pattern on Path, Geometric Pattern, Fluid Volume,
// Volumetric Lattice and Volumetric Texture through their dialogs (toolbar dropdowns / S toolbox),
// canvas selections, OK -> bodies, volumes, timeline / browser entries, Edit Feature, undo / redo and a
// save/open round trip.
import { defineScenario, mainIfDirect, near, fmt, apiBox } from "../lib.mjs";

/** Open a command: toolbar dropdown (optional flyout label), else the S toolbox, else app.commands.run. */
async function openCmd(t, id, { panel, flyout, search } = {}) {
  await t.escapeAll(1);
  let how = null;
  if (panel && (await t.click(`#toolbar [data-panel="${panel}"]`, { timeout: 1500 }))) {
    if (flyout) {
      await t.waitFor(`#overlay .sh-mi:has-text("${flyout}")`, { timeout: 1500 });
      await t.hover(`#overlay .sh-mi:has-text("${flyout}")`);
    }
    if ((await t.waitFor(`#overlay [data-cmd="${id}"]`, { timeout: 1500 })) && (await t.click(`#overlay [data-cmd="${id}"]`, { timeout: 1000 }))) how = "toolbar";
  }
  if (!how && search) {
    await t.escapeAll(1);
    await t.mouseToCanvas(0.6, 0.6);
    await t.key("s");
    if (await t.waitFor(".tbx-root input", { timeout: 2000 })) {
      await t.type(search);
      await t.settle(250);
      if (await t.click(`.tbx-root [data-cmd="${id}"]`, { timeout: 1500 })) how = "toolbox";
    }
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
const sel = (id, input) => `.dlg[data-dialog="${id}"] [data-input="${input}"]`;
async function pickOption(t, id, input, value) {
  await t.click(sel(id, input));
  const ok = await t.click(`.dlg-dd-menu [data-option="${value}"]`, { timeout: 1500 });
  await t.settle(150);
  return ok;
}
async function okDialog(t, id) {
  await t.settle(400);
  await t.waitFor((id) => { const b = document.querySelector(`.dlg[data-dialog="${id}"] [data-action="ok"]`); return !!b && !b.disabled; }, { timeout: 8000, arg: id });
  const en = await t.app((id) => { const b = document.querySelector(`.dlg[data-dialog="${id}"] [data-action="ok"]`); return !!b && !b.disabled; }, id);
  if (en) await t.click(`.dlg[data-dialog="${id}"] [data-action="ok"]`);
  await t.waitFor(() => !window.app.activeCommand, { timeout: 30000 });
  return en;
}
/** Click a canvas point whose pick satisfies pred (world candidates). */
async function clickAt(t, points, pred) {
  const a = await t.aim(points, pred);
  if (a) await t.canvasClick(a.x, a.y);
  return a;
}
const last = async (t, type) => { await t.waitFor((type) => { const f = [...window.app.doc.features].reverse().find((x) => x.type === type); return !!f && !!document.querySelector(`#timeline [data-feature="${f.id}"] svg`); }, { timeout: 3000, arg: type }); return lastNow(t, type); };
const lastNow = (t, type) => t.app((type) => {
  const a = window.app, f = [...a.doc.features].reverse().find((x) => x.type === type);
  if (!f) return null;
  const r = a.featureResult(f.id) || {};
  const el = document.querySelector(`#timeline [data-feature="${f.id}"]`);
  return { id: f.id, name: f.name, ok: !!r.ok, error: r.error, warning: r.warning, body: f.newBody || f.body, tl: !!el, icon: !!(el && el.querySelector("svg")), f: JSON.parse(JSON.stringify(f)) };
}, type);
const volume = (t, id) => t.app((id) => (window.app.bodyInfo(id) || {}).volume, id);

const scenario = defineScenario({
  name: "createx",
  title: "Remaining SOLID Create tools (createx)",
  timeout: 280000,
  async run(t) {
    const real = await t.app(() => ["StockModelCommand", "EnclosureCommand", "PatternOnPath", "FusionPatternGeometricCommand", "CoordinateSystemCommand", "VolFieldCreateLatticeCommand", "VolFieldTextureCommand"].filter((id) => { const c = window.app.commands.get(id); return !c || c.stub; }));
    t.require("all seven createx commands are registered (no stubs)", real.length === 0, real.join(","));

    // ------------------------------------------------------------ Coordinate System
    t.step("model: box 40 x 20 x 10");
    const B = await apiBox(t, { L: "40 mm", W: "20 mm", H: "10 mm" });
    await t.setView("home");
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.frames(4);

    t.step("Coordinate System: CONSTRUCT dropdown, snap to the top face, Z Rotation 30 deg");
    t.check("Coordinate System opens", !!(await openCmd(t, "CoordinateSystemCommand", { panel: "ConstructionPanel", search: "Coordinate System" })));
    const snap = await clickAt(t, [[5, 3, 10], [0, 0, 10], [-8, 4, 10]], "h && h.ref && h.ref.kind === 'face'");
    t.check("snap face picked on the canvas", !!snap);
    await t.fill(sel("CoordinateSystemCommand", "zRot"), "30 deg");
    await t.shot("csys-dialog");
    t.check("Coordinate System OK", await okDialog(t, "CoordinateSystemCommand"));
    const cs = await last(t, "csys");
    const csF = await t.app((id) => { const F = window.app.result.state.csys && window.app.result.state.csys.get(id); return F ? { o: F.o, x: F.x } : null; }, cs && cs.id);
    t.check("csys feature: timeline item with icon, frame on the top face rotated 30 deg", cs && cs.ok && cs.tl && cs.icon && csF && near(csF.o[2], 10, 1e-3) && near(csF.x[0], Math.cos(Math.PI / 6), 1e-3), JSON.stringify({ cs, csF }));
    t.check("csys listed in the browser Construction folder", await t.app((id) => { const app = window.app; app.ui.browser && app.ui.browser.invalidate && app.ui.browser.invalidate(); return true; }, null) && (await t.waitFor((id) => !!document.querySelector(`[data-node="feature:${id}"]`), { timeout: 2000, arg: cs && cs.id }) || (await t.app(() => { const n = document.querySelector('[data-node="construction:root"]'); if (n) n.click(); return true; }), await t.waitFor((id) => !!document.querySelector(`[data-node="feature:${id}"]`), { timeout: 2000, arg: cs && cs.id }))));
    const csPick = await t.aim([csF.o], "h && h.ref && h.ref.kind === 'feature'");
    t.check("csys triad is pickable on the canvas", !!csPick);

    // ------------------------------------------------------------ Bounding Solid
    t.step("Bounding Solid (S toolbox): body, Symmetrical sides 2 mm, Top 1 mm");
    t.check("Bounding Solid opens from the toolbox", (await openCmd(t, "StockModelCommand", { search: "Bounding Solid" })) === "toolbox");
    t.check("body picked", !!(await clickAt(t, [[-15, -5, 10], [10, 5, 10], [0, -10, 5]], "h && h.ref && (h.ref.kind === 'face' || h.ref.kind === 'body') && h.ref.body === '" + B.body + "'")));
    const labels = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="StockModelCommand"] .dlg-row')].filter((r) => r.offsetParent).map((r) => (r.querySelector(".dlg-label") || {}).textContent).filter(Boolean));
    t.check("Bounding Solid rows: Objects, Type, Orientation, Offset Mode, Side/Top/Bottom Offset, Round Up to Nearest", ["Objects", "Type", "Orientation", "Offset Mode", "Side Offset", "Top Offset", "Bottom Offset", "Round Up to Nearest"].every((l) => labels.includes(l)), labels.join("|"));
    await t.fill(sel("StockModelCommand", "side"), "2 mm");
    await t.fill(sel("StockModelCommand", "top"), "1 mm");
    await pickOption(t, "StockModelCommand", "originMode", "box");
    await t.settle(400);
    const corner = await t.canvasXY([22, 12, 11]);
    await t.canvasClick(corner.x, corner.y);
    await t.settle(300);
    const bpv = await t.app(() => { const d = window.app.ui.dialog.current; return { bp: d.values.boxPoint, rigid: d.values.rigid, text: (document.querySelector('.dlg[data-dialog="StockModelCommand"] [data-row="boxPointText"]') || {}).innerText }; });
    t.check("box point marker clicked (top back right), Rigid Group on by default", bpv.bp && bpv.bp.join() === "2,2,2" && bpv.rigid === true && /Top back right/.test(bpv.text || ""), JSON.stringify(bpv));
    await t.shot("bounding-dialog");
    t.check("Bounding Solid OK", await okDialog(t, "StockModelCommand"));
    const bs = await last(t, "boundingsolid");
    const wcs = await t.app((id) => (window.app.featureResult(id) || {}).wcs, bs && bs.id);
    t.check("bounding solid coordinate system origin at the picked box point (22, 12, 11)", wcs && near(wcs.o[0], 22, 1e-3) && near(wcs.o[1], 12, 1e-3) && near(wcs.o[2], 11, 1e-3) && bs.f.rigidGroup === true, JSON.stringify(wcs));
    const bsV = bs && (await volume(t, bs.body));
    const bsOcc = await t.app((id) => { const st = window.app.result.state; return !!(st.bodyOcc && st.bodyOcc.get(id)); }, bs && bs.body);
    t.check("the bounding solid is a new component (its body belongs to an occurrence)", bsOcc);
    t.check("bounding solid 44 x 24 x 11 = 11616 mm^3", bs && bs.ok && bs.tl && bs.icon && near(bsV, 11616, 1), JSON.stringify({ bs: bs && { ok: bs.ok, err: bs.error, tl: bs.tl }, bsV }));

    t.step("Edit Feature: Relative size cylinder about Z");
    await t.app((id) => window.app.editFeature(id), bs.id);
    t.check("Edit Feature reopens Bounding Solid", await t.waitFor(`.dlg[data-dialog="StockModelCommand"][data-edit="${bs.id}"]`, { timeout: 3000 }));
    await pickOption(t, "StockModelCommand", "bsType", "relCyl");
    await okDialog(t, "StockModelCommand");
    const bcV = await volume(t, bs.body);
    t.check("edited to a cylinder around the box (r = 22.36, h = 10)", near(bcV, Math.PI * 500 * 10, 2), fmt(bcV));
    t.step("Edit Feature: Relative size box oriented to the coordinate system (pick the triad)");
    await t.app((id) => window.app.editFeature(id), bs.id);
    await t.waitFor(`.dlg[data-dialog="StockModelCommand"][data-edit="${bs.id}"]`, { timeout: 3000 });
    await pickOption(t, "StockModelCommand", "bsType", "relBox");
    await pickOption(t, "StockModelCommand", "orient", "csys");
    const tri = await clickAt(t, [csF.o], "h && h.ref && h.ref.kind === 'feature'");
    t.check("coordinate system triad picked into the Coordinate System row", !!tri && (await t.app(() => (window.app.ui.dialog.current.values.csys || []).length === 1)));
    await okDialog(t, "StockModelCommand");
    const brV = await volume(t, bs.body);
    t.check("box aligned to the 30 deg coordinate system (48.64 x 41.32 x 11)", near(brV, (40 * Math.cos(Math.PI / 6) + 14) * (20 + 20 * Math.cos(Math.PI / 6) + 4) * 11, 3), fmt(brV));
    await t.app((id) => { const a = window.app; a.mutate("hide", (doc) => { doc.bodies[id].visible = false; }); }, bs.body);

    t.step("Rigid Group: moving the component of the selected body moves the bounding solid; Flip Z Axis");
    const rg = await t.app(() => {
      const a = window.app, C = a.components;
      const b = a.addFeature({ type: "box", length: "10 mm", width: "10 mm", height: "6 mm", center: [0, -140], operation: "new", plane: { kind: "origin", name: "XY" } }).newBody;
      C.createFromBodies([b]);
      const f = a.addFeature({ type: "boundingsolid", operation: "newComponent", bodies: [b], bsType: "relBox", orient: "model", offMode: "none", flipZ: true, originMode: "box", boxPoint: [1, 1, 0], rigidGroup: true });
      const w = a.featureResult(f.id).wcs;
      const occ = C.ownerOf(b), T0 = C.transform(f.newOcc);
      C.setTransform(occ, [1, 0, 0, 30, 0, 1, 0, 0, 0, 0, 1, 0]);
      const T1 = C.transform(f.newOcc);
      const out = { z: w.z, o: w.o, dx: T1[3] - T0[3], min: a.bodyInfo(f.newBody).bbox.min };
      C.revert && C.revert();
      return out;
    });
    t.check("Flip Z Axis turns the coordinate system (z down, origin on the top centre)", near(rg.z[2], -1, 1e-6) && near(rg.o[2], 6, 1e-6), JSON.stringify(rg));
    t.check("the rigid group moves the bounding solid with the component (+30 mm)", near(rg.dx, 30, 1e-6) && near(rg.min[0], 25, 1e-3), JSON.stringify(rg));

    // ------------------------------------------------------------ Pattern on Path
    t.step("Pattern on Path: small cube along the front bottom edge of the box, 3 instances");
    const cube = await t.app(() => { const f = window.app.addFeature({ type: "box", length: "4 mm", width: "4 mm", height: "4 mm", center: [-20, -16], operation: "new", plane: { kind: "origin", name: "XY" } }); return f.newBody; });
    t.check("Pattern on Path opens", !!(await openCmd(t, "PatternOnPath", { panel: "SolidCreatePanel", flyout: "Pattern", search: "Pattern on Path" })));
    const ptype0 = await t.app(() => document.querySelector('.dlg[data-dialog="PatternOnPath"] [data-input="patternType"]').dataset.value);
    t.check("Object Type defaults to Features", ptype0 === "features", ptype0);
    await pickOption(t, "PatternOnPath", "patternType", "bodies");
    t.check("cube picked as the object", !!(await clickAt(t, [[-20, -16, 4], [-19, -15, 4], [-21, -17, 2]], `h && h.ref && h.ref.body === '${cube}'`)));
    await t.app(() => window.app.ui.dialog.current.activate("pathSel"));
    const edgeAim = await clickAt(t, [[0, 10, 10], [5, 10, 10], [-5, 10, 10]], "h && h.ref && h.ref.kind === 'edge'");
    t.check("path edge picked", !!edgeAim);
    await t.fill(sel("PatternOnPath", "quantity"), "3");
    await t.click(sel("PatternOnPath", "suppress"));
    await t.settle(500);
    const marks = await t.app(() => (window.app.ui.dialog.current.previewRes || {}).marks || []);
    const m2 = marks.find((m) => m.k === 2);
    if (m2) { const q = await t.canvasXY(m2.p); await t.canvasClick(q.x, q.y); await t.settle(400); }
    const supp = await t.app(() => window.app.ui.dialog.current.values.suppressed);
    t.check("Suppression shows instance markers; clicking instance 2 suppresses it", marks.length === 2 && JSON.stringify(supp) === "[2]", JSON.stringify({ marks: marks.length, supp }));
    await t.shot("pathpattern-dialog");
    t.check("Pattern on Path OK", await okDialog(t, "PatternOnPath"));
    const pp = await last(t, "pathpattern");
    const ppBodies = await t.app((id) => window.app.allBodies().filter((b) => b.id.startsWith(id + "_")).length, pp && pp.id);
    t.check("PathPattern made 1 copy (instance 2 suppressed), timeline item with icon", pp && pp.ok && pp.tl && pp.icon && ppBodies === 1 && JSON.stringify(pp.f.suppressInstances) === "[2]" && /^PathPattern/.test(pp.name), JSON.stringify({ pp: pp && { ok: pp.ok, err: pp.error, name: pp.name, sup: pp.f.suppressInstances }, ppBodies }));

    // ------------------------------------------------------------ Geometric Pattern
    t.step("Geometric Pattern: 4 x 3 cylinders cut through a 5 mm plate");
    const plate = await t.app(() => { const f = window.app.addFeature({ type: "box", length: "60 mm", width: "40 mm", height: "5 mm", center: [0, 60], operation: "new", plane: { kind: "origin", name: "XY" } }); return f.newBody; });
    const pv0 = await volume(t, plate);
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.frames(4);
    t.check("Geometric Pattern opens", !!(await openCmd(t, "FusionPatternGeometricCommand", { panel: "SolidCreatePanel", flyout: "Pattern", search: "Geometric Pattern" })));
    t.check("plate face picked", !!(await clickAt(t, [[3, 63, 5], [-10, 55, 5], [12, 70, 5]], `h && h.ref && h.ref.kind === 'face' && h.ref.body === '${plate}'`)));
    await pickOption(t, "FusionPatternGeometricCommand", "objType", "cylinder");
    await t.fill(sel("FusionPatternGeometricCommand", "uq"), "4");
    await t.fill(sel("FusionPatternGeometricCommand", "vq"), "3");
    await t.fill(sel("FusionPatternGeometricCommand", "size1"), "4 mm");
    await t.fill(sel("FusionPatternGeometricCommand", "size2"), "4 mm");
    await pickOption(t, "FusionPatternGeometricCommand", "extent", "distance");
    await t.fill(sel("FusionPatternGeometricCommand", "depth"), "10 mm");
    await pickOption(t, "FusionPatternGeometricCommand", "operation", "cut");
    await t.shot("geopattern-dialog");
    t.check("Geometric Pattern OK", await okDialog(t, "FusionPatternGeometricCommand"));
    const gp = await last(t, "geopattern");
    const pv1 = await volume(t, plate);
    t.check("G-Pattern cut 12 holes (dV = 12 * pi * 4 * 5)", gp && gp.ok && gp.tl && /^G-Pattern/.test(gp.name) && near(pv0 - pv1, 12 * Math.PI * 4 * 5, 1), JSON.stringify({ gp: gp && { ok: gp.ok, err: gp.error, name: gp.name }, dv: pv0 - pv1 }));

    // ------------------------------------------------------------ Fluid Volume
    t.step("Fluid Volume (S toolbox): cavity of a hollow block");
    const hollow = await t.app(() => {
      const a = window.app;
      const o = a.addFeature({ type: "box", length: "30 mm", width: "30 mm", height: "30 mm", center: [80, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
      const cp = a.addFeature({ type: "cplane", mode: "offset", base: { kind: "origin", name: "XY" }, offset: "5 mm", visible: false });
      const i = a.addFeature({ type: "box", length: "20 mm", width: "20 mm", height: "20 mm", center: [80, 0], operation: "new", plane: { kind: "cplane", id: cp.id } });
      a.addFeature({ type: "combine", target: o.newBody, tools: [i.newBody], operation: "cut", keepTools: false });
      return o.newBody;
    });
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.frames(4);
    t.check("Fluid Volume opens from the toolbox", (await openCmd(t, "EnclosureCommand", { search: "Fluid Volume" })) === "toolbox");
    t.check("hollow block picked", !!(await clickAt(t, [[80, 0, 30], [75, 5, 30], [85, -5, 30]], `h && h.ref && h.ref.body === '${hollow}'`)));
    t.check("Fluid Volume OK", await okDialog(t, "EnclosureCommand"));
    const fv = await last(t, "fluidvolume");
    const fvV = fv && (await volume(t, fv.body));
    t.check("Fluid Volume = 20^3 cavity", fv && fv.ok && fv.tl && near(fvV, 8000, 1), JSON.stringify({ fv: fv && { ok: fv.ok, err: fv.error }, fvV }));

    // ------------------------------------------------------------ Volumetric Lattice
    t.step("Volumetric Lattice (MODIFY): gyroid in a 30 x 30 x 15 block, solidity 0.4");
    const lb = await t.app(() => window.app.addFeature({ type: "box", length: "30 mm", width: "30 mm", height: "15 mm", center: [0, -60], operation: "new", plane: { kind: "origin", name: "XY" } }).newBody);
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.frames(4);
    t.check("Volumetric Lattice opens", !!(await openCmd(t, "VolFieldCreateLatticeCommand", { panel: "SolidModifyPanel", search: "Volumetric Lattice" })));
    t.check("block picked", !!(await clickAt(t, [[0, -60, 15], [5, -55, 15], [-5, -65, 15]], `h && h.ref && h.ref.body === '${lb}'`)));
    await t.click('.dlg[data-dialog="VolFieldCreateLatticeCommand"] .cx-tab[data-tab="density"]');
    await t.fill(sel("VolFieldCreateLatticeCommand", "solidity"), "0.4");
    await t.click('.dlg[data-dialog="VolFieldCreateLatticeCommand"] .cx-tab[data-tab="setup"]');
    await t.click(sel("VolFieldCreateLatticeCommand", "move"));
    await t.fill(sel("VolFieldCreateLatticeCommand", "lrz"), "30 deg");
    await t.click('.dlg[data-dialog="VolFieldCreateLatticeCommand"] .cx-tab[data-tab="offset"]');
    await t.click(sel("VolFieldCreateLatticeCommand", "rAdd"));
    await t.settle(800);
    t.check("region top picked on the lattice preview", !!(await clickAt(t, [[12, -48, 13], [-12, -72, 13], [12, -72, 13], [-12, -48, 13], [13, -60, 14], [-13, -60, 14], [12, -48, 15], [-12, -72, 15]], "h && h.ref && h.ref.kind === 'meshFace'")));
    await t.settle(300);
    const rsel = await t.app(() => (window.app.ui.dialog.current.values.rgeo1 || []).map((r) => r.kind + ":" + (r.n ? r.n.map((x) => Math.round(x)).join(",") : "")));
    t.check("the region holds the top face of the block", rsel.length === 1 && rsel[0] === "face:0,0,1", JSON.stringify(rsel));
    await t.shot("lattice-dialog");
    t.check("Volumetric Lattice OK", await okDialog(t, "VolFieldCreateLatticeCommand"));
    const la = await last(t, "vlattice");
    const laInfo = await t.app((id) => { const a = window.app; return { kind: a.bodyKind(id), info: a.bodyInfo(id) }; }, lb);
    t.check("lattice: transform and one offset region stored", la && la.f.lrz === "30 deg" && (la.f.regions || []).length === 1 && la.f.rt1 !== undefined, JSON.stringify(la && { lrz: la.f.lrz, regions: la.f.regions, rt1: la.f.rt1 }));
    t.check("lattice body is a volumetric model, roughly 30-70 % solid", la && la.ok && la.tl && laInfo.kind === "volumetric" && laInfo.info.triangles > 1000 && laInfo.info.volume > 0.25 * 13500 && laInfo.info.volume < 0.7 * 13500, JSON.stringify({ la: la && { ok: la.ok, err: la.error }, kind: laInfo.kind, v: laInfo.info.volume, tri: laInfo.info.triangles }));

    t.step("Volumetric Lattice with a Custom cell: a 10 x 2 x 2 bar repeated every 10 mm");
    const cb = await t.app(() => {
      const a = window.app;
      const blk = a.addFeature({ type: "box", length: "30 mm", width: "30 mm", height: "15 mm", center: [-60, -60], operation: "new", plane: { kind: "origin", name: "XY" } }).newBody;
      const bar = a.addFeature({ type: "box", length: "10 mm", width: "2 mm", height: "2 mm", center: [-60, -100], operation: "new", plane: { kind: "origin", name: "XY" } }).newBody;
      return { blk, bar };
    });
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.frames(4);
    t.check("Volumetric Lattice opens (custom cell)", !!(await openCmd(t, "VolFieldCreateLatticeCommand", { panel: "SolidModifyPanel", search: "Volumetric Lattice" })));
    t.check("block picked (custom)", !!(await clickAt(t, [[-60, -60, 15], [-55, -55, 15], [-65, -65, 15]], `h && h.ref && h.ref.body === '${cb.blk}'`)));
    await pickOption(t, "VolFieldCreateLatticeCommand", "cell", "custom");
    t.check("cell geometry bar picked", !!(await clickAt(t, [[-60, -100, 2], [-62, -100, 2], [-58, -100, 1]], `h && h.ref && h.ref.body === '${cb.bar}'`)));
    t.check("Volumetric Lattice OK (custom)", await okDialog(t, "VolFieldCreateLatticeCommand"));
    const lc = await last(t, "vlattice");
    const lcV = await volume(t, cb.blk);
    t.check("custom cell lattice from the picked bar geometry (0.4-8 % of the block)", lc && lc.ok && lc.f.cell === "custom" && Object.values(lc.f.cellGeom).reduce((n, l) => n + l.length, 0) === 1 && lcV > 0.004 * 13500 && lcV < 0.08 * 13500, JSON.stringify({ ok: lc && lc.ok, err: lc && lc.error, lcV }));
    await t.app((id) => { const a = window.app; a.mutate("hide", (doc) => { doc.bodies[id].visible = false; }); }, cb.bar);

    // ------------------------------------------------------------ Volumetric Texture
    t.step("Volumetric Texture (S toolbox): Stripe 1 mm on the top face of a block");
    const tb = await t.app(() => window.app.addFeature({ type: "box", length: "30 mm", width: "30 mm", height: "15 mm", center: [80, -60], operation: "new", plane: { kind: "origin", name: "XY" } }).newBody);
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.frames(4);
    t.check("Volumetric Texture opens from the toolbox", (await openCmd(t, "VolFieldTextureCommand", { search: "Volumetric Texture" })) === "toolbox");
    t.check("top face picked", !!(await clickAt(t, [[80, -60, 15], [85, -55, 15], [75, -65, 15]], `h && h.ref && h.ref.kind === 'face' && h.ref.body === '${tb}'`)));
    await pickOption(t, "VolFieldTextureCommand", "pattern", "stripe");
    await t.click('.dlg[data-dialog="VolFieldTextureCommand"] .cx-tab[data-tab="clearances"]');
    await t.click(sel("VolFieldTextureCommand", "cAdd"));
    await t.settle(800);
    t.check("clearance picked on the +X side of the preview", !!(await clickAt(t, [[95, -60, 7], [95, -55, 10], [95, -65, 5], [95, -60, 12]], "h && h.ref && h.ref.kind === 'meshFace'")));
    await t.fill(sel("VolFieldTextureCommand", "ct1"), "8 mm");
    t.check("Volumetric Texture OK", await okDialog(t, "VolFieldTextureCommand"));
    const tx = await last(t, "vtexture");
    const txInfo = await t.app((id) => { const a = window.app; return { kind: a.bodyKind(id), v: (a.bodyInfo(id) || {}).volume }; }, tb);
    t.check("texture with one clearance region (+X face, 8 mm)", tx && (tx.f.regions || []).length === 1 && (tx.f.regions[0].faces || []).length === 1 && tx.f.ct1 === "8 mm", JSON.stringify(tx && { regions: tx.f.regions, ct1: tx.f.ct1 }));
    t.check("texture carved the top face (volume between 13500 - 900 and 13500)", tx && tx.ok && txInfo.kind === "volumetric" && txInfo.v < 13500 - 50 && txInfo.v > 13500 - 950, JSON.stringify({ tx: tx && { ok: tx.ok, err: tx.error }, txInfo }));
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.frames(4);
    await t.shot("all-features");

    // ------------------------------------------------------------ undo / redo
    t.step("undo / redo the texture");
    await t.blur();
    await t.key("Control+z");
    await t.settle(300);
    const undone = await t.app((id) => ({ kind: window.app.bodyKind(id), has: window.app.doc.features.some((f) => f.type === "vtexture") }), tb);
    t.check("Ctrl+Z removes the texture (body is a solid again)", !undone.has && undone.kind === "solid", JSON.stringify(undone));
    await t.key("Control+y");
    await t.settle(300);
    const redone = await t.app((id) => ({ kind: window.app.bodyKind(id), has: window.app.doc.features.some((f) => f.type === "vtexture") }), tb);
    t.check("Ctrl+Y restores it", redone.has && redone.kind === "volumetric", JSON.stringify(redone));

    // ------------------------------------------------------------ save / open
    t.step("save / open round trip (document JSON)");
    const rt = await t.app(() => {
      const a = window.app;
      const types = ["csys", "boundingsolid", "pathpattern", "geopattern", "fluidvolume", "vlattice", "vtexture"];
      const snap = () => types.map((ty) => { const f = a.doc.features.find((x) => x.type === ty); const r = f && a.featureResult(f.id); const b = f && (f.newBody || f.body); return { ty, ok: !!(r && r.ok), v: b && a.bodyInfo(b) ? Math.round(a.bodyInfo(b).volume) : null }; });
      const before = snap();
      const json = JSON.stringify(a.doc);
      a.newDocument("tmp");
      a.loadDocument(JSON.parse(json));
      const after = snap();
      return { before, after };
    });
    const same = rt.before.every((b, i) => b.ok && rt.after[i].ok && (b.v === null || Math.abs(b.v - rt.after[i].v) <= Math.max(2, Math.abs(b.v) * 0.002)));
    t.check("every createx feature recomputes with the same volumes after open", same, JSON.stringify(rt));
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
