// Sketch drawing tools: Line (with click-drag tangent arcs), rectangles, circles, arcs,
// polygons, slots and points. Each commit is one app.mutate (one undo step).
import { ST, vp, activeData, mutateSketch, projector, mmPerPx, emitLocal } from "./ctx.js";
import { snapAt } from "./snap.js";
import * as HUD from "./hud.js";
import { setToolPreview, clearToolPreview, setSnapMark, setHudDims, clearHudDims, arrangeDims } from "./render.js";

const TAU = Math.PI * 2;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const perp = (a) => [-a[1], a[0]];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const rot = (v, ang) => [v[0] * Math.cos(ang) - v[1] * Math.sin(ang), v[0] * Math.sin(ang) + v[1] * Math.cos(ang)];
const D2R = Math.PI / 180;

export const circlePoly = (c, r, n = 72) => { const out = []; for (let i = 0; i <= n; i++) { const a = (TAU * i) / n; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } return out; };
export const arcPoly = (c, r, a0, sweep, n = 64) => { const k = Math.max(4, Math.ceil((n * Math.abs(sweep)) / TAU)); const out = []; for (let i = 0; i <= k; i++) { const a = a0 + (sweep * i) / k; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } return out; };
const normAng = (a) => ((a % TAU) + TAU) % TAU;
/** Polyline for an arc from a to b (ccw or cw) around c. */
export function arcFromTo(c, a, b, ccw) {
  const r = len(sub(a, c));
  const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
  let sw = normAng(a1 - a0);
  if (!ccw) sw = sw - TAU;
  if (Math.abs(sw) < 1e-9) sw = ccw ? TAU : -TAU;
  return arcPoly(c, r, a0, sw);
}

// ---------------------------------------------------------------------------
// tool lifecycle
// ---------------------------------------------------------------------------
export function currentTool() { return ST.tool; }
/** Run the application's Undo / Redo command (falls back to the raw history without the menus module). */
export function runHistory(kind) {
  const A = ST.app;
  const id = kind === "redo" ? "Redo" : "Undo";
  if (A.commands && A.commands.get(id)) { A.commands.run(id); return; }
  if (kind === "redo") { if (A.history.canRedo()) A.history.redo(); }
  else if (A.history.canUndo()) A.history.undo();
}
export function endTool() {
  const t = ST.tool;
  if (!t) return;
  ST.tool = null;
  t.stop();
  emitLocal("tool", { id: null });
}

export class Tool {
  constructor(id, label) { this.id = id; this.label = label || id; this.lastCtx = null; }
  start() {
    endTool();
    ST.tool = this;
    const self = this;
    this.handler = {
      name: `sketch-tool:${this.id}`,
      cursor: "crosshair",
      onPointerMove(ev, ctx) { self.lastCtx = ctx; self.lastEv = ev; HUD.promptMove(ctx.x, ctx.y); HUD.hudAvoid(ctx.x, ctx.y); self.move(ctx, ev); return true; },
      onPointerDown(ev, ctx) {
        if (ctx.button !== 0) return false;
        self.downAt = { x: ctx.x, y: ctx.y };
        if (self.down) self.down(ctx, ev);
        return true;
      },
      onPointerUp(ev, ctx) {
        if (ctx.button !== 0) return false;
        const d = self.downAt;
        self.downAt = null;
        if (!d) return true;
        self.lastCtx = ctx;
        self.click(ctx, { dragged: Math.hypot(ctx.x - d.x, ctx.y - d.y) > 6, from: d, ev });
        return true;
      },
      onDoubleClick(ev, ctx) { if (self.dbl) self.dbl(ctx); return true; },
      // right-click: tools that finish on it (Fit Point Spline's OK) consume it, others let the menu open
      onContextMenu(ev, ctx) { return self.context ? self.context(ctx, ev) === true : false; },
      onKeyDown(ev) {
        const hk = HUD.historyKind(ev);
        if (hk) { self.historyStep(hk); return true; }
        return self.key ? self.key(ev) === true : false;
      },
      onCancel() { self.escape(); return true; },
    };
    // a failing tool must never leave the canvas stuck: report and keep going
    for (const k of Object.keys(this.handler)) {
      const fn = this.handler[k];
      if (typeof fn !== "function") continue;
      this.handler[k] = function (...args) {
        try { return fn.apply(this, args); } catch (e) { console.error(`[sketch tool ${self.id}]`, e); try { ST.app.toast(`${self.label}: ${e.message || e}`, "error", 2600); } catch { /* ignore */ } return true; }
      };
    }
    this.pop = ST.app.input.push(this.handler);
    try { vp().canvas.style.cursor = "crosshair"; } catch { /* ignore */ }
    if (this.prompt) HUD.promptShow(this.prompt());
    if (this.begin) this.begin();
    emitLocal("tool", { id: this.id });
    return this;
  }
  stop() {
    if (this.pop) this.pop();
    this.pop = null;
    HUD.hudHide();
    HUD.promptHide();
    clearToolPreview();
    clearHudDims();
    setSnapMark(null);
    ST.app.selection.setHover(null);
    try { vp().canvas.style.cursor = ""; } catch { /* ignore */ }
    if (this.end) this.end();
  }
  escape() { endTool(); }
  reset() {}
  /** Ctrl+Z / Ctrl+Y while the tool runs: undo / redo one step and keep the tool (the in-progress
   * pick is dropped by the document-replaced handler). */
  historyStep(kind) { runHistory(kind); }
  refreshPrompt() { if (this.prompt) HUD.promptShow(this.prompt()); }
  /** Re-run the move logic at the last cursor position (after commits / typing). */
  refresh() { if (this.lastCtx) this.move(this.lastCtx, this.lastEv); }
  snap(ctx, opts = {}) { return snapAt(ctx.x, ctx.y, { noSnap: ctx.ctrl, ...opts }); }
}

// ---------------------------------------------------------------------------
// helpers used inside mutations
// ---------------------------------------------------------------------------
/** Resolve a placed point {uv, snap} to a point id in sk (reusing snapped points, adding midpoint/on-curve constraints). */
export function rp(sk, P) {
  const S = ST.app.S;
  const s = (P && P.snap) || {};
  if (s.pointId && sk.points[s.pointId]) return s.pointId;
  const id = S.addPoint(sk, P.uv[0], P.uv[1]);
  if (s.kind === "midpoint" && s.curveId && sk.curves[s.curveId]) S.addConstraint(sk, "midpoint", [id, s.curveId]);
  else if (s.kind === "oncurve" && s.curveId && sk.curves[s.curveId] && sk.curves[s.curveId].type !== "point") S.addConstraint(sk, "onCurve", [id, s.curveId]);
  return id;
}
/** Add a driving dimension with a new model parameter. */
export function addDim(sk, doc, type, refs, expr, extra = {}) {
  return ST.app.S.addConstraint(sk, type, refs, { expr, param: ST.app.M.nextParam(doc), ...extra });
}
const cons = () => !!ST.opts.construction;
const pxToMm = (uv) => { const d = activeData(); return d ? mmPerPx(d.plane, uv) : 0.1; };

