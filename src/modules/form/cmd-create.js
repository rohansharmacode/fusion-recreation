// FORM > CREATE: Box, Plane, Cylinder, Sphere, Torus, Quadball, Pipe, Face, Extrude, Revolve, Sweep, Loft.
import * as U from "../dialogs/util.js";
import * as P from "./prims.js";
import { openFormDialog, tsRow, cageOf, shownCage, axisOfRef } from "./common.js";
import { curveChains, resampleChain, autoFaces } from "./curves.js";
import { V, topo, vertexNormal, faceCentroid, tidy } from "./cage.js";
import { extrudeEdges } from "./ops.js";
import { fitToTargets } from "./ops.js";

const OPS = [{ value: "new", label: "New Body", icon: "newBody" }, { value: "newComponent", label: "New Component", icon: "newComponent" }];
const SYM_MIRROR = [{ value: "none", label: "None" }, { value: "mirror", label: "Mirror" }];
const SYM_ALL = [...SYM_MIRROR, { value: "circular", label: "Circular" }];
const DIRS = [{ value: "one", label: "One Side", icon: "oneSide" }, { value: "sym", label: "Symmetric", icon: "symmetric" }];
const int = (id, label, def, extra = {}) => ({ id, type: "value", label, kind: "none", default: String(def), integer: true, min: 1, step: 1, ...extra });
const len = (id, label, def, extra = {}) => ({ id, type: "value", label, kind: "length", default: `${def.toFixed(2)} mm`, positive: true, ...extra });
const PLANE_KINDS = ["originPlane", "cplane", "face"];
const planeRow = { id: "plane", type: "selection", label: "Sketch Plane", kinds: PLANE_KINDS, planar: true, max: 1, toggle: false, prompt: "Select a plane or planar face" };

function planeOf(dlg) {
  try { return U.resolvePlane(U.planeRefFromRef((dlg.values.plane || [])[0]), dlg.baseState); } catch { return null; }
}
function centerOf(dlg) {
  const pl = planeOf(dlg);
  if (!pl) return null;
  const c = dlg.values.center || [0, 0];
  return { pl, c: dlg.app.K.toWorld(pl, c[0], c[1]) };
}
function symSpec(v, kind) {
  if (!v.symmetry || v.symmetry === "none") return null;
  if (v.symmetry === "circular") return { type: "circular" };
  return { type: "mirror", length: v.lengthSym !== false, width: v.widthSym !== false, height: !!v.heightSym && kind !== "plane" };
}

