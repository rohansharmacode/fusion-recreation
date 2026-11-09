// Browser + timeline e2e test.
//   node tests/e2e/browser-timeline.mjs [--only=viewport,browser,timeline] [--headed] [--verbose]
// Builds a small model through the App API (sketch -> extrude -> fillet -> plane -> hole), then
// drives the BROWSER and TIMELINE through the DOM like a user would and checks the document.
import { launch } from "./harness.mjs";

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").slice(k.length + 3);
const only = arg("only") === "all" ? undefined : arg("only") || "viewport,browser,timeline"; // --only=all: every module
const h = await launch({
  only, outDir: arg("out") || "build/fid-browser-timeline", port: Number(arg("port")) || 5333, shots: "tests/e2e/out/browser-timeline",
  width: 1389, height: 795,
  headless: !process.argv.includes("--headed"), verbose: process.argv.includes("--verbose"),
});
const { page } = h;
let fails = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!ok) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const box = async (sel) => {
  // the panels re-render on the next animation frame after a change: retry briefly
  for (let i = 0; i < 8; i++) { const b = await page.locator(sel).first().boundingBox().catch(() => null); if (b) return b; await sleep(60); }
  throw new Error(`no box for ${sel}`);
};
const center = async (sel) => { const b = await box(sel); return [b.x + b.width / 2, b.y + b.height / 2]; };
const browserShot = async (name) => {
  const b = await box(".br-panel");
  await h.shot(name, { clip: { x: Math.max(0, b.x - 4), y: Math.max(0, b.y - 4), width: Math.min(560, b.width + 120), height: Math.min(860, b.height + 8) } });
};
const timelineShot = async (name, extraTop = 0) => {
  const b = await box("#timeline");
  await h.shot(name, { clip: { x: 0, y: b.y - extraTop, width: Math.min(900, b.width), height: b.height + extraTop } });
};
const toasts = () => page.evaluate(() => [...document.querySelectorAll(".toast")].map((t) => t.textContent));

