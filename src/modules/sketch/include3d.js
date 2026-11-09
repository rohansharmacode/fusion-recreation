// Project / Include commands that use body geometry: Intersect (IntersectCmd), Include 3D Geometry
// (Include3DGeometry), Intersection Curve (IntersectionCurve), Project to Surface (ProjectToSurface),
// Isoparametric Curve (SketchIsoparametricCurve) and Spun Profile (SpunProfileCmd).
// Planar results become fixed projected sketch curves (purple); 3D results become fixed 3D sketch
// curves ({type:'c3d'}). "Projection Link" is offered like Fusion's; the curves are stored (not
// re-derived when the bodies change).
import { ST, mutateSketch, activeData } from "./ctx.js";
import { edgeToSketch, addProjected } from "./modify.js";
import { sectionByPlane, sampleEdge, toPlane3, rayHit, closestOn, isoCurves, faceUV, spunEnvelope, simplify } from "./geom3d.js";
import { storedSketch, curveOfActive, showLive, endLive } from "./dlgutil.js";

const K = () => ST.app.K;
const plane = () => activeData() && activeData().plane;

/** Replicad sub-shapes of refs (body / face / edge) from the dialog's base state. */
function shapesOf(dlg, refs) {
  const out = [];
  const st = dlg.baseState;
  for (const r of refs || []) {
    const b = st.bodies.get(r.body);
    if (!b || !b.shape) continue;
    try {
      if (r.kind === "body") out.push({ ref: r, shape: b.shape, own: false });
      else if (r.kind === "face") { const f = b.shape.faces[r.index]; if (f) out.push({ ref: r, shape: f, own: true }); }
      else if (r.kind === "edge") { const e = b.shape.edges[r.index]; if (e) out.push({ ref: r, shape: e, own: true }); }
      else if (r.kind === "vertex") out.push({ ref: r, point: r.p });
    } catch (e) { console.error(e); }
  }
  return out;
}
const free = (items) => { for (const it of items) if (it.own && it.shape) K().del(it.shape); };

/** Add 3D curves (world polylines) to sk as fixed c3d curves. */
function addC3D(sk, polys, pl, extra = {}) {
  let n = 0;
  for (const P of polys) {
    if (!P || P.length < 1) continue;
    const pts3 = P.map((p) => toPlane3(pl, p).map((v) => +v.toFixed(9)));
    const id = `j${sk.nid++}`;
    if (pts3.length === 1) {
      // a point: a small 3D cross so it stays visible and pickable
      const [u, v, w] = pts3[0];
      const s = 0.4;
      sk.curves[id] = { type: "c3d", pts3: [[u - s, v, w], [u + s, v, w]], proj: true, point: [u, v, w], ...extra };
      const id2 = `j${sk.nid++}`;
      sk.curves[id2] = { type: "c3d", pts3: [[u, v - s, w], [u, v + s, w]], proj: true, point: [u, v, w], ...extra };
      n++;
      continue;
    }
    const closed = Math.hypot(...K().V.sub(P[0], P[P.length - 1])) < 1e-7 && P.length > 2;
    sk.curves[id] = { type: "c3d", pts3: closed ? pts3.slice(0, -1) : pts3, ...(closed ? { closed: true } : {}), proj: true, ...extra };
    n++;
  }
  return n;
}

/** Sketch curve id -> world polyline. */
function sketchCurveWorld(sk, id, pl, n = 64) {
  const S = ST.app.S;
  const cv = sk.curves[id];
  if (!cv) return [];
  if (cv.type === "c3d") return cv.pts3.map((q) => { const w = K().toWorld(pl, q[0], q[1]); return K().V.add(w, K().V.mul(pl.n, q[2] || 0)); });
  return S.curvePolyline(sk, id, n).map((q) => K().toWorld(pl, q[0], q[1]));
}

