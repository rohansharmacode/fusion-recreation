// QA: the foundation contracts other modules build on, checked through the UI and against the model.
//   A. feature-type registry (M.registerFeature): timeline item + icon, browser body, parameters, Edit Feature,
//      undo / redo, save / open
//   B. body kinds: Insert Mesh makes a real mesh body (timeline feature, Bodies folder, pick, Delete, undo, Edit
//      Feature, STL export, save / open, legacy doc.meshes migration); a surface body (gold back side, face pick)
//   C. contextual environment (FORM tab, FINISH FORM, when:<mode> commands, S toolbox title, marking menu)
//   D. workspaces (switcher order, placeholder, Ctrl+], a registered workspace with its own bottom strip)
import { defineScenario, mainIfDirect, near } from "../lib.mjs";

/** Binary STL of an axis-aligned cube [o .. o+s] (12 triangles, outward winding). */
function cubeSTL(o, s) {
  const [x, y, z] = o;
  const P = (i, j, k) => [x + i * s, y + j * s, z + k * s];
  const q = (a, b, c, d) => [[a, b, c], [a, c, d]];
  const tris = [
    ...q(P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)), ...q(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)),
    ...q(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)), ...q(P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0)),
    ...q(P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)), ...q(P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)),
  ];
  const b = Buffer.alloc(84 + tris.length * 50);
  b.write("foundation scenario cube", 0, "ascii");
  b.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => t.flat().forEach((v, k) => b.writeFloatLE(v, 84 + i * 50 + 12 + k * 4)));
  return b;
}

const WS_ORDER = ["FusionSolidEnvironment", "GenerativeEnvironment", "FusionRenderEnvironment", "Publisher3DEnvironment", "SimulationEnvironment", "CAMEnvironment", "FusionDocumentationEnvironment"];

