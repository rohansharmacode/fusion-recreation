// Round-7 sketch drawing tools: 2-Tangent Circle, 3-Tangent Circle, Conic Curve, Three Point Arc
// Slot, Center Point Arc Slot, Control Point Spline and Break.
import { ST, vp, activeData, mutateSketch, projector, cursorOnPlane, setOpt } from "./ctx.js";
import { Tool, SeqTool, rp, addDim, runHistory, endTool, circlePoly, arcPoly } from "./tools.js";
import * as HUD from "./hud.js";
import { setToolPreview, clearToolPreview, setSnapMark, clearHudDims } from "./render.js";
import { showLive as showLiveSketch, endLive as endLiveSketch } from "./dlgutil.js";

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const cons = () => !!ST.opts.construction;
const curveRef = (r) => !!r && r.kind === "sketchCurve" && r.sketch === ST.sketchId;
const isLineRef = (r) => { const d = activeData(); return curveRef(r) && d && d.sk.curves[r.curve] && d.sk.curves[r.curve].type === "line"; };

/** SeqTool that remembers what was typed at each stage (tool.typedAt[stage]). */
class SeqMem extends SeqTool {
  place() {
    const stage = this.P.length;
    this.typedAt = this.typedAt || {};
    this.typedAt[stage] = this.typed();
    super.place();
    if (this.P.length === 0) this.typedAt = {};
  }
}

// ---------------------------------------------------------------------------
// 2-Tangent Circle: two lines, then the radius (typed) and a click that picks the quadrant
// ---------------------------------------------------------------------------
export class TanTanCircleTool extends Tool {
  constructor() { super("CircleTanTanRadius", "2-Tangent Circle"); this.lines = []; }
  prompt() { return this.lines.length === 0 ? "Select first line" : this.lines.length === 1 ? "Select second line" : "Specify radius of circle"; }
  reset() { this.lines = []; HUD.hudHide(); clearToolPreview(); ST.app.selection.clear(); this.refreshPrompt(); }
  compute(ctx) {
    const d = activeData();
    const hit = cursorOnPlane(ctx.x, ctx.y, d.plane);
    if (!hit) return null;
    const S = ST.app.S;
    const T = HUD.hudValues();
    const q = hit.uv;
    if (T.r && T.r.ok) {
      const c = S.circleTanTan(d.sk, this.lines[0], this.lines[1], T.r.value, q);
      return { ...c, typed: true, T };
    }
    // radius from the cursor: the circle through the cursor's quadrant, sized by its distance to the lines
    const L = this.lines.map((id) => { const cv = d.sk.curves[id]; const a = [d.sk.points[cv.p1].x, d.sk.points[cv.p1].y], b = [d.sk.points[cv.p2].x, d.sk.points[cv.p2].y]; const u = unit(sub(b, a)); return { a, n: [-u[1], u[0]] }; });
    const d1 = Math.abs(dot(sub(q, L[0].a), L[0].n)), d2 = Math.abs(dot(sub(q, L[1].a), L[1].n));
    const r = Math.max(1e-3, Math.min(d1, d2));
    const c = S.circleTanTan(d.sk, this.lines[0], this.lines[1], r, q);
    return { ...c, typed: false, T };
  }
  move(ctx) {
    if (this.lines.length < 2) {
      const h = vp().pick(ctx.x, ctx.y, { filter: isLineRef });
      ST.app.selection.setHover(h ? h.ref : null);
      return;
    }
    const r = this.compute(ctx);
    if (!r) return;
    setToolPreview({ polys: [circlePoly(r.c, r.r)], points: [r.c] });
    const d = activeData();
    const s = projector(d.plane)(r.c[0] + r.r, r.c[1]);
    HUD.hudSet("r", r.r, [s[0] + 12, s[1] - 24]);
  }
  click(ctx) {
    if (this.lines.length < 2) {
      const h = vp().pick(ctx.x, ctx.y, { filter: isLineRef });
      if (!h) return;
      if (this.lines.includes(h.ref.curve)) return;
      this.lines.push(h.ref.curve);
      ST.app.selection.set(this.lines.map((id) => ({ kind: "sketchCurve", sketch: ST.sketchId, curve: id })));
      if (this.lines.length === 2) HUD.hudShow([{ id: "r", kind: "length", label: "Radius" }], { onEnter: () => this.commit(this.lastCtx), onChange: () => this.refresh() });
      this.refreshPrompt();
      return;
    }
    this.commit(ctx);
  }
  commit(ctx) {
    if (!ctx || this.lines.length < 2) return;
    const r = this.compute(ctx);
    if (!r || !(r.r > 1e-9)) return;
    const [l1, l2] = this.lines;
    const S = ST.app.S;
    try {
      mutateSketch("2-Tangent Circle", (sk, f, doc) => {
        const ic = S.addPoint(sk, r.c[0], r.c[1]);
        const id = S.addCircle(sk, ic, r.r, cons());
        S.addConstraint(sk, "tangent", [l1, id]);
        S.addConstraint(sk, "tangent", [l2, id]);
        if (r.typed && !r.parallel) addDim(sk, doc, "radius", [id], r.T.r.expr, {});
        return id;
      });
    } catch (e) { ST.app.toast(`2-Tangent Circle: ${e.message || e}`, "error"); }
    // like Fusion: the next circle starts again with the line picks
    this.lines = [];
    HUD.hudHide();
    clearToolPreview();
    ST.app.selection.clear();
    this.refreshPrompt();
  }
  key(ev) { if (ev.key === "Enter") { if (this.lines.length === 2) this.commit(this.lastCtx); else endTool(); return true; } return false; }
  escape() { if (this.lines.length) { this.reset(); return; } endTool(); }
}

