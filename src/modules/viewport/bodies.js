// Body display: per-shape mesh cache (K.meshBody + derived edge polylines / vertices / face
// types), THREE objects per body, visual styles, and preview shapes.
import * as THREE from "three";
import * as MDX from "../../meshdata.js";

export const VISUAL_STYLES = {
  ViewShadedCommand: { label: "Shaded", faces: true, edges: false, hidden: false, depthOnly: false },
  ViewShadedHLCommand: { label: "Shaded with Hidden Edges", faces: true, edges: true, hidden: true, depthOnly: false },
  ViewShadedWithEdgesHLRCommand: { label: "Shaded with Visible Edges Only", faces: true, edges: true, hidden: false, depthOnly: false },
  ViewWireframeCommand: { label: "Wireframe", faces: false, edges: true, hidden: false, depthOnly: false, xray: true },
  ViewWireframeHLCommand: { label: "Wireframe with Hidden Edges", faces: false, edges: true, hidden: true, depthOnly: true },
  ViewWireframeHLRCommand: { label: "Wireframe with Visible Edges Only", faces: false, edges: true, hidden: false, depthOnly: true },
};
export const DEFAULT_STYLE = "ViewShadedCommand"; // Fusion default (reference capture: Shaded ●)

const EDGE_COLOR = 0x111111;
// one shared empty display entry for render-only bodies (a new one per rebuild would never be freed)
const EMPTY_MESH = { positions: new Float32Array(0), indices: new Uint32Array(0) };
/** Free the GPU objects of a body's render-hook extra (made fresh by the hook on every rebuild). */
function disposeExtra(o) {
  if (!o || !o.extra) return;
  o.extra.traverse((x) => {
    try {
      if (x.geometry) x.geometry.dispose();
      const m = x.material;
      if (Array.isArray(m)) m.forEach((y) => y && y.dispose()); else if (m) m.dispose();
    } catch { /* ignore */ }
  });
  o.extra = null;
}

/** Per-shape display data, cached in a WeakMap keyed by the replicad shape object. */
export class MeshCache {
  constructor(K) {
    this.K = K;
    this.map = new WeakMap();
  }

  meshFor(shape) {
    return this.entry(shape).md;
  }

  entry(shape) {
    let e = this.map.get(shape);
    if (e) return e;
    e = this._build(shape);
    this.map.set(shape, e);
    return e;
  }