/** At least n segments: straight pieces become curved once projected onto a surface. */
function densify(P, n) {
  if (P.length < 2 || P.length > n) return P;
  const k = Math.ceil(n / (P.length - 1));
  const out = [P[0]];
  for (let i = 1; i < P.length; i++) for (let j = 1; j <= k; j++) out.push(K().V.add(P[i - 1], K().V.mul(K().V.sub(P[i], P[i - 1]), j / k)));
  return out;
}

function finishSel(dlg) { endLive(); void dlg; }

// ---------------------------------------------------------------------------
// Intersect: where bodies / faces / edges cross the sketch plane
// ---------------------------------------------------------------------------
function intersectItems(dlg, refs) {
  const pl = plane();
  const items = [];
  const parts = shapesOf(dlg, refs);
  try {
    for (const it of parts) {
      if (it.point) continue;
      if (it.ref.kind === "edge") {
        // an edge crossing the plane: the crossing points
        const P = sampleEdge(it.shape, 96);
        for (let i = 0; i + 1 < P.length; i++) {
          const da = K().V.dot(K().V.sub(P[i], pl.o), pl.n), db = K().V.dot(K().V.sub(P[i + 1], pl.o), pl.n);
          if (da === 0 || da * db < 0) { const t = da / (da - db || 1); const q = K().V.add(P[i], K().V.mul(K().V.sub(P[i + 1], P[i]), t)); items.push({ kind: "point", a: K().toLocal(pl, q) }); }
        }
        continue;
      }
      for (const e of sectionByPlane(it.shape, pl)) {
        try { const s = edgeToSketch(e, pl); if (s) items.push(s); } catch (err) { console.error(err); } finally { K().del(e); }
      }
    }
  } finally { free(parts); }
  return items;
}

export function openIntersect() {
  const A = ST.app;
  return A.ui.dialog.open({
    id: "IntersectCmd",
    title: "Intersect",
    icon: "IntersectCmd",
    help: "Adds the curves where the selected geometry crosses the sketch plane.",
    preview: false,
    labelWidth: 100,
    rows: [
      { id: "geometry", type: "selection", label: "Geometry", kinds: ["body", "face", "edge"], prompt: "Select geometry to intersect with the sketch plane" },
      { id: "link", type: "check", label: "Projection Link", default: true },
    ],
    preselect: A.selection.items.filter((r) => ["body", "face", "edge"].includes(r.kind)),
    build: (v) => ((v.geometry || []).length ? { type: "sketchIntersect" } : null),
    afterPreview(d) {
      const sk = storedSketch();
      if (!sk || !(d.values.geometry || []).length) { endLive(); return; }
      const items = intersectItems(d, d.values.geometry);
      const w = A.S.cloneSketch(sk);
      addProjected(w, items);
      showLive(w);
    },
    commit(f, d) {
      const items = intersectItems(d, d.values.geometry);
      if (!items.length) throw new Error("The selected geometry does not cross the sketch plane");
      return mutateSketch("Intersect", (sk) => { const n = addProjected(sk, items); if (!n) throw new Error("The intersection is already in the sketch"); return n; });
    },
    onClose: finishSel,
  });
}

// ---------------------------------------------------------------------------
// Include 3D Geometry: edges / vertices / faces in place (not flattened)
// ---------------------------------------------------------------------------
function includePolys(dlg, refs) {
  const polys = [];
  const parts = shapesOf(dlg, refs);
  try {
    for (const it of parts) {
      if (it.point) { polys.push([it.point]); continue; }
      if (it.ref.kind === "edge") polys.push(sampleEdge(it.shape));
      else if (it.ref.kind === "face") for (const e of it.shape.edges) { try { polys.push(sampleEdge(e)); } finally { K().del(e); } }
      else if (it.ref.kind === "body") for (const e of it.shape.edges) { try { polys.push(sampleEdge(e)); } finally { K().del(e); } }
    }
  } finally { free(parts); }
  return polys;
}

