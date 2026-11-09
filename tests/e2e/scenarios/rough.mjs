// rough: the wave 2b rough edges in shared code. Feature-face highlight (timeline hover / selection), timeline
// dependencies of patterns of features, Sweep along splines (sketch spline and spline edge, Orientation),
// the faster modeled thread, and Manage Threads Library (custom types offered by Thread and Hole > Tapped,
// saved in localStorage, export / import through files).
import { defineScenario, mainIfDirect, near, fmt } from "../lib.mjs";

const XY = { kind: "origin", name: "XY" };
const dlgSel = (id) => `.dlg[data-dialog="${id}"]`;
async function okDialog(t, id) {
  await t.settle(300);
  await t.waitFor((id) => { const b = document.querySelector(`.dlg[data-dialog="${id}"] [data-action="ok"]`); return !!b && !b.disabled; }, { timeout: 30000, arg: id });
  const en = await t.app((id) => { const b = document.querySelector(`.dlg[data-dialog="${id}"] [data-action="ok"]`); return !!b && !b.disabled; }, id);
  if (en) await t.click(`${dlgSel(id)} [data-action="ok"]`);
  await t.waitFor(() => !window.app.activeCommand, { timeout: 60000 });
  return en;
}
async function openCmd(t, id, tab, panel) {
  if (tab && !(await t.visible(`#toolbar [data-panel="${panel}"]`))) await t.click(`[data-tab="${tab}"]`, { timeout: 1500 });
  if (panel && (await t.click(`#toolbar [data-panel="${panel}"]`, { timeout: 1500 })) && (await t.waitFor(`#overlay [data-cmd="${id}"]`, { timeout: 1500 }))) await t.click(`#overlay [data-cmd="${id}"]`, { timeout: 1000 });
  if (await t.waitFor(dlgSel(id), { timeout: 2500 })) return "toolbar";
  await t.app((id) => window.app.commands.run(id), id);
  if (await t.waitFor(dlgSel(id), { timeout: 2500 })) { t.note(`${id}: opened through app.commands.run`); return "api"; }
  return null;
}
const vol = (t, id) => t.app((id) => { const b = window.app.body(id); return b ? window.app.K.volumeOf(b.shape) : null; }, id);

