// Command dialogs of the plastic features: Rib, Web, Emboss, Boss, Lip, Rest, Snap Fit (dialog framework
// app.ui.dialog; Fusion's labels from the install's string tables). Defaults of rule-driven inputs come from
// the component's plastic rule (rules.js DERIVE); inputs the user does not change stay linked to the rule.
import * as K from "../../kernel.js";
import * as U from "../dialogs/util.js";
import { beginModelCommand, profileRefsOf, profileSelRefs, profileStatus } from "../dialogs/common.js";
import * as RU from "./rules.js";
import { SCHEMATICS } from "./schematics.js";

const V = K.V;

/** Rule link of a feature built from a dialog: fields still at their rule-derived value. */
function ruleMeta(dlg, type, rd, rule, f0) {
  const keep = new Set(f0 && Array.isArray(f0.ruleFields) ? f0.ruleFields : f0 ? [] : Object.keys(rd));
  const fields = Object.keys(rd).filter((k) => keep.has(k) && !dlg.touched.has(k) && String(dlg.values[k]) === String(rd[k]));
  return fields.length ? { ruleFields: fields, plasticRule: rule.id, ruleComp: "root" } : { ruleFields: [] };
}
/** Values of an edited feature (expression fields kept as strings). */
const pick = (f0, keys) => Object.fromEntries(keys.filter((k) => f0 && f0[k] !== undefined && f0[k] !== null).map((k) => [k, typeof f0[k] === "number" ? String(f0[k]) : f0[k]]));
const ruleFor = (app, f0) => (f0 && f0.plasticRule && RU.findRule(app.doc, f0.plasticRule)) || RU.effectiveRule(app.doc);
const schematic = (key) => ({ id: `${key}Pic`, type: "custom", label: "", render: () => { const d = document.createElement("div"); d.className = "pl-pic"; d.innerHTML = SCHEMATICS[key] || ""; return d; } });

// ------------------------------------------------------------------ Rib / Web
const THICK_DIR = [{ value: "sym", label: "Symmetric", icon: "symmetric" }, { value: "one", label: "One Side", icon: "oneSide" }];
const EXTENT_NEXT = [{ value: "next", label: "To Next", icon: "toObject" }, { value: "distance", label: "Distance", icon: "distance" }];

