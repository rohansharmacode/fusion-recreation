// Sketch modify tools: Trim, Extend, Offset, Sketch Fillet, Mirror, Project, Normal/Construction.
import { ST, vp, activeData, mutateSketch, params, cursorOnPlane, projector, isSketchRef, refKey, fmtLen, setOpt } from "./ctx.js";
import { Tool, endTool, addDim, arcPoly } from "./tools.js";
import * as HUD from "./hud.js";
import { setToolPreview, clearToolPreview, setExtraHover } from "./render.js";

const TAU = Math.PI * 2;
const curveFilter = (r) => !!r && r.kind === "sketchCurve" && r.sketch === ST.sketchId;

function piecePolyline(piece) {
  const g = piece.g;
  if (g.kind === "pcurve") {
    const t0 = piece.whole ? 0 : piece.t0, t1 = piece.whole ? g.T : piece.t1;
    const n = Math.max(16, Math.ceil(((t1 - t0) / g.T) * g.T * g.per * 2));
    const out = [];
    for (let i = 0; i <= n; i++) out.push(g.at(t0 + ((t1 - t0) * i) / n));
    return out;
  }
  if (g.kind === "line") {
    const at = (t) => [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t];
    return [at(piece.whole ? 0 : piece.t0), at(piece.whole ? 1 : piece.t1)];
  }
  if (g.kind === "circle") {
    if (piece.whole) return arcPoly(g.c, g.r, 0, TAU);
    return arcPoly(g.c, g.r, piece.t0, piece.t1 - piece.t0);
  }
  const t0 = piece.whole ? 0 : piece.t0, t1 = piece.whole ? g.sweep : piece.t1;
  return arcPoly(g.c, g.r, g.a0 + t0, t1 - t0);
}

// ---------------------------------------------------------------------------
export class TrimTool extends Tool {
  constructor() { super("TrimSketchCmd", "Trim"); }
  prompt() { return "Select curve section to trim"; }
  target(ctx) {
    const d = activeData();
    const h = vp().pick(ctx.x, ctx.y, { filter: (r) => curveFilter(r) && d.sk.curves[r.curve] && d.sk.curves[r.curve].type !== "point" });
    if (!h) return null;
    const hit = cursorOnPlane(ctx.x, ctx.y, d.plane);
    if (!hit) return null;
    const n = ST.app.S.nearestOnCurve(d.sk, h.ref.curve, hit.uv);
    return { id: h.ref.curve, q: n ? n.p : hit.uv };
  }
  move(ctx) {
    const d = activeData();
    const t = this.target(ctx);
    if (!t) { setToolPreview(null); return; }
    let piece;
    try { piece = ST.app.S.trimPiece(d.sk, t.id, t.q); } catch { piece = null; }
    setToolPreview(piece ? { trim: [piecePolyline(piece)] } : null);
  }
  click(ctx) {
    const t = this.target(ctx);
    if (!t) return;
    try { mutateSketch("Trim", (sk) => ST.app.S.trimAt(sk, t.id, t.q)); } catch (e) { ST.app.toast(`Trim: ${e.message || e}`, "error"); }
    this.move(ctx);
  }
}

// ---------------------------------------------------------------------------
export class ExtendTool extends Tool {
  constructor() { super("ExtendSketchCmd", "Extend"); }
  prompt() { return "Select curve to extend"; }
  target(ctx) {
    const d = activeData();
    const h = vp().pick(ctx.x, ctx.y, { filter: (r) => curveFilter(r) && ["line", "arc"].includes((d.sk.curves[r.curve] || {}).type) });
    if (!h) return null;
    const hit = cursorOnPlane(ctx.x, ctx.y, d.plane);
    return hit ? { id: h.ref.curve, q: hit.uv } : null;
  }
  move(ctx) {
    const S = ST.app.S;
    const d = activeData();
    const t = this.target(ctx);
    if (!t) { setToolPreview(null); return; }
    const w = S.cloneSketch(d.sk);
    const ok = S.extendAt(w, t.id, t.q);
    setToolPreview(ok ? { hi: [S.curvePolyline(w, t.id, 64)] } : { trim: [S.curvePolyline(d.sk, t.id, 64)] });
  }
  click(ctx) {
    const S = ST.app.S;
    const t = this.target(ctx);
    if (!t) return;
    const d = activeData();
    const w = S.cloneSketch(d.sk);
    if (!S.extendAt(w, t.id, t.q)) { ST.app.toast("There is no curve to extend to.", "warning", 2000); return; }
    mutateSketch("Extend", (sk) => extendAndConstrain(sk, t.id, t.q));
    this.move(ctx);
  }
}

/**
 * Extend curve id at the end nearest q and, like Fusion, tie the new end to the curve it reached
 * (coincident with that curve's end point when it lands on one, else on-curve), so the extension
 * holds when the sketch is dragged or re-solved.
 */
