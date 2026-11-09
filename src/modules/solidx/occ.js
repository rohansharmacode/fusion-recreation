// OCCT algorithms of the solidx face tools (Offset / Replace / Split / Remove Faces, Remove Features).
//
// Healing by cells (the wasm has no BRepAlgoAPI_Defeaturing): space around the body is cut into cells by
// every face that stays, the extended neighbours of the removed faces (planes become large squares,
// cylinders and spheres become their full surface) and the new target surfaces. A cell belongs to the
// result when it does not reach the enlarged bounding box (it is closed off by the body's own faces and
// the extensions) and holds some of the original material. The kept cells are fused and same-domain
// faces unified. This reproduces Fusion's "remove the faces and let the neighbours grow until they meet"
// behaviour for holes, pockets, bosses, fillets, chamfers, and gives Replace / Offset Face for free
// (the source faces are removed and the target surfaces close the cells instead).
import * as K from "../../kernel.js";

const V = K.V;
const R = K.R;
const OC = () => R.getOC();

function list(shapes) {
  const O = OC();
  const l = new O.NCollection_List_TopoDS_Shape();
  for (const s of shapes) l.Append(s.wrapped || s);
  return l;
}
function castOwn(raw) {
  let s;
  try { s = R.cast(raw); } finally { K.del(raw); }
  return s;
}
function volume(s) { try { return Math.abs(K.volumeOf(s)); } catch { return 0; } }

/** Large planar square face on the plane {o, n} centred near c. */
export function bigPlane(o, n, c, half) { return K.planeSquareFace({ o, n }, c, half); }

/** Full-surface extension of a face (plane square, long cylinder, whole sphere) or null when not supported. */
export function extendedFace(fi, c, half) {
  try {
    if (fi.type === "PLANE") return bigPlane(fi.c, fi.n, c, half);
    if (fi.type === "CYLINDRE" && fi.a && fi.ao && fi.r > 0) return cylinderFace(fi.ao, fi.a, fi.r, c, half);
    if (fi.type === "SPHERE" && fi.ao && fi.r > 0) return sphereFace(fi.ao, fi.r);
  } catch { /* fall back to the face itself */ }
  return null;
}
export function cylinderFace(ao, a, r, c, half) {
  const d = V.norm(a);
  const s = V.dot(V.sub(c, ao), d);
  const base = V.add(ao, V.mul(d, s - half));
  const solid = R.makeCylinder(r, 2 * half, base, d);
  try {
    const faces = K.facesOf(solid);
    let keep = null;
    for (const f of faces) { if (!keep && f.geomType === "CYLINDRE") keep = f; else K.del(f); }
    if (!keep) throw new Error("no cylinder face");
    return keep;
  } finally { K.del(solid); }
}
export function sphereFace(c, r) {
  const solid = R.makeSphere(r).translate(c);
  try {
    const [f, ...rest] = K.facesOf(solid);
    K.del(rest);
    return f;
  } finally { K.del(solid); }
}

/** Cells of `box` split by `tools` (shapes). */
function cellsOf(box, tools) {
  const O = OC();
  const sp = new O.BRepAlgoAPI_Splitter();
  const args = list([box]);
  const tl = list(tools);
  try {
    sp.SetArguments(args);
    sp.SetTools(tl);
    sp.Build();
    if (typeof sp.HasErrors === "function" && sp.HasErrors()) throw new Error("The faces could not be rebuilt");
    const res = castOwn(sp.Shape());
    const solids = K.solidsOf(res);
    if (!solids.includes(res)) K.del(res);
    return solids;
  } finally { K.del(sp, args, tl); }
}

function unify(s) {
  const O = OC();
  const u = new O.ShapeUpgrade_UnifySameDomain(s.wrapped, true, true, false);
  try {
    u.Build();
    return K.singleSolid(castOwn(u.Shape()));
  } finally { K.del(u); }
}

/**
 * Rebuild `shape` without the faces `removeIdx`, closing the gaps with the extended neighbours and the
 * optional `targets` (faces / shells, extended by the caller). Returns a new solid (throws when the
 * result would be empty).
 */
