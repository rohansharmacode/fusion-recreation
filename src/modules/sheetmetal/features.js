// sheetmetal: timeline feature types (M.registerFeature) and their evaluators.
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import * as G from "./geom.js";
import { V, V2, apply, applyDir, inv, mul, fromFrame, rad, clone, pointInPoly } from "./math.js";
import { evalRule, ruleFor, findRule } from "./rules.js";

const del = (...a) => K.del(...a);
const PI = Math.PI;

// ---------------------------------------------------------------- state access
export function smMap(st) { if (!(st.smData instanceof Map)) st.smData = new Map(); return st.smData; }
export function smOf(st, id) { return st.smData instanceof Map ? st.smData.get(id) || null : null; }
function sheetBody(st, id) {
  const b = st.bodies.get(id);
  const d = smOf(st, id);
  if (!b || !d) throw new Error("Select edges of a sheet metal body");
  return { b, d };
}
function putBody(st, id, shape, d, f, prev) {
  st.bodies.set(id, { ...(prev || {}), id, shape, from: f.id, sheetMetal: { rule: d.ruleName || "", thickness: +d.T.toFixed(6), kFactor: d.K } });
  smMap(st).set(id, d);
}
/** Rule numbers for a body (its own rule id, else the document rule). */
function ruleNums(doc, P, ruleId) { return evalRule((ruleId && findRule(doc, ruleId)) || ruleFor(doc), P); }
const num = (P, f, key, fallback) => {
  if (f[key] === undefined || f[key] === null || f[key] === "") return fallback;
  return M.fval(P, f, key);
};
/** Sync rule-driven numbers into a body's data (thickness changes are applied by the base flange). */
function applyRule(d, rule) {
  d.K = rule.K; d.R = rule.R; d.miterGap = rule.miterGap; d.relief = rule.relief; d.corner2 = rule.corner2; d.corner3 = rule.corner3; d.ruleName = rule.name; d.rule = rule.id;
}
function edgeInfo(st, ref) {
  const b = st.bodies.get(ref.body);
  if (!b) throw new Error("Referenced body is missing");
  const idx = M.locateEdge(b.shape, ref);
  if (idx < 0) throw new Error("Selected edges are missing");
  const e = K.topoOf(b.shape).edges[idx];
  if (!e || e.type !== "LINE") throw new Error("Select straight edges of the sheet metal faces");
  return e;
}

// ---------------------------------------------------------------- base flange
function applyBaseFlange(st, f, P, doc) {
  const rule = ruleNums(doc, P, f.rule);
  const T = rule.T;
  const groups = M.profileGroups(st, f.profiles || []);
  if (!groups.length) throw new Error("Select closed sketch profiles");
  const ids = f.newBodies && f.newBodies.length ? f.newBodies : [f.newBody || `${f.id}_b`];
  let k = 0;
  const made = [];
  for (const g of groups) {
    const pl = g.sketch.plane;
    const y = K.planeY(pl);
    const w0 = f.orientation === "side2" ? -T : f.orientation === "center" ? -T / 2 : 0;
    const frame = fromFrame(pl.o, pl.x, y, pl.n);
    for (const r of K.unionRegions(g.regions)) {
      const id = ids[Math.min(k++, ids.length - 1)];
      if (made.includes(id)) throw new Error("Too many separate profiles for one Flange");
      const face = K.regionFace(r, g.sketch.regions.vertices, K.offsetPlane(pl, w0));
      let solid;
      try { solid = K.prism(face, V.mul(pl.n, T)); } finally { del(face); }
      const d = G.newData({ T, K: rule.K, R: rule.R, rule: rule.id, w0, frame });
      applyRule(d, rule);
      d.flanges.F1.feature = f.id;
      const mi = inv(frame);
      const bottom = G.planeFaces(solid, apply(frame, [0, 0, w0]), V.mul(pl.n, -1));
      d.flanges.F1.seeds = G.seedsOnFaces(solid, bottom, mi);
      if (!d.flanges.F1.seeds.length) { del(solid); throw new Error("The profile is too small for a flange"); }
      putBody(st, id, solid, d, f);
      made.push(id);
    }
  }
  return { affected: made };
}

// ---------------------------------------------------------------- edge flanges (chains of bends)
/** Flange extent along the edge [s0, s1] from the width option. */
function widthRange(f, P, len, prefix = "") {
  const w = f[prefix + "width"] || f.width || "full";
  if (w === "symmetric") { const W = Math.max(1e-6, num(P, f, "w1", len)); return [len / 2 - W / 2, len / 2 + W / 2]; }
  if (w === "twoSides") return [len / 2 - Math.max(0, num(P, f, "w1", len / 2)), len / 2 + Math.max(0, num(P, f, "w2", len / 2))];
  if (w === "twoOffsets") return [Math.max(0, num(P, f, "o1", 0)), len - Math.max(0, num(P, f, "o2", 0))];
  return [0, len];
}
/**
 * Bends + straight flanges along one flange edge e (from G.edgeOnFlange):
 * segs [{A, R, rel (+1 same sense, -1 opposite), L}], us = bend start offset along q (negative trims the parent).
 */