export function openInclude3D() {
  const A = ST.app;
  return A.ui.dialog.open({
    id: "Include3DGeometry",
    title: "Include 3D Geometry",
    icon: "Include3DGeometry",
    help: "Brings faces, edges and points into the active sketch as 3D sketch geometry without flattening them.",
    preview: false,
    labelWidth: 100,
    rows: [
      { id: "objects", type: "selection", label: "Objects", kinds: ["edge", "vertex", "face"], prompt: "Select faces, edges or points to include" },
    ],
    preselect: A.selection.items.filter((r) => ["face", "edge", "vertex"].includes(r.kind)),
    build: (v) => ((v.objects || []).length ? { type: "sketchInclude" } : null),
    afterPreview(d) {
      const sk = storedSketch();
      if (!sk || !(d.values.objects || []).length) { endLive(); return; }
      const w = A.S.cloneSketch(sk);
      addC3D(w, includePolys(d, d.values.objects), plane(), { include: true });
      showLive(w);
    },
    commit(f, d) {
      const polys = includePolys(d, d.values.objects);
      return mutateSketch("Include 3D Geometry", (sk) => { const n = addC3D(sk, polys, plane(), { include: true }); if (!n) throw new Error("Nothing to include"); return n; });
    },
    onClose: finishSel,
  });
}

// ---------------------------------------------------------------------------
// Intersection Curve / Project to Surface (along the sketch normal or to the closest point)
// ---------------------------------------------------------------------------
function targetShapes(dlg, refs) {
  const out = [];
  for (const r of refs || []) {
    if (r.kind === "cplane" || r.kind === "originPlane") {
      const ps = r.kind === "cplane" ? ST.app.planeState(r.id) : null;
      const pl = r.kind === "cplane" ? ps && ps.plane : K().ORIGIN_PLANES[r.name];
      if (pl) out.push({ plane: pl });
    }
  }
  return [...out, ...shapesOf(dlg, refs.filter((r) => r.kind === "face" || r.kind === "body"))];
}
/** Project world polyline P onto targets along dir (or to the closest point): polylines of hits. */
function projectPolyline(P, targets, dir, closest) {
  const out = [];
  const L = 1e4;
  for (const t of targets) {
    let run = [];
    for (const p of P) {
      let q = null;
      if (t.plane) {
        const n = t.plane.n;
        if (closest) q = K().V.sub(p, K().V.mul(n, K().V.dot(K().V.sub(p, t.plane.o), n)));
        else { const den = K().V.dot(dir, n); if (Math.abs(den) > 1e-12) { const s = K().V.dot(K().V.sub(t.plane.o, p), n) / den; q = K().V.add(p, K().V.mul(dir, s)); } }
      } else if (closest) { const c = closestOn(t.shape, p); q = c ? c.p : null; }
      else q = rayHit(t.shape, p, dir, L);
      if (q) run.push(q);
      else if (run.length) { out.push(run); run = []; }
    }
    if (run.length) out.push(run);
  }
  return out.filter((r) => r.length >= 2);
}

function curvesToProject(dlg) {
  const sk = storedSketch();
  const pl = plane();
  const polys = [];
  for (const r of dlg.values.curves || []) {
    if (r.kind === "sketchCurve" && sk.curves[r.curve]) polys.push(densify(sketchCurveWorld(sk, r.curve, pl), 64));
    else if (r.kind === "edge") { const parts = shapesOf(dlg, [r]); try { for (const it of parts) polys.push(sampleEdge(it.shape, 64)); } finally { free(parts); } }
    else if (r.kind === "vertex") polys.push([r.p]);
  }
  return polys;
}

function projectResult(dlg, mode) {
  const pl = plane();
  const targets = targetShapes(dlg, dlg.values.faces || []);
  const dir = pl.n;
  const closest = mode === "ProjectToSurface" && dlg.values.ptype === "closest";
  const out = [];
  try {
    for (const P of curvesToProject(dlg)) {
      if (P.length === 1) {
        const r = projectPolyline([P[0], P[0]], targets, dir, closest);
        if (r.length) out.push([r[0][0]]);
        continue;
      }
      out.push(...projectPolyline(P, targets, dir, closest));
    }
  } finally { free(targets.filter((t) => t.shape)); }
  return out;
}

