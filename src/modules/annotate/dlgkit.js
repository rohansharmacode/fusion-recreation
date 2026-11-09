// Pieces shared by the PMI command dialogs (built on app.ui.dialog, see dialogs/README.md):
// tab bar, multi-line Text box with alignment + Insert symbol, the on-canvas placement of a note
// ("Click in the canvas to anchor the note"), Change annotation plane, Units and precision,
// value groups (Modeled <x> / value / tolerance) and the commit step.
import { prepareFeature, clone } from "../../app/core.js";
import * as F from "./format.js";
import * as G from "./geom.js";

const V = G.V;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

// small original glyphs (16 px)
const GL = {
  left: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 3.5h12M2 6.5h8M2 9.5h12M2 12.5h8" stroke="currentColor" stroke-width="1.3"/></svg>',
  center: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 3.5h12M4 6.5h8M2 9.5h12M4 12.5h8" stroke="currentColor" stroke-width="1.3"/></svg>',
  right: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 3.5h12M6 6.5h8M2 9.5h12M6 12.5h8" stroke="currentColor" stroke-width="1.3"/></svg>',
  top: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 2.5h12" stroke="currentColor" stroke-width="1.3"/><path d="M5 5h6M5 7.5h6" stroke="currentColor" stroke-width="1.6"/></svg>',
  middle: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 8h12" stroke="currentColor" stroke-width="1.1" opacity=".55"/><path d="M5 6.2h6M5 9.8h6" stroke="currentColor" stroke-width="1.6"/></svg>',
  bottom: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 13.5h12" stroke="currentColor" stroke-width="1.3"/><path d="M5 8.5h6M5 11h6" stroke="currentColor" stroke-width="1.6"/></svg>',
  prev: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M8.8 3.2L5 7l3.8 3.8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  next: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M5.2 3.2L9 7l-3.8 3.8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  symbol: '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="7" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3.4 12.6l7.2-9.2" stroke="currentColor" stroke-width="1.2"/><path d="M12 10.5l1.6 1.8 1.6-1.8" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
  cursor: '<svg width="14" height="16" viewBox="0 0 14 16"><path d="M2 1.5v11l3-2.6 2 4.4 1.8-.8-2-4.3 4-.3z" fill="#fff" stroke="#222" stroke-width="1"/></svg>',
  ul: '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1"/><rect x="2.5" y="2.5" width="5" height="4" fill="currentColor"/></svg>',
  ur: '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1"/><rect x="8.5" y="2.5" width="5" height="4" fill="currentColor"/></svg>',
  ll: '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1"/><rect x="2.5" y="9.5" width="5" height="4" fill="currentColor"/></svg>',
  lr: '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1"/><rect x="8.5" y="9.5" width="5" height="4" fill="currentColor"/></svg>',
};
export { GL };

// ---------------------------------------------------------------- rows
/** Tab bar (Fusion's PMI dialogs are tabbed): tabs [{id, label, title?, visible?(dlg)}]; value in dlg.values.tab. */
export function tabsRow(tabs) {
  return {
    id: "tabs", type: "custom", flush: true,
    render(dlg) {
      const bar = h("div", "pmi-tabs");
      bar.dataset.input = "tabs";
      for (const t of tabs) {
        const b = h("button", "pmi-tab", esc(t.label));
        b.type = "button";
        b.dataset.tab = t.id;
        b.title = t.title || t.label;
        b.addEventListener("click", () => dlg.set("tab", t.id, { noPreview: true }));
        bar.appendChild(b);
      }
      return bar;
    },
    update(el, dlg) {
      for (const b of el.children) {
        const t = tabs.find((x) => x.id === b.dataset.tab);
        const vis = !t.visible || t.visible(dlg);
        b.style.display = vis ? "" : "none";
        b.classList.toggle("on", dlg.values.tab === b.dataset.tab);
      }
      if (!tabs.some((t) => t.id === dlg.values.tab && (!t.visible || t.visible(dlg)))) dlg.values.tab = tabs[0].id;
    },
  };
}
export const onTab = (tab, extra) => (v, dlg) => v.tab === tab && (!extra || !!extra(v, dlg));

/** A label + control line inside a custom row (custom rows have no label column of their own). */
function labeled(label, tooltip) {
  const row = h("div", "pmi-lrow");
  const lab = h("div", "dlg-label");
  lab.textContent = label;
  lab.title = tooltip || label;
  const ctl = h("div", "dlg-ctl");
  row.append(lab, ctl);
  return { row, ctl };
}

