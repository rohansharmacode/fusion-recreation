// sheetmetal: Convert to Sheet Metal, Lofted Flange and Join by Bend (evaluators + dialogs).
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import * as G from "./geom.js";
import { V, V2, apply, applyDir, inv, mul, fromFrame, rad, clone, interiorPoint, area2 } from "./math.js";
import { evalRule, ruleFor, findRule } from "./rules.js";
import { putBody, sheetBody, applyRule, chainOnEdge, combine, flangeAt } from "./features.js";
import { beginModelCommand } from "../dialogs/common.js";
import { smData, isSheet, ruleNow, commitWith, plainRef, asFace, asEdge, sheetFaceRow } from "./dialogs.js";

const del = (...a) => K.del(...a);
const PI = Math.PI;
const ruleNums = (doc, P, id) => evalRule((id && findRule(doc, id)) || ruleFor(doc), P);
function inside(shape, p) {
  try { const pr = K.pointProbe(p); try { return pr.dist(shape) < 1e-6; } finally { pr.delete(); } } catch { return false; }
}
const onFace = (shape, fi, p, tol = 1e-4) => { const c = K.closestOnFace(shape, fi, p); return !!c && c.dist < tol; };

// ================================================================ Convert to Sheet Metal
/** Faces adjacent to face fi: [{edge index, face index}] */
function neighbours(T, fi) {
  const out = [];
  T.edges.forEach((e, ei) => { if (e.faces.includes(fi)) for (const o of e.faces) if (o !== fi) out.push({ ei, fo: o }); });
  return out;
}
function convexEdge(shape, e) {
  const ns = (e.fn || []).filter(Boolean);
  if (ns.length < 2) return true;
  const eps = 0.02;
  return !inside(shape, V.add(e.m, V.sub(V.mul(ns[0], eps), V.mul(ns[1], eps)))) && !inside(shape, V.add(e.m, V.sub(V.mul(ns[1], eps), V.mul(ns[0], eps))));
}
function detectThickness(shape, fi) {
  const T = K.topoOf(shape);
  const f = T.faces[fi];
  if (!f || f.type !== "PLANE") throw new Error("Select a planar face of the body");
  const seeds = G.seedsOnFaces(shape, [fi], inv(fromFrame(f.c, anyPerp(f.n), V.cross(f.n, anyPerp(f.n)), f.n)));
  const probe = seeds.length ? seeds.map((s) => apply(fromFrame(f.c, anyPerp(f.n), V.cross(f.n, anyPerp(f.n)), f.n), [s[0], s[1], 0])) : [f.c];
  let best = Infinity;
  T.faces.forEach((g, gi) => {
    if (gi === fi || g.type !== "PLANE" || V.dot(g.n, f.n) > -1 + 1e-6) return;
    const t = V.dot(f.n, V.sub(f.c, g.c));
    if (!(t > 1e-6) || t >= best) return;
    if (probe.some((p) => onFace(shape, gi, V.sub(p, V.mul(f.n, t)), 1e-4))) best = t;
  });
  if (!Number.isFinite(best)) throw new Error("Can't detect a uniform thickness from the selected face");
  return best;
}
function anyPerp(n) { const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; return V.norm(V.cross(n, a)); }
/** Longest straight edge direction of a face (for a tidy flat frame). */
function faceX(T, fi, n) {
  let best = null, bl = 0;
  T.edges.forEach((e) => { if (e.faces.includes(fi) && e.type === "LINE" && e.len > bl) { bl = e.len; best = e.d; } });
  return best ? V.norm(V.sub(best, V.mul(n, V.dot(best, n)))) : anyPerp(n);
}

