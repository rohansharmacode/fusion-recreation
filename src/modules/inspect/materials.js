// MANAGE MATERIALS (MaterialCommand): Fusion's Material Browser.
//   * Physical / Appearance tabs, Search, "In This Design", Library tree (Favorites, Fusion Material /
//     Appearance Library with its categories, user libraries), item list with swatches
//   * Library menu: Create New Library, Open Existing Library..., Export Library..., Rename Library, Remove Library,
//     Create Category, Delete Category
//   * Create Material menu: Create New Material, Duplicate Selected Material; right-click: Add to (Favorites / libraries),
//     Duplicate, Assign to Selection, Rename, Delete
//   * Material Editor: Identity / Appearance / Physical tabs (read-only for the Fusion libraries, editable for
//     Favorites, user libraries and the design's own copies); Apply saves, OK closes
// Fusion keeps user libraries in the Autodesk cloud; this recreation keeps them in browser storage
// (localStorage, memory fallback) and the design carries copies of the custom materials it uses
// (doc.customMaterials / doc.customAppearances), so a saved design renders and weighs the same anywhere.
import { MATERIALS, APPEARANCES, MATERIAL_CATEGORIES, APPEARANCE_CATEGORIES, setCustomMaterials, materialById, appearanceById, appearanceInfo, swatchCss, physicalProps, PHYS_FIELDS, materialOf, DEFAULT_APPEARANCE } from "./library.js";
import { applyMaterial, applyAppearance } from "./appearance.js";
import { ICONS, esc, div } from "./ui.js";

const KEY = "fusionrec.materialLibraries.v1";
const FUSION_LIB = { physical: "fusion-materials", appearance: "fusion-appearances" };
const FUSION_NAME = { physical: "Fusion Material Library", appearance: "Fusion Appearance Library" };
const clone = (o) => JSON.parse(JSON.stringify(o));

// ------------------------------------------------------------------ store
function load() {
  try {
    const s = window.localStorage && window.localStorage.getItem(KEY);
    if (s) { const d = JSON.parse(s); if (d && Array.isArray(d.libraries)) return d; }
  } catch { /* sandboxed / corrupt */ }
  return null;
}
function emptyLib(id, name) { return { id, name, physical: {}, appearance: {}, categories: { physical: [], appearance: [] }, n: 0 }; }

