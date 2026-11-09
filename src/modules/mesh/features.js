// Timeline feature types of the MESH tab (registered with M.registerFeature). Every type edits st.meshBodies
// entries ({id, kind:'mesh', mesh}) and never mutates a mesh it read: the cached states of earlier features
// share them. Selections are stored compactly as targets [{body, groups?, tris?}] (no groups / tris = whole body).
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import * as A from "./algo.js";
import { boolean, merge } from "./csg.js";
import { tessellate, meshToBrep, REFINEMENT } from "./brep.js";

// ------------------------------------------------------------------ helpers
const LOST = "Lost target body. Edit feature to reselect target body.";
export function meshOf(st, id) {
  const e = st.meshBodies && st.meshBodies.get(id);
  if (!e || !e.mesh || (e.kind && e.kind !== "mesh")) throw new Error(LOST);
  return e;
}
export const workOf = (st, id) => A.fromMesh(meshOf(st, id).mesh);
function put(st, id, W, f, extra = {}) {
  const old = st.meshBodies.get(id);
  st.meshBodies.set(id, { ...(old || {}), id, kind: "mesh", mesh: A.toMesh(W), from: f.id, ...extra });
}
const num = (P, f, k, d) => { if (f[k] === undefined || f[k] === null || f[k] === "") return d; const v = M.fval(P, f, k); return Number.isFinite(v) ? v : d; };
/** Targets grouped per body: [{body, groups:Set|null, tris:[]|null}] (whole body when any entry has neither). */
export function byBody(targets) {
  const m = new Map();
  for (const t of targets || []) {
    if (!t || !t.body) continue;
    let e = m.get(t.body);
    if (!e) { e = { body: t.body, groups: [], tris: [], whole: false }; m.set(t.body, e); }
    if ((!t.groups || !t.groups.length) && (!t.tris || !t.tris.length)) e.whole = true;
    if (t.groups) e.groups.push(...t.groups);
    if (t.tris) e.tris.push(...t.tris);
  }
  return [...m.values()].map((e) => (e.whole ? { body: e.body } : e));
}
function maskOf(W, t) {
  const sel = A.selMask(W, t);
  let any = false;
  for (let i = 0; i < sel.length; i++) if (sel[i]) { any = true; break; }
  if (!any) throw new Error(LOST);
  return sel;
}
const sizeOf = (W) => A.bbox(W).size || 1;
/** Plane of a plane ref moved along its normal by off and tilted by ax / ay degrees about its x / y axes. */
export function movedPlane(st, pr, off = 0, axDeg = 0, ayDeg = 0) {
  const pl = M.resolvePlane(pr, st);
  if (!pl) throw new Error("The plane is missing");
  const n0 = A.norm(pl.n), x0 = A.norm(pl.x), y0 = A.cross(n0, x0);
  const rot = (v, k, a) => A.add(A.add(A.mul(v, Math.cos(a)), A.mul(A.cross(k, v), Math.sin(a))), A.mul(k, A.dot(k, v) * (1 - Math.cos(a))));
  let n = rot(n0, x0, (axDeg * Math.PI) / 180);
  n = rot(n, y0, (ayDeg * Math.PI) / 180);
  return { o: A.add(pl.o, A.mul(n0, off)), n: A.norm(n), x: x0, base: pl };
}
export const transformedPlane = (st, f, P) => movedPlane(st, f.plane, num(P, f, "offset", 0), num(P, f, "ax", 0), num(P, f, "ay", 0));
const bodiesOfTargets = (f) => [...new Set((f.targets || []).map((t) => t.body))];
const planeDeps = (pr) => (pr && pr.kind === "cplane" ? [pr.id] : []);
const deps = (bodies, cplanes = []) => ({ sketches: [], cplanes, bodies, features: [], geo: [] });

const DEFS = {};
function def(type, d) { DEFS[type] = d; }

// ------------------------------------------------------------------ Remesh
def("meshRemesh", {
  label: "Remesh", stem: "MeshRemesh", icon: "ParaMeshRemeshCommand",
  fields: { density: "none", edgeLength: "length", shape: "none" },
  apply(st, f, P) {
    const out = [];
    for (const t of byBody(f.targets)) {
      const W = workOf(st, t.body);
      const sel = maskOf(W, t);
      const avg = A.avgEdge(W, sel);
      const L = f.method === "length" ? num(P, f, "edgeLength", avg) : avg * Math.pow(2, 1 - 2 * Math.max(0, Math.min(1, num(P, f, "density", 0.5))));
      if (!(L > 0)) throw new Error("Target Edge Length must be greater than zero");
      let selArea = 0;
      for (let k = 0; k < sel.length; k++) if (sel[k]) selArea += A.triArea(W, k);
      if (selArea / (0.433 * L * L) > 500000) throw new Error("The target edge length is too small: the result would have more than 500,000 faces");
      A.remesh(W, sel, { L, iters: 3, preserveBoundary: f.boundary !== false, sharpDeg: f.sharp ? 40 : 0, adaptive: f.remeshType === "adaptive" ? Math.max(0, Math.min(1, num(P, f, "shape", 0.5))) : 0 });
      put(st, t.body, A.compact(W), f);
      out.push(t.body);
    }
    return { affected: out };
  },
  deps: (f) => deps(bodiesOfTargets(f)), touches: bodiesOfTargets,
});

