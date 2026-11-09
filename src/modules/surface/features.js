// Timeline feature types of the SURFACE tools (registered with M.registerFeature). DOM-free: the
// evaluator runs these apply() functions; dialogs build the feature objects (see dialogs*.js).
// Feature formats are documented in README.md.
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import * as G from "./occ.js";

const V = K.V;
const { fval } = M;
const del = K.del;

// ------------------------------------------------------------------ input resolution
/** Edge `ref` {body, p, sig?} of a state: {edge, body, index}. */
export function resolveEdge(st, ref) {
  const b = st.bodies.get(ref.body);
  if (!b) throw new Error("Missing edges");
  const idx = M.locateEdge(b.shape, ref);
  if (idx < 0) throw new Error("Missing edges");
  const [edge] = K.edgesAt(b.shape, [idx]);
  if (!edge) throw new Error("Missing edges");
  return { edge, body: ref.body, index: idx, shape: b.shape };
}
/** Face `ref` {body, p, n?} of a state: {face, body, index}. */
export function resolveFaceRef(st, ref) {
  const b = st.bodies.get(ref.body);
  if (!b) throw new Error("Missing faces");
  const idx = M.locateFace(b.shape, ref, true);
  if (idx < 0) throw new Error("Missing faces");
  const [face] = K.facesAt(b.shape, [idx]);
  if (!face) throw new Error("Missing faces");
  return { face, body: ref.body, index: idx, shape: b.shape };
}
/** Index of a face ref in its body, without making a face wrapper (callers that only need the index). */
function faceRefIndex(st, ref) {
  const b = st.bodies.get(ref.body);
  if (!b) throw new Error("Missing faces");
  const idx = M.locateFace(b.shape, ref, true);
  if (idx < 0) throw new Error("Missing faces");
  return idx;
}
/** Faces adjacent to edge `index` of a body (indices into its faces). */
export function edgeFaces(shape, index) {
  const g = K.topoOf(shape).edges[index];
  return g ? g.faces || [] : [];
}
const planeOfSketch = (st, id) => { const s = st.sketches.get(id); return s ? s.plane : null; };

/**
 * Wires of profile-like inputs: profiles (every loop; outer loops only with outerOnly), sketch curves
 * (chained per sketch) and body edges (chained). Returns [{wire, plane|null, closed, edges?, kind}];
 * every created object is pushed onto `bag` (the caller deletes it).
 */
export function sectionsOf(st, { profiles = [], curves = [], edges = [] }, bag, { outerOnly = false } = {}) {
  const out = [];
  const ws = outerOnly ? G.profileOuterWires(st, profiles, M) : G.profileWires(st, profiles, M);
  for (const w of ws) { bag.push(w.wire); out.push({ ...w, kind: "profile" }); }
  const bySketch = new Map();
  for (const c of curves) { if (!bySketch.has(c.sketch)) bySketch.set(c.sketch, []); bySketch.get(c.sketch).push(c); }
  for (const [sid, list] of bySketch) {
    const es = G.sketchCurveEdges(st, list);
    bag.push(...es);
    if (!es.length) continue;
    for (const ch of G.chainWires(es)) { bag.push(ch.wire); out.push({ wire: ch.wire, plane: planeOfSketch(st, sid), closed: ch.closed, edges: ch.edges, kind: "curve", sketch: sid }); }
  }
  if (edges.length) {
    const es = edges.map((r) => resolveEdge(st, r));
    bag.push(...es.map((x) => x.edge));
    for (const ch of G.chainWires(es.map((x) => x.edge))) {
      bag.push(ch.wire);
      out.push({ wire: ch.wire, plane: null, closed: ch.closed, edges: ch.edges, kind: "edge", refs: es.filter((x) => ch.edges.includes(x.edge)) });
    }
  }
  return out;
}

/** Visible surface bodies of a state. */
function surfaceBodies(st, doc) {
  return [...st.bodies.keys()].filter((id) => doc.bodies[id]?.visible !== false && M.bodyKind(st, id) === "surface");
}

/**
 * Put a new surface shape into the state: 'join' sews it to the visible surface bodies it touches
 * (the first one keeps its id), otherwise it becomes f.newBody.
 */
export function surfaceResult(st, f, shape, doc) {
  const op = f.operation || "new";
  if (op === "join") {
    const targets = surfaceBodies(st, doc).filter((id) => M.touches(st.bodies.get(id).shape, shape));
    if (targets.length) {
      const { shape: sewn } = G.sew([...targets.map((id) => st.bodies.get(id).shape), shape]);
      st.bodies.set(targets[0], { id: targets[0], shape: sewn, from: f.id });
      for (const t of targets.slice(1)) st.bodies.delete(t);
      return [targets[0]];
    }
  }
  const id = f.newBody || `${f.id}_1`;
  st.bodies.set(id, { id, shape, from: f.id });
  return [id];
}
/** Several faces / shells as one surface shape: sewn together (shared edges joined). */
function sewnOrSingle(parts) {
  if (parts.length === 1) return parts[0];
  const { shape } = G.sew(parts);
  if (!parts.includes(shape)) del(parts); // the sewn shape owns its own handles
  return shape;
}
const surfaceMaker = (f) => ["new", "join", "newComponent"].includes(f.operation || "new");
const solidMaker = (f) => ["new", "join", "newComponent"].includes(f.operation || "new");

