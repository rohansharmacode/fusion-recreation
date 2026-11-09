// DESIGN ADVICE (DesignAdviceCmd, PLASTIC > INSPECT): checks a solid body against plastic injection
// moulding rules, like Fusion: select a Body and a Pull Direction (face, plane, linear edge or axis),
// optional Flip Pull Direction, Analyze. Results: Summary cards plus Thickness (Too Thin / Too Thick /
// Large Thickness Variation, Display Alerts Only / Full Range), Undercuts, Draft (Minimum Draft Angle)
// and Knife Edges (Knife Edge Threshold) tabs with Rule Details, alert lists (Alert / Ignore,
// Isolate Alert) and Recommendations. Alerts are painted on the canvas.
// Local computation: ray casts through the body's display mesh (raycast.js) from samples on every
// face; regions are connected faces with the same alert. The plastic rule is the design's
// (app.ui.plastic.ruleFor(bodyId) when the plastic module provides one) or Fusion's default rule.
import { el, esc, lrow, toBodyRef, createFacePainter, beginModel, GL } from "./ui.js";
import { buildBVH } from "./raycast.js";

// Default plastic rule (values from Autodesk's Design Advice example rule; see README).
export const DEFAULT_RULE = { name: "Default", thicknessMin: 0.8, thicknessMax: 3, variation: 25, minDraft: 0.5, knifeEdge: 1 };
const V3 = { dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], add: (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s], norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; } };

const TEXT = {
  thin: { title: "Too Thin", problem: "Regions that are too thin may fill slower or have difficulty filling completely. They cool faster than thicker regions. This can cause uneven shrinkage, which warps the part as the molten plastic solidifies.", advice: ["Increase thickness in thinner regions.", "Adjust draft angle. In general, ribs should be 50% of thickness.", "Manage Plastic Rules to verify the Thickness Range is defined correctly for the plastic material."] },
  thick: { title: "Too Thick", problem: "Regions that are too thick take longer to cool. This can lead to longer manufacturing cycle times. Slower cooling can cause uneven shrinkage and sink marks, which warp the part as the molten plastic solidifies.", advice: ["Decrease thickness in thicker regions.", "Adjust draft angle. In general, ribs should be 50% of thickness.", "Use a tool like Shell to core out thick sections to maintain uniform thickness.", "Manage Plastic Rules to verify the Thickness Range is defined correctly for the plastic material."] },
  variation: { title: "Large Thickness Variation", problem: "Regions with large variation in thickness may fill and cool unevenly. Thick regions may lead to longer manufacturing cycle times. Thin regions may fill slower or have difficulty filling completely, which can warp the part.", advice: ["Try to maintain uniform thickness.", "Increase or decrease thickness in regions of high variation. In general, thickness variation should be kept under 25%.", "Adjust draft angle. In general, ribs should be 50% of thickness.", "Manage Plastic Rules to verify the Thickness Variation is defined correctly for the plastic material.", "Set up an Injection Molding simulation study to get accurate information based on process settings, material selection, and injection location."] },
  undercut: { title: "Undercuts", problem: "Undercuts are trapped features that can't be ejected from the mold. If the mold requires sliders, lifters, or inserts to help eject the part from the mold, it may increase the cost. Not all undercuts can be avoided, but they should be minimized.", advice: ["Remove undercuts to simplify the mold design.", "Confirm pull direction.", "Redesign undercut features to align with the pull direction.", "Check draft on the undercut feature.", "Investigate to make sure the part can be removed from the mold.", "Highlight undercuts as features of concern, and consult a mold designer. Confirm whether sliders, lifters, or inserts could be added to the mold to help remove the part."] },
  draft: { title: "Insufficient Draft", problem: "Faces with insufficient draft may block the ejection of the part from the injection mold. If the mold requires more ejection features, it may increase cost. Textured surfaces may also require more draft to eject the part without smearing the finish.", advice: ["Adjust draft to meet the Minimum Draft Angle.", "Confirm pull direction.", "Manage Plastic Rules to verify the Minimum Draft Angle is defined correctly for the plastic material."] },
  knife: { title: "Knife Edges", problem: "Thin gaps in a part require a mold with thin, sharp features, sometimes called knife edges. These tend to break due to high injection pressure on the molten plastic and can cause the mold to fail prematurely.", advice: ["Increase space between part features to eliminate thin, sharp edges in the mold.", "Apply fillets or radii to remove thin, sharp features.", "Consult a mold designer.", "Manage Plastic Rules to verify the Knife Edge Threshold is defined correctly for the plastic material."] },
};
const TABS = [["summary", "Summary"], ["thickness", "Thickness"], ["undercuts", "Undercuts"], ["draft", "Draft"], ["knife", "Knife Edges"]];
const ignored = new Map(); // `${body}:${kind}:${faces}` -> true (kept while the app runs, like Fusion keeps alert states)

