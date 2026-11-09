// FORM > MODIFY: Insert Edge, Subdivide, Insert Point, Merge Edge, Bridge, Fill Hole, Erase And Fill, Weld /
// UnWeld, Crease / UnCrease, Bevel Edge, Slide Edge, Smooth, Cylindrify, Pull, Flatten, Straighten, Match,
// Interpolate, Thicken, Freeze / UnFreeze.
import * as U from "../dialogs/util.js";
import { openFormDialog, tsRow, cageOf, byBody, shownCage, planeOfRef, axisOfRef, clone } from "./common.js";
import * as O from "./ops.js";
import { V, topo, refVerts, chains, withSymmetry, boundaryLoops, tidy, symmetrize, frozenSet, isTsRef } from "./cage.js";
import { curveChains } from "./curves.js";
import { evalCage } from "./feature.js";

const pre = (app, opts, kinds) => (opts.preselect || app.selection.items || []).filter((r) => kinds.includes(r.kind) && (r.kind === "body" ? !!cageOf(app, r.body) : isTsRef(r) && !!cageOf(app, r.body)));

/** Dialog whose result is one op per selected body: op(cage, refs, values, dlg) -> cage. */
function perBody(app, spec) {
  return openFormDialog(app, {
    ...spec,
    compute(v, dlg) {
      const refs = v[spec.selRow] || [];
      if (!refs.length) return null;
      const set = new Map();
      for (const [id, rs0] of byBody(refs)) {
        const c = cageOf(app, id);
        if (!c) continue;
        const rs = spec.symmetric === false ? rs0 : withSymmetry(c, rs0);
        set.set(id, spec.op(c, rs, v, dlg));
      }
      return set.size ? { set } : null;
    },
  });
}

// ---------------------------------------------------------------- Insert Edge
export function openInsertEdge(app, opts = {}) {
  return perBody(app, {
    id: "TSplineInsertEdgeCommand", title: "Insert Edge", featureLabel: "Insert Edge",
    help: "Inserts edges at a specified position from the original edge. Select an edge or double click to select a loop.",
    preselect: pre(app, opts, ["tsEdge"]), selRow: "edges",
    rows: [
      tsRow(app, "edges", "T-Spline Edge", ["tsEdge"], { prompt: "Select edges" }),
      { id: "side", type: "dropdown", label: "Insertion Side", options: [{ value: "both", label: "Both" }, { value: "single", label: "Single" }], default: "both" },
      { id: "location", type: "value", label: "Insert Location", kind: "none", default: "0.5", min: 0.01, max: 0.99, step: 0.05 },
      { id: "mode", type: "dropdown", label: "Insertion Mode", options: [{ value: "simple", label: "Simple" }, { value: "exact", label: "Exact" }], default: "simple" },
    ],
    op: (c, rs, v, d) => O.insertEdges(c, rs, { side: v.side, t: d.num("location"), exact: v.mode === "exact" }).cage,
  });
}

// ---------------------------------------------------------------- Subdivide
export function openSubdivide(app, opts = {}) {
  return perBody(app, {
    id: "TSplineSubsetCmd", title: "Subdivide", featureLabel: "Subdivide",
    help: "Divides one or more faces into a subset of faces.",
    preselect: pre(app, opts, ["tsFace"]), selRow: "faces",
    rows: [
      tsRow(app, "faces", "T-Spline Faces", ["tsFace"], { prompt: "Select faces to divide" }),
      { id: "mode", type: "dropdown", label: "Insert Mode", options: [{ value: "simple", label: "Simple" }, { value: "exact", label: "Exact" }], default: "simple" },
      { id: "count", type: "value", label: "Faces", kind: "none", default: "2", integer: true, min: 2, max: 16 },
    ],
    op: (c, rs, v, d) => O.subdivideFaces(c, rs.map((r) => r.f), { k: d.num("count"), exact: v.mode === "exact" }).cage,
  });
}

