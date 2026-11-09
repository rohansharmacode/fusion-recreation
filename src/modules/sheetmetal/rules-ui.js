// sheetmetal: SHEET METAL RULES dialog (rules in this design + library), the rule editor and the
// SHEET METAL RULES LIBRARY dialog (Fusion's default rules + local library rules in localStorage).
import * as R from "./rules.js";

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
};
const ICON = {
  edit: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 12l.6-2.6L9.5 2.5l2 2-6.9 6.9z" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
  dup: '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1.5" y="4" width="8" height="8.5" fill="none" stroke="currentColor"/><path d="M4.5 4V1.5h8v8.5H9.5" fill="none" stroke="currentColor"/></svg>',
  del: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 4h8l-.7 8.5H3.7zM2 3.5h10M5.5 3.5V2h3v1.5" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
  star: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1.6l1.6 3.4 3.7.4-2.8 2.5.8 3.6L7 9.7l-3.3 1.8.8-3.6L1.7 5.4l3.7-.4z" fill="currentColor"/></svg>',
  starOff: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1.6l1.6 3.4 3.7.4-2.8 2.5.8 3.6L7 9.7l-3.3 1.8.8-3.6L1.7 5.4l3.7-.4z" fill="none" stroke="currentColor"/></svg>',
  lib: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2.5h3v9H2zM6 2.5h3v9H6zM10 3l2.4-.6 2 8.7-2.4.6z" fill="none" stroke="currentColor"/></svg>',
  add: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.3"/></svg>',
};
const iconBtn = (name, title, act, onclick, disabled) => h("button", { type: "button", class: "smr-ib", title, "data-act": act, html: ICON[name], disabled: !!disabled, onclick });

/** Bump every sheet metal feature so cached evaluations re-run with the new rule values. */
export function bumpSheetFeatures(doc) {
  for (const f of doc.features) if (/^sm[A-Z]/.test(f.type)) f.rv = (f.rv || 0) + 1;
}
function usedRuleIds(app) {
  const ids = new Set();
  const st = app.result && app.result.state;
  if (st && st.smData instanceof Map) for (const d of st.smData.values()) if (d.rule) ids.add(d.rule);
  for (const f of app.doc.features) if (f.type === "smBaseFlange" && f.rule) ids.add(f.rule);
  return ids;
}
const numOr = (app, rule) => { try { return R.evalRule(rule, app.M.buildParams(app.doc)); } catch { return null; } };
const fmt = (v, u = "mm") => (v === null || v === undefined || !Number.isFinite(v) ? "-" : u === "in" ? `${(v / 25.4).toFixed(3)} in` : `${v.toFixed(2)} mm`);