function applyConvert(st, f, P, doc) {
  const ref = (f.face || [])[0];
  if (!ref) throw new Error("Select a base face to infer body thickness.");
  const b = st.bodies.get(ref.body);
  if (!b) throw new Error("Missing base face.");
  if (st.smData instanceof Map && st.smData.get(ref.body)) throw new Error("The body is already a sheet metal body");
  const shape = b.shape;
  const fi = M.locateFace(shape, ref);
  if (fi < 0) throw new Error("Missing base face.");
  const T0 = K.topoOf(shape);
  const bf = T0.faces[fi];
  if (bf.type !== "PLANE") throw new Error("Select a planar base face");
  const T = detectThickness(shape, fi);
  const rule = ruleNums(doc, P, f.rule);
  const R = f.bendRadius ? Math.max(0, M.fval(P, f, "bendRadius")) : rule.R;
  const nz = V.mul(bf.n, -1); // flat w points into the material
  const x = faceX(T0, fi, bf.n);
  const frame = fromFrame(bf.c, x, V.cross(nz, x), nz);
  const d = G.newData({ T, K: rule.K, R, rule: rule.id, w0: 0, frame });
  applyRule(d, rule);
  d.R = R;
  d.seams = [];
  d.flanges.F1.seeds = G.seedsOnFaces(shape, [fi], inv(frame));
  d.flanges.F1.feature = f.id;
  const owner = new Map(); // face index -> flange id (outer faces)
  owner.set(fi, "F1");
  const usedCyl = new Set();
  const queue = ["F1"];
  let guard = 0;
  while (queue.length && guard++ < 200) {
    const fid = queue.shift();
    const m = G.flangeM(d, fid);
    const mi = inv(m);
    const nA = V.norm(applyDir(m, [0, 0, -1]));
    const aFaces = G.planeFaces(shape, apply(m, [0, 0, d.w0]), nA).filter((i) => (owner.get(i) || fid) === fid && d.flanges[fid].seeds.some((s) => onFace(shape, i, apply(m, [s[0], s[1], d.w0]))));
    const bFaces = G.planeFaces(shape, apply(m, [0, 0, d.w0 + T]), V.mul(nA, -1));
    for (const i of aFaces) owner.set(i, fid);
    for (const [faces, side] of [[aFaces, 1], [bFaces, -1]]) for (const fa of faces) for (const { ei, fo } of neighbours(T0, fa)) {
      const e = T0.edges[ei];
      if (e.type !== "LINE") continue;
      const g = T0.faces[fo];
      const ea = apply(mi, e.s), eb = apply(mi, e.t);
      const a2 = [ea[0], ea[1]], b2 = [eb[0], eb[1]];
      const dd = V2.norm(V2.sub(b2, a2));
      let q = [dd[1], -dd[0]];
      const mid = V2.mul(V2.add(a2, b2), 0.5);
      const hw = side > 0 ? d.w0 : d.w0 + T;
      if (onFace(shape, fa, apply(m, [mid[0] + q[0] * 0.05, mid[1] + q[1] * 0.05, hw]))) q = V2.mul(q, -1);
      if (g.type === "CYLINDRE" && g.a && !usedCyl.has(fo)) {
        // an existing bend: radius and angle from the cylinder
        if (Math.abs(Math.abs(V.dot(g.a, e.d)) - 1) > 1e-6) continue;
        const aoF = apply(mi, g.ao);
        const sgn = side;
        const Rb = side > 0 ? g.r - T : g.r;
        if (Rb < -1e-6) continue;
        const wa = sgn > 0 ? d.w0 + T + Rb : d.w0 - Rb;
        if (Math.abs(aoF[2] - wa) > 1e-3) continue;
        // angular extent of the cylinder face
        const r0 = sgn > 0 ? [0, 0, -1] : [0, 0, 1];
        const ax = V.mul([q[1], -q[0], 0], sgn);
        let A = 0, s0 = Infinity, s1 = -Infinity;
        const o2 = V2.add(a2, V2.mul(q, 0));
        T0.edges.forEach((ce) => {
          if (!ce.faces.includes(fo)) return;
          for (const P0 of [ce.s, ce.t, ce.m]) {
            const p = apply(mi, P0);
            const rel = V.sub(p, [aoF[0], aoF[1], wa]);
            const radial = V.sub(rel, V.mul(ax, V.dot(rel, ax)));
            let th = Math.atan2(V.dot(V.cross(r0, radial), ax), V.dot(radial, r0));
            if (th < -1e-6) th += 2 * PI;
            A = Math.max(A, th);
            const t = V2.dot(V2.sub([p[0], p[1]], o2), dd);
            s0 = Math.min(s0, t); s1 = Math.max(s1, t);
          }
        });
        if (!(A > 1e-4)) continue;
        usedCyl.add(fo);
        const bid = G.nextId(d, "B"), cid = G.nextId(d, "F");
        d.bends[bid] = { id: bid, parent: fid, child: cid, o: o2, d: dd, q, s0, s1, A, sgn, R: Math.max(0, Rb), K: d.K, flat: false, feature: f.id };
        d.flanges[cid] = { id: cid, bend: bid, seeds: [], feature: f.id };
        const mc = G.flangeM(d, cid);
        const BA = G.bendBA(d.bends[bid], T);
        const cand = G.planeFaces(shape, apply(mc, [0, 0, d.w0]), V.norm(applyDir(mc, [0, 0, -1])));
        d.flanges[cid].seeds = G.seedsOnFaces(shape, cand, inv(mc), (p) => V2.dot(V2.sub(p, o2), q) > BA + 1e-3);
        if (d.flanges[cid].seeds.length) queue.push(cid); else d.flanges[cid].len = 0;
        continue;
      }
      if (g.type !== "PLANE" || Math.abs(V.dot(g.n, nA)) > 1 - 1e-6) continue;
      if (owner.has(fo)) {
        const o = owner.get(fo);
        if (o !== fid && !isRelated(d, o, fid) && side > 0) d.seams.push({ a: fid, b: o, p: e.m, ripped: false });
        continue;
      }
      if (!convexEdge(shape, e)) continue;
      // a thickness (end) face stops at the other sheet face; a child's outer face goes on past it
      const beyond = apply(m, [mid[0] - q[0] * 0, mid[1] - q[1] * 0, side > 0 ? d.w0 + T + Math.min(0.2, T * 0.2) : d.w0 - Math.min(0.2, T * 0.2)]);
      if (!onFace(shape, fo, beyond, 1e-4)) continue;
      // sharp corner: replace it by a bend of the rule radius (outer faces stay where they are)
      const nOutF = side > 0 ? nA : V.mul(nA, -1);
      const A = Math.acos(Math.max(-1, Math.min(1, V.dot(nOutF, g.n))));
      if (!(A > 1e-3)) continue;
      const us = -(R + T) * Math.tan(Math.min(A, PI / 2) / 2);
      const bid = G.nextId(d, "B"), cid = G.nextId(d, "F");
      const len = V2.len(V2.sub(b2, a2));
      const o = V2.add(a2, V2.mul(q, us));
      d.bends[bid] = { id: bid, parent: fid, child: cid, o, d: dd, q, s0: 0, s1: len, A, sgn: side, R, K: d.K, flat: false, feature: f.id };
      const BA = G.bendBA(d.bends[bid], T);
      const pf = d.flanges[fid];
      pf.clip = [...(pf.clip || []), { n: q, c: V2.dot(q, o) }];
      d.flanges[cid] = { id: cid, bend: bid, seeds: [], feature: f.id, clip: [{ n: V2.mul(q, -1), c: -(V2.dot(q, o) + BA) }] };
      const mc = G.flangeM(d, cid);
      // the child's outer face must be the face we found (sanity)
      const nC = V.norm(applyDir(mc, [0, 0, -side]));
      if (V.dot(nC, g.n) < 1 - 1e-4) { delete d.bends[bid]; delete d.flanges[cid]; pf.clip.pop(); continue; }
      const childFaces = side > 0 ? [fo] : G.planeFaces(shape, apply(mc, [0, 0, d.w0]), V.norm(applyDir(mc, [0, 0, -1])));
      d.flanges[cid].seeds = G.seedsOnFaces(shape, childFaces, inv(mc), (p) => V2.dot(V2.sub(p, o), q) > BA + 1e-3);
      if (side > 0) owner.set(fo, cid);
      if (d.flanges[cid].seeds.length) queue.push(cid); else { delete d.bends[bid]; delete d.flanges[cid]; pf.clip.pop(); }
    }
  }
  // rebuild: flanges from the solid's faces (clipped at the new bends), bends made fresh
  const oldD = clone(d);
  oldD.bends = {};
  for (const fl of Object.values(oldD.flanges)) { fl.M = G.flangeM(d, fl.id); fl.bend = null; }
  const nd = clone(d);
  for (const fl of Object.values(nd.flanges)) fl.src = fl.id;
  for (const fl of Object.values(oldD.flanges)) delete fl.clip;
  let out;
  if (!Object.keys(d.bends).length) out = K.translated(shape, [0, 0, 0]);
  else {
    out = G.rebuild(shape, oldD, nd);
    // keep holes and cut-outs of the original flanges (the rebuilt flanges come from its faces already)
  }
  for (const fl of Object.values(nd.flanges)) { delete fl.src; delete fl.clip; }
  G.refreshSeeds(out, nd);
  putBody(st, ref.body, out, nd, f, b);
  return { affected: [ref.body], warning: nd.seams.length ? `${nd.seams.length} closed corner${nd.seams.length > 1 ? "s" : ""}: use Rip before unfolding` : undefined };
}
function isRelated(d, a, b) {
  const fa = d.flanges[a], fb = d.flanges[b];
  const pa = fa && fa.bend && d.bends[fa.bend], pb = fb && fb.bend && d.bends[fb.bend];
  return (pa && pa.parent === b) || (pb && pb.parent === a);
}

