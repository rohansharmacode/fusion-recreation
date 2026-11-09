// Evaluators of the plastic feature types (registered with model.js registerFeature in index.js).
// DOM-free: tests/e2e/out/plastic/geomtest.mjs runs them in Node.
//   rib     {curves:{sketch, curves:[ids]}, thicknessType:'sym'|'one', extent:'next'|'distance', thickness, depth,
//            flip, draft, draftFrom:'top'|'bottom', fillet}
//   web     same fields as rib (thickness in the sketch plane, depth along the sketch normal)
//   emboss  {profiles:[{sketch,key,c}], faces:[{body,p,n}], depth, effect:'emboss'|'deboss', hdist, vdist, angle}
//   boss    {points:[{sketch,point}], flip, bossType:'flat'|'tip'|'pinned', s1Type:'simple'|'counterbore'|'countersink', s1D, s1B, s1E, s1A, s1Cs,
//            s1Draft, s1R, s1O, s1Step:'none'|'in'|'out', s1C, s1F, s2D, s2B, s2G,
//            s2Draft, s2R, s2O, s2Step, s2C, s2F}
//   lip     {lipType:'lip'|'groove'|'both', edges:[{body,p}], guide?:{body,p,n}, height, width, clearance, draft1, draft2}
//   rest    {profiles, body, thickness, direction:'side1'|'side2'|'sym', offset, extent:'all'|'object', object?, draft}
//   snapFit {snapType:'parallel'|'perpendicular'|'loop', points, flip, rotation, hA, hB, hC, hD, hE, hF, hH, hAlpha1,
//            hAlpha2, gJ, gL, gM}
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import * as G from "./geom.js";

const V = K.V;
const { v2 } = G;
const fv = (P, f, key, dflt = 0) => (f[key] === undefined || f[key] === null || f[key] === "" ? dflt : M.fval(P, f, key));
const rad = (deg) => (deg * Math.PI) / 180;

/** Visible solid bodies of the state: [{id, shape}]. */
export function solidBodies(st, doc) {
  const out = [];
  for (const [id, b] of st.bodies) {
    if (doc && doc.bodies && doc.bodies[id] && doc.bodies[id].visible === false) continue;
    if (!M.isSolidBody(st, id)) continue;
    out.push({ id, shape: b.shape });
  }
  return out;
}

/** shape minus every body whose box overlaps it (input deleted). */
function cutByBodies(shape, bodies) {
  let s = shape;
  for (const b of bodies) {
    if (!K.boxesOverlap(K.bboxOf(s), K.bboxOf(b.shape))) continue;
    const n = K.cut(s, b.shape);
    K.del(s);
    s = n;
  }
  return s;
}

/** Fuse a tool into the bodies it touches (the first one keeps its id); returns {ids, before}. */
function joinTool(st, f, tool, bodies) {
  const targets = bodies.filter((b) => M.touches(b.shape, tool));
  if (!targets.length) { K.del(tool); throw new Error("The feature does not touch a body"); }
  let s = K.fuse(targets[0].shape, tool);
  for (const t of targets.slice(1)) { const n = K.fuse(s, t.shape); K.del(s); s = n; st.bodies.delete(t.id); }
  st.bodies.set(targets[0].id, { ...st.bodies.get(targets[0].id), id: targets[0].id, shape: s, from: f.id });
  return { ids: targets.map((t) => t.id), before: targets[0].shape, id: targets[0].id };
}

/** Sketch chain of a curve selection: {pl, segs, closed}. */
function curveChain(st, ref, what) {
  const s = ref && st.sketches.get(ref.sketch);
  if (!s) throw new Error("missing curves");
  const raw = G.sketchSegs(s.sk, ref.curves);
  if (!raw.length) throw new Error("missing curves");
  const { segs, closed } = G.chain2d(raw);
  if (closed) throw new Error(`Select an open sketch profile to create the ${what}`);
  return { pl: s.plane, segs };
}
const dir3 = (pl, d) => V.norm(V.add(V.mul(pl.x, d[0]), V.mul(K.planeY(pl), d[1])));
const W = (pl, q) => K.toWorld(pl, q[0], q[1]);

/** Miter / end extensions for band faces: tangent joints 0, sharp joints `miter`, chain ends `ends[0|1]`. */
function bandExt(segs, miter, ends = [0, 0], closed = false) {
  const n = segs.length;
  return (i, end) => {
    const s = segs[i];
    if (s.kind !== "line") return 0;
    if (end === 0) {
      if (i === 0 && !closed) return ends[0];
      const tp = G.segTan(segs[(i - 1 + n) % n], 1), t = G.segTan(s, 0);
      return v2.dot(tp, t) > 1 - 1e-6 ? 0 : miter;
    }
    if (i === n - 1 && !closed) return ends[1];
    const tn = G.segTan(segs[(i + 1) % n], 0), t = G.segTan(s, 1);
    return v2.dot(tn, t) > 1 - 1e-6 ? 0 : miter;
  };
}

/** How far a chain end must be extended along its tangent to reach a body (0 = it does not). */
function endReach(bodies, p, t, levels, big, T) {
  for (const off of levels) {
    const hit = G.rayHit(bodies, V.add(p, off), t, big);
    if (hit) return hit.t + Math.max(Math.abs(T), 0.5);
  }
  return 0;
}

/** Draft the faces of `shape` selected by pick(faceInfo) about neutral plane {o, n}; null on failure. */
function draftWhere(shape, pick, angle, pl) {
  const T = K.topoOf(shape);
  const idx = [];
  T.faces.forEach((fi, i) => { if (pick(fi)) idx.push(i); });
  if (!idx.length) return null;
  const faces = K.facesAt(shape, idx);
  try { return K.draftFaces(shape, faces, angle, pl); } catch { return null; } finally { K.del(...faces); }
}