export function extendAndConstrain(sk, id, q) {
  const S = ST.app.S;
  const cv = sk.curves[id];
  if (!cv) return false;
  const pos = (pid) => (sk.points[pid] ? [sk.points[pid].x, sk.points[pid].y] : null);
  const before = { p1: cv.p1, p2: cv.p2, a: pos(cv.p1), b: pos(cv.p2) };
  if (!S.extendAt(sk, id, q)) return false;
  const moved = (k, at) => cv[k] !== before[k] || Math.hypot(pos(cv[k])[0] - at[0], pos(cv[k])[1] - at[1]) > 1e-9;
  const end = moved("p2", before.b) ? cv.p2 : moved("p1", before.a) ? cv.p1 : null;
  if (!end) return true;
  const E = pos(end);
  const tol = 1e-6 * Math.max(1, Math.hypot(E[0], E[1]));
  let best = null;
  for (const [oid, o] of Object.entries(sk.curves)) {
    if (oid === id || o.type === "point") continue;
    const n = S.nearestOnCurve(sk, oid, E);
    if (n && n.d <= tol && (!best || n.d < best.d)) best = { id: oid, d: n.d };
  }
  if (!best) return true;
  const o = sk.curves[best.id];
  const endPt = (o.type === "line" || o.type === "arc" ? [o.p1, o.p2] : []).find((p) => p !== end && sk.points[p] && Math.hypot(sk.points[p].x - E[0], sk.points[p].y - E[1]) <= tol);
  if (endPt) S.addConstraint(sk, "coincident", [end, endPt]);
  else S.addConstraint(sk, "onCurve", [end, best.id]);
  return true;
}

// ---------------------------------------------------------------------------
// free-form curves (splines, ellipses, conics) offset as fit point splines; lines / arcs / circles as chains
const FREEFORM = new Set(["spline", "ellipse", "earc", "cvspline", "conic"]);
function offsetAny(S, sk, ids, d) {
  const free = ids.filter((id) => sk.curves[id] && FREEFORM.has(sk.curves[id].type));
  const rest = ids.filter((id) => !free.includes(id));
  const curves = [];
  for (const id of free) { const s = S.offsetFreeform(sk, id, d); if (s) curves.push(s); }
  const res = rest.length ? S.offsetChain(sk, rest, d) : null;
  if (res) curves.push(...res.curves);
  return curves.length ? { curves, firstLine: res ? res.firstLine : null } : null;
}

export class OffsetTool extends Tool {
  constructor() { super("Offset", "Offset"); this.ids = null; }
  prompt() { return this.ids ? "Specify offset position" : "Select a curve to offset"; }
  begin() {
    const A = ST.app;
    const pre = A.selection.items.filter((r) => curveFilter(r)).map((r) => r.curve);
    if (pre.length) this.choose(pre);
  }
  choose(ids) {
    const d = activeData();
    this.ids = ids.filter((id) => d.sk.curves[id] && d.sk.curves[id].type !== "point");
    if (!this.ids.length) { this.ids = null; return; }
    ST.app.selection.set(this.ids.map((id) => ({ kind: "sketchCurve", sketch: ST.sketchId, curve: id })));
    HUD.hudShow([{ id: "d", kind: "length", label: "Offset position" }], { onEnter: () => this.commit(), onChange: () => this.refresh() });
    this.refreshPrompt();
  }
  reset() { this.ids = null; HUD.hudHide(); clearToolPreview(); ST.app.selection.clear(); this.refreshPrompt(); }
  signed(sk, q) {
    const S = ST.app.S;
    let best = Infinity;
    for (const id of this.ids) { const n = S.nearestOnCurve(sk, id, q); if (n && n.d < best) best = n.d; }
    const rest = this.ids.filter((id) => sk.curves[id].type !== "circle" && !FREEFORM.has(sk.curves[id].type));
    const free = this.ids.filter((id) => FREEFORM.has(sk.curves[id].type));
    let side = 1;
    if (free.length && !rest.length) side = S.freeformSide(sk, free[0], q);
    else if (rest.length) {
      const ch = S.orderChain(sk, rest);
      if (ch) side = S.chainSide(sk, ch, q);
    } else {
      const cv = sk.curves[this.ids[0]];
      const c = sk.points[cv.c];
      side = Math.hypot(q[0] - c.x, q[1] - c.y) > Math.abs(cv.r) ? 1 : -1;
    }
    return { dist: best, side };
  }
  compute(ctx) {
    const d = activeData();
    const hit = cursorOnPlane(ctx.x, ctx.y, d.plane);
    if (!hit) return null;
    const { dist, side } = this.signed(d.sk, hit.uv);
    const T = HUD.hudValues();
    const mag = T.d && T.d.ok ? T.d.value : dist;
    return { uv: hit.uv, mag, side, T };
  }
  move(ctx) {
    const S = ST.app.S;
    const d = activeData();
    if (!this.ids) {
      const h = vp().pick(ctx.x, ctx.y, { filter: curveFilter });
      if (h) {
        const ch = S.chainOf(d.sk, h.ref.curve, { linesArcs: true });
        setExtraHover(ch.ids.map((id) => refKey({ kind: "sketchCurve", sketch: ST.sketchId, curve: id })));
      } else setExtraHover([]);
      return;
    }
    const r = this.compute(ctx);
    if (!r) return;
    const w = S.cloneSketch(d.sk);
    let res = null;
    try { res = offsetAny(S, w, this.ids, r.side * r.mag); } catch { res = null; }
    setToolPreview(res ? { polys: res.curves.map((id) => S.curvePolyline(w, id, 64)) } : null);
    const proj = projector(d.plane);
    const s = proj(r.uv[0], r.uv[1]);
    HUD.hudSet("d", r.mag, [s[0] + 40, s[1] - 26]);
  }
  click(ctx) {
    if (!this.ids) {
      const d = activeData();
      const h = vp().pick(ctx.x, ctx.y, { filter: curveFilter });
      if (!h) return;
      setExtraHover([]);
      this.choose(ST.app.S.chainOf(d.sk, h.ref.curve, { linesArcs: true }).ids);
      this.move(ctx);
      return;
    }
    this.commit(ctx);
  }
  commit(ctx) {
    const S = ST.app.S;
    const r = this.compute(ctx || this.lastCtx || { x: 0, y: 0 });
    if (!r || !(r.mag > 1e-9)) return;
    const ids = this.ids;
    const expr = r.T.d && r.T.d.ok ? r.T.d.expr : fmtLen(r.mag);
    try {
      mutateSketch("Offset", (sk, f, doc) => {
        const res = offsetAny(S, sk, ids, r.side * r.mag);
        if (!res) throw new Error("The curves could not be offset");
        if (res.firstLine) addDim(sk, doc, "pointLine", [res.firstLine.point, res.firstLine.orig], expr, {});
        return res;
      });
    } catch (e) { ST.app.toast(`Offset: ${e.message || e}`, "error", 2400); return; }
    this.reset();
  }
  end() { setExtraHover([]); }
}

