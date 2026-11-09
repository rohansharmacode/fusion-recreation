// Origin (XY/XZ/YZ planes, X/Y/Z axes, origin point) and construction planes.
// Origin items are screen-size constant and laid out like Fusion's plane-selection display in
// the reference captures: small translucent yellow squares in the positive quadrants (0.125..1
// unit from the origin, unit ~ 15% of the canvas height), where two planes overlap the colour
// turns orange (drawn with a stencil count), a hovered plane turns pale; dash-dot X/Y/Z axes from
// the origin to 1.13 units; the origin point is a small dark ring.
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

// sRGB colours/alphas solved from the captures (over white: one plane -> rgb(253,255,148),
// two planes -> rgb(253,210,66), hovered plane -> rgb(254,255,241))
const FILL1 = { color: new THREE.Color("rgb(250,255,0)"), opacity: 0.42 };
const FILL2 = { color: new THREE.Color("rgb(252,194,0)"), opacity: 0.741 };
const HOVER_FILL = { color: new THREE.Color("rgb(254,255,238)"), opacity: 0.81 };
const SELECT_FILL = { color: new THREE.Color(0, 0.47, 1), opacity: 0.5 };
const ORANGE = new THREE.Color(1, 0.647, 0);
const ORANGE_EDGE = new THREE.Color(0.902, 0.494, 0.208);
const HOVER = new THREE.Color(0.3, 0.5, 1);
const SELECT = new THREE.Color(0, 0.47, 1);
const AXIS_COLORS = { X: new THREE.Color(1, 0, 0), Y: new THREE.Color(0, 1, 0), Z: new THREE.Color(0, 0, 1) };

export const ORIGIN_PLANE_AXES = {
  XY: [[1, 0, 0], [0, 1, 0]],
  XZ: [[1, 0, 0], [0, 0, 1]],
  YZ: [[0, 1, 0], [0, 0, 1]],
};
export const PLANE_BOUNDS = [0.125, 1.0];
const AXIS_LW = 1.15; // dash-dot axis width (px): thin like Fusion's (refs 05/06)
export const AXIS_BOUNDS = [0.06, 1.13];

function quadGeometry(a, b, lo, hi) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const p = (s, t) => A.clone().multiplyScalar(s).add(B.clone().multiplyScalar(t));
  const pts = [p(lo, lo), p(hi, lo), p(hi, hi), p(lo, hi)];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flatMap((v) => v.toArray()), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

