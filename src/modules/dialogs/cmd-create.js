// Box / Cylinder / Sphere / Torus, Mirror, Rectangular & Circular Pattern, Loft, Sweep.
import * as U from "./util.js";
import * as K from "../../kernel.js";
import { g } from "./glyphs.js";
import { OPERATIONS, PATTERN_TYPES, PATTERN_FEATURE_TYPES, profileRefsOf, profileSelRefs, toBodyRef, profileStatus } from "./common.js";

const V = U.V;

// ------------------------------------------------------------------ primitives
const PRIM = {
  box: {
    id: "PrimitiveBox", title: "Box", help: "Creates a box (rectangular solid body).",
    rows: [
      { id: "length", type: "value", label: "Length", kind: "length", default: "20.00 mm", positive: true },
      { id: "width", type: "value", label: "Width", kind: "length", default: "20.00 mm", positive: true },
      { id: "height", type: "value", label: "Height", kind: "length", default: "20.00 mm", positive: true },
    ],
    manips(dlg, pl, c) {
      const y = K.planeY(pl);
      return [
        dlg.valueManip("height", { origin: c, dir: pl.n, min: 0.01 }),
        dlg.valueManip("length", { origin: c, dir: pl.x, scale: 0.5, min: 0.01, id: "length" }),
        dlg.valueManip("width", { origin: c, dir: y, scale: 0.5, min: 0.01, id: "width" }),
      ];
    },
  },
  cylinder: {
    id: "PrimitiveCylinder", title: "Cylinder", help: "Creates a cylindrical solid body.",
    rows: [
      { id: "diameter", type: "value", label: "Diameter", kind: "length", default: "20.00 mm", positive: true },
      { id: "height", type: "value", label: "Height", kind: "length", default: "20.00 mm", positive: true },
    ],
    manips(dlg, pl, c) {
      return [dlg.valueManip("height", { origin: c, dir: pl.n, min: 0.01 }), dlg.valueManip("diameter", { origin: c, dir: pl.x, scale: 0.5, min: 0.01 })];
    },
  },
  sphere: {
    id: "PrimitiveSphere", title: "Sphere", help: "Creates a spherical solid body.",
    rows: [{ id: "diameter", type: "value", label: "Diameter", kind: "length", default: "20.00 mm", positive: true }],
    manips(dlg, pl, c) { return [dlg.valueManip("diameter", { origin: c, dir: pl.n, scale: 0.5, min: 0.01 })]; },
  },
  torus: {
    id: "PrimitiveTorus", title: "Torus", help: "Creates a torus (donut shaped solid body).",
    rows: [
      { id: "d1", type: "value", label: "Inner Diameter", kind: "length", default: "40.00 mm", positive: true, tooltip: "Diameter of the torus centre circle" },
      { id: "d2", type: "value", label: "Torus Diameter", kind: "length", default: "10.00 mm", positive: true },
    ],
    manips(dlg, pl, c) { return [dlg.valueManip("d1", { origin: c, dir: pl.x, scale: 0.5, min: 0.01 })]; },
  },
};

