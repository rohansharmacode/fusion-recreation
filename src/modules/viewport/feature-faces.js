// Face-to-feature ownership: which faces of the current bodies a timeline feature created or changed.
//
// The kernel keeps no face history, so ownership comes from a geometric comparison of each body before
// and after every feature (the evaluator keeps the state after each feature in app.evaluator.cache).
// A face of the "after" body that lies on the same surface as a face of a "before" body, with an
// overlapping extent, pre-exists: it keeps its creator (and counts as changed when its boundary moved).
// Any other face was created by the feature. A rigid move or uniform scale keeps the face order, so
// ownership is carried index by index. The comparison uses the plain topology cache (K.topoOf), is done
// once per evaluator state (WeakMap: unchanged steps cost nothing on the next rebuild) and only when a
// feature highlight is asked for.

const OWN = new WeakMap(); // state -> Map(bodyId -> {shape, cr: [featureId|null], ch: [Set|null]})
const BYRESULT = new WeakMap(); // result -> {own, byFeature: Map(featureId -> [{body, index}] | null)}
const FBOX = new WeakMap(); // topo -> [{min, max}] per face

const TOL = 1e-4;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (a, b, tol = TOL) => !!a && !!b && Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol && Math.abs(a[2] - b[2]) < tol;

/** Bounding boxes of the faces of a topology record, from the edge data (no kernel calls). */
function faceBoxes(T) {
  let out = FBOX.get(T);
  if (out) return out;
  out = T.faces.map(() => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
  const add = (b, p, r = [0, 0, 0]) => {
    for (let i = 0; i < 3; i++) { if (p[i] - r[i] < b.min[i]) b.min[i] = p[i] - r[i]; if (p[i] + r[i] > b.max[i]) b.max[i] = p[i] + r[i]; }
  };
  for (const e of T.edges) {
    for (const fi of e.faces || []) {
      const b = out[fi];
      if (!b) continue;
      add(b, e.s); add(b, e.t); add(b, e.m);
      if (e.type === "CIRCLE" && e.c && e.a && e.r) add(b, e.c, e.a.map((x) => e.r * Math.sqrt(Math.max(0, 1 - x * x))));
    }
  }
  T.faces.forEach((f, i) => {
    const b = out[i];
    if (f.type === "SPHERE" && f.ao && f.r) add(b, f.ao, [f.r, f.r, f.r]);
    if (f.c) add(b, f.c);
    if (b.min[0] === Infinity) { b.min = [0, 0, 0]; b.max = [0, 0, 0]; }
  });
  FBOX.set(T, out);
  return out;
}
const boxesTouch = (a, b) => { for (let i = 0; i < 3; i++) if (a.max[i] < b.min[i] - TOL || b.max[i] < a.min[i] - TOL) return false; return true; };
const boxesEqual = (a, b) => near(a.min, b.min, 1e-3) && near(a.max, b.max, 1e-3);

const ANALYTIC = new Set(["PLANE", "CYLINDRE", "CONE", "SPHERE"]);
/** Bucket key of a face for the surface lookup: type plus a rounded scalar (plane offset, radius, point sum). */
function keyNum(f) {
  if (f.type === "PLANE") return f.d || 0;
  if (ANALYTIC.has(f.type)) return f.r || 0;
  return f.c ? f.c[0] + f.c[1] + f.c[2] : 0;
}
function sameAxis(a, b) {
  if (!a.a || !b.a || !a.ao || !b.ao) return false;
  if (Math.abs(Math.abs(dot(a.a, b.a)) - 1) > 1e-6) return false;
  return len(cross(sub(b.ao, a.ao), a.a)) < TOL;
}
/** Do two faces lie on the same surface (with the same outward side for planes)? */
function sameSurface(a, b) {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "PLANE": return !!a.n && !!b.n && dot(a.n, b.n) > 1 - 1e-6 && Math.abs((a.d || 0) - (b.d || 0)) < TOL;
    case "CYLINDRE": return Math.abs(a.r - b.r) < TOL && sameAxis(a, b);
    case "CONE": return Math.abs(a.r - b.r) < TOL && sameAxis(a, b) && Math.abs(dot(sub(b.ao, a.ao), a.a)) < TOL;
    case "SPHERE": return Math.abs(a.r - b.r) < TOL && near(a.ao, b.ao);
    default: return near(a.c, b.c) && (!a.n || !b.n || dot(a.n, b.n) > 1 - 1e-4);
  }
}