// ---------------------------------------------------------------- Rib / Web
function thinFeature(kind, st, f, P, doc) {
  const T = fv(P, f, "thickness");
  if (!(Math.abs(T) > 1e-6)) throw new Error("The thickness must not be zero");
  const { pl, segs } = curveChain(st, f.curves, kind);
  const bodies = solidBodies(st, doc);
  if (!bodies.length) throw new Error(`No solid body for the ${kind}`);
  const big = M.modelSize(st);
  const N = V.norm(pl.n);
  const mid = G.chainPoint(segs, 0.5);
  const midW = W(pl, mid.p);
  const sym = f.thicknessType !== "one";
  const [o1, o2] = sym ? [-Math.abs(T) / 2, Math.abs(T) / 2] : T > 0 ? [0, T] : [T, 0];
  const distance = f.extent === "distance";
  const D = distance ? fv(P, f, "depth") : big;
  if (distance && !(D > 1e-6)) throw new Error("The depth must be positive");

  // depth direction: rib = in the sketch plane, across the chord; web = along the sketch normal
  let d2 = null, Dd;
  if (kind === "rib") {
    const a = G.segStart(segs[0]), b = G.segEnd(segs[segs.length - 1]);
    const chord = v2.sub(b, a);
    d2 = v2.norm(v2.left(v2.len(chord) > 1e-9 ? v2.norm(chord) : mid.t));
    Dd = dir3(pl, d2);
  } else Dd = V.mul(N, -1);
  // default side: the one that reaches a body first
  const hp = G.rayHit(bodies, midW, Dd, big), hm = G.rayHit(bodies, midW, V.mul(Dd, -1), big);
  let sgn = hp && hm ? (hm.t < hp.t ? -1 : 1) : hm && !hp ? -1 : 1;
  if (f.flip) sgn = -sgn;
  if (d2) d2 = v2.mul(d2, sgn);
  Dd = V.mul(Dd, sgn);
  const hit0 = sgn > 0 ? hp : hm;

  // chain ends grow along their tangents until they meet a body (like Fusion's "runs to the nearest faces")
  const first = segs[0], last = segs[segs.length - 1];
  const pa = W(pl, G.segStart(first)), pb = W(pl, G.segEnd(last));
  const ta = dir3(pl, v2.mul(G.segTan(first, 0), -1)), tb = dir3(pl, G.segTan(last, 1));
  const lv = (hit0 ? [0.05, 0.5, 0.95].map((k) => hit0.t * k) : [0.05]).map((t) => V.mul(Dd, Math.max(t, 0.02)));
  const span = [V.mul(N, (o1 + o2) / 2)];
  const levels = kind === "rib" ? lv.map((x) => V.add(x, span[0])) : lv;
  const extA = endReach(bodies, pa, ta, levels, big, T), extB = endReach(bodies, pb, tb, levels, big, T);
  const all = [];
  if (extA > 0) all.push({ kind: "line", a: v2.sub(G.segStart(first), v2.mul(G.segTan(first, 0), extA)), b: G.segStart(first) });
  all.push(...segs);
  if (extB > 0) all.push({ kind: "line", a: G.segEnd(last), b: v2.add(G.segEnd(last), v2.mul(G.segTan(last, 1), extB)) });

  const build = (depth) => (kind === "rib"
    ? G.prismUnion(G.sweptFaces(pl, all, d2, depth), V.mul(N, o2 - o1), V.mul(N, o1))
    : G.prismUnion(G.bandFaces(pl, all, o1, o2, bandExt(all, Math.abs(T) / 2)), V.mul(Dd, depth)));
  const seeds = G.chainEdges(pl, segs);
  const keep = (slab, depth) => {
    const cut = cutByBodies(slab, bodies);
    let pieces = G.piecesTouching(cut, seeds);
    if (!distance) pieces = pieces.filter((p) => { const ok = G.extentAlong(p, midW, Dd)[1] < depth - 1e-3; if (!ok) K.del(p); return ok; });
    return pieces;
  };
  let warning;
  try {
    let pieces = keep(build(D), D);
    if (!pieces.length) throw new Error(`The ${kind} does not end on a face of a body. Use Distance, Flip, or move the profile`);
    // draft: rebuilt with the reached depth so the tapered side faces stay valid
    const alpha = fv(P, f, "draft");
    if (Math.abs(alpha) > 1e-6) {
      const reach = Math.max(...pieces.map((p) => G.extentAlong(p, midW, Dd)[1]));
      const depth = distance ? D : reach + 0.5;
      const top = f.draftFrom !== "bottom";
      // Draft Pull Direction (rib): a plane / face normal or a line direction; default the depth direction
      let pull = Dd;
      if (kind === "rib" && f.pull) {
        pull = pullDir(st, f.pull);
        if (!pull) throw new Error("missing pull direction");
        if (V.dot(pull, Dd) < 0) pull = V.mul(pull, -1);
      }
      const nplane = { o: top ? midW : V.add(midW, V.mul(Dd, reach)), n: pull };
      const side = kind === "rib"
        ? (fi) => fi.type === "PLANE" && Math.abs(Math.abs(V.dot(fi.n, N)) - 1) < 1e-6
        : (fi) => (fi.type === "PLANE" && Math.abs(V.dot(fi.n, N)) < 1e-6) || (fi.type === "CYLINDRE" && fi.a && Math.abs(Math.abs(V.dot(V.norm(fi.a), N)) - 1) < 1e-6);
      const slab = build(depth);
      let v0 = 0;
      try { v0 = K.volumeOf(slab); } catch { v0 = 0; }
      let dr = draftWhere(slab, side, alpha, nplane);
      // positive draft narrows the feature away from the profile (From Top) / towards it (From Bottom)
      if (dr) {
        let v1 = 0;
        try { v1 = K.volumeOf(dr); } catch { v1 = 0; }
        let sgn = 1;
        if ((v1 > v0) === top) { sgn = -1; K.del(dr); dr = draftWhere(slab, side, -alpha, nplane); }
        // Flip Pull Direction: the taper goes the other way
        if (dr && kind === "rib" && f.flipPull) { K.del(dr); dr = draftWhere(slab, side, -sgn * alpha, nplane); }
      }
      K.del(slab);
      if (dr) {
        const p2 = keep(dr, depth + 1);
        if (p2.length) { K.del(...pieces); pieces = p2; } else warning = "The draft could not be applied";
      } else warning = "The draft could not be applied";
    }
    const tool = G.fuseAll(pieces);
    // join into the body the feature runs to (never merge the other half of an enclosure it touches)
    const target = hit0 ? bodies.filter((b) => b.id === hit0.id && M.touches(b.shape, tool)) : [];
    const j = joinTool(st, f, tool, target.length ? target : bodies);
    const r = fv(P, f, "fillet");
    if (r > 1e-6) {
      const cur = st.bodies.get(j.id);
      const res = G.filletJunction(cur.shape, tool, j.before, r);
      if (res.shape !== cur.shape) st.bodies.set(j.id, { ...cur, shape: res.shape });
      if (res.warning) warning = warning ? `${warning}. ${res.warning}` : res.warning; // keep a draft warning too
    }
    K.del(tool);
    return { affected: j.ids, ...(warning ? { warning } : {}) };
  } finally { K.del(...seeds); }
}
export const applyRib = (st, f, P, doc) => thinFeature("rib", st, f, P, doc);
export const applyWeb = (st, f, P, doc) => thinFeature("web", st, f, P, doc);

// ---------------------------------------------------------------- Emboss
/** Planar face of a polygon loop with polygon holes (3D points). */
function polyFaceWithHoles(outer, holes) {
  const wire = (pts) => {
    const es = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (V.len(V.sub(a, b)) > 1e-9) es.push(K.R.makeLine(a, b));
    }
    try { return K.R.assembleWire(es); } finally { K.del(...es); }
  };
  const ow = wire(outer), hw = holes.map(wire);
  try {
    const f = K.R.makeFace(ow, hw);
    const O = K.R.getOC();
    const fix = new O.ShapeFix_Face(f.wrapped);
    try { fix.FixOrientation(); return new K.R.Face(fix.Face()); } finally { K.del(fix, f); }
  } finally { K.del(ow, ...hw); }
}
const densify = (poly, step) => {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(v2.len(v2.sub(b, a)) / step));
    for (let k = 0; k < n; k++) out.push(v2.add(a, v2.mul(v2.sub(b, a), k / n)));
  }
  return out;
};

export function applyEmboss(st, f, P, doc) {
  const depth = fv(P, f, "depth");
  if (!(depth > 1e-6)) throw new Error("The depth must be positive");
  if (!(f.faces || []).length) throw new Error("missing target faces");
  if (!(f.profiles || []).length) throw new Error("missing profiles");
  const deboss = f.effect === "deboss";
  const hd = fv(P, f, "hdist"), vd = fv(P, f, "vdist"), ang = fv(P, f, "angle");
  const big = M.modelSize(st);
  const groups = M.profileGroups(st, f.profiles);
  const byBody = new Map();
  let warning;
  for (const fr of f.faces) {
    const b = st.bodies.get(fr.body);
    if (!b) throw new Error("missing target faces");
    const idx = M.locateFace(b.shape, fr);
    if (idx < 0) throw new Error("missing target faces");
    const [face] = K.facesAt(b.shape, [idx]);
    let skin = null;
    try {
      const nOut = Array.isArray(fr.n) ? V.norm(fr.n) : K.topoOf(b.shape).faces[idx].n;
      for (const t of [depth, -depth]) {
        let s = null;
        try { s = G.thickenFace(face, t); } catch { s = null; }
        if (!s) continue;
        const probe = V.add(fr.p, V.mul(nOut, (deboss ? -1 : 1) * depth * 0.5));
        if (G.inside(s, probe)) { skin = s; break; }
        K.del(s);
      }
    } finally { K.del(face); }
    if (!skin) throw new Error("The emboss depth is too large for the selected face");
    const cyl = K.cylinderFaceInfo(b.shape, idx);
    const tools = [];
    for (const g of groups) {
      const pl = g.sketch.plane;
      const N = V.norm(pl.n), Y = K.planeY(pl);
      // centroid of the profiles (rotation centre)
      let cu = 0, cv = 0, cn = 0;
      for (const r of g.regions) for (const q of r.outer.poly) { cu += q[0]; cv += q[1]; cn++; }
      const c2 = cn ? [cu / cn, cv / cn] : [0, 0];
      const wrap = cyl && !cyl.internal && Math.abs(V.dot(V.norm(cyl.a), N)) < 1e-3;
      let prism;
      if (wrap) {
        // wrap the profile around the cylinder: arc length along the circumference is kept
        const a = V.norm(cyl.a);
        const t = V.norm(V.cross(N, a));
        const tu = V.dot(t, pl.x), tvv = V.dot(t, Y);
        const r = cyl.r;
        // walls run along the sketch normal: place them at the right angle half way through the depth
        const rho = Math.max(r * 0.5, r + (deboss ? -depth : depth) / 2);
        const ca = Math.cos(rad(ang)), sa = Math.sin(rad(ang));
        const xf = (q) => {
          const d = v2.sub(q, c2);
          const qq = v2.add(c2, [d[0] * ca - d[1] * sa + hd, d[0] * sa + d[1] * ca + vd]);
          const w = W(pl, qq);
          const s = V.dot(V.sub(w, cyl.o), t);
          const lim = r * Math.asin(Math.min(1, r / rho)) * 0.98;
          if (Math.abs(s) > lim) warning = "The profile is wider than half the cylinder; it is clipped";
          const sc = Math.max(-lim, Math.min(lim, s));
          const sh = rho * Math.sin(sc / r) - s;
          return v2.add(qq, [tu * sh, tvv * sh]);
        };
        const step = Math.max(0.2, r / 40);
        const faces = [];
        for (const reg of g.regions) {
          const out = densify(reg.outer.poly, step).map(xf).map((q) => W(pl, q));
          const holes = (reg.holes || []).map((h) => densify(h.poly, step).map(xf).map((q) => W(pl, q)));
          faces.push(polyFaceWithHoles(out, holes));
        }
        prism = G.prismUnion(faces, V.mul(N, 2 * big), V.mul(N, -big));
      } else {
        let p0 = K.extrudeRegions(g.regions, g.sketch.regions.vertices, pl, -big, 2 * big);
        if (Math.abs(ang) > 1e-9) { const p1 = K.rotated(p0, ang, W(pl, c2), N); K.del(p0); p0 = p1; }
        if (Math.abs(hd) > 1e-9 || Math.abs(vd) > 1e-9) { const p1 = K.translated(p0, V.add(V.mul(pl.x, hd), V.mul(Y, vd))); K.del(p0); p0 = p1; }
        prism = p0;
      }
      try {
        const tool = K.intersect(skin, prism);
        if (!K.isEmptyShape(tool)) tools.push(tool); else K.del(tool);
      } finally { K.del(prism); }
    }
    K.del(skin);
    if (!byBody.has(fr.body)) byBody.set(fr.body, []);
    byBody.get(fr.body).push(...tools);
  }
  const affected = [];
  const shown = [];
  for (const [bid, tools] of byBody) {
    if (!tools.length) continue;
    const tool = G.fuseAll(tools);
    const b = st.bodies.get(bid);
    const s = deboss ? K.cut(b.shape, tool) : K.fuse(b.shape, tool);
    st.bodies.set(bid, { ...b, shape: s, from: f.id });
    affected.push(bid);
    shown.push(tool);
  }
  if (!affected.length) { K.del(...shown); throw new Error("The profiles do not project onto the selected faces"); }
  if (deboss) st._tool = G.fuseAll(shown); else K.del(...shown);
  return { affected, ...(warning ? { warning } : {}) };
}

