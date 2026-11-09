// Rendering of sketches: curves (fat lines), points, profiles, sketch grid, tool previews,
// and the DOM overlay (dimensions with leader/extension lines, constraint glyphs).
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { ST, vp, refKey, sketchData, planeMatrix, projector, mmPerPx, toWorld, emitLocal, isSketchRef, viewportGrid } from "./ctx.js";
import { GLYPH_SVG } from "./glyphs.js";
import * as HUD from "./hud.js";

// Sketch colours (light theme). Under-constrained blue sampled from the Fusion captures
// (rendered rgb(67,164,232)); the rest from the environment files (SketchFullyConstrainedColor,
// SketchConstructionColor, SketchProjectedLineColor, SketchFixedLineColor, SketchSelectEffectInfo).
export const COLORS = {
  free: "#43a4e8", // under-constrained: the capture's crisp 1 px rgb(67,164,232)
  done: "#000000", // fully constrained
  cons: "#c75900", // construction (dashed)
  proj: "#ab63cf", // projected
  fixed: "#94bd40", // fixed
  hover: "#5aaef0",
  sel: "#2f6dc6",
  trim: "#e0262c",
  preview: "#8c8c8c", // rubber band while drawing (thin grey)
  profile: "#0596d6", // SketchProfileColor; unselected profiles are not shaded (interior stays canvas white, captures 09/10/12)
  profileHover: "#1f7bff",
  profileSel: "#1f7bff",
  gridMinor: "#dde2e8",
  gridMajor: "#c3cad3",
};
// Fusion draws sketch curves 1 px wide (captures 09/10: one crisp rgb(67,164,232) pixel across an edge)
const W = { base: 1, inactive: 1, hi: 2.2, preview: 1 };
const PROFILE_ALPHA = { base: 0, hover: 0.28, sel: 0.88 };

const R = {
  root: null, // THREE.Group in groups.sketches
  groups: new Map(), // sketch id -> group
  curves: new Map(), // refKey -> {obj, cls, sketch, curve, active}
  profiles: new Map(), // refKey -> mesh
  points: new Map(), // sketch id -> {obj, ids, cls}
  preview: null, // group inside the active sketch group
  grid: null,
  gridSig: "",
  overlay: null, // DOM root
  svg: null,
  dimEls: new Map(), // cid -> element
  glyphEls: [], // [{el, c, spot}]
  dimPreview: null, // temporary constraint-like object drawn while placing a dimension
  snapMark: null,
  trim: null,
  pending: false,
};

const matCache = new Map();
function lineMat(color, width, dashed = false, depthTest = true) {
  const key = `${color}|${width}|${dashed}|${depthTest}`;
  let m = matCache.get(key);
  if (!m) {
    // transparent pass so renderOrder puts curves above the (transparent) profile fill
    m = new LineMaterial({ color, linewidth: width, dashed, dashSize: 3, gapSize: 2, depthTest, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
    // Snap segment ends to pixel centres so a 1 px curve is one crisp full-colour pixel wide (as in Fusion)
    // rather than two half-tone pixels when it falls on a pixel boundary under MSAA.
    m.defines.SK_PIXEL_SNAP = "";
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace(
        "vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;",
        "vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;\n#ifdef SK_PIXEL_SNAP\n{ vec2 skPx = floor( ( clip.xy / clip.w * 0.5 + 0.5 ) * resolution ) + 0.5; clip.xy = ( skPx / resolution * 2.0 - 1.0 ) * clip.w; }\n#endif",
      );
    };
    const c = vp().canvas;
    m.resolution.set(c.clientWidth || 1, c.clientHeight || 1);
    matCache.set(key, m);
  }
  return m;
}
const meshMat = {};
function profileMat(kind) {
  if (!meshMat[kind]) {
    const col = kind === "hover" ? COLORS.profileHover : kind === "sel" ? COLORS.profileSel : COLORS.profile;
    meshMat[kind] = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: PROFILE_ALPHA[kind] ?? 0.06, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  }
  return meshMat[kind];
}
let dotTex = null;
function dotTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.beginPath(); g.arc(16, 16, 13, 0, Math.PI * 2); g.fill();
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

export function initRender() {
  const v = vp();
  R.root = new THREE.Group();
  R.root.name = "sketch-module";
  v.groups.sketches.add(R.root);
  // DOM overlay inside the viewport label layer
  const ov = document.createElement("div");
  ov.className = "sk-overlay";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "sk-svg");
  ov.appendChild(svg);
  v.labelLayer.appendChild(ov);
  R.overlay = ov;
  R.svg = svg;
  ST.overlay = ov;
}

// ---------------------------------------------------------------------------
// which sketches are drawn
// ---------------------------------------------------------------------------
export function visibleSketches() {
  const A = ST.app;
  const out = [];
  if (!A.doc) return out;
  for (const f of A.doc.features) {
    if (f.type !== "sketch") continue;
    const active = A.mode === "sketch" && f.id === ST.sketchId;
    if (!active && f.visible === false) continue;
    const d = sketchData(f.id);
    if (!d || !d.sk || !d.plane) continue;
    out.push({ f, d, active });
  }
  return out;
}

function fixedSet(sk) {
  const s = new Set();
  for (const c of sk.constraints) if (c.type === "fix") for (const r of c.refs) s.add(r);
  return s;
}

function curveClass(sk, id, status, fixed) {
  const cv = sk.curves[id];
  if (cv.proj) return "proj";
  if (cv.cons) return "cons";
  if (fixed.has(id) || (cv.type !== "point" && ST.app.S.curvePoints(cv).every((p) => fixed.has(p) || (sk.points[p] && sk.points[p].fixed && !sk.points[p].origin)))) return "fixed";
  if (status && status.constrained && status.constrained[id]) return "done";
  return "free";
}

function segmentsFromPolyline(pl, out) {
  for (let i = 0; i + 1 < pl.length; i++) out.push(pl[i][0], pl[i][1], 0, pl[i + 1][0], pl[i + 1][1], 0);
}