// ---------------------------------------------------------------- SHEET METAL RULES
export function openRulesDialog(app) {
  const modals = app.ui.modals;
  if (!modals) { app.toast("Dialogs are not available", "error"); return null; }
  const body = h("div", { class: "smr-body" });
  let handle = null;
  const render = () => {
    body.innerHTML = "";
    const sm = R.smDoc(app.doc);
    const used = usedRuleIds(app);
    body.append(h("div", { class: "smr-sec", text: "In this design" }));
    const list = h("div", { class: "smr-list", "data-list": "design" });
    for (const r of sm.rules) {
      const n = numOr(app, r);
      const isDef = r.id === sm.active;
      list.append(h("div", { class: `smr-row${isDef ? " smr-default" : ""}`, "data-rule": r.id, title: isDef ? "Default rule for new sheet metal bodies" : "" },
        h("span", { class: "smr-name", text: r.name }),
        h("span", { class: "smr-num", text: n ? `${fmt(n.T, r.units)} | K ${n.K.toFixed(2)}` : "invalid" }),
        h("span", { class: "smr-acts" },
          iconBtn(isDef ? "star" : "starOff", isDef ? "Default rule" : "Set as default", "default", () => setDefault(r.id), isDef),
          iconBtn("edit", "Edit Rule", "edit", () => editRule(app, r, { design: true, onDone: render })),
          iconBtn("dup", "Duplicate and edit rule", "duplicate", () => editRule(app, { ...R.copyRule(r), id: R.newRuleId(), name: R.uniqueName(sm.rules.map((x) => x.name), `${r.name} copy`) }, { design: true, isNew: true, onDone: render })),
          iconBtn("lib", "Copy to Library", "to-library", () => { const lib = R.userLibrary(); const c = R.copyRule(r); c.id = R.newRuleId("L"); c.name = R.uniqueName(R.libraryRules().map((x) => x.name), r.name); lib.push(c); R.saveUserLibrary(lib); app.toast(`"${c.name}" was copied to the library`, "info", 2200); render(); }),
          iconBtn("del", used.has(r.id) || isDef ? "A rule that is in use can't be deleted" : "Delete", "delete", () => delRule(r.id), used.has(r.id) || isDef || sm.rules.length < 2))));
    }
    body.append(list);
    body.append(h("div", { class: "smr-sec", text: "Library" }));
    const lib = h("div", { class: "smr-list", "data-list": "library" });
    for (const r of R.libraryRules()) {
      const n = numOr(app, r);
      const inDesign = sm.rules.some((x) => x.id === r.id);
      lib.append(h("div", { class: "smr-row", "data-rule": r.id },
        h("span", { class: "smr-name", text: r.name }),
        h("span", { class: "smr-num", text: n ? `${fmt(n.T, r.units)} | K ${n.K.toFixed(2)}` : "invalid" }),
        h("span", { class: "smr-acts" },
          iconBtn("add", inDesign ? "Already in this design" : "Copy to this design", "to-design", () => addToDesign(r, false), inDesign),
          iconBtn("star", "Copy to this design and set as default", "use", () => addToDesign(r, true)))));
    }
    body.append(lib);
  };
  const mutateRules = (label, fn) => {
    try { app.mutate(label, (doc) => { const sm = R.ensureDoc(doc); fn(sm, doc); bumpSheetFeatures(doc); }); } catch (e) { app.reportError ? app.reportError(e, { where: "sheet metal rules" }) : app.toast(String(e.message || e), "error"); }
    render();
  };
  const setDefault = (id) => mutateRules("Set Default Sheet Metal Rule", (sm) => { sm.active = id; });
  const delRule = (id) => mutateRules("Delete Sheet Metal Rule", (sm) => { sm.rules = sm.rules.filter((r) => r.id !== id); if (!sm.rules.some((r) => r.id === sm.active)) sm.active = sm.rules[0].id; });
  const addToDesign = (r, makeDefault) => mutateRules(makeDefault ? "Use Sheet Metal Rule" : "Copy Sheet Metal Rule", (sm) => {
    if (!sm.rules.some((x) => x.id === r.id)) { const c = R.copyRule(r); delete c.builtin; delete c.user; sm.rules.push(c); }
    if (makeDefault) sm.active = r.id;
  });
  render();
  const foot = h("div", {}, h("button", { type: "button", class: "mn-btn smr-new", "data-sm": "new-rule", text: "New Rule", onclick: () => {
    const sm = R.smDoc(app.doc);
    const base = sm.rules.find((r) => r.id === sm.active) || R.defaultRule();
    editRule(app, { ...R.copyRule(base), id: R.newRuleId(), name: R.uniqueName(sm.rules.map((x) => x.name), "Sheet Metal Rule 1"), builtin: undefined }, { design: true, isNew: true, onDone: render });
  } }));
  handle = modals.open({ id: "FusionSheetMetalRulesCommand", title: "SHEET METAL RULES", body, width: 470, footLeft: foot, buttons: [{ action: "ok", label: "Close", primary: true }] });
  const offDoc = app.on("doc", () => { if (body.isConnected) render(); else offDoc(); });
  return handle;
}