function chainOnEdge(d, e, segs, { s0, s1, us, sgn, feature }) {
  const tools = [];
  let parent = e.fid;
  let u = us;
  const made = { bends: [], flanges: [] };
  for (const sg of segs) {
    const bid = G.nextId(d, "B"), cid = G.nextId(d, "F");
    const o = V2.add(e.a, V2.mul(e.q, u));
    const b = { id: bid, parent, child: cid, o, d: e.d, q: e.q, s0, s1, A: sg.A, sgn: sgn * (sg.rel || 1), R: Math.max(0, sg.R), K: d.K, flat: false, feature };
    const BA = G.bendBA(b, d.T);
    d.bends[bid] = b;
    d.flanges[cid] = { id: cid, bend: bid, seeds: [], feature };
    const mp = G.flangeM(d, parent);
    if (sg.A > 1e-9) tools.push(G.bendSolid(d, b, mp));
    if (sg.L > 1e-6) {
      const mc = G.flangeM(d, cid);
      tools.push(G.flatPrism(mc, G.rect(o, e.d, e.q, s0, s1, BA, BA + sg.L), d.w0, d.w0 + d.T));
      d.flanges[cid].seeds = [0.25, 0.5, 0.75].map((t) => V2.add(o, V2.add(V2.mul(e.d, s0 + (s1 - s0) * t), V2.mul(e.q, BA + sg.L * 0.5))));
    }
    made.bends.push(bid); made.flanges.push(cid);
    parent = cid;
    u += BA + sg.L;
  }
  return { tools, ...made };
}
/** Relief notches (flat polygons in the parent's flat space) at the ends of a partial-width bend. */
function reliefPolys(d, e, s0, s1, us, relief, len) {
  if (!relief || relief.shape === "Tear") return [];
  const W = Math.max(1e-3, relief.width), D = Math.max(0, relief.depth);
  const out = [];
  const u0 = us - D, u1 = 1e-3;
  const ends = [];
  if (s0 > 1e-6) ends.push([s0 - W, s0]);
  if (s1 < len - 1e-6) ends.push([s1, s1 + W]);
  for (const [a, b] of ends) {
    if (relief.shape === "Round") {
      const r = (b - a) / 2, cs = (a + b) / 2;
      const pts = [];
      pts.push([b, u1], [a, u1]);
      for (let i = 0; i <= 12; i++) { const t = PI + (PI * i) / 12; pts.push([cs + r * Math.cos(t), u0 + r + r * Math.sin(t)]); }
      out.push(pts.map(([s, uu]) => V2.add(e.a, V2.add(V2.mul(e.d, s), V2.mul(e.q, uu)))));
    } else {
      out.push(G.rect(e.a, e.d, e.q, a, b, u0, u1));
    }
  }
  return out;
}
// setback from the virtual sharp to the bend tangent (angles past 90 degrees are measured like 90)
const tanHalf = (A) => Math.tan(Math.min(A, PI / 2) / 2);
function bendStart(position, A, R, T) {
  if (position === "inside") return -(R + T) * tanHalf(A);
  if (position === "outside") return -R * tanHalf(A);
  if (position === "tangent") return -(R + T) * (A <= PI / 2 ? Math.sin(A) : 1);
  return 0;
}
function straightLength(datum, H, A, R, T) {
  if (datum === "inner") return H - R * tanHalf(A);
  if (datum === "outer") return H - (R + T) * tanHalf(A);
  return H;
}
/** Cut / fuse the tools of a sheet metal operation into a body (consumes tools). */
function combine(shape, cuts, adds) {
  let s = shape;
  if (cuts.length) {
    // tools may touch or overlap each other: a boolean argument must not, so fuse them first
    const tool = G.fuseList(cuts);
    try { s = K.cut(s, tool); } finally { del(tool); }
  }
  if (adds.length) {
    const all = G.fuseList(adds);
    const n = K.fuse(s, all);
    if (s !== shape) del(s);
    del(all);
    s = n;
  }
  return s === shape ? K.translated(shape, [0, 0, 0]) : s;
}

/** Edge flange / hem evaluator: one body at a time. kind = 'flange' | 'hem'. */
function applyEdgeChain(st, f, P, doc, kind) {
  const refs = f.edges || [];
  if (!refs.length) throw new Error("Select sheet metal edges");
  const byBody = M.groupByBody(refs);
  const affected = [];
  for (const [bodyId, list] of byBody) {
    const { b, d: d0 } = sheetBody(st, bodyId);
    const d = G.cloneData(d0);
    applyRule(d, ruleNums(doc, P, d0.rule));
    const T = d.T;
    const infos = [];
    for (const ref of list) {
      const e = edgeInfo(st, ref);
      const info = G.edgeOnFlange(b.shape, d, e.s, e.t);
      if (!info) throw new Error("Select edges on the top or bottom faces of the sheet metal");
      infos.push(info);
    }
    const flip = !!f.flip;
    const R = f.bendRadius ? Math.max(0, M.fval(P, f, "bendRadius")) : d.R;
    let segs, us;
    if (kind === "hem") {
      ({ segs, us } = hemSegments(f, P, R, T));
    } else {
      const A = rad(Math.max(0, Math.min(180, num(P, f, "angle", 90))));
      if (!(A > 1e-6)) throw new Error("The flange angle must be greater than 0");
      let L;
      if (f.extent === "object") L = null;
      else {
        L = straightLength(f.datum || "outer", num(P, f, "height", 10), A, R, T);
        if (L < -1e-9) throw new Error("The flange height is too small for the bend radius");
      }
      segs = [{ A, R, rel: 1, L: L === null ? 0 : Math.max(0, L) }];
      us = bendStart(f.position || "adjacent", A, R, T);
    }
    // per-edge ranges and corner treatment
    const items = infos.map((e) => {
      const [s0, s1] = widthRange(f, P, e.len);
      if (!(s1 - s0 > 1e-6)) throw new Error("The flange width must be greater than 0");
      const sgn = (e.side === "top" ? 1 : -1) * (flip ? -1 : 1);
      return { e, s0, s1, sgn, ext0: 0, ext1: 0, keep: [] };
    });
    const reach = (it) => us + (segs[0].R + T) * (segs[0].A <= PI / 2 ? Math.sin(segs[0].A) : 1);
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], c = items[j];
      if (a.e.fid !== c.e.fid || a.sgn !== c.sgn) continue;
      const endsA = [[a.e.a, 0], [a.e.b, 1]], endsC = [[c.e.a, 0], [c.e.b, 1]];
      for (const [pa, ea] of endsA) for (const [pc, ec] of endsC) {
        if (V2.len(V2.sub(pa, pc)) > 1e-4) continue;
        const full = (it, end) => (end === 0 ? it.s0 < 1e-6 : it.s1 > it.e.len - 1e-6);
        if (!full(a, ea) || !full(c, ec)) continue;
        if (f.miter) {
          const ra = reach(c), rc = reach(a);
          if (ea === 0) a.ext0 = Math.max(a.ext0, ra); else a.ext1 = Math.max(a.ext1, ra);
          if (ec === 0) c.ext0 = Math.max(c.ext0, rc); else c.ext1 = Math.max(c.ext1, rc);
          const g = d.miterGap === undefined ? T : d.miterGap;
          const m = V2.norm(V2.sub(c.e.q, a.e.q));
          a.keep.push({ n: m, c: V2.dot(m, pa) - g / 2 });
          c.keep.push({ n: V2.mul(m, -1), c: -V2.dot(m, pa) - g / 2 });
        } else if (us < 0) {
          const cut = -us;
          if (ea === 0) a.s0 = Math.max(a.s0, cut); else a.s1 = Math.min(a.s1, a.e.len - cut);
          if (ec === 0) c.s0 = Math.max(c.s0, 0); else c.s1 = Math.min(c.s1, c.e.len);
        }
      }
    }
    const cuts = [], adds = [];
    const mParents = new Map();
    try { for (const it of items) {
      const e = it.e;
      const mp = mParents.get(e.fid) || G.flangeM(d, e.fid);
      mParents.set(e.fid, mp);
      const s0 = it.s0 - it.ext0, s1 = it.s1 + it.ext1;
      let segsI = segs;
      if (f.extent === "object" && kind !== "hem") segsI = [{ ...segs[0], L: toObjectLength(st, f, P, d, e, s0, s1, us, it.sgn, segs[0]) }];
      if (us < -1e-9) cuts.push(G.flatPrism(mp, G.rect(e.a, e.d, e.q, Math.max(0, s0), Math.min(e.len, s1), us, 1e-3), d.w0 - 1e-3, d.w0 + T + 1e-3));
      const partial = it.s0 > 1e-6 || it.s1 < e.len - 1e-6;
      if (partial) {
        const relief = f.reliefOverride ? { shape: f.reliefShape || d.relief.shape, width: num(P, f, "reliefWidth", d.relief.width), depth: num(P, f, "reliefDepth", d.relief.depth) } : d.relief;
        for (const poly of reliefPolys(d, e, it.s0, it.s1, us, relief, e.len)) cuts.push(G.flatPrism(mp, poly, d.w0 - 1e-3, d.w0 + T + 1e-3));
      }
      const r = chainOnEdge(d, e, segsI, { s0, s1, us, sgn: it.sgn, feature: f.id });
      let tools = r.tools;
      if (it.keep.length) {
        const box = G.flatPrism(mp, G.clipPoly(it.keep), d.w0 - 2000, d.w0 + 2000);
        try {
          tools = tools.map((t) => { const x = K.intersect(t, box); del(t); return x; });
        } finally { del(box); }
      }
      for (const [i, fid] of r.flanges.entries()) d.flanges[fid].len = segsI[i].L;
      adds.push(...tools);
    } } catch (e) { del(cuts, adds); throw e; } // a later edge failed: free the tools made so far
    const shape = combine(b.shape, cuts, adds);
    G.refreshSeeds(shape, d);
    putBody(st, bodyId, shape, d, f, b);
    affected.push(bodyId);
  }
  return { affected };
}
function toObjectLength(st, f, P, d, e, s0, s1, us, sgn, seg) {
  const ref = (f.toObject || [])[0];
  if (!ref) throw new Error("Select the object to extend the flange to");
  let pl = null;
  try { pl = M.resolvePlane(ref.kind ? ref : { kind: "face", ...ref }, st); } catch { pl = null; }
  if (!pl && ref.body) {
    try { const { info } = M.resolveFace(st, ref); if (info.type === "PLANE") pl = { o: info.c, n: info.n }; } catch { pl = null; }
  }
  if (!pl) throw new Error("The flange can only extend to a planar face or plane");
  const dd = G.cloneData(d);
  const tmp = chainOnEdge(dd, e, [{ ...seg, L: 0 }], { s0, s1, us, sgn, feature: f.id });
  del(tmp.tools);
  const cid = tmp.flanges[0];
  const b = dd.bends[tmp.bends[0]];
  const mc = G.flangeM(dd, cid);
  const BA = G.bendBA(b, d.T);
  const mid = V2.add(b.o, V2.mul(b.d, (s0 + s1) / 2));
  const p0 = apply(mc, [mid[0] + b.q[0] * BA, mid[1] + b.q[1] * BA, d.w0 + d.T / 2]);
  const v = applyDir(mc, [b.q[0], b.q[1], 0]);
  const n = V.norm(pl.n);
  const off = f.toOffset ? M.fval(P, f, "toOffset") : 0;
  const den = V.dot(n, v);
  if (Math.abs(den) < 1e-9) throw new Error("The object must not be parallel to the flange");
  const L = (V.dot(n, V.sub(pl.o, p0)) - off * Math.sign(den)) / den;
  if (!(L > 1e-6)) throw new Error("The object is behind the flange");
  return L;
}

