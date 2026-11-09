// Modeling half of the core loop, isolated from the sketch module: a 40x20 rectangle sketch on XY is
// created through the App API, then E -> OK -> F -> OK -> H -> OK -> timeline edit run through the UI
// (same steps and checks as core-loop's second half). Also: undo of the edit, and Edit Feature via
// the timeline context menu.
import { defineScenario, mainIfDirect, near, fmt } from "../lib.mjs";
import { modelChain } from "./core-loop.mjs";

/**
 * Fresh document with the QA L bracket (60x10 + 10x40 legs on XY, extruded 8 mm) made through the
 * App API; optional fillet of the two top end edges (3 mm) and through-all holes [x, y, dia] cut
 * from a sketch on the top face.
 */
async function lBracket(t, o = {}) {
  return t.app((o) => {
    const a = window.app;
    a.newDocument("L bracket");
    const sk = a.S.newSketch();
    const P = [[0, 0], [60, 0], [60, 10], [10, 10], [10, 50], [0, 50]].map((q) => a.S.addPoint(sk, q[0], q[1]));
    P.forEach((p, i) => a.S.addLine(sk, p, P[(i + 1) % P.length]));
    const s1 = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
    const reg = a.sketchState(s1.id).regions.regions[0];
    const e1 = a.addFeature({ type: "extrude", profiles: [{ sketch: s1.id, key: reg.key, c: [5, 5] }], distance: "8 mm", operation: "new" });
    const body = e1.newBody;
    if (o.fillet) a.addFeature({ type: "fillet", edges: [{ body, p: [60, 5, 8] }, { body, p: [5, 50, 8] }], radius: "3 mm", tangentChain: true });
    if (o.holes) {
      const sk2 = a.S.newSketch();
      for (const [x, y, d] of o.holes) a.S.addCircle(sk2, a.S.addPoint(sk2, x, y), d / 2);
      const pl = { o: [0, 0, 8], x: [1, 0, 0], n: [0, 0, 1] };
      const s2 = a.addFeature({ type: "sketch", plane: pl, planeRef: { kind: "face", body, p: [20, 5, 8], n: [0, 0, 1], plane: pl }, sk: sk2, visible: false });
      const regs = a.sketchState(s2.id).regions.regions;
      a.addFeature({ type: "extrude", profiles: regs.map((r) => ({ sketch: s2.id, key: r.key })), distance: "10 mm", extent: "all", flip: true, operation: "cut" });
    }
    const vol = a.bodies().reduce((s, b) => s + a.K.R.measureVolume(b.shape), 0);
    return { body, vol, ok: a.doc.features.every((f) => (a.featureResult(f.id) || {}).ok) };
  }, o);
}

/** Modify > Shell through the UI: pick the bracket's top face at (20, 5, 8), thickness, OK. */
async function shellTopUI(t, thickness) {
  await t.escapeAll();
  await t.setView("home");
  await t.app(() => window.app.viewport.fit && window.app.viewport.fit({ animate: false }));
  await t.cameraStable(2000);
  await t.click('#toolbar [data-cmd="FusionShellBodyCommand"]');
  const open = await t.waitFor('.dlg[data-dialog="FusionShellBodyCommand"]', { timeout: 2500 });
  if (!open) return { open: false };
  const aim = await t.aim([[20, 5, 8], [30, 5, 8], [45, 4, 8], [5, 25, 8]], "h && h.ref && h.ref.kind === 'face' && h.ref.n && h.ref.n[2] > 0.999");
  if (aim) await t.canvasClick(aim.x, aim.y);
  await t.fill('.dlg[data-dialog="FusionShellBodyCommand"] [data-input="thickness"]', thickness);
  await t.settle(600);
  const okEnabled = await t.app(() => { const b = document.querySelector('.dlg[data-dialog="FusionShellBodyCommand"] [data-action="ok"]'); return !!b && !b.disabled; });
  const msg = await t.app(() => (document.querySelector('.dlg[data-dialog="FusionShellBodyCommand"]')?.innerText || "").replace(/\s+/g, " "));
  if (okEnabled) await t.click('.dlg[data-dialog="FusionShellBodyCommand"] [data-action="ok"]');
  await t.waitFor(() => !window.app.activeCommand, { timeout: 4000 });
  await t.escapeAll();
  const st = await t.state();
  const sh = st.features.find((f) => f.type === "shell");
  return { open: true, picked: !!aim, okEnabled, msg, sh, volume: st.volume };
}

