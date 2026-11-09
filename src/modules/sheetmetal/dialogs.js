// sheetmetal: command dialogs (dialog framework, app.ui.dialog.open).
import { prepareFeature } from "../../app/core.js";
import * as K from "../../kernel.js";
import * as G from "./geom.js";
import { V, apply, applyDir, inv } from "./math.js";
import { beginModelCommand, profileRefsOf, profileSelRefs, profileStatus, edgeStatus } from "../dialogs/common.js";
import * as R from "./rules.js";
import { HEM_TYPES, bendAt, flangeAt } from "./features.js";

const clone = (o) => JSON.parse(JSON.stringify(o));
const smData = (dlg, body) => (dlg.baseState && dlg.baseState.smData instanceof Map ? dlg.baseState.smData.get(body) : null);
const isSheet = (dlg, ref) => !!(ref && ref.body && smData(dlg, ref.body));
const fmtLen = (v) => `${(+v).toFixed(2)} mm`;
const plainRef = (r) => { const o = { body: r.body, p: r.p }; if (r.n) o.n = r.n; return o; };
const LINE_OK = (dlg, ref) => {
  const b = dlg.baseState.bodies.get(ref.body);
  if (!b) return false;
  const e = K.topoOf(b.shape).edges[ref.index];
  return !!e && e.type === "LINE";
};
/** Rule numbers of the document's active rule (for default values shown in dialogs). */
function ruleNow(app) {
  try { return R.evalRule(R.ruleFor(app.doc), app.M.buildParams(app.doc)); } catch { return R.evalRule(R.defaultRule(), null); }
}
/** Commit a feature, optionally adding a rule to the design and bumping rule users, as one undo step. */
function commitWith(app, dlg, f, { label, hideSketches = [], ruleId = null } = {}) {
  const editId = dlg.editId;
  return app.mutate(label || (editId ? `Edit ${dlg.spec.featureLabel}` : `Create ${dlg.spec.featureLabel}`), (doc) => {
    if (ruleId) {
      const sm = R.ensureDoc(doc);
      if (!sm.rules.some((r) => r.id === ruleId)) {
        const lib = R.libraryRules().find((r) => r.id === ruleId);
        if (lib) { const c = clone(lib); delete c.builtin; delete c.user; sm.rules.push(c); }
      }
    }
    let nf;
    if (editId) {
      const old = doc.features.find((x) => x.id === editId);
      if (!old) throw new Error("The feature no longer exists");
      const keep = { id: old.id, name: old.name, p: old.p, newBody: old.newBody, newBodies: old.newBodies, suppressed: old.suppressed, visible: old.visible, occ: old.occ, newOcc: old.newOcc, newComp: old.newComp };
      for (const k of Object.keys(old)) delete old[k];
      Object.assign(old, clone(f));
      for (const [k, v] of Object.entries(keep)) if (v !== undefined) old[k] = v;
      prepareFeature(doc, old);
      nf = old;
    } else {
      nf = clone(f);
      prepareFeature(doc, nf);
      doc.features.splice(doc.marker, 0, nf);
      doc.marker += 1;
    }
    for (const sid of hideSketches) {
      const s = doc.features.find((x) => x.id === sid);
      if (s && s.type === "sketch" && doc.features.indexOf(s) < doc.features.indexOf(nf)) s.visible = false;
    }
    return nf;
  });
}
const sheetFaceRow = (id, label, prompt, extra = {}) => ({
  id, type: "selection", label, kinds: ["face"], max: 1, prompt,
  filter: (r, dlg) => isSheet(dlg, r) && r.planar !== false, ...extra,
});
const keepRefs = (list, kinds) => (list || []).filter((r) => kinds.includes(r.kind || "face"));
const asFace = (r) => ({ kind: "face", body: r.body, p: r.p, n: r.n, planar: true });
const asEdge = (dlg, r) => {
  const b = dlg.baseState.bodies.get(r.body);
  if (!b) return null;
  const i = dlg.app.M.locateEdge(b.shape, { ...r });
  return i >= 0 ? { kind: "edge", body: r.body, index: i, p: r.p } : null;
};

/** Edges tangent-connected to edge ref r that lie on the same flange boundary (same side): Chain Selection. */
function chainEdges(dlg, r) {
  const b = dlg.baseState.bodies.get(r.body), d = smData(dlg, r.body);
  if (!b || !d) return r;
  const T = K.topoOf(b.shape);
  const e0 = T.edges[r.index];
  const info0 = e0 && G.edgeOnFlange(b.shape, d, e0.s, e0.t);
  if (!info0) return r;
  const ends = (g) => [{ p: g.s, t: g.ts }, { p: g.t, t: g.tt }];
  const idx = [r.index];
  for (let k = 0; k < idx.length && idx.length < 64; k++) {
    const ea = ends(T.edges[idx[k]]);
    T.edges.forEach((g, j) => {
      if (idx.includes(j) || g.type !== "LINE") return;
      if (!ea.some((a) => ends(g).some((c) => V.len(V.sub(a.p, c.p)) < 1e-5 && Math.abs(V.dot(a.t, c.t)) > 0.9995))) return;
      const inf = G.edgeOnFlange(b.shape, d, g.s, g.t);
      if (inf && inf.fid === info0.fid && inf.side === info0.side) idx.push(j);
    });
  }
  return idx.map((i) => ({ kind: "edge", body: r.body, index: i, p: i === r.index ? r.p : T.edges[i].m }));
}

