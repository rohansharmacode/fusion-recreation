// Extrude, Revolve and Press Pull.
import * as U from "./util.js";
import { OPERATIONS, DIRECTIONS, profileRefsOf, faceRefsOf, bodyIdsOf, profileSelRefs, beginModelCommand, profileStatus } from "./common.js";
import { openFillet } from "./cmd-modify.js";

const V = U.V;

const EXTENTS = [
  { value: "distance", label: "Distance", icon: "distance" },
  { value: "to", label: "To Object", icon: "toObject", disabled: true },
  { value: "all", label: "All", icon: "all" },
];

// ------------------------------------------------------------------ Extrude
function extrudeAnchor(dlg) {
  const sel = dlg.values.profiles || [];
  const prof = sel.filter((r) => r.kind === "profile");
  if (prof.length) return U.profilesAnchor(dlg.baseState, prof);
  const face = sel.find((r) => r.kind === "face");
  if (face) return { o: face.p, n: face.n, plane: null, face: true };
  return null;
}

/** An in-plane direction for the taper arc (the sketch X axis, else a stable perpendicular). */
function sideDir(a) {
  if (a.plane && a.plane.x) return V.norm(a.plane.x);
  const n = a.n;
  const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return V.norm(V.cross(ref, n));
}

function extrudeAutoOp(dlg) {
  if (dlg.touched.has("operation")) return;
  const v = dlg.values;
  const a = extrudeAnchor(dlg);
  if (!a) return;
  const d = dlg.num("distance");
  const sign = v.extent === "all" ? (v.flip ? -1 : 1) : Math.sign(d) || 1;
  const off = v.startType === "offset" && !a.face ? dlg.num("startOffset") || 0 : 0;
  const o = V.add(a.o, V.mul(a.n, off));
  const dirs = v.dirType === "one" ? [V.mul(a.n, sign)] : [a.n, V.mul(a.n, -1)];
  const op = U.autoOperation(dlg.app, dlg.baseState, o, dirs);
  if (op !== v.operation) dlg.set("operation", op, { noPreview: true });
}