// ---------------------------------------------------------------------------
export class FilletTool extends Tool {
  constructor() { super("FilletSketchCmd", "Fillet"); this.corner = null; this.first = null; this.firstArc = null; this.lastR = null; }
  prompt() { return this.corner ? "Specify fillet radius" : this.first ? "Select second line or arc" : "Select first line or arc"; }
  cornerFrom(sk, a, b) {
    const L1 = sk.curves[a], L2 = sk.curves[b];
    if (!L1 || !L2 || L1.type !== "line" || L2.type !== "line") return null;
    for (const p of [L1.p1, L1.p2]) if (p === L2.p1 || p === L2.p2) return p;
    return null;
  }
  pick(ctx) {
    const d = activeData();
    return vp().pick(ctx.x, ctx.y, { filter: (r) => r && r.sketch === ST.sketchId && (r.kind === "sketchPoint" || (r.kind === "sketchCurve" && d.sk.curves[r.curve] && d.sk.curves[r.curve].type === "line")) });
  }
  isCorner(sk, pid) { return ST.app.S.curvesUsingPoint(sk, pid).filter((c) => sk.curves[c].type === "line").length === 2; }
  move(ctx) {
    const d = activeData();
    if (!this.corner) {
      const h = this.pick(ctx);
      ST.app.selection.setHover(h ? h.ref : null);
      return;
    }
    this.preview();
  }
  radius() {
    const T = HUD.hudValues();
    return T.r && T.r.ok ? T.r.value : this.defR;
  }
  preview() {
    const S = ST.app.S;
    const d = activeData();
    const w = S.cloneSketch(d.sk);
    const arc = S.filletCorner(w, this.corner, this.radius());
    setToolPreview(arc ? { polys: [S.curvePolyline(w, arc, 32)] } : null);
    const P = d.sk.points[this.corner];
    if (P) {
      const s = projector(d.plane)(P.x, P.y);
      HUD.hudSet("r", this.radius(), [s[0] + 44, s[1] - 30]);
    }
  }
  click(ctx) {
    const d = activeData();
    const S = ST.app.S;
    if (this.corner) { this.commit(); return; }
    const h = this.pick(ctx);
    if (!h) return;
    let corner = null;
    if (h.ref.kind === "sketchPoint") { if (this.isCorner(d.sk, h.ref.point)) corner = h.ref.point; }
    else if (!this.first) { this.first = h.ref.curve; ST.app.selection.set([h.ref]); this.refreshPrompt(); return; }
    else corner = this.cornerFrom(d.sk, this.first, h.ref.curve);
    if (!corner) { ST.app.toast("Select two lines that share an end point.", "warning", 2200); this.first = null; ST.app.selection.clear(); this.refreshPrompt(); return; }
    this.corner = corner;
    const lines = S.curvesUsingPoint(d.sk, corner).filter((c) => d.sk.curves[c].type === "line");
    const lens = lines.map((l) => { const c = d.sk.curves[l]; return Math.hypot(d.sk.points[c.p1].x - d.sk.points[c.p2].x, d.sk.points[c.p1].y - d.sk.points[c.p2].y); });
    this.defR = this.lastR || +(Math.min(...lens) * 0.2).toPrecision(2);
    this.firstLine = h.ref.kind === "sketchCurve" ? this.first : null;
    ST.app.selection.set(lines.map((l) => ({ kind: "sketchCurve", sketch: ST.sketchId, curve: l })));
    this.openHud();
    this.refreshPrompt();
    this.preview();
  }
  openHud() { HUD.hudShow([{ id: "r", kind: "length", label: "Fillet radius" }], { onEnter: () => this.commit(), onChange: () => this.preview() }); }
  commit() {
    const S = ST.app.S;
    const r = this.radius();
    const T = HUD.hudValues();
    const corner = this.corner;
    const expr = T.r && T.r.ok ? T.r.expr : fmtLen(r);
    const firstArc = this.firstArc;
    let arcId = null;
    try {
      arcId = mutateSketch("Sketch Fillet", (sk, f, doc) => {
        const arc = S.filletCorner(sk, corner, r);
        if (!arc) throw new Error("The fillet radius is too large for these lines");
        if (firstArc && sk.curves[firstArc]) S.addConstraint(sk, "equal", [firstArc, arc]);
        else addDim(sk, doc, "radius", [arc], expr, {});
        return arc;
      });
    } catch (e) { ST.app.toast(`Fillet: ${e.message || e}`, "error", 2400); return; }
    this.firstArc = this.firstArc || arcId;
    this.lastR = r;
    this.corner = null;
    this.first = null;
    HUD.hudHide();
    clearToolPreview();
    ST.app.selection.clear();
    this.refreshPrompt();
  }
  key(ev) { if (ev.key === "Enter" && this.corner) { this.commit(); return true; } return false; }
  escape() { if (this.corner || this.first) { this.corner = null; this.first = null; HUD.hudHide(); clearToolPreview(); ST.app.selection.clear(); this.refreshPrompt(); return; } super.escape(); }
}

