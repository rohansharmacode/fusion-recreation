// Fusion's layout grid, drawn by a fragment shader on a plane (XY by default, the active sketch
// plane while sketching):
//  * 1px lines in rgba(0.2,0.2,0.2,0.08) (the environment's LayoutGrid ARGB), ONE adaptive level of
//    spacing at a time from the 1-5-10 sequence (… 10, 50, 100, 500 … mm) chosen so lines stay at
//    least ~45px apart — 50 mm at Fusion's default zoom (3.6 px/mm), like the reference captures.
//    Grid Settings > fixed spacing draws major + minor lines instead.
//  * the red X / green Y axis lines through the grid origin spanning the whole view,
//  * the grey origin glyph (circle with two filled quadrants lying in the plane),
//  * grid numbers along the axes (sketch mode / hovered origin plane), lying in the plane like
//    Fusion's (reading along -Y, glyph tops towards +X): negative X values below the X axis,
//    positive Y values beside the Y axis.
import * as THREE from "three";

const VERT = /* glsl */ `
uniform vec2 uCenter;
uniform float uExtent;
varying vec2 vUV;
varying vec3 vWorld;
void main() {
  vec2 uv = uCenter + position.xy * uExtent;
  vUV = uv;
  vec4 w = modelMatrix * vec4(uv, 0.0, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uMinor;     // fixed mode: minor spacing (0 => adaptive)
uniform float uMajor;     // fixed mode: major spacing
uniform float uDpr;       // device px per CSS px
uniform float uT0;        // adaptive: minimum on-screen spacing (CSS px)
uniform float uT1;        // adaptive: spacing at which a level is fully shown
uniform vec2 uCenter;
uniform float uExtent;
uniform float uRadialFade;
uniform vec3 uNormal;
uniform vec3 uEye;
uniform float uOrtho;
uniform vec3 uViewDir;
varying vec2 vUV;
varying vec3 vWorld;

// 1 CSS px wide anti-aliased line every s units of coordinate c; g = |grad c| (units / device px)
float lineCov(float c, float g, float s) {
  float d = abs(c - s * floor(c / s + 0.5)) / max(g, 1e-12);
  return clamp(1.0 - d / uDpr, 0.0, 1.0);
}
float gridCov(vec2 uv, float gu, float gv, float s) {
  return max(lineCov(uv.x, gu, s), lineCov(uv.y, gv, s));
}

void main() {
  float gu = length(vec2(dFdx(vUV.x), dFdy(vUV.x)));
  float gv = length(vec2(dFdx(vUV.y), dFdy(vUV.y)));
  float g = max(gu, gv) * uDpr;          // world units per CSS px in the most compressed direction
  float a = 0.0;
  if (uMajor > 0.0) {
    float cMin = gridCov(vUV, gu, gv, uMinor) * smoothstep(5.0, 12.0, uMinor / g) * 0.55;
    float cMaj = gridCov(vUV, gu, gv, uMajor) * smoothstep(5.0, 12.0, uMajor / g);
    a = max(cMin, cMaj);
  } else {
    float target = uT0 * g;
    float e = pow(10.0, floor(log(max(target, 1e-9)) / log(10.0)));
    float s0 = e;
    if (s0 < target * 0.9999) s0 = 5.0 * e;
    if (s0 < target * 0.9999) s0 = 10.0 * e;
    float s1 = abs(s0 / e - 5.0) < 0.5 ? 10.0 * e : 5.0 * s0;
    float w0 = smoothstep(uT0, uT1, s0 / g);
    a = max(gridCov(vUV, gu, gv, s0) * w0, gridCov(vUV, gu, gv, s1));
  }
  // perspective: fade towards the edge of the drawn patch (the horizon)
  if (uRadialFade > 0.5) {
    float r = length(vUV - uCenter) / uExtent;
    a *= 1.0 - smoothstep(0.6, 1.0, r);
  }
  // fade when the plane is seen edge-on
  vec3 vd = uOrtho > 0.5 ? uViewDir : normalize(vWorld - uEye);
  float facing = abs(dot(vd, uNormal));
  a *= smoothstep(0.02, 0.18, facing);
  a *= uAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor, a);
}`;