// ================================================================ Lofted flange (Brake Form facets)
function sampleProfile(st, r, n) {
  const s = st.sketches.get(r.sketch);
  if (!s) throw new Error("Profile sketch is missing");
  let pts2 = null, closed = false;
  if (r.curve) {
    const c = s.sk.curves[r.curve];
    const P = (id) => [s.sk.points[id].x, s.sk.points[id].y];
    if (!c) throw new Error("Profile curve is missing");
    if (c.type === "line") pts2 = [P(c.p1), P(c.p2)];
    else if (c.type === "circle") {
      const cc = P(c.c), rr = typeof c.r === "number" ? c.r : V2.len(V2.sub(P(c.p || c.c), cc));
      pts2 = Array.from({ length: 64 }, (_, i) => [cc[0] + rr * Math.cos((2 * PI * i) / 64), cc[1] + rr * Math.sin((2 * PI * i) / 64)]);
      closed = true;
    } else if (c.type === "arc") {
      const cc = P(c.c), a = P(c.p1), b = P(c.p2);
      const r0 = V2.len(V2.sub(a, cc));
      let a0 = Math.atan2(a[1] - cc[1], a[0] - cc[0]), a1 = Math.atan2(b[1] - cc[1], b[0] - cc[0]);
      if (a1 <= a0) a1 += 2 * PI;
      pts2 = Array.from({ length: 33 }, (_, i) => { const t = a0 + ((a1 - a0) * i) / 32; return [cc[0] + r0 * Math.cos(t), cc[1] + r0 * Math.sin(t)]; });
    } else throw new Error("Use lines, arcs, circles or closed profiles for a lofted flange");
  } else {
    const { region } = M.resolveRegion(st, r);
    pts2 = region.outer.poly.slice();
    closed = true;
  }
  const W = pts2.map((p) => K.toWorld(s.plane, p[0], p[1]));
  return { pts: resample(W, n, closed), closed, plane: s.plane };
}
function resample(W, n, closed) {
  const P = closed ? [...W, W[0]] : W;
  const L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + V.len(V.sub(P[i], P[i - 1])));
  const tot = L[L.length - 1];
  const out = [];
  const N = closed ? n : n + 1;
  for (let k = 0; k < N; k++) {
    const t = (tot * k) / n;
    let i = 1;
    while (i < L.length - 1 && L[i] < t) i++;
    const u = (t - L[i - 1]) / Math.max(1e-12, L[i] - L[i - 1]);
    out.push(V.lerp(P[i - 1], P[i], Math.max(0, Math.min(1, u))));
  }
  return out;
}
function applyLoft(st, f, P, doc) {
  const rule = ruleNums(doc, P, f.rule);
  const T = rule.T;
  const n = Math.max(2, Math.min(200, Math.round(f.method === "die" ? 48 : Number(f.facets) || 12)));
  const A = sampleProfile(st, f.p1, n), B = sampleProfile(st, f.p2, n);
  if (A.closed !== B.closed) throw new Error("Both profiles must be open or both closed");
  let pb = B.pts;
  if (A.closed) {
    // align the start point and the direction of the second loop
    let best = null;
    for (const cand of [pb, pb.slice().reverse()]) for (let s = 0; s < cand.length; s++) {
      const rot = [...cand.slice(s), ...cand.slice(0, s)];
      const cost = rot.reduce((acc, p, i) => acc + V.len(V.sub(p, A.pts[i])), 0);
      if (!best || cost < best.cost) best = { cost, rot };
    }
    pb = best.rot;
  } else if (V.len(V.sub(pb[0], A.pts[0])) + V.len(V.sub(pb[pb.length - 1], A.pts[A.pts.length - 1])) > V.len(V.sub(pb[0], A.pts[A.pts.length - 1])) + V.len(V.sub(pb[pb.length - 1], A.pts[0]))) pb = pb.slice().reverse();
  const pa = A.pts;
  const cnt = A.closed ? pa.length : pa.length - 1;
  const tris = [];
  for (let i = 0; i < cnt; i++) {
    const j = (i + 1) % pa.length;
    tris.push([pa[i], pa[j], pb[i]], [pa[j], pb[j], pb[i]]);
  }
  const triN = (t) => V.norm(V.cross(V.sub(t[1], t[0]), V.sub(t[2], t[0])));
  // offsets by orientation (Side 1 / Side 2 / Center) along the facet normals at each vertex
  const sideOff = f.orientation === "side2" ? [-T, 0] : f.orientation === "center" ? [-T / 2, T / 2] : [0, T];
  const vnorm = (p) => {
    let s = [0, 0, 0];
    for (const t of tris) if (t.some((q) => V.len(V.sub(q, p)) < 1e-9)) s = V.add(s, triN(t));
    return V.norm(s);
  };
  const keyOf = (p) => p.map((c) => c.toFixed(6)).join(",");
  const nmap = new Map();
  for (const t of tris) for (const p of t) if (!nmap.has(keyOf(p))) nmap.set(keyOf(p), vnorm(p));
  const off = (p, k) => V.add(p, V.mul(nmap.get(keyOf(p)), sideOff[k]));
  const faces = [];
  const tri = (a, b, c) => { try { faces.push(K.polygonFace([a, b, c])); } catch { /* degenerate */ } };
  for (const t of tris) { tri(off(t[0], 1), off(t[1], 1), off(t[2], 1)); tri(off(t[2], 0), off(t[1], 0), off(t[0], 0)); }
  // boundary edges -> side walls
  const edgeCount = new Map();
  for (const t of tris) for (let k = 0; k < 3; k++) {
    const a = t[k], b = t[(k + 1) % 3];
    const key = [keyOf(a), keyOf(b)].sort().join("|");
    const e = edgeCount.get(key) || { a, b, n: 0 };
    e.n++;
    edgeCount.set(key, e);
  }
  for (const e of edgeCount.values()) if (e.n === 1) {
    const a0 = off(e.a, 0), b0 = off(e.b, 0), a1 = off(e.a, 1), b1 = off(e.b, 1);
    tri(a0, b0, b1); tri(a0, b1, a1);
  }
  let solid;
  try { solid = K.R.makeSolid(faces); } finally { del(faces); }
  if (K.volumeOf(solid) < 0) { const s2 = K.R.makeSolid([solid]); del(solid); solid = s2; }
  // flat pattern: unfold the facet strip (edge lengths kept), bend lines between the facets
  const pos = new Map();
  const put = (p, q) => pos.set(keyOf(p), q);
  const get = (p) => pos.get(keyOf(p));
  const t0 = tris[0];
  const l01 = V.len(V.sub(t0[1], t0[0]));
  put(t0[0], [0, 0]); put(t0[1], [l01, 0]);
  const place = (a, b, c, other) => {
    const A2 = get(a), B2 = get(b);
    const la = V.len(V.sub(c, a)), lb = V.len(V.sub(c, b)), lab = V2.len(V2.sub(B2, A2));
    const x = (la * la - lb * lb + lab * lab) / (2 * lab);
    const y = Math.sqrt(Math.max(0, la * la - x * x));
    const ex = V2.mul(V2.sub(B2, A2), 1 / lab), ey = [-ex[1], ex[0]];
    let cand = V2.add(A2, V2.add(V2.mul(ex, x), V2.mul(ey, y)));
    if (other) { const O = get(other); if (O && V2.cross(ex, V2.sub(O, A2)) * V2.cross(ex, V2.sub(cand, A2)) > 0) cand = V2.add(A2, V2.add(V2.mul(ex, x), V2.mul(ey, -y))); }
    else cand = V2.add(A2, V2.add(V2.mul(ex, x), V2.mul(ey, y)));
    return cand;
  };
  put(t0[2], place(t0[0], t0[1], t0[2], null));
  const flatPos = [[get(t0[0]), get(t0[1]), get(t0[2])]];
  for (let i = 1; i < tris.length; i++) {
    const t = tris[i], prev = tris[i - 1];
    const shared = t.filter((p) => prev.some((q) => keyOf(q) === keyOf(p)));
    const newP = t.find((p) => !shared.some((q) => keyOf(q) === keyOf(p)));
    const oldP = prev.find((p) => !shared.some((q) => keyOf(q) === keyOf(p)));
    if (shared.length !== 2 || !newP) break;
    // a closed loop comes back to its first points: give the seam its own flat copies
    const q = place(shared[0], shared[1], newP, oldP);
    if (i === tris.length - 1 && A.closed) { flatPos.push([get(t[0]) || q, get(t[1]) || q, get(t[2]) || q]); continue; }
    put(newP, q);
    flatPos.push(t.map((p) => get(p)));
  }
  // outline: along profile A then back along B
  const outerA = [], outerB = [];
  for (let i = 0; i < cnt; i++) { outerA.push(flatPos[2 * i][0]); outerB.push(flatPos[2 * i][2]); }
  outerA.push(flatPos[2 * cnt - 2][1]); outerB.push(flatPos[2 * cnt - 1][1]);
  const outer = [...outerA, ...outerB.reverse()];
  const lines = [];
  for (let i = 1; i < cnt; i++) {
    const ta = tris[2 * i - 1], tb = tris[2 * i];
    const nA = triN(ta), nB = triN(tb);
    if (V.dot(nA, nB) > 1 - 1e-9) continue;
    lines.push({ kind: "center", a: flatPos[2 * i][0], b: flatPos[2 * i][2], up: V.dot(V.cross(nA, nB), V.sub(tb[0], tb[2])) > 0, angle: Math.acos(Math.max(-1, Math.min(1, V.dot(nA, nB)))) });
  }
  const n0 = triN(t0), x0 = V.norm(V.sub(t0[1], t0[0]));
  const frameF = fromFrame(V.add(t0[0], [0, 0, 0]), x0, V.cross(n0, x0), n0);
  const d = { v: 1, kind: "loft", T, K: rule.K, R: rule.R, rule: rule.id, w0: sideOff[0], frame: frameF, root: null, nid: 1, flanges: {}, bends: {}, flat: { outer: area2(outer) < 0 ? outer.slice().reverse() : outer, lines, frame: frameF } };
  applyRule(d, rule);
  const id = f.newBody || `${f.id}_b`;
  putBody(st, id, solid, d, f);
  return { affected: [id] };
}

