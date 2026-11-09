// MEASURE (MeasureCommand, I): Fusion's measure dialog. Pick one or two entities (faces, edges,
// vertices, bodies, components, sketch points/curves, origin/construction geometry); the dialog
// lists Selection 1 / Selection 2 / Results (distance, angle, XYZ delta) and the canvas shows the
// minimum-distance line with a value label.
import { refKey } from "../../app/core.js";
import { CanvasOverlay } from "./overlay.js";
import { describe, measurePair, fmtVal, fmtSecondary, fmtNum, V, edgeOf, faceOf } from "./geom.js";
import { ICONS, esc, div, copyText, fwGlyph } from "./ui.js";

const FEV_KINDS = ["face", "edge", "vertex", "sketchCurve", "sketchPoint", "originPoint", "originAxis", "originPlane", "cplane"];
const PREC = [["0", "0"], ["1", "0.1"], ["2", "0.12"], ["3", "0.123"], ["4", "0.1234"], ["5", "0.12345"], ["6", "0.123456"], ["7", "0.1234567"], ["8", "0.12345678"], ["all", "All Decimals"]];
const SECONDARY = [["none", "None"], ["mm", "mm"], ["cm", "cm"], ["m", "m"], ["in", "in"], ["ft", "ft"]];
const FILTERS = [
  { id: "body", label: "Body", tip: "Body\nFilters selection to bodies." },
  { id: "fev", label: "Face/Edge/Vertex", tip: "Face/Edge/Vertex\nFilters selections to faces, edges or vertices." },
  { id: "component", label: "Component", tip: "Component\nFilters selection to components." },
];
const PROMPT = "Select objects to measure.";
const PROMPT_SNAP = "Select objects to measure. Hold Shift to remove snap points. Hold Ctrl to lock snap points.";

export function registerMeasure(app) {
  app.commands.register({
    id: "MeasureCommand",
    label: "Measure",
    tooltip: "Measures the distance, angle, area, or position of selected objects.",
    icon: "MeasureCommand",
    shortcut: "I",
    kind: "tool",
    run: (a, ctx = {}) => openMeasure(a, ctx),
  });
}

function kindsFor(filter) {
  return filter === "fev" ? FEV_KINDS : ["body"];
}

