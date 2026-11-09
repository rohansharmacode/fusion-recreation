// T-spline display and picking: control frame (cage) object of the body kind, pick hits for vertices / edges /
// faces, and the selection / hover highlight of T-spline refs (drawn depth-tested in the main scene).
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { displayOf } from "./feature.js";
import { topo, symmetryEdges, isTsRef, vRef, eRef, fRef, frozenSet } from "./cage.js";

const COL = { frame: 0x51595f, point: 0x24292d, sym: 0x2fae3a, frozen: 0x5a77a8, sel: 0x1f86e0, hover: 0x7cc0f5 };

/** Current display mesh of an entry (box mesh in Box display, else the smooth limit mesh). */
export function meshOf(entry) {
  const ev = entry && entry.data && entry.data.ev;
  if (!ev) return entry && entry.mesh;
  return displayOf(entry.id) === "box" ? ev.box() : ev.smooth;
}
/** Display position of cage vertex i: control point (Box / Control Frame) or limit point (Smooth). */
export function vertexPos(entry, i) {
  const c = entry.data.cage;
  return displayOf(entry.id) === "smooth" ? entry.data.ev.limit(i) : c.v[i];
}
/** Polyline of cage edge a-b as displayed. */
export function edgePoly(entry, a, b) {
  const c = entry.data.cage;
  return displayOf(entry.id) === "smooth" ? entry.data.ev.edgeCurve(a, b) : [c.v[a], c.v[b]];
}

function lineGeo(segs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(segs), 3));
  return g;
}

