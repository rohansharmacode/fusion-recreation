// createx: Volumetric Lattice (VolFieldCreateLatticeCommand) and Volumetric Texture (VolFieldTextureCommand).
// Both turn the selected body into a volumetric model body (kind 'volumetric', a closed triangle mesh from
// an implicit field sampled on a voxel grid: signed distance of the body combined with a lattice / texture).
import * as M from "../../model.js";
import * as VX from "./vox.js";
import { V, bodyTriangles, buildPath, pathRefs } from "./geom.js";

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

// ---------------------------------------------------------------- lattice
export const CELLS = [
  { value: "gyroid", label: "Gyroid" }, { value: "schwarzP", label: "Schwarz P" }, { value: "schwarzD", label: "Schwarz D" },
  { value: "x25d", label: "2.5D X" }, { value: "honeycomb", label: "Honeycomb" }, { value: "octet", label: "OctetTruss" },
  { value: "xcell", label: "X" }, { value: "cross", label: "Cross" }, { value: "custom", label: "Custom", disabled: true },
];
const isTPMS = (c) => VX.CELL_KIND[c] === "tpms";

function latticeMesh(st, f, P) {
  const id = f.body;
  const { src } = sourceOf(st, id);
  const num = (k, d) => (f[k] !== undefined && f[k] !== "" ? M.fval(P, f, k) : d);
  const cell = f.cell || "gyroid";
  if (!VX.CELL_KIND[cell]) throw new Error("Select a cell shape");
  const c = f.proportions === "nonuniform" ? [num("sx", 10), num("sy", 10), num("sz", 10)] : [num("size", 10), num("size", 10), num("size", 10)];
  if (!c.every((x) => x > 0)) throw new Error("The cell size must be greater than zero");
  const thick = num("thickness", 1);
  const solidity = num("solidity", 0.3);
  if (!isTPMS(cell) && !(thick > 0)) throw new Error("The thickness must be greater than zero");
  if (isTPMS(cell) && !(solidity > 0 && solidity < 1)) throw new Error("The solidity must be between 0 and 1");
  const grad = f.distribution === "path";
  const startV = grad ? num(isTPMS(cell) ? "startSolidity" : "startThickness", isTPMS(cell) ? solidity : thick) : 0;
  const endV = grad ? num(isTPMS(cell) ? "endSolidity" : "endThickness", isTPMS(cell) ? solidity : thick) : 0;
  const regionT = (f.regionFaces || []).length ? num("regionThickness", 1) : 0;
  const fall = (f.regionFaces || []).length ? Math.max(0, num("falloff", 0)) : 0;
  let path = null;
  if (grad) path = buildPath(st, f.path || [], f.edges || []);
  const key = JSON.stringify({ cell, c, thick, solidity, grad, startV, endV, regionT, fall, rf: f.regionFaces || [], path: path ? [path.pts[0], path.length] : null });
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
    const band = regionT > 0 ? Math.max(1.75 * h, regionT + fall + 2 * h) : 1.75 * h;
    const sdf = VX.meshSDF(G, T, band);
    const sel = new Set();
    let rdist = null;
    if (regionT > 0 && T.faceOf) {
      const b = st.bodies.get(id);
      for (const r of f.regionFaces) { const idx = b ? M.locateFace(b.shape, r) : -1; if (idx >= 0) sel.add(idx); }
      if (sel.size) rdist = VX.unsignedDist(G, T, (t) => sel.has(T.faceOf[t]), band);
    }
    const segs = VX.scaledSegments(cell, c);
    const org = V.mul(V.add(bb.min, bb.max), 0.5);
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
    const F = new Float32Array(G.n);
    const { o, nx, ny, nz } = G;
    // the gradient parameter is sampled every second node (a smooth ramp)
    const cnx = (nx + 1) >> 1, cny = (ny + 1) >> 1;
    const pcache = gp ? new Float32Array(cnx * cny * ((nz + 1) >> 1)).fill(-1) : null;
    for (let k = 0, idx = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, idx++) {
      const s = sdf[idx];
      if (s > 1.5 * h) { F[idx] = s; continue; }
      const x = o[0] + i * h, y = o[1] + j * h, z = o[2] + k * h;
      let th = thick, so = solidity;
      if (gp) { const ci = (i >> 1) + cnx * ((j >> 1) + cny * (k >> 1)); let t = pcache[ci]; if (t < 0) { t = param(x, y, z); pcache[ci] = t; } const v = startV + (endV - startV) * t; if (isTPMS(cell)) so = v; else th = v; }
      let val = Math.max(VX.latticeValue(cell, x - org[0], y - org[1], z - org[2], c, th, so, segs), s);
      if (rdist) val = smin(val, Math.max(rdist[idx] - regionT, s), fall);
      F[idx] = val;
    }
    const mesh = VX.march(G, F);
    if (!mesh.indices.length) throw new Error("The lattice is empty; increase the thickness or the solidity");
    const warning = h > feat / 1.6 ? "The display resolution is coarse for this cell size and thickness" : null;
    return { mesh, warning, h };
  });
}