// ------------------------------------------------------------------ Extrude (surface)
function extrudeApply(st, f, P, doc) {
  const bag = [];
  const parts = [];
  try {
    const d1 = fval(P, f, "distance");
    const dirType = f.dirType || "one";
    const start = f.startType === "offset" && f.startOffset !== undefined && f.startOffset !== "" ? fval(P, f, "startOffset") : 0;
    const taper = f.taper !== undefined && f.taper !== "" && dirType !== "sym" ? fval(P, f, "taper") : 0;
    const taper2 = f.taper2 !== undefined && f.taper2 !== "" && dirType === "two" ? fval(P, f, "taper2") : 0;
    const d2 = dirType === "two" ? fval(P, f, "distance2") : 0;
    if (Math.abs(d1) < 1e-9 && !(dirType === "two" && Math.abs(d2) > 1e-9)) throw new Error("Extrude distance cannot be zero");
    // closed profiles: the side walls of the solid extrude (exact union of the regions, and the
    // faces keep the solid's orientation: normals point out of the material, like Fusion)
    if ((f.profiles || []).length) {
      for (const g of M.profileGroups(st, f.profiles)) {
        const pl = g.sketch.plane;
        const sides = (s0, d, tp) => {
          if (Math.abs(d) < 1e-9) return;
          const solid = Math.abs(tp) > 1e-9
            ? K.extrudeDrawing(K.regionsDrawing(g.regions, g.sketch.regions.vertices), pl, s0, d, tp)
            : K.extrudeRegions(g.regions, g.sketch.regions.vertices, pl, s0, d);
          bag.push(solid);
          parts.push(...wallsOf(solid, pl, [s0, s0 + d]));
        };
        if (dirType === "sym") {
          const half = f.symMeasure === "whole" ? d1 / 2 : d1;
          sides(start - Math.abs(half), 2 * Math.abs(half), 0);
        } else {
          sides(start, d1, taper);
          if (dirType === "two") sides(start, -Math.abs(d2), taper2);
        }
      }
    }
    const secs = sectionsOf(st, { curves: f.curves || [] }, bag);
    if (!secs.length && !parts.length) throw new Error("Select profiles or sketch curves to extrude");
    for (const s of secs) {
      if (!s.plane) continue;
      const n = V.norm(s.plane.n);
      const along = (w, off, d, tp) => {
        if (Math.abs(d) < 1e-9) return;
        const base = Math.abs(off) > 1e-12 ? G.translated(w, V.mul(n, off)) : w;
        if (base !== w) bag.push(base);
        if (Math.abs(tp) > 1e-9) {
          // open curves with a taper: ruled walls leaning by the taper angle
          for (const e of G.explore(base, "edge")) {
            bag.push(e);
            const smp = G.rulingSamples(e, null, { type: "normal", plane: { n: V.mul(n, Math.sign(d)) }, angle: tp });
            parts.push(G.ruledFromSamples(e, smp, Math.abs(d) / Math.cos((tp * Math.PI) / 180)));
          }
          return;
        }
        parts.push(G.prismOf(base, V.mul(n, d)));
      };
      if (dirType === "sym") {
        const half = f.symMeasure === "whole" ? d1 / 2 : d1;
        along(s.wire, start - half, 2 * half, 0);
      } else {
        along(s.wire, start, d1, taper);
        if (dirType === "two") along(s.wire, start, -Math.abs(d2), taper2);
      }
    }
    if (!parts.length) throw new Error("Select profiles or sketch curves to extrude");
    const shape = sewnOrSingle(parts);
    return { affected: surfaceResult(st, f, shape, doc) };
  } finally {
    del(bag);
    // parts were sewn into a new shape (or one of them is the result)
  }
}
/** Faces of a solid extrude without its start / end caps (planar faces on the cap planes). */
function wallsOf(solid, pl, offs) {
  const n = V.norm(pl.n);
  const out = [];
  for (const fc of G.facesOf(solid)) {
    let cap = false;
    if (G.isPlanarFace(fc)) {
      const c = G.faceCenter(fc);
      const nn = G.normalAt(fc, c);
      if (nn && Math.abs(Math.abs(V.dot(nn, n)) - 1) < 1e-7) {
        const h = V.dot(V.sub(c, pl.o), n);
        cap = offs.some((o) => Math.abs(h - o) < 1e-6);
      }
    }
    if (cap) del(fc); else out.push(fc);
  }
  return out;
}

// ------------------------------------------------------------------ Revolve (surface)
function revolveApply(st, f, P, doc) {
  const bag = [];
  try {
    const ax = M.axisFromRef(st, f.axis);
    const full = f.revType === "full";
    const ang = full ? 360 : fval(P, f, "angle");
    if (Math.abs(ang) < 1e-9) throw new Error("The revolve angle cannot be zero");
    const secs = sectionsOf(st, { profiles: f.profiles || [], curves: f.curves || [], edges: f.edges || [] }, bag);
    if (!secs.length) throw new Error("Select profiles or curves to revolve");
    const parts = [];
    for (const s of secs) {
      const rev = (a) => G.revolOf(s.wire, ax.o, ax.d, a);
      if (full) parts.push(rev(360));
      else if (f.dirType === "sym") { const r = rev(ang); bag.push(r); parts.push(G.rotated(r, -ang / 2, ax.o, ax.d)); }
      else if (f.dirType === "two") {
        const a2 = fval(P, f, "angle2");
        parts.push(rev(ang));
        if (Math.abs(a2) > 1e-9) { const r2 = rev(a2); bag.push(r2); parts.push(G.rotated(r2, -a2, ax.o, ax.d)); }
      } else parts.push(rev(ang));
    }
    return { affected: surfaceResult(st, f, sewnOrSingle(parts), doc) };
  } finally { del(bag); }
}

