// SELECT panel > Selection Tools (Fusion 2706) and Selection Filters:
//   SelectByNameCommand                     Select By Name: Name, Bodies, Components, Find, Selected Items
//   FusionSelectBodiesBySizeCommand         Select By Size: Selection Filters (Body / Component), Size range sliders
//   SelectByBoundaryCommand                 Select By Boundary: Centroid, Boundary Shape (Box / Cylinder / Sphere),
//                                           Selection Type (Inside / Outside Boundary), Intersected, Boundary Size
//   SelectByInvertCommand                   Invert Selection (keeps the kind of what is selected)
//   FusionSelectSeedAndBoundaryFacesCommand Seed And Boundary: Boundary Objects, Seed Object, Include Boundary
//                                           Objects, Update, Selection Set
//   SelectionFilterCommand                  Selection Filters: the toolbar's check-box list now really filters
//                                           canvas picks (app.selection.accepts), see installSelectionFilters().
// Matches are pre-highlighted on the canvas while a dialog is open; OK selects them (canvas + browser).
import { el, esc, lrow, toBodyRef, visibleBodies, bodyName, faceRefs, edgeRefs, previewHighlight, beginModel } from "./ui.js";

const DIAG = (bb) => Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);

function countRow(id, get) {
  return {
    id, type: "custom", label: "Selected Items",
    render() { return lrow("Selected Items", el("div", { class: "mg-count", "data-input": id, text: "0" })); },
    update(e, d) { const c = e.querySelector(".mg-count"); const n = get(d); c.textContent = String(n); c.dataset.count = String(n); },
  };
}

function finishSelect(app, refs) {
  previewHighlight(app, []);
  if (refs && refs.length) app.selection.set(refs);
  else app.selection.clear();
  try { if (refs && refs[0] && app.ui.browser && refs[0].kind === "body") app.ui.browser.reveal(refs[0]); } catch { /* ignore */ }
  try { if (app.ui.browser) app.ui.browser.refresh(); } catch { /* ignore */ }
}

// ------------------------------------------------------------------------------------------------
// Select By Name
// ------------------------------------------------------------------------------------------------
export function findByName(app, text, { bodies = true } = {}) {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return [];
  const out = [];
  if (bodies) for (const b of app.bodies()) {
    const n = bodyName(app, b.id).toLowerCase();
    if (n.includes(q) && (app.doc.bodies[b.id] || {}).selectable !== false) out.push({ kind: "body", body: b.id });
  }
  return out;
}

function openSelectByName(app) {
  beginModel(app);
  let matches = [];
  let found = false;
  const find = (d) => {
    matches = findByName(app, d.values.text, { bodies: d.values.bodies, components: d.values.components });
    found = true;
    previewHighlight(app, matches);
    d.refresh();
    if (!matches.length) d.message(d.values.text ? `No bodies or components named "${d.values.text}"` : "Enter a name to search for", "warning");
    else d.message(`${matches.length} item${matches.length === 1 ? "" : "s"} found`, "info");
  };
  return app.ui.dialog.open({
    id: "SelectByNameCommand",
    title: "Select By Name",
    icon: "SelectByNameCommand",
    help: "Selects bodies or components by the name used in the Browser. Enter a portion of the name, check the object types to include, then click Find.",
    preview: false, noFeature: true, activate: false, ctrlWidth: 150,
    values: { text: "" },
    rows: [
      {
        id: "name", type: "custom", label: "Name",
        render(d) {
          const inp = el("input", { type: "text", class: "mg-text", "data-input": "name", placeholder: "", spellcheck: "false", autocomplete: "off" });
          inp.addEventListener("input", () => { d.values.text = inp.value; found = false; });
          inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); find(d); } });
          setTimeout(() => { try { inp.focus(); } catch { /* ignore */ } }, 30);
          return lrow("Name", inp);
        },
        update() {},
      },
      { id: "bodies", type: "check", label: "Bodies", default: true, tooltip: "Selects solid and surface bodies that match the search." },
      { id: "components", type: "check", label: "Components", default: true, tooltip: "Selects internal and external components that match the search (this design has only the root component)." },
      {
        id: "find", type: "custom", label: "",
        render(d) { return lrow("", el("button", { type: "button", class: "mg-btn", "data-input": "find", "data-action": "find", text: "Find", on: { click: () => find(d) } })); },
        update(e, d) { e.querySelector("button").disabled = !String(d.values.text || "").trim(); },
      },
      countRow("count", () => matches.length),
    ],
    onChange(id, d) { if (id === "bodies" || id === "components") { if (found) find(d); } },
    commit(_f, d) { if (!found) find(d); return matches.slice(); },
    afterCommit(refs) { finishSelect(app, refs); },
    onClose() { previewHighlight(app, []); },
  });
}