// ---------------------------------------------------------------------------
// 3-Tangent Circle: three lines; the circle in the region of the third pick
// ---------------------------------------------------------------------------
export class ThreeTanCircleTool extends Tool {
  constructor() { super("CircleThreeTangent", "3-Tangent Circle"); this.lines = []; }
  prompt() { return ["Select first line", "Select second line", "Select third line"][Math.min(2, this.lines.length)]; }
  reset() { this.lines = []; clearToolPreview(); ST.app.selection.clear(); this.refreshPrompt(); }
  move(ctx) {
    const h = vp().pick(ctx.x, ctx.y, { filter: isLineRef });
    ST.app.selection.setHover(h ? h.ref : null);
    if (this.lines.length === 2) {
      const d = activeData();
      const hit = cursorOnPlane(ctx.x, ctx.y, d.plane);
      if (h && !this.lines.includes(h.ref.curve) && hit) {
        const c = ST.app.S.circleThreeTan(d.sk, [...this.lines, h.ref.curve], hit.uv);
        setToolPreview(c ? { polys: [circlePoly(c.c, c.r)], points: [c.c] } : null);
      } else clearToolPreview();
    }
  }
  click(ctx) {
    const h = vp().pick(ctx.x, ctx.y, { filter: isLineRef });
    if (!h || this.lines.includes(h.ref.curve)) return;
    this.lines.push(h.ref.curve);
    ST.app.selection.set(this.lines.map((id) => ({ kind: "sketchCurve", sketch: ST.sketchId, curve: id })));
    if (this.lines.length < 3) { this.refreshPrompt(); return; }
    const d = activeData();
    const hit = cursorOnPlane(ctx.x, ctx.y, d.plane);
    const S = ST.app.S;
    const c = hit && S.circleThreeTan(d.sk, this.lines, hit.uv);
    const ids = this.lines.slice();
    this.lines = [];
    ST.app.selection.clear();
    clearToolPreview();
    this.refreshPrompt();
    if (!c) { ST.app.toast("No circle is tangent to the three selected lines.", "warning", 2400); return; }
    try {
      mutateSketch("3-Tangent Circle", (sk) => {
        const ic = S.addPoint(sk, c.c[0], c.c[1]);
        const id = S.addCircle(sk, ic, c.r, cons());
        for (const l of ids) S.addConstraint(sk, "tangent", [l, id]);
        return id;
      });
    } catch (e) { ST.app.toast(`3-Tangent Circle: ${e.message || e}`, "error"); }
  }
  key(ev) { if (ev.key === "Enter") { endTool(); return true; } return false; }
  escape() { if (this.lines.length) { this.reset(); return; } endTool(); }
}

