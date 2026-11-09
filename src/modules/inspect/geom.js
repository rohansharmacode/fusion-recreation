// Geometry helpers for the inspect module: entity resolution (refs -> replicad shapes),
// per-entity measurements, pairwise distance/angle, mass properties (volume, area, centre of
// mass from OpenCascade; inertia tensors integrated over the display mesh), number formatting.
import { materialOf } from "./library.js";

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

// ------------------------------------------------------------------ formatting
/** Fusion-style number: fixed decimals ("All Decimals" -> up to 8, trailing zeros trimmed). */
export function fmtNum(v, prec = 2) {
  if (!Number.isFinite(v)) return "-";
  if (Math.abs(v) < 1e-12) v = 0;
  if (prec === "all") {
    let s = v.toFixed(8).replace(/0+$/, "").replace(/\.$/, ".0");
    if (s === "-0.0") s = "0.0";
    return s;
  }
  const s = v.toFixed(Math.max(0, Math.min(8, Number(prec) || 0)));
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}
export const UNIT = { length: "mm", area: "mm^2", volume: "mm^3", angle: "deg", none: "" };
export function fmtVal(v, kind = "length", prec = 2) {
  const u = UNIT[kind] ?? "";
  const p = kind === "angle" && prec !== "all" ? Math.max(1, Number(prec) - 1) : prec;
  return u ? `${fmtNum(v, p)} ${u}` : fmtNum(v, p);
}
/** Secondary units: mm -> cm/m/in/ft (lengths, areas, volumes). */
const SEC = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
export function fmtSecondary(v, kind, unit, prec = 2) {
  if (!unit || unit === "none" || !SEC[unit] || !["length", "area", "volume"].includes(kind)) return "";
  const pow = kind === "area" ? 2 : kind === "volume" ? 3 : 1;
  const x = v / Math.pow(SEC[unit], pow);
  return `${fmtNum(x, prec)} ${unit}${pow > 1 ? `^${pow}` : ""}`;
}

// ------------------------------------------------------------------ OCCT access
const oc = (app) => app.K.R.getOC();
const del = (o) => { try { if (o && typeof o.delete === "function") o.delete(); } catch { /* ignore */ } };
const pnt = (p) => { const r = [p.X(), p.Y(), p.Z()]; del(p); return r; };

/** Minimum distance + closest points between two replicad shapes: {d, p1, p2} | null */
export function minDistance(app, a, b) {
  const O = oc(app);
  const ds = new O.BRepExtrema_DistShapeShape();
  try {
    ds.LoadS1(a.wrapped);
    ds.LoadS2(b.wrapped);
    ds.Perform();
    if (!ds.IsDone() || ds.NbSolution() < 1) return null;
    return { d: ds.Value(), p1: pnt(ds.PointOnShape1(1)), p2: pnt(ds.PointOnShape2(1)) };
  } catch (e) {
    console.warn("[inspect] distance failed", e);
    return null;
  } finally { del(ds); }
}

export function volumeProps(app, shape) {
  const O = oc(app);
  const g = new O.GProp_GProps();
  try {
    O.BRepGProp.VolumeProperties(shape.wrapped, g, false, false, false);
    return { volume: g.Mass(), com: pnt(g.CentreOfMass()) };
  } finally { del(g); }
}
export function surfaceArea(app, shape) {
  const O = oc(app);
  const g = new O.GProp_GProps();
  try { O.BRepGProp.SurfaceProperties(shape.wrapped, g, false, false); return g.Mass(); } finally { del(g); }
}

// ------------------------------------------------------------------ entity resolution
function sketchWorld(app, sketchId, pid) {
  const st = app.sketchState(sketchId);
  const pt = st && st.sk && st.sk.points && st.sk.points[pid];
  if (!st || !pt) return null;
  return app.K.toWorld(st.plane, pt.x, pt.y);
}

/** Plane {o, x, n} for plane-like refs (origin plane, construction plane, planar face). */
export function planeOfRef(app, ref) {
  const K = app.K;
  if (!ref) return null;
  if (ref.kind === "originPlane") return K.ORIGIN_PLANES[ref.name] ? { ...K.ORIGIN_PLANES[ref.name] } : null;
  if (ref.kind === "cplane") { const st = app.planeState(ref.id); return st ? { ...st.plane } : null; }
  if (ref.kind === "face") {
    if (ref.planar === false) return null;
    let n = ref.n, o = ref.p;
    try {
      const f = faceOf(app, ref);
      if (f) {
        if (f.geomType !== "PLANE") return null;
        n = f.normalAt(f.center).toTuple();
        o = ref.p || f.center.toTuple();
      }
    } catch { /* keep picked normal */ }
    return K.planeFromNormal(o, V.norm(n));
  }
  return null;
}

