// SOLID > MODIFY face tools: Offset Face, Replace Face, Split Face, Remove Faces, Remove Features.
//
// offsetface     {faces:[{body,p,n}], distance}
// replaceface    {source:[{body,p,n}], target:[toolRef], tangentChain}
// splitface      {faces:[{body,p,n}], tools:[toolRef], extend}
// removefaces    {faces:[{body,p,n}]}
// removefeatures {bodies:[ids], size, fillets, chamfers, holes}   (features are found at evaluation time)
// toolRef: {kind:'face', body, p, n} | {kind:'origin', name} | {kind:'cplane', id} | {kind:'body', body}
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import * as U from "../dialogs/util.js";
import { beginModelCommand } from "../dialogs/common.js";
import * as X from "./occ.js";

const V = K.V;

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------
function frame(shape) {
  const bb = K.topoOf(shape).bb;
  const size = Math.max(V.len(V.sub(bb.max, bb.min)), 1);
  return { c: V.mul(V.add(bb.min, bb.max), 0.5), half: size * 2 + 20, size };
}
function solidOf(st, id) {
  const b = st.bodies.get(id);
  if (!b) throw new Error("The referenced body is missing");
  if (M.shapeKind(b.shape) !== "solid") throw new Error("Select faces of solid bodies");
  return b;
}
function faceIdx(shape, refs) {
  const out = [];
  for (const r of refs) { const i = M.locateFace(shape, r); if (i >= 0 && !out.includes(i)) out.push(i); }
  return out;
}

/** Faces tangent-connected to the given ones (normals agree across shared edges). */
export function tangentChain(shape, idx) {
  const T = K.topoOf(shape);
  const set = new Set(idx);
  const faces = K.facesOf(shape);
  const nAt = (i, p) => {
    const fi = T.faces[i];
    if (fi.type === "PLANE") return fi.n;
    try { const v = faces[i].normalAt(p); const n = v.toTuple(); v.delete(); return V.norm(n); } catch { return null; }
  };
  try {
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of T.edges) {
        const fs = e.faces || [];
        if (fs.length !== 2) continue;
        const [a, b] = fs;
        if (set.has(a) === set.has(b)) continue;
        const na = nAt(a, e.m), nb = nAt(b, e.m);
        if (na && nb && V.dot(na, nb) > 0.9999) { set.add(set.has(a) ? b : a); grew = true; }
      }
    }
  } finally { K.del(faces); }
  return [...set];
}

/** Tool shapes of tool refs (planes and, with extend, planar / cylindrical faces become large surfaces). */
function toolShapes(st, refs, extend, around) {
  const out = [];
  for (const r of refs || []) {
    if (r.kind === "origin" || r.kind === "cplane") {
      const pl = M.resolvePlane(r, st);
      if (!pl) throw new Error("missing split tool");
      out.push(X.bigPlane(pl.o, pl.n, around.c, around.half));
    } else if (r.kind === "body") {
      const b = st.bodies.get(r.body);
      if (!b) throw new Error("missing split tool");
      out.push(b.shape);
    } else {
      const b = st.bodies.get(r.body);
      if (!b) throw new Error("missing split tool");
      const i = M.locateFace(b.shape, r, true);
      if (i < 0) throw new Error("missing split tool");
      const fi = K.topoOf(b.shape).faces[i];
      const x = extend ? X.extendedFace(fi, around.c, around.half) : null;
      out.push(x || K.facesAt(b.shape, [i])[0]);
    }
  }
  return out;
}
function bodyFrames(st, groups) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const id of groups.keys()) {
    const b = st.bodies.get(id);
    const bb = b && K.bboxOf(b.shape);
    if (!bb) continue;
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], bb.min[k]); mx[k] = Math.max(mx[k], bb.max[k]); }
  }
  const size = Number.isFinite(mn[0]) ? Math.max(V.len(V.sub(mx, mn)), 1) : 100;
  return { c: Number.isFinite(mn[0]) ? V.mul(V.add(mn, mx), 0.5) : [0, 0, 0], half: size * 2 + 20 };
}

