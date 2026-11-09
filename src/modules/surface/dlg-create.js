// SURFACE > CREATE dialogs: Extrude, Revolve, Sweep, Loft, Patch, Ruled, Offset, Thicken, Boundary Fill.
import * as U from "../dialogs/util.js";
import { DIRECTIONS, OPERATIONS, profileRefsOf, profileSelRefs, profileStatus } from "../dialogs/common.js";
import * as D from "./dlg-util.js";
import { fillCells } from "./features.js";
import { containsPoint } from "./occ.js";

const V = U.V;

const commitHiding = (dlg, f, sketches) => dlg.commitFeature(f, { hideSketches: dlg.editId ? [] : [...new Set(sketches.filter(Boolean))] });
const sketchesOf = (f) => [...(f.profiles || []).map((p) => p.sketch), ...(f.curves || []).map((c) => c.sketch)];
const edit = (app, opts) => (opts.editId ? app.feature(opts.editId) : null);

// ------------------------------------------------------------------ Extrude
export function openSurfExtrude(app, opts = {}) {
  const f0 = edit(app, opts);
  const EXTENTS = [{ value: "distance", label: "Distance", icon: "distance" }, { value: "to", label: "To Object", icon: "toObject", disabled: true }];
  return app.ui.dialog.open({
    id: "SurfaceExtrude", title: "Extrude", icon: "SurfaceExtrude", featureLabel: "Extrude", editId: opts.editId || null,
    help: "Extrudes profiles or sketch curves into surfaces.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "profile" || r.kind === "sketchCurve"),
    ctrlWidth: 118,
    rows: [
      { id: "profiles", type: "selection", label: "Profiles", kinds: ["profile", "sketchCurve"], prompt: "Select profiles or sketch curves to extrude", tooltip: "Select sketch profiles or open / closed sketch curves to extrude into a surface." },
      { id: "startType", type: "dropdown", label: "Start", options: [{ value: "profile", label: "Profile Plane", icon: "profilePlane" }, { value: "offset", label: "Offset", icon: "offsetStart" }] },
      { id: "startOffset", type: "value", label: "Offset", kind: "length", default: "0.00 mm", visible: (v) => v.startType === "offset" },
      { id: "dirType", type: "dropdown", label: "Direction", options: DIRECTIONS },
      { id: "symMeasure", type: "buttons", label: "Measurement", options: [{ value: "half", label: "Half Length", icon: "halfLength" }, { value: "whole", label: "Whole Length", icon: "wholeLength" }], visible: (v) => v.dirType === "sym" },
      {
        id: "side1", type: "group", label: "Side 1", header: (v) => v.dirType === "two",
        rows: [
          { id: "extent", type: "dropdown", label: "Extent Type", options: EXTENTS },
          { id: "distance", type: "value", label: "Distance", kind: "length", default: "10.00 mm", tooltip: "Specify distance to extrude." },
          { id: "taper", type: "value", label: "Taper Angle", kind: "angle", default: "0.0 deg", visible: (v) => v.dirType !== "sym", tooltip: "Specify angle to taper extrusion." },
        ],
      },
      {
        id: "side2", type: "group", label: "Side 2", visible: (v) => v.dirType === "two",
        rows: [
          { id: "distance2", type: "value", label: "Distance", kind: "length", default: "10.00 mm", nonNegative: true },
          { id: "taper2", type: "value", label: "Taper Angle", kind: "angle", default: "0.0 deg" },
        ],
      },
      { id: "operation", type: "dropdown", label: "Operation", options: D.SURFACE_OPS, default: "new", sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, {
        profiles: [...profileSelRefs(f0.profiles), ...D.curveSelRefs(f0.curves)],
        startType: f0.startType === "offset" ? "offset" : "profile", startOffset: f0.startOffset ?? "0.00 mm",
        dirType: f0.dirType || "one", symMeasure: f0.symMeasure || "half",
        distance: f0.distance ?? "10 mm", taper: f0.taper ?? "0.0 deg", distance2: f0.distance2 ?? "10 mm", taper2: f0.taper2 ?? "0.0 deg",
        operation: f0.operation || "new",
      });
    },
    status: (dlg) => profileStatus(dlg, dlg.values.profiles) || D.countStatus(dlg.values.profiles),
    validate(dlg) { return Math.abs(dlg.num("distance") || 0) < 1e-9 && !(dlg.values.dirType === "two" && Math.abs(dlg.num("distance2") || 0) > 1e-9) ? "Distance is zero" : null; },
    build(v, dlg) {
      const profiles = profileRefsOf(v.profiles), curves = D.curveRefsOf(v.profiles);
      if (!profiles.length && !curves.length) return null;
      if (Math.abs(dlg.num("distance") || 0) < 1e-9 && !(v.dirType === "two" && Math.abs(dlg.num("distance2") || 0) > 1e-9)) return null;
      const f = { type: "surfExtrude", profiles, curves, dirType: v.dirType, distance: v.distance, taper: v.taper, startType: v.startType === "offset" ? "offset" : "profile", operation: v.operation };
      if (f.startType === "offset") f.startOffset = v.startOffset;
      if (v.dirType === "sym") f.symMeasure = v.symMeasure;
      if (v.dirType === "two") { f.distance2 = v.distance2; f.taper2 = v.taper2; }
      return f;
    },
    manipulators(dlg) {
      const v = dlg.values;
      const a = D.selectionAnchor(app, dlg.baseState, v.profiles);
      if (!a || !a.n) return [];
      const off = v.startType === "offset" ? dlg.num("startOffset") || 0 : 0;
      const o = V.add(a.o, V.mul(a.n, off));
      const sc = v.dirType === "sym" && v.symMeasure === "whole" ? 0.5 : 1;
      const out = [dlg.valueManip("distance", { origin: o, dir: a.n, scale: sc })];
      if (v.dirType === "two") out.push(dlg.valueManip("distance2", { origin: o, dir: V.mul(a.n, -1), min: 0 }));
      return out.filter(Boolean);
    },
    commit: (f, dlg) => commitHiding(dlg, f, sketchesOf(f)),
  });
}