export function openThin(app, kind, opts = {}) {
  const rib = kind === "rib";
  const id = rib ? "FusionRibCommand" : "FusionWebCommand";
  const title = rib ? "Rib" : "Web";
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const rule = ruleFor(app, f0);
  const rd = RU.ruleDefaults(kind, rule);
  const curveOk = (r, dlg) => {
    const s = dlg.baseState.sketches.get(r.sketch);
    const cv = s && s.sk.curves[r.curve];
    if (!cv || cv.cons || !["line", "arc"].includes(cv.type)) return false;
    const first = (dlg.values.curves || [])[0];
    return !first || first.sketch === r.sketch;
  };
  const anchor = (dlg) => {
    const c = (dlg.values.curves || [])[0];
    const s = c && dlg.baseState.sketches.get(c.sketch);
    const cv = s && s.sk.curves[c.curve];
    if (!cv) return null;
    const P = s.sk.points;
    const q = cv.type === "line" ? [(P[cv.p1].x + P[cv.p2].x) / 2, (P[cv.p1].y + P[cv.p2].y) / 2] : [P[cv.p1].x, P[cv.p1].y];
    const t = cv.type === "line" ? V.norm(V.sub(K.toWorld(s.plane, P[cv.p2].x, P[cv.p2].y), K.toWorld(s.plane, P[cv.p1].x, P[cv.p1].y))) : null;
    return { o: K.toWorld(s.plane, q[0], q[1]), n: V.norm(s.plane.n), t };
  };
  return app.ui.dialog.open({
    id, title, icon: id, featureLabel: title, editId,
    help: rib ? "Creates a thin feature from an open sketch profile, extruded to the nearest faces on a solid body. Select an open sketch profile, then specify the thickness."
      : "Creates a thin feature from an open sketch profile, extruded to the nearest faces on a solid body. Select an open sketch profile, then specify the thickness.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "sketchCurve"),
    ctrlWidth: 130,
    rows: [
      { id: "curves", type: "selection", label: "Profile", kinds: ["sketchCurve"], filter: curveOk, prompt: rib ? "Select an open sketch profile to create ribs." : "Select an open sketch profile to create webs.", tooltip: rib ? "Select an open sketch profile to create ribs." : "Select an open sketch profile to create webs." },
      { id: "thicknessType", type: "buttons", label: "Thickness Direction", options: THICK_DIR, default: "sym", tooltip: "Symmetric: half the thickness to each side of the sketch profile. One Side: the full thickness to one side." },
      { id: "extent", type: "dropdown", label: "Extent Type", options: EXTENT_NEXT, default: "next", tooltip: `To Next: extrudes the ${kind} to the nearest faces on a solid body. Distance: to a specified depth.` },
      { id: "thickness", type: "value", label: "Thickness", kind: "length", default: rd.thickness || "1.00 mm", tooltip: rib ? "Specify the distance to extrude the rib, in a direction perpendicular to the sketch plane." : "Specify the distance to extrude the web, in a direction parallel to the sketch plane." },
      { id: "depth", type: "value", label: "Depth", kind: "length", positive: true, default: "10.00 mm", visible: (v) => v.extent === "distance", tooltip: rib ? "Specify the distance to extrude the rib, in a direction parallel to the sketch plane, toward the nearest faces." : "Specify the distance to extrude the web, in a direction perpendicular to the sketch plane, toward the nearest faces." },
      { id: "flip", type: "check", label: "Flip Direction", tooltip: `Flips the direction to extrude ${kind} feature.` },
      { id: "draft", type: "value", label: "Draft Angle", kind: "angle", default: rd.draft || "0.0 deg", sep: true, tooltip: `Specify draft angle value for ${kind}.` },
      { id: "draftFrom", type: "dropdown", label: "Start", options: [{ value: "top", label: "From Top" }, { value: "bottom", label: "From Bottom" }], default: "top", visible: (v, dlg) => Math.abs(dlg.num("draft") || 0) > 1e-9, tooltip: "From Top: measures thickness starting from the top. From Bottom: from the bottom." },
      { id: "fillet", type: "value", label: "Fillet Radius", kind: "length", nonNegative: true, default: rd.fillet || "0.00 mm", tooltip: `Specify fillet radius value for ${kind}.` },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, pick(f0, ["thicknessType", "extent", "thickness", "depth", "draft", "draftFrom", "fillet"]), { flip: !!f0.flip });
      dlg.values.curves = ((f0.curves && f0.curves.curves) || []).map((c) => ({ kind: "sketchCurve", sketch: f0.curves.sketch, curve: c }));
    },
    prompt: (dlg) => ((dlg.values.curves || []).length ? "" : rib ? "Select an open sketch profile to create ribs." : "Select an open sketch profile to create webs."),
    status: (dlg) => { const n = (dlg.values.curves || []).length; return n ? `${n} Profile${n > 1 ? "s" : ""}` : ""; },
    validate: (dlg) => (Math.abs(dlg.num("thickness") || 0) < 1e-9 ? "Thickness is zero" : null),
    build(v, dlg) {
      const cs = v.curves || [];
      if (!cs.length || Math.abs(dlg.num("thickness") || 0) < 1e-9) return null;
      return {
        type: kind, curves: { sketch: cs[0].sketch, curves: cs.map((r) => r.curve) }, thicknessType: v.thicknessType, extent: v.extent,
        thickness: v.thickness, depth: v.depth, flip: !!v.flip, draft: v.draft, draftFrom: v.draftFrom, fillet: v.fillet,
        ...ruleMeta(dlg, kind, rd, rule, f0),
      };
    },
    manipulators(dlg) {
      const a = anchor(dlg);
      if (!a) return [];
      const dir = rib ? a.n : a.t ? V.norm(V.cross(a.n, a.t)) : null;
      if (!dir) return [];
      const m = dlg.valueManip("thickness", { origin: a.o, dir, scale: dlg.values.thicknessType === "sym" ? 0.5 : 1 });
      return m ? [m] : [];
    },
    commit(f, dlg) { return dlg.commitFeature(f, { hideSketches: editId ? [] : [f.curves.sketch] }); },
  });
}

