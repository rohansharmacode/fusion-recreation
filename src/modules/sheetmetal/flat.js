// sheetmetal: Create Flat Pattern, the FLAT PATTERN contextual environment, its display, the browser
// "Flat Pattern" node, Export Flat Pattern (DXF / STEP through app.download) and Finish Flat Pattern.
//
// doc.sheetMetal.flats[bodyId] = { face: {body, p, n} }   the stationary face picked for the flat pattern
// The flat solid is derived (geom.flatPattern) and cached per body shape; it is never stored.
import * as K from "../../kernel.js";
import * as G from "./geom.js";
import * as R from "./rules.js";
import { V, V2, apply, applyDir, inv } from "./math.js";
import { flangeAt } from "./features.js";
import { smData } from "./dialogs.js";

const ENV = "flatpattern";
const cache = new Map(); // bodyId -> {shape, key, fp}

/** Flat pattern of body id at the current result: {fp, body, d} or throws a user-facing error. */
export function flatOf(app, bodyId, faceRef = null) {
  const st = app.result && app.result.state;
  const b = st && st.bodies.get(bodyId);
  const d = st && st.smData instanceof Map ? st.smData.get(bodyId) : null;
  if (!b || !d) throw new Error("The flat pattern's sheet metal body is missing");
  if (d.kind === "loft") return loftFlat(app, bodyId, b, d);
  const ref = faceRef || (R.smDoc(app.doc).flats || {})[bodyId]?.face || null;
  const sid = (ref && flangeAt(b.shape, d, ref.p)) || d.root;
  const key = `${sid}|${JSON.stringify(d.frame)}`;
  const c = cache.get(bodyId);
  if (c && c.shape === b.shape && c.key === key) return { fp: c.fp, body: b, d };
  if (!G.seamsOpen(d, Object.keys(d.bends))) throw new Error("The body has closed loops of flanges. Use Rip to open them before creating a flat pattern");
  const fp = G.flatPattern(b.shape, d, sid);
  if (c && c.fp && c.fp.solid) K.del(c.fp.solid);
  cache.set(bodyId, { shape: b.shape, key, fp });
  return { fp, body: b, d };
}
function loftFlat(app, bodyId, b, d) {
  const c = cache.get(bodyId);
  if (c && c.shape === b.shape) return { fp: c.fp, body: b, d };
  const fp = d.flat; // computed by the lofted flange evaluator: {loops, lines, frame, w0, T}
  if (!fp) throw new Error("This lofted flange can't be flattened");
  const solid = G.flatPrism(fp.frame, fp.outer, d.w0, d.w0 + d.T);
  const out = { solid, frame: fp.frame, data: { w0: d.w0, T: d.T, frame: fp.frame, bends: {} }, lines: fp.lines };
  cache.set(bodyId, { shape: b.shape, key: "loft", fp: out });
  return { fp: out, body: b, d };
}