function bodyShape(app, id) { const b = app.body(id); return b ? b.shape : null; }
export function faceOf(app, ref) { const s = bodyShape(app, ref.body); try { return s ? s.faces[ref.index] || null : null; } catch { return null; } }
export function edgeOf(app, ref) { const s = bodyShape(app, ref.body); try { return s ? s.edges[ref.index] || null : null; } catch { return null; } }

/** Visible body ids (component selection = every visible body of the root component). */
export function visibleBodyIds(app) {
  return app.bodies().filter((b) => b.shape && b.meta && b.meta.visible !== false).map((b) => b.id);
}

/** replicad shape for a ref (null if it cannot be built). Bodies/faces/edges are the live model
 *  shapes (never pass them to consuming replicad operations); the rest are temporary. */
export function shapeOfRef(app, ref) {
  const R = app.K.R;
  try {
    switch (ref.kind) {
      case "body": return bodyShape(app, ref.body);
      case "face": return faceOf(app, ref);
      case "edge": return edgeOf(app, ref);
      case "vertex": return R.makeVertex(ref.p);
      case "originPoint": return R.makeVertex([0, 0, 0]);
      case "sketchPoint": { const p = sketchWorld(app, ref.sketch, ref.point); return p ? R.makeVertex(p) : null; }
      case "sketchCurve": return sketchCurveShape(app, ref);
      case "originAxis": { const d = app.K.ORIGIN_AXES[ref.name]; return R.makeLine(V.mul(d, -1e4), V.mul(d, 1e4)); }
      case "originPlane":
      case "cplane": {
        const pl = planeOfRef(app, ref);
        if (!pl) return null;
        const L = 1e4, y = app.K.planeY(pl);
        const c = (u, v) => V.add(pl.o, V.add(V.mul(pl.x, u), V.mul(y, v)));
        return R.makePolygon([c(-L, -L), c(L, -L), c(L, L), c(-L, L)]);
      }
      default: return null;
    }
  } catch (e) {
    console.warn("[inspect] shape for ref failed", ref, e);
    return null;
  }
}

function sketchCurveGeo(app, ref) {
  const st = app.sketchState(ref.sketch);
  const cv = st && st.sk && st.sk.curves && st.sk.curves[ref.curve];
  if (!cv) return null;
  const W = (pid) => sketchWorld(app, ref.sketch, pid);
  const n = st.plane.n;
  if (cv.type === "line") { const a = W(cv.p1), b = W(cv.p2); return a && b ? { type: "line", a, b, n } : null; }
  if (cv.type === "circle") {
    const c = W(cv.c);
    const cp = st.sk.points[cv.c];
    let r = Number(cv.r);
    if (!Number.isFinite(r) && cv.p1 && st.sk.points[cv.p1]) r = Math.hypot(st.sk.points[cv.p1].x - cp.x, st.sk.points[cv.p1].y - cp.y);
    return c && r > 0 ? { type: "circle", c, r, n } : null;
  }
  if (cv.type === "arc") {
    const P = st.sk.points;
    const c = P[cv.c], a = P[cv.p1], b = P[cv.p2];
    if (!c || !a || !b) return null;
    const r = Math.hypot(a.x - c.x, a.y - c.y);
    let t1 = Math.atan2(a.y - c.y, a.x - c.x), t2 = Math.atan2(b.y - c.y, b.x - c.x);
    while (t2 <= t1) t2 += Math.PI * 2; // CCW from p1 to p2
    const tm = (t1 + t2) / 2;
    const K = app.K;
    return { type: "arc", c: K.toWorld(st.plane, c.x, c.y), r, n, a: K.toWorld(st.plane, a.x, a.y), m: K.toWorld(st.plane, c.x + r * Math.cos(tm), c.y + r * Math.sin(tm)), b: K.toWorld(st.plane, b.x, b.y), sweep: t2 - t1 };
  }
  return null;
}

function sketchCurveShape(app, ref) {
  const R = app.K.R;
  const g = sketchCurveGeo(app, ref);
  if (!g) return null;
  if (g.type === "line") return R.makeLine(g.a, g.b);
  if (g.type === "circle") return R.makeCircle(g.r, g.c, g.n);
  if (g.type === "arc") return R.makeThreePointArc(g.a, g.m, g.b);
  return null;
}