// ------------------------------------------------------------------ Emboss
export function openEmboss(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const faceAnchor = (dlg) => { const fr = (dlg.values.faces || [])[0]; return fr && Array.isArray(fr.p) && Array.isArray(fr.n) ? { o: fr.p, n: V.norm(fr.n) } : null; };
  return app.ui.dialog.open({
    id: "EmbossCmd", title: "Emboss", icon: "EmbossCmd", featureLabel: "Emboss", editId,
    help: "Raises or recesses a sketch profile relative to faces on a solid body by a specified depth and direction. Select sketch profiles, select faces on a solid body to emboss, then adjust depth, effect, and alignment.",
    preselect: opts.preselect, ctrlWidth: 130,
    rows: [
      { id: "profiles", type: "selection", label: "Sketch Profiles", kinds: ["profile"], prompt: "Select sketch profiles", tooltip: "Select closed sketch profiles or sketch text to emboss." },
      { id: "faces", type: "selection", label: "Faces", kinds: ["face"], prompt: "Select faces to emboss", tooltip: "Select faces on a solid body to emboss" },
      { id: "depth", type: "value", label: "Depth", kind: "length", positive: true, default: "1.00 mm", tooltip: "Specify the depth of the emboss or deboss." },
      { id: "effect", type: "buttons", label: "Effect", options: [{ value: "emboss", label: "Emboss" }, { value: "deboss", label: "Deboss" }], default: "emboss", tooltip: "Emboss raises the profile out of the faces; Deboss sinks it into them." },
      { id: "alignment", type: "group", label: "Alignment", sep: true, rows: [
        { id: "hdist", type: "value", label: "Horizontal Distance", kind: "length", default: "0.00 mm", tooltip: "Moves the profile along the sketch X direction (along the surface for wrapped profiles)." },
        { id: "vdist", type: "value", label: "Vertical Distance", kind: "length", default: "0.00 mm", tooltip: "Moves the profile along the sketch Y direction." },
        { id: "angle", type: "value", label: "Rotation Angle", kind: "angle", default: "0.0 deg", tooltip: "Rotates the profile about its centre." },
      ] },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, pick(f0, ["depth", "effect", "hdist", "vdist", "angle"]));
      dlg.values.profiles = profileSelRefs(f0.profiles);
      dlg.values.faces = (f0.faces || []).map((fr) => U.faceRef(dlg.baseState, fr.body, fr.p, fr.n));
    },
    prompt: (dlg) => (!(dlg.values.profiles || []).length ? "Select sketch profiles" : !(dlg.values.faces || []).length ? "Select faces to emboss" : ""),
    status: (dlg) => profileStatus(dlg, dlg.values.profiles),
    build(v) {
      const profiles = profileRefsOf(v.profiles);
      const faces = (v.faces || []).filter((r) => r.kind === "face").map((r) => ({ body: r.body, p: r.p, n: r.n }));
      if (!profiles.length || !faces.length) return null;
      return { type: "emboss", profiles, faces, depth: v.depth, effect: v.effect, hdist: v.hdist, vdist: v.vdist, angle: v.angle };
    },
    manipulators(dlg) {
      const a = faceAnchor(dlg);
      if (!a) return [];
      const m = dlg.valueManip("depth", { origin: a.o, dir: dlg.values.effect === "deboss" ? V.mul(a.n, -1) : a.n, min: 0 });
      return m ? [m] : [];
    },
    commit(f, dlg) { return dlg.commitFeature(f, { hideSketches: editId ? [] : [...new Set(f.profiles.map((p) => p.sketch))] }); },
  });
}

// ------------------------------------------------------------------ Boss
const HOLE_TYPES = [{ value: "simple", label: "Simple", icon: "holeSimple" }, { value: "counterbore", label: "Counterbore", icon: "holeCounterbore" }, { value: "countersink", label: "Countersink", icon: "holeCountersink" }];
const STEP_TYPES = [{ value: "none", label: "None" }, { value: "in", label: "In" }, { value: "out", label: "Out" }];
const BOSS_TYPES = [{ value: "flat", label: "Tapped Hole With Flat End", icon: "drillFlat" }, { value: "tip", label: "Tapped Hole With Tool Tip", icon: "drillAngle" }, { value: "pinned", label: "Pinned", icon: "holeSimple" }];
const BOSS_VALUES = ["bossType", "s1Type", "s1Step", "s2Step", ...["D", "B", "E", "A", "Cs", "C", "F", "Draft", "R", "O"].map((k) => `s1${k}`), ...["D", "B", "G", "C", "F", "Draft", "R", "O"].map((k) => `s2${k}`)];

