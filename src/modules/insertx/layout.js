// Arrange (ArrangeCommand, feature 'arrange'), Find Similar Components (SimilarPartsCommand) and Replace with
// Primitives (ReplaceWithPrimitivesCommand, feature 'replaceprim').
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import { clone, esc, V } from "./util.js";

// ------------------------------------------------------------------ 3x4 rigid matrices
const mulT = (A, B) => [
  A[0] * B[0] + A[1] * B[4] + A[2] * B[8], A[0] * B[1] + A[1] * B[5] + A[2] * B[9], A[0] * B[2] + A[1] * B[6] + A[2] * B[10], A[0] * B[3] + A[1] * B[7] + A[2] * B[11] + A[3],
  A[4] * B[0] + A[5] * B[4] + A[6] * B[8], A[4] * B[1] + A[5] * B[5] + A[6] * B[9], A[4] * B[2] + A[5] * B[6] + A[6] * B[10], A[4] * B[3] + A[5] * B[7] + A[6] * B[11] + A[7],
  A[8] * B[0] + A[9] * B[4] + A[10] * B[8], A[8] * B[1] + A[9] * B[5] + A[10] * B[9], A[8] * B[2] + A[9] * B[6] + A[10] * B[10], A[8] * B[3] + A[9] * B[7] + A[10] * B[11] + A[11],
];
const transT = (v) => [1, 0, 0, v[0], 0, 1, 0, v[1], 0, 0, 1, v[2]];
function rotT(axis, deg, c) {
  const [x, y, z] = V.norm(axis), a = (deg * Math.PI) / 180, s = Math.sin(a), co = Math.cos(a), t = 1 - co;
  const R = [t * x * x + co, t * x * y - s * z, t * x * z + s * y, 0, t * x * y + s * z, t * y * y + co, t * y * z - s * x, 0, t * x * z - s * y, t * y * z + s * x, t * z * z + co, 0];
  return mulT(transT(c), mulT(R, transT(V.mul(c, -1))));
}
const corners = (bb) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1 ? bb.max[0] : bb.min[0], i & 2 ? bb.max[1] : bb.min[1], i & 4 ? bb.max[2] : bb.min[2]]);
function unionBB(list) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const bb of list) { if (!bb) continue; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); } }
  return mn[0] <= mx[0] ? { min: mn, max: mx } : null;
}
const NO_DEPS = () => ({ sketches: [], bodies: [], features: [], cplanes: [], geo: [] });