export function openExtrude(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "Extrude",
    title: "Extrude",
    icon: "Extrude",
    featureLabel: "Extrude",
    editId,
    help: "Adds depth to open or closed sketch profiles or faces.",
    preselect: opts.preselect,
    ctrlWidth: 118,
    rows: [
      { id: "type", type: "buttons", label: "Type", options: [{ value: "extrude", label: "Extrude", icon: "extrudeType" }, { value: "thin", label: "Thin Extrude", icon: "thinExtrude", disabled: true }], default: "extrude", iconSize: 20 },
      { id: "profiles", type: "selection", label: "Profiles", kinds: ["profile", "face"], planar: true, prompt: "Select sketch profiles or planar faces to extrude", tooltip: "Select coplanar sketch profiles or faces to extrude." },
      { id: "startType", type: "dropdown", label: "Start", options: [{ value: "profile", label: "Profile Plane", icon: "profilePlane" }, { value: "offset", label: "Offset", icon: "offsetStart" }, { value: "object", label: "Object", icon: "objectStart", disabled: true }] },
      { id: "startOffset", type: "value", label: "Offset", kind: "length", default: "0.00 mm", visible: (v) => v.startType === "offset" },
      { id: "dirType", type: "dropdown", label: "Direction", options: DIRECTIONS },
      { id: "symMeasure", type: "buttons", label: "Measurement", options: [{ value: "half", label: "Half Length", icon: "halfLength" }, { value: "whole", label: "Whole Length", icon: "wholeLength" }], visible: (v) => v.dirType === "sym" },
      {
        id: "side1", type: "group", label: "Side 1", header: (v) => v.dirType === "two",
        rows: [
          { id: "extent", type: "dropdown", label: "Extent Type", options: EXTENTS },
          { id: "flip", type: "buttons", label: "Flip", options: [{ value: false, label: "Default direction", icon: "oneSide" }, { value: true, label: "Flip direction", icon: "flip" }], default: false, visible: (v) => v.extent === "all" && v.dirType === "one" },
          { id: "distance", type: "value", label: "Distance", kind: "length", default: "0.00 mm", visible: (v) => v.extent !== "all", tooltip: "Specify distance to extrude." },
          { id: "taper", type: "value", label: "Taper Angle", kind: "angle", default: "0.0 deg", visible: (v) => v.dirType !== "sym", tooltip: "Specify angle to taper extrusion." },
        ],
      },
      {
        id: "side2", type: "group", label: "Side 2", visible: (v) => v.dirType === "two",
        rows: [
          { id: "extent2", type: "dropdown", label: "Extent Type", options: EXTENTS },
          { id: "distance2", type: "value", label: "Distance", kind: "length", default: "0.00 mm", nonNegative: true, visible: (v) => v.extent2 !== "all" },
          { id: "taper2", type: "value", label: "Taper Angle", kind: "angle", default: "0.0 deg" },
        ],
      },
      { id: "operation", type: "dropdown", label: "Operation", options: OPERATIONS, default: "new", sep: true },
    ],
    init(dlg) {
      if (f0) {
        const st = dlg.baseState;
        Object.assign(dlg.values, {
          profiles: [...profileSelRefs(f0.profiles), ...(f0.faces || []).map((fr) => U.faceRef(st, fr.body, fr.p, fr.n))],
          startType: f0.startType === "offset" ? "offset" : "profile",
          startOffset: f0.startOffset ?? "0.00 mm",
          dirType: f0.dirType || "one",
          symMeasure: f0.symMeasure || "half",
          extent: f0.extent || "distance",
          flip: !!f0.flip,
          distance: f0.distance ?? "10 mm",
          taper: f0.taper ?? "0.0 deg",
          extent2: f0.extent2 || f0.extent || "distance",
          distance2: f0.distance2 ?? "10 mm",
          taper2: f0.taper2 ?? "0.0 deg",
          operation: f0.operation || "new",
        });
        dlg.touched.add("operation");
      } else if (!(opts.preselect || []).length) {
        const all = U.visibleProfiles(app, dlg.baseState);
        if (all.length === 1) dlg.values.profiles = all;
      }
      if (opts.values) Object.assign(dlg.values, opts.values);
    },
    onOpen(dlg) { extrudeAutoOp(dlg); },
    onChange(id, dlg) {
      if (["profiles", "distance", "dirType", "flip", "extent", "startType", "startOffset"].includes(id)) extrudeAutoOp(dlg);
    },
    prompt(dlg) {
      if (!(dlg.values.profiles || []).length) return "Select sketch profiles or planar faces to extrude";
      return "";
    },
    status: (dlg) => profileStatus(dlg, dlg.values.profiles),
    validate(dlg) {
      const v = dlg.values;
      if (v.extent !== "all" && Math.abs(dlg.num("distance") || 0) < 1e-9) return "Distance is zero";
      if (v.dirType === "two" && v.extent2 !== "all" && Math.abs(dlg.num("distance2") || 0) < 1e-9) return "Distance is zero";
      return null;
    },
    build(v, dlg) {
      const profiles = profileRefsOf(v.profiles);
      const faces = faceRefsOf(v.profiles);
      if (!profiles.length && !faces.length) return null;
      // a zero distance has nothing to show (Fusion keeps OK disabled until the distance is set)
      if (v.extent !== "all" && Math.abs(dlg.num("distance") || 0) < 1e-9 && !(v.dirType === "two" && Math.abs(dlg.num("distance2") || 0) > 1e-9)) return null;
      const f = {
        type: "extrude",
        profiles,
        faces,
        dirType: v.dirType,
        extent: v.extent === "all" ? "all" : "distance",
        distance: v.distance,
        taper: v.taper,
        startType: v.startType === "offset" ? "offset" : "profile",
        operation: v.operation,
        flip: !!v.flip,
      };
      if (f.startType === "offset") f.startOffset = v.startOffset;
      if (v.dirType === "sym") f.symMeasure = v.symMeasure;
      if (v.dirType === "two") { f.distance2 = v.distance2; f.taper2 = v.taper2; f.extent2 = v.extent2 === "all" ? "all" : "distance"; }
      if (faces.length && (v.operation === "join" || v.operation === "cut")) f.bodies = bodyIdsOf(v.profiles.filter((r) => r.kind === "face"));
      return f;
    },
    manipulators(dlg) {
      const v = dlg.values;
      const a = extrudeAnchor(dlg);
      if (!a) return [];
      const off = v.startType === "offset" && !a.face ? dlg.num("startOffset") || 0 : 0;
      const o = V.add(a.o, V.mul(a.n, off));
      const out = [];
      const sc = v.dirType === "sym" && v.symMeasure === "whole" ? 0.5 : 1;
      const dist = v.extent !== "all" ? dlg.valueManip("distance", { origin: o, dir: a.n, scale: sc }) : null;
      const base = dist ? V.add(o, V.mul(a.n, dist.value * sc)) : o;
      if (dist) out.push(dist);
      if (v.dirType !== "sym") {
        const d = dlg.num("distance");
        const up = V.mul(a.n, (Number.isFinite(d) && d < 0) || (v.extent === "all" && v.flip) ? -1 : 1);
        out.push(dlg.taperManip("taper", { center: o, up, side: sideDir(a), hudAnchor: base }));
      }
      if (v.dirType === "two" && v.extent2 !== "all") out.push(dlg.valueManip("distance2", { origin: o, dir: V.mul(a.n, -1), min: 0 }));
      return out.filter(Boolean);
    },
    commit(f, dlg) {
      const hide = editId ? [] : [...new Set((f.profiles || []).map((p) => p.sketch))];
      return dlg.commitFeature(f, { hideSketches: hide });
    },
  });
}

