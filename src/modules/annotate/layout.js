// World-space layout of PMI graphics on their annotation planes: leaders with landings, arrow /
// dot / datum-triangle terminators, linear / diameter / radius / angular dimensions and text blocks.
// Output ("prims"): {segs:[[a,b]], tris:[[a,b,c]], texts:[{block, c, rx, ry, nf, w, h}], flips:[[n, dir]], main}
// Text is always laid out to read from the viewer's side (readFrame): seen from behind, the text
// mirrors back; upside down, it turns 180 degrees, like Fusion's annotations.
import { V } from "./geom.js";
import { blockSize } from "./text.js";

const neg = (a) => [-a[0], -a[1], -a[2]];
const add3 = (...vs) => vs.reduce((s, v) => V.add(s, v), [0, 0, 0]);
export const GAP = 0.35; // text gap from lines (H)
export const ARROW_L = 0.9; // arrow length (H)
export const ARROW_W = 0.17; // arrow half width (H)

/** Reading frame of text running along `dir` on a plane with normal n, as seen from `view`. */
export function readFrame(n, dir, view) {
  const f = (view && view.f) || [0, 0, -1];
  const sr = (view && view.r) || [1, 0, 0];
  const su = (view && view.u) || [0, 1, 0];
  const nf = V.dot(n, f) > 0 ? neg(n) : n;
  let rx = V.norm(dir);
  const d = V.dot(rx, sr);
  if (d < -1e-3 || (Math.abs(d) <= 1e-3 && V.dot(V.cross(nf, rx), su) < 0)) rx = neg(rx);
  const ry = V.norm(V.cross(nf, rx));
  return { rx, ry, nf };
}
export function flipKey(flips, view) {
  if (!view) return "";
  return flips.map(([n, d]) => { const fr = readFrame(n, d, view); return `${fr.nf === n ? 1 : 0}${V.dot(fr.rx, d) > 0 ? 1 : 0}`; }).join("");
}

export function newPrims() { return { segs: [], tris: [], texts: [], flips: [], main: null }; }

/** Filled arrow with its tip at `tip`, its body along unit `back` (toward the tail), in plane n. */
export function arrow(P, tip, back, n, H) {
  const u = V.norm(back);
  const p = V.norm(V.cross(n, u));
  const L = ARROW_L * H, W = ARROW_W * H;
  const b = V.add(tip, V.mul(u, L));
  P.tris.push([tip, V.add(b, V.mul(p, W)), V.sub(b, V.mul(p, W))]);
  return b;
}
export function dot(P, c, n, H, r = 0.22) {
  const x = Math.abs(n[2]) < 0.9 ? V.norm(V.cross(n, [0, 0, 1])) : V.norm(V.cross(n, [1, 0, 0]));
  const y = V.cross(n, x);
  const N = 14, R = r * H;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    P.tris.push([c, add3(c, V.mul(x, R * Math.cos(a0)), V.mul(y, R * Math.sin(a0))), add3(c, V.mul(x, R * Math.cos(a1)), V.mul(y, R * Math.sin(a1)))]);
  }
}
/** Filled datum triangle: base centred on `base`, pointing along unit `up`. */
export function datumTriangle(P, base, up, n, H) {
  const u = V.norm(up), p = V.norm(V.cross(n, u));
  const hb = 0.55 * H, ht = 0.95 * H;
  P.tris.push([V.add(base, V.mul(p, hb)), V.sub(base, V.mul(p, hb)), V.add(base, V.mul(u, ht))]);
  return V.add(base, V.mul(u, ht));
}

/**
 * Place a block: anchor point + justification ('left' | 'right' | 'center', 'middle' | 'top' | 'bottom').
 * Returns the text record {block, c, rx, ry, nf, w, h} (w/h: content size in mm).
 */
