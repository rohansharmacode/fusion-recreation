// NAVIGATOR (GraphViewCmd, INSPECT dropdown): "Shows how data elements connect in a visual graph."
// The recreation has one design and no external data, so the graph shows how the design's own
// elements connect: sketches, construction planes, timeline features and bodies, with an arrow from
// every element to the elements that use it (profiles, planes, faces / edges, participant bodies)
// and from each feature to the bodies it creates or modifies. Layered left to right by dependency
// depth. Click selects (canvas, browser, timeline), double-click edits the feature, hovering
// highlights the upstream and downstream chain, wheel zooms, drag pans.
import { el, esc, palette, getPalette, GL } from "./ui.js";
import { explicitDeps, bodyCreators, bodiesTouched } from "../timeline/deps.js";

const SVGNS = "http://www.w3.org/2000/svg";
const NODE_W = 132, NODE_H = 26, COL_W = 176, ROW_H = 36;
const COLORS = { sketch: ["#fff4e6", "#e2700a"], cplane: ["#fff8dc", "#c0820c"], feature: ["#eaf3fd", "#1f6fb8"], body: ["#f1f1f1", "#6b737b"], error: ["#fdecea", "#d9302c"] };

/** Graph of the design: {nodes:[{id, kind, label, type, layer, row, ref}], edges:[{from, to}]} */
export function designGraph(app, opts = {}) {
  const doc = app.doc;
  const results = (app.result && app.result.results) || {};
  const creators = bodyCreators(doc);
  const feats = doc.features.filter((f) => (opts.sketches !== false || f.type !== "sketch") && (opts.construction !== false || f.type !== "cplane"));
  const ids = new Set(feats.map((f) => f.id));
  const nodes = new Map();
  const edges = [];
  for (const f of feats) {
    const r = results[f.id] || {};
    nodes.set(`f:${f.id}`, { id: `f:${f.id}`, kind: f.type === "sketch" ? "sketch" : f.type === "cplane" ? "cplane" : "feature", type: f.type, label: f.name, fid: f.id, error: r.ok === false, rolled: !!r.rolled, suppressed: !!f.suppressed, ref: { kind: "feature", id: f.id } });
  }
  for (const f of feats) {
    for (const d of explicitDeps(doc, results, f, creators)) if (ids.has(d)) edges.push({ from: `f:${d}`, to: `f:${f.id}` });
  }
  if (opts.bodies !== false) {
    const alive = app.result ? [...app.result.state.bodies.keys()] : [];
    for (const b of alive) nodes.set(`b:${b}`, { id: `b:${b}`, kind: "body", label: (doc.bodies[b] || {}).name || b, body: b, ref: { kind: "body", body: b } });
    for (const f of feats) {
      for (const b of bodiesTouched(doc, results, f)) if (nodes.has(`b:${b}`)) edges.push({ from: `f:${f.id}`, to: `b:${b}` });
    }
  }
  // layers: longest path over features (timeline order is topological), bodies in the last column
  const layer = new Map();
  const preds = new Map();
  for (const e of edges) { if (!preds.has(e.to)) preds.set(e.to, []); preds.get(e.to).push(e.from); }
  let maxL = 0;
  for (const f of feats) {
    const id = `f:${f.id}`;
    const L = Math.max(-1, ...(preds.get(id) || []).filter((p) => layer.has(p)).map((p) => layer.get(p))) + 1;
    layer.set(id, L);
    maxL = Math.max(maxL, L);
  }
  for (const n of nodes.values()) if (n.kind === "body") layer.set(n.id, maxL + 1);
  // rows: order inside a column by the mean row of the predecessors (barycentre), then timeline order
  const cols = new Map();
  for (const n of nodes.values()) { n.layer = layer.get(n.id) || 0; if (!cols.has(n.layer)) cols.set(n.layer, []); cols.get(n.layer).push(n); }
  const rowOf = new Map();
  for (const L of [...cols.keys()].sort((a, b) => a - b)) {
    const list = cols.get(L);
    const key = (n) => { const ps = (preds.get(n.id) || []).filter((p) => rowOf.has(p)); return ps.length ? ps.reduce((s, p) => s + rowOf.get(p), 0) / ps.length : -1; };
    list.forEach((n, i) => { n._k = key(n); n._i = i; });
    list.sort((a, b) => (a._k - b._k) || (a._i - b._i));
    list.forEach((n, i) => { n.row = i; rowOf.set(n.id, i); });
  }
  return { nodes: [...nodes.values()], edges, layers: maxL + 2 };
}

