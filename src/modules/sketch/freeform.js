// Free-form sketch curve tools: Fit Point Spline (DrawSpline), Ellipse (CircleElipse) and
// Blend Curve (BlendG1CurveSketchCmd). Geometry lives in src/sketch/curves.js.
import { ST, vp, activeData, mutateSketch, projector, cursorOnPlane, refKey } from "./ctx.js";
import { Tool, SeqTool, rp, runHistory, endTool } from "./tools.js";
import * as HUD from "./hud.js";
import { setToolPreview, clearToolPreview, setSnapMark } from "./render.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const len = (a) => Math.hypot(a[0], a[1]);
const cons = () => !!ST.opts.construction;

/** Polyline of the spline through uv points P (as the sketch will build it). */
export function splinePreview(P, closed = false, clamps = {}) {
  const S = ST.app.S;
  const f = S.splineFit(P, { closed: closed && P.length >= 3, ...clamps });
  const g = f && S.splineGeom(f);
  if (!g) return [];
  const n = Math.max(24, 16 * g.T);
  const out = [];
  for (let i = 0; i <= n; i++) out.push(g.at((g.T * i) / n));
  return out;
}

// ---------------------------------------------------------------------------
// Fit Point Spline: click fit points; double-click, Enter or right-click finishes (Esc keeps what
// was placed); clicking the first point again closes the spline.
// ---------------------------------------------------------------------------
export class SplineTool extends Tool {
  constructor() { super("DrawSpline", "Fit Point Spline"); this.P = []; this.cur = null; }
  prompt() { return this.P.length ? "Specify next point" : "Place first point"; }
  begin() { this.P = []; }
  reset() { this.P = []; this.cur = null; clearToolPreview(); setSnapMark(null); this.refreshPrompt(); }
  snapOpts() { return this.P.length >= 2 ? { extra: [{ uv: this.P[0].uv, kind: "point", pointId: this.P[0].snap && this.P[0].snap.pointId }] } : {}; }
  /** The cursor is on the first fit point: the click closes the spline. */
  closing(snap) {
    if (this.P.length < 2 || !snap) return false;
    const f = this.P[0];
    if (snap.pointId && f.snap && f.snap.pointId === snap.pointId) return true;
    return len(sub(snap.uv, f.uv)) < 1e-9;
  }
  move(ctx) {
    const snap = this.snap(ctx, this.snapOpts());
    if (!snap) return;
    this.cur = snap;
    this.update();
  }
  update() {
    const snap = this.cur;
    if (!snap) return;
    const pts = this.P.map((p) => p.uv);
    const closing = this.closing(snap);
    const all = closing ? pts : [...pts, snap.uv];
    const poly = all.length >= 2 ? splinePreview(all, closing) : [];
    setSnapMark({ at: snap.uv, kind: snap.kind, align: snap.align });
    setToolPreview({ polys: poly.length ? [poly] : [], points: closing ? pts : [...pts, snap.uv] });
    ST.app.selection.setHover(snap.pointId ? { kind: "sketchPoint", sketch: ST.sketchId, point: snap.pointId } : snap.curveId ? { kind: "sketchCurve", sketch: ST.sketchId, curve: snap.curveId } : null);
  }
  click(ctx) {
    const snap = this.snap(ctx, this.snapOpts());
    if (!snap) return;
    this.cur = snap;
    if (this.closing(snap)) { this.commit(true); return; }
    const last = this.P[this.P.length - 1];
    if (last) {
      // the second click of a double-click lands on the point just placed
      const d = activeData();
      const proj = projector(d.plane);
      const a = proj(last.uv[0], last.uv[1]), b = proj(snap.uv[0], snap.uv[1]);
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 3 || (snap.pointId && last.snap && last.snap.pointId === snap.pointId)) return;
    }
    this.P.push({ uv: snap.uv.slice(), snap });
    this.refreshPrompt();
    this.update();
  }
  dbl() { if (this.P.length >= 2) this.commit(false); }
  context() { if (this.P.length >= 2) { this.commit(false); return true; } if (this.P.length) { this.reset(); return true; } return false; }
  key(ev) {
    if (ev.key === "Enter") { if (this.P.length >= 2) this.commit(false); else this.reset(); return true; }
    return false;
  }
  escape() {
    if (this.P.length >= 2) this.commit(false);
    endTool();
  }
  /** Ctrl+Z while placing fit points takes the last one back. */
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
      id = mutateSketch("Fit Point Spline", (sk) => {
        const ids = [];
        for (const p of P) { const pid = rp(sk, p); if (ids[ids.length - 1] !== pid) ids.push(pid); }
        if (closed && ids.length > 1 && ids[ids.length - 1] === ids[0]) ids.pop();
        return S.addSpline(sk, ids, { closed, cons: cons() });
      });
    } catch (e) { console.error(e); ST.app.toast(`Fit Point Spline: ${e.message || e}`, "error"); }
    this.refresh();
    return id;
  }
}

// ---------------------------------------------------------------------------
// Ellipse: centre, first axis end, a point on the ellipse
// ---------------------------------------------------------------------------
export function ellipsePoly(c, a, b, n = 96) {
  const S = ST.app.S;
  const E = S.ellipseFrame(c, a, b);
  if (!E) return [];
  const g = S.ellipseGeom(E);
  const out = [];
  for (let i = 0; i <= n; i++) out.push(g.at((g.T * i) / n));
  return out;
}

