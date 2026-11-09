// The sketch environment: Create Sketch (plane pick), Edit Sketch, Finish Sketch, and the
// edit handler used while no tool is active (click / window select, drag through the solver, Delete).
import * as THREE from "three";
import { ST, vp, emitLocal, planeFromRef, activeData, sketchData, isSketchRef, mutateSketch, params, rayHitPlane, cursorOnPlane, projector, refKey } from "./ctx.js";
import { endTool } from "./tools.js";
import * as render from "./render.js";
import * as HUD from "./hud.js";
import { showPalette, hidePalette } from "./palette.js";
import { editDimension } from "./dimension.js";
import { pickablePoints, curveVisible } from "./pick.js";

// ---------------------------------------------------------------------------
// Create Sketch: pick a plane or planar face
// ---------------------------------------------------------------------------
let PP = null; // active plane pick
const planeFilter = (r) => !!r && (r.kind === "originPlane" || r.kind === "cplane" || (r.kind === "face" && r.planar !== false));

function viewDir() {
  const v = vp();
  const t = new THREE.Vector3(...v.target);
  return t.sub(v.camera.position).normalize().toArray();
}

export function planePickActive() { return !!PP; }

export function startCreateSketch(then = null) {
  const A = ST.app;
  cancelPlanePick();
  if (A.mode === "sketch") finishSketch();
  const items = A.selection.items;
  if (items.length === 1 && planeFilter(items[0])) {
    const pr = planeFromRef(items[0], viewDir());
    if (pr) { A.selection.clear(); createSketchOn(pr, then); return; }
  }
  try { A.viewport.setOriginVisible(true); } catch { /* optional */ }
  const fallback = makeFallbackPlanes();
  const prevFilter = A.selection.filter;
  A.selection.filter = planeFilter;
  const handler = {
    name: "sketch-planepick",
    cursor: "default",
    onPointerMove(ev, ctx) {
      HUD.promptMove(ctx.x, ctx.y);
      const h = pickPlane(ctx.x, ctx.y, ctx.ray);
      A.selection.setHover(h ? h.ref : null);
      if (PP && PP.fallback) PP.fallback.highlight(h && h.fallback ? h.ref.name : null);
      return true;
    },
    onPointerDown(ev, ctx) {
      if (ctx.button !== 0) return false;
      const h = pickPlane(ctx.x, ctx.y, ctx.ray);
      if (!h) return true;
      const pr = planeFromRef(h.ref, ctx.ray.d);
      if (!pr) { A.toast("Select a plane or planar face", "warning", 1800); return true; }
      const th = PP && PP.then;
      cancelPlanePick();
      createSketchOn(pr, th);
      return true;
    },
    onPointerUp() { return true; },
    onDoubleClick() { return true; },
    onCancel() { cancelPlanePick(); return true; },
  };
  const pop = A.input.push(handler);
  const offSel = A.on("selection", ({ items: it }) => {
    if (!PP || !it || it.length !== 1 || !planeFilter(it[0])) return;
    const pr = planeFromRef(it[0], viewDir());
    if (!pr) return;
    const th = PP.then;
    cancelPlanePick();
    A.selection.clear();
    createSketchOn(pr, th);
  });
  PP = { pop, prevFilter, offSel, then, fallback };
  HUD.promptShow("Select a plane or planar face");
  emitLocal("planepick", { active: true });
}

export function cancelPlanePick() {
  if (!PP) return;
  const A = ST.app;
  const p = PP;
  PP = null;
  p.pop();
  p.offSel();
  A.selection.filter = p.prevFilter || null;
  A.selection.setHover(null);
  if (p.fallback) p.fallback.dispose();
  try { A.viewport.setOriginVisible(false); } catch { /* optional */ }
  HUD.promptHide();
  emitLocal("planepick", { active: false });
}

function pickPlane(x, y, ray) {
  const v = vp();
  const h = v.pick(x, y, { filter: planeFilter });
  if (h) return h;
  if (PP && PP.fallback) return PP.fallback.pick(ray || v.ray(x, y));
  return null;
}

