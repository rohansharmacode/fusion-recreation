// Command dialogs of the plastic features: Rib, Web, Emboss, Boss, Lip, Rest, Snap Fit (dialog framework
// app.ui.dialog; Fusion's labels from the install's string tables). Defaults of rule-driven inputs come from
// the component's plastic rule (rules.js DERIVE); inputs the user does not change stay linked to the rule.
import * as K from "../../kernel.js";
import * as U from "../dialogs/util.js";
import { beginModelCommand, profileRefsOf, profileSelRefs, profileStatus } from "../dialogs/common.js";
import * as RU from "./rules.js";
import { SCHEMATICS } from "./schematics.js";
import { activeComponent } from "./rules-ui.js";

const V = K.V;

/** Rule link of a feature built from a dialog: fields still at their rule-derived value. */
function ruleMeta(dlg, type, rd, rule, f0) {
  const keep = new Set(f0 && Array.isArray(f0.ruleFields) ? f0.ruleFields : f0 ? [] : Object.keys(rd));
  const fields = Object.keys(rd).filter((k) => keep.has(k) && !dlg.touched.has(k) && String(dlg.values[k]) === String(rd[k]));
  return fields.length ? { ruleFields: fields, plasticRule: rule.id, ruleComp: (f0 && f0.ruleComp) || activeComponent(dlg.app) } : { ruleFields: [] };
}
/** Values of an edited feature (expression fields kept as strings). */
const pick = (f0, keys) => Object.fromEntries(keys.filter((k) => f0 && f0[k] !== undefined && f0[k] !== null).map((k) => [k, typeof f0[k] === "number" ? String(f0[k]) : f0[k]]));
/** Rule of a plastic feature: the one it is linked to, else the rule of the active component (or the library default). */
const ruleFor = (app, f0) => (f0 && f0.plasticRule && RU.findRule(app.doc, f0.plasticRule)) || RU.effectiveRule(app.doc, activeComponent(app));
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
      ...(rib ? [
        { id: "pull", type: "selection", label: "Draft Pull Direction", kinds: ["originPlane", "cplane", "face", "edge", "originAxis"], planar: true, min: 0, max: 1, advance: false, visible: (v, dlg) => Math.abs(dlg.num("draft") || 0) > 1e-9, prompt: "Select object to indicate direction", tooltip: "Select a plane or face to define the pull direction (default: the rib depth direction)." },
        { id: "flipPull", type: "check", label: "Flip Pull Direction", visible: (v, dlg) => Math.abs(dlg.num("draft") || 0) > 1e-9, tooltip: "Flips pull direction for draft." },
      ] : []),
      { id: "fillet", type: "value", label: "Fillet Radius", kind: "length", nonNegative: true, default: rd.fillet || "0.00 mm", tooltip: `Specify fillet radius value for ${kind}.` },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, pick(f0, ["thicknessType", "extent", "thickness", "depth", "draft", "draftFrom", "fillet"]), { flip: !!f0.flip });
      dlg.values.curves = ((f0.curves && f0.curves.curves) || []).map((c) => ({ kind: "sketchCurve", sketch: f0.curves.sketch, curve: c }));
      if (rib) { dlg.values.pull = sel1(app, dlg.baseState, f0.pull); dlg.values.flipPull = !!f0.flipPull; }
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
        ...(rib ? { pull: storeRef((v.pull || [])[0]) || undefined, flipPull: !!v.flipPull } : {}),
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

// ------------------------------------------------------------------ shared: references for directions / extents
/** Selection ref -> stored direction / extent ref (planes, faces, edges, axes, sketch points and lines). */
export function storeRef(r) {
  if (!r) return null;
  if (r.kind === "originPlane") return { kind: "origin", name: r.name };
  if (r.kind === "cplane") return { kind: "cplane", id: r.id };
  if (r.kind === "originAxis") return { kind: "axis", axis: { kind: "origin", name: r.name } };
  if (r.kind === "sketchPoint") return { kind: "sketchPoint", sketch: r.sketch, point: r.point };
  if (r.kind === "sketchCurve") return { kind: "sketchLine", sketch: r.sketch, curve: r.curve };
  if (r.kind === "vertex") return { kind: "vertex", body: r.body, p: r.p };
  if (r.kind === "face") return { body: r.body, p: r.p, n: r.n };
  if (r.kind === "edge") return { body: r.body, p: r.p };
  return null;
}
/** Stored ref -> selection ref (Edit Feature). */
export function selRef(app, state, s) {
  if (!s) return null;
  if (s.kind === "origin") return { kind: "originPlane", name: s.name };
  if (s.kind === "cplane") return { kind: "cplane", id: s.id };
  if (s.kind === "axis") return { kind: "originAxis", name: s.axis && s.axis.name };
  if (s.kind === "sketchPoint") return { kind: "sketchPoint", sketch: s.sketch, point: s.point };
  if (s.kind === "sketchLine") return { kind: "sketchCurve", sketch: s.sketch, curve: s.curve };
  if (s.kind === "vertex") return { kind: "vertex", body: s.body, p: s.p };
  if (s.body && Array.isArray(s.n)) return U.faceRef(state, s.body, s.p, s.n);
  if (s.body) return U.edgeRef(state, s.body, s.p);
  return null;
}
const sel1 = (app, state, s) => { const r = selRef(app, state, s); return r ? [r] : []; };