// ---------------------------------------------------------------- Insert Point
export function openInsertPoint(app) {
  return openFormDialog(app, {
    id: "TSplineInsertPointCommand", title: "Insert Point", featureLabel: "Insert Point",
    help: "Inserts an edge by selecting two points: click points on T-Spline edges or vertices of one face.",
    activate: false,
    rows: [
      { id: "mode", type: "dropdown", label: "Insertion Mode", options: [{ value: "simple", label: "Simple" }, { value: "exact", label: "Exact" }], default: "simple" },
      { id: "info", type: "custom", label: "Insertion Point", render: (d) => { const s = document.createElement("span"); s.className = "frm-info"; d._info = s; return s; }, update: (el, d) => { el.textContent = `${(d.pts || []).length} of 2 selected`; } },
    ],
    init(d) { d.pts = []; },
    prompt: (d) => ((d.pts || []).length ? "Select second point on an edge or vertex" : "Select vertex or edge"),
    onCanvasDown(ctx, d) {
      const h = app.viewport.pick(ctx.x, ctx.y, { filter: (r) => (r.kind === "tsVertex" || r.kind === "tsEdge") && !!cageOf(app, r.body) });
      if (!h) return true;
      const r = h.ref;
      if (d.pts.length && d.pts[0].body !== r.body) { d.message("Select points on the same body", "warning"); return true; }
      if (d.pts.length >= 2) d.pts = [];
      if (r.kind === "tsVertex") d.pts.push({ body: r.body, v: r.v });
      else {
        // parameter along the cage edge from the picked point (projected on the displayed edge)
        const c = shownCage(app, r.body);
        const a = c.v[r.a], b = c.v[r.b];
        const ab = V.sub(b, a);
        const t = Math.max(0.02, Math.min(0.98, V.dot(V.sub(h.point, a), ab) / (V.dot(ab, ab) || 1)));
        d.pts.push({ body: r.body, a: r.a, b: r.b, t });
      }
      d.refresh();
      d.previewNow();
      return true;
    },
    compute(v, d) {
      if ((d.pts || []).length < 2) return null;
      const id = d.pts[0].body;
      const c = cageOf(app, id);
      let out = O.insertPoint(c, d.pts[0], d.pts[1]).cage;
      if (v.mode === "exact") out = O.fitToTargets(out, out.v.map((p, i) => (i >= c.v.length ? p.slice() : null)), 6, out.v.map((_, i) => i).filter((i) => i >= c.v.length));
      return { set: new Map([[id, out]]) };
    },
  });
}