/** Origin planes drawn by this module when the viewport does not show its own. */
function makeFallbackPlanes() {
  const v = vp();
  let has = false;
  try { v.groups.origin.traverse((o) => { if (o.isMesh && o.visible !== false) has = true; }); } catch { /* ignore */ }
  if (has) return null;
  const K = ST.app.K;
  const t = new THREE.Vector3(...v.target);
  const dist = v.camera.position.distanceTo(t);
  const S = Math.max(20, dist * 0.18);
  const grp = new THREE.Group();
  grp.name = "sketch-fallback-origin-planes";
  const mats = {};
  const planes = {};
  for (const name of ["XY", "XZ", "YZ"]) {
    const pl = K.ORIGIN_PLANES[name];
    const geo = new THREE.PlaneGeometry(S, S);
    geo.translate(S / 2, S / 2, 0);
    const mat = new THREE.MeshBasicMaterial({ color: "#f4a640", transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    const y = K.planeY(pl);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.makeBasis(new THREE.Vector3(...pl.x), new THREE.Vector3(...y), new THREE.Vector3(...pl.n));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: "#c47a17" }));
    mesh.add(edge);
    grp.add(mesh);
    mats[name] = mat;
    planes[name] = pl;
  }
  v.groups.overlay.add(grp);
  v.requestRender();
  return {
    pick(ray) {
      let best = null;
      for (const name of Object.keys(planes)) {
        const h = rayHitPlane(ray, planes[name]);
        if (!h || h.t <= 0) continue;
        if (h.uv[0] < 0 || h.uv[1] < 0 || h.uv[0] > S || h.uv[1] > S) continue;
        if (!best || h.t < best.depth) best = { ref: { kind: "originPlane", name }, point: h.world, depth: h.t, screenDist: 0, type: "area", fallback: true };
      }
      return best;
    },
    highlight(name) {
      for (const [n, m] of Object.entries(mats)) { m.color.set(n === name ? "#7cc0f5" : "#f4a640"); m.opacity = n === name ? 0.45 : 0.28; }
      v.requestRender();
    },
    dispose() {
      v.groups.overlay.remove(grp);
      grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      v.requestRender();
    },
  };
}

export function createSketchOn(pr, then = null) {
  const A = ST.app;
  const f = A.addFeature({ type: "sketch", plane: pr.plane, planeRef: pr.planeRef, sk: A.S.newSketch(), visible: true }, "Create Sketch");
  enterSketch(f.id, { isNew: true });
  if (typeof then === "function") { try { then(); } catch (e) { console.error(e); } }
  return f.id;
}

// ---------------------------------------------------------------------------
// enter / finish
// ---------------------------------------------------------------------------
export function enterSketch(id, opts = {}) {
  const A = ST.app;
  const f = A.feature(id);
  if (!f || f.type !== "sketch") return false;
  if (A.mode === "sketch" && ST.sketchId === id) return true;
  if (A.mode === "sketch") finishSketch();
  cancelPlanePick();
  const idx = A.featureIndex(id);
  const session = { sketchId: id, savedMarker: A.doc.marker, rolled: false, undoDepth: A.history.undoStack.length, isNew: !!opts.isNew };
  if (A.doc.marker !== idx + 1) {
    session.rolled = true;
    A.doc.marker = idx + 1;
    A.emit("doc", { label: "Edit Sketch" });
    A.recompute();
  }
  ST.sketchId = id;
  ST.session = session;
  // remember the view: Finish Sketch animates back to it (a restore still in flight counts as the view)
  session.view = savedView();
  session.pop = A.input.push(editHandler);
  A.selection.set(A.selection.items.filter((r) => r.kind === "profile"));
  A.setMode("sketch", id);
  showPalette();
  render.rebuild();
  if (ST.opts.autoLookAt) lookAtSketch(true);
  emitLocal("enter", { id });
  return true;
}