// ---------------------------------------------------------------- shared: sketch points
function sketchPointsW(st, refs) {
  const out = [];
  for (const sp of refs || []) {
    const s = st.sketches.get(sp.sketch);
    const q = s && s.sk.points[sp.point];
    if (!q) continue;
    out.push({ p: K.toWorld(s.plane, q.x, q.y), n: V.norm(s.plane.n), pl: s.plane });
  }
  return out;
}

/** Column of revolution from `top` along dir that runs to the first face of a body; {piece, hit, body}. */
/**
 * Tool that runs from `top` along dir to the first face of a body: build(L, hit) makes the tool (L = a length past
 * the face); the part between the top and the face is kept ({piece, hit, body}, null when nothing is hit).
 */
function columnToNext(bodies, top, dir, build, big, what, seedZ = 1e-3) {
  const hit = G.rayHit(bodies, top, dir, big);
  if (!hit) return null;
  const L = hit.t + big * 0.25;
  const col = build(L, hit);
  const body = bodies.find((x) => x.id === hit.id);
  const cut = K.cut(col, body.shape);
  K.del(col);
  const seed = K.R.makeVertex(V.add(top, V.mul(dir, seedZ)));
  let pieces;
  try { pieces = G.piecesTouching(cut, [seed]); } finally { K.del(seed); }
  if (!pieces.length) throw new Error(`The ${what} does not reach a body`);
  const piece = G.fuseAll(pieces);
  if (G.extentAlong(piece, top, dir)[1] > L - 1e-3) { K.del(piece); throw new Error(`The ${what} does not end on a face of a body`); }
  return { piece, hit, body };
}

/** Distance along the ray from `from` (inside the material) to where it leaves the body. */
function exitDistance(shape, p, dir, t0, big) {
  let lo = t0, hi = t0 + big;
  if (G.inside(shape, V.add(p, V.mul(dir, hi)))) return hi;
  for (let i = 0; i < 32 && hi - lo > 1e-5; i++) {
    const m = (lo + hi) / 2;
    if (G.inside(shape, V.add(p, V.mul(dir, m)))) lo = m; else hi = m;
  }
  return lo;
}

// ---------------------------------------------------------------- Boss
/** Radial unit vector at angle phi (deg) around axis dir (0 along perp(dir)). */
function radial(dir, phi) {
  const u = G.perp(dir), v = V.norm(V.cross(dir, u));
  const t = rad(phi);
  return V.norm(V.add(V.mul(u, Math.cos(t)), V.mul(v, Math.sin(t))));
}
/** Angles (deg) of n items: Full spreads them over 360 deg, else over `total` from `rot`. */
function spread(n, rot, total, full) {
  if (!(n > 0)) return [];
  if (full || Math.abs(total) >= 360 - 1e-9) return Array.from({ length: n }, (_, i) => rot + (360 * i) / n);
  return Array.from({ length: n }, (_, i) => rot + (n > 1 ? (total * i) / (n - 1) : 0));
}
/** Thin radial plate (rib / web) of a boss: profile (r, z) in the half plane at angle phi, thickness t across it. */
function radialPlate(top, dir, phi, pts, radii, t, draft, neutralZ) {
  const er = radial(dir, phi);
  const pl = { o: top, x: er, n: V.norm(V.cross(er, dir)) };
  let plate = G.prismRounded(pl, pts, radii, V.mul(pl.n, t), V.mul(pl.n, -t / 2));
  if (Math.abs(draft) > 1e-6) {
    // thicker towards the base (draft about the top of the plate)
    const side = (fi) => fi.type === "PLANE" && Math.abs(Math.abs(V.dot(fi.n, pl.n)) - 1) < 1e-6;
    const npl = { o: V.add(top, V.mul(dir, neutralZ)), n: dir };
    let v0 = 0;
    try { v0 = K.volumeOf(plate); } catch { v0 = 0; }
    let dr = draftWhere(plate, side, draft, npl);
    if (dr) { let v1 = 0; try { v1 = K.volumeOf(dr); } catch { v1 = 0; } if (v1 < v0) { K.del(dr); dr = draftWhere(plate, side, -draft, npl); } }
    if (dr) { K.del(plate); plate = dr; }
  }
  return { plate, er, pl };
}

