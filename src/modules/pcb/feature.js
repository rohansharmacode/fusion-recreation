// The `pcb` timeline feature: a 3D PCB is a component (operation "newComponent") with a board body.
//
// pcb { operation: "newComponent", newComp, newOcc, newBody?,
//       profiles: [{sketch, key, c}], faces?: [{body, p, n}],     board outline (closed sketch profiles and / or planar faces)
//       thickness: "1.60 mm", side: "top" | "bottom", flipZ?,       side: the layer the profile lies on; flipZ turns the PCB top over
//       origin?: point spec, xAxis?: axis spec, flipX?, flipY?,    2D PCB origin and orientation (default: sketch origin and X)
//       npth?: bool, maxNpth: "6.00 mm",                            Convert Circles to NPTHs / Max NPTH Diameter
//       pcbType?: "simple" | "complete" | "canvas", derived?, linked? }
// A pcb feature without profiles and faces is a PCB whose board outline is not defined yet (Create Linked PCB):
// it only creates the component.
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import { cycleSegments } from "../../sketch/regions.js";

const V = K.V;
export const TYPE = "pcb";
export const DEFAULT_THICKNESS = "1.60 mm";
export const DEFAULT_NPTH = "6.00 mm";
export const NO_OUTLINE = "Board outline not defined";
const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;

export const hasOutline = (f) => !!(f && (((f.profiles || []).length) || ((f.faces || []).length)));

/** {c, r} when the loop is one full circle, else null. */
export function loopCircle(cycle, vertices) {
  let segs;
  try { segs = cycleSegments(cycle, vertices); } catch { return null; }
  if (!segs.length || segs.some((s) => s.kind !== "arc")) return null;
  const s0 = segs[0];
  if (segs.length === 1) return s0.full ? { c: s0.c, r: s0.r } : null;
  for (const s of segs) if (Math.abs(s.r - s0.r) > 1e-6 || Math.hypot(s.c[0] - s0.c[0], s.c[1] - s0.c[1]) > 1e-6) return null;
  return { c: s0.c, r: s0.r };
}

function onArc(s, t) {
  if (s.full) return true;
  const a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
  const am = Math.atan2(s.mid[1] - s.c[1], s.mid[0] - s.c[0]);
  const a1 = Math.atan2(s.b[1] - s.c[1], s.b[0] - s.c[0]);
  const ccwSweep = norm(a1 - a0);
  if (ccwSweep < 1e-12) return true;
  const ccw = norm(am - a0) <= ccwSweep;
  return ccw ? norm(t - a0) <= ccwSweep + 1e-12 : norm(a0 - t) <= norm(a0 - a1) + 1e-12;
}

/** [min, max] of the loop along the 2D unit direction u (exact for lines and arcs, sampled for splines). */
function loopExtent(cycle, vertices, u, into) {
  const add = (p) => { const d = p[0] * u[0] + p[1] * u[1]; if (d < into[0]) into[0] = d; if (d > into[1]) into[1] = d; };
  for (const p of cycle.poly || []) add(p);
  let segs = [];
  try { segs = cycleSegments(cycle, vertices); } catch { segs = []; }
  const ang = Math.atan2(u[1], u[0]);
  for (const s of segs) {
    if (s.a) add(s.a);
    if (s.b) add(s.b);
    if (s.kind !== "arc") continue;
    for (const t of [ang, ang + Math.PI]) if (onArc(s, t)) add([s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]);
  }
  return into;
}

/**
 * Board outline of a pcb feature in the state: [{sketch, regions}] after the NPTH rule, plus the first
 * plane. With "Convert Circles to NPTHs" a selected profile that is one full circle no larger than the
 * limit stays a hole (it is dropped from the outline) as long as another profile is selected.
 */
