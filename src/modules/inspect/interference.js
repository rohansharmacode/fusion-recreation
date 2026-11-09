// INTERFERENCE (InterferenceCheckCommand): select two or more bodies, Compute, and the dialog lists
// every pair that overlaps (Body 1, Body 2, Volume) while the overlapping volumes are drawn red in
// the canvas. Kernel: pairwise boolean common (bounding boxes first), volumes from OpenCascade.
import { volumeProps, fmtNum } from "./geom.js";
import { esc } from "./ui.js";

const toBody = (r) => (r && (r.kind === "face" || r.kind === "edge" || r.kind === "vertex") && r.body ? { kind: "body", body: r.body } : r);

/** Pairwise interference of body ids: [{a, b, volume, shape}] (caller deletes the shapes). */
export function computeInterference(app, ids) {
  const K = app.K;
  const out = [];
  const bodies = ids.map((id) => ({ id, b: app.body(id) })).filter((x) => x.b && x.b.shape);
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i], B = bodies[j];
      if (!K.boxesOverlap(K.bboxOf(A.b.shape), K.bboxOf(B.b.shape), 1e-6)) continue;
      let s = null;
      try {
        s = K.intersect(A.b.shape, B.b.shape);
        const v = s && !K.isEmptyShape(s) ? volumeProps(app, s).volume : 0;
        if (v > 1e-6) { out.push({ a: A.id, b: B.id, volume: v, shape: s }); s = null; }
      } catch (e) {
        console.warn("[inspect] interference failed", e);
      } finally {
        if (s) { try { s.delete(); } catch { /* ignore */ } }
      }
    }
  }
  return out;
}

export function openInterference(app, opts = {}) {
  if (!app.ui.dialog) return null;
  if (app.mode === "sketch") {
    const stop = app.commands.get("SketchStop");
    if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model");
  }
  let results = null; // null = not computed for the current selection
  let selKey = "";
  const free = () => { for (const r of results || []) { try { r.shape.delete(); } catch { /* ignore */ } } };
  const name = (id) => { const m = app.bodyMeta(id); return (m && m.name) || id; };
  const pre = (opts.preselect || app.selection.items || []).map(toBody).filter((r) => r && r.kind === "body");
  const compute = (d) => {
    free();
    const ids = (d.values.bodies || []).map((r) => r.body);
    results = computeInterference(app, ids);
    selKey = ids.join(",");
    d.refresh();
    d.previewNow();
  };
  return app.ui.dialog.open({
    id: "InterferenceCheckCommand",
    title: "Interference",
    icon: "InterferenceCheckCommand",
    help: "Finds where the selected bodies overlap. Select two or more bodies, then click Compute.",
    preview: false,
    noFeature: true,
    preselect: pre,
    ctrlWidth: 140,
    rows: [
      { id: "bodies", type: "selection", label: "Select", kinds: ["body", "face"], mapRef: toBody, min: 2, prompt: "Select bodies to check for interference", selText: (n) => (n ? `${n} selected` : "Select") },
      { id: "coincident", type: "check", label: "Include Coincident Faces", default: false, tooltip: "Also reports bodies that only touch (not computed in this recreation)." },
      {
        id: "compute", type: "custom",
        render(d) {
          const box = document.createElement("div");
          box.className = "insp-mesh-place";
          const b = document.createElement("button");
          b.type = "button";
          b.className = "insp-btn";
          b.dataset.action = "compute";
          b.textContent = "Compute";
          b.addEventListener("click", () => compute(d));
          box.appendChild(b);
          return box;
        },
        update(el, d) { el.querySelector("button").disabled = (d.values.bodies || []).length < 2; },
      },
      {
        id: "results", type: "custom",
        render() { const e = document.createElement("div"); e.className = "insp-intf"; return e; },
        update(el) {
          if (!results) { el.innerHTML = ""; return; }
          if (!results.length) { el.innerHTML = `<div class="insp-intf-none" data-result="none">No interference detected</div>`; return; }
          el.innerHTML = `<table class="insp-intf-table"><thead><tr><th>#</th><th>Body 1</th><th>Body 2</th><th class="num">Volume</th></tr></thead><tbody>${results.map((r, i) =>
            `<tr data-result="${i}"><td>${i + 1}</td><td>${esc(name(r.a))}</td><td>${esc(name(r.b))}</td><td class="num">${esc(fmtNum(r.volume, 3))} mm^3</td></tr>`).join("")}</tbody></table>`;
        },
      },
    ],
    onOpen(d) { d.el.classList.add("insp-dlg", "insp-intf-dlg"); },
    onChange(id, d) {
      if (id !== "bodies") return;
      const k = (d.values.bodies || []).map((r) => r.body).join(",");
      if (k !== selKey && results) { free(); results = null; }
    },
    afterPreview(d) {
      const vp = app.viewport;
      try { if (vp && vp.setPreview) vp.setPreview((results || []).map((r) => ({ shape: r.shape, color: "cut", opacity: 0.6 }))); } catch (e) { console.error(e); }
      if (results && results.length) d.message(`${results.length} interference${results.length === 1 ? "" : "s"} found`, "warning");
    },
    status: () => (results && results.length ? `${results.length} Interference${results.length === 1 ? "" : "s"}` : ""),
    commit() { return results ? results.map((r) => ({ a: r.a, b: r.b, volume: r.volume })) : null; },
    onClose() {
      try { if (app.viewport && app.viewport.clearPreview) app.viewport.clearPreview(); } catch { /* ignore */ }
      free();
      results = null;
    },
  });
}