// ---------------------------------------------------------------------------
// rebuild
// ---------------------------------------------------------------------------
export function rebuild() {
  const v = vp();
  if (!v || !R.root) return;
  for (const g of R.groups.values()) disposeTree(g);
  R.root.clear();
  R.groups.clear();
  R.curves.clear();
  R.profiles.clear();
  R.points.clear();
  R.preview = null;
  R.grid = null;
  R.gridSig = "";
  const S = ST.app.S;
  const inSketch = ST.app.mode === "sketch";
  for (const { f, d, active } of visibleSketches()) {
    const g = new THREE.Group();
    g.name = `sketch:${f.id}`;
    g.matrixAutoUpdate = false;
    g.matrix.copy(planeMatrix(d.plane, 0));
    g.matrixWorldNeedsUpdate = true;
    g.userData = { sketch: f.id };
    R.root.add(g);
    R.groups.set(f.id, g);
    const sk = d.sk;
    const fixed = fixedSet(sk);
    const opts = ST.opts;
    // profiles
    if (!active || opts.showProfile) {
      const regs = (d.regions && d.regions.regions) || [];
      for (const r of regs) {
        const mesh = profileMesh(r);
        if (!mesh) continue;
        mesh.renderOrder = 1;
        mesh.userData = { ref: { kind: "profile", sketch: f.id, key: r.key } };
        g.add(mesh);
        R.profiles.set(refKey(mesh.userData.ref), mesh);
      }
    }
    // curves
    for (const id of Object.keys(sk.curves)) {
      const cv = sk.curves[id];
      if (cv.type === "point") continue;
      if (active && cv.cons && !opts.showConstruction) continue;
      if (active && cv.proj && !opts.showProjected) continue;
      if (!inSketch && cv.proj) continue; // projected geometry only shows while editing
      const pl = S.curvePolyline(sk, id, 96);
      if (pl.length < 2) continue;
      const pos = [];
      segmentsFromPolyline(pl, pos);
      const geo = new LineSegmentsGeometry();
      geo.setPositions(pos);
      const cls = curveClass(sk, id, d.status, fixed);
      const obj = new LineSegments2(geo, lineMat(COLORS[cls], active ? W.base : W.inactive, cls === "cons"));
      if (cls === "cons") obj.computeLineDistances();
      obj.renderOrder = 3;
      obj.userData = { ref: { kind: "sketchCurve", sketch: f.id, curve: id } };
      g.add(obj);
      R.curves.set(refKey(obj.userData.ref), { obj, cls, active, dashed: cls === "cons" });
    }
    // points: plain end points are not drawn (Fusion shows clean corners); sketch points and
    // centres are. The sketch origin is drawn as an overlay glyph (quartered circle).
    const big = new Set();
    for (const cv of Object.values(sk.curves)) {
      if (cv.type === "point") big.add(cv.p);
      else if ((cv.type === "circle" || cv.type === "arc") && !cv.proj) big.add(cv.c);
    }
    const sets = { s: { ids: [], cls: [] }, b: { ids: [], cls: [] } };
    const push = (pid, c) => { const k = big.has(pid) ? "b" : "s"; sets[k].ids.push(pid); sets[k].cls.push(c); };
    if (active && opts.showPoints) {
      const used = new Set();
      for (const cv of Object.values(sk.curves)) {
        if (cv.cons && !opts.showConstruction) continue;
        if (cv.proj && !opts.showProjected) continue;
        for (const p of S.curvePoints(cv)) used.add(p);
      }
      used.delete("o");
      for (const pid of used) {
        const P = sk.points[pid];
        if (!P) continue;
        const free = d.status && d.status.ptFree ? d.status.ptFree[pid] : true;
        push(pid, P.proj ? "proj" : P.fixed || fixed.has(pid) ? (P.origin ? "done" : "fixed") : free ? "free" : "done");
      }
    } else if (!active) {
      const seen = new Set();
      for (const cv of Object.values(sk.curves)) {
        if (cv.type === "point" || ((cv.type === "circle" || cv.type === "arc") && !cv.cons && !cv.proj)) {
          const pid = cv.type === "point" ? cv.p : cv.c;
          if (!sk.points[pid] || seen.has(pid) || pid === "o") continue;
          seen.add(pid);
          push(pid, d.status && d.status.ptFree && !d.status.ptFree[pid] ? "done" : "free");
        }
      }
    }
    for (const [k, set] of Object.entries(sets)) {
      const pts = set.ids;
      // plain curve end points get no dot (captures 09/10: clean rectangle corners); they stay pickable and
      // show the larger hover / selection dot. Sketch points and centres keep theirs.
      if (k === "s") continue;
      if (!pts.length) continue;
      const pos = new Float32Array(pts.length * 3);
      pts.forEach((pid, i) => { pos[i * 3] = sk.points[pid].x; pos[i * 3 + 1] = sk.points[pid].y; pos[i * 3 + 2] = 0; });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(pts.length * 3), 3));
      const size = k === "b" ? 5 : active ? 3.5 : 3;
      const mat = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, map: dotTexture(), alphaTest: 0.5, transparent: true, depthTest: false });
      const obj = new THREE.Points(geo, mat);
      obj.renderOrder = 6;
      g.add(obj);
      R.points.set(`${f.id}|${k}`, { obj, ids: pts, cls: set.cls, sketch: f.id });
    }
    if (active) {
      R.preview = new THREE.Group();
      R.preview.renderOrder = 8;
      g.add(R.preview);
    }
  }
  rebuildOverlay();
  restyle();
  updateGrid(true);
  if (R.toolPreviewSpec) setToolPreview(R.toolPreviewSpec);
  applySlice();
  v.requestRender();
  emitLocal("rendered");
}

function profileMesh(r) {
  try {
    const toV = (p) => new THREE.Vector2(p[0], p[1]);
    const shape = new THREE.Shape(r.outer.poly.map(toV));
    for (const h of r.holes) shape.holes.push(new THREE.Path(h.poly.map(toV)));
    const geo = new THREE.ShapeGeometry(shape);
    return new THREE.Mesh(geo, profileMat("base"));
  } catch {
    return null;
  }
}

function disposeTree(o) {
  o.traverse((x) => { if (x.geometry) x.geometry.dispose(); });
}

// ---------------------------------------------------------------------------
// hover / selection styling
// ---------------------------------------------------------------------------
function highlightKeys() {
  const A = ST.app;
  const hov = new Set(), sel = new Set();
  const addCons = (set, r) => {
    const d = sketchData(r.sketch);
    if (!d) return;
    const c = d.sk.constraints.find((x) => x.id === r.cid);
    if (!c) return;
    for (const e of c.refs) {
      if (d.sk.curves[e]) set.add(refKey({ kind: "sketchCurve", sketch: r.sketch, curve: e }));
      else if (d.sk.points[e]) set.add(refKey({ kind: "sketchPoint", sketch: r.sketch, point: e }));
    }
  };
  for (const r of A.selection.items) {
    sel.add(refKey(r));
    if (r.kind === "sketchConstraint" || r.kind === "sketchDim") addCons(sel, r);
  }
  const h = A.selection.hover;
  if (h) {
    hov.add(refKey(h));
    if (h.kind === "sketchConstraint" || h.kind === "sketchDim") addCons(hov, h);
  }
  for (const k of R.extraHover || []) hov.add(k);
  return { hov, sel };
}

export function setExtraHover(keys) { R.extraHover = keys || []; restyle(); }

