// Change Parameters: open from MODIFY > Change Parameters, find the box height model parameter,
// type a new expression, close -> the model recomputes. Also add a user parameter and reference it.
import { defineScenario, mainIfDirect, apiBox, near, fmt } from "../lib.mjs";

/** Locate the text input that edits parameter `name` in the Change Parameters UI; tags it with data-qa-param. */
async function tagParamInput(t, name) {
  return t.app((name) => {
    document.querySelectorAll("[data-qa-param]").forEach((e) => e.removeAttribute("data-qa-param"));
    const roots = [...document.querySelectorAll('.dlg, #overlay > *, [role="dialog"]')].filter((e) => e.offsetParent);
    for (const root of roots) {
      // 1) explicit hooks: the expression cell of the parameter's row
      let inp = root.querySelector(`[data-param="${name}"] input[data-input*="expr"], [data-param="${name}"] input.pm-expr, input[data-param="${name}"], [data-input="${name}"], [data-input="expr:${name}"]`);
      if (!inp) {
        const row = root.querySelector(`[data-param="${name}"]`);
        if (row) inp = [...row.querySelectorAll("input")].find((i) => i.type !== "checkbox" && i.value !== name && /\d/.test(i.value));
      }
      // 2) a row whose text has the name as a whole word
      if (!inp) {
        const rows = [...root.querySelectorAll("tr, [role=row], .row, li, div")].filter((r) => r.offsetParent && new RegExp(`(^|\\s)${name}(\\s|$)`).test(r.innerText || "") && r.querySelector("input"));
        rows.sort((a, b) => a.innerText.length - b.innerText.length);
        if (rows[0]) {
          const ins = [...rows[0].querySelectorAll("input")].filter((i) => i.type !== "checkbox" && i.offsetParent);
          inp = ins.find((i) => /mm|deg|\d/.test(i.value) && i.value !== name) || ins[ins.length - 1];
        }
      }
      if (inp) { inp.setAttribute("data-qa-param", name); return { value: inp.value }; }
    }
    return null;
  }, name);
}