export function openPrimitive(app, type, opts = {}) {
  const P = PRIM[type];
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const plane = (dlg) => U.resolvePlane(U.planeRefFromRef((dlg.values.plane || [])[0]), dlg.baseState);
  const center = (dlg) => {
    const pl = plane(dlg);
    if (!pl) return null;
    const c = dlg.values.center || [0, 0];
    return { pl, c: K.toWorld(pl, c[0], c[1]) };
  };
  const autoOp = (dlg) => {
    if (dlg.touched.has("operation")) return;
    const cc = center(dlg);
    if (!cc) return;
    // primitives touching or inside a body join it, otherwise they make a new body
    const op0 = type === "box" || type === "cylinder" ? U.autoOperation(app, dlg.baseState, cc.c, [cc.pl.n]) : U.visibleBodies(app, dlg.baseState).length && U.pointInside(app, dlg.baseState, cc.c) ? "join" : "new";
    const op = op0 === "cut" ? "join" : op0;
    if (op !== dlg.values.operation) dlg.set("operation", op, { noPreview: true });
  };
  return app.ui.dialog.open({
    id: P.id,
    title: P.title,
    icon: P.id,
    featureLabel: P.title,
    editId,
    help: P.help,
    preselect: (opts.preselect || []).filter((r) => r.kind === "originPlane" || r.kind === "cplane" || (r.kind === "face" && r.planar !== false)).slice(0, 1),
    // with a plane already chosen (preselected / editing) the next canvas click places the centre
    activate: (dlg) => ((dlg.values.plane || []).length ? false : undefined),
    rows: [
      { id: "plane", type: "selection", label: "Plane", kinds: ["originPlane", "cplane", "face"], planar: true, max: 1, toggle: false, prompt: "Select a plane or planar face" },
      ...P.rows,
      { id: "operation", type: "dropdown", label: "Operation", options: OPERATIONS, default: "new", sep: true },
    ],
    init(dlg) {
      if (f0) {
        Object.assign(dlg.values, { plane: [U.refFromPlaneRef(f0.plane, dlg.baseState)].filter(Boolean), center: f0.center || [0, 0], operation: f0.operation || "new" });
        for (const r of P.rows) if (f0[r.id] !== undefined) dlg.values[r.id] = f0[r.id];
        dlg.touched.add("operation");
      }
    },
    onOpen(dlg) { if ((dlg.values.plane || []).length && !f0) placeFromRef(dlg); autoOp(dlg); },
    onChange(id, dlg, o) {
      if (id === "plane") {
        if (!o.preselect) placeFromRef(dlg);
        if ((dlg.values.plane || []).length) setTimeout(() => { if (!dlg.closed) dlg.activate(null); }, 0);
      }
      if (id === "plane" || id === "center") autoOp(dlg);
    },
    prompt(dlg) {
      if (!(dlg.values.plane || []).length) return "Select a plane or planar face";
      if (dlg.active === "plane") return "Select a plane or planar face";
      return dlg.manips.hover || dlg.manips.drag ? "" : "Click to place the centre, or drag the arrows";
    },
    onCanvasDown(ctx, dlg) {
      if (dlg.active === "plane" || !(dlg.values.plane || []).length) return false;
      const pl = plane(dlg);
      const rp = pl && app.viewport.rayPlane(ctx.x, ctx.y, pl);
      if (!rp) return true;
      dlg.set("center", [+rp.uv[0].toFixed(4), +rp.uv[1].toFixed(4)], { user: true, delay: 0 });
      return true;
    },
    build(v) {
      const pr = U.planeRefFromRef((v.plane || [])[0]);
      if (!pr) return null;
      const f = { type, plane: pr, center: v.center || [0, 0], operation: v.operation };
      for (const r of P.rows) f[r.id] = v[r.id];
      return f;
    },
    manipulators(dlg) {
      const cc = center(dlg);
      if (!cc) return [];
      return P.manips(dlg, cc.pl, cc.c).filter(Boolean);
    },
  });

  function placeFromRef(dlg) {
    const r = (dlg.values.plane || [])[0];
    if (!r) return;
    const pl = U.resolvePlane(U.planeRefFromRef(r), dlg.baseState);
    if (r.kind === "face" && r.p && pl) {
      const uv = K.toLocal(pl, r.p);
      dlg.values.center = [+uv[0].toFixed(4), +uv[1].toFixed(4)];
    } else dlg.values.center = dlg.values.center || [0, 0];
  }
}

// ------------------------------------------------------------------ Mirror
export function openMirror(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "MirrorCommand",
    title: "Mirror",
    icon: "MirrorCommand",
    editId,
    help: "Creates a copy of selected faces, bodies, features, or components, mirrored across a plane.",
    preselect: (opts.preselect || []).map((r) => (r.kind === "body" || r.kind === "face" ? toBodyRef(r) : r)),
    rows: [
      { id: "patternType", type: "dropdown", label: "Object Type", options: PATTERN_TYPES, default: "bodies" },
      { id: "bodies", type: "selection", label: "Objects", kinds: ["body", "face"], mapRef: toBodyRef, prompt: "Select bodies to mirror" },
      { id: "plane", type: "selection", label: "Mirror Plane", kinds: ["originPlane", "cplane", "face"], planar: true, max: 1, prompt: "Select a mirror plane" },
      { id: "operation", type: "dropdown", label: "Operation", options: [{ value: "join", label: "Join", icon: "join" }, { value: "new", label: "New Body", icon: "newBody" }], default: "new", sep: true },
    ],
    init(dlg) {
      if (f0) Object.assign(dlg.values, { bodies: (f0.bodies || []).map((b) => ({ kind: "body", body: b })), plane: [U.refFromPlaneRef(f0.plane, dlg.baseState)].filter(Boolean), operation: f0.operation === "join" ? "join" : "new" });
    },
    build(v) {
      const bodies = (v.bodies || []).map((r) => r.body);
      const plane = U.planeRefFromRef((v.plane || [])[0]);
      if (!bodies.length || !plane) return null;
      return { type: "mirror", bodies, plane, operation: v.operation };
    },
  });
}