const scenario = defineScenario({
  name: "modeling",
  title: "Extrude/Fillet/Hole dialogs + timeline edit on an API-made sketch",
  timeout: 150000,
  async run(t) {
    t.step("setup: Sketch1 with a 40 x 20 rectangle on XY (App API)");
    const sk = await t.app(() => {
      const a = window.app;
      const sk = a.S.newSketch();
      a.S.addRect2pt(sk, [0, 0], [40, 20]);
      const f = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
      const st = a.sketchState(f.id);
      return { id: f.id, n: [0, 0, 1], regions: st && st.regions ? st.regions.regions.length : 0 };
    });
    t.require("setup sketch has one profile", sk.regions === 1, JSON.stringify(sk));
    await t.setView("top");
    await t.app(() => window.app.viewport.fit && window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);
    await t.shot("api-sketch");

    await modelChain(t, { sk, typed: true });

    t.step("Ctrl+Z undoes the timeline edit only");
    const before = await t.state();
    await t.blur();
    await t.mouseToCanvas(0.5, 0.9);
    await t.key("Control+z");
    await t.settle(300);
    const after = await t.state();
    t.check("undo restores the 10 mm extrude (volume drops by ≈ 4000)", near(before.volume - after.volume, 4000, 300), `before=${fmt(before.volume)} after=${fmt(after.volume)}`);
    t.check("undo keeps fillet and hole", after.features.length === 4 && after.features.every((f) => f.ok), JSON.stringify(after.features.map((f) => [f.type, f.ok])));
    await t.key("Control+y");
    await t.settle(300);

    t.step("timeline right-click > Edit Feature on the Fillet");
    const fil = (await t.state()).features.find((f) => f.type === "fillet");
    if (fil) {
      const box = await t.box(`#timeline [data-feature="${fil.id}"]`);
      if (box) {
        await t.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
        await t.settle(250);
        const ok = await t.app(() => { const e = [...document.querySelectorAll("#overlay *")].find((x) => x.offsetParent && x.children.length <= 2 && /^\s*Edit Feature\s*$/.test(x.textContent || "")); if (e) { e.setAttribute("data-qa-edit", "1"); return true; } return false; });
        t.check("timeline context menu has Edit Feature", ok);
        if (ok) {
          await t.click('[data-qa-edit="1"]');
          const dlg = await t.waitFor('.dlg[data-dialog="FusionFilletEdgesCommand"]', { timeout: 2500 });
          t.check("Edit Feature opens the Fillet dialog", dlg);
          if (dlg) {
            const r = await (await t.firstVisible('.dlg[data-dialog="FusionFilletEdgesCommand"] [data-input="radius"]'))?.inputValue().catch(() => "");
            t.check("fillet edit dialog shows the stored radius (2 mm)", /^\s*2(\.0+)?\s*mm\s*$/.test(r || ""), `radius="${r}"`);
            const eSel = await t.app(() => document.querySelector('.dlg[data-dialog="FusionFilletEdgesCommand"]')?.innerText || "");
            t.check("fillet edit dialog shows the selected edge (1 Edge / 1 selected)", /1 selected|1 Edge\b/i.test(eSel), eSel.replace(/\s+/g, " ").slice(0, 120));
            await t.shot("edit-fillet");
            await t.click('.dlg[data-dialog="FusionFilletEdgesCommand"] [data-action="cancel"]');
            await t.settle(200);
            t.check("Cancel leaves the model unchanged", near((await t.state()).volume, before.volume, 0.5));
          }
        }
        await t.escapeAll();
      }
    }

    t.step("Extrude cut through the body from a second sketch");
    const sk2 = await t.app(() => {
      const a = window.app;
      const sk = a.S.newSketch();
      a.S.addRect2pt(sk, [30, 5], [36, 15]);
      const f = a.addFeature({ type: "sketch", plane: { o: [0, 0, 15], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
      return f.id;
    });
    void sk2;
    const v0 = (await t.state()).volume;
    await t.setView("home");
    await t.blur();
    await t.mouseToCanvas(0.5, 0.9);
    await t.key("e");
    if (await t.waitFor('.dlg[data-dialog="Extrude"]', { timeout: 2500 })) {
      const pre = await t.app(() => window.app.selection.ofKind("profile").length);
      if (pre === 0) {
        const pAim = await t.aim([[33, 10, 15], [32, 8, 15], [34, 12, 15]], "h && h.ref && h.ref.kind === 'profile'");
        if (pAim) await t.canvasClick(pAim.x, pAim.y);
        t.check("second sketch's profile pickable on the canvas", !!pAim);
      } else t.note("second sketch's profile was auto-selected (only visible profile)");
      await t.fill('.dlg[data-dialog="Extrude"] [data-input="distance"]', "-5 mm");
      await t.settle(300);
      const op = await t.app(() => { const d = document.querySelector('.dlg[data-dialog="Extrude"]'); const s = d && d.querySelector('[data-input="operation"]'); return s ? (s.value || s.textContent || "").trim() : (d ? d.innerText : ""); });
      t.check("extruding into the body switches Operation to Cut automatically", /cut/i.test(op), `operation="${op.slice(0, 60)}"`);
      const prev = await t.app(() => window.app.viewport.groups.preview.children.length);
      await t.shot("cut-preview");
      t.check("cut preview is shown", prev > 0 || (await t.app(() => window.app.previewing)));
      await t.click('.dlg[data-dialog="Extrude"] [data-action="ok"]');
      await t.waitFor(() => !window.app.activeCommand, { timeout: 2500 });
      const v1 = (await t.state()).volume;
      t.check("cut removed 6 x 10 x 5 = 300 mm^3", near(v0 - v1, 300, 5), `before=${fmt(v0)} after=${fmt(v1)}`);
      await t.shot("after-cut");
    } else t.check("Extrude dialog opens for the cut", false);

    // QA r3: a shell next to a fillet came back unchanged but "ok" (MakeThickSolid returns its input)
    t.step("Shell (top face, 2 mm) of an L bracket with filleted top end edges hollows it");
    let lb = await lBracket(t, { fillet: true });
    t.require("filleted L bracket built (7961.37 mm^3)", lb.ok && near(lb.vol, 7961.37, 0.05), JSON.stringify(lb));
    let r = await shellTopUI(t, "2 mm");
    t.check("shell dialog: top face picked, OK enabled", r.open && r.picked && r.okEnabled, JSON.stringify({ ...r, msg: (r.msg || "").slice(0, 120) }));
    t.check("filleted bracket shelled: Shell1 ok and volume 7961.37 -> 4526.80 (top open)", !!r.sh && r.sh.ok && near(r.volume, 4526.80, 0.5), `volume=${fmt(r.volume, 2)} shell=${JSON.stringify(r.sh)}`);
    await t.shot("shell-filleted-bracket");

    // QA r3: hole tubes meeting the inner walls made the kernel shell fail ("Compute failed")
    t.step("Shell (top face, 2 mm) of an L bracket with two Ø2 through holes keeps tubes around the holes");
    lb = await lBracket(t, { holes: [[40, 5, 2], [5, 30, 2]] });
    t.require("bracket with two Ø2 holes built (7949.73 mm^3)", lb.ok && near(lb.vol, 7949.73, 0.05), JSON.stringify(lb));
    r = await shellTopUI(t, "2 mm");
    t.check("shell of the bracket with holes computes (OK enabled, no Compute failed)", r.open && r.picked && r.okEnabled && !/compute failed/i.test(r.msg || ""), (r.msg || "").slice(0, 160));
    t.check("bracket with holes shelled: volume 4827.88 (2 mm walls + 2 mm tubes)", !!r.sh && r.sh.ok && near(r.volume, 4827.88, 0.5), `volume=${fmt(r.volume, 2)} shell=${JSON.stringify(r.sh)}`);
    await t.shot("shell-bracket-holes");

    // QA r3: revolving about an axis normal to the profile plane gave a silent zero-volume body
    t.step("Revolve of an XZ profile about the Y axis (normal to the profile plane) is refused");
    await t.app(() => {
      const a = window.app;
      a.newDocument("Revolve axis");
      const sk = a.S.newSketch();
      // XZ sketch: u = world X, v = world -Z... keep the L clear of the Z axis
      const P = [[10, 0], [30, 0], [30, 5], [15, 5], [15, 20], [10, 20]].map((q) => a.S.addPoint(sk, q[0], q[1]));
      P.forEach((p, i) => a.S.addLine(sk, p, P[(i + 1) % P.length]));
      a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] }, planeRef: { kind: "origin", name: "XZ" }, sk, visible: true });
    });
    await t.setView("home");
    await t.app(() => window.app.viewport.fit && window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);
    await t.click('#toolbar [data-cmd="Revolve"]');
    if (await t.waitFor('.dlg[data-dialog="Revolve"]', { timeout: 2500 })) {
      const prof = await t.app(() => window.app.ui.dialog.current && (window.app.ui.dialog.current.values.profiles || []).length);
      t.check("Revolve picks up the only profile", prof === 1, `profiles=${prof}`);
      await t.click('.dlg[data-dialog="Revolve"] [data-input="axis"]');
      await t.settle(200);
      const pts = [];
      for (const y of [30, 22, 15, 40, -15, -25, 8]) pts.push([0, y, 0]);
      const aim = await t.aim(pts, "h && h.ref && h.ref.kind === 'originAxis' && h.ref.name === 'Y'");
      if (aim) await t.canvasClick(aim.x, aim.y);
      else await t.app(() => window.app.ui.dialog.current.setSelection("axis", [{ kind: "originAxis", name: "Y" }]));
      t.note(aim ? "Y axis picked on the canvas" : "Y axis not pickable from this view; set in the dialog values");
      await t.settle(600);
      const res = await t.app(() => {
        const d = document.querySelector('.dlg[data-dialog="Revolve"]');
        const ok = d && d.querySelector('[data-action="ok"]');
        const dl = window.app.ui.dialog.current;
        return { axis: dl && JSON.stringify(dl.values.axis), okDisabled: !!ok && ok.disabled, text: (d?.innerText || "").replace(/\s+/g, " ") };
      });
      t.check("Revolve about the Y axis: dialog shows the axis error and OK is disabled", /axis must lie in the plane of the profile/i.test(res.text) && res.okDisabled, JSON.stringify({ ...res, text: res.text.slice(0, 200) }));
      await t.shot("revolve-normal-axis");
      await t.click('.dlg[data-dialog="Revolve"] [data-action="cancel"]');
      await t.settle(200);
    } else t.check("Revolve dialog opens", false);
    const rv = await t.app(() => {
      const a = window.app;
      const f = a.addFeature({ type: "revolve", profiles: [{ sketch: a.doc.features[0].id, key: a.sketchState(a.doc.features[0].id).regions.regions[0].key }], axis: { kind: "origin", name: "Y" }, revType: "full", angle: "360 deg", operation: "new" });
      const r = a.featureResult(f.id) || {};
      return { ok: r.ok, error: r.error, bodies: a.bodies().length, marker: !!document.querySelector(`#timeline [data-feature="${f.id}"]`) };
    });
    t.check("a stored Revolve about the normal axis is an error feature (no zero-volume body)", rv.ok === false && rv.bodies === 0 && /axis/i.test(rv.error || ""), JSON.stringify(rv));
    const rz = await t.app(() => {
      const a = window.app;
      a.updateFeature(a.doc.features[1].id, { axis: { kind: "origin", name: "Z" } });
      const r = a.featureResult(a.doc.features[1].id) || {};
      return { ok: r.ok, vol: a.bodies().reduce((s, b) => s + a.K.R.measureVolume(b.shape), 0) };
    });
    t.check("the same Revolve about the Z axis (in the profile plane) computes", rz.ok && rz.vol > 1000, JSON.stringify(rz));

    // QA r3 (dialogs): Cut + Extent All aimed away from the body, Move triad, Rectangular Pattern Directions
    await cutAllIntoBody(t);
    await moveTriad(t);
    await rectPatternDirections(t);
  },
});