export function createMaterialStore(app) {
  let data = load() || { libraries: [emptyLib("favorites", "Favorites")], n: 0 };
  if (!data.libraries.some((l) => l.id === "favorites")) data.libraries.unshift(emptyLib("favorites", "Favorites"));
  let memoryOnly = false;
  const listeners = new Set();

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(data)); memoryOnly = false; } catch { memoryOnly = true; }
  }
  function sync() {
    const mats = {}, aps = {};
    for (const l of data.libraries) { Object.assign(mats, l.physical); Object.assign(aps, l.appearance); }
    // the design's own copies win (they are what the bodies were given)
    Object.assign(mats, app.doc.customMaterials || {});
    Object.assign(aps, app.doc.customAppearances || {});
    // a custom physical material's own appearance must be resolvable
    setCustomMaterials(app, mats, aps);
  }
  function changed() { save(); sync(); for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } app.emit("materials", {}); }
  const lib = (id) => data.libraries.find((l) => l.id === id) || null;
  const nextId = (libId) => { data.n = (data.n || 0) + 1; return `u:${libId}:${data.n}`; };
  const uniqueLibName = (base) => { let n = 1, name = base; while (data.libraries.some((l) => l.name === name)) name = `${base} ${++n}`; return name; };

  /** Source of an item id: {kind, libId|'design'|'fusion', item} */
  function find(kind, id) {
    if (kind === "physical" && MATERIALS[id]) return { lib: FUSION_LIB.physical, item: MATERIALS[id], readOnly: true };
    if (kind === "appearance" && APPEARANCES[id]) return { lib: FUSION_LIB.appearance, item: APPEARANCES[id], readOnly: true };
    for (const l of data.libraries) { const it = l[kind][id]; if (it) return { lib: l.id, item: it, readOnly: false }; }
    const dc = kind === "physical" ? app.doc.customMaterials : app.doc.customAppearances;
    if (dc && dc[id]) return { lib: "design", item: dc[id], readOnly: false };
    return null;
  }

  const store = {
    get memoryOnly() { return memoryOnly; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    sync,
    libraries() {
      return [
        ...data.libraries.map((l) => ({ id: l.id, name: l.name, readOnly: false, favorites: l.id === "favorites" })),
      ];
    },
    library: (id) => { const l = lib(id); return l ? clone(l) : null; },
    find,
    /** Items of a library / category: kind 'physical'|'appearance'. */
    items(kind, libId, category = null) {
      let list = [];
      if (libId === FUSION_LIB[kind]) list = Object.values(kind === "physical" ? MATERIALS : APPEARANCES);
      else if (libId === "design") list = store.inDesign(kind);
      else { const l = lib(libId); list = l ? Object.values(l[kind]) : []; }
      if (category) list = list.filter((x) => x.category === category);
      return list.slice().sort((a, b) => a.name.localeCompare(b.name));
    },
    categories(kind, libId) {
      if (libId === FUSION_LIB[kind]) return kind === "physical" ? MATERIAL_CATEGORIES : APPEARANCE_CATEGORIES;
      const l = lib(libId);
      if (!l) return [];
      const set = new Set(l.categories[kind] || []);
      for (const it of Object.values(l[kind])) if (it.category) set.add(it.category);
      return [...set].sort();
    },
    /** Materials / appearances used by the bodies of this design. */
    inDesign(kind) {
      const ids = new Set();
      for (const id of Object.keys(app.doc.bodies || {})) {
        if (!app.body(id)) continue;
        const m = app.doc.bodies[id];
        if (kind === "physical") ids.add(materialOf(m).id);
        else { ids.add(m.appearance || DEFAULT_APPEARANCE); for (const f of Object.values(m.faceAppearances || {})) ids.add(f); }
      }
      const out = [];
      for (const id of ids) {
        const f = find(kind, id);
        if (f) out.push(f.item);
        else if (kind === "appearance") { const a = appearanceInfo(app, id); out.push({ ...a, id, category: a.category || "Other" }); }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
    createLibrary(name) {
      const l = emptyLib(`lib${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, uniqueLibName(String(name || "").trim() || "My Library"));
      data.libraries.push(l);
      changed();
      return l.id;
    },
    renameLibrary(id, name) {
      const l = lib(id);
      name = String(name || "").trim();
      if (!l || l.id === "favorites" || !name) return false;
      l.name = name;
      changed();
      return true;
    },
    removeLibrary(id) {
      if (id === "favorites") return false;
      const before = data.libraries.length;
      data.libraries = data.libraries.filter((l) => l.id !== id);
      if (data.libraries.length === before) return false;
      changed();
      return true;
    },
    /** JSON text of a user library (Export Library...). */
    exportLibrary(id) {
      const l = lib(id);
      if (!l) return null;
      return JSON.stringify({ format: "fusion-recreation-material-library", version: 1, library: { name: l.name, physical: l.physical, appearance: l.appearance, categories: l.categories } }, null, 2);
    },
    /** Open Existing Library: JSON from exportLibrary (ids are re-issued so libraries never collide). */
    importLibrary(text) {
      const d = typeof text === "string" ? JSON.parse(text) : text;
      const src = d && (d.library || d);
      if (!src || (typeof src.physical !== "object" && typeof src.appearance !== "object")) throw new Error("This file is not a material library");
      const l = emptyLib(`lib${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, uniqueLibName(String(src.name || "Imported Library")));
      const remap = {};
      for (const kind of ["appearance", "physical"]) {
        for (const it of Object.values(src[kind] || {})) {
          if (!it || typeof it !== "object" || !it.name) continue;
          const id = nextId(l.id);
          remap[it.id] = id;
          l[kind][id] = { ...sanitize(kind, it), id };
        }
      }
      for (const m of Object.values(l.physical)) if (m.appearance && remap[m.appearance]) m.appearance = remap[m.appearance];
      l.categories = { physical: [...((src.categories && src.categories.physical) || [])], appearance: [...((src.categories && src.categories.appearance) || [])] };
      data.libraries.push(l);
      changed();
      return l.id;
    },
    createCategory(kind, libId, name) {
      const l = lib(libId);
      name = String(name || "").trim();
      if (!l || !name) return false;
      if (!l.categories[kind].includes(name)) l.categories[kind].push(name);
      changed();
      return true;
    },
    deleteCategory(kind, libId, name) {
      const l = lib(libId);
      if (!l) return false;
      l.categories[kind] = l.categories[kind].filter((c) => c !== name);
      for (const it of Object.values(l[kind])) if (it.category === name) it.category = "";
      changed();
      return true;
    },
    /** Copy an item into a user library (Add to Favorites / Add to <library>). Returns the new id. */
    addTo(kind, id, libId) {
      const f = find(kind, id);
      const l = lib(libId);
      if (!f || !l) return null;
      const nid = nextId(l.id);
      const it = { ...clone(f.item), id: nid, baseId: f.item.baseId || (f.readOnly ? f.item.id : undefined) };
      if (kind === "physical") it.props = physicalProps(f.item);
      l[kind][nid] = it;
      // a physical material keeps its appearance: copy a custom one along so the library is self-contained
      if (kind === "physical" && it.appearance && !APPEARANCES[it.appearance]) {
        const ap = find("appearance", it.appearance);
        if (ap && !l.appearance[it.appearance]) l.appearance[it.appearance] = clone(ap.item);
      }
      changed();
      return nid;
    },
    /** Create New Material in a user library (default: Favorites). */
    create(kind, libId = "favorites", category = "") {
      const l = lib(libId) || lib("favorites");
      const nid = nextId(l.id);
      const base = kind === "physical"
        ? { name: "New Material", category: category || "Other", density: 1, appearance: "steel-satin", description: "", keywords: "", props: physicalProps({ category: "Other", density: 1 }) }
        : { name: "New Appearance", category: category || "Miscellaneous", color: "#9aa3ad", metalness: 0, roughness: 0.5, opacity: 1, description: "", keywords: "" };
      let name = base.name, k = 1;
      while (Object.values(l[kind]).some((x) => x.name === name)) name = `${base.name} (${++k})`;
      l[kind][nid] = { ...base, name, id: nid };
      changed();
      return nid;
    },
    /** Duplicate Selected Material (into its own user library, Favorites for library items). */
    duplicate(kind, id, libId = null) {
      const f = find(kind, id);
      if (!f) return null;
      const target = libId || (f.readOnly || f.lib === "design" ? "favorites" : f.lib);
      const nid = store.addTo(kind, id, target);
      if (!nid) return null;
      const l = lib(target);
      let name = `${f.item.name} (1)`, k = 1;
      while (Object.values(l[kind]).some((x) => x.id !== nid && x.name === name)) name = `${f.item.name} (${++k})`;
      l[kind][nid].name = name;
      changed();
      return nid;
    },
    /** Edit an item (user libraries directly; the design's copies as one undoable step). */
    update(kind, id, patch) {
      const f = find(kind, id);
      if (!f || f.readOnly) return false;
      const clean = sanitize(kind, { ...f.item, ...patch });
      if (f.lib === "design") {
        app.mutate(`Edit ${kind === "physical" ? "Physical Material" : "Appearance"}`, (doc) => {
          const key = kind === "physical" ? "customMaterials" : "customAppearances";
          doc[key] = { ...(doc[key] || {}), [id]: { ...clean, id } };
        }, { recompute: false });
        sync();
        app.emit("materials", {});
        if (kind === "appearance" || patch.appearance) refreshBodies(app);
        return true;
      }
      const l = lib(f.lib);
      l[kind][id] = { ...clean, id };
      changed();
      if (kind === "appearance") refreshBodies(app);
      return true;
    },
    remove(kind, id) {
      const f = find(kind, id);
      if (!f || f.readOnly || f.lib === "design") return false;
      delete lib(f.lib)[kind][id];
      changed();
      return true;
    },
    /** Assign a physical material / appearance to bodies (copies custom ones into the design). */
    assign(kind, id, refs) {
      return kind === "physical" ? applyMaterial(app, refs, id) : applyAppearance(app, refs, id);
    },
    reset() { data = { libraries: [emptyLib("favorites", "Favorites")], n: 0 }; changed(); },
  };
  app.on("doc", (d) => { if (d.replaced) sync(); });
  app.on("ready", () => sync());
  sync();
  return store;
}

function sanitize(kind, it) {
  const num = (v, d, lo = -Infinity, hi = Infinity) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
  const base = { id: it.id, name: String(it.name || "Material").slice(0, 120), category: String(it.category || ""), description: String(it.description || "").slice(0, 500), keywords: String(it.keywords || "").slice(0, 200) };
  if (it.baseId) base.baseId = String(it.baseId);
  if (kind === "physical") {
    const props = {};
    for (const [k] of PHYS_FIELDS) if (it.props && it.props[k] != null && Number.isFinite(Number(it.props[k]))) props[k] = Number(it.props[k]);
    return { ...base, density: num(it.density, 1, 1e-6, 1e4), appearance: String(it.appearance || DEFAULT_APPEARANCE), props };
  }
  const color = /^#[0-9a-f]{6}$/i.test(String(it.color)) ? String(it.color) : "#9aa3ad";
  return { ...base, color, metalness: num(it.metalness, 0, 0, 1), roughness: num(it.roughness, 0.5, 0, 1), opacity: num(it.opacity, 1, 0.05, 1) };
}

/** Body materials are cached by appearance values in the viewport: a rebuild picks up edited custom appearances. */
function refreshBodies(app) {
  try {
    const b = app.viewport && app.viewport._vp && app.viewport._vp.bodies;
    if (b && b.objects) { for (const o of b.objects.values()) b._applyStyle(o); app.viewport.requestRender(); }
  } catch { /* ignore */ }
}

// ------------------------------------------------------------------ Material Browser window
export function registerMaterials(app) {
  const store = createMaterialStore(app);
  let win = null;
  const api = {
    store,
    open: (ctx = {}) => openBrowser(ctx),
    close: () => { if (win) win.close(); },
    isOpen: () => !!win,
    get window() { return win; },
    libraries: () => store.libraries(),
  };
  app.commands.register({
    id: "MaterialCommand", label: "Manage Materials", icon: "MaterialCommand", kind: "ui",
    tooltip: "Opens the Material Browser, where you can manage physical materials and appearances in user-defined material libraries.",
    run: (a, ctx = {}) => openBrowser(ctx),
  });

  function openBrowser(ctx = {}) {
    if (win) { win.focus(); if (ctx.tab) win.setTab(ctx.tab); return win; }
    win = new MaterialBrowser(app, store, () => { win = null; }, ctx);
    return win;
  }
  return api;
}

class MaterialBrowser {
  constructor(app, store, onClose, ctx = {}) {
    this.app = app;
    this.store = store;
    this.onCloseCb = onClose;
    this.tab = ctx.tab === "appearance" ? "appearance" : "physical";
    this.libSel = { physical: { lib: FUSION_LIB.physical, cat: null }, appearance: { lib: FUSION_LIB.appearance, cat: null } };
    this.sel = { physical: null, appearance: null };
    this.open = { [FUSION_LIB.physical]: true, [FUSION_LIB.appearance]: true, favorites: true };
    this.query = "";
    this.editor = true;
    this.edTab = "identity";
    this.draft = null; // pending edits of the selected item
    this._build();
    this._offs = [store.onChange(() => this.render()), app.on("doc", () => this.render())];
    this.render();
  }

  // ---------------------------------------------------------------- skeleton
  _build() {
    const host = this.app.dom.overlay || document.body;
    const el = div("insp-mb");
    el.dataset.window = "MaterialCommand";
    el.innerHTML = `
      <div class="insp-mb-head" data-mb-drag><span class="insp-mb-title">MATERIAL BROWSER</span><button type="button" class="insp-mb-x" data-mb-action="close" title="Close">×</button></div>
      <div class="insp-mb-top">
        <div class="insp-mb-tabs"><button type="button" data-mb-tab="physical">Physical</button><button type="button" data-mb-tab="appearance">Appearance</button></div>
        <div class="insp-mb-search">${ICONS.search}<input type="text" placeholder="Search" spellcheck="false" data-mb-search></div>
      </div>
      <div class="insp-mb-body">
        <div class="insp-mb-main">
          <div class="insp-mb-sec"><div class="insp-mb-sechead" data-mb-sec="design">${ICONS.caret}<span>In This Design</span></div><div class="insp-mb-design" data-mb-list="design"></div></div>
          <div class="insp-mb-sec insp-mb-libsec"><div class="insp-mb-sechead" data-mb-sec="library">${ICONS.caret}<span>Library</span></div>
            <div class="insp-mb-lib"><div class="insp-mb-tree" data-mb-tree></div><div class="insp-mb-items" data-mb-list="library"></div></div>
          </div>
        </div>
        <div class="insp-mb-editor" data-mb-editor></div>
      </div>
      <div class="insp-mb-foot">
        <button type="button" class="insp-mb-tool" data-mb-action="library" title="Manage libraries">${libIcon()}<span class="insp-mb-caret">▾</span></button>
        <button type="button" class="insp-mb-tool" data-mb-action="new" title="Create material">${newIcon()}<span class="insp-mb-caret">▾</span></button>
        <button type="button" class="insp-mb-tool" data-mb-action="editor" title="Show / hide the Material Editor">${editIcon()}</button>
        <span class="insp-mb-note" data-mb-note></span>
        <span class="insp-mb-sp"></span>
        <button type="button" class="insp-mb-btn" data-mb-action="apply" title="Save the changes in the Material Editor">Apply</button>
        <button type="button" class="insp-mb-btn primary" data-mb-action="ok">OK</button>
      </div>`;
    host.appendChild(el);
    this.el = el;
    // place it over the canvas
    const c = this.app.viewport && this.app.viewport.canvas;
    const r = c ? c.getBoundingClientRect() : { left: 80, top: 80, width: 900, height: 600 };
    const w = 760, h = 520;
    el.style.left = `${Math.max(8, Math.round(r.left + (r.width - w) / 2))}px`;
    el.style.top = `${Math.max(8, Math.round(r.top + Math.max(10, (r.height - h) / 2)))}px`;
    this._wire();
  }

  _wire() {
    const el = this.el;
    el.addEventListener("click", (e) => {
      const t = e.target.closest("[data-mb-tab],[data-mb-action],[data-mb-item],[data-mb-node],[data-mb-sec],[data-mb-edtab]");
      if (!t) return;
      if (t.dataset.mbTab) this.setTab(t.dataset.mbTab);
      else if (t.dataset.mbAction) this._action(t.dataset.mbAction, t);
      else if (t.dataset.mbItem) this.select(t.dataset.mbItem);
      else if (t.dataset.mbNode) this._node(t.dataset.mbNode, e);
      else if (t.dataset.mbSec) t.parentElement.classList.toggle("collapsed");
      else if (t.dataset.mbEdtab) { this.edTab = t.dataset.mbEdtab; this.renderEditor(); }
    });
    el.addEventListener("contextmenu", (e) => {
      const it = e.target.closest("[data-mb-item]");
      const nd = e.target.closest("[data-mb-node]");
      if (!it && !nd) return;
      e.preventDefault();
      if (it) { this.select(it.dataset.mbItem); this._itemMenu(e.clientX, e.clientY, it.dataset.mbItem); }
      else this._nodeMenu(e.clientX, e.clientY, nd.dataset.mbNode);
    });
    el.addEventListener("dblclick", (e) => {
      const it = e.target.closest("[data-mb-item]");
      if (it) { this.editor = true; this.select(it.dataset.mbItem); }
    });
    const search = el.querySelector("[data-mb-search]");
    search.addEventListener("input", () => { this.query = search.value.trim().toLowerCase(); this.renderLists(); });
    // typing in the window must not reach the canvas shortcuts
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); if (this.menu) this._closeMenu(); else this.close(); return; }
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") e.stopPropagation();
    });
    // drag by the header
    const head = el.querySelector("[data-mb-drag]");
    head.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      const x0 = e.clientX, y0 = e.clientY, l0 = el.offsetLeft, t0 = el.offsetTop;
      const mv = (m) => { el.style.left = `${Math.max(0, l0 + m.clientX - x0)}px`; el.style.top = `${Math.max(0, t0 + m.clientY - y0)}px`; };
      const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", mv);
      window.addEventListener("pointerup", up);
    });
    this._docDown = (e) => { if (this.menu && !this.menu.contains(e.target)) this._closeMenu(); };
    window.addEventListener("pointerdown", this._docDown, true);
  }

  focus() { this.el.classList.remove("insp-mb-flash"); void this.el.offsetWidth; this.el.classList.add("insp-mb-flash"); }
  close() {
    this._closeMenu();
    for (const off of this._offs) try { off(); } catch { /* ignore */ }
    window.removeEventListener("pointerdown", this._docDown, true);
    this.el.remove();
    this.onCloseCb();
  }

  setTab(tab) {
    if (tab !== "physical" && tab !== "appearance") return;
    this.tab = tab;
    this.draft = null;
    this.render();
  }

  get kind() { return this.tab; }
  current() { const id = this.sel[this.kind]; return id ? this.store.find(this.kind, id) : null; }

  select(id) {
    this.sel[this.kind] = id;
    this.draft = null;
    this.render();
  }

  // ---------------------------------------------------------------- rendering
  render() {
    if (!this.el.isConnected) return;
    for (const b of this.el.querySelectorAll("[data-mb-tab]")) b.classList.toggle("on", b.dataset.mbTab === this.tab);
    this.el.dataset.tab = this.tab;
    this.el.classList.toggle("no-editor", !this.editor);
    this.el.querySelector('[data-mb-action="editor"]').classList.toggle("on", this.editor);
    const note = this.el.querySelector("[data-mb-note]");
    note.textContent = this.store.memoryOnly ? "Libraries are kept for this session only (browser storage unavailable)" : "";
    this.renderTree();
    this.renderLists();
    this.renderEditor();
  }

  renderTree() {
    const k = this.kind;
    const tree = this.el.querySelector("[data-mb-tree]");
    const ls = this.libSel[k];
    const row = (key, label, depth, icon, opts = {}) => `<div class="insp-mb-node${ls.key === key ? " on" : ""}${opts.collapsed ? " collapsed" : ""}" data-mb-node="${esc(key)}" style="padding-left:${6 + depth * 14}px" title="${esc(label)}">${opts.caret ? `<span class="insp-mb-tcaret">${opts.collapsed ? "▸" : "▾"}</span>` : `<span class="insp-mb-tcaret"></span>`}${icon}<span class="insp-mb-nlabel">${esc(label)}</span>${opts.count != null ? `<span class="insp-mb-count">${opts.count}</span>` : ""}</div>`;
    if (!ls.key) ls.key = `lib:${ls.lib}`;
    let h = `<div class="insp-mb-home">Home</div>`;
    for (const l of this.store.libraries()) {
      if (!l.favorites) continue;
      h += row(`lib:${l.id}`, "Favorites", 0, ICONS.star, { count: this.store.items(k, l.id).length });
    }
    const fl = FUSION_LIB[k];
    const fc = !this._isOpen(fl);
    h += row(`lib:${fl}`, FUSION_NAME[k], 0, ICONS.folder, { caret: true, collapsed: fc });
    if (!fc) for (const c of this.store.categories(k, fl)) h += row(`cat:${fl}:${c}`, c, 1, ICONS.folder, { count: this.store.items(k, fl, c).length });
    for (const l of this.store.libraries()) {
      if (l.favorites) continue;
      const cats = this.store.categories(k, l.id);
      const col = !this._isOpen(l.id);
      h += row(`lib:${l.id}`, l.name, 0, libIcon(14), { caret: cats.length > 0, collapsed: col, count: this.store.items(k, l.id).length });
      if (!col) for (const c of cats) h += row(`cat:${l.id}:${c}`, c, 1, ICONS.folder, { count: this.store.items(k, l.id, c).length });
    }
    tree.innerHTML = h;
  }

  _node(key, e) {
    const k = this.kind;
    const [type, libId, ...rest] = key.split(":");
    const ls = this.libSel[k];
    const caret = e && e.target.closest && e.target.closest(".insp-mb-tcaret");
    if (type === "lib" && caret && caret.textContent) {
      this.open[libId] = !this._isOpen(libId);
      this.renderTree();
      return;
    }
    ls.key = key;
    ls.lib = libId;
    ls.cat = type === "cat" ? rest.join(":") : null;
    this.renderTree();
    this.renderLists();
  }

  _isOpen(libId) { return libId === FUSION_LIB.physical || libId === FUSION_LIB.appearance ? this.open[libId] === true : this.open[libId] !== false; }

  _itemHtml(it, k) {
    const look = k === "physical" ? appearanceInfo(this.app, it.appearance) : it;
    const sub = k === "physical" ? `${(Number(it.density) || 0).toFixed(3)} g/cm^3` : it.category || "";
    return `<div class="insp-mb-item${this.sel[k] === it.id ? " on" : ""}" data-mb-item="${esc(it.id)}" title="${esc(it.name)}"><span class="insp-ball" style="background:${swatchCss(look)}"></span><span class="insp-mb-iname">${esc(it.name)}</span><span class="insp-mb-isub">${esc(sub)}</span></div>`;
  }

  renderLists() {
    const k = this.kind;
    const q = this.query;
    const match = (it) => !q || it.name.toLowerCase().includes(q) || String(it.keywords || "").toLowerCase().includes(q) || String(it.category || "").toLowerCase().includes(q);
    const design = this.store.inDesign(k).filter(match);
    this.el.querySelector('[data-mb-list="design"]').innerHTML = design.length ? design.map((it) => this._itemHtml(it, k)).join("") : `<div class="insp-empty">None</div>`;
    const ls = this.libSel[k];
    let items;
    if (q) {
      // search runs over every library of the tab
      const seen = new Set();
      items = [];
      for (const lid of [FUSION_LIB[k], ...this.store.libraries().map((l) => l.id)]) for (const it of this.store.items(k, lid)) if (match(it) && !seen.has(it.id)) { seen.add(it.id); items.push(it); }
    } else items = this.store.items(k, ls.lib, ls.cat);
    const list = this.el.querySelector('[data-mb-list="library"]');
    list.innerHTML = `<div class="insp-mb-ihead"><span>Name</span><span>${k === "physical" ? "Density" : "Category"}</span></div>` + (items.length ? items.map((it) => this._itemHtml(it, k)).join("") : `<div class="insp-empty">${q ? "No matches" : "This library is empty"}</div>`);
  }

  renderEditor() {
    const ed = this.el.querySelector("[data-mb-editor]");
    if (!this.editor) { ed.innerHTML = ""; return; }
    const k = this.kind;
    const f = this.current();
    if (!f) { ed.innerHTML = `<div class="insp-mb-edempty">Select a material to view its properties.</div>`; this._applyState(); return; }
    const it = { ...f.item, ...(this.draft || {}) };
    const ro = f.readOnly;
    const dis = ro ? " disabled" : "";
    const srcName = f.lib === "design" ? "In This Design" : f.lib === FUSION_LIB[k] ? FUSION_NAME[k] : (this.store.libraries().find((l) => l.id === f.lib) || {}).name || "";
    const tabs = ["identity", ...(k === "physical" ? ["appearance", "physical"] : ["appearance"])];
    if (!tabs.includes(this.edTab)) this.edTab = "identity";
    let body = "";
    const field = (name, label, val, type = "text", extra = "") => `<label class="insp-mb-f"><span>${esc(label)}</span><input type="${type}" data-mb-field="${name}" value="${esc(val ?? "")}"${dis}${extra}></label>`;
    if (this.edTab === "identity") {
      const cats = [...new Set([...(f.lib === FUSION_LIB[k] ? this.store.categories(k, f.lib) : this.store.categories(k, f.lib)), ...(k === "physical" ? MATERIAL_CATEGORIES : APPEARANCE_CATEGORIES)])];
      body += field("name", "Name", it.name);
      body += `<label class="insp-mb-f"><span>Description</span><textarea data-mb-field="description" rows="2"${dis}>${esc(it.description || "")}</textarea></label>`;
      body += field("keywords", "Keywords", it.keywords || "");
      body += `<label class="insp-mb-f"><span>Category</span><select data-mb-field="category"${dis}>${cats.map((c) => `<option${c === it.category ? " selected" : ""}>${esc(c)}</option>`).join("")}${cats.includes(it.category) || !it.category ? "" : `<option selected>${esc(it.category)}</option>`}</select></label>`;
    } else if (this.edTab === "appearance") {
      if (k === "physical") {
        const ap = appearanceInfo(this.app, it.appearance);
        const aps = [...Object.values(APPEARANCES), ...this.store.libraries().flatMap((l) => this.store.items("appearance", l.id))];
        body += `<div class="insp-mb-appv"><span class="insp-ball big" style="background:${swatchCss(ap)}"></span><span>${esc(ap.name)}</span></div>`;
        body += `<label class="insp-mb-f"><span>Appearance</span><select data-mb-field="appearance"${dis}>${aps.map((a) => `<option value="${esc(a.id)}"${a.id === it.appearance ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>`;
      } else {
        body += `<div class="insp-mb-appv"><span class="insp-ball big" style="background:${swatchCss(it)}"></span><span>${esc(it.name)}</span></div>`;
        body += field("color", "Color", it.color, "color");
        body += field("roughness", "Roughness", it.roughness ?? 0.5, "range", ' min="0" max="1" step="0.01"');
        body += field("metalness", "Metallic", it.metalness ?? 0, "range", ' min="0" max="1" step="0.01"');
        body += field("transparency", "Transparency", (1 - (it.opacity ?? 1)).toFixed(2), "range", ' min="0" max="0.95" step="0.01"');
      }
    } else {
      const p = { ...physicalProps(f.item), ...(it.props || {}), ...(this.draft && this.draft.props ? this.draft.props : {}) };
      const num = (name, label, unit, v) => `<label class="insp-mb-f"><span>${esc(label)}</span><span class="insp-mb-num"><input type="text" inputmode="decimal" data-mb-field="${name}" value="${esc(fmt(v))}"${dis}><em>${esc(unit)}</em></span></label>`;
      body += `<div class="insp-mb-grp">Mechanical</div>`;
      body += num("density", "Density", "g / cm^3", it.density);
      for (const [key, label, unit] of PHYS_FIELDS.slice(0, 2)) body += num(`props.${key}`, label, unit, p[key]);
      body += `<div class="insp-mb-grp">Strength</div>`;
      for (const [key, label, unit] of PHYS_FIELDS.slice(2, 4)) body += num(`props.${key}`, label, unit, p[key]);
      body += `<div class="insp-mb-grp">Thermal</div>`;
      for (const [key, label, unit] of PHYS_FIELDS.slice(4)) body += num(`props.${key}`, label, unit, p[key]);
    }
    ed.innerHTML = `<div class="insp-mb-edhead"><span class="insp-ball" style="background:${swatchCss(k === "physical" ? appearanceInfo(this.app, it.appearance) : it)}"></span><div><div class="insp-mb-edname" data-mb-edname>${esc(it.name)}</div><div class="insp-mb-edsrc">${esc(srcName)}${ro ? " (read-only)" : ""}</div></div></div>
      <div class="insp-mb-edtabs">${tabs.map((t) => `<button type="button" data-mb-edtab="${t}" class="${t === this.edTab ? "on" : ""}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div>
      <div class="insp-mb-edbody">${body}</div>
      ${ro ? `<div class="insp-mb-ro">Materials in the Fusion libraries are read-only. Duplicate the material or add it to Favorites to edit a copy.</div>` : ""}`;
    for (const inp of ed.querySelectorAll("[data-mb-field]")) {
      const ev = inp.tagName === "SELECT" || inp.type === "color" || inp.type === "range" ? "input" : "input";
      inp.addEventListener(ev, () => this._edit(inp.dataset.mbField, inp));
      if (inp.tagName === "SELECT") inp.addEventListener("change", () => this._edit(inp.dataset.mbField, inp));
    }
    this._applyState();
  }

  _edit(field, inp) {
    const f = this.current();
    if (!f || f.readOnly) return;
    this.draft = this.draft || {};
    let v = inp.value;
    if (field.startsWith("props.")) {
      const n = Number(String(v).replace(",", "."));
      this.draft.props = { ...(f.item.props || {}), ...(this.draft.props || {}) };
      if (Number.isFinite(n)) this.draft.props[field.slice(6)] = n;
      inp.classList.toggle("bad", !Number.isFinite(n));
    } else if (field === "density" || field === "roughness" || field === "metalness") {
      const n = Number(String(v).replace(",", "."));
      inp.classList.toggle("bad", !(Number.isFinite(n) && n > 0) && field === "density");
      if (Number.isFinite(n)) this.draft[field] = n;
    } else if (field === "transparency") {
      this.draft.opacity = 1 - Number(v);
    } else this.draft[field] = v;
    if (field === "name") { const h = this.el.querySelector("[data-mb-edname]"); if (h) h.textContent = v; }
    this._applyState();
  }

  _applyState() {
    const b = this.el.querySelector('[data-mb-action="apply"]');
    const f = this.current();
    b.disabled = !(this.draft && f && !f.readOnly);
  }

  apply() {
    const f = this.current();
    if (!this.draft || !f || f.readOnly) return false;
    const patch = this.draft;
    if (patch.name !== undefined && !String(patch.name).trim()) { this.app.toast("A material needs a name", "warning"); return false; }
    if (patch.density !== undefined && !(patch.density > 0)) { this.app.toast("Density must be greater than zero", "warning"); return false; }
    this.draft = null;
    const ok = this.store.update(this.kind, this.sel[this.kind], patch);
    this.render();
    return ok;
  }

  // ---------------------------------------------------------------- actions / menus
  _action(a, btn) {
    if (a === "close") { this.close(); return; }
    if (a === "ok") { if (this.draft) this.apply(); this.close(); return; }
    if (a === "apply") { this.apply(); return; }
    if (a === "editor") { this.editor = !this.editor; this.render(); return; }
    const r = btn.getBoundingClientRect();
    if (a === "library") this._libraryMenu(r.left, r.top);
    if (a === "new") this._newMenu(r.left, r.top);
  }
  _userLibOfSelection() {
    const ls = this.libSel[this.kind];
    return ls.lib !== FUSION_LIB[this.kind] && ls.lib !== "design" ? ls.lib : null;
  }
  _libraryMenu(x, y) {
    const k = this.kind;
    const lib = this._userLibOfSelection();
    const ls = this.libSel[k];
    const isFav = lib === "favorites";
    this._menu(x, y, [
      { id: "createLibrary", label: "Create New Library", run: () => this._prompt("Library name", "My Library", (n) => { const id = this.store.createLibrary(n); this.libSel[k] = { lib: id, cat: null, key: `lib:${id}` }; this.render(); }) },
      { id: "openLibrary", label: "Open Existing Library...", run: () => this._openFile() },
      { id: "exportLibrary", label: "Export Library...", disabled: !lib, run: () => this._export(lib) },
      "-",
      { id: "renameLibrary", label: "Rename Library", disabled: !lib || isFav, run: () => this._prompt("Library name", (this.store.libraries().find((l) => l.id === lib) || {}).name, (n) => this.store.renameLibrary(lib, n)) },
      { id: "removeLibrary", label: "Remove Library", disabled: !lib || isFav, run: () => this._confirm(`Remove the library "${(this.store.libraries().find((l) => l.id === lib) || {}).name}" and its materials from this browser?`, () => { this.store.removeLibrary(lib); this.libSel[k] = { lib: FUSION_LIB[k], cat: null, key: `lib:${FUSION_LIB[k]}` }; this.render(); }) },
      "-",
      { id: "createCategory", label: "Create Category", disabled: !lib, run: () => this._prompt("Category name", "New Category", (n) => this.store.createCategory(k, lib, n)) },
      { id: "deleteCategory", label: "Delete Category", disabled: !lib || !ls.cat, run: () => { this.store.deleteCategory(k, lib, ls.cat); this.libSel[k] = { lib, cat: null, key: `lib:${lib}` }; this.render(); } },
    ]);
  }
  _newMenu(x, y) {
    const k = this.kind;
    const lib = this._userLibOfSelection() || "favorites";
    const cur = this.sel[k];
    this._menu(x, y, [
      { id: "createMaterial", label: k === "physical" ? "Create New Material" : "Create New Appearance", run: () => { const id = this.store.create(k, lib, this.libSel[k].cat || ""); this.libSel[k] = { lib, cat: this.libSel[k].cat && lib === this.libSel[k].lib ? this.libSel[k].cat : null, key: `lib:${lib}` }; this.editor = true; this.edTab = "identity"; this.select(id); } },
      { id: "duplicateMaterial", label: k === "physical" ? "Duplicate Selected Material" : "Duplicate Selected Appearance", disabled: !cur, run: () => { const id = this.store.duplicate(k, cur); if (id) { const f = this.store.find(k, id); this.libSel[k] = { lib: f.lib, cat: null, key: `lib:${f.lib}` }; this.select(id); } } },
    ]);
  }
  _itemMenu(x, y, id) {
    const k = this.kind;
    const f = this.store.find(k, id);
    if (!f) return;
    const libs = this.store.libraries();
    const bodies = this.app.selection.items.filter((r) => r.body && (r.kind === "body" || r.kind === "face")).map((r) => (r.kind === "face" && k === "appearance" ? r : { kind: "body", body: r.body }));
    this._menu(x, y, [
      { id: "assign", label: "Assign to Selection", disabled: !bodies.length, run: () => this.store.assign(k, id, bodies) },
      "-",
      ...libs.map((l) => ({ id: `addTo:${l.id}`, label: `Add to ${l.name}`, disabled: f.lib === l.id, run: () => this.store.addTo(k, id, l.id) })),
      { id: "duplicate", label: "Duplicate", run: () => { const nid = this.store.duplicate(k, id); if (nid) this.select(nid); } },
      "-",
      { id: "edit", label: "Edit", run: () => { this.editor = true; this.select(id); } },
      { id: "rename", label: "Rename", disabled: f.readOnly, run: () => this._prompt("Name", f.item.name, (n) => this.store.update(k, id, { name: n })) },
      { id: "delete", label: "Delete", disabled: f.readOnly || f.lib === "design", run: () => this._confirm(`Delete "${f.item.name}" from the library?`, () => { this.store.remove(k, id); if (this.sel[k] === id) this.sel[k] = null; this.render(); }) },
    ]);
  }
  _nodeMenu(x, y, key) {
    this._node(key);
    const k = this.kind;
    const [type, libId] = key.split(":");
    const user = libId !== FUSION_LIB[k];
    this._menu(x, y, [
      { id: "createMaterial", label: k === "physical" ? "Create New Material" : "Create New Appearance", disabled: !user, run: () => { const id = this.store.create(k, libId, type === "cat" ? key.split(":").slice(2).join(":") : ""); this.select(id); } },
      { id: "createCategory", label: "Create Category", disabled: !user, run: () => this._prompt("Category name", "New Category", (n) => this.store.createCategory(k, libId, n)) },
      { id: "exportLibrary", label: "Export Library...", disabled: !user, run: () => this._export(libId) },
      { id: "removeLibrary", label: "Remove Library", disabled: !user || libId === "favorites", run: () => this._confirm("Remove this library from this browser?", () => { this.store.removeLibrary(libId); this.libSel[k] = { lib: FUSION_LIB[k], cat: null, key: `lib:${FUSION_LIB[k]}` }; this.render(); }) },
    ]);
  }

  _menu(x, y, items) {
    this._closeMenu();
    const m = div("insp-mb-menu");
    m.dataset.mbMenuRoot = "1";
    for (const it of items) {
      if (it === "-") { m.appendChild(div("insp-mb-msep")); continue; }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "insp-mb-mi";
      b.dataset.mbMenu = it.id;
      b.textContent = it.label;
      b.disabled = !!it.disabled;
      b.addEventListener("click", () => { this._closeMenu(); try { it.run(); } catch (e) { console.error(e); this.app.toast(String(e.message || e), "error"); } });
      m.appendChild(b);
    }
    (this.app.dom.overlay || document.body).appendChild(m);
    const h = m.offsetHeight || 200;
    m.style.left = `${Math.round(x)}px`;
    m.style.top = `${Math.round(Math.max(4, y - h - 2))}px`;
    this.menu = m;
  }
  _closeMenu() { if (this.menu) { this.menu.remove(); this.menu = null; } }

  /** Small inline name prompt over the window (no window.prompt: blocked in sandboxed iframes). */
  _prompt(label, value, done) {
    const box = div("insp-mb-prompt");
    box.innerHTML = `<div class="insp-mb-pcard"><div>${esc(label)}</div><input type="text" data-mb-prompt value="${esc(value || "")}"><div class="insp-mb-pbtns"><button type="button" class="insp-mb-btn primary" data-mb-pok>OK</button><button type="button" class="insp-mb-btn" data-mb-pcancel>Cancel</button></div></div>`;
    this.el.appendChild(box);
    const inp = box.querySelector("input");
    const finish = (ok) => { const v = inp.value.trim(); box.remove(); if (ok && v) { try { done(v); } catch (e) { this.app.toast(String(e.message || e), "error"); } this.render(); } };
    box.querySelector("[data-mb-pok]").addEventListener("click", () => finish(true));
    box.querySelector("[data-mb-pcancel]").addEventListener("click", () => finish(false));
    inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); });
    inp.focus();
    inp.select();
  }
  _confirm(text, done) {
    const box = div("insp-mb-prompt");
    box.innerHTML = `<div class="insp-mb-pcard"><div>${esc(text)}</div><div class="insp-mb-pbtns"><button type="button" class="insp-mb-btn primary" data-mb-pok>OK</button><button type="button" class="insp-mb-btn" data-mb-pcancel>Cancel</button></div></div>`;
    this.el.appendChild(box);
    box.querySelector("[data-mb-pok]").addEventListener("click", () => { box.remove(); done(); });
    box.querySelector("[data-mb-pcancel]").addEventListener("click", () => box.remove());
  }
  _export(libId) {
    const txt = this.store.exportLibrary(libId);
    if (!txt) return;
    const name = ((this.store.libraries().find((l) => l.id === libId) || {}).name || "Library").replace(/[^\w\- ]+/g, "_");
    this.app.download(`${name}.materials.json`, txt, "application/json");
  }
  _openFile() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json,application/json";
    inp.style.display = "none";
    inp.addEventListener("change", async () => {
      const file = inp.files && inp.files[0];
      inp.remove();
      if (!file) return;
      try {
        const id = this.store.importLibrary(await file.text());
        this.libSel[this.kind] = { lib: id, cat: null, key: `lib:${id}` };
        this.render();
        this.app.toast(`Opened library "${(this.store.libraries().find((l) => l.id === id) || {}).name}"`, "info");
      } catch (e) { this.app.toast(`Open Existing Library: ${e.message || e}`, "error"); }
    });
    document.body.appendChild(inp);
    inp.click();
  }
}

const fmt = (v) => (Number.isFinite(Number(v)) ? String(Math.round(Number(v) * 10000) / 10000) : "");

// original 16 px glyphs for the browser's bottom bar
function libIcon(s = 16) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3h3v10h-3zM6.5 3h3v10h-3z" fill="#e9eef3" stroke="#5a6570" stroke-width=".9"/><path d="M10.4 3.6l2.8-.8 2.3 9.6-2.8.8z" fill="#d7e6f5" stroke="#5a6570" stroke-width=".9"/></svg>`;
}
function newIcon() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="8.5" r="5" fill="#d9dfe5" stroke="#5a6570" stroke-width=".9"/><path d="M12.5 1.5v5M10 4h5" stroke="#2f7de1" stroke-width="1.5"/></svg>`;
}
function editIcon() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1" fill="#fff" stroke="#5a6570" stroke-width=".9"/><path d="M4 6h8M4 8.5h5M4 11h6" stroke="#5a6570" stroke-width=".9"/><path d="M9.5 12.5l4-4 1.2 1.2-4 4H9.5z" fill="#2f7de1"/></svg>`;
}
