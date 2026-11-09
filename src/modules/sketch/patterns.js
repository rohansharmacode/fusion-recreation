// Sketch Rectangular Pattern (RectangularSketchPatternCommand) and Circular Pattern
// (CircularSketchPatternCommand): Fusion's dialogs, live preview, canvas suppress check boxes,
// and Edit Pattern (double-click the pattern glyph). The pattern is a constraint in the sketch
// ({type:'rpattern'|'cpattern'}, src/sketch/ops2.js) so the copies follow the source like Fusion's.
import { ST, mutateSketch, params, onLocal, projector, activeData } from "./ctx.js";
import { showLive, endLive, storedSketch, curveOfActive, pointOfActive, pairRow, W, Wdir } from "./dlgutil.js";
import { updateOverlay } from "./render.js";

const deg = (v) => `${(+v).toFixed(1)} deg`;
const isSrcCurve = (cv) => !cv.proj && cv.type !== "text" && cv.type !== "c3d";

/** Copies made by any pattern of sketch sk (they cannot be picked as pattern sources). */
function copySet(sk) {
  const s = new Set();
  for (const c of sk.constraints) if (c.copies) for (const id of c.copies) s.add(id);
  return s;
}

function sourceCentre(sk, ids) {
  const S = ST.app.S;
  let mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
  for (const id of ids) for (const p of S.curvePolyline(sk, id, 24)) { mn = [Math.min(mn[0], p[0]), Math.min(mn[1], p[1])]; mx = [Math.max(mx[0], p[0]), Math.max(mx[1], p[1])]; }
  if (!Number.isFinite(mn[0])) return [0, 0];
  return [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2];
}

// ---------- canvas suppress check boxes ----------
const SUP = { els: [], dlg: null };
function clearSupBoxes() { for (const e of SUP.els) e.remove(); SUP.els = []; }
function placeSupBoxes() {
  const dlg = SUP.dlg;
  if (!dlg || dlg.closed || !dlg.values.suppress || !dlg._liveC || !ST.live) { clearSupBoxes(); return; }
  const sk = ST.live.sk, c = dlg._liveC;
  const S = ST.app.S;
  const proj = projector(activeData().plane);
  const vals = S.patternValues(c, params());
  const insts = S.patternInstances(c, vals);
  const host = ST.overlay;
  clearSupBoxes();
  const sup = new Set((dlg.values.sup || []).map((x) => x.join(",")));
  // instance centre = source centre moved like the instance
  const base = sourceCentre(sk, c.src);
  const u1 = c.dir1 && c.dir1.line && sk.curves[c.dir1.line] ? (() => { const L = sk.curves[c.dir1.line]; const a = sk.points[L.p1], b = sk.points[L.p2]; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; const s = c.dir1.rev ? -1 : 1; return [(s * (b.x - a.x)) / l, (s * (b.y - a.y)) / l]; })() : [1, 0];
  const u2 = c.dir2 && c.dir2.line && sk.curves[c.dir2.line] ? (() => { const L = sk.curves[c.dir2.line]; const a = sk.points[L.p1], b = sk.points[L.p2]; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; const s = c.dir2.rev ? -1 : 1; return [(s * (b.x - a.x)) / l, (s * (b.y - a.y)) / l]; })() : [-u1[1], u1[0]];
  const C = c.center && sk.points[c.center] ? [sk.points[c.center].x, sk.points[c.center].y] : null;
  for (const ix of insts) {
    let p;
    if (c.type === "rpattern") p = [base[0] + ix[0] * vals.step1 * u1[0] + ix[1] * vals.step2 * u2[0], base[1] + ix[0] * vals.step1 * u1[1] + ix[1] * vals.step2 * u2[1]];
    else { if (!C) continue; const th = ix[0] * vals.step * (c.flip ? -1 : 1); const d = [base[0] - C[0], base[1] - C[1]]; p = [C[0] + Math.cos(th) * d[0] - Math.sin(th) * d[1], C[1] + Math.sin(th) * d[0] + Math.cos(th) * d[1]]; }
    const s = proj(p[0], p[1]);
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "sk-sup-box";
    cb.checked = !sup.has(ix.join(","));
    cb.dataset.instance = ix.join(",");
    cb.style.left = `${s[0] - 7}px`;
    cb.style.top = `${s[1] - 7}px`;
    cb.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    cb.addEventListener("change", () => {
      const cur = (dlg.values.sup || []).filter((x) => x.join(",") !== ix.join(","));
      if (!cb.checked) cur.push(ix);
      dlg.values.sup = cur;
      dlg.schedulePreview(10);
    });
    host.appendChild(cb);
    SUP.els.push(cb);
  }
}

