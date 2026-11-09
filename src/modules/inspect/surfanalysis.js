// On-canvas display of the surface analyses (Fusion's INSPECT analyses kept in the browser Analysis folder):
//   zebra          reflected black / white stripes (view space, or locked to the view at lock time)
//   draft          draft-angle bands for a pull direction (green / yellow / red / cyan / blue) + legend
//   curvatureMap   Gaussian (smooth or bands, scale) / Principal Minimum / Principal Maximum (limits) + legend
//   curvatureComb  curvature combs (teeth + envelope) on edges and sketch curves
//   isocurve       U / V isocurves (+ optional combs) on bodies / faces
//   environmentMap chrome / reflective look with a procedural environment (rotation, mirror)
//   accessibility  reachable (green) / not reachable (red) from a direction: GPU depth map from that direction
//   minimumRadius  concave regions coloured by radius between Minimum Radius and Maximum Tool Radius + sharp edges
// Curvature values come from the exact B-rep surfaces (curvature.js, OCCT EvalD2), never from mesh normals.
// Overlays are extra meshes over the body meshes (inside viewport.groups.bodies, so Section Analysis clipping,
// body visibility and the "Bodies" visibility toggle apply to them), never pickable.
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { bodyCurvature, edgeSamples, planarCurveSamples, faceIsoCurves, concaveSharpEdges } from "./curvature.js";
import { freeformGeom } from "../../sketch/curves.js";
import { evalExpr } from "./analyses.js";
import { fmtNum } from "./geom.js";

export const SURFACE_TYPES = ["zebra", "draft", "curvatureMap", "curvatureComb", "isocurve", "environmentMap", "accessibility", "minimumRadius"];

const V3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

// Fusion's draft-analysis colour language (forum + help): green = OK along the positive pull direction,
// blue = OK along the negative direction, red = not enough draft either way, yellow / cyan = the tolerance
// zones between red and green / red and blue.
export const DRAFT_COLORS = { green: "#2fb344", yellow: "#f2d21b", red: "#e0352b", cyan: "#27c4d6", blue: "#2d5be3" };
// Gaussian curvature scale: red, orange, yellow (positive) - green (flat) - blue, indigo, violet (negative)
export const GAUSS_COLORS = ["#7f2fd0", "#4b3bd1", "#2f6fe0", "#3cbf3c", "#f2e01c", "#f5961d", "#e2302a"];