/** Selection-look button that is not a geometry selection (Leader line position / Point position). */
export function placeRow(id, label, tooltip) {
  return {
    id, type: "custom", flush: true,
    render(dlg) {
      const { row, ctl } = labeled(label, tooltip);
      const b = h("button", "dlg-sel", `<span class="dlg-sel-arrow">${GL.cursor}</span><span class="dlg-sel-text">Select</span>`);
      b.type = "button";
      b.dataset.input = id;
      b.title = tooltip || label;
      b.addEventListener("click", () => { dlg.activate(null); dlg.values.placing = true; dlg.refresh(); dlg.message("Click in the canvas to place the annotation", "info"); });
      ctl.appendChild(b);
      return row;
    },
    update(el, dlg) {
      const b = el.querySelector(".dlg-sel");
      const placed = !!dlg.values.pos && !dlg.values.placing;
      b.querySelector(".dlg-sel-text").textContent = placed ? "1 selected" : "Select";
      b.classList.toggle("active", !!dlg.values.placing);
      b.classList.toggle("has", placed);
      b.dataset.count = placed ? "1" : "0";
    },
  };
}

/** "Change annotation plane" with Previous / Next (cycles dlg.values.planeIndex over the candidates). */
export function planeRow(getCands, opts = {}) {
  return {
    id: "planeAlign", type: "custom", flush: true, visible: opts.visible,
    render(dlg) {
      const { row, ctl } = labeled("Change annotation plane", "Cycles the PMI note between available annotation planes.");
      const wrap = h("div", "pmi-plane");
      const prev = h("button", "pmi-ibtn", GL.prev); prev.type = "button"; prev.title = "Previous"; prev.dataset.input = "planePrev";
      const lab = h("span", "pmi-plane-lab");
      const next = h("button", "pmi-ibtn", GL.next); next.type = "button"; next.title = "Next"; next.dataset.input = "planeNext";
      const step = (k) => {
        const c = getCands(dlg) || [];
        if (c.length < 2) return;
        const i = ((Number(dlg.values.planeIndex) || 0) + k + c.length) % c.length;
        dlg.values.planeChosen = true;
        dlg.set("planeIndex", i, { user: true });
      };
      prev.addEventListener("click", () => step(-1));
      next.addEventListener("click", () => step(1));
      wrap.append(prev, lab, next);
      ctl.appendChild(wrap);
      return row;
    },
    update(el, dlg) {
      const c = getCands(dlg) || [];
      const i = Number(dlg.values.planeIndex) || 0;
      const lab = el.querySelector(".pmi-plane-lab");
      lab.textContent = c.length ? `${Math.min(i, c.length - 1) + 1} / ${c.length}` : "-";
      lab.title = c[i] ? G.PLANE_TYPES[c[i].type] || c[i].type : "";
      for (const b of el.querySelectorAll("button")) b.disabled = c.length < 2;
    },
  };
}

