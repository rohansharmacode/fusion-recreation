// FORM > MODIFY > Edit Form (translate / rotate / scale T-spline vertices, edges, faces or bodies with a triad;
// Alt-drag extrudes faces and boundary edges) and Edit By Curve (driving curve over an edge chain).
import * as U from "../dialogs/util.js";
import { openFormDialog, tsRow, cageOf, clone, byBody } from "./common.js";
import { V, topo, refVerts, symmetrize, frozenSet, growRefs, shrinkRefs, edgeLoop, edgeRing, eRef, fRef, vRef, vertexNormal, tidy, chains, isTsRef } from "./cage.js";
import { extrudeFaces, extrudeEdges, fitToTargets } from "./ops.js";
import { setDisplay, displayOf, loopRefs } from "./env.js";

const AXIS_COL = [0xd8372c, 0x45a72c, 0x2d6fd6];
const T_FIELDS = ["tx", "ty", "tz"], R_FIELDS = ["rx", "ry", "rz"];
const FILTERS = [{ value: "all", label: "All" }, { value: "vertex", label: "Vertex" }, { value: "edge", label: "Edge" }, { value: "face", label: "Face" }, { value: "body", label: "Body" }];
const DISPLAY = [{ value: "box", label: "Box Display" }, { value: "frame", label: "Control Frame Display" }, { value: "smooth", label: "Smooth Display" }];