// ---------------------------------------------------------------- hems
export const HEM_TYPES = ["flat", "open", "rolled", "teardrop", "rope", "double"];
function hemSegments(f, P, R0, T) {
  const type = f.hemType || "flat";
  const L = Math.max(0, num(P, f, "length", 10));
  const gap = Math.max(0, num(P, f, "gap", T * 0.5));
  const r = Math.max(1e-3, num(P, f, "radius", T));
  let segs;
  if (type === "flat") segs = [{ A: PI, R: 1e-3, rel: 1, L }];
  else if (type === "open") segs = [{ A: PI, R: Math.max(1e-3, gap / 2), rel: 1, L }];
  else if (type === "rolled") segs = [{ A: rad(Math.max(1, Math.min(359, num(P, f, "angle", 270)))), R: r, rel: 1, L: 0 }];
  else if (type === "teardrop") {
    // bend past 180 degrees so the straight end comes back to `gap` from the base flange
    const solve = (beta) => r * (1 + Math.cos(beta)) - L * Math.sin(beta) - gap;
    let lo = 0, hi = PI / 2;
    if (solve(lo) * solve(hi) > 0) hi = lo;
    for (let i = 0; i < 60 && hi > lo; i++) { const m = (lo + hi) / 2; if (solve(lo) * solve(m) <= 0) hi = m; else lo = m; }
    segs = [{ A: PI + (lo + hi) / 2, R: r, rel: 1, L }];
  } else if (type === "rope") {
    // round loop, then back down to `gap` and parallel to the base
    const drop = Math.max(0, 2 * r - gap);
    const beta = Math.min(PI / 3, Math.atan2(drop, Math.max(1e-3, L / 2)));
    segs = [{ A: PI + beta, R: r, rel: 1, L: Math.max(0, drop / Math.max(1e-6, Math.sin(beta)) - (2 * r + T) * Math.tan(beta / 2)) }, { A: beta, R: r, rel: -1, L: Math.max(0, L / 2) }];
    if (beta < 1e-6) segs = [{ A: PI, R: r, rel: 1, L }];
  } else {
    // double: two folds over each other
    const setback = Math.max(0, num(P, f, "setback", T));
    const r1 = Math.max(1e-3, gap / 2);
    segs = [{ A: PI, R: r1, rel: 1, L: setback }, { A: PI, R: r1 + T + gap, rel: 1, L }];
  }
  const first = segs[0];
  const us = (f.position || "adjacent") === "inside" ? -(first.R + T) : 0;
  return { segs, us };
}

