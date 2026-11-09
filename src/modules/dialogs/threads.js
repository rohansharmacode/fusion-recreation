// A small ISO metric thread table for the Thread command (subset of the ISO Metric profile thread
// data: common sizes, their first designations, classes 6g / 4g6g (external) and 6H (internal) with
// [major, minor] diameters in mm).
export const THREAD_TYPES = [{ value: "ISO Metric profile", label: "ISO Metric profile" }];

const ISO = [
  ["1.6", [["M1.6x0.35", 0.35, { "6g": [1.5385, 1.1385], "6H": [1.668, 1.271], "4g6g": [1.5385, 1.15] }], ["M1.6x0.3", 0.3, { "6g": [1.5445, 1.2073], "6H": [1.6517, 1.3177], "4g6g": [1.5445, 1.2158] }], ["M1.6x0.2", 0.2, { "6g": [1.555, 1.3232], "6H": [1.6479, 1.421], "4g6g": [1.555, 1.3322] }]]],
  ["2.0", [["M2x0.4", 0.4, { "6g": [1.9335, 1.478], "6H": [2.074, 1.623], "4g6g": [1.9335, 1.4905] }], ["M2x0.25", 0.25, { "6g": [1.9485, 1.6605], "6H": [2.0555, 1.7694], "4g6g": [1.9485, 1.6705] }]]],
  ["2.5", [["M2.5x0.45", 0.45, { "6g": [2.43, 1.9165], "6H": [2.58, 2.0755], "4g6g": [2.43, 1.9295] }], ["M2.5x0.35", 0.35, { "6g": [2.4385, 2.0386], "6H": [2.5678, 2.1711], "4g6g": [2.4385, 2.0501] }]]],
  ["3.0", [["M3x0.5", 0.5, { "6g": [2.927, 2.3555], "6H": [3.086, 2.529], "4g6g": [2.927, 2.369] }], ["M3x0.35", 0.35, { "6g": [2.9385, 2.5366], "6H": [3.0703, 2.6711], "4g6g": [2.9385, 2.5491] }]]],
  ["4.0", [["M4x0.7", 0.7, { "6g": [3.908, 3.111], "6H": [4.1095, 3.332], "4g6g": [3.908, 3.128] }], ["M4x0.5", 0.5, { "6g": [3.927, 3.3555], "6H": [4.0861, 3.5287], "4g6g": [3.927, 3.369] }]]],
  ["5.0", [["M5x0.8", 0.8, { "6g": [4.901, 3.9895], "6H": [5.12, 4.234], "4g6g": [4.901, 4.007] }], ["M5x0.5", 0.5, { "6g": [4.927, 4.3555], "6H": [5.0861, 4.5287], "4g6g": [4.927, 4.369] }]]],
  ["6.0", [["M6x1", 1, { "6g": [5.884, 4.7435], "6H": [6.147, 5.035], "4g6g": [5.884, 4.764] }], ["M6x0.8", 0.8, { "6g": [5.901, 4.9968], "6H": [6.1107, 5.234], "4g6g": [5.901, 5.0118] }], ["M6x0.75", 0.75, { "6g": [5.908, 5.0475], "6H": [6.1201, 5.2831], "4g6g": [5.908, 5.066] }]]],
  ["8.0", [["M8x1.25", 1.25, { "6g": [7.866, 6.4455], "6H": [8.17, 6.7795], "4g6g": [7.866, 6.467] }], ["M8x1", 1, { "6g": [7.884, 6.7435], "6H": [8.147, 7.035], "4g6g": [7.884, 6.764] }], ["M8x0.8", 0.8, { "6g": [7.901, 6.9838], "6H": [8.1277, 7.234], "4g6g": [7.901, 7.0033] }]]],
  ["10.0", [["M10x1.5", 1.5, { "6g": [9.85, 8.141], "6H": [10.198, 8.526], "4g6g": [9.85, 8.1645] }], ["M10x1.25", 1.25, { "6g": [9.866, 8.4455], "6H": [10.17, 8.7795], "4g6g": [9.866, 8.467] }], ["M10x1.12", 1.12, { "6g": [9.878, 8.5991], "6H": [10.1608, 8.9126], "4g6g": [9.878, 8.6206] }]]],
  ["12.0", [["M12x1.75", 1.75, { "6g": [11.8335, 9.8365], "6H": [12.2265, 10.2735], "4g6g": [11.8335, 9.864] }], ["M12x1.5", 1.5, { "6g": [11.85, 10.137], "6H": [12.203, 10.526], "4g6g": [11.85, 10.162] }], ["M12x1.25", 1.25, { "6g": [11.866, 10.4385], "6H": [12.18, 10.7795], "4g6g": [11.866, 10.462] }]]],
  ["14.0", [["M14x2", 2, { "6g": [13.822, 11.534], "6H": [14.2505, 12.0225], "4g6g": [13.822, 11.564] }], ["M14x1.5", 1.5, { "6g": [13.85, 12.137], "6H": [14.203, 12.526], "4g6g": [13.85, 12.162] }], ["M14x1.25", 1.25, { "6g": [13.866, 12.4385], "6H": [14.1752, 12.7793], "4g6g": [13.866, 12.462] }]]],
  ["16.0", [["M16x2", 2, { "6g": [15.822, 13.534], "6H": [16.2505, 14.0225], "4g6g": [15.822, 13.564] }], ["M16x1.6", 1.6, { "6g": [15.862, 14.037], "6H": [16.1855, 14.4179], "4g6g": [15.862, 14.0565] }], ["M16x1.5", 1.5, { "6g": [15.85, 14.137], "6H": [16.203, 14.526], "4g6g": [15.85, 14.162] }]]],
  ["20.0", [["M20x2.5", 2.5, { "6g": [19.7905, 16.938], "6H": [20.2925, 17.519], "4g6g": [19.7905, 16.97] }], ["M20x2", 2, { "6g": [19.822, 17.5339], "6H": [20.2503, 18.0224], "4g6g": [19.822, 17.5634] }], ["M20x1.5", 1.5, { "6g": [19.85, 18.137], "6H": [20.203, 18.526], "4g6g": [19.85, 18.162] }]]],
  ["24.0", [["M24x3", 3, { "6g": [23.7645, 20.3295], "6H": [24.349, 21.002], "4g6g": [23.7545, 20.367] }], ["M24x2.5", 2.5, { "6g": [23.7905, 20.9279], "6H": [24.3054, 21.5187], "4g6g": [23.7905, 20.9629] }], ["M24x2", 2, { "6g": [23.822, 21.529], "6H": [24.2565, 22.0225], "4g6g": [23.822, 21.561] }]]],
  ["30.0", [["M30x3.5", 3.5, { "6g": [29.7345, 25.732], "6H": [30.3925, 26.491], "4g6g": [29.7345, 25.772] }], ["M30x3", 3, { "6g": [29.7645, 26.3299], "6H": [30.349, 27.0024], "4g6g": [29.7645, 26.3674] }], ["M30x2.5", 2.5, { "6g": [29.7905, 26.9279], "6H": [30.3054, 27.5187], "4g6g": [29.7905, 26.9629] }]]],
];

