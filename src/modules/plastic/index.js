// plastic module: the PLASTIC tab and the plastic-style solid features. Timeline feature types (registered
// with model.js registerFeature): rib, web, emboss, boss, lip, rest, snapFit; commands FusionRibCommand,
// FusionWebCommand, EmbossCmd, FusionBossCommand, FusionLipCommand, FusionRestCommand, FusionSnapFitCommand,
// FusionAssignPlasticRuleCommand and FusionManagePlasticRuleCommand (plastic rules: rules.js). Docs: ./README.md
import "./style.css";
import * as F from "./features.js";
import * as RU from "./rules.js";
import { openThin, openEmboss, openBoss, openLip, openRest, openSnapFit, begin } from "./dialogs.js";
import { createRulesUI } from "./rules-ui.js";

const sk = (refs) => [...new Set((refs || []).map((r) => r && r.sketch).filter(Boolean))];
const faceGeo = (refs, kind = "face") => (refs || []).filter((r) => r && r.body && Array.isArray(r.p)).map((r) => ({ kind, body: r.body, p: r.p, n: r.n }));
/** Dependencies of an optional extra reference (plane, face, edge, sketch entity). */
const refDeps = (refs) => {
  const out = { sketches: [], cplanes: [], geo: [] };
  for (const r of (refs || []).filter(Boolean)) {
    if (r.kind === "cplane") out.cplanes.push(r.id);
    else if (r.sketch) out.sketches.push(r.sketch);
    else if (r.body && Array.isArray(r.p)) out.geo.push({ kind: Array.isArray(r.n) ? "face" : "edge", body: r.body, p: r.p, n: r.n });
  }
  return out;
};
const merge = (...ds) => { const o = { sketches: [], cplanes: [], bodies: [], geo: [] }; for (const d of ds) for (const k of Object.keys(o)) o[k].push(...(d[k] || [])); return o; };

/** Feature types: evaluator, expression fields, dependencies, dialog. */
export const TYPES = {
  rib: { label: "Rib", icon: "FusionRibCommand", cmd: "FusionRibCommand", apply: F.applyRib,
    open: (app, o) => openThin(app, "rib", o), deps: (f) => merge({ sketches: f.curves ? [f.curves.sketch] : [] }, refDeps([f.pull])) },
  web: { label: "Web", icon: "FusionWebCommand", cmd: "FusionWebCommand", apply: F.applyWeb,
    open: (app, o) => openThin(app, "web", o), deps: (f) => ({ sketches: f.curves ? [f.curves.sketch] : [] }) },
  emboss: { label: "Emboss", icon: "EmbossCmd", cmd: "EmbossCmd", apply: F.applyEmboss, open: openEmboss,
    deps: (f) => ({ sketches: sk(f.profiles), geo: faceGeo(f.faces) }), touches: (f) => [...new Set((f.faces || []).map((r) => r.body))] },
  boss: { label: "Boss", icon: "FusionBossCommand", cmd: "FusionBossCommand", apply: F.applyBoss, open: openBoss, deps: (f) => ({ sketches: sk(f.points) }) },
  lip: { label: "Lip", icon: "FusionLipCommand", cmd: "FusionLipCommand", apply: F.applyLip, open: openLip,
    deps: (f) => merge({ geo: [...faceGeo(f.edges, "edge"), ...faceGeo(f.guide ? [f.guide] : [])] }, refDeps([f.pull, f.extent1, f.extent2])), touches: (f) => [...new Set((f.edges || []).map((r) => r.body))] },
  rest: { label: "Rest", icon: "FusionRestCommand", cmd: "FusionRestCommand", apply: F.applyRest, open: openRest,
    deps: (f) => merge({ sketches: sk(f.profiles), bodies: f.body ? [f.body] : [], geo: faceGeo(f.topFaces) }, refDeps([f.object, f.object2])),
    touches: (f) => (f.body ? [f.body] : []) },
  snapFit: { label: "Snap Fit", icon: "FusionSnapFitCommand", cmd: "FusionSnapFitCommand", stem: "Snap Fit", apply: F.applySnapFit, open: openSnapFit,
    deps: (f) => merge({ sketches: [...sk(f.points), ...(f.selectMode === "auto" && f.autoSketch ? [f.autoSketch] : [])] }, refDeps([f.align])) },
};

const TIPS = {
  FusionRibCommand: ["Rib", "Thickens an open sketch curve into a rib that runs to the nearest faces."],
  FusionWebCommand: ["Web", "Thickens an open sketch curve into a web that runs to the nearest faces."],
  EmbossCmd: ["Emboss", "Raises or sinks a sketch profile into the faces of a body."],
  FusionBossCommand: ["Boss", "Creates a boss to fasten two plastic bodies together."],
  FusionLipCommand: ["Lip", "Creates a lip and groove between two plastic bodies."],
  FusionRestCommand: ["Rest", "Cuts a flat landing area into a plastic part."],
  FusionSnapFitCommand: ["Snap Fit", "Creates a cantilever snap fit between two plastic bodies."],
  FusionAssignPlasticRuleCommand: ["Assign Plastic Rule", "Assigns material and wall thickness rules to a plastic part."],
  FusionManagePlasticRuleCommand: ["Manage Plastic Rules", "Creates and edits plastic material and thickness rules."],
};

export function init(app) {
  // feature types first: documents that use them must evaluate even without the dialogs
  for (const [type, t] of Object.entries(TYPES)) {
    try {
      app.M.registerFeature(type, {
        label: t.label, stem: t.stem || t.label, fields: F.FIELDS[type], apply: t.apply, icon: t.icon,
        deps: (f) => ({ sketches: [], cplanes: [], bodies: [], features: [], geo: [], ...t.deps(f) }),
        touches: t.touches || (() => []),
        editor: (a, id) => t.open(a, { editId: id }),
      });
    } catch (e) { console.error("[plastic]", e); }
  }
  if (!app.ui.dialog) return; // no dialog framework (--only build without dialogs)
  const rules = createRulesUI(app);
  app.ui.plastic = { rules: RU, openManage: rules.openManage, openAssign: rules.openAssign, types: TYPES };
  for (const t of Object.values(TYPES)) {
    const [label, tooltip] = TIPS[t.cmd];
    app.commands.register({ id: t.cmd, label, tooltip, icon: t.cmd, kind: "feature", run: (a, ctx = {}) => { const pre = begin(a); return t.open(a, { preselect: ctx.preselect || pre }); } });
  }
  const R = (id, run) => { const [label, tooltip] = TIPS[id]; app.commands.register({ id, label, tooltip, icon: id, kind: "feature", run }); };
  R("FusionAssignPlasticRuleCommand", (a, ctx = {}) => { const pre = begin(a); return rules.openAssign({ preselect: ctx.preselect || pre }); });
  R("FusionManagePlasticRuleCommand", () => rules.openManage());
}