// ------------------------------------------------------------------------------------------------
// Select By Size
// ------------------------------------------------------------------------------------------------
export function bodiesBySize(app, lo, hi) {
  const out = [];
  for (const b of visibleBodies(app)) {
    const bb = app.K.bboxOf(b.shape);
    if (!bb) continue;
    const s = DIAG(bb);
    if (s >= lo - 1e-6 && s <= hi + 1e-6 && (app.doc.bodies[b.id] || {}).selectable !== false) out.push({ kind: "body", body: b.id });
  }
  return out;
}

function openSelectBySize(app) {
  beginModel(app);
  const sizes = visibleBodies(app).map((b) => { const bb = app.K.bboxOf(b.shape); return bb ? DIAG(bb) : 0; }).filter((x) => x > 0);
  const lo0 = sizes.length ? Math.min(...sizes) : 0;
  const hi0 = sizes.length ? Math.max(...sizes) : 100;
  const rmin = Math.floor(lo0 * 100) / 100, rmax = Math.max(rmin + 0.01, Math.ceil(hi0 * 100) / 100);
  const st = { lo: rmin, hi: rmax, filter: "body" };
  let matches = [];
  const recompute = (d) => {
    matches = st.filter === "body" ? bodiesBySize(app, st.lo, st.hi) : [];
    previewHighlight(app, matches);
    if (d) d.refresh();
  };
  recompute(null);
  if (!sizes.length) app.toast("There are no visible bodies to select", "info", 2500);
  return app.ui.dialog.open({
    id: "FusionSelectBodiesBySizeCommand",
    title: "Select By Size",
    icon: "FusionSelectBodiesBySizeCommand",
    help: "Selects bodies or components within a size range. The size is the distance between the opposing diagonal corners of the bounding box.",
    preview: false, noFeature: true, activate: false, ctrlWidth: 190,
    rows: [
      {
        id: "filter", type: "custom", label: "Selection Filters",
        render(d) {
          const mk = (v, label, dis) => el("button", { type: "button", class: "mg-tog", "data-option": v, title: label, text: label, disabled: dis, on: { click: () => { st.filter = v; recompute(d); } } });
          return lrow("Selection Filters", el("div", { class: "mg-togs", "data-input": "filter" }, mk("body", "Body"), mk("component", "Component", true)));
        },
        update(e) { for (const b of e.querySelectorAll("[data-option]")) b.classList.toggle("on", b.dataset.option === st.filter); e.querySelector(".mg-togs").dataset.value = st.filter; },
      },
      {
        id: "size", type: "custom", label: "Size",
        render(d) {
          const step = Math.max(0.01, (rmax - rmin) / 200);
          const sMin = el("input", { type: "range", class: "mg-range mg-range-lo", min: rmin, max: rmax, step, value: rmin, "data-input": "minSlider" });
          const sMax = el("input", { type: "range", class: "mg-range mg-range-hi", min: rmin, max: rmax, step, value: rmax, "data-input": "maxSlider" });
          const tMin = el("input", { type: "text", class: "mg-num", "data-input": "min", value: `${rmin.toFixed(2)} mm` });
          const tMax = el("input", { type: "text", class: "mg-num", "data-input": "max", value: `${rmax.toFixed(2)} mm` });
          const sync = () => { sMin.value = st.lo; sMax.value = st.hi; tMin.value = `${st.lo.toFixed(2)} mm`; tMax.value = `${st.hi.toFixed(2)} mm`; };
          sMin.addEventListener("input", () => { st.lo = Math.min(Number(sMin.value), st.hi); sync(); recompute(d); });
          sMax.addEventListener("input", () => { st.hi = Math.max(Number(sMax.value), st.lo); sync(); recompute(d); });
          const parse = (t) => { const v = Number.parseFloat(String(t.value).replace(",", ".")); return Number.isFinite(v) ? v : null; };
          tMin.addEventListener("change", () => { const v = parse(tMin); if (v !== null) st.lo = Math.max(0, Math.min(v, st.hi)); sync(); recompute(d); });
          tMax.addEventListener("change", () => { const v = parse(tMax); if (v !== null) st.hi = Math.max(v, st.lo); sync(); recompute(d); });
          for (const t of [tMin, tMax]) t.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); t.dispatchEvent(new Event("change")); } });
          return lrow("Size", el("div", { class: "mg-size" }, el("div", { class: "mg-dual" }, sMin, sMax), el("div", { class: "mg-size-vals" }, tMin, el("span", { class: "mg-dash", text: "–" }), tMax)));
        },
        update() {},
      },
      countRow("count", () => matches.length),
    ],
    commit() { return matches.slice(); },
    afterCommit(refs) { finishSelect(app, refs); },
    onClose() { previewHighlight(app, []); },
  });
}