// ---------------------------------------------------------------------------
// Sketch Chamfer (Equal Distance / Two Distance / Distance and Angle): select a corner point or the
// two lines sharing it, type the value(s), Enter. The corner is cut with a new line.
// ---------------------------------------------------------------------------
/**
 * Cut corner pid (shared by exactly two lines) with a line set back d1 along the first line and d2 along
 * the second. Returns {line, l1, l2} or null when the set-backs do not fit.
 */
export function chamferCorner(sk, pid, d1, d2, firstLine) {
  const S = ST.app.S;
  let lines = S.curvesUsingPoint(sk, pid).filter((id) => sk.curves[id].type === "line");
  if (lines.length !== 2) return null;
  if (firstLine && lines[1] === firstLine) lines = [lines[1], lines[0]];
  const [l1, l2] = lines;
  const P = (id) => [sk.points[id].x, sk.points[id].y];
  const V = P(pid);
  const other = (l) => (sk.curves[l].p1 === pid ? sk.curves[l].p2 : sk.curves[l].p1);
  const A = P(other(l1)), B = P(other(l2));
  const lu = Math.hypot(A[0] - V[0], A[1] - V[1]), lw = Math.hypot(B[0] - V[0], B[1] - V[1]);
  if (!(d1 > 1e-9 && d2 > 1e-9) || d1 >= lu - 1e-9 || d2 >= lw - 1e-9) return null;
  const T1 = [V[0] + ((A[0] - V[0]) / lu) * d1, V[1] + ((A[1] - V[1]) / lu) * d1];
  const T2 = [V[0] + ((B[0] - V[0]) / lw) * d2, V[1] + ((B[1] - V[1]) / lw) * d2];
  const t1 = S.addPoint(sk, T1[0], T1[1]), t2 = S.addPoint(sk, T2[0], T2[1]);
  const rep = (l, np) => { if (sk.curves[l].p1 === pid) sk.curves[l].p1 = np; else sk.curves[l].p2 = np; };
  rep(l1, t1);
  rep(l2, t2);
  const line = S.addLine(sk, t1, t2, !!(sk.curves[l1].cons && sk.curves[l2].cons));
  // constraints on the removed corner point go with it (as Sketch Fillet does)
  sk.constraints = sk.constraints.filter((c) => !c.refs.includes(pid));
  S.removeEntities(sk, []);
  return { line, l1, l2 };
}

const CHAMFER = {
  equal: { id: "ChamferSketchEqualDistance", label: "Equal Distance Chamfer", fields: [["d", "length", "Distance"]] },
  dd: { id: "ChamferSketchDistanceDistance", label: "Two Distance Chamfer", fields: [["d", "length", "Distance 1"], ["d2", "length", "Distance 2"]] },
  da: { id: "ChamferSketchDistanceAngle", label: "Distance and Angle Chamfer", fields: [["d", "length", "Distance"], ["a", "angle", "Angle"]] },
};