// ---------------------------------------------------------------------------
// sequential click tools (rectangles, circles, arcs, polygons, slots, point)
// ---------------------------------------------------------------------------
export class SeqTool extends Tool {
  constructor(id, label, def) { super(id, label); this.def = def; this.P = []; this.st = {}; this.cur = null; }
  prompt() { const p = this.def.prompts || []; return p[Math.min(this.P.length, p.length - 1)] || ""; }
  begin() { this.P = []; this.st = {}; }
  reset() { this.P = []; this.st = {}; HUD.hudHide(); clearToolPreview(); clearHudDims(); this.refreshPrompt(); }
  typed() { return HUD.hudValues(); }
  move(ctx) {
    const snap = this.snap(ctx, this.def.snapOpts ? this.def.snapOpts(this.P.length, this.P, this) : {});
    if (!snap) return;
    this.cur = snap;
    this.update();
  }
  update() {
    const snap = this.cur;
    if (!snap) return;
    const stage = this.P.length;
    const T = this.typed();
    const g = this.def.geom(stage, this.P, snap, T, this) || {};
    this.g = g;
    const typedMove = !!g.typedPoint;
    setSnapMark({ at: typedMove ? null : snap.uv, kind: typedMove ? null : g.glyph || snap.kind, align: typedMove ? [] : snap.align });
    setToolPreview({ lines: g.lines, polys: g.polys, cons: g.cons, consPolys: g.consPolys, points: g.hudDims ? [] : [...this.P.map((p) => p.uv), ...(g.points || [])] });
    // heads-up dimensions (they also place the value boxes); other boxes sit at fixed offsets
    setHudDims(HUD.hudOpen() && g.hudDims ? g.hudDims : null);
    if (g.hud && HUD.hudOpen()) {
      const d = activeData();
      const proj = projector(d.plane);
      for (const [id, h] of Object.entries(g.hud)) {
        if (!h) { HUD.hudHideField(id); continue; }
        const s = proj(h.at[0], h.at[1]);
        HUD.hudSet(id, h.value, [s[0] + (h.off ? h.off[0] : 0) - 30, s[1] + (h.off ? h.off[1] : 0) - 4]);
      }
    }
    ST.app.selection.setHover(!typedMove && snap.pointId ? { kind: "sketchPoint", sketch: ST.sketchId, point: snap.pointId } : !typedMove && snap.curveId ? { kind: "sketchCurve", sketch: ST.sketchId, curve: snap.curveId } : null);
  }
  click(ctx) {
    const snap = this.snap(ctx, this.def.snapOpts ? this.def.snapOpts(this.P.length, this.P, this) : {});
    if (!snap) return;
    this.cur = snap;
    this.place();
  }
  place() {
    const stage = this.P.length;
    const T = this.typed();
    const g = this.def.geom(stage, this.P, this.cur, T, this) || {};
    if (g.invalid) { if (g.message) ST.app.toast(g.message, "warning", 1800); return; }
    const pt = g.point || this.cur.uv;
    this.P.push({ uv: pt, snap: g.typedPoint ? null : this.cur });
    if (this.P.length >= this.def.clicks) {
      const P = this.P;
      const def = this.def;
      try {
        mutateSketch(def.undo || this.label, (sk, f, doc) => def.commit(sk, P, T, g, doc, this));
      } catch (e) {
        console.error(e);
        ST.app.toast(`${this.label}: ${e.message || e}`, "error");
      }
      this.P = [];
      this.st = {};
      HUD.hudHide();
      clearToolPreview();
      clearHudDims();
      this.refreshPrompt();
      return;
    }
    const fields = this.def.hud ? this.def.hud(this.P.length, this) : null;
    if (fields && fields.length) HUD.hudShow(fields, { onEnter: () => this.enter(), onChange: () => this.update() });
    else HUD.hudHide();
    this.refreshPrompt();
    this.update();
  }
  enter() {
    if (!this.cur) return;
    this.place();
  }
  key(ev) {
    if (ev.key === "Enter" && this.P.length) { this.enter(); return true; }
    return false;
  }
}

// ---------- tool definitions ----------
function hudLen(id, label) { return { id, kind: "length", label }; }

/** HUD dimension lines sit this far (screen px) outside the rubber band, like Fusion's. */
const HUD_OFF = 78;

/** Rectangle HUD (Fusion: the first box is the height on the side through the fixed corner, Tab -> width). */
function rectHud(a, b, w, h, cross) {
  const sx = Math.sign(b[0] - a[0]) || 1, sy = Math.sign(b[1] - a[1]) || 1;
  const out = [
    { kind: "linear", id: "h", value: h, A: a, B: [a[0], b[1]], n: [-sx, 0], off: HUD_OFF },
    { kind: "linear", id: "w", value: w, A: a, B: [b[0], a[1]], n: [0, -sy], off: HUD_OFF },
  ];
  if (cross !== false) out.push({ kind: "cross", at: b, size: 10 }, { kind: "cross", at: a, size: 6 });
  return out;
}

