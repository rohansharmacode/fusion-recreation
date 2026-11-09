// MODIFY > Align (AlignCmd): moves the body (or, with Objects = Components, the component occurrence) that
// owns the From geometry so it lines up with the To geometry.
//
// align {objType:'bodies'|'components', bodies:[id], from: geo, to: geo, flip, angle}
// geo:  {kind:'face', body, p, n} | {kind:'edge', body, p} | {kind:'vertex', body, p}
//       | {kind:'point', ref: pointRef} | {kind:'plane', ref: planeRef} | {kind:'axis', ref: axisRef}
// Frames: planar face / plane -> (point, normal); cylinder face, straight or circular edge, axis -> (point,
// direction); vertex / point -> point. Plane to plane mates the faces (normals opposed, Flip turns it),
// axis to axis aligns directions; a point snaps onto the target (projected onto planes and axes). Angle
// turns the moved object about the target normal / axis.
// Components hook: with objType 'components' the owner occurrence of the From body is moved with
// model.js moveOccurrence (components contract); bodies of the root component are moved directly.
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import * as U from "../dialogs/util.js";
import { beginModelCommand } from "../dialogs/common.js";
import * as RF from "./refs.js";

const V = K.V;
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

function rotM(axis, ang, o = [0, 0, 0]) {
  const [x, y, z] = V.norm(axis), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  const r = [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  const ro = [r[0] * o[0] + r[1] * o[1] + r[2] * o[2], r[3] * o[0] + r[4] * o[1] + r[5] * o[2], r[6] * o[0] + r[7] * o[1] + r[8] * o[2]];
  return [r[0], r[1], r[2], o[0] - ro[0], r[3], r[4], r[5], o[1] - ro[1], r[6], r[7], r[8], o[2] - ro[2]];
}
/** a ∘ b (apply b first) for 3x4 row-major rigid matrices. */
function mul(a, b) {
  const o = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) o[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j];
    o[i * 4 + 3] = a[i * 4] * b[3] + a[i * 4 + 1] * b[7] + a[i * 4 + 2] * b[11] + a[i * 4 + 3];
  }
  return o;
}
const apply = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
const dirApply = (m, d) => [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]];

/** Rotation (about the origin) taking unit a onto unit b. */
function rotTo(a, b) {
  const c = V.dot(a, b);
  if (c > 1 - 1e-12) return IDENT;
  if (c < -1 + 1e-12) return rotM(RF.perp(a), Math.PI);
  return rotM(V.cross(a, b), Math.acos(Math.max(-1, Math.min(1, c))));
}

/** Frame of a geometry ref: {type:'plane'|'axis'|'point', p, d}. */
export function frameOf(st, g) {
  if (!g) throw new Error("Select geometry to align");
  if (g.kind === "face") {
    const { fi } = RF.faceOf(st, g, true);
    if (fi.type === "PLANE") return { type: "plane", p: fi.c, d: fi.n };
    if ((fi.type === "CYLINDRE" || fi.type === "CONE") && fi.a && fi.ao) {
      const a = V.norm(fi.a);
      return { type: "axis", p: V.add(fi.ao, V.mul(a, V.dot(V.sub(g.p, fi.ao), a))), d: a };
    }
    if (fi.type === "SPHERE" && fi.ao) return { type: "point", p: fi.ao };
    return { type: "point", p: g.p };
  }
  if (g.kind === "edge") {
    const b = st.bodies.get(g.body);
    if (!b) throw new Error("The referenced body is missing");
    const idx = M.locateEdge(b.shape, g);
    const ti = idx >= 0 ? K.topoOf(b.shape).edges[idx] : null;
    if (!ti) throw new Error("The referenced edge could not be found");
    if (ti.type === "LINE") return { type: "axis", p: ti.m, d: ti.d };
    if (ti.type === "CIRCLE" && ti.c) return { type: "axis", p: ti.c, d: ti.a };
    return { type: "point", p: ti.m };
  }
  if (g.kind === "vertex") return { type: "point", p: RF.pointOf(st, { kind: "vertex", body: g.body, p: g.p }) };
  if (g.kind === "point") return { type: "point", p: RF.pointOf(st, g.ref) };
  if (g.kind === "plane") { const pl = RF.planeOf(st, g.ref); return { type: "plane", p: pl.o, d: pl.n }; }
  if (g.kind === "axis") { const l = M.axisFromRef(st, g.ref); return { type: "axis", p: l.o, d: V.norm(l.d) }; }
  throw new Error("Unsupported geometry");
}

/** Rigid 3x4 matrix moving frame A onto frame B. */
export function alignMatrix(A, B, flip, angleRad) {
  let m = IDENT;
  let to = B.p;
  if (A.type !== "point" && B.type !== "point") {
    let b = B.d;
    if (A.type === "plane" && B.type === "plane") b = flip ? b : V.mul(b, -1);
    else if (flip) b = V.mul(b, -1);
    m = rotTo(V.norm(A.d), V.norm(b));
  }
  const p1 = apply(m, A.p);
  if (A.type === "point" && B.type === "plane") to = V.sub(p1, V.mul(B.d, V.dot(V.sub(p1, B.p), B.d)));
  if (A.type === "point" && B.type === "axis") to = V.add(B.p, V.mul(B.d, V.dot(V.sub(p1, B.p), B.d)));
  const t = V.sub(to, p1);
  m = mul([1, 0, 0, t[0], 0, 1, 0, t[1], 0, 0, 1, t[2]], m);
  if (angleRad && B.type !== "point") m = mul(rotM(B.d, angleRad, to), m);
  return m;
}

