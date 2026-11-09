// APPEARANCE (AppearanceCommand, A) and PHYSICAL MATERIAL (PhysicalMaterialCommand) panels.
// Both are docked command dialogs with "In This Design" + "Library" sections of swatches.
//   * click a swatch to make it active; if bodies/faces are selected it is applied to them
//   * with an active swatch, clicking a body (or face, Apply To: Faces) in the canvas applies it
//   * drag a swatch onto a body in the canvas or onto a body row in the browser
// Every assignment is one undoable app.mutate step. Face appearances are stored in
// doc.bodies[id].faceAppearances {faceIndex: appearanceId} and drawn by FaceAppearanceLayer.
import * as THREE from "three";
import { APPEARANCES, APPEARANCE_CATEGORIES, MATERIALS, MATERIAL_CATEGORIES, appearanceInfo, swatchCss, materialOf, DEFAULT_APPEARANCE, materialById, customMaterial, customAppearance } from "./library.js";

/** Copy a custom (user library) appearance / material into the design so it renders and weighs the same anywhere. */
function carryCustom(doc, kind, id) {
  if (kind === "appearance") {
    const a = !APPEARANCES[id] && customAppearance(id);
    if (a) doc.customAppearances = { ...(doc.customAppearances || {}), [id]: JSON.parse(JSON.stringify(a)) };
    return;
  }
  const m = !MATERIALS[id] && customMaterial(id);
  if (m) {
    doc.customMaterials = { ...(doc.customMaterials || {}), [id]: JSON.parse(JSON.stringify(m)) };
    if (m.appearance) carryCustom(doc, "appearance", m.appearance);
  }
}
/** User libraries (Favorites first) from the Material Browser store: [{id, name, items(kind)}] */
function userLibraries(app) {
  const st = app.ui && app.ui.inspect && app.ui.inspect.materialBrowser && app.ui.inspect.materialBrowser.store;
  if (!st) return [];
  try { return st.libraries().map((l) => ({ id: l.id, name: l.favorites ? "Favorites" : l.name, favorites: !!l.favorites, items: (kind) => st.items(kind, l.id) })); } catch { return []; }
}
import { ICONS, esc, div, fwGlyph } from "./ui.js";

// ------------------------------------------------------------------ assignments
export function applyAppearance(app, refs, apId) {
  const list = (refs || []).filter((r) => r && (r.kind === "body" || r.kind === "face") && app.doc.bodies[r.body]);
  if (!list.length || !apId) return false;
  const name = appearanceInfo(app, apId).name;
  app.mutate(`Appearance: ${name}`, (doc) => {
    carryCustom(doc, "appearance", apId);
    for (const r of list) {
      const meta = doc.bodies[r.body];
      if (!meta) continue;
      if (r.kind === "face") {
        meta.faceAppearances = { ...(meta.faceAppearances || {}), [r.index]: apId };
      } else {
        meta.appearance = apId;
        meta.appearanceOverride = true;
      }
    }
  });
  return true;
}

export function applyMaterial(app, refs, matId) {
  const mat = materialById(matId);
  const ids = [...new Set((refs || []).filter((r) => r && r.kind === "body" && app.doc.bodies[r.body]).map((r) => r.body))];
  if (!mat || !ids.length) return false;
  app.mutate(`Physical Material: ${mat.name}`, (doc) => {
    carryCustom(doc, "physical", matId);
    for (const id of ids) {
      const meta = doc.bodies[id];
      if (!meta) continue;
      meta.material = matId;
      // like Fusion, the body takes the material's appearance unless an appearance override was set
      if (!meta.appearanceOverride) meta.appearance = mat.appearance || DEFAULT_APPEARANCE;
    }
  });
  return true;
}

