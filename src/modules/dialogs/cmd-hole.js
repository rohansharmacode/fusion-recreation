// Hole (H): single hole on a face (positioned by reference edges), or holes at sketch points.
// Layout after Fusion 2706: Placement | Face | Reference | Reference | ▼ Shape Settings (Extents +
// flip, Hole Type, Hole Tap Type, Drill Point, diagram with editable callouts) | ▶ Objects To Cut.
import * as U from "./util.js";
import { g, holeDiagram } from "./glyphs.js";
import * as K from "../../kernel.js";

const V = U.V;
const CALLOUTS = ["depth", "diameter", "tipAngle", "cbD", "cbDepth", "csD", "csAngle"];

function holeCenters(dlg) {
  const v = dlg.values;
  if (v.placement === "multi") {
    const out = [];
    for (const r of v.points || []) {
      const s = dlg.baseState.sketches.get(r.sketch);
      const pt = s && s.sk.points[r.point];
      if (!pt) continue;
      out.push({ p: K.toWorld(s.plane, pt.x, pt.y), n: s.plane.n });
    }
    return out;
  }
  const f = (v.face || [])[0];
  return f ? [{ p: f.p, n: f.n }] : [];
}

function findFaceAt(state, p, n) {
  for (const b of state.bodies.values()) {
    try {
      const f = K.findFace(b.shape, p, n);
      if (f && K.R.measureDistanceBetween(f, K.R.makeVertex(p)) < 1e-3) return U.faceRef(state, b.id, p, n);
    } catch { /* ignore */ }
  }
  return null;
}

/** Offset geometry of the hole centre from a reference edge: in-plane unit m (edge -> centre), offset, foot point. */
function refGeom(dlg, row) {
  const r = (dlg.values[row] || [])[0];
  const face = (dlg.values.face || [])[0];
  if (!r || !face) return null;
  const ln = U.axisLine(r, dlg.baseState);
  if (!ln) return null;
  const n = V.norm(face.n);
  let e = V.sub(ln.d, V.mul(n, V.dot(ln.d, n)));
  if (V.len(e) < 1e-6) return null;
  e = V.norm(e);
  let m = V.norm(V.cross(n, e));
  const q = V.sub(ln.o, V.mul(n, V.dot(V.sub(ln.o, face.p), n)));
  let off = V.dot(V.sub(face.p, q), m);
  if (off < 0) { m = V.mul(m, -1); off = -off; }
  return { m, off, foot: V.add(face.p, V.mul(m, -off)) };
}

function syncOffsets(dlg) {
  for (const [row, field] of [["ref1", "off1"], ["ref2", "off2"]]) {
    const gm = refGeom(dlg, row);
    if (gm) dlg.values[field] = dlg.fmt(gm.off, "length");
  }
}

/** Move the hole centre so that it sits `field`'s value away from the reference edge of `row`. */
function applyOffset(dlg, row, field) {
  const gm = refGeom(dlg, row);
  const face = (dlg.values.face || [])[0];
  const want = dlg.num(field);
  if (!gm || !face || !Number.isFinite(want)) return;
  const p = V.add(face.p, V.mul(gm.m, want - gm.off));
  dlg.values.face = [{ ...face, p: p.map((x) => +x.toFixed(6)) }];
  const other = row === "ref1" ? ["ref2", "off2"] : ["ref1", "off1"];
  const go = refGeom(dlg, other[0]);
  if (go) { dlg.values[other[1]] = dlg.fmt(go.off, "length"); }
}

function moveCenter(dlg, p, final) {
  const face = (dlg.values.face || [])[0];
  if (!face) return;
  dlg.values.face = [{ ...face, p: p.map((x) => +x.toFixed(4)) }];
  syncOffsets(dlg);
  dlg.touched.add("face");
  if (final) dlg.previewNow();
  else dlg.schedulePreview(70, true);
}

function diagramRow() {
  return {
    id: "diagram", type: "custom",
    render(dlg) {
      const el = document.createElement("div");
      el.className = "dlg-hole-diagram";
      const art = document.createElement("div");
      art.className = "dlg-hole-art";
      el.appendChild(art);
      for (const f of CALLOUTS) { const inp = dlg.embedInput(f, "dlg-callout"); if (inp) el.appendChild(inp); }
      return el;
    },
    update(el, dlg) {
      const v = dlg.values;
      const key = `${v.holeType}|${v.drillPoint}|${v.extent}`;
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      const d = holeDiagram(v);
      el.querySelector(".dlg-hole-art").innerHTML = d.svg;
      el.style.height = `${d.height}px`;
      const pos = new Map(d.callouts.map((c) => [c.field, c]));
      for (const f of CALLOUTS) {
        const re = dlg.rowEls[f];
        if (!re || !re.input) continue;
        const c = pos.get(f);
        if (!c) continue;
        re.input.style.left = `${c.x}px`;
        re.input.style.top = `${c.y - 10}px`;
      }
    },
  };
}