// ------------------------------------------------------------------ Boss
const HOLE_TYPES = [{ value: "simple", label: "Simple", icon: "holeSimple" }, { value: "counterbore", label: "Counterbore", icon: "holeCounterbore" }, { value: "countersink", label: "Countersink", icon: "holeCountersink" }];
const STEP_TYPES = [{ value: "none", label: "None" }, { value: "in", label: "In" }, { value: "out", label: "Out" }];
const BOSS_TYPES = [{ value: "flat", label: "Tapped Hole With Flat End", icon: "drillFlat" }, { value: "tip", label: "Tapped Hole With Tool Tip", icon: "drillAngle" }, { value: "pinned", label: "Pinned", icon: "holeSimple" }];
const SIDE_KEYS = ["D", "B", "C", "F", "Draft", "R", "O", "A2", "A3", "R3", "R4", "R5", "R6", "R7", "Step", "RibN", "RibShape", "RibT", "RibDraft", "RibRot", "RibTotal", "RibK", "RibL", "RibM", "RibB2", "RibRR", "RibB1", "RibBase", "RibOuter", "WebN", "WebSpacing", "WebTotal", "WebRot", "WebT", "WebDepth", "WebDraft"];
const BOSS_VALUES = ["bossType", "s1Type", "offsetPos", "s1E", "s1A", "s1Cs", "s1A1", "s1R1", "s1R2", "s2G", ...SIDE_KEYS.flatMap((k) => [`s1${k}`, `s2${k}`])];