export function finishSketch() {
  const A = ST.app;
  if (A.mode !== "sketch" && !ST.session) return;
  endTool();
  HUD.hudHide();
  const s = ST.session;
  if (s && s.pop) s.pop();
  hidePalette();
  A.selection.set(A.selection.items.filter((r) => !isSketchRef(r, null)));
  let recompute = false;
  if (s && s.rolled && A.feature(s.sketchId)) {
    const rolledMarker = A.doc.marker;
    const target = Math.min(A.doc.features.length, s.savedMarker);
    if (target !== rolledMarker) {
      A.doc.marker = target;
      const n = A.doc.features.length;
      for (const e of A.history.undoStack.slice(s.undoDepth)) if (e.doc && e.doc.marker === rolledMarker && e.doc.features.length === n) e.doc.marker = target;
      for (const e of A.history.redoStack) if (e.doc && e.doc.marker === rolledMarker && e.doc.features.length === n) e.doc.marker = target;
      A.emit("doc", { label: "Finish Sketch" });
      recompute = true;
    }
  }
  ST.sketchId = null;
  ST.session = null;
  ST.live = null;
  ST.dimAt = {};
  A.setMode("model");
  if (recompute) A.recompute();
  else render.rebuild();
  render.applySlice();
  restoreView(s && s.view);
  emitLocal("finish", {});
}

// ---------- camera: back to the view from before the sketch ----------
let RESTORE = null; // {view, t} while a restore animation may still be running
function savedView() {
  const v = vp();
  if (!v || typeof v.getView !== "function") return null;
  if (RESTORE && performance.now() - RESTORE.t < 1500 && typeof v.isAnimating === "function" && v.isAnimating()) return RESTORE.view;
  try { return v.getView(); } catch { return null; }
}
function restoreView(view) {
  const v = vp();
  if (!view || !v || typeof v.setViewState !== "function" || !ST.opts.autoLookAt) return;
  RESTORE = { view, t: performance.now() };
  try { v.setViewState(view, { animate: true }); } catch (e) { console.error(e); }
}

/** Leave sketch mode after the sketch disappeared (undo / new document). */
function dropSession(restore = true) {
  const A = ST.app;
  endTool();
  HUD.hudHide();
  if (ST.session && ST.session.pop) ST.session.pop();
  hidePalette();
  const view = ST.session && ST.session.view;
  ST.sketchId = null;
  ST.session = null;
  ST.live = null;
  A.setMode("model");
  render.applySlice();
  if (restore) restoreView(view);
}

export function lookAtSketch(animate = true) {
  const d = activeData();
  const f = ST.sketchId && ST.app.feature(ST.sketchId);
  const pl = (d && d.plane) || (f && f.plane);
  if (!pl) return;
  const v = vp();
  const K = ST.app.K;
  // keep the view centred: target projected onto the sketch plane (face sketches: the picked point)
  let o;
  if (f && f.planeRef && f.planeRef.kind === "face" && f.planeRef.p && (!d || !Object.keys(d.sk.curves).length)) o = f.planeRef.p;
  else {
    const t = v.target;
    const off = K.V.dot(K.V.sub(t, pl.o), pl.n);
    o = K.V.sub(t, K.V.mul(pl.n, off));
  }
  try { return v.lookAt({ o, x: pl.x, n: pl.n }, { animate }); } catch (e) { console.error(e); }
}

// ---------------------------------------------------------------------------
// edit handler (sketch mode, no tool)
// ---------------------------------------------------------------------------
function movable(d, ref) {
  const sk = d.sk;
  const st = d.status || {};
  const fixed = ST.app.S.fixedPointSet(sk);
  if (ref.kind === "sketchPoint") {
    const p = sk.points[ref.point];
    if (!p || p.fixed || fixed.has(ref.point)) return false;
    return !st.ptFree || st.ptFree[ref.point] !== false;
  }
  if (ref.kind === "sketchCurve") {
    const cv = sk.curves[ref.curve];
    if (!cv || cv.proj) return false;
    if (st.constrained && st.constrained[ref.curve]) return false;
    return true;
  }
  return false;
}

