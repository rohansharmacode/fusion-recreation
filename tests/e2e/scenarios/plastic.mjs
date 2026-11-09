// PLASTIC tab through the real UI: toolbar placement, Manage Plastic Rules (library -> design, edit a design rule,
// rule details), Assign Plastic Rule (root component, physical material), Rib, Web, Emboss (planar + wrapped on a
// cylinder), Boss, Lip (Lip And Groove), Rest and Snap Fit dialogs (selection on the canvas, OK, results), Edit
// Feature from the timeline, rule edits flowing into rule-linked features, undo / redo and a save / open round trip.
import { defineScenario, mainIfDirect } from "../lib.mjs";

const scenario = defineScenario({
  name: "plastic",
  title: "Plastic tab: rules, Rib, Web, Emboss, Boss, Lip, Rest, Snap Fit",
  timeout: 300000,
  async run(t) {
    const dlg = (id) => `.dlg[data-dialog="${id}"]`;
    const ok = async (id) => { await t.click(`${dlg(id)} [data-action="ok"]`); return t.waitFor((id) => !document.querySelector(`.dlg[data-dialog="${id}"]`), { arg: id, timeout: 20000 }); };
    const vol = (id) => t.app((id) => { const b = window.app.body(id); return b ? window.app.K.R.measureVolume(b.shape) : NaN; }, id);
    const feat = (type) => t.app((type) => { const f = [...window.app.doc.features].reverse().find((x) => x.type === type); if (!f) return null; const r = window.app.featureResult(f.id) || {}; return { id: f.id, name: f.name, ok: r.ok !== false && !r.error, error: r.error, warning: r.warning, f: JSON.parse(JSON.stringify(f)) }; }, type);
    /** Start a command from the PLASTIC tab: its toolbar button, else the CREATE panel dropdown. */
    const start = async (id) => {
      if (await t.click(`#toolbar [data-cmd="${id}"]`, { timeout: 600 })) return "button";
      await t.click('[data-panel="PlasticPartsCreatePanel"]');
      await t.settle(150);
      if (await t.click(`#overlay [data-cmd="${id}"]`, { timeout: 1500 })) return "dropdown";
      await t.app((id) => window.app.commands.run(id), id);
      return "api";
    };
    /** Pick a ref on the canvas (aim at candidate world points) or through the dialog API. */
    const pick = async (row, points, pred, ref) => {
      const a = await t.aim(points, pred);
      if (a) { await t.canvasClick(a.x, a.y); await t.frames(3); return "canvas"; }
      await t.app(([row, ref]) => window.app.ui.dialog.current.pickRef(row, ref), [row, ref]);
      return "api";
    };
    const setVal = async (id, input, text) => { await t.fill(`${dlg(id)} [data-input="${input}"]`, text); await t.key("Tab"); await t.settle(250); };

    t.step("setup: two shelled boxes (lower open top, upper open bottom) and the sketches (App API)");
    const S = await t.app(() => {
      const a = window.app, S = a.S;
      const box = (z, open) => {
        const b = a.addFeature({ type: "box", length: "60 mm", width: "40 mm", height: "20 mm", center: [0, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
        if (z) a.addFeature({ type: "move", bodies: [b.newBody], tx: "0 mm", ty: "0 mm", tz: `${z} mm`, rx: "0 deg", ry: "0 deg", rz: "0 deg" });
        a.addFeature({ type: "shell", faces: [{ body: b.newBody, p: [5, 3, open === "top" ? z + 20 : z], n: [0, 0, open === "top" ? 1 : -1] }], thickness: "2 mm", direction: "inside" });
        return b.newBody;
      };
      const lower = box(0, "top"), upper = box(20, "bottom");
      const sketch = (plane, fill) => { const sk = S.newSketch(); const out = fill(sk); const f = a.addFeature({ type: "sketch", plane, planeRef: { kind: "origin", name: "XY" }, sk }); return { id: f.id, ...out }; };
      const XY = (z) => ({ o: [0, 0, z], x: [1, 0, 0], n: [0, 0, 1] });
      const rib = sketch({ o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] }, (sk) => ({ line: S.addLine(sk, S.addPoint(sk, -20, 10), S.addPoint(sk, 20, 10)) }));
      const web = sketch(XY(16), (sk) => ({ line: S.addLine(sk, S.addPoint(sk, -10, -10), S.addPoint(sk, -10, 10)) }));
      const emb = sketch({ o: [0, -20, 0], x: [1, 0, 0], n: [0, -1, 0] }, (sk) => { const c = S.addPoint(sk, 10, 10); S.addCircle(sk, c, 4); return {}; });
      const pts = sketch(XY(20), (sk) => { const p = S.addPoint(sk, 10, 5); S.addSketchPoint(sk, p); const q = S.addPoint(sk, 27.5, 0); S.addSketchPoint(sk, q); return { boss: p, snap: q }; });
      const rest = sketch(XY(39), (sk) => { S.addRect2pt(sk, [-15, -8], [-3, 8]); return {}; });
      return { lower, upper, rib, web, emb, pts, rest };
    });
    t.require("two bodies", (await t.state()).bodies.length === 2);

    // ------------------------------------------------------------------ toolbar
    t.step("PLASTIC tab: the plastic commands are real buttons");
    t.require("PLASTIC tab", await t.click('[data-tab="PlasticTab"]'));
    await t.settle(150);
    const ids = ["FusionAssignPlasticRuleCommand", "FusionManagePlasticRuleCommand", "FusionWebCommand", "FusionRibCommand", "FusionBossCommand", "FusionSnapFitCommand", "FusionLipCommand", "FusionRestCommand", "EmbossCmd"];
    const real = await t.app((ids) => ids.filter((id) => { const c = window.app.commands.get(id); return !c || c.stub; }), ids);
    t.check("no plastic command is a stub", real.length === 0, real.join(", "));
    const onBar = await t.app(() => ["FusionAssignPlasticRuleCommand", "FusionRibCommand", "FusionBossCommand"].filter((id) => ![...document.querySelectorAll(`#toolbar [data-cmd="${id}"]`)].some((e) => e.offsetParent)));
    t.check("toolbar buttons visible on the PLASTIC tab", onBar.length === 0, onBar.join(", "));
    await t.click('[data-panel="PlasticPartsCreatePanel"]');
    await t.settle(200);
    const inMenu = await t.app(() => ["FusionRibCommand", "FusionWebCommand", "EmbossCmd", "FusionBossCommand", "FusionSnapFitCommand", "FusionLipCommand", "FusionRestCommand"].filter((id) => ![...document.querySelectorAll(`#overlay [data-cmd="${id}"]`)].some((e) => e.offsetParent)));
    t.check("CREATE dropdown lists every plastic feature", inMenu.length === 0, inMenu.join(", "));
    await t.key("Escape");

    // ------------------------------------------------------------------ Manage Plastic Rules
    t.step("Manage Plastic Rules: copy ABS (2mm) from the library into the design, edit it");
    await t.click('#toolbar [data-cmd="FusionManagePlasticRuleCommand"]');
    t.require("Manage Plastic Rules modal", await t.waitFor('[data-dialog="FusionManagePlasticRuleCommand"]'));
    const libNames = await t.app(() => [...document.querySelectorAll('[data-dialog="FusionManagePlasticRuleCommand"] .pl-rule[data-sec="library"] .pl-rule-name')].map((e) => e.textContent));
    t.check("library lists the default rules", libNames.includes("ABS (1.5mm)") && libNames.includes("ABS (2mm)") && libNames.length >= 6, libNames.join(", "));
    await t.click('.pl-rule[data-sec="library"][data-rule="lib-abs-2"]');
    const det = await t.app(() => document.querySelector(".pl-mpr-details").innerText);
    t.check("rule details show material and thickness", /ABS Plastic/.test(det) && /2\.00 mm/.test(det), det.slice(0, 120));
    await t.click('.pl-rule[data-sec="library"][data-rule="lib-abs-2"] [data-act="copy"]');
    await t.settle(200);
    t.check("rule copied into the design", await t.app(() => (window.app.doc.plastic.rules || []).some((r) => r.name === "ABS (2mm)")));
    await t.click('.pl-rule[data-sec="design"][data-rule="lib-abs-2"] [data-act="edit"]');
    t.require("Edit Plastic Rule modal", await t.waitFor('[data-dialog="PlasticRuleEdit"]'));
    await t.fill('[data-dialog="PlasticRuleEdit"] [data-input="thickness"]', "2.5 mm");
    await t.settle(100);
    await t.click('[data-dialog="PlasticRuleEdit"] [data-action="ok"]');
    await t.settle(200);
    t.check("design rule thickness edited", await t.app(() => window.app.doc.plastic.rules.find((r) => r.id === "lib-abs-2").thickness === "2.5 mm"));
    await t.click('[data-dialog="FusionManagePlasticRuleCommand"] [data-action="ok"]');
    t.check("modal closed", await t.waitFor(() => !document.querySelector('[data-dialog="FusionManagePlasticRuleCommand"]')));

    // ------------------------------------------------------------------ Assign Plastic Rule
    t.step("Assign Plastic Rule: ABS (2mm) to the root component");
    await t.click('#toolbar [data-cmd="FusionAssignPlasticRuleCommand"]');
    t.require("Assign dialog", await t.waitFor(dlg("FusionAssignPlasticRuleCommand")));
    await t.app(() => { const d = window.app.ui.dialog.current; d.set("rule", "lib-abs-2", { user: true }); });
    await t.settle(150);
    const asg = await t.app(() => document.querySelector(".pl-assign-det").innerText);
    t.check("dialog shows the rule details", /2\.50 mm/.test(asg), asg.slice(0, 80));
    await ok("FusionAssignPlasticRuleCommand");
    const as = await t.app((S) => ({ a: window.app.doc.plastic.assign.root, m: window.app.doc.bodies[S.lower].material }), S);
    t.check("rule assigned and material set", as.a === "lib-abs-2" && as.m === "abs-plastic", JSON.stringify(as));

    // ------------------------------------------------------------------ Rib
    t.step("Rib: pick the open line inside the lower box, OK");
    let v0 = await vol(S.lower);
    await t.setView("front");
    await start("FusionRibCommand");
    t.require("Rib dialog", await t.waitFor(dlg("FusionRibCommand")));
    const ribTh = await t.app(() => window.app.ui.dialog.current.values.thickness);
    t.check("rib thickness from the rule (0.6 x 2.5 mm)", ribTh === "1.50 mm", ribTh);
    const how = await pick("curves", [[0, 0, 10], [5, 0, 10], [-7, 0, 10]], "h && h.ref && h.ref.kind === 'sketchCurve'", { kind: "sketchCurve", sketch: S.rib.id, curve: S.rib.line });
    t.note(`rib profile picked through the ${how}`);
    await t.waitFor(() => { const d = window.app.ui.dialog.current; return d && d.previewRes && d.previewRes.ok; }, { timeout: 15000 });
    t.check("rib OK", await ok("FusionRibCommand"));
    let r = await feat("rib");
    let dv = (await vol(S.lower)) - v0;
    t.check("rib feature evaluates and adds about 56 x 8 x 1.5 mm (drafted, filleted)", r && r.ok && dv > 56 * 8 * 1.5 * 0.85 && dv < 56 * 8 * 1.5 * 1.15, JSON.stringify({ dv, err: r && r.error, w: r && r.warning }));
    t.check("rib in the timeline", await t.visible(`[data-feature="${r.id}"]`));
    t.check("rib is rule-linked", (r.f.ruleFields || []).includes("thickness"), JSON.stringify(r.f.ruleFields));

    t.step("Undo / redo the rib");
    await t.key("Control+z"); await t.settle(400);
    t.check("undo removes the rib", !(await feat("rib")));
    await t.key("Control+y"); await t.settle(600);
    t.check("redo restores it", !!(await feat("rib")));

    t.step("Edit Feature (timeline double-click): Distance 4 mm");
    await t.dblclick(`[data-feature="${r.id}"]`);
    t.require("edit dialog", await t.waitFor(`${dlg("FusionRibCommand")}[data-edit="${r.id}"]`));
    await t.app(() => window.app.ui.dialog.current.set("extent", "distance", { user: true }));
    await setVal("FusionRibCommand", "depth", "4");
    t.check("edit OK", await ok("FusionRibCommand"));
    r = await feat("rib");
    dv = (await vol(S.lower)) - v0;
    t.check("rib now 4 mm deep", r.ok && r.f.extent === "distance" && dv > 56 * 4 * 1.5 * 0.85 && dv < 56 * 4 * 1.5 * 1.2, JSON.stringify({ dv }));

    // ------------------------------------------------------------------ Web
    t.step("Web: line on the rim plane, down to the floor");
    v0 = await vol(S.lower);
    await t.setView("top");
    await t.click('[data-tab="PlasticTab"]');
    await start("FusionWebCommand");
    t.require("Web dialog", await t.waitFor(dlg("FusionWebCommand")));
    await pick("curves", [[-10, 0, 16], [-10, 4, 16], [-10, -4, 16]], "h && h.ref && h.ref.kind === 'sketchCurve'", { kind: "sketchCurve", sketch: S.web.id, curve: S.web.line });
    await t.waitFor(() => { const d = window.app.ui.dialog.current; return d && d.previewRes && d.previewRes.ok; }, { timeout: 15000 });
    t.check("web OK", await ok("FusionWebCommand"));
    r = await feat("web");
    dv = (await vol(S.lower)) - v0;
    t.check("web adds about 36 x 14 x 1.5 mm (drafted)", r && r.ok && dv > 36 * 14 * 1.5 * 0.75 && dv < 36 * 14 * 1.5 * 1.15, JSON.stringify({ dv, err: r && r.error }));

    // ------------------------------------------------------------------ Emboss
    t.step("Emboss: circle onto the front face of the lower box");
    v0 = await vol(S.lower);
    await t.setView("front");
    await start("EmbossCmd");
    t.require("Emboss dialog", await t.waitFor(dlg("EmbossCmd")));
    await t.app((S) => window.app.ui.dialog.current.pickRef("profiles", (() => { const s = window.app.sketchState(S.emb.id); const g = s.regions.regions[0]; return { kind: "profile", sketch: S.emb.id, key: g.key, c: [10, 10] }; })()), S);
    await t.settle(150);
    await t.app(() => window.app.ui.dialog.current.activate("faces"));
    await pick("faces", [[-20, -20, 5], [20, -20, 15], [-15, -20, 12]], "h && h.ref && h.ref.kind === 'face'", { kind: "face", body: S.lower, p: [-20, -20, 5], n: [0, -1, 0], planar: true });
    await setVal("EmbossCmd", "depth", "0.8");
    await t.waitFor(() => { const d = window.app.ui.dialog.current; return d && d.previewRes && d.previewRes.ok; }, { timeout: 15000 });
    t.check("emboss OK", await ok("EmbossCmd"));
    r = await feat("emboss");
    dv = (await vol(S.lower)) - v0;
    t.check("emboss adds pi x 16 x 0.8", r && r.ok && Math.abs(dv - Math.PI * 16 * 0.8) < 1, JSON.stringify({ dv, err: r && r.error }));

    // ------------------------------------------------------------------ Boss
    t.step("Boss: sketch point between the two bodies");
    const vb0 = [await vol(S.lower), await vol(S.upper)];
    await start("FusionBossCommand");
    t.require("Boss dialog", await t.waitFor(dlg("FusionBossCommand")));
    await t.app((S) => window.app.ui.dialog.current.pickRef("points", { kind: "sketchPoint", sketch: S.pts.id, point: S.pts.boss }), S);
    await t.app(() => window.app.ui.dialog.current.set("s1Type", "counterbore", { user: true }));
    await t.waitFor(() => { const d = window.app.ui.dialog.current; return d && d.previewRes && d.previewRes.ok; }, { timeout: 20000 });
    t.check("boss schematic shown", await t.visible(`${dlg("FusionBossCommand")} .pl-pic svg`));
    t.check("boss OK", await ok("FusionBossCommand"));
    r = await feat("boss");
    const vb1 = [await vol(S.lower), await vol(S.upper)];
    t.check("boss changes both bodies", r && r.ok && vb1[0] > vb0[0] + 30 && vb1[1] > vb0[1] + 30, JSON.stringify({ d: [vb1[0] - vb0[0], vb1[1] - vb0[1]], err: r && r.error }));

    // ------------------------------------------------------------------ Lip
    t.step("Lip And Groove on the inner rim of the lower box");
    const vl0 = [await vol(S.lower), await vol(S.upper)];
    await start("FusionLipCommand");
    t.require("Lip dialog", await t.waitFor(dlg("FusionLipCommand")));
    await t.app(() => window.app.ui.dialog.current.set("lipType", "both", { user: true }));
    await t.app((S) => { const d = window.app.ui.dialog.current; for (const p of [[0, -18, 20], [28, 0, 20], [0, 18, 20], [-28, 0, 20]]) d.pickRef("edges", { kind: "edge", body: S.lower, p }); }, S);
    await t.waitFor(() => { const d = window.app.ui.dialog.current; return d && d.previewRes && d.previewRes.ok; }, { timeout: 20000 });
    t.check("lip OK", await ok("FusionLipCommand"), JSON.stringify(await t.app(() => { const d = window.app.ui.dialog.current; return d ? { res: d.previewRes && { ok: d.previewRes.ok, error: d.previewRes.error }, edges: (d.values.edges || []).length } : null; })));
    r = await feat("lip");
    const vl1 = [await vol(S.lower), await vol(S.upper)];
    t.check("lip on the lower body, groove in the upper body", r && r.ok && vl1[0] > vl0[0] + 50 && vl1[1] < vl0[1] - 50, JSON.stringify({ d: [vl1[0] - vl0[0], vl1[1] - vl0[1]], err: r && r.error, w: r && r.warning }));

    // ------------------------------------------------------------------ Rest
    t.step("Rest: landing in the top wall of the upper box");
    v0 = await vol(S.upper);
    await start("FusionRestCommand");
    t.require("Rest dialog", await t.waitFor(dlg("FusionRestCommand")));
    await t.app((S) => { const s = window.app.sketchState(S.rest.id); const g = s.regions.regions[0]; window.app.ui.dialog.current.pickRef("profiles", { kind: "profile", sketch: S.rest.id, key: g.key, c: [-9, 0] }); }, S);
    await t.app((S) => { const d = window.app.ui.dialog.current; d.activate("body"); d.pickRef("body", { kind: "body", body: S.upper }); }, S);
    await t.app(() => window.app.ui.dialog.current.set("draft", "0 deg", { user: true }));
    await t.waitFor(() => { const d = window.app.ui.dialog.current; return d && d.previewRes && d.previewRes.ok; }, { timeout: 15000 });
    t.check("rest OK", await ok("FusionRestCommand"));
    r = await feat("rest");
    dv = (await vol(S.upper)) - v0;
    t.check("rest flattens 1 mm and backs it with the plate", r && r.ok && Math.abs(dv) > 1, JSON.stringify({ dv, err: r && r.error }));

    // ------------------------------------------------------------------ Snap Fit
    t.step("Snap Fit: hook on the upper body, groove in the lower wall");
    const vs0 = [await vol(S.lower), await vol(S.upper)];
    await start("FusionSnapFitCommand");
    t.require("Snap Fit dialog", await t.waitFor(dlg("FusionSnapFitCommand")));
    await t.app((S) => window.app.ui.dialog.current.pickRef("points", { kind: "sketchPoint", sketch: S.pts.id, point: S.pts.snap }), S);
    await t.waitFor(() => { const d = window.app.ui.dialog.current; return d && d.previewRes && d.previewRes.ok; }, { timeout: 20000 });
    t.check("snap fit OK", await ok("FusionSnapFitCommand"));
    r = await feat("snapFit");
    const vs1 = [await vol(S.lower), await vol(S.upper)];
    t.check("hook added to the upper body, groove cut in the lower", r && r.ok && vs1[1] > vs0[1] + 10 && vs1[0] < vs0[0], JSON.stringify({ d: [vs1[0] - vs0[0], vs1[1] - vs0[1]], err: r && r.error }));

    // ------------------------------------------------------------------ advanced inputs (Edit Feature)
    const edit = async (id, cmd) => { await t.app((id) => window.app.editFeature(id), id); return t.waitFor(`${dlg(cmd)}[data-edit="${id}"]`); };
    const dset = (vals) => t.app((vals) => { const d = window.app.ui.dialog.current; for (const [k, v] of Object.entries(vals)) d.set(k, v, { user: true }); }, vals);
    const dpick = (row, ref) => t.app(([row, ref]) => { const d = window.app.ui.dialog.current; d.activate(row); d.pickRef(row, ref); }, [row, ref]);
    const settled = () => t.waitFor(() => { const d = window.app.ui.dialog.current; return d && d.previewRes && d.previewRes.ok; }, { timeout: 20000 });

    t.step("Rib: Draft Pull Direction (XY plane) and Flip Pull Direction");
    r = await feat("rib");
    t.require("rib edit dialog", await edit(r.id, "FusionRibCommand"));
    await dset({ draft: "1 deg" });
    t.check("pull direction rows shown with a draft", await t.visible(`${dlg("FusionRibCommand")} [data-input="pull"]`));
    await dpick("pull", { kind: "originPlane", name: "XY" });
    await dset({ flipPull: true });
    await settled();
    t.check("rib OK", await ok("FusionRibCommand"));
    r = await feat("rib");
    t.check("rib keeps the pull direction", r.ok && r.f.pull && r.f.pull.name === "XY" && r.f.flipPull === true, JSON.stringify({ pull: r.f.pull, err: r.error }));

    t.step("Boss: Ribs tab, Web tab, Advanced fillets, Offset Position");
    r = await feat("boss");
    const vbb = [await vol(S.lower), await vol(S.upper)];
    t.require("boss edit dialog", await edit(r.id, "FusionBossCommand"));
    await t.click(`${dlg("FusionBossCommand")} [data-input="tab"] [data-option="ribs"]`);
    await t.settle(100);
    t.check("Ribs tab shows the rib inputs", await t.visible(`${dlg("FusionBossCommand")} [data-input="s1RibN"]`) && !(await t.visible(`${dlg("FusionBossCommand")} [data-input="points"]`)));
    await dset({ s1RibN: "4", s1RibShape: "chamfer", s1RibK: "6 mm", s1RibL: "3 mm", s1RibM: "1.5 mm" });
    await t.click(`${dlg("FusionBossCommand")} [data-input="tab"] [data-option="web"]`);
    await t.settle(100);
    await dset({ s2WebN: "2", s2WebSpacing: "angle", s2WebTotal: "180 deg", s2WebDepth: "4 mm" });
    await t.click(`${dlg("FusionBossCommand")} [data-input="tab"] [data-option="boss"]`);
    await dset({ s1R5: "0.3 mm", s2R3: "0.2 mm", s1A2: "0.5 deg", offsetPos: "-0.3 mm" });
    await settled();
    t.check("boss OK", await ok("FusionBossCommand"));
    r = await feat("boss");
    const vba = [await vol(S.lower), await vol(S.upper)];
    t.check("boss with ribs and webs evaluates and grows", r.ok && r.f.s1RibN === "4" && r.f.s2WebN === "2" && vba[1] > vbb[1] && vba[0] > vbb[0], JSON.stringify({ d: [vba[0] - vbb[0], vba[1] - vbb[1]], err: r.error, w: r.warning }));

    t.step("Lip: Shoulder Width, Reveal Height, Exclude Groove Shoulder, Pull Direction guide");
    r = await feat("lip");
    t.require("lip edit dialog", await edit(r.id, "FusionLipCommand"));
    await dset({ shoulder: "0.3 mm", reveal: "0.3 mm", grooveShoulder: "exclude", guideType: "pull" });
    await dpick("pull", { kind: "originPlane", name: "XY" });
    await settled();
    t.check("lip OK", await ok("FusionLipCommand"));
    r = await feat("lip");
    t.check("lip evaluates with the new inputs", r.ok && r.f.guideType === "pull" && r.f.pull && r.f.grooveShoulder === "exclude" && r.f.shoulder === "0.3 mm", JSON.stringify({ err: r.error, w: r.warning }));

    t.step("Rest: Top Faces, Trim, Side 2 extent To Object");
    r = await feat("rest");
    t.require("rest edit dialog", await edit(r.id, "FusionRestCommand"));
    await dpick("topFaces", { kind: "face", body: S.upper, p: [-9, 0, 40], n: [0, 0, 1] });
    await dset({ extent2: "object" });
    await dpick("object2", { kind: "originPlane", name: "XY" });
    await settled();
    t.check("rest OK", await ok("FusionRestCommand"));
    r = await feat("rest");
    t.check("rest keeps top faces, trim and side 2", r.ok && (r.f.topFaces || []).length === 1 && r.f.trim === true && r.f.extent2 === "object" && r.f.object2 && r.f.object2.name === "XY", JSON.stringify({ err: r.error }));

    t.step("Snap Fit: Aligned rotation, undercut, corner radius, base fillet, Distance extent");
    r = await feat("snapFit");
    t.require("snap fit edit dialog", await edit(r.id, "FusionSnapFitCommand"));
    await dset({ rotationType: "aligned" });
    await dpick("align", { kind: "originPlane", name: "YZ" });
    await dset({ uU: "0.8 mm", uV: "2 mm", uRU: "0.3 mm", gR: "0.3 mm", rootR: "0.3 mm", bottomExtent: "distance", depth: "18 mm" });
    await settled();
    t.check("snap fit OK", await ok("FusionSnapFitCommand"));
    r = await feat("snapFit");
    t.check("snap fit evaluates with the new inputs", r.ok && r.f.rotationType === "aligned" && r.f.align && r.f.bottomExtent === "distance" && r.f.uU === "0.8 mm", JSON.stringify({ err: r.error, w: r.warning }));
    await t.app(() => window.app.ui.dialog.current && window.app.ui.dialog.current.cancel());
    await start("FusionSnapFitCommand");
    t.require("snap fit dialog", await t.waitFor(dlg("FusionSnapFitCommand")));
    await dset({ selectMode: "auto" });
    await dpick("autoSketch", { kind: "sketchPoint", sketch: S.pts.id, point: S.pts.snap });
    await dset({ rotationType: "independent" });
    await t.settle(200);
    const nRot = await t.app(() => document.querySelectorAll('.dlg[data-dialog="FusionSnapFitCommand"] .pl-rot-row input').length);
    t.check("Automatic mode takes every sketch point; one rotation box per snap fit", nRot === 2, String(nRot));
    await t.app(() => window.app.ui.dialog.current.cancel());

    // ------------------------------------------------------------------ rule edit flows into linked features
    t.step("Editing the assigned rule updates rule-linked features");
    const webTh0 = (await feat("web")).f.thickness;
    await t.app(() => {
      // same path as Manage Plastic Rules > Edit (the modal's OK)
      const a = window.app, RU = a.ui.plastic.rules;
      a.mutate("Edit Plastic Rule", (doc) => { const r = doc.plastic.rules.find((x) => x.id === "lib-abs-2"); r.thickness = "3 mm"; RU.rederive(doc, r.id); });
    });
    await t.settle(500);
    const web2 = await feat("web");
    t.check("web thickness follows the rule (0.6 x 3 mm)", webTh0 === "1.50 mm" && web2.f.thickness === "1.80 mm" && web2.ok, `${webTh0} -> ${web2.f.thickness}`);

    // ------------------------------------------------------------------ save / open
    t.step("Save / open round trip");
    const before = await t.app(() => window.app.bodies().map((b) => Math.round(window.app.K.R.measureVolume(b.shape) * 100) / 100));
    const reopened = await t.app(() => { const a = window.app; const json = JSON.stringify(a.doc); a.loadDocument(JSON.parse(json)); return { types: a.doc.features.map((f) => f.type), bad: a.doc.features.filter((f) => (a.featureResult(f.id) || {}).ok === false).map((f) => `${f.name}: ${(a.featureResult(f.id) || {}).error}`), vols: a.bodies().map((b) => Math.round(a.K.R.measureVolume(b.shape) * 100) / 100), rules: (a.doc.plastic.rules || []).length }; });
    t.check("all plastic features evaluate after reopening", reopened.bad.length === 0 && ["rib", "web", "emboss", "boss", "lip", "rest", "snapFit"].every((x) => reopened.types.includes(x)), reopened.bad.join("; "));
    t.check("volumes unchanged and rules kept", JSON.stringify(before) === JSON.stringify(reopened.vols) && reopened.rules === 1, `${before} vs ${reopened.vols}`);

    // ------------------------------------------------------------------ rule of a component
    t.step("Assign Plastic Rule to a component (Create Components from Bodies), picked by its body");
    const occ = await t.app((S) => { const C = window.app.components; if (!C || typeof C.createFromBodies !== "function") return null; const r = C.createFromBodies([S.upper]); return Array.isArray(r) ? r[0] : r || null; }, S);
    if (!occ) t.note("no components module: component assignment skipped");
    else {
      const ub = await t.app((occ) => window.app.components.bodiesOf(occ).map((b) => (typeof b === "string" ? b : b.id))[0], occ);
      await t.click('[data-tab="PlasticTab"]');
      await t.click('#toolbar [data-cmd="FusionAssignPlasticRuleCommand"]');
      t.require("Assign dialog", await t.waitFor(dlg("FusionAssignPlasticRuleCommand")));
      await t.app((ub) => { const d = window.app.ui.dialog.current; d.activate("component"); d.pickRef("component", { kind: "body", body: ub }); d.set("rule", "lib-pp-1-5", { user: true }); }, ub);
      await t.settle(150);
      await ok("FusionAssignPlasticRuleCommand");
      const ca = await t.app(([occ, ub]) => { const a = window.app; const cid = a.components.info(occ).component; return { cid, rule: a.doc.plastic.assign[cid], root: a.doc.plastic.assign.root, mat: a.doc.bodies[ub].material }; }, [occ, ub]);
      t.check("component has its own rule and material", ca.rule === "lib-pp-1-5" && ca.root === "lib-abs-2" && ca.mat === "polypropylene", JSON.stringify(ca));
    }
    await t.shot("plastic-final");
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
