// Browser panel: default tree (Document Settings, Named Views, Origin, Bodies, Sketches), eye toggles
// for a body (doc + canvas follow), the Origin folder (origin planes appear), and Ctrl+Alt+B / V.
import { defineScenario, mainIfDirect, apiBox } from "../lib.mjs";

async function canvasHasBody(t, bodyId) {
  return t.app((id) => {
    let vis = false;
    window.app.viewport.groups.bodies.traverse((o) => {
      if (o.userData && o.userData.body === id) {
        let p = o, on = true;
        while (p) { if (p.visible === false) on = false; p = p.parent; }
        if (on) vis = true;
      }
    });
    return vis;
  }, bodyId);
}

async function ensureNode(t, sel, parentSel) {
  if (await t.visible(sel)) return true;
  if (parentSel) {
    // expand the parent folder via its expander (or a click on the row)
    const exp = await t.app((ps) => {
      const p = document.querySelector(ps);
      if (!p) return false;
      const e = p.querySelector(".br-expand, .br-caret, .br-toggle, [data-expand], .br-arrow") || p;
      e.setAttribute("data-qa-exp", "1");
      return true;
    }, parentSel);
    if (exp) { await t.click('[data-qa-exp="1"]'); await t.app(() => document.querySelector('[data-qa-exp="1"]')?.removeAttribute("data-qa-exp")); await t.settle(200); }
  }
  return t.visible(sel);
}