const editHandler = {
  name: "sketch-edit",
  press: null,
  onPointerDown(ev, ctx) {
    this.press = null;
    if (ctx.button !== 0) return false;
    const A = ST.app;
    const hit = vp().pick(ctx.x, ctx.y, { filter: (r) => A.selection.accepts(r) });
    const r = hit && hit.ref;
    // only presses on the active sketch's points/curves are ours (drag); everything else goes to
    // the viewport's selection handler (click select, window / freeform / paint selection)
    if (!r || !(r.kind === "sketchPoint" || r.kind === "sketchCurve") || r.sketch !== ST.sketchId) {
      if (!viewportSelectsWindows) {
        this.press = { x: ctx.x, y: ctx.y, hit, shift: ctx.shift, ctrl: ctx.ctrl, mode: null, own: true };
        return true;
      }
      return false;
    }
    this.press = { x: ctx.x, y: ctx.y, hit, shift: ctx.shift, ctrl: ctx.ctrl, mode: null };
    return true;
  },
  onPointerMove(ev, ctx) {
    const p = this.press;
    if (!p) return false;
    if (!(ev.buttons & 1)) { this.press = null; return false; }
    if (!p.mode && Math.hypot(ctx.x - p.x, ctx.y - p.y) > 4) {
      const r = p.hit && p.hit.ref;
      if (r && (r.kind === "sketchPoint" || r.kind === "sketchCurve") && r.sketch === ST.sketchId) {
        const d = activeData();
        p.mode = d && movable(d, r) ? "drag" : "none";
        if (p.mode === "drag") dragBegin(p, d, r);
      } else if (r && r.kind === "sketchDim") p.mode = "none";
      else { p.mode = "window"; windowBegin(p); }
    }
    if (p.mode === "drag") dragMove(p, ctx);
    else if (p.mode === "window") windowMove(p, ctx);
    return true;
  },
  onPointerUp(ev, ctx) {
    const p = this.press;
    this.press = null;
    if (!p) return false;
    const A = ST.app;
    if (p.mode === "drag") { dragEnd(p); return true; }
    if (p.mode === "window") { windowEnd(p, ctx); return true; }
    if (p.mode === "none") return true;
    const h = p.hit;
    if (!h) { if (!p.shift && !p.ctrl) A.selection.clear(); return true; }
    if (p.shift || p.ctrl) A.selection.toggle(h.ref);
    else A.selection.set([h.ref]);
    return true;
  },
  onDoubleClick(ev, ctx) {
    const A = ST.app;
    const h = vp().pick(ctx.x, ctx.y, { filter: (r) => isSketchRef(r) });
    if (!h) return false;
    if (h.ref.kind === "sketchDim") { editDimension(h.ref.cid); return true; }
    if (h.ref.kind === "sketchCurve") {
      const d = activeData();
      const ch = A.S.chainOf(d.sk, h.ref.curve);
      A.selection.set(ch.ids.map((id) => ({ kind: "sketchCurve", sketch: ST.sketchId, curve: id })));
      return true;
    }
    return false;
  },
  onKeyDown(ev) {
    if ((ev.key === "Delete" || ev.key === "Backspace") && !ev.ctrlKey && !ev.altKey) return deleteSelection();
    return false;
  },
};

