// UTILITIES / MANAGE / AUTOMATION / SELECT tools (manage module) through the real UI: toolbar placement,
// Fusion Manage item numbers, Quick Release, change orders (workflow, undo / redo), tasks (New Task dialog,
// Related Tasks, task board), selection tools (Select by Name / Size / Boundary, Seed and Boundary, Invert,
// Selection Filters), Design Advice, Find Features, Navigator, Generate Timeline, Compute Unresolved,
// Scripts and Add-Ins (create, edit, run, undo, add-in start / stop, run on startup), Fusion API and
// Marketplace links, and a save / open (document JSON) round trip.
import { defineScenario, mainIfDirect, fmt } from "../lib.mjs";

const SCRIPT = `function run(context) {
    const app = adsk.core.Application.get();
    const design = adsk.fusion.Design.cast(app.activeProduct);
    const root = design.rootComponent;
    design.userParameters.add("qaw", adsk.core.ValueInput.createByString("30 mm"), "mm", "QA width");
    const sk = root.sketches.add(root.xZConstructionPlane);
    sk.sketchCurves.sketchCircles.addByCenterRadius(adsk.core.Point3D.create(0, 8, 0), 1);
    const ext = root.features.extrudeFeatures.addSimple(sk.profiles.item(0), adsk.core.ValueInput.createByString("qaw"), adsk.fusion.FeatureOperations.NewBodyFeatureOperation);
    ext.name = "QA Rod";
}`;

