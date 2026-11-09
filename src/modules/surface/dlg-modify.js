// SURFACE > MODIFY dialogs: Extend, Trim, Untrim, Stitch, Unstitch, Merge, Reverse Normal, plus
// Validate (INSPECT) and Silhouette Split (SOLID > MODIFY).
import * as U from "../dialogs/util.js";
import { toBodyRef } from "../dialogs/common.js";
import * as D from "./dlg-util.js";
import * as G from "./occ.js";

const V = U.V;
const edit = (app, opts) => (opts.editId ? app.feature(opts.editId) : null);
const surfaceOnly = (app) => (r, dlg) => D.isSurface(app, dlg.baseState, r.body);

// ------------------------------------------------------------------ Extend
export function openExtend(app, opts = {}) {
  const f0 = edit(app, opts);
  const freeEdge = (r, dlg) => {
    if (!D.isSurface(app, dlg.baseState, r.body)) return false;
    const b = dlg.baseState.bodies.get(r.body);
    const g = b && app.K.topoOf(b.shape).edges[r.index];
    return !!g && (g.faces || []).length === 1;
  };
  return app.ui.dialog.open({
    id: "FusionExtendCommand", title: "Extend", icon: "FusionExtendCommand", featureLabel: "Extend", editId: opts.editId || null,
    help: "Enlarges a surface by extending its edges a specified distance.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "edge"),
    rows: [
      { id: "edges", type: "selection", label: "Edges", kinds: ["edge"], prompt: "Select edges to extend", filter: freeEdge, mapRef: (r, dlg) => (dlg.values.chain !== false ? D.edgeChain(dlg.baseState, r.body, r.index, "tangent").filter((x) => freeEdge(x, dlg)) : r), tooltip: "Select edges to extend." },
      { id: "chain", type: "check", label: "Chain Selection", default: true, tooltip: "Automatically select connected geometry." },
      { id: "distance", type: "value", label: "Distance", kind: "length", default: "10.00 mm", tooltip: "Specify distance to extend surface." },
      { id: "extendType", type: "dropdown", label: "Extend Type", options: [{ value: "natural", label: "Natural", icon: "free" }, { value: "tangent", label: "Tangent", icon: "tangentG1" }, { value: "perpendicular", label: "Perpendicular", icon: "distance" }], tooltip: "Natural extends existing faces; Tangent keeps tangency; Perpendicular creates faces perpendicular to the existing faces." },
      { id: "alignment", type: "dropdown", label: "Edge Alignment", options: [{ value: "free", label: "Free Edges", icon: "free" }, { value: "align", label: "Align Edges", icon: "tangentG1" }], tooltip: "Free Edges: sharp corners between extended edges; Align Edges: rounded corners." },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, { edges: D.edgeSelRefs(dlg.baseState, f0.edges), distance: f0.distance ?? "10 mm", extendType: f0.extendType || "natural", alignment: f0.alignment || "free" });
    },
    status: (dlg) => D.countStatus(dlg.values.edges),
    validate: (dlg) => (Math.abs(dlg.num("distance") || 0) < 1e-9 ? "Distance is zero" : null),
    build(v) {
      const edges = D.edgeRefsOf(v.edges);
      if (!edges.length) return null;
      return { type: "surfExtend", edges, distance: v.distance, extendType: v.extendType, alignment: v.alignment };
    },
    manipulators(dlg) {
      const r = (dlg.values.edges || [])[0];
      if (!r) return [];
      const b = dlg.baseState.bodies.get(r.body);
      if (!b) return [];
      const g = app.K.topoOf(b.shape).edges[r.index];
      const fi = g && (g.faces || [])[0];
      if (fi === undefined) return [];
      const fc = app.K.topoOf(b.shape).faces[fi];
      // away from the face centre, perpendicular to the edge
      let d = V.sub(r.p, fc.c);
      const t = g.d || [1, 0, 0];
      d = V.sub(d, V.mul(t, V.dot(d, t)));
      if (V.len(d) < 1e-9) return [];
      return [dlg.valueManip("distance", { origin: r.p, dir: V.norm(d) })].filter(Boolean);
    },
  });
}