export function createView(app) {
  const vp = () => app.viewport;

  // ------------------------------------------------------------ body kind render hook
  function renderCage(entry) {
    if (!entry || !entry.data || !entry.data.cage) return null;
    const c = entry.data.cage;
    const mode = displayOf(entry.id);
    const g = new THREE.Group();
    g.name = "tspline-cage";
    const t = topo(c);
    if (mode === "frame") {
      const segs = [];
      for (const [a, b] of t.edges) segs.push(...c.v[a], ...c.v[b]);
      const geo = lineGeo(segs);
      const front = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COL.frame }));
      front.renderOrder = 3;
      const back = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COL.frame, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false }));
      back.renderOrder = 2;
      const pts = new THREE.BufferGeometry();
      pts.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(c.v.flat()), 3));
      const dots = new THREE.Points(pts, new THREE.PointsMaterial({ color: COL.point, size: 5, sizeAttenuation: false }));
      dots.renderOrder = 4;
      g.add(back, front, dots);
    }
    // symmetry lines (green) and frozen faces (blue-grey)
    const symE = symmetryEdges(c);
    if (symE.length) {
      const segs = [];
      for (const [a, b] of symE) {
        const pl = edgePoly(entry, a, b);
        for (let i = 0; i < pl.length - 1; i++) segs.push(...pl[i], ...pl[i + 1]);
      }
      const l = new THREE.LineSegments(lineGeo(segs), new THREE.LineBasicMaterial({ color: COL.sym }));
      l.renderOrder = 5;
      g.add(l);
    }
    const fz = frozenSet(c);
    if (fz.size) {
      const m = meshOf(entry);
      const idx = [];
      c.f.forEach((fc, f) => {
        if (!fc.every((v) => fz.has(v)) || !m.ranges || !m.ranges[f]) return;
        const [s, n] = m.ranges[f];
        for (let k = s; k < s + n; k++) idx.push(m.indices[3 * k], m.indices[3 * k + 1], m.indices[3 * k + 2]);
      });
      if (idx.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
        geo.setIndex(idx);
        const mm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COL.frozen, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide }));
        mm.renderOrder = 3;
        g.add(mm);
      }
    }
    return g;
  }

  // ------------------------------------------------------------ picking
  function rayMesh(m, ray) {
    const P = m.positions, I = m.indices;
    const o = ray.o, d = ray.d;
    let best = null;
    for (let t = 0; t < I.length; t += 3) {
      const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
      const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-14) continue;
      const inv = 1 / det;
      const sx = o[0] - P[a], sy = o[1] - P[a + 1], sz = o[2] - P[a + 2];
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (dist <= 1e-9 || (best && dist >= best.t)) continue;
      best = { t: dist, tri: t / 3, n: [e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x] };
    }
    return best;
  }
  const along = (ray, p) => (p[0] - ray.o[0]) * ray.d[0] + (p[1] - ray.o[1]) * ray.d[1] + (p[2] - ray.o[2]) * ray.d[2];
  function pick(entry, x, y, ray, opts = {}) {
    if (!entry || !entry.data || !entry.data.cage || entry.data.cage.converted) return [];
    const V = vp();
    if (!V) return [];
    const kinds = opts.kinds ? new Set(opts.kinds) : null;
    const want = (k) => !kinds || kinds.has(k);
    const c = entry.data.cage, body = entry.id;
    const m = meshOf(entry);
    const hit = m ? rayMesh(m, ray) : null;
    const hits = [];
    const px = (p) => (V.pixelSize ? V.pixelSize(p) : 0.1);
    const occluded = (p) => hit && along(ray, p) > hit.t + px(p) * 4 + 1e-6;
    const frame = displayOf(body) !== "smooth";
    if (want("tsVertex")) {
      for (let i = 0; i < c.v.length; i++) {
        const p = vertexPos(entry, i);
        const s = V.toScreen(p);
        const dd = Math.hypot(s[0] - x, s[1] - y);
        if (dd > 7) continue;
        if (!frame && occluded(p)) continue;
        hits.push({ ref: vRef(body, i), point: p, depth: along(ray, p), screenDist: dd, type: "point" });
      }
    }
    if (want("tsEdge")) {
      const t = topo(c);
      for (const [a, b] of t.edges) {
        const pl = edgePoly(entry, a, b);
        let bestD = Infinity, bestP = null;
        for (let i = 0; i < pl.length - 1; i++) {
          const A = V.toScreen(pl[i]), B = V.toScreen(pl[i + 1]);
          const dx = B[0] - A[0], dy = B[1] - A[1], L = dx * dx + dy * dy;
          let u = L > 1e-12 ? ((x - A[0]) * dx + (y - A[1]) * dy) / L : 0;
          u = Math.max(0, Math.min(1, u));
          const dd = Math.hypot(A[0] + dx * u - x, A[1] + dy * u - y);
          if (dd < bestD) { bestD = dd; bestP = [pl[i][0] + (pl[i + 1][0] - pl[i][0]) * u, pl[i][1] + (pl[i + 1][1] - pl[i][1]) * u, pl[i][2] + (pl[i + 1][2] - pl[i][2]) * u]; }
        }
        if (bestD > 5 || !bestP) continue;
        if (!frame && occluded(bestP)) continue;
        hits.push({ ref: eRef(body, a, b), point: bestP, depth: along(ray, bestP), screenDist: bestD, type: "curve" });
      }
    }
    if (hit && want("tsFace") && m.groups) {
      const f = m.groups[hit.tri];
      const p = [ray.o[0] + ray.d[0] * hit.t, ray.o[1] + ray.d[1] * hit.t, ray.o[2] + ray.d[2] * hit.t];
      if (f !== undefined && c.f[f]) hits.push({ ref: fRef(body, f), point: p, depth: hit.t, screenDist: 0, type: "area" });
    }
    return hits;
  }

  // ------------------------------------------------------------ selection / hover highlight
  const group = new THREE.Group();
  group.name = "form-highlight";
  let mats = [];
  let added = false;
  function clear() {
    for (const o of [...group.children]) { group.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
    mats = [];
  }
  function res() {
    const cv = vp() && vp().canvas;
    if (!cv) return;
    for (const m of mats) m.resolution.set(cv.clientWidth || 1, cv.clientHeight || 1);
  }
  function draw(refs, color, opacity) {
    const byBody = new Map();
    for (const r of refs) { if (!isTsRef(r)) continue; if (!byBody.has(r.body)) byBody.set(r.body, []); byBody.get(r.body).push(r); }
    for (const [id, rs] of byBody) {
      const b = app.anyBody(id);
      const entry = b && b.entry;
      if (!entry || !entry.data || !entry.data.cage) continue;
      const c = entry.data.cage;
      const m = meshOf(entry);
      const tri = [], segs = [], pts = [];
      for (const r of rs) {
        if (r.kind === "tsFace" && m.ranges && m.ranges[r.f]) {
          const [s, n] = m.ranges[r.f];
          for (let k = s; k < s + n; k++) tri.push(m.indices[3 * k], m.indices[3 * k + 1], m.indices[3 * k + 2]);
          // outline the face
          const fc = c.f[r.f] || [];
          for (let i = 0; i < fc.length; i++) { const pl = edgePoly(entry, fc[i], fc[(i + 1) % fc.length]); for (let k = 0; k < pl.length - 1; k++) segs.push(...pl[k], ...pl[k + 1]); }
        } else if (r.kind === "tsEdge") {
          const pl = edgePoly(entry, r.a, r.b);
          for (let k = 0; k < pl.length - 1; k++) segs.push(...pl[k], ...pl[k + 1]);
        } else if (r.kind === "tsVertex" && c.v[r.v]) pts.push(...vertexPos(entry, r.v));
      }
      if (tri.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
        geo.setIndex(tri);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }));
        mesh.renderOrder = 6;
        group.add(mesh);
      }
      if (segs.length) {
        const geo = new LineSegmentsGeometry();
        geo.setPositions(segs);
        const mat = new LineMaterial({ color, linewidth: 3, worldUnits: false, depthTest: displayOf(id) === "smooth", transparent: true });
        mats.push(mat);
        const l = new LineSegments2(geo, mat);
        l.renderOrder = 7;
        group.add(l);
      }
      if (pts.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(pts), 3));
        const p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 9, sizeAttenuation: false, depthTest: false, transparent: true }));
        p.renderOrder = 8;
        group.add(p);
      }
    }
  }
  function refresh() {
    const V = vp();
    if (!V || !V.scene) return;
    if (!added) { V.scene.add(group); added = true; }
    clear();
    try {
      const sel = app.selection.items.filter(isTsRef);
      const dlg = app.ui.dialog && app.ui.dialog.current;
      const fromDlg = [];
      if (dlg && !dlg.closed) for (const id of dlg.selIds || []) for (const r of dlg.values[id] || []) if (isTsRef(r)) fromDlg.push(r);
      const hv = app.selection.hover;
      if (hv && isTsRef(hv)) draw([hv], COL.hover, 0.35);
      draw([...sel, ...fromDlg], COL.sel, 0.45);
      res();
    } catch (e) { console.error("[form] highlight", e); }
    V.requestRender();
  }
  let pending = false;
  const schedule = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; refresh(); }); };
  app.on("selection", schedule);
  app.on("hover", schedule);
  app.on("model", schedule);
  app.on("dialog", schedule);
  app.on("camera", res);

  return { renderCage, pick, refresh: schedule, rayMesh };
}
