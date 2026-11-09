// On-canvas manipulators for command dialogs, drawn like Fusion's:
//  * distance: a flat screen-facing block arrow (white with a dark outline; blue with a white rim
//    while it is the active one), dragged along its 3D line;
//  * angle / taper: a thin arc with a round grip lying in the rotation plane, dragged around the axis.
//  * Move/Copy triad parts: long axis-coloured arrows (distance type, look:"axis"), planar square
//    handles and a free-move ball (type "plane"), axis-coloured rotation ring segments (angle type
//    with screenRadius / span / gripAt / color).
// Only the ACTIVE manipulator shows its value box (the HUD: an underlined input with a grip on the
// left and a ⋮ menu on the right). Tab / Shift+Tab move the HUD to the next / previous manipulator.
// Everything lives in app.viewport.groups.overlay and keeps a constant screen size.
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { V, niceStep } from "./util.js";

const BLUE = 0x1f80e6, BLUE_HOVER = 0x4da3f5, WHITE = 0xffffff, WHITE_HOVER = 0xd6ebff, OUTLINE = 0x1c1c1c;
const ARROW = [[-5, 0], [5, 0], [5, 14], [11, 14], [0, 26], [-11, 14], [-5, 14]]; // px, tip along +y
const ARROW_LEN = 26;
const GRIP_R = 7.5; // px
const TAPER_R = 82; // px: radius of the taper arc
const HUD_DX = 128, HUD_DY = 40; // HUD box offset from the manipulator base (Fusion places it below-right)

/** Offset a simple polygon (counter-clockwise) by d (px, + = outward) with mitred corners. */
function offsetPoly(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const s = area > 0 ? 1 : -1; // outward normal sign
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n], c = pts[i], q = pts[(i + 1) % n];
    const e1 = norm2([c[0] - p[0], c[1] - p[1]]), e2 = norm2([q[0] - c[0], q[1] - c[1]]);
    const n1 = [e1[1] * s, -e1[0] * s], n2 = [e2[1] * s, -e2[0] * s];
    const m = norm2([n1[0] + n2[0], n1[1] + n2[1]]);
    const k = d / Math.max(0.25, m[0] * n1[0] + m[1] * n1[1]);
    out.push([c[0] + m[0] * k, c[1] + m[1] * k]);
  }
  return out;
}
function rayPlane(ray, p, n) {
  const den = V.dot(ray.d, n);
  if (Math.abs(den) < 1e-6) return null;
  const t = V.dot(V.sub(p, ray.o), n) / den;
  return V.add(ray.o, V.mul(ray.d, t));
}
function norm2(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
function shapeGeo(pts) { return new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))); }
function basicMat(color, order) {
  const m = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide });
  return m;
}

function arrowObject() {
  const g = new THREE.Group();
  const outline = new THREE.Mesh(shapeGeo(offsetPoly(ARROW, 1.4)), basicMat(OUTLINE));
  const body = new THREE.Mesh(shapeGeo(ARROW), basicMat(WHITE));
  const core = new THREE.Mesh(shapeGeo(offsetPoly(ARROW, -2)), basicMat(BLUE));
  outline.renderOrder = 1000; body.renderOrder = 1001; core.renderOrder = 1002;
  g.add(outline, body, core);
  g.userData = { outline, body, core };
  return g;
}

function gripObject() {
  const g = new THREE.Group();
  const outline = new THREE.Mesh(new THREE.CircleGeometry(GRIP_R + 1.4, 32), basicMat(OUTLINE));
  const body = new THREE.Mesh(new THREE.CircleGeometry(GRIP_R, 32), basicMat(WHITE));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(1.9, 16), basicMat(OUTLINE));
  outline.renderOrder = 1003; body.renderOrder = 1004; dot.renderOrder = 1005;
  dot.position.z = 0.01; body.position.z = 0.005;
  g.add(outline, body, dot);
  g.userData = { outline, body, dot };
  return g;
}

function pointObject() {
  const g = new THREE.Group();
  const outline = new THREE.Mesh(new THREE.CircleGeometry(8.6, 32), basicMat(OUTLINE));
  const body = new THREE.Mesh(new THREE.CircleGeometry(7.4, 32), basicMat(WHITE));
  const core = new THREE.Mesh(new THREE.CircleGeometry(5.4, 32), basicMat(BLUE));
  outline.renderOrder = 1003; body.renderOrder = 1004; core.renderOrder = 1005;
  body.position.z = 0.005; core.position.z = 0.01;
  g.add(outline, body, core);
  g.userData = { outline, body, core };
  return g;
}

