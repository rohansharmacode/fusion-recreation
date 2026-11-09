// FORM > SYMMETRY: Mirror - Internal, Circular - Internal, Mirror - Duplicate, Circular - Duplicate,
// Clear Symmetry, Isolate Symmetry.
import * as U from "../dialogs/util.js";
import { openFormDialog, tsRow, cageOf, byBody, planeOfRef, axisOfRef, clone } from "./common.js";
import { V, refVerts, symPartners, tidy, bbox, isTsRef } from "./cage.js";
import { mirrorDuplicate, circularDuplicate } from "./ops.js";

const bodyRefs = (app, opts) => (opts.preselect || app.selection.items || []).filter((r) => (r.kind === "body" || isTsRef(r)) && cageOf(app, r.body)).map((r) => ({ kind: "body", body: r.body }));
const centroidOf = (c, r) => V.avg([...refVerts(c, [r])].map((v) => c.v[v]));
const matched = (c) => {
  const { partners } = symPartners(c);
  if (!partners.length) return 0;
  return partners[0].filter((x) => x >= 0).length / Math.max(1, c.v.length);
};

export function openMirrorInternal(app) {
  return openFormDialog(app, {
    id: "TSplineInternalMirrorSymmetryCmd", title: "Mirror - Internal", featureLabel: "Mirror - Internal",
    help: "Creates a mirror symmetry with the elements of a T-Spline body: select a face, edge or vertex on the master side, then its match on the mirror side. Symmetry lines are displayed in green.",
    rows: [
      tsRow(app, "master", "Symmetry", ["tsFace", "tsEdge", "tsVertex"], { max: 1, prompt: "Select face on master side" }),
      tsRow(app, "mirror", "Mirror", ["tsFace", "tsEdge", "tsVertex"], { max: 1, prompt: "Select face on mirror side", filter: (r, d) => { const m = (d.values.master || [])[0]; return !m || (m.body === r.body && m.kind === r.kind); } }),
      { id: "tol", type: "value", label: "Tolerance", kind: "length", default: "0.01 mm", positive: true },
    ],
    compute(v, d) {
      const a = (v.master || [])[0], b = (v.mirror || [])[0];
      if (!a || !b) return null;
      const c = cageOf(app, a.body);
      const ca = centroidOf(c, a), cb = centroidOf(c, b);
      if (V.dist(ca, cb) < 1e-9) throw new Error("Select two different elements");
      const plane = { o: V.lerp(ca, cb, 0.5), n: V.norm(V.sub(cb, ca)) };
      const out = tidy({ ...clone(c), sym: { type: "mirror", planes: [plane] } });
      const tol = Math.max(d.num("tol") || 0, bbox(c).size * 1e-5);
      const { partners } = symPartners(out, tol * 10);
      const ok = partners[0].filter((x) => x >= 0).length / Math.max(1, c.v.length);
      if (ok < 0.5) throw new Error("The body is not symmetric about the plane between the two selections");
      return { set: new Map([[a.body, out]]) };
    },
  });
}

export function openCircularInternal(app) {
  return openFormDialog(app, {
    id: "TSplineInternalCircularSymmetryCmd", title: "Circular - Internal", featureLabel: "Circular - Internal",
    help: "Creates circular symmetry with the elements of a T-Spline body: select a face of the body, the axis and the number of symmetric faces.",
    rows: [
      tsRow(app, "face", "Symmetry", ["tsFace", "body"], { max: 1, prompt: "Select face for symmetry." }),
      { id: "axis", type: "selection", label: "Axis", kinds: ["originAxis", "sketchCurve", "edge", "tsEdge", "caxis"], max: 1, prompt: "Select axis or edge" },
      { id: "count", type: "value", label: "Symmetric Faces", kind: "none", default: "4", integer: true, min: 2, max: 64 },
    ],
    compute(v, d) {
      const r = (v.face || [])[0];
      const ax = axisOfRef(app, U, (v.axis || [])[0], d.baseState);
      if (!r || !ax) return null;
      const c = cageOf(app, r.body);
      const out = tidy({ ...clone(c), sym: { type: "circular", o: ax.o.slice(), d: V.norm(ax.d), count: d.num("count") } });
      if (matched(out) < 0.5) throw new Error("No circular symmetry with this many faces was found about the axis");
      return { set: new Map([[r.body, out]]) };
    },
  });
}

