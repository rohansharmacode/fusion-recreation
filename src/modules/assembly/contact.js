// assembly: contact between components while they are dragged. Mesh based (the kernel is only asked for a
// mesh once per shape), so a pointer move stays cheap. Two bodies interfere when an edge of one passes through
// a face of the other, or when a point just under the surface of one lies inside the other (aligned faces).
import * as K from "../../kernel.js";
import * as X from "./math.js";
import * as F from "./features.js";

const DELTA = 0.01; // mm: touching faces do not count as contact
const DIR = [0.5377, 0.2913, 0.7911];
const meshes = new WeakMap();
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Line (o + t d) against triangle abc: true when t0 < t < t1 and the hit is inside by the margin e. */
function hitTri(o, d, a, b, c, t0, t1, e) {
  const e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return false;
  const f = 1 / det, s = sub(o, a), u = f * dot(s, h);
  if (u < e || u > 1 - e) return false;
  const q = cross(s, e1), v = f * dot(d, q);
  if (v < e || u + v > 1 - e) return false;
  const t = f * dot(e2, q);
  return t > t0 && t < t1;
}
function insideTris(p, tris) {
  let n = 0;
  for (const t of tris) if (hitTri(p, DIR, t[0], t[1], t[2], 1e-9, Infinity, -1e-9)) n++;
  return n % 2 === 1;
}
function trisOf(v, idx) {
  const out = [], P = (i) => [v[3 * i], v[3 * i + 1], v[3 * i + 2]];
  for (let k = 0; k + 2 < idx.length; k += 3) out.push([P(idx[k]), P(idx[k + 1]), P(idx[k + 2])]);
  return out;
}
/** Local mesh of a shape: {v, t, samples: points just under the surface}. Null for meshes that are too large. */
function meshOf(shape) {
  let m = meshes.get(shape);
  if (m !== undefined) return m;
  m = null;
  try {
    const d = K.meshBody(shape);
    if (d.triangles.length && d.triangles.length <= 9000) {
      const tris = trisOf(d.vertices, d.triangles), samples = [];
      for (const t of tris) {
        const n = cross(sub(t[1], t[0]), sub(t[2], t[0])), l = Math.hypot(n[0], n[1], n[2]);
        if (l < 1e-9) continue;
        const c = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3];
        const a = c.map((x, i) => x - (n[i] / l) * DELTA), b = c.map((x, i) => x + (n[i] / l) * DELTA);
        if (insideTris(a, tris)) samples.push(a); else if (insideTris(b, tris)) samples.push(b);
      }
      m = { v: d.vertices, t: d.triangles, samples };
    }
  } catch { m = null; }
  meshes.set(shape, m);
  return m;
}
const bbOf = (pts) => { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (const p of pts) for (let i = 0; i < 3; i++) { if (p[i] < b[i]) b[i] = p[i]; if (p[i] > b[i + 3]) b[i + 3] = p[i]; } return b; };
const bbHit = (a, b) => a[0] < b[3] && b[0] < a[3] && a[1] < b[4] && b[1] < a[4] && a[2] < b[5] && b[2] < a[5];
const inBB = (p, b) => p[0] > b[0] && p[0] < b[3] && p[1] > b[1] && p[1] < b[4] && p[2] > b[2] && p[2] < b[5];
/** A mesh under the rigid display delta D (null = as evaluated). */
function placed(mesh, D) {
  const mv = (p) => (D ? X.apply(D, p) : p);
  const n = mesh.v.length / 3, v = new Array(n);
  for (let i = 0; i < n; i++) v[i] = mv([mesh.v[3 * i], mesh.v[3 * i + 1], mesh.v[3 * i + 2]]);
  const tris = [];
  for (let k = 0; k + 2 < mesh.t.length; k += 3) { const t = [v[mesh.t[k]], v[mesh.t[k + 1]], v[mesh.t[k + 2]]]; t.bb = bbOf(t); tris.push(t); }
  return { tris, bb: bbOf(v), samples: mesh.samples.map(mv) };
}
function edgesCross(ta, tb) {
  for (let i = 0; i < 3; i++) {
    const p = ta[i], d = sub(ta[(i + 1) % 3], p), len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-9) continue;
    const te = Math.min(0.49, (DELTA / 10) / len);
    if (hitTri(p, d, tb[0], tb[1], tb[2], te, 1 - te, 1e-7)) return true;
  }
  return false;
}
const sunk = (A, B) => A.samples.some((p) => inBB(p, B.bb) && insideTris(p, B.tris));
function collide(A, B) {
  if (!bbHit(A.bb, B.bb)) return false;
  if (A.tris.length * B.tris.length <= 4e6) {
    for (const ta of A.tris) {
      if (!bbHit(ta.bb, B.bb)) continue;
      for (const tb of B.tris) if (bbHit(ta.bb, tb.bb) && (edgesCross(ta, tb) || edgesCross(tb, ta))) return true;
    }
  }
  return sunk(A, B) || sunk(B, A);
}

/** Contact mode of a document: "off", "all" or "sets". */
export const contactMode = (doc) => (doc && doc.contact && (doc.contact.mode === "all" || doc.contact.mode === "sets") ? doc.contact.mode : "off");

/**
 * Contact checker for a drag on the evaluated state, or null when contact is off. hits(T) is true when the
 * poses T (Map oid -> world 3x4) make two bodies interfere that did not interfere before the drag.
 */
export function contactSetup(app, model) {
  const doc = app.doc, mode = contactMode(doc);
  if (mode === "off") return null;
  const st = app.result.state;
  const sets = mode === "sets" ? (doc.contactSets || []).filter((s) => !s.suppressed).map((s) => new Set(s.occs || [])) : null;
  if (sets && !sets.length) return null;
  const bodies = [];
  for (const [id, b] of st.bodies) {
    if (!b || !b.shape) continue;
    const o = F.ownerOf(st, id), path = F.pathOf(st, o);
    if (sets && !sets.some((s) => path.some((n) => s.has(n)))) continue;
    bodies.push({ id, o, path, shape: b.shape, at: new Map() });
  }
  const pairOk = (a, b) => {
    if (a.o === b.o) return false;
    if (!sets) return true;
    return sets.some((s) => { const na = a.path.find((n) => s.has(n)), nb = b.path.find((n) => s.has(n)); return na && nb && na !== nb; });
  };
  const deltaOf = (b, T) => {
    if (!T || b.o === F.ROOT) return null;
    const m = T.get(b.o), base = model.T.get(b.o);
    return m && base && !X.same(m, base, 1e-9) ? X.mul(m, X.inv(base)) : null;
  };
  const place = (b, D) => {
    const mesh = meshOf(b.shape);
    if (!mesh) return null;
    const key = D ? D.map((x) => x.toFixed(5)).join(",") : "";
    if (!b.at.has(key)) { if (b.at.size > 3) b.at.clear(); b.at.set(key, placed(mesh, D)); }
    return b.at.get(key);
  };
  const test = (T, skip) => {
    const out = [];
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j], key = `${a.id}|${b.id}`;
        if (!pairOk(a, b) || (skip && skip.has(key))) continue;
        const Da = deltaOf(a, T), Db = deltaOf(b, T);
        if (T && ((!Da && !Db) || (Da && Db && X.same(Da, Db, 1e-9)))) continue; // nothing moved between the two
        const A = place(a, Da), B = place(b, Db);
        if (A && B && collide(A, B)) { if (skip) return [key]; out.push(key); }
      }
    }
    return out;
  };
  // pairs that interfere already do not block the drag
  const before = new Set(test(null, null));
  return { hits: (T) => test(T, before).length > 0, count: bodies.length };
}
