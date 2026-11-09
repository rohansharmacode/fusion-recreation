// Tangent handles of fit point splines: Fusion's "Activate Tangent handle" (AddTangentHandle) and
// "Deactivate Tangent Handle" (DeleteTangentCommand) on a selected fit point (right-click menu).
// An active handle is a construction line from the fit point; the spline's derivative there is
// (handle end - fit point) * cv.hs[k] (src/sketch/curves.js handleDerivs), so turning or
// stretching the handle (drag, constraints, dimensions) bends the spline.
import { ST, activeData, mutateSketch } from "./ctx.js";

/** {spline, k, point, active} for one selected fit point of a fit point spline, else null. */
export function fitPointInfo(items) {
  const d = activeData();
  if (!d || !items || items.length !== 1) return null;
  const r = items[0];
  if (!r || r.kind !== "sketchPoint" || r.sketch !== ST.sketchId) return null;
  for (const [id, cv] of Object.entries(d.sk.curves)) {
    if (cv.type !== "spline" || cv.proj) continue;
    const k = cv.pts.indexOf(r.point);
    if (k >= 0) return { spline: id, k, point: r.point, active: !!(cv.hd && cv.hd[k] && d.sk.curves[cv.hd[k]]) };
  }
  return null;
}

/** Adds the handle along the spline's current tangent (the shape does not change). */
export function activateTangentHandle(info) {
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
  const end = [p.x + (m[0] / speed) * L, p.y + (m[1] / speed) * L];
  return mutateSketch("Activate Tangent handle", (sk) => {
    const cv = sk.curves[info.spline];
    const q = A.S.addPoint(sk, end[0], end[1]);
    const lid = A.S.addLine(sk, info.point, q, true);
    cv.hd = { ...(cv.hd || {}), [info.k]: lid };
    cv.hs = { ...(cv.hs || {}), [info.k]: speed / L };
    return lid;
  });
}

export function deactivateTangentHandle(info) {
  const A = ST.app;
  return mutateSketch("Deactivate Tangent Handle", (sk) => {
    const cv = sk.curves[info.spline];
    const lid = cv && cv.hd && cv.hd[info.k];
    if (lid && sk.curves[lid]) A.S.removeEntities(sk, [lid]);
    if (cv && cv.hd) { delete cv.hd[info.k]; if (cv.hs) delete cv.hs[info.k]; }
  });
}