// ---------- drag ----------
let dragRaf = 0;
function dragBegin(p, d, ref) {
  const S = ST.app.S;
  const work = S.cloneSketch(d.sk);
  p.drag = { ref, base: work, lastGood: S.cloneSketch(work), plane: d.plane, status: d.status, changed: false };
  const uv = cursorOnPlane(p.x, p.y, d.plane);
  if (ref.kind === "sketchCurve" && work.curves[ref.curve].type === "line" && uv) {
    const n = S.nearestOnCurve(work, ref.curve, uv.uv);
    p.drag.t = n ? n.t : 0.5;
  }
  if (ref.kind === "sketchCurve" && work.curves[ref.curve].type === "point") { p.drag.ref = { kind: "sketchPoint", sketch: ref.sketch, point: work.curves[ref.curve].p }; }
  // splines and ellipses move as a whole: every defining point follows the cursor offset
  const cv = ref.kind === "sketchCurve" && work.curves[ref.curve];
  if (cv && (cv.type === "spline" || cv.type === "ellipse" || cv.type === "earc") && uv) {
    p.drag.translate = { from: uv.uv, pts: S.curvePoints(cv).filter((q) => work.points[q]).map((q) => ({ id: q, x: work.points[q].x, y: work.points[q].y })) };
  }
  ST.app.selection.setHover(null);
  vp().canvas.style.cursor = "move";
}
function dragMove(p, ctx) {
  p.target = [ctx.x, ctx.y];
  if (dragRaf) return;
  dragRaf = requestAnimationFrame(() => {
    dragRaf = 0;
    if (!p.drag || !p.target) return;
    const S = ST.app.S;
    const dd = p.drag;
    const hit = cursorOnPlane(p.target[0], p.target[1], dd.plane);
    if (!hit) return;
    const w = S.cloneSketch(dd.lastGood);
    const g = dd.ref.kind === "sketchPoint" ? { ref: dd.ref.point, x: hit.uv[0], y: hit.uv[1] } : { ref: dd.ref.curve, x: hit.uv[0], y: hit.uv[1], t: dd.t };
    const tr = dd.translate;
    const grabs = tr ? tr.pts.map((q) => ({ ref: q.id, x: q.x + hit.uv[0] - tr.from[0], y: q.y + hit.uv[1] - tr.from[1] })) : [g];
    const P = params();
    let ok = false;
    try { ok = S.dragSolve(w, P, grabs); } catch (e) { console.error(e); }
    if (!ok) return;
    dd.lastGood = w;
    dd.changed = true;
    let regions = null;
    try { regions = S.regions(w); } catch { regions = { regions: [] }; }
    ST.live = { id: ST.sketchId, plane: dd.plane, sk: w, regions, status: dd.status };
    render.rebuild();
    const drop = dropTarget(dd, w);
    render.setSnapMark(drop ? { at: drop.at, kind: drop.kind === "point" ? "point" : "oncurve", align: [] } : null);
  });
}

/** Point / curve under a dragged point (dropping on it adds a coincident constraint). */
function dropTarget(dd, sk) {
  if (dd.ref.kind !== "sketchPoint") return null;
  const S = ST.app.S;
  const pid = dd.ref.point;
  const P0 = sk.points[pid];
  if (!P0) return null;
  const proj = projector(dd.plane);
  const s0 = proj(P0.x, P0.y);
  const own = Object.keys(sk.curves).filter((k) => S.curvePoints(sk.curves[k]).includes(pid));
  const neighbours = new Set(own.flatMap((k) => S.curvePoints(sk.curves[k])));
  let best = null;
  for (const q of pickablePoints(sk, true)) {
    if (q === pid || neighbours.has(q)) continue;
    const s = proj(sk.points[q].x, sk.points[q].y);
    const dpx = Math.hypot(s[0] - s0[0], s[1] - s0[1]);
    if (dpx <= 8 && (!best || dpx < best.dpx)) best = { kind: "point", id: q, dpx, at: [sk.points[q].x, sk.points[q].y] };
  }
  if (best) return best;
  for (const [k, cv] of Object.entries(sk.curves)) {
    if (own.includes(k) || cv.type === "point" || !curveVisible(cv, true)) continue;
    const n = S.nearestOnCurve(sk, k, [P0.x, P0.y]);
    if (!n) continue;
    const s = proj(n.p[0], n.p[1]);
    const dpx = Math.hypot(s[0] - s0[0], s[1] - s0[1]);
    if (dpx <= 5 && (!best || dpx < best.dpx)) best = { kind: "curve", id: k, dpx, at: n.p };
  }
  return best;
}
function dragEnd(p) {
  if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = 0; }
  const dd = p.drag;
  vp().canvas.style.cursor = "";
  if (!dd) return;
  ST.live = null;
  if (!dd.changed) { render.rebuild(); return; }
  render.setSnapMark(null);
  let res = dd.lastGood;
  let extra = null;
  const drop = dropTarget(dd, res);
  if (drop) {
    const S = ST.app.S;
    const c = drop.kind === "point" ? { id: "__drop", type: "coincident", refs: [dd.ref.point, drop.id] } : { id: "__drop", type: "onCurve", refs: [dd.ref.point, drop.id] };
    let t = null;
    try { t = S.tryConstraints(res, params(), [c]); } catch (e) { console.error(e); }
    if (t && t.ok) { res = t.sk; extra = c; }
  }
  mutateSketch(dd.ref.kind === "sketchPoint" ? "Move Point" : "Move Curve", (sk) => {
    for (const [id, pt] of Object.entries(res.points)) if (sk.points[id]) { sk.points[id].x = pt.x; sk.points[id].y = pt.y; }
    for (const [id, cv] of Object.entries(res.curves)) if (sk.curves[id] && cv.r !== undefined) sk.curves[id].r = cv.r;
    if (extra && extra.refs.every((r) => sk.points[r] || sk.curves[r])) ST.app.S.addConstraint(sk, extra.type, extra.refs);
  });
}

