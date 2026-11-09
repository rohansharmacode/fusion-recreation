// Hover (pre-selection, light blue) and selection (Fusion blue) highlighting for body faces,
// edges, vertices and whole bodies. Origin items and construction planes highlight themselves
// (see origin.js) through the same refs.
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

// Selection: faces painted an almost opaque, lit navy blue with light-blue edges (reference capture
// of a selected body/feature: faces ~rgb(12,46,143), edges ~rgb(100,140,228)); pre-selection: a
// light blue tint (adorner highlight colour 0.3,0.5,1).
export const HL = {
  selFace: 0x1446c8, selFaceOpacity: 1,
  selLine: 0x3a84f2,
  selBodyLine: 0x6c9bef,
  hovFace: 0x4d8cff, hovFaceOpacity: 0.24,
  hovLine: 0x5aa2ff,
};

let dotTex = null;
function dotTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2);
  g.fillStyle = "#fff"; g.fill();
  g.lineWidth = 10; g.strokeStyle = "#fff"; g.stroke();
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

export class Highlighter {
  constructor(vp) {
    this.vp = vp; // {app, groups, bodies (BodyLayer), cache, requestRender, size()}
    this.root = new THREE.Group();
    this.root.name = "highlight";
    this.root.userData.noPick = true;
    vp.scene.add(this.root);
    this.lineMats = [];
  }

  _lineMat(color, width) {
    const m = new LineMaterial({ color, linewidth: width, worldUnits: false, transparent: true, depthTest: true });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    const s = this.vp.size();
    m.resolution.set(s.w, s.h);
    this.lineMats.push(m);
    return m;
  }

  clear() {
    for (const c of [...this.root.children]) {
      this.root.remove(c);
      c.traverse((o) => {
        if (o.geometry && o.userData.sharedPos) { o.geometry.deleteAttribute("position"); o.geometry.deleteAttribute("normal"); }
        if (o.geometry && o.userData.ownGeo) o.geometry.dispose();
        if (o.material && o.material.dispose) o.material.dispose();
      });
    }
    this.lineMats = [];
  }

  /** Rebuild all highlight objects from the current hover + selection. */
  update() {
    this.clear();
    const app = this.vp.app;
    const sel = app.selection.items || [];
    const hov = app.selection.hover;
    const selKeys = new Set(sel.map((r) => this.vp.refKey(r)));
    for (const r of sel) this._add(r, true);
    if (hov && !selKeys.has(this.vp.refKey(hov))) this._add(hov, false);
    for (const r of this.previewRefs || []) if (!selKeys.has(this.vp.refKey(r))) this._add(r, false);
    this.vp.requestRender();
  }

  /** Pre-highlight a set of refs (live window-selection feedback). */
  setPreview(refs) {
    const a = (refs || []).map((r) => this.vp.refKey(r)).join("|");
    const b = (this.previewRefs || []).map((r) => this.vp.refKey(r)).join("|");
    if (a === b) return;
    this.previewRefs = refs || [];
    this.update();
  }

  _bodyObj(id) {
    return this.vp.bodies.objects.get(id) || null;
  }

  _add(ref, selected) {
    if (!ref) return;
    switch (ref.kind) {
      case "face": return this._face(ref, selected);
      case "edge": return this._edge(ref, selected);
      case "vertex": return this._vertex(ref.p, selected);
      case "body": return this._body(ref.body, selected);
      case "meshFace": return this._meshFace(ref, selected);
      case "feature": for (const b of this._featureBodies(ref.id)) this._body(b, selected); return;
      case "occurrence": { const c = this.vp.app.components; if (c) for (const b of c.bodiesOf(ref.occ)) if (this._bodyObj(b)) this._body(b, selected); return; }
      default: return;
    }
  }