// ---------------------------------------------------------------- primitives
const PRIMS = {
  box: {
    id: "TSplinePrimitiveBoxCommand", title: "Box", help: "Creates a T-Spline box. Select a plane and draw a rectangle. Use the manipulators or input fields to specify the height and number of faces.",
    rect: true,
    rows: [len("length", "Length", 20), int("lengthFaces", "Length Faces", 2), len("width", "Width", 20), int("widthFaces", "Width Faces", 2), len("height", "Height", 20), int("heightFaces", "Height Faces", 2),
      { id: "dir", type: "buttons", label: "Direction", options: DIRS, default: "one" }],
    sym: SYM_MIRROR, symRows: ["lengthSym", "widthSym", "heightSym"],
    make: (v, dlg, pl, c) => P.box({ pl, c, L: dlg.num("length"), Wd: dlg.num("width"), H: dlg.num("height"), nl: dlg.num("lengthFaces"), nw: dlg.num("widthFaces"), nh: dlg.num("heightFaces"), dir: v.dir, sym: symSpec(v) }),
    manips: (dlg, pl, c) => [dlg.valueManip("height", { origin: c, dir: pl.n, min: 0.01 }), dlg.valueManip("length", { origin: c, dir: pl.x, scale: 0.5, min: 0.01 }), dlg.valueManip("width", { origin: c, dir: V.cross(pl.n, pl.x), scale: 0.5, min: 0.01 })],
  },
  plane: {
    id: "TSplinePrimitivePlaneCommand", title: "Plane", help: "Creates a T-Spline plane. Select a plane and draw a rectangle. Use the manipulators or input fields to specify the number of faces.",
    rect: true,
    rows: [len("length", "Length", 20), int("lengthFaces", "Length Faces", 2), len("width", "Width", 20), int("widthFaces", "Width Faces", 2)],
    sym: SYM_MIRROR, symRows: ["lengthSym", "widthSym"],
    make: (v, dlg, pl, c) => P.plane({ pl, c, L: dlg.num("length"), Wd: dlg.num("width"), nl: dlg.num("lengthFaces"), nw: dlg.num("widthFaces"), sym: symSpec(v, "plane") }),
    manips: (dlg, pl, c) => [dlg.valueManip("length", { origin: c, dir: pl.x, scale: 0.5, min: 0.01 }), dlg.valueManip("width", { origin: c, dir: V.cross(pl.n, pl.x), scale: 0.5, min: 0.01 })],
  },
  cylinder: {
    id: "TSplinePrimitiveCylinderCommand", title: "Cylinder", help: "Creates a T-Spline cylinder. Select a plane and click the centre; drag the arrows or type the diameter and height.",
    rows: [len("diameter", "Diameter", 20), int("diameterFaces", "Diameter Faces", 8, { min: 3 }), len("height", "Height", 20), int("heightFaces", "Height Faces", 1),
      { id: "dir", type: "buttons", label: "Direction", options: DIRS, default: "one" }],
    sym: SYM_ALL, symRows: ["lengthSym", "widthSym", "heightSym"],
    make: (v, dlg, pl, c) => P.cylinder({ pl, c, D: dlg.num("diameter"), nd: dlg.num("diameterFaces"), H: dlg.num("height"), nh: dlg.num("heightFaces"), dir: v.dir, sym: symSpec(v) }),
    manips: (dlg, pl, c) => [dlg.valueManip("height", { origin: c, dir: pl.n, min: 0.01 }), dlg.valueManip("diameter", { origin: c, dir: pl.x, scale: 0.5, min: 0.01 })],
  },
  sphere: {
    id: "TSplinePrimitiveSphereCommand", title: "Sphere", help: "Creates a T-Spline sphere. Select a plane and click the centre.",
    rows: [len("diameter", "Diameter", 20), int("longFaces", "Longitude Faces", 8, { min: 3 }), int("latFaces", "Latitude Faces", 4, { min: 2 })],
    sym: SYM_ALL, symRows: ["lengthSym", "widthSym", "heightSym"],
    make: (v, dlg, pl, c) => P.sphere({ pl, c, D: dlg.num("diameter"), nlong: dlg.num("longFaces"), nlat: dlg.num("latFaces"), sym: symSpec(v) }),
    manips: (dlg, pl, c) => [dlg.valueManip("diameter", { origin: c, dir: pl.n, scale: 0.5, min: 0.01 })],
  },
  torus: {
    id: "TSplinePrimitiveTorusCommand", title: "Torus", help: "Creates a T-Spline torus. Select a plane and click the centre.",
    rows: [len("d1", "Diameter 1", 40), int("d1Faces", "Diameter 1 Faces", 8, { min: 3 }), len("d2", "Diameter 2", 10), int("d2Faces", "Diameter 2 Faces", 6, { min: 3 })],
    sym: SYM_ALL, symRows: ["lengthSym", "widthSym", "heightSym"],
    make: (v, dlg, pl, c) => P.torus({ pl, c, D1: dlg.num("d1"), n1: dlg.num("d1Faces"), D2: dlg.num("d2"), n2: dlg.num("d2Faces"), sym: symSpec(v) }),
    manips: (dlg, pl, c) => [dlg.valueManip("d1", { origin: c, dir: pl.x, scale: 0.5, min: 0.01 })],
  },
  quadball: {
    id: "TSplinePrimitiveQuadBallCommand", title: "Quadball", help: "Creates a T-Spline quadball: a sphere made of quad faces, with no poles.",
    rows: [len("diameter", "Diameter", 20), int("spanFaces", "Span Faces", 2)],
    sym: SYM_ALL, symRows: ["lengthSym", "widthSym", "heightSym"],
    make: (v, dlg, pl, c) => P.quadball({ pl, c, D: dlg.num("diameter"), span: dlg.num("spanFaces"), sym: symSpec(v) }),
    manips: (dlg, pl, c) => [dlg.valueManip("diameter", { origin: c, dir: pl.n, scale: 0.5, min: 0.01 })],
  },
};

