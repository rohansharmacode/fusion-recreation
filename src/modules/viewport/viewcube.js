// ViewCube: a small separate renderer in app.dom.viewcubeHost. White/grey cube with face
// labels, 26 hover-highlighted click zones (6 faces, 12 edges, 8 corners), drag-to-orbit,
// Home button, roll/nudge arrows for face-on views, XYZ triad and an options menu.
// Z up: FRONT faces -Y, RIGHT +X, TOP +Z.
import * as THREE from "three";
import { VIEW_AXES } from "./camera.js";

const V3 = THREE.Vector3;
const FACES = [
  { name: "front", label: "FRONT", n: [0, -1, 0], up: [0, 0, 1] },
  { name: "back", label: "BACK", n: [0, 1, 0], up: [0, 0, 1] },
  { name: "right", label: "RIGHT", n: [1, 0, 0], up: [0, 0, 1] },
  { name: "left", label: "LEFT", n: [-1, 0, 0], up: [0, 0, 1] },
  { name: "top", label: "TOP", n: [0, 0, 1], up: [0, 1, 0] },
  { name: "bottom", label: "BOTTOM", n: [0, 0, -1], up: [0, -1, 0] },
];
const EDGE_W = 0.36;
const SHADOW_SIZE = 3.0; // ground shadow quad (cube units; the cube spans -1..1) // width of edge/corner bands (in cube half-size units, cube spans -1..1)
const HOVER_COLOR = 0x6aa9e6;

/** Zone name for a direction with components in {-1,0,1}: e.g. "front-right-top". */
export function zoneName(v) {
  const parts = [];
  if (v[1] < 0) parts.push("front"); else if (v[1] > 0) parts.push("back");
  if (v[0] > 0) parts.push("right"); else if (v[0] < 0) parts.push("left");
  if (v[2] > 0) parts.push("top"); else if (v[2] < 0) parts.push("bottom");
  return parts.join("-");
}

function faceTexture(label, side) {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, S, S);
  if (side) {
    // soft contact darkening along the bottom edge of the side faces
    const grd = g.createLinearGradient(0, S * 0.8, 0, S);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, "rgba(0,0,0,0.13)");
    g.fillStyle = grd;
    g.fillRect(0, S * 0.8, S, S * 0.2);
  }
  // bold, slightly condensed grey caps filling most of the face (as in Fusion's cube)
  const family = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const fs = label.length > 4 ? 78 : 68;
  g.font = `700 ${fs}px ${family}`;
  const w = g.measureText(label).width;
  const maxW = S * 0.86;
  const sx = Math.min(0.86, maxW / w);
  g.save();
  g.translate(S / 2, S / 2 + 6);
  g.scale(sx, 1);
  g.fillStyle = "#525252";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, 0, 0);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let shadowTex = null;
/** Soft ground shadow: a blurred square a little larger than the cube footprint (ref 26). */
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const k = S / SHADOW_SIZE; // px per cube unit
  const half = 1.06 * k;
  g.filter = `blur(${Math.round(0.16 * k)}px)`;
  g.fillStyle = "rgba(0,0,0,0.30)";
  g.fillRect(S / 2 - half, S / 2 - half, half * 2, half * 2);
  g.filter = "none";
  shadowTex = new THREE.CanvasTexture(c);
  shadowTex.colorSpace = THREE.SRGBColorSpace;
  return shadowTex;
}

function textSprite(text, color) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.font = `600 54px "Segoe UI", Arial, sans-serif`;
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 32, 35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.setScalar(0.74);
  s.renderOrder = 20;
  return s;
}

