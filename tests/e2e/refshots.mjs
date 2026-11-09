// Reference-pair screenshots: reproduce each real-Fusion reference capture (fusion-refs/NN-name.jpg)
// in our app through the real UI and save a side-by-side composite for visual comparison.
//
//   node tests/e2e/refshots.mjs [--refs=<dir>] [--only=04,13,22] [--no-build] [--headed]
//
// Outputs (tests/e2e/out/refpairs/):
//   NN-name.ours.png   our 1389x800 viewport screenshot
//   NN-name.pair.png   [ref | ours] composite. Full-frame refs (1389x868 screen grabs, Fusion's app area at
//                      y 22..822) are cropped to the app area and both halves drawn at 50 %. Zoomed refs are
//                      paired with the matching region of our screenshot (fixed rectangle in app coordinates,
//                      or the bounding box of the equivalent element), scaled to the same display size.
//
// The reference folder defaults to $FUSION_REFS or the session scratchpad used when the captures were made.
// The design matches the captures: Create Sketch on XY, 2-point rectangle 40x20 (first corner at
// (-26.1, -23.9) mm like the reference), Finish Sketch, Extrude 10 mm. The camera stays at the empty-design
// home view (Fusion does not refit after Finish Sketch / Extrude). One browser session; the document is rebuilt
// through the UI (after app.newDocument()) only when a state needs an earlier stage of the design.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const argVal = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DEFAULT_REFS = "C:/Users/rohan/AppData/Local/Temp/claude/d91a8036ae0f6b97/34d5b802-0595-4038-8281-0afceb5b9339/scratchpad/fusion-refs";
const REFS = path.resolve(argVal("refs", process.env.FUSION_REFS || DEFAULT_REFS));
const ONLY = argVal("only", "").split(",").map((s) => s.trim()).filter(Boolean);
const OUT_REL = "tests/e2e/out/refpairs";
const OUT = path.resolve(ROOT, OUT_REL);
const VW = 1389, VH = 800;          // our viewport == Fusion's app area in the captures
const REF_TOP = 22;                 // Fusion app area starts at y=22 in the 1389x868 screen grabs
const PARK = { x: 1180, y: 640 };   // neutral mouse position (empty canvas, away from model / menus / HUDs)
const PARK_OFF = { x: 1010, y: 40 }; // off the canvas (blank tab row) -- no canvas prompts / hover

// design (mm) -- matches the reference: rectangle typed 20 (height) Tab 40 (width) from the first corner
const RW = 40, RH = 20, DEPTH = 10;
const C1 = [-26.1, -23.9, 0];       // first click (ref 08: lower-left corner)
const C2 = [35.0, 20.6, 0];         // cursor when the HUD shows 61.021 x 44.427 (ref 08)

// ---------------------------------------------------------------------------------------------------------
const h = await launch({
  outDir: "build/refshots", port: 5451, width: VW, height: VH, shots: OUT_REL,
  build: !args.includes("--no-build"), headless: !args.includes("--headed"), timeout: 120000,
});
const page = h.page;
fs.mkdirSync(OUT, { recursive: true });
const cpage = await h.browser.newPage({ viewport: { width: 400, height: 300 } }); // compositing scratch page

const results = [];
let notes = [];
const note = (s) => { notes.push(s); console.log(`    note: ${s}`); };

