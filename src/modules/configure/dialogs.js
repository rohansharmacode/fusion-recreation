// The Configure dialog (check the aspects of one feature / object to add them as table columns) and the
// Parameters dialog in Configuration Mode (check parameters in the "Configured" column).
import * as D from "./data.js";
import { G } from "./glyphs.js";

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
};

/**
 * Configure dialog for a timeline feature ({kind:'feature', id}) or a browser object ({kind:'body', id}).
 * Docked like Fusion's command dialogs; OK adds checked aspects as columns and removes unchecked ones.
 */
export function openConfigure(app, ctl, target) {
  const doc = app.doc;
  const aspects = D.aspectsFor(doc, target, app.M);
  const obj = target.kind === "body" ? doc.bodies[target.id] : app.feature(target.id);
  if (!obj) return null;
  if (!aspects.length) { app.toast(`${obj.name} has no configurable aspects`, "info"); return null; }
  const values = {};
  aspects.forEach((a, i) => { values[`a${i}`] = D.isAspectConfigured(doc, a); });
  const dlgApi = app.ui.dialog;
  const id = target.kind === "body" ? "ConfigureEntityCmd" : "ConfigureFeatureCmd";
  if (!dlgApi || !dlgApi.open) {
    // no dialog framework (stubbed build): configure every unconfigured aspect directly
    const want = aspects.map((a, i) => values[`a${i}`] || i === aspects.length - 1);
    ctl.setAspects(target, aspects, want);
    return null;
  }
  const rows = [{ id: "object", type: "text", label: target.kind === "body" ? "Body" : "Feature", text: () => obj.name }];
  aspects.forEach((a, i) => {
    const sep = i > 0 && !a.param && aspects[i - 1].param;
    rows.push({ id: `a${i}`, type: "check", label: a.param && a.sub !== a.label ? `${a.label} (${a.sub})` : a.label, tooltip: a.tip, sep: i === 0 || sep });
  });
  return dlgApi.open({
    id,
    title: "Configure",
    icon: "FusionStartDesignConfigModeCmd",
    featureLabel: `Configure ${obj.name}`,
    help: "Check an aspect to add it to the Configuration Table as a column. Uncheck it to remove the column.",
    preview: false,
    noFeature: true,
    activate: false,
    rows,
    values,
    build: () => null,
    commit: (_f, dlg) => {
      const want = aspects.map((a, i) => !!dlg.values[`a${i}`]);
      return ctl.setAspects(target, aspects, want);
    },
  });
}