// ================================================================ Flange (base / edge), Hem, Lofted
const TYPE_OPTS = [
  { value: "flange", label: "Flange (Base/Edge/Contour)" },
  { value: "hem", label: "Hem" },
  { value: "loft", label: "Lofted Flange" },
];
const HEM_LABEL = { flat: "Flat", open: "Open", rolled: "Rolled", teardrop: "Teardrop", rope: "Rope", double: "Double" };

export function openFlange(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const pre = opts.preselect || (editId ? [] : beginModelCommand(app));
  const type0 = f0 ? (f0.type === "smHem" ? "hem" : f0.type === "smLoft" ? "loft" : "flange") : opts.type || "flange";
  if (type0 === "loft") return openLoft(app, opts);
  const rule = ruleNow(app);
  const sm = R.smDoc(app.doc);
  const ruleOpts = () => {
    const design = R.smDoc(app.doc).rules.map((r) => ({ value: r.id, label: r.name }));
    const lib = R.libraryRules().filter((r) => !design.some((d) => d.value === r.id)).map((r) => ({ value: r.id, label: `${r.name} (Library)` }));
    return [...design, ...lib];
  };
  const mode = (v) => ((v.sel || []).some((r) => r.kind === "sketchCurve") ? "contour" : (v.sel || []).some((r) => r.kind === "profile") ? "base" : "edge");
  const sheetRows = (v) => isFlange(v) && (mode(v) === "base" || mode(v) === "contour");
  const isContour = (v) => isFlange(v) && mode(v) === "contour";
  const isFlange = (v) => v.type === "flange";
  const isHem = (v) => v.type === "hem";
  const edgeRows = (v) => (isFlange(v) && mode(v) === "edge") || isHem(v);
  const overrideRows = (v) => edgeRows(v) || isContour(v);
  const hemIs = (...t) => (v) => isHem(v) && t.includes(v.hemType);
  return app.ui.dialog.open({
    id: type0 === "hem" ? "FusionSheetMetalHemFlangeCommand" : "FusionSheetMetalFlangeCommand",
    title: "Flange",
    icon: type0 === "hem" ? "FusionSheetMetalHemFlangeCommand" : "FusionSheetMetalFlangeCommand",
    featureLabel: "Flange",
    editId,
    help: "Creates base, edge and contour flanges from profiles or edges.",
    preselect: pre,
    labelWidth: 118,
    ctrlWidth: 190,
    rows: [
      { id: "type", type: "dropdown", label: "Type", options: TYPE_OPTS, default: type0, tooltip: "Flange (Base/Edge/Contour), Hem or Lofted Flange." },
      {
        id: "sel", type: "selection", labelFn: (v) => (isHem(v) ? "Edges" : "Edges/Profiles"), label: "Edges/Profiles", kinds: ["edge", "profile", "sketchCurve"],
        prompt: "Select sheet metal edges or sketch profiles to create flange.",
        tooltip: "Select sheet metal edges or sketch profiles to create flange or hem.",
        filter: (r, dlg) => {
          const v = dlg.values;
          if (r.kind === "profile") return isFlange(v) && !(v.sel || []).some((x) => x.kind !== "profile");
          if (r.kind === "sketchCurve") {
            if (!isFlange(v) || (v.sel || []).some((x) => x.kind !== "sketchCurve")) return false;
            const sk = dlg.baseState.sketches.get(r.sketch);
            const c = sk && sk.sk.curves[r.curve];
            return !!c && !c.cons && (c.type === "line" || c.type === "arc") && !(v.sel || []).some((x) => x.sketch !== r.sketch);
          }
          if (!isSheet(dlg, r) || !LINE_OK(dlg, r)) return false;
          return !(v.sel || []).some((x) => x.kind !== "edge");
        },
        // an open sketch profile is the whole connected chain; Chain Selection grows edges along tangent chains
        mapRef: (r, dlg) => {
          if (r.kind === "sketchCurve") { const sk = dlg.baseState.sketches.get(r.sketch); return sk ? G.sketchChain(sk.sk, r.curve).map((cid) => ({ kind: "sketchCurve", sketch: r.sketch, curve: cid })) : r; }
          if (r.kind === "edge" && dlg.values.chain && isFlange(dlg.values)) return chainEdges(dlg, r);
          return r;
        },
        selText: (n, dlg) => (n ? `${n} selected` : "Select"),
      },
      // ---- base flange
      // ---- contour flange (open sketch profile)
      { id: "cfDistance", type: "value", labelFn: (v) => (v.direction === "two" ? "Distance 1" : "Distance"), label: "Distance", kind: "length", default: "10.00 mm", positive: true, visible: isContour, tooltip: "Specify the distance to extrude the selected profile." },
      { id: "cfDistance2", type: "value", label: "Distance 2", kind: "length", default: "10.00 mm", nonNegative: true, visible: (v) => isContour(v) && v.direction === "two", tooltip: "Specify the distance to extrude the selected profile to the other side." },
      { id: "direction", type: "buttons", label: "Direction", default: "one", visible: isContour, options: [{ value: "one", label: "One Side", icon: "oneSide" }, { value: "two", label: "Two Sides", icon: "twoSides" }, { value: "sym", label: "Symmetric", icon: "symmetric" }], tooltip: "Extrudes the flange on one side, unevenly on two sides or evenly on both sides of the profile plane." },
      { id: "orientation", type: "buttons", label: "Orientation", visible: sheetRows, default: "side1", options: [{ value: "side1", label: "Side 1", icon: "oneSide" }, { value: "side2", label: "Side 2", icon: "flip" }, { value: "center", label: "Center", icon: "symmetric" }], tooltip: "Extrudes the sheet metal material to one side, the other side or evenly about the profile." },
      { id: "operation", type: "dropdown", label: "Operation", sep: true, visible: sheetRows, default: "new", options: [{ value: "new", label: "New Body", icon: "newBody" }, { value: "newComponent", label: "New Component", icon: "newComponent" }] },
      { id: "rule", type: "dropdown", label: "Rule", visible: sheetRows, default: sm.active, options: ruleOpts(), tooltip: "Selects a sheet metal rule for the active component." },
      // ---- edge flange
      { id: "extent", type: "dropdown", label: "Flange Extent", visible: (v) => isFlange(v) && mode(v) === "edge", default: "distance", options: [{ value: "distance", label: "Distance", icon: "distance" }, { value: "object", label: "To Object", icon: "toObject" }] },
      { id: "height", type: "value", label: "Height", kind: "length", default: "10.00 mm", positive: true, visible: (v) => isFlange(v) && mode(v) === "edge" && v.extent !== "object", tooltip: "Specifies the height of the flange from the height datum." },
      { id: "toObject", type: "selection", label: "Object", kinds: ["face", "cplane", "originPlane"], max: 1, min: 1, visible: (v) => isFlange(v) && mode(v) === "edge" && v.extent === "object", prompt: "Select a face or plane to extend the flange to", filter: (r) => r.kind !== "face" || r.planar !== false },
      { id: "toOffset", type: "value", label: "Offset", kind: "length", default: "0.00 mm", visible: (v) => isFlange(v) && mode(v) === "edge" && v.extent === "object" },
      { id: "angle", type: "value", label: "Angle", kind: "angle", default: "90.0 deg", min: 0, max: 180, visible: (v) => isFlange(v) && mode(v) === "edge", tooltip: "Specifies the angle of the flange." },
      // ---- hem
      { id: "hemType", type: "dropdown", label: "Type", visible: isHem, default: "flat", options: HEM_TYPES.map((t) => ({ value: t, label: HEM_LABEL[t] })), tooltip: "Flat, Open, Rolled, Teardrop, Rope or Double hem." },
      { id: "gap", type: "value", label: "Gap", kind: "length", default: fmtLen(rule.T / 2), nonNegative: true, visible: hemIs("open", "teardrop", "rope", "double"), tooltip: "Space between the layers of sheet metal after folding." },
      { id: "radius", type: "value", label: "Radius", kind: "length", default: fmtLen(rule.T), positive: true, visible: hemIs("rolled", "teardrop", "rope"), tooltip: "Curvature of the fold." },
      { id: "hemAngle", type: "value", label: "Angle", kind: "angle", default: "270.0 deg", min: 1, max: 359, visible: hemIs("rolled"), tooltip: "How far the edge folds to form the rounded cavity." },
      { id: "setback", type: "value", label: "Setback", kind: "length", default: fmtLen(rule.T), nonNegative: true, visible: hemIs("double") },
      { id: "length", type: "value", label: "Length", kind: "length", default: "10.00 mm", nonNegative: true, visible: hemIs("flat", "open", "teardrop", "rope", "double"), tooltip: "Distance to extrude the hem from the selected edge." },
      // ---- edge flange & hem common
      { id: "width", type: "dropdown", label: "Edge Extents", visible: edgeRows, default: "full", options: [{ value: "full", label: "Full Edge", icon: "all" }, { value: "symmetric", label: "Symmetric", icon: "symmetric" }, { value: "twoSides", label: "Two Sides", icon: "twoSides" }, { value: "twoOffsets", label: "Two Offsets", icon: "twoSides" }] },
      { id: "w1", type: "value", labelFn: (v) => (v.width === "symmetric" ? "Distance" : "Distance 1"), label: "Distance 1", kind: "length", default: "10.00 mm", positive: true, visible: (v) => edgeRows(v) && (v.width === "symmetric" || v.width === "twoSides") },
      { id: "w2", type: "value", label: "Distance 2", kind: "length", default: "10.00 mm", nonNegative: true, visible: (v) => edgeRows(v) && v.width === "twoSides" },
      { id: "o1", type: "value", label: "Offset 1", kind: "length", default: "0.00 mm", nonNegative: true, visible: (v) => edgeRows(v) && v.width === "twoOffsets" },
      { id: "o2", type: "value", label: "Offset 2", kind: "length", default: "0.00 mm", nonNegative: true, visible: (v) => edgeRows(v) && v.width === "twoOffsets" },
      { id: "datum", type: "buttons", label: "Height Datum", visible: (v) => isFlange(v) && mode(v) === "edge" && v.extent !== "object", default: "outer", options: [{ value: "inner", label: "Inner Faces", icon: "inside" }, { value: "outer", label: "Outer Faces", icon: "outside" }, { value: "tangent", label: "Tangent To Bend", icon: "tangentG1" }], tooltip: "Measures the height from the inner faces, the outer faces or tangent to the bend." },
      { id: "position", type: "buttons", labelFn: () => "Bend Position", label: "Bend Position", visible: edgeRows, default: "adjacent", options: [{ value: "inside", label: "Inside", icon: "inside" }, { value: "outside", label: "Outside", icon: "outside" }, { value: "adjacent", label: "Adjacent", icon: "oneSide" }, { value: "tangent", label: "Tangent", icon: "tangentG1" }], tooltip: "Inside, Outside, Adjacent or Tangent to the selected edge." },
      { id: "flip", type: "check", label: "Flip", default: false, visible: edgeRows, tooltip: "Flips the flange 180 degrees over the base flange." },
      { id: "chain", type: "check", label: "Chain Selection", default: true, visible: (v) => isFlange(v) && mode(v) === "edge", tooltip: "Selects connected chains of geometry automatically." },
      { id: "miter", type: "check", label: "Miter Corners", default: false, visible: (v) => isFlange(v) && mode(v) === "edge", tooltip: "Miters the corners where sheet metal corners would otherwise overlap." },
      { id: "override", type: "check", labelFn: (v) => (isContour(v) ? "Bend override" : "Override rules"), label: "Override rules", default: false, sep: true, visible: overrideRows, tooltip: "Changes rule values for this operation only." },
      { id: "bendRadius", type: "value", label: "Bend Radius", kind: "length", default: fmtLen(rule.R), nonNegative: true, visible: (v) => overrideRows(v) && v.override && !isHem(v), tooltip: "Distance from the inner surface of the sheet to the center of the bend." },
      { id: "reliefShape", type: "dropdown", label: "Relief Shape", default: rule.relief.shape, visible: (v) => edgeRows(v) && v.override, options: R.RELIEF_SHAPES.map((s) => ({ value: s, label: s })) },
      { id: "reliefWidth", type: "value", label: "Relief Width", kind: "length", default: fmtLen(rule.relief.width), positive: true, visible: (v) => edgeRows(v) && v.override && v.reliefShape !== "Tear" },
      { id: "reliefDepth", type: "value", label: "Relief Depth", kind: "length", default: fmtLen(rule.relief.depth), nonNegative: true, visible: (v) => edgeRows(v) && v.override && v.reliefShape !== "Tear" },
    ],
    init(dlg) {
      if (!f0) return;
      const v = dlg.values;
      if (f0.type === "smBaseFlange") {
        Object.assign(v, { type: "flange", sel: profileSelRefs(f0.profiles), orientation: f0.orientation || "side1", operation: f0.operation || "new", rule: f0.rule || sm.active });
      } else if (f0.type === "smContourFlange") {
        Object.assign(v, { type: "flange", sel: (f0.curves || []).map((c) => ({ kind: "sketchCurve", sketch: c.sketch, curve: c.curve })), cfDistance: f0.distance, cfDistance2: f0.distance2 || "10.00 mm", direction: f0.direction || "one", orientation: f0.orientation || "side1", operation: f0.operation || "new", rule: f0.rule || sm.active, override: !!f0.bendRadius });
        if (f0.bendRadius) v.bendRadius = f0.bendRadius;
      } else {
        const edges = (f0.edges || []).map((r) => asEdge(dlg, r)).filter(Boolean);
        Object.assign(v, { type: f0.type === "smHem" ? "hem" : "flange", sel: edges });
        for (const k of ["extent", "height", "toOffset", "angle", "width", "w1", "w2", "o1", "o2", "datum", "position", "hemType", "gap", "radius", "setback", "length", "reliefShape", "reliefWidth", "reliefDepth"]) if (f0[k] !== undefined && f0[k] !== null) v[k] = f0[k];
        if (f0.type === "smHem" && f0.angle !== undefined) v.hemAngle = f0.angle;
        v.flip = !!f0.flip; v.chain = f0.chain !== false; v.miter = !!f0.miter;
        v.override = !!(f0.bendRadius || f0.reliefOverride);
        if (f0.bendRadius) v.bendRadius = f0.bendRadius;
        if (f0.toObject) v.toObject = f0.toObject.map((r) => ({ kind: r.kind || "face", ...r }));
      }
    },
    onChange(id, dlg) {
      if (id === "type") {
        const v = dlg.values;
        if (v.type === "loft") { setTimeout(() => { dlg.cancel(); openLoft(app, {}); }, 0); return; }
        if (v.type === "hem") dlg.setSelection("sel", (v.sel || []).filter((r) => r.kind === "edge"));
      }
      if (id === "chain" && dlg.values.chain) {
        const cur = dlg.values.sel || [];
        const all = [];
        for (const r of cur) for (const x of r.kind === "edge" ? [].concat(chainEdges(dlg, r)) : [r]) if (!all.some((y) => y.kind === x.kind && y.body === x.body && y.index === x.index && y.curve === x.curve)) all.push(x);
        if (all.length !== cur.length) dlg.setSelection("sel", all);
      }
    },
    prompt(dlg) {
      const v = dlg.values;
      if (!(v.sel || []).length) return isHem(v) ? "Select sheet metal edges to create hem." : "Select sheet metal edges or sketch profiles to create flange.";
      if (isContour(v)) return "Select or deselect open sketch profiles";
      return "";
    },
    status: (dlg) => (mode(dlg.values) === "base" ? profileStatus(dlg, dlg.values.sel) : mode(dlg.values) === "contour" ? `${(dlg.values.sel || []).length} Sketch Curves` : edgeStatus(dlg.values.sel)),
    build(v, dlg) {
      const sel = v.sel || [];
      if (!sel.length) return null;
      if (isContour(v)) {
        const f = { type: "smContourFlange", curves: sel.filter((r) => r.kind === "sketchCurve").map((r) => ({ sketch: r.sketch, curve: r.curve })), distance: v.cfDistance, direction: v.direction, orientation: v.orientation, operation: v.operation, rule: v.rule || undefined, rv: 0 };
        if (v.direction === "two") f.distance2 = v.cfDistance2;
        if (v.override) f.bendRadius = v.bendRadius;
        return f;
      }
      if (isFlange(v) && mode(v) === "base") {
        return { type: "smBaseFlange", profiles: profileRefsOf(sel), orientation: v.orientation, operation: v.operation, rule: v.rule || undefined, rv: 0 };
      }
      const edges = sel.filter((r) => r.kind === "edge").map(plainRef);
      if (!edges.length) return null;
      const base = { edges, width: v.width, w1: v.w1, w2: v.w2, o1: v.o1, o2: v.o2, position: v.position, flip: !!v.flip, rv: 0 };
      if (v.override) Object.assign(base, { reliefOverride: true, reliefShape: v.reliefShape, reliefWidth: v.reliefWidth, reliefDepth: v.reliefDepth });
      if (isHem(v)) return { type: "smHem", ...base, hemType: v.hemType, gap: v.gap, radius: v.radius, angle: v.hemAngle, setback: v.setback, length: v.length };
      const f = { type: "smEdgeFlange", ...base, extent: v.extent, height: v.height, angle: v.angle, datum: v.datum, chain: !!v.chain, miter: !!v.miter };
      if (v.extent === "object") { f.toObject = (v.toObject || []).map((r) => (r.kind === "face" ? { kind: "face", body: r.body, p: r.p, n: r.n } : r)); f.toOffset = v.toOffset; }
      if (v.override) f.bendRadius = v.bendRadius;
      return f;
    },
    validate(dlg) {
      const v = dlg.values;
      if (isFlange(v) && mode(v) === "edge" && v.extent === "object" && !(v.toObject || []).length) return "Select the object to extend to";
      return null;
    },
    commit(f, dlg) {
      const hide = f.type === "smBaseFlange" ? [...new Set((f.profiles || []).map((p) => p.sketch))] : f.type === "smContourFlange" ? [...new Set(f.curves.map((c) => c.sketch))] : [];
      const label = (dlg.editId ? "Edit " : "Create ") + (f.type === "smHem" ? "Hem" : "Flange");
      return commitWith(app, dlg, f, { label, hideSketches: hide, ruleId: f.type === "smBaseFlange" || f.type === "smContourFlange" ? f.rule : null });
    },
    manipulators(dlg) {
      const v = dlg.values;
      if (!(isFlange(v) && mode(v) === "edge" && v.extent !== "object")) return [];
      const e = (v.sel || []).find((r) => r.kind === "edge");
      if (!e) return [];
      const d = smData(dlg, e.body);
      const b = dlg.baseState.bodies.get(e.body);
      if (!d || !b) return [];
      const te = K.topoOf(b.shape).edges[e.index];
      if (!te) return [];
      const info = G.edgeOnFlange(b.shape, d, te.s, te.t);
      if (!info) return [];
      const n = V.norm(applyDir(info.m, [0, 0, 1]));
      const sgn = (info.side === "top" ? 1 : -1) * (v.flip ? -1 : 1);
      const mid = V.lerp(te.s, te.t, 0.5);
      return [dlg.valueManip("height", { origin: mid, dir: V.mul(n, sgn), min: 0, fixedDir: true })].filter(Boolean);
    },
  });
}