const RECT_DEFS = {
  ShapeRectangleTwoPoint: {
    clicks: 2,
    undo: "2-Point Rectangle",
    prompts: ["Place first corner", "Specify size of rectangle"],
    hud: (stage) => (stage === 1 ? [hudLen("h", "Height"), hudLen("w", "Width")] : null),
    geom(stage, P, cur, T) {
      if (stage === 0) return { points: [cur.uv] };
      const a = P[0].uv;
      const b = cur.uv.slice();
      const sx = Math.sign(b[0] - a[0]) || 1, sy = Math.sign(b[1] - a[1]) || 1;
      let typed = false;
      if (T.w && T.w.ok) { b[0] = a[0] + sx * T.w.value; typed = true; }
      if (T.h && T.h.ok) { b[1] = a[1] + sy * T.h.value; typed = true; }
      const C = [a, [b[0], a[1]], b, [a[0], b[1]]];
      const w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
      return { point: b, typedPoint: typed, polys: [[...C, a]], invalid: w < 1e-6 || h < 1e-6, hudDims: rectHud(a, b, w, h) };
    },
    commit(sk, P, T, g, doc) {
      const S = ST.app.S;
      const a = P[0].uv, b = g.point;
      const C = [a, [b[0], a[1]], b, [a[0], b[1]]];
      const i0 = rp(sk, P[0]);
      const i2 = P[1].snap ? rp(sk, P[1]) : null;
      const r = S.addRectCorners(sk, C, { ids: [i0, null, i2, null], cons: cons() });
      const ps = pxToMm(b);
      const sx = Math.sign(b[0] - a[0]) || 1, sy = Math.sign(b[1] - a[1]) || 1;
      // the dimensions land where the HUD showed them: on the sides through the first corner
      if (T.w && T.w.ok) addDim(sk, doc, "distance", [r.lines[0]], T.w.expr, { dimType: "aligned", at: [0, -sy * HUD_OFF * ps] });
      if (T.h && T.h.ok) addDim(sk, doc, "distance", [r.lines[3]], T.h.expr, { dimType: "aligned", at: [-sx * HUD_OFF * ps, 0] });
      return r;
    },
  },
  ShapeRectangleCenter: {
    clicks: 2,
    undo: "Center Rectangle",
    prompts: ["Place center point", "Specify size of rectangle"],
    hud: (stage) => (stage === 1 ? [hudLen("h", "Height"), hudLen("w", "Width")] : null),
    geom(stage, P, cur, T) {
      if (stage === 0) return { points: [cur.uv] };
      const c = P[0].uv;
      const b = cur.uv.slice();
      let typed = false;
      const sx = Math.sign(b[0] - c[0]) || 1, sy = Math.sign(b[1] - c[1]) || 1;
      if (T.w && T.w.ok) { b[0] = c[0] + (sx * T.w.value) / 2; typed = true; }
      if (T.h && T.h.ok) { b[1] = c[1] + (sy * T.h.value) / 2; typed = true; }
      const dx = b[0] - c[0], dy = b[1] - c[1];
      const C = [[c[0] - dx, c[1] - dy], [c[0] + dx, c[1] - dy], [c[0] + dx, c[1] + dy], [c[0] - dx, c[1] + dy]];
      const hud = rectHud(C[0], C[2], Math.abs(2 * dx), Math.abs(2 * dy), false);
      hud.push({ kind: "cross", at: b, size: 10 }, { kind: "cross", at: c, size: 6 });
      return { point: b, typedPoint: typed, polys: [[...C, C[0]]], cons: [[C[0], C[2]], [C[1], C[3]]], invalid: Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6, hudDims: hud };
    },
    commit(sk, P, T, g, doc) {
      const S = ST.app.S;
      const c = P[0].uv, b = g.point;
      const dx = b[0] - c[0], dy = b[1] - c[1];
      const C = [[c[0] - dx, c[1] - dy], [c[0] + dx, c[1] - dy], [c[0] + dx, c[1] + dy], [c[0] - dx, c[1] + dy]];
      const ic = rp(sk, P[0]);
      const i2 = P[1].snap ? rp(sk, P[1]) : null;
      const r = S.addRectCorners(sk, C, { ids: [null, null, i2, null], cons: cons() });
      const d1 = S.addLine(sk, r.points[0], r.points[2], true);
      const d2 = S.addLine(sk, r.points[1], r.points[3], true);
      S.addConstraint(sk, "midpoint", [ic, d1]);
      S.addConstraint(sk, "midpoint", [ic, d2]);
      const ps = pxToMm(b);
      const sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
      if (T.w && T.w.ok) addDim(sk, doc, "distance", [r.lines[0]], T.w.expr, { dimType: "aligned", at: [0, -sy * HUD_OFF * ps] });
      if (T.h && T.h.ok) addDim(sk, doc, "distance", [r.lines[3]], T.h.expr, { dimType: "aligned", at: [-sx * HUD_OFF * ps, 0] });
      return r;
    },
  },
  ShapeRectangleThreePoint: {
    clicks: 3,
    undo: "3-Point Rectangle",
    prompts: ["Place first corner", "Place second corner", "Place third corner"],
    hud: (stage) => (stage === 1 ? [hudLen("l", "Length")] : stage === 2 ? [hudLen("h", "Height")] : null),
    geom(stage, P, cur, T) {
      if (stage === 0) return { points: [cur.uv] };
      const a = P[0].uv;
      if (stage === 1) {
        let b = cur.uv.slice();
        let typed = false;
        if (T.l && T.l.ok) { b = add(a, mul(unit(sub(b, a)), T.l.value)); typed = true; }
        const L = len(sub(b, a));
        const n = L > 1e-9 ? perp(unit(sub(b, a))) : [0, 1];
        return { point: b, typedPoint: typed, lines: [[a, b]], invalid: L < 1e-6, hudDims: [{ kind: "linear", id: "l", value: L, A: a, B: b, n: mul(n, -1), off: 30 }] };
      }
      const b = P[1].uv;
      const u = unit(sub(b, a)), n = perp(u);
      let h = dot(sub(cur.uv, a), n);
      let typed = false;
      if (T.h && T.h.ok) { h = (Math.sign(h) || 1) * T.h.value; typed = true; }
      const C = [a, b, add(b, mul(n, h)), add(a, mul(n, h))];
      return { point: C[2], typedPoint: typed, polys: [[...C, a]], invalid: Math.abs(h) < 1e-6, hudDims: [{ kind: "linear", id: "h", value: Math.abs(h), A: b, B: C[2], n: u, off: 40 }] };
    },
    commit(sk, P, T, g, doc, tool) {
      const S = ST.app.S;
      const a = P[0].uv, b = P[1].uv, c2 = g.point;
      const n = sub(c2, b);
      const C = [a, b, c2, add(a, n)];
      const ids = [rp(sk, P[0]), P[1].snap ? rp(sk, P[1]) : null, null, null];
      const r = S.addRectCorners(sk, C, { ids, cons: cons(), aligned: false });
      const ps = pxToMm(c2);
      const T1 = (tool.typedAt && tool.typedAt[1]) || {};
      if (T1.l && T1.l.ok) addDim(sk, doc, "distance", [r.lines[0]], T1.l.expr, { dimType: "aligned", at: mul(unit(n), -30 * ps) });
      if (T.h && T.h.ok) addDim(sk, doc, "distance", [r.lines[1]], T.h.expr, { dimType: "aligned", at: mul(unit(sub(b, a)), 40 * ps) });
      return r;
    },
  },
};

const CIRCLE_DEFS = {
  CircleCenterRadius: {
    clicks: 2,
    undo: "Center Diameter Circle",
    prompts: ["Place center point", "Specify diameter of circle"],
    hud: (stage) => (stage === 1 ? [hudLen("d", "Diameter")] : null),
    geom(stage, P, cur, T) {
      if (stage === 0) return { points: [cur.uv] };
      const c = P[0].uv;
      let r = len(sub(cur.uv, c));
      let typed = false;
      if (T.d && T.d.ok) { r = T.d.value / 2; typed = true; }
      const dir = len(sub(cur.uv, c)) > 1e-9 ? unit(sub(cur.uv, c)) : [1, 0];
      return { point: add(c, mul(dir, r)), typedPoint: typed, polys: [circlePoly(c, r)], invalid: r < 1e-6, hudDims: [{ kind: "diam", id: "d", value: 2 * r, C: c, dir, r }, { kind: "cross", at: c, size: 6 }] };
    },
    commit(sk, P, T, g, doc) {
      const S = ST.app.S;
      const c = P[0].uv;
      const r = len(sub(g.point, c));
      const ic = rp(sk, P[0]);
      const id = S.addCircle(sk, ic, r, cons());
      const sn = P[1].snap;
      if (sn && sn.pointId && sk.points[sn.pointId] && sn.pointId !== ic) S.addConstraint(sk, "onCurve", [sn.pointId, id]);
      if (T.d && T.d.ok) {
        const u = len(sub(g.point, c)) > 1e-9 ? unit(sub(g.point, c)) : [0.7071, 0.7071];
        addDim(sk, doc, "diameter", [id], T.d.expr, { at: mul(u, r + 30 * pxToMm(c)) });
      }
      return id;
    },
  },
  CircleTwoPoint: {
    clicks: 2,
    undo: "2-Point Circle",
    prompts: ["Place first point on diameter", "Place second point on diameter"],
    hud: (stage) => (stage === 1 ? [hudLen("d", "Diameter")] : null),
    geom(stage, P, cur, T) {
      if (stage === 0) return { points: [cur.uv] };
      const a = P[0].uv;
      let b = cur.uv;
      let typed = false;
      if (T.d && T.d.ok) { b = add(a, mul(unit(sub(b, a)), T.d.value)); typed = true; }
      const c = mid(a, b), r = len(sub(b, a)) / 2;
      const dir = r > 1e-9 ? unit(sub(b, a)) : [1, 0];
      return { point: b, typedPoint: typed, polys: [circlePoly(c, r)], invalid: r < 1e-6, hudDims: [{ kind: "diam", id: "d", value: 2 * r, C: c, dir, r }] };
    },
    commit(sk, P, T, g, doc) {
      const S = ST.app.S;
      const a = P[0].uv, b = g.point;
      const c = mid(a, b), r = len(sub(b, a)) / 2;
      const ic = S.addPoint(sk, c[0], c[1]);
      const id = S.addCircle(sk, ic, r, cons());
      for (const p of P) if (p.snap && p.snap.pointId && sk.points[p.snap.pointId]) S.addConstraint(sk, "onCurve", [p.snap.pointId, id]);
      if (T.d && T.d.ok) addDim(sk, doc, "diameter", [id], T.d.expr, {});
      return id;
    },
  },
  CircleThreePoint: {
    clicks: 3,
    undo: "3-Point Circle",
    prompts: ["Place first point on circle", "Place second point on circle", "Place third point on circle"],
    geom(stage, P, cur) {
      if (stage === 0) return { points: [cur.uv] };
      if (stage === 1) return { lines: [[P[0].uv, cur.uv]] };
      const ci = ST.app.S.circleFrom3(P[0].uv, P[1].uv, cur.uv);
      if (!ci) return { invalid: true, lines: [[P[0].uv, P[1].uv]] };
      return { polys: [circlePoly(ci.c, ci.r)] };
    },
    commit(sk, P) {
      const S = ST.app.S;
      const ci = S.circleFrom3(P[0].uv, P[1].uv, P[2].uv);
      if (!ci) return null;
      const ic = S.addPoint(sk, ci.c[0], ci.c[1]);
      const id = S.addCircle(sk, ic, ci.r, cons());
      for (const p of P) if (p.snap && p.snap.pointId && sk.points[p.snap.pointId]) S.addConstraint(sk, "onCurve", [p.snap.pointId, id]);
      return id;
    },
  },
};

