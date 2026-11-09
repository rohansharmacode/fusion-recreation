// createx: Coordinate System (CoordinateSystemCommand), Fusion's user coordinate system (UCS).
// Feature 'csys' -> st.csys Map id -> {id, o, x, y, z}; drawn as an RGB triad, pickable as {kind:'feature', id},
// listed in the browser Construction folder; Bounding Solid can orient to it.
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import { V, orthoFrame, WORLD } from "./geom.js";

const RAD = Math.PI / 180;

// ---------------------------------------------------------------- evaluation
/** Frame {o, x, y, z} of a snap ref stored in a feature (vertex / sketch point / face / edge / origin). */
export function snapFrame(st, r) {
  if (!r || r.kind === "originPoint" || r.kind === "origin") return { ...WORLD };
  if (r.kind === "sketchPoint") {
    const s = st.sketches.get(r.sketch);
    const q = s && s.sk.points[r.point];
    if (!q) throw new Error("The snap point is missing");
    return orthoFrame(K.toWorld(s.plane, q.x, q.y), s.plane.n, s.plane.x);
  }
  if (r.kind === "vertex") return { ...WORLD, o: [...r.p] };
  const b = st.bodies.get(r.body);
  if (!b) throw new Error("The snap geometry is missing");
  if (r.kind === "face") {
    const idx = M.locateFace(b.shape, r);
    if (idx < 0) throw new Error("The snap face is missing");
    const fi = K.topoOf(b.shape).faces[idx];
    if (fi && (fi.type === "CYLINDRE" || fi.type === "CONE") && fi.a) {
      const t = V.dot(V.sub(r.p, fi.ao), fi.a);
      return orthoFrame(V.add(fi.ao, V.mul(fi.a, t)), fi.a);
    }
    if (fi && fi.type === "SPHERE" && fi.ao) return { ...WORLD, o: [...fi.ao] };
    const n = fi && fi.type === "PLANE" ? fi.n : r.n || [0, 0, 1];
    const pl = K.planeFromNormal(r.p, n);
    return orthoFrame(r.p, pl.n, pl.x);
  }
  if (r.kind === "edge") {
    const idx = M.locateEdge(b.shape, r);
    if (idx < 0) throw new Error("The snap edge is missing");
    const ei = K.topoOf(b.shape).edges[idx];
    if (ei && ei.type === "CIRCLE" && ei.c) return orthoFrame(ei.c, ei.a);
    if (ei && ei.type === "LINE") {
      const m = V.mul(V.add(ei.s, ei.t), 0.5);
      const z = Math.abs(V.dot(ei.d, [0, 0, 1])) > 0.99 ? [0, 1, 0] : [0, 0, 1];
      return orthoFrame(m, z, ei.d);
    }
    return { ...WORLD, o: [...(r.p || [0, 0, 0])] };
  }
  throw new Error("Unsupported snap point");
}

function planeOfFaceRef(st, r) {
  const b = r && st.bodies.get(r.body);
  if (!b) throw new Error("Select two planar faces");
  const idx = M.locateFace(b.shape, r);
  const fi = idx >= 0 ? K.topoOf(b.shape).faces[idx] : null;
  if (!fi || fi.type !== "PLANE") throw new Error("Select two planar faces");
  return { o: r.p, n: fi.n };
}

/** World frame of a csys feature. */
export function csysFrame(st, f, P) {
  let F;
  if (f.csysType === "twoFaces") {
    const p1 = planeOfFaceRef(st, f.face1), p2 = planeOfFaceRef(st, f.face2);
    const base = f.snap ? snapFrame(st, f.snap).o : p1.o;
    const proj = (pl) => V.sub(base, V.mul(pl.n, V.dot(V.sub(base, pl.o), pl.n)));
    const o = V.mul(V.add(proj(p1), proj(p2)), 0.5);
    const pl = K.planeFromNormal(o, p1.n);
    F = orthoFrame(o, pl.n, pl.x);
  } else F = snapFrame(st, f.snap);
  if (f.align) {
    try {
      const ax = M.axisFromRef(st, f.align);
      const d = V.sub(ax.d, V.mul(F.z, V.dot(ax.d, F.z)));
      if (V.len(d) > 1e-6) F = orthoFrame(F.o, F.z, d);
    } catch { /* alignment geometry gone: keep the snap frame */ }
  }
  const num = (k) => (f[k] !== undefined && f[k] !== "" ? M.fval(P, f, k) : 0);
  const off = [num("xOff"), num("yOff"), num("zOff")];
  let o = V.add(F.o, V.add(V.mul(F.x, off[0]), V.add(V.mul(F.y, off[1]), V.mul(F.z, off[2]))));
  let x = F.x, y = F.y, z = F.z;
  const rot = (v, a, deg) => {
    const t = deg * RAD, c = Math.cos(t), s = Math.sin(t);
    return V.add(V.add(V.mul(v, c), V.mul(V.cross(a, v), s)), V.mul(a, V.dot(a, v) * (1 - c)));
  };
  const rx = num("xRot"), ry = num("yRot"), rz = num("zRot");
  if (rx) { y = rot(y, x, rx); z = rot(z, x, rx); }
  if (ry) { x = rot(x, y, ry); z = rot(z, y, ry); }
  if (rz) { x = rot(x, z, rz); y = rot(y, z, rz); }
  if (f.flipZ) { z = V.mul(z, -1); y = V.mul(y, -1); }
  if (f.flipX) { x = V.mul(x, -1); y = V.mul(y, -1); }
  return { o, x: V.norm(x), y: V.norm(y), z: V.norm(z) };
}

