// Construction planes: Offset Plane, Plane at Angle, Midplane.
import * as THREE from "three";
import * as U from "./util.js";
import * as K from "../../kernel.js";

const V = U.V;

/**
 * Preview rectangle for a plane that is not in the document yet (the viewport draws the planes of
 * existing cplane features, including while they are being edited). Same look as the viewport's
 * construction planes: orange fill + edge, sized from the model and centred on its projection.
 */
function planePreview(dlg) {
  const app = dlg.app, vp = app.viewport;
  if (!vp || !vp.scene) return;
  const fid = dlg.previewFeature && dlg.previewFeature.id;
  const ps = fid && dlg.previewRes && dlg.previewRes.ok !== false && !app.feature(fid) ? app.planeState(fid) : null;
  if (!dlg._planeObj) {
    const g = new THREE.Group();
    g.userData.noPick = true;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.647, 0), transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    fill.renderOrder = 7;
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(15), 3));
    const edge = new THREE.Line(lgeo, new THREE.LineBasicMaterial({ color: new THREE.Color(0.902, 0.494, 0.208) }));
    edge.renderOrder = 8;
    g.add(fill, edge);
    vp.scene.add(g);
    dlg._planeObj = { g, fill, edge };
    const prevClose = dlg.close.bind(dlg);
    dlg.close = (c) => {
      const o = dlg._planeObj;
      if (o) { vp.scene.remove(o.g); o.fill.geometry.dispose(); o.fill.material.dispose(); o.edge.geometry.dispose(); o.edge.material.dispose(); dlg._planeObj = null; vp.requestRender(); }
      prevClose(c);
    };
  }
  const o = dlg._planeObj;
  o.g.visible = !!ps;
  if (ps) {
    const pl = ps.plane;
    // model extent of the state before the feature
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const b of dlg.baseState.bodies.values()) {
      const bb = K.bboxOf(b.shape);
      if (!bb) continue;
      for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); }
    }
    const has = Number.isFinite(mn[0]);
    const center = has ? V.mul(V.add(mn, mx), 0.5) : [0, 0, 0];
    const half = Math.max(has ? V.len(V.sub(mx, mn)) * 0.5 * 0.75 : 0, 15);
    const y = K.planeY(pl);
    const [cu, cv] = K.toLocal(pl, center);
    const P = (u, v) => K.toWorld(pl, u, v);
    const c = [P(cu - half, cv - half), P(cu + half, cv - half), P(cu + half, cv + half), P(cu - half, cv + half)];
    void y;
    o.fill.geometry.attributes.position.array.set(c.flat());
    o.fill.geometry.attributes.position.needsUpdate = true;
    o.fill.geometry.computeBoundingSphere();
    o.edge.geometry.attributes.position.array.set([...c.flat(), ...c[0]]);
    o.edge.geometry.attributes.position.needsUpdate = true;
    o.edge.geometry.computeBoundingSphere();
  }
  vp.requestRender();
}

export function openOffsetPlane(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "ConstructionPlaneOffsetFromPlaneCommand",
    title: "Offset Plane",
    icon: "ConstructionPlaneOffsetFromPlaneCommand",
    editId,
    help: "Creates a Construction Plane that is offset from the selected face or plane.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "originPlane" || r.kind === "cplane" || (r.kind === "face" && r.planar !== false)).slice(0, 1),
    rows: [
      { id: "plane", type: "selection", label: "Plane", kinds: ["originPlane", "cplane", "face"], planar: true, max: 1, toggle: false, prompt: "Select a plane or planar face" },
      { id: "extent", type: "dropdown", label: "Extent", options: [{ value: "distance", label: "Distance", icon: "distance" }, { value: "to", label: "To Object", icon: "toObject", disabled: true }] },
      { id: "offset", type: "value", label: "Distance", kind: "length", default: "0.00 mm" },
    ],
    init(dlg) { if (f0) Object.assign(dlg.values, { plane: [U.refFromPlaneRef(f0.base, dlg.baseState)].filter(Boolean), offset: f0.offset ?? "0.00 mm" }); },
    build(v) {
      const base = U.planeRefFromRef((v.plane || [])[0]);
      return base ? { type: "cplane", mode: "offset", base, offset: v.offset } : null;
    },
    afterPreview: planePreview,
    manipulators(dlg) {
      const base = U.planeRefFromRef((dlg.values.plane || [])[0]);
      const a = base && U.planeAnchor(base, dlg.baseState);
      if (!a) return [];
      return [dlg.valueManip("offset", { origin: a.o, dir: a.n })].filter(Boolean);
    },
  });
}

export function openPlaneAtAngle(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "ConstructionPlaneAtAngleCommand",
    title: "Plane at Angle",
    icon: "ConstructionPlaneAtAngleCommand",
    editId,
    help: "Creates a Construction Plane through an edge, axis, or line at a specific angle.",
    preselect: (opts.preselect || []).filter((r) => ["originAxis", "sketchCurve", "edge"].includes(r.kind)).slice(0, 1),
    rows: [
      { id: "axis", type: "selection", label: "Line", kinds: ["originAxis", "sketchCurve", "edge"], max: 1, toggle: false, prompt: "Select an edge, axis or sketch line", filter: (r, dlg) => (r.kind === "sketchCurve" ? U.sketchLineFilter(dlg.baseState)(r) : r.kind === "edge" ? U.isLinearEdge(dlg.baseState, r) : true) },
      { id: "angle", type: "value", label: "Angle", kind: "angle", default: "0.0 deg" },
    ],
    init(dlg) { if (f0) Object.assign(dlg.values, { axis: [U.refFromAxis(f0.axis, dlg.baseState)].filter(Boolean), angle: f0.angle ?? "0.0 deg" }); },
    build(v) {
      const axis = U.axisFromRef((v.axis || [])[0]);
      return axis ? { type: "cplane", mode: "angle", axis, angle: v.angle } : null;
    },
    afterPreview: planePreview,
  });
}

export function openMidplane(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const planes = (opts.preselect || []).filter((r) => r.kind === "originPlane" || r.kind === "cplane" || (r.kind === "face" && r.planar !== false)).slice(0, 2);
  return app.ui.dialog.open({
    id: "ConstructionMidPlaneCommand",
    title: "Midplane",
    icon: "ConstructionMidPlaneCommand",
    editId,
    help: "Creates a Construction Plane at the midpoint between two faces or planes.",
    preselect: planes,
    rows: [
      { id: "p1", type: "selection", label: "Plane 1", kinds: ["originPlane", "cplane", "face"], planar: true, max: 1, prompt: "Select the first plane or face" },
      { id: "p2", type: "selection", label: "Plane 2", kinds: ["originPlane", "cplane", "face"], planar: true, max: 1, prompt: "Select the second plane or face" },
    ],
    init(dlg) {
      if (f0) Object.assign(dlg.values, { p1: [U.refFromPlaneRef(f0.base, dlg.baseState)].filter(Boolean), p2: [U.refFromPlaneRef(f0.base2, dlg.baseState)].filter(Boolean) });
    },
    build(v) {
      const a = U.planeRefFromRef((v.p1 || [])[0]), b = U.planeRefFromRef((v.p2 || [])[0]);
      return a && b ? { type: "cplane", mode: "midplane", base: a, base2: b } : null;
    },
    afterPreview: planePreview,
  });
}
