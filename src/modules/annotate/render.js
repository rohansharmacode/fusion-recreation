// Canvas rendering of the PMI: one THREE.Group per annotation in the viewport's overlay scene
// (drawn on top of the model, like Fusion's annotations): thin leader / dimension lines, filled
// terminators and text quads (canvas textures painted white and tinted: black, orange when the
// annotation lost its geometry, blue when hovered / selected). General notes are screen-fixed HTML
// in the canvas label layer. Also the pick provider (text boxes win over model edges).
import * as THREE from "three";
import { renderBlock } from "./text.js";
import { flipKey, textCorners } from "./layout.js";

export const COLORS = { normal: 0x161616, hover: 0x3f9ff2, selected: 0x0b6fd6, orphan: 0xe8862e, preview: 0x161616 };
const TEX_S = 44; // texture px per text height
const PLANE = new THREE.PlaneGeometry(1, 1);

export class PmiRenderer {
  constructor(app) {
    this.app = app;
    this.items = new Map(); // id -> {spec, prims, key, group, mats}
    this.preview = null;
    this.hiddenId = null;
    this.textures = new Map(); // blockKey -> {tex, pw, ph, S, used}
    this.group = new THREE.Group();
    this.group.name = "pmi";
    this.group.userData.noPick = true;
    this.gnHost = null;
    this._ensure();
  }
  _ensure() {
    const vp = this.app.viewport;
    if (!vp) return false;
    if (!this.group.parent && vp.groups && vp.groups.overlay) vp.groups.overlay.add(this.group);
    if (!this.gnHost && vp.labelLayer) {
      this.gnHost = document.createElement("div");
      this.gnHost.className = "pmi-gnotes";
      vp.labelLayer.appendChild(this.gnHost);
    }
    return true;
  }

  /** Camera frame for text readability: {f: forward, r: screen right, u: screen up}. */
  view() {
    const vp = this.app.viewport;
    const cam = vp && vp.camera;
    if (!cam) return { f: [0, 0, -1], r: [1, 0, 0], u: [0, 1, 0] };
    cam.updateMatrixWorld();
    const e = cam.matrixWorld.elements;
    return { f: [-e[8], -e[9], -e[10]], r: [e[0], e[1], e[2]], u: [e[4], e[5], e[6]] };
  }

  /** items: [{id, build(view) -> prims, orphan, general?}] (the committed annotations). */
  setItems(list) {
    this._ensure();
    const seen = new Set();
    for (const spec of list) {
      seen.add(spec.id);
      const old = this.items.get(spec.id);
      if (old) this._dispose(old);
      this.items.set(spec.id, this._make(spec));
    }
    for (const [id, it] of this.items) if (!seen.has(id)) { this._dispose(it); this.items.delete(id); }
    this._gcTextures();
    this._general();
    this.refreshColors();
  }
  /** Live preview of the annotation a dialog is building (null clears it). */
  setPreview(spec) {
    this._ensure();
    if (this.preview) { this._dispose(this.preview); this.preview = null; }
    if (spec) this.preview = this._make({ ...spec, id: "__preview__", isPreview: true });
    this._general();
    this.refreshColors();
  }
  setHidden(id) {
    if (this.hiddenId === id) return;
    this.hiddenId = id || null;
    for (const [iid, it] of this.items) it.group.visible = iid !== this.hiddenId;
    this._general();
    this._req();
  }
  _req() { try { this.app.viewport && this.app.viewport.requestRender(); } catch { /* ignore */ } }