// ------------------------------------------------------------------ Patterns
// Object Type "Features": the features a pattern can re-create (tool features + fillet / chamfer;
// see patternFeatures in model.js).
const PATTERNABLE = new Set(["extrude", "revolve", "hole", "box", "cylinder", "sphere", "torus", "loft", "sweep", "coil", "pipe", "fillet", "chamfer"]);

/**
 * Feature id a selection ref stands for in a Features pattern: a timeline / browser item, or a face
 * the feature made (the latest feature whose tool surface carries the picked point). Only features
 * before the pattern's timeline position count.
 */
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
  } catch (e) { console.error(e); } finally { if (probe) probe.delete(); }
  return null;
}
const featureRow = (verb) => ({
  id: "features", type: "selection", label: "Objects", kinds: ["feature", "face"], prompt: `Select features to ${verb}`,
  filter: (r, dlg) => !!featureOfRef(dlg, r),
  mapRef: (r, dlg) => { const id = featureOfRef(dlg, r); return id ? { kind: "feature", id } : null; },
  visible: (v) => v.patternType === "features",
});
const bodyRow = (verb) => ({ id: "bodies", type: "selection", label: "Objects", kinds: ["body", "face"], mapRef: toBodyRef, prompt: `Select bodies to ${verb}`, visible: (v) => v.patternType !== "features" });

/** Object Type of a new pattern: Bodies when bodies / faces were preselected, else Features (Fusion's default). */
function patternTypeFor(f0, pre) {
  if (f0) return f0.patternType === "features" ? "features" : "bodies";
  if (pre.some((r) => r.kind === "feature")) return "features";
  return pre.some((r) => r.kind === "body" || r.kind === "face") ? "bodies" : "features";
}
const patternPreselect = (pre) => pre.map((r) => (r.kind === "feature" ? r : toBodyRef(r))).filter(Boolean);

/** Object Type <-> Objects rows: switching the type activates its row; a pick into a row selects its type. */
function patternOnChange(id, dlg) {
  const v = dlg.values;
  if (id === "patternType") {
    const row = v.patternType === "features" ? "features" : "bodies";
    if (!(v[row] || []).length || !dlg.active || dlg.active === "features" || dlg.active === "bodies") dlg.activate(row);
    dlg._syncSelection();
  } else if (id === "bodies" && (v.bodies || []).length && v.patternType === "features") dlg.set("patternType", "bodies");
  else if (id === "features" && (v.features || []).length && v.patternType !== "features") dlg.set("patternType", "features");
}

/** Centre of the patterned objects (manipulator anchor). */
function patternCenter(dlg) {
  const v = dlg.values;
  if (v.patternType !== "features") return U.bodiesCenter(dlg.baseState, (v.bodies || []).map((r) => r.body));
  const res = (dlg.app.result && dlg.app.result.results) || {};
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const add = (p) => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); } };
  for (const r of v.features || []) {
    const tool = res[r.id] && res[r.id].tool;
    let bb = null;
    try { bb = tool && tool.boundingBox ? tool.boundingBox.bounds : null; } catch { bb = null; }
    if (bb) { add(bb[0]); add(bb[1]); continue; }
    const f = dlg.app.feature(r.id);
    for (const e of (f && f.edges) || []) if (Array.isArray(e.p)) add(e.p);
  }
  return Number.isFinite(mn[0]) ? V.mul(V.add(mn, mx), 0.5) : null;
}