// ------------------------------------------------------------------ single-entity measurement
const posRows = (p) => [["X Position", p[0], "length"], ["Y Position", p[1], "length"], ["Z Position", p[2], "length"]];
const centerRows = (p) => [["Center Position X", p[0], "length"], ["Center Position Y", p[1], "length"], ["Center Position Z", p[2], "length"]];

/**
 * Describe one selected entity.
 * -> {title, rows:[[label, value, kind]], anchor:[x,y,z], point?:[..], dir?:[..] (line), normal?:[..] (plane),
 *     center?:[..], axis?:[..], radius?, main?: {label, value, kind}}
 */
export function describe(app, ref) {
  const R = app.K.R;
  const out = { title: "", rows: [], anchor: null };
  try {
    switch (ref.kind) {
      case "vertex": case "originPoint": case "sketchPoint": {
        const p = ref.kind === "vertex" ? ref.p : ref.kind === "originPoint" ? [0, 0, 0] : sketchWorld(app, ref.sketch, ref.point);
        if (!p) return null;
        out.title = ref.kind === "vertex" ? "Vertex" : ref.kind === "originPoint" ? "Origin" : "Sketch Point";
        out.rows = posRows(p);
        out.anchor = p; out.point = p;
        return out;
      }
      case "edge": {
        const e = edgeOf(app, ref);
        if (!e) return null;
        out.title = "Edge";
        const L = e.length;
        let type = "";
        try { type = e.geomType; } catch { /* ignore */ }
        out.anchor = ref.p || e.pointAt(0.5).toTuple();
        if (type === "LINE") {
          const a = e.startPoint.toTuple(), b = e.endPoint.toTuple();
          out.dir = V.norm(V.sub(b, a)); out.seg = [a, b];
          out.anchor = V.lerp(a, b, 0.5);
          out.rows = [["Length", L, "length"]];
          out.main = { label: "Length", value: L, kind: "length" };
        } else if (type === "CIRCLE") {
          const c = e.curve.wrapped.Circle();
          const r = c.Radius();
          const loc = pnt(c.Location());
          let ax = [0, 0, 1];
          try { const d = c.Axis().Direction(); ax = [d.X(), d.Y(), d.Z()]; } catch { /* ignore */ }
          del(c);
          out.center = loc; out.axis = ax; out.radius = r;
          out.rows = [["Length", L, "length"], ["Radius", r, "length"], ["Diameter", 2 * r, "length"], ...centerRows(loc)];
          out.main = { label: "Diameter", value: 2 * r, kind: "length", prefix: "⌀ " };
        } else {
          out.rows = [["Length", L, "length"]];
          out.main = { label: "Length", value: L, kind: "length" };
        }
        return out;
      }
      case "sketchCurve": {
        const g = sketchCurveGeo(app, ref);
        if (!g) return null;
        if (g.type === "line") {
          const L = V.len(V.sub(g.b, g.a));
          out.title = "Sketch Line"; out.dir = V.norm(V.sub(g.b, g.a)); out.seg = [g.a, g.b];
          out.anchor = V.lerp(g.a, g.b, 0.5);
          out.rows = [["Length", L, "length"]];
          out.main = { label: "Length", value: L, kind: "length" };
        } else {
          const L = g.type === "circle" ? 2 * Math.PI * g.r : g.r * g.sweep;
          out.title = g.type === "circle" ? "Sketch Circle" : "Sketch Arc";
          out.center = g.c; out.axis = g.n; out.radius = g.r;
          out.anchor = g.type === "arc" ? g.m : V.add(g.c, V.mul(app.sketchState(ref.sketch).plane.x, g.r));
          out.rows = [["Length", L, "length"], ["Radius", g.r, "length"], ["Diameter", 2 * g.r, "length"], ...centerRows(g.c)];
          out.main = { label: "Diameter", value: 2 * g.r, kind: "length", prefix: "⌀ " };
        }
        return out;
      }
      case "face": {
        const f = faceOf(app, ref);
        if (!f) return null;
        const A = R.measureArea(f);
        let type = "";
        try { type = f.geomType; } catch { /* ignore */ }
        out.title = "Face";
        out.anchor = ref.p || f.center.toTuple();
        out.rows = [["Area", A, "area"]];
        out.main = { label: "Area", value: A, kind: "area" };
        if (type === "PLANE") {
          out.normal = V.norm(f.normalAt(f.center).toTuple());
          out.planePoint = f.center.toTuple();
        } else if (type === "CYLINDRE" || type === "SPHERE" || type === "CONE") {
          try {
            const S = f.surface.wrapped;
            const g = type === "CYLINDRE" ? S.Cylinder() : type === "SPHERE" ? S.Sphere() : null;
            if (g) {
              const r = g.Radius();
              const loc = pnt(g.Location());
              out.radius = r; out.center = loc;
              if (type === "CYLINDRE") { const d = g.Axis().Direction(); out.axis = [d.X(), d.Y(), d.Z()]; }
              out.rows.push(["Radius", r, "length"], ["Diameter", 2 * r, "length"]);
              if (type === "SPHERE") out.rows.push(...centerRows(loc));
              del(g);
            }
          } catch { /* not analytic */ }
        }
        return out;
      }
      case "body": {
        const ids = ref.component ? visibleBodyIds(app) : [ref.body];
        let A = 0, box = null;
        for (const id of ids) {
          const s = bodyShape(app, id);
          if (!s) continue;
          A += surfaceArea(app, s);
          const bb = app.K.bboxOf(s);
          if (bb) box = box ? { min: box.min.map((v, i) => Math.min(v, bb.min[i])), max: box.max.map((v, i) => Math.max(v, bb.max[i])) } : bb;
        }
        out.title = ref.component ? "Component" : (app.bodyMeta(ref.body).name || "Body");
        out.rows = [["Area", A, "area"]];
        out.main = { label: "Area", value: A, kind: "area" };
        out.anchor = box ? V.lerp(box.min, box.max, 0.5) : [0, 0, 0];
        return out;
      }
      case "originAxis": {
        out.title = `${ref.name} Axis`;
        out.dir = app.K.ORIGIN_AXES[ref.name];
        out.anchor = V.mul(out.dir, 10);
        out.linePoint = [0, 0, 0];
        return out;
      }
      case "originPlane": case "cplane": {
        const pl = planeOfRef(app, ref);
        if (!pl) return null;
        out.title = ref.kind === "originPlane" ? `${ref.name} Plane` : ((app.feature(ref.id) || {}).name || "Plane");
        out.normal = pl.n; out.planePoint = pl.o; out.anchor = pl.o;
        return out;
      }
      default: return null;
    }
  } catch (e) {
    console.warn("[inspect] describe failed", ref, e);
    return null;
  }
}