export function rebuildByCells(shape, removeIdx, targets = [], opts = {}) {
  const T = K.topoOf(shape);
  const remove = new Set(removeIdx);
  const neighbours = new Set();
  for (const e of T.edges) {
    const fs = e.faces || [];
    if (fs.some((i) => remove.has(i))) for (const i of fs) if (!remove.has(i)) neighbours.add(i);
  }
  const bb = T.bb;
  const size = Math.max(V.len(V.sub(bb.max, bb.min)), 1);
  const margin = size * 0.35 + 5;
  const c = V.mul(V.add(bb.min, bb.max), 0.5);
  const half = size * 2 + 20;
  const lo = V.sub(bb.min, [margin, margin, margin]), hi = V.add(bb.max, [margin, margin, margin]);
  const box = R.makeBox(lo, hi);
  const faces = K.facesOf(shape);
  const owned = [];
  const tools = [];
  try {
    faces.forEach((f, i) => {
      if (remove.has(i)) return;
      if (neighbours.has(i) && opts.extend !== false) {
        const x = extendedFace(T.faces[i], c, half);
        if (x) { owned.push(x); tools.push(x); return; }
      }
      tools.push(f);
    });
    for (const t of targets) tools.push(t);
    const cells = cellsOf(box, tools);
    const tol = size * 1e-4 + 1e-6;
    const touches = (cb) => [0, 1, 2].some((k) => cb.min[k] <= lo[k] + tol || cb.max[k] >= hi[k] - tol);
    const keep = [];
    for (const cell of cells) {
      let ok = false;
      const cb = K.bboxOf(cell);
      if (cb && !touches(cb)) {
        const vc = volume(cell);
        let inter = null;
        try { inter = K.intersect(cell, shape); } catch { inter = null; }
        const vi = inter ? volume(inter) : 0;
        K.del(inter);
        ok = vc > 0 && vi > Math.max(vc * 1e-6, 1e-9);
      }
      if (ok) keep.push(cell); else K.del(cell);
    }
    if (!keep.length) throw new Error("No faces were able to be removed from this part.");
    let out = keep[0];
    for (let i = 1; i < keep.length; i++) {
      const n = K.fuse(out, keep[i]);
      K.del(out, keep[i]);
      out = n;
    }
    const u = unify(out);
    if (u !== out) K.del(out);
    return u;
  } finally {
    K.del(faces, owned, box);
  }
}

/** Faces of `shape` adjacent to face i (sharing an edge). */
export function adjacentFaces(shape, i) {
  const out = new Set();
  for (const e of K.topoOf(shape).edges) if ((e.faces || []).includes(i)) for (const j of e.faces) if (j !== i) out.add(j);
  return [...out];
}

/** Offset surface (extended) of face i by d along its outward normal; null when the surface type is unsupported. */
export function offsetSurface(shape, i, d, c, half) {
  const fi = K.topoOf(shape).faces[i];
  if (!fi) return null;
  if (fi.type === "PLANE") return bigPlane(V.add(fi.c, V.mul(fi.n, d)), fi.n, c, half);
  if ((fi.type === "CYLINDRE" || fi.type === "SPHERE") && fi.ao && fi.r > 0) {
    // outward normal away from the axis / centre: the radius grows with d, else it shrinks
    const a = fi.a ? V.norm(fi.a) : null;
    const radial = a ? V.sub(fi.c, V.add(fi.ao, V.mul(a, V.dot(V.sub(fi.c, fi.ao), a)))) : V.sub(fi.c, fi.ao);
    const s = V.dot(radial, fi.n) >= 0 ? 1 : -1;
    const r = fi.r + s * d;
    if (!(r > 1e-6)) throw new Error("The offset is larger than the face radius");
    return fi.type === "CYLINDRE" ? cylinderFace(fi.ao, a, r, c, half) : sphereFace(fi.ao, r);
  }
  // other surfaces: OCCT's simple offset of the face itself (not extended)
  const O = OC();
  const [face] = K.facesAt(shape, [i]);
  const b = new O.BRepOffsetAPI_MakeOffsetShape();
  try {
    b.PerformBySimple(face.wrapped, d);
    if (!b.IsDone()) return null;
    return castOwn(b.Shape());
  } catch { return null; } finally { K.del(b, face); }
}

/** Offset Face: faces `idx` moved by d along their normals (positive = outwards). */
export function offsetFaces(shape, idx, d) {
  if (Math.abs(d) < 1e-9) return shape;
  const T = K.topoOf(shape);
  const bb = T.bb;
  const size = Math.max(V.len(V.sub(bb.max, bb.min)), 1);
  const c = V.mul(V.add(bb.min, bb.max), 0.5);
  const half = size * 2 + 20 + Math.abs(d) * 2;
  const targets = [];
  try {
    for (const i of idx) {
      const s = offsetSurface(shape, i, d, c, half);
      if (!s) throw new Error("This face type cannot be offset");
      targets.push(s);
    }
    return rebuildByCells(shape, idx, targets);
  } finally { K.del(targets); }
}