// ------------------------------------------------------------------ small UI helpers
const frames = (n = 3) => h.frames(n);
const settle = (ms = 250) => page.waitForTimeout(ms);
const appEval = (fn, arg) => page.evaluate(fn, arg);
async function cameraStable(timeout = 3000) {
  return page.evaluate((timeout) => new Promise((resolve) => {
    const t0 = performance.now();
    let last = null, still = 0;
    const tick = () => {
      const c = window.app.viewport && window.app.viewport.camera;
      const cur = c ? [...c.position.toArray(), ...c.quaternion.toArray(), c.zoom || 1].map((v) => v.toFixed(5)).join(",") : "";
      if (cur === last) still++; else still = 0;
      last = cur;
      if (still >= 6) return resolve(true);
      if (performance.now() - t0 > timeout) return resolve(false);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), timeout);
}
async function firstVisible(sel) {
  const loc = page.locator(sel);
  const n = await loc.count();
  for (let i = 0; i < n; i++) { const l = loc.nth(i); if (await l.isVisible().catch(() => false)) return l; }
  return null;
}
async function visible(sel) { return !!(await firstVisible(sel)); }
async function waitVisible(sel, timeout = 3000) {
  try { await page.locator(sel).first().waitFor({ state: "visible", timeout }); return true; } catch { return false; }
}
async function waitFn(fn, arg, timeout = 4000) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 50 }); return true; } catch { return false; }
}
/** Click the first visible match like a user (mouse moves there first). */
async function click(sel, o = {}) {
  const deadline = Date.now() + (o.timeout ?? 3000);
  while (Date.now() < deadline) {
    const l = await firstVisible(sel);
    if (l) {
      const b = await l.boundingBox();
      if (b) {
        const x = b.x + (o.fx ?? 0.5) * b.width, y = b.y + (o.fy ?? 0.5) * b.height;
        await page.mouse.move(x, y, { steps: 3 });
        await page.mouse.click(x, y, { button: o.button || "left" });
        await frames(2);
        return { x, y };
      }
    }
    await page.waitForTimeout(80);
  }
  return null;
}
async function hover(sel) {
  const l = await firstVisible(sel);
  const b = l && (await l.boundingBox());
  if (!b) return null;
  const x = b.x + Math.min(40, b.width / 2), y = b.y + b.height / 2;
  await page.mouse.move(x, y, { steps: 4 });
  await frames(2);
  return { x, y };
}
/** Tag the first visible element under `rootSel` whose own text matches `re`; returns its selector. */
async function tagByText(rootSel, re, tag) {
  const ok = await page.evaluate(({ rootSel, src, flags, tag }) => {
    const re = new RegExp(src, flags);
    document.querySelectorAll(`[data-rs="${tag}"]`).forEach((e) => e.removeAttribute("data-rs"));
    const roots = [...document.querySelectorAll(rootSel)];
    for (const r of roots) {
      const all = [r, ...r.querySelectorAll("*")].filter((e) => e.getClientRects().length && e.offsetParent !== null);
      // prefer the smallest element whose text matches, then climb to the clickable row
      const hits = all.filter((e) => re.test((e.innerText || e.textContent || "").trim()));
      hits.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
      const leaf = hits[0];
      if (leaf) {
        const row = leaf.closest("[data-cmd], [role=menuitem], li, .menu-item, button, tr, [data-node]") || leaf;
        row.setAttribute("data-rs", tag);
        return true;
      }
    }
    return false;
  }, { rootSel, src: re.source, flags: re.flags, tag });
  return ok ? `[data-rs="${tag}"]` : null;
}
async function park() { await page.mouse.move(PARK.x, PARK.y, { steps: 2 }); await frames(2); }
async function blur() { await page.evaluate(() => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); }); }
async function key(k) { await page.keyboard.press(k); await frames(2); }
async function escapeAll(n = 3) { for (let i = 0; i < n; i++) await page.keyboard.press("Escape"); await frames(3); }
/** World point -> page coords. */
async function toPage(p) {
  return page.evaluate((p) => {
    const vp = window.app.viewport;
    const r = vp.canvas.getBoundingClientRect();
    const s = vp.toScreen(p);
    return { x: r.left + s[0], y: r.top + s[1] };
  }, p);
}
/** First world point whose canvas pick satisfies pred (JS expression over `h`). */
async function aim(points, pred) {
  return page.evaluate(({ points, pred }) => {
    const vp = window.app.viewport;
    const r = vp.canvas.getBoundingClientRect();
    const test = new Function("h", `return (${pred});`); // eslint-disable-line no-new-func
    for (const p of points) {
      const s = vp.toScreen(p);
      if (!(s[0] >= 2 && s[1] >= 2 && s[0] <= r.width - 2 && s[1] <= r.height - 2)) continue;
      let hit = null;
      try { hit = vp.pick(s[0], s[1], { filter: (ref) => window.app.selection.accepts(ref) }); } catch { hit = null; }
      let ok = false;
      try { ok = !!test(hit); } catch { ok = false; }
      if (ok) return { x: r.left + s[0], y: r.top + s[1], world: p };
    }
    return null;
  }, { points, pred });
}
async function moveTo(x, y, steps = 6) { await page.mouse.move(x, y, { steps }); await frames(2); }
async function canvasClick(x, y, button = "left") {
  await page.mouse.move(x - 6, y - 4);
  await page.mouse.move(x, y, { steps: 4 });
  await frames(2);
  await page.mouse.click(x, y, { button });
  await frames(2);
}
const state = () => appEval(() => {
  const a = window.app;
  return {
    mode: a.mode, sketch: a.activeSketch, cmd: a.activeCommand ? a.activeCommand.id || "?" : null,
    features: a.doc.features.map((f) => f.type), bodies: a.bodies().length,
    sel: a.selection.items.map((r) => r.kind),
  };
});

// ------------------------------------------------------------------ document stages (built through the UI)
const CHAIN = ["empty", "planepick", "sketch", "rectdrag", "rect", "finished", "extrude0", "extrude10", "box"];
let current = null;