function rotAxis(v, k, deg) {
  const a = (deg * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  return V.add(V.add(V.mul(v, cs), V.mul(V.cross(k, v), sn)), V.mul(k, V.dot(k, v) * (1 - cs)));
}

export function openEditForm(app, opts = {}) {
  const pre = (opts.preselect || app.selection.items || []).filter((r) => isTsRef(r) || r.kind === "body");
  let altDown = false;
  const onDown = (ev) => { altDown = !!ev.altKey; };
  window.addEventListener("pointerdown", onDown, true);
  let offDbl = null;
  const dlg = openFormDialog(app, {
    id: "TSplineEditCommand", title: "Edit Form", featureLabel: "Edit Form",
    help: "Manipulates faces, edges and vertices with transform, scale and rotate editing. Alt-drag to extrude faces or boundary edges; double-click an edge or face to select a loop.",
    preselect: pre,
    labelWidth: 118,
    rows: [
      tsRow(app, "sel", "T-Spline Entity", ["tsVertex", "tsEdge", "tsFace", "body"], {
        noMap: true, advance: false, prompt: "Select vertex, edge or face. Alt Key to extrude",
        filter: (r, d) => { const f = d.values.filter; return f === "all" ? r.kind !== "body" : f === "body" ? r.kind === "body" : r.kind === { vertex: "tsVertex", edge: "tsEdge", face: "tsFace" }[f]; },
      }),
      { id: "mode", type: "buttons", label: "Transform Mode", options: [{ value: "multi", label: "Multi", icon: "freeMove" }, { value: "translate", label: "Translation", icon: "translate" }, { value: "rotate", label: "Rotation", icon: "rotate" }, { value: "scale", label: "Scale", icon: "scaleUniform" }], default: "multi" },
      { id: "space", type: "dropdown", label: "Coordinate Space", options: [{ value: "world", label: "World Space" }, { value: "view", label: "View Space" }, { value: "local", label: "Local Per Entity" }], default: "world" },
      { id: "filter", type: "dropdown", label: "Selection Filter", options: FILTERS, default: "all" },
      { id: "selOpts", type: "group", label: "Selection Options", collapsed: true, rows: [
        { id: "selButtons", type: "custom", label: "", render: (d) => selButtons(app, d) },
      ] },
      { id: "softGroup", type: "group", label: "Soft Modification", collapsed: true, rows: [
        { id: "soft", type: "check", label: "Soft Modification", default: false },
        { id: "softDist", type: "value", label: "Distance", kind: "length", default: "10.00 mm", positive: true, visible: (v) => !!v.soft },
        { id: "falloff", type: "dropdown", label: "Falloff", options: [{ value: "smooth", label: "Smooth" }, { value: "linear", label: "Linear" }, { value: "bulge", label: "Bulge" }], default: "smooth", visible: (v) => !!v.soft },
      ] },
      { id: "numGroup", type: "group", label: "Numerical Inputs", collapsed: true, rows: [
        { id: "tx", type: "value", label: "X Distance", kind: "length", default: "0.00 mm" },
        { id: "ty", type: "value", label: "Y Distance", kind: "length", default: "0.00 mm" },
        { id: "tz", type: "value", label: "Z Distance", kind: "length", default: "0.00 mm" },
        { id: "rx", type: "value", label: "X Angle", kind: "angle", default: "0.0 deg" },
        { id: "ry", type: "value", label: "Y Angle", kind: "angle", default: "0.0 deg" },
        { id: "rz", type: "value", label: "Z Angle", kind: "angle", default: "0.0 deg" },
        { id: "sc", type: "value", label: "Scale", kind: "none", default: "1", positive: true },
      ] },
      { id: "display", type: "dropdown", label: "Display Mode", options: DISPLAY, default: "smooth", sep: true },
    ],
    init(d) {
      d.work = new Map();
      const first = pre.find((r) => r.body);
      if (first) d.values.display = displayOf(first.body);
    },
    onOpen(d) {
      offDbl = app.input.push({
        name: "form-edit-dbl",
        onDoubleClick(ev, ctx) {
          const h = app.viewport.pick(ctx.x, ctx.y, { filter: app.selection.accepts });
          if (!h || !isTsRef(h.ref) || h.ref.kind === "tsVertex") return false;
          const loop = loopRefs(app, h.ref, h.point);
          const cur = d.values.sel || [];
          const key = (r) => JSON.stringify(r);
          const m = new Map([...cur, ...loop].map((r) => [key(r), r]));
          d.setSelection("sel", [...m.values()], { user: true });
          return true;
        },
      });
    },
    onChange(id, d) {
      if (id === "sel") bake(d);
      if (id === "display") {
        const ids = [...new Set((d.values.sel || []).map((r) => r.body))];
        setDisplay(app, d.values.display, ids.length ? ids : null);
      }
      if (id === "filter") d.setSelection("sel", (d.values.sel || []).filter((r) => d.defs.sel.filter(r, d)));
    },
    onClose() {
      window.removeEventListener("pointerdown", onDown, true);
      if (offDbl) offDbl();
    },
    compute(v, d) {
      const set = new Map();
      for (const [id, c] of d.work) set.set(id, c);
      const sel = v.sel || [];
      if (sel.length) {
        const tf = transformOf(d);
        if (tf) for (const [id, rs] of byBody(sel)) {
          const base = d.work.get(id) || cageOf(app, id);
          if (!base) continue;
          set.set(id, applyTransform(base, rs, tf, d));
        }
      }
      return set.size ? { set } : null;
    },
    manipulators(d) { return triad(app, d, () => altDown); },
    validate(d) { return d.work.size || (d.values.sel || []).length ? null : "Select T-Spline geometry"; },
  });
  return dlg;
}

/** Current transform: {pivot, axes, t, r, s} or null when identity. */
function transformOf(d) {
  const t = T_FIELDS.map((k) => d.num(k) || 0), r = R_FIELDS.map((k) => d.num(k) || 0);
  const s = Number.isFinite(d.num("sc")) && d.num("sc") > 0 ? d.num("sc") : 1;
  if (t.every((x) => Math.abs(x) < 1e-12) && r.every((x) => Math.abs(x) < 1e-12) && Math.abs(s - 1) < 1e-12) return null;
  const fr = frameOf(d);
  if (!fr) return null;
  return { ...fr, t, r, s };
}
function selCages(d) {
  const out = [];
  for (const [id, rs] of byBody(d.values.sel || [])) { const c = d.work.get(id) || cageOf(d.app, id); if (c) out.push({ id, c, rs }); }
  return out;
}
/** Pivot (selection centre) and axes of the coordinate space. */
function frameOf(d) {
  const pts = [];
  let n = [0, 0, 0];
  for (const { c, rs } of selCages(d)) {
    const vs = refVerts(c, rs);
    for (const v of vs) { pts.push(c.v[v]); n = V.add(n, vertexNormal(c, v)); }
  }
  if (!pts.length) return null;
  const pivot = V.avg(pts);
  let axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  if (d.values.space === "view" && d.app.viewport) {
    const cam = d.app.viewport.camera;
    const fwd = cam.getWorldDirection(new cam.position.constructor()).toArray();
    const up = cam.up.toArray();
    const x = V.norm(V.cross(fwd, up)), y = V.norm(V.cross(x, fwd));
    axes = [x, y, V.mul(fwd, -1)];
  } else if (d.values.space === "local" && V.len(n) > 1e-9) {
    const z = V.norm(n);
    const x = V.norm(V.cross(Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], z));
    axes = [x, V.norm(V.cross(z, x)), z];
  }
  return { pivot, axes };
}
function weightFn(d, base, sel) {
  if (!d.values.soft) return null;
  const R = d.num("softDist");
  if (!(R > 0)) return null;
  const pts = [...sel].map((v) => base.v[v]);
  const fall = d.values.falloff;
  return (p) => {
    let m = Infinity;
    for (const q of pts) m = Math.min(m, V.dist(p, q));
    if (m >= R) return 0;
    const x = 1 - m / R;
    return fall === "linear" ? x : fall === "bulge" ? Math.sqrt(x) : x * x * (3 - 2 * x);
  };
}
function applyTransform(base, rs, tf, d) {
  const sel = refVerts(base, rs);
  const fz = frozenSet(base);
  const P = base.v.map((p) => p.slice());
  const xf = (p, w = 1) => {
    let q = V.sub(p, tf.pivot);
    q = V.mul(q, 1 + (tf.s - 1) * w);
    tf.axes.forEach((ax, i) => { if (tf.r[i]) q = rotAxis(q, ax, tf.r[i] * w); });
    q = V.add(q, tf.pivot);
    tf.axes.forEach((ax, i) => { q = V.add(q, V.mul(ax, tf.t[i] * w)); });
    return q;
  };
  const moved = new Set();
  for (const v of sel) { if (fz.has(v)) continue; P[v] = xf(base.v[v]); moved.add(v); }
  const wf = weightFn(d, base, sel);
  if (wf) base.v.forEach((p, i) => { if (sel.has(i) || fz.has(i)) return; const w = wf(p); if (w > 0) { P[i] = xf(p, w); moved.add(i); } });
  const Q = symmetrize(base, P, moved);
  return tidy({ ...clone(base), v: Q });
}
/** Fold the current transform into the working cages and reset the numbers. */
function bake(d) {
  const tf = transformOf(d);
  if (tf) {
    for (const [id, rs] of byBody(d.values.sel || [])) {
      const base = d.work.get(id) || cageOf(d.app, id);
      if (base) d.work.set(id, applyTransform(base, rs, tf, d));
    }
  }
  for (const k of [...T_FIELDS, ...R_FIELDS]) d.values[k] = k[0] === "t" ? "0.00 mm" : "0.0 deg";
  d.values.sc = "1";
  for (const k of [...T_FIELDS, ...R_FIELDS, "sc"]) { const re = d.rowEls && d.rowEls[k]; if (re) re.update(); }
}
/** Alt-drag: extrude the selected faces / boundary edges, select the copies. */
function extrudeSelection(d) {
  const next = [];
  let any = false;
  for (const [id, rs] of byBody(d.values.sel || [])) {
    let c = d.work.get(id) || cageOf(d.app, id);
    const faces = rs.filter((r) => r.kind === "tsFace").map((r) => r.f);
    const t = topo(c);
    const edges = rs.filter((r) => r.kind === "tsEdge" && t.eFaces[t.edge(r.a, r.b)] && t.eFaces[t.edge(r.a, r.b)].length === 1);
    try {
      if (faces.length) { const r = extrudeFaces(c, faces); c = r.cage; next.push(...r.faces.map((f) => fRef(id, f))); any = true; }
      else if (edges.length) { const r = extrudeEdges(c, edges); c = r.cage; next.push(...r.edges.map(([a, b]) => eRef(id, a, b))); any = true; }
      else next.push(...rs);
    } catch (e) { d.message(e.message, "warning"); next.push(...rs); }
    d.work.set(id, c);
  }
  if (any) { d.values.sel = next; const re = d.rowEls && d.rowEls.sel; if (re) re.update(); }
}