// ---------------------------------------------------------------- Merge Edge / Bridge
function chainOf(c, refs) {
  const t = topo(c);
  const ch = chains(c, refs.map((r) => t.edge(r.a, r.b)).filter((e) => e >= 0));
  if (ch.length !== 1) return null;
  return ch[0];
}
/** Join two bodies' cages (b's indices offset). */
function joinCages(a, b) {
  const n = a.v.length;
  return tidy({
    ...clone(a), v: [...a.v.map((p) => p.slice()), ...b.v.map((p) => p.slice())], f: [...a.f.map((x) => x.slice()), ...b.f.map((x) => x.map((v) => v + n))],
    crease: [...(a.crease || []), ...(b.crease || []).map(([x, y]) => [x + n, y + n])], cv: [...(a.cv || []), ...(b.cv || []).map((v) => v + n)], frozen: [...(a.frozen || []), ...(b.frozen || []).map((v) => v + n)], iso: [...(a.iso || []), ...(b.iso || []).map((v) => v + n)],
  });
}
const boundaryEdge = (app) => (r) => { const c = cageOf(app, r.body); if (!c) return false; const t = topo(c); const e = t.edge(r.a, r.b); return e >= 0 && t.eFaces[e].length === 1; };
export function openMergeEdge(app) {
  return openFormDialog(app, {
    id: "TSplineMergeEdgeCmd", title: "Merge Edge", featureLabel: "Merge Edge",
    help: "Aligns the first set of selected edges to a second set of selected edges. Select the first set of edges then the second set of edges.",
    rows: [
      tsRow(app, "one", "Edge Group One", ["tsEdge"], { prompt: "Select side one boundary edges", filter: boundaryEdge(app), advance: false }),
      tsRow(app, "two", "Edge Group Two", ["tsEdge"], { prompt: "Select side two boundary edges", filter: boundaryEdge(app) }),
    ],
    compute(v) {
      const A = v.one || [], B = v.two || [];
      if (!A.length || !B.length) return null;
      const ida = A[0].body, idb = B[0].body;
      if (A.some((r) => r.body !== ida) || B.some((r) => r.body !== idb)) throw new Error("Each edge group must come from one body");
      let c = cageOf(app, ida);
      const cb = cageOf(app, idb);
      const ca = chainOf(c, A), cbch = chainOf(cb, B);
      if (!ca) throw new Error("Edge Group One is not connected.");
      if (!cbch) throw new Error("Edge Group Two is not connected.");
      let chB = cbch;
      if (ida !== idb) { const n = c.v.length; c = joinCages(c, cb); chB = cbch.map((x) => x + n); }
      const out = O.mergeChains(c, ca, chB);
      return ida === idb ? { set: new Map([[ida, out]]) } : { set: new Map([[ida, out]]), remove: new Set([idb]) };
    },
  });
}
export function openBridge(app) {
  const side = (r) => r.kind === "tsFace" || boundaryEdge(app)(r);
  return openFormDialog(app, {
    id: "TSplineBridgeSubDCmd", title: "Bridge", featureLabel: "Bridge",
    help: "Creates segments to connect two opposing faces within a body or between two bodies.",
    rows: [
      tsRow(app, "one", "Side 1", ["tsFace", "tsEdge"], { prompt: "Select side one faces or boundary edges", filter: side, advance: false }),
      tsRow(app, "two", "Side 2", ["tsFace", "tsEdge"], { prompt: "Select side two faces or boundary edges", filter: side }),
      { id: "faces", type: "value", label: "Faces", kind: "none", default: "2", integer: true, min: 1 },
      { id: "twists", type: "value", label: "Twists", kind: "none", default: "0", integer: true, min: -64, max: 64 },
    ],
    compute(v, d) {
      const A = v.one || [], B = v.two || [];
      if (!A.length || !B.length) return null;
      const ida = A[0].body, idb = B[0].body;
      if (A.some((r) => r.body !== ida) || B.some((r) => r.body !== idb)) throw new Error("Please select faces or boundary edges from same body");
      let c = cageOf(app, ida);
      let off = 0, fo = 0;
      if (ida !== idb) { off = c.v.length; fo = c.f.length; c = joinCages(c, cageOf(app, idb)); }
      const sideOf = (rs, shift, fshift) => (rs[0].kind === "tsFace" ? { faces: rs.filter((r) => r.kind === "tsFace").map((r) => r.f + fshift) } : { edges: rs.filter((r) => r.kind === "tsEdge").map((r) => [r.a + shift, r.b + shift]) });
      const segs = d.num("faces");
      if (segs < 1) throw new Error("Number of segments should be greater than twists");
      const out = O.bridge(c, sideOf(A, 0, 0), sideOf(B, off, fo), { segments: segs, twist: d.num("twists") || 0 });
      return ida === idb ? { set: new Map([[ida, out]]) } : { set: new Map([[ida, out]]), remove: new Set([idb]) };
    },
  });
}

// ---------------------------------------------------------------- Fill Hole / Erase And Fill
const FILL = [{ value: "reduced", label: "Reduced Star" }, { value: "ngon", label: "Fill Star" }, { value: "collapse", label: "Collapse" }];
export function openFillHole(app, opts = {}) {
  return openFormDialog(app, {
    id: "TSplineFillHoleCmd", title: "Fill Hole", featureLabel: "Fill Hole",
    help: "Fills an internal hole in T-Spline body. Select the edge of the hole and set the fill type.",
    preselect: pre(app, opts, ["tsEdge"]).filter(boundaryEdge(app)).slice(0, 1),
    rows: [
      tsRow(app, "edge", "T-Spline Edges", ["tsEdge"], { prompt: "Select boundary edges", filter: boundaryEdge(app) }),
      { id: "mode", type: "dropdown", label: "Fill Hole Mode", options: FILL, default: "reduced" },
    ],
    compute(v) {
      const set = new Map();
      for (const [id, rs] of byBody(v.edge || [])) {
        let c = cageOf(app, id);
        const done = new Set();
        for (const r of rs) {
          const loop = boundaryLoops(c).find((l) => l.includes(r.a) && l.includes(r.b));
          if (!loop || done.has(loop.join())) continue;
          done.add(loop.join());
          c = O.fillHole(c, r, v.mode);
          break; // indices change after a fill: one hole per body per step
        }
        set.set(id, c);
      }
      return set.size ? { set } : null;
    },
  });
}
export function openEraseAndFill(app, opts = {}) {
  return perBody(app, {
    id: "TSplineEraseAndFillCmd", title: "Erase And Fill", featureLabel: "Erase And Fill",
    help: "Deletes a part of connected T-Spline geometry and fills new gaps with faces. Select the faces to erase and set the fill type.",
    preselect: pre(app, opts, ["tsFace"]), selRow: "faces",
    rows: [tsRow(app, "faces", "T-Spline Faces", ["tsFace"], { prompt: "Select faces to erase and fill" }), { id: "mode", type: "dropdown", label: "Fill Hole Mode", options: FILL, default: "reduced" }],
    op: (c, rs, v) => O.eraseAndFill(c, rs.map((r) => r.f), v.mode),
  });
}