/** Frame of a coordinate-system feature in a state (null when missing). */
export const frameOf = (st, id) => (st && st.csys && st.csys.get(id)) || null;

export function registerCsysFeature(app) {
  M.registerFeature("csys", {
    label: "Coordinate System",
    stem: "CoordinateSystem",
    fields: { xOff: "length", yOff: "length", zOff: "length", xRot: "angle", yRot: "angle", zRot: "angle" },
    apply(st, f, P) {
      const F = csysFrame(st, f, P);
      st.csys = new Map(st.csys || []);
      st.csys.set(f.id, { id: f.id, ...F });
      return { csys: F };
    },
    deps: (f) => {
      const refs = [f.snap, f.face1, f.face2, f.align].filter(Boolean);
      return {
        sketches: refs.filter((r) => r.kind === "sketchPoint" || r.kind === "sketchLine").map((r) => r.sketch),
        bodies: refs.filter((r) => r.body).map((r) => r.body), features: [], cplanes: [], geo: refs.filter((r) => r.body),
      };
    },
    editor: (a, id) => openCsys(a, { editId: id }),
    icon: "CoordinateSystemCommand",
    browser: { folder: "construction" },
  });
}

// ---------------------------------------------------------------- dialog
const SNAP_KINDS = ["vertex", "sketchPoint", "face", "edge", "originPoint"];
const storeSnap = (r) => {
  if (!r) return null;
  if (r.kind === "sketchPoint") return { kind: "sketchPoint", sketch: r.sketch, point: r.point };
  if (r.kind === "originPoint") return { kind: "originPoint" };
  if (r.kind === "vertex") return { kind: "vertex", body: r.body, p: r.p };
  if (r.kind === "face") return { kind: "face", body: r.body, p: r.p, n: r.n };
  if (r.kind === "edge") return { kind: "edge", body: r.body, p: r.p };
  return null;
};
const selOfSnap = (r) => (r ? (r.kind === "face" || r.kind === "edge" ? { ...r } : { ...r }) : null);