function triad(app, d, alt) {
  const fr = frameOf(d);
  if (!fr) return [];
  const v = d.values;
  const t = T_FIELDS.map((k) => d.num(k) || 0);
  let c = fr.pivot;
  fr.axes.forEach((ax, i) => { c = V.add(c, V.mul(ax, t[i])); });
  const vp = app.viewport;
  const out = [];
  // every drag starts from the baked state: the numbers show this drag
  const begin = (key, v0 = 0) => {
    if (d._drag) return;
    d._drag = key;
    d._dragV0 = v0;
    bake(d);
    if (alt()) extrudeSelection(d);
  };
  const end = (final) => { if (final) d._drag = null; };
  if (v.mode === "multi" || v.mode === "translate") {
    T_FIELDS.forEach((k, i) => {
      const m = d.valueManip(k, { origin: c, dir: fr.axes[i], fixedDir: true });
      if (!m) return;
      m.origin = V.sub(c, V.mul(fr.axes[i], m.value));
      Object.assign(m, { look: "axis", color: AXIS_COL[i], len: 110, gap: 11, id: `t${i}` });
      const od = m.onDrag;
      m.onDrag = (val, final) => { begin(k, m.value); const r = od(val - d._dragV0, final); end(final); return r; };
      out.push(m);
    });
    const planeDrag = (fields) => ({
      onDelta: (dv, final) => {
        begin(fields.join());
        const step = U.niceStep(2 * ((vp && vp.pixelSize && vp.pixelSize(c)) || 0.1));
        fields.forEach((k) => {
          const ax = fr.axes[T_FIELDS.indexOf(k)];
          const val = Math.round(V.dot(dv, ax) / step) * step;
          d.set(k, U.fmt(+val.toFixed(6), "length"), { user: true, delay: final ? 0 : 40, throttle: !final });
        });
        if (final) d.previewNow();
        end(final);
      },
    });
    const planes = [["pxy", 0, 1, 2], ["pyz", 1, 2, 0], ["pxz", 0, 2, 1]];
    for (const [id, a, b, nrm] of planes) out.push({ id, type: "plane", value: 0, center: c, a: fr.axes[a], b: fr.axes[b], offPx: 32, color: AXIS_COL[nrm], box: false, ...planeDrag([T_FIELDS[a], T_FIELDS[b]]) });
    out.push({ id: "free", type: "plane", look: "ball", value: 0, center: c, box: false, ...planeDrag(T_FIELDS) });
  }
  if (v.mode === "multi" || v.mode === "rotate") {
    const refs = [fr.axes[1], fr.axes[2], fr.axes[0]];
    R_FIELDS.forEach((k, i) => {
      const m = d.angleManip(k, { center: c, axis: fr.axes[i], ref: refs[i], radius: 1, min: -360, max: 360 });
      if (!m) return;
      Object.assign(m, { screenRadius: 80, span: 22, gripAt: 45, color: AXIS_COL[i], lineWidth: 2.4, id: `r${i}` });
      const od = m.onDrag;
      m.onDrag = (val, final) => { begin(k, m.value); const r = od(val - d._dragV0, final); end(final); return r; };
      out.push(m);
    });
  }
  if (v.mode === "multi" || v.mode === "scale") {
    // uniform scale handle: drag along the diagonal of the first two axes
    const diag = V.norm(V.add(fr.axes[0], fr.axes[1]));
    const L = 60 * ((vp && vp.pixelSize && vp.pixelSize(c)) || 0.1);
    const s = Number.isFinite(d.num("sc")) ? d.num("sc") : 1;
    out.push({
      id: "scale", type: "distance", origin: c, dir: diag, value: (s - 1) * L, scale: 1, fixedDir: true, look: "axis", color: 0x8a8f96, len: 70, gap: 11,
      text: d.values.sc, kind: "none",
      onDrag: (val, final) => {
        begin("sc", (s - 1) * L);
        const k = Math.max(0.01, 1 + (val - d._dragV0) / L);
        const txt = String(+k.toFixed(4));
        d.set("sc", txt, { user: true, delay: final ? 0 : 40, throttle: !final });
        if (final) d.previewNow();
        end(final);
        return txt;
      },
      onText: (str, final) => d.set("sc", str, { user: true, delay: final ? 0 : 250 }),
    });
  }
  return out;
}