// ------------------------------------------------------------------ shaders
const VERT = `
#include <common>
#include <clipping_planes_pars_vertex>
#ifdef USE_CURV
attribute float aK1;
attribute float aK2;
attribute float aKG;
varying float vK1;
varying float vK2;
varying float vKG;
#endif
varying vec3 vPosW;
varying vec3 vNormalW;
varying vec3 vNormalV;
varying vec3 vPosV;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * w;
  vPosV = mvPosition.xyz;
  vNormalV = normalize(normalMatrix * normal);
#ifdef USE_CURV
  vK1 = aK1; vK2 = aK2; vKG = aKG;
#endif
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;

const FRAG_HEAD = `
#include <common>
#include <clipping_planes_pars_fragment>
#ifdef USE_CURV
varying float vK1;
varying float vK2;
varying float vKG;
#endif
varying vec3 vPosW;
varying vec3 vNormalW;
varying vec3 vNormalV;
varying vec3 vPosV;
uniform float uOpacity;
vec3 viewDirV() { return isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(-vPosV); }
float shade() { vec3 n = normalize(vNormalV); if (!gl_FrontFacing) n = -n; return 0.62 + 0.38 * abs(dot(n, viewDirV())); }
`;

const ZEBRA_FRAG = FRAG_HEAD + `
uniform float uRepeats;
uniform float uVertical;
uniform float uLocked;
uniform mat3 uLockRot;
void main() {
  #include <clipping_planes_fragment>
  vec3 nW = normalize(vNormalW);
  if (!gl_FrontFacing) nW = -nW;
  vec3 n; vec3 v;
  if (uLocked > 0.5) { n = normalize(uLockRot * nW); v = vec3(0.0, 0.0, 1.0); }
  else { n = normalize(mat3(viewMatrix) * nW); v = viewDirV(); }
  vec3 r = reflect(-v, n);
  // parallel light strips: the stripe index is the azimuth of the reflected ray around the strip axis
  // (vertical strips: around the screen's up axis; horizontal strips: around its right axis)
  float s = (uVertical > 0.5 ? atan(r.x, r.z) : atan(r.y, r.z)) / PI * uRepeats;
  float d = abs(fract(s) - 0.5);
  float w = max(fwidth(s), 1e-4);
  float white = smoothstep(0.25 - w, 0.25 + w, d);
  gl_FragColor = vec4(vec3(white), uOpacity);
}`;

const DRAFT_FRAG = FRAG_HEAD + `
uniform vec3 uDir;
uniform float uNeg;
uniform float uPos;
uniform float uTolNeg;
uniform float uTolPos;
uniform float uTolOn;
uniform vec3 cGreen; uniform vec3 cYellow; uniform vec3 cRed; uniform vec3 cCyan; uniform vec3 cBlue;
void main() {
  #include <clipping_planes_fragment>
  vec3 nW = normalize(vNormalW);
  if (!gl_FrontFacing) nW = -nW;
  float a = degrees(asin(clamp(dot(nW, normalize(uDir)), -1.0, 1.0)));
  float pz0 = uPos, pz1 = uPos + (uTolOn > 0.5 ? uTolPos : 0.0);
  float nz0 = uNeg, nz1 = uNeg + (uTolOn > 0.5 ? uTolNeg : 0.0);
  float pLo = min(pz0, pz1), pHi = max(pz0, pz1);
  float nLo = min(nz0, nz1), nHi = max(nz0, nz1);
  float bw = 0.06 + 0.02 * abs(uPos - uNeg);
  vec3 col = cRed;
  // red -> yellow (positive tolerance zone) -> green
  col = mix(col, cYellow, smoothstep(pLo - bw, pLo + bw, a) * (uTolOn > 0.5 && pHi > pLo ? 1.0 : 0.0));
  col = mix(col, cGreen, smoothstep(pHi - bw, pHi + bw, a));
  // red -> cyan (negative tolerance zone) -> blue
  col = mix(col, cCyan, (1.0 - smoothstep(nHi - bw, nHi + bw, a)) * (uTolOn > 0.5 && nHi > nLo ? 1.0 : 0.0));
  col = mix(col, cBlue, 1.0 - smoothstep(nLo - bw, nLo + bw, a));
  gl_FragColor = vec4(col * shade(), uOpacity);
}`;

const CMAP_FRAG = FRAG_HEAD + `
uniform float uType;    // 0 gaussian, 1 principal minimum, 2 principal maximum
uniform float uBands;
uniform float uScale;
uniform float uRef;
uniform float uLimit;   // radius limit (mm)
uniform vec3 cG[7];
vec3 ramp(float t) {
  float x = clamp((t + 1.0) * 3.0, 0.0, 6.0);
  int i = int(floor(x));
  float f = x - float(i);
  vec3 a = cG[0]; vec3 b = cG[0];
  for (int k = 0; k < 7; k++) { if (k == i) a = cG[k]; if (k == i + 1) b = cG[k]; }
  if (i >= 6) return cG[6];
  return mix(a, b, f);
}
void main() {
  #include <clipping_planes_fragment>
  vec3 col;
  if (uType < 0.5) {
    float g = vKG;
    float v = sign(g) * sqrt(abs(g)) * uRef * uScale;
    float t = clamp(v, -1.0, 1.0);
    if (uBands > 0.5) { t = clamp(floor(t * 3.0 + 0.5) / 3.0, -1.0, 1.0); }
    col = ramp(t);
  } else {
    float k = uType < 1.5 ? min(abs(vK1), abs(vK2)) : max(abs(vK1), abs(vK2));
    float lim = max(uLimit, 1e-6);
    // principal minimum: red where the flattest direction is flatter than the Maximum Limit radius;
    // principal maximum: red where the tightest direction is tighter than the Minimum Limit radius
    float x = uType < 1.5 ? (1.0 / lim - k) : (k - 1.0 / lim);
    float w = max(fwidth(k), 1e-5);
    float red = smoothstep(-w, w, x);
    col = mix(vec3(0.24, 0.75, 0.27), vec3(0.88, 0.19, 0.16), red);
  }
  gl_FragColor = vec4(col * shade(), uOpacity);
}`;

const MINRAD_FRAG = FRAG_HEAD + `
uniform float uMin;
uniform float uMax;
void main() {
  #include <clipping_planes_fragment>
  float k = vK2;               // most concave convexity curvature (negative = concave)
  if (k > -1e-7) discard;
  float r = -1.0 / k;
  if (r > uMax) discard;
  vec3 col;
  if (r < uMin) col = vec3(0.88, 0.16, 0.13);
  else {
    float t = clamp((r - uMin) / max(uMax - uMin, 1e-6), 0.0, 1.0);
    vec3 c0 = vec3(0.98, 0.55, 0.10), c1 = vec3(0.96, 0.86, 0.15), c2 = vec3(0.26, 0.76, 0.30), c3 = vec3(0.20, 0.55, 0.95);
    col = t < 0.33 ? mix(c0, c1, t / 0.33) : t < 0.66 ? mix(c1, c2, (t - 0.33) / 0.33) : mix(c2, c3, (t - 0.66) / 0.34);
  }
  gl_FragColor = vec4(col * shade(), uOpacity);
}`;

const ACCESS_FRAG = FRAG_HEAD + `
uniform sampler2D uDepth1;
uniform sampler2D uDepth2;
uniform mat4 uLight1;
uniform mat4 uLight2;
uniform vec3 uDir1;
uniform vec3 uDir2;
uniform float uTwo;
uniform float uBias;
uniform float uTexel;
float reach(sampler2D dm, mat4 L, vec3 d, vec3 p, vec3 n) {
  float nd = dot(n, d);
  if (nd < -0.03) return 0.0;               // faces turned away from the tool: undercut
  vec3 q = p + n * uTexel * 1.5;            // normal offset against acne on steep walls
  vec4 c = L * vec4(q, 1.0);
  vec3 s = c.xyz / c.w * 0.5 + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) return 1.0;
  float occ = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    float z = texture2D(dm, s.xy + vec2(float(i), float(j)) * 0.35 / 2048.0).x;
    occ += s.z - uBias * (1.0 + 4.0 * (1.0 - abs(nd))) > z ? 1.0 : 0.0;
  }
  return 1.0 - step(4.5, occ);
}
void main() {
  #include <clipping_planes_fragment>
  vec3 nW = normalize(vNormalW);
  if (!gl_FrontFacing) nW = -nW;
  float ok = reach(uDepth1, uLight1, uDir1, vPosW, nW);
  if (uTwo > 0.5) ok = max(ok, reach(uDepth2, uLight2, uDir2, vPosW, nW));
  vec3 col = mix(vec3(0.88, 0.17, 0.14), vec3(0.22, 0.74, 0.27), ok);
  gl_FragColor = vec4(col * shade(), uOpacity);
}`;

// ------------------------------------------------------------------ procedural environments (equirect canvases)
export const ANALYSIS_ENVIRONMENTS = [
  ["photoBooth", "Photo Booth"],
  ["sharpHighlights", "Sharp Highlights"],
  ["greyRoom", "Grey Room"],
  ["darkSky", "Dark Sky"],
  ["plaza", "Plaza"],
  ["field", "Field"],
  ["tranquilityBlue", "Tranquility Blue"],
  ["infinityPool", "Infinity Pool"],
  ["warmLight", "Warm Light"],
  ["coolLight", "Cool Light"],
];
const ENV_DEF = {
  photoBooth: { sky: ["#c9ccd0", "#8d9196"], ground: ["#55585c", "#26282b"], boxes: [[0.25, 0.3, 0.12, 0.22, "#ffffff"], [0.62, 0.28, 0.16, 0.24, "#ffffff"], [0.88, 0.36, 0.05, 0.3, "#f4f4f4"], [0.45, 0.06, 0.3, 0.08, "#ffffff"]] },
  sharpHighlights: { sky: ["#1d1d1d", "#2a2a2a"], ground: ["#151515", "#0b0b0b"], boxes: [[0.1, 0.3, 0.03, 0.4, "#ffffff"], [0.4, 0.2, 0.02, 0.5, "#ffffff"], [0.72, 0.28, 0.04, 0.35, "#ffffff"]] },
  greyRoom: { sky: ["#9a9a9a", "#858585"], ground: ["#6e6e6e", "#5a5a5a"], boxes: [[0.3, 0.25, 0.22, 0.18, "#d8d8d8"], [0.75, 0.25, 0.18, 0.15, "#cfcfcf"]] },
  darkSky: { sky: ["#0d1422", "#26324a"], ground: ["#1b1b1b", "#0f0f0f"], boxes: [[0.55, 0.18, 0.05, 0.06, "#fff6dc"]] },
  plaza: { sky: ["#8fb7e6", "#dfe9f3"], ground: ["#b1a58f", "#7f7566"], boxes: [[0.1, 0.42, 0.18, 0.08, "#c9c4bb"], [0.45, 0.4, 0.12, 0.1, "#d6d0c4"], [0.78, 0.43, 0.2, 0.07, "#bdb7aa"], [0.6, 0.12, 0.05, 0.06, "#fffbe6"]] },
  field: { sky: ["#7fb1ec", "#e4eef8"], ground: ["#6f8f3e", "#4f6a2b"], boxes: [[0.3, 0.15, 0.06, 0.07, "#fffbe8"]] },
  tranquilityBlue: { sky: ["#0a4e98", "#2e79c7"], ground: ["#06305d", "#041f3d"], boxes: [[0.35, 0.3, 0.15, 0.15, "#cfe5ff"], [0.8, 0.3, 0.1, 0.2, "#a9d0ff"]] },
  infinityPool: { sky: ["#c6dcef", "#f7fbff"], ground: ["#3f8fb5", "#22607e"], boxes: [[0.5, 0.2, 0.25, 0.12, "#ffffff"]] },
  warmLight: { sky: ["#f6e2c4", "#e9caa0"], ground: ["#9c7b55", "#6e5438"], boxes: [[0.3, 0.28, 0.14, 0.2, "#fff2da"], [0.75, 0.3, 0.12, 0.2, "#ffe8c4"]] },
  coolLight: { sky: ["#dbe7f3", "#c4d6ea"], ground: ["#7c8a99", "#58636f"], boxes: [[0.3, 0.28, 0.14, 0.2, "#f2f8ff"], [0.75, 0.3, 0.12, 0.2, "#e6f1ff"]] },
};

function envCanvas(id) {
  const d = ENV_DEF[id] || ENV_DEF.photoBooth;
  const W = 1024, H = 512;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  let gr = g.createLinearGradient(0, 0, 0, H / 2);
  gr.addColorStop(0, d.sky[0]); gr.addColorStop(1, d.sky[1]);
  g.fillStyle = gr; g.fillRect(0, 0, W, H / 2);
  gr = g.createLinearGradient(0, H / 2, 0, H);
  gr.addColorStop(0, d.ground[0]); gr.addColorStop(1, d.ground[1]);
  g.fillStyle = gr; g.fillRect(0, H / 2, W, H / 2);
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, H / 2 - 1, W, 2); // horizon line
  for (const [x, y, w, h, col] of d.boxes) {
    g.fillStyle = col;
    g.shadowColor = col; g.shadowBlur = 18;
    g.fillRect(x * W - (w * W) / 2, y * H - (h * H) / 2, w * W, h * H);
  }
  return c;
}

// ------------------------------------------------------------------ helpers
const del = (o) => { try { if (o && typeof o.delete === "function") o.delete(); } catch { /* ignore */ } };
function lineMat(app, { width = 1.4, color = 0xffffff, vertexColors = false, depthTest = true, opacity = 1 } = {}) {
  const s = app.viewport && app.viewport.size ? app.viewport.size() : { w: 800, h: 600 };
  const m = new LineMaterial({ color, linewidth: width, worldUnits: false, vertexColors, depthTest, transparent: opacity < 1, opacity });
  m.resolution.set(s.w, s.h);
  return m;
}
function hexRgb(h) { const c = new THREE.Color(h); return [c.r, c.g, c.b]; }
/** Curvature magnitude -> colour (blue low ... red high). */
function combColor(t) {
  t = Math.max(0, Math.min(1, t));
  const stops = [[0.18, 0.42, 0.95], [0.2, 0.78, 0.86], [0.3, 0.78, 0.3], [0.97, 0.8, 0.15], [0.9, 0.2, 0.15]];
  const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  return stops[i].map((v, k) => v + (stops[i + 1][k] - v) * f);
}

export function createSurfaceDisplay(app, store) {
  const vp = () => app.viewport;
  const root = new THREE.Group();
  root.name = "inspect-analyses";
  root.userData.noPick = true;
  const geoCache = new WeakMap();   // md -> {geo, curv?}
  const hqCache = new WeakMap();    // shape -> md (high quality)
  const sharpCache = new WeakMap(); // md -> [edge indices]
  const envCache = new Map();       // env id -> PMREM texture
  const owned = [];                 // disposables of the current build
  let legendEl = null;
  let lastKey = "";
  const depthCache = new Map();     // key (direction + geometry ids) -> {rt, res}: depth maps reused across slider ticks
  let depthUsed = null;             // keys used by the running refresh
  const geoEntries = new Set();     // every live geoCache entry (disposed when a refresh no longer uses it)
  let geoUsed = null;
  const ROT = new THREE.Matrix3();

  function attach() {
    const v = vp();
    if (!v || !v.groups || !v.groups.bodies) return false;
    if (root.parent !== v.groups.bodies) v.groups.bodies.add(root);
    return true;
  }
  function clear() {
    for (const c of [...root.children]) root.remove(c);
    for (const o of owned.splice(0)) { try { o.dispose(); } catch { /* ignore */ } }
  }

  // ---------------------------------------------------------------- mesh data
  function bodyMesh(b, hq) {
    const v = vp();
    let md = null;
    if (hq) {
      md = hqCache.get(b.shape);
      if (!md) {
        let size = 100;
        try { const bb = app.K.bboxOf(b.shape); if (bb) size = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]); } catch { /* keep */ }
        try { md = app.K.meshBody(b.shape, Math.max(0.5, Math.min(size * 0.5, 5000)) * 0.2); } catch { md = null; }
        if (md) hqCache.set(b.shape, md);
      }
    }
    if (!md) { try { md = v.meshFor(b.shape); } catch { md = null; } }
    return md;
  }
  function geometryOf(b, { hq = false, curv = false } = {}) {
    const md = bodyMesh(b, hq);
    if (!md) return null;
    let e = geoCache.get(md);
    if (!e) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(md.vertices, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(md.normals, 3));
      geo.setIndex(new THREE.BufferAttribute(md.triangles, 1));
      geo.computeBoundingSphere();
      e = { geo, md, curv: null };
      geoCache.set(md, e);
    }
    geoEntries.add(e);
    if (geoUsed) geoUsed.add(e);
    if (curv && !e.curv) {
      try {
        e.curv = bodyCurvature(app.K.R.getOC(), b.shape, md);
        e.geo.setAttribute("aK1", new THREE.BufferAttribute(e.curv.k1, 1));
        e.geo.setAttribute("aK2", new THREE.BufferAttribute(e.curv.k2, 1));
        e.geo.setAttribute("aKG", new THREE.BufferAttribute(e.curv.K, 1));
      } catch (err) { console.warn("[inspect] curvature sampling failed", err); }
    }
    return e;
  }
  /** Curvature summary of a body ({minConcave, maxAbs, gaussMax}) from the exact surfaces (for dialogs). */
  function curvatureOf(bodyId, hq = false) {
    const b = app.body(bodyId);
    if (!b || !b.shape) return null;
    const e = geometryOf(b, { hq, curv: true });
    return e && e.curv ? e.curv : null;
  }

  function stylesShowFaces() {
    try { const v = vp(); return v._vp && v._vp.styleInfo ? v._vp.styleInfo().faces !== false : true; } catch { return true; }
  }
  function visibleBodies(ids) {
    const out = [];
    for (const id of ids || []) {
      const b = app.body(id);
      if (b && b.shape && b.meta && b.meta.visible !== false) out.push(b);
    }
    return out;
  }
  function diagOf(bodies) {
    let box = null;
    for (const b of bodies) {
      const bb = app.K.bboxOf(b.shape);
      if (bb) box = box ? { min: box.min.map((x, i) => Math.min(x, bb.min[i])), max: box.max.map((x, i) => Math.max(x, bb.max[i])) } : { min: [...bb.min], max: [...bb.max] };
    }
    return { box, diag: box ? V3.len(V3.sub(box.max, box.min)) : 100 };
  }

  // ---------------------------------------------------------------- refs
  function resolveFaceIndex(shape, ref) {
    try {
      const faces = shape.faces;
      if (Number.isInteger(ref.index) && faces[ref.index] && ref.p) {
        const pr = app.K.pointProbe(ref.p);
        const d = pr.dist(faces[ref.index]);
        pr.delete();
        if (d < 1e-3) return ref.index;
      }
      if (ref.p) { const r = app.K.nearestFaceIndex(shape, ref.p, ref.n); if (r && r.index >= 0) return r.index; }
    } catch { /* fall through */ }
    return Number.isInteger(ref.index) ? ref.index : -1;
  }
  function resolveEdgeIndex(shape, ref) {
    try {
      const edges = shape.edges;
      if (Number.isInteger(ref.index) && edges[ref.index] && ref.p) {
        const pr = app.K.pointProbe(ref.p);
        const d = pr.dist(edges[ref.index]);
        pr.delete();
        if (d < 1e-3) return ref.index;
      }
      if (ref.p) { const r = app.K.nearestEdgeIndex(shape, ref.p); if (r && r.index >= 0 && r.dist < 1) return r.index; }
    } catch { /* fall through */ }
    return Number.isInteger(ref.index) ? ref.index : -1;
  }
  /** Pull / access direction of a direction ref (unit vector) or null. */
  function directionOf(ref, fallback) {
    const K = app.K;
    try {
      if (!ref) return fallback || null;
      if (ref.kind === "originPlane" && K.ORIGIN_PLANES[ref.name]) return [...K.ORIGIN_PLANES[ref.name].n];
      if (ref.kind === "originAxis" && K.ORIGIN_AXES[ref.name]) return [...K.ORIGIN_AXES[ref.name]];
      if (ref.kind === "cplane") { const st = app.planeState(ref.id); if (st) return V3.norm(st.plane.n); }
      if (ref.kind === "sketchCurve") {
        const st = app.sketchState(ref.sketch);
        const cv = st && st.sk.curves[ref.curve];
        if (cv && cv.type === "line") {
          const a = st.sk.points[cv.p1], b = st.sk.points[cv.p2];
          return V3.norm(V3.sub(K.toWorld(st.plane, b.x, b.y), K.toWorld(st.plane, a.x, a.y)));
        }
      }
      const b = ref.body ? app.body(ref.body) : null;
      if (b && ref.kind === "face") {
        const i = resolveFaceIndex(b.shape, ref);
        const f = b.shape.faces[i];
        if (f) {
          const t = f.geomType;
          if (t === "PLANE") { const n = f.normalAt(f.center); return V3.norm([n.x, n.y, n.z]); }
          if (t === "CYLINDRE" || t === "CONE") {
            const S = f.surface.wrapped;
            const g = t === "CYLINDRE" ? S.Cylinder() : S.Cone();
            const ax = g.Axis(); const d = ax.Direction();
            const out = [d.X(), d.Y(), d.Z()];
            del(d); del(ax); del(g);
            return V3.norm(out);
          }
        }
      }
      if (b && ref.kind === "edge") {
        const i = resolveEdgeIndex(b.shape, ref);
        const e = b.shape.edges[i];
        if (e && e.geomType === "LINE") return V3.norm(V3.sub(e.endPoint.toTuple(), e.startPoint.toTuple()));
      }
    } catch (err) { console.warn("[inspect] direction failed", err); }
    return fallback || null;
  }

  // ---------------------------------------------------------------- per-type builders
  function addMesh(geo, mat, order = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.userData = { noPick: true, analysis: true };
    m.renderOrder = order;
    root.add(m);
    owned.push(mat);
    return m;
  }
  function shaderMat(frag, uniforms, opacity, defines = {}) {
    const transparent = opacity < 0.999;
    return new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, uniforms: { uOpacity: { value: opacity }, ...uniforms },
      defines, side: THREE.DoubleSide, transparent, depthWrite: !transparent, clipping: true,
    });
  }
  const op = (a) => Math.max(0, Math.min(1, (Number(a.opacity ?? 100) || 0) / 100));

  function buildZebra(a) {
    const bodies = visibleBodies(a.bodies);
    let lock = null;
    if (a.locked && Array.isArray(a.lockRot) && a.lockRot.length === 9) lock = new THREE.Matrix3().fromArray(a.lockRot);
    for (const b of bodies) {
      const e = geometryOf(b, { hq: !!a.highQuality });
      if (!e) continue;
      addMesh(e.geo, shaderMat(ZEBRA_FRAG, {
        uRepeats: { value: Math.max(1, Math.min(100, Number(a.repeats) || 20)) },
        uVertical: { value: a.direction === "horizontal" ? 0 : 1 },
        uLocked: { value: lock ? 1 : 0 },
        uLockRot: { value: lock || ROT },
      }, op(a)));
    }
  }

  function draftRange(a) {
    const neg = evalExpr(app, a.angleNeg ?? "-2 deg", "angle"), pos = evalExpr(app, a.anglePos ?? "2 deg", "angle");
    const tn = evalExpr(app, a.tolNeg ?? "-0.5 deg", "angle"), tp = evalExpr(app, a.tolPos ?? "0.5 deg", "angle");
    return { neg: Math.min(neg, pos), pos: Math.max(neg, pos), tn, tp, tol: a.toleranceZone !== false };
  }
  function buildDraft(a, legends) {
    let d = directionOf(a.direction, a.dir);
    if (!d) return;
    if (a.flip) d = V3.mul(d, -1);
    const r = draftRange(a);
    const C = Object.fromEntries(Object.entries(DRAFT_COLORS).map(([k, v]) => [k, new THREE.Color(v)]));
    for (const b of visibleBodies(a.bodies)) {
      const e = geometryOf(b, { hq: !!a.highQuality });
      if (!e) continue;
      addMesh(e.geo, shaderMat(DRAFT_FRAG, {
        uDir: { value: new THREE.Vector3(...d) }, uNeg: { value: r.neg }, uPos: { value: r.pos },
        uTolNeg: { value: r.tn }, uTolPos: { value: r.tp }, uTolOn: { value: r.tol ? 1 : 0 },
        cGreen: { value: C.green }, cYellow: { value: C.yellow }, cRed: { value: C.red }, cCyan: { value: C.cyan }, cBlue: { value: C.blue },
      }, op(a)));
    }
    legends.push(draftLegend(a, r));
  }

  function cmapParams(a, bodies) {
    const { diag } = diagOf(bodies);
    const ref = diag / 4; // a sphere filling its bounding box reads close to the warm end at Scale 1
    const scale = Math.max(0.01, Number(a.scale ?? 1) || 1);
    const type = a.mapType === "principalMin" ? 1 : a.mapType === "principalMax" ? 2 : 0;
    const limit = type === 1 ? evalExpr(app, a.maxLimit ?? "100 mm", "length") : type === 2 ? evalExpr(app, a.minLimit ?? "1 mm", "length") : 0;
    return { ref, scale, type, limit, bands: a.display === "bands" };
  }
  function buildCurvatureMap(a, legends) {
    const bodies = visibleBodies(a.bodies);
    if (!bodies.length) return;
    const p = cmapParams(a, bodies);
    const cols = GAUSS_COLORS.map((c) => new THREE.Color(c));
    for (const b of bodies) {
      const e = geometryOf(b, { hq: !!a.highQuality, curv: true });
      if (!e || !e.curv) continue;
      addMesh(e.geo, shaderMat(CMAP_FRAG, {
        uType: { value: p.type }, uBands: { value: p.bands ? 1 : 0 }, uScale: { value: p.scale }, uRef: { value: p.ref },
        uLimit: { value: p.limit }, cG: { value: cols },
      }, op(a), { USE_CURV: "" }));
    }
    legends.push(cmapLegend(a, p));
  }

  function minRadParams(a) {
    const maxR = Math.max(1e-6, evalExpr(app, a.maxToolRadius ?? "25 mm", "length"));
    const minR = Math.max(0, Math.min(maxR, evalExpr(app, a.minRadius ?? "0 mm", "length")));
    return { maxR, minR };
  }
  function buildMinRadius(a, legends) {
    const bodies = visibleBodies(a.bodies);
    const p = minRadParams(a);
    for (const b of bodies) {
      const e = geometryOf(b, { hq: false, curv: true });
      if (!e || !e.curv) continue;
      addMesh(e.geo, shaderMat(MINRAD_FRAG, { uMin: { value: p.minR }, uMax: { value: p.maxR } }, op(a), { USE_CURV: "" }));
      if (a.sharpEdges) {
        let idx = sharpCache.get(e.md);
        if (!idx) { try { idx = concaveSharpEdges(app.K.R.getOC(), b.shape, e.md); } catch { idx = []; } sharpCache.set(e.md, idx); }
        const pts = [];
        const want = new Set(idx);
        for (const g of e.md.edgeGroups) {
          if (!want.has(g.edge)) continue;
          const L = e.md.lines;
          for (let k = g.start; k < g.start + g.count; k += 2) {
            pts.push(L[k * 3], L[k * 3 + 1], L[k * 3 + 2], L[(k + 1) * 3], L[(k + 1) * 3 + 1], L[(k + 1) * 3 + 2]);
          }
        }
        if (pts.length) {
          const lg = new LineSegmentsGeometry();
          lg.setPositions(pts);
          const lm = lineMat(app, { width: 3, color: 0xe0281e });
          const ln = new LineSegments2(lg, lm);
          ln.userData = { noPick: true, analysis: true, sharp: true };
          ln.renderOrder = 3;
          root.add(ln);
          owned.push(lg, lm);
        }
      }
    }
    legends.push(minRadLegend(a, p));
  }

  function envTexture(id) {
    let t = envCache.get(id);
    if (t) return t;
    const v = vp();
    try {
      const tex = new THREE.CanvasTexture(envCanvas(id));
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      const pm = new THREE.PMREMGenerator(v.renderer);
      t = pm.fromEquirectangular(tex).texture;
      pm.dispose();
      tex.dispose();
    } catch (e) { console.warn("[inspect] environment map failed", e); t = null; }
    if (t) envCache.set(id, t);
    return t;
  }
  function buildEnvMap(a) {
    const env = envTexture(a.environment || "photoBooth");
    const rot = evalExpr(app, a.rotate ?? "0 deg", "angle");
    for (const b of visibleBodies(a.bodies)) {
      const e = geometryOf(b, { hq: !!a.highQuality });
      if (!e) continue;
      const ap = (app.appearances && app.appearances[b.meta.appearance]) || { color: "#b9bdc2" };
      const mirror = a.mirror !== false;
      const o = op(a);
      const m = new THREE.MeshStandardMaterial({
        color: mirror ? 0xffffff : ap.color || "#b9bdc2", metalness: mirror ? 1 : 0.55, roughness: mirror ? 0.03 : 0.22,
        envMap: env, envMapIntensity: mirror ? 1.0 : 0.9, side: THREE.DoubleSide,
        transparent: o < 0.999, opacity: o, depthWrite: o >= 0.999,
      });
      // three r169: environment rotation about the world up axis (Z-up -> rotate about Z through the Y-up env frame)
      try { m.envMapRotation = new THREE.Euler(Math.PI / 2, 0, (rot * Math.PI) / 180, "XYZ"); } catch { /* older three */ }
      addMesh(e.geo, m);
    }
  }

  function depthMap(bodies, dir, box) {
    const key = `${dir.map((x) => x.toFixed(6)).join(",")}|${bodies.map((b) => { const e = geometryOf(b); return e ? e.geo.uuid : "-"; }).join(",")}`;
    const hit = depthCache.get(key);
    if (depthUsed) depthUsed.add(key);
    if (hit) return hit.res;
    const v = vp();
    const size = 2048;
    const rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(size, size);
    rt.depthTexture.type = THREE.UnsignedIntType;
    const center = V3.mul(V3.add(box.min, box.max), 0.5);
    const R = V3.len(V3.sub(box.max, box.min)) * 0.5 + 1;
    const cam = new THREE.OrthographicCamera(-R, R, R, -R, 0.01, 4 * R + 2);
    const eye = V3.add(center, V3.mul(dir, 2 * R + 1));
    cam.position.set(...eye);
    const up = Math.abs(dir[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
    cam.up.set(...up);
    cam.lookAt(...center);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    const scene = new THREE.Scene();
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    for (const b of bodies) { const e = geometryOf(b); if (e) scene.add(new THREE.Mesh(e.geo, mat)); }
    const r = v.renderer;
    const prevTarget = r.getRenderTarget();
    const prevClip = r.localClippingEnabled;
    try {
      r.localClippingEnabled = false;
      r.setRenderTarget(rt);
      r.clear(true, true, true);
      r.render(scene, cam);
    } finally {
      r.setRenderTarget(prevTarget);
      r.localClippingEnabled = prevClip;
    }
    mat.dispose();
    const L = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const res = { tex: rt.depthTexture, L, texel: (2 * R) / size, bias: 2.5 / (4 * R + 2) * ((2 * R) / size) };
    depthCache.set(key, { rt, res });
    return res;
  }
  function buildAccessibility(a, legends) {
    const d0 = directionOf(a.direction, a.dir);
    if (!d0) return;
    const bodies = visibleBodies(a.bodies);
    if (!bodies.length) return;
    const { box } = diagOf(bodies);
    if (!box) return;
    const d1 = a.mode === "flip" ? V3.mul(d0, -1) : d0;
    const m1 = depthMap(bodies, d1, box);
    const two = a.mode === "both";
    const m2 = two ? depthMap(bodies, V3.mul(d0, -1), box) : m1;
    for (const b of bodies) {
      const e = geometryOf(b);
      if (!e) continue;
      addMesh(e.geo, shaderMat(ACCESS_FRAG, {
        uDepth1: { value: m1.tex }, uDepth2: { value: m2.tex }, uLight1: { value: m1.L }, uLight2: { value: m2.L },
        uDir1: { value: new THREE.Vector3(...d1) }, uDir2: { value: new THREE.Vector3(...V3.mul(d0, -1)) },
        uTwo: { value: two ? 1 : 0 }, uBias: { value: Math.max(1e-5, m1.bias) }, uTexel: { value: m1.texel },
      }, op(a)));
    }
    legends.push({ title: "Accessibility", rows: [[DRAFT_COLORS.green, "Accessible"], [DRAFT_COLORS.red, "Not accessible"]] });
  }

  /** Comb teeth + envelope from curvature samples. scaleLen = mm per (1/mm) of curvature. */
  function addComb(samples, scaleLen, kmax) {
    if (!samples.length) return;
    const pos = [], col = [], env = [];
    let prev = null;
    for (const s of samples) {
      const tip = V3.add(s.p, V3.mul(s.n, -s.k * scaleLen)); // drawn on the side away from the centre of curvature
      const c = combColor(kmax > 0 ? s.k / kmax : 0);
      if (s.k > 0) { pos.push(...s.p, ...tip); col.push(...c, ...c); }
      if (prev) env.push(...prev, ...tip);
      prev = tip;
    }
    if (pos.length) {
      const g = new LineSegmentsGeometry();
      g.setPositions(pos);
      g.setColors(col);
      const m = lineMat(app, { width: 1.2, vertexColors: true });
      const l = new LineSegments2(g, m);
      l.userData = { noPick: true, analysis: true, comb: true };
      l.renderOrder = 4;
      root.add(l);
      owned.push(g, m);
    }
    if (env.length) {
      const g = new LineSegmentsGeometry();
      g.setPositions(env);
      const m = lineMat(app, { width: 1.6, color: 0x2b3f9e });
      const l = new LineSegments2(g, m);
      l.userData = { noPick: true, analysis: true, combEnvelope: true };
      l.renderOrder = 4;
      root.add(l);
      owned.push(g, m);
    }
  }
  /** Curvature samples for one comb entity (edge ref or sketch curve ref). */
  function curveSamples(ref, density) {
    const O = app.K.R.getOC();
    if (ref.kind === "edge") {
      const b = app.body(ref.body);
      if (!b || !b.shape || (b.meta && b.meta.visible === false)) return null;
      const i = resolveEdgeIndex(b.shape, ref);
      const e = b.shape.edges[i];
      return e ? edgeSamples(O, e, density) : null;
    }
    if (ref.kind === "sketchCurve") {
      const st = app.sketchState(ref.sketch);
      const f = app.feature(ref.sketch);
      if (!st || !f || f.visible === false) return null;
      const cv = st.sk.curves[ref.curve];
      if (!cv) return null;
      const P = st.sk.points;
      const W = (q) => app.K.toWorld(st.plane, q[0], q[1]);
      let g = null;
      if (cv.type === "line") {
        const a = P[cv.p1], b2 = P[cv.p2];
        g = { T: 1, at: (t) => [a.x + (b2.x - a.x) * t, a.y + (b2.y - a.y) * t], der: () => [b2.x - a.x, b2.y - a.y] };
      } else if (cv.type === "circle") {
        const c = P[cv.c];
        let r = Number(cv.r);
        if (!Number.isFinite(r) && cv.p1 && P[cv.p1]) r = Math.hypot(P[cv.p1].x - c.x, P[cv.p1].y - c.y);
        g = { T: Math.PI * 2, at: (t) => [c.x + r * Math.cos(t), c.y + r * Math.sin(t)], der: (t) => [-r * Math.sin(t), r * Math.cos(t)] };
      } else if (cv.type === "arc") {
        const c = P[cv.c], a = P[cv.p1], b2 = P[cv.p2];
        const r = Math.hypot(a.x - c.x, a.y - c.y);
        const t1 = Math.atan2(a.y - c.y, a.x - c.x);
        let t2 = Math.atan2(b2.y - c.y, b2.x - c.x);
        while (t2 <= t1) t2 += Math.PI * 2;
        g = { T: t2 - t1, at: (t) => [c.x + r * Math.cos(t1 + t), c.y + r * Math.sin(t1 + t)], der: (t) => [-r * Math.sin(t1 + t), r * Math.cos(t1 + t)] };
      } else {
        try { g = freeformGeom(st.sk, ref.curve); } catch { g = null; }
      }
      return g ? planarCurveSamples(g, st.plane, density, W) : null;
    }
    return null;
  }
  function combScaleLen(sets, scale, diag) {
    let kmax = 0;
    for (const s of sets) for (const x of s) if (x.k > kmax) kmax = x.k;
    // Scale 10 (Fusion's default) gives the tallest tooth ~ 1/10 of the model size
    const len = kmax > 0 ? ((Math.max(0, Number(scale) || 0) / 10) * 0.1 * diag) / kmax : 0;
    return { len, kmax };
  }
  function buildComb(a) {
    const density = Math.max(2, Math.min(100, Number(a.density) || 50));
    const sets = [];
    for (const r of a.edges || []) { const s = curveSamples(r, density); if (s && s.length) sets.push(s); }
    if (!sets.length) return;
    const all = app.bodies().filter((b) => b.shape && b.meta.visible !== false);
    let { diag } = diagOf(all);
    if (!all.length) {
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (const s of sets) for (const x of s) { mn = mn.map((v, i) => Math.min(v, x.p[i])); mx = mx.map((v, i) => Math.max(v, x.p[i])); }
      diag = Math.max(1, V3.len(V3.sub(mx, mn)));
    }
    const { len, kmax } = combScaleLen(sets, a.scale ?? 10, diag);
    for (const s of sets) {
      // centre polyline of the curve itself (Fusion draws the comb over the curve)
      addComb(s, len, kmax);
    }
  }

  function buildIsocurve(a) {
    const O = app.K.R.getOC();
    const byBody = new Map();
    for (const t of a.targets || []) {
      const b = app.body(t.body);
      if (!b || !b.shape || b.meta.visible === false) continue;
      if (!byBody.has(b.id)) byBody.set(b.id, { b, faces: new Set(), all: false });
      const it = byBody.get(b.id);
      if (t.kind === "body") it.all = true;
      else { const i = resolveFaceIndex(b.shape, t); if (i >= 0) it.faces.add(i); }
    }
    const count = Math.max(1, Math.min(20, Number(a.count) || 5));
    const dirs = a.uv === "u" ? "u" : a.uv === "v" ? "v" : "uv";
    const curvesU = [], curvesV = [], combSets = [];
    const bodies = [];
    for (const { b, faces, all } of byBody.values()) {
      bodies.push(b);
      try { vp().meshFor(b.shape); } catch { /* triangulation needed for trimming */ }
      const list = b.shape.faces;
      const idx = all ? list.map((_, i) => i) : [...faces];
      for (const i of idx) {
        const f = list[i];
        if (!f) continue;
        for (const c of faceIsoCurves(O, f, { count, dirs, combs: !!a.combs, density: Math.max(2, Math.min(100, Number(a.density) || 50)) })) {
          (c.dir === "u" ? curvesU : curvesV).push(c.pts);
          if (c.combs) combSets.push(c.combs);
        }
      }
    }
    const seg = (curves) => { const out = []; for (const pts of curves) for (let i = 1; i < pts.length; i++) out.push(...pts[i - 1], ...pts[i]); return out; };
    for (const [curves, color, tag] of [[curvesU, 0xd9482b, "u"], [curvesV, 0x2a72d6, "v"]]) {
      const pts = seg(curves);
      if (!pts.length) continue;
      const g = new LineSegmentsGeometry();
      g.setPositions(pts);
      const m = lineMat(app, { width: 1.5, color });
      const l = new LineSegments2(g, m);
      l.userData = { noPick: true, analysis: true, iso: tag };
      l.renderOrder = 3;
      root.add(l);
      owned.push(g, m);
    }
    if (combSets.length) {
      const { diag } = diagOf(bodies);
      const { len, kmax } = combScaleLen(combSets, a.scale ?? 10, diag);
      for (const s of combSets) addComb(s, len, kmax);
    }
  }

  // ---------------------------------------------------------------- legends
  function draftLegend(a, r) {
    const f = (x) => `${fmtNum(x, 1)} deg`;
    const rows = [[DRAFT_COLORS.green, `≥ ${f(r.tol ? Math.max(r.pos, r.pos + r.tp) : r.pos)}`]];
    if (r.tol && r.tp) rows.push([DRAFT_COLORS.yellow, `${f(Math.min(r.pos, r.pos + r.tp))} to ${f(Math.max(r.pos, r.pos + r.tp))}`]);
    rows.push([DRAFT_COLORS.red, `${f(r.neg)} to ${f(r.pos)}`]);
    if (r.tol && r.tn) rows.push([DRAFT_COLORS.cyan, `${f(Math.min(r.neg, r.neg + r.tn))} to ${f(Math.max(r.neg, r.neg + r.tn))}`]);
    rows.push([DRAFT_COLORS.blue, `≤ ${f(r.tol ? Math.min(r.neg, r.neg + r.tn) : r.neg)}`]);
    return { title: `Draft Angle${a.name ? ` - ${a.name}` : ""}`, rows };
  }
  function cmapLegend(a, p) {
    if (p.type === 0) {
      const kEnd = Math.pow(1 / (p.ref * p.scale), 2);
      return { title: `Gaussian Curvature${a.name ? ` - ${a.name}` : ""}`, bar: GAUSS_COLORS.slice().reverse(), bands: p.bands, labels: [`+${fmtNum(kEnd, 5)} /mm^2`, "0", `-${fmtNum(kEnd, 5)} /mm^2`] };
    }
    const lim = `${fmtNum(p.limit, 2)} mm`;
    return p.type === 1
      ? { title: `Principal Minimum${a.name ? ` - ${a.name}` : ""}`, rows: [["#3dbf45", `Radius ≤ ${lim}`], ["#e0302a", `Radius > ${lim}`]] }
      : { title: `Principal Maximum${a.name ? ` - ${a.name}` : ""}`, rows: [["#3dbf45", `Radius ≥ ${lim}`], ["#e0302a", `Radius < ${lim}`]] };
  }
  function minRadLegend(a, p) {
    return { title: `Minimum Radius${a.name ? ` - ${a.name}` : ""}`, bar: ["#3389f2", "#42c24d", "#f5dc26", "#fa8c1a"], labels: [`${fmtNum(p.maxR, 2)} mm`, "", `${fmtNum(p.minR, 2)} mm`], rows: [["#e0291f", `< ${fmtNum(p.minR, 2)} mm`]] };
  }
  function renderLegends(list) {
    const v = vp();
    const host = v && ((v._vp && v._vp.host) || (v.labelLayer && v.labelLayer.parentElement));
    if (!list.length || !host) { if (legendEl) legendEl.remove(); legendEl = null; return; }
    if (!legendEl || legendEl.parentElement !== host) { if (legendEl) legendEl.remove(); legendEl = document.createElement("div"); legendEl.className = "insp-legends"; host.appendChild(legendEl); }
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    legendEl.innerHTML = list.map((L) => {
      let body = "";
      if (L.bar) {
        const grad = L.bands ? L.bar.map((c, i) => `${c} ${(i / L.bar.length) * 100}%, ${c} ${((i + 1) / L.bar.length) * 100}%`).join(", ") : L.bar.join(", ");
        body += `<div class="insp-legend-barrow"><div class="insp-legend-bar" style="background:linear-gradient(to bottom, ${grad})"></div><div class="insp-legend-ticks">${(L.labels || []).map((t) => `<span>${esc(t)}</span>`).join("")}</div></div>`;
      }
      if (L.rows) body += L.rows.map(([c, t]) => `<div class="insp-legend-row"><span class="insp-legend-sw" style="background:${c}"></span><span>${esc(t)}</span></div>`).join("");
      return `<div class="insp-legend"><div class="insp-legend-title">${esc(L.title)}</div>${body}</div>`;
    }).join("");
  }

  // ---------------------------------------------------------------- refresh
  function refresh() {
    if (!attach()) return;
    clear();
    depthUsed = new Set();
    geoUsed = new Set();
    const legends = [];
    const list = store.activeSurfaceAnalyses();
    const faces = stylesShowFaces();
    for (const a of list) {
      try {
        switch (a.type) {
          case "zebra": if (faces) buildZebra(a); break;
          case "draft": if (faces) buildDraft(a, legends); break;
          case "curvatureMap": if (faces) buildCurvatureMap(a, legends); break;
          case "minimumRadius": if (faces) buildMinRadius(a, legends); break;
          case "environmentMap": if (faces) buildEnvMap(a); break;
          case "accessibility": if (faces) buildAccessibility(a, legends); break;
          case "curvatureComb": buildComb(a); break;
          case "isocurve": buildIsocurve(a); break;
          default: break;
        }
      } catch (e) { console.warn(`[inspect] ${a.type} analysis display failed`, e); }
    }
    renderLegends(legends);
    // free GPU resources the new display no longer uses (old body meshes, depth maps of other directions)
    for (const [k, d] of depthCache) if (!depthUsed.has(k)) { try { d.rt.depthTexture && d.rt.depthTexture.dispose(); d.rt.dispose(); } catch { /* ignore */ } depthCache.delete(k); }
    for (const e of geoEntries) if (!geoUsed.has(e)) { try { e.geo.dispose(); } catch { /* ignore */ } geoEntries.delete(e); geoCache.delete(e.md); }
    depthUsed = null;
    geoUsed = null;
    const v = vp();
    if (v) v.requestRender();
    lastKey = list.map((a) => a.id || "preview").join(",");
  }

  app.on("camera", () => {
    const v = vp();
    if (!v || !root.children.length) return;
    const s = v.size ? v.size() : null;
    if (!s) return;
    for (const c of root.children) if (c.material && c.material.isLineMaterial) c.material.resolution.set(s.w, s.h);
  });

  return {
    refresh,
    curvatureOf,
    directionOf,
    get group() { return root; },
    get lastKey() { return lastKey; },
    /** current overlay objects (tests): [{type, kind}] */
    objects() { return root.children.map((c) => ({ mesh: !!c.isMesh, line: !!c.isLineSegments2, userData: { ...c.userData } })); },
    envCanvas,
    sharpEdges(bodyId) {
      const b = app.body(bodyId);
      if (!b) return [];
      const e = geometryOf(b);
      if (!e) return [];
      let idx = sharpCache.get(e.md);
      if (!idx) { try { idx = concaveSharpEdges(app.K.R.getOC(), b.shape, e.md); } catch { idx = []; } sharpCache.set(e.md, idx); }
      return idx;
    },
    hexRgb,
  };
}