// ------------------------------------------------------------------ Trim
export function openTrim(app, opts = {}) {
  const f0 = edit(app, opts);
  const pieces = (dlg) => (dlg.previewRes && dlg.previewRes.pieces) || [];
  const removeRow = {
    id: "remove", type: "custom", label: "Faces to Remove",
    render() { const e = D.el("div", "srf-trim"); e.dataset.input = "remove"; return e; },
    update(e, dlg) {
      const n = (dlg.values.remove || []).length;
      e.textContent = "";
      const t = D.el("span", "srf-trim-n", n ? `${n} face${n > 1 ? "s" : ""} to remove` : "Click the faces to remove");
      e.appendChild(t);
      if (n) {
        const c = D.el("button", "srf-trim-clear", "Clear");
        c.type = "button";
        c.addEventListener("click", () => dlg.set("remove", [], { user: true }));
        e.appendChild(c);
      }
    },
  };
  return app.ui.dialog.open({
    id: "FusionSurfaceTrimCommand", title: "Trim", icon: "FusionSurfaceTrimCommand", featureLabel: "Trim", editId: opts.editId || null,
    help: "Removes the selected area of a surface body using the specified cutting tool.",
    preselect: (opts.preselect || []).filter((r) => ["body", "face", "originPlane", "cplane", "sketchCurve"].includes(r.kind)).slice(0, 1),
    rows: [
      { id: "tool", type: "selection", label: "Trim Tool", kinds: ["body", "face", "originPlane", "cplane", "sketchCurve"], mapRef: (r, dlg) => (r.kind === "face" ? { kind: "body", body: r.body } : r.kind === "sketchCurve" ? D.sketchChainRefs(app, dlg.baseState, r) : r), prompt: "Select a trimming tool", tooltip: "Select a surface, body, plane or sketch curves as the cutting tool." },
      removeRow,
    ],
    init(dlg) {
      dlg.values.remove = [];
      if (!f0) return;
      Object.assign(dlg.values, {
        tool: [...D.bodySelRefs(f0.tools), ...(f0.toolPlane ? [U.refFromPlaneRef(f0.toolPlane, dlg.baseState)] : []), ...D.curveSelRefs(f0.toolCurves)].filter(Boolean),
        remove: (f0.remove || []).map((r) => ({ body: r.body, p: [...r.p] })),
      });
    },
    onChange(id, dlg, o = {}) {
      if (id !== "tool" || dlg._opening) return;
      dlg.values.remove = [];
      // like Fusion: once the tool is picked, canvas clicks pick the faces to remove (the Trim Tool
      // button re-activates the tool row)
      if ((dlg.values.tool || []).length && !o.preselect) setTimeout(() => { if (!dlg.closed && dlg.active === "tool") dlg.activate(null); }, 0);
    },
    activate: (dlg) => ((dlg.values.tool || []).length ? false : "tool"),
    prompt: (dlg) => (!(dlg.values.tool || []).length ? "Select a trimming tool" : "Select the faces to remove"),
    onCanvasDown(ctx, dlg) {
      if (dlg.active === "tool" || !ctx.ray) return false;
      const list = pieces(dlg);
      if (!list.length) return false;
      const hit = D.rayPick(app, list.map((pc) => pc.shape), ctx.ray);
      if (!hit) return true;
      const pc = list[hit.i];
      let rem = [...(dlg.values.remove || [])];
      if (pc.removed) rem = rem.filter((r) => !(r.body === pc.body && G.pointDistance(pc.shape, r.p) < 1e-2));
      else rem.push({ body: pc.body, p: hit.p.map((x) => Math.round(x * 1e6) / 1e6) });
      dlg.set("remove", rem, { user: true });
      return true;
    },
    extraPreview(dlg, res) {
      // pieces to remove are drawn red (Fusion: "Surfaces to be trimmed will turn red")
      return ((res && res.pieces) || []).filter((pc) => pc.removed).map((pc) => ({ shape: pc.shape, color: "cut", opacity: 0.45 }));
    },
    validate: (dlg) => (!(dlg.values.remove || []).length ? "No Target Face selected to remove!" : null),
    status: (dlg) => { const n = (dlg.values.remove || []).length; return n ? `${n} Face${n > 1 ? "s" : ""}` : ""; },
    build(v) {
      const t = v.tool || [];
      if (!t.length) return null;
      const f = { type: "surfTrim", tools: [...new Set(t.filter((r) => r.kind === "body").map((r) => r.body))], remove: (v.remove || []).map((r) => ({ body: r.body, p: r.p })) };
      const pl = t.find((r) => r.kind === "originPlane" || r.kind === "cplane");
      if (pl) f.toolPlane = U.planeRefFromRef(pl);
      const curves = D.curveRefsOf(t);
      if (curves.length) f.toolCurves = curves;
      return f;
    },
  });
}