export function openBoss(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const rule = ruleFor(app, f0);
  const rd = RU.ruleDefaults("boss", rule);
  const L = (n, txt) => ({ type: "value", kind: "length", label: n, tooltip: txt });
  const side = (s) => {
    const k = `s${s}`;
    const step = (v) => v[`${k}Step`] !== "none";
    const rows = [];
    if (s === 1) rows.push({ id: "s1Type", type: "dropdown", label: "Hole Type", options: HOLE_TYPES, default: "simple", visible: (v) => v.bossType !== "pinned", tooltip: "Hole type of Side 1: Simple, Counterbore or Countersink." });
    rows.push({ id: `${k}Step`, type: "dropdown", label: "Step Type", options: STEP_TYPES, default: "none", tooltip: `Adds a step to Side ${s}: In recesses the top of the boss, Out raises a ring on it.` });
    rows.push({ id: `${k}D`, ...L(`D${s === 1 ? "₁" : "₂"}`, `Boss Diameter: specify the overall diameter value for Side ${s} of the boss feature.`), positive: true, default: rd[`${k}D`] || (s === 1 ? "6.40 mm" : "5.50 mm") });
    rows.push({ id: `${k}B`, ...L(`B${s === 1 ? "₁" : "₂"}`, `Hole Diameter: specify the diameter value of the inner hole for Side ${s} of the boss feature.`), positive: true, default: s === 1 ? "3.40 mm" : "2.50 mm" });
    if (s === 1) {
      rows.push({ id: "s1E", ...L("E₁", "Hole Depth: specify the depth value of the inner hole for Side 1 of the boss feature."), positive: true, default: "3.00 mm", visible: (v) => v.bossType === "pinned" || v.s1Type === "counterbore" });
      rows.push({ id: "s1A", ...L("A₁", "Counterbore Diameter: specify the diameter value of the counterbore hole for Side 1 of the boss feature."), positive: true, default: "6.00 mm", visible: (v) => v.bossType !== "pinned" && v.s1Type !== "simple" });
      rows.push({ id: "s1Cs", type: "value", kind: "angle", label: "Countersink Angle", positive: true, default: "90.0 deg", visible: (v) => v.bossType !== "pinned" && v.s1Type === "countersink" });
    } else rows.push({ id: "s2G", ...L("G₂", "Hole Depth: specify the depth value of the inner hole for Side 2 of the boss feature (the pin length for Pinned)."), positive: true, default: "8.00 mm" });
    rows.push({ id: `${k}C`, ...L(`C${s === 1 ? "₁" : "₂"}`, `Step Diameter: specify the diameter value of the step for Side ${s} of the boss feature.`), positive: true, default: "5.00 mm", visible: step });
    rows.push({ id: `${k}F`, ...L(`F${s === 1 ? "₁" : "₂"}`, `Step Depth: specify the depth value of the step for Side ${s} of the boss feature.`), positive: true, default: "1.00 mm", visible: step });
    rows.push({ id: `${k}Draft`, type: "value", kind: "angle", label: "α₄", default: rd[`${k}Draft`] || "1.0 deg", tooltip: `Boss Draft Angle: specify the draft angle value of the outer boss for Side ${s} of the boss feature.` });
    rows.push({ id: `${k}R`, ...L("R", `Base Fillet Radius: specify the radius value of the base fillet for Side ${s} of the boss feature.`), nonNegative: true, default: rd[`${k}R`] || "0.50 mm" });
    rows.push({ id: `${k}O`, ...L("O", `Offset Clearance: specify the clearance value between the sketch plane and the boss for Side ${s}.`), nonNegative: true, default: rd[`${k}O`] || "0.00 mm" });
    return { id: `side${s}`, type: "group", label: `Side ${s}`, rows };
  };
  return app.ui.dialog.open({
    id: "FusionBossCommand", title: "Boss", icon: "FusionBossCommand", featureLabel: "Boss", editId,
    help: "Creates a boss feature to fasten two solid bodies together and reinforce thin areas of a design. Select a sketch point between two solid bodies, then adjust the settings for each side of the boss feature.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "sketchPoint"), ctrlWidth: 150,
    rows: [
      { id: "points", type: "selection", label: "Sketch Points", kinds: ["sketchPoint"], prompt: "Select sketch point to place a boss", tooltip: "Select sketch points between two solid bodies." },
      { id: "bossType", type: "dropdown", label: "Type", options: BOSS_TYPES, default: "flat", tooltip: "Tapped hole with a flat end or a drill tip in Side 2, or a pin on Side 2 that fits a hole in Side 1." },
      { id: "flip", type: "check", label: "Flip", tooltip: "Swaps Side 1 and Side 2." },
      schematic("boss"),
      side(1), side(2),
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, pick(f0, BOSS_VALUES), { flip: !!f0.flip });
      dlg.values.points = (f0.points || []).map((p) => ({ kind: "sketchPoint", sketch: p.sketch, point: p.point }));
    },
    prompt: (dlg) => ((dlg.values.points || []).length ? "Select additional sketch points or adjust boss settings" : "Select sketch point to place a boss"),
    status: (dlg) => { const n = (dlg.values.points || []).length; return n ? `${n} Sketch Point${n > 1 ? "s" : ""}` : ""; },
    build(v, dlg) {
      const pts = (v.points || []).filter((r) => r.kind === "sketchPoint").map((r) => ({ sketch: r.sketch, point: r.point }));
      if (!pts.length) return null;
      const f = { type: "boss", points: pts, flip: !!v.flip };
      for (const k of BOSS_VALUES) f[k] = v[k];
      return Object.assign(f, ruleMeta(dlg, "boss", rd, rule, f0));
    },
    commit(f, dlg) { return dlg.commitFeature(f, { hideSketches: editId ? [] : [...new Set(f.points.map((p) => p.sketch))] }); },
  });
}

