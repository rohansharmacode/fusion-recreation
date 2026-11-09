// Viewport module: the Fusion canvas. Creates app.viewport (contract in ARCHITECTURE.md
// "Viewport"): Z-up three.js scene, camera rig with Fusion navigation (MMB pan, Shift+MMB
// orbit, wheel zoom to cursor, double-MMB fit, trackpad gestures), adaptive layout grid,
// body rendering with visual styles, picking, highlight, origin + construction planes,
// preview shapes, base selection handler, ViewCube and navigation bar.
//
// Additive API beyond the ARCHITECTURE.md contract (app.viewport.*):
//   rig                         CameraRig {target, quat, dist, mode, forward(), up(), pixelSize(p), ...}
//   goHome({animate})           Promise; ViewCube home (fit-to-view unless a fixed home was set)
//   lookAtRef(ref) / planeForRef(ref)   look at a face / origin plane / cplane / sketch
//   getView() / setViewState(s, {animate})   serialisable camera state {target, quat, dist, mode}
//   visualStyle / setVisualStyle(id)        Fusion ids: ViewShadedCommand (default, Ctrl+4),
//                               ViewShadedHLCommand, ViewShadedWithEdgesHLRCommand, ViewWireframeCommand, ...
//   cameraMode / setCameraMode('persp'|'ortho'|'perspOrtho')   default 'ortho' (as in the reference captures)
//   status text: renders app.status bottom-right ('status' events) and sets it for canvas
//     selection / pre-highlight ("Body1", "Face", "Edge", "2 Edges", "Extrude1"); vp.refreshStatus()
//   objectVisibility {origins, bodies, sketches, sketchDimensions, constructionPlanes} /
//     setObjectVisibility(key, bool) — emits 'viewport-visibility'
//   gridSettings {visible, lock, snap, adaptive, major, subdivisions, incremental, linearIncrement,
//     angularIncrement} (emits 'viewport-grid' on change), gridSpacing() = current minor spacing,
//     setGridPlane(plane|null) to override where the layout grid is drawn (default: XY, or the
//     active sketch plane while sketching)
//   addWindowSelectProvider(fn(region) -> refs[]) — region {kind:'window'|'crossing', rect,
//     polygon, inside(x,y), segmentTouches(ax,ay,bx,by)} in canvas CSS px
//   selectionMode ('window'|'freeform'|'paint'), selectionPriority ('face'|'body'|'edge')
//   anchorAt(x,y) -> world point under the cursor (body hit or target depth)
//   overlayScene                groups.overlay lives here and is drawn after a depth clear (always on top)
//   viewCube, navbar, menu, size(), isAnimating(), stats.frames
// Note: `camera` returns the perspective OR orthographic camera depending on the mode — read it
// each time instead of caching it.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import "./style.css";
import { refKey } from "../../app/core.js";
import { CameraRig, quatFromBackUp, viewDirection } from "./camera.js";
import { LayoutGrid } from "./grid.js";
import { MeshCache, BodyLayer, PreviewLayer, VISUAL_STYLES, DEFAULT_STYLE } from "./bodies.js";
import { Highlighter } from "./highlight.js";
import { OriginLayer } from "./origin.js";
import { Picker } from "./pick.js";
import { SelectionTool } from "./selection.js";
import { ViewCube } from "./viewcube.js";
import { Menu } from "./menu.js";
import { NavTools } from "./navtools.js";
import { NavBar, ViewDialogs, registerViewCommands, ENVIRONMENTS } from "./navbar.js";

const V3 = THREE.Vector3;
const PREFS_KEY = "fusion-recreation.viewport.v2";
const COLOR_CYCLE = ["#e391e6", "#ffd97a", "#c4f570", "#5c8ced", "#bf8cf2", "#ffb86e", "#d9de59", "#54d9f7", "#fc94cf", "#e8cf63"];
// Empty design: Fusion's home view shows the XY plane at 3.6 px/mm (layout grid lines every 50 mm,
// ~178 mm visible vertically on its 641 px tall canvas) with the origin at the canvas centre.
const EMPTY_PX_PER_MM = 3.6;

const DEFAULT_PREFS = () => ({
  orbitType: "free",
  fitType: "fit",
  environment: "ViewEnvMatchThemeCommand",
  graphicsPreset: "ViewPresetPerformanceCommand",
  effects: { groundPlane: false, groundShadow: false, groundReflection: false, objectShadow: false, ambientOcclusion: false, antiAliasing: true, dome: false, componentColors: false },
  grid: { visible: true, lock: false, snap: true, adaptive: true, major: 50, subdivisions: 5, incremental: false, linearIncrement: 1, angularIncrement: 15 },
  showViewCube: true,
  showNavBar: true,
  // the reference captures show an orthographic camera (no convergence of the layout grid)
  cameraMode: "ortho",
  visualStyle: DEFAULT_STYLE,
});

function loadPrefs() {
  const d = DEFAULT_PREFS();
  try {
    const raw = window.localStorage && window.localStorage.getItem(PREFS_KEY);
    if (!raw) return d;
    const p = JSON.parse(raw);
    return { ...d, ...p, effects: { ...d.effects, ...(p.effects || {}) }, grid: { ...d.grid, ...(p.grid || {}) } };
  } catch {
    return d;
  }
}