/** Direction-like vector of a description (for angles): {v, kind:'line'|'plane'} */
function directionOf(d) {
  if (!d) return null;
  if (d.dir) return { v: d.dir, kind: "line" };
  if (d.normal) return { v: d.normal, kind: "plane" };
  if (d.axis && d.radius && d.title === "Face") return { v: d.axis, kind: "line" };
  return null;
}

/**
 * Pairwise measurement: {distance, p1, p2, centerDistance?, c1?, c2?, angle?, delta:[dx,dy,dz]}
 */
export function measurePair(app, r1, r2, d1, d2) {
  const out = {};
  const s1 = shapeOfRef(app, r1), s2 = shapeOfRef(app, r2);
  if (s1 && s2) {
    if (r1.kind === "body" && r1.component) out.note = "component";
    const res = minDistance(app, s1, s2);
    if (res) { out.distance = res.d; out.p1 = res.p1; out.p2 = res.p2; }
  }
  if (d1 && d2 && d1.center && d2.center && (d1.radius || d2.radius)) {
    out.c1 = d1.center; out.c2 = d2.center;
    out.centerDistance = V.len(V.sub(d2.center, d1.center));
  }
  const a = directionOf(d1), b = directionOf(d2);
  if (a && b) {
    let cos = Math.abs(V.dot(V.norm(a.v), V.norm(b.v)));
    cos = Math.min(1, cos);
    let ang = (Math.acos(cos) * 180) / Math.PI;
    if (a.kind !== b.kind) ang = 90 - ang; // line vs plane: angle to the plane, not to its normal
    out.angle = Math.abs(ang) < 1e-9 ? 0 : ang;
  }
  const from = out.c1 && out.c2 ? out.c1 : out.p1, to = out.c1 && out.c2 ? out.c2 : out.p2;
  if (from && to) out.delta = V.sub(to, from).map(Math.abs);
  out.from = from; out.to = to;
  return out;
}