/** Multi-line Text box (+ alignment + Insert symbol). id = value key. opts: {vAlign, hAlign, rows} */
export function textRow(id, opts = {}) {
  return {
    id: `${id}Box`, type: "custom", flush: true, visible: opts.visible,
    render(dlg) {
      const wrap = h("div", "pmi-textbox");
      const ta = h("textarea", "pmi-ta");
      ta.dataset.input = id;
      ta.rows = opts.rows || 3;
      ta.spellcheck = false;
      ta.title = opts.tooltip || "Specifies the text shown in the PMI note.";
      ta.value = dlg.values[id] ?? "";
      ta.addEventListener("input", () => dlg.set(id, ta.value, { user: true, fromInput: true }));
      ta.addEventListener("keydown", (e) => { if (e.key !== "Escape") e.stopPropagation(); }); // Esc still closes the dialog
      const tools = h("div", "pmi-ttools");
      const group = (key, opts2, title) => {
        const g = h("div", "pmi-tgroup");
        g.title = title;
        for (const [val, label] of opts2) {
          const b = h("button", "pmi-ibtn", GL[val]);
          b.type = "button";
          b.dataset.input = `${key}:${val}`;
          b.dataset.option = val;
          b.title = label;
          b.addEventListener("click", () => dlg.set(key, val, { user: true }));
          g.appendChild(b);
        }
        return g;
      };
      if (opts.hAlign !== false) tools.appendChild(group("hAlign", [["left", "Align left"], ["center", "Align center"], ["right", "Align right"]], "Horizontal alignment"));
      if (opts.vAlign) tools.appendChild(group("vAlign", [["top", "Align to top"], ["middle", "Align to middle"], ["bottom", "Align to bottom"]], "Vertical alignment"));
      const sp = h("span", "pmi-tsp");
      const sym = h("button", "pmi-ibtn pmi-sym", `${GL.symbol}`);
      sym.type = "button";
      sym.dataset.input = "insertSymbol";
      sym.title = "Insert symbol\n\nInserts a standard symbol at the cursor position in the text.";
      sym.addEventListener("click", () => {
        dlg.openMenu(sym, F.SYMBOL_PALETTE.map(([ch, name]) => ({
          label: `${ch}   ${name}`, value: name,
          run: () => {
            const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
            ta.value = ta.value.slice(0, s) + ch + ta.value.slice(e);
            ta.focus();
            ta.setSelectionRange(s + ch.length, s + ch.length);
            dlg.set(id, ta.value, { user: true });
          },
        })), { icons: false, matchWidth: false, id: "insertSymbol" });
      });
      tools.append(sp, sym);
      wrap.append(ta, tools);
      return wrap;
    },
    update(el, dlg) {
      const ta = el.querySelector("textarea");
      if (document.activeElement !== ta && ta.value !== (dlg.values[id] ?? "")) ta.value = dlg.values[id] ?? "";
      for (const b of el.querySelectorAll(".pmi-tgroup .pmi-ibtn")) {
        const [key, val] = b.dataset.input.split(":");
        b.classList.toggle("on", dlg.values[key] === val);
      }
    },
  };
}

// ---------------------------------------------------------------- value groups
const TOL_LABELS = {
  symmetric: ["Tolerance", null], deviation: ["Upper deviation", "Lower deviation"], limitsStacked: ["Upper limit", "Lower limit"],
  limitsLinear: ["Upper limit", "Lower limit"], max: [null, null], min: [null, null], basic: [null, null],
};
/**
 * Rows of a value with "Modeled <x>" + override value + tolerance (Fusion's Diameter / Depth /
 * Dimension groups). key: value prefix; o = {label, modeledLabel, valueLabel, tolLabel, kind, visible, onLabel, onDefault, noTol, noModeled}
 */
