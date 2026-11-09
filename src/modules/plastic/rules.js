// Plastic rules (data, no DOM): the default rule library, rules stored in the design, rule
// assignment to components and the defaults plastic features derive from a rule.
//   doc.plastic = { rules: [rule], assign: { [componentId]: ruleId } }     ('root' = the root component)
//   rule = { id, name, material (physical material id), units:'mm'|'in', thickness, thicknessVariation,
//            draftAngle, minimumDraftAngle, nominalRadius, knifeEdgeThreshold, revealHeight, clearance,
//            minimumThickness, maximumThickness }   values are expression strings; they may use "Thickness"
//            (Fusion: "Thickness / 2 + 1 mm"); bare numbers use the rule units.
import * as E from "../../expr.js";

/** Rule value fields in the order of Fusion's Edit Plastic Rule dialog: [key, label, kind]. */
export const RULE_FIELDS = [
  ["thickness", "Thickness", "length"],
  ["draftAngle", "Draft Angle", "angle"],
  ["minimumThickness", "Minimum Thickness", "length"],
  ["maximumThickness", "Maximum Thickness", "length"],
  ["minimumDraftAngle", "Minimum Draft Angle", "angle"],
  ["nominalRadius", "Nominal Radius", "length"],
  ["thicknessVariation", "Thickness Variation", "length"],
  ["knifeEdgeThreshold", "Knife Edge Threshold", "length"],
  ["revealHeight", "Reveal Height", "length"],
  ["clearance", "Clearance", "length"],
];

/** Plastic physical materials offered by the rules (ids of the inspect material library). */
export const PLASTIC_MATERIALS = [
  ["abs-plastic", "ABS Plastic"], ["polycarbonate-clear", "Polycarbonate, Clear"], ["polypropylene", "Polypropylene"],
  ["nylon-6-6", "Nylon 6/6"], ["acetal-resin-white", "Acetal Resin, White"], ["polyethylene-high-density", "Polyethylene, High Density"],
  ["polystyrene-high-impact", "Polystyrene, High Impact"], ["pmma-plastic", "PMMA Plastic"],
];
export const materialName = (id) => (PLASTIC_MATERIALS.find((m) => m[0] === id) || [id, id || "ABS Plastic"])[1];

const rule = (id, name, material, units, T, o = {}) => ({
  id, name, material, units,
  thickness: T, draftAngle: o.draft || "1.0 deg",
  minimumThickness: o.min, maximumThickness: o.max, minimumDraftAngle: o.minDraft || "0.5 deg",
  nominalRadius: "Thickness * 0.5", thicknessVariation: "Thickness * 0.25", knifeEdgeThreshold: "Thickness * 0.5",
  revealHeight: "Thickness * 0.25", clearance: o.clearance || "0.10 mm",
});
/**
 * Default library (metric and imperial base rules, like Fusion's). Values follow common injection
 * moulding practice for each resin; the default rule is ABS (1.5mm).
 */
export const DEFAULT_LIBRARY = [
  rule("lib-abs-1-5", "ABS (1.5mm)", "abs-plastic", "mm", "1.50 mm", { min: "1.14 mm", max: "3.56 mm" }),
  rule("lib-abs-2", "ABS (2mm)", "abs-plastic", "mm", "2.00 mm", { min: "1.14 mm", max: "3.56 mm" }),
  rule("lib-abs-0-08", "ABS (0.08in)", "abs-plastic", "in", "0.08 in", { min: "0.045 in", max: "0.14 in", clearance: "0.004 in" }),
  rule("lib-pc-2", "PC (2mm)", "polycarbonate-clear", "mm", "2.00 mm", { min: "1.02 mm", max: "3.81 mm" }),
  rule("lib-pp-1-5", "PP (1.5mm)", "polypropylene", "mm", "1.50 mm", { min: "0.64 mm", max: "3.81 mm", draft: "1.5 deg" }),
  rule("lib-pa66-2", "Nylon 6/6 (2mm)", "nylon-6-6", "mm", "2.00 mm", { min: "0.76 mm", max: "2.92 mm", draft: "0.5 deg", minDraft: "0.25 deg" }),
  rule("lib-pom-1-5", "POM (1.5mm)", "acetal-resin-white", "mm", "1.50 mm", { min: "0.76 mm", max: "3.05 mm", draft: "0.5 deg", minDraft: "0.25 deg" }),
  rule("lib-hdpe-2", "HDPE (2mm)", "polyethylene-high-density", "mm", "2.00 mm", { min: "0.76 mm", max: "6.35 mm", draft: "1.5 deg" }),
];
export const DEFAULT_RULE_ID = "lib-abs-1-5";
/** Rib thickness as a fraction of the nominal wall thickness (moulding rule of thumb: 50 to 60 %). */
export const RIB_RATIO = 0.6;