export function applyBoss(st, f, P, doc) {
  const pts = sketchPointsW(st, f.points);
  if (!pts.length) throw new Error("Select sketch point to place a boss");
  const big = M.modelSize(st);
  const affected = new Set();
  const warnings = [];
  const pinned = (f.bossType || "flat") === "pinned";
  const offPos = fv(P, f, "offsetPos");
  let made = 0;
  for (const pt0 of pts) {
    const pt = { ...pt0, p: V.add(pt0.p, V.mul(pt0.n, offPos)) };
    for (const side of [1, 2]) {
      const k = `s${side}`;
      const g = (x, dflt = 0) => fv(P, f, `${k}${x}`, dflt);
      const D = g("D"), B = g("B");
      if (!(D > B && B > 0)) throw new Error(`Side ${side}: the boss diameter must be larger than the hole diameter`);
      const ta = Math.tan(rad(g("Draft"))), O = g("O"), Rf = g("R");
      const dir = V.mul(pt.n, (side === 1 ? 1 : -1) * (f.flip ? -1 : 1));
      const top = V.add(pt.p, V.mul(dir, O));
      const step = f[`${k}Step`] || "none";
      const C = step !== "none" ? g("C") : 0, F = step !== "none" ? g("F") : 0, t3 = Math.tan(rad(g("A3")));
      if (step !== "none" && !(C > B && C <= D && F > 0)) throw new Error(`Side ${side}: the step must be wider than the hole, not wider than the boss, and have a depth`);
      const R5 = g("R5"), R6 = g("R6"), R7 = g("R7");
      const bodies = solidBodies(st, doc);
      // ribs (gussets) and webs of this side
      const nR = Math.max(0, Math.round(g("RibN"))), nW = Math.max(0, Math.round(g("WebN")));
      const build = (L, hit) => {
        let pr, rr;
        if (step === "out") { pr = [[0, -F], [C / 2 - F * t3, -F], [C / 2, 0], [D / 2, 0], [D / 2 + L * ta, L], [0, L]]; rr = [0, R6, R7, R5, 0, 0]; }
        else if (step === "in") { pr = [[0, F], [C / 2 - F * t3, F], [C / 2, 0], [D / 2, 0], [D / 2 + L * ta, L], [0, L]]; rr = [0, R7, R6, R5, 0, 0]; }
        else { pr = [[0, 0], [D / 2, 0], [D / 2 + L * ta, L], [0, L]]; rr = [0, R5, 0, 0]; }
        const parts = [G.revolveRounded(top, dir, pr, rr)];
        if (nR) {
          const K0 = g("RibK"), Lo = g("RibL"), t = g("RibT"), b1 = Math.tan(rad(g("RibB1")));
          if (!(K0 > D / 2 && t > 0)) throw new Error(`Side ${side}: the rib length must reach past the boss and the rib thickness must be positive`);
          const zt = (step === "out" ? -F : 0) + Lo;
          let prof, rads;
          if ((f[`${k}RibShape`] || "round") === "chamfer") {
            const Mc = Math.min(g("RibM"), K0 * 0.99), b2 = Math.tan(rad(g("RibB2", 45)));
            prof = Mc > 1e-6 ? [[0, zt], [K0 - Mc, zt], [K0, zt + Mc * b2], [K0 + (L - zt) * b1, L], [0, L]] : [[0, zt], [K0, zt], [K0 + (L - zt) * b1, L], [0, L]];
            rads = [];
          } else { prof = [[0, zt], [K0, zt], [K0 + (L - zt) * b1, L], [0, L]]; rads = [0, g("RibRR"), 0, 0]; }
          for (const phi of spread(nR, g("RibRot"), g("RibTotal", 360), true)) {
            const { plate, er, pl } = radialPlate(top, dir, phi, prof, rads, t, g("RibDraft"), zt);
            let rib = plate;
            const ro = g("RibOuter");
            if (ro > 1e-6) {
              // round the outer edges of the rib (not the ones inside the boss or past the wall)
              const es = K.edgesOf(rib).filter((e) => { const m = K.edgeMid(e); const q = V.sub(m, top); const r = V.dot(q, er), z = V.dot(q, dir), w = V.dot(q, pl.n); return Math.abs(Math.abs(w) - t / 2) < t * 0.3 && r > D / 2 && z < L - 1e-3; });
              try { const fr = K.filletEdges(rib, es, Math.min(ro, t * 0.45)); K.del(rib); rib = fr; } catch { warnings.push("The outer rib fillet could not be applied"); } finally { K.del(...es); }
            }
            parts.push(rib);
          }
        }
        if (nW) {
          const t = g("WebT"), depth = g("WebDepth");
          if (!(t > 0 && depth > 0)) throw new Error(`Side ${side}: the web thickness and depth must be positive`);
          const zm = Math.min(depth, hit.t) / 2;
          for (const phi of spread(nW, g("WebRot"), g("WebTotal", 360), (f[`${k}WebSpacing`] || "full") === "full")) {
            const er = radial(dir, phi);
            const wh = G.rayHit(bodies, V.add(top, V.add(V.mul(dir, zm), V.mul(er, D / 2 + 1e-3))), er, big);
            if (!wh) { warnings.push(`Side ${side}: a web does not reach a face`); continue; }
            const len = D / 2 + wh.t + Math.min(0.5, t);
            parts.push(radialPlate(top, dir, phi, [[0, 0], [len, 0], [len, depth], [0, depth]], [], t, g("WebDraft"), 0).plate);
          }
        }
        return G.fuseAll(parts);
      };
      const col = columnToNext(bodies, top, dir, build, big, "boss", step === "in" ? F + 1e-3 : 1e-3);
      if (!col) { warnings.push(`Side ${side} has no body`); continue; }
      made++;
      const j = joinTool(st, f, col.piece, [col.body]);
      affected.add(j.id);
      let cur = st.bodies.get(j.id);
      // base fillets: the boss foot (R) and the rib feet (rib base fillet radius)
      const rib0 = nR ? g("RibBase") : 0;
      const axisR = (m) => { const q = V.sub(m, top); return V.len(V.sub(q, V.mul(dir, V.dot(q, dir)))); };
      if (Rf > 1e-6 || rib0 > 1e-6) {
        const res = G.filletJunctionBy(cur.shape, col.piece, j.before, (m) => (axisR(m) <= D / 2 + col.hit.t * ta + 0.05 ? Rf : rib0));
        if (res.shape !== cur.shape) { cur = { ...cur, shape: res.shape }; st.bodies.set(j.id, cur); }
        if (res.warning) warnings.push(res.warning);
      }
      K.del(col.piece);
      let shape = cur.shape;
      // the hole (void of revolution): entrance at the top of the step / boss, drafts and fillets
      const z0 = step === "out" ? -F : step === "in" ? F : 0;
      const t2 = Math.tan(rad(g("A2"))), R3 = g("R3"), R4 = g("R4");
      const flare = (rr) => [[0, z0 - 1], [B / 2 + rr + 1, z0 - 1], [B / 2 + rr + 1, z0]];
      let hole = null;
      if (side === 1) {
        const type = pinned ? "blind" : f.s1Type || "simple";
        const ext = exitDistance(col.body.shape, top, dir, col.hit.t + 1e-3, big);
        if (type === "blind") {
          const E = g("E");
          if (!(E > 0)) throw new Error("Side 1: the hole depth must be positive");
          hole = G.revolveRounded(top, dir, [...flare(R3), [B / 2, z0], [B / 2 - E * t2, z0 + E], [0, z0 + E]], [0, 0, 0, R3, R4, 0]);
        } else if (type === "counterbore") {
          const A = g("A"), E = g("E"), t1 = Math.tan(rad(g("A1"))), R1 = g("R1"), R2 = g("R2");
          if (!(A > B)) throw new Error("Side 1: the counterbore diameter must be larger than the hole diameter");
          const aE = A / 2 - (ext - (z0 + E)) * t1;
          if (!(aE > B / 2)) throw new Error("Side 1: the counterbore draft is too large");
          hole = G.revolveRounded(top, dir, [...flare(R3), [B / 2, z0], [B / 2 - E * t2, z0 + E], [aE, z0 + E], [A / 2, ext], [A / 2 + R1 + 1, ext], [A / 2 + R1 + 1, ext + 1], [0, ext + 1]],
            [0, 0, 0, R3, R4, R2, R1, 0, 0, 0]);
        } else if (type === "countersink") {
          const A = g("A"), cs = g("Cs", 90);
          if (!(A > B)) throw new Error("Side 1: the countersink diameter must be larger than the hole diameter");
          const zc = ext - (A / 2 - B / 2) / Math.tan(rad(cs / 2));
          hole = G.revolveRounded(top, dir, [...flare(R3), [B / 2, z0], [B / 2, Math.max(z0, zc)], [A / 2, ext], [A / 2, ext + 1], [0, ext + 1]], [0, 0, 0, R3, 0, 0, 0, 0]);
        } else hole = G.revolveRounded(top, dir, [...flare(R3), [B / 2, z0], [B / 2 - (ext - z0) * t2, ext + 1], [0, ext + 1]], [0, 0, 0, R3, 0, 0]);
      } else {
        const Gd = g("G");
        if (!(Gd > 0)) throw new Error("Side 2: the hole depth must be positive");
        if (pinned) {
          const pin = G.revolveRounded(top, V.mul(dir, -1), [[0, -z0 - 0.01], [B / 2, -z0 - 0.01], [B / 2 - Gd * t2, -z0 + Gd], [0, -z0 + Gd]], [0, 0, R3, 0]);
          shape = K.fuse(shape, pin); K.del(pin);
        } else {
          const bot = B / 2 - Gd * t2;
          const tip = (f.bossType || "flat") === "tip" ? bot / Math.tan(rad(59)) : 0;
          hole = G.revolveRounded(top, dir, tip ? [...flare(R3), [B / 2, z0], [bot, z0 + Gd], [0, z0 + Gd + tip]] : [...flare(R3), [B / 2, z0], [bot, z0 + Gd], [0, z0 + Gd]],
            tip ? [0, 0, 0, R3, 0, 0] : [0, 0, 0, R3, R4, 0]);
        }
      }
      if (hole) { const sh = K.cut(shape, hole); K.del(hole); if (shape !== cur.shape) K.del(shape); shape = sh; }
      if (shape !== cur.shape) st.bodies.set(j.id, { ...cur, shape });
    }
  }
  if (!made) throw new Error("Select a sketch point between two solid bodies");
  return { affected: [...affected], ...(warnings.length ? { warning: warnings[0] } : {}) };
}