function projectDialog(id) {
  const A = ST.app;
  const isP2S = id === "ProjectToSurface";
  const title = isP2S ? "Project To Surface" : "Intersection Curve";
  const rows = isP2S ? [
    { id: "faces", type: "selection", label: "Faces", kinds: ["face", "body", "cplane", "originPlane"], prompt: "Select face, surface feature or workplane to project on" },
    { id: "curves", type: "selection", label: "Curves", kinds: ["sketchCurve", "edge", "vertex"], filter: (r) => r.kind !== "sketchCurve" || curveOfActive((cv) => cv.type !== "point")(r), prompt: "Select objects to project" },
    { id: "ptype", type: "dropdown", label: "Projection Type", default: "vector", options: [{ value: "vector", label: "Along Vector" }, { value: "closest", label: "Closest Point" }] },
    { id: "link", type: "check", label: "Projection Link", default: true },
  ] : [
    { id: "curves", type: "selection", label: "Sketch Curves", kinds: ["sketchCurve"], filter: curveOfActive((cv) => cv.type !== "point"), prompt: "Select a sketch curve to project" },
    { id: "faces", type: "selection", label: "Objects to Intersect", kinds: ["face", "body", "cplane", "originPlane"], prompt: "Select objects to intersect on" },
    { id: "link", type: "check", label: "Projection Link", default: true },
  ];
  return A.ui.dialog.open({
    id, title, icon: id,
    help: isP2S ? "Projects the selected sketch objects to the selected faces." : "Intersects the selected sketch geometry with the selected faces.",
    preview: false,
    labelWidth: 120,
    rows,
    preselect: A.selection.items.filter((r) => r.kind === "sketchCurve" && r.sketch === ST.sketchId),
    build: (v) => ((v.curves || []).length && (v.faces || []).length ? { type: "sketchProjectSurface" } : null),
    afterPreview(d) {
      const sk = storedSketch();
      if (!sk || !(d.values.curves || []).length || !(d.values.faces || []).length) { endLive(); return; }
      const polys = projectResult(d, id);
      const w = A.S.cloneSketch(sk);
      addC3D(w, polys, plane());
      showLive(w);
      d.message(polys.length ? "" : "The projection does not reach the selected faces", polys.length ? "info" : "warning");
    },
    commit(f, d) {
      const polys = projectResult(d, id);
      if (!polys.length) throw new Error("The projection does not reach the selected faces");
      return mutateSketch(title, (sk) => addC3D(sk, polys, plane()));
    },
    onClose: finishSel,
  });
}
export const openIntersectionCurve = () => projectDialog("IntersectionCurve");
export const openProjectToSurface = () => projectDialog("ProjectToSurface");

// ---------------------------------------------------------------------------
// Isoparametric Curve
// ---------------------------------------------------------------------------
function isoResult(dlg) {
  const v = dlg.values;
  const fr = (v.face || [])[0];
  if (!fr) return [];
  const parts = shapesOf(dlg, [fr]);
  const out = [];
  try {
    const face = parts[0] && parts[0].shape;
    if (!face) return [];
    const at = (v.point || [])[0] ? v.point[0].p : fr.p;
    const uv = faceUV(face, at);
    const dirs = v.dir === "both" ? ["u", "v"] : [v.dir || "u"];
    for (const dd of dirs) {
      let ps;
      if (v.ctype === "distributed") {
        const q = Math.max(1, Math.round(dlg.num("qty") || 1));
        const [a, b] = dd === "u" ? [uv.box[0], uv.box[1]] : [uv.box[2], uv.box[3]];
        ps = [];
        for (let i = 1; i <= q; i++) ps.push(a + ((b - a) * i) / (q + 1));
      } else ps = [dd === "u" ? uv.u : uv.v];
      out.push(...isoCurves(face, dd, ps));
    }
  } catch (e) { console.error(e); } finally { free(parts); }
  return out;
}

