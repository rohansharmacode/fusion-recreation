// app.components: Fusion's component model on top of the document (model.js "components and occurrences").
// Queries read the visible result (app.result.state.occ / bodyOcc) plus the document metadata
// (doc.components, doc.occurrences); changes go through app.mutate (one undo step each). See ARCHITECTURE.md
// "Components".
import * as M from "../model.js";

const ROOT = M.ROOT;
const ID = M.meshOps.IDENTITY;
const clone = (o) => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const MD = M.meshOps;

/** Rigid transform from translation t and XYZ angles (degrees) about pivot c: rotate about c, then translate. */
export function rigid(t = [0, 0, 0], r = [0, 0, 0], c = [0, 0, 0]) {
  let X = ID;
  if (r[0]) X = MD.mul(MD.axisRotation(r[0], c, [1, 0, 0]), X);
  if (r[1]) X = MD.mul(MD.axisRotation(r[1], c, [0, 1, 0]), X);
  if (r[2]) X = MD.mul(MD.axisRotation(r[2], c, [0, 0, 1]), X);
  return MD.mul(MD.translation(t), X);
}

export function installComponents(app) {
  const display = new Map(); // oid -> M display-only override (animation / motion), never evaluated
  let clipboard = null; // {kind:'occurrence', occ} | {kind:'bodies', bodies}

  const st = () => (app.result && app.result.state) || null;
  const doc = () => app.doc;
  const occMeta = (oid) => (doc().occurrences && doc().occurrences[oid]) || null;
  const compMeta = (cid) => (doc().components && doc().components[cid]) || null;
  const alive = (oid) => oid === ROOT || !!(st() && st().occ && st().occ.has(oid));
  const emit = (action, extra = {}) => app.emit("components", { action, ...extra });

  function parentOf(oid) {
    const s = st();
    const o = s && s.occ && s.occ.get(oid);
    return o ? o.parent || ROOT : null;
  }
  function ancestors(oid) { // [oid, parent, ..., ROOT]
    const out = [];
    let o = oid;
    for (let i = 0; o && i < 64; i++) { out.push(o); if (o === ROOT) break; o = parentOf(o) || ROOT; }
    return out;
  }
  function label(oid) {
    if (oid === ROOT) return doc().name || "Untitled";
    const s = st();
    const e = s && s.occ && s.occ.get(oid);
    const meta = occMeta(oid);
    const cid = (e && e.component) || (meta && meta.component);
    const c = compMeta(cid);
    return `${(c && c.name) || "Component"}:${(meta && meta.n) || 1}`;
  }
  function info(oid) {
    if (oid === ROOT) return { id: ROOT, root: true, component: ROOT, name: doc().name || "Untitled", label: label(ROOT), parent: null, T: ID, visible: true, grounded: true, selectable: true };
    const s = st();
    const e = s && s.occ && s.occ.get(oid);
    if (!e) return null;
    const meta = occMeta(oid) || {};
    const c = compMeta(e.component) || {};
    return {
      id: oid, component: e.component, name: c.name || "Component", label: label(oid), n: meta.n || 1,
      parent: e.parent || ROOT, T: e.T.slice(), inst: e.inst || null,
      visible: meta.visible !== false, grounded: !!meta.grounded, selectable: meta.selectable !== false,
      pending: !!(doc().positions && doc().positions[oid]), meta, componentMeta: c,
    };
  }
  /** Direct child occurrences (alive), in creation order. */
  function children(oid = ROOT) {
    const s = st();
    if (!s || !s.occ) return [];
    return [...s.occ.values()].filter((o) => (o.parent || ROOT) === oid).map((o) => o.id);
  }
  function list() {
    const s = st();
    return s && s.occ ? [...s.occ.keys()].map(info).filter(Boolean) : [];
  }
  function tree(oid = ROOT) { const i = info(oid); return i ? { ...i, children: children(oid).map(tree) } : null; }
  const ownerOf = (bodyId) => M.bodyOwner(st(), bodyId);
  function bodiesOf(oid = ROOT, { deep = true } = {}) {
    const s = st();
    if (!s) return [];
    return deep ? M.occBodiesDeep(s, oid) : M.occBodies(s, oid);
  }
  /** World-space geometry of an occurrence's bodies: [{id, kind, shape?, mesh?}] (state bodies are world space). */
  function worldBodies(oid = ROOT, opts = {}) {
    return bodiesOf(oid, opts).map((id) => app.anyBody(id)).filter(Boolean).map((b) => ({ id: b.id, kind: b.kind, shape: b.shape, mesh: b.mesh }));
  }
  const featuresOf = (oid = ROOT) => doc().features.filter((f) => (f.occ || ROOT) === oid).map((f) => f.id);
  const ownerOfFeature = (f) => {
    const x = typeof f === "string" ? app.feature(f) : f;
    if (!x) return ROOT;
    return x.occ && occMeta(x.occ) ? x.occ : ROOT;
  };

  // ----- activation -----
  const activeId = () => { const a = doc().activeOcc; return a && alive(a) ? a : ROOT; };
  function inActive(oid) {
    const a = activeId();
    if (a === ROOT) return true;
    return ancestors(oid).includes(a);
  }
  function activate(oid = ROOT) {
    if (oid !== ROOT && !alive(oid)) return false;
    if (oid === activeId()) return true;
    app.mutate("Activate Component", (d) => { if (oid === ROOT) delete d.activeOcc; else d.activeOcc = oid; }, { recompute: false });
    emit("activate", { occ: oid });
    return true;
  }

  // ----- visibility / selectability / fading -----
  function occShown(oid) {
    for (const o of ancestors(oid)) { if (o === ROOT) break; const m = occMeta(o); if (m && m.visible === false) return false; }
    return true;
  }
  const bodyShown = (bodyId) => occShown(ownerOf(bodyId));
  function bodySelectable(bodyId) {
    for (const o of ancestors(ownerOf(bodyId))) { if (o === ROOT) break; const m = occMeta(o); if (m && m.selectable === false) return false; }
    return true;
  }
  /** True when a component other than the root is active and the body is outside it (drawn faded). */
  const faded = (bodyId) => activeId() !== ROOT && !inActive(ownerOf(bodyId));

  function setOccFlag(oids, key, value, label) {
    oids = (Array.isArray(oids) ? oids : [oids]).filter((o) => o && o !== ROOT && occMeta(o));
    if (!oids.length) return false;
    app.mutate(label, (d) => { for (const o of oids) { const m = d.occurrences[o]; if (value === undefined || value === null) delete m[key]; else m[key] = value; } }, { recompute: false });
    emit(key, { occs: oids });
    return true;
  }
  const setVisible = (oids, v) => setOccFlag(oids, "visible", v ? null : false, v ? "Show" : "Hide");
  const setSelectable = (oids, v) => setOccFlag(oids, "selectable", v ? null : false, v ? "Selectable" : "Unselectable");
  const setGrounded = (oids, v) => setOccFlag(oids, "grounded", v ? true : null, v ? "Pin" : "Unpin");

  // ----- transforms -----
  /** Evaluated world transform (with uncaptured positions; display overrides not included). */
  const transform = (oid) => (oid === ROOT ? ID.slice() : M.occTransform(st(), oid).slice());
  const pending = () => clone(doc().positions || {});
  const hasPending = () => !!(doc().positions && Object.keys(doc().positions).length);
  /**
   * Move an occurrence to world transform m. Uncaptured (Fusion's behaviour until Capture Position) unless
   * opts.capture: then a Position (snapshot) feature records it at the marker.
   */
  function setTransform(oid, m, opts = {}) {
    if (!alive(oid) || oid === ROOT || !Array.isArray(m) || m.length !== 12) return false;
    const meta = occMeta(oid);
    if (meta && meta.grounded && !opts.force) { app.toast(`${label(oid)} is pinned. Unpin it to move it.`, "warning"); return false; }
    return setTransforms({ [oid]: m }, opts);
  }
  function setTransforms(map, opts = {}) {
    const entries = Object.entries(map || {}).filter(([o, m]) => o !== ROOT && alive(o) && Array.isArray(m) && m.length === 12);
    if (!entries.length) return false;
    app.mutate(opts.label || "Move", (d) => {
      d.positions = { ...(d.positions || {}) };
      for (const [o, m] of entries) d.positions[o] = m.map(Number);
      if (opts.capture) M.capturePositions(d);
    });
    emit("transform", { occs: entries.map(([o]) => o) });
    return true;
  }
  /** Capture Position: the uncaptured positions become a Position feature in the timeline. */
  function capture() {
    if (!hasPending()) return null;
    const f = app.mutate("Capture Position", (d) => M.capturePositions(d));
    emit("capture");
    return f;
  }
  /** Revert Position: drop the uncaptured positions. */
  function revert() {
    if (!hasPending()) return false;
    app.mutate("Revert Position", (d) => { delete d.positions; });
    emit("revert");
    return true;
  }
  // display-only overrides (motion / animation): the viewport draws the occurrence at m without re-evaluating
  function setDisplayTransform(oid, m) {
    if (m && Array.isArray(m) && m.length === 12) display.set(oid, m.map(Number)); else display.delete(oid);
    emit("display", { occ: oid });
  }
  const displayTransform = (oid) => (display.has(oid) ? display.get(oid).slice() : null);
  function clearDisplay() { if (!display.size) return; display.clear(); emit("display", {}); }
  /** Display delta of a body (display override x inverse evaluated transform of its nearest overridden occurrence), or null. */
  function bodyDisplayMatrix(bodyId) {
    if (!display.size) return null;
    for (const o of ancestors(ownerOf(bodyId))) {
      if (o === ROOT) break;
      if (display.has(o)) return MD.mul(display.get(o), M.invRigid(M.occTransform(st(), o)));
    }
    return null;
  }

  // ----- creation -----
  /**
   * New Component. opts: {name?, parent?: oid (default: the active component), bodies?: [ids] (From Bodies:
   * one component per body, named after it), activate?: bool (default true for an empty component)}.
   * Returns the new occurrence ids.
   */
  function create(opts = {}) {
    const given = opts.parent && alive(opts.parent) ? opts.parent : null;
    const bodies = (opts.bodies || []).filter((b) => app.anyBody(b) && !M.isInstanceId(b));
    const made = [];
    app.mutate(bodies.length ? "Create Components from Bodies" : "New Component", (d) => {
      const items = bodies.length ? bodies.map((b) => ({ body: b, name: (d.bodies[b] && d.bodies[b].name) || "Component" })) : [{ name: opts.name }];
      for (const it of items) {
        // a body's new component goes under the component that owns the body (Fusion), else under the parent
        const parent = given || (it.body ? ownerOf(it.body) : activeId());
        const ids = M.newComponentMeta(d, { name: it.name });
        const f = { type: "component", mode: it.body ? "bodies" : "empty", comp: ids.comp, newOcc: ids.occ, name: d.components[ids.comp].name };
        if (parent !== ROOT) f.parent = parent;
        if (it.body) f.bodies = [it.body];
        f.occ = parent === ROOT ? null : parent;
        addToTimeline(d, f);
        made.push(ids.occ);
      }
      if (!bodies.length && opts.activate !== false && made.length) d.activeOcc = made[0];
    });
    emit("create", { occs: made });
    return made;
  }
  const createFromBodies = (bodyIds, opts = {}) => create({ ...opts, bodies: bodyIds, activate: false });
  function addToTimeline(d, f) {
    // prepareFeature (core) names it, assigns ids and captures pending positions first
    const prep = app._prepareFeature;
    if (prep) prep(d, f);
    d.features.splice(d.marker, 0, f);
    d.marker += 1;
    return f;
  }

  function rename(oid, name) {
    name = String(name || "").trim();
    const e = info(oid);
    if (!name || !e) return false;
    if (oid === ROOT) { app.mutate("Rename", (d) => { d.name = name; }, { recompute: false }); emit("rename", { occ: oid }); return true; }
    app.mutate("Rename", (d) => {
      d.components[e.component].name = name;
      // the creating feature carries the component name in the timeline
      for (const f of d.features) if (f.type === "component" && f.comp === e.component && f.mode !== "paste") f.name = name;
    }, { recompute: false });
    emit("rename", { occ: oid });
    return true;
  }
  function setProperties(oid, props = {}) {
    const e = info(oid);
    if (!e || oid === ROOT) return false;
    app.mutate("Component Properties", (d) => {
      const c = d.components[e.component];
      for (const k of ["partNumber", "description", "material", "appearance"]) if (k in props) { if (props[k] == null || props[k] === "") delete c[k]; else c[k] = props[k]; }
      if (props.name) c.name = String(props.name);
    }, { recompute: false });
    emit("properties", { occ: oid });
    return true;
  }

  /**
   * Delete an occurrence. A pasted occurrence just goes; the last occurrence of a component takes the component's
   * features, its sub-components and their bodies with it (bodies a 'From Bodies' component took get a Delete feature).
   */
  function remove(oids) {
    oids = (Array.isArray(oids) ? oids : [oids]).filter((o) => o !== ROOT && alive(o));
    if (!oids.length) return false;
    const s = st();
    app.mutate("Delete", (d) => {
      const drop = new Set(); // occurrences removed
      for (const oid of oids) {
        const e = s.occ.get(oid);
        if (!e) continue;
        const sub = M.occSubtree(s, oid);
        // removing the primary occurrence of a component removes its pasted occurrences as well
        for (const o of s.occ.values()) if (sub.has(o.inst)) sub.add(o.id);
        for (const o of sub) drop.add(o);
      }
      const taken = [];
      const gone = (f) => (f.occ && drop.has(f.occ)) || (f.newOcc && drop.has(f.newOcc) && (f.type === "component" || f.operation === "newComponent"));
      for (const f of d.features) if (f.type === "component" && f.mode === "bodies" && drop.has(f.newOcc) && !(f.occ && drop.has(f.occ))) taken.push(...(f.bodies || []));
      for (let i = d.features.length - 1; i >= 0; i--) {
        if (!gone(d.features[i])) continue;
        d.features.splice(i, 1);
        if (d.marker > i) d.marker -= 1;
      }
      const live = taken.filter((b) => s.bodies.has(b) || (s.meshBodies && s.meshBodies.has(b)));
      if (live.length) addToTimeline(d, { type: "delete", bodies: live });
      for (const o of drop) {
        const m = d.occurrences && d.occurrences[o];
        if (!m) continue;
        delete d.occurrences[o];
        if (d.positions) delete d.positions[o];
        if (!Object.values(d.occurrences).some((x) => x.component === m.component)) delete d.components[m.component];
      }
      if (d.positions && !Object.keys(d.positions).length) delete d.positions;
      if (d.activeOcc && drop.has(d.activeOcc)) delete d.activeOcc;
    });
    app.selection.set(app.selection.items.filter((r) => !(r.kind === "occurrence" && oids.includes(r.occ))));
    emit("remove", { occs: oids });
    return true;
  }

  // ----- copy / paste -----
  function copy(refs = app.selection.items) {
    const occ = refs.find((r) => r.kind === "occurrence" && r.occ !== ROOT);
    if (occ && alive(occ.occ)) { clipboard = { kind: "occurrence", occ: occ.occ }; return true; }
    const bodies = refs.filter((r) => r.kind === "body").map((r) => r.body).filter((b) => app.anyBody(b));
    if (bodies.length) { clipboard = { kind: "bodies", bodies }; return true; }
    return false;
  }
  const canPaste = () => !!clipboard && (clipboard.kind === "bodies" ? clipboard.bodies.some((b) => app.anyBody(b)) : alive(clipboard.occ));
  /** Paste: another occurrence of the copied component (Component1:2) in the active component. Returns its id. */
  function paste(opts = {}) {
    if (!canPaste() || clipboard.kind !== "occurrence") return null;
    const src = clipboard.occ;
    const e = info(src);
    let made = null;
    app.mutate("Paste", (d) => {
      const oid = M.newOccurrenceMeta(d, e.component);
      const parent = activeId();
      const f = { type: "component", mode: "paste", comp: e.component, newOcc: oid, source: e.inst || src, T: (opts.T || e.T).slice(), name: `${e.name}:${d.occurrences[oid].n}` };
      if (parent !== ROOT && parent !== src) f.parent = parent;
      f.occ = f.parent || null;
      addToTimeline(d, f);
      made = oid;
    });
    emit("paste", { occs: [made] });
    return made;
  }
  /** Paste New: an independent copy of the copied component ("Component1 (1)") with copies of its bodies. */
  function pasteNew(opts = {}) {
    if (!canPaste() || clipboard.kind !== "occurrence") return null;
    const src = clipboard.occ;
    const e = info(src);
    let made = null;
    app.mutate("Paste New", (d) => {
      let k = 1;
      const names = new Set(Object.values(d.components || {}).map((c) => c.name));
      while (names.has(`${e.name} (${k})`)) k++;
      const ids = M.newComponentMeta(d, { name: `${e.name} (${k})` });
      const parent = activeId();
      const srcBodies = M.occBodies(st(), src).filter((b) => !M.isInstanceId(b));
      const newBodies = srcBodies.map((b) => M.nextBody(d, { ...clone(d.bodies[M.instanceBase(b)] || {}), name: (d.bodies[b] && d.bodies[b].name) || undefined }));
      const f = { type: "component", mode: "copy", comp: ids.comp, newOcc: ids.occ, source: src, T: (opts.T || e.T).slice(), newBodies, name: d.components[ids.comp].name };
      if (parent !== ROOT && parent !== src) f.parent = parent;
      f.occ = f.parent || null;
      addToTimeline(d, f);
      made = ids.occ;
    });
    emit("paste", { occs: [made], copy: true });
    return made;
  }

  // ----- isolate -----
  function isolate(oid) {
    const ids = bodiesOf(oid);
    const sc = app.ui.browser && app.ui.browser.isolateBodies;
    if (sc) return sc(ids);
    return false;
  }

  const api = {
    ROOT,
    get active() { return activeId(); },
    activate, inActive, isActive: (oid) => activeId() === oid,
    list, tree, info, occurrence: info, children, parentOf, ancestors, label,
    component: (cid) => compMeta(cid), components: () => clone(doc().components || {}),
    ownerOf, bodiesOf, worldBodies, featuresOf, ownerOfFeature, alive,
    occShown, bodyShown, bodySelectable, faded, setVisible, setSelectable, setGrounded,
    transform, setTransform, setTransforms, pending, hasPending, capture, revert,
    setDisplayTransform, displayTransform, clearDisplay, bodyDisplayMatrix, get displayOverrides() { return display.size; },
    create, createFromBodies, rename, setProperties, remove,
    copy, paste, pasteNew, canPaste, get clipboard() { return clipboard ? clone(clipboard) : null; },
    isolate, rigid,
    /** Count of occurrences of a component in the result (BOM quantity). */
    count: (cid) => list().filter((o) => o.component === cid).length,
  };
  app.on("doc", (d) => { if (d && d.replaced) { display.clear(); } });
  return api;
}