const SVG = {
  home: `<svg viewBox="0 0 20 20" width="18" height="18"><path d="M3.2 10.2 10 4l6.8 6.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M5.3 9v7.2h3.6v-4.2h2.2v4.2h3.6V9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  caret: `<svg viewBox="0 0 10 10" width="10" height="10"><path d="M1.5 3.5h7L5 7.5z" fill="currentColor"/></svg>`,
  tri: `<svg viewBox="0 0 12 12" width="12" height="12"><path d="M6 2.2 10.4 9.6H1.6z" fill="currentColor"/></svg>`,
  rollCW: `<svg viewBox="0 0 18 18" width="16" height="16"><path d="M4 11.5A5.5 5.5 0 1 1 9 14.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M1.6 9.4 4 13.4 6.6 9.8z" fill="currentColor"/></svg>`,
  rollCCW: `<svg viewBox="0 0 18 18" width="16" height="16"><path d="M14 11.5A5.5 5.5 0 1 0 9 14.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16.4 9.4 14 13.4 11.4 9.8z" fill="currentColor"/></svg>`,
};

export class ViewCube {
  constructor(vp, host) {
    this.vp = vp;
    this.host = host;
    this.size = 100;
    const root = document.createElement("div");
    root.className = "vc-root";
    host.appendChild(root);
    this.root = root;
    const wrap = document.createElement("div");
    wrap.className = "vc-canvas-wrap";
    root.appendChild(wrap);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(this.size, this.size);
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;
    this.canvas.className = "vc-canvas";
    wrap.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    // Fusion's cube is drawn with a mild perspective (eye ~10 half-sizes away): iso view 63x69 px,
    // face-on square 47 px (reference captures)
    this.camera = new THREE.PerspectiveCamera(26.8, 1, 0.5, 50);
    // soft view-relative lighting: top/front faces near white, the side away from the light a
    // light grey (sampled from the reference cube)
    this.scene.add(new THREE.AmbientLight(0xffffff, 2.62));
    this.light = new THREE.DirectionalLight(0xffffff, 0.62);
    this.camera.add(this.light);
    this.light.position.set(-1.0, 0.9, 0.9);
    this.scene.add(this.camera);

    this.cube = new THREE.Group();
    this.scene.add(this.cube);
    this.zones = new Map(); // name -> [meshes]
    this.zoneMeshes = [];
    this._buildCube();
    this._buildTriad();
    this.hover = null;
    this._buildButtons();
    this._wire();
    this.lastVersion = -1;
    this.dirty = true;
    this.visible = true;
  }

  _buildCube() {
    const lo = -1 + EDGE_W, hi = 1 - EDGE_W;
    // outer bands overhang the cube edge slightly so neighbouring tiles leave no gap at the silhouette
    const bands = [[-1.008, lo], [lo, hi], [hi, 1.008]];
    for (const f of FACES) {
      const n = new V3(...f.n), up = new V3(...f.up);
      const right = new V3().crossVectors(up, n);
      const basis = new THREE.Matrix4().makeBasis(right, up, n);
      const mat = new THREE.MeshLambertMaterial({ map: faceTexture(f.label, f.n[2] === 0) });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      face.applyMatrix4(basis);
      face.position.copy(n);
      this.cube.add(face);
      // 3x3 zone tiles
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const [u0, u1] = bands[i], [v0, v1] = bands[j];
        const g = new THREE.PlaneGeometry(u1 - u0, v1 - v0);
        const tile = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: HOVER_COLOR, transparent: true, opacity: 0, depthWrite: false }));
        tile.applyMatrix4(basis);
        const c = new V3().addScaledVector(right, (u0 + u1) / 2).addScaledVector(up, (v0 + v1) / 2).addScaledVector(n, 1.004);
        tile.position.copy(c);
        const dir = new V3().copy(n).addScaledVector(right, i - 1).addScaledVector(up, j - 1);
        const name = zoneName([Math.round(dir.x), Math.round(dir.y), Math.round(dir.z)]);
        tile.userData.zone = name;
        tile.renderOrder = 2;
        if (!this.zones.has(name)) this.zones.set(name, []);
        this.zones.get(name).push(tile);
        this.zoneMeshes.push(tile);
        this.cube.add(tile);
      }
    }
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.004, 2.004, 2.004)), new THREE.LineBasicMaterial({ color: 0xb4b4b4 }));
    edges.renderOrder = 3;
    this.cube.add(edges);
    // soft grey ground shadow under the cube, pushed away from the light (shows beyond the
    // bottom of the RIGHT face and faintly under FRONT in the home view, ref 26)
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(SHADOW_SIZE, SHADOW_SIZE), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    sh.position.set(0.22, 0.1, -1.01);
    sh.renderOrder = -1;
    this.shadow = sh;
    this.cube.add(sh);
  }

  _buildTriad() {
    const t = new THREE.Group();
    // the lines run ON the cube's edges from the front-left-bottom corner (half of each bar is
    // buried in the cube, the visible half straddles the silhouette): X along the bottom of FRONT
    // ending just past its corner, Z up the front-left edge a little above the top (ref 26)
    const w = 0.08;
    const o = new V3(-1.004, -1.004, -1.004);
    const axes = [
      { d: new V3(1, 0, 0), c: 0xff3b30, s: "X", col: "#ff3a3a", L: 2.18 },
      { d: new V3(0, 1, 0), c: 0x34c759, s: "Y", col: "#2fd34a", L: 2.18 },
      { d: new V3(0, 0, 1), c: 0x2f3cf5, s: "Z", col: "#3446ff", L: 2.4 },
    ];
    for (const a of axes) {
      const L = a.L;
      const geo = new THREE.BoxGeometry(a.d.x ? L : w, a.d.y ? L : w, a.d.z ? L : w);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: a.c }));
      m.position.copy(o).addScaledVector(a.d, L / 2);
      t.add(m);
      const sp = textSprite(a.s, a.col);
      sp.position.copy(o).addScaledVector(a.d, L + (a.s === "Z" ? 0.4 : 0.22));
      t.add(sp);
    }
    this.triad = t;
    this.cube.add(t);
  }

  _btn(cls, html, title, cmd) {
    const b = document.createElement("button");
    b.className = `vc-btn ${cls}`;
    b.innerHTML = html;
    b.title = title;
    if (cmd) b.dataset.cmd = cmd;
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.root.appendChild(b);
    return b;
  }

  _buildButtons() {
    this.homeBtn = this._btn("vc-home", SVG.home, "Home", "ViewCubeGoHome");
    this.homeBtn.addEventListener("click", () => this.vp.app.commands.run("ViewCubeGoHome"));
    this.menuBtn = this._btn("vc-menu", SVG.caret, "ViewCube options");
    this.menuBtn.dataset.action = "viewcube-menu";
    this.menuBtn.addEventListener("click", () => this.openMenu());
    const rot = (q) => () => this.vp.rotateView(q);
    const Q = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(new V3(...axis), THREE.MathUtils.degToRad(deg));
    this.arrows = [
      this._btn("vc-nudge vc-up", SVG.tri, "Rotate view up"),
      this._btn("vc-nudge vc-down", SVG.tri, "Rotate view down"),
      this._btn("vc-nudge vc-left", SVG.tri, "Rotate view left"),
      this._btn("vc-nudge vc-right", SVG.tri, "Rotate view right"),
      this._btn("vc-roll vc-roll-cw", SVG.rollCW, "Rotate 90° clockwise"),
      this._btn("vc-roll vc-roll-ccw", SVG.rollCCW, "Rotate 90° counter-clockwise"),
    ];
    this.arrows[0].addEventListener("click", rot(Q([1, 0, 0], -90)));
    this.arrows[1].addEventListener("click", rot(Q([1, 0, 0], 90)));
    this.arrows[2].addEventListener("click", rot(Q([0, 1, 0], -90)));
    this.arrows[3].addEventListener("click", rot(Q([0, 1, 0], 90)));
    // rolling the camera counter-clockwise turns the picture clockwise
    this.arrows[4].addEventListener("click", rot(Q([0, 0, 1], 90)));
    this.arrows[5].addEventListener("click", rot(Q([0, 0, 1], -90)));
  }

  openMenu() {
    const vp = this.vp;
    const r = this.menuBtn.getBoundingClientRect();
    vp.menu.open([
      { label: "Go Home", cmd: "ViewCubeGoHome" },
      { sep: true },
      { label: "Orthographic", cmd: "ViewCameraOrthoCommand", radio: true },
      { label: "Perspective", cmd: "ViewCameraPerspCommand", radio: true },
      { label: "Perspective with Ortho Faces", cmd: "ViewCameraPerspWithOrthoFacesCommand", radio: true },
      { sep: true },
      { label: "Set current view as Home", items: [
        { label: "Fit to View", cmd: "ViewCubeSetHomeFit" },
        { label: "Fixed Distance", cmd: "ViewCubeSetHomeFixed" },
      ] },
      { label: "Reset Home", cmd: "ViewCubeResetHome" },
    ], { x: r.right, y: r.bottom + 2, alignRight: true, owner: this.menuBtn });
  }

  _wire() {
    const c = this.canvas;
    const ray = new THREE.Raycaster();
    const pickZone = (ev) => {
      const r = c.getBoundingClientRect();
      const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const h = ray.intersectObjects(this.zoneMeshes, false)[0];
      return h ? h.object.userData.zone : null;
    };
    let down = null;
    c.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      c.setPointerCapture(ev.pointerId);
      down = { x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, moved: false, zone: pickZone(ev) };
    });
    c.addEventListener("pointermove", (ev) => {
      if (down) {
        const dx = ev.clientX - down.lx, dy = ev.clientY - down.ly;
        if (!down.moved && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 3) {
          down.moved = true;
          this.setHover(null);
          c.style.cursor = "grabbing";
        }
        if (down.moved) {
          this.vp.orbitBy(dx, dy, 0.012);
          down.lx = ev.clientX; down.ly = ev.clientY;
        }
        return;
      }
      const z = pickZone(ev);
      this.setHover(z);
      c.style.cursor = z ? "pointer" : "default";
    });
    const up = (ev) => {
      if (!down) return;
      const d = down;
      down = null;
      c.style.cursor = "default";
      try { c.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
      if (!d.moved && d.zone) this.vp.setView(d.zone, { animate: true, minimalRoll: true, fitIfEmpty: true });
    };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", () => { down = null; });
    c.addEventListener("pointerleave", () => { if (!down) this.setHover(null); });
    c.addEventListener("contextmenu", (ev) => { ev.preventDefault(); this.openMenu(); });
    c.addEventListener("wheel", (ev) => { ev.preventDefault(); this.vp.zoomBy(Math.exp(Math.sign(ev.deltaY) * 0.15)); }, { passive: false });
    this.root.addEventListener("pointerenter", () => this.root.classList.add("vc-active"));
    this.root.addEventListener("pointerleave", () => this.root.classList.remove("vc-active"));
  }

  setHover(z) {
    if (z === this.hover) return;
    if (this.hover) for (const m of this.zones.get(this.hover) || []) m.material.opacity = 0;
    this.hover = z;
    if (z) for (const m of this.zones.get(z) || []) m.material.opacity = 0.78;
    this.root.dataset.hover = z || "";
    this.dirty = true;
    this.vp.requestRender();
  }

  setVisible(v) {
    this.visible = v;
    this.root.style.display = v ? "" : "none";
    if (v) this.dirty = true;
  }

  /** Render if the main camera moved or hover changed. */
  render(rig) {
    if (!this.visible) return;
    const aligned = rig.isAxisAligned(2e-3) && !rig.anim;
    this.root.classList.toggle("vc-aligned", aligned);
    if (!this.dirty && this.lastVersion === rig.version) return;
    this.lastVersion = rig.version;
    this.dirty = false;
    const back = rig.back();
    this.camera.position.copy(back).multiplyScalar(10);
    this.camera.quaternion.copy(rig.quat);
    this.camera.updateMatrixWorld(true);
    this.renderer.render(this.scene, this.camera);
  }

  /** Name of the standard face currently looked at (or null). */
  currentFace(rig) {
    if (!rig.isAxisAligned(2e-3)) return null;
    const b = rig.back();
    for (const [name, a] of Object.entries(VIEW_AXES)) if (b.dot(new V3(...a)) > 0.999) return name;
    return null;
  }
}