/** Replace Face: faces `idx` replaced by the target faces (extended when `extend`). */
export function replaceFaces(shape, idx, targetFaces, extend = true) {
  const T = K.topoOf(shape);
  const bb = T.bb;
  const size = Math.max(V.len(V.sub(bb.max, bb.min)), 1);
  const c = V.mul(V.add(bb.min, bb.max), 0.5);
  const half = size * 2 + 20;
  const owned = [];
  const targets = [];
  try {
    for (const tf of targetFaces) {
      let x = null;
      if (extend) { try { x = extendedFace(geomOf(tf), c, half); } catch { x = null; } }
      if (x) { owned.push(x); targets.push(x); } else targets.push(tf);
    }
    return rebuildByCells(shape, idx, targets);
  } finally { K.del(owned); }
}

/** Plain topology info of a stand-alone face (type, c, n, a, ao, r) through a one-face topo summary. */
export function geomOf(face) {
  const T = K.topoOf(face);
  return T.faces[0];
}

/**
 * Split Face: faces `idx` of `shape` are divided where they meet the tool shapes (faces, shells, solids,
 * planes as large squares). The body stays one solid; the selected faces get the new edges.
 */
export function splitFaces(shape, idx, tools) {
  const O = OC();
  const targets = K.facesAt(shape, idx);
  const secs = [];
  try {
    for (const f of targets) {
      for (const t of tools) {
        const sec = new O.BRepAlgoAPI_Section(f.wrapped, t.wrapped, false);
        try {
          sec.ComputePCurveOn1(true);
          sec.Approximation(true);
          sec.Build();
          const raw = sec.Shape();
          const s = castOwn(raw);
          if (K.edgesOf(s).length) secs.push(s); else K.del(s);
        } finally { K.del(sec); }
      }
    }
    if (!secs.length) throw new Error("The splitting tool does not cross the selected faces");
    const sp = new O.BRepAlgoAPI_Splitter();
    const args = list([shape]);
    const tl = list(secs);
    try {
      sp.SetArguments(args);
      sp.SetTools(tl);
      sp.Build();
      if (typeof sp.HasErrors === "function" && sp.HasErrors()) throw new Error("The split failed");
      const res = castOwn(sp.Shape());
      const solids = K.solidsOf(res);
      if (solids.length === 1) { const s = solids[0]; if (s !== res) K.del(res); return s; }
      K.del(solids.filter((x) => x !== res));
      return res;
    } finally { K.del(sp, args, tl); }
  } finally { K.del(targets, secs); }
}

// ---------------------------------------------------------------------------------------------
// Edit Face: a four-sided face becomes a smooth B-spline patch pushed by a control grid
// ---------------------------------------------------------------------------------------------
const binom = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
const bern = (n, i, t) => binom(n, i) * Math.pow(t, i) * Math.pow(1 - t, n - i);

/** Control grid of face i: {nu, nv, pts:[[p]] (nu+1 x nv+1 surface points), normal at each}. */
export function faceGrid(shape, i, nu, nv) {
  const O = OC();
  const [face] = K.facesAt(shape, [i]);
  let ad = null;
  try {
    ad = new O.BRepAdaptor_Surface(face.wrapped, false);
    const uv = O.BRepTools.UVBounds(face.wrapped, 0, 0, 0, 0);
    const pts = [], nrm = [];
    for (let a = 0; a <= nu; a++) {
      const row = [], nrow = [];
      for (let b = 0; b <= nv; b++) {
        const u = uv.UMin + ((uv.UMax - uv.UMin) * a) / nu, v = uv.VMin + ((uv.VMax - uv.VMin) * b) / nv;
        const P = ad.Value(u, v);
        const p = [P.X(), P.Y(), P.Z()];
        K.del(P);
        row.push(p);
        let n = null;
        try { const w = face.normalAt(p); n = V.norm(w.toTuple()); w.delete(); } catch { n = [0, 0, 1]; }
        nrow.push(n);
      }
      pts.push(row); nrm.push(nrow);
    }
    return { nu, nv, pts, nrm };
  } finally { K.del(ad, face); }
}

