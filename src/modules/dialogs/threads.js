// ISO metric threads. Sizes and pitches: ISO 261 (coarse pitch first). Diameters: computed from the
// ISO 68-1 basic profile and the ISO 965-1 tolerance formulas (classes 6g and 4g6g external, 6H internal),
// as the middle of each tolerance band, in mm. No vendor thread table is copied.
export const THREAD_TYPES = [{ value: "ISO Metric profile", label: "ISO Metric profile" }];

const ISO_PITCHES = [
  [1.6, [0.35, 0.2]], [2, [0.4, 0.25]], [2.5, [0.45, 0.35]], [3, [0.5, 0.35]], [4, [0.7, 0.5]], [5, [0.8, 0.5]],
  [6, [1, 0.75]], [8, [1.25, 1, 0.75]], [10, [1.5, 1.25, 1, 0.75]], [12, [1.75, 1.5, 1.25, 1]], [14, [2, 1.5, 1.25, 1]],
  [16, [2, 1.5, 1]], [20, [2.5, 2, 1.5, 1]], [24, [3, 2, 1.5, 1]], [30, [3.5, 3, 2, 1.5, 1]],
];
const RANGES = [0.99, 1.4, 2.8, 5.6, 11.2, 22.4, 45, 90, 180, 355];
const geoMean = (d) => { for (let i = 1; i < RANGES.length; i++) if (d <= RANGES[i]) return Math.sqrt(RANGES[i - 1] * RANGES[i]); return d; };
const mm = (um) => Math.round(um) / 1000;
const r4 = (x) => Math.round(x * 1e4) / 1e4;
function isoClasses(d, P) {
  const es = mm(15 + 11 * P);                                         // fundamental deviation of g (external)
  const Td = mm(180 * P ** (2 / 3) - 3.15 / Math.sqrt(P));            // major diameter tolerance, grade 6
  const Td2 = 90 * P ** 0.4 * geoMean(d) ** 0.1;                      // pitch diameter tolerance, grade 6 (um)
  const TD1 = mm(P < 1 ? 433 * P - 190 * P ** 1.22 : 230 * P ** 0.7); // internal minor diameter tolerance, grade 6
  const d3 = d - 1.226869 * P, D1 = d - 1.082532 * P;                // basic external root, basic internal minor
  const ext = (td2) => [r4(d - es - Td / 2), r4(d3 - es - td2 / 2)];
  return { "6g": ext(mm(Td2)), "4g6g": ext(mm(0.63 * Td2)), "6H": [r4(d + mm(1.32 * Td2) / 2), r4(D1 + TD1 / 2)] };
}
const ISO = ISO_PITCHES.map(([d, ps]) => [d.toFixed(1), ps.map((P) => [`M${d}x${P}`, P, isoClasses(d, P)])]);

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