export function placeBlock(P, block, at, fr, H, hj = "left", vj = "middle") {
  const sz = blockSize(block);
  const w = sz.w * H, h = sz.h * H;
  const dx = hj === "left" ? w / 2 : hj === "right" ? -w / 2 : 0;
  const dy = vj === "middle" ? 0 : vj === "top" ? -h / 2 : h / 2;
  const c = add3(at, V.mul(fr.rx, dx), V.mul(fr.ry, dy));
  const t = { block, c, rx: fr.rx, ry: fr.ry, nf: fr.nf, w, h, H };
  P.texts.push(t);
  return t;
}
/** Corners of a text record (content box grown by `pad` mm): [tl, tr, br, bl]. */
export function textCorners(t, pad = 0) {
  const hw = t.w / 2 + pad, hh = t.h / 2 + pad;
  return [
    add3(t.c, V.mul(t.rx, -hw), V.mul(t.ry, hh)), add3(t.c, V.mul(t.rx, hw), V.mul(t.ry, hh)),
    add3(t.c, V.mul(t.rx, hw), V.mul(t.ry, -hh)), add3(t.c, V.mul(t.rx, -hw), V.mul(t.ry, -hh)),
  ];
}

// ---------------------------------------------------------------- leader annotations
/**
 * Leader note / hole note / feature control frame on a leader.
 * o = {T, n, x, pos:[du,dv], ext, perpendicular, block, H, view, term:'arrow'|'dot'|'none', vAlign,
 *      circle?:{c, a, r} (the leader meets this circle: hole notes, diameter dimensions)}
 * pos is relative to T (or to the circle centre).
 */
export function leaderNote(o) {
  const P = newPrims();
  const { n, x, H } = o;
  const y = V.cross(n, x);
  const base = o.circle ? o.circle.c : o.T;
  const pos = o.pos || [3 * H, 3 * H];
  const B = add3(base, V.mul(x, pos[0]), V.mul(y, pos[1]));
  let T = o.T;
  if (o.circle) {
    const a = V.norm(o.circle.a);
    let v = V.sub(B, o.circle.c);
    v = V.sub(v, V.mul(a, V.dot(v, a)));
    if (V.len(v) < 1e-9) v = x;
    T = V.add(o.circle.c, V.mul(V.norm(v), o.circle.r));
  }
  const tdir = o.perpendicular ? y : x;
  const ext = Number(o.ext) || 0;
  const L = V.add(B, V.mul(tdir, ext));
  const fr = readFrame(n, tdir, o.view);
  P.flips.push([n, tdir]);
  let s = V.dot(V.sub(L, B), fr.rx);
  if (Math.abs(ext) < 1e-9) s = V.dot(V.sub(B, T), fr.rx);
  const right = s >= 0;
  if (V.len(V.sub(B, T)) > 1e-9) {
    P.segs.push([T, B]);
    const back = V.sub(B, T);
    if (o.term === "arrow" && V.len(back) > ARROW_L * H * 0.6) arrow(P, T, back, n, H);
    else if (o.term === "dot") dot(P, T, n, H);
  }
  if (Math.abs(ext) > 1e-9) P.segs.push([B, L]);
  const at = V.add(L, V.mul(fr.rx, (right ? 1 : -1) * GAP * H));
  const t = placeBlock(P, o.block, at, fr, H, right ? "left" : "right", o.vAlign || "middle");
  P.main = t;
  P.target = T;
  P.bend = B;
  P.landing = L;
  return P;
}

// ---------------------------------------------------------------- dimensions
/**
 * Linear dimension between A and B measured along unit u (in the plane n, x).
 * o = {A, B, u, n, x, pos:[du,dv] (relative to the midpoint), block, H, view, perpendicular}
 */