const scenario = defineScenario({
  name: "rough",
  title: "Rough edges: feature faces, pattern deps, spline sweep, fast threads, threads library",
  async run(t) {
    // ------------------------------------------------------------ 1. feature-face highlight
    t.step("1. hovering / selecting a timeline feature highlights only its faces");
    const m = await t.app(() => {
      const a = window.app;
      a.newDocument("Rough");
      try { localStorage.removeItem("fusion-recreation.threadsLibrary.v1"); } catch { /* */ }
      const box = a.addFeature({ type: "box", length: "40 mm", width: "20 mm", height: "10 mm", center: [0, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
      const cut = a.addFeature({ type: "cylinder", diameter: "6 mm", height: "40 mm", center: [-10, 0], operation: "cut", plane: { kind: "origin", name: "XY" } });
      const boss = a.addFeature({ type: "cylinder", diameter: "8 mm", height: "20 mm", center: [10, 0], operation: "join", plane: { kind: "origin", name: "XY" } });
      a.viewport.fit && a.viewport.fit({ animate: false });
      const hl = a.viewport._vp.highlighter;
      const T = a.K.topoOf(a.body(box.newBody).shape);
      const types = (id) => (hl.featureFaceRefs(id) || []).map((x) => T.faces[x.index].type).sort().join(",");
      return { body: box.newBody, box: box.id, cut: cut.id, boss: boss.id, tCut: types(cut.id), tBoss: types(boss.id), nBox: (hl.featureFaceRefs(box.id) || []).length, faces: T.faces.length };
    });
    t.check("the cut owns only its cylindrical face", m.tCut === "CYLINDRE", m.tCut);
    t.check("the joined boss owns its side and top faces", m.tBoss === "CYLINDRE,PLANE", m.tBoss);
    t.check("the box owns its six faces", m.nBox === 6, `${m.nBox} of ${m.faces}`);
    const tris = () => t.app(() => window.app.viewport._vp.highlighter.root.children.filter((c) => c.isMesh && c.geometry && c.geometry.index).map((c) => c.geometry.index.count));
    const total = await t.app((b) => window.app.viewport._vp.bodies.objects.get(b).entry.md.triangles.length, m.body);
    await t.waitFor((id) => !!document.querySelector(`#timeline [data-feature="${id}"]`), { timeout: 5000, arg: m.boss });
    await t.settle(500);
    await t.hover(`#timeline [data-feature="${m.cut}"]`);
    await t.settle(300);
    let hv = await tris();
    t.check("timeline hover on the cut draws a part of the body", hv.length >= 1 && hv.every((n) => n > 0 && n < total), `${JSON.stringify(hv)} of ${total}`);
    await t.click(`#timeline [data-feature="${m.cut}"]`);
    await t.hover("#browser", { timeout: 1000 });
    await t.settle(300);
    const sel = await t.app(() => window.app.selection.items.map((r) => r.kind + ":" + (r.id || r.body)));
    hv = await tris();
    t.check("selecting the cut in the timeline highlights only its face", sel.length === 1 && hv.length >= 1 && hv.every((n) => n > 0 && n < total), `${JSON.stringify(sel)} ${JSON.stringify(hv)}`);
    await t.shot("feature-faces-selected");
    await t.app(() => window.app.selection.set([]));

    // ------------------------------------------------------------ 2. pattern of features dependencies
    t.step("2. a pattern of features depends on its source features");
    const p = await t.app(async () => {
      const a = window.app, K = a.K, tl = a.ui.timeline;
      a.newDocument("Pattern");
      const box = a.addFeature({ type: "box", length: "60 mm", width: "40 mm", height: "10 mm", center: [0, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
      const cut = a.addFeature({ type: "cylinder", diameter: "6 mm", height: "10 mm", center: [-20, -10], operation: "cut", plane: { kind: "origin", name: "XY" } });
      const pat = a.addFeature({ type: "rpattern", patternType: "features", features: [cut.id], dir1: "X", q1: "3", d1: "15 mm", distType: "spacing" });
      const v = () => K.volumeOf(a.body(box.newBody).shape);
      const res = (id) => { const r = a.featureResult(id) || {}; return { ok: r.ok, warning: r.warning || null }; };
      const cls = (id) => { const e = document.querySelector(`#timeline [data-feature="${id}"]`); return e ? e.className : ""; };
      const out = { box: box.id, cut: cut.id, pat: pat.id, v3: v() };
      out.moveBefore = tl.move(pat.id, 1).ok;
      out.moveSrcAfter = tl.move(cut.id, 2).ok;
      a.updateFeature(cut.id, { diameter: "8 mm" });
      out.vEdit = v();
      a.mutate("Suppress", (doc) => { doc.features.find((x) => x.id === cut.id).suppressed = true; });
      await new Promise((r) => setTimeout(r, 300));
      out.sup = res(pat.id); out.supCls = cls(pat.id); out.vSup = v();
      a.history.undo();
      out.del = await tl.deleteFeatures([cut.id], { confirm: false });
      await new Promise((r) => setTimeout(r, 300));
      out.after = a.doc.features.map((f) => f.type).join(",");
      out.delRes = res(pat.id); out.delCls = cls(pat.id);
      a.history.undo();
      out.vUndo = v(); out.undoRes = res(pat.id);
      const mir = a.addFeature({ type: "mirror", patternType: "features", features: [cut.id], plane: { kind: "origin", name: "XZ" } });
      out.mir = res(mir.id); out.vMir = v(); out.moveMir = tl.move(mir.id, 1).ok;
      return out;
    });
    const hole = (d) => Math.PI * (d / 2) ** 2 * 10;
    t.check("3 instances cut", near(p.v3, 24000 - 3 * hole(6), 0.01), fmt(p.v3));
    t.check("reordering the pattern before its source is refused", p.moveBefore === false);
    t.check("reordering the source after the pattern is refused", p.moveSrcAfter === false);
    t.check("editing the source recomputes the pattern", near(p.vEdit, 24000 - 3 * hole(8), 0.01), fmt(p.vEdit));
    t.check("suppressing the source: pattern warning (Reference Failures), no instances", /Reference Failures/.test(p.sup.warning || "") && /warning/.test(p.supCls) && near(p.vSup, 24000, 0.01), JSON.stringify(p.sup) + " " + p.supCls);
    t.check("deleting the source keeps the pattern with the warning", p.del === true && p.after === "box,rpattern" && /Reference Failures/.test(p.delRes.warning || "") && /warning/.test(p.delCls), `${p.after} ${JSON.stringify(p.delRes)}`);
    t.check("undo restores the source and the pattern", near(p.vUndo, 24000 - 3 * hole(8), 0.01) && !p.undoRes.warning, fmt(p.vUndo));
    t.check("a Mirror of features works and depends on its source", p.mir.ok && near(p.vMir, 24000 - 4 * hole(8), 0.01) && p.moveMir === false, `${JSON.stringify(p.mir)} ${fmt(p.vMir)}`);

    // ------------------------------------------------------------ 3. sweep along splines
    t.step("3. Sweep along a sketch spline (Perpendicular / Parallel) and along a spline edge");
    await t.app(() => {
      const a = window.app, { S, K } = a;
      a.newDocument("Sweep");
      const mk = (plane, fn) => { const s = S.newSketch(); const x = fn(s); const f = a.addFeature({ type: "sketch", plane: K.ORIGIN_PLANES[plane], planeRef: { kind: "origin", name: plane }, sk: s, visible: true }); return { id: f.id, x }; };
      window.__rough = {
        prof: mk("XZ", (s) => S.addCircle(s, S.addPoint(s, 0, 0), 2)),
        path: mk("XY", (s) => S.addSpline(s, [[0, 0], [5, 20], [-5, 40], [0, 60]].map((q) => S.addPoint(s, ...q)))),
      };
    });
    t.require("CREATE > Sweep opens", !!(await openCmd(t, "Sweep", null, "SolidCreatePanel")));
    const sw0 = await t.app(() => {
      const a = window.app, R = window.__rough, d = a.ui.dialog.current;
      const rg = a.result.state.sketches.get(R.prof.id).regions.regions[0];
      d.pickRef("profile", { kind: "profile", sketch: R.prof.id, key: rg.key, c: rg.centroid });
      d.activate("path");
      d.pickRef("path", { kind: "sketchCurve", sketch: R.path.id, curve: R.path.x });
      return { rows: [...document.querySelectorAll('.dlg[data-dialog="Sweep"] .dlg-label')].map((e) => e.textContent), path: (d.values.path || []).length, orientation: d.values.orientation };
    });
    t.note("profile and spline path picked through the dialog API");
    t.check("Sweep rows include Path and Orientation (Perpendicular default)", sw0.rows.includes("Orientation") && sw0.path === 1 && sw0.orientation === "perpendicular", JSON.stringify(sw0));
    await t.app(() => window.app.ui.dialog.current.set("orientation", "parallel", { user: true }));
    t.check("OK commits the spline sweep", await okDialog(t, "Sweep"));
    let sw = await t.app(() => { const a = window.app; const f = a.doc.features.find((x) => x.type === "sweep"); return f && { id: f.id, body: f.newBody, ok: (a.featureResult(f.id) || {}).ok, orientation: f.orientation }; });
    t.check("Parallel sweep along the spline: volume = circle area x height", sw && sw.ok && sw.orientation === "parallel" && near(await vol(t, sw.body), Math.PI * 4 * 60, 0.5), JSON.stringify(sw));
    await t.app((id) => window.app.editFeature(id), sw.id);
    await t.waitFor(`${dlgSel("Sweep")}[data-edit="${sw.id}"]`, { timeout: 3000 });
    await t.app(() => window.app.ui.dialog.current.set("orientation", "perpendicular", { user: true }));
    await okDialog(t, "Sweep");
    const vPerp = await vol(t, sw.body);
    // Perpendicular keeps the profile at its start angle to the path (the spline starts tilted to the profile normal)
    t.check("Edit Feature to Perpendicular: the profile turns with the spline (other volume)", Math.abs(vPerp - Math.PI * 4 * 60) > 5 && vPerp > 0.8 * Math.PI * 4 * 60 && vPerp < 1.2 * Math.PI * 4 * 60, fmt(vPerp));
    const ur = await t.app(async (b) => { const a = window.app; const v = () => a.K.volumeOf(a.body(b).shape); a.history.undo(); const u = v(); a.history.redo(); const r = v(); const json = JSON.stringify(a.doc); a.newDocument("x"); a.loadDocument(JSON.parse(json)); await new Promise((res) => setTimeout(res, 300)); const f = a.doc.features.find((x) => x.type === "sweep"); return { u, r, reopen: f ? a.K.volumeOf(a.body(f.newBody).shape) : null }; }, sw.body);
    t.check("undo / redo / save-open keep the sweep", near(ur.u, Math.PI * 4 * 60, 0.5) && near(ur.r, vPerp, 0.01) && near(ur.reopen, vPerp, 0.01), JSON.stringify(ur));
    const se = await t.app(() => {
      const a = window.app, { S, K } = a;
      a.newDocument("SweepEdge");
      const mk = (plane, fn) => { const s = S.newSketch(); const x = fn(s); const f = a.addFeature({ type: "sketch", plane: K.ORIGIN_PLANES[plane], planeRef: { kind: "origin", name: plane }, sk: s, visible: true }); return { id: f.id, x }; };
      const base = mk("XY", (s) => { const q = [[0, 0], [20, 8], [40, -4], [60, 0], [60, -30], [0, -30]].map((v) => S.addPoint(s, ...v)); S.addSpline(s, q.slice(0, 4)); S.addLine(s, q[3], q[4]); S.addLine(s, q[4], q[5]); S.addLine(s, q[5], q[0]); });
      const rb = a.result.state.sketches.get(base.id).regions.regions;
      const ex = a.addFeature({ type: "extrude", profiles: rb.map((x) => ({ sketch: base.id, key: x.key, c: x.centroid })), distance: "10 mm", operation: "new" });
      const topo = K.topoOf(a.body(ex.newBody).shape);
      const ei = topo.edges.findIndex((e) => e.type !== "LINE" && Math.abs(e.s[2] - 10) < 1e-6 && Math.abs(e.t[2] - 10) < 1e-6);
      const e = topo.edges[ei];
      const st = e.s[0] < e.t[0] ? e.s : e.t;
      const prof = mk("YZ", (s) => { const pl = K.ORIGIN_PLANES.YZ; const rel = K.V.sub(st, pl.o); return S.addCircle(s, S.addPoint(s, K.V.dot(rel, pl.x), K.V.dot(rel, K.planeY(pl))), 1.5); });
      window.__rough = { body: ex.newBody, ei, m: e.m, prof };
      return { type: e.type, v0: K.volumeOf(a.body(ex.newBody).shape) };
    });
    t.require("CREATE > Sweep opens again", !!(await openCmd(t, "Sweep", null, "SolidCreatePanel")));
    await t.app(() => { const a = window.app, R = window.__rough, d = a.ui.dialog.current; const rg = a.result.state.sketches.get(R.prof.id).regions.regions[0]; d.pickRef("profile", { kind: "profile", sketch: R.prof.id, key: rg.key, c: rg.centroid }); d.activate("path"); d.pickRef("path", { kind: "edge", body: R.body, index: R.ei, p: R.m }); d.set("operation", "join", { user: true }); });
    t.check("OK commits the sweep along the spline edge", await okDialog(t, "Sweep"));
    const se1 = await t.app(() => { const a = window.app; const f = a.doc.features.find((x) => x.type === "sweep"); return { ok: (a.featureResult(f.id) || {}).ok, edges: (f.pathEdges || []).length, v: a.K.volumeOf(a.body(window.__rough.body).shape) }; });
    t.check("spline edge path joins a tube to the body", se.type === "BSPLINE_CURVE" && se1.ok && se1.edges === 1 && se1.v > se.v0 + 100, `${se.type} ${JSON.stringify(se1)} v0=${fmt(se.v0)}`);

    // ------------------------------------------------------------ 4. faster modeled thread
    t.step("4. a modeled thread is one sewn groove and one cut");
    const th = await t.app(async () => {
      const a = window.app, K = a.K;
      a.newDocument("Thread");
      const f = a.addFeature({ type: "cylinder", plane: { kind: "origin", name: "XY" }, center: [0, 0], diameter: "10 mm", height: "15 mm", operation: "new" });
      // before: the one-turn pieces in one multi-tool cut (K.threadedShapePieces), same groove
      const c = K.cylinderFaceInfo(a.body(f.newBody).shape, K.topoOf(a.body(f.newBody).shape).faces.findIndex((x) => x.type === "CYLINDRE"));
      const tt = { o: c.o, a: c.a, r: c.r, z0: 0, z1: c.len, pitch: 1.5, depth: (9.85 - 8.141) / 2, internal: false, left: false };
      const tb = performance.now();
      const old = K.threadedShapePieces(a.body(f.newBody).shape, tt);
      const msOld = performance.now() - tb;
      const removedOld = Math.PI * 25 * 15 - K.volumeOf(old);
      K.del(old);
      const t0 = performance.now();
      const tf = a.addFeature({ type: "thread", faces: [{ body: f.newBody, p: [5, 0, 7.5], n: [1, 0, 0] }], threadType: "ISO Metric profile", size: "10.0", designation: "M10x1.5", tclass: "6g", pitch: 1.5, major: 9.85, minor: 8.141, modeled: true, fullLength: true, rightHanded: true });
      const ms = performance.now() - t0;
      const s = a.body(f.newBody).shape;
      return { ms, msOld, removedOld, ok: (a.featureResult(tf.id) || {}).ok, removed: Math.PI * 25 * 15 - K.volumeOf(s), valid: K.isValidShape(s), faces: K.topoOf(s).faces.length };
    });
    t.note(`modeled M10x1.5 over 10 turns in the page: ${fmt(th.ms, 0)} ms (whole feature); the old one-turn pieces cut: ${fmt(th.msOld, 0)} ms`);
    t.check("10-turn modeled thread: valid, the same groove as the old construction, faster", th.ok && th.valid && near(th.removed, th.removedOld, 0.01) && th.removed > 100 && th.ms < th.msOld, JSON.stringify(th));

    // ------------------------------------------------------------ 5. Manage Threads Library
    t.step("5. Manage Threads Library: add, edit, copy, delete; Thread and Hole offer the custom type");
    t.require("UTILITIES > UTILITY > Manage Threads Library opens", !!(await openCmd(t, "FusionManageThreadsLibraryCommand", "ToolsTab", "UtilityPanel")));
    const L = dlgSel("FusionManageThreadsLibraryCommand");
    await t.click(`${L} [data-act="newType"]`);
    await t.fill(`${L} input[data-prop="name"]`, "QA Thread");
    const row = (i, col) => `${L} tr[data-item="${i}"] [data-col="${col}"]`;
    for (const [col, v] of [["size", "12"], ["designation", "QA12x2"], ["cls", "6g"], ["pitch", "2"], ["major", "11.8"], ["minor", "9.6"]]) await t.fill(row(0, col), v);
    await t.click(`${L} [data-act="addItem"]`);
    await t.fill(row(1, "cls"), "6H");
    await t.app((sel) => { const s = document.querySelector(sel); s.value = "internal"; s.dispatchEvent(new Event("change")); }, row(1, "gender"));
    for (const [col, v] of [["major", "12.2"], ["minor", "9.9"]]) await t.fill(row(1, col), v);
    // a duplicate (same size, designation, class) is refused
    await t.click(`${L} tr[data-item="1"] [data-act="copyItem"]`);
    await t.fill(row(2, "cls"), "6H");
    const dup = await t.app((L) => ({ err: document.querySelector(`${L} .tlib-err`).textContent, ok: !document.querySelector(`${L} [data-action="ok"]`).disabled }), L);
    t.check("a duplicate size / designation / class is refused (Fusion message)", /Duplicate thread specification/.test(dup.err) && !dup.ok, JSON.stringify(dup));
    await t.click(`${L} tr[data-item="2"] [data-act="deleteItem"]`);
    await t.click(`${L} [data-act="copyType"]`);
    const lib0 = await t.app((L) => ({ types: window.app.ui.dialog.current.defs.threadType.options.map((o) => o.label), err: document.querySelector(`${L} .tlib-err`).textContent }), L);
    t.check("Copy makes 'QA Thread Copy'", lib0.types.includes("QA Thread Copy") && !lib0.err, JSON.stringify(lib0));
    await t.click(`${L} [data-act="deleteType"]`);
    const lib1 = await t.app(() => window.app.ui.dialog.current.defs.threadType.options.map((o) => o.label));
    t.check("Delete removes the copied type", !lib1.includes("QA Thread Copy") && lib1.includes("QA Thread"), JSON.stringify(lib1));
    // export through app.download
    const exp = await t.app(async (L) => {
      const a = window.app, orig = a.download;
      let got = null;
      a.download = async (name, data) => { got = { name, data: String(data) }; };
      try { document.querySelector(`${L} [data-act="export"]`).click(); await new Promise((r) => setTimeout(r, 50)); } finally { a.download = orig; }
      return got;
    }, L);
    t.check("Export writes the library to a JSON file", exp && /threads-library\.json/.test(exp.name) && /QA12x2/.test(exp.data), exp ? exp.name : "no download");
    // import a Fusion thread XML through the file input
    const xml = `<?xml version="1.0"?><ThreadType><Name>QA Inch</Name><CustomName>QA Inch</CustomName><Unit>in</Unit><Angle>60</Angle><ThreadSize><Size>0.5</Size><Designation><ThreadDesignation>1/2-13 QA</ThreadDesignation><CTD>1/2-13 QA</CTD><TPI>13</TPI><Thread><Gender>external</Gender><Class>2A</Class><MajorDia>0.4985</MajorDia><PitchDia>0.4485</PitchDia><MinorDia>0.4041</MinorDia></Thread></Designation></ThreadSize></ThreadType>`;
    const [chooser] = await Promise.all([t.page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null), t.click(`${L} [data-act="import"]`)]);
    if (chooser) await chooser.setFiles({ name: "qa-inch.xml", mimeType: "text/xml", buffer: Buffer.from(xml) });
    t.check("Import reads a Fusion thread XML", !!chooser && (await t.waitFor(() => window.app.ui.dialog.current && window.app.ui.dialog.current.defs.threadType.options.some((o) => o.label === "QA Inch"), { timeout: 4000 })));
    t.check("OK saves the library", await okDialog(t, "FusionManageThreadsLibraryCommand"));
    const saved = await t.app(() => { try { return JSON.parse(localStorage.getItem("fusion-recreation.threadsLibrary.v1")).map((x) => `${x.name}:${x.items.length}`); } catch (e) { return String(e); } });
    t.check("the library is in localStorage (QA Thread with 2 items, QA Inch)", Array.isArray(saved) && saved.includes("QA Thread:2") && saved.includes("QA Inch:1"), JSON.stringify(saved));

    // Thread with the custom type
    const cyl = await t.app(() => { const a = window.app; a.newDocument("Custom thread"); const f = a.addFeature({ type: "cylinder", plane: { kind: "origin", name: "XY" }, center: [0, 0], diameter: "11.8 mm", height: "10 mm", operation: "new" }); return f.newBody; });
    t.require("Thread opens", !!(await openCmd(t, "FusionThreadCommand", "SolidTab", "SolidCreatePanel")));
    await t.app((b) => window.app.ui.dialog.current.pickRef("faces", { kind: "face", body: b, index: -1, p: [0, -5.9, 5], n: [0, -1, 0], planar: false }), cyl);
    const tOpts = await t.app(() => window.app.ui.dialog.current.defs.threadType.options.map((o) => o.value));
    t.check("Thread Type offers the custom types", tOpts.includes("QA Thread") && tOpts.includes("QA Inch"), JSON.stringify(tOpts));
    await t.app(() => { const d = window.app.ui.dialog.current; d.set("threadType", "QA Thread", { user: true }); d.set("modeled", true, { user: true }); });
    await t.settle(300);
    const tv = await t.app(() => { const v = window.app.ui.dialog.current.values; return { size: v.size, des: v.designation, cls: v.tclass }; });
    t.check("the custom type sizes the thread from the cylinder (12 / QA12x2 / 6g)", tv.size === "12" && tv.des === "QA12x2" && tv.cls === "6g", JSON.stringify(tv));
    t.check("OK commits the custom modeled thread", await okDialog(t, "FusionThreadCommand"));
    const tf = await t.app(() => { const a = window.app; const f = a.doc.features.find((x) => x.type === "thread"); return { ok: (a.featureResult(f.id) || {}).ok, type: f.threadType, pitch: f.pitch, major: f.major, v: a.K.volumeOf(a.body(f.faces[0].body).shape) }; });
    t.check("the thread feature uses the custom pitch and diameters", tf.ok && tf.type === "QA Thread" && tf.pitch === 2 && tf.major === 11.8 && tf.v < Math.PI * 5.9 * 5.9 * 10 - 50, JSON.stringify(tf));

    // Hole > Tapped with the custom type (internal class)
    const blk = await t.app(() => { const a = window.app; a.newDocument("Tapped"); const f = a.addFeature({ type: "box", length: "40 mm", width: "40 mm", height: "20 mm", center: [0, 0], operation: "new", plane: { kind: "origin", name: "XY" } }); return f.newBody; });
    t.require("Hole opens", !!(await openCmd(t, "FusionHoleCommand", "SolidTab", "SolidCreatePanel")));
    await t.app((b) => { const d = window.app.ui.dialog.current; d.pickRef("face", { kind: "face", body: b, index: -1, p: [5, 5, 20], n: [0, 0, 1], planar: true }); d.set("tapType", "tapped", { user: true }); d.set("t_type", "QA Thread", { user: true }); }, blk);
    await t.settle(300);
    const hv2 = await t.app(() => { const d = window.app.ui.dialog.current; const v = d.values; return { size: v.t_size, des: v.t_designation, cls: v.t_class, clsOpts: d.defs.t_class.options.map((o) => o.value), rows: [...document.querySelectorAll('.dlg[data-dialog="FusionHoleCommand"] .dlg-row')].filter((r) => r.style.display !== "none").map((r) => r.dataset.row) }; });
    t.check("Hole Tapped shows the thread rows with the custom internal class 6H", ["t_type", "t_size", "t_designation", "t_class", "t_dir", "t_modeled"].every((r) => hv2.rows.includes(r)) && hv2.size === "12" && hv2.des === "QA12x2" && hv2.cls === "6H" && hv2.clsOpts.join() === "6H", JSON.stringify(hv2));
    t.check("OK commits the tapped hole", await okDialog(t, "FusionHoleCommand"));
    const hf = await t.app(() => { const a = window.app; const f = a.doc.features.find((x) => x.type === "hole"); const r = a.featureResult(f.id) || {}; return { id: f.id, ok: r.ok, dia: f.diameter, tap: f.tapType, type: f.thread && f.thread.threadType, threads: (r.threads || []).length, r: r.threads && r.threads[0] && r.threads[0].r, v: a.K.volumeOf(a.body(f.faceRef.body).shape) }; });
    t.check("the tapped hole is drilled at the minor diameter with a cosmetic thread", hf.ok && hf.tap === "tapped" && hf.type === "QA Thread" && /^9\.9 mm$/.test(hf.dia) && hf.threads === 1 && near(hf.r, 4.95, 1e-6), JSON.stringify(hf));
    await t.app((id) => window.app.editFeature(id), hf.id);
    if (await t.waitFor(`${dlgSel("FusionHoleCommand")}[data-edit="${hf.id}"]`, { timeout: 3000 })) {
      const ev = await t.app(() => { const v = window.app.ui.dialog.current.values; return { tap: v.tapType, type: v.t_type, des: v.t_designation, cls: v.t_class }; });
      t.check("Edit Feature restores the tapped thread", ev.tap === "tapped" && ev.type === "QA Thread" && ev.des === "QA12x2" && ev.cls === "6H", JSON.stringify(ev));
      await t.app(() => window.app.ui.dialog.current.set("t_modeled", true, { user: true }));
      await okDialog(t, "FusionHoleCommand");
      const hm = await t.app((id) => { const a = window.app; const f = a.feature(id); const r = a.featureResult(id) || {}; return { ok: r.ok, modeled: r.modeled, v: a.K.volumeOf(a.body(f.faceRef.body).shape) }; }, hf.id);
      t.check("Modeled cuts the thread into the hole", hm.ok && hm.modeled && hm.v < hf.v - 20, `${JSON.stringify(hm)} before=${fmt(hf.v)}`);
      const rt = await t.app(async (id) => { const a = window.app; const v = () => a.K.volumeOf(a.body(a.feature(id).faceRef.body).shape); const v1 = v(); a.history.undo(); const u = v(); a.history.redo(); const json = JSON.stringify(a.doc); a.newDocument("x"); a.loadDocument(JSON.parse(json)); await new Promise((r) => setTimeout(r, 300)); return { v1, u, reopen: v(), ok: (a.featureResult(id) || {}).ok }; }, hf.id);
      t.check("undo / redo / save-open keep the tapped hole", rt.ok && rt.u > rt.v1 && near(rt.reopen, rt.v1, 0.01), JSON.stringify(rt));
    } else t.check("Edit Feature opens the Hole dialog", false);
    await t.shot("tapped-hole");
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
