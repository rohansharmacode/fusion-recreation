// On-canvas graphics for the inspect tools: measurement lines + HTML value labels (always on top),
// and the centre-of-mass glyph (black/white octant sphere, constant screen size).
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

export class CanvasOverlay {
  constructor(app, name = "inspect") {
    this.app = app;
    this.group = new THREE.Group();
    this.group.name = name;
    this.group.userData.noPick = true;
    this.labels = [];
    this.glyphs = []; // {obj, p, px}
    this.attached = false;
    this._offCam = app.on("camera", () => this.update());
  }
  _attach() {
    const vp = this.app.viewport;
    if (!this.attached && vp && vp.groups && vp.groups.overlay) { vp.groups.overlay.add(this.group); this.attached = true; }
  }
  clear() {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    }
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    this.glyphs = [];
    this.request();
  }
  dispose() {
    this.clear();
    if (this.group.parent) this.group.parent.remove(this.group);
    this.attached = false;
    if (this._offCam) { this._offCam(); this._offCam = null; }
  }
  request() { const vp = this.app.viewport; if (vp && vp.requestRender) vp.requestRender(); }

  /** Thick screen-space line segments: pts = [a, b, a2, b2, ...] */
  segments(pts, { color = 0x000000, width = 1.5, dashed = false, opacity = 1, dash = 6, gap = 4 } = {}) {
    this._attach();
    if (pts.length < 2) return null;
    const flat = [];
    for (const p of pts) flat.push(p[0], p[1], p[2]);
    const geo = new LineSegmentsGeometry();
    geo.setPositions(flat);
    const s = this.app.viewport.size ? this.app.viewport.size() : { w: 800, h: 600 };
    const mat = new LineMaterial({ color, linewidth: width, worldUnits: false, dashed, transparent: opacity < 1, opacity, depthTest: false });
    if (dashed) { mat.dashSize = dash; mat.gapSize = gap; mat.dashScale = 1; }
    mat.resolution.set(s.w, s.h);
    const line = new LineSegments2(geo, mat);
    if (dashed) line.computeLineDistances();
    line.userData.noPick = true;
    line.userData.dashPx = dashed ? [dash, gap] : null;
    line.renderOrder = 20;
    this.group.add(line);
    this.request();
    return line;
  }

  /** Small filled dot (constant screen size) at p. */
  dot(p, { color = 0x000000, px = 3.2 } = {}) {
    this._attach();
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color, depthTest: false }));
    m.position.set(p[0], p[1], p[2]);
    m.renderOrder = 21;
    m.userData.noPick = true;
    this.group.add(m);
    this.glyphs.push({ obj: m, p, px });
    this.update();
    return m;
  }

  /** HTML label anchored at world point p. */
  label(p, html, cls = "insp-label") {
    const vp = this.app.viewport;
    if (!vp || !vp.labelLayer) return null;
    const el = document.createElement("div");
    el.className = cls;
    el.innerHTML = html;
    vp.labelLayer.appendChild(el);
    const l = { el, p };
    this.labels.push(l);
    this._place(l);
    return el;
  }

  /** Centre-of-mass glyph: a screen-facing disc split into black/white quarters with a dark rim. */
  comGlyph(p, radiusPx = 9) {
    this._attach();
    const g = new THREE.Group();
    const mk = (geo, color, order) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false, side: THREE.DoubleSide }));
      m.renderOrder = order;
      return m;
    };
    for (let q = 0; q < 4; q++) g.add(mk(new THREE.CircleGeometry(1, 16, (q * Math.PI) / 2, Math.PI / 2), q % 2 ? 0x111111 : 0xffffff, 22));
    g.add(mk(new THREE.RingGeometry(0.94, 1.14, 40), 0x111111, 23));
    g.position.set(p[0], p[1], p[2]);
    g.userData = { noPick: true, billboard: true, com: true };
    this.group.add(g);
    this.glyphs.push({ obj: g, p, px: radiusPx });
    this.update();
    return g;
  }

  _place(l) {
    const vp = this.app.viewport;
    const s = vp.toScreen(l.p);
    const vis = Number.isFinite(s[0]) && s[2] < 1 && s[2] > -1;
    l.el.style.display = vis ? "" : "none";
    if (vis) l.el.style.transform = `translate(${Math.round(s[0])}px, ${Math.round(s[1])}px) translate(-50%, -50%)`;
  }

  update() {
    const vp = this.app.viewport;
    if (!vp) return;
    for (const l of this.labels) this._place(l);
    if (this.glyphs.length) {
      const cam = vp.camera;
      for (const gl of this.glyphs) {
        const k = vp.pixelSize(gl.p) * gl.px;
        if (Number.isFinite(k) && k > 0) gl.obj.scale.setScalar(k);
        if (gl.obj.userData.billboard && cam) gl.obj.quaternion.copy(cam.quaternion);
      }
    }
    // keep dashed lines at a constant on-screen dash length
    for (const c of this.group.children) {
      if (c.userData.dashPx && c.material) {
        const s = vp.size ? vp.size() : null;
        if (s) c.material.resolution.set(s.w, s.h);
      }
    }
  }
}