export function linearDim(o) {
  const P = newPrims();
  const { n, x, H } = o;
  const y = V.cross(n, x);
  const A = o.A;
  const B = V.sub(o.B, V.mul(n, V.dot(V.sub(o.B, A), n)));
  const Mid = V.mul(V.add(A, B), 0.5);
  const pos = o.pos || [0, 3 * H];
  let Pp = add3(Mid, V.mul(x, pos[0]), V.mul(y, pos[1]));
  Pp = V.sub(Pp, V.mul(n, V.dot(V.sub(Pp, A), n)));
  let u = V.sub(o.u, V.mul(n, V.dot(o.u, n)));
  u = V.len(u) > 1e-9 ? V.norm(u) : x;
  const w = V.norm(V.cross(n, u));
  const D1 = V.add(A, V.mul(w, V.dot(V.sub(Pp, A), w)));
  const D2 = V.add(B, V.mul(w, V.dot(V.sub(Pp, B), w)));
  const gap = 0.3 * H, over = 0.6 * H;
  for (const [X, D] of [[A, D1], [B, D2]]) {
    const sd = V.dot(V.sub(D, X), w);
    if (Math.abs(sd) > gap) {
      const sg = Math.sign(sd);
      P.segs.push([V.add(X, V.mul(w, sg * gap)), V.add(D, V.mul(w, sg * over))]);
    }
  }
  let uu = V.sub(D2, D1);
  const len = V.len(uu);
  uu = len > 1e-9 ? V.norm(uu) : u;
  const tdir = o.perpendicular ? w : uu;
  const fr = readFrame(n, tdir, o.view);
  P.flips.push([n, tdir]);
  // text follows the placement point along the dimension line, above the line in the reading frame
  const tpos = V.dot(V.sub(Pp, D1), uu);
  const Q = V.add(D1, V.mul(uu, tpos));
  const sz = blockSize(o.block);
  const tw = sz.w * H, th = sz.h * H;
  let t;
  if (o.perpendicular) {
    const side = Math.sign(V.dot(V.sub(D1, A), w)) || 1; // beyond the line, away from the geometry
    const hj = V.dot(fr.rx, w) * side >= 0 ? "left" : "right";
    t = placeBlock(P, o.block, V.add(Q, V.mul(w, side * GAP * H)), fr, H, hj, "middle");
  } else t = placeBlock(P, o.block, V.add(Q, V.mul(fr.ry, GAP * H)), fr, H, "center", "bottom");
  // dimension line (extended to reach text placed outside the extension lines)
  const half = (o.perpendicular ? th : tw) / 2 + GAP * H;
  let a0 = 0, a1 = len;
  if (tpos - half < 0) a0 = Math.min(0, tpos - half);
  if (tpos + half > len) a1 = Math.max(len, tpos + half);
  const inside = len > 2.6 * ARROW_L * H;
  if (!inside) { a0 = Math.min(a0, -1.6 * ARROW_L * H); a1 = Math.max(a1, len + 1.6 * ARROW_L * H); }
  P.segs.push([V.add(D1, V.mul(uu, a0)), V.add(D1, V.mul(uu, a1))]);
  if (len > 1e-9) {
    arrow(P, D1, inside ? uu : neg(uu), n, H);
    arrow(P, D2, inside ? neg(uu) : uu, n, H);
  }
  P.main = t;
  P.value = len;
  return P;
}

/**
 * Angular dimension at vertex Vx between unit rays d1, d2 (in plane n, x).
 * o = {Vx, d1, d2, n, x, pos (relative to Vx), block (null: compute value only), H, view, sector, lockedSector, ext1, ext2}
 * Returns prims + {angle (deg), sector:[start, end] directions}.
 */