// ------------------------------------------------------------------ Revolve
function revolveAutoOp(dlg) {
  if (dlg.touched.has("operation")) return;
  const a = U.profilesAnchor(dlg.baseState, dlg.values.profiles || []);
  if (!a) return;
  const op = U.autoOperation(dlg.app, dlg.baseState, a.o, [a.n, V.mul(a.n, -1)]);
  if (op !== dlg.values.operation) dlg.set("operation", op, { noPreview: true });
}

export function openRevolve(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "Revolve",
    title: "Revolve",
    icon: "Revolve",
    editId,
    help: "Revolves a sketch profile or planar face around a selected axis.",
    preselect: opts.preselect,
    ctrlWidth: 118,
    rows: [
      { id: "profiles", type: "selection", label: "Profile", kinds: ["profile"], prompt: "Select sketch profiles or planar faces to revolve", tooltip: "Select coplanar sketch profiles or faces to revolve." },
      { id: "axis", type: "selection", label: "Axis", kinds: ["originAxis", "sketchCurve", "edge"], max: 1, prompt: "Select a sketch line, edge or axis to revolve around", filter: (r, dlg) => (r.kind === "sketchCurve" ? U.sketchLineFilter(dlg.baseState)(r) : r.kind === "edge" ? U.isLinearEdge(dlg.baseState, r) : true), tooltip: "Select a linear or circular object to define the axis to revolve the profile around." },
      { id: "projectAxis", type: "check", label: "Project Axis", default: true, tooltip: "Projects the axis to the same sketch plane as the selected profile." },
      { id: "revType", type: "dropdown", label: "Extent Type", options: [{ value: "angle", label: "Angle", icon: "revAngle" }, { value: "to", label: "To", icon: "toObject", disabled: true }, { value: "full", label: "Full", icon: "revFull" }] },
      { id: "dirType", type: "dropdown", label: "Direction", options: DIRECTIONS, visible: (v) => v.revType !== "full" },
      { id: "angle", type: "value", label: "Angle", kind: "angle", default: "360.0 deg", visible: (v) => v.revType !== "full" },
      { id: "angle2", type: "value", label: "Angle", kind: "angle", default: "90.0 deg", visible: (v) => v.revType !== "full" && v.dirType === "two" },
      { id: "operation", type: "dropdown", label: "Operation", options: OPERATIONS, default: "new", sep: true },
    ],
    init(dlg) {
      if (f0) {
        Object.assign(dlg.values, {
          profiles: profileSelRefs(f0.profiles),
          axis: [U.refFromAxis(f0.axis, dlg.baseState)].filter(Boolean),
          revType: f0.revType === "full" ? "full" : "angle",
          dirType: f0.dirType || "one",
          angle: f0.angle ?? "360.0 deg",
          angle2: f0.angle2 ?? "90.0 deg",
          operation: f0.operation || "new",
        });
        dlg.touched.add("operation");
      } else if (!(opts.preselect || []).length) {
        const all = U.visibleProfiles(app, dlg.baseState);
        if (all.length === 1) dlg.values.profiles = all;
      }
    },
    onOpen(dlg) { revolveAutoOp(dlg); },
    onChange(id, dlg) { if (id === "profiles") revolveAutoOp(dlg); },
    status: (dlg) => profileStatus(dlg, dlg.values.profiles),
    build(v) {
      const profiles = profileRefsOf(v.profiles);
      const axis = U.axisFromRef((v.axis || [])[0]);
      if (!profiles.length || !axis) return null;
      const f = { type: "revolve", profiles, axis, revType: v.revType === "full" ? "full" : "angle", angle: v.angle, dirType: v.dirType, operation: v.operation };
      if (v.dirType === "two") f.angle2 = v.angle2;
      return f;
    },
    manipulators(dlg) {
      const v = dlg.values;
      if (v.revType === "full") return [];
      const a = U.profilesAnchor(dlg.baseState, v.profiles || []);
      const ln = U.axisLine((v.axis || [])[0], dlg.baseState);
      if (!a || !ln) return [];
      const k = V.norm(ln.d);
      const w = V.sub(a.o, ln.o);
      const center = V.add(ln.o, V.mul(k, V.dot(w, k)));
      const rv = V.sub(a.o, center);
      const radius = V.len(rv);
      if (radius < 1e-6) return [];
      const ref = V.mul(rv, 1 / radius);
      const out = [];
      if (v.dirType === "sym") {
        out.push(dlg.angleManip("angle", { center, axis: k, ref, radius, min: -360, max: 360, hudAnchor: a.o }));
        if (out[0]) { const half = out[0].value / 2; out[0].value = half; const od = out[0].onDrag; out[0].onDrag = (x, f) => od(x * 2, f); }
      } else {
        out.push(dlg.angleManip("angle", { center, axis: k, ref, radius, min: -360, max: 360, hudAnchor: a.o }));
        if (v.dirType === "two") out.push(dlg.angleManip("angle2", { center, axis: V.mul(k, -1), ref, radius, min: 0, max: 360, id: "angle2", hudAnchor: a.o }));
      }
      return out.filter(Boolean);
    },
    commit(f, dlg) {
      const hide = editId ? [] : [...new Set((f.profiles || []).map((p) => p.sketch))];
      return dlg.commitFeature(f, { hideSketches: hide });
    },
  });
}