export function restyle() {
  if (!R.root) return;
  const { hov, sel } = highlightKeys();
  for (const [k, c] of R.curves) {
    const w = c.active ? W.base : W.inactive;
    let mat;
    if (sel.has(k)) mat = lineMat(COLORS.sel, W.hi, c.dashed);
    else if (hov.has(k)) mat = lineMat(COLORS.hover, W.hi, c.dashed);
    else mat = lineMat(COLORS[c.cls], w, c.dashed);
    if (c.obj.material !== mat) c.obj.material = mat;
  }
  for (const [k, m] of R.profiles) {
    const mat = sel.has(k) ? profileMat("sel") : hov.has(k) ? profileMat("hover") : profileMat("base");
    if (m.material !== mat) m.material = mat;
  }
  const tmp = new THREE.Color();
  for (const p of R.points.values()) {
    const col = p.obj.geometry.getAttribute("color");
    p.ids.forEach((pid, i) => {
      const k = refKey({ kind: "sketchPoint", sketch: p.sketch, point: pid });
      tmp.set(sel.has(k) ? COLORS.sel : hov.has(k) ? COLORS.hover : COLORS[p.cls[i]] || COLORS.free);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    });
    col.needsUpdate = true;
  }
  // hovered / selected sketch points show as larger dots (end points are tiny otherwise)
  if (R.hot) { if (R.hot.parent) R.hot.parent.remove(R.hot); R.hot.geometry.dispose(); R.hot = null; }
  const hot = [];
  for (const [skId, g] of R.groups) {
    const d = sketchData(skId);
    if (!d) continue;
    for (const k of [...hov, ...sel]) {
      if (!k.includes("sketchPoint")) continue;
      for (const pid of Object.keys(d.sk.points)) {
        if (pid === "o") continue;
        if (refKey({ kind: "sketchPoint", sketch: skId, point: pid }) !== k) continue;
        const P = d.sk.points[pid];
        hot.push({ g, x: P.x, y: P.y, c: sel.has(k) ? COLORS.sel : COLORS.hover });
      }
    }
  }
  if (hot.length) {
    const g = hot[0].g;
    const pos = new Float32Array(hot.length * 3), cols = new Float32Array(hot.length * 3);
    hot.forEach((h, i) => { pos[i * 3] = h.x; pos[i * 3 + 1] = h.y; tmp.set(h.c); cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    if (!R.hotMat) R.hotMat = new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, map: dotTexture(), alphaTest: 0.5, transparent: true, depthTest: false });
    R.hot = new THREE.Points(geo, R.hotMat);
    R.hot.renderOrder = 7;
    g.add(R.hot);
  }
  // overlay
  for (const [cid, el] of R.dimEls) {
    const k = refKey({ kind: "sketchDim", sketch: ST.sketchId, cid });
    el.classList.toggle("sel", sel.has(k));
    el.classList.toggle("hover", hov.has(k));
  }
  for (const g of R.glyphEls) {
    const k = refKey({ kind: "sketchConstraint", sketch: ST.sketchId, cid: g.c.id });
    g.el.classList.toggle("sel", sel.has(k));
    g.el.classList.toggle("hover", hov.has(k));
  }
  vp().requestRender();
}

// ---------------------------------------------------------------------------
// tool preview (rubber band geometry in the active sketch plane)
// ---------------------------------------------------------------------------
/**
 * spec: {lines:[[a,b]], polys:[[p...]], cons:[[a,b]] (dashed construction), points:[[u,v]],
 *        trim:[[p...]] (red highlight), hi:[[p...]] (hover highlight)}
 */
export function setToolPreview(spec) {
  R.toolPreviewSpec = spec || null;
  if (!R.preview) return;
  disposeTree(R.preview);
  R.preview.clear();
  if (!spec) { vp().requestRender(); return; }
  const add = (segs, color, width, dashed) => {
    if (!segs.length) return;
    const geo = new LineSegmentsGeometry();
    geo.setPositions(segs);
    const o = new LineSegments2(geo, lineMat(color, width, dashed, false));
    if (dashed) o.computeLineDistances();
    o.renderOrder = 9;
    R.preview.add(o);
  };
  const solid = [], dashed = [], red = [], hi = [];
  for (const [a, b] of spec.lines || []) solid.push(a[0], a[1], 0, b[0], b[1], 0);
  for (const pl of spec.polys || []) segmentsFromPolyline(pl, solid);
  for (const [a, b] of spec.cons || []) dashed.push(a[0], a[1], 0, b[0], b[1], 0);
  for (const pl of spec.consPolys || []) segmentsFromPolyline(pl, dashed);
  for (const pl of spec.trim || []) segmentsFromPolyline(pl, red);
  for (const pl of spec.hi || []) segmentsFromPolyline(pl, hi);
  const constr = ST.opts.construction;
  add(solid, constr ? COLORS.cons : COLORS.preview, constr ? W.base : W.preview, constr);
  add(dashed, COLORS.cons, W.base, true);
  add(red, COLORS.trim, W.hi + 0.6, false);
  add(hi, COLORS.hover, W.hi, false);
  if (spec.points && spec.points.length) {
    const pos = new Float32Array(spec.points.length * 3);
    spec.points.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const o = new THREE.Points(geo, new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, color: COLORS.preview, map: dotTexture(), alphaTest: 0.5, transparent: true, depthTest: false }));
    o.renderOrder = 10;
    R.preview.add(o);
  }
  updateDashes();
  vp().requestRender();
}
export function clearToolPreview() { setToolPreview(null); }

// ---------------------------------------------------------------------------
// sketch grid
// ---------------------------------------------------------------------------
function niceStep(x) {
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 2, 5, 10]) if (m * e >= x) return m * e;
  return 10 * e;
}
export function gridStep() {
  const vg = viewportGrid();
  if (vg && typeof vg.gridSpacing === "function") { const s = vg.gridSpacing(); if (s > 0) return s; }
  const d = sketchData(ST.sketchId);
  if (!d) return 1;
  const v = vp();
  const t = v.target;
  const uv = ST.app.K.toLocal(d.plane, t);
  const ps = mmPerPx(d.plane, uv);
  return niceStep(ps * 18);
}
function updateGrid(force = false) {
  const g = ST.sketchId && R.groups.get(ST.sketchId);
  // the viewport draws its layout grid on the sketch plane itself; only draw ours without it
  const want = ST.app.mode === "sketch" && ST.opts.grid && g && !viewportGrid();
  if (!want) {
    if (R.grid) { R.grid.parent && R.grid.parent.remove(R.grid); R.grid.geometry.dispose(); R.grid = null; R.gridSig = ""; }
    return;
  }
  const d = sketchData(ST.sketchId);
  const v = vp();
  const c = ST.app.K.toLocal(d.plane, v.target);
  const ps = mmPerPx(d.plane, c);
  const step = niceStep(ps * 18);
  const major = step * 5;
  const ext = Math.max(v.canvas.clientWidth, v.canvas.clientHeight) * ps * 1.4;
  const nExt = Math.ceil(ext / major) * major;
  const cx = Math.round(c[0] / major) * major, cy = Math.round(c[1] / major) * major;
  const sig = `${step}|${cx}|${cy}|${nExt}`;
  if (!force && sig === R.gridSig && R.grid && R.grid.parent === g) return;
  if (R.grid) { R.grid.parent && R.grid.parent.remove(R.grid); R.grid.geometry.dispose(); }
  const pos = [], col = [];
  const cMin = new THREE.Color(COLORS.gridMinor).convertSRGBToLinear(), cMaj = new THREE.Color(COLORS.gridMajor).convertSRGBToLinear();
  const n = Math.round(nExt / step);
  for (let i = -n; i <= n; i++) {
    const isMaj = Math.abs(Math.round((cx + i * step) / major) * major - (cx + i * step)) < step * 1e-3;
    const cc = isMaj ? cMaj : cMin;
    const x = cx + i * step, y = cy + i * step;
    pos.push(x, cy - nExt, 0, x, cy + nExt, 0, cx - nExt, y, 0, cx + nExt, y, 0);
    for (let k = 0; k < 4; k++) col.push(cc.r, cc.g, cc.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true });
  R.grid = new THREE.LineSegments(geo, mat);
  R.grid.renderOrder = 0;
  R.grid.position.z = 0;
  g.add(R.grid);
  R.gridSig = sig;
  v.requestRender();
}