// ---------------------------------------------------------------- Lip
function edgeSegs2d(shape, refs, pl) {
  const T = K.topoOf(shape);
  const raw = [];
  for (const er of refs) {
    const idx = M.locateEdge(shape, er);
    const ti = idx >= 0 ? T.edges[idx] : null;
    if (!ti) throw new Error("Missing Path");
    if (ti.type === "LINE") raw.push({ kind: "line", a: K.toLocal(pl, ti.s), b: K.toLocal(pl, ti.t) });
    else if (ti.type === "CIRCLE" && ti.r > 0) {
      const c = K.toLocal(pl, ti.c), s = K.toLocal(pl, ti.s);
      const sw = (V.dot(V.norm(ti.a), pl.n) >= 0 ? 1 : -1) * (ti.len / ti.r);
      raw.push({ kind: "arc", c, r: ti.r, t0: Math.atan2(s[1] - c[1], s[0] - c[0]), sw, full: Math.abs(Math.abs(sw) - 2 * Math.PI) < 1e-6 });
    } else throw new Error("The lip path must be made of straight or circular edges");
  }
  return raw;
}

/** Direction of a pull-direction ref (plane: its normal, face: its normal, edge / sketch line: its direction). */
function pullDir(st, ref) {
  if (!ref) return null;
  try {
    if (ref.kind === "origin" || ref.kind === "cplane") { const pl = M.resolvePlane(ref, st); return pl ? V.norm(pl.n) : null; }
    if (ref.kind === "axis") return V.norm(M.axisFromRef(st, ref.axis).d);
    if (ref.body && Array.isArray(ref.n)) {
      const b = st.bodies.get(ref.body);
      const i = b ? M.locateFace(b.shape, ref) : -1;
      const fi = i >= 0 ? K.topoOf(b.shape).faces[i] : null;
      return V.norm(fi && fi.n ? fi.n : ref.n);
    }
    if (ref.body) { const b = st.bodies.get(ref.body); const i = b ? M.locateEdge(b.shape, ref) : -1; const ti = i >= 0 ? K.topoOf(b.shape).edges[i] : null; return ti ? V.norm(V.sub(ti.t, ti.s)) : null; }
  } catch { return null; }
  return null;
}
/** World point / plane of an extent ref: {p} or {p, n}. */
function extentObj(st, ref) {
  if (!ref) return null;
  try {
    if (ref.kind === "origin" || ref.kind === "cplane") { const pl = M.resolvePlane(ref, st); return pl ? { p: pl.o, n: V.norm(pl.n) } : null; }
    if (ref.kind === "sketchPoint") { const s = st.sketches.get(ref.sketch); const q = s && s.sk.points[ref.point]; return q ? { p: K.toWorld(s.plane, q.x, q.y) } : null; }
    if (Array.isArray(ref.p) && Array.isArray(ref.n)) return { p: ref.p, n: V.norm(ref.n) };
    if (Array.isArray(ref.p)) return { p: ref.p };
  } catch { return null; }
  return null;
}
/** How far to extend a path end (point p, outward tangent t) to reach an extent object (0 = not ahead). */
function extentLen(obj, p, t) {
  if (!obj) return 0;
  if (obj.n) { const dn = V.dot(t, obj.n); if (Math.abs(dn) < 1e-9) return 0; const d = V.dot(V.sub(obj.p, p), obj.n) / dn; return d > 0 ? d : 0; }
  const d = V.dot(V.sub(obj.p, p), t);
  return d > 0 ? d : 0;
}

export function applyLip(st, f, P, doc) {
  const edges = f.edges || [];
  if (!edges.length) throw new Error("Missing Path");
  const bid = edges[0].body;
  const b = st.bodies.get(bid);
  if (!b) throw new Error("Missing Path");
  const A = fv(P, f, "height"), Wd = fv(P, f, "width"), E = fv(P, f, "clearance");
  const Cs = fv(P, f, "shoulder"), Dr = fv(P, f, "reveal");
  if (!(A > 0 && Wd > 0)) throw new Error("The height and width must be positive");
  if (Cs < 0 || Dr < 0) throw new Error("The shoulder width and reveal height must not be negative");
  const T = K.topoOf(b.shape);
  const ends = edges.map((er) => { const i = M.locateEdge(b.shape, er); return i >= 0 ? T.edges[i] : null; });
  if (ends.some((x) => !x)) throw new Error("Missing Path");
  let N, origin, gi = -1;
  if (f.guideType === "pull") {
    // Pull Direction guide: the lip rises along the pull direction from the plane of the path
    N = pullDir(st, f.pull);
    if (!N) throw new Error("missing pull direction");
    origin = ends[0].s;
    if (ends.some((m) => Math.abs(V.dot(V.sub(m.s, origin), N)) > 1e-4 || Math.abs(V.dot(V.sub(m.t, origin), N)) > 1e-4)) throw new Error("The path must lie in a plane perpendicular to the pull direction");
  } else {
    // Face Guide: the given face, else the planar face next to the path that holds every path edge
    if (f.guide) gi = M.locateFace(b.shape, f.guide);
    if (gi < 0) {
      const e0 = M.locateEdge(b.shape, edges[0]);
      for (const fi of (e0 >= 0 ? T.edges[e0].faces : [])) {
        const F = T.faces[fi];
        if (F.type !== "PLANE") continue;
        if (ends.every((m) => Math.abs(V.dot(V.sub(m.s, F.c), F.n)) < 1e-5 && Math.abs(V.dot(V.sub(m.t, F.c), F.n)) < 1e-5)) { gi = fi; break; }
      }
    }
    if (gi < 0 || T.faces[gi].type !== "PLANE") throw new Error("Missing Guide Face");
    N = V.norm(T.faces[gi].n);
    origin = T.faces[gi].c;
  }
  const pl = { o: origin, x: G.perp(N), n: N };
  const { segs, closed } = G.chain2d(edgeSegs2d(b.shape, edges, pl));
  // the band lies on the guide face's side of the path (pull direction: the side with material under the plane)
  const sl = segs.reduce((x, y) => (G.segLen(y) > G.segLen(x) ? y : x));
  const m = G.chainPoint([sl], 0.5);
  const beside = (sgn) => W(pl, v2.add(m.p, v2.mul(v2.left(m.t), sgn * Math.min(Wd, 0.2))));
  let side = 1;
  if (gi >= 0) {
    const [gface] = K.facesAt(b.shape, [gi]);
    const pr = K.pointProbe(beside(1));
    try { side = pr.dist(gface) < 1e-4 ? 1 : -1; } finally { pr.delete(); K.del(gface); }
  } else side = G.inside(b.shape, V.sub(beside(1), V.mul(N, 0.01))) ? 1 : -1;
  // open paths: Extent 1 / Extent 2 lengthen the ends up to the selected objects
  let ext = [0, 0];
  if (!closed) {
    const s0 = segs[0], s1 = segs[segs.length - 1];
    const dir3 = (q) => V.norm(V.add(V.mul(pl.x, q[0]), V.mul(K.planeY(pl), q[1])));
    ext = [extentLen(extentObj(st, f.extent1), W(pl, G.segStart(s0)), dir3(v2.mul(G.segTan(s0, 0), -1))), extentLen(extentObj(st, f.extent2), W(pl, G.segEnd(s1)), dir3(G.segTan(s1, 1)))];
  }
  const band = (a, c, h, start) => {
    const [o1, o2] = side > 0 ? [a, c] : [-c, -a];
    return G.prismUnion(G.bandFaces(pl, segs, o1, o2, bandExt(segs, Math.max(Math.abs(a), Math.abs(c)), ext, closed)), V.mul(N, h), start);
  };
  const type = f.lipType || "lip";
  const affected = new Set();
  let warning;
  const bodies = solidBodies(st, doc);
  const lo = Cs, hi = Cs + Wd; // the lip / groove band: Shoulder Width C from the path, Width B wide
  if (type === "lip" || type === "both") {
    let tool = band(lo, hi, A);
    const a1 = fv(P, f, "draft1"), a2 = fv(P, f, "draft2");
    if (Math.abs(a1) > 1e-6 || Math.abs(a2) > 1e-6) {
      const pe = G.chainEdges(pl, segs);
      const comp = K.R.makeCompound(pe);
      const npl = { o: origin, n: N };
      try {
        const near = (fi) => { const pr = K.pointProbe(fi.c); try { return pr.dist(comp) < Cs + Wd * 0.5; } finally { pr.delete(); } };
        const lateral = (fi) => (fi.type === "PLANE" && Math.abs(V.dot(fi.n, N)) < 1e-6) || (fi.type === "CYLINDRE" && fi.a && Math.abs(Math.abs(V.dot(V.norm(fi.a), N)) - 1) < 1e-6);
        for (const [ang, pick] of [[a2, (fi) => lateral(fi) && near(fi)], [a1, (fi) => lateral(fi) && !near(fi)]]) {
          if (!(Math.abs(ang) > 1e-6)) continue;
          let v0 = 0;
          try { v0 = K.volumeOf(tool); } catch { v0 = 0; }
          let d = draftWhere(tool, pick, ang, npl);
          if (d) { let v1 = 0; try { v1 = K.volumeOf(d); } catch { v1 = 0; } if (v1 > v0) { K.del(d); d = draftWhere(tool, pick, -ang, npl); } }
          if (d) { K.del(tool); tool = d; } else warning = "The draft could not be applied";
        }
      } finally { K.del(...pe, comp); }
    }
    const j = joinTool(st, f, tool, [{ id: bid, shape: b.shape }]);
    j.ids.forEach((x) => affected.add(x));
    K.del(tool);
    // Reveal Height: the shoulder outside the lip is lowered by D (a visible gap line when the parts meet)
    if (Dr > 1e-6) {
      const rv = band(hi, hi + 1000, Dr + 0.01, V.mul(N, -Dr));
      const cur = st.bodies.get(bid);
      const s = K.cut(cur.shape, rv);
      K.del(rv);
      st.bodies.set(bid, { ...cur, shape: s, from: f.id });
    }
  }
  if (type === "groove") {
    // Groove Shoulder: Include keeps the shoulder of width C between the path and the groove
    const g0 = f.grooveShoulder === "exclude" ? 0 : lo;
    const tool = band(g0, hi, A + 0.01, V.mul(N, -A)); // overshoots the guide face (no coplanar boolean faces)
    const s = K.cut(st.bodies.get(bid).shape, tool);
    st.bodies.set(bid, { ...st.bodies.get(bid), shape: s, from: f.id });
    affected.add(bid);
    st._tool = tool;
  }
  if (type === "both") {
    // groove in the mating body: the one resting on the band where the lip stands
    const probe = band(lo, hi, 0.02, V.mul(N, -0.01));
    let mate = null;
    try { mate = bodies.find((o) => o.id !== bid && G.dist(o.shape, probe) < 1e-4) || null; } finally { K.del(probe); }
    if (!mate) warning = "No mating body rests on the lip: only the lip was created";
    else {
      // groove dimensions follow the lip: clearance E all round; Exclude Groove Shoulder opens it to the path
      const g0 = f.grooveShoulder === "exclude" ? -E : lo - E;
      const tool = band(g0, hi + E, A + E + 0.01, V.mul(N, -0.01));
      const s = K.cut(mate.shape, tool);
      st.bodies.set(mate.id, { ...st.bodies.get(mate.id), shape: s, from: f.id });
      affected.add(mate.id);
      st._tool = tool;
    }
  }
  return { affected: [...affected], ...(warning ? { warning } : {}) };
}