// shared by every plane fill: spacing of the faint grid drawn inside the planes (local units)
const PLANE_GRID = { uStep: { value: 0.1 } };
/** Faint lines inside an origin plane every minor grid step (seen in the reference captures). */
function withPlaneGrid(mat, mask) {
  const uMask = { value: new THREE.Vector3(...mask) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uStep = PLANE_GRID.uStep;
    sh.uniforms.uMask = uMask;
    sh.vertexShader = sh.vertexShader
      .replace("void main() {", `varying vec3 vLocalPos;
void main() {`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
  vLocalPos = position;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", `varying vec3 vLocalPos;
uniform float uStep;
uniform vec3 uMask;
void main() {`)
      .replace("#include <opaque_fragment>", `vec3 cc = vLocalPos / uStep;
  vec3 fw = max(fwidth(cc), vec3(1e-5));
  vec3 dl = abs(cc - floor(cc + 0.5)) / fw;
  vec3 cov = (1.0 - clamp(dl, 0.0, 1.0)) * uMask;
  float lc = max(max(cov.x, cov.y), cov.z);
  outgoingLight *= 1.0 - 0.06 * lc;
  diffuseColor.a = min(1.0, diffuseColor.a + 0.04 * lc);
  #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => "vp-origin-plane-grid";
  return mat;
}

function planeMats(name) {
  const mask = name === "XY" ? [1, 1, 0] : name === "XZ" ? [1, 0, 1] : [0, 1, 1];
  const base = { side: THREE.DoubleSide, depthWrite: false };
  // pass 1: count covering planes in the stencil buffer (no colour)
  const count = new THREE.MeshBasicMaterial({ ...base, colorWrite: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilRef: 0, stencilZPass: THREE.IncrementStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp });
  // pass 2: pixels covered by exactly one plane (zeroed after drawing so each pixel is shaded once)
  const one = withPlaneGrid(new THREE.MeshBasicMaterial({ ...base, color: FILL1.color, transparent: true, opacity: FILL1.opacity, stencilWrite: true, stencilFunc: THREE.EqualStencilFunc, stencilRef: 1, stencilZPass: THREE.ZeroStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp }), mask);
  // pass 3: overlaps (two or more planes)
  const two = withPlaneGrid(new THREE.MeshBasicMaterial({ ...base, color: FILL2.color, transparent: true, opacity: FILL2.opacity, stencilWrite: true, stencilFunc: THREE.LessEqualStencilFunc, stencilRef: 2, stencilZPass: THREE.ZeroStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp }), mask);
  // hovered / selected plane: drawn on top with plain blending, a plain face without the inner
  // grid lines (ref 06)
  const solo = new THREE.MeshBasicMaterial({ ...base, color: HOVER_FILL.color, transparent: true, opacity: HOVER_FILL.opacity });
  return { count, one, two, solo };
}

function dashedAxisMaterial(color) {
  // Fusion draws the plane-selection axes dash-dot (on screen in the iso view: 13px dash, 4px gap,
  // 2px dot, 4px gap); distances here are face-on pixels (dashScale = unit px), so / 0.8165
  const m = new LineMaterial({ color, linewidth: AXIS_LW, transparent: true, dashed: true, dashSize: 19.6, gapSize: 9.8, worldUnits: false });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX",
      "float dd = mod( vLineDistance + dashOffset, dashSize + gapSize ); if ( dd > dashSize && ( dd < dashSize + 3.7 || dd > dashSize + 6.1 ) ) discard;",
    );
  };
  return m;
}

export class OriginLayer {
  constructor(vp) {
    this.vp = vp;
    this.group = vp.groups.origin;
    this.root = new THREE.Group();
    this.root.name = "origin-items";
    this.group.add(this.root);
    this.forced = 0; // setOriginVisible(true) count
    this.override = true; // Object Visibility > Origins
    this.unit = 1;
    this.unitPx = 97;
    this.planes = {};
    this.axes = {};
    this.lineMats = [];
    for (const name of ["XY", "XZ", "YZ"]) {
      const [a, b] = ORIGIN_PLANE_AXES[name];
      const geo = quadGeometry(a, b, PLANE_BOUNDS[0], PLANE_BOUNDS[1]);
      const mats = planeMats(name);
      const mk = (mat, order) => { const m = new THREE.Mesh(geo, mat); m.renderOrder = order; return m; };
      const count = mk(mats.count, 7), one = mk(mats.one, 8), two = mk(mats.two, 9), solo = mk(mats.solo, 10);
      const g = new THREE.Group();
      g.add(count, one, two, solo);
      g.userData = { ref: { kind: "originPlane", name } };
      // `fill` kept for callers that read the plane material (tests / other modules)
      this.planes[name] = { group: g, fill: one, count, one, two, solo, a, b, state: "" };
      this.root.add(g);
    }
    for (const name of ["X", "Y", "Z"]) {
      const d = [name === "X" ? 1 : 0, name === "Y" ? 1 : 0, name === "Z" ? 1 : 0];
      const geo = new LineSegmentsGeometry();
      geo.setPositions([0, 0, 0, d[0] * AXIS_BOUNDS[1], d[1] * AXIS_BOUNDS[1], d[2] * AXIS_BOUNDS[1]]);
      const mat = dashedAxisMaterial(AXIS_COLORS[name]);
      this.lineMats.push(mat);
      const line = new LineSegments2(geo, mat);
      line.computeLineDistances();
      line.renderOrder = 11;
      this.axes[name] = { line, mat, d };
      this.root.add(line);
    }
    // origin point: a small dark ring (constant-width line) around a white disc lying in the XY plane
    this.point = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    disc.renderOrder = 12;
    const ringPts = [];
    for (let i = 0; i < 32; i++) {
      const a0 = (i / 32) * Math.PI * 2, a1 = ((i + 1) / 32) * Math.PI * 2;
      ringPts.push(Math.cos(a0) * 0.5, Math.sin(a0) * 0.5, 0, Math.cos(a1) * 0.5, Math.sin(a1) * 0.5, 0);
    }
    const ringGeo = new LineSegmentsGeometry();
    ringGeo.setPositions(ringPts);
    this.pointMat = new LineMaterial({ color: 0x555555, linewidth: 1.6, depthTest: false, transparent: true });
    this.lineMats.push(this.pointMat);
    const ring = new LineSegments2(ringGeo, this.pointMat);
    ring.renderOrder = 13;
    this.point.add(disc, ring);
    this.pointPx = 15;
    this.root.add(this.point);

    // construction planes
    this.cgroup = vp.groups.construction;
    this.cplanes = new Map(); // id -> {group, fill, edge, plane, corners}
    this.cplaneOverride = true; // Object Visibility > Construction Planes
  }

  get visible() {
    const docVis = !!(this.vp.app.doc.origin && this.vp.app.doc.origin.visible);
    return (this.forced > 0 || docVis) && (this.override || this.forced > 0);
  }

  /** Per-item visibility from the browser (doc.origin.items[name] === false hides it). */
  itemVisible(name) {
    if (this.forced > 0) return true;
    const o = this.vp.app.doc.origin;
    return !(o && o.items && o.items[name] === false);
  }

  /** Called every frame before rendering: keep the origin screen-size constant. */
  updateScale(rig) {
    const vis = this.visible;
    this.group.visible = vis;
    if (!vis) return;
    for (const [name, p] of Object.entries(this.planes)) p.group.visible = this.itemVisible(name);
    for (const [name, a] of Object.entries(this.axes)) a.line.visible = this.itemVisible(name);
    this.point.visible = this.itemVisible("O");
    const ps = rig.pixelSize(new THREE.Vector3(0, 0, 0));
    this.unitPx = Math.max(60, Math.min(150, rig.height * 0.15));
    this.unit = ps * this.unitPx;
    this.root.scale.setScalar(this.unit);
    this.point.scale.setScalar(this.pointPx / this.unitPx);
    // the point ring lies half way between the XY plane and the screen (round when seen from the
    // top, a mild ellipse in the home view like Fusion's)
    const qv = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), rig.back());
    this.point.quaternion.identity().slerp(qv, 0.5);
    const g = this.vp.grid;
    const minor = g && g.majorSpacing ? g.majorSpacing() / 5 : 10;
    PLANE_GRID.uStep.value = Math.max(1e-6, minor / this.unit);
    this.root.updateMatrixWorld(true);
    // keep the dash pattern in screen pixels: line distances are in root units
    for (const a of Object.values(this.axes)) {
      a.mat.dashScale = this.unitPx;
    }
  }

  setResolution(w, h) {
    for (const m of this.lineMats) m.resolution.set(w, h);
    for (const c of this.cplanes.values()) if (c.edgeMat) c.edgeMat.resolution.set(w, h);
  }

  /** Recolour origin items + cplanes from hover/selection state. */
  updateHighlight() {
    const app = this.vp.app;
    const key = this.vp.refKey;
    const sel = new Set((app.selection.items || []).map(key));
    const hov = app.selection.hover ? key(app.selection.hover) : "";
    const state = (k) => (sel.has(k) ? "sel" : hov === k ? "hov" : "");
    for (const [name, p] of Object.entries(this.planes)) {
      const s = state(`op:${name}`);
      p.state = s;
      // plain planes take part in the stencil overlap shading; hovered/selected ones draw on top
      p.count.visible = p.one.visible = p.two.visible = !s;
      p.solo.visible = !!s;
      const f = s === "sel" ? SELECT_FILL : HOVER_FILL;
      p.solo.material.color.copy(f.color);
      p.solo.material.opacity = f.opacity;
    }
    for (const [name, a] of Object.entries(this.axes)) {
      const s = state(`oa:${name}`);
      a.mat.color.copy(s === "sel" ? SELECT : s === "hov" ? HOVER : AXIS_COLORS[name]);
      a.mat.linewidth = s ? 3 : AXIS_LW;
    }
    const ps = state("opt");
    this.pointMat.color.set(ps === "sel" ? SELECT : ps === "hov" ? HOVER : 0x555555);
    this.pointPx = ps ? 18 : 15;
    for (const [id, c] of this.cplanes) {
      let s = state(`cp:${id}`);
      if (!s) s = state(`f:${id}`);
      c.fill.material.color.copy(s === "sel" ? SELECT : s === "hov" ? HOVER : ORANGE);
      c.fill.material.opacity = s ? 0.4 : 0.3;
      c.edge.material.color.copy(s === "sel" ? SELECT : s === "hov" ? HOVER : ORANGE_EDGE);
    }
    this.vp.requestRender();
  }

  /** Name of the hovered origin plane (for the grid numbers), or null. */
  hoveredPlane() {
    if (!this.visible) return null;
    for (const [name, p] of Object.entries(this.planes)) if (p.state === "hov") return name;
    return null;
  }

  /** Rebuild construction plane rectangles from the evaluated state. */
  rebuildCPlanes(bounds) {
    const app = this.vp.app;
    for (const c of this.cplanes.values()) {
      this.cgroup.remove(c.group);
      c.fill.geometry.dispose(); c.edge.geometry.dispose();
    }
    this.cplanes.clear();
    const st = app.result && app.result.state;
    if (!st || !st.planes) return;
    const center = bounds.radius > 0 ? bounds.center : new THREE.Vector3();
    const half = Math.max(bounds.radius * 0.75, 15);
    for (const [id, ps] of st.planes) {
      const f = app.feature(id);
      if (!f || f.visible === false || !ps || !ps.plane) continue;
      const pl = ps.plane;
      const o = new THREE.Vector3(...pl.o);
      const n = new THREE.Vector3(...pl.n).normalize();
      const x = new THREE.Vector3(...pl.x).normalize();
      const y = new THREE.Vector3().crossVectors(n, x).normalize();
      // centre: model centre projected on the plane
      const c = center.clone().sub(o);
      const cu = c.dot(x), cv = c.dot(y);
      const P = (u, v) => o.clone().addScaledVector(x, u).addScaledVector(y, v);
      const corners = [P(cu - half, cv - half), P(cu + half, cv - half), P(cu + half, cv + half), P(cu - half, cv + half)];
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(corners.flatMap((v) => v.toArray()), 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      const fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
      fill.renderOrder = 7;
      const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints([...corners, corners[0]]), new THREE.LineBasicMaterial({ color: ORANGE_EDGE }));
      edge.renderOrder = 8;
      const grp = new THREE.Group();
      grp.name = `cplane:${id}`;
      grp.add(fill, edge);
      this.cgroup.add(grp);
      this.cplanes.set(id, { group: grp, fill, edge, plane: { o, n, x, y }, rect: [cu - half, cv - half, cu + half, cv + half], corners });
    }
    this.cgroup.visible = this.cplaneOverride;
    this.updateHighlight();
  }
}