function gradientTexture(stops) {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 512;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, stops[0]);
  grd.addColorStop(0.55, stops[1] || stops[0]);
  grd.addColorStop(1, stops[2] || stops[1] || stops[0]);
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fusion-style status label for refs (bottom-right canvas text). */
function refStatus(app, items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return "";
  const kinds = new Set(list.map((r) => r.kind));
  const one = list.length === 1 ? list[0] : null;
  const nameOf = (r) => {
    if (r.kind === "body") { const m = app.bodyMeta && app.bodyMeta(r.body); return (m && m.name) || "Body"; }
    if (r.kind === "feature" || r.kind === "cplane") { const f = app.feature(r.id); return (f && f.name) || ""; }
    if (r.kind === "occurrence" && app.components) return app.components.label(r.occ);
    return "";
  };
  const LABEL = { face: ["Face", "Faces"], meshFace: ["Mesh Face", "Mesh Faces"], edge: ["Edge", "Edges"], vertex: ["Vertex", "Vertices"], body: ["Body", "Bodies"], originPlane: ["Plane", "Planes"], originAxis: ["Axis", "Axes"], originPoint: ["Point", "Points"], cplane: ["Plane", "Planes"], feature: ["Feature", "Features"], occurrence: ["Component", "Components"] };
  if (one) {
    if (one.kind === "body" || one.kind === "feature" || one.kind === "cplane" || one.kind === "occurrence") return nameOf(one);
    if (one.kind === "originPlane") return `${one.name} Plane`;
    if (one.kind === "originAxis") return `${one.name} Axis`;
    if (one.kind === "originPoint") return "Origin";
    if (LABEL[one.kind]) return LABEL[one.kind][0];
    return null; // not ours (profiles, sketch items...): leave the status to their owners
  }
  if (kinds.size === 1) {
    const k = [...kinds][0];
    if (LABEL[k]) return `${list.length} ${LABEL[k][1]}`;
    return null;
  }
  if ([...kinds].every((k) => LABEL[k])) return `${list.length} Items`;
  return null;
}

