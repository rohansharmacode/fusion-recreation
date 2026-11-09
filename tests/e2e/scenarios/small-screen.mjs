// Small laptop window (1280x720, then 1024x640): people will open the shared link on ordinary laptops.
// Toolbar, browser, timeline, ViewCube and nav bar must stay usable, long dropdowns must be reachable,
// and a command dialog's OK button must stay on screen.
import { defineScenario, mainIfDirect, apiBox } from "../lib.mjs";

async function layoutAt(t, w, h) {
  await t.page.setViewportSize({ width: w, height: h });
  await t.settle(400);
  await t.frames(3);
  return t.app(({ w, h }) => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
    const onScreen = (b) => !!b && b.w > 0 && b.h > 0 && b.x >= -1 && b.y >= -1 && b.r <= w + 1 && b.b <= h + 1;
    const tb = document.getElementById("toolbar");
    const lastBtn = [...document.querySelectorAll("#toolbar [data-cmd], #toolbar [data-panel]")].filter((e) => e.offsetParent).pop();
    return {
      docOverflowX: document.documentElement.scrollWidth > w + 1,
      docOverflowY: document.documentElement.scrollHeight > h + 1,
      toolbarH: tb ? tb.getBoundingClientRect().height : 0,
      lastToolbar: r(lastBtn ? `[data-cmd="${lastBtn.getAttribute("data-cmd")}"], [data-panel="${lastBtn.getAttribute("data-panel")}"]` : "#nonexistent"),
      viewcube: onScreen(r("#viewcube-host canvas")),
      navbar: onScreen(r("#navbar-host")),
      timeline: onScreen(r("#timeline")),
      browser: onScreen(r("#browser-host")),
      canvas: r("#canvas-host canvas"),
      w, h,
    };
  }, { w, h });
}

const scenario = defineScenario({
  name: "small-screen",
  title: "Usable at 1280x720 and 1024x640",
  async run(t) {
    await apiBox(t);
    for (const [w, h] of [[1280, 720], [1024, 640]]) {
      t.step(`layout at ${w}x${h}`);
      const L = await layoutAt(t, w, h);
      await t.shot(`layout-${w}x${h}`);
      t.check(`${w}x${h}: page does not scroll (no document overflow)`, !L.docOverflowX && !L.docOverflowY, JSON.stringify({ x: L.docOverflowX, y: L.docOverflowY }));
      t.check(`${w}x${h}: canvas keeps most of the window`, L.canvas && L.canvas.w >= w * 0.9 && L.canvas.h >= h * 0.6, JSON.stringify(L.canvas));
      t.check(`${w}x${h}: ViewCube, nav bar, timeline and browser are on screen`, L.viewcube && L.navbar && L.timeline && L.browser, JSON.stringify({ vc: L.viewcube, nav: L.navbar, tl: L.timeline, br: L.browser }));
      t.check(`${w}x${h}: last toolbar control (SELECT) still reachable`, L.lastToolbar && L.lastToolbar.r <= w + 1, JSON.stringify(L.lastToolbar));
      t.check(`${w}x${h}: toolbar does not wrap to extra rows`, L.toolbarH <= 110, `toolbar height ${L.toolbarH}`);

      t.step(`${w}x${h}: MODIFY dropdown`);
      await t.click('#toolbar [data-panel="SolidModifyPanel"]');
      await t.settle(250);
      const m = await t.app(({ w, h }) => {
        const items = [...document.querySelectorAll("#overlay [data-cmd]")].filter((e) => e.offsetParent);
        if (!items.length) return null;
        const last = items[items.length - 1];
        let p = last.parentElement, scrollable = false;
        while (p && p !== document.body) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) { scrollable = true; break; } p = p.parentElement; }
        const b = last.getBoundingClientRect();
        const menu = last.closest('[role="menu"], .sh-menu') || last.parentElement;
        const mb = menu.getBoundingClientRect();
        return { last: last.getAttribute("data-cmd"), lastBottom: b.bottom, menuBottom: mb.bottom, scrollable, h };
      }, { w, h });
      t.check(`${w}x${h}: the whole MODIFY dropdown is reachable (fits, or scrolls)`, m && (m.lastBottom <= h || m.scrollable), JSON.stringify(m));
      t.check(`${w}x${h}: the dropdown does not run off the bottom of the window`, m && m.menuBottom <= h + 1, JSON.stringify(m));
      await t.shot(`modify-${w}x${h}`);
      await t.escapeAll();

      t.step(`${w}x${h}: Extrude dialog`);
      await t.blur();
      await t.mouseToCanvas(0.5, 0.8);
      await t.key("e");
      if (await t.waitFor('.dlg[data-dialog="Extrude"]', { timeout: 2500 })) {
        const d = await t.app(({ w, h }) => {
          const dl = document.querySelector('.dlg[data-dialog="Extrude"]');
          const ok = dl.querySelector('[data-action="ok"]');
          const b = ok.getBoundingClientRect(), db = dl.getBoundingClientRect();
          const vc = document.querySelector("#viewcube-host canvas")?.getBoundingClientRect();
          const overlapVC = vc ? !(db.right < vc.left || db.left > vc.right || db.bottom < vc.top || db.top > vc.bottom) : false;
          return { okBottom: b.bottom, okRight: b.right, dlgTop: db.top, overlapVC, h, w };
        }, { w, h });
        t.check(`${w}x${h}: dialog OK button is on screen`, d.okBottom <= h && d.okRight <= w, JSON.stringify(d));
        t.check(`${w}x${h}: dialog does not cover the ViewCube`, !d.overlapVC, JSON.stringify(d));
        await t.shot(`extrude-${w}x${h}`);
        await t.key("Escape");
      } else t.check(`${w}x${h}: Extrude dialog opens`, false);
    }
    await t.page.setViewportSize({ width: 1600, height: 900 });
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