/** New document with a 40 x 20 x 10 box body (the tester's 8000 mm^3 bracket stand-in). */
async function boxDoc(t, name) {
  await t.escapeAll();
  await t.app((n) => {
    const a = window.app;
    a.newDocument(n);
    a.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "40 mm", width: "20 mm", height: "10 mm", operation: "new" });
  }, name);
  await t.setView("home");
  await t.app(() => window.app.viewport.fit && window.app.viewport.fit({ animate: false }));
  await t.cameraStable(2000);
}

/** Pick a dropdown option of the open dialog through the UI (click the control, then the menu item). */
async function pickOption(t, dlgId, input, value) {
  await t.click(`.dlg[data-dialog="${dlgId}"] [data-input="${input}"]`);
  await t.settle(150);
  const clicked = await t.click(`.dlg-dd-menu [data-option="${value}"]`);
  await t.settle(350);
  const cur = await t.app(([d, i]) => document.querySelector(`.dlg[data-dialog="${d}"] [data-input="${i}"]`)?.dataset.value, [dlgId, input]);
  return clicked && cur === String(value);
}

// Extrude > Operation Cut > Extent All on a sketch lying on the top face goes INTO the body
// (Fusion aims an all-through cut at the material; it used to point away and cut nothing).
async function cutAllIntoBody(t) {
  t.step("Extrude Cut with Extent All from a top-face sketch cuts through the body");
  await boxDoc(t, "Cut all");
  await t.app(() => {
    const a = window.app, S = a.S;
    const sk = S.newSketch();
    S.addCircle(sk, S.addPoint(sk, -10, 0), 3);
    S.addCircle(sk, S.addPoint(sk, 10, 0), 3);
    const plane = { o: [0, 0, 10], x: [1, 0, 0], n: [0, 0, 1] };
    a.addFeature({ type: "sketch", plane, planeRef: { kind: "face", body: a.bodies()[0].id, p: [0, 0, 10], n: [0, 0, 1], plane }, sk, visible: true });
  });
  const v0 = (await t.state()).volume;
  await t.blur();
  await t.mouseToCanvas(0.5, 0.9);
  await t.key("e");
  if (!(await t.waitFor('.dlg[data-dialog="Extrude"]', { timeout: 2500 }))) { t.check("Extrude dialog opens for the cut-all", false); return; }
  await t.app(() => {
    const d = window.app.ui.dialog.current;
    const s = [...d.baseState.sketches.values()].pop();
    d.setSelection("profiles", s.regions.regions.map((r) => ({ kind: "profile", sketch: s.id, key: r.key, c: r.outer.poly[0] })));
  });
  await t.settle(300);
  t.check("Operation set to Cut through the dropdown", await pickOption(t, "Extrude", "operation", "cut"));
  t.check("Extent Type set to All through the dropdown", await pickOption(t, "Extrude", "extent", "all"));
  await t.settle(400);
  const flip = await t.app(() => window.app.ui.dialog.current.values.flip);
  t.check("Cut + All is aimed into the body (direction flipped automatically)", flip === true, `flip=${flip}`);
  await t.shot("cut-all-preview");
  // flipping it back by hand points the cut away from the body: the dialog says nothing is cut
  await t.click('.dlg[data-dialog="Extrude"] [data-input="flip"] [data-option="false"]');
  await t.settle(500);
  const msg = await t.app(() => document.querySelector('.dlg[data-dialog="Extrude"] .dlg-msg')?.textContent || "");
  t.check("a cut that removes nothing is flagged in the dialog", /no target body/i.test(msg), `msg="${msg}"`);
  await t.click('.dlg[data-dialog="Extrude"] [data-input="flip"] [data-option="true"]');
  await t.settle(500);
  await t.click('.dlg[data-dialog="Extrude"] [data-action="ok"]');
  await t.waitFor(() => !window.app.activeCommand, { timeout: 2500 });
  const v1 = (await t.state()).volume;
  t.check("all-through cut leaves two dia 6 holes (8000 -> 7434.51)", near(v0, 8000, 0.01) && near(v1, 8000 - 2 * Math.PI * 9 * 10, 0.05), `before=${fmt(v0, 2)} after=${fmt(v1, 2)}`);
}