// ------------------------------------------------------------------------------------------------
// Select By Boundary
// ------------------------------------------------------------------------------------------------
function insideTest(shape, c, v) {
  const x = v[0] - c[0], y = v[1] - c[1], z = v[2] - c[2];
  if (shape.type === "box") return Math.abs(x) <= shape.x / 2 + 1e-9 && Math.abs(y) <= shape.y / 2 + 1e-9 && Math.abs(z) <= shape.z / 2 + 1e-9;
  if (shape.type === "cylinder") return Math.abs(x) <= shape.x / 2 + 1e-9 && y * y + z * z <= shape.r * shape.r + 1e-9;
  return x * x + y * y + z * z <= shape.r * shape.r + 1e-9;
}

/** Bodies classified against a boundary {type, x, y, z, r} centred at c: {inside, outside, crossing} (body refs). */
export function classifyBoundary(app, c, shape) {
  const res = { inside: [], outside: [], crossing: [] };
  for (const b of visibleBodies(app)) {
    let md = null;
    try { md = app.viewport.meshFor(b.shape); } catch { md = null; }
    if (!md || !md.vertices) continue;
    const V = md.vertices;
    let nin = 0, nout = 0;
    const step = Math.max(1, Math.floor(V.length / 3 / 4000));
    for (let i = 0; i < V.length / 3; i += step) {
      if (insideTest(shape, c, [V[i * 3], V[i * 3 + 1], V[i * 3 + 2]])) nin++; else nout++;
      if (nin && nout) break;
    }
    // a boundary entirely inside a body crosses it too
    if (!nin) {
      const bb = app.K.bboxOf(b.shape);
      if (bb && c.every((v, k) => v >= bb.min[k] && v <= bb.max[k])) { res.crossing.push({ kind: "body", body: b.id }); continue; }
    }
    const ref = { kind: "body", body: b.id };
    if (nin && !nout) res.inside.push(ref);
    else if (nin && nout) res.crossing.push(ref);
    else res.outside.push(ref);
  }
  return res;
}

