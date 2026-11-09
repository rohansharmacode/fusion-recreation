// Display and picking of construction axes / points (st.axes, st.points of the evaluated state) and the
// live preview rectangle of construction planes made by the solidx plane dialogs.
// Look: axes are thin dark-orange lines (the construction plane edge colour), points small orange discs
// with a dark rim; hover / selection turn them blue like other construction geometry.
import * as THREE from "three";
import * as K from "../../kernel.js";
import { refKey } from "../../app/core.js";

const ORANGE_EDGE = new THREE.Color(0.902, 0.494, 0.208);
const ORANGE = new THREE.Color(1, 0.647, 0);
const HOVER = new THREE.Color(0.3, 0.5, 1);
const SELECT = new THREE.Color(0, 0.47, 1);
const AXIS_PX = 5, POINT_PX = 7;

function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  g.beginPath(); g.arc(16, 16, 12, 0, Math.PI * 2);
  g.fillStyle = "#ffffff"; g.fill();
  g.lineWidth = 5; g.strokeStyle = "#ffffff"; g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/** Plane modes whose dialogs live in this module (their preview rectangle is drawn here). */
const OWN_PLANE_MODES = new Set(["tangent", "perpendicular", "twoEdges", "threePoints", "alongPath"]);

export function createConstructionView(app) {
  const vp = app.viewport;
  if (!vp || !vp.scene || !vp.groups || !vp.groups.construction) return null;
  const root = new THREE.Group();
  root.name = "solidx-construction";
  root.userData.noPick = true;
  vp.groups.construction.add(root);
  let tex = null;
  try { tex = dotTexture(); } catch { tex = null; }
  const items = new Map(); // id -> {kind:'axis'|'point', a, b | p, obj, mat}
  let previewPlane = null;

  const visibleFeature = (id, detail) => {
    const f = app.feature(id) || (detail && detail.feature && detail.feature.id === id ? detail.feature : null);
    return !!f && f.visible !== false;
  };

  function clear() {
    for (const it of items.values()) {
      root.remove(it.obj);
      it.obj.geometry.dispose();
      it.mat.dispose();
    }
    items.clear();
  }

  function rebuild(detail) {
    clear();
    const st = app.result && app.result.state;
    if (!st) return;
    if (st.axes instanceof Map) {
      for (const [id, a] of st.axes) {
        if (!visibleFeature(id, detail) || !a || !a.seg) continue;
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a.seg[0]), new THREE.Vector3(...a.seg[1])]);
        const mat = new THREE.LineBasicMaterial({ color: ORANGE_EDGE.clone() });
        const line = new THREE.Line(geo, mat);
        line.renderOrder = 9;
        line.name = `caxis:${id}`;
        root.add(line);
        items.set(id, { kind: "axis", a: a.seg[0], b: a.seg[1], obj: line, mat });
      }
    }
    if (st.points instanceof Map) {
      for (const [id, pt] of st.points) {
        if (!visibleFeature(id, detail) || !pt || !pt.p) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pt.p, 3));
        const mat = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, color: ORANGE.clone(), map: tex, transparent: true, alphaTest: 0.3, depthTest: false });
        const obj = new THREE.Points(geo, mat);
        obj.renderOrder = 14;
        obj.name = `cpoint:${id}`;
        root.add(obj);
        items.set(id, { kind: "point", p: pt.p, obj, mat });
      }
    }
    updatePreviewPlane(detail);
    recolor();
  }

  function updatePreviewPlane(detail) {
    const f = detail && detail.preview && detail.feature;
    const ps = f && f.type === "cplane" && OWN_PLANE_MODES.has(f.mode) && !app.feature(f.id) && app.result.state.planes ? app.result.state.planes.get(f.id) : null;
    if (!ps || !ps.plane) { if (previewPlane) previewPlane.visible = false; return; }
    if (!previewPlane) {
      const g = new THREE.Group();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(12), 3));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: ORANGE.clone(), transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
      fill.renderOrder = 7;
      const lgeo = new THREE.BufferGeometry();
      lgeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(15), 3));
      const edge = new THREE.Line(lgeo, new THREE.LineBasicMaterial({ color: ORANGE_EDGE.clone() }));
      edge.renderOrder = 8;
      g.add(fill, edge);
      vp.groups.construction.add(g);
      previewPlane = Object.assign(g, { fill, edge });
    }
    const pl = ps.plane;
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const b of app.result.state.bodies.values()) {
      let bb = null;
      try { bb = K.bboxOf(b.shape); } catch { bb = null; }
      if (!bb) continue;
      for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); }
    }
    const V = K.V;
    const has = Number.isFinite(mn[0]);
    const center = has ? V.mul(V.add(mn, mx), 0.5) : pl.o;
    const half = Math.max(has ? V.len(V.sub(mx, mn)) * 0.5 * 0.75 : 0, 15);
    const [cu, cv] = K.toLocal(pl, center);
    const P = (u, v) => K.toWorld(pl, u, v);
    const c = [P(cu - half, cv - half), P(cu + half, cv - half), P(cu + half, cv + half), P(cu - half, cv + half)];
    previewPlane.fill.geometry.attributes.position.array.set(c.flat());
    previewPlane.fill.geometry.attributes.position.needsUpdate = true;
    previewPlane.fill.geometry.computeBoundingSphere();
    previewPlane.edge.geometry.attributes.position.array.set([...c.flat(), ...c[0]]);
    previewPlane.edge.geometry.attributes.position.needsUpdate = true;
    previewPlane.edge.geometry.computeBoundingSphere();
    previewPlane.visible = true;
  }

  function stateOf(id) {
    const sel = new Set((app.selection.items || []).map(refKey));
    const hov = app.selection.hover ? refKey(app.selection.hover) : "";
    const keys = [refKey({ kind: "feature", id }), refKey({ kind: "caxis", id }), refKey({ kind: "cpoint", id })];
    if (keys.some((k) => sel.has(k))) return "sel";
    if (keys.includes(hov)) return "hov";
    return "";
  }
  function recolor() {
    for (const [id, it] of items) {
      const s = stateOf(id);
      const base = it.kind === "axis" ? ORANGE_EDGE : ORANGE;
      it.mat.color.copy(s === "sel" ? SELECT : s === "hov" ? HOVER : base);
      if (it.kind === "point") it.mat.size = s ? 11 : 9;
    }
    vp.requestRender();
  }

  // typed ref while a dialog row takes axes / points, else the plain feature ref (browser, Delete, V, rename)
  function refFor(kind, id) {
    const f = app.selection.filter;
    if (f) {
      const typed = { kind: kind === "axis" ? "caxis" : "cpoint", id };
      try { if (f(typed)) return typed; } catch { /* filter rejects */ }
    }
    return { kind: "feature", id };
  }

  const removePick = vp.addPickProvider((x, y, ray) => {
    if (!items.size || !vp.groups.construction.visible) return [];
    const hits = [];
    const depthOf = (p) => (p[0] - ray.o[0]) * ray.d[0] + (p[1] - ray.o[1]) * ray.d[1] + (p[2] - ray.o[2]) * ray.d[2];
    for (const [id, it] of items) {
      if (it.kind === "point") {
        const s = vp.toScreen(it.p);
        if (!s) continue;
        const d = Math.hypot(s[0] - x, s[1] - y);
        // drawn on top of the model: a construction point wins over a vertex at the same spot
        if (d <= POINT_PX) hits.push({ ref: refFor("point", id), point: it.p, depth: depthOf(it.p) - 1e-3, screenDist: Math.max(0, d - 0.5), type: "point" });
      } else {
        const sa = vp.toScreen(it.a), sb = vp.toScreen(it.b);
        if (!sa || !sb) continue;
        const dx = sb[0] - sa[0], dy = sb[1] - sa[1];
        const L2 = dx * dx + dy * dy;
        let t = L2 > 1e-9 ? ((x - sa[0]) * dx + (y - sa[1]) * dy) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(sa[0] + dx * t - x, sa[1] + dy * t - y);
        if (d > AXIS_PX) continue;
        const p = [0, 1, 2].map((k) => it.a[k] + (it.b[k] - it.a[k]) * t);
        hits.push({ ref: refFor("axis", id), point: p, depth: depthOf(p), screenDist: d, type: "curve" });
      }
    }
    return hits;
  });

  const offs = [
    app.on("model", (d) => { try { rebuild(d); } catch (e) { console.error("[solidx] construction display", e); } }),
    app.on("selection", recolor),
    app.on("hover", recolor),
  ];
  try { rebuild(null); } catch { /* no result yet */ }
  return {
    items,
    /** Screen position (canvas px) of a construction axis midpoint / point, for tests. */
    screenPoint(id) {
      const it = items.get(id);
      if (!it) return null;
      const p = it.kind === "point" ? it.p : it.a.map((v, k) => (v + it.b[k]) / 2);
      const s = vp.toScreen(p);
      return s ? [s[0], s[1]] : null;
    },
    dispose() { offs.forEach((o) => o && o()); removePick(); clear(); vp.groups.construction.remove(root); },
  };
}
