// Modeling half of the core loop, isolated from the sketch module: a 40x20 rectangle sketch on XY is
// created through the App API, then E -> OK -> F -> OK -> H -> OK -> timeline edit run through the UI
// (same steps and checks as core-loop's second half). Also: undo of the edit, and Edit Feature via
// the timeline context menu.
import { defineScenario, mainIfDirect, near, fmt } from "../lib.mjs";
import { modelChain } from "./core-loop.mjs";

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
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