// ------------------------------------------------------------------ face appearance display
export class FaceAppearanceLayer {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.group.name = "inspect-face-appearances";
    this.group.userData.noPick = true;
    this.mats = [];
    app.on("model", () => this.rebuild());
    app.on("doc", () => setTimeout(() => this.rebuild(), 0));
  }
  clear() {
    for (const c of [...this.group.children]) { this.group.remove(c); if (c.geometry) c.geometry.dispose(); }
    for (const m of this.mats) m.dispose();
    this.mats = [];
  }
  rebuild() {
    const app = this.app, vp = app.viewport;
    if (!vp || !vp.groups || !vp.groups.bodies) return;
    if (this.group.parent !== vp.groups.bodies) vp.groups.bodies.add(this.group);
    this.clear();
    let faces = true;
    try { faces = vp._vp && vp._vp.styleInfo ? vp._vp.styleInfo().faces !== false : true; } catch { /* ignore */ }
    if (!faces) { vp.requestRender(); return; }
    for (const b of app.bodies()) {
      const meta = b.meta;
      if (!b.shape || !meta || meta.visible === false || !meta.faceAppearances) continue;
      const fa = meta.faceAppearances;
      if (!Object.keys(fa).length) continue;
      let md;
      try { md = vp.meshFor(b.shape); } catch { continue; }
      for (const [fi, apId] of Object.entries(fa)) {
        const g = md.faceGroups.find((x) => x.face === Number(fi));
        if (!g) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(md.vertices, 3));
        geo.setAttribute("normal", new THREE.BufferAttribute(md.normals, 3));
        geo.setIndex(new THREE.BufferAttribute(md.triangles.slice(g.start, g.start + g.count), 1));
        const ap = appearanceInfo(app, apId);
        const m = new THREE.MeshStandardMaterial({
          color: ap.color, metalness: Math.min(0.6, ap.metalness ?? 0.2), roughness: Math.max(0.25, ap.roughness ?? 0.5),
          envMap: (vp._vp && vp._vp.envMap) || null, envMapIntensity: 0.7, side: THREE.DoubleSide,
          // true depth: in front of the body face (pushed back by its polygon offset), behind the edge lines
        });
        if (ap.opacity != null && ap.opacity < 1) { m.transparent = true; m.opacity = ap.opacity; m.depthWrite = false; }
        this.mats.push(m);
        const mesh = new THREE.Mesh(geo, m);
        mesh.userData = { noPick: true, body: b.id, faceAppearance: Number(fi) };
        mesh.renderOrder = 0;
        this.group.add(mesh);
      }
    }
    vp.requestRender();
  }
}

// ------------------------------------------------------------------ panel builder
function tile(item, opts) {
  if (opts.view === "list") {
    const r = div("insp-list-row insp-tile-like");
    r.dataset.swatch = item.id;
    r.title = opts.title ? opts.title(item) : item.name;
    const ball = div("insp-ball");
    ball.style.background = swatchCss(opts.look(item));
    r.appendChild(ball);
    r.appendChild(div("insp-list-name", esc(item.name)));
    return r;
  }
  const t = div("insp-tile insp-tile-like");
  t.dataset.swatch = item.id;
  t.title = opts.title ? opts.title(item) : item.name;
  const ball = div("insp-ball");
  ball.style.background = swatchCss(opts.look(item));
  t.appendChild(ball);
  t.appendChild(div("insp-tile-name", esc(item.name)));
  return t;
}

/**
 * Generic swatch panel used by both dialogs.
 * cfg: {kind:'appearance'|'material', items(category)->[], categories, inDesign()->[], look(item)->appearance,
 *       libraryName, title(item)}
 */