/** Pull direction (unit vector) of a selection ref, or null. */
export function pullOf(app, r) {
  const K = app.K;
  if (!r) return null;
  if (r.kind === "originAxis") return K.ORIGIN_AXES[r.name];
  if (r.kind === "originPlane") return K.ORIGIN_PLANES[r.name].n;
  if (r.kind === "cplane") { const p = app.planeState(r.id); return p ? p.plane.n : null; }
  if (r.kind === "face") return r.n || null;
  if (r.kind === "edge") { const b = app.body(r.body); const e = b && K.topoOf(b.shape).edges[r.index]; return e && e.type === "LINE" ? e.d : null; }
  if (r.kind === "sketchCurve") {
    const s = app.sketchState(r.sketch); const cv = s && s.sk.curves[r.curve];
    if (!cv || cv.type !== "line") return null;
    const a = s.sk.points[cv.p1], b = s.sk.points[cv.p2];
    const pa = K.toWorld(s.plane, a.x, a.y), pb = K.toWorld(s.plane, b.x, b.y);
    return V3.norm([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]);
  }
  return null;
}

/** Connected groups of faces (B-rep adjacency through edges). */
function regions(T, faces) {
  const set = new Set(faces);
  const nb = new Map(faces.map((f) => [f, []]));
  for (const e of T.edges) for (const a of e.faces) for (const b of e.faces) if (a !== b && set.has(a) && set.has(b)) nb.get(a).push(b);
  const seen = new Set();
  const out = [];
  for (const f of faces) {
    if (seen.has(f)) continue;
    const comp = [];
    const q = [f];
    seen.add(f);
    while (q.length) { const x = q.shift(); comp.push(x); for (const y of nb.get(x)) if (!seen.has(y)) { seen.add(y); q.push(y); } }
    out.push(comp.sort((a, b) => a - b));
  }
  return out;
}

