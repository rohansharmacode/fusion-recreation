// FIND FEATURES (FusionFindFeaturesCommand, SOLID > CREATE dropdown in Fusion's direct-modeling mode):
// "Identifies features in a body. Recognized features are listed in the browser." Dialog:
// Faces/Bodies/Components, Select All, Fillet, Hole, Chamfer, Extrude, Revolve, Mirror, Circular
// Pattern, Rectangular Pattern. The body geometry is not changed.
// Local recognition from the B-rep topology (kernel topoOf): holes (internal coaxial cylinders /
// cones), fillets (partial cylinders and tori between faces), chamfers (narrow planar strips at equal
// angles to both neighbours), extrudes (prismatic bodies), revolves (surfaces of revolution about one
// axis), mirrors (symmetry planes through the body centre) and circular / rectangular patterns of
// equal holes. Results are document data (doc.foundFeatures, undoable, saved with the design) and
// appear in a "Features" browser folder; clicking one selects its faces.
import { el, esc, toBodyRef, beginModel, faceRefs } from "./ui.js";
import { generateTimeline } from "./timeline.js";
import { icon as cmdIcon } from "../icons/icons.js";

export const TYPES = [
  ["fillet", "Fillet"], ["hole", "Hole"], ["chamfer", "Chamfer"], ["extrude", "Extrude"], ["revolve", "Revolve"],
  ["mirror", "Mirror"], ["cpattern", "Circular Pattern"], ["rpattern", "Rectangular Pattern"],
];
const LABEL = Object.fromEntries(TYPES);
const ICON = { fillet: "FusionFilletEdgesCommand", hole: "FusionHoleCommand", chamfer: "FusionChamferCommand", extrude: "Extrude", revolve: "Revolve", mirror: "MirrorCommand", cpattern: "PatternCircular", rpattern: "PatternRectangular" };
const V = { dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len: (a) => Math.hypot(a[0], a[1], a[2]), cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] };
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "--");

