// AutoConstrain (SketchAutoConstraintAndDimCmd), AutoConstrain from Datum
// (SketchAutoConstraintAndDimFromDatumCmd) and Finish with AutoConstrain (SketchAutoConstrainAndFinish).
// Fusion computes the proposals with a cloud-free solver too; here src/sketch/autocon.js proposes
// constraints and dimensions locally. Result tiles show Constraints / Dimensions / Status; the active
// tile has the quantity slider (- / +), Modify Geometry + Tolerance and More > Set datum / Refresh.
import { ST, mutateSketch, params, activeData, fmtLen, fmtAng } from "./ctx.js";
import { showLive, endLive, storedSketch, pointOfActive } from "./dlgutil.js";
import { autoConstrainResults } from "../../sketch/autocon.js";
import { finishSketch } from "./env.js";
import { closeEdit } from "./dimension.js";

const fmt = (v, k) => (k === "angle" ? fmtAng(v) : fmtLen(v));

function generate(state, more = false) {
  const sk = storedSketch();
  if (!sk) return [];
  const tol = state.modify ? state.tol : 0.001;
  const angTol = state.modify ? Math.max(0.5, state.tol * 2) : 0.5;
  const strategies = more ? ["dims", "datum", "balanced"] : ["balanced", "dims", "datum"];
  let rs = [];
  try { rs = autoConstrainResults(sk, params(), { datum: state.datum, tol, angTol, fmt, strategies, angles: !more }); } catch (e) { console.error(e); rs = []; }
  return rs.map((r) => ({ ...r, count: r.items.length }));
}

/** The sketch with the first k items of result r added (ids marked for the purple preview). */
function withItems(sk, r, k, doc = null) {
  const S = ST.app.S;
  const ids = [];
  for (const it of r.items.slice(0, k)) {
    if (!it.refs.every((x) => sk.points[x] || sk.curves[x])) continue;
    const { kind, w, late, loc, ...c } = it;
    void kind; void w; void late; void loc;
    const { type, refs, ...rest } = c;
    if (rest.expr !== undefined && doc) rest.param = ST.app.M.nextParam(doc);
    const added = S.addConstraint(sk, type, refs, rest);
    ids.push(added.id);
  }
  return ids;
}

function tileHtml(r, i, active) {
  const st = r.fully && r.count === r.items.length ? "Fully Constrained" : "Partially Constrained";
  return `<div class="sk-ac-tile${active ? " active" : ""}" data-tile="${i}" title="${r.constraints} constraints and ${r.dimensions} dimensions">
    <div class="sk-ac-title">Result ${i + 1}</div>
    <div class="sk-ac-row"><span>Constraints</span><b data-count="c">${r.items.slice(0, r.count).filter((x) => x.kind === "c").length}</b></div>
    <div class="sk-ac-row"><span>Dimensions</span><b data-count="d">${r.items.slice(0, r.count).filter((x) => x.kind === "d").length}</b></div>
    <div class="sk-ac-row"><span>Status</span><b class="sk-ac-status ${st.startsWith("Fully") ? "full" : "part"}">${st}</b></div>
  </div>`;
}