export function init(app) {
  THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
  const host = app.dom.canvasHost;
  host.classList.add("vp-host");
  const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  host.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.classList.add("vp-canvas");
  const labelLayer = document.createElement("div");
  labelLayer.className = "vp-label-layer";
  host.appendChild(labelLayer);
  // bottom-right status text ("Body1", "Edge", "1 Profile | Area : 800.00 mm^2")
  const statusEl = document.createElement("div");
  statusEl.className = "vp-status";
  statusEl.setAttribute("aria-live", "polite");
  host.appendChild(statusEl);
  const showStatus = (t) => { statusEl.textContent = t || ""; statusEl.style.display = t ? "" : "none"; };
  showStatus(app.status || "");
  app.on("status", ({ text }) => showStatus(text));

  const scene = new THREE.Scene();
  scene.name = "main";
  const overlayScene = new THREE.Scene();
  overlayScene.name = "overlay";
  const prefs = loadPrefs();
  const rig = new CameraRig({ fov: 30 });
  rig.mode = ["persp", "ortho", "perspOrtho"].includes(prefs.cameraMode) ? prefs.cameraMode : "ortho";

  // lighting: soft IBL (room environment) + hemisphere + a head light following the camera
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const hemi = new THREE.HemisphereLight(0xffffff, 0xaab1ba, 0.7);
  scene.add(hemi);
  const head = new THREE.DirectionalLight(0xffffff, 1.4);
  scene.add(head, head.target);
  const shadowLight = new THREE.DirectionalLight(0xffffff, 0.0001);
  shadowLight.castShadow = true;
  shadowLight.shadow.mapSize.set(2048, 2048);
  shadowLight.shadow.bias = -0.0005;
  shadowLight.shadow.normalBias = 0.02;
  scene.add(shadowLight, shadowLight.target);
  for (const l of [new THREE.AmbientLight(0xffffff, 1.6), new THREE.DirectionalLight(0xffffff, 1.4)]) overlayScene.add(l);
  const overlayHead = overlayScene.children[1];

  const groups = {};
  for (const name of ["bodies", "sketches", "construction", "origin", "preview"]) {
    groups[name] = new THREE.Group();
    groups[name].name = name;
    scene.add(groups[name]);
  }
  groups.overlay = new THREE.Group();
  groups.overlay.name = "overlay";
  overlayScene.add(groups.overlay);

  const grid = new LayoutGrid();
  scene.add(grid.mesh);
  scene.add(grid.axes);
  grid.settings = prefs.grid;
  grid.attachLabels(labelLayer);

  // ground shadow catcher
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22, depthWrite: false }));
  shadowPlane.receiveShadow = true;
  shadowPlane.visible = false;
  shadowPlane.renderOrder = -5;
  shadowPlane.userData.noPick = true;
  scene.add(shadowPlane);
  // Effects > Ground Plane: a faint floor under the model (moved by Ground Plane Offset)
  const groundPlane = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), new THREE.MeshBasicMaterial({ color: 0xdcdcdc, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  groundPlane.visible = false;
  groundPlane.renderOrder = -6;
  groundPlane.userData.noPick = true;
  scene.add(groundPlane);

  // ---------- state ----------
  let needs = true;
  let boundsDirty = true;
  const requestRender = () => { needs = true; };
  const size = () => ({ w: host.clientWidth || 1, h: host.clientHeight || 1 });
  const cache = new MeshCache(app.K);
  const objectVisibility = { origins: true, bodies: true, sketches: true, sketchDimensions: true, constructionPlanes: true };
  let homeState = null; // {quat, target, dist, fit}
  let viewCube = null;
  let navbar = null;
  let navTools = null;

  const vp = {
    app, THREE, renderer, scene, canvas, groups, labelLayer, host, rig, cache, prefs, grid,
    overlayScene, objectVisibility,
    refKey,
    size,
    requestRender,
    envMap: envTex,
    styleInfo: () => VISUAL_STYLES[bodies.style] || VISUAL_STYLES[DEFAULT_STYLE],
  };
  const bodies = new BodyLayer(vp);
  vp.bodies = bodies;
  const preview = new PreviewLayer(vp);
  const origin = new OriginLayer(vp);
  vp.origin = origin;
  const highlighter = new Highlighter(vp);
  vp.highlighter = highlighter;
  const picker = new Picker(vp);
  vp.picker = picker;
  vp.pickAll = (x, y, opts) => picker.pickAll(x, y, opts);
  vp.pick = (x, y, opts) => picker.pick(x, y, opts);
  vp.menu = new Menu(app);

  function savePrefs() {
    try { window.localStorage && window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* sandboxed */ }
  }
  vp.savePrefs = savePrefs;

  // ---------- bounds ----------
  function contentBox(includeSketches = true) {
    const box = new THREE.Box3();
    if (groups.bodies.visible && bodies.bounds.radius > 0) box.union(bodies.bounds.box);
    if (includeSketches && groups.sketches.visible && groups.sketches.children.length) {
      try {
        const s = new THREE.Box3().setFromObject(groups.sketches);
        if (!s.isEmpty() && isFinite(s.min.x) && isFinite(s.max.x)) box.union(s);
      } catch { /* ignore */ }
    }
    if (groups.preview.children.length) {
      try { const p = new THREE.Box3().setFromObject(groups.preview); if (!p.isEmpty()) box.union(p); } catch { /* ignore */ }
    }
    return box;
  }
  function contentSphere() {
    const box = contentBox();
    if (box.isEmpty()) return null;
    const s = box.getBoundingSphere(new THREE.Sphere());
    if (!isFinite(s.radius)) return null;
    s.radius = Math.max(s.radius, 0.5);
    return s;
  }
  function updateSceneBounds() {
    boundsDirty = false;
    const s = contentSphere();
    if (s) rig.setSceneBounds(s.center, Math.max(s.radius, 10));
    else rig.setSceneBounds(new V3(), 100);
  }

  // ---------- environment / effects ----------
  function applyEnvironment() {
    if (!ENVIRONMENTS[prefs.environment]) prefs.environment = "ViewEnvMatchThemeCommand";
    const env = ENVIRONMENTS[prefs.environment];
    if (scene.background && scene.background.isTexture && scene.background !== envTex) scene.background.dispose();
    // Fusion's environments use a plain background colour (white for Match Theme / Photo Booth)
    if (prefs.effects.dome) scene.background = envTex;
    else if (Array.isArray(env.bg) && env.bg.length > 1) scene.background = gradientTexture(env.bg);
    else scene.background = new THREE.Color(Array.isArray(env.bg) ? env.bg[0] : env.bg);
    scene.backgroundBlurriness = prefs.effects.dome ? 0.35 : 0;
    grid.setColor(env.grid, env.gridOpacity, env.sketchGridOpacity ?? env.gridOpacity * 0.32);
    host.style.background = Array.isArray(env.bg) ? env.bg[0] : env.bg;
    host.classList.toggle("vp-dark-env", !!env.dark);
    if (navbar) navbar.root.classList.toggle("nb-dark", !!env.dark);
    requestRender();
  }
  let lastShadowKey = "";
  function applyEffects() {
    const fx = prefs.effects;
    const shadows = !!(fx.groundShadow || fx.objectShadow);
    const key = `${shadows}|${!!fx.objectShadow}`;
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    shadowLight.intensity = shadows ? 0.0001 : 0;
    shadowLight.castShadow = shadows;
    shadowPlane.visible = !!fx.groundShadow && bodies.bounds.radius > 0;
    for (const o of bodies.objects.values()) {
      o.mesh.castShadow = shadows;
      o.mesh.receiveShadow = !!fx.objectShadow;
    }
    // object shadows need a real light; ground shadow alone uses the catcher plane
    shadowLight.intensity = fx.objectShadow ? 0.6 : 0.0001;
    head.intensity = fx.objectShadow ? 1.1 : 1.4;
    if (key !== lastShadowKey) {
      lastShadowKey = key;
      for (const m of bodies.materials.values()) m.needsUpdate = true;
    }
    updateShadowRig();
    requestRender();
  }
  function updateShadowRig() {
    const b = bodies.bounds;
    if (!(b.radius > 0)) { shadowPlane.visible = false; groundPlane.visible = false; return; }
    const c = b.center, r = b.radius;
    const gz = b.box.min.z - r * 0.002 + (Number(prefs.groundOffset) || 0);
    groundPlane.visible = !!prefs.effects.groundPlane;
    groundPlane.position.set(c.x, c.y, gz - r * 0.001);
    groundPlane.scale.set(r * 6, r * 6, 1);
    const dir = new V3(0.12, -0.22, -1).normalize();
    shadowLight.position.copy(c).addScaledVector(dir, -r * 4);
    shadowLight.target.position.copy(c);
    const sc = shadowLight.shadow.camera;
    sc.left = -r * 2; sc.right = r * 2; sc.top = r * 2; sc.bottom = -r * 2;
    sc.near = r * 0.5; sc.far = r * 10;
    sc.updateProjectionMatrix();
    shadowLight.target.updateMatrixWorld();
    shadowPlane.position.set(c.x, c.y, gz);
    shadowPlane.scale.set(r * 8, r * 8, 1);
    shadowPlane.visible = !!prefs.effects.groundShadow;
  }
  vp.setEnvironment = (id) => { if (!ENVIRONMENTS[id]) return; prefs.environment = id; savePrefs(); applyEnvironment(); };
  vp.setGroundOffset = (v) => { prefs.groundOffset = Number(v) || 0; savePrefs(); applyEffects(); };
  vp.setEffect = (key, val) => {
    prefs.effects[key] = !!val;
    // any effect change makes the graphics preset "Custom" (Fusion: Performance/Quality are read-only)
    prefs.graphicsPreset = "ViewPresetCustomCommand";
    savePrefs();
    if (key === "dome") applyEnvironment();
    if (key === "componentColors") { bodies.colorCycle = !!val ? COLOR_CYCLE : null; bodies.setStyle(bodies.style); }
    if (key === "antiAliasing") app.toast("Anti-aliasing changes apply after reloading the page", "info", 2200);
    applyEffects();
  };
  const PRESETS = {
    ViewPresetPerformanceCommand: { groundShadow: false, objectShadow: false, groundReflection: false, ambientOcclusion: false, antiAliasing: true },
    ViewPresetQyalityCommand: { groundShadow: true, objectShadow: true, groundReflection: false, ambientOcclusion: true, antiAliasing: true },
  };
  vp.setGraphicsPreset = (id) => {
    prefs.graphicsPreset = id;
    if (PRESETS[id]) Object.assign(prefs.effects, PRESETS[id]);
    savePrefs();
    applyEffects();
  };
  bodies.colorCycle = prefs.effects.componentColors ? COLOR_CYCLE : null;

  // ---------- render loop ----------
  let lastSize = { w: 0, h: 0 };
  let pristineState = null;
  const isPristine = () => !!pristineState && !rig.anim && rig.target.lengthSq() < 1e-12 && Math.abs(rig.dist - pristineState.dist) < 1e-6 * pristineState.dist && Math.abs(rig.quat.dot(pristineState.quat)) > 1 - 1e-9;
  function setPristine() { rig.setState(emptyState(rig.quat)); pristineState = { dist: rig.dist, quat: rig.quat.clone() }; }
  function resize() {
    const { w, h } = size();
    if (w === lastSize.w && h === lastSize.h) return;
    lastSize = { w, h };
    renderer.setSize(w, h, false);
    // while the start-up empty view is untouched, keep Fusion's 3.6 px/mm as the layout settles
    const pristine = isPristine();
    rig.setSize(w, h);
    if (pristine && !contentSphere()) setPristine();
    navTools && navTools.relayout();
    requestRender();
  }
  new ResizeObserver(resize).observe(host);

  const stats = { frames: 0 };
  vp.stats = stats;
  // grid numbers along the axes: in a sketch, and on the hovered origin plane while picking one
  function updateGridLabels(gridOn) {
    const hovName = origin.hoveredPlane();
    const sketching = app.mode === "sketch" && !!app.activeSketch;
    if (!gridOn || (!sketching && !hovName)) { grid.hideLabels(); return; }
    const plane = !sketching && hovName ? app.K.ORIGIN_PLANES[hovName] : null;
    grid.updateLabels((p) => picker.project(p, [0, 0, 0, 1]), size(), rig.pixelSize(rig.target), plane);
  }
  function renderNow() {
    stats.frames++;
    if (boundsDirty) updateSceneBounds();
    const cam = rig.camera;
    const { w, h } = size();
    // head light from over the viewer's left shoulder
    const pos = rig.position();
    const up = rig.up(), right = rig.right();
    head.position.copy(pos).addScaledVector(up, rig.dist * 0.5).addScaledVector(right, -rig.dist * 0.8);
    head.target.position.copy(rig.target);
    head.target.updateMatrixWorld();
    overlayHead.position.copy(head.position).sub(rig.target);
    // grid (+ its axis lines and origin glyph; the origin point replaces the glyph when shown)
    const gridOn = !!prefs.grid.visible;
    origin.updateScale(rig);
    // hovering an origin plane (Create Sketch plane pick) shows that plane's numbers; Fusion drops
    // the layout grid lines meanwhile, so the hovered square reads as a plain face (ref 06)
    grid.mesh.visible = gridOn && !(app.mode !== "sketch" && origin.hoveredPlane());
    grid.axes.visible = gridOn;
    // the origin point ring is drawn without depth test (over the planes and axes) but, like
    // Fusion's, disappears behind bodies (ref 18: origin shown during Hole)
    if (origin.visible && origin.point.visible && !vp.styleInfo().xray) {
      const ms = bodies.visible().map((b) => b.mesh);
      if (ms.length && picker._occluded(new V3(0, 0, 0), ms)) origin.point.visible = false;
    }
    if (gridOn) {
      grid.setMode(app.mode === "sketch" ? "sketch" : "model");
      grid.update(rig, { project: (p) => picker.project(p, [0, 0, 0, 1]), dpr: renderer.getPixelRatio() });
      grid.glyph.visible = !(origin.visible && origin.itemVisible("O"));
    }
    updateGridLabels(gridOn);
    // screen-space line widths / dash lengths
    bodies.hiddenMat.dashSize = bodies.hiddenMat.gapSize = rig.pixelSize(rig.target) * 4;
    const setRes = (o) => { const m = o.material; if (m && m.isLineMaterial) m.resolution.set(w, h); };
    scene.traverseVisible(setRes);
    overlayScene.traverseVisible(setRes);
    renderer.autoClear = true;
    renderer.render(scene, cam);
    if (groups.overlay.children.length) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(overlayScene, cam);
      renderer.autoClear = true;
    }
    if (viewCube) viewCube.render(rig);
    app.emit("camera", {});
  }
  let lastVersion = -1;
  function frame(now) {
    requestAnimationFrame(frame);
    const animating = rig.tick(now);
    if (rig.version !== lastVersion) { lastVersion = rig.version; needs = true; }
    if (!needs && !animating) {
      if (viewCube && viewCube.dirty) viewCube.render(rig);
      return;
    }
    needs = false;
    try { renderNow(); } catch (e) {
      const now2 = performance.now();
      if (now2 - lastRenderError > 5000) { lastRenderError = now2; console.error("[viewport] render failed", e); }
    }
  }
  let lastRenderError = -1e9;
  // WebGL context loss (GPU reset, too many contexts): keep the page alive and redraw on restore
  canvas.addEventListener("webglcontextlost", (ev) => { ev.preventDefault(); }, false);
  canvas.addEventListener("webglcontextrestored", () => {
    try {
      const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
      bodies.setEnvMap(env);
      vp.envMap = env;
      applyEnvironment();
    } catch (e) { console.warn("[viewport] context restore", e); }
    requestRender();
  }, false);

  // ---------- coordinates ----------
  const ray = (x, y) => picker.ray(x, y);
  function rayPlane(x, y, pl) {
    const { o, d } = picker.rayV(x, y);
    const n = new V3(...pl.n);
    const den = d.dot(n);
    if (Math.abs(den) < 1e-12) return null;
    const t = new V3(...pl.o).sub(o).dot(n) / den;
    const w = o.clone().addScaledVector(d, t).toArray();
    return { world: w, uv: app.K.toLocal(pl, w), t };
  }
  function toScreen(p) {
    const s = picker.project(p, [0, 0, 0, 1]);
    return [s[0], s[1], s[2]];
  }
  const pixelSize = (p) => rig.pixelSize(new V3(...(p || rig.target.toArray())));

  /** World point under the cursor for zoom/pan anchoring: body hit, else the target depth. */
  function anchorAt(x, y) {
    const { o, d } = picker.rayV(x, y);
    const meshes = bodies.visible().map((b) => b.mesh);
    if (meshes.length) {
      picker.raycaster.set(o, d);
      picker.raycaster.near = 0;
      picker.raycaster.far = Infinity;
      const h = picker.raycaster.intersectObjects(meshes, false)[0];
      if (h) return h.point.clone();
    }
    // plane through the target facing the camera
    const f = rig.forward();
    const t = rig.target.clone().sub(o).dot(f) / d.dot(f);
    return o.clone().addScaledVector(d, t);
  }
  vp.anchorAt = anchorAt;

  // ---------- camera API ----------
  function emptyState(quat = rig.quat) {
    const hh = Math.max(40, (rig.height > 50 ? rig.height : 641) / (2 * EMPTY_PX_PER_MM));
    return { target: new V3(0, 0, 0), quat: quat.clone(), dist: hh / Math.tan(THREE.MathUtils.degToRad(rig.fov) / 2) };
  }
  function fitTargetState(quat = rig.quat) {
    const s = contentSphere();
    if (!s) return emptyState(quat);
    return rig.fitState(s.center, s.radius, quat);
  }
  function fit(opts = {}) {
    if (boundsDirty) updateSceneBounds();
    const st = fitTargetState();
    return rig.animateTo(st, opts.animate === false ? 0 : 320);
  }
  function setView(name, opts = {}) {
    if (boundsDirty) updateSceneBounds();
    const n = String(name || "home").toLowerCase();
    if (n === "home") return goHome(opts);
    const quat = rig.viewQuat(n, { minimalRoll: !!opts.minimalRoll });
    const hasContent = !!contentSphere();
    let st;
    if (opts.fit === false || (!hasContent && !opts.fitIfEmpty)) st = { target: rig.target.clone(), quat, dist: rig.dist };
    else st = fitTargetState(quat);
    if (!hasContent && opts.fitIfEmpty) st = { target: rig.target.clone(), quat, dist: rig.dist };
    return rig.animateTo(st, opts.animate === false ? 0 : 320);
  }
  function defaultHomeQuat() { return quatFromBackUp(viewDirection("home"), new V3(0, 0, 1)); }
  function goHome(opts = {}) {
    if (boundsDirty) updateSceneBounds();
    const ms = opts.animate === false ? 0 : 360;
    if (homeState && !homeState.fit) return rig.animateTo({ target: homeState.target.clone(), quat: homeState.quat.clone(), dist: homeState.dist }, ms);
    const q = homeState ? homeState.quat.clone() : defaultHomeQuat();
    return rig.animateTo(fitTargetState(q), ms);
  }
  function setHome(fitToView) {
    homeState = { quat: rig.quat.clone(), target: rig.target.clone(), dist: rig.dist, fit: !!fitToView };
    app.toast("Home view set", "info", 1200);
  }
  function resetHome() { homeState = null; app.toast("Home view reset", "info", 1200); }
  function lookAt(pl, opts = {}) {
    if (!pl || !pl.n) return Promise.resolve(false);
    const n = new V3(...pl.n).normalize();
    const y = pl.x ? new V3(...app.K.planeY(pl)).normalize() : null;
    let upv = y;
    if (!upv || upv.lengthSq() < 0.5) upv = Math.abs(n.z) > 0.9 ? new V3(0, 1, 0) : new V3(0, 0, 1);
    const quat = quatFromBackUp(n, upv);
    const o = new V3(...(pl.o || [0, 0, 0]));
    // keep the target where it is but bring it onto the plane
    const tgt = rig.target.clone();
    tgt.addScaledVector(n, -tgt.clone().sub(o).dot(n));
    let dist = rig.dist;
    if (opts.fit) {
      const st = fitTargetState(quat);
      return rig.animateTo({ ...st, target: tgt }, opts.animate === false ? 0 : 360);
    }
    return rig.animateTo({ target: tgt, quat, dist }, opts.animate === false ? 0 : 360);
  }
  /** Rotate the camera by a local-axes quaternion (ViewCube arrows), snapping to a clean view. */
  function rotateView(qLocal) {
    const target = rig.quat.clone().multiply(qLocal).normalize();
    // snap the orientation's axes to the world axes when close
    const m = new THREE.Matrix4().makeRotationFromQuaternion(target);
    const ex = new V3(), ey = new V3(), ez = new V3();
    m.extractBasis(ex, ey, ez);
    const snap = (v) => {
      const a = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)];
      const i = a.indexOf(Math.max(...a));
      if (a[i] > 0.999) { const s = new V3(); s.setComponent(i, Math.sign(v.getComponent(i))); return s; }
      return v;
    };
    const q = quatFromBackUp(snap(ez), snap(ey));
    return rig.animateTo({ target: rig.target.clone(), quat: q, dist: rig.dist }, 300);
  }
  vp.rotateView = rotateView;
  vp.orbitBy = (dx, dy, speed) => { rig.orbitTurntable(dx, dy, speed); requestRender(); };
  vp.panBy = (dx, dy, at) => { rig.pan(dx, dy, at); requestRender(); };
  vp.zoomAbout = (p, f) => { rig.zoomAbout(p, f); requestRender(); };
  vp.zoomBy = (f) => { rig.zoomAbout(null, f); requestRender(); };
  vp.zoomWindow = (x0, y0, x1, y1) => {
    const { w, h } = size();
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const p = anchorAt(cx, cy);
    const f = Math.max(Math.abs(x1 - x0) / w, Math.abs(y1 - y0) / h, 1e-4);
    // the window region at the anchor depth D should fill the view: dist' = f * D
    const D = Math.max(1e-6, p.clone().sub(rig.position()).dot(rig.forward()));
    const nd = rig.useOrtho ? rig.dist * f : D * f;
    return rig.animateTo({ target: p, quat: rig.quat.clone(), dist: nd }, 300);
  };
  vp.goHome = goHome;
  vp.setHome = setHome;
  vp.resetHome = resetHome;
  vp.setView = setView;
  vp.fit = fit;
  vp.lookAt = lookAt;
  vp.setCameraMode = (mode) => {
    rig.mode = mode;
    prefs.cameraMode = mode;
    savePrefs();
    rig.update();
    requestRender();
  };

  /** Look at a ref: planar face, origin plane, construction plane, sketch profile/feature. */
  function planeForRef(r) {
    if (!r) return null;
    const K = app.K;
    switch (r.kind) {
      case "face":
        if (r.planar) return K.planeFromNormal(r.p, r.n);
        return { o: r.p, n: r.n };
      case "originPlane": return K.ORIGIN_PLANES[r.name];
      case "cplane": { const s = app.planeState(r.id); return s && s.plane; }
      case "profile": case "sketchCurve": case "sketchPoint": { const s = app.sketchState(r.sketch); return s && s.plane; }
      case "feature": {
        const f = app.feature(r.id);
        if (!f) return null;
        if (f.type === "sketch") { const s = app.sketchState(r.id); return (s && s.plane) || f.plane; }
        if (f.type === "cplane") { const s = app.planeState(r.id); return s && s.plane; }
        return null;
      }
      default: return null;
    }
  }
  vp.lookAtRef = (r) => {
    const pl = planeForRef(r);
    if (!pl) { app.toast("Select a face or plane to look at", "info", 1600); return Promise.resolve(false); }
    return lookAt(pl, { animate: true });
  };
  vp.lookAtSelection = () => {
    const items = app.selection.items || [];
    for (const r of items) {
      if (planeForRef(r)) { navTools.stop(); return vp.lookAtRef(r); }
    }
    // in the sketch environment Look At faces the active sketch
    if (app.mode === "sketch" && app.activeSketch) {
      const ref = { kind: "feature", id: app.activeSketch };
      if (planeForRef(ref)) { navTools.stop(); return vp.lookAtRef(ref); }
    }
    navTools.toggle("lookAt");
    if (navTools.is("lookAt")) app.toast("Select a face or plane to look at", "info", 1800);
    return Promise.resolve(false);
  };

  // ---------- visibility / style API ----------
  vp.setVisualStyle = (id) => { bodies.setStyle(id); prefs.visualStyle = id; savePrefs(); applyEffects(); };
  vp.setObjectVisibility = (key, val) => {
    objectVisibility[key] = !!val;
    groups.bodies.visible = objectVisibility.bodies;
    bodies.visibleOverride = objectVisibility.bodies;
    groups.sketches.visible = objectVisibility.sketches;
    groups.construction.visible = objectVisibility.constructionPlanes;
    origin.cplaneOverride = objectVisibility.constructionPlanes;
    origin.override = objectVisibility.origins;
    boundsDirty = true;
    app.emit("viewport-visibility", { ...objectVisibility });
    requestRender();
  };
  vp.setGridPref = (key, val, notify = true) => {
    prefs.grid[key] = val;
    grid.settings = prefs.grid;
    if (key === "lock" && !val) grid.lockedS0 = null;
    savePrefs();
    if (notify) app.emit("viewport-grid", { ...prefs.grid });
    requestRender();
  };
  vp.isFullScreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  vp.setFullScreen = (on) => {
    try {
      if (on) { try { const p = (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement); if (p && p.catch) p.catch(() => app.toast("Full screen is not allowed here", "info")); } catch { app.toast("Full screen is not allowed here", "info"); } }
      else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } catch (e) { app.toast("Full screen is not available here", "info"); }
  };
  vp.setWidgetVisible = (which, v) => {
    if (which === "viewcube") { prefs.showViewCube = !!v; viewCube.setVisible(!!v); }
    if (which === "navbar") { prefs.showNavBar = !!v; navbar.setVisible(!!v); }
    savePrefs();
    app.emit("layout", {});
    requestRender();
  };

  // ---------- input ----------
  const posOf = (ev) => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const ctxFor = (ev) => {
    const { x, y } = posOf(ev);
    let hit;
    const R = ray(x, y);
    return {
      x, y, button: ev.button, shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey, alt: ev.altKey, ray: R,
      get hit() { if (hit === undefined) hit = picker.pick(x, y, { filter: (r) => app.selection.accepts(r) }); return hit; },
    };
  };
  let nav = null; // MMB drag {x, y, at}
  let lastMMB = { t: 0, x: 0, y: 0 };
  let leftDown = false;
  let pointerInCanvas = false; // mouse over the canvas (hover-derived status text)
  // The cursor follows the input stack's top handler (set when the stack changes) and the
  // navigation drag; handlers may still set canvas.style.cursor themselves while hovering.
  const updateCursor = () => {
    if (nav) { canvas.style.cursor = nav.mode === "orbit" ? "grabbing" : "move"; return; }
    const c = app.input.cursor();
    canvas.style.cursor = c && c !== "default" ? c : "";
  };
  app.on("input", updateCursor);

  // ---- touch: tap = click, one-finger drag = orbit, two fingers = pan + pinch zoom ----
  const touches = new Map();
  let touch = null; // {mode:'pending'|'orbit'|'pinch', ...}
  function touchDown(ev) {
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    if (touches.size === 1) touch = { mode: "pending", id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, lx: ev.clientX, ly: ev.clientY, ev };
    else if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      const r = canvas.getBoundingClientRect();
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      touch = { mode: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y), mx, my, at: anchorAt(mx - r.left, my - r.top) };
    }
  }
  function touchMove(ev) {
    if (!touches.has(ev.pointerId)) return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (!touch) return;
    if (touch.mode === "pending" && Math.hypot(ev.clientX - touch.x0, ev.clientY - touch.y0) > 8) touch.mode = "orbit";
    if (touch.mode === "orbit" && ev.pointerId === touch.id) {
      rig.orbitTurntable(ev.clientX - touch.lx, ev.clientY - touch.ly);
      touch.lx = ev.clientX; touch.ly = ev.clientY;
      requestRender();
    } else if (touch.mode === "pinch" && touches.size >= 2) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      rig.pan(mx - touch.mx, my - touch.my, touch.at);
      if (d > 4 && touch.d > 4) rig.zoomAbout(touch.at, touch.d / d);
      touch.d = d; touch.mx = mx; touch.my = my;
      requestRender();
    }
  }
  function touchUp(ev) {
    if (!touches.has(ev.pointerId)) return;
    touches.delete(ev.pointerId);
    try { canvas.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    if (touch && touch.mode === "pending" && ev.type === "pointerup") {
      // a tap behaves like a left click
      const down = touch.ev;
      app.input.dispatch("onPointerMove", down, ctxFor(down));
      app.input.dispatch("onPointerDown", down, ctxFor(down));
      app.input.dispatch("onPointerUp", ev, ctxFor(ev));
    }
    if (!touches.size) touch = null;
    else if (touch && touch.mode === "pinch") touch = { mode: "done" };
  }

  canvas.addEventListener("pointerdown", (ev) => {
    try { canvas.focus({ preventScroll: true }); } catch { canvas.focus(); }
    vp.menu.close();
    if (ev.pointerType === "touch") { ev.preventDefault(); touchDown(ev); return; }
    if (ev.button === 1) {
      ev.preventDefault();
      const { x, y } = posOf(ev);
      const now = performance.now();
      if (now - lastMMB.t < 380 && Math.hypot(x - lastMMB.x, y - lastMMB.y) < 8) {
        lastMMB.t = 0;
        fit({ animate: true });
        return;
      }
      lastMMB = { t: now, x, y };
      nav = { x: ev.clientX, y: ev.clientY, at: anchorAt(x, y), mode: ev.shiftKey ? "orbit" : "pan" };
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
      updateCursor();
      return;
    }
    if (ev.button === 0) {
      leftDown = true;
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
      app.input.dispatch("onPointerDown", ev, ctxFor(ev));
    }
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (ev.pointerType === "touch") { touchMove(ev); return; }
    if (nav) {
      const dx = ev.clientX - nav.x, dy = ev.clientY - nav.y;
      nav.x = ev.clientX; nav.y = ev.clientY;
      const mode = ev.shiftKey ? "orbit" : "pan";
      if (mode !== nav.mode) { nav.mode = mode; updateCursor(); }
      if (mode === "orbit") rig.orbitTurntable(dx, dy);
      else rig.pan(dx, dy, nav.at);
      requestRender();
      return;
    }
    app.input.dispatch("onPointerMove", ev, ctxFor(ev));
  });
  const endPointer = (ev) => {
    if (ev.pointerType === "touch") { touchUp(ev); return; }
    if (nav && ev.button === 1) {
      nav = null;
      try { canvas.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
      updateCursor();
      return;
    }
    if (nav && ev.type === "pointercancel") { nav = null; updateCursor(); return; }
    if (ev.button === 0 && leftDown) {
      leftDown = false;
      app.input.dispatch("onPointerUp", ev, ctxFor(ev));
      try { canvas.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    }
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerenter", () => { pointerInCanvas = true; });
  canvas.addEventListener("pointermove", () => { pointerInCanvas = true; }, { passive: true });
  canvas.addEventListener("pointerleave", () => {
    pointerInCanvas = false;
    if (!nav && !leftDown) app.selection.setHover(null);
    if (myStatus !== null && app.status === myStatus) refreshStatus();
  });
  canvas.addEventListener("auxclick", (ev) => { if (ev.button === 1) ev.preventDefault(); });
  canvas.addEventListener("mousedown", (ev) => { if (ev.button === 1) ev.preventDefault(); });
  canvas.addEventListener("dblclick", (ev) => { if (ev.button === 0) app.input.dispatch("onDoubleClick", ev, ctxFor(ev)); });
  canvas.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    const ctx = ctxFor(ev);
    if (!app.input.dispatch("onContextMenu", ev, ctx)) app.emit("canvas-contextmenu", { x: ctx.x, y: ctx.y, clientX: ev.clientX, clientY: ev.clientY, ctx });
  });

  // wheel: mouse wheel zooms to the cursor; trackpad pinch zooms, two-finger scroll pans,
  // Shift + two-finger scroll orbits.
  let lastTrackpad = 0;
  function classify(ev) {
    const now = performance.now();
    if (ev.deltaMode !== 0) return "mouse";
    const wd = ev.wheelDeltaY || ev.wheelDeltaX;
    let tp;
    if (typeof wd === "number" && wd !== 0) tp = !(Math.abs(wd) % 120 === 0 && (ev.deltaX === 0 || ev.deltaY === 0));
    else tp = !(Number.isInteger(ev.deltaY) && Math.abs(ev.deltaY) >= 50 && ev.deltaX === 0);
    if (!tp && now - lastTrackpad < 220 && Math.abs(ev.deltaY) < 50) tp = true;
    if (tp) lastTrackpad = now;
    return tp ? "trackpad" : "mouse";
  }
  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const { x, y } = posOf(ev);
    const { h } = size();
    const norm = (d) => (ev.deltaMode === 1 ? d * 33 : ev.deltaMode === 2 ? d * h : d);
    if (ev.ctrlKey) { // pinch-to-zoom (or Ctrl+wheel)
      const f = Math.exp(THREE.MathUtils.clamp(norm(ev.deltaY) * 0.01, -0.5, 0.5));
      rig.zoomAbout(anchorAt(x, y), f);
      requestRender();
      return;
    }
    const kind = classify(ev);
    if (kind === "trackpad") {
      if (ev.shiftKey) rig.orbitTurntable(norm(ev.deltaX), norm(ev.deltaY));
      else rig.pan(-norm(ev.deltaX), -norm(ev.deltaY), rig.target);
      requestRender();
      return;
    }
    const dy = norm(ev.deltaY || ev.deltaX);
    const f = Math.exp(THREE.MathUtils.clamp(dy * 0.0015, -0.6, 0.6));
    rig.zoomAbout(anchorAt(x, y), f);
    requestRender();
  }, { passive: false });

  // ---------- events ----------
  app.on("model", () => {
    if (app.mode === "sketch") syncGridPlane();
    bodies.rebuild();
    origin.rebuildCPlanes(bodies.bounds);
    boundsDirty = true;
    applyEffects();
    highlighter.update();
    requestRender();
  });
  // status text for canvas items: the selection ("Body1", "Edge", "2 Faces", "Extrude1"), or the
  // pre-highlighted item while nothing is selected. Kinds owned by other modules (profiles, sketch
  // entities) are left to them; a stale label of ours is cleared.
  let myStatus = null;
  function refreshStatus() {
    const sel = app.selection.items || [];
    let t = refStatus(app, sel);
    if (!sel.length && !app.activeCommand && pointerInCanvas) {
      // the pre-highlight is named only while the mouse is over the canvas: hovers driven from the
      // browser / timeline rows leave the status alone (they manage their own)
      const h = app.selection.hover;
      const ht = h ? refStatus(app, [h]) : "";
      if (ht) t = ht;
    }
    if (t === null) {
      if (myStatus !== null && app.status === myStatus) app.setStatus("");
      myStatus = null;
      return;
    }
    if (t === "" && (myStatus === null || app.status !== myStatus)) { myStatus = null; return; }
    myStatus = t;
    app.setStatus(t);
  }
  vp.refreshStatus = refreshStatus;
  app.on("doc", () => { origin.updateHighlight(); if (myStatus !== null && app.status === myStatus) refreshStatus(); requestRender(); });
  // component visibility / activation (fading) / display-only transforms change the drawing without re-evaluating
  app.on("components", (d) => { if (d && d.action === "display") bodies.applyDisplay(); else bodies.rebuild(); highlighter.update(); requestRender(); });
  const onSel = () => { highlighter.update(); origin.updateHighlight(); };
  app.on("hover", () => { onSel(); refreshStatus(); });
  app.on("selection", () => { onSel(); refreshStatus(); });
  // While sketching, the layout grid moves onto the active sketch plane (the sketch module
  // relies on this and reads gridSpacing()/gridSettings for snapping).
  let gridOverride = null; // explicit setGridPlane()
  function syncGridPlane() {
    if (gridOverride) { grid.setPlane(gridOverride); return; }
    if (app.mode === "sketch" && app.activeSketch) {
      const s = app.sketchState(app.activeSketch);
      const f = app.feature(app.activeSketch);
      const pl = (s && s.plane) || (f && f.plane && f.plane.n ? f.plane : null);
      grid.setPlane(pl || null);
    } else grid.setPlane(null);
  }
  vp.syncGridPlane = syncGridPlane;
  vp.setGridOverride = (pl) => { gridOverride = pl || null; syncGridPlane(); requestRender(); };
  app.on("mode", () => {
    syncGridPlane();
    boundsDirty = true;
    requestRender();
  });

  // Origin planes/axes forced visible: by setOriginVisible() (Create Sketch, dialogs whose
  // selection wants origin items) and, like Fusion (ref 18), while the Hole dialog is open.
  let originApiForced = false;
  const originDialogs = new Set();
  const ORIGIN_DIALOGS = new Set(["FusionHoleCommand"]);
  function syncOriginForced() {
    origin.forced = (originApiForced ? 1 : 0) + originDialogs.size;
    origin.updateHighlight();
    requestRender();
  }
  app.on("dialog", ({ open, id } = {}) => {
    if (!ORIGIN_DIALOGS.has(id)) return;
    if (open) originDialogs.add(id); else originDialogs.delete(id);
    syncOriginForced();
  });

  // ---------- widgets ----------
  const selectTool = new SelectionTool(vp);
  vp.selectTool = selectTool;
  navTools = new NavTools(vp);
  vp.navTools = navTools;
  vp.dialogs = new ViewDialogs(vp);
  vp.updateNavbarState = () => { if (navbar) navbar.update(); updateCursor(); };
  registerViewCommands(vp);
  if (app.dom.viewcubeHost) {
    viewCube = new ViewCube(vp, app.dom.viewcubeHost);
    viewCube.setVisible(prefs.showViewCube !== false);
  }
  if (app.dom.navbarHost) {
    navbar = new NavBar(vp, app.dom.navbarHost);
    navbar.setVisible(prefs.showNavBar !== false);
  }
  vp.viewCube = viewCube;
  vp.navbar = navbar;
  app.on("commands", () => navbar && navbar.update());

  // ---------- public API (contract) ----------
  app.viewport = {
    THREE, renderer, scene, canvas, groups, labelLayer,
    get camera() { return rig.camera; },
    get target() { return rig.target.toArray(); },
    requestRender, ray, rayPlane, toScreen, pixelSize,
    pick: (x, y, opts) => picker.pick(x, y, opts),
    pickAll: (x, y, opts) => picker.pickAll(x, y, opts),
    addPickProvider: (fn) => picker.addProvider(fn),
    lookAt, setView, fit,
    setPreview: (items) => preview.set(items),
    clearPreview: () => preview.set([]),
    setOriginVisible(v) { originApiForced = !!v; syncOriginForced(); },
    meshFor: (shape) => cache.meshFor(shape),
    // --- extensions (additive) ---
    rig,
    overlayScene,
    goHome,
    lookAtRef: (r) => vp.lookAtRef(r),
    planeForRef,
    getView: () => ({ target: rig.target.toArray(), quat: rig.quat.toArray(), dist: rig.dist, mode: rig.mode }),
    setViewState(s, opts = {}) {
      const st = { target: new V3(...s.target), quat: new THREE.Quaternion(...s.quat), dist: s.dist };
      return rig.animateTo(st, opts.animate === false ? 0 : 320);
    },
    get visualStyle() { return bodies.style; },
    setVisualStyle: (id) => vp.setVisualStyle(id),
    get cameraMode() { return rig.mode; },
    setCameraMode: (m) => vp.setCameraMode(m),
    objectVisibility,
    setObjectVisibility: (k, v) => vp.setObjectVisibility(k, v),
    get gridSettings() { return prefs.grid; },
    gridSpacing: () => grid.spacing(),
    setGridPlane: (pl) => vp.setGridOverride(pl),
    addWindowSelectProvider: (fn) => selectTool.addWindowProvider(fn),
    get selectionMode() { return selectTool.mode; },
    get selectionPriority() { return selectTool.priority; },
    anchorAt: (x, y) => anchorAt(x, y).toArray(),
    size,
    viewCube,
    navbar,
    menu: vp.menu,
    isAnimating: () => !!rig.anim,
    stats,
    _vp: vp,
  };
  app.ui.viewport = app.viewport;
  app.ui.viewCube = viewCube;
  app.ui.navBar = navbar;

  // ---------- start ----------
  bodies.setStyle(VISUAL_STYLES[prefs.visualStyle] ? prefs.visualStyle : DEFAULT_STYLE);
  applyEnvironment();
  resize();
  rig.setState(emptyState(defaultHomeQuat()));
  pristineState = { dist: rig.dist, quat: rig.quat.clone() };
  app.on("ready", () => {
    boundsDirty = true;
    updateSceneBounds();
    resize();
    if (contentSphere()) fit({ animate: false });
    else if (isPristine()) setPristine();
    requestRender();
  });
  bodies.rebuild();
  origin.rebuildCPlanes(bodies.bounds);
  requestAnimationFrame(frame);
}
