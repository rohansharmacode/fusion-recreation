// Shared state and helpers of the sketch environment module.
import * as THREE from "three";
import { refKey } from "../../app/core.js";

export const OPT_DEFAULTS = {
  construction: false, // Linetype: new geometry is construction
  autoLookAt: true,
  grid: true, // Sketch Grid
  snap: false, // Snap to grid
  slice: false,
  showProfile: true,
  showPoints: true,
  showDims: true,
  showCons: true,
  showProjected: true,
  showConstruction: true,
  sketch3d: false,
};

export const ST = {
  app: null,
  sketchId: null, // feature id of the sketch being edited
  session: null, // {sketchId, savedMarker, rolled, undoDepth}
  tool: null, // active tool instance
  live: null, // {id, plane, sk, regions, status} override during drags
  opts: { ...OPT_DEFAULTS },
  dimAt: {}, // cid -> [u,v] label offset override while dragging a dimension label
  polySides: 6,
  listeners: new Set(),
};

const OPTS_KEY = "fusion-recreation.sketchPalette";

export function initCtx(app) {
  ST.app = app;
  try {
    const raw = window.localStorage && window.localStorage.getItem(OPTS_KEY);
    if (raw) Object.assign(ST.opts, JSON.parse(raw));
  } catch { /* storage unavailable */ }
  ST.opts.construction = false;
  ST.opts.sketch3d = false;
  ST.opts.slice = false;
}

export function saveOpts() {
  try { window.localStorage && window.localStorage.setItem(OPTS_KEY, JSON.stringify(ST.opts)); } catch { /* ignore */ }
}

export function setOpt(name, value) {
  ST.opts[name] = value;
  saveOpts();
  emitLocal("opts", { name, value });
}

// ---------- grid: use the viewport's layout grid (drawn on the sketch plane) when it has one ----------
export function viewportGrid() {
  const v = ST.app && ST.app.viewport;
  return v && v.gridSettings && typeof v.setGridPlane === "function" ? v : null;
}
export function gridVisible() { const v = viewportGrid(); return v ? !!v.gridSettings.visible : !!ST.opts.grid; }
export function gridSnapOn() { const v = viewportGrid(); return v ? !!v.gridSettings.snap && !!v.gridSettings.visible : !!ST.opts.snap && !!ST.opts.grid; }
/** Palette "Sketch Grid" / "Snap" -> viewport grid prefs when available. */
export function setGridOpt(name, value) {
  const v = viewportGrid();
  const setter = v && v._vp && v._vp.setGridPref;
  if (setter) setter(name === "grid" ? "visible" : "snap", !!value);
  setOpt(name, value);
}

/** Small local event bus between the sketch module's files. */
export function onLocal(fn) { ST.listeners.add(fn); return () => ST.listeners.delete(fn); }
export function emitLocal(type, detail = {}) { for (const fn of [...ST.listeners]) { try { fn(type, detail); } catch (e) { console.error(e); } } }

export const app = () => ST.app;
export const vp = () => ST.app && ST.app.viewport;
export { refKey };

export function activeFeature() { return ST.sketchId ? ST.app.feature(ST.sketchId) : null; }

/** Sketch data used for display/picking: {id, plane, sk, regions, status}. */
export function sketchData(id) {
  if (ST.live && ST.live.id === id) return ST.live;
  return ST.app.sketchState(id) || null;
}
export function activeData() { return ST.sketchId ? sketchData(ST.sketchId) : null; }
export function activePlane() {
  const d = activeData();
  if (d && d.plane) return d.plane;
  const f = activeFeature();
  return f ? f.plane : null;
}

export function params() {
  return ST.app.result ? ST.app.result.params : null;
}

/** One undoable change to a sketch in the document. fn(sk, feature, doc). */
export function mutateSketch(label, fn, id = ST.sketchId) {
  return ST.app.mutate(label, (doc) => {
    const f = doc.features.find((x) => x.id === id);
    if (!f || f.type !== "sketch") throw new Error("Sketch not found");
    return fn(f.sk, f, doc);
  });
}

// ---------- plane math ----------
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
export function planeY(pl) { return ST.app.K.planeY(pl); }
export function toWorld(pl, u, v) { return ST.app.K.toWorld(pl, u, v); }
export function planeMatrix(pl, eps = 0) {
  const y = planeY(pl);
  const m = new THREE.Matrix4().makeBasis(V3(pl.x), V3(y), V3(pl.n));
  m.setPosition(pl.o[0] + pl.n[0] * eps, pl.o[1] + pl.n[1] * eps, pl.o[2] + pl.n[2] * eps);
  return m;
}