// ---------------------------------------------------------------- rule editor
const FIELDS = [
  ["name", "Rule Name", "text"],
  ["thickness", "Thickness", "expr"],
  ["kFactor", "K Factor", "expr"],
  ["miterGap", "Miter gap", "expr"],
  ["-", "Bend Conditions"],
  ["bendRadius", "Bend radius", "expr"],
  ["reliefShape", "Relief shape", R.RELIEF_SHAPES],
  ["reliefWidth", "Relief width", "expr"],
  ["reliefDepth", "Relief depth", "expr"],
  ["reliefRemnant", "Relief remnant", "expr"],
  ["-", "Corner Conditions"],
  ["corner2Shape", "2-Bend Intersection", R.CORNER2_SHAPES],
  ["corner2Size", "Relief size", "expr"],
  ["corner2Placement", "Relief placement", R.CORNER2_PLACEMENTS],
  ["corner3Shape", "3-Bend Intersection", R.CORNER3_SHAPES],
  ["corner3Radius", "Relief radius", "expr"],
];
export function editRule(app, rule0, { design = false, library = false, isNew = false, onDone } = {}) {
  const modals = app.ui.modals;
  const rule = R.copyRule(rule0);
  const readOnly = !!rule0.builtin && !isNew;
  const body = h("div", { class: "smr-edit" });
  const inputs = {};
  const errEls = {};
  for (const [key, label, kind] of FIELDS) {
    if (key === "-") { body.append(h("div", { class: "smr-sec", text: label })); continue; }
    let input;
    if (Array.isArray(kind)) {
      input = h("select", { class: "mn-select", "data-field": key, disabled: readOnly }, ...kind.map((o) => h("option", { value: o, text: o, selected: rule[key] === o })));
    } else {
      input = h("input", { class: "mn-input", "data-field": key, value: rule[key] ?? "", disabled: readOnly, spellcheck: "false" });
    }
    inputs[key] = input;
    errEls[key] = h("div", { class: "smr-err" });
    body.append(h("label", { class: "smr-field" }, h("span", { class: "smr-flabel", text: label }), input), errEls[key]);
    input.addEventListener("input", () => validate());
    input.addEventListener("change", () => validate());
  }
  const P = (() => { try { return app.M.buildParams(app.doc); } catch { return null; } })();
  const read = () => { const r = { ...rule }; for (const [k, el] of Object.entries(inputs)) r[k] = el.value; return r; };
  let handle = null;
  function validate() {
    const r = read();
    const errs = R.ruleErrors(r, P);
    if (!String(r.name || "").trim()) errs.name = "Enter a name";
    for (const [k, el] of Object.entries(errEls)) { el.textContent = errs[k] || ""; inputs[k].classList.toggle("mn-invalid", !!errs[k]); }
    const ok = !Object.keys(errs).length;
    if (handle && handle.button) { const b = handle.button("ok"); if (b) b.disabled = readOnly || !ok; }
    return ok;
  }
  const title = readOnly ? "SHEET METAL RULE" : isNew ? "NEW RULE" : "EDIT RULE";
  handle = modals.open({
    id: "SheetMetalRuleEditor", title, body, width: 380,
    buttons: [{ action: "cancel", label: "Cancel" }, { action: "ok", label: "OK", primary: true, onClick: () => {
      if (!validate()) return false;
      const r = read();
      delete r.builtin; delete r.user;
      if (design) {
        try {
          app.mutate(isNew ? "New Sheet Metal Rule" : "Edit Sheet Metal Rule", (doc) => {
            const sm = R.ensureDoc(doc);
            const i = sm.rules.findIndex((x) => x.id === r.id);
            if (i >= 0) sm.rules[i] = r; else sm.rules.push(r);
            bumpSheetFeatures(doc);
          });
        } catch (e) { app.toast(String(e.message || e), "error"); return false; }
      } else if (library) {
        const lib = R.userLibrary();
        const i = lib.findIndex((x) => x.id === r.id);
        if (i >= 0) lib[i] = r; else lib.push(r);
        if (!R.saveUserLibrary(lib)) app.toast("The library could not be saved in this browser", "warning");
      }
      if (onDone) onDone(r);
      return true;
    } }],
  });
  validate();
  return handle;
}

// ---------------------------------------------------------------- SHEET METAL RULES LIBRARY
export function openLibraryDialog(app) {
  const modals = app.ui.modals;
  if (!modals) return null;
  const body = h("div", { class: "smr-body" });
  const render = () => {
    body.innerHTML = "";
    body.append(h("div", { class: "smr-sec", text: "Library" }));
    const list = h("div", { class: "smr-list", "data-list": "library" });
    for (const r of R.libraryRules()) {
      const n = numOr(app, r);
      list.append(h("div", { class: "smr-row", "data-rule": r.id },
        h("span", { class: "smr-name", text: r.name + (r.builtin ? "" : "") }),
        h("span", { class: "smr-num", text: n ? `${fmt(n.T, r.units)} | K ${n.K.toFixed(2)}` : "invalid" }),
        h("span", { class: "smr-acts" },
          iconBtn("edit", r.builtin ? "View rule (default rules are read only)" : "Edit Rule", "edit", () => editRule(app, r, { library: true, onDone: render })),
          iconBtn("dup", "Duplicate and edit rule", "duplicate", () => editRule(app, { ...R.copyRule(r), id: R.newRuleId("L"), name: R.uniqueName(R.libraryRules().map((x) => x.name), `${r.name} copy`) }, { library: true, isNew: true, onDone: render })),
          iconBtn("del", r.builtin ? "Default rules can't be deleted" : "Delete", "delete", () => { R.saveUserLibrary(R.userLibrary().filter((x) => x.id !== r.id)); render(); }, r.builtin))));
    }
    body.append(list);
    body.append(h("div", { class: "smr-note", text: "Library rules are kept in this browser. Copy a rule into a design from Sheet Metal Rules." }));
  };
  render();
  const foot = h("div", {}, h("button", { type: "button", class: "mn-btn smr-new", "data-sm": "new-rule", text: "New Rule", onclick: () => editRule(app, { ...R.defaultRule(), id: R.newRuleId("L"), name: R.uniqueName(R.libraryRules().map((x) => x.name), "Library Rule") }, { library: true, isNew: true, onDone: render }) }));
  return modals.open({ id: "FusionSheetMetalRulesLibraryCommand", title: "SHEET METAL RULES LIBRARY", body, width: 470, footLeft: foot, buttons: [{ action: "ok", label: "Close", primary: true }] });
}