// ================================================================ Join by Bend
function applyJoinBend(st, f, P, doc) {
  const refs = f.edges || [];
  if (refs.length < 2) throw new Error("Select two edges to join separate sheet metal bodies into one.");
  const [r1, r2] = refs;
  if (r1.body === r2.body) throw new Error("Select edges on two separate sheet metal bodies");
  const A = sheetBody(st, r1.body), B = sheetBody(st, r2.body);
  if (Math.abs(A.d.T - B.d.T) > 1e-6) throw new Error("The bodies must have the same thickness");
  const edgeOf = (sb, r) => {
    const i = M.locateEdge(sb.b.shape, r);
    const e = K.topoOf(sb.b.shape).edges[i];
    if (!e || e.type !== "LINE") throw new Error("Select straight sheet metal edges");
    const info = G.edgeOnFlange(sb.b.shape, sb.d, e.s, e.t);
    if (!info) throw new Error("Select edges on the top or bottom faces of the sheet metal");
    return { e, info };
  };
  const ea = edgeOf(A, r1), eb = edgeOf(B, r2);
  const d = G.cloneData(A.d);
  applyRule(d, ruleNums(doc, P, A.d.rule));
  const T = d.T;
  const R = f.bendRadius ? Math.max(0, M.fval(P, f, "bendRadius")) : d.R;
  if (Math.abs(Math.abs(V.dot(ea.e.d, eb.e.d)) - 1) > 1e-4) throw new Error("The edges must be parallel");
  const mA = ea.info.m;
  // second flange's sheet in A's flat space
  const mB = eb.info.m;
  const toA = mul(inv(mA), mB);
  const nB = applyDir(toA, [0, 0, 1]); // B's sheet normal in A's flat space
  const pB = apply(toA, [eb.info.a[0], eb.info.a[1], B.d.w0 + T / 2]); // mid layer point at B's edge
  const q = ea.info.q;
  // angle between the sheets measured in the plane (q, z): the child must turn from q onto B's in-plane direction
  const toward = V.sub(pB, [ea.info.a[0], ea.info.a[1], d.w0 + T / 2]);
  const sgn = V.dot(toward, [0, 0, 1]) >= 0 ? 1 : -1;
  // B's in-plane direction pointing away from A (perpendicular to the edge, in B's sheet)
  const dl = [ea.info.d[0], ea.info.d[1], 0];
  let dirB = V.norm(V.cross(nB, dl));
  if (V.dot(dirB, toward) < 0) dirB = V.mul(dirB, -1);
  const ang = Math.atan2(sgn * dirB[2], V.dot(dirB, [q[0], q[1], 0]));
  const Aang = Math.abs(ang);
  if (!(Aang > 1e-3) || Aang > PI - 1e-3) throw new Error("The flanges must meet at an angle");
  // bend start so the child's mid layer lands on B's mid plane: solve along q
  const solveFor = (us) => {
    const dd = G.cloneData(d);
    const tmp = chainOnEdge(dd, ea.info, [{ A: Aang, R, rel: 1, L: 0 }], { s0: 0, s1: ea.info.len, us, sgn, feature: f.id });
    del(tmp.tools);
    const b = dd.bends[tmp.bends[0]];
    const mc = G.flangeM(dd, tmp.flanges[0]);
    const BA = G.bendBA(b, T);
    const p = apply(inv(mA), apply(mc, [b.o[0] + b.q[0] * BA, b.o[1] + b.q[1] * BA, d.w0 + T / 2]));
    return { dist: V.dot(V.sub(p, pB), nB), p, dd, b, mc, BA, tmp };
  };
  const s0 = solveFor(0), s1 = solveFor(1);
  const k = (s1.dist - s0.dist);
  if (Math.abs(k) < 1e-9) throw new Error("Can't place a bend between these edges");
  const us = -s0.dist / k;
  const sol = solveFor(us);
  // straight connector from the bend end to B's edge
  const L = Math.max(0, V.dot(V.sub(pB, sol.p), applyDir(inv(mA), applyDir(sol.mc, [q[0], q[1], 0]))));
  // B's edge range along A's edge (A's flat coordinates)
  const bA = apply(toA, [eb.info.a[0], eb.info.a[1], 0]), bB = apply(toA, [eb.info.b[0], eb.info.b[1], 0]);
  const sB = [bA, bB].map((p) => V2.dot(V2.sub([p[0], p[1]], ea.info.a), ea.info.d)).sort((x, y) => x - y);
  // Face extension: Perpendicular keeps the connector square to the edges (A's width); Aligned runs its sides
  // from A's edge ends to B's edge ends
  const aligned = (f.extension || "aligned") === "aligned" && (Math.abs(sB[0]) > 1e-6 || Math.abs(sB[1] - ea.info.len) > 1e-6);
  const r = chainOnEdge(d, ea.info, [{ A: Aang, R, rel: 1, L: aligned ? 0 : L }], { s0: 0, s1: ea.info.len, us, sgn, feature: f.id });
  const cuts = [];
  if (us < -1e-9) cuts.push(G.flatPrism(mA, G.rect(ea.info.a, ea.info.d, q, 0, ea.info.len, us, 1e-3), d.w0 - 1e-3, d.w0 + T + 1e-3));
  // A's face extended up to the bend when the bend starts past A's edge
  if (us > 1e-9) r.tools.push(G.flatPrism(mA, G.rect(ea.info.a, ea.info.d, q, 0, ea.info.len, 0, us), d.w0, d.w0 + T));
  if (aligned && L > 1e-6) {
    const bd = d.bends[r.bends[0]];
    const BA = G.bendBA(bd, T);
    const P2 = (s, u) => V2.add(bd.o, V2.add(V2.mul(bd.d, s), V2.mul(bd.q, u)));
    const poly = [P2(0, BA), P2(ea.info.len, BA), P2(sB[1], BA + L), P2(sB[0], BA + L)];
    r.tools.push(G.flatPrism(G.flangeM(d, r.flanges[0]), poly, d.w0, d.w0 + T));
    const m0 = sB[0] / 2, m1 = (ea.info.len + sB[1]) / 2;
    d.flanges[r.flanges[0]].seeds = [0.25, 0.5, 0.75].map((k) => P2(m0 + (m1 - m0) * k, BA + L * 0.5));
  }
  // merge B's data under the connector flange (B re-rooted at the joined flange)
  const cid = r.flanges[0];
  const mc = G.flangeM(d, cid);
  const Gm = mul(inv(mc), mB); // B's flat -> merged flat (for the joined flange's region)
  const flipW = applyDir(Gm, [0, 0, 1])[2] < 0;
  const bd = G.cloneData(B.d);
  reroot(bd, eb.info.fid);
  const mapP = (p) => { const v = apply(Gm, [p[0], p[1], flipW ? 2 * B.d.w0 + T - B.d.w0 : B.d.w0]); return [v[0], v[1]]; };
  const mapD = (v) => { const w = applyDir(Gm, [v[0], v[1], 0]); return [w[0], w[1]]; };
  if (flipW) throw new Error("Flip one body so both sheets face the same way, then join them");
  const ren = (id) => `J${f.id}_${id}`;
  for (const fl of Object.values(bd.flanges)) {
    const nf = { ...fl, id: fl.id === bd.root ? cid : ren(fl.id), seeds: (fl.seeds || []).map(mapP), bend: fl.bend ? ren(fl.bend) : null };
    delete nf.M;
    if (fl.id === bd.root) { d.flanges[cid].seeds = [...d.flanges[cid].seeds, ...nf.seeds]; d.flanges[cid].len = undefined; }
    else d.flanges[nf.id] = nf;
  }
  for (const b of Object.values(bd.bends)) {
    d.bends[ren(b.id)] = { ...b, id: ren(b.id), parent: b.parent === bd.root ? cid : ren(b.parent), child: ren(b.child), o: mapP(b.o), d: mapD(b.d), q: mapD(b.q) };
  }
  d.seams = [...(d.seams || []), ...(bd.seams || []).map((s) => ({ ...s, a: s.a === bd.root ? cid : ren(s.a), b: s.b === bd.root ? cid : ren(s.b) }))];
  let shape = combine(A.b.shape, cuts, r.tools);
  const s2 = K.fuse(shape, B.b.shape);
  del(shape);
  shape = s2;
  G.refreshSeeds(shape, d);
  st.bodies.delete(r2.body);
  st.smData.delete(r2.body);
  putBody(st, r1.body, shape, d, f, A.b);
  return { affected: [r1.body, r2.body] };
}
/** Re-root a sheet metal tree at flange fid (bends on the path are reversed, flat coords unchanged). */
function reroot(d, fid) {
  if (d.root === fid) return;
  const path = G.chain(d, fid);
  const M0 = G.flangeM(d, fid);
  for (const b of path.reverse()) {
    const BA = G.bendBA(b, d.T);
    const parent = b.parent, child = b.child;
    b.o = V2.add(b.o, V2.mul(b.q, BA));
    b.q = V2.mul(b.q, -1);
    b.parent = child; b.child = parent;
    d.flanges[parent].bend = b.id;
    d.flanges[child].bend = null;
  }
  d.flanges[fid].bend = null;
  d.root = fid;
  d.frame = M0;
}