function swatchPanel(dlg, cfg, state) {
  const root = div("insp-panel");
  root.dataset.panel = cfg.kind;
  const groupEl = (title, key, collapsed = false) => {
    const g = div("dlg-group insp-group" + (collapsed ? " collapsed" : ""));
    g.dataset.group = key;
    const head = div("dlg-group-head insp-group-head", `<span class="dlg-caret">${fwGlyph(dlg.app, "groupCaret", ICONS.caret)}</span><span class="dlg-group-label">${esc(title)}</span>`);
    head.addEventListener("click", () => g.classList.toggle("collapsed"));
    const body = div("dlg-group-body insp-group-body");
    g.append(head, body);
    root.appendChild(g);
    return body;
  };
  const inDesign = groupEl("In This Design", "inDesign");
  const designTiles = div(cfg.view === "list" ? "insp-list" : "insp-tiles");
  designTiles.dataset.list = "inDesign";
  inDesign.appendChild(designTiles);

  const lib = groupEl("Library", "library");
  const libsel = div("insp-libsel", `<span>${esc(cfg.libraryName)}</span>${fwGlyph(dlg.app, "ddCaret", ICONS.caret)}`);
  libsel.title = cfg.libraryName;
  lib.appendChild(libsel);
  const search = div("insp-search", `${ICONS.search}<input type="text" placeholder="Search" spellcheck="false" data-input="search">`);
  lib.appendChild(search);
  const tree = div("insp-scroll");
  tree.dataset.list = "library";
  lib.appendChild(tree);

  const node = (label, key, collapsed, count) => {
    const n = div("insp-tree-node" + (collapsed ? " collapsed" : ""));
    n.dataset.folder = key;
    const row = div("insp-tree-row", `<span class="insp-caret">${fwGlyph(dlg.app, "groupCaret", ICONS.caret)}</span>${ICONS.folder}<span>${esc(label)}</span>${count !== undefined ? `<span class="insp-tree-count">${count}</span>` : ""}`);
    row.addEventListener("click", () => { n.classList.toggle("collapsed"); state.open[key] = !n.classList.contains("collapsed"); });
    const kids = div("insp-tree-kids");
    n.append(row, kids);
    return { n, kids };
  };

  function renderTree() {
    const q = (search.querySelector("input").value || "").trim().toLowerCase();
    tree.innerHTML = "";
    // Favorites + user libraries (Manage Materials)
    const libs = cfg.userLibraries ? cfg.userLibraries() : [];
    const favLib = libs.find((l) => l.favorites);
    const favItems = favLib ? favLib.items(cfg.libKind).filter((it) => !q || it.name.toLowerCase().includes(q)) : [];
    const fav = node("Favorites", "favorites", !(q || state.open.favorites), favItems.length || undefined);
    if (favItems.length) { const tiles = div(cfg.view === "list" ? "insp-list" : "insp-tiles"); for (const it of favItems) tiles.appendChild(tile(it, cfg)); fav.kids.appendChild(tiles); }
    else fav.kids.appendChild(div("insp-empty", "No favorites"));
    if (!q || favItems.length) tree.appendChild(fav.n);
    const libRoot = node(cfg.libraryName, "lib", state.open.lib === false);
    tree.appendChild(libRoot.n);
    for (const cat of cfg.categories) {
      const items = cfg.items(cat).filter((it) => !q || it.name.toLowerCase().includes(q));
      if (!items.length) continue;
      const c = node(cat, `cat:${cat}`, !(q || state.open[`cat:${cat}`]), items.length);
      const tiles = div(cfg.view === "list" ? "insp-list" : "insp-tiles");
      for (const it of items) tiles.appendChild(tile(it, cfg));
      c.kids.appendChild(tiles);
      libRoot.kids.appendChild(c.n);
    }
    for (const l of libs) {
      if (l.favorites) continue;
      const items = l.items(cfg.libKind).filter((it) => !q || it.name.toLowerCase().includes(q));
      if (q && !items.length) continue;
      const u = node(l.name, `user:${l.id}`, !(q || state.open[`user:${l.id}`]), items.length);
      const tiles = div(cfg.view === "list" ? "insp-list" : "insp-tiles");
      for (const it of items) tiles.appendChild(tile(it, cfg));
      if (!items.length) u.kids.appendChild(div("insp-empty", "Empty library"));
      else u.kids.appendChild(tiles);
      tree.appendChild(u.n);
    }
    markActive();
  }
  function renderDesign() {
    designTiles.innerHTML = "";
    const items = cfg.inDesign();
    if (!items.length) designTiles.appendChild(div("insp-empty", "None"));
    for (const it of items) designTiles.appendChild(tile(it, cfg));
    markActive();
  }
  function markActive() {
    for (const t of root.querySelectorAll(".insp-tile-like")) t.classList.toggle("active", t.dataset.swatch === state.active);
  }
  search.querySelector("input").addEventListener("input", () => renderTree());
  // keys typed into the search box must not reach the canvas shortcuts / dialog Enter
  search.querySelector("input").addEventListener("keydown", (e) => { if (e.key !== "Escape") e.stopPropagation(); });

  // swatch interaction: click = make active (+ apply to the selected targets), drag = drop on a body
  root.addEventListener("pointerdown", (e) => {
    const t = e.target.closest(".insp-tile-like");
    if (!t || e.button !== 0) return;
    e.preventDefault();
    const id = t.dataset.swatch;
    const x0 = e.clientX, y0 = e.clientY;
    let ghost = null;
    const move = (m) => {
      if (!ghost && Math.hypot(m.clientX - x0, m.clientY - y0) > 5) {
        ghost = div("insp-drag-ghost");
        ghost.style.background = swatchCss(cfg.look(cfg.byId(id)));
        (dlg.app.dom.overlay || document.body).appendChild(ghost);
        state.dragging = id;
      }
      if (ghost) { ghost.style.left = `${m.clientX}px`; ghost.style.top = `${m.clientY}px`; state.onDragMove && state.onDragMove(m); }
    };
    const up = (u) => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      if (ghost) {
        ghost.remove();
        state.dragging = null;
        state.onDrop && state.onDrop(id, u);
      } else {
        const targets = dlg.values.targets || [];
        if (targets.length) { state.active = id; state.apply(targets, id); }
        else state.active = state.active === id ? null : id; // click again to deselect
        markActive();
        dlg.el.dataset.activeSwatch = state.active || "";
        dlg.refresh();
      }
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  });

  renderTree();
  renderDesign();
  return { root, renderTree, renderDesign, markActive };
}

