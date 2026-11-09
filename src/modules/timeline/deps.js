// Feature dependency analysis for the timeline (reorder validation, delete-with-dependents,
// implicit suppression display, Find in Timeline).
//
// Two kinds of dependency are tracked:
//  * explicit  — a feature names another feature's output: a profile/point/path/axis from a
//                sketch, a construction plane, or a body created by that feature;
//  * geometric — a feature references an edge/face (by point) that only exists after an
//                earlier feature ran. Checked against the evaluator's cached per-feature states.

const SKIP_KEYS = new Set(["id", "name", "p", "newBody", "newBodies", "sk", "suppressed", "visible", "type"]);

/** Explicit references of a feature: {sketches, cplanes, bodies, geo:[{kind:'edge'|'face', body, p, n?}]} */
export function refsOf(f) {
  const r = { sketches: new Set(), cplanes: new Set(), bodies: new Set(), geo: [] };
  if (!f) return r;
  const addGeo = (kind, o) => {
    if (!o || typeof o.body !== "string" || !Array.isArray(o.p)) return;
    r.bodies.add(o.body);
    r.geo.push({ kind, body: o.body, p: o.p, n: Array.isArray(o.n) ? o.n : null });
  };
  const walk = (o, key, depth) => {
    if (o == null || depth > 8) return;
    if (Array.isArray(o)) {
      if (key === "bodies" || key === "tools") { for (const x of o) if (typeof x === "string") r.bodies.add(x); return; }
      if (key === "edges" || key === "refEdges") { for (const x of o) addGeo("edge", x); return; }
      if (key === "faces") { for (const x of o) addGeo("face", x); return; }
      for (const x of o) walk(x, key, depth + 1);
      return;
    }
    if (typeof o !== "object") {
      if (key === "target" && typeof o === "string") r.bodies.add(o);
      return;
    }
    if (typeof o.sketch === "string") r.sketches.add(o.sketch);
    if (o.kind === "cplane" && typeof o.id === "string") r.cplanes.add(o.id);
    if (key === "faceRef" && !o.kind) { addGeo("face", o); return; } // hole placed on a face
    if (o.kind === "face" && typeof o.body === "string") addGeo("face", o);
    if (o.kind === "edge" && typeof o.body === "string") addGeo("edge", o);
    for (const [k, v] of Object.entries(o)) {
      if (depth === 0 && SKIP_KEYS.has(k)) continue;
      if (k === "sketch" || k === "kind") continue;
      walk(v, k, depth + 1);
    }
  };
  // sketch features: only their plane reference matters (sk holds the geometry)
  if (f.type === "sketch") walk({ planeRef: f.planeRef }, "", 0);
  else walk(f, "", 0);
  return r;
}

/** Map body id -> id of the feature that created it. */
export function bodyCreators(doc) {
  const m = new Map();
  for (const f of doc.features) {
    if (f.newBody && !m.has(f.newBody)) m.set(f.newBody, f.id);
    for (const b of f.newBodies || []) if (b && !m.has(b)) m.set(b, f.id);
  }
  return m;
}
export function creatorOf(creators, doc, bodyId) {
  if (creators.has(bodyId)) return creators.get(bodyId);
  const m = /^(.+)_\d+$/.exec(bodyId || ""); // pattern instances "f7_3"
  if (m && doc.features.some((f) => f.id === m[1])) return m[1];
  return null;
}

/** Bodies a feature writes to (creates or modifies). */
export function bodiesTouched(doc, results, f) {
  const out = new Set();
  if (!f) return out;
  const res = results && results[f.id];
  if (res && Array.isArray(res.affected)) for (const b of res.affected) out.add(b);
  if (f.newBody && res && res.ok && (!res.affected || res.affected.includes(f.newBody))) out.add(f.newBody);
  for (const b of f.newBodies || []) out.add(b);
  for (const e of f.edges || []) if (e && e.body) out.add(e.body);
  if (["shell", "draft"].includes(f.type)) { for (const x of f.faces || []) if (x && x.body) out.add(x.body); for (const b of f.bodies || []) out.add(b); }
  if (f.type === "move" && !f.copy) for (const b of f.bodies || []) out.add(b);
  if (f.type === "combine" && f.target) out.add(f.target);
  if (f.type === "mirror" && f.operation === "join") for (const b of f.bodies || []) out.add(b);
  return out;
}

/** Explicit dependencies of feature f (set of feature ids it needs before it). */
export function explicitDeps(doc, results, f, creators = bodyCreators(doc)) {
  const deps = new Set();
  if (!f) return deps;
  const ids = new Set(doc.features.map((x) => x.id));
  const r = refsOf(f);
  for (const s of r.sketches) if (ids.has(s)) deps.add(s);
  for (const c of r.cplanes) if (ids.has(c)) deps.add(c);
  for (const b of r.bodies) { const c = creatorOf(creators, doc, b); if (c) deps.add(c); }
  // Boolean features with implicit participants (join/cut/intersect into whatever bodies existed)
  const res = results && results[f.id];
  if (res && Array.isArray(res.affected)) for (const b of res.affected) { const c = creatorOf(creators, doc, b); if (c) deps.add(c); }
  deps.delete(f.id);
  return deps;
}

// ---------------------------------------------------------------------------
// Geometric checks against the evaluator cache (state after each evaluated feature)
// ---------------------------------------------------------------------------
const EMPTY_STATE = { bodies: new Map(), sketches: new Map(), planes: new Map() };