// ---------------------------------------------------------------------------------------------
// Remove Features: feature detection
// ---------------------------------------------------------------------------------------------
/** Groups of face indices of small fillets / chamfers / holes of a solid. */
export function findFeatures(shape, { size = 5, fillets = true, chamfers = true, holes = true } = {}) {
  const T = K.topoOf(shape);
  const out = [];
  const used = new Set();
  const edgesOfFace = (i) => T.edges.filter((e) => (e.faces || []).includes(i));
  T.faces.forEach((fi, i) => {
    if (used.has(i)) return;
    if (fi.type === "CYLINDRE" && fi.r > 0 && fi.a && fi.ao) {
      const es = edgesOfFace(i);
      const sharedLines = es.filter((e) => e.type === "LINE" && (e.faces || []).length === 2 && e.faces[0] !== e.faces[1]);
      const a = V.norm(fi.a);
      const radial = V.sub(fi.c, V.add(fi.ao, V.mul(a, V.dot(V.sub(fi.c, fi.ao), a))));
      const concave = V.dot(radial, fi.n) < 0;
      if (sharedLines.length >= 2 || (sharedLines.length && es.length <= 4 && !concave)) {
        // a blend between two faces (fillet)
        if (fillets && fi.r <= size + 1e-9) { out.push({ kind: "fillet", faces: [i], size: fi.r }); used.add(i); }
      } else if (concave && holes && 2 * fi.r <= size + 1e-9) {
        // a hole: every cylinder face on the same axis and radius
        const grp = [];
        T.faces.forEach((fj, j) => {
          if (fj.type !== "CYLINDRE" || !fj.a || !fj.ao || Math.abs(fj.r - fi.r) > 1e-6) return;
          if (Math.abs(Math.abs(V.dot(V.norm(fj.a), a)) - 1) > 1e-6) return;
          const w = V.sub(fj.ao, fi.ao);
          if (V.len(V.sub(w, V.mul(a, V.dot(w, a)))) > 1e-6) return;
          grp.push(j);
        });
        grp.forEach((j) => used.add(j));
        out.push({ kind: "hole", faces: grp, size: 2 * fi.r });
      }
    } else if (fi.type === "PLANE" && chamfers) {
      const es = edgesOfFace(i);
      const lines = es.filter((e) => e.type === "LINE" && (e.faces || []).length === 2);
      if (es.length !== 4 || lines.length !== 4) return;
      // two long parallel edges whose neighbours are planes at an oblique angle
      const sorted = lines.slice().sort((p, q) => q.len - p.len);
      const [l1, l2] = sorted;
      if (Math.abs(Math.abs(V.dot(l1.d, l2.d)) - 1) > 1e-6) return;
      const w = V.sub(l2.m, l1.m);
      const width = V.len(V.sub(w, V.mul(l1.d, V.dot(w, l1.d))));
      if (width > size + 1e-9 || width >= l1.len) return;
      const oblique = [l1, l2].every((e) => {
        const j = e.faces[0] === i ? e.faces[1] : e.faces[0];
        const fj = T.faces[j];
        if (!fj || fj.type !== "PLANE") return false;
        const c = Math.abs(V.dot(fj.n, fi.n));
        return c > 0.17 && c < 0.985;
      });
      if (oblique) { out.push({ kind: "chamfer", faces: [i], size: width }); used.add(i); }
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// feature evaluation
// ---------------------------------------------------------------------------------------------
function perBody(st, f, refs, fn) {
  const groups = M.groupByBody(refs);
  if (!groups.size) throw new Error("missing faces");
  const affected = [];
  for (const [id, rs] of groups) {
    const b = solidOf(st, id);
    const idx = faceIdx(b.shape, rs);
    if (!idx.length) throw new Error("missing faces");
    const shape = fn(b.shape, idx, id);
    if (shape && shape !== b.shape) { st.bodies.set(id, { id, shape, from: f.id }); affected.push(id); }
  }
  return { affected };
}

export const FACE_FEATURES = {
  offsetface: {
    label: "Offset Face", stem: "Offset Face", fields: { distance: "length" }, icon: "FusionOffsetFacesCommand",
    apply(st, f, P) {
      const d = M.fval(P, f, "distance");
      return perBody(st, f, f.faces, (shape, idx) => X.offsetFaces(shape, idx, d));
    },
    touches: (f) => [...new Set((f.faces || []).map((r) => r.body))],
  },
  replaceface: {
    label: "Replace Face", stem: "Replace Face", fields: {}, icon: "FusionReplaceFaceCommand",
    apply(st, f) {
      const groups = M.groupByBody(f.source);
      const around = bodyFrames(st, groups);
      const owned = [];
      try {
        const targets = [];
        for (const r of f.target || []) {
          if (r.kind === "face") {
            const b = st.bodies.get(r.body);
            const i = b ? M.locateFace(b.shape, r, true) : -1;
            if (i < 0) throw new Error("missing target faces");
            const [tf] = K.facesAt(b.shape, [i]);
            owned.push(tf); targets.push(tf);
          } else {
            for (const s of toolShapes(st, [r], true, around)) { if (r.kind !== "body") owned.push(s); targets.push(s); }
          }
        }
        if (!targets.length) throw new Error("missing target faces");
        return perBody(st, f, f.source, (shape, idx) => {
          const all = f.tangentChain ? tangentChain(shape, idx) : idx;
          return X.replaceFaces(shape, all, targets, true);
        });
      } catch (e) {
        if (/No faces were able/.test(e.message)) throw new Error("Please make sure the new face is large enough to cover the source face!");
        throw e;
      } finally { K.del(owned); }
    },
    touches: (f) => [...new Set((f.source || []).map((r) => r.body))],
  },
  splitface: {
    label: "Split Face", stem: "Split Face", fields: {}, icon: "FusionSplitFaceCommand",
    apply(st, f) {
      const groups = M.groupByBody(f.faces);
      const around = bodyFrames(st, groups);
      const tools = toolShapes(st, f.tools, f.extend !== false, around);
      const own = tools.filter((s, k) => (f.tools[k] || {}).kind !== "body");
      try {
        return perBody(st, f, f.faces, (shape, idx) => X.splitFaces(shape, idx, tools));
      } finally { K.del(own); }
    },
    touches: (f) => [...new Set((f.faces || []).map((r) => r.body))],
  },
  removefaces: {
    label: "Remove Faces", stem: "Remove Faces", fields: {}, icon: "FusionRemoveFacesCommand",
    apply(st, f) { return perBody(st, f, f.faces, (shape, idx) => X.rebuildByCells(shape, idx)); },
    touches: (f) => [...new Set((f.faces || []).map((r) => r.body))],
  },
  removefeatures: {
    label: "Remove Features", stem: "Remove Features", fields: { size: "length" }, icon: "FusionRemoveFeaturesCommand",
    apply(st, f, P) {
      const size = M.fval(P, f, "size");
      const affected = [];
      let found = 0, skipped = 0;
      for (const id of f.bodies || []) {
        const b = solidOf(st, id);
        const feats = findFeatures(b.shape, { size, fillets: f.fillets !== false, chamfers: f.chamfers !== false, holes: f.holes !== false });
        found += feats.length;
        if (!feats.length) continue;
        let shape = null;
        try { shape = X.rebuildByCells(b.shape, feats.flatMap((x) => x.faces)); } catch { shape = null; }
        if (!shape) {
          // one feature at a time (each re-detected on the current shape)
          shape = b.shape;
          for (let k = 0; k < feats.length; k++) {
            const cur = findFeatures(shape, { size, fillets: f.fillets !== false, chamfers: f.chamfers !== false, holes: f.holes !== false });
            if (!cur.length) break;
            let next = null;
            try { next = X.rebuildByCells(shape, cur[0].faces); } catch { next = null; skipped++; }
            if (!next) break;
            shape = next;
          }
        }
        if (shape !== b.shape) { st.bodies.set(id, { id, shape, from: f.id }); affected.push(id); }
      }
      if (!found) return { affected, warning: "No features smaller than the feature size were found." };
      if (!affected.length) throw new Error("No features were able to be removed from this part.");
      return skipped ? { affected, warning: "Not all features were able to be removed from this part.", removed: found - skipped } : { affected, removed: found };
    },
    touches: (f) => f.bodies || [],
  },
};

// ---------------------------------------------------------------------------------------------
// dialogs
// ---------------------------------------------------------------------------------------------
const faceSel = (state) => (r) => {
  const b = state.bodies.get(r.body);
  return !!b && M.shapeKind(b.shape) === "solid";
};
const faceRefOf = (r) => ({ body: r.body, p: r.p, n: r.n });
const selOfFace = (x, state) => U.faceRef(state, x.body, x.p, x.n);
function toolRefOf(r) {
  if (r.kind === "originPlane") return { kind: "origin", name: r.name };
  if (r.kind === "cplane") return { kind: "cplane", id: r.id };
  if (r.kind === "body") return { kind: "body", body: r.body };
  return { kind: "face", body: r.body, p: r.p, n: r.n };
}
function selOfTool(x, state) {
  if (x.kind === "origin") return { kind: "originPlane", name: x.name };
  if (x.kind === "cplane") return { kind: "cplane", id: x.id };
  if (x.kind === "body") return { kind: "body", body: x.body };
  return U.faceRef(state, x.body, x.p, x.n);
}
const list = (xs, fn, state) => (xs || []).map((x) => fn(x, state)).filter(Boolean);

function openFaceDialog(app, opts, spec) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: spec.id, title: spec.title, icon: spec.id, editId, featureLabel: spec.title, help: spec.help,
    preselect: (opts.preselect || []).filter((r) => spec.pre(r)),
    rows: spec.rows,
    init(dlg) { if (f0) spec.load(f0, dlg); },
    build: spec.build,
    manipulators: spec.manips,
    status: spec.status,
  });
}

export function openOffsetFace(app, opts = {}) {
  return openFaceDialog(app, opts, {
    id: "FusionOffsetFacesCommand", title: "Offset Face",
    help: "Shifts the selected face or faces in a positive or negative direction.",
    pre: (r) => r.kind === "face",
    rows: [
      { id: "faces", type: "selection", label: "Faces", kinds: ["face"], filter: (r, dlg) => faceSel(dlg.baseState)(r), prompt: "Select faces to offset" },
      { id: "distance", type: "value", label: "Distance", kind: "length", default: "0.00 mm" },
    ],
    load(f, dlg) { dlg.values.faces = list(f.faces, selOfFace, dlg.baseState); dlg.values.distance = f.distance; },
    build(v) { return (v.faces || []).length ? { type: "offsetface", faces: v.faces.map(faceRefOf), distance: v.distance } : null; },
    manips(dlg) {
      const r = (dlg.values.faces || [])[0];
      if (!r || !r.p || !r.n) return [];
      return [dlg.valueManip("distance", { origin: r.p, dir: r.n })].filter(Boolean);
    },
  });
}

export function openReplaceFace(app, opts = {}) {
  return openFaceDialog(app, opts, {
    id: "FusionReplaceFaceCommand", title: "Replace Face",
    help: "Replaces one or more part faces with different face. The new face must completely intersect the part.",
    pre: (r) => r.kind === "face",
    rows: [
      { id: "source", type: "selection", label: "Source Faces", kinds: ["face"], filter: (r, dlg) => faceSel(dlg.baseState)(r), prompt: "Select faces to replace" },
      { id: "tangentChain", type: "check", label: "Tangent Chain", default: true },
      { id: "target", type: "selection", label: "Target Faces", kinds: ["face", "originPlane", "cplane", "body"], prompt: "Select target faces, planes or body", filter: (r, dlg) => !(r.kind === "face" && (dlg.values.source || []).some((s) => s.body === r.body && s.index === r.index)) },
    ],
    load(f, dlg) { dlg.values.source = list(f.source, selOfFace, dlg.baseState); dlg.values.target = list(f.target, selOfTool, dlg.baseState); dlg.values.tangentChain = f.tangentChain !== false; },
    build(v) {
      if (!(v.source || []).length || !(v.target || []).length) return null;
      return { type: "replaceface", source: v.source.map(faceRefOf), target: v.target.map(toolRefOf), tangentChain: !!v.tangentChain };
    },
  });
}

export function openSplitFace(app, opts = {}) {
  return openFaceDialog(app, opts, {
    id: "FusionSplitFaceCommand", title: "Split Face",
    help: "Divides faces using a selected profile, face, or plane as the cutting tool.",
    pre: (r) => r.kind === "face",
    rows: [
      { id: "faces", type: "selection", label: "Faces to Split", kinds: ["face"], filter: (r, dlg) => faceSel(dlg.baseState)(r), prompt: "Select Face to split" },
      { id: "tools", type: "selection", label: "Splitting Tool", kinds: ["face", "originPlane", "cplane", "body"], prompt: "Select a face, plane or body to split with", filter: (r, dlg) => !(r.kind === "face" && (dlg.values.faces || []).some((s) => s.body === r.body && s.index === r.index)) && !(r.kind === "body" && (dlg.values.faces || []).some((s) => s.body === r.body)) },
      { id: "extend", type: "check", label: "Extend Splitting Tool", default: true },
    ],
    load(f, dlg) { dlg.values.faces = list(f.faces, selOfFace, dlg.baseState); dlg.values.tools = list(f.tools, selOfTool, dlg.baseState); dlg.values.extend = f.extend !== false; },
    build(v) {
      if (!(v.faces || []).length || !(v.tools || []).length) return null;
      return { type: "splitface", faces: v.faces.map(faceRefOf), tools: v.tools.map(toolRefOf), extend: !!v.extend };
    },
  });
}

export function openRemoveFaces(app, opts = {}) {
  return openFaceDialog(app, opts, {
    id: "FusionRemoveFacesCommand", title: "Remove Faces",
    help: "Select faces to remove. Neighboring faces are automatically deleted, as appropriate, in order to heal the model.",
    pre: (r) => r.kind === "face",
    rows: [{ id: "faces", type: "selection", label: "Faces", kinds: ["face"], filter: (r, dlg) => faceSel(dlg.baseState)(r), prompt: "Select solid body faces to remove" }],
    load(f, dlg) { dlg.values.faces = list(f.faces, selOfFace, dlg.baseState); },
    build(v) { return (v.faces || []).length ? { type: "removefaces", faces: v.faces.map(faceRefOf) } : null; },
  });
}

export function openRemoveFeatures(app, opts = {}) {
  return openFaceDialog(app, opts, {
    id: "FusionRemoveFeaturesCommand", title: "Remove Features",
    help: "Automatically deletes features from selected objects.",
    pre: (r) => r.kind === "body",
    rows: [
      { id: "bodies", type: "selection", label: "Bodies", kinds: ["body"], filter: (r, dlg) => faceSel(dlg.baseState)(r), prompt: "Select solid bodies" },
      { id: "size", type: "value", label: "Feature Size", kind: "length", default: "5.00 mm", positive: true },
      { id: "fillets", type: "check", label: "Fillets", default: true, sep: true },
      { id: "chamfers", type: "check", label: "Chamfers", default: true },
      { id: "holes", type: "check", label: "Holes", default: true },
    ],
    load(f, dlg) { Object.assign(dlg.values, { bodies: (f.bodies || []).map((b) => ({ kind: "body", body: b })), size: f.size, fillets: f.fillets !== false, chamfers: f.chamfers !== false, holes: f.holes !== false }); },
    build(v) {
      if (!(v.bodies || []).length) return null;
      return { type: "removefeatures", bodies: v.bodies.map((r) => r.body), size: v.size, fillets: !!v.fillets, chamfers: !!v.chamfers, holes: !!v.holes };
    },
    status(dlg) {
      const fid = dlg.previewFeature && dlg.previewFeature.id;
      const r = fid && dlg.app.result && dlg.app.result.results ? dlg.app.result.results[fid] : null;
      return r && r.ok !== false && Number.isFinite(r.removed) ? `${r.removed} Feature${r.removed === 1 ? "" : "s"}` : "";
    },
  });
}

export const FACE_COMMANDS = {
  FusionOffsetFacesCommand: { label: "Offset Face", tooltip: "Pushes or pulls faces by a distance.", open: openOffsetFace, type: "offsetface" },
  FusionReplaceFaceCommand: { label: "Replace Face", tooltip: "Replaces faces of a body with another face or surface.", open: openReplaceFace, type: "replaceface" },
  FusionSplitFaceCommand: { label: "Split Face", tooltip: "Splits faces using a face, plane or profile.", open: openSplitFace, type: "splitface" },
  FusionRemoveFacesCommand: { label: "Remove Faces", tooltip: "Deletes faces and heals the body.", open: openRemoveFaces, type: "removefaces" },
  FusionRemoveFeaturesCommand: { label: "Remove Features", tooltip: "Finds and removes small features such as holes and fillets.", open: openRemoveFeatures, type: "removefeatures" },
};

export function registerFaceTools(app) {
  for (const cmd of Object.values(FACE_COMMANDS)) {
    const def = FACE_FEATURES[cmd.type];
    try {
      M.registerFeature(cmd.type, { ...def, editor: (a, id) => { beginModelCommand(a); return cmd.open(a, { editId: id }); } });
    } catch (e) { console.error("[solidx]", e); }
  }
  for (const [id, cmd] of Object.entries(FACE_COMMANDS)) {
    app.commands.register({
      id, label: cmd.label, tooltip: cmd.tooltip, kind: "feature",
      run: (a, ctx = {}) => { const pre = beginModelCommand(a); return cmd.open(a, { preselect: ctx.preselect || pre }); },
    });
  }
}