/** Recognize features on one body. types: Set of type keys. -> [{type, body, faces:[i], params, label}] */
export function recognize(app, bodyId, types, faceFilter = null) {
  const K = app.K;
  const b = app.body(bodyId);
  if (!b) return [];
  const T = K.topoOf(b.shape);
  const F = T.faces;
  const bb = T.bb;
  const diag = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
  const want = (t) => types.has(t);
  const inScope = (fi) => !faceFilter || faceFilter.has(fi);
  const out = [];
  const edgesOf = (fi) => T.edges.map((e, i) => (e.faces.includes(fi) ? i : -1)).filter((i) => i >= 0);
  const neighbours = (fi) => [...new Set(edgesOf(fi).flatMap((ei) => T.edges[ei].faces).filter((x) => x !== fi))];
  const parallel = (u, v) => Math.abs(Math.abs(V.dot(u, v)) - 1) < 1e-6;
  // ---- holes: internal cylinders grouped by axis line (+ coaxial cones for drill points / countersinks)
  const holeFaces = new Set();
  const holes = [];
  if (want("hole") || want("cpattern") || want("rpattern")) {
    const internal = [];
    F.forEach((f, i) => {
      if (f.type !== "CYLINDRE" || !f.a) return;
      let info = null;
      try { info = K.cylinderFaceInfo(b.shape, i); } catch { info = null; }
      if (!info || !info.internal) return;
      const full = !edgesOf(i).some((ei) => { const e = T.edges[ei]; return e.type === "LINE" && parallel(e.d, f.a) && !(e.faces.length === 1 || e.faces.every((x) => x === i)); });
      if (full) internal.push({ i, f, info });
    });
    const onAxis = (p, o, a) => V.len(V.cross(V.sub(p, o), a)) < 1e-5;
    for (const c of internal) {
      let g = holes.find((h) => parallel(h.a, c.f.a) && onAxis(c.f.ao, h.o, h.a));
      if (!g) { g = { a: c.f.a, o: c.f.ao, faces: [], radii: [], len: 0 }; holes.push(g); }
      g.faces.push(c.i); g.radii.push(c.f.r); g.len += c.info.len;
    }
    for (const g of holes) {
      F.forEach((f, i) => { if (f.type === "CONE" && f.a && parallel(f.a, g.a) && onAxis(f.ao, g.o, g.a) && neighbours(i).some((n) => g.faces.includes(n))) g.faces.push(i); });
      const r = Math.min(...g.radii);
      g.d = 2 * r;
      g.type = g.radii.some((x) => x > r + 1e-6) ? "Counterbore" : g.faces.length > g.radii.length ? "Countersink / drill point" : "Simple";
      for (const fi of g.faces) holeFaces.add(fi);
      if (want("hole") && g.faces.some(inScope)) out.push({ type: "hole", body: bodyId, faces: g.faces.slice(), params: { diameter: g.d, depth: g.len, kind: g.type }, label: `Ø ${fmt(g.d)} mm x ${fmt(g.len)} mm${g.type !== "Simple" ? ` (${g.type})` : ""}` });
    }
  }
  // ---- fillets: partial cylinders / tori that are not holes
  if (want("fillet")) {
    F.forEach((f, i) => {
      if (!inScope(i) || holeFaces.has(i)) return;
      if (f.type === "TORUS" || (f.type === "CYLINDRE" && f.r !== undefined && f.r < diag * 0.25)) {
        if (f.type === "CYLINDRE") {
          const lines = edgesOf(i).filter((ei) => { const e = T.edges[ei]; return e.type === "LINE" && parallel(e.d, f.a) && e.faces.length === 2 && !e.faces.every((x) => x === i); });
          if (lines.length < 2) return; // a full cylinder (boss / shaft), not a blend
        }
        const r = f.r !== undefined ? f.r : NaN;
        out.push({ type: "fillet", body: bodyId, faces: [i], params: { radius: r }, label: Number.isFinite(r) ? `R ${fmt(r)} mm` : "Fillet" });
      }
    });
    // merge fillet faces of one tangent chain with the same radius
    const fl = out.filter((x) => x.type === "fillet");
    for (let k = 0; k < fl.length; k++) for (let j = k + 1; j < fl.length; j++) {
      const A = fl[k], B = fl[j];
      if (!A.faces.length || !B.faces.length || Math.abs((A.params.radius || 0) - (B.params.radius || 0)) > 1e-6) continue;
      if (A.faces.some((fa) => neighbours(fa).some((n) => B.faces.includes(n)))) { A.faces.push(...B.faces); B.faces = []; }
    }
    for (let k = out.length - 1; k >= 0; k--) if (out[k].type === "fillet" && !out[k].faces.length) out.splice(k, 1);
  }
  // ---- chamfers: narrow planar faces making equal angles with two planar neighbours across long edges
  if (want("chamfer")) {
    F.forEach((f, i) => {
      if (!inScope(i) || f.type !== "PLANE") return;
      const es = edgesOf(i).map((ei) => T.edges[ei]).filter((e) => e.type === "LINE");
      if (es.length < 4) return;
      es.sort((p, q) => q.len - p.len);
      const [e1, e2] = es;
      if (!parallel(e1.d, e2.d)) return;
      const n1 = e1.faces.find((x) => x !== i), n2 = e2.faces.find((x) => x !== i);
      if (n1 === undefined || n2 === undefined || F[n1].type !== "PLANE" || F[n2].type !== "PLANE") return;
      const a1 = Math.acos(Math.max(-1, Math.min(1, V.dot(f.n, F[n1].n)))), a2 = Math.acos(Math.max(-1, Math.min(1, V.dot(f.n, F[n2].n))));
      const w = V.len(V.cross(V.sub(e2.m, e1.m), e1.d));
      if (Math.abs(a1 - a2) > 0.035 || a1 < 0.2 || a1 > 1.37 || w > e1.len * 0.5) return;
      // equal-distance chamfer on a corner: the face width is distance x sqrt(2)
      const dist = w / Math.SQRT2;
      out.push({ type: "chamfer", body: bodyId, faces: [i], params: { distance: dist }, label: `${fmt(dist)} mm` });
    });
  }
  // ---- extrude: the body is prismatic along one direction
  if (want("extrude") && (!faceFilter || faceFilter.size === F.length)) {
    try {
      const g = generateTimeline(app, bodyId);
      const H = g.groups.reduce((s, x) => s + (x.hi - x.lo), 0);
      out.push({ type: "extrude", body: bodyId, faces: F.map((_, i) => i).filter((i) => !holeFaces.has(i)), params: { distance: H, steps: g.groups.length }, label: `${fmt(H)} mm${g.groups.length > 1 ? `, ${g.groups.length} steps` : ""}` });
    } catch { /* not prismatic */ }
  }
  // ---- revolve: every face is planar across one axis or a surface of revolution about it
  if (want("revolve") && (!faceFilter || faceFilter.size === F.length)) {
    const axes = F.filter((f) => f.a && f.ao && f.type !== "PLANE");
    const ax = axes[0];
    if (ax && !axes.every((f) => f.type === "CYLINDRE")) {
      const onLine = (p) => V.len(V.cross(V.sub(p, ax.ao), ax.a)) < 1e-5;
      const ok = F.every((f) => {
        if (f.type === "PLANE") return parallel(f.n, ax.a);
        if (["CYLINDRE", "CONE"].includes(f.type)) return f.a && parallel(f.a, ax.a) && onLine(f.ao);
        if (f.type === "SPHERE") return f.ao && onLine(f.ao);
        return f.type === "TORUS";
      });
      if (ok) out.push({ type: "revolve", body: bodyId, faces: F.map((_, i) => i), params: { axis: ax.a, origin: ax.ao }, label: `Axis (${ax.a.map((x) => fmt(x, 2)).join(", ")})` });
    } else if (ax && axes.length === F.filter((f) => f.type !== "PLANE").length) {
      // all-cylinder bodies (e.g. a stepped shaft) are revolves when coaxial with planar caps
      const onLine = (p) => V.len(V.cross(V.sub(p, ax.ao), ax.a)) < 1e-5;
      if (F.every((f) => (f.type === "PLANE" ? parallel(f.n, ax.a) : parallel(f.a, ax.a) && onLine(f.ao)))) out.push({ type: "revolve", body: bodyId, faces: F.map((_, i) => i), params: { axis: ax.a, origin: ax.ao }, label: `Axis (${ax.a.map((x) => fmt(x, 2)).join(", ")})` });
    }
  }
  // ---- mirror: symmetric about a principal plane through the box centre
  if (want("mirror") && (!faceFilter || faceFilter.size === F.length)) {
    const c = [0, 1, 2].map((k) => (bb.min[k] + bb.max[k]) / 2);
    let vol = 0;
    try { vol = K.volumeOf(b.shape); } catch { vol = 0; }
    for (const [n, name] of [[[1, 0, 0], "YZ"], [[0, 1, 0], "XZ"], [[0, 0, 1], "XY"]]) {
      let m = null, x = null;
      try {
        m = K.mirrored(b.shape, n, c);
        x = K.intersect(b.shape, m);
        const vi = x && !K.isEmptyShape(x) ? K.volumeOf(x) : 0;
        if (vol > 0 && Math.abs(vi - vol) / vol < 1e-4) out.push({ type: "mirror", body: bodyId, faces: [], params: { plane: name, origin: c }, label: `${name}-parallel plane at ${c.map((v) => fmt(v, 1)).join(", ")}` });
      } catch { /* ignore */ } finally { try { if (m) m.delete(); if (x) x.delete(); } catch { /* ignore */ } }
    }
  }
  // ---- patterns of equal holes
  const groupsBy = (list, keyFn) => { const m = new Map(); for (const x of list) { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return [...m.values()]; };
  const eqHoles = groupsBy(holes, (h) => `${fmt(h.d, 4)}|${h.a.map((v) => Math.abs(v).toFixed(4)).join(",")}|${fmt(h.len, 3)}`).filter((g) => g.length >= 2);
  for (const g of eqHoles) {
    const a = g[0].a;
    const pts = g.map((h) => { const t = V.dot(V.sub(h.o, g[0].o), a); return [h.o[0] - a[0] * t, h.o[1] - a[1] * t, h.o[2] - a[2] * t]; });
    // circular: equidistant from the centroid and evenly spaced in angle
    if (want("cpattern") && g.length >= 3) {
      const cen = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
      const rs = pts.map((p) => V.len(V.sub(p, cen)));
      if (rs[0] > 1e-6 && rs.every((r) => Math.abs(r - rs[0]) < 1e-4)) {
        const ref = V.sub(pts[0], cen), ref2 = V.cross(a, ref);
        const ang = pts.map((p) => { const d = V.sub(p, cen); return (Math.atan2(V.dot(d, ref2), V.dot(d, ref)) + 2 * Math.PI) % (2 * Math.PI); }).sort((x, y) => x - y);
        const steps = ang.map((x, k) => (k ? x - ang[k - 1] : null)).slice(1);
        const st = steps[0];
        if (steps.every((s) => Math.abs(s - st) < 1e-4)) {
          const total = Math.abs(st * g.length - 2 * Math.PI) < 1e-3 ? 360 : (st * (g.length - 1) * 180) / Math.PI;
          out.push({ type: "cpattern", body: bodyId, faces: g.flatMap((h) => h.faces), params: { count: g.length, angle: total, diameter: rs[0] * 2 }, label: `${g.length} x Ø ${fmt(g[0].d)} mm holes, ${fmt(total, 1)} deg` });
          continue;
        }
      }
    }
    // rectangular: points on a line or a grid with equal spacing
    if (want("rpattern")) {
      const xs = pts.map((p) => p);
      const d0 = V.sub(xs[1], xs[0]);
      const collinear = xs.every((p) => V.len(V.cross(V.sub(p, xs[0]), d0)) < 1e-4 * Math.max(1, V.len(d0)));
      if (collinear) {
        const u = d0.map((x) => x / V.len(d0));
        const ts = xs.map((p) => V.dot(V.sub(p, xs[0]), u)).sort((x, y) => x - y);
        const sp = ts[1] - ts[0];
        if (sp > 1e-6 && ts.every((t, k) => Math.abs(t - ts[0] - k * sp) < 1e-4)) out.push({ type: "rpattern", body: bodyId, faces: g.flatMap((h) => h.faces), params: { count: g.length, spacing: sp, columns: g.length, rows: 1 }, label: `${g.length} x Ø ${fmt(g[0].d)} mm holes, spacing ${fmt(sp)} mm` });
      } else {
        // grid: two spacings along two directions
        const uniq = (arr) => [...new Set(arr.map((v) => Math.round(v * 1e4) / 1e4))].sort((x, y) => x - y);
        const ref = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        const e1 = V.cross(a, ref).map((x, _, arr) => x / Math.hypot(...arr)), e2 = V.cross(a, e1);
        const u1 = uniq(xs.map((p) => V.dot(p, e1))), u2 = uniq(xs.map((p) => V.dot(p, e2)));
        const even = (u) => u.length < 2 || u.every((t, k) => Math.abs(t - u[0] - k * (u[1] - u[0])) < 1e-3);
        if (u1.length * u2.length === g.length && even(u1) && even(u2)) out.push({ type: "rpattern", body: bodyId, faces: g.flatMap((h) => h.faces), params: { count: g.length, columns: u1.length, rows: u2.length, spacing: u1.length > 1 ? u1[1] - u1[0] : 0, spacing2: u2.length > 1 ? u2[1] - u2[0] : 0 }, label: `${u1.length} x ${u2.length} holes Ø ${fmt(g[0].d)} mm` });
      }
    }
  }
  return out;
}

/** Stored found features of the document: [{id, type, name, body, faces:[{p, n}], params, label}] */
export function foundFeatures(app) { return Array.isArray(app.doc.foundFeatures) ? app.doc.foundFeatures : []; }

/** Face refs of a found feature on the current geometry (re-found by point + normal). */
export function foundFaceRefs(app, ff) {
  const b = app.body(ff.body);
  if (!b) return [];
  const K = app.K;
  const T = K.topoOf(b.shape);
  const out = [];
  for (const fr of ff.faces || []) {
    let idx = -1;
    try { idx = K.nearestFaceIndex(b.shape, fr.p, fr.n); } catch { idx = -1; }
    if (idx >= 0 && T.faces[idx]) out.push({ kind: "face", body: ff.body, index: idx, p: [...T.faces[idx].c], n: [...T.faces[idx].n], planar: T.faces[idx].type === "PLANE" });
  }
  return out;
}

function openFindFeatures(app, ctx = {}) {
  beginModel(app);
  const pre = (ctx.preselect || app.selection.items || []).filter((r) => r.kind === "body" || r.kind === "face");
  const typeRows = TYPES.map(([k, l]) => ({ id: `t_${k}`, type: "check", label: l, default: true }));
  return app.ui.dialog.open({
    id: "FusionFindFeaturesCommand",
    title: "Find Features",
    icon: "FusionFindFeaturesCommand",
    help: "Identifies features in a body. Recognized features are listed in the browser. Select the bodies then specify the feature types to identify.",
    preview: false, noFeature: true, ctrlWidth: 150,
    preselect: pre,
    rows: [
      { id: "ents", type: "selection", label: "Faces/Bodies/Components", kinds: ["body", "face"], prompt: "Select faces or bodies or components to find features", advance: false },
      { id: "all", type: "check", label: "Select All", default: true, sep: true },
      ...typeRows,
    ],
    onChange(id, d) {
      if (id === "all") for (const [k] of TYPES) d.set(`t_${k}`, !!d.values.all, { noPreview: true });
      else if (id.startsWith("t_")) { const all = TYPES.every(([k]) => d.values[`t_${k}`]); if (all !== d.values.all) { d.values.all = all; d.refresh(); } }
    },
    validate(d) { return TYPES.some(([k]) => d.values[`t_${k}`]) ? null : "Select at least one feature type"; },
    commit(_f, d) {
      const types = new Set(TYPES.filter(([k]) => d.values[`t_${k}`]).map(([k]) => k));
      const byBody = new Map();
      for (const r of d.values.ents || []) {
        if (!byBody.has(r.body)) byBody.set(r.body, r.kind === "body" ? null : new Set());
        const s = byBody.get(r.body);
        if (r.kind === "face" && s) s.add(r.index);
        if (r.kind === "body") byBody.set(r.body, null);
      }
      const found = [];
      for (const [bid, faces] of byBody) found.push(...recognize(app, bid, types, faces));
      const K = app.K;
      app.mutate("Find Features", (doc) => {
        doc.foundFeatures = Array.isArray(doc.foundFeatures) ? doc.foundFeatures : [];
        // re-running on a body replaces its earlier results of the chosen types
        doc.foundFeatures = doc.foundFeatures.filter((x) => !(byBody.has(x.body) && types.has(x.type)));
        doc.counters = doc.counters || {};
        for (const f of found) {
          const T = K.topoOf(app.body(f.body).shape);
          const stem = LABEL[f.type].replace(/\s+/g, "");
          doc.counters[`found:${stem}`] = (doc.counters[`found:${stem}`] || 0) + 1;
          doc.counters.foundFeature = (doc.counters.foundFeature || 0) + 1;
          doc.foundFeatures.push({ id: `ff${doc.counters.foundFeature}`, type: f.type, name: `${stem}${doc.counters[`found:${stem}`]}`, body: f.body, faces: f.faces.map((i) => ({ p: [...T.faces[i].c], n: [...T.faces[i].n] })), params: f.params, label: f.label });
        }
      }, { recompute: false });
      return found;
    },
    afterCommit(found) {
      const n = found.length;
      app.toast(n ? `Find Features: ${n} feature${n === 1 ? "" : "s"} recognized (${[...new Set(found.map((f) => LABEL[f.type]))].join(", ")})` : "Find Features: no features of the selected types were recognized", n ? "info" : "warning", 3200);
      try { if (app.ui.browser) { app.ui.browser.invalidate && app.ui.browser.invalidate(); app.ui.browser.expand && app.ui.browser.expand("foundfeatures:root", true); } } catch { /* ignore */ }
    },
  });
}

/** Browser folder "Features" listing the recognized features (browser registerFolder hook). */
function installBrowserFolder(app) {
  const br = app.ui.browser;
  if (!br || typeof br.registerFolder !== "function") return;
  br.registerFolder({
    key: "foundfeatures", label: "Features", after: "bodies:root",
    build(a) {
      const list = foundFeatures(a).filter((f) => a.body(f.body));
      if (!list.length) return null;
      const remove = (ids) => a.mutate("Delete", (doc) => { doc.foundFeatures = (doc.foundFeatures || []).filter((x) => !ids.includes(x.id)); }, { recompute: false });
      return {
        menu: () => [{ label: "Delete All", act: "delete", action: () => remove(list.map((x) => x.id)) }],
        children: list.map((f) => ({
          key: `foundfeature:${f.id}`, label: f.name, renamable: true,
          icon: featureIconHtml(ICON[f.type]),
          tip: `<b>${esc(f.name)}</b><div class="br-tip-sub">${esc(LABEL[f.type])} (found) · ${esc(f.label || "")}</div>`,
          onClick: () => { const refs = foundFaceRefs(a, f); if (refs.length) a.selection.set(refs); else a.selection.set([{ kind: "body", body: f.body }]); },
          onDbl: () => { const refs = foundFaceRefs(a, f); if (refs.length) a.selection.set(refs); },
          rename: (name) => a.mutate("Rename", (doc) => { const x = (doc.foundFeatures || []).find((y) => y.id === f.id); if (x) x.name = String(name); }, { recompute: false }),
          menu: () => [
            { label: "Select Faces", act: "select-faces", action: () => { const refs = foundFaceRefs(a, f); a.selection.set(refs.length ? refs : [{ kind: "body", body: f.body }]); } },
            "-",
            { label: "Delete", act: "delete", hint: "Del", icon: "m-delete", action: () => remove([f.id]) },
          ],
        })),
      };
    },
  });
  app.on("doc", () => { try { br.invalidate(); } catch { /* ignore */ } });
}
function featureIconHtml(id) { try { return cmdIcon(id, { size: 16 }); } catch { return ""; } }

export function registerFeatureTools(app) {
  app.commands.register({
    id: "FusionFindFeaturesCommand", label: "Find Features", kind: "tool",
    tooltip: "Identifies features in a body. Recognized features are listed in the browser.",
    run: (a, ctx) => openFindFeatures(a, ctx),
  });
  app.on("ready", () => installBrowserFolder(app));
  app.ui.findFeatures = { recognize: (bodyId, types) => recognize(app, bodyId, new Set(types || TYPES.map(([k]) => k))), list: () => foundFeatures(app), faces: (ff) => foundFaceRefs(app, ff) };
  void el; void toBodyRef; void faceRefs;
}
