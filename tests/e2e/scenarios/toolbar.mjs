// Toolbar: workspace switcher, tabs (order + switching), panels (order), promoted buttons,
// panel dropdowns (content/order, run a command, Esc closes), tooltips.
import { defineScenario, mainIfDirect } from "../lib.mjs";

// Fusion 2706, new Part Design (reference screenshots 01-03): AUTOMATION follows UTILITIES, and the SOLID tab shows
// CREATE, MODIFY, CONFIGURE, CONSTRUCT, INSPECT, INSERT, ASSEMBLE (PartAssemblePanel "Add To Assembly"), SELECT.
const TABS = [["SolidTab", "SOLID"], ["SurfaceTab", "SURFACE"], ["ParaMeshOuterTab", "MESH"], ["SheetMetalTab", "SHEET METAL"], ["PlasticTab", "PLASTIC"], ["ManageTab", "MANAGE"], ["ToolsTab", "UTILITIES"], ["AutomationTab", "AUTOMATION"]];
const SOLID_PANELS = ["SolidCreatePanel", "SolidModifyPanel", "ConfigurePanel", "ConstructionPanel", "InspectPanel", "InsertPanel", "PartAssemblePanel", "SelectPanel"];
const CREATE_PROMOTED = ["SketchCreate", "Extrude", "Revolve", "FusionHoleCommand", "PatternRectangular"];
const MODIFY_PROMOTED = ["FusionPressPullCommand", "FusionFilletEdgesCommand", "FusionShellBodyCommand", "FusionCombineCommand", "FusionMoveCommand"];
const CREATE_ORDER = ["SketchCreate", "Extrude", "Revolve", "Sweep", "SolidLoft", "FusionHoleCommand", "PrimitiveBox", "PrimitiveCylinder", "PrimitiveSphere", "PrimitiveTorus", "MirrorCommand"];
const MODIFY_ORDER = ["FusionPressPullCommand", "FusionFilletEdgesCommand", "FusionChamferCommand", "FusionShellBodyCommand", "FusionDraftCommand", "FusionCombineCommand", "FusionMoveCommand", "FusionDeleteCommand", "PhysicalMaterialCommand", "AppearanceCommand", "ChangeParameterCommand", "FusionComputeAllCommand"];

