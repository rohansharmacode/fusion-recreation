// FORM > UTILITIES: Display Mode, Repair Body, Make Uniform, Convert, Enable Better Performance;
// INSERT > Insert T-Spline (and Save *.tsm for a T-spline body).
import { openFormDialog, tsRow, cageOf, byBody, clone, formFeature, commitChange } from "./common.js";
import { FORM, evalCage } from "./feature.js";
import { setDisplay, displayOf, bust, redraw } from "./env.js";
import { analyze, repair, makeUniform } from "./ops.js";
import { tidy, orient, compact, isTsRef } from "./cage.js";
import { readTSM, writeTSM } from "./tsm.js";
import { prepareFeature } from "../../app/core.js";

const DISPLAY = [{ value: "box", label: "Box Display" }, { value: "frame", label: "Control Frame Display" }, { value: "smooth", label: "Smooth Display" }];
const bodyPre = (app, opts) => (opts.preselect || app.selection.items || []).filter((r) => (r.kind === "body" || isTsRef(r)) && cageOf(app, r.body)).map((r) => ({ kind: "body", body: r.body }));
const toBody = (r) => ({ kind: "body", body: r.body });

// ---------------------------------------------------------------- Display Mode
export function openDisplayMode(app, opts = {}) {
  if (!FORM.editing) { app.toast("Display Mode applies to T-Spline bodies in the FORM environment", "info"); return null; }
  const before = new Map(FORM.display);
  const pre = bodyPre(app, opts);
  return app.ui.dialog.open({
    id: "TSplineToggleTessModeCmd", title: "Display Mode", icon: "TSplineToggleTessModeCmd",
    help: "Sets the body display to smooth, box, or control frame. Smooth shows the actual model. Box displays only the control frame faces. Control Frame shows both.",
    preview: false, noFeature: true, preselect: pre, activate: false,
    rows: [
      { id: "mode", type: "dropdown", label: "Display Mode", options: DISPLAY, default: pre.length ? displayOf(pre[0].body) : "smooth" },
      tsRow(app, "bodies", "T-Spline Body", ["body", "tsFace"], { min: 0, prompt: "Select T-Spline bodies (none = all)", mapRef: toBody }),
    ],
    onChange(id, d) { if (id === "mode" || id === "bodies") apply(d); },
    onOpen(d) { apply(d); },
    commit(f, d) { apply(d); return true; },
    onCancel() { FORM.display = before; redraw(app); },
  });
  function apply(d) {
    const ids = (d.values.bodies || []).map((r) => r.body);
    setDisplay(app, d.values.mode, ids.length ? ids : null);
  }
}

// ---------------------------------------------------------------- Repair Body / Make Uniform
export function openRepair(app, opts = {}) {
  const info = (d) => {
    const r = (d.values.body || [])[0];
    const c = r && cageOf(app, r.body);
    return c ? analyze(c) : null;
  };
  const line = (label, key) => ({ id: `i_${key}`, type: "text", label, text: (d) => { const a = info(d); return a ? String(a[key]) : "-"; } });
  return openFormDialog(app, {
    id: "TSplineRepairBodyCmd", title: "Repair Body", featureLabel: "Repair Body",
    help: "Analyzes the T-Spline body and displays information about the mesh. Corrects Error T and Error Star conditions, welds coincident vertices and fixes face orientation.",
    preselect: bodyPre(app, opts).slice(0, 1),
    rows: [
      tsRow(app, "body", "T-Spline Body", ["body", "tsFace"], { max: 1, prompt: "Select body", mapRef: toBody }),
      { id: "geo", type: "group", label: "Geometry Labels", rows: [line("Star Points", "stars"), line("NGons", "ngons"), line("T Points", "tpoints"), line("Free Edges", "free")] },
      { id: "err", type: "group", label: "Error Labels", rows: [line("Error Star", "nonManifold"), line("Error T Points", "tpoints")] },
      { id: "auto", type: "check", label: "AutoRepair", default: true },
    ],
    onChange(id, d) { if (id === "body") d.refresh(); },
    compute(v) {
      const r = (v.body || [])[0];
      if (!r) return null;
      const c = cageOf(app, r.body);
      return { set: new Map([[r.body, v.auto ? repair(c) : c]]) };
    },
  });
}
export function openMakeUniform(app, opts = {}) {
  return openFormDialog(app, {
    id: "TSplineMakeUniformCmd", title: "Make Uniform", featureLabel: "Make Uniform",
    help: "Evenly distributes the angles at the intersection of star points and makes faces as uniform as possible.",
    preselect: bodyPre(app, opts),
    rows: [tsRow(app, "bodies", "T-Spline Body", ["body", "tsFace"], { prompt: "Select T-Spline bodies to make uniform", mapRef: toBody })],
    compute(v) {
      const set = new Map();
      for (const id of byBody(v.bodies).keys()) set.set(id, makeUniform(cageOf(app, id)));
      return set.size ? { set } : null;
    },
  });
}

