// Shared bits for the modelling commands.
import * as U from "./util.js";

export const PATTERN_TYPES = [
  { value: "features", label: "Features", icon: "features", disabled: true },
  { value: "bodies", label: "Bodies", icon: "bodies" },
  { value: "faces", label: "Faces", icon: "faces", disabled: true },
  { value: "components", label: "Components", icon: "components", disabled: true },
];
/** Rectangular / Circular Pattern: Features can be patterned too (model.js patternFeatures). */
export const PATTERN_FEATURE_TYPES = PATTERN_TYPES.map((o) => (o.value === "features" ? { ...o, disabled: false } : o));
export const OPERATIONS = [
  { value: "join", label: "Join", icon: "join" },
  { value: "cut", label: "Cut", icon: "cut" },
  { value: "intersect", label: "Intersect", icon: "intersect" },
  { value: "new", label: "New Body", icon: "newBody" },
  { value: "newComponent", label: "New Component", icon: "newComponent" },
];
export const DIRECTIONS = [
  { value: "one", label: "One Side", icon: "oneSide" },
  { value: "two", label: "Two Sides", icon: "twoSides" },
  { value: "sym", label: "Symmetric", icon: "symmetric" },
];

/**
 * Common start of a model command: capture the preselection, leave the sketch environment
 * (Fusion finishes the active sketch when a solid command starts).
 */
export function beginModelCommand(app) {
  const pre = [...app.selection.items];
  if (app.mode === "sketch") {
    const stop = app.commands.get("SketchStop");
    try {
      if (stop && !stop.stub && typeof stop.run === "function") stop.run(app, { fromCommand: true });
      else app.setMode("model");
    } catch (e) {
      console.error(e);
      app.setMode("model");
    }
    if (app.mode === "sketch") app.setMode("model");
  }
  return pre;
}

export const profileRefsOf = (list) => (list || []).filter((r) => r.kind === "profile").map((r) => ({ sketch: r.sketch, key: r.key, c: r.c }));
export const faceRefsOf = (list) => (list || []).filter((r) => r.kind === "face").map((r) => ({ body: r.body, p: r.p, n: r.n }));
export const bodyIdsOf = (list) => [...new Set((list || []).map((r) => r.body).filter(Boolean))];

/** Selection refs for stored profiles of a feature. */
export function profileSelRefs(profiles) {
  return (profiles || []).map((p) => ({ kind: "profile", sketch: p.sketch, key: p.key, c: p.c }));
}

/** Face -> body (for rows that select whole bodies by clicking any of their faces). */
export function toBodyRef(ref) {
  if (!ref) return null;
  if (ref.kind === "body") return ref;
  if (ref.body) return { kind: "body", body: ref.body };
  return null;
}

/** All edges of a picked face (fillet/chamfer accept faces). */
export function faceEdges(dlg, ref) {
  if (ref.kind !== "face") return ref;
  const b = dlg.baseState.bodies.get(ref.body);
  if (!b) return null;
  try {
    const face = b.shape.faces[ref.index];
    if (!face) return null;
    const all = b.shape.edges;
    const out = [];
    for (const e of face.edges) {
      const i = U.indexOfSame(all, e);
      if (i < 0) continue;
      out.push({ kind: "edge", body: ref.body, index: i, p: dlg.app.K.edgeMid(all[i]) });
    }
    return out.length ? out : null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** Status text for profile / face selections: "1 Profile | Area : 800.00 mm^2" (Fusion's wording). */
export function profileStatus(dlg, refs) {
  const list = refs || [];
  const prof = list.filter((r) => r.kind === "profile");
  const faces = list.filter((r) => r.kind === "face");
  if (!prof.length && !faces.length) return "";
  let area = 0;
  for (const p of prof) area += U.profileArea(dlg.baseState, p);
  for (const f of faces) area += U.faceArea(dlg.baseState, f);
  const parts = [];
  if (prof.length) parts.push(`${prof.length} Profile${prof.length > 1 ? "s" : ""}`);
  if (faces.length) parts.push(`${faces.length} Face${faces.length > 1 ? "s" : ""}`);
  return `${parts.join(" | ")} | Area : ${area.toFixed(2)} mm^2`;
}

/** Status text for edge selections: "Edge" / "3 Edges". */
export function edgeStatus(list) {
  const n = (list || []).length;
  return n === 0 ? "" : n === 1 ? "Edge" : `${n} Edges`;
}

/** Default operation for new body-making features. */
export function defaultOperation(app, state) {
  return U.visibleBodies(app, state).length ? "join" : "new";
}