const ARC_DEFS = {
  ArcThreePoint: {
    clicks: 3,
    undo: "3-Point Arc",
    prompts: ["Place start point", "Place end point", "Place point on arc"],
    hud: (stage) => (stage === 2 ? [hudLen("r", "Radius")] : null),
    geom(stage, P, cur, T) {
      const S = ST.app.S;
      if (stage === 0) return { points: [cur.uv] };
      if (stage === 1) return { cons: [[P[0].uv, cur.uv]] };
      const a = P[0].uv, b = P[1].uv;
      let m = cur.uv;
      let typed = false;
      if (T.r && T.r.ok) {
        const L = len(sub(b, a)) / 2;
        const r = Math.max(T.r.value, L + 1e-9);
        const u = unit(sub(b, a)), n = perp(u);
        const side = Math.sign(dot(sub(cur.uv, a), n)) || 1;
        const hgt = Math.sqrt(Math.max(0, r * r - L * L));
        // point on the arc: the far point along n from the chord midpoint
        const big = Math.abs(dot(sub(cur.uv, mid(a, b)), n)) > L; // past the semicircle -> major arc
        const c = add(mid(a, b), mul(n, big ? side * hgt : -side * hgt));
        m = add(c, mul(n, side * r));
        typed = true;
      }
      const arc = S.arcFrom3(a, m, b);
      if (!arc) return { invalid: true, lines: [[a, b]] };
      return { point: m, typedPoint: typed, polys: [arcFromTo(arc.c, a, b, arc.ccw)], arc, hud: { r: { value: arc.r, at: m, off: [0, -22] } } };
    },
    commit(sk, P, T, g, doc) {
      const S = ST.app.S;
      const arc = g.arc || S.arcFrom3(P[0].uv, P[2].uv, P[1].uv);
      if (!arc) return null;
      const a = rp(sk, P[0]), b = rp(sk, P[1]);
      const c = S.addPoint(sk, arc.c[0], arc.c[1]);
      const id = S.addArcDir(sk, c, a, b, arc.ccw, cons());
      sk.curves[id].r = arc.r;
      if (T.r && T.r.ok) addDim(sk, doc, "radius", [id], T.r.expr, {});
      return id;
    },
  },
  ArcCenterTwoPoint: {
    clicks: 3,
    undo: "Center Point Arc",
    prompts: ["Place center point", "Specify start point", "Specify end point"],
    hud: (stage) => (stage === 1 ? [hudLen("r", "Radius")] : stage === 2 ? [{ id: "a", kind: "angle", label: "Angle" }] : null),
    geom(stage, P, cur, T, tool) {
      if (stage === 0) return { points: [cur.uv] };
      const c = P[0].uv;
      if (stage === 1) {
        let s = cur.uv;
        let typed = false;
        if (T.r && T.r.ok) { s = add(c, mul(unit(sub(s, c)), T.r.value)); typed = true; }
        const r = len(sub(s, c));
        tool.st.prevAng = null; tool.st.sweep = 0;
        return { point: s, typedPoint: typed, cons: [[c, s]], consPolys: [circlePoly(c, r)], invalid: r < 1e-6, hud: { r: { value: r, at: mid(c, s), off: [0, -20] } } };
      }
      const s = P[1].uv;
      const r = len(sub(s, c));
      const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]);
      const ac = Math.atan2(cur.uv[1] - c[1], cur.uv[0] - c[0]);
      // accumulate the sweep so the direction follows the mouse
      if (tool.st.prevAng === null || tool.st.prevAng === undefined) { tool.st.prevAng = a0; tool.st.sweep = 0; }
      let dA = ac - tool.st.prevAng;
      while (dA > Math.PI) dA -= TAU;
      while (dA < -Math.PI) dA += TAU;
      tool.st.sweep += dA;
      tool.st.prevAng = ac;
      let sweep = tool.st.sweep;
      if (Math.abs(sweep) > TAU) sweep = Math.sign(sweep) * (Math.abs(sweep) % TAU);
      let typed = false;
      if (T.a && T.a.ok) { sweep = (Math.sign(sweep) || 1) * Math.min(359.9, Math.abs(T.a.value)) * D2R; typed = true; }
      if (Math.abs(sweep) < 1e-4) return { invalid: true, cons: [[c, s]] };
      const e = add(c, mul([Math.cos(a0 + sweep), Math.sin(a0 + sweep)], r));
      return { point: e, typedPoint: typed, sweep, polys: [arcPoly(c, r, a0, sweep)], cons: [[c, s], [c, e]], hud: { a: { value: Math.abs(sweep) / D2R, at: add(c, mul([Math.cos(a0 + sweep / 2), Math.sin(a0 + sweep / 2)], r * 0.6)), off: [0, 0] } } };
    },
    commit(sk, P, T, g, doc, tool) {
      const S = ST.app.S;
      const ic = rp(sk, P[0]);
      const is = rp(sk, P[1]);
      const c = P[0].uv;
      const r = len(sub(P[1].uv, c));
      const e = g.point;
      const ie = S.addPoint(sk, e[0], e[1]);
      const sn = P[2].snap;
      if (sn && sn.kind === "oncurve" && sn.curveId && sk.curves[sn.curveId]) S.addConstraint(sk, "onCurve", [ie, sn.curveId]);
      const ccw = (g.sweep || 0) > 0;
      const id = S.addArcDir(sk, ic, is, ie, ccw, cons());
      sk.curves[id].r = r;
      const T1 = tool.typedAt && tool.typedAt[1];
      if (T1 && T1.r && T1.r.ok) addDim(sk, doc, "radius", [id], T1.r.expr, {});
      return id;
    },
  },
  ArcTangent: {
    clicks: 2,
    undo: "Tangent Arc",
    prompts: ["Select the end point of a line or arc", "Select the end point of the arc"],
    hud: (stage) => (stage === 1 ? [hudLen("r", "Radius")] : null),
    snapOpts: () => ({ noCurve: true }),
    geom(stage, P, cur, T) {
      const S = ST.app.S;
      const d = activeData();
      if (stage === 0) {
        const base = cur.pointId ? endCurveOf(d.sk, cur.pointId) : null;
        return { points: [cur.uv], invalid: !base, message: "Select the end point of a line or arc" };
      }
      const pid = P[0].snap && P[0].snap.pointId;
      const base = endCurveOf(d.sk, pid);
      if (!base) return { invalid: true };
      const t = S.tangentAt(d.sk, base, pid);
      const F = [d.sk.points[pid].x, d.sk.points[pid].y];
      let E = cur.uv;
      const arc = S.tangentArc(F, t, E);
      if (!arc) return { invalid: true, lines: [[F, E]] };
      return { polys: [arcFromTo(arc.c, F, E, arc.ccw)], arc, base, F, hud: { r: { value: arc.r, at: E, off: [0, -24] } } };
    },
    commit(sk, P, T, g, doc) {
      const S = ST.app.S;
      const pid = P[0].snap.pointId;
      const arc = g.arc;
      if (!arc) return null;
      const ie = rp(sk, P[1]);
      const c = S.addPoint(sk, arc.c[0], arc.c[1]);
      const id = S.addArcDir(sk, c, pid, ie, arc.ccw, cons());
      sk.curves[id].r = arc.r;
      S.addConstraint(sk, "tangent", [g.base, id]);
      if (T.r && T.r.ok) addDim(sk, doc, "radius", [id], T.r.expr, {});
      return id;
    },
  },
};