// ------------------------------------------------------------------ Revolve
export function openSurfRevolve(app, opts = {}) {
  const f0 = edit(app, opts);
  return app.ui.dialog.open({
    id: "SurfaceRevolve", title: "Revolve", icon: "SurfaceRevolve", featureLabel: "Revolve", editId: opts.editId || null,
    help: "Revolves a sketch profile or planar face around a selected axis.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "profile" || r.kind === "sketchCurve"),
    ctrlWidth: 118,
    rows: [
      { id: "profiles", type: "selection", label: "Profile", kinds: ["profile", "sketchCurve", "edge"], prompt: "Select profiles, sketch curves or edges to revolve", tooltip: "Select sketch profiles, sketch curves or edges to revolve into a surface." },
      { id: "axis", type: "selection", label: "Axis", kinds: ["originAxis", "sketchCurve", "edge"], max: 1, prompt: "Select a sketch line, edge or axis to revolve around", filter: (r, dlg) => (r.kind === "sketchCurve" ? U.sketchLineFilter(dlg.baseState)(r) : r.kind === "edge" ? U.isLinearEdge(dlg.baseState, r) : true), tooltip: "Select a linear object to define the axis to revolve the profile around." },
      { id: "projectAxis", type: "check", label: "Project Axis", default: true, tooltip: "Projects the axis to the same sketch plane as the selected profile." },
      { id: "revType", type: "dropdown", label: "Extent Type", options: [{ value: "angle", label: "Angle", icon: "revAngle" }, { value: "to", label: "To", icon: "toObject", disabled: true }, { value: "full", label: "Full", icon: "revFull" }] },
      { id: "dirType", type: "dropdown", label: "Direction", options: DIRECTIONS, visible: (v) => v.revType !== "full" },
      { id: "angle", type: "value", label: "Angle", kind: "angle", default: "360.0 deg", visible: (v) => v.revType !== "full" },
      { id: "angle2", type: "value", label: "Angle", kind: "angle", default: "90.0 deg", visible: (v) => v.revType !== "full" && v.dirType === "two" },
      { id: "operation", type: "dropdown", label: "Operation", options: D.SURFACE_OPS, default: "new", sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, {
        profiles: [...profileSelRefs(f0.profiles), ...D.curveSelRefs(f0.curves), ...D.edgeSelRefs(dlg.baseState, f0.edges)],
        axis: [U.refFromAxis(f0.axis, dlg.baseState)].filter(Boolean),
        revType: f0.revType === "full" ? "full" : "angle", dirType: f0.dirType || "one",
        angle: f0.angle ?? "360.0 deg", angle2: f0.angle2 ?? "90.0 deg", operation: f0.operation || "new",
      });
    },
    status: (dlg) => D.countStatus(dlg.values.profiles),
    build(v) {
      const profiles = profileRefsOf(v.profiles), curves = D.curveRefsOf(v.profiles), edges = D.edgeRefsOf(v.profiles);
      const axis = U.axisFromRef((v.axis || [])[0]);
      if ((!profiles.length && !curves.length && !edges.length) || !axis) return null;
      const f = { type: "surfRevolve", profiles, curves, edges, axis, revType: v.revType === "full" ? "full" : "angle", angle: v.angle, dirType: v.dirType, operation: v.operation };
      if (v.dirType === "two") f.angle2 = v.angle2;
      return f;
    },
    manipulators(dlg) {
      const v = dlg.values;
      if (v.revType === "full") return [];
      const a = D.selectionAnchor(app, dlg.baseState, v.profiles);
      const ln = U.axisLine((v.axis || [])[0], dlg.baseState);
      if (!a || !ln) return [];
      const k = V.norm(ln.d);
      const center = V.add(ln.o, V.mul(k, V.dot(V.sub(a.o, ln.o), k)));
      const rv = V.sub(a.o, center);
      const radius = V.len(rv);
      if (radius < 1e-6) return [];
      return [dlg.angleManip("angle", { center, axis: k, ref: V.mul(rv, 1 / radius), radius, min: -360, max: 360, hudAnchor: a.o })].filter(Boolean);
    },
    commit: (f, dlg) => commitHiding(dlg, f, sketchesOf(f)),
  });
}