// ---------------------------------------------------------------------------
// Conic Curve: start point, end point, vertex point; Rho in the heads-up box
// ---------------------------------------------------------------------------
/** Guideline through an end point along the tangent of the curve ending there (for tangent conics). */
function guideAt(sk, pid) {
  if (!pid) return null;
  const S = ST.app.S;
  for (const [id, cv] of Object.entries(sk.curves)) {
    if (cv.cons && cv.type !== "line") continue;
    if (!S.curveEnds(cv).includes(pid)) continue;
    const t = S.tangentAt(sk, id, pid);
    if (t) return { curve: id, o: [sk.points[pid].x, sk.points[pid].y], t };
  }
  return null;
}

export const CONIC_DEF = {
  clicks: 3,
  undo: "Conic Curve",
  prompts: ["Place first point on conic curve", "Place second point on conic curve", "Place vertex point of conic curve"],
  hud: (stage) => (stage === 2 ? [{ id: "rho", kind: "ratio", label: "Rho" }] : null),
  geom(stage, P, cur, T) {
    const S = ST.app.S;
    if (stage === 0) return { points: [cur.uv] };
    if (stage === 1) return { cons: [[P[0].uv, cur.uv]], invalid: len(sub(cur.uv, P[0].uv)) < 1e-6 };
    const d = activeData();
    const A = P[0].uv, B = P[1].uv;
    let V = cur.uv;
    // snap the vertex onto the tangent guidelines of curves ending at the end points
    const gs = [guideAt(d.sk, P[0].snap && P[0].snap.pointId), guideAt(d.sk, P[1].snap && P[1].snap.pointId)];
    const proj = projector(d.plane);
    const sV = proj(V[0], V[1]);
    const lines = [];
    let onGuide = [false, false];
    gs.forEach((g, i) => {
      if (!g) return;
      const foot = add(g.o, mul(g.t, Math.max(0, dot(sub(V, g.o), g.t))));
      const sf = proj(foot[0], foot[1]);
      if (Math.hypot(sf[0] - sV[0], sf[1] - sV[1]) < 8) { V = foot; onGuide[i] = true; }
      lines.push([g.o, add(g.o, mul(g.t, Math.max(len(sub(B, A)), dot(sub(V, g.o), g.t) * 1.2)))]);
    });
    if (gs[0] && gs[1] && onGuide[0] !== onGuide[1]) {
      // both guidelines: their intersection when near
      const a = gs[0], b = gs[1];
      const den = a.t[0] * b.t[1] - a.t[1] * b.t[0];
      if (Math.abs(den) > 1e-9) {
        const s = ((b.o[0] - a.o[0]) * b.t[1] - (b.o[1] - a.o[1]) * b.t[0]) / den;
        const X = add(a.o, mul(a.t, s));
        const sx = proj(X[0], X[1]);
        if (Math.hypot(sx[0] - sV[0], sx[1] - sV[1]) < 10) { V = X; onGuide = [true, true]; }
      }
    }
    const rho = T.rho && T.rho.ok ? T.rho.value : 0.5;
    const cr = (B[0] - A[0]) * (V[1] - A[1]) - (B[1] - A[1]) * (V[0] - A[0]);
    if (Math.abs(cr) < 1e-9 * Math.max(1, len(sub(B, A)) ** 2)) return { invalid: true, message: "Place the vertex off the line through the end points", cons: [[A, B]] };
    const g = S.conicGeomFrom(A, V, B, rho);
    const poly = [];
    for (let i = 0; i <= 64; i++) poly.push(g.at((g.T * i) / 64));
    const at = g.at(g.T / 2);
    return { point: V, typedPoint: onGuide.some(Boolean), rho, onGuide, guides: gs, polys: [poly], cons: [[A, V], [V, B], ...lines.map(([p, q]) => [p, q])], points: [V], hud: { rho: { value: rho, at, off: [12, -18] } } };
  },
  commit(sk, P, T, g) {
    const S = ST.app.S;
    const a = rp(sk, P[0]), b = rp(sk, P[1]);
    if (a === b) return null;
    const v = S.addPoint(sk, g.point[0], g.point[1]);
    const id = S.addConic(sk, a, b, v, g.rho, cons());
    // vertex on a guideline: the conic stays tangent to that curve
    (g.guides || []).forEach((gd, i) => { if (gd && g.onGuide[i] && sk.curves[gd.curve]) S.addConstraint(sk, "tangent", [gd.curve, id]); });
    return id;
  },
};