// ---------------------------------------------------------------- Weld / UnWeld
export function openWeld(app, opts = {}) {
  return openFormDialog(app, {
    id: "TSplineWeldCommand", title: "Weld Vertices", featureLabel: "Weld Vertices",
    help: "Joins two or more vertices. Vertex to Vertex moves the others onto the first one, Vertex to Midpoint welds them at their middle.",
    preselect: pre(app, opts, ["tsVertex"]),
    rows: [
      tsRow(app, "verts", "T-Spline Vertices", ["tsVertex"], { prompt: "Select vertices" }),
      { id: "mode", type: "dropdown", label: "Weld Mode", options: [{ value: "vertex", label: "Vertex to Vertex" }, { value: "mid", label: "Vertex to Midpoint" }, { value: "tol", label: "Weld to Tolerance" }], default: "vertex" },
      { id: "tol", type: "value", label: "Weld Tolerance", kind: "length", default: "0.10 mm", positive: true, visible: (v) => v.mode === "tol" },
    ],
    compute(v, d) {
      const rs = v.verts || [];
      if (rs.length < 2) return null;
      const id = rs[0].body;
      let c = cageOf(app, id);
      const others = rs.filter((r) => r.body !== id);
      let vs = rs.filter((r) => r.body === id).map((r) => r.v);
      const remove = new Set();
      if (others.length) {
        const ob = others[0].body;
        const n = c.v.length;
        c = joinCages(c, cageOf(app, ob));
        vs = [...vs, ...others.filter((r) => r.body === ob).map((r) => r.v + n)];
        remove.add(ob);
      }
      const out = O.weld(c, vs, { mode: v.mode, tol: d.num("tol") });
      return { set: new Map([[id, out]]), remove };
    },
  });
}
export function openUnweld(app, opts = {}) {
  return perBody(app, {
    id: "TSplineUnWeldCommand", title: "UnWeld Edges", featureLabel: "UnWeld Edges",
    help: "Disconnects an edge or loop: the faces on either side of the selected edges are no longer joined.",
    preselect: pre(app, opts, ["tsEdge"]), selRow: "edges", symmetric: false,
    rows: [tsRow(app, "edges", "T-Spline Edges", ["tsEdge"], { prompt: "Select edges" })],
    op: (c, rs) => O.unweld(c, rs),
  });
}

// ---------------------------------------------------------------- Crease / UnCrease
export function openCrease(app, on, opts = {}) {
  return perBody(app, {
    id: on ? "TSplineCreasedEdgeCommand" : "TSplineUnCreaseEdgeCmd", title: on ? "Crease" : "UnCrease", featureLabel: on ? "Crease" : "UnCrease",
    help: on ? "Creates a sharp edge between faces. Select edges to crease." : "Restores previously creased edges to their original state.",
    preselect: pre(app, opts, ["tsEdge", "tsVertex"]), selRow: "ents",
    rows: [tsRow(app, "ents", "T-Spline Entity", ["tsEdge", "tsVertex"], { prompt: "Select edges or vertices" })],
    op: (c, rs) => O.setCrease(c, rs, on),
  });
}

