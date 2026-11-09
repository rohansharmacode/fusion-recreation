// Body display: per-shape mesh cache (K.meshBody + derived edge polylines / vertices / face
// types), THREE objects per body, visual styles, and preview shapes.
import * as THREE from "three";

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
    //    "smooth splits" of one surface (e.g. a cylinder made of two half faces) — Fusion's
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
    this.bounds = { center: new THREE.Vector3(), radius: 0, box: new THREE.Box3() };
    this.visibleOverride = true; // Object Visibility > Bodies
  }

  material(meta, colorOverride) {
    const app = this.vp.app;
    let ap = (app.appearances && app.appearances[meta.appearance]) || { color: "#b9bdc2", metalness: 0.35, roughness: 0.45 };
    if (colorOverride) ap = { color: colorOverride, metalness: 0, roughness: 0.6 };
    const key = `${ap.color}|${ap.metalness}|${ap.roughness}|${ap.opacity ?? 1}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: ap.color || "#b9bdc2",
        // "Steel - Satin" under Match Theme: light steel grey, soft environment reflections
        metalness: Math.min(0.6, ap.metalness ?? 0.2) * 0.86,
        roughness: Math.max(0.25, (ap.roughness ?? 0.5) * 0.78),
        envMap: this.vp.envMap || null,
        envMapIntensity: 0.8,
        side: THREE.DoubleSide,
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
    o.mesh.material = st.faces ? this.material(meta, cc) : this.depthMat;
    o.mesh.visible = st.faces || st.depthOnly;
    o.edges.visible = st.edges;
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

  /** Rebuild the body group from app.bodies() reusing cached geometry. */
  rebuild() {
    const app = this.vp.app;
    const group = this.vp.groups.bodies;
    const keep = new Set();
    const box = new THREE.Box3();
    for (const b of app.bodies()) {
      if (!b.shape || b.meta.visible === false) continue;
      let entry;
      try { entry = this.vp.cache.entry(b.shape); } catch (e) { console.warn("mesh failed", e); continue; }
      keep.add(b.id);
      let o = this.objects.get(b.id);
      if (!o || o.shape !== b.shape) {
        if (o) { group.remove(o.group); }
        const g = new THREE.Group();
        g.name = `body:${b.id}`;
        g.userData = { body: b.id };
        const mesh = new THREE.Mesh(entry.geo, this.material(b.meta));
        mesh.userData = { body: b.id, entry };
        mesh.renderOrder = 0;
        const edges = new THREE.LineSegments(entry.edgeGeo, this.edgeMat);
        edges.userData = { body: b.id, noPick: true };
        edges.renderOrder = 1;
        g.add(mesh, edges);
        o = { id: b.id, shape: b.shape, entry, group: g, mesh, edges, hidden: null };
        this.objects.set(b.id, o);
        group.add(g);
      }
      this._applyStyle(o);
      if (entry.geo.boundingBox) box.union(entry.geo.boundingBox);
    }
    for (const [id, o] of this.objects) {
      if (!keep.has(id)) { group.remove(o.group); this.objects.delete(id); }
    }
    group.visible = this.visibleOverride;
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
      if (!it || !it.shape) continue;
      let entry;
      try { entry = this.vp.cache.entry(it.shape); } catch (e) { console.warn("preview mesh failed", e); continue; }
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