/** Index of the faces of some shapes by surface bucket. entries: [{rec, T}] */
function surfaceIndex(entries) {
  const map = new Map();
  for (const en of entries) {
    en.T.faces.forEach((f, i) => {
      const k = `${f.type}|${Math.round(keyNum(f) * 1e3)}`;
      let l = map.get(k);
      if (!l) map.set(k, (l = []));
      l.push({ en, i });
    });
  }
  return {
    lookup(f) {
      const q = Math.round(keyNum(f) * 1e3);
      const out = [];
      for (const d of [0, -1, 1]) { const l = map.get(`${f.type}|${q + d}`); if (l) out.push(...l); }
      return out;
    },
  };
}

/** Same faces in the same order after a rigid move or a uniform scale (face centre distances keep one ratio). */
function movedCopy(T0, T1) {
  const n = T0.faces.length;
  if (!n || n !== T1.faces.length) return false;
  let moved = false;
  for (let i = 0; i < n; i++) {
    const a = T0.faces[i], b = T1.faces[i];
    if (a.type !== b.type || !a.c || !b.c) return false;
    if (!moved && !near(a.c, b.c)) moved = true;
  }
  if (!moved) return false;
  let ratio = null;
  const pairs = Math.min(n, 24);
  for (let k = 0; k < pairs; k++) {
    const i = Math.floor((k * n) / pairs), j = (i * 7 + 3 + k) % n;
    if (i === j) continue;
    const d0 = len(sub(T0.faces[i].c, T0.faces[j].c)), d1 = len(sub(T1.faces[i].c, T1.faces[j].c));
    if (d0 < 1e-6) { if (d1 > 1e-4) return false; continue; }
    const r = d1 / d0;
    if (ratio == null) ratio = r;
    else if (Math.abs(r - ratio) > 1e-5 * Math.max(1, ratio)) return false;
  }
  if (ratio == null) ratio = 1;
  for (let i = 0; i < n; i++) {
    const a = T0.faces[i], b = T1.faces[i];
    if (a.r != null && b.r != null && Math.abs(b.r - a.r * ratio) > 1e-4 * Math.max(1, a.r)) return false;
  }
  return true;
}

const withChange = (set, fid) => { const s = new Set(set || []); s.add(fid); return s; };

/** Ownership records of the bodies of state s1, given the records of the state before it and the feature between. */
function stepOwnership(K, own0, s0, s1, fid) {
  const out = new Map();
  const ids = [...s1.bodies.keys()].sort((a, b) => (a.includes("@") ? 1 : 0) - (b.includes("@") ? 1 : 0));
  // bodies of the state before that this step consumed or rebuilt: their faces may live on in other bodies
  const donors = [];
  if (s0) for (const [id, b0] of s0.bodies) { const b1 = s1.bodies.get(id); if ((!b1 || b1.shape !== b0.shape) && own0.get(id)) donors.push(id); }
  let donorIndex = null;
  for (const id of ids) {
    const b1 = s1.bodies.get(id);
    const shape = b1 && b1.shape;
    if (!shape || typeof shape !== "object") continue;
    const prev = own0.get(id);
    if (prev && prev.shape === shape) { out.set(id, prev); continue; }
    let T1;
    try { T1 = K.topoOf(shape); } catch { continue; }
    const n = T1.faces.length;
    // an instance body of a pasted occurrence is a moved copy of its primary body
    if (id.includes("@")) {
      const base = out.get(id.slice(0, id.indexOf("@")));
      if (base && base.cr.length === n) { out.set(id, { shape, cr: base.cr, ch: base.ch }); continue; }
    }
    if (prev) {
      let T0 = null;
      try { T0 = K.topoOf(prev.shape); } catch { /* compare by surface below */ }
      if (T0 && movedCopy(T0, T1)) { out.set(id, { shape, cr: prev.cr, ch: prev.ch.map((s) => withChange(s, fid)) }); continue; }
    }
    const cands = [];
    if (prev) cands.push(id);
    for (const d of donors) if (d !== id) cands.push(d);
    const cr = new Array(n).fill(fid), ch = new Array(n).fill(null);
    if (cands.length) {
      if (!donorIndex) donorIndex = new Map();
      const entries = [];
      for (const cid of cands) {
        let en = donorIndex.get(cid);
        if (!en) {
          const rec = own0.get(cid);
          try { en = { id: cid, rec, T: K.topoOf(rec.shape) }; en.boxes = faceBoxes(en.T); } catch { en = null; }
          donorIndex.set(cid, en || false);
        }
        if (en) entries.push(en);
      }
      const index = surfaceIndex(entries);
      const B1 = faceBoxes(T1);
      const loose = [];
      for (let j = 0; j < n; j++) {
        const f1 = T1.faces[j];
        let best = null, bestSame = false;
        for (const c of index.lookup(f1)) {
          const f0 = c.en.T.faces[c.i];
          if (!sameSurface(f1, f0)) continue;
          const b0 = c.en.boxes[c.i];
          if (!boxesTouch(B1[j], b0)) continue;
          const same = near(f1.c, f0.c, 1e-3) && boxesEqual(B1[j], b0);
          const own = c.en.id === id;
          if (!best || (same && !bestSame) || (same === bestSame && own && best.en.id !== id)) { best = c; bestSame = same; }
          if (same && own) break;
        }
        if (best) {
          cr[j] = best.en.rec.cr[best.i];
          const old = best.en.rec.ch[best.i];
          ch[j] = bestSame ? old : withChange(old, fid);
        } else if (!ANALYTIC.has(f1.type)) loose.push(j);
      }
      // free-form faces that were trimmed (their mid point moved): the new mid point still lies on the old face
      if (loose.length && loose.length <= 60) trimmedFreeForm(K, entries, T1, B1, loose, cr, ch, fid);
    }
    out.set(id, { shape, cr, ch });
  }
  return out;
}