/** Canvas or browser target under a client point: body/face ref or null. */
function dropTarget(app, clientX, clientY, faces) {
  const el = document.elementFromPoint(clientX, clientY);
  const row = el && el.closest && el.closest('[data-node^="body:"]');
  if (row) { const id = row.getAttribute("data-node").slice(5); return app.doc.bodies[id] ? { kind: "body", body: id } : null; }
  const vp = app.viewport;
  if (!vp || !vp.canvas || (el && el !== vp.canvas && !vp.canvas.parentElement.contains(el))) return null;
  const r = vp.canvas.getBoundingClientRect();
  const x = clientX - r.left, y = clientY - r.top;
  if (x < 0 || y < 0 || x > r.width || y > r.height) return null;
  const hit = vp.pick(x, y, { kinds: faces ? ["face"] : ["body"] });
  return hit ? hit.ref : null;
}

// ------------------------------------------------------------------ dialogs
function setupFooter(dlg) {
  const foot = dlg.el.querySelector(".dlg-foot");
  if (!foot) return;
  const ok = foot.querySelector("[data-action=ok]");
  const cancel = foot.querySelector("[data-action=cancel]");
  if (ok) ok.style.display = "none";
  if (cancel) cancel.textContent = "Close";
}

export function registerAppearance(app) {
  const faceLayer = new FaceAppearanceLayer(app);
  app.commands.register({
    id: "AppearanceCommand",
    label: "Appearance",
    tooltip: "Assigns appearances to components, bodies, or faces in a design to override the color and texture of their physical materials, without affecting physical engineering properties.",
    icon: "AppearanceCommand",
    shortcut: "A",
    kind: "tool",
    run: (a, ctx = {}) => openAppearance(a, ctx),
  });
  app.commands.register({
    id: "PhysicalMaterialCommand",
    label: "Physical Material",
    tooltip: "Assigns physical materials to components and bodies in a design to control their thermal, mechanical, strength, and advanced engineering properties, as well as their appearance.",
    icon: "PhysicalMaterialCommand",
    kind: "tool",
    run: (a, ctx = {}) => openMaterial(a, ctx),
  });
  return faceLayer;
}

