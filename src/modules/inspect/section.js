// SECTION ANALYSIS (FusionHalfSectionViewCommand) and CENTER OF MASS (FusionCenterOfMassCommand)
// dialogs. Both create items in the browser's Analysis folder (app.ui.inspect.analyses()).
import { sectionGeometry, SECTION_COMPONENT_COLOR } from "./analyses.js";
import { V, planeOfRef, faceOf, visibleBodyIds, massProps, fmtVal } from "./geom.js";
import { ICONS, esc, div, fwGlyph } from "./ui.js";

const SECTION_PROMPT = "Select a planar object to define the cut plane";

function modelBox(app) {
  let box = null;
  for (const b of app.bodies()) {
    if (!b.shape || (b.meta && b.meta.visible === false)) continue;
    const bb = app.K.bboxOf(b.shape);
    if (bb) box = box ? { min: box.min.map((x, i) => Math.min(x, bb.min[i])), max: box.max.map((x, i) => Math.max(x, bb.max[i])) } : { min: [...bb.min], max: [...bb.max] };
  }
  return box;
}

/** Section definition from a selected plane-like ref. */
function baseFromRef(app, ref) {
  const plane = planeOfRef(app, ref);
  if (!plane) return null;
  let anchor = plane.o;
  if (ref.kind === "face") {
    try { const f = faceOf(app, ref); if (f) anchor = f.center.toTuple(); } catch { /* keep */ }
  } else {
    const box = modelBox(app);
    if (box) anchor = V.lerp(box.min, box.max, 0.5);
  }
  const planeRef = ref.kind === "face" ? { kind: "face", body: ref.body, index: ref.index, p: ref.p, n: ref.n, planar: true } : ref.kind === "originPlane" ? { kind: "originPlane", name: ref.name } : { kind: "cplane", id: ref.id };
  return { plane, anchor, planeRef };
}

export function registerSection(app, store) {
  app.commands.register({
    id: "FusionHalfSectionViewCommand",
    label: "Section Analysis",
    tooltip: "Creates a view that cuts through all visible objects in a design to reveal interior details and obscured features.",
    icon: "FusionHalfSectionViewCommand",
    kind: "tool",
    run: (a, ctx = {}) => openSection(a, store, ctx),
  });
  app.commands.register({
    id: "FusionCenterOfMassCommand",
    label: "Center of Mass",
    tooltip: "Displays a center mark glyph at the center of mass for the selected objects.",
    icon: "FusionCenterOfMassCommand",
    kind: "tool",
    run: (a, ctx = {}) => openCom(a, store, ctx),
  });
}

export function openSection(app, store, ctx = {}) {
  if (!app.ui.dialog) return null;
  if (app.mode === "sketch") {
    const stop = app.commands.get("SketchStop");
    if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model");
  }
  const editId = ctx.editId || null;
  const ed = editId ? store.get(editId) : null;
  const pre = editId ? [] : (ctx.preselect || app.selection.items || []).filter((r) => (r.kind === "face" && r.planar !== false) || r.kind === "originPlane" || r.kind === "cplane").slice(0, 1);
  let base = ed ? { plane: ed.plane, anchor: ed.anchor, planeRef: ed.planeRef } : null;

  const defOf = (dlg) => {
    if (!base) return null;
    const v = dlg.values;
    return {
      type: "section",
      planeRef: base.planeRef,
      plane: base.plane,
      anchor: base.anchor,
      distance: v.distance,
      xAngle: v.xAngle,
      yAngle: v.yAngle,
      flip: !!v.flip,
      colorSource: v.colorSource,
      customColor: v.customColor,
      hatch: !!v.hatch,
    };
  };
  const push = (dlg) => store.setPreviewSection(defOf(dlg), editId);

  const flipRow = {
    id: "flipRow", type: "custom",
    render(dlg) {
      const row = div("insp-crow");
      row.innerHTML = `<div class="dlg-label">Flip</div>`;
      const bg = div("dlg-bg insp-bg");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dlg-bg-btn insp-bg-btn";
      b.dataset.input = "flip";
      b.title = "Flip\nReverses the side of the cut plane that is removed.";
      b.innerHTML = fwGlyph(app, "flip", ICONS.flip);
      b.addEventListener("click", () => dlg.set("flip", !dlg.values.flip, { user: true }));
      bg.appendChild(b);
      row.appendChild(bg);
      return row;
    },
    update(el, dlg) { const b = el.querySelector("[data-input=flip]"); b.classList.toggle("on", !!dlg.values.flip); b.dataset.value = String(!!dlg.values.flip); },
  };
  const colorRow = {
    id: "customColorRow", type: "custom",
    visible: (v) => v.colorSource === "custom",
    render(dlg) {
      const row = div("insp-crow");
      row.innerHTML = `<div class="dlg-label" title="Click to select a custom color.">Custom Color</div>`;
      const inp = document.createElement("input");
      inp.type = "color";
      inp.className = "insp-color";
      inp.dataset.input = "customColor";
      inp.title = "Click to select a custom color.";
      inp.addEventListener("input", () => dlg.set("customColor", inp.value, { user: true }));
      const wrap = div("");
      wrap.appendChild(inp);
      row.appendChild(wrap);
      return row;
    },
    update(el, dlg) { const i = el.querySelector("input"); if (i.value !== dlg.values.customColor) i.value = dlg.values.customColor; },
  };

  const values = ed
    ? { plane: ed.planeRef ? [ed.planeRef] : [], distance: ed.distance, xAngle: ed.xAngle, yAngle: ed.yAngle, flip: !!ed.flip, colorSource: ed.colorSource || "component", customColor: ed.customColor || SECTION_COMPONENT_COLOR, hatch: ed.hatch !== false }
    : { flip: false, customColor: SECTION_COMPONENT_COLOR };

  return app.ui.dialog.open({
    id: "FusionHalfSectionViewCommand",
    title: "Section Analysis",
    icon: "FusionHalfSectionViewCommand",
    help: "Select a planar object to define the cut plane, then adjust the distance and angles to position it in the design.",
    preview: false,
    noFeature: true,
    preselect: pre,
    values,
    rows: [
      { id: "plane", type: "selection", label: "Cut Plane", tooltip: "Select a planar object to define the cut plane.", kinds: ["face", "originPlane", "cplane"], planar: true, max: 1, prompt: SECTION_PROMPT },
      { id: "distance", type: "value", kind: "length", label: "Distance", default: "0.00 mm" },
      { id: "xAngle", type: "value", kind: "angle", label: "X Angle", default: "0.0 deg" },
      { id: "yAngle", type: "value", kind: "angle", label: "Y Angle", default: "0.0 deg" },
      flipRow,
      { id: "colorSource", type: "dropdown", label: "Section Color", default: "component", options: [{ value: "component", label: "From Component" }, { value: "custom", label: "Custom" }] },
      colorRow,
      { id: "hatch", type: "check", label: "Show Hatch", tooltip: "Displays diagonal hatch lines on the faces where the cut plane creates the section analysis.", default: true },
    ],
    onOpen(dlg) {
      dlg.el.classList.add("insp-dlg", "insp-section");
      if (!base && (dlg.values.plane || []).length) base = baseFromRef(app, dlg.values.plane[0]);
      push(dlg);
    },
    onChange(id, dlg) {
      if (id === "plane") {
        const r = (dlg.values.plane || [])[0];
        base = r ? baseFromRef(app, r) : null;
      }
      push(dlg);
    },
    manipulators(dlg) {
      const def = defOf(dlg);
      const g = def && sectionGeometry(app, def);
      if (!g) return [];
      const box = modelBox(app);
      const rad = box ? Math.max(4, V.len(V.sub(box.max, box.min)) * 0.28) : 20;
      return [
        dlg.valueManip("distance", { origin: g.point, dir: g.base.n }),
        dlg.angleManip("xAngle", { center: g.o, axis: g.base.x, ref: g.base.n, radius: rad, min: -180, max: 180, id: "xAngle" }),
        dlg.angleManip("yAngle", { center: g.o, axis: g.y1, ref: g.n1, radius: rad * 0.8, min: -180, max: 180, id: "yAngle" }),
      ].filter(Boolean);
    },
    validate(dlg) { return base ? null : SECTION_PROMPT; },
    commit(_f, dlg) {
      const def = defOf(dlg);
      if (!def) return null;
      return editId ? store.update(editId, def, "Edit Section Analysis") : store.add(def, "Section Analysis");
    },
    onClose() { store.setPreviewSection(null, null); },
  });
}

