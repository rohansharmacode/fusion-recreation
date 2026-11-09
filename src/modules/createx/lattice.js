// createx: Volumetric Lattice (VolFieldCreateLatticeCommand) and Volumetric Texture (VolFieldTextureCommand).
// Both turn the selected body into a volumetric model body (kind 'volumetric', a closed triangle mesh from
// an implicit field sampled on a voxel grid: signed distance of the body combined with a lattice / texture).
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import * as VX from "./vox.js";
import { V, bodyTriangles, buildPath, pathRefs, curvePolylines, pointOf } from "./geom.js";

// ---------------------------------------------------------------- shared
const CACHE = new WeakMap(); // source shape | mesh -> Map(key -> {mesh, warning})
function cached(src, key, make) {
  let m = CACHE.get(src);
  if (!m) { m = new Map(); CACHE.set(src, m); }
  if (m.has(key)) return m.get(key);
  const r = make();
  m.set(key, r);
  if (m.size > 4) m.delete(m.keys().next().value);
  return r;
}
let TOK = 0;
const TOKENS = new WeakMap();
/** Stable small number per shape / mesh object (cache keys follow upstream changes of other bodies). */
const tokenOf = (o) => { if (!o || typeof o !== "object") return 0; let t = TOKENS.get(o); if (!t) { t = ++TOK; TOKENS.set(o, t); } return t; };
function sourceOf(st, id) {
  const b = st.bodies.get(id);
  if (b) {
    if (!M.isSolidBody(st, id)) throw new Error("Select a solid or closed mesh body");
    return { src: b.shape, brep: true };
  }
  const mb = st.meshBodies && st.meshBodies.get(id);
  if (mb && mb.mesh) return { src: mb.mesh, brep: false, kind: mb.kind };
  throw new Error("Select a solid or closed mesh body");
}
const srcObj = (st, id) => { const b = st.bodies.get(id); if (b) return b.shape; const m = st.meshBodies && st.meshBodies.get(id); return m ? m.mesh : null; };
function replaceWithModel(st, id, f, mesh, extra = {}) {
  st.bodies.delete(id);
  st.meshBodies.set(id, { id, kind: "volumetric", mesh, from: f.id, ...extra });
}
const smin = (a, b, k) => {
  if (!(k > 0)) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
};
const NODES = 9e5; // display resolution budget (grid nodes)
const num = (P, f, k, d) => (f[k] !== undefined && f[k] !== "" ? M.fval(P, f, k) : d);

// ---------------------------------------------------------------- regions (lattice offsets, texture clearances)
export const MAX_REGIONS = 4;
const emptyGeom = () => ({ faces: [], bodies: [], curves: [], edges: [], points: [] });
/** Regions of a feature: [{geom, t, fall, sol}] from f.regions + fields <p>t<i>, <p>f<i>, <p>s<i> (older: regionFaces). */
function regionsOf(f, P, prefix) {
  const out = [];
  const list = Array.isArray(f.regions) ? f.regions : (f.regionFaces || []).length ? [{ ...emptyGeom(), faces: f.regionFaces }] : [];
  list.slice(0, MAX_REGIONS).forEach((geom, i) => {
    const n = i + 1;
    const legacy = !Array.isArray(f.regions);
    out.push({
      geom: { ...emptyGeom(), ...geom },
      t: Math.max(0, num(P, f, legacy ? "regionThickness" : `${prefix}t${n}`, 1)),
      fall: Math.max(0, num(P, f, legacy ? "falloff" : `${prefix}f${n}`, 0)),
      sol: Math.max(0, Math.min(1, num(P, f, `${prefix}s${n}`, 1))),
    });
  });
  return out;
}
/** Geometry primitives of a region: triangle sets, segments, enclosing bodies + a cache signature. */
function regionPrims(st, srcId, geom) {
  const tris = [], segs = [], solids = [];
  let sig = "";
  const byBody = new Map();
  for (const r of geom.faces || []) { if (!byBody.has(r.body)) byBody.set(r.body, []); byBody.get(r.body).push(r); }
  for (const [bid, refs] of byBody) {
    const T = bodyTriangles(st, bid), b = st.bodies.get(bid);
    if (!T || !T.faceOf || !b) continue;
    const sel = new Set();
    for (const r of refs) { const idx = M.locateFace(b.shape, r); if (idx >= 0) sel.add(idx); }
    if (sel.size) { tris.push({ T, sel: (t) => sel.has(T.faceOf[t]) }); sig += `f${tokenOf(srcObj(st, bid))}:${[...sel].join(".")};`; }
  }
  for (const bid of geom.bodies || []) {
    const T = bodyTriangles(st, bid);
    if (!T) continue;
    tris.push({ T, sel: null });
    solids.push(T);
    sig += `b${tokenOf(srcObj(st, bid))};`;
  }
  for (const pl of curvePolylines(st, geom.curves || [], geom.edges || [])) for (let i = 0; i < pl.length - 1; i++) segs.push([pl[i], pl[i + 1]]);
  for (const r of geom.points || []) { const p = pointOf(st, r); if (p) segs.push([p, p]); }
  for (const [a] of segs) sig += `${a[0].toFixed(3)},${a[1].toFixed(3)},${a[2].toFixed(3)};`;
  return { tris, segs, solids, sig, empty: !tris.length && !segs.length };
}
/** Distance field (clamped to band) of a region's primitives; 0 inside region bodies. */
function regionField(G, prim, band) {
  let D = null;
  const merge = (E) => { if (!D) D = E; else for (let i = 0; i < D.length; i++) if (E[i] < D[i]) D[i] = E[i]; };
  for (const { T, sel } of prim.tris) merge(VX.unsignedDist(G, T, sel, band));
  if (prim.segs.length) merge(VX.segmentDist(G, prim.segs, band));
  for (const T of prim.solids) { const In = VX.insideFlags(G, T); for (let i = 0; i < D.length; i++) if (In[i]) D[i] = 0; }
  return D;
}
/** 1 within thickness t of the geometry, fading to 0 over the fall off. */
const regionWeight = (d, t, fall) => (d <= t ? 1 : fall > 0 && d < t + fall ? 1 - (d - t) / fall : 0);