// ---------------------------------------------------------------------------
// Slice: clip bodies in front of the sketch plane
// ---------------------------------------------------------------------------
export function applySlice() {
  const v = vp();
  if (!v) return;
  const d = ST.app.mode === "sketch" && ST.opts.slice && sketchData(ST.sketchId);
  let planes = null;
  if (d) {
    const n = new THREE.Vector3(...d.plane.n);
    const o = new THREE.Vector3(...d.plane.o);
    planes = [new THREE.Plane(n.clone().negate(), n.dot(o) + 1e-3)];
  }
  if (planes) v.renderer.localClippingEnabled = true;
  const sig = planes ? `${planes[0].normal.toArray().map((x) => x.toFixed(6))}|${planes[0].constant.toFixed(6)}` : "";
  let changed = false;
  v.groups.bodies.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      const cur = (m.userData && m.userData.skSlice) || "";
      if (cur === sig) continue; // unchanged: avoid shader recompiles on every rebuild
      m.userData = m.userData || {};
      m.userData.skSlice = sig;
      m.clippingPlanes = planes;
      m.needsUpdate = true;
      changed = true;
    }
  });
  if (changed) v.requestRender();
}

// ---------------------------------------------------------------------------
// overlay: dimensions + constraint glyphs + inference marks
// ---------------------------------------------------------------------------
const DIM_TYPES = new Set(["distance", "pointLine", "diameter", "radius", "angle"]);
export const isDimType = (t) => DIM_TYPES.has(t);

function rebuildOverlay() {
  const ov = R.overlay;
  if (!ov) return;
  for (const el of R.dimEls.values()) el.remove();
  for (const g of R.glyphEls) g.el.remove();
  R.dimEls.clear();
  R.glyphEls = [];
  const A = ST.app;
  const ov2 = vp().objectVisibility || {};
  const d = A.mode === "sketch" && ov2.sketches !== false && sketchData(ST.sketchId);
  if (d) {
    const sk = d.sk;
    if (ST.opts.showDims && ov2.sketchDimensions !== false) {
      for (const c of sk.constraints) {
        if (!isDimType(c.type)) continue;
        if (!c.refs.every((r) => sk.points[r] || sk.curves[r])) continue;
        const el = document.createElement("div");
        el.className = "sk-dim" + (c.driven ? " driven" : "");
        el.dataset.cid = c.id;
        el.dataset.dim = c.param || "";
        ov.appendChild(el);
        R.dimEls.set(c.id, el);
        emitLocal("dim-el", { el, c });
      }
    }
    if (ST.opts.showCons) {
      for (const c of sk.constraints) {
        if (!GLYPH_SVG[c.type]) continue;
        for (const spot of glyphSpots(sk, c)) {
          const el = document.createElement("div");
          el.className = "sk-glyph";
          el.dataset.cid = c.id;
          el.dataset.type = c.type;
          el.innerHTML = GLYPH_SVG[c.type];
          el.title = GLYPH_TITLE[c.type] || c.type;
          ov.appendChild(el);
          R.glyphEls.push({ el, c, spot });
          emitLocal("glyph-el", { el, c });
        }
      }
    }
  }
  ov.classList.toggle("tool-active", !!ST.tool);
  updateOverlay();
}

const GLYPH_TITLE = {
  horizontal: "Horizontal", vertical: "Vertical", parallel: "Parallel", perpendicular: "Perpendicular",
  coincident: "Coincident", onCurve: "Coincident", tangent: "Tangent", equal: "Equal", midpoint: "Midpoint",
  concentric: "Concentric", collinear: "Collinear", symmetric: "Symmetric", fix: "Fixed",
};

const P2 = (sk, id) => [sk.points[id].x, sk.points[id].y];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul2 = (a, s) => [a[0] * s, a[1] * s];
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
const len2 = (a) => Math.hypot(a[0], a[1]);
const unit2 = (a) => { const l = len2(a) || 1; return [a[0] / l, a[1] / l]; };
const perp2 = (a) => [-a[1], a[0]];

function curveMid(sk, id) {
  const cv = sk.curves[id];
  if (cv.type === "line") { const a = P2(sk, cv.p1), b = P2(sk, cv.p2); return { p: mul2(add2(a, b), 0.5), n: perp2(unit2(sub(b, a))) }; }
  if (cv.type === "circle") { const c = P2(sk, cv.c); const r = Math.abs(cv.r); return { p: [c[0], c[1] + r], n: [0, 1] }; }
  if (cv.type === "arc") {
    const g = ST.app.S.curvePolyline(sk, id, 32);
    const m = g[Math.floor(g.length / 2)];
    const c = P2(sk, cv.c);
    return { p: m, n: unit2(sub(m, c)) };
  }
  if (cv.type === "point") return { p: P2(sk, cv.p), n: [0.7, 0.7] };
  return null;
}