// ------------------------------------------------------------------ Arrange
function planeX(n) {
  const r = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return V.norm(V.sub(r, V.mul(n, V.dot(n, r))));
}
/** Envelope rectangle {o, x, y, n, u0, u1, v0, v1} of a plane / planar face / sketch profile. */
function envelopeOf(st, env, P, f) {
  if (!env) throw new Error("No envelope geometry defined.");
  const sized = (pl) => {
    const L = M.fval(P, f, "length"), W = M.fval(P, f, "width");
    if (!(L > 0) || !(W > 0)) throw new Error("2D arrangement using a work plane as the envelope requires the length and width to also be set.");
    return { o: pl.o, x: pl.x, y: K.planeY(pl), n: pl.n, u0: 0, u1: L, v0: 0, v1: W };
  };
  if (env.kind === "originPlane") return sized(K.ORIGIN_PLANES[env.name]);
  if (env.kind === "cplane") { const p = st.planes.get(env.id); if (!p) throw new Error("Missing planar face: cannot arrange these items. Try editing this feature to fix the problem."); return sized(p.plane); }
  if (env.kind === "profile") {
    const { region, sketch } = M.resolveRegion(st, env);
    const pl = sketch.plane;
    const poly = region.outer.poly || [];
    if (!poly.length) throw new Error("No envelope geometry defined.");
    const us = poly.map((q) => q[0]), vs = poly.map((q) => q[1]);
    return { o: pl.o, x: pl.x, y: K.planeY(pl), n: pl.n, u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
  }
  if (env.kind === "face") {
    const b = st.bodies.get(env.body);
    const idx = b ? M.locateFace(b.shape, env) : -1;
    if (idx < 0) throw new Error("Missing planar face: cannot arrange these items. Try editing this feature to fix the problem.");
    const [face] = K.facesAt(b.shape, [idx]);
    try {
      const fi = K.faceInfo(face);
      if (!fi.planar || !fi.normal) throw new Error("2D arrangement requires the envelope to be a face, work plane, or sketch.");
      const n = V.norm(fi.normal), x = planeX(n), y = V.cross(n, x), o = fi.center;
      const pts = corners(K.bboxOf(face)).map((p) => V.sub(p, o));
      const us = pts.map((p) => V.dot(p, x)), vs = pts.map((p) => V.dot(p, y));
      return { o, x, y, n, u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
    } finally { K.del(face); }
  }
  throw new Error("2D arrangement requires the envelope to be a face, work plane, or sketch.");
}

function itemsOf(st, doc, objects) {
  const out = [];
  const seen = new Set();
  for (const r of objects || []) {
    if (r.kind === "occurrence") {
      if (!st.occ || !st.occ.has(r.occ) || seen.has(`o:${r.occ}`)) continue;
      seen.add(`o:${r.occ}`);
      const ids = M.occBodiesDeep(st, r.occ);
      out.push({ kind: "occ", occ: r.occ, ids, pinned: !!(doc.occurrences && doc.occurrences[r.occ] && doc.occurrences[r.occ].grounded) });
    } else if (r.kind === "body") {
      if (!(st.bodies.has(r.body) || (st.meshBodies && st.meshBodies.has(r.body))) || seen.has(`b:${r.body}`)) continue;
      seen.add(`b:${r.body}`);
      out.push({ kind: "body", ids: [r.body] });
    }
  }
  return out;
}

function registerArrange() {
  M.registerFeature("arrange", {
    label: "Arrange",
    stem: "Arrange",
    fields: { length: "length", width: "length", spacing: "length", frame: "length" },
    makesBodies: false,
    apply(st, f, P, doc) {
      const env = envelopeOf(st, f.envelope, P, f);
      const items = itemsOf(st, doc, f.objects);
      if (!items.length) throw new Error("Nothing has been selected to arrange.");
      const gap = Math.max(0, M.fval(P, f, "spacing")), frame = Math.max(0, M.fval(P, f, "frame"));
      const warnings = [];
      const placed = [];
      for (const it of items) {
        if (it.pinned) { warnings.push("Pinned component cannot be arranged."); continue; }
        const bb = unionBB(it.ids.map((id) => M.bodyBBox(st, id)));
        if (!bb) { warnings.push("Component does not have a body, which is required for 2D arrangement."); continue; }
        const pts = corners(bb).map((p) => V.sub(p, env.o));
        const us = pts.map((p) => V.dot(p, env.x)), vs = pts.map((p) => V.dot(p, env.y)), ws = pts.map((p) => V.dot(p, env.n));
        const fu = [Math.min(...us), Math.max(...us)], fv = [Math.min(...vs), Math.max(...vs)];
        let du = fu[1] - fu[0], dv = fv[1] - fv[0];
        const rot = f.rotate !== false && dv > du + 1e-6;
        if (rot) [du, dv] = [dv, du];
        const cu = (fu[0] + fu[1]) / 2, cv = (fv[0] + fv[1]) / 2;
        placed.push({ it, du, dv, rot, cu, cv, wmin: Math.min(...ws) });
      }
      // shelf packing: tallest first, rows along the envelope length
      placed.sort((a, b) => b.dv - a.dv || b.du - a.du);
      let u = env.u0 + frame, v = env.v0 + frame, shelf = 0, over = 0;
      const affected = [];
      for (const p of placed) {
        if (u + p.du > env.u1 - frame + 1e-6 && u > env.u0 + frame + 1e-6) { u = env.u0 + frame; v += shelf + gap; shelf = 0; }
        if (u + p.du > env.u1 - frame + 1e-6 || v + p.dv > env.v1 - frame + 1e-6) { over += 1; continue; }
        const c = V.add(V.add(env.o, V.mul(env.x, p.cu)), V.mul(env.y, p.cv));
        let D = p.rot ? rotT(env.n, 90, c) : transT([0, 0, 0]);
        // after the turn about the footprint centre the footprint is (du x dv) around the same centre
        const t = V.add(V.add(V.mul(env.x, u - (p.cu - p.du / 2)), V.mul(env.y, v - (p.cv - p.dv / 2))), V.mul(env.n, -p.wmin));
        D = mulT(transT(t), D);
        if (p.it.kind === "occ") {
          const o = st.occ.get(p.it.occ);
          if (o && M.moveOccurrence(st, doc, p.it.occ, mulT(D, o.T))) affected.push(...p.it.ids);
        } else {
          const id = p.it.ids[0];
          const b = st.bodies.get(id);
          if (b) { st.bodies.set(id, { ...b, shape: M.transformShape(b.shape, D) }); affected.push(id); }
          const mb = !b && st.meshBodies && st.meshBodies.get(id);
          if (mb && mb.mesh && M.transformMesh) { st.meshBodies.set(id, { ...mb, mesh: M.transformMesh(mb.mesh, D), bbox: undefined }); affected.push(id); }
        }
        u += p.du + gap;
        shelf = Math.max(shelf, p.dv);
      }
      if (over) warnings.unshift(`There is not enough room to arrange all selected items (${over} did not fit). Edit this feature and try enlarging the envelope.`);
      const out = { affected, arranged: placed.length - over, overflow: over };
      if (warnings.length) out.warning = warnings[0];
      return out;
    },
    deps: (f) => ({ sketches: f.envelope && f.envelope.kind === "profile" ? [f.envelope.sketch] : [], bodies: (f.objects || []).filter((r) => r.kind === "body").map((r) => r.body), features: [], cplanes: f.envelope && f.envelope.kind === "cplane" ? [f.envelope.id] : [], geo: [] }),
    touches: (f) => (f.objects || []).filter((r) => r.kind === "body").map((r) => r.body),
    editor: (app, id) => openArrange(app, id),
    icon: "ArrangeCommand",
  });
}

function openArrange(app, editId) {
  if (app.mode === "sketch") { app.toast("Finish the sketch before Arrange", "warn"); return null; }
  const ef = editId ? app.feature(editId) : null;
  const st0 = app.result && app.result.state;
  // bodies of a component stand for the top-level component under the root (Fusion arranges components)
  const toObj = (r) => {
    if (r.kind === "occurrence") return r.occ && r.occ !== M.ROOT ? r : null;
    const id = r.body;
    if (!id || M.isInstanceId(id)) return null;
    const own = st0 && st0.bodyOcc ? st0.bodyOcc.get(id) : null;
    if (own && own !== M.ROOT && app.components) { const chain = app.components.ancestors(own).filter((o) => o && o !== M.ROOT); return { kind: "occurrence", occ: chain[chain.length - 1] }; }
    return { kind: "body", body: id };
  };
  const envOK = (r) => r.kind === "originPlane" || r.kind === "cplane" || r.kind === "profile" || (r.kind === "face" && r.planar !== false);
  const pre = editId ? [] : [...((app.selection && app.selection.items) || [])];
  const preObjs = pre.filter((r) => r.kind === "body" || r.kind === "occurrence" || r.kind === "face");
  const envRef = (r) => (r.kind === "originPlane" ? { kind: "originPlane", name: r.name } : r.kind === "cplane" ? { kind: "cplane", id: r.id } : r.kind === "profile" ? { kind: "profile", sketch: r.sketch, key: r.key, c: r.c } : { kind: "face", body: r.body, p: r.p, ...(r.n ? { n: r.n } : {}), ...(r.sig ? { sig: r.sig } : {}) });
  const sizedEnv = (v) => { const r = (v.envelope || [])[0]; return !r || r.kind === "originPlane" || r.kind === "cplane"; };
  return app.ui.dialog.open({
    id: "ArrangeCommand",
    title: "Arrange",
    icon: "ArrangeCommand",
    editId: editId || null,
    featureLabel: "Arrange",
    help: "Arranges components or bodies on a plane, planar face or sketch profile, with spacing and rotation options.",
    preselect: preObjs.map((r) => (r.kind === "face" ? { kind: "body", body: r.body } : r)),
    ctrlWidth: 180,
    rows: [
      { id: "objects", type: "selection", label: "Objects", kinds: ["body", "occurrence"], meshBodies: true, mapRef: (r) => toObj(r), prompt: "Select the components or bodies to arrange" },
      { id: "envelope", type: "selection", label: "Envelope", kinds: ["originPlane", "cplane", "face", "profile"], max: 1, toggle: false, filter: envOK, prompt: "Select a plane, planar face or sketch profile", advance: false },
      { id: "length", type: "value", label: "Length", kind: "length", positive: true, default: "200.00 mm", visible: sizedEnv },
      { id: "width", type: "value", label: "Width", kind: "length", positive: true, default: "200.00 mm", visible: sizedEnv },
      { id: "frame", type: "value", label: "Frame Width", kind: "length", nonNegative: true, default: "0.00 mm", sep: true },
      { id: "spacing", type: "value", label: "Object Spacing", kind: "length", nonNegative: true, default: "2.00 mm" },
      { id: "rotate", type: "check", label: "Allow Rotation", tooltip: "Turns objects by 90 degrees so that their long side runs along the envelope length", default: true },
    ],
    init(dlg) {
      if (ef) {
        Object.assign(dlg.values, {
          objects: clone(ef.objects || []), envelope: ef.envelope ? [clone(ef.envelope)] : [], length: ef.length, width: ef.width,
          frame: ef.frame, spacing: ef.spacing, rotate: ef.rotate !== false,
        });
      }
    },
    build(v) {
      const env = (v.envelope || [])[0];
      if (!(v.objects || []).length || !env) return null;
      return { type: "arrange", objects: v.objects.map((r) => (r.kind === "occurrence" ? { kind: "occurrence", occ: r.occ } : { kind: "body", body: r.body })), envelope: envRef(env), length: v.length, width: v.width, frame: v.frame, spacing: v.spacing, rotate: v.rotate !== false };
    },
  });
}

// ------------------------------------------------------------------ Replace with Primitives
function primitiveOf(bb, shape, axisPref) {
  const d = [0, 1, 2].map((i) => bb.max[i] - bb.min[i]);
  const c = [0, 1, 2].map((i) => (bb.min[i] + bb.max[i]) / 2);
  if (shape === "cylinder") {
    let ax = ["x", "y", "z"].indexOf(axisPref);
    if (ax < 0) {
      // auto: the axis whose cross-section is the most square
      let best = Infinity;
      for (let i = 0; i < 3; i++) { const a = d[(i + 1) % 3], b = d[(i + 2) % 3]; const q = Math.max(a, b) / Math.max(1e-9, Math.min(a, b)); if (q < best - 1e-9) { best = q; ax = i; } }
    }
    const a = d[(ax + 1) % 3], b = d[(ax + 2) % 3];
    const r = Math.max(1e-3, Math.hypot(a, b) / 2), h = Math.max(1e-3, d[ax]);
    const n = [0, 0, 0]; n[ax] = 1;
    const base = [...c]; base[ax] = bb.min[ax];
    return K.extrudeDrawing(K.R.drawCircle(r), K.planeFromNormal(base, n), 0, h, 0);
  }
  const s = d.map((x) => Math.max(1e-3, x));
  return K.extrudeDrawing(K.R.drawRectangle(s[0], s[1]), { o: [c[0], c[1], bb.min[2]], x: [1, 0, 0], n: [0, 0, 1] }, 0, s[2], 0);
}

const PRIM_CACHE = new Map();
const SHAPE_IDS = new WeakMap();
let seq = 0;
const sid = (s) => { let i = SHAPE_IDS.get(s); if (!i) { i = ++seq; SHAPE_IDS.set(s, i); } return i; };

function registerPrimitives() {
  M.registerFeature("replaceprim", {
    label: "Replace With Primitive",
    stem: "Replace With Primitive",
    fields: {},
    makesBodies: false,
    apply(st, f) {
      const affected = [];
      let missing = 0;
      for (const id of f.bodies || []) {
        const b = st.bodies.get(id);
        if (!b || !b.shape) { missing += 1; continue; }
        const key = `${sid(b.shape)}|${f.shape}|${f.axis}`;
        let s = PRIM_CACHE.get(key);
        if (!s) {
          s = primitiveOf(K.bboxOf(b.shape), f.shape === "cylinder" ? "cylinder" : "box", f.axis || "auto");
          PRIM_CACHE.set(key, s);
          if (PRIM_CACHE.size > 60) PRIM_CACHE.delete(PRIM_CACHE.keys().next().value);
        }
        st.bodies.set(id, { ...b, shape: s, kind: undefined, from: f.id });
        affected.push(id);
      }
      const out = { affected };
      if (missing) out.warning = "Replace with Primitives Feature is out of date.";
      return out;
    },
    deps: (f) => ({ sketches: [], bodies: f.bodies || [], features: [], cplanes: [], geo: [] }),
    touches: (f) => f.bodies || [],
    editor: (app, id) => openPrimitives(app, id),
    icon: "ReplaceWithPrimitivesCommand",
  });
}

function openPrimitives(app, editId) {
  if (app.mode === "sketch") { app.toast("Finish the sketch first", "warn"); return null; }
  const ef = editId ? app.feature(editId) : null;
  const st0 = app.result && app.result.state;
  const expand = (r) => {
    if (r.kind === "occurrence" && st0) return M.occBodiesDeep(st0, r.occ).filter((id) => st0.bodies.has(id) && !M.isInstanceId(id)).map((id) => ({ kind: "body", body: id }));
    if (r.kind === "face" || r.kind === "edge") return { kind: "body", body: r.body };
    return r.kind === "body" && !M.isInstanceId(r.body) ? r : null;
  };
  const pre = editId ? [] : [...((app.selection && app.selection.items) || [])].flatMap((r) => { const x = expand(r); return Array.isArray(x) ? x : x ? [x] : []; });
  return app.ui.dialog.open({
    id: "ReplaceWithPrimitivesCommand",
    title: "Replace with Primitives",
    icon: "ReplaceWithPrimitivesCommand",
    editId: editId || null,
    featureLabel: "Replace With Primitive",
    help: "Replaces the selected bodies or components with simple primitive shapes that enclose them.",
    preselect: pre,
    ctrlWidth: 170,
    rows: [
      { id: "bodies", type: "selection", label: "Bodies", kinds: ["body", "occurrence"], mapRef: (r) => expand(r), filter: (r) => r.kind === "occurrence" || (st0 && st0.bodies.has(r.body)), prompt: "Select bodies or components to simplify" },
      { id: "shape", type: "dropdown", label: "Primitive Shape", options: [{ value: "box", label: "Box" }, { value: "cylinder", label: "Cylinder" }], default: "box" },
      { id: "axis", type: "dropdown", label: "Axis", options: [{ value: "auto", label: "Automatic" }, { value: "x", label: "X" }, { value: "y", label: "Y" }, { value: "z", label: "Z" }], default: "auto", visible: (v) => v.shape === "cylinder" },
    ],
    init(dlg) {
      if (ef) Object.assign(dlg.values, { bodies: (ef.bodies || []).map((id) => ({ kind: "body", body: id })), shape: ef.shape || "box", axis: ef.axis || "auto" });
    },
    build(v) {
      const ids = [...new Set((v.bodies || []).map((r) => r.body).filter(Boolean))];
      if (!ids.length) return null;
      return { type: "replaceprim", bodies: ids, shape: v.shape === "cylinder" ? "cylinder" : "box", axis: v.axis || "auto" };
    },
  });
}

// ------------------------------------------------------------------ Find Similar Components
function signatureOf(st, ids) {
  let vol = 0, faces = 0, edges = 0;
  const bbs = [];
  for (const id of ids) {
    const b = st.bodies.get(id);
    if (!b || !b.shape) continue;
    try { vol += Math.abs(K.volumeOf(b.shape)); } catch { /* surface */ }
    try { const t = K.topoOf(b.shape); faces += t.faces.length; edges += t.edges.length; } catch { /* no topology */ }
    bbs.push(K.bboxOf(b.shape));
  }
  const bb = unionBB(bbs);
  if (!bb) return null;
  const dims = [0, 1, 2].map((i) => bb.max[i] - bb.min[i]).sort((a, b) => b - a);
  return { vol, faces, edges, dims, n: ids.length };
}
const ratio = (a, b) => (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9 ? 1 : Math.min(Math.abs(a), Math.abs(b)) / Math.max(Math.abs(a), Math.abs(b)));
function similarity(a, b) {
  const parts = [ratio(a.vol, b.vol), ratio(a.dims[0], b.dims[0]), ratio(a.dims[1], b.dims[1]), ratio(a.dims[2], b.dims[2]), ratio(a.faces, b.faces), ratio(a.edges, b.edges), ratio(a.n, b.n)];
  const w = [3, 1, 1, 1, 2, 1, 1];
  return parts.reduce((s, p, i) => s + p * w[i], 0) / w.reduce((s, x) => s + x, 0);
}

/** Candidates of the open design: top-level occurrences and root bodies, ranked by shape similarity to `target`. */
export function findSimilar(app, target, threshold = 0.75) {
  const st = app.result.state;
  const C = app.components;
  const cands = [];
  const occs = C ? C.children(M.ROOT).filter((o) => C.alive(o)) : [];
  for (const o of occs) cands.push({ ref: { kind: "occurrence", occ: o }, key: `o:${o}`, label: C.label(o), ids: M.occBodiesDeep(st, o).filter((id) => st.bodies.has(id)) });
  for (const id of st.bodies.keys()) {
    const own = st.bodyOcc ? st.bodyOcc.get(id) : null;
    if ((own && own !== M.ROOT) || M.isInstanceId(id)) continue;
    cands.push({ ref: { kind: "body", body: id }, key: `b:${id}`, label: (app.doc.bodies[id] && app.doc.bodies[id].name) || id, ids: [id] });
  }
  const tKey = target.kind === "occurrence" ? `o:${target.occ}` : `b:${target.body}`;
  const t = cands.find((c) => c.key === tKey) || (target.kind === "occurrence" ? { key: tKey, ids: M.occBodiesDeep(st, target.occ).filter((id) => st.bodies.has(id)) } : { key: tKey, ids: [target.body] });
  const ts = signatureOf(st, t.ids);
  if (!ts) return [];
  const out = [];
  for (const c of cands) {
    if (c.key === tKey) continue;
    const s = signatureOf(st, c.ids);
    if (!s) continue;
    const score = similarity(ts, s);
    if (score >= threshold) out.push({ ...c, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

function openSimilar(app) {
  if (app.mode === "sketch") { app.toast("Finish the sketch first", "warn"); return null; }
  const st0 = app.result && app.result.state;
  const toTarget = (r) => {
    if (r.kind === "occurrence") return r.occ && r.occ !== M.ROOT ? { kind: "occurrence", occ: r.occ } : null;
    const id = r.body;
    if (!id || !st0) return null;
    const own = st0.bodyOcc ? st0.bodyOcc.get(id) : null;
    if (own && own !== M.ROOT && app.components) { const chain = app.components.ancestors(own).filter((o) => o && o !== M.ROOT); return { kind: "occurrence", occ: chain[chain.length - 1] }; }
    return { kind: "body", body: id };
  };
  const pre = [...((app.selection && app.selection.items) || [])].map(toTarget).filter(Boolean).slice(0, 1);
  let results = [];
  const tableHtml = () => {
    if (!results.length) return '<div class="ix-list-empty">No similar components in this design</div>';
    return `<table class="ix-table" data-table="similar"><tr><th>Component</th><th>Similarity</th></tr>${results.map((r, i) => `<tr class="ix-row-pick" data-row="${i}" data-key="${esc(r.key)}"><td>${esc(r.label)}</td><td>${Math.round(r.score * 100)}%</td></tr>`).join("")}</table>`;
  };
  const recompute = (dlg) => {
    const t = (dlg.values.target || [])[0];
    results = t ? findSimilar(app, t, (Number(dlg.values.threshold) || 75) / 100) : [];
  };
  return app.ui.dialog.open({
    id: "SimilarPartsCommand",
    title: "Find Similar Components",
    icon: "SimilarPartsCommand",
    featureLabel: "Find Similar Components",
    help: "Finds components in the open design whose shape is similar to the selected one (compared by a shape signature: volume, size, faces and edges).",
    preview: false, noFeature: true, preselect: pre, ctrlWidth: 210,
    rows: [
      { id: "target", type: "selection", label: "Component", kinds: ["body", "occurrence"], max: 1, mapRef: (r) => toTarget(r), prompt: "Select a component or body" },
      { id: "threshold", type: "dropdown", label: "Similarity", options: [{ value: "95", label: "95% or more" }, { value: "90", label: "90% or more" }, { value: "75", label: "75% or more" }, { value: "50", label: "50% or more" }], default: "75" },
      {
        id: "results", type: "custom",
        render(dlg) {
          const el = document.createElement("div");
          el.className = "dlg-row ix-similar-row";
          el.innerHTML = tableHtml();
          el.addEventListener("click", (e) => {
            const tr = e.target.closest && e.target.closest("tr[data-row]");
            const r = tr && results[Number(tr.dataset.row)];
            if (r) app.selection.set([r.ref]);
            void dlg;
          });
          return el;
        },
        update(el) { const h = tableHtml(); if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; } },
      },
    ],
    onOpen(dlg) { recompute(dlg); dlg.refresh(); },
    onChange(_id, dlg) { recompute(dlg); },
    status: () => (results.length ? `${results.length} similar` : ""),
    validate: (dlg) => ((dlg.values.target || []).length ? null : "Select a component"),
    commit: () => results,
    afterCommit: (_out, dlg) => { if (results.length) app.selection.set([...(dlg.values.target || []), ...results.map((r) => r.ref)]); },
  });
}

export function initLayout(app) {
  registerArrange();
  registerPrimitives();
  const reg = (c) => app.commands.register({ kind: "tool", ...c });
  reg({ id: "ArrangeCommand", label: "Arrange", tooltip: "Arranges components or bodies on a plane, planar face or sketch profile.", run: (a) => openArrange(a || app, null) });
  reg({ id: "SimilarPartsCommand", label: "Find Similar Components", tooltip: "Finds components of the open design that are similar to the selected one.", run: (a) => openSimilar(a || app) });
  reg({ id: "ReplaceWithPrimitivesCommand", label: "Replace with Primitives", tooltip: "Replaces bodies or components with enclosing primitive shapes (box or cylinder).", run: (a) => openPrimitives(a || app, null) });
  return { arrange: (id) => openArrange(app, id || null), similar: () => openSimilar(app), findSimilar: (ref, th) => findSimilar(app, ref, th), primitives: (id) => openPrimitives(app, id || null) };
}