const scenario = defineScenario({
  name: "parameters",
  title: "Change Parameters edits drive the model",
  async run(t) {
    t.step("setup: a 40x20x10 box (through the App API)");
    const b = await apiBox(t);
    const params = await t.app((id) => window.app.feature(id).p, b.id);
    t.require("box got model parameters", params && params.height, JSON.stringify(params));
    const hName = params.height;
    t.note(`height parameter is ${hName}`);
    let s = await t.state();
    t.check("box volume 8000", near(s.volume, 8000, 0.5), fmt(s.volume));

    t.step("MODIFY > Change Parameters");
    let opened = false;
    for (let attempt = 0; attempt < 2 && !opened; attempt++) {
      await t.escapeAll(1);
      await t.click('#toolbar [data-panel="SolidModifyPanel"]');
      await t.waitFor('#overlay [data-cmd="ChangeParameterCommand"]', { timeout: 2000 });
      opened = await t.click('#overlay [data-cmd="ChangeParameterCommand"]');
      if (opened) opened = await t.waitFor(() => [...document.querySelectorAll('.mn-modal, .dlg, [role="dialog"], #overlay > *')].some((e) => e.offsetParent && /PARAMETERS/i.test(e.innerText || "")), { timeout: 2500 });
    }
    t.check("MODIFY dropdown > Change Parameters opens the Parameters dialog", opened);
    if (!opened) {
      await t.escapeAll();
      await t.app(() => window.app.commands.run("ChangeParameterCommand"));
      t.note("opened Change Parameters through app.commands.run");
    }
    await t.settle(400);
    await t.shot("parameters-dialog");
    // Fusion (refs 29-31) opens the tree with the component collapsed; expand it like a user (click the chevrons)
    for (let i = 0; i < 30; i++) {
      const more = await t.app(() => { const tog = document.querySelector("tr.pm-collapsed .pm-tog"); if (tog) { tog.click(); return true; } return false; });
      if (!more) break;
      await t.settle(60);
    }
    const text = await t.app(() => [...document.querySelectorAll('.dlg, #overlay > *, [role="dialog"]')].filter((e) => e.offsetParent).map((e) => e.innerText).join("\n"));
    t.check("dialog title PARAMETERS", /PARAMETERS/i.test(text), text.slice(0, 120));
    t.check("dialog has User Parameters and Model Parameters sections", /User Parameters/i.test(text) && /Model Parameters/i.test(text), text.replace(/\s+/g, " ").slice(0, 200));
    t.check("columns Parameter / Name / Unit / Expression / Value / Comments", ["Name", "Unit", "Expression", "Value"].every((c) => text.includes(c)), text.replace(/\s+/g, " ").slice(0, 200));
    t.check("model parameter rows grouped under the feature (Box1)", /Box1/.test(text), "no 'Box1' group label");

    t.step(`edit ${hName} to 25 mm`);
    const tag = await tagParamInput(t, hName);
    t.require(`an input for ${hName} is present`, !!tag, "no input found for the parameter");
    t.check(`${hName} shows its expression 10 mm`, /10/.test(tag.value), `value="${tag.value}"`);
    await t.fill(`[data-qa-param="${hName}"]`, "25 mm", { commitKey: "Tab" });
    await t.settle(400);
    s = await t.state();
    const val = await t.app((n) => { const r = document.querySelector(`[data-param="${n}"]`); return r ? r.innerText : ""; }, hName);
    // Fusion's Value column shows the number in the parameter's unit without the unit ("25.00"; ref 31)
    t.check("Value column updates to 25.00 after the cell is committed", /(^|\s)25\.00(\s|$)/.test(val), `row text: ${val.replace(/\s+/g, " ")}`);
    t.check("model updates live when the cell is committed (Fusion applies edits immediately)", near(s.volume, 20000, 1), `volume=${fmt(s.volume)}`);
    await t.shot("height-25");

    t.step("add a user parameter 'len' = 60 mm and reference it");
    const plus = await t.app(() => {
      const roots = [...document.querySelectorAll('.dlg, #overlay > *, [role="dialog"]')].filter((e) => e.offsetParent);
      for (const r of roots) {
        const b = [...r.querySelectorAll("button, [data-action], [role=button]")].find((x) => x.offsetParent && (x.getAttribute("data-action") === "add-param" || /^\+$/.test((x.innerText || "").trim()) || /add (user )?parameter/i.test(x.title || x.getAttribute("aria-label") || x.innerText || "")));
        if (b) { b.setAttribute("data-qa-plus", "1"); return true; }
      }
      return false;
    });
    t.check("a + (Add User Parameter) button exists", plus);
    if (plus) {
      await t.click('[data-qa-plus="1"]');
      await t.settle(300);
      await t.shot("add-user-param");
      // the add form is the top-most modal: Name + Expression inputs (data-input hooks), then its OK
      const filled = await t.app(() => {
        const modals = [...document.querySelectorAll('.mn-modal, .dlg, [role="dialog"]')].filter((m) => m.offsetParent);
        const top = modals[modals.length - 1];
        if (!top) return false;
        const ins = [...top.querySelectorAll("input")].filter((i) => i.offsetParent && i.type !== "checkbox" && i.type !== "search");
        const name = top.querySelector('input[data-input="name"]') || ins.find((i) => /name/i.test(i.getAttribute("data-input") || i.name || "")) || ins[0];
        const ex = top.querySelector('input[data-input="expression"], input[data-input="expr"]') || ins.find((i) => i !== name && /expr|value/i.test(i.getAttribute("data-input") || i.name || "")) || ins.find((i) => i !== name && /mm/.test(i.value));
        if (!name || !ex) return false;
        name.setAttribute("data-qa-uname", "1");
        ex.setAttribute("data-qa-uexpr", "1");
        const ok = top.querySelector('[data-action="ok"]') || [...top.querySelectorAll("button")].find((b) => /^ok$/i.test(b.innerText.trim()));
        if (ok) ok.setAttribute("data-qa-uok", "1");
        return true;
      });
      t.check("Add User Parameter form has Name and Expression inputs", filled);
      if (filled) {
        await t.fill('[data-qa-uname="1"]', "len");
        await t.fill('[data-qa-uexpr="1"]', "60 mm");
        if (!(await t.click('[data-qa-uok="1"]', { timeout: 500 }))) await t.key("Enter");
        await t.settle(300);
      }
      const up = await t.app(() => window.app.doc.params.map((p) => `${p.name}=${p.expr}`));
      t.check("user parameter 'len' = 60 mm stored in doc.params", up.some((x) => /^len=60\s*mm$/.test(x)), JSON.stringify(up));
    }
    const lName = params.length;
    const tagL = await tagParamInput(t, lName);
    t.check(`input for ${lName} found`, !!tagL);
    if (tagL) {
      await t.fill(`[data-qa-param="${lName}"]`, "len", { commitKey: "Tab" });
      await t.settle(400);
    }
    await t.shot("after-user-param");

    t.step("bad expression is flagged, not applied");
    const tagH = await tagParamInput(t, hName);
    if (tagH) {
      await t.fill(`[data-qa-param="${hName}"]`, "nosuchparam * 2", { commitKey: "Tab" });
      await t.settle(300);
      const st = await t.state();
      t.check("invalid expression leaves the model computed (no feature errors)", st.features.every((f) => f.ok) && st.bodies.length === 1, JSON.stringify(st.features));
      const flagged = await t.app((n) => { const r = document.querySelector(`[data-param="${n}"]`); const i = document.querySelector(`[data-qa-param="${n}"]`); return !!((r && /err|invalid/.test(r.className)) || (i && /err|invalid/.test(i.className))); }, hName);
      t.check("invalid expression is highlighted in the table", flagged);
      await t.shot("bad-expression");
      if (await tagParamInput(t, hName)) await t.fill(`[data-qa-param="${hName}"]`, "25 mm", { commitKey: "Tab" });
    }

    t.step("OK closes and keeps the edits");
    const okTagged = await t.app(() => {
      const d = [...document.querySelectorAll('.mn-modal, .dlg, [role="dialog"]')].filter((e) => e.offsetParent && /PARAMETERS/i.test(e.innerText)).pop();
      const b = d && (d.querySelector('[data-action="ok"]') || [...d.querySelectorAll("button")].find((x) => /^ok$/i.test(x.innerText.trim())));
      if (b) b.setAttribute("data-qa-pok", "1");
      return !!b;
    });
    t.check("Parameters dialog has an OK button", okTagged);
    if (okTagged) await t.click('[data-qa-pok="1"]');
    await t.settle(400);
    const closed = !(await t.app(() => [...document.querySelectorAll('.mn-modal, .dlg, [role="dialog"]')].some((e) => e.offsetParent && /PARAMETERS/i.test(e.innerText))));
    t.check("OK closes the Parameters dialog", closed);
    s = await t.state();
    const f = await t.app((id) => { const x = window.app.feature(id); return { length: x.length, height: x.height }; }, b.id);
    t.check("feature expressions stored (height 25 mm, length len)", /25/.test(String(f.height)) && /len/.test(String(f.length)), JSON.stringify(f));
    t.check(`model uses them (volume 60*20*25 = 30000)`, near(s.volume, 30000, 1), `volume=${fmt(s.volume)}`);
    t.check("parameter edits are one undoable step each or a single step (undo stack grew)", s.undo >= 2, `undo=${s.undo}`);
    await t.shot("after-ok");

    t.step("Esc dismisses the dialog");
    await t.app(() => window.app.commands.run("ChangeParameterCommand"));
    await t.settle(300);
    await t.key("Escape");
    await t.settle(200);
    const closed2 = !(await t.app(() => [...document.querySelectorAll('.mn-modal, .dlg, [role="dialog"]')].some((e) => e.offsetParent && /PARAMETERS/i.test(e.innerText))));
    t.check("Esc closes the Parameters dialog", closed2);
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