// ---------------------------------------------------------------- Rest
/** Column along N (through +-big) over faces: their projection footprint (faces parallel to N are skipped). */
function footprintColumn(shape, faceIdx, N, big) {
  const T = K.topoOf(shape);
  const idx = (faceIdx || T.faces.map((_, i) => i)).filter((i) => {
    const fi = T.faces[i];
    if (!fi) return false;
    if (fi.type === "PLANE") return Math.abs(V.dot(fi.n, N)) > 1e-6;
    if (fi.type === "CYLINDRE" && fi.a) return Math.abs(Math.abs(V.dot(V.norm(fi.a), N)) - 1) > 1e-6;
    return true;
  });
  const faces = K.facesAt(shape, idx);
  const parts = [];
  try {
    for (const fc of faces) {
      try {
        const p = K.prism(fc, V.mul(N, 2 * big));
        const t = K.translated(p, V.mul(N, -big));
        K.del(p);
        if (Math.abs(K.volumeOf(t)) > 1e-9) parts.push(t); else K.del(t);
      } catch { /* degenerate projection */ }
    }
  } finally { K.del(...faces); }
  return G.fuseAll(parts);
}
/** Distance along S from the plane point o to an extent object (plane, face or body point). */
function objectReach(st, ref, o, S) {
  let p = null;
  try {
    if (ref && (ref.kind === "cplane" || ref.kind === "origin")) { const pl = M.resolvePlane(ref, st); p = pl && pl.o; }
    else if (ref && Array.isArray(ref.p)) p = ref.p;
  } catch { p = null; }
  if (!p) throw new Error("Select body, face, or plane to extend to");
  const r = Math.abs(V.dot(V.sub(p, o), S));
  if (!(r > 1e-6)) throw new Error("The object is on the landing plane");
  return r;
}

export function applyRest(st, f, P, doc) {
  const T = fv(P, f, "thickness");
  if (!(T > 0)) throw new Error("The thickness must be positive");
  if (!(f.profiles || []).length) throw new Error("missing profiles");
  const b = st.bodies.get(f.body);
  if (!b) throw new Error("Select a solid body for the rest feature");
  const groups = M.profileGroups(st, f.profiles);
  const off = fv(P, f, "offset"), alpha = fv(P, f, "draft"), alpha2 = fv(P, f, "draft2");
  const big = M.modelSize(st);
  let shape = b.shape;
  let shown = null;
  const owned = [];
  for (const g of groups) {
    const pl0 = g.sketch.plane;
    const N = V.norm(pl0.n);
    const pl = { ...pl0, o: V.add(pl0.o, V.mul(N, off)) };
    // material side: the direction from the landing plane towards the body
    let cx = 0, cy = 0, cn = 0;
    for (const r of g.regions) for (const q of r.outer.poly) { cx += q[0]; cy += q[1]; cn++; }
    const c = K.toWorld(pl, cx / cn, cy / cn);
    const hp = G.rayHit([{ id: f.body, shape }], c, N, big), hm = G.rayHit([{ id: f.body, shape }], c, V.mul(N, -1), big);
    const inP = G.inside(shape, c);
    let s = inP ? (hm && !hp ? 1 : -1) : hp && hm ? (hp.t < hm.t ? 1 : -1) : hp ? 1 : -1;
    if (f.flip) s = -s;
    const S = V.mul(N, s);
    // top of the landing (where the thickness starts) depends on the thickness direction
    const dirn = f.direction || "side1";
    const topOff = dirn === "side2" ? -T : dirn === "sym" ? -T / 2 : 0; // along S
    const top = { ...pl, o: V.add(pl.o, V.mul(S, topOff)) };
    // Side 1: removal above the landing (All, or To Object); Side 2: how far the rest backs the landing
    const reach = f.extent === "object" ? objectReach(st, f.object, top.o, S) : big;
    const reach2 = f.extent2 === "object" ? objectReach(st, f.object2, top.o, S) : big;
    const verts = g.sketch.regions.vertices;
    const prism = (len, taper) => (Math.abs(taper) > 1e-6 ? K.extrudeDrawing(K.regionsDrawing(g.regions, verts), top, 0, len, taper) : K.extrudeRegions(g.regions, verts, top, 0, len));
    // Top Faces: only the areas over the selected faces of the body take the rest
    let foot = null;
    if ((f.topFaces || []).length) {
      const idx = f.topFaces.map((fr) => M.locateFace(b.shape, fr)).filter((i) => i >= 0);
      if (!idx.length) throw new Error("Select Landing faces for the rest feature");
      foot = footprintColumn(b.shape, idx, N, big);
      if (!foot) throw new Error("The top faces do not face the landing");
      owned.push(foot);
    }
    const clip = (x) => { if (!foot) return x; const y = K.intersect(x, foot); K.del(x); return y; };
    let cutTool = clip(prism(-s * reach, alpha));
    let removed = 0;
    try { const x = K.intersect(shape, cutTool); removed = K.isEmptyShape(x) ? 0 : K.volumeOf(x); K.del(x); } catch { removed = 0; }
    let backing;
    if (removed > 1e-6) {
      // the landing cuts the wall: flatten it and back it with a plate of the rest thickness
      backing = clip(prism(s * Math.min(T, reach2), alpha2));
    } else {
      // the landing is off the body: fill from the landing to the nearest faces; Side 2 All = through the body
      const far = G.extentAlong(shape, top.o, S)[1];
      if (!(far > 1e-6)) throw new Error("The rest does not reach a face of the body");
      const col = clip(prism(s * (f.extent2 === "object" ? reach2 : far), alpha2));
      const cutc = K.cut(col, shape);
      K.del(col);
      const seed = K.extrudeRegions(g.regions, verts, top, 0, s * 1e-3);
      let pieces;
      try { pieces = G.piecesTouching(cutc, [seed]); } finally { K.del(seed); }
      if (!pieces.length) throw new Error("The rest does not reach a face of the body");
      backing = G.fuseAll(pieces);
    }
    // Trim: the part of the rest that sticks out of the body's outline goes away
    if (f.trim !== false) {
      const hull = footprintColumn(b.shape, null, N, big);
      if (hull) { const y = K.intersect(backing, hull); K.del(backing, hull); backing = y; }
    }
    const cutRes = removed > 1e-6 ? K.cut(shape, cutTool) : null;
    const base = cutRes || shape;
    try {
      if (K.isEmptyShape(backing)) throw new Error("The rest is outside the selected top faces");
      if (!M.touches(base, backing)) throw new Error("The rest profile must reach the walls of the body");
      const n = K.fuse(base, backing);
      if (shape !== b.shape) K.del(shape);
      shape = n;
    } finally { K.del(cutRes, backing); }
    if (!shown) shown = cutTool; else K.del(cutTool);
  }
  K.del(...owned);
  st.bodies.set(f.body, { ...b, shape, from: f.id });
  if (shown) st._tool = shown;
  return { affected: [f.body] };
}