// ---------- the pattern constraint from the dialog values ----------
function specFrom(type, v, dlg) {
  const sk = storedSketch();
  const src = (v.objects || []).map((r) => r.curve).filter((id) => sk.curves[id]);
  if (type === "rpattern") {
    const dirs = (v.directions || []).map((r) => r.curve).filter((id) => sk.curves[id]);
    return {
      type, src, q1: v.q1, q2: v.q2, d1: v.d1, d2: v.d2, distType: v.distType,
      sym1: v.dirType1 === "sym", sym2: v.dirType2 === "sym",
      dir1: dirs[0] ? { line: dirs[0], rev: !!v.flip1 } : { ang: 0, rev: !!v.flip1 },
      dir2: dirs[1] ? { line: dirs[1], rev: !!v.flip2 } : null,
      suppress: !!v.suppress, sup: v.suppress ? (v.sup || []) : [],
    };
  }
  const cp = (v.center || [])[0];
  return {
    type, src, center: cp ? cp.point : null, q: v.q, angle: v.angle, angType: v.angType, flip: !!v.flip,
    suppress: !!v.suppress, sup: v.suppress ? (v.sup || []) : [],
  };
}

function previewPattern(dlg, type) {
  const S = ST.app.S;
  const sk0 = storedSketch();
  if (!sk0) return;
  const spec = specFrom(type, dlg.values, dlg);
  if (!spec.src.length || (type === "cpattern" && !spec.center)) { dlg._liveC = null; if (dlg.editId0) { const w = S.cloneSketch(sk0); S.removePattern(w, dlg.editId0); showLive(w); } else endLive(); placeSupBoxes(); return; }
  const w = S.cloneSketch(sk0);
  let c;
  try {
    if (dlg.editId0) { const old = w.constraints.find((k) => k.id === dlg.editId0); Object.assign(old, spec); c = S.buildPattern(w, old, params()); }
    else c = S.addPattern(w, spec, params());
  } catch (e) { console.error(e); dlg.message(`Pattern: ${e.message || e}`, "error"); return; }
  dlg._liveC = c;
  showLive(w);
  placeSupBoxes();
}

function commitPattern(dlg, type) {
  const S = ST.app.S;
  const spec = specFrom(type, dlg.values, dlg);
  const editId = dlg.editId0;
  return mutateSketch(editId ? (type === "rpattern" ? "Edit Rectangular Pattern" : "Edit Circular Pattern") : (type === "rpattern" ? "Rectangular Pattern" : "Circular Pattern"), (sk) => {
    if (editId) {
      const c = sk.constraints.find((k) => k.id === editId);
      if (!c) throw new Error("The pattern no longer exists");
      Object.assign(c, spec);
      return S.buildPattern(sk, c, params()).id;
    }
    return S.addPattern(sk, spec, params()).id;
  });
}

const DIR_TYPES = [{ value: "one", label: "One Direction", icon: "oneSide" }, { value: "sym", label: "Symmetric", icon: "symmetric" }];

/** Small icon dropdown used for the paired Direction Type controls. */
function dirTypeCtl(dlg, id) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "sk-dirtype";
  b.dataset.input = id;
  const ui = ST.app.ui.dialog;
  const sync = () => { const o = DIR_TYPES.find((x) => x.value === dlg.values[id]) || DIR_TYPES[0]; b.innerHTML = ui.glyph(o.icon, 16); b.title = o.label; b.dataset.value = o.value; };
  b.addEventListener("click", () => {
    dlg.openMenu(b, DIR_TYPES.map((o) => ({ label: o.label, icon: o.icon, value: o.value, current: dlg.values[id] === o.value, run: () => { dlg.set(id, o.value, { user: true }); sync(); } })));
  });
  Object.defineProperty(b, "value", { get: () => dlg.values[id], set: (v) => { dlg.set(id, v, { user: true }); sync(); } });
  sync();
  b._sync = sync;
  return b;
}