// ---------------------------------------------------------------- DXF
function dxfWriter() {
  const out = [];
  const w = (code, v) => { out.push(String(code), String(v)); };
  return {
    out, w,
    header(min, max) {
      w(0, "SECTION"); w(2, "HEADER");
      w(9, "$ACADVER"); w(1, "AC1009");
      w(9, "$INSUNITS"); w(70, 4);
      w(9, "$EXTMIN"); w(10, min[0]); w(20, min[1]); w(30, 0);
      w(9, "$EXTMAX"); w(10, max[0]); w(20, max[1]); w(30, 0);
      w(0, "ENDSEC");
    },
    tables(layers) {
      w(0, "SECTION"); w(2, "TABLES");
      w(0, "TABLE"); w(2, "LTYPE"); w(70, 2);
      w(0, "LTYPE"); w(2, "CONTINUOUS"); w(70, 0); w(3, "Solid line"); w(72, 65); w(73, 0); w(40, 0);
      w(0, "LTYPE"); w(2, "DASHED"); w(70, 0); w(3, "__ __ __"); w(72, 65); w(73, 2); w(40, 4.5); w(49, 3); w(49, -1.5);
      w(0, "ENDTAB");
      w(0, "TABLE"); w(2, "LAYER"); w(70, layers.length);
      for (const [name, color, lt] of layers) { w(0, "LAYER"); w(2, name); w(70, 0); w(62, color); w(6, lt); }
      w(0, "ENDTAB");
      w(0, "ENDSEC");
    },
    line(layer, a, b, lt) { w(0, "LINE"); w(8, layer); if (lt) w(6, lt); w(10, a[0]); w(20, a[1]); w(30, 0); w(11, b[0]); w(21, b[1]); w(31, 0); },
    circle(layer, c, r) { w(0, "CIRCLE"); w(8, layer); w(10, c[0]); w(20, c[1]); w(30, 0); w(40, r); },
    poly(layer, pts) {
      w(0, "POLYLINE"); w(8, layer); w(66, 1); w(10, 0); w(20, 0); w(30, 0); w(70, 1);
      for (const p of pts) { w(0, "VERTEX"); w(8, layer); w(10, p[0]); w(20, p[1]); w(30, 0); }
      w(0, "SEQEND"); w(8, layer);
    },
  };
}
const fx = (v) => Math.round(v * 1e6) / 1e6;
/** DXF text of a flat pattern (2D flat coordinates, millimetres or inches). */
export function flatDXF(fp, { centerLines = true, extentLines = true, units = "mm" } = {}) {
  const k = units === "in" ? 1 / 25.4 : 1;
  const loops = G.flatLoops(fp.solid, fp.data);
  const pts = loops.flatMap((l) => l.pts);
  const sc = (p) => [fx(p[0] * k), fx(p[1] * k)];
  const min = [Math.min(...pts.map((p) => p[0])) * k, Math.min(...pts.map((p) => p[1])) * k];
  const max = [Math.max(...pts.map((p) => p[0])) * k, Math.max(...pts.map((p) => p[1])) * k];
  const D = dxfWriter();
  D.header(min, max);
  D.tables([["OUTER_PROFILES", 7, "CONTINUOUS"], ["INTERIOR_PROFILES", 7, "CONTINUOUS"], ["BEND_CENTER_LINES_UP", 5, "DASHED"], ["BEND_CENTER_LINES_DOWN", 1, "DASHED"], ["BEND_EXTENT_LINES", 8, "CONTINUOUS"]]);
  D.w(0, "SECTION"); D.w(2, "ENTITIES");
  for (const l of loops) {
    const layer = l.outer ? "OUTER_PROFILES" : "INTERIOR_PROFILES";
    if (l.circle) D.circle(layer, sc(l.circle.c), fx(l.circle.r * k));
    else D.poly(layer, l.pts.map(sc));
  }
  for (const ln of fp.lines || []) {
    if (ln.kind === "center" && centerLines) D.line(ln.up ? "BEND_CENTER_LINES_UP" : "BEND_CENTER_LINES_DOWN", sc(ln.a), sc(ln.b), "DASHED");
    if (ln.kind === "extent" && extentLines) D.line("BEND_EXTENT_LINES", sc(ln.a), sc(ln.b));
  }
  D.w(0, "ENDSEC"); D.w(0, "EOF");
  return D.out.join("\n") + "\n";
}