// ================================================================ Lofted flange
export function openLoft(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const pre = opts.preselect || (editId ? [] : beginModelCommand(app));
  const rule = ruleNow(app);
  return app.ui.dialog.open({
    id: "FusionSheetMetalLoftCommand",
    title: "Flange",
    icon: "FusionSheetMetalLoftCommand",
    featureLabel: "Lofted Flange",
    editId,
    help: "Creates a sheet metal flange that transitions between two sketch profiles.",
    preselect: pre,
    labelWidth: 118, ctrlWidth: 190,
    rows: [
      { id: "type", type: "dropdown", label: "Type", options: TYPE_OPTS, default: "loft" },
      { id: "p1", type: "selection", label: "Profile 1", kinds: ["profile", "sketchCurve"], max: 1, prompt: "Select the first profile (a closed profile or a sketch curve)" },
      { id: "p2", type: "selection", label: "Profile 2", kinds: ["profile", "sketchCurve"], max: 1, prompt: "Select the second profile" },
      { id: "method", type: "dropdown", label: "Method", default: "press", options: [{ value: "press", label: "Brake Form" }, { value: "die", label: "Die Form" }], tooltip: "Brake Form makes flat facets joined by bend lines; Die Form a smooth sheet." },
      { id: "facets", type: "value", label: "Facets", kind: "none", default: "12", integer: true, min: 2, max: 200, visible: (v) => v.method === "press", tooltip: "Number of facets along each profile." },
      { id: "orientation", type: "buttons", label: "Orientation", default: "side1", options: [{ value: "side1", label: "Side 1", icon: "oneSide" }, { value: "side2", label: "Side 2", icon: "flip" }, { value: "center", label: "Center", icon: "symmetric" }] },
      { id: "operation", type: "dropdown", label: "Operation", sep: true, default: "new", options: [{ value: "new", label: "New Body", icon: "newBody" }, { value: "newComponent", label: "New Component", icon: "newComponent" }] },
      { id: "info", type: "text", text: () => `Thickness: ${fmtLen(rule.T)}` },
    ],
    init(dlg) {
      if (!f0) return;
      const asSel = (r) => (r.curve ? { kind: "sketchCurve", sketch: r.sketch, curve: r.curve } : { kind: "profile", sketch: r.sketch, key: r.key, c: r.c });
      Object.assign(dlg.values, { p1: f0.p1 ? [asSel(f0.p1)] : [], p2: f0.p2 ? [asSel(f0.p2)] : [], method: f0.method || "press", facets: String(f0.facets || "12"), orientation: f0.orientation || "side1", operation: f0.operation || "new" });
    },
    onChange(id, dlg) {
      if (id === "type" && dlg.values.type !== "loft") { const t = dlg.values.type; setTimeout(() => { dlg.cancel(); openFlange(app, { type: t }); }, 0); }
    },
    build(v) {
      const a = (v.p1 || [])[0], b = (v.p2 || [])[0];
      if (!a || !b) return null;
      const ref = (r) => (r.kind === "sketchCurve" ? { sketch: r.sketch, curve: r.curve } : { sketch: r.sketch, key: r.key, c: r.c });
      return { type: "smLoft", p1: ref(a), p2: ref(b), method: v.method, facets: v.facets, orientation: v.orientation, operation: v.operation, rv: 0 };
    },
    commit(f, dlg) { return commitWith(app, dlg, f, { label: dlg.editId ? "Edit Lofted Flange" : "Create Lofted Flange", hideSketches: [...new Set([f.p1.sketch, f.p2.sketch])] }); },
  });
}