export function openBoss(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const rule = ruleFor(app, f0);
  const rd = RU.ruleDefaults("boss", rule);
  const sub = (s) => (s === 1 ? "₁" : "₂");
  const L = (id, label, txt, dflt, extra = {}) => ({ id, type: "value", kind: "length", label, tooltip: txt, default: dflt, nonNegative: true, ...extra });
  const Ang = (id, label, txt, dflt, extra = {}) => ({ id, type: "value", kind: "angle", label, tooltip: txt, default: dflt, ...extra });
  const tab = (t) => (v) => (v.tab || "boss") === t;
  const side = (s) => {
    const k = `s${s}`;
    const step = (v) => v[`${k}Step`] !== "none";
    const cb = (v) => s === 1 && v.bossType !== "pinned" && v.s1Type === "counterbore";
    const rows = [];
    if (s === 1) rows.push({ id: "s1Type", type: "dropdown", label: "Hole Type", options: HOLE_TYPES, default: "simple", visible: (v) => v.bossType !== "pinned", tooltip: "Hole type of Side 1: Simple, Counterbore or Countersink." });
    rows.push({ id: `${k}Step`, type: "dropdown", label: "Step Type", options: STEP_TYPES, default: "none", tooltip: `Adds a step to Side ${s}: In recesses the top of the boss, Out raises a ring on it.` });
    rows.push(L(`${k}D`, `D${sub(s)}`, `Boss Diameter: specify the overall diameter value for Side ${s} of the boss feature.`, rd[`${k}D`] || (s === 1 ? "6.40 mm" : "5.50 mm"), { positive: true }));
    rows.push(L(`${k}B`, `B${sub(s)}`, `Hole Diameter: specify the diameter value of the inner hole for Side ${s} of the boss feature.`, s === 1 ? "3.40 mm" : "2.50 mm", { positive: true }));
    if (s === 1) {
      rows.push(L("s1E", "E₁", "Hole Depth: specify the depth value of the inner hole for Side 1 of the boss feature.", "3.00 mm", { positive: true, visible: (v) => v.bossType === "pinned" || v.s1Type === "counterbore" }));
      rows.push(L("s1A", "A₁", "Counterbore Diameter: specify the diameter value of the counterbore hole for Side 1 of the boss feature.", "6.00 mm", { positive: true, visible: (v) => v.bossType !== "pinned" && v.s1Type !== "simple" }));
      rows.push(Ang("s1Cs", "Countersink Angle", "Specify the countersink angle.", "90.0 deg", { positive: true, visible: (v) => v.bossType !== "pinned" && v.s1Type === "countersink" }));
    } else rows.push(L("s2G", "G₂", "Hole Depth: specify the depth value of the inner hole for Side 2 of the boss feature (the pin length for Pinned).", "8.00 mm", { positive: true }));
    rows.push(L(`${k}C`, `C${sub(s)}`, `Step Diameter: specify the diameter value of the step for Side ${s} of the boss feature.`, "5.00 mm", { positive: true, visible: step }));
    rows.push(L(`${k}F`, `F${sub(s)}`, `Step Depth: specify the depth value of the step for Side ${s} of the boss feature.`, "1.00 mm", { positive: true, visible: step }));
    rows.push(Ang(`${k}Draft`, "α₄", `Boss Draft Angle: specify the draft angle value of the outer boss for Side ${s} of the boss feature.`, rd[`${k}Draft`] || "1.0 deg"));
    rows.push(L(`${k}R`, "R", `Base Fillet Radius: specify the radius value of the base fillet for Side ${s} of the boss feature.`, rd[`${k}R`] || "0.50 mm"));
    rows.push(L(`${k}O`, "O", `Offset Clearance: specify the clearance value between the sketch plane and the boss for Side ${s}.`, rd[`${k}O`] || "0.00 mm"));
    const adv = [];
    if (s === 1) {
      adv.push(Ang("s1A1", "α₁", "Counterbore Draft Angle: specify the draft angle value of the counterbore for Side 1 of the boss feature.", "0.0 deg", { visible: cb }));
      adv.push(L("s1R1", "R₁", "Outer Counterbore Fillet Radius: specify the radius value of the outer counterbore fillet for Side 1 of the boss feature.", "0.00 mm", { visible: cb }));
      adv.push(L("s1R2", "R₂", "Inner Counterbore Fillet Radius: specify the radius value of the inner counterbore fillet for Side 1 of the boss feature.", "0.00 mm", { visible: cb }));
    }
    adv.push(Ang(`${k}A2`, "α₂", `Hole Draft Angle: specify the draft angle value of the hole for Side ${s} of the boss feature.`, "0.0 deg"));
    adv.push(Ang(`${k}A3`, "α₃", `Step Draft Angle: specify the draft angle value of the step for Side ${s} of the boss feature.`, "0.0 deg", { visible: step }));
    adv.push(L(`${k}R3`, "R₃", `Upper Hole Fillet Radius: specify the radius value of the upper hole fillet for Side ${s} of the boss feature.`, "0.00 mm"));
    adv.push(L(`${k}R4`, "R₄", `Lower Hole Fillet Radius: specify the radius value of the lower hole fillet for Side ${s} of the boss feature.`, "0.00 mm"));
    adv.push(L(`${k}R5`, "R₅", `Outer Boss Fillet Radius: specify the radius value of the outer boss fillet for Side ${s} of the boss feature.`, "0.00 mm"));
    adv.push(L(`${k}R6`, "R₆", `Outer Step Fillet Radius: specify the radius value of the outer step fillet for Side ${s} of the boss feature.`, "0.00 mm", { visible: step }));
    adv.push(L(`${k}R7`, "R₇", `Inner Step Fillet Radius: specify the radius value of the inner step fillet for Side ${s} of the boss feature.`, "0.00 mm", { visible: step }));
    return [
      { id: `side${s}`, type: "group", label: `Side ${s}`, visible: tab("boss"), rows },
      { id: `side${s}AO`, type: "group", label: "Advanced", collapsed: true, visible: tab("boss"), rows: adv },
    ];
  };
  const ribs = (s) => {
    const k = `s${s}`;
    const on = (v) => Number(String(v[`${k}RibN`]).replace(/[^\d.]/g, "")) > 0;
    const ch = (v) => on(v) && v[`${k}RibShape`] === "chamfer";
    return { id: `ribs${s}`, type: "group", label: `Side ${s}`, visible: tab("ribs"), rows: [
      { id: `${k}RibShape`, type: "buttons", label: "Profile", options: [{ value: "round", label: "Round" }, { value: "chamfer", label: "Chamfer" }], default: "round", tooltip: `Round: ribs with a rounded fillet profile; Chamfer: an angular chamfer profile around Side ${s} of the boss feature.` },
      { id: `${k}RibN`, type: "value", kind: "none", label: "Quantity", default: "0", integer: true, nonNegative: true, step: 1, tooltip: `Specify the number of ribs to support Side ${s} of the boss feature.` },
      L(`${k}RibT`, "Thickness", `Specify the distance value to extrude the ribs, perpendicular to the outer face of Side ${s} of the boss feature.`, "1.00 mm", { positive: true, visible: on }),
      Ang(`${k}RibDraft`, "Draft Angle", `Specify the draft angle value for the thickness of the ribs around Side ${s} of the boss feature.`, "0.0 deg", { visible: on }),
      Ang(`${k}RibRot`, "Rotation Angle", `Specify the rotation angle value to orient the ribs around Side ${s} of the boss feature.`, "0.0 deg", { visible: on }),
      L(`${k}RibK`, "K", `Rib Length: specify the distance value from the center of Side ${s} of the boss feature to the nearest point on the outermost face of the rib.`, "6.00 mm", { positive: true, visible: on }),
      L(`${k}RibL`, "L", `Step Offset: specify the distance value to offset the top of the ribs from the top of Side ${s} of the boss feature.`, "2.00 mm", { visible: on }),
      L(`${k}RibM`, "M", `Chamfer Distance: specify the distance value of the chamfered face on the ribs for Side ${s} of the boss feature.`, "1.50 mm", { visible: ch }),
      Ang(`${k}RibB2`, "β₂", `Chamfer Angle: specify the angle value of the chamfered face on the ribs for Side ${s} of the boss feature.`, "45.0 deg", { positive: true, max: 89, visible: ch }),
      L(`${k}RibRR`, "RR", `Fillet Radius: specify the radius value of the rib fillets for Side ${s} of the boss feature.`, "1.00 mm", { visible: (v) => on(v) && v[`${k}RibShape`] !== "chamfer" }),
      Ang(`${k}RibB1`, "β₁", `Outer Draft Angle: specify the draft angle value for the outermost face of the ribs around Side ${s} of the boss feature.`, "0.0 deg", { visible: on }),
      L(`${k}RibBase`, "Base Fillet Radius", `Specify the radius value for the fillet at the base of the ribs for Side ${s} of the boss feature.`, "0.00 mm", { visible: on }),
      L(`${k}RibOuter`, "Outer Fillet Radius", `Specify the radius value for the fillet along the outer edges of the ribs for Side ${s} of the boss feature.`, "0.00 mm", { visible: on }),
    ] };
  };
  const webs = (s) => {
    const k = `s${s}`;
    const on = (v) => Number(String(v[`${k}WebN`]).replace(/[^\d.]/g, "")) > 0;
    return { id: `webs${s}`, type: "group", label: `Side ${s}`, visible: tab("web"), rows: [
      { id: `${k}WebSpacing`, type: "buttons", label: "Angular Spacing", options: [{ value: "full", label: "Full" }, { value: "angle", label: "Angle" }], default: "full", tooltip: "Full: the webs are spread over 360 deg; Angle: over the Total Angle." },
      { id: `${k}WebN`, type: "value", kind: "none", label: "Number of Ribs", default: "0", integer: true, nonNegative: true, step: 1, tooltip: `Number of webs from Side ${s} of the boss to the nearest faces.` },
      Ang(`${k}WebTotal`, "Total Angle", "Angle over which the webs are spread.", "90.0 deg", { visible: (v) => on(v) && v[`${k}WebSpacing`] === "angle" }),
      Ang(`${k}WebRot`, "Rotation", "Rotation of the first web around the boss axis.", "0.0 deg", { visible: on }),
      L(`${k}WebT`, "Thickness", "Thickness of the webs.", "1.00 mm", { positive: true, visible: on }),
      L(`${k}WebDepth`, "Depth", "Height of the webs from the top of the boss.", "5.00 mm", { positive: true, visible: on }),
      Ang(`${k}WebDraft`, "Draft Angle", "Draft angle of the web faces.", "0.0 deg", { visible: on }),
    ] };
  };
  return app.ui.dialog.open({
    id: "FusionBossCommand", title: "Boss", icon: "FusionBossCommand", featureLabel: "Boss", editId,
    help: "Creates a boss feature to fasten two solid bodies together and reinforce thin areas of a design. Select a sketch point between two solid bodies, then adjust the settings for each side of the boss feature.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "sketchPoint"), ctrlWidth: 150,
    rows: [
      { id: "tab", type: "buttons", label: "", options: [{ value: "boss", label: "Boss" }, { value: "ribs", label: "Ribs" }, { value: "web", label: "Web" }], default: "boss", tooltip: "Boss Tab Bar" },
      { id: "points", type: "selection", label: "Sketch Points", kinds: ["sketchPoint"], visible: tab("boss"), prompt: "Select sketch point to place a boss", tooltip: "Select sketch points between two solid bodies." },
      { id: "bossType", type: "dropdown", label: "Type", options: BOSS_TYPES, default: "flat", visible: tab("boss"), tooltip: "Tapped hole with a flat end or a drill tip in Side 2, or a pin on Side 2 that fits a hole in Side 1." },
      { id: "flip", type: "check", label: "Flip", visible: tab("boss"), tooltip: "Flips boss feature over selected sketch point to switch Side 1 and Side 2 bodies." },
      L("offsetPos", "Offset Position", "Specify a distance to offset the position of the boss feature from the sketch plane.", "0.00 mm", { nonNegative: false, visible: tab("boss") }),
      { ...schematic("boss"), visible: tab("boss") },
      ...side(1), ...side(2), ribs(1), ribs(2), webs(1), webs(2),
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
      for (const k of BOSS_VALUES) if (v[k] !== undefined) f[k] = v[k];
      return Object.assign(f, ruleMeta(dlg, "boss", rd, rule, f0));
    },
    commit(f, dlg) { return dlg.commitFeature(f, { hideSketches: editId ? [] : [...new Set(f.points.map((p) => p.sketch))] }); },
  });
}