export function openAutoConstrain(opts = {}) {
  const A = ST.app;
  const sk = storedSketch();
  if (!sk) return null;
  const pre = A.selection.items.find((r) => r.kind === "sketchPoint" && r.sketch === ST.sketchId);
  const state = { results: [], active: 0, modify: false, tol: 1, datum: pre ? pre.point : null, picking: !!opts.pickDatum };
  const dlg = A.ui.dialog.open({
    id: opts.id || "SketchAutoConstraintAndDimCmd",
    title: "AutoConstrain",
    icon: "SketchAutoConstraintAndDimCmd",
    help: "Suggests constraints and dimensions to fully constrain the sketch. Pick a result tile, adjust the quantity, then click OK.",
    preview: false,
    noFeature: true,
    labelWidth: 80,
    ctrlWidth: 210,
    rows: [
      { id: "datumSel", type: "selection", label: "Datum", kinds: ["sketchPoint"], max: 1, min: 0, filter: pointOfActive(), visible: () => state.picking, prompt: "Select a point for the datum" },
      {
        id: "tiles", type: "custom",
        render: (d) => {
          const el = document.createElement("div");
          el.className = "sk-ac";
          el.addEventListener("click", (ev) => {
            const t = ev.target.closest("[data-tile]");
            const act = ev.target.closest("[data-ac]");
            if (act) { onAction(d, act.dataset.ac); return; }
            if (t) { state.active = Number(t.dataset.tile); render(d); d.schedulePreview(10); }
          });
          el.addEventListener("input", (ev) => {
            const r = state.results[state.active];
            if (!r) return;
            if (ev.target.dataset.ac === "slider") { r.count = Number(ev.target.value); render(d, true); d.schedulePreview(10); }
            if (ev.target.dataset.ac === "tol") { state.tol = Number(ev.target.value); clearTimeout(state.tt); state.tt = setTimeout(() => regen(d), 200); }
          });
          el.addEventListener("change", (ev) => { if (ev.target.dataset.ac === "modify") { state.modify = ev.target.checked; regen(d); } });
          state.el = el;
          return el;
        },
      },
    ],
    activate: () => (state.picking ? "datumSel" : false),
    onChange(id, d) {
      if (id === "datumSel") {
        const r = (d.values.datumSel || [])[0];
        if (r) { state.datum = r.point; state.picking = false; d.refresh(); regen(d); }
      }
    },
    onOpen(d) { if (!state.picking) regen(d); else render(d); },
    afterPreview(d) {
      const r = state.results[state.active];
      const sk1 = storedSketch();
      if (!r || !sk1) { ST.proposed = null; endLive(); return; }
      const w = ST.app.S.cloneSketch(sk1);
      const ids = withItems(w, r, r.count);
      ST.proposed = new Set(ids);
      showLive(w);
    },
    validate: () => (state.results[state.active] ? null : "No results"),
    commit() {
      const r = state.results[state.active];
      if (!r) return null;
      return mutateSketch("AutoConstrain", (sk2, f, doc) => withItems(sk2, r, r.count, doc));
    },
    afterCommit() { if (opts.finish) { closeEdit(); finishSketch(); } },
    onClose() { ST.proposed = null; endLive(); },
  });

  function regen(d, more = false) {
    if (d.closed) return;
    if (state.el) state.el.innerHTML = '<div class="sk-ac-busy">Generating results...</div>';
    setTimeout(() => {
      if (d.closed) return;
      const rs = generate(state, more);
      state.results = more ? [...state.results, ...rs].slice(0, 6) : rs;
      state.active = Math.min(state.active, Math.max(0, state.results.length - 1));
      render(d);
      d.schedulePreview(10);
      d.refresh();
    }, 20);
  }
  function onAction(d, act) {
    const r = state.results[state.active];
    if (act === "minus" && r) { r.count = Math.max(0, r.count - 1); render(d); d.schedulePreview(10); }
    else if (act === "plus" && r) { r.count = Math.min(r.items.length, r.count + 1); render(d); d.schedulePreview(10); }
    else if (act === "more") {
      d.openMenu(state.el.querySelector('[data-ac="more"]'), [
        { label: "Set datum", run: () => { state.picking = true; d.values.datumSel = []; d.refresh(); d.activate("datumSel"); render(d); } },
        { label: "Refresh", run: () => regen(d) },
      ]);
    } else if (act === "refresh") regen(d);
    else if (act === "generate") regen(d, true);
  }
  function render(d, keepSlider = false) {
    const el = state.el;
    if (!el) return;
    if (state.picking) { el.innerHTML = '<div class="sk-ac-busy">Select a point in the canvas for the datum.</div>'; return; }
    if (!state.results.length) {
      const dd = activeData();
      const full = dd && dd.status && dd.status.fully;
      el.innerHTML = `<div class="sk-ac-busy">${full ? "The sketch is already fully constrained." : "No suggestions for this sketch."}</div>`;
      return;
    }
    if (keepSlider) {
      const r = state.results[state.active];
      const t = el.querySelector(`[data-tile="${state.active}"]`);
      if (t) t.outerHTML = tileHtml(r, state.active, true);
      return;
    }
    const r = state.results[state.active];
    el.innerHTML = `<div class="sk-ac-tiles">${state.results.map((x, i) => tileHtml(x, i, i === state.active)).join("")}</div>
      <div class="sk-ac-ctl">
        <div class="sk-ac-slider"><button type="button" class="sk-ac-btn" data-ac="minus" title="Reduce Constraints">&minus;</button><input type="range" data-ac="slider" min="0" max="${r.items.length}" value="${r.count}" aria-label="Slider"><button type="button" class="sk-ac-btn" data-ac="plus" title="Add Constraints">+</button></div>
        <label class="sk-ac-check"><input type="checkbox" data-ac="modify"${state.modify ? " checked" : ""}> Modify Geometry</label>
        <div class="sk-ac-tol"${state.modify ? "" : ' style="display:none"'}><span>Tolerance</span><input type="range" data-ac="tol" min="0.1" max="5" step="0.1" value="${state.tol}"><span class="sk-ac-tolv">${state.tol.toFixed(1)}</span></div>
        <div class="sk-ac-links"><button type="button" class="sk-ac-link" data-ac="more">More</button><button type="button" class="sk-ac-link" data-ac="refresh">Refresh</button><button type="button" class="sk-ac-link" data-ac="generate">Generate more</button></div>
      </div>`;
  }
  return dlg;
}

/** Finish with AutoConstrain: apply the first result fully, then finish the sketch. */
export function autoConstrainAndFinish() {
  const sk = storedSketch();
  if (!sk) { finishSketch(); return; }
  let rs = [];
  try { rs = autoConstrainResults(sk, params(), { fmt, strategies: ["balanced"] }); } catch (e) { console.error(e); }
  const r = rs[0];
  if (r && r.items.length) {
    try { mutateSketch("Finish with AutoConstrain", (sk2, f, doc) => withItems(sk2, r, r.items.length, doc)); } catch (e) { console.error(e); ST.app.toast(`AutoConstrain: ${e.message || e}`, "error"); }
  }
  closeEdit();
  finishSketch();
}