// ------------------------------------------------------------------ Reduce
def("meshReduce", {
  label: "Reduce", stem: "MeshReduce", icon: "ParaMeshReduceCommand",
  fields: { tolerance: "length", proportion: "none", faceCount: "none" },
  apply(st, f, P) {
    const out = [];
    for (const t of byBody(f.targets)) {
      const W = workOf(st, t.body);
      const sel = maskOf(W, t);
      let nsel = 0;
      for (let k = 0; k < sel.length; k++) if (sel[k]) nsel++;
      const other = A.tcount(W) - nsel;
      const o = { preserveBoundary: f.boundary !== false };
      if (f.reduceType === "tolerance") o.tolerance = Math.max(1e-6, num(P, f, "tolerance", 0.1));
      else if (f.reduceType === "count") o.target = other + Math.max(4, Math.round(num(P, f, "faceCount", nsel / 2)));
      else o.target = other + Math.max(4, Math.round((nsel * Math.max(0, Math.min(100, num(P, f, "proportion", 50)))) / 100));
      A.reduce(W, sel, o);
      put(st, t.body, A.compact(W), f);
      out.push(t.body);
    }
    return { affected: out };
  },
  deps: (f) => deps(bodiesOfTargets(f)), touches: bodiesOfTargets,
});

// ------------------------------------------------------------------ Plane Cut
def("meshPlaneCut", {
  label: "Plane Cut", stem: "MeshPlaneCut", icon: "ParaMeshPlaneCutCommand",
  fields: { offset: "length", ax: "angle", ay: "angle" },
  makesBodies: (f) => (f.cutType === "split" ? 1 : 0),
  apply(st, f, P) {
    const W = workOf(st, f.body);
    const pl = transformedPlane(st, f, P);
    const r = A.planeCut(W, pl, { mode: f.cutType || "trim", fill: f.cutType === "splitFaces" ? "none" : f.fill || "minimal", flip: !!f.flip });
    if (!r.parts.length) throw new Error("Cannot complete plane cut of mesh body: the plane leaves nothing on the kept side. Use Flip.");
    put(st, f.body, r.parts[0], f);
    const affected = [f.body];
    if (f.cutType === "split") {
      if (r.parts.length < 2) return { affected, warning: "The plane does not cut the body" };
      const id = (f.newBodies || [])[0] || `${f.id}_1`;
      st.meshBodies.set(id, { id, kind: "mesh", mesh: A.toMesh(r.parts[1]), from: f.id });
      affected.push(id);
    }
    return { affected };
  },
  deps: (f) => deps([f.body], planeDeps(f.plane)), touches: (f) => [f.body],
});

// ------------------------------------------------------------------ Shell (Hollow)
def("meshShell", {
  label: "Shell", stem: "MeshShell", icon: "ParaMeshHollowCommand",
  fields: { thickness: "length" },
  apply(st, f, P) {
    const W = workOf(st, f.body);
    const t = num(P, f, "thickness", 1);
    if (!(t > 0)) throw new Error("Thickness is too small");
    const bb = A.bbox(W);
    const minExt = Math.min(...[0, 1, 2].map((k) => bb.max[k] - bb.min[k]));
    if (t >= minExt / 2 && f.direction !== "outside") throw new Error("Cannot shell mesh body. Adjust thickness or use Repair to ensure selected meshes are closed, oriented correctly, and have positive volume.");
    const R = A.hollow(W, t, f.direction || "inside");
    put(st, f.body, R, f);
    return { affected: [f.body] };
  },
  deps: (f) => deps([f.body]), touches: (f) => [f.body],
});

// ------------------------------------------------------------------ Combine
def("meshCombine", {
  label: "Combine", stem: "MeshCombine", icon: "ParaMeshCombineCommand",
  apply(st, f) {
    let W = workOf(st, f.target);
    const tools = (f.tools || []).filter((id) => id !== f.target);
    if (!tools.length) throw new Error(LOST);
    for (const id of tools) {
      const B = workOf(st, id);
      if (f.operation === "merge") W = merge(W, B);
      else {
        const ca = A.analyze(W), cb = A.analyze(B);
        if (!ca.closed || !cb.closed) throw new Error("Cannot combine mesh bodies. Use Repair to ensure selected meshes are closed, oriented correctly, and have positive volume.");
        W = boolean(W, B, f.operation || "join");
      }
    }
    if (!A.tcount(W)) throw new Error("The combine result is empty");
    put(st, f.target, W, f);
    if (!f.keepTools) for (const id of tools) st.meshBodies.delete(id);
    return { affected: [f.target] };
  },
  deps: (f) => deps([f.target, ...(f.tools || [])]), touches: (f) => [f.target, ...(f.keepTools ? [] : f.tools || [])],
});

