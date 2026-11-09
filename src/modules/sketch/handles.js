// Tangent and curvature handles of fit point splines (right-click a fit point):
// "Activate Tangent handle" (AddTangentHandle), "Deactivate Tangent Handle" (DeleteTangentCommand),
// "Activate Curvature handle" (AddCurvatureHandle), "Deactivate Curvature Handle" (DeleteCurvatureCommand).
// An active tangent handle is a construction line from the fit point; the spline's derivative there is
// (handle end - fit point) * cv.hs[k] (src/sketch/curves.js handleDerivs), so turning or stretching the
// handle (drag, constraints, dimensions) bends the spline. A curvature handle is a second construction
// line from the tangent handle's end to a point of the osculating parabola (curves.js handleCurvatures):
// dragging that point sideways sets the curvature at the fit point, G2 on both sides.
import { ST, activeData, mutateSketch } from "./ctx.js";

/** {spline, k, point, active, curv} for one selected fit point of a fit point spline, else null. */
export function fitPointInfo(items) {
  const d = activeData();
  if (!d || !items || items.length !== 1) return null;
  const r = items[0];
  if (!r || r.kind !== "sketchPoint" || r.sketch !== ST.sketchId) return null;
  for (const [id, cv] of Object.entries(d.sk.curves)) {
    if (cv.type !== "spline" || cv.proj) continue;
    const k = cv.pts.indexOf(r.point);
    if (k < 0) continue;
    const active = !!(cv.hd && cv.hd[k] && d.sk.curves[cv.hd[k]]);
    return { spline: id, k, point: r.point, active, curv: active && !!(cv.hk && cv.hk[k] && d.sk.curves[cv.hk[k]]) };
  }
  return null;
}

/** Tangent handle geometry along the spline's current tangent: {end, scale} or null. */
function tangentHandle(info) {
  const A = ST.app;
  const d = activeData();
  const g = A.S.curveGeom(d.sk, info.spline);
  const m = g && g.fit && g.fit.m && g.fit.m[info.k];
  const p = d.sk.points[info.point];
  if (!m || !p) return null;
  const speed = Math.hypot(m[0], m[1]);
  if (speed < 1e-12) return null;
  // handle length: a third of the shorter neighbouring chord
  const h = g.fit.h || [];
  const near = [h[info.k - 1], h[info.k]].filter((x) => x > 0);
  const L = Math.max(1e-3, (near.length ? Math.min(...near) : 10) / 3);
  return { end: [p.x + (m[0] / speed) * L, p.y + (m[1] / speed) * L], scale: speed / L };
}

function addTangent(sk, info, t) {
  const A = ST.app;
  const cv = sk.curves[info.spline];
  const q = A.S.addPoint(sk, t.end[0], t.end[1]);
  const lid = A.S.addLine(sk, info.point, q, true);
  cv.hd = { ...(cv.hd || {}), [info.k]: lid };
  cv.hs = { ...(cv.hs || {}), [info.k]: t.scale };
  return lid;
}

/** Adds the handle along the spline's current tangent (the shape does not change). */
export function activateTangentHandle(info) {
  const t = tangentHandle(info);
  if (!t) return null;
  return mutateSketch("Activate Tangent handle", (sk) => addTangent(sk, info, t));
}

export function deactivateTangentHandle(info) {
  const A = ST.app;
  return mutateSketch("Deactivate Tangent Handle", (sk) => {
    const cv = sk.curves[info.spline];
    const lid = cv && cv.hd && cv.hd[info.k];
    if (lid && sk.curves[lid]) A.S.removeEntities(sk, [lid]); // takes a curvature handle with it
    if (cv && cv.hd) { delete cv.hd[info.k]; if (cv.hs) delete cv.hs[info.k]; }
    if (cv && cv.hk) delete cv.hk[info.k];
  });
}

/**
 * Adds a curvature handle for the spline's current curvature at the fit point (the shape does not
 * change); a tangent handle is activated first when the fit point has none (as in Fusion).
 */
export function activateCurvatureHandle(info) {
  const A = ST.app;
  const d = activeData();
  const f0 = A.S.splineOf(d.sk, info.spline);
  if (!f0) return null;
  const K = A.S.fitCurvatureAt(f0, info.k);
  const t = info.active ? null : tangentHandle(info);
  if (!info.active && !t) return null;
  return mutateSketch("Activate Curvature handle", (sk) => {
    const cv = sk.curves[info.spline];
    const lid = info.active ? cv.hd[info.k] : addTangent(sk, info, t);
    const l = sk.curves[lid];
    const qid = l.p1 === info.point ? l.p2 : l.p1;
    const a = [sk.points[info.point].x, sk.points[info.point].y], q = [sk.points[qid].x, sk.points[qid].y];
    const r = A.S.curvatureHandlePoint(a, q, K);
    if (!r) throw new Error("The tangent handle has no length");
    const rp = A.S.addPoint(sk, r[0], r[1]);
    const cl = A.S.addLine(sk, qid, rp, true);
    cv.hk = { ...(cv.hk || {}), [info.k]: cl };
    return cl;
  });
}

export function deactivateCurvatureHandle(info) {
  const A = ST.app;
  return mutateSketch("Deactivate Curvature Handle", (sk) => {
    const cv = sk.curves[info.spline];
    const lid = cv && cv.hk && cv.hk[info.k];
    if (cv && cv.hk) delete cv.hk[info.k];
    if (lid && sk.curves[lid]) A.S.removeEntities(sk, [lid]);
  });
}