  _build(shape) {
    const K = this.K;
    let size = 100;
    try {
      const bb = K.bboxOf(shape);
      if (bb) size = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
    } catch { /* keep default */ }
    size = Math.max(1, Math.min(size * 0.5, 5000));
    const md = K.meshBody(shape, size);
    // Topology analysis, once per shape (shape.faces/edges allocate wrappers):
    //  - face types (planar?)
    //  - hidden edges: seams of periodic faces (used by one face only in a closed solid) and
    //    "smooth splits" of one surface (e.g. a cylinder made of two half faces): Fusion's
    //    kernel has neither, so they are not drawn or picked
    //  - real vertices (not smooth junctions of two tangent edges) and edge display groups
    //    (edges joined through smooth junctions highlight together, like one Fusion edge)
    let faceTypes = [];
    const hidden = new Set();
    try {
      const faces = shape.faces;
      faceTypes = faces.map((f) => { try { return f.geomType; } catch { return "?"; } });
      const edgeFaces = new Map(); // edge hash -> [face index]
      faces.forEach((f, fi) => {
        for (const ed of f.edges) {
          const h = ed.hashCode;
          const a = edgeFaces.get(h);
          if (!a) edgeFaces.set(h, [fi]);
          else if (!a.includes(fi)) a.push(fi);
        }
      });
      const closedCurved = faces.length === 1 && faceTypes[0] !== "PLANE";
      shape.edges.forEach((ed, i) => {
        const fl = edgeFaces.get(ed.hashCode) || [];
        if (fl.length === 1 && (faces.length > 1 || closedCurved)) { hidden.add(i); return; }
        if (fl.length === 2) {
          const [a, b] = fl;
          if (faceTypes[a] !== "PLANE" && faceTypes[a] === faceTypes[b]) {
            try {
              const p = ed.pointAt(0.5);
              const n1 = faces[a].normalAt(p).normalized(), n2 = faces[b].normalAt(p).normalized();
              const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
              if (Math.abs(dot) > 0.9995) hidden.add(i);
            } catch { /* keep the edge */ }
          }
        }
      });
    } catch { /* ignore */ }

    // edge polylines (segment pairs) per edge
    const L = md.lines;
    const edges = [];
    for (const g of md.edgeGroups) {
      const seg = L.subarray(g.start * 3, (g.start + g.count) * 3);
      edges.push({ index: g.edge, start: g.start, count: g.count, seg, seam: hidden.has(g.edge), group: g.edge });
    }
    // vertices: endpoints of visible edges; two tangent edges meeting = smooth junction (no vertex)
    const ends = new Map(); // key -> {p, list:[{e, t}]}
    const keyOf = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    const dirAt = (seg, atStart) => {
      const n = seg.length;
      const [ax, ay, az, bx, by, bz] = atStart ? [seg[0], seg[1], seg[2], seg[3], seg[4], seg[5]] : [seg[n - 3], seg[n - 2], seg[n - 1], seg[n - 6], seg[n - 5], seg[n - 4]];
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const l = Math.hypot(dx, dy, dz) || 1;
      return [dx / l, dy / l, dz / l];
    };
    for (const e of edges) {
      if (e.seam || e.seg.length < 6) continue;
      const s = e.seg, n = s.length;
      const a = [s[0], s[1], s[2]], b = [s[n - 3], s[n - 2], s[n - 1]];
      if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6) continue; // closed edge (full circle)
      for (const [p, atStart] of [[a, true], [b, false]]) {
        const k = keyOf(...p);
        let v = ends.get(k);
        if (!v) { v = { p, list: [] }; ends.set(k, v); }
        v.list.push({ e, t: dirAt(s, atStart) });
      }
    }
    const parent = new Map();
    const find = (x) => { while (parent.has(x) && parent.get(x) !== x) x = parent.get(x); return x; };
    const unite = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    const vertices = [];
    for (const v of ends.values()) {
      if (v.list.length === 2) {
        const [u, w] = v.list;
        const dot = u.t[0] * w.t[0] + u.t[1] * w.t[1] + u.t[2] * w.t[2];
        if (dot < -0.97) { unite(u.e.index, w.e.index); continue; } // smooth continuation
      }
      vertices.push(v.p);
    }
    for (const e of edges) e.group = find(e.index);
    // visible-edge line buffer (hidden edges removed)
    let n = 0;
    for (const e of edges) if (!e.seam) n += e.seg.length;
    const visLines = new Float32Array(n);
    let o = 0;
    for (const e of edges) if (!e.seam) { visLines.set(e.seg, o); o += e.seg.length; }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(md.vertices, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(md.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(md.triangles, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(visLines, 3));
    const faceStarts = md.faceGroups.map((g) => g.start);
    return { md, geo, edgeGeo, edges, vertices, faceTypes, faceStarts, size, proj: null, projVersion: -1 };
  }

  /**
   * Display data of a triangle-mesh body (mesh / T-spline kinds), cached per mesh object. Same shape as a
   * B-rep entry (md.vertices / triangles / lines, edges, geo, edgeGeo) plus isMesh, so window selection,
   * bounds and hidden-line styles work unchanged; picking and highlighting branch on isMesh.
   * edgesMode: 'groups' (open boundary + face-group borders, default) | 'sharp' (also creases > 30 deg) | 'none' | 'all'.
   */
  meshEntry(mesh, edgesMode = "groups") {
    let byMode = this.map.get(mesh);
    if (!byMode || !byMode.meshModes) { byMode = { meshModes: true }; this.map.set(mesh, byMode); }
    if (byMode[edgesMode]) return byMode[edgesMode];
    const MD = MDX;
    const pos = mesh.positions instanceof Float32Array ? mesh.positions : Float32Array.from(mesh.positions || []);
    const nTri = mesh.indices ? mesh.indices.length / 3 : pos.length / 9;
    const tris = mesh.indices ? (mesh.indices instanceof Uint32Array ? mesh.indices : Uint32Array.from(mesh.indices)) : Uint32Array.from({ length: nTri * 3 }, (_, i) => i);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    if (mesh.normals && mesh.normals.length === pos.length) geo.setAttribute("normal", new THREE.BufferAttribute(mesh.normals instanceof Float32Array ? mesh.normals : Float32Array.from(mesh.normals), 3));
    geo.setIndex(new THREE.BufferAttribute(tris, 1));
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    // display edges
    let pairs = [];
    const idxMesh = { positions: pos, indices: tris, groups: mesh.groups };
    if (edgesMode === "all") { for (let t = 0; t < nTri; t++) { const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2]; pairs.push(a, b, b, c, c, a); } }
    else if (edgesMode !== "none" && MD) { try { pairs = MD.featureEdges(idxMesh, edgesMode === "sharp" || !mesh.groups ? 30 : 0); } catch { pairs = []; } }
    const lines = new Float32Array(pairs.length * 3);
    for (let i = 0; i < pairs.length; i++) { const v = pairs[i]; lines[3 * i] = pos[3 * v]; lines[3 * i + 1] = pos[3 * v + 1]; lines[3 * i + 2] = pos[3 * v + 2]; }
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(lines, 3));
    const nSeg = pairs.length;
    const md = { vertices: pos, normals: geo.getAttribute("normal").array, triangles: tris, faceGroups: [{ start: 0, count: tris.length, face: -1 }], lines, edgeGroups: nSeg ? [{ start: 0, count: nSeg, edge: 0 }] : [] };
    const edges = nSeg ? [{ index: 0, start: 0, count: nSeg, seg: lines, seam: false, group: 0 }] : [];
    let size = 100;
    const bb = geo.boundingBox;
    if (bb && !bb.isEmpty()) size = Math.max(1, Math.min(bb.min.distanceTo(bb.max) * 0.5, 5000));
    const e = { md, geo, edgeGeo, edges, vertices: [], faceTypes: [], faceStarts: [0], size, proj: null, projVersion: -1, isMesh: true, mesh, groups: mesh.groups || null, triCount: nTri };
    byMode[edgesMode] = e;
    return e;
  }

  /** face group index for a triangle index (binary search on start) */
  faceOfTriangle(entry, tri) {
    const k = tri * 3;
    const fs = entry.md.faceGroups;
    let lo = 0, hi = fs.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (fs[mid].start <= k) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (ans < 0) return null;
    const g = fs[ans];
    if (k >= g.start + g.count) return null;
    return g;
  }
}