/** Where constraint glyphs go: [{p:[u,v], n:[du,dv], ent}] in sketch coordinates. */
function glyphSpots(sk, c) {
  const out = [];
  const R0 = c.refs;
  const onCurve = (id) => { const m = sk.curves[id] && curveMid(sk, id); if (m) out.push({ ...m, ent: id }); };
  const atPoint = (id) => { if (sk.points[id]) out.push({ p: P2(sk, id), n: [0.7, 0.7], ent: id, pt: true }); };
  try {
    switch (c.type) {
      case "horizontal": case "vertical":
        if (R0.length === 1) onCurve(R0[0]);
        else if (sk.points[R0[0]] && sk.points[R0[1]]) { const a = P2(sk, R0[0]), b = P2(sk, R0[1]); out.push({ p: mul2(add2(a, b), 0.5), n: perp2(unit2(sub(b, a))), ent: R0[0] + R0[1] }); }
        break;
      case "parallel": case "perpendicular": case "collinear": case "equal":
        onCurve(R0[0]); onCurve(R0[1]); break;
      case "tangent": {
        let [l, k] = R0;
        if (sk.curves[k] && sk.curves[k].type === "line") [l, k] = [k, l];
        const L = sk.curves[l], C = sk.curves[k];
        if (!L || !C) break;
        if (L.type === "line") {
          const a = P2(sk, L.p1), b = P2(sk, L.p2), cc = P2(sk, C.c);
          const u = unit2(sub(b, a));
          const foot = add2(a, mul2(u, dot2(sub(cc, a), u)));
          out.push({ p: foot, n: unit2(sub(foot, cc)), ent: "t" + c.id });
        } else {
          const c1 = P2(sk, L.c), c2 = P2(sk, C.c);
          const u = unit2(sub(c2, c1));
          const p = add2(c1, mul2(u, Math.abs(L.r)));
          out.push({ p, n: perp2(u), ent: "t" + c.id });
        }
        break;
      }
      case "coincident": atPoint(R0[0]); break;
      case "onCurve": case "midpoint": atPoint(R0[0]); break;
      case "concentric": { const cv = sk.curves[R0[0]]; if (cv && sk.points[cv.c]) out.push({ p: P2(sk, cv.c), n: [0.7, -0.7], ent: cv.c, pt: true }); break; }
      case "symmetric":
        for (const r of R0.slice(0, 2)) { if (sk.points[r]) atPoint(r); else onCurve(r); }
        break;
      case "fix":
        for (const r of R0) { if (sk.points[r]) atPoint(r); else onCurve(r); }
        break;
      default: break;
    }
  } catch { /* stale refs */ }
  return out;
}

