// INSPECT surface analyses: Zebra, Draft, Curvature Map, Curvature Comb, Isocurve, Environment Map,
// Accessibility, Minimum Radius. Each is a docked command dialog (Fusion's inputs, labels, order and defaults:
// install string table NaFusionUI10.xml + the Fusion API *AnalysisInput defaults) with a live preview; OK adds an
// item to the browser's Analysis folder (app.doc.analyses, undoable, saved with the design). Display: surfanalysis.js.
import { ANALYSIS_ENVIRONMENTS } from "./surfanalysis.js";
import { V, faceOf, edgeOf, fmtNum } from "./geom.js";
import { CanvasOverlay } from "./overlay.js";
import { ICONS, div, fwGlyph, esc } from "./ui.js";

const COMMANDS = {
  zebra: {
    id: "FusionZebraAnalysisCommand", title: "Zebra Analysis",
    tooltip: "Displays alternating black and white stripes on a body to help you analyze the curvature of a surface.",
    help: "Select bodies to analyze, then adjust the direction, repeats, and opacity of the zebra stripes.",
  },
  draft: {
    id: "FusionDraftAnalysisCommand", title: "Draft Analysis",
    tooltip: "Displays a color gradient on the faces of selected bodies to help evaluate the manufacturability of your design.",
    help: "Select the bodies to evaluate and the axis to define the direction. Use the options to refine the gradient display.",
  },
  curvatureMap: {
    id: "FusionCurvatureMapAnalysisCommand", title: "Curvature Map Analysis",
    tooltip: "Displays a color gradient on bodies to help you analyze areas of high and low surface curvature.",
    help: "Select bodies to analyze, then select a curvature map type and adjust the display settings of the curvature map.",
  },
  curvatureComb: {
    id: "FusionCurvatureCombAnalysisCommand", title: "Curvature Comb Analysis",
    tooltip: "Displays a comb with sample points along selected edges of a body to help you analyze the curvature of a surface.",
    help: "Select edges to analyze on a body, then adjust the density and scale of the curvature comb.",
  },
  isocurve: {
    id: "FusionIsoCurveAnalysisCommand", title: "Isocurve Analysis",
    tooltip: "Applies UV mapping and curvature combs to analyze the quality of a surface.",
    help: "Select bodies or faces to analyze, select the isocurve type, then adjust the number of isocurves to display. You can also display curvature combs and control their density and scale.",
  },
  environmentMap: {
    id: "FusionEnvironmentMapAnalysisCommand", title: "Environment Map Analysis",
    tooltip: "Applies environment map analysis to selected bodies.",
    help: "Select bodies, choose an environment, then adjust rotate, opacity, and quality options.",
  },
  accessibility: {
    id: "FusionAccessibilityAnalysisCommand", title: "Accessibility Analysis",
    tooltip: "Used to colorize an object based on whether or not certain parts of the object are accessible from a particular plane.",
    help: "Inaccessible areas are highlighted in red. Useful for checking undercut areas through a plane.",
  },
  minimumRadius: {
    id: "FusionMinimumRadiusAnalysisCommand", title: "Minimum Radius Analysis",
    tooltip: "Displays colors on the model that represent the minimum radius for the curvature of the concave faces.",
    help: "Detect the minimum fit for holes and fillets. Useful for determining tool sizes in machining.",
  },
};
export const ANALYSIS_COMMANDS = COMMANDS;

// ------------------------------------------------------------------ row helpers
function leaveSketch(app) {
  if (app.mode !== "sketch") return;
  const stop = app.commands.get("SketchStop");
  if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model");
}