export function openIsoparametric() {
  const A = ST.app;
  return A.ui.dialog.open({
    id: "SketchIsoparametricCurve",
    title: "Isoparametric Curve",
    icon: "SketchIsoparametricCurve",
    help: "Extracts U or V curves from a face and includes them as sketch geometry.",
    preview: false,
    labelWidth: 100,
    rows: [
      { id: "face", type: "selection", label: "Face", kinds: ["face"], max: 1, prompt: "Select a face to extract curves from" },
      { id: "point", type: "selection", label: "Point", kinds: ["face", "vertex"], max: 1, min: 0, mapRef: (r) => ({ kind: "vertex", body: r.body, p: r.p }), prompt: "Select a point on the face to define the curve location" },
      { id: "dir", type: "dropdown", label: "Direction", default: "u", options: [{ value: "u", label: "U" }, { value: "v", label: "V" }, { value: "both", label: "Both" }] },
      { id: "ctype", type: "dropdown", label: "Type", default: "single", options: [{ value: "single", label: "Single" }, { value: "distributed", label: "Distributed" }] },
      { id: "qty", type: "value", label: "Quantity", kind: "none", default: "3", visible: (v) => v.ctype === "distributed" },
      { id: "link", type: "check", label: "Projection Link", default: true },
    ],
    preselect: A.selection.items.filter((r) => r.kind === "face").slice(0, 1),
    build: (v) => ((v.face || []).length ? { type: "sketchIso" } : null),
    afterPreview(d) {
      const sk = storedSketch();
      if (!sk || !(d.values.face || []).length) { endLive(); return; }
      const w = A.S.cloneSketch(sk);
      addC3D(w, isoResult(d), plane());
      showLive(w);
    },
    commit(f, d) {
      const polys = isoResult(d);
      if (!polys.length) throw new Error("No isoparametric curve on this face");
      return mutateSketch("Isoparametric Curve", (sk) => addC3D(sk, polys, plane()));
    },
    onClose: finishSel,
  });
}

// ---------------------------------------------------------------------------
// Spun Profile
// ---------------------------------------------------------------------------
function axisOf(dlg, r) {
  const k = K();
  if (!r) return null;
  if (r.kind === "originAxis") return { o: [0, 0, 0], a: k.ORIGIN_AXES[r.name] };
  if (r.kind === "sketchCurve") {
    const sk = storedSketch();
    const cv = sk.curves[r.curve];
    if (!cv || cv.type !== "line") return null;
    const pl = plane();
    const a = k.toWorld(pl, sk.points[cv.p1].x, sk.points[cv.p1].y), b = k.toWorld(pl, sk.points[cv.p2].x, sk.points[cv.p2].y);
    return { o: a, a: k.V.norm(k.V.sub(b, a)) };
  }
  if (r.kind === "edge") {
    const parts = shapesOf(dlg, [r]);
    try {
      const e = parts[0] && parts[0].shape;
      if (!e) return null;
      const P = sampleEdge(e, 2);
      return { o: P[0], a: k.V.norm(k.V.sub(P[P.length - 1], P[0])) };
    } finally { free(parts); }
  }
  return null;
}