// ---------------------------------------------------------------- selection option buttons
function selButtons(app, d) {
  const el = document.createElement("div");
  el.className = "frm-selbtns";
  const act = (name, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "frm-btn";
    b.textContent = name;
    b.dataset.selop = name.toLowerCase().replace(/\s+/g, "-");
    b.addEventListener("click", () => {
      const cur = d.values.sel || [];
      const out = [];
      for (const [id, rs] of byBody(cur)) { const c = d.work.get(id) || cageOf(app, id); if (c) out.push(...fn(c, rs, id)); }
      d.setSelection("sel", out, { user: true });
    });
    el.appendChild(b);
  };
  act("Grow", (c, rs) => growRefs(c, rs));
  act("Shrink", (c, rs) => shrinkRefs(c, rs));
  act("Loop", (c, rs, id) => {
    const t = topo(c);
    const m = new Map();
    for (const r of rs) {
      if (r.kind !== "tsEdge") { m.set(JSON.stringify(r), r); continue; }
      for (const e of edgeLoop(c, t.edge(r.a, r.b))) { const x = eRef(id, ...t.edges[e]); m.set(JSON.stringify(x), x); }
    }
    return [...m.values()];
  });
  act("Ring", (c, rs, id) => {
    const t = topo(c);
    const m = new Map();
    for (const r of rs) {
      if (r.kind !== "tsEdge") { m.set(JSON.stringify(r), r); continue; }
      for (const e of edgeRing(c, t.edge(r.a, r.b))) { const x = eRef(id, ...t.edges[e]); m.set(JSON.stringify(x), x); }
    }
    return [...m.values()];
  });
  act("Invert", (c, rs, id) => {
    const kind = rs[0].kind;
    const have = new Set(rs.map((r) => JSON.stringify(r)));
    const t = topo(c);
    const all = kind === "tsVertex" ? c.v.map((_, i) => vRef(id, i)) : kind === "tsEdge" ? t.edges.map(([a, b]) => eRef(id, a, b)) : c.f.map((_, i) => fRef(id, i));
    return all.filter((r) => !have.has(JSON.stringify(r)));
  });
  return el;
}