// ================================================================ Unfold / Refold
export function openUnfold(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const refold = opts.refold || (f0 && f0.type === "smRefold");
  const pre = opts.preselect || (editId ? [] : beginModelCommand(app));
  const id = refold ? "FusionSheetmetalRefoldCommand" : "FusionSheetmetalUnfoldCommand";
  const wantFlat = !refold; // bends to pick: folded ones for Unfold, flat ones for Refold
  return app.ui.dialog.open({
    id, title: refold ? "Refold" : "Unfold", icon: id,
    featureLabel: refold ? "Refold" : "Unfold",
    editId,
    help: refold ? "Returns the model to its folded shape." : "Flattens bends so you can add features across them.",
    preselect: pre.filter((r) => r.kind === "face"),
    labelWidth: 118, ctrlWidth: 170,
    rows: [
      sheetFaceRow("stationary", "Reference", "Select a face that remains fixed during unfold."),
      { id: "all", type: "check", label: refold ? "Refold all bends" : "Unfold all bends", default: false, tooltip: refold ? "Refolds all unfolded bends." : "Flattens all bends in the model." },
      {
        id: "bends", type: "selection", label: "Bends", kinds: ["face"], min: 1, visible: (v) => !v.all,
        prompt: refold ? "Select the bends to refold." : "Select the bends to flatten.",
        tooltip: refold ? "Select the bends to refold." : "Select the bends to flatten.",
        filter: (r, dlg) => {
          const st = (dlg.values.stationary || [])[0];
          if (!isSheet(dlg, r) || (st && st.body !== r.body)) return false;
          const d = smData(dlg, r.body);
          const bid = bendAt(d, r.p);
          return !!bid && d.bends[bid].flat !== wantFlat;
        },
      },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, { stationary: (f0.stationary || []).map(asFace), all: !!f0.all, bends: (f0.bends || []).map(asFace) });
    },
    prompt(dlg) {
      if (!(dlg.values.stationary || []).length) return "Select a face that remains fixed during unfold.";
      return dlg.values.all ? "" : refold ? "Select the bends to refold." : "Select the bends to flatten.";
    },
    build(v) {
      const s = (v.stationary || [])[0];
      if (!s) return null;
      if (!v.all && !(v.bends || []).length) return null;
      return { type: refold ? "smRefold" : "smUnfold", stationary: [plainRef(s)], all: !!v.all, bends: v.all ? [] : (v.bends || []).map(plainRef) };
    },
  });
}