try {
  // ------------------------------------------------------------------ model
  const ids = await page.evaluate(() => {
    const { S, K } = app;
    const sk = S.newSketch();
    S.addRect2pt(sk, [-20, -12], [20, 12]);
    const s1 = app.addFeature({ type: "sketch", plane: K.ORIGIN_PLANES.XY, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
    const reg = app.sketchState(s1.id).regions.regions[0];
    const e1 = app.addFeature({ type: "extrude", profiles: [{ sketch: s1.id, key: reg.key, c: reg.centroid }], distance: "15 mm", dirType: "one", operation: "new" });
    const body = app.bodies()[0];
    const tops = body.shape.edges.map((e) => K.edgeMid(e)).filter((p) => Math.abs(p[2] - 15) < 1e-6);
    const f1 = app.addFeature({ type: "fillet", edges: [{ body: body.id, p: tops[0] }], radius: "3 mm", tangentChain: true });
    const c1 = app.addFeature({ type: "cplane", mode: "offset", base: { kind: "origin", name: "XY" }, offset: "30 mm" });
    const h1 = app.addFeature({ type: "hole", placement: "face", points: [[8, 0, 15]], normal: [0, 0, 1], diameter: "5 mm", depth: "10 mm", extent: "distance", holeType: "simple" });
    const sk2 = S.newSketch();
    S.addCircle(sk2, S.addPoint(sk2, 0, 0), 4);
    const s2 = app.addFeature({ type: "sketch", plane: K.ORIGIN_PLANES.XZ, planeRef: { kind: "origin", name: "XZ" }, sk: sk2 });
    const r = app.result.results;
    return { s1: s1.id, e1: e1.id, f1: f1.id, c1: c1.id, h1: h1.id, s2: s2.id, body: body.id, ok: [s1, e1, f1, c1, h1, s2].map((f) => !!(r[f.id] && r[f.id].ok)) };
  });
  check("model builds (sketch, extrude, fillet, plane, hole, sketch)", ids.ok.every(Boolean), JSON.stringify(ids.ok));
  await h.frames(4);
  await sleep(200);
  await h.shot("01-initial");

  // ------------------------------------------------------------------ browser structure
  // Fusion opens a design with the root and Document Settings expanded and every other folder closed
  const openState = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".br-row[aria-expanded]")].map((r) => [r.dataset.node, r.getAttribute("aria-expanded")])));
  check("default expansion (root + Document Settings open, folders closed)", openState["doc:root"] === "true" && openState["settings:root"] === "true" && openState["bodies:root"] === "false" && openState["sketches:root"] === "false" && openState["origin:root"] === "false", JSON.stringify(openState));
  const look = await page.evaluate(() => { const p = document.querySelector(".br-panel"); const cs = getComputedStyle(p); return { bg: cs.backgroundColor, border: cs.borderTopWidth, shadow: cs.boxShadow, rowH: document.querySelector(".br-row").getBoundingClientRect().height }; });
  check("browser floats transparently (no panel box)", /rgba\(0, 0, 0, 0\)|transparent/.test(look.bg) && look.border === "0px" && look.shadow === "none" && look.rowH === 23, JSON.stringify(look));
  const docSettings = await page.evaluate(() => [...document.querySelectorAll('[data-node="settings:root"] + .br-children .br-label')].map((e) => e.textContent));
  check("Document Settings lists Units: mm, g and Part Design", docSettings.join("|") === "Units: mm, g|Part Design", docSettings.join("|"));
  for (const k of ["bodies:root", "sketches:root", "construction:root"]) await page.click(`[data-node="${k}"] .br-twisty`);
  await sleep(80);
  const nodes = await page.evaluate(() => [...document.querySelectorAll(".br-row")].map((r) => r.dataset.node));
  for (const k of ["doc:root", "settings:root", "namedviews:root", "origin:root", "bodies:root", `body:${ids.body}`, "sketches:root", `sketch:${ids.s1}`, `sketch:${ids.s2}`, "construction:root", `cplane:${ids.c1}`]) {
    check(`browser row ${k}`, nodes.includes(k));
  }
  const rootLabel = await page.locator('[data-node="doc:root"] .br-label').textContent();
  check("root label reads (Unsaved) before the first save", rootLabel === "(Unsaved)", rootLabel);
  const savedLabel = await page.evaluate(async () => { app.doc.name = "Bracket"; app.doc.savedVersion = 3; app.emit("file", { action: "save" }); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const t = document.querySelector('[data-node="doc:root"] .br-label').textContent; app.doc.name = "Untitled"; app.doc.savedVersion = 0; app.emit("file", {}); return t; });
  check("root label shows Name vN once saved", savedLabel === "Bracket v3", savedLabel);
  await browserShot("02-browser");
  await timelineShot("03-timeline");
  const tlCount = await page.locator(".tl-item").count();
  check("timeline shows 6 features", tlCount === 6, String(tlCount));
  check("timeline marker at end", await page.evaluate(() => { const m = document.querySelector(".tl-marker"); return !!m && !m.nextElementSibling; }));

  // expand Named Views / Origin (Document Settings is open already)
  await page.click('[data-node="namedviews:root"] .br-twisty');
  await page.click('[data-node="origin:root"] .br-twisty');
  await sleep(100);
  const nodes2 = await page.evaluate(() => [...document.querySelectorAll(".br-row")].map((r) => r.dataset.node));
  check("units row", nodes2.includes("units:root"));
  check("named views TOP/FRONT/RIGHT/HOME", ["view:top", "view:front", "view:right", "view:home"].every((k) => nodes2.includes(k)));
  check("origin items O X Y Z XY XZ YZ", ["originPoint:O", "originAxis:X", "originAxis:Y", "originAxis:Z", "originPlane:XY", "originPlane:XZ", "originPlane:YZ"].every((k) => nodes2.includes(k)));
  await browserShot("04-browser-expanded");

  // origin eye
  await page.click('[data-node="origin:root"] .br-eye');
  check("origin eye shows origin", await page.evaluate(() => app.doc.origin.visible === true));
  await page.click('[data-node="origin:root"] .br-eye');
  check("origin eye hides origin", await page.evaluate(() => app.doc.origin.visible === false));

  // origin item hover/select
  await page.hover('[data-node="originPlane:XY"] .br-label');
  check("hover origin plane sets hover ref", await page.evaluate(() => app.selection.hover && app.selection.hover.kind === "originPlane" && app.selection.hover.name === "XY"));
  await page.click('[data-node="originPlane:XZ"] .br-label');
  check("click origin plane selects it", await page.evaluate(() => app.selection.items.length === 1 && app.selection.items[0].kind === "originPlane" && app.selection.items[0].name === "XZ"));

  // body eye toggles visibility + canvas
  const meshesBefore = await page.evaluate(() => app.viewport.groups.bodies.children.length);
  await page.click(`[data-node="body:${ids.body}"] .br-eye`);
  await h.frames(3);
  const vis1 = await page.evaluate((b) => ({ v: app.doc.bodies[b].visible, n: app.viewport.groups.bodies.children.length }), ids.body);
  check("body eye hides body", vis1.v === false && vis1.n < meshesBefore, JSON.stringify({ meshesBefore, ...vis1 }));
  await h.shot("05-body-hidden");
  await page.click(`[data-node="body:${ids.body}"] .br-eye`);
  check("body eye shows body", await page.evaluate((b) => app.doc.bodies[b].visible === true, ids.body));

  // sketch eye (display-only patch must not force a recompute of the following features)
  const t0 = Date.now();
  await page.click(`[data-node="sketch:${ids.s1}"] .br-eye`);
  const skVis = await page.evaluate((id) => app.feature(id).visible, ids.s1);
  check("sketch eye hides sketch", skVis === false, `${Date.now() - t0} ms`);
  const cacheOk = await page.evaluate(() => app.evaluator.cache.every((c, i) => c && c.id === app.doc.features[i].id && c.sig.startsWith(JSON.stringify(app.doc.features[i]))));
  check("evaluator cache still valid after visibility toggle", cacheOk);
  await page.click(`[data-node="sketch:${ids.s1}"] .br-eye`);

  // root eye hides everything in one undo step; folder label selects its contents
  const u0 = await page.evaluate(() => app.history.undoStack.length);
  await page.click('[data-node="doc:root"] .br-eye');
  check("root eye hides bodies, sketches and planes", await page.evaluate(() => Object.values(app.doc.bodies).every((b) => b.visible === false) && app.doc.features.filter((f) => f.type === "sketch" || f.type === "cplane").every((f) => f.visible === false) && app.history.undoStack.length));
  check("root eye is one undo step", await page.evaluate((u) => app.history.undoStack.length === u + 1, u0));
  await page.click('[data-node="doc:root"] .br-eye');
  await page.click('[data-node="sketches:root"] .br-label');
  check("Sketches folder click selects all sketches", await page.evaluate(() => app.selection.items.length === 2 && app.selection.items.every((r) => r.kind === "feature")));
  check("folder row shows selected", await page.locator('[data-node="sketches:root"].sel').count() === 1);
  await page.keyboard.press("Escape");

  // folder eye toggles all bodies
  await page.click('[data-node="bodies:root"] .br-eye');
  check("Bodies folder eye hides all bodies", await page.evaluate(() => Object.values(app.doc.bodies).every((b) => b.visible === false)));
  await page.click('[data-node="bodies:root"] .br-eye');
  check("Bodies folder eye shows all bodies", await page.evaluate(() => Object.values(app.doc.bodies).every((b) => b.visible !== false)));

  // click body row selects; hover sets hover
  await page.click(`[data-node="body:${ids.body}"] .br-label`);
  check("click body selects it", await page.evaluate((b) => app.selection.items.length === 1 && app.selection.items[0].kind === "body" && app.selection.items[0].body === b, ids.body));
  check("body row shows selected", await page.locator(`[data-node="body:${ids.body}"].sel`).count() === 1);
  await page.hover(`[data-node="body:${ids.body}"] .br-label`);
  check("hover body row sets hover", await page.evaluate((b) => app.selection.hover && app.selection.hover.kind === "body" && app.selection.hover.body === b, ids.body));
  await h.frames(3);
  await h.shot("06-body-selected");

  // rename body via double-click
  await page.dblclick(`[data-node="body:${ids.body}"] .br-label`);
  await page.waitForSelector(".br-rename", { timeout: 2000 });
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Base Plate");
  await page.keyboard.press("Enter");
  await sleep(80);
  check("rename body (double-click)", await page.evaluate((b) => app.doc.bodies[b].name === "Base Plate", ids.body));
  // F2 rename of the selected sketch
  await page.click(`[data-node="sketch:${ids.s2}"] .br-label`);
  await page.keyboard.press("F2");
  await page.waitForSelector(".br-rename", { timeout: 2000 });
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Pin Sketch");
  await page.keyboard.press("Enter");
  await sleep(80);
  check("rename sketch (F2)", await page.evaluate((id) => app.feature(id).name === "Pin Sketch", ids.s2));
  // Esc during rename cancels without clearing selection
  await page.keyboard.press("F2");
  await page.waitForSelector(".br-rename", { timeout: 2000 });
  await page.keyboard.type("zzz");
  await page.keyboard.press("Escape");
  await sleep(50);
  check("Esc cancels rename, keeps selection", await page.evaluate((id) => app.feature(id).name === "Pin Sketch" && app.selection.items.length === 1, ids.s2));

  // body context menu
  await page.click(`[data-node="body:${ids.body}"] .br-label`, { button: "right" });
  await page.waitForSelector(".br-ctx", { timeout: 2000 });
  const bodyMenu = await page.evaluate(() => [...document.querySelectorAll(".br-ctx .br-ctx-label")].map((e) => e.textContent));
  const FUSION_BODY_MENU = ["Move/Copy", "Move to Group", "-", "Create Selection Set", "-", "Configure", "-", "Physical Material", "Appearance", "Texture Map Controls", "Properties", "-", "Save As Mesh", "-", "Copy", "Cut", "Delete", "Remove", "Rename", "-", "Display Detail Control", "-", "Show/Hide", "-", "Selectable/Unselectable", "-", "Opacity Control", "Isolate", "-", "Find in Window"];
  const bodyMenuSeq = await page.evaluate(() => [...document.querySelector(".br-ctx").children].map((e) => e.classList.contains("br-ctx-sep") ? "-" : e.querySelector(".br-ctx-label").textContent));
  check("body menu matches Fusion (items, order, separators)", bodyMenuSeq.join("|") === FUSION_BODY_MENU.join("|"), bodyMenuSeq.join(" | "));
  check("body menu shortcuts M / A / Ctrl+C / Ctrl+X / Del / V", await page.evaluate(() => { const h = Object.fromEntries([...document.querySelectorAll(".br-ctx .br-ctx-item")].map((e) => [e.querySelector(".br-ctx-label").textContent, e.querySelector(".br-ctx-hint").textContent])); return h["Move/Copy"] === "M" && h.Appearance === "A" && h.Copy === "Ctrl+C" && h.Cut === "Ctrl+X" && h.Delete === "Del" && h["Show/Hide"] === "V"; }));
  check("right-click marks the row without selecting it; status names it", await page.evaluate((b) => document.querySelector(`[data-node="body:${b}"]`).classList.contains("ctx") && app.status === "Base Plate", ids.body));
  void bodyMenu;
  {
    const mb = await box(".br-ctx");
    await h.shot("07-body-menu", { clip: { x: 0, y: Math.max(0, mb.y - 260), width: Math.min(1600, mb.x + mb.width + 20), height: mb.height + 280 } });
  }
  // Opacity Control submenu and Isolate
  await page.hover('.br-ctx .br-ctx-item[data-action="opacity"]');
  await page.waitForSelector(".br-ctx-sub", { timeout: 2000 });
  check("Opacity Control submenu lists 10%..100%", await page.evaluate(() => [...document.querySelectorAll(".br-ctx-sub .br-ctx-label")].map((e) => e.textContent).join(",") === "10%,20%,30%,40%,50%,60%,70%,80%,90%,100%"));
  await page.click('.br-ctx-sub [data-action="opacity-50"]');
  await sleep(120);
  check("Opacity 50% stored on the body", await page.evaluate((b) => app.doc.bodies[b].opacity === 0.5, ids.body));
  await page.evaluate(() => app.history.undo());
  const camBefore = await page.evaluate(() => app.viewport.getView ? app.viewport.getView().dist : 0);
  await page.click(`[data-node="body:${ids.body}"] .br-label`, { button: "right" });
  await page.click('.br-ctx .br-ctx-item[data-cmd="FindInWindow"]');
  await sleep(500);
  const camAfter = await page.evaluate(() => app.viewport.getView ? app.viewport.getView().dist : 0);
  check("Find in Window frames the body", camAfter > 0 && Math.abs(camAfter - camBefore) > 1e-3, `${camBefore} -> ${camAfter}`);
  check("context mark cleared after the menu closes", await page.evaluate(() => !document.querySelector(".br-row.ctx")));
  await page.evaluate((b) => { app.selection.set([{ kind: "body", body: b }]); app.commands.run("FusionFindInTimeline"); }, ids.body);
  await sleep(100);
  check("Find in Timeline selects the creating feature", await page.evaluate((id) => app.selection.items.length === 1 && app.selection.items[0].kind === "feature" && app.selection.items[0].id === id, ids.e1));
  check("timeline item flagged selected", await page.locator(`.tl-item[data-feature="${ids.e1}"].sel`).count() === 1);
  check("selecting a timeline feature names it in the status bar", await page.evaluate(() => app.status === "Extrude1"), await page.evaluate(() => app.status));

  // named view
  await page.click('[data-node="view:top"] .br-label');
  await sleep(700);
  await h.frames(3);
  const camTop = await page.evaluate(() => { const c = app.viewport.camera; const t = app.viewport.target; const d = [c.position.x - t[0], c.position.y - t[1], c.position.z - t[2]]; const l = Math.hypot(...d); return d.map((v) => v / l); });
  check("named view TOP looks down", camTop[2] > 0.95, camTop.map((v) => v.toFixed(2)).join(","));
  await page.click('[data-node="view:home"] .br-label');
  await sleep(700);

  // units dropdown
  await page.dblclick('[data-node="units:root"] .br-label');
  await page.waitForSelector("select.br-units", { timeout: 2000 });
  await page.selectOption("select.br-units", "in");
  await sleep(80);
  check("units change via dropdown", await page.evaluate(() => app.doc.units === "in"));
  check("units label updated", (await page.locator('[data-node="units:root"] .br-label').textContent()).includes("in"));
  await page.evaluate(() => app.history.undo());

  // ------------------------------------------------------------------ timeline
  await page.mouse.move(800, 400);
  const tlBox = await box("#timeline");
  // tooltip
  await page.hover(`.tl-item[data-feature="${ids.e1}"]`);
  await sleep(700);
  const tip = await page.evaluate(() => { const t = document.querySelector(".br-tip"); return t && t.style.display !== "none" ? t.textContent : ""; });
  check("timeline tooltip shows feature name", tip.includes("Extrude1"), tip);
  check("timeline hover highlights the body", await page.evaluate((b) => app.selection.hover && app.selection.hover.kind === "body" && app.selection.hover.body === b, ids.body));
  await timelineShot("08-timeline-tooltip", 70);
  await page.mouse.move(800, 400);

  // click selects
  await page.click(`.tl-item[data-feature="${ids.f1}"]`);
  check("click timeline item selects feature", await page.evaluate((id) => app.selection.items.length === 1 && app.selection.items[0].id === id, ids.f1));
  // ctrl-click adds
  await page.click(`.tl-item[data-feature="${ids.h1}"]`, { modifiers: ["Control"] });
  check("ctrl-click adds to selection", await page.evaluate(() => app.selection.items.length === 2));
  await page.click(`.tl-item[data-feature="${ids.f1}"]`);

  // marker drag: roll back to after the extrude (2 features active)
  const undoBefore = await page.evaluate(() => app.history.undoStack.length);
  const [mx, my] = await center(".tl-marker");
  const e1b = await box(`.tl-item[data-feature="${ids.e1}"]`);
  const f1b = await box(`.tl-item[data-feature="${ids.f1}"]`);
  const targetX = (e1b.x + e1b.width + f1b.x) / 2;
  await page.mouse.move(mx, my - 8);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(mx + ((targetX - mx) * i) / 12, my - 8); await sleep(30); }
  await sleep(150);
  const midDrag = await page.evaluate(() => ({ marker: app.doc.marker, bodies: app.bodies().length }));
  await h.frames(2);
  await h.shot("09-marker-dragging");
  await page.mouse.up();
  await sleep(150);
  const afterDrag = await page.evaluate(() => ({ marker: app.doc.marker, undo: app.history.undoStack.length, label: app.history.undoStack[app.history.undoStack.length - 1].label }));
  check("marker drag rolls model live", midDrag.marker === 2, JSON.stringify(midDrag));
  check("marker drag commits one undo step", afterDrag.marker === 2 && afterDrag.undo === undoBefore + 1, JSON.stringify(afterDrag));
  check("features after marker greyed", await page.locator(".tl-item.rolled").count() === 4);
  check("rolled-back sketch/plane disappear from browser", await page.evaluate((x) => !document.querySelector(`[data-node="sketch:${x.s2}"]`) && !document.querySelector(`[data-node="cplane:${x.c1}"]`), ids));
  await h.frames(3);
  await h.shot("10-rolled-back");
  await timelineShot("11-timeline-rolled");
  await page.evaluate(() => app.history.undo());
  check("undo restores marker", await page.evaluate(() => app.doc.marker === app.doc.features.length));

  // playback buttons
  await page.click('[data-tl="first"]');
  check("go to start", await page.evaluate(() => app.doc.marker === 0));
  await page.click('[data-tl="next"]');
  check("step forward", await page.evaluate(() => app.doc.marker === 1));
  await page.click('[data-tl="last"]');
  check("go to end", await page.evaluate(() => app.doc.marker === app.doc.features.length));
  await page.click('[data-tl="prev"]');
  check("step back", await page.evaluate(() => app.doc.marker === app.doc.features.length - 1));
  await page.click('[data-tl="play"]');
  await sleep(150);
  check("play starts", await page.evaluate(() => app.ui.timeline.playing));
  await sleep(1200);
  check("play reaches the end", await page.evaluate(() => !app.ui.timeline.playing && app.doc.marker === app.doc.features.length));

  // context menu on fillet: suppress
  await page.click(`.tl-item[data-feature="${ids.f1}"]`, { button: "right" });
  await page.waitForSelector(".br-ctx", { timeout: 2000 });
  const tlMenu = await page.evaluate(() => [...document.querySelectorAll(".br-ctx .br-ctx-label")].map((e) => e.textContent));
  check("timeline menu entries", ["Edit Feature", "Roll Timeline Marker Here", "Suppress Features", "Rename", "Delete", "Find in Browser"].every((x) => tlMenu.includes(x)), tlMenu.join(" | "));
  const tlSeq = await page.evaluate(() => [...document.querySelector(".br-ctx").children].map((e) => e.classList.contains("br-ctx-sep") ? "-" : e.querySelector(".br-ctx-label").textContent).join("|"));
  check("timeline menu matches Fusion (items, order, separators)", tlSeq === "Create Selection Set|-|Edit Feature|Configure|-|Delete|Rename|-|Roll Timeline Marker Here|Convert to DM Feature|Suppress Features|-|Find in Browser|Find in Window", tlSeq);
  await h.shot("12-timeline-menu", { clip: { x: 0, y: tlBox.y - 330, width: 640, height: 330 + tlBox.height } });
  await page.click('.br-ctx [data-cmd="FusionSuppressCommand"]');
  await sleep(150);
  check("suppress fillet", await page.evaluate((id) => app.feature(id).suppressed === true && app.result.results[id].suppressed === true, ids.f1));
  check("suppressed item styled", await page.locator(`.tl-item[data-feature="${ids.f1}"].suppressed`).count() === 1);
  await timelineShot("13-timeline-suppressed");
  await page.click(`.tl-item[data-feature="${ids.f1}"]`, { button: "right" });
  await page.click('.br-ctx [data-cmd="FusionUnsuppressCommand"]');
  await sleep(150);
  check("unsuppress fillet", await page.evaluate((id) => !app.feature(id).suppressed && app.result.results[id].ok, ids.f1));

  // Edit Profile Sketch is offered for the extrude
  await page.click(`.tl-item[data-feature="${ids.e1}"]`, { button: "right" });
  check("extrude menu has Edit Profile Sketch", await page.locator('.br-ctx [data-cmd="ProfileSketchActivate"]').count() === 1);
  // Roll Timeline Marker Here
  await page.click('.br-ctx [data-cmd="FusionRollCommand"]');
  await sleep(100);
  check("roll marker here (after extrude)", await page.evaluate(() => app.doc.marker === 2));
  await page.click('[data-tl="last"]');

  // reorder: extrude before its sketch is refused
  const orderBefore = await page.evaluate(() => app.doc.features.map((f) => f.id).join(","));
  async function dragItem(id, toSel, side = "left") {
    const [sx, sy] = await center(`.tl-item[data-feature="${id}"]`);
    const tb = await box(toSel);
    const tx = side === "left" ? tb.x + 3 : tb.x + tb.width - 3;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(sx + ((tx - sx) * i) / 10, sy + 2); await sleep(25); }
    await sleep(80);
  }
  await dragItem(ids.e1, `.tl-item[data-feature="${ids.s1}"]`, "left");
  check("drop indicator shows invalid", await page.locator(".tl-drop.show.bad").count() === 1);
  await timelineShot("14-reorder-invalid", 40);
  await page.mouse.up();
  await sleep(120);
  const orderAfterBad = await page.evaluate(() => app.doc.features.map((f) => f.id).join(","));
  check("invalid reorder rejected", orderAfterBad === orderBefore);
  const t1 = await toasts();
  check("rejection toast", t1.some((t) => /Cannot move/.test(t)), t1.join(" / "));

  // fillet before the extrude that made its body: refused
  await dragItem(ids.f1, `.tl-item[data-feature="${ids.e1}"]`, "left");
  await page.mouse.up();
  await sleep(120);
  check("fillet cannot move before extrude", await page.evaluate(() => app.doc.features.map((f) => f.id).join(",")) === orderBefore);

  // plane (independent) to the front: accepted
  await dragItem(ids.c1, `.tl-item[data-feature="${ids.s1}"]`, "left");
  check("drop indicator shows valid", await page.locator(".tl-drop.show:not(.bad)").count() === 1);
  await page.mouse.up();
  await sleep(200);
  const orderAfter = await page.evaluate(() => app.doc.features.map((f) => f.id));
  check("valid reorder applied", orderAfter[0] === ids.c1, orderAfter.join(","));
  check("model still ok after reorder", await page.evaluate(() => Object.values(app.result.results).every((r) => r.ok)));
  // hole moved before fillet: valid (hole does not use fillet geometry)
  await dragItem(ids.h1, `.tl-item[data-feature="${ids.f1}"]`, "left");
  await page.mouse.up();
  await sleep(200);
  const order3 = await page.evaluate(() => app.doc.features.map((f) => f.id));
  check("hole moved before fillet", order3.indexOf(ids.h1) < order3.indexOf(ids.f1), order3.join(","));
  await timelineShot("15-reordered");
  await page.evaluate(() => { app.history.undo(); app.history.undo(); });
  check("undo reorders", await page.evaluate(() => app.doc.features.map((f) => f.id).join(",")) === orderBefore);

  // marker drag past features then reorder across the marker keeps sanity
  // double-click edit -> toast (no dialogs module in this build) or opens editor
  await page.dblclick(`.tl-item[data-feature="${ids.e1}"]`);
  await sleep(150);
  const t2 = await toasts();
  const dialogOpen = await page.evaluate(() => !!app.activeCommand || !!document.querySelector(".dlg"));
  check("double-click edits feature (dialog or toast)", dialogOpen || t2.some((t) => /Edit|not available/i.test(t)), t2.join(" / "));
  if (dialogOpen) {
    await sleep(300);
    await h.frames(3);
    const ed = await page.evaluate((id) => ({
      active: !!document.querySelector(`.tl-item.active[data-feature="${id}"]`),
      temp: !!document.querySelector(".tl-marker.temp"),
      rolled: document.querySelectorAll(".tl-item.rolled").length,
    }), ids.e1);
    check("edited feature highlighted, marker drawn after it", ed.active && ed.temp && ed.rolled === 4, JSON.stringify(ed));
    await h.shot("15b-editing-extrude");
    await page.keyboard.press("Escape");
    await sleep(200);
    check("marker back at end after cancel", await page.evaluate(() => !document.querySelector(".tl-marker.temp") && !document.querySelector(".tl-item.active")));
  }

  // rename from the timeline
  await page.click(`.tl-item[data-feature="${ids.h1}"]`, { button: "right" });
  await page.click('.br-ctx [data-cmd="FusionRenameTimelineEntryCommand"]');
  await page.waitForSelector(".tl-rename", { timeout: 2000 });
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Pilot Hole");
  await page.keyboard.press("Enter");
  await sleep(100);
  check("rename feature from timeline", await page.evaluate((id) => app.feature(id).name === "Pilot Hole", ids.h1));

  // failing feature: huge fillet radius
  await page.evaluate((id) => app.updateFeature(id, { radius: "40 mm" }), ids.f1);
  await sleep(150);
  check("failed feature outlined red", await page.locator(`.tl-item[data-feature="${ids.f1}"].error`).count() === 1);
  await page.hover(`.tl-item[data-feature="${ids.f1}"]`);
  await sleep(700);
  const tip2 = await page.evaluate(() => document.querySelector(".br-tip")?.textContent || "");
  check("error message in tooltip", /fail|smaller|could not/i.test(tip2) && !tip2.includes("[object"), tip2);
  await timelineShot("16-timeline-error", 80);
  await page.evaluate(() => app.history.undo());
  await page.mouse.move(800, 400);

  // delete sketch with dependents -> confirm box -> cancel
  await page.click(`[data-node="sketch:${ids.s1}"] .br-label`, { button: "right" });
  await page.click('.br-ctx [data-action="delete"]');
  await page.waitForSelector(".br-modal", { timeout: 3000 });
  const msg = await page.locator(".br-modal-msg").textContent();
  check("delete sketch warns about dependents", /referenced by downstream/.test(msg) && /Extrude1/.test(msg), msg);
  await h.shot("17-delete-confirm");
  await page.click('.br-modal [data-action="cancel"]');
  check("cancel keeps sketch", await page.evaluate((id) => !!app.feature(id), ids.s1));
  // delete the independent second sketch via the Delete key
  await page.click(`.tl-item[data-feature="${ids.s2}"]`);
  await page.keyboard.press("Delete");
  await sleep(150);
  check("Delete key removes a selected timeline feature", await page.evaluate((id) => !app.feature(id), ids.s2));
  await page.evaluate(() => app.history.undo());

  // suppressing a sketch implicitly suppresses the features built on it
  await page.click(`.tl-item[data-feature="${ids.s1}"]`, { button: "right" });
  await page.click('.br-ctx [data-cmd="FusionSuppressCommand"]');
  await sleep(200);
  check("dependent extrude shown implicitly suppressed", await page.locator(`.tl-item[data-feature="${ids.e1}"].implicit`).count() === 1);
  check("dependent fillet shown implicitly suppressed", await page.locator(`.tl-item[data-feature="${ids.f1}"].implicit`).count() === 1);
  await timelineShot("17b-implicit-suppressed");
  await page.evaluate(() => app.history.undo());

  // a long timeline scrolls and keeps the marker in view
  const undoBase = await page.evaluate(() => app.history.undoStack.length);
  await page.evaluate(() => {
    for (let i = 0; i < 64; i++) app.addFeature({ type: "cplane", mode: "offset", base: { kind: "origin", name: i % 2 ? "XZ" : "YZ" }, offset: `${5 + i} mm`, visible: false });
  });
  await sleep(250);
  const sc = await page.evaluate(() => { const s = document.querySelector(".tl-scroll"); const m = document.querySelector(".tl-marker").getBoundingClientRect(); const r = s.getBoundingClientRect(); return { sw: s.scrollWidth, cw: s.clientWidth, sl: s.scrollLeft, mIn: m.left >= r.left && m.right <= r.right }; });
  check("long timeline scrolls horizontally", sc.sw > sc.cw && sc.sl > 0, JSON.stringify(sc));
  check("marker kept in view", sc.mIn);
  await timelineShot("17c-long-timeline");
  await page.click('[data-tl="first"]');
  await sleep(250);
  check("marker in view after go to start", await page.evaluate(() => { const s = document.querySelector(".tl-scroll").getBoundingClientRect(); const m = document.querySelector(".tl-marker").getBoundingClientRect(); return m.left >= s.left && m.right <= s.right; }));
  await page.evaluate((n) => { while (app.history.undoStack.length > n) app.history.undo(); }, undoBase);
  await sleep(150);
  check("undo back to the 6-feature model", await page.evaluate(() => app.doc.features.length === 6 && app.doc.marker === 6));

  // Analysis folder (inspect module present in full builds)
  if (await page.evaluate(() => !!(app.ui.inspect && app.ui.inspect.analyses))) {
    await page.evaluate(() => app.mutate("Center of Mass", (doc) => { doc.analyses = [...(doc.analyses || []), { id: "aT1", type: "com", name: "CenterOfMass1", visible: true, bodies: [] }]; }, { recompute: false }));
    await sleep(120);
    check("Analysis folder lists analyses", await page.evaluate(() => !!document.querySelector('[data-node="analysis:root"]') && !!document.querySelector('[data-node="analysis:aT1"]')));
    await page.click('[data-node="analysis:root"] .br-twisty');
    await page.click('[data-node="analysis:aT1"] .br-eye');
    await sleep(80);
    check("Analysis eye hides it", await page.evaluate(() => app.ui.inspect.analyses().find((a) => a.id === "aT1").visible === false));
    await page.evaluate(() => { app.history.undo(); app.history.undo(); });
  }

  // ToggleBrowser (Ctrl+Alt+B) and collapse
  await page.mouse.click(800, 300);
  await page.keyboard.press("Control+Alt+B");
  check("Ctrl+Alt+B hides browser", await page.evaluate(() => getComputedStyle(app.dom.browserHost).display === "none"));
  await page.keyboard.press("Control+Alt+B");
  check("Ctrl+Alt+B shows browser", await page.evaluate(() => getComputedStyle(app.dom.browserHost).display !== "none"));
  await page.click(".br-collapse");
  check("collapse browser", await page.evaluate(() => document.querySelector(".br-panel").classList.contains("collapsed")));
  await page.click(".br-collapse");

  // resize the browser
  const pb = await box(".br-panel");
  await page.mouse.move(pb.x + pb.width + 1, pb.y + 60);
  await page.mouse.down();
  await page.mouse.move(pb.x + pb.width + 61, pb.y + 60, { steps: 5 });
  await page.mouse.up();
  const pb2 = await box(".br-panel");
  check("browser resizes", pb2.width > pb.width + 40, `${pb.width} -> ${pb2.width}`);

  await h.frames(3);
  await h.shot("18-final");
  await browserShot("19-browser-final");

  // replicad logs "failed to compute a normal" from its EdgeFinder when a fillet fails (engine noise)
  const errs = h.errors.filter((e) => !/favicon/.test(e) && !/failed to compute a normal/.test(e));
  check("no console errors", errs.length === 0, errs.join("\n"));
} catch (e) {
  console.error(e);
  fails++;
  try { await h.shot("zz-crash"); } catch { /* ignore */ }
} finally {
  await h.close();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exitCode = fails ? 1 : 0;