const STAGES = {
  async empty() {
    await park();
    await escapeAll(3);
    await appEval(() => {
      const a = window.app;
      try { if (a.activeCommand && a.activeCommand.cancel) a.activeCommand.cancel(); } catch { /* ignore */ }
      try { if (a.mode === "sketch") a.commands.run("SketchStop"); } catch { /* ignore */ }
      try { if (a.endPreview) a.endPreview(); } catch { /* ignore */ }
      a.newDocument("Untitled");
      a.selection.clear();
      a.viewport.setView("home", { animate: false });
    });
    await cameraStable(2500);
    await escapeAll(1);
    await park();
  },
  async planepick() {
    const ok = await click('#toolbar [data-cmd="SketchCreate"]');
    if (!ok) throw new Error("no visible Create Sketch button");
    await waitFn(() => { const g = window.app.viewport.groups.origin; let v = 0; g.traverse((o) => { if (o.visible && o.isMesh) v++; }); return v > 0; }, null, 3000);
    await cameraStable(2500);
    // ref 05 shows no cursor prompt: the mouse is still up in the toolbar, not over the canvas
    await page.mouse.move(PARK_OFF.x, PARK_OFF.y, { steps: 3 });
    await frames(2);
  },
  async sketch() {
    // Fusion's capture 06 hovers the XY square near world (24, 14); click it there (or wherever our XY plane is)
    const cands = [[24, 14, 0], [20, 12, 0], [14, 14, 0], [10, 10, 0], [30, 20, 0], [6, 6, 0], [40, 30, 0], [60, 40, 0], [-20, -20, 0]];
    let a = null;
    for (let i = 0; i < 5 && !a; i++) { a = await aim(cands, "h && h.ref && h.ref.kind === 'originPlane' && h.ref.name === 'XY'"); if (!a) await settle(300); }
    if (!a) { const p = await toPage([20, 12, 0]); a = { ...p, world: [20, 12, 0] }; note("XY plane not pickable; clicked world (20,12,0) anyway"); }
    await canvasClick(a.x, a.y);
    const ok = await waitFn(() => window.app.mode === "sketch" && !!window.app.activeSketch, null, 6000);
    if (!ok) throw new Error("clicking the XY plane did not enter the sketch");
    await cameraStable(3500);
    await settle(150);
    await park();
  },
  async rectdrag() {
    await blur();
    await park();
    await key("r");
    const p1 = await toPage(C1), p2 = await toPage(C2);
    // Fusion placed this corner off-grid (HUD 61.021 x 44.427 in ref 08) while our sketch grid-snaps clicks to
    // the 10 mm grid; hold Ctrl (our "no snap" modifier) so the rectangle lands where the reference has it.
    await page.keyboard.down("Control");
    try {
      await canvasClick(p1.x, p1.y);
      await page.mouse.move(p2.x, p2.y, { steps: 10 });
      await frames(3);
    } finally {
      await page.keyboard.up("Control");
    }
    await frames(2);
    if (!(await visible(".sk-input"))) note("no HUD input (.sk-input) while dragging the rectangle");
  },
  async rect() {
    // Fusion focuses the HEIGHT box first (ref 08); Tab moves to the width
    await page.keyboard.type(String(RH), { delay: 20 });
    await key("Tab");
    await page.keyboard.type(String(RW), { delay: 20 });
    await key("Enter");
    await settle(200);
    const lines = await appEval(() => Object.values(window.app.feature(window.app.activeSketch)?.sk?.curves || {}).filter((c) => c.type === "line").length);
    if (lines < 4) {
      const p2 = await toPage(C2);
      await canvasClick(p2.x, p2.y);
      note("rectangle needed a click after typing the dimensions");
    }
    await key("Escape"); // end the rectangle tool (ref 09: no Feature Options in the palette)
    await settle(120);
    await park();
  },
  async finished() {
    const ok = await click('#toolbar [data-cmd="SketchStop"]');
    if (!ok) throw new Error("no visible Finish Sketch button");
    if (!(await waitFn(() => window.app.mode === "model", null, 4000))) throw new Error("Finish Sketch did not return to model mode");
    await cameraStable(3500);
    await park();
  },
  async extrude0() {
    await blur();
    await park();
    await key("e");
    if (!(await waitVisible('.dlg[data-dialog="Extrude"]', 3000))) throw new Error("E did not open the Extrude dialog");
    await settle(350);
  },
  async extrude10() {
    const focus = await appEval(() => { const a = document.activeElement; return !!a && a.tagName === "INPUT"; });
    if (!focus) {
      const d = await firstVisible('.dlg[data-dialog="Extrude"] [data-input="distance"]');
      if (d) await d.click();
      note("distance box was not focused on start; clicked it");
    }
    await page.keyboard.press("Control+A");
    await page.keyboard.type("10", { delay: 20 });
    await key("Tab");
    await settle(350);
  },
  async box() {
    const ok = await click('.dlg[data-dialog="Extrude"] [data-action="ok"]');
    if (!ok) throw new Error("no Extrude OK button");
    await waitFn(() => !window.app.activeCommand, null, 4000);
    const s = await state();
    if (s.bodies !== 1) throw new Error(`expected 1 body after Extrude, got ${s.bodies}`);
    await settle(200);
    await park();
  },
};