export class ChamferTool extends FilletTool {
  constructor(mode = "equal") {
    super();
    const m = CHAMFER[mode] || CHAMFER.equal;
    this.mode = CHAMFER[mode] ? mode : "equal";
    this.id = m.id;
    this.label = m.label;
  }
  prompt() { return this.corner ? "Specify chamfer distance" : this.first ? "Select second line" : "Select first line or a corner point"; }
  openHud() {
    HUD.hudShow(CHAMFER[this.mode].fields.map(([id, kind, label]) => ({ id, kind, label })), { onEnter: () => this.commit(), onChange: () => this.preview() });
  }
  /** The two set-backs [d1, d2] for the current HUD values (null when they don't make a chamfer). */
  setbacks(sk) {
    const T = HUD.hudValues();
    const d = T.d && T.d.ok ? T.d.value : this.defR;
    if (this.mode === "equal") return [d, d];
    if (this.mode === "dd") return [d, T.d2 && T.d2.ok ? T.d2.value : d];
    // distance and angle: the chamfer line leaves the first line at the angle; law of sines for the second set-back
    const a = (T.a && T.a.ok ? T.a.value : 45) * (Math.PI / 180);
    const S = ST.app.S;
    let lines = S.curvesUsingPoint(sk, this.corner).filter((id) => sk.curves[id].type === "line");
    if (lines.length !== 2) return null;
    if (this.firstLine && lines[1] === this.firstLine) lines = [lines[1], lines[0]];
    const V = sk.points[this.corner];
    const dirTo = (l) => { const c = sk.curves[l]; const o = sk.points[c.p1 === this.corner ? c.p2 : c.p1]; const L = Math.hypot(o.x - V.x, o.y - V.y) || 1; return [(o.x - V.x) / L, (o.y - V.y) / L]; };
    const u = dirTo(lines[0]), w = dirTo(lines[1]);
    const th = Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1])));
    const s3 = Math.sin(Math.PI - a - th);
    if (!(a > 0) || a + th >= Math.PI - 1e-6 || s3 <= 1e-9) return null;
    return [d, (d * Math.sin(a)) / s3];
  }
  preview() {
    const S = ST.app.S;
    const d = activeData();
    const sb = this.setbacks(d.sk);
    const w = S.cloneSketch(d.sk);
    const res = sb ? chamferCorner(w, this.corner, sb[0], sb[1], this.firstLine) : null;
    setToolPreview(res ? { polys: [S.curvePolyline(w, res.line, 2)] } : null);
    const P = d.sk.points[this.corner];
    if (P) {
      const s = projector(d.plane)(P.x, P.y);
      HUD.hudSet("d", sb ? sb[0] : this.defR, [s[0] + 44, s[1] - 30]);
      if (this.mode === "dd") HUD.hudSet("d2", sb ? sb[1] : this.defR, [s[0] + 44, s[1] + 2]);
      if (this.mode === "da") HUD.hudSet("a", 45, [s[0] + 44, s[1] + 2]);
    }
  }
  commit() {
    const sk0 = activeData().sk;
    const sb = this.setbacks(sk0);
    const corner = this.corner, firstLine = this.firstLine;
    try {
      mutateSketch(this.label, (sk) => {
        const res = sb && chamferCorner(sk, corner, sb[0], sb[1], firstLine);
        if (!res) throw new Error("The chamfer distance is too large for these lines");
        return res.line;
      });
    } catch (e) { ST.app.toast(`Chamfer: ${e.message || e}`, "error", 2400); return; }
    this.lastR = sb[0];
    this.corner = null;
    this.first = null;
    this.firstLine = null;
    HUD.hudHide();
    clearToolPreview();
    ST.app.selection.clear();
    this.refreshPrompt();
  }
}