/** A value row with Fusion's slider in front of the value box. */
function slider(id, label, { min, max, step = 1, def, tooltip, integer = true, kind = "none", fmt } = {}) {
  return {
    id, type: "value", kind, label, tooltip, default: def, min, max, integer: kind === "none" ? integer : false,
    extra(dlg, re) {
      const s = document.createElement("input");
      s.type = "range";
      s.className = "insp-slider";
      s.min = String(min); s.max = String(max); s.step = String(step);
      s.dataset.slider = id;
      s.tabIndex = -1;
      if (tooltip) s.title = tooltip;
      s.addEventListener("input", () => {
        const v = Number(s.value);
        dlg.set(id, fmt ? fmt(v) : kind === "angle" ? `${v.toFixed(1)} deg` : integer ? String(Math.round(v)) : String(v), { user: true });
      });
      const orig = re.update;
      re.update = (fromInput) => { orig(fromInput); const v = dlg.num(id); if (Number.isFinite(v) && document.activeElement !== s) s.value = String(v); };
      re.row.classList.add("insp-slider-row");
      return s;
    },
  };
}
const opacityRow = (tooltip) => slider("opacity", "Opacity", { min: 0, max: 100, def: "100", tooltip });
const hqRow = (tooltip) => ({ id: "highQuality", type: "check", label: "High Quality", tooltip, default: false });

/** "Draft Angle" / "Tolerance": [neg] ==dual slider== [pos] bound to two embedded angle rows. */
function rangeRow(rowId, label, negId, posId, min, max, tooltip, visible) {
  return {
    id: rowId, type: "custom", visible,
    render(dlg) {
      const row = div("insp-crow insp-range");
      row.dataset.range = rowId;
      row.innerHTML = `<div class="dlg-label" title="${esc(tooltip || label)}">${esc(label)}</div>`;
      const box = div("insp-range-ctl");
      const a = dlg.embedInput(negId, "dlg-input insp-range-in");
      const b = dlg.embedInput(posId, "dlg-input insp-range-in");
      const tr = div("insp-range-track");
      const mk = (id) => {
        const s = document.createElement("input");
        s.type = "range"; s.min = String(min); s.max = String(max); s.step = "0.1"; s.tabIndex = -1;
        s.className = "insp-dual"; s.dataset.slider = id;
        s.addEventListener("input", () => {
          let v = Number(s.value);
          const other = dlg.num(id === negId ? posId : negId);
          if (id === negId && Number.isFinite(other)) v = Math.min(v, other);
          if (id === posId && Number.isFinite(other)) v = Math.max(v, other);
          dlg.set(id, `${v.toFixed(1)} deg`, { user: true });
        });
        return s;
      };
      const sa = mk(negId), sb = mk(posId);
      tr.append(sa, sb);
      box.append(a, tr, b);
      row.appendChild(box);
      row._sync = () => {
        const x = dlg.num(negId), y = dlg.num(posId);
        if (Number.isFinite(x) && document.activeElement !== sa) sa.value = String(x);
        if (Number.isFinite(y) && document.activeElement !== sb) sb.value = String(y);
      };
      return row;
    },
    update(el) { if (el._sync) el._sync(); },
  };
}

/** Body ref list -> ids of live bodies. */
const bodyIds = (app, refs) => [...new Set((refs || []).map((r) => r.body).filter((id) => id && app.body(id)))];
const bodyRefs = (ids) => (ids || []).map((id) => ({ kind: "body", body: id }));
const prebodies = (app, ctx) => {
  const out = [];
  for (const r of ctx.preselect || app.selection.items || []) if (r && r.body && (r.kind === "body" || r.kind === "face" || r.kind === "edge")) out.push({ kind: "body", body: r.body });
  return out;
};

