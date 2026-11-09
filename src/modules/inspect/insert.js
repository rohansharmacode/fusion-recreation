// INSERT objects that live outside the parametric timeline:
//   canvases     reference images placed on a plane / planar face (Fusion's "Canvases" folder)
//   (legacy) doc.meshes: display-only meshes of older documents. Insert Mesh now makes real mesh bodies
//                (`mesh` timeline features, see mesh.js / model.js); M.migrateDoc converts doc.meshes when a
//                document is opened, so the mesh half of this store normally stays empty.
// Both are stored in the document (app.doc.canvases / app.doc.meshes) and changed through
// app.mutate, so they are undoable and saved / opened with the design. This file holds the store,
// the canvas rendering (own THREE groups), picking, selection highlight and Delete-key handling.
//
// Canvas def: {id, name, file, image (data URL), px:[w,h], size (bytes), planeRef, plane:{o,x,n},
//   xDist, yDist (mm), angle (deg), scale, scaleX, scaleY, flipH, flipV, opacity (0-100),
//   through, selectable, renderable, visible}
// Mesh def:   {id, name, file, format, units, flipUp, tx, ty, tz (mm), rx, ry, rz (deg), scale,
//   data (base64 Float32 triangle soup, file units), tris, bbox:{min,max} (file units), visible}
import * as THREE from "three";

export const MM_PER_PX = 1; // a canvas comes in at one millimetre per image pixel (scale it afterwards)
export const UNIT_MM = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
export const BIG_IMAGE = 2 * 1024 * 1024;

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
export { V as IV };
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clone = (o) => JSON.parse(JSON.stringify(o));

// ------------------------------------------------------------------ geometry
/** Plane {o, x, n} a canvas sits on (construction planes follow their feature). */
export function canvasPlane(app, c) {
  const r = c && c.planeRef;
  if (r && r.kind === "origin" && app.K.ORIGIN_PLANES[r.name]) return { ...app.K.ORIGIN_PLANES[r.name], o: c.plane ? c.plane.o : [0, 0, 0] };
  if (r && r.kind === "cplane") {
    const st = app.planeState && app.planeState(r.id);
    if (st && st.plane) return { ...st.plane };
    return null; // "missing plane"
  }
  return c && c.plane ? { ...c.plane } : null;
}

/** World frame of a canvas: {center, X, Y, n, x0, y0, w, h, w1, h1, corners} or null. */
export function canvasFrame(app, c) {
  const pl = canvasPlane(app, c);
  if (!pl || !c.px) return null;
  const n = V.norm(pl.n), x0 = V.norm(pl.x), y0 = V.cross(n, x0);
  const center = V.add(pl.o, V.add(V.mul(x0, num(c.xDist)), V.mul(y0, num(c.yDist))));
  const a = (num(c.angle) * Math.PI) / 180;
  const X = V.add(V.mul(x0, Math.cos(a)), V.mul(y0, Math.sin(a)));
  const Y = V.cross(n, X);
  const s = num(c.scale, 1);
  const w1 = c.px[0] * MM_PER_PX * num(c.scaleX, 1), h1 = c.px[1] * MM_PER_PX * num(c.scaleY, 1);
  const w = w1 * s, h = h1 * s;
  const at = (u, v) => V.add(center, V.add(V.mul(X, (u * w) / 2), V.mul(Y, (v * h) / 2)));
  return { center, X, Y, n, x0, y0, w, h, w1, h1, anchor: pl.o, corners: [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)] };
}