// ------------------------------------------------------------------ mass properties
/** Second moments of volume (about the world origin) integrated over the display mesh. */
function meshMoments(app, shape) {
  let md = null;
  try { md = app.viewport && app.viewport.meshFor ? app.viewport.meshFor(shape) : app.K.meshBody(shape, 100); } catch { md = null; }
  if (!md) return null;
  const P = md.vertices, T = md.triangles;
  let vol = 0, mx = 0, my = 0, mz = 0, sxx = 0, syy = 0, szz = 0, sxy = 0, sxz = 0, syz = 0;
  for (let i = 0; i < T.length; i += 3) {
    const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3;
    const ax = P[a], ay = P[a + 1], az = P[a + 2];
    const bx = P[b], by = P[b + 1], bz = P[b + 2];
    const cx = P[c], cy = P[c + 1], cz = P[c + 2];
    const v = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    vol += v;
    mx += v * (ax + bx + cx) / 4; my += v * (ay + by + cy) / 4; mz += v * (az + bz + cz) / 4;
    sxx += v / 10 * (ax * ax + bx * bx + cx * cx + ax * bx + ax * cx + bx * cx);
    syy += v / 10 * (ay * ay + by * by + cy * cy + ay * by + ay * cy + by * cy);
    szz += v / 10 * (az * az + bz * bz + cz * cz + az * bz + az * cz + bz * cz);
    sxy += v / 20 * (2 * (ax * ay + bx * by + cx * cy) + ax * by + ax * cy + bx * ay + bx * cy + cx * ay + cx * by);
    sxz += v / 20 * (2 * (ax * az + bx * bz + cx * cz) + ax * bz + ax * cz + bx * az + bx * cz + cx * az + cx * bz);
    syz += v / 20 * (2 * (ay * az + by * bz + cy * cz) + ay * bz + ay * cz + by * az + by * cz + cy * az + cy * bz);
  }
  const s = vol < 0 ? -1 : 1;
  return { vol: vol * s, m1: [mx * s, my * s, mz * s], sxx: sxx * s, syy: syy * s, szz: szz * s, sxy: sxy * s, sxz: sxz * s, syz: syz * s };
}

const tensor = (sxx, syy, szz, sxy, sxz, syz, rho) => [
  [rho * (syy + szz), -rho * sxy, -rho * sxz],
  [-rho * sxy, rho * (sxx + szz), -rho * syz],
  [-rho * sxz, -rho * syz, rho * (sxx + syy)],
];

/**
 * Mass properties of a set of bodies (material densities applied).
 * -> {volume (mm^3), area (mm^2), mass (g), density (g/mm^3, mass/volume), com, bbox:{min,max},
 *     inertiaOrigin, inertiaCom (3x3, g mm^2), materials:[names], count}
 */
export function massProps(app, ids, opts = {}) {
  let volume = 0, area = 0, mass = 0, box = null;
  const mcom = [0, 0, 0];
  let S = { sxx: 0, syy: 0, szz: 0, sxy: 0, sxz: 0, syz: 0 }; // density-weighted second moments
  const mats = new Set();
  let count = 0;
  let inertiaOk = opts.inertia !== false;
  for (const id of ids) {
    const b = app.body(id);
    if (!b || !b.shape) continue;
    const meta = app.bodyMeta(id);
    const mat = materialOf(meta);
    mats.add(mat.name);
    const rho = mat.density / 1000; // g/cm^3 -> g/mm^3
    let vp;
    try { vp = volumeProps(app, b.shape); } catch (e) { console.warn(e); continue; }
    count++;
    volume += vp.volume;
    mass += vp.volume * rho;
    for (let k = 0; k < 3; k++) mcom[k] += vp.com[k] * vp.volume * rho;
    if (opts.area !== false) { try { area += surfaceArea(app, b.shape); } catch { /* ignore */ } }
    const bb = app.K.bboxOf(b.shape);
    if (bb) box = box ? { min: box.min.map((v, i) => Math.min(v, bb.min[i])), max: box.max.map((v, i) => Math.max(v, bb.max[i])) } : { min: [...bb.min], max: [...bb.max] };
    if (inertiaOk) {
      const mm = meshMoments(app, b.shape);
      if (!mm || !(mm.vol > 0)) { inertiaOk = false; continue; }
      // scale mesh moments to the exact volume so mass and inertia stay consistent
      const k = vp.volume / mm.vol;
      for (const key of Object.keys(S)) S[key] += mm[key] * k * rho;
    }
  }
  const com = mass > 0 ? mcom.map((v) => v / mass) : [0, 0, 0];
  const out = { volume, area, mass, density: volume > 0 ? mass / volume : 0, com, bbox: box, materials: [...mats], count };
  if (inertiaOk && count) {
    out.inertiaOrigin = tensor(S.sxx, S.syy, S.szz, S.sxy, S.sxz, S.syz, 1);
    const [cx, cy, cz] = com;
    out.inertiaCom = tensor(S.sxx - mass * cx * cx, S.syy - mass * cy * cy, S.szz - mass * cz * cz, S.sxy - mass * cx * cy, S.sxz - mass * cx * cz, S.syz - mass * cy * cz, 1);
  }
  return out;
}