// ------------------------------------------------------------------ Untrim
export function openUntrim(app, opts = {}) {
  const f0 = edit(app, opts);
  return app.ui.dialog.open({
    id: "FusionSurfaceUntrimCommand", title: "Untrim", icon: "FusionSurfaceUntrimCommand", featureLabel: "Untrim", editId: opts.editId || null,
    help: "Extends trimmed surfaces and fills gaps, holes, or empty regions.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "face"),
    rows: [
      { id: "untrimType", type: "dropdown", label: "Type", options: [{ value: "all", label: "All Edges", icon: "all" }, { value: "external", label: "External Edges", icon: "outside" }, { value: "internal", label: "Internal Edges", icon: "inside" }, { value: "manual", label: "Manual", icon: "selArrow" }], tooltip: "Untrims all, external, internal or manually selected edges of a surface." },
      { id: "faces", type: "selection", label: "Faces", kinds: ["face"], filter: surfaceOnly(app), visible: (v) => v.untrimType !== "manual", prompt: "Select faces to untrim", tooltip: "Select faces to untrim." },
      { id: "edges", type: "selection", label: "Edges", kinds: ["edge"], filter: surfaceOnly(app), visible: (v) => v.untrimType === "manual", prompt: "Select edges to untrim", tooltip: "Select edges to untrim." },
      { id: "extension", type: "value", label: "Extend", kind: "length", default: "0.00 mm", nonNegative: true, visible: (v) => v.untrimType !== "internal", tooltip: "Specify distance to extend untrimmed surface." },
      { id: "keepCopy", type: "check", label: "Keep Copy", tooltip: "Creates a copy of original trimmed surface." },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      Object.assign(dlg.values, { untrimType: f0.untrimType || "all", faces: D.faceSelRefs(st, f0.faces), edges: D.edgeSelRefs(st, f0.edges), extension: f0.extension ?? "0.00 mm", keepCopy: !!f0.keepCopy });
    },
    status: (dlg) => D.countStatus(dlg.values.untrimType === "manual" ? dlg.values.edges : dlg.values.faces),
    build(v) {
      const manual = v.untrimType === "manual";
      const faces = manual ? [] : D.faceRefsOf(v.faces), edges = manual ? D.edgeRefsOf(v.edges) : [];
      if (!faces.length && !edges.length) return null;
      return { type: "surfUntrim", untrimType: v.untrimType, faces, edges, extension: v.extension, keepCopy: !!v.keepCopy };
    },
  });
}

// ------------------------------------------------------------------ Stitch
export function openStitch(app, opts = {}) {
  const f0 = edit(app, opts);
  return app.ui.dialog.open({
    id: "FusionSurfaceStitchCommand", title: "Stitch", icon: "FusionSurfaceStitchCommand", featureLabel: "Stitch", editId: opts.editId || null,
    help: "Joins surfaces to make a single surface body or solid body.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "body" || r.kind === "face").map(toBodyRef),
    rows: [
      { id: "bodies", type: "selection", label: "Stitch Surfaces", kinds: ["body", "face"], mapRef: (r) => toBodyRef(r), filter: surfaceOnly(app), prompt: "Select Surfaces to Stitch", tooltip: "Select the surfaces to join. Open edges are highlighted red." },
      { id: "tolerance", type: "value", label: "Tolerance", kind: "length", default: "0.01 mm", positive: true, tooltip: "Edges closer than the tolerance are stitched." },
      { id: "operation", type: "dropdown", label: "Operation", options: D.ops("new", "newComponent"), default: "new", sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, { bodies: D.bodySelRefs(f0.bodies), tolerance: f0.tolerance ?? "0.01 mm", operation: f0.operation || "new" });
    },
    extraPreview(dlg, res) { return res && res.freeEdges ? [{ shape: res.freeEdges, color: "#e3262b", opacity: 0.55 }] : []; },
    afterPreview(dlg) {
      const r = dlg.previewRes;
      if (!r || r.ok === false) return;
      const n = (r.free || []).length;
      dlg.message(r.solid && !n ? "The stitched surfaces form a closed solid body." : n ? `${n} open edge${n > 1 ? "s" : ""} (red) remain after stitching.` : "", "info");
    },
    status: (dlg) => D.countStatus(dlg.values.bodies),
    build(v) {
      const bodies = [...new Set((v.bodies || []).map((r) => r.body))];
      if (!bodies.length) return null;
      return { type: "surfStitch", bodies, tolerance: v.tolerance, operation: v.operation };
    },
  });
}