// ================================================================ Fold / Jog
export function openFold(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const jog = opts.jog || (f0 && f0.type === "smJog");
  const pre = opts.preselect || (editId ? [] : beginModelCommand(app));
  const rule = ruleNow(app);
  const id = jog ? "FusionSheetMetalJogCommand" : "SheetMetalFoldCmd";
  return app.ui.dialog.open({
    id, title: jog ? "Jog" : "Fold", icon: id,
    featureLabel: jog ? "Jog" : "Fold",
    editId,
    help: jog ? "Adds a jog (two opposing bends) to a flange." : "Bends the sheet metal model along the selected sketch lines with one face fixed.",
    preselect: pre,
    labelWidth: 118, ctrlWidth: 170,
    rows: [
      { id: "line", type: "selection", label: "Bend Line", kinds: ["sketchCurve"], max: 1, prompt: "Select a sketch line over a sheet metal face.", tooltip: "Defines the location of the bend.", filter: (r, dlg) => { const s = dlg.baseState.sketches.get(r.sketch); const c = s && s.sk.curves[r.curve]; return !!c && c.type === "line"; } },
      sheetFaceRow("stationary", "Reference", "Click on the stationary side of a face on a sheet metal body.", { tooltip: "Selects the planar face that remains fixed while bends are created." }),
      { id: "offset", type: "value", label: "Offset", kind: "length", default: "10.00 mm", positive: true, visible: () => !!jog, tooltip: "Distance between the two parallel flanges of the jog." },
      { id: "angle", type: "value", label: "Bend Angle", kind: "angle", default: "90.0 deg", min: 0, max: 180, tooltip: "Angle of the bend." },
      { id: "linePosition", type: "buttons", label: "Line Position", default: "center", options: [{ value: "start", label: "Start", icon: "posInside" }, { value: "center", label: "Center", icon: "posCenter" }, { value: "end", label: "End", icon: "posOutside" }], tooltip: "Creates the bend at the start, end or center of the bend line." },
      { id: "flip", type: "check", label: "Flip", default: false, tooltip: "Flips the direction of the bend up / down." },
      { id: "bendRadius", type: "value", label: "Bend Radius", kind: "length", default: fmtLen(rule.R), nonNegative: true, tooltip: "Specifies the inside radius of the bend." },
    ],
    init(dlg) {
      if (!f0) return;
      const v = dlg.values;
      v.line = (f0.line || []).map((r) => ({ kind: "sketchCurve", sketch: r.sketch, curve: r.curve }));
      v.stationary = (f0.stationary || []).map(asFace);
      for (const k of ["offset", "angle", "linePosition", "bendRadius"]) if (f0[k] !== undefined) v[k] = f0[k];
      v.flip = !!f0.flip;
    },
    build(v) {
      const l = (v.line || [])[0], s = (v.stationary || [])[0];
      if (!l || !s) return null;
      const f = { type: jog ? "smJog" : "smFold", line: [{ sketch: l.sketch, curve: l.curve }], stationary: [plainRef(s)], angle: v.angle, linePosition: v.linePosition, flip: !!v.flip, bendRadius: v.bendRadius };
      if (jog) f.offset = v.offset;
      return f;
    },
    commit(f, dlg) { return commitWith(app, dlg, f, { label: (dlg.editId ? "Edit " : "Create ") + (jog ? "Jog" : "Fold"), hideSketches: f.line.map((l) => l.sketch) }); },
  });
}