// ================================================================ Contour flange (open sketch profile)
const ptOf = (sk, id) => [sk.points[id].x, sk.points[id].y];
/** Ordered path [{type, a, b, (c, r, ccw)}] (2D, direction of travel) of the chain of curve ids. */
function orderPath(sk, ids, first = ids[0]) {
  const ends = (cid) => { const c = sk.curves[cid]; return [ptOf(sk, c.p1), ptOf(sk, c.p2)]; };
  const near = (a, b) => V2.len(V2.sub(a, b)) < 1e-6;
  const count = (p) => ids.reduce((n, cid) => n + ends(cid).filter((q) => near(p, q)).length, 0);
  const starts = [];
  for (const cid of ids) for (const p of ends(cid)) if (count(p) === 1) starts.push(p);
  if (starts.length !== 2) throw new Error("Select an open sketch profile (a closed loop makes a base flange)");
  // walk the chain in the direction of the first selected curve (its start point to its end point)
  const walk = (from) => { const order = []; const left = new Set(ids); let cur = from; while (left.size) { const cid = [...left].find((x) => ends(x).some((q) => near(q, cur))); if (!cid) return null; left.delete(cid); const [p1, p2] = ends(cid); order.push({ cid, fwd: near(p1, cur) }); cur = near(p1, cur) ? p2 : p1; } return order; };
  const w0 = walk(starts[0]);
  const hit = w0 && w0.find((x) => x.cid === first);
  const start = { p: !hit || hit.fwd ? starts[0] : starts[1] };
  const out = [];
  const left = new Set(ids);
  let cur = start.p;
  while (left.size) {
    const cid = [...left].find((x) => ends(x).some((q) => near(q, cur)));
    if (!cid) throw new Error("The contour must be one connected chain of lines and arcs");
    left.delete(cid);
    const c = sk.curves[cid];
    const [p1, p2] = ends(cid);
    const fwd = near(p1, cur);
    const a = fwd ? p1 : p2, b = fwd ? p2 : p1;
    if (c.type === "line") out.push({ type: "line", a, b });
    else out.push({ type: "arc", a, b, c: ptOf(sk, c.c), r: V2.len(V2.sub(p1, ptOf(sk, c.c))), ccw: fwd });
    cur = b;
  }
  return out;
}
function applyContour(st, f, P, doc) {
  const refs = f.curves || [];
  if (!refs.length) throw new Error("Select an open sketch profile");
  const s = st.sketches.get(refs[0].sketch);
  if (!s) throw new Error("The contour sketch is missing");
  const path = orderPath(s.sk, refs.map((r) => r.curve));
  if (path[0].type !== "line" || path[path.length - 1].type !== "line") throw new Error("The contour must start and end with a line");
  const rule = ruleNums(doc, P, f.rule);
  const T = rule.T;
  const Rr = f.bendRadius ? Math.max(0, M.fval(P, f, "bendRadius")) : rule.R;
  const w0 = f.orientation === "side2" ? -T : f.orientation === "center" ? -T / 2 : 0;
  // straight segments and the turns between them (sharp corners -> bends of the rule radius)
  const dirOf = (e) => V2.norm(V2.sub(e.b, e.a));
  const segs = []; // {len, turn: {A, sgn, rc (radius at the sketch curve), arc}}
  let i = 0;
  while (i < path.length) {
    const e = path[i];
    if (e.type !== "line") throw new Error("Arcs in a contour must sit between two lines");
    segs.push({ len: V2.len(V2.sub(e.b, e.a)), dir: dirOf(e), setA: 0, setB: 0, turn: null });
    const nx = path[i + 1];
    if (!nx) break;
    if (nx.type === "arc") {
      const after = path[i + 2];
      if (!after || after.type !== "line") throw new Error("Arcs in a contour must sit between two lines");
      const th = V2.cross(dirOf(e), dirOf(after)) >= 0 ? Math.acos(Math.max(-1, Math.min(1, V2.dot(dirOf(e), dirOf(after))))) : -Math.acos(Math.max(-1, Math.min(1, V2.dot(dirOf(e), dirOf(after)))));
      segs[segs.length - 1].turn = { A: Math.abs(th), sgn: th >= 0 ? 1 : -1, rc: nx.r, arc: true };
      i += 2;
    } else {
      const th = Math.atan2(V2.cross(dirOf(e), dirOf(nx)), V2.dot(dirOf(e), dirOf(nx)));
      if (Math.abs(th) < 1e-9) { segs[segs.length - 1].len += 0; i += 1; continue; }
      const sgn = th >= 0 ? 1 : -1;
      const rc = sgn > 0 ? Rr + w0 + T : Rr - w0;
      segs[segs.length - 1].turn = { A: Math.abs(th), sgn, rc, arc: false };
      i += 1;
    }
  }
  // inner bend radius from the radius at the sketch curve (w = 0)
  for (const sg of segs) if (sg.turn) {
    const t = sg.turn;
    t.R = t.sgn > 0 ? t.rc - w0 - T : t.rc + w0;
    if (t.R < -1e-9) throw new Error("A bend radius in the contour is smaller than the sheet thickness allows");
    t.R = Math.max(0, t.R);
    if (!t.arc) { const sb = t.rc * Math.tan(t.A / 2); sg.setB = sb; }
  }
  for (let k = 1; k < segs.length; k++) if (segs[k - 1].turn && !segs[k - 1].turn.arc) segs[k].setA = segs[k - 1].setB;
  for (const sg of segs) { sg.L = sg.len - sg.setA - sg.setB; if (sg.L < -1e-6) throw new Error("A contour segment is too short for its bend"); sg.L = Math.max(0, sg.L); }
  // flat frame: u along the first line, v against the sketch normal, w to the left of the path
  const pl = s.plane;
  const N = V.norm(pl.n);
  const d0 = segs[0].dir;
  const x = V.norm(V.sub(K.toWorld(pl, path[0].a[0] + d0[0], path[0].a[1] + d0[1]), K.toWorld(pl, path[0].a[0], path[0].a[1])));
  const z = V.cross(N, x);
  const frame = fromFrame(K.toWorld(pl, path[0].a[0], path[0].a[1]), x, V.mul(N, -1), z);
  const D = Math.max(1e-3, M.fval(P, f, "distance"));
  const D2 = f.direction === "two" ? Math.max(0, M.fval(P, f, "distance2")) : 0;
  const [vA, vB] = f.direction === "sym" ? [-D / 2, D / 2] : f.direction === "two" ? [-D, D2] : [-D, 0];
  const d = G.newData({ T, K: rule.K, R: Rr, rule: rule.id, w0, frame });
  applyRule(d, rule);
  d.R = Rr;
  d.flanges.F1.feature = f.id;
  const L0 = segs[0].L;
  const base = [[0, vA], [L0, vA], [L0, vB], [0, vB]];
  d.flanges.F1.seeds = L0 > 1e-6 ? [0.25, 0.5, 0.75].map((k) => [L0 * k, vA + (vB - vA) * (1 - k)]) : [];
  const tools = L0 > 1e-6 ? [G.flatPrism(frame, base, w0, w0 + T)] : [];
  const turns = segs.filter((sg) => sg.turn);
  if (turns.length) {
    const sgnBase = turns[0].turn.sgn;
    const e = { fid: "F1", a: [L0, 0], d: [0, 1], q: [1, 0], len: vB - vA };
    const chainSegs = segs.slice(0, -1).map((sg, k) => ({ A: sg.turn.A, R: sg.turn.R, rel: sg.turn.sgn * sgnBase, L: segs[k + 1].L }));
    const r = chainOnEdge(d, e, chainSegs, { s0: vA, s1: vB, us: 0, sgn: sgnBase, feature: f.id });
    tools.push(...r.tools);
    r.flanges.forEach((fid, k) => { d.flanges[fid].len = chainSegs[k].L; });
  }
  if (!tools.length) throw new Error("The contour is too short");
  const solid = G.fuseList(tools);
  const id = f.newBody || `${f.id}_b`;
  if (!d.flanges.F1.seeds.length) d.flanges.F1.seeds = [];
  putBody(st, id, solid, d, f);
  return { affected: [id] };
}