// ---------------------------------------------------------------- environment + display
export function createFlatEnv(app) {
  let active = null; // {bodyId, group, off:[]}
  const THREE = () => app.viewport && app.viewport.THREE;

  function clearDisplay() {
    if (!active || !active.group) return;
    const g = active.group;
    g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    if (g.parent) g.parent.remove(g);
    active.group = null;
  }
  function display() {
    const T = THREE();
    if (!active || !T) return;
    clearDisplay();
    let res;
    try { res = flatOf(app, active.bodyId); } catch (e) { app.toast(e.message || String(e), "error", 4000); exit("error"); return; }
    const { fp, d } = res;
    const md = K.meshBody(fp.solid, 200);
    const group = new T.Group();
    group.name = "sm-flat-pattern";
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(md.vertices, 3));
    geo.setAttribute("normal", new T.BufferAttribute(md.normals, 3));
    geo.setIndex(new T.BufferAttribute(md.triangles, 1));
    const meta = app.bodyMeta(active.bodyId) || {};
    const ap = (app.appearances || {})[meta.appearance] || null;
    const color = ap && ap.color ? ap.color : "#b9c2cb";
    group.add(new T.Mesh(geo, new T.MeshStandardMaterial({ color, metalness: 0.15, roughness: 0.55, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })));
    const eg = new T.BufferGeometry();
    eg.setAttribute("position", new T.BufferAttribute(md.lines, 3));
    group.add(new T.LineSegments(eg, new T.LineBasicMaterial({ color: 0x202020 })));
    // bend lines on the top face (Fusion: dashed centre lines, thin extent lines)
    const fd = fp.data;
    const top = (p) => apply(fd.frame, [p[0], p[1], fd.w0 + fd.T + 0.01]);
    const seg = (kind, up) => fp.lines.filter((l) => l.kind === kind && (up === undefined || !!l.up === up)).flatMap((l) => [...top(l.a), ...top(l.b)]);
    const addLines = (arr, mat) => {
      if (!arr.length) return;
      const g2 = new T.BufferGeometry();
      g2.setAttribute("position", new T.BufferAttribute(new Float32Array(arr), 3));
      const ls = new T.LineSegments(g2, mat);
      if (mat.isLineDashedMaterial) ls.computeLineDistances();
      group.add(ls);
    };
    addLines(seg("center", true), new T.LineDashedMaterial({ color: 0x1f6fd1, dashSize: 2, gapSize: 1.2 }));
    addLines(seg("center", false), new T.LineDashedMaterial({ color: 0xd1372c, dashSize: 2, gapSize: 1.2 }));
    addLines(seg("extent"), new T.LineBasicMaterial({ color: 0x7d8790 }));
    app.viewport.scene.add(group);
    active.group = group;
    active.fp = fp;
    app.viewport.requestRender();
    app.setStatus(`Flat Pattern | ${Object.keys(d.bends || {}).length} Bends`);
  }
  function setBodiesHidden(on) {
    const g = app.viewport && app.viewport.groups && app.viewport.groups.bodies;
    if (g) g.visible = !on;
    if (app.viewport) app.viewport.requestRender();
  }
  function enter(bodyId, { look = true } = {}) {
    let res;
    try { res = flatOf(app, bodyId); } catch (e) { app.toast(e.message || String(e), "error", 4000); return false; }
    if (active) exit("replaced");
    active = { bodyId, group: null, off: [] };
    app.enterEnvironment({
      id: ENV, mode: ENV, label: "FLAT PATTERN", tab: "FlatPatternSolidTab",
      finishCommand: "FusionSheetMetalExitFlatPatternCmd",
      markingMenu: "FusionSheetMetalEnvironment",
      shortcuts: ["ExportFlatPatternCmd", "MeasureCommand"],
      onExit: (reason) => { if (active && active.bodyId === bodyId) teardown(); },
    });
    setBodiesHidden(true);
    active.prevFilter = app.selection.filter;
    app.selection.clear && app.selection.clear();
    active.off.push(app.on("model", (e) => { if (!e || !e.preview) { if (active) { if (!(app.result.state.smData instanceof Map) || !app.result.state.smData.get(bodyId)) exit("missing"); else display(); } } }));
    display();
    if (look && res.fp && app.viewport.lookAt) {
      const fd = res.fp.data;
      const o = apply(fd.frame, [0, 0, fd.w0 + fd.T]);
      const x = V.norm(applyDir(fd.frame, [1, 0, 0])), n = V.norm(applyDir(fd.frame, [0, 0, 1]));
      try { const pr = app.viewport.lookAt({ o, x, n }, { animate: false }); if (pr && pr.then) pr.then(() => app.viewport.fit && app.viewport.fit({ animate: false })); } catch { /* ignore */ }
    }
    app.emit("layout", {});
    if (app.ui.browser && app.ui.browser.invalidate) app.ui.browser.invalidate();
    return true;
  }
  function teardown() {
    if (!active) return;
    for (const off of active.off) { try { off(); } catch { /* ignore */ } }
    clearDisplay();
    setBodiesHidden(false);
    app.setStatus("");
    active = null;
    if (app.ui.browser && app.ui.browser.invalidate) app.ui.browser.invalidate();
  }
  function exit(reason = "finish") {
    if (!active) return;
    app.exitEnvironment(ENV, { reason });
    teardown();
  }
  return { enter, exit, get active() { return active; }, display };
}

// ---------------------------------------------------------------- Create Flat Pattern (click a face)
export function pickStationaryFace(app, onPick) {
  const vp = app.viewport;
  const ll = vp && vp.labelLayer;
  const prompt = document.createElement("div");
  prompt.className = "dlg-prompt";
  prompt.textContent = "Select Stationary face to create Flat Pattern";
  prompt.style.display = "none";
  if (ll) ll.appendChild(prompt);
  const prevFilter = app.selection.filter;
  const accept = (r) => {
    if (!r || r.kind !== "face" || r.planar === false) return false;
    const st = app.result && app.result.state;
    return !!(st && st.smData instanceof Map && st.smData.get(r.body));
  };
  app.selection.filter = accept;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    app.selection.filter = prevFilter;
    prompt.remove();
    off();
    offStart();
  };
  const off = app.input.push({
    onPointerMove(ev, ctx) { prompt.style.display = ""; prompt.style.left = `${Math.round(ctx.x + 6)}px`; prompt.style.top = `${Math.round(ctx.y + 26)}px`; return false; },
    onPointerDown(ev, ctx) {
      if (ctx.button !== 0) return false;
      const h = ctx.hit;
      if (h && h.ref && accept(h.ref)) { const ref = h.ref; finish(); onPick(ref); return true; }
      return true;
    },
    onCancel() { finish(); return true; },
  });
  const offStart = app.on("command-start", () => finish());
  return finish;
}

export { smData };
