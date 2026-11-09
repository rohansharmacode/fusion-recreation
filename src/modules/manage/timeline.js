// Generate Timeline (TimelineBuilderCommand, "AutoTimeline", tech preview in Fusion) and Compute
// Unresolved (FusionComputeUnresolvedCommand).
//
// Generate Timeline: select a body, Generate. Fusion sends the body to a cloud service and opens a new
// "<design> AutoTimeline" document with a parametric timeline. Local equivalent: the body is analysed
// here, rebuilt as offset planes + sketches + extrudes (prismatic / 2.5D bodies along any direction:
// planar caps, planar side walls, cylinder walls parallel to the direction, holes and vertical rounds
// become sketch circles / arcs, steps become stacked extrudes), checked against the original volume,
// and offered as the new design ("Timeline is ready to review." -> Open timeline). Bodies with other
// faces (blends across the direction, freeform faces) report "Timeline reconstruction failed".
//
// Compute Unresolved: recomputes the features whose references failed to resolve (and everything
// after them); enabled only while the timeline has such features.
import { el, esc, lrow, toBodyRef, beginModel, GL } from "./ui.js";
import { buildBVH } from "./raycast.js";
import { prepareFeature } from "../../app/core.js";

const EPS = 1e-6;
const key2 = (p) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`;

function canonicalAxis(K, a) {
  const ax = [Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2])];
  if (ax[2] > 1 - 1e-9) return { a: [0, 0, 1], base: "XY" };
  if (ax[1] > 1 - 1e-9) return { a: K.ORIGIN_PLANES.XZ.n.slice(), base: "XZ" };
  if (ax[0] > 1 - 1e-9) return { a: [1, 0, 0], base: "YZ" };
  for (const c of a) if (Math.abs(c) > 1e-9) return { a: c < 0 ? a.map((x) => -x) : a.slice(), base: null };
  return { a: a.slice(), base: null };
}

/** Insideness of a point in a closed mesh (ray parity, majority of three directions). */
function makeInside(bvh, diag) {
  const dirs = [[0.5773, 0.5774, 0.5773], [-0.6123, 0.3536, 0.7071], [0.2673, -0.8018, 0.5345]];
  return (p) => {
    let votes = 0;
    for (const d of dirs) {
      let o = p, hits = 0, guard = 0;
      for (;;) {
        const h = bvh.ray(o, d, 1e-7, diag * 4);
        if (!h || guard++ > 200) break;
        hits++;
        o = [o[0] + d[0] * (h.t + 1e-5), o[1] + d[1] * (h.t + 1e-5), o[2] + d[2] * (h.t + 1e-5)];
      }
      if (hits % 2 === 1) votes++;
    }
    return votes >= 2;
  };
}

function interior2(r) {
  const pip = (q, poly) => { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
  const ok = (q) => pip(q, r.outer.poly) && !(r.holes || []).some((h) => pip(q, h.poly));
  const poly = r.outer.poly;
  const c = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
  if (ok(c)) return c;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const t of [0.01, 0.05, 0.2, 0.4]) { const q = [m[0] + (c[0] - m[0]) * t, m[1] + (c[1] - m[1]) * t]; if (ok(q)) return q; }
  }
  return c;
}

/**
 * Rebuild a body as a parametric timeline. Returns {doc, axis, groups, volume, sourceVolume} or throws
 * an Error whose message explains why the body cannot be reconstructed.
 */
export function generateTimeline(app, bodyId, opts = {}) {
  const K = app.K, S = app.S, M = app.M;
  const b = app.body(bodyId);
  if (!b) throw new Error("Select a body to generate the timeline for");
  const shape = b.shape;
  const T = K.topoOf(shape);
  const F = T.faces;
  // ---- direction: every face is a cap (normal along it) or a wall (planar normal across it / cylinder along it)
  const cands = [];
  const addC = (v) => { if (!v) return; const c = canonicalAxis(K, v); if (!cands.some((x) => Math.abs(Math.abs(K.V.dot(x.a, c.a)) - 1) < 1e-9)) cands.push(c); };
  for (const base of ["XY", "XZ", "YZ"]) addC(K.ORIGIN_PLANES[base].n);
  for (const f of F) { if (f.type === "PLANE") addC(f.n); if (f.type === "CYLINDRE" && f.a) addC(f.a); }
  const classify = (a) => {
    const caps = [], walls = [];
    for (let i = 0; i < F.length; i++) {
      const f = F[i];
      if (f.type === "PLANE") {
        const d = Math.abs(K.V.dot(f.n, a));
        if (d > 1 - 1e-7) caps.push(i); else if (d < 1e-7) walls.push(i); else return null;
      } else if (f.type === "CYLINDRE" && f.a && Math.abs(Math.abs(K.V.dot(f.a, a)) - 1) < 1e-7) walls.push(i);
      else return null;
    }
    return caps.length >= 2 ? { caps, walls } : null;
  };
  let axis = null, cls = null;
  for (const c of cands) { const r = classify(c.a); if (r) { axis = c; cls = r; break; } }
  if (!axis) {
    const bad = F.find((f) => !(f.type === "PLANE" || f.type === "CYLINDRE"));
    throw new Error(bad ? `The body has ${bad.type === "TORUS" ? "fillets across the extrusion direction" : `${String(bad.type).toLowerCase()} faces`} that this local timeline generator cannot rebuild (it rebuilds prismatic bodies).`
      : "The body has faces that are not parallel or perpendicular to one direction, so it cannot be rebuilt from extrudes.");
  }
  const a = axis.a;
  const h = (p) => K.V.dot(p, a);
  const P0 = axis.base ? K.ORIGIN_PLANES[axis.base] : K.planeFromNormal([0, 0, 0], a);
  const uv = (p) => K.toLocal(P0, p);
  // face ranges along the axis (from their edges)
  const range = F.map(() => [Infinity, -Infinity]);
  T.edges.forEach((e) => {
    for (const fi of e.faces) for (const p of [e.s, e.t, e.m]) { const v = h(p); range[fi][0] = Math.min(range[fi][0], v); range[fi][1] = Math.max(range[fi][1], v); }
  });
  const levels = [...new Set(cls.caps.map((i) => Math.round(h(F[i].c) * 1e6) / 1e6))].sort((x, y) => x - y);
  if (levels.length < 2) throw new Error("The body has no end faces along its extrusion direction");
  const md = app.viewport.meshFor(shape);
  const bvh = buildBVH(md);
  const bb = K.bboxOf(shape);
  const diag = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
  const inside = makeInside(bvh, diag);
  // ---- slabs between consecutive cap levels, grouped while their wall faces stay the same
  const vertical = (e) => e.type === "LINE" && Math.abs(Math.abs(K.V.dot(e.d, a)) - 1) < 1e-7;
  const slabs = [];
  for (let i = 0; i + 1 < levels.length; i++) {
    const lo = levels[i], hi = levels[i + 1], mid = (lo + hi) / 2;
    const walls = cls.walls.filter((fi) => range[fi][0] < mid - EPS && range[fi][1] > mid + EPS);
    if (!walls.length) continue;
    // same walls and same vertical edges = same section: one extrude spans both slabs
    const vk = T.edges.map((e, ei) => (vertical(e) && Math.min(h(e.s), h(e.t)) < mid - EPS && Math.max(h(e.s), h(e.t)) > mid + EPS ? ei : -1)).filter((x) => x >= 0).join();
    const last = slabs[slabs.length - 1];
    if (last && Math.abs(last.hi - lo) < EPS && last.walls.join() === walls.join() && last.vk === vk) last.hi = hi;
    else slabs.push({ lo, hi, walls, vk });
  }
  if (!slabs.length) throw new Error("No side faces were found between the end faces");
  // ---- section sketch of a slab from its wall faces
  function sectionSketch(slab) {
    const mid = (slab.lo + slab.hi) / 2;
    const sk = S.newSketch();
    const pts = new Map();
    const pid = (q) => { const k = key2(q); if (!pts.has(k)) pts.set(k, S.addPoint(sk, q[0], q[1])); return pts.get(k); };
    for (const fi of slab.walls) {
      const f = F[fi];
      const vEdges = [];
      T.edges.forEach((e) => {
        if (!e.faces.includes(fi) || !vertical(e)) return;
        const lo = Math.min(h(e.s), h(e.t)), hi = Math.max(h(e.s), h(e.t));
        if (lo > mid + EPS || hi < mid - EPS) return;
        if (e.faces.length < 2 || e.faces.every((x) => x === fi)) return; // seam of a full cylinder
        vEdges.push(uv(e.s));
      });
      // two different vertical edges at the same section point would be duplicates
      const ends = [];
      for (const q of vEdges) if (!ends.some((x) => Math.hypot(x[0] - q[0], x[1] - q[1]) < 1e-6)) ends.push(q);
      if (f.type === "PLANE") {
        if (ends.length !== 2) throw new Error("A side face of the body is not a simple strip, so its section cannot be sketched");
        S.addLine(sk, pid(ends[0]), pid(ends[1]));
      } else {
        const c = uv(f.ao), r = f.r;
        if (!ends.length) { S.addCircle(sk, S.addPoint(sk, c[0], c[1]), r); continue; }
        if (ends.length !== 2) throw new Error("A cylindrical side face could not be sketched");
        const m = uv(f.c);
        const ar = S.arcFrom3(ends[0], m, ends[1]);
        if (!ar) throw new Error("A cylindrical side face could not be sketched");
        S.addArcDir(sk, S.addPoint(sk, ar.c[0], ar.c[1]), pid(ends[0]), pid(ends[1]), ar.ccw);
      }
    }
    const regs = S.regions(sk).regions;
    const profiles = [];
    for (const r of regs) {
      const ip = interior2(r);
      const w = K.toWorld(P0, ip[0], ip[1]);
      const p = [w[0] + a[0] * mid, w[1] + a[1] * mid, w[2] + a[2] * mid];
      if (inside(p)) profiles.push({ key: r.key, c: ip });
    }
    if (!profiles.length) throw new Error("No closed section profiles were found");
    return { sk, profiles };
  }
  // ---- the new design
  const name = `${app.doc.name || "Untitled"} AutoTimeline`;
  const doc = M.newDoc(name);
  doc.units = app.doc.units || "mm";
  const fmt = (v) => `${Math.round(v * 1e6) / 1e6} mm`;
  const add = (f) => { prepareFeature(doc, f); doc.features.push(f); doc.marker = doc.features.length; return f; };
  let bodyNew = null;
  const groups = [];
  for (const slab of slabs) {
    const { sk, profiles } = sectionSketch(slab);
    let planeRef, plane;
    if (axis.base && Math.abs(slab.lo) < EPS) { planeRef = { kind: "origin", name: axis.base }; plane = P0; }
    else if (axis.base) {
      const cp = add({ type: "cplane", mode: "offset", base: { kind: "origin", name: axis.base }, offset: fmt(slab.lo) });
      planeRef = { kind: "cplane", id: cp.id };
      plane = K.offsetPlane(P0, slab.lo);
    } else { plane = K.offsetPlane(P0, slab.lo); planeRef = { kind: "plane", plane }; }
    const s = add({ type: "sketch", plane: JSON.parse(JSON.stringify(plane)), planeRef, sk, visible: false });
    const ex = add({ type: "extrude", profiles: profiles.map((p) => ({ sketch: s.id, key: p.key, c: p.c })), distance: fmt(slab.hi - slab.lo), dirType: "one", extent: "distance", taper: "0 deg", operation: bodyNew ? "join" : "new", ...(bodyNew ? { bodies: [bodyNew] } : {}) });
    if (!bodyNew) bodyNew = ex.newBody;
    groups.push({ lo: slab.lo, hi: slab.hi, profiles: profiles.length, sketch: s.id, extrude: ex.id });
  }
  if (bodyNew && doc.bodies[bodyNew]) doc.bodies[bodyNew].name = (app.doc.bodies[bodyId] || {}).name || "Body1";
  // ---- verify against the source
  const ev = new M.Evaluator();
  const res = ev.run(doc);
  const failed = Object.entries(res.results).find(([, r]) => r && r.ok === false);
  if (failed) throw new Error(`The generated ${doc.features.find((f) => f.id === failed[0]).name} failed: ${failed[1].error}`);
  const nb = res.state.bodies.get(bodyNew);
  if (!nb) throw new Error("The generated timeline produced no body");
  const v0 = K.volumeOf(shape), v1 = K.volumeOf(nb.shape);
  if (!(Math.abs(v1 - v0) <= Math.max(1e-6, Math.abs(v0) * 2e-3))) throw new Error(`The rebuilt body does not match the original (volume ${v1.toFixed(2)} mm^3 instead of ${v0.toFixed(2)} mm^3)`);
  // keep the source body's look
  const meta = app.doc.bodies[bodyId] || {};
  if (doc.bodies[bodyNew]) Object.assign(doc.bodies[bodyNew], { appearance: meta.appearance || "steel-satin", material: meta.material || "steel" });
  void opts;
  return { doc, axis: a, groups, volume: v1, sourceVolume: v0 };
}

function openGenerateTimeline(app, ctx = {}) {
  beginModel(app);
  const pre = (ctx.preselect || app.selection.items || []).map(toBodyRef).filter((r) => r && r.kind === "body").slice(0, 1);
  let busy = false;
  const generate = (d) => {
    const b = (d.values.body || [])[0];
    if (!b || busy) return;
    busy = true;
    const name = (app.doc.bodies[b.body] || {}).name || b.body;
    app.toast("Generating Timeline: timeline generation started.", "info", 1800);
    // like the cloud job, the result arrives a moment later (the dialog closes at once)
    setTimeout(() => {
      busy = false;
      let out = null, err = null;
      try { out = generateTimeline(app, b.body); } catch (e) { err = e; }
      app.emit("timeline-builder", { ok: !!out, error: err && err.message, body: b.body });
      const modals = app.ui.modals;
      if (!out) {
        if (modals) modals.alert({ id: "TimelineBuilderFailed", title: "Timeline reconstruction failed", kind: "error", message: `An error occurred during timeline reconstruction of <b>${esc(name)}</b>.<br><br>${esc(err.message || err)}` });
        else app.toast(`Timeline reconstruction failed: ${err.message || err}`, "error", 6000);
        return;
      }
      app.ui.timelineBuilder.last = out;
      const nFeat = out.doc.features.length;
      const msg = `Timeline is ready to review.<br><br><b>${esc(out.doc.name)}</b>: ${nFeat} features (${out.groups.length} extrude${out.groups.length === 1 ? "" : "s"}) rebuild <b>${esc(name)}</b> (${out.volume.toFixed(2)} mm^3).`;
      if (!modals) return;
      modals.confirm({ id: "TimelineBuilderReady", title: "Generate Timeline", kind: "info", message: msg, buttons: [{ action: "open", label: "Open timeline", primary: true }, { action: "cancel", label: "Close" }] }).then(async (r) => {
        if (r !== "open") return;
        await openGenerated(app, out.doc);
      });
    }, 30);
  };
  return app.ui.dialog.open({
    id: "TimelineBuilderCommand",
    title: "Generate Timeline",
    icon: "TimelineBuilderCommand",
    help: "AutoTimeline helps generate a parametric timeline for imported bodies, making them easier to edit and reuse. (Tech preview; in this recreation the body is rebuilt locally from extrudes.)",
    preview: false, noFeature: true, ctrlWidth: 150,
    preselect: pre,
    rows: [
      { id: "body", type: "selection", label: "Select body", kinds: ["body", "face", "edge"], mapRef: toBodyRef, max: 1, tooltip: "Select a body to generate timeline for.", prompt: "Select a body that you would like to generate timeline for." },
      { id: "note", type: "custom", render() { return el("div", { class: "mg-note", html: `${GL.info}<span>The timeline opens as a new design, <i>${esc(app.doc.name || "Untitled")} AutoTimeline</i>.</span>` }); }, update() {} },
    ],
    onOpen(d) { const ok = d.el.querySelector('[data-action="ok"]'); if (ok) ok.textContent = "Generate"; },
    commit(_f, d) { generate(d); return true; },
  });
}

/** Open a generated design (asks to save unsaved changes first). */
export async function openGenerated(app, doc) {
  const files = app.ui.files;
  if (files && files.confirmDiscard && !(await files.confirmDiscard("open the generated timeline"))) return false;
  const d = JSON.parse(JSON.stringify(doc));
  if (files && files.loadDoc) files.loadDoc(d, null);
  else { app.loadDocument(d); try { app.viewport.fit({ animate: false }); } catch { /* ignore */ } }
  app.dirty = true;
  app.toast(`Opened "${d.name}"`, "info", 1600);
  return true;
}

// ------------------------------------------------------------------------------------------------
// Compute Unresolved
// ------------------------------------------------------------------------------------------------
export function unresolvedFeatures(app) {
  const res = (app.result && app.result.results) || {};
  return app.doc.features.filter((f) => res[f.id] && res[f.id].ok === false);
}
function computeUnresolved(app) {
  const bad = unresolvedFeatures(app);
  if (!bad.length) { app.toast("There are no unresolved features to compute", "info", 2000); return { computed: 0, remaining: 0 }; }
  const first = Math.min(...bad.map((f) => app.featureIndex(f.id)));
  const t0 = performance.now();
  // drop the cached states from the first unresolved feature on: only those features are recomputed
  const ev = app.evaluator;
  if (ev && Array.isArray(ev.cache)) ev.cache.length = Math.min(ev.cache.length, first);
  app.recompute();
  const still = unresolvedFeatures(app);
  const fixed = bad.filter((f) => !still.some((x) => x.id === f.id)).length;
  const ms = Math.round(performance.now() - t0);
  if (still.length) app.toast(`Compute Unresolved: ${fixed} of ${bad.length} feature${bad.length === 1 ? "" : "s"} resolved; ${still.length} still cannot be computed (${ms} ms)`, "warning", 3600);
  else app.toast(`Compute Unresolved: ${bad.length} feature${bad.length === 1 ? "" : "s"} computed (${ms} ms)`, "info", 2200);
  return { computed: bad.length, resolved: fixed, remaining: still.length };
}

export function registerTimelineTools(app) {
  app.ui.timelineBuilder = { generate: (bodyId) => generateTimeline(app, bodyId), open: (doc) => openGenerated(app, doc), last: null };
  app.commands.register({
    id: "TimelineBuilderCommand", label: "Generate Timeline", kind: "tool",
    tooltip: "AutoTimeline helps generate a parametric timeline for imported bodies, making them easier to edit and reuse in Fusion.",
    run: (a, ctx) => openGenerateTimeline(a, ctx),
  });
  app.commands.register({
    id: "FusionComputeUnresolvedCommand", label: "Compute Unresolved", kind: "ui",
    tooltip: "Computes only the features related to unresolved references. Only available when the design contains features that could not be computed.",
    enabled: (a) => !a.activeCommand && unresolvedFeatures(a).length > 0,
    run: (a) => computeUnresolved(a),
  });
  void lrow;
}
