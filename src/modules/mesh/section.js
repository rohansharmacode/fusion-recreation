// Create Mesh Section Sketch (ParaMeshPlanarSectionCommand): a new sketch on the (moved / tilted) section plane
// holding the section polylines of a mesh body (fixed lines flagged meshSection). Fit Curves to Mesh Section
// (FitCurvesToSectionCommand, sketch CREATE menu): fits a line, arc, circle, spline or closed spline to such a
// section chain (optionally only between two points of it) and adds the curve to the active sketch.
import * as A from "./algo.js";
import { planeRefFromRef } from "../dialogs/util.js";
import { movedPlane } from "./features.js";
import { meshEntryOf, workFor } from "./palette.js";

// ------------------------------------------------------------------ overlay lines (dialog previews)
function overlay(app) {
  const vp = app.viewport;
  if (!vp || !vp.THREE) return null;
  let g = vp.groups.overlay.getObjectByName("msh-section");
  if (!g) { g = new vp.THREE.Group(); g.name = "msh-section"; vp.groups.overlay.add(g); }
  return g;
}
function clearOverlay(app) {
  const g = overlay(app);
  if (!g) return;
  for (const c of [...g.children]) { g.remove(c); c.geometry.dispose(); c.material.dispose(); }
  app.viewport.requestRender();
}
function drawPolylines(app, polys, color = 0xd0021b) {
  clearOverlay(app);
  const g = overlay(app);
  if (!g) return;
  const THREE = app.viewport.THREE;
  for (const { pts, closed } of polys) {
    if (pts.length < 2) continue;
    const arr = [];
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; arr.push(...a, ...b); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(arr), 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, depthTest: false })));
  }
  app.viewport.requestRender();
}

