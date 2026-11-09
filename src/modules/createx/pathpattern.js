// createx: Pattern on Path (PatternOnPath). Feature 'pathpattern': copies of bodies (or re-created features)
// along a path of sketch curves / body edges. Distribution Extent | Spacing, Quantity, Distance, Start Point,
// Flip, Direction One Direction | Symmetric, Orientation Identical | Path Direction.
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import * as U from "../dialogs/util.js";
import { PATTERN_FEATURE_TYPES, toBodyRef } from "../dialogs/common.js";
import { V, Path, buildPath, pathRefs, bodiesBox, frameRotation, rigidPoint, rigidShape, rigidMesh } from "./geom.js";
import { markerSet } from "./markers.js";

/** Path of a pattern, running away from the patterned bodies (an open path starts at its end nearest to them). */
export function orientedPath(st, f) {
  const path = buildPath(st, f.path || [], f.edges || []);
  if (path.closed || f.patternType === "features") return path;
  const bb = bodiesBox(st, f.bodies || []);
  if (!bb) return path;
  const c = V.mul(V.add(bb.min, bb.max), 0.5);
  const a = V.len(V.sub(c, path.pts[0])), b = V.len(V.sub(c, path.pts[path.pts.length - 1]));
  return b < a - 1e-9 ? new Path(path.pts.slice().reverse(), false, null) : path;
}

/** Rigid transforms of the instances (the original excluded): [{R, pivot, t, s}]. */
export function instances(st, f, P) {
  const path = orientedPath(st, f);
  const q = Math.max(1, Math.round(M.fval(P, f, "quantity")));
  const L = path.length;
  const dist = f.distance !== undefined ? M.fval(P, f, "distance") : L;
  const s0 = Math.max(0, Math.min(L, f.start !== undefined ? M.fval(P, f, "start") : 0));
  const sgn = f.flip ? -1 : 1;
  const sym = f.dirType === "sym";
  let step;
  if (f.distType === "spacing") step = dist;
  else {
    const n = sym ? Math.max(1, Math.floor((q - 1) / 2)) : q - 1;
    step = n > 0 ? dist / n : 0;
    if (!sym && path.closed && Math.abs(dist - L) < 1e-6 * Math.max(1, L)) step = L / q;
  }
  const F0 = path.frame(s0);
  const out = [];
  let skipped = 0;
  const offsets = [];
  if (sym) { for (let i = 1; offsets.length < q - 1; i++) { offsets.push(i * step); if (offsets.length < q - 1) offsets.push(-i * step); } }
  else for (let i = 1; i < q; i++) offsets.push(sgn * i * step);
  const sup = new Set(f.suppressInstances || []);
  const all = [];
  let k = 0;
  for (const d of offsets) {
    k++;
    const s = path.wrap(s0 + d);
    if (s === null) { skipped++; continue; }
    const F = path.frame(s);
    const R = f.orientation === "path" ? frameRotation(F0, F) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const T = { R, pivot: F0.o, t: V.sub(F.o, F0.o), s, k };
    all.push(T);
    if (!sup.has(k)) out.push(T);
  }
  return { xs: out, all, skipped, path, s0 };
}

export function registerPathPatternFeature(app) {
  M.registerFeature("pathpattern", {
    label: "Pattern on Path",
    stem: "PathPattern",
    fields: { quantity: "none", distance: "length", start: "length" },
    apply(st, f, P, doc) {
      const { xs, all, skipped } = instances(st, f, P);
      // instance markers for the Suppression toggles (pattern centre carried to every instance)
      const bb = f.patternType === "features" ? null : bodiesBox(st, f.bodies || []);
      const c0 = bb ? V.mul(V.add(bb.min, bb.max), 0.5) : all.length ? all[0].pivot : null;
      const marks = c0 ? all.map((T) => ({ k: T.k, p: rigidPoint(T, c0) })) : [];
      const warn = skipped ? `${skipped} pattern instance${skipped > 1 ? "s are" : " is"} beyond the end of the path` : null;
      if (f.patternType === "features") {
        const r = M.patternFeatures(st, f, P, doc, xs.map((T) => ({ shape: (s) => rigidShape(T, s), point: (p) => rigidPoint(T, p) })));
        if (warn) r.warning = r.warning ? `${r.warning}; ${warn}` : warn;
        return { ...r, marks, count: xs.length + 1 };
      }
      let k = 0, bi = -1;
      const affected = [];
      for (const id of f.bodies || []) {
        bi++;
        const b = st.bodies.get(id), mb = st.meshBodies && st.meshBodies.get(id);
        if (!b && !(mb && mb.mesh)) continue;
        for (const T of xs) {
          k++;
          // ids stay stable when instances are suppressed
          const nid = `${f.id}_${bi * 1000 + T.k}`;
          if (b) st.bodies.set(nid, { id: nid, shape: rigidShape(T, b.shape), from: f.id });
          else st.meshBodies.set(nid, { ...mb, id: nid, mesh: rigidMesh(T, mb.mesh), from: f.id });
          affected.push(nid);
        }
      }
      if (!k && !(f.bodies || []).length) throw new Error("Select objects to pattern");
      return { affected, count: xs.length + 1, marks, ...(warn ? { warning: warn } : {}) };
    },
    deps: (f) => ({ sketches: [...new Set((f.path || []).map((c) => c.sketch))], bodies: [...(f.bodies || []), ...(f.edges || []).map((e) => e.body)], features: f.features || [], cplanes: [], geo: (f.edges || []).map((e) => ({ ...e, kind: "edge" })) }),
    editor: (a, id) => openPathPattern(a, { editId: id }),
    icon: "PatternOnPath",
  });
}