export const ALIGN_FEATURE = {
  label: "Align", stem: "Align", fields: { angle: "angle" }, icon: "AlignCmd",
  apply(st, f, P, doc) {
    const A = frameOf(st, f.from), B = frameOf(st, f.to);
    const m = alignMatrix(A, B, !!f.flip, (M.fval(P, f, "angle") * Math.PI) / 180);
    const ids = (f.bodies || []).filter((id) => st.bodies.has(id) || (st.meshBodies && st.meshBodies.has(id)));
    if (!ids.length) throw new Error("Select geometry on a body to align");
    if (f.objType === "components" && typeof M.moveOccurrence === "function" && typeof M.bodyOwner === "function") {
      const root = M.bodyOwner({}, "");
      const oid = M.bodyOwner(st, ids[0]);
      if (oid && oid !== root && st.occ && st.occ.has(oid)) {
        M.moveOccurrence(st, doc, oid, mul(m, st.occ.get(oid).T));
        return { affected: ids };
      }
    }
    for (const id of ids) {
      const b = st.bodies.get(id);
      if (b) st.bodies.set(id, { ...b, shape: M.transformShape(b.shape, m), from: f.id });
      else if (st.meshBodies && typeof M.transformMesh === "function") {
        const e = st.meshBodies.get(id);
        try { st.meshBodies.set(id, { ...e, mesh: M.transformMesh(e.mesh, m), from: f.id }); } catch { /* mesh stays */ }
      }
    }
    return { affected: ids };
  },
  touches: (f) => f.bodies || [],
};

// ---------------------------------------------------------------------------------------------
// dialog
// ---------------------------------------------------------------------------------------------
function geoFromSel(r) {
  if (!r) return null;
  if (r.kind === "face") return { kind: "face", body: r.body, p: r.p, n: r.n };
  if (r.kind === "edge") return { kind: "edge", body: r.body, p: r.p };
  if (r.kind === "vertex") return { kind: "vertex", body: r.body, p: r.p };
  if (r.kind === "sketchPoint" || r.kind === "originPoint" || r.kind === "cpoint") return { kind: "point", ref: RF.pointRefFromSel(r) };
  if (r.kind === "originPlane" || r.kind === "cplane") return { kind: "plane", ref: U.planeRefFromRef(r) };
  if (r.kind === "originAxis" || r.kind === "caxis") return { kind: "axis", ref: U.axisFromRef(r) };
  return null;
}
function selFromGeo(g, state) {
  if (!g) return null;
  if (g.kind === "face") return U.faceRef(state, g.body, g.p, g.n);
  if (g.kind === "edge") return U.edgeRef(state, g.body, g.p);
  if (g.kind === "vertex") return { kind: "vertex", body: g.body, p: g.p };
  if (g.kind === "point") return RF.selFromPointRef(g.ref);
  if (g.kind === "plane") return U.refFromPlaneRef(g.ref, state);
  if (g.kind === "axis") return U.refFromAxis(g.ref, state);
  return null;
}
const OBJECTS = [{ value: "bodies", label: "Bodies", icon: "bodies" }, { value: "components", label: "Components", icon: "components" }];

export function openAlign(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  return app.ui.dialog.open({
    id: "AlignCmd", title: "Align", icon: "AlignCmd", editId, featureLabel: "Align",
    help: "Moves an object by lining up geometry on it with geometry somewhere else.",
    preselect: (opts.preselect || []).filter((r) => ["face", "edge", "vertex"].includes(r.kind)).slice(0, 2),
    rows: [
      { id: "objType", type: "buttons", label: "Objects", options: OBJECTS, default: "bodies" },
      { id: "from", type: "selection", label: "From", kinds: ["face", "edge", "vertex"], max: 1, toggle: false, prompt: "Select geometry or snap point on alignable object" },
      { id: "to", type: "selection", label: "To", kinds: ["face", "edge", "vertex", "sketchPoint", "originPlane", "originAxis", "originPoint", "cplane", "caxis", "cpoint"], max: 1, toggle: false, prompt: "Select target geometry or snap point", filter: (r, dlg) => !(r.body && (dlg.values.from || []).some((x) => x.body === r.body)) },
      { id: "flip", type: "check", label: "Flip", default: false },
      { id: "angle", type: "value", label: "Angle", kind: "angle", default: "0.0 deg" },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, { objType: f0.objType || "bodies", from: [selFromGeo(f0.from, dlg.baseState)].filter(Boolean), to: [selFromGeo(f0.to, dlg.baseState)].filter(Boolean), flip: !!f0.flip, angle: f0.angle || "0.0 deg" });
    },
    build(v) {
      const from = geoFromSel((v.from || [])[0]), to = geoFromSel((v.to || [])[0]);
      if (!from || !to) return null;
      return { type: "align", objType: v.objType, bodies: [from.body], from, to, flip: !!v.flip, angle: v.angle };
    },
  });
}

export function registerAlign(app) {
  try { M.registerFeature("align", { ...ALIGN_FEATURE, editor: (a, id) => { beginModelCommand(a); return openAlign(a, { editId: id }); } }); } catch (e) { console.error("[solidx]", e); }
  app.commands.register({
    id: "AlignCmd", label: "Align", tooltip: "Moves an object by lining up geometry on it with geometry somewhere else.", kind: "feature",
    run: (a, ctx = {}) => { const pre = beginModelCommand(a); return openAlign(a, { preselect: ctx.preselect || pre }); },
  });
}
