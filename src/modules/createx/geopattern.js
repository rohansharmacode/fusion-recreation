// createx: Geometric Pattern (FusionPatternGeometricCommand). Feature 'geopattern' ("G-Pattern" in the
// timeline): box / cylinder / sphere primitives or a custom body spread across a planar face in a rectangular,
// circular, radial, hexagonal or triangular distribution, with sizes changing between two size limits, then
// joined to / cut from / intersected with the face's body or made into a new body.
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import { toBodyRef } from "../dialogs/common.js";
import { V, orthoFrame, bodyTriangles, minAreaRect, fuseMany, rigidShape } from "./geom.js";

const R = K.R;
const RAD = Math.PI / 180;
const MAX_INSTANCES = 1500;

/** 2D description of a planar face: frame F (x = U, y = V, z = outward normal), triangles, boundary segments, rect. */
function faceDomain(st, ref) {
  const b = st.bodies.get(ref.body);
  if (!b) throw new Error("Missing face to pattern across for geometric pattern.");
  const idx = M.locateFace(b.shape, ref);
  const fi = idx >= 0 ? K.topoOf(b.shape).faces[idx] : null;
  if (!fi) throw new Error("Missing face to pattern across for geometric pattern.");
  if (fi.type !== "PLANE") throw new Error("Select a planar face to apply the geometric pattern.");
  const T = bodyTriangles(st, ref.body);
  const tris = [];
  for (let t = 0; t < T.faceOf.length; t++) if (T.faceOf[t] === idx) tris.push(t);
  if (!tris.length) throw new Error("The face could not be triangulated");
  const P = T.positions, I = T.indices;
  const vtx = (i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  let n = V.norm(fi.n);
  // centroid (area weighted)
  let A = 0, c = [0, 0, 0];
  for (const t of tris) {
    const a = vtx(I[3 * t]), bq = vtx(I[3 * t + 1]), cq = vtx(I[3 * t + 2]);
    const ar = V.len(V.cross(V.sub(bq, a), V.sub(cq, a))) / 2;
    A += ar;
    c = V.add(c, V.mul(V.add(a, V.add(bq, cq)), ar / 3));
  }
  c = V.mul(c, 1 / (A || 1));
  const F0 = orthoFrame(c, n);
  const to2 = (p) => { const d = V.sub(p, c); return [V.dot(d, F0.x), V.dot(d, F0.y)]; };
  const pts2 = [];
  for (const t of tris) for (let k = 0; k < 3; k++) pts2.push(to2(vtx(I[3 * t + k])));
  const rect = minAreaRect(pts2);
  const ca = Math.cos(rect.angle), sa = Math.sin(rect.angle);
  const F = orthoFrame(c, n, V.add(V.mul(F0.x, ca), V.mul(F0.y, sa)));
  const loc = (p) => { const d = V.sub(p, c); return [V.dot(d, F.x), V.dot(d, F.y)]; };
  const tri2 = tris.map((t) => [loc(vtx(I[3 * t])), loc(vtx(I[3 * t + 1])), loc(vtx(I[3 * t + 2]))]);
  // boundary edges: edges used by one face triangle (vertex indices are shared within a face)
  const cnt = new Map();
  for (const t of tris) for (let k = 0; k < 3; k++) {
    const a = I[3 * t + k], bq = I[3 * t + ((k + 1) % 3)];
    const key = a < bq ? `${a}_${bq}` : `${bq}_${a}`;
    cnt.set(key, (cnt.get(key) || 0) + 1);
  }
  const segs = [];
  for (const [key, m] of cnt) if (m === 1) { const [a, bq] = key.split("_").map(Number); segs.push([loc(vtx(a)), loc(vtx(bq))]); }
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const tr of tri2) for (const q of tr) { u0 = Math.min(u0, q[0]); u1 = Math.max(u1, q[0]); v0 = Math.min(v0, q[1]); v1 = Math.max(v1, q[1]); }
  return { F, tri2, segs, u0, u1, v0, v1, body: ref.body };
}
function inside2(D, p) {
  for (const [a, b, c] of D.tri2) {
    const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
    const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
    const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
    const neg = d1 < -1e-12 || d2 < -1e-12 || d3 < -1e-12, pos = d1 > 1e-12 || d2 > 1e-12 || d3 > 1e-12;
    if (!(neg && pos)) return true;
  }
  return false;
}
function boundaryDist(D, p) {
  let d = Infinity;
  for (const [a, b] of D.segs) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-18;
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    d = Math.min(d, Math.hypot(a[0] + u * dx - p[0], a[1] + u * dy - p[1]));
  }
  return d;
}