// ================================================================ registration data
const deps = (keys) => (f) => {
  const bodies = [];
  for (const k of keys) for (const r of f[k] || []) if (r && r.body && !bodies.includes(r.body)) bodies.push(r.body);
  return { sketches: [f.p1, f.p2].filter(Boolean).map((p) => p.sketch), cplanes: [], bodies, features: [], geo: [] };
};
export const EXTRA_FEATURES = {
  smConvert: {
    label: "Convert to Sheet Metal", stem: "ConvertToSheetMetal", icon: "ConvertToSheetMetalCmd",
    fields: { bendRadius: "length" }, apply: applyConvert,
    deps: deps(["face"]), touches: (f) => (f.face || []).map((r) => r.body),
  },
  smLoft: {
    label: "Lofted Flange", stem: "LoftedFlange", icon: "FusionSheetMetalLoftCommand",
    fields: {}, makesBodies: true, apply: applyLoft,
    deps: deps([]), touches: () => [],
  },
  smContourFlange: {
    label: "Contour Flange", stem: "Flange", icon: "FusionSheetMetalFlangeCommand",
    fields: { distance: "length", distance2: "length", bendRadius: "length" }, makesBodies: true, apply: applyContour,
    deps: (f) => ({ sketches: [...new Set((f.curves || []).map((c) => c.sketch))], cplanes: [], bodies: [], features: [], geo: [] }), touches: () => [],
  },
  smJoinBend: {
    label: "Join by Bend", stem: "JoinByBend", icon: "FusionJoinByBendCommand",
    fields: { bendRadius: "length" }, apply: applyJoinBend,
    deps: deps(["edges"]), touches: (f) => (f.edges || []).map((r) => r.body),
  },
};