function spunResult(dlg) {
  const k = K();
  const v = dlg.values;
  const ax = axisOf(dlg, (v.axis || [])[0]);
  if (!ax) return null;
  const pl = plane();
  // the axis is projected onto the sketch plane
  const o = k.V.sub(ax.o, k.V.mul(pl.n, k.V.dot(k.V.sub(ax.o, pl.o), pl.n)));
  let a = k.V.sub(ax.a, k.V.mul(pl.n, k.V.dot(ax.a, pl.n)));
  if (k.V.len(a) < 1e-9) return { error: "The axis must not be normal to the sketch plane" };
  a = k.V.norm(a);
  let side = k.V.cross(pl.n, a);
  if (v.flip) side = k.V.mul(side, -1);
  const parts = shapesOf(dlg, v.entities || []);
  let env = [];
  try {
    const shapes = parts.filter((p) => p.shape).map((p) => p.shape);
    env = spunEnvelope(shapes, ax.o, ax.a, Math.max(0.01, dlg.num("tol") || 0.1));
  } finally { free(parts); }
  if (env.length < 2) return { error: "Nothing to spin" };
  const W = (h, r) => k.V.add(o, k.V.add(k.V.mul(a, h), k.V.mul(side, r)));
  const poly = env.map(([h, r]) => W(h, r));
  const items = [];
  const uv = (p) => k.toLocal(pl, p);
  const h0 = env[0][0], h1 = env[env.length - 1][0];
  // the outline closes down to the axis at both ends
  if (env[0][1] > 1e-6) items.push({ kind: "line", a: uv(W(h0, 0)), b: uv(poly[0]) });
  for (let i = 0; i + 1 < poly.length; i++) items.push({ kind: "line", a: uv(poly[i]), b: uv(poly[i + 1]) });
  if (env[env.length - 1][1] > 1e-6) items.push({ kind: "line", a: uv(poly[poly.length - 1]), b: uv(W(h1, 0)) });
  if (v.projAxis) items.push({ kind: "line", a: uv(W(h0, 0)), b: uv(W(h1, 0)) });
  return { items };
}

export function openSpunProfile() {
  const A = ST.app;
  return A.ui.dialog.open({
    id: "SpunProfileCmd",
    title: "Spun Profile",
    icon: "SpunProfileCmd",
    help: "Projects the outline of geometry spun around an axis onto the active sketch plane.",
    preview: false,
    labelWidth: 108,
    rows: [
      { id: "filter", type: "dropdown", label: "Selection Filter", default: "bodies", options: [{ value: "entities", label: "Specified Entities" }, { value: "bodies", label: "Bodies" }] },
      { id: "entities", type: "selection", label: "Geometry", kinds: ["body", "face", "edge"], filter: (r, d) => (d.values.filter === "bodies" ? r.kind === "body" : r.kind !== "body"), labelFn: (v) => (v.filter === "bodies" ? "Bodies" : "Entities"), prompt: "Select the geometry to project" },
      { id: "link", type: "check", label: "Projection Link", default: true },
      { id: "axis", type: "selection", label: "Axis", kinds: ["sketchCurve", "edge", "originAxis"], max: 1, filter: (r) => r.kind !== "sketchCurve" || curveOfActive((cv) => cv.type === "line")(r), prompt: "Select an axis to rotate the geometry around" },
      { id: "projAxis", type: "check", label: "Project Axis", default: true },
      { id: "tol", type: "value", label: "Tolerance", kind: "length", default: "0.10 mm", positive: true },
      { id: "flip", type: "check", label: "Flip", default: false },
    ],
    showOrigin: true,
    preselect: A.selection.items.filter((r) => r.kind === "body"),
    build: (v) => ((v.entities || []).length && (v.axis || []).length ? { type: "sketchSpun" } : null),
    afterPreview(d) {
      const sk = storedSketch();
      if (!sk || !(d.values.entities || []).length || !(d.values.axis || []).length) { endLive(); return; }
      const r = spunResult(d);
      if (!r || r.error) { d.message(r ? r.error : "Select an axis", "warning"); endLive(); return; }
      const w = A.S.cloneSketch(sk);
      addProjected(w, r.items);
      showLive(w);
    },
    commit(f, d) {
      const r = spunResult(d);
      if (!r || r.error) throw new Error(r ? r.error : "Select an axis");
      return mutateSketch("Spun Profile", (sk) => addProjected(sk, r.items));
    },
    onClose: finishSel,
  });
}

export { simplify };