// ------------------------------------------------------------------ Sweep (surface)
function sweepApply(st, f, P, doc) {
  const bag = [];
  try {
    const secs = sectionsOf(st, { profiles: f.profiles || [], curves: f.curves || [], edges: f.edges || [] }, bag);
    if (!secs.length) throw new Error("Select a profile");
    const path = sectionsOf(st, { curves: (f.path && f.path.curves || []).map((c) => ({ sketch: f.path.sketch, curve: c })), edges: f.pathEdges || [] }, bag);
    if (!path.length) throw new Error("Select a path");
    if (path.length > 1) throw new Error("The path must be a connected chain of curves");
    const frac = f.distance !== undefined && f.distance !== "" ? fval(P, f, "distance") : 1;
    if (!(frac > 0) || frac > 1 + 1e-9) throw new Error("Distance must be between 0 and 1");
    let spine = path[0].wire;
    if (frac < 1 - 1e-9) { spine = G.trimWire(spine, frac); bag.push(spine); }
    const parts = secs.map((s) => G.sweepShell(s.wire, spine, { orientation: f.orientation || "perpendicular" }));
    return { affected: surfaceResult(st, f, sewnOrSingle(parts), doc) };
  } finally { del(bag); }
}

// ------------------------------------------------------------------ Loft (surface)
function loftApply(st, f, P, doc) {
  const bag = [];
  try {
    const wires = [];
    for (const sec of f.sections || []) {
      const s = sectionsOf(st, sec.profile ? { profiles: [sec.profile] } : sec.edges ? { edges: sec.edges } : { curves: (sec.curves || []).map((c) => ({ sketch: sec.sketch, curve: c })) }, bag, { outerOnly: true });
      if (s.length !== 1) throw new Error("Each loft section must be one connected chain of curves");
      wires.push(s[0].wire);
    }
    if (wires.length < 2) throw new Error("Select at least two profiles");
    const shape = G.loftWires(wires, { ruled: !!f.ruled, closed: !!f.closed });
    return { affected: surfaceResult(st, f, shape, doc) };
  } finally { del(bag); }
}

// ------------------------------------------------------------------ Patch
function patchApply(st, f, P, doc) {
  const bag = [];
  try {
    const secs = sectionsOf(st, { profiles: f.profiles || [], curves: f.curves || [], edges: f.edges || [] }, bag, { outerOnly: true });
    if (!secs.length) throw new Error("Missing boundary paths");
    const interiorCurves = G.sketchCurveEdges(st, f.interiorCurves || []);
    bag.push(...interiorCurves);
    const interiorPoints = (f.interiorPoints || []).map((r) => {
      const s = st.sketches.get(r.sketch);
      const pt = s && s.sk.points[r.point];
      if (!pt) throw new Error("Missing input selections");
      return K.toWorld(s.plane, pt.x, pt.y);
    });
    const cont = f.continuity || "G0";
    const parts = [];
    let warning = null;
    for (const s of secs) {
      if (!s.closed) throw new Error("The patch boundary must be a closed loop");
      const simple = (cont === "G0" || s.kind !== "edge") && !interiorCurves.length && !interiorPoints.length;
      const pf = simple ? G.planarFace(s.wire) : null;
      if (pf) { parts.push(pf); continue; }
      const edges = s.edges || G.explore(s.wire, "edge");
      if (!s.edges) bag.push(...edges);
      const bounds = edges.map((e) => {
        let support = null;
        if (s.kind === "edge" && cont !== "G0") {
          const r = (s.refs || []).find((x) => x.edge === e);
          const fs = r ? edgeFaces(r.shape, r.index) : [];
          if (fs.length) { [support] = K.facesAt(r.shape, [fs[0]]); bag.push(support); }
        }
        return { edge: e, support, order: cont };
      });
      parts.push(G.fillPatch(bounds, { points: interiorPoints, curves: interiorCurves }));
      if (G.fillPatch.g1Error > 0.1) warning = "Tangent continuity could not be reached along the whole boundary (the faces are close to perpendicular to the patch)";
    }
    return { affected: surfaceResult(st, f, sewnOrSingle(parts), doc), ...(warning ? { warning } : {}) };
  } finally { del(bag); }
}