// ------------------------------------------------------------------ Sweep
export function openSurfSweep(app, opts = {}) {
  const f0 = edit(app, opts);
  return app.ui.dialog.open({
    id: "SurfaceSweep", title: "Sweep", icon: "SurfaceSweep", featureLabel: "Sweep", editId: opts.editId || null,
    help: "Sweeps a sketch profile or curves along a selected path.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "profile").slice(0, 1),
    ctrlWidth: 118,
    rows: [
      { id: "type", type: "dropdown", label: "Type", options: [{ value: "single", label: "Single Path", icon: "singlePath" }, { value: "guide", label: "Path + Guide Rail", icon: "pathGuide", disabled: true }] },
      { id: "profiles", type: "selection", label: "Profile", kinds: ["profile", "sketchCurve", "edge"], prompt: "Select a profile, sketch curves or edges to sweep", filter: (r, dlg) => !(dlg.values.path || []).some((x) => x.kind === r.kind && x.sketch && x.sketch === r.sketch && x.curve === r.curve) },
      { id: "path", type: "selection", label: "Path", kinds: ["sketchCurve", "edge"], prompt: "Select connected sketch curves or edges for the path", mapRef: (r, dlg) => (dlg.values.chain !== false ? (r.kind === "sketchCurve" ? D.sketchChainRefs(app, dlg.baseState, r) : D.edgeChain(dlg.baseState, r.body, r.index, "tangent")) : r), filter: (r, dlg) => { const p = (dlg.values.path || [])[0]; return !p || p.kind !== r.kind || (r.kind === "sketchCurve" ? p.sketch === r.sketch : p.body === r.body); } },
      { id: "chain", type: "check", label: "Chain Selection", default: true, tooltip: "Automatically selects connected geometry." },
      { id: "distance", type: "value", label: "Distance", kind: "none", default: "1.00", min: 0, max: 1, step: 0.1, tooltip: "The distance for the sweep is a decimal percentage of the length of the path." },
      { id: "orientation", type: "dropdown", label: "Orientation", options: [{ value: "perpendicular", label: "Perpendicular", icon: "singlePath" }, { value: "parallel", label: "Parallel", icon: "fixedPlane" }] },
      { id: "operation", type: "dropdown", label: "Operation", options: D.SURFACE_OPS, default: "new", sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      Object.assign(dlg.values, {
        profiles: [...profileSelRefs(f0.profiles), ...D.curveSelRefs(f0.curves), ...D.edgeSelRefs(st, f0.edges)],
        path: [...((f0.path && f0.path.curves) || []).map((c) => ({ kind: "sketchCurve", sketch: f0.path.sketch, curve: c })), ...D.edgeSelRefs(st, f0.pathEdges)],
        distance: f0.distance ?? "1.00", orientation: f0.orientation || "perpendicular", operation: f0.operation || "new",
      });
    },
    status: (dlg) => D.countStatus(dlg.values.profiles),
    build(v) {
      const profiles = profileRefsOf(v.profiles), curves = D.curveRefsOf(v.profiles), edges = D.edgeRefsOf(v.profiles);
      const pc = (v.path || []).filter((r) => r.kind === "sketchCurve"), pe = D.edgeRefsOf(v.path);
      if ((!profiles.length && !curves.length && !edges.length) || (!pc.length && !pe.length)) return null;
      const f = { type: "surfSweep", profiles, curves, edges, distance: v.distance, orientation: v.orientation, operation: v.operation };
      if (pc.length) f.path = { sketch: pc[0].sketch, curves: pc.map((r) => r.curve) };
      if (pe.length) f.pathEdges = pe;
      return f;
    },
    commit: (f, dlg) => commitHiding(dlg, f, [...sketchesOf(f), f.path && f.path.sketch]),
  });
}

// ------------------------------------------------------------------ Loft
/** Loft sections from the selection, in pick order: profiles, sketch-curve chains (per sketch), edge chains (per body). */
function loftSections(list) {
  const out = [];
  const bySketch = new Map(), byBody = new Map();
  for (const r of list || []) {
    if (r.kind === "profile") out.push({ profile: { sketch: r.sketch, key: r.key, c: r.c } });
    else if (r.kind === "sketchCurve") {
      if (!bySketch.has(r.sketch)) { const s = { sketch: r.sketch, curves: [] }; bySketch.set(r.sketch, s); out.push(s); }
      if (!bySketch.get(r.sketch).curves.includes(r.curve)) bySketch.get(r.sketch).curves.push(r.curve);
    } else if (r.kind === "edge") {
      if (!byBody.has(r.body)) { const s = { edges: [] }; byBody.set(r.body, s); out.push(s); }
      byBody.get(r.body).edges.push({ body: r.body, p: r.p });
    }
  }
  return out;
}
export function openSurfLoft(app, opts = {}) {
  const f0 = edit(app, opts);
  return app.ui.dialog.open({
    id: "SurfaceLoft", title: "Loft", icon: "SurfaceLoft", featureLabel: "Loft", editId: opts.editId || null,
    help: "Lofts a surface between two or more profiles, sketch curves or edges.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "profile"),
    rows: [
      { id: "profiles", type: "selection", label: "Profiles", kinds: ["profile", "sketchCurve", "edge"], min: 2, prompt: "Select two or more profiles, sketch curves or edges", mapRef: (r, dlg) => (dlg.values.chain !== false ? (r.kind === "sketchCurve" ? D.sketchChainRefs(app, dlg.baseState, r) : r.kind === "edge" ? D.edgeChain(dlg.baseState, r.body, r.index, "tangent") : r) : r) },
      { id: "chain", type: "check", label: "Chain Selection", default: true },
      { id: "ruled", type: "check", label: "Ruled" },
      { id: "closed", type: "check", label: "Closed", tooltip: "Connects the last profile back to the first one." },
      { id: "operation", type: "dropdown", label: "Operation", options: D.SURFACE_OPS, default: "new", sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      const refs = [];
      for (const s of f0.sections || []) {
        if (s.profile) refs.push(...profileSelRefs([s.profile]));
        else if (s.edges) refs.push(...D.edgeSelRefs(st, s.edges));
        else refs.push(...(s.curves || []).map((c) => ({ kind: "sketchCurve", sketch: s.sketch, curve: c })));
      }
      Object.assign(dlg.values, { profiles: refs, ruled: !!f0.ruled, closed: !!f0.closed, operation: f0.operation || "new" });
    },
    status: (dlg) => D.countStatus(dlg.values.profiles),
    build(v) {
      const sections = loftSections(v.profiles);
      if (sections.length < 2) return null;
      return { type: "surfLoft", sections, ruled: !!v.ruled, closed: !!v.closed, operation: v.operation };
    },
    commit: (f, dlg) => commitHiding(dlg, f, f.sections.map((s) => (s.profile ? s.profile.sketch : s.sketch))),
  });
}

// ------------------------------------------------------------------ Patch
export function openPatch(app, opts = {}) {
  const f0 = edit(app, opts);
  return app.ui.dialog.open({
    id: "FusionSurfacePatchCommand", title: "Patch", icon: "FusionSurfacePatchCommand", featureLabel: "Patch", editId: opts.editId || null,
    help: "Creates a planar or 3D surface within the boundary of a specified closed loop.",
    preselect: (opts.preselect || []).filter((r) => ["profile", "sketchCurve", "edge"].includes(r.kind)),
    rows: [
      { id: "boundary", type: "selection", label: "Boundary Edges", kinds: ["edge", "sketchCurve", "profile"], prompt: "Select edges, sketch profiles or sketch curves to define patch boundary", mapRef: (r, dlg) => (dlg.values.chain !== false ? (r.kind === "sketchCurve" ? D.sketchChainRefs(app, dlg.baseState, r) : r.kind === "edge" ? D.edgeChain(dlg.baseState, r.body, r.index, "free") : r) : r), tooltip: "Select a closed loop of edges or sketch curves, or a sketch profile." },
      { id: "chain", type: "check", label: "Chain Selection", default: true, tooltip: "Automatically selects connected edges." },
      { id: "continuity", type: "dropdown", label: "Continuity", options: [{ value: "G0", label: "Connected (G0)", icon: "free" }, { value: "G1", label: "Tangent (G1)", icon: "tangentG1" }, { value: "G2", label: "Curvature (G2)", icon: "tangentG1" }], tooltip: "Continuity with the faces of the boundary edges." },
      { id: "interior", type: "selection", label: "Interior Rails/Points", kinds: ["sketchCurve", "sketchPoint"], min: 0, prompt: "Select edges, sketch curves or points to define patch interior constraints" },
      { id: "operation", type: "dropdown", label: "Operation", options: D.SURFACE_OPS, default: "new", sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, {
        boundary: [...D.edgeSelRefs(dlg.baseState, f0.edges), ...D.curveSelRefs(f0.curves), ...profileSelRefs(f0.profiles)],
        continuity: f0.continuity || "G0",
        interior: [...D.curveSelRefs(f0.interiorCurves), ...(f0.interiorPoints || []).map((p) => ({ kind: "sketchPoint", sketch: p.sketch, point: p.point }))],
        operation: f0.operation || "new",
      });
    },
    status: (dlg) => D.countStatus(dlg.values.boundary),
    build(v) {
      const edges = D.edgeRefsOf(v.boundary), curves = D.curveRefsOf(v.boundary), profiles = profileRefsOf(v.boundary);
      if (!edges.length && !curves.length && !profiles.length) return null;
      return {
        type: "surfPatch", edges, curves, profiles, continuity: v.continuity || "G0",
        interiorCurves: D.curveRefsOf(v.interior),
        interiorPoints: (v.interior || []).filter((r) => r.kind === "sketchPoint").map((r) => ({ sketch: r.sketch, point: r.point })),
        operation: v.operation,
      };
    },
    commit: (f, dlg) => dlg.commitFeature(f),
  });
}

// ------------------------------------------------------------------ Ruled
export function openRuled(app, opts = {}) {
  const f0 = edit(app, opts);
  const dirKinds = ["originPlane", "cplane", "face", "originAxis", "sketchCurve", "edge"];
  return app.ui.dialog.open({
    id: "FusionSurfaceRuledCommand", title: "Ruled", icon: "FusionSurfaceRuledCommand", featureLabel: "Ruled", editId: opts.editId || null,
    help: "Creates a ruled surface at a specified distance and angle from selected edges.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "edge" || r.kind === "sketchCurve"),
    rows: [
      { id: "ruledType", type: "dropdown", label: "Type", options: [{ value: "normal", label: "Normal", icon: "distance" }, { value: "tangent", label: "Tangent", icon: "tangentG1" }, { value: "direction", label: "Direction", icon: "translate" }], default: "tangent", tooltip: "Normal, tangent to the face of the selected edges, or in a direction that you select." },
      { id: "edges", type: "selection", label: "Edges", kinds: ["edge", "sketchCurve"], prompt: "Select edges", mapRef: (r, dlg) => (dlg.values.chain !== false ? (r.kind === "edge" ? D.edgeChain(dlg.baseState, r.body, r.index, "tangent") : D.sketchChainRefs(app, dlg.baseState, r)) : r), tooltip: "Select edges." },
      { id: "chain", type: "check", label: "Chain Selection", default: true, tooltip: "Automatically select connected geometry." },
      { id: "direction", type: "selection", label: "Direction", kinds: dirKinds, max: 1, planar: true, visible: (v) => v.ruledType === "direction", prompt: "Select a linear edge, plane or axis for direction", filter: (r, dlg) => (r.kind === "sketchCurve" ? U.sketchLineFilter(dlg.baseState)(r) : r.kind === "edge" ? U.isLinearEdge(dlg.baseState, r) : true), tooltip: "Select a linear edge, plane, or axis." },
      { id: "distance", type: "value", label: "Distance", kind: "length", default: "10.00 mm", tooltip: "Specify distance to extend." },
      { id: "angle", type: "value", label: "Angle", kind: "angle", default: "0.0 deg", tooltip: "Specify rotation angle." },
      { id: "alternate", type: "check", label: "Alternate Faces", tooltip: "Flips direction or angle when edges share more than one face." },
      { id: "mitered", type: "check", label: "Mitered Corners", tooltip: "Creates sharp corners instead of rounded corners." },
      { id: "operation", type: "dropdown", label: "Operation", options: D.SURFACE_OPS, default: "new", sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      let dir = [];
      if (f0.direction && f0.direction.plane) dir = [U.refFromPlaneRef(f0.direction.plane, st)];
      else if (f0.direction && f0.direction.axis) dir = [U.refFromAxis(f0.direction.axis, st)];
      Object.assign(dlg.values, {
        ruledType: f0.ruledType || "tangent", edges: [...D.edgeSelRefs(st, f0.edges), ...D.curveSelRefs(f0.curves)], direction: dir.filter(Boolean),
        distance: f0.distance ?? "10 mm", angle: f0.angle ?? "0.0 deg", alternate: !!f0.alternate, mitered: !!f0.mitered, operation: f0.operation || "new",
      });
    },
    prompt: (dlg) => ((dlg.values.edges || []).length ? "Adjust distance and angle or modify selection" : "Select edges"),
    status: (dlg) => D.countStatus(dlg.values.edges),
    build(v) {
      const edges = D.edgeRefsOf(v.edges), curves = D.curveRefsOf(v.edges);
      if (!edges.length && !curves.length) return null;
      const f = { type: "surfRuled", ruledType: v.ruledType, edges, curves, distance: v.distance, angle: v.angle, alternate: !!v.alternate, mitered: !!v.mitered, operation: v.operation };
      if (v.ruledType === "direction") {
        const r = (v.direction || [])[0];
        if (!r) return null;
        const pr = U.planeRefFromRef(r);
        f.direction = pr ? { plane: pr } : { axis: U.axisFromRef(r) };
      }
      return f;
    },
    manipulators(dlg) {
      const r = (dlg.values.edges || [])[0];
      if (!r || r.kind !== "edge") return [];
      const ns = U.edgeFaceNormals(dlg.baseState.bodies.get(r.body)?.shape, r.index, r.p) || [];
      const n = ns[0];
      if (!n) return [];
      return [dlg.valueManip("distance", { origin: r.p, dir: n })].filter(Boolean);
    },
    commit: (f, dlg) => commitHiding(dlg, f, (f.curves || []).map((c) => c.sketch)),
  });
}

// ------------------------------------------------------------------ Offset / Thicken
/** Faces / Surface Bodies row: faces (chain selection of tangent faces) or browser bodies. */
const facesRow = (app, prompt) => ({
  id: "faces", type: "selection", label: "Faces / Surface Bodies", kinds: ["face", "body"], prompt,
  mapRef: (r, dlg) => (r.kind === "face" && dlg.values.chain !== false ? D.faceChain(dlg.baseState, r.body, r.index) : r),
});
function sourcesOf(list) {
  return { faces: D.faceRefsOf(list), surfaces: [...new Set((list || []).filter((r) => r.kind === "body").map((r) => r.body))] };
}
const sourceRefs = (st, f) => [...D.faceSelRefs(st, f.faces), ...D.bodySelRefs(f.surfaces)];
function sourceAnchor(dlg) {
  const r = (dlg.values.faces || []).find((x) => x.kind === "face");
  return r && r.n ? { o: r.p, n: r.n } : null;
}
export function openSurfOffset(app, opts = {}) {
  const f0 = edit(app, opts);
  return app.ui.dialog.open({
    id: "FusionSurfaceOffsetCommand", title: "Offset", icon: "FusionSurfaceOffsetCommand", featureLabel: "Offset", editId: opts.editId || null,
    help: "Creates a new surface body at a given distance from the selected face or surface body.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "face" || r.kind === "body"),
    rows: [
      facesRow(app, "Select faces or surface bodies to offset"),
      { id: "chain", type: "check", label: "Chain Selection", default: true, tooltip: "Automatically select connected geometry." },
      { id: "offsetType", type: "dropdown", label: "Offset Type", options: [{ value: "sharp", label: "Sharp Offset", icon: "sharpShell" }, { value: "rounded", label: "Rounded Offset", icon: "roundedShell" }], tooltip: "Creates sharp or rounded offset corners." },
      { id: "distance", type: "value", label: "Distance", kind: "length", default: "1.00 mm" },
      { id: "operation", type: "dropdown", label: "Operation", options: D.ops("new", "newComponent"), default: "new", sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, { faces: sourceRefs(dlg.baseState, f0), offsetType: f0.offsetType || "sharp", distance: f0.distance ?? "1 mm", operation: f0.operation || "new" });
    },
    status: (dlg) => D.countStatus(dlg.values.faces),
    validate: (dlg) => (Math.abs(dlg.num("distance") || 0) < 1e-9 ? "Distance is zero" : null),
    build(v, dlg) {
      const s = sourcesOf(v.faces);
      if (!s.faces.length && !s.surfaces.length) return null;
      if (Math.abs(dlg.num("distance") || 0) < 1e-9) return null;
      return { type: "surfOffset", ...s, offsetType: v.offsetType, distance: v.distance, operation: v.operation };
    },
    manipulators(dlg) {
      const a = sourceAnchor(dlg);
      return a ? [dlg.valueManip("distance", { origin: a.o, dir: a.n })].filter(Boolean) : [];
    },
  });
}
export function openThicken(app, opts = {}) {
  const f0 = edit(app, opts);
  return app.ui.dialog.open({
    id: "FusionSurfaceThickenCommand", title: "Thicken", icon: "FusionSurfaceThickenCommand", featureLabel: "Thicken", editId: opts.editId || null,
    help: "Adds thickness to surface faces to create a solid body.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "face" || r.kind === "body"),
    rows: [
      { ...facesRow(app, "Select Surfaces to Thicken"), tooltip: "Select faces/surface bodies to thicken" },
      { id: "chain", type: "check", label: "Chain Selection", default: true, tooltip: "Automatically select connected geometry." },
      { id: "thickness", type: "value", label: "Thickness", kind: "length", default: "1.00 mm", tooltip: "Specify thickness value for surface." },
      { id: "thickenType", type: "dropdown", label: "Thicken Type", options: [{ value: "sharp", label: "Sharp Thicken", icon: "sharpShell" }, { value: "rounded", label: "Rounded Thicken", icon: "roundedShell" }] },
      { id: "direction", type: "dropdown", label: "Direction", options: DIRECTIONS.filter((o) => o.value !== "two") },
      { id: "operation", type: "dropdown", label: "Operation", options: OPERATIONS, default: "new", sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, { faces: sourceRefs(dlg.baseState, f0), thickness: f0.thickness ?? "1 mm", thickenType: f0.thickenType || "sharp", direction: f0.direction || "one", operation: f0.operation || "new" });
    },
    status: (dlg) => D.countStatus(dlg.values.faces),
    validate: (dlg) => (Math.abs(dlg.num("thickness") || 0) < 1e-9 ? "Thickness is zero" : null),
    build(v, dlg) {
      const s = sourcesOf(v.faces);
      if (!s.faces.length && !s.surfaces.length) return null;
      if (Math.abs(dlg.num("thickness") || 0) < 1e-9) return null;
      return { type: "surfThicken", ...s, thickness: v.thickness, thickenType: v.thickenType, direction: v.direction === "sym" ? "sym" : "one", operation: v.operation };
    },
    manipulators(dlg) {
      const a = sourceAnchor(dlg);
      return a ? [dlg.valueManip("thickness", { origin: a.o, dir: a.n })].filter(Boolean) : [];
    },
  });
}

// ------------------------------------------------------------------ Boundary Fill
const CELL_COLORS = { on: "#3d8bff", off: "#9aa4b2" };
export function openBoundaryFill(app, opts = {}) {
  const f0 = edit(app, opts);
  let cache = { key: "", cells: [] };
  const toolsKey = (v) => JSON.stringify(v.tools || []); // the whole refs: unnamed planes must not share a key
  /** Cells of the current tools in the base state (cached per tool set). */
  const cellsOf = (dlg) => {
    const key = toolsKey(dlg.values);
    if (cache.key === key) return cache.cells;
    for (const c of cache.cells) app.K.del(c.shape);
    let cells = [];
    const f = toolFeature(dlg.values);
    if (f.tools.length || f.planes.length) { try { cells = fillCells(dlg.baseState, f); } catch (e) { cells = []; dlg.message(e.message || String(e), "error"); } }
    cache = { key, cells };
    return cells;
  };
  const toolFeature = (v) => ({
    tools: [...new Set((v.tools || []).filter((r) => r.kind === "body" || r.kind === "face").map((r) => r.body))],
    planes: (v.tools || []).filter((r) => r.kind === "originPlane" || r.kind === "cplane").map((r) => U.planeRefFromRef(r)),
  });
  const chosen = (dlg) => new Set((dlg.values.cellIdx || []));
  const cellItems = (dlg) => {
    const on = chosen(dlg);
    return cellsOf(dlg).map((c, i) => ({ shape: c.shape, color: on.has(i) ? CELL_COLORS.on : CELL_COLORS.off, opacity: on.has(i) ? 0.35 : 0.1 }));
  };
  const toggleCell = (dlg, i) => {
    const s = chosen(dlg);
    if (s.has(i)) s.delete(i); else s.add(i);
    dlg.set("cellIdx", [...s].sort((a, b) => a - b), { user: true });
  };
  return app.ui.dialog.open({
    id: "SurfaceSculpt", title: "Boundary Fill", icon: "SurfaceSculpt", featureLabel: "Boundary Fill", editId: opts.editId || null,
    help: "Creates, joins or removes volumes using bounding volumes formed by tool selections.",
    preselect: (opts.preselect || []).filter((r) => ["body", "face", "originPlane", "cplane"].includes(r.kind)),
    rows: [
      { id: "tools", type: "selection", label: "Select Tools", kinds: ["body", "face", "originPlane", "cplane"], mapRef: (r) => (r.kind === "face" ? { kind: "body", body: r.body } : r), prompt: "Select solids, surfaces or planes as tools", advance: false, tooltip: "Select solids, surfaces or workplanes as tools to form volumes (or cells)." },
      { id: "cellIdx", type: "custom", label: "Select Cells", default: [],
        render(dlg) {
          const box = D.el("div", "srf-cells");
          box.dataset.input = "cells";
          // working in the cell list: canvas clicks pick cells (the tools row button picks tools again)
          box.addEventListener("pointerdown", () => { if (dlg.active) dlg.activate(null); });
          return box;
        },
        update(box, dlg) {
          const cells = cellsOf(dlg);
          const on = chosen(dlg);
          box.textContent = "";
          const head = D.el("div", "srf-cells-head", cells.length ? `Cells (${on.size} of ${cells.length} selected)` : "No cells: select tools that enclose volumes");
          box.appendChild(head);
          cells.forEach((c, i) => {
            const row = D.el("label", "srf-cell");
            const cb = D.el("input");
            cb.type = "checkbox";
            cb.checked = on.has(i);
            cb.dataset.cell = String(i);
            cb.addEventListener("change", () => toggleCell(dlg, i));
            row.append(cb, D.el("span", "", `Cell ${i + 1}`), D.el("span", "srf-cell-vol", `${c.volume.toFixed(1)} mm^3`));
            box.appendChild(row);
          });
        },
      },
      { id: "removeTools", type: "check", label: "Remove Tools", default: true },
      { id: "operation", type: "dropdown", label: "Operation", options: OPERATIONS, default: "new", sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      Object.assign(dlg.values, {
        tools: [...D.bodySelRefs(f0.tools), ...(f0.planes || []).map((p) => U.refFromPlaneRef(p, st)).filter(Boolean)],
        removeTools: !!f0.removeTools, operation: f0.operation || "new",
      });
      const cells = cellsOf(dlg);
      dlg.values.cellIdx = cells.map((c, i) => ((f0.cells || []).some((x) => x && x.p && containsPoint(c.shape, x.p)) ? i : -1)).filter((i) => i >= 0);
    },
    onChange(id, dlg) { if (id === "tools") dlg.values.cellIdx = []; },
    activate: (dlg) => ((dlg.values.tools || []).length ? false : "tools"),
    prompt: (dlg) => (!(dlg.values.tools || []).length ? "Select solids, surfaces or planes as tools" : dlg.active === "tools" ? "Select more tools, or check the cells to fill" : "Select the cells to fill"),
    onCanvasDown(ctx, dlg) {
      // clicks on a cell toggle it (cells are drawn see-through over the tools)
      if (dlg.active === "tools") return false;
      const cells = cellsOf(dlg);
      if (!cells.length || !ctx.ray) return false;
      const hit = D.rayPick(app, cells.map((c) => c.shape), ctx.ray);
      if (!hit) return false;
      toggleCell(dlg, hit.i);
      return true;
    },
    extraPreview(dlg) { return cellItems(dlg); },
    afterPreview(dlg) {
      // no feature yet (no cell chosen): still show the cells so they can be picked
      if (!dlg.feature) { try { app.viewport.setPreview(cellItems(dlg)); } catch (e) { console.error(e); } }
    },
    validate: (dlg) => (!(dlg.values.cellIdx || []).length ? "Select the cells to fill" : null),
    status: (dlg) => { const n = (dlg.values.cellIdx || []).length; return n ? `${n} Cell${n > 1 ? "s" : ""}` : ""; },
    build(v, dlg) {
      const t = toolFeature(v);
      if (!t.tools.length && !t.planes.length) return null;
      const cells = cellsOf(dlg);
      const pts = (v.cellIdx || []).map((i) => cells[i]).filter(Boolean).map((c) => ({ p: c.p.map((x) => Math.round(x * 1e6) / 1e6) }));
      if (!pts.length) return null;
      return { type: "surfBoundaryFill", ...t, cells: pts, removeTools: !!v.removeTools, operation: v.operation };
    },
    onClose() { for (const c of cache.cells) app.K.del(c.shape); cache = { key: "", cells: [] }; },
  });
}