// ---------------------------------------------------------------- lattice
export const CELLS = [
  { value: "gyroid", label: "Gyroid" }, { value: "schwarzP", label: "Schwarz P" }, { value: "schwarzD", label: "Schwarz D" },
  { value: "x25d", label: "2.5D X" }, { value: "honeycomb", label: "Honeycomb" }, { value: "octet", label: "OctetTruss" },
  { value: "xcell", label: "X" }, { value: "cross", label: "Cross" }, { value: "custom", label: "Custom" },
];
const isTPMS = (c) => VX.CELL_KIND[c] === "tpms";

/** Rotation (rows) of the lattice frame: X, then Y, then Z angle about the world axes. */
function latticeRotation(ax, ay, az) {
  const r = Math.PI / 180, cx = Math.cos(ax * r), sx = Math.sin(ax * r), cy = Math.cos(ay * r), sy = Math.sin(ay * r), cz = Math.cos(az * r), sz = Math.sin(az * r);
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx], Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  const mul = (A, B) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j]));
  return mul(Rz, mul(Ry, Rx));
}

/** Unit cell field of Custom cells: SDF of the cell geometry over one cell centred on it (repeated periodically). */
function customCell(st, f, c, thick) {
  const g = { ...emptyGeom(), ...(f.cellGeom || {}) };
  const prim = regionPrims(st, null, g);
  if (prim.empty) throw new Error("Select solid or closed mesh bodies, faces or paths to define the unit cell structure.");
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const add = (p) => { for (let i = 0; i < 3; i++) { if (p[i] < mn[i]) mn[i] = p[i]; if (p[i] > mx[i]) mx[i] = p[i]; } };
  for (const { T, sel } of prim.tris) {
    const P = T.positions, I = T.indices;
    for (let t = 0; t < I.length / 3; t++) if (!sel || sel(t)) for (let k = 0; k < 3; k++) { const v = 3 * I[3 * t + k]; add([P[v], P[v + 1], P[v + 2]]); }
  }
  for (const [a, b] of prim.segs) { add(a); add(b); }
  // the geometry keeps its real size; one cell (Cell Size) centred on it is repeated
  const ctr = [0, 1, 2].map((i) => (mn[i] + mx[i]) / 2);
  const size = [...c], scale = 1;
  mn = ctr.map((x, i) => x - c[i] / 2);
  mx = ctr.map((x, i) => x + c[i] / 2);
  const hc = Math.max(...size) / 40;
  const Gc = VX.grid({ min: mn, max: mx }, hc, 1);
  const band = Math.max(...size);
  let F = null;
  const merge = (E) => { if (!F) F = E; else for (let i = 0; i < F.length; i++) if (E[i] < F[i]) F[i] = E[i]; };
  const r = thick / 2 / scale;
  for (const T of prim.solids) merge(VX.meshSDF(Gc, T, band));
  for (const { T, sel } of prim.tris) if (sel) merge(VX.unsignedDist(Gc, T, sel, band).map((d) => d - r));
  if (prim.segs.length) merge(VX.segmentDist(Gc, prim.segs, band).map((d) => d - r));
  return { G: Gc, F, mn, size, scale, sig: prim.sig };
}

