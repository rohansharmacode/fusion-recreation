// Robustness sweep: click every toolbar button and every SOLID dropdown item, press every letter
// shortcut, each followed by Esc. Nothing may throw, and Esc must always return to a clean state
// (no open dialog, no active tool, model mode, no preview left behind).
import { defineScenario, mainIfDirect, apiBox } from "../lib.mjs";

const clean = (t, base) => t.app((base) => {
  const a = window.app;
  const dlg = [...document.querySelectorAll(".dlg[data-dialog]")].filter((e) => e.offsetParent).map((e) => e.getAttribute("data-dialog"));
  const modal = [...document.querySelectorAll('.mn-modal, [role="dialog"]')].filter((e) => e.offsetParent).length;
  const top = a.input.top();
  const stackNames = a.input.stack.map((h) => h.name || "?").join(",");
  return { ok: !a.activeCommand && !dlg.length && !modal && a.mode === "model" && !a.previewing && stackNames === base, cmd: a.activeCommand && a.activeCommand.id, dlg, modal, mode: a.mode, previewing: a.previewing, stack: stackNames, top: top && top.name };
}, base);

async function reset(t) {
  for (let i = 0; i < 3; i++) { await t.page.keyboard.press("Escape"); await t.frames(1); }
  // a sketch entered by a command (e.g. a sketch tool picked a plane) is left with Finish Sketch
  if (await t.app(() => window.app.mode === "sketch")) { await t.app(() => window.app.commands.run("SketchStop")); await t.frames(2); }
  // a contextual environment entered by a command (Form, Flat Pattern, ...) is left with its FINISH command:
  // Esc never leaves an environment in Fusion
  for (let i = 0; i < 3; i++) {
    const fin = await t.app(() => { const e = window.app.environment; return e ? e.finishCommand || e.id : null; });
    if (!fin) break;
    await t.app((f) => { const a = window.app; const e = a.environment; if (e.finishCommand && a.commands.get(f)) a.commands.run(f); else a.exitEnvironment(e.id, { reason: "finish" }); }, fin);
    await t.frames(2);
    await t.page.keyboard.press("Escape");
  }
}

const scenario = defineScenario({
  name: "robustness",
  title: "Every toolbar button / dropdown item / letter key, then Esc",
  timeout: 300000,
  async run(t) {
    await apiBox(t);
    await t.setView("home");
    const dirty = [], errs = [];
    const base = await t.app(() => window.app.input.stack.map((h) => h.name || "?").join(","));
    t.note(`base input stack: ${base}`);
    const probe = async (label, action) => {
      const e0 = t.h.errors.length;
      try { await action(); } catch (e) { errs.push(`${label}: ${String(e.message || e).slice(0, 120)}`); }
      await t.settle(120);
      await reset(t);
      await t.settle(60);
      const st = await clean(t, base);
      if (!st.ok) { dirty.push(`${label}: ${JSON.stringify(st)}`); await t.app(() => { try { window.app.activeCommand && window.app.activeCommand.cancel(); } catch { /* ignore */ } }); await reset(t); }
      if (t.h.errors.length > e0) errs.push(`${label}: ${t.h.errors.slice(e0).map((x) => x.split("\n")[0]).join(" | ").slice(0, 200)}`);
    };

    t.step("every visible toolbar button on every tab");
    const tabs = await t.app(() => [...document.querySelectorAll("[data-tab]")].filter((e) => e.offsetParent).map((e) => e.getAttribute("data-tab")));
    let nButtons = 0;
    for (const tab of tabs) {
      if (tab === "SketchTab") continue;
      await t.click(`[data-tab="${tab}"]`);
      await t.settle(120);
      const ids = await t.app(() => [...new Set([...document.querySelectorAll("#toolbar [data-cmd]")].filter((e) => e.offsetParent).map((e) => e.getAttribute("data-cmd")))]);
      for (const id of ids) {
        nButtons++;
        await probe(`${tab}/${id}`, async () => {
          const sel = `#toolbar [data-cmd="${id}"]`;
          if (!(await t.visible(sel))) await t.click(`[data-tab="${tab}"]`, { timeout: 800 });
          await t.click(sel, { timeout: 800 });
        });
      }
    }
    await t.click('[data-tab="SolidTab"]');
    t.note(`clicked ${nButtons} toolbar buttons across ${tabs.length} tabs`);

    t.step("every SOLID dropdown item");
    const panels = await t.app(() => [...document.querySelectorAll("#toolbar [data-panel]")].filter((e) => e.offsetParent).map((e) => e.getAttribute("data-panel")));
    let nItems = 0;
    for (const p of panels) {
      await t.click(`#toolbar [data-panel="${p}"]`);
      await t.settle(150);
      const items = await t.app(() => [...new Set([...document.querySelectorAll("#overlay [data-cmd]")].filter((e) => e.offsetParent && e.getAttribute("aria-disabled") !== "true").map((e) => e.getAttribute("data-cmd")))]);
      await reset(t);
      for (const id of items) {
        nItems++;
        await probe(`${p}/${id}`, async () => {
          await t.click(`#toolbar [data-panel="${p}"]`, { timeout: 800 });
          await t.settle(80);
          if (!(await t.click(`#overlay [data-cmd="${id}"]`, { timeout: 600 }))) {
            // nested in a submenu: hover the parent rows until it shows
            await t.app((id) => { const el = document.querySelector(`#overlay [data-cmd="${id}"]`); el && el.click(); }, id);
          }
        });
      }
    }
    t.note(`ran ${nItems} dropdown items from ${panels.length} SOLID panels`);

    t.step("every letter key in the model environment");
    for (const k of "abcdefghijklmnopqrstuvwxyz") {
      await t.blur();
      await t.mouseToCanvas(0.62, 0.62);
      await probe(`key ${k.toUpperCase()}`, async () => { await t.page.keyboard.press(k); });
    }

    t.step("model still intact");
    const s = await t.state();
    t.check("the box survived the sweep (1 body, features OK)", s.bodies.length >= 1 && s.features.every((f) => f.ok !== false), JSON.stringify({ bodies: s.bodies.length, features: s.features.map((f) => [f.type, f.ok]) }));
    t.check("no exceptions/console errors during the sweep", errs.length === 0, `${errs.length}: ${errs.slice(0, 6).join(" || ")}`);
    t.check("Esc always returns to a clean state (no dialog/tool/preview left, model mode)", dirty.length === 0, `${dirty.length}: ${dirty.slice(0, 6).join(" || ")}`);
    await t.shot("after-sweep");
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