function leaveSketch(app) {
  if (app.mode !== "sketch") return;
  const stop = app.commands.get("SketchStop");
  if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model");
}

export function openAppearance(app, ctx = {}) {
  if (!app.ui.dialog) return null;
  leaveSketch(app);
  const pre = (ctx.preselect || app.selection.items || []).filter((r) => r.kind === "body" || r.kind === "face");
  const faceMode = pre.length > 0 && pre.every((r) => r.kind === "face");
  const state = { active: null, open: {}, dragging: null };
  let panel = null;

  const byId = (id) => ({ ...appearanceInfo(app, id), id });
  const cfg = {
    kind: "appearance",
    libKind: "appearance",
    userLibraries: () => userLibraries(app),
    libraryName: "Fusion Appearance Library",
    categories: APPEARANCE_CATEGORIES,
    items: (cat) => Object.values(APPEARANCES).filter((a) => a.category === cat),
    byId,
    look: (it) => it,
    title: (it) => it.name,
    inDesign: () => {
      const used = new Set();
      for (const id of Object.keys(app.doc.bodies || {})) {
        if (!app.body(id)) continue;
        const m = app.doc.bodies[id];
        used.add(m.appearance || DEFAULT_APPEARANCE);
        for (const f of Object.values(m.faceAppearances || {})) used.add(f);
      }
      return [...used].map(byId);
    },
  };

  return app.ui.dialog.open({
    id: "AppearanceCommand",
    title: "Appearance",
    icon: "AppearanceCommand",
    help: "Choose whether to apply appearances to components and bodies or specific faces, then drag appearances onto components, bodies, or faces in the canvas or the Browser.",
    preview: false,
    noFeature: true,
    preselect: pre,
    values: { applyTo: faceMode ? "faces" : "bodies" },
    rows: [
      {
        id: "applyToRow", type: "custom",
        render(dlg) {
          const row = div("insp-crow");
          row.innerHTML = `<div class="dlg-label">Apply To:</div>`;
          const bg = div("dlg-bg insp-bg");
          bg.dataset.input = "applyTo";
          for (const [id, label] of [["bodies", "Bodies/Components"], ["faces", "Faces"]]) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "dlg-bg-btn insp-bg-btn";
            b.dataset.option = id;
            b.title = label;
            b.innerHTML = ICONS[`apply_${id}`];
            b.addEventListener("click", () => dlg.set("applyTo", id, { user: true }));
            bg.appendChild(b);
          }
          Object.defineProperty(bg, "value", { get: () => dlg.values.applyTo, set: (v) => dlg.set("applyTo", v, { user: true }) });
          row.appendChild(bg);
          return row;
        },
        update(el, dlg) { const bg = el.querySelector("[data-input=applyTo]"); bg.dataset.value = dlg.values.applyTo; for (const b of bg.children) b.classList.toggle("on", b.dataset.option === dlg.values.applyTo); },
      },
      { id: "targets", type: "selection", label: "Objects", kinds: faceMode ? ["face"] : ["body"], min: 0, prompt: "" },
      {
        id: "swatches", type: "custom",
        render(dlg) { panel = swatchPanel(dlg, cfg, state); return panel.root; },
        update() { if (panel) panel.markActive(); },
      },
    ],
    onOpen(dlg) {
      dlg.el.classList.add("insp-dlg", "insp-appearance");
      dlg.el.dataset.activeSwatch = "";
      setupFooter(dlg);
      state.apply = (refs, id) => applyAppearance(app, refs, id);
      state.onDrop = (id, ev) => {
        const ref = dropTarget(app, ev.clientX, ev.clientY, dlg.values.applyTo === "faces");
        if (ref) applyAppearance(app, [dlg.values.applyTo === "faces" && ref.kind === "face" ? ref : { kind: "body", body: ref.body }], id);
      };
    },
    onChange(id, dlg) {
      if (id === "applyTo") {
        dlg.defs.targets.kinds = dlg.values.applyTo === "faces" ? ["face"] : ["body"];
        dlg.setSelection("targets", [], { noPreview: true });
        dlg.activate("targets");
      }
    },
    afterPreview(dlg) {
      // the document may have changed (an assignment was made): refresh "In This Design"
      if (panel) panel.renderDesign();
      dlg.el.dataset.activeSwatch = state.active || "";
    },
    prompt(dlg) { return state.active ? `Click a ${dlg.values.applyTo === "faces" ? "face" : "body"} to apply ${appearanceInfo(app, state.active).name}` : ""; },
    onCanvasDown(ctx, dlg) {
      if (!state.active) return false; // no swatch: clicks select targets
      const h = ctx.hit;
      if (!h) return true;
      const ref = h.ref.kind === "face" && dlg.values.applyTo === "faces" ? h.ref : { kind: "body", body: h.ref.body };
      if (ref.body) applyAppearance(app, [ref], state.active);
      return true;
    },
    commit() { return null; },
  });
}