// ---------------------------------------------------------------- Convert
/** Cage from a B-rep body: planar faces become one polygon each, curved faces keep their triangles. */
export function cageFromShape(app, shape) {
  const md = app.viewport.meshFor(shape);
  const P = md.vertices, T = md.triangles;
  const key = (i) => `${P[3 * i].toFixed(4)},${P[3 * i + 1].toFixed(4)},${P[3 * i + 2].toFixed(4)}`;
  const ids = new Map(), v = [];
  const vid = (i) => { const k = key(i); if (!ids.has(k)) { ids.set(k, v.length); v.push([P[3 * i], P[3 * i + 1], P[3 * i + 2]]); } return ids.get(k); };
  const f = [];
  const groups = md.faceGroups || [{ start: 0, count: T.length }];
  const types = shape.faces ? null : null;
  void types;
  for (const g of groups) {
    const tris = [];
    for (let k = g.start; k < g.start + g.count; k += 3) tris.push([vid(T[k]), vid(T[k + 1]), vid(T[k + 2])].filter((x, i, a) => a.indexOf(x) === i));
    const good = tris.filter((t) => t.length === 3);
    if (!good.length) continue;
    // planar? all triangle normals parallel
    const nrm = (t) => { const [a, b, c] = t.map((i) => v[i]); const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])]; const l = Math.hypot(...n) || 1; return n.map((x) => x / l); };
    const n0 = nrm(good[0]);
    const planar = good.every((t) => { const n = nrm(t); return n[0] * n0[0] + n[1] * n0[1] + n[2] * n0[2] > 0.9999; });
    if (planar) {
      // boundary of the triangle fan -> one polygon (single loop only)
      const cnt = new Map(), dir = new Map();
      for (const t of good) for (let i = 0; i < 3; i++) { const a = t[i], b = t[(i + 1) % 3]; const k = a < b ? `${a},${b}` : `${b},${a}`; cnt.set(k, (cnt.get(k) || 0) + 1); dir.set(`${a}>${b}`, true); }
      const next = new Map();
      for (const [k, c] of cnt) { if (c !== 1) continue; const [a, b] = k.split(",").map(Number); if (dir.get(`${a}>${b}`)) next.set(a, b); else next.set(b, a); }
      const start = next.keys().next().value;
      const loop = [];
      let x = start;
      for (let guard = 0; guard < 100000 && x !== undefined; guard++) { loop.push(x); x = next.get(x); if (x === start) break; }
      if (loop.length === next.size && loop.length >= 3) { f.push(loop); continue; }
    }
    f.push(...good);
  }
  return compact(orient(tidy({ v, f, crease: [], cv: [], frozen: [], iso: [], sym: null }))).cage;
}
export function cageFromMesh(mesh) {
  const P = mesh.positions, I = mesh.indices || Uint32Array.from({ length: P.length / 3 }, (_, i) => i);
  if (I.length / 3 > 20000) throw new Error("Meshes with more than 20,000 faces cannot be converted to a T-Spline body");
  const ids = new Map(), v = [], f = [];
  const vid = (i) => { const k = `${P[3 * i].toFixed(5)},${P[3 * i + 1].toFixed(5)},${P[3 * i + 2].toFixed(5)}`; if (!ids.has(k)) { ids.set(k, v.length); v.push([P[3 * i], P[3 * i + 1], P[3 * i + 2]]); } return ids.get(k); };
  for (let t = 0; t < I.length; t += 3) { const tri = [vid(I[t]), vid(I[t + 1]), vid(I[t + 2])]; if (new Set(tri).size === 3) f.push(tri); }
  return compact(orient(tidy({ v, f, crease: [], cv: [], frozen: [], iso: [], sym: null }))).cage;
}
/** Form feature that produced B-rep body `id` (finished forms), or null. */
function formOfBody(app, id) {
  for (const f of app.doc.features) if (f.type === "form" && (f.bodies || []).some((c) => c.id === id)) return f;
  return null;
}
/** Add a new T-spline body: into the edited Form, else in a new Form feature. hide: original body ids to hide. */
export function addTSplineBody(app, cage, label, { hide = [], name } = {}) {
  if (FORM.editing && formFeature(app)) {
    return app.mutate(label, (doc) => {
      const f = doc.features.find((x) => x.id === FORM.editing);
      const id = app.M.nextBody(doc, name ? { name } : {});
      f.bodies = [...(f.bodies || []), { ...clone(cage), id }];
      for (const h of hide) if (doc.bodies[h]) doc.bodies[h].visible = false;
      return id;
    });
  }
  return app.mutate(label, (doc) => {
    const id = app.M.nextBody(doc, name ? { name } : {});
    const nf = { type: "form", bodies: [{ ...clone(cage), id }] };
    prepareFeature(doc, nf);
    doc.features.splice(doc.marker, 0, nf);
    doc.marker += 1;
    for (const h of hide) if (doc.bodies[h]) doc.bodies[h].visible = false;
    return id;
  });
}
export function openConvert(app, opts = {}) {
  const inForm = () => !!FORM.editing;
  const kindOf = (id) => app.bodyKind(id);
  const okFor = (type, id) => {
    if (type === "ts2brep") return inForm() ? !!cageOf(app, id) : kindOf(id) !== "mesh" && !!formOfBody(app, id);
    if (type === "brep2ts") return (kindOf(id) === "solid" || kindOf(id) === "surface") && !cageOf(app, id);
    if (type === "mesh2ts") return kindOf(id) === "mesh";
    return false;
  };
  const pre = (opts.preselect || app.selection.items || []).filter((r) => r.body).map(toBody);
  const type0 = pre.length && kindOf(pre[0].body) === "mesh" ? "mesh2ts" : pre.length && !cageOf(app, pre[0].body) && !formOfBody(app, pre[0].body) ? "brep2ts" : "ts2brep";
  return app.ui.dialog.open({
    id: "TSpline2BRepCommand", title: "Convert", icon: "TSpline2BRepCommand",
    help: "Changes the body type of the selected object: T-Spline bodies to B-rep bodies, B-rep or mesh bodies to T-Spline bodies.",
    preview: false, noFeature: true, preselect: pre,
    rows: [
      { id: "type", type: "dropdown", label: "Convert Type", options: [{ value: "ts2brep", label: "T-Spline to BRep" }, { value: "brep2ts", label: "BRep to T-Spline" }, { value: "mesh2ts", label: "Mesh to T-Spline" }], default: type0 },
      { id: "sel", type: "selection", label: "Selection", kinds: ["body", "tsFace", "face"], meshBodies: true, prompt: "Select the object to convert", mapRef: toBody, filter: (r, d) => okFor(d.values.type, r.body) },
    ],
    onChange(id, d) { if (id === "type") d.setSelection("sel", (d.values.sel || []).filter((r) => okFor(d.values.type, r.body))); },
    validate(d) { return (d.values.sel || []).length ? null : "Select the object to convert"; },
    commit(f, d) {
      const ids = [...new Set((d.values.sel || []).map((r) => r.body))];
      const type = d.values.type;
      if (type === "ts2brep") {
        if (inForm()) {
          const set = new Map(ids.map((id) => [id, { ...clone(cageOf(app, id)), converted: true }]));
          return commitChange(app, "Convert", { set });
        }
        return app.mutate("Convert", (doc) => {
          for (const id of ids) for (const f2 of doc.features) if (f2.type === "form") for (const c of f2.bodies || []) if (c.id === id) c.converted = true;
        });
      }
      let last = null;
      for (const id of ids) {
        const b = app.anyBody(id);
        if (!b) continue;
        const cage = type === "mesh2ts" ? cageFromMesh(b.mesh) : cageFromShape(app, b.shape);
        if (!cage.f.length) throw new Error("The body has no faces to convert");
        last = addTSplineBody(app, cage, "Convert", { hide: [id] });
      }
      return last;
    },
  });
}