function latticeMesh(st, f, P) {
  const id = f.body;
  const { src } = sourceOf(st, id);
  const cell = f.cell || "gyroid";
  if (!VX.CELL_KIND[cell] && cell !== "custom") throw new Error("Select a cell shape");
  const c = f.proportions === "nonuniform" ? [num(P, f, "sx", 10), num(P, f, "sy", 10), num(P, f, "sz", 10)] : [num(P, f, "size", 10), num(P, f, "size", 10), num(P, f, "size", 10)];
  if (!c.every((x) => x > 0)) throw new Error("The cell size must be greater than zero");
  const thick = num(P, f, "thickness", 1);
  const solidity = num(P, f, "solidity", 0.3);
  if (!isTPMS(cell) && !(thick > 0)) throw new Error("The thickness must be greater than zero");
  if (isTPMS(cell) && !(solidity > 0 && solidity < 1)) throw new Error("The solidity must be between 0 and 1");
  const grad = f.distribution === "path" && cell !== "custom";
  const startV = grad ? num(P, f, isTPMS(cell) ? "startSolidity" : "startThickness", isTPMS(cell) ? solidity : thick) : 0;
  const endV = grad ? num(P, f, isTPMS(cell) ? "endSolidity" : "endThickness", isTPMS(cell) ? solidity : thick) : 0;
  let path = null;
  if (grad) path = buildPath(st, f.path || [], f.edges || []);
  const tr = ["lx", "ly", "lz"].map((k) => num(P, f, k, 0));
  const rot = ["lrx", "lry", "lrz"].map((k) => num(P, f, k, 0));
  const regions = regionsOf(f, P, "r").map((r) => ({ ...r, prim: regionPrims(st, id, r.geom) })).filter((r) => !r.prim.empty);
  const custom = cell === "custom" ? customCell(st, f, c, thick) : null;
  const key = JSON.stringify({ cell, c, thick, solidity, grad, startV, endV, tr, rot, path: path ? [path.pts[0], path.length] : null,
    regions: regions.map((r) => [r.t, r.fall, r.sol, r.prim.sig]), custom: custom ? custom.sig : null });
  return cached(src, key, () => {
    const T = bodyTriangles(st, id);
    const bb = T.bb;
    const cmin = Math.min(...c);
    // smallest feature in mm: TPMS sheet thickness (see VX.latticeValue) or the beam / wall thickness
    const sMin = grad ? Math.min(startV, endV) : solidity;
    const range = cell === "schwarzP" ? 3 : cell === "schwarzD" ? 1.41 : 1.5;
    const feat = isTPMS(cell) ? (2 * sMin * range * 0.9 * (c[0] + c[1] + c[2])) / 3 / (2 * Math.PI) : Math.min(thick, grad ? Math.min(startV, endV) : thick);
    const want = Math.min(cmin / 10, Math.max(feat / 3, cmin / 60));
    const h = VX.spacingFor(bb, want, NODES);
    const G = VX.grid(bb, h, 2);
    const rband = regions.reduce((m, r) => Math.max(m, r.t + r.fall + 2 * h), 1.75 * h);
    const sdf = VX.meshSDF(G, T, 1.75 * h);
    const rd = regions.map((r) => regionField(G, r.prim, rband));
    const segs = VX.scaledSegments(cell, c);
    const org = V.mul(V.add(bb.min, bb.max), 0.5);
    const R = latticeRotation(rot[0], rot[1], rot[2]);
    const o0 = V.add(org, tr);
    // coarse path parameter: decimated polyline for the gradient
    let gp = null;
    if (path) {
      const step = Math.max(1, Math.floor(path.pts.length / 64));
      gp = { pts: path.pts.filter((_, i) => i % step === 0 || i === path.pts.length - 1) };
      gp.s = [0];
      for (let i = 1; i < gp.pts.length; i++) gp.s.push(gp.s[i - 1] + V.len(V.sub(gp.pts[i], gp.pts[i - 1])));
      gp.L = gp.s[gp.s.length - 1] || 1;
    }
    const param = (x, y, z) => {
      let best = Infinity, bs = 0;
      for (let i = 0; i < gp.pts.length - 1; i++) {
        const a = gp.pts[i], b = gp.pts[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L2 = dx * dx + dy * dy + dz * dz || 1e-18;
        let u = ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / L2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const qx = a[0] + u * dx - x, qy = a[1] + u * dy - y, qz = a[2] + u * dz - z;
        const d = qx * qx + qy * qy + qz * qz;
        if (d < best) { best = d; bs = gp.s[i] + u * Math.sqrt(L2); }
      }
      return bs / gp.L;
    };
    const fr = (v) => v - Math.floor(v);
    const customValue = (lx, ly, lz) => VX.sample(custom.G, custom.F, custom.mn[0] + fr(lx / c[0]) * custom.size[0], custom.mn[1] + fr(ly / c[1]) * custom.size[1], custom.mn[2] + fr(lz / c[2]) * custom.size[2]) * custom.scale;
    const F = new Float32Array(G.n);
    const { o, nx, ny, nz } = G;
    // the gradient parameter is sampled every second node (a smooth ramp)
    const cnx = (nx + 1) >> 1, cny = (ny + 1) >> 1;
    const pcache = gp ? new Float32Array(cnx * cny * ((nz + 1) >> 1)).fill(-1) : null;
    for (let k = 0, idx = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, idx++) {
      const s = sdf[idx];
      if (s > 1.5 * h) { F[idx] = s; continue; }
      const x = o[0] + i * h, y = o[1] + j * h, z = o[2] + k * h;
      // lattice coordinates: R^T (p - origin - offset)
      const dx = x - o0[0], dy = y - o0[1], dz = z - o0[2];
      const lx = R[0] * dx + R[3] * dy + R[6] * dz, ly = R[1] * dx + R[4] * dy + R[7] * dz, lz = R[2] * dx + R[5] * dy + R[8] * dz;
      let th = thick, so = solidity;
      if (gp) { const ci = (i >> 1) + cnx * ((j >> 1) + cny * (k >> 1)); let t = pcache[ci]; if (t < 0) { t = param(x, y, z); pcache[ci] = t; } const v = startV + (endV - startV) * t; if (isTPMS(cell)) so = v; else th = v; }
      // offset regions below full solidity raise the solidity / thickness of the cells near them
      for (let r = 0; r < regions.length; r++) {
        const R0 = regions[r];
        if (R0.sol >= 0.99) continue;
        const w = regionWeight(rd[r][idx], R0.t, R0.fall);
        if (w <= 0) continue;
        if (isTPMS(cell)) so = Math.max(so, so + (R0.sol - so) * w); else th = Math.max(th, th + (R0.sol * 1.2 * cmin - th) * w);
      }
      let val = custom ? customValue(lx, ly, lz) - (th - thick) / 2 : VX.latticeValue(cell, lx, ly, lz, c, th, so, segs);
      val = Math.max(val, s);
      // fully solid offset regions: a skin of the region thickness, blended over the fall off
      for (let r = 0; r < regions.length; r++) if (regions[r].sol >= 0.99) val = smin(val, Math.max(rd[r][idx] - regions[r].t, s), regions[r].fall);
      F[idx] = val;
    }
    const mesh = VX.march(G, F);
    if (!mesh.indices.length) throw new Error("The lattice is empty; increase the thickness or the solidity");
    const warning = h > feat / 1.6 ? "The display resolution is coarse for this cell size and thickness" : null;
    return { mesh, warning, h, org: o0, size: V.len(V.sub(bb.max, bb.min)) };
  });
}

export function registerLatticeFeatures(app) {
  try {
    app.registerBodyKind("volumetric", { label: "Volumetric Model", brep: false, edges: "none" });
  } catch (e) { console.warn("[createx] volumetric body kind", e); }
  const regionFields = (p, sol) => Object.fromEntries([1, 2, 3, 4].flatMap((i) => [[`${p}t${i}`, "length"], [`${p}f${i}`, "length"], ...(sol ? [[`${p}s${i}`, "none"]] : [])]));
  M.registerFeature("vlattice", {
    label: "Volumetric Lattice",
    stem: "Volumetric Lattice",
    fields: { size: "length", sx: "length", sy: "length", sz: "length", thickness: "length", solidity: "none", startSolidity: "none", endSolidity: "none", startThickness: "length", endThickness: "length", regionThickness: "length", falloff: "length",
      lx: "length", ly: "length", lz: "length", lrx: "angle", lry: "angle", lrz: "angle", ...regionFields("r", true) },
    apply(st, f, P) {
      if (!f.body) throw new Error("Select a solid or closed mesh body to create an internal lattice.");
      const r = latticeMesh(st, f, P);
      replaceWithModel(st, f.body, f, r.mesh);
      return { affected: [f.body], triangles: r.mesh.indices.length / 3, latticeOrigin: r.org, size: r.size, ...(r.warning ? { warning: r.warning } : {}) };
    },
    deps: (f) => depsOf(f, [f.cellGeom || {}]),
    touches: (f) => [f.body].filter(Boolean),
    editor: (a, id) => openLattice(a, { editId: id }),
    icon: "VolFieldCreateLatticeCommand",
  });
  M.registerFeature("vtexture", {
    label: "Volumetric Texture",
    stem: "Volumetric Texture",
    fields: { depth: "length", scale: "length", amplitude: "none", octaves: "none", persistence: "none", seed: "none", ...regionFields("c", false) },
    apply(st, f, P) {
      if (!f.body) throw new Error("Select body, mesh or its faces to define the texture surfaces.");
      const r = textureMesh(st, f, P);
      replaceWithModel(st, f.body, f, r.mesh);
      return { affected: [f.body], triangles: r.mesh.indices.length / 3, ...(r.warning ? { warning: r.warning } : {}) };
    },
    deps: (f) => depsOf(f, []),
    touches: (f) => [f.body].filter(Boolean),
    editor: (a, id) => openTexture(a, { editId: id }),
    icon: "VolFieldTextureCommand",
  });
}
/** Timeline references of a volumetric feature (body, path, regions, cell geometry). */
function depsOf(f, extra) {
  const geoms = [...(Array.isArray(f.regions) ? f.regions : []), ...extra];
  const sketches = new Set((f.path || []).map((c) => c.sketch));
  const bodies = new Set([f.body, ...(f.edges || []).map((e) => e.body)].filter(Boolean));
  const geo = [...(f.faces || []), ...(f.regionFaces || []), ...(f.edges || []).map((e) => ({ ...e, kind: "edge" }))];
  for (const g of geoms) {
    for (const c of g.curves || []) sketches.add(c.sketch);
    for (const p of g.points || []) if (p.sketch) sketches.add(p.sketch);
    for (const b of g.bodies || []) bodies.add(b);
    for (const r of g.faces || []) { bodies.add(r.body); geo.push(r); }
    for (const e of g.edges || []) { bodies.add(e.body); geo.push({ ...e, kind: "edge" }); }
  }
  return { sketches: [...sketches], bodies: [...bodies], features: [], cplanes: [], geo };
}

// ---------------------------------------------------------------- texture
export const PATTERNS = [
  { value: "perlin", label: "Perlin" }, { value: "voronoi", label: "Voronoi" }, { value: "noise", label: "Noise" }, { value: "leather", label: "Leather" },
  { value: "stripe", label: "Stripe" }, { value: "woodGrain", label: "Wood Grain" }, { value: "gyroid", label: "Gyroid" }, { value: "checkerBoard", label: "Checker Board" },
];
function textureMesh(st, f, P) {
  const id = f.body;
  const { src } = sourceOf(st, id);
  const depth = num(P, f, "depth", 1), scale = num(P, f, "scale", 5);
  if (!(depth > 0)) throw new Error("The depth must be greater than zero");
  if (!(scale > 0)) throw new Error("The scale must be greater than zero");
  const o = { pattern: f.pattern || "perlin", scale, amplitude: Math.max(0, Math.min(1, num(P, f, "amplitude", 1))), octaves: Math.max(1, Math.min(6, Math.round(num(P, f, "octaves", 3)))), persistence: Math.max(0, Math.min(1, num(P, f, "persistence", 0.5))), seed: Math.round(num(P, f, "seed", 0)), manhattan: !!f.manhattan };
  const clear = regionsOf(f, P, "c").map((r) => ({ ...r, prim: regionPrims(st, id, r.geom) })).filter((r) => !r.prim.empty);
  const key = JSON.stringify({ o, depth, faces: f.faces || [], clear: clear.map((r) => [r.t, r.fall, r.prim.sig]) });
  return cached(src, key, () => {
    const T = bodyTriangles(st, id);
    const bb = T.bb;
    const want = Math.min(scale / 5, depth / 2);
    const h = VX.spacingFor(bb, want, NODES);
    const G = VX.grid(bb, h, 2);
    const band = depth + 2 * h;
    const sdf = VX.meshSDF(G, T, band);
    let sd = null;
    if ((f.faces || []).length && T.faceOf) {
      const b = st.bodies.get(id);
      const sel = new Set();
      for (const r of f.faces) { const idx = b ? M.locateFace(b.shape, r) : -1; if (idx >= 0) sel.add(idx); }
      if (sel.size) sd = VX.unsignedDist(G, T, (t) => sel.has(T.faceOf[t]), band);
    }
    const cd = clear.map((r) => regionField(G, r.prim, r.t + r.fall + 2 * h));
    const F = new Float32Array(G.n);
    const { o: g0, nx, ny, nz } = G;
    const blend = Math.max(h, depth * 0.5);
    for (let k = 0, idx = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, idx++) {
      const s = sdf[idx];
      if (s > h * 1.5 || s < -band + h) { F[idx] = s; continue; }
      let w = 1;
      if (sd) w = Math.max(0, Math.min(1, 1 - (sd[idx] - Math.abs(s)) / blend));
      // clearance regions keep the surface plain within their thickness (fading over the fall off)
      for (let r = 0; r < clear.length && w > 0; r++) w *= 1 - regionWeight(cd[r][idx], clear[r].t, clear[r].fall);
      if (w <= 0) { F[idx] = s; continue; }
      F[idx] = s + depth * w * VX.textureValue(o, g0[0] + i * h, g0[1] + j * h, g0[2] + k * h);
    }
    const mesh = VX.march(G, F);
    if (!mesh.indices.length) throw new Error("The texture removed the whole body; reduce the depth");
    const warning = h > want * 1.6 ? "The display resolution is coarser than the texture scale" : null;
    return { mesh, warning, h };
  });
}

// ---------------------------------------------------------------- dialogs
const bodyOnly = (r) => (r && r.body ? { kind: "body", body: r.body } : null);
const button = (label, onClick) => { const b = document.createElement("button"); b.type = "button"; b.className = "cx-btn"; b.textContent = label; b.addEventListener("click", onClick); return b; };

/** Fusion-style tab strip (custom row) switching dlg.values.tab. */
function tabRow(tabs) {
  return {
    id: "tabs", type: "custom",
    render(dlg) {
      const el = document.createElement("div");
      el.className = "cx-tabs";
      for (const t of tabs) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cx-tab";
        b.dataset.tab = t.id;
        b.textContent = t.label;
        b.addEventListener("click", () => { dlg.values.tab = t.id; dlg.refresh(); });
        el.appendChild(b);
      }
      return el;
    },
    update(el, dlg) { for (const b of el.querySelectorAll(".cx-tab")) b.classList.toggle("on", b.dataset.tab === (dlg.values.tab || tabs[0].id)); },
  };
}
const onTab = (t, first, pred) => (v, dlg) => (v.tab || first) === t && (!pred || pred(v, dlg));

