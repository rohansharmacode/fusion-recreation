// TIMELINE: Fusion's parametric history bar at the bottom of the window.
//   playback controls |◀ ◀ ▶ ▶ ▶| | 16px feature icons in order, a light bracket linking each
//   sketch to the features built from it, the black history marker | settings gear at the right.
//   Click = select (the feature's body is highlighted and named in the status bar), double-click
//   = Edit Feature, Fusion's right-click menu, drag icons to reorder (moves that would put a
//   feature before something it references are refused), drag the marker to roll the model back
//   live, failed/warning/suppressed/rolled-back states.
import "./style.css";
import { refKey } from "../../app/core.js";
import { el, esc, store, glyph, featureGlyph, showMenu, hideMenu, showTip, hideTip, inlineEdit, runCmd, friendlyError, notAvailable, syncFeatureIcons } from "../browser/ui.js";
import { findInWindow, installFeatureHighlight, installStatus, setContextHighlight } from "../browser/scene.js";
import { canMove, explicitDeps, bodyCreators, profileSketches, creatorFeature, refsOf, creatorOf, bodiesTouched, setFeatureDefLookup } from "./deps.js";
import { setSuppressed, rollTo, deleteFeatures, deleteAfterMarker, renameFeature } from "./actions.js";

const KEY_SWATCH = "fusionrec.timeline.swatches";
const PLAY_STEP_MS = 420;