  _make(spec) {
    const it = { spec, prims: null, key: "", group: new THREE.Group(), mats: [] };
    it.group.userData.noPick = true;
    it.group.visible = spec.id !== this.hiddenId;
    if (!spec.general) this._build(it);
    this.group.add(it.group);
    return it;
  }
  _build(it) {
    for (const c of [...it.group.children]) { it.group.remove(c); if (c.geometry && c.geometry !== PLANE) c.geometry.dispose(); }
    for (const m of it.mats) m.dispose();
    it.mats = [];
    const view = this.view();
    let P = null;
    try { P = it.spec.build(view); } catch (e) { console.warn("[annotate] layout failed", e); P = null; }
    it.prims = P;
    it.key = P ? flipKey(P.flips || [], view) : "";
    if (!P) return;
    const color = new THREE.Color(COLORS.normal);
    if (P.segs.length) {
      const pos = new Float32Array(P.segs.length * 6);
      P.segs.forEach(([a, b], i) => { pos.set(a, i * 6); pos.set(b, i * 6 + 3); });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const m = new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true });
      it.mats.push(m);
      const l = new THREE.LineSegments(g, m);
      l.renderOrder = 1000;
      l.userData.noPick = true;
      it.group.add(l);
    }
    if (P.tris.length) {
      const pos = new Float32Array(P.tris.length * 9);
      P.tris.forEach((t, i) => { pos.set(t[0], i * 9); pos.set(t[1], i * 9 + 3); pos.set(t[2], i * 9 + 6); });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const m = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide });
      it.mats.push(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 1001;
      mesh.userData.noPick = true;
      it.group.add(mesh);
    }
    for (const t of P.texts) {
      const tx = this._texture(t.block);
      if (!tx) continue;
      const H = t.H || 1;
      const wmm = (tx.pw / tx.S) * H, hmm = (tx.ph / tx.S) * H;
      const m = new THREE.MeshBasicMaterial({ map: tx.tex, color, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
      it.mats.push(m);
      const mesh = new THREE.Mesh(PLANE, m);
      mesh.matrixAutoUpdate = false;
      const X = new THREE.Vector3(...t.rx).multiplyScalar(wmm), Y = new THREE.Vector3(...t.ry).multiplyScalar(hmm), Z = new THREE.Vector3(...t.nf);
      mesh.matrix.makeBasis(X, Y, Z);
      mesh.matrix.setPosition(new THREE.Vector3(...t.c));
      mesh.renderOrder = 1002;
      mesh.userData.noPick = true;
      it.group.add(mesh);
    }
    this._req();
  }
  _texture(block) {
    const key = JSON.stringify(block);
    let e = this.textures.get(key);
    if (!e) {
      let r;
      try { r = renderBlock(block, TEX_S); } catch (err) { console.warn("[annotate] text", err); return null; }
      const tex = new THREE.CanvasTexture(r.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      e = { tex, pw: r.pw, ph: r.ph, S: r.S, used: 0 };
      this.textures.set(key, e);
    }
    e.used = performance.now();
    return e;
  }
  _gcTextures() {
    if (this.textures.size < 200) return;
    const live = new Set();
    for (const it of [...this.items.values(), this.preview].filter(Boolean)) for (const t of (it.prims && it.prims.texts) || []) live.add(JSON.stringify(t.block));
    for (const [k, e] of this.textures) if (!live.has(k)) { e.tex.dispose(); this.textures.delete(k); }
  }
  _dispose(it) {
    for (const c of [...it.group.children]) { if (c.geometry && c.geometry !== PLANE) c.geometry.dispose(); }
    for (const m of it.mats) m.dispose();
    if (it.group.parent) it.group.parent.remove(it.group);
  }

  /** Re-layout annotations whose text would read mirrored / upside down from the new view. */
  onCamera() {
    if (!this.items.size && !this.preview) return;
    const view = this.view();
    let any = false;
    for (const it of [...this.items.values(), this.preview].filter(Boolean)) {
      if (it.spec.general || it.spec.after || !it.prims) continue;
      if (flipKey(it.prims.flips || [], view) !== it.key) { this._build(it); this._colorOf(it); any = true; }
    }
    // frames hanging under another annotation follow its new layout
    if (any) for (const it of this.items.values()) if (it.spec.after) { this._build(it); this._colorOf(it); }
  }

  // ---------------------------------------------------------------- highlight
  stateOf(id) {
    const sel = this.app.selection;
    const isSel = sel.items.some((r) => r.kind === "feature" && r.id === id);
    const hov = sel.hover && sel.hover.kind === "feature" && sel.hover.id === id;
    return isSel ? "selected" : hov ? "hover" : "";
  }
  _colorOf(it) {
    const st = it.spec.isPreview ? "" : this.stateOf(it.spec.id);
    const c = st ? COLORS[st] : it.spec.orphan ? COLORS.orphan : COLORS.normal;
    for (const m of it.mats) m.color.setHex(c);
  }
  refreshColors() {
    for (const it of this.items.values()) this._colorOf(it);
    if (this.preview) this._colorOf(this.preview);
    if (this.gnHost) for (const el of this.gnHost.children) {
      const st = this.stateOf(el.dataset.pmi);
      el.classList.toggle("sel", st === "selected");
      el.classList.toggle("hov", st === "hover");
    }
    this._req();
  }

  // ---------------------------------------------------------------- general notes (screen space)
  _general() {
    if (!this.gnHost) return;
    this.gnHost.textContent = "";
    const all = [...this.items.values()].filter((it) => it.spec.general && it.spec.id !== this.hiddenId);
    if (this.preview && this.preview.spec.general) all.push(this.preview);
    const byQ = { ul: [], ur: [], ll: [], lr: [] };
    for (const it of all) (byQ[it.spec.general.quadrant] || byQ.ll).push(it);
    for (const [q, list] of Object.entries(byQ)) {
      if (!list.length) continue;
      const col = document.createElement("div");
      col.className = `pmi-gn-col pmi-gn-${q}`;
      for (const it of list) col.appendChild(this._gnEl(it));
      this.gnHost.appendChild(col);
    }
  }
  _gnEl(it) {
    const g = it.spec.general;
    const el = document.createElement("div");
    el.className = `pmi-gnote${it.spec.isPreview ? " preview" : ""}${it.spec.orphan ? " orphan" : ""}`;
    el.dataset.pmi = it.spec.id;
    el.style.fontSize = `${g.px || 15}px`;
    el.style.textAlign = g.align || "left";
    for (const line of String(g.text || "").split("\n")) {
      const d = document.createElement("div");
      d.textContent = line || " ";
      el.appendChild(d);
    }
    if (!it.spec.isPreview) {
      const app = this.app;
      const ref = { kind: "feature", id: it.spec.id };
      el.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        ev.stopPropagation();
        if (!app.selection.accepts(ref)) return;
        if (ev.ctrlKey || ev.shiftKey || ev.metaKey) app.selection.toggle(ref);
        else app.selection.set([ref]);
      });
      el.addEventListener("dblclick", (ev) => { ev.stopPropagation(); if (!app.activeCommand) app.editFeature(it.spec.id); });
      el.addEventListener("pointerenter", () => { if (app.selection.accepts(ref)) app.selection.setHover(ref); });
      el.addEventListener("pointerleave", () => { const h = app.selection.hover; if (h && h.kind === "feature" && h.id === it.spec.id) app.selection.setHover(null); });
    }
    return el;
  }

  // ---------------------------------------------------------------- picking
  /** Pick provider hits for annotations under canvas px (x, y). */
  pick(x, y) {
    const vp = this.app.viewport;
    if (!vp) return [];
    const hits = [];
    for (const [id, it] of this.items) {
      if (id === this.hiddenId || it.spec.general || !it.prims || !it.group.visible) continue;
      let best = null;
      for (const t of it.prims.texts) {
        const pad = 0.2 * (t.H || 1);
        const cs = textCorners(t, pad).map((p) => vp.toScreen(p));
        if (pointInPoly(x, y, cs)) { best = { type: "point", d: 0, p: t.c, depth: cs[0][2] }; break; }
      }
      if (!best) {
        for (const [a, b] of it.prims.segs) {
          const sa = vp.toScreen(a), sb = vp.toScreen(b);
          const r = segDist(x, y, sa, sb);
          if (r.d <= 5 && (!best || r.d < best.d)) best = { type: "curve", d: r.d, p: lerp(a, b, r.t), depth: sa[2] };
        }
        for (const t of it.prims.tris) {
          const s = t.map((p) => vp.toScreen(p));
          if (pointInPoly(x, y, s)) { best = { type: "curve", d: 0, p: t[0], depth: s[0][2] }; break; }
        }
      }
      if (best) hits.push({ ref: { kind: "feature", id }, point: best.p, depth: -1e6 + (best.depth || 0), screenDist: best.d, type: best.type });
    }
    return hits;
  }
  /** Screen rectangle-ish test for the preview text (dragging the note while a dialog is open). */
  previewTextAt(x, y) {
    const vp = this.app.viewport;
    if (!vp || !this.preview || !this.preview.prims) return false;
    for (const t of this.preview.prims.texts) {
      const cs = textCorners(t, 0.2 * (t.H || 1)).map((p) => vp.toScreen(p));
      if (pointInPoly(x, y, cs)) return true;
    }
    return false;
  }
  /** World corners of an item's main text (for attaching other annotations, tests). */
  mainOf(id) { const it = this.items.get(id); return it && it.prims ? it.prims.main : null; }
  primsOf(id) { const it = id === "__preview__" ? this.preview : this.items.get(id); return it ? it.prims : null; }

  dispose() {
    for (const it of this.items.values()) this._dispose(it);
    this.items.clear();
    if (this.preview) this._dispose(this.preview);
    for (const e of this.textures.values()) e.tex.dispose();
    this.textures.clear();
    if (this.group.parent) this.group.parent.remove(this.group);
    if (this.gnHost) this.gnHost.remove();
  }
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L > 1e-12 ? ((px - a[0]) * dx + (py - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(a[0] + dx * t - px, a[1] + dy * t - py), t };
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
