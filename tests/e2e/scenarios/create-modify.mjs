// Split Body, Coil, Pipe, Scale and Thread through their Fusion dialogs: toolbar dropdown ->
// dialog rows / defaults -> selections -> live preview -> OK -> bodies, timeline item + icon,
// Edit Feature re-opens the dialog with the stored values.
import { defineScenario, mainIfDirect, near, fmt, apiBox } from "../lib.mjs";

/** Open a command from a SOLID toolbar dropdown (falls back to app.commands.run). */
async function openFromPanel(t, panel, id, before) {
  await t.escapeAll(1);
  if (before) await before();
  let ok = false;
  if (await t.click(`#toolbar [data-panel="${panel}"]`, { timeout: 1500 })) {
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
  return { fromToolbar: ok };
}

/** Labels of the visible rows of the open dialog, and the real (non-stub) command check. */
async function dialogInfo(t, id) {
  return t.app((id) => {
    const d = document.querySelector(`.dlg[data-dialog="${id}"]`);
    const labels = [...d.querySelectorAll(".dlg-row")].filter((r) => r.offsetParent).map((r) => (r.querySelector(".dlg-label")?.textContent || "").trim()).filter(Boolean);
    const cmd = window.app.commands.get(id);
    return { labels, real: !!cmd && !cmd.stub, title: (d.querySelector(".dlg-title")?.textContent || "").trim() };
  }, id);
}

const okDialog = async (t, id) => {
  await t.settle(300);
  const en = await t.app((id) => { const b = document.querySelector(`.dlg[data-dialog="${id}"] [data-action="ok"]`); return !!b && !b.disabled; }, id);
  if (en) await t.click(`.dlg[data-dialog="${id}"] [data-action="ok"]`);
  await t.waitFor(() => !window.app.activeCommand, { timeout: 20000 });
  return en;
};

/** Timeline item of the last feature of a type: {id, icon (has svg), ok}. */
async function timelineItem(t, type) {
  await t.waitFor((type) => { const f = [...window.app.doc.features].reverse().find((x) => x.type === type); return !!f && !!document.querySelector(`#timeline [data-feature="${f.id}"]`); }, { timeout: 2000, arg: type });
  return t.app((type) => {
    const a = window.app;
    const f = [...a.doc.features].reverse().find((x) => x.type === type);
    if (!f) return null;
    const el = document.querySelector(`#timeline [data-feature="${f.id}"]`);
    return { id: f.id, name: f.name, el: !!el, icon: !!(el && el.querySelector("svg")), ok: !!(a.featureResult(f.id) || {}).ok, error: (a.featureResult(f.id) || {}).error };
  }, type);
}

/** Edit Feature on a feature: the dialog opens in edit mode; returns the values read by fn. */
async function editAndCancel(t, fid, id, fn) {
  await t.escapeAll(1);
  await t.app((fid) => window.app.editFeature(fid), fid);
  const open = await t.waitFor(`.dlg[data-dialog="${id}"][data-edit="${fid}"]`, { timeout: 3000 });
  const vals = open ? await t.app(fn) : null;
  if (open) await t.click(`.dlg[data-dialog="${id}"] [data-action="cancel"]`);
  await t.waitFor(() => !window.app.activeCommand, { timeout: 3000 });
  return { open, vals };
}

const scenario = defineScenario({
  name: "create-modify",
  title: "Split Body / Coil / Pipe / Scale / Thread dialogs",
  timeout: 240000,
  async run(t) {
    // ---------------------------------------------------------------- Split Body
    t.step("Split Body: a 40 x 20 x 10 box split by the YZ origin plane");
    await t.app(() => window.app.newDocument("Split"));
    const box = await apiBox(t, { L: "40 mm", W: "20 mm", H: "10 mm" });
    t.require("setup box", box.ok, JSON.stringify(box));
    await t.setView("home");
    await t.app(() => window.app.viewport.fit && window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);
    const o1 = await openFromPanel(t, "SolidModifyPanel", "FusionSplitBodyCommand");
    t.require("MODIFY > Split Body opens its dialog", !!o1);
    let info = await dialogInfo(t, "FusionSplitBodyCommand");
    t.check("Split Body is a real command with Fusion's rows", info.real && info.title === "SPLIT BODY" && ["Body to Split", "Splitting Tool(s)", "Extend Splitting Tool(s)"].every((l) => info.labels.includes(l)), JSON.stringify(info));
    const ext = await t.app(() => document.querySelector('.dlg[data-dialog="FusionSplitBodyCommand"] [data-input="extend"]')?.checked);
    t.check("Extend Splitting Tool(s) is checked by default", ext === true, String(ext));
    // Body to Split: click the top face of the box on the canvas
    const aim = await t.aim([[5, 3, 10], [10, 0, 10], [-8, 4, 10]], "h && h.ref && h.ref.kind === 'face'");
    if (aim) await t.canvasClick(aim.x, aim.y);
    else await t.app((b) => window.app.ui.dialog.current.pickRef("bodies", { kind: "body", body: b }), box.body);
    await t.settle(200);
    await t.app(() => window.app.ui.dialog.current.pickRef("tool", { kind: "originPlane", name: "YZ" }));
    await t.settle(500);
    const sel = await t.app(() => { const d = document.querySelector('.dlg[data-dialog="FusionSplitBodyCommand"]'); return { b: d.querySelector('[data-input="bodies"]')?.dataset.count, tl: d.querySelector('[data-input="tool"]')?.dataset.count, prev: window.app.bodies().length }; });
    t.check("canvas click fills Body to Split, the YZ plane is the tool; the preview shows two bodies", sel.b === "1" && sel.tl === "1" && sel.prev === 2, JSON.stringify(sel));
    await t.shot("split-preview");
    t.check("OK commits Split Body", await okDialog(t, "FusionSplitBodyCommand"));
    let st = await t.state();
    const vs = st.bodies.map((b) => b.volume).sort((a, b) => a - b);
    t.check("two bodies of 4000 mm^3 each", vs.length === 2 && near(vs[0], 4000, 0.01) && near(vs[1], 4000, 0.01), vs.map((v) => fmt(v)).join(","));
    const nodes = await t.app(() => [...document.querySelectorAll('[data-node^="body:"]')].filter((e) => e.offsetParent || true).length);
    t.check("the browser lists two bodies", nodes >= 2, `body nodes=${nodes}`);
    let ti = await timelineItem(t, "split");
    t.check("timeline item 'Split Body1' with an icon", ti && ti.el && ti.icon && ti.ok && /^Split Body1$/.test(ti.name), JSON.stringify(ti));
    if (ti) {
      const e = await editAndCancel(t, ti.id, "FusionSplitBodyCommand", () => { const d = window.app.ui.dialog.current; return { b: (d.values.bodies || []).length, tool: (d.values.tool || [])[0]?.name }; });
      t.check("Edit Feature re-opens Split Body with its body and tool", e.open && e.vals && e.vals.b === 1 && e.vals.tool === "YZ", JSON.stringify(e));
    }

    // ---------------------------------------------------------------- Coil
    t.step("Coil: XY plane, click the centre, click again for the diameter, then the dialog values");
    await t.app(() => window.app.newDocument("Coil"));
    await t.setView("top");
    await t.app(() => window.app.viewport.fit && window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);
    t.require("CREATE > Coil opens its dialog", !!(await openFromPanel(t, "SolidCreatePanel", "PrimitiveCoil")));
    info = await dialogInfo(t, "PrimitiveCoil");
    t.check("Coil rows: Type, Diameter, Rotation, Revolutions, Height, Angle, Section, Section Position, Section Size, Operation", info.real && ["Type", "Diameter", "Rotation", "Revolutions", "Height", "Angle", "Section", "Section Position", "Section Size", "Operation"].every((l) => info.labels.includes(l)) && !info.labels.includes("Pitch"), JSON.stringify(info.labels));
    const defs = await t.app(() => { const v = window.app.ui.dialog.current.values; return { type: v.coilType, rev: v.revolutions, sec: v.section, pos: v.sectionPosition, rot: v.rotation }; });
    t.check("Coil defaults: Revolution and Height, 5 revolutions, Circular, Inside, Clockwise", defs.type === "revHeight" && defs.rev === "5" && defs.sec === "circular" && defs.pos === "inside" && defs.rot === "cw", JSON.stringify(defs));
    await t.app(() => window.app.ui.dialog.current.pickRef("plane", { kind: "originPlane", name: "XY" }));
    await t.settle(300);
    const c0 = await t.canvasXY([0, 0, 0]), c1 = await t.canvasXY([20, 0, 0]);
    await t.canvasClick(c0.x, c0.y);
    await t.settle(150);
    await t.page.mouse.move(c1.x, c1.y, { steps: 4 });
    await t.settle(200);
    await t.canvasClick(c1.x, c1.y);
    await t.settle(400);
    const dia = await t.app(() => window.app.ui.dialog.current.values.diameter);
    t.check("the second click sizes the diameter (≈ 40 mm)", Math.abs(parseFloat(dia) - 40) <= 2, dia);
    await t.fill('.dlg[data-dialog="PrimitiveCoil"] [data-input="diameter"]', "50 mm");
    await t.fill('.dlg[data-dialog="PrimitiveCoil"] [data-input="height"]', "50 mm");
    await t.app(() => { const d = document.querySelector('.dlg[data-dialog="PrimitiveCoil"]'); d.querySelector('[data-input="sectionPosition"]').value = "center"; });
    await t.settle(800);
    const mk = await t.app(() => [...window.app.ui.dialog.current.manips.items.keys()]);
    t.check("diameter and height arrows on the canvas", mk.includes("diameter") && mk.includes("height"), mk.join(","));
    await t.shot("coil-preview");
    t.check("OK commits the Coil", await okDialog(t, "PrimitiveCoil"));
    st = await t.state();
    const want = Math.PI * 6.25 * 2 * Math.PI * 25 * 5;
    t.check("coil body volume = π·2.5²·2π·25·5", st.bodies.length === 1 && near(st.volume, want, want * 0.002), `${fmt(st.volume)} vs ${fmt(want)}`);
    await t.setView("home");
    await t.app(() => window.app.viewport.fit && window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);
    await t.shot("coil");
    ti = await timelineItem(t, "coil");
    t.check("timeline item 'Coil1' with an icon", ti && ti.el && ti.icon && ti.ok && ti.name === "Coil1", JSON.stringify(ti));
    if (ti) {
      const e = await editAndCancel(t, ti.id, "PrimitiveCoil", () => { const v = window.app.ui.dialog.current.values; return { d: v.diameter, pos: v.sectionPosition }; });
      t.check("Edit Feature re-opens the Coil with its values", e.open && e.vals && /^50(\.0+)? mm$/.test(e.vals.d) && e.vals.pos === "center", JSON.stringify(e));
    }

    // ---------------------------------------------------------------- Pipe
    t.step("Pipe: a 50 mm sketch line, Section Size 10, then Hollow");
    const sk = await t.app(() => {
      const a = window.app;
      a.newDocument("Pipe");
      const sk = a.S.newSketch();
      const l = a.S.addLine(sk, a.S.addPoint(sk, 0, 0), a.S.addPoint(sk, 50, 0));
      const f = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
      return { id: f.id, line: l };
    });
    await t.setView("home");
    await t.app(() => window.app.viewport.fit && window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);
    t.require("CREATE > Pipe opens its dialog", !!(await openFromPanel(t, "SolidCreatePanel", "PrimitivePipe")));
    info = await dialogInfo(t, "PrimitivePipe");
    t.check("Pipe rows: Path, Chain Selection, Distance, Section, Section Size, Hollow, Operation", info.real && ["Path", "Chain Selection", "Distance", "Section", "Section Size", "Hollow", "Operation"].every((l) => info.labels.includes(l)) && !info.labels.includes("Section Thickness"), JSON.stringify(info.labels));
    const pAim = await t.aim([[25, 0, 0], [20, 0, 0], [30, 0, 0]], "h && h.ref && h.ref.kind === 'sketchCurve'");
    if (pAim) await t.canvasClick(pAim.x, pAim.y);
    else { await t.app((s) => window.app.ui.dialog.current.pickRef("path", { kind: "sketchCurve", sketch: s.id, curve: s.line }), sk); t.note("path picked through the dialog API"); }
    await t.fill('.dlg[data-dialog="PrimitivePipe"] [data-input="sectionSize"]', "10 mm");
    await t.settle(500);
    await t.shot("pipe-preview");
    t.check("OK commits the Pipe", await okDialog(t, "PrimitivePipe"));
    st = await t.state();
    t.check("pipe volume = π·5²·50", near(st.volume, Math.PI * 25 * 50, 0.5), fmt(st.volume));
    ti = await timelineItem(t, "pipe");
    t.check("timeline item 'Pipe1' with an icon", ti && ti.el && ti.icon && ti.ok && ti.name === "Pipe1", JSON.stringify(ti));
    if (ti) {
      await t.app((fid) => window.app.editFeature(fid), ti.id);
      if (await t.waitFor(`.dlg[data-dialog="PrimitivePipe"][data-edit="${ti.id}"]`, { timeout: 3000 })) {
        await t.click('.dlg[data-dialog="PrimitivePipe"] [data-input="hollow"]');
        await t.settle(300);
        const thick = await t.visible('.dlg[data-dialog="PrimitivePipe"] [data-input="thickness"]');
        t.check("Hollow shows Section Thickness (1.00 mm)", thick);
        await okDialog(t, "PrimitivePipe");
        st = await t.state();
        t.check("Edit Feature > Hollow: volume = π·(25−16)·50", near(st.volume, Math.PI * 9 * 50, 0.5), fmt(st.volume));
      } else t.check("Edit Feature opens the Pipe dialog", false);
    }

    // ---------------------------------------------------------------- Scale
    t.step("Scale: uniform x2 about the origin point");
    await t.app(() => window.app.newDocument("Scale"));
    const b2 = await apiBox(t, { L: "20 mm", W: "20 mm", H: "10 mm" });
    t.require("MODIFY > Scale opens its dialog", !!(await openFromPanel(t, "SolidModifyPanel", "ModifyScale", () => t.app((b) => window.app.selection.set([{ kind: "body", body: b }]), b2.body))));
    info = await dialogInfo(t, "ModifyScale");
    t.check("Scale rows: Entities, Point, Scale Type, Scale Factor", info.real && ["Entities", "Point", "Scale Type", "Scale Factor"].every((l) => info.labels.includes(l)), JSON.stringify(info.labels));
    const sc = await t.app(() => { const d = document.querySelector('.dlg[data-dialog="ModifyScale"]'); return { e: d.querySelector('[data-input="bodies"]')?.dataset.count, p: d.querySelector('[data-input="point"]')?.dataset.count }; });
    t.check("the preselected body fills Entities, Point defaults to the origin", sc.e === "1" && sc.p === "1", JSON.stringify(sc));
    await t.fill('.dlg[data-dialog="ModifyScale"] [data-input="factor"]', "2");
    await t.settle(500);
    t.check("OK commits Scale", await okDialog(t, "ModifyScale"));
    st = await t.state();
    t.check("scaled volume = 8 x 4000", near(st.volume, 32000, 0.05), fmt(st.volume));
    await t.app(() => window.app.commands.run("ModifyScale", { preselect: [{ kind: "body", body: window.app.bodies()[0].id }] }));
    if (await t.waitFor('.dlg[data-dialog="ModifyScale"]', { timeout: 2500 })) {
      await t.app(() => { document.querySelector('.dlg[data-dialog="ModifyScale"] [data-input="scaleType"]').value = "nonUniform"; });
      await t.settle(200);
      info = await dialogInfo(t, "ModifyScale");
      t.check("Non Uniform shows X / Y / Z Scale", ["X Scale", "Y Scale", "Z Scale"].every((l) => info.labels.includes(l)) && !info.labels.includes("Scale Factor"), JSON.stringify(info.labels));
      await t.fill('.dlg[data-dialog="ModifyScale"] [data-input="sz"]', "0.5");
      await t.settle(400);
      await okDialog(t, "ModifyScale");
      st = await t.state();
      t.check("non-uniform Z 0.5 halves the volume", near(st.volume, 16000, 0.05), fmt(st.volume));
    }
    ti = await timelineItem(t, "scale");
    t.check("timeline item 'Scale2' with an icon", ti && ti.el && ti.icon && ti.ok && ti.name === "Scale2", JSON.stringify(ti));

    // ---------------------------------------------------------------- Thread
    t.step("Thread: cosmetic M10 on a Ø10 cylinder, then Modeled via Edit Feature");
    const cyl = await t.app(() => {
      const a = window.app;
      a.newDocument("Thread");
      const f = a.addFeature({ type: "cylinder", plane: { kind: "origin", name: "XY" }, center: [0, 0], diameter: "10 mm", height: "6 mm", operation: "new" });
      return { body: f.newBody, ok: !!(a.featureResult(f.id) || {}).ok };
    });
    await t.setView("home");
    await t.app(() => window.app.viewport.fit && window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);
    t.require("CREATE > Thread opens its dialog", cyl.ok && !!(await openFromPanel(t, "SolidCreatePanel", "FusionThreadCommand")));
    info = await dialogInfo(t, "FusionThreadCommand");
    t.check("Thread rows: Faces, Modeled, Full Length, Thread Type, Size, Designation, Class, Direction", info.real && ["Faces", "Modeled", "Full Length", "Thread Type", "Size", "Designation", "Class", "Direction"].every((l) => info.labels.includes(l)), JSON.stringify(info.labels));
    const tAim = await t.aim([[3.54, -3.54, 3], [0, -5, 3], [4.33, -2.5, 4]], "h && h.ref && h.ref.kind === 'face' && h.ref.planar === false");
    if (tAim) await t.canvasClick(tAim.x, tAim.y);
    else { await t.app((b) => window.app.ui.dialog.current.pickRef("faces", { kind: "face", body: b, index: -1, p: [0, -5, 3], n: [0, -1, 0], planar: false }), cyl.body); t.note("face picked through the dialog API"); }
    await t.settle(500);
    const tv = await t.app(() => { const v = window.app.ui.dialog.current.values; return { n: (v.faces || []).length, size: v.size, des: v.designation, cls: v.tclass, modeled: v.modeled, full: v.fullLength }; });
    t.check("the cylinder sets Size 10.0 / M10x1.5 / 6g; Modeled off, Full Length on", tv.n === 1 && tv.size === "10.0" && tv.des === "M10x1.5" && tv.cls === "6g" && !tv.modeled && tv.full, JSON.stringify(tv));
    const lines = await t.app(() => { const g = window.app.viewport.scene.getObjectByName("cosmetic-threads"); return g ? g.children.length : -1; });
    t.check("the cosmetic thread is drawn on the face in the preview", lines >= 1, String(lines));
    await t.shot("thread-cosmetic");
    t.check("OK commits the Thread", await okDialog(t, "FusionThreadCommand"));
    st = await t.state();
    t.check("a cosmetic thread keeps the volume", near(st.volume, Math.PI * 25 * 6, 0.01), fmt(st.volume));
    ti = await timelineItem(t, "thread");
    t.check("timeline item 'Thread1' with an icon", ti && ti.el && ti.icon && ti.ok && ti.name === "Thread1", JSON.stringify(ti));
    if (ti) {
      await t.app((fid) => window.app.editFeature(fid), ti.id);
      if (await t.waitFor(`.dlg[data-dialog="FusionThreadCommand"][data-edit="${ti.id}"]`, { timeout: 3000 })) {
        const ev = await t.app(() => { const v = window.app.ui.dialog.current.values; return { n: (v.faces || []).length, des: v.designation }; });
        t.check("Edit Feature shows the face and M10x1.5", ev.n === 1 && ev.des === "M10x1.5", JSON.stringify(ev));
        await t.click('.dlg[data-dialog="FusionThreadCommand"] [data-input="modeled"]');
        await t.settle(400);
        await okDialog(t, "FusionThreadCommand");
        st = await t.state();
        const removed = Math.PI * 25 * 6 - st.volume;
        t.check("Modeled cuts the helical thread (≈ 48 mm^3 removed over 4 turns)", removed > 35 && removed < 60 && st.features.every((f) => f.ok), `removed=${fmt(removed)}`);
        await t.shot("thread-modeled");
      } else t.check("Edit Feature opens the Thread dialog", false);
    }
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
