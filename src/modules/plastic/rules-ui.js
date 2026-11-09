// Manage Plastic Rules (FusionManagePlasticRuleCommand), Edit / New Plastic Rule, and Assign Plastic
// Rule (FusionAssignPlasticRuleCommand). Design rules change through app.mutate (undoable); the
// library is kept per browser (localStorage, wrapped in try/catch).
import * as RU from "./rules.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const h = (tag, attrs = {}, html = "") => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : String(v));
  if (html) e.innerHTML = html;
  return e;
};
const SVG = {
  edit: '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 13l.6-3L10.8 2.8l2.4 2.4L6 12.4z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M9.6 4l2.4 2.4" stroke="currentColor" stroke-width="1.2"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 16 16"><rect x="5" y="5" width="8.5" height="8.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3 10.5V3.5a1 1 0 0 1 1-1h6.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  del: '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 4.5h10M6.2 4.5V3h3.6v1.5M4.4 4.5l.7 9h5.8l.7-9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  star: '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M8 2.2l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11l-3.5 1.9.8-3.9-2.9-2.7 3.9-.5z" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
  caret: '<svg width="10" height="10" viewBox="0 0 16 16"><path d="M3.6 5.4h8.8L8 10.9z" fill="currentColor"/></svg>',
};

/** "1.50 mm" style display of a rule value (expression shown when it uses Thickness). */
function shown(r, key, kind) {
  const v = RU.ruleValues(r)[key];
  if (!Number.isFinite(v)) return "?";
  const inch = r.units === "in" && kind === "length";
  const txt = kind === "angle" ? `${v.toFixed(1)} deg` : inch ? `${(v / 25.4).toFixed(3)} in` : `${v.toFixed(2)} mm`;
  return /Thickness/.test(String(r[key])) ? `${txt} (${r[key]})` : txt;
}

/** Rule details block (Physical Material, values) used by Manage and Assign. */
export function detailsHtml(r) {
  if (!r) return "";
  const row = (k, v) => `<div class="pl-det-row"><span class="pl-det-k">${esc(k)}</span><span class="pl-det-v">${esc(v)}</span></div>`;
  let html = row("Physical Material", RU.materialName(r.material));
  html += row("Thickness", shown(r, "thickness", "length"));
  html += row("Draft Angle", shown(r, "draftAngle", "angle"));
  html += row("Thickness Range", `${shown(r, "minimumThickness", "length")} - ${shown(r, "maximumThickness", "length")}`);
  for (const [k, label, kind] of RU.RULE_FIELDS.slice(4)) html += row(label, shown(r, k, kind));
  html += row("Units", r.units === "in" ? "in" : "mm");
  return html;
}