// ------------------------------------------------------------------ Separate
/** Regions of a separate feature on W: arrays of triangle indices (first = stays in the original body). */
export function separateRegions(W, f) {
  const m = A.tcount(W);
  const groupsOf = (list) => {
    const by = new Map();
    for (const t of list) { const g = W.G[t] ?? 0; if (!by.has(g)) by.set(g, []); by.get(g).push(t); }
    return [...by.values()];
  };
  const connected = (list) => {
    const inS = new Uint8Array(m);
    for (const t of list) inS[t] = 1;
    const N = A.triNeighbors(W);
    const lab = new Int32Array(m).fill(-1);
    const out = [];
    for (const s of list) {
      if (lab[s] >= 0) continue;
      const r = [s]; lab[s] = out.length;
      for (let i = 0; i < r.length; i++) for (let k = 0; k < 3; k++) { const u = N[3 * r[i] + k]; if (u >= 0 && inS[u] && lab[u] < 0) { lab[u] = out.length; r.push(u); } }
      out.push(r);
    }
    return out;
  };
  const all = Array.from({ length: m }, (_, i) => i);
  if (f.sepType === "groups") return groupsOf(all);
  if (f.sepType === "selGroups" || f.sepType === "selFaces") {
    const sel = A.selMask(W, f.sepType === "selGroups" ? { groups: f.groups || [] } : { tris: f.tris || [] });
    const picked = all.filter((t) => sel[t]);
    if (!picked.length) throw new Error(LOST);
    const rest = all.filter((t) => !sel[t]);
    const parts = f.multiple ? (f.sepType === "selGroups" ? groupsOf(picked) : connected(picked)) : [picked];
    return rest.length ? [rest, ...parts] : parts;
  }
  const { comp, count } = A.components(W);
  const out = Array.from({ length: count }, () => []);
  for (let t = 0; t < m; t++) if (comp[t] >= 0) out[comp[t]].push(t);
  return out.filter((r) => r.length);
}
def("meshSeparate", {
  label: "Separate", stem: "MeshSeparate", icon: "ParaMeshExtractCommand",
  makesBodies: (f) => Math.max(0, f.count || 0),
  apply(st, f) {
    const W = workOf(st, f.body);
    const regions = separateRegions(W, f);
    const ids = f.newBodies || [];
    const affected = [f.body];
    const pieces = f.keep ? regions : regions.slice(1);
    if (!f.keep) put(st, f.body, A.filterTris(W, ((s) => (t) => s.has(t))(new Set(regions[0]))), f);
    let warning;
    pieces.forEach((r, i) => {
      const id = ids[i];
      if (!id) { warning = "The mesh changed: some regions were not separated. Edit the feature to update it."; return; }
      const set = new Set(r);
      st.meshBodies.set(id, { id, kind: "mesh", mesh: A.toMesh(A.filterTris(W, (t) => set.has(t))), from: f.id });
      affected.push(id);
    });
    if (pieces.length === 0) warning = "There is nothing to separate";
    return { affected, warning };
  },
  deps: (f) => deps([f.body]), touches: (f) => [f.body],
});

// ------------------------------------------------------------------ Repair
export function repairMesh(W0, f, P) {
  let W = A.clone(W0);
  const size = sizeOf(W);
  const type = f.repairType || "stitch";
  if (type === "rebuild") {
    const d = Math.max(0, Math.min(1, num(P, f, "density", 0.5)));
    const res = Math.round(12 + d * 100);
    const rt = f.rebuildType || "fast";
    return A.voxelRebuild(W, { res, type: rt === "accurate" ? "accurate" : rt === "blocky" ? "blocky" : "fast", offset: rt === "accurate" ? num(P, f, "offset", 0) : 0 });
  }
  if (type !== "closeHoles") {
    A.weld(W, size * 1e-5);
    A.fixTJunctions(W, size * 1e-5);
    W = A.clean(W, { areaEps: (size * 1e-9) ** 2, smallShell: type === "wrap" ? 0 : Math.max(3, Math.round(A.tcount(W) * 0.002)) });
  }
  A.orient(W);
  const loops = A.boundaryLoops(W);
  if (loops.length) { A.fillLoops(W, loops, { type: type === "wrap" ? "smooth" : "minimal" }); A.orient(W); }
  return A.compact(W);
}
def("meshRepair", {
  label: "Repair", stem: "MeshRepair", icon: "ParaMeshRepairCommand",
  fields: { density: "none", offset: "length" },
  apply(st, f, P) {
    const W = workOf(st, f.body);
    const R = repairMesh(W, f, P);
    if (!A.tcount(R)) throw new Error("Cannot repair mesh body. Try a different repair type.");
    put(st, f.body, R, f);
    const an = A.analyze(R);
    return { affected: [f.body], warning: an.closed ? undefined : "Mesh is not closed." };
  },
  deps: (f) => deps([f.body]), touches: (f) => [f.body],
});