/** The single line/arc (or spline / elliptical arc) ending at point pid (for tangent arcs), or null. */
export function endCurveOf(sk, pid) {
  if (!pid || !sk.points[pid]) return null;
  const S = ST.app.S;
  const us = Object.entries(sk.curves).filter(([, cv]) => ["line", "arc", "spline", "earc"].includes(cv.type) && S.curveEnds(cv).includes(pid));
  return us.length >= 1 ? us[us.length - 1][0] : null;
}

function polyVerts(c, v, n, mode) {
  let R = len(sub(v, c));
  let a0 = Math.atan2(v[1] - c[1], v[0] - c[0]);
  if (mode === "circumscribed") { R = R / Math.cos(Math.PI / n); a0 += Math.PI / n; }
  const out = [];
  for (let i = 0; i < n; i++) { const a = a0 + (i * TAU) / n; out.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]); }
  return out;
}
function sidesOf(T) { return T.n && T.n.ok ? Math.round(T.n.value) : ST.polySides; }

function polygonDef(mode) {
  const label = mode === "circumscribed" ? "Circumscribed Polygon" : "Inscribed Polygon";
  return {
    clicks: 2,
    undo: label,
    prompts: ["Place center point", "Place point on polygon"],
    hud: (stage) => (stage === 1 ? [hudLen("d", "Diameter"), { id: "n", kind: "count", label: "Number of edges" }] : null),
    geom(stage, P, cur, T) {
      if (stage === 0) return { points: [cur.uv] };
      const c = P[0].uv;
      const n = sidesOf(T);
      let v = cur.uv;
      let typed = false;
      if (T.d && T.d.ok) { v = add(c, mul(unit(sub(v, c)), T.d.value / 2)); typed = true; }
      const r = len(sub(v, c));
      const vs = polyVerts(c, v, n, mode);
      return { point: v, typedPoint: typed, n, polys: [[...vs, vs[0]]], consPolys: [circlePoly(c, r)], invalid: r < 1e-6, hud: { d: { value: 2 * r, at: add(c, mul(unit(sub(v, c)), r)), off: [0, -24] }, n: { value: n, at: c, off: [0, 26] } } };
    },
    commit(sk, P, T, g, doc) {
      const S = ST.app.S;
      const n = g.n || ST.polySides;
      ST.polySides = n;
      const ic = rp(sk, P[0]);
      const res = S.addPolygon(sk, P[0].uv, g.point, n, mode, ic);
      if (cons()) for (const l of res.lines) sk.curves[l].cons = true;
      if (T.d && T.d.ok) addDim(sk, doc, "diameter", [res.circle], T.d.expr, {});
      return res;
    },
  };
}
const POLY_DEFS = {
  ShapePolygonCircumscribed: polygonDef("circumscribed"),
  ShapePolygonInscribed: polygonDef("inscribed"),
  ShapePolygonEdge: {
    clicks: 3,
    undo: "Edge Polygon",
    prompts: ["Place first point", "Place second point", "Specify the side of the polygon"],
    hud: (stage) => (stage >= 1 ? [{ id: "n", kind: "count", label: "Number of edges" }] : null),
    geom(stage, P, cur, T) {
      if (stage === 0) return { points: [cur.uv] };
      const n = sidesOf(T);
      const a = P[0].uv;
      if (stage === 1) return { lines: [[a, cur.uv]], n, hud: { n: { value: n, at: mid(a, cur.uv), off: [0, 24] } } };
      const b = P[1].uv;
      const L = len(sub(b, a));
      const u = unit(sub(b, a)), nn = perp(u);
      const side = Math.sign(dot(sub(cur.uv, a), nn)) || 1;
      const ap = L / (2 * Math.tan(Math.PI / n));
      const c = add(mid(a, b), mul(nn, side * ap));
      const vs = polyVerts(c, a, n, "inscribed");
      return { n, c, polys: [[...vs, vs[0]]], hud: { n: { value: n, at: c, off: [0, 0] } } };
    },
    commit(sk, P, T, g) {
      const S = ST.app.S;
      const n = g.n || ST.polySides;
      ST.polySides = n;
      const res = S.addPolygon(sk, g.c, P[0].uv, n, "inscribed");
      if (cons()) for (const l of res.lines) sk.curves[l].cons = true;
      return res;
    },
  },
};

function slotDef(kind) {
  const labels = { cc: "Center to Center Slot", overall: "Overall Slot", cp: "Center Point Slot" };
  const prompts = {
    cc: ["Select start center point", "Select end center point", "Select point on slot"],
    overall: ["Select start point", "Select end point", "Select point on slot"],
    cp: ["Select center", "Select second point", "Select point on slot"],
  };
  const centers = (a, b, w) => {
    if (kind === "cc") return [a, b];
    if (kind === "cp") return [sub(mul(a, 2), b), b];
    const u = unit(sub(b, a));
    return [add(a, mul(u, w / 2)), sub(b, mul(u, w / 2))];
  };
  return {
    clicks: 3,
    undo: labels[kind],
    prompts: prompts[kind],
    hud: (stage) => (stage === 1 ? [hudLen("l", "Length")] : stage === 2 ? [hudLen("w", "Width")] : null),
    geom(stage, P, cur, T) {
      if (stage === 0) return { points: [cur.uv] };
      const a = P[0].uv;
      if (stage === 1) {
        let b = cur.uv;
        let typed = false;
        if (T.l && T.l.ok) { b = add(a, mul(unit(sub(b, a)), kind === "cp" ? T.l.value / 2 : T.l.value)); typed = true; }
        const shown = kind === "cp" ? 2 * len(sub(b, a)) : len(sub(b, a));
        return { point: b, typedPoint: typed, cons: [[kind === "cp" ? sub(mul(a, 2), b) : a, b]], invalid: len(sub(b, a)) < 1e-6, hud: { l: { value: shown, at: mid(a, b), off: [0, -22] } } };
      }
      const b = P[1].uv;
      const u = unit(sub(b, a)), nn = perp(u);
      let w = 2 * Math.abs(dot(sub(cur.uv, kind === "cp" ? a : a), nn));
      let typed = false;
      if (T.w && T.w.ok) { w = T.w.value; typed = true; }
      const [c1, c2] = centers(a, b, w);
      if (w < 1e-6 || (kind === "overall" && len(sub(b, a)) <= w)) return { invalid: true, cons: [[a, b]] };
      const r = w / 2;
      const ang = Math.atan2(c2[1] - c1[1], c2[0] - c1[0]);
      const outline = [...arcPoly(c2, r, ang - Math.PI / 2, Math.PI, 24), ...arcPoly(c1, r, ang + Math.PI / 2, Math.PI, 24)];
      outline.push(outline[0]);
      return { point: add(c2, mul(nn, r)), typedPoint: typed, w, c1, c2, polys: [outline], cons: [[c1, c2]], hud: { w: { value: w, at: add(mid(c1, c2), mul(nn, r)), off: [0, -20] } } };
    },
    commit(sk, P, T, g, doc, tool) {
      const S = ST.app.S;
      const res = S.addSlot(sk, g.c1, g.c2, g.w);
      if (cons()) for (const id of [...res.lines, ...res.arcs]) sk.curves[id].cons = true;
      if (kind === "cp") {
        const ic = rp(sk, P[0]);
        S.addConstraint(sk, "midpoint", [ic, res.axis]);
      } else if (P[0].snap && P[0].snap.pointId && kind === "cc") {
        S.addConstraint(sk, "coincident", [res.centers[0], P[0].snap.pointId]);
      }
      if (T.w && T.w.ok) {
        const l2 = sk.curves[res.lines[1]];
        addDim(sk, doc, "pointLine", [l2.p1, res.lines[0]], T.w.expr, {});
      }
      const T1 = tool.typedAt && tool.typedAt[1];
      if (T1 && T1.l && T1.l.ok && kind === "cc") addDim(sk, doc, "distance", [res.centers[0], res.centers[1]], T1.l.expr, { dimType: "aligned" });
      return res;
    },
  };
}
const SLOT_DEFS = {
  ShapeSlotCenterToCenter: slotDef("cc"),
  ShapeSlotOverall: slotDef("overall"),
  ShapeSlotCenterPoint: slotDef("cp"),
};