function objectsRow() {
  return {
    id: "cutList", type: "custom",
    render(dlg) {
      const el = document.createElement("div");
      el.className = "dlg-cut-list";
      return el;
    },
    update(el, dlg) {
      const bodies = U.visibleBodies(dlg.app, dlg.baseState);
      const key = bodies.map((b) => b.id).join(",") + "|" + (dlg.values.cutBodies ? dlg.values.cutBodies.join(",") : "*");
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      el.innerHTML = "";
      if (!bodies.length) { el.innerHTML = `<div class="dlg-cut-empty">No bodies</div>`; return; }
      for (const b of bodies) {
        const row = document.createElement("label");
        row.className = "dlg-cut-row";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "dlg-check";
        cb.dataset.body = b.id;
        cb.checked = !dlg.values.cutBodies || dlg.values.cutBodies.includes(b.id);
        cb.addEventListener("change", () => {
          const all = U.visibleBodies(dlg.app, dlg.baseState).map((x) => x.id);
          const cur = new Set(dlg.values.cutBodies || all);
          if (cb.checked) cur.add(b.id); else cur.delete(b.id);
          const list = all.filter((id) => cur.has(id));
          dlg.set("cutBodies", list.length === all.length ? null : list, { user: true });
        });
        const name = document.createElement("span");
        const meta = dlg.app.bodyMeta ? dlg.app.bodyMeta(b.id) : null;
        name.textContent = (meta && meta.name) || b.id;
        row.append(cb, name);
        el.appendChild(row);
      }
    },
  };
}