function isFourSided(shape, i) {
  const es = K.topoOf(shape).edges.filter((e) => (e.faces || []).includes(i));
  return es.length === 4 && es.every((e) => (e.faces || []).length === 2 && e.faces[0] !== e.faces[1]);
}

/**
 * Face i of `shape` deformed by control displacements `moves` {"a,b": [dx,dy,dz]} on an (nu+1) x (nv+1)
 * grid (Bernstein blend, the boundary rows stay fixed so the face stays attached to its neighbours).
 * Solids are re-sewn into a solid; surface bodies stay surfaces.
 */
export function editFaceShape(shape, i, nu, nv, moves) {
  if (!isFourSided(shape, i)) throw new Error("Edit Face works on four-sided faces");
  const O = OC();
  const N = Math.max(12, 4 * Math.max(nu, nv));
  const [face] = K.facesAt(shape, [i]);
  let ad = null, arr = null, fit = null, mf = null, sew = null, sewn = null, ms = null;
  const fixes = [];
  const faces = K.facesOf(shape);
  try {
    ad = new O.BRepAdaptor_Surface(face.wrapped, false);
    const uv = O.BRepTools.UVBounds(face.wrapped, 0, 0, 0, 0);
    const D = [];
    for (let a = 0; a <= nu; a++) { D.push([]); for (let b = 0; b <= nv; b++) D[a].push((moves && moves[`${a},${b}`]) || null); }
    arr = new O.NCollection_Array2_gp_Pnt(1, N + 1, 1, N + 1);
    for (let a = 0; a <= N; a++) {
      const s = a / N;
      for (let b = 0; b <= N; b++) {
        const t = b / N;
        const P = ad.Value(uv.UMin + (uv.UMax - uv.UMin) * s, uv.VMin + (uv.VMax - uv.VMin) * t);
        let p = [P.X(), P.Y(), P.Z()];
        K.del(P);
        for (let ia = 1; ia < nu; ia++) for (let ib = 1; ib < nv; ib++) {
          const d = D[ia][ib];
          if (!d) continue;
          const w = bern(nu, ia, s) * bern(nv, ib, t);
          p = V.add(p, V.mul(d, w));
        }
        const g = new O.gp_Pnt(p[0], p[1], p[2]);
        arr.SetValue(a + 1, b + 1, g);
        K.del(g);
      }
    }
    fit = new O.GeomAPI_PointsToBSplineSurface(arr, 3, 8, O.GeomAbs_Shape.GeomAbs_C2, 1e-4);
    if (!fit.IsDone()) throw new Error("The face could not be rebuilt");
    const surf = fit.Surface();
    mf = new O.BRepBuilderAPI_MakeFace(surf, 1e-6);
    const nf = mf.Face();
    const bb = K.topoOf(shape).bb;
    const size = Math.max(V.len(V.sub(bb.max, bb.min)), 1);
    sew = new O.BRepBuilderAPI_Sewing(Math.max(1e-5, size * 2e-4), true, true, true, false);
    faces.forEach((f, k) => { if (k !== i) sew.Add(f.wrapped); });
    sew.Add(nf);
    K.del(nf, surf);
    sew.Perform();
    sewn = sew.SewedShape();
    const SE = O.TopAbs_ShapeEnum;
    if (M_kind(shape) !== "solid") { const out = castOwn(sewn); sewn = null; return out; }
    const ex = new O.TopExp_Explorer(sewn, SE.TopAbs_SHELL, SE.TopAbs_SHAPE);
    let shell = null;
    try { if (ex.More()) shell = ex.Current(); } finally { ex.delete(); }
    if (!shell) throw new Error("The face could not be sewn back into the body");
    const fix = new O.ShapeFix_Solid();
    fixes.push(fix);
    let solid;
    try { solid = fix.SolidFromShell(O.TopoDS.Shell(shell)); } finally { K.del(shell); }
    let out = K.singleSolid(castOwn(solid));
    if (!K.isValidShape(out) || !(Math.abs(K.volumeOf(out)) > 0)) throw new Error("The edited face leaves the body open");
    if (K.volumeOf(out) < 0) { const fl = castOwn(out.wrapped.Reversed()); K.del(out); out = fl; }
    return out;
  } finally { K.del(ad, arr, fit, mf, sew, sewn, ms, fixes, face, faces); }
}
function M_kind(shape) { return shape instanceof R.Solid || (R.Compound && shape instanceof R.Compound && K.solidsOf(shape).length) ? "solid" : "surface"; }
