// INSERT panel through the real UI: Insert Component from a design file (external component, link badge, Move
// dialog, undo, document round trip), Edit In Place (mode toolbar, Reference Objects, Visibility Control, Stop),
// Insert Derive / Derive, Fasteners + Fastener Stack Analysis, Decal, Arrange, Find Similar Components,
// Replace with Primitives.
import zlib from "node:zlib";
import { defineScenario, mainIfDirect, apiBox, near } from "../lib.mjs";

async function until(t, fn, ms = 6000) { const t0 = Date.now(); for (;;) { if (await fn()) return true; if (Date.now() - t0 > ms) return false; await t.frames(2); } }
const DLG = (id) => `.dlg[data-dialog="${id}"]`;
const fileJson = (name, json) => ({ name, mimeType: "application/json", buffer: Buffer.from(json, "utf8") });
const designJson = (t) => t.app(() => JSON.stringify({ format: "fusion-recreation-design", version: 1, savedAt: Date.now(), doc: window.app.doc }));
const run = (t, id) => t.app((cmd) => { window.app.commands.run(cmd); }, id);
const ok = async (t, id) => { await t.click(`${DLG(id)} [data-action="ok"]`); await until(t, async () => !(await t.visible(DLG(id)))); };
const bodiesN = async (t) => (await t.state()).bodies.length;
const featuresOf = async (t, type) => (await t.state()).features.filter((f) => f.type === type);
const roundTrip = (t) => t.app(() => { const a = window.app; a.loadDocument(JSON.parse(JSON.stringify(a.doc))); });

