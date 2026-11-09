// Shell + shortcuts: application bar items, navigation bar order, Help > About text, default
// keyboard shortcuts start the right commands (and not while typing), panel toggles.
import { defineScenario, mainIfDirect, apiBox } from "../lib.mjs";

// key -> expected command id (from CommandDefinitions.xml HotKey= / Fusion shortcut reference)
const MODEL_KEYS = [["e", "Extrude"], ["h", "FusionHoleCommand"], ["q", "FusionPressPullCommand"], ["f", "FusionFilletEdgesCommand"], ["m", "FusionMoveCommand"], ["a", "AppearanceCommand"], ["i", "MeasureCommand"]];
const NAV_ORDER = [["Orbit", /Orbit/], ["Look At", /LookAt/], ["Pan", /Pan/], ["Zoom", /^Zoom(?!Fit|Window)|ZoomCommand$/], ["Fit", /Fit/], ["Display Settings", /Display|ViewDisplay|VisualStyle/], ["Grid and Snaps", /Grid/], ["Viewports", /Viewport|SplitView|MultiView/]];

const scenario = defineScenario({
  name: "shortcuts",
  title: "Application bar, nav bar, About, keyboard shortcuts",
  async run(t) {
    // ---------- application bar ----------
    t.step("application bar");
    const ab = await t.app(() => {
      const el = document.getElementById("appbar");
      const cmds = [...el.querySelectorAll("[data-cmd]")].filter((e) => e.offsetParent).map((e) => ({ id: e.getAttribute("data-cmd"), x: e.getBoundingClientRect().left }));
      return { text: el.innerText, h: el.getBoundingClientRect().height, cmds };
    });
    t.check("app bar height 26–34 px (Fusion ~30)", ab.h >= 26 && ab.h <= 34, `h=${ab.h}`);
    t.check("document tab shows 'Untitled'", /Untitled/.test(ab.text), ab.text.replace(/\s+/g, " ").slice(0, 100));
    const ids = ab.cmds.map((c) => c.id);
    for (const id of ["ToggleDataPanel", "FileSave", "Undo", "Redo"]) t.check(`app bar has ${id}`, ids.includes(id), ids.join(","));
    const xo = ["ToggleDataPanel", "FileSave", "Undo", "Redo"].map((id) => (ab.cmds.find((c) => c.id === id) || {}).x).filter((x) => x !== undefined);
    t.check("left group order: Data Panel, (File), Save, Undo, Redo", xo.every((x, i) => i === 0 || x > xo[i - 1]), JSON.stringify(ab.cmds.slice(0, 8)));
    await t.shot("appbar");

    // ---------- navigation bar ----------
    t.step("navigation bar order");
    const nav = await t.app(() => [...document.querySelectorAll("#navbar-host [data-cmd]")].filter((e) => e.offsetParent).map((e) => ({ id: e.getAttribute("data-cmd"), x: e.getBoundingClientRect().left, t: e.title || e.getAttribute("aria-label") || "" })));
    t.note(`nav bar: ${nav.map((n) => n.id).join(", ")}`);
    let lastX = -1, inOrder = true;
    for (const [label, re] of NAV_ORDER) {
      const it = nav.find((n) => re.test(n.id) || re.test(n.t));
      t.check(`nav bar has ${label}`, !!it, nav.map((n) => n.id).join(","));
      if (it) { if (it.x < lastX) inOrder = false; lastX = it.x; }
    }
    t.check("nav bar order: Orbit, Look At, Pan, Zoom, Fit | Display Settings, Grid and Snaps, Viewports", inOrder);
    const nb = await t.box("#navbar-host");
    t.check("nav bar centred at the bottom of the canvas", nb && Math.abs(nb.x + nb.width / 2 - 800) < 220 && nb.y > 900 * 0.75, nb && JSON.stringify({ x: Math.round(nb.x), y: Math.round(nb.y), w: Math.round(nb.width) }));
    await t.shot("navbar");

    // ---------- Help > About ----------
    t.step("Help > About text");
    const about = await t.app(() => {
      const c = window.app.commands.get("About");
      if (!c) return null;
      window.app.commands.run("About");
      return true;
    });
    await t.settle(300);
    const txt = await t.app(() => document.body.innerText);
    t.check("About command registered", about === true);
    t.check("About says 'Unofficial hackathon recreation — not affiliated with or endorsed by Autodesk'", /unofficial/i.test(txt) && /not affiliated/i.test(txt) && /Autodesk/.test(txt), "text not found");
    await t.shot("about");
    await t.escapeAll();

    // ---------- shortcuts ----------
    t.step("model shortcuts start their commands");
    await apiBox(t);
    for (const [k, id] of MODEL_KEYS) {
      await t.escapeAll();
      await t.blur();
      await t.mouseToCanvas(0.55, 0.55);
      const started = await t.app(() => { window.__qaStarts = []; const off = window.app.on("command-start", (d) => window.__qaStarts.push(d.id)); window.__qaOff = off; return true; });
      void started;
      await t.key(k);
      await t.settle(200);
      const got = await t.app(() => { window.__qaOff && window.__qaOff(); return { starts: window.__qaStarts, active: window.app.activeCommand && window.app.activeCommand.id, dlg: [...document.querySelectorAll(".dlg[data-dialog]")].filter((e) => e.offsetParent).map((e) => e.getAttribute("data-dialog")) }; });
      const ok = got.starts.includes(id) || got.active === id || got.dlg.includes(id);
      t.check(`'${k.toUpperCase()}' starts ${id}`, ok, JSON.stringify(got));
    }
    await t.escapeAll();

    t.step("Esc cancels an open dialog");
    await t.blur();
    await t.key("e");
    await t.waitFor('.dlg[data-dialog="Extrude"]', { timeout: 1500 });
    await t.key("Escape");
    await t.settle(200);
    t.check("Esc closes the Extrude dialog and leaves no preview", !(await t.visible('.dlg[data-dialog="Extrude"]')) && !(await t.app(() => window.app.previewing)));

    t.step("Ctrl+B Compute All, Delete key, and view toggles");
    const n = (await t.state()).features.length;
    await t.key("Control+b");
    await t.settle(200);
    t.check("Ctrl+B (Compute All) keeps the model computed", (await t.state()).features.every((f) => f.ok));
    // select the body in the browser, then press Delete with the mouse over the canvas
    // (Fusion shows the Bodies folder collapsed: open it first)
    if (await t.app(() => document.querySelector('#browser-host [data-node="bodies:root"]')?.getAttribute("aria-expanded") === "false")) {
      await t.click('#browser-host [data-node="bodies:root"] [data-expand]');
      await t.settle(100);
    }
    const bodyRow = await t.app(() => { const e = document.querySelector('#browser-host [data-node^="body:"]'); if (e) e.setAttribute("data-qa-body", "1"); return !!e; });
    if (bodyRow) {
      await t.click('[data-qa-body="1"]');
      await t.settle(100);
      await t.blur();
      await t.mouseToCanvas(0.55, 0.55);
      await t.key("Delete");
      await t.settle(300);
      const s = await t.state();
      t.check("Delete key removes the selected body", s.bodies.length === 0, JSON.stringify({ bodies: s.bodies.length, features: s.features.map((f) => f.type), sel: s.selection }));
      await t.key("Control+z");
      await t.settle(200);
      t.check("Ctrl+Z brings the deleted body back", (await t.state()).bodies.length === 1);
    } else t.check("body row in the browser for the Delete test", false);
    void n;

    for (const [combo, sel, label] of [["Control+Alt+v", "#viewcube-host canvas", "ViewCube"], ["Control+Alt+n", "#navbar-host [data-cmd]", "Navigation bar"]]) {
      await t.blur();
      await t.key(combo);
      await t.settle(200);
      const hid = !(await t.visible(sel));
      await t.key(combo);
      await t.settle(200);
      const back = await t.visible(sel);
      t.check(`${combo} toggles the ${label}`, hid && back, JSON.stringify({ hid, back }));
    }

    t.step("shortcuts do not fire while typing");
    await t.app(() => { const el = document.createElement("input"); el.id = "qa-type"; el.style.cssText = "position:fixed;left:10px;bottom:60px;z-index:99999"; document.body.appendChild(el); });
    await t.click("#qa-type");
    await t.type("eh fq");
    await t.settle(200);
    t.check("typing letters in an input starts no command", !(await t.app(() => window.app.activeCommand)) && !(await t.visible(".dlg[data-dialog]")));
    await t.app(() => document.getElementById("qa-type")?.remove());

    t.step("Ctrl+S does not open the browser's save-page dialog (default prevented)");
    const prevented = await t.app(() => { const ev = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; });
    t.check("Ctrl+S keydown default is prevented", prevented);
    await t.escapeAll();
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