export function valueRows(key, o) {
  const vis = o.visible || (() => true);
  const on = (v) => (o.onLabel ? !!v[`${key}_on`] : true);
  const rows = [];
  if (o.onLabel) rows.push({ id: `${key}_on`, type: "check", label: o.onLabel, tooltip: o.onTooltip, default: o.onDefault !== false, visible: vis });
  if (!o.noModeled) rows.push({ id: `${key}_modeled`, type: "check", label: o.modeledLabel, tooltip: o.modeledTooltip, default: true, visible: (v, d) => vis(v, d) && on(v) });
  rows.push({ id: `${key}_value`, type: "value", label: o.valueLabel || o.label, kind: o.kind || "length", nonNegative: o.kind !== "angle", default: o.kind === "angle" ? "90.0 deg" : "0.00 mm", visible: (v, d) => vis(v, d) && on(v) && (o.noModeled || !v[`${key}_modeled`]) });
  if (!o.noTol) {
    rows.push({ id: `${key}_tolOn`, type: "check", label: o.tolLabel, tooltip: o.tolTooltip, default: false, visible: (v, d) => vis(v, d) && on(v) });
    const tv = (v, d) => vis(v, d) && on(v) && !!v[`${key}_tolOn`];
    rows.push({ id: `${key}_tolType`, type: "dropdown", label: "Type", options: o.tolTypes || F.TOL_TYPES, default: "symmetric", visible: tv, tooltip: "Sets how the tolerance is specified and displayed in the PMI note." });
    const lab = (i) => (v) => (TOL_LABELS[v[`${key}_tolType`]] || ["Upper deviation", "Lower deviation"])[i] || "";
    const kind = o.kind === "angle" ? "angle" : "length";
    rows.push({ id: `${key}_up`, type: "value", label: "Tolerance", labelFn: lab(0), kind, default: o.kind === "angle" ? "0.5 deg" : "0.10 mm", visible: (v, d) => tv(v, d) && !!lab(0)(v) && !F.isFit(v[`${key}_tolType`]) });
    rows.push({ id: `${key}_lo`, type: "value", label: "Lower deviation", labelFn: lab(1), kind, default: o.kind === "angle" ? "-0.5 deg" : "-0.10 mm", visible: (v, d) => tv(v, d) && !!lab(1)(v) && !F.isFit(v[`${key}_tolType`]) });
    rows.push({ id: `${key}_hole`, type: "dropdown", label: "Hole", options: F.HOLE_FITS.map((x) => ({ value: x, label: x })), default: "H7", visible: (v, d) => tv(v, d) && F.isFit(v[`${key}_tolType`]), tooltip: "Sets the standard hole fit designation used to calculate the diameter tolerance shown in the PMI note." });
    rows.push({ id: `${key}_shaft`, type: "dropdown", label: "Shaft", options: F.SHAFT_FITS.map((x) => ({ value: x, label: x })), default: "g6", visible: (v, d) => tv(v, d) && F.isFit(v[`${key}_tolType`]), tooltip: "Sets the standard shaft fit designation used to calculate the diameter tolerance shown in the PMI note." });
  }
  return rows;
}
/** Feature data of a value group from the dialog values. */
export function readValue(v, key, o = {}) {
  const out = {};
  if (o.onLabel) out.on = !!v[`${key}_on`];
  out.modeled = o.noModeled ? false : v[`${key}_modeled`] !== false;
  if (!out.modeled || o.noModeled) out.value = v[`${key}_value`];
  if (!o.noTol) {
    out.tol = { on: !!v[`${key}_tolOn`], type: v[`${key}_tolType`] || "symmetric" };
    if (out.tol.on) {
      if (F.isFit(out.tol.type)) { out.tol.hole = v[`${key}_hole`]; out.tol.shaft = v[`${key}_shaft`]; }
      else {
        out.tol.upper = v[`${key}_up`];
        if (out.tol.type === "symmetric") out.tol.lower = negExpr(v[`${key}_up`]);
        else out.tol.lower = v[`${key}_lo`];
      }
    }
  }
  return out;
}
const negExpr = (s) => { const t = String(s ?? "").trim(); return t.startsWith("-") ? t.slice(1) : `-(${t})`; };
/** Dialog values of a value group from feature data (Edit Feature). */
export function writeValue(v, key, g, o = {}) {
  if (!g) return;
  if (o.onLabel && g.on !== undefined) v[`${key}_on`] = !!g.on;
  if (!o.noModeled) v[`${key}_modeled`] = g.modeled !== false;
  if (g.value !== undefined) v[`${key}_value`] = String(g.value);
  if (g.tol) {
    v[`${key}_tolOn`] = !!g.tol.on;
    if (g.tol.type) v[`${key}_tolType`] = g.tol.type;
    if (g.tol.upper !== undefined) v[`${key}_up`] = String(g.tol.upper);
    if (g.tol.lower !== undefined && g.tol.type !== "symmetric") v[`${key}_lo`] = String(g.tol.lower);
    if (g.tol.hole) v[`${key}_hole`] = g.tol.hole;
    if (g.tol.shaft) v[`${key}_shaft`] = g.tol.shaft;
  }
}