// ---------------------------------------------------------------------------
export function openRectPattern(editId = null) {
  const A = ST.app;
  const sk = storedSketch();
  if (!sk) return null;
  const ed = editId ? sk.constraints.find((k) => k.id === editId && k.type === "rpattern") : null;
  const copies = copySet(sk);
  const pre = ed ? ed.src.map((id) => ({ kind: "sketchCurve", sketch: ST.sketchId, curve: id }))
    : A.selection.items.filter((r) => r.kind === "sketchCurve" && r.sketch === ST.sketchId && sk.curves[r.curve] && isSrcCurve(sk.curves[r.curve]) && !copies.has(r.curve));
  const dirsPre = ed ? [ed.dir1 && ed.dir1.line, ed.dir2 && ed.dir2.line].filter(Boolean).map((id) => ({ kind: "sketchCurve", sketch: ST.sketchId, curve: id })) : [];
  // Fusion's starting values: 2 x 1 instances; the distance from the size of the selection
  const centre0 = pre.length ? sourceCentre(sk, pre.map((r) => r.curve)) : null;
  void centre0;
  const sizeOf = (ids) => { let mn = Infinity, mx = -Infinity; for (const id of ids) for (const p of A.S.curvePolyline(sk, id, 16)) { mn = Math.min(mn, p[0]); mx = Math.max(mx, p[0]); } return Number.isFinite(mn) ? Math.max(1, (mx - mn) * 2) : 10; };
  const d0 = A.ui.dialog.fmt(pre.length ? sizeOf(pre.map((r) => r.curve)) : 10, "length");
  const dlg = A.ui.dialog.open({
    id: "RectangularSketchPatternCommand",
    title: ed ? "Edit Rectangular Pattern" : "Rectangular Pattern",
    icon: "RectangularSketchPatternCommand",
    help: "Duplicates sketch curves in rows and columns. Select the curves to pattern then specify the direction, quantity, and distance.",
    preview: false,
    labelWidth: 96,
    ctrlWidth: 150,
    rows: [
      { id: "objects", type: "selection", label: "Objects", kinds: ["sketchCurve"], filter: curveOfActive((cv, id) => isSrcCurve(cv) && !copies.has(id)), prompt: "Select sketch curves to pattern" },
      { id: "directions", type: "selection", label: "Directions", kinds: ["sketchCurve"], min: 0, max: 2, filter: curveOfActive((cv) => cv.type === "line"), prompt: "Select lines to define the pattern directions" },
      { id: "distType", type: "dropdown", label: "Distance Type", default: "extent", options: [{ value: "extent", label: "Extent", icon: "extentWhole" }, { value: "spacing", label: "Spacing", icon: "extentSpacing" }] },
      { id: "q1", type: "value", embed: true, kind: "none", integer: true, min: 1, default: "2" },
      { id: "q2", type: "value", embed: true, kind: "none", integer: true, min: 1, default: "1" },
      { id: "d1", type: "value", embed: true, kind: "length", default: d0 },
      { id: "d2", type: "value", embed: true, kind: "length", default: d0 },
      { id: "qrow", type: "custom", render: (dl) => pairRow(dl, "Quantity", ["q1", "q2"]) },
      { id: "drow", type: "custom", render: (dl) => pairRow(dl, "Distance", ["d1", "d2"]) },
      {
        id: "trow", type: "custom",
        render: (dl) => { const el = pairRow(dl, "Direction Type", []); const box = el.querySelector(".sk-pair"); box.append(dirTypeCtl(dl, "dirType1"), dirTypeCtl(dl, "dirType2")); return el; },
        update: (el) => el.querySelectorAll(".sk-dirtype").forEach((b) => b._sync && b._sync()),
      },
      { id: "dirType1", type: "dropdown", label: "Direction Type 1", default: "one", options: DIR_TYPES, visible: () => false },
      { id: "dirType2", type: "dropdown", label: "Direction Type 2", default: "one", options: DIR_TYPES, visible: () => false },
      { id: "suppress", type: "check", label: "Suppress", default: false },
    ],
    values: ed ? { distType: ed.distType || "extent", q1: String(ed.q1), q2: String(ed.q2), d1: ed.d1, d2: ed.d2, dirType1: ed.sym1 ? "sym" : "one", dirType2: ed.sym2 ? "sym" : "one", suppress: !!ed.suppress, sup: ed.sup || [], flip1: !!(ed.dir1 && ed.dir1.rev), flip2: !!(ed.dir2 && ed.dir2.rev) } : {},
    preselect: [...pre, ...dirsPre],
    activate: pre.length ? false : "objects",
    init(d) { d.editId0 = ed ? ed.id : null; },
    validate(d) {
      const q1 = d.num("q1"), q2 = d.num("q2");
      if (!(q1 >= 1) || !(q2 >= 1)) return "Quantity must be at least 1";
      if (q1 * q2 < 2) return "Increase the quantity";
      if (q1 * q2 > 400) return "Too many instances";
      return null;
    },
    build: (v) => ((v.objects || []).length ? { type: "sketchPattern" } : null),
    manipulators(d) {
      const sk1 = storedSketch();
      const src = (d.values.objects || []).map((r) => r.curve).filter((id) => sk1.curves[id]);
      if (!src.length) return [];
      const c0 = sourceCentre(sk1, src);
      const spec = specFrom("rpattern", d.values, d);
      const dirOf = (k) => {
        const s = spec[`dir${k}`];
        if (s && s.line && sk1.curves[s.line]) { const L = sk1.curves[s.line]; const a = sk1.points[L.p1], b = sk1.points[L.p2]; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; const sg = s.rev ? -1 : 1; return [(sg * (b.x - a.x)) / l, (sg * (b.y - a.y)) / l]; }
        if (k === 1) return [spec.dir1 && spec.dir1.rev ? -1 : 1, 0];
        const u = dirOf(1); return [-u[1], u[0]];
      };
      const out = [];
      const m1 = d.valueManip("d1", { origin: W(c0), dir: Wdir(dirOf(1)), id: "d1" });
      if (m1) out.push(m1);
      if (d.num("q2") > 1) { const m2 = d.valueManip("d2", { origin: W(c0), dir: Wdir(dirOf(2)), id: "d2" }); if (m2) out.push(m2); }
      return out;
    },
    afterPreview: (d) => previewPattern(d, "rpattern"),
    commit: (f, d) => commitPattern(d, "rpattern"),
    onOpen(d) { SUP.dlg = d; },
    onClose() { SUP.dlg = null; clearSupBoxes(); endLive(); ST.app.selection.clear(); },
  });
  return dlg;
}