function lighter(hex, f = 0.35) { return new THREE.Color(hex).lerp(new THREE.Color(0xffffff), f).getHex(); }

/** Triad axis arrow along local +Y (units: px): thin shaft from `gap` to the cone, cone head at `len`. */
function axisArrowObject(color, len, gap) {
  const g = new THREE.Group();
  const head = 15, shaftLen = Math.max(1, len - head - gap);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, shaftLen, 10), basicMat(color));
  shaft.position.y = gap + shaftLen / 2;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(5.2, head, 20), basicMat(color));
  cone.position.y = len - head / 2;
  shaft.renderOrder = 1001; cone.renderOrder = 1001;
  g.add(shaft, cone);
  g.userData = { parts: [shaft, cone] };
  return g;
}

/** Planar handle: a small translucent square with a darker rim, lying in its plane (local XY). */
function squareObject(color) {
  const g = new THREE.Group();
  const S = 11;
  const rim = new THREE.Mesh(new THREE.PlaneGeometry(S + 2, S + 2), basicMat(color));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(S, S), basicMat(lighter(color, 0.45)));
  rim.material.opacity = 0.9; fill.material.opacity = 0.7;
  rim.renderOrder = 1001; fill.renderOrder = 1002; fill.position.z = 0.01;
  g.add(rim, fill);
  g.userData = { parts: [rim, fill], fill };
  return g;
}

/** Free-move handle: a white ball with a dark rim at the triad centre (screen facing). */
function ballObject() {
  const g = new THREE.Group();
  const outline = new THREE.Mesh(new THREE.CircleGeometry(7.6, 32), basicMat(OUTLINE));
  const body = new THREE.Mesh(new THREE.CircleGeometry(6.4, 32), basicMat(WHITE));
  outline.renderOrder = 1003; body.renderOrder = 1004; body.position.z = 0.005;
  g.add(outline, body);
  g.userData = { outline, body, core: body };
  return g;
}

export class Manipulators {
  constructor(app, dlg) {
    this.app = app;
    this.dlg = dlg;
    this.items = new Map();
    this.order = [];
    this.active = null;
    this.hover = null;
    this.drag = null;
    this.group = new THREE.Group();
    this.group.name = "dlg-manipulators";
    this.group.renderOrder = 1000;
    this.lineMats = [];
    const vp = app.viewport;
    if (vp && vp.groups && vp.groups.overlay) vp.groups.overlay.add(this.group);
    this._offCam = app.on("camera", () => this.layout());
  }

  /**
   * defs: [{id, type:'distance'|'angle'|'taper', value:number, text, onDrag(v, final), onText(str, final),
   *   distance: origin, dir, scale?, min?, max?, fixedDir?
   *   angle:    center, axis, ref, radius (world)            (revolve)
   *   taper:    center, up (extrude dir), side (in-plane dir), hudAnchor?   (screen-sized arc)
   *   hudAnchor?: world point the HUD box is placed next to (default: the manipulator base)}]
   */
  set(defs) {
    const seen = new Set();
    const order = [];
    for (const d of defs || []) {
      if (!d || !Number.isFinite(d.value)) continue;
      const ok = d.type === "angle" ? d.center && d.axis && d.ref && d.radius > 0
        : d.type === "taper" ? d.center && d.up && d.side
          : d.type === "point" ? d.point && d.normal
            : d.type === "plane" ? d.center && (d.look === "ball" || d.look === "point" || (d.a && d.b))
              : d.origin && d.dir;
      if (!ok) continue;
      seen.add(d.id);
      order.push(d.id);
      let it = this.items.get(d.id);
      if (it && it.type !== d.type) { this._dispose(it); this.items.delete(d.id); it = null; }
      if (!it) { it = this._create(d); this.items.set(d.id, it); }
      if (this.drag && this.drag.item === it) it.def = { ...d, value: it.def.value, text: it.def.text, origin: it.def.origin ?? d.origin };
      else it.def = { ...d };
      if (it.box && document.activeElement !== it.box) {
        it.box.value = it.def.text ?? "";
        this._validate(it);
      }
    }
    for (const [id, it] of this.items) if (!seen.has(id)) { this._dispose(it); this.items.delete(id); }
    this.order = order;
    if (!this.active || !this.items.has(this.active)) this.active = order.find((id) => this.items.get(id).box) || order[0] || null;
    this.layout(true);
  }

