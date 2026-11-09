// Save / Open roundtrip through the UI: Ctrl+S names and saves the design, the page is reloaded,
// File > Open (Ctrl+O) lists it and opening restores the identical timeline and geometry.
import { defineScenario, mainIfDirect, apiBox, near, fmt } from "../lib.mjs";

const NAME = "QA Roundtrip";

async function submitNameDialog(t, name) {
  // find a visible text input in a dialog/overlay that appeared for saving
  const sel = '#overlay input[type="text"], #overlay input:not([type]), #dialog-host input[type="text"], .dlg input[type="text"], [role="dialog"] input';
  const ok = await t.waitFor(sel, { timeout: 1500 });
  if (!ok) return false;
  await t.fill(sel, name, { commit: false });
  await t.settle(100);
  // prefer an explicit Save/OK button, else Enter
  const btn = await t.app(() => {
    const cands = [...document.querySelectorAll('#overlay button, #overlay [data-action], #dialog-host button, [role="dialog"] button')].filter((b) => b.offsetParent);
    const b = cands.find((b) => b.getAttribute("data-action") === "ok" || /^(save|ok)$/i.test((b.innerText || "").trim()));
    if (b) { b.setAttribute("data-qa-target", "1"); return true; }
    return false;
  });
  if (btn) await t.click('[data-qa-target="1"]');
  else await t.key("Enter");
  await t.app(() => document.querySelector('[data-qa-target="1"]')?.removeAttribute("data-qa-target"));
  return true;
}