/** Builds and maintains the THREE objects for all visible bodies. */
export class BodyLayer {
  constructor(vp) {
    this.vp = vp; // {app, groups, cache, envMap, requestRender}
    this.style = DEFAULT_STYLE;
    this.objects = new Map(); // body id -> {id, shape, entry, group, mesh, edges, hidden, depth}
    this.materials = new Map();
    this.edgeMat = new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.92 });
    this.hiddenMat = new THREE.LineDashedMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.45, dashSize: 1, gapSize: 1, depthFunc: THREE.GreaterDepth, depthWrite: false });
    this.xrayEdgeMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a, depthTest: false, transparent: true, opacity: 0.9 });
    this.depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    // back side of surface bodies (Fusion shows the side away from the surface normal in gold)
    this.surfaceBackMat = new THREE.MeshStandardMaterial({ color: 0xd9a531, metalness: 0.1, roughness: 0.55, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.bounds = { center: new THREE.Vector3(), radius: 0, box: new THREE.Box3() };
    this.visibleOverride = true; // Object Visibility > Bodies
  }

  /**
   * Body material for an appearance. variant: '' (solid, double-sided), 'front' (surface bodies: the front side,
   * their back side is drawn gold like Fusion), 'facets' (mesh bodies: flat-shaded triangles).
   */
  material(meta, colorOverride, variant = "") {
    const app = this.vp.app;
    let ap = (app.appearances && app.appearances[meta.appearance]) || { color: "#b9bdc2", metalness: 0.35, roughness: 0.45 };
    if (colorOverride) ap = { color: colorOverride, metalness: 0, roughness: 0.6 };
    const key = `${ap.color}|${ap.metalness}|${ap.roughness}|${ap.opacity ?? 1}|${variant}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: ap.color || "#b9bdc2",
        // "Steel - Satin" under Match Theme: light steel grey, soft environment reflections
        metalness: Math.min(0.6, ap.metalness ?? 0.2) * 0.86,
        roughness: Math.max(0.25, (ap.roughness ?? 0.5) * 0.78),
        envMap: this.vp.envMap || null,
        envMapIntensity: 0.8,
        side: variant === "front" ? THREE.FrontSide : THREE.DoubleSide,
        flatShading: variant === "facets",
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      if (ap.opacity != null && ap.opacity < 1) {
        m.transparent = true;
        m.opacity = ap.opacity;
        m.depthWrite = false;
      }
      this.materials.set(key, m);
    }
    return m;
  }

  /** Translucent copy of a body material for bodies of inactive components. */
  _fadedMat(m) {
    this._faded = this._faded || new Map();
    let f = this._faded.get(m);
    if (!f) {
      f = m.clone();
      f.transparent = true;
      f.opacity = Math.min(m.opacity ?? 1, 0.28);
      f.depthWrite = false;
      this._faded.set(m, f);
    }
    return f;
  }

  /** Display-only occurrence transforms (app.components.setDisplayTransform): body group matrices, no re-evaluation. */
  applyDisplay() {
    const comps = this.vp.app.components;
    for (const o of this.objects.values()) {
      const D = comps && comps.displayOverrides ? comps.bodyDisplayMatrix(o.id) : null;
      if (!D && !o.displayed) continue;
      o.group.matrixAutoUpdate = false;
      if (D) o.group.matrix.set(D[0], D[1], D[2], D[3], D[4], D[5], D[6], D[7], D[8], D[9], D[10], D[11], 0, 0, 0, 1);
      else o.group.matrix.identity();
      o.group.matrixWorldNeedsUpdate = true;
      o.displayed = !!D;
    }
    this.vp.requestRender();
  }

  setEnvMap(env) {
    this.vp.envMap = env;
    for (const m of this.materials.values()) { m.envMap = env; m.needsUpdate = true; }
  }

  setStyle(id) {
    if (!VISUAL_STYLES[id]) return;
    this.style = id;
    for (const o of this.objects.values()) this._applyStyle(o);
    this.vp.requestRender();
  }

  _applyStyle(o) {
    const st = VISUAL_STYLES[this.style];
    const meta = this.vp.app.bodyMeta(o.id);
    let cc = null;
    if (this.colorCycle) {
      const ids = [...this.objects.keys()];
      cc = this.colorCycle[Math.max(0, ids.indexOf(o.id)) % this.colorCycle.length];
    }
    // mesh-like kinds are flat-shaded facets unless the kind asks for smooth shading (T-spline limit surface)
    const smoothKind = ((this.vp.app.bodyKinds || {})[o.kind] || {}).shading === "smooth";
    const variant = o.kind === "surface" ? "front" : o.entry.isMesh && !smoothKind ? "facets" : "";
    // bodies outside the active component are drawn faded (Fusion's inactive components)
    const comps = this.vp.app.components;
    const fade = !!(comps && comps.faded(o.id));
    o.faded = fade;
    o.mesh.material = st.faces ? (fade ? this._fadedMat(this.material(meta, cc, variant)) : this.material(meta, cc, variant)) : this.depthMat;
    o.mesh.visible = st.faces || st.depthOnly;
    // surface bodies: the back side (away from the normal) is gold, like Fusion
    if (o.kind === "surface") {
      if (!o.back) {
        o.back = new THREE.Mesh(o.entry.geo, this.surfaceBackMat);
        o.back.userData = { body: o.id, entry: o.entry, noPick: true };
        o.back.renderOrder = 0;
        o.group.add(o.back);
      }
      o.back.visible = !!st.faces;
    } else if (o.back) { o.group.remove(o.back); o.back = null; }
    // mesh bodies show their facets in every style (Fusion draws the triangle shading flat); their edges
    // are the open boundary / face-group borders and follow the visual style like B-rep edges
    o.edges.visible = st.edges || (o.entry.isMesh && !st.faces);
    o.edges.material = st.xray ? this.xrayEdgeMat : this.edgeMat;
    if (st.hidden && !o.hidden) {
      o.hidden = new THREE.LineSegments(o.entry.edgeGeo, this.hiddenMat);
      o.hidden.renderOrder = 2;
      o.hidden.userData.noPick = true;
      if (!o.entry.dashed) { o.hidden.computeLineDistances(); o.entry.dashed = true; }
      o.group.add(o.hidden);
    }
    if (o.hidden) o.hidden.visible = st.hidden;
  }

  /**
   * Rebuild the body group from app.allBodies() reusing cached geometry: B-rep bodies (solid / surface) through
   * the shape cache, mesh-like bodies (mesh / tspline / registered kinds) through meshEntry(); a kind's
   * render(body, app) hook adds its own objects (T-spline cage ...) to the body group.
   */
  rebuild() {
    const app = this.vp.app;
    const group = this.vp.groups.bodies;
    const keep = new Set();
    const box = new THREE.Box3();
    const list = typeof app.allBodies === "function" ? app.allBodies() : app.bodies();
    const comps = app.components;
    for (const b of list) {
      if (!b.meta || b.meta.visible === false) continue;
      if (comps && !comps.bodyShown(b.id)) continue; // hidden component (or a parent of it)
      const kind = b.kind || "solid";
      const hooks = (app.bodyKinds && app.bodyKinds[kind]) || {};
      const src = b.shape || b.mesh || null;
      let entry = null;
      try {
        if (b.shape) entry = this.vp.cache.entry(b.shape);
        else if (b.mesh) entry = this.vp.cache.meshEntry(b.mesh, hooks.edges || "groups");
      } catch (e) { console.warn("mesh failed", e); continue; }
      if (!entry && typeof hooks.render !== "function") continue;
      keep.add(b.id);
      let o = this.objects.get(b.id);
      if (!o || o.src !== src || o.srcEntry !== (b.entry || null) || o.kind !== kind) {
        if (o) { group.remove(o.group); disposeExtra(o); }
        const g = new THREE.Group();
        g.name = `body:${b.id}`;
        g.userData = { body: b.id, kind };
        const ent = entry || this.vp.cache.meshEntry(EMPTY_MESH, "none");
        const mesh = new THREE.Mesh(ent.geo, this.material(b.meta));
        mesh.userData = { body: b.id, entry: ent, kind };
        mesh.renderOrder = 0;
        const edges = new THREE.LineSegments(ent.edgeGeo, this.edgeMat);
        edges.userData = { body: b.id, noPick: true };
        edges.renderOrder = 1;
        g.add(mesh, edges);
        o = { id: b.id, kind, shape: b.shape || null, src, srcEntry: b.entry || null, entry: ent, group: g, mesh, edges, hidden: null, back: null };
        if (typeof hooks.render === "function") {
          try { const extra = hooks.render(b.entry || b, app); if (extra) { extra.userData = { ...(extra.userData || {}), body: b.id, noPick: true }; g.add(extra); o.extra = extra; } } catch (e) { console.error(`[viewport] ${kind} render hook failed`, e); }
        }
        this.objects.set(b.id, o);
        group.add(g);
      }
      this._applyStyle(o);
      if (o.entry.geo.boundingBox && !o.entry.geo.boundingBox.isEmpty()) box.union(o.entry.geo.boundingBox);
      if (o.extra) { try { const eb = new THREE.Box3().setFromObject(o.extra); if (!eb.isEmpty()) box.union(eb); } catch { /* ignore */ } }
    }
    for (const [id, o] of this.objects) {
      if (!keep.has(id)) { group.remove(o.group); disposeExtra(o); this.objects.delete(id); }
    }
    group.visible = this.visibleOverride;
    if (comps && (comps.displayOverrides || [...this.objects.values()].some((o) => o.displayed))) this.applyDisplay();
    this.bounds.box.copy(box);
    if (box.isEmpty()) { this.bounds.radius = 0; this.bounds.center.set(0, 0, 0); }
    else {
      const s = box.getBoundingSphere(new THREE.Sphere());
      this.bounds.center.copy(s.center);
      this.bounds.radius = s.radius;
    }
    this.vp.requestRender();
  }

  /** Visible bodies for picking: [{id, entry, mesh}] */
  visible() {
    if (!this.vp.groups.bodies.visible) return [];
    return [...this.objects.values()];
  }
}

/** Translucent tool bodies shown while a command previews (cut = red, new = blue). */
export class PreviewLayer {
  constructor(vp) {
    this.vp = vp;
  }
  set(items = []) {
    const g = this.vp.groups.preview;
    for (const c of [...g.children]) {
      g.remove(c);
      c.traverse((o) => { if (o.material && o.userData.ownMat) o.material.dispose(); });
    }
    for (const it of items || []) {
      if (!it || (!it.shape && !it.mesh)) continue;
      let entry;
      // {shape} (OCCT) or {mesh: {positions, indices?}} (mesh tools preview triangle data the same way)
      try { entry = it.shape ? this.vp.cache.entry(it.shape) : this.vp.cache.meshEntry(it.mesh, it.edges || "groups"); } catch (e) { console.warn("preview mesh failed", e); continue; }
      const color = it.color === "cut" ? "#ff2a1a" : it.color === "new" ? "#3d8bff" : it.color || "#3d8bff";
      const opacity = it.opacity ?? (it.color === "cut" ? 0.3 : 0.35);
      const m = new THREE.Mesh(entry.geo, new THREE.MeshStandardMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      m.userData = { ownMat: true, noPick: true };
      m.renderOrder = 5;
      const l = new THREE.LineSegments(entry.edgeGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: Math.min(1, opacity + 0.45) }));
      l.userData = { ownMat: true, noPick: true };
      l.renderOrder = 6;
      const grp = new THREE.Group();
      grp.add(m, l);
      g.add(grp);
    }
    this.vp.requestRender();
  }
}