/** Adaptive grid spacing (1-5-10 sequence) for `g` world units per CSS px: [level, next level]. */
export function adaptiveSpacing(g, t0 = 45) {
  const target = Math.max(1e-9, t0 * g);
  const e = Math.pow(10, Math.floor(Math.log10(target)));
  let s0 = e;
  if (s0 < target * 0.9999) s0 = 5 * e;
  if (s0 < target * 0.9999) s0 = 10 * e;
  const s1 = Math.abs(s0 / e - 5) < 0.5 ? 10 * e : 5 * s0;
  return [s0, s1];
}

let glyphTex = null;
/** Origin glyph: grey ring with the +X+Y and -X-Y quadrants filled (texture u = +X, v = +Y). */
function glyphTexture() {
  if (glyphTex) return glyphTex;
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const cx = S / 2, r = S / 2 - 5;
  g.fillStyle = "#ffffff";
  g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#b2b2b2";
  // canvas y grows downwards; the texture is not flipped (flipY default) so canvas up = +v = +Y
  g.beginPath(); g.moveTo(cx, cx); g.arc(cx, cx, r, -Math.PI / 2, 0); g.closePath(); g.fill();          // +X +Y
  g.beginPath(); g.moveTo(cx, cx); g.arc(cx, cx, r, Math.PI / 2, Math.PI); g.closePath(); g.fill();     // -X -Y
  g.lineWidth = 9;
  g.strokeStyle = "#a2a2a2";
  g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.stroke();
  glyphTex = new THREE.CanvasTexture(c);
  glyphTex.colorSpace = THREE.SRGBColorSpace;
  glyphTex.anisotropy = 4;
  return glyphTex;
}

