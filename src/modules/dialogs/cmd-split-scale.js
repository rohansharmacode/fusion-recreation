// Split Body (FusionSplitBodyCommand) and Scale (ModifyScale).
import * as U from "./util.js";
import * as K from "../../kernel.js";
import { toBodyRef } from "./common.js";

const V = U.V;

function bodiesBox(state, ids) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const id of ids) {
    const b = state.bodies.get(id);
    const bb = b && K.bboxOf(b.shape);
    if (!bb) continue;
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); }
  }
  if (!Number.isFinite(mn[0])) return null;
  return { c: V.mul(V.add(mn, mx), 0.5), size: V.len(V.sub(mx, mn)) };
}

// ------------------------------------------------------------------ Split Body
/** Selection ref of the splitting tool -> stored tool ({tool} or {tools:[body]}). */
function toolOf(ref) {
  if (!ref) return null;
  if (ref.kind === "body") return { tools: [ref.body] };
  if (ref.kind === "face") return { tool: { kind: "face", body: ref.body, p: ref.p, n: ref.n } };
  const pr = U.planeRefFromRef(ref);
  return pr ? { tool: pr } : null;
}

export function openSplitBody(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const pre = opts.preselect || [];
  const toolCache = { key: "", shape: null };
  return app.ui.dialog.open({
    id: "FusionSplitBodyCommand",
    title: "Split Body",
    icon: "FusionSplitBodyCommand",
    featureLabel: "Split Body",
    editId,
    help: "Creates new bodies by dividing selected bodies using a profile, face, or plane. Select the bodies to modify then select the profile, face, or plane that divides the bodies.",
    preselect: pre.filter((r) => r.kind === "body").concat(pre.filter((r) => r.kind !== "body" && r.kind !== "face")),
    ctrlWidth: 118,
    rows: [
      { id: "bodies", type: "selection", label: "Body to Split", kinds: ["body", "face"], mapRef: toBodyRef, prompt: "Select Body to split", tooltip: "Select the solid bodies to split." },
      {
        id: "tool", type: "selection", label: "Splitting Tool(s)", kinds: ["originPlane", "cplane", "face", "body"], max: 1, prompt: "Select the splitting Tool(s)",
        tooltip: "Select a construction plane, origin plane, face or body that divides the bodies.",
        filter: (r, dlg) => !(r.kind === "body" && (dlg.values.bodies || []).some((b) => b.body === r.body)),
      },
      { id: "extend", type: "check", label: "Extend Splitting Tool(s)", default: true, tooltip: "Extends the splitting tool so that it fully intersects the body to split." },
    ],
    init(dlg) {
      if (!f0) return;
      const tool = f0.tools && f0.tools.length ? { kind: "body", body: f0.tools[0] }
        : f0.tool && f0.tool.kind === "face" ? U.faceRef(dlg.baseState, f0.tool.body, f0.tool.p, f0.tool.n) : U.refFromPlaneRef(f0.tool, dlg.baseState);
      Object.assign(dlg.values, { bodies: (f0.bodies || []).map((b) => ({ kind: "body", body: b })), tool: [tool].filter(Boolean), extend: f0.extend !== false });
    },
    status: (dlg) => { const n = (dlg.values.bodies || []).length; if (!n) return ""; if (n > 1) return `${n} Bodies`; const m = app.bodyMeta && app.bodyMeta(dlg.values.bodies[0].body); return (m && m.name) || "Body"; },
    build(v) {
      const bodies = (v.bodies || []).map((r) => r.body);
      const t = toolOf((v.tool || [])[0]);
      if (!bodies.length || !t) return null;
      return { type: "split", bodies, ...t, extend: !!v.extend };
    },
    // the splitting plane drawn see-through over the bodies (like Fusion's tool preview)
    extraPreview(dlg) {
      const ref = (dlg.values.tool || [])[0];
      const box = bodiesBox(dlg.baseState, (dlg.values.bodies || []).map((r) => r.body));
      if (!ref || !box || ref.kind === "body") return [];
      let pl = null;
      if (ref.kind === "face") { if (ref.planar !== false && dlg.values.extend) pl = { o: ref.p, n: ref.n }; }
      else pl = U.resolvePlane(U.planeRefFromRef(ref), dlg.baseState);
      if (!pl) return [];
      const key = JSON.stringify([pl.o, pl.n, box.c, box.size]);
      if (toolCache.key !== key) {
        toolCache.key = key;
        try { toolCache.shape = K.planeSquareFace(pl, box.c, box.size * 0.6 + 2); } catch { toolCache.shape = null; }
      }
      return toolCache.shape ? [{ shape: toolCache.shape, color: "#e8862e", opacity: 0.22 }] : [];
    },
  });
}

// ------------------------------------------------------------------ Scale
const SCALE_TYPES = [{ value: "uniform", label: "Uniform", icon: "scaleUniform" }, { value: "nonUniform", label: "Non Uniform", icon: "scaleNonUniform" }];