// ================================================================ Rip
export function openRip(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const pre = opts.preselect || (editId ? [] : beginModelCommand(app));
  const between = (v) => (v.refs || []).length >= 2 && (v.refs || []).every((r) => r.kind !== "face");
  return app.ui.dialog.open({
    id: "FusionSheetMetalRipCommand", title: "Rip", icon: "FusionSheetMetalRipCommand",
    featureLabel: "Rip", editId,
    help: "Cuts a gap along an edge or between two points of a flange.",
    preselect: pre,
    labelWidth: 118, ctrlWidth: 170,
    rows: [
      { id: "refs", type: "selection", label: "Face/Edge/Vertex", kinds: ["face", "edge", "vertex"], max: 2, prompt: "Select a face, an internal edge, or a start point on an external edge", tooltip: "Select a face, edge or vertex to create a rip.", filter: (r, dlg) => isSheet(dlg, r), advance: false },
      { id: "gap", type: "value", label: "Gap Width", kind: "length", default: "0.10 mm", positive: true, tooltip: "Specify the Gap Width value." },
      { id: "offset1", type: "value", label: "Offset 1", kind: "length", default: "0.00 mm", nonNegative: true, visible: between },
      { id: "offset2", type: "value", label: "Offset 2", kind: "length", default: "0.00 mm", nonNegative: true, visible: between },
    ],
    init(dlg) {
      if (!f0) return;
      dlg.values.refs = (f0.refs || []).map((r) => (r.kind === "edge" ? asEdge(dlg, r) : { ...r })).filter(Boolean);
      for (const k of ["gap", "offset1", "offset2"]) if (f0[k] !== undefined) dlg.values[k] = f0[k];
    },
    prompt(dlg) {
      const n = (dlg.values.refs || []).length;
      if (!n) return "Select a face, an internal edge, or a start point on an external edge";
      const r = dlg.values.refs[0];
      if (n === 1 && r.kind !== "face" && !isInternalEdge(dlg, r)) return "Select the end point on an opposing external edge of the same face";
      return "Adjust the Gap Width value or hold Ctrl to modify selection";
    },
    build(v, dlg) {
      const refs = v.refs || [];
      if (!refs.length) return null;
      if (refs.length === 1 && refs[0].kind !== "face" && !isInternalEdge(dlg, refs[0])) return null;
      return { type: "smRip", refs: refs.map((r) => ({ kind: r.kind, body: r.body, p: r.p, ...(r.n ? { n: r.n } : {}) })), gap: v.gap, offset1: v.offset1, offset2: v.offset2 };
    },
  });
}
/** Concave edge between two sheet faces (a closed corner), as opposed to an outer edge of a face. */
function isInternalEdge(dlg, r) {
  if (r.kind !== "edge") return false;
  const b = dlg.baseState.bodies.get(r.body);
  if (!b) return false;
  const e = K.topoOf(b.shape).edges[r.index];
  const ns = (e && e.fn || []).filter(Boolean);
  if (!e || e.type !== "LINE" || ns.length < 2) return false;
  const eps = 0.02;
  const p = V.add(e.m, V.sub(V.mul(ns[0], eps), V.mul(ns[1], eps)));
  try { const pr = K.pointProbe(p); try { return pr.dist(b.shape) < 1e-6; } finally { pr.delete(); } } catch { return false; }
}