// ------------------------------------------------------------------ Ruled
/** Fixed direction of a 'direction' ruled surface: a plane normal or an axis / linear edge. */
function directionOf(st, ref) {
  if (!ref) return null;
  if (ref.plane) { const pl = M.resolvePlane(ref.plane, st); return pl ? V.norm(pl.n) : null; }
  if (ref.axis) return V.norm(M.axisFromRef(st, ref.axis).d);
  return null;
}
/** Ruled faces for chains of edges / curves (shared by Ruled and Extend). */
function ruledFaces(st, f, P, { type, dist, angle = 0, fixed = null, alternate = false, mitered = false, natural = false }, bag) {
  const parts = [];
  const chains = sectionsOf(st, { curves: f.curves || [], edges: f.edges || [] }, bag);
  for (const ch of chains) {
    const edges = ch.edges || [];
    const ends = [];
    for (const e of edges) {
      let face = null;
      if (ch.kind === "edge") {
        const r = (ch.refs || []).find((x) => x.edge === e);
        const fs = r ? edgeFaces(r.shape, r.index) : [];
        const fi = fs.length > 1 && alternate ? fs[1] : fs[0];
        if (fi !== undefined) { [face] = K.facesAt(r.shape, [fi]); bag.push(face); }
      }
      const plane = ch.plane || null;
      const smp = G.rulingSamples(e, face, { type, fixed, angle, plane, flip: !face && alternate });
      ends.push(smp);
      if (natural && face) parts.push(G.naturalExtension(e, face, dist));
      else parts.push(G.ruledFromSamples(e, smp, dist));
    }
    // corners between consecutive rulings
    const L = Math.abs(dist);
    const sgn = dist < 0 ? -1 : 1;
    for (let i = 0; i < ends.length; i++) {
      const j = i + 1 < ends.length ? i + 1 : ch.closed ? 0 : -1;
      if (j < 0 || j === i) continue;
      const a = ends[i][ends[i].length - 1], b = ends[j][0];
      if (V.len(V.sub(a.p, b.p)) > 10 * G.TOL) continue;
      const cf = G.cornerFace(a.p, V.mul(a.d, sgn), V.mul(b.d, sgn), L, mitered);
      if (cf) parts.push(cf);
    }
  }
  return parts;
}
function ruledApply(st, f, P, doc) {
  const bag = [];
  try {
    const dist = fval(P, f, "distance");
    if (Math.abs(dist) < 1e-9) throw new Error("Distance cannot be zero");
    const angle = f.angle !== undefined && f.angle !== "" ? fval(P, f, "angle") : 0;
    const type = f.ruledType || "tangent";
    const fixed = type === "direction" ? directionOf(st, f.direction) : null;
    if (type === "direction" && !fixed) throw new Error("Reselect missing direction reference");
    if (!(f.edges || []).length && !(f.curves || []).length) throw new Error("Missing edges");
    const parts = ruledFaces(st, f, P, { type, dist, angle, fixed, alternate: !!f.alternate, mitered: !!f.mitered }, bag);
    if (!parts.length) throw new Error("Missing edges");
    return { affected: surfaceResult(st, f, sewnOrSingle(parts), doc) };
  } finally { del(bag); }
}

// ------------------------------------------------------------------ Offset / Thicken sources
/** One shape per source body: whole surface bodies and selected faces (sewn per body). */
function sourceShapes(st, f, bag) {
  const out = [];
  for (const id of f.surfaces || []) {
    const b = st.bodies.get(id);
    if (!b) throw new Error("Missing faces");
    out.push(b.shape);
  }
  const byBody = M.groupByBody(f.faces || []);
  for (const [, refs] of byBody) {
    if ((f.surfaces || []).includes(refs[0].body)) continue;
    const faces = refs.map((r) => resolveFaceRef(st, r).face);
    bag.push(...faces);
    if (faces.length === 1) out.push(faces[0]);
    else { const { shape } = G.sew(faces); bag.push(shape); out.push(shape); }
  }
  return out;
}
function offsetApply(st, f, P, doc) {
  const bag = [];
  try {
    const d = fval(P, f, "distance");
    if (Math.abs(d) < 1e-9) throw new Error("Distance cannot be zero");
    const src = sourceShapes(st, f, bag);
    if (!src.length) throw new Error("Missing faces");
    const parts = src.map((s) => G.offsetShape(s, d, { join: f.offsetType === "rounded" ? "rounded" : "sharp" }));
    return { affected: surfaceResult(st, { ...f, operation: f.operation === "join" ? "new" : f.operation }, G.combine(parts), doc) };
  } finally { del(bag); }
}
function thickenApply(st, f, P, doc) {
  const bag = [];
  try {
    const t = fval(P, f, "thickness");
    if (Math.abs(t) < 1e-9) throw new Error("Cannot create thicken feature with a thickness value equal to 0. Adjust the thickness to a positive or negative value.");
    const src = sourceShapes(st, f, bag);
    if (!src.length) throw new Error("Missing faces");
    const solids = src.map((s) => G.thickenShape(s, t, { join: f.thickenType === "rounded" ? "rounded" : "sharp", sym: f.direction === "sym" }));
    let tool = solids[0];
    if (solids.length > 1) tool = M.fuseTemp(solids);
    st._tool = tool;
    return { affected: M.applyOp(st, { ...f, bodies: f.participants }, tool, doc) };
  } finally { del(bag); }
}

// ------------------------------------------------------------------ Boundary Fill
/** Tool shapes of a Boundary Fill feature (bodies + large plane squares). Planes are pushed onto bag. */
function fillTools(st, f, bag) {
  const shapes = [];
  for (const id of f.tools || []) { const b = st.bodies.get(id); if (b) shapes.push(b.shape); }
  if ((f.planes || []).length) {
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const s of shapes) { const bb = K.bboxOf(s); if (!bb) continue; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); } }
    const c = Number.isFinite(mn[0]) ? V.mul(V.add(mn, mx), 0.5) : [0, 0, 0];
    const half = Number.isFinite(mn[0]) ? Math.max(10, V.len(V.sub(mx, mn))) : M.modelSize(st);
    for (const pr of f.planes) {
      const pl = M.resolvePlane(pr, st);
      if (!pl) throw new Error("Missing tools");
      const sq = G.planeFace(pl, c, half);
      bag.push(sq);
      shapes.push(sq);
    }
  }
  return shapes;
}
/** Cells of a Boundary Fill feature in a state: [{shape, p, volume}] (the caller deletes the shapes). */
export function fillCells(st, f) {
  const bag = [];
  try {
    const tools = fillTools(st, f, bag);
    if (!tools.length) return [];
    return G.boundedCells(tools);
  } finally { del(bag); }
}
function boundaryFillApply(st, f, P, doc) {
  if (!(f.tools || []).length && !(f.planes || []).length) throw new Error("Missing tools");
  const cells = fillCells(st, f);
  if (!cells.length) throw new Error("Failed to build cells.");
  const chosen = cells.filter((c) => (f.cells || []).some((x) => x && Array.isArray(x.p) && G.containsPoint(c.shape, x.p)));
  del(cells.filter((c) => !chosen.includes(c)).map((c) => c.shape));
  if (!chosen.length) throw new Error("Select the cells to fill");
  const tool = chosen.length === 1 ? chosen[0].shape : M.fuseTemp(chosen.map((c) => c.shape));
  if (f.removeTools) for (const id of f.tools || []) st.bodies.delete(id);
  st._tool = tool;
  return { affected: M.applyOp(st, { ...f, bodies: f.participants }, tool, doc), cells: chosen.length };
}