/** Selection ref of the scale point -> stored point. */
function pointOf(ref) {
  if (!ref || ref.kind === "originPoint") return { kind: "origin" };
  if (ref.kind === "sketchPoint") return { kind: "sketchPoint", sketch: ref.sketch, point: ref.point };
  if (ref.kind === "vertex") return { kind: "vertex", body: ref.body, p: ref.p };
  if (ref.kind === "cpoint") return { kind: "cpoint", id: ref.id }; // construction point (solidx)
  return { kind: "origin" };
}
function pointRef(pt) {
  if (!pt || pt.kind === "origin") return { kind: "originPoint" };
  if (pt.kind === "cpoint") return { kind: "cpoint", id: pt.id };
  if (pt.kind === "sketchPoint") return { kind: "sketchPoint", sketch: pt.sketch, point: pt.point };
  return { kind: "vertex", body: pt.body, p: pt.p };
}
function pointWorld(state, ref) {
  if (!ref || ref.kind === "originPoint") return [0, 0, 0];
  if (ref.kind === "sketchPoint") {
    const s = state.sketches.get(ref.sketch);
    const q = s && s.sk.points[ref.point];
    return q ? K.toWorld(s.plane, q.x, q.y) : [0, 0, 0];
  }
  if (ref.kind === "cpoint") { const c = state.points && state.points.get(ref.id); return c ? c.p : [0, 0, 0]; }
  return ref.p || [0, 0, 0];
}

export function openScale(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "ModifyScale",
    title: "Scale",
    icon: "ModifyScale",
    featureLabel: "Scale",
    editId,
    help: "Scales sketch objects, bodies, or components. Select the objects to scale and the point from which to scale, then specify the scale factor.",
    preselect: (opts.preselect || []).map(toBodyRef).filter(Boolean),
    ctrlWidth: 118,
    rows: [
      { id: "bodies", type: "selection", label: "Entities", kinds: ["body", "face"], mapRef: toBodyRef, prompt: "Select entities to scale" },
      { id: "point", type: "selection", label: "Point", kinds: ["vertex", "sketchPoint", "originPoint"], max: 1, toggle: false, prompt: "Select a point to scale from", default: [{ kind: "originPoint" }] },
      { id: "scaleType", type: "dropdown", label: "Scale Type", options: SCALE_TYPES, default: "uniform" },
      { id: "factor", type: "value", label: "Scale Factor", kind: "none", default: "1.00", positive: true, step: 0.1, visible: (v) => v.scaleType !== "nonUniform" },
      { id: "sx", type: "value", label: "X Scale", kind: "none", default: "1.00", positive: true, step: 0.1, visible: (v) => v.scaleType === "nonUniform" },
      { id: "sy", type: "value", label: "Y Scale", kind: "none", default: "1.00", positive: true, step: 0.1, visible: (v) => v.scaleType === "nonUniform" },
      { id: "sz", type: "value", label: "Z Scale", kind: "none", default: "1.00", positive: true, step: 0.1, visible: (v) => v.scaleType === "nonUniform" },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, { bodies: (f0.bodies || []).map((b) => ({ kind: "body", body: b })), point: [pointRef(f0.point)], scaleType: f0.scaleType === "nonUniform" ? "nonUniform" : "uniform" });
      for (const k of ["factor", "sx", "sy", "sz"]) if (f0[k] !== undefined && f0[k] !== "") dlg.values[k] = String(f0[k]);
    },
    status: (dlg) => { const n = (dlg.values.bodies || []).length; if (!n) return ""; if (n > 1) return `${n} Bodies`; const m = app.bodyMeta && app.bodyMeta(dlg.values.bodies[0].body); return (m && m.name) || "Body"; },
    build(v) {
      const bodies = (v.bodies || []).map((r) => r.body);
      if (!bodies.length) return null;
      const f = { type: "scale", bodies, point: pointOf((v.point || [])[0]), scaleType: v.scaleType };
      if (v.scaleType === "nonUniform") { f.sx = v.sx; f.sy = v.sy; f.sz = v.sz; } else f.factor = v.factor;
      return f;
    },
    manipulators(dlg) {
      const ids = (dlg.values.bodies || []).map((r) => r.body);
      const box = bodiesBox(dlg.baseState, ids);
      if (!box) return [];
      const c = pointWorld(dlg.baseState, (dlg.values.point || [])[0]);
      const L = Math.max(1, box.size / 2);
      if (dlg.values.scaleType === "nonUniform") {
        return [["sx", [1, 0, 0]], ["sy", [0, 1, 0]], ["sz", [0, 0, 1]]].map(([k, d]) => dlg.valueManip(k, { origin: c, dir: d, scale: L, min: 0.01, fixedDir: true })).filter(Boolean);
      }
      let d = V.sub(box.c, c);
      d = V.len(d) > 1e-6 ? V.norm(d) : [1, 0, 0];
      return [dlg.valueManip("factor", { origin: c, dir: d, scale: L, min: 0.01, fixedDir: true })].filter(Boolean);
    },
  });
}