// ------------------------------------------------------------------ Reverse Normal
def("meshReverseNormals", {
  label: "Reverse Normal", stem: "MeshReverseNormals", icon: "ParaMeshReverseNormalsCommand",
  apply(st, f) {
    const out = [];
    for (const t of byBody(f.targets)) {
      const W = workOf(st, t.body);
      A.reverse(W, maskOf(W, t));
      put(st, t.body, W, f);
      out.push(t.body);
    }
    return { affected: out };
  },
  deps: (f) => deps(bodiesOfTargets(f)), touches: bodiesOfTargets,
});

// ------------------------------------------------------------------ Smooth / Smooth Boundary
def("meshSmooth", {
  label: "Smooth", stem: "MeshSmooth", icon: "ParaMeshSmoothCommand",
  fields: { smoothness: "none" },
  apply(st, f, P) {
    const out = [];
    const s = Math.max(0, Math.min(1, num(P, f, "smoothness", 0.5)));
    for (const t of byBody(f.targets)) {
      const W = workOf(st, t.body);
      const sel = maskOf(W, t);
      const { free } = A.selVerts(W, sel);
      if (f.boundary !== false) { const b = A.boundaryVerts(W); for (let v = 0; v < free.length; v++) if (b[v]) free[v] = 0; }
      A.taubin(W, free, Math.round(1 + s * 30));
      put(st, t.body, W, f);
      out.push(t.body);
    }
    return { affected: out };
  },
  deps: (f) => deps(bodiesOfTargets(f)), touches: bodiesOfTargets,
});
def("meshSmoothBoundary", {
  label: "Smooth Boundary", stem: "MeshSmoothBoundary", icon: "ParaMeshSmoothBoundaryCommand",
  fields: { smoothness: "none", rings: "none" },
  apply(st, f, P) {
    const out = [];
    const s = Math.max(0, Math.min(1, num(P, f, "smoothness", 0.5)));
    const rings = Math.max(0, Math.round(num(P, f, "rings", 2)));
    for (const t of byBody(f.targets)) {
      const W = workOf(st, t.body);
      const sel = maskOf(W, t);
      const loops = A.boundaryLoops(W);
      const { inS } = A.selVerts(W, sel);
      const mine = loops.filter((L) => L.some((v) => inS[v]));
      if (!mine.length) throw new Error("Cannot smooth mesh boundary. The selection has no open boundary.");
      const ref = f.preserveShape ? A.triGrid(A.clone(W)) : null;
      const iters = Math.round(2 + s * 30);
      // 1D smoothing along each boundary loop
      for (let it = 0; it < iters; it++) {
        for (const L of mine) {
          const np = L.map((v, i) => {
            const a = A.vtx(W, L[(i + L.length - 1) % L.length]), b = A.vtx(W, L[(i + 1) % L.length]), p = A.vtx(W, v);
            return A.add(p, A.mul(A.sub(A.mul(A.add(a, b), 0.5), p), 0.5));
          });
          L.forEach((v, i) => { W.P[3 * v] = np[i][0]; W.P[3 * v + 1] = np[i][1]; W.P[3 * v + 2] = np[i][2]; });
        }
      }
      // relax the rings of vertices next to the boundary
      if (rings > 0) {
        const NB = A.vertNeighbors(W);
        const ring = new Uint8Array(A.vcount(W));
        let front = mine.flat();
        const bnd = new Set(front);
        for (let r = 0; r < rings; r++) {
          const nx = [];
          for (const v of front) for (const u of NB[v]) if (!ring[u] && !bnd.has(u)) { ring[u] = 1; nx.push(u); }
          front = nx;
        }
        A.taubin(W, ring, Math.round(2 + s * 10));
      }
      if (ref) for (let v = 0; v < A.vcount(W); v++) { const h = A.closestPoint(ref, A.vtx(W, v)); if (h) { W.P[3 * v] = h.q[0]; W.P[3 * v + 1] = h.q[1]; W.P[3 * v + 2] = h.q[2]; } }
      put(st, t.body, W, f);
      out.push(t.body);
    }
    return { affected: out };
  },
  deps: (f) => deps(bodiesOfTargets(f)), touches: bodiesOfTargets,
});

// ------------------------------------------------------------------ Close Cracks
def("meshCloseCracks", {
  label: "Close Cracks", stem: "MeshCloseCracks", icon: "ParaMeshCloseCracksCommand",
  apply(st, f) {
    let W = workOf(st, f.body);
    const before = A.analyze(W).openEdges;
    const tol = Math.max(A.avgEdge(W) * 0.05, sizeOf(W) * 1e-5);
    A.weld(W, tol);
    A.fixTJunctions(W, tol);
    W = A.clean(W, { areaEps: (sizeOf(W) * 1e-9) ** 2 });
    A.orient(W);
    put(st, f.body, W, f);
    const after = A.analyze(W).openEdges;
    return { affected: [f.body], warning: before && after === before ? "No cracks were found" : undefined };
  },
  deps: (f) => deps([f.body]), touches: (f) => [f.body],
});