// ---------------------------------------------------------------------------
// Arc slots
// ---------------------------------------------------------------------------
function slotOutline(C, R, a0, sweep, w) {
  const r = w / 2;
  let s0 = a0, sw = sweep;
  if (sw < 0) { s0 = a0 + sw; sw = -sw; }
  const dir = (a) => [Math.cos(a), Math.sin(a)];
  const E0 = add(C, mul(dir(s0), R)), E1 = add(C, mul(dir(s0 + sw), R));
  return [
    ...arcPoly(C, R + r, s0, sw, 64),
    ...arcPoly(E1, r, s0 + sw, Math.PI, 16),
    ...arcPoly(C, R - r, s0 + sw, -sw, 64),
    ...arcPoly(E0, r, s0 + Math.PI, Math.PI, 16),
  ].concat([add(C, mul(dir(s0), R + r))]);
}
const slotHud = (stage, first) => (stage === first ? [{ id: "w", kind: "length", label: "Width" }] : null);

export const ARC_SLOT3_DEF = {
  clicks: 4,
  undo: "Three Point Arc Slot",
  prompts: ["Select start center point", "Select end center point", "Select point on arc", "Select point on slot"],
  hud: (stage) => (stage === 1 ? [{ id: "l", kind: "length", label: "Distance" }] : stage === 2 ? [{ id: "r", kind: "length", label: "Radius" }] : slotHud(stage, 3)),
  geom(stage, P, cur, T, tool) {
    const S = ST.app.S;
    if (stage === 0) return { points: [cur.uv] };
    const a = P[0].uv;
    if (stage === 1) {
      let b = cur.uv, typed = false;
      if (T.l && T.l.ok) { b = add(a, mul(unit(sub(b, a)), T.l.value)); typed = true; }
      return { point: b, typedPoint: typed, cons: [[a, b]], invalid: len(sub(b, a)) < 1e-6, hud: { l: { value: len(sub(b, a)), at: mid(a, b), off: [0, -22] } } };
    }
    const b = P[1].uv;
    if (stage === 2) {
      let m = cur.uv, typed = false;
      if (T.r && T.r.ok) {
        const L = len(sub(b, a)) / 2;
        const r = Math.max(T.r.value, L + 1e-9);
        const u = unit(sub(b, a)), n = [-u[1], u[0]];
        const side = Math.sign(dot(sub(cur.uv, a), n)) || 1;
        const hgt = Math.sqrt(Math.max(0, r * r - L * L));
        const big = Math.abs(dot(sub(cur.uv, mid(a, b)), n)) > L;
        const c = add(mid(a, b), mul(n, big ? side * hgt : -side * hgt));
        m = add(c, mul(n, side * r));
        typed = true;
      }
      const arc = S.arcFrom3(a, m, b);
      if (!arc) return { invalid: true, cons: [[a, b]] };
      tool.st.arc = arc;
      const a0 = Math.atan2(a[1] - arc.c[1], a[0] - arc.c[0]), a1 = Math.atan2(b[1] - arc.c[1], b[0] - arc.c[0]);
      let sw = ((a1 - a0) % TAU + TAU) % TAU;
      if (!arc.ccw) sw -= TAU;
      return { point: m, typedPoint: typed, consPolys: [arcPoly(arc.c, arc.r, a0, sw, 64)], points: [a, b], hud: { r: { value: arc.r, at: m, off: [0, -22] } } };
    }
    const arc = tool.st.arc;
    if (!arc) return { invalid: true };
    const a0 = Math.atan2(a[1] - arc.c[1], a[0] - arc.c[0]), a1 = Math.atan2(b[1] - arc.c[1], b[0] - arc.c[0]);
    let sw = ((a1 - a0) % TAU + TAU) % TAU;
    if (!arc.ccw) sw -= TAU;
    let w = 2 * Math.abs(len(sub(cur.uv, arc.c)) - arc.r), typed = false;
    if (T.w && T.w.ok) { w = T.w.value; typed = true; }
    if (!(w > 1e-6) || w / 2 >= arc.r) return { invalid: true, consPolys: [arcPoly(arc.c, arc.r, a0, sw, 64)], message: "The slot is too wide for its arc" };
    return { typedPoint: typed, w, C: arc.c, R: arc.r, a0, sweep: sw, polys: [slotOutline(arc.c, arc.r, a0, sw, w)], consPolys: [arcPoly(arc.c, arc.r, a0, sw, 64)], hud: { w: { value: w, at: cur.uv, off: [14, -20] } } };
  },
  commit(sk, P, T, g, doc, tool) {
    const S = ST.app.S;
    const startId = P[0].snap && P[0].snap.pointId ? rp(sk, P[0]) : null;
    const endId = P[1].snap && P[1].snap.pointId ? rp(sk, P[1]) : null;
    const res = S.addArcSlot(sk, g.C, g.R, g.a0, g.sweep, g.w, { cons: cons(), startId: g.sweep >= 0 ? startId : endId, endId: g.sweep >= 0 ? endId : startId });
    if (!res) throw new Error("The slot does not fit");
    if (T.w && T.w.ok) addDim(sk, doc, "diameter", [res.caps[0]], T.w.expr, {});
    const T2 = tool.typedAt && tool.typedAt[2];
    if (T2 && T2.r && T2.r.ok) addDim(sk, doc, "radius", [res.axis], T2.r.expr, {});
    return res;
  },
};

