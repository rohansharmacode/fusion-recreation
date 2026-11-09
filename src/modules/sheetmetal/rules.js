// sheetmetal: sheet metal rules (Fusion's default library, document rules, evaluation).
//
// doc.sheetMetal = { rules: [rule], active: ruleId, components: {componentId: ruleId}, rev, flats: {bodyId: {...}} }
// rule = { id, name, material, units, thickness, kFactor, bendRadius, miterGap, reliefShape, reliefWidth,
//          reliefDepth, reliefRemnant, corner2Shape, corner2Size, corner2Placement, corner3Shape, corner3Radius }
// Value fields are expressions; "Thickness" refers to the rule's own thickness (plus user parameters).
// Rules are document-level: every sheet metal body uses the active rule. Per-component rules: ruleFor()
// already looks up doc.sheetMetal.components[componentId] first, so components only need to pass their id.
import { evaluate } from "../../expr.js";

const RULE_FIELDS = {
  thickness: "length", kFactor: "none", bendRadius: "length", miterGap: "length",
  reliefWidth: "length", reliefDepth: "length", reliefRemnant: "length", corner2Size: "length", corner3Radius: "length",
};
const metric = (id, name, material, thickness) => ({
  id, name, material, units: "mm", thickness, kFactor: "0.44", bendRadius: "Thickness", miterGap: "Thickness",
  reliefShape: "Straight", reliefWidth: "Thickness", reliefDepth: "Thickness * 0.5", reliefRemnant: "Thickness * 2.0",
  corner2Shape: "Trim to Bend", corner2Size: "Thickness * 2", corner2Placement: "Intersection",
  corner3Shape: "Round with Radius", corner3Radius: "Thickness", builtin: true,
});
const inch = (id, name, material, thickness) => ({
  ...metric(id, name, material, thickness), units: "in", reliefShape: "Round", corner2Shape: "Round",
});
/** Fusion's default library (Fusion/Server/Fusion/Configuration/SheetMetalADSKRuleData). */
export const DEFAULT_RULES = [
  metric("ADSKRule1", "Steel (mm)", "Steel", "2.50 mm"),
  metric("ADSKRule2", "Stainless Steel (mm)", "Stainless Steel", "2.50 mm"),
  metric("ADSKRule3", "Aluminum (mm)", "Aluminum", "2.00 mm"),
  inch("ADSKRule4", "Steel (in)", "Steel", "0.10 in"),
  inch("ADSKRule5", "Stainless Steel (in)", "Stainless Steel", "0.10 in"),
  inch("ADSKRule6", "Aluminum (in)", "Aluminum", "0.08 in"),
];
export const RELIEF_SHAPES = ["Round", "Straight", "Tear"];
export const CORNER2_SHAPES = ["Round", "Square", "Tear", "Trim to Bend", "Linear Weld", "Arc Weld", "Laser Weld"];
export const CORNER2_PLACEMENTS = ["Intersection", "Tangent", "Vertex"];
export const CORNER3_SHAPES = ["No Replacement", "Intersection", "Full Round", "Round with Radius"];
export const FIELD_KIND = RULE_FIELDS;

const copy = (r) => JSON.parse(JSON.stringify(r));
export const defaultRule = () => { const r = copy(DEFAULT_RULES[0]); delete r.builtin; return r; };

/** Sheet metal settings of a document (read only: never creates doc.sheetMetal). */
export function smDoc(doc) {
  const s = doc && doc.sheetMetal;
  if (s && Array.isArray(s.rules) && s.rules.length) return s;
  return { rules: [defaultRule()], active: DEFAULT_RULES[0].id, components: {}, rev: 0, flats: {}, virtual: true };
}
/** Make sure doc.sheetMetal exists (call inside app.mutate). */
export function ensureDoc(doc) {
  if (!doc.sheetMetal || !Array.isArray(doc.sheetMetal.rules) || !doc.sheetMetal.rules.length) {
    const v = smDoc(null);
    delete v.virtual;
    doc.sheetMetal = { ...v, ...(doc.sheetMetal || {}), rules: v.rules };
  }
  doc.sheetMetal.components = doc.sheetMetal.components || {};
  doc.sheetMetal.flats = doc.sheetMetal.flats || {};
  return doc.sheetMetal;
}
/** The rule a sheet metal body of component compId uses (document rule until components get their own). */
export function ruleFor(doc, compId = null) {
  const s = smDoc(doc);
  const id = (compId && s.components && s.components[compId]) || s.active;
  return s.rules.find((r) => r.id === id) || s.rules[0];
}
export function findRule(doc, id) {
  const s = smDoc(doc);
  return s.rules.find((r) => r.id === id) || libraryRules().find((r) => r.id === id) || null;
}