/** Accept planar / cylindrical / conical faces, linear edges and sketch lines as a direction. */
function directionFilter(app) {
  return (ref) => {
    if (ref.kind === "originPlane" || ref.kind === "originAxis" || ref.kind === "cplane") return true;
    if (ref.kind === "face") { const f = faceOf(app, ref); if (!f) return false; const t = f.geomType; return t === "PLANE" || t === "CYLINDRE" || t === "CONE"; }
    if (ref.kind === "edge") { const e = edgeOf(app, ref); return !!e && e.geomType === "LINE"; }
    if (ref.kind === "sketchCurve") { const st = app.sketchState(ref.sketch); const cv = st && st.sk.curves[ref.curve]; return !!cv && cv.type === "line"; }
    return false;
  };
}
const DIR_KINDS = ["face", "edge", "originPlane", "originAxis", "cplane", "sketchCurve"];
const cleanRef = (r) => {
  if (!r) return null;
  const o = { kind: r.kind };
  for (const k of ["body", "index", "p", "n", "planar", "name", "id", "sketch", "curve"]) if (r[k] !== undefined) o[k] = r[k];
  return o;
};

function flipButton(app, dlg, key = "flip") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "dlg-bg-btn insp-bg-btn insp-flip";
  b.dataset.input = key;
  b.title = "Flip Pull Direction";
  b.innerHTML = fwGlyph(app, "flip", ICONS.flip);
  b.addEventListener("click", () => dlg.set(key, !dlg.values[key], { user: true }));
  return b;
}