// region rows: "Add region" / "Remove region" + up to four groups (Geometry, Thickness, Fall Off[, Solidity])
const REGION_KINDS = ["face", "body", "sketchCurve", "edge", "sketchPoint", "vertex", "meshFace"];
/**
 * A click on the volumetric preview (a mesh) gives a meshFace hit: map it to the nearest face of the body
 * before the feature (B-rep), or to the whole body for mesh bodies.
 */
function faceFromMeshHit(dlg, r) {
  if (r.kind !== "meshFace") return r;
  const b = dlg.baseState.bodies.get(r.body);
  if (!b) return { kind: "body", body: r.body };
  try {
    const ni = K.nearestFaceIndex(b.shape, r.p);
    const idx = typeof ni === "number" ? ni : ni ? ni.index : -1;
    if (!(idx >= 0)) return null;
    const c = K.closestOnFace(b.shape, idx, r.p);
    const fi = K.topoOf(b.shape).faces[idx];
    return { kind: "face", body: r.body, index: idx, p: c ? c.p : r.p, n: fi ? fi.n : r.n, planar: !!fi && fi.type === "PLANE" };
  } catch { return null; }
}
function regionRows(p, visible, opts) {
  const rows = [{
    id: `${p}Btns`, type: "custom", visible,
    render(dlg) {
      const el = document.createElement("div");
      el.className = "cx-region-btns";
      el.append(
        button("Add region", () => { const n = dlg.values[`${p}N`] || 0; if (n >= MAX_REGIONS) return; dlg.values[`${p}N`] = n + 1; dlg.refresh(); dlg.activate(`${p}geo${n + 1}`); dlg.schedulePreview(0); }),
        button("Remove region", () => { const n = dlg.values[`${p}N`] || 0; if (!n) return; dlg.setSelection(`${p}geo${n}`, []); dlg.values[`${p}N`] = n - 1; dlg.refresh(); dlg.schedulePreview(0); }),
      );
      el.children[0].dataset.input = `${p}Add`;
      el.children[1].dataset.input = `${p}Remove`;
      return el;
    },
    update(el, dlg) { const n = dlg.values[`${p}N`] || 0; el.children[0].disabled = n >= MAX_REGIONS; el.children[1].disabled = n === 0; },
  }];
  for (let i = 1; i <= MAX_REGIONS; i++) {
    const vis = (v, dlg) => visible(v, dlg) && (v[`${p}N`] || 0) >= i;
    rows.push({ id: `${p}grp${i}`, type: "group", label: `${opts.title} ${i}`, visible: vis, rows: [
      { id: `${p}geo${i}`, type: "selection", label: "Geometry", kinds: REGION_KINDS, meshBodies: true, min: 0, advance: false, prompt: opts.prompt, tooltip: opts.tooltip, visible: vis,
        filter: (r, dlg) => !(r.kind === "body" && r.body === opts.srcBody(dlg)), mapRef: (r, dlg) => faceFromMeshHit(dlg, r) },
      { id: `${p}t${i}`, type: "value", label: "Thickness", kind: "length", default: "1.00 mm", nonNegative: true, visible: vis, tooltip: opts.thickTip },
      { id: `${p}f${i}`, type: "value", label: "Fall Off", kind: "length", default: "0.00 mm", nonNegative: true, visible: vis, tooltip: opts.fallTip },
      ...(opts.solidity ? [{ id: `${p}s${i}`, type: "value", label: "Solidity", kind: "none", default: "1.00", min: 0, max: 1, visible: vis, tooltip: "Specify the solidity of the offset region." }] : []),
    ] });
  }
  return rows;
}
/** Selection refs -> stored geometry {faces, bodies, curves, edges, points}. */
function geomOfSel(list) {
  const g = emptyGeom();
  for (const r of list || []) {
    if (r.kind === "face") g.faces.push({ body: r.body, p: r.p, n: r.n });
    else if (r.kind === "body") g.bodies.push(r.body);
    else if (r.kind === "sketchCurve") g.curves.push({ sketch: r.sketch, curve: r.curve });
    else if (r.kind === "edge") g.edges.push({ body: r.body, p: r.p });
    else if (r.kind === "sketchPoint") g.points.push({ kind: "sketchPoint", sketch: r.sketch, point: r.point });
    else if (r.kind === "vertex") g.points.push({ kind: "vertex", body: r.body, p: r.p });
  }
  return g;
}
const selOfGeom = (g) => [
  ...(g.faces || []).map((r) => ({ kind: "face", body: r.body, p: r.p, n: r.n })),
  ...(g.bodies || []).map((b) => ({ kind: "body", body: b })),
  ...(g.curves || []).map((c) => ({ kind: "sketchCurve", sketch: c.sketch, curve: c.curve })),
  ...(g.edges || []).map((e) => ({ kind: "edge", body: e.body, p: e.p, index: -1 })),
  ...(g.points || []).map((p) => ({ ...p })),
];
const geomEmpty = (g) => !g.faces.length && !g.bodies.length && !g.curves.length && !g.edges.length && !g.points.length;
/** Regions of the dialog values into the feature (geometry list + per-region values). */
function buildRegions(v, p, f, sol) {
  const n = v[`${p}N`] || 0, regions = [];
  for (let i = 1; i <= n; i++) {
    const g = geomOfSel(v[`${p}geo${i}`]);
    if (geomEmpty(g)) continue;
    const k = regions.length + 1;
    regions.push(g);
    f[`${p}t${k}`] = v[`${p}t${i}`];
    f[`${p}f${k}`] = v[`${p}f${i}`];
    if (sol) f[`${p}s${k}`] = v[`${p}s${i}`];
  }
  if (regions.length) f.regions = regions;
}
/** Feature regions into dialog values (older single-face form included). */
function initRegions(dlg, f0, p, sol) {
  const list = Array.isArray(f0.regions) ? f0.regions : (f0.regionFaces || []).length ? [{ ...emptyGeom(), faces: f0.regionFaces }] : [];
  dlg.values[`${p}N`] = list.length;
  list.forEach((g, i) => {
    const n = i + 1, legacy = !Array.isArray(f0.regions);
    dlg.values[`${p}geo${n}`] = selOfGeom({ ...emptyGeom(), ...g });
    const t = legacy ? f0.regionThickness : f0[`${p}t${n}`], fo = legacy ? f0.falloff : f0[`${p}f${n}`];
    if (t !== undefined) dlg.values[`${p}t${n}`] = String(t);
    if (fo !== undefined) dlg.values[`${p}f${n}`] = String(fo);
    if (sol && f0[`${p}s${n}`] !== undefined) dlg.values[`${p}s${n}`] = String(f0[`${p}s${n}`]);
  });
}