// ---------------------------------------------------------------- unfold / refold / flat helpers
/** Flange of data d whose sheet (top or bottom face, or its side) holds world point p. */
export function flangeAt(shape, d, p) {
  let best = null, bd = Infinity;
  for (const fid of Object.keys(d.flanges)) {
    const f = d.flanges[fid];
    if (!f.seeds || !f.seeds.length) continue;
    const m = G.flangeM(d, fid);
    const q = apply(inv(m), p);
    if (q[2] < d.w0 - 1e-3 || q[2] > d.w0 + d.T + 1e-3) continue;
    const faces = G.flangeBottomFaces(shape, d, fid, m);
    for (const fi of faces) {
      const c = K.closestOnFace(shape, fi, apply(m, [q[0], q[1], d.w0]));
      if (c && c.dist < bd) { bd = c.dist; best = fid; }
    }
  }
  return bd < 1e-3 ? best : null;
}
/** Bend of d whose zone holds world point p. */
export function bendAt(d, p) {
  let best = null, bd = Infinity;
  for (const b of Object.values(d.bends)) {
    const mp = G.parentM(d, b);
    const q = apply(inv(mp), p);
    if (b.flat) {
      const s = V2.dot(V2.sub([q[0], q[1]], b.o), b.q), t = V2.dot(V2.sub([q[0], q[1]], b.o), b.d);
      const BA = G.bendBA(b, d.T);
      const out = Math.max(0, -s, s - BA, b.s0 - t, t - b.s1);
      if (out < bd && q[2] > d.w0 - 1e-3 && q[2] < d.w0 + d.T + 1e-3) { bd = out; best = b.id; }
    } else {
      const ax = G.bendAxis(d, b);
      const rel = V.sub(q, ax.o);
      const t = V2.dot([rel[0], rel[1]], b.d);
      const radial = V.sub(rel, V.mul(ax.dir, V.dot(rel, ax.dir)));
      const r = V.len(radial);
      const r0 = b.sgn > 0 ? [0, 0, -1] : [0, 0, 1];
      let th = Math.atan2(V.dot(V.cross(r0, radial), ax.dir), V.dot(radial, r0));
      if (th < -1e-6) th += 2 * PI;
      const out = Math.max(0, b.R - r, r - b.R - d.T, -th * r, (th - b.A) * r, b.s0 - t, t - b.s1);
      if (out < bd) { bd = out; best = b.id; }
    }
  }
  return bd < 1e-2 ? best : null;
}
function refoldFeature(st, f, P, doc, unfold) {
  const sref = (f.stationary || [])[0];
  if (!sref) throw new Error("Select the stationary face");
  const { b, d } = sheetBody(st, sref.body);
  if (d.kind !== "sheet") throw new Error("Lofted flanges can't be unfolded");
  const sid = flangeAt(b.shape, d, sref.p);
  if (!sid) throw new Error("The stationary face must be a flange face of the sheet metal body");
  const nd = G.cloneData(d);
  let ids;
  if (f.all) ids = Object.keys(nd.bends);
  else {
    ids = [];
    for (const r of f.bends || []) { if (r.body !== sref.body) continue; const id = bendAt(d, r.p); if (id && !ids.includes(id)) ids.push(id); }
  }
  ids = ids.filter((id) => nd.bends[id].flat !== unfold);
  if (!ids.length) throw new Error(unfold ? "There are no folded bends to unfold" : "There are no unfolded bends to refold");
  for (const id of ids) nd.bends[id].flat = unfold;
  if (!G.seamsOpen(nd, ids)) throw new Error("Bends of a closed loop can't be unfolded. Use Rip to open the loop first");
  G.keepStationary(d, nd, sid);
  const shape = G.rebuild(b.shape, d, nd);
  G.refreshSeeds(shape, nd);
  putBody(st, sref.body, shape, nd, f, b);
  return { affected: [sref.body] };
}