export function openCsys(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const U = app.ui.dialog;
  return U.open({
    id: "CoordinateSystemCommand",
    title: "Coordinate System",
    icon: "CoordinateSystemCommand",
    editId,
    featureLabel: "Coordinate System",
    help: "Creates a custom coordinate system that you can reference in assembly relationships, manufacturing setups or other downstream workflows.",
    preselect: opts.preselect || [],
    rows: [
      { id: "csysType", type: "dropdown", label: "Type", tooltip: "Coordinate System Type", options: [{ value: "simple", label: "Simple" }, { value: "twoFaces", label: "Between Two Faces" }], default: "simple" },
      { id: "face1", type: "selection", label: "Plane 1", kinds: ["face"], planar: true, max: 1, prompt: "Select the first planar face", visible: (v) => v.csysType === "twoFaces" },
      { id: "face2", type: "selection", label: "Plane 2", kinds: ["face"], planar: true, max: 1, prompt: "Select the second planar face", visible: (v) => v.csysType === "twoFaces" },
      { id: "snap", type: "selection", label: "Snap", kinds: SNAP_KINDS, max: 1, min: 1, prompt: "Select a snap point", tooltip: "Select a snap point, a face, an edge or the origin to place the coordinate system." },
      { id: "align", type: "selection", label: "Alignment", kinds: ["originAxis", "edge", "sketchCurve"], max: 1, min: 0, prompt: "Select an axis to align the X axis to", tooltip: "Aligns the X axis with a linear edge, axis or sketch line.",
        filter: (r, dlg) => (r.kind === "edge" ? isLinear(dlg, r) : r.kind === "sketchCurve" ? isSketchLine(dlg, r) : true) },
      { id: "g", type: "group", label: "Orientation", rows: [
        { id: "xRot", type: "value", label: "X Rotation", kind: "angle", default: "0.0 deg" },
        { id: "yRot", type: "value", label: "Y Rotation", kind: "angle", default: "0.0 deg" },
        { id: "zRot", type: "value", label: "Z Rotation", kind: "angle", default: "0.0 deg" },
        { id: "xOff", type: "value", label: "X Offset", kind: "length", default: "0.00 mm" },
        { id: "yOff", type: "value", label: "Y Offset", kind: "length", default: "0.00 mm" },
        { id: "zOff", type: "value", label: "Z Offset", kind: "length", default: "0.00 mm" },
        { id: "flipX", type: "check", label: "Flip X", tooltip: "Flips the orientation of the X axis.", default: false },
        { id: "flipZ", type: "check", label: "Flip Z", tooltip: "Flips the orientation of the Z axis.", default: false },
      ] },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      Object.assign(dlg.values, {
        csysType: f0.csysType || "simple",
        snap: [f0.snap ? selOfSnap(f0.snap) : null].filter(Boolean),
        face1: [f0.face1].filter(Boolean).map((r) => ({ kind: "face", ...r })),
        face2: [f0.face2].filter(Boolean).map((r) => ({ kind: "face", ...r })),
        align: [f0.align ? U_refFromAxis(app, f0.align, st) : null].filter(Boolean),
        flipX: !!f0.flipX, flipZ: !!f0.flipZ,
      });
      for (const k of ["xRot", "yRot", "zRot", "xOff", "yOff", "zOff"]) if (f0[k] !== undefined) dlg.values[k] = String(f0[k]);
    },
    build(v) {
      const snap = storeSnap((v.snap || [])[0]);
      if (!snap) return null;
      const f = { type: "csys", csysType: v.csysType, snap, xRot: v.xRot, yRot: v.yRot, zRot: v.zRot, xOff: v.xOff, yOff: v.yOff, zOff: v.zOff };
      if (v.csysType === "twoFaces") {
        const a = (v.face1 || [])[0], b = (v.face2 || [])[0];
        if (!a || !b) return null;
        f.face1 = { body: a.body, p: a.p, n: a.n };
        f.face2 = { body: b.body, p: b.p, n: b.n };
      }
      const al = (v.align || [])[0];
      const ax = al ? axisOfSel(al) : null;
      if (ax) f.align = ax;
      if (v.flipX) f.flipX = true;
      if (v.flipZ) f.flipZ = true;
      return f;
    },
    manipulators(dlg) {
      const r = dlg.previewRes;
      const F = r && r.csys;
      if (!F) return [];
      // offsets are measured along the snapped frame: drag arrows start at the snapped origin
      const out = [];
      for (const [k, dir] of [["xOff", F.x], ["yOff", F.y], ["zOff", F.z]]) {
        const cur = dlg.num(k);
        const origin = V.sub(F.o, V.mul(dir, Number.isFinite(cur) ? cur : 0));
        const m = dlg.valueManip(k, { origin, dir, id: k });
        if (m) out.push(m);
      }
      return out;
    },
  });
}

function isLinear(dlg, r) {
  const b = dlg.baseState.bodies.get(r.body);
  if (!b) return false;
  try { const idx = M.locateEdge(b.shape, { body: r.body, p: r.p }); return idx >= 0 && K.topoOf(b.shape).edges[idx].type === "LINE"; } catch { return false; }
}
function isSketchLine(dlg, r) {
  const s = dlg.baseState.sketches.get(r.sketch);
  const cv = s && s.sk.curves[r.curve];
  return !!cv && cv.type === "line";
}
/** Axis ref (axisFromRef format) of an alignment selection. */
function axisOfSel(r) {
  if (r.kind === "originAxis") return { kind: "origin", name: r.name };
  if (r.kind === "sketchCurve") return { kind: "sketchLine", sketch: r.sketch, curve: r.curve };
  if (r.kind === "edge") return { kind: "edge", body: r.body, p: r.p };
  return null;
}
function U_refFromAxis(app, ax) {
  if (ax.kind === "origin") return { kind: "originAxis", name: ax.name };
  if (ax.kind === "sketchLine") return { kind: "sketchCurve", sketch: ax.sketch, curve: ax.curve };
  if (ax.kind === "edge") return { kind: "edge", body: ax.body, p: ax.p, index: -1 };
  return null;
}

// ---------------------------------------------------------------- display + picking
const COLORS = { x: 0xd2433b, y: 0x4aa64a, z: 0x2f6fd6 };
const PX = 56; // triad axis length in screen pixels