export function openPrimitive(app, type, opts = {}) {
  const Pm = PRIMS[type];
  const total = (dlg) => {
    if (type === "box") return 2 * (dlg.num("lengthFaces") * dlg.num("widthFaces") + dlg.num("widthFaces") * dlg.num("heightFaces") + dlg.num("lengthFaces") * dlg.num("heightFaces"));
    return 0;
  };
  const symLabels = { lengthSym: "Length Symmetry", widthSym: "Width Symmetry", heightSym: "Height Symmetry" };
  const rows = [
    ...(Pm.rect ? [{ id: "rect", type: "buttons", label: "Rectangle", options: [{ value: "2pt", label: "2-Point" }, { value: "center", label: "Center" }], default: "center" }] : []),
    planeRow,
    ...Pm.rows,
    { id: "symmetry", type: "dropdown", label: "Symmetry", options: Pm.sym, default: "none", sep: true },
    ...Pm.symRows.map((id) => ({ id, type: "check", label: symLabels[id], default: id !== "heightSym", visible: (v) => v.symmetry === "mirror" })),
    { id: "operation", type: "dropdown", label: "Operation", options: OPS, default: "new", sep: true },
  ];
  return openFormDialog(app, {
    id: Pm.id, title: Pm.title, featureLabel: Pm.title, help: Pm.help,
    preselect: (opts.preselect || []).filter((r) => r.kind === "originPlane" || r.kind === "cplane" || (r.kind === "face" && r.planar !== false)).slice(0, 1),
    activate: (dlg) => ((dlg.values.plane || []).length ? false : undefined),
    rows,
    init(dlg) { dlg.values.center = [0, 0]; dlg.clicks = []; },
    onChange(id, dlg, o) {
      if (id === "plane") {
        const r = (dlg.values.plane || [])[0];
        const pl = planeOf(dlg);
        if (r && r.kind === "face" && r.p && pl && !o.preselect) { const uv = app.K.toLocal(pl, r.p); dlg.values.center = [+uv[0].toFixed(4), +uv[1].toFixed(4)]; }
        dlg.clicks = [];
        if ((dlg.values.plane || []).length) setTimeout(() => { if (!dlg.closed) dlg.activate(null); }, 0);
      }
    },
    prompt(dlg) {
      if (!(dlg.values.plane || []).length || dlg.active === "plane") return "Select a plane or planar face";
      if (dlg.manips.hover || dlg.manips.drag) return "";
      if (Pm.rect && dlg.values.rect === "2pt") return dlg.clicks.length ? "Specify second corner" : "Specify first corner";
      return Pm.rect ? "Specify center point" : "Specify center point";
    },
    onCanvasDown(ctx, dlg) {
      if (dlg.active === "plane" || !(dlg.values.plane || []).length) return false;
      const pl = planeOf(dlg);
      const rp = pl && app.viewport.rayPlane(ctx.x, ctx.y, pl);
      if (!rp) return true;
      const uv = [+rp.uv[0].toFixed(4), +rp.uv[1].toFixed(4)];
      if (Pm.rect && dlg.values.rect === "2pt") {
        dlg.clicks.push(uv);
        if (dlg.clicks.length >= 2) {
          const [a, b] = dlg.clicks;
          dlg.clicks = [];
          const L = Math.abs(b[0] - a[0]), W = Math.abs(b[1] - a[1]);
          if (L > 1e-6 && W > 1e-6) {
            dlg.values.center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            dlg.set("length", U.fmt(+L.toFixed(4), "length"), { user: true, noPreview: true });
            dlg.set("width", U.fmt(+W.toFixed(4), "length"), { user: true, delay: 0 });
          }
        }
        return true;
      }
      dlg.set("center", uv, { user: true, delay: 0 });
      return true;
    },
    compute(v, dlg) {
      const cc = centerOf(dlg);
      if (!cc) return null;
      for (const r of Pm.rows) if (r.type === "value" && !(dlg.num(r.id) > 0)) return null;
      if (total(dlg) > 100000) throw new Error("The total number of faces cannot exceed 100,000");
      const cage = Pm.make(v, dlg, cc.pl, cc.c);
      // circular symmetry needs the primitive's frame: rebuild the spec with the plane axis
      return { add: [cage], newComponent: v.operation === "newComponent" };
    },
    manipulators(dlg) {
      const cc = centerOf(dlg);
      return cc ? Pm.manips(dlg, cc.pl, cc.c).filter(Boolean) : [];
    },
  });
}