export function registerLatticeFeatures(app) {
  try {
    app.registerBodyKind("volumetric", { label: "Volumetric Model", brep: false, edges: "none" });
  } catch (e) { console.warn("[createx] volumetric body kind", e); }
  M.registerFeature("vlattice", {
    label: "Volumetric Lattice",
    stem: "Volumetric Lattice",
    fields: { size: "length", sx: "length", sy: "length", sz: "length", thickness: "length", solidity: "none", startSolidity: "none", endSolidity: "none", startThickness: "length", endThickness: "length", regionThickness: "length", falloff: "length" },
    apply(st, f, P) {
      if (!f.body) throw new Error("Select a solid or closed mesh body to create an internal lattice.");
      const r = latticeMesh(st, f, P);
      replaceWithModel(st, f.body, f, r.mesh);
      return { affected: [f.body], triangles: r.mesh.indices.length / 3, ...(r.warning ? { warning: r.warning } : {}) };
    },
    deps: (f) => ({ sketches: [...new Set((f.path || []).map((c) => c.sketch))], bodies: [f.body, ...(f.edges || []).map((e) => e.body)].filter(Boolean), features: [], cplanes: [], geo: [...(f.regionFaces || []), ...(f.edges || []).map((e) => ({ ...e, kind: "edge" }))] }),
    touches: (f) => [f.body].filter(Boolean),
    editor: (a, id) => openLattice(a, { editId: id }),
    icon: "VolFieldCreateLatticeCommand",
  });
  M.registerFeature("vtexture", {
    label: "Volumetric Texture",
    stem: "Volumetric Texture",
    fields: { depth: "length", scale: "length", amplitude: "none", octaves: "none", persistence: "none", seed: "none" },
    apply(st, f, P) {
      if (!f.body) throw new Error("Select body, mesh or its faces to define the texture surfaces.");
      const r = textureMesh(st, f, P);
      replaceWithModel(st, f.body, f, r.mesh);
      return { affected: [f.body], triangles: r.mesh.indices.length / 3, ...(r.warning ? { warning: r.warning } : {}) };
    },
    deps: (f) => ({ sketches: [], bodies: [f.body].filter(Boolean), features: [], cplanes: [], geo: f.faces || [] }),
    touches: (f) => [f.body].filter(Boolean),
    editor: (a, id) => openTexture(a, { editId: id }),
    icon: "VolFieldTextureCommand",
  });
}

