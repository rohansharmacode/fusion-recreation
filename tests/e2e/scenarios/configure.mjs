// Design configurations through the real UI: CONFIGURE > Configure enters Configuration Mode and opens the
// Configuration Table; clicking timeline features / browser bodies opens the Configure dialog (aspects become
// columns); Add Configurations, cell edits, activation (table + browser selector), local edits written back
// to the active configuration, Appearance theme table, rename / duplicate / delete, Configuration Rules,
// undo / redo and a save / open round trip.
import { defineScenario, mainIfDirect, apiBox, near, fmt } from "../lib.mjs";

const NAME = "QA Configured";

async function submitNameDialog(t, name) {
  const sel = '#overlay input[type="text"], #overlay input:not([type]), [role="dialog"] input';
  if (!(await t.waitFor(sel, { timeout: 1500 }))) return false;
  await t.fill(sel, name, { commit: false });
  await t.settle(100);
  const btn = await t.app(() => {
    const b = [...document.querySelectorAll('#overlay button, #overlay [data-action], [role="dialog"] button')].filter((x) => x.offsetParent)
      .find((x) => x.getAttribute("data-action") === "ok" || /^(save|ok)$/i.test((x.innerText || "").trim()));
    if (b) { b.setAttribute("data-qa-target", "1"); return true; }
    return false;
  });
  if (btn) await t.click('[data-qa-target="1"]'); else await t.key("Enter");
  await t.app(() => document.querySelector('[data-qa-target="1"]')?.removeAttribute("data-qa-target"));
  return true;
}
const cfg = (t) => t.app(() => {
  const c = window.app.doc.configurations;
  return c ? { rows: c.rows.map((r) => ({ id: r.id, name: r.name })), active: c.active, columns: c.columns.map((x) => ({ ...x })), cells: c.cells, themes: c.themes, rules: c.rules } : null;
});
/** Click the Configure dialog check box whose label matches `re`. */
async function checkAspect(t, re) {
  const id = await t.app((src) => {
    const re = new RegExp(src, "i");
    const d = document.querySelector('.dlg[data-dialog^="Configure"]');
    if (!d) return null;
    const rows = [...d.querySelectorAll(".dlg-row, [class*=row]")].filter((r) => r.querySelector("input.dlg-check") && re.test(r.innerText || ""));
    const cb = rows.length ? rows[0].querySelector("input.dlg-check") : null;
    return cb ? cb.dataset.input : null;
  }, re.source);
  if (!id) return false;
  return t.click(`.dlg[data-dialog^="Configure"] input[data-input="${id}"]`);
}