function openSelectByBoundary(app, ctx = {}) {
  beginModel(app);
  const K = app.K;
  let matches = [];
  let center = null;
  const centerOf = (id) => {
    try { const mp = app.ui.inspect && app.ui.inspect.massProperties([id]); if (mp && mp.com && mp.com.every(Number.isFinite)) return mp.com; } catch { /* fall back */ }
    const b = app.body(id);
    const bb = b && K.bboxOf(b.shape);
    return bb ? [0, 1, 2].map((k) => (bb.min[k] + bb.max[k]) / 2) : [0, 0, 0];
  };
  const shapeOf = (d) => ({ type: d.values.shape, x: d.num("xsize"), y: d.num("ysize"), z: d.num("zsize"), r: d.num("radius") });
  const recompute = (d) => {
    const c0 = d.values.centroid && d.values.centroid[0];
    center = c0 ? centerOf(c0.body) : null;
    if (!center) { matches = []; previewHighlight(app, []); return; }
    const sh = shapeOf(d);
    if (![sh.x, sh.y, sh.z, sh.r].every((v) => Number.isFinite(v) && v > 0)) { matches = []; previewHighlight(app, []); return; }
    const cls = classifyBoundary(app, center, sh);
    matches = d.values.type === "outside" ? cls.outside : cls.inside;
    if (d.values.intersected) matches = [...matches, ...cls.crossing];
    previewHighlight(app, matches);
  };
  const pre = (ctx.preselect || app.selection.items || []).map(toBodyRef).filter((r) => r && r.kind === "body").slice(0, 1);
  const boundaryShape = (d) => {
    const sh = shapeOf(d);
    const R = K.R;
    if (!center || ![sh.x, sh.y, sh.z, sh.r].every((v) => Number.isFinite(v) && v > 0)) return null;
    try {
      if (sh.type === "box") return R.makeBox([center[0] - sh.x / 2, center[1] - sh.y / 2, center[2] - sh.z / 2], [center[0] + sh.x / 2, center[1] + sh.y / 2, center[2] + sh.z / 2]);
      if (sh.type === "cylinder") return R.makeCylinder(sh.r, sh.x, [center[0] - sh.x / 2, center[1], center[2]], [1, 0, 0]);
      return R.makeSphere(sh.r).translate(center);
    } catch (e) { console.warn("[manage] boundary shape failed", e); return null; }
  };
  let shownShape = null;
  return app.ui.dialog.open({
    id: "SelectByBoundaryCommand",
    title: "Select By Boundary",
    icon: "SelectByBoundaryCommand",
    help: "Selects objects using a boundary shape. Select a body to set the centroid, then the boundary shape, Selection Type, and whether intersected objects are selected.",
    preview: false, noFeature: true, ctrlWidth: 150, focusHud: false,
    preselect: pre,
    rows: [
      { id: "centroid", type: "selection", label: "Centroid", kinds: ["body", "face", "edge"], mapRef: toBodyRef, max: 1, prompt: "Select a solid or surface body to define the centroid" },
      { id: "shape", type: "dropdown", label: "Boundary Shape", default: "box", options: [{ value: "box", label: "Box" }, { value: "cylinder", label: "Cylinder" }, { value: "sphere", label: "Sphere" }] },
      { id: "type", type: "dropdown", label: "Selection Type", default: "inside", options: [{ value: "inside", label: "Inside Boundary" }, { value: "outside", label: "Outside Boundary" }] },
      { id: "intersected", type: "check", label: "Intersected", default: false, tooltip: "Also selects objects that are partially inside the boundary." },
      {
        id: "sizeGroup", type: "group", label: "Boundary Size", header: () => "Boundary Size",
        rows: [
          { id: "xsize", type: "value", label: "X-Axis", kind: "length", positive: true, default: "50.00 mm", visible: (v) => v.shape !== "sphere" },
          { id: "ysize", type: "value", label: "Y-Axis", kind: "length", positive: true, default: "50.00 mm", visible: (v) => v.shape === "box" },
          { id: "zsize", type: "value", label: "Z-Axis", kind: "length", positive: true, default: "50.00 mm", visible: (v) => v.shape === "box" },
          { id: "radius", type: "value", label: "Radius", kind: "length", positive: true, default: "25.00 mm", visible: (v) => v.shape !== "box" },
        ],
      },
      countRow("count", () => matches.length),
    ],
    onChange(id, d) {
      if (id === "centroid") {
        const c0 = d.values.centroid && d.values.centroid[0];
        if (c0) {
          // size the boundary from the centroid body (1.5 x its box) unless the user typed sizes
          const b = app.body(c0.body);
          const bb = b && K.bboxOf(b.shape);
          if (bb) {
            const ext = [0, 1, 2].map((k) => Math.max(1, (bb.max[k] - bb.min[k]) * 1.5));
            const fmt = (v) => `${v.toFixed(2)} mm`;
            if (!d.touched.has("xsize")) d.values.xsize = fmt(ext[0]);
            if (!d.touched.has("ysize")) d.values.ysize = fmt(ext[1]);
            if (!d.touched.has("zsize")) d.values.zsize = fmt(ext[2]);
            if (!d.touched.has("radius")) d.values.radius = fmt(Math.max(ext[0], ext[1], ext[2]) / 2);
          }
        }
      }
    },
    afterPreview(d) {
      recompute(d);
      const s = boundaryShape(d);
      if (shownShape && shownShape !== s) { try { shownShape.delete(); } catch { /* ignore */ } }
      shownShape = s;
      try { app.viewport.setPreview(s ? [{ shape: s, color: "#3c8fe0", opacity: 0.12 }] : []); } catch (e) { console.warn(e); }
      const cnt = d.el.querySelector('[data-input="count"]');
      if (cnt) { cnt.textContent = String(matches.length); cnt.dataset.count = String(matches.length); }
    },
    manipulators(d) {
      if (!center) return [];
      const sh = d.values.shape;
      const m = [];
      const push = (x) => { if (x) m.push(x); };
      if (sh !== "sphere") push(d.valueManip("xsize", { origin: center, dir: [1, 0, 0], scale: 0.5, min: 0.01 }));
      if (sh === "box") {
        push(d.valueManip("ysize", { origin: center, dir: [0, 1, 0], scale: 0.5, min: 0.01 }));
        push(d.valueManip("zsize", { origin: center, dir: [0, 0, 1], scale: 0.5, min: 0.01 }));
      } else push(d.valueManip("radius", { origin: center, dir: sh === "cylinder" ? [0, 0, 1] : [0, 1, 0], min: 0.01 }));
      return m;
    },
    status: () => (matches.length ? `${matches.length} Bod${matches.length === 1 ? "y" : "ies"}` : ""),
    commit() { return matches.slice(); },
    afterCommit(refs) { finishSelect(app, refs); },
    onClose() {
      previewHighlight(app, []);
      try { app.viewport.clearPreview(); } catch { /* ignore */ }
      if (shownShape) { try { shownShape.delete(); } catch { /* ignore */ } shownShape = null; }
    },
  });
}