async function ensure(target) {
  const ti = CHAIN.indexOf(target);
  let ci = CHAIN.indexOf(current);
  if (ci < 0 || ci > ti) { await STAGES.empty(); current = "empty"; ci = 0; }
  for (let i = ci + 1; i <= ti; i++) {
    current = "dirty";
    await STAGES[CHAIN[i]]();
    current = CHAIN[i];
  }
}

// ------------------------------------------------------------------ reusable acts
const extrudeId = () => appEval(() => (window.app.doc.features.find((f) => f.type === "extrude") || {}).id);
const bodyId = () => appEval(() => (window.app.bodies()[0] || {}).id);
async function expandBodies() {
  const b = await bodyId();
  if (!b) return null;
  const sel = `#browser-host [data-node="body:${b}"]`;
  if (!(await visible(sel))) {
    const tw = await firstVisible('#browser-host [data-node^="bodies"] > .br-twisty');
    if (tw) { await tw.click(); await frames(3); }
  }
  if (!(await visible(sel))) note("Body1 row not visible in the browser after expanding Bodies");
  return sel;
}
async function openModifyDropdown() {
  const ok = await click('#toolbar [data-panel="SolidModifyPanel"]');
  if (!ok || !(await waitVisible('#overlay [data-cmd="ChangeParameterCommand"]', 2000))) note("MODIFY dropdown did not open");
}
async function openParameters() {
  await expandBodies();
  await openModifyDropdown();
  const ok = await click('#overlay [data-cmd="ChangeParameterCommand"]');
  if (!ok) note("Change Parameters item not clickable");
  await settle(300);
  if (!(await visible(".pm-dialog"))) note("Parameters dialog (.pm-dialog) not visible");
}
async function paramsGroupToggle(labelRe) {
  const sel = await page.evaluate((src) => {
    const re = new RegExp(src);
    document.querySelectorAll("[data-rs=\"pmgroup\"]").forEach((e) => e.removeAttribute("data-rs"));
    const tr = [...document.querySelectorAll(".pm-dialog tr.pm-group")].find((r) => r.offsetParent && re.test((r.innerText || "").trim()));
    if (!tr) return null;
    tr.setAttribute("data-rs", "pmgroup");
    return true;
  }, labelRe.source);
  return sel ? '[data-rs="pmgroup"]' : null;
}
async function expandParamsGroup(labelRe) {
  const s = await paramsGroupToggle(labelRe);
  if (!s) { note(`parameters tree row ${labelRe} not found`); return; }
  const collapsed = await appEval(() => document.querySelector('[data-rs="pmgroup"]').classList.contains("pm-collapsed"));
  if (collapsed) await click('[data-rs="pmgroup"] .pm-tog');
  await settle(150);
}
async function openDisplayMenu() {
  const ok = await click('#navbar-host [data-cmd="ViewDisplayCommand"]');
  await settle(200);
  if (!ok) note("nav bar Display Settings button not found");
}
/** Actual rectangle bounds in the sketch (our sketch snaps the clicked corner to the grid, so it can differ
 *  from C1 by ~1 mm). Read-only state query; falls back to the nominal design. */
async function rectBounds() {
  const b = await appEval(() => {
    const a = window.app;
    const f = a.doc.features.find((x) => x.type === "sketch");
    if (!f) return null;
    const lines = Object.values(f.sk.curves).filter((c) => c.type === "line" && !c.cons);
    const ids = new Set(lines.flatMap((c) => [c.p1, c.p2]));
    const st = a.sketchState(f.id);
    const pts = (st && st.sk ? st.sk.points : f.sk.points);
    const xs = [...ids].map((i) => pts[i].x), ys = [...ids].map((i) => pts[i].y);
    return xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } : null;
  });
  return b || { x0: C1[0], x1: C1[0] + RW, y0: C1[1], y1: C1[1] + RH };
}
async function fusionEdgeAim() {
  // back top edge (max y, z = 10) near its middle -- where the reference capture clicked
  const r = await rectBounds();
  const pts = [];
  for (const u of [0.5, 0.55, 0.45, 0.6, 0.4, 0.65, 0.35]) pts.push([r.x0 + (r.x1 - r.x0) * u, r.y1, DEPTH]);
  return aim(pts, "h && h.ref && h.ref.kind === 'edge'");
}