/** Objects part of a pattern feature ({patternType, features} or {bodies}); null when nothing is selected. */
function patternObjects(v) {
  if (v.patternType === "features") {
    const features = (v.features || []).map((r) => r.id);
    return features.length ? { patternType: "features", features } : null;
  }
  const bodies = (v.bodies || []).map((r) => r.body);
  return bodies.length ? { bodies } : null;
}

const dirFilter =(r, dlg) => (r.kind === "sketchCurve" ? U.sketchLineFilter(dlg.baseState)(r) : r.kind === "edge" ? U.isLinearEdge(dlg.baseState, r) : true);

/** Flip toggle placed after a Directions selection (Fusion's flip button). */
const flipButton = (field) => (dlg, re) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "dlg-hbtn dlg-flip";
  b.title = "Flip";
  b.dataset.input = field;
  b.style.marginLeft = "6px";
  b.innerHTML = g("flipDir");
  b.addEventListener("click", () => dlg.set(field, !dlg.values[field], { user: true }));
  const up = re.update;
  re.update = (...a) => { if (up) up(...a); b.classList.toggle("on", !!dlg.values[field]); };
  b.classList.toggle("on", !!dlg.values[field]);
  return b;
};

/** Stored direction (axis name string or axis ref) -> selection ref. */
function dirSelRef(d, state) {
  if (!d) return null;
  if (typeof d === "string") return { kind: "originAxis", name: d };
  return U.refFromAxis(d, state);
}

/** Unit world direction of a Directions selection (flipped when asked). */
function patternDir(dlg, row, flip) {
  const ln = U.axisLine((dlg.values[row] || [])[0], dlg.baseState);
  if (!ln) return null;
  return V.mul(V.norm(ln.d), dlg.values[flip] ? -1 : 1);
}