// ================================================================ dialogs
export function openConvert(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const pre = opts.preselect || (editId ? [] : beginModelCommand(app));
  const rule = ruleNow(app);
  let detected = null;
  return app.ui.dialog.open({
    id: "ConvertToSheetMetalCmd", title: "Convert to Sheet Metal", icon: "ConvertToSheetMetalCmd",
    featureLabel: "Convert to Sheet Metal", editId,
    help: "Turns a solid body of even thickness into a sheet metal body.",
    preselect: pre.filter((r) => r.kind === "face"),
    labelWidth: 128, ctrlWidth: 170,
    rows: [
      { id: "face", type: "selection", label: "Source", kinds: ["face"], max: 1, planar: true, prompt: "Select a base face to infer body thickness.", filter: (r, dlg) => !isSheet(dlg, r) && r.planar !== false },
      { id: "thick", type: "text", text: () => `Thickness (Detected): ${detected === null ? "-" : `${detected.toFixed(2)} mm`}` },
      { id: "bendRadius", type: "value", label: "Bend Radius", kind: "length", default: `${rule.R.toFixed(2)} mm`, nonNegative: true, tooltip: "Radius of the bends made at sharp edges." },
    ],
    init(dlg) { if (f0) { dlg.values.face = (f0.face || []).map(asFace); if (f0.bendRadius) dlg.values.bendRadius = f0.bendRadius; } },
    onChange(id, dlg) {
      if (id !== "face") return;
      const r = (dlg.values.face || [])[0];
      detected = null;
      if (r) { const b = dlg.baseState.bodies.get(r.body); try { detected = detectThickness(b.shape, r.index); } catch { detected = null; } }
      dlg.refresh();
    },
    build(v) {
      const r = (v.face || [])[0];
      if (!r) return null;
      return { type: "smConvert", face: [plainRef(r)], bendRadius: v.bendRadius, rv: 0 };
    },
  });
}
export function openJoinByBend(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const pre = opts.preselect || (editId ? [] : beginModelCommand(app));
  const rule = ruleNow(app);
  return app.ui.dialog.open({
    id: "FusionJoinByBendCommand", title: "Join by Bend", icon: "FusionJoinByBendCommand",
    featureLabel: "Join by Bend", editId,
    help: "Joins two sheet metal bodies with a bend.",
    preselect: pre.filter((r) => r.kind === "edge"),
    labelWidth: 128, ctrlWidth: 170,
    rows: [
      { id: "edges", type: "selection", label: "Edges", kinds: ["edge"], max: 2, prompt: "Select two edges to join separate sheet metal bodies into one.", filter: (r, dlg) => isSheet(dlg, r) && !(dlg.values.edges || []).some((x) => x.body === r.body && x.index !== r.index), advance: false },
      { id: "extension", type: "buttons", label: "Face extension", default: "aligned", options: [{ value: "aligned", label: "Aligned", icon: "oneSide" }, { value: "perpendicular", label: "Perpendicular", icon: "inside" }] },
      { id: "bendRadius", type: "value", label: "Bend radius", kind: "length", default: `${rule.R.toFixed(2)} mm`, nonNegative: true, tooltip: "Specifies the inside radius of the bend." },
      { id: "reliefShape", type: "dropdown", label: "Relief shape", default: rule.relief.shape, options: ["Round", "Straight", "Tear"].map((s) => ({ value: s, label: s })) },
    ],
    init(dlg) { if (f0) { dlg.values.edges = (f0.edges || []).map((r) => asEdge(dlg, r)).filter(Boolean); for (const k of ["extension", "bendRadius", "reliefShape"]) if (f0[k] !== undefined) dlg.values[k] = f0[k]; } },
    build(v) {
      if ((v.edges || []).length < 2) return null;
      return { type: "smJoinBend", edges: v.edges.map(plainRef), extension: v.extension, bendRadius: v.bendRadius, reliefShape: v.reliefShape };
    },
  });
}