/** Run the four checks. Returns {body, rule, pull, thickness:{alerts, faceT, tMin, tMax, nominal}, undercuts, draft, knife}. */
export function analyzeBody(app, bodyId, pull, rule = DEFAULT_RULE) {
  const b = app.body(bodyId);
  if (!b) throw new Error("Select a solid body to analyze");
  const md = app.viewport.meshFor(b.shape);
  if (!md || !md.triangles || !md.triangles.length) throw new Error(`Cannot analyze ${b.meta.name} because the geometry cannot be used to compute the analysis.`);
  const T = app.K.topoOf(b.shape);
  const bvh = buildBVH(md);
  const S = bvh.samples(28);
  const d = V3.norm(pull);
  const bb = app.K.bboxOf(b.shape);
  const diag = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
  const eps = Math.max(1e-4, diag * 1e-5);
  const per = new Map(); // face -> {w, t:[[t,w]], trapped, gap, draftBad}
  const F = (f) => { let x = per.get(f); if (!x) { x = { w: 0, tw: [], trapped: 0, gap: 0, bad: 0, n: 0, minGap: Infinity, draft: [] }; per.set(f, x); } return x; };
  for (const s of S) {
    if (s.face < 0) continue;
    const x = F(s.face);
    x.w += s.w; x.n++;
    // wall thickness: inward ray to the opposite wall
    const hin = bvh.ray(V3.add(s.p, s.n, -eps), [-s.n[0], -s.n[1], -s.n[2]], eps, Infinity);
    if (hin) x.tw.push([hin.t + eps, s.w]);
    // knife edges: outward ray that meets the part again across a thin gap
    const hout = bvh.ray(V3.add(s.p, s.n, eps), s.n, eps, rule.knifeEdge * 1.0001);
    if (hout && hout.face !== s.face && V3.dot(hout.n, s.n) < 0) { x.gap++; x.minGap = Math.min(x.minGap, hout.t); }
    // draft + undercuts relative to the pull direction
    const c = V3.dot(s.n, d);
    const ang = Math.asin(Math.min(1, Math.abs(c))) * 180 / Math.PI;
    x.draft.push(ang);
    if (ang < rule.minDraft) x.bad++;
    if (Math.abs(c) > 0.02) {
      const dir = c > 0 ? d : [-d[0], -d[1], -d[2]];
      const h = bvh.ray(V3.add(s.p, dir, eps * 4), dir, eps * 4, Infinity);
      if (h) x.trapped++;
    }
  }
  // per-face thickness (weighted median)
  const faceT = new Map();
  let all = [];
  for (const [f, x] of per) {
    if (!x.tw.length) continue;
    const arr = x.tw.slice().sort((a, b) => a[0] - b[0]);
    const half = arr.reduce((s, q) => s + q[1], 0) / 2;
    let acc = 0, med = arr[0][0];
    for (const [t, w] of arr) { acc += w; if (acc >= half) { med = t; break; } }
    faceT.set(f, med);
    all.push(...x.tw);
  }
  all.sort((a, b) => a[0] - b[0]);
  let nominal = NaN;
  { const half = all.reduce((s, q) => s + q[1], 0) / 2; let acc = 0; for (const [t, w] of all) { acc += w; if (acc >= half) { nominal = t; break; } } }
  const tVals = [...faceT.values()];
  const mkAlerts = (kind, faces, valueOf) => regions(T, faces).map((fs, i) => ({ id: `${kind}:${fs.join(",")}`, kind, faces: fs, region: i + 1, value: valueOf ? valueOf(fs) : null }));
  const thin = [...faceT].filter(([, t]) => t < rule.thicknessMin - 1e-6).map(([f]) => f);
  const thick = [...faceT].filter(([, t]) => t > rule.thicknessMax + 1e-6).map(([f]) => f);
  const variation = Number.isFinite(nominal) ? [...faceT].filter(([, t]) => Math.abs(t - nominal) / nominal > rule.variation / 100 + 1e-9).map(([f]) => f) : [];
  const minT = (fs) => Math.min(...fs.map((f) => faceT.get(f)));
  const maxT = (fs) => Math.max(...fs.map((f) => faceT.get(f)));
  const draftFaces = [...per].filter(([, x]) => x.n && x.bad / x.n > 0.5).map(([f]) => f);
  const underFaces = [...per].filter(([, x]) => x.n && x.trapped / x.n > 0.3).map(([f]) => f);
  const knifeFaces = [...per].filter(([, x]) => x.n && x.gap / x.n > 0.3).map(([f]) => f);
  const res = {
    body: bodyId, rule, pull: d,
    thickness: {
      alerts: [...mkAlerts("thin", thin, minT), ...mkAlerts("thick", thick, maxT), ...mkAlerts("variation", variation, (fs) => (Math.max(...fs.map((f) => Math.abs(faceT.get(f) - nominal) / nominal)) * 100))],
      faceT, nominal, tMin: tVals.length ? Math.min(...tVals) : NaN, tMax: tVals.length ? Math.max(...tVals) : NaN,
    },
    undercuts: { alerts: mkAlerts("undercut", underFaces) },
    draft: { alerts: mkAlerts("draft", draftFaces, (fs) => Math.min(...fs.map((f) => Math.min(...per.get(f).draft)))) },
    knife: { alerts: mkAlerts("knife", knifeFaces, (fs) => Math.min(...fs.map((f) => per.get(f).minGap))) },
  };
  for (const c of ["thickness", "undercuts", "draft", "knife"]) for (const a of res[c].alerts) a.ignored = !!ignored.get(`${bodyId}:${a.id}`);
  return res;
}

function ruleFor(app, bodyId) {
  try { const p = app.ui.plastic; if (p && typeof p.ruleFor === "function") { const r = p.ruleFor(bodyId); if (r) return { ...DEFAULT_RULE, ...r }; } } catch { /* use the default */ }
  return DEFAULT_RULE;
}