// ---------------------------------------------------------------------------
// Mirror: small command dialog with Objects + Mirror Line selections
// ---------------------------------------------------------------------------
export class MirrorTool extends Tool {
  constructor() { super("MirrorSketchCommand", "Mirror"); this.objects = []; this.line = null; this.active = "objects"; }
  prompt() { return this.active === "objects" ? "Select objects to mirror" : "Select the mirror line"; }
  begin() {
    const A = ST.app;
    this.objects = A.selection.items.filter(curveFilter).map((r) => r.curve);
    if (this.objects.length) this.active = "line";
    this.dlg = buildDialog("MirrorSketchCommand", "MIRROR", [
      { id: "objects", label: "Objects", sel: true },
      { id: "line", label: "Mirror Line", sel: true },
    ], { ok: () => this.ok(), cancel: () => endTool(), activate: (id) => { this.active = id; this.sync(); } });
    this.sync();
  }
  sync() {
    const S = this.dlg;
    if (!S) return;
    S.setSel("objects", this.objects.length ? `${this.objects.length} selected` : "Select", this.active === "objects");
    S.setSel("line", this.line ? "1 selected" : "Select", this.active === "line");
    S.setOk(this.objects.length > 0 && !!this.line);
    const sel = this.objects.map((id) => ({ kind: "sketchCurve", sketch: ST.sketchId, curve: id }));
    if (this.line) sel.push({ kind: "sketchCurve", sketch: ST.sketchId, curve: this.line });
    ST.app.selection.set(sel);
    this.refreshPrompt();
    this.preview();
  }
  preview() {
    const S = ST.app.S;
    const d = activeData();
    if (!this.line || !this.objects.length) { clearToolPreview(); return; }
    const w = S.cloneSketch(d.sk);
    const created = S.mirrorEntities(w, this.objects.filter((id) => id !== this.line), this.line);
    setToolPreview({ polys: created.map((id) => S.curvePolyline(w, id, 64)) });
  }
  move(ctx) {
    const h = vp().pick(ctx.x, ctx.y, { filter: curveFilter });
    ST.app.selection.setHover(h ? h.ref : null);
  }
  click(ctx) {
    const d = activeData();
    const h = vp().pick(ctx.x, ctx.y, { filter: curveFilter });
    if (!h) return;
    const id = h.ref.curve;
    if (this.active === "objects") {
      this.objects = this.objects.includes(id) ? this.objects.filter((x) => x !== id) : [...this.objects, id];
    } else {
      if (d.sk.curves[id].type !== "line") { ST.app.toast("The mirror line must be a line.", "warning", 2000); return; }
      this.line = id;
      this.objects = this.objects.filter((x) => x !== id);
    }
    this.sync();
  }
  ok() {
    if (!this.objects.length || !this.line) return;
    const objs = this.objects, line = this.line;
    mutateSketch("Mirror", (sk) => ST.app.S.mirrorEntities(sk, objs, line));
    endTool();
  }
  key(ev) { if (ev.key === "Enter") { this.ok(); return true; } return false; }
  end() { if (this.dlg) this.dlg.close(); this.dlg = null; ST.app.selection.clear(); }
}

/** Minimal Fusion-style command dialog for sketch commands (hooks: .dlg[data-dialog], [data-action]). */
export function buildDialog(id, title, rows, { ok, cancel, activate }) {
  const host = ST.app.dom.dialogHost || document.body;
  const el = document.createElement("div");
  el.className = "dlg sk-dlg";
  el.dataset.dialog = id;
  el.innerHTML = `<div class="sk-dlg-head"><span>${title}</span><button class="sk-dlg-x" data-action="cancel" title="Cancel">×</button></div><div class="sk-dlg-body"></div><div class="sk-dlg-foot"><button class="sk-btn" data-action="ok">OK</button><button class="sk-btn" data-action="cancel">Cancel</button></div>`;
  const body = el.querySelector(".sk-dlg-body");
  const sels = {};
  for (const r of rows) {
    const row = document.createElement("div");
    row.className = "sk-dlg-row";
    row.innerHTML = `<label>${r.label}</label><button class="sk-selbtn" data-input="${r.id}"><span class="sk-selarrow">↖</span><span class="sk-seltext">Select</span></button>`;
    const b = row.querySelector("button");
    b.addEventListener("click", () => activate && activate(r.id));
    sels[r.id] = b;
    body.appendChild(row);
  }
  el.querySelectorAll('[data-action="cancel"]').forEach((b) => b.addEventListener("click", () => cancel && cancel()));
  el.querySelector('[data-action="ok"]').addEventListener("click", () => ok && ok());
  el.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  host.appendChild(el);
  ST.app.emit("dialog", { open: true, id });
  ST.app.emit("layout", {});
  return {
    el,
    setSel(rid, text, active) { const b = sels[rid]; if (!b) return; b.querySelector(".sk-seltext").textContent = text; b.classList.toggle("active", !!active); b.classList.toggle("filled", text !== "Select"); },
    setOk(on) { el.querySelector('[data-action="ok"]').disabled = !on; },
    close() { el.remove(); ST.app.emit("dialog", { open: false, id }); ST.app.emit("layout", {}); },
  };
}

// ---------------------------------------------------------------------------
// Project: body edges / faces -> fixed projected curves
// ---------------------------------------------------------------------------
export class ProjectTool extends Tool {
  constructor() { super("ProjectNewCmd", "Project"); }
  prompt() { return "Select edges or faces to project (Esc to finish)"; }
  filter(r) { return !!r && (r.kind === "edge" || r.kind === "face" || r.kind === "body"); }
  move(ctx) {
    const h = vp().pick(ctx.x, ctx.y, { filter: (r) => this.filter(r) });
    ST.app.selection.setHover(h ? h.ref : null);
  }
  click(ctx) {
    const h = vp().pick(ctx.x, ctx.y, { filter: (r) => this.filter(r) });
    if (!h) return;
    projectRefs([h.ref]);
  }
  key(ev) { if (ev.key === "Enter") { endTool(); return true; } return false; }
}