// ------------------------------------------------------------------ reference states
// crop: zoomed refs only. {x,y,w,h} in OUR app coordinates (= ref screen coords - 22), or {el, pad} for an
// element's bounding box. Rectangles were measured from the zoom against the matching full-frame capture.
const STATES = [
  { name: "01-empty-design", base: "empty" },
  { name: "02-toolbar-left-zoom", base: "empty", crop: { x: 0, y: 1.5, w: 701, h: 111 } },
  { name: "03-toolbar-right-zoom", base: "empty", crop: { x: 691, y: 1.4, w: 698, h: 111 } },
  {
    name: "04-create-dropdown", base: "empty",
    async act() {
      const ok = await click('#toolbar [data-panel="SolidCreatePanel"]');
      await settle(200);
      if (!ok || !(await visible('#overlay [data-cmd="Extrude"]'))) note("CREATE dropdown did not open");
    },
    cleanup: () => escapeAll(2),
  },
  { name: "05-create-sketch-plane-pick", base: "planepick" },
  {
    name: "06-origin-planes-hover-zoom", base: "planepick", crop: { x: 600, y: 298, w: 280, h: 190 },
    async act() {
      const cands = [[24, 14, 0], [20, 12, 0], [16, 10, 0], [12, 8, 0], [8, 6, 0], [30, 18, 0], [40, 24, 0]];
      const a = await aim(cands, "h && h.ref && h.ref.kind === 'originPlane' && h.ref.name === 'XY'");
      if (!a) { note("XY plane not under any candidate point; hovered world (24,14,0)"); const p = await toPage([24, 14, 0]); await moveTo(p.x, p.y); }
      else await moveTo(a.x, a.y);
      await settle(400);
    },
    cleanup: park,
  },
  { name: "07-sketch-mode-palette", base: "sketch" },
  { name: "08-rect-hud-inputs", base: "rectdrag", info: "first corner Ctrl-clicked (our sketch grid-snaps it to (-30,-20); Fusion's ref is off-grid)" },
  { name: "09-rect-dimensioned", base: "rect" },
  { name: "10-rect-dims-zoom", base: "rect", crop: { x: 481, y: 418, w: 319, h: 200 } },
  {
    name: "11-marking-menu-sketch", base: "rect",
    async act() {
      await moveTo(899, 578);
      await page.mouse.click(899, 578, { button: "right" });
      await settle(300);
      if (!(await visible(".mm-root"))) note("marking menu (.mm-root) did not open");
    },
    cleanup: async () => { await escapeAll(1); await park(); },
  },
  { name: "12-after-finish-sketch", base: "finished" },
  { name: "13-extrude-dialog", base: "extrude0" },
  { name: "14-extrude-preview", base: "extrude10" },
  { name: "15-extrude-preview-zoom", base: "extrude10", crop: { x: 518, y: 326, w: 404, h: 233 } },
  { name: "16-after-extrude", base: "box" },
  {
    name: "17-fillet-dialog", base: "box",
    async act() {
      await blur();
      await park();
      await key("f");
      if (!(await waitVisible('.dlg[data-dialog="FusionFilletEdgesCommand"]', 3000))) { note("F did not open the Fillet dialog"); return; }
      const a = await fusionEdgeAim();
      if (!a) { note("back top edge not pickable"); return; }
      await canvasClick(a.x, a.y);
      await settle(350);
      const sel = await appEval(() => {
        const d = document.querySelector('.dlg[data-dialog="FusionFilletEdgesCommand"]');
        const txt = d ? d.textContent + " " + [...d.querySelectorAll("input")].map((x) => x.value).join(" ") : "";
        return window.app.selection.ofKind("edge").length > 0 || /\b1\s*Edges?\b/i.test(txt) ? true : txt.replace(/\s+/g, " ").slice(0, 120);
      });
      if (sel !== true) note(`edge not selected (dialog: ${sel})`);
    },
    cleanup: async () => { await escapeAll(3); await park(); },
  },
  {
    name: "18-hole-dialog", base: "box",
    act: holeAct,
    cleanup: async () => { await escapeAll(3); await park(); },
  },
  {
    name: "19-hole-dialog-zoom", base: "box", crop: { el: '.dlg[data-dialog="FusionHoleCommand"]', pad: 2 },
    info: "crop = our Hole dialog, wheel-scrolled to its end like the ref",
    async act() {
      await holeAct();
      // ref 19 shows the dialog scrolled to its end (Objects To Cut, OK/Cancel): wheel over the dialog body
      const d = await firstVisible('.dlg[data-dialog="FusionHoleCommand"]');
      const b = d && (await d.boundingBox());
      if (b) {
        await moveTo(b.x + b.width * 0.6, b.y + b.height * 0.55, 3);
        await page.mouse.wheel(0, 600);
        await settle(250);
        const sc = await appEval(() => { const e = [...document.querySelectorAll('.dlg[data-dialog="FusionHoleCommand"] *')].find((x) => x.scrollHeight > x.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(x).overflowY)); return e ? e.scrollTop : -1; });
        if (sc <= 0) note("hole dialog did not scroll (content fits or no scroll container)");
      }
    },
    cleanup: async () => { await escapeAll(3); await park(); },
  },
  {
    name: "20-s-toolbox", base: "box",
    async act() {
      await blur();
      await moveTo(985, 611);
      await key("s");
      await settle(250);
      if (!(await visible(".tbx-root"))) note("S did not open the toolbox");
    },
    cleanup: async () => { await escapeAll(2); await park(); },
  },
  {
    name: "21-s-toolbox-search", base: "box", crop: { x: 880, y: 498, w: 368, h: 258 },
    async act() {
      await blur();
      await moveTo(985, 611);
      await key("s");
      await settle(200);
      if (!(await visible(".tbx-root"))) { note("S did not open the toolbox"); return; }
      const focused = await appEval(() => document.activeElement && document.activeElement.classList.contains("tbx-input"));
      if (!focused) { await click(".tbx-root input"); note("toolbox search was not focused; clicked it"); }
      await page.keyboard.type("ext", { delay: 40 });
      await settle(250);
    },
    cleanup: async () => { await escapeAll(3); await park(); },
  },
  {
    name: "22-timeline-context-menu", base: "box",
    async act() {
      const id = await extrudeId();
      const ok = await click(`#timeline [data-feature="${id}"]`, { button: "right" });
      await settle(250);
      if (!ok) note("timeline Extrude item not found");
      else if (!(await tagByText("#overlay", /^Roll Timeline Marker Here$/, "roll"))) note("timeline context menu did not open");
    },
    cleanup: async () => { await escapeAll(3); await appEval(() => window.app.selection.clear()); await park(); },
  },
  {
    name: "23-display-settings-menu", base: "box",
    act: openDisplayMenu,
    cleanup: async () => { await escapeAll(2); await park(); },
  },
  {
    name: "24-visual-style-menu", base: "box", crop: { x: 719, y: 356, w: 672, h: 372 },
    async act() {
      await openDisplayMenu();
      const s = await tagByText("#overlay", /^Visual Style$/, "vs");
      if (!s || !(await hover(s))) note("Visual Style item not found");
      await settle(350);
    },
    cleanup: async () => { await escapeAll(3); await park(); },
  },
  {
    name: "25-environment-menu", base: "box", crop: { x: 719, y: 356, w: 672, h: 372 },
    async act() {
      await openDisplayMenu();
      const s = await tagByText("#overlay", /^Environment$/, "env");
      if (!s || !(await hover(s))) note("Environment item not found");
      await settle(350);
    },
    cleanup: async () => { await escapeAll(3); await park(); },
  },
  { name: "26-viewcube-zoom", base: "box", crop: { el: "#viewcube-host canvas", w: 148, h: 119, dx: 3, dy: 2 }, info: "crop centred on our ViewCube" },
  {
    name: "27-browser-body-context-menu", base: "box",
    async act() {
      const sel = await expandBodies();
      if (!sel) { note("no body"); return; }
      const ok = await click(`${sel} .br-label`, { button: "right" });
      await settle(250);
      if (!ok) note("Body1 row not clickable");
      else if (!(await tagByText("#overlay", /^Physical Material$/, "pm"))) note("body context menu did not open");
    },
    cleanup: async () => { await escapeAll(3); await appEval(() => window.app.selection.clear()); await park(); },
  },
  {
    name: "28-modify-dropdown", base: "box",
    async act() {
      const sel = await expandBodies();
      if (sel) await click(`${sel} .br-label`);
      if (!(await appEval(() => window.app.selection.ofKind("body").length))) note("Body1 not selected by the browser click");
      await openModifyDropdown();
      await settle(150);
    },
    cleanup: async () => { await escapeAll(3); await appEval(() => window.app.selection.clear()); await park(); },
  },
  {
    name: "29-parameters-dialog", base: "box",
    act: openParameters,
    cleanup: closeParameters,
  },
  {
    name: "30-parameters-expanded", base: "box",
    async act() {
      await openParameters();
      await expandParamsGroup(/^\(?Unsaved\)?|^Untitled/);
      const s = await paramsGroupToggle(/^Sketch1$/);
      if (s) await click(s, { fx: 0.3 }); else note("Sketch1 row not found in the parameters tree");
      await settle(200);
    },
    cleanup: closeParameters,
  },
  {
    name: "31-parameters-zoom", base: "box", crop: { el: ".pm-dialog", pad: 1 }, info: "crop = our Parameters dialog",
    async act() {
      await openParameters();
      await expandParamsGroup(/^\(?Unsaved\)?|^Untitled/);
      const s = await paramsGroupToggle(/^Sketch1$/);
      if (s) await click(s, { fx: 0.3 }); else note("Sketch1 row not found in the parameters tree");
      await expandParamsGroup(/^Sketch1$/);
      await settle(200);
    },
    cleanup: closeParameters,
  },
  {
    name: "32-marking-menu-model", base: "box",
    async act() {
      const last = await appEval(() => { const l = window.app.commands.lastRepeatable; return l && (l.id || l); });
      if (last !== "ChangeParameterCommand") { await openParameters(); await closeParameters(); }
      await expandBodies();
      await moveTo(999, 478);
      await page.mouse.click(999, 478, { button: "right" });
      await settle(300);
      if (!(await visible(".mm-root"))) note("marking menu (.mm-root) did not open");
    },
    cleanup: async () => { await escapeAll(2); await park(); },
  },
  {
    name: "33-file-menu", base: "box",
    async act() {
      await expandBodies();
      const ok = await click('#appbar [data-menu="file"]');
      await settle(250);
      if (!ok) note("File menu button not found");
      else if (!(await tagByText("#overlay", /^Export/, "exp"))) note("File menu did not open");
    },
    cleanup: async () => { await escapeAll(2); await park(); },
  },
];