// ---------------------------------------------------------------- dialog
// Object Type "Features": the feature types model.js patternFeatures can re-create
const PATTERNABLE = new Set(["extrude", "revolve", "hole", "box", "cylinder", "sphere", "torus", "loft", "sweep", "coil", "pipe", "fillet", "chamfer"]);
function featureOfRef(dlg, ref) {
  const app = dlg.app, doc = app.doc;
  const lim = dlg.editId ? app.featureIndex(dlg.editId) : doc.marker;
  const res = (app.result && app.result.results) || {};
  const ok = (f, i) => !!f && i >= 0 && i < lim && PATTERNABLE.has(f.type) && !f.suppressed && !(res[f.id] && (res[f.id].ok === false || res[f.id].rolled));
  if (ref.kind === "feature") return ok(app.feature(ref.id), app.featureIndex(ref.id)) ? ref.id : null;
  if (ref.kind !== "face" || !Array.isArray(ref.p)) return null;
  let probe = null;
  try {
    for (let i = Math.min(lim, doc.features.length) - 1; i >= 0; i--) {
      const f = doc.features[i];
      const tool = ok(f, i) && res[f.id] && res[f.id].tool;
      if (!tool) continue;
      probe = probe || K.pointProbe(ref.p);
      if (probe.dist(tool) < 1e-3) return f.id;
    }
  } catch { /* no feature */ } finally { if (probe) probe.delete(); }
  return null;
}

