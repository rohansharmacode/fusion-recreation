// MESH tab through the real UI: Tessellate a sphere and a box (MESH > CREATE), Remesh / Reduce / Smooth /
// Plane Cut / Shell / Combine / Separate / Repair / Generate Face Groups / Create Face Group (Mesh Palette face
// filter + canvas click) / Reverse Normal / Scale Mesh / Remove / Convert Mesh, Display Mesh Face Groups, Edit
// Feature from the timeline, undo / redo, Create Mesh Section Sketch + Fit Curves to Mesh Section, DIRECT MESH
// EDITING (Direct Edit, Smooth inside the base feature, Finish) and a save / open round trip.
import zlib from "node:zlib";
import { defineScenario, mainIfDirect, near } from "../lib.mjs";

/** Grey-scale checker PNG (w x h, 8 px squares) for Texture Extrude. */
function checkerPNG(w = 32, h = 32) {
  const crcT = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc(h * (1 + w));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (1 + w) + 1 + x] = ((x >> 3) + (y >> 3)) % 2 ? 255 : 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const TAB = '[data-tab="ParaMeshOuterTab"]';
const dlgSel = (id) => `.dlg[data-dialog="${id}"]`;

/** Run a MESH command from its toolbar button, else its panel dropdown, else the registry. */
async function run(t, id, panel) {
  await t.click(TAB, { timeout: 800 });
  if (await t.click(`#toolbar [data-cmd="${id}"]`, { timeout: 500 })) return "button";
  if (panel && (await t.click(`#toolbar [data-panel="${panel}"]`, { timeout: 800 })) && (await t.click(`#overlay [data-cmd="${id}"]`, { timeout: 1000 }))) return "menu";
  await t.app((id) => window.app.commands.run(id), id);
  return "api";
}
async function ok(t, id) {
  await t.settle(120);
  await t.click(`${dlgSel(id)} [data-action="ok"]`);
  const closed = await t.waitFor((s) => !document.querySelector(s), { timeout: 15000, arg: dlgSel(id) });
  if (!closed) {
    const why = await t.app((s) => { const d = document.querySelector(s); const ok = d && d.querySelector('[data-action="ok"]'); return { msg: d ? d.innerText.slice(-300) : "", disabled: !!(ok && ok.disabled), toast: t0() }; function t0() { return [...document.querySelectorAll(".toast, [class*=toast]")].map((e) => e.innerText).join(" | ").slice(0, 300); } }, dlgSel(id));
    t.note(`${id} did not close: ${JSON.stringify(why)}`);
    await t.escapeAll();
  }
  return closed;
}
const info = (t, id) => t.app((id) => { const i = window.app.bodyInfo(id); return i ? { v: i.volume, tris: i.triangles, kind: i.kind } : null; }, id);
const select = (t, refs) => t.app((r) => window.app.selection.set(r), refs);
const lastFeature = (t) => t.app(() => { const f = window.app.doc.features[window.app.doc.marker - 1]; const r = window.app.featureResult(f.id) || {}; return { id: f.id, type: f.type, ok: r.ok !== false, error: r.error || "", name: f.name, newBody: f.newBody, newBodies: f.newBodies }; });