const POINT_DEF = {
  DrawPoint: {
    clicks: 1,
    undo: "Point",
    prompts: ["Place point"],
    geom(stage, P, cur) { return { points: [cur.uv] }; },
    commit(sk, P) {
      const S = ST.app.S;
      const sn = P[0].snap;
      if (sn && sn.pointId && sk.points[sn.pointId]) {
        if (Object.values(sk.curves).some((cv) => cv.type === "point" && cv.p === sn.pointId)) return null;
        return S.addSketchPoint(sk, sn.pointId);
      }
      const pid = rp(sk, P[0]);
      return S.addSketchPoint(sk, pid);
    },
  },
};

/** Midpoint Line: the first click is the midpoint, the second an end; within 2 degrees it is kept horizontal / vertical. */
const MIDLINE_DEF = {
  SketchMidpointLine: {
    clicks: 2,
    undo: "Midpoint Line",
    prompts: ["Place midpoint", "Place end point"],
    hud: (stage) => (stage === 1 ? [hudLen("len", "Length")] : null),
    geom(stage, P, cur, T) {
      if (stage === 0) return { points: [cur.uv] };
      const m = P[0].uv;
      let v = sub(cur.uv, m);
      let half = len(v);
      let dir = half > 1e-12 ? mul(v, 1 / half) : [1, 0];
      let hv = null;
      const ang = ((Math.atan2(dir[1], dir[0]) / D2R) % 180 + 180) % 180;
      if (!cur.pointId && (ang < 2 || ang > 178)) { hv = "horizontal"; dir = [Math.sign(dir[0]) || 1, 0]; half = Math.abs(v[0]); }
      else if (!cur.pointId && Math.abs(ang - 90) < 2) { hv = "vertical"; dir = [0, Math.sign(dir[1]) || 1]; half = Math.abs(v[1]); }
      let typed = false;
      if (T.len && T.len.ok) { half = T.len.value / 2; typed = true; }
      const e = add(m, mul(dir, half)), s = sub(m, mul(dir, half));
      const n = perp(dir);
      return { point: e, typedPoint: typed || !!hv, hv, s, e, glyph: hv, lines: [[s, e]], invalid: half < 1e-6, hudDims: [{ kind: "linear", id: "len", value: 2 * half, A: s, B: e, n: n[1] < 0 ? mul(n, -1) : n, off: 30 }, { kind: "cross", at: m, size: 6 }] };
    },
    commit(sk, P, T, g, doc) {
      const S = ST.app.S;
      // the midpoint: an existing point it snapped to, else a new sketch point (a bare point that no
      // curve uses would be dropped as an orphan by later edits, taking the midpoint constraint with it)
      const sn = P[0].snap;
      let im;
      if (sn && sn.pointId && sk.points[sn.pointId]) im = sn.pointId;
      else { im = rp(sk, P[0]); S.addSketchPoint(sk, im); }
      const is = S.addPoint(sk, g.s[0], g.s[1]);
      const ie = P[1].snap && !g.typedPoint ? rp(sk, P[1]) : S.addPoint(sk, g.e[0], g.e[1]);
      const id = S.addLine(sk, is, ie, cons());
      S.addConstraint(sk, "midpoint", [im, id]);
      if (g.hv) S.addConstraint(sk, g.hv, [id]);
      if (T.len && T.len.ok) {
        const n = perp(unit(sub(g.e, g.s)));
        addDim(sk, doc, "distance", [id], T.len.expr, { dimType: "aligned", at: mul(n[1] < 0 ? mul(n, -1) : n, 30 * pxToMm(g.e)) });
      }
      return id;
    },
  },
};

export const SEQ_DEFS = { ...RECT_DEFS, ...CIRCLE_DEFS, ...ARC_DEFS, ...POLY_DEFS, ...SLOT_DEFS, ...POINT_DEF, ...MIDLINE_DEF };

/** SeqTool that remembers typed values of earlier stages (tool.typedAt[stage]). */
class SeqToolMem extends SeqTool {
  place() {
    const stage = this.P.length;
    this.typedAt = this.typedAt || {};
    this.typedAt[stage] = this.typed();
    super.place();
    if (this.P.length === 0) this.typedAt = {};
  }
}

export function makeSeqTool(id, label) {
  const def = SEQ_DEFS[id];
  return def ? new SeqToolMem(id, label, def) : null;
}