export const ARC_SLOTC_DEF = {
  clicks: 4,
  undo: "Center Point Arc Slot",
  prompts: ["Select center point", "Select start center point", "Select end center point", "Select point on slot"],
  hud: (stage) => (stage === 1 ? [{ id: "r", kind: "length", label: "Radius" }] : stage === 2 ? [{ id: "a", kind: "angle", label: "Angle" }] : slotHud(stage, 3)),
  geom(stage, P, cur, T, tool) {
    if (stage === 0) return { points: [cur.uv] };
    const C = P[0].uv;
    if (stage === 1) {
      let s = cur.uv, typed = false;
      if (T.r && T.r.ok) { s = add(C, mul(unit(sub(s, C)), T.r.value)); typed = true; }
      const r = len(sub(s, C));
      tool.st.prevAng = null; tool.st.sweep = 0;
      return { point: s, typedPoint: typed, cons: [[C, s]], consPolys: [circlePoly(C, r)], invalid: r < 1e-6, hud: { r: { value: r, at: mid(C, s), off: [0, -20] } } };
    }
    const s = P[1].uv;
    const R = len(sub(s, C));
    const a0 = Math.atan2(s[1] - C[1], s[0] - C[0]);
    if (stage === 2) {
      const ac = Math.atan2(cur.uv[1] - C[1], cur.uv[0] - C[0]);
      if (tool.st.prevAng === null || tool.st.prevAng === undefined) { tool.st.prevAng = a0; tool.st.sweep = 0; }
      let dA = ac - tool.st.prevAng;
      while (dA > Math.PI) dA -= TAU;
      while (dA < -Math.PI) dA += TAU;
      tool.st.sweep += dA;
      tool.st.prevAng = ac;
      let sweep = tool.st.sweep;
      if (Math.abs(sweep) > TAU) sweep = Math.sign(sweep) * (Math.abs(sweep) % TAU);
      let typed = false;
      if (T.a && T.a.ok) { sweep = (Math.sign(sweep) || 1) * Math.min(359, Math.abs(T.a.value)) * D2R; typed = true; }
      if (Math.abs(sweep) < 1e-4) return { invalid: true, cons: [[C, s]] };
      const e = add(C, mul([Math.cos(a0 + sweep), Math.sin(a0 + sweep)], R));
      tool.st.fixedSweep = sweep;
      return { point: e, typedPoint: typed, sweep, consPolys: [arcPoly(C, R, a0, sweep, 64)], cons: [[C, s], [C, e]], hud: { a: { value: Math.abs(sweep) / D2R, at: add(C, mul([Math.cos(a0 + sweep / 2), Math.sin(a0 + sweep / 2)], R * 0.6)), off: [0, 0] } } };
    }
    const sweep = tool.st.fixedSweep || 0;
    let w = 2 * Math.abs(len(sub(cur.uv, C)) - R), typed = false;
    if (T.w && T.w.ok) { w = T.w.value; typed = true; }
    if (!(w > 1e-6) || w / 2 >= R) return { invalid: true, consPolys: [arcPoly(C, R, a0, sweep, 64)], message: "The slot is too wide for its arc" };
    return { typedPoint: typed, w, C, R, a0, sweep, polys: [slotOutline(C, R, a0, sweep, w)], consPolys: [arcPoly(C, R, a0, sweep, 64)], hud: { w: { value: w, at: cur.uv, off: [14, -20] } } };
  },
  commit(sk, P, T, g, doc, tool) {
    const S = ST.app.S;
    const center = P[0].snap && P[0].snap.pointId ? rp(sk, P[0]) : null;
    const res = S.addArcSlot(sk, g.C, g.R, g.a0, g.sweep, g.w, { cons: cons(), center });
    if (!res) throw new Error("The slot does not fit");
    if (T.w && T.w.ok) addDim(sk, doc, "diameter", [res.caps[0]], T.w.expr, {});
    const T1 = tool.typedAt && tool.typedAt[1];
    if (T1 && T1.r && T1.r.ok) addDim(sk, doc, "radius", [res.axis], T1.r.expr, {});
    return res;
  },
};

