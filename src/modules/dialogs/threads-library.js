// Manage Threads Library (FusionManageThreadsLibraryCommand). Real Fusion keeps custom threads in a hub
// library; here the library is local (threads.js: localStorage plus files). The dialog adds, edits, copies
// and deletes custom thread types and their items (size, designation, class, gender, pitch, diameters);
// the standard ISO Metric profile can be copied as a start. OK saves, Cancel discards. Import reads this
// app's JSON or Fusion's thread XML (ThreadType / ThreadSize / Designation / Thread); Export writes JSON.
import { threadLibrary, saveThreadLibrary, threadTypeErrors, cleanThreadType, isoItems, THREAD_TYPES } from "./threads.js";

const ISO = "iso";
const COLS = [["size", "Size", 44], ["designation", "Designation", 84], ["cls", "Class", 40], ["gender", "Gender", 64], ["pitch", "Pitch", 44], ["major", "Major Dia", 52], ["minor", "Minor Dia", 52]];
const CSS = `
.tlib{display:flex;flex-direction:column;gap:6px;font-size:12px}
.tlib-bar{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.tlib-bar button{font:inherit;padding:2px 8px;border:1px solid #b9b9b9;background:#fff;border-radius:2px;cursor:pointer}
.tlib-bar button:hover:not(:disabled){border-color:#0696d7}
.tlib-bar button:disabled{color:#aaa;cursor:default}
.tlib-props{display:grid;grid-template-columns:auto 1fr auto auto auto auto;gap:4px;align-items:center}
.tlib input,.tlib select{font:inherit;border:1px solid #c8c8c8;border-radius:2px;padding:1px 3px;min-width:0;box-sizing:border-box}
.tlib-grid{max-height:210px;overflow:auto;border:1px solid #d6d6d6}
.tlib-grid table{border-collapse:collapse;width:100%}
.tlib-grid th{position:sticky;top:0;background:#f2f2f2;font-weight:normal;color:#555;text-align:left;padding:2px 3px;border-bottom:1px solid #d6d6d6}
.tlib-grid td{padding:1px 2px;border-bottom:1px solid #eee;white-space:nowrap}
.tlib-grid td input,.tlib-grid td select{width:100%}
.tlib-grid tr.std td{color:#444;padding:2px 4px}
.tlib-act{cursor:pointer;color:#0696d7;padding:0 3px}
.tlib-err{color:#c0392b;min-height:14px;white-space:normal}
.tlib-note{color:#777}`;

function ensureCss() {
  if (typeof document === "undefined" || document.getElementById("tlib-css")) return;
  const s = document.createElement("style");
  s.id = "tlib-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === "class") e.className = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const uniqueName = (base, list) => { let n = base, k = 2; while (n === THREAD_TYPES[0].value || list.some((t) => t.name === n)) n = `${base} ${k++}`; return n; };

/** Thread types of a Fusion thread XML file (one ThreadType per file). */
export function parseThreadXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("The file is not valid XML");
  const kid = (el, tag) => { for (const c of el.children) if (c.tagName === tag) return c.textContent.trim(); return ""; };
  const out = [];
  for (const tt of doc.getElementsByTagName("ThreadType")) {
    const unit = kid(tt, "Unit") === "in" ? "in" : "mm";
    const items = [];
    for (const ts of tt.getElementsByTagName("ThreadSize")) {
      const size = kid(ts, "Size");
      for (const d of ts.getElementsByTagName("Designation")) {
        const tpi = Number.parseFloat(kid(d, "TPI"));
        const pitch = Number.parseFloat(kid(d, "Pitch")) || (tpi > 0 ? 1 / tpi : NaN);
        for (const th of d.getElementsByTagName("Thread")) {
          items.push({ size, designation: kid(d, "ThreadDesignation") || kid(d, "CTD"), cls: kid(th, "Class"), gender: kid(th, "Gender") === "internal" ? "internal" : "external", pitch, major: Number.parseFloat(kid(th, "MajorDia")), minor: Number.parseFloat(kid(th, "MinorDia")) });
        }
      }
    }
    const t = cleanThreadType({ name: kid(tt, "CustomName") || kid(tt, "Name"), unit, angle: kid(tt, "Angle"), items });
    if (t) out.push(t);
  }
  return out;
}
/** Thread types of an imported file's text (this app's JSON or Fusion's XML). */
export function parseThreadFile(text) {
  const s = String(text || "").trim();
  if (s.startsWith("<")) return parseThreadXml(s);
  const v = JSON.parse(s);
  const list = Array.isArray(v) ? v : Array.isArray(v && v.types) ? v.types : v && v.items ? [v] : [];
  return list.map(cleanThreadType).filter(Boolean);
}