// ------------------------------------------------------------------ Lip
const LIP_TYPES = [{ value: "lip", label: "Lip" }, { value: "groove", label: "Groove" }, { value: "both", label: "Lip And Groove" }];
const DIR_KINDS = ["originPlane", "cplane", "face"];
const EXTENT_KINDS = ["vertex", "sketchPoint", "face", "originPlane", "cplane"];

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
  const L = (id, n, txt, dflt, extra = {}) => ({ id, type: "value", kind: "length", label: n, tooltip: txt, default: dflt, ...extra });
  const chainMap = (r, dlg) => {
    if (r.kind !== "edge" || dlg.values.chain === false) return r;
    const b = dlg.baseState.bodies.get(r.body);
    if (!b || !(r.index >= 0)) return r;
    let idx;
    try { idx = tangentEdges(b.shape, r.index); } catch { return r; }
    const es = K.edgesAt(b.shape, idx);
    try { return idx.map((i, k) => ({ kind: "edge", body: r.body, index: i, p: i === r.index ? r.p : K.edgeMid(es[k]) })); } finally { K.del(...es); }
  };
  const lipOn = (v) => v.lipType !== "groove";
  return app.ui.dialog.open({
    id: "FusionLipCommand", title: "Lip", icon: "FusionLipCommand", featureLabel: "Lip", editId,
    help: "Creates a lip, groove, or combined feature on one or two solid bodies. Select an edge on a solid body then choose between the Lip, Groove, or Lip And Groove types.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "edge"), ctrlWidth: 140,
    rows: [
      { id: "lipType", type: "dropdown", label: "Type", options: LIP_TYPES, default: "lip", tooltip: "Lip: a raised lip. Groove: a recessed groove. Lip And Groove: a lip on the selected body and a matching groove in the body that rests on it." },
      { id: "edges", type: "selection", label: "Path", kinds: ["edge"], mapRef: chainMap, prompt: "Select an edge to place lip", tooltip: "Select an edge to place a lip feature on a solid body.",
        filter: (r, dlg) => { const first = (dlg.values.edges || [])[0]; return !first || first.body === r.body; } },
      { id: "chain", type: "check", label: "Tangent Chain", default: true, tooltip: "Automatically select tangent edges." },
      { id: "guideType", type: "dropdown", label: "Guide Type", options: [{ value: "face", label: "Face Guide" }, { value: "pull", label: "Pull Direction" }], default: "face", tooltip: "Face Guide: select a face to place the lip feature. Pull Direction: select a plane or face to define the pull direction." },
      { id: "guide", type: "selection", label: "Guide Surface", kinds: ["face"], planar: true, min: 0, max: 1, advance: false, visible: (v) => v.guideType !== "pull", prompt: "Select a face on either side of the selected edge to locate the lip feature", tooltip: "Select a face on either side of the selected edge to locate the lip feature. Default: the planar face that holds the path." },
      { id: "pull", type: "selection", label: "Pull Direction", kinds: DIR_KINDS, planar: true, min: 1, max: 1, advance: false, visible: (v) => v.guideType === "pull", prompt: "Select a plane or face to define the pull direction", tooltip: "Select a plane or face to define the pull direction." },
      { id: "extent1", type: "selection", label: "Extent 1", kinds: EXTENT_KINDS, min: 0, max: 1, advance: false, prompt: "Select a point, vertex, face, or plane to extend to", tooltip: "Open paths: select a point, vertex, face, or plane to extend the start to." },
      { id: "extent2", type: "selection", label: "Extent 2", kinds: EXTENT_KINDS, min: 0, max: 1, advance: false, prompt: "Select a point, vertex, face, or plane to extend to", tooltip: "Open paths: select a point, vertex, face, or plane to extend the end to." },
      schematic("lip"),
      L("height", "A", "Height: specify the Height of the Lip. Groove dimensions are calculated automatically.", rd.height || "1.50 mm", { positive: true, sep: true }),
      L("width", "B", "Width: specify the Width of the Lip.", rd.width || "0.75 mm", { positive: true }),
      L("shoulder", "C", "Shoulder Width: specify the distance between the selected edge and the lip feature.", "0.00 mm", { nonNegative: true }),
      L("reveal", "D", "Reveal Height: the shoulder outside the lip is lowered by this height.", "0.00 mm", { nonNegative: true, visible: lipOn }),
      L("clearance", "E", "Clearance: specify the Clearance for the feature.", rd.clearance || "0.10 mm", { nonNegative: true, visible: (v) => v.lipType === "both" }),
      { id: "grooveShoulder", type: "dropdown", label: "Groove Shoulder", options: [{ value: "include", label: "Include Groove Shoulder" }, { value: "exclude", label: "Exclude Groove Shoulder" }], default: "include", visible: (v) => v.lipType !== "lip", tooltip: "Include: builds the groove shoulder (from the Shoulder Width). Exclude: the groove opens to the path." },
      { id: "draft1", type: "value", kind: "angle", label: "α₁", default: rd.draft1 || "0.0 deg", visible: lipOn, tooltip: "Side 1 Draft: specify the draft angle for the face farther from the selected edge." },
      { id: "draft2", type: "value", kind: "angle", label: "α₂", default: rd.draft2 || "0.0 deg", visible: lipOn, tooltip: "Side 2 Draft: specify the draft angle for the face closer to the selected edge." },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, pick(f0, ["lipType", "height", "width", "clearance", "shoulder", "reveal", "draft1", "draft2", "grooveShoulder", "guideType"]), { chain: f0.chain !== false });
      dlg.values.edges = (f0.edges || []).map((er) => U.edgeRef(dlg.baseState, er.body, er.p));
      dlg.values.guide = f0.guide ? [U.faceRef(dlg.baseState, f0.guide.body, f0.guide.p, f0.guide.n)] : [];
      dlg.values.pull = sel1(app, dlg.baseState, f0.pull);
      dlg.values.extent1 = sel1(app, dlg.baseState, f0.extent1);
      dlg.values.extent2 = sel1(app, dlg.baseState, f0.extent2);
    },
    prompt: (dlg) => ((dlg.values.edges || []).length ? "Modify edge selection or adjust lip settings" : "Select an edge to place lip"),
    status: (dlg) => { const n = (dlg.values.edges || []).length; return n === 0 ? "" : n === 1 ? "Edge" : `${n} Edges`; },
    build(v, dlg) {
      const edges = (v.edges || []).filter((r) => r.kind === "edge").map((r) => ({ body: r.body, p: r.p }));
      if (!edges.length) return null;
      const f = { type: "lip", lipType: v.lipType, edges, chain: v.chain !== false, guideType: v.guideType, height: v.height, width: v.width, clearance: v.clearance,
        shoulder: v.shoulder, reveal: v.reveal, grooveShoulder: v.grooveShoulder, draft1: v.draft1, draft2: v.draft2 };
      const g = (v.guide || [])[0];
      if (g && v.guideType !== "pull") f.guide = { body: g.body, p: g.p, n: g.n };
      if (v.guideType === "pull") { f.pull = storeRef((v.pull || [])[0]); if (!f.pull) return null; }
      for (const k of ["extent1", "extent2"]) { const r = storeRef((v[k] || [])[0]); if (r) f[k] = r; }
      return Object.assign(f, ruleMeta(dlg, "lip", rd, rule, f0));
    },
  });
}