// ------------------------------------------------------------------ Lip
const LIP_TYPES = [{ value: "lip", label: "Lip" }, { value: "groove", label: "Groove" }, { value: "both", label: "Lip And Groove" }];

/** Edges tangent-connected to edge `index` of the body (indices). */
function tangentEdges(shape, index) {
  const T = K.topoOf(shape);
  const seen = new Set([index]);
  const q = [index];
  const ends = (g) => [{ p: g.s, t: g.ts }, { p: g.t, t: g.tt }];
  while (q.length) {
    const g = T.edges[q.pop()];
    if (!g) continue;
    T.edges.forEach((o, j) => {
      if (seen.has(j)) return;
      for (const a of ends(g)) for (const b of ends(o)) {
        if (a.p && b.p && a.t && b.t && V.len(V.sub(a.p, b.p)) < 1e-5 && Math.abs(V.dot(a.t, b.t)) > 0.9995) { seen.add(j); q.push(j); return; }
      }
    });
  }
  return [...seen];
}

export function openLip(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const rule = ruleFor(app, f0);
  const rd = RU.ruleDefaults("lip", rule);
  const L = (n, txt, dflt, extra = {}) => ({ type: "value", kind: "length", label: n, tooltip: txt, default: dflt, ...extra });
  const chainMap = (r, dlg) => {
    if (r.kind !== "edge" || dlg.values.chain === false) return r;
    const b = dlg.baseState.bodies.get(r.body);
    if (!b || !(r.index >= 0)) return r;
    let idx;
    try { idx = tangentEdges(b.shape, r.index); } catch { return r; }
    const es = K.edgesAt(b.shape, idx);
    try { return idx.map((i, k) => ({ kind: "edge", body: r.body, index: i, p: i === r.index ? r.p : K.edgeMid(es[k]) })); } finally { K.del(...es); }
  };
  return app.ui.dialog.open({
    id: "FusionLipCommand", title: "Lip", icon: "FusionLipCommand", featureLabel: "Lip", editId,
    help: "Creates a lip, groove, or combined feature on one or two solid bodies. Select an edge on a solid body then choose between the Lip, Groove, or Lip And Groove types.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "edge"), ctrlWidth: 130,
    rows: [
      { id: "lipType", type: "dropdown", label: "Type", options: LIP_TYPES, default: "lip", tooltip: "Lip: a raised lip. Groove: a recessed groove. Lip And Groove: a lip on the selected body and a matching groove in the body that rests on it." },
      { id: "edges", type: "selection", label: "Path", kinds: ["edge"], mapRef: chainMap, prompt: "Select an edge to place lip", tooltip: "Select an edge to place a lip feature on a solid body.",
        filter: (r, dlg) => { const first = (dlg.values.edges || [])[0]; return !first || first.body === r.body; } },
      { id: "chain", type: "check", label: "Tangent Chain", default: true, tooltip: "Automatically select tangent edges." },
      { id: "guide", type: "selection", label: "Guide Surface", kinds: ["face"], planar: true, min: 0, max: 1, advance: false, prompt: "Select a face on either side of the selected edge to locate the lip feature", tooltip: "Select a face on either side of the selected edge to locate the lip feature. Default: the planar face that holds the path." },
      schematic("lip"),
      L("A", "Height: specify the Height of the Lip.", rd.height || "1.50 mm", { positive: true, sep: true, id: "height" }),
      L("B", "Width: specify the Width of the Lip.", rd.width || "0.75 mm", { positive: true, id: "width" }),
      L("E", "Clearance: specify the Clearance for the feature.", rd.clearance || "0.10 mm", { nonNegative: true, id: "clearance", visible: (v) => v.lipType === "both" }),
      { id: "draft1", type: "value", kind: "angle", label: "α₁", default: rd.draft1 || "0.0 deg", visible: (v) => v.lipType !== "groove", tooltip: "Side 1 Draft: specify the draft angle for the face farther from the selected edge." },
      { id: "draft2", type: "value", kind: "angle", label: "α₂", default: rd.draft2 || "0.0 deg", visible: (v) => v.lipType !== "groove", tooltip: "Side 2 Draft: specify the draft angle for the face closer to the selected edge." },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, pick(f0, ["lipType", "height", "width", "clearance", "draft1", "draft2"]), { chain: f0.chain !== false });
      dlg.values.edges = (f0.edges || []).map((er) => U.edgeRef(dlg.baseState, er.body, er.p));
      dlg.values.guide = f0.guide ? [U.faceRef(dlg.baseState, f0.guide.body, f0.guide.p, f0.guide.n)] : [];
    },
    prompt: (dlg) => ((dlg.values.edges || []).length ? "Modify edge selection or adjust lip settings" : "Select an edge to place lip"),
    status: (dlg) => { const n = (dlg.values.edges || []).length; return n === 0 ? "" : n === 1 ? "Edge" : `${n} Edges`; },
    build(v, dlg) {
      const edges = (v.edges || []).filter((r) => r.kind === "edge").map((r) => ({ body: r.body, p: r.p }));
      if (!edges.length) return null;
      const g = (v.guide || [])[0];
      const f = { type: "lip", lipType: v.lipType, edges, chain: v.chain !== false, height: v.height, width: v.width, clearance: v.clearance, draft1: v.draft1, draft2: v.draft2 };
      if (g) f.guide = { body: g.body, p: g.p, n: g.n };
      return Object.assign(f, ruleMeta(dlg, "lip", rd, rule, f0));
    },
  });
}