function openNavigator(app) {
  const existing = getPalette("navigator");
  if (existing) { existing.front(); return existing; }
  const st = { sketches: true, construction: true, bodies: true, zoom: 1, pan: [20, 20], hover: null, sel: null, graph: null };
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("class", "mg-nav-svg");
  const g = document.createElementNS(SVGNS, "g");
  svg.append(g);
  const empty = el("div", { class: "mg-nav-empty", text: "The design has no features yet. Create a sketch or a feature and it appears here." });
  const view = el("div", { class: "mg-nav-view", "data-region": "graph" }, svg, empty);
  const chk = (key, label) => {
    const c = el("input", { type: "checkbox", checked: st[key], "data-filter": key });
    c.addEventListener("change", () => { st[key] = c.checked; draw(); });
    return el("label", { class: "mg-check" }, c, el("span", { text: label }));
  };
  const fitB = el("button", { type: "button", class: "mg-ed-btn", "data-action": "fit", title: "Fit", html: `${GL.fit}<span>Fit</span>` });
  fitB.addEventListener("click", () => fit());
  const info = el("span", { class: "mg-nav-info" });
  const bar = el("div", { class: "mg-nav-bar" }, chk("sketches", "Sketches"), chk("construction", "Construction"), chk("bodies", "Bodies"), el("span", { class: "mg-ed-sp" }), info, fitB);
  const legend = el("div", { class: "mg-nav-legend", html: ["sketch:Sketch", "cplane:Construction", "feature:Feature", "body:Body"].map((s) => { const [k, l] = s.split(":"); return `<span><i style="background:${COLORS[k][0]};border-color:${COLORS[k][1]}"></i>${l}</span>`; }).join("") + '<span class="mg-nav-hint">Click to select · double-click to edit · wheel to zoom · drag to pan</span>' });
  const body = el("div", { class: "mg-nav" }, bar, view, legend);
  const pal = palette(app, { id: "navigator", title: "Navigator", body, width: 820, height: 480, foot: false, className: "mg-nav-pal", onClose: () => { off(); offSel(); } });

  const pos = (n) => [n.layer * COL_W, n.row * ROW_H];
  function upstreamDownstream(id) {
    const s = new Set([id]);
    const E = st.graph.edges;
    let grow = true;
    const up = new Set([id]), down = new Set([id]);
    while (grow) {
      grow = false;
      for (const e of E) {
        if (down.has(e.from) && !down.has(e.to)) { down.add(e.to); grow = true; }
        if (up.has(e.to) && !up.has(e.from)) { up.add(e.from); grow = true; }
      }
    }
    for (const x of up) s.add(x);
    for (const x of down) s.add(x);
    return s;
  }
  function draw() {
    st.graph = designGraph(app, { sketches: st.sketches, construction: st.construction, bodies: st.bodies });
    const G = st.graph;
    empty.style.display = G.nodes.length ? "none" : "";
    info.textContent = `${G.nodes.filter((n) => n.kind !== "body").length} features · ${G.nodes.filter((n) => n.kind === "body").length} bodies · ${G.edges.length} connections`;
    const hl = st.hover ? upstreamDownstream(st.hover) : null;
    const byId = new Map(G.nodes.map((n) => [n.id, n]));
    let html = "";
    for (const e of G.edges) {
      const a = byId.get(e.from), b = byId.get(e.to);
      if (!a || !b) continue;
      const [x1, y1] = pos(a), [x2, y2] = pos(b);
      const sx = x1 + NODE_W, sy = y1 + NODE_H / 2, ex = x2, ey = y2 + NODE_H / 2;
      const mx = (sx + ex) / 2;
      const on = hl && hl.has(e.from) && hl.has(e.to);
      html += `<path class="mg-nav-edge${on ? " on" : ""}${hl && !on ? " dim" : ""}" d="M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex - 6},${ey}" marker-end="url(#mgNavArrow${on ? "On" : ""})" data-edge="${esc(e.from)}>${esc(e.to)}"/>`;
    }
    for (const n of G.nodes) {
      const [x, y] = pos(n);
      const [fill, stroke] = COLORS[n.error ? "error" : n.kind];
      const cls = `mg-nav-node${n.id === st.sel ? " sel" : ""}${hl && !hl.has(n.id) ? " dim" : ""}${n.suppressed || n.rolled ? " off" : ""}`;
      const label = n.label.length > 19 ? `${n.label.slice(0, 18)}…` : n.label;
      html += `<g class="${cls}" data-node="${esc(n.id)}" transform="translate(${x},${y})"><rect width="${NODE_W}" height="${NODE_H}" rx="${n.kind === "body" ? 13 : 3}" fill="${fill}" stroke="${stroke}"/><text x="${NODE_W / 2}" y="${NODE_H / 2 + 4}" text-anchor="middle">${esc(label)}</text><title>${esc(n.label)}${n.error ? " (error)" : n.suppressed ? " (suppressed)" : n.rolled ? " (rolled back)" : ""}</title></g>`;
    }
    g.innerHTML = `<defs><marker id="mgNavArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8a96a2"/></marker><marker id="mgNavArrowOn" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#0566dd"/></marker></defs>${html}`;
    applyView();
  }
  function applyView() { g.setAttribute("transform", `translate(${st.pan[0]},${st.pan[1]}) scale(${st.zoom})`); }
  function fit() {
    const G = st.graph;
    if (!G || !G.nodes.length) return;
    const w = Math.max(...G.nodes.map((n) => pos(n)[0])) + NODE_W, h = Math.max(...G.nodes.map((n) => pos(n)[1])) + NODE_H;
    const r = view.getBoundingClientRect();
    st.zoom = Math.max(0.25, Math.min(1.6, Math.min((r.width - 40) / w, (r.height - 40) / h)));
    st.pan = [(r.width - w * st.zoom) / 2, (r.height - h * st.zoom) / 2];
    applyView();
  }
  const nodeAt = (t) => { const n = t && t.closest && t.closest("[data-node]"); return n ? n.getAttribute("data-node") : null; };
  svg.addEventListener("pointermove", (ev) => {
    if (drag) return;
    const id = nodeAt(ev.target);
    if (id !== st.hover) { st.hover = id; draw(); const n = id && st.graph.nodes.find((x) => x.id === id); try { app.selection.setHover(n ? n.ref : null); } catch { /* ignore */ } }
  });
  svg.addEventListener("pointerleave", () => { if (st.hover) { st.hover = null; draw(); try { app.selection.setHover(null); } catch { /* ignore */ } } });
  let drag = null;
  svg.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    const id = nodeAt(ev.target);
    if (id) return;
    drag = { x: ev.clientX, y: ev.clientY, pan: [...st.pan] };
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener("pointermove", (ev) => { if (!drag) return; st.pan = [drag.pan[0] + ev.clientX - drag.x, drag.pan[1] + ev.clientY - drag.y]; applyView(); });
  svg.addEventListener("pointerup", () => { drag = null; });
  svg.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const r = view.getBoundingClientRect();
    const px = ev.clientX - r.left, py = ev.clientY - r.top;
    const k = Math.exp(-ev.deltaY * 0.0015);
    const z = Math.max(0.2, Math.min(3, st.zoom * k));
    st.pan = [px - ((px - st.pan[0]) * z) / st.zoom, py - ((py - st.pan[1]) * z) / st.zoom];
    st.zoom = z;
    applyView();
  }, { passive: false });
  svg.addEventListener("click", (ev) => {
    const id = nodeAt(ev.target);
    const n = id && st.graph.nodes.find((x) => x.id === id);
    st.sel = n ? n.id : null;
    if (n) { try { app.selection.set([n.ref]); } catch { /* ignore */ } } else app.selection.clear();
    draw();
  });
  svg.addEventListener("dblclick", (ev) => {
    const id = nodeAt(ev.target);
    const n = id && st.graph.nodes.find((x) => x.id === id);
    if (!n) return;
    if (n.fid) { pal.front(); app.editFeature(n.fid); }
    else if (n.body && app.ui.browser) app.ui.browser.reveal(n.ref);
  });
  const off = app.on("model", (d) => { if (!d || !d.preview) draw(); });
  const offSel = app.on("selection", () => {
    const r = app.selection.items[0];
    const id = r ? (r.kind === "feature" ? `f:${r.id}` : r.kind === "body" ? `b:${r.body}` : null) : null;
    if (id !== st.sel) { st.sel = id; draw(); }
  });
  draw();
  requestAnimationFrame(() => fit());
  pal.navigator = { state: st, draw, fit, graph: () => st.graph };
  return pal;
}

export function registerNavigator(app) {
  app.commands.register({
    id: "GraphViewCmd", label: "Navigator", kind: "ui",
    tooltip: "Shows how data elements connect in a visual graph.",
    run: (a) => openNavigator(a),
  });
}