export function createRulesUI(app) {
  const modals = () => app.ui.modals;
  let manage = null; // open Manage Plastic Rules handle

  // ------------------------------------------------------------ Edit / New Plastic Rule
  function editRule(base, { title = "Edit Plastic Rule", taken = [] } = {}) {
    return new Promise((resolve) => {
      const M = modals();
      if (!M) { resolve(null); return; }
      const r = { ...base };
      const body = h("div", { class: "pl-edit" });
      const field = (label, ctl) => { const row = h("div", { class: "pl-edit-row" }); row.append(h("label", {}, esc(label)), ctl); body.appendChild(row); return ctl; };
      const name = field("Name", h("input", { type: "text", "data-input": "name", value: r.name }));
      const mat = field("Physical Material", h("select", { "data-input": "material" }, RU.PLASTIC_MATERIALS.map(([id, n]) => `<option value="${esc(id)}"${id === r.material ? " selected" : ""}>${esc(n)}</option>`).join("")));
      const inputs = {};
      for (const [k, label] of RU.RULE_FIELDS) inputs[k] = field(label, h("input", { type: "text", "data-input": k, value: r[k] ?? "" }));
      field("Units", h("span", { class: "pl-units" }, r.units === "in" ? "in" : "mm"));
      const msg = h("div", { class: "pl-edit-msg" });
      body.appendChild(msg);
      let handle = null;
      const validate = () => {
        r.name = name.value.trim();
        r.material = mat.value;
        for (const [k] of RU.RULE_FIELDS) r[k] = inputs[k].value.trim();
        const v = RU.ruleValues(r);
        for (const [k] of RU.RULE_FIELDS) inputs[k].classList.toggle("bad", !Number.isFinite(v[k]));
        let err = RU.ruleError(r);
        if (!err && taken.includes(r.name)) err = "A plastic rule with this name already exists";
        msg.textContent = err || "";
        const ok = handle && handle.button("ok");
        if (ok) ok.disabled = !!err;
        return !err;
      };
      body.addEventListener("input", validate);
      body.addEventListener("change", validate);
      handle = M.open({
        id: "PlasticRuleEdit", title, body, width: 380, focus: '[data-input="name"]',
        buttons: [
          { action: "ok", label: "OK", primary: true, onClick: () => (validate() ? undefined : false) },
          { action: "cancel", label: "Cancel" },
        ],
        onClose: (reason) => resolve(reason === "ok" ? r : null),
      });
      validate();
    });
  }

  // ------------------------------------------------------------ Manage Plastic Rules
  function openManage() {
    const M = modals();
    if (!M) { app.toast("Manage Plastic Rules needs the menus module", "warning"); return null; }
    if (manage && !manage.closed) manage.close("replaced");
    let sel = { sec: "design", id: null };
    const body = h("div", { class: "pl-mpr" });
    const list = h("div", { class: "pl-mpr-list" });
    const det = h("div", { class: "pl-mpr-details" });
    body.append(list, det);
    const collapsed = { design: false, library: false };
    const render = () => {
      const design = RU.designRules(app.doc);
      const lib = RU.library();
      const defId = RU.libraryDefaultId();
      if (!sel.id || !(sel.sec === "design" ? design : lib).some((r) => r.id === sel.id)) {
        sel = design.length ? { sec: "design", id: design[0].id } : { sec: "library", id: defId };
      }
      list.innerHTML = "";
      for (const [sec, label, rules] of [["design", "In This Design", design], ["library", "Library", lib]]) {
        const s = h("div", { class: `pl-sec${collapsed[sec] ? " collapsed" : ""}`, "data-sec": sec });
        const head = h("div", { class: "pl-sec-head" }, `<span class="pl-caret">${SVG.caret}</span>${esc(label)}`);
        head.addEventListener("click", () => { collapsed[sec] = !collapsed[sec]; render(); });
        s.appendChild(head);
        if (!rules.length) s.appendChild(h("div", { class: "pl-empty" }, sec === "design" ? "No plastic rules in this design" : "No rules"));
        for (const r of rules) {
          const used = sec === "design" && RU.ruleUsers(app.doc, r.id).length > 0;
          const isDef = sec === "library" && r.id === defId;
          const row = h("div", { class: `pl-rule${sel.sec === sec && sel.id === r.id ? " sel" : ""}`, "data-rule": r.id, "data-sec": sec, title: r.name });
          row.innerHTML = `<span class="pl-rule-name">${esc(r.name)}</span>${isDef ? '<span class="pl-badge">Default</span>' : ""}${used ? '<span class="pl-badge used">In Use</span>' : ""}<span class="pl-acts">`
            + `<button type="button" data-act="edit" title="Edit">${SVG.edit}</button>`
            + `<button type="button" data-act="copy" title="${sec === "design" ? "Save to Library" : "Copy to Design"}">${SVG.copy}</button>`
            + (sec === "library" ? `<button type="button" data-act="default" title="Set as Default"${isDef ? " disabled" : ""}>${SVG.star}</button>` : "")
            + `<button type="button" data-act="delete" title="Delete"${used || isDef ? " disabled" : ""}>${SVG.del}</button></span>`;
          row.addEventListener("click", (ev) => {
            const b = ev.target.closest("button[data-act]");
            sel = { sec, id: r.id };
            if (b && !b.disabled) act(b.dataset.act, sec, r);
            else render();
          });
          s.appendChild(row);
        }
        list.appendChild(s);
      }
      const cur = (sel.sec === "design" ? design : lib).find((r) => r.id === sel.id);
      det.innerHTML = cur ? `<div class="pl-det-title">Rule Details: ${esc(cur.name)}</div>${detailsHtml(cur)}` : "";
    };
    const act = async (what, sec, r) => {
      const design = RU.designRules(app.doc);
      const lib = RU.library();
      if (what === "edit") {
        const others = (sec === "design" ? design : lib).filter((x) => x.id !== r.id).map((x) => x.name);
        const nr = await editRule(r, { taken: others });
        if (!nr) return render();
        if (sec === "design") {
          app.mutate("Edit Plastic Rule", (doc) => {
            const P = RU.ensurePlastic(doc);
            const i = P.rules.findIndex((x) => x.id === r.id);
            if (i >= 0) P.rules[i] = { ...nr, id: r.id };
            RU.rederive(doc, r.id);
            for (const c of RU.ruleUsers(doc, r.id)) assignMaterial(doc, c, nr.material);
          });
        } else RU.saveLibrary(lib.map((x) => (x.id === r.id ? { ...nr, id: r.id } : x)));
      } else if (what === "copy") {
        if (sec === "design") RU.saveLibrary([...lib, { ...r, id: RU.newRuleId(), name: RU.uniqueName(lib, r.name) }]);
        else {
          app.mutate("Copy Plastic Rule", (doc) => {
            const P = RU.ensurePlastic(doc);
            const id = P.rules.some((x) => x.id === r.id) ? RU.newRuleId() : r.id;
            P.rules.push({ ...r, id, name: RU.uniqueName(P.rules, r.name) });
          }, { recompute: false });
          sel = { sec: "design", id: null };
        }
      } else if (what === "default") RU.saveLibrary(lib, r.id);
      else if (what === "delete") {
        if (sec === "design") {
          if (RU.ruleUsers(app.doc, r.id).length) { app.toast("This plastic rule is assigned to a component and cannot be deleted", "warning"); return; }
          app.mutate("Delete Plastic Rule", (doc) => { const P = RU.ensurePlastic(doc); P.rules = P.rules.filter((x) => x.id !== r.id); }, { recompute: false });
        } else {
          if (r.id === RU.libraryDefaultId()) { app.toast("The default library rule cannot be deleted", "warning"); return; }
          RU.saveLibrary(lib.filter((x) => x.id !== r.id));
        }
      }
      render();
    };
    const newBtn = h("button", { type: "button", class: "mn-btn pl-new", "data-action": "new" }, "New Plastic Rule");
    newBtn.addEventListener("click", async () => {
      const design = RU.designRules(app.doc);
      const base = (sel.sec === "design" ? design : RU.library()).find((x) => x.id === sel.id) || RU.effectiveRule(app.doc);
      const target = sel.sec === "library" ? RU.library() : design;
      const nr = await editRule({ ...base, id: RU.newRuleId(), name: RU.uniqueName(target, `${base.name}`) }, { title: "New Plastic Rule", taken: target.map((x) => x.name) });
      if (!nr) return;
      if (sel.sec === "library") { RU.saveLibrary([...RU.library(), nr]); sel = { sec: "library", id: nr.id }; }
      else { app.mutate("New Plastic Rule", (doc) => { RU.ensurePlastic(doc).rules.push(nr); }, { recompute: false }); sel = { sec: "design", id: nr.id }; }
      render();
    });
    const off = app.on("doc", () => { if (manage && !manage.closed) render(); });
    manage = M.open({
      id: "FusionManagePlasticRuleCommand", title: "Manage Plastic Rules", body, width: 620, footLeft: newBtn,
      buttons: [{ action: "ok", label: "Close", primary: true }],
      onClose: () => { off(); manage = null; },
    });
    render();
    return manage;
  }

  /** Physical material of the bodies of a component (root: every body) follows its rule. */
  function assignMaterial(doc, comp, material) {
    if (!material) return;
    const ofComp = componentBodies(app, doc, comp);
    for (const id of ofComp) if (doc.bodies[id]) doc.bodies[id].material = material;
  }

  // ------------------------------------------------------------ Assign Plastic Rule
  function openAssign(opts = {}) {
    const D = app.ui.dialog;
    if (!D) return null;
    const design = RU.designRules(app.doc);
    const lib = RU.library();
    const options = [
      ...design.map((r) => ({ value: r.id, label: r.name })),
      ...lib.filter((r) => !design.some((d) => d.id === r.id)).map((r) => ({ value: r.id, label: `${r.name} (Library)` })),
    ];
    const pre = (opts.preselect || []).map((r) => toOccRef(app, r)).filter(Boolean).slice(0, 1);
    const comp0 = pre.length ? compOfOcc(app, pre[0].occ) : activeComponent(app);
    const cur = RU.assignedRuleId(app.doc, comp0) || RU.libraryDefaultId();
    return D.open({
      id: "FusionAssignPlasticRuleCommand",
      title: "Assign Plastic Rule",
      icon: "FusionAssignPlasticRuleCommand",
      featureLabel: "Assign Plastic Rule",
      help: "Assigns a plastic rule to a component to automatically control the properties of plastic features, like physical material and thickness.",
      preview: false, noFeature: true, ctrlWidth: 160,
      preselect: pre,
      activate: false,
      values: { rule: options.some((o) => o.value === cur) ? cur : (options[0] || {}).value },
      rows: [
        { id: "component", type: "selection", label: "Component", kinds: ["occurrence", "body", "face"], min: 0, max: 1, mapRef: (r) => toOccRef(app, r),
          prompt: "Select a component in the browser or canvas", tooltip: "Select a component in the browser, or a body of it in the canvas. With no selection the rule goes to the root component.",
          selText: (n, dlg) => compLabel(app, n ? compOfOcc(app, dlg.values.component[0].occ) : "root") },
        { id: "rule", type: "dropdown", label: "Plastic Rule", options, tooltip: "Select a plastic rule" },
        { id: "details", type: "custom", label: "Rule Details", render: () => h("div", { class: "pl-assign-det" }), update: (el, dlg) => { el.innerHTML = `<div class="pl-det-title">Rule Details:</div>${detailsHtml(RU.findRule(app.doc, dlg.values.rule))}`; } },
      ],
      prompt: () => "Select a plastic rule",
      commit(f, dlg) {
        const ruleId = dlg.values.rule;
        const r = RU.findRule(app.doc, ruleId);
        if (!r) throw new Error("Select a plastic rule");
        const comp = (dlg.values.component || []).length ? compOfOcc(app, dlg.values.component[0].occ) : "root";
        app.mutate("Assign Plastic Rule", (doc) => {
          const P = RU.ensurePlastic(doc);
          if (!P.rules.some((x) => x.id === r.id)) P.rules.push({ ...r });
          P.assign[comp] = r.id;
          assignMaterial(doc, comp, r.material);
          RU.rederive(doc, r.id, { comp });
        });
        app.toast(`${r.name} assigned to ${compLabel(app, comp)}`, "info", 2500);
      },
    });
  }

  return { openManage, openAssign, editRule, detailsHtml };
}

