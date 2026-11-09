// assembly: DOF Analysis, Component Connection Analysis, Assembly Statistics, Duplicate With Joints and Add To
// Assembly (the local-file equivalent: a new Hybrid Design that holds the part as a component).
import * as M from "../../model.js";
import * as X from "./math.js";
import * as S from "./solver.js";
import * as F from "./features.js";
import { JOINT_KINDS, labelOf } from "./dialogs.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const AXN = { x: "X", y: "Y", z: "Z" };
const NEXT = { x: "y", y: "z", z: "x" };

/** Remaining degrees of freedom of every occurrence: [{occ, label, dof, names: [..], p}]. Open chains are exact. */
export function dofTable(app) {
  const st = app.result.state, doc = app.doc, model = F.buildModel(st, doc);
  const res = S.solve(model, null, { close: false });
  const inTree = (o) => res.tree.has(o) || res.anchors.has(o) || res.floating.has(o);
  const loopsOf = new Map();
  // a loop joint removes what it constrains: relation-only constraints their residual size, joints 6 minus their DOFs
  for (const l of res.loops) {
    const k = S.LOOP_ONLY.has(l.J.jointType) ? l.res.length : 6 - (S.DOFS[l.J.jointType] || []).length;
    for (const o of [l.J.a, l.J.b]) loopsOf.set(o, (loopsOf.get(o) || 0) + k);
  }
  const names = (J) => {
    const r = J.rotAxis || "z", s = J.slideAxis || (J.jointType === "pinslot" ? "x" : "z");
    switch (J.jointType) {
      case "revolute": return [`Rotation ${AXN[r]}`];
      case "slider": return [`Slide ${AXN[s]}`];
      case "cylindrical": return [`Rotation ${AXN[r]}`, `Slide ${AXN[r]}`];
      case "pinslot": return [`Rotation ${AXN[r]}`, `Slide ${AXN[s]}`];
      case "planar": return [`Rotation ${AXN[r]}`, `Slide ${AXN[NEXT[r]]}`, `Slide ${AXN[NEXT[NEXT[r]]]}`];
      case "ball": return ["Pitch", "Yaw", "Roll"];
      default: return [];
    }
  };
  const out = [];
  const one = (o) => {
    if (model.grounded.has(o)) return { dof: 0, names: [] };
    const parent = model.parent.get(o);
    if (!inTree(o) && parent && parent !== F.ROOT) return { ...one(parent), inherited: true };
    if (!inTree(o)) return { dof: 6, names: ["Free"] };
    // the first component of a cluster that hangs on nothing is free; the others move relative to it
    if (!S.anchored(res, o) && !res.tree.has(o)) return { dof: 6, names: ["Free"] };
    const chain = S.chain(res, o), list = chain.flatMap(names);
    let dof = list.length - (loopsOf.get(o) || 0);
    dof = Math.max(0, Math.min(6, dof));
    return { dof, names: dof ? list : [] };
  };
  for (const oid of st.occ.keys()) {
    const r = one(oid);
    const ids = M.occBodiesDeep(st, oid);
    out.push({ occ: oid, label: labelOf(app, oid), dof: r.dof, names: r.names, text: r.names.join(", "), p: ids.length ? M.bodiesBBoxCenter(st, ids) : X.origin(F.occT(st, oid)) });
  }
  return out;
}

/** Joints, rigid groups and links that connect each occurrence: [{occ, label, links:[{name, other, kind}]}]. */
export function connections(app, occs) {
  const st = app.result.state, doc = app.doc, out = [];
  const lbl = (o) => labelOf(app, o);
  const top = (o) => F.pathOf(st, o).slice(1);
  for (const oid of occs || [...st.occ.keys()]) {
    const links = [];
    for (const f of doc.features) {
      if (f.suppressed) continue;
      const r = app.featureResult(f.id);
      if (r && (r.ok === false || r.rolled)) continue;
      if (JOINT_KINDS.includes(f.type) && (f.occ1 === oid || f.occ2 === oid || top(oid).includes(f.occ1) || top(oid).includes(f.occ2))) {
        const other = f.occ1 === oid || top(oid).includes(f.occ1) ? f.occ2 : f.occ1;
        links.push({ name: f.name, other: lbl(other), kind: f.type === "constraint" ? "Constraint" : f.asBuilt ? "As-built Joint" : "Joint", type: S.TYPE_LABEL[f.jointType] || f.jointType });
      }
      if (f.type === "rigidgroup" && (f.occs || []).includes(oid)) links.push({ name: f.name, other: (f.occs || []).filter((o) => o !== oid).map(lbl).join(", "), kind: "Rigid Group", type: "Rigid" });
    }
    const meta = (doc.occurrences || {})[oid] || {};
    out.push({ occ: oid, label: lbl(oid), grounded: !!meta.grounded, links });
  }
  return out;
}

