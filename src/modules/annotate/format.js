// PMI value formatting: document PMI settings, units / precision / zeros, tolerances (Fusion's
// PMIToleranceTypes) and ISO 286 limits & fits. Output strings are "rich text" for text.js:
// plain characters plus private markers for stacked tolerances (STK ... SEP ... END) and the
// rectangular frame of a basic dimension (BOX ... BOXEND).

export const STK = "\u0001";
export const SEP = "\u0002";
export const END = "\u0003";
export const BOX = "\u0004";
export const BOXEND = "\u0005";

// symbols (drawn as paths by text.js so they never depend on the font)
export const SYM = {
  dia: "⌀", // ⌀
  cbore: "⌴", // ⌴
  csk: "⌵", // ⌵
  depth: "↧", // ↧
  pm: "±", // ±
  deg: "°", // °
  sq: "□", // □ square
  sphere: "S⌀",
  arc: "⌢", // ⌢ arc length
  slope: "⌳", // ⌳ slope
  taper: "⌲", // ⌲ conical taper
  envelope: "Ⓔ", // Ⓔ
  free: "Ⓕ", // Ⓕ
  lmc: "Ⓛ", // Ⓛ
  mmc: "Ⓜ", // Ⓜ
  proj: "Ⓟ", // Ⓟ
  rfs: "Ⓢ", // Ⓢ
  tangent: "Ⓣ", // Ⓣ
  unequal: "Ⓤ", // Ⓤ
  centerline: "℄", // ℄
};

/** Insert symbol palette of the Text inputs (Fusion: "Insert symbol"). */
export const SYMBOL_PALETTE = [
  [SYM.dia, "Diameter"], [SYM.pm, "Plus/Minus"], [SYM.deg, "Degree"], [SYM.cbore, "Counterbore"], [SYM.csk, "Countersink"],
  [SYM.depth, "Depth"], [SYM.sq, "Square"], [SYM.arc, "Arc Length"], [SYM.taper, "Conical Taper"], [SYM.slope, "Slope"],
  [SYM.centerline, "Center Line"], [SYM.envelope, "Envelope Requirement"], [SYM.free, "Free State"], [SYM.lmc, "Least Material Condition"],
  [SYM.mmc, "Maximum Material Condition"], [SYM.proj, "Projected Tolerance Zone"], [SYM.rfs, "Regardless of Feature Size"], [SYM.tangent, "Tangent Plane"],
];

// ---------------------------------------------------------------- settings
export const UNITS = {
  mm: { k: 1, abbr: "mm", label: "mm" },
  cm: { k: 0.1, abbr: "cm", label: "cm" },
  m: { k: 0.001, abbr: "m", label: "m" },
  in: { k: 1 / 25.4, abbr: "in", label: "in" },
  ft: { k: 1 / 304.8, abbr: "ft", label: "ft" },
};
export const UNIT_OPTIONS = [
  { value: "doc", label: "Document units" },
  { value: "mm", label: "mm" }, { value: "cm", label: "cm" }, { value: "m", label: "m" }, { value: "in", label: "in" }, { value: "ft", label: "ft" },
];
export const PRECISION_OPTIONS = Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: i ? `0.${"0".repeat(i)}` : "0" }));
export const ANGLE_PRECISION_OPTIONS = Array.from({ length: 6 }, (_, i) => ({ value: String(i), label: i ? `0.${"0".repeat(i)}` : "0" }));

/** Fusion's Change PMI Settings: Standard, Size, Default Precision, Default Tolerance, Leading/Trailing Zero, General Note Size. */
export const DEFAULT_SETTINGS = {
  standard: "infer", // 'infer' (Infer from Units) | 'ASME' | 'ISO'
  size: 3.5, // annotation (text) height in mm
  precision: 2,
  tolerance: 0.1, // default symmetric tolerance (mm)
  leadingZero: true,
  trailingZero: true,
  generalNoteSize: "medium", // small | medium | large | custom
  generalNoteCustom: 16, // px
};