export class LayoutGrid {
  constructor() {
    this.uniforms = {
      uColor: { value: new THREE.Color(0x333333) },
      uAlpha: { value: 0.08 },
      uMinor: { value: 0 },
      uMajor: { value: 0 },
      uDpr: { value: 1 },
      uT0: { value: 45 },
      uT1: { value: 75 },
      uCenter: { value: new THREE.Vector2() },
      uExtent: { value: 1000 },
      uRadialFade: { value: 1 },
      uNormal: { value: new THREE.Vector3(0, 0, 1) },
      uEye: { value: new THREE.Vector3() },
      uOrtho: { value: 0 },
      uViewDir: { value: new THREE.Vector3(0, 0, -1) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    mat.extensions = { derivatives: true };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = "layout-grid";
    this.mesh.userData.noPick = true;

    // red X / green Y axis lines through the grid origin (unit segments scaled to cover the view)
    this.axes = new THREE.Group();
    this.axes.name = "grid-axes";
    this.axes.matrixAutoUpdate = false;
    this.axes.userData.noPick = true;
    const axisLine = (dir, color) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...dir.map((v) => -v)), new THREE.Vector3(...dir)]);
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false });
      const l = new THREE.Line(geo, m);
      l.frustumCulled = false;
      l.renderOrder = -9;
      l.userData.noPick = true;
      return l;
    };
    this.xAxis = axisLine([1, 0, 0], 0xff0000);
    this.yAxis = axisLine([0, 1, 0], 0x00e600);
    // model / plane-pick view: faint lines (ref 01: X ~rgb(245,200,205), Y ~rgb(206,253,211) over
    // white); sketch view: a little stronger, Y a thin light green ~rgb(149,251,141) (ref 07)
    this.axisOpacity = [0.31, 0.25];
    this.sketchAxisOpacity = [0.58, 0.42];
    this.axisScale = new THREE.Group();
    this.axisScale.add(this.xAxis, this.yAxis);
    this.axes.add(this.axisScale);

    // origin glyph (screen-size constant disc lying in the grid plane)
    this.glyph = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glyphTexture(), transparent: true, depthWrite: false, alphaTest: 0.02 }));
    this.glyph.renderOrder = -9.5; // under the axis lines (they show through it in Fusion)
    this.glyph.userData.noPick = true;
    this.axes.add(this.glyph);
    this.glyphPx = 19;

    this.plane = { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    this.settings = { adaptive: true, major: 50, subdivisions: 5, lock: false };
    this.lockedS0 = null;
    this.s0 = 50;
    this.mode = "model";
    this.labels = null; // {layer, el, pool, cache}
    this.setPlane(this.plane);
  }

  setPlane(pl) {
    this.plane = pl || { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const o = new THREE.Vector3(...this.plane.o);
    const x = new THREE.Vector3(...this.plane.x).normalize();
    const n = new THREE.Vector3(...this.plane.n).normalize();
    const y = new THREE.Vector3().crossVectors(n, x).normalize();
    const m = new THREE.Matrix4().makeBasis(x, y, n);
    m.setPosition(o);
    this.mesh.matrix.copy(m);
    this.mesh.matrixWorldNeedsUpdate = true;
    this.axes.matrix.copy(m);
    this.axes.matrixWorldNeedsUpdate = true;
    this.uniforms.uNormal.value.copy(n);
    this._basis = { o, x, y, n };
  }

  /** 'model' (layout grid) or 'sketch' (fainter sketch grid). */
  setMode(mode) {
    this.mode = mode === "sketch" ? "sketch" : "model";
    this.uniforms.uAlpha.value = this.mode === "sketch" ? this.sketchAlpha : this.modelAlpha;
    // the sketch's axes are drawn a little stronger than the layout grid's (reference captures)
    const o = this.mode === "sketch" ? this.sketchAxisOpacity : this.axisOpacity;
    this.xAxis.material.opacity = Math.min(1, o[0]);
    this.yAxis.material.opacity = Math.min(1, o[1]);
  }

  /** Current snapping step (world units): the minor spacing (a fifth of the displayed level). */
  spacing() {
    if (!this.settings.adaptive) return this.settings.major / Math.max(1, this.settings.subdivisions);
    return this.s0 / 5;
  }

  /** Displayed line spacing (world units). */
  majorSpacing() {
    if (!this.settings.adaptive) return this.settings.major;
    return this.s0;
  }

  /** Plane -> screen affine data at the grid origin: {p0:[x,y], ex, ey (px per mm), gu, gv (mm per px)}. */
  _screenFrame(project, b = this._basis) {
    const p0 = project(b.o.toArray());
    const px = project(b.o.clone().add(b.x).toArray());
    const py = project(b.o.clone().add(b.y).toArray());
    const ex = [px[0] - p0[0], px[1] - p0[1]];
    const ey = [py[0] - p0[0], py[1] - p0[1]];
    const det = ex[0] * ey[1] - ex[1] * ey[0];
    if (Math.abs(det) < 1e-12) return { p0, ex, ey, gu: Infinity, gv: Infinity, det: 0 };
    // inverse of [ex ey] (columns): rows = grad u, grad v (mm per px)
    const gu = Math.hypot(ey[1] / det, -ey[0] / det);
    const gv = Math.hypot(-ex[1] / det, ex[0] / det);
    return { p0, ex, ey, gu, gv, det };
  }

  /** Update per-frame uniforms from the camera rig. `ctx` = {project, dpr}. */
  update(rig, ctx = {}) {
    const b = this._basis;
    const eye = rig.position();
    const tgt = rig.target;
    const f = rig.forward();
    // centre of the drawn patch: target projected on the plane
    const d = new THREE.Vector3().subVectors(tgt, b.o);
    const dn = d.dot(b.n);
    const tp = new THREE.Vector3().copy(tgt).addScaledVector(b.n, -dn);
    const rel = new THREE.Vector3().subVectors(tp, b.o);
    const cu = rel.dot(b.x), cv = rel.dot(b.y);
    const ps = rig.pixelSize(tp);
    const dpr = ctx.dpr || 1;
    this.uniforms.uDpr.value = dpr;
    // displayed spacing for labels / snapping, from the plane's screen mapping at the target
    let g = ps;
    if (ctx.project) {
      const fr = this._screenFrame(ctx.project);
      if (isFinite(fr.gu) && isFinite(fr.gv)) g = Math.max(fr.gu, fr.gv);
      this._frame = fr;
    }
    // facing-limited: an almost edge-on plane would pick absurd levels; clamp to 8x the pixel size
    g = Math.min(g, ps * 8);
    let s0 = adaptiveSpacing(g, this.uniforms.uT0.value)[0];
    if (this.settings.lock && this.lockedS0) s0 = this.lockedS0;
    else this.lockedS0 = s0;
    this.s0 = s0;
    if (this.settings.adaptive) {
      this.uniforms.uMinor.value = 0;
      this.uniforms.uMajor.value = 0;
      if (this.settings.lock && this.lockedS0) {
        this.uniforms.uMajor.value = this.lockedS0;
        this.uniforms.uMinor.value = this.lockedS0;
      }
    } else {
      this.uniforms.uMajor.value = Math.max(1e-6, this.settings.major);
      this.uniforms.uMinor.value = Math.max(1e-6, this.settings.major / Math.max(1, this.settings.subdivisions));
    }
    // patch extent: in orthographic views cover the whole viewport (no visible fade), in perspective
    // a large disc fading towards the horizon
    const facing = Math.abs(f.dot(b.n));
    let span;
    if (rig.useOrtho && facing > 0.02) {
      const hh = rig.halfHeight(), hw = hh * (rig.width / rig.height);
      const r = rig.right(), u = rig.up();
      let m = 0;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const o = tgt.clone().addScaledVector(r, sx * hw).addScaledVector(u, sy * hh);
        const t = (b.o.clone().sub(o)).dot(b.n) / f.dot(b.n);
        const p = o.addScaledVector(f, t).sub(b.o);
        m = Math.max(m, Math.hypot(p.dot(b.x) - cu, p.dot(b.y) - cv));
      }
      span = Math.min(m * 1.15 + ps * 20, hh * 400);
      this.uniforms.uRadialFade.value = 0;
    } else {
      span = Math.max(rig.dist * 2.2, ps * Math.max(rig.width, rig.height) * 0.9, Math.abs(dn) * 2.5);
      this.uniforms.uRadialFade.value = 1;
    }
    // snap the patch centre to a coarse spacing so the fade ring does not swim
    const snap = s0 * 100;
    this.uniforms.uCenter.value.set(Math.round(cu / snap) * snap, Math.round(cv / snap) * snap);
    this.uniforms.uExtent.value = span + snap;
    this.uniforms.uEye.value.copy(eye);
    this.uniforms.uOrtho.value = rig.useOrtho ? 1 : 0;
    this.uniforms.uViewDir.value.copy(f);
    // axis lines long enough to leave the view; origin glyph a constant size on screen
    // (in perspective keep both ends in front of the camera: lines crossing the eye plane vanish
    // on some GL implementations)
    const L = Math.max(span * 2, rig.dist * 4, 1);
    const near = rig.camera.near || 1e-3;
    const fitLine = (line, dir) => {
      let tn = -L, tp = L;
      if (!rig.useOrtho) {
        const d0 = new THREE.Vector3().subVectors(b.o, eye).dot(f);
        const k = dir.dot(f);
        const lim = (d0 - near * 3) / Math.max(1e-9, Math.abs(k));
        if (k < -1e-9) tp = Math.min(tp, Math.max(0, lim));
        if (k > 1e-9) tn = Math.max(tn, -Math.max(0, lim));
      }
      const a = line.geometry.attributes.position;
      const u = line === this.xAxis ? 0 : 1;
      a.setXYZ(0, u === 0 ? tn : 0, u === 1 ? tn : 0, 0);
      a.setXYZ(1, u === 0 ? tp : 0, u === 1 ? tp : 0, 0);
      a.needsUpdate = true;
    };
    fitLine(this.xAxis, b.x);
    fitLine(this.yAxis, b.y);
    this.axisScale.scale.set(1, 1, 1);
    this.axisScale.updateMatrix();
    const psO = rig.pixelSize(b.o);
    this.glyph.scale.setScalar(psO * this.glyphPx);
    this.glyph.updateMatrix();
    this.axes.updateMatrixWorld(true);
  }

  setColor(hex, opacity, sketchOpacity) {
    this.uniforms.uColor.value.set(hex);
    if (opacity != null) this.modelAlpha = opacity;
    if (sketchOpacity != null) this.sketchAlpha = sketchOpacity;
    this.setMode(this.mode);
  }

  setAxisColors(x, y, opacity = [0.31, 0.25], sketchOpacity = null) {
    this.xAxis.material.color.set(x);
    this.yAxis.material.color.set(y);
    this.axisOpacity = Array.isArray(opacity) ? opacity : [opacity, opacity];
    if (sketchOpacity != null) this.sketchAxisOpacity = Array.isArray(sketchOpacity) ? sketchOpacity : [sketchOpacity, sketchOpacity];
    this.setMode(this.mode);
  }

  // ---------------------------------------------------------------- grid numbers
  /** Attach the HTML layer used for grid numbers. */
  attachLabels(layer) {
    const el = document.createElement("div");
    el.className = "vp-grid-labels";
    layer.appendChild(el);
    this.labels = { layer, el, pool: [], widths: new Map(), sig: "" };
  }

  hideLabels() {
    if (!this.labels || !this.labels.sig) return;
    this.labels.el.style.display = "none";
    this.labels.sig = "";
  }

  /**
   * Draw the grid numbers for the current view. `project(p) -> [x, y]` in canvas CSS px;
   * size = {w, h}; ps = world size of one CSS px at the target.
   */
  updateLabels(project, size, ps, plane = null) {
    const L = this.labels;
    if (!L) return;
    let basis = this._basis;
    if (plane) {
      const o = new THREE.Vector3(...plane.o), x = new THREE.Vector3(...plane.x).normalize(), n = new THREE.Vector3(...plane.n).normalize();
      basis = { o, x, y: new THREE.Vector3().crossVectors(n, x).normalize(), n };
    }
    const fr = this._screenFrame(project, basis);
    if (!fr.det || Math.abs(fr.det) < 1e-9) { this.hideLabels(); return; }
    const s = this.majorSpacing();
    if (!(s > 0)) { this.hideLabels(); return; }
    const { p0, ex, ey } = fr;
    const nrm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
    const uX = nrm(ex), uY = nrm(ey);
    // screen-space text whose baseline follows the plane's Y axis on screen, kept readable
    // (top view: every number reads top-to-bottom, glyph tops towards +X — reference capture)
    let r = [-uY[0], -uY[1]];
    if (r[0] < -1e-6 || (Math.abs(r[0]) <= 1e-6 && r[1] < 0)) r = [-r[0], -r[1]];
    const ang = Math.atan2(r[1], r[0]);
    const at = (u, v) => [p0[0] + ex[0] * u + ey[0] * v, p0[1] + ex[1] * u + ey[1] * v];
    const items = [];
    const onScreen = (p, m = 40) => p[0] > -m && p[0] < size.w + m && p[1] > -m && p[1] < size.h + m;
    const fmt = (v) => String(Math.round(v * 1000) / 1000);
    const H = 11; // text box thickness (px)
    // X axis: negative values, beside the grid line on its far side, starting just past the axis
    for (let k = 1; k < 400; k++) {
      const v = -k * s;
      const p = at(v, 0);
      if (!onScreen(p)) { if (k > 3 && !onScreen(at(v + s, 0), 4000)) break; continue; }
      const text = fmt(v);
      const len = this._textWidth(text);
      const a = 3 + H / 2, b = 3.5 + len / 2;
      items.push({ text, x: p[0] - uX[0] * a - uY[0] * b, y: p[1] - uX[1] * a - uY[1] * b });
    }
    // Y axis: positive values, on the +X side of the axis, ending just before the grid line
    for (let k = 1; k < 400; k++) {
      const v = k * s;
      const p = at(0, v);
      if (!onScreen(p)) { if (k > 3 && !onScreen(at(0, v - s), 4000)) break; continue; }
      const text = fmt(v);
      const len = this._textWidth(text);
      const a = 4.75 + H / 2, b = 3 + len / 2;
      items.push({ text, x: p[0] + uX[0] * a + uY[0] * b, y: p[1] + uX[1] * a + uY[1] * b });
    }
    const m = (it) => `translate(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px) rotate(${ang.toFixed(4)}rad) translate(-50%,-50%)`;
    const sig = items.map((it) => `${it.text}@${m(it)}`).join("|");
    if (sig === L.sig) return;
    L.sig = sig;
    L.el.style.display = "";
    while (L.pool.length < items.length) {
      const d = document.createElement("div");
      d.className = "vp-grid-label";
      L.el.appendChild(d);
      L.pool.push(d);
    }
    L.pool.forEach((d, i) => {
      const it = items[i];
      if (!it) { d.style.display = "none"; return; }
      d.style.display = "";
      if (d.textContent !== it.text) d.textContent = it.text;
      d.style.transform = m(it);
    });
  }

  _textWidth(text) {
    const L = this.labels;
    let w = L.widths.get(text);
    if (w == null) {
      const c = this._measure || (this._measure = document.createElement("canvas").getContext("2d"));
      const font = getComputedStyle(L.el).fontFamily || "Segoe UI, Arial, sans-serif";
      c.font = `15px ${font}`;
      w = c.measureText(text).width;
      L.widths.set(text, w);
    }
    return w;
  }
}

LayoutGrid.prototype.modelAlpha = 0.07;
LayoutGrid.prototype.sketchAlpha = 0.025;