// ---------------------------------------------------------------- fold / jog (new bends on a sketch line)
function sketchLineWorld(st, ref) {
  const s = st.sketches.get(ref.sketch);
  if (!s) throw new Error("The bend line sketch is missing");
  const c = s.sk.curves[ref.curve];
  if (!c || c.type !== "line") throw new Error("Select a sketch line");
  const a = s.sk.points[c.p1], b = s.sk.points[c.p2];
  return [K.toWorld(s.plane, a.x, a.y), K.toWorld(s.plane, b.x, b.y)];
}
/** Split flange fid of data d at a flat line (point o, unit d, normal q) into new flat bends. */
function insertFlatBends(shape, d, fid, line, specs, feature) {
  const m = G.flangeM(d, fid);
  const mi = inv(m);
  const faces = G.flangeBottomFaces(shape, d, fid, m);
  if (!faces.length) throw new Error("The bend line must lie over a flange face");
  // extent of the flange along the line: intersect its outline with the line
  let lo = Infinity, hi = -Infinity;
  for (const fi of faces) {
    for (const l of G.faceLoops(shape, fi, (P) => { const q = apply(mi, P); return [q[0], q[1]]; })) {
      const pts = l.pts;
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[i], p1 = pts[(i + 1) % pts.length];
        const a0 = V2.dot(V2.sub(p0, line.o), line.q), a1 = V2.dot(V2.sub(p1, line.o), line.q);
        if ((a0 > 0) === (a1 > 0) && Math.abs(a0) > 1e-9 && Math.abs(a1) > 1e-9) continue;
        const t = Math.abs(a1 - a0) < 1e-12 ? 0 : a0 / (a0 - a1);
        const x = V2.add(p0, V2.mul(V2.sub(p1, p0), Math.max(0, Math.min(1, t))));
        const s = V2.dot(V2.sub(x, line.o), line.d);
        lo = Math.min(lo, s); hi = Math.max(hi, s);
      }
    }
  }
  if (!(hi - lo > 1e-6)) throw new Error("The bend line must cross the flange");
  // split: the side holding the flange's parent bend (or the stationary side) keeps the id
  const f0 = d.flanges[fid];
  const seeds = f0.seeds || [];
  let off = 0;
  const ids = [];
  let parent = fid;
  const keepSide = (p) => V2.dot(V2.sub(p, line.o), line.q) < 0;
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    const bid = G.nextId(d, "B"), cid = G.nextId(d, "F");
    const o = V2.add(line.o, V2.add(V2.mul(line.q, off), V2.mul(line.d, 0)));
    const b = { id: bid, parent, child: cid, o: V2.add(o, V2.mul(line.d, lo)), d: line.d, q: line.q, s0: 0, s1: hi - lo, A: sp.A, sgn: sp.sgn, R: sp.R, K: d.K, flat: true, fromStrip: fid, feature };
    const BA = G.bendBA(b, d.T);
    d.bends[bid] = b;
    d.flanges[cid] = { id: cid, bend: bid, seeds: [], feature, src: fid, clip: [{ n: V2.mul(line.q, -1), c: -(V2.dot(line.q, line.o) + off + BA) }] };
    if (i < specs.length - 1) d.flanges[cid].clip.push({ n: line.q, c: V2.dot(line.q, line.o) + off + BA + sp.L });
    ids.push(bid);
    off += BA + (sp.L || 0);
    parent = cid;
  }
  // the last child takes the far side and the far seeds / child bends; the first part keeps the rest
  const last = d.flanges[parent];
  const farFrom = V2.dot(line.q, line.o) + off;
  last.seeds = seeds.filter((p) => V2.dot(line.q, p) > farFrom + 1e-6);
  for (let i = 0; i < ids.length; i++) {
    const b = d.bends[ids[i]];
    const fl = d.flanges[b.child];
    if (fl !== last) {
      const BA = G.bendBA(b, d.T);
      const u0 = V2.dot(line.q, b.o) + BA, u1 = i + 1 < ids.length ? V2.dot(line.q, d.bends[ids[i + 1]].o) : u0;
      fl.seeds = [0.25, 0.5, 0.75].map((t) => V2.add(V2.add(b.o, V2.mul(b.d, (b.s1 - b.s0) * t)), V2.mul(b.q, BA + (u1 - u0) / 2)));
    }
  }
  if (!last.seeds.length) {
    const b = d.bends[ids[ids.length - 1]];
    const BA = G.bendBA(b, d.T);
    last.seeds = [0.25, 0.5, 0.75].map((t) => V2.add(V2.add(b.o, V2.mul(b.d, (b.s1 - b.s0) * t)), V2.mul(b.q, BA + Math.min(0.5, d.T * 0.2))));
  }
  f0.seeds = seeds.filter((p) => keepSide(p));
  if (!f0.seeds.length) f0.seeds = [0.25, 0.5, 0.75].map((t) => V2.add(V2.add(line.o, V2.mul(line.d, lo + (hi - lo) * t)), V2.mul(line.q, -Math.min(0.5, d.T * 0.2))));
  f0.src = fid;
  f0.clip = [{ n: line.q, c: V2.dot(line.q, line.o) }];
  // existing child bends of the split flange go with the side they are on (a bend line may not cross them)
  const lo0 = V2.dot(line.q, line.o) - 1e-6, hi0 = V2.dot(line.q, line.o) + off + 1e-6;
  for (const b of Object.values(d.bends)) {
    if (b.parent !== fid || ids.includes(b.id)) continue;
    const ends = [b.s0, b.s1].map((s) => V2.dot(line.q, V2.add(b.o, V2.mul(b.d, s))));
    const before = ends.every((u) => u <= lo0), after = ends.every((u) => u >= hi0);
    if (!before && !after) throw new Error("The bend line crosses an existing bend or flange of this face");
    if (after) b.parent = parent;
  }
  return ids;
}
function foldFeature(st, f, P, doc, jog) {
  const lref = (f.line || [])[0];
  if (!lref) throw new Error("Select the bend line (a sketch line over a sheet metal face)");
  const sref = (f.stationary || [])[0];
  const [pa, pb] = sketchLineWorld(st, lref);
  // the sheet metal body under the line
  let hit = null;
  for (const [id, d] of smMap(st)) {
    const b = st.bodies.get(id);
    if (!b || d.kind !== "sheet") continue;
    for (const fid of Object.keys(d.flanges)) {
      const m = G.flangeM(d, fid);
      const qa = apply(inv(m), pa), qb = apply(inv(m), pb);
      const onPlane = (q) => Math.abs(q[2] - d.w0) < 1e-3 || Math.abs(q[2] - d.w0 - d.T) < 1e-3;
      if (!onPlane(qa) || !onPlane(qb)) continue;
      if (!G.flangeBottomFaces(b.shape, d, fid, m).length) continue;
      hit = { id, b, d, fid, qa, qb, top: Math.abs(qa[2] - d.w0 - d.T) < 1e-3 };
      break;
    }
    if (hit) break;
  }
  if (!hit) throw new Error("The bend line must lie on a flat face of a sheet metal body");
  const { id, b, d } = hit;
  const nd = G.cloneData(d);
  applyRule(nd, ruleNums(doc, P, d.rule));
  const R = f.bendRadius ? Math.max(0, M.fval(P, f, "bendRadius")) : nd.R;
  const A = rad(Math.max(1e-3, Math.min(180, num(P, f, "angle", 90))));
  const dl = V2.norm(V2.sub([hit.qb[0], hit.qb[1]], [hit.qa[0], hit.qa[1]]));
  let q = [dl[1], -dl[0]];
  // q points away from the side that stays attached: the split flange's own parent bend, else the
  // stationary face (the stationary flange itself is kept in place by keepStationary afterwards)
  const sid = sref ? flangeAt(b.shape, d, sref.p) : null;
  const parentBend = d.flanges[hit.fid].bend && d.bends[d.flanges[hit.fid].bend];
  const side = (p2) => V2.dot(V2.sub(p2, [hit.qa[0], hit.qa[1]]), q);
  if (parentBend) {
    const pbn = parentBend;
    const BAp = G.bendBA(pbn, d.T);
    const end = V2.add(pbn.o, V2.add(V2.mul(pbn.q, BAp), V2.mul(pbn.d, (pbn.s0 + pbn.s1) / 2)));
    if (side(end) > 0) q = V2.mul(q, -1);
  } else if (sref) {
    const sp = apply(inv(G.flangeM(d, hit.fid)), sref.p);
    if (side([sp[0], sp[1]]) > 0) q = V2.mul(q, -1);
  }
  const sgnBase = (hit.top ? 1 : -1) * (f.flip ? -1 : 1);
  const BA = A * (R + nd.K * nd.T);
  const pos = f.linePosition || "center";
  const shift = pos === "start" ? 0 : pos === "end" ? -BA : -BA / 2;
  let specs;
  if (jog) {
    const H = Math.max(0, num(P, f, "offset", 10));
    const Lm = (H - (2 * R + nd.T) * (1 - Math.cos(A))) / Math.max(1e-9, Math.sin(A));
    if (Lm < -1e-9) throw new Error("The jog offset is too small for the bend radius and angle");
    specs = [{ A, R, sgn: sgnBase, L: Math.max(0, Lm) }, { A, R, sgn: -sgnBase, L: 0 }];
  } else specs = [{ A, R, sgn: sgnBase, L: 0 }];
  const total = specs.reduce((s, sp) => s + sp.A * (sp.R + nd.K * nd.T) + (sp.L || 0), 0) - (specs[specs.length - 1].L || 0);
  const line = { o: V2.add([hit.qa[0], hit.qa[1]], V2.mul(q, jog ? (pos === "start" ? 0 : pos === "end" ? -total : -total / 2) : shift)), d: dl, q };
  const ids = insertFlatBends(b.shape, nd, hit.fid, line, specs, f.id);
  const before = G.cloneData(nd);
  for (const bid of ids) nd.bends[bid].flat = false;
  G.keepStationary(before, nd, sid || hit.fid);
  const shape = G.rebuild(b.shape, d, nd);
  for (const bid of ids) delete nd.bends[bid].fromStrip;
  for (const fl of Object.values(nd.flanges)) { delete fl.src; delete fl.clip; }
  G.refreshSeeds(shape, nd);
  putBody(st, id, shape, nd, f, b);
  return { affected: [id] };
}