const CRC = (() => {
  const tb = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; }
  return (buf) => { let c = 0xffffffff; for (const b of buf) c = tb[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
function makePNG(w, h, rgb) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (1 + w * 3) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function partInsert(t) {
  // the source design: one 20 x 10 x 5 box
  await apiBox(t, { L: 20, W: 10, H: 5 });
  const src = await designJson(t);
  await t.app(() => window.app.newDocument("Host"));
  await until(t, async () => (await bodiesN(t)) === 0);
  await apiBox(t, { L: 40, W: 40, H: 2 });
  const undo0 = (await t.state()).undo;

  await run(t, "FusionImportCommandFromToolbar");
  await t.page.setInputFiles('input[type=file][data-input="insertComponentFile"]', fileJson("bracket.json", src));
  await until(t, async () => (await featuresOf(t, "insertcomp")).length === 1);
  let s = await t.state();
  t.check("Insert Component adds the bodies of the file", s.bodies.length === 2 && near(s.volume, 3200 + 1000, 1), `bodies ${s.bodies.length} volume ${s.volume}`);
  t.check("the insert feature evaluates", s.features.find((f) => f.type === "insertcomp").ok === true);
  await until(t, () => t.visible(DLG("FusionMoveCommand")));
  t.check("Move/Copy opens after the insert", await t.visible(DLG("FusionMoveCommand")));
  await t.click(`${DLG("FusionMoveCommand")} [data-action="cancel"]`);
  const info = await t.app(() => {
    const a = window.app; const f = a.doc.features.find((q) => q.type === "insertcomp"); const x = a.doc.xrefs[f.xref];
    return { fid: f.id, occ: f.newOcc, label: a.components.label(f.newOcc), file: x.file, stamp: x.stamp, external: a.insertx.xref.isExternal(f.newOcc) };
  });
  t.check("link record keeps the file name and a version stamp", info.file === "bracket.json" && info.stamp === 1 && info.external, JSON.stringify(info));
  t.check("the component is named after the file", /^bracket/.test(info.label), info.label);
  await until(t, () => t.visible(`[data-node="occ:${info.occ}"] .ix-link`));
  t.check("browser shows the component as external", await t.visible(`[data-node="occ:${info.occ}"] .ix-link`));
  t.check("one undo step for the insert", (await t.state()).undo === undo0 + 1, `${(await t.state()).undo} vs ${undo0}`);
  await t.shot("insert-component");

  await t.app(() => window.app.history.undo());
  t.check("undo removes the inserted component", (await bodiesN(t)) === 1);
  await t.app(() => window.app.history.redo());
  t.check("redo restores it", (await bodiesN(t)) === 2);

  await roundTrip(t);
  await until(t, async () => (await bodiesN(t)) === 2);
  const kept = await t.app(() => { const a = window.app; const f = a.doc.features.find((q) => q.type === "insertcomp"); return !!(a.doc.xrefs && a.doc.xrefs[f.xref] && a.insertx.xref.isExternal(f.newOcc)); });
  t.check("save/open keeps the link and the bodies", kept && near((await t.state()).volume, 4200, 1));

  // a file that is not a design
  await run(t, "FusionImportCommandFromToolbar");
  await t.page.setInputFiles('input[type=file][data-input="insertComponentFile"]', fileJson("bad.json", "{\"hello\":1}"));
  await t.frames(4);
  t.check("a wrong file is refused", (await featuresOf(t, "insertcomp")).length === 1);
  return info;
}

async function partEditInPlace(t, info) {
  const before = await t.state();
  // through the browser context menu when possible
  let entered = false;
  try {
    await t.page.click(`[data-node="occ:${info.occ}"]`, { button: "right", timeout: 3000 });
    await t.page.getByText("Edit In Place", { exact: true }).first().click({ timeout: 2000 });
    entered = true;
  } catch { await t.escapeAll(1); }
  if (!entered) { t.note("context menu item not clickable; started Edit In Place through the API"); await t.app((fid) => { window.app.insertx.xref.editInPlace(fid); }, info.fid); }
  const BAR = '.tb-modebar[data-modebar="insertx-eip"]';
  await until(t, () => t.visible(BAR));
  let s = await t.state();
  t.check("Edit In Place shows the design of the component", s.bodies.length === 1 && near(s.volume, 1000, 1) && s.features.length === 1, `bodies ${s.bodies.length} features ${s.features.length}`);
  const barText = await t.page.textContent(`${BAR} .tb-modebar-label`);
  t.check("mode toolbar names the component", /Edit In Place/.test(barText || ""), barText);
  await t.frames(3);
  t.check("Associative is on by default", await t.page.evaluate((b) => document.querySelector(`${b} [data-cmd="EIPAssociativeToggleCmd"]`).classList.contains("ix-on"), BAR));

  // local edit: a second body
  await apiBox(t, { L: 5, W: 5, H: 5 });
  t.check("local edit inside the component", (await bodiesN(t)) === 2);

  // non-associative refuses Reference Objects
  await t.click(`${BAR} [data-cmd="EIPNonAssociativeToggleCmd"]`);
  t.check("Non-associative toggles", await t.page.evaluate((b) => document.querySelector(`${b} [data-cmd="EIPNonAssociativeToggleCmd"]`).classList.contains("ix-on") && !document.querySelector(`${b} [data-cmd="EIPAssociativeToggleCmd"]`).classList.contains("ix-on"), BAR));
  await t.click(`${BAR} [data-cmd="ReferenceObjectsCmd"]`);
  await t.frames(3);
  t.check("Reference Objects is unavailable when non-associative", !(await t.visible(DLG("ReferenceObjectsCmd"))));
  await t.click(`${BAR} [data-cmd="EIPAssociativeToggleCmd"]`);

  // Reference Objects: the host plate
  await t.click(`${BAR} [data-cmd="ReferenceObjectsCmd"]`);
  await until(t, () => t.visible(DLG("ReferenceObjectsCmd")));
  await t.click(`${DLG("ReferenceObjectsCmd")} .ix-list input[type=checkbox]`);
  await ok(t, "ReferenceObjectsCmd");
  s = await t.state();
  t.check("Reference Objects brings the assembly body in", s.bodies.length === 3 && near(s.volume, 1000 + 125 + 3200, 1) && s.features.some((f) => f.type === "eipref" && f.ok), `bodies ${s.bodies.length} volume ${s.volume}`);

  // Visibility Control
  await t.click(`${BAR} [data-cmd="EIPVisibilityControlCmd"]`);
  await until(t, () => t.visible(DLG("EIPVisibilityControlCmd")));
  await t.shot("edit-in-place");
  await t.click(`${DLG("EIPVisibilityControlCmd")} [data-input="show"]`);
  const hidden = await t.app(() => { const g = window.app.viewport.scene.getObjectByName("insertx-eip-context"); return !!g && g.visible === false && g.children.length === 1; });
  t.check("Visibility Control hides the assembly context", hidden);
  await ok(t, "EIPVisibilityControlCmd");

  // Stop Edit In Place
  await t.click(`${BAR} [data-cmd="EndEditInPlaceCmd"]`);
  await until(t, async () => !(await t.visible(BAR)));
  s = await t.state();
  t.check("Stop Edit In Place returns to the assembly with the edit", s.bodies.length === 3 && near(s.volume, 3200 + 1000 + 125, 1), `bodies ${s.bodies.length} volume ${s.volume}`);
  const stamp = await t.app(() => { const a = window.app; const f = a.doc.features.find((q) => q.type === "insertcomp"); return a.doc.xrefs[f.xref].stamp; });
  t.check("the link gets a new version stamp", stamp === 2, String(stamp));
  t.check("the host undo history is kept, plus one step", s.undo === before.undo + 1, `${s.undo} vs ${before.undo}`);
  await t.app(() => window.app.history.undo());
  t.check("undo reverts the in-place edit", (await bodiesN(t)) === 2);
  await t.app(() => window.app.history.redo());
  t.check("redo re-applies it", (await bodiesN(t)) === 3);
  await roundTrip(t);
  await until(t, async () => (await bodiesN(t)) === 3);
  t.check("save/open keeps the edited component", near((await t.state()).volume, 4325, 1));
}

async function partDerive(t) {
  // the source: two boxes, a sketch, a construction plane and a user parameter
  await t.app(() => window.app.newDocument("Source"));
  await until(t, async () => (await bodiesN(t)) === 0);
  await apiBox(t, { L: 10, W: 10, H: 10 });
  await apiBox(t, { L: 6, W: 6, H: 6, center: [30, 0] });
  await t.app(() => {
    const a = window.app; const { S, K } = a;
    const sk = S.newSketch();
    S.addRect2pt(sk, [-4, -3], [4, 3]);
    a.addFeature({ type: "sketch", plane: K.ORIGIN_PLANES.XY, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
    a.addFeature({ type: "cplane", mode: "offset", base: { kind: "origin", name: "XY" }, offset: "20 mm" });
    a.mutate("Add Parameter", (d) => { d.params.push({ name: "wall", expr: "3 mm", kind: "length", unit: "mm", comment: "" }); });
  });
  const src = await designJson(t);
  await t.app(() => window.app.newDocument("DeriveHost"));
  await until(t, async () => (await bodiesN(t)) === 0);
  await apiBox(t, { L: 40, W: 40, H: 2 });
  const undo0 = (await t.state()).undo;

  const D = DLG("PullDeriveCommand");
  await run(t, "PullDeriveCommand");
  await until(t, () => t.visible(D));
  t.check("Insert Derive needs a source file first", await t.page.isDisabled(`${D} [data-action="ok"]`));
  await t.click(`${D} [data-input="source"]`);
  await t.page.setInputFiles('input[type=file][data-input="deriveFile"]', fileJson("source.json", src));
  await until(t, () => t.visible(`${D} .ix-list[data-list="objects"] input[type=checkbox]`));
  const boxes = () => t.page.evaluate((d) => [...document.querySelectorAll(`${d} .ix-list input[type=checkbox]`)].map((c) => ({ key: c.dataset.key, on: c.checked })), D);
  let list = await boxes();
  const kind = (p) => list.filter((c) => c.key.startsWith(p));
  t.check("Insert Derive lists bodies, sketches, construction planes and parameters of the file",
    kind("b:").length === 2 && kind("s:").length === 1 && kind("p:").length === 1 && kind("u:").length === 1 && kind("b:").every((c) => c.on) && !kind("s:")[0].on,
    JSON.stringify(list));
  // one body, the sketch, the plane and the parameter
  await t.click(`${D} .ix-list input[data-key="${kind("b:")[1].key}"]`);
  await t.click(`${D} .ix-list input[data-key="${kind("s:")[0].key}"]`);
  await t.click(`${D} .ix-list input[data-key="${kind("p:")[0].key}"]`);
  await t.click(`${D} .ix-list input[data-key="u:wall"]`);
  await t.shot("insert-derive");
  await ok(t, "PullDeriveCommand");
  let s = await t.state();
  const got = await t.app(() => {
    const a = window.app; const f = a.doc.features.find((q) => q.type === "derive"); const x = f && a.doc.xrefs[f.xref];
    return { fid: f && f.id, file: x && x.file, stamp: x && x.stamp, sketches: a.doc.features.filter((q) => q.type === "sketch").length, planes: a.doc.features.filter((q) => q.type === "cplane").length, wall: (a.doc.params || []).some((p) => p.name === "wall"), skOk: [...a.result.state.sketches.values()].length, plOk: [...a.result.state.planes.values()].length };
  });
  t.check("Derive feature brings the chosen body in", s.bodies.length === 2 && near(s.volume, 3200 + 1000, 1) && s.features.some((f) => f.type === "derive" && f.ok), `bodies ${s.bodies.length} volume ${s.volume}`);
  t.check("derived sketch, construction plane and parameter arrive", got.sketches === 1 && got.planes === 1 && got.wall && got.skOk === 1 && got.plOk === 1 && s.features.every((f) => f.ok), JSON.stringify(got));
  t.check("the derive keeps a link record", got.file === "source.json" && got.stamp === 1, JSON.stringify(got));
  t.check("one undo step for the derive", s.undo === undo0 + 1, `${s.undo} vs ${undo0}`);
  await t.app(() => window.app.history.undo());
  s = await t.state();
  t.check("undo removes everything that was derived", s.bodies.length === 1 && s.features.length === 1, `bodies ${s.bodies.length} features ${s.features.length}`);
  await t.app(() => window.app.history.redo());
  t.check("redo restores the derive", (await bodiesN(t)) === 2);
  await roundTrip(t);
  await until(t, async () => (await bodiesN(t)) === 2);
  s = await t.state();
  t.check("save/open keeps the derive", near(s.volume, 4200, 1) && s.features.every((f) => f.ok));

  // Edit Feature: add the second body of the source
  await t.app((fid) => { window.app.editFeature(fid); }, got.fid);
  await until(t, () => t.visible(`${D} .ix-list[data-list="objects"] input[type=checkbox]`));
  list = await boxes();
  t.check("Edit Derive shows the current choice", list.length === 2 && list.filter((c) => c.on).length === 1, JSON.stringify(list));
  await t.click(`${D} .ix-list input[data-key="${list.find((c) => !c.on).key}"]`);
  await ok(t, "PullDeriveCommand");
  await until(t, async () => (await bodiesN(t)) === 3);
  s = await t.state();
  t.check("Edit Derive adds the second body", s.bodies.length === 3 && near(s.volume, 4200 + 216, 1), `bodies ${s.bodies.length} volume ${s.volume}`);

  // Derive (push): one body to a new design file
  const P = DLG("PushDeriveCommand");
  const first = await t.app(() => { const a = window.app; const f = a.doc.features.find((q) => q.type === "derive"); return f.newBodies[0]; });
  await t.app((b) => {
    const a = window.app;
    window.__ixDl = [];
    window.__ixDownload = a.download;
    a.download = async (name, data) => { window.__ixDl.push({ name, data: typeof data === "string" ? data : "" }); };
    a.selection.set([{ kind: "body", body: b }]);
    a.commands.run("PushDeriveCommand");
  }, first);
  await until(t, () => t.visible(P));
  await t.click(`${P} .ix-list input[data-key="u:wall"]`);
  await ok(t, "PushDeriveCommand");
  await until(t, () => t.app(() => window.__ixDl.length > 0));
  const pushed = await t.app(() => {
    const a = window.app; const d = window.__ixDl[0];
    a.download = window.__ixDownload;
    let doc = null;
    try { doc = JSON.parse(d.data); } catch { doc = null; }
    return { name: d.name, format: doc && doc.format, features: doc && doc.doc.features.map((f) => f.type), params: doc && doc.doc.params.map((p) => p.name), text: d.data };
  });
  t.check("Derive downloads a new design file", /\(Derived\)\.json$/.test(pushed.name) && pushed.format === "fusion-recreation-design" && pushed.features.join() === "derive" && pushed.params.join() === "wall", JSON.stringify({ ...pushed, text: undefined }));
  const host = await designJson(t);
  await t.app((text) => { window.app.loadDocument(JSON.parse(text).doc); }, pushed.text);
  await until(t, async () => (await bodiesN(t)) === 1);
  s = await t.state();
  t.check("the new design opens with the derived body", s.bodies.length === 1 && near(s.volume, 1000, 1) && s.features.every((f) => f.ok), `bodies ${s.bodies.length} volume ${s.volume}`);
  await t.app((text) => { window.app.loadDocument(JSON.parse(text).doc); }, host);
  await until(t, async () => (await bodiesN(t)) === 3);
}

async function plateWithHole(t, name) {
  await t.app((n) => window.app.newDocument(n), name);
  await until(t, async () => (await bodiesN(t)) === 0);
  await apiBox(t, { L: 40, W: 40, H: 10 });
  await t.app(() => window.app.addFeature({ type: "cylinder", diameter: "6.6 mm", height: "10 mm", center: [0, 0], operation: "cut", plane: { kind: "origin", name: "XY" } }));
  return t.app(() => {
    const a = window.app; const b = [...a.result.state.bodies.keys()][0]; const shape = a.result.state.bodies.get(b).shape;
    const faces = a.K.topoOf(shape).faces; const index = faces.findIndex((f) => f.type === "CYLINDRE");
    const c = a.K.cylinderFaceInfo(shape, index);
    return { body: b, index, p: [c.o[0] + c.r, c.o[1], c.o[2] + c.len * 0.9], top: Math.max(c.o[2], c.o[2] + c.a[2] * c.len) };
  });
}

async function partFasteners(t) {
  const hole = await plateWithHole(t, "Fasteners");
  const plateVol = (await t.state()).volume;
  const undo0 = (await t.state()).undo;
  const D = DLG("FusionFastenersCommand");
  await t.app((h) => { const a = window.app; a.selection.set([{ kind: "face", body: h.body, index: h.index, p: h.p, n: [-1, 0, 0], planar: false }]); a.commands.run("FusionFastenersCommand"); }, hole);
  await until(t, () => t.visible(D));
  t.check("Fasteners opens with the preselected hole", (await t.app(() => (window.app.ui.dialog.current?.values.hole || []).length)) === 1);
  await t.click(`${D} [data-input="washer"]`);
  await t.click(`${D} [data-input="nut"]`);
  await t.frames(6);
  const status = await t.app(() => document.querySelector('.dlg[data-dialog="FusionFastenersCommand"] [data-info="fit"]')?.textContent || "");
  t.check("the size follows the hole (M6 in a 6.6 mm hole), length from the stack", /M6x1 x 25 mm in a 6\.6 mm hole/.test(status), status);
  await t.shot("fasteners");
  await ok(t, "FusionFastenersCommand");
  let s = await t.state();
  const info = await t.app(() => {
    const a = window.app; const f = a.doc.features.find((q) => q.type === "fastener");
    const st = a.result.state; const ids = f.newBodies.filter((id) => st.bodies.has(id));
    const top = ids.map((id) => a.K.bboxOf(st.bodies.get(id).shape).max[2]);
    return { fid: f.id, occ: f.newOcc, label: a.components.label(f.newOcc), n: ids.length, names: ids.map((id) => a.doc.bodies[id].name), headTop: Math.max(...top) };
  });
  t.check("bolt, two washers and a nut arrive in a new component", info.n === 4 && s.bodies.length === 5 && s.features.every((f) => f.ok) && s.volume > plateVol + 100, JSON.stringify(info));
  t.check("the component is named after the fastener", /^ISO 4762 - M6x1 x 25/.test(info.label), info.label);
  t.check("the head sits on the picked side of the hole", info.headTop > hole.top + 6 && info.headTop < hole.top + 8, String(info.headTop));
  t.check("one undo step", s.undo === undo0 + 1);
  await until(t, () => t.visible('[data-node="fasteners:root"]'));
  t.check("browser shows a Fasteners folder", await t.visible('[data-node="fasteners:root"]'));
  await t.app(() => window.app.history.undo());
  t.check("undo removes the fastener", (await bodiesN(t)) === 1);
  await t.app(() => window.app.history.redo());
  await roundTrip(t);
  await until(t, async () => (await bodiesN(t)) === 5);
  t.check("save/open keeps the fastener", (await t.state()).features.every((f) => f.ok));

  // Fastener Stack Analysis: the stack is fine
  const A = DLG("FusionFastenerStackAnalysisCommand");
  await run(t, "FusionFastenerStackAnalysisCommand");
  await until(t, () => t.visible(A));
  let rows = await t.page.evaluate((a) => [...document.querySelectorAll(`${a} tr[data-row]`)].map((r) => ({ bad: r.classList.contains("ix-bad"), text: r.textContent })), A);
  t.check("Fastener Stack Analysis lists the stack as OK", rows.length === 1 && !rows[0].bad, JSON.stringify(rows));
  await ok(t, "FusionFastenerStackAnalysisCommand");

  // Edit Fastener: no nut -> the analysis flags the stack
  await t.app((fid) => window.app.editFeature(fid), info.fid);
  await until(t, () => t.visible(D));
  await t.click(`${D} [data-input="nut"]`);
  await ok(t, "FusionFastenersCommand");
  await until(t, async () => (await bodiesN(t)) === 3);
  t.check("Edit Fastener without the nut keeps bolt and washer", (await bodiesN(t)) === 3);
  await run(t, "FusionFastenerStackAnalysisCommand");
  await until(t, () => t.visible(A));
  rows = await t.page.evaluate((a) => [...document.querySelectorAll(`${a} tr[data-row]`)].map((r) => ({ bad: r.classList.contains("ix-bad"), tip: r.title })), A);
  t.check("the analysis flags a bolt without a nut in a clearance hole", rows.length === 1 && rows[0].bad && /No nut/.test(rows[0].tip), JSON.stringify(rows));
  await ok(t, "FusionFastenerStackAnalysisCommand");

  // ANSI hex bolt through the dialog
  await t.app((fid) => window.app.editFeature(fid), info.fid);
  await until(t, () => t.visible(D));
  await t.page.evaluate((d) => { document.querySelector(`${d} [data-input="std"]`).value = "ANSI"; document.querySelector(`${d} [data-input="kind"]`).value = "hexbolt"; }, D);
  await t.frames(6);
  const st2 = await t.app(() => document.querySelector('.dlg[data-dialog="FusionFastenersCommand"] [data-info="fit"]')?.textContent || "");
  t.check("ANSI sizes follow the hole too (1/4-20)", /Hex Bolt 1\/4-20 x/.test(st2), st2);
  await ok(t, "FusionFastenersCommand");
  const lab = await t.app((o) => window.app.components.label(o), info.occ);
  t.check("Edit Fastener renames the component", /^ASME B18\.2\.1 - 1\/4-20/.test(lab) && (await t.state()).features.every((f) => f.ok), lab);
}

async function partDecal(t) {
  await t.app(() => window.app.newDocument("Decal"));
  await until(t, async () => (await bodiesN(t)) === 0);
  await apiBox(t, { L: 40, W: 20, H: 10 });
  const face = await t.app(() => {
    const a = window.app; const b = [...a.result.state.bodies.keys()][0]; const shape = a.result.state.bodies.get(b).shape;
    const index = a.K.topoOf(shape).faces.findIndex((f) => f.type === "PLANE" && f.n && f.n[2] > 0.99);
    return { body: b, index };
  });
  const undo0 = (await t.state()).undo;
  const D = DLG("FusionAddEditDecalCommand");
  await t.app((f) => { const a = window.app; a.selection.set([{ kind: "face", body: f.body, index: f.index, p: [0, 0, 10], n: [0, 0, 1], planar: true }]); a.commands.run("FusionAddEditDecalCommand"); }, face);
  await until(t, () => t.visible(D));
  t.check("Decal needs an image first", await t.page.isDisabled(`${D} [data-action="ok"]`));
  await t.click(`${D} [data-input="image"]`);
  await t.page.setInputFiles('input[type=file][data-input="decalImage"]', { name: "logo.png", mimeType: "image/png", buffer: makePNG(8, 4, [220, 30, 30]) });
  const meshes = () => t.app(() => { const g = window.app.viewport.scene.getObjectByName("insertx-decals"); return g ? g.children.map((m) => ({ n: m.geometry.attributes.position.count, o: m.material.opacity, map: !!m.material.map })) : []; });
  await until(t, async () => (await meshes()).length === 1);
  t.check("the decal previews on the face", (await meshes()).length === 1 && (await meshes())[0].map);
  const size = await t.app(() => { const d = window.app.ui.dialog.current; return { w: d.num("width"), h: d.num("height") }; });
  t.check("Keep Aspect Ratio sizes the image (8 x 4 px)", size.w > 0 && Math.abs(size.h / size.w - 0.5) < 0.01, JSON.stringify(size));
  await t.page.fill(`${D} [data-input="x"]`, "5 mm");
  await t.page.press(`${D} [data-input="x"]`, "Tab");
  await t.frames(6);
  t.check("the move / rotate / scale manipulators show", (await t.page.locator(".dlg-hud, [data-manip]").count()) >= 0 && (await t.app(() => (window.app.ui.dialog.current.manips && window.app.ui.dialog.current.manips.screenPoint ? !!window.app.ui.dialog.current.manips.screenPoint("x") : false))));
  await t.shot("decal");
  await ok(t, "FusionAddEditDecalCommand");
  let s = await t.state();
  const info = await t.app(() => { const a = window.app; const f = a.doc.features.find((q) => q.type === "decal"); const r = a.featureResult(f.id); return { fid: f.id, ok: r && r.ok, o: r && r.decal && r.decal.o, img: f.image && f.image.data.slice(0, 14), name: f.name }; });
  t.check("Decal feature on the face, moved by X Distance", info.ok && near(info.o[0], 5, 0.01) && near(info.o[2], 10, 0.01) && info.img === "data:image/png", JSON.stringify(info));
  t.check("one undo step, the body is unchanged", s.undo === undo0 + 1 && s.bodies.length === 1 && near(s.volume, 8000, 1));
  await until(t, () => t.visible('[data-node="decals:root"]'));
  t.check("browser lists it in a Decals folder", await t.visible('[data-node="decals:root"]'));
  await t.app(() => window.app.history.undo());
  await until(t, async () => (await meshes()).length === 0);
  t.check("undo removes the decal", (await meshes()).length === 0);
  await t.app(() => window.app.history.redo());
  await roundTrip(t);
  await until(t, async () => (await meshes()).length === 1);
  t.check("save/open keeps the image", (await t.app(() => window.app.doc.features.find((q) => q.type === "decal").image.data.startsWith("data:image/png"))) && (await meshes()).length === 1);

  // Edit Decal: opacity and flip
  await t.app((fid) => window.app.editFeature(fid), info.fid);
  await until(t, () => t.visible(D));
  await t.page.evaluate((d) => { const r = document.querySelector(`${d} input[type=range][data-input="opacity"]`); r.value = "40"; r.dispatchEvent(new Event("input")); }, D);
  await t.click(`${D} [data-input="flipH"]`);
  await ok(t, "FusionAddEditDecalCommand");
  await t.frames(4);
  const m = await meshes();
  const ed = await t.app(() => { const f = window.app.doc.features.find((q) => q.type === "decal"); return { op: f.opacity, flip: f.flipH }; });
  t.check("Edit Decal changes opacity and flip", ed.op === 40 && ed.flip === true && m.length === 1 && Math.abs(m[0].o - 0.4) < 0.01, JSON.stringify({ ed, m }));
}

async function partLayout(t) {
  await t.app(() => window.app.newDocument("Layout"));
  await until(t, async () => (await bodiesN(t)) === 0);
  await apiBox(t, { L: 20, W: 10, H: 5, op: "newComponent", center: [0, 0] });
  await apiBox(t, { L: 20, W: 10, H: 5, op: "newComponent", center: [40, 40] });
  await apiBox(t, { L: 30, W: 30, H: 8, op: "newComponent", center: [-50, -50] });
  await t.app(() => window.app.addFeature({ type: "cylinder", diameter: "10 mm", height: "10 mm", center: [80, -80], operation: "new", plane: { kind: "origin", name: "XY" } }));
  const occs = await t.app(() => window.app.components.children("root"));
  t.check("three components and a body to work with", occs.length === 3 && (await bodiesN(t)) === 4, JSON.stringify(occs));

  // Find Similar Components
  const S = DLG("SimilarPartsCommand");
  await t.app((o) => { window.app.selection.set([{ kind: "occurrence", occ: o }]); window.app.commands.run("SimilarPartsCommand"); }, occs[0]);
  await until(t, () => t.visible(`${S} tr[data-row]`));
  const rows = await t.page.evaluate((d) => [...document.querySelectorAll(`${d} tr[data-row]`)].map((r) => ({ key: r.dataset.key, text: r.textContent })), S);
  t.check("Find Similar ranks the identical component first and leaves out the different one", rows.length >= 1 && rows[0].key === `o:${occs[1]}` && /100%/.test(rows[0].text) && !rows.some((r) => r.key === `o:${occs[2]}`), JSON.stringify(rows));
  await t.shot("find-similar");
  await ok(t, "SimilarPartsCommand");
  const sel = await t.app(() => window.app.selection.items.map((r) => r.occ || r.body));
  t.check("OK selects the similar components", sel.includes(occs[1]), JSON.stringify(sel));

  // Arrange the three components on XY in a 100 x 100 envelope
  const A = DLG("ArrangeCommand");
  const undo0 = (await t.state()).undo;
  await t.app((os) => { window.app.selection.set(os.map((o) => ({ kind: "occurrence", occ: o }))); window.app.commands.run("ArrangeCommand"); }, occs);
  await until(t, () => t.visible(A));
  await t.app(() => window.app.ui.dialog.current.setSelection("envelope", [{ kind: "originPlane", name: "XY" }]));
  for (const [id, v] of [["length", "100 mm"], ["width", "100 mm"], ["spacing", "4 mm"]]) { await t.page.fill(`${A} [data-input="${id}"]`, v); await t.page.press(`${A} [data-input="${id}"]`, "Tab"); }
  await t.frames(6);
  await t.shot("arrange");
  await ok(t, "ArrangeCommand");
  const boxes = () => t.app((os) => { const a = window.app; const st = a.result.state; return os.map((o) => { const ids = a.M.occBodiesDeep(st, o); const bb = a.K.bboxOf(st.bodies.get(ids[0]).shape); return { min: bb.min.map((v) => Math.round(v * 100) / 100), max: bb.max.map((v) => Math.round(v * 100) / 100) }; }); }, occs);
  let bb = await boxes();
  const inside = bb.every((b) => b.min[0] >= -1e-6 && b.min[1] >= -1e-6 && b.max[0] <= 100 + 1e-6 && b.max[1] <= 100 + 1e-6 && Math.abs(b.min[2]) < 1e-6);
  const apart = bb.every((a, i) => bb.every((b, j) => i >= j || a.max[0] + 4 - 1e-6 <= b.min[0] || b.max[0] + 4 - 1e-6 <= a.min[0] || a.max[1] + 4 - 1e-6 <= b.min[1] || b.max[1] + 4 - 1e-6 <= a.min[1]));
  let s = await t.state();
  t.check("Arrange lays the components out in the envelope on the plane, spaced apart", inside && apart && s.features.every((f) => f.ok), JSON.stringify(bb));
  t.check("one undo step for Arrange", s.undo === undo0 + 1);
  await t.app(() => window.app.history.undo());
  t.check("undo puts them back", JSON.stringify(await boxes()) !== JSON.stringify(bb));
  await t.app(() => window.app.history.redo());
  await roundTrip(t);
  await until(t, async () => (await bodiesN(t)) === 4);
  t.check("save/open keeps the arrangement", JSON.stringify(await boxes()) === JSON.stringify(bb));
  const aid = await t.app(() => window.app.doc.features.find((q) => q.type === "arrange").id);
  await t.app((id) => window.app.editFeature(id), aid);
  await until(t, () => t.visible(A));
  await t.page.fill(`${A} [data-input="length"]`, "35 mm");
  await t.page.fill(`${A} [data-input="width"]`, "35 mm");
  await t.page.press(`${A} [data-input="width"]`, "Tab");
  await ok(t, "ArrangeCommand");
  const res = await t.app((id) => window.app.featureResult(id), aid);
  t.check("a small envelope warns that not everything fits", res && res.overflow >= 1 && /not enough room/.test(res.warning || ""), JSON.stringify(res && { overflow: res.overflow, warning: res.warning }));

  // Replace with Primitives: the cylinder body becomes its bounding box
  const P = DLG("ReplaceWithPrimitivesCommand");
  const cyl = await t.app(() => { const a = window.app; return [...a.result.state.bodies.keys()].find((id) => !a.result.state.bodyOcc.get(id) || a.result.state.bodyOcc.get(id) === "root"); });
  const vol0 = (await t.state()).volume;
  await t.app((b) => { window.app.selection.set([{ kind: "body", body: b }]); window.app.commands.run("ReplaceWithPrimitivesCommand"); }, cyl);
  await until(t, () => t.visible(P));
  await ok(t, "ReplaceWithPrimitivesCommand");
  s = await t.state();
  t.check("Replace with Primitives turns the cylinder into its box", near(s.volume - vol0, 1000 - Math.PI * 25 * 10, 0.5) && s.bodies.length === 4 && s.features.every((f) => f.ok), `${s.volume - vol0}`);
  const pid = await t.app(() => window.app.doc.features.find((q) => q.type === "replaceprim").id);
  await t.app((id) => window.app.editFeature(id), pid);
  await until(t, () => t.visible(P));
  await t.page.evaluate((d) => { document.querySelector(`${d} [data-input="shape"]`).value = "cylinder"; }, P);
  await ok(t, "ReplaceWithPrimitivesCommand");
  s = await t.state();
  t.check("Edit: a bounding cylinder instead", near(s.volume - vol0, Math.PI * 50 * 10 - Math.PI * 25 * 10, 0.5), `${s.volume - vol0}`);
  await t.app(() => window.app.history.undo());
  await t.app(() => window.app.history.undo());
  t.check("undo restores the original body", near((await t.state()).volume, vol0, 0.01));
}

const PARTS = { insert: async (t) => partEditInPlace(t, await partInsert(t)), derive: partDerive, fasteners: partFasteners, decal: partDecal, layout: partLayout };

const def = defineScenario({
  name: "insertx",
  async run(t) {
    const only = (process.env.IX_ONLY || "").split(",").filter(Boolean);
    for (const [key, fn] of Object.entries(PARTS)) if (!only.length || only.includes(key)) await fn(t);
  },
});
export default def;
mainIfDirect(import.meta.url, def);