const scenario = defineScenario({
  name: "browser",
  title: "Browser tree and visibility toggles",
  async run(t) {
    t.require("browser panel visible (#browser-host)", await t.visible("#browser-host [data-node]"), "no [data-node] in #browser-host");
    const head = await t.app(() => document.getElementById("browser-host").innerText);
    t.check("browser header reads BROWSER", /BROWSER/.test(head), head.slice(0, 60));

    const order = await t.app(() => {
      const kinds = ["doc", "settings", "namedviews", "origin"];
      return kinds.map((k) => { const e = [...document.querySelectorAll(`#browser-host [data-node^="${k}:"], #browser-host [data-node="${k}"]`)].find((x) => x.offsetParent); return e ? { k, y: e.getBoundingClientRect().top, text: e.innerText.split("\n")[0].trim() } : null; });
    });
    t.check("root document node present", !!order[0], "no data-node doc:*");
    t.check("Document Settings node present", !!order[1] && /Document Settings/.test(order[1].text), JSON.stringify(order[1]));
    t.check("Named Views node present", !!order[2] && /Named Views/.test(order[2].text), JSON.stringify(order[2]));
    t.check("Origin node present", !!order[3] && /Origin/.test(order[3].text), JSON.stringify(order[3]));
    const ys = order.filter(Boolean).map((o) => o.y);
    t.check("order: document, Document Settings, Named Views, Origin", ys.every((y, i) => i === 0 || y > ys[i - 1]));
    t.check("origin hidden by default in a new design", (await t.app(() => window.app.doc.origin.visible)) === false);
    await t.shot("empty-browser");

    t.step("setup: a box (App API)");
    const b = await apiBox(t);
    await t.settle(200);
    const bodySel = `#browser-host [data-node="body:${b.body}"]`;
    const has = await ensureNode(t, bodySel, '#browser-host [data-node^="bodies"]');
    t.require(`Bodies folder lists the body (${bodySel})`, has);
    const bodyText = await t.app((s) => document.querySelector(s).innerText.trim(), bodySel);
    t.check("body is named Body1", /Body1/.test(bodyText), bodyText);
    t.check("canvas shows the body", await canvasHasBody(t, b.body));
    await t.shot("body-listed");

    t.step("click the body's eye");
    t.require("body row has an eye toggle (.br-eye)", await t.click(`${bodySel} .br-eye`));
    await t.settle(200);
    t.check("doc.bodies[id].visible === false after the eye click", (await t.app((id) => window.app.doc.bodies[id].visible, b.body)) === false);
    t.check("canvas no longer draws the body", !(await canvasHasBody(t, b.body)));
    const eyeOff = await t.app((s) => { const e = document.querySelector(`${s} .br-eye`); return e ? e.className + " " + e.innerHTML.length : ""; }, bodySel);
    await t.shot("body-hidden");
    t.step("click it again");
    await t.click(`${bodySel} .br-eye`);
    await t.settle(200);
    t.check("visible again after the second click", (await t.app((id) => window.app.doc.bodies[id].visible, b.body)) !== false && (await canvasHasBody(t, b.body)));
    const eyeOn = await t.app((s) => { const e = document.querySelector(`${s} .br-eye`); return e ? e.className + " " + e.innerHTML.length : ""; }, bodySel);
    t.check("eye icon changes between visible and hidden", eyeOn !== eyeOff, `same eye markup: ${eyeOn}`);
    t.check("hide/show is undoable (Ctrl+Z restores hidden)", await (async () => { await t.blur(); await t.key("Control+z"); await t.settle(200); return (await t.app((id) => window.app.doc.bodies[id].visible, b.body)) === false; })());
    await t.key("Control+y");

    t.step("Origin eye shows the origin planes");
    const originSel = '#browser-host [data-node^="origin"]';
    await t.click(`${originSel} .br-eye`);
    await t.settle(200);
    t.check("doc.origin.visible true after clicking the Origin eye", (await t.app(() => window.app.doc.origin.visible)) === true);
    const originDrawn = await t.app(() => { let n = 0; window.app.viewport.groups.origin.traverse((o) => { let p = o, on = true; while (p) { if (p.visible === false) on = false; p = p.parent; } if (on && (o.isMesh || o.isLine)) n++; }); return n; });
    t.check("origin planes/axes drawn in the canvas", originDrawn > 0, `drawn=${originDrawn}`);
    await t.shot("origin-shown");
    await t.click(`${originSel} .br-eye`);

    t.step("select body in the browser selects it in the canvas");
    await t.click(bodySel);
    await t.settle(150);
    const selK = await t.app(() => window.app.selection.items.map((r) => `${r.kind}:${r.body || r.id || ""}`));
    t.check("clicking the body row selects the body", selK.some((k) => k.startsWith("body:")), JSON.stringify(selK));

    t.step("right-click the body row: context mark only, no canvas highlight (Fusion ref 27)");
    await t.app(() => window.app.selection.clear());
    await t.hover(`${bodySel} .br-label`);
    await t.settle(100);
    const hovered = await t.app(() => window.app.selection.hover && window.app.selection.hover.kind);
    await t.click(`${bodySel} .br-label`, { button: "right" });
    await t.settle(200);
    const rc = await t.app((s) => ({ menu: (document.querySelector(".br-ctx")?.getBoundingClientRect().height || 0) > 0, ctx: document.querySelector(s).classList.contains("ctx"), hover: window.app.selection.hover, sel: window.app.selection.items.length, status: window.app.status }), bodySel);
    t.check("row hover pre-highlights the body", hovered === "body", `hover=${hovered}`);
    t.check("right-click opens the menu and marks the row", rc.menu && rc.ctx, JSON.stringify(rc));
    t.check("right-click neither selects nor highlights the body in the canvas", rc.sel === 0 && !rc.hover, JSON.stringify(rc));
    t.check("status bar names the right-clicked body", /Body1/.test(rc.status || ""), JSON.stringify(rc.status));
    await t.escapeAll();
    await t.click(bodySel);
    await t.settle(100);

    t.step("V toggles visibility of the selection");
    await t.blur();
    await t.mouseToCanvas(0.6, 0.6);
    await t.key("v");
    await t.settle(200);
    t.check("V hides the selected body", (await t.app((id) => window.app.doc.bodies[id].visible, b.body)) === false);
    await t.key("v");

    t.step("Ctrl+Alt+B hides/shows the browser");
    await t.key("Control+Alt+b");
    await t.settle(200);
    const hidden = !(await t.visible("#browser-host [data-node]"));
    t.check("Ctrl+Alt+B hides the browser", hidden);
    await t.key("Control+Alt+b");
    await t.settle(200);
    t.check("Ctrl+Alt+B shows it again", await t.visible("#browser-host [data-node]"));

    t.step("rename by double-click");
    const nameEl = await t.app((s) => { const r = document.querySelector(s); const n = r && (r.querySelector(".br-name, .br-label") || r); n.setAttribute("data-qa-name", "1"); return true; }, bodySel);
    if (nameEl) {
      await t.dblclick('[data-qa-name="1"]');
      await t.settle(200);
      const editing = await t.visible("#browser-host input");
      t.check("double-clicking a body name starts inline rename", editing);
      if (editing) {
        await t.page.keyboard.press("Control+A");
        await t.type("Plate");
        await t.key("Enter");
        await t.settle(200);
        t.check("body renamed to Plate", (await t.app((id) => window.app.doc.bodies[id].name, b.body)) === "Plate");
      }
    }
    await t.shot("final");
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