function trimmedFreeForm(K, entries, T1, B1, loose, cr, ch, fid) {
  for (const en of entries) {
    const idx = [];
    en.T.faces.forEach((f, i) => { if (!ANALYTIC.has(f.type)) idx.push(i); });
    if (!idx.length || idx.length > 400) continue;
    let faces = null;
    try {
      faces = K.facesOf(en.rec.shape);
      for (const j of loose) {
        if (ch[j] || cr[j] !== fid) continue;
        const f1 = T1.faces[j];
        if (!f1.c) continue;
        let probe = null;
        try {
          probe = K.pointProbe(f1.c);
          for (const i of idx) {
            if (en.T.faces[i].type !== f1.type || !boxesTouch(B1[j], en.boxes[i])) continue;
            if (probe.dist(faces[i]) < 1e-5) { cr[j] = en.rec.cr[i]; ch[j] = withChange(en.rec.ch[i], fid); break; }
          }
        } catch { /* keep the face as created */ } finally { if (probe) probe.delete(); }
      }
    } catch { /* keep */ } finally { if (faces) K.del(faces); }
  }
}

function ownershipOf(app) {
  const res = app.result;
  if (!res || !res.state || !res.state.bodies) return null;
  let rec = BYRESULT.get(res);
  if (rec) return rec;
  const K = app.K;
  const cache = (app.evaluator && app.evaluator.cache) || [];
  let own = new Map(), prev = null;
  for (let i = 0; i < cache.length; i++) {
    const c = cache[i];
    if (!c || !c.state || !c.state.bodies) break;
    const r = res.results[c.id];
    if (!r || r.rolled) break;
    let o = OWN.get(c.state);
    if (!o) {
      o = c.state === prev ? own : stepOwnership(K, own, prev, c.state, c.id);
      OWN.set(c.state, o);
    }
    own = o; prev = c.state;
  }
  if (res.state !== prev) {
    // uncaptured component positions sit on top of the timeline: bodies are moved copies
    let o = OWN.get(res.state);
    if (!o) { o = stepOwnership(K, own, prev, res.state, null); OWN.set(res.state, o); }
    own = o;
  }
  rec = { own, byFeature: new Map() };
  BYRESULT.set(res, rec);
  return rec;
}

/**
 * Faces of the current bodies that feature `id` created (or, when it created none, changed):
 * [{body, index}], or null when there is no face information (the caller falls back to whole bodies).
 */
export function featureFaces(app, id) {
  let rec = null;
  try { rec = ownershipOf(app); } catch (e) { console.warn("feature faces", e); return null; }
  if (!rec) return null;
  if (rec.byFeature.has(id)) return rec.byFeature.get(id);
  const created = [], changed = [];
  for (const [body, o] of rec.own) {
    for (let j = 0; j < o.cr.length; j++) {
      if (o.cr[j] === id) created.push({ body, index: j });
      else if (o.ch[j] && o.ch[j].has(id)) changed.push({ body, index: j });
    }
  }
  const out = created.length ? created : changed.length ? changed : null;
  rec.byFeature.set(id, out);
  return out;
}