// ================================================================ Corner Closure
export function openCorner(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const pre = opts.preselect || (editId ? [] : beginModelCommand(app));
  const rule = ruleNow(app);
  return app.ui.dialog.open({
    id: "FusionSheetMetalCornerCommand", title: "Corner Closure", icon: "FusionSheetMetalCornerCommand",
    featureLabel: "Corner Closure", editId,
    help: "Sets the gap and relief where two flanges meet.",
    preselect: pre,
    labelWidth: 118, ctrlWidth: 170,
    rows: [
      { id: "edges", type: "selection", label: "Edges", kinds: ["edge"], max: 2, prompt: "Select sheet metal edges to adjust the corner.", tooltip: "Select sheet metal edges to adjust the corner.", filter: (r, dlg) => isSheet(dlg, r), advance: false },
      { id: "alignment", type: "buttons", label: "Alignment", default: "symmetric", options: [{ value: "symmetric", label: "Symmetric Gap", icon: "symmetric" }, { value: "overlap", label: "Overlap Gap", icon: "oneSide" }], tooltip: "Symmetric Gap extends both flanges with a centered gap; Overlap Gap extends one flange over the other." },
      { id: "flipOverlap", type: "check", label: "Flip Overlap", default: false, visible: (v) => v.alignment === "overlap", tooltip: "Switches the overlapping flange without changing the overlap value." },
      { id: "overlap", type: "value", label: "Overlap", kind: "none", default: "1.00", min: 0, max: 1, visible: (v) => v.alignment === "overlap", tooltip: "Controls how much of the adjacent flange thickness is covered. Values range from 0.0 to 1.0." },
      { id: "gap", type: "value", label: "Gap", kind: "length", default: fmtLen(rule.miterGap), nonNegative: true, tooltip: "Gap between the flanges at the corner." },
      { id: "reliefOverride", type: "check", label: "2-Bend Corner Override", default: false, sep: true, tooltip: "Lets you override the relief shape, size, and placement at corners where 2 bends intersect." },
      { id: "relief", type: "dropdown", label: "Relief Shape", default: rule.corner2.shape, visible: (v) => v.reliefOverride, options: R.CORNER2_SHAPES.map((s) => ({ value: s, label: s })), tooltip: "Relief shape where the two bends meet." },
      { id: "reliefSize", type: "value", label: "Relief Size", kind: "length", default: fmtLen(rule.corner2.size), positive: true, visible: (v) => v.reliefOverride && ["Round", "Square", "Linear Weld", "Laser Weld"].includes(v.relief), tooltip: "Specifies the size of the bend-relief cutout measured in the flat pattern." },
      { id: "reliefPlacement", type: "dropdown", label: "Relief Placement", default: rule.corner2.placement, visible: (v) => v.reliefOverride && (v.relief === "Round" || v.relief === "Square"), options: R.CORNER2_PLACEMENTS.map((s) => ({ value: s, label: s })), tooltip: "Intersection, Tangent or Vertex." },
      { id: "ruleRelief", type: "text", visible: (v) => !v.reliefOverride, text: () => `Relief (rule): ${rule.corner2.shape}` },
    ],
    init(dlg) {
      if (!f0) return;
      dlg.values.edges = (f0.edges || []).map((r) => asEdge(dlg, r)).filter(Boolean);
      for (const k of ["alignment", "gap", "relief", "overlap", "reliefSize", "reliefPlacement"]) if (f0[k] !== undefined) dlg.values[k] = f0[k];
      dlg.values.flipOverlap = !!f0.flipOverlap;
      dlg.values.reliefOverride = !!f0.reliefOverride;
    },
    build(v) {
      if ((v.edges || []).length < 2) return null;
      const f = { type: "smCorner", edges: v.edges.map(plainRef), alignment: v.alignment, flipOverlap: !!v.flipOverlap, gap: v.gap, reliefOverride: !!v.reliefOverride };
      if (v.alignment === "overlap") f.overlap = v.overlap;
      if (v.reliefOverride) Object.assign(f, { relief: v.relief, reliefSize: v.reliefSize, reliefPlacement: v.reliefPlacement });
      return f;
    },
  });
}