// ---------------------------------------------------------------- fillet / chamfer of thickness edges
function cornerFeature(st, f, P, doc, chamfer) {
  const refs = f.edges || [];
  if (!refs.length) throw new Error("Select sheet metal thickness edges");
  const affected = [];
  for (const [bodyId, list] of M.groupByBody(refs)) {
    const { b, d } = sheetBody(st, bodyId);
    const T = K.topoOf(b.shape);
    for (const r of list) {
      const i = M.locateEdge(b.shape, r);
      const e = T.edges[i];
      if (!e || e.type !== "LINE" || Math.abs(e.len - d.T) > 1e-3) throw new Error("Select thickness edges (corners of the flanges)");
    }
    const v = M.fval(P, f, chamfer ? "distance" : "radius");
    if (!(v > 1e-9)) throw new Error(chamfer ? "Distance is zero" : "Radius is zero");
    const edges = M.edgesForRefs(b.shape, list);
    let s;
    try { s = chamfer ? K.chamferEdges(b.shape, edges, v) : K.filletEdges(b.shape, edges, v); } finally { del(edges); }
    const nd = G.cloneData(d);
    G.refreshSeeds(s, nd);
    putBody(st, bodyId, s, nd, f, b);
    affected.push(bodyId);
  }
  return { affected };
}

// ---------------------------------------------------------------- rip
function ripFeature(st, f, P, doc) {
  const refs = f.refs || [];
  if (!refs.length) throw new Error("Select a face, an internal edge, or a start point on an external edge");
  const bodyId = refs[0].body;
  const { b, d } = sheetBody(st, bodyId);
  const gap = Math.max(1e-3, num(P, f, "gap", 0.1));
  const nd = G.cloneData(d);
  const cuts = [];
  const T = K.topoOf(b.shape);
  const big = Math.max(10, d.T * 4);
  if (refs.length >= 2 && refs.every((r) => r.kind !== "face")) {
    // between points: a slot of the gap width through the sheet
    const pts = refs.slice(0, 2).map((r) => r.p);
    const fid = flangeAt(b.shape, d, pts[0]);
    if (!fid) throw new Error("Select points on the edges of one flange face");
    const m = G.flangeM(d, fid), mi = inv(m);
    let a = apply(mi, pts[0]), c = apply(mi, pts[1]);
    const dir = V2.norm(V2.sub([c[0], c[1]], [a[0], a[1]]));
    const o1 = num(P, f, "offset1", 0), o2 = num(P, f, "offset2", 0);
    const a2 = V2.add([a[0], a[1]], V2.mul(dir, o1 - 1e-3 * 0)), c2 = V2.add([c[0], c[1]], V2.mul(dir, -o2));
    const n = [-dir[1], dir[0]];
    const ext = 1e-2;
    const poly = [V2.add(V2.sub(a2, V2.mul(dir, ext)), V2.mul(n, -gap / 2)), V2.add(V2.add(c2, V2.mul(dir, ext)), V2.mul(n, -gap / 2)), V2.add(V2.add(c2, V2.mul(dir, ext)), V2.mul(n, gap / 2)), V2.add(V2.sub(a2, V2.mul(dir, ext)), V2.mul(n, gap / 2))];
    cuts.push(G.flatPrism(m, poly, d.w0 - 1e-3, d.w0 + d.T + 1e-3));
  } else {
    for (const r of refs) {
      if (r.kind === "face") {
        // rip a face: remove a bend (or seam face) of the given width along it
        const bid = bendAt(d, r.p);
        if (bid) {
          const bd = nd.bends[bid];
          if (bd.flat) throw new Error("The bend is unfolded: refold it before ripping it");
          cuts.push(G.bendSolid(nd, bd, G.parentM(nd, bd), 1e-3));
          // the child subtree is no longer attached: it stays where it is as its own root
          detachBend(nd, bid);
          continue;
        }
        throw new Error("Select a bend face, an internal edge or two points");
      }
      const i = M.locateEdge(b.shape, r);
      const e = T.edges[i];
      if (!e || e.type !== "LINE") throw new Error("Select a straight internal edge");
      // internal edge: the two faces meeting at it are both sheet faces; cut along their bisector
      const fns = (e.fn || []).filter(Boolean);
      if (fns.length < 2) throw new Error("Select an internal edge where two flanges meet");
      const ax = e.d;
      let bis = V.norm(V.mul(V.add(fns[0], fns[1]), 1));
      if (V.len(V.add(fns[0], fns[1])) < 1e-6) throw new Error("Select an internal edge where two flanges meet");
      const side = V.norm(V.cross(ax, bis));
      const L = e.len + 2e-2;
      const o = V.sub(e.s, V.mul(ax, 1e-2));
      // a thin box: along the edge, across the corner (bisector, both ways), gap wide
      const p = (a, s, t) => V.add(o, V.add(V.mul(ax, a), V.add(V.mul(bis, s), V.mul(side, t))));
      const face = K.polygonFace([p(0, -big, -gap / 2), p(L, -big, -gap / 2), p(L, big, -gap / 2), p(0, big, -gap / 2)]);
      try { cuts.push(K.prism(face, V.mul(side, gap))); } finally { del(face); }
      markSeamRipped(nd, b.shape, e);
    }
  }
  const shape = combine(b.shape, cuts, []);
  G.refreshSeeds(shape, nd);
  putBody(st, bodyId, shape, nd, f, b);
  return { affected: [bodyId] };
}
function detachBend(d, bid) {
  const b = d.bends[bid];
  if (!b) return;
  const child = d.flanges[b.child];
  const M0 = G.flangeM(d, b.child);
  delete d.bends[bid];
  if (child) { child.bend = null; child.M = M0; child.detached = true; }
}
function markSeamRipped(d, shape, e) {
  if (!Array.isArray(d.seams)) return;
  for (const s of d.seams) {
    if (s.ripped) continue;
    const near = (p) => V.len(V.sub(p, e.m)) < Math.max(1e-2, e.len / 2 + 1e-2);
    if (s.p && near(s.p)) s.ripped = true;
  }
}

