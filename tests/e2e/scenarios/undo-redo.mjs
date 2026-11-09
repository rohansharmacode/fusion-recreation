// Undo / redo through Ctrl+Z / Ctrl+Y and the application-bar buttons; browser + timeline follow.
import { defineScenario, mainIfDirect, apiBox } from "../lib.mjs";

const scenario = defineScenario({
  name: "undo-redo",
  title: "Undo/redo via keyboard and application bar",
  async run(t) {
    t.step("initial state: undo/redo disabled");
    const dis0 = await t.app(() => {
      const u = document.querySelector('#appbar [data-cmd="Undo"]');
      const r = document.querySelector('#appbar [data-cmd="Redo"]');
      const off = (e) => !!e && (e.disabled || e.getAttribute("aria-disabled") === "true" || /disabled/.test(e.className));
      return { u: !!u, r: !!r, ud: off(u), rd: off(r) };
    });
    t.check("app bar has Undo and Redo buttons", dis0.u && dis0.r, JSON.stringify(dis0));
    t.check("Undo/Redo look disabled with an empty history", dis0.ud && dis0.rd, JSON.stringify(dis0));

    t.step("create two boxes (setup through the App API)");
    await apiBox(t);
    await apiBox(t, { center: [60, 0] });
    let s = await t.state();
    t.require("setup: two features, two bodies", s.features.length === 2 && s.bodies.length === 2, JSON.stringify(s.features));
    const tl = async () => t.app(() => document.querySelectorAll("#timeline [data-feature]").length);
    const tw0 = Date.now();
    await t.waitFor(() => document.querySelectorAll("#timeline [data-feature]").length === 2, { timeout: 5000 });
    const lag = Date.now() - tw0;
    t.check("timeline shows 2 features", (await tl()) === 2, `timeline items=${await tl()}`);
    // headless SwiftShader frames are slow and the timeline renders on requestAnimationFrame, so only note the lag
    t.note(`timeline caught up ${lag} ms after the model change (rAF-driven; slow in software GL)`);
    await t.shot("two-boxes");

    t.step("Ctrl+Z");
    await t.blur();
    await t.mouseToCanvas(0.5, 0.5);
    await t.key("Control+z");
    await t.settle(200);
    s = await t.state();
    t.check("Ctrl+Z removes the last feature", s.features.length === 1 && s.bodies.length === 1, `features=${s.features.length} bodies=${s.bodies.length}`);
    t.check("timeline follows undo", (await tl()) === 1, `timeline items=${await tl()}`);

    t.step("Undo button in the application bar");
    t.check("Undo button enabled when there is history", await t.app(() => { const u = document.querySelector('#appbar [data-cmd="Undo"]'); return !!u && !u.disabled && u.getAttribute("aria-disabled") !== "true" && !/disabled/.test(u.className); }));
    await t.click('#appbar [data-cmd="Undo"]');
    await t.settle(200);
    s = await t.state();
    t.check("Undo button removes the first feature", s.features.length === 0 && s.bodies.length === 0, `features=${s.features.length}`);
    const browserBodies = await t.app(() => document.querySelectorAll('#browser-host [data-node^="body:"]').length);
    t.check("browser lists no bodies after undoing everything", browserBodies === 0, `body nodes=${browserBodies}`);
    await t.shot("all-undone");

    t.step("Ctrl+Y and Redo button");
    await t.blur();
    await t.key("Control+y");
    await t.settle(200);
    s = await t.state();
    t.check("Ctrl+Y redoes one step", s.features.length === 1, `features=${s.features.length}`);
    await t.click('#appbar [data-cmd="Redo"]');
    await t.settle(200);
    s = await t.state();
    t.check("Redo button redoes the second step", s.features.length === 2 && s.bodies.length === 2, `features=${s.features.length}`);
    const rd = await t.app(() => { const r = document.querySelector('#appbar [data-cmd="Redo"]'); return !!r && (r.disabled || r.getAttribute("aria-disabled") === "true" || /disabled/.test(r.className)); });
    t.check("Redo disabled again at the end of the redo stack", rd);
    await t.shot("redone");

    t.step("a new action clears the redo stack");
    await t.key("Control+z");
    await apiBox(t, { center: [0, 60] });
    s = await t.state();
    t.check("redo stack cleared after a new change", s.redo === 0, `redo=${s.redo}`);

    t.step("Ctrl+Z while typing in an input does not undo the model");
    await t.click('#toolbar [data-panel="SolidCreatePanel"]');
    await t.escapeAll();
    const n = (await t.state()).features.length;
    const inputSel = await t.app(() => {
      const el = document.createElement("input");
      el.id = "qa-probe-input";
      el.style.cssText = "position:fixed;left:10px;bottom:60px;z-index:99999";
      document.body.appendChild(el);
      return "#qa-probe-input";
    });
    await t.click(inputSel);
    await t.type("abc");
    await t.key("Control+z");
    t.check("Ctrl+Z inside a text input is left to the input", (await t.state()).features.length === n, `features ${n} -> ${(await t.state()).features.length}`);
    await t.app(() => document.getElementById("qa-probe-input")?.remove());
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