export function openPathPattern(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const pre = opts.preselect || [];
  const type0 = f0 ? (f0.patternType === "features" ? "features" : "bodies") : pre.some((r) => r.kind === "body" || r.kind === "face") ? "bodies" : "features";
  return app.ui.dialog.open({
    id: "PatternOnPath",
    title: "Pattern on Path",
    icon: "PatternOnPath",
    editId,
    featureLabel: "Pattern on Path",
    help: "Duplicates faces, bodies, features, or components in a design and distributes them to create a pattern along a specific path.",
    preselect: pre.map((r) => (r.kind === "feature" ? r : r.kind === "sketchCurve" || r.kind === "edge" ? r : toBodyRef(r))).filter(Boolean),
    rows: [
      { id: "patternType", type: "dropdown", label: "Object Type", options: PATTERN_FEATURE_TYPES, default: type0 },
      { id: "features", type: "selection", label: "Objects", kinds: ["feature", "face"], prompt: "Select features to pattern",
        filter: (r, dlg) => !!featureOfRef(dlg, r), mapRef: (r, dlg) => { const id = featureOfRef(dlg, r); return id ? { kind: "feature", id } : null; },
        visible: (v) => v.patternType === "features" },
      { id: "bodies", type: "selection", label: "Objects", kinds: ["body", "face"], meshBodies: true, mapRef: toBodyRef, prompt: "Select bodies to pattern", visible: (v) => v.patternType !== "features" },
      { id: "pathSel", type: "selection", label: "Path", kinds: ["sketchCurve", "edge"], prompt: "Select an object to define the path to distribute pattern instances along.", tooltip: "Select an object to define the path to distribute pattern instances along.", advance: false },
      { id: "distType", type: "dropdown", label: "Distribution", options: [{ value: "extent", label: "Extent", icon: "extentWhole" }, { value: "spacing", label: "Spacing", icon: "extentSpacing" }], default: "extent", sep: true },
      { id: "quantity", type: "value", label: "Quantity", kind: "none", default: "3", integer: true, min: 1 },
      { id: "distance", type: "value", label: "Distance", kind: "length", default: "10.00 mm" },
      { id: "start", type: "value", label: "Start Point", kind: "length", default: "0.00 mm", nonNegative: true, tooltip: "Distance along the path where the original object sits." },
      { id: "flip", type: "check", label: "Flip", default: false, tooltip: "Reverses the pattern direction along the path." },
      { id: "dirType", type: "dropdown", label: "Direction", options: [{ value: "one", label: "One Direction", icon: "oneSide" }, { value: "sym", label: "Symmetric", icon: "symmetric" }], default: "one" },
      { id: "orientation", type: "dropdown", label: "Orientation", options: [{ value: "identical", label: "Identical" }, { value: "path", label: "Path Direction" }], default: "identical" },
      { id: "suppress", type: "check", label: "Suppression", default: false, tooltip: "Check Suppression, then uncheck instances in the canvas to remove them from the pattern." },
    ],
    init(dlg) {
      dlg.values.suppressed = f0 && Array.isArray(f0.suppressInstances) ? [...f0.suppressInstances] : [];
      dlg._marks = markerSet(app);
      if (!f0) return;
      const st = dlg.baseState;
      Object.assign(dlg.values, {
        patternType: f0.patternType === "features" ? "features" : "bodies",
        bodies: (f0.bodies || []).map((b) => ({ kind: "body", body: b })),
        features: (f0.features || []).map((id) => ({ kind: "feature", id })),
        pathSel: [...(f0.path || []).map((c) => ({ kind: "sketchCurve", sketch: c.sketch, curve: c.curve })), ...(f0.edges || []).map((e) => U.edgeRef(st, e.body, e.p)).filter(Boolean)],
        distType: f0.distType || "extent", dirType: f0.dirType || "one", orientation: f0.orientation || "identical", flip: !!f0.flip,
        suppress: !!(f0.suppressInstances && f0.suppressInstances.length),
      });
      for (const k of ["quantity", "distance", "start"]) if (f0[k] !== undefined) dlg.values[k] = String(f0[k]);
    },
    onChange(id, dlg) {
      const v = dlg.values;
      if (id === "patternType") {
        const row = v.patternType === "features" ? "features" : "bodies";
        if (!(v[row] || []).length) dlg.activate(row);
      } else if (id === "pathSel" && v.distType === "extent" && !dlg.touched.has("distance")) {
        // Extent starts out as the whole path length
        try {
          const { curves, edges } = pathRefs(v.pathSel);
          const L = buildPath(dlg.baseState, curves, edges).length;
          if (L > 0) dlg.set("distance", `${L.toFixed(2)} mm`, { noPreview: true });
        } catch { /* incomplete chain */ }
      }
    },
    build(v) {
      const objs = v.patternType === "features" ? { patternType: "features", features: (v.features || []).map((r) => r.id) } : { bodies: (v.bodies || []).map((r) => r.body) };
      if (!(objs.features || objs.bodies).length) return null;
      const { curves, edges } = pathRefs(v.pathSel);
      if (!curves.length && !edges.length) return null;
      const f = { type: "pathpattern", ...objs, path: curves, edges, distType: v.distType, quantity: v.quantity, distance: v.distance, start: v.start, dirType: v.dirType, orientation: v.orientation };
      if (v.flip) f.flip = true;
      if (v.suppress && (v.suppressed || []).length) f.suppressInstances = [...v.suppressed].sort((a, b) => a - b);
      return f;
    },
    afterPreview(dlg) {
      const r = dlg.previewRes;
      const sup = new Set(dlg.values.suppressed || []);
      dlg._marks.set(dlg.values.suppress && r && r.marks ? r.marks.map((m) => ({ id: m.k, p: m.p, on: !sup.has(m.k) })) : []);
    },
    onCanvasDown(ctx, dlg) {
      if (!dlg.values.suppress) return false;
      const k = dlg._marks.hit(ctx.x, ctx.y);
      if (k === null) return false;
      const sup = new Set(dlg.values.suppressed || []);
      if (sup.has(k)) sup.delete(k); else sup.add(k);
      dlg.values.suppressed = [...sup];
      dlg.touched.add("suppressed");
      dlg.schedulePreview(0);
      return true;
    },
    onClose(dlg) { dlg._marks.dispose(); },
    manipulators(dlg) {
      const v = dlg.values;
      let path, s0;
      try {
        const { curves, edges } = pathRefs(v.pathSel);
        if (!curves.length && !edges.length) return [];
        path = orientedPath(dlg.baseState, { path: curves, edges, bodies: (v.bodies || []).map((r) => r.body), patternType: v.patternType });
        s0 = Math.max(0, Math.min(path.length, dlg.num("start") || 0));
      } catch { return []; }
      const F = path.frame(s0);
      const dir = V.mul(F.x, v.flip ? -1 : 1);
      const m = dlg.valueManip("distance", { origin: F.o, dir, id: "distance" });
      return m ? [m] : [];
    },
  });
}