// ---------------------------------------------------------------- corner closure
function cornerClosure(st, f, P, doc) {
  const refs = f.edges || [];
  if (refs.length < 2) throw new Error("Select edges on two flanges that meet at a corner");
  const bodyId = refs[0].body;
  const { b, d } = sheetBody(st, bodyId);
  const nd = G.cloneData(d);
  const flanges = [];
  for (const r of refs.slice(0, 2)) {
    const fid = flangeAt(b.shape, d, r.p);
    if (!fid || !d.flanges[fid].bend) throw new Error("Select edges of two edge flanges");
    if (!flanges.includes(fid)) flanges.push(fid);
  }
  if (flanges.length < 2) throw new Error("Select edges on two different flanges");
  const b1 = nd.bends[d.flanges[flanges[0]].bend], b2 = nd.bends[d.flanges[flanges[1]].bend];
  if (b1.parent !== b2.parent) throw new Error("The flanges must be bent from the same face");
  if (b1.sgn !== b2.sgn) throw new Error("The flanges must be bent to the same side");
  const T = d.T;
  const gap = f.gap !== undefined && f.gap !== "" ? Math.max(0, M.fval(P, f, "gap")) : nd.miterGap ?? T;
  const mp = G.flangeM(nd, b1.parent);
  // the corner: nearest ends of the two bend lines
  const ends = (bb) => [[V2.add(bb.o, V2.mul(bb.d, bb.s0)), 0], [V2.add(bb.o, V2.mul(bb.d, bb.s1)), 1]];
  let best = null;
  for (const [p1, e1] of ends(b1)) for (const [p2, e2] of ends(b2)) {
    const dd = V2.len(V2.sub(p1, p2));
    if (!best || dd < best.dd) best = { p1, p2, e1, e2, dd };
  }
  // corner point: intersection of the two bend start lines
  const den = V2.cross(b1.d, b2.d);
  if (Math.abs(den) < 1e-6) throw new Error("The flanges must meet at a corner");
  const t = V2.cross(V2.sub(b2.o, b1.o), b2.d) / den;
  const c = V2.add(b1.o, V2.mul(b1.d, t));
  const reach = (bb, fl) => {
    const L = flangeLen(nd, fl);
    return (bb.R + T) * (bb.A <= PI / 2 ? Math.sin(bb.A) : 1) + (bb.A < PI / 2 ? L * Math.cos(bb.A) : 0);
  };
  const ext = (bb, end, amount) => {
    const L = flangeLen(nd, bb.child);
    const s0 = end === 0 ? bb.s0 - amount : bb.s1, s1 = end === 0 ? bb.s0 : bb.s1 + amount;
    const tmp = { ...bb, s0, s1 };
    const parts = [G.bendSolid(nd, tmp, mp)];
    if (L > 1e-6) parts.push(G.flatPrism(G.flangeM(nd, bb.child), G.rect(bb.o, bb.d, bb.q, s0, s1, G.bendBA(bb, T), G.bendBA(bb, T) + L), nd.w0, nd.w0 + T));
    if (end === 0) bb.s0 = s0; else bb.s1 = s1;
    return parts;
  };
  const dist1 = Math.abs(V2.dot(V2.sub(c, V2.add(b1.o, V2.mul(b1.d, best.e1 === 0 ? b1.s0 : b1.s1))), b1.d));
  const dist2 = Math.abs(V2.dot(V2.sub(c, V2.add(b2.o, V2.mul(b2.d, best.e2 === 0 ? b2.s0 : b2.s1))), b2.d));
  const overlap = f.alignment === "overlap";
  const flipO = !!f.flipOverlap;
  const amount = Math.max(0, Math.min(1, f.overlap === undefined || f.overlap === "" ? 1 : M.fval(P, f, "overlap")));
  // Overlap Gap: flange A runs on over B (Overlap = the share of B's thickness it covers); B stops `gap` short of A
  const A = flipO ? b2 : b1, B = flipO ? b1 : b2;
  const extA = overlap ? (A === b1 ? dist1 : dist2) + B.R + amount * T : null;
  const p1 = ext(b1, best.e1, overlap && A === b1 ? extA : dist1 + reach(b2, b2.child));
  const p2 = ext(b2, best.e2, overlap && A === b2 ? extA : dist2 + reach(b1, b1.child));
  let k1, k2;
  if (overlap) {
    const keepB = [{ n: A.q, c: V2.dot(A.q, A.o) + A.R - gap }];
    if (B === b1) { k1 = keepB; k2 = null; } else { k1 = null; k2 = keepB; }
  } else {
    const m = V2.norm(V2.sub(b2.q, b1.q));
    k1 = [{ n: m, c: V2.dot(m, c) - gap / 2 }];
    k2 = [{ n: V2.mul(m, -1), c: -V2.dot(m, c) - gap / 2 }];
  }
  const clipList = (list, keep) => {
    if (!keep) return list;
    const box = G.flatPrism(mp, G.clipPoly(keep), nd.w0 - 2000, nd.w0 + 2000);
    try { return list.map((s) => { const x = K.intersect(s, box); del(s); return x; }); } finally { del(box); }
  };
  const adds = [...clipList(p1, k1), ...clipList(p2, k2)];
  // 2-bend corner relief (rule, or the dialog's override): cut through the base and the bends at the corner
  const relief = f.reliefOverride
    ? { shape: f.relief || nd.corner2.shape, size: f.reliefSize !== undefined && f.reliefSize !== "" ? M.fval(P, f, "reliefSize") : nd.corner2.size, placement: f.reliefPlacement || nd.corner2.placement }
    : { ...nd.corner2 };
  const poly = cornerReliefPoly(relief, c, b1, b2, T);
  let shape = combine(b.shape, [], adds);
  if (poly) {
    const Rm = Math.max(b1.R, b2.R);
    const lo = b1.sgn > 0 ? nd.w0 - 1e-3 : nd.w0 - Rm - T - 1e-3;
    const hi = b1.sgn > 0 ? nd.w0 + T + Rm + 1e-3 : nd.w0 + T + 1e-3;
    const s2 = combine(shape, [G.flatPrism(mp, poly, lo, hi)], []);
    del(shape);
    shape = s2;
  }
  G.refreshSeeds(shape, nd);
  putBody(st, bodyId, shape, nd, f, b);
  return { affected: [bodyId] };
}
/**
 * 2D relief outline (parent flat coords) at corner c of bends b1, b2: Round / Square of the relief size placed by
 * Placement (Intersection = where the bend lines meet, Vertex = the outer mould-line corner, Tangent = touching both
 * bend lines), Trim to Bend (the overlap of the bend zones), Linear Weld (V notch), Arc Weld (zone notch with a round
 * inner end), Laser Weld (round notch at the far corner of the zones); Tear = none.
 */