export function openRectPattern(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const dirRow = (id, flip, optional) => ({
    id, type: "selection", label: "Directions", kinds: ["originAxis", "sketchCurve", "edge"], max: 1, min: optional ? 0 : 1,
    prompt: "Select an edge, axis or sketch line to define the direction", filter: dirFilter, extra: flipButton(flip),
    tooltip: "Select a linear edge, construction axis or sketch line to define the pattern direction.",
  });
  return app.ui.dialog.open({
    id: "PatternRectangular",
    title: "Rectangular Pattern",
    icon: "PatternRectangular",
    editId,
    help: "Duplicates features or bodies in a design and distributes them along linear axes in rows and columns.",
    preselect: patternPreselect(opts.preselect || []),
    rows: [
      { id: "patternType", type: "dropdown", label: "Object Type", options: PATTERN_FEATURE_TYPES, default: patternTypeFor(f0, opts.preselect || []) },
      featureRow("pattern"),
      bodyRow("pattern"),
      { id: "distType", type: "dropdown", label: "Distribution", options: [{ value: "extent", label: "Extent", icon: "extentWhole" }, { value: "spacing", label: "Spacing", icon: "extentSpacing" }], default: "spacing" },
      { id: "g1", type: "group", label: "Direction 1", rows: [
        dirRow("dir1", "flip1", false),
        { id: "q1", type: "value", label: "Quantity", kind: "none", default: "3", integer: true, min: 1 },
        { id: "d1", type: "value", label: "Distance", kind: "length", default: "20.00 mm" },
      ] },
      { id: "g2", type: "group", label: "Direction 2", rows: [
        dirRow("dir2", "flip2", true),
        { id: "q2", type: "value", label: "Quantity", kind: "none", default: "1", integer: true, min: 1, visible: (v) => (v.dir2 || []).length > 0 },
        { id: "d2", type: "value", label: "Distance", kind: "length", default: "20.00 mm", visible: (v) => (v.dir2 || []).length > 0 },
      ] },
    ],
    init(dlg) {
      dlg.values.flip1 = false;
      dlg.values.flip2 = false;
      if (!f0) return;
      const st = dlg.baseState;
      Object.assign(dlg.values, {
        bodies: (f0.bodies || []).map((b) => ({ kind: "body", body: b })),
        features: (f0.features || []).map((id) => ({ kind: "feature", id })),
        distType: f0.distType || "spacing",
        dir1: [dirSelRef(f0.dir1 || "X", st)].filter(Boolean),
        dir2: [dirSelRef(f0.dir2, st)].filter(Boolean),
        flip1: !!f0.flip1,
        flip2: !!f0.flip2,
      });
      for (const k of ["q1", "d1", "q2", "d2"]) if (f0[k] !== undefined) dlg.values[k] = String(f0[k]);
    },
    onChange: patternOnChange,
    build(v) {
      const objs = patternObjects(v);
      const dir1 = U.axisFromRef((v.dir1 || [])[0]);
      if (!objs || !dir1) return null;
      const f = { type: "rpattern", ...objs, dir1, q1: v.q1, d1: v.d1, distType: v.distType };
      if (v.flip1) f.flip1 = true;
      const dir2 = U.axisFromRef((v.dir2 || [])[0]);
      if (dir2) { f.dir2 = dir2; f.q2 = v.q2; f.d2 = v.d2; if (v.flip2) f.flip2 = true; }
      return f;
    },
    manipulators(dlg) {
      const v = dlg.values;
      const c = patternCenter(dlg);
      if (!c) return [];
      const out = [];
      for (const [row, flip, q, d] of [["dir1", "flip1", "q1", "d1"], ["dir2", "flip2", "q2", "d2"]]) {
        const dir = patternDir(dlg, row, flip);
        if (!dir) continue;
        const n = Math.max(1, Math.round(dlg.num(q) || 1));
        const dist = dlg.num(d);
        const scale = v.distType === "spacing" ? Math.max(1, n - 1) : 1;
        // distance arrow at the far end of the pattern
        const m = dlg.valueManip(d, { origin: c, dir, scale });
        if (m) out.push(m);
        // quantity handle just past the arrow: drag outwards / inwards to add / remove instances
        if (!Number.isFinite(dist)) continue;
        const end = V.add(c, V.mul(dir, dist * scale));
        const sgn = dist < 0 ? -1 : 1;
        const vp = dlg.app.viewport;
        const px = (vp && vp.pixelSize && vp.pixelSize(end)) || 0.1;
        const spacing = v.distType === "spacing" ? Math.abs(dist) : n > 1 ? Math.abs(dist) / (n - 1) : Math.abs(dist);
        const step = Math.max(spacing, 28 * px);
        out.push({
          id: q, type: "plane", look: "point", value: n, center: end, offDir: V.mul(dir, sgn), offPx: 46,
          field: q, kind: "none", text: v[q],
          getStart: () => [Math.max(1, Math.round(dlg.num(q) || 1))],
          onDelta: (dv, final, st) => {
            const k = Math.max(1, (st ? st[0] : n) + Math.round((V.dot(dv, dir) * sgn) / step));
            dlg.set(q, String(k), { user: true, delay: final ? 0 : 60, throttle: !final });
            if (final) dlg.previewNow();
          },
          onText: (s, final) => dlg.set(q, s, { user: true, delay: final ? 0 : 250 }),
        });
      }
      return out;
    },
  });
}

export function openCircPattern(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "PatternCircular",
    title: "Circular Pattern",
    icon: "PatternCircular",
    editId,
    help: "Duplicates features or bodies in a design and distributes them around a linear axis to create a circular pattern.",
    preselect: (opts.preselect || []).map((r) => (r.kind === "face" ? toBodyRef(r) : r)),
    rows: [
      { id: "patternType", type: "dropdown", label: "Object Type", options: PATTERN_FEATURE_TYPES, default: patternTypeFor(f0, opts.preselect || []) },
      featureRow("pattern"),
      bodyRow("pattern"),
      { id: "axis", type: "selection", label: "Axis", kinds: ["originAxis", "sketchCurve", "edge"], max: 1, prompt: "Select an axis", filter: (r, dlg) => (r.kind === "sketchCurve" ? U.sketchLineFilter(dlg.baseState)(r) : true) },
      { id: "angType", type: "dropdown", label: "Type", options: [{ value: "full", label: "Full", icon: "revFull" }, { value: "angle", label: "Angle", icon: "revAngle" }] },
      { id: "angle", type: "value", label: "Total Angle", kind: "angle", default: "180.0 deg", visible: (v) => v.angType === "angle" },
      { id: "count", type: "value", label: "Quantity", kind: "none", default: "3", integer: true, min: 1 },
    ],
    init(dlg) {
      if (!f0) return;
      const full = f0.angle === undefined || Math.abs(Number.parseFloat(f0.angle) - 360) < 1e-9;
      Object.assign(dlg.values, { bodies: (f0.bodies || []).map((b) => ({ kind: "body", body: b })), features: (f0.features || []).map((id) => ({ kind: "feature", id })), axis: [U.refFromAxis(f0.axis, dlg.baseState)].filter(Boolean), count: String(f0.count ?? "3"), angType: full ? "full" : "angle", angle: full ? "180.0 deg" : f0.angle });
    },
    onChange: patternOnChange,
    build(v) {
      const objs = patternObjects(v);
      const axis = U.axisFromRef((v.axis || [])[0]);
      if (!objs || !axis) return null;
      return { type: "cpattern", ...objs, axis, count: v.count, angle: v.angType === "full" ? "360 deg" : v.angle };
    },
  });
}