// ------------------------------------------------------------------ Rest
const REST_DIRS = [{ value: "side1", label: "Side 1" }, { value: "side2", label: "Side 2" }, { value: "sym", label: "Symmetric", icon: "symmetric" }];
const REST_EXTENTS = [{ value: "all", label: "All", icon: "all" }, { value: "object", label: "To Object", icon: "toObject" }];
const OBJ_KINDS = ["face", "cplane", "originPlane"];
const objRef = (o) => (!o ? null : o.kind === "cplane" ? { kind: "cplane", id: o.id } : o.kind === "originPlane" ? { kind: "origin", name: o.name } : { body: o.body, p: o.p, n: o.n });
export function openRest(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const rule = ruleFor(app, f0);
  const rd = RU.ruleDefaults("rest", rule);
  const pre = opts.preselect || [];
  const sideGroup = (n, ext, obj, dr) => ({ id: `restSide${n}`, type: "group", label: `Side ${n}`, rows: [
    { id: ext, type: "dropdown", label: "Extent Type", options: REST_EXTENTS, default: "all", tooltip: "All: extrudes the rest through the selected body. To Object: from the sketch profile to a body, a face, or a plane that you select." },
    { id: obj, type: "selection", label: "Object", kinds: OBJ_KINDS, planar: true, max: 1, advance: false, visible: (v) => v[ext] === "object", prompt: "Select body, face, or plane to extend to", tooltip: "Select a body, a face, or a plane to extrude to." },
    { id: dr, type: "value", label: "Draft Angle", kind: "angle", default: n === 1 ? rd.draft || "0.0 deg" : "0.0 deg", tooltip: n === 1 ? "Draft angle of the walls above the landing." : "Draft angle of the rest walls below the landing." },
  ] });
  return app.ui.dialog.open({
    id: "FusionRestCommand", title: "Rest", icon: "FusionRestCommand", featureLabel: "Rest", editId,
    help: "Creates a rest feature that intersects the overall shape and forms a flat area that can be used for the placement of another part. Select a closed sketch profile and a solid body, then specify the thickness.",
    preselect: pre.filter((r) => r.kind === "profile").concat(pre.filter((r) => r.kind === "body").slice(0, 1)), ctrlWidth: 130,
    rows: [
      { id: "profiles", type: "selection", label: "Profile", kinds: ["profile"], prompt: "Select a closed sketch profile to place a rest feature", tooltip: "Select closed sketch profiles to create a rest." },
      { id: "body", type: "selection", label: "Body", kinds: ["body", "face"], max: 1, mapRef: (r) => (r && r.body ? { kind: "body", body: r.body } : null), prompt: "Select a solid body for the rest feature", tooltip: "Select a solid body for the rest feature." },
      { id: "topFaces", type: "selection", label: "Top Faces", kinds: ["face"], min: 0, advance: false, prompt: "Select Landing faces for the rest feature",
        filter: (r, dlg) => { const b = (dlg.values.body || [])[0]; return !b || r.body === b.body; }, tooltip: "Select top faces of the solid body to specify areas where the rest feature will be created." },
      { id: "thickness", type: "value", label: "Thickness", kind: "length", positive: true, default: rd.thickness || "1.50 mm", sep: true, tooltip: "Thickness of the landing." },
      { id: "direction", type: "dropdown", label: "Thickness Direction", options: REST_DIRS, default: "side1", tooltip: "Side 1: the thickness goes into the body from the landing. Side 2: away from it. Symmetric: half each way." },
      { id: "flip", type: "check", label: "Flip", tooltip: "Flips the rest feature over the selected sketch profile." },
      { id: "offset", type: "value", label: "Offset Position", kind: "length", default: "0.00 mm", tooltip: "Specify the distance to offset the position of the rest plane from the selected profile." },
      { id: "trim", type: "check", label: "Trim", default: true, tooltip: "Removes an unwanted rest area extending out of the solid body." },
      sideGroup(1, "extent", "object", "draft"),
      sideGroup(2, "extent2", "object2", "draft2"),
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, pick(f0, ["thickness", "direction", "offset", "extent", "draft", "extent2", "draft2"]), { flip: !!f0.flip, trim: f0.trim !== false });
      dlg.values.profiles = profileSelRefs(f0.profiles);
      dlg.values.body = f0.body ? [{ kind: "body", body: f0.body }] : [];
      dlg.values.topFaces = (f0.topFaces || []).map((fr) => U.faceRef(dlg.baseState, fr.body, fr.p, fr.n));
      for (const [k, s] of [["object", f0.object], ["object2", f0.object2]]) {
        dlg.values[k] = !s ? [] : s.kind === "cplane" ? [{ kind: "cplane", id: s.id }] : s.kind === "origin" ? [{ kind: "originPlane", name: s.name }] : [U.faceRef(dlg.baseState, s.body, s.p, s.n)];
      }
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
      const f = { type: "rest", profiles, body: b.body, thickness: v.thickness, direction: v.direction, flip: !!v.flip, offset: v.offset, trim: v.trim !== false,
        extent: v.extent, draft: v.draft, extent2: v.extent2, draft2: v.draft2 };
      const tf = (v.topFaces || []).filter((r) => r.kind === "face" && r.body === b.body).map((r) => ({ body: r.body, p: r.p, n: r.n }));
      if (tf.length) f.topFaces = tf;
      for (const [e, o] of [["extent", "object"], ["extent2", "object2"]]) {
        if (v[e] !== "object") continue;
        const r = objRef((v[o] || [])[0]);
        if (!r) return null;
        f[o] = r;
      }
      return Object.assign(f, ruleMeta(dlg, "rest", rd, rule, f0));
    },
    commit(f, dlg) { return dlg.commitFeature(f, { hideSketches: editId ? [] : [...new Set(f.profiles.map((p) => p.sketch))] }); },
  });
}