/** Dimension geometry in sketch coordinates for constraint c (may be a temporary object). */
export function dimGeom(sk, c, ps) {
  const S = ST.app.S;
  const at = ST.dimAt[c.id] || c.at;
  const value = S.measureDim(sk, c);
  const gap = 6 * ps, over = 6 * ps;
  const res = { lines: [], ext: [], arrows: [], arcs: [], text: null, textDir: null, value, anchor: null };
  if (c.type === "distance" || c.type === "pointLine") {
    let A, B, u, nrm;
    if (c.type === "distance") {
      if (c.refs.length === 1) { const cv = sk.curves[c.refs[0]]; A = P2(sk, cv.p1); B = P2(sk, cv.p2); }
      else { A = P2(sk, c.refs[0]); B = P2(sk, c.refs[1]); }
    } else {
      A = P2(sk, c.refs[0]);
      const cv = sk.curves[c.refs[1]];
      const a = P2(sk, cv.p1), b = P2(sk, cv.p2);
      const lu = unit2(sub(b, a));
      B = add2(a, mul2(lu, dot2(sub(A, a), lu)));
    }
    const mid = mul2(add2(A, B), 0.5);
    res.anchor = mid;
    const type = c.type === "distance" ? c.dimType || "aligned" : "aligned";
    if (type === "horizontal") { u = [1, 0]; nrm = [0, 1]; }
    else if (type === "vertical") { u = [0, 1]; nrm = [-1, 0]; }
    else { u = unit2(sub(B, A)); if (len2(sub(B, A)) < 1e-9) u = [1, 0]; nrm = perp2(u); }
    const vert = type === "vertical" || (type === "aligned" && Math.abs(u[1]) > Math.abs(u[0]));
    const L = at ? add2(mid, at) : add2(mid, mul2(type === "horizontal" ? [0, -1] : type === "vertical" ? [1, 0] : nrm, (vert ? 34 : 16) * ps));
    // dimension line: through L, along u; feet of A and B
    const hA = dot2(sub(L, A), nrm), hB = dot2(sub(L, B), nrm);
    const d1 = add2(A, mul2(nrm, hA)), d2 = add2(B, mul2(nrm, hB));
    const sgnA = Math.sign(hA) || 1, sgnB = Math.sign(hB) || 1;
    if (Math.abs(hA) > gap) res.ext.push([add2(A, mul2(nrm, sgnA * gap)), add2(d1, mul2(nrm, sgnA * over))]);
    if (Math.abs(hB) > gap) res.ext.push([add2(B, mul2(nrm, sgnB * gap)), add2(d2, mul2(nrm, sgnB * over))]);
    // text along the dimension line at L
    const t = dot2(sub(L, d1), u);
    const T = add2(d1, mul2(u, t));
    const span = dot2(sub(d2, d1), u);
    const lo = Math.min(0, span), hi = Math.max(0, span);
    const ext = Math.min(lo, t) , ext2 = Math.max(hi, t);
    res.lines.push([add2(d1, mul2(u, ext)), add2(d1, mul2(u, ext2))]);
    const dir = span >= 0 ? 1 : -1;
    const inside = Math.abs(span) > 24 * ps;
    res.arrows.push({ tip: d1, dir: mul2(u, inside ? -dir : dir) });
    res.arrows.push({ tip: d2, dir: mul2(u, inside ? dir : -dir) });
    res.text = T;
    res.textDir = u;
  } else if (c.type === "diameter" || c.type === "radius") {
    const cv = sk.curves[c.refs[0]];
    const C = P2(sk, cv.c);
    const r = Math.abs(cv.r);
    res.anchor = C;
    const L = at ? add2(C, at) : add2(C, mul2([0.7071, 0.7071], r + 40 * ps));
    const u = unit2(sub(L, C));
    const far = len2(sub(L, C));
    const rim = add2(C, mul2(u, r));
    if (c.type === "diameter") {
      const rim2 = add2(C, mul2(u, -r));
      res.lines.push([rim2, far > r ? L : rim]);
      res.arrows.push({ tip: rim, dir: u });
      res.arrows.push({ tip: rim2, dir: mul2(u, -1) });
    } else {
      res.lines.push([C, far > r ? L : rim]);
      res.arrows.push({ tip: rim, dir: u });
    }
    res.text = L;
  } else if (c.type === "angle") {
    const l1 = sk.curves[c.refs[0]], l2 = sk.curves[c.refs[1]];
    const a = P2(sk, l1.p1), b = P2(sk, l1.p2), d = P2(sk, l2.p1), e = P2(sk, l2.p2);
    const s1 = c.flip1 ? -1 : 1, s2 = c.flip2 ? -1 : 1;
    const u1 = unit2(mul2(sub(b, a), s1)), u2 = unit2(mul2(sub(e, d), s2));
    const den = (a[0] - b[0]) * (d[1] - e[1]) - (a[1] - b[1]) * (d[0] - e[0]);
    let X;
    if (Math.abs(den) < 1e-12) X = mul2(add2(a, d), 0.5);
    else {
      const t = ((a[0] - d[0]) * (d[1] - e[1]) - (a[1] - d[1]) * (d[0] - e[0])) / den;
      X = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
    res.anchor = X;
    const bis = unit2(add2(u1, u2));
    const L = at ? add2(X, at) : add2(X, mul2(len2(bis) > 1e-9 ? bis : perp2(u1), 30 * ps));
    const rr = Math.max(len2(sub(L, X)), 6 * ps);
    let a0 = Math.atan2(u1[1], u1[0]), a1 = Math.atan2(u2[1], u2[0]);
    let sw = a1 - a0;
    while (sw > Math.PI) sw -= 2 * Math.PI;
    while (sw < -Math.PI) sw += 2 * Math.PI;
    res.arcs.push({ c: X, r: rr, a0, sw });
    const e0 = add2(X, mul2([Math.cos(a0), Math.sin(a0)], rr)), e1 = add2(X, mul2([Math.cos(a0 + sw), Math.sin(a0 + sw)], rr));
    const tg = (ang, s) => mul2([-Math.sin(ang), Math.cos(ang)], s);
    res.arrows.push({ tip: e0, dir: tg(a0, -Math.sign(sw) || -1) });
    res.arrows.push({ tip: e1, dir: tg(a0 + sw, Math.sign(sw) || 1) });
    // extension lines from the nearest line ends to the arc
    const extTo = (p, q, uu, end) => {
      const tt = dot2(sub(end, p), uu);
      const tq = dot2(sub(q, p), uu);
      const reach = Math.max(0, tt);
      if (reach > Math.max(0, tq) + gap) res.ext.push([add2(p, mul2(uu, Math.max(0, tq) + gap)), add2(p, mul2(uu, reach + over))]);
    };
    extTo(X, s1 > 0 ? b : a, u1, e0);
    extTo(X, s2 > 0 ? e : d, u2, e1);
    res.text = L;
  }
  return res;
}

/** Dimension text as Fusion shows it: "20.00", "Ø16.00", "R8.00", "45.0°"; driven "(20.00)". */
export function dimText(c, value) {
  const E = ST.app.E;
  const r = Math.abs(value) < 1e-9 ? 0 : value;
  let s = c.type === "angle" ? `${r.toFixed(1)}°` : r.toFixed(2);
  if (c.type === "diameter") s = "Ø" + s;
  else if (c.type === "radius") s = "R" + s;
  if (c.driven) return `(${s})`;
  const P = ST.app.result && ST.app.result.params;
  if (c.expr && P && E.identifiers(c.expr).some((id) => P.has(id))) s = "fx: " + s;
  return s;
}

/** Temporary dimension shown while placing (Dimension tool). */
export function setDimPreview(c) { R.dimPreview = c; updateOverlay(); }

/** Inference marks: {at:[u,v], kind, align:[{from:[u,v], to:[u,v]}]} */
export function setSnapMark(m) { R.snapMark = m; updateOverlay(); }

/**
 * Heads-up dimensions drawn while a tool is active (grey, with arrows and extension lines) and the
 * anchors of the HUD value boxes on them. Specs (sketch coordinates):
 *   {kind:'linear', id?, value?, A, B, n:[u,v] (side), off: px}
 *   {kind:'angle', id?, value?, C, d0, d1, r: px}            arc from direction d0 to d1 (+ dashed reference)
 *   {kind:'diam', id?, value?, C, dir, r}                      diameter line through C
 *   {kind:'cross', at, size: px}                               small crosshair (rubber band corners)
 */
export function setHudDims(list) { R.hudDims = list && list.length ? list : null; updateOverlay(); }
export function clearHudDims() { if (R.hudDims) { R.hudDims = null; updateOverlay(); } }

function arrowPath(proj, tip, dir, ps) {
  const s = proj(tip[0], tip[1]);
  const q = proj(tip[0] - dir[0] * ps * 8, tip[1] - dir[1] * ps * 8);
  return arrowPx(s, [s[0] - q[0], s[1] - q[1]]);
}
/** Narrow filled arrowhead at screen point s pointing along d. */
function arrowPx(s, d, L = 9, w = 2.4) {
  const l = Math.hypot(d[0], d[1]) || 1;
  const ux = d[0] / l, uy = d[1] / l;
  const bx = s[0] - ux * L, by = s[1] - uy * L;
  return `M${s[0].toFixed(1)},${s[1].toFixed(1)}L${(bx - uy * w).toFixed(1)},${(by + ux * w).toFixed(1)}L${(bx + uy * w).toFixed(1)},${(by - ux * w).toFixed(1)}Z`;
}
const segPx = (a, b) => `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;

function pathOf(proj, pts) {
  let s = "";
  pts.forEach((p, i) => { const q = proj(p[0], p[1]); s += `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`; });
  return s;
}

/** Straight dimension / extension segment; horizontal and vertical ones sit on pixel centres so the
 * 1 px stroke stays one crisp dark pixel (as in Fusion) instead of two half-grey ones. */
function segPath(proj, seg) {
  if (seg.length !== 2) return pathOf(proj, seg);
  const a = proj(seg[0][0], seg[0][1]), b = proj(seg[1][0], seg[1][1]);
  const mid = (u, v) => Math.floor((u + v) / 2) + 0.5;
  if (Math.abs(a[0] - b[0]) < 0.5) { const x = mid(a[0], b[0]); a[0] = b[0] = x; }
  else if (Math.abs(a[1] - b[1]) < 0.5) { const y = mid(a[1], b[1]); a[1] = b[1] = y; }
  return segPx(a, b);
}

/** Screen geometry of a HUD dimension spec: {lines, ext, arrows, ref, cross, anchor}. */
function hudDimScreen(proj, ps, sp) {
  const out = { lines: "", ext: "", arrows: "", ref: "", cross: "", anchor: null };
  const P = (p) => proj(p[0], p[1]);
  if (sp.kind === "linear") {
    const sA = P(sp.A), sB = P(sp.B);
    const q = P([sp.A[0] + sp.n[0] * ps * 10, sp.A[1] + sp.n[1] * ps * 10]);
    let nx = q[0] - sA[0], ny = q[1] - sA[1];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const off = sp.off || 78, gap = 6, over = 6;
    const dA = [sA[0] + nx * off, sA[1] + ny * off], dB = [sB[0] + nx * off, sB[1] + ny * off];
    out.ext += segPx([sA[0] + nx * gap, sA[1] + ny * gap], [dA[0] + nx * over, dA[1] + ny * over]);
    out.ext += segPx([sB[0] + nx * gap, sB[1] + ny * gap], [dB[0] + nx * over, dB[1] + ny * over]);
    out.lines += segPx(dA, dB);
    const span = Math.hypot(dB[0] - dA[0], dB[1] - dA[1]);
    const inside = span > 24 ? 1 : -1;
    out.arrows += arrowPx(dA, [(dA[0] - dB[0]) * inside, (dA[1] - dB[1]) * inside]);
    out.arrows += arrowPx(dB, [(dB[0] - dA[0]) * inside, (dB[1] - dA[1]) * inside]);
    out.anchor = [(dA[0] + dB[0]) / 2, (dA[1] + dB[1]) / 2];
  } else if (sp.kind === "angle") {
    const sC = P(sp.C);
    const dir = (d) => { const q = P([sp.C[0] + d[0] * ps * 10, sp.C[1] + d[1] * ps * 10]); const l = Math.hypot(q[0] - sC[0], q[1] - sC[1]) || 1; return [(q[0] - sC[0]) / l, (q[1] - sC[1]) / l]; };
    const e0 = dir(sp.d0), e1 = dir(sp.d1);
    const r = sp.r || 40;
    if (sp.reference !== false) out.ref += segPx(sC, [sC[0] + e0[0] * (r + 14), sC[1] + e0[1] * (r + 14)]);
    const a0 = Math.atan2(e0[1], e0[0]);
    let sw = Math.atan2(e1[1], e1[0]) - a0;
    while (sw > Math.PI) sw -= 2 * Math.PI;
    while (sw < -Math.PI) sw += 2 * Math.PI;
    if (Math.abs(sw) > 1e-3) {
      const n = Math.max(6, Math.ceil(Math.abs(sw) / 0.06));
      let d = "";
      for (let i = 0; i <= n; i++) { const t = a0 + (sw * i) / n; d += `${i ? "L" : "M"}${(sC[0] + r * Math.cos(t)).toFixed(1)},${(sC[1] + r * Math.sin(t)).toFixed(1)}`; }
      out.lines += d;
      if (Math.abs(sw) * r > 22) {
        const tip = (t, s) => { const p = [sC[0] + r * Math.cos(t), sC[1] + r * Math.sin(t)]; return arrowPx(p, [-Math.sin(t) * s, Math.cos(t) * s], 8, 2.2); };
        out.arrows += tip(a0, -Math.sign(sw)) + tip(a0 + sw, Math.sign(sw));
      }
    }
    const am = a0 + sw / 2;
    const an = [sC[0] + (r + 12) * Math.cos(am), sC[1] + (r + 12) * Math.sin(am)];
    // keep the box (anchor-30 .. anchor+88, +-10) off the start point: a press there starts a tangent arc
    if (sC[0] > an[0] - 40 && sC[0] < an[0] + 98 && Math.abs(sC[1] - (an[1] + 4)) < 20) an[1] = sC[1] + (an[1] >= sC[1] ? 26 : -30);
    out.anchor = an;
  } else if (sp.kind === "diam") {
    const a = [sp.C[0] - sp.dir[0] * sp.r, sp.C[1] - sp.dir[1] * sp.r], b = [sp.C[0] + sp.dir[0] * sp.r, sp.C[1] + sp.dir[1] * sp.r];
    const sa = P(a), sb = P(b);
    out.lines += segPx(sa, sb);
    if (Math.hypot(sb[0] - sa[0], sb[1] - sa[1]) > 24) {
      out.arrows += arrowPx(sa, [sa[0] - sb[0], sa[1] - sb[1]]) + arrowPx(sb, [sb[0] - sa[0], sb[1] - sa[1]]);
    }
    // the box sits just outside the circle, past the rim the cursor is on
    const dx = sb[0] - sa[0];
    out.anchor = dx >= 0 ? [sb[0] + 14, sb[1]] : [sb[0] - 102, sb[1]];
  } else if (sp.kind === "cross") {
    const s = P(sp.at), k = sp.size || 8;
    out.cross += segPx([s[0] - k, s[1]], [s[0] + k, s[1]]) + segPx([s[0], s[1] - k], [s[0], s[1] + k]);
  }
  return out;
}

/** Screen placement of a dimension label: centre point + rotation so the text runs along the line, on its far side. */
function labelPlacement(proj, g, ps) {
  const s = proj(g.text[0], g.text[1]);
  if (!g.textDir) return { x: s[0], y: s[1], rot: 0 };
  const q = proj(g.text[0] + g.textDir[0] * ps * 10, g.text[1] + g.textDir[1] * ps * 10);
  let th = Math.atan2(q[1] - s[1], q[0] - s[0]) * 180 / Math.PI;
  if (th > 90.5) th -= 180;
  else if (th <= -89.5) th += 180;
  const r = th * Math.PI / 180;
  const up = [Math.sin(r), -Math.cos(r)];
  return { x: s[0] + up[0] * 10, y: s[1] + up[1] * 10, rot: Math.abs(th) < 0.05 ? 0 : th };
}

const ORIGIN_SVG = '<svg viewBox="0 0 17 17" width="17" height="17"><circle cx="8.5" cy="8.5" r="7.6" fill="#fff" stroke="#9c9c9c" stroke-width="1.1"/><path d="M8.5 8.5V1.4A7.1 7.1 0 0 1 15.6 8.5zM8.5 8.5v7.1A7.1 7.1 0 0 1 1.4 8.5z" fill="#a9a9a9"/></svg>';

/** Reposition DOM labels after camera changes. */
export function updateOverlay() {
  const ov = R.overlay;
  if (!ov) return;
  const A = ST.app;
  const d = A.mode === "sketch" && sketchData(ST.sketchId);
  let lines = "", arrows = "", ext = "", infer = "", prevLines = "", prevArrows = "", hudL = "", hudE = "", hudA = "", hudR = "", cross = "";
  let originEl = ov.querySelector(".sk-origin");
  if (d) {
    const sk = d.sk;
    const proj = projector(d.plane);
    const center = A.K.toLocal(d.plane, vp().target);
    const ps = mmPerPx(d.plane, center);
    const drawDim = (c, el, preview) => {
      let g;
      try { g = dimGeom(sk, c, ps); } catch { return; }
      let L = "", Ar = "", X = "";
      for (const seg of g.lines) L += segPath(proj, seg);
      for (const a of g.arcs) {
        const n = Math.max(8, Math.ceil(Math.abs(a.sw) / 0.08));
        const pts = [];
        for (let i = 0; i <= n; i++) { const t = a.a0 + (a.sw * i) / n; pts.push([a.c[0] + a.r * Math.cos(t), a.c[1] + a.r * Math.sin(t)]); }
        L += pathOf(proj, pts);
      }
      for (const seg of g.ext) X += segPath(proj, seg);
      for (const a of g.arrows) Ar += arrowPath(proj, a.tip, a.dir, ps);
      if (preview) { prevLines += L + X; prevArrows += Ar; }
      else { lines += L; ext += X; arrows += Ar; }
      if (el && g.text) {
        const pl = labelPlacement(proj, g, ps);
        el.style.left = `${pl.x}px`;
        el.style.top = `${pl.y}px`;
        el.style.transform = pl.rot ? `translate(-50%, -50%) rotate(${pl.rot.toFixed(2)}deg)` : "";
        const txt = dimText(c, g.value);
        if (el.textContent !== txt) el.textContent = txt;
      }
      return g;
    };
    for (const [cid, el] of R.dimEls) {
      const c = sk.constraints.find((x) => x.id === cid);
      if (!c) { el.style.display = "none"; continue; }
      el.style.display = "";
      drawDim(c, el, false);
    }
    if (R.dimPreview) {
      let el = ov.querySelector(".sk-dim.preview");
      if (!el) { el = document.createElement("div"); el.className = "sk-dim preview"; ov.appendChild(el); }
      if (R.dimPreview.hideLabel) el.style.display = "none"; else el.style.display = "";
      drawDim(R.dimPreview, el, true);
    } else {
      const el = ov.querySelector(".sk-dim.preview");
      if (el) el.remove();
    }
    // heads-up dimensions of the active tool (+ the value boxes on them)
    for (const sp of R.hudDims || []) {
      let h;
      try { h = hudDimScreen(proj, ps, sp); } catch { continue; }
      hudL += h.lines; hudE += h.ext; hudA += h.arrows; hudR += h.ref; cross += h.cross;
      if (sp.id && h.anchor) HUD.hudSet(sp.id, sp.value, h.anchor);
    }
    // glyphs (stacked per entity): horizontal-ish lines get theirs below, vertical-ish ones to the right
    const stack = new Map();
    for (const g of R.glyphEls) {
      const sp = g.spot;
      const s = proj(sp.p[0], sp.p[1]);
      const s2 = proj(sp.p[0] + sp.n[0] * ps * 10, sp.p[1] + sp.n[1] * ps * 10);
      let nx = s2[0] - s[0], ny = s2[1] - s[1];
      const L = Math.hypot(nx, ny) || 1;
      nx /= L; ny /= L;
      if (!sp.pt && !sp.keepSide && (Math.abs(ny) >= Math.abs(nx) ? ny < 0 : nx < 0)) { nx = -nx; ny = -ny; }
      const k = stack.get(sp.ent) || 0;
      stack.set(sp.ent, k + 1);
      const hv = g.c.type === "horizontal" || g.c.type === "vertical";
      const off = sp.pt ? 11 : hv ? 10 : 12;
      const tx = -ny, ty = nx; // along the curve
      const step = hv ? 27 : 17;
      const x = s[0] + nx * off + tx * k * step, y = s[1] + ny * off + ty * k * step;
      g.el.style.left = `${x}px`;
      g.el.style.top = `${y}px`;
    }
    // inference / snap marks
    const m = R.snapMark;
    if (m) {
      for (const al of m.align || []) infer += pathOf(proj, [al.from, al.to]);
    }
    // sketch origin point
    const O = sk.points.o;
    if (O) {
      if (!originEl) { originEl = document.createElement("div"); originEl.className = "sk-origin"; originEl.innerHTML = ORIGIN_SVG; ov.appendChild(originEl); }
      const so = proj(O.x, O.y);
      originEl.style.display = "";
      originEl.style.left = `${so[0]}px`;
      originEl.style.top = `${so[1]}px`;
      const h = A.selection.hover;
      originEl.classList.toggle("hover", !!h && h.kind === "sketchPoint" && h.point === "o");
    } else if (originEl) originEl.style.display = "none";
  } else if (originEl) originEl.style.display = "none";
  R.svg.innerHTML =
    (ext ? `<path class="sk-ext" d="${ext}"/>` : "") +
    (lines ? `<path class="sk-dimline" d="${lines}"/>` : "") +
    (arrows ? `<path class="sk-arrow" d="${arrows}"/>` : "") +
    (prevLines ? `<path class="sk-dimline preview" d="${prevLines}"/>` : "") +
    (prevArrows ? `<path class="sk-arrow preview" d="${prevArrows}"/>` : "") +
    (hudE ? `<path class="sk-hudext" d="${hudE}"/>` : "") +
    (hudL ? `<path class="sk-hudline" d="${hudL}"/>` : "") +
    (hudA ? `<path class="sk-hudarrow" d="${hudA}"/>` : "") +
    (hudR ? `<path class="sk-hudref" d="${hudR}"/>` : "") +
    (cross ? `<path class="sk-cross" d="${cross}"/>` : "") +
    (infer ? `<path class="sk-infer" d="${infer}"/>` : "");
  // snap glyph near the cursor
  let sg = ov.querySelector(".sk-snap");
  const m = R.snapMark;
  if (d && m && m.at && m.kind) {
    const proj = projector(d.plane);
    const s = proj(m.at[0], m.at[1]);
    if (!sg) { sg = document.createElement("div"); sg.className = "sk-snap"; ov.appendChild(sg); }
    sg.dataset.kind = m.kind;
    sg.innerHTML = GLYPH_SVG[SNAP_GLYPH[m.kind]] || "";
    sg.style.left = `${s[0]}px`;
    sg.style.top = `${s[1]}px`;
    sg.style.display = SNAP_GLYPH[m.kind] ? "" : "none";
    let box = ov.querySelector(".sk-snapbox");
    if (!box) { box = document.createElement("div"); box.className = "sk-snapbox"; ov.appendChild(box); }
    box.style.left = `${s[0]}px`;
    box.style.top = `${s[1]}px`;
    box.style.display = ["point", "origin", "center", "midpoint", "oncurve", "endpoint"].includes(m.kind) ? "" : "none";
  } else {
    if (sg) sg.style.display = "none";
    const box = ov.querySelector(".sk-snapbox");
    if (box) box.style.display = "none";
  }
  emitLocal("overlay");
}

const SNAP_GLYPH = { point: "coincident", origin: "coincident", center: "concentric", midpoint: "midpoint", oncurve: "coincident", horizontal: "horizontal", vertical: "vertical", tangent: "tangent", perpendicular: "perpendicular", parallel: "parallel" };

export function dimElement(cid) { return R.dimEls.get(cid) || null; }
export function dimElements() { return R.dimEls; }

// ---------------------------------------------------------------------------
// camera-dependent refresh
// ---------------------------------------------------------------------------
let lastRes = "";
function updateDashes() {
  const d = sketchData(ST.sketchId) || (visibleSketches()[0] && visibleSketches()[0].d);
  const v = vp();
  let ps = 0.2;
  if (d) ps = mmPerPx(d.plane, ST.app.K.toLocal(d.plane, v.target));
  for (const m of matCache.values()) if (m.dashed) { m.dashSize = 6 * ps; m.gapSize = 4 * ps; }
}
export function onCamera() {
  const v = vp();
  if (!v) return;
  const w = v.canvas.clientWidth || 1, h = v.canvas.clientHeight || 1;
  const sig = `${w}x${h}`;
  if (sig !== lastRes) {
    lastRes = sig;
    for (const m of matCache.values()) m.resolution.set(w, h);
    v.requestRender();
  }
  updateDashes();
  updateGrid(false);
  updateOverlay();
}

export function worldOf(sketchId, uv) {
  const d = sketchData(sketchId);
  return d ? toWorld(d.plane, uv[0], uv[1]) : null;
}

export { isSketchRef };