// ---------------------------------------------------------------- Bevel / Slide
export function openBevel(app, opts = {}) {
  return perBody(app, {
    id: "TSplineBevelEdgeCommand", title: "Bevel Edge", featureLabel: "Bevel Edge",
    help: "Creates a bevel on a T-spline body along selected edges.",
    preselect: pre(app, opts, ["tsEdge"]), selRow: "edges",
    rows: [
      tsRow(app, "edges", "T-Spline Edges", ["tsEdge"], { prompt: "Select edges between non-parallel faces" }),
      { id: "distMode", type: "dropdown", label: "Distance Mode", options: [{ value: "relative", label: "Relative Offset" }, { value: "absolute", label: "Bevel Width" }], default: "relative" },
      { id: "ratio", type: "value", label: "Offset Ratio", kind: "none", default: "0.3", min: 0.01, max: 0.45, step: 0.05, visible: (v) => v.distMode === "relative" },
      { id: "width", type: "value", label: "Width", kind: "length", default: "2.00 mm", positive: true, visible: (v) => v.distMode === "absolute" },
      { id: "segments", type: "value", label: "Segments", kind: "none", default: "1", integer: true, min: 1, max: 12 },
    ],
    op: (c, rs, v, d) => {
      let ratio = d.num("ratio");
      if (v.distMode === "absolute") {
        // width across the bevel -> ratio of the neighbouring cross edges
        const t = topo(c);
        let L = 0, n = 0;
        for (const r of rs) for (const x of [r.a, r.b]) for (const e of t.vEdges[x]) { L += V.dist(...t.edges[e].map((i) => c.v[i])); n++; }
        ratio = Math.min(0.45, Math.max(0.02, d.num("width") / 2 / ((L / Math.max(1, n)) || 1)));
      }
      return O.bevelEdges(c, rs, { ratio, segments: d.num("segments") });
    },
  });
}
export function openSlide(app, opts = {}) {
  return perBody(app, {
    id: "TSplineSlideEdgeCommand", title: "Slide Edge", featureLabel: "Slide Edge",
    help: "Moves the selected edge along the control polygon. Select the edges then specify the new position.",
    preselect: pre(app, opts, ["tsEdge"]), selRow: "edges", symmetric: false,
    rows: [
      tsRow(app, "edges", "T-Spline Edges", ["tsEdge"], { prompt: "Select edges" }),
      { id: "loc", type: "value", label: "Slide Location", kind: "none", default: "0.3", min: -0.95, max: 0.95, step: 0.05 },
    ],
    op: (c, rs, v, d) => {
      const out = O.slideEdges(c, rs, d.num("loc"));
      const moved = new Set(out.v.map((p, i) => (V.dist(p, c.v[i]) > 1e-12 ? i : -1)).filter((i) => i >= 0));
      return tidy({ ...out, v: symmetrize(c, out.v, moved) });
    },
  });
}