const EXTERNAL = ["4g6g", "6g"];
const INTERNAL = ["6H"];

// ---------- custom threads library (Manage Threads Library) ----------
// A custom thread type: {name, unit:'mm'|'in', angle, items:[{size, designation, cls, gender:'external'|'internal',
// pitch, major, minor}]} (lengths in the type's unit). The library is kept in localStorage (try/catch) and in
// files (threads-library.js). Every function below takes an optional thread type name (default ISO metric).
const LIB_KEY = "fusion-recreation.threadsLibrary.v1";
let LIB = null;
const num = (x) => Number.parseFloat(x);
/** A cleaned copy of a thread type (null when unusable). */
export function cleanThreadType(t) {
  if (!t || typeof t.name !== "string" || !t.name.trim()) return null;
  const items = (Array.isArray(t.items) ? t.items : []).filter((it) => it && String(it.size || "").trim() && String(it.designation || "").trim() && String(it.cls || "").trim())
    .map((it) => ({ size: String(it.size).trim(), designation: String(it.designation).trim(), cls: String(it.cls).trim(), gender: it.gender === "internal" ? "internal" : "external", pitch: num(it.pitch), major: num(it.major), minor: num(it.minor) }));
  return { name: t.name.trim(), unit: t.unit === "in" ? "in" : "mm", angle: num(t.angle) > 0 ? num(t.angle) : 60, items };
}
/** The custom thread types (a live array: change it through saveThreadLibrary). */
export function threadLibrary() {
  if (LIB) return LIB;
  LIB = [];
  try {
    const s = globalThis.localStorage && globalThis.localStorage.getItem(LIB_KEY);
    const v = s ? JSON.parse(s) : [];
    if (Array.isArray(v)) LIB = v.map(cleanThreadType).filter(Boolean);
  } catch { LIB = []; }
  return LIB;
}
/** Replaces and stores the custom library. */
export function saveThreadLibrary(types) {
  LIB = (types || []).map(cleanThreadType).filter(Boolean);
  try { if (globalThis.localStorage) globalThis.localStorage.setItem(LIB_KEY, JSON.stringify(LIB)); } catch { /* storage unavailable */ }
  return LIB;
}
/** Problems of one thread type (Fusion's library messages), [] when it is fine. */
export function threadTypeErrors(t, others = []) {
  const out = [];
  if (!t || !t.name || !t.name.trim()) out.push("Enter a thread type name.");
  else if (t.name.trim() === ISO_NAME || others.some((o) => o !== t && o.name === t.name.trim())) out.push(`A thread type named "${t.name.trim()}" already exists.`);
  const key = new Set(), pitch = new Map();
  (t && t.items || []).forEach((it, i) => {
    const row = `Row ${i + 1}: `;
    if (!String(it.size || "").trim() || !String(it.designation || "").trim() || !String(it.cls || "").trim()) out.push(row + "Enter a size, a designation and a class.");
    if (!(num(it.pitch) > 0)) out.push(row + "The pitch must be positive.");
    if (!(num(it.major) > num(it.minor) && num(it.minor) > 0)) out.push(row + "The major diameter must be larger than the minor diameter.");
    const k = `${it.size}|${it.designation}|${it.cls}`;
    if (key.has(k)) out.push(row + "Duplicate thread specification found in this hub library. Use a unique combination of size, designation, and class to distinguish it in commands.");
    key.add(k);
    const pk = `${it.size}|${it.designation}`;
    if (pitch.has(pk) && Math.abs(pitch.get(pk) - num(it.pitch)) > 1e-9) out.push(row + "An item with the same size and designation already exists in this library but uses a different pitch. Items that share size and designation must have matching pitch values.");
    if (!pitch.has(pk)) pitch.set(pk, num(it.pitch));
  });
  return out;
}
const ISO_NAME = THREAD_TYPES[0].value;
/** The ISO metric table as library items (Copy of the standard type). */
export function isoItems() {
  const out = [];
  for (const [size, des] of ISO) for (const [designation, pitch, cls] of des) for (const [c, [major, minor]] of Object.entries(cls)) out.push({ size, designation, cls: c, gender: INTERNAL.includes(c) ? "internal" : "external", pitch, major, minor });
  return out;
}
const customType = (type) => (type && type !== ISO_NAME ? threadLibrary().find((t) => t.name === type) || null : null);
/** [[size, [[designation, pitch, {cls: [major, minor]}]]]] of a thread type (sizes in numeric order). */
function tableOf(type) {
  const c = customType(type);
  if (!c) return ISO;
  const sizes = new Map();
  for (const it of c.items) {
    let s = sizes.get(it.size);
    if (!s) sizes.set(it.size, (s = new Map()));
    let d = s.get(it.designation);
    if (!d) s.set(it.designation, (d = [it.designation, it.pitch, {}]));
    d[2][it.cls] = [it.major, it.minor];
  }
  return [...sizes].sort((a, b) => (num(a[0]) - num(b[0])) || (a[0] < b[0] ? -1 : 1)).map(([s, m]) => [s, [...m.values()]]);
}
const unitOf = (type) => (customType(type) || {}).unit || "mm";
/** Thread Type options: ISO Metric profile, then the custom types of the library. */
export function threadTypeOptions() { return [...THREAD_TYPES, ...threadLibrary().map((t) => ({ value: t.name, label: t.name }))]; }

