// Look & feel against docs/fidelity-checklist.md: theme tokens, canvas background, body colour,
// edge lines, hover vs selection tint (sampled from real screenshots), command dialog styling.
import { defineScenario, mainIfDirect, apiBox } from "../lib.mjs";

const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const sat = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
const hex = (c) => "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
const diff = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

const scenario = defineScenario({
  name: "look",
  title: "Theme, canvas, body, hover/selection colours, dialog styling",
  async run(t) {
    t.step("theme tokens and fonts");
    const css = await t.app(() => {
      const cs = getComputedStyle(document.documentElement);
      const bs = getComputedStyle(document.body);
      const tb = document.getElementById("toolbar");
      const ab = document.getElementById("appbar");
      const firstEl = (e) => { let x = e; while (x && getComputedStyle(x).backgroundColor === "rgba(0, 0, 0, 0)" && x.firstElementChild) x = x.firstElementChild; return x; };
      return {
        accent: cs.getPropertyValue("--c-accent").trim().toLowerCase(),
        font: bs.fontFamily,
        fontSize: bs.fontSize,
        toolbarBg: tb ? getComputedStyle(firstEl(tb)).backgroundColor : "",
        appbarBg: ab ? getComputedStyle(firstEl(ab)).backgroundColor : "",
      };
    });
    const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    t.check("accent colour is Autodesk blue #0696d7", css.accent === "#0696d7", css.accent);
    t.check("UI font is Artifakt Element / Segoe UI fallback", /Artifakt|Segoe/i.test(css.font), css.font);
    t.check("base UI font size 11–13 px", /^1[123](\.\d+)?px$/.test(css.fontSize), css.fontSize);
    const tbc = rgb(css.toolbarBg), abc = rgb(css.appbarBg);
    t.check("toolbar background is white/very light (HIG #FFFFFF or #EFEFEF)", tbc.length === 3 && luma(tbc) >= 225 && sat(tbc) < 12, css.toolbarBg);
    t.check("application bar is light grey (#EFEFEF–#E1E1E1 range)", abc.length === 3 && luma(abc) >= 205 && luma(abc) <= 250 && sat(abc) < 12, css.appbarBg);

    t.step("canvas background");
    const cv = await t.app(() => { const r = window.app.viewport.canvas.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const sample = async (fx, fy) => {
      // brightest pixel of a 15x15 patch (skips grid lines)
      const img = await t.pixels(cv.x + cv.w * fx - 7, cv.y + cv.h * fy - 7, 15, 15);
      let best = [0, 0, 0];
      for (let j = 0; j < img.h; j++) for (let i = 0; i < img.w; i++) { const p = img.px(i, j); if (luma(p) > luma(best)) best = p; }
      return best;
    };
    const top = await sample(0.55, 0.06), bottom = await sample(0.7, 0.86);
    t.note(`canvas top ${hex(top)} bottom ${hex(bottom)}`);
    t.check("canvas top is near-white (Photo Booth background RGB 1,1,1)", luma(top) >= 238, hex(top));
    t.check("canvas is a light neutral/blue-grey (not saturated)", sat(top) <= 14 && sat(bottom) <= 24, `${hex(top)} / ${hex(bottom)}`);
    t.check("canvas bottom is the same or slightly darker (subtle vertical gradient)", luma(bottom) <= luma(top) + 2 && luma(bottom) >= 190, `${hex(top)} -> ${hex(bottom)}`);
    await t.shot("empty-canvas");

    t.step("body colour, edges, hover and selection tints");
    await apiBox(t, { L: "60 mm", W: "40 mm", H: "20 mm" });
    await t.setView("home");
    await t.app(() => window.app.viewport.fit && window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);
    await t.page.mouse.move(cv.x + 30, cv.y + cv.h - 30);
    await t.frames(4);
    const aim = await t.aim([[5, 3, 20], [0, 0, 20], [10, 8, 20], [-8, 6, 20]], "h && h.ref && h.ref.kind === 'face' && Math.abs(h.ref.n[2] - 1) < 1e-3");
    t.require("top face found on screen", !!aim);
    const base = await t.colorAt(aim.x, aim.y, 2);
    t.note(`top face unhovered ${hex(base)}`);
    t.check("default body appearance is light neutral grey (Steel - Satin)", sat(base) <= 25 && luma(base) >= 120 && luma(base) <= 240, hex(base));
    // Fusion's default visual style is Shaded (reference capture: Display Settings > Visual Style
    // shows "Shaded" selected): no edge lines. Shaded with Visible Edges Only (Ctrl+6) adds black edges.
    t.check("default visual style is Shaded", (await t.app(() => window.app.viewport.visualStyle)) === "ViewShadedCommand");
    await t.app(() => { try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.app.viewport.canvas.focus(); } catch { /* ignore */ } });
    await t.key("Control+6");
    await t.frames(4);
    const edge = await t.canvasXY([0, -20, 20]);
    const eimg = await t.pixels(edge.x - 3, edge.y - 3, 7, 7);
    let dark = 255;
    for (let j = 0; j < eimg.h; j++) for (let i = 0; i < eimg.w; i++) dark = Math.min(dark, luma(eimg.px(i, j)));
    t.check("Ctrl+6 (Shaded with Visible Edges Only) draws dark edge lines (ModelEdgeColor black)", dark <= 100, `darkest luma near edge ${Math.round(dark)}`);
    await t.shot("body");
    await t.key("Control+4");
    await t.frames(4);
    t.check("Ctrl+4 returns to Shaded", (await t.app(() => window.app.viewport.visualStyle)) === "ViewShadedCommand");

    await t.page.mouse.move(aim.x - 4, aim.y - 3);
    await t.page.mouse.move(aim.x, aim.y, { steps: 3 });
    await t.frames(4);
    await t.settle(120);
    const hov = await t.colorAt(aim.x + 12, aim.y + 6, 2);
    t.note(`top face hovered ${hex(hov)}`);
    t.check("hovering a face visibly pre-highlights it", diff(hov, base) >= 8, `${hex(base)} -> ${hex(hov)}`);
    await t.shot("hover");
    await t.page.mouse.click(aim.x, aim.y);
    await t.page.mouse.move(cv.x + 30, cv.y + cv.h - 30, { steps: 3 });
    await t.frames(4);
    await t.settle(120);
    const sel = await t.colorAt(aim.x, aim.y, 2);
    t.note(`top face selected ${hex(sel)}`);
    t.check("selected face is tinted blue (SelectEffect base 0,0.4,1 @50%)", sel[2] - sel[0] >= 25 && sel[2] >= sel[1], hex(sel));
    t.check("selection tint differs from hover tint", diff(sel, hov) >= 10, `${hex(hov)} vs ${hex(sel)}`);
    await t.shot("selected");
    await t.key("Escape");

    t.step("command dialog styling (Extrude)");
    await t.blur();
    await t.mouseToCanvas(0.5, 0.8);
    await t.key("e");
    if (await t.waitFor('.dlg[data-dialog="Extrude"]', { timeout: 2000 })) {
      const d = await t.app(() => {
        const dlg = document.querySelector('.dlg[data-dialog="Extrude"]');
        const r = dlg.getBoundingClientRect();
        const ok = dlg.querySelector('[data-action="ok"]'), ca = dlg.querySelector('[data-action="cancel"]');
        const head = [...dlg.querySelectorAll("*")].find((e) => e.children.length === 0 && /extrude/i.test(e.textContent || ""));
        return {
          x: r.left, w: r.width, top: r.top,
          headText: head ? head.textContent.trim() : "",
          headTransform: head ? getComputedStyle(head).textTransform : "",
          okBg: ok ? getComputedStyle(ok).backgroundColor : "", caBg: ca ? getComputedStyle(ca).backgroundColor : "",
          okRight: ok && ca ? ok.getBoundingClientRect().left > ca.getBoundingClientRect().left : null,
        };
      });
      t.check("dialog floats on the right side of the canvas", d.x > 1600 * 0.55, `x=${Math.round(d.x)}`);
      // Fusion 2706 (ref 13): the docked Extrude panel is ~237 px wide
      t.check("dialog width ~225–260 px (docked Extrude panel)", d.w >= 225 && d.w <= 260, `w=${Math.round(d.w)}`);
      t.check("dialog title shown in uppercase (EXTRUDE)", d.headText === "EXTRUDE" || d.headTransform === "uppercase", `${d.headText} / ${d.headTransform}`);
      const okc = rgb(d.okBg);
      // Fusion 2706 light theme (refs 13/14/18): OK and Cancel are white buttons with a thin grey frame
      t.check("OK is a white framed button like Fusion's light theme (refs 13/14)", okc.length === 3 && Math.min(...okc) >= 240, d.okBg);
      // Classic Fusion dialogs read [OK] [Cancel]; the 2706 QML footer lays out right-to-left (OK rightmost). Either is acceptable.
      t.note(`OK is ${d.okRight ? "right" : "left"} of Cancel`);
      await t.shot("extrude-dialog");
      await t.key("Escape");
    } else t.check("Extrude dialog opened for styling checks", false);
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