export function installCsysDisplay(app) {
  const vp = app.viewport;
  if (!vp || !vp.THREE || !vp.groups) return;
  const THREE = vp.THREE;
  const root = new THREE.Group();
  root.name = "createx-csys";
  vp.groups.construction.add(root);
  let items = []; // {id, F, group, mats}
  let lastState = null;

  const visible = (id) => { const f = app.feature(id); return !!f && f.visible !== false; };
  const selected = (id) => app.selection.items.some((r) => r.kind === "feature" && r.id === id);
  const hovered = (id) => { const h = app.selection.hover; return !!h && h.kind === "feature" && h.id === id; };

  function rebuild(state) {
    lastState = state || lastState;
    for (const it of items) { root.remove(it.group); it.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    items = [];
    const cs = lastState && lastState.csys;
    if (!cs) { vp.requestRender(); return; }
    for (const [id, F] of cs) {
      if (!visible(id)) continue;
      const g = new THREE.Group();
      const mats = {};
      for (const k of ["x", "y", "z"]) {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(...F[k])]);
        const mat = new THREE.LineBasicMaterial({ color: COLORS[k], depthTest: false, transparent: true });
        mats[k] = mat;
        const ln = new THREE.Line(geo, mat);
        ln.renderOrder = 5;
        ln.userData = { noPick: true };
        g.add(ln);
        // arrow head: small cone-like triangle fan as lines
        const tip = new THREE.Vector3(...F[k]);
        const side = k === "z" ? F.x : F.z;
        const back = V.mul(F[k], 0.82);
        const hgeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...V.add(back, V.mul(side, 0.07))), tip, new THREE.Vector3(...V.sub(back, V.mul(side, 0.07)))]);
        const hl = new THREE.Line(hgeo, mat);
        hl.renderOrder = 5;
        hl.userData = { noPick: true };
        g.add(hl);
      }
      const dotGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0)]);
      const dotMat = new THREE.PointsMaterial({ color: 0x404040, size: 6, sizeAttenuation: false, depthTest: false, transparent: true });
      mats.dot = dotMat;
      const dot = new THREE.Points(dotGeo, dotMat);
      dot.renderOrder = 6;
      dot.userData = { noPick: true };
      g.add(dot);
      g.position.set(...F.o);
      root.add(g);
      items.push({ id, F, group: g, mats });
    }
    restyle();
    rescale();
  }
  function restyle() {
    for (const it of items) {
      const sel = selected(it.id), hov = hovered(it.id);
      for (const k of ["x", "y", "z"]) it.mats[k].color.setHex(sel ? 0x0696d7 : hov ? 0x6fb7f0 : COLORS[k]);
      it.mats.dot.color.setHex(sel || hov ? 0x0696d7 : 0x404040);
    }
    vp.requestRender();
  }
  function rescale() {
    for (const it of items) {
      const px = vp.pixelSize ? vp.pixelSize(it.F.o) : 0.2;
      const s = Math.max(1e-6, px * PX);
      it.group.scale.set(s, s, s);
      it.len = s;
    }
  }
  app.on("model", (e) => { try { rebuild(e && e.detail && e.detail.result ? e.detail.result.state : app.result && app.result.state); } catch (err) { app.reportError ? app.reportError(err, { where: "csys display" }) : null; } });
  app.on("doc", () => { try { rebuild(app.result && app.result.state); } catch { /* ignore */ } });
  app.on("selection", restyle);
  app.on("hover", restyle);
  app.on("camera", () => { if (items.length) rescale(); });
  if (app.result) rebuild(app.result.state);

  vp.addPickProvider((x, y, ray) => {
    const hits = [];
    for (const it of items) {
      const o = vp.toScreen(it.F.o);
      const dO = Math.hypot(o[0] - x, o[1] - y);
      const depth = V.dot(V.sub(it.F.o, ray.o), ray.d);
      if (dO <= 8) { hits.push({ ref: { kind: "feature", id: it.id }, point: [...it.F.o], depth, screenDist: dO, type: "point" }); continue; }
      let best = Infinity;
      for (const k of ["x", "y", "z"]) {
        const tip = vp.toScreen(V.add(it.F.o, V.mul(it.F[k], it.len || 10)));
        const dx = tip[0] - o[0], dy = tip[1] - o[1];
        const L2 = dx * dx + dy * dy || 1e-9;
        const u = Math.max(0, Math.min(1, ((x - o[0]) * dx + (y - o[1]) * dy) / L2));
        best = Math.min(best, Math.hypot(o[0] + u * dx - x, o[1] + u * dy - y));
      }
      if (best <= 5) hits.push({ ref: { kind: "feature", id: it.id }, point: [...it.F.o], depth, screenDist: best, type: "curve" });
    }
    return hits;
  });
}