// ------------------------------------------------------------------------------------------------
// Invert Selection
// ------------------------------------------------------------------------------------------------
/** The refs that Invert Selection would select for the current selection. */
export function invertedSelection(app) {
  const sel = app.selection.items;
  const accepts = (r) => app.selection.accepts(r);
  const keys = new Set(sel.map((r) => keyOf(r)));
  const kinds = new Set(sel.map((r) => r.kind));
  const bodies = visibleBodies(app).map((b) => b.id);
  let pool = [];
  const prio = (app.viewport && app.viewport.selectionPriority) || "face";
  if (!sel.length) {
    pool = prio === "edge" ? bodies.flatMap((id) => edgeRefs(app, id)) : bodies.map((id) => ({ kind: "body", body: id }));
  } else {
    if (kinds.has("body")) pool.push(...bodies.map((id) => ({ kind: "body", body: id })));
    if (kinds.has("face")) pool.push(...bodies.flatMap((id) => faceRefs(app, id)));
    if (kinds.has("edge")) pool.push(...bodies.flatMap((id) => edgeRefs(app, id)));
    const sketches = new Set(sel.filter((r) => r.sketch).map((r) => r.sketch));
    for (const sid of sketches) {
      const s = app.sketchState(sid);
      if (!s) continue;
      if (kinds.has("sketchCurve")) for (const c of Object.keys(s.sk.curves)) pool.push({ kind: "sketchCurve", sketch: sid, curve: c });
      if (kinds.has("sketchPoint")) for (const p of Object.keys(s.sk.points)) pool.push({ kind: "sketchPoint", sketch: sid, point: p });
      if (kinds.has("profile")) for (const r of (s.regions && s.regions.regions) || []) pool.push({ kind: "profile", sketch: sid, key: r.key });
    }
    if (kinds.has("feature")) for (const f of app.doc.features) pool.push({ kind: "feature", id: f.id });
  }
  return pool.filter((r) => !keys.has(keyOf(r)) && accepts(r));
}
function keyOf(r) {
  switch (r.kind) {
    case "body": return `b:${r.body}`;
    case "face": return `f:${r.body}:${r.index}`;
    case "edge": return `e:${r.body}:${r.index}`;
    case "sketchCurve": return `c:${r.sketch}:${r.curve}`;
    case "sketchPoint": return `p:${r.sketch}:${r.point}`;
    case "profile": return `r:${r.sketch}:${r.key}`;
    case "feature": return `t:${r.id}`;
    default: return JSON.stringify(r);
  }
}