// ---------- window selection ----------
let viewportSelectsWindows = false;
/** Sketch entities inside / crossing a viewport selection region (window, freeform, paint). */
function windowProvider(region) {
  const A = ST.app;
  if (A.mode !== "sketch" || !ST.sketchId) return [];
  const d = activeData();
  if (!d) return [];
  const proj = projector(d.plane);
  const out = [];
  const sk = d.sk;
  for (const [id, cv] of Object.entries(sk.curves)) {
    if (cv.type === "point" ? false : !curveVisible(cv, true)) continue;
    const poly = A.S.curvePolyline(sk, id, 48).map((q) => proj(q[0], q[1]));
    let hit;
    if (region.crossing) {
      hit = poly.length === 1 ? region.inside(poly[0][0], poly[0][1]) : false;
      for (let i = 0; !hit && i + 1 < poly.length; i++) hit = region.segmentTouches(poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1]);
    } else hit = poly.every((s) => region.inside(s[0], s[1]));
    if (hit) out.push({ kind: "sketchCurve", sketch: ST.sketchId, curve: id });
  }
  for (const pid of pickablePoints(sk, true)) {
    if (pid === "o") continue;
    const P = sk.points[pid];
    const s = proj(P.x, P.y);
    if (region.inside(s[0], s[1]) && !out.some((r) => r.kind === "sketchCurve" && A.S.curvePoints(sk.curves[r.curve]).includes(pid))) out.push({ kind: "sketchPoint", sketch: ST.sketchId, point: pid });
  }
  return out;
}

