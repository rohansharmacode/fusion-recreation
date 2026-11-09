// Minimal sketch display + profile/line/point picking, used ONLY when the sketch module is not
// part of the build (e.g. `--only=viewport,dialogs` test builds). The real sketch module owns
// sketch rendering and picking in the full app.
import * as THREE from "three";
import { refKey } from "../../app/core.js";
import { pointInPoly, curveGeom } from "../../sketch/regions.js";
import * as K from "../../kernel.js";

function inRegion(p, r) { return pointInPoly(p, r.outer.poly) && !r.holes.some((h) => pointInPoly(p, h.poly)); }

export function installSketchFallback(app) {
  const vp = app.viewport;
  if (!vp) return;
  const group = new THREE.Group();
  group.name = "dlg-sketch-fallback";
  (vp.groups.sketches || vp.scene).add(group);

  const visibleSketches = () => {
    const st = app.result && app.result.state;
    if (!st) return [];
    return [...st.sketches.values()].filter((s) => { const f = app.feature(s.id); return f && f.visible !== false; });
  };

  function matrixFor(pl) {
    const y = K.planeY(pl);
    return new THREE.Matrix4().set(pl.x[0], y[0], pl.n[0], pl.o[0], pl.x[1], y[1], pl.n[1], pl.o[1], pl.x[2], y[2], pl.n[2], pl.o[2], 0, 0, 0, 1);
  }

  function rebuild() {
    for (const o of [...group.children]) { group.remove(o); o.traverse((c) => { c.geometry && c.geometry.dispose(); c.material && c.material.dispose(); }); }
    const selKeys = new Set(app.selection.items.map(refKey));
    const hovKey = refKey(app.selection.hover);
    for (const s of visibleSketches()) {
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      g.matrix.copy(matrixFor(s.plane));
      for (const r of (s.regions && s.regions.regions) || []) {
        const shp = new THREE.Shape(r.outer.poly.map(([x, y]) => new THREE.Vector2(x, y)));
        for (const h of r.holes) shp.holes.push(new THREE.Path(h.poly.map(([x, y]) => new THREE.Vector2(x, y))));
        const k = refKey({ kind: "profile", sketch: s.id, key: r.key });
        const sel = selKeys.has(k), hov = hovKey === k;
        const mat = new THREE.MeshBasicMaterial({ color: sel ? 0x3d8fe0 : hov ? 0x9cc8f0 : 0xf3c58f, transparent: true, opacity: sel ? 0.55 : hov ? 0.5 : 0.42, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
        const m = new THREE.Mesh(new THREE.ShapeGeometry(shp), mat);
        m.renderOrder = 5;
        g.add(m);
      }
      const pts = [];
      for (const id of Object.keys(s.sk.curves)) {
        const cv = s.sk.curves[id];
        if (cv.type === "point") continue;
        const gm = curveGeom(s.sk, id);
        if (!gm) continue;
        if (gm.kind === "line") pts.push(gm.a[0], gm.a[1], 0, gm.b[0], gm.b[1], 0);
        else {
          const sweep = gm.kind === "circle" ? Math.PI * 2 : gm.sweep;
          const a0 = gm.kind === "circle" ? 0 : gm.a0;
          const n = 48;
          for (let i = 0; i < n; i++) {
            const t0 = a0 + (sweep * i) / n, t1 = a0 + (sweep * (i + 1)) / n;
            pts.push(gm.c[0] + gm.r * Math.cos(t0), gm.c[1] + gm.r * Math.sin(t0), 0, gm.c[0] + gm.r * Math.cos(t1), gm.c[1] + gm.r * Math.sin(t1), 0);
          }
        }
      }
      if (pts.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x1b5fbf, depthTest: true }));
        l.renderOrder = 6;
        g.add(l);
      }
      group.add(g);
    }
    vp.requestRender();
  }
  app.on("model", rebuild);
  app.on("selection", rebuild);
  app.on("hover", rebuild);
  app.on("doc", () => setTimeout(rebuild, 0));

  vp.addPickProvider((x, y, ray, opts) => {
    const hits = [];
    for (const s of visibleSketches()) {
      const rp = vp.rayPlane(x, y, s.plane);
      if (!rp || rp.t < 0) continue;
      const uv = rp.uv;
      const ps = vp.pixelSize(rp.world) || 0.1;
      // points
      for (const [pid, p] of Object.entries(s.sk.points)) {
        const d = Math.hypot(p.x - uv[0], p.y - uv[1]) / ps;
        if (d <= 7) hits.push({ ref: { kind: "sketchPoint", sketch: s.id, point: pid }, point: K.toWorld(s.plane, p.x, p.y), depth: rp.t, screenDist: d, type: "point" });
      }
      // lines (axis picking for revolve etc.)
      for (const [cid, cv] of Object.entries(s.sk.curves)) {
        if (cv.type !== "line") continue;
        const a = s.sk.points[cv.p1], b = s.sk.points[cv.p2];
        const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-12;
        const t = Math.max(0, Math.min(1, ((uv[0] - a.x) * dx + (uv[1] - a.y) * dy) / L2));
        const d = Math.hypot(uv[0] - (a.x + dx * t), uv[1] - (a.y + dy * t)) / ps;
        if (d <= 5) hits.push({ ref: { kind: "sketchCurve", sketch: s.id, curve: cid }, point: rp.world, depth: rp.t, screenDist: d, type: "curve" });
      }
      // profiles: smallest region containing the point
      let best = null;
      for (const r of (s.regions && s.regions.regions) || []) {
        if (!inRegion(uv, r)) continue;
        if (!best || Math.abs(r.area) < Math.abs(best.area)) best = r;
      }
      if (best) hits.push({ ref: { kind: "profile", sketch: s.id, key: best.key, c: uv }, point: rp.world, depth: rp.t - 1e-3, screenDist: 0, type: "area" });
    }
    return hits;
  });
  rebuild();
}
