// The PMI node of the Browser (Fusion: "PMI" = Product Manufacturing Information): one row per
// annotation with eye, rename, Edit PMI / Delete / Show/Hide / Find in Timeline, a warning badge for
// orphaned PMI; annotations on the same geometry are grouped (Fusion: "If multiple PMI items relate to
// the same geometric feature, they are grouped together").
// Registered with app.ui.browser.registerFolder({key:'annotations', label:'PMI', ...}); rows are keyed
// feature:<id> like the browser's own registered-feature rows (so Browser reveal / rename find them).
import { setFeatureVisible, renameFeature, deleteFeatures } from "../timeline/actions.js";
import { glyph, esc } from "../browser/ui.js";
import { isPmi, TYPE_LABELS } from "./annotations.js";
import { PMI_ICONS } from "./icons.js";

export function pmiFolder(app, svc) {
  const res = (app.result && app.result.results) || {};
  const feats = app.doc.features.filter((f) => isPmi(f) && res[f.id] && !res[f.id].rolled && !res[f.id].suppressed && !f.suppressed);
  if (!feats.length) return null;
  const startRename = (key) => { if (app.ui.browser && app.ui.browser.rename) app.ui.browser.rename(key); };
  const editFeature = (id) => { if (app.ui.timeline && app.ui.timeline.edit) app.ui.timeline.edit(id); else app.editFeature(id); };
  const findInTimeline = (id) => { if (app.ui.timeline && app.ui.timeline.reveal) app.ui.timeline.reveal(id); };
  const vis = (f) => f.visible !== false;
  const anyVis = feats.some(vis);
  const ids = feats.map((f) => f.id);
  const targets = (id) => {
    const sel = app.selection.items.filter((r) => r.kind === "feature" && ids.includes(r.id)).map((r) => r.id);
    return sel.includes(id) ? sel : [id];
  };
  const node = (f) => {
    const sp = svc.spec(f.id);
    const key = `feature:${f.id}`;
    const ref = { kind: "feature", id: f.id };
    const v = vis(f);
    const warn = sp && sp.warning;
    const kind = TYPE_LABELS[f.type] || "PMI";
    return {
      key, label: f.name, icon: PMI_ICONS.browser(f), eye: v, ref, renamable: true,
      badge: warn ? glyph("warning", 14) : "",
      tip: `<b>${esc(f.name)}</b><div class="br-tip-sub">${esc(kind)}</div>${warn ? `<div class="br-tip-warn">${esc(warn)}</div>` : ""}`,
      onEye: () => setFeatureVisible(app, targets(f.id), !v),
      onDbl: () => editFeature(f.id),
      rename: (name) => renameFeature(app, f.id, name),
      menu: () => [
        { label: "Edit PMI", cmd: `Edit${({ pmiNote: "LeaderLineNote", pmiDimension: "DimensionNote", pmiGdt: "GeometricToleranceNote", pmiHoleNote: "HoleThreadNote", pmiGeneralNote: "GeneralNote" })[f.type] || "PMI"}`, act: "edit-pmi", icon: "m-editfeature", action: () => editFeature(f.id) },
        "-",
        { label: "Delete", act: "delete", hint: "Del", icon: "m-delete", action: () => deleteFeatures(app, targets(f.id)) },
        { label: "Rename", cmd: "RenameBrowserCmd", act: "rename", action: () => startRename(key) },
        "-",
        { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", hint: "V", icon: "m-eye", action: () => setFeatureVisible(app, targets(f.id), !v) },
        "-",
        { label: "Find in Timeline", cmd: "FusionFindInTimeline", act: "find-timeline", action: () => findInTimeline(f.id) },
      ],
    };
  };
  // group annotations of the same geometry (hole notes of one Hole feature, notes on one face ...)
  const groups = new Map();
  for (const f of feats) {
    const sp = svc.spec(f.id);
    let gk = null, label = null;
    if (sp && sp.hole && sp.hole.feature) { gk = `hole:${sp.hole.feature}`; label = sp.hole.featureName; }
    else if (sp && sp.selRefs && sp.selRefs[0] && sp.selRefs[0].index >= 0) {
      const r = sp.selRefs[0];
      gk = `${r.body}:${r.kind}:${r.index}`;
      const b = app.doc.bodies[r.body];
      label = `${b ? b.name : "Body"} ${r.kind === "face" ? "Face" : "Edge"}`;
    } else if (f.type === "pmiGdt" && f.annot) {
      gk = `annot:${f.annot}`;
      const host = app.feature(f.annot);
      label = host ? host.name : null;
    }
    const k = gk || `single:${f.id}`;
    if (!groups.has(k)) groups.set(k, { label, list: [] });
    groups.get(k).list.push(f);
  }
  // a frame attached to a dimension joins that dimension's group
  for (const [k, g] of [...groups]) {
    if (!k.startsWith("annot:")) continue;
    const hostId = k.slice(6);
    const hostKey = [...groups.keys()].find((kk) => groups.get(kk).list.some((f) => f.id === hostId));
    if (hostKey && hostKey !== k) { groups.get(hostKey).list.push(...g.list); groups.delete(k); }
  }
  const children = [];
  for (const [k, g] of groups) {
    if (g.list.length === 1) { children.push(node(g.list[0])); continue; }
    const gv = g.list.some(vis);
    const gids = g.list.map((f) => f.id);
    children.push({
      key: `pmigroup:${k}`, label: g.label || "PMI", icon: PMI_ICONS.generic(), eye: gv,
      tip: `<b>${esc(g.label || "PMI")}</b><div class="br-tip-sub">Feature contains multiple PMI</div>`,
      selectAll: gids.map((id) => ({ kind: "feature", id })),
      onEye: () => setFeatureVisible(app, gids, !gv),
      menu: () => [{ label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", hint: "V", icon: "m-eye", action: () => setFeatureVisible(app, gids, !gv) }],
      children: g.list.map(node),
    });
  }
  return {
    key: "annotations:root", label: "PMI", icon: glyph("br-folder"), eye: anyVis,
    tip: "<b>PMI</b><div class=\"br-tip-sub\">Product Manufacturing Information (PMI)</div>",
    selectAll: ids.map((id) => ({ kind: "feature", id })),
    onEye: () => setFeatureVisible(app, ids, !anyVis),
    menu: () => [
      { label: "Change PMI Settings", cmd: "FusionChangePMISettingsCmd", act: "pmi-settings", action: () => app.commands.run("FusionChangePMISettingsCmd") },
      "-",
      { label: "Show/Hide", cmd: "VisibilityToggleCmd", act: "toggle-visibility", hint: "V", icon: "m-eye", action: () => setFeatureVisible(app, ids, !anyVis) },
    ],
    children,
  };
}