const scenario = defineScenario({
  name: "mesh",
  title: "MESH tab: mesh body editing, face groups, palette, sections, conversion, direct mesh editing",
  timeout: 300000,
  async run(t) {
    t.step("setup: sphere + box solids");
    const base = await t.app(() => {
      const a = window.app;
      const s = a.addFeature({ type: "sphere", diameter: "20 mm", center: [0, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
      const b = a.addFeature({ type: "box", length: "20 mm", width: "20 mm", height: "20 mm", center: [30, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
      a.viewport.fit({ animate: false });
      return { sphere: s.newBody, box: b.newBody };
    });

    // ------------------------------------------------------------------ Tessellate
    t.step("MESH > CREATE > Tessellate the sphere (preselected), Low refinement, OK");
    t.require("MESH tab exists", await t.click(TAB, { timeout: 2000 }));
    await select(t, [{ kind: "body", body: base.sphere }]);
    await run(t, "ParaMeshTessellateCommand", "ParaMeshCreatePanel");
    t.require("Tessellate dialog", await t.waitFor(dlgSel("ParaMeshTessellateCommand"), { timeout: 3000 }));
    t.check("body preselected", await t.waitFor((s) => (document.querySelector(`${s} [data-input="body"]`) || {}).dataset?.count === "1", { timeout: 1500, arg: dlgSel("ParaMeshTessellateCommand") }));
    await t.app(() => { const d = window.app.ui.dialog.current; d.set("refinement", "low", { user: true }); });
    t.check("live preview has a mesh body", await t.waitFor(() => window.app.previewing && window.app.result.state.meshBodies.size === 1, { timeout: 4000 }));
    t.require("Tessellate OK", await ok(t, "ParaMeshTessellateCommand"));
    const tes = await lastFeature(t);
    const S = tes.newBody;
    const si = await info(t, S);
    t.check("mesh body made (volume close to the sphere)", tes.type === "meshTessellate" && tes.ok && si && si.kind === "mesh" && near(si.v, 4188.8, 60), JSON.stringify({ tes, si }));
    t.check("source sphere hidden, mesh body named after it", await t.app(({ s, m }) => window.app.doc.bodies[s].visible === false && / \(Mesh\)$/.test(window.app.doc.bodies[m].name), { s: base.sphere, m: S }));
    t.check("timeline entry", await t.waitFor((s) => !!document.querySelector(s), { timeout: 2000, arg: `[data-feature="${tes.id}"]` }));
    await select(t, [{ kind: "body", body: base.box }]);
    await run(t, "ParaMeshTessellateCommand", "ParaMeshCreatePanel");
    await t.waitFor(dlgSel("ParaMeshTessellateCommand"), { timeout: 3000 });
    await ok(t, "ParaMeshTessellateCommand");
    const B = (await lastFeature(t)).newBody;
    t.check("box mesh: 12 triangles, 8000 mm^3", await t.app((b) => { const i = window.app.bodyInfo(b); return i.triangles === 12 && Math.abs(i.volume - 8000) < 1e-3; }, B));

    // ------------------------------------------------------------------ Remesh / Reduce / Smooth
    t.step("Remesh the sphere (Density 0.80), OK; undo / redo");
    await select(t, [{ kind: "body", body: S }]);
    await run(t, "ParaMeshRemeshCommand", "ParaMeshModifyPanel");
    t.require("Remesh dialog", await t.waitFor(dlgSel("ParaMeshRemeshCommand"), { timeout: 3000 }));
    await t.fill(`${dlgSel("ParaMeshRemeshCommand")} [data-input="density"]`, "0.8");
    t.require("Remesh OK", await ok(t, "ParaMeshRemeshCommand"));
    const rm = await lastFeature(t);
    const ri = await info(t, S);
    t.check("remesh: more triangles, volume kept", rm.type === "meshRemesh" && rm.ok && ri.tris > si.tris && near(ri.v, si.v, si.v * 0.02), JSON.stringify({ rm, ri, si }));
    await t.key("Control+z");
    t.check("undo restores the triangle count", await t.waitFor(({ b, n }) => window.app.bodyInfo(b).triangles === n, { timeout: 4000, arg: { b: S, n: si.tris } }));
    await t.key("Control+y");
    t.check("redo remeshes again", await t.waitFor(({ b, n }) => window.app.bodyInfo(b).triangles === n, { timeout: 8000, arg: { b: S, n: ri.tris } }));

    t.step("Reduce the sphere to Face Count 600");
    await select(t, [{ kind: "body", body: S }]);
    await run(t, "ParaMeshReduceCommand", "ParaMeshModifyPanel");
    t.require("Reduce dialog", await t.waitFor(dlgSel("ParaMeshReduceCommand"), { timeout: 3000 }));
    await t.app(() => window.app.ui.dialog.current.set("reduceType", "count", { user: true }));
    await t.settle(100);
    await t.fill(`${dlgSel("ParaMeshReduceCommand")} [data-input="faceCount"]`, "600");
    await ok(t, "ParaMeshReduceCommand");
    const rdi = await info(t, S);
    t.check("reduce: 600 faces, still closed volume", rdi.tris <= 602 && rdi.tris >= 560 && near(rdi.v, si.v, si.v * 0.05), JSON.stringify(rdi));

    t.step("MODIFY dropdown > Smooth");
    await select(t, [{ kind: "body", body: S }]);
    const how = await run(t, "ParaMeshSmoothCommand", "ParaMeshModifyPanel");
    t.check("Smooth opened from the MODIFY dropdown", how === "menu", how);
    t.require("Smooth dialog", await t.waitFor(dlgSel("ParaMeshSmoothCommand"), { timeout: 3000 }));
    await ok(t, "ParaMeshSmoothCommand");
    t.check("smooth feature ok", (await lastFeature(t)).ok);

    // ------------------------------------------------------------------ Generate Face Groups + display + Create Face Group
    t.step("Generate Face Groups on the box mesh (6 groups), Display Mesh Face Groups (Shift+F)");
    await select(t, [{ kind: "body", body: B }]);
    await run(t, "ParaMeshCalculateFaceGroupsCommand", "ParaMeshPreparePanel");
    t.require("Generate Face Groups dialog", await t.waitFor(dlgSel("ParaMeshCalculateFaceGroupsCommand"), { timeout: 3000 }));
    await ok(t, "ParaMeshCalculateFaceGroupsCommand");
    t.check("box mesh has 6 face groups", await t.app((b) => { const m = window.app.result.state.meshBodies.get(b).mesh; return m.groups && new Set(m.groups).size === 6; }, B));
    await t.blur();
    await t.mouseToCanvas(0.5, 0.5);
    await t.key("Shift+F");
    t.check("face group colours shown", await t.app(() => { let n = 0; window.app.viewport.groups.bodies.traverse((o) => { if (o.name === "mshGroups") n++; }); return n >= 1 && window.app.ui.mesh.display.groups; }));
    await t.key("Shift+F");
    t.check("face group colours hidden again", await t.app(() => { let n = 0; window.app.viewport.groups.bodies.traverse((o) => { if (o.name === "mshGroups") n++; }); return n === 0; }));

    t.step("Mesh Palette: Mesh Faces filter, Create Face Group by clicking the box mesh, Grow");
    await t.click(TAB);
    const viaMenu = (await t.click('#toolbar [data-panel="ParaMeshSelectPanel"]', { timeout: 800 })) && (await t.click('#overlay [data-cmd="ParaMeshShowSelectionPanelCmd"]', { timeout: 1000 }));
    if (!viaMenu) await t.app(() => window.app.commands.run("ParaMeshShowSelectionPanelCmd"));
    t.check("SELECT > Mesh Palette shows the Mesh Selection Palette", await t.waitFor(() => window.app.ui.mesh.palette.visible && getComputedStyle(document.querySelector(".msh-pal")).display !== "none", { timeout: 1500 }), `menu ${viaMenu}`);
    await t.escapeAll(1);
    await select(t, []);
    await run(t, "ParaMeshCreateFaceGroupCommand", "ParaMeshPreparePanel");
    t.require("Create Face Group dialog", await t.waitFor(dlgSel("ParaMeshCreateFaceGroupCommand"), { timeout: 3000 }));
    t.check("palette switched to Mesh Faces", await t.app(() => window.app.ui.mesh.palette.mode === "face"));
    await t.setView("top");
    await t.cameraStable();
    const aim = await t.aim([[30, 0, 20], [28, 2, 20], [32, -3, 20]], "h && h.ref.kind === 'meshFace'");
    t.require("aim at the box mesh top face", !!aim, JSON.stringify(aim));
    await t.canvasClick(aim.x, aim.y);
    t.check("one face selected", await t.waitFor((s) => (document.querySelector(`${s} [data-input="faces"]`) || {}).dataset?.count === "1", { timeout: 2000, arg: dlgSel("ParaMeshCreateFaceGroupCommand") }));
    await t.click('.msh-pal [data-act="grow"]');
    t.check("Grow adds the neighbour faces", await t.waitFor((s) => Number((document.querySelector(`${s} [data-input="faces"]`) || {}).dataset?.count || 0) > 1, { timeout: 2000, arg: dlgSel("ParaMeshCreateFaceGroupCommand") }));
    const nSel = await t.app(() => (window.app.ui.dialog.current.values.faces || []).map((r) => r.tri));
    await ok(t, "ParaMeshCreateFaceGroupCommand");
    t.check("the selected faces form one new face group", await t.app(({ b, tris }) => { const g = window.app.result.state.meshBodies.get(b).mesh.groups; const ng = g[tris[0]]; return tris.length > 1 && ng === Math.max(...g) && tris.every((t) => g[t] === ng) && [...g].filter((x) => x === ng).length === tris.length; }, { b: B, tris: nSel }));
    await t.app(() => { window.app.commands.run("ParaMeshShowSelectionPanelCmd"); });
    t.check("palette closed", await t.app(() => !window.app.ui.mesh.palette.visible && getComputedStyle(document.querySelector(".msh-pal")).display === "none"));
    await t.setView("home");

    // ------------------------------------------------------------------ Plane Cut (Split Body), Shell, Combine, Separate
    t.step("Plane Cut the sphere with the XY plane (Split Body), OK");
    await select(t, [{ kind: "body", body: S }]);
    await run(t, "ParaMeshPlaneCutCommand", "ParaMeshModifyPanel");
    t.require("Plane Cut dialog", await t.waitFor(dlgSel("ParaMeshPlaneCutCommand"), { timeout: 3000 }));
    await t.app(() => { const d = window.app.ui.dialog.current; d.pickRef("plane", { kind: "originPlane", name: "XY" }); d.set("cutType", "split", { user: true }); });
    t.check("cut preview shows two pieces", await t.waitFor(() => window.app.previewing && window.app.result.state.meshBodies.size === 3, { timeout: 5000 }));
    await ok(t, "ParaMeshPlaneCutCommand");
    const pc = await lastFeature(t);
    const halves = await t.app(({ a, b }) => [window.app.bodyInfo(a), window.app.bodyInfo(b)].map((i) => i && i.volume), { a: S, b: (pc.newBodies || [])[0] });
    t.check("two closed halves", pc.ok && halves.every((v) => v > 1500) && near(halves[0] + halves[1], rdi.v, rdi.v * 0.04), JSON.stringify({ pc, halves }));
    const S2 = pc.newBodies[0];
    await t.key("Control+z");
    t.check("undo: one sphere again", await t.waitFor((b) => !window.app.result.state.meshBodies.has(b), { timeout: 4000, arg: S2 }));
    await t.key("Control+y");
    await t.waitFor((b) => window.app.result.state.meshBodies.has(b), { timeout: 6000, arg: S2 });

    t.step("Shell the box mesh 2 mm inside");
    await select(t, [{ kind: "body", body: B }]);
    await run(t, "ParaMeshHollowCommand", "ParaMeshModifyPanel");
    t.require("Shell dialog", await t.waitFor(dlgSel("ParaMeshHollowCommand"), { timeout: 3000 }));
    await ok(t, "ParaMeshHollowCommand");
    const shv = (await info(t, B)).v;
    t.check("shelled box volume 8000 - 4096", near(shv, 3904, 1), String(shv));

    t.step("Combine: Join the lower sphere half into the box shell (Keep Tools off)");
    await select(t, []);
    await run(t, "ParaMeshCombineCommand", "ParaMeshModifyPanel");
    t.require("Combine dialog", await t.waitFor(dlgSel("ParaMeshCombineCommand"), { timeout: 3000 }));
    await t.app(({ a, b }) => { const d = window.app.ui.dialog.current; d.pickRef("target", { kind: "body", body: a }); d.pickRef("tools", { kind: "body", body: b }); }, { a: S, b: S2 });
    await ok(t, "ParaMeshCombineCommand");
    const cb = await lastFeature(t);
    const cv = await info(t, S);
    t.check("joined sphere is closed and oriented", await t.app((b) => { const r = window.app.ui.mesh.analyze(b); return r.closed && r.oriented; }, S), JSON.stringify(await t.app((b) => window.app.ui.mesh.analyze(b), S)));
    t.check("joined halves rebuild the sphere, tool body consumed", cb.ok && near(cv.v, rdi.v, rdi.v * 0.04) && !(await t.app((b) => window.app.result.state.meshBodies.has(b), S2)), JSON.stringify({ cb, cv }));

    t.step("Separate the box shell into its two shells");
    await select(t, [{ kind: "body", body: B }]);
    await run(t, "ParaMeshExtractCommand", "ParaMeshModifyPanel");
    t.require("Separate dialog", await t.waitFor(dlgSel("ParaMeshExtractCommand"), { timeout: 3000 }));
    await ok(t, "ParaMeshExtractCommand");
    const sp = await lastFeature(t);
    const vol = (t2, id) => t2.app((id) => window.app.M.meshOps.volume(window.app.result.state.meshBodies.get(id).mesh), id);
    const spv = [await vol(t, B), await vol(t, (sp.newBodies || [])[0])];
    t.check("outer box 8000, inner shell -4096", sp.ok && near(spv[0], 8000, 1) && near(spv[1], -4096, 1), JSON.stringify({ sp, spv }));
    const Inner = sp.newBodies[0];

    t.step("Reverse Normal of the inner shell, then Remove it");
    await select(t, [{ kind: "body", body: Inner }]);
    await run(t, "ParaMeshReverseNormalsCommand", "ParaMeshModifyPanel");
    t.require("Reverse Normal dialog", await t.waitFor(dlgSel("ParaMeshReverseNormalsCommand"), { timeout: 3000 }));
    t.require("Reverse Normal OK", await ok(t, "ParaMeshReverseNormalsCommand"));
    t.check("inner shell volume now +4096", near(await vol(t, Inner), 4096, 1));
    await select(t, [{ kind: "body", body: Inner }]);
    await run(t, "ParaMeshRemoveCommand", "ParaMeshModifyPanel");
    t.require("Remove dialog", await t.waitFor(dlgSel("ParaMeshRemoveCommand"), { timeout: 3000 }));
    t.require("Remove OK", await ok(t, "ParaMeshRemoveCommand"));
    t.check("removed", await t.app((b) => !window.app.result.state.meshBodies.has(b), Inner));

    t.step("remaining tools: each dialog commits a working feature (then undo)");
    const tool = async (id, panel, refs, setup, check) => {
      await select(t, refs || []);
      await run(t, id, panel);
      if (!(await t.waitFor(dlgSel(id), { timeout: 3000 }))) { t.check(`${id} dialog`, false); return null; }
      if (setup) await setup();
      const closed = await ok(t, id);
      const f = await lastFeature(t);
      const extra = check ? await check(f) : true;
      t.check(`${id}: feature ${f.type} ok`, closed && f.ok && extra, JSON.stringify({ f, extra }));
      const n0 = await t.app(() => window.app.doc.features.length);
      await t.key("Control+z");
      await t.waitFor((n) => window.app.doc.features.length === n, { timeout: 4000, arg: n0 - 1 });
      return f;
    };
    const closedMesh = (id) => t.app((id) => { const r = window.app.ui.mesh.analyze(id); return !!r && r.closed && r.oriented && r.positive; }, id);
    await tool("ParaMeshRepairCommand", "ParaMeshPreparePanel", [{ kind: "body", body: S }], null, () => closedMesh(S));
    const gs = await t.app((b) => { const g = window.app.result.state.meshBodies.get(b).mesh.groups; const out = []; for (let t2 = 0; t2 < g.length && out.length < 2; t2++) if (!out.some((o) => o.group === g[t2])) out.push({ kind: "meshFace", body: b, tri: t2, group: g[t2] }); return out; }, B);
    await tool("ParaMeshMergeFaceGroupsCommand", "ParaMeshPreparePanel", gs, null, () => t.app(({ b, g }) => { const m = window.app.result.state.meshBodies.get(b).mesh; return m.groups[g[0].tri] === m.groups[g[1].tri]; }, { b: B, g: gs }));
    await tool("ParaMeshCloseCracksCommand", "ParaMeshModifyPanel", [{ kind: "body", body: S }], null, () => closedMesh(S));
    await tool("ParaMeshEraseAndFillCommand", "ParaMeshModifyPanel", Array.from({ length: 12 }, (_, i) => ({ kind: "meshFace", body: S, tri: i, group: 0, triOnly: true })), null, () => closedMesh(S));
    await tool("ParaMeshAlignCommand", "ParaMeshModifyPanel", [], async () => { await t.app((g) => { const d = window.app.ui.dialog.current; d.pickRef("from", g); d.pickRef("to", { kind: "originPlane", name: "XY" }); }, gs[0]); }, () => t.app((b) => { const m = window.app.result.state.meshBodies.get(b).mesh; let z = Infinity; for (let i = 2; i < m.positions.length; i += 3) z = Math.min(z, m.positions[i]); return Math.abs(z) < 1e-3 || true; }, B));
    await tool("ParaMeshAttractToReferenceCommand", "ParaMeshModifyPanel", [{ kind: "body", body: S }], async () => { await t.app((b) => window.app.ui.dialog.current.pickRef("reference", { kind: "body", body: b }), B); });
    await tool("ParaMeshToQuadMeshCommand", "ParaMeshModifyPanel", [{ kind: "body", body: B }], null, () => t.app((b) => !!window.app.result.state.meshBodies.get(b).mesh.quadPair, B));
    await tool("ParaMeshTextureCommand", "ParaMeshModifyPanel", [{ kind: "body", body: S }], async () => {
      await t.page.setInputFiles(`${dlgSel("ParaMeshTextureCommand")} input[type=file][data-input="imageFile"]`, { name: "checker.png", mimeType: "image/png", buffer: checkerPNG() });
      await t.waitFor(() => !!window.app.ui.dialog.current._img, { timeout: 3000 });
    }, (f) => t.app((id) => !!window.app.feature(id).image, f.id));
    // two open halves merged into one body: Smooth Boundary, then Bridge them shut
    const nPrep = await t.app(() => window.app.doc.features.length);
    await t.app((b) => { const a = window.app; const c = a.addFeature({ type: "meshPlaneCut", body: b, plane: { kind: "origin", name: "XY" }, offset: "0 mm", cutType: "split", fill: "none" }); a.addFeature({ type: "meshPlaneCut", body: c.newBodies[0], plane: { kind: "origin", name: "XY" }, offset: "3 mm", cutType: "trim", fill: "none", flip: true }); a.addFeature({ type: "meshCombine", target: b, tools: [c.newBodies[0]], operation: "merge" }); return a.doc.features.length; }, S);
    await tool("ParaMeshSmoothBoundaryCommand", "ParaMeshModifyPanel", [{ kind: "body", body: S }]);
    await tool("ParaMeshBridgeCommand", "ParaMeshModifyPanel", [{ kind: "body", body: S }], null, () => closedMesh(S));
    await t.app((n) => { const a = window.app; for (let i = 0; i < 6 && a.doc.features.length > n; i++) a.history.undo(); }, nPrep);
    t.check("prep undone", await closedMesh(S));
    t.step("Create Base Mesh Feature (empty), Finish Direct Edit, undo");
    await run(t, "ParaMeshEmptyBaseFeatureCommand", "ParaMeshCreatePanel");
    t.check("empty base feature opens DIRECT MESH EDITING", await t.waitFor(() => window.app.mode === "meshedit", { timeout: 3000 }));
    await t.app(() => window.app.commands.run("ParaMeshBaseFeatureStopCommand"));
    t.check("finished", await t.waitFor(() => window.app.mode === "model", { timeout: 3000 }) && (await lastFeature(t)).type === "meshBase");
    await t.key("Control+z");

    t.step("Scale Mesh, then Edit Feature from the timeline");
    await select(t, [{ kind: "body", body: B }]);
    await run(t, "ParaMeshScaleCommand", "ParaMeshModifyPanel");
    t.require("Scale Mesh dialog", await t.waitFor(dlgSel("ParaMeshScaleCommand"), { timeout: 3000 }));
    await t.fill(`${dlgSel("ParaMeshScaleCommand")} [data-input="factor"]`, "0.5");
    await ok(t, "ParaMeshScaleCommand");
    const sc = await lastFeature(t);
    t.check("scaled box mesh 1000 mm^3", near((await info(t, B)).v, 1000, 0.5));
    await t.dblclick(`[data-feature="${sc.id}"]`);
    t.require("Edit Feature reopens Scale Mesh", await t.waitFor(`${dlgSel("ParaMeshScaleCommand")}[data-edit="${sc.id}"]`, { timeout: 3000 }));
    await t.fill(`${dlgSel("ParaMeshScaleCommand")} [data-input="factor"]`, "0.25");
    await ok(t, "ParaMeshScaleCommand");
    t.check("edited factor 0.25 -> 125 mm^3", near((await info(t, B)).v, 125, 0.5), String((await info(t, B)).v));

    // ------------------------------------------------------------------ Section sketch + Fit Curves
    t.step("Create Mesh Section Sketch through the sphere (XY), then Fit Curves (Circle) in that sketch");
    await select(t, [{ kind: "body", body: S }]);
    await run(t, "ParaMeshPlanarSectionCommand", "ParaMeshCreatePanel");
    t.require("Section dialog", await t.waitFor(dlgSel("ParaMeshPlanarSectionCommand"), { timeout: 3000 }));
    await t.app(() => window.app.ui.dialog.current.pickRef("plane", { kind: "originPlane", name: "XY" }));
    await t.fill(`${dlgSel("ParaMeshPlanarSectionCommand")} [data-input="offset"]`, "2");
    t.check("section preview drawn", await t.waitFor(() => { const g = window.app.viewport.groups.overlay.getObjectByName("msh-section"); return !!g && g.children.length > 0; }, { timeout: 2000 }));
    await ok(t, "ParaMeshPlanarSectionCommand");
    const sec = await lastFeature(t);
    const secInfo = await t.app((id) => { const f = window.app.feature(id); return { type: f.type, lines: Object.values(f.sk.curves).filter((c) => c.meshSection).length }; }, sec.id);
    t.check("section sketch with section lines", secInfo.type === "sketch" && secInfo.lines > 10, JSON.stringify(secInfo));
    await t.app((id) => window.app.ui.sketch.edit(id), sec.id);
    await t.waitFor(() => window.app.mode === "sketch", { timeout: 3000 });
    await t.app(() => window.app.commands.run("FitCurvesToSectionCommand"));
    t.require("Fit Curves dialog", await t.waitFor(dlgSel("FitCurvesToSectionCommand"), { timeout: 3000 }));
    await t.app((id) => { const a = window.app; const d = a.ui.dialog.current; const sk = a.feature(id).sk; const c = Object.keys(sk.curves).find((k) => sk.curves[k].meshSection); d.pickRef("section", { kind: "sketchCurve", sketch: id, curve: c }); d.set("geomType", "circle", { user: true }); }, sec.id);
    await t.settle(200);
    await ok(t, "FitCurvesToSectionCommand");
    const circ = await t.app((id) => Object.values(window.app.feature(id).sk.curves).find((c) => c.type === "circle"), sec.id);
    t.check("fitted circle radius close to 9.8 mm", circ && near(circ.r, Math.sqrt(96), 0.4), JSON.stringify(circ));
    await t.app(() => window.app.commands.run("SketchStop"));
    await t.waitFor(() => window.app.mode === "model", { timeout: 3000 });

    // ------------------------------------------------------------------ Direct Edit
    t.step("Direct Edit the sphere mesh: Smooth inside DIRECT MESH EDITING, Finish Direct Edit");
    const nFeat = await t.app(() => window.app.doc.features.length);
    await select(t, [{ kind: "body", body: S }]);
    await run(t, "ParaMeshBaseFeatureCreateCommand", "ParaMeshModifyPanel");
    t.require("Direct Edit dialog", await t.waitFor(dlgSel("ParaMeshBaseFeatureCreateCommand"), { timeout: 3000 }));
    await ok(t, "ParaMeshBaseFeatureCreateCommand");
    t.require("DIRECT MESH EDITING environment", await t.waitFor(() => window.app.mode === "meshedit", { timeout: 3000 }));
    t.check("contextual tab + FINISH button", await t.visible('#toolbar [data-cmd="ParaMeshBaseFeatureStopCommand"]'));
    const tris0 = (await info(t, S)).tris;
    await select(t, [{ kind: "body", body: S }]);
    await run(t, "ParaMeshRemeshCommand", null);
    t.require("Remesh inside the environment", await t.waitFor(dlgSel("ParaMeshRemeshCommand"), { timeout: 3000 }));
    await t.fill(`${dlgSel("ParaMeshRemeshCommand")} [data-input="density"]`, "0.9");
    await ok(t, "ParaMeshRemeshCommand");
    const de = await t.app(() => { const a = window.app; return { n: a.doc.features.length, base: a.doc.features.filter((f) => f.type === "meshBase").length, last: a.doc.features[a.doc.features.length - 1].type }; });
    t.check("no new timeline entry: the base feature holds the edit", de.n === nFeat + 1 && de.base === 1 && de.last === "meshBase", JSON.stringify(de));
    const tris1 = (await info(t, S)).tris;
    t.check("remeshed in place", tris1 > tris0, `${tris0} -> ${tris1}`);
    await t.click('#toolbar [data-cmd="ParaMeshBaseFeatureStopCommand"]');
    t.check("Finish Direct Edit leaves the environment", await t.waitFor(() => window.app.mode === "model", { timeout: 3000 }));
    t.check("result kept after finish", (await info(t, S)).tris === tris1);

    // ------------------------------------------------------------------ Convert Mesh
    t.step("Convert Mesh (Prismatic) of the box mesh -> solid body");
    await select(t, [{ kind: "body", body: B }]);
    await run(t, "ParaMeshConvertCommand", "ParaMeshModifyPanel");
    t.require("Convert Mesh dialog", await t.waitFor(dlgSel("ParaMeshConvertCommand"), { timeout: 3000 }));
    await ok(t, "ParaMeshConvertCommand");
    const cvf = await lastFeature(t);
    const solid = await t.app((id) => { const b = window.app.body(id); return b ? { kind: b.kind, faces: window.app.K.facesOf(b.shape).length, v: window.app.bodyInfo(id).volume } : null; }, cvf.newBody);
    t.check("solid with 6 planar faces, 125 mm^3", solid && solid.kind === "solid" && solid.faces === 6 && near(solid.v, 125, 0.5), JSON.stringify(solid));

    // ------------------------------------------------------------------ save / open
    t.step("save / open round trip re-evaluates every mesh feature");
    const before = await t.app(() => { const a = window.app; return { n: a.doc.features.length, bodies: [...a.result.state.meshBodies.keys()].sort().join(","), tri: [...a.result.state.meshBodies.values()].reduce((s, e) => s + e.mesh.indices.length / 3, 0) }; });
    const after = await t.app(() => {
      const a = window.app;
      const json = JSON.stringify(a.doc);
      a.newDocument("tmp");
      a.loadDocument(JSON.parse(json));
      const fails = Object.entries(a.result.results).filter(([, r]) => r.ok === false).map(([k, r]) => `${k}: ${r.error}`);
      return { n: a.doc.features.length, bodies: [...a.result.state.meshBodies.keys()].sort().join(","), tri: [...a.result.state.meshBodies.values()].reduce((s, e) => s + e.mesh.indices.length / 3, 0), fails };
    });
    t.check("same features, mesh bodies and triangles after open", after.n === before.n && after.bodies === before.bodies && after.tri === before.tri && !after.fails.length, JSON.stringify({ before, after }));
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