// M: Fusion's triad (axis arrows + planar handles + rotate rings + free-move ball) that follows the moved body.
async function moveTriad(t) {
  t.step("Move/Copy shows Fusion's triad and it follows the moved body");
  await boxDoc(t, "Move triad");
  await t.app(() => window.app.selection.set([{ kind: "body", body: window.app.bodies()[0].id }]));
  await t.blur();
  await t.mouseToCanvas(0.5, 0.9);
  await t.key("m");
  if (!(await t.waitFor('.dlg[data-dialog="FusionMoveCommand"]', { timeout: 2500 }))) { t.check("Move dialog opens", false); return; }
  await t.settle(500);
  const kinds = await t.app(() => [...window.app.ui.dialog.current.manips.items.values()].map((it) => `${it.def.id}:${it.def.type}${it.def.look ? "/" + it.def.look : ""}`));
  const want = ["tx:distance/axis", "ty:distance/axis", "tz:distance/axis", "pxy:plane", "pyz:plane", "pxz:plane", "free:plane/ball", "rx:angle", "ry:angle", "rz:angle"];
  t.check("triad has X/Y/Z arrows, planar handles, rotate rings and a free-move ball", want.every((k) => kinds.includes(k)), kinds.join(" "));
  const sp = () => t.app(() => { const m = window.app.ui.dialog.current.manips; const r = window.app.viewport.canvas.getBoundingClientRect(); return Object.fromEntries(["tx", "ty", "tz", "free"].map((k) => { const p = m.screenPoint(k); return [k, p && [p[0] + r.left, p[1] + r.top]]; })); });
  const s0 = await sp();
  t.check("the X arrow is long (a triad arrow, not a 26 px glyph)", s0.tx && s0.free && Math.hypot(s0.tx[0] - s0.free[0], s0.tx[1] - s0.free[1]) > 50, JSON.stringify(s0));
  if (s0.tx && s0.free) {
    // drag the X arrow outwards along its own screen direction
    const dx = s0.tx[0] - s0.free[0], dy = s0.tx[1] - s0.free[1], L = Math.hypot(dx, dy) || 1;
    await t.page.mouse.move(s0.tx[0], s0.tx[1]);
    await t.page.mouse.down();
    await t.page.mouse.move(s0.tx[0] + (dx / L) * 50, s0.tx[1] + (dy / L) * 50, { steps: 8 });
    await t.page.mouse.move(s0.tx[0] + (dx / L) * 100, s0.tx[1] + (dy / L) * 100, { steps: 8 });
    await t.page.mouse.up();
    await t.settle(500);
  }
  const tx = await t.app(() => window.app.ui.dialog.current.num("tx"));
  const s1 = await sp();
  t.check("dragging the X arrow sets X Distance", tx > 1, `tx=${tx}`);
  const moved = (k) => s0[k] && s1[k] && Math.hypot(s1[k][0] - s0[k][0], s1[k][1] - s0[k][1]) > 30;
  t.check("the Y and Z arrows and the centre ball follow the moved body", moved("ty") && moved("tz") && moved("free"), JSON.stringify({ s0, s1 }));
  await t.shot("move-triad");
  await t.click('.dlg[data-dialog="FusionMoveCommand"] [data-action="ok"]');
  await t.waitFor(() => !window.app.activeCommand, { timeout: 2500 });
  const xmin = await t.app(() => window.app.bodies()[0].shape.boundingBox.bounds[0][0]);
  t.check("OK moves the body by the dragged X Distance", near(xmin, -20 + tx, 1e-6), `xmin=${xmin} tx=${tx}`);
}