export const ELLIPSE_DEF = {
  clicks: 3,
  undo: "Ellipse",
  prompts: ["Place center point", "Place first axis point", "Place point on ellipse"],
  geom(stage, P, cur) {
    const S = ST.app.S;
    if (stage === 0) return { points: [cur.uv] };
    const c = P[0].uv;
    if (stage === 1) {
      const a = cur.uv;
      const r = len(sub(a, c));
      return { cons: [[sub(mul(c, 2), a), a]], invalid: r < 1e-6, message: "Place the first axis point away from the center" };
    }
    const a = P[1].uv;
    const k = S.ellipseSecondRadius(c, a, cur.uv);
    const axis = [sub(mul(c, 2), a), a];
    if (!k) return { invalid: true, cons: [axis], message: "Place the point within the first axis span" };
    const b = add(c, mul(k.uy, k.side * k.r2));
    return { polys: [ellipsePoly(c, a, b)], cons: [axis, [sub(mul(c, 2), b), b]], b };
  },
  commit(sk, P, T, g) {
    const S = ST.app.S;
    if (!g.b) return null;
    const ic = rp(sk, P[0]);
    const ia = rp(sk, P[1]);
    if (ia === ic) return null;
    const ib = S.addPoint(sk, g.b[0], g.b[1]);
    const res = S.addEllipse(sk, ic, ia, ib, cons());
    // a third click on an existing point keeps that point on the ellipse
    const sn = P[2].snap;
    if (sn && sn.pointId && sk.points[sn.pointId] && sn.pointId !== ic && sn.pointId !== ia) S.addConstraint(sk, "onCurve", [sn.pointId, res.curve]);
    else if (sn && sn.kind === "oncurve" && sn.curveId && sk.curves[sn.curveId]) {
      // the ellipse touches the curve at the clicked spot: a point on both
      const q = S.addPoint(sk, P[2].uv[0], P[2].uv[1]);
      S.addConstraint(sk, "onCurve", [q, res.curve]);
      S.addConstraint(sk, "onCurve", [q, sn.curveId]);
      S.addSketchPoint(sk, q);
    }
    return res;
  },
};

export function makeEllipseTool() { return new SeqTool("CircleElipse", "Ellipse", ELLIPSE_DEF); }

// ---------------------------------------------------------------------------
// Blend Curve (G1): a two-point spline between the nearer ends of two curves, tangent to both
// ---------------------------------------------------------------------------
const curveRef = (r) => !!r && r.kind === "sketchCurve" && r.sketch === ST.sketchId;

export class BlendTool extends Tool {
  constructor() { super("BlendG1CurveSketchCmd", "Blend Curve"); this.first = null; }
  prompt() { return this.first ? "Select second curve or edge" : "Select first curve or edge"; }
  reset() { this.first = null; ST.app.selection.clear(); clearToolPreview(); this.refreshPrompt(); }
  /** {curve, pid} for the end of the picked open curve nearest the cursor. */
  pickEnd(ctx) {
    const d = activeData();
    if (!d) return null;
    const S = ST.app.S;
    const h = vp().pick(ctx.x, ctx.y, { filter: (r) => curveRef(r) && S.curveEnds(d.sk.curves[r.curve]).length === 2 });
    if (!h) return null;
    const hit = cursorOnPlane(ctx.x, ctx.y, d.plane);
    const ends = S.curveEnds(d.sk.curves[h.ref.curve]);
    const q = hit ? hit.uv : null;
    const P = (pid) => [d.sk.points[pid].x, d.sk.points[pid].y];
    let pid = ends[0];
    if (q && len(sub(P(ends[1]), q)) < len(sub(P(ends[0]), q))) pid = ends[1];
    return { ref: h.ref, curve: h.ref.curve, pid };
  }
  /** Sketch copy with the blend added (preview), or null. */
  blendOn(sk, a, b) {
    const S = ST.app.S;
    if (!a || !b || a.pid === b.pid || !sk.points[a.pid] || !sk.points[b.pid]) return null;
    const id = S.addSpline(sk, [a.pid, b.pid], { cons: cons() });
    S.addConstraint(sk, "tangent", [a.curve, id]);
    S.addConstraint(sk, "tangent", [b.curve, id]);
    return id;
  }
  move(ctx) {
    const e = this.pickEnd(ctx);
    ST.app.selection.setHover(e ? e.ref : null);
    if (!this.first || !e) { setToolPreview(this.first ? null : null); return; }
    const d = activeData();
    const S = ST.app.S;
    const w = S.cloneSketch(d.sk);
    const id = this.blendOn(w, this.first, e);
    setToolPreview(id ? { polys: [S.curvePolyline(w, id, 64)] } : null);
  }
  click(ctx) {
    const e = this.pickEnd(ctx);
    if (!e) return;
    if (!this.first) {
      this.first = e;
      ST.app.selection.set([e.ref]);
      this.refreshPrompt();
      return;
    }
    if (e.pid === this.first.pid) { ST.app.toast("Select the end of a different curve.", "warning", 2000); return; }
    const a = this.first;
    this.first = null;
    try { mutateSketch("Blend Curve", (sk) => this.blendOn(sk, a, e)); } catch (err) { console.error(err); ST.app.toast(`Blend Curve: ${err.message || err}`, "error"); }
    ST.app.selection.clear();
    clearToolPreview();
    this.refreshPrompt();
  }
  escape() { if (this.first) { this.reset(); return; } endTool(); }
}

export { HUD, refKey };
