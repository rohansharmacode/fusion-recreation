// Picking: faces (mesh raycast + faceGroups), edges (screen distance to edge polylines,
// <=5px), vertices (<=7px), origin items, construction planes, bodies, plus provider hits
// (the sketch module registers one). Ranking: point > curve > area (nearest depth).
import * as THREE from "three";
import { PLANE_BOUNDS, AXIS_BOUNDS, ORIGIN_PLANE_AXES } from "./origin.js";

const V3 = THREE.Vector3;
export const EDGE_PX = 5;
export const POINT_PX = 7;
const RANK = { point: 0, curve: 1, area: 2 };
const AREA_PRIO = { profile: 0, sketchCurve: 0, sketchPoint: 0, originPlane: 1, cplane: 1, face: 2, meshFace: 2, body: 3 };

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L > 1e-12 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return { d2: qx * qx + qy * qy, t };
}

export class Picker {
  constructor(vp) {
    this.vp = vp; // {rig, size(), bodies, cache, origin, app}
    this.providers = new Set();
    this.raycaster = new THREE.Raycaster();
    this._v = new V3();
  }

  addProvider(fn) {
    this.providers.add(fn);
    return () => this.providers.delete(fn);
  }

  /** Ray through canvas CSS pixel (x, y): {o:[..], d:[..]} as THREE vectors too. */
  rayV(x, y) {
    const { w, h } = this.vp.size();
    const rig = this.vp.rig;
    const ndc = new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, rig.camera);
    const o = this.raycaster.ray.origin.clone();
    const d = this.raycaster.ray.direction.clone().normalize();
    if (rig.useOrtho) {
      // start well behind everything (ortho rays are parallel; near plane is negative)
      o.addScaledVector(d, -(rig.scene.radius * 4 + rig.dist * 10 + o.distanceTo(rig.scene.center)));
    }
    return { o, d };
  }

  ray(x, y) {
    const r = this.rayV(x, y);
    return { o: r.o.toArray(), d: r.d.toArray() };
  }

  /** Project a world point to canvas CSS px: [x, y, ndcDepth, inFront] */
  project(p, out = [0, 0, 0, 1]) {
    const { w, h } = this.vp.size();
    const cam = this.vp.rig.camera;
    const v = this._v.set(p[0], p[1], p[2]);
    v.applyMatrix4(cam.matrixWorldInverse);
    const inFront = this.vp.rig.useOrtho ? 1 : v.z < -1e-9 ? 1 : 0;
    v.applyMatrix4(cam.projectionMatrix);
    out[0] = ((v.x + 1) / 2) * w;
    out[1] = ((1 - v.y) / 2) * h;
    out[2] = v.z;
    out[3] = inFront;
    return out;
  }

  /** Cached screen projection of an entry's line vertices for the current camera. */
  _proj(entry) {
    const rig = this.vp.rig;
    const key = rig.version;
    if (entry.proj && entry.projVersion === key) return entry.proj;
    const L = entry.md.lines;
    const n = L.length / 3;
    const out = entry.proj && entry.proj.length === n * 3 ? entry.proj : new Float32Array(n * 3);
    const { w, h } = this.vp.size();
    const cam = rig.camera;
    const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const e = m.elements;
    const ortho = rig.useOrtho;
    for (let i = 0; i < n; i++) {
      const x = L[i * 3], y = L[i * 3 + 1], z = L[i * 3 + 2];
      const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
      const cx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / cw;
      const cy = (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw;
      out[i * 3] = ((cx + 1) / 2) * w;
      out[i * 3 + 1] = ((1 - cy) / 2) * h;
      out[i * 3 + 2] = ortho || cw > 1e-9 ? 1 : 0; // in front of the camera
    }
    entry.proj = out;
    entry.projVersion = key;
    return out;
  }

  /** Is world point P hidden behind a body face (seen from the camera)? */
  _occluded(P, meshes) {
    if (!meshes.length) return false;
    const rig = this.vp.rig;
    let o, d;
    if (rig.useOrtho) {
      d = rig.forward();
      o = P.clone().addScaledVector(d, -(rig.scene.radius * 4 + rig.dist * 10 + 10));
    } else {
      o = rig.position();
      d = P.clone().sub(o).normalize();
    }
    const dist = P.distanceTo(o);
    this.raycaster.set(o, d);
    this.raycaster.near = 0;
    this.raycaster.far = dist;
    const hits = this.raycaster.intersectObjects(meshes, false);
    this.raycaster.far = Infinity;
    const tol = rig.pixelSize(P) * 3 + dist * 1e-5;
    return hits.some((h) => h.distance < dist - tol);
  }

  pickAll(x, y, opts = {}) {
    const vp = this.vp;
    const rig = vp.rig;
    const R = this.rayV(x, y);
    const Rarr = { o: R.o.toArray(), d: R.d.toArray() };
    const hits = [];
    const kinds = opts.kinds ? new Set(opts.kinds) : null;
    const want = (k) => !kinds || kinds.has(k);
    const bodies = vp.bodies.visible();
    const meshes = bodies.map((b) => b.mesh); // faces stay pickable in wireframe styles
    const style = vp.styleInfo();
    const occlusionOn = !style.xray;

    // --- faces / bodies (area) ---
    if (meshes.length && (want("face") || want("body"))) {
      this.raycaster.set(R.o, R.d);
      this.raycaster.near = 0;
      this.raycaster.far = Infinity;
      const ints = this.raycaster.intersectObjects(meshes, false);
      const seen = new Set();
      for (const h of ints) {
        const body = h.object.userData.body;
        const entry = h.object.userData.entry;
        if (!entry) continue;
        if (entry.isMesh) {
          // mesh-like bodies: the hit triangle (and its face group) + the body
          const tri = h.faceIndex;
          if (tri == null || tri < 0) continue;
          // a mesh without face groups is one face group (0), like a freshly inserted mesh in Fusion
          const group = entry.groups ? entry.groups[tri] : 0;
          const key = `${body}:m:${group >= 0 ? `g${group}` : tri}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld).toArray() : [0, 0, 1];
          const p = h.point.toArray();
          hits.push({ ref: { kind: "meshFace", body, tri, group: group >= 0 ? group : -1, p, n }, point: p, depth: h.distance, screenDist: 0, type: "area" });
          if (!seen.has(`${body}:m:body`)) { seen.add(`${body}:m:body`); hits.push({ ref: { kind: "body", body }, point: p, depth: h.distance, screenDist: 0, type: "area" }); }
          continue;
        }
        const g = vp.cache.faceOfTriangle(entry, h.faceIndex);
        if (!g || g.face < 0) continue;
        const key = `${body}:${g.face}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // outward normal interpolated from the mesh normals
        const nAttr = entry.geo.getAttribute("normal");
        const pAttr = entry.geo.getAttribute("position");
        let n = [0, 0, 1];
        if (h.face) {
          const a = new V3().fromBufferAttribute(pAttr, h.face.a);
          const b = new V3().fromBufferAttribute(pAttr, h.face.b);
          const c = new V3().fromBufferAttribute(pAttr, h.face.c);
          const bc = new V3();
          THREE.Triangle.getBarycoord(h.point, a, b, c, bc);
          const na = new V3().fromBufferAttribute(nAttr, h.face.a);
          const nb = new V3().fromBufferAttribute(nAttr, h.face.b);
          const nc = new V3().fromBufferAttribute(nAttr, h.face.c);
          const nn = na.multiplyScalar(bc.x).add(nb.multiplyScalar(bc.y)).add(nc.multiplyScalar(bc.z));
          if (nn.lengthSq() < 1e-12) nn.copy(h.face.normal);
          n = nn.normalize().toArray();
        }
        const planar = entry.faceTypes[g.face] === "PLANE";
        const p = h.point.toArray();
        hits.push({ ref: { kind: "face", body, index: g.face, p, n, planar }, point: p, depth: h.distance, screenDist: 0, type: "area" });
        hits.push({ ref: { kind: "body", body }, point: p, depth: h.distance, screenDist: 0, type: "area" });
      }
    }

    // --- edges (curve) and vertices (point) ---
    if (bodies.length && (want("edge") || want("vertex"))) {
      const ecands = [];
      const vcands = [];
      const lim2 = EDGE_PX * EDGE_PX;
      const vlim2 = POINT_PX * POINT_PX;
      const tmp = [0, 0, 0, 1];
      for (const b of bodies) {
        const entry = b.entry;
        if (entry.isMesh) continue; // mesh edges are display only (B-rep edge refs need an OCCT edge)
        if (want("edge")) {
          const P = this._proj(entry);
          for (const e of entry.edges) {
            if (e.seam) continue;
            let best = null;
            for (let i = e.start; i < e.start + e.count; i += 2) {
              const ia = i * 3, ib = (i + 1) * 3;
              if (!P[ia + 2] || !P[ib + 2]) continue;
              const r = segDist2(x, y, P[ia], P[ia + 1], P[ib], P[ib + 1]);
              if (r.d2 <= lim2 && (!best || r.d2 < best.d2)) best = { d2: r.d2, t: r.t, i };
            }
            if (best) {
              const L = entry.md.lines;
              const ia = best.i * 3, ib = (best.i + 1) * 3;
              const p = [0, 1, 2].map((k) => L[ia + k] + (L[ib + k] - L[ia + k]) * best.t);
              ecands.push({ ref: { kind: "edge", body: b.id, index: e.index, p }, point: p, screenDist: Math.sqrt(best.d2), type: "curve" });
            }
          }
        }
        if (want("vertex")) {
          for (const v of entry.vertices) {
            this.project(v, tmp);
            if (!tmp[3]) continue;
            const dx = tmp[0] - x, dy = tmp[1] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= vlim2) vcands.push({ ref: { kind: "vertex", body: b.id, p: v.slice() }, point: v.slice(), screenDist: Math.sqrt(d2), type: "point" });
          }
        }
      }
      for (const list of [vcands, ecands]) {
        list.sort((a, b) => a.screenDist - b.screenDist);
        let tested = 0;
        for (const c of list) {
          if (opts.filter && !opts.filter(c.ref)) continue;
          if (tested++ > 8) break;
          const P = new V3(...c.point);
          if (occlusionOn && this._occluded(P, meshes)) continue;
          c.depth = P.clone().sub(R.o).dot(R.d);
          hits.push(c);
          // keep a few more candidates so filters downstream still have choices
          if (tested > 3) break;
        }
      }
    }

    // --- origin items ---
    const org = vp.origin;
    if (org && org.visible) {
      const u = org.unit;
      if (want("originPoint") && org.itemVisible("O")) {
        const s = this.project([0, 0, 0]);
        const d = Math.hypot(s[0] - x, s[1] - y);
        if (s[3] && d <= POINT_PX && !(occlusionOn && this._occluded(new V3(0, 0, 0), meshes))) hits.push({ ref: { kind: "originPoint" }, point: [0, 0, 0], depth: new V3().sub(R.o).dot(R.d), screenDist: d, type: "point" });
      }
      if (want("originAxis")) {
        for (const name of ["X", "Y", "Z"]) {
          if (!org.itemVisible(name)) continue;
          const dir = [name === "X" ? 1 : 0, name === "Y" ? 1 : 0, name === "Z" ? 1 : 0];
          const A = dir.map((c) => c * AXIS_BOUNDS[0] * u), B = dir.map((c) => c * AXIS_BOUNDS[1] * u);
          const sa = this.project(A, [0, 0, 0, 1]), sb = this.project(B, [0, 0, 0, 1]);
          if (!sa[3] || !sb[3]) continue;
          const r = segDist2(x, y, sa[0], sa[1], sb[0], sb[1]);
          if (r.d2 <= EDGE_PX * EDGE_PX) {
            const p = A.map((c, k) => c + (B[k] - c) * r.t);
            if (occlusionOn && this._occluded(new V3(...p), meshes)) continue;
            hits.push({ ref: { kind: "originAxis", name }, point: p, depth: new V3(...p).sub(R.o).dot(R.d), screenDist: Math.sqrt(r.d2), type: "curve" });
          }
        }
      }
      if (want("originPlane")) {
        for (const name of ["XY", "XZ", "YZ"]) {
          if (!org.itemVisible(name)) continue;
          const [a, b] = ORIGIN_PLANE_AXES[name];
          const A = new V3(...a), B = new V3(...b);
          const n = new V3().crossVectors(A, B);
          const den = n.dot(R.d);
          if (Math.abs(den) < 1e-9) continue;
          const t = -n.dot(R.o) / den;
          if (t <= 0) continue;
          const P = R.o.clone().addScaledVector(R.d, t);
          const s = P.dot(A) / u, q = P.dot(B) / u;
          if (s >= PLANE_BOUNDS[0] && s <= PLANE_BOUNDS[1] && q >= PLANE_BOUNDS[0] && q <= PLANE_BOUNDS[1]) {
            hits.push({ ref: { kind: "originPlane", name }, point: P.toArray(), depth: t, screenDist: 0, type: "area" });
          }
        }
      }
    }

    // --- construction planes: translucent fill (area) + outline (curve, <=5px, not behind a body) ---
    if (org && want("cplane") && vp.groups.construction.visible) {
      for (const [id, c] of org.cplanes) {
        const { o, n, x: px, y: py } = c.plane;
        const den = n.dot(R.d);
        if (Math.abs(den) > 1e-9) {
          const t = o.clone().sub(R.o).dot(n) / den;
          if (t > 0) {
            const P = R.o.clone().addScaledVector(R.d, t);
            const rel = P.clone().sub(o);
            const u = rel.dot(px), v = rel.dot(py);
            const [u0, v0, u1, v1] = c.rect;
            if (u >= u0 && u <= u1 && v >= v0 && v <= v1) hits.push({ ref: { kind: "cplane", id }, point: P.toArray(), depth: t, screenDist: 0, type: "area" });
          }
        }
        const cs = c.corners || [];
        let best = null;
        for (let i = 0; i < cs.length; i++) {
          const A = cs[i], B = cs[(i + 1) % cs.length];
          const sa = this.project(A.toArray(), [0, 0, 0, 1]), sb = this.project(B.toArray(), [0, 0, 0, 1]);
          if (!sa[3] || !sb[3]) continue;
          const r = segDist2(x, y, sa[0], sa[1], sb[0], sb[1]);
          if (r.d2 <= EDGE_PX * EDGE_PX && (!best || r.d2 < best.d2)) best = { d2: r.d2, P: A.clone().lerp(B, r.t) };
        }
        if (best && !(occlusionOn && this._occluded(best.P, meshes))) {
          hits.push({ ref: { kind: "cplane", id }, point: best.P.toArray(), depth: best.P.clone().sub(R.o).dot(R.d), screenDist: Math.sqrt(best.d2), type: "curve" });
        }
      }
    }

    // --- body-kind pick hooks (app.registerBodyKind(kind, {pick})): T-spline cage points / edges ... ---
    const kindHooks = vp.app.bodyKinds || {};
    for (const b of bodies) {
      const hk = kindHooks[b.kind];
      if (!hk || typeof hk.pick !== "function") continue;
      try {
        const st = vp.app.anyBody ? vp.app.anyBody(b.id) : null;
        for (const hh of hk.pick((st && st.entry) || st, x, y, Rarr, opts) || []) if (hh && hh.ref) hits.push(hh);
      } catch (e) { console.error(`[viewport] ${b.kind} pick hook failed`, e); }
    }

    // --- providers (sketch entities, manipulators, ...) ---
    for (const p of this.providers) {
      try {
        const extra = p(x, y, Rarr, opts) || [];
        for (const hh of extra) if (hh && hh.ref) hits.push(hh);
      } catch (e) { console.error("[viewport] pick provider failed", e); }
    }

    let out = hits;
    if (kinds) out = out.filter((h) => kinds.has(h.ref.kind));
    if (opts.filter) out = out.filter((h) => { try { return opts.filter(h.ref); } catch { return false; } });
    const tolAt = (h) => (h.point ? rig.pixelSize(new V3(...h.point)) * 2 : 1e-6) + 1e-9;
    // A construction plane's translucent fill must not hide the model behind it while the user is
    // selecting model geometry (default select, Measure: anything that also takes edges): there the
    // plane yields to an accepted face/body further along the ray (it stays pickable by its outline,
    // where the model is not behind it, and in the browser). Plane-oriented picks (Create Sketch,
    // Offset Plane, Mirror plane: planes + planar faces, no edges) keep the nearest-first order.
    const yielded = new Set();
    const solids = out.filter((h) => h.type === "area" && (h.ref.kind === "face" || h.ref.kind === "body"));
    if (solids.length && out.some((h) => h.type === "area" && h.ref.kind === "cplane")) {
      const s0 = solids[0];
      let generic = !kinds || kinds.has("edge");
      if (generic && opts.filter) {
        try { generic = !!opts.filter({ kind: "edge", body: s0.ref.body, index: 0, p: s0.point }); } catch { generic = false; }
      }
      if (generic) {
        for (const h of out) {
          if (h.type !== "area" || h.ref.kind !== "cplane") continue;
          if (solids.some((s) => s.depth > h.depth + Math.max(tolAt(s), tolAt(h)))) yielded.add(h);
        }
      }
    }
    out.sort((a, b) => {
      const ra = RANK[a.type] ?? 2, rb = RANK[b.type] ?? 2;
      if (ra !== rb) return ra - rb;
      const ya = yielded.has(a) ? 1 : 0, yb = yielded.has(b) ? 1 : 0;
      if (ya !== yb) return ya - yb;
      if (ra < 2) return (a.screenDist ?? 0) - (b.screenDist ?? 0) || (a.depth ?? 0) - (b.depth ?? 0);
      const da = a.depth ?? Infinity, db = b.depth ?? Infinity;
      if (Math.abs(da - db) <= Math.max(tolAt(a), tolAt(b))) {
        const pa = AREA_PRIO[a.ref.kind] ?? 0, pb = AREA_PRIO[b.ref.kind] ?? 0;
        if (pa !== pb) return pa - pb;
      }
      return da - db;
    });
    return out;
  }

  pick(x, y, opts) {
    return this.pickAll(x, y, opts)[0] || null;
  }
}