// ------------------------------------------------------------------ Extend
function extendApply(st, f, P, doc) {
  const bag = [];
  try {
    const dist = fval(P, f, "distance");
    if (Math.abs(dist) < 1e-9) throw new Error("Distance cannot be zero");
    const type = f.extendType || "natural";
    const affected = [];
    for (const [id, refs] of M.groupByBody(f.edges || [])) {
      const b = st.bodies.get(id);
      if (!b) throw new Error("Missing edges");
      for (const r of refs) {
        const { index, edge } = resolveEdge(st, r);
        bag.push(edge);
        if (edgeFaces(b.shape, index).length !== 1) throw new Error("Select free (open) edges of surface bodies to extend");
      }
      const parts = ruledFaces(st, { edges: refs }, P, { type: type === "perpendicular" ? "normal" : "tangent", dist, mitered: (f.alignment || "free") === "free", natural: type === "natural" }, bag);
      const { shape } = G.sew([b.shape, ...parts]);
      bag.push(...parts);
      st.bodies.set(id, { id, shape, from: f.id });
      affected.push(id);
    }
    if (!affected.length) throw new Error("Missing edges");
    return { affected };
  } finally { del(bag); }
}

// ------------------------------------------------------------------ Trim
/** The cutting tool of a Trim feature (shape owned by bag). */
function trimCutter(st, f, bag) {
  const shapes = [];
  for (const id of f.tools || []) { const b = st.bodies.get(id); if (!b) throw new Error("Missing trim tools"); shapes.push(b.shape); }
  if (f.toolPlane) {
    const pl = M.resolvePlane(f.toolPlane, st);
    if (!pl) throw new Error("Missing trim tools");
    const sq = G.planeFace(pl, centerOf(st), M.modelSize(st));
    bag.push(sq);
    shapes.push(sq);
  }
  if ((f.toolCurves || []).length) {
    // sketch curves cut along the sketch normal (through the whole model)
    const L = M.modelSize(st);
    for (const s of sectionsOf(st, { curves: f.toolCurves }, bag)) {
      const n = V.norm(s.plane.n);
      const w = G.translated(s.wire, V.mul(n, -L));
      bag.push(w);
      const pr = G.prismOf(w, V.mul(n, 2 * L));
      bag.push(pr);
      shapes.push(pr);
    }
  }
  if (!shapes.length) throw new Error("Missing trim tools");
  const c = G.combine(shapes);
  if (c !== shapes[0]) bag.push(c);
  return c;
}
function centerOf(st) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const b of st.bodies.values()) { const bb = K.bboxOf(b.shape); if (!bb) continue; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); } }
  return Number.isFinite(mn[0]) ? V.mul(V.add(mn, mx), 0.5) : [0, 0, 0];
}
/**
 * Pieces of the surfaces a Trim tool cuts: [{body, pieces:[{faces, shape}]}] in a state. Surface bodies
 * crossed by the tool (and surface tool bodies themselves). The caller deletes piece shapes.
 */
export function trimPieces(st, f, doc, bag) {
  const cutter = trimCutter(st, f, bag);
  const out = [];
  const ids = [...st.bodies.keys()].filter((id) => M.bodyKind(st, id) === "surface" && (!doc || doc.bodies[id]?.visible !== false));
  for (const id of ids) {
    const b = st.bodies.get(id);
    // a surface tool body is trimmed by the other tools (bodies, plane, curves) only
    const cut = (f.tools || []).includes(id) ? trimCutterExcept(st, f, id, bag) : cutter;
    if (!cut || G.distance(b.shape, cut) > 1e-4) continue;
    let split;
    try { split = G.splitBy(b.shape, [cut]); } catch { continue; }
    bag.push(split);
    const groups = G.piecesOf(split, cut);
    if (groups.length < 2) { del(groups.flat()); continue; }
    out.push({ body: id, pieces: groups.map((faces) => ({ faces, shape: G.combine(faces) })) });
  }
  return out;
}
function trimCutterExcept(st, f, id, bag) {
  const g = { ...f, tools: (f.tools || []).filter((t) => t !== id) };
  if (!g.tools.length && !g.toolPlane && !(g.toolCurves || []).length) return null;
  return trimCutter(st, g, bag);
}
/** Index of the piece nearest to p (by distance to its faces). */
export function pieceAt(pieces, p) {
  let best = -1, bd = Infinity;
  pieces.forEach((pc, i) => { const d = G.pointDistance(pc.shape, p); if (d < bd) { bd = d; best = i; } });
  return bd < 1e-2 ? best : -1;
}
function trimApply(st, f, P, doc) {
  const bag = [];
  try {
    const rem = f.remove || [];
    const sets = trimPieces(st, f, doc, bag);
    if (!sets.length) throw new Error("The trim tool does not cut any surface body");
    const affected = [];
    // every piece (with its removed flag) goes to the result: the dialog draws and picks them
    const pieces = [];
    for (const set of sets) {
      const drop = new Set();
      for (const r of rem) if (r.body === set.body) { const i = pieceAt(set.pieces, r.p); if (i >= 0) drop.add(i); }
      set.pieces.forEach((pc, i) => pieces.push({ body: set.body, shape: pc.shape, removed: drop.has(i) }));
      if (!drop.size) continue;
      const keep = set.pieces.filter((_, i) => !drop.has(i));
      if (!keep.length) { st.bodies.delete(set.body); affected.push(set.body); continue; }
      const { shape } = G.sew(keep.flatMap((pc) => pc.faces));
      st.bodies.set(set.body, { id: set.body, shape, from: f.id });
      affected.push(set.body);
    }
    for (const set of sets) for (const pc of set.pieces) for (const fc of pc.faces) if (fc !== pc.shape) bag.push(fc);
    if (!affected.length) return { affected, pieces, warning: rem.length ? "The selected faces are not cut by the trim tool" : "Select the faces to remove" };
    return { affected, pieces };
  } finally { del(bag); }
}