// ------------------------------------------------------------------ per-type specs
/** Each spec: rows(app, dlg-less), values(def) for editing, def(dlg) -> analysis definition | null, valid(dlg) -> error | null */
function specs(app, display) {
  return {
    zebra: {
      rows: [
        { id: "bodies", type: "selection", label: "Bodies", tooltip: "Select bodies to analyze.", kinds: ["body"], min: 1, prompt: "Select bodies to analyze" },
        { id: "direction", type: "dropdown", label: "Direction", default: "vertical", options: [{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }], tooltip: "Displays zebra stripes in a vertical direction." },
        slider("repeats", "Repeats", { min: 1, max: 100, def: "20", tooltip: "Specify number of zebra stripes to display on selected bodies." }),
        opacityRow("Specify transparency of zebra stripes displayed on selected bodies."),
        { id: "locked", type: "check", label: "Lock Stripes", tooltip: "Locks zebra stripes in place as they appear on selected bodies.", default: false },
        hqRow("Increases display quality of zebra stripes, but may impact performance."),
      ],
      values: (d) => ({ bodies: bodyRefs(d.bodies), direction: d.direction || "vertical", repeats: String(d.repeats ?? 20), opacity: String(d.opacity ?? 100), locked: !!d.locked, highQuality: !!d.highQuality, lockRot: d.lockRot || null }),
      def: (dlg) => ({ bodies: bodyIds(app, dlg.values.bodies), direction: dlg.values.direction, repeats: dlg.num("repeats"), opacity: dlg.num("opacity"), locked: !!dlg.values.locked, lockRot: dlg.values.locked ? dlg.values.lockRot || currentViewRot(app) : null, highQuality: !!dlg.values.highQuality }),
      onChange(id, dlg) { if (id === "locked") dlg.values.lockRot = dlg.values.locked ? currentViewRot(app) : null; },
      prompt: (dlg) => ((dlg.values.bodies || []).length ? "Adjust stripe settings or select more bodies" : "Select bodies to analyze"),
    },

    draft: {
      rows: [
        { id: "bodies", type: "selection", label: "Body", tooltip: "Add or remove BREP/T-Spline Bodies", kinds: ["body"], min: 1, prompt: "Select a solid body or T-Spline body to analyze" },
        {
          id: "direction", type: "selection", label: "Direction", tooltip: "Select a plane or face to define pull direction", kinds: DIR_KINDS, max: 1, filter: directionFilter(app), prompt: "Select pull direction",
          extra: (dlg) => flipButton(app, dlg),
        },
        { id: "angleNeg", type: "value", kind: "angle", embed: true, default: "-2.0 deg", min: -15, max: 15 },
        { id: "anglePos", type: "value", kind: "angle", embed: true, default: "2.0 deg", min: -15, max: 15 },
        rangeRow("angleRange", "Draft Angle", "angleNeg", "anglePos", -15, 15, "Specify draft angle"),
        { id: "toleranceZone", type: "check", label: "Tolerance Zone", tooltip: "Displays a tolerance gradient on the results.", default: true },
        { id: "tolNeg", type: "value", kind: "angle", embed: true, default: "-0.5 deg", min: -5, max: 5 },
        { id: "tolPos", type: "value", kind: "angle", embed: true, default: "0.5 deg", min: -5, max: 5 },
        rangeRow("tolRange", "Tolerance", "tolNeg", "tolPos", -5, 5, "Set the start and stop angles for the tolerance.", (v) => !!v.toleranceZone),
        opacityRow("Controls the transparency of the analysis applied to the bodies."),
        hqRow("Increases the display quality of the gradient, but may impact performance."),
      ],
      values: (d) => ({ bodies: bodyRefs(d.bodies), direction: d.direction ? [d.direction] : [], flip: !!d.flip, angleNeg: d.angleNeg ?? "-2.0 deg", anglePos: d.anglePos ?? "2.0 deg", toleranceZone: d.toleranceZone !== false, tolNeg: d.tolNeg ?? "-0.5 deg", tolPos: d.tolPos ?? "0.5 deg", opacity: String(d.opacity ?? 100), highQuality: !!d.highQuality }),
      def(dlg) {
        const r = (dlg.values.direction || [])[0];
        const dir = r ? display.directionOf(r) : null;
        return { bodies: bodyIds(app, dlg.values.bodies), direction: cleanRef(r), dir, flip: !!dlg.values.flip, angleNeg: dlg.values.angleNeg, anglePos: dlg.values.anglePos, toleranceZone: !!dlg.values.toleranceZone, tolNeg: dlg.values.tolNeg, tolPos: dlg.values.tolPos, opacity: dlg.num("opacity"), highQuality: !!dlg.values.highQuality };
      },
      valid(dlg) { return (dlg.values.direction || []).length ? null : "Select pull direction"; },
      arrow: true,
      prompt: (dlg) => (!(dlg.values.bodies || []).length ? "Select a solid body or T-Spline body to analyze" : !(dlg.values.direction || []).length ? "Select pull direction" : ""),
    },

    curvatureMap: {
      rows: [
        { id: "bodies", type: "selection", label: "Bodies", tooltip: "Select bodies to analyze.", kinds: ["body"], min: 1, prompt: "Select bodies to analyze" },
        {
          id: "mapType", type: "dropdown", label: "Type", default: "gaussian",
          options: [{ value: "gaussian", label: "Gaussian" }, { value: "principalMin", label: "Principal Minimum" }, { value: "principalMax", label: "Principal Maximum" }],
          tooltip: "Gaussian: Displays a gradient as the product of curvature in U and V directions.",
        },
        { id: "display", type: "dropdown", label: "Display", default: "smooth", visible: (v) => v.mapType === "gaussian", options: [{ value: "smooth", label: "Smooth" }, { value: "bands", label: "Bands" }], tooltip: "Smooth: Displays a smooth blend between colors. Bands: Displays distinct transitions between colors." },
        { ...slider("scale", "Scale", { min: 0.1, max: 10, step: 0.1, def: "1.0", integer: false, tooltip: "Specify scale of curvature map gradient.", fmt: (v) => v.toFixed(1) }), visible: (v) => v.mapType === "gaussian", positive: true },
        { id: "maxLimit", type: "value", kind: "length", label: "Maximum Limit", default: "100.00 mm", positive: true, visible: (v) => v.mapType === "principalMin", tooltip: "Specify maximum curvature value in current design units." },
        { id: "minLimit", type: "value", kind: "length", label: "Minimum Limit", default: "1.00 mm", positive: true, visible: (v) => v.mapType === "principalMax", tooltip: "Specify minimum curvature value in current design units." },
        opacityRow("Specify transparency of curvature map displayed on selected bodies."),
        hqRow("Increases display quality of curvature map, but may impact performance."),
      ],
      values: (d) => ({ bodies: bodyRefs(d.bodies), mapType: d.mapType || "gaussian", display: d.display || "smooth", scale: String(d.scale ?? "1.0"), maxLimit: d.maxLimit ?? "100.00 mm", minLimit: d.minLimit ?? "1.00 mm", opacity: String(d.opacity ?? 100), highQuality: !!d.highQuality }),
      def: (dlg) => ({ bodies: bodyIds(app, dlg.values.bodies), mapType: dlg.values.mapType, display: dlg.values.display, scale: Number.isFinite(dlg.num("scale")) ? dlg.num("scale") : 1, maxLimit: dlg.values.maxLimit, minLimit: dlg.values.minLimit, opacity: dlg.num("opacity"), highQuality: !!dlg.values.highQuality }),
      prompt: (dlg) => ((dlg.values.bodies || []).length ? "Adjust selection, curvature map type, or display settings" : "Select bodies to analyze"),
    },

    curvatureComb: {
      rows: [
        { id: "edges", type: "selection", label: "Edges", tooltip: "Select edges to analyze.", kinds: ["edge", "sketchCurve"], min: 1, prompt: "Select edges to analyze" },
        slider("density", "Density", { min: 2, max: 100, def: "50", tooltip: "Specify number of sample points to display on curvature combs." }),
        slider("scale", "Scale", { min: 0, max: 100, def: "10", tooltip: "Specify scale of curvature combs." }),
      ],
      values: (d) => ({ edges: (d.edges || []).map((r) => ({ ...r })), density: String(d.density ?? 50), scale: String(d.scale ?? 10) }),
      def: (dlg) => ({ edges: (dlg.values.edges || []).map(cleanRef), density: dlg.num("density"), scale: dlg.num("scale") }),
      preselectKinds: ["edge", "sketchCurve"],
      prompt: (dlg) => ((dlg.values.edges || []).length ? "Adjust comb density and scale or select more edges" : "Select edges to analyze"),
    },

    isocurve: {
      rows: [
        { id: "targets", type: "selection", label: "Bodies/Faces", tooltip: "Select bodies or faces to analyze.", kinds: ["body", "face"], min: 1, prompt: "Select bodies or faces" },
        { id: "uv", type: "dropdown", label: "Type", default: "both", options: [{ value: "both", label: "U and V" }, { value: "u", label: "U" }, { value: "v", label: "V" }], tooltip: "U and V: Displays isocurves in U and V directions." },
        slider("count", "Isocurves", { min: 1, max: 20, def: "5", tooltip: "Specify number of isocurves to display on selected bodies or faces." }),
        { id: "combs", type: "check", label: "Curvature Combs", tooltip: "Displays curvature combs on isocurves.", default: false },
        { ...slider("density", "Density", { min: 2, max: 100, def: "50", tooltip: "Specify number of teeth to display on curvature combs." }), visible: (v) => !!v.combs },
        { ...slider("scale", "Scale", { min: 0, max: 100, def: "10", tooltip: "Specify scale of curvature combs." }), visible: (v) => !!v.combs },
      ],
      values: (d) => ({ targets: (d.targets || []).map((r) => ({ ...r })), uv: d.uv || "both", count: String(d.count ?? 5), combs: !!d.combs, density: String(d.density ?? 50), scale: String(d.scale ?? 10) }),
      def: (dlg) => ({ targets: (dlg.values.targets || []).map(cleanRef), uv: dlg.values.uv, count: dlg.num("count"), combs: !!dlg.values.combs, density: Number.isFinite(dlg.num("density")) ? dlg.num("density") : 50, scale: Number.isFinite(dlg.num("scale")) ? dlg.num("scale") : 10 }),
      preselectKinds: ["body", "face"],
      prompt: (dlg) => ((dlg.values.targets || []).length ? "Adjust isocurve type and display settings" : "Select bodies or faces"),
    },

    environmentMap: {
      rows: [
        { id: "bodies", type: "selection", label: "Bodies", tooltip: "Select body", kinds: ["body"], min: 1, prompt: "Select body" },
        { id: "environment", type: "dropdown", label: "Environment", default: "photoBooth", options: ANALYSIS_ENVIRONMENTS.map(([value, label]) => ({ value, label })), tooltip: "Select an environment to reflect on the surfaces of the bodies." },
        slider("rotate", "Rotate", { min: -180, max: 180, step: 1, def: "0.0 deg", kind: "angle", tooltip: "Adjusts the rotation of the environment." }),
        { id: "mirror", type: "check", label: "Apply Mirror", tooltip: "Applies a mirror (chrome) finish so the environment reflects on the surfaces.", default: true },
        opacityRow("Specify transparency of the analysis displayed on selected bodies."),
        hqRow("Increases display quality of the analysis, but may impact performance."),
      ],
      values: (d) => ({ bodies: bodyRefs(d.bodies), environment: d.environment || "photoBooth", rotate: d.rotate ?? "0.0 deg", mirror: d.mirror !== false, opacity: String(d.opacity ?? 100), highQuality: !!d.highQuality }),
      def: (dlg) => ({ bodies: bodyIds(app, dlg.values.bodies), environment: dlg.values.environment, rotate: dlg.values.rotate, mirror: !!dlg.values.mirror, opacity: dlg.num("opacity"), highQuality: !!dlg.values.highQuality }),
      prompt: (dlg) => ((dlg.values.bodies || []).length ? "" : "Select body"),
    },

    accessibility: {
      rows: [
        { id: "bodies", type: "selection", label: "Body", tooltip: "Select bodies", kinds: ["body"], min: 1, prompt: "Select bodies" },
        { id: "direction", type: "selection", label: "Direction", tooltip: "Select a linear edge, plane, cylinder, cone or axis to indicate direction", kinds: DIR_KINDS, max: 1, filter: directionFilter(app), prompt: "Select a linear edge, plane, cylinder, cone or axis to indicate direction" },
        { id: "mode", type: "dropdown", label: "Change Direction", default: "one", options: [{ value: "one", label: "No Change in Direction" }, { value: "flip", label: "Flip Direction" }, { value: "both", label: "Both Directions" }] },
        opacityRow("Adjusts the transparency of the results."),
      ],
      values: (d) => ({ bodies: bodyRefs(d.bodies), direction: d.direction ? [d.direction] : [], mode: d.mode || "one", opacity: String(d.opacity ?? 100) }),
      def(dlg) {
        const r = (dlg.values.direction || [])[0];
        return { bodies: bodyIds(app, dlg.values.bodies), direction: cleanRef(r), dir: r ? display.directionOf(r) : null, mode: dlg.values.mode, opacity: dlg.num("opacity") };
      },
      valid(dlg) { return (dlg.values.direction || []).length ? null : "Select a linear edge, plane, cylinder, cone or axis to indicate direction"; },
      arrow: true,
      prompt: (dlg) => (!(dlg.values.bodies || []).length ? "Select bodies" : !(dlg.values.direction || []).length ? "Select a linear edge, plane, cylinder, cone or axis to indicate direction" : ""),
    },

    minimumRadius: {
      rows: [
        { id: "bodies", type: "selection", label: "Body", tooltip: "Add or remove BREP/T-Spline Bodies", kinds: ["body"], min: 1, prompt: "Select a body" },
        { id: "maxToolRadius", type: "value", kind: "length", label: "Maximum Tool Radius", default: "25.00 mm", positive: true, tooltip: "Sets the granularity of the minimum radius range." },
        { id: "minRadius", type: "value", kind: "length", label: "Minimum Radius", default: "0.00 mm", nonNegative: true, tooltip: "Regions with a smaller radius than this are highlighted." },
        { id: "optimal", type: "text", label: "Optimal Minimum Radius", text: (dlg) => optimalText(app, display, dlg), tooltip: "The tightest concave radius found on the selected bodies." },
        opacityRow("Adjusts the transparency of the analysis display."),
        { id: "sharpEdges", type: "check", label: "Sharp Edges", tooltip: "Highlights sharp, non-tangent concave edges of the analyzed bodies.", default: false },
      ],
      values: (d) => ({ bodies: bodyRefs(d.bodies), maxToolRadius: d.maxToolRadius ?? "25.00 mm", minRadius: d.minRadius ?? "0.00 mm", opacity: String(d.opacity ?? 100), sharpEdges: !!d.sharpEdges }),
      def: (dlg) => ({ bodies: bodyIds(app, dlg.values.bodies), maxToolRadius: dlg.values.maxToolRadius, minRadius: dlg.values.minRadius, opacity: dlg.num("opacity"), sharpEdges: !!dlg.values.sharpEdges }),
      valid(dlg) {
        const mx = dlg.num("maxToolRadius"), mn = dlg.num("minRadius");
        return Number.isFinite(mx) && Number.isFinite(mn) && mn > mx ? "Minimum Radius must not exceed the Maximum Tool Radius" : null;
      },
      prompt: (dlg) => ((dlg.values.bodies || []).length ? "" : "Select a body"),
    },
  };
}