export function openCircPattern(editId = null) {
  const A = ST.app;
  const sk = storedSketch();
  if (!sk) return null;
  const ed = editId ? sk.constraints.find((k) => k.id === editId && k.type === "cpattern") : null;
  const copies = copySet(sk);
  const pre = ed ? ed.src.map((id) => ({ kind: "sketchCurve", sketch: ST.sketchId, curve: id }))
    : A.selection.items.filter((r) => r.kind === "sketchCurve" && r.sketch === ST.sketchId && sk.curves[r.curve] && isSrcCurve(sk.curves[r.curve]) && !copies.has(r.curve));
  const prePt = ed && ed.center ? [{ kind: "sketchPoint", sketch: ST.sketchId, point: ed.center }] : A.selection.items.filter((r) => r.kind === "sketchPoint" && r.sketch === ST.sketchId);
  const dlg = A.ui.dialog.open({
    id: "CircularSketchPatternCommand",
    title: ed ? "Edit Circular Pattern" : "Circular Pattern",
    icon: "CircularSketchPatternCommand",
    help: "Duplicates selected sketch curves in an arc or circular pattern. Select the curves to pattern, the point to revolve around, and the quantity.",
    preview: false,
    labelWidth: 96,
    rows: [
      { id: "objects", type: "selection", label: "Objects", kinds: ["sketchCurve"], filter: curveOfActive((cv, id) => isSrcCurve(cv) && !copies.has(id)), prompt: "Select sketch curves to pattern" },
      {
        id: "center", type: "selection", label: "Center Point", kinds: ["sketchPoint", "sketchCurve"], max: 1,
        filter: (r) => pointOfActive()(r) || curveOfActive((cv) => ["circle", "arc", "ellipse", "earc"].includes(cv.type) || cv.type === "point")(r),
        mapRef: (r) => { if (r.kind === "sketchPoint") return r; const cv = storedSketch().curves[r.curve]; return { kind: "sketchPoint", sketch: r.sketch, point: cv.type === "point" ? cv.p : cv.c }; },
        prompt: "Select the center point",
      },
      { id: "angType", type: "dropdown", label: "Type", default: "full", options: [{ value: "full", label: "Full", icon: "revFull" }, { value: "angle", label: "Angle", icon: "revAngle" }, { value: "sym", label: "Symmetric", icon: "symmetric" }] },
      { id: "q", type: "value", label: "Quantity", kind: "none", integer: true, min: 1, default: "3" },
      { id: "angle", type: "value", label: "Total Angle", kind: "angle", default: "360.0 deg", visible: (v) => v.angType !== "full" },
      { id: "flip", type: "check", label: "Flip", default: false, visible: (v) => v.angType === "angle" },
      { id: "suppress", type: "check", label: "Suppress", default: false },
    ],
    values: ed ? { angType: ed.angType || "full", q: String(ed.q), angle: ed.angle || "360.0 deg", flip: !!ed.flip, suppress: !!ed.suppress, sup: ed.sup || [] } : {},
    preselect: [...pre, ...prePt],
    activate: (d) => ((d.values.objects || []).length ? ((d.values.center || []).length ? false : "center") : "objects"),
    init(d) { d.editId0 = ed ? ed.id : null; },
    onChange(id, d) {
      // Fusion switches the total angle to 180 deg for an arc pattern
      if (id === "angType" && d.values.angType !== "full" && !d.touched.has("angle") && /^360/.test(String(d.values.angle))) d.set("angle", deg(180), { noPreview: true, user: false });
    },
    validate(d) {
      const q = d.num("q");
      if (!(q >= 2)) return "Quantity must be at least 2";
      if (q > 360) return "Too many instances";
      return null;
    },
    build: (v) => ((v.objects || []).length && (v.center || []).length ? { type: "sketchPattern" } : null),
    manipulators(d) {
      const sk1 = storedSketch();
      const cp = (d.values.center || [])[0];
      if (!cp || !sk1.points[cp.point] || d.values.angType === "full") return [];
      const src = (d.values.objects || []).map((r) => r.curve).filter((id) => sk1.curves[id]);
      if (!src.length) return [];
      const C = [sk1.points[cp.point].x, sk1.points[cp.point].y];
      const c0 = sourceCentre(sk1, src);
      const dv = [c0[0] - C[0], c0[1] - C[1]];
      const r = Math.hypot(dv[0], dv[1]) || 10;
      const pl = activeData().plane;
      const m = d.angleManip("angle", { center: W(C), axis: pl.n, ref: Wdir([dv[0] / r, dv[1] / r]), radius: r, min: 0, max: 360 });
      return m ? [m] : [];
    },
    afterPreview: (d) => previewPattern(d, "cpattern"),
    commit: (f, d) => commitPattern(d, "cpattern"),
    onOpen(d) { SUP.dlg = d; },
    onClose() { SUP.dlg = null; clearSupBoxes(); endLive(); ST.app.selection.clear(); },
  });
  return dlg;
}

/** Double-click a pattern glyph: Edit Pattern. */
export function initPatterns() {
  onLocal((type, det) => {
    if (type === "glyph-dbl" && det && det.c) {
      if (det.c.type === "rpattern") openRectPattern(det.c.id);
      else if (det.c.type === "cpattern") openCircPattern(det.c.id);
    }
    if (type === "rendered") requestAnimationFrame(() => { if (SUP.dlg) placeSupBoxes(); });
  });
  ST.app.on("camera", () => { if (SUP.els.length) placeSupBoxes(); });
  void updateOverlay;
}