// ---------------------------------------------------------------- Edit By Curve
function bezier(C, t) {
  const n = C.length - 1;
  const B = C.map((p) => p.slice());
  for (let k = 1; k <= n; k++) for (let i = 0; i <= n - k; i++) B[i] = V.lerp(B[i], B[i + 1], t);
  return B[0];
}
function fitBezier(pts, ts, deg) {
  // least squares with fixed end points
  const n = deg;
  const bin = (k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i; return r; };
  const basis = (i, t) => bin(i) * t ** i * (1 - t) ** (n - i);
  const C = [pts[0].slice(), ...Array.from({ length: n - 1 }, () => [0, 0, 0]), pts[pts.length - 1].slice()];
  if (n < 2) return C;
  const m = n - 1;
  const A = Array.from({ length: m }, () => new Array(m).fill(0));
  const R = Array.from({ length: m }, () => [0, 0, 0]);
  pts.forEach((p, k) => {
    const t = ts[k];
    const r = V.sub(p, V.add(V.mul(C[0], basis(0, t)), V.mul(C[n], basis(n, t))));
    for (let i = 1; i < n; i++) {
      for (let j = 1; j < n; j++) A[i - 1][j - 1] += basis(i, t) * basis(j, t);
      R[i - 1] = V.add(R[i - 1], V.mul(r, basis(i, t)));
    }
  });
  // Gauss-Jordan
  for (let i = 0; i < m; i++) {
    let p = i;
    for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [R[i], R[p]] = [R[p], R[i]];
    const piv = A[i][i] || 1e-12;
    for (let r = 0; r < m; r++) {
      if (r === i) continue;
      const f = A[r][i] / piv;
      for (let k = i; k < m; k++) A[r][k] -= f * A[i][k];
      R[r] = V.sub(R[r], V.mul(R[i], f));
    }
  }
  for (let i = 0; i < m; i++) C[i + 1] = V.mul(R[i], 1 / (A[i][i] || 1e-12));
  return C;
}