// ------------------------------------------------------------------ Unstitch
export function openUnstitch(app, opts = {}) {
  const f0 = edit(app, opts);
  return app.ui.dialog.open({
    id: "FusionSurfaceUnStitchCommand", title: "Unstitch", icon: "FusionSurfaceUnStitchCommand", featureLabel: "Unstitch", editId: opts.editId || null,
    help: "Breaks joined surfaces into individual surfaces.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "body" || r.kind === "face"),
    rows: [
      { id: "faces", type: "selection", label: "Faces / Bodies", kinds: ["face", "body"], mapRef: (r, dlg) => (r.kind === "face" && dlg.values.chain ? D.faceChain(dlg.baseState, r.body, r.index) : r), prompt: "Select faces or bodies to unstitch", tooltip: "The selected faces are unhooked from their body; selected bodies are broken into individual surfaces." },
      { id: "chain", type: "check", label: "Chain Selection", default: false, tooltip: "Automatically select connected tangent faces." },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, { faces: [...D.faceSelRefs(dlg.baseState, f0.faces), ...D.bodySelRefs(f0.bodies)] });
    },
    status: (dlg) => D.countStatus(dlg.values.faces),
    build(v) {
      const faces = D.faceRefsOf(v.faces);
      const bodies = [...new Set((v.faces || []).filter((r) => r.kind === "body").map((r) => r.body))];
      if (!faces.length && !bodies.length) return null;
      return { type: "surfUnstitch", faces, bodies };
    },
  });
}

// ------------------------------------------------------------------ Merge
export function openMerge(app, opts = {}) {
  const f0 = edit(app, opts);
  return app.ui.dialog.open({
    id: "FusionSurfaceMergeCommand", title: "Merge", icon: "FusionSurfaceMergeCommand", featureLabel: "Merge", editId: opts.editId || null,
    help: "Combines the selected faces into a single face. You can select solid or surface faces.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "face"),
    rows: [
      { id: "faces", type: "selection", label: "Selection", kinds: ["face"], min: 2, filter: (r, dlg) => { const f = (dlg.values.faces || [])[0]; return !f || f.body === r.body; }, prompt: "Select faces", tooltip: "Select two or more adjacent faces of one body that lie on one surface." },
    ],
    init(dlg) { if (f0) dlg.values.faces = D.faceSelRefs(dlg.baseState, f0.faces); },
    status: (dlg) => D.countStatus(dlg.values.faces),
    build(v) {
      const faces = D.faceRefsOf(v.faces);
      if (faces.length < 2) return null;
      return { type: "surfMerge", faces };
    },
  });
}

// ------------------------------------------------------------------ Reverse Normal
export function openReverseNormal(app, opts = {}) {
  const f0 = edit(app, opts);
  return app.ui.dialog.open({
    id: "FusionSurfaceReverseNormalCommand", title: "Reverse Normal", icon: "FusionSurfaceReverseNormalCommand", featureLabel: "Reverse Normal", editId: opts.editId || null,
    help: "Flips the positive direction of all faces on a selected surface body.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "body" || r.kind === "face").map(toBodyRef),
    rows: [
      { id: "bodies", type: "selection", label: "Faces", kinds: ["face", "body"], mapRef: (r) => toBodyRef(r), filter: surfaceOnly(app), prompt: "Select a surface body to reverse", tooltip: "Select a surface body to reverse." },
    ],
    init(dlg) { if (f0) dlg.values.bodies = D.bodySelRefs(f0.bodies); },
    status: (dlg) => D.countStatus(dlg.values.bodies),
    build(v) {
      const bodies = [...new Set((v.bodies || []).map((r) => r.body))];
      return bodies.length ? { type: "surfReverse", bodies } : null;
    },
  });
}