const scenario = defineScenario({
  name: "configure",
  title: "Configured design: Configure, Configuration Table, activation, rules",
  async run(t) {
    t.step("setup: Box1 40x20x10 and a separate Cylinder1 body (through the App API)");
    const b = await apiBox(t);
    await t.app(() => window.app.addFeature({ type: "cylinder", diameter: "10 mm", height: "10 mm", center: [40, 0], operation: "new", plane: { kind: "origin", name: "XY" } }));
    let s = await t.state();
    t.require("setup computed", s.features.length === 2 && s.features.every((f) => f.ok), JSON.stringify(s.features));
    const volCyl = Math.PI * 25 * 10;
    t.check("two bodies, volume 8000 + cylinder", s.bodies.length === 2 && near(s.volume, 8000 + volCyl, 1), fmt(s.volume));
    const [boxId, cylId] = s.features.map((f) => f.id);
    const bodyId = b.body;

    t.step("CONFIGURE panel: Configure enters Configuration Mode and opens the Configuration Table");
    t.check("CONFIGURE panel shows Configure / Display Configuration Table / Create Configuration Rules", await t.app(() => ["FusionStartDesignConfigModeCmd", "FusionShowDesignConfigPanelCmd", "FusionConfigurationRulesCmd"].every((id) => !!document.querySelector(`#toolbar [data-cmd="${id}"]`))));
    t.check("the three commands are real (not stubs)", await t.app(() => ["FusionStartDesignConfigModeCmd", "FusionShowDesignConfigPanelCmd", "FusionConfigurationRulesCmd"].every((id) => !window.app.commands.get(id).stub)));
    await t.click('#toolbar [data-cmd="FusionStartDesignConfigModeCmd"]');
    await t.settle(250);
    t.check("Configuration Table palette is shown", await t.visible("[data-cfg-table]"));
    t.check("CONFIGURATION TABLE title", /CONFIGURATION TABLE/.test(await t.app(() => document.querySelector("[data-cfg-table]").innerText)));
    t.check("Configuration Mode bar with check mark at the top of the canvas", await t.visible("[data-cfg-mode] [data-cfg=\"exit-mode\"]"));
    t.check("a standard design shows one Default Configuration row", await t.app(() => /Configuration 1\s*\(Default\)/.test(document.querySelector('[data-table="top"] tbody').innerText)));
    await t.app(() => { const x = document.querySelector(".cfg-intro-x"); if (x && x.offsetParent) x.click(); });
    await t.shot("configuration-mode");

    t.step("click Box1 in the timeline: Configure dialog, check Height (d3)");
    await t.click(`#timeline .tl-item[data-feature="${boxId}"]`);
    t.require("Configure dialog opens for Box1", await t.waitFor('.dlg[data-dialog="ConfigureFeatureCmd"]', { timeout: 2000 }));
    const dtext = await t.app(() => document.querySelector('.dlg[data-dialog="ConfigureFeatureCmd"]').innerText);
    t.check("dialog lists Box1's parameters and Suppression", /Box1/.test(dtext) && /Height/.test(dtext) && /Suppression/.test(dtext), dtext.replace(/\s+/g, " "));
    t.check("selecting the timeline item did not select it (Configuration Mode intercepts the click)", (await t.state()).selection.length === 0);
    await t.shot("configure-dialog");
    t.check("check Height (d3)", await checkAspect(t, /Height/));
    await t.click('.dlg[data-dialog="ConfigureFeatureCmd"] [data-action="ok"]');
    await t.settle(200);

    t.step("click Cylinder1 in the timeline: check Suppression");
    await t.click(`#timeline .tl-item[data-feature="${cylId}"]`);
    await t.waitFor('.dlg[data-dialog="ConfigureFeatureCmd"]', { timeout: 2000 });
    t.check("check Suppression", await checkAspect(t, /^\s*Suppression/));
    await t.click('.dlg[data-dialog="ConfigureFeatureCmd"] [data-action="ok"]');
    await t.settle(200);

    t.step("click Body1 in the Browser: check Appearance");
    await t.app(() => window.app.ui.browser && window.app.ui.browser.expand("bodies:root", true));
    await t.settle(150);
    await t.click(`.br-row[data-node="body:${bodyId}"] .br-label`);
    t.require("Configure dialog opens for the body", await t.waitFor('.dlg[data-dialog="ConfigureEntityCmd"]', { timeout: 2000 }));
    const btext = await t.app(() => document.querySelector('.dlg[data-dialog="ConfigureEntityCmd"]').innerText);
    t.check("body aspects: Visibility, Appearance, Physical Material", /Visibility/.test(btext) && /Appearance/.test(btext) && /Physical Material/.test(btext), btext.replace(/\s+/g, " "));
    t.check("check Appearance", await checkAspect(t, /Appearance/));
    await t.click('.dlg[data-dialog="ConfigureEntityCmd"] [data-action="ok"]');
    await t.settle(250);
    let c = await cfg(t);
    t.require("design is configured with 3 top columns (d3, Suppression, Appearance theme)", c && c.columns.length === 3, JSON.stringify(c && c.columns));
    const colH = c.columns.find((x) => x.kind === "param").id;
    const colS = c.columns.find((x) => x.kind === "suppress").id;
    const colA = c.columns.find((x) => x.kind === "theme").id;
    t.check("column headers show the object group and aspect (Box1 > d3, Cylinder1 > Suppression)", await t.app(() => { const x = document.querySelector('[data-table="top"] thead').innerText; return /Box1/.test(x) && /d3/.test(x) && /Cylinder1/.test(x) && /Suppression/.test(x) && /Appearance/.test(x); }));
    t.check("Appearance Theme table shown under the top table", await t.visible('.cfg-theme[data-theme="appearance"]'));

    t.step("Add Configurations: 2");
    await t.fill('[data-cfg="count"]', "2", { commit: false });
    await t.click('[data-cfg="add-configurations"]');
    await t.settle(200);
    c = await cfg(t);
    t.check("3 configurations (Configuration 1..3)", c.rows.length === 3 && c.rows.map((r) => r.name).join() === "Configuration 1,Configuration 2,Configuration 3", JSON.stringify(c.rows));
    const [r1, r2, r3] = c.rows.map((r) => r.id);
    t.check("new rows copy the active configuration's values", c.cells[r2][colH] === c.cells[r1][colH] && c.cells[r3][colS] === false, JSON.stringify(c.cells));
    await t.shot("three-configurations");

    t.step("edit Configuration 2: d3 = 25, Cylinder1 suppressed (inactive row: the model does not change)");
    await t.fill(`[data-input="${r2}:${colH}"]`, "25");
    await t.click(`[data-input="${r2}:${colS}"]`);
    await t.settle(200);
    c = await cfg(t);
    t.check("cells stored (bare number gets mm)", c.cells[r2][colH] === "25 mm" && c.cells[r2][colS] === true, JSON.stringify(c.cells[r2]));
    s = await t.state();
    t.check("model unchanged while Configuration 1 is active", near(s.volume, 8000 + volCyl, 1) && s.bodies.length === 2, fmt(s.volume));

    t.step("double-click Configuration 2 to activate it");
    await t.dblclick(`[data-table="top"] [data-row-name="${r2}"] .cfg-nm`);
    await t.settle(400);
    s = await t.state();
    t.check("Configuration 2 active", (await cfg(t)).active === r2);
    t.check("Box1 height 25 and Cylinder1 suppressed -> one body, volume 20000", s.bodies.length === 1 && near(s.volume, 20000, 1), `bodies=${s.bodies.length} volume=${fmt(s.volume)}`);
    t.check("timeline shows Cylinder1 suppressed", s.features.find((f) => f.id === cylId).suppressed);
    t.check("browser selector shows the active configuration", await t.app(() => /Configuration 2/.test(document.querySelector("[data-cfg-selector-head]")?.innerText || "")));
    await t.shot("configuration-2-active");

    t.step("edit the active row: d3 = 30 updates the canvas live");
    await t.fill(`[data-input="${r2}:${colH}"]`, "30 mm");
    await t.settle(300);
    s = await t.state();
    t.check("volume 24000", near(s.volume, 24000, 1), fmt(s.volume));

    t.step("local edit: unsuppress Cylinder1 from the timeline menu writes into the active configuration only");
    await t.click('[data-cfg="exit-mode"]');
    await t.settle(150);
    t.check("check mark exits Configuration Mode", !(await t.visible("[data-cfg-mode]")));
    await t.click(`#timeline .tl-item[data-feature="${cylId}"]`, { button: "right" });
    await t.settle(200);
    const unsup = await t.click('#overlay [data-action="unsuppress"], #overlay [data-cmd="FusionUnsuppressCommand"]');
    t.check("timeline menu Unsuppress Features", unsup);
    await t.settle(300);
    c = await cfg(t);
    t.check("Configuration 2 cell is now Unsuppressed, Configuration 3 untouched", c.cells[r2][colS] === false && c.cells[r3][colS] === false && c.cells[r1][colS] === false, JSON.stringify([c.cells[r1][colS], c.cells[r2][colS], c.cells[r3][colS]]));
    t.check("table shows it", await t.app(({ r, col }) => document.querySelector(`[data-input="${r}:${col}"]`)?.dataset.value === "unsuppressed", { r: r2, col: colS }));

    t.step("Timeline right-click > Configure (outside Configuration Mode) re-enters the mode; check Width (d2)");
    await t.click(`#timeline .tl-item[data-feature="${boxId}"]`, { button: "right" });
    await t.settle(200);
    t.check("timeline menu has Configure", await t.click('#overlay [data-cmd="ConfigureFeatureCmd"]'));
    t.check("Configure dialog for Box1 with Height already checked", await t.waitFor('.dlg[data-dialog="ConfigureFeatureCmd"]', { timeout: 2000 })
      && await t.app(() => { const d = document.querySelector('.dlg[data-dialog="ConfigureFeatureCmd"]'); const row = [...d.querySelectorAll("input.dlg-check")].find((x) => /Height/.test(x.closest(".dlg-row, [class*=row]")?.innerText || "")); return !!(row && row.checked); }));
    t.check("Configuration Mode is on again", await t.visible("[data-cfg-mode]"));
    t.check("check Width (d2)", await checkAspect(t, /Width/));
    await t.click('.dlg[data-dialog="ConfigureFeatureCmd"] [data-action="ok"]');
    await t.settle(200);
    c = await cfg(t);
    const colW = (c.columns.find((x) => x.kind === "param" && x.field === "width") || {}).id;
    t.check("Width column added with every configuration at 20 mm", !!colW && c.rows.every((r) => c.cells[r.id][colW] === "20 mm"), JSON.stringify(c.columns));

    t.step("Browser right-click Body2 > Configure: Visibility, hidden in Configuration 3");
    const cylBody = await t.app((id) => window.app.feature(id).newBody, cylId);
    await t.click(`.br-row[data-node="body:${cylBody}"] .br-label`, { button: "right" });
    await t.settle(200);
    t.check("browser body menu has Configure", await t.click('#overlay [data-cmd="ConfigureEntityCmd"]'));
    t.require("Configure dialog for Body2", await t.waitFor('.dlg[data-dialog="ConfigureEntityCmd"]', { timeout: 2000 }));
    t.check("check Visibility", await checkAspect(t, /Visibility/));
    await t.click('.dlg[data-dialog="ConfigureEntityCmd"] [data-action="ok"]');
    await t.settle(200);
    c = await cfg(t);
    const colV = (c.columns.find((x) => x.kind === "visibility") || {}).id;
    t.require("Visibility column added", !!colV, JSON.stringify(c.columns));
    await t.click(`[data-input="${r3}:${colV}"]`);
    await t.settle(150);
    t.check("Configuration 3 hides Body2 (cell Hidden), the active body stays visible", (await cfg(t)).cells[r3][colV] === false && (await t.state()).bodies.find((x) => x.id === cylBody).visible, JSON.stringify((await cfg(t)).cells[r3]));

    t.step("Add Parameters: the Parameters dialog's Configured column adds Length (d1)");
    await t.click('[data-cfg="add-parameters"]');
    t.require("PARAMETERS dialog with a Configured column", await t.waitFor('[data-dialog="ConfigureParameters"]', { timeout: 2000 }) && /Configured/.test(await t.app(() => document.querySelector('[data-dialog="ConfigureParameters"]').innerText)));
    t.check("d3 and d2 show as configured", await t.app(() => document.querySelector('.cfg-pm-check[data-param="d3"]')?.checked && document.querySelector('.cfg-pm-check[data-param="d2"]')?.checked));
    await t.shot("add-parameters");
    await t.click('.cfg-pm-check[data-param="d1"]');
    await t.settle(150);
    c = await cfg(t);
    t.check("d1 column added", c.columns.some((x) => x.kind === "param" && x.field === "length"), JSON.stringify(c.columns.map((x) => x.field || x.kind)));
    await t.click('[data-dialog="ConfigureParameters"] [data-action="ok"]');
    await t.settle(150);
    t.check("PARAMETERS dialog closes", !(await t.visible('[data-dialog="ConfigureParameters"]')));

    t.step("Appearance theme: Add Themes, give Theme 2 Glass, use it in Configuration 3");
    await t.click('[data-cfg="add-themes:appearance"]');
    await t.settle(200);
    c = await cfg(t);
    const th = c.themes.appearance;
    t.check("two appearance themes", th.rows.length === 2, JSON.stringify(th.rows));
    const t2 = th.rows[1].id, tc = th.columns[0].id;
    const glass = await t.app(() => Object.keys(window.app.appearances).find((k) => /glass/i.test(k)) || Object.keys(window.app.appearances)[1]);
    await t.page.selectOption(`[data-input="appearance:${t2}:${tc}"]`, glass);
    await t.page.selectOption(`[data-input="${r3}:${colA}"]`, t2);
    await t.settle(200);
    c = await cfg(t);
    t.check("theme cell and theme selection stored", c.themes.appearance.cells[t2][tc] === glass && c.cells[r3][colA] === t2, JSON.stringify(c.themes.appearance));

    t.step("Physical Material theme: configure Body1's material, set Theme 1 to another material");
    await t.click(`.br-row[data-node="body:${bodyId}"] .br-label`, { button: "right" });
    await t.settle(200);
    await t.click('#overlay [data-cmd="ConfigureEntityCmd"]');
    await t.waitFor('.dlg[data-dialog="ConfigureEntityCmd"]', { timeout: 2000 });
    t.check("check Physical Material", await checkAspect(t, /Physical Material/));
    await t.click('.dlg[data-dialog="ConfigureEntityCmd"] [data-action="ok"]');
    await t.settle(200);
    t.check("Physical Material Theme table shown", await t.visible('.cfg-theme[data-theme="material"]'));
    c = await cfg(t);
    const mth = c.themes.material;
    const otherMat = await t.app(() => Object.keys(window.app.ui.inspect.materials).find((k) => /alumin/i.test(k)) || Object.keys(window.app.ui.inspect.materials).find((k) => k !== "steel"));
    await t.page.selectOption(`[data-input="material:${mth.rows[0].id}:${mth.columns[0].id}"]`, otherMat);
    await t.settle(250);
    t.check("the active configuration uses Theme 1: Body1 material changes", await t.app(({ id, m }) => window.app.doc.bodies[id].material === m, { id: bodyId, m: otherMat }), otherMat);

    t.step("activate Configuration 3 from the browser selector");
    await t.click("[data-cfg-selector-head]");
    await t.settle(150);
    t.check("browser lists the configurations with a search field", await t.visible(".cfg-sel-search") && (await t.app(() => document.querySelectorAll("[data-cfg-option]").length)) === 3);
    await t.fill(".cfg-sel-search", "3", { commit: false });
    await t.settle(100);
    t.check("search filters the list", (await t.app(() => document.querySelectorAll("[data-cfg-option]").length)) === 1);
    await t.click(`[data-cfg-option="${r3}"]`);
    await t.settle(400);
    s = await t.state();
    const ap = await t.app((id) => window.app.doc.bodies[id].appearance, bodyId);
    t.check("Configuration 3 active: box height 10, appearance from Theme 2", (await cfg(t)).active === r3 && near(s.volume, 8000 + volCyl, 1) && ap === glass, `vol=${fmt(s.volume)} ap=${ap}`);
    t.check("Configuration 3 hides Body2", s.bodies.find((x) => x.id === cylBody).visible === false);
    await t.shot("configuration-3-browser");

    t.step("rename / duplicate / delete configurations (right-click a Configuration Name)");
    const menuItem = (label) => t.click(`#overlay [data-menu-item="${label}"]:not(.sh-mi-disabled)`, { timeout: 1500 });
    await t.click(`[data-table="top"] [data-row-name="${r3}"]`, { button: "right" });
    await t.settle(200);
    const txt = await t.overlayText();
    t.check("row menu: Activate, Rename, Duplicate, Delete", /Activate/.test(txt) && /Rename/.test(txt) && /Duplicate/.test(txt) && /Delete/.test(txt), txt.replace(/\s+/g, " ").slice(0, 120));
    t.check("Rename", await menuItem("Rename"));
    await t.settle(100);
    await t.page.keyboard.press("Control+A");
    await t.type("Large");
    await t.key("Enter");
    await t.settle(200);
    c = await cfg(t);
    t.check("renamed to Large", c.rows.find((r) => r.id === r3).name === "Large", JSON.stringify(c.rows));
    await t.click(`[data-table="top"] [data-row-name="${r3}"]`, { button: "right" });
    await t.settle(200);
    t.check("Duplicate", await menuItem("Duplicate"));
    await t.settle(200);
    c = await cfg(t);
    t.check("duplicate added to the bottom as 'Large (1)'", c.rows.length === 4 && c.rows[3].name === "Large (1)", JSON.stringify(c.rows.map((r) => r.name)));
    const r4 = c.rows[3].id;
    await t.click(`[data-table="top"] [data-row-name="${r4}"]`, { button: "right" });
    await t.settle(200);
    t.check("Delete", await menuItem("Delete"));
    await t.settle(200);
    t.check("Delete removes it", (await cfg(t)).rows.length === 3);
    await t.click(`[data-table="top"] [data-row-name="${r1}"]`, { button: "right" });
    await t.settle(200);
    t.check("the Default Configuration cannot be deleted", await t.app(() => !!document.querySelector('#overlay [data-menu-item="Delete"].sh-mi-disabled')));
    await t.escapeAll(1);

    t.step("undo / redo of activation");
    await t.dblclick(`[data-table="top"] [data-row-name="${r2}"] .cfg-nm`);
    await t.settle(300);
    s = await t.state();
    t.check("Configuration 2 active (volume 24000 + cylinder)", near(s.volume, 24000 + volCyl, 1), fmt(s.volume));
    await t.blur();
    await t.mouseToCanvas(0.5, 0.3);
    await t.key("Control+z");
    await t.settle(400);
    s = await t.state();
    t.check("undo returns to Large (volume 8000 + cylinder)", (await cfg(t)).active === r3 && near(s.volume, 8000 + volCyl, 1), fmt(s.volume));
    await t.key("Control+y");
    await t.settle(400);
    s = await t.state();
    t.check("redo re-activates Configuration 2", (await cfg(t)).active === r2 && near(s.volume, 24000 + volCyl, 1), fmt(s.volume));

    t.step("Create Configuration Rules: a Setter limits d3 to min 15 mm");
    await t.click('#toolbar [data-cmd="FusionConfigurationRulesCmd"]');
    t.require("CONFIGURATION RULES editor opens", await t.waitFor('[data-dialog="FusionConfigurationRulesCmd"]', { timeout: 2000 }));
    await t.click('[data-dialog="FusionConfigurationRulesCmd"] [data-cat="rules"]').catch(() => {});
    await t.settle(100);
    if (!(await t.visible('[data-dialog="FusionConfigurationRulesCmd"] .cfg-rx-fb[data-block="rule"]'))) await t.click('[data-dialog="FusionConfigurationRulesCmd"] [data-cat="rules"]');
    await t.click('[data-dialog="FusionConfigurationRulesCmd"] .cfg-rx-fb[data-block="rule"]');
    await t.click('[data-dialog="FusionConfigurationRulesCmd"] [data-cat="modelingFeatures"]');
    await t.click('[data-dialog="FusionConfigurationRulesCmd"] .cfg-rx-fb[data-block="set"][data-cat="modelingFeatures"]');
    await t.settle(150);
    t.check("a Rule block with a Setter block", await t.visible('[data-rule] .cfg-rb-set'));
    await t.page.selectOption('[data-rule] .cfg-rb-set .cfg-rx-asp-sel', colH);
    await t.page.selectOption('[data-rule] .cfg-rb-set .cfg-rx-op-sel', "min");
    await t.fill('[data-rule] .cfg-rb-set .cfg-rx-num', "15");
    await t.settle(150);
    t.check("rule shows pending changes", await t.app(() => document.querySelector("[data-rule-status]")?.dataset.ruleStatus === "pending"));
    await t.shot("rules-editor");
    await t.click('[data-dialog="FusionConfigurationRulesCmd"] [data-action="apply"]');
    await t.settle(300);
    t.check("success banner after Apply", /successfully applied/.test(await t.app(() => document.querySelector(".cfg-rx-banner")?.innerText || "")));
    t.check("rule status Rule is active", await t.app(() => document.querySelector("[data-rule-status]")?.dataset.ruleStatus === "success"));
    c = await cfg(t);
    t.check("rule stored in the design", c.rules.length === 1 && c.rules[0].body[0].op === "min" && c.rules[0].body[0].value === 15, JSON.stringify(c.rules));
    t.check("rows below the minimum were moved to 15 mm (Configuration 1 and Large), Configuration 2 keeps 30 mm", c.cells[r1][colH] === "15 mm" && c.cells[r3][colH] === "15 mm" && c.cells[r2][colH] === "30 mm", JSON.stringify([c.cells[r1][colH], c.cells[r2][colH], c.cells[r3][colH]]));
    await t.click('[data-dialog="FusionConfigurationRulesCmd"] .mn-x');
    await t.settle(200);
    t.check("table marks limited cells", await t.app(({ r, col }) => !!document.querySelector(`[data-cell="${r}:${col}"].limited`), { r: r1, col: colH }));
    await t.fill(`[data-input="${r1}:${colH}"]`, "12");
    await t.settle(200);
    c = await cfg(t);
    t.check("a value that violates the rule is rejected (stays 15 mm)", c.cells[r1][colH] === "15 mm", c.cells[r1][colH]);
    t.check("'Value violates rule' message", /violates rule/i.test(await t.overlayText()));
    await t.shot("rule-limited");
    await t.blur();
    await t.mouseToCanvas(0.5, 0.3);
    await t.key("Control+z");
    await t.settle(300);
    c = await cfg(t);
    t.check("undo removes the rules and restores the values", c.rules.length === 0 && c.cells[r1][colH] === "10 mm", JSON.stringify([c.rules.length, c.cells[r1][colH]]));
    await t.key("Control+y");
    await t.settle(300);
    t.check("redo applies them again", (await cfg(t)).rules.length === 1);

    t.step("second rule: if Configuration = Large then set Cylinder1 Suppression = Suppressed (Logic + Getter + Setter)");
    await t.click('#toolbar [data-cmd="FusionConfigurationRulesCmd"]');
    t.require("rules editor reopens with the applied rule", await t.waitFor('[data-dialog="FusionConfigurationRulesCmd"] [data-rule]', { timeout: 2000 }));
    const RX = '[data-dialog="FusionConfigurationRulesCmd"]';
    const block = async (cat, kind) => { if (!(await t.visible(`${RX} .cfg-rx-fb[data-block="${kind}"][data-cat="${cat}"]`))) await t.click(`${RX} .cfg-rx-cat[data-cat="${cat}"]`); return t.click(`${RX} .cfg-rx-fb[data-block="${kind}"][data-cat="${cat}"]`); };
    t.check("Rules > Rule", await block("rules", "rule"));
    t.check("Logic > if then else", await block("logic", "if"));
    t.check("Configurations > get Configuration fills the condition", await block("configurations", "get"));
    await t.settle(100);
    const rule2 = `${RX} [data-rule]:nth-of-type(2)`;
    t.check("getter block in the if condition", await t.visible(`${rule2} .cfg-rb-if .cfg-rb-get`));
    await t.click(`${rule2} .cfg-rb-get [data-opt="${r3}"]`);
    await t.click(`${rule2} .cfg-rb-then .cfg-rx-stmts`);
    t.check("Modeling Features > set goes into 'then'", await block("modelingFeatures", "set") && await t.visible(`${rule2} .cfg-rb-then .cfg-rb-set`));
    await t.page.selectOption(`${rule2} .cfg-rb-set .cfg-rx-asp-sel`, colS);
    await t.settle(100);
    await t.page.selectOption(`${rule2} .cfg-rb-set .cfg-rx-bool`, "true");
    await t.settle(100);
    await t.shot("rules-logic");
    await t.click(`${RX} [data-action="apply"]`);
    await t.settle(300);
    c = await cfg(t);
    t.check("two rules stored; both active", c.rules.length === 2 && c.rules.every((r) => r.active), JSON.stringify(c.rules));
    t.check("Large's Cylinder1 Suppression is driven to Suppressed, the others are not", c.cells[r3][colS] === true && c.cells[r1][colS] === false && c.cells[r2][colS] === false, JSON.stringify([c.cells[r1][colS], c.cells[r2][colS], c.cells[r3][colS]]));
    t.check("statuses: Rule is active", await t.app(() => [...document.querySelectorAll("[data-rule-status]")].every((x) => x.dataset.ruleStatus === "success")));
    await t.click(`${RX} .mn-x`);
    await t.settle(200);
    t.check("the driven cell is read-only (Driven by rule)", await t.app(({ r, col }) => { const b = document.querySelector(`[data-input="${r}:${col}"]`); return !!(b && b.disabled && /Driven by rule/.test(b.title)); }, { r: r3, col: colS }));

    t.step("Properties tab: Part Number / Description");
    await t.click('[data-cfg-table] [data-tab="properties"]');
    await t.settle(100);
    await t.fill(`[data-input="${r2}:partNumber"]`, "PN-0002");
    await t.settle(150);
    t.check("part number stored", await t.app((r) => window.app.doc.configurations.rows.find((x) => x.id === r).partNumber === "PN-0002", r2));
    await t.click('[data-cfg-table] [data-tab="parameters"]');

    t.step("save / open round trip keeps the configurations");
    const before = await cfg(t);
    const volBefore = (await t.state()).volume;
    await t.blur();
    await t.mouseToCanvas(0.5, 0.3);
    await t.key("Control+s");
    await t.settle(300);
    t.check("save dialog named the design", await submitNameDialog(t, NAME));
    await t.settle(400);
    await t.blur();
    await t.mouseToCanvas(0.5, 0.3);
    await t.key("Control+n");
    await t.settle(400);
    t.check("new design is not configured and the table is closed", (await cfg(t)) === null && !(await t.visible("[data-cfg-table]")));
    await t.blur();
    await t.mouseToCanvas(0.5, 0.3);
    await t.key("Control+o");
    await t.settle(400);
    await t.shot("open-dialog");
    const pick = await t.app((name) => {
      const els = [...document.querySelectorAll("#overlay *, [role=dialog] *")].filter((e) => e.offsetParent && e.children.length <= 3 && (e.innerText || "").includes(name));
      const el = els.sort((a, b) => a.innerText.length - b.innerText.length)[0];
      if (!el) return false;
      el.setAttribute("data-qa-open", "1");
      return true;
    }, NAME);
    if (pick) {
      await t.click('[data-qa-open="1"]');
      if (!(await t.waitFor(() => window.app.doc.features.length > 0, { timeout: 800 }))) {
        await t.dblclick('[data-qa-open="1"]').catch(() => {});
        await t.settle(200);
        if (await t.app(() => window.app.doc.features.length === 0)) {
          const btn = await t.app(() => { const b = [...document.querySelectorAll('#overlay button, [role=dialog] button')].find((x) => x.offsetParent && (x.getAttribute("data-action") === "ok" || /^open$/i.test((x.innerText || "").trim()))); if (b) { b.setAttribute("data-qa-ok", "1"); return true; } return false; });
          if (btn) await t.click('[data-qa-ok="1"]');
        }
      }
      await t.waitFor(() => window.app.doc.features.length > 0, { timeout: 4000 });
    }
    t.check("Open lists and opens the saved design", pick);
    await t.settle(300);
    const after = await cfg(t);
    s = await t.state();
    t.check("configurations, columns, cells, themes and rules restored", after && JSON.stringify(after) === JSON.stringify(before), "differs");
    t.check("active configuration and geometry restored", after && after.active === before.active && near(s.volume, volBefore, 1), `vol ${fmt(s.volume)} vs ${fmt(volBefore)}`);
    await t.click('#toolbar [data-cmd="FusionShowDesignConfigPanelCmd"]');
    await t.settle(200);
    t.check("Display Configuration Table shows the restored table", await t.visible("[data-cfg-table]") && (await t.app(() => document.querySelectorAll('[data-table="top"] tbody tr').length)) === 3);
    await t.shot("reopened");
    await t.click('#toolbar [data-cmd="FusionShowDesignConfigPanelCmd"]');
    await t.settle(150);
    t.check("Display Configuration Table toggles it off again", !(await t.visible("[data-cfg-table]")));
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