// ---------------------------------------------------------------- Insert T-Spline / Save TSM
export function insertTSpline(app) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".tsm,.tss,.obj,.txt,.xml";
  input.style.display = "none";
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    try {
      const text = await file.text();
      const cage = readTSM(text);
      const name = file.name.replace(/\.[^.]+$/, "");
      addTSplineBody(app, cage, "Insert T-Spline", { name });
      app.toast(`Inserted ${name}: ${cage.v.length} vertices, ${cage.f.length} faces`, "info");
    } catch (e) { app.toast(`Insert T-Spline: ${e.message || e}`, "error"); }
  });
  document.body.appendChild(input);
  input.click();
}
/** Insert a T-spline from TSM text (tests, drag and drop). */
export function insertTSplineText(app, text, name = "TSpline") { const cage = readTSM(text); return addTSplineBody(app, cage, "Insert T-Spline", { name }); }

export function saveTSM(app) {
  const r = app.selection.items.find((x) => x.body && (cageOf(app, x.body) || formOfBody(app, x.body)));
  const id = r && r.body;
  let cage = id && cageOf(app, id);
  if (!cage && id) { const f = formOfBody(app, id); cage = f && f.bodies.find((c) => c.id === id); }
  if (!cage) { app.toast("Select a T-Spline body to save", "info"); return; }
  const name = (app.bodyMeta(id) || {}).name || "Body";
  app.download(`${name}.tsm`, writeTSM(cage, name), "text/plain");
}

// ---------------------------------------------------------------- Enable Better Performance
export function toggleBetterPerformance(app) {
  FORM.perf = !FORM.perf;
  if (FORM.editing) { bust(app, FORM.editing); app.recompute(); }
  app.toast(FORM.perf ? "Better Performance: faster T-Spline display" : "Better Display: finer T-Spline surfaces", "info", 1600);
}
void evalCage;