export function cornerReliefPoly(relief, c, b1, b2, T) {
  const shape = relief.shape || "Trim to Bend";
  if (shape === "Tear") return null;
  const s = Math.max(1e-3, Number(relief.size) || T * 2);
  const h1 = b1.R + T, h2 = b2.R + T;
  const q1 = b1.q, q2 = b2.q;
  const circle = (o, r, n = 32) => Array.from({ length: n }, (_, i) => V2.add(o, [r * Math.cos((2 * PI * i) / n), r * Math.sin((2 * PI * i) / n)]));
  const pl = relief.placement || "Intersection";
  const place = () => {
    if (pl === "Vertex") return V2.add(c, V2.add(V2.mul(q1, (b1.R + T) * Math.tan(Math.min(b1.A, PI / 2) / 2)), V2.mul(q2, (b2.R + T) * Math.tan(Math.min(b2.A, PI / 2) / 2))));
    if (pl === "Tangent") return V2.add(c, V2.mul(V2.add(q1, q2), s / 2));
    return c;
  };
  if (shape === "Round") return circle(place(), s / 2);
  if (shape === "Square") {
    const o = place(), a = V2.mul(q1, s / 2), b = V2.mul(q2, s / 2);
    return [V2.sub(V2.sub(o, a), b), V2.sub(V2.add(o, a), b), V2.add(V2.add(o, a), b), V2.add(V2.sub(o, a), b)];
  }
  const far = V2.add(c, V2.add(V2.mul(q1, h1), V2.mul(q2, h2)));
  if (shape === "Trim to Bend") return [c, V2.add(c, V2.mul(q1, h1)), far, V2.add(c, V2.mul(q2, h2))];
  const across = V2.norm(V2.sub(q1, q2));
  if (shape === "Linear Weld") {
    const w = Math.min(s, Math.min(h1, h2)) / 2;
    return [V2.sub(c, V2.mul(V2.add(q1, q2), 1e-3)), V2.add(far, V2.mul(across, w)), V2.sub(far, V2.mul(across, w))];
  }
  if (shape === "Arc Weld") {
    const r = Math.min(h1, h2) / 2;
    const o = V2.add(c, V2.add(V2.mul(q1, r), V2.mul(q2, r)));
    const a0 = Math.atan2(-q2[1], -q2[0]);
    let da = Math.atan2(-q1[1], -q1[0]) - a0;
    while (da > PI) da -= 2 * PI;
    while (da < -PI) da += 2 * PI;
    const arc = [];
    for (let i = 0; i <= 12; i++) { const a = a0 + (da * i) / 12; arc.push(V2.add(o, [r * Math.cos(a), r * Math.sin(a)])); }
    return [...arc, V2.add(c, V2.mul(q2, h2)), far, V2.add(c, V2.mul(q1, h1))];
  }
  // Laser Weld: a round notch at the far corner of the bend zones
  return circle(far, Math.max(s / 2, Math.min(h1, h2) * 0.6));
}
function flangeLen(d, fid) {
  // straight length of an edge flange: from its seeds (they sit at half its length past the bend)
  const fl = d.flanges[fid];
  const b = fl && d.bends[fl.bend];
  if (!b || !fl.seeds || !fl.seeds.length) return 0;
  const BA = G.bendBA(b, d.T);
  const u = Math.max(...fl.seeds.map((s) => V2.dot(V2.sub(s, b.o), b.q))) - BA;
  return fl.len !== undefined ? fl.len : Math.max(0, 2 * u);
}

// ---------------------------------------------------------------- registration
const BODY_DEPS = (keys) => (f) => {
  const bodies = [];
  for (const k of keys) for (const r of f[k] || []) if (r && r.body && !bodies.includes(r.body)) bodies.push(r.body);
  return { sketches: [...new Set([...(f.profiles || []), ...(f.line || [])].map((p) => p.sketch).filter(Boolean))], cplanes: [], bodies, features: [], geo: [] };
};
const touchesOf = (keys) => (f) => [...new Set(keys.flatMap((k) => (f[k] || []).map((r) => r && r.body).filter(Boolean)))];

export const FEATURES = {
  smBaseFlange: {
    label: "Base Flange", stem: "Flange", icon: "SMBaseFlange",
    fields: {},
    makesBodies: (f) => Math.max(1, (f.profiles || []).length),
    apply: applyBaseFlange,
    deps: BODY_DEPS([]),
    touches: () => [],
  },
  smEdgeFlange: {
    label: "Edge Flange", stem: "Flange", icon: "FusionSheetMetalFlangeCommand",
    fields: { height: "length", angle: "angle", w1: "length", w2: "length", o1: "length", o2: "length", bendRadius: "length", toOffset: "length", reliefWidth: "length", reliefDepth: "length" },
    apply: (st, f, P, doc) => applyEdgeChain(st, f, P, doc, "flange"),
    deps: BODY_DEPS(["edges", "toObject"]), touches: touchesOf(["edges"]),
  },
  smHem: {
    label: "Hem", stem: "Hem", icon: "FusionSheetMetalHemFlangeCommand",
    fields: { length: "length", gap: "length", radius: "length", angle: "angle", setback: "length", w1: "length", w2: "length", o1: "length", o2: "length" },
    apply: (st, f, P, doc) => applyEdgeChain(st, f, P, doc, "hem"),
    deps: BODY_DEPS(["edges"]), touches: touchesOf(["edges"]),
  },
  smFold: {
    label: "Fold", stem: "Fold", icon: "SheetMetalFoldCmd",
    fields: { angle: "angle", bendRadius: "length" },
    apply: (st, f, P, doc) => foldFeature(st, f, P, doc, false),
    deps: BODY_DEPS(["stationary"]), touches: touchesOf(["stationary"]),
  },
  smJog: {
    label: "Jog", stem: "Jog", icon: "FusionSheetMetalJogCommand",
    fields: { angle: "angle", offset: "length", bendRadius: "length" },
    apply: (st, f, P, doc) => foldFeature(st, f, P, doc, true),
    deps: BODY_DEPS(["stationary"]), touches: touchesOf(["stationary"]),
  },
  smUnfold: {
    label: "Unfold", stem: "Unfold", icon: "FusionSheetmetalUnfoldCommand",
    fields: {},
    apply: (st, f, P, doc) => refoldFeature(st, f, P, doc, true),
    deps: BODY_DEPS(["stationary", "bends"]), touches: touchesOf(["stationary"]),
  },
  smRefold: {
    label: "Refold", stem: "Refold", icon: "FusionSheetmetalRefoldCommand",
    fields: {},
    apply: (st, f, P, doc) => refoldFeature(st, f, P, doc, false),
    deps: BODY_DEPS(["stationary", "bends"]), touches: touchesOf(["stationary"]),
  },
  smFillet: {
    label: "Sheet Metal Fillet", stem: "Fillet", icon: "FusionSheetMetalFilletCommand",
    fields: { radius: "length" },
    apply: (st, f, P, doc) => cornerFeature(st, f, P, doc, false),
    deps: BODY_DEPS(["edges"]), touches: touchesOf(["edges"]),
  },
  smChamfer: {
    label: "Sheet Metal Chamfer", stem: "Chamfer", icon: "FusionSheetMetalChamferCommand",
    fields: { distance: "length" },
    apply: (st, f, P, doc) => cornerFeature(st, f, P, doc, true),
    deps: BODY_DEPS(["edges"]), touches: touchesOf(["edges"]),
  },
  smRip: {
    label: "Rip", stem: "Rip", icon: "FusionSheetMetalRipCommand",
    fields: { gap: "length", offset1: "length", offset2: "length" },
    apply: ripFeature,
    deps: BODY_DEPS(["refs"]), touches: touchesOf(["refs"]),
  },
  smCorner: {
    label: "Corner Closure", stem: "Corner", icon: "FusionSheetMetalCornerCommand",
    fields: { gap: "length", overlap: "none", reliefSize: "length" },
    apply: cornerClosure,
    deps: BODY_DEPS(["edges"]), touches: touchesOf(["edges"]),
  },
};
export { chainOnEdge, applyRule, putBody, sheetBody, ruleNums, combine };