// ------------------------------------------------------------------ Silhouette Split
export function openSilhouetteSplit(app, opts = {}) {
  const f0 = edit(app, opts);
  return app.ui.dialog.open({
    id: "FusionPartingLineSplitCmd", title: "Silhouette Split", icon: "FusionPartingLineSplitCmd", featureLabel: "Silhouette Split", editId: opts.editId || null,
    help: "Splits a body using surfaces generated from its silhouette curves.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "body" || r.kind === "originPlane" || r.kind === "originAxis" || r.kind === "cplane"),
    rows: [
      { id: "view", type: "selection", label: "View Direction", kinds: ["originPlane", "cplane", "face", "originAxis", "sketchCurve", "edge"], planar: true, max: 1, prompt: "Select a plane or axis for the view direction", filter: (r, dlg) => (r.kind === "sketchCurve" ? U.sketchLineFilter(dlg.baseState)(r) : r.kind === "edge" ? U.isLinearEdge(dlg.baseState, r) : true), tooltip: "Set the view direction by selecting a plane or axis." },
      { id: "bodies", type: "selection", label: "Target Body", kinds: ["body", "face"], max: 1, mapRef: (r) => toBodyRef(r), prompt: "Select the body to split", tooltip: "Select the body to split along its silhouette." },
      { id: "operation", type: "dropdown", label: "Operation", options: [{ value: "faces", label: "Split Faces Only", icon: "faces" }, { value: "solid", label: "Split Solid Body", icon: "bodies" }, { value: "shelled", label: "Split Shelled Body", icon: "sharpShell" }], sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      const v = f0.view || {};
      Object.assign(dlg.values, {
        view: [v.plane ? U.refFromPlaneRef(v.plane, st) : v.axis ? U.refFromAxis(v.axis, st) : null].filter(Boolean),
        bodies: D.bodySelRefs(f0.bodies), operation: f0.operation || "faces",
      });
    },
    build(v) {
      const r = (v.view || [])[0];
      const body = (v.bodies || [])[0];
      if (!r || !body) return null;
      const pr = U.planeRefFromRef(r);
      return { type: "surfSilhouette", view: pr ? { plane: pr } : { axis: U.axisFromRef(r) }, bodies: [body.body], operation: v.operation };
    },
  });
}

// ------------------------------------------------------------------ Validate
export function openValidate(app, opts = {}) {
  const f0 = edit(app, opts);
  let cache = { key: "", text: "" };
  const report = (dlg) => {
    const v = dlg.values;
    const ids = [...new Set((v.bodies || []).map((r) => r.body))];
    const tol = dlg.num("gap");
    const key = JSON.stringify([ids, v.level, Number.isFinite(tol) ? tol : 0.01]);
    if (cache.key === key) return cache.text;
    if (!ids.length) { cache = { key, text: "" }; return ""; }
    let invalid = 0, inter = 0, open = 0, small = 0;
    for (const id of ids) {
      const b = dlg.baseState.bodies.get(id);
      if (!b) continue;
      try {
        const a = G.analyze(b.shape, { standard: v.level === "standard", tol: Number.isFinite(tol) && tol > 0 ? tol : 0.01 });
        invalid += a.invalidFaces.length + (a.valid ? 0 : a.invalidFaces.length ? 0 : 1);
        inter += a.intersecting.length;
        small += a.smallEdges;
        // a solid with open edges cannot have been stitched closed
        if (app.M.shapeKind(b.shape) === "solid" && a.freeEdges) open++;
      } catch (e) { invalid++; }
    }
    const lines = ["Validate Summary:"];
    if (!invalid && !inter && !open && !small) lines.push("No issues were found");
    else {
      lines.push(`Number of invalid surfaces: ${invalid}`);
      if (v.level === "standard") lines.push(`Number of intersecting or overlapping surfaces: ${inter}`);
      lines.push(`Number of surfaces that cause stitching failure: ${open}`);
      if (small) lines.push(`Number of edges removed: ${v.repair ? small : 0}`);
    }
    cache = { key, text: lines.join("\n") };
    return cache.text;
  };
  return app.ui.dialog.open({
    id: "FusionSurfaceValidateCommand", title: "Validate", icon: "FusionSurfaceValidateCommand", featureLabel: "Validate", editId: opts.editId || null,
    help: "Checks the quality of selected surfaces and attempts to heal surfaces before stitching into quilts and solids.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "body" || r.kind === "face").map(toBodyRef),
    noFeature: true,
    rows: [
      { id: "bodies", type: "selection", label: "Validate Bodies", kinds: ["body", "face"], mapRef: (r) => toBodyRef(r), prompt: "Select Bodies to validate" },
      { id: "level", type: "dropdown", label: "Checking Level", options: [{ value: "basic", label: "Basic", icon: "faces" }, { value: "standard", label: "Standard", icon: "bodies" }], tooltip: "Basic = Geometry checks, Standard = Basic + Face/Face and Edge/Edge intersecton tests." },
      { id: "repair", type: "check", label: "Repair", tooltip: "Heals the selected bodies when OK is pressed." },
      { id: "gap", type: "value", label: "Gap Healing", kind: "length", default: "0.01 mm", positive: true, visible: (v) => !!v.repair, tooltip: "Maximum gap size to heal." },
      { id: "summary", type: "text", label: "", text: (dlg) => report(dlg) },
    ],
    init(dlg) { if (f0) Object.assign(dlg.values, { bodies: D.bodySelRefs(f0.bodies), repair: true, gap: f0.gap ?? "0.01 mm" }); },
    build(v) {
      const bodies = [...new Set((v.bodies || []).map((r) => r.body))];
      if (!v.repair || !bodies.length) return null;
      return { type: "surfValidate", bodies, gap: v.gap };
    },
    commit(f, dlg) { return f ? dlg.commitFeature(f) : null; },
  });
}