// ------------------------------------------------------------------ Erase And Fill
def("meshEraseFill", {
  label: "Erase And Fill", stem: "MeshEraseAndFill", icon: "ParaMeshEraseAndFillCommand",
  fields: { density: "none" },
  apply(st, f, P) {
    const out = [];
    for (const t of byBody(f.targets)) {
      const W0 = workOf(st, t.body);
      const sel = maskOf(W0, t);
      const touched = new Set();
      for (let k = 0; k < sel.length; k++) if (sel[k]) for (let j = 0; j < 3; j++) touched.add(W0.T[3 * k + j]);
      // erase: the kept triangles keep their vertex numbering (filterTris compacts; map through positions)
      const keepT = [], keepG = [];
      for (let k = 0; k < A.tcount(W0); k++) if (!sel[k]) { keepT.push(W0.T[3 * k], W0.T[3 * k + 1], W0.T[3 * k + 2]); keepG.push(W0.G[k]); }
      const W = { P: W0.P.slice(), T: keepT, G: keepG, hasGroups: W0.hasGroups };
      const loops = A.boundaryLoops(W).filter((L) => L.some((v) => touched.has(v)));
      if (!loops.length) throw new Error("Select faces to repair or double-click a face at the edge of a hole to fill");
      const d = Math.max(0, Math.min(1, num(P, f, "density", 0.5)));
      const edge = A.avgEdge(W0, sel) * Math.pow(2, 1 - 2 * d);
      A.fillLoops(W, loops, { type: f.fillType || "smooth", edge });
      put(st, t.body, A.compact(W), f);
      out.push(t.body);
    }
    return { affected: out };
  },
  deps: (f) => deps(bodiesOfTargets(f)), touches: bodiesOfTargets,
});

// ------------------------------------------------------------------ Bridge
def("meshBridge", {
  label: "Bridge", stem: "MeshBridge", icon: "ParaMeshBridgeCommand",
  fields: { density: "none" },
  apply(st, f, P) {
    const ts = byBody(f.targets);
    if (ts.length !== 1) throw new Error("Cannot create a bridge: the selection doesn't define two separate regions.");
    const t = ts[0];
    const W = workOf(st, t.body);
    const sel = maskOf(W, t);
    const d = Math.max(0, Math.min(1, num(P, f, "density", 0.5)));
    A.bridge(W, sel, { rings: Math.round(d * 8), group: f.newGroup ? A.nextGroup(W) : null });
    if (f.newGroup) W.hasGroups = true;
    put(st, t.body, W, f);
    return { affected: [t.body] };
  },
  deps: (f) => deps(bodiesOfTargets(f)), touches: bodiesOfTargets,
});

// ------------------------------------------------------------------ Mesh Align
export function alignMatrix(st, f) {
  const W = workOf(st, f.from.body);
  const sel = maskOf(W, f.from);
  const tris = [];
  for (let k = 0; k < sel.length; k++) if (sel[k]) tris.push(k);
  const fp = A.fitPlane(W, tris);
  const pl = M.resolvePlane(f.plane, st);
  if (!pl) throw new Error("Select a plane");
  const target = A.mul(A.norm(pl.n), f.flip ? 1 : -1);
  const R = A.rotBetween(fp.n, target);
  const c = A.applyR(R, fp.o);
  const dn = A.dot(A.sub(c, pl.o), A.norm(pl.n));
  return { R, t: A.mul(A.norm(pl.n), -dn) };
}
def("meshAlign", {
  label: "Mesh Align", stem: "MeshAlign", icon: "ParaMeshAlignCommand",
  apply(st, f) {
    const { R, t } = alignMatrix(st, f);
    const W = workOf(st, f.from.body);
    A.transformPoints(W, (p) => A.add(A.applyR(R, p), t));
    put(st, f.from.body, W, f);
    return { affected: [f.from.body] };
  },
  deps: (f) => deps([f.from && f.from.body], planeDeps(f.plane)), touches: (f) => [f.from && f.from.body],
});