const XF = [["lx", "X Distance", "length", "0.00 mm"], ["ly", "Y Distance", "length", "0.00 mm"], ["lz", "Z Distance", "length", "0.00 mm"], ["lrx", "X Angle", "angle", "0.0 deg"], ["lry", "Y Angle", "angle", "0.0 deg"], ["lrz", "Z Angle", "angle", "0.0 deg"]];

export function openLattice(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const L = (id, label, def, extra = {}) => ({ id, type: "value", label, kind: "length", default: def, ...extra });
  const N = (id, label, def, extra = {}) => ({ id, type: "value", label, kind: "none", default: def, ...extra });
  const grad = (v) => v.distribution === "path";
  const T = (t, pred) => onTab(t, "setup", pred);
  return app.ui.dialog.open({
    id: "VolFieldCreateLatticeCommand",
    title: "Volumetric Lattice",
    icon: "VolFieldCreateLatticeCommand",
    editId,
    featureLabel: "Volumetric Lattice",
    help: "Fills a solid or closed mesh body with a volumetric lattice structure.",
    labelWidth: 120,
    preselect: (opts.preselect || []).map(bodyOnly).filter(Boolean).slice(0, 1),
    rows: [
      tabRow([{ id: "setup", label: "Setup" }, { id: "density", label: "Density" }, { id: "offset", label: "Offset" }]),
      { id: "body", type: "selection", label: "Body", kinds: ["body", "face"], meshBodies: true, mapRef: bodyOnly, max: 1, prompt: "Select solid or closed mesh body to apply a volumetric model", tooltip: "Select a solid or closed mesh body to create an internal lattice.", visible: T("setup") },
      { id: "cell", type: "dropdown", label: "Cell Shape", options: CELLS, default: "gyroid", visible: T("setup") },
      { id: "cellGeom", type: "selection", label: "Cell Geometry", kinds: ["body", "face", "sketchCurve", "edge"], meshBodies: true, min: 1, advance: false, prompt: "Select solid or closed mesh bodies, faces or paths.", tooltip: "Select solid or closed mesh bodies, faces or paths to define the unit cell structure.", visible: T("setup", (v) => v.cell === "custom"),
        filter: (r, dlg) => { const b = (dlg.values.body || [])[0]; return !b || r.body !== b.body; } },
      { id: "gsize", type: "group", label: "Cell Size", visible: T("setup"), rows: [
        { id: "proportions", type: "dropdown", label: "Proportions", options: [{ value: "uniform", label: "Uniform" }, { value: "nonuniform", label: "Non-Uniform" }], default: "uniform" },
        L("size", "Size", "10.00 mm", { positive: true, visible: (v) => v.proportions !== "nonuniform" }),
        L("sx", "X Direction", "10.00 mm", { positive: true, visible: (v) => v.proportions === "nonuniform", tooltip: "Specify the size of the cell in the X direction." }),
        L("sy", "Y Direction", "10.00 mm", { positive: true, visible: (v) => v.proportions === "nonuniform", tooltip: "Specify the size of the cell in the Y direction." }),
        L("sz", "Z Direction", "10.00 mm", { positive: true, visible: (v) => v.proportions === "nonuniform", tooltip: "Specify the size of the cell in the Z direction." }),
      ] },
      L("thickness", "Thickness", "1.00 mm", { positive: true, tooltip: "Thickness (diameter for beams).", visible: T("setup", (v) => !isTPMS(v.cell)) }),
      { id: "gxf", type: "group", label: "Lattice Transform", visible: T("setup"), rows: [
        { id: "move", type: "check", label: "Move / Rotate", default: false, tooltip: "Moves or rotates cells in the specified direction." },
        ...XF.map(([id, label, kind, def]) => ({ id, type: "value", label, kind, default: def, visible: (v) => !!v.move })),
        { id: "xfReset", type: "custom", visible: (v) => !!v.move,
          render(dlg) { const b = button("Reset", () => { for (const [id, , kind] of XF) dlg.set(id, kind === "angle" ? "0.0 deg" : "0.00 mm", { user: true, noPreview: true }); dlg.schedulePreview(0); }); b.title = "Resets cells to the original position."; b.dataset.input = "xfReset"; return b; } },
      ] },
      N("solidity", "Solidity", "0.30", { min: 0.01, max: 0.99, tooltip: "Specify the solidity of the volumetric lattice.", visible: T("density", (v) => isTPMS(v.cell) && !grad(v)) }),
      { id: "distribution", type: "dropdown", label: "Distribution", options: [{ value: "constant", label: "Constant" }, { value: "path", label: "Gradient Along Path" }], default: "constant", visible: T("density", (v) => v.cell !== "custom") },
      { id: "pathSel", type: "selection", label: "Path", kinds: ["sketchCurve", "edge"], min: 0, advance: false, prompt: "Select a curve or edge to define a path of varying solidity", tooltip: "Select path to distribute material volume within the body.", visible: T("density", grad) },
      N("startSolidity", "Start", "0.15", { min: 0.01, max: 0.99, visible: T("density", (v) => grad(v) && isTPMS(v.cell)) }),
      N("endSolidity", "End", "0.50", { min: 0.01, max: 0.99, visible: T("density", (v) => grad(v) && isTPMS(v.cell)) }),
      L("startThickness", "Start", "0.50 mm", { positive: true, visible: T("density", (v) => grad(v) && !isTPMS(v.cell) && v.cell !== "custom") }),
      L("endThickness", "End", "2.00 mm", { positive: true, visible: T("density", (v) => grad(v) && !isTPMS(v.cell) && v.cell !== "custom") }),
      ...regionRows("r", T("offset"), { title: "Region", solidity: true, srcBody: (dlg) => ((dlg.values.body || [])[0] || {}).body, prompt: "Select geometry to create regions of solidity", tooltip: "Select bodies, faces, paths or points to specify solidity.", thickTip: "Specify offset and blending distance", fallTip: "Specify the length of the gradient between the offset area and the solidity of the rest of the lattice." }),
    ],
    init(dlg) {
      dlg.values.tab = "setup";
      dlg.values.rN = 0;
      if (!f0) return;
      Object.assign(dlg.values, {
        body: f0.body ? [{ kind: "body", body: f0.body }] : [],
        cell: f0.cell || "gyroid", proportions: f0.proportions || "uniform", distribution: f0.distribution || "constant",
        pathSel: [...(f0.path || []).map((c) => ({ kind: "sketchCurve", sketch: c.sketch, curve: c.curve })), ...(f0.edges || []).map((e) => ({ kind: "edge", body: e.body, p: e.p, index: -1 }))],
        cellGeom: f0.cellGeom ? selOfGeom({ ...emptyGeom(), ...f0.cellGeom }) : [],
        move: XF.some(([k]) => f0[k] !== undefined && !/^\s*0(\.0*)?\s*(mm|deg)?\s*$/.test(String(f0[k]))),
      });
      for (const k of ["size", "sx", "sy", "sz", "thickness", "solidity", "startSolidity", "endSolidity", "startThickness", "endThickness", ...XF.map((x) => x[0])]) if (f0[k] !== undefined) dlg.values[k] = String(f0[k]);
      initRegions(dlg, f0, "r", true);
    },
    onChange(id, dlg) {
      // the next input to pick becomes active (Cell Geometry for Custom cells, Path for a gradient)
      if (id === "cell" && dlg.values.cell === "custom" && !(dlg.values.cellGeom || []).length) dlg.activate("cellGeom");
      if (id === "distribution" && dlg.values.distribution === "path" && !(dlg.values.pathSel || []).length) dlg.activate("pathSel");
    },
    build(v) {
      const b = (v.body || [])[0];
      if (!b) return null;
      const f = { type: "vlattice", body: b.body, cell: v.cell, proportions: v.proportions, distribution: v.cell === "custom" ? "constant" : v.distribution };
      for (const k of ["size", "sx", "sy", "sz", "thickness", "solidity"]) f[k] = v[k];
      if (v.cell === "custom") {
        const g = geomOfSel(v.cellGeom);
        if (geomEmpty(g)) return null;
        f.cellGeom = g;
      }
      if (f.distribution === "path") {
        const { curves, edges } = pathRefs(v.pathSel);
        if (!curves.length && !edges.length) return null;
        Object.assign(f, { path: curves, edges, startSolidity: v.startSolidity, endSolidity: v.endSolidity, startThickness: v.startThickness, endThickness: v.endThickness });
      }
      if (v.move) for (const [k] of XF) f[k] = v[k];
      buildRegions(v, "r", f, true);
      return f;
    },
    manipulators(dlg) {
      const v = dlg.values, r = dlg.previewRes;
      if (!v.move || !r || !r.latticeOrigin) return [];
      const n = (k) => dlg.num(k) || 0;
      const o = r.latticeOrigin, base = V.sub(o, [n("lx"), n("ly"), n("lz")]);
      const out = [];
      const ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      ["lx", "ly", "lz"].forEach((k, i) => { const org = [...o]; org[i] = base[i]; const m = dlg.valueManip(k, { origin: org, dir: ax[i], id: k }); if (m) out.push(m); });
      const rad = Math.max(2, (r.size || 20) * 0.3);
      ["lrx", "lry", "lrz"].forEach((k, i) => { const m = dlg.angleManip(k, { center: o, axis: ax[i], ref: ax[(i + 1) % 3], radius: rad }); if (m) out.push(m); });
      return out;
    },
    status(dlg) { const r = dlg.previewRes; return r && r.ok && r.triangles ? `Volumetric Model | ${r.triangles} triangles` : ""; },
  });
}