/** Numbers of a rule: {T, K, R, miterGap, relief:{shape,width,depth,remnant}, corner2:{...}, corner3:{...}}. */
export function evalRule(rule, P) {
  const r = rule || defaultRule();
  let T;
  const look = (n) => {
    if (n === "Thickness" || n === "thickness") return { value: T, kind: "length" };
    try { return P && P.lookup ? P.lookup(n) : undefined; } catch { return undefined; }
  };
  const ev = (key, fallback) => {
    try { return evaluate(r[key] ?? fallback, look, RULE_FIELDS[key] || "length"); } catch { return evaluate(fallback, look, RULE_FIELDS[key] || "length"); }
  };
  T = (() => { try { return evaluate(r.thickness, (n) => (P && P.lookup ? P.lookup(n) : undefined), "length"); } catch { return 2.5; } })();
  if (!(T > 0)) throw new Error("The sheet metal rule thickness must be greater than 0");
  const K = ev("kFactor", "0.44");
  if (!(K >= 0 && K <= 1)) throw new Error("The sheet metal rule K Factor must be between 0 and 1");
  return {
    id: r.id, name: r.name, T, K,
    R: Math.max(0, ev("bendRadius", "Thickness")),
    miterGap: Math.max(0, ev("miterGap", "Thickness")),
    relief: { shape: r.reliefShape || "Straight", width: ev("reliefWidth", "Thickness"), depth: ev("reliefDepth", "Thickness * 0.5"), remnant: ev("reliefRemnant", "Thickness * 2.0") },
    corner2: { shape: r.corner2Shape || "Trim to Bend", size: ev("corner2Size", "Thickness * 2"), placement: r.corner2Placement || "Intersection" },
    corner3: { shape: r.corner3Shape || "Round with Radius", radius: ev("corner3Radius", "Thickness") },
  };
}
/** Check one rule's expressions: field -> error text. */
export function ruleErrors(rule, P) {
  const errs = {};
  let T = NaN;
  try { T = evaluate(rule.thickness, (n) => (P && P.lookup ? P.lookup(n) : undefined), "length"); if (!(T > 0)) errs.thickness = "Must be greater than 0"; } catch (e) { errs.thickness = e.message; }
  for (const [k, kind] of Object.entries(RULE_FIELDS)) {
    if (k === "thickness") continue;
    try {
      const v = evaluate(rule[k], (n) => (n === "Thickness" ? { value: T, kind: "length" } : P && P.lookup ? P.lookup(n) : undefined), kind);
      if (k === "kFactor" && !(v >= 0 && v <= 1)) errs[k] = "Must be between 0 and 1";
      else if (v < 0) errs[k] = "Must not be negative";
    } catch (e) { errs[k] = e.message; }
  }
  return errs;
}

// ---------------------------------------------------------------- library (Fusion defaults + local rules)
const LIB_KEY = "fusion-recreation.sheetmetal.library";
export function userLibrary() {
  try { const v = JSON.parse(localStorage.getItem(LIB_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveUserLibrary(list) {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(list)); return true; } catch { return false; }
}
export function libraryRules() {
  return [...DEFAULT_RULES.map(copy), ...userLibrary().map((r) => ({ ...r, builtin: false, user: true }))];
}
export function uniqueName(names, base) {
  if (!names.includes(base)) return base;
  for (let i = 1; i < 1000; i++) { const n = `${base} (${i})`; if (!names.includes(n)) return n; }
  return `${base} ${Date.now()}`;
}
export function newRuleId(prefix = "R") { return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`; }
export { copy as copyRule };