export function openCom(app, store, ctx = {}) {
  if (!app.ui.dialog) return null;
  if (app.mode === "sketch") {
    const stop = app.commands.get("SketchStop");
    if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model");
  }
  const editId = ctx.editId || null;
  const ed = editId ? store.get(editId) : null;
  let pre = (ctx.preselect || app.selection.items || []).filter((r) => r.kind === "body");
  if (ed) pre = (ed.bodies && ed.bodies.length ? ed.bodies : visibleBodyIds(app)).map((id) => ({ kind: "body", body: id }));
  else if (!pre.length) pre = visibleBodyIds(app).map((id) => ({ kind: "body", body: id }));
  const ids = (dlg) => (dlg.values.objects || []).map((r) => r.body).filter((id) => app.body(id));
  const push = (dlg) => store.setPreviewCom({ bodies: ids(dlg), editingId: editId });

  const resultRow = {
    id: "comResult", type: "custom",
    render() { const r = div("insp-results"); r.dataset.com = "result"; return r; },
    update(el, dlg) {
      const list = ids(dlg);
      if (!list.length) { el.innerHTML = ""; return; }
      let mp = null;
      try { mp = massProps(app, list, { inertia: false, area: false }); } catch { mp = null; }
      if (!mp || !mp.count) { el.innerHTML = ""; return; }
      el.innerHTML = ["X", "Y", "Z"].map((k, i) => `<div class="insp-rrow" data-result="com${k}"><div class="dlg-label">${k}</div><div class="insp-val">${esc(fmtVal(mp.com[i], "length", 2))}</div></div>`).join("");
    },
  };

  return app.ui.dialog.open({
    id: "FusionCenterOfMassCommand",
    title: "Center of Mass",
    icon: "FusionCenterOfMassCommand",
    help: "Displays a center mark glyph at the center of mass for the selected objects.\n\nYou can measure from the center mark to other objects.",
    preview: false,
    noFeature: true,
    preselect: pre,
    activate: "objects",
    rows: [
      { id: "objects", type: "selection", label: "Selection", tooltip: "Select bodies and/or components", kinds: ["body"], min: 1, prompt: "Select bodies and/or components" },
      resultRow,
    ],
    onOpen(dlg) { dlg.el.classList.add("insp-dlg", "insp-com"); push(dlg); },
    onChange(_id, dlg) { push(dlg); },
    commit(_f, dlg) {
      const list = ids(dlg);
      const all = visibleBodyIds(app);
      const whole = list.length === all.length && all.every((id) => list.includes(id));
      const def = { type: "com", bodies: whole ? [] : list };
      return editId ? store.update(editId, def, "Edit Center of Mass") : store.add(def, "Center of Mass");
    },
    onClose() { store.setPreviewCom(null); },
  });
}