// ------------------------------------------------------------------ Loft / Sweep
export function openLoft(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "SolidLoft",
    title: "Loft",
    icon: "SolidLoft",
    editId,
    help: "Creates a transition shape between two or more sketch profiles or planar faces.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "profile"),
    rows: [
      { id: "profiles", type: "selection", label: "Profiles", kinds: ["profile"], min: 2, prompt: "Select two or more profiles on different planes", filter: (r, dlg) => !(dlg.values.profiles || []).some((x) => x.sketch === r.sketch && x.key !== r.key) },
      { id: "chain", type: "check", label: "Chain Selection", default: true },
      { id: "ruled", type: "check", label: "Ruled" },
      { id: "operation", type: "dropdown", label: "Operation", options: OPERATIONS, default: "new", sep: true },
    ],
    init(dlg) { if (f0) Object.assign(dlg.values, { profiles: profileSelRefs(f0.profiles), ruled: !!f0.ruled, operation: f0.operation || "new" }); },
    status: (dlg) => profileStatus(dlg, dlg.values.profiles),
    build(v) {
      const profiles = profileRefsOf(v.profiles);
      if (profiles.length < 2) return null;
      return { type: "loft", profiles, ruled: !!v.ruled, operation: v.operation };
    },
    commit(f, dlg) { return dlg.commitFeature(f, { hideSketches: editId ? [] : [...new Set(f.profiles.map((p) => p.sketch))] }); },
  });
}

export function openSweep(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "Sweep",
    title: "Sweep",
    icon: "Sweep",
    editId,
    help: "Sweeps a sketch profile along a selected path.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "profile").slice(0, 1),
    rows: [
      { id: "type", type: "dropdown", label: "Type", options: [{ value: "single", label: "Single Path", icon: "singlePath" }, { value: "guide", label: "Path + Guide Rail", icon: "pathGuide", disabled: true }, { value: "surface", label: "Path + Guide Surface", icon: "pathGuide", disabled: true }] },
      { id: "profile", type: "selection", label: "Profile", kinds: ["profile"], max: 1, prompt: "Select a profile to sweep" },
      { id: "path", type: "selection", label: "Path", kinds: ["sketchCurve"], prompt: "Select connected sketch curves for the path", filter: (r, dlg) => { const p = (dlg.values.path || [])[0]; const pr = (dlg.values.profile || [])[0]; return (!p || p.sketch === r.sketch) && (!pr || pr.sketch !== r.sketch); } },
      { id: "operation", type: "dropdown", label: "Operation", options: OPERATIONS, default: "new", sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, {
        profile: f0.profile ? profileSelRefs([f0.profile]) : [],
        path: ((f0.path && f0.path.curves) || []).map((c) => ({ kind: "sketchCurve", sketch: f0.path.sketch, curve: c })),
        operation: f0.operation || "new",
      });
    },
    build(v) {
      const pr = profileRefsOf(v.profile)[0];
      const path = v.path || [];
      if (!pr || !path.length) return null;
      return { type: "sweep", profile: pr, path: { sketch: path[0].sketch, curves: path.map((r) => r.curve) }, operation: v.operation };
    },
    commit(f, dlg) { return dlg.commitFeature(f, { hideSketches: editId ? [] : [f.profile.sketch, f.path.sketch] }); },
  });
}

void V;