/** Parameters dialog in Configuration Mode: Configured | Parameter | Name | Unit | Expression | Value. */
export function openParameters(app, ctl) {
  const modals = app.ui.modals;
  const body = h("div", { class: "cfg-pm" });
  const filter = h("input", { class: "cfg-pm-filter", type: "search", placeholder: "Filter all parameters", spellcheck: "false" });
  filter.addEventListener("keydown", (e) => e.stopPropagation());
  const tableWrap = h("div", { class: "cfg-pm-scroll" });
  body.append(h("div", { class: "cfg-pm-top" }, h("span", { class: "cfg-pm-search", html: G.search() }), filter), tableWrap);
  const collapsed = new Set();

  function rowsData() {
    const doc = app.doc;
    let P = null;
    try { P = app.M.buildParams(doc); } catch { P = null; }
    const val = (n) => { try { const v = P && P.value(n); return Number.isFinite(v) ? v : undefined; } catch { return undefined; } };
    const unit = (k) => (k === "angle" ? "deg" : k === "none" ? "" : "mm");
    const fmt = (v, k) => (v === undefined ? "" : k === "angle" ? v.toFixed(1) : v.toFixed(2));
    const user = doc.params.map((p) => ({ col: { kind: "param", user: true, name: p.name }, label: "User Parameter", name: p.name, unit: unit(p.kind || "length"), expr: String(p.expr), value: fmt(val(p.name), p.kind || "length") }));
    const groups = [];
    for (const f of doc.features) {
      const as = D.aspectsFor(doc, { kind: "feature", id: f.id }, app.M).filter((a) => a.param);
      if (!as.length) continue;
      groups.push({ feature: f, items: as.map((a) => ({ col: a.col, label: a.sub && a.sub !== a.param ? a.sub : a.label, name: a.param, unit: unit(a.kind), expr: a.expr, value: fmt(a.value, a.kind) })) });
    }
    return { user, groups };
  }
  function render() {
    const doc = app.doc;
    const q = filter.value.trim().toLowerCase();
    const match = (it) => !q || `${it.name} ${it.label} ${it.expr}`.toLowerCase().includes(q);
    const { user, groups } = rowsData();
    const t = h("table", { class: "cfg-pm-table" });
    t.append(h("thead", {}, h("tr", {},
      h("th", { class: "cfg-pm-cfg", text: "Configured", title: "Check to add the parameter to the Configuration Table" }),
      h("th", { text: "Parameter" }), h("th", { text: "Name" }), h("th", { text: "Unit" }), h("th", { text: "Expression" }), h("th", { text: "Value" }))));
    const tb = h("tbody");
    const header = (key, label, depth) => {
      const open = !collapsed.has(key);
      const tr = h("tr", { class: `cfg-pm-group${open ? "" : " closed"}`, "data-group": key },
        h("td", {}), h("td", { colspan: "5", style: `padding-left:${6 + depth * 14}px` }, h("span", { class: "cfg-pm-tog", html: open ? G.chevDown() : G.chevRight() }), h("span", { text: label })));
      tr.addEventListener("click", () => { if (open) collapsed.add(key); else collapsed.delete(key); render(); });
      tb.append(tr);
      return open;
    };
    const item = (it, depth) => {
      if (!match(it)) return;
      const checked = D.isAspectConfigured(doc, { col: it.col });
      const cb = h("input", { type: "checkbox", class: "cfg-pm-check", "data-param": it.name });
      cb.checked = checked;
      cb.addEventListener("change", () => { ctl.setParamConfigured(it.col, cb.checked); render(); });
      tb.append(h("tr", { class: "cfg-pm-row", "data-param-row": it.name },
        h("td", { class: "cfg-pm-cfg" }, cb),
        h("td", { style: `padding-left:${6 + depth * 14}px`, text: it.label }),
        h("td", { text: it.name }), h("td", { text: it.unit }), h("td", { text: it.expr }), h("td", { class: "cfg-pm-val", text: it.value })));
    };
    if (header("user", "User Parameters", 0)) { if (!user.length) tb.append(h("tr", { class: "cfg-pm-empty" }, h("td", {}), h("td", { colspan: "5", text: "No user parameters" }))); for (const it of user) item(it, 1); }
    if (header("model", "Model Parameters", 0)) {
      for (const g of groups) {
        const key = `f:${g.feature.id}`;
        if (q && !g.items.some(match)) continue;
        if (header(key, g.feature.name, 1)) for (const it of g.items) item(it, 2);
      }
    }
    t.append(tb);
    tableWrap.textContent = "";
    tableWrap.append(t);
  }
  filter.addEventListener("input", render);
  render();
  const off = app.on("doc", () => render());
  const opts = {
    id: "ConfigureParameters",
    title: "PARAMETERS",
    body,
    width: 720,
    height: 460,
    className: "cfg-pm-modal",
    footLeft: h("span", { class: "cfg-pm-info", title: "Enters Configuration Mode and opens the Parameters dialog.\n\nCheck parameters to add them to the Configuration Table.", html: G.info() }),
    buttons: [{ action: "ok", label: "OK", primary: true }],
    onClose: () => off(),
  };
  if (modals && modals.open) return modals.open(opts);
  // fallback modal (menus module stubbed out)
  const host = app.dom.overlay || document.body;
  const wrap = h("div", { class: "cfg-fallback-modal", "data-dialog": "ConfigureParameters" }, h("div", { class: "cfg-fm-title", text: "PARAMETERS" }), body);
  const ok = h("button", { type: "button", class: "cfg-fm-ok", "data-action": "ok", text: "OK" });
  ok.addEventListener("click", () => { off(); wrap.remove(); });
  wrap.append(ok);
  host.append(wrap);
  return { close: () => { off(); wrap.remove(); } };
}