  _faceMesh(o, g, selected) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", o.entry.geo.getAttribute("position"));
    if (o.entry.geo.getAttribute("normal")) geo.setAttribute("normal", o.entry.geo.getAttribute("normal"));
    geo.setIndex(new THREE.BufferAttribute(o.entry.md.triangles.subarray(g.start, g.start + g.count), 1));
    const common = { depthWrite: false, depthFunc: THREE.LessEqualDepth, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -1 };
    const mat = selected
      ? new THREE.MeshStandardMaterial({ ...common, color: HL.selFace, roughness: 0.7, metalness: 0, envMap: this.vp.envMap || null, envMapIntensity: 0.06, transparent: HL.selFaceOpacity < 1, opacity: HL.selFaceOpacity })
      : new THREE.MeshBasicMaterial({ ...common, color: HL.hovFace, transparent: true, opacity: HL.hovFaceOpacity });
    const m = new THREE.Mesh(geo, mat);
    m.userData.ownGeo = true;
    m.userData.sharedPos = true;
    m.renderOrder = 3;
    return m;
  }

  /** A mesh triangle, or its whole face group when the mesh has groups (Fusion selects face groups). */
  _meshFace(ref, selected) {
    const o = this._bodyObj(ref.body);
    if (!o || !o.entry.isMesh) return;
    const T = o.entry.md.triangles;
    let idx;
    const groups = o.entry.groups;
    if (!groups && ref.group === 0 && !ref.triOnly) {
      idx = T; // the whole mesh is its only face group
    } else if (groups && ref.group != null && ref.group >= 0 && !ref.triOnly) {
      const list = [];
      for (let t = 0; t < o.entry.triCount; t++) if (groups[t] === ref.group) list.push(T[3 * t], T[3 * t + 1], T[3 * t + 2]);
      idx = Uint32Array.from(list);
    } else {
      const t = ref.tri | 0;
      if (t < 0 || 3 * t + 2 >= T.length) return;
      idx = Uint32Array.from([T[3 * t], T[3 * t + 1], T[3 * t + 2]]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", o.entry.geo.getAttribute("position"));
    if (o.entry.geo.getAttribute("normal")) geo.setAttribute("normal", o.entry.geo.getAttribute("normal"));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const common = { depthWrite: false, depthFunc: THREE.LessEqualDepth, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -1 };
    const mat = selected
      ? new THREE.MeshStandardMaterial({ ...common, color: HL.selFace, roughness: 0.7, metalness: 0, flatShading: true, envMap: this.vp.envMap || null, envMapIntensity: 0.06 })
      : new THREE.MeshBasicMaterial({ ...common, color: HL.hovFace, transparent: true, opacity: HL.hovFaceOpacity });
    const m = new THREE.Mesh(geo, mat);
    m.userData.ownGeo = true;
    m.userData.sharedPos = true;
    m.renderOrder = 3;
    this.root.add(m);
  }

  _face(ref, selected) {
    const o = this._bodyObj(ref.body);
    if (!o) return;
    const g = o.entry.md.faceGroups.find((x) => x.face === ref.index);
    if (!g) return;
    this.root.add(this._faceMesh(o, g, selected));
    // outline the face boundary edges? Fusion tints only; keep edges as drawn.
  }

  /** Polylines of an edge plus the edges it joins smoothly (displayed as one edge). */
  _edgeSegments(o, index) {
    const e0 = o.entry.edges.find((e) => e.index === index);
    if (!e0) return [];
    return o.entry.edges.filter((e) => e.group === e0.group && !e.seam).map((e) => e.seg);
  }

  _fatLines(segs, color, width) {
    let n = 0;
    for (const s of segs) n += s.length;
    if (!n) return null;
    const arr = new Float32Array(n);
    let k = 0;
    for (const s of segs) { arr.set(s, k); k += s.length; }
    const g = new LineSegmentsGeometry();
    g.setPositions(arr);
    const l = new LineSegments2(g, this._lineMat(color, width));
    l.userData.ownGeo = true;
    l.renderOrder = 4;
    return l;
  }

  _edge(ref, selected) {
    const o = this._bodyObj(ref.body);
    if (!o) return;
    const l = this._fatLines(this._edgeSegments(o, ref.index), selected ? HL.selLine : HL.hovLine, selected ? 3 : 3);
    if (l) this.root.add(l);
  }

  _vertex(p, selected) {
    if (!p) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color: selected ? HL.selLine : HL.hovLine, size: 10, sizeAttenuation: false, map: dotTexture(), alphaTest: 0.5, depthTest: false, transparent: true });
    const pts = new THREE.Points(g, m);
    pts.userData.ownGeo = true;
    pts.renderOrder = 6;
    this.root.add(pts);
  }

  _body(id, selected) {
    const o = this._bodyObj(id);
    if (!o) return;
    const all = { start: 0, count: o.entry.md.triangles.length };
    this.root.add(this._faceMesh(o, all, selected));
    const segs = o.entry.edges.filter((e) => !e.seam).map((e) => e.seg);
    const l = this._fatLines(segs, selected ? HL.selBodyLine : HL.hovLine, selected ? 1.6 : 2);
    if (l) this.root.add(l);
  }

  /** Bodies created/modified by a timeline feature (selecting it in the timeline/browser highlights them). */
  _featureBodies(id) {
    const app = this.vp.app;
    const f = app.feature(id);
    if (!f || f.type === "sketch" || f.type === "cplane") return [];
    const r = (app.result && app.result.results && app.result.results[id]) || {};
    if (r.rolled || r.suppressed || f.suppressed) return [];
    const st = app.result && app.result.state;
    const alive = { has: (b) => !!st && ((st.bodies && st.bodies.has(b)) || (st.meshBodies && st.meshBodies.has(b))) };
    const cands = [...(r.affected || []), f.newBody, ...(f.newBodies || []), ...(f.edges || []).map((e) => e && e.body), ...(f.faces || []).map((x) => x && x.body), ...(f.bodies || []), f.target];
    const out = [];
    for (const b of cands) if (b && typeof b === "string" && alive.has(b) && !out.includes(b)) out.push(b);
    return out;
  }

  setResolution(w, h) {
    for (const m of this.lineMats) m.resolution.set(w, h);
  }
}