const scenario = defineScenario({
  name: "save-open",
  title: "Save, reload, Open roundtrip",
  async run(t) {
    t.step("model something (setup through the App API)");
    await apiBox(t);
    await t.app(() => window.app.addFeature({ type: "cylinder", diameter: "10 mm", height: "25 mm", center: [0, 0], operation: "join", plane: { kind: "origin", name: "XY" } }));
    const before = await t.state();
    t.require("setup computed", before.features.length === 2 && before.features.every((f) => f.ok), JSON.stringify(before.features));

    t.step("File menu contents");
    const fileBtn = await t.app(() => {
      const c = [...document.querySelectorAll("#appbar [data-cmd], #appbar button, #appbar [role=button]")].filter((e) => e.offsetParent);
      const f = document.querySelector('#appbar [data-menu="file"]')
        || c.find((e) => /^file$/i.test((e.getAttribute("aria-label") || e.title || e.innerText || "").trim()))
        || c.find((e) => /^(FileMenu|FileSubMenuCommand)$/.test(e.getAttribute("data-cmd") || ""));
      if (f) { f.setAttribute("data-qa-file", "1"); return true; }
      return null;
    });
    t.check("application bar has a File menu button", !!fileBtn, "no File button in #appbar");
    if (fileBtn) {
      await t.click('[data-qa-file="1"]');
      await t.settle(250);
      await t.shot("file-menu");
      const items = await t.app(() => ["FileNew", "FileOpen", "FileSave", "FileSaveAs", "FileExport"].map((id) => [...document.querySelectorAll(`#overlay [data-cmd="${id}"]`)].some((e) => e.offsetParent)));
      t.check("File menu lists New Design, Open, Save, Save As, Export", items.every(Boolean), JSON.stringify(items));
      await t.escapeAll();
    }

    t.step("Ctrl+S");
    await t.blur();
    await t.mouseToCanvas(0.5, 0.5);
    await t.key("Control+s");
    await t.settle(300);
    await t.shot("save-dialog");
    const named = await submitNameDialog(t, NAME);
    t.check("saving an untitled design asks for a name", named, "no name input appeared after Ctrl+S");
    await t.settle(400);
    const after = await t.app(() => ({ name: window.app.doc.name, dirty: window.app.dirty, tab: document.getElementById("appbar")?.innerText || "" }));
    t.check(`design is named "${NAME}" after saving`, after.name === NAME || after.tab.includes(NAME), JSON.stringify({ name: after.name }));
    t.check("document tab in the application bar shows the name", after.tab.includes(NAME), after.tab.replace(/\s+/g, " ").slice(0, 120));
    t.check("dirty flag cleared after save", after.dirty === false, `dirty=${after.dirty}`);
    const stored = await t.app(() => { try { return Object.keys(localStorage).length; } catch { return -1; } });
    t.check("something was written to localStorage", stored > 0, `localStorage keys=${stored}`);
    await t.shot("saved");

    t.step("Ctrl+Z / Ctrl+Y after saving mark the design modified");
    await t.blur();
    await t.mouseToCanvas(0.5, 0.5);
    await t.key("Control+z");
    await t.settle(300);
    const undone = await t.app(() => ({ n: window.app.doc.features.length, dirty: window.app.dirty, title: document.title }));
    t.check("undo after save sets the dirty flag and the title asterisk", undone.n === 1 && undone.dirty === true && /\*/.test(undone.title), JSON.stringify(undone));
    await t.key("Control+y");
    await t.settle(300);
    const redone = await t.app(() => ({ n: window.app.doc.features.length, dirty: window.app.dirty, title: document.title }));
    t.check("redo keeps the design modified", redone.n === 2 && redone.dirty === true && /\*/.test(redone.title), JSON.stringify(redone));
    await t.key("Control+s"); // already named: saves in place without a dialog
    await t.settle(400);
    const resaved = await t.app(() => ({ dirty: window.app.dirty, dlg: !!document.querySelector('#overlay input[type="text"]')?.offsetParent }));
    t.check("Ctrl+S on a named design saves in place and clears the flag", resaved.dirty === false && !resaved.dlg, JSON.stringify(resaved));

    t.step("reload the page");
    await t.page.reload();
    const ready = await t.waitFor(() => window.app && window.app.isReady, { timeout: 90000 });
    t.require("app boots again after reload", ready);
    const fresh = await t.state();
    t.check("reloaded app starts with an empty design", fresh.features.length === 0, `features=${fresh.features.length}`);

    t.step("Ctrl+O and pick the saved design");
    await t.blur();
    await t.mouseToCanvas(0.5, 0.5);
    await t.key("Control+o");
    await t.settle(400);
    await t.shot("open-dialog");
    const pick = await t.app((name) => {
      const els = [...document.querySelectorAll("#overlay *, #dialog-host *, [role=dialog] *")].filter((e) => e.offsetParent && e.children.length <= 3 && (e.innerText || "").includes(name));
      const el = els.sort((a, b) => a.innerText.length - b.innerText.length)[0];
      if (!el) return false;
      el.setAttribute("data-qa-open", "1");
      return true;
    }, NAME);
    t.check("Open dialog lists the saved design by name", pick, "no element with the design name in the overlay");
    if (pick) {
      await t.click('[data-qa-open="1"]');
      await t.settle(200);
      // an explicit Open button, if the dialog uses select-then-open
      const loaded = await t.waitFor(() => window.app.doc.features.length > 0, { timeout: 800 });
      if (!loaded) {
        await t.dblclick('[data-qa-open="1"]').catch(() => {});
        await t.settle(200);
        const stillEmpty = await t.app(() => window.app.doc.features.length === 0);
        if (stillEmpty) {
          const btn = await t.app(() => { const b = [...document.querySelectorAll('#overlay button, #overlay [data-action="ok"], [role=dialog] button')].find((b) => b.offsetParent && (b.getAttribute("data-action") === "ok" || /^open$/i.test((b.innerText || "").trim()))); if (b) { b.setAttribute("data-qa-ok", "1"); return true; } return false; });
          if (btn) await t.click('[data-qa-ok="1"]');
        }
      }
      await t.waitFor(() => window.app.doc.features.length > 0, { timeout: 4000 });
    }
    await t.settle(300);
    const back = await t.state();
    await t.shot("reopened");
    t.check("same feature list restored", JSON.stringify(back.features.map((f) => f.type)) === JSON.stringify(before.features.map((f) => f.type)), `${back.features.map((f) => f.type)} vs ${before.features.map((f) => f.type)}`);
    t.check("all reopened features compute", back.features.length > 0 && back.features.every((f) => f.ok), JSON.stringify(back.features));
    t.check("same geometry (volume) restored", near(back.volume, before.volume, 0.5), `before=${fmt(before.volume)} after=${fmt(back.volume)}`);
    t.check("design name restored", back.name === NAME, `name=${back.name}`);
    t.check("opening resets the undo history", back.undo === 0, `undo=${back.undo}`);
    t.check("no open dialog left behind", !(await t.app(() => !!document.querySelector('[data-qa-open="1"]')?.offsetParent)));

    t.step("File > New Design gives an empty untitled design");
    await t.blur();
    await t.key("Control+n");
    await t.settle(400);
    const nd = await t.state();
    t.check("Ctrl+N creates a new empty design", nd.features.length === 0, `features=${nd.features.length}`);
    await t.shot("new-design");
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