async function holeAct() {
  await blur();
  await park();
  await key("h");
  if (!(await waitVisible('.dlg[data-dialog="FusionHoleCommand"]', 3000))) { note("H did not open the Hole dialog"); return; }
  // the reference clicks the top face right next to the middle of its front edge (min y)
  const r = await rectBounds();
  const x = (r.x0 + r.x1) / 2, y = r.y0, z = DEPTH;
  const pts = [[x, y + 1.2, z], [x, y + 2, z], [x, y + 3, z], [x + 2, y + 4, z], [x, (r.y0 + r.y1) / 2, z]];
  const a = await aim(pts, "h && h.ref && h.ref.kind === 'face' && Math.abs(h.ref.n[2] - 1) < 1e-3");
  if (!a) { note("top face not pickable near the front edge"); return; }
  await canvasClick(a.x, a.y);
  await settle(450);
  // the reference cursor rests just right of the hole centre (its tooltip starts at ~x+25)
  await moveTo(a.x + 6, a.y + 2, 2);
  await settle(200);
}
async function closeParameters() {
  const ok = await click('.pm-dialog [data-action="ok"]', { timeout: 800 });
  if (!ok) await escapeAll(2);
  await settle(200);
  if (await visible(".pm-dialog")) { await escapeAll(2); }
  await appEval(() => window.app.selection.clear());
  await park();
}