function invertSelection(app) {
  if (app.activeCommand) { app.toast("Finish the active command before inverting the selection", "info", 2200); return; }
  const refs = invertedSelection(app);
  app.selection.set(refs);
  app.toast(refs.length ? `Selection inverted: ${refs.length} item${refs.length === 1 ? "" : "s"} selected` : "Nothing else to select", "info", 1600);
}

// ------------------------------------------------------------------------------------------------
// Seed And Boundary
// ------------------------------------------------------------------------------------------------
/**
 * Faces reachable from the seed face across shared edges without crossing a boundary face or a
 * boundary edge. boundary: [{kind:'face'|'edge', body, index}], seed: {body, index}. -> [face index]
 */
export function seedAndBoundaryFaces(app, seed, boundary) {
  const b = app.body(seed.body);
  if (!b) return null;
  const T = app.K.topoOf(b.shape);
  const blockF = new Set(boundary.filter((r) => r.kind === "face" && r.body === seed.body).map((r) => r.index));
  const blockE = new Set(boundary.filter((r) => r.kind === "edge" && r.body === seed.body).map((r) => r.index));
  if (blockF.has(seed.index)) return null;
  const nb = T.faces.map(() => []);
  T.edges.forEach((e, ei) => {
    if (blockE.has(ei)) return;
    for (const a of e.faces) for (const c of e.faces) if (a !== c && !nb[a].includes(c)) nb[a].push(c);
  });
  const seen = new Set([seed.index]);
  const q = [seed.index];
  while (q.length) {
    const f = q.shift();
    for (const g of nb[f] || []) if (!seen.has(g) && !blockF.has(g)) { seen.add(g); q.push(g); }
  }
  return [...seen].sort((x, y) => x - y);
}