export function angularDim(o, makeBlock) {
  const P = newPrims();
  const { n, H } = o;
  const e1 = V.norm(V.sub(o.d1, V.mul(n, V.dot(o.d1, n))));
  const e2 = V.cross(n, e1);
  const ang = (v) => { let a = Math.atan2(V.dot(v, e2), V.dot(v, e1)); if (a < 0) a += 2 * Math.PI; return a; };
  const dirAt = (a) => V.add(V.mul(e1, Math.cos(a)), V.mul(e2, Math.sin(a)));
  const t2 = ang(o.d2);
  const rays = [0, t2, Math.PI, (t2 + Math.PI) % (2 * Math.PI)].map((a) => ({ a }));
  rays.sort((p, q) => p.a - q.a);
  const sectors = rays.map((r, i) => { const nx = rays[(i + 1) % rays.length]; let s = nx.a - r.a; if (s <= 0) s += 2 * Math.PI; return { a0: r.a, span: s }; }).filter((s) => s.span > 1e-6);
  const x = o.x, y = V.cross(n, x);
  const pos = o.pos || [3 * H, 3 * H];
  const Pp = add3(o.Vx, V.mul(x, pos[0]), V.mul(y, pos[1]));
  const vp = V.sub(Pp, o.Vx);
  const phi = ang(vp);
  const inSector = (s, a) => { let d = a - s.a0; if (d < 0) d += 2 * Math.PI; return d <= s.span + 1e-9; };
  const midDist = (s, a) => { let m = s.a0 + s.span / 2; let d = Math.abs(((a - m + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); return d; };
  let sec = sectors.find((s) => inSector(s, phi)) || sectors[0];
  if (o.sector === "acute" || o.sector === "obtuse") {
    const pool = sectors.filter((s) => (o.sector === "acute" ? s.span <= Math.PI / 2 + 1e-6 : s.span >= Math.PI / 2 - 1e-6));
    if (pool.length) sec = pool.sort((p, q) => midDist(p, phi) - midDist(q, phi))[0];
  } else if (o.sector === "locked" && o.lockedSector) {
    const want = o.lockedSector;
    const hit = sectors.find((s) => Math.abs(s.a0 - want[0]) < 1e-3 && Math.abs(s.span - want[1]) < 1e-3);
    if (hit) sec = hit;
  }
  const R = Math.max(2 * H, V.len(V.sub(vp, V.mul(n, V.dot(vp, n)))));
  const N = Math.max(8, Math.ceil((sec.span * 180) / Math.PI / 3));
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const q = V.add(o.Vx, V.mul(dirAt(sec.a0 + (sec.span * i) / N), R));
    if (prev) P.segs.push([prev, q]);
    prev = q;
  }
  const s0 = sec.a0, s1 = sec.a0 + sec.span;
  const p0 = V.add(o.Vx, V.mul(dirAt(s0), R)), p1 = V.add(o.Vx, V.mul(dirAt(s1), R));
  const tan = (a) => V.add(V.mul(e1, -Math.sin(a)), V.mul(e2, Math.cos(a)));
  const arcLen = sec.span * R;
  if (arcLen > 2.4 * ARROW_L * H) { arrow(P, p0, tan(s0), n, H); arrow(P, p1, neg(tan(s1)), n, H); }
  else { arrow(P, p0, neg(tan(s0)), n, H); arrow(P, p1, tan(s1), n, H); }
  // extension lines from the measured geometry out to the arc
  for (const [a, extOf] of [[s0, o.extOf], [s1, o.extOf]]) {
    const d = dirAt(a);
    const ext = extOf ? Math.max(0, extOf(d)) : 0;
    if (R > ext + 0.3 * H) P.segs.push([V.add(o.Vx, V.mul(d, ext + 0.3 * H)), V.add(o.Vx, V.mul(d, R + 0.6 * H))]);
  }
  const angle = (sec.span * 180) / Math.PI;
  const block = makeBlock ? makeBlock(angle) : o.block;
  let ta = phi;
  if (!inSector(sec, ta)) ta = sec.a0 + sec.span / 2;
  const tdir = tan(ta);
  const fr = readFrame(n, tdir, o.view);
  P.flips.push([n, tdir]);
  const at = V.add(o.Vx, V.mul(dirAt(ta), R + GAP * H));
  const vj = V.dot(fr.ry, dirAt(ta)) >= 0 ? "bottom" : "top";
  P.main = placeBlock(P, block, at, fr, H, "center", vj);
  P.angle = angle;
  P.sectorRange = [s0, sec.span];
  return P;
}