const table = (head, rows) => `<table class="asm-table"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
function htmlRow(id, html) {
  return {
    id, type: "custom", label: "",
    render(dlg) { const el = document.createElement("div"); el.className = "asm-panel"; el.dataset.input = id; el.innerHTML = html(dlg); return el; },
    update(el, dlg) { el.innerHTML = html(dlg); },
  };
}

// ------------------------------------------------------------------ Component Connection Analysis
export function openConnectionAnalysis(app, opts = {}) {
  const saved = app.doc.connectionAnalysis;
  if (opts.edit && !saved) { app.toast("There is no component connection analysis to edit.", "info"); return null; }
  const pre = opts.edit ? saved.occs.filter((o) => app.result.state.occ.has(o)).map((o) => ({ kind: "occurrence", occ: o })) : (opts.preselect || []);
  const toOcc = (r, dlg) => { const o = r.kind === "occurrence" ? r.occ : r.body ? F.ownerOf(dlg.baseState, r.body) : null; return o && o !== F.ROOT ? { kind: "occurrence", occ: o } : null; };
  const id = opts.edit ? "FusionEditComponentConnectionAnalysisCommand" : "FusionComponentConnectionAnalysisCommand";
  return app.ui.dialog.open({
    id, title: "Component Connection Analysis", icon: "FusionComponentConnectionAnalysisCommand", featureLabel: "Component Connection Analysis",
    help: "Shows how components are connected to each other.", preview: false, noFeature: true,
    preselect: pre.filter(Boolean),
    rows: [
      { id: "comps", type: "selection", label: "Components", kinds: ["occurrence", "body", "face", "edge"], max: 0, min: 0, mapRef: toOcc, advance: false, prompt: "Select components (none = all)" },
      htmlRow("report", (dlg) => {
        const sel = [...new Set((dlg.values.comps || []).map((r) => r.occ))];
        const list = connections(app, sel.length ? sel : null);
        if (!list.length) return "<i>The design has no components.</i>";
        const rows = list.map((c) => [esc(c.label) + (c.grounded ? " <span class=\"asm-pin\">(pinned)</span>" : ""), c.links.length ? c.links.map((l) => `${esc(l.name)} <span class="asm-dim">${esc(l.type)} to ${esc(l.other)}</span>`).join("<br>") : "<span class=\"asm-warn\">Not connected</span>"]);
        const free = list.filter((c) => !c.links.length && !c.grounded).length;
        return `${table(["Component", "Connections"], rows)}<div class="asm-sum">${list.length} components, ${free} not connected</div>`;
      }),
    ],
    commit(_f, dlg) {
      const occs = [...new Set((dlg.values.comps || []).map((r) => r.occ))];
      app.mutate("Component Connection Analysis", (doc) => { doc.connectionAnalysis = { occs }; }, { recompute: false });
      return true;
    },
  });
}

// ------------------------------------------------------------------ Assembly Statistics
export function statistics(app) {
  const st = app.result.state, doc = app.doc;
  const feats = doc.features.filter((f) => !f.suppressed && !(app.featureResult(f.id) || {}).rolled);
  const depthOf = (o) => F.pathOf(st, o).length - 1;
  const comps = new Set([...st.occ.values()].map((o) => o.component));
  const count = (pred) => feats.filter(pred).length;
  return {
    components: comps.size, occurrences: st.occ.size, bodies: M.allBodyIds(st).length,
    joints: count((f) => f.type === "joint" && !f.asBuilt), asBuilt: count((f) => f.type === "joint" && f.asBuilt),
    constraints: count((f) => f.type === "constraint"), jointOrigins: count((f) => f.type === "jointorigin"),
    rigidGroups: count((f) => f.type === "rigidgroup"), motionLinks: count((f) => f.type === "motionlink"),
    contactSets: (doc.contactSets || []).length, pinned: Object.values(doc.occurrences || {}).filter((o) => o.grounded).length,
    depth: Math.max(0, ...[...st.occ.keys()].map(depthOf)),
  };
}
export function openStatistics(app) {
  const s = statistics(app);
  const rows = [["Unique components", s.components], ["Component occurrences", s.occurrences], ["Bodies", s.bodies], ["Maximum depth", s.depth], ["Pinned components", s.pinned], ["Joints", s.joints], ["As-built joints", s.asBuilt], ["Constraints", s.constraints], ["Joint origins", s.jointOrigins], ["Rigid groups", s.rigidGroups], ["Motion links", s.motionLinks], ["Contact sets", s.contactSets]];
  return app.ui.dialog.open({
    id: "FusionAssemblyStatisticsCommand", title: "Assembly Statistics", icon: "FusionAssemblyStatisticsCommand", featureLabel: "Assembly Statistics",
    help: "Lists counts of components, bodies and joints.", preview: false, noFeature: true,
    rows: [htmlRow("stats", () => table(["Statistic", "Count"], rows.map(([k, v]) => [esc(k), `<b data-stat="${esc(k)}">${v}</b>`])))],
    commit: () => true,
  });
}

// ------------------------------------------------------------------ Duplicate With Joints
/** Copy an occurrence (another occurrence of its component) together with the joints and rigid groups attached to it. */
export function duplicateWithJoints(app, ctx = {}) {
  const st = app.result.state, C = app.components;
  const refs = ctx.preselect || app.selection.items;
  const src = (refs || []).map((r) => (r.kind === "occurrence" ? r.occ : r.body ? F.ownerOf(st, r.body) : null)).find((o) => o && o !== F.ROOT && st.occ.has(o));
  if (!src) { app.toast("Select a component to duplicate with its joints.", "warning"); return null; }
  const e = C.info(src);
  const under = new Set(M.occSubtree(st, src));
  const owned = (b) => under.has(F.ownerOf(st, b));
  let made = null, n = 0;
  app.mutate("Duplicate With Joints", (d) => {
    const oid = M.newOccurrenceMeta(d, e.component);
    const f = { type: "component", mode: "paste", comp: e.component, newOcc: oid, source: e.inst || src, T: e.T.slice(), name: `${e.name}:${d.occurrences[oid].n}` };
    if (e.parent && e.parent !== F.ROOT) { f.parent = e.parent; f.occ = e.parent; } else f.occ = null;
    app._prepareFeature(d, f);
    d.features.splice(d.marker, 0, f);
    d.marker += 1;
    const mapOcc = (o) => (o === src ? oid : o);
    const mapRef = (r) => (r && r.body && owned(r.body) ? { ...r, body: `${M.instanceBase(r.body)}@${oid}` } : r);
    for (const g of d.features.slice()) {
      if (g.suppressed || g === f) continue;
      let copy = null;
      if (JOINT_KINDS.includes(g.type) && (g.occ1 === src || g.occ2 === src) && g.occ1 !== g.occ2) {
        copy = JSON.parse(JSON.stringify(g));
        copy.occ1 = mapOcc(g.occ1); copy.occ2 = mapOcc(g.occ2);
        if (copy.comp1) copy.comp1 = mapOcc(copy.comp1);
        if (copy.comp2) copy.comp2 = mapOcc(copy.comp2);
        copy.ref1 = mapRef(copy.ref1); copy.ref2 = mapRef(copy.ref2);
        if (copy.refs) copy.refs = copy.refs.map(mapRef);
      } else if (g.type === "rigidgroup" && (g.occs || []).includes(src)) {
        copy = JSON.parse(JSON.stringify(g));
        copy.occs = copy.occs.map(mapOcc);
        if (copy.picked) copy.picked = copy.picked.map(mapOcc);
      }
      if (!copy) continue;
      for (const k of ["id", "p", "name"]) delete copy[k];
      if (copy.type !== "rigidgroup") copy.name = nameFor(d, g);
      app._prepareFeature(d, copy);
      d.features.splice(d.marker, 0, copy);
      d.marker += 1;
      n++;
    }
    made = oid;
  });
  if (made) app.toast(`Duplicated ${e.label} with ${n} ${n === 1 ? "joint" : "joints"}.`, "info");
  return made;
}
function nameFor(doc, g) {
  const stem = String(g.name || "Joint").replace(/\d+$/, "");
  const used = new Set(doc.features.map((f) => f.name));
  for (let i = 1; ; i++) if (!used.has(`${stem}${i}`)) return `${stem}${i}`;
}

// ------------------------------------------------------------------ Add To Assembly
/**
 * Add To Assembly: the part is saved (local design store), then a new design opens with the part's features and its
 * bodies in one component named after the part (Hybrid Design). Fusion links the part as an external component from
 * the cloud; here the part is copied (local equivalent).
 */
export function addToAssembly(app) {
  if (app.components && app.components.list().length) { app.toast("The design already has components.", "info"); return null; }
  const files = app.ui.files;
  const part = JSON.parse(JSON.stringify(app.doc));
  const name = part.name || "Untitled";
  try { if (files && app.dirty && part.features.length) files.saveAs(name, part.fileId || null); } catch (e) { console.warn("[assembly] save part", e); app.toast(`Could not save ${name}. Save the part, then try again.`, "error"); return null; }
  const doc = JSON.parse(JSON.stringify(app.doc));
  delete doc.fileId; delete doc.savedVersion;
  doc.name = "Untitled";
  if (files && files.loadDoc) files.loadDoc(doc, null); else app.loadDocument(doc);
  // one component that holds every body of the part, named after the part
  const bodies = M.allBodyIds(app.result.state).filter((id) => !M.isInstanceId(id));
  let occ = null;
  app.mutate("Add To Assembly", (d) => {
    const ids = M.newComponentMeta(d, { name });
    const f = { type: "component", mode: bodies.length ? "bodies" : "empty", comp: ids.comp, newOcc: ids.occ, name: d.components[ids.comp].name, occ: null };
    if (bodies.length) f.bodies = bodies;
    app._prepareFeature(d, f);
    d.features.splice(d.marker, 0, f);
    d.marker += 1;
    occ = ids.occ;
  });
  app.dirty = true;
  app.toast(`${name} was added to a new assembly design.`, "info");
  return occ;
}