function currentViewRot(app) {
  try {
    const cam = app.viewport.camera;
    cam.updateMatrixWorld(true);
    const e = cam.matrixWorldInverse.elements; // column-major 4x4
    return [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]];
  } catch { return null; }
}

/** Tightest concave radius of the selected bodies ("-" if there is none, like Fusion). */
export function optimalMinimumRadius(app, display, ids) {
  let best = Infinity;
  for (const id of ids || []) {
    const c = display && display.curvatureOf(id);
    if (c && c.minConcave < best) best = c.minConcave;
  }
  return best;
}
function optimalText(app, display, dlg) {
  const r = optimalMinimumRadius(app, display, bodyIds(app, dlg.values.bodies));
  return Number.isFinite(r) ? `${fmtNum(r, 2)} mm` : "-";
}

// ------------------------------------------------------------------ open
export function openAnalysis(app, store, type, ctx = {}) {
  if (!app.ui.dialog) return null;
  leaveSketch(app);
  const cmd = COMMANDS[type];
  const display = store.display;
  const S = specs(app, display)[type];
  if (!cmd || !S) return null;
  const editId = ctx.editId || null;
  const ed = editId ? store.get(editId) : null;
  let values = ed ? S.values(ed) : {};
  let pre = [];
  if (!ed) {
    if (S.preselectKinds) pre = (ctx.preselect || app.selection.items || []).filter((r) => S.preselectKinds.includes(r.kind));
    else pre = prebodies(app, ctx);
    values = { flip: false, lockRot: null };
  }
  const arrow = S.arrow ? new CanvasOverlay(app, "inspect-direction") : null;

  const defOf = (dlg) => {
    const d = S.def(dlg);
    if (!d) return null;
    return { type, name: ed ? ed.name : undefined, ...d };
  };
  const push = (dlg) => {
    let d = null;
    try { d = canShow(dlg) ? defOf(dlg) : null; } catch (e) { console.warn(e); d = null; }
    store.setPreviewAnalysis(d ? { ...d, id: null, visible: true } : null, editId);
    if (arrow) drawArrow(app, arrow, d);
    dlg.refresh();
  };
  const canShow = (dlg) => dlg._selectionsSatisfied() && dlg._inputsValid() && !(S.valid && S.valid(dlg));
  // Picked bodies are not painted with the solid selection highlight (it would hide the analysis being set up):
  // keep them out of app.selection (the dialog's own row still holds them).
  const unmirror = (dlg) => {
    const items = app.selection.items.filter((r) => r.kind !== "body");
    if (items.length === app.selection.items.length) return;
    dlg._syncing = true;
    try { app.selection.set(items); } finally { dlg._syncing = false; }
  };

  return app.ui.dialog.open({
    id: cmd.id,
    title: cmd.title,
    icon: cmd.id,
    help: cmd.help,
    preview: false,
    noFeature: true,
    preselect: pre,
    values,
    rows: S.rows,
    onOpen(dlg) {
      dlg.el.classList.add("insp-dlg", "insp-an", `insp-an-${type}`);
      dlg.el.dataset.analysis = type;
      if (ed) dlg.el.dataset.editAnalysis = editId;
      unmirror(dlg);
      push(dlg);
    },
    onChange(id, dlg) {
      if (S.onChange) { try { S.onChange(id, dlg); } catch (e) { console.warn(e); } }
      unmirror(dlg);
      clearTimeout(dlg._anT);
      // sliders drag continuously: coalesce into ~30 fps updates
      dlg._anT = setTimeout(() => { if (!dlg.closed) push(dlg); }, 30);
    },
    prompt: (dlg) => {
      if (dlg.active) {
        const d = dlg.defs[dlg.active];
        if (d && !(dlg.values[dlg.active] || []).length) return d.prompt || "";
      }
      return S.prompt ? S.prompt(dlg) : "";
    },
    validate: (dlg) => (S.valid ? S.valid(dlg) : null),
    afterPreview: (dlg) => unmirror(dlg),
    commit(_f, dlg) {
      const d = defOf(dlg);
      if (!d) return null;
      delete d.name;
      // an edited analysis is shown again (it was displayed while editing)
      return editId ? store.update(editId, { ...d, visible: true }, `Edit ${cmd.title}`) : store.add(d, cmd.title);
    },
    onClose() {
      store.setPreviewAnalysis(null, null);
      if (arrow) arrow.dispose();
    },
  });
}