export const makeConicTool = () => new SeqMem("ConicCurveCmd", "Conic Curve", CONIC_DEF);
export const makeArcSlot3Tool = () => new SeqMem("ShapeArcSlotThreePoint", "Three Point Arc Slot", ARC_SLOT3_DEF);
export const makeArcSlotCTool = () => new SeqMem("ShapeArcSlotCenterTwoPoint", "Center Point Arc Slot", ARC_SLOTC_DEF);

// ---------------------------------------------------------------------------
// Control Point Spline: click control points; Enter / double-click / right-click finishes,
// clicking the first point closes it. Degree from the Sketch Palette (Spline Degree 3 / 5).
// ---------------------------------------------------------------------------
export function splineDegree() { return ST.opts.splineDegree === 5 ? 5 : 3; }
export function setSplineDegree(n) { setOpt("splineDegree", n === 5 ? 5 : 3); }

export class CVSplineTool extends Tool {
  constructor() { super("DrawCVMSpline3D", "Control Point Spline"); this.P = []; this.cur = null; }
  prompt() { return this.P.length ? "Specify next control point" : "Place first point"; }
  begin() { this.P = []; }
  reset() { this.P = []; this.cur = null; clearToolPreview(); setSnapMark(null); this.refreshPrompt(); }
  snapOpts() { return this.P.length >= 2 ? { extra: [{ uv: this.P[0].uv, kind: "point", pointId: this.P[0].snap && this.P[0].snap.pointId }] } : {}; }
  closing(snap) {
    if (this.P.length < 3 || !snap) return false;
    const f = this.P[0];
    if (snap.pointId && f.snap && f.snap.pointId === snap.pointId) return true;
    return len(sub(snap.uv, f.uv)) < 1e-9;
  }
  move(ctx) { const s = this.snap(ctx, this.snapOpts()); if (!s) return; this.cur = s; this.update(); }
  update() {
    const snap = this.cur;
    if (!snap) return;
    const pts = this.P.map((p) => p.uv);
    const closing = this.closing(snap);
    const all = closing ? pts : [...pts, snap.uv];
    const S = ST.app.S;
    const polys = [];
    if (all.length >= 2) {
      const g = S.cvsplineGeomFrom(all, splineDegree(), closing);
      if (g) { const pl = []; const n = Math.max(32, g.T * 16); for (let i = 0; i <= n; i++) pl.push(g.at((g.T * i) / n)); polys.push(pl); }
    }
    const frame = [];
    for (let i = 0; i + 1 < all.length; i++) frame.push([all[i], all[i + 1]]);
    if (closing && all.length > 2) frame.push([all[all.length - 1], all[0]]);
    setSnapMark({ at: snap.uv, kind: snap.kind, align: snap.align });
    setToolPreview({ polys, cons: frame, points: closing ? pts : [...pts, snap.uv] });
  }
  click(ctx) {
    const snap = this.snap(ctx, this.snapOpts());
    if (!snap) return;
    this.cur = snap;
    if (this.closing(snap)) { this.commit(true); return; }
    const last = this.P[this.P.length - 1];
    if (last) {
      const d = activeData();
      const proj = projector(d.plane);
      const a = proj(last.uv[0], last.uv[1]), b = proj(snap.uv[0], snap.uv[1]);
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 3) return;
    }
    this.P.push({ uv: snap.uv.slice(), snap });
    this.refreshPrompt();
    this.update();
  }
  dbl() { if (this.P.length >= 2) this.commit(false); }
  context() { if (this.P.length >= 2) { this.commit(false); return true; } if (this.P.length) { this.reset(); return true; } return false; }
  key(ev) { if (ev.key === "Enter") { if (this.P.length >= 2) this.commit(false); else endTool(); return true; } return false; }
  escape() { if (this.P.length >= 2) this.commit(false); endTool(); }
  historyStep(kind) {
    if (kind === "undo" && this.P.length) { this.P.pop(); this.refreshPrompt(); this.refresh(); if (!this.P.length) clearToolPreview(); return; }
    runHistory(kind);
  }
  commit(closed) {
    const P = this.P.slice();
    this.P = [];
    clearToolPreview();
    this.refreshPrompt();
    if (P.length < (closed ? 3 : 2)) return null;
    const S = ST.app.S;
    let id = null;
    try {
      id = mutateSketch("Control Point Spline", (sk) => {
        const ids = [];
        for (const p of P) { const pid = rp(sk, p); if (ids[ids.length - 1] !== pid) ids.push(pid); }
        if (closed && ids.length > 1 && ids[ids.length - 1] === ids[0]) ids.pop();
        return S.addCVSpline(sk, ids, { degree: splineDegree(), closed, cons: cons() });
      });
    } catch (e) { console.error(e); ST.app.toast(`Control Point Spline: ${e.message || e}`, "error"); }
    this.refresh();
    return id;
  }
}