// ------------------------------------------------------------------ composite
const jpegSize = (b) => {
  let o = 2;
  while (o < b.length) {
    if (b[o] !== 0xff) { o++; continue; }
    const m = b[o + 1], len = b.readUInt16BE(o + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(o + 7), h: b.readUInt16BE(o + 5) };
    o += 2 + len;
  }
  return null;
};

async function cropRect(st, refW, refH) {
  const c = st.crop;
  let r;
  if (c.el) {
    const b = await page.evaluate((s) => { const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, c.el);
    if (!b) { note(`crop element ${c.el} not found; used the full screenshot`); return { x: 0, y: 0, w: VW, h: VH }; }
    if (c.w) {
      const cx = b.x + b.w / 2 + (c.dx || 0), cy = b.y + b.h / 2 + (c.dy || 0);
      r = { x: cx - c.w / 2, y: cy - c.h / 2, w: c.w, h: c.h };
    } else {
      const p = c.pad || 0;
      r = { x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p };
    }
  } else r = { ...c };
  // match the reference aspect ratio by growing the short side around the centre
  const ar = refW / refH;
  if (r.w / r.h < ar) { const nw = r.h * ar; r.x -= (nw - r.w) / 2; r.w = nw; } else if (r.w / r.h > ar) { const nh = r.w / ar; r.y -= (nh - r.h) / 2; r.h = nh; }
  return r;
}

async function composite(st, oursBuf) {
  const refFile = path.join(REFS, `${st.name}.jpg`);
  if (!fs.existsSync(refFile)) { note(`reference ${refFile} missing; pair not written`); return false; }
  const refBuf = fs.readFileSync(refFile);
  const sz = jpegSize(refBuf) || { w: VW, h: 868 };
  const full = !st.crop;
  let refRect, oursRect, dispW, dispH;
  if (full) {
    refRect = { x: 0, y: REF_TOP, w: VW, h: VH };
    oursRect = { x: 0, y: 0, w: VW, h: VH };
    dispW = Math.round(VW * 0.5); dispH = Math.round(VH * 0.5);
  } else {
    refRect = { x: 0, y: 0, w: sz.w, h: sz.h };
    oursRect = await cropRect(st, sz.w, sz.h);
    const s = Math.min(400 / sz.h, 700 / sz.w);
    dispW = Math.round(sz.w * s); dispH = Math.round(sz.h * s);
  }
  const b64 = await cpage.evaluate(async (o) => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("image load failed")); i.src = src; });
    const [ri, oi] = await Promise.all([load(o.ref), load(o.ours)]);
    const LH = 20, GAP = 6;
    const c = document.createElement("canvas");
    c.width = o.dispW * 2 + GAP; c.height = o.dispH + LH;
    const g = c.getContext("2d");
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    const draw = (img, r, dx) => {
      // clip the source rect to the image and map the visible part proportionally
      const sx0 = Math.max(0, r.x), sy0 = Math.max(0, r.y), sx1 = Math.min(img.width, r.x + r.w), sy1 = Math.min(img.height, r.y + r.h);
      if (sx1 <= sx0 || sy1 <= sy0) return;
      const kx = o.dispW / r.w, ky = o.dispH / r.h;
      g.drawImage(img, sx0, sy0, sx1 - sx0, sy1 - sy0, dx + (sx0 - r.x) * kx, LH + (sy0 - r.y) * ky, (sx1 - sx0) * kx, (sy1 - sy0) * ky);
    };
    draw(ri, o.refRect, 0);
    draw(oi, o.oursRect, o.dispW + GAP);
    g.fillStyle = "#3a3a3a"; g.fillRect(o.dispW, 0, GAP, c.height);
    g.fillStyle = "#222222"; g.fillRect(0, 0, c.width, LH);
    g.font = "bold 12px Segoe UI, Arial, sans-serif"; g.textBaseline = "middle"; g.fillStyle = "#ffffff";
    g.fillText(o.labelL, 6, LH / 2 + 1);
    g.fillText(o.labelR, o.dispW + GAP + 6, LH / 2 + 1);
    return c.toDataURL("image/png").split(",")[1];
  }, {
    ref: `data:image/jpeg;base64,${refBuf.toString("base64")}`,
    ours: `data:image/png;base64,${oursBuf.toString("base64")}`,
    refRect, oursRect, dispW, dispH,
    labelL: `FUSION (reference) ${st.name}${full ? "  [y 22..822]" : "  [zoom]"}`,
    labelR: `OURS ${st.name}${full ? "" : `  [crop ${Math.round(oursRect.x)},${Math.round(oursRect.y)} ${Math.round(oursRect.w)}x${Math.round(oursRect.h)}]`}`,
  });
  fs.writeFileSync(path.join(OUT, `${st.name}.pair.png`), Buffer.from(b64, "base64"));
  return true;
}