// Rectangular Pattern: Directions are selections (edge / axis / sketch line) with a flip button,
// plus on-canvas distance and quantity manipulators.
async function rectPatternDirections(t) {
  t.step("Rectangular Pattern: Directions selection + flip + on-canvas manipulators");
  await boxDoc(t, "Rect pattern");
  await t.app(() => window.app.selection.set([{ kind: "body", body: window.app.bodies()[0].id }]));
  await t.click('#toolbar [data-cmd="PatternRectangular"]');
  if (!(await t.waitFor('.dlg[data-dialog="PatternRectangular"]', { timeout: 2500 }))) {
    await t.app(() => window.app.commands.run("PatternRectangular"));
    if (!(await t.waitFor('.dlg[data-dialog="PatternRectangular"]', { timeout: 2500 }))) { t.check("Rectangular Pattern dialog opens", false); return; }
  }
  await t.settle(400);
  const ui = await t.app(() => {
    const d = document.querySelector('.dlg[data-dialog="PatternRectangular"]');
    const sel = d.querySelector('[data-input="dir1"]');
    return { count: sel && sel.dataset.count, flip: !!d.querySelector('[data-input="flip1"]'), label: (sel && sel.closest(".dlg-row")?.textContent || "").trim().slice(0, 24), objects: d.querySelector('[data-input="bodies"]')?.dataset.count };
  });
  t.check("Direction 1 is a Directions selection with a flip button (not an X/Y/Z dropdown)", ui.count === "0" && ui.flip && /Directions/.test(ui.label) && ui.objects === "1", JSON.stringify(ui));
  // the body's bottom front edge (along X) as direction 1, picked as a canvas click would
  const ok = await t.app(() => {
    const a = window.app, d = a.ui.dialog.current;
    d.pickRef("dir1", { kind: "edge", body: a.bodies()[0].id, index: -1, p: [0, -10, 0] });
    return (d.values.dir1 || []).length === 1;
  });
  t.check("a linear body edge is accepted as the direction", ok);
  await t.fill('.dlg[data-dialog="PatternRectangular"] [data-input="q1"]', "2");
  await t.fill('.dlg[data-dialog="PatternRectangular"] [data-input="d1"]', "60 mm");
  await t.settle(400);
  const mk = await t.app(() => [...window.app.ui.dialog.current.manips.items.keys()]);
  t.check("distance and quantity manipulators are drawn for Direction 1", mk.includes("d1") && mk.includes("q1"), mk.join(","));
  await t.click('.dlg[data-dialog="PatternRectangular"] [data-input="flip1"]');
  await t.settle(400);
  await t.shot("rect-pattern");
  await t.click('.dlg[data-dialog="PatternRectangular"] [data-action="ok"]');
  await t.waitFor(() => !window.app.activeCommand, { timeout: 2500 });
  const xs = await t.app(() => window.app.bodies().map((b) => b.shape.boundingBox.bounds[0][0]).sort((a, b) => a - b));
  t.check("flipped edge direction puts the copy 60 mm along -X", xs.length === 2 && near(xs[0], -80, 0.01) && near(xs[1], -20, 0.01), xs.map((x) => fmt(x, 2)).join(","));
}

export default scenario;
await mainIfDirect(import.meta.url, scenario);