// ------------------------------------------------------------------ section sketch
function sectionOf(app, dlg) {
  const v = dlg.values;
  const body = ((v.body || [])[0] || {}).body;
  const pr = planeRefFromRef((v.plane || [])[0]);
  if (!body || !pr) return null;
  const e = meshEntryOf(app, body, dlg.baseState);
  if (!e) return null;
  const n = (k) => { const x = dlg.num(k); return Number.isFinite(x) ? x : 0; };
  const pl = movedPlane(dlg.baseState, pr, n("offset"), n("ax"), n("ay"));
  const W = workFor(e.mesh);
  const size = A.bbox(W).size || 1;
  const polys = A.section(W, pl).map((p) => ({ pts: A.simplify(p.pts, size * 0.0008, p.closed), closed: p.closed })).filter((p) => p.pts.length >= 2);
  return { body, pr, pl, polys, transformed: !!(n("offset") || n("ax") || n("ay")) };
}
export function openSectionSketch(app, opts = {}) {
  if (!app.ui.dialog) return null;
  if (app.mode === "sketch") { const stop = app.commands.get("SketchStop"); if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model"); }
  const isMesh = (dlg, id) => { const e = dlg.baseState.meshBodies && dlg.baseState.meshBodies.get(id); return !!(e && e.mesh && (!e.kind || e.kind === "mesh")); };
  let last = null;
  const redraw = (d) => {
    try { last = sectionOf(app, d); } catch { last = null; }
    if (last) drawPolylines(app, last.polys); else clearOverlay(app);
    if (last && !last.polys.length) d.message("The plane does not cross the mesh body", "warning");
  };
  return app.ui.dialog.open({
    id: "ParaMeshPlanarSectionCommand", title: "Create Mesh Section Sketch", icon: "ParaMeshPlanarSectionCommand",
    help: "Creates a sketch that contains a section line where a plane intersects a mesh body.",
    preview: false, noFeature: true,
    preselect: (opts.preselect || app.selection.items || []).filter((r) => r.kind === "body"),
    rows: [
      { id: "body", type: "selection", label: "Body", kinds: ["body"], meshBodies: true, max: 1, prompt: "Select mesh body", filter: (ref, d) => isMesh(d, ref.body) },
      { id: "plane", type: "selection", label: "Section Plane", kinds: ["originPlane", "cplane", "face"], planar: true, max: 1, prompt: "Select section plane" },
      { id: "offset", type: "value", label: "Distance", kind: "length", default: "0.00 mm", sep: true },
      { id: "ax", type: "value", label: "X Angle", kind: "angle", default: "0.0 deg" },
      { id: "ay", type: "value", label: "Y Angle", kind: "angle", default: "0.0 deg" },
    ],
    build: () => null,
    onOpen: (d) => redraw(d),
    onChange: (id, d) => redraw(d),
    prompt: (d) => (!(d.values.body || []).length ? "Select mesh body" : !(d.values.plane || []).length ? "Select section plane" : "Adjust distance and angles to orient section plane"),
    commit(f, d) {
      const s = sectionOf(app, d);
      if (!s) throw new Error("Select a mesh body and a section plane");
      if (!s.polys.length) throw new Error("The plane does not cross the mesh body");
      const plane = { o: s.pl.o, n: s.pl.n, x: A.norm(A.sub(s.pl.x, A.mul(s.pl.n, A.dot(s.pl.x, s.pl.n)))) };
      const y = A.cross(plane.n, plane.x);
      const sk = app.S.newSketch();
      for (const p of s.polys) {
        const ids = p.pts.map((q) => { const r = A.sub(q, plane.o); return app.S.addPoint(sk, A.dot(r, plane.x), A.dot(r, y), { fixed: true }); });
        const nseg = p.closed ? ids.length : ids.length - 1;
        for (let i = 0; i < nseg; i++) { const id = app.S.addLine(sk, ids[i], ids[(i + 1) % ids.length]); sk.curves[id].meshSection = true; }
      }
      const planeRef = !s.transformed && s.pr.kind === "origin" ? s.pr : !s.transformed && s.pr.kind === "cplane" ? s.pr : { kind: "plane", plane };
      return app.addFeature({ type: "sketch", plane, planeRef, sk, visible: true, meshSection: s.body }, "Create Mesh Section Sketch");
    },
    onClose: () => clearOverlay(app),
  });
}

// ------------------------------------------------------------------ fit curves
function circleFit(P) {
  // Kasa: x^2 + y^2 + D x + E y + F = 0 (least squares)
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0;
  const n = P.length;
  for (const [x, y] of P) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z; }
  const r = A.solve3([[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], [-sxz, -syz, -sz]);
  if (!r) return null;
  const c = [-r[0] / 2, -r[1] / 2];
  const rad = Math.sqrt(Math.max(0, c[0] * c[0] + c[1] * c[1] - r[2]));
  return rad > 0 ? { c, r: rad } : null;
}
function lineFit(P) {
  const n = P.length;
  const m = P.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
  let a = 0, b = 0, c = 0;
  for (const p of P) { const x = p[0] - m[0], y = p[1] - m[1]; a += x * x; b += x * y; c += y * y; }
  const th = 0.5 * Math.atan2(2 * b, a - c);
  return { m, d: [Math.cos(th), Math.sin(th)] };
}
/** Ordered 2D points of a section chain (sketch point ids too). */
function chainPoints(sk, S, curveId) {
  const ch = S.chainOf(sk, curveId, { linesArcs: true });
  const ord = S.orderChain(sk, ch.ids);
  if (!ord) return null;
  const ids = [ord.segs[0].from, ...ord.segs.map((s) => s.to)];
  if (ord.closed) ids.pop();
  return { ids, pts: ids.map((id) => [sk.points[id].x, sk.points[id].y]), closed: ord.closed };
}
function subPath(ch, p1, p2, longPath) {
  if (!p1 || !p2) return ch.pts;
  let i = ch.ids.indexOf(p1), j = ch.ids.indexOf(p2);
  if (i < 0 || j < 0 || i === j) return ch.pts;
  if (!ch.closed) { if (i > j) [i, j] = [j, i]; return ch.pts.slice(i, j + 1); }
  const n = ch.ids.length;
  const fwd = [];
  for (let k = i; ; k = (k + 1) % n) { fwd.push(ch.pts[k]); if (k === j) break; }
  const back = [];
  for (let k = i; ; k = (k - 1 + n) % n) { back.push(ch.pts[k]); if (k === j) break; }
  const short = fwd.length <= back.length ? fwd : back, long = fwd.length <= back.length ? back : fwd;
  return longPath ? long : short;
}
/** Fit: {kind, ...geometry, dev (max deviation)} in sketch coordinates. */
export function fitCurve(pts, type, tol) {
  if (pts.length < 2) throw new Error("Select section geometry to fit");
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (type === "line") {
    const { m, d } = lineFit(pts);
    const t0 = (pts[0][0] - m[0]) * d[0] + (pts[0][1] - m[1]) * d[1], t1 = (pts[pts.length - 1][0] - m[0]) * d[0] + (pts[pts.length - 1][1] - m[1]) * d[1];
    let dev = 0;
    for (const p of pts) dev = Math.max(dev, Math.abs((p[0] - m[0]) * -d[1] + (p[1] - m[1]) * d[0]));
    return { kind: "line", a: [m[0] + d[0] * t0, m[1] + d[1] * t0], b: [m[0] + d[0] * t1, m[1] + d[1] * t1], dev };
  }
  if (type === "arc" || type === "circle") {
    if (pts.length < 3) throw new Error("At least three section points are needed");
    const c = circleFit(pts);
    if (!c) throw new Error("The section points do not define a circle");
    let dev = 0;
    for (const p of pts) dev = Math.max(dev, Math.abs(d2(p, c.c) - c.r));
    if (type === "circle") return { kind: "circle", c: c.c, r: c.r, dev };
    const ang = (p) => Math.atan2(p[1] - c.c[1], p[0] - c.c[0]);
    const a0 = ang(pts[0]), a1 = ang(pts[pts.length - 1]), am = ang(pts[Math.floor(pts.length / 2)]);
    const ccw = (from, to, x) => { const s = (to - from + 4 * Math.PI) % (2 * Math.PI), t = (x - from + 4 * Math.PI) % (2 * Math.PI); return t <= s; };
    const on = (a) => [c.c[0] + c.r * Math.cos(a), c.c[1] + c.r * Math.sin(a)];
    return { kind: "arc", c: c.c, r: c.r, p1: on(a0), p2: on(a1), ccw: ccw(a0, a1, am), dev };
  }
  // splines: fit points from a simplified chain
  const closed = type === "closedSpline";
  const P3 = pts.map((p) => [p[0], p[1], 0]);
  const keep = A.simplify(P3, Math.max(tol, 1e-6), closed).map((p) => [p[0], p[1]]);
  if (keep.length < (closed ? 3 : 2)) throw new Error("Not enough section points for a spline");
  let dev = 0;
  for (const p of pts) { let m = Infinity; for (let i = 0; i + 1 < keep.length; i++) { const a = keep[i], b = keep[i + 1]; const ab = [b[0] - a[0], b[1] - a[1]]; const L = ab[0] * ab[0] + ab[1] * ab[1] || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / L)); m = Math.min(m, d2(p, [a[0] + ab[0] * t, a[1] + ab[1] * t])); } dev = Math.max(dev, m); }
  return { kind: "spline", pts: keep, closed, dev };
}
function addFitted(S, sk, g) {
  const P = (q) => S.addPoint(sk, q[0], q[1]);
  if (g.kind === "line") return S.addLine(sk, P(g.a), P(g.b));
  if (g.kind === "circle") return S.addCircle(sk, P(g.c), g.r);
  if (g.kind === "arc") return S.addArcDir(sk, P(g.c), P(g.p1), P(g.p2), g.ccw);
  return S.addSpline(sk, g.pts.map(P), { closed: g.closed });
}
function samples(g) {
  if (g.kind === "line") return [g.a, g.b];
  if (g.kind === "circle") return Array.from({ length: 65 }, (_, i) => [g.c[0] + g.r * Math.cos((i / 64) * 2 * Math.PI), g.c[1] + g.r * Math.sin((i / 64) * 2 * Math.PI)]);
  if (g.kind === "arc") {
    const a0 = Math.atan2(g.p1[1] - g.c[1], g.p1[0] - g.c[0]);
    let a1 = Math.atan2(g.p2[1] - g.c[1], g.p2[0] - g.c[0]);
    if (g.ccw) { while (a1 <= a0) a1 += 2 * Math.PI; } else { while (a1 >= a0) a1 -= 2 * Math.PI; }
    return Array.from({ length: 49 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / 48; return [g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)]; });
  }
  return g.closed ? [...g.pts, g.pts[0]] : g.pts;
}
export function openFitCurves(app) {
  if (!app.ui.dialog) return null;
  if (app.mode !== "sketch" || !app.activeSketch) { app.toast("Select mesh section or planar object to start sketch", "info", 3500); return null; }
  const sid = app.activeSketch;
  const skOf = () => { const s = app.sketchState(sid); return s ? s.sk : (app.feature(sid) || {}).sk; };
  const isSec = (r) => r && r.sketch === sid && (skOf() || { curves: {} }).curves[r.curve] && skOf().curves[r.curve].meshSection;
  let fit = null;
  const compute = (d) => {
    fit = null;
    const sk = skOf();
    const c = (d.values.section || [])[0];
    if (!sk || !c) { clearOverlay(app); return null; }
    const ch = chainPoints(sk, app.S, c.curve);
    if (!ch) return null;
    const p1 = ((d.values.pt1 || [])[0] || {}).point, p2 = ((d.values.pt2 || [])[0] || {}).point;
    const pts = subPath(ch, p1, p2, d.values.pathDir === "long");
    const tol = Number.isFinite(d.num("tol")) ? d.num("tol") : 0.1;
    try { fit = fitCurve(pts, d.values.geomType, tol); } catch (e) { d.message(e.message, "error"); clearOverlay(app); return null; }
    const s = app.sketchState(sid);
    if (s) {
      const pl = s.plane, y = A.cross(pl.n, pl.x);
      const w = (q) => A.add(pl.o, A.add(A.mul(pl.x, q[0]), A.mul(y, q[1])));
      drawPolylines(app, [{ pts: samples(fit).map(w), closed: false }], 0x1f86e0);
    }
    d.refresh();
    return fit;
  };
  return app.ui.dialog.open({
    id: "FitCurvesToSectionCommand", title: "Fit Curves to Mesh Section", icon: "FitCurvesToSectionCommand",
    help: "Fits sketch curves to a mesh section: select the section, the curve type and optionally two points on it.",
    preview: false, noFeature: true, labelWidth: 150,
    rows: [
      { id: "section", type: "selection", label: "Section", kinds: ["sketchCurve"], max: 1, prompt: "Select section geometry to fit", filter: (r) => isSec(r) },
      { id: "geomType", type: "dropdown", label: "Fit Curve Type", default: "line", options: [["line", "Line"], ["arc", "Arc"], ["circle", "Circle"], ["spline", "Spline"], ["closedSpline", "Closed Spline"]].map(([value, label]) => ({ value, label })) },
      { id: "pt1", type: "selection", label: "First Point on Section", kinds: ["sketchPoint"], max: 1, min: 0, prompt: "Select first point on section", filter: (r) => r.sketch === sid },
      { id: "pt2", type: "selection", label: "Second Point on Section", kinds: ["sketchPoint"], max: 1, min: 0, prompt: "Select second point on section", filter: (r) => r.sketch === sid },
      { id: "pathDir", type: "dropdown", label: "Path Direction", default: "short", options: [{ value: "short", label: "Short Path" }, { value: "long", label: "Long Path" }] },
      { id: "tol", type: "value", label: "Spline Fit Tolerance", kind: "length", default: "0.10 mm", positive: true, visible: (v) => v.geomType === "spline" || v.geomType === "closedSpline" },
      { id: "dev", type: "text", label: "Max Curve Deviation", text: () => (fit ? `${fit.dev.toFixed(3)} mm` : "") },
    ],
    build: () => null,
    onChange: (id, d) => { if (id !== "dev") compute(d); },
    commit(f, d) {
      const g = compute(d);
      if (!g) throw new Error("Select section geometry to fit");
      return app.mutate("Fit Curves to Mesh Section", (doc) => {
        const sf = doc.features.find((x) => x.id === sid);
        if (!sf || sf.type !== "sketch") throw new Error("Sketch not found");
        return addFitted(app.S, sf.sk, g);
      });
    },
    onClose: () => clearOverlay(app),
  });
}