  clear() { this.set([]); }
  get size() { return this.items.size; }

  _create(d) {
    const it = { def: d, type: d.type, box: null, hud: null };
    if (d.type === "distance" && d.look === "axis") {
      it.obj = axisArrowObject(d.color ?? BLUE, d.len || 90, d.gap || 12);
      this.group.add(it.obj);
    } else if (d.type === "distance") {
      it.obj = arrowObject();
      this.group.add(it.obj);
    } else if (d.type === "plane") {
      it.obj = d.look === "ball" ? ballObject() : d.look === "point" ? pointObject() : squareObject(d.color ?? BLUE);
      this.group.add(it.obj);
    } else if (d.type === "point") {
      it.obj = pointObject();
      this.group.add(it.obj);
    } else {
      it.grip = gripObject();
      const mat = new LineMaterial({ color: 0xffffff, linewidth: d.lineWidth || 1.3, vertexColors: true, depthTest: false, depthWrite: false, transparent: true });
      const c = this.app.viewport && this.app.viewport.canvas;
      mat.resolution.set((c && c.clientWidth) || 1, (c && c.clientHeight) || 1);
      this.lineMats.push(mat);
      it.arc = new Line2(new LineGeometry(), mat);
      it.arc.renderOrder = 999;
      it.arc.frustumCulled = false;
      it.obj = new THREE.Group();
      it.obj.add(it.arc, it.grip);
      if (d.type === "taper") {
        // the four small radial ticks Fusion shows around an active taper handle
        it.ticks = [];
        for (let i = 0; i < 4; i++) {
          const t = new THREE.Group();
          const o = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 9.4), basicMat(OUTLINE));
          const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 7.2), basicMat(WHITE));
          o.renderOrder = 1001; w.renderOrder = 1002; w.position.z = 0.01;
          t.add(o, w);
          it.ticks.push(t);
          it.obj.add(t);
        }
      }
      this.group.add(it.obj);
    }
    if (d.box !== false && this.app.viewport && this.app.viewport.labelLayer) this._createHud(it, d);
    return it;
  }

  _createHud(it, d) {
    const hud = document.createElement("div");
    hud.className = "dlg-hud";
    hud.style.display = "none";
    const grip = document.createElement("span");
    grip.className = "dlg-hud-grip";
    const box = document.createElement("input");
    box.className = "dlg-manip-input";
    box.spellcheck = false;
    box.autocomplete = "off";
    box.setAttribute("data-manip", d.id);
    const more = document.createElement("button");
    more.type = "button";
    more.className = "dlg-hud-more";
    more.title = "More";
    more.innerHTML = `<svg width="4" height="14" viewBox="0 0 4 14" aria-hidden="true"><circle cx="2" cy="2" r="1.4" fill="currentColor"/><circle cx="2" cy="7" r="1.4" fill="currentColor"/><circle cx="2" cy="12" r="1.4" fill="currentColor"/></svg>`;
    hud.append(grip, box, more);
    for (const el of [box, more, grip]) el.addEventListener("pointerdown", (e) => e.stopPropagation());
    // select everything when the box gets focus (synchronously: a deferred select-all would swallow
    // characters typed right after focusing); a first click keeps that selection.
    box.addEventListener("mousedown", (e) => { if (document.activeElement !== box) { e.preventDefault(); box.focus(); } });
    box.addEventListener("focus", () => { this.active = it.def.id; box.select(); this.layout(true); });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (it.def.onText) it.def.onText(box.value, true);
        if (e.ctrlKey || e.metaKey || !it.def.enterStays) { box.blur(); this.dlg && this.dlg.ok(); }
      } else if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        if (it.def.onText) it.def.onText(box.value, true);
        this.cycle(e.shiftKey ? -1 : 1, true);
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const v = Number.parseFloat(box.value);
        if (!Number.isFinite(v) || !it.def.onDrag) return;
        e.preventDefault();
        const txt = it.def.onDrag(it.def.value + (e.key === "ArrowUp" ? 1 : -1) * (it.def.step || 1), true);
        if (typeof txt === "string") { box.value = txt; box.select(); }
      }
    });
    box.addEventListener("input", () => { if (it.def.onText) it.def.onText(box.value, false); this._validate(it); });
    box.addEventListener("change", () => { if (it.def.onText) it.def.onText(box.value, true); });
    more.addEventListener("click", (e) => { e.stopPropagation(); this._menu(it, more); });
    this.app.viewport.labelLayer.appendChild(hud);
    it.box = box;
    it.hud = hud;
  }

  _validate(it) {
    if (!it.box || !this.dlg || !it.def.field) return;
    const r = this.dlg.evalValue(it.def.field, this.dlg.withUnitFor(it.def.field, it.box.value), it.def.kind);
    it.box.classList.toggle("invalid", !r.ok);
    it.box.title = r.ok ? "" : r.error;
  }

  /** ⋮ menu of the HUD: model / user parameters to insert, reset. */
  _menu(it, anchor) {
    const dlg = this.dlg;
    if (!dlg || typeof dlg.openMenu !== "function") return;
    const items = [];
    let P = null;
    try { P = dlg.params(); } catch { /* ignore */ }
    const entries = P && P.entries ? [...P.entries.values()].filter((e) => !dlg.editId || e.owner !== dlg.editId) : [];
    for (const e of entries.slice(-14)) {
      let val = "";
      try { const v = P.value(e.name); val = Number.isFinite(v) ? `  (${dlg.fmt(v, e.kind || "length")})` : ""; } catch { val = ""; }
      items.push({ label: `${e.name}${val}`, run: () => { it.box.focus(); it.box.value = e.name; it.box.dispatchEvent(new Event("input")); it.box.select(); } });
    }
    if (!items.length) items.push({ label: "No parameters to reference yet", disabled: true });
    dlg.openMenu(anchor, items, { title: "Insert parameter" });
  }

  _dispose(it) {
    this.group.remove(it.obj);
    it.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    if (it.arc) this.lineMats = this.lineMats.filter((m) => m !== it.arc.material);
    if (it.hud) it.hud.remove();
    if (this.hover === it) this.hover = null;
    if (this.drag && this.drag.item === it) this.drag = null;
  }

  dispose() {
    for (const it of this.items.values()) this._dispose(it);
    this.items.clear();
    this.order = [];
    if (this.group.parent) this.group.parent.remove(this.group);
    if (this._offCam) this._offCam();
    this.app.viewport && this.app.viewport.requestRender();
  }

  // ------------------------------------------------------------------ geometry
  _px(p) { return (this.app.viewport && this.app.viewport.pixelSize(p)) || 0.1; }

  /** Distance arrow: world base point + world direction it points to. */
  _arrow(it) {
    const d = it.def;
    const sc = d.scale ?? 1;
    const base = V.add(d.origin, V.mul(d.dir, d.value * sc));
    const sgn = d.value < 0 && !d.fixedDir ? -1 : 1;
    return { base, dir: V.mul(d.dir, sgn) };
  }

  /** Angle / taper: centre, unit vectors (u = angle 0, w = +90 deg), radius (world) and value in degrees. */
  _circle(it) {
    const d = it.def;
    if (d.type === "taper") {
      const r = TAPER_R * this._px(d.center);
      return { c: d.center, u: V.norm(d.up), w: V.norm(d.side), r, a0: -48, a1: 62 };
    }
    const k = V.norm(d.axis), u = V.norm(d.ref);
    const w = V.cross(k, u);
    const v = d.value;
    const r = d.screenRadius ? d.screenRadius * this._px(d.center) : d.radius;
    if (d.span !== undefined) { const g = (d.gripAt || 0) + v; return { c: d.center, u, w, r, a0: g - d.span, a1: g + d.span }; }
    return { c: d.center, u, w, r, a0: Math.min(0, v), a1: Math.max(0, v) };
  }
  /** Angle (deg) of the grip on its circle. */
  _gripAngle(it) { return (it.def.type === "angle" ? it.def.gripAt || 0 : 0) + it.def.value; }
  /** World position of a planar / free-move handle (kept a constant screen distance from the centre). */
  _planePoint(it) {
    const d = it.def;
    if (!d.offPx) return d.center;
    const ps = this._px(d.center);
    if (d.offDir) return V.add(d.center, V.mul(V.norm(d.offDir), d.offPx * ps));
    if (d.look === "ball" || d.look === "point") return d.center;
    return V.add(d.center, V.mul(V.add(V.norm(d.a), V.norm(d.b)), d.offPx * ps));
  }
  _onCircle(cr, deg) {
    const t = (deg * Math.PI) / 180;
    return V.add(cr.c, V.add(V.mul(cr.u, cr.r * Math.cos(t)), V.mul(cr.w, cr.r * Math.sin(t))));
  }
  /** Screen point of the grip / arrow base used for the HUD box and tests. */
  _base(it) {
    if (it.type === "distance") return this._arrow(it).base;
    if (it.type === "point") return it.def.point;
    if (it.type === "plane") return this._planePoint(it);
    return this._onCircle(this._circle(it), this._gripAngle(it));
  }

  layout(force = false) {
    const vp = this.app.viewport;
    if (!vp) return;
    if (!this.items.size) { if (force) vp.requestRender(); return; }
    const cam = vp.camera;
    const c = vp.canvas;
    for (const m of this.lineMats) m.resolution.set((c && c.clientWidth) || 1, (c && c.clientHeight) || 1);
    for (const it of this.items.values()) {
      const isActive = this.active === it.def.id;
      const hot = this.hover === it || (this.drag && this.drag.item === it);
      if (it.type === "plane") {
        const o = it.obj;
        const p = this._planePoint(it);
        const ps = this._px(p);
        o.position.set(...p);
        o.scale.setScalar(ps);
        if (it.def.look === "ball") {
          o.quaternion.copy(cam.quaternion);
          o.userData.body.material.color.setHex(hot ? BLUE_HOVER : WHITE);
        } else if (it.def.look === "point") {
          o.quaternion.copy(cam.quaternion);
          o.userData.core.material.color.setHex(hot ? BLUE_HOVER : BLUE);
        } else {
          const a = V.norm(it.def.a), b = V.norm(it.def.b), n = V.cross(a, b);
          o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(...n)));
          o.userData.fill.material.color.setHex(hot ? 0xffe680 : lighter(it.def.color ?? BLUE, 0.45));
        }
        it.screen = { s0: vp.toScreen(p) };
      } else if (it.type === "distance" && it.def.look === "axis") {
        const { base, dir } = this._arrow(it);
        const ps = this._px(base);
        const o = it.obj;
        o.position.set(...base);
        o.scale.setScalar(ps);
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...V.norm(dir)));
        const col = hot ? 0xffd21f : it.def.color ?? BLUE;
        for (const m of o.userData.parts) m.material.color.setHex(col);
        const len = it.def.len || 90, gap = it.def.gap || 12;
        it.screen = { s0: vp.toScreen(base), seg: [vp.toScreen(V.add(base, V.mul(dir, gap * ps))), vp.toScreen(V.add(base, V.mul(dir, len * ps)))] };
      } else if (it.type === "point") {
        const o = it.obj;
        const ps = this._px(it.def.point);
        o.position.set(...it.def.point);
        o.scale.setScalar(ps);
        o.quaternion.copy(cam.quaternion);
        o.userData.core.material.color.setHex(hot ? BLUE_HOVER : BLUE);
        it.screen = { s0: vp.toScreen(it.def.point) };
      } else if (it.type === "distance") {
        const { base, dir } = this._arrow(it);
        const ps = this._px(base);
        const s0 = vp.toScreen(base), s1 = vp.toScreen(V.add(base, V.mul(dir, ps * 20)));
        let ang = Math.atan2(-(s1[1] - s0[1]), s1[0] - s0[0]);
        if (Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) < 2) ang = Math.PI / 2;
        it.screen = { s0, ang };
        const o = it.obj;
        o.position.set(...base);
        o.scale.setScalar(ps);
        o.quaternion.copy(cam.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang - Math.PI / 2));
        const u = o.userData;
        u.core.visible = isActive;
        u.body.material.color.setHex(hot && !isActive ? WHITE_HOVER : WHITE);
        u.core.material.color.setHex(hot ? BLUE_HOVER : BLUE);
      } else {
        const cr = this._circle(it);
        const pts = [], cols = [];
        const N = 48;
        const fadeEnd = it.type === "taper";
        const dark = it.def.color !== undefined ? new THREE.Color(hot ? 0xffd21f : it.def.color) : isActive ? new THREE.Color(0x2b6cb8) : new THREE.Color(0x2a2a2a);
        for (let i = 0; i <= N; i++) {
          const a = cr.a0 + ((cr.a1 - cr.a0) * i) / N;
          pts.push(...this._onCircle(cr, a));
          const f = fadeEnd ? Math.max(0, Math.min(1, (a - 20) / (cr.a1 - 20))) : 0;
          const col = dark.clone().lerp(new THREE.Color(0xe6e6e6), f * 0.9);
          cols.push(col.r, col.g, col.b);
        }
        it.arc.geometry.dispose();
        it.arc.geometry = new LineGeometry();
        it.arc.geometry.setPositions(pts);
        it.arc.geometry.setColors(cols);
        it.arc.computeLineDistances();
        it.arc.visible = cr.a1 - cr.a0 > 0.5;
        const gp = this._onCircle(cr, this._gripAngle(it));
        const ps = this._px(gp);
        const g = it.grip;
        g.position.set(...gp);
        g.scale.setScalar(ps);
        // the grip lies in the rotation plane (it reads as an ellipse in perspective, like Fusion's)
        const nrm = V.norm(V.cross(cr.u, cr.w));
        const camDir = vp.camera.getWorldDirection(new THREE.Vector3());
        const facing = Math.abs(camDir.dot(new THREE.Vector3(...nrm)));
        const nn = facing < 0.25 ? V.add(V.mul(nrm, 0.25), V.mul(camDir.toArray(), -0.97)) : nrm; // never fully edge-on
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...V.norm(nn)));
        const u = g.userData;
        if (it.def.color !== undefined) {
          u.body.material.color.setHex(hot ? 0xffd21f : it.def.color);
          u.dot.material.color.setHex(WHITE);
        } else {
          u.body.material.color.setHex(isActive ? (hot ? BLUE_HOVER : BLUE) : hot ? WHITE_HOVER : WHITE);
          u.dot.material.color.setHex(isActive ? WHITE : OUTLINE);
        }
        it.screen = { s0: vp.toScreen(gp) };
        if (it.ticks) {
          const kq = V.norm(nn);
          for (let i = 0; i < 4; i++) {
            const tk = it.ticks[i];
            tk.visible = isActive;
            if (!isActive) continue;
            const a = i * 90;
            const rad = V.norm(V.add(V.mul(cr.u, Math.cos((a * Math.PI) / 180)), V.mul(cr.w, Math.sin((a * Math.PI) / 180))));
            const pos = V.add(cr.c, V.mul(rad, cr.r + 15 * ps));
            const xa = V.norm(V.cross(rad, kq));
            const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...xa), new THREE.Vector3(...rad), new THREE.Vector3(...V.cross(xa, rad)));
            tk.quaternion.setFromRotationMatrix(m);
            tk.position.set(...pos);
            tk.scale.setScalar(this._px(pos));
          }
        }
      }
      this._placeHud(it, isActive);
    }
    vp.requestRender();
  }

  _placeHud(it, isActive) {
    if (!it.hud) return;
    const vp = this.app.viewport;
    const show = isActive && !it.def.hideBox;
    if (!show) { if (it.hud.style.display !== "none") it.hud.style.display = "none"; return; }
    const anchor = it.def.hudAnchor || this._base(it);
    const s = vp.toScreen(anchor);
    const visible = s[2] < 1 && s[2] > -1;
    it.hud.style.display = visible ? "" : "none";
    const W = it.hud.offsetWidth || 150, H = it.hud.offsetHeight || 22;
    const cw = (vp.canvas && vp.canvas.clientWidth) || 1e4, ch = (vp.canvas && vp.canvas.clientHeight) || 1e4;
    let x = s[0] + HUD_DX - 7, y = s[1] + HUD_DY;
    // keep clear of the docked command panel (it covers the right of the canvas)
    let right = cw - 4;
    try {
      const pr = this.dlg && this.dlg.el && this.dlg.el.isConnected ? this.dlg.el.getBoundingClientRect() : null;
      const cr = vp.canvas.getBoundingClientRect();
      if (pr && pr.width) {
        const pl = pr.left - cr.left, pt = pr.top - cr.top, pb = pr.bottom - cr.top;
        if (y + H > pt && y < pb) right = Math.min(right, pl - 10);
      }
    } catch { /* ignore */ }
    if (x + W > right) x = Math.min(right - W, s[0] - HUD_DX - W + 40);
    x = Math.max(4, Math.min(cw - W - 4, x));
    y = Math.max(4, Math.min(ch - H - 4, y));
    it.hud.style.left = `${Math.round(x)}px`;
    it.hud.style.top = `${Math.round(y)}px`;
  }

  // ------------------------------------------------------------------ interaction
  hitTest(x, y) {
    let best = null, bd = 11;
    for (const it of this.items.values()) {
      if (!it.screen) continue;
      let d;
      if (it.screen.seg) {
        const [a, b] = it.screen.seg;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const L2 = dx * dx + dy * dy || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
        d = Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t)) - (t > 0.75 ? 6 : 3);
      } else if (it.type === "distance") {
        const { s0, ang } = it.screen;
        const tx = s0[0] + Math.cos(ang) * ARROW_LEN, ty = s0[1] - Math.sin(ang) * ARROW_LEN;
        const dx = tx - s0[0], dy = ty - s0[1];
        const L2 = dx * dx + dy * dy || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - s0[0]) * dx + (y - s0[1]) * dy) / L2));
        d = Math.hypot(x - (s0[0] + dx * t), y - (s0[1] + dy * t)) - 4;
      } else {
        d = Math.hypot(x - it.screen.s0[0], y - it.screen.s0[1]) - 3;
      }
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  /** Parameter along the manipulator line closest to the mouse ray. */
  _lineParam(it, ray) {
    const P = it.def.origin, u = it.def.dir;
    const o = ray.o, d = V.norm(ray.d);
    const w0 = V.sub(o, P);
    const b = V.dot(d, u), dd = V.dot(d, w0), e = V.dot(u, w0);
    const den = 1 - b * b;
    if (den < 1e-6) return null;
    return (e - b * dd) / den;
  }

  /** Angle (deg) of the mouse ray's hit on the rotation plane. */
  _angleAt(it, ray) {
    const cr = this._circle(it);
    const k = V.norm(V.cross(cr.u, cr.w));
    const den = V.dot(ray.d, k);
    if (Math.abs(den) < 1e-6) return null;
    const t = V.dot(V.sub(cr.c, ray.o), k) / den;
    const w = V.sub(V.add(ray.o, V.mul(ray.d, t)), cr.c);
    return (Math.atan2(V.dot(w, cr.w), V.dot(w, cr.u)) * 180) / Math.PI;
  }

  down(ev, ctx) {
    const it = this.hitTest(ctx.x, ctx.y);
    if (!it) return false;
    if (it.box) this.active = it.def.id;
    if (it.type === "point") {
      this.drag = { item: it };
    } else if (it.type === "plane") {
      const p = this._planePoint(it);
      const n = this._dragNormal(it);
      const h0 = rayPlane(ctx.ray, p, n);
      if (!h0) return false;
      this.drag = { item: it, h0, n, start: it.def.getStart ? it.def.getStart() : null, dv: [0, 0, 0] };
    } else if (it.type !== "distance") {
      const a0 = this._angleAt(it, ctx.ray);
      if (a0 === null) return false;
      this.drag = { item: it, last: a0, acc: it.def.value };
    } else {
      const t0 = this._lineParam(it, ctx.ray);
      if (t0 === null) return false;
      this.drag = { item: it, t0, v0: it.def.value };
    }
    try { this.app.viewport.canvas.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    this.layout(true);
    return true;
  }

  _emitDrag(it, v) {
    if (v === it.def.value) return;
    it.def.value = v;
    if (it.def.onDrag) {
      const txt = it.def.onDrag(v, false);
      if (typeof txt === "string") { it.def.text = txt; if (it.box && document.activeElement !== it.box) it.box.value = txt; else if (it.box) { it.box.value = txt; it.box.select(); } }
    }
    this.layout(true);
  }

  /** Plane a planar / free-move handle is dragged in (the view plane for the free-move ball). */
  _dragNormal(it) {
    if (it.def.look === "ball" || it.def.look === "point" || !it.def.a) return this.app.viewport.camera.getWorldDirection(new THREE.Vector3()).toArray();
    return V.norm(V.cross(it.def.a, it.def.b));
  }

  move(ev, ctx) {
    if (this.drag && this.drag.item.type === "plane") {
      const it = this.drag.item;
      const h = rayPlane(ctx.ray, this.drag.h0, this.drag.n);
      if (!h) return true;
      this.drag.dv = V.sub(h, this.drag.h0);
      if (it.def.onDelta) it.def.onDelta(this.drag.dv, false, this.drag.start);
      this.layout(true);
      return true;
    }
    if (this.drag && this.drag.item.type === "point") {
      const it = this.drag.item;
      const n = V.norm(it.def.normal);
      const den = V.dot(ctx.ray.d, n);
      if (Math.abs(den) < 1e-6) return true;
      const t = V.dot(V.sub(it.def.point, ctx.ray.o), n) / den;
      if (!(t > 0)) return true;
      const p = V.add(ctx.ray.o, V.mul(ctx.ray.d, t));
      it.def.point = p;
      if (it.def.onMove) it.def.onMove(p, false);
      this.layout(true);
      return true;
    }
    if (this.drag && this.drag.item.type !== "distance") {
      const it = this.drag.item;
      const a = this._angleAt(it, ctx.ray);
      if (a === null) return true;
      let delta = a - this.drag.last;
      while (delta > 180) delta -= 360;
      while (delta <= -180) delta += 360;
      this.drag.last = a;
      this.drag.acc += delta;
      const step = it.def.step || 1;
      let v = Math.round(this.drag.acc / step) * step;
      if (it.def.min !== undefined) v = Math.max(it.def.min, v);
      if (it.def.max !== undefined) v = Math.min(it.def.max, v);
      this._emitDrag(it, v);
      return true;
    }
    if (this.drag) {
      const it = this.drag.item;
      const t = this._lineParam(it, ctx.ray);
      if (t === null) return true;
      const sc = it.def.scale ?? 1;
      const ps = this._px(this._arrow(it).base);
      const step = niceStep((ps * 2) / Math.abs(sc));
      let v = this.drag.v0 + (t - this.drag.t0) / sc;
      v = Math.round(v / step) * step;
      if (it.def.min !== undefined) v = Math.max(it.def.min, v);
      if (it.def.max !== undefined) v = Math.min(it.def.max, v);
      this._emitDrag(it, +v.toFixed(6));
      return true;
    }
    const h = this.hitTest(ctx.x, ctx.y);
    if (h !== this.hover) { this.hover = h; this.layout(true); }
    if (h) this.app.viewport.canvas.style.cursor = "pointer";
    return !!h;
  }

  up() {
    if (!this.drag) return false;
    const it = this.drag.item;
    const dr = this.drag;
    this.drag = null;
    if (it.type === "plane") {
      if (it.def.onDelta) it.def.onDelta(dr.dv, true, dr.start);
      this.layout(true);
      return true;
    }
    if (it.type === "point") {
      if (it.def.onMove) it.def.onMove(it.def.point, true);
      this.layout(true);
      this.focusActive();
      return true;
    }
    if (it.def.onDrag) {
      const txt = it.def.onDrag(it.def.value, true);
      if (typeof txt === "string") { it.def.text = txt; if (it.box) it.box.value = txt; }
    }
    this.layout(true);
    this.focusActive();
    return true;
  }

  /** The active manipulator's value box (type-to-edit target). */
  activeBox() {
    const it = this.active && this.items.get(this.active);
    if (it && it.box) return it.box;
    for (const id of this.order) { const x = this.items.get(id); if (x && x.box) return x.box; }
    return null;
  }
  firstBox() { return this.activeBox(); }

  /** Focus the active HUD box and select its text (so typing replaces the value). */
  focusActive() {
    const b = this.activeBox();
    if (!b) return false;
    this.layout(true);
    try { b.focus({ preventScroll: true }); } catch { b.focus(); }
    b.select();
    return document.activeElement === b;
  }

  /** Move the HUD to the next / previous manipulator (Tab / Shift+Tab). */
  cycle(step = 1, focus = true) {
    const ids = this.order.filter((id) => { const it = this.items.get(id); return it && it.box; });
    if (!ids.length) return;
    const i = Math.max(0, ids.indexOf(this.active));
    this.active = ids[(i + step + ids.length) % ids.length];
    this.layout(true);
    if (focus) this.focusActive();
  }

  setActive(id, focus = false) {
    if (!this.items.has(id)) return;
    this.active = id;
    this.layout(true);
    if (focus) this.focusActive();
  }

  /** Screen position of a manipulator's handle (tests / tooling): arrow middle or grip centre. */
  screenPoint(id) {
    const it = this.items.get(id);
    if (!it || !it.screen) return null;
    if (it.screen.seg) { const [a, b] = it.screen.seg; return [a[0] + (b[0] - a[0]) * 0.8, a[1] + (b[1] - a[1]) * 0.8]; }
    if (it.type !== "distance") return [it.screen.s0[0], it.screen.s0[1]];
    const { s0, ang } = it.screen;
    return [s0[0] + Math.cos(ang) * ARROW_LEN * 0.55, s0[1] - Math.sin(ang) * ARROW_LEN * 0.55];
  }
}