// gradient: dark blue (thin) -> red (thick)
function rampColor(t) {
  const stops = [[0, [0.05, 0.1, 0.55]], [0.25, [0.1, 0.45, 0.95]], [0.5, [0.15, 0.8, 0.35]], [0.75, [0.98, 0.85, 0.1]], [1, [0.9, 0.12, 0.1]]];
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i];
    const k = (t - a) / (b - a);
    const c = ca.map((x, j) => Math.round((x + (cb[j] - x) * k) * 255));
    return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  }
  return "#e61f1a";
}

function openDesignAdvice(app, ctx = {}) {
  beginModel(app);
  const painter = createFacePainter(app, "design-advice");
  const st = { res: null, tab: "summary", display: "alerts", alertType: "thin", isolate: false, selAlert: null, stale: false, error: null };
  const pre = (ctx.preselect || app.selection.items || []).map(toBodyRef).filter((r) => r && r.kind === "body").slice(0, 1);
  let resultsEl = null;

  const catAlerts = (cat) => (st.res ? st.res[cat].alerts : []);
  const visibleAlerts = (cat) => catAlerts(cat).filter((a) => !a.ignored && (cat !== "thickness" || a.kind === st.alertType));
  const count = (cat) => catAlerts(cat).filter((a) => !a.ignored).length;

  function paint() {
    if (!st.res || st.stale) { painter.clear(); return; }
    const body = st.res.body;
    const items = [];
    if (st.tab === "thickness" && st.display === "full") {
      const { faceT, tMin, tMax } = st.res.thickness;
      const span = Math.max(1e-9, tMax - tMin);
      for (const [f, t] of faceT) items.push({ body, faces: [f], color: rampColor((t - tMin) / span), opacity: 0.85 });
    } else {
      const cats = st.tab === "summary" ? ["thickness", "undercuts", "draft", "knife"] : [{ thickness: "thickness", undercuts: "undercuts", draft: "draft", knife: "knife" }[st.tab]];
      for (const c of cats) {
        let list = st.tab === "summary" ? catAlerts(c).filter((a) => !a.ignored) : visibleAlerts(c);
        if (st.isolate && st.selAlert) list = list.filter((a) => a.id === st.selAlert);
        for (const a of list) items.push({ body, faces: a.faces, color: a.id === st.selAlert ? "#ff2a1f" : "#e0302a", opacity: a.id === st.selAlert ? 0.9 : 0.7 });
      }
    }
    painter.paint(items);
  }

  function analyze(d) {
    const b = (d.values.body || [])[0];
    const p = (d.values.pull || [])[0];
    if (!b) { d.message("Select a solid body to analyze", "warning"); return; }
    let dir = pullOf(app, p);
    if (!dir) { d.message("Select a pull direction", "warning"); return; }
    if (d.values.flip) dir = [-dir[0], -dir[1], -dir[2]];
    const t0 = performance.now();
    try {
      st.res = analyzeBody(app, b.body, dir, ruleFor(app, b.body));
      st.error = null;
    } catch (e) {
      st.res = null;
      st.error = e.message || String(e);
      app.ui.modals && app.ui.modals.alert({ title: "Cannot analyze body", kind: "error", message: esc(st.error) });
    }
    st.stale = false;
    st.selAlert = null;
    const n = st.res ? ["thickness", "undercuts", "draft", "knife"].reduce((s, c) => s + count(c), 0) : 0;
    d.message(st.res ? `Analysis complete: ${n} alert${n === 1 ? "" : "s"} (${Math.round(performance.now() - t0)} ms)` : st.error, st.res ? "info" : "error");
    render();
    paint();
    app.emit("design-advice", { result: st.res });
  }

  function cardFor(cat, title, desc) {
    const n = count(cat);
    const card = el("div", { class: `mg-da-card${n ? " alert" : " ok"}`, "data-card": cat },
      el("div", { class: "mg-da-card-head" }, el("span", { class: "mg-da-ci", html: n ? GL.alert : GL.check }), el("b", { text: title }), el("span", { class: "mg-da-n", text: n ? `${n} alert${n === 1 ? "" : "s"}` : "No alerts" })));
    if (n) {
      card.append(el("div", { class: "mg-da-card-desc", html: desc }));
      card.append(el("button", { type: "button", class: "mg-btn", "data-action": `view-${cat}`, text: "View Details", on: { click: () => { st.tab = cat; render(); paint(); } } }));
    }
    return card;
  }
  const regionsText = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  function summary() {
    const R = st.res.rule;
    const th = catAlerts("thickness").filter((a) => !a.ignored);
    const thin = th.filter((a) => a.kind === "thin").length, thick = th.filter((a) => a.kind === "thick").length, vari = th.filter((a) => a.kind === "variation").length;
    const tdesc = [thin ? `<b>Too Thin:</b> ${regionsText(thin, "region is", "regions are")} thinner than the lower limit of the <b>Thickness Range</b>.` : "", thick ? `<b>Too Thick:</b> ${regionsText(thick, "region is", "regions are")} thicker than the upper limit of the <b>Thickness Range</b>.` : "", vari ? `<b>Large Thickness Variation:</b> ${regionsText(vari, "region exceeds", "regions exceed")} the maximum percentage <b>Thickness Variation</b>.` : ""].filter(Boolean).join("<br>");
    const u = count("undercuts"), dr = count("draft"), k = count("knife");
    void R;
    return el("div", { class: "mg-da-summary" },
      cardFor("thickness", "Thickness", tdesc),
      cardFor("undercuts", "Undercuts", `<b>Undercuts</b>: ${regionsText(u, "region contains", "regions contain")} undercuts that will interfere with ejection from a mold.`),
      cardFor("draft", "Draft", `<b>Insufficient Draft</b>: ${regionsText(dr, "region doesn't", "regions don't")} meet the <b>Minimum Draft Angle</b>.`),
      cardFor("knife", "Knife Edges", `<b>Knife Edges</b>: ${regionsText(k, "region contains", "regions contain")} thin gaps that fall below the <b>Knife Edge Threshold</b>.`));
  }
  function ruleBox(rows) {
    return el("div", { class: "mg-da-sec" }, el("div", { class: "mg-da-sech", text: `Rule Details: ${st.res.rule.name}` }),
      el("div", { class: "mg-da-kv" }, ...rows.flatMap(([k, v]) => [el("span", { text: k }), el("b", { text: v })])));
  }
  function alertList(cat) {
    const list = cat === "thickness" ? catAlerts(cat).filter((a) => a.kind === st.alertType) : catAlerts(cat);
    const box = el("div", { class: "mg-da-list", "data-list": cat });
    if (!list.length) { box.append(el("div", { class: "mg-da-none", html: `${GL.check} <span>No alerts</span>` })); return box; }
    const fmtV = (a) => (a.value == null || !Number.isFinite(a.value) ? "" : a.kind === "draft" ? `${a.value.toFixed(1)} deg` : a.kind === "variation" ? `${a.value.toFixed(0)} %` : `${a.value.toFixed(2)} mm`);
    for (const a of list) {
      const sel = el("select", { class: "mg-da-status", "data-action": "status", title: "Status" }, el("option", { value: "alert", text: "Alert" }), el("option", { value: "ignore", text: "Ignore" }));
      sel.value = a.ignored ? "ignore" : "alert";
      sel.addEventListener("click", (ev) => ev.stopPropagation());
      sel.addEventListener("change", () => { a.ignored = sel.value === "ignore"; if (a.ignored) ignored.set(`${st.res.body}:${a.id}`, true); else ignored.delete(`${st.res.body}:${a.id}`); render(); paint(); });
      const row = el("div", { class: `mg-da-row${a.id === st.selAlert ? " sel" : ""}${a.ignored ? " ignored" : ""}`, "data-alert": a.id },
        el("span", { class: "mg-da-ci", html: a.ignored ? GL.eye : GL.alert }), el("span", { class: "mg-da-rname", text: `Region ${a.region}` }), el("span", { class: "mg-da-rval", text: fmtV(a) }), el("span", { class: "mg-da-rfaces", text: `${a.faces.length} face${a.faces.length === 1 ? "" : "s"}` }), sel);
      row.addEventListener("click", () => {
        st.selAlert = st.selAlert === a.id ? null : a.id;
        render(); paint();
        if (st.selAlert) { const b = app.body(st.res.body); const T = b && app.K.topoOf(b.shape); if (T) app.setStatus(`Region ${a.region} | ${a.faces.length} Face${a.faces.length === 1 ? "" : "s"}`); }
      });
      box.append(row);
    }
    return box;
  }
  function recommendations(key) {
    const t = TEXT[key];
    return el("div", { class: "mg-da-sec mg-da-rec" }, el("div", { class: "mg-da-sech", text: "Recommendations" }),
      el("div", { class: "mg-da-prob", html: `<b>${esc(t.title)}</b><br>${esc(t.problem)}` }),
      el("div", { class: "mg-da-adv", html: `<b>Advice</b><ul>${t.advice.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` }));
  }
  function isolateBox() {
    const cb = el("input", { type: "checkbox", "data-input": "isolate", checked: st.isolate });
    cb.addEventListener("change", () => { st.isolate = cb.checked; paint(); });
    return el("label", { class: "mg-check", title: st.isolate ? "Shows all alerts in the canvas." : "Displays the selected alert and hides all other alerts in the canvas." }, cb, el("span", { text: "Isolate Alert" }));
  }
  function tabContent() {
    const R = st.res.rule;
    if (st.tab === "summary") return summary();
    if (st.tab === "thickness") {
      const disp = el("div", { class: "mg-togs", "data-input": "display" },
        ...[["alerts", "Alerts Only", "Displays the areas affected by thickness alerts as a red overlay on the solid body in the canvas."], ["full", "Full Range", "Displays the full range of thickness results as a gradient overlay on the solid body in the canvas. Red represents the thickest regions and dark blue represents the thinnest regions."]].map(([v, l, tip]) =>
          el("button", { type: "button", class: `mg-tog${st.display === v ? " on" : ""}`, "data-option": v, title: tip, text: l, on: { click: () => { st.display = v; render(); paint(); } } })));
      const typ = el("select", { class: "mg-in mg-da-type", "data-input": "alert-type" }, el("option", { value: "thin", text: "Too Thin" }), el("option", { value: "thick", text: "Too Thick" }), el("option", { value: "variation", text: "Large Thickness Variation" }));
      typ.value = st.alertType;
      typ.addEventListener("change", () => { st.alertType = typ.value; st.selAlert = null; render(); paint(); });
      const th = st.res.thickness;
      const legend = st.display === "full" ? el("div", { class: "mg-da-legend" }, el("span", { text: `${th.tMin.toFixed(2)} mm` }), el("span", { class: "mg-da-ramp" }), el("span", { text: `${th.tMax.toFixed(2)} mm` })) : null;
      return el("div", {},
        ruleBox([["Thickness Range", `${R.thicknessMin.toFixed(2)} mm - ${R.thicknessMax.toFixed(2)} mm`], ["Thickness Variation", `${R.variation} %`]]),
        el("div", { class: "mg-da-sec" }, el("div", { class: "mg-da-sech", text: "Details" }),
          el("div", { class: "mg-da-ctl" }, el("span", { text: "Display" }), disp), legend,
          el("div", { class: "mg-da-ctl" }, el("span", { text: "Alert Type" }), typ), isolateBox(), alertList("thickness")),
        recommendations(st.alertType));
    }
    if (st.tab === "undercuts") return el("div", {}, el("div", { class: "mg-da-sec" }, el("div", { class: "mg-da-sech", text: "Details" }), isolateBox(), alertList("undercuts")), recommendations("undercut"));
    if (st.tab === "draft") return el("div", {}, ruleBox([["Minimum Draft Angle", `${R.minDraft.toFixed(1)} deg`]]), el("div", { class: "mg-da-sec" }, el("div", { class: "mg-da-sech", text: "Details" }), isolateBox(), alertList("draft")), recommendations("draft"));
    return el("div", {}, ruleBox([["Knife Edge Threshold", `${R.knifeEdge.toFixed(2)} mm`]]), el("div", { class: "mg-da-sec" }, el("div", { class: "mg-da-sech", text: "Details" }), isolateBox(), alertList("knife")), recommendations("knife"));
  }
  function render() {
    if (!resultsEl) return;
    resultsEl.innerHTML = "";
    if (!st.res) {
      resultsEl.append(el("div", { class: "mg-da-prompt", text: st.stale ? "The selection changed. Click Analyze again." : "Click Analyze, then review results and recommendations" }));
      return;
    }
    const bar = el("div", { class: "mg-da-tabs", role: "tablist" });
    for (const [k, l] of TABS) {
      const n = k === "summary" ? 0 : count(k);
      bar.append(el("button", { type: "button", class: `mg-da-tab${st.tab === k ? " on" : ""}`, "data-tab": k, role: "tab", on: { click: () => { st.tab = k; st.selAlert = null; render(); paint(); } } }, l, n ? el("span", { class: "mg-da-badge", text: String(n) }) : null));
    }
    resultsEl.append(bar, el("div", { class: "mg-da-content", "data-tab-content": st.tab }, tabContent()));
  }

  const dlg = app.ui.dialog.open({
    id: "DesignAdviceCmd",
    title: "Design Advice",
    icon: "DesignAdviceCmd",
    help: "Identifies manufacturability concerns based on best practices for plastic injection molding, and provides recommendations to address them. Select a solid body and the pull direction, then click Analyze.",
    preview: false, noFeature: true, ctrlWidth: 200, focusHud: false,
    preselect: pre,
    rows: [
      { id: "body", type: "selection", label: "Body", kinds: ["body", "face", "edge"], mapRef: toBodyRef, max: 1, min: 0, tooltip: "Select a solid body to analyze.", prompt: "Select a solid body to analyze" },
      { id: "pull", type: "selection", label: "Pull Direction", kinds: ["originAxis", "originPlane", "cplane", "face", "edge", "sketchCurve"], max: 1, min: 0, tooltip: "Select a face, plane, linear edge, or axis to define the pull direction to use to identify undercuts and insufficient draft.", prompt: "Select a pull direction", filter: (r) => !!pullOf(app, r) },
      { id: "flip", type: "check", label: "Flip Pull Direction", default: false, tooltip: "Flips the pull direction used to identify undercuts and insufficient draft." },
      {
        id: "analyze", type: "custom",
        render(d) { return lrow("", el("button", { type: "button", class: "mg-btn mg-primary", "data-action": "analyze", text: "Analyze", title: "Analyzes the selected solid body against the plastic rule.", on: { click: () => analyze(d) } })); },
        update(e, d) { e.querySelector("button").disabled = !((d.values.body || []).length && (d.values.pull || []).length); },
      },
      {
        id: "results", type: "custom",
        render() { resultsEl = el("div", { class: "mg-da", "data-region": "advice-results" }); render(); return resultsEl; },
        update() {},
      },
    ],
    onOpen(d) {
      d.el.classList.add("mg-da-dlg");
      const ok = d.el.querySelector('[data-action="ok"]');
      if (ok) ok.textContent = "Close";
      const cancel = d.el.querySelector('[data-action="cancel"]');
      if (cancel) cancel.style.display = "none";
    },
    onChange(id) {
      if ((id === "body" || id === "pull" || id === "flip") && st.res) { st.res = null; st.stale = true; render(); paint(); }
    },
    afterPreview() { if (st.res) paint(); },
    status: () => (st.res ? "Design Advice" : ""),
    commit() { return st.res; },
    onClose() { painter.dispose(); },
  });
  dlg.advice = { state: st, analyze: () => analyze(dlg), render, paint };
  return dlg;
}

export function registerAdvice(app) {
  app.commands.register({
    id: "DesignAdviceCmd", label: "Design Advice", kind: "tool",
    tooltip: "Identifies manufacturability concerns based on best practices for plastic injection molding, and provides recommendations to address them.",
    run: (a, ctx) => openDesignAdvice(a, ctx),
  });
  // re-analysis after model edits: results are cleared (Fusion asks to analyze again)
  app.on("model", (d) => { if (d && d.preview) return; const cur = app.ui.dialog && app.ui.dialog.current; if (cur && cur.id === "DesignAdviceCmd" && cur.advice && cur.advice.state.res) { const b = app.body(cur.advice.state.res.body); if (!b) { cur.advice.state.res = null; cur.advice.state.stale = true; cur.advice.render(); cur.advice.paint(); } } });
}