export function openThreadsLibrary(app) {
  ensureCss();
  const work = threadLibrary().map(clone);
  const iso = { name: THREAD_TYPES[0].value, unit: "mm", angle: 60, items: isoItems(), standard: true };
  const typeOptions = () => [{ value: ISO, label: `${iso.name} (standard)` }, ...work.map((t, i) => ({ value: "c" + i, label: t.name || "(unnamed)" }))];
  const curOf = (dlg) => { const v = dlg.values.threadType; return v === ISO ? iso : work[Number(String(v).slice(1))] || iso; };
  let version = 0; // bumped on structural changes: the table is rebuilt only then (typing keeps the focus)
  const setType = (dlg, value) => {
    dlg.defs.threadType.options = typeOptions();
    if (value !== undefined) dlg.values.threadType = value;
    version++;
    const re = dlg.rowEls && dlg.rowEls.threadType;
    if (re) re.update();
    const lib = dlg.rowEls && dlg.rowEls.lib;
    if (lib) lib.update();
    if (dlg._updateOK) dlg._updateOK();
  };
  const errorsOf = () => { for (const t of work) { const e = threadTypeErrors(t, work); if (e.length) return `${t.name || "Thread type"}: ${e[0]}`; } return null; };

  return app.ui.dialog.open({
    id: "FusionManageThreadsLibraryCommand",
    title: "Threads Library",
    icon: "FusionManageThreadsLibraryCommand",
    help: "Adds and edits custom thread definitions. The Thread command offers the custom thread types. Create, customize, and share Threads (files: Import / Export).",
    preview: false, noFeature: true, activate: false,
    labelWidth: 80, ctrlWidth: 452,
    rows: [
      { id: "threadType", type: "dropdown", label: "Thread Type", options: typeOptions(), default: work.length ? "c0" : ISO },
      { id: "lib", type: "custom", render: (dlg) => render(dlg), update: (el, dlg) => fill(el, dlg) },
    ],
    onChange(id, dlg) { if (id === "threadType") { version++; dlg.rowEls.lib.update(); } },
    validate: () => errorsOf(),
    commit() {
      saveThreadLibrary(work);
      app.toast(`Threads library saved: ${work.length} custom thread type${work.length === 1 ? "" : "s"}.`, "info", 2500);
      return true;
    },
  });

  function render(dlg) {
    const el = h("div", { class: "tlib" });
    el._shown = null;
    fill(el, dlg);
    return el;
  }

  function fill(el, dlg) {
    const key = `${dlg.values.threadType}|${version}`;
    const errEl = el.querySelector(".tlib-err");
    if (el._shown === key) { if (errEl) errEl.textContent = errorsOf() || ""; return; }
    el._shown = key;
    el.replaceChildren();
    const t = curOf(dlg);
    const std = !!t.standard;
    const idx = work.indexOf(t);
    const changed = () => { const e = el.querySelector(".tlib-err"); if (e) e.textContent = errorsOf() || ""; if (dlg._updateOK) dlg._updateOK(); };
    // thread type actions
    el.append(h("div", { class: "tlib-bar" },
      h("button", { type: "button", "data-act": "newType", title: "Adds an empty custom thread type", on: { click: () => { work.push({ name: uniqueName("Custom Thread", work), unit: "mm", angle: 60, items: [{ size: "10", designation: "C10x1.5", cls: "6g", gender: "external", pitch: 1.5, major: 9.85, minor: 8.16 }] }); setType(dlg, "c" + (work.length - 1)); } } }, "New"),
      h("button", { type: "button", "data-act": "copyType", title: "Copies the thread type into a new custom type", on: { click: () => { const c = clone({ name: t.name, unit: t.unit, angle: t.angle, items: t.items }); c.name = uniqueName(`${t.name} Copy`, work); work.push(c); setType(dlg, "c" + (work.length - 1)); } } }, "Copy"),
      h("button", { type: "button", "data-act": "deleteType", disabled: std, title: "Deletes the custom thread type", on: { click: () => { if (idx < 0) return; work.splice(idx, 1); setType(dlg, work.length ? "c" + Math.min(idx, work.length - 1) : ISO); } } }, "Delete"),
      h("span", { style: "flex:1" }),
      h("button", { type: "button", "data-act": "import", title: "Imports thread types from a file (this app's JSON or a Fusion thread XML)", on: { click: () => importFile(dlg) } }, "Import..."),
      h("button", { type: "button", "data-act": "export", disabled: !work.length, title: "Saves the custom thread types to a file", on: { click: () => exportFile() } }, "Export..."),
    ));
    // type properties
    if (std) el.append(h("div", { class: "tlib-note" }, "Standard thread type (read only). Copy it to make an editable custom type."));
    else {
      const name = h("input", { type: "text", "data-prop": "name", value: t.name, on: { input: (e) => { t.name = e.target.value; const re = dlg.rowEls.threadType; dlg.defs.threadType.options = typeOptions(); if (re) re.update(); changed(); } } });
      const unit = h("select", { "data-prop": "unit", on: { change: (e) => { t.unit = e.target.value; version++; fill(el, dlg); changed(); } } }, h("option", { value: "mm", selected: t.unit !== "in" }, "mm"), h("option", { value: "in", selected: t.unit === "in" }, "in"));
      const ang = h("input", { type: "number", "data-prop": "angle", step: "any", min: "1", value: String(t.angle), style: "width:52px", on: { input: (e) => { t.angle = Number.parseFloat(e.target.value) || 60; changed(); } } });
      el.append(h("div", { class: "tlib-props" }, h("span", {}, "Name"), name, h("span", {}, "Unit"), unit, h("span", {}, "Angle"), ang));
    }
    // items
    const u = t.unit === "in" ? "in" : "mm";
    const head = h("tr", {}, COLS.map(([k, lab, w]) => h("th", { style: `width:${w}px` }, k === "pitch" || k === "major" || k === "minor" ? `${lab} (${u})` : lab)), std ? null : h("th", { style: "width:38px" }, ""));
    const body = h("tbody");
    const max = std ? t.items.length : Infinity;
    t.items.slice(0, max).forEach((it, i) => {
      if (std) { body.append(h("tr", { class: "std" }, COLS.map(([k]) => h("td", {}, String(it[k]))))); return; }
      const cell = ([k]) => {
        if (k === "gender") return h("td", {}, h("select", { "data-col": k, on: { change: (e) => { it.gender = e.target.value; changed(); } } }, h("option", { value: "external", selected: it.gender !== "internal" }, "External"), h("option", { value: "internal", selected: it.gender === "internal" }, "Internal")));
        const numeric = k === "pitch" || k === "major" || k === "minor";
        return h("td", {}, h("input", { type: numeric ? "number" : "text", step: numeric ? "any" : undefined, "data-col": k, value: Number.isFinite(it[k]) || !numeric ? String(it[k] ?? "") : "", on: { input: (e) => { it[k] = numeric ? Number.parseFloat(e.target.value) : e.target.value.trim(); changed(); } } }));
      };
      body.append(h("tr", { "data-item": String(i) }, COLS.map(cell), h("td", {},
        h("span", { class: "tlib-act", "data-act": "copyItem", title: "Copy", on: { click: () => { t.items.splice(i + 1, 0, { ...clone(it), cls: `${it.cls}*` }); version++; fill(el, dlg); changed(); } } }, "⧉"),
        h("span", { class: "tlib-act", "data-act": "deleteItem", title: "Delete", on: { click: () => { t.items.splice(i, 1); version++; fill(el, dlg); changed(); } } }, "✕"))));
    });
    el.append(h("div", { class: "tlib-grid" }, h("table", {}, h("thead", {}, head), body)));
    if (!std) {
      el.append(h("div", { class: "tlib-bar" }, h("button", { type: "button", "data-act": "addItem", title: "Adds a thread size / designation / class", on: { click: () => { const last = t.items[t.items.length - 1]; t.items.push(last ? { ...clone(last), cls: "" } : { size: "", designation: "", cls: "", gender: "external", pitch: NaN, major: NaN, minor: NaN }); version++; fill(el, dlg); changed(); const inp = el.querySelector(`tr[data-item="${t.items.length - 1}"] input[data-col="${last ? "cls" : "size"}"]`); if (inp) inp.focus(); } } }, "Add"),
        h("span", { class: "tlib-note" }, `${t.items.length} item${t.items.length === 1 ? "" : "s"}`)));
    }
    el.append(h("div", { class: "tlib-err" }, errorsOf() || ""));
  }

  function importFile(dlg) {
    const input = h("input", { type: "file", accept: ".json,.xml,application/json,text/xml" });
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const types = parseThreadFile(await file.text());
        if (!types.length) throw new Error("No thread types found");
        for (const t of types) { if (work.some((o) => o.name === t.name) || t.name === THREAD_TYPES[0].value) t.name = uniqueName(t.name, work); work.push(t); }
        setType(dlg, "c" + (work.length - 1));
        app.toast(`Imported ${types.length} thread type${types.length === 1 ? "" : "s"} from ${file.name}.`, "info", 2500);
      } catch (e) { app.toast(`Cannot import ${file.name}: ${e.message || e}`, "error", 4000); }
    });
    input.click();
  }

  function exportFile() {
    app.download("threads-library.json", JSON.stringify({ format: "fusion-recreation-threads", version: 1, types: work.map(cleanThreadType).filter(Boolean) }, null, 1), "application/json");
  }
}
