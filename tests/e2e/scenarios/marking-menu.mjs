// Marking menu: right-click on the canvas -> radial menu with Fusion's 8 wedges in the right
// positions (MarkingMenus.xml FusionSolidEnvironment), Sketch second tier, overflow list, Esc closes,
// running a wedge command, gesture (right-drag) and OK/Cancel inside an active command.
import { defineScenario, mainIfDirect, apiBox } from "../lib.mjs";

// direction (screen, y down) for each compass position
const POS = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
const WEDGES = [
  ["N", ["RepeatCommand"], "Repeat"],
  ["NE", ["FusionPressPullCommand"], "Press Pull"],
  ["E", ["Redo", "RedoCommand"], "Redo"],
  ["SE", ["FusionHoleCommand"], "Hole"],
  ["SW", ["FusionMoveCommand"], "Move/Copy"],
  ["W", ["Undo", "UndoCommand"], "Undo"],
  ["NW", ["FusionDeleteCommand"], "Delete"],
];
const SKETCH_TIER = [["N", ["SketchStop"]], ["NE", ["ShapeRectangleTwoPoint"]], ["E", ["DrawSpline"]], ["SE", ["ProjectNewCmd"]], ["S", ["DrawPolyline"]], ["SW", ["Offset"]], ["W", ["SketchDimension"]], ["NW", ["CircleCenterRadius"]]];

