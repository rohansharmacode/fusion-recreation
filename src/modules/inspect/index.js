// inspect module: Fusion's INSPECT tools + appearance / material tools.
//   MeasureCommand (I)                 measure.js
//   FusionHalfSectionViewCommand        section.js   (Section Analysis, stored in doc.analyses)
//   FusionCenterOfMassCommand           com.js       (Center of Mass analysis + glyph)
//   AppearanceCommand (A)               appearance.js
//   PhysicalMaterialCommand             appearance.js
//   FusionPropertiesCommand             properties.js (aliases: PropertiesCommand, Properties, properties)
//
// Public API (app.ui.inspect):
//   analyses()                 -> [{id, type:'section'|'com', name, visible}]  (doc.analyses, Fusion's "Analysis" folder)
//   setAnalysisVisible(id, v)  edit(id)  remove(id)  rename(id, name)
//   measure(refA, refB?)       -> {a, b, pair} numbers for scripts/tests
//   massProperties(bodyIds?)   -> {volume, area, mass, density, com, bbox, inertiaCom, inertiaOrigin}
//   materials / appearances    library tables
// Events: 'analyses' {} whenever the analysis list or a visibility changes.
import "./style.css";
import { installAppearances, APPEARANCES, MATERIALS, APPEARANCE_CATEGORIES, MATERIAL_CATEGORIES } from "./library.js";
import { registerMeasure } from "./measure.js";
import { describe, measurePair, massProps, visibleBodyIds } from "./geom.js";
import { createAnalyses } from "./analyses.js";
import { registerSection, openSection, openCom } from "./section.js";
import { registerAppearance, applyAppearance, applyMaterial } from "./appearance.js";
import { registerProperties } from "./properties.js";

export function init(app) {
  installAppearances(app);
  const api = {
    appearances: APPEARANCES,
    materials: MATERIALS,
    appearanceCategories: APPEARANCE_CATEGORIES,
    materialCategories: MATERIAL_CATEGORIES,
    analyses: () => store.list(),
    analysis: (id) => store.get(id),
    setAnalysisVisible: (id, v) => store.setVisible(id, v),
    removeAnalysis: (id) => store.remove(id),
    renameAnalysis: (id, name) => store.rename(id, name),
    editAnalysis(id) {
      const a = store.get(id);
      if (!a) return null;
      app.emit("command-start", { id: a.type === "section" ? "FusionHalfSectionViewCommand" : "FusionCenterOfMassCommand" });
      return a.type === "section" ? openSection(app, store, { editId: id }) : openCom(app, store, { editId: id });
    },
    get clipping() { return store.clipping; },
    measure(a, b) {
      const da = a ? describe(app, a) : null, db = b ? describe(app, b) : null;
      return { a: da, b: db, pair: a && b ? measurePair(app, a, b, da, db) : null };
    },
    massProperties(ids) { return massProps(app, ids && ids.length ? ids : visibleBodyIds(app)); },
    applyAppearance: (refs, id) => applyAppearance(app, refs, id),
    applyMaterial: (refs, id) => applyMaterial(app, refs, id),
  };
  const store = createAnalyses(app);
  app.ui.inspect = api;
  registerMeasure(app);
  registerSection(app, store);
  registerAppearance(app);
  registerProperties(app);
}