const scenario = defineScenario({
  name: "toolbar",
  title: "Toolbar tabs, panels, dropdowns, tooltips",
  async run(t) {
    await t.shot("start");
    const tb = await t.app(() => {
      const el = document.getElementById("toolbar");
      return el ? { text: el.innerText, h: el.getBoundingClientRect().height, n: el.querySelectorAll("[data-cmd]").length } : null;
    });
    t.require("toolbar host renders content", tb && tb.n > 0, JSON.stringify(tb && { h: tb.h, n: tb.n }));
    t.check("workspace switcher reads DESIGN", /DESIGN/.test(tb.text), tb.text.slice(0, 80));
    t.check("toolbar height is in Fusion's range (70–110 px incl. tabs)", tb.h >= 70 && tb.h <= 110, `height=${tb.h}`);

    // ---------- tabs ----------
    t.step("tabs exist in Fusion's order");
    const tabs = await t.app((ids) => ids.map((id) => {
      const el = document.querySelector(`[data-tab="${id}"]`);
      if (!el || !el.offsetParent) return null;
      const r = el.getBoundingClientRect();
      return { id, x: r.left, text: el.innerText.trim() };
    }), TABS.map((x) => x[0]));
    for (let i = 0; i < TABS.length; i++) {
      const [id, label] = TABS[i];
      const tab = tabs[i];
      // MANAGE carries hub/Manage-extension panels (Assign, Release, BOM); personal-use installs often hide it
      if (id === "ManageTab" && !tab) { t.note("MANAGE tab not shown (optional: hub/Manage-extension dependent)"); continue; }
      t.check(`tab ${label} present ([data-tab=${id}])`, !!tab, "missing or hidden");
      if (tab) t.check(`tab ${id} caption is "${label}"`, tab.text.toUpperCase() === label, `caption="${tab.text}"`);
    }
    const xs = tabs.filter(Boolean).map((x) => x.x);
    t.check("tabs are in left-to-right order SOLID, SURFACE, MESH, SHEET METAL, PLASTIC, MANAGE, UTILITIES, AUTOMATION", xs.every((x, i) => i === 0 || x > xs[i - 1]), JSON.stringify(tabs.filter(Boolean).map((x) => x.id)));

    // ---------- panels ----------
    t.step("SOLID panels in order");
    const panels = await t.app((ids) => ids.map((id) => {
      const el = document.querySelector(`#toolbar [data-panel="${id}"]`);
      if (!el || !el.offsetParent) return null;
      const r = el.getBoundingClientRect();
      return { id, x: r.left, text: el.innerText.trim() };
    }), SOLID_PANELS);
    for (let i = 0; i < SOLID_PANELS.length; i++) t.check(`panel ${SOLID_PANELS[i]} present`, !!panels[i], "missing or hidden");
    const px = panels.filter(Boolean).map((p) => p.x);
    t.check("panels left-to-right: CREATE, MODIFY, CONFIGURE, CONSTRUCT, INSPECT, INSERT, ASSEMBLE, SELECT", px.every((x, i) => i === 0 || x > px[i - 1]), JSON.stringify(panels.filter(Boolean).map((p) => p.id)));
    const capt = panels.filter(Boolean).map((p) => p.text.replace(/[▾▼⌄]/g, "").trim().toUpperCase());
    t.check("panel captions are uppercase CREATE/MODIFY/…", capt.includes("CREATE") && capt.includes("MODIFY") && capt.includes("CONSTRUCT") && capt.includes("INSPECT"), JSON.stringify(capt));

    t.step("promoted buttons");
    for (const id of [...CREATE_PROMOTED, ...MODIFY_PROMOTED]) {
      t.check(`toolbar button ${id}`, await t.visible(`#toolbar [data-cmd="${id}"]`), "not visible in #toolbar");
    }
    const btn = await t.box('#toolbar [data-cmd="Extrude"]');
    if (btn) t.check("toolbar buttons are ~32–48 px (Fusion: 40x40, 32px icon)", btn.width >= 28 && btn.width <= 56 && btn.height >= 28 && btn.height <= 56, `${btn.width}x${btn.height}`);

    // ---------- CREATE dropdown ----------
    t.step("open CREATE dropdown");
    t.require("CREATE panel caption clickable", await t.click('#toolbar [data-panel="SolidCreatePanel"]'));
    await t.settle(250);
    await t.shot("create-dropdown");
    const menu = await t.app((ids) => {
      const ov = document.getElementById("overlay");
      const found = ids.map((id) => {
        const el = [...ov.querySelectorAll(`[data-cmd="${id}"]`)].find((e) => e.offsetParent);
        return el ? el.getBoundingClientRect().top : null;
      });
      const row = (id) => {
        const el = [...ov.querySelectorAll(`[data-cmd="${id}"]`)].find((e) => e.offsetParent);
        if (!el) return "";
        const c = el.cloneNode(true);
        c.querySelectorAll("svg").forEach((s) => s.remove()); // icon placeholders may contain <text>
        return (c.textContent || "").replace(/\s+/g, " ").trim();
      };
      return { found, text: ov.innerText, extrudeRow: row("Extrude"), holeRow: row("FusionHoleCommand") };
    }, CREATE_ORDER);
    const present = CREATE_ORDER.filter((_, i) => menu.found[i] !== null);
    t.check("CREATE dropdown lists Extrude, Revolve, Hole, Box, … (overlay [data-cmd])", present.length >= CREATE_ORDER.length - 1, `missing: ${CREATE_ORDER.filter((_, i) => menu.found[i] === null).join(",")}`);
    const ys = menu.found.filter((v) => v !== null);
    t.check("CREATE dropdown order matches TabToolbars.xml", ys.every((y, i) => i === 0 || y > ys[i - 1]), JSON.stringify(present));
    t.check("dropdown rows show shortcut letters (Extrude … E, Hole … H)", /^Extrude.*E$/.test(menu.extrudeRow) && /^Hole.*H$/.test(menu.holeRow), `rows: "${menu.extrudeRow}" / "${menu.holeRow}"`);
    t.check("dropdown has a Pattern submenu", /Pattern/.test(menu.text), "no 'Pattern' text");
    await t.key("Escape");
    await t.settle(150);
    const stillOpen = await t.app(() => [...document.querySelectorAll('#overlay [data-cmd="PrimitiveBox"]')].some((e) => e.offsetParent));
    t.check("Esc closes the dropdown", !stillOpen, "Box item still visible");

    t.step("run Box from the CREATE dropdown");
    await t.click('#toolbar [data-panel="SolidCreatePanel"]');
    await t.settle(200);
    const ranBox = await t.click('#overlay [data-cmd="PrimitiveBox"]');
    t.check("Box item clickable", ranBox);
    const boxDlg = await t.waitFor('.dlg[data-dialog="PrimitiveBox"]', { timeout: 2500 });
    t.check("Box opens its dialog (.dlg[data-dialog=PrimitiveBox])", boxDlg);
    const menuGone = await t.app(() => ![...document.querySelectorAll('#overlay [data-cmd="Extrude"]')].some((e) => e.offsetParent));
    t.check("dropdown closes after choosing an item", menuGone);
    await t.shot("box-dialog");
    if (boxDlg) await t.click('.dlg[data-dialog="PrimitiveBox"] [data-action="cancel"]');
    await t.escapeAll();

    // ---------- MODIFY dropdown ----------
    t.step("MODIFY dropdown content");
    await t.click('#toolbar [data-panel="SolidModifyPanel"]');
    await t.settle(250);
    const mod = await t.app((ids) => ids.map((id) => { const el = [...document.querySelectorAll(`#overlay [data-cmd="${id}"]`)].find((e) => e.offsetParent); return el ? el.getBoundingClientRect().top : null; }), MODIFY_ORDER);
    const missingM = MODIFY_ORDER.filter((_, i) => mod[i] === null);
    t.check("MODIFY dropdown lists Press Pull … Change Parameters, Compute All", missingM.length <= 1, `missing: ${missingM.join(",")}`);
    const ym = mod.filter((v) => v !== null);
    t.check("MODIFY dropdown order matches TabToolbars.xml", ym.every((y, i) => i === 0 || y > ym[i - 1]));
    await t.shot("modify-dropdown");
    await t.escapeAll();

    // ---------- tooltip ----------
    t.step("hover Extrude for a tooltip");
    await t.hover('#toolbar [data-cmd="Extrude"]');
    const t0 = Date.now();
    const shown = await t.waitFor(() => [...document.querySelectorAll("body *")].some((e) => e.offsetParent && e.children.length === 0 && /Extrude/.test(e.textContent || "") && !e.closest("#toolbar")), { timeout: 3000 });
    const tShort = Date.now() - t0;
    const expanded = await t.waitFor(() => [...document.querySelectorAll("body *")].some((e) => e.offsetParent && !e.closest("#toolbar") && /sketch profiles or faces|Adds depth/i.test(e.textContent || "") && (e.textContent || "").length < 400), { timeout: 4000 });
    const tLong = Date.now() - t0;
    t.note(`tooltip shown after ~${tShort} ms, description after ~${tLong} ms`);
    t.check("a tooltip appears within ~1.5 s of hovering", shown && tShort <= 1600, `${tShort} ms`);
    t.check("tooltip gains the command description (CommandDefinitions ExpandedContent)", expanded, "no description text within 4 s");
    const tip = await t.app(() => {
      const btn = document.querySelector('#toolbar [data-cmd="Extrude"]');
      const cands = [...document.querySelectorAll("#overlay *, body > *")].filter((e) => e.offsetParent && e !== btn && !btn.contains(e) && !e.contains(btn) && /Extrude/.test(e.innerText || "") && (e.innerText || "").length < 600);
      const el = cands.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length).pop();
      if (!el) return { text: btn && btn.title ? `title:${btn.title}` : "" };
      const r = el.getBoundingClientRect(), b = btn.getBoundingClientRect();
      const overlaps = !(r.right < b.left || r.left > b.right || r.bottom < b.top || r.top > b.bottom);
      return { text: el.innerText, overlaps };
    });
    t.check("tooltip appears for Extrude (rich, not just a title attribute)", tip.text && !tip.text.startsWith("title:"), `found: ${tip.text || "nothing"}`);
    t.check("tooltip mentions the shortcut E", /\bE\b/.test(tip.text || ""), tip.text);
    t.check("tooltip does not cover the button", tip.overlaps === false || tip.overlaps === undefined, "tooltip overlaps the button");
    await t.shot("tooltip");
    await t.page.mouse.move(800, 500);

    // ---------- tab switch ----------
    t.step("switch to SURFACE and back to SOLID");
    await t.click('[data-tab="SurfaceTab"]');
    await t.settle(200);
    const surf = await t.app(() => {
      const solidCreate = document.querySelector('#toolbar [data-panel="SolidCreatePanel"]');
      const anySurf = document.querySelector('#toolbar [data-panel="SurfaceCreatePanel"]');
      const tab = document.querySelector('[data-tab="SurfaceTab"]');
      return { solidHidden: !solidCreate || !solidCreate.offsetParent, surfShown: !!(anySurf && anySurf.offsetParent), active: tab ? (tab.className + " " + (tab.getAttribute("aria-selected") || "")) : "" };
    });
    t.check("clicking SURFACE changes the panel set", surf.solidHidden || surf.surfShown, JSON.stringify(surf));
    t.check("SURFACE tab marked active", /active|selected|true|on/i.test(surf.active), surf.active);
    await t.shot("surface-tab");
    await t.click('[data-tab="SolidTab"]');
    await t.settle(200);
    t.check("SOLID panels return", await t.visible('#toolbar [data-panel="SolidCreatePanel"]'));

    // ---------- every toolbar command is registered ----------
    const unreg = await t.app(() => [...document.querySelectorAll("#toolbar [data-cmd], #appbar [data-cmd]")].map((e) => e.getAttribute("data-cmd")).filter((id) => !window.app.commands.has(id)));
    t.check("every toolbar/appbar data-cmd is a registered command", unreg.length === 0, `unregistered: ${[...new Set(unreg)].join(",")}`);
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