/** Base64 <-> Float32Array (mesh triangle soups stored in the document). */
export function f32ToB64(arr) {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
export function b64ToF32(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return new Float32Array(u8.buffer, 0, Math.floor(u8.length / 4));
}

/** Linear part (file units -> mm, flip up, uniform scale) as a 3x3 function, and the rotation. */
function meshLinear(m) {
  const k = (UNIT_MM[m.units] || 1) * num(m.scale, 1);
  // Flip Up Direction: a Y-up file is turned Z-up (x, y, z) -> (x, -z, y)
  return m.flipUp ? (p) => [p[0] * k, -p[2] * k, p[1] * k] : (p) => [p[0] * k, p[1] * k, p[2] * k];
}
function rotMatrix(m) {
  const e = new THREE.Euler(THREE.MathUtils.degToRad(num(m.rx)), THREE.MathUtils.degToRad(num(m.ry)), THREE.MathUtils.degToRad(num(m.rz)), "XYZ");
  return new THREE.Matrix4().makeRotationFromEuler(e);
}
/** Pivot (rotation centre, before translation) = centre of the scaled file bounding box. */
export function meshPivot(m) {
  const b = m.bbox || { min: [0, 0, 0], max: [0, 0, 0] };
  const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  return meshLinear(m)(c);
}
/** THREE.Matrix4 mapping file coordinates to world millimetres: T(t) T(c) R T(-c) L. */
export function meshMatrix(m) {
  const L = new THREE.Matrix4();
  const k = (UNIT_MM[m.units] || 1) * num(m.scale, 1);
  if (m.flipUp) L.set(k, 0, 0, 0, 0, 0, -k, 0, 0, k, 0, 0, 0, 0, 0, 1);
  else L.makeScale(k, k, k);
  const c = meshPivot(m);
  const M = new THREE.Matrix4().makeTranslation(num(m.tx) + c[0], num(m.ty) + c[1], num(m.tz) + c[2]);
  M.multiply(rotMatrix(m));
  M.multiply(new THREE.Matrix4().makeTranslation(-c[0], -c[1], -c[2]));
  M.multiply(L);
  return M;
}
/** World-space centre (of the transformed file bbox centre) and z range of a mesh def + its positions. */
export function meshWorldInfo(m, pos) {
  const M = meshMatrix(m);
  const v = new THREE.Vector3();
  let zmin = Infinity, zmax = -Infinity;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  if (pos) {
    for (let i = 0; i < pos.length; i += 3) {
      v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(M);
      if (v.z < zmin) zmin = v.z;
      if (v.z > zmax) zmax = v.z;
      min[0] = Math.min(min[0], v.x); min[1] = Math.min(min[1], v.y); min[2] = Math.min(min[2], v.z);
      max[0] = Math.max(max[0], v.x); max[1] = Math.max(max[1], v.y); max[2] = Math.max(max[2], v.z);
    }
  }
  const c = meshPivot(m);
  return { center: [c[0] + num(m.tx), c[1] + num(m.ty), c[2] + num(m.tz)], zmin, zmax, min, max };
}

// ------------------------------------------------------------------ store
export function createInsertStore(app) {
  const list = (key) => (Array.isArray(app.doc[key]) ? app.doc[key] : []);
  const keyOf = (kind) => (kind === "mesh" || kind === "meshBody" ? "meshes" : "canvases");
  const S = {
    canvases: () => list("canvases"),
    meshes: () => list("meshes"),
    canvas: (id) => list("canvases").find((c) => c.id === id) || null,
    mesh: (id) => list("meshes").find((m) => m.id === id) || null,
    add(kind, def, label) {
      const key = keyOf(kind);
      return app.mutate(label || (key === "meshes" ? "Insert Mesh" : "Canvas"), (doc) => {
        doc[key] = Array.isArray(doc[key]) ? doc[key] : [];
        doc.counters = doc.counters || {};
        const ck = key === "meshes" ? "meshBody" : "canvas";
        doc.counters[ck] = (doc.counters[ck] || 0) + 1;
        const id = `${key === "meshes" ? "mb" : "cv"}${doc.counters[ck]}`;
        const item = { ...clone(def), id, visible: true };
        if (!item.name) item.name = key === "meshes" ? `Mesh${doc.counters[ck]}` : `Canvas${doc.counters[ck]}`;
        doc[key].push(item);
        return id;
      }, { recompute: false });
    },
    update(kind, id, patch, label) {
      const key = keyOf(kind);
      return app.mutate(label || "Edit", (doc) => {
        const it = (doc[key] || []).find((x) => x.id === id);
        if (!it) throw new Error("The object no longer exists");
        Object.assign(it, clone(patch));
        it.id = id;
        return id;
      }, { recompute: false });
    },
    remove(kind, ids, label = "Delete") {
      const key = keyOf(kind);
      const set = new Set(ids);
      if (!list(key).some((x) => set.has(x.id))) return;
      app.mutate(label, (doc) => { doc[key] = (doc[key] || []).filter((x) => !set.has(x.id)); }, { recompute: false });
      const sel = app.selection.items.filter((r) => !((r.kind === "canvas" || r.kind === "meshBody") && set.has(r.id)));
      if (sel.length !== app.selection.items.length) app.selection.set(sel);
    },
    rename(kind, id, name) {
      name = String(name || "").trim();
      const key = keyOf(kind);
      const it = list(key).find((x) => x.id === id);
      if (!it || !name || it.name === name) return;
      app.mutate("Rename", (doc) => { const x = (doc[key] || []).find((y) => y.id === id); if (x) x.name = name; }, { recompute: false });
    },
    setVisible(kind, ids, v) {
      const key = keyOf(kind);
      const set = new Set(ids);
      if (!list(key).some((x) => set.has(x.id) && (x.visible !== false) !== !!v)) return;
      app.mutate(v ? "Show" : "Hide", (doc) => { for (const x of doc[key] || []) if (set.has(x.id)) x.visible = !!v; }, { recompute: false });
    },
    setSelectable(ids, v) {
      const set = new Set(ids);
      app.mutate("Selectable/Unselectable", (doc) => { for (const x of doc.canvases || []) if (set.has(x.id)) x.selectable = !!v; }, { recompute: false });
    },
  };
  return S;
}

// ------------------------------------------------------------------ view
const SEL_BLUE = 0x1f78d1;
const HOVER_BLUE = 0x7fb8f0;

export function createInsertView(app, store) {
  const canvasRoot = new THREE.Group();
  canvasRoot.name = "insert-canvases";
  canvasRoot.userData.noPick = true;
  const meshRoot = new THREE.Group();
  meshRoot.name = "insert-meshes";
  meshRoot.userData.noPick = true;
  let installed = false;
  const texCache = new Map(); // data URL -> {tex, ok}
  const geoCache = new Map(); // data string -> {geo, pos}
  const canvasObjs = new Map(); // id -> {mesh, border}
  const meshObjs = new Map(); // id -> {mesh, geo}
  let preview = { canvas: null, canvasEdit: null, mesh: null, meshEdit: null };
  let syncTimer = null;
  const vp = () => app.viewport;

  function install() {
    const v = vp();
    if (installed || !v || !v.scene) return;
    installed = true;
    v.scene.add(canvasRoot);
    // mesh bodies take part in Fit (the sketches layer is included in the content bounds)
    ((v.groups && v.groups.sketches) || v.scene).add(meshRoot);
    if (v.addPickProvider) v.addPickProvider(pickProvider);
  }

  // ---------------------------------------------------------------- textures / geometry
  function texture(url) {
    let e = texCache.get(url);
    if (e) return e;
    e = { tex: null, ok: false, used: 0 };
    texCache.set(url, e);
    try {
      e.tex = new THREE.TextureLoader().load(url, () => { e.ok = true; const v = vp(); if (v) v.requestRender(); }, undefined, () => { e.ok = false; });
      e.tex.colorSpace = THREE.SRGBColorSpace;
      e.tex.anisotropy = 4;
    } catch (err) { console.warn("[insert] canvas texture failed", err); }
    return e;
  }
  function meshGeometry(m) {
    const key = m.data || "";
    let e = geoCache.get(key);
    if (e) return e;
    let pos = m._positions || null;
    if (!pos) { try { pos = b64ToF32(m.data); } catch (err) { console.warn("[insert] bad mesh data", err); pos = new Float32Array(0); } }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals(); // triangle soup -> flat facet normals
    geo.computeBoundingSphere();
    e = { geo, pos, used: 0 };
    geoCache.set(key, e);
    return e;
  }

  // ---------------------------------------------------------------- canvases
  function canvasMaterial(c) {
    const e = texture(c.image);
    const through = !!c.through;
    const mat = new THREE.MeshBasicMaterial({
      map: e.tex || null, transparent: true, opacity: Math.max(0, Math.min(1, num(c.opacity, 50) / 100)), side: THREE.DoubleSide,
      depthWrite: false, depthTest: !through, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
    });
    return mat;
  }
  function buildCanvas(c, isPreview) {
    const f = canvasFrame(app, c);
    if (!f) return null;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.Mesh(geo, canvasMaterial(c));
    const fx = c.flipH ? -1 : 1, fy = c.flipV ? -1 : 1;
    const X = new THREE.Vector3(...f.X).multiplyScalar(f.w * fx), Y = new THREE.Vector3(...f.Y).multiplyScalar(f.h * fy), N = new THREE.Vector3(...f.n);
    const M = new THREE.Matrix4().makeBasis(X, Y, N).setPosition(new THREE.Vector3(...f.center));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(M);
    mesh.matrixWorldNeedsUpdate = true;
    mesh.renderOrder = c.through ? 950 : 2;
    mesh.userData = { noPick: true, canvas: c.id || null };
    const bg = new THREE.BufferGeometry().setFromPoints(f.corners.map((p) => new THREE.Vector3(...p)));
    const border = new THREE.LineLoop(bg, new THREE.LineBasicMaterial({ color: SEL_BLUE, depthTest: false, transparent: true }));
    border.renderOrder = 960;
    border.userData.noPick = true;
    border.visible = !!isPreview;
    return { mesh, border, frame: f };
  }
  function disposeObj(o) {
    if (!o) return;
    for (const x of [o.mesh, o.border]) {
      if (!x) continue;
      if (x.parent) x.parent.remove(x);
      if (x.geometry && !(x.userData && x.userData.sharedGeo)) x.geometry.dispose();
      if (x.material) x.material.dispose();
    }
  }

  // ---------------------------------------------------------------- meshes
  function meshMaterial() {
    const v = vp();
    // the bodies' default look ("Steel - Satin" under the viewport environment), facets flat-shaded
    const env = (v && ((v._vp && v._vp.envMap) || v.envMap)) || null;
    return new THREE.MeshStandardMaterial({
      color: "#b9bdc2", metalness: 0.3, roughness: 0.35, flatShading: true, side: THREE.DoubleSide,
      envMap: env, envMapIntensity: 0.8, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
  }
  function styleMesh(mat, state) {
    mat.color.set(state === "sel" ? "#7fb2ea" : state === "hover" ? "#a9cdf2" : "#b9bdc2");
    mat.emissive.setHex(state === "sel" ? SEL_BLUE : state === "hover" ? HOVER_BLUE : 0x000000);
    mat.emissiveIntensity = state === "sel" ? 0.35 : state === "hover" ? 0.2 : 0;
    const tr = state === "preview";
    if (mat.transparent !== tr) { mat.transparent = tr; mat.opacity = tr ? 0.85 : 1; mat.needsUpdate = true; }
  }
  function buildMesh(m) {
    const e = meshGeometry(m);
    const mesh = new THREE.Mesh(e.geo, meshMaterial());
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(meshMatrix(m));
    mesh.matrixWorldNeedsUpdate = true;
    mesh.userData = { noPick: true, meshBody: m.id || null, sharedGeo: true };
    return { mesh };
  }

  // ---------------------------------------------------------------- sync
  function selState(kind, id) {
    const ks = kind === "canvas" ? "canvas" : "meshBody";
    if (app.selection.items.some((r) => r.kind === ks && r.id === id)) return "sel";
    const h = app.selection.hover;
    if (h && h.kind === ks && h.id === id) return "hover";
    return "";
  }
  function sync() {
    clearTimeout(syncTimer);
    syncTimer = null;
    install();
    for (const o of canvasObjs.values()) disposeObj(o);
    canvasObjs.clear();
    for (const o of meshObjs.values()) disposeObj(o);
    meshObjs.clear();
    const usedTex = new Set(), usedGeo = new Set();
    // canvases
    const cvs = store.canvases().filter((c) => c.visible !== false && c.id !== preview.canvasEdit);
    const all = preview.canvas ? [...cvs, { ...preview.canvas, id: preview.canvasEdit || "__preview" }] : cvs;
    for (const c of all) {
      if (!c.image) continue;
      const isPrev = preview.canvas && (c.id === "__preview" || c.id === preview.canvasEdit);
      const o = buildCanvas(c, isPrev);
      if (!o) continue;
      usedTex.add(c.image);
      o.preview = !!isPrev;
      canvasRoot.add(o.mesh, o.border);
      canvasObjs.set(c.id, o);
    }
    // mesh bodies
    const ms = store.meshes().filter((m) => m.visible !== false && m.id !== preview.meshEdit);
    const allM = preview.mesh ? [...ms, { ...preview.mesh, id: preview.meshEdit || "__preview" }] : ms;
    for (const m of allM) {
      if (!m.data) continue;
      const isPrev = preview.mesh && (m.id === "__preview" || m.id === preview.meshEdit);
      const o = buildMesh(m);
      o.preview = !!isPrev;
      usedGeo.add(m.data);
      meshRoot.add(o.mesh);
      meshObjs.set(m.id, o);
    }
    // drop textures / geometries nothing uses any more (keep the ones the open dialog holds)
    for (const [k, e] of texCache) if (!usedTex.has(k)) { try { e.tex && e.tex.dispose(); } catch { /* ignore */ } texCache.delete(k); }
    for (const [k, e] of geoCache) if (!usedGeo.has(k)) { try { e.geo.dispose(); } catch { /* ignore */ } geoCache.delete(k); }
    highlight();
    app.emit("insert", {});
  }
  /** Selection / hover look: blue outline on canvases, blue tint on mesh bodies. */
  function highlight() {
    for (const [id, o] of canvasObjs) {
      const st = o.preview ? "sel" : selState("canvas", id);
      o.border.visible = !!st;
      o.border.material.color.setHex(st === "hover" ? HOVER_BLUE : SEL_BLUE);
    }
    for (const [id, o] of meshObjs) styleMesh(o.mesh.material, o.preview ? "preview" : selState("mesh", id));
    const v = vp();
    if (v) v.requestRender();
  }
  function schedule() { if (!syncTimer) syncTimer = setTimeout(sync, 0); }

  // ---------------------------------------------------------------- picking
  function pickProvider(x, y, ray, opts = {}) {
    if (app.mode !== "model") return [];
    const kinds = opts.kinds ? new Set(opts.kinds) : null;
    const out = [];
    const o = ray.o, d = ray.d;
    if (!kinds || kinds.has("canvas")) {
      for (const c of store.canvases()) {
        if (c.visible === false || c.selectable === false || c.id === preview.canvasEdit) continue;
        const f = canvasFrame(app, c);
        if (!f) continue;
        const den = V.dot(d, f.n);
        if (Math.abs(den) < 1e-9) continue;
        const t = V.dot(V.sub(f.center, o), f.n) / den;
        if (!(t > 0)) continue;
        const P = V.add(o, V.mul(d, t));
        const q = V.sub(P, f.center);
        if (Math.abs(V.dot(q, f.X)) > f.w / 2 || Math.abs(V.dot(q, f.Y)) > f.h / 2) continue;
        // a face on the same plane wins: the canvas counts as lying just behind it
        let tol = 0.01;
        try { tol = Math.max(tol, 3 * (vp().pixelSize(P) || 0)); } catch { /* keep */ }
        out.push({ ref: { kind: "canvas", id: c.id }, point: P, depth: t + tol, screenDist: 0, type: "area" });
      }
    }
    if ((!kinds || kinds.has("meshBody")) && meshObjs.size) {
      const rc = new THREE.Raycaster(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize());
      for (const [id, ob] of meshObjs) {
        if (id === "__preview" || id === preview.meshEdit) continue;
        ob.mesh.updateMatrixWorld(true);
        const h = rc.intersectObject(ob.mesh, false)[0];
        if (h) out.push({ ref: { kind: "meshBody", id }, point: h.point.toArray(), depth: h.distance, screenDist: 0, type: "area" });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- preview (dialogs)
  const api = {
    sync,
    schedule,
    setPreviewCanvas(def, editId = null) { preview.canvas = def; preview.canvasEdit = def ? editId : null; sync(); },
    setPreviewMesh(def, editId = null) { preview.mesh = def; preview.meshEdit = def ? editId : null; sync(); },
    /** Canvas/mesh scene objects (tests / debugging). */
    objects: () => ({ canvases: [...canvasObjs.keys()], meshes: [...meshObjs.keys()] }),
    canvasObject: (id) => canvasObjs.get(id) || null,
    meshObject: (id) => meshObjs.get(id) || null,
    textureReady: (url) => !!(texCache.get(url) && texCache.get(url).ok),
    groups: { canvases: canvasRoot, meshes: meshRoot },
  };

  app.on("doc", schedule);
  // canvases on construction planes move with the model
  app.on("model", () => { if (store.canvases().some((c) => c.planeRef && c.planeRef.kind === "cplane")) schedule(); });
  app.on("selection", highlight);
  app.on("hover", highlight);
  app.on("ready", () => { install(); sync(); });
  return api;
}

// ------------------------------------------------------------------ Delete key
/** Delete / Backspace removes selected canvases and mesh bodies (other items keep their own route). */
export function installDeleteKey(app, store) {
  window.addEventListener("keydown", (ev) => {
    if (ev.key !== "Delete" && ev.key !== "Backspace") return;
    const t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (app.mode !== "model" || app.activeCommand) return;
    if (app.input && app.input.top && app.input.top() && app.input.top().modal) return;
    const items = app.selection.items;
    const cv = items.filter((r) => r.kind === "canvas").map((r) => r.id);
    const mb = items.filter((r) => r.kind === "meshBody").map((r) => r.id);
    if (!cv.length && !mb.length) return;
    const rest = items.filter((r) => r.kind !== "canvas" && r.kind !== "meshBody");
    if (cv.length) store.remove("canvas", cv);
    if (mb.length) store.remove("mesh", mb);
    if (!rest.length) { ev.preventDefault(); ev.stopImmediatePropagation(); }
    else app.selection.set(rest);
  }, true);
}