export function openMeasure(app, ctx = {}) {
  if (!app.ui.dialog) { app.toast("Measure needs the dialog framework", "error"); return null; }
  const overlay = new CanvasOverlay(app, "inspect-measure");
  const snapOverlay = new CanvasOverlay(app, "inspect-measure-snap");
  let state = { list: [], descs: [], pair: null };
  let lastStatus = null;
  let snapHover = null; // {p, ref}

  const pre = (ctx.preselect || app.selection.items || []).filter((r) => FEV_KINDS.includes(r.kind) || r.kind === "body").slice(0, 2);

  const compute = (dlg) => {
    const list = dlg.values.sel || [];
    const descs = list.map((r) => describe(app, r));
    let pair = null;
    if (list.length === 2 && descs[0] && descs[1]) {
      try { pair = measurePair(app, list[0], list[1], descs[0], descs[1]); } catch (e) { console.warn("[inspect] measure failed", e); }
    }
    state = { list, descs, pair };
    draw(dlg);
    status(dlg);
  };

  const prec = (dlg) => dlg.values.precision;
  const sec = (dlg) => dlg.values.secondary;
  const fv = (dlg, v, kind) => {
    const s = fmtVal(v, kind, prec(dlg));
    const s2 = fmtSecondary(v, kind, sec(dlg), prec(dlg));
    return s2 ? `${s} (${s2})` : s;
  };

  function draw(dlg) {
    overlay.clear();
    const { list, descs, pair } = state;
    if (list.length === 2 && pair) {
      const a = pair.from, b = pair.to;
      if (a && b) {
        const d = pair.c1 && pair.c2 ? pair.centerDistance : pair.distance;
        if (V.len(V.sub(b, a)) > 1e-9) {
          overlay.segments([a, b], { color: 0x000000, width: 1.4 });
          overlay.dot(a, { color: 0x000000, px: 3 });
          overlay.dot(b, { color: 0x000000, px: 3 });
        }
        let txt = esc(fv(dlg, d, "length"));
        if (pair.angle !== undefined && (d < 1e-9)) txt = esc(fv(dlg, pair.angle, "angle"));
        overlay.label(V.lerp(a, b, 0.5), txt, "insp-label insp-measure-label");
      }
    } else if (list.length >= 1 && descs[0]) {
      const ds = descs[0];
      if (ds.main && ds.anchor) overlay.label(ds.anchor, esc((ds.main.prefix || "") + fv(dlg, ds.main.value, ds.main.kind)), "insp-label insp-measure-label");
      else if (ds.point) overlay.label(ds.point, esc(`${fmtNum(ds.point[0], prec(dlg))}, ${fmtNum(ds.point[1], prec(dlg))}, ${fmtNum(ds.point[2], prec(dlg))}`), "insp-label insp-measure-label");
    }
  }

  function status(dlg) {
    const { list, descs, pair } = state;
    let s = "";
    if (list.length === 2 && pair && pair.distance !== undefined) s = `Distance : ${fmtVal(pair.c1 && pair.c2 ? pair.centerDistance : pair.distance, "length", prec(dlg))}`;
    else if (list.length === 1 && descs[0]) s = descs[0].main ? `${descs[0].title} | ${descs[0].main.label} : ${fmtVal(descs[0].main.value, descs[0].main.kind, prec(dlg))}` : descs[0].title;
    lastStatus = s;
    app.setStatus(s);
  }

  // ---------------------------------------------------------------- dialog rows
  const filterRow = {
    id: "filterRow", type: "custom",
    render(dlg) {
      const row = div("insp-crow");
      row.innerHTML = `<div class="dlg-label" title="Selection Filter">Selection Filter</div>`;
      const bg = div("dlg-bg insp-bg");
      bg.dataset.input = "filter";
      for (const f of FILTERS) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "dlg-bg-btn insp-bg-btn";
        b.dataset.option = f.id;
        b.title = f.tip;
        b.innerHTML = ICONS[`filter_${f.id}`] || esc(f.label);
        b.addEventListener("click", () => dlg.set("filter", f.id, { user: true }));
        bg.appendChild(b);
      }
      Object.defineProperty(bg, "value", { get: () => dlg.values.filter, set: (v) => dlg.set("filter", v, { user: true }) });
      row.appendChild(bg);
      return row;
    },
    update(el, dlg) {
      const bg = el.querySelector("[data-input=filter]");
      bg.dataset.value = dlg.values.filter;
      for (const b of bg.children) b.classList.toggle("on", b.dataset.option === dlg.values.filter);
    },
  };

  const resultsRow = {
    id: "results", type: "custom",
    render() { const r = div("insp-results"); r.dataset.measure = "results"; return r; },
    update(el, dlg) { renderResults(el, dlg); },
  };

  function valueCell(text, key) {
    const v = div("insp-val", esc(text));
    v.title = "Click to copy to the clipboard";
    v.dataset.value = key || "";
    v.addEventListener("click", () => {
      copyText(text);
      v.classList.add("copied");
      setTimeout(() => v.classList.remove("copied"), 700);
    });
    return v;
  }
  function group(el, title, sub, rows, key) {
    const g = div("dlg-group insp-group");
    g.dataset.group = key;
    const head = div("dlg-group-head insp-group-head", `<span class="dlg-caret">${fwGlyph(app, "groupCaret", ICONS.caret)}</span><span class="dlg-group-label">${esc(title)}</span>${sub ? `<span class="insp-group-sub">${esc(sub)}</span>` : ""}`);
    head.addEventListener("click", () => g.classList.toggle("collapsed"));
    g.appendChild(head);
    const body = div("dlg-group-body insp-group-body");
    for (const r of rows) body.appendChild(r);
    g.appendChild(body);
    el.appendChild(g);
    return body;
  }
  function row(label, text, key) {
    const r = div("insp-rrow");
    r.appendChild(div("dlg-label", esc(label)));
    r.appendChild(valueCell(text, key));
    r.dataset.result = key || label;
    return r;
  }

  function renderResults(el, dlg) {
    const collapsed = new Set([...el.querySelectorAll(".insp-group.collapsed")].map((g) => g.dataset.group));
    el.innerHTML = "";
    const { list, descs, pair } = state;
    descs.forEach((d, i) => {
      if (!d) return;
      const rows = d.rows.map(([label, v, kind]) => row(label, fv(dlg, v, kind), `sel${i + 1}:${label}`));
      if (d.point && !d.rows.length) rows.push(row("Position", d.point.map((x) => fmtNum(x, prec(dlg))).join(", ")));
      group(el, `Selection ${i + 1}`, d.title, rows, `sel${i + 1}`);
    });
    if (list.length === 2 && pair) {
      const rows = [];
      if (pair.c1 && pair.c2) {
        rows.push(row("Distance", fv(dlg, pair.centerDistance, "length"), "distance"));
        if (pair.distance !== undefined) rows.push(row("Minimum Distance", fv(dlg, pair.distance, "length"), "minDistance"));
      } else if (pair.distance !== undefined) rows.push(row("Distance", fv(dlg, pair.distance, "length"), "distance"));
      if (pair.angle !== undefined) rows.push(row("Angle", fv(dlg, pair.angle, "angle"), "angle"));
      const body = group(el, "Results", "", rows, "results");
      if (pair.delta) {
        const sub = div("insp-subgroup");
        const head = div("insp-subhead");
        head.innerHTML = `<span class="dlg-label">XYZ Delta</span>`;
        const bg = div("dlg-bg insp-bg insp-delta");
        bg.dataset.input = "deltaType";
        for (const [id, tip] of [["global", "Global Coordinate System\nDisplays the XYZ measurements aligned to the root component."], ["off", "None\nHide XYZ measurements"]]) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "dlg-bg-btn insp-bg-btn" + (dlg.values.deltaType === id ? " on" : "");
          b.dataset.option = id;
          b.title = tip;
          b.innerHTML = ICONS[`delta_${id}`];
          b.addEventListener("click", () => dlg.set("deltaType", id, { user: true }));
          bg.appendChild(b);
        }
        head.appendChild(bg);
        sub.appendChild(head);
        if (dlg.values.deltaType !== "off") {
          sub.appendChild(row("X Delta", fv(dlg, pair.delta[0], "length"), "dx"));
          sub.appendChild(row("Y Delta", fv(dlg, pair.delta[1], "length"), "dy"));
          sub.appendChild(row("Z Delta", fv(dlg, pair.delta[2], "length"), "dz"));
        }
        body.appendChild(sub);
      }
    }
    for (const g of el.querySelectorAll(".insp-group")) if (collapsed.has(g.dataset.group)) g.classList.add("collapsed");
  }

  // ---------------------------------------------------------------- snap points
  function snapCandidates(ref) {
    const out = [];
    try {
      if (ref.kind === "edge") {
        const e = edgeOf(app, ref);
        if (!e) return out;
        const a = e.startPoint.toTuple(), b = e.endPoint.toTuple();
        out.push(a);
        if (V.len(V.sub(a, b)) > 1e-6) out.push(b);
        out.push(e.pointAt(0.5).toTuple());
        if (e.geomType === "CIRCLE") { const c = e.curve.wrapped.Circle(); const l = c.Location(); out.push([l.X(), l.Y(), l.Z()]); }
      } else if (ref.kind === "face") {
        const f = faceOf(app, ref);
        if (f) out.push(f.center.toTuple());
      }
    } catch { /* ignore */ }
    return out;
  }
  function updateSnap(dlg, ctx) {
    snapOverlay.clear();
    snapHover = null;
    if (!dlg.values.snap || dlg.values.filter !== "fev") return;
    const h = ctx.hit;
    if (!h || !(h.ref.kind === "edge" || h.ref.kind === "face")) return;
    const pts = snapCandidates(h.ref);
    let best = null, bd = 12;
    for (const p of pts) {
      snapOverlay.dot(p, { color: 0x0696d7, px: 3.6 });
      const s = app.viewport.toScreen(p);
      const d = Math.hypot(s[0] - ctx.x, s[1] - ctx.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) { snapOverlay.dot(best, { color: 0xff7a00, px: 5 }); snapHover = { p: best, body: h.ref.body }; }
  }

  // ---------------------------------------------------------------- dialog
  const dlg = app.ui.dialog.open({
    id: "MeasureCommand",
    title: "Measure",
    icon: "MeasureCommand",
    help: "Measures the distance, angle, area, or position of selected objects.\n\nClick a value in the dialog to copy the value to the clipboard.",
    preview: false,
    noFeature: true,
    preselect: pre,
    activate: "sel",
    values: { filter: "fev", deltaType: "global" },
    rows: [
      filterRow,
      { id: "precision", type: "dropdown", label: "Precision", tooltip: "Overrides the General precision setting in Preferences.", default: "2", options: PREC.map(([value, label]) => ({ value, label })) },
      { id: "secondary", type: "dropdown", label: "Secondary Units", tooltip: "Displays the measurement with secondary units in parentheses.", default: "none", options: SECONDARY.map(([value, label]) => ({ value, label })) },
      { id: "snap", type: "check", label: "Show Snap Points", default: false },
      {
        id: "sel", type: "selection", label: "Selection", kinds: FEV_KINDS, min: 0, max: 2, prompt: PROMPT,
        mapRef: (ref, d) => (d.values.filter === "component" && ref.kind === "body" ? { kind: "body", body: ref.body, component: true } : ref),
      },
      resultsRow,
    ],
    init(d) {
      // filter / deltaType are plain values (rendered by custom rows)
      d.values.filter = d.values.filter || "fev";
      d.values.deltaType = d.values.deltaType || "global";
      if (pre.some((r) => r.kind === "body")) { d.values.filter = "body"; d.defs.sel.kinds = ["body"]; }
    },
    onOpen(d) {
      d.el.classList.add("insp-dlg", "insp-measure");
      const foot = d.el.querySelector(".dlg-foot");
      const ok = foot && foot.querySelector("[data-action=ok]");
      const cancel = foot && foot.querySelector("[data-action=cancel]");
      if (ok) ok.style.display = "none";
      if (cancel) cancel.textContent = "Close";
      if (foot && cancel) {
        const rs = document.createElement("button");
        rs.type = "button";
        rs.className = "dlg-btn insp-restart";
        rs.dataset.action = "restart";
        rs.textContent = "Clear Selection";
        rs.title = "Clear Selection";
        rs.addEventListener("click", () => { d.setSelection("sel", []); d.activate("sel"); });
        foot.insertBefore(rs, cancel);
      }
      compute(d);
    },
    onChange(id, d) {
      if (id === "filter") {
        d.defs.sel.kinds = kindsFor(d.values.filter);
        d.setSelection("sel", [], { noPreview: true });
        d.activate("sel");
        snapOverlay.clear();
      }
      if (id === "sel" || id === "precision" || id === "secondary" || id === "filter") compute(d);
      if (id === "snap" && !d.values.snap) { snapOverlay.clear(); snapHover = null; }
    },
    afterPreview(d) {
      // the document changed while measuring (e.g. undo of an unrelated edit): refresh the numbers
      if (d._measureDocVersion !== app.result) { d._measureDocVersion = app.result; compute(d); const re = d.rowEls && d.rowEls.results; if (re) re.update(); }
    },
    prompt(d) { return (d.values.sel || []).length ? "" : d.values.snap ? PROMPT_SNAP : PROMPT; },
    status() { return lastStatus || ""; },
    onCanvasMove(ctx, d) {
      if (d.values.snap) updateSnap(d, ctx);
      return false;
    },
    onCanvasDown(ctx, d) {
      const cur = d.values.sel || [];
      if (d.values.snap && snapHover && !ctx.shift) {
        const ref = { kind: "vertex", body: snapHover.body, p: snapHover.p };
        d.setSelection("sel", cur.length >= 2 ? [ref] : [...cur, ref]);
        return true;
      }
      const h = ctx.hit;
      if (!h) return true; // clicking empty canvas keeps the measurement
      const inList = cur.some((r) => refKey(r) === refKey(h.ref));
      if (cur.length >= 2 && !inList) {
        // a third pick starts a new measurement with that entity as Selection 1
        const m = d.defs.sel.mapRef ? d.defs.sel.mapRef(h.ref, d) : h.ref;
        if (m) d.setSelection("sel", [m]);
        return true;
      }
      return false; // the framework adds / toggles the entity
    },
    commit() { return null; },
    onClose() {
      overlay.dispose();
      snapOverlay.dispose();
      if (app.status === lastStatus) app.setStatus("");
    },
  });
  return dlg;
}