const scenario = defineScenario({
  name: "foundation",
  title: "Feature registry, body kinds (mesh / surface), contextual environments, workspaces",
  timeout: 170000,
  async run(t) {
    const dlg = '.dlg[data-dialog="ParaMeshInsertAlignCommand"]';
    await t.app(() => { const a = window.app; a.__dl = []; a.__origDownload = a.download; a.download = async (name, data) => { a.__dl.push({ name, size: data && data.size !== undefined ? data.size : String(data).length }); return true; }; });

    // ------------------------------------------------------------------ A. registry
    t.step("A. registerFeature('qaSlab'), add it, timeline + browser, parameter edit, undo, Edit Feature");
    const a1 = await t.app(() => {
      const a = window.app, M = a.M, K = a.K;
      M.registerFeature("qaSlab", {
        label: "QA Slab", stem: "Slab", fields: { height: "length" }, makesBodies: true, icon: "PrimitiveBox",
        apply(st, f, P, doc) {
          const h = M.fval(P, f, "height");
          if (!(h > 0)) throw new Error("Height must be positive");
          const tool = K.extrudeDrawing(K.R.drawRectangle(20, 10), K.ORIGIN_PLANES.XY, 0, h, 0);
          return { affected: M.applyOp(st, { ...f, operation: "new" }, tool, doc) };
        },
        editor: (app, id) => { window.__qaEdit = id; },
      });
      const f = a.addFeature({ type: "qaSlab", height: "5 mm" });
      return { id: f.id, name: f.name, body: f.newBody, param: f.p && f.p.height, vol: a.bodyInfo(f.newBody).volume, kind: a.bodyKind(f.newBody) };
    });
    t.require("registered feature evaluates into a solid body", a1 && a1.body && a1.kind === "solid", JSON.stringify(a1));
    t.check("name Slab1, parameter assigned, volume 1000 mm^3", a1.name === "Slab1" && /^d\d+$/.test(a1.param || "") && near(a1.vol, 1000, 1e-3), JSON.stringify(a1));
    t.check("timeline item with an icon", await t.waitFor((id) => !!document.querySelector(`[data-feature="${id}"] svg`), { timeout: 2000, arg: a1.id }));
    if (!(await t.visible(`#browser-host [data-node="body:${a1.body}"]`))) await t.click('#browser-host [data-node="bodies:root"] .br-twisty', { timeout: 1200 });
    t.check("browser Bodies folder lists Body1", await t.waitFor((b) => /Body1/.test((document.querySelector(`#browser-host [data-node="body:${b}"]`) || {}).textContent || ""), { timeout: 1500, arg: a1.body }));
    const v2 = await t.app((id) => { window.app.updateFeature(id, { height: "8 mm" }); return window.app.bodyInfo(window.app.feature(id).newBody).volume; }, a1.id);
    t.check("parameter edit re-evaluates (1600 mm^3)", near(v2, 1600, 1e-3), String(v2));
    await t.key("Control+z");
    t.check("undo restores 1000 mm^3", near(await t.app((b) => window.app.bodyInfo(b).volume, a1.body), 1000, 1e-3));
    await t.dblclick(`[data-feature="${a1.id}"]`);
    t.check("timeline double-click runs the registered editor", await t.waitFor((id) => window.__qaEdit === id, { timeout: 1500, arg: a1.id }));

    // ------------------------------------------------------------------ B. Insert Mesh -> mesh body
    t.step("B. INSERT > Insert Mesh (binary STL), Move To Ground, OK");
    await t.escapeAll();
    if (!(await t.click('#toolbar [data-cmd="ParaMeshInsertAlignCommand"]', { timeout: 800 }))) {
      await t.click('#toolbar [data-panel="InsertPanel"]');
      if (!(await t.click('#overlay [data-cmd="ParaMeshInsertAlignCommand"]', { timeout: 1200 }))) await t.app(() => window.app.commands.run("ParaMeshInsertAlignCommand"));
    }
    t.require("INSERT MESH dialog open", await t.waitFor(dlg, { timeout: 2000 }));
    await t.page.setInputFiles(`${dlg} input[type=file][data-input="meshFile"]`, { name: "cube.stl", mimeType: "model/stl", buffer: cubeSTL([40, -5, 5], 10) });
    t.check("live preview shows the mesh body", await t.waitFor(() => window.app.previewing && window.app.result.state.meshBodies.size === 1, { timeout: 3000 }));
    await t.click(`${dlg} [data-action="ground"]`);
    await t.settle(150);
    await t.click(`${dlg} [data-action="ok"]`);
    await t.settle(250);
    const mb = await t.app(() => {
      const a = window.app, f = a.doc.features.find((x) => x.type === "mesh");
      return f ? { fid: f.id, id: f.newBody, name: a.doc.bodies[f.newBody].name, info: a.bodyInfo(f.newBody), bb: a.M.bodyBBox(a.result.state, f.newBody) } : null;
    });
    t.require("mesh feature + mesh body", mb && mb.info && mb.info.kind === "mesh", JSON.stringify(mb));
    t.check("named cube, 12 triangles, closed volume 1000 mm^3", mb.name === "cube" && mb.info.triangles === 12 && near(mb.info.volume, 1000, 1e-3), JSON.stringify(mb.info));
    t.check("grounded: z 0..10, x 40..50", near(mb.bb.min[2], 0, 1e-4) && near(mb.bb.max[2], 10, 1e-4) && near(mb.bb.min[0], 40, 1e-4), JSON.stringify(mb.bb));
    t.check("timeline item for the mesh feature", await t.visible(`[data-feature="${mb.fid}"]`));
    const meshRow = `#browser-host [data-node="body:${mb.id}"]`;
    if (!(await t.visible(meshRow))) await t.click('#browser-host [data-node="bodies:root"] .br-twisty', { timeout: 1200 });
    t.check("browser: mesh body row in the Bodies folder", await t.waitFor((s) => /cube/.test((document.querySelector(s) || {}).textContent || ""), { timeout: 1500, arg: meshRow }));
    t.check("body names skip the mesh body (next solid is Body2)", await t.app(() => { const a = window.app; const f = a.addFeature({ type: "box", length: "5 mm", width: "5 mm", height: "5 mm", center: [-30, 0], operation: "new", plane: { kind: "origin", name: "XY" } }); const n = a.doc.bodies[f.newBody].name; a.history.undo(); return n === "Body2"; }));

    t.step("B. click the mesh body, Delete, undo; Edit Feature moves it");
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);
    const mp = await t.canvasXY([45, -5, 5]);
    await t.escapeAll();
    await t.canvasClick(mp.x, mp.y);
    await t.settle(150);
    const sel = await t.app(() => window.app.selection.items.map((r) => `${r.kind}:${r.body || r.id}`).join());
    t.check("canvas click selects the mesh body", sel === `body:${mb.id}`, sel);
    await t.key("Delete");
    t.check("Delete removes it", await t.waitFor((id) => !window.app.result.state.meshBodies.has(id), { timeout: 1500, arg: mb.id }));
    await t.key("Control+z");
    t.check("undo brings it back", await t.waitFor((id) => window.app.result.state.meshBodies.has(id), { timeout: 1500, arg: mb.id }));
    await t.escapeAll();
    await t.dblclick(`[data-feature="${mb.fid}"]`);
    t.require("Edit Feature reopens INSERT MESH", await t.waitFor(dlg, { timeout: 2000 }));
    await t.fill(`${dlg} [data-input="tx"]`, "20 mm");
    await t.settle(200);
    await t.click(`${dlg} [data-action="ok"]`);
    await t.settle(250);
    const mx = await t.app((id) => window.app.M.bodyBBox(window.app.result.state, id).min[0], mb.id);
    t.check("edited X Distance moves the mesh to x 60", near(mx, 60, 1e-4), String(mx));
    await t.escapeAll();
    await t.app((id) => { window.app.selection.set([{ kind: "body", body: id }]); window.app.commands.run("FusionMoveCommand"); }, mb.id);
    t.require("MOVE/COPY opens with the mesh body", await t.waitFor('.dlg[data-dialog="FusionMoveCommand"]', { timeout: 2000 }));
    await t.fill('.dlg[data-dialog="FusionMoveCommand"] [data-input="ty"]', "10 mm");
    await t.settle(200);
    await t.click('.dlg[data-dialog="FusionMoveCommand"] [data-action="ok"]');
    await t.settle(250);
    const my = await t.app((id) => window.app.M.bodyBBox(window.app.result.state, id).min[1], mb.id);
    t.check("Move/Copy moves the mesh body 10 mm in Y", near(my, 5, 1e-4), String(my));

    t.step("B. STL export holds solid + mesh triangles; save / open re-evaluates; legacy doc.meshes migrate");
    await t.app(() => window.app.ui.files.doExport("stl", "qa-foundation"));
    const dl = await t.app(() => window.app.__dl.slice(-1)[0]);
    t.check("binary STL with the mesh's 12 triangles and the solid's", dl && dl.size > 84 + 50 * 12 && (dl.size - 84) % 50 === 0, JSON.stringify(dl));
    const rt = await t.app(async () => {
      const a = window.app, F = a.ui.files;
      F.saveAs("QA Foundation");
      const id = a.doc.fileId;
      a.newDocument();
      await F.openById(id);
      const f = a.doc.features.find((x) => x.type === "mesh");
      return { n: a.doc.features.length, mesh: f ? a.bodyInfo(f.newBody) : null, slab: a.doc.features.some((x) => x.type === "qaSlab") };
    });
    t.check("open: mesh body (12 triangles) and the registered feature are back", rt.mesh && rt.mesh.triangles === 12 && rt.slab, JSON.stringify(rt));
    const legacy = await t.app(() => {
      const a = window.app, M = a.M;
      const data = M.meshOps.toB64(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
      a.ui.files.loadDoc({ version: 1, name: "Legacy", units: "mm", params: [], features: [], marker: 0, bodies: {}, counters: {}, origin: { visible: false }, meshes: [{ id: "mb1", name: "old", data, tris: 1, format: "stl", units: "mm", scale: 1 }] });
      const f = a.doc.features[0];
      return { type: f && f.type, name: f && a.doc.bodies[f.newBody].name, kind: f && a.bodyKind(f.newBody), meshes: a.doc.meshes };
    });
    t.check("legacy doc.meshes open as a mesh feature + body", legacy.type === "mesh" && legacy.name === "old" && legacy.kind === "mesh" && legacy.meshes === undefined, JSON.stringify(legacy));

    // ------------------------------------------------------------------ B. surface body
    t.step("B. surface body (registered feature making an open face): kind, gold back side, face pick");
    const sf = await t.app(() => {
      const a = window.app, M = a.M, K = a.K;
      a.newDocument();
      M.registerFeature("qaSheet", {
        label: "QA Sheet", makesBodies: true,
        apply(st, f) { const face = K.R.drawRectangle(30, 20).sketchOnPlane("XY").face(); st.bodies.set(f.newBody, { id: f.newBody, shape: face, from: f.id }); return { affected: [f.newBody] }; },
      });
      const f = a.addFeature({ type: "qaSheet" });
      const g = a.viewport.groups.bodies.getObjectByName(`body:${f.newBody}`);
      return { id: f.newBody, kind: a.bodyKind(f.newBody), parts: g ? g.children.length : 0 };
    });
    t.check("bodyKind 'surface', drawn with its back side", sf.kind === "surface" && sf.parts >= 3, JSON.stringify(sf));
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);
    const sp = await t.aim([[3, 2, 0], [-5, 4, 0], [8, -6, 0]], "h && h.ref.kind === 'face'");
    t.check("surface face picks as a face ref", sp && sp.hit.ref.body === sf.id, JSON.stringify(sp));

    // ------------------------------------------------------------------ C. contextual environment
    t.step("C. enterEnvironment FORM: tab row, FINISH FORM, when:'form' command, S toolbox, marking menu, finish");
    await t.app(() => {
      const a = window.app;
      a.commands.register({ id: "QaFormTool", label: "QA Form Tool", when: "form", kind: "tool", run() {} });
      window.__exitReason = null;
      a.enterEnvironment({ id: "qaform", mode: "form", label: "FORM", tab: "FormTab", finishCommand: "TSplineBaseFeatureStop", markingMenu: "TSplineEnvironment", onExit: (r) => { window.__exitReason = r; } });
    });
    await t.settle(150);
    const tb = await t.app(() => ({
      tabs: [...document.querySelectorAll("#toolbar [data-tab]")].map((e) => e.dataset.tab),
      sel: (document.querySelector('#toolbar [data-tab][aria-selected="true"]') || {}).dataset?.tab,
      finish: (document.querySelector("#toolbar .tb-panel-finish") || {}).textContent || "",
      enabled: window.app.commands.isEnabled("QaFormTool"), mode: window.app.mode,
    }));
    t.check("FORM tab selected, persistent tabs hidden", tb.sel === "FormTab" && !tb.tabs.includes("SolidTab"), JSON.stringify(tb));
    t.check("FINISH FORM panel with the green check button", /FINISH FORM/.test(tb.finish) && (await t.visible('#toolbar .tb-panel-finish [data-cmd="TSplineBaseFeatureStop"]')), tb.finish);
    t.check("mode 'form'; when:'form' command enabled", tb.mode === "form" && tb.enabled, JSON.stringify(tb));
    const cv = await t.app(() => { const r = window.app.viewport.canvas.getBoundingClientRect(); return { x: r.left + r.width * 0.85, y: r.top + r.height * 0.25 }; });
    await t.page.mouse.move(cv.x, cv.y);
    await t.key("s");
    t.check("S toolbox titled Form Shortcuts", await t.waitFor(() => /Form Shortcuts/.test((document.querySelector(".tbx-root .tbx-title") || {}).textContent || ""), { timeout: 1500 }));
    await t.escapeAll();
    await t.canvasClick(cv.x, cv.y, { button: "right" });
    t.check("marking menu uses the Form layout (Edit Form)", await t.waitFor(() => !!document.querySelector('.mm-root [data-cmd="TSplineEditCommand"]'), { timeout: 2000 }));
    await t.escapeAll();
    t.check("Esc keeps the environment", await t.app(() => window.app.mode === "form"));
    await t.click('#toolbar [data-cmd="TSplineBaseFeatureStop"]');
    await t.settle(150);
    const after = await t.app(() => ({ r: window.__exitReason, mode: window.app.mode, sel: (document.querySelector('#toolbar [data-tab][aria-selected="true"]') || {}).dataset?.tab, en: window.app.commands.isEnabled("QaFormTool") }));
    t.check("FINISH leaves it: onExit('finish'), SOLID tab back, command disabled", after.r === "finish" && after.mode === "model" && after.sel === "SolidTab" && !after.en, JSON.stringify(after));

    // ------------------------------------------------------------------ D. workspaces
    t.step("D. workspace switcher: Fusion's order, Render placeholder, Ctrl+], registered workspace, back to Design");
    await t.click("#toolbar .tb-ws");
    const order = await t.app(() => [...document.querySelectorAll(".tb-ws-menu [data-menu-item]")].map((e) => e.dataset.menuItem));
    t.check("switcher lists Fusion's workspaces in order", WS_ORDER.every((id, i) => order[i] === id), JSON.stringify(order));
    await t.click('.tb-ws-menu [data-menu-item="FusionRenderEnvironment"]');
    await t.settle(200);
    const rd = await t.app(() => ({ ws: window.app.workspace, label: document.querySelector("#toolbar .tb-ws-label").textContent, tabs: [...document.querySelectorAll("#toolbar [data-tab]")].map((e) => e.dataset.tab) }));
    t.check("Render: label RENDER, RENDER tab", rd.ws === "FusionRenderEnvironment" && rd.label === "RENDER" && rd.tabs.includes("RenderTab") && !rd.tabs.includes("SolidTab"), JSON.stringify(rd));
    t.check("placeholder card for an unbuilt workspace", await t.visible('[data-ws-placeholder="FusionRenderEnvironment"]'));
    await t.key("Control+]");
    t.check("Ctrl+] goes to the next workspace (Animation)", await t.waitFor(() => window.app.workspace === "Publisher3DEnvironment", { timeout: 1500 }));
    await t.app(() => {
      window.__wsLog = [];
      window.app.registerWorkspace({
        id: "SimulationEnvironment",
        enter: () => window.__wsLog.push("enter"), exit: () => window.__wsLog.push("exit"),
        timeline: (host) => { const d = document.createElement("div"); d.className = "qa-ws-bottom"; d.textContent = "QA STUDIES"; host.append(d); },
      });
      window.app.setWorkspace("SimulationEnvironment");
    });
    await t.settle(150);
    t.check("registered workspace: enter() ran, own bottom strip, no placeholder", (await t.visible(".qa-ws-bottom")) && !(await t.visible("[data-ws-placeholder]")) && (await t.app(() => window.__wsLog.join() === "enter")));
    await t.app(() => window.app.setWorkspace("FusionRenderEnvironment"));
    await t.click('[data-action="back-to-design"]');
    await t.settle(200);
    const back = await t.app(() => ({ ws: window.app.workspace, log: window.__wsLog.join(), solid: !!document.querySelector('#toolbar [data-tab="SolidTab"]'), bottom: !!document.querySelector(".qa-ws-bottom") }));
    t.check("Back to Design: SOLID tab, exit() ran, bottom strip restored", back.ws === "FusionSolidEnvironment" && back.solid && back.log === "enter,exit" && !back.bottom, JSON.stringify(back));
    await t.app(() => { const a = window.app; if (a.__origDownload) a.download = a.__origDownload; });
    await t.shot("final");
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