export function openEditByCurve(app, opts = {}) {
  const pre = (opts.preselect || app.selection.items || []).filter((r) => r.kind === "tsEdge");
  return openFormDialog(app, {
    id: "TSplineEditByCurveCmd", title: "Edit By Curve", featureLabel: "Edit By Curve",
    help: "Manipulates T-Spline edges using a driving curve: select a chain of edges, then drag the control points of the curve.",
    preselect: pre,
    rows: [
      tsRow(app, "edges", "T-Spline Edges", ["tsEdge"], { prompt: "Select T-Spline edges" }),
      { id: "degree", type: "dropdown", label: "Degree", options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })), default: "3" },
      { id: "fit", type: "dropdown", label: "Fit", options: [{ value: "control", label: "Control Points" }, { value: "surface", label: "Surface Points" }], default: "control" },
      { id: "dist", type: "dropdown", label: "Distribution", options: [{ value: "uniform", label: "Uniform" }, { value: "length", label: "Edge Length" }], default: "length" },
    ],
    onChange(id, d) { if (id === "edges" || id === "degree" || id === "dist") d.curve = null; },
    compute(v, d) {
      const st = chainState(app, d);
      if (!st) return null;
      const { c, chain, ts, C0 } = st;
      const C = d.curve || C0;
      const P = c.v.map((p) => p.slice());
      const moved = new Set();
      chain.forEach((vi, k) => { const off = V.sub(bezier(C, ts[k]), bezier(C0, ts[k])); if (V.len(off) > 1e-12) { P[vi] = V.add(c.v[vi], off); moved.add(vi); } });
      if (!moved.size) return { set: new Map([[st.id, c]]) };
      let out = tidy({ ...clone(c), v: symmetrize(c, P, moved) });
      if (v.fit === "surface") {
        const targets = out.v.map((p, i) => (moved.has(i) ? p.slice() : null));
        out = fitToTargets({ ...out, v: c.v.map((p, i) => (moved.has(i) ? out.v[i] : p)) }, targets, 8, [...moved]);
      }
      return { set: new Map([[st.id, out]]) };
    },
    manipulators(d) {
      const st = chainState(app, d);
      if (!st) return [];
      const C = d.curve || st.C0;
      const cam = app.viewport.camera.getWorldDirection(new app.viewport.camera.position.constructor()).toArray();
      return C.map((p, i) => ({
        id: `cp${i}`, type: "point", point: p, normal: cam, box: false,
        onMove: (q, final) => {
          const cur = (d.curve || st.C0).map((x) => x.slice());
          cur[i] = q;
          d.curve = cur;
          d.schedulePreview(final ? 0 : 40, !final);
        },
      }));
    },
  });
}
function chainState(app, d) {
  const refs = d.values.edges || [];
  if (!refs.length) return null;
  const id = refs[0].body;
  const c = cageOf(app, id);
  if (!c) return null;
  const t = topo(c);
  const ch = chains(c, refs.filter((r) => r.body === id).map((r) => t.edge(r.a, r.b)).filter((e) => e >= 0));
  if (ch.length !== 1) { d.message("Select one connected chain of edges", "warning"); return null; }
  let chain = ch[0];
  if (chain.length > 2 && chain[0] === chain[chain.length - 1]) chain = chain.slice(0, -1);
  const pts = chain.map((v) => c.v[v]);
  let ts;
  if (d.values.dist === "uniform") ts = pts.map((_, k) => k / Math.max(1, pts.length - 1));
  else { const L = [0]; for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + V.dist(pts[k - 1], pts[k])); ts = L.map((x) => x / (L[L.length - 1] || 1)); }
  const deg = Math.min(Number(d.values.degree) || 3, Math.max(1, pts.length - 1));
  const C0 = fitBezier(pts, ts, deg);
  return { id, c, chain, ts, C0 };
}
