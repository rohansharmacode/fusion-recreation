// PROPERTIES (FusionPropertiesCommand; aliases PropertiesCommand / Properties / properties):
// General (name, material, appearance), Physical (mass, volume, density, area, center of mass),
// Bounding Box and the inertia tensors of a body, or of the root component when no body is selected.
// Mass = volume x physical-material density (doc units: mm, g).
import { massProps, visibleBodyIds, fmtNum } from "./geom.js";
import { materialOf, appearanceInfo } from "./library.js";
import { esc, div } from "./ui.js";

const PREC = [["0", "0"], ["1", "0.1"], ["2", "0.12"], ["3", "0.123"], ["4", "0.1234"], ["5", "0.12345"], ["6", "0.123456"]];

export function registerProperties(app) {
  const def = {
    label: "Properties",
    tooltip: "Displays the physical properties of the selected body or component.",
    icon: "FusionPropertiesCommand",
    kind: "tool",
    run: (a, ctx = {}) => openProperties(a, ctx),
  };
  app.commands.register({ id: "FusionPropertiesCommand", ...def });
  for (const alias of ["PropertiesCommand", "Properties", "properties"]) app.commands.register({ id: alias, ...def, hidden: true, alias: true });
}

export function openProperties(app, ctx = {}) {
  if (!app.ui.dialog) return null;
  if (app.mode === "sketch") {
    const stop = app.commands.get("SketchStop");
    if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model");
  }
  const sel = (ctx.preselect || app.selection.items || []);
  const bodyRef = sel.find((r) => r.kind === "body" || r.kind === "face" || r.kind === "edge" || r.kind === "vertex");
  const bodyId = ctx.body || (bodyRef && bodyRef.body) || null;
  const target = bodyId && app.body(bodyId) ? { kind: "body", id: bodyId } : { kind: "component" };
  let P = null;

  const compute = () => {
    const ids = target.kind === "body" ? [target.id] : visibleBodyIds(app);
    const mp = massProps(app, ids);
    const meta = target.kind === "body" ? app.bodyMeta(target.id) : null;
    P = {
      name: meta ? meta.name : `${app.doc.name || "Untitled"}`,
      material: meta ? materialOf(meta).name : mp.materials.length === 1 ? mp.materials[0] : mp.materials.length ? "Multiple" : "-",
      appearance: meta ? appearanceInfo(app, meta.appearance).name : "-",
      mp,
    };
  };
  compute();
  const prec = (dlg) => dlg.values.precision;
  const n = (dlg, v) => fmtNum(v, prec(dlg));
  const txt = (fn) => (dlg) => { try { return fn(dlg); } catch { return "-"; } };
  const tensorRow = (key) => ({
    id: `${key}Mtx`, type: "custom",
    render() { const m = div("insp-mtx"); m.dataset.tensor = key; return m; },
    update(el, dlg) {
      const T = P.mp[key];
      if (!T) { el.innerHTML = `<div class="insp-empty">Not available</div>`; return; }
      const names = [["Ixx", "Ixy", "Ixz"], ["Iyx", "Iyy", "Iyz"], ["Izx", "Izy", "Izz"]];
      el.innerHTML = names.map((r, i) => r.map((k, j) => `<div data-i="${k}" title="${k} = ${esc(n(dlg, T[i][j]))} g mm^2"><span class="insp-mtx-k">${k}</span>${esc(n(dlg, T[i][j]))}</div>`).join("")).join("");
    },
  });
  const t = (id, label, fn) => ({ id, type: "text", label, text: txt(fn) });

  return app.ui.dialog.open({
    id: "FusionPropertiesCommand",
    title: "Properties",
    icon: "FusionPropertiesCommand",
    help: "Physical properties are computed from the geometry and the assigned physical material.",
    preview: false,
    noFeature: true,
    activate: false,
    rows: [
      { id: "precision", type: "dropdown", label: "Precision", default: "3", options: PREC.map(([value, label]) => ({ value, label })) },
      {
        id: "general", type: "group", label: "General", rows: [
          t("name", "Name", () => P.name),
          t("material", "Material", () => P.material),
          t("appearance", "Appearance", () => P.appearance),
        ],
      },
      {
        id: "physical", type: "group", label: "Physical", rows: [
          t("mass", "Mass", (d) => `${n(d, P.mp.mass)} g`),
          t("volume", "Volume", (d) => `${n(d, P.mp.volume)} mm^3`),
          t("density", "Density", (d) => `${n(d, P.mp.density)} g / mm^3`),
          t("area", "Area", (d) => `${n(d, P.mp.area)} mm^2`),
          // position of the owning component's origin (every body lives in the root component here)
          t("world", "World X,Y,Z", (d) => [0, 0, 0].map((v) => `${n(d, v)} mm`).join(", ")),
          t("com", "Center of Mass", (d) => P.mp.com.map((v) => `${n(d, v)} mm`).join(", ")),
        ],
      },
      {
        id: "bbox", type: "group", label: "Bounding Box", rows: [
          t("bboxLength", "Length", (d) => `${n(d, P.mp.bbox.max[0] - P.mp.bbox.min[0])} mm`),
          t("bboxWidth", "Width", (d) => `${n(d, P.mp.bbox.max[1] - P.mp.bbox.min[1])} mm`),
          t("bboxHeight", "Height", (d) => `${n(d, P.mp.bbox.max[2] - P.mp.bbox.min[2])} mm`),
        ],
      },
      { id: "moiCom", type: "group", label: "Moment of Inertia at Center of Mass", rows: [tensorRow("inertiaCom")] },
      { id: "moiOrigin", type: "group", label: "Moment of Inertia at Origin", rows: [tensorRow("inertiaOrigin")] },
    ],
    onOpen(dlg) {
      dlg.el.classList.add("insp-dlg", "insp-props");
      dlg.el.dataset.target = target.kind === "body" ? target.id : "component";
      const foot = dlg.el.querySelector(".dlg-foot");
      const cancel = foot && foot.querySelector("[data-action=cancel]");
      if (cancel) cancel.style.display = "none";
      // unit hint on the inertia group headers (Fusion: "(g mm^2)")
      for (const g of dlg.el.querySelectorAll('[data-group="moiCom"] .dlg-group-label, [data-group="moiOrigin"] .dlg-group-label')) {
        if (!g.querySelector(".insp-unit-note")) g.insertAdjacentHTML("beforeend", `<span class="insp-unit-note">(g mm^2)</span>`);
      }
      // values are copyable
      for (const el of dlg.el.querySelectorAll(".dlg-text")) el.title = "Select to copy";
    },
    afterPreview(dlg) {
      if (dlg._propsResult !== app.result) {
        if (dlg._propsResult) { try { compute(); } catch (e) { console.warn(e); } }
        dlg._propsResult = app.result;
        for (const re of Object.values(dlg.rowEls || {})) { try { re.update(); } catch { /* ignore */ } }
      }
    },
    commit() { return null; },
  });
}