// ---------------------------------------------------------------- Snap Fit
/** Sketch points of a snap fit: the selected ones (Manual) or every point of the chosen sketch (Automatic). */
function snapPoints(st, f) {
  if (f.selectMode === "auto") {
    const s = f.autoSketch && st.sketches.get(f.autoSketch);
    if (!s) throw new Error("Select sketch to place snap fit");
    const refs = Object.values(s.sk.curves).filter((cv) => cv && cv.type === "point" && !cv.cons).map((cv) => ({ sketch: f.autoSketch, point: cv.p }));
    return sketchPointsW(st, refs);
  }
  return sketchPointsW(st, f.points);
}
/** Catch direction of an Aligned snap fit at p (in the sketch plane): towards a point, across a line, along a plane normal. */
function alignDir(st, ref, p, pl) {
  const N = V.norm(pl.n);
  const flat = (v) => { const q = V.sub(v, V.mul(N, V.dot(v, N))); return V.len(q) > 1e-9 ? V.norm(q) : null; };
  if (!ref) return null;
  try {
    if (ref.kind === "sketchPoint") { const s = st.sketches.get(ref.sketch); const q = s && s.sk.points[ref.point]; return q ? flat(V.sub(K.toWorld(s.plane, q.x, q.y), p)) : null; }
    if (ref.kind === "vertex" && Array.isArray(ref.p)) return flat(V.sub(ref.p, p));
    if (ref.kind === "origin" || ref.kind === "cplane") { const q = M.resolvePlane(ref, st); return q ? flat(q.n) : null; }
    if (ref.kind === "axis") return flat(V.cross(N, M.axisFromRef(st, ref.axis).d));
    if (ref.kind === "sketchLine") {
      const s = st.sketches.get(ref.sketch); const cv = s && s.sk.curves[ref.curve];
      if (!cv || cv.type !== "line") return null;
      const a = s.sk.points[cv.p1], b = s.sk.points[cv.p2];
      return flat(V.cross(N, V.sub(K.toWorld(s.plane, b.x, b.y), K.toWorld(s.plane, a.x, a.y))));
    }
    if (ref.body && Array.isArray(ref.n)) return flat(ref.n);
    if (ref.body) { const b = st.bodies.get(ref.body); const i = b ? M.locateEdge(b.shape, ref) : -1; const ti = i >= 0 ? K.topoOf(b.shape).edges[i] : null; return ti ? flat(V.cross(N, V.sub(ti.t, ti.s))) : null; }
  } catch { return null; }
  return null;
}

