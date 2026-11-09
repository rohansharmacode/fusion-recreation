// Analyses (Fusion's browser "Analysis" folder): Section Analysis + Center of Mass items stored in
// app.doc.analyses (undoable through app.mutate, saved with the design) and their canvas display:
//   section  -> three.js clipping plane on every body material + kernel-computed section caps
//               (component colour + diagonal hatch, black outline)
//   com      -> black/white centre-of-mass glyph (always on top)
import * as THREE from "three";
import { CanvasOverlay } from "./overlay.js";
import { V, massProps, visibleBodyIds } from "./geom.js";
import { createSurfaceDisplay } from "./surfanalysis.js";
import { icon as cmdIcon } from "../icons/icons.js";

/** Analysis kinds of the browser's Analysis folder: default name stem (Fusion's *AnalysisDefaultUserName), label, command. */
export const ANALYSIS_META = {
  section: { stem: "Section", label: "Section Analysis", cmd: "FusionHalfSectionViewCommand" },
  com: { stem: "CenterOfMass", label: "Center of Mass", cmd: "FusionCenterOfMassCommand" },
  zebra: { stem: "Zebra", label: "Zebra Analysis", cmd: "FusionZebraAnalysisCommand" },
  draft: { stem: "Draft", label: "Draft Analysis", cmd: "FusionDraftAnalysisCommand" },
  curvatureMap: { stem: "CurvatureMap", label: "Curvature Map Analysis", cmd: "FusionCurvatureMapAnalysisCommand" },
  curvatureComb: { stem: "Curvature", label: "Curvature Comb Analysis", cmd: "FusionCurvatureCombAnalysisCommand" },
  isocurve: { stem: "IsoCurve", label: "Isocurve Analysis", cmd: "FusionIsoCurveAnalysisCommand" },
  environmentMap: { stem: "Environment Map", label: "Environment Map Analysis", cmd: "FusionEnvironmentMapAnalysisCommand" },
  accessibility: { stem: "Accessibility", label: "Accessibility Analysis", cmd: "FusionAccessibilityAnalysisCommand" },
  minimumRadius: { stem: "MinimumRadius", label: "Minimum Radius Analysis", cmd: "FusionMinimumRadiusAnalysisCommand" },
};
const iconCache = {};
function iconFor(type) {
  const m = ANALYSIS_META[type];
  if (!m || type === "section" || type === "com") return undefined; // the browser's own glyphs
  if (!iconCache[type]) { try { iconCache[type] = cmdIcon(m.cmd, { size: 16 }); } catch { iconCache[type] = undefined; } }
  return iconCache[type];
}

export const SECTION_COMPONENT_COLOR = "#e391e6"; // first entry of Fusion's component colour cycle ("Light Purple")
const HATCH_COLOR = new THREE.Color("#3a3a3a");
const HATCH_PX = 11; // on-screen spacing of the diagonal hatch lines (along u+v)

/** Rotate v about unit axis k by deg (Rodrigues). */
export function rotate(v, k, deg) {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const kv = V.cross(k, v), d = V.dot(k, v);
  return [0, 1, 2].map((i) => v[i] * c + kv[i] * s + k[i] * d * (1 - c));
}