export function openTexture(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const N = (id, label, def, extra = {}) => ({ id, type: "value", label, kind: "none", default: def, ...extra });
  const noisy = (v) => ["perlin", "noise"].includes(v.pattern);
  const random = (v) => ["perlin", "noise", "voronoi", "leather", "woodGrain"].includes(v.pattern);
  const T = (t, pred) => onTab(t, "texture", pred);
  return app.ui.dialog.open({
    id: "VolFieldTextureCommand",
    title: "Volumetric Texture",
    icon: "VolFieldTextureCommand",
    editId,
    featureLabel: "Volumetric Texture",
    help: "Applies a volumetric texture to the faces of a solid or closed mesh body.",
    labelWidth: 120,
    preselect: (opts.preselect || []).filter((r) => r.kind === "face" || r.kind === "body"),
    rows: [
      tabRow([{ id: "texture", label: "Texture" }, { id: "clearances", label: "Clearances" }]),
      { id: "geom", type: "selection", label: "Faces", kinds: ["body", "face"], meshBodies: true, prompt: "Select body, mesh or its faces to define the texture surfaces.", tooltip: "Select body, mesh or its faces to define the texture surfaces.", visible: T("texture"),
        filter: (r, dlg) => { const cur = (dlg.values.geom || [])[0]; return !cur || cur.body === r.body; } },
      { id: "pattern", type: "dropdown", label: "Texture Pattern", options: PATTERNS, default: "perlin", visible: T("texture") },
      { id: "depth", type: "value", label: "Depth", kind: "length", default: "1.00 mm", positive: true, visible: T("texture") },
      { id: "gc", type: "group", label: "Cell", visible: T("texture"), rows: [
        { id: "scale", type: "value", label: "Scale", kind: "length", default: "5.00 mm", positive: true, tooltip: "Size of one texture cell." },
        N("amplitude", "Amplitude", "1.00", { min: 0, max: 1 }),
        N("octaves", "Fractal Depth", "3", { integer: true, min: 1, max: 6, visible: noisy }),
        N("persistence", "Persistence", "0.50", { min: 0, max: 1, visible: noisy, tooltip: "Ratio by which amplitude is reduced for each fractal layer." }),
        N("seed", "Seed", "0", { integer: true, visible: random, tooltip: "Seed: Seed for the random generation." }),
        { id: "manhattan", type: "check", label: "Manhattan", default: false, visible: (v) => v.pattern === "voronoi" || v.pattern === "leather" },
      ] },
      ...regionRows("c", T("clearances"), { title: "Clearance", solidity: false, srcBody: (dlg) => ((dlg.values.geom || [])[0] || {}).body, prompt: "Select geometry to create regions of clearances", tooltip: "Select bodies, faces, paths or points where the texture stays clear.", thickTip: "Specify Thickness and blending distance", fallTip: "Specify the length of the gradient between the offset area and the solidity of the rest of the texture." }),
    ],
    init(dlg) {
      dlg.values.tab = "texture";
      dlg.values.cN = 0;
      if (!f0) return;
      const faces = (f0.faces || []).map((r) => ({ kind: "face", body: r.body, p: r.p, n: r.n }));
      Object.assign(dlg.values, { geom: faces.length ? faces : f0.body ? [{ kind: "body", body: f0.body }] : [], pattern: f0.pattern || "perlin", manhattan: !!f0.manhattan });
      for (const k of ["depth", "scale", "amplitude", "octaves", "persistence", "seed"]) if (f0[k] !== undefined) dlg.values[k] = String(f0[k]);
      initRegions(dlg, f0, "c", false);
    },
    build(v) {
      const sel = v.geom || [];
      if (!sel.length) return null;
      const body = sel[0].body;
      const faces = sel.some((r) => r.kind === "body") ? [] : sel.filter((r) => r.kind === "face" && r.body === body).map((r) => ({ body, p: r.p, n: r.n }));
      const f = { type: "vtexture", body, faces, pattern: v.pattern };
      for (const k of ["depth", "scale", "amplitude", "octaves", "persistence", "seed"]) f[k] = v[k];
      if (v.manhattan) f.manhattan = true;
      buildRegions(v, "c", f, false);
      return f;
    },
    status(dlg) { const r = dlg.previewRes; return r && r.ok && r.triangles ? `Volumetric Model | ${r.triangles} triangles` : ""; },
  });
}
