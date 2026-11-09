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
      const nplane = { o: top ? midW : V.add(midW, V.mul(Dd, reach)), n: Dd };
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
        if ((v1 > v0) === top) { K.del(dr); dr = draftWhere(slab, side, -alpha, nplane); }
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
      if (res.warning) warning = res.warning;
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
function columnToNext(bodies, top, dir, profile, big, what) {
  const hit = G.rayHit(bodies, top, dir, big);
  if (!hit) return null;
  const L = hit.t + big * 0.25;
  const col = G.revolveRZ(top, dir, profile(L));
  const body = bodies.find((b) => b.id === hit.id);
  const cut = K.cut(col, body.shape);
  K.del(col);
  const seed = K.R.makeVertex(V.add(top, V.mul(dir, 1e-4)));
  let pieces;
  try { pieces = G.piecesTouching(cut, [seed]); } finally { K.del(seed, cut); }
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
export function applyBoss(st, f, P, doc) {
  const pts = sketchPointsW(st, f.points);
  if (!pts.length) throw new Error("Select sketch point to place a boss");
  const big = M.modelSize(st);
  const affected = new Set();
  const warnings = [];
  let made = 0;
  for (const pt of pts) {
    for (const side of [1, 2]) {
      const k = `s${side}`;
      const D = fv(P, f, `${k}D`), B = fv(P, f, `${k}B`);
      if (!(D > B && B > 0)) throw new Error(`Side ${side}: the boss diameter must be larger than the hole diameter`);
      const alpha = fv(P, f, `${k}Draft`), O = fv(P, f, `${k}O`), Rf = fv(P, f, `${k}R`);
      const dir = V.mul(pt.n, (side === 1 ? 1 : -1) * (f.flip ? -1 : 1));
      const top = V.add(pt.p, V.mul(dir, O));
      const bodies = solidBodies(st, doc);
      const ta = Math.tan(rad(alpha));
      const col = columnToNext(bodies, top, dir, (L) => [[0, 0], [D / 2, 0], [D / 2 + L * ta, L], [0, L]], big, "boss");
      if (!col) { warnings.push(`Side ${side} has no body`); continue; }
      made++;
      const j = joinTool(st, f, col.piece, [col.body]);
      affected.add(j.id);
      let cur = st.bodies.get(j.id);
      if (Rf > 1e-6) {
        const res = G.filletJunction(cur.shape, col.piece, j.before, Rf);
        if (res.shape !== cur.shape) { cur = { ...cur, shape: res.shape }; st.bodies.set(j.id, cur); }
        if (res.warning) warnings.push(res.warning);
      }
      K.del(col.piece);
      let shape = cur.shape;
      const swap = (s) => { if (s !== shape) { shape = s; } };
      // step: a ring standing out of the boss top (Out) or a recess in it (In)
      const step = f[`${k}Step`] || "none";
      if (step !== "none") {
        const C = fv(P, f, `${k}C`), F = fv(P, f, `${k}F`);
        if (!(C > B && F > 0)) throw new Error(`Side ${side}: the step must be wider than the hole and have a depth`);
        if (step === "out") { const t = G.revolveRZ(top, V.mul(dir, -1), [[0, -0.01], [C / 2, -0.01], [C / 2, F], [0, F]]); swap(K.fuse(shape, t)); K.del(t); }
        else { const t = G.revolveRZ(top, dir, [[0, -0.01], [C / 2, -0.01], [C / 2, F], [0, F]]); swap(K.cut(shape, t)); K.del(t); }
      }
      // holes
      const hz = step === "out" ? -fv(P, f, `${k}F`) - 0.01 : -0.01;
      let hole = null;
      if (side === 1) {
        const type = f.s1Type || "simple";
        const ext = exitDistance(col.body.shape, top, dir, col.hit.t + 1e-3, big);
        if ((f.bossType || "flat") === "pinned") {
          // pinned boss: side 1 takes the pin of side 2 in a blind hole
          const E = fv(P, f, "s1E");
          if (!(E > 0)) throw new Error("Side 1: the hole depth must be positive");
          hole = G.revolveRZ(top, dir, [[0, hz], [B / 2, hz], [B / 2, E], [0, E]]);
        } else if (type === "counterbore") {
          const A = fv(P, f, "s1A"), E = fv(P, f, "s1E");
          if (!(A > B)) throw new Error("Side 1: the counterbore diameter must be larger than the hole diameter");
          hole = G.revolveRZ(top, dir, [[0, hz], [B / 2, hz], [B / 2, E], [A / 2, E], [A / 2, ext + 1], [0, ext + 1]]);
        } else if (type === "countersink") {
          const A = fv(P, f, "s1A"), cs = fv(P, f, "s1Cs", 90);
          if (!(A > B)) throw new Error("Side 1: the countersink diameter must be larger than the hole diameter");
          const zc = ext - (A / 2 - B / 2) / Math.tan(rad(cs / 2));
          hole = G.revolveRZ(top, dir, [[0, hz], [B / 2, hz], [B / 2, Math.max(0, zc)], [A / 2, ext], [A / 2, ext + 1], [0, ext + 1]]);
        } else hole = G.revolveRZ(top, dir, [[0, hz], [B / 2, hz], [B / 2, ext + 1], [0, ext + 1]]);
      } else {
        const type = f.bossType || "flat";
        const Gd = fv(P, f, "s2G");
        if (!(Gd > 0)) throw new Error("Side 2: the hole depth must be positive");
        if (type === "pinned") {
          const pin = G.revolveRZ(top, V.mul(dir, -1), [[0, -0.01], [B / 2, -0.01], [B / 2, Gd], [0, Gd]]);
          swap(K.fuse(shape, pin)); K.del(pin);
        } else {
          const tip = type === "tip" ? (B / 2) / Math.tan(rad(59)) : 0;
          hole = G.revolveRZ(top, dir, tip ? [[0, hz], [B / 2, hz], [B / 2, Gd], [0, Gd + tip]] : [[0, hz], [B / 2, hz], [B / 2, Gd], [0, Gd]]);
        }
      }
      if (hole) { const s = K.cut(shape, hole); K.del(hole); swap(s); }
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

export function applyLip(st, f, P, doc) {
  const edges = f.edges || [];
  if (!edges.length) throw new Error("Missing Path");
  const bid = edges[0].body;
  const b = st.bodies.get(bid);
  if (!b) throw new Error("Missing Path");
  const A = fv(P, f, "height"), Wd = fv(P, f, "width"), E = fv(P, f, "clearance");
  if (!(A > 0 && Wd > 0)) throw new Error("The height and width must be positive");
  // guide face: the given one, else the planar face next to the path that holds every path edge
  const T = K.topoOf(b.shape);
  let gi = -1;
  if (f.guide) gi = M.locateFace(b.shape, f.guide);
  if (gi < 0) {
    const e0 = M.locateEdge(b.shape, edges[0]);
    const mids = edges.map((er) => { const i = M.locateEdge(b.shape, er); return i >= 0 ? T.edges[i] : null; });
    for (const fi of (e0 >= 0 ? T.edges[e0].faces : [])) {
      const F = T.faces[fi];
      if (F.type !== "PLANE") continue;
      if (mids.every((m) => m && Math.abs(V.dot(V.sub(m.s, F.c), F.n)) < 1e-5 && Math.abs(V.dot(V.sub(m.t, F.c), F.n)) < 1e-5)) { gi = fi; break; }
    }
  }
  if (gi < 0 || T.faces[gi].type !== "PLANE") throw new Error("Missing Guide Face");
  const GF = T.faces[gi];
  const N = V.norm(GF.n);
  const pl = { o: GF.c, x: G.perp(N), n: N };
  const { segs, closed } = G.chain2d(edgeSegs2d(b.shape, edges, pl));
  // the band lies on the guide face's side of the path
  const [gface] = K.facesAt(b.shape, [gi]);
  let side = 1;
  try {
    // probe beside the middle of the longest segment (a chain point could fall on a corner)
    const sl = segs.reduce((x, y) => (G.segLen(y) > G.segLen(x) ? y : x));
    const m = G.chainPoint([sl], 0.5);
    const probe = W(pl, v2.add(m.p, v2.mul(v2.left(m.t), Math.min(Wd, 0.2))));
    const pr = K.pointProbe(probe);
    try { side = pr.dist(gface) < 1e-4 ? 1 : -1; } finally { pr.delete(); }
  } finally { K.del(gface); }
  const band = (a, c, h, start) => {
    const [o1, o2] = side > 0 ? [a, c] : [-c, -a];
    return G.prismUnion(G.bandFaces(pl, segs, o1, o2, bandExt(segs, Math.max(Math.abs(a), Math.abs(c)), [0, 0], closed)), V.mul(N, h), start);
  };
  const type = f.lipType || "lip";
  const affected = new Set();
  let warning;
  const bodies = solidBodies(st, doc);
  if (type === "lip" || type === "both") {
    let tool = band(0, Wd, A);
    const a1 = fv(P, f, "draft1"), a2 = fv(P, f, "draft2");
    if (Math.abs(a1) > 1e-6 || Math.abs(a2) > 1e-6) {
      const pe = G.chainEdges(pl, segs);
      const comp = K.R.makeCompound(pe);
      const npl = { o: GF.c, n: N };
      try {
        const near = (fi) => { const pr = K.pointProbe(fi.c); try { return pr.dist(comp) < Wd * 0.5; } finally { pr.delete(); } };
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
  }
  if (type === "groove") {
    const tool = band(0, Wd, A + 0.01, V.mul(N, -A)); // overshoots the guide face (no coplanar boolean faces)
    const s = K.cut(st.bodies.get(bid).shape, tool);
    st.bodies.set(bid, { ...st.bodies.get(bid), shape: s, from: f.id });
    affected.add(bid);
    st._tool = tool;
  }
  if (type === "both") {
    // groove in the mating body: the one resting on the guide face
    const [gf2] = K.facesAt(b.shape, [gi]);
    let mate = null;
    try { mate = bodies.find((o) => o.id !== bid && G.dist(o.shape, gf2) < 1e-4) || null; } finally { K.del(gf2); }
    if (!mate) warning = "No mating body touches the guide face: only the lip was created";
    else {
      const tool = band(-E, Wd + E, A + E + 0.01, V.mul(N, -0.01));
      const s = K.cut(mate.shape, tool);
      st.bodies.set(mate.id, { ...st.bodies.get(mate.id), shape: s, from: f.id });
      affected.add(mate.id);
      st._tool = tool;
    }
  }
  return { affected: [...affected], ...(warning ? { warning } : {}) };
}

// ---------------------------------------------------------------- Rest
export function applyRest(st, f, P, doc) {
  const T = fv(P, f, "thickness");
  if (!(T > 0)) throw new Error("The thickness must be positive");
  if (!(f.profiles || []).length) throw new Error("missing profiles");
  const b = st.bodies.get(f.body);
  if (!b) throw new Error("Select a solid body for the rest feature");
  const groups = M.profileGroups(st, f.profiles);
  const off = fv(P, f, "offset"), alpha = fv(P, f, "draft");
  const big = M.modelSize(st);
  let shape = b.shape;
  let shown = null;
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
    // removal above the landing: through all, or up to the selected object
    let reach = big;
    if (f.extent === "object") {
      let objPt = null;
      try {
        if (f.object && f.object.kind === "cplane") { const p2 = M.resolvePlane(f.object, st); objPt = p2 && p2.o; }
        else if (f.object && f.object.kind === "origin") objPt = [0, 0, 0];
        else if (f.object && f.object.body) objPt = f.object.p;
      } catch { objPt = null; }
      if (!objPt) throw new Error("Select body, face, or plane to extend to");
      reach = Math.abs(V.dot(V.sub(objPt, top.o), S));
      if (!(reach > 1e-6)) throw new Error("The object is on the landing plane");
    }
    const verts = g.sketch.regions.vertices;
    const cutTool = Math.abs(alpha) > 1e-6
      ? K.extrudeDrawing(K.regionsDrawing(g.regions, verts), top, 0, -s * reach, alpha)
      : K.extrudeRegions(g.regions, verts, top, 0, -s * reach);
    let removed = 0;
    try { const x = K.intersect(shape, cutTool); removed = K.isEmptyShape(x) ? 0 : K.volumeOf(x); K.del(x); } catch { removed = 0; }
    let n;
    if (removed > 1e-6) {
      // the landing cuts the wall: flatten it and back it with a plate of the rest thickness
      const slab = K.extrudeRegions(g.regions, verts, top, 0, s * T);
      try {
        const a = K.cut(shape, cutTool);
        if (!M.touches(a, slab)) { K.del(a); throw new Error("The rest profile must reach the walls of the body"); }
        n = K.fuse(a, slab);
        K.del(a);
      } finally { K.del(slab); }
    } else {
      // the landing is off the body: fill from the landing to the nearest faces
      const col = K.extrudeRegions(g.regions, verts, top, 0, s * big);
      const cutc = K.cut(col, shape);
      K.del(col);
      const seed = K.extrudeRegions(g.regions, verts, top, 0, s * 1e-3);
      let pieces;
      try { pieces = G.piecesTouching(cutc, [seed]); } finally { K.del(seed, cutc); }
      pieces = pieces.filter((p) => { const ok = G.extentAlong(p, top.o, S)[1] < big - 1e-3; if (!ok) K.del(p); return ok; });
      if (!pieces.length) throw new Error("The rest does not reach a face of the body");
      const fill = G.fuseAll(pieces);
      n = K.fuse(shape, fill);
      K.del(fill);
    }
    if (shape !== b.shape) K.del(shape);
    shape = n;
    if (!shown) shown = cutTool; else K.del(cutTool);
  }
  st.bodies.set(f.body, { ...b, shape, from: f.id });
  if (shown) st._tool = shown;
  return { affected: [f.body] };
}

// ---------------------------------------------------------------- Snap Fit
export function applySnapFit(st, f, P, doc) {
  const pts = sketchPointsW(st, f.points);
  if (!pts.length) throw new Error("Select sketch point to place a snap fit");
  const big = M.modelSize(st);
  const A = fv(P, f, "hA"), Bl = fv(P, f, "hB"), C = fv(P, f, "hC"), Dw = fv(P, f, "hD"), Ew = fv(P, f, "hE");
  const F = fv(P, f, "hF"), H = fv(P, f, "hH"), a1 = fv(P, f, "hAlpha1", 90), a2 = fv(P, f, "hAlpha2", 30);
  const J = fv(P, f, "gJ"), L = fv(P, f, "gL"), Mc = fv(P, f, "gM");
  if (!(A > 0 && Bl > 0 && C > 0 && Dw > 0 && Ew > 0 && F > 0 && H > 0)) throw new Error("The hook dimensions must be positive");
  if (!(a2 > 0 && a2 < 90 && a1 > 0 && a1 <= 90)) throw new Error("The hook angles must be between 0 and 90 deg");
  const type = f.snapType || "parallel";
  const affected = new Set();
  const warnings = [];
  for (const pt of pts) {
    const up = V.mul(pt.n, f.flip ? -1 : 1); // towards the hook body
    const rot = rad(fv(P, f, "rotation"));
    const Y = K.planeY(pt.pl);
    const c = V.norm(V.add(V.mul(pt.pl.x, Math.cos(rot)), V.mul(Y, Math.sin(rot)))); // catch direction
    const w = V.norm(V.cross(up, c)); // width direction
    const bodies = solidBodies(st, doc);
    const hookHit = G.rayHit(bodies, pt.p, up, big);
    if (!hookHit) throw new Error("Select target body to place a snap fit");
    const hookBody = bodies.find((x) => x.id === hookHit.id);
    // the beam runs B past the sketch plane (into the mating body); its root goes up to the hook body (To Next)
    const zTip = -Bl; // along "up" from the sketch point
    const at = (cc, ww, z) => V.add(pt.p, V.add(V.mul(c, cc), V.add(V.mul(w, ww), V.mul(up, z))));
    const zFar = hookHit.t + big * 0.25;
    // beam: thickness A at the plane -> C at the hook (along c, catch face at c = 0), width D -> E (along w)
    const sideA = G.polyPrism([at(0, -Dw, zTip), at(0, -Dw, zFar), at(-A, -Dw, zFar), at(-A, -Dw, 0), at(-C, -Dw, zTip)], V.mul(w, 2 * Dw));
    const sideB = G.polyPrism([at(-A - 1, -Ew / 2, zTip), at(-A - 1, Ew / 2, zTip), at(-A - 1, Dw / 2, 0), at(-A - 1, Dw / 2, zFar), at(-A - 1, -Dw / 2, zFar), at(-A - 1, -Dw / 2, 0)], V.mul(c, A + 2));
    let beam = K.intersect(sideA, sideB);
    K.del(sideA, sideB);
    // hook at the tip: entry ramp (a2 from the beam axis), hook length H, exit face (a1)
    const sr = F / Math.tan(rad(a2));
    const se = a1 >= 89.999 ? 0 : F / Math.tan(rad(a1));
    const hp = [[0, 0], [F, Math.min(sr, H)], [F, H], [0, H + se]].map(([cc, s]) => at(cc, -Ew / 2, zTip + s));
    const hook = G.polyPrism(hp, V.mul(w, Ew));
    const tool0 = K.fuse(beam, hook);
    K.del(beam, hook);
    // to next: keep the part between the tip and the hook body's face
    const cut = K.cut(tool0, hookBody.shape);
    K.del(tool0);
    const seed = K.R.makeVertex(at(-C / 2, 0, zTip));
    let pieces;
    try { pieces = G.piecesTouching(cut, [seed]); } finally { K.del(seed, cut); }
    if (!pieces.length) throw new Error("The snap fit does not reach the hook body");
    const tool = G.fuseAll(pieces);
    const j = joinTool(st, f, tool, [hookBody]);
    j.ids.forEach((x) => affected.add(x));
    K.del(tool);
    // catch side: the body below the sketch plane, around the hook
    const mateHit = G.rayHit(solidBodies(st, doc).filter((x) => x.id !== hookBody.id), pt.p, V.mul(up, -1), big);
    const mate = mateHit && solidBodies(st, doc).find((x) => x.id === mateHit.id);
    if (!mate) { warnings.push("No body on the groove side of the snap fit"); continue; }
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
      try { lp = G.piecesTouching(lc, [mate.shape]).filter((p) => { const ok = G.extentAlong(p, pt.p, V.mul(up, -1))[1] < big * 0.25 - 1e-3; if (!ok) K.del(p); return ok; }); } finally { K.del(lc); }
      if (!lp.length) { warnings.push("The loop does not reach the mating body"); continue; }
      const loop = G.fuseAll(lp);
      try {
        const jj = joinTool(st, f, loop, [mate]);
        jj.ids.forEach((x) => affected.add(x));
      } catch (e) { warnings.push(String(e.message || e)); }
      K.del(loop);
    } else {
      // groove (Parallel: a pocket of depth J behind the hook; Perpendicular: a window through the wall)
      const depth = type === "perpendicular" ? big * 0.25 : F + J;
      const g0 = zTip - Mc, g1 = zTip + H + se + Mc;
      const groove = G.polyPrism([at(-0.01, -(Ew / 2 + L), g0), at(-0.01, Ew / 2 + L, g0), at(-0.01, Ew / 2 + L, g1), at(-0.01, -(Ew / 2 + L), g1)], V.mul(c, depth));
      const ms = st.bodies.get(mate.id);
      const s = K.cut(ms.shape, groove);
      st.bodies.set(mate.id, { ...ms, shape: s, from: f.id });
      affected.add(mate.id);
      K.del(groove);
    }
  }
  return { affected: [...affected], ...(warnings.length ? { warning: warnings[0] } : {}) };
}