// ------------------------------------------------------------------ Attract To Reference
def("meshAttract", {
  label: "Attract to Reference", stem: "MeshAttract", icon: "ParaMeshAttractToReferenceCommand",
  fields: { density: "none", smoothness: "none", offset: "length" },
  apply(st, f, P) {
    const ref = workOf(st, f.reference);
    const out = [];
    for (const t of byBody(f.targets)) {
      if (t.body === f.reference) throw new Error("Select a different reference mesh body");
      let W = workOf(st, t.body);
      let sel = maskOf(W, t);
      const d = Math.max(0, Math.min(1, num(P, f, "density", 0.5)));
      const L = Math.min(A.avgEdge(W, sel), A.avgEdge(ref)) * Math.pow(2, 1 - 2 * d);
      sel = A.splitLongEdges(W, sel, L * 1.3, 500000).sel;
      const { free } = A.selVerts(W, sel);
      if (f.keepBoundary !== false) { const b = A.boundaryVerts(W); for (let v = 0; v < free.length; v++) if (b[v]) free[v] = 0; }
      if (f.keepGroups) { const fv = A.featureVerts(W, { groups: true }); for (let v = 0; v < free.length; v++) if (fv.verts[v]) free[v] = 0; }
      A.attract(W, free, ref, { offset: num(P, f, "offset", 0), smooth: Math.max(0, Math.min(1, num(P, f, "smoothness", 0.3))), iters: 3, sharp: !!f.sharp });
      W = A.compact(W);
      put(st, t.body, W, f);
      out.push(t.body);
    }
    return { affected: out };
  },
  deps: (f) => deps([...bodiesOfTargets(f), f.reference]), touches: bodiesOfTargets,
});

// ------------------------------------------------------------------ Texture Extrude
function sampleImage(img, u, v, repeat) {
  if (!img || !img.data) return 0;
  if (!img._px) {
    const s = atob(img.data);
    const px = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) px[i] = s.charCodeAt(i);
    Object.defineProperty(img, "_px", { value: px, enumerable: false });
  }
  if (repeat) { u -= Math.floor(u); v -= Math.floor(v); } else if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
  const x = Math.min(img.w - 1, Math.max(0, u * (img.w - 1))), y = Math.min(img.h - 1, Math.max(0, (1 - v) * (img.h - 1)));
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(img.w - 1, x0 + 1), y1 = Math.min(img.h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const g = (i, j) => img._px[j * img.w + i] / 255;
  return (g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - fy) + (g(x0, y1) * (1 - fx) + g(x1, y1) * fx) * fy;
}
def("meshTexture", {
  label: "Texture Extrude", stem: "MeshTexture", icon: "ParaMeshTextureCommand",
  fields: { distance: "length", multiplicity: "none", density: "none", blend: "length" },
  apply(st, f, P) {
    if (!f.image || !f.image.data) throw new Error("Select a texture image in the dialog");
    const out = [];
    const dist = num(P, f, "distance", 1) * (f.flip ? -1 : 1);
    const mult = Math.max(0.01, num(P, f, "multiplicity", 1));
    const dens = Math.max(0, Math.min(1, num(P, f, "density", 0.5)));
    const blend = Math.max(0, num(P, f, "blend", 0));
    for (const t of byBody(f.targets)) {
      const W = workOf(st, t.body);
      let sel = maskOf(W, t);
      const tris = [];
      for (let k = 0; k < sel.length; k++) if (sel[k]) tris.push(k);
      const fp = A.fitPlane(W, tris);
      const bb0 = A.bbox(W);
      // refinement: enough vertices to carry the image
      let selArea = 0;
      for (const k of tris) selArea += A.triArea(W, k);
      const nTarget = 2000 + dens * 120000;
      const L = Math.max(Math.sqrt(selArea / (0.433 * nTarget)), bb0.size * 1e-4);
      sel = A.splitLongEdges(W, sel, L * 1.4, 400000).sel;
      const { free, border } = A.selVerts(W, sel);
      const N = A.vertexNormals(W);
      // projection frame
      const ax = A.planeAxes(fp.n);
      const ext = Math.max(...[0, 1, 2].map((k) => bb0.max[k] - bb0.min[k])) || 1;
      const proj = f.projection || "planar";
      const uv = (p, n) => {
        const q = A.sub(p, bb0.c);
        if (proj === "cylindrical") return [(Math.atan2(q[1], q[0]) / (2 * Math.PI) + 0.5) * mult, ((q[2] + ext / 2) / ext) * mult];
        if (proj === "spherical") { const r = A.len(q) || 1; return [(Math.atan2(q[1], q[0]) / (2 * Math.PI) + 0.5) * mult, (Math.acos(Math.max(-1, Math.min(1, q[2] / r))) / Math.PI) * mult]; }
        if (proj === "box") {
          const a = n.map(Math.abs);
          const k = a[0] >= a[1] && a[0] >= a[2] ? 0 : a[1] >= a[2] ? 1 : 2;
          const [i, j] = k === 0 ? [1, 2] : k === 1 ? [0, 2] : [0, 1];
          return [((q[i] + ext / 2) / ext) * mult, ((q[j] + ext / 2) / ext) * mult];
        }
        return [((A.dot(q, ax.x) + ext / 2) / ext) * mult, ((A.dot(q, ax.y) + ext / 2) / ext) * mult];
      };
      // blend: distance to the selection border (approximate with distance to border vertices)
      let borderPts = null;
      if (blend > 0) { borderPts = []; for (let v = 0; v < border.length; v++) if (border[v]) borderPts.push(A.vtx(W, v)); }
      const np = W.P.slice();
      for (let v = 0; v < A.vcount(W); v++) {
        if (!free[v]) continue;
        const p = A.vtx(W, v), n = [N[3 * v], N[3 * v + 1], N[3 * v + 2]];
        const [u, w] = uv(p, n);
        let g = sampleImage(f.image, u, w, f.repeat !== false);
        if (f.symmetric) g -= 0.5;
        let k = 1;
        if (borderPts && borderPts.length) {
          let dmin = Infinity;
          for (const b of borderPts) { const d = A.len(A.sub(b, p)); if (d < dmin) dmin = d; }
          k = Math.min(1, dmin / blend);
        }
        const d = g * dist * k;
        np[3 * v] += n[0] * d; np[3 * v + 1] += n[1] * d; np[3 * v + 2] += n[2] * d;
      }
      W.P = np;
      put(st, t.body, W, f);
      out.push(t.body);
    }
    return { affected: out };
  },
  deps: (f) => deps(bodiesOfTargets(f)), touches: bodiesOfTargets,
});