function windowBegin(p) {
  const el = document.createElement("div");
  el.className = "sk-window";
  ST.overlay.appendChild(el);
  p.win = el;
}
function windowMove(p, ctx) {
  const el = p.win;
  if (!el) return;
  const x0 = Math.min(p.x, ctx.x), y0 = Math.min(p.y, ctx.y);
  el.style.left = `${x0}px`; el.style.top = `${y0}px`;
  el.style.width = `${Math.abs(ctx.x - p.x)}px`; el.style.height = `${Math.abs(ctx.y - p.y)}px`;
  el.classList.toggle("crossing", ctx.x < p.x);
  p.cur = [ctx.x, ctx.y];
}
function windowEnd(p, ctx) {
  if (p.win) p.win.remove();
  const A = ST.app;
  const d = activeData();
  if (!d) return;
  const x0 = Math.min(p.x, ctx.x), x1 = Math.max(p.x, ctx.x), y0 = Math.min(p.y, ctx.y), y1 = Math.max(p.y, ctx.y);
  const crossing = ctx.x < p.x;
  const proj = projector(d.plane);
  const inside = (s) => s[0] >= x0 && s[0] <= x1 && s[1] >= y0 && s[1] <= y1;
  const refs = [];
  const sk = d.sk;
  for (const [id, cv] of Object.entries(sk.curves)) {
    if (!curveVisible(cv, true) && cv.type !== "point") continue;
    const poly = A.S.curvePolyline(sk, id, 48).map((q) => proj(q[0], q[1]));
    const ins = poly.map(inside);
    if (crossing ? ins.some(Boolean) || segCrossesRect(poly, x0, y0, x1, y1) : ins.every(Boolean)) refs.push({ kind: "sketchCurve", sketch: ST.sketchId, curve: id });
  }
  for (const pid of pickablePoints(sk, true)) {
    if (pid === "o") continue;
    const P = sk.points[pid];
    if (inside(proj(P.x, P.y)) && !refs.some((r) => r.kind === "sketchCurve" && A.S.curvePoints(sk.curves[r.curve]).includes(pid))) refs.push({ kind: "sketchPoint", sketch: ST.sketchId, point: pid });
  }
  if (p.shift || p.ctrl) { const keys = new Set(A.selection.items.map(refKey)); A.selection.set([...A.selection.items, ...refs.filter((r) => !keys.has(refKey(r)))]); }
  else A.selection.set(refs);
}
function segCrossesRect(poly, x0, y0, x1, y1) {
  const edges = [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]];
  const cross = (a, b, c, d) => {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  };
  for (let i = 0; i + 1 < poly.length; i++) for (const [c, e] of edges) if (cross(poly[i], poly[i + 1], c, e)) return true;
  return false;
}

// ---------- delete ----------
export function deleteSelection() {
  const A = ST.app;
  if (A.mode !== "sketch" || !ST.sketchId) return false;
  const items = A.selection.items.filter((r) => isSketchRef(r));
  if (!items.length) return false;
  const S = A.S;
  mutateSketch("Delete", (sk) => {
    const cids = items.filter((r) => r.kind === "sketchDim" || r.kind === "sketchConstraint").map((r) => r.cid);
    if (cids.length) S.removeConstraints(sk, cids);
    const ents = [
      ...items.filter((r) => r.kind === "sketchCurve").map((r) => r.curve),
      ...items.filter((r) => r.kind === "sketchPoint" && r.point !== "o").map((r) => r.point),
    ].filter((id) => sk.curves[id] || sk.points[id]);
    if (ents.length) S.removeEntities(sk, ents);
  });
  A.selection.set(A.selection.items.filter((r) => !isSketchRef(r)));
  return true;
}

// ---------------------------------------------------------------------------
// document replaced (undo / redo / open / new)
// ---------------------------------------------------------------------------
export function initEnv() {
  const A = ST.app;
  const v = vp();
  if (v && typeof v.addWindowSelectProvider === "function") {
    v.addWindowSelectProvider(windowProvider);
    viewportSelectsWindows = true;
  }
  A.on("doc", (d) => {
    if (!d || !d.replaced) return;
    if (PP) cancelPlanePick();
    if (A.mode !== "sketch" && !ST.session) return;
    const fresh = A.history.undoStack.length === 0 && A.history.redoStack.length === 0;
    const f = ST.sketchId && A.feature(ST.sketchId);
    if (!f || f.type !== "sketch" || fresh) { dropSession(!fresh); return; }
    ST.live = null;
    if (ST.tool && ST.tool.reset) ST.tool.reset();
    // keep the timeline rolled to the sketch while editing
    const idx = A.featureIndex(ST.sketchId);
    if (A.doc.marker !== idx + 1 && ST.session) {
      ST.session.rolled = true;
      A.doc.marker = idx + 1;
    }
  });
}

export { sketchData };