// ---------------------------------------------------------------- shape tools
const vertsOf = (c, rs) => refVerts(c, rs);
function shapeOp(app, spec) {
  return perBody(app, {
    symmetric: false,
    ...spec,
    op: (c, rs, v, d) => {
      const out = spec.shape(c, rs, v, d);
      const moved = new Set(out.v.map((p, i) => (c.v[i] && V.dist(p, c.v[i]) > 1e-12 ? i : -1)).filter((i) => i >= 0));
      return out.v.length === c.v.length ? tidy({ ...out, v: symmetrize(c, out.v, moved) }) : out;
    },
  });
}
export function openSmooth(app, opts = {}) {
  return shapeOp(app, {
    id: "TSplineSmoothCmd", title: "Smooth", featureLabel: "Smooth", help: "Smoothes an area of the T-Spline geometry. Select the faces to smooth and the smoothing rate.",
    preselect: pre(app, opts, ["tsFace", "tsVertex", "tsEdge", "body"]), selRow: "faces",
    rows: [
      tsRow(app, "faces", "Faces", ["tsFace", "tsEdge", "tsVertex", "body"], { prompt: "Select Faces" }),
      { id: "mode", type: "dropdown", label: "Smoothing Mode", options: [{ value: "selection", label: "Selection" }, { value: "brush", label: "Brush", disabled: true }], default: "selection" },
      { id: "rate", type: "value", label: "Smoothing", kind: "none", default: "0.5", min: 0.01, max: 1, step: 0.1 },
    ],
    shape: (c, rs, v, d) => O.smooth(c, vertsOf(c, rs), d.num("rate"), 3),
  });
}
export function openCylindrify(app, opts = {}) {
  return shapeOp(app, {
    id: "TSplineCylindrifyCmd", title: "Cylindrify", featureLabel: "Cylindrify", help: "Forms uneven T-Spline geometry into a smooth cylindrical shape.",
    preselect: pre(app, opts, ["tsFace"]), selRow: "faces",
    rows: [tsRow(app, "faces", "Faces", ["tsFace"], { prompt: "Select faces to cylindrify" })],
    shape: (c, rs) => O.cylindrify(c, rs.map((r) => r.f)),
  });
}
export function openFlatten(app, opts = {}) {
  return shapeOp(app, {
    id: "TSplineFlattenSubDCmd", title: "Flatten", featureLabel: "Flatten", help: "Projects vertices to a best fit or user defined plane.",
    preselect: pre(app, opts, ["tsVertex", "tsEdge", "tsFace"]), selRow: "verts",
    rows: [
      tsRow(app, "verts", "T-Spline Vertices", ["tsVertex", "tsEdge", "tsFace"], { prompt: "Select vertices and/or tangency handles to flatten", advance: false }),
      { id: "type", type: "dropdown", label: "Flatten Type", options: [{ value: "fit", label: "Best Fit" }, { value: "parallel", label: "Parallel" }, { value: "plane", label: "Plane" }], default: "fit" },
      { id: "plane", type: "selection", label: "Select Plane", kinds: ["originPlane", "cplane", "face"], planar: true, max: 1, min: 1, visible: (v) => v.type !== "fit", prompt: "Select a work plane or planar B-rep face" },
    ],
    shape: (c, rs, v, d) => {
      const vs = vertsOf(c, rs);
      if (v.type === "fit") return O.flatten(c, vs);
      const pl = planeOfRef(app, U, (v.plane || [])[0], d.baseState);
      if (!pl) throw new Error("Select a work plane or planar B-rep face");
      const o = v.type === "parallel" ? V.avg([...vs].map((i) => c.v[i])) : pl.o;
      return O.flatten(c, vs, { o, n: pl.n });
    },
  });
}
export function openStraighten(app, opts = {}) {
  return shapeOp(app, {
    id: "TSplineStraightenCmd", title: "Straighten", featureLabel: "Straighten", help: "Straightens vertices to a best fit line, an existing line, or a line through two selected points.",
    preselect: pre(app, opts, ["tsVertex", "tsEdge"]), selRow: "verts",
    rows: [
      tsRow(app, "verts", "T-Spline Vertices", ["tsVertex", "tsEdge"], { prompt: "Select vertices to straighten", advance: false }),
      { id: "type", type: "dropdown", label: "Straighten Type", options: [{ value: "fit", label: "Best Fit" }, { value: "line", label: "Line" }, { value: "parallel", label: "Parallel" }, { value: "two", label: "Two Points" }], default: "fit" },
      { id: "line", type: "selection", label: "Select Line", kinds: ["originAxis", "sketchCurve", "edge", "tsEdge"], max: 1, visible: (v) => v.type === "line" || v.type === "parallel", prompt: "Select a line to straighten along" },
      { id: "pts", type: "selection", label: "Two Points", kinds: ["tsVertex", "sketchPoint", "vertex"], max: 2, min: 2, visible: (v) => v.type === "two", prompt: "Select two points to define a line to straighten along" },
    ],
    shape: (c, rs, v, d) => {
      const vs = vertsOf(c, rs);
      if (v.type === "fit") return O.straighten(c, vs);
      if (v.type === "two") {
        const P2 = (v.pts || []).map((r) => pointOfRef(app, r, d.baseState)).filter(Boolean);
        if (P2.length < 2) throw new Error("Could not find a line from the given inputs.");
        return O.straighten(c, vs, { o: P2[0], d: V.sub(P2[1], P2[0]) });
      }
      const ax = axisOfRef(app, U, (v.line || [])[0], d.baseState);
      if (!ax) throw new Error("Select a line to straighten along");
      const o = v.type === "parallel" ? V.avg([...vs].map((i) => c.v[i])) : ax.o;
      return O.straighten(c, vs, { o, d: ax.d });
    },
  });
}
function pointOfRef(app, r, state) {
  if (r.kind === "tsVertex") { const c = shownCage(app, r.body); return c && c.v[r.v]; }
  if (r.kind === "vertex") return r.p;
  if (r.kind === "sketchPoint") { const s = state.sketches.get(r.sketch); const p = s && s.sk.points[r.point]; return p ? app.K.toWorld(s.plane, p.x, p.y) : null; }
  return null;
}
export function openInterpolate(app, opts = {}) {
  return shapeOp(app, {
    id: "TSplineInterpolateSubDCmd", title: "Interpolate", featureLabel: "Interpolate",
    help: "Switches the location of the surface and the control points to improve fitting. Surface Points: the surface moves through the control points. Control Points: the control points move onto the surface.",
    preselect: pre(app, opts, ["body", "tsVertex", "tsFace", "tsEdge"]), selRow: "ents",
    rows: [
      tsRow(app, "ents", "T-Spline Body", ["body", "tsVertex", "tsEdge", "tsFace"], { prompt: "Select body" }),
      { id: "fit", type: "dropdown", label: "Fit", options: [{ value: "surface", label: "Surface Points" }, { value: "control", label: "Control Points" }], default: "surface" },
    ],
    shape: (c, rs, v) => O.interpolate(c, vertsOf(c, rs), v.fit),
  });
}