// ---------------------------------------------------------------------------
// Break: hover shows the piece between the nearest crossings; click splits the curve there
// ---------------------------------------------------------------------------
export class BreakTool extends Tool {
  constructor() { super("BreakSketchCmd", "Break"); }
  prompt() { return "Select curve to break"; }
  target(ctx) {
    const d = activeData();
    const h = vp().pick(ctx.x, ctx.y, { filter: (r) => curveRef(r) && d.sk.curves[r.curve] && !["point", "text", "c3d"].includes(d.sk.curves[r.curve].type) && !d.sk.curves[r.curve].proj });
    if (!h) return null;
    const hit = cursorOnPlane(ctx.x, ctx.y, d.plane);
    if (!hit) return null;
    const n = ST.app.S.nearestOnCurve(d.sk, h.ref.curve, hit.uv);
    return { id: h.ref.curve, q: n ? n.p : hit.uv };
  }
  move(ctx) {
    const d = activeData();
    const t = this.target(ctx);
    if (!t) { setToolPreview(null); ST.app.selection.setHover(null); return; }
    const S = ST.app.S;
    let piece = null;
    try { piece = S.trimPiece(d.sk, t.id, t.q); } catch { piece = null; }
    if (!piece || piece.whole) { setToolPreview(null); ST.app.selection.setHover({ kind: "sketchCurve", sketch: ST.sketchId, curve: t.id }); return; }
    ST.app.selection.setHover(null);
    const g = piece.g;
    let pl;
    if (g.kind === "line") { const at = (u) => [g.a[0] + (g.b[0] - g.a[0]) * u, g.a[1] + (g.b[1] - g.a[1]) * u]; pl = [at(piece.t0), at(piece.t1)]; }
    else if (g.kind === "circle") pl = arcPoly(g.c, g.r, piece.t0, piece.t1 - piece.t0, 64);
    else if (g.kind === "arc") pl = arcPoly(g.c, g.r, g.a0 + piece.t0, piece.t1 - piece.t0, 64);
    else { pl = []; const n = 48; for (let i = 0; i <= n; i++) pl.push(g.at(piece.t0 + ((piece.t1 - piece.t0) * i) / n)); }
    setToolPreview({ hi: [pl] });
  }
  click(ctx) {
    const t = this.target(ctx);
    if (!t) return;
    const S = ST.app.S;
    let ok = false;
    try {
      mutateSketch("Break", (sk) => {
        const ids = S.breakAt(S, sk, t.id, t.q);
        if (!ids) throw new Error("nothing");
        S.removeEntities(sk, []);
        ok = true;
        return ids;
      });
    } catch (e) { if (!ok && e.message === "nothing") ST.app.toast("The curve does not cross other curves here.", "info", 2000); else if (!ok) ST.app.toast(`Break: ${e.message || e}`, "error"); }
    this.move(ctx);
  }
  key(ev) { if (ev.key === "Enter") { endTool(); return true; } return false; }
}