// ------------------------------------------------------------------ Scale Mesh
def("meshScale", {
  label: "Scale Mesh", stem: "Scale", icon: "ParaMeshScaleCommand",
  fields: { factor: "none", sx: "none", sy: "none", sz: "none" },
  apply(st, f, P) {
    const c = f.point || [0, 0, 0];
    const s = f.scaleType === "nonUniform" ? [num(P, f, "sx", 1), num(P, f, "sy", 1), num(P, f, "sz", 1)] : [1, 1, 1].map(() => num(P, f, "factor", 1));
    if (s.some((x) => !(x > 0))) throw new Error("Cannot scale mesh body. Adjust scale factor or X/Y/Z scale.");
    for (const id of f.bodies || []) {
      const W = workOf(st, id);
      A.transformPoints(W, (p) => [c[0] + (p[0] - c[0]) * s[0], c[1] + (p[1] - c[1]) * s[1], c[2] + (p[2] - c[2]) * s[2]]);
      put(st, id, W, f);
    }
    return { affected: f.bodies || [] };
  },
  deps: (f) => deps(f.bodies || []), touches: (f) => f.bodies || [],
});

// ------------------------------------------------------------------ Remove
def("meshRemove", {
  label: "Remove", stem: "MeshRemove", icon: "ParaMeshRemoveCommand",
  apply(st, f) {
    for (const id of f.bodies || []) { meshOf(st, id); st.meshBodies.delete(id); }
    return { affected: [] };
  },
  deps: (f) => deps(f.bodies || []), touches: (f) => f.bodies || [],
});

// ------------------------------------------------------------------ face groups
def("meshFaceGroups", {
  label: "Generate Face Groups", stem: "GenerateFaceGroups", icon: "ParaMeshCalculateFaceGroupsCommand",
  fields: { angle: "angle", tol: "length", minSize: "none" },
  apply(st, f, P) {
    const out = [];
    let groups = 0;
    for (const t of byBody(f.targets)) {
      const W = workOf(st, t.body);
      const sel = maskOf(W, t);
      groups += A.generateGroups(W, sel, { angle: num(P, f, "angle", 15), method: f.method || "fast", tol: num(P, f, "tol", 0.1), minArea: Math.max(0, Math.min(50, num(P, f, "minSize", 0.5))) / 100 });
      put(st, t.body, W, f);
      out.push(t.body);
    }
    return { affected: out, groups };
  },
  deps: (f) => deps(bodiesOfTargets(f)), touches: bodiesOfTargets,
});
def("meshMergeGroups", {
  label: "Combine Face Groups", stem: "CombineFaceGroups", icon: "ParaMeshMergeFaceGroupsCommand",
  apply(st, f) {
    const W = workOf(st, f.body);
    const gs = new Set(f.groups || []);
    if (gs.size < 2) throw new Error("Select two or more adjacent face groups");
    const g0 = Math.min(...gs);
    let n = 0;
    for (let t = 0; t < A.tcount(W); t++) if (gs.has(W.G[t] ?? 0)) { W.G[t] = g0; n++; }
    if (!n) throw new Error("Cannot combine face groups on mesh body. Use Generate Face Groups to regenerate a starting set of face groups.");
    W.hasGroups = true;
    put(st, f.body, W, f);
    return { affected: [f.body] };
  },
  deps: (f) => deps([f.body]), touches: (f) => [f.body],
});
def("meshCreateGroup", {
  label: "Create Face Group", stem: "CreateFaceGroup", icon: "ParaMeshCreateFaceGroupCommand",
  apply(st, f) {
    const W = workOf(st, f.body);
    const g = A.nextGroup(W);
    let n = 0;
    for (const t of f.tris || []) if (t >= 0 && t < A.tcount(W)) { W.G[t] = g; n++; }
    if (!n) throw new Error(LOST);
    W.hasGroups = true;
    put(st, f.body, W, f);
    return { affected: [f.body] };
  },
  deps: (f) => deps([f.body]), touches: (f) => [f.body],
});