const scenario = defineScenario({
  name: "manage",
  title: "Utilities / Manage / Automation / Select tools",
  timeout: 280000,
  async run(t) {
    const cmd = (id, ctx) => t.app(([id, ctx]) => window.app.commands.run(id, ctx), [id, ctx]);
    const pim = () => t.app(() => { const i = window.app.doc.pim && window.app.doc.pim.items.root; return i ? { n: i.itemNumber, l: i.lifecycle, r: i.revision, co: i.changeOrder } : null; });
    const okDlg = async (id) => t.click(`.dlg[data-dialog="${id}"] [data-action="ok"], [data-dialog="${id}"] .mn-foot [data-action="ok"]`);

    t.step("setup: Box1 60x40x20 shelled to 0.4 mm and Cylinder1 (through the App API)");
    const ids = await t.app(() => {
      const a = window.app;
      const box = a.addFeature({ type: "box", length: "60 mm", width: "40 mm", height: "20 mm", center: [0, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
      a.addFeature({ type: "cylinder", diameter: "10 mm", height: "30 mm", center: [60, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
      return { box: box.newBody, cyl: a.bodies().map((b) => b.id).find((id) => id !== box.newBody) };
    });
    t.require("two bodies", (await t.state()).bodies.length === 2);

    // ------------------------------------------------------------------ toolbar placement
    t.step("MANAGE tab shows the PIM and task commands as real (not stub) buttons");
    t.require("MANAGE tab", await t.click('[data-tab="ManageTab"]'));
    await t.settle(150);
    const tb = await t.app(() => ["PIMAssignItemNumberCmd", "PIMQuickReleaseCmd", "PIMGoToDashboardCmd", "TaskManagementCreateTaskCmd"].map((id) => {
      const b = [...document.querySelectorAll(`#toolbar [data-cmd="${id}"]`)].find((e) => e.offsetParent);
      const c = window.app.commands.get(id);
      return !!b && !!c && !c.stub;
    }));
    t.check("toolbar buttons present and real", tb.every(Boolean), JSON.stringify(tb));
    const stubs = await t.app(() => ["ScriptsManagerCommand", "APIHelpCommand", "ExchangeAppStoreCommand", "DesignAdviceCmd", "FusionFindFeaturesCommand", "GraphViewCmd", "TimelineBuilderCommand", "FusionComputeUnresolvedCommand", "SelectByNameCommand", "FusionSelectBodiesBySizeCommand", "SelectByBoundaryCommand", "FusionSelectSeedAndBoundaryFacesCommand", "SelectByInvertCommand", "SelectionFilterCommand", "PIMAssignItemNumberCmd", "PIMQuickReleaseCmd", "PIMECOReleaseCmd", "PIMGoToDashboardCmd", "PIMGoToItemDetailsCmd", "PIMGoToChangeOrderCmd", "TaskManagementCreateTaskCmd", "TaskManagementRelatedTasksCmd", "TaskManagementOpenTasksCmd"].filter((id) => { const c = window.app.commands.get(id); return !c || c.stub; }));
    t.check("no manage command is a stub", stubs.length === 0, stubs.join(", "));

    // ------------------------------------------------------------------ Fusion Manage
    t.step("Assign Item Number from the toolbar");
    await t.click('#toolbar [data-cmd="PIMAssignItemNumberCmd"]');
    t.check("Assign Item Number dialog", await t.waitFor('[data-dialog="PIMAssignItemNumberCmd"]'));
    await okDlg("PIMAssignItemNumberCmd");
    let p = await pim();
    t.check("item number assigned, Unreleased", p && /^ITM-\d{6}$/.test(p.n) && p.l === "Unreleased" && p.r === "-", JSON.stringify(p));

    t.step("Quick Release twice: Pre Release 1, then 2");
    for (let i = 0; i < 2; i++) {
      await t.click('#toolbar [data-cmd="PIMQuickReleaseCmd"]');
      await t.waitFor('[data-dialog="PIMQuickReleaseCmd"]');
      await okDlg("PIMQuickReleaseCmd");
      await t.settle(80);
    }
    p = await pim();
    t.check("Pre Release revision 2", p && p.l === "Pre Release" && p.r === "2", JSON.stringify(p));

    t.step("Release with Change Order, submit and approve in the Change Orders view");
    await t.click('#toolbar [data-cmd="PIMECOReleaseCmd"]');
    await t.waitFor('[data-dialog="PIMECOReleaseCmd"]');
    await t.fill('[data-dialog="PIMECOReleaseCmd"] [data-input="title"]', "QA release", { commit: false });
    await okDlg("PIMECOReleaseCmd");
    t.check("change order view opens", await t.waitFor('[data-palette="pim"] [data-co-action="submit"]'));
    p = await pim();
    t.check("item is on the change order", p && /^CO-\d{6}$/.test(p.co), JSON.stringify(p));
    await t.click('[data-palette="pim"] [data-co-action="submit"]');
    await t.click('[data-palette="pim"] [data-co-action="approve"]');
    await t.settle(100);
    p = await pim();
    t.check("released to Production revision A", p && p.l === "Production" && p.r === "A" && !p.co, JSON.stringify(p));
    await t.click('#toolbar [data-cmd="PIMQuickReleaseCmd"]');
    t.check("Quick Release refuses a Production item", await t.app(() => { const b = document.querySelector('[data-dialog="PIMQuickReleaseCmd"] [data-action="ok"]'); return !!b && b.disabled; }));
    await t.click('[data-dialog="PIMQuickReleaseCmd"] [data-action="cancel"]');

    t.step("undo / redo of the release");
    await t.blur(); await t.mouseToCanvas(0.5, 0.5);
    await t.key("Control+z");
    p = await pim();
    t.check("undo: back to Pre Release 2, In Review", p && p.l === "Pre Release" && p.r === "2" && !!p.co, JSON.stringify(p));
    await t.key("Control+y");
    p = await pim();
    t.check("redo: Production A", p && p.l === "Production" && p.r === "A", JSON.stringify(p));

    t.step("Details and Dashboard");
    await t.click('#toolbar [data-cmd="PIMGoToItemDetailsCmd"]');
    await t.settle(100);
    t.check("Details shows the item number and history", await t.app(() => { const pal = document.querySelector('[data-palette="pim"]'); return !!pal && /ITM-\d{6}/.test(pal.querySelector('[data-field="Item Number"]')?.innerText || "") && pal.querySelectorAll(".mg-pim-hrow").length >= 4; }));
    await t.click('#toolbar [data-cmd="PIMGoToDashboardCmd"]');
    await t.settle(100);
    t.check("Dashboard counts one Production item", await t.app(() => (document.querySelector('[data-palette="pim"] [data-tile="Production"] b') || {}).textContent === "1"));
    await t.click('[data-palette="pim"] [data-action="close"]');

    // ------------------------------------------------------------------ tasks
    t.step("New Task related to the selected cylinder");
    await t.app((b) => window.app.selection.set([{ kind: "body", body: b }]), ids.cyl);
    await t.click('#toolbar [data-cmd="TaskManagementCreateTaskCmd"]');
    t.require("New Task dialog", await t.waitFor('.dlg[data-dialog="TaskManagementCreateTaskCmd"]'));
    t.check("OK disabled without a title", await t.app(() => document.querySelector('.dlg[data-dialog="TaskManagementCreateTaskCmd"] [data-action="ok"]').disabled));
    await t.fill('.dlg[data-dialog="TaskManagementCreateTaskCmd"] [data-input="title"]', "Check rod length", { commit: false });
    await t.fill('.dlg[data-dialog="TaskManagementCreateTaskCmd"] [data-input="assignee"]', "QA", { commit: false });
    t.check("Related To preselected", (await t.app(() => document.querySelector('.dlg[data-dialog="TaskManagementCreateTaskCmd"] [data-input="related"]')?.dataset.count)) === "1");
    await okDlg("TaskManagementCreateTaskCmd");
    const tasks = await t.app(() => window.app.ui.tasks.list());
    t.check("task stored with the related body", tasks.length === 1 && tasks[0].title === "Check rod length" && tasks[0].refs.length === 1 && tasks[0].refs[0].body === ids.cyl, JSON.stringify(tasks));
    await t.click('#toolbar [data-cmd="TaskManagementRelatedTasksCmd"]');
    t.check("Related Tasks lists it for the selection", await t.waitFor('[data-palette="related-tasks"] [data-task]'));
    await t.app((b) => window.app.selection.set([{ kind: "body", body: b }]), ids.box);
    await t.settle(80);
    t.check("...and not for another body", await t.app(() => document.querySelectorAll('[data-palette="related-tasks"] [data-task]').length === 0));
    await t.click('[data-palette="related-tasks"] [data-action="close"]');
    await t.click('#toolbar [data-cmd="TaskManagementOpenTasksCmd"]');
    t.check("task board shows it under Open", await t.waitFor('[data-palette="task-board"] [data-status="Open"] [data-task]'));
    await t.app(() => { const s = document.querySelector('[data-palette="task-board"] [data-action="status"]'); s.value = "In Progress"; s.dispatchEvent(new Event("change")); });
    await t.settle(80);
    t.check("status change moves it to In Progress", await t.app(() => !!document.querySelector('[data-palette="task-board"] [data-status="In Progress"] [data-task]') && window.app.ui.tasks.list()[0].status === "In Progress"));
    await t.click('[data-palette="task-board"] [data-action="close"]');
    await t.app(() => window.app.selection.clear());

    // ------------------------------------------------------------------ selection tools
    t.step("Select by Name: 'body2' + Find + OK");
    await t.click('[data-tab="SolidTab"]');
    await cmd("SelectByNameCommand");
    await t.fill('.dlg[data-dialog="SelectByNameCommand"] [data-input="name"]', "body2", { commit: false });
    await t.click('.dlg[data-dialog="SelectByNameCommand"] [data-action="find"]');
    await okDlg("SelectByNameCommand");
    let sel = await t.app(() => window.app.selection.items.map((r) => r.body));
    t.check("Body2 (the cylinder) selected", sel.length === 1 && sel[0] === ids.cyl, JSON.stringify(sel));
    await cmd("SelectByInvertCommand");
    sel = await t.app(() => window.app.selection.items.map((r) => r.body));
    t.check("Invert Selection selects Box1 only", sel.length === 1 && sel[0] === ids.box, JSON.stringify(sel));

    t.step("Select by Size (full range) and Select by Boundary (box around Cylinder1)");
    await cmd("FusionSelectBodiesBySizeCommand");
    await okDlg("FusionSelectBodiesBySizeCommand");
    t.check("both bodies selected by size", (await t.app(() => window.app.selection.items.length)) === 2);
    await cmd("SelectByBoundaryCommand", { preselect: [{ kind: "body", body: ids.cyl }] });
    await t.waitFor('.dlg[data-dialog="SelectByBoundaryCommand"]');
    await t.fill('.dlg[data-dialog="SelectByBoundaryCommand"] [data-input="xsize"]', "40 mm");
    await okDlg("SelectByBoundaryCommand");
    sel = await t.app(() => window.app.selection.items.map((r) => r.body));
    t.check("only Cylinder1 inside the boundary", sel.length === 1 && sel[0] === ids.cyl, JSON.stringify(sel));

    t.step("Seed and Boundary: top face boundary, side face seed -> 5 faces");
    const faces = await t.app((b) => {
      const a = window.app; const T = a.K.topoOf(a.body(b).shape);
      const ref = (i) => ({ kind: "face", body: b, index: i, p: [...T.faces[i].c], n: [...T.faces[i].n], planar: true });
      return { top: ref(T.faces.findIndex((f) => f.n[2] > 0.9)), side: ref(T.faces.findIndex((f) => Math.abs(f.n[0]) > 0.9)) };
    }, ids.box);
    await cmd("FusionSelectSeedAndBoundaryFacesCommand");
    await t.app((f) => { const d = window.app.ui.dialog.current; d.setSelection("boundary", [f.top]); d.setSelection("seed", [f.side]); }, faces);
    await t.click('.dlg[data-dialog="FusionSelectSeedAndBoundaryFacesCommand"] [data-action="update"]');
    t.check("selection set has 5 faces", (await t.app(() => document.querySelector('.dlg [data-input="result"]')?.dataset.count)) === "5");
    await okDlg("FusionSelectSeedAndBoundaryFacesCommand");
    t.check("5 faces selected", (await t.app(() => window.app.selection.items.filter((r) => r.kind === "face").length)) === 5);
    await t.app(() => window.app.selection.clear());

    t.step("Selection Filters: opens the SELECT panel list; Bodies off blocks body picks");
    await cmd("SelectionFilterCommand");
    t.check("selection filter list visible", await t.waitFor(() => [...document.querySelectorAll(".sh-menu")].some((m) => m.getBoundingClientRect().width > 0 && /Bodies/.test(m.innerText)), { timeout: 2000 }));
    await t.escapeAll(2);
    const filt = await t.app(() => {
      const a = window.app; const tb = a.ui.toolbar;
      const set = (v) => { tb.selectionFilters = { ...tb.selectionFilters, Bodies: v }; a.emit("selection-filters", { filters: tb.selectionFilters }); };
      set(false); const off = a.selection.accepts({ kind: "body", body: "b1" });
      set(true); const on = a.selection.accepts({ kind: "body", body: "b1" });
      return { off, on };
    });
    t.check("filter state is honoured by canvas selection", filt.off === false && filt.on === true, JSON.stringify(filt));

    // ------------------------------------------------------------------ Find Features, Navigator, Design Advice
    t.step("Find Features on Box1 after a hole cut");
    await t.app(() => window.app.addFeature({ type: "cylinder", diameter: "8 mm", height: "20 mm", center: [10, 5], operation: "cut", plane: { kind: "origin", name: "XY" } }));
    await cmd("FusionFindFeaturesCommand", { preselect: [{ kind: "body", body: ids.box }] });
    await t.waitFor('.dlg[data-dialog="FusionFindFeaturesCommand"]');
    await okDlg("FusionFindFeaturesCommand");
    await t.settle(200);
    const ff = await t.app(() => (window.app.doc.foundFeatures || []).map((f) => f.type));
    t.check("a hole is recognized", ff.includes("hole"), JSON.stringify(ff));
    t.check("browser Features folder", await t.app(() => !!document.querySelector('[data-node^="foundfeature"]')));

    t.step("Navigator graph");
    await cmd("GraphViewCmd");
    const nav = await t.app(() => ({ nodes: document.querySelectorAll('[data-palette="navigator"] [data-node]').length, feats: window.app.doc.features.length }));
    t.check("one node per feature and body", nav.nodes >= nav.feats + 2, JSON.stringify(nav));
    await t.click('[data-palette="navigator"] [data-action="close"]');

    t.step("Design Advice on Box1 (Z pull)");
    await t.app(() => { const a = window.app; const b = a.bodies()[0].id; a.addFeature({ type: "shell", faces: [{ body: b, p: [0, 0, 20], n: [0, 0, 1] }], bodies: [], thickness: "0.4 mm", direction: "inside" }); });
    await cmd("DesignAdviceCmd", { preselect: [{ kind: "body", body: ids.box }] });
    await t.app(() => window.app.ui.dialog.current.setSelection("pull", [{ kind: "originAxis", name: "Z" }]));
    await t.click('.dlg[data-dialog="DesignAdviceCmd"] [data-action="analyze"]');
    await t.settle(300);
    const adv = await t.app(() => ({ thin: [...document.querySelectorAll('[data-card="thickness"]')].map((c) => c.className).join(), painted: (window.app.viewport.groups.overlay.children.find((g) => g.name === "design-advice") || { children: [] }).children.length }));
    t.check("thickness alerts and canvas highlight", /alert/.test(adv.thin) && adv.painted > 0, JSON.stringify(adv));
    await t.shot("design-advice");
    await okDlg("DesignAdviceCmd");

    t.step("Compute Unresolved runs without errors");
    await cmd("FusionComputeUnresolvedCommand");
    t.check("every feature computes", (await t.state()).features.every((f) => f.ok !== false));

    // ------------------------------------------------------------------ Scripts and Add-Ins
    t.step("Scripts and Add-Ins (Shift+S): create a script, edit, save, run");
    await t.blur(); await t.mouseToCanvas(0.5, 0.5);
    await t.key("Shift+S");
    t.require("manager opens", await t.waitFor('[data-dialog="ScriptsManagerCommand"], .mg-sm', { timeout: 3000 }));
    await t.click('.mg-sm-toolbar [data-action="add"]');
    await t.click('[data-menu-item="create"]');
    t.require("New script dialog", await t.waitFor('[data-dialog="NewScriptDialog"]'));
    await t.fill('[data-dialog="NewScriptDialog"] [data-input="name"]', "QARod", { commit: false });
    await t.click('[data-dialog="NewScriptDialog"] [data-action="ok"]');
    await t.click('[data-script][data-name="QARod"]');
    await t.click('.mg-sm-toolbar [data-action="edit"]');
    t.require("code editor opens", await t.waitFor('.mg-ed-pal [data-input="source"]'));
    await t.app((src) => { const ta = document.querySelector('.mg-ed-pal [data-input="source"]'); ta.value = src; ta.dispatchEvent(new Event("input")); }, SCRIPT);
    await t.click('.mg-ed-pal [data-action="save"]');
    const s0 = await t.state();
    await t.click('.mg-ed-pal [data-action="run"]');
    await t.waitFor(() => window.app.doc.features.some((f) => f.name === "QA Rod"), { timeout: 5000 });
    const s1 = await t.state();
    const rod = s1.bodies.find((b) => !s0.bodies.some((x) => x.id === b.id));
    t.check("script made a sketch + extrude and a user parameter", s1.features.length === s0.features.length + 2 && (await t.app(() => window.app.doc.params.some((p) => p.name === "qaw"))), `${s0.features.length} -> ${s1.features.length}`);
    t.check("rod volume = pi * 10^2 * 30", rod && Math.abs(rod.volume - Math.PI * 100 * 30) < 1, rod && fmt(rod.volume));
    t.check("timeline shows the script's features", await t.app(() => window.app.doc.features.slice(-2).every((f) => document.querySelector(`[data-feature="${f.id}"]`))));
    await t.click('.mg-ed-pal [data-action="close"]');
    await t.blur(); await t.mouseToCanvas(0.5, 0.5);
    await t.key("Control+z");
    t.check("one undo removes the whole run", (await t.state()).features.length === s0.features.length);
    await t.key("Control+y");

    t.step("add-in: start (adds a toolbar command), run on startup, stop");
    await cmd("ScriptsManagerCommand");
    await t.waitFor('[data-script][data-name="QuickBoxAddIn"]');
    await t.click('[data-script][data-name="QuickBoxAddIn"] [data-action="toggle-run"]');
    t.check("add-in running and its command registered", await t.waitFor(() => window.app.ui.scripts.host.isRunning(window.app.ui.scripts.list().find((s) => s.name === "QuickBoxAddIn").id) && !!window.app.commands.get("QuickBoxAddInCmd"), { timeout: 3000 }));
    await t.click('[data-script][data-name="QuickBoxAddIn"] [data-action="run-on-startup"]');
    t.check("run on startup stored", await t.app(() => window.app.ui.scripts.list().find((s) => s.name === "QuickBoxAddIn").runOnStartup === true));
    await t.click('[data-script][data-name="QuickBoxAddIn"] [data-action="toggle-run"]');
    t.check("add-in stopped", await t.waitFor(() => !window.app.ui.scripts.host.isRunning(window.app.ui.scripts.list().find((s) => s.name === "QuickBoxAddIn").id), { timeout: 3000 }));
    await t.escapeAll(2);
    await t.app(() => window.app.ui.modals && window.app.ui.modals.closeAll());

    // ------------------------------------------------------------------ links
    t.step("Fusion API and Marketplace open in a new tab");
    await t.app(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return {}; }; });
    await cmd("APIHelpCommand");
    await cmd("ExchangeAppStoreCommand");
    const opened = await t.app(() => window.__opened);
    t.check("API reference and store URLs", opened.some((u) => /help\.autodesk\.com/.test(u)) && opened.some((u) => /apps\.autodesk\.com/.test(u)), JSON.stringify(opened));
    t.check("in-app script API reference palette", await t.visible('[data-palette="script-api-reference"]'));
    await t.click('[data-palette="script-api-reference"] [data-action="close"]');

    // ------------------------------------------------------------------ Generate Timeline (new design)
    t.step("Generate Timeline for Cylinder1 opens a rebuilt design");
    const cylVol = (await t.state()).bodies.find((b) => b.id === ids.cyl).volume;
    const docJson = await t.app(() => JSON.stringify(window.app.doc));
    await cmd("TimelineBuilderCommand", { preselect: [{ kind: "body", body: ids.cyl }] });
    await okDlg("TimelineBuilderCommand");
    t.check("ready message", await t.waitFor('[data-dialog="TimelineBuilderReady"]', { timeout: 8000 }));
    await t.click('[data-dialog="TimelineBuilderReady"] [data-action="open"]');
    await t.settle(300);
    await t.app(() => { const b = [...document.querySelectorAll("#overlay .mn-modal button")].find((x) => x.offsetParent && /don.t save|discard|no/i.test(x.innerText)); if (b) b.click(); });
    await t.waitFor(() => /AutoTimeline/.test(window.app.doc.name), { timeout: 4000 });
    const gen = await t.state();
    t.check("generated design rebuilds the body with sketch + extrude", /AutoTimeline/.test(gen.name) && gen.features.some((f) => f.type === "extrude") && gen.bodies.length === 1 && Math.abs(gen.volume - cylVol) < 0.01 * cylVol, `${gen.name} ${gen.features.map((f) => f.type)} ${fmt(gen.volume)} vs ${fmt(cylVol)}`);

    // ------------------------------------------------------------------ save / open round trip
    t.step("document JSON round trip keeps item data and found features; tasks stay in storage");
    const rt = await t.app((json) => {
      const a = window.app;
      a.loadDocument(JSON.parse(json));
      return { pim: a.doc.pim && a.doc.pim.items.root.lifecycle, cos: a.doc.pim && a.doc.pim.changeOrders.length, ff: (a.doc.foundFeatures || []).length, tasks: a.ui.tasks.list().length };
    }, docJson);
    t.check("round trip", rt.pim === "Production" && rt.cos === 1 && rt.ff > 0 && rt.tasks === 1, JSON.stringify(rt));
    await t.shot("end");
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