/** Instance centres (face-frame uv) of the distribution. */
function layout(f, P, D) {
  const num = (k, d) => (f[k] !== undefined && f[k] !== "" ? M.fval(P, f, k) : d);
  const out = [];
  const cu = (D.u0 + D.u1) / 2, cv = (D.v0 + D.v1) / 2;
  const rmax = Math.hypot(D.u1 - D.u0, D.v1 - D.v0) / 2;
  const dist = f.distrib || "rect";
  if (dist === "rect") {
    const nu = Math.max(1, Math.round(num("uq", 5))), nv = Math.max(1, Math.round(num("vq", 5)));
    const axis = (n, lo, hi, off, step, align) => {
      const a = lo + off, b = hi - off;
      if (f.spacing !== "increment") return Array.from({ length: n }, (_, i) => a + ((i + 0.5) * (b - a)) / n);
      if (align === "distribute") return Array.from({ length: n }, (_, i) => (n === 1 ? (a + b) / 2 : a + (i * (b - a)) / (n - 1)));
      if (align === "left" || align === "bottom") return Array.from({ length: n }, (_, i) => a + i * step);
      if (align === "right" || align === "top") return Array.from({ length: n }, (_, i) => b - i * step);
      const m = (a + b) / 2;
      return Array.from({ length: n }, (_, i) => m + (i - (n - 1) / 2) * step);
    };
    const us = axis(nu, D.u0, D.u1, num("uoff", 0), num("ud", 10), f.ualign || "center");
    const vs = axis(nv, D.v0, D.v1, num("voff", 0), num("vd", 10), f.valign || "middle");
    for (const u of us) for (const v of vs) out.push([u, v]);
  } else if (dist === "circular") {
    const rd = num("radialDist", 10), d = num("dist", 10);
    if (!(rd > 0) || !(d > 0)) throw new Error("The distance must be greater than zero");
    out.push([cu, cv]);
    for (let k = 1; k * rd <= rmax + 1e-9 && out.length <= MAX_INSTANCES; k++) {
      const r = k * rd, n = Math.max(1, Math.round((2 * Math.PI * r) / d));
      for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; out.push([cu + r * Math.cos(a), cv + r * Math.sin(a)]); }
    }
  } else if (dist === "radial") {
    const n = Math.max(1, Math.round(num("quantity", 8))), rd = num("radialDist", 10);
    if (!(rd > 0)) throw new Error("The distance must be greater than zero");
    out.push([cu, cv]);
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      for (let k = 1; k * rd <= rmax + 1e-9; k++) out.push([cu + k * rd * Math.cos(a), cv + k * rd * Math.sin(a)]);
    }
  } else {
    const d = num("dist", 10);
    if (!(d > 0)) throw new Error("The distance must be greater than zero");
    const N = Math.ceil(rmax / d) + 2;
    // lattice points inside the covering circle (before the face filters): refuse millions up front
    const est = (Math.PI * rmax * rmax) / (d * d) * (dist === "tri" ? 1.155 : 0.77);
    if (est > 1e6) throw new Error(`The pattern has more than ${MAX_INSTANCES} objects; increase the distances`);
    if (dist === "tri") {
      for (let j = -N; j <= N; j++) for (let i = -N; i <= N; i++) out.push([cu + i * d + (j & 1 ? d / 2 : 0), cv + (j * d * Math.sqrt(3)) / 2]);
    } else {
      // honeycomb: triangular lattice of spacing d*sqrt(3) with a two-point basis
      const a1 = [1.5 * d, (d * Math.sqrt(3)) / 2], a2 = [1.5 * d, (-d * Math.sqrt(3)) / 2];
      const M2 = Math.ceil(rmax / d) + 2;
      for (let i = -M2; i <= M2; i++) for (let j = -M2; j <= M2; j++) {
        const bx = cu + i * a1[0] + j * a2[0], by = cv + i * a1[1] + j * a2[1];
        out.push([bx, by], [bx + d, by]);
      }
    }
  }
  return out.filter((p) => Math.hypot(p[0] - cu, p[1] - cv) <= rmax + 1e-6);
}