async function wedgeMap(t) {
  return t.app(() => {
    const root = [...document.querySelectorAll(".mm-root")].find((e) => e.offsetParent || e.getClientRects().length);
    if (!root) return null;
    const items = [...root.querySelectorAll("[data-cmd], [data-mm], [data-action]")].filter((e) => e.getClientRects().length);
    return items.map((e) => {
      const r = e.getBoundingClientRect();
      return { cmd: e.getAttribute("data-cmd"), mm: e.getAttribute("data-mm"), action: e.getAttribute("data-action"), text: (e.innerText || "").trim().slice(0, 40), cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
  });
}

function dirOf(item, c) {
  const dx = item.cx - c.x, dy = item.cy - c.y;
  const L = Math.hypot(dx, dy) || 1;
  return [dx / L, dy / L, L];
}

function matches(item, ids) { return ids.includes(item.cmd) || ids.includes(item.mm); }

function inDirection(item, c, pos) {
  const [ux, uy, L] = dirOf(item, c);
  const [px, py] = POS[pos];
  const pl = Math.hypot(px, py);
  return L > 25 && (ux * px + uy * py) / pl > 0.8;
}

const scenario = defineScenario({
  name: "marking-menu",
  title: "Right-click marking menu, second tier, gestures, in-command OK/Cancel",
  async run(t) {
    const c = await t.mouseToCanvas(0.5, 0.55);

    t.step("right-click empty canvas");
    await t.page.mouse.click(c.x, c.y, { button: "right" });
    const open = await t.waitFor(".mm-root", { timeout: 2000 });
    await t.shot("marking-menu");
    t.require("right-click opens the marking menu (.mm-root)", open);
    const items = await wedgeMap(t);
    t.note(`items: ${items.map((i) => `${i.cmd || i.mm || i.action}:${i.text}`).join(" | ")}`);
    for (const [pos, ids, label] of WEDGES) {
      const it = items.find((i) => matches(i, ids));
      t.check(`${label} wedge present (${ids.join("|")})`, !!it, "not found");
      if (it) t.check(`${label} sits at ${pos}`, inDirection(it, c, pos), `offset ${Math.round(it.cx - c.x)},${Math.round(it.cy - c.y)}`);
    }
    const sk = items.find((i) => !i.cmd && ((i.mm && /sketch/i.test(i.mm)) || /(^|\s)Sketch(\s|▸|$)/.test(i.text)));
    t.check("Sketch wedge present at S", !!sk && inDirection(sk, c, "S"), sk ? `offset ${Math.round(sk.cx - c.x)},${Math.round(sk.cy - c.y)}` : "no 'Sketch' item");
    const ov = await t.app(() => { const r = document.querySelector(".mm-root"); return r ? r.innerText : ""; });
    t.check("overflow list includes Pan / Zoom / Orbit", /Pan/.test(ov) && /Zoom/.test(ov) && /Orbit/.test(ov), ov.replace(/\s+/g, " ").slice(0, 150));
    const rep = items.find((i) => i.cmd === "RepeatCommand");
    t.check("Repeat wedge shows a label (Repeat …)", rep && /Repeat/i.test(rep.text), rep && rep.text);

    t.step("hover Sketch -> second tier");
    if (sk) {
      await t.page.mouse.move(sk.cx, sk.cy, { steps: 6 });
      await t.settle(400);
      const tier = await wedgeMap(t);
      await t.shot("sketch-tier");
      const center = { x: sk.cx, y: sk.cy };
      let found = 0, placed = 0;
      for (const [pos, ids] of SKETCH_TIER) {
        const it = tier && tier.find((i) => matches(i, ids));
        if (it) { found++; if (inDirection(it, center, pos) || inDirection(it, c, pos)) placed++; }
      }
      t.check("second tier shows the 8 sketch commands (Finish Sketch, 2-Point Rectangle, Spline, Project, Line, Offset, Dimension, Circle)", found >= 7, `found ${found}/8`);
      t.check("second tier commands are in Fusion's positions", placed >= 7, `placed ${placed}/${found}`);
    }

    t.step("Esc closes the menu");
    await t.key("Escape");
    await t.settle(200);
    t.check("Esc dismisses the marking menu", !(await t.visible(".mm-root")));

    t.step("clicking the centre dismisses the menu");
    await t.page.mouse.click(c.x, c.y, { button: "right" });
    await t.waitFor(".mm-root", { timeout: 1500 });
    await t.page.mouse.click(c.x, c.y);
    await t.settle(200);
    t.check("click in the middle dismisses the menu without running a command", !(await t.visible(".mm-root")) && !(await t.app(() => window.app.activeCommand)), "menu still open or a command started");

    t.step("run Undo from the W wedge");
    await apiBox(t);
    await apiBox(t, { center: [60, 0] });
    const n0 = (await t.state()).features.length;
    await t.page.mouse.click(c.x, c.y, { button: "right" });
    await t.waitFor(".mm-root", { timeout: 1500 });
    const it2 = await wedgeMap(t);
    const undo = it2 && it2.find((i) => matches(i, ["Undo", "UndoCommand"]));
    if (undo) {
      await t.page.mouse.move(undo.cx, undo.cy, { steps: 5 });
      await t.page.mouse.click(undo.cx, undo.cy);
      await t.settle(300);
      t.check("Undo wedge undoes the last feature", (await t.state()).features.length === n0 - 1, `features ${n0} -> ${(await t.state()).features.length}`);
    } else t.check("Undo wedge available for clicking", false);
    await t.escapeAll();

    t.step("gesture: right-press, flick right (E = Redo), release");
    const n1 = (await t.state()).features.length;
    await t.page.mouse.move(c.x, c.y);
    await t.page.mouse.down({ button: "right" });
    await t.page.mouse.move(c.x + 40, c.y, { steps: 2 });
    await t.page.mouse.move(c.x + 110, c.y, { steps: 2 });
    await t.page.mouse.up({ button: "right" });
    await t.settle(300);
    t.check("right-drag gesture to the E runs Redo", (await t.state()).features.length === n1 + 1, `features ${n1} -> ${(await t.state()).features.length}`);
    t.check("no menu left open after a gesture", !(await t.visible(".mm-root")));
    await t.escapeAll();

    t.step("inside a command: OK/Cancel in the marking menu");
    await t.blur();
    await t.mouseToCanvas(0.5, 0.55);
    await t.key("e");
    const ext = await t.waitFor('.dlg[data-dialog="Extrude"]', { timeout: 2500 });
    t.check("Extrude dialog opened for the in-command test", ext);
    if (ext) {
      await t.page.mouse.click(c.x, c.y - 120, { button: "right" });
      await t.waitFor(".mm-root", { timeout: 1500 });
      const ci = await wedgeMap(t);
      await t.shot("in-command-menu");
      const center = { x: c.x, y: c.y - 120 };
      const ok = ci && ci.find((i) => i.action === "ok" || /^OK$/i.test(i.text) || i.cmd === "CommitCommand");
      const cancel = ci && ci.find((i) => i.action === "cancel" || /^Cancel$/i.test(i.text) || i.cmd === "CancelCommand");
      t.check("in-command marking menu has OK at E", ok && inDirection(ok, center, "E"), ok ? `offset ${Math.round(ok.cx - center.x)},${Math.round(ok.cy - center.y)}` : "no OK item");
      t.check("in-command marking menu has Cancel at W", cancel && inDirection(cancel, center, "W"), cancel ? `offset ${Math.round(cancel.cx - center.x)},${Math.round(cancel.cy - center.y)}` : "no Cancel item");
      if (cancel) {
        await t.page.mouse.click(cancel.cx, cancel.cy);
        await t.settle(300);
        t.check("Cancel from the marking menu closes the dialog", !(await t.visible('.dlg[data-dialog="Extrude"]')));
      }
      await t.escapeAll();
    }

    t.step("inside a sketch: same 8 buttons (FusionSketchEnvironment), sketch overflow Remove | Show All | Unisolate");
    const skId = await t.app(() => {
      const { S, K } = window.app;
      const sk = S.newSketch();
      S.addRect2pt(sk, [-15, -10], [15, 10]);
      const f = window.app.addFeature({ type: "sketch", plane: K.ORIGIN_PLANES.XY, planeRef: { kind: "origin", name: "XY" }, sk });
      return f.id;
    });
    await t.app((id) => window.app.ui.sketch && window.app.ui.sketch.edit(id), skId);
    await t.settle(600);
    t.require("entered the sketch for the sketch marking-menu test", (await t.app(() => window.app.mode)) === "sketch");
    await t.app(() => window.app.selection.clear());
    const sc = await t.mouseToCanvas(0.3, 0.75);
    const skMenu = async () => {
      await t.page.mouse.click(sc.x, sc.y, { button: "right" });
      await t.waitFor(".mm-root", { timeout: 1500 });
      return t.app(() => {
        const r = document.querySelector(".mm-root");
        const rows = [...r.querySelectorAll(".mm-overflow .mn-mi")].map((e) => ({ mm: e.dataset.mm || "", cmd: e.dataset.cmd || "", text: e.querySelector(".mn-mi-label")?.textContent || "" }));
        const wedges = [...r.querySelectorAll(".mm-item")].map((e) => e.dataset.cmd || e.dataset.mm || e.dataset.action);
        return { rows, wedges };
      });
    };
    const m1 = await skMenu();
    await t.shot("sketch-overflow");
    t.check("sketch marking menu keeps Fusion's 8 buttons (Press Pull NE, Hole SE, Sketch tier S)", ["FusionPressPullCommand", "FusionHoleCommand", "sketch-submenu", "RepeatCommand"].every((x) => m1.wedges.includes(x)), m1.wedges.join(","));
    // Fusion 2706 (ref 11): with nothing selected the sketch overflow goes Remove -> Show All -> Unisolate,
    // with no Sketch Palette Show/Hide Profile / Dimension / Projected / Construction rows in between.
    const texts = m1.rows.map((r) => r.text);
    const iRemove = texts.indexOf("Remove"), iShowAll = texts.indexOf("Show All"), iUnisolate = texts.indexOf("Unisolate");
    t.check("sketch overflow goes straight from Remove to Show All, then Unisolate (no Hide Profile / Dimension / … rows)",
      iRemove >= 0 && iShowAll === iRemove + 1 && iUnisolate === iShowAll + 1 && !texts.some((x) => /^(Show|Hide) (Profile|Dimension|Projected|Construction)/.test(x)),
      texts.join(" | "));
    t.check("sketch overflow has no model-only commands (Create Sketch, Extrude, Fillet, Edit Feature)", !m1.rows.some((r) => ["SketchCreate", "FusionFilletEdgesCommand", "FusionEditFeatureCommand", "SketchActivate"].includes(r.cmd)), m1.rows.map((r) => r.cmd || r.mm).join(","));
    await t.escapeAll(1);
    await t.settle(150);
    const m3 = await skMenu();
    const skSub = await t.app(() => { const n = document.querySelector('.mm-root .mm-item[data-mm="sketch-submenu"]'); const r = n && n.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; });
    if (skSub) {
      await t.page.mouse.move(skSub.x, skSub.y, { steps: 6 });
      await t.settle(400);
      const fin = await t.app(() => { const n = document.querySelector('.mm-root .mm-item[data-cmd="SketchStop"]'); return n ? { enabled: !n.classList.contains("mm-disabled"), text: n.innerText.trim() } : null; });
      t.check("Sketch tier N offers an enabled Finish Sketch inside the sketch", !!fin && fin.enabled && /Finish Sketch/.test(fin.text), JSON.stringify(fin));
    } else t.check("Sketch tier available in the sketch marking menu", false, m3.wedges.join(","));
    await t.escapeAll();
    await t.app(() => window.app.ui.sketch && window.app.ui.sketch.finish());
    await t.settle(300);

    t.check("browser context menu suppressed on canvas (contextmenu default prevented)", await t.app(() => {
      const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 600, clientY: 400 });
      window.app.viewport.canvas.dispatchEvent(ev);
      const prevented = ev.defaultPrevented;
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return prevented;
    }));
    await t.escapeAll();
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