export function openMirrorDuplicate(app, opts = {}) {
  return openFormDialog(app, {
    id: "TSplineReflectionMirrorSymmetryCmd", title: "Mirror - Duplicate", featureLabel: "Mirror - Duplicate",
    help: "Create a duplicate body mirrored across a specified plane. Select the body to copy then select the mirror plane.",
    preselect: bodyRefs(app, opts).slice(0, 1),
    rows: [
      tsRow(app, "body", "T-Spline Body", ["body", "tsFace"], { max: 1, prompt: "Select T-Spline body", mapRef: (r) => ({ kind: "body", body: r.body }) }),
      { id: "plane", type: "selection", label: "Mirror Plane", kinds: ["originPlane", "cplane", "face"], planar: true, max: 1, prompt: "Select a plane or planar face" },
      { id: "weld", type: "check", label: "Weld Center Vertices", default: true },
      { id: "tol", type: "value", label: "Weld Tolerance", kind: "length", default: "0.10 mm", positive: true, visible: (v) => !!v.weld },
    ],
    compute(v, d) {
      const r = (v.body || [])[0];
      const pl = planeOfRef(app, U, (v.plane || [])[0], d.baseState);
      if (!r || !pl) return null;
      return { set: new Map([[r.body, mirrorDuplicate(cageOf(app, r.body), { o: pl.o, n: pl.n }, { weldCenter: !!v.weld, tol: d.num("tol") || 0.1 })]]) };
    },
  });
}

export function openCircularDuplicate(app, opts = {}) {
  return openFormDialog(app, {
    id: "TSplineReflectionCircularSymmetryCmd", title: "Circular - Duplicate", featureLabel: "Circular - Duplicate",
    help: "Create specified number of duplicate bodies around a selected axis.",
    preselect: bodyRefs(app, opts).slice(0, 1),
    rows: [
      tsRow(app, "body", "T-Spline Body", ["body", "tsFace"], { max: 1, prompt: "Select T-Spline body", mapRef: (r) => ({ kind: "body", body: r.body }) }),
      { id: "axis", type: "selection", label: "Axis", kinds: ["originAxis", "sketchCurve", "edge", "caxis"], max: 1, prompt: "Select axis or edge" },
      { id: "count", type: "value", label: "Quantity", kind: "none", default: "3", integer: true, min: 2, max: 64 },
      { id: "weld", type: "check", label: "Weld", default: true },
    ],
    compute(v, d) {
      const r = (v.body || [])[0];
      const ax = axisOfRef(app, U, (v.axis || [])[0], d.baseState);
      if (!r || !ax) return null;
      return { set: new Map([[r.body, circularDuplicate(cageOf(app, r.body), ax, d.num("count"), { weld: !!v.weld, tol: 0.05 })]]) };
    },
  });
}

export function openClearSymmetry(app, opts = {}) {
  return openFormDialog(app, {
    id: "TSplineClearSymmetryCommand", title: "Clear Symmetry", featureLabel: "Clear Symmetry",
    help: "Remove symmetry constraint from individual bodies or a series of bodies. Select the symmetric bodies.",
    preselect: bodyRefs(app, opts),
    rows: [tsRow(app, "bodies", "T-Spline Body", ["body", "tsFace"], { prompt: "Select T-Spline body", mapRef: (r) => ({ kind: "body", body: r.body }) })],
    compute(v) {
      const set = new Map();
      for (const id of byBody(v.bodies).keys()) set.set(id, tidy({ ...clone(cageOf(app, id)), sym: null, iso: [] }));
      return set.size ? { set } : null;
    },
  });
}

export function openIsolateSymmetry(app, opts = {}) {
  return openFormDialog(app, {
    id: "TSplineIsolateSymmetryCmd", title: "Isolate Symmetry", featureLabel: "Isolate Symmetry",
    help: "Prevents symmetric transformations from being applied to the selected vertex, edge or face.",
    preselect: (opts.preselect || app.selection.items || []).filter((r) => isTsRef(r) && cageOf(app, r.body)),
    rows: [tsRow(app, "ents", "Isolate Symmetry", ["tsFace", "tsEdge", "tsVertex"], { prompt: "Select faces, edges or vertices" })],
    compute(v) {
      const set = new Map();
      for (const [id, rs] of byBody(v.ents)) {
        const c = cageOf(app, id);
        if (!c.sym) throw new Error("The body has no symmetry");
        set.set(id, tidy({ ...clone(c), iso: [...new Set([...(c.iso || []), ...refVerts(c, rs)])] }));
      }
      return set.size ? { set } : null;
    },
  });
}