export function init(app) {
  // registered feature types: their deps(f) / touches(f) feed the reorder / delete dependency checks
  setFeatureDefLookup((t) => { const d = app.M.featureDef ? app.M.featureDef(t) : null; return d && !d.builtin ? d : null; });
  const host = app.dom.timeline;
  if (!host) return;

  // ------------------------------------------------------------------ DOM
  installStatus(app);
  installFeatureHighlight(app);
  const ctl = (id, name, tip) => el("button", { class: "tl-btn", dataset: { tl: id }, title: tip, "aria-label": tip, html: glyph(name, 16) });
  const btnFirst = ctl("first", "first", "Move to Beginning");
  const btnPrev = ctl("prev", "prev", "Step Backward");
  const btnPlay = ctl("play", "play", "Play");
  const btnNext = ctl("next", "next", "Step Forward");
  const btnLast = ctl("last", "last", "Move to End");
  const controls = el("div", { class: "tl-controls" }, btnFirst, btnPrev, btnPlay, btnNext, btnLast);
  const items = el("div", { class: "tl-items" });
  const SVGNS = "http://www.w3.org/2000/svg";
  const links = document.createElementNS(SVGNS, "svg");
  links.setAttribute("class", "tl-links");
  links.setAttribute("aria-hidden", "true");
  const drop = el("div", { class: "tl-drop" });
  const scroller = el("div", { class: "tl-scroll" }, items, drop);
  const gear = el("button", { class: "tl-btn tl-gear", dataset: { tl: "settings" }, title: "Timeline Settings", "aria-label": "Timeline Settings", html: glyph("settings", 16) });
  const root = el("div", { class: "tl-root" }, controls, scroller, gear);
  host.appendChild(root);

  // ------------------------------------------------------------------ state
  let swatches = !!store.get(KEY_SWATCH, false);
  let pending = false;
  let lastMarker = -1;
  let lastCount = -1;
  let anchorId = null; // shift-click range anchor
  let hoverSetKey = null;
  let mdrag = null; // marker drag
  let rdrag = null; // reorder drag
  let play = null; // playback
  let internalDoc = 0; // >0 while we commit our own marker moves
  let renaming = null;
  let editingId = null; // feature opened for editing from the timeline/browser

  const results = () => (app.result && app.result.results) || {};
  const features = () => app.doc.features;
  const label = (t) => (app.featureLabel ? app.featureLabel(t) : (app.M.TYPE_LABEL && app.M.TYPE_LABEL[t]) || t);

  function busyReason() {
    if (app.mode === "sketch") return "Finish the sketch before changing the timeline";
    if (app.activeCommand) return "Finish or cancel the active command before changing the timeline";
    return null;
  }
  function guard() {
    const r = busyReason();
    if (r) { app.toast(r, "info", 2200); return false; }
    return true;
  }

  // ------------------------------------------------------------------ status of each feature
  // Bodies each feature created / joined / cut the last time it computed. Boolean participants
  // are implicit (whatever bodies existed), and once an upstream feature is suppressed the
  // evaluator no longer reports them, so dependents are recognised from this memory.
  const lastTouched = new Map();
  function rememberTouched() {
    if (app.previewing) return;
    const res = results();
    for (const f of features()) {
      const r = res[f.id];
      if (!r || r.ok !== true || r.rolled || r.suppressed || f.suppressed || r.warning) continue;
      const t = bodiesTouched(app.doc, res, f);
      if (t.size) lastTouched.set(f.id, t);
    }
  }

  /**
   * The suppressed (or implicitly suppressed) earlier feature that makes `f` drop out, or null.
   * Every kind of dependent is treated alike: a feature whose input body only a suppressed feature
   * created, or that fails / warns while it uses something a suppressed feature produced or
   * modified (sketch on its face, profile, edge, face, hole face, cut/join target, pattern body),
   * is shown implicitly suppressed instead of with an error badge.
   */
  function suppressedCause(f, r, ctx) {
    const doc = app.doc;
    const sup = ctx.suppressedIds;
    const state = app.result && app.result.state;
    const refs = refsOf(f);
    const creator = (b) => creatorOf(ctx.creators, doc, b);
    for (const b of refs.bodies) {
      const c = creator(b);
      if (c && sup.has(c) && (app.feature(c)?.suppressed || !(state && state.bodies.has(b)))) return app.feature(c);
    }
    for (const s of [...refs.sketches, ...refs.cplanes]) if (sup.has(s) && app.feature(s)?.suppressed) return app.feature(s);
    if (r.ok !== false && !r.warning) return null;
    for (const d of explicitDeps(doc, results(), f, ctx.creators)) if (sup.has(d)) return app.feature(d);
    const used = new Set([...refs.bodies, ...(lastTouched.get(f.id) || [])]);
    used.delete(f.newBody);
    for (const b of used) { const c = creator(b); if (c && c !== f.id && sup.has(c)) return app.feature(c); }
    if (r.ok === false) {
      // e.g. a fillet on an edge that a now suppressed cut made
      for (const id of sup) {
        const t = lastTouched.get(id);
        if (t && [...used].some((b) => t.has(b))) return app.feature(id);
      }
    }
    return null;
  }

  function statusOf(f, i, ctx) {
    const r = results()[f.id] || {};
    const rolled = i >= app.doc.marker || r.rolled;
    let implicitBy = null;
    if (!rolled && !f.suppressed && ctx.suppressedIds.size) {
      try { implicitBy = suppressedCause(f, r, ctx); } catch (e) { console.error(e); }
    }
    return {
      rolled,
      suppressed: !!f.suppressed,
      implicit: !!implicitBy,
      implicitBy,
      error: !rolled && !f.suppressed && !implicitBy && r.ok === false ? friendlyError(r.error || "Feature failed to compute") : null,
      warning: !rolled && !f.suppressed && !implicitBy && r.ok !== false && r.warning ? r.warning : null,
    };
  }

  // ------------------------------------------------------------------ render
  function render() {
    pending = false;
    if (renaming) { pending = true; return; }
    const doc = app.doc;
    const feats = doc.features;
    rememberTouched();
    const ctx = { creators: bodyCreators(doc), suppressedIds: new Set() };
    // implicit suppression propagates in order
    const frag = document.createDocumentFragment();
    // While a feature is edited its preview evaluates only up to it: draw the marker there
    // (temporarily, as Fusion does) so it matches the rolled-back state of later features.
    if (editingId && !app.activeCommand && app.mode !== "sketch") editingId = null;
    let vm = doc.marker;
    for (let i = 0; i < doc.marker; i++) { const r = results()[feats[i].id]; if (r && r.rolled) { vm = i; break; } }
    feats.forEach((f, i) => {
      if (i === vm) frag.appendChild(markerEl(vm !== doc.marker));
      const st = statusOf(f, i, ctx);
      if (st.suppressed || st.implicit) ctx.suppressedIds.add(f.id);
      const cls = ["tl-item"];
      if (st.rolled) cls.push("rolled");
      if (st.suppressed) cls.push("suppressed");
      if (st.implicit) cls.push("suppressed", "implicit");
      if (st.error) cls.push("error");
      if (st.warning) cls.push("warning");
      // a feature reopened for editing stays marked; a sketch being edited is not (Fusion)
      if (editingId === f.id && app.activeCommand && f.type !== "sketch") cls.push("active");
      const it = el("div", {
        class: cls.join(" "),
        role: "button",
        dataset: { feature: f.id, type: f.type, index: String(i) },
        "aria-label": f.name,
      },
      el("span", { class: "tl-ico", html: featureGlyph(f.type, 16) }),
      st.suppressed || st.implicit ? el("span", { class: "tl-strike" }) : null,
      st.error || st.warning ? el("span", { class: "tl-flag", html: glyph(st.error ? "error" : "warning", 10) }) : null,
      swatches ? el("span", { class: "tl-swatch" }) : null);
      it._status = st;
      frag.appendChild(it);
    });
    if (feats.length === vm) frag.appendChild(markerEl(vm !== doc.marker));
    items.textContent = "";
    items.appendChild(links);
    items.appendChild(frag);
    root.classList.toggle("empty", feats.length === 0);
    root.classList.toggle("playing", !!play);
    btnPlay.innerHTML = glyph(play ? "pause" : "play", 16);
    btnPlay.title = play ? "Stop" : "Play";
    btnPlay.setAttribute("aria-label", btnPlay.title);
    btnPlay.classList.toggle("idle", feats.length === 0);
    drawLinks();
    updateStates();
    if (doc.marker !== lastMarker || feats.length !== lastCount) {
      const m = items.querySelector(".tl-marker");
      if (m && !rdrag) keepVisible(m);
      lastMarker = doc.marker;
      lastCount = feats.length;
    }
  }
  function scheduleRender() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { if (pending) render(); });
  }
  const MARKER_SVG = '<svg class="tl-marker-svg" width="12" height="32" viewBox="0 0 12 32" aria-hidden="true"><path d="M.4 .4h11.2v1.8L8.3 6.1c-.4.5-.8.9-1.3 1.1v24.1c0 .4-.4.7-1 .7s-1-.3-1-.7V7.2c-.5-.2-.9-.6-1.3-1.1L.4 2.2z"/></svg>';
  function markerEl(temp = false) {
    return el("div", { class: `tl-marker${mdrag ? " dragging" : ""}${temp ? " temp" : ""}`, role: "slider", "aria-label": "History Marker", "aria-valuenow": String(app.doc.marker), html: MARKER_SVG });
  }
  /** Light brackets under the timeline linking each sketch to the features built from it. */
  function drawLinks() {
    while (links.firstChild) links.removeChild(links.firstChild);
    const pos = new Map();
    const H = items.clientHeight || 46;
    let x = null;
    for (const e of items.children) {
      if (!e.classList || !e.classList.contains("tl-item")) continue;
      pos.set(e.dataset.feature, e.offsetLeft + e.offsetWidth / 2);
      x = e;
    }
    void x;
    let n = 0;
    for (const f of features()) {
      if (f.type === "sketch") {
        // every sketch carries a short stem; brackets join it to the features built from it
        const x1 = pos.get(f.id);
        if (x1 == null) continue;
        const p = document.createElementNS(SVGNS, "path");
        p.setAttribute("d", `M${Math.round(x1) + 0.5} ${H - 14}V${H - 6.5}`);
        links.appendChild(p);
        n++;
        continue;
      }
      const x2 = pos.get(f.id);
      if (x2 == null) continue;
      for (const sid of profileSketches(f)) {
        const x1 = pos.get(sid);
        if (x1 == null) continue;
        const p = document.createElementNS(SVGNS, "path");
        const a = Math.round(Math.min(x1, x2)) + 0.5, b = Math.round(Math.max(x1, x2)) - 0.5;
        p.setAttribute("d", `M${a} ${H - 14}V${H - 6.5}H${b}V${H - 14}`);
        links.appendChild(p);
        n++;
      }
    }
    links.style.display = n ? "" : "none";
  }
  function keepVisible(elm) {
    const sr = scroller.getBoundingClientRect();
    const r = elm.getBoundingClientRect();
    if (r.left < sr.left + 4) scroller.scrollLeft -= sr.left + 4 - r.left + 30;
    else if (r.right > sr.right - 4) scroller.scrollLeft += r.right - (sr.right - 4) + 30;
  }
  function updateStates() {
    const hov = refKey(app.selection.hover);
    // a selected sketch profile (e.g. in the Extrude dialog) marks its sketch, like Fusion
    const profSketches = new Set(app.selection.items.filter((r) => r.kind === "profile" && r.sketch).map((r) => r.sketch));
    for (const it of items.querySelectorAll(".tl-item")) {
      const id = it.dataset.feature;
      it.classList.toggle("sel", app.selection.has({ kind: "feature", id }) || app.selection.has({ kind: "cplane", id }) || profSketches.has(id));
      it.classList.toggle("hov", hov === `f:${id}`);
    }
  }

  // ------------------------------------------------------------------ selection / hover
  function featureRef(id) {
    const f = app.feature(id);
    return f && f.type === "cplane" ? { kind: "feature", id } : { kind: "feature", id };
  }
  function selectFeature(id, ev) {
    const ref = featureRef(id);
    if (!app.selection.accepts(ref)) return;
    if (ev && (ev.ctrlKey || ev.metaKey)) { app.selection.toggle(ref); anchorId = id; return; }
    if (ev && ev.shiftKey && anchorId && app.feature(anchorId)) {
      const a = app.featureIndex(anchorId), b = app.featureIndex(id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const keep = app.selection.items.filter((r) => r.kind !== "feature");
      app.selection.set([...keep, ...features().slice(lo, hi + 1).map((f) => featureRef(f.id))]);
      return;
    }
    anchorId = id;
    app.selection.set([ref]);
  }
  function hoverRefFor(f) {
    const r = results()[f.id] || {};
    if (r.rolled || r.suppressed || f.suppressed) return null;
    if (f.type === "sketch") return { kind: "feature", id: f.id };
    if (f.type === "cplane") return { kind: "cplane", id: f.id };
    const st0 = app.result && app.result.state;
    const alive = st0 ? { has: (id) => st0.bodies.has(id) || !!(st0.meshBodies && st0.meshBodies.has(id)) } : null;
    const cands = [...(r.affected || []), f.newBody, ...(f.newBodies || []), ...(f.edges || []).map((e) => e && e.body), ...(f.faces || []).map((x) => x && x.body), ...(f.bodies || []), f.target];
    const b = cands.find((id) => id && alive && alive.has(id));
    return b ? { kind: "body", body: b } : { kind: "feature", id: f.id };
  }
  function selectedFeatureIds(contextId) {
    const sel = app.selection.items.filter((r) => (r.kind === "feature" || r.kind === "cplane") && app.feature(r.id)).map((r) => r.id);
    if (contextId && !sel.includes(contextId)) return [contextId];
    return sel.length ? sel : contextId ? [contextId] : [];
  }

  function tipHtml(f, st) {
    const parts = [`<b>${esc(f.name)}</b>`];
    const tl = label(f.type);
    if (!String(f.name).startsWith(tl)) parts.push(`<div class="br-tip-sub">${esc(tl)}</div>`);
    if (st.error) parts.push(`<div class="br-tip-err">${esc(st.error)}</div>`);
    if (st.warning) parts.push(`<div class="br-tip-warn">${esc(st.warning)}</div>`);
    if (st.suppressed && !st.implicit) parts.push(`<div class="br-tip-sub">Suppressed</div>`);
    if (st.implicit && st.implicitBy) parts.push(`<div class="br-tip-sub">Suppressed because ${esc(st.implicitBy.name)} is suppressed</div>`);
    if (st.rolled && !st.suppressed) parts.push(`<div class="br-tip-sub">After the History Marker (rolled back)</div>`);
    return parts.join("");
  }

  let tipFor = null; // item/marker the tooltip belongs to (shown once per hover)
  items.addEventListener("mouseover", (ev) => {
    if (mdrag || rdrag) return;
    const it = ev.target.closest(".tl-item");
    if (!it) {
      const onMarker = !!ev.target.closest(".tl-marker");
      if (tipFor !== (onMarker ? "marker" : null)) {
        hideTip();
        tipFor = onMarker ? "marker" : null;
        if (onMarker) { const r = items.getBoundingClientRect(); showTip(app, "<b>History Marker</b><div class=\"br-tip-sub\">Drag to roll the design back or forward</div>", ev.clientX, r.top, { above: true }); }
      }
      clearHover();
      return;
    }
    const f = app.feature(it.dataset.feature);
    if (!f) return;
    if (tipFor !== f.id) {
      tipFor = f.id;
      const r = it.getBoundingClientRect();
      showTip(app, tipHtml(f, it._status || {}), r.left, r.top, { above: true });
    }
    const ref = hoverRefFor(f);
    if (ref) { hoverSetKey = refKey(ref); app.selection.setHover(ref); } else clearHover();
  });
  items.addEventListener("mouseleave", () => { hideTip(); tipFor = null; clearHover(); });
  function clearHover() {
    if (hoverSetKey && refKey(app.selection.hover) === hoverSetKey) app.selection.setHover(null);
    hoverSetKey = null;
  }

  // ------------------------------------------------------------------ pointer: click / reorder / marker drag
  items.addEventListener("pointerdown", (ev) => {
    hideTip(); // stays hidden until the pointer enters another item
    if (ev.button !== 0) return;
    hideMenu();
    if (ev.target.closest(".tl-marker")) { startMarkerDrag(ev); return; }
    const it = ev.target.closest(".tl-item");
    if (!it) {
      if (!ev.ctrlKey && !ev.shiftKey) {
        const keep = app.selection.items.filter((r) => r.kind !== "feature");
        if (keep.length !== app.selection.items.length) app.selection.set(keep);
      }
      return;
    }
    // pointer capture is taken only once a drag starts, so click/dblclick keep their real target
    rdrag = { id: it.dataset.feature, x0: ev.clientX, y0: ev.clientY, started: false, pid: ev.pointerId, ev: { ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, shiftKey: ev.shiftKey }, cache: new Map() };
  });
  items.addEventListener("pointermove", (ev) => {
    if (mdrag) { moveMarkerDrag(ev); return; }
    if (!rdrag) return;
    if (!rdrag.started) {
      if (Math.hypot(ev.clientX - rdrag.x0, ev.clientY - rdrag.y0) < 5) return;
      if (busyReason()) { guard(); endReorder(false); return; }
      startReorder(ev);
    }
    moveReorder(ev);
  });
  items.addEventListener("pointerup", (ev) => {
    if (mdrag) { endMarkerDrag(true); return; }
    if (!rdrag) return;
    if (rdrag.started) endReorder(true, ev);
    else { const id = rdrag.id, e = rdrag.ev; rdrag = null; selectFeature(id, e); }
  });
  window.addEventListener("pointerup", () => { if (rdrag && !rdrag.started) rdrag = null; });
  items.addEventListener("pointercancel", () => { if (mdrag) endMarkerDrag(true); if (rdrag) endReorder(false); });
  items.addEventListener("lostpointercapture", () => { if (mdrag) endMarkerDrag(true); else if (rdrag && rdrag.started) endReorder(false); });
  items.addEventListener("dblclick", (ev) => {
    let it = ev.target.closest(".tl-item");
    if (!it) { const hit = document.elementFromPoint(ev.clientX, ev.clientY); it = hit && hit.closest ? hit.closest(".tl-item") : null; }
    if (!it) return;
    ev.preventDefault();
    editFeature(it.dataset.feature);
  });
  items.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    const it = ev.target.closest(".tl-item");
    if (!it) return;
    const id = it.dataset.feature;
    const f = app.feature(id);
    // Like Fusion: the right-clicked feature is highlighted in the canvas and named in the
    // status bar while its menu is open; the selection itself is left alone.
    const prevStatus = app.status || "";
    const name = f ? f.name : "";
    it.classList.add("ctx");
    setContextHighlight(app, [{ kind: "feature", id }]);
    clearHover();
    hideTip();
    tipFor = null;
    if (name) app.setStatus(name);
    showMenu(app, menuFor(id), ev.clientX, ev.clientY, {
      className: "tl-ctx",
      above: true,
      onClose: () => {
        setContextHighlight(app, []);
        items.querySelector(`.tl-item.ctx[data-feature="${CSS.escape(id)}"]`)?.classList.remove("ctx");
        if (name && app.status === name) {
          const s = app.selection.items;
          const keep = s.length === 1 && s[0].id === id;
          if (!keep) app.setStatus(prevStatus === name ? "" : prevStatus);
        }
      },
    });
  });
  scroller.addEventListener("wheel", (ev) => {
    if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) { scroller.scrollLeft += ev.deltaY; ev.preventDefault(); }
  }, { passive: false });

  // ----- marker drag
  function startMarkerDrag(ev) {
    ev.preventDefault();
    if (!guard()) return;
    stopPlay(true);
    mdrag = { orig: app.doc.marker, want: app.doc.marker, raf: 0, pid: ev.pointerId };
    try { items.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    root.classList.add("dragging-marker");
    items.querySelector(".tl-marker")?.classList.add("dragging");
  }
  function gapAt(clientX) {
    let g = 0;
    for (const e of items.querySelectorAll(".tl-item")) {
      const r = e.getBoundingClientRect();
      if (r.left + r.width / 2 < clientX) g++;
    }
    return g;
  }
  function autoScroll(clientX) {
    const sr = scroller.getBoundingClientRect();
    if (clientX < sr.left + 16) scroller.scrollLeft -= 12;
    else if (clientX > sr.right - 16) scroller.scrollLeft += 12;
  }
  function moveMarkerDrag(ev) {
    autoScroll(ev.clientX);
    const g = Math.max(0, Math.min(features().length, gapAt(ev.clientX)));
    if (g === mdrag.want) return;
    mdrag.want = g;
    if (mdrag.raf) return;
    mdrag.raf = requestAnimationFrame(() => {
      if (!mdrag) return;
      mdrag.raf = 0;
      if (app.doc.marker !== mdrag.want) {
        app.doc.marker = mdrag.want; // live roll; committed as one undo step on release
        app.recompute();
      }
    });
  }
  function endMarkerDrag(commit) {
    const d = mdrag;
    if (!d) return;
    mdrag = null;
    if (d.raf) cancelAnimationFrame(d.raf);
    root.classList.remove("dragging-marker");
    if (d.want !== app.doc.marker) { app.doc.marker = d.want; app.recompute(); }
    const fin = app.doc.marker;
    if (commit && fin !== d.orig) {
      app.doc.marker = d.orig;
      internalDoc++;
      try { app.setMarker(fin); } finally { internalDoc--; }
    } else if (!commit && fin !== d.orig) {
      app.doc.marker = d.orig;
      app.recompute();
    }
    render();
  }

  // ----- reorder drag
  function sequence() {
    // visual order: feature ids with the marker sentinel
    const seq = features().map((f) => f.id);
    seq.splice(app.doc.marker, 0, "\u0000marker");
    return seq;
  }
  function startReorder(ev) {
    rdrag.started = true;
    try { items.setPointerCapture(rdrag.pid); } catch { /* ignore */ }
    const f = app.feature(rdrag.id);
    if (!f) { endReorder(false); return; }
    const it = items.querySelector(`.tl-item[data-feature="${CSS.escape(rdrag.id)}"]`);
    if (it) it.classList.add("dragging");
    rdrag.ghost = el("div", { class: "tl-ghost", html: featureGlyph(f.type, 16) });
    (app.dom.overlay || document.body).appendChild(rdrag.ghost);
    root.classList.add("reordering");
    clearHover();
    hideTip();
  }
  function planFor(gap) {
    const seq = sequence();
    const from = seq.indexOf(rdrag.id);
    const without = seq.filter((x) => x !== rdrag.id);
    const g = Math.max(0, Math.min(without.length, gap));
    without.splice(g, 0, rdrag.id);
    const marker = without.indexOf("\u0000marker");
    const order = without.filter((x) => x !== "\u0000marker");
    const same = order.every((id, i) => features()[i].id === id) && marker === app.doc.marker;
    void from;
    return { order, marker, same };
  }
  function moveReorder(ev) {
    autoScroll(ev.clientX);
    if (rdrag.ghost) { rdrag.ghost.style.left = `${ev.clientX - 12}px`; rdrag.ghost.style.top = `${ev.clientY - 30}px`; }
    // gap among visual elements (items + marker), excluding the dragged one
    const els = [...items.children].filter((e) => (e.classList.contains("tl-item") || e.classList.contains("tl-marker")) && e.dataset.feature !== rdrag.id);
    let gap = 0;
    for (const e of els) { const r = e.getBoundingClientRect(); if (r.left + r.width / 2 < ev.clientX) gap++; }
    rdrag.gap = gap;
    let plan = rdrag.cache.get(gap);
    if (!plan) {
      plan = planFor(gap);
      if (!plan.same) {
        const from = app.featureIndex(rdrag.id);
        const to = plan.order.indexOf(rdrag.id);
        try { plan.check = canMove(app, from, to); } catch (e) { console.error(e); plan.check = { ok: true }; }
      } else plan.check = { ok: true };
      rdrag.cache.set(gap, plan);
    }
    rdrag.plan = plan;
    // drop indicator position
    const sr = scroller.getBoundingClientRect();
    let x;
    if (!els.length) x = items.getBoundingClientRect().left + 4;
    else if (gap >= els.length) x = els[els.length - 1].getBoundingClientRect().right + 1;
    else x = els[gap].getBoundingClientRect().left - 1;
    drop.style.left = `${x - sr.left + scroller.scrollLeft - 1}px`;
    drop.classList.toggle("show", !plan.same);
    drop.classList.toggle("bad", !plan.check.ok);
    if (rdrag.ghost) rdrag.ghost.classList.toggle("bad", !plan.check.ok && !plan.same);
  }
  function endReorder(commit) {
    const d = rdrag;
    rdrag = null;
    if (!d) return;
    if (d.ghost) d.ghost.remove();
    drop.classList.remove("show", "bad");
    root.classList.remove("reordering");
    items.querySelector(".tl-item.dragging")?.classList.remove("dragging");
    if (!commit || !d.started || !d.plan || d.plan.same) return;
    if (!d.plan.check.ok) {
      app.toast(`Cannot move ${app.feature(d.id)?.name || "feature"} there: ${d.plan.check.reason}.`, "warning", 3600);
      return;
    }
    const { order, marker } = d.plan;
    const f = app.feature(d.id);
    app.mutate(`Reorder ${f ? f.name : "Feature"}`, (doc) => {
      const byId = new Map(doc.features.map((x) => [x.id, x]));
      doc.features = order.map((id) => byId.get(id)).filter(Boolean);
      doc.marker = Math.max(0, Math.min(doc.features.length, marker));
    });
    anchorId = d.id;
  }

  // ------------------------------------------------------------------ playback
  function stepTo(n) { if (!guard()) return; stopPlay(true); rollTo(app, n); }
  btnFirst.addEventListener("click", () => stepTo(0));
  btnPrev.addEventListener("click", () => stepTo(app.doc.marker - 1));
  btnNext.addEventListener("click", () => stepTo(app.doc.marker + 1));
  btnLast.addEventListener("click", () => stepTo(features().length));
  btnPlay.addEventListener("click", () => { if (play) stopPlay(true); else startPlay(); });

  function startPlay() {
    if (!guard()) return;
    const n = features().length;
    if (!n) return;
    play = { orig: app.doc.marker, timer: 0 };
    if (app.doc.marker >= n) { app.doc.marker = 0; app.recompute(); }
    const step = () => {
      if (!play) return;
      if (app.doc.marker >= features().length) { stopPlay(true); return; }
      app.doc.marker += 1;
      app.recompute();
      play.timer = setTimeout(step, PLAY_STEP_MS);
    };
    play.timer = setTimeout(step, PLAY_STEP_MS);
    render();
  }
  function stopPlay(commit) {
    if (!play) return;
    const p = play;
    play = null;
    clearTimeout(p.timer);
    const fin = app.doc.marker;
    if (commit && fin !== p.orig) {
      app.doc.marker = p.orig;
      internalDoc++;
      try { app.setMarker(fin); } finally { internalDoc--; }
    }
    render();
  }

  // ------------------------------------------------------------------ actions
  function editFeature(id) {
    const f = app.feature(id);
    if (!f) return;
    if (busyReason() && !(app.mode === "sketch" && f.type === "sketch")) { guard(); return; }
    hideTip();
    editingId = id;
    app.editFeature(id);
    scheduleRender();
  }
  function editProfileSketch(id) {
    const sk = profileSketches(app.feature(id))[0];
    if (!sk || !app.feature(sk)) { app.toast("This feature has no profile sketch", "info"); return; }
    if (!guard()) return;
    app.editFeature(sk);
  }
  function rollHere(id) {
    if (!guard()) return;
    stopPlay(true);
    const i = app.featureIndex(id);
    if (i >= 0) rollTo(app, i + 1);
  }
  function suppress(ids, v) {
    if (!guard()) return;
    setSuppressed(app, ids, v);
  }
  function startRename(id) {
    const it = items.querySelector(`.tl-item[data-feature="${CSS.escape(id)}"]`);
    const f = app.feature(id);
    if (!it || !f) return;
    keepVisible(it);
    const r = it.getBoundingClientRect();
    const pop = el("div", { class: "tl-rename-pop" });
    pop.style.left = `${Math.max(4, r.left - 40)}px`;
    pop.style.top = `${r.top - 34}px`;
    (app.dom.overlay || document.body).appendChild(pop);
    renaming = id;
    inlineEdit(pop, f.name, (v) => renameFeature(app, id, v), {
      className: "tl-rename",
      onEnd: () => { pop.remove(); renaming = null; scheduleRender(); },
    });
  }
  function findInBrowser(id) {
    if (app.ui.browser && app.ui.browser.reveal) app.ui.browser.reveal({ kind: "feature", id });
    else app.toast("The Browser is not available", "info");
  }
  function reviewWarning(id) {
    const st = items.querySelector(`.tl-item[data-feature="${CSS.escape(id)}"]`)?._status || {};
    const f = app.feature(id);
    app.toast(`${f ? f.name : ""}: ${st.error || st.warning || "No problems"}`, st.error ? "error" : st.warning ? "warning" : "info", 5000);
  }

  function menuFor(id) {
    const f = app.feature(id);
    if (!f) return [];
    const ids = selectedFeatureIds(id);
    const multi = ids.length > 1;
    const anySup = ids.some((x) => app.feature(x)?.suppressed);
    const anyUnsup = ids.some((x) => !app.feature(x)?.suppressed);
    const st = items.querySelector(`.tl-item[data-feature="${CSS.escape(id)}"]`)?._status || {};
    const hasProfile = profileSketches(f).length > 0;
    const busy = !!busyReason();
    // Fusion's timeline item menu (Light theme, 2026): same items, order and separators
    return [
      { label: "Create Selection Set", act: "selection-set", icon: "m-selset", action: () => notAvailable(app, "Create Selection Set") },
      "-",
      f.type === "sketch"
        ? { label: "Edit Sketch", cmd: "SketchActivate", act: "edit", icon: "m-editprofile", disabled: multi, action: () => editFeature(id) }
        : { label: "Edit Feature", cmd: "FusionEditFeatureCommand", act: "edit", icon: "m-editfeature", disabled: multi || busy, action: () => editFeature(id) },
      hasProfile ? { label: "Edit Profile Sketch", cmd: "ProfileSketchActivate", act: "edit-profile", icon: "m-editprofile", disabled: multi || busy, action: () => editProfileSketch(id) } : null,
      { label: "Configure", cmd: "ConfigureFeatureCmd", act: "configure", icon: "m-configure", disabled: multi, action: () => runCmd(app, "ConfigureFeatureCmd", { id }, () => notAvailable(app, "Configure"), "Configure") },
      "-",
      { label: "Delete", cmd: "FusionDeleteCommand", act: "delete", hint: "Del", icon: "m-delete", disabled: busy, action: () => deleteFeatures(app, ids) },
      { label: "Rename", cmd: "FusionRenameTimelineEntryCommand", act: "rename", disabled: multi, action: () => startRename(id) },
      app.doc.marker < features().length ? { label: "Delete all features after History Marker", cmd: "FusionTrimFeaturesCommand", act: "trim", disabled: busy, action: () => deleteAfterMarker(app) } : null,
      "-",
      { label: "Roll Timeline Marker Here", cmd: "FusionRollCommand", act: "roll", icon: "m-roll", disabled: multi || busy, action: () => rollHere(id) },
      { label: "Convert to DM Feature", cmd: "ConvertToDMFeatureCommand", act: "convert-dm", icon: "m-convert", action: () => notAvailable(app, "Convert to DM Feature") },
      anyUnsup ? { label: "Suppress Features", cmd: "FusionSuppressCommand", act: "suppress", disabled: busy, action: () => suppress(ids, true) } : null,
      anySup ? { label: "Unsuppress Features", cmd: "FusionUnsuppressCommand", act: "unsuppress", disabled: busy, action: () => suppress(ids, false) } : null,
      st.error || st.warning ? { label: "Review Warning", cmd: "FusionLookupErrInfoCommand", act: "review", action: () => reviewWarning(id) } : null,
      "-",
      { label: "Find in Browser", cmd: "FindInBrowser", act: "find-browser", disabled: multi, action: () => findInBrowser(id) },
      { label: "Find in Window", cmd: "FindInWindow", act: "find-window", action: () => findInWindow(app, ids.map((x) => ({ kind: "feature", id: x }))) },
    ].filter((x) => x !== null);
  }

  gear.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const r = gear.getBoundingClientRect();
    showMenu(app, [
      { label: "Show Component Color Swatches", act: "swatches", checked: swatches, action: () => { swatches = !swatches; store.set(KEY_SWATCH, swatches); render(); } },
      "-",
      { label: "Move to End", cmd: "RollToEndCommand", act: "roll-end", disabled: app.doc.marker >= features().length, action: () => stepTo(features().length) },
      { label: "Compute All", cmd: "FusionComputeAllCommand", hint: "Ctrl+B", act: "compute-all", action: () => runCmd(app, "FusionComputeAllCommand", {}, () => { app.evaluator.invalidate(); app.recompute(); }) },
    ], r.right - 200, r.top - 4, { className: "tl-ctx", above: true });
  });

  // Delete key when the selection is only timeline features (picked in the timeline or the
  // browser): Fusion asks before deleting features that others depend on, so this runs ahead
  // of the generic delete routing (capture phase) for that case only.
  window.addEventListener("keydown", (ev) => {
    if (ev.defaultPrevented || (ev.key !== "Delete" && ev.key !== "Backspace")) return;
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (app.activeCommand || app.mode === "sketch" || document.querySelector(".br-modal-back")) return;
    if (api.deleteSelected()) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);

  // ------------------------------------------------------------------ commands (Fusion ids)
  const targetIds = (ctx = {}) => (ctx.id ? [ctx.id] : selectedFeatureIds(null));
  const reg = (def) => app.commands.register({ kind: "ui", ...def });
  reg({ id: "FusionRollCommand", label: "Roll Timeline Marker Here", enabled: () => targetIds().length === 1, run: (a, ctx) => { const id = targetIds(ctx)[0]; if (id) rollHere(id); } });
  reg({ id: "RollToEndCommand", label: "Move to End", run: () => stepTo(features().length) });
  reg({ id: "FusionSuppressCommand", label: "Suppress Features", enabled: () => targetIds().some((id) => !app.feature(id)?.suppressed), run: (a, ctx) => suppress(targetIds(ctx), true) });
  reg({ id: "FusionUnsuppressCommand", label: "Unsuppress Features", enabled: () => targetIds().some((id) => app.feature(id)?.suppressed), run: (a, ctx) => suppress(targetIds(ctx), false) });
  reg({ id: "FusionRenameTimelineEntryCommand", label: "Rename", enabled: () => targetIds().length === 1, run: (a, ctx) => { const id = targetIds(ctx)[0]; if (id) startRename(id); } });
  reg({ id: "ProfileSketchActivate", label: "Edit Profile Sketch", enabled: () => targetIds().length === 1 && profileSketches(app.feature(targetIds()[0])).length > 0, run: (a, ctx) => { const id = targetIds(ctx)[0]; if (id) editProfileSketch(id); } });
  reg({ id: "FusionTrimFeaturesCommand", label: "Delete all features after History Marker", enabled: () => app.doc.marker < features().length, run: () => { if (guard()) deleteAfterMarker(app); } });
  reg({
    id: "FusionFindInTimeline", label: "Find in Timeline",
    enabled: () => app.selection.items.length > 0,
    run: (a, ctx = {}) => {
      const r = ctx.ref || app.selection.items[0];
      if (!r) return;
      let id = null;
      if (r.kind === "feature" || r.kind === "cplane") id = r.id;
      else if (r.body) id = creatorFeature(app, r.body)?.id;
      else if (r.sketch) id = r.sketch;
      if (id) api.reveal(id); else app.toast("This object has no timeline feature", "info");
    },
  });

  // ------------------------------------------------------------------ events
  app.on("model", (d) => { if (!(d && d.preview)) { try { rememberTouched(); } catch (e) { console.error(e); } } scheduleRender(); });
  app.on("doc", (d) => {
    if (play && !internalDoc) { clearTimeout(play.timer); play = null; } // someone else changed the design
    if (d && d.replaced) anchorId = null;
    scheduleRender();
  });
  app.on("history", () => scheduleRender());
  app.on("mode", () => scheduleRender());
  app.on("feature-types", () => { syncFeatureIcons(app); scheduleRender(); });
  app.on("selection", () => updateStates());
  app.on("hover", () => updateStates());
  app.on("command-start", (d) => { if (play) stopPlay(true); if (d && d.id && !String(d.id).startsWith("edit:")) editingId = null; });
  app.on("dialog", () => scheduleRender());

  // ------------------------------------------------------------------ public API
  const api = {
    /** Select a feature in the timeline, scroll it into view and flash it. */
    reveal(id) {
      const f = app.feature(id);
      if (!f) return false;
      render();
      const it = items.querySelector(`.tl-item[data-feature="${CSS.escape(id)}"]`);
      if (!it) return false;
      const ref = featureRef(id);
      if (app.selection.accepts(ref)) { anchorId = id; app.selection.set([ref]); }
      keepVisible(it);
      it.classList.remove("flash");
      void it.offsetWidth;
      it.classList.add("flash");
      setTimeout(() => it.classList.remove("flash"), 1300);
      return true;
    },
    refresh() { render(); },
    /** Edit Feature (marks the item as being edited while its dialog is open). */
    edit(id) { editFeature(id); },
    rename(id) { startRename(id); },
    /** Delete the selected timeline features (with Fusion's dependent-feature prompt). Returns true if handled. */
    deleteSelected() {
      const items0 = app.selection.items;
      if (!items0.length) return false;
      const ids = items0.filter((r) => r.kind === "feature" || r.kind === "cplane").map((r) => r.id).filter((id) => app.feature(id));
      if (!ids.length || ids.length !== items0.length) return false;
      deleteFeatures(app, ids);
      return true;
    },
    deleteFeatures: (ids, opts) => deleteFeatures(app, ids, opts),
    canMove: (from, to) => canMove(app, from, to),
    /** Move feature `id` so that it ends at index `to`; returns {ok, reason?}. */
    move(id, to) {
      const from = app.featureIndex(id);
      if (from < 0) return { ok: false, reason: "No such feature" };
      to = Math.max(0, Math.min(features().length - 1, to));
      if (from === to) return { ok: true };
      const chk = canMove(app, from, to);
      if (!chk.ok) return chk;
      const wasActive = from < app.doc.marker;
      app.mutate(`Reorder ${app.feature(id).name}`, (doc) => {
        const [f] = doc.features.splice(from, 1);
        doc.features.splice(to, 0, f);
        if (wasActive && to >= doc.marker) doc.marker -= 1;
        else if (!wasActive && to < doc.marker) doc.marker += 1;
        doc.marker = Math.max(0, Math.min(doc.features.length, doc.marker));
      });
      return { ok: true };
    },
    play: () => startPlay(),
    stop: () => stopPlay(true),
    get playing() { return !!play; },
    get element() { return root; },
  };
  app.ui.timeline = api;

  render();
}