// ------------------------------------------------------------------ Snap Fit
const SNAP_TYPES = [{ value: "parallel", label: "Parallel Hook And Groove" }, { value: "perpendicular", label: "Perpendicular Hook And Groove" }, { value: "loop", label: "Hook And Loop" }];
const SNAP_VALUES = ["snapType", "selectMode", "rotationType", "rotation", "bottomExtent", "depth", "hA", "hB", "hC", "hD", "hE", "hF", "hH", "hAlpha1", "hAlpha2", "rootR", "ribM", "gJ", "gL", "gM", "gR", "uU", "uV", "uRU"];
const ALIGN_KINDS = ["originPlane", "cplane", "face", "edge", "originAxis", "sketchCurve", "sketchPoint", "vertex"];

/** Points of the dialog (Manual: the selection; Automatic: every point of the chosen sketch). */
function dlgPoints(dlg) {
  if (dlg.values.selectMode === "auto") {
    const r = (dlg.values.autoSketch || [])[0];
    const s = r && dlg.baseState.sketches.get(r.sketch);
    return s ? Object.values(s.sk.curves).filter((cv) => cv && cv.type === "point" && !cv.cons).map((cv) => ({ sketch: r.sketch, point: cv.p })) : [];
  }
  return (dlg.values.points || []).filter((r) => r.kind === "sketchPoint").map((r) => ({ sketch: r.sketch, point: r.point }));
}