function openSeedAndBoundary(app, ctx = {}) {
  beginModel(app);
  let result = null; // [face refs] after Update
  let stale = true;
  const update = (d) => {
    const seed = (d.values.seed || [])[0];
    const bnd = d.values.boundary || [];
    if (!seed) { d.message("Select a face on the body to use as the seed object", "warning"); return; }
    const faces = seedAndBoundaryFaces(app, seed, bnd);
    if (!faces || !faces.length) {
      result = null;
      d.message("Cannot create a selection set from the current seed and boundary objects. Adjust the seed and boundary objects and try again.", "error");
    } else {
      const T = app.K.topoOf(app.body(seed.body).shape);
      result = faces.map((i) => ({ kind: "face", body: seed.body, index: i, p: [...T.faces[i].c], n: [...T.faces[i].n], planar: T.faces[i].type === "PLANE" }));
      d.message("Add or remove faces or modify seed and boundary objects to update the selection set", "info");
    }
    stale = false;
    previewHighlight(app, result || []);
    d.refresh();
  };
  const pre = (ctx.preselect || app.selection.items || []).filter((r) => r.kind === "face" || r.kind === "edge");
  return app.ui.dialog.open({
    id: "FusionSelectSeedAndBoundaryFacesCommand",
    title: "Seed And Boundary",
    icon: "FusionSelectSeedAndBoundaryFacesCommand",
    help: "Creates a selection set of the faces of a body between a set of boundary objects and a seed object. Select boundary faces or edges, then a seed face, and click Update.",
    preview: false, noFeature: true, ctrlWidth: 150,
    preselect: pre,
    rows: [
      { id: "boundary", type: "selection", label: "Boundary Objects", kinds: ["face", "edge"], min: 1, advance: false, prompt: "Select faces or edges on a solid or surface body to define the boundary", tooltip: "Select faces or edges on a solid or surface body to define the selection boundary." },
      { id: "seed", type: "selection", label: "Seed Object", kinds: ["face"], max: 1, prompt: "Select a face on the body to use as the seed object", tooltip: "Select a face to use as the seed object within the selection boundary." },
      { id: "include", type: "check", label: "Include Boundary Objects", default: false, tooltip: "Check to include the boundary objects in the selection set." },
      {
        id: "update", type: "custom", label: "",
        render(d) { return lrow("", el("button", { type: "button", class: "mg-btn", "data-input": "update", "data-action": "update", text: "Update", title: "Updates the selection set based on the current boundary and seed objects.", on: { click: () => update(d) } })); },
        update(e, d) { const b = e.querySelector("button"); b.disabled = !(d.values.seed || []).length; b.classList.toggle("mg-btn-attn", stale && !!(d.values.seed || []).length); },
      },
      {
        id: "result", type: "custom", label: "Selection Set",
        render() { return lrow("Selection Set", el("div", { class: "mg-count", "data-input": "result", text: "0 faces" })); },
        update(w) {
          const e = w.querySelector(".mg-count");
          const n = result ? result.length : 0;
          e.textContent = `${n} face${n === 1 ? "" : "s"}`;
          e.dataset.count = String(n);
          e.title = `${n} ${n === 1 ? "face included in the selection set." : "faces included in the selection set."}`;
        },
      },
    ],
    onChange(id) { if (id === "boundary" || id === "seed") stale = true; },
    validate(d) { return result && !stale ? null : (d.values.seed || []).length ? null : "Select a seed"; },
    commit(_f, d) {
      if (stale || !result) update(d);
      if (!result) throw new Error("Cannot create a selection set from the current seed and boundary objects");
      let refs = result.slice();
      if (d.values.include) {
        const extra = (d.values.boundary || []).filter((r) => r.kind === "face");
        const seen = new Set(refs.map((r) => `${r.body}:${r.index}`));
        for (const r of extra) if (!seen.has(`${r.body}:${r.index}`)) refs.push(r);
        // boundary edges are not faces: add the faces that own them
      }
      return refs;
    },
    afterCommit(refs) { finishSelect(app, refs); },
    onClose() { previewHighlight(app, []); },
  });
}