// ---------------------------------------------------------------- library (persisted per browser)
const LS_KEY = "fusion-recreation.plasticRules.v1";
let LIB = null;
export function library() {
  if (LIB) return LIB;
  LIB = DEFAULT_LIBRARY.map((r) => ({ ...r }));
  let stored = null;
  try { stored = JSON.parse(globalThis.localStorage ? globalThis.localStorage.getItem(LS_KEY) || "null" : "null"); } catch { stored = null; }
  if (stored && Array.isArray(stored.rules) && stored.rules.length) {
    LIB = stored.rules.filter((r) => r && r.id && r.name);
    if (stored.defaultId) libDefault.id = stored.defaultId;
  }
  return LIB;
}
const libDefault = { id: DEFAULT_RULE_ID };
export const libraryDefaultId = () => { library(); return LIB.some((r) => r.id === libDefault.id) ? libDefault.id : (LIB[0] || {}).id; };
export function saveLibrary(rules, defaultId) {
  LIB = rules.map((r) => ({ ...r }));
  if (defaultId) libDefault.id = defaultId;
  try { if (globalThis.localStorage) globalThis.localStorage.setItem(LS_KEY, JSON.stringify({ rules: LIB, defaultId: libDefault.id })); } catch { /* sandboxed */ }
}
export function resetLibrary() { LIB = null; libDefault.id = DEFAULT_RULE_ID; try { if (globalThis.localStorage) globalThis.localStorage.removeItem(LS_KEY); } catch { /* sandboxed */ } }

// ---------------------------------------------------------------- design rules
export const designRules = (doc) => (doc && doc.plastic && Array.isArray(doc.plastic.rules) ? doc.plastic.rules : []);
export function ensurePlastic(doc) {
  if (!doc.plastic || typeof doc.plastic !== "object") doc.plastic = { rules: [], assign: {} };
  if (!Array.isArray(doc.plastic.rules)) doc.plastic.rules = [];
  if (!doc.plastic.assign || typeof doc.plastic.assign !== "object") doc.plastic.assign = {};
  return doc.plastic;
}
export const assignedRuleId = (doc, comp = "root") => (doc && doc.plastic && doc.plastic.assign ? doc.plastic.assign[comp] || null : null);
export function findRule(doc, id) {
  return designRules(doc).find((r) => r.id === id) || library().find((r) => r.id === id) || null;
}
/** The rule plastic features of a component use: its assigned rule, else the library default. */
export function effectiveRule(doc, comp = "root") {
  const id = assignedRuleId(doc, comp);
  return (id && findRule(doc, id)) || findRule(doc, libraryDefaultId()) || DEFAULT_LIBRARY[0];
}
/** Components that use a rule of the design. */
export const ruleUsers = (doc, id) => Object.entries((doc && doc.plastic && doc.plastic.assign) || {}).filter(([, r]) => r === id).map(([c]) => c);
/** A unique rule name ("ABS (1.5mm) 1", ...). */
export function uniqueName(list, name) {
  if (!list.some((r) => r.name === name)) return name;
  for (let i = 1; ; i++) { const n = `${name} ${i}`; if (!list.some((r) => r.name === n)) return n; }
}
let seq = 0;
export const newRuleId = () => `pr${Date.now().toString(36)}${(seq++).toString(36)}`;