export function openMaterial(app, ctx = {}) {
  if (!app.ui.dialog) return null;
  leaveSketch(app);
  const pre = (ctx.preselect || app.selection.items || []).filter((r) => r.kind === "body");
  const state = { active: null, open: {}, dragging: null };
  let panel = null;
  const byId = (id) => materialById(id) || MATERIALS.steel;
  const cfg = {
    kind: "material",
    libKind: "physical",
    userLibraries: () => userLibraries(app),
    view: "list",
    libraryName: "Fusion Material Library",
    categories: MATERIAL_CATEGORIES,
    items: (cat) => Object.values(MATERIALS).filter((m) => m.category === cat).sort((a, b) => a.name.localeCompare(b.name)),
    byId,
    look: (m) => appearanceInfo(app, m.appearance),
    title: (m) => `${m.name}\nDensity ${m.density.toFixed(3)} g / cm^3`,
    inDesign: () => {
      const used = new Set();
      for (const id of Object.keys(app.doc.bodies || {})) if (app.body(id)) used.add(materialOf(app.doc.bodies[id]).id);
      return [...used].map(byId);
    },
  };
  return app.ui.dialog.open({
    id: "PhysicalMaterialCommand",
    title: "Physical Material",
    icon: "PhysicalMaterialCommand",
    help: "Drag physical materials onto components or bodies in the canvas or the Browser.",
    preview: false,
    noFeature: true,
    preselect: pre,
    rows: [
      { id: "targets", type: "selection", label: "Objects", kinds: ["body"], min: 0, prompt: "" },
      {
        id: "swatches", type: "custom",
        render(dlg) { panel = swatchPanel(dlg, cfg, state); return panel.root; },
        update() { if (panel) panel.markActive(); },
      },
    ],
    onOpen(dlg) {
      dlg.el.classList.add("insp-dlg", "insp-material");
      setupFooter(dlg);
      state.apply = (refs, id) => applyMaterial(app, refs, id);
      state.onDrop = (id, ev) => {
        const ref = dropTarget(app, ev.clientX, ev.clientY, false);
        if (ref) applyMaterial(app, [{ kind: "body", body: ref.body }], id);
      };
    },
    afterPreview(dlg) {
      if (panel) panel.renderDesign();
      dlg.el.dataset.activeSwatch = state.active || "";
    },
    prompt() { return state.active ? `Click a body to apply ${byId(state.active).name}` : ""; },
    onCanvasDown(ctx) {
      if (!state.active) return false;
      const h = ctx.hit;
      if (h && h.ref.body) applyMaterial(app, [{ kind: "body", body: h.ref.body }], state.active);
      return true;
    },
    commit() { return null; },
  });
}
