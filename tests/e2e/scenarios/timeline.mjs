// Timeline: items in creation order, drag the marker to roll back / forward, playback buttons,
// right-click menu (Edit Feature, Roll Timeline Marker Here, Suppress, Rename, Delete).
import { defineScenario, mainIfDirect, apiBox } from "../lib.mjs";

const scenario = defineScenario({
  name: "timeline",
  title: "Timeline marker drag, playback controls, context menu",
  async run(t) {
    t.step("setup: three boxes (App API)");
    const a = await apiBox(t, { center: [0, 0] });
    const b = await apiBox(t, { center: [60, 0] });
    const c = await apiBox(t, { center: [120, 0] });
    await t.setView("home");
    await t.app(() => window.app.viewport.fit && window.app.viewport.fit({ animate: false }));
    await t.settle(200);
    let s = await t.state();
    t.require("setup computed", s.features.length === 3 && s.bodies.length === 3);
    const items = await t.app(() => [...document.querySelectorAll("#timeline [data-feature]")].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute("data-feature"), x: r.left, w: r.width, cx: r.left + r.width / 2, cy: r.top + r.height / 2, right: r.right }; }));
    t.require("timeline shows 3 items ([data-feature])", items.length === 3, `items=${items.length}`);
    t.check("timeline items are in creation order", items.map((i) => i.id).join() === [a.id, b.id, c.id].join(), items.map((i) => i.id).join());
    t.check("timeline items are ~16–32 px icons", items.every((i) => i.w >= 14 && i.w <= 40), items.map((i) => i.w).join(","));
    for (const k of ["first", "prev", "play", "next", "last"]) t.check(`playback control [data-tl=${k}]`, await t.visible(`#timeline [data-tl="${k}"]`));
    await t.shot("timeline-3");

    t.step("hover tooltip on a timeline item");
    await t.page.mouse.move(items[1].cx, items[1].cy);
    await t.settle(1200);
    const tip = await t.app((id) => {
      const el = document.querySelector(`#timeline [data-feature="${id}"]`);
      const txt = [...document.querySelectorAll("#overlay *")].filter((e) => e.offsetParent && /Box2/.test(e.innerText || "")).map((e) => e.innerText).sort((x, y) => x.length - y.length)[0];
      return txt || (el && el.title) || "";
    }, b.id);
    t.check("hovering a timeline item shows its name (Box2)", /Box2/.test(tip), `tooltip="${tip}"`);

    t.step("drag the marker between item 1 and item 2");
    const mk = await t.box("#timeline .tl-marker");
    t.require("timeline marker visible (.tl-marker)", !!mk);
    t.check("marker starts after the last item", mk.x + mk.width / 2 > items[2].cx, `marker x=${Math.round(mk.x)} last item cx=${Math.round(items[2].cx)}`);
    const mx = mk.x + mk.width / 2, my = mk.y + mk.height / 2;
    const target = (items[0].right + items[1].x) / 2;
    await t.page.mouse.move(mx, my);
    await t.page.mouse.down();
    await t.page.mouse.move((mx + target) / 2, my, { steps: 6 });
    await t.page.mouse.move(target, my, { steps: 6 });
    await t.page.mouse.up();
    await t.settle(400);
    s = await t.state();
    await t.shot("rolled-to-1");
    t.check("marker drag sets doc.marker = 1", s.marker === 1, `marker=${s.marker}`);
    t.check("rolled-back model shows only the first body", s.bodies.length === 1, `bodies=${s.bodies.length}`);
    const look = await t.app((ids) => ids.map((id) => { const e = document.querySelector(`#timeline [data-feature="${id}"]`); const cs = getComputedStyle(e); return { cls: e.className, op: parseFloat(cs.opacity), filter: cs.filter }; }), [a.id, b.id, c.id]);
    t.check("features after the marker are greyed out", (look[1].op < 0.9 || /rolled|inactive|after|disabled|grey|gray/i.test(look[1].cls) || /grayscale/.test(look[1].filter)) && !(look[0].op < 0.9), JSON.stringify(look));
    const mk2 = await t.box("#timeline .tl-marker");
    t.check("marker is drawn between item 1 and item 2", mk2 && mk2.x + mk2.width / 2 > items[0].cx && mk2.x + mk2.width / 2 < items[1].cx, mk2 && `marker cx=${Math.round(mk2.x + mk2.width / 2)}`);

    t.step("drag the marker back to the end");
    const m2x = mk2.x + mk2.width / 2, m2y = mk2.y + mk2.height / 2;
    await t.page.mouse.move(m2x, m2y);
    await t.page.mouse.down();
    await t.page.mouse.move(items[2].right + 20, m2y, { steps: 10 });
    await t.page.mouse.up();
    await t.settle(400);
    s = await t.state();
    t.check("marker back at the end (3) restores all bodies", s.marker === 3 && s.bodies.length === 3, `marker=${s.marker} bodies=${s.bodies.length}`);

    t.step("playback buttons");
    await t.click('#timeline [data-tl="first"]'); await t.settle(250);
    t.check("Move to Beginning -> marker 0", (await t.state()).marker === 0);
    await t.click('#timeline [data-tl="next"]'); await t.settle(250);
    t.check("Next Step -> marker 1", (await t.state()).marker === 1);
    await t.click('#timeline [data-tl="last"]'); await t.settle(250);
    t.check("Move to End -> marker 3", (await t.state()).marker === 3);
    await t.click('#timeline [data-tl="prev"]'); await t.settle(250);
    t.check("Previous Step -> marker 2", (await t.state()).marker === 2);
    await t.click('#timeline [data-tl="last"]'); await t.settle(250);
    await t.click('#timeline [data-tl="first"]'); await t.settle(150);
    await t.click('#timeline [data-tl="play"]');
    const played = await t.waitFor(() => window.app.doc.marker === window.app.doc.features.length, { timeout: 6000 });
    t.check("Play steps the marker to the end", played, `marker=${(await t.state()).marker}`);

    t.step("right-click a timeline item");
    await t.page.mouse.click(items[1].cx, items[1].cy, { button: "right" });
    await t.settle(250);
    const menuText = await t.overlayText();
    await t.shot("timeline-context-menu");
    for (const label of ["Edit Feature", "Roll Timeline Marker Here", "Suppress", "Rename", "Delete"]) t.check(`context menu has "${label}"`, menuText.includes(label), menuText.replace(/\s+/g, " ").slice(0, 200));
    const roll = await t.app(() => { const e = [...document.querySelectorAll("#overlay *")].find((x) => x.offsetParent && x.children.length === 0 && /Roll Timeline Marker Here/.test(x.innerText)); if (e) { e.setAttribute("data-qa-roll", "1"); return true; } return false; });
    if (roll) {
      await t.click('[data-qa-roll="1"]');
      await t.settle(300);
      t.check("Roll Timeline Marker Here puts the marker after that feature (2)", (await t.state()).marker === 2, `marker=${(await t.state()).marker}`);
    }
    await t.escapeAll();
    await t.click('#timeline [data-tl="last"]'); await t.settle(200);

    t.step("suppress from the context menu");
    await t.page.mouse.click(items[0].cx, items[0].cy, { button: "right" });
    await t.settle(250);
    const sup = await t.app(() => { const e = [...document.querySelectorAll("#overlay *")].find((x) => x.offsetParent && x.children.length === 0 && /^Suppress( Features)?$/.test(x.innerText.trim())); if (e) { e.setAttribute("data-qa-sup", "1"); return true; } return false; });
    if (sup) {
      await t.click('[data-qa-sup="1"]');
      await t.settle(300);
      s = await t.state();
      t.check("Suppress removes the first box from the model", s.features[0].suppressed && s.bodies.length === 2, JSON.stringify({ sup: s.features[0].suppressed, bodies: s.bodies.length }));
    } else t.check("Suppress item clickable", false);
    await t.escapeAll();
    await t.shot("suppressed");

    t.step("drag the first item after the second (reorder)");
    const it2 = await t.app(() => [...document.querySelectorAll("#timeline [data-feature]")].map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute("data-feature"), cx: r.left + r.width / 2, cy: r.top + r.height / 2, right: r.right }; }));
    if (it2.length === 3) {
      await t.page.mouse.move(it2[0].cx, it2[0].cy);
      await t.page.mouse.down();
      await t.page.mouse.move(it2[0].cx + 10, it2[0].cy, { steps: 3 });
      await t.page.mouse.move(it2[1].right + 3, it2[1].cy, { steps: 8 });
      await t.page.mouse.up();
      await t.settle(400);
      const ord = await t.app(() => window.app.doc.features.map((f) => f.id));
      t.check("independent features can be reordered by drag", ord[1] === a.id, `order=${ord.join(",")}`);
    }
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