// ---------------------------------------------------------------- values
/** Evaluate one rule value (mm or deg); `T` = the rule thickness for expressions that use it. */
export function ruleValue(r, key, T) {
  const f = RULE_FIELDS.find((x) => x[0] === key);
  const kind = f ? f[2] : "length";
  let src = String(r && r[key] !== undefined ? r[key] : "").trim();
  if (!src) return NaN;
  if (kind === "length" && r.units === "in" && /^[-+]?[\d.]+$/.test(src)) src += " in";
  const look = (n) => (n === "Thickness" && Number.isFinite(T) ? { value: T, kind: "length" } : undefined);
  try { return E.evaluate(src, look, kind); } catch { return NaN; }
}
/** All values of a rule: {thickness, draftAngle, ...} (NaN where an expression is invalid). */
export function ruleValues(r) {
  const T = ruleValue(r, "thickness");
  const out = { thickness: T };
  for (const [k] of RULE_FIELDS) if (k !== "thickness") out[k] = ruleValue(r, k, T);
  return out;
}
/** Error text of a rule, or null. */
export function ruleError(r) {
  if (!r || !String(r.name || "").trim()) return "Enter a name";
  const v = ruleValues(r);
  for (const [k, label] of RULE_FIELDS) if (!Number.isFinite(v[k])) return `${label}: invalid value`;
  if (!(v.thickness > 0)) return "Thickness must be positive";
  if (v.minimumThickness > v.maximumThickness) return "Minimum Thickness is larger than Maximum Thickness";
  if (v.thickness < v.minimumThickness - 1e-9 || v.thickness > v.maximumThickness + 1e-9) return "Thickness must be within the thickness range";
  return null;
}

// ---------------------------------------------------------------- feature defaults from a rule
const mm = (x) => `${(Math.round(x * 100) / 100).toFixed(2)} mm`;
const dg = (x) => `${(Math.round(x * 10) / 10).toFixed(1)} deg`;
/** field -> expression derived from rule values, per plastic feature type. */
export const DERIVE = {
  rib: { thickness: (v) => mm(v.thickness * RIB_RATIO), draft: (v) => dg(v.draftAngle), fillet: (v) => mm(v.nominalRadius * 0.5) },
  web: { thickness: (v) => mm(v.thickness * RIB_RATIO), draft: (v) => dg(v.draftAngle), fillet: (v) => mm(v.nominalRadius * 0.5) },
  boss: {
    s1D: (v) => mm(3.4 + 2 * v.thickness), s2D: (v) => mm(2.5 + 2 * v.thickness),
    s1Draft: (v) => dg(v.draftAngle), s2Draft: (v) => dg(v.draftAngle),
    s1R: (v) => mm(v.nominalRadius * 0.5), s2R: (v) => mm(v.nominalRadius * 0.5), s2O: (v) => mm(v.clearance),
  },
  lip: { height: (v) => mm(v.thickness), width: (v) => mm(v.thickness * 0.5), clearance: (v) => mm(v.clearance), draft1: (v) => dg(v.draftAngle), draft2: (v) => dg(v.draftAngle) },
  rest: { thickness: (v) => mm(v.thickness), draft: (v) => dg(v.draftAngle) },
  snapFit: { hA: (v) => mm(v.thickness), hC: (v) => mm(v.thickness * 0.6), gL: (v) => mm(Math.max(v.clearance, 0.1) * 2) },
};
/** Default values of a feature type from a rule: {field: expr}. */
export function ruleDefaults(type, r) {
  const d = DERIVE[type];
  if (!d || !r) return {};
  const v = ruleValues(r);
  const out = {};
  for (const [k, fn] of Object.entries(d)) { try { const s = fn(v); if (!/NaN/.test(s)) out[k] = s; } catch { /* skip */ } }
  return out;
}
/**
 * Re-derive the rule-driven fields (f.ruleFields) of every plastic feature that uses rule `id` (or,
 * with comp, every feature of that component) after a rule changed. Mutates doc; returns the count.
 */
export function rederive(doc, id, { comp = null } = {}) {
  let n = 0;
  for (const f of doc.features || []) {
    if (!DERIVE[f.type] || !Array.isArray(f.ruleFields) || !f.ruleFields.length) continue;
    if (comp ? (f.ruleComp || "root") !== comp : f.plasticRule !== id) continue;
    const r = findRule(doc, comp ? id : f.plasticRule);
    if (!r) continue;
    const d = ruleDefaults(f.type, r);
    for (const k of f.ruleFields) if (d[k] !== undefined) f[k] = d[k];
    f.plasticRule = r.id;
    n++;
  }
  return n;
}