/** Instances [{uv, size}] after the face / perimeter filters. */
export function placements(f, P, D) {
  const num = (k, d) => (f[k] !== undefined && f[k] !== "" ? M.fval(P, f, k) : d);
  const s1 = num("size1", 5), s2 = f.size2 !== undefined && f.size2 !== "" ? num("size2", s1) : s1;
  if (!(s1 > 0) || !(s2 > 0)) throw new Error("The size limits must be greater than zero");
  const spread = Math.max(0.01, num("spread", 1));
  const poff = num("perimOff", 0);
  const cu = (D.u0 + D.u1) / 2, cv = (D.v0 + D.v1) / 2;
  const pts = layout(f, P, D);
  let rm = 0;
  for (const p of pts) rm = Math.max(rm, Math.hypot(p[0] - cu, p[1] - cv));
  const out = [];
  for (const p of pts) {
    const t = rm > 1e-9 ? Math.hypot(p[0] - cu, p[1] - cv) / rm : 0;
    const size = s1 + (s2 - s1) * Math.pow(t, spread);
    if (!inside2(D, p)) continue;
    const bd = boundaryDist(D, p);
    if (bd < poff - 1e-9) continue;
    if (f.clear && bd < size / 2 + poff - 1e-9) continue;
    out.push({ uv: p, size });
    if (out.length > MAX_INSTANCES) throw new Error(`The pattern has more than ${MAX_INSTANCES} objects; increase the distances`);
  }
  return out;
}

/** Tool solid of one instance. */
function instanceShape(f, P, D, it, custom) {
  const F = D.F;
  const n = f.flip ? V.mul(F.z, -1) : F.z;
  const rot = (f.rotation !== undefined ? M.fval(P, f, "rotation") : 0) * RAD;
  const ux = V.add(V.mul(F.x, Math.cos(rot)), V.mul(F.y, Math.sin(rot)));
  const p = V.add(F.o, V.add(V.mul(F.x, it.uv[0]), V.mul(F.y, it.uv[1])));
  const depth = f.depth !== undefined ? M.fval(P, f, "depth") : 0;
  const s = it.size;
  const centerMode = f.extent !== "distance";
  const type = f.objType || "sphere";
  if (type === "sphere") {
    const c = centerMode ? V.add(p, V.mul(n, depth)) : p;
    const sp = R.makeSphere(s / 2);
    try { return K.translated(sp, c); } finally { K.del(sp); }
  }
  if (type === "box" || type === "cylinder") {
    let z0, h;
    if (centerMode) { z0 = depth - s / 2; h = s; } else { if (!(depth > 0)) throw new Error("The depth must be greater than zero"); z0 = -depth; h = 2 * depth; }
    const pl = { o: V.add(p, V.mul(n, z0)), x: ux, n };
    const d = type === "box" ? R.drawRectangle(s, s) : R.drawCircle(s / 2);
    return K.extrudeDrawing(d, pl, 0, h, 0);
  }
  // custom body: scaled to the size (largest extent across the face), centred on the instance point
  const { shape, bb } = custom;
  const ext = Math.max(...[0, 1, 2].map((i) => bb.max[i] - bb.min[i]));
  const k = s / Math.max(1e-9, ext);
  const c0 = V.mul(V.add(bb.min, bb.max), 0.5);
  const c = centerMode ? V.add(p, V.mul(n, depth)) : p;
  let sc = K.scaledUniform(shape, k, c0);
  let T;
  if (f.orientation === "face") {
    // object Z -> face normal, object X -> pattern U (with rotation)
    const Fo = { o: c0, x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, Ft = orthoFrame(c0, n, ux);
    const Rm = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => Ft.x[i] * Fo.x[j] + Ft.y[i] * Fo.y[j] + Ft.z[i] * Fo.z[j]));
    T = { R: Rm, pivot: c0, t: V.sub(c, c0) };
  } else {
    const ca = Math.cos(rot), sa = Math.sin(rot), a = n;
    // rotation about the face normal by `rotation`
    const Rm = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => (i === j ? ca : 0) + (1 - ca) * a[i] * a[j] + sa * [[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]][i][j]));
    T = { R: Rm, pivot: c0, t: V.sub(c, c0) };
  }
  try { return rigidShape(T, sc); } finally { K.del(sc); }
}