// ------------------------------------------------------------------ Rest
const REST_DIRS = [{ value: "side1", label: "Side 1" }, { value: "side2", label: "Side 2" }, { value: "sym", label: "Symmetric", icon: "symmetric" }];
export function openRest(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const rule = ruleFor(app, f0);
  const rd = RU.ruleDefaults("rest", rule);
  const pre = opts.preselect || [];
  return app.ui.dialog.open({
    id: "FusionRestCommand", title: "Rest", icon: "FusionRestCommand", featureLabel: "Rest", editId,
    help: "Creates a rest feature that intersects the overall shape and forms a flat area that can be used for the placement of another part. Select a closed sketch profile and a solid body, then specify the thickness.",
    preselect: pre.filter((r) => r.kind === "profile").concat(pre.filter((r) => r.kind === "body").slice(0, 1)), ctrlWidth: 130,
    rows: [
      { id: "profiles", type: "selection", label: "Profile", kinds: ["profile"], prompt: "Select a closed sketch profile to place a rest feature", tooltip: "Profiles" },
      { id: "body", type: "selection", label: "Body", kinds: ["body", "face"], max: 1, mapRef: (r) => (r && r.body ? { kind: "body", body: r.body } : null), prompt: "Select a solid body for the rest feature", tooltip: "Body" },
      { id: "thickness", type: "value", label: "Thickness", kind: "length", positive: true, default: rd.thickness || "1.50 mm", sep: true, tooltip: "Thickness of the landing." },
      { id: "direction", type: "dropdown", label: "Thickness Direction", options: REST_DIRS, default: "side1", tooltip: "Side 1: the thickness goes into the body from the landing. Side 2: away from it. Symmetric: half each way." },
      { id: "flip", type: "check", label: "Flip", tooltip: "Flips the side of the landing that is kept." },
      { id: "offset", type: "value", label: "Offset Position", kind: "length", default: "0.00 mm", tooltip: "Moves the landing along the sketch normal." },
      { id: "extent", type: "dropdown", label: "Extent Type", options: [{ value: "all", label: "All", icon: "all" }, { value: "object", label: "To Object", icon: "toObject" }], default: "all", sep: true, tooltip: "All: removes the material above the landing through the body. To Object: up to the selected object." },
      { id: "object", type: "selection", label: "Object", kinds: ["face", "cplane", "originPlane"], planar: true, max: 1, advance: false, visible: (v) => v.extent === "object", prompt: "Select body, face, or plane to extend to", tooltip: "Select a body, a face, or a plane to extrude to." },
      { id: "draft", type: "value", label: "Draft Angle", kind: "angle", default: rd.draft || "0.0 deg", tooltip: "Draft angle of the walls above the landing." },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, pick(f0, ["thickness", "direction", "offset", "extent", "draft"]), { flip: !!f0.flip });
      dlg.values.profiles = profileSelRefs(f0.profiles);
      dlg.values.body = f0.body ? [{ kind: "body", body: f0.body }] : [];
      const o = f0.object;
      dlg.values.object = !o ? [] : o.kind === "cplane" ? [{ kind: "cplane", id: o.id }] : o.kind === "origin" ? [{ kind: "originPlane", name: o.name }] : [U.faceRef(dlg.baseState, o.body, o.p, o.n)];
    },
    onOpen(dlg) {
      // one visible body: take it (Fusion asks for the body after the profile)
      if (!(dlg.values.body || []).length) {
        const vb = U.visibleBodies(app, dlg.baseState);
        if (vb.length === 1) dlg.setSelection("body", [{ kind: "body", body: vb[0].id }]);
      }
    },
    prompt: (dlg) => (!(dlg.values.profiles || []).length ? "Select a closed sketch profile to place a rest feature" : !(dlg.values.body || []).length ? "Select a solid body for the rest feature" : "Adjust the rest settings"),
    status: (dlg) => profileStatus(dlg, dlg.values.profiles),
    build(v, dlg) {
      const profiles = profileRefsOf(v.profiles);
      const b = (v.body || [])[0];
      if (!profiles.length || !b) return null;
      const f = { type: "rest", profiles, body: b.body, thickness: v.thickness, direction: v.direction, flip: !!v.flip, offset: v.offset, extent: v.extent, draft: v.draft };
      const o = (v.object || [])[0];
      if (v.extent === "object") {
        if (!o) return null;
        f.object = o.kind === "cplane" ? { kind: "cplane", id: o.id } : o.kind === "originPlane" ? { kind: "origin", name: o.name } : { body: o.body, p: o.p, n: o.n };
      }
      return Object.assign(f, ruleMeta(dlg, "rest", rd, rule, f0));
    },
    commit(f, dlg) { return dlg.commitFeature(f, { hideSketches: editId ? [] : [...new Set(f.profiles.map((p) => p.sketch))] }); },
  });
}