/** Evaluate a stored expression ("-5 mm", "d1/2", 3) with the document parameters. */
export function evalExpr(app, expr, kind = "length") {
  if (typeof expr === "number") return expr;
  try {
    const P = app.M.buildParams(app.doc);
    const v = P.eval(String(expr ?? "0"), kind);
    if (Number.isFinite(v)) return v;
  } catch { /* fall through */ }
  const v = Number.parseFloat(expr);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Cut plane of a section definition: {base:{o,x,n}, point (manipulator anchor on the base plane),
 * o, n (normal pointing at the removed side), x, y, n1, y1 (after the X rotation)}.
 */
export function sectionGeometry(app, s) {
  const base = resolveBase(app, s);
  if (!base) return null;
  const d = evalExpr(app, s.distance, "length");
  const ax = evalExpr(app, s.xAngle, "angle");
  const ay = evalExpr(app, s.yAngle, "angle");
  const n0 = V.norm(base.n), x0 = V.norm(base.x);
  const y0 = V.cross(n0, x0);
  const anchor = s.anchor || base.o;
  // anchor projected onto the base plane
  const point = V.sub(anchor, V.mul(n0, V.dot(V.sub(anchor, base.o), n0)));
  const o = V.add(point, V.mul(n0, d));
  const n1 = rotate(n0, x0, ax), y1 = rotate(y0, x0, ax);
  let n = rotate(n1, y1, ay);
  const x = V.norm(V.cross(y1, n));
  if (s.flip) n = V.mul(n, -1);
  return { base: { o: base.o, x: x0, n: n0, y: y0 }, point, o, n: V.norm(n), x, y: V.cross(V.norm(n), x), n1, y1, d, ax, ay };
}

function resolveBase(app, s) {
  const K = app.K;
  const r = s.planeRef;
  if (r && r.kind === "originPlane" && K.ORIGIN_PLANES[r.name]) return { ...K.ORIGIN_PLANES[r.name] };
  if (r && r.kind === "cplane") { const st = app.planeState(r.id); if (st) return { ...st.plane }; }
  return s.plane ? { ...s.plane } : null;
}

export function createAnalyses(app) {
  const vp = () => app.viewport;
  const overlay = new CanvasOverlay(app, "inspect-com");
  let previewSection = null; // section definition shown while the dialog is open (overrides the stored ones)
  let previewSectionId = null; // id of the analysis being edited (hidden while previewing)
  let previewCom = null; // {bodies}
  let previewAnalysis = null; // surface analysis definition shown while its dialog is open
  let previewAnalysisId = null; // id of the analysis being edited (its stored version is hidden meanwhile)
  let display = null;
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const clipList = [clipPlane];
  let clipOn = false;
  let clipApplied = false;
  let capGroup = null;
  let capKey = "";
  let capTimer = null;
  let lastCapAt = 0;
  let modelVersion = 0;
  let refreshTimer = null;

  // ------------------------------------------------------------------ store
  const docList = () => (Array.isArray(app.doc.analyses) ? app.doc.analyses : []);
  const store = {
    list() {
      return docList().map((a) => {
        const m = ANALYSIS_META[a.type] || {};
        return { id: a.id, type: a.type, name: a.name, visible: a.visible !== false, kindLabel: m.label, icon: iconFor(a.type), command: m.cmd };
      });
    },
    get(id) { return docList().find((a) => a.id === id) || null; },
    add(def, label) {
      return app.mutate(label || ((ANALYSIS_META[def.type] || {}).label || "Analysis"), (doc) => {
        doc.analyses = Array.isArray(doc.analyses) ? doc.analyses : [];
        doc.counters = doc.counters || {};
        doc.counters.analysis = (doc.counters.analysis || 0) + 1;
        const stem = (ANALYSIS_META[def.type] || {}).stem || "Analysis";
        doc.counters[`analysis:${stem}`] = (doc.counters[`analysis:${stem}`] || 0) + 1;
        const a = { ...JSON.parse(JSON.stringify(def)), id: `a${doc.counters.analysis}`, name: def.name || `${stem}${doc.counters[`analysis:${stem}`]}`, visible: true };
        if (a.type === "section") for (const o of doc.analyses) if (o.type === "section") o.visible = false; // one live section at a time
        doc.analyses.push(a);
        return a.id;
      }, { recompute: false });
    },
    update(id, patch, label) {
      return app.mutate(label || "Edit Analysis", (doc) => {
        const a = (doc.analyses || []).find((x) => x.id === id);
        if (!a) throw new Error("The analysis no longer exists");
        Object.assign(a, JSON.parse(JSON.stringify(patch)));
        return id;
      }, { recompute: false });
    },
    remove(id) {
      if (!store.get(id)) return;
      app.mutate("Delete", (doc) => { doc.analyses = (doc.analyses || []).filter((a) => a.id !== id); }, { recompute: false });
    },
    rename(id, name) {
      name = String(name || "").trim();
      const a = store.get(id);
      if (!a || !name || a.name === name) return;
      app.mutate("Rename", (doc) => { const x = (doc.analyses || []).find((y) => y.id === id); if (x) x.name = name; }, { recompute: false });
    },
    setVisible(id, v) {
      const a = store.get(id);
      if (!a || (a.visible !== false) === !!v) return;
      app.mutate(v ? "Show" : "Hide", (doc) => {
        for (const x of doc.analyses || []) {
          if (x.id === id) x.visible = !!v;
          else if (v && a.type === "section" && x.type === "section") x.visible = false;
        }
      }, { recompute: false });
    },
    setPreviewSection(def, editingId = null) { previewSection = def; previewSectionId = editingId; refresh(); },
    setPreviewCom(def) { previewCom = def; refreshCom(); },
    /** Show a tentative surface analysis (dialog open); editingId hides the stored one being edited. */
    setPreviewAnalysis(def, editingId = null) { previewAnalysis = def; previewAnalysisId = editingId; if (display) display.refresh(); },
    /** Visible surface analyses in display order (stored ones + the dialog preview). */
    activeSurfaceAnalyses() {
      const out = [];
      for (const a of docList()) {
        if (a.type === "section" || a.type === "com" || a.visible === false) continue;
        if (previewAnalysisId && a.id === previewAnalysisId) continue;
        out.push(a);
      }
      if (previewAnalysis) out.push(previewAnalysis);
      return out;
    },
    get display() { if (!display) display = createSurfaceDisplay(app, store); return display; }, // created on first use (dialogs need directionOf before the first refresh)
    activeSection() {
      if (previewSection) return previewSection;
      const s = [...docList()].reverse().find((a) => a.type === "section" && a.visible !== false && a.id !== previewSectionId);
      return s || null;
    },
    get clipping() { return clipOn ? { normal: clipPlane.normal.toArray(), constant: clipPlane.constant } : null; },
    refresh: () => refresh(),
  };

  // ------------------------------------------------------------------ clipping
  function install() {
    const v = vp();
    if (!v || !v.scene || install.done) return;
    install.done = true;
    try { v.renderer.localClippingEnabled = true; } catch { /* ignore */ }
    // geometry cut away by the section is not pickable (hover / select go through to what is visible)
    const picker = v._vp && v._vp.picker;
    if (picker && typeof picker.pickAll === "function" && !picker._inspSection) {
      picker._inspSection = true;
      const orig = picker.pickAll.bind(picker);
      picker.pickAll = (x, y, opts) => {
        const hits = orig(x, y, opts);
        if (!clipOn || !Array.isArray(hits)) return hits;
        const n = clipPlane.normal, c = clipPlane.constant;
        return hits.filter((h) => {
          const k = h && h.ref && h.ref.kind;
          if (!h.point || !(k === "face" || k === "body" || k === "edge" || k === "vertex")) return true;
          const p = h.point;
          return n.x * p[0] + n.y * p[1] + n.z * p[2] + c >= -1e-4 * (1 + Math.abs(c));
        });
      };
    }
    const scene = v.scene;
    const prev = scene.onBeforeRender;
    scene.onBeforeRender = function (...args) {
      try { applyClip(); } catch (e) { console.warn("[inspect] clip", e); }
      if (typeof prev === "function") return prev.apply(this, args);
    };
  }
  function clipTargets() {
    const v = vp();
    const out = [];
    if (v && v.groups && v.groups.bodies) out.push(v.groups.bodies);
    const hl = v && v._vp && v._vp.highlighter && v._vp.highlighter.root;
    if (hl) out.push(hl);
    return out;
  }
  function applyClip() {
    if (!clipOn && !clipApplied) return;
    const want = clipOn ? clipList : null;
    for (const root of clipTargets()) {
      root.traverse((o) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) if (m.clippingPlanes !== want) { m.clippingPlanes = want; m.needsUpdate = true; }
      });
    }
    clipApplied = clipOn;
  }

  // ------------------------------------------------------------------ caps
  function clearCaps() {
    if (!capGroup) return;
    for (const c of [...capGroup.children]) {
      capGroup.remove(c);
      c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
  }
  function hatchMaterial(color, g, spacing, hatch) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uHatch: { value: HATCH_COLOR },
        uOrigin: { value: new THREE.Vector3(...g.o) },
        uU: { value: new THREE.Vector3(...g.x) },
        uV: { value: new THREE.Vector3(...g.y) },
        uSpacing: { value: spacing },
        uOn: { value: hatch ? 1 : 0 },
      },
      vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: [
        "uniform vec3 uColor; uniform vec3 uHatch; uniform vec3 uOrigin; uniform vec3 uU; uniform vec3 uV; uniform float uSpacing; uniform float uOn;",
        "varying vec3 vW;",
        "void main(){",
        "  vec3 d = vW - uOrigin;",
        "  float t = (dot(d, uU) + dot(d, uV)) / uSpacing;",
        "  float w = max(fwidth(t), 1e-4);",
        "  float k = fract(t); float dist = min(k, 1.0 - k) / w;",
        "  float line = (1.0 - smoothstep(0.3, 0.95, dist)) * uOn;",
        "  gl_FragColor = vec4(mix(uColor, uHatch, line * 0.8), 1.0);",
        "}",
      ].join("\n"),
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }
  /** Hatch line spacing in world units for ~HATCH_PX screen pixels at point p. */
  function hatchSpacing(p) {
    const v = vp();
    let px = 0.1;
    try { px = v.pixelSize(p); } catch { /* keep */ }
    return Math.max(1e-4, (Number.isFinite(px) && px > 0 ? px : 0.1) * HATCH_PX);
  }
  function updateHatchSpacing() {
    if (!capGroup || !capGroup.children.length) return;
    for (const c of capGroup.children) {
      const u = c.material && c.material.uniforms;
      if (u && u.uSpacing) u.uSpacing.value = hatchSpacing(u.uOrigin.value.toArray());
    }
  }
  function buildCaps(sec, g) {
    const v = vp();
    if (!v || !v.scene) return;
    if (!capGroup) { capGroup = new THREE.Group(); capGroup.name = "inspect-section-caps"; capGroup.userData.noPick = true; v.scene.add(capGroup); }
    clearCaps();
    const R = app.K.R;
    const bodies = app.bodies().filter((b) => b.shape && b.meta && b.meta.visible !== false);
    if (!bodies.length) { v.requestRender(); return; }
    let box = null;
    for (const b of bodies) { const bb = app.K.bboxOf(b.shape); if (bb) box = box ? { min: box.min.map((x, i) => Math.min(x, bb.min[i])), max: box.max.map((x, i) => Math.max(x, bb.max[i])) } : bb; }
    const diag = box ? V.len(V.sub(box.max, box.min)) : 100;
    const L = diag * 2 + 10;
    const c = (u, w) => V.add(g.o, V.add(V.mul(g.x, u), V.mul(g.y, w)));
    const spacing = hatchSpacing(g.o);
    const color = sec.colorSource === "custom" && sec.customColor ? sec.customColor : SECTION_COMPONENT_COLOR;
    const groupsVisible = !v.groups || !v.groups.bodies || v.groups.bodies.visible;
    if (!groupsVisible) return;
    for (const b of bodies) {
      let face = null, cut = null;
      try {
        face = R.makePolygon([c(-L, -L), c(L, -L), c(L, L), c(-L, L)]);
        cut = b.shape.intersect(face);
        if (!cut || !cut.faces || !cut.faces.length) continue;
        const m = cut.mesh({ tolerance: Math.max(0.01, diag * 0.0008), angularTolerance: 10 });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(m.vertices), 3));
        geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(m.triangles), 1));
        const mesh = new THREE.Mesh(geo, hatchMaterial(color, g, spacing, sec.hatch !== false));
        mesh.userData = { noPick: true, body: b.id, sectionCap: true };
        mesh.renderOrder = 3;
        capGroup.add(mesh);
        const em = cut.meshEdges({ tolerance: Math.max(0.01, diag * 0.0008), angularTolerance: 10 });
        if (em && em.lines && em.lines.length) {
          const lg = new THREE.BufferGeometry();
          lg.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(em.lines), 3));
          const ln = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x111111 }));
          ln.userData = { noPick: true };
          ln.renderOrder = 4;
          capGroup.add(ln);
        }
      } catch (e) {
        console.warn("[inspect] section cap failed", e);
      } finally {
        try { if (face) face.delete(); } catch { /* ignore */ }
        try { if (cut) cut.delete(); } catch { /* ignore */ }
      }
    }
    v.requestRender();
  }

  // ------------------------------------------------------------------ refresh
  function refreshSection() {
    install();
    const sec = store.activeSection();
    const g = sec ? sectionGeometry(app, sec) : null;
    if (!sec || !g) {
      clipOn = false;
      if (capGroup) clearCaps();
      capKey = "";
      clearTimeout(capTimer);
      const v = vp(); if (v) v.requestRender();
      return;
    }
    // keep the side opposite to n: THREE clips points with negative signed distance
    clipPlane.normal.set(-g.n[0], -g.n[1], -g.n[2]);
    clipPlane.constant = V.dot(g.n, g.o);
    clipOn = true;
    const shapes = app.bodies().filter((b) => b.shape && b.meta && b.meta.visible !== false).map((b) => b.id).join(",");
    const key = `${modelVersion}|${shapes}|${g.o.map((x) => x.toFixed(5))}|${g.n.map((x) => x.toFixed(6))}|${sec.colorSource}|${sec.customColor}|${sec.hatch}`;
    const v = vp(); if (v) v.requestRender();
    if (key === capKey && capGroup && capGroup.children.length) return;
    capKey = key;
    // caps are a kernel boolean per body: throttle while a manipulator is being dragged
    clearTimeout(capTimer);
    const now = performance.now();
    const run = () => { lastCapAt = performance.now(); const s2 = store.activeSection(); const g2 = s2 && sectionGeometry(app, s2); if (s2 && g2) buildCaps(s2, g2); };
    if (now - lastCapAt > 140) run();
    else capTimer = setTimeout(run, 140);
  }

  function refreshCom() {
    overlay.clear();
    const items = [];
    if (previewCom) items.push(previewCom);
    for (const a of docList()) if (a.type === "com" && a.visible !== false && a.id !== (previewCom && previewCom.editingId)) items.push(a);
    for (const a of items) {
      const src = a === previewCom ? a.bodies || [] : a.bodies && a.bodies.length ? a.bodies : visibleBodyIds(app);
      const ids = src.filter((id) => app.body(id) && app.bodyMeta(id).visible !== false);
      if (!ids.length) continue;
      try {
        const mp = massProps(app, ids, { inertia: false, area: false });
        if (mp.count) overlay.comGlyph(mp.com, 8);
      } catch (e) { console.warn("[inspect] com failed", e); }
    }
  }

  function refreshSurface() {
    if (!display) display = createSurfaceDisplay(app, store);
    try { display.refresh(); } catch (e) { console.warn("[inspect] analyses display", e); }
  }
  function refresh() { clearTimeout(refreshTimer); refreshTimer = null; refreshSection(); refreshCom(); refreshSurface(); }
  /** Coalesce the doc + model events of one mutation into one refresh. */
  function schedule() { if (!refreshTimer) refreshTimer = setTimeout(refresh, 0); }

  app.on("model", (e) => {
    modelVersion++;
    // live previews of other commands: let the surface analyses follow, but coalesce rapid drags
    if (e && e.preview && store.activeSurfaceAnalyses().length) { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 120); return; }
    schedule();
  });
  app.on("camera", () => updateHatchSpacing());
  app.on("doc", () => { schedule(); app.emit("analyses", {}); });
  app.on("ready", () => refresh());
  return store;
}