export function registerGeoPatternFeature(app) {
  M.registerFeature("geopattern", {
    label: "Geometric Pattern",
    stem: "G-Pattern",
    fields: { uq: "none", vq: "none", ud: "length", vd: "length", uoff: "length", voff: "length", quantity: "none", radialDist: "length", dist: "length", perimOff: "length", size1: "length", size2: "length", spread: "none", rotation: "angle", depth: "length" },
    makesBodies: (f) => f.operation === "new",
    apply(st, f, P, doc) {
      const fr = (f.faces || [])[0];
      if (!fr) throw new Error("Missing face to pattern across for geometric pattern.");
      const D = faceDomain(st, fr);
      const its = placements(f, P, D);
      if (!its.length) throw new Error("No objects fit on the face");
      let custom = null;
      if ((f.objType || "sphere") === "custom") {
        const cb = f.custom && st.bodies.get(f.custom);
        if (!cb) throw new Error("Missing custom object for geometric pattern.");
        custom = { shape: cb.shape, bb: K.bboxOf(cb.shape) };
      }
      const tools = [];
      try {
        for (const it of its) tools.push(instanceShape(f, P, D, it, custom));
        const op = f.operation || "join";
        const target = st.bodies.get(D.body);
        let res;
        if (op === "new") {
          res = fuseMany(tools);
          st.bodies.set(f.newBody, { id: f.newBody, shape: res, from: f.id });
          st._tool = null;
          return { affected: [f.newBody], count: its.length };
        }
        if (op === "cut") res = K.cutMany(target.shape, tools);
        else if (op === "join") res = fuseMany([target.shape, ...tools]);
        else { const u = fuseMany(tools); try { res = K.intersect(target.shape, u); } finally { K.del(u); } }
        if (K.isEmptyShape(res)) { st.bodies.delete(D.body); }
        else st.bodies.set(D.body, { id: D.body, shape: res, from: f.id });
        return { affected: [D.body], count: its.length };
      } finally { K.del(tools); }
    },
    deps: (f) => ({ sketches: [], bodies: [...(f.faces || []).map((r) => r.body), ...(f.custom ? [f.custom] : [])], features: [], cplanes: [], geo: f.faces || [] }),
    touches: (f) => (f.operation === "new" ? [] : (f.faces || []).map((r) => r.body)),
    editor: (a, id) => openGeoPattern(a, { editId: id }),
    icon: "FusionPatternGeometricCommand",
  });
}

// ---------------------------------------------------------------- dialog
const NUMS = ["uq", "vq", "ud", "vd", "uoff", "voff", "quantity", "radialDist", "dist", "perimOff", "size1", "size2", "spread", "rotation", "depth"];
const OPS = [{ value: "join", label: "Join", icon: "join" }, { value: "cut", label: "Cut", icon: "cut" }, { value: "intersect", label: "Intersect", icon: "intersect" }, { value: "new", label: "New Body", icon: "newBody" }];