export function openSnapFit(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const rule = ruleFor(app, f0);
  const rd = RU.ruleDefaults("snapFit", rule);
  const L = (id, n, txt, dflt, extra = {}) => ({ id, type: "value", kind: "length", label: n, tooltip: txt, default: dflt, positive: true, ...extra });
  const A = (id, n, txt, dflt) => ({ id, type: "value", kind: "angle", label: n, tooltip: txt, default: dflt, positive: true, max: 90 });
  const indep = {
    id: "rotations", type: "custom", label: "Independent Rotation Angle", visible: (v) => v.rotationType === "independent",
    render: (dlg) => { const el = document.createElement("div"); el.className = "pl-rot-list"; return el; },
    update: (el, dlg) => {
      const pts = dlgPoints(dlg);
      const vals = Array.isArray(dlg.values.rotations) ? dlg.values.rotations : [];
      if (el.childElementCount !== pts.length) {
        el.innerHTML = "";
        pts.forEach((_, i) => {
          const row = document.createElement("label");
          row.className = "pl-rot-row";
          row.textContent = `Snap Fit ${i + 1}`;
          const inp = document.createElement("input");
          inp.type = "text";
          inp.className = "dlg-input";
          inp.dataset.input = `rotation${i}`;
          inp.addEventListener("change", () => { const arr = [...(Array.isArray(dlg.values.rotations) ? dlg.values.rotations : [])]; arr[i] = dlg.app.ui.dialog.withUnit ? dlg.app.ui.dialog.withUnit(inp.value, "angle") : inp.value; dlg.set("rotations", arr, { user: true }); });
          row.appendChild(inp);
          el.appendChild(row);
        });
      }
      [...el.querySelectorAll("input")].forEach((inp, i) => { if (document.activeElement !== inp) inp.value = vals[i] !== undefined ? vals[i] : dlg.values.rotation || "0.0 deg"; });
    },
  };
  return app.ui.dialog.open({
    id: "FusionSnapFitCommand", title: "Snap Fit", icon: "FusionSnapFitCommand", featureLabel: "Snap Fit", editId,
    help: "Creates a cantilever snap fit feature to fasten two solid bodies together in a design. Select a snap fit type, select a sketch point between two solid bodies, then adjust the settings.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "sketchPoint"), ctrlWidth: 150,
    rows: [
      { id: "snapType", type: "dropdown", label: "Type", options: SNAP_TYPES, default: "parallel", tooltip: "Hook and groove parallel or perpendicular to a face, or a hook and loop, on a pair of solid bodies." },
      { id: "selectMode", type: "buttons", label: "Selection Mode", options: [{ value: "manual", label: "Manual" }, { value: "auto", label: "Automatic" }], default: "manual", tooltip: "Manual: select each sketch point. Automatic: every visible sketch point of the selected sketch." },
      { id: "points", type: "selection", label: "Sketch Points", kinds: ["sketchPoint"], visible: (v) => v.selectMode !== "auto", prompt: "Select sketch point to place a snap fit", tooltip: "Select a sketch point to position the snap fit feature on a body." },
      { id: "autoSketch", type: "selection", label: "Sketch", kinds: ["sketchPoint", "sketchCurve", "profile"], max: 1, visible: (v) => v.selectMode === "auto", mapRef: (r) => (r && r.sketch ? { kind: "sketchPoint", sketch: r.sketch, point: r.point || "o" } : null),
        selText: (n, dlg) => (n ? `${dlgPoints(dlg).length} Points` : "Select"), prompt: "Select sketch to place snap fit", tooltip: "Select a sketch: its sketch points place the snap fits." },
      { id: "flip", type: "check", label: "Flip", tooltip: "Flips snap fit feature over selected sketch point." },
      { id: "rotationType", type: "dropdown", label: "Rotation Type", options: [{ value: "uniform", label: "Uniform" }, { value: "independent", label: "Independent" }, { value: "aligned", label: "Aligned" }], default: "uniform", tooltip: "Uniform: all snap fits at the same angle. Independent: each snap fit around its own point. Aligned: to planar, linear, or point geometry." },
      { id: "rotation", type: "value", label: "Rotation Angle", kind: "angle", default: "0.0 deg", visible: (v) => v.rotationType === "uniform", tooltip: "Specify the rotation angle value to orient the snap fit around an axis perpendicular to the sketch point." },
      indep,
      { id: "align", type: "selection", label: "Alignment Object", kinds: ALIGN_KINDS, max: 1, advance: false, visible: (v) => v.rotationType === "aligned", prompt: "Select a line, an edge, a vertex or point to define Custom alignment direction", tooltip: "Select a plane, line, or point to align snap fits." },
      { id: "alignFlip", type: "check", label: "Flip", visible: (v) => v.rotationType === "aligned", tooltip: "Flips the alignment of snap fits 180 degrees relative to the selected alignment object." },
      { id: "bottomExtent", type: "dropdown", label: "Extent Type", options: [{ value: "next", label: "To Next", icon: "toObject" }, { value: "distance", label: "Distance", icon: "distance" }], default: "next", sep: true, tooltip: "To Next: extrudes the bottom of the snap fit from the sketch profile to the nearest faces on a solid body. Distance: to a specified depth." },
      L("depth", "Depth", "Specify the distance to extrude the bottom of the snap fit toward the hook body.", "10.00 mm", { visible: (v) => v.bottomExtent === "distance" }),
      schematic("snap"),
      { id: "hook", type: "group", label: "Hook", rows: [
        L("hA", "A", "Base Depth: thickness of the beam at the wall.", rd.hA || "1.50 mm"),
        L("hB", "B", "Beam Length", "10.00 mm"),
        L("hC", "C", "Transition Depth: thickness of the beam at the hook.", rd.hC || "0.90 mm"),
        L("hD", "D", "Base Width: width of the beam at the wall.", "6.00 mm"),
        L("hE", "E", "Transition Width: width of the beam at the hook.", "5.00 mm"),
        L("hF", "F", "Hook Depth: specify the depth of the tip of the hook.", "1.00 mm"),
        L("hH", "H", "Hook Length", "2.00 mm"),
        A("hAlpha1", "α₁", "Exit Angle", "90.0 deg"),
        A("hAlpha2", "α₂", "Entry Angle", "30.0 deg"),
        L("rootR", "Base Fillet Radius", "Specify the radius value of the fillet at the base of the hook.", "0.00 mm", { positive: false, nonNegative: true }),
        { id: "hookRibs", type: "check", label: "Ribs", visible: (v) => v.snapType === "loop", tooltip: "Adds ribs to the hook side of the snap fit." },
        L("ribM", "M", "Rib Width: specify the width of the ribs for the hook.", "1.00 mm", { visible: (v) => v.snapType === "loop" && !!v.hookRibs }),
      ] },
      { id: "groove", type: "group", label: "Groove", visible: (v) => v.snapType !== "loop", rows: [
        L("gJ", "J", "Groove Depth: how far the groove goes past the hook.", "0.50 mm"),
        L("gL", "L", "Groove Width: clearance on each side of the hook.", rd.gL || "0.20 mm"),
        L("gM", "M", "Length Clearance", "0.50 mm"),
        L("gR", "R", "Corner Radius: specify the radius at the corners of the groove.", "0.00 mm", { positive: false, nonNegative: true }),
      ] },
      { id: "loop", type: "group", label: "Loop", visible: (v) => v.snapType === "loop", rows: [
        L("lJ", "J", "Hook Clearance: gap between the hook and the loop bar.", "0.50 mm"),
        L("lL", "L", "Side clearance between the hook and the loop posts.", rd.gL || "0.20 mm"),
      ] },
      { id: "undercut", type: "group", label: "Hook Undercut", collapsed: true, rows: [
        L("uU", "U", "Undercut Width: specify the width of the groove to receive the undercut (0 = none).", "0.00 mm", { positive: false, nonNegative: true }),
        L("uV", "V", "Undercut Length: specify the length of the groove to receive the undercut.", "0.00 mm", { positive: false, nonNegative: true }),
        L("uRU", "RU", "Corner Radius: specify the radius at the corners of the undercut.", "0.00 mm", { positive: false, nonNegative: true }),
      ] },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, pick(f0, SNAP_VALUES), { flip: !!f0.flip, alignFlip: !!f0.alignFlip, hookRibs: !!f0.hookRibs });
      if (Array.isArray(f0.rotations)) dlg.values.rotations = [...f0.rotations];
      if (f0.snapType === "loop") Object.assign(dlg.values, { lJ: String(f0.gJ), lL: String(f0.gL) });
      dlg.values.points = (f0.points || []).map((p) => ({ kind: "sketchPoint", sketch: p.sketch, point: p.point }));
      if (f0.autoSketch) dlg.values.autoSketch = [{ kind: "sketchPoint", sketch: f0.autoSketch, point: "o" }];
      dlg.values.align = sel1(app, dlg.baseState, f0.align);
    },
    prompt: (dlg) => (dlg.values.selectMode === "auto" ? ((dlg.values.autoSketch || []).length ? "" : "Select sketch to place snap fit") : (dlg.values.points || []).length ? "Select additional sketch points or adjust snap fit settings" : "Select sketch point to place a snap fit"),
    status: (dlg) => { const n = dlgPoints(dlg).length; return n ? `${n} Sketch Point${n > 1 ? "s" : ""}` : ""; },
    build(v, dlg) {
      const pts = dlgPoints(dlg);
      if (!pts.length) return null;
      const f = { type: "snapFit", points: v.selectMode === "auto" ? [] : pts, flip: !!v.flip, alignFlip: !!v.alignFlip, hookRibs: !!v.hookRibs };
      for (const k of SNAP_VALUES) if (v[k] !== undefined) f[k] = v[k];
      if (v.selectMode === "auto") f.autoSketch = v.autoSketch[0].sketch;
      if (v.rotationType === "independent") f.rotations = pts.map((_, i) => (Array.isArray(v.rotations) && v.rotations[i]) || v.rotation || "0.0 deg");
      if (v.rotationType === "aligned") { f.align = storeRef((v.align || [])[0]); if (!f.align) return null; }
      if (v.snapType === "loop") { f.gJ = v.lJ; f.gL = v.lL; }
      const meta = ruleMeta(dlg, "snapFit", rd, rule, f0);
      if (v.snapType === "loop" && meta.ruleFields) meta.ruleFields = meta.ruleFields.filter((k) => k !== "gL" || !dlg.touched.has("lL"));
      return Object.assign(f, meta);
    },
    commit(f, dlg) { return dlg.commitFeature(f, { hideSketches: editId ? [] : [...new Set([...f.points.map((p) => p.sketch), ...(f.autoSketch ? [f.autoSketch] : [])])] }); },
  });
}

/** Start a plastic command: leave the sketch, keep the preselection. */
export const begin = (app) => beginModelCommand(app);