export function outlineGroups(st, f, maxNpth) {
  const groups = M.profileGroups(st, f.profiles || []);
  if (f.npth && maxNpth > 0) {
    const total = groups.reduce((n, g) => n + g.regions.length, 0);
    let left = total;
    for (const g of groups) {
      const vs = g.sketch.regions.vertices;
      g.regions = g.regions.filter((r) => {
        if (left <= 1 || (r.holes && r.holes.length)) return true;
        const c = loopCircle(r.outer, vs);
        if (c && 2 * c.r <= maxNpth + 1e-9) { left -= 1; return false; }
        return true;
      });
    }
  }
  return groups.filter((g) => g.regions.length);
}

function boardFrame(st, f, pl, up, topOffset) {
  let o = pl.o;
  if (f.origin) { try { o = M.scaleCenter(st, f.origin); } catch { o = pl.o; } }
  // the origin lies on the PCB top face
  const top = V.add(pl.o, V.mul(up, topOffset));
  o = V.sub(o, V.mul(up, V.dot(V.sub(o, top), up)));
  let x = pl.x;
  if (f.xAxis) { try { x = M.axisFromRef(st, f.xAxis).d; } catch { x = pl.x; } }
  x = V.sub(x, V.mul(up, V.dot(x, up)));
  if (V.len(x) < 1e-9) x = pl.x;
  x = V.norm(x);
  if (f.flipX) x = V.mul(x, -1);
  let y = V.norm(V.cross(up, x));
  if (f.flipY) y = V.mul(y, -1);
  return { o, x, y, z: up };
}

function pcbApply(st, f, P, doc) {
  if (!hasOutline(f)) return { affected: [], board: null };
  const t = M.fval(P, f, "thickness");
  if (!(t > 1e-6)) throw new Error("The board thickness must be greater than zero");
  let maxNpth = 0;
  if (f.npth) { try { maxNpth = M.fval(P, f, "maxNpth"); } catch { maxNpth = 0; } }
  const sign = f.flipZ ? -1 : 1;
  const bottom = f.side === "bottom";
  const parts = [];
  let pl0 = null, holes = 0, cutouts = 0;
  const ext = { x: [Infinity, -Infinity], y: [Infinity, -Infinity] };
  let frame = null;
  const loops = []; // [{plane, vertices, cycle}] outer loops for the size
  try {
    for (const g of outlineGroups(st, f, maxNpth)) {
      const pl = g.sketch.plane, vs = g.sketch.regions.vertices;
      if (!pl0) pl0 = pl;
      // profile on the PCB top layer: the board runs from the sketch plane away from the top (and the other way round)
      const dist = (bottom ? t : -t) * sign;
      parts.push(K.extrudeRegions(g.regions, vs, pl, 0, dist));
      for (const r of K.unionRegions(g.regions)) {
        loops.push({ plane: pl, vertices: vs, cycle: r.outer });
        for (const h of r.holes || []) {
          const c = loopCircle(h, vs);
          if (c && maxNpth > 0 && 2 * c.r <= maxNpth + 1e-9) holes += 1;
          else if (c && !f.npth) holes += 1;
          else cutouts += 1;
        }
      }
    }
    for (const fr of f.faces || []) {
      const { face, info } = M.resolveFace(st, fr);
      try {
        if (!info || info.type !== "PLANE" || !info.n) throw new Error("Select a planar face for the PCB");
        const n = V.norm(info.n);
        if (!pl0) {
          const ax = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
          pl0 = { o: info.c || fr.p, x: V.norm(V.cross(ax, n)), n };
        }
        parts.push(K.prism(face, V.mul(n, (bottom ? t : -t) * sign)));
      } finally { K.del(face); }
    }
  } catch (e) { K.del(parts); throw e; }
  if (!parts.length) throw new Error("Select a profile for the PCB");
  const tool = M.fuseTemp(parts);
  st._tool = tool;
  const up = V.mul(V.norm(pl0.n), sign);
  frame = boardFrame(st, f, pl0, up, bottom ? t : 0);
  for (const l of loops) {
    const py = V.cross(l.plane.n, l.plane.x);
    const off = V.sub(l.plane.o, frame.o);
    for (const k of ["x", "y"]) {
      const u3 = frame[k];
      const u = [V.dot(u3, l.plane.x), V.dot(u3, py)];
      const ul = Math.hypot(u[0], u[1]) || 1;
      const e = loopExtent(l.cycle, l.vertices, [u[0] / ul, u[1] / ul], [Infinity, -Infinity]);
      const o = V.dot(off, u3);
      ext[k][0] = Math.min(ext[k][0], e[0] * ul + o);
      ext[k][1] = Math.max(ext[k][1], e[1] * ul + o);
    }
  }
  let size = null;
  if (loops.length) size = [ext.x[1] - ext.x[0], ext.y[1] - ext.y[0]];
  else {
    try { const b = K.bboxOf(tool); size = [b.max[0] - b.min[0], b.max[1] - b.min[1]]; } catch { size = null; }
  }
  const parent = f.occ && st.occ && st.occ.has(f.occ) ? f.occ : M.ROOT;
  const affected = M.applyOp(st, f, tool, doc);
  return { affected, board: { thickness: t, maxNpth, holes, cutouts, size, frame, T0: M.occTransform(st, parent) } };
}