// ---------------------------------------------------------------------------
// Line (DrawPolyline): chained lines, click-drag from the last point for a tangent arc,
// close on the start point, auto horizontal/vertical, length + angle boxes.
// ---------------------------------------------------------------------------
export class LineTool extends Tool {
  constructor() { super("DrawPolyline", "Line"); this.chain = null; this.start0 = null; this.arc = null; this.steps = []; this.redoSteps = []; this.autoDims = new Set(); }
  prompt() { return this.chain || this.start0 ? "Specify next point" : "Specify first point"; }
  reset() { this.chain = null; this.start0 = null; this.arc = null; this.armed = false; HUD.hudHide(); clearToolPreview(); clearHudDims(); setSnapMark(null); this.refreshPrompt(); }
  /** Drawing state before / after a committed segment (restored by Ctrl+Z / Ctrl+Y). */
  snapshot() { return { chain: this.chain ? { ...this.chain } : null, start0: this.start0 }; }
  recordStep(label, before) {
    this.steps.push({ label, before, after: this.snapshot(), depth: ST.app.history.undoStack.length });
    this.redoSteps = [];
  }
  restoreState(s) {
    this.chain = s.chain ? { ...s.chain } : null;
    this.start0 = s.start0 || null;
    this.arc = false;
    this.armed = false;
    if (this.chain || this.start0) this.showHud();
    else { HUD.hudHide(); clearHudDims(); clearToolPreview(); }
    this.refreshPrompt();
    this.refresh();
  }
  /** Fusion: Ctrl+Z during Line removes the last segment and keeps drawing from its start; Ctrl+Y puts it back. */
  historyStep(kind) {
    const H = ST.app.history;
    const lastLabel = (st) => (st.length ? st[st.length - 1].label : null);
    if (kind === "undo") {
      const top = this.steps[this.steps.length - 1];
      const own = !!top && H.undoStack.length === top.depth && lastLabel(H.undoStack) === top.label;
      runHistory("undo");
      if (ST.tool !== this) return;
      if (own && H.undoStack.length === top.depth - 1) { this.steps.pop(); this.redoSteps.push(top); this.restoreState(top.before); }
      else { this.steps = []; this.redoSteps = []; }
    } else {
      const top = this.redoSteps[this.redoSteps.length - 1];
      const own = !!top && H.undoStack.length === top.depth - 1 && lastLabel(H.redoStack) === top.label;
      runHistory("redo");
      if (ST.tool !== this) return;
      if (own && H.undoStack.length === top.depth) { this.redoSteps.pop(); this.steps.push(top); this.restoreState(top.after); }
      else { this.steps = []; this.redoSteps = []; }
    }
  }
  data() { return activeData(); }
  fromPoint() {
    const d = this.data();
    if (this.chain && d && d.sk.points[this.chain.last]) { const P = d.sk.points[this.chain.last]; return [P.x, P.y]; }
    if (this.start0) return this.start0.uv;
    return null;
  }
  prevDir() {
    const d = this.data();
    if (!this.chain || !this.chain.lastCurve || !d || !d.sk.curves[this.chain.lastCurve]) return null;
    return ST.app.S.tangentAt(d.sk, this.chain.lastCurve, this.chain.last);
  }
  showHud() {
    HUD.hudShow([{ id: "len", kind: "length", label: "Length" }, { id: "ang", kind: "angle", label: "Angle" }], { onEnter: () => this.enter(), onChange: () => this.refresh() });
  }
  down(ctx) {
    const F = this.fromPoint();
    this.armed = false;
    if (F && this.chain && this.chain.lastCurve) {
      const d = this.data();
      const s = projector(d.plane)(F[0], F[1]);
      if (Math.hypot(s[0] - ctx.x, s[1] - ctx.y) <= 9) this.armed = true;
    }
  }
  compute(ctx, ev) {
    const d = this.data();
    if (!d) return null;
    const F = this.fromPoint();
    const ex = new Set();
    const snap = this.snap(ctx, { alignFrom: [] , exclude: ex });
    if (!snap) return null;
    if (!F) return { snap, E: snap.uv };
    const T = HUD.hudValues();
    const pressed = ev && (ev.buttons & 1) === 1;
    if (this.armed && pressed && this.downAt && Math.hypot(ctx.x - this.downAt.x, ctx.y - this.downAt.y) > 6) this.arc = true;
    if (this.arc) {
      const t = this.prevDir();
      const A = t && ST.app.S.tangentArc(F, t, snap.uv);
      return { snap, F, E: snap.uv, arc: A, T };
    }
    let E = snap.uv.slice();
    let dir = sub(E, F);
    let L = len(dir);
    dir = L > 1e-12 ? mul(dir, 1 / L) : [1, 0];
    const prev = this.prevDir();
    const angTyped = !!(T.ang && T.ang.ok), lenTyped = !!(T.len && T.len.ok);
    if (angTyped) {
      const th = T.ang.value * D2R;
      if (prev) {
        const back = mul(prev, -1);
        const c1 = rot(back, th), c2 = rot(back, -th);
        dir = dot(c1, dir) >= dot(c2, dir) ? c1 : c2;
      } else {
        // angle from the horizontal, on the side of the cursor
        const sx = dir[0] < -1e-12 ? -1 : 1, sy = dir[1] < -1e-12 ? -1 : 1;
        dir = [sx * Math.cos(th), sy * Math.sin(th)];
      }
    }
    if (lenTyped) L = T.len.value;
    const typed = angTyped || lenTyped;
    let hv = null, inf = null;
    // direction inferences apply while the direction is free (a typed length keeps them)
    const free = !angTyped && !snap.pointId && snap.kind !== "oncurve" && snap.kind !== "midpoint" && !ctx.ctrl && L > 1e-9;
    const pc = free && prev && this.chain ? d.sk.curves[this.chain.lastCurve] : null;
    // 1) tangent when continuing from an arc
    if (pc && pc.type === "arc" && dot(dir, prev) > Math.cos(3 * D2R)) {
      inf = "tangent"; dir = prev.slice(); if (!lenTyped) L = Math.abs(dot(sub(E, F), dir)); E = add(F, mul(dir, L));
    }
    // 2) horizontal / vertical: within 3 degrees, or within a few screen pixels of the axis through the start
    if (free && !inf) {
      const proj = projector(d.plane);
      const sF = proj(F[0], F[1]);
      const sH = proj(F[0] + dir[0] * Math.max(L, 1e-6), F[1]);
      const sV = proj(F[0], F[1] + dir[1] * Math.max(L, 1e-6));
      const sE = proj(F[0] + dir[0] * L, F[1] + dir[1] * L);
      const pxLen = Math.hypot(sE[0] - sF[0], sE[1] - sF[1]);
      const offH = Math.hypot(sE[0] - sH[0], sE[1] - sH[1]), offV = Math.hypot(sE[0] - sV[0], sE[1] - sV[1]);
      const ang = Math.atan2(dir[1], dir[0]) / D2R;
      const m = ((ang % 180) + 180) % 180;
      const nearH = m < 3 || m > 177 || (pxLen > 12 && offH <= 6 && Math.abs(dir[0]) > 0.7);
      const nearV = Math.abs(m - 90) < 3 || (pxLen > 12 && offV <= 6 && Math.abs(dir[1]) > 0.7);
      if (nearH && (!nearV || offH <= offV)) { hv = "horizontal"; dir = [Math.sign(dir[0]) || 1, 0]; }
      else if (nearV) { hv = "vertical"; dir = [0, Math.sign(dir[1]) || 1]; }
      if (hv) {
        if (!lenTyped) L = Math.abs(dot(sub(E, F), dir));
        E = add(F, mul(dir, L));
      }
    }
    // 3) perpendicular to the previous line
    if (pc && !inf && !hv && pc.type === "line" && Math.abs(dot(dir, prev)) < Math.sin(3 * D2R)) {
      const pp = perp(prev);
      inf = "perpendicular"; dir = dot(pp, dir) >= 0 ? pp : mul(pp, -1); if (!lenTyped) L = Math.abs(dot(sub(E, F), dir)); E = add(F, mul(dir, L));
    }
    if (typed) E = add(F, mul(dir, L));
    // angle shown: interior angle to the previous segment, else the angle to the horizontal (0..90)
    let angShown, ref;
    if (prev) {
      const back = mul(prev, -1);
      angShown = Math.acos(Math.max(-1, Math.min(1, dot(back, dir)))) / D2R;
      ref = back;
    } else {
      ref = [dir[0] < -1e-9 ? -1 : 1, 0];
      angShown = Math.acos(Math.max(-1, Math.min(1, Math.abs(dir[0])))) / D2R;
    }
    return { snap, F, E, L, dir, hv, inf, typed, T, angShown, ref };
  }
  move(ctx, ev) {
    const r = this.compute(ctx, ev);
    if (!r) return;
    this.lastR = r;
    const { snap } = r;
    if (!r.F) {
      setSnapMark({ at: snap.uv, kind: snap.kind, align: snap.align });
      setToolPreview({ points: [snap.uv] });
      clearHudDims();
      this.hover(snap);
      return;
    }
    if (this.arc) {
      HUD.hudHideField("len"); HUD.hudHideField("ang");
      clearHudDims();
      setSnapMark({ at: snap.uv, kind: snap.kind || "tangent", align: snap.align });
      setToolPreview(r.arc ? { polys: [arcFromTo(r.arc.c, r.F, r.E, r.arc.ccw)], points: [r.F, r.E] } : { lines: [[r.F, r.E]] });
      this.hover(snap);
      return;
    }
    setSnapMark({ at: r.typed ? null : r.E, kind: r.typed ? null : r.hv || r.inf || snap.kind, align: r.typed || r.hv || r.inf ? [] : snap.align });
    setToolPreview({ lines: [[r.F, r.E]], points: [r.F, r.E] });
    this.hover(r.typed ? null : snap);
    if (HUD.hudOpen()) {
      // length: an aligned dimension on the upper side of the line; angle: an arc at the start point
      const d = this.data();
      const proj = projector(d.plane);
      let n = perp(r.dir);
      const s0 = proj(r.F[0], r.F[1]), s1 = proj(r.F[0] + n[0], r.F[1] + n[1]);
      if (s1[1] - s0[1] > 1e-9 || (Math.abs(s1[1] - s0[1]) <= 1e-9 && s1[0] > s0[0])) n = mul(n, -1);
      this.hudN = n;
      const dims = [{ kind: "linear", id: "len", value: r.L, A: r.F, B: r.E, n, off: 30 }];
      dims.push({ kind: "angle", id: "ang", value: r.angShown, C: r.F, d0: r.ref, d1: r.dir, r: 40, reference: !this.prevDir() });
      setHudDims(dims);
    }
  }
  hover(snap) {
    ST.app.selection.setHover(snap && snap.pointId ? { kind: "sketchPoint", sketch: ST.sketchId, point: snap.pointId } : snap && snap.curveId ? { kind: "sketchCurve", sketch: ST.sketchId, curve: snap.curveId } : null);
  }
  click(ctx, info) {
    const wasArc = this.arc;
    this.arc = false;
    const armed = this.armed;
    this.armed = false;
    const r = this.compute(ctx, null);
    if (!r) return;
    if (!r.F) {
      this.start0 = { uv: r.snap.uv, snap: r.snap };
      this.showHud();
      this.refreshPrompt();
      this.move(ctx, null);
      return;
    }
    if (wasArc && armed && info.dragged) {
      const t = this.prevDir();
      const A = t && ST.app.S.tangentArc(r.F, t, r.snap.uv);
      if (A) this.commitArc(r, A);
      this.move(ctx, null);
      return;
    }
    if (len(sub(r.E, r.F)) < 1e-9) return;
    this.commitLine(r);
    this.move(ctx, null);
  }
  commitLine(r) {
    const S = ST.app.S;
    const self = this;
    const before = this.snapshot();
    let closed = false;
    const res = mutateSketch("Line", (sk, f, doc) => {
      const placed = [];
      const a = self.chain ? self.chain.last : rp(sk, self.start0);
      const endSnap = r.typed ? null : r.snap;
      let b;
      if (endSnap && endSnap.pointId && sk.points[endSnap.pointId]) b = endSnap.pointId;
      else b = rp(sk, { uv: r.E, snap: endSnap });
      if (a === b) return null;
      const id = S.addLine(sk, a, b, cons());
      if (r.hv) S.addConstraint(sk, r.hv, [id]);
      if (r.inf && self.chain && sk.curves[self.chain.lastCurve]) S.addConstraint(sk, r.inf, [self.chain.lastCurve, id]);
      if (r.T.len && r.T.len.ok) {
        const ps = pxToMm(r.E);
        // the dimension stays where the HUD showed it (30 px on the upper side of the line)
        const side = self.hudN && Math.abs(dot(self.hudN, r.dir)) < 1e-6 ? self.hudN : perp(r.dir);
        placed.push({ c: addDim(sk, doc, "distance", [id], r.T.len.expr, { dimType: "aligned", at: mul(side, 30 * ps) }), side });
      }
      if (r.T.ang && r.T.ang.ok) {
        const prevId = self.chain && self.chain.lastCurve;
        const pv = prevId && sk.curves[prevId];
        if (pv && pv.type === "line") placed.push({ c: addDim(sk, doc, "angle", [prevId, id], r.T.ang.expr, { flip1: pv.p2 === a, flip2: false }) });
        else {
          const th = ((r.T.ang.value % 360) + 360) % 360;
          if (Math.abs(th % 180) < 1e-6) S.addConstraint(sk, "horizontal", [id]);
          else if (Math.abs((th % 180) - 90) < 1e-6) S.addConstraint(sk, "vertical", [id]);
          else if (r.T.ang.value > 0 && r.T.ang.value < 180) {
            // first segment: the typed angle becomes an angular dimension to the sketch X axis (one-ref
            // angle), measured from the horizontal on the side the HUD showed it
            const cx = Math.max(-1, Math.min(1, r.dir[0]));
            const tv = Math.abs(r.T.ang.value);
            const toPlusX = Math.abs(Math.acos(cx) / D2R - tv) <= Math.abs(Math.acos(-cx) / D2R - tv);
            placed.push({ c: addDim(sk, doc, "angle", [id], r.T.ang.expr, { flip1: false, flip2: !toPlusX }) });
          }
        }
      }
      self.arrange(sk, placed);
      const first = self.chain ? self.chain.first : a;
      closed = b === first;
      return { a, b, id, first };
    });
    if (!res) return;
    if (closed) { this.chain = null; this.start0 = null; HUD.hudHide(); clearHudDims(); this.refreshPrompt(); }
    else {
      this.chain = { first: res.first, last: res.b, lastCurve: res.id };
      this.start0 = null;
      this.showHud();
    }
    this.recordStep("Line", before);
  }
  /** Space out the labels of the dimensions this tool typed (new ones, and earlier ones a new segment now covers). */
  arrange(sk, placed) {
    const d = this.data();
    if (!d) return;
    const items = [...placed];
    for (const cid of this.autoDims) {
      if (placed.some((it) => it.c.id === cid)) continue;
      const c = sk.constraints.find((x) => x.id === cid);
      if (c) items.push({ c, keep: true });
    }
    try { arrangeDims(sk, d.plane, items); } catch (e) { console.error(e); }
    for (const it of placed) this.autoDims.add(it.c.id);
  }
  commitArc(r, A) {
    const S = ST.app.S;
    const self = this;
    const before = this.snapshot();
    let closed = false;
    const res = mutateSketch("Arc", (sk) => {
      const a = self.chain.last;
      const endSnap = r.snap;
      const b = endSnap && endSnap.pointId && sk.points[endSnap.pointId] ? endSnap.pointId : rp(sk, { uv: r.snap.uv, snap: endSnap });
      if (a === b) return null;
      const c = S.addPoint(sk, A.c[0], A.c[1]);
      const id = S.addArcDir(sk, c, a, b, A.ccw, cons());
      sk.curves[id].r = A.r;
      if (sk.curves[self.chain.lastCurve]) S.addConstraint(sk, "tangent", [self.chain.lastCurve, id]);
      closed = b === self.chain.first;
      return { b, id };
    });
    if (!res) return;
    if (closed) { this.chain = null; HUD.hudHide(); clearHudDims(); this.refreshPrompt(); }
    else {
      this.chain = { first: this.chain.first, last: res.b, lastCurve: res.id };
      this.showHud();
    }
    this.recordStep("Arc", before);
  }
  enter() {
    const vals = HUD.hudValues();
    if ((vals.len && vals.len.ok) || (vals.ang && vals.ang.ok)) {
      const r = this.compute(this.lastCtx || { x: 0, y: 0 }, null);
      if (r && r.F && len(sub(r.E, r.F)) > 1e-9) { this.commitLine(r); this.refresh(); }
      return;
    }
    this.reset();
  }
  key(ev) {
    if (ev.key === "Enter") { this.enter(); return true; }
    return false;
  }
  dbl() { this.reset(); }
}

/** Create the tool object for a command id. */
export function makeDrawTool(id, label) {
  if (id === "DrawPolyline") return new LineTool();
  return makeSeqTool(id, label);
}