/** Pull / access direction arrow at the top of the analysed bodies while the dialog is open. */
function drawArrow(app, ov, d) {
  ov.clear();
  if (!d || !d.dir) return;
  let box = null;
  for (const id of d.bodies || []) {
    const b = app.body(id);
    const bb = b && app.K.bboxOf(b.shape);
    if (bb) box = box ? { min: box.min.map((x, i) => Math.min(x, bb.min[i])), max: box.max.map((x, i) => Math.max(x, bb.max[i])) } : bb;
  }
  if (!box) return;
  let dir = V.norm(d.dir);
  if (d.flip || d.mode === "flip") dir = V.mul(dir, -1);
  const c = V.lerp(box.min, box.max, 0.5);
  const diag = V.len(V.sub(box.max, box.min));
  const half = Math.abs(dir[0]) * (box.max[0] - box.min[0]) / 2 + Math.abs(dir[1]) * (box.max[1] - box.min[1]) / 2 + Math.abs(dir[2]) * (box.max[2] - box.min[2]) / 2;
  const a = V.add(c, V.mul(dir, half + diag * 0.05));
  const b = V.add(a, V.mul(dir, diag * 0.35));
  const side = V.norm(Math.abs(dir[2]) > 0.9 ? V.cross(dir, [1, 0, 0]) : V.cross(dir, [0, 0, 1]));
  const h = diag * 0.06;
  const head = (tip, back) => [tip, V.add(V.add(tip, V.mul(back, h)), V.mul(side, h * 0.5)), tip, V.add(V.add(tip, V.mul(back, h)), V.mul(side, -h * 0.5))];
  const pts = [a, b, ...head(b, V.mul(dir, -1))];
  if (d.mode === "both") pts.push(...head(a, dir));
  ov.segments(pts, { color: 0x1f6fd6, width: 2.2 });
}