// ---------------------------------------------------------------- components (app.components contract)
// Rules belong to components (doc.components ids; "root" = the design). A body belongs to the component of the
// occurrence that owns it (app.components.ownerOf); without the components module everything is the root.
const ROOT = "root";
/** Occurrence that owns a body. */
export function occOfBody(app, bodyId) {
  try { const C = app.components; if (C && typeof C.ownerOf === "function") return C.ownerOf(bodyId) || ROOT; } catch { /* root */ }
  return ROOT;
}
/** Component id of an occurrence ("root" for the root). */
export function compOfOcc(app, oid) {
  if (!oid || oid === ROOT) return ROOT;
  try { const i = app.components.info(oid); return (i && i.component) || ROOT; } catch { return ROOT; }
}
export const componentOfBody = (app, bodyId) => compOfOcc(app, occOfBody(app, bodyId));
/** Component of the active occurrence (new features belong to it). */
export const activeComponent = (app) => compOfOcc(app, app.doc && app.doc.activeOcc);
/** Selection ref -> occurrence ref (a body or face picks the occurrence that owns it). */
function toOccRef(app, r) {
  if (!r) return null;
  if (r.kind === "occurrence") return { kind: "occurrence", occ: r.occ || ROOT };
  if (r.body) return { kind: "occurrence", occ: occOfBody(app, r.body) };
  return null;
}
export function componentBodies(app, doc, comp) {
  return Object.keys(doc.bodies || {}).filter((id) => componentOfBody(app, id) === comp);
}
export function compLabel(app, comp) {
  if (comp === ROOT) return (app.doc && app.doc.name) || "Root Component";
  const c = app.doc && app.doc.components && app.doc.components[comp];
  return (c && c.name) || comp;
}
