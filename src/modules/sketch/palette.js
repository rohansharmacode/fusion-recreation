// Sketch Palette: docked at the right edge of the canvas while a sketch is active
// ("− SKETCH PALETTE »"): Status (Compute Sketch, Find Under-Constrained, AutoConstrain),
// Feature Options of the active drawing tool, Options (Linetype, Look At, checkboxes), Finish Sketch.
import { ST, setOpt, onLocal, activeData, setGridOpt, gridVisible, viewportGrid } from "./ctx.js";

// Option rows (labels from Fusion's string table: SKETCH_SHOWPROFILE_CMD = "Profile", ...)
const ROWS = [
  { opt: "grid", label: "Sketch Grid" },
  { opt: "snap", label: "Snap" },
  { opt: "slice", label: "Slice" },
  { opt: "showProfile", label: "Profile" },
  { opt: "showPoints", label: "Points" },
  { opt: "showDims", label: "Dimensions" },
  { opt: "showCons", label: "Constraints" },
  { opt: "showProjected", label: "Projected Geometries" },
  { opt: "showConstruction", label: "Construction Geometries" },
  { opt: "sketch3d", label: "3D Sketch", disabled: true },
];

// ---------- original icons (20x20) ----------
const sv = (body, w = 20) => `<svg viewBox="0 0 20 20" width="${w}" height="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  compute: sv('<path d="M3.5 3.5v13h9" stroke="#3a3a3a" stroke-width="1.3"/><path d="M3.5 3.5h1.6M3.5 16.5h1.6" stroke="#3a3a3a" stroke-width="1.3"/><path d="M6.5 8.5l2 1.5-2 1.5" stroke="#3a3a3a" stroke-width="1.1"/><rect x="11.5" y="3" width="5" height="11" rx="1.6" stroke="#3a3a3a" stroke-width="1.2"/><circle cx="14" cy="6" r="1.5" fill="#e3322b"/><circle cx="14" cy="11" r="1.5" fill="#27a844"/>'),
  under: sv('<path d="M3 15l4.5-6 3.5 4 3-5" stroke="#3a3a3a" stroke-width="1.2"/><circle cx="3" cy="15" r="1.4" fill="#0696d7"/><circle cx="7.5" cy="9" r="1.4" fill="#0696d7"/><circle cx="11" cy="13" r="1.4" fill="#3a3a3a"/><circle cx="14.5" cy="13.5" r="3" stroke="#3a3a3a" stroke-width="1.2"/><path d="M16.6 15.6l2 2" stroke="#3a3a3a" stroke-width="1.5"/>'),
  auto: sv('<path d="M3.5 4v12.5h12" stroke="#3a3a3a" stroke-width="1.3"/><path d="M6.5 13.5l4.5-6" stroke="#0696d7" stroke-width="1.3"/><path d="M6.5 8.5h2.5M6.5 7v3" stroke="#3a3a3a" stroke-width="1"/><path d="M14.5 2.5l-2.6 4.3h2.4l-1.6 4.2 4.1-5.4h-2.5l1.6-3.1z" fill="#f08a1c" stroke="#d06e08" stroke-width="0.6"/>'),
  construction: sv('<path d="M3 16L17 4" stroke="#d9302c" stroke-width="1.4" stroke-dasharray="2.6 1.8"/><path d="M14.5 2.8l-6 5.6M8.8 11.8l5.7 5.4" stroke="#3a3a3a" stroke-width="1.1"/><path d="M9.5 9.2l1.4 1.4" stroke="#d9302c" stroke-width="1.4"/>'),
  centerline: sv('<path d="M2 10h16" stroke="#d9302c" stroke-width="1.1" stroke-dasharray="5 1.6 1.2 1.6"/><path d="M6 5.5h5.5a4.5 4.5 0 0 1 0 9H6" stroke="#9a9a9a" stroke-width="1.1"/><path d="M6 5.5v9" stroke="#9a9a9a" stroke-width="1.1"/>'),
  lookat: sv('<rect x="3.5" y="7" width="13" height="9.5" rx="1" fill="#1d8fe0" stroke="#3a3a3a" stroke-width="1.1"/><path d="M5.5 7V5h3l1-2h1l1 2h3v2" stroke="#3a3a3a" stroke-width="1.1"/>'),
  rect2: sv('<rect x="4" y="6" width="12" height="9" stroke="#3a3a3a" stroke-width="1.3"/><circle cx="4" cy="6" r="1.4" fill="#1d6fe0"/><circle cx="16" cy="15" r="1.4" fill="#1d6fe0"/>'),
  rect3: sv('<path d="M10 3.5l6.5 6.5-6.5 6.5L3.5 10z" stroke="#3a3a3a" stroke-width="1.3"/><circle cx="3.5" cy="10" r="1.4" fill="#1d6fe0"/><circle cx="10" cy="3.5" r="1.4" fill="#1d6fe0"/><circle cx="16.5" cy="10" r="1.4" fill="#1d6fe0"/>'),
  rectc: sv('<rect x="4" y="6" width="12" height="9" stroke="#3a3a3a" stroke-width="1.3"/><circle cx="10" cy="10.5" r="1.4" fill="#1d6fe0"/><circle cx="16" cy="15" r="1.4" fill="#1d6fe0"/>'),
  circ: sv('<circle cx="10" cy="10" r="6.5" stroke="#3a3a3a" stroke-width="1.3"/><path d="M10 10l4.6-4.6" stroke="#3a3a3a" stroke-width="1"/><circle cx="10" cy="10" r="1.4" fill="#1d6fe0"/><circle cx="14.6" cy="5.4" r="1.4" fill="#1d6fe0"/>'),
  circ2: sv('<circle cx="10" cy="10" r="6.5" stroke="#3a3a3a" stroke-width="1.3"/><circle cx="3.5" cy="10" r="1.4" fill="#1d6fe0"/><circle cx="16.5" cy="10" r="1.4" fill="#1d6fe0"/>'),
  circ3: sv('<circle cx="10" cy="10" r="6.5" stroke="#3a3a3a" stroke-width="1.3"/><circle cx="4.4" cy="13.3" r="1.4" fill="#1d6fe0"/><circle cx="10" cy="3.5" r="1.4" fill="#1d6fe0"/><circle cx="15.6" cy="13.3" r="1.4" fill="#1d6fe0"/>'),
  arc3: sv('<path d="M3.5 14a7 7 0 0 1 13 0" stroke="#3a3a3a" stroke-width="1.3"/><circle cx="3.5" cy="14" r="1.4" fill="#1d6fe0"/><circle cx="10" cy="7.6" r="1.4" fill="#1d6fe0"/><circle cx="16.5" cy="14" r="1.4" fill="#1d6fe0"/>'),
  arcc: sv('<path d="M16 13A6.5 6.5 0 0 0 9.5 6.5" stroke="#3a3a3a" stroke-width="1.3"/><circle cx="9.5" cy="13" r="1.4" fill="#1d6fe0"/><circle cx="9.5" cy="6.5" r="1.4" fill="#1d6fe0"/><circle cx="16" cy="13" r="1.4" fill="#1d6fe0"/>'),
  arct: sv('<path d="M2.5 15h6" stroke="#3a3a3a" stroke-width="1.3"/><path d="M8.5 15a5 5 0 0 0 5-5V5" stroke="#3a3a3a" stroke-width="1.3"/><circle cx="8.5" cy="15" r="1.4" fill="#1d6fe0"/><circle cx="13.5" cy="5" r="1.4" fill="#1d6fe0"/>'),
  polyc: sv('<circle cx="10" cy="10" r="5.4" stroke="#9a9a9a" stroke-width="1" stroke-dasharray="1.6 1.3"/><path d="M10 3.7l5.5 3.15v6.3L10 16.3l-5.5-3.15v-6.3z" stroke="#3a3a3a" stroke-width="1.3"/>'),
  polyi: sv('<circle cx="10" cy="10" r="6.6" stroke="#9a9a9a" stroke-width="1" stroke-dasharray="1.6 1.3"/><path d="M10 3.4l5.7 3.3v6.6L10 16.6l-5.7-3.3V6.7z" stroke="#3a3a3a" stroke-width="1.3"/>'),
  polye: sv('<path d="M10 3.4l5.7 3.3v6.6L10 16.6l-5.7-3.3V6.7z" stroke="#3a3a3a" stroke-width="1.3"/><circle cx="4.3" cy="13.3" r="1.4" fill="#1d6fe0"/><circle cx="10" cy="16.6" r="1.4" fill="#1d6fe0"/>'),
  slotcc: sv('<path d="M6 6.5h8a3.5 3.5 0 0 1 0 7H6a3.5 3.5 0 0 1 0-7z" stroke="#3a3a3a" stroke-width="1.3"/><circle cx="6" cy="10" r="1.4" fill="#1d6fe0"/><circle cx="14" cy="10" r="1.4" fill="#1d6fe0"/>'),
  slotov: sv('<path d="M6 6.5h8a3.5 3.5 0 0 1 0 7H6a3.5 3.5 0 0 1 0-7z" stroke="#3a3a3a" stroke-width="1.3"/><circle cx="2.5" cy="10" r="1.4" fill="#1d6fe0"/><circle cx="17.5" cy="10" r="1.4" fill="#1d6fe0"/>'),
  slotcp: sv('<path d="M6 6.5h8a3.5 3.5 0 0 1 0 7H6a3.5 3.5 0 0 1 0-7z" stroke="#3a3a3a" stroke-width="1.3"/><circle cx="10" cy="10" r="1.4" fill="#1d6fe0"/><circle cx="14" cy="10" r="1.4" fill="#1d6fe0"/>'),
  circtt: sv('<path d="M2.5 4.5l15 0M2.5 4.5l7 13" stroke="#3a3a3a" stroke-width="1.2"/><circle cx="9.6" cy="9.6" r="4.4" stroke="#3a3a3a" stroke-width="1.3"/>'),
  circ3t: sv('<path d="M2 4h16M2.6 4l7.4 14M17.4 4L10 18" stroke="#3a3a3a" stroke-width="1.1"/><circle cx="10" cy="8.7" r="3.6" stroke="#3a3a3a" stroke-width="1.3"/>'),
  slota3: sv('<path d="M3.5 13.5a7 7 0 0 1 13 0" stroke="#9a9a9a" stroke-width="1" stroke-dasharray="1.6 1.3"/><path d="M1.6 14.2a8.8 8.8 0 0 1 16.8 0a1.9 1.9 0 0 1-3.6 0.6a5.2 5.2 0 0 0-9.6 0a1.9 1.9 0 0 1-3.6-0.6z" stroke="#3a3a3a" stroke-width="1.2"/><circle cx="10" cy="6.5" r="1.3" fill="#1d6fe0"/>'),
  slotac: sv('<path d="M1.6 14.2a8.8 8.8 0 0 1 16.8 0a1.9 1.9 0 0 1-3.6 0.6a5.2 5.2 0 0 0-9.6 0a1.9 1.9 0 0 1-3.6-0.6z" stroke="#3a3a3a" stroke-width="1.2"/><circle cx="10" cy="15.5" r="1.3" fill="#1d6fe0"/><circle cx="3.4" cy="14.4" r="1.3" fill="#1d6fe0"/>'),
  deg3: sv('<path d="M2.5 15C5 4 8 4 10 10s5 6 7.5-5" stroke="#3a3a3a" stroke-width="1.2"/><text x="14" y="18.5" font-size="7" font-family="sans-serif" fill="#3a3a3a" stroke="none">3</text>'),
  deg5: sv('<path d="M2.5 15C4 6 6 4 8 9s3 7 5 2 3-6 4.5-6" stroke="#3a3a3a" stroke-width="1.2"/><text x="14" y="18.5" font-size="7" font-family="sans-serif" fill="#3a3a3a" stroke="none">5</text>'),
};

/** Feature Options rows: tool families with their variants (icons switch the active tool). */
const FAMILIES = [
  { label: "Rectangle", tools: [["ShapeRectangleTwoPoint", "2-Point Rectangle", "rect2"], ["ShapeRectangleThreePoint", "3-Point Rectangle", "rect3"], ["ShapeRectangleCenter", "Center Rectangle", "rectc"]] },
  { label: "Circle", tools: [["CircleCenterRadius", "Center Diameter Circle", "circ"], ["CircleTwoPoint", "2-Point Circle", "circ2"], ["CircleThreePoint", "3-Point Circle", "circ3"], ["CircleTanTanRadius", "2-Tangent Circle", "circtt"], ["CircleThreeTangent", "3-Tangent Circle", "circ3t"]] },
  { label: "Arc", tools: [["ArcThreePoint", "3-Point Arc", "arc3"], ["ArcCenterTwoPoint", "Center Point Arc", "arcc"], ["ArcTangent", "Tangent Arc", "arct"]] },
  { label: "Polygon", tools: [["ShapePolygonCircumscribed", "Circumscribed Polygon", "polyc"], ["ShapePolygonInscribed", "Inscribed Polygon", "polyi"], ["ShapePolygonEdge", "Edge Polygon", "polye"]] },
  { label: "Slot", tools: [["ShapeSlotCenterToCenter", "Center to Center Slot", "slotcc"], ["ShapeSlotOverall", "Overall Slot", "slotov"], ["ShapeSlotCenterPoint", "Center Point Slot", "slotcp"], ["ShapeArcSlotThreePoint", "Three Point Arc Slot", "slota3"], ["ShapeArcSlotCenterTwoPoint", "Center Point Arc Slot", "slotac"]] },
];
// Control Point Spline: Spline Degree (Degree 3 / Degree 5), Fusion's FusionDrawCVSplineDegree row
const DEGREE = { label: "Spline Degree", tools: [["deg:3", "Degree 3", "deg3"], ["deg:5", "Degree 5", "deg5"]] };
const familyOf = (id) => (id === "DrawCVMSpline3D" ? DEGREE : FAMILIES.find((f) => f.tools.some((t) => t[0] === id)) || null);

let EL = null;

export function initPalette() {
  const host = ST.app.dom.paletteHost;
  if (!host) return;
  const el = document.createElement("div");
  el.className = "sk-palette";
  el.style.display = "none";
  el.innerHTML = `
    <div class="sk-pal-head">
      <button class="sk-pal-min" title="Minimize" aria-label="Minimize"><span></span></button>
      <span class="sk-pal-title">SKETCH PALETTE</span>
      <button class="sk-pal-collapse" title="Collapse" aria-label="Collapse"><svg viewBox="0 0 10 10" width="9" height="9"><path d="M1 2l3 3-3 3zM5.5 2l3 3-3 3z" fill="#555"/></svg></button>
    </div>
    <div class="sk-pal-body">
      <div class="sk-pal-group open" data-group="status">
        <div class="sk-pal-ghead"><span class="sk-caret"></span><span class="sk-pal-gtitle" data-status-title>Status: Constrained</span></div>
        <div class="sk-pal-rows">
          <div class="sk-pal-row"><label>Compute Sketch</label><span class="sk-pal-ctl"><button class="sk-pal-icon" data-act="compute" title="Compute Sketch">${ICON.compute}</button></span></div>
          <div class="sk-pal-row sk-pal-find"><label>Find Under-Constrained</label><span class="sk-pal-ctl"><button class="sk-pal-icon" data-act="under" title="Find Under-Constrained">${ICON.under}</button></span></div>
          <div class="sk-pal-row sk-pal-find"><label>AutoConstrain</label><span class="sk-pal-ctl"><button class="sk-pal-icon" data-act="autoconstrain" title="AutoConstrain">${ICON.auto}</button></span></div>
        </div>
      </div>
      <div class="sk-pal-group open" data-group="feature" style="display:none">
        <div class="sk-pal-ghead"><span class="sk-caret"></span><span class="sk-pal-gtitle">Feature Options</span></div>
        <div class="sk-pal-rows"><div class="sk-pal-row sk-pal-feat"><label></label><span class="sk-pal-ctl sk-pal-modes"></span></div></div>
      </div>
      <div class="sk-pal-group open" data-group="options">
        <div class="sk-pal-ghead"><span class="sk-caret"></span><span class="sk-pal-gtitle">Options</span></div>
        <div class="sk-pal-rows">
          <div class="sk-pal-row"><label>Linetype</label><span class="sk-pal-ctl">
            <button class="sk-pal-icon" data-opt-btn="construction" title="Construction">${ICON.construction}</button>
            <button class="sk-pal-icon" data-opt-btn="centerline" title="Centerline" disabled>${ICON.centerline}</button>
          </span></div>
          <div class="sk-pal-row"><label>Look At</label><span class="sk-pal-ctl"><button class="sk-pal-icon" data-act="lookat" title="Look At">${ICON.lookat}</button><span class="sk-pal-gap"></span></span></div>
          ${ROWS.map((r) => `<div class="sk-pal-row${r.disabled ? " disabled" : ""}"><label for="skopt-${r.opt}">${r.label}</label><span class="sk-pal-ctl"><input type="checkbox" class="sk-cb" id="skopt-${r.opt}" data-opt="${r.opt}"${r.disabled ? ' disabled title="Not available in this recreation"' : ""}><span class="sk-pal-gap"></span></span></div>`).join("")}
        </div>
      </div>
    </div>
    <div class="sk-pal-foot"><button class="sk-finish" data-cmd="SketchStop">Finish Sketch</button></div>`;
  host.appendChild(el);
  EL = el;
  el.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  el.addEventListener("contextmenu", (ev) => { ev.preventDefault(); ev.stopPropagation(); });
  el.querySelector(".sk-pal-min").addEventListener("click", () => {
    el.classList.toggle("minimized");
    place();
    ST.app.emit("layout", {});
  });
  el.querySelector(".sk-pal-collapse").addEventListener("click", () => {
    el.classList.toggle("collapsed");
    el.querySelector(".sk-pal-collapse").title = el.classList.contains("collapsed") ? "Expand" : "Collapse";
    place();
    ST.app.emit("layout", {});
  });
  el.querySelectorAll(".sk-pal-ghead").forEach((g) => g.addEventListener("click", (ev) => { ev.currentTarget.parentNode.classList.toggle("open"); }));
  el.querySelector('[data-act="under"]').addEventListener("click", () => findUnderConstrained());
  el.querySelector('[data-act="compute"]').addEventListener("click", () => computeSketch());
  el.querySelector('[data-act="autoconstrain"]').addEventListener("click", () => ST.app.commands.run("SketchAutoConstraintAndDimCmd"));
  el.querySelectorAll("input[data-opt]").forEach((cb) => cb.addEventListener("change", () => (cb.dataset.opt === "grid" || cb.dataset.opt === "snap" ? setGridOpt(cb.dataset.opt, cb.checked) : setOpt(cb.dataset.opt, cb.checked))));
  ST.app.on("viewport-grid", () => sync());
  el.querySelector('[data-opt-btn="construction"]').addEventListener("click", () => ST.app.commands.run("SketchConstructionCmd"));
  el.querySelector('[data-act="lookat"]').addEventListener("click", () => ST.app.commands.run("SketchLookAt"));
  el.querySelector(".sk-finish").addEventListener("click", () => ST.app.commands.run("SketchStop"));
  el.querySelector(".sk-pal-modes").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-mode]");
    if (!b || b.classList.contains("on")) return;
    if (b.dataset.mode.startsWith("deg:")) { setOpt("splineDegree", Number(b.dataset.mode.slice(4))); if (ST.tool && ST.tool.refresh) ST.tool.refresh(); return; }
    ST.app.commands.run(b.dataset.mode);
  });
  onLocal((type) => { if (type === "opts" || type === "rendered" || type === "tool") sync(); });
  window.addEventListener("resize", () => place());
  ST.app.on("layout", () => requestAnimationFrame(place));
  sync();
}

/** Dock against the right edge of the canvas, below the ViewCube, above the bottom margin. */
export function place() {
  if (!EL || EL.style.display === "none") return;
  const host = ST.app.dom.canvasHost || (ST.app.viewport && ST.app.viewport.canvas);
  if (!host) return;
  const r = host.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const top = Math.round(r.top + Math.min(111, Math.max(40, r.height * 0.18)));
  EL.style.top = `${top}px`;
  EL.style.right = `${Math.round(window.innerWidth - r.right + 5)}px`;
  EL.style.maxHeight = `${Math.max(120, Math.round(r.bottom - 30 - top))}px`;
}

export function sync() {
  if (!EL) return;
  const vg = viewportGrid();
  EL.querySelectorAll("input[data-opt]").forEach((cb) => {
    const o = cb.dataset.opt;
    cb.checked = o === "grid" ? gridVisible() : o === "snap" && vg ? !!vg.gridSettings.snap : !!ST.opts[o];
  });
  EL.querySelector('[data-opt-btn="construction"]').classList.toggle("on", !!ST.opts.construction);
  const d = activeData();
  const curves = d && d.status ? Object.values(d.sk.curves).filter((c) => !c.proj).length : 0;
  const under = curves > 0 && !d.status.fully;
  EL.querySelector("[data-status-title]").textContent = under ? "Status: Under-Constrained" : "Status: Constrained";
  EL.querySelectorAll(".sk-pal-find").forEach((r) => { r.style.display = under ? "" : "none"; });
  // feature options of the active drawing tool
  const tool = ST.tool && ST.tool.id;
  const fam = tool ? familyOf(tool) : null;
  const fg = EL.querySelector('[data-group="feature"]');
  fg.style.display = fam ? "" : "none";
  if (fam) {
    const row = fg.querySelector(".sk-pal-feat");
    row.querySelector("label").textContent = fam.label;
    const modes = row.querySelector(".sk-pal-modes");
    const sig = fam.tools.map((t) => t[0]).join(",");
    if (modes.dataset.sig !== sig) {
      modes.dataset.sig = sig;
      modes.innerHTML = fam.tools.map(([id, label, ic]) => `<button class="sk-pal-icon sk-pal-mode" data-mode="${id}"${id.startsWith("deg:") ? "" : ` data-cmd="${id}"`} title="${label}">${ICON[ic]}</button>`).join("");
    }
    const on = fam === DEGREE ? `deg:${ST.opts.splineDegree === 5 ? 5 : 3}` : tool;
    modes.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === on));
  }
}

export function showPalette() { if (EL) { EL.style.display = ""; sync(); place(); ST.app.emit("layout", {}); } }
export function hidePalette() { if (EL) { EL.style.display = "none"; ST.app.emit("layout", {}); } }

/** Re-solve the active sketch (Compute Sketch). */
export function computeSketch() {
  const A = ST.app;
  try { A.recompute(); } catch (e) { console.error(e); }
}

/** Selects the curves and points that still have degrees of freedom. */
export function findUnderConstrained() {
  const d = activeData();
  if (!d || !d.status) return;
  const refs = [];
  for (const [id, cv] of Object.entries(d.sk.curves)) if (!cv.proj && d.status.constrained && !d.status.constrained[id]) refs.push({ kind: "sketchCurve", sketch: ST.sketchId, curve: id });
  ST.app.selection.set(refs);
  if (!refs.length) ST.app.toast("The sketch is fully constrained", "info", 1600);
}