/** Units and precision + Secondary units groups. */
export function unitsRows(settings, visible, opts = {}) {
  const vis = visible || (() => true);
  const rows = [
    { id: "units", type: "group", label: opts.label || "Units and precision", tooltip: "Controls how values are displayed in the PMI note.", visible: vis, collapsed: !!opts.collapsed, rows: [
      ...(opts.noUnit ? [] : [{ id: "u_unit", type: "dropdown", label: "Unit", options: F.UNIT_OPTIONS, default: "doc", tooltip: "Sets the unit of measure used in the PMI note.\n\nOverrides the default units in Preferences for this PMI note only." }]),
      { id: "u_prec", type: "dropdown", label: "Precision", options: F.PRECISION_OPTIONS, default: String(settings.precision ?? 2), tooltip: "Sets the number of decimal places displayed in the PMI note." },
      { id: "u_lead", type: "check", label: "Leading zeros", default: settings.leadingZero !== false, tooltip: "Adds a zero before the decimal point when the value is less than 1." },
      { id: "u_trail", type: "check", label: "Trailing zeros", default: settings.trailingZero !== false, tooltip: "Adds zeros at the end of decimal values based on precision setting." },
      ...(opts.noUnit ? [] : [{ id: "u_abbr", type: "check", label: "Unit abbreviation", default: false, tooltip: "Displays the unit of measure using its abbreviated form." }]),
    ] },
  ];
  if (!opts.noSecondary) rows.push({ id: "secondary", type: "group", label: "Secondary units", tooltip: "Shows a secondary unit of measure in square brackets in the PMI note.", visible: vis, collapsed: true, rows: [
    { id: "s_on", type: "check", label: "Secondary units", default: false, tooltip: "Shows a secondary unit of measure in square brackets in the PMI note." },
    { id: "s_unit", type: "dropdown", label: "Unit", options: F.UNIT_OPTIONS.filter((o) => o.value !== "doc"), default: settings.docUnit === "in" ? "mm" : "in", visible: (v) => !!v.s_on, tooltip: "Sets the secondary unit of measure used in the PMI note." },
    { id: "s_prec", type: "dropdown", label: "Precision", options: F.PRECISION_OPTIONS, default: "3", visible: (v) => !!v.s_on, tooltip: "Sets the number of decimal places displayed for the secondary unit in the PMI note." },
  ] });
  return rows;
}
export function readUnits(v) {
  return { disp: { unit: v.u_unit || "doc", precision: String(v.u_prec ?? "2"), leading: v.u_lead !== false, trailing: v.u_trail !== false, abbrev: !!v.u_abbr }, secondary: { on: !!v.s_on, unit: v.s_unit || "in", precision: Number(v.s_prec ?? 3) } };
}
export function writeUnits(v, f) {
  const d = f.disp || {};
  if (d.unit) v.u_unit = d.unit;
  if (d.precision !== undefined) v.u_prec = String(d.precision);
  if (d.leading !== undefined) v.u_lead = !!d.leading;
  if (d.trailing !== undefined) v.u_trail = !!d.trailing;
  if (d.abbrev !== undefined) v.u_abbr = !!d.abbrev;
  const s = f.secondary || {};
  if (s.on !== undefined) v.s_on = !!s.on;
  if (s.unit) v.s_unit = s.unit;
  if (s.precision !== undefined) v.s_prec = String(s.precision);
}

// ---------------------------------------------------------------- placement on the canvas
/**
 * Canvas handlers for placing / moving the note: while dlg.values.placing the preview follows the
 * cursor on the annotation plane; a click anchors it (stored as pos [du, dv] from frame(dlg).o).
 * A click on the preview text picks it up again.
 */
export function placement(svc, frameOf, opts = {}) {
  const at = (ctx, dlg) => {
    const fr = frameOf(dlg);
    const vp = svc.app.viewport;
    if (!fr || !vp) return null;
    let hit = vp.rayPlane(ctx.x, ctx.y, { o: fr.o, x: fr.x, n: fr.n });
    if (!hit) return null;
    const y = V.cross(fr.n, fr.x);
    const d = V.sub(hit.world, fr.o);
    return [round(V.dot(d, fr.x)), round(V.dot(d, y))];
  };
  return {
    onCanvasMove(ctx, dlg) {
      if (!dlg.values.placing || (dlg.active && !opts.allowActive)) return false;
      const p = at(ctx, dlg);
      if (p) { dlg.values.pos = p; svc.preview(dlg); }
      return true;
    },
    onCanvasDown(ctx, dlg) {
      if (dlg.active && !opts.allowActive) return false;
      if (dlg.values.placing) {
        if (opts.addPick && opts.addPick(ctx, dlg)) return true;
        const p = at(ctx, dlg);
        if (p) dlg.values.pos = p;
        dlg.values.placing = false;
        dlg.values.placed = true;
        dlg.message("");
        dlg.set("pos", dlg.values.pos, { force: true, user: true });
        return true;
      }
      if (svc.renderer.previewTextAt(ctx.x, ctx.y)) {
        dlg.values.placing = true;
        dlg.refresh();
        return true;
      }
      return false;
    },
  };
}
const round = (x) => Math.round(x * 1e4) / 1e4;

/** Resolved candidates of a dialog: cached per geometry key on the dialog. */
export function cachedCands(dlg, key, compute) {
  if (dlg._candKey !== key) { dlg._candKey = key; dlg._cands = compute() || []; }
  return dlg._cands;
}