// ------------------------------------------------------------------ Untrim
function untrimApply(st, f, P, doc) {
  const bag = [];
  try {
    const ext = f.extension !== undefined && f.extension !== "" ? fval(P, f, "extension") : 0;
    const type = f.untrimType || "all";
    const refs = type === "manual" ? f.edges || [] : f.faces || [];
    if (!refs.length) throw new Error(type === "manual" ? "Missing edges" : "Missing faces");
    const affected = [];
    for (const [id, list] of M.groupByBody(refs)) {
      const b = st.bodies.get(id);
      if (!b) throw new Error("Missing faces");
      const faces = G.facesOf(b.shape);
      bag.push(...faces);
      const T = K.topoOf(b.shape);
      // face index -> new face
      const repl = new Map();
      if (type === "manual") {
        const byFace = new Map();
        for (const r of list) {
          const { edge, index } = resolveEdge(st, r);
          bag.push(edge);
          const fi = (T.edges[index].faces || [])[0];
          if (fi === undefined) continue;
          if (!byFace.has(fi)) byFace.set(fi, []);
          byFace.get(fi).push(edge);
        }
        for (const [fi, edges] of byFace) {
          const face = faces[fi];
          if (edges.some((e) => G.onOuterWire(face, e))) repl.set(fi, G.untrimmedFace(face, ext, { keepHoles: true }));
          else repl.set(fi, G.faceWithHoles(face, (w) => !edges.some((e) => G.pointDistance(w, G.edgeInfo(e).m) < 1e-5)));
        }
      } else {
        for (const r of list) {
          const index = faceRefIndex(st, r);
          const face = faces[index];
          if (type === "internal") repl.set(index, G.untrimmedFace(face, 0, { outerOnly: true }));
          else if (type === "external") repl.set(index, G.untrimmedFace(face, ext, { keepHoles: true }));
          else repl.set(index, G.untrimmedFace(face, ext));
        }
      }
      if (!repl.size) continue;
      const all = faces.map((fc, i) => repl.get(i) || fc);
      const { shape } = all.length === 1 ? { shape: all[0] } : G.sew(all);
      if (all.length > 1) bag.push(...repl.values());
      if (f.keepCopy) {
        const nid = f.newBody || `${f.id}_1`;
        st.bodies.set(nid, { id: nid, shape, from: f.id });
        affected.push(nid);
      } else {
        st.bodies.set(id, { id, shape, from: f.id });
        affected.push(id);
      }
    }
    if (!affected.length) throw new Error("Missing faces");
    return { affected };
  } finally { del(bag); }
}