export function projectRefs(refs) {
  const A = ST.app;
  const d = activeData();
  if (!d) return 0;
  const edges = [];
  for (const r of refs) {
    const b = A.body(r.body);
    if (!b) continue;
    try {
      if (r.kind === "edge") { const e = b.shape.edges[r.index]; if (e) edges.push(e); }
      else if (r.kind === "face") { const f = b.shape.faces[r.index]; if (f) edges.push(...f.edges); }
      else if (r.kind === "body") edges.push(...b.shape.edges);
    } catch (e) { console.error(e); }
  }
  if (!edges.length) { A.toast("Nothing to project.", "info", 1600); return 0; }
  const items = [];
  for (const e of edges) { try { const it = edgeToSketch(e, d.plane); if (it) items.push(it); } catch (err) { console.error(err); } }
  if (!items.length) return 0;
  let n = 0;
  mutateSketch("Project", (sk) => { n = addProjected(sk, items); });
  if (!n) A.toast("The selected geometry is already projected.", "info", 1800);
  return n;
}

function edgeToSketch(e, plane) {
  const K = ST.app.K;
  const S = ST.app.S;
  const uv = (p) => K.toLocal(plane, p);
  const tup = (v) => (v && v.toTuple ? v.toTuple() : v);
  const at = (t) => tup(e.pointAt(t));
  const type = e.geomType;
  const s = tup(e.startPoint), t = tup(e.endPoint);
  const closed = K.V.len(K.V.sub(s, t)) < 1e-7;
  if (type === "LINE") {
    const a = uv(s), b = uv(t);
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7) return { kind: "point", a };
    return { kind: "line", a, b };
  }
  if (type === "CIRCLE") {
    const p0 = closed ? at(0) : s, p1 = closed ? at(1 / 3) : at(0.5), p2 = closed ? at(2 / 3) : t;
    const nn = K.V.norm(K.V.cross(K.V.sub(p1, p0), K.V.sub(p2, p0)));
    if (Math.abs(K.V.dot(nn, plane.n)) > 0.9999) {
      if (closed) { const ci = S.circleFrom3(uv(p0), uv(p1), uv(p2)); return ci ? { kind: "circle", c: ci.c, r: ci.r } : null; }
      const arc = S.arcFrom3(uv(p0), uv(p1), uv(p2));
      return arc ? { kind: "arc", c: arc.c, r: arc.r, a: uv(p0), b: uv(p2), ccw: arc.ccw } : null;
    }
  }
  if (type === "ELLIPSE" || type === "BSPLINE_CURVE" || type === "BEZIER_CURVE") {
    const free = freeformEdge(e, plane, uv, closed);
    if (free) return free;
  }
  const n = 32;
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(uv(at(i / n)));
  return { kind: "poly", pts, closed };
}

/**
 * Ellipse / B-spline body edges project as a sketch ellipse (elliptical arc) when parallel to the
 * sketch plane, otherwise as a fit point spline (through the B-spline's knots when it is one of the
 * sketch's own splines, else through 33 samples).
 */
function freeformEdge(e, plane, uv, closed) {
  const K = ST.app.K;
  const O = K.R.getOC();
  const ad = new O.BRepAdaptor_Curve(e.wrapped);
  const xyz = (p) => { const r = [p.X(), p.Y(), p.Z()]; p.delete(); return r; };
  try {
    const u0 = ad.FirstParameter(), u1 = ad.LastParameter();
    const val = (u) => xyz(ad.Value(u));
    if (e.geomType === "ELLIPSE") {
      const el = ad.Ellipse();
      const ax = el.Axis(), xa = el.XAxis(), ya = el.YAxis();
      const N = xyz(ax.Direction()), X = xyz(xa.Direction()), Y = xyz(ya.Direction()), C = xyz(el.Location());
      const R1 = el.MajorRadius(), R2 = el.MinorRadius();
      [ax, xa, ya, el].forEach((o) => o.delete());
      const dn = K.V.dot(N, plane.n);
      if (Math.abs(dn) > 0.9999) {
        const c = uv(C), a = uv(K.V.add(C, K.V.mul(X, R1))), b = uv(K.V.add(C, K.V.mul(Y, R2)));
        if (closed) return { kind: "ellipse", c, a, b };
        const s = uv(val(u0)), t = uv(val(u1));
        return dn > 0 ? { kind: "earc", c, a, b, p1: s, p2: t } : { kind: "earc", c, a, b, p1: t, p2: s };
      }
    }
    let us = [];
    if (e.geomType === "BSPLINE_CURVE") {
      try {
        const h = ad.BSpline();
        const g = h.get ? h.get() : h;
        const nk = g.NbKnots();
        let own = g.Degree() === 3 && nk >= 3;
        for (let i = 2; i < nk && own; i++) if (g.Multiplicity(i) !== 2) own = false;
        if (own) for (let i = 1; i <= nk; i++) us.push(g.Knot(i));
      } catch { us = []; }
    }
    if (!us.length) for (let i = 0; i <= 32; i++) us.push(u0 + ((u1 - u0) * i) / 32);
    const pts = us.map((u) => uv(val(u)));
    if (closed && pts.length > 2) pts.pop();
    return pts.length >= 2 ? { kind: "spline", pts, closed: closed && pts.length >= 3 } : null;
  } catch (err) {
    console.error(err);
    return null;
  } finally { ad.delete(); }
}