export { clearHudDims };

// ---------------------------------------------------------------------------
// Edit Conic Curve (double-click a conic): Rho
// ---------------------------------------------------------------------------
export function openEditConic(id) {
  const A = ST.app;
  const f = A.feature(ST.sketchId);
  const cv0 = f && f.sk.curves[id];
  if (!cv0 || cv0.type !== "conic") return null;
  const live = (rho) => {
    const w = A.S.cloneSketch(f.sk);
    w.curves[id].rho = rho;
    showLiveSketch(w);
  };
  return A.ui.dialog.open({
    id: "ConicCurveCmd",
    title: "Edit Conic Curve",
    icon: "ConicCurveCmd",
    help: "Changes the Rho value of the conic curve.",
    preview: false,
    noFeature: true,
    labelWidth: 60,
    rows: [{ id: "rho", type: "value", label: "Rho", kind: "none", default: String(cv0.rho), positive: true, step: 0.05 }],
    validate: (d) => { const v = d.num("rho"); return v > 0 && v < 1 ? null : "Invalid Input. Rho value for a conic curve must be between 0 and 1"; },
    afterPreview(d) { const v = d.num("rho"); if (v > 0 && v < 1) live(v); },
    commit(fe, d) {
      const v = d.num("rho");
      return mutateSketch("Edit Conic Curve", (sk) => { if (sk.curves[id]) sk.curves[id].rho = v; });
    },
    onClose() { endLiveSketch(); },
  });
}