// ------------------------------------------------------------------ Snap Fit
const SNAP_TYPES = [{ value: "parallel", label: "Parallel Hook And Groove" }, { value: "perpendicular", label: "Perpendicular Hook And Groove" }, { value: "loop", label: "Hook And Loop" }];
const SNAP_VALUES = ["snapType", "rotation", "hA", "hB", "hC", "hD", "hE", "hF", "hH", "hAlpha1", "hAlpha2", "gJ", "gL", "gM"];
export function openSnapFit(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const rule = ruleFor(app, f0);
  const rd = RU.ruleDefaults("snapFit", rule);
  const L = (id, n, txt, dflt, extra = {}) => ({ id, type: "value", kind: "length", label: n, tooltip: txt, default: dflt, positive: true, ...extra });
  const A = (id, n, txt, dflt) => ({ id, type: "value", kind: "angle", label: n, tooltip: txt, default: dflt, positive: true, max: 90 });
  return app.ui.dialog.open({
    id: "FusionSnapFitCommand", title: "Snap Fit", icon: "FusionSnapFitCommand", featureLabel: "Snap Fit", editId,
    help: "Creates a cantilever snap fit feature to fasten two solid bodies together in a design. Select a snap fit type, select a sketch point between two solid bodies, then adjust the settings.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "sketchPoint"), ctrlWidth: 150,
    rows: [
      { id: "snapType", type: "dropdown", label: "Type", options: SNAP_TYPES, default: "parallel", tooltip: "Hook and groove parallel or perpendicular to a face, or a hook and loop, on a pair of solid bodies." },
      { id: "points", type: "selection", label: "Sketch Points", kinds: ["sketchPoint"], prompt: "Select sketch point to place a snap fit", tooltip: "Select a sketch point to position the snap fit feature on a body." },
      { id: "flip", type: "check", label: "Flip", tooltip: "Swaps the hook and the groove (or loop) bodies." },
      { id: "rotation", type: "value", label: "Rotation Angle", kind: "angle", default: "0.0 deg", tooltip: "Rotates all snap fits to the same angle around their sketch points." },
      schematic("snap"),
      { id: "hook", type: "group", label: "Hook", rows: [
        L("hA", "A", "Base Depth: thickness of the beam at the wall.", rd.hA || "1.50 mm"),
        L("hB", "B", "Beam Length", "10.00 mm"),
        L("hC", "C", "Transition Depth: thickness of the beam at the hook.", rd.hC || "0.90 mm"),
        L("hD", "D", "Base Width: width of the beam at the wall.", "6.00 mm"),
        L("hE", "E", "Transition Width: width of the beam at the hook.", "5.00 mm"),
        L("hF", "F", "Hook Depth: how far the hook stands out of the beam.", "1.00 mm"),
        L("hH", "H", "Hook Length", "2.00 mm"),
        A("hAlpha1", "α₁", "Exit Angle", "90.0 deg"),
        A("hAlpha2", "α₂", "Entry Angle", "30.0 deg"),
      ] },
      { id: "groove", type: "group", label: "Groove", visible: (v) => v.snapType !== "loop", rows: [
        L("gJ", "J", "Groove Depth: how far the groove goes past the hook.", "0.50 mm"),
        L("gL", "L", "Groove Width: clearance on each side of the hook.", rd.gL || "0.20 mm"),
        L("gM", "M", "Length Clearance", "0.50 mm"),
      ] },
      { id: "loop", type: "group", label: "Loop", visible: (v) => v.snapType === "loop", rows: [
        L("lJ", "J", "Hook Clearance: gap between the hook and the loop bar.", "0.50 mm"),
        L("lL", "L", "Side clearance between the hook and the loop posts.", rd.gL || "0.20 mm"),
      ] },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, pick(f0, SNAP_VALUES), { flip: !!f0.flip });
      if (f0.snapType === "loop") Object.assign(dlg.values, { lJ: String(f0.gJ), lL: String(f0.gL) });
      dlg.values.points = (f0.points || []).map((p) => ({ kind: "sketchPoint", sketch: p.sketch, point: p.point }));
    },
    prompt: (dlg) => ((dlg.values.points || []).length ? "Select additional sketch points or adjust snap fit settings" : "Select sketch point to place a snap fit"),
    status: (dlg) => { const n = (dlg.values.points || []).length; return n ? `${n} Sketch Point${n > 1 ? "s" : ""}` : ""; },
    build(v, dlg) {
      const pts = (v.points || []).filter((r) => r.kind === "sketchPoint").map((r) => ({ sketch: r.sketch, point: r.point }));
      if (!pts.length) return null;
      const f = { type: "snapFit", points: pts, flip: !!v.flip };
      for (const k of SNAP_VALUES) f[k] = v[k];
      if (v.snapType === "loop") { f.gJ = v.lJ; f.gL = v.lL; }
      const meta = ruleMeta(dlg, "snapFit", rd, rule, f0);
      if (v.snapType === "loop" && meta.ruleFields) meta.ruleFields = meta.ruleFields.filter((k) => k !== "gL" || !dlg.touched.has("lL"));
      return Object.assign(f, meta);
    },
    commit(f, dlg) { return dlg.commitFeature(f, { hideSketches: editId ? [] : [...new Set(f.points.map((p) => p.sketch))] }); },
  });
}

/** Start a plastic command: leave the sketch, keep the preselection. */
export const begin = (app) => beginModelCommand(app);