// ================================================================ Sheet Metal Fillet / Chamfer
export function openSMEdge(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const chamfer = opts.chamfer || (f0 && f0.type === "smChamfer");
  const pre = opts.preselect || (editId ? [] : beginModelCommand(app));
  const id = chamfer ? "FusionSheetMetalChamferCommand" : "FusionSheetMetalFilletCommand";
  const key = chamfer ? "distance" : "radius";
  const thick = (dlg, r) => {
    const d = smData(dlg, r.body), b = dlg.baseState.bodies.get(r.body);
    const e = b && K.topoOf(b.shape).edges[r.index];
    return !!d && !!e && e.type === "LINE" && Math.abs(e.len - d.T) < 1e-3;
  };
  return app.ui.dialog.open({
    id, title: chamfer ? "Sheet Metal Chamfer" : "Sheet Metal Fillet", icon: id,
    featureLabel: chamfer ? "Sheet Metal Chamfer" : "Sheet Metal Fillet", editId,
    help: chamfer ? "Bevels the thickness edges of a flange." : "Rounds the thickness edges of a flange.",
    preselect: pre,
    labelWidth: 118, ctrlWidth: 170,
    rows: [
      { id: "edges", type: "selection", label: "Edges", kinds: ["edge"], prompt: chamfer ? "Select sheet metal thickness edges to chamfer." : "Select sheet metal thickness edges to fillet.", filter: (r, dlg) => thick(dlg, r) },
      { id: key, type: "value", label: chamfer ? "Distance" : "Radius", kind: "length", default: "2.00 mm", positive: true, tooltip: chamfer ? "How far the chamfer extends from the corner along the adjoining faces." : "Radius of the fillet applied to the sheet metal corner." },
    ],
    init(dlg) {
      if (!f0) return;
      dlg.values.edges = (f0.edges || []).map((r) => asEdge(dlg, r)).filter(Boolean);
      if (f0[key] !== undefined) dlg.values[key] = f0[key];
    },
    status: (dlg) => edgeStatus(dlg.values.edges),
    build(v) {
      if (!(v.edges || []).length) return null;
      return { type: chamfer ? "smChamfer" : "smFillet", edges: v.edges.map(plainRef), [key]: v[key] };
    },
  });
}

export { smData, isSheet, ruleNow, commitWith, plainRef, asFace, asEdge, sheetFaceRow };
