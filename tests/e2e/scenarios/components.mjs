// QA: Fusion's component model (foundation part 2), through the browser, dialogs, timeline and canvas.
//   A. Create Components from Bodies (Bodies folder menu), New Component dialog (Parent, Component Name, Activate)
//   B. features belong to the active component (browser tree, timeline dimming, faded bodies, join scope), radio
//      activation, the New Component operation of a body feature
//   C. Move/Copy of components: uncaptured position, POSITION tab, timeline Position entry, Capture / Revert, undo
//   D. Pin, visibility, selectability, rename, isolate, Copy / Paste / Paste New (instance bodies), Delete + undo
//   E. Properties / BOM per component, display-only transforms, app.components API, save / open, old documents
import { defineScenario, mainIfDirect, near } from "../lib.mjs";

const box = (center, extra = {}) => ({ type: "box", plane: { kind: "origin", name: "XY" }, center, length: "10 mm", width: "10 mm", height: "10 mm", operation: "new", ...extra });

const scenario = defineScenario({
  name: "components",
  title: "Components and occurrences: browser tree, activation, New Component, Move + Capture Position, Pin, Copy/Paste, Delete, save/open",
  timeout: 170000,
  async run(t) {
    const br = (key) => `#browser-host [data-node="${key}"]`;
    const menuItem = (act) => `.br-ctx [data-action="${act}"]`;
    const ctx = async (key, act) => {
      const ok = await t.click(`${br(key)} .br-label`, { button: "right" });
      if (!ok) return false;
      return t.click(menuItem(act), { timeout: 1500 });
    };
    const expand = async (key) => { await t.app((k) => window.app.ui.browser.expand(k, true), key); await t.frames(2); };

    // ------------------------------------------------------------------ A
    t.step("A. Body1 -> Create Components from Bodies (Bodies folder menu); New Component dialog");
    const b1 = await t.app((f) => window.app.addFeature(f).newBody, box([0, 0]));
    await expand("doc:root");
    t.require("Bodies folder menu: Create Components from Bodies", await ctx("bodies:root", "comps-from-bodies"));
    const a1 = await t.app((b) => {
      const C = window.app.components;
      const occs = C.list();
      return { n: occs.length, label: occs[0] && occs[0].label, owner: C.ownerOf(b), last: window.app.doc.features.slice(-1)[0].type };
    }, b1);
    t.check("component Body1:1 owns Body1, a component feature in the timeline", a1.n === 1 && a1.label === "Body1:1" && a1.owner !== "root" && a1.last === "component", JSON.stringify(a1));
    const o1 = await t.app(() => window.app.components.list()[0].id);
    t.check("browser lists the occurrence after the folders", await t.waitFor((k) => /Body1:1/.test((document.querySelector(`#browser-host [data-node="${k}"]`) || {}).textContent || ""), { timeout: 2000, arg: `occ:${o1}` }));
    t.check("timeline icon of the component feature", await t.waitFor(() => !!document.querySelector('.tl-item[data-type="component"] svg'), { timeout: 1500 }));
    t.check("Document Settings: Hybrid Design", await t.waitFor(() => /Hybrid Design/.test(document.querySelector('#browser-host [data-node="doctype:root"]')?.textContent || ""), { timeout: 1500 }));

    // New Component from the root's menu: name it, OK -> active
    t.require("root menu: New Component", await ctx("doc:root", "new-component"));
    const dlg = '.dlg[data-dialog="FusionCreateNewComponentCommand"]';
    t.require("New Component dialog opens", await t.waitFor((s) => !!document.querySelector(s), { timeout: 2000, arg: dlg }));
    const rows = await t.app((s) => [...document.querySelectorAll(`${s} .dlg-label`)].filter((e) => e.offsetParent).map((e) => e.textContent), dlg);
    t.check("dialog rows: Parent, From Bodies, Component Name, Activate", JSON.stringify(rows) === JSON.stringify(["Parent", "From Bodies", "Component Name", "Activate"]), JSON.stringify(rows));
    await t.fill(`${dlg} [data-input="name"]`, "Bracket");
    await t.click(`${dlg} [data-action="ok"]`);
    const a2 = await t.app(() => { const C = window.app.components; const o = C.list().find((x) => x.name === "Bracket"); return { o: o && o.id, label: o && o.label, active: C.active, dlg: !!window.app.activeCommand }; });
    t.check("Bracket:1 created and active", a2.label === "Bracket:1" && a2.active === a2.o && !a2.dlg, JSON.stringify(a2));
    t.check("browser radio shows it active", await t.waitFor((k) => !!document.querySelector(`#browser-host [data-node="${k}"].active-comp .br-radio.on`), { timeout: 1500, arg: `occ:${a2.o}` }));

    // ------------------------------------------------------------------ B
    t.step("B. features made while Bracket is active belong to it; fading, timeline dimming, radio, New Component operation");
    const b2 = await t.app((f) => window.app.addFeature(f).newBody, box([40, 0]));
    const bState = await t.app(({ b, o }) => {
      const a = window.app, C = a.components;
      const vp = a.viewport;
      
      return { owner: C.ownerOf(b), feat: a.doc.features.slice(-1)[0].occ, fadedRoot: C.faded(a.doc.features[0].newBody), fadedOwn: C.faded(b) };
    }, { b: b2, o: a2.o });
    t.check("Box in Bracket: body and feature belong to Bracket", bState.owner === a2.o && bState.feat === a2.o, JSON.stringify(bState));
    t.check("bodies of other components are faded", bState.fadedRoot === true && bState.fadedOwn === false, JSON.stringify(bState));
    t.check("timeline dims features of other components", await t.waitFor(() => document.querySelectorAll(".tl-item.other-comp").length >= 1, { timeout: 1500 }));
    await expand(`occ:${a2.o}`);
    t.check("browser: Bracket:1 > Bodies > Body2", await t.waitFor((b) => { const r = document.querySelector(`#browser-host [data-node="body:${b}"]`); return !!r && !!r.closest(".br-children") && /Body2/.test(r.textContent); }, { timeout: 1500, arg: b2 }));
    // join inside Bracket ignores the root's bodies
    const joinInfo = await t.app((f) => { const a = window.app; const g = a.addFeature(f); return { ok: a.featureResult(g.id).ok, root: a.bodyInfo(a.doc.features[0].newBody).volume }; }, box([5, 0], { operation: "join", height: "4 mm" }));
    t.check("join in Bracket leaves the root component's body alone", joinInfo.ok && near(joinInfo.root, 1000, 1e-3), JSON.stringify(joinInfo));
    // activate the root with its radio
    await t.click(`${br("doc:root")} .br-right`);
    t.check("root radio activates the root", (await t.app(() => window.app.components.active)) === "root");
    // New Component operation of a body feature
    const nc = await t.app((f) => { const a = window.app; const g = a.addFeature(f); const C = a.components; return { occ: g.newOcc, owner: C.ownerOf(g.newBody), label: C.label(g.newOcc) }; }, box([0, 40], { operation: "newComponent" }));
    t.check("operation New Component makes Component1:1 with the body", nc.owner === nc.occ && nc.label === "Component1:1", JSON.stringify(nc));

    // ------------------------------------------------------------------ C
    t.step("C. Move/Copy a component (Components), POSITION tab + timeline Position entry, Capture / Revert, undo");
    await t.click(`${br(`occ:${o1}`)} .br-label`);
    await t.key("m");
    const mv = '.dlg[data-dialog="FusionMoveCommand"]';
    t.require("Move dialog opens on Components", await t.waitFor((s) => !!document.querySelector(s) && document.querySelector(`${s} [data-input="objType"]`)?.dataset.value === "components", { timeout: 2000, arg: mv }));
    await t.click(`${mv} [data-input="moveType"] [data-option="translate"]`);
    await t.fill(`${mv} [data-input="tx"]`, "50");
    await t.key("Tab");
    await t.frames(4);
    const disp = await t.app((b) => { const o = window.app.viewport._vp.bodies.objects.get(b); return o ? o.group.matrix.elements[12] : null; }, b1);
    t.check("live preview: the component is drawn moved (display transform)", near(disp, 50, 1e-6), String(disp));
    await t.click(`${mv} [data-action="ok"]`);
    await t.waitFor(() => window.app.environment && window.app.environment.id === "position", { timeout: 2000 });
    const c1 = await t.app((b) => {
      const a = window.app, C = a.components;
      return { min: a.bodyInfo(b).bbox.min[0], pend: C.hasPending(), env: a.environment && a.environment.id, feats: a.doc.features.length, tab: !!document.querySelector('[data-tab="EditSnapshotTab"]') };
    }, b1);
    t.check("uncaptured move: Body1 at x+50, POSITION tab", near(c1.min, 45, 1e-4) && c1.pend && c1.env === "position" && c1.tab, JSON.stringify(c1));
    t.check("timeline shows the Position entry", await t.visible(".tl-pending"));
    await t.click('[data-cmd="SnapshotEditAccept"]');
    const c2 = await t.app((b) => { const a = window.app; const f = a.doc.features.slice(-1)[0]; return { type: f.type, name: f.name, pend: a.components.hasPending(), env: a.environment && a.environment.id, min: a.bodyInfo(b).bbox.min[0] }; }, b1);
    t.check("Capture Position: a Position feature, POSITION tab closed, body stays", c2.type === "snapshot" && /^Position\d+$/.test(c2.name) && !c2.pend && !c2.env && near(c2.min, 45, 1e-4), JSON.stringify(c2));
    await t.key("Control+z");
    await t.waitFor(() => window.app.components.hasPending(), { timeout: 1500 });
    t.check("undo of the capture: uncaptured again", await t.app(() => window.app.components.hasPending() && window.app.doc.features.slice(-1)[0].type !== "snapshot"));
    await t.waitFor(() => window.app.environment && window.app.environment.id === "position", { timeout: 1500 });
    // Revert through the timeline entry's menu
    await t.click(".tl-pending");
    await t.click(menuItem("revert-position"), { timeout: 1500 });
    const c3 = await t.app((b) => ({ min: window.app.bodyInfo(b).bbox.min[0], pend: window.app.components.hasPending(), env: window.app.environment && window.app.environment.id }), b1);
    t.check("Revert Position: Body1 back, no Position entry", near(c3.min, -5, 1e-4) && !c3.pend && !c3.env, JSON.stringify(c3));
    // a captured move through the API is seen by later features (a box joined at the new place)
    const c4 = await t.app(({ o, b }) => {
      const a = window.app, C = a.components;
      C.setTransform(o, [1, 0, 0, 0, 0, 1, 0, 70, 0, 0, 1, 0], { capture: true });
      return { min: a.bodyInfo(b).bbox.min[1], last: a.doc.features.slice(-1)[0].type, T: C.transform(o)[7] };
    }, { o: o1, b: b1 });
    t.check("setTransform(capture): Position feature, Body1 at y+70", near(c4.min, 65, 1e-4) && c4.last === "snapshot" && near(c4.T, 70, 1e-6), JSON.stringify(c4));

    // ------------------------------------------------------------------ D
    t.step("D. Pin, Show/Hide, rename, Copy / Paste / Paste New, Delete + undo");
    t.require("component menu: Pin", await ctx(`occ:${o1}`, "pin"));
    t.check("pinned (badge in the browser)", await t.waitFor((k) => !!document.querySelector(`#browser-host [data-node="${k}"] .br-pinmark`), { timeout: 1500, arg: `occ:${o1}` }));
    t.check("a pinned component refuses to move", (await t.app((o) => window.app.components.setTransform(o, [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 0]), o1)) === false);
    await ctx(`occ:${o1}`, "unpin");
    await t.click(`${br(`occ:${o1}`)} .br-eye`);
    const hid = await t.app((b) => ({ shown: window.app.components.bodyShown(b), drawn: window.app.viewport._vp.bodies.objects.has(b) }), b1);
    t.check("eye hides the component's bodies in the canvas", !hid.shown && !hid.drawn, JSON.stringify(hid));
    await t.click(`${br(`occ:${o1}`)} .br-eye`);
    t.check("eye shows them again", await t.app((b) => window.app.viewport._vp.bodies.objects.has(b), b1));
    t.check("rename the component", await t.app((o) => window.app.components.rename(o, "Plate") && window.app.components.label(o) === "Plate:1", o1));
    // Copy + Paste: another occurrence (Plate:2) placed with Move
    await t.click(`${br(`occ:${o1}`)} .br-label`);
    await t.mouseToCanvas(0.5, 0.5);
    await t.key("Control+c");
    await t.key("Control+v");
    t.require("Paste opens Move/Copy with the new occurrence", await t.waitFor((s) => !!document.querySelector(s), { timeout: 2000, arg: mv }));
    await t.click(`${mv} [data-input="moveType"] [data-option="translate"]`);
    await t.fill(`${mv} [data-input="ty"]`, "-40");
    await t.key("Tab");
    await t.click(`${mv} [data-action="ok"]`);
    await t.waitFor(() => window.app.components.hasPending(), { timeout: 1500 });
    await t.app(() => window.app.commands.run("SnapshotEditAccept"));
    const d1 = await t.app((b) => {
      const a = window.app, C = a.components;
      const o2 = C.list().find((x) => x.label === "Plate:2");
      const inst = o2 && C.bodiesOf(o2.id)[0];
      return { o2: o2 && o2.id, inst, instOwn: inst && C.ownerOf(inst), vol: inst && a.bodyInfo(inst).volume, base: a.bodyInfo(b).volume, y: inst && a.bodyInfo(inst).bbox.min[1] };
    }, b1);
    t.check("Paste: Plate:2 shows Plate's body at its own place", d1.o2 && d1.inst && d1.inst.includes("@") && near(d1.vol, d1.base, 1e-6) && near(d1.y, 25, 1e-4), JSON.stringify(d1));
    await t.click(`${br(`occ:${o1}`)} .br-label`);
    await t.key("Control+c");
    await t.app(() => window.app.commands.run("FusionPasteNewCommand"));
    await t.waitFor((s) => !!document.querySelector(s), { timeout: 2000, arg: mv });
    await t.click(`${mv} [data-action="cancel"]`);
    const d2 = await t.app(() => { const C = window.app.components; const o = C.list().find((x) => /^Plate \(1\)/.test(x.name)); return { label: o && o.label, bodies: o ? C.bodiesOf(o.id).filter((b) => !b.includes("@")).length : 0 }; });
    t.check("Paste New: Plate (1):1 with its own copy of the body", d2.label === "Plate (1):1" && d2.bodies === 1, JSON.stringify(d2));
    // BOM: one row per component with its quantity
    const bom = await t.app(() => { const a = window.app; return a.ui.inspect && a.ui.inspect.bom ? a.ui.inspect.bom() : null; });
    if (bom) t.check("BOM: Plate quantity 2", bom.rows.some((r) => r.name === "Plate" && r.qty === 2), JSON.stringify(bom.rows.map((r) => [r.name, r.qty])));
    // Delete a component through its menu; undo brings it back
    const before = await t.app(() => window.app.components.list().length);
    t.require("component menu: Delete", await ctx(`occ:${d1.o2}`, "delete"));
    const afterDel = await t.app((o) => ({ n: window.app.components.list().length, alive: window.app.components.alive(o) }), d1.o2);
    t.check("Delete removes the pasted occurrence", afterDel.n === before - 1 && !afterDel.alive, JSON.stringify(afterDel));
    await t.key("Control+z");
    t.check("undo restores it", await t.waitFor((o) => window.app.components.alive(o), { timeout: 1500, arg: d1.o2 }));

    // ------------------------------------------------------------------ E
    t.step("E. Properties, display-only transform, selection priority, save / open, old documents");
    t.require("component menu: Properties", await ctx(`occ:${o1}`, "properties"));
    const props = await t.app(() => { const d = document.querySelector('.dlg[data-dialog="FusionPropertiesCommand"]'); return d ? { target: d.dataset.target, text: d.textContent } : null; });
    t.check("Properties of the component", props && props.target === o1 && /Plate:1/.test(props.text), JSON.stringify(props && props.target));
    await t.escapeAll(2);
    const disp2 = await t.app(({ o, b }) => {
      const a = window.app, C = a.components;
      const n0 = a.evaluator.cache.length;
      let models = 0;
      const off = a.on("model", () => models++);
      const T = C.transform(o);
      C.setDisplayTransform(o, a.M.meshOps.mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 25], T));
      const z = a.viewport._vp.bodies.objects.get(b).group.matrix.elements[14];
      C.setDisplayTransform(o, null);
      const z2 = a.viewport._vp.bodies.objects.get(b).group.matrix.elements[14];
      off();
      return { z, z2, models, n0 };
    }, { o: o1, b: b1 });
    t.check("display-only transform moves the drawing without evaluating", near(disp2.z, 25, 1e-6) && near(disp2.z2, 0, 1e-9) && disp2.models === 0, JSON.stringify(disp2));
    const prio = await t.app(() => { window.app.commands.run("SelectComponentPriorityCommand"); return window.app.viewport.selectionPriority; });
    t.check("Select Component Priority", prio === "component", prio);
    await t.app(() => window.app.commands.run("SelectFacePriorityCommand"));
    const api = await t.app(() => {
      const C = window.app.components;
      const tr = C.tree();
      return { root: tr.id, kids: tr.children.map((c) => c.label), world: C.worldBodies(C.list()[0].id).every((b) => !!b.shape) };
    });
    t.check("app.components.tree / worldBodies", api.root === "root" && api.kids.includes("Plate:1") && api.world, JSON.stringify(api));
    const rt = await t.app(async () => {
      const a = window.app, F = a.ui.files, C = a.components;
      const sig = () => C.list().map((o) => `${o.label}|${C.bodiesOf(o.id).length}|${o.T.map((v) => v.toFixed(3)).join(",")}`).sort().join(";");
      const s0 = sig();
      F.saveAs("QA Components");
      const id = a.doc.fileId;
      a.newDocument();
      const empty = C.list().length;
      await F.openById(id);
      return { s0, s1: sig(), empty, errs: a.doc.features.filter((f) => a.featureResult(f.id) && a.featureResult(f.id).ok === false).map((f) => f.name) };
    });
    t.check("save / open keeps components, occurrences, bodies and positions", rt.s0 === rt.s1 && rt.empty === 0 && !rt.errs.length, JSON.stringify(rt));
    const old = await t.app(() => {
      const a = window.app;
      a.ui.files.loadDoc({ version: 1, name: "Old", units: "mm", params: [], features: [{ id: "f1", type: "box", name: "Box1", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "10 mm", width: "10 mm", height: "10 mm", operation: "new", newBody: "b1", p: {} }], marker: 1, bodies: { b1: { name: "Body1", visible: true, appearance: "steel-satin", material: "steel" } }, counters: { feature: 1, body: 1 }, origin: { visible: false } });
      return { n: a.components.list().length, owner: a.components.ownerOf("b1"), vol: a.bodyInfo("b1").volume };
    });
    t.check("old documents open in the root component", old.n === 0 && old.owner === "root" && near(old.vol, 1000, 1e-3), JSON.stringify(old));
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