/** Size options ("10.0 mm"). */
export function sizeOptions(type) { const u = unitOf(type); return tableOf(type).map(([s]) => ({ value: s, label: `${s} ${u}` })); }
/** Designation options of a size ("M10x1.5", ...). */
export function designationOptions(size, type) {
  const e = tableOf(type).find(([s]) => s === size);
  return (e ? e[1] : []).map(([d]) => ({ value: d, label: d }));
}
/** Class options for a designation (external: 4g6g, 6g; internal: 6H; custom types: their classes of that gender). */
export function classOptions(internal, type, size, designation) {
  const c = customType(type);
  if (!c) return (internal ? INTERNAL : EXTERNAL).map((x) => ({ value: x, label: x }));
  const seen = new Set();
  for (const it of c.items) if ((it.gender === "internal") === !!internal && (size == null || it.size === size) && (designation == null || it.designation === designation)) seen.add(it.cls);
  return [...seen].map((x) => ({ value: x, label: x }));
}
export const defaultClass = (internal, type, size, designation) => {
  if (!customType(type)) return internal ? "6H" : "6g";
  const o = classOptions(internal, type, size, designation);
  return o[0] ? o[0].value : "";
};

/** {pitch, major, minor} in mm of a size / designation / class (null when unknown). */
export function threadData(size, designation, cls, type) {
  const c = customType(type);
  const e = tableOf(type).find(([s]) => s === size);
  const d = e && (e[1].find(([n]) => n === designation) || (c ? null : e[1][0]));
  if (!d) return null;
  const dia = d[2][cls] || (c ? null : d[2]["6g"]);
  if (!dia) return null;
  const k = c && c.unit === "in" ? 25.4 : 1;
  return { designation: d[0], pitch: d[1] * k, major: dia[0] * k, minor: dia[1] * k };
}

/**
 * Fusion picks the thread size from the selected cylinder: the nearest nominal size for an external
 * thread (the cylinder is the major diameter), the size whose internal minor diameter is closest to
 * a hole's diameter (the hole is the tap drill).
 */
export function sizeForDiameter(dia, internal, type) {
  const c = customType(type);
  const T = tableOf(type);
  if (!T.length) return "";
  const k = c && c.unit === "in" ? 25.4 : 1;
  let best = T[0][0], bd = Infinity;
  for (const [s, des] of T) {
    let ref = num(s) * k;
    if (c) {
      const it = c.items.find((x) => x.size === s && (x.gender === "internal") === !!internal);
      if (it) ref = (internal ? it.minor : it.major) * k;
    } else if (internal) ref = des[0][2]["6H"][1];
    const d = Math.abs(ref - dia);
    if (d < bd - 1e-9) { bd = d; best = s; }
  }
  return best;
}
