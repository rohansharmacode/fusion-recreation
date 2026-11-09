// Highlights for face / edge selections inside a command. These are drawn from the geometry of
// the state *before* the feature (the bodies on screen may be the live preview, whose face/edge
// indices no longer match), so they live in our own depth-tested group (added to the main scene,
// not groups.overlay which the viewport draws on top of everything) rather than app.selection.
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

// same colours as the viewport selection highlight (Fusion blue)
const SEL_FACE = 0x0066ff, SEL_LINE = 0x0080ff;

export class SelectionOverlay {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.group.name = "dlg-selection";
    const vp = app.viewport;
    this.group.userData.noPick = true;
    if (vp && vp.scene) vp.scene.add(this.group);
    this.lineMats = [];
    this._offCam = app.on("camera", () => this._res());
  }
  _res() {
    const c = this.app.viewport && this.app.viewport.canvas;
    if (!c) return;
    for (const m of this.lineMats) m.resolution.set(c.clientWidth || 1, c.clientHeight || 1);
  }
  clear() {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      o.geometry && o.geometry.dispose();
      o.material && o.material.dispose();
    }
    this.lineMats = [];
  }
  /** refs: face/edge refs; state: evaluation state whose bodies the refs index into. */
  set(refs, state) {
    this.clear();
    const vp = this.app.viewport;
    if (!vp || !state) return;
    for (const r of refs) {
      const b = state.bodies.get(r.body);
      if (!b || r.index < 0) continue;
      let md;
      try { md = vp.meshFor(b.shape); } catch { continue; }
      if (!md) continue;
      if (r.kind === "face") {
        const g = md.faceGroups.find((x) => x.face === r.index);
        if (!g) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(md.vertices, 3));
        geo.setIndex(new THREE.BufferAttribute(md.triangles.slice(g.start, g.start + g.count), 1));
        const mat = new THREE.MeshBasicMaterial({ color: SEL_FACE, transparent: true, opacity: 0.42, depthWrite: false, depthFunc: THREE.LessEqualDepth, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, side: THREE.DoubleSide });
        const m = new THREE.Mesh(geo, mat);
        m.renderOrder = 900;
        this.group.add(m);
      } else if (r.kind === "edge") {
        const g = md.edgeGroups.find((x) => x.edge === r.index);
        if (!g) continue;
        const pos = md.lines.slice(g.start * 3, (g.start + g.count) * 3);
        if (pos.length < 6) continue;
        const geo = new LineSegmentsGeometry();
        geo.setPositions(pos);
        const mat = new LineMaterial({ color: SEL_LINE, linewidth: 3, worldUnits: false, depthTest: true, transparent: true });
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -2;
        mat.polygonOffsetUnits = -2;
        this.lineMats.push(mat);
        const l = new LineSegments2(geo, mat);
        l.renderOrder = 950;
        this.group.add(l);
      }
    }
    this._res();
    vp.requestRender();
  }
  dispose() {
    this.clear();
    if (this.group.parent) this.group.parent.remove(this.group);
    if (this._offCam) this._offCam();
    this.app.viewport && this.app.viewport.requestRender();
  }
}