// ---------------------------------------------------------------- Pull / Match (targets)
/** Closest-point function on the target refs (bodies of any kind, faces, sketch curves, edges). */
function targetFn(app, refs, state, curvesOnly = false) {
  const tris = [], segs = [];
  for (const r of refs) {
    if (r.kind === "body" || r.kind === "face") {
      const b = app.anyBody(r.body);
      if (!b) continue;
      if (b.shape && !curvesOnly) { const md = app.viewport.meshFor(b.shape); tris.push({ P: md.vertices, I: md.triangles }); }
      else if (b.mesh && !curvesOnly) tris.push({ P: b.mesh.positions, I: b.mesh.indices || Uint32Array.from({ length: b.mesh.positions.length / 3 }, (_, i) => i) });
    }
  }
  for (const ch of curveChains(app, refs.filter((r) => ["sketchCurve", "edge", "tsEdge", "profile"].includes(r.kind)), state)) {
    const pts = ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts;
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
  }
  if (!tris.length && !segs.length) return null;
  return (p) => {
    let best = null, bd = Infinity;
    for (const { P, I } of tris) for (let t = 0; t < I.length; t += 3) {
      const q = closestOnTri(p, [P[3 * I[t]], P[3 * I[t] + 1], P[3 * I[t] + 2]], [P[3 * I[t + 1]], P[3 * I[t + 1] + 1], P[3 * I[t + 1] + 2]], [P[3 * I[t + 2]], P[3 * I[t + 2] + 1], P[3 * I[t + 2] + 2]]);
      const dd = V.dist(p, q);
      if (dd < bd) { bd = dd; best = q; }
    }
    for (const [a, b] of segs) {
      const ab = V.sub(b, a);
      const t = Math.max(0, Math.min(1, V.dot(V.sub(p, a), ab) / (V.dot(ab, ab) || 1)));
      const q = V.add(a, V.mul(ab, t));
      const dd = V.dist(p, q);
      if (dd < bd) { bd = dd; best = q; }
    }
    return best;
  };
}
function closestOnTri(p, a, b, c) {
  const ab = V.sub(b, a), ac = V.sub(c, a), ap = V.sub(p, a);
  const d1 = V.dot(ab, ap), d2 = V.dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = V.sub(p, b), d3 = V.dot(ab, bp), d4 = V.dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return V.add(a, V.mul(ab, d1 / (d1 - d3)));
  const cp = V.sub(p, c), d5 = V.dot(ab, cp), d6 = V.dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return V.add(a, V.mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return V.add(b, V.mul(V.sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
  const den = 1 / (va + vb + vc);
  return V.add(a, V.add(V.mul(ab, vb * den), V.mul(ac, vc * den)));
}
export function openPull(app, opts = {}) {
  return shapeOp(app, {
    id: "TSplinePullSubDCmd", title: "Pull", featureLabel: "Pull", help: "Snaps selected T-Spline vertices to a face or surface. The vertices could be control points or surface points.",
    preselect: pre(app, opts, ["tsVertex", "tsEdge", "tsFace", "body"]), selRow: "verts",
    rows: [
      tsRow(app, "verts", "T-Spline Vertices", ["tsVertex", "tsEdge", "tsFace", "body"], { prompt: "Select vertices" }),
      { id: "target", type: "selection", label: "Targets", kinds: ["body", "face"], meshBodies: true, prompt: "Select target", filter: (r) => !cageOf(app, r.body) },
      { id: "type", type: "dropdown", label: "Pull Type", options: [{ value: "control", label: "Control Points" }, { value: "surface", label: "Surface Points" }], default: "control" },
    ],
    shape: (c, rs, v, d) => {
      const fn = targetFn(app, v.target || [], d.baseState);
      if (!fn) throw new Error("Select target");
      return O.pull(c, vertsOf(c, rs), fn, v.type);
    },
  });
}
export function openMatch(app, opts = {}) {
  return shapeOp(app, {
    id: "TSplineMatchCmd", title: "Match", featureLabel: "Match", help: "Matches T-Spline boundary edges to target edges, sketch curves or faces.",
    preselect: pre(app, opts, ["tsEdge"]), selRow: "edges",
    rows: [
      tsRow(app, "edges", "T-Spline Edges", ["tsEdge"], { prompt: "Select T-Spline edges", advance: false }),
      { id: "target", type: "selection", label: "Match Edges", kinds: ["sketchCurve", "edge", "face", "body"], meshBodies: true, prompt: "Select Targets", filter: (r) => !r.body || !cageOf(app, r.body) },
      { id: "continuity", type: "dropdown", label: "Continuity", options: [{ value: "g0", label: "Connected (G0)" }, { value: "g1", label: "Tangent (G1)" }, { value: "g2", label: "Curvature (G2)", disabled: true }], default: "g0" },
    ],
    shape: (c, rs, v, d) => {
      const fn = targetFn(app, v.target || [], d.baseState);
      if (!fn) throw new Error("Select Targets");
      const vs = vertsOf(c, rs);
      let out = O.pull(c, vs, fn, "surface");
      if (v.continuity === "g1") {
        // the next row in follows half of the boundary's displacement (keeps the tangent direction)
        const t = topo(c);
        const P = out.v.map((p) => p.slice());
        const fz = frozenSet(c);
        for (const vv of vs) for (const e of t.vEdges[vv]) { const w = t.edges[e][0] === vv ? t.edges[e][1] : t.edges[e][0]; if (vs.has(w) || fz.has(w)) continue; P[w] = V.add(c.v[w], V.mul(V.sub(out.v[vv], c.v[vv]), 0.5)); }
        out = tidy({ ...out, v: P });
      }
      return out;
    },
  });
}

// ---------------------------------------------------------------- Thicken / Freeze
export function openThicken(app, opts = {}) {
  return perBody(app, {
    id: "TSplineThickenCommand", title: "Thicken", featureLabel: "Thicken", help: "Creates a body offset. Select the body then set the thickness and end treatments.",
    preselect: pre(app, opts, ["body", "tsFace"]).map((r) => ({ kind: "body", body: r.body })).slice(0, 1), selRow: "body", symmetric: false,
    rows: [
      tsRow(app, "body", "T-Spline Body", ["body", "tsFace"], { prompt: "Select body", mapRef: (r) => ({ kind: "body", body: r.body }) }),
      { id: "thickness", type: "value", label: "Thickness", kind: "length", default: "2.00 mm", positive: true },
      { id: "type", type: "dropdown", label: "Thicken Type", options: [{ value: "sharp", label: "Sharp" }, { value: "soft", label: "Soft" }, { value: "noedge", label: "No Edge" }], default: "sharp" },
      { id: "dir", type: "dropdown", label: "Direction", options: [{ value: "one", label: "One Side", icon: "oneSide" }, { value: "sym", label: "Symmetric", icon: "symmetric" }], default: "one" },
    ],
    op: (c, rs, v, d) => O.thicken(c, { thickness: d.num("thickness"), type: v.type, direction: v.dir }),
    manipulators(d) {
      const r = (d.values.body || [])[0];
      const c = r && cageOf(app, r.body);
      if (!c) return [];
      const e = evalCage(c);
      const f0 = c.f[0];
      const p = V.avg(f0.map((i) => e.limit(i)));
      const n = (() => { const a = c.v[f0[0]], b = c.v[f0[1]], q = c.v[f0[2]]; return V.norm(V.cross(V.sub(b, a), V.sub(q, a))); })();
      return [d.valueManip("thickness", { origin: p, dir: V.mul(n, -1), min: 0.01 })].filter(Boolean);
    },
  });
}
export function openFreeze(app, on, opts = {}) {
  return perBody(app, {
    id: on ? "TSplineFreezeCmd" : "TSplineUnFreezeCmd", title: on ? "Freeze" : "UnFreeze", featureLabel: on ? "Freeze" : "UnFreeze",
    help: on ? "Freezes faces and edges on the model to prevent accidental changes." : "Unfreezes faces and edges that have previously been frozen.",
    preselect: pre(app, opts, ["tsFace", "tsEdge", "tsVertex", "body"]), selRow: "ents", symmetric: false,
    rows: [tsRow(app, "ents", on ? "T-Spline Faces/Edges" : "T-Spline Entity", ["tsFace", "tsEdge", "tsVertex", "body"], { prompt: on ? "Select faces or edges to freeze" : "Select frozen faces or edges to unfreeze" })],
    op: (c, rs) => {
      const vs = refVerts(c, rs);
      const fz = new Set(c.frozen || []);
      for (const v of vs) { if (on) fz.add(v); else fz.delete(v); }
      return tidy({ ...clone(c), frozen: [...fz] });
    },
  });
}