/** Pick the dialog's annotation plane: the chosen candidate (index), else the stored plane. */
export function dialogPlane(dlg, cands, view) {
  if (!cands.length) return null;
  let i = Number(dlg.values.planeIndex);
  if (!Number.isFinite(i) || i < 0 || i >= cands.length) i = G.defaultPlaneIndex(cands, view);
  dlg.values.planeIndex = i;
  const c = cands[i];
  if (dlg.values.plane && dlg.values.plane.type === c.type && Math.abs(V.dot(V.norm(dlg.values.plane.n), c.n)) > 0.999) return dlg.values.plane;
  const pl = G.planeFromCandidate(c, view);
  dlg.values.plane = pl;
  return pl;
}
/** Index of the stored plane among candidates (Edit Feature). */
export function planeIndexOf(plane, cands) {
  if (!plane) return -1;
  let best = -1, bd = 0.999;
  cands.forEach((c, i) => { if (c.type !== plane.type) return; const d = Math.abs(V.dot(c.n, V.norm(plane.n))); if (d > bd) { bd = d; best = i; } });
  return best;
}

// ---------------------------------------------------------------- commit
/** Next "<stem><n>" browser name (counters live in the document like other features). */
export function nextPmiName(doc, stem) {
  doc.counters = doc.counters || {};
  const k = `pmi:${stem}`;
  doc.counters[k] = (doc.counters[k] || 0) + 1;
  return `${stem}${doc.counters[k]}`;
}
/** Insert / replace a PMI feature as one undoable step. */
export function commitPmi(app, dlg, f, stem, label) {
  const editId = dlg.editId;
  return app.mutate(editId ? `Edit ${label}` : label, (doc) => {
    if (editId) {
      const old = doc.features.find((x) => x.id === editId);
      if (!old) throw new Error("The feature no longer exists");
      const keep = { id: old.id, name: old.name, visible: old.visible, suppressed: old.suppressed };
      for (const k of Object.keys(old)) delete old[k];
      Object.assign(old, clone(f));
      for (const [k, v] of Object.entries(keep)) if (v !== undefined) old[k] = v;
      return old;
    }
    const nf = clone(f);
    const st = typeof stem === "function" ? stem(nf, doc) : stem;
    nf.name = st && typeof st === "object" ? st.name : nextPmiName(doc, st);
    prepareFeature(doc, nf);
    doc.features.splice(doc.marker, 0, nf);
    doc.marker += 1;
    return nf;
  });
}

/** Leave the sketch environment (Fusion finishes the sketch when a model command starts). */
export function beginPmiCommand(app) {
  const pre = [...app.selection.items];
  if (app.mode === "sketch") {
    const stop = app.commands.get("SketchStop");
    try { if (stop && !stop.stub) stop.run(app, { fromCommand: true }); } catch (e) { console.error(e); }
    if (app.mode === "sketch") app.setMode("model");
  }
  return pre;
}

// ---------------------------------------------------------------- popup menu with image icons
/** Small list menu under an anchor (items: [{label, img?, html?, run, current}]). Closes on outside click / Esc. */
export function popupMenu(app, anchor, items, opts = {}) {
  closePopup();
  const host = app.dom.overlay || document.body;
  const m = h("div", "dlg-dd-menu pmi-menu");
  if (opts.id) m.dataset.menu = opts.id;
  for (const it of items) {
    const row = h("div", "dlg-dd-item" + (it.current ? " current" : ""));
    if (it.value !== undefined) row.dataset.option = it.value;
    row.innerHTML = `<span class="pmi-menu-ico">${it.img ? `<img src="${it.img}" alt="">` : it.html || ""}</span><span>${esc(it.label)}</span>`;
    row.addEventListener("pointerdown", (e) => e.stopPropagation());
    row.addEventListener("click", (e) => { e.stopPropagation(); closePopup(); if (it.run) it.run(); });
    m.appendChild(row);
  }
  const r = anchor.getBoundingClientRect();
  m.style.left = `${Math.round(r.left)}px`;
  m.style.top = `${Math.round(r.bottom + 1)}px`;
  m.style.minWidth = `${Math.round(r.width)}px`;
  host.appendChild(m);
  const mr = m.getBoundingClientRect();
  if (mr.bottom > window.innerHeight - 4) m.style.top = `${Math.max(4, Math.round(r.top - mr.height - 1))}px`;
  const away = (e) => { if (!m.contains(e.target)) closePopup(); };
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); closePopup(); } };
  setTimeout(() => { if (!POP || POP.m !== m) return; window.addEventListener("pointerdown", away, true); window.addEventListener("keydown", key, true); }, 0); // not when already closed
  POP = { m, off: () => { window.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", key, true); } };
  return m;
}
let POP = null;
export function closePopup() { if (POP) { POP.off(); POP.m.remove(); POP = null; } }