/** Ray/plane intersection from a ray {o,d}. */
export function rayHitPlane(ray, pl) {
  const { o, d } = ray;
  const n = pl.n;
  const den = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((pl.o[0] - o[0]) * n[0] + (pl.o[1] - o[1]) * n[1] + (pl.o[2] - o[2]) * n[2]) / den;
  const w = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
  return { world: w, uv: ST.app.K.toLocal(pl, w), t };
}

/** Cursor (canvas px) -> sketch coordinates on a plane. */
export function cursorOnPlane(x, y, pl = activePlane()) {
  if (!pl || !vp()) return null;
  return vp().rayPlane(x, y, pl);
}

/** Returns a projector (u,v) -> [sx, sy] in canvas CSS px for a plane, using the current camera. */
export function projector(pl) {
  const v = vp();
  const cam = v.camera;
  cam.updateMatrixWorld();
  const view = cam.matrixWorld.clone().invert();
  const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, view).multiply(planeMatrix(pl));
  const e = m.elements;
  const w = v.canvas.clientWidth || 1, h = v.canvas.clientHeight || 1;
  return (u, vv) => {
    const x = e[0] * u + e[4] * vv + e[12];
    const y = e[1] * u + e[5] * vv + e[13];
    const ww = e[3] * u + e[7] * vv + e[15];
    const iw = 1 / (ww || 1e-12);
    return [((x * iw + 1) / 2) * w, ((1 - y * iw) / 2) * h, ww];
  };
}

/** mm per CSS pixel on a plane near sketch point uv. */
export function mmPerPx(pl, uv) {
  const v = vp();
  try { return v.pixelSize(toWorld(pl, uv[0], uv[1])) || 0.1; } catch { return 0.1; }
}

export function segDist2D(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

export const fmtLen = (v) => ST.app.E.formatValue(v, "length");
export const fmtAng = (v) => ST.app.E.formatValue(v, "angle");

/** Evaluate a typed expression; returns {value} or {error}. */
export function evalExpr(text, kind = "length") {
  const t = String(text || "").trim();
  if (!t) return { error: "empty" };
  try {
    if (kind === "count") {
      const v = Math.round(Number(ST.app.E.evaluate(t, () => undefined, "none")));
      return Number.isFinite(v) ? { value: v } : { error: "invalid" };
    }
    const P = params();
    if (kind === "ratio") kind = "none";
    const v = P ? P.eval(t, kind) : ST.app.E.evaluate(t, () => undefined, kind);
    return Number.isFinite(v) ? { value: v } : { error: "invalid" };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

export function isSketchRef(r, id = ST.sketchId) {
  return !!r && (r.kind === "sketchCurve" || r.kind === "sketchPoint" || r.kind === "sketchDim" || r.kind === "sketchConstraint") && (!id || r.sketch === id);
}

export function requestRender() { const v = vp(); if (v) v.requestRender(); }

/** Plane-like selection refs -> planeRef + plane, or null. */
export function planeFromRef(r, viewDir = null) {
  const A = ST.app, K = A.K;
  if (!r) return null;
  if (r.kind === "originPlane" && K.ORIGIN_PLANES[r.name]) return { planeRef: { kind: "origin", name: r.name }, plane: { ...K.ORIGIN_PLANES[r.name] } };
  if (r.kind === "cplane") {
    const ps = A.planeState(r.id);
    if (!ps || !ps.plane) return null;
    return { planeRef: { kind: "cplane", id: r.id }, plane: { ...ps.plane } };
  }
  if (r.kind === "face" && r.planar !== false) {
    let n = r.n;
    let p = r.p;
    try {
      const b = A.body(r.body);
      const face = b && b.shape.faces[r.index];
      if (face) {
        if (face.geomType && face.geomType !== "PLANE") return null;
        const info = K.faceInfo(face);
        if (info && info.normal) {
          // keep the side the user clicked from
          n = r.n && K.V.dot(info.normal, r.n) < 0 ? K.V.mul(info.normal, -1) : info.normal;
        }
      }
    } catch { /* use the picked normal */ }
    if (!n || !p) return null;
    // the sketch normal points towards the viewer who picked the face
    if (viewDir && K.V.dot(n, viewDir) > 0) n = K.V.mul(n, -1);
    const plane = K.planeFromNormal(p, n);
    return { planeRef: { kind: "face", body: r.body, p, n, plane }, plane };
  }
  return null;
}