// ---------------------------------------------------------------- Face (append faces by points)
export function openFace(app) {
  // pending faces: {pts: [{p, body?}], body?, fixed} (fixed = oriented against an existing edge)
  const startEdgeOf = (ctx) => {
    const h = app.viewport.pick(ctx.x, ctx.y, { filter: (r) => r.kind === "tsEdge" && !!cageOf(app, r.body) });
    if (!h || h.ref.kind !== "tsEdge") return null;
    const c = shownCage(app, h.ref.body);
    const t = topo(c);
    const e = t.edge(h.ref.a, h.ref.b);
    if (e < 0 || t.eFaces[e].length !== 1) return { error: "Select a boundary edge" };
    // the adjacent face traverses a -> b; the new face traverses it backwards
    const fc = c.f[t.eFaces[e][0]], i = fc.indexOf(h.ref.a);
    const [a, b] = fc[(i + 1) % fc.length] === h.ref.b ? [h.ref.a, h.ref.b] : [h.ref.b, h.ref.a];
    return { body: h.ref.body, A: c.v[a].slice(), B: c.v[b].slice() };
  };
  const pointAt = (ctx, dlg, through) => {
    const h = app.viewport.pick(ctx.x, ctx.y, { filter: (r) => r.kind === "tsVertex" && !!cageOf(app, r.body) });
    if (h && h.ref.kind === "tsVertex") { const c = shownCage(app, h.ref.body); return { p: c.v[h.ref.v].slice(), body: h.ref.body }; }
    let pl = planeOf(dlg);
    if (!pl && through) {
      // no plane chosen: the view plane through the edge
      const n = app.viewport.camera.getWorldDirection(new app.viewport.camera.position.constructor()).toArray();
      const x = V.norm(V.cross(n, Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
      pl = { o: through, x, n };
    }
    pl = pl || { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const rp = app.viewport.rayPlane(ctx.x, ctx.y, pl);
    return rp ? { p: rp.world } : null;
  };
  return openFormDialog(app, {
    id: "TSplineAppendFaceCommand", title: "Face", featureLabel: "Face",
    help: "Creates individual T-Spline faces. Simple: click the corners of each face. Edge: select a boundary edge, then click two points. Chain: select a boundary edge, then keep clicking pairs of points to add a strip of faces.",
    rows: [
      { id: "mode", type: "dropdown", label: "Mode", options: [{ value: "simple", label: "Simple" }, { value: "edge", label: "Edge" }, { value: "chain", label: "Chain" }], default: "simple" },
      { id: "sides", type: "dropdown", label: "Number of Sides", options: [{ value: "four", label: "Four Sides" }, { value: "multi", label: "Multiple Sides" }], default: "four", visible: (v) => v.mode === "simple" },
      { ...planeRow, min: 0, label: "Plane" },
      { id: "info", type: "text", text: (dlg) => `${(dlg.faces || []).length} face(s)${(dlg.pts || []).length ? `, ${dlg.pts.length} point(s) placed` : ""}` },
    ],
    activate: false,
    init(dlg) { dlg.faces = []; dlg.pts = []; dlg.edge = null; },
    onChange(id, dlg) { if (id === "mode") { dlg.pts = []; dlg.edge = null; } },
    prompt(dlg) {
      if (dlg.active === "plane") return "Select a plane, planar face or vertex";
      const n = (dlg.pts || []).length;
      if (dlg.values.mode !== "simple") return dlg.edge ? (n ? "Specify second corner" : "Specify first corner") : "Select Edge";
      return ["Specify first corner", "Specify second corner", "Specify third corner", "Specify fourth corner"][Math.min(3, n)] + (dlg.values.sides === "multi" && n >= 3 ? " or select first point to complete" : "");
    },
    onCanvasDown(ctx, dlg) {
      if (dlg.active === "plane") return false;
      const mode = dlg.values.mode;
      if (mode !== "simple") {
        if (!dlg.edge) {
          const e = startEdgeOf(ctx);
          if (!e) { dlg.message(mode === "chain" ? "Chain creation failed, select edge to start new chain" : "Select Edge", "warning"); return true; }
          if (e.error) { dlg.message(e.error, "warning"); return true; }
          dlg.edge = e;
          dlg.pts = [];
          dlg.refresh();
          return true;
        }
        const pt = pointAt(ctx, dlg, V.lerp(dlg.edge.A, dlg.edge.B, 0.5));
        if (!pt) return true;
        dlg.pts.push(pt);
        if (dlg.pts.length === 2) {
          // the clicked point nearer A continues from A, the other from B
          const [p, q] = dlg.pts;
          const [pa, pb] = V.dist(p.p, dlg.edge.A) + V.dist(q.p, dlg.edge.B) <= V.dist(q.p, dlg.edge.A) + V.dist(p.p, dlg.edge.B) ? [p, q] : [q, p];
          dlg.faces.push({ body: dlg.edge.body, fixed: true, pts: [{ p: dlg.edge.B }, { p: dlg.edge.A }, pa, pb] });
          dlg.pts = [];
          // Chain continues from the far edge of the new face (it traverses pa -> pb)
          dlg.edge = mode === "chain" ? { body: dlg.edge.body, A: pa.p.slice(), B: pb.p.slice() } : null;
        }
        dlg.refresh();
        dlg.previewNow();
        return true;
      }
      const pt = pointAt(ctx, dlg, null);
      if (!pt) return true;
      const pts = dlg.pts;
      if (dlg.values.sides === "multi" && pts.length >= 3 && V.dist(pts[0].p, pt.p) < app.viewport.pixelSize(pt.p) * 8) dlg.faces.push({ pts: pts.splice(0) });
      else { pts.push(pt); if (dlg.values.sides === "four" && pts.length === 4) dlg.faces.push({ pts: pts.splice(0) }); }
      dlg.refresh();
      dlg.previewNow();
      return true;
    },
    compute(v, dlg) {
      if (!dlg.faces.length) return null;
      const eye = app.viewport.camera.position.toArray();
      const polys = dlg.faces.map((f) => {
        const poly = f.pts.map((q) => q.p.slice());
        if (!f.fixed) {
          // free faces face the camera
          const n = V.cross(V.sub(poly[1], poly[0]), V.sub(poly[2], poly[0]));
          if (V.dot(n, V.sub(eye, poly[0])) < 0) poly.reverse();
        }
        return { poly, body: f.body || (f.pts.find((q) => q.body) || {}).body || null };
      });
      // faces attached to a body (edge / snapped vertex) join it; free faces make one new body
      const key = (p) => p.map((x) => x.toFixed(4)).join(",");
      const set = new Map();
      const free = { v: [], f: [] };
      const freeIdx = new Map();
      for (const { poly, body } of polys) {
        if (body && cageOf(app, body)) {
          if (!set.has(body)) { const b = cageOf(app, body); set.set(body, { c: { ...b, v: b.v.map((p) => p.slice()), f: b.f.map((x) => x.slice()) }, idx: new Map(b.v.map((p, i) => [key(p), i])) }); }
          const { c, idx } = set.get(body);
          c.f.push(poly.map((p) => { const k = key(p); if (!idx.has(k)) { idx.set(k, c.v.length); c.v.push(p); } return idx.get(k); }));
        } else free.f.push(poly.map((p) => { const k = key(p); if (!freeIdx.has(k)) { freeIdx.set(k, free.v.length); free.v.push(p); } return freeIdx.get(k); }));
      }
      const out = {};
      if (set.size) out.set = new Map([...set].map(([id, { c }]) => [id, tidy(c)]));
      if (free.f.length) out.add = [tidy({ v: free.v, f: free.f, crease: [], cv: [], frozen: [], iso: [], sym: null })];
      return out;
    },
  });
}

// ---------------------------------------------------------------- curve-based: extrude / revolve / sweep / loft / pipe
const CURVE_KINDS = ["profile", "sketchCurve"];
const SPACING = [{ value: "uniform", label: "Uniform" }, { value: "curvature", label: "Curvature" }];
function setAutoFaces(app, dlg, rowSel, field) {
  if (dlg.touched.has(field)) return;
  const ch = curveChains(app, dlg.values[rowSel], dlg.baseState)[0];
  if (ch) dlg.set(field, String(autoFaces(ch.pts, ch.closed)), { noPreview: true });
}
const chainCenter = (pts) => V.avg(pts);

export function openExtrude(app, opts = {}) {
  return openFormDialog(app, {
    id: "TSplineExtrudeCommand", title: "Extrude", featureLabel: "Extrude",
    help: "Creates or modifies a T-Spline body by adding faces along a vector. Select sketch profiles or curves, or boundary edges of a T-Spline body.",
    preselect: (opts.preselect || []).filter((r) => CURVE_KINDS.includes(r.kind) || r.kind === "tsEdge"),
    rows: [
      { id: "profile", type: "selection", label: "Profile", kinds: [...CURVE_KINDS, "tsEdge"], prompt: "Select sketch profiles or planar faces to extrude",
        filter: (r) => r.kind !== "tsEdge" || (!!cageOf(app, r.body) && isBoundary(app, r)) },
      { id: "dirType", type: "dropdown", label: "Direction", options: [{ value: "one", label: "One Side", icon: "oneSide" }, { value: "two", label: "Two Side", icon: "twoSides" }, { value: "sym", label: "Symmetric", icon: "symmetric" }], default: "one" },
      { id: "distance", type: "value", label: "Distance", kind: "length", default: "10.00 mm" },
      { id: "frontFaces", type: "value", label: "Front Faces", kind: "none", default: "2", integer: true, min: 1 },
      { id: "distance2", type: "value", label: "Distance", kind: "length", default: "10.00 mm", visible: (v) => v.dirType === "two" },
      { id: "backFaces", type: "value", label: "Back Faces", kind: "none", default: "2", integer: true, min: 1, visible: (v) => v.dirType === "two" },
      { id: "faces", type: "value", label: "Faces", kind: "none", default: "8", integer: true, min: 1, visible: (v) => !(v.profile || []).some((r) => r.kind === "tsEdge") },
      { id: "spacing", type: "dropdown", label: "Spacing", options: SPACING, default: "uniform", visible: (v) => !(v.profile || []).some((r) => r.kind === "tsEdge") },
      { id: "taper", type: "value", label: "Angle", kind: "angle", default: "0.0 deg" },
      { id: "operation", type: "dropdown", label: "Operation", options: OPS, default: "new", sep: true },
    ],
    onChange(id, dlg) { if (id === "profile") setAutoFaces(app, dlg, "profile", "faces"); },
    compute(v, dlg) {
      const refs = v.profile || [];
      if (!refs.length) return null;
      const d1 = dlg.num("distance");
      if (!Number.isFinite(d1) || Math.abs(d1) < 1e-6) return null;
      const n1 = dlg.num("frontFaces");
      const two = v.dirType === "two", sym = v.dirType === "sym";
      const ts = refs.filter((r) => r.kind === "tsEdge");
      if (ts.length) return extrudeTsEdges(app, ts, d1, n1);
      const ch = curveChains(app, refs, dlg.baseState);
      if (!ch.length) throw new Error("Curve Extraction failed");
      const add = [];
      for (const c of ch) {
        const prof = resampleChain(c.pts, c.closed, dlg.num("faces"), v.spacing);
        const dir = c.plane ? V.norm(c.plane.n) : V.norm(V.cross(V.sub(prof[1], prof[0]), V.sub(prof[prof.length - 1], prof[0])));
        const opt = sym ? { dir, d1: d1 / 2, n1: Math.max(1, Math.ceil(n1 / 2)), d2: d1 / 2, n2: Math.max(1, Math.floor(n1 / 2)) || 1 } : { dir, d1, n1, d2: two ? dlg.num("distance2") : 0, n2: two ? dlg.num("backFaces") : 0 };
        add.push(P.extrudeCage(prof, c.closed, { ...opt, taper: dlg.num("taper") || 0, center: chainCenter(prof) }));
      }
      return { add, newComponent: v.operation === "newComponent" };
    },
    manipulators(dlg) {
      const ch = curveChains(app, dlg.values.profile || [], dlg.baseState)[0];
      if (!ch) return [];
      const dir = ch.plane ? ch.plane.n : null;
      if (!dir) return [];
      return [dlg.valueManip("distance", { origin: chainCenter(ch.pts), dir })].filter(Boolean);
    },
  });
}
function isBoundary(app, r) {
  const c = cageOf(app, r.body);
  if (!c) return false;
  const t = topo(c);
  const e = t.edge(r.a, r.b);
  return e >= 0 && t.eFaces[e].length === 1;
}
function extrudeTsEdges(app, refs, dist, n) {
  const set = new Map();
  const by = new Map();
  for (const r of refs) { if (!by.has(r.body)) by.set(r.body, []); by.get(r.body).push(r); }
  for (const [id, rs] of by) {
    let c = cageOf(app, id);
    // outward direction: away from the adjacent faces, averaged
    const t = topo(c);
    let d = [0, 0, 0];
    for (const r of rs) { const e = t.edge(r.a, r.b); const f = t.eFaces[e][0]; d = V.add(d, V.norm(V.sub(V.lerp(c.v[r.a], c.v[r.b], 0.5), faceCentroid(c, f)))); }
    d = V.norm(d);
    let cur = rs;
    for (let k = 1; k <= Math.max(1, n); k++) {
      const res = extrudeEdges(c, cur);
      const step = V.mul(d, dist / Math.max(1, n));
      const P2 = res.cage.v.map((p) => p.slice());
      for (const v of res.verts) P2[v] = V.add(P2[v], V.mul(step, 1));
      // new verts start at the old edge: move them one step further than their source
      c = tidy({ ...res.cage, v: P2 });
      cur = res.edges.map(([a, b]) => ({ kind: "tsEdge", body: id, a: Math.min(a, b), b: Math.max(a, b) }));
    }
    set.set(id, c);
  }
  return { set };
}

export function openRevolve(app, opts = {}) {
  return openFormDialog(app, {
    id: "TSplineRevolveCommand", title: "Revolve", featureLabel: "Revolve",
    help: "Creates a T-Spline body by revolving edges or sketch geometry around a selected axis.",
    preselect: (opts.preselect || []).filter((r) => CURVE_KINDS.includes(r.kind)),
    rows: [
      { id: "profile", type: "selection", label: "Profile", kinds: [...CURVE_KINDS, "tsEdge"], prompt: "Select sketch curves or T-Spline edges to revolve", filter: (r) => r.kind !== "tsEdge" || !!cageOf(app, r.body) },
      { id: "axis", type: "selection", label: "Axis", kinds: ["originAxis", "sketchCurve", "edge", "caxis"], max: 1, prompt: "Select sketch curve, edge or axis", filter: (r, dlg) => r.kind !== "sketchCurve" || U.sketchLineFilter(dlg.baseState)(r) },
      { id: "revType", type: "dropdown", label: "Type", options: [{ value: "full", label: "Full", icon: "revFull" }, { value: "angle", label: "Angle", icon: "revAngle" }], default: "full" },
      { id: "angle", type: "value", label: "Angle", kind: "angle", default: "180.0 deg", visible: (v) => v.revType === "angle" },
      { id: "faces", type: "value", label: "Faces", kind: "none", default: "8", integer: true, min: 1 },
      { id: "profileFaces", type: "value", label: "Profile Faces", kind: "none", default: "4", integer: true, min: 1 },
      { id: "spacing", type: "dropdown", label: "Spacing", options: SPACING, default: "uniform" },
      { id: "operation", type: "dropdown", label: "Operation", options: OPS, default: "new", sep: true },
    ],
    onChange(id, dlg) { if (id === "profile") setAutoFaces(app, dlg, "profile", "profileFaces"); },
    compute(v, dlg) {
      const ch = curveChains(app, v.profile || [], dlg.baseState);
      const axis = axisOfRef(app, U, (v.axis || [])[0], dlg.baseState);
      if (!ch.length || !axis) return null;
      const angle = v.revType === "full" ? 360 : dlg.num("angle");
      const add = ch.map((c) => P.revolveCage(resampleChain(c.pts, c.closed, dlg.num("profileFaces"), v.spacing), c.closed, { axis, angle, n: dlg.num("faces") }));
      return { add, newComponent: v.operation === "newComponent" };
    },
  });
}

export function openSweep(app, opts = {}) {
  return openFormDialog(app, {
    id: "TSplineSweepCommand", title: "Sweep", featureLabel: "Sweep",
    help: "Creates a T-Spline body by sweeping edges or sketch curves along a selected path.",
    preselect: (opts.preselect || []).filter((r) => CURVE_KINDS.includes(r.kind)).slice(0, 1),
    rows: [
      { id: "profile", type: "selection", label: "Profile", kinds: CURVE_KINDS, prompt: "Select sketch profiles or planar faces to sweep" },
      { id: "path", type: "selection", label: "Path", kinds: ["sketchCurve", "edge"], prompt: "Select sketch curves or edges" },
      { id: "pathFaces", type: "value", label: "Faces", kind: "none", default: "6", integer: true, min: 1 },
      { id: "profileFaces", type: "value", label: "Profile Faces", kind: "none", default: "8", integer: true, min: 1 },
      { id: "orientation", type: "dropdown", label: "Orientation", options: [{ value: "perpendicular", label: "Perpendicular" }, { value: "parallel", label: "Parallel" }], default: "perpendicular" },
      { id: "operation", type: "dropdown", label: "Operation", options: OPS, default: "new", sep: true },
    ],
    onChange(id, dlg) { if (id === "profile") setAutoFaces(app, dlg, "profile", "profileFaces"); },
    compute(v, dlg) {
      const prof = curveChains(app, v.profile || [], dlg.baseState)[0];
      const path = curveChains(app, v.path || [], dlg.baseState)[0];
      if (!prof || !path) return null;
      const pp = resampleChain(path.pts, path.closed, dlg.num("pathFaces"));
      // start the path at the end nearest the profile
      const cp = V.avg(prof.pts);
      if (!path.closed && V.dist(pp[pp.length - 1], cp) < V.dist(pp[0], cp)) pp.reverse();
      return { add: [P.sweepCage(resampleChain(prof.pts, prof.closed, dlg.num("profileFaces")), prof.closed, path.closed ? [...pp, pp[0]] : pp, path.closed, { orientation: v.orientation })], newComponent: v.operation === "newComponent" };
    },
  });
}

export function openLoft(app, opts = {}) {
  return openFormDialog(app, {
    id: "TSplineLoft", title: "Loft", featureLabel: "Loft",
    help: "Creates a T-Spline body that lofts between two or more profiles (sketch curves or profiles), in selection order.",
    preselect: (opts.preselect || []).filter((r) => CURVE_KINDS.includes(r.kind)),
    rows: [
      { id: "profiles", type: "selection", label: "Profiles", kinds: CURVE_KINDS, min: 2, prompt: "Select two or more profiles" },
      { id: "faces", type: "value", label: "Faces", kind: "none", default: "2", integer: true, min: 1 },
      { id: "profileFaces", type: "value", label: "Profile Faces", kind: "none", default: "8", integer: true, min: 3 },
      { id: "operation", type: "dropdown", label: "Operation", options: OPS, default: "new", sep: true },
    ],
    compute(v, dlg) {
      // one chain per selected item, in selection order
      const chains = (v.profiles || []).map((r) => curveChains(app, [r], dlg.baseState)[0]).filter(Boolean);
      if (chains.length < 2) return null;
      const closed = chains[0].closed;
      if (chains.some((c) => c.closed !== closed)) throw new Error("Select profiles that are all closed or all open");
      const n = dlg.num("profileFaces");
      return { add: [P.loftCage(chains.map((c) => resampleChain(c.pts, c.closed, n)), closed, { n: dlg.num("faces") })], newComponent: v.operation === "newComponent" };
    },
  });
}

export function openPipe(app, opts = {}) {
  return openFormDialog(app, {
    id: "TSplinePrimitivePipe", title: "Pipe", featureLabel: "Pipe",
    help: "Creates a T-Spline pipe along a path of sketch curves or edges.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "sketchCurve" || r.kind === "edge"),
    rows: [
      { id: "path", type: "selection", label: "Path", kinds: ["sketchCurve", "edge"], prompt: "Select sketch curves or edges" },
      len("diameter", "Global Diameter", 5),
      { id: "segments", type: "value", label: "Segments", kind: "none", default: "8", integer: true, min: 3 },
      { id: "faces", type: "value", label: "Faces", kind: "none", default: "8", integer: true, min: 1 },
      { id: "ends", type: "dropdown", label: "End Type", options: [{ value: "open", label: "Open" }, { value: "square", label: "Square" }, { value: "spike", label: "Spike" }], default: "open" },
      { id: "operation", type: "dropdown", label: "Operation", options: OPS, default: "new", sep: true },
    ],
    compute(v, dlg) {
      const path = curveChains(app, v.path || [], dlg.baseState)[0];
      if (!path || !(dlg.num("diameter") > 0)) return null;
      const pp = resampleChain(path.pts, path.closed, dlg.num("faces"));
      return { add: [P.pipeCage(path.closed ? [...pp, pp[0]] : pp, path.closed, { D: dlg.num("diameter"), seg: dlg.num("segments"), ends: v.ends })], newComponent: v.operation === "newComponent" };
    },
  });
}
void vertexNormal; void fitToTargets; void tsRow;