export function openGeoPattern(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const L = (id, label, def, extra = {}) => ({ id, type: "value", label, kind: "length", default: def, ...extra });
  const isD = (...ds) => (v) => ds.includes(v.distrib);
  return app.ui.dialog.open({
    id: "FusionPatternGeometricCommand",
    title: "Geometric Pattern",
    icon: "FusionPatternGeometricCommand",
    editId,
    featureLabel: "Geometric Pattern",
    help: "Spreads objects across a face with changing size and spacing.",
    labelWidth: 120,
    preselect: (opts.preselect || []).filter((r) => r.kind === "face"),
    rows: [
      { id: "objType", type: "dropdown", label: "Object Type", options: [{ value: "box", label: "Box" }, { value: "cylinder", label: "Cylinder" }, { value: "sphere", label: "Sphere" }, { value: "custom", label: "Custom" }], default: "sphere" },
      { id: "custom", type: "selection", label: "Custom Object", kinds: ["body", "face"], mapRef: toBodyRef, max: 1, prompt: "Select object to pattern", tooltip: "Select a custom object to pattern across selected faces.", visible: (v) => v.objType === "custom" },
      { id: "faces", type: "selection", label: "Face", kinds: ["face"], planar: true, max: 1, prompt: "Select faces to pattern across", tooltip: "Select face to apply a pattern." },
      { id: "gd", type: "group", label: "Object Distribution", rows: [
        { id: "distrib", type: "dropdown", label: "Distribution Type", options: [{ value: "rect", label: "Rectangular" }, { value: "circular", label: "Circular" }, { value: "radial", label: "Radial" }, { value: "hex", label: "Hexagonal" }, { value: "tri", label: "Triangular" }], default: "rect" },
        { id: "spacing", type: "dropdown", label: "Spacing Type", options: [{ value: "extent", label: "Extent" }, { value: "increment", label: "Increment" }], default: "extent", visible: isD("rect") },
        { id: "uq", type: "value", label: "U Quantity", kind: "none", default: "5", integer: true, min: 1, visible: isD("rect") },
        { id: "vq", type: "value", label: "V Quantity", kind: "none", default: "5", integer: true, min: 1, visible: isD("rect") },
        L("ud", "U Distance", "10.00 mm", { positive: true, visible: (v) => v.distrib === "rect" && v.spacing === "increment" }),
        L("vd", "V Distance", "10.00 mm", { positive: true, visible: (v) => v.distrib === "rect" && v.spacing === "increment" }),
        L("uoff", "U Offset", "0.00 mm", { visible: isD("rect") }),
        L("voff", "V Offset", "0.00 mm", { visible: isD("rect") }),
        { id: "ualign", type: "dropdown", label: "U Alignment", options: [{ value: "left", label: "Align Left" }, { value: "center", label: "Align Center" }, { value: "right", label: "Align Right" }, { value: "distribute", label: "Distribute" }], default: "center", visible: (v) => v.distrib === "rect" && v.spacing === "increment" },
        { id: "valign", type: "dropdown", label: "V Alignment", options: [{ value: "bottom", label: "Align Bottom" }, { value: "middle", label: "Align Middle" }, { value: "top", label: "Align Top" }, { value: "distribute", label: "Distribute" }], default: "middle", visible: (v) => v.distrib === "rect" && v.spacing === "increment" },
        { id: "quantity", type: "value", label: "Quantity", kind: "none", default: "8", integer: true, min: 1, visible: isD("radial") },
        L("radialDist", "Radial Distance", "10.00 mm", { positive: true, visible: isD("circular", "radial") }),
        L("dist", "Distance", "10.00 mm", { positive: true, visible: isD("circular", "hex", "tri") }),
        { id: "clear", type: "check", label: "Clear Perimeter", default: false, tooltip: "Removes incomplete objects from the perimeter of the selected faces." },
        L("perimOff", "Perimeter Offset", "0.00 mm", { nonNegative: true }),
      ] },
      { id: "gs", type: "group", label: "Object Size", rows: [
        L("size1", "Size Limit 1", "5.00 mm", { positive: true, tooltip: "Specify a minimum or maximum size for the objects in the pattern." }),
        L("size2", "Size Limit 2", "5.00 mm", { positive: true, tooltip: "Specify a minimum or maximum size for the objects in the pattern." }),
        { id: "spread", type: "value", label: "Spread", kind: "none", default: "1.00", positive: true, tooltip: "Specify the rate of transition from one size limit to the other." },
      ] },
      { id: "orientation", type: "dropdown", label: "Orientation", options: [{ value: "parallel", label: "Parallel Direction" }, { value: "face", label: "Face Direction" }], default: "parallel", sep: true },
      { id: "rotation", type: "value", label: "Rotation", kind: "angle", default: "0.0 deg", tooltip: "Specify degrees to rotate the object around Z axis." },
      { id: "flip", type: "check", label: "Flip", default: false, tooltip: "Flip object direction." },
      { id: "extent", type: "dropdown", label: "Extent Type", options: [{ value: "center", label: "Center" }, { value: "distance", label: "Distance" }], default: "center" },
      L("depth", "Depth", "0.00 mm", { tooltip: "Specify the extent depth." }),
      { id: "operation", type: "dropdown", label: "Operation", options: OPS, default: "join", sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, {
        objType: f0.objType || "sphere", distrib: f0.distrib || "rect", spacing: f0.spacing || "extent", ualign: f0.ualign || "center", valign: f0.valign || "middle",
        clear: !!f0.clear, orientation: f0.orientation || "parallel", flip: !!f0.flip, extent: f0.extent || "center", operation: f0.operation || "join",
        faces: (f0.faces || []).map((r) => ({ kind: "face", body: r.body, p: r.p, n: r.n, planar: true })),
        custom: f0.custom ? [{ kind: "body", body: f0.custom }] : [],
      });
      for (const k of NUMS) if (f0[k] !== undefined) dlg.values[k] = String(f0[k]);
    },
    build(v) {
      const fr = (v.faces || [])[0];
      if (!fr) return null;
      const f = { type: "geopattern", objType: v.objType, faces: [{ body: fr.body, p: fr.p, n: fr.n }], distrib: v.distrib, spacing: v.spacing, ualign: v.ualign, valign: v.valign, orientation: v.orientation, extent: v.extent, operation: v.operation };
      for (const k of NUMS) f[k] = v[k];
      if (v.clear) f.clear = true;
      if (v.flip) f.flip = true;
      if (v.objType === "custom") { const c = (v.custom || [])[0]; if (!c) return null; f.custom = c.body; }
      return f;
    },
    status(dlg) { const r = dlg.previewRes; return r && r.ok && r.count ? `${r.count} Objects` : ""; },
  });
}