function addProjected(sk, items) {
  const S = ST.app.S;
  const find = (u, v) => Object.entries(sk.points).find(([, p]) => p.proj && Math.abs(p.x - u) < 1e-6 && Math.abs(p.y - v) < 1e-6);
  const pt = (q) => { const f = find(q[0], q[1]); if (f) return f[0]; return S.addPoint(sk, q[0], q[1], { fixed: true, proj: true }); };
  const dupLine = (a, b) => Object.values(sk.curves).some((cv) => cv.proj && cv.type === "line" && ((cv.p1 === a && cv.p2 === b) || (cv.p1 === b && cv.p2 === a)));
  let n = 0;
  for (const it of items) {
    if (it.kind === "point") {
      const id = pt(it.a);
      if (!Object.values(sk.curves).some((cv) => cv.type === "point" && cv.p === id)) { const k = S.addSketchPoint(sk, id); sk.curves[k].proj = true; n++; }
    } else if (it.kind === "line") {
      const a = pt(it.a), b = pt(it.b);
      if (a === b || dupLine(a, b)) continue;
      const id = S.addLine(sk, a, b);
      sk.curves[id].proj = true;
      n++;
    } else if (it.kind === "circle") {
      const c = pt(it.c);
      if (Object.values(sk.curves).some((cv) => cv.proj && cv.type === "circle" && cv.c === c && Math.abs(cv.r - it.r) < 1e-6)) continue;
      const id = S.addCircle(sk, c, it.r);
      sk.curves[id].proj = true;
      n++;
    } else if (it.kind === "arc") {
      const c = pt(it.c), a = pt(it.a), b = pt(it.b);
      const id = S.addArcDir(sk, c, a, b, it.ccw);
      sk.curves[id].r = it.r;
      sk.curves[id].proj = true;
      n++;
    } else if (it.kind === "ellipse" || it.kind === "earc") {
      const c = pt(it.c), a = pt(it.a), b = pt(it.b);
      const p1 = it.kind === "earc" ? pt(it.p1) : null, p2 = it.kind === "earc" ? pt(it.p2) : null;
      if (Object.values(sk.curves).some((cv) => cv.proj && cv.type === it.kind && cv.c === c && cv.a === a && (it.kind === "ellipse" || (cv.p1 === p1 && cv.p2 === p2)))) continue;
      const id = it.kind === "ellipse" ? S.addEllipse(sk, c, a, b, false, { axes: false }).curve : S.addEllipticArc(sk, c, a, b, p1, p2);
      sk.curves[id].proj = true;
      n++;
    } else if (it.kind === "spline") {
      const ids = [];
      for (const q of it.pts) { const id = pt(q); if (ids[ids.length - 1] !== id) ids.push(id); }
      if (it.closed && ids.length > 1 && ids[ids.length - 1] === ids[0]) ids.pop();
      if (ids.length < 2) continue;
      const key = ids.join(",");
      if (Object.values(sk.curves).some((cv) => cv.proj && cv.type === "spline" && cv.pts.join(",") === key)) continue;
      const id = S.addSpline(sk, ids, { closed: it.closed && ids.length >= 3 });
      sk.curves[id].proj = true;
      n++;
    } else if (it.kind === "poly") {
      const ids = it.pts.map((q, i) => (it.closed && i === it.pts.length - 1 ? null : pt(q)));
      if (it.closed) ids[ids.length - 1] = ids[0];
      for (let i = 0; i + 1 < ids.length; i++) {
        if (ids[i] === ids[i + 1] || dupLine(ids[i], ids[i + 1])) continue;
        const id = S.addLine(sk, ids[i], ids[i + 1]);
        sk.curves[id].proj = true;
        n++;
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Normal / Construction (X)
// ---------------------------------------------------------------------------
export function toggleConstruction() {
  const A = ST.app;
  const curves = A.selection.items.filter((r) => curveFilter(r)).map((r) => r.curve);
  const d = activeData();
  if (curves.length && d) {
    const toCons = curves.some((id) => d.sk.curves[id] && !d.sk.curves[id].cons);
    mutateSketch("Normal/Construction", (sk) => { for (const id of curves) if (sk.curves[id] && !sk.curves[id].proj && sk.curves[id].type !== "point") sk.curves[id].cons = toCons; });
    return;
  }
  setOpt("construction", !ST.opts.construction);
  A.toast(ST.opts.construction ? "New sketch geometry is construction geometry" : "New sketch geometry is normal geometry", "info", 1600);
}

export { isSketchRef, params, TAU, edgeToSketch, addProjected };