// ------------------------------------------------------------------------------------------------
// Selection Filters (Select panel check-box list): make the toolbar's state filter canvas picks
// ------------------------------------------------------------------------------------------------
const FILTER_OF = {
  body: "Bodies", face: "Faces", edge: "Edges", vertex: "Vertices",
  profile: "Sketch Profiles", sketchCurve: "Sketch Curves", sketchPoint: "Sketch Points", sketchDim: "Sketch Curves",
  cplane: "Construction Planes", originPlane: "Construction Planes", originAxis: "Construction Axes", originPoint: "Construction Points",
  canvas: "Canvases",
};
/** Selection Filters category of a ref (null = not filtered). */
export function filterCategory(app, r) {
  if (!r) return null;
  if (r.kind === "feature") {
    const f = app.feature(r.id);
    if (f && f.type === "sketch") return "Sketches";
    if (f && f.type === "cplane") return "Construction Planes";
    return null;
  }
  return FILTER_OF[r.kind] || null;
}
export function installSelectionFilters(app) {
  const sel = app.selection;
  if (!sel || sel._mgFilters) return;
  sel._mgFilters = true;
  const prev = sel.accepts.bind(sel);
  sel.accepts = (r) => {
    // the filters apply to plain canvas selection; an active command's selection input decides alone
    if (!sel.filter && !app.activeCommand) {
      const filters = app.ui.toolbar && app.ui.toolbar.selectionFilters;
      const cat = filterCategory(app, r);
      if (filters && cat && filters[cat] === false) return false;
    }
    return prev(r);
  };
  app.on("selection-filters", (d) => {
    // drop selected items whose kind was just filtered out
    const f = (d && d.filters) || {};
    const keep = sel.items.filter((r) => { const c = filterCategory(app, r); return !c || f[c] !== false; });
    if (keep.length !== sel.items.length) sel.set(keep);
  });
}

function openSelectionFilters(app) {
  const tb = app.ui.toolbar;
  if (!tb) { app.toast("The toolbar is not available", "warning"); return; }
  try { tb.closeMenus(); } catch { /* ignore */ }
  const tabs = tb.tabs ? tb.tabs() : [];
  const withSelect = (tb.spec && tb.spec.TABS || []).filter((t) => t.panels.includes("SelectPanel")).map((t) => t.id);
  if (!withSelect.includes(tb.activeTab) && tabs.includes("SolidTab")) tb.setTab("SolidTab");
  requestAnimationFrame(() => {
    if (!tb.openPanel("SelectPanel")) { app.toast("Selection Filters are in the SELECT panel", "info"); return; }
    requestAnimationFrame(() => {
      const row = document.querySelector('.sh-menu [data-menu-item="SelectionFilterCommand"]');
      if (row) row.click();
    });
  });
}

export function registerSelect(app) {
  const reg = (def) => app.commands.register({ kind: "tool", ...def });
  reg({ id: "SelectByNameCommand", label: "Select by Name", tooltip: "Selects bodies or components by their browser name.", run: (a) => openSelectByName(a) });
  reg({ id: "FusionSelectBodiesBySizeCommand", label: "Select by Size", tooltip: "Selects bodies or components within a size range.", run: (a) => openSelectBySize(a) });
  reg({ id: "SelectByBoundaryCommand", label: "Select by Boundary", tooltip: "Selects objects inside a boundary shape.", run: (a, ctx) => openSelectByBoundary(a, ctx) });
  reg({ id: "FusionSelectSeedAndBoundaryFacesCommand", label: "Select by Seed and Boundary", tooltip: "Selects the faces between a seed face and boundary faces.", run: (a, ctx) => openSeedAndBoundary(a, ctx) });
  reg({ id: "SelectByInvertCommand", label: "Invert Selection", tooltip: "Swaps what is selected and what is not.", kind: "ui", run: (a) => invertSelection(a) });
  reg({ id: "SelectionFilterCommand", label: "Selection Filters", tooltip: "Chooses which kinds of object can be selected.", kind: "ui", run: (a) => openSelectionFilters(a) });
  app.on("ready", () => installSelectionFilters(app));
  void esc;
}
