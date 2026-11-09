// Appearance + physical material libraries for the inspect module.
//
// Names follow Fusion's "Fusion Appearance Library" / "Fusion Material Library" naming style
// (category folders, "Material - Finish (Colour)" swatch names). The physical material names are
// the ones listed in the install's PhysicalMaterials.xml; densities are standard engineering values
// (g/cm^3) and every colour / metalness / roughness value is this recreation's own.

/** Appearance library: category -> [[id, name, color, metalness, roughness, opacity?]] */
const APPEARANCE_TABLE = {
  Ceramic: [
    ["ceramic-white", "Ceramic - Glossy (White)", "#f3f1ec", 0, 0.18],
    ["porcelain-blue", "Porcelain - Glazed (Blue)", "#3d6fb6", 0, 0.15],
  ],
  Fabric: [
    ["fabric-canvas", "Canvas - Natural", "#cdbd9c", 0, 0.95],
    ["fabric-denim", "Denim - Blue", "#3f5878", 0, 0.95],
  ],
  Glass: [
    ["glass", "Glass - Clear", "#cfe6f0", 0, 0.05, 0.35],
    ["glass-blue", "Glass - Blue", "#7fa8d6", 0, 0.05, 0.42],
    ["glass-green", "Glass - Green", "#8cc3a0", 0, 0.05, 0.42],
    ["glass-smoked", "Glass - Smoked", "#5d6166", 0, 0.05, 0.5],
  ],
  Leather: [
    ["leather-brown", "Leather - Brown", "#6b4429", 0, 0.7],
    ["leather-black", "Leather - Black", "#262321", 0, 0.7],
  ],
  Metal: [
    ["aluminum", "Aluminum - Satin", "#c9ccd0", 0.4, 0.4],
    ["aluminum-brushed", "Aluminum - Brushed", "#c3c6ca", 0.55, 0.35],
    ["aluminum-polished", "Aluminum - Polished", "#dadde0", 0.6, 0.15],
    ["aluminum-anodized-blue", "Aluminum - Anodized Glossy (Blue)", "#3a6fb5", 0.45, 0.25],
    ["aluminum-anodized-red", "Aluminum - Anodized Glossy (Red)", "#b33a3a", 0.45, 0.25],
    ["aluminum-anodized-black", "Aluminum - Anodized Glossy (Black)", "#2b2d30", 0.45, 0.25],
    ["brass-polished", "Brass - Polished", "#d0ac52", 0.6, 0.15],
    ["brass-satin", "Brass - Satin", "#bb9b4f", 0.5, 0.4],
    ["bronze-satin", "Bronze - Satin", "#a87a4a", 0.5, 0.4],
    ["chrome-polished", "Chrome - Polished", "#e3e6e9", 0.6, 0.05],
    ["copper-polished", "Copper - Polished", "#c97a50", 0.6, 0.15],
    ["copper-satin", "Copper - Satin", "#b8714c", 0.5, 0.4],
    ["gold-polished", "Gold - Polished", "#e1b94f", 0.6, 0.12],
    ["iron-cast", "Iron - Cast", "#717274", 0.35, 0.65],
    ["lead-satin", "Lead - Satin", "#7d8085", 0.4, 0.5],
    ["nickel-satin", "Nickel - Satin", "#b9b6ad", 0.5, 0.4],
    ["silver-polished", "Silver - Polished", "#d8d9db", 0.6, 0.1],
    ["stainless-satin", "Stainless Steel - Satin", "#c2c5c8", 0.45, 0.38],
    ["stainless-brushed", "Stainless Steel - Brushed", "#bdc0c4", 0.5, 0.33],
    ["steel-satin", "Steel - Satin", "#b9bdc2", 0.35, 0.45],
    ["steel-polished", "Steel - Polished", "#d0d3d6", 0.55, 0.15],
    ["steel-galvanized", "Steel - Galvanized", "#a9aeb2", 0.4, 0.55],
    ["titanium-satin", "Titanium - Satin", "#9a9890", 0.45, 0.42],
  ],
  Miscellaneous: [
    ["carbon-fiber", "Carbon Fiber - Twill", "#2c2f33", 0.25, 0.35],
    ["concrete-smooth", "Concrete - Smooth", "#a19e98", 0, 0.9],
    ["rubber-soft", "Rubber - Soft", "#2b2b2b", 0, 0.9],
  ],
  Paint: [
    ["paint-black", "Paint - Enamel Glossy (Black)", "#141414", 0, 0.2],
    ["paint-blue", "Paint - Enamel Glossy (Blue)", "#1f4fa8", 0, 0.2],
    ["paint-green", "Paint - Enamel Glossy (Green)", "#2e7d32", 0, 0.2],
    ["paint-orange", "Paint - Enamel Glossy (Orange)", "#e46c1c", 0, 0.2],
    ["paint-red", "Paint - Enamel Glossy (Red)", "#c62828", 0, 0.2],
    ["paint-white", "Paint - Enamel Glossy (White)", "#f4f4f4", 0, 0.2],
    ["paint-yellow", "Paint - Enamel Glossy (Yellow)", "#f2c21b", 0, 0.2],
    ["paint-metallic-silver", "Paint - Metallic (Silver)", "#b4b8bd", 0.4, 0.3],
  ],
  Plastic: [
    ["plastic-black-glossy", "Plastic - Glossy (Black)", "#1c1c1c", 0, 0.22],
    ["plastic-blue-glossy", "Plastic - Glossy (Blue)", "#2a5db0", 0, 0.22],
    ["plastic-red-glossy", "Plastic - Glossy (Red)", "#b22a2a", 0, 0.22],
    ["plastic-white-glossy", "Plastic - Glossy (White)", "#f2f2f2", 0, 0.22],
    ["plastic-black", "Plastic - Matte (Black)", "#2a2a2a", 0, 0.7],
    ["plastic-grey", "Plastic - Matte (Grey)", "#8a8a8a", 0, 0.7],
    ["plastic-white", "Plastic - Matte (White)", "#f2f2f2", 0, 0.7],
    ["plastic-yellow", "Plastic - Matte (Yellow)", "#e8c33a", 0, 0.7],
    ["plastic-translucent", "Plastic - Translucent Matte (Grey)", "#9da3a8", 0, 0.6, 0.6],
    ["abs-white", "ABS (White)", "#eeece6", 0, 0.6],
    ["nylon-natural", "Nylon - Natural", "#ebe5d6", 0, 0.65],
  ],
  Stone: [
    ["granite-grey", "Granite - Polished (Grey)", "#7d7a77", 0, 0.25],
    ["marble-white", "Marble - Polished (White)", "#e8e6e1", 0, 0.2],
  ],
  Wood: [
    ["wood-birch", "Birch - Semigloss", "#e0c592", 0, 0.55],
    ["wood-cherry", "Cherry - Semigloss", "#9a5a3a", 0, 0.55],
    ["wood-maple", "Maple - Semigloss", "#e5c897", 0, 0.55],
    ["wood-oak", "Oak - Semigloss", "#b98b55", 0, 0.55],
    ["wood-walnut", "Walnut - Semigloss", "#6b4a2f", 0, 0.55],
  ],
};

