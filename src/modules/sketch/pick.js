// Pick provider: sketch points, curves, dimensions and closed profiles.
import { ST, vp, projector, rayHitPlane, segDist2D, toWorld } from "./ctx.js";
import { visibleSketches, dimElements } from "./render.js";
import { pointInPoly, regionInteriorPoint } from "../../sketch/regions.js";

const PT_TOL = 7, CURVE_TOL = 5;

/** Points that are shown (and therefore pickable) for a sketch. */
export function pickablePoints(sk, active) {
  const S = ST.app.S;
  const out = [];
  if (active) {
    if (!ST.opts.showPoints) return out;
    const used = new Set(["o"]);
    for (const cv of Object.values(sk.curves)) {
      if (cv.cons && !ST.opts.showConstruction) continue;
      if (cv.proj && !ST.opts.showProjected) continue;
      for (const p of S.curvePoints(cv)) used.add(p);
    }
    for (const p of used) if (sk.points[p]) out.push(p);
  } else {
    for (const cv of Object.values(sk.curves)) {
      if (cv.type === "point") out.push(cv.p);
      else if ((cv.type === "circle" || cv.type === "arc" || cv.type === "ellipse" || cv.type === "earc") && !cv.cons && !cv.proj) out.push(cv.c);
    }
  }
  return out;
}

export function curveVisible(cv, active) {
  if (cv.type === "point") return false;
  if (active && cv.cons && !ST.opts.showConstruction) return false;
  if (active && cv.proj && !ST.opts.showProjected) return false;
  if (!active && cv.proj && ST.app.mode !== "sketch") return false;
  return true;
}

export function regionContains(r, uv) {
  if (!pointInPoly(uv, r.outer.poly)) return false;
  return !r.holes.some((h) => pointInPoly(uv, h.poly));
}

export function profileRef(sketchId, r) {
  let c;
  try { c = regionInteriorPoint(r); } catch { c = r.centroid; }
  return { kind: "profile", sketch: sketchId, key: r.key, c };
}

/** World point of a 3D sketch point [u, v, w] (w along the plane normal). */
export function toWorld3(pl, p) {
  const w = toWorld(pl, p[0], p[1]);
  const h = p[2] || 0;
  return [w[0] + pl.n[0] * h, w[1] + pl.n[1] * h, w[2] + pl.n[2] * h];
}

export function sketchPick(x, y, ray, opts = {}) {
  const out = [];
  const A = ST.app;
  if (!A || !A.doc) return out;
  const inSketch = A.mode === "sketch";
  const kinds = opts.kinds ? new Set(opts.kinds) : null;
  const want = (k) => !kinds || kinds.has(k);
  const accept = (ref) => !opts.filter || opts.filter(ref);
  const S = A.S;
  for (const { f, d, active } of visibleSketches()) {
    if (inSketch && !active) continue;
    const sk = d.sk, pl = d.plane;
    const hp = rayHitPlane(ray, pl);
    const depth = hp ? Math.max(0, hp.t) : 1e9;
    const proj = projector(pl);
    if (want("sketchPoint")) {
      for (const pid of pickablePoints(sk, active)) {
        const P = sk.points[pid];
        const s = proj(P.x, P.y);
        const dd = Math.hypot(s[0] - x, s[1] - y);
        if (dd > PT_TOL) continue;
        const ref = { kind: "sketchPoint", sketch: f.id, point: pid };
        if (!accept(ref)) continue;
        out.push({ ref, point: toWorld(pl, P.x, P.y), depth, screenDist: dd, type: "point" });
      }
    }
    if (want("sketchCurve")) {
      for (const [cid, cv] of Object.entries(sk.curves)) {
        if (!curveVisible(cv, active)) continue;
        const polys = cv.type === "text" || cv.type === "c3d" ? S.curvePolylines(S, sk, cid, 72) : [S.curvePolyline(sk, cid, 72)];
        const poly = polys[0] || [];
        const W = cv.type === "c3d" ? (p) => vp().toScreen(toWorld3(pl, p)) : (p) => proj(p[0], p[1]);
        let best = Infinity;
        for (const pll of polys) {
          let prev = null;
          for (const p of pll) {
            const s = W(p);
            if (prev) best = Math.min(best, segDist2D([x, y], prev, s));
            prev = s;
          }
        }
        if (best > CURVE_TOL) continue;
        if (!poly.length) continue;
        const ref = { kind: "sketchCurve", sketch: f.id, curve: cid };
        if (!accept(ref)) continue;
        const np = hp ? S.nearestOnCurve(sk, cid, hp.uv) : null;
        out.push({ ref, point: np ? toWorld(pl, np.p[0], np.p[1]) : cv.type === "c3d" ? toWorld3(pl, poly[0]) : hp ? hp.world : toWorld(pl, poly[0][0], poly[0][1]), depth, screenDist: best, type: "curve" });
      }
    }
    if (active && want("sketchDim") && ST.opts.showDims) {
      const cr = vp().canvas.getBoundingClientRect();
      for (const [cid, el] of dimElements()) {
        if (el.style.display === "none") continue;
        const r = el.getBoundingClientRect();
        const lx = r.left - cr.left, ly = r.top - cr.top;
        if (x < lx - 2 || x > lx + r.width + 2 || y < ly - 2 || y > ly + r.height + 2) continue;
        const ref = { kind: "sketchDim", sketch: f.id, cid };
        if (!accept(ref)) continue;
        out.push({ ref, point: hp ? hp.world : pl.o, depth, screenDist: 0, type: "point" });
      }
    }
    if (want("profile") && hp && hp.t > 0 && (!active || ST.opts.showProfile)) {
      const regs = (d.regions && d.regions.regions) || [];
      for (const r of regs) {
        if (!regionContains(r, hp.uv)) continue;
        const ref = profileRef(f.id, r);
        if (!accept(ref)) continue;
        out.push({ ref, point: hp.world, depth: hp.t - Math.max(1e-4, hp.t * 1e-5), screenDist: 0, type: "area" });
      }
    }
  }
  return out;
}

export function installPick() {
  return vp().addPickProvider((x, y, ray, opts) => sketchPick(x, y, ray, opts || {}));
}