// ------------------------------------------------------------------ run
const t0 = Date.now();
const errs0 = h.errors.length;
try {
  for (const st of STATES) {
    if (ONLY.length && !ONLY.some((p) => st.name.startsWith(p))) continue;
    notes = [];
    const ts = Date.now();
    console.log(`- ${st.name}  (base: ${st.base})`);
    let failed = false;
    try {
      await ensure(st.base);
    } catch (e) {
      failed = true;
      note(`could not reach stage "${st.base}": ${String(e.message || e).slice(0, 160)}`);
    }
    if (!failed && st.act) {
      try { await st.act(); } catch (e) { note(`act failed: ${String(e.message || e).slice(0, 160)}`); }
    }
    await frames(4);
    const oursBuf = await page.screenshot({ type: "png" });
    fs.writeFileSync(path.join(OUT, `${st.name}.ours.png`), oursBuf);
    try { await composite(st, oursBuf); } catch (e) { note(`composite failed: ${String(e.message || e).slice(0, 160)}`); }
    if (st.cleanup) {
      try { await st.cleanup(); } catch (e) { note(`cleanup failed: ${String(e.message || e).slice(0, 120)}`); current = "dirty"; }
      // anything left open (dialog, sketch, menu) means the stage is no longer trustworthy
      const s = await state().catch(() => null);
      const menuOpen = await visible(".mm-root, .tbx-root, .pm-dialog");
      if (!s || s.cmd || (current === "box" && (s.mode !== "model" || s.bodies !== 1 || s.features.length !== 2)) || menuOpen) {
        current = "dirty";
      }
    }
    results.push({ name: st.name, notes: [...notes], info: st.info || "", ms: Date.now() - ts });
  }
} finally {
  const newErrs = h.errors.slice(errs0).filter((e) => !/favicon|DevTools/i.test(e));
  await h.close();
  console.log(`\n${results.length} pairs in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${OUT_REL}/`);
  if (newErrs.length) console.log(`page errors (${newErrs.length}):\n  ${newErrs.slice(0, 5).map((e) => e.split("\n")[0]).join("\n  ")}`);
  for (const r of results) console.log(`${r.name}: ${r.notes.length ? r.notes.join("; ") : "ok"}${r.info ? ` (${r.info})` : ""}`);
}
