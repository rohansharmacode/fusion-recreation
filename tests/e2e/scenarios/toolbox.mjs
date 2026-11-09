// S toolbox ("Design Shortcuts"): S opens a search box at the cursor, typing filters commands,
// Enter runs the top match, Esc closes, typing does not trigger shortcuts.
import { defineScenario, mainIfDirect } from "../lib.mjs";

const scenario = defineScenario({
  name: "toolbox",
  title: "S toolbox search and run",
  async run(t) {
    const m = await t.mouseToCanvas(0.45, 0.5);
    await t.blur();
    t.step("press S over the canvas");
    await t.key("s");
    const open = await t.waitFor(".tbx-root input", { timeout: 2000 });
    await t.shot("toolbox-open");
    t.require("S opens the toolbox (.tbx-root input)", open);
    const focused = await t.app(() => { const a = document.activeElement; return !!(a && a.closest && a.closest(".tbx-root") && a.tagName === "INPUT"); });
    t.check("search input is focused", focused);
    const bb = await t.box(".tbx-root");
    t.check("toolbox opens near the cursor", bb && Math.abs(bb.x + bb.width / 2 - m.x) < 400 && Math.abs(bb.y - m.y) < 350, bb && `box at ${Math.round(bb.x)},${Math.round(bb.y)} cursor ${Math.round(m.x)},${Math.round(m.y)}`);
    const pinned = await t.app(() => document.querySelectorAll(".tbx-root [data-cmd]").length);
    // Fusion 2706 (ref 20-s-toolbox): "Design Shortcuts" shows one icon per runnable shortcut (Extrude, Fillet)
    t.check("toolbox shows the Design Shortcuts title and shortcut icons", pinned >= 2 && /Design Shortcuts/.test(await t.app(() => document.querySelector(".tbx-root").innerText)), `pinned=${pinned}`);

    t.step("type 'fillet' (contains f/i/l/e/t shortcut letters)");
    if (!focused) await t.click(".tbx-root input");
    await t.type("fillet");
    await t.settle(250);
    const st = await t.state();
    t.check("typing in the toolbox does not trigger shortcuts (no command started)", !st.activeCommand && st.mode === "model", JSON.stringify({ cmd: st.activeCommand, mode: st.mode }));
    const rows = await t.app(() => [...document.querySelectorAll(".tbx-root [data-cmd]")].filter((e) => e.offsetParent).map((e) => ({ cmd: e.getAttribute("data-cmd"), text: e.innerText.trim() })));
    t.check("results list Fillet (FusionFilletEdgesCommand)", rows.some((r) => r.cmd === "FusionFilletEdgesCommand"), JSON.stringify(rows.slice(0, 8)));
    await t.shot("toolbox-results");

    t.step("clear and search 'box', press Enter");
    await t.page.keyboard.press("Control+A");
    await t.type("box");
    await t.settle(200);
    await t.key("Enter");
    const dlg = await t.waitFor('.dlg[data-dialog="PrimitiveBox"]', { timeout: 2500 });
    await t.shot("box-from-toolbox");
    t.check("Enter runs the top match (Box dialog opens)", dlg);
    t.check("toolbox closes after running a command", !(await t.visible(".tbx-root")));
    await t.escapeAll();

    t.step("S then Esc");
    await t.blur();
    await t.mouseToCanvas(0.45, 0.5);
    await t.key("s");
    await t.waitFor(".tbx-root input", { timeout: 1500 });
    await t.key("Escape");
    await t.settle(200);
    t.check("Esc closes the toolbox", !(await t.visible(".tbx-root")));

    t.step("S then outside click");
    await t.key("s");
    await t.waitFor(".tbx-root input", { timeout: 1500 });
    await t.page.mouse.click(200, 600);
    await t.settle(200);
    t.check("clicking outside closes the toolbox", !(await t.visible(".tbx-root")));
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