// ------------------------------------------------------------------ Stitch / Unstitch / Merge / Reverse
function stitchApply(st, f, P, doc) {
  const ids = (f.bodies || []).filter((id) => st.bodies.has(id));
  if (!ids.length) throw new Error("Missing surfaces");
  const tol = f.tolerance !== undefined && f.tolerance !== "" ? fval(P, f, "tolerance") : 0.01;
  if (!(tol > 0)) throw new Error("Tolerance must be positive");
  const { bodies, free, freeShape } = G.stitch(ids.map((id) => st.bodies.get(id).shape), tol, { solids: true, freeShape: true });
  for (const id of ids) st.bodies.delete(id);
  const affected = [];
  bodies.forEach((s, i) => {
    const id = i === 0 ? ids[0] : (f.newBodies || [])[i - 1] || `${f.id}_${i}`;
    st.bodies.set(id, { id, shape: s, from: f.id });
    affected.push(id);
  });
  return { affected, free, freeEdges: freeShape, solid: bodies.some((s) => M.shapeKind(s) === "solid") };
}
function unstitchApply(st, f, P, doc) {
  const affected = [];
  let k = 0;
  const bag = [];
  const nextId = () => { k++; return `${f.id}_${k}`; };
  try {
    const whole = new Set(f.bodies || []);
    const picked = M.groupByBody(f.faces || []);
    for (const id of new Set([...whole, ...picked.keys()])) {
      const b = st.bodies.get(id);
      if (!b) throw new Error("Missing target bodies or faces");
      const faces = G.facesOf(b.shape);
      let sel;
      if (whole.has(id)) sel = new Set(faces.map((_, i) => i));
      else sel = new Set((picked.get(id) || []).map((r) => faceRefIndex(st, r)));
      const rest = faces.filter((_, i) => !sel.has(i));
      const loose = faces.filter((_, i) => sel.has(i));
      bag.push(...rest);
      if (rest.length) {
        const { shape } = rest.length === 1 ? { shape: rest[0] } : G.sew(rest);
        if (rest.length === 1) bag.splice(bag.indexOf(rest[0]), 1);
        st.bodies.set(id, { id, shape, from: f.id });
        affected.push(id);
      }
      loose.forEach((fc, i) => {
        const nid = !rest.length && i === 0 ? id : nextId();
        st.bodies.set(nid, { id: nid, shape: fc, from: f.id });
        affected.push(nid);
      });
    }
    if (!affected.length) throw new Error("Missing target bodies or faces");
    return { affected };
  } finally { del(bag); }
}
function mergeApply(st, f, P, doc) {
  const affected = [];
  for (const [id, refs] of M.groupByBody(f.faces || [])) {
    const b = st.bodies.get(id);
    if (!b) throw new Error("Missing faces");
    const idx = [...new Set(refs.map((r) => faceRefIndex(st, r)))];
    if (idx.length < 2) throw new Error("Select two or more adjacent faces to merge");
    const s = mergeFaces(b.shape, idx);
    st.bodies.set(id, { id, shape: s, from: f.id });
    affected.push(id);
  }
  if (!affected.length) throw new Error("Missing faces");
  return { affected };
}
/** Unify the selected faces (indices) of a shape where they lie on one surface. */
function mergeFaces(shape, idx) {
  const O = K.R.getOC();
  const T = K.topoOf(shape);
  const sel = new Set(idx);
  const edges = K.edgesOf(shape);
  const u = new O.ShapeUpgrade_UnifySameDomain(shape.wrapped, true, true, true);
  try {
    // keep every edge that is not between two selected faces
    T.edges.forEach((g, i) => {
      const fs = g.faces || [];
      if (!(fs.length === 2 && sel.has(fs[0]) && sel.has(fs[1]))) u.KeepShape(edges[i].wrapped);
    });
    u.Build();
    const out = G.cast(u.Shape());
    const n0 = T.faces.length, n1 = G.facesOf(out).length;
    if (n1 >= n0) { del(out); throw new Error("The selected faces cannot be merged: they do not lie on one surface"); }
    return out;
  } finally { del(u, edges); }
}
function reverseApply(st, f) {
  const affected = [];
  for (const id of f.bodies || []) {
    const b = st.bodies.get(id);
    if (!b) throw new Error("Missing faces");
    st.bodies.set(id, { id, shape: G.reversedShape(b.shape), from: f.id });
    affected.push(id);
  }
  if (!affected.length) throw new Error("Missing faces");
  return { affected };
}

// ------------------------------------------------------------------ Silhouette Split
/** View direction of a Silhouette Split ({plane} -> its normal, {axis} -> the axis). */
export function viewDirection(st, ref) { return directionOf(st, ref); }
function silhouetteApply(st, f, P, doc) {
  const bag = [];
  try {
    const d = directionOf(st, f.view);
    if (!d) throw new Error("Missing pull direction");
    const ids = (f.bodies || []).filter((id) => st.bodies.has(id));
    if (ids.length !== 1) throw new Error(ids.length ? "No target body or more than one target body!" : "Missing body");
    const id = ids[0];
    const b = st.bodies.get(id);
    const sil = G.silhouette(b.shape, d);
    if (!sil.segs.length) throw new Error("Failed to create parting lines");
    const L = M.modelSize(st);
    let tool;
    if (sil.plane) { tool = G.planeFace(sil.plane, centerOf(st), L); }
    else {
      if (f.operation === "solid") throw new Error("Split Solid Body mode only supports coplanar parting lines.");
      tool = G.curtain(sil.segs, d, L);
    }
    bag.push(tool);
    const op = f.operation || "faces";
    if (op === "faces") {
      // split the body's shells (not the solid: that would add the section faces inside it)
      const kind = M.shapeKind(b.shape);
      const shells = kind === "solid" ? G.explore(b.shape, "shell") : [];
      bag.push(...shells);
      const src = shells.length ? G.combine(shells) : b.shape;
      if (src !== b.shape && src !== shells[0]) bag.push(src);
      const split = G.splitBy(src, [tool]);
      bag.push(split);
      const faces = G.facesOf(split);
      bag.push(...faces);
      if (faces.length <= K.topoOf(b.shape).faces.length) throw new Error("Failed to create parting lines");
      const { bodies } = G.stitch(faces, 1e-4, { solids: kind === "solid" });
      bodies.forEach((s, i) => {
        const nid = i === 0 ? id : `${f.id}_${i}`;
        st.bodies.set(nid, { id: nid, shape: s, from: f.id });
      });
      return { affected: bodies.map((_, i) => (i === 0 ? id : `${f.id}_${i}`)) };
    }
    const parts = K.splitShape(b.shape, [tool]);
    if (parts.length < 2) { del(parts); throw new Error("Failed to create parting lines"); }
    const affected = [];
    parts.forEach((s, i) => {
      const nid = i === 0 ? id : `${f.id}_${i}`;
      st.bodies.set(nid, { id: nid, shape: s, from: f.id });
      affected.push(nid);
    });
    return { affected };
  } finally { del(bag); }
}