// ------------------------------------------------------------------ Press Pull
/** Face press pull: offsets planar faces (an extrude of the faces that joins or cuts). */
export function openPressPullFace(app, opts = {}) {
  const editId = opts.editId || null;
  return app.ui.dialog.open({
    id: "FusionPressPullCommand",
    title: "Press Pull",
    icon: "FusionPressPullCommand",
    featureLabel: "Press Pull",
    editId,
    help: "Modifies the selected geometry using offset, extrude, or fillet commands. The operation depends on the geometry selected.",
    preselect: opts.preselect,
    ctrlWidth: 118,
    rows: [
      { id: "faces", type: "selection", label: "Faces", kinds: ["face"], planar: true, prompt: "Select faces to offset" },
      { id: "distance", type: "value", label: "Distance", kind: "length", default: "0.00 mm", tooltip: "Positive pulls the face out (adds material), negative pushes it in (removes material)." },
    ],
    init(dlg) {
      const f0 = editId ? app.feature(editId) : null;
      if (!f0) return;
      dlg.values.faces = (f0.faces || []).map((fr) => U.faceRef(dlg.baseState, fr.body, fr.p, fr.n));
      dlg.values.distance = f0.distance ?? "0.00 mm";
    },
    prompt(dlg) { return (dlg.values.faces || []).length ? "" : "Select faces to offset"; },
    status: (dlg) => profileStatus(dlg, dlg.values.faces),
    build(v, dlg) {
      const faces = faceRefsOf(v.faces);
      if (!faces.length) return null;
      const d = dlg.num("distance");
      if (!Number.isFinite(d) || Math.abs(d) < 1e-9) return null;
      return { type: "extrude", profiles: [], faces, dirType: "one", extent: "distance", distance: v.distance, operation: d >= 0 ? "join" : "cut", bodies: bodyIdsOf(v.faces), pressPull: true };
    },
    validate(dlg) { return Math.abs(dlg.num("distance") || 0) < 1e-9 ? "Distance is zero" : null; },
    manipulators(dlg) {
      const f = (dlg.values.faces || [])[0];
      if (!f) return [];
      return [dlg.valueManip("distance", { origin: f.p, dir: f.n, fixedDir: true })].filter(Boolean);
    },
  });
}

/** Q: route by the selected geometry like Fusion (face -> offset, edge -> fillet, profile -> extrude). */
export function runPressPull(app) {
  const pre = beginModelCommand(app);
  if (route(app, pre)) return;
  const dlg = app.ui.dialog.open({
    id: "FusionPressPullCommand",
    title: "Press Pull",
    icon: "FusionPressPullCommand",
    help: "Modifies the selected geometry using offset, extrude, or fillet commands. The operation depends on the geometry selected.",
    preview: false,
    ctrlWidth: 118,
    rows: [{ id: "sel", type: "selection", label: "Selection", kinds: ["face", "edge", "profile"], planar: true, max: 1, prompt: "Select a face, edge or profile" }],
    onChange(id, d) {
      if (id !== "sel" || !(d.values.sel || []).length) return;
      const refs = [...d.values.sel];
      setTimeout(() => { if (!d.closed) d.cancel(); route(app, refs); }, 0);
    },
    build: () => null,
  });
  return dlg;
}

function route(app, refs) {
  const faces = refs.filter((r) => r.kind === "face" && r.planar !== false);
  const edges = refs.filter((r) => r.kind === "edge");
  const profiles = refs.filter((r) => r.kind === "profile");
  if (profiles.length) { openExtrude(app, { preselect: profiles }); return true; }
  if (faces.length) { openPressPullFace(app, { preselect: faces }); return true; }
  if (edges.length) { openFillet(app, { preselect: edges }); return true; }
  return false;
}