/** Model state right after feature index `idx` (-1 = empty), or null when unknown. */
export function stateAfter(app, idx) {
  if (app.previewing) return null;
  const feats = app.doc.features;
  const cache = (app.evaluator && app.evaluator.cache) || [];
  for (let m = Math.min(idx, feats.length - 1); m >= 0; m--) {
    const f = feats[m];
    if (f.suppressed) continue;
    if (m >= app.doc.marker) return null; // rolled: no trustworthy cache entry
    const c = cache[m];
    if (!c || c.id !== f.id || !c.state) return null;
    return c.state;
  }
  return EMPTY_STATE;
}

function geoExists(K, state, g) {
  const b = state.bodies.get(g.body);
  if (!b || !b.shape) return false;
  try {
    const R = K.R;
    const v = R.makeVertex(g.p);
    if (g.kind === "edge") {
      for (const e of b.shape.edges) {
        let d;
        try { d = R.measureDistanceBetween(e, v); } catch { continue; }
        if (d < 1e-3) return true;
      }
      return false;
    }
    for (const fc of b.shape.faces) {
      let d;
      try { d = R.measureDistanceBetween(fc, v); } catch { continue; }
      if (d >= 1e-3) continue;
      if (g.n) {
        try {
          const fn = fc.normalAt(g.p).toTuple();
          const l = Math.hypot(fn[0], fn[1], fn[2]) || 1;
          if ((fn[0] * g.n[0] + fn[1] * g.n[1] + fn[2] * g.n[2]) / l < 0.5) continue;
        } catch { /* curved: accept */ }
      }
      return true;
    }
    return false;
  } catch {
    return true; // unknown -> do not block
  }
}

/** True when `later` (at a later index) depends on `earlier`. */
export function dependsOn(app, later, earlier, ctx = {}) {
  const doc = app.doc;
  const results = (app.result && app.result.results) || {};
  const creators = ctx.creators || bodyCreators(doc);
  if (explicitDeps(doc, results, later, creators).has(earlier.id)) return true;
  if (ctx.explicitOnly) return false;
  const touched = bodiesTouched(doc, results, earlier);
  const geo = refsOf(later).geo.filter((g) => touched.has(g.body));
  if (!geo.length) return false;
  const ei = doc.features.findIndex((x) => x.id === earlier.id);
  const before = stateAfter(app, ei - 1);
  const after = stateAfter(app, ei);
  if (!before || !after) return false;
  return geo.some((g) => !geoExists(app.K, before, g) && geoExists(app.K, after, g));
}

/**
 * Can feature at index `from` move so that it ends at index `to` of the reordered list?
 * Returns {ok:true} or {ok:false, blocker, reason}.
 */
export function canMove(app, from, to) {
  const doc = app.doc;
  const feats = doc.features;
  const F = feats[from];
  if (!F || from === to) return { ok: true };
  const results = (app.result && app.result.results) || {};
  const creators = bodyCreators(doc);
  if (to < from) {
    const deps = explicitDeps(doc, results, F, creators);
    for (let k = to; k < from; k++) {
      const G = feats[k];
      if (deps.has(G.id)) return { ok: false, blocker: G, reason: `${F.name} references ${G.name}` };
    }
    const geo = refsOf(F).geo;
    if (geo.length) {
      const st = stateAfter(app, to - 1);
      if (st) {
        for (const g of geo) {
          if (!geoExists(app.K, st, g)) {
            // find the passed feature that provides it (for the message)
            let blocker = null;
            for (let k = to; k < from && !blocker; k++) {
              const s = stateAfter(app, k);
              if (s && geoExists(app.K, s, g)) blocker = feats[k];
            }
            if (blocker) return { ok: false, blocker, reason: `${F.name} uses geometry created by ${blocker.name}` };
          }
        }
      }
    }
    return { ok: true };
  }
  for (let k = from + 1; k <= to; k++) {
    const G = feats[k];
    if (dependsOn(app, G, F, { creators })) return { ok: false, blocker: G, reason: `${G.name} references ${F.name}` };
  }
  return { ok: true };
}

/** All features that (transitively) depend on any of `ids`, in timeline order. */
export function dependentsOf(app, ids, opts = {}) {
  const doc = app.doc;
  const set = new Set(ids);
  const creators = bodyCreators(doc);
  const out = [];
  const firstIdx = Math.min(...ids.map((id) => doc.features.findIndex((f) => f.id === id)).filter((i) => i >= 0));
  if (!Number.isFinite(firstIdx)) return out;
  for (let k = firstIdx + 1; k < doc.features.length; k++) {
    const G = doc.features[k];
    if (set.has(G.id)) continue;
    for (const id of set) {
      const F = doc.features.find((f) => f.id === id);
      if (!F) continue;
      if (doc.features.indexOf(F) >= k) continue;
      if (dependsOn(app, G, F, { creators, explicitOnly: opts.explicitOnly })) { set.add(G.id); out.push(G); break; }
    }
  }
  return out;
}

/** Feature that created a body (for Find in Timeline). */
export function creatorFeature(app, bodyId) {
  const doc = app.doc;
  const id = creatorOf(bodyCreators(doc), doc, bodyId);
  if (id) return app.feature(id);
  const st = app.result && app.result.state.bodies.get(bodyId);
  return st && st.from ? app.feature(st.from) : null;
}

/** Sketch feature ids a feature takes its profiles from (Edit Profile Sketch). */
export function profileSketches(f) {
  if (!f) return [];
  const out = [];
  const add = (s) => { if (s && !out.includes(s)) out.push(s); };
  for (const p of f.profiles || []) add(p && p.sketch);
  if (f.profile) add(f.profile.sketch);
  for (const sp of f.sketchPoints || []) add(sp && sp.sketch);
  if (f.path) add(f.path.sketch);
  return out;
}