// ------------------------------------------------------------------ Validate (repair)
function validateApply(st, f, P, doc) {
  const tol = f.gap !== undefined && f.gap !== "" ? fval(P, f, "gap") : 0.01;
  const affected = [];
  for (const id of f.bodies || []) {
    const b = st.bodies.get(id);
    if (!b) throw new Error("Select Bodies to validate");
    const faces = G.facesOf(b.shape);
    const fixed = faces.map((fc) => fixedFace(fc));
    const { bodies } = G.stitch(fixed, Math.max(1e-6, tol), { solids: true });
    del(faces, fixed.filter((x) => !faces.includes(x) && !bodies.includes(x)));
    if (bodies.length === 1) st.bodies.set(id, { id, shape: bodies[0], from: f.id });
    else st.bodies.set(id, { id, shape: G.compound(bodies), from: f.id });
    affected.push(id);
  }
  return { affected };
}
function fixedFace(face) {
  const O = K.R.getOC();
  const fix = new O.ShapeFix_Face(face.wrapped);
  try { fix.Perform(); return new K.R.Face(fix.Face()); } catch { return face; } finally { del(fix); }
}

// ------------------------------------------------------------------ registration
const bodiesOf = (refs) => [...new Set((refs || []).map((r) => r.body).filter(Boolean))];

export const TYPES = {
  surfExtrude: { label: "Extrude", stem: "Extrude", icon: "SurfaceExtrude", fields: { distance: "length", distance2: "length", taper: "angle", taper2: "angle", startOffset: "length" }, makesBodies: surfaceMaker, apply: extrudeApply },
  surfRevolve: { label: "Revolve", stem: "Revolve", icon: "SurfaceRevolve", fields: { angle: "angle", angle2: "angle" }, makesBodies: surfaceMaker, apply: revolveApply },
  surfSweep: { label: "Sweep", stem: "Sweep", icon: "SurfaceSweep", fields: { distance: "none" }, makesBodies: surfaceMaker, apply: sweepApply, deps: (f) => ({ geo: (f.pathEdges || []).map((e) => ({ kind: "edge", ...e })) }) },
  surfLoft: { label: "Loft", stem: "Loft", icon: "SurfaceLoft", fields: {}, makesBodies: surfaceMaker, apply: loftApply },
  surfPatch: { label: "Patch", stem: "Patch", icon: "FusionSurfacePatchCommand", fields: {}, makesBodies: surfaceMaker, apply: patchApply },
  surfRuled: { label: "Ruled", stem: "Ruled", icon: "FusionSurfaceRuledCommand", fields: { distance: "length", angle: "angle" }, makesBodies: surfaceMaker, apply: ruledApply },
  surfOffset: { label: "Offset", stem: "Offset", icon: "FusionSurfaceOffsetCommand", fields: { distance: "length" }, makesBodies: () => true, apply: offsetApply, deps: (f) => ({ bodies: f.surfaces || [] }) },
  surfThicken: { label: "Thicken", stem: "Thicken", icon: "FusionSurfaceThickenCommand", fields: { thickness: "length" }, makesBodies: solidMaker, apply: thickenApply, deps: (f) => ({ bodies: f.surfaces || [] }), touches: (f) => f.participants || [] },
  surfBoundaryFill: { label: "Boundary Fill", stem: "BoundaryFill", icon: "SurfaceSculpt", fields: {}, makesBodies: solidMaker, apply: boundaryFillApply, deps: (f) => ({ geo: [] }), touches: (f) => [...(f.removeTools ? f.tools || [] : []), ...(f.participants || [])] },
  surfExtend: { label: "Extend", stem: "Extend", icon: "FusionExtendCommand", fields: { distance: "length" }, apply: extendApply, touches: (f) => bodiesOf(f.edges) },
  surfTrim: { label: "Trim", stem: "Trim", icon: "FusionSurfaceTrimCommand", fields: {}, apply: trimApply, deps: (f) => ({ geo: (f.remove || []).map((r) => ({ kind: "face", body: r.body, p: r.p })) }), touches: (f) => bodiesOf(f.remove) },
  surfUntrim: { label: "Untrim", stem: "Untrim", icon: "FusionSurfaceUntrimCommand", fields: { extension: "length" }, makesBodies: (f) => !!f.keepCopy, apply: untrimApply, touches: (f) => (f.keepCopy ? [] : bodiesOf((f.untrimType === "manual" ? f.edges : f.faces) || [])) },
  surfStitch: { label: "Stitch", stem: "Stitch", icon: "FusionSurfaceStitchCommand", fields: { tolerance: "length" }, apply: stitchApply, touches: (f) => f.bodies || [] },
  surfUnstitch: { label: "Unstitch", stem: "Unstitch", icon: "FusionSurfaceUnStitchCommand", fields: {}, apply: unstitchApply, touches: (f) => [...(f.bodies || []), ...bodiesOf(f.faces)] },
  surfMerge: { label: "Merge", stem: "Merge", icon: "FusionSurfaceMergeCommand", fields: {}, apply: mergeApply, touches: (f) => bodiesOf(f.faces) },
  surfReverse: { label: "Reverse Normal", stem: "ReverseNormal", icon: "FusionSurfaceReverseNormalCommand", fields: {}, apply: reverseApply, touches: (f) => f.bodies || [] },
  surfSilhouette: { label: "Silhouette Split", stem: "SilhouetteSplit", icon: "FusionPartingLineSplitCmd", fields: {}, apply: silhouetteApply, touches: (f) => f.bodies || [] },
  surfValidate: { label: "Validate", stem: "Validate", icon: "FusionSurfaceValidateCommand", fields: { gap: "length" }, apply: validateApply, touches: (f) => f.bodies || [] },
};

let registered = false;
/** Register every surface feature type (idempotent). `editors` maps type -> (app, id) => void. */
export function registerSurfaceFeatures(editors = {}) {
  if (registered) return;
  registered = true;
  for (const [type, def] of Object.entries(TYPES)) {
    if (M.isFeatureType(type)) continue;
    M.registerFeature(type, { ...def, editor: editors[type] });
  }
}