// ------------------------------------------------------------------ Tessellate / Convert / Quad
export function refinementOf(f, P, size) {
  if (f.refinement === "custom") return { dev: Math.max(1e-4, num(P, f, "surfDev", size * 0.0006)), ang: Math.max(0.5, num(P, f, "normDev", 10)), maxEdge: Math.max(0, num(P, f, "maxEdge", 0)) };
  const r = REFINEMENT[f.refinement] || REFINEMENT.medium;
  return { dev: size * r.dev, ang: r.ang, maxEdge: 0 };
}
def("meshTessellate", {
  label: "Tessellate", stem: "MeshTessellate", icon: "ParaMeshTessellateCommand",
  fields: { surfDev: "length", normDev: "angle", maxEdge: "length", aspect: "none" },
  makesBodies: true,
  apply(st, f, P) {
    const b = st.bodies.get(f.body);
    if (!b) throw new Error("Lost target body. Edit feature to reselect target body.");
    const bb = K.bboxOf(b.shape);
    const size = bb ? Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) : 100;
    const W = tessellate(K, b.shape, refinementOf(f, P, size));
    if (!A.tcount(W)) throw new Error("Cannot tessellate solid or surface body to create mesh body.");
    st.meshBodies.set(f.newBody, { id: f.newBody, kind: "mesh", mesh: A.toMesh(W), from: f.id });
    return { affected: [f.newBody], triangles: A.tcount(W) };
  },
  deps: (f) => deps([f.body]), touches: () => [],
});
def("meshConvert", {
  label: "Convert Mesh", stem: "Convert Mesh", icon: "ParaMeshConvertCommand",
  makesBodies: true,
  apply(st, f) {
    const W = workOf(st, f.body);
    if (f.method === "organic") throw new Error("Organic conversion needs the T-Spline Form environment, which is not available in this recreation. Use Faceted or Prismatic.");
    if (A.tcount(W) > 20000) throw new Error("This mesh has more than 20000 faces: use Reduce before converting it.");
    const shape = meshToBrep(K, W, { unify: f.method === "prismatic" });
    st.bodies.set(f.newBody, { id: f.newBody, shape, from: f.id });
    return { affected: [f.newBody] };
  },
  deps: (f) => deps([f.body]), touches: () => [],
});
def("meshQuad", {
  label: "Convert To Quad Mesh", stem: "MeshToQuadMesh", icon: "ParaMeshToQuadMeshCommand",
  fields: { edgeLength: "length" },
  apply(st, f, P) {
    const out = [];
    for (const t of byBody(f.targets)) {
      let W = workOf(st, t.body);
      let sel = maskOf(W, t);
      const L = num(P, f, "edgeLength", A.avgEdge(W, sel));
      if (!(L > 0)) throw new Error("Target Edge Length must be greater than zero");
      const r = A.remesh(W, sel, { L, iters: 3, preserveBoundary: f.boundary !== false, sharpDeg: f.sharp ? 40 : 0 });
      sel = r.sel;
      W = A.compact(W);
      W.Q = Array.from(A.pairQuads(W, sel, { sharpDeg: f.sharp ? 40 : 60 }));
      put(st, t.body, W, f);
      out.push(t.body);
    }
    return { affected: out };
  },
  deps: (f) => deps(bodiesOfTargets(f)), touches: bodiesOfTargets,
});

// ------------------------------------------------------------------ Base Mesh Feature (Direct Edit)
def("meshBase", {
  label: "Base Mesh Feature", stem: "BaseMeshFeature", icon: "ParaMeshBaseFeatureCreateCommand",
  apply(st, f, P, doc) {
    const affected = [];
    for (const id of f.removed || []) { st.meshBodies.delete(id); st.bodies.delete(id); }
    for (const [id, data] of Object.entries(f.items || {})) {
      const md = M.meshDataOf(doc, data);
      if (!md) throw new Error("The mesh data of this feature is missing");
      st.meshBodies.set(id, { id, kind: "mesh", mesh: { positions: md.positions, indices: md.indices, ...(md.groups ? { groups: md.groups } : {}) }, from: f.id });
      affected.push(id);
    }
    return { affected };
  },
  deps: (f) => deps(Object.keys(f.items || {})), touches: (f) => [...Object.keys(f.items || {}), ...(f.removed || [])],
});

/** Register every MESH feature type; editors come from the commands module (editorFor(type)). */
export function registerMeshFeatures(editorFor) {
  for (const [type, d] of Object.entries(DEFS)) {
    if (M.isFeatureType(type) && M.featureDef(type) && !M.featureDef(type).builtin && M.featureDef(type).apply === d.apply) continue;
    try { M.registerFeature(type, { ...d, editor: editorFor(type) }); } catch (e) { console.error(e); }
  }
  return Object.keys(DEFS);
}
export const MESH_FEATURE_TYPES = () => Object.keys(DEFS);