export const APPEARANCE_CATEGORIES = Object.keys(APPEARANCE_TABLE);

/** id -> {id, name, color, metalness, roughness, opacity?, category} */
export const APPEARANCES = {};
for (const [cat, rows] of Object.entries(APPEARANCE_TABLE)) {
  for (const [id, name, color, metalness, roughness, opacity] of rows) {
    APPEARANCES[id] = { id, name, color, metalness, roughness, category: cat, ...(opacity !== undefined ? { opacity } : {}) };
  }
}

/** Physical materials (names from the install's PhysicalMaterials.xml).
 *  [name, category, density g/cm^3, default appearance id] */
const MATERIAL_TABLE = [
  ["ABS Plastic", "Plastic", 1.06, "abs-white"],
  ["Acetal Resin, Black", "Plastic", 1.42, "plastic-black"],
  ["Acetal Resin, White", "Plastic", 1.42, "plastic-white"],
  ["Aluminum 6061", "Metal", 2.7, "aluminum"],
  ["Aluminum 6061, Welded", "Metal", 2.7, "aluminum"],
  ["Aluminum 6061-AHC", "Metal", 2.7, "aluminum-anodized-black"],
  ["Brass, Soft Yellow", "Metal", 8.47, "brass-satin"],
  ["Brass, Soft Yellow, Welded", "Metal", 8.47, "brass-satin"],
  ["Bronze, Cast", "Metal", 8.8, "bronze-satin"],
  ["Bronze, Soft Tin", "Metal", 8.8, "bronze-satin"],
  ["CFRP", "Other", 1.55, "carbon-fiber"],
  ["Concrete", "Other", 2.3, "concrete-smooth"],
  ["Copper", "Metal", 8.96, "copper-satin"],
  ["Copper, Alloy", "Metal", 8.94, "copper-satin"],
  ["Copper, Cast", "Metal", 8.93, "copper-satin"],
  ["Copper, Wrought", "Metal", 8.94, "copper-satin"],
  ["Default", "Other", 1.0, "steel-satin"],
  ["GFRC", "Other", 2.0, "concrete-smooth"],
  ["Glass", "Glass", 2.58, "glass"],
  ["Gold", "Metal", 19.32, "gold-polished"],
  ["Iron, Cast", "Metal", 7.2, "iron-cast"],
  ["Iron, Ductile", "Metal", 7.1, "iron-cast"],
  ["Iron, Gray", "Metal", 7.15, "iron-cast"],
  ["Iron, Malleable", "Metal", 7.27, "iron-cast"],
  ["LCP Plastic", "Plastic", 1.62, "plastic-grey"],
  ["Lead", "Metal", 11.34, "lead-satin"],
  ["Nickel-Copper Alloy 400", "Metal", 8.8, "nickel-satin"],
  ["Nylon 6/6", "Plastic", 1.14, "nylon-natural"],
  ["Nylon, molybdenum disulphide", "Plastic", 1.15, "plastic-black"],
  ["PAEK Plastic", "Plastic", 1.3, "plastic-grey"],
  ["PBT Plastic", "Plastic", 1.31, "plastic-grey"],
  ["PC/ABS Plastic", "Plastic", 1.15, "plastic-black"],
  ["PET Plastic", "Plastic", 1.38, "plastic-translucent"],
  ["PMMA Plastic", "Plastic", 1.19, "glass"],
  ["PPS Plastic", "Plastic", 1.35, "plastic-grey"],
  ["PVC, Unplasticized", "Plastic", 1.4, "plastic-grey"],
  ["PVC-Piping", "Plastic", 1.4, "plastic-white"],
  ["Phenolic Resin", "Plastic", 1.3, "plastic-black"],
  ["Polycarbonate, Clear", "Plastic", 1.2, "glass"],
  ["Polycarbonate, Smoke", "Plastic", 1.2, "glass-smoked"],
  ["Polyethylene, High Density", "Plastic", 0.95, "plastic-white"],
  ["Polyethylene, Low Density", "Plastic", 0.92, "plastic-white"],
  ["Polypropylene", "Plastic", 0.9, "plastic-white"],
  ["Polystyrene", "Plastic", 1.05, "plastic-white"],
  ["Polystyrene, High Impact", "Plastic", 1.04, "plastic-white"],
  ["Rubber", "Rubber", 1.1, "rubber-soft"],
  ["Rubber, Silicone", "Rubber", 1.1, "rubber-soft"],
  ["SAN Plastic", "Plastic", 1.08, "plastic-translucent"],
  ["Silicon Nitride", "Ceramic", 3.2, "plastic-grey"],
  ["Silver", "Metal", 10.49, "silver-polished"],
  ["Stainless Steel", "Metal", 8.0, "stainless-satin"],
  ["Stainless Steel AISI 440C, Welded", "Metal", 7.8, "stainless-satin"],
  ["Stainless Steel, 440C", "Metal", 7.8, "stainless-satin"],
  ["Stainless Steel, Austenitic", "Metal", 7.9, "stainless-satin"],
  ["Steel", "Metal", 7.85, "steel-satin"],
  ["Steel, Alloy", "Metal", 7.73, "steel-satin"],
  ["Steel, Carbon", "Metal", 7.85, "steel-satin"],
  ["Steel, Cast", "Metal", 7.85, "steel-satin"],
  ["Steel, Galvanized", "Metal", 7.85, "steel-galvanized"],
  ["Steel, High Strength Low Alloy", "Metal", 7.85, "steel-satin"],
  ["Steel, Mild", "Metal", 7.85, "steel-satin"],
  ["Steel, Mild, Welded", "Metal", 7.85, "steel-satin"],
  ["Steel, Non-Alloy", "Metal", 7.85, "steel-satin"],
  ["Steel, Wrought", "Metal", 7.85, "steel-satin"],
  ["Thermoplastic Resin", "Plastic", 1.2, "plastic-grey"],
  ["Titanium", "Metal", 4.51, "titanium-satin"],
  ["UHMW,  Black", "Plastic", 0.94, "plastic-black"],
  ["UHMW, White", "Plastic", 0.94, "plastic-white"],
  ["Unknown", "Other", 1.0, "steel-satin"],
  ["Wood (Birch)", "Wood", 0.67, "wood-birch"],
  ["Wood (Cherry)", "Wood", 0.56, "wood-cherry"],
  ["Wood (Maple)", "Wood", 0.7, "wood-maple"],
  ["Wood (Oak)", "Wood", 0.75, "wood-oak"],
  ["Wood (Walnut)", "Wood", 0.64, "wood-walnut"],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** id -> {id, name, category, density (g/cm^3), appearance} ; "steel" is Fusion's default material. */
export const MATERIALS = {};
for (const [name, category, density, appearance] of MATERIAL_TABLE) {
  const id = name === "Steel" ? "steel" : slug(name);
  MATERIALS[id] = { id, name: name.replace(/\s{2,}/g, " "), category, density, appearance };
}
export const MATERIAL_CATEGORIES = [...new Set(MATERIAL_TABLE.map((r) => r[1]))].sort();
export const DEFAULT_MATERIAL = "steel";
export const DEFAULT_APPEARANCE = "steel-satin";

/** Physical material record for a body meta (unknown ids fall back to Steel). */
export function materialOf(meta) {
  return MATERIALS[(meta && meta.material) || DEFAULT_MATERIAL] || MATERIALS[DEFAULT_MATERIAL];
}

/** Merge the library into app.appearances without overwriting entries other modules defined. */
export function installAppearances(app) {
  app.appearances = app.appearances || {};
  for (const [id, a] of Object.entries(APPEARANCES)) {
    const { category, id: _id, ...rest } = a;
    if (!app.appearances[id]) app.appearances[id] = { ...rest };
    else app.appearances[id] = { ...rest, ...app.appearances[id], name: app.appearances[id].name || rest.name };
  }
}

/** Display info for any appearance id (library or app.appearances). */
export function appearanceInfo(app, id) {
  const a = (app.appearances && app.appearances[id]) || APPEARANCES[id];
  if (!a) return { id, name: id || "Unknown", color: "#b9bdc2", metalness: 0.3, roughness: 0.5 };
  return { id, ...APPEARANCES[id], ...a };
}

/** CSS background for a swatch "ball" (original drawing: radial gradients). */
export function swatchCss(ap) {
  const c = hexToRgb(ap.color || "#b9bdc2");
  const mix = (t, k) => `rgb(${Math.round(c[0] + (t - c[0]) * k)}, ${Math.round(c[1] + (t - c[1]) * k)}, ${Math.round(c[2] + (t - c[2]) * k)})`;
  const metal = (ap.metalness || 0) > 0.3;
  const gloss = 1 - Math.min(1, ap.roughness ?? 0.5);
  const hi = mix(255, metal ? 0.75 : 0.35 + gloss * 0.5);
  const lo = mix(0, metal ? 0.55 : 0.4);
  const spec = gloss > 0.55 ? `radial-gradient(circle at 34% 28%, rgba(255,255,255,${(0.35 + gloss * 0.5).toFixed(2)}) 0 7%, rgba(255,255,255,0) 16%),` : "";
  const band = metal ? `linear-gradient(160deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.28) 52%, rgba(255,255,255,0) 64%),` : "";
  return `${spec}${band}radial-gradient(circle at 38% 32%, ${hi} 0%, ${ap.color} 46%, ${lo} 100%)`;
}

export function hexToRgb(h) {
  let s = String(h || "").replace("#", "");
  if (s.length === 3) s = s.split("").map((x) => x + x).join("");
  const n = parseInt(s, 16);
  if (!Number.isFinite(n)) return [185, 189, 194];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