export function settingsOf(doc) {
  const s = { ...DEFAULT_SETTINGS, ...((doc && doc.pmi) || {}) };
  s.docUnit = (doc && doc.units) || "mm";
  s.std = s.standard === "ASME" || s.standard === "ISO" ? s.standard : (s.docUnit === "in" || s.docUnit === "ft" ? "ASME" : "ISO");
  if (!(Number(s.size) > 0)) s.size = DEFAULT_SETTINGS.size;
  s.size = Number(s.size);
  return s;
}

/** Display settings of one note (Units and precision group), filled from the PMI settings. */
export function displayDefaults(settings) {
  return { unit: "doc", precision: String(settings.precision ?? 2), leading: settings.leadingZero !== false, trailing: settings.trailingZero !== false, abbrev: false };
}

// ---------------------------------------------------------------- numbers
/** Number with precision and zero rules ("0.50", ".5", "0.5"). */
export function fmtNum(v, o = {}) {
  if (!Number.isFinite(v)) return "";
  const prec = Math.max(0, Math.min(9, Number(o.precision ?? 2) | 0));
  let s = Math.abs(v) < 0.5 * Math.pow(10, -prec) ? (0).toFixed(prec) : v.toFixed(prec);
  if (o.trailing === false && s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  if (o.leading === false) s = s.replace(/^(-?)0\./, "$1.");
  if (s === "-0") s = "0";
  return s;
}

/** Length (mm) in the display unit: "6.60", or "6.60 mm" with the unit abbreviation. */
export function fmtLen(mm, disp = {}, settings = {}) {
  const unit = disp.unit && disp.unit !== "doc" ? disp.unit : settings.docUnit || "mm";
  const u = UNITS[unit] || UNITS.mm;
  const s = fmtNum(mm * u.k, disp);
  return disp.abbrev ? `${s} ${u.abbr}` : s;
}
export function fmtAngle(deg, disp = {}) {
  const prec = disp.anglePrecision !== undefined ? disp.anglePrecision : Math.min(Number(disp.precision ?? 1), 1);
  return `${fmtNum(deg, { ...disp, precision: prec })}${SYM.deg}`;
}
/** Secondary unit text in square brackets ("[0.260]"). */
export function secondaryText(mm, sec, settings) {
  if (!sec || !sec.on) return "";
  const u = UNITS[sec.unit] || UNITS.in;
  const s = fmtNum(mm * u.k, { precision: sec.precision ?? 3, leading: sec.leading !== false, trailing: sec.trailing !== false });
  return ` [${s}${sec.abbrev ? ` ${u.abbr}` : ""}]`;
}

// ---------------------------------------------------------------- tolerances
export const TOL_TYPES = [
  { value: "symmetric", label: "Symmetric" },
  { value: "deviation", label: "Deviation" },
  { value: "limitsStacked", label: "Limits - Stacked" },
  { value: "limitsLinear", label: "Limits - Linear" },
  { value: "max", label: "MAX" },
  { value: "min", label: "MIN" },
  { value: "fitsStacked", label: "Limits/Fits - Stacked" },
  { value: "fitsLinear", label: "Limits/Fits - Linear" },
  { value: "fitsSizeLimits", label: "Limits/Fits - Show size limits" },
  { value: "fitsTolerance", label: "Limits/Fits - Show tolerance" },
  { value: "basic", label: "Basic" },
];
export const isFit = (t) => /^fits/.test(String(t || ""));

/**
 * Tolerance suffix (rich text) for a nominal value.
 * tol = {on, type, upper, lower (numbers, mm; lower deviation as a signed number), hole, shaft}
 * kind: 'length' | 'angle'; internal: hole (true) / shaft (false) for fits.
 * Returns {before, nominal, after}: Basic wraps the nominal in a frame, Limits replace it.
 */
export function tolerancePieces(nominal, tol, disp, settings, opts = {}) {
  const f = (v) => (opts.kind === "angle" ? fmtAngle(v, disp) : fmtLen(v, disp, settings));
  const fd = (v) => (opts.kind === "angle" ? fmtAngle(v, disp) : fmtLen(v, { ...disp, abbrev: false }, settings));
  const sgn = (v) => (v > 0 ? "+" : v < 0 ? "-" : "") + fd(Math.abs(v));
  const out = { nominal: f(nominal), after: "" };
  if (!tol || !tol.on) return out;
  const up = Number(tol.upper) || 0, lo = Number(tol.lower) || 0;
  switch (tol.type) {
    case "symmetric": out.after = ` ${SYM.pm}${fd(Math.abs(up))}`; break;
    case "deviation": out.after = ` ${STK}${sgn(up)}${SEP}${sgn(lo)}${END}`; break;
    case "limitsStacked": out.nominal = `${STK}${f(Number(tol.upper) || nominal)}${SEP}${f(Number(tol.lower) || nominal)}${END}`; break;
    case "limitsLinear": out.nominal = `${f(Number(tol.lower) || nominal)}-${f(Number(tol.upper) || nominal)}`; break;
    case "max": out.after = " MAX"; break;
    case "min": out.after = " MIN"; break;
    case "basic": out.nominal = `${BOX}${out.nominal}${BOXEND}`; break;
    default:
      if (isFit(tol.type)) {
        const des = opts.internal === false ? tol.shaft || "h7" : tol.hole || "H7";
        const dev = fitDeviation(nominal, des);
        if (tol.type === "fitsStacked") out.after = ` ${STK}${tol.hole || "H7"}${SEP}${tol.shaft || "g6"}${END}`;
        else if (tol.type === "fitsLinear") out.after = ` ${tol.hole || "H7"}/${tol.shaft || "g6"}`;
        else if (dev && tol.type === "fitsSizeLimits") out.after = ` ${des} (${STK}${fd(nominal + dev.upper)}${SEP}${fd(nominal + dev.lower)}${END})`;
        else if (dev) out.after = ` ${des} (${STK}${sgn(dev.upper)}${SEP}${sgn(dev.lower)}${END})`;
      }
  }
  return out;
}

// ---------------------------------------------------------------- ISO 286 limits and fits
// Standard tolerance grades IT5..IT11 (µm) and fundamental deviations for nominal sizes up to 500 mm.
const RANGES = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500];
const IT = {
  5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
};
// shaft upper deviations es (µm) for d e f g h; lower deviations ei for k m n p
const ES = {
  d: [-20, -30, -40, -50, -65, -80, -100, -120, -145, -170, -190, -210, -230],
  e: [-14, -20, -25, -32, -40, -50, -60, -72, -85, -100, -110, -125, -135],
  f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68],
  g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20],
  h: new Array(13).fill(0),
};
const EI = {
  k: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5],
  m: [2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
  n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40],
  p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68],
};
export const HOLE_FITS = ["H6", "H7", "H8", "H9", "H10", "H11", "G6", "G7", "F7", "F8", "E8", "D9", "JS6", "JS7"];
export const SHAFT_FITS = ["h6", "h7", "h8", "h9", "h11", "g6", "f7", "e8", "d9", "js6", "js7", "k6", "m6", "n6", "p6"];

/** {upper, lower} deviation in mm of a fit designation ("H7", "g6") at a nominal size, or null. */
export function fitDeviation(size, des) {
  const m = /^([A-Za-z]{1,2})(\d{1,2})$/.exec(String(des || ""));
  if (!m || !(size > 0) || size > 500) return null;
  const letters = m[1], grade = Number(m[2]);
  const it = IT[grade];
  if (!it) return null;
  const ri = RANGES.findIndex((r) => size <= r);
  if (ri < 0) return null;
  const T = it[ri];
  const hole = letters[0] === letters[0].toUpperCase();
  const l = letters.toLowerCase();
  let up, lo;
  if (l === "js") { up = T / 2; lo = -T / 2; }
  else if (ES[l]) {
    // shaft: es from the table, ei = es - IT; hole (same letter, upper case): EI = -es, ES = EI + IT
    if (hole) { lo = -ES[l][ri]; up = lo + T; } else { up = ES[l][ri]; lo = up - T; }
  } else if (EI[l] && !hole) { lo = EI[l][ri]; up = lo + T; }
  else return null;
  return { upper: up / 1000, lower: lo / 1000 };
}