export function openHole(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const pre = opts.preselect || [];
  const flipBtn = (dlg) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dlg-hbtn dlg-flip";
    b.title = "Flip";
    b.dataset.input = "flip";
    b.innerHTML = g("flipDir");
    b.addEventListener("click", () => { dlg.set("flip", !dlg.values.flip, { user: true }); b.classList.toggle("on", !!dlg.values.flip); });
    return b;
  };
  return app.ui.dialog.open({
    id: "FusionHoleCommand",
    title: "Hole",
    icon: "FusionHoleCommand",
    editId,
    help: "Creates a hole based on user-specified values and selections.",
    labelWidth: 90,
    ctrlWidth: 221,
    preselect: pre,
    values: { flip: false, cutBodies: null },
    toolPreview: "xray",
    rows: [
      { id: "placement", type: "buttons", label: "Placement", options: [{ value: "single", label: "At Point (Single Hole)", icon: "placeSingle" }, { value: "multi", label: "From Sketch (Multiple Holes)", icon: "placeMulti" }], default: pre.some((r) => r.kind === "sketchPoint") ? "multi" : "single" },
      {
        id: "face", type: "selection", label: "Face", kinds: ["face", "edge"], planar: true, max: 1, toggle: false, advance: false,
        prompt: "Select a face to place the hole", visible: (v) => v.placement !== "multi",
        // once the face is placed, edges clicked on the canvas become the position references
        filter: (r, dlg) => r.kind !== "edge" || ((dlg.values.face || []).length > 0 && U.isLinearEdge(dlg.baseState, r)),
        mapRef: (r, dlg) => {
          if (r.kind !== "edge") return r;
          const row = !(dlg.values.ref1 || []).length ? "ref1" : !(dlg.values.ref2 || []).length ? "ref2" : "ref1";
          if ((dlg.values.face || []).length) setTimeout(() => { if (!dlg.closed) dlg.pickRef(row, r); }, 0);
          return null;
        },
      },
      { id: "points", type: "selection", label: "Points", kinds: ["sketchPoint"], prompt: "Select sketch points to place holes", visible: (v) => v.placement === "multi", filter: (r, dlg) => { const s = dlg.baseState.sketches.get(r.sketch); const p = s && s.sk.points[r.point]; return !!p && !p.origin; } },
      { id: "ref1", type: "selection", label: "Reference", kinds: ["edge"], min: 0, max: 1, advance: false, prompt: "Select linear or circular reference edges to fully define hole location", visible: (v) => v.placement !== "multi", filter: (r, dlg) => U.isLinearEdge(dlg.baseState, r) },
      { id: "ref2", type: "selection", label: "Reference", kinds: ["edge"], min: 0, max: 1, advance: false, prompt: "Select linear or circular reference edges to fully define hole location", visible: (v) => v.placement !== "multi", filter: (r, dlg) => U.isLinearEdge(dlg.baseState, r) && !(dlg.values.ref1 || []).some((x) => x.index === r.index && x.body === r.body) },
      { id: "off1", type: "value", embed: true, label: "Offset", kind: "length", default: "0.00 mm", nonNegative: true, visible: (v) => (v.ref1 || []).length > 0 && v.placement !== "multi" },
      { id: "off2", type: "value", embed: true, label: "Offset", kind: "length", default: "0.00 mm", nonNegative: true, visible: (v) => (v.ref2 || []).length > 0 && v.placement !== "multi" },
      {
        id: "shape", type: "group", label: "Shape Settings", labelWidth: 162, labelClip: 58, ctrlWidth: 149,
        rows: [
          { id: "extent", type: "dropdown", label: "Extents", options: [{ value: "distance", label: "Distance", icon: "distance" }, { value: "to", label: "To", icon: "toObject", disabled: true }, { value: "all", label: "All", icon: "all" }], extra: flipBtn, noCaret: true, space: 4 },
          { id: "holeType", type: "buttons", label: "Hole Type", space: 9, options: [{ value: "simple", label: "Simple", icon: "holeSimple" }, { value: "counterbore", label: "Counterbore", icon: "holeCounterbore" }, { value: "countersink", label: "Countersink", icon: "holeCountersink" }] },
          { id: "tapType", type: "buttons", label: "Hole Tap Type", options: [{ value: "simple", label: "Simple", icon: "tapSimple" }, { value: "clearance", label: "Clearance", icon: "tapClearance", disabled: true }, { value: "tapped", label: "Tapped", icon: "tapTapped", disabled: true }, { value: "taper", label: "Taper Tapped", icon: "tapTaper", disabled: true }] },
          { id: "drillPoint", type: "buttons", label: "Drill Point", options: [{ value: "flat", label: "Flat", icon: "drillFlat" }, { value: "angle", label: "Angle", icon: "drillAngle" }], default: "angle" },
          { id: "depth", type: "value", embed: true, label: "Depth", kind: "length", default: "10.00 mm", positive: true, visible: (v) => v.extent !== "all" },
          { id: "diameter", type: "value", embed: true, label: "Diameter", kind: "length", default: "10.00 mm", positive: true },
          { id: "tipAngle", type: "value", embed: true, label: "Tip Angle", kind: "angle", default: "118.0 deg", positive: true, visible: (v) => v.drillPoint === "angle" },
          { id: "cbD", type: "value", embed: true, label: "Counterbore Diameter", kind: "length", default: "16.00 mm", positive: true, visible: (v) => v.holeType === "counterbore" },
          { id: "cbDepth", type: "value", embed: true, label: "Counterbore Depth", kind: "length", default: "5.00 mm", positive: true, visible: (v) => v.holeType === "counterbore" },
          { id: "csD", type: "value", embed: true, label: "Countersink Diameter", kind: "length", default: "18.00 mm", positive: true, visible: (v) => v.holeType === "countersink" },
          { id: "csAngle", type: "value", embed: true, label: "Countersink Angle", kind: "angle", default: "90.0 deg", positive: true, visible: (v) => v.holeType === "countersink" },
          diagramRow(),
        ],
      },
      { id: "objects", type: "group", label: "Objects To Cut", collapsed: true, rows: [objectsRow()] },
    ],
    init(dlg) {
      if (!f0) return;
      const st = dlg.baseState;
      const v = dlg.values;
      v.placement = f0.placement === "points" ? "multi" : "single";
      if (f0.placement === "points") v.points = (f0.sketchPoints || []).map((sp) => ({ kind: "sketchPoint", sketch: sp.sketch, point: sp.point }));
      else {
        const fr = f0.faceRef;
        const p = (f0.points || [])[0];
        let r = fr ? U.faceRef(st, fr.body, fr.p, fr.n) : p ? findFaceAt(st, p, f0.normal || [0, 0, 1]) : null;
        if (r && p) r = { ...r, p: [...p] };
        v.face = r ? [r] : [];
        const refs = (f0.refEdges || []).map((e) => U.edgeRef(st, e.body, e.p)).filter((e) => e.index >= 0);
        v.ref1 = refs[0] ? [refs[0]] : [];
        v.ref2 = refs[1] ? [refs[1]] : [];
      }
      for (const k of ["extent", "holeType", "drillPoint"]) if (f0[k]) v[k] = f0[k];
      for (const k of CALLOUTS) if (f0[k] !== undefined && f0[k] !== "") v[k] = f0[k];
      v.flip = !!f0.flip;
      v.cutBodies = f0.bodies && f0.bodies.length ? [...f0.bodies] : null;
      syncOffsets(dlg);
    },
    onChange(id, dlg) {
      if (id === "ref1" || id === "ref2" || id === "face") syncOffsets(dlg);
      if (id === "off1") applyOffset(dlg, "ref1", "off1");
      if (id === "off2") applyOffset(dlg, "ref2", "off2");
      if (id === "flip") { const b = dlg.el && dlg.el.querySelector(".dlg-flip"); if (b) b.classList.toggle("on", !!dlg.values.flip); }
    },
    prompt(dlg) {
      const v = dlg.values;
      if (v.placement === "multi") return (v.points || []).length ? "" : "Select sketch points to place holes";
      if (!(v.face || []).length) return "Select a face to place the hole";
      if (dlg.manips.drag) return "";
      return !(v.ref1 || []).length || !(v.ref2 || []).length ? "Select linear or circular reference edges to fully define hole location" : "";
    },
    build(v) {
      const f = {
        type: "hole",
        placement: v.placement === "multi" ? "points" : "face",
        holeType: v.holeType,
        drillPoint: v.drillPoint,
        extent: v.extent === "all" ? "all" : "distance",
        diameter: v.diameter,
        depth: v.depth,
        operation: "cut",
        flip: !!v.flip,
      };
      if (v.drillPoint === "angle") f.tipAngle = v.tipAngle;
      if (v.holeType === "counterbore") { f.cbD = v.cbD; f.cbDepth = v.cbDepth; }
      if (v.holeType === "countersink") { f.csD = v.csD; f.csAngle = v.csAngle; }
      if (v.cutBodies && v.cutBodies.length) f.bodies = [...v.cutBodies];
      if (f.placement === "points") {
        if (!(v.points || []).length) return null;
        f.sketchPoints = v.points.map((r) => ({ sketch: r.sketch, point: r.point }));
      } else {
        const r = (v.face || [])[0];
        if (!r) return null;
        f.points = [r.p];
        f.normal = r.n;
        f.faceRef = { body: r.body, p: r.p, n: r.n };
        const refs = [...(v.ref1 || []), ...(v.ref2 || [])].map((e) => ({ body: e.body, p: e.p }));
        if (refs.length) f.refEdges = refs;
      }
      return f;
    },
    manipulators(dlg) {
      const c = holeCenters(dlg)[0];
      if (!c) return [];
      const out = [];
      if (dlg.values.extent !== "all") {
        const dir = V.mul(c.n, dlg.values.flip ? 1 : -1);
        // Fusion shows the depth arrow but no on-canvas value box while a face-placed hole still
        // waits for its reference edges (only the cursor prompt is shown); the box appears once the
        // location is fully defined. A distinct id makes the manipulator re-create with its box then.
        const v = dlg.values;
        const pending = v.placement !== "multi" && (!(v.ref1 || []).length || !(v.ref2 || []).length);
        const m = dlg.valueManip("depth", { origin: c.p, dir, min: 0.01, fixedDir: true, id: pending ? "depth-pending" : "depth" });
        if (m && pending) m.box = false;
        out.push(m);
      }
      for (const [row, field] of [["ref1", "off1"], ["ref2", "off2"]]) {
        const gm = refGeom(dlg, row);
        if (gm) out.push(dlg.valueManip(field, { origin: gm.foot, dir: gm.m, min: 0, fixedDir: true, hudAnchor: c.p }));
      }
      // the hole centre can be dragged on its face (Fusion's blue point handle)
      if (dlg.values.placement !== "multi") {
        out.push({ id: "center", type: "point", point: c.p, normal: c.n, value: 0, box: false, onMove: (p, final) => moveCenter(dlg, p, final) });
      }
      return out.filter(Boolean);
    },
  });
}