export function applySnapFit(st, f, P, doc) {
  const pts = snapPoints(st, f);
  if (!pts.length) throw new Error("Select sketch point to place a snap fit");
  const big = M.modelSize(st);
  const A = fv(P, f, "hA"), Bl = fv(P, f, "hB"), C = fv(P, f, "hC"), Dw = fv(P, f, "hD"), Ew = fv(P, f, "hE");
  const F = fv(P, f, "hF"), H = fv(P, f, "hH"), a1 = fv(P, f, "hAlpha1", 90), a2 = fv(P, f, "hAlpha2", 30);
  const J = fv(P, f, "gJ"), L = fv(P, f, "gL"), Mc = fv(P, f, "gM"), gR = fv(P, f, "gR");
  const rootR = fv(P, f, "rootR"), U = fv(P, f, "uU"), Vu = fv(P, f, "uV"), RU = fv(P, f, "uRU");
  if (!(A > 0 && Bl > 0 && C > 0 && Dw > 0 && Ew > 0 && F > 0 && H > 0)) throw new Error("The hook dimensions must be positive");
  if (!(a2 > 0 && a2 < 90 && a1 > 0 && a1 <= 90)) throw new Error("The hook angles must be between 0 and 90 deg");
  const distance = f.bottomExtent === "distance";
  const depth = distance ? fv(P, f, "depth") : 0;
  if (distance && !(depth > 0)) throw new Error("The depth must be positive");
  const type = f.snapType || "parallel";
  const rotType = f.rotationType || "uniform";
  const affected = new Set();
  const warnings = [];
  pts.forEach((pt, ip) => {
    const up = V.mul(pt.n, f.flip ? -1 : 1); // towards the hook body
    const Y = K.planeY(pt.pl);
    let c = null;
    if (rotType === "aligned") {
      c = alignDir(st, f.align, pt.p, pt.pl);
      if (!c) throw new Error("Missing rotation direction");
    } else {
      let deg = fv(P, f, "rotation");
      if (rotType === "independent" && Array.isArray(f.rotations) && f.rotations[ip] !== undefined && f.rotations[ip] !== "") {
        try { deg = P.eval(f.rotations[ip], "angle"); } catch { throw new Error(`Snap fit ${ip + 1}: invalid rotation angle`); }
      }
      const r = rad(deg);
      c = V.norm(V.add(V.mul(pt.pl.x, Math.cos(r)), V.mul(Y, Math.sin(r))));
    }
    if (f.alignFlip) c = V.mul(c, -1);
    const w = V.norm(V.cross(up, c)); // width direction
    const bodies = solidBodies(st, doc);
    const hookHit = G.rayHit(bodies, pt.p, up, big);
    if (!hookHit && !distance) throw new Error("Select target body to place a snap fit");
    // the beam runs B past the sketch plane (into the mating body); its root goes up to the hook body (To Next) or Depth
    const zTip = -Bl; // along "up" from the sketch point
    const at = (cc, ww, z) => V.add(pt.p, V.add(V.mul(c, cc), V.add(V.mul(w, ww), V.mul(up, z))));
    const h1 = distance ? depth : hookHit.t; // root level
    const zFar = distance ? depth : hookHit.t + big * 0.25;
    // beam: thickness A at the plane -> C at the hook (along c, catch face at c = 0), width D -> E (along w)
    const sideA = G.polyPrism([at(0, -Dw, zTip), at(0, -Dw, zFar), at(-A, -Dw, zFar), at(-A, -Dw, 0), at(-C, -Dw, zTip)], V.mul(w, 2 * Dw));
    const sideB = G.polyPrism([at(-A - 1, -Ew / 2, zTip), at(-A - 1, Ew / 2, zTip), at(-A - 1, Dw / 2, 0), at(-A - 1, Dw / 2, zFar), at(-A - 1, -Dw / 2, zFar), at(-A - 1, -Dw / 2, 0)], V.mul(c, A + 2));
    const beam = K.intersect(sideA, sideB);
    K.del(sideA, sideB);
    // hook at the tip: entry ramp (a2 from the beam axis), hook length H, exit face (a1)
    const sr = F / Math.tan(rad(a2));
    const se = a1 >= 89.999 ? 0 : F / Math.tan(rad(a1));
    const hp = [[0, 0], [F, Math.min(sr, H)], [F, H], [0, H + se]].map(([cc, s]) => at(cc, -Ew / 2, zTip + s));
    const parts = [beam, G.polyPrism(hp, V.mul(w, Ew))];
    // Ribs: two gussets behind the beam root (width M)
    if (f.hookRibs) {
      const Mr = Math.min(fv(P, f, "ribM"), Dw / 2);
      if (!(Mr > 0)) throw new Error("The rib width must be positive");
      for (const sgn of [-1, 1]) {
        const w0 = sgn > 0 ? Dw / 2 - Mr : -Dw / 2;
        parts.push(G.polyPrism([at(-A + 1e-3, w0, 0), at(-A + 1e-3, w0, zFar), at(-2 * A, w0, zFar), at(-2 * A, w0, h1)], V.mul(w, Mr)));
      }
    }
    const tool0 = G.fuseAll(parts);
    let tool;
    if (distance) tool = tool0;
    else {
      // to next: keep the part between the tip and the hook body's face
      const hookBody0 = bodies.find((x) => x.id === hookHit.id);
      const cut = K.cut(tool0, hookBody0.shape);
      K.del(tool0);
      const seed = K.R.makeVertex(at(-C / 2, 0, zTip));
      let pieces;
      try { pieces = G.piecesTouching(cut, [seed]); } finally { K.del(seed); }
      if (!pieces.length) throw new Error("The snap fit does not reach the hook body");
      tool = G.fuseAll(pieces);
    }
    const targets = hookHit ? bodies.filter((x) => x.id === hookHit.id) : bodies;
    const j = joinTool(st, f, tool, targets);
    j.ids.forEach((x) => affected.add(x));
    let cur = st.bodies.get(j.id);
    if (rootR > 1e-6) {
      const res = G.filletJunction(cur.shape, tool, j.before, rootR);
      if (res.shape !== cur.shape) { cur = { ...cur, shape: res.shape }; st.bodies.set(j.id, cur); }
      if (res.warning) warnings.push(res.warning);
    }
    K.del(tool);
    // Hook Undercut: a U-shaped relief slot (width U, length V, corner radius RU) in the hook body around the beam root
    if (U > 1e-6 && Vu > 1e-6) {
      const pl = { o: at(0, 0, h1 - 0.01), x: c, n: up };
      const slot = G.prismRounded(pl, [[0, -Dw / 2 - U], [0, -Dw / 2], [-A, -Dw / 2], [-A, Dw / 2], [0, Dw / 2], [0, Dw / 2 + U], [-A - U, Dw / 2 + U], [-A - U, -Dw / 2 - U]],
        [0, 0, 0, 0, 0, 0, RU, RU], V.mul(up, Vu + 0.01));
      const s = K.cut(cur.shape, slot);
      K.del(slot);
      st.bodies.set(j.id, { ...cur, shape: s, from: f.id });
    }
    // catch side: the body below the sketch plane, around the hook
    const others = solidBodies(st, doc).filter((x) => x.id !== j.id);
    const mateHit = G.rayHit(others, pt.p, V.mul(up, -1), big);
    const mate = mateHit && others.find((x) => x.id === mateHit.id);
    if (!mate) { warnings.push("No body on the groove side of the snap fit"); return; }
    if (type === "loop") {
      // a loop (frame) on the mating body: two posts beside the hook and a bar the hook catches on
      const zb0 = zTip + H + se + J, zb1 = zb0 + Math.max(C, 1);
      const posts = [];
      for (const sgn of [-1, 1]) {
        const ww0 = sgn * (Ew / 2 + L), ww1 = sgn * (Ew / 2 + L + Math.max(C, 1));
        posts.push(G.polyPrism([at(0, ww0, zb1), at(0, ww1, zb1), at(0, ww1, -big * 0.25), at(0, ww0, -big * 0.25)], V.mul(c, F + J)));
      }
      const bar = G.polyPrism([at(0, -(Ew / 2 + L + Math.max(C, 1)), zb0), at(0, Ew / 2 + L + Math.max(C, 1), zb0), at(0, Ew / 2 + L + Math.max(C, 1), zb1), at(0, -(Ew / 2 + L + Math.max(C, 1)), zb1)], V.mul(c, F + J));
      const loop0 = G.fuseAll([...posts, bar]);
      const lc = K.cut(loop0, mate.shape);
      K.del(loop0);
      // keep the parts in front of the mating body (posts end on its first face, nothing pokes out behind it)
      let lp;
      lp = G.piecesTouching(lc, [mate.shape]).filter((p) => { const ok = G.extentAlong(p, pt.p, V.mul(up, -1))[1] < big * 0.25 - 1e-3; if (!ok) K.del(p); return ok; });
      if (!lp.length) { warnings.push("The loop does not reach the mating body"); return; }
      const loop = G.fuseAll(lp);
      try {
        const jj = joinTool(st, f, loop, [mate]);
        jj.ids.forEach((x) => affected.add(x));
      } catch (e) { warnings.push(String(e.message || e)); }
      K.del(loop);
    } else {
      // groove (Parallel: a pocket of depth J behind the hook; Perpendicular: a window through the wall), corner radius R
      const gd = type === "perpendicular" ? big * 0.25 : F + J;
      const g0 = zTip - Mc, g1 = zTip + H + se + Mc, hw = Ew / 2 + L;
      const pl = { o: at(-0.01, 0, 0), x: w, n: c };
      const groove = G.prismRounded(pl, [[-hw, g0], [hw, g0], [hw, g1], [-hw, g1]], [gR, gR, gR, gR], V.mul(c, gd + 0.01));
      const ms = st.bodies.get(mate.id);
      const s = K.cut(ms.shape, groove);
      st.bodies.set(mate.id, { ...ms, shape: s, from: f.id });
      affected.add(mate.id);
      K.del(groove);
    }
  });
  return { affected: [...affected], ...(warnings.length ? { warning: warnings[0] } : {}) };
}

// ---------------------------------------------------------------- expression fields (model parameters)
const Lk = "length", Ak = "angle", Nk = "none";
const sideFields = (k) => ({
  ...Object.fromEntries(["D", "B", "C", "F", "R", "O", "R3", "R4", "R5", "R6", "R7", "RibT", "RibK", "RibL", "RibM", "RibRR", "RibBase", "RibOuter", "WebT", "WebDepth"].map((x) => [`${k}${x}`, Lk])),
  ...Object.fromEntries(["Draft", "A2", "A3", "RibDraft", "RibRot", "RibTotal", "RibB1", "RibB2", "WebTotal", "WebRot", "WebDraft"].map((x) => [`${k}${x}`, Ak])),
  [`${k}RibN`]: Nk, [`${k}WebN`]: Nk,
});
/** FIELDS of each plastic feature type (expression-valued inputs -> model parameters d1, d2 ...). */
export const FIELDS = {
  rib: { thickness: Lk, depth: Lk, draft: Ak, fillet: Lk },
  web: { thickness: Lk, depth: Lk, draft: Ak, fillet: Lk },
  emboss: { depth: Lk, hdist: Lk, vdist: Lk, angle: Ak },
  boss: { offsetPos: Lk, ...sideFields("s1"), ...sideFields("s2"), s1E: Lk, s1A: Lk, s1R1: Lk, s1R2: Lk, s1Cs: Ak, s1A1: Ak, s2G: Lk },
  lip: { height: Lk, width: Lk, clearance: Lk, shoulder: Lk, reveal: Lk, draft1: Ak, draft2: Ak },
  rest: { thickness: Lk, offset: Lk, draft: Ak, draft2: Ak },
  snapFit: {
    rotation: Ak, hA: Lk, hB: Lk, hC: Lk, hD: Lk, hE: Lk, hF: Lk, hH: Lk, hAlpha1: Ak, hAlpha2: Ak,
    gJ: Lk, gL: Lk, gM: Lk, gR: Lk, depth: Lk, rootR: Lk, uU: Lk, uV: Lk, uRU: Lk, ribM: Lk,
  },
};