// ---------------------------------------------------------------- texture
export const PATTERNS = [
  { value: "perlin", label: "Perlin" }, { value: "voronoi", label: "Voronoi" }, { value: "noise", label: "Noise" }, { value: "leather", label: "Leather" },
  { value: "stripe", label: "Stripe" }, { value: "woodGrain", label: "Wood Grain" }, { value: "gyroid", label: "Gyroid" }, { value: "checkerBoard", label: "Checker Board" },
];
function textureMesh(st, f, P) {
  const id = f.body;
  const { src } = sourceOf(st, id);
  const num = (k, d) => (f[k] !== undefined && f[k] !== "" ? M.fval(P, f, k) : d);
  const depth = num("depth", 1), scale = num("scale", 5);
  if (!(depth > 0)) throw new Error("The depth must be greater than zero");
  if (!(scale > 0)) throw new Error("The scale must be greater than zero");
  const o = { pattern: f.pattern || "perlin", scale, amplitude: Math.max(0, Math.min(1, num("amplitude", 1))), octaves: Math.max(1, Math.min(6, Math.round(num("octaves", 3)))), persistence: Math.max(0, Math.min(1, num("persistence", 0.5))), seed: Math.round(num("seed", 0)), manhattan: !!f.manhattan };
  const key = JSON.stringify({ o, depth, faces: f.faces || [] });
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
    const F = new Float32Array(G.n);
    const { o: g0, nx, ny, nz } = G;
    const blend = Math.max(h, depth * 0.5);
    for (let k = 0, idx = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, idx++) {
      const s = sdf[idx];
      if (s > h * 1.5 || s < -band + h) { F[idx] = s; continue; }
      let w = 1;
      if (sd) w = Math.max(0, Math.min(1, 1 - (sd[idx] - Math.abs(s)) / blend));
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
const onTab = (t, pred) => (v, dlg) => (v.tab || "setup") === t && (!pred || pred(v, dlg));

export function openLattice(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const L = (id, label, def, extra = {}) => ({ id, type: "value", label, kind: "length", default: def, ...extra });
  const N = (id, label, def, extra = {}) => ({ id, type: "value", label, kind: "none", default: def, ...extra });
  const grad = (v) => v.distribution === "path";
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
      { id: "body", type: "selection", label: "Body", kinds: ["body", "face"], meshBodies: true, mapRef: bodyOnly, max: 1, prompt: "Select solid or closed mesh body to apply a volumetric model", tooltip: "Select a solid or closed mesh body to create an internal lattice.", visible: onTab("setup") },
      { id: "cell", type: "dropdown", label: "Cell Shape", options: CELLS, default: "gyroid", visible: onTab("setup") },
      { id: "gsize", type: "group", label: "Cell Size", visible: onTab("setup"), rows: [
        { id: "proportions", type: "dropdown", label: "Proportions", options: [{ value: "uniform", label: "Uniform" }, { value: "nonuniform", label: "Non-Uniform" }], default: "uniform" },
        L("size", "Size", "10.00 mm", { positive: true, visible: (v) => v.proportions !== "nonuniform" }),
        L("sx", "X Direction", "10.00 mm", { positive: true, visible: (v) => v.proportions === "nonuniform", tooltip: "Specify the size of the cell in the X direction." }),
        L("sy", "Y Direction", "10.00 mm", { positive: true, visible: (v) => v.proportions === "nonuniform", tooltip: "Specify the size of the cell in the Y direction." }),
        L("sz", "Z Direction", "10.00 mm", { positive: true, visible: (v) => v.proportions === "nonuniform", tooltip: "Specify the size of the cell in the Z direction." }),
      ] },
      L("thickness", "Thickness", "1.00 mm", { positive: true, tooltip: "Thickness (diameter for beams).", visible: onTab("setup", (v) => !isTPMS(v.cell)) }),
      N("solidity", "Solidity", "0.30", { min: 0.01, max: 0.99, tooltip: "Specify the solidity of the volumetric lattice.", visible: onTab("density", (v) => isTPMS(v.cell) && !grad(v)) }),
      { id: "distribution", type: "dropdown", label: "Distribution", options: [{ value: "constant", label: "Constant" }, { value: "path", label: "Gradient Along Path" }], default: "constant", visible: onTab("density") },
      { id: "pathSel", type: "selection", label: "Path", kinds: ["sketchCurve", "edge"], min: 0, advance: false, prompt: "Select a curve or edge to define a path of varying solidity", tooltip: "Select path to distribute material volume within the body.", visible: onTab("density", grad) },
      N("startSolidity", "Start", "0.15", { min: 0.01, max: 0.99, visible: onTab("density", (v) => grad(v) && isTPMS(v.cell)) }),
      N("endSolidity", "End", "0.50", { min: 0.01, max: 0.99, visible: onTab("density", (v) => grad(v) && isTPMS(v.cell)) }),
      L("startThickness", "Start", "0.50 mm", { positive: true, visible: onTab("density", (v) => grad(v) && !isTPMS(v.cell)) }),
      L("endThickness", "End", "2.00 mm", { positive: true, visible: onTab("density", (v) => grad(v) && !isTPMS(v.cell)) }),
      { id: "regionFaces", type: "selection", label: "Geometry", kinds: ["face"], min: 0, advance: false, prompt: "Select geometry to create regions of solidity", tooltip: "Select bodies, faces, paths or points to specify solidity.", visible: onTab("offset"),
        filter: (r, dlg) => { const b = (dlg.values.body || [])[0]; return !!b && r.body === b.body; } },
      L("regionThickness", "Thickness", "1.00 mm", { nonNegative: true, tooltip: "Specify offset and blending distance", visible: onTab("offset") }),
      L("falloff", "Fall Off", "0.00 mm", { nonNegative: true, tooltip: "Specify the length of the gradient between the offset area and the solidity of the rest of the lattice.", visible: onTab("offset") }),
    ],
    init(dlg) {
      dlg.values.tab = "setup";
      if (!f0) return;
      Object.assign(dlg.values, {
        body: f0.body ? [{ kind: "body", body: f0.body }] : [],
        cell: f0.cell || "gyroid", proportions: f0.proportions || "uniform", distribution: f0.distribution || "constant",
        pathSel: [...(f0.path || []).map((c) => ({ kind: "sketchCurve", sketch: c.sketch, curve: c.curve })), ...(f0.edges || []).map((e) => ({ kind: "edge", body: e.body, p: e.p, index: -1 }))],
        regionFaces: (f0.regionFaces || []).map((r) => ({ kind: "face", body: r.body, p: r.p, n: r.n })),
      });
      for (const k of ["size", "sx", "sy", "sz", "thickness", "solidity", "startSolidity", "endSolidity", "startThickness", "endThickness", "regionThickness", "falloff"]) if (f0[k] !== undefined) dlg.values[k] = String(f0[k]);
    },
    build(v) {
      const b = (v.body || [])[0];
      if (!b) return null;
      const f = { type: "vlattice", body: b.body, cell: v.cell, proportions: v.proportions, distribution: v.distribution };
      for (const k of ["size", "sx", "sy", "sz", "thickness", "solidity"]) f[k] = v[k];
      if (v.distribution === "path") {
        const { curves, edges } = pathRefs(v.pathSel);
        if (!curves.length && !edges.length) return null;
        Object.assign(f, { path: curves, edges, startSolidity: v.startSolidity, endSolidity: v.endSolidity, startThickness: v.startThickness, endThickness: v.endThickness });
      }
      const rf = (v.regionFaces || []).filter((r) => r.body === b.body);
      if (rf.length) Object.assign(f, { regionFaces: rf.map((r) => ({ body: r.body, p: r.p, n: r.n })), regionThickness: v.regionThickness, falloff: v.falloff });
      return f;
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
      { id: "geom", type: "selection", label: "Faces", kinds: ["body", "face"], meshBodies: true, prompt: "Select body, mesh or its faces to define the texture surfaces.", tooltip: "Select body, mesh or its faces to define the texture surfaces.",
        filter: (r, dlg) => { const cur = (dlg.values.geom || [])[0]; return !cur || cur.body === r.body; } },
      { id: "pattern", type: "dropdown", label: "Texture Pattern", options: PATTERNS, default: "perlin" },
      { id: "depth", type: "value", label: "Depth", kind: "length", default: "1.00 mm", positive: true },
      { id: "gc", type: "group", label: "Cell", rows: [
        { id: "scale", type: "value", label: "Scale", kind: "length", default: "5.00 mm", positive: true, tooltip: "Size of one texture cell." },
        N("amplitude", "Amplitude", "1.00", { min: 0, max: 1 }),
        N("octaves", "Fractal Depth", "3", { integer: true, min: 1, max: 6, visible: noisy }),
        N("persistence", "Persistence", "0.50", { min: 0, max: 1, visible: noisy, tooltip: "Ratio by which amplitude is reduced for each fractal layer." }),
        N("seed", "Seed", "0", { integer: true, visible: random, tooltip: "Seed: Seed for the random generation." }),
        { id: "manhattan", type: "check", label: "Manhattan", default: false, visible: (v) => v.pattern === "voronoi" || v.pattern === "leather" },
      ] },
    ],
    init(dlg) {
      if (!f0) return;
      const faces = (f0.faces || []).map((r) => ({ kind: "face", body: r.body, p: r.p, n: r.n }));
      Object.assign(dlg.values, { geom: faces.length ? faces : f0.body ? [{ kind: "body", body: f0.body }] : [], pattern: f0.pattern || "perlin", manhattan: !!f0.manhattan });
      for (const k of ["depth", "scale", "amplitude", "octaves", "persistence", "seed"]) if (f0[k] !== undefined) dlg.values[k] = String(f0[k]);
    },
    build(v) {
      const sel = v.geom || [];
      if (!sel.length) return null;
      const body = sel[0].body;
      const faces = sel.some((r) => r.kind === "body") ? [] : sel.filter((r) => r.kind === "face" && r.body === body).map((r) => ({ body, p: r.p, n: r.n }));
      const f = { type: "vtexture", body, faces, pattern: v.pattern };
      for (const k of ["depth", "scale", "amplitude", "octaves", "persistence", "seed"]) f[k] = v[k];
      if (v.manhattan) f.manhattan = true;
      return f;
    },
    status(dlg) { const r = dlg.previewRes; return r && r.ok && r.triangles ? `Volumetric Model | ${r.triangles} triangles` : ""; },
  });
}