export const PCB_FEATURE = {
  label: "PCB", stem: "PCB", icon: "PCBCreateCmd",
  fields: { thickness: "length", maxNpth: "length" },
  makesBodies: (f) => (hasOutline(f) ? true : false),
  apply: pcbApply,
  deps: (f) => ({
    sketches: [...new Set([
      ...(f.profiles || []).map((p) => p.sketch),
      ...(f.origin && f.origin.kind === "sketchPoint" ? [f.origin.sketch] : []),
      ...(f.xAxis && f.xAxis.kind === "sketchLine" ? [f.xAxis.sketch] : []),
    ])],
    cplanes: [],
    bodies: [...new Set((f.faces || []).map((x) => x.body))],
    features: [],
    geo: [
      ...(f.faces || []).map((x) => ({ kind: "face", body: x.body, p: x.p, n: x.n })),
      ...(f.origin && f.origin.kind === "vertex" ? [{ kind: "vertex", body: f.origin.body, p: f.origin.p }] : []),
      ...(f.xAxis && f.xAxis.kind === "edge" ? [{ kind: "edge", body: f.xAxis.body, p: f.xAxis.p }] : []),
    ],
  }),
};

/** World frame {o, x, y, z} of a pcb feature's board right now (follows a moved PCB occurrence), or null. */
export function currentFrame(app, f) {
  const res = app.result && app.result.results ? app.result.results[f.id] : null;
  const b = res && res.board;
  if (!b || !b.frame) return null;
  let T = M.meshOps.IDENTITY;
  try {
    const now = app.components && f.newOcc && app.components.alive(f.newOcc) ? app.components.transform(f.newOcc) : null;
    if (now && b.T0) T = M.meshOps.mul(now, M.invRigid(b.T0));
  } catch { T = M.meshOps.IDENTITY; }
  const pt = (p) => M.meshOps.apply(T, p);
  const o0 = pt([0, 0, 0]);
  const dir = (d) => V.norm(V.sub(pt(d), o0));
  return { o: pt(b.frame.o), x: dir(b.frame.x), y: dir(b.frame.y), z: dir(b.frame.z), thickness: b.thickness };
}

/** The pcb feature that owns the occurrence (or whose PCB contains it), or null. */
export function pcbFeatureOfOcc(app, oid) {
  if (!oid) return null;
  const C = app.components;
  const chain = C && C.ancestors ? C.ancestors(oid) : [oid];
  for (const o of chain) {
    const f = app.doc.features.find((x) => x.type === TYPE && x.newOcc === o);
    if (f) return f;
  }
  return null;
}
