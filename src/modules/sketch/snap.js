// Inference / snapping for sketch tools: endpoints, centres, midpoints, the origin, on-curve,
// horizontal/vertical alignment with existing points, optional grid snap.
import { ST, activeData, cursorOnPlane, projector, mmPerPx, gridSnapOn } from "./ctx.js";
import { pickablePoints, curveVisible } from "./pick.js";
import { gridStep } from "./render.js";

const SNAP_PX = 9, CURVE_PX = 6, ALIGN_PX = 5;

function centers(sk) {
  const s = new Set();
  for (const cv of Object.values(sk.curves)) if (cv.type === "circle" || cv.type === "arc") s.add(cv.c);
  return s;
}

/**
 * opts: {exclude:Set(pointIds), excludeCurves:Set, extra:[{uv, kind, pointId}], alignFrom:[[u,v]],
 *        noSnap (Ctrl), noAlign, noCurve}
 * Returns {uv, raw, world, kind, pointId, curveId, align:[{from,to}]} or null.
 */
export function snapAt(x, y, opts = {}) {
  const d = activeData();
  if (!d) return null;
  const pl = d.plane;
  const hit = cursorOnPlane(x, y, pl);
  if (!hit) return null;
  const raw = hit.uv;
  const res = { uv: [raw[0], raw[1]], raw, kind: null, pointId: null, curveId: null, align: [] };
  if (opts.noSnap) return res;
  const sk = d.sk;
  const proj = projector(pl);
  const ex = opts.exclude || new Set();
  const exc = opts.excludeCurves || new Set();
  const ctr = centers(sk);
  let best = null;
  const consider = (uv, kind, extra = {}, tol = SNAP_PX) => {
    const s = proj(uv[0], uv[1]);
    const dd = Math.hypot(s[0] - x, s[1] - y);
    if (dd <= tol && (!best || dd < best.dd - 0.01)) best = { dd, uv: [uv[0], uv[1]], kind, ...extra };
  };
  const pts = pickablePoints(sk, true);
  for (const pid of pts) {
    if (ex.has(pid)) continue;
    const P = sk.points[pid];
    consider([P.x, P.y], pid === "o" ? "origin" : ctr.has(pid) ? "center" : "point", { pointId: pid });
  }
  for (const e of opts.extra || []) consider(e.uv, e.kind || "point", { pointId: e.pointId || null });
  if (!best) {
    for (const [id, cv] of Object.entries(sk.curves)) {
      if (cv.type !== "line" || exc.has(id) || !curveVisible(cv, true)) continue;
      const a = sk.points[cv.p1], b = sk.points[cv.p2];
      consider([(a.x + b.x) / 2, (a.y + b.y) / 2], "midpoint", { curveId: id }, SNAP_PX - 2);
    }
  }
  if (best) {
    res.uv = best.uv; res.kind = best.kind; res.pointId = best.pointId || null; res.curveId = best.curveId || null;
    return res;
  }
  if (!opts.noCurve) {
    let bc = null;
    for (const [id, cv] of Object.entries(sk.curves)) {
      if (exc.has(id) || !curveVisible(cv, true)) continue;
      const n = ST.app.S.nearestOnCurve(sk, id, raw);
      if (!n) continue;
      const s = proj(n.p[0], n.p[1]);
      const dd = Math.hypot(s[0] - x, s[1] - y);
      if (dd <= CURVE_PX && (!bc || dd < bc.dd)) bc = { dd, p: n.p, id };
    }
    if (bc) { res.uv = bc.p; res.kind = "oncurve"; res.curveId = bc.id; return res; }
  }
  if (!opts.noAlign) {
    const tol = ALIGN_PX * mmPerPx(pl, raw);
    let bh = null, bv = null;
    const cand = [];
    for (const pid of pts) if (!ex.has(pid)) cand.push([sk.points[pid].x, sk.points[pid].y]);
    for (const p of opts.alignFrom || []) cand.push(p);
    for (const p of cand) {
      const dy = Math.abs(raw[1] - p[1]), dx = Math.abs(raw[0] - p[0]);
      if (dy < tol && dx > tol && (!bh || dy < bh.d - 1e-9 || (Math.abs(dy - bh.d) < 1e-9 && dx < bh.o))) bh = { d: dy, o: dx, p };
      if (dx < tol && dy > tol && (!bv || dx < bv.d - 1e-9 || (Math.abs(dx - bv.d) < 1e-9 && dy < bv.o))) bv = { d: dx, o: dy, p };
    }
    if (bh) res.uv[1] = bh.p[1];
    if (bv) res.uv[0] = bv.p[0];
    if (bh) res.align.push({ from: bh.p, to: res.uv });
    if (bv) res.align.push({ from: bv.p, to: res.uv });
  }
  if (gridSnapOn() && !opts.noGrid) {
    const step = gridStep();
    if (step > 0) {
      // keep alignment inferences on their axis, snap the free coordinate(s) to the grid
      const hasH = res.align.some((a) => a.from[1] === res.uv[1]);
      const hasV = res.align.some((a) => a.from[0] === res.uv[0]);
      if (!hasV) res.uv[0] = Math.round(res.uv[0] / step) * step;
      if (!hasH) res.uv[1] = Math.round(res.uv[1] / step) * step;
      if (!res.align.length) res.kind = "grid";
    }
  }
  return res;
}

export const isPointSnap = (s) => !!s && !!s.pointId;
