// Fasteners (FusionFastenersCommand) and Fastener Stack Analysis (FusionFastenerStackAnalysisCommand).
// A local parametric library of ISO and ANSI screws, bolts, nuts and washers. Feature 'fastener' (New Component):
// placed on a hole (cylindrical face or circular edge), sized from the hole, with a length choice and an optional
// stack (washer under the head, washer and nut at the far end). The bodies are built in world space at the hole.
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import { clone, esc, V, infoRow } from "./util.js";
import { glyph } from "../browser/ui.js";

const R = K.R;
const IN = 25.4;
const ISO_LEN = [5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200];
const ANSI_LEN = [0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.5, 4, 4.5, 5, 5.5, 6].map((x) => x * IN);

// d, pitch | socket head dk, k, key s, key depth t | hex head s, k | nut m | washer d1, d2, h
const ISO_ROWS = {
  M3: [3, 0.5, 5.5, 3, 2.5, 1.3, 5.5, 2, 2.4, 3.2, 7, 0.5],
  M4: [4, 0.7, 7, 4, 3, 2, 7, 2.8, 3.2, 4.3, 9, 0.8],
  M5: [5, 0.8, 8.5, 5, 4, 2.5, 8, 3.5, 4.7, 5.3, 10, 1],
  M6: [6, 1, 10, 6, 5, 3, 10, 4, 5.2, 6.4, 12, 1.6],
  M8: [8, 1.25, 13, 8, 6, 4, 13, 5.3, 6.8, 8.4, 16, 1.6],
  M10: [10, 1.5, 16, 10, 8, 5, 16, 6.4, 8.4, 10.5, 20, 2],
  M12: [12, 1.75, 18, 12, 10, 6, 18, 7.5, 10.8, 13, 24, 2.5],
  M16: [16, 2, 24, 16, 14, 8, 24, 10, 14.8, 17, 30, 3],
  M20: [20, 2.5, 30, 20, 17, 10, 30, 12.5, 18, 21, 37, 3],
};
// inches: d, threads per inch | socket D, H, key, key depth | hex F, H | nut H | washer ID, OD, t (nut F = hex F)
const ANSI_ROWS = {
  "#10-24": [0.19, 24, 0.312, 0.19, 0.156, 0.095, 0.3125, 0.14, 0.125, 0.219, 0.5, 0.049],
  "1/4-20": [0.25, 20, 0.375, 0.25, 0.1875, 0.125, 0.4375, 0.172, 0.219, 0.281, 0.625, 0.065],
  "5/16-18": [0.3125, 18, 0.469, 0.3125, 0.25, 0.156, 0.5, 0.219, 0.266, 0.344, 0.688, 0.065],
  "3/8-16": [0.375, 16, 0.5625, 0.375, 0.3125, 0.188, 0.5625, 0.25, 0.328, 0.406, 0.812, 0.065],
  "1/2-13": [0.5, 13, 0.75, 0.5, 0.375, 0.25, 0.75, 0.344, 0.438, 0.531, 1.062, 0.095],
  "5/8-11": [0.625, 11, 0.9375, 0.625, 0.5, 0.312, 0.9375, 0.422, 0.547, 0.656, 1.312, 0.095],
  "3/4-10": [0.75, 10, 1.125, 0.75, 0.625, 0.375, 1.125, 0.5, 0.641, 0.812, 1.469, 0.134],
};
const rowOf = (a, k, pitch) => ({ d: a[0] * k, pitch, dk: a[2] * k, k: a[3] * k, key: a[4] * k, t: a[5] * k, s: a[6] * k, kh: a[7] * k, m: a[8] * k, d1: a[9] * k, d2: a[10] * k, h: a[11] * k });
const STD = {
  ISO: {
    label: "ISO", lengths: ISO_LEN, unit: "mm",
    sizes: Object.fromEntries(Object.entries(ISO_ROWS).map(([n, a]) => [n, rowOf(a, 1, a[1])])),
    codes: { hexbolt: "ISO 4017", socket: "ISO 4762", nut: "ISO 4032", washer: "ISO 7089" },
    fmtLen: (L) => `${Math.round(L * 100) / 100}`,
    sizeName: (n, z) => `${n}x${z.pitch}`,
  },
  ANSI: {
    label: "ANSI", lengths: ANSI_LEN, unit: "in",
    sizes: Object.fromEntries(Object.entries(ANSI_ROWS).map(([n, a]) => [n, rowOf(a, IN, IN / a[1])])),
    codes: { hexbolt: "ASME B18.2.1", socket: "ASME B18.3", nut: "ASME B18.2.2", washer: "ASME B18.22.1" },
    fmtLen: (L) => `${Math.round((L / IN) * 1000) / 1000}`,
    sizeName: (n) => n,
  },
};
const KINDS = {
  hexbolt: { label: "Hex Bolt", screw: true, body: "Bolt" },
  socket: { label: "Socket Head Cap Screw", screw: true, body: "Screw" },
  nut: { label: "Hex Nut", screw: false, body: "Nut" },
  washer: { label: "Plain Washer", screw: false, body: "Washer" },
};
const ROLES = ["main", "washer", "nutWasher", "nut"];
const ROLE_NAME = { washer: "Washer", nutWasher: "Washer", nut: "Nut" };

export const fastenerStandards = () => Object.keys(STD);
export const fastenerKinds = () => Object.keys(KINDS);

// ------------------------------------------------------------------ hole and plan
/** The hole a fastener sits in: {o, a, r, len, pick} from a stored face / edge ref. Throws a friendly error. */
export function holeOf(st, ref) {
  const b = ref && st.bodies.get(ref.body);
  if (!b || !b.shape) throw new Error("The hole geometry is missing");
  const shape = b.shape;
  if (ref.kind === "edge") {
    const idx = M.locateEdge(shape, ref);
    const e = idx >= 0 ? K.topoOf(shape).edges[idx] : null;
    if (!e || e.type !== "CIRCLE" || !e.a || !e.c) throw new Error("Select a hole edge or a cylindrical hole face");
    for (const fi of e.faces || []) {
      const c = K.cylinderFaceInfo(shape, fi);
      if (c && Math.abs(c.r - e.r) < 1e-3) return { ...c, pick: e.c };
    }
    return { o: e.c, a: V.norm(e.a), r: e.r, len: 0, internal: true, pick: e.c };
  }
  const idx = M.locateFace(shape, ref);
  const c = idx >= 0 ? K.cylinderFaceInfo(shape, idx) : null;
  if (!c) throw new Error("Select a hole edge or a cylindrical hole face");
  return { ...c, pick: ref.p || c.o };
}

function autoSize(std, holeD) {
  const names = Object.keys(std.sizes);
  let best = null;
  for (const n of names) if (std.sizes[n].d <= holeD + 0.02) best = n;
  if (!best) return { size: names[0], warning: "Automatically selected bolt is too big for the selected geometry." };
  if (best === names[names.length - 1] && holeD > std.sizes[best].d * 1.5) return { size: best, warning: "Automatically selected bolt is too small for the selected geometry." };
  return { size: best };
}
const lengthsFor = (std, z) => std.lengths.filter((L) => L >= Math.max(std.lengths[0], 1.5 * z.d) - 1e-6 && L <= Math.min(std.lengths[std.lengths.length - 1], 12 * z.d) + 1e-6);

/** The resolved stack of a fastener feature on a hole: size, length, frame and the pieces. */
export function planOf(f, hole) {
  const std = STD[f.std] || STD.ISO;
  const kind = KINDS[f.kind] ? f.kind : "socket";
  const fam = KINDS[kind];
  const holeD = 2 * hole.r;
  const auto = autoSize(std, holeD);
  const size = f.size && f.size !== "auto" && std.sizes[f.size] ? f.size : auto.size;
  const z = std.sizes[size];
  const warnings = [];
  if (!f.size || f.size === "auto") { if (auto.warning) warnings.push(auto.warning); } else if (z.d > holeD + 0.02) warnings.push("The fastener no longer fits the selected geometry.");
  const a = V.norm(hole.a);
  const len = Math.max(0, hole.len || 0);
  const t = V.dot(V.sub(hole.pick || hole.o, hole.o), a);
  let headHigh = len > 0 ? t > len / 2 : false;
  if (f.flip) headHigh = !headHigh;
  const entry = headHigh ? V.add(hole.o, V.mul(a, len)) : hole.o;
  const n = headHigh ? a : V.mul(a, -1);
  const washer = fam.screw && !!f.washer, nut = fam.screw && !!f.nut;
  const grip = len;
  let L = 0, ideal = 0;
  const lens = lengthsFor(std, z);
  if (fam.screw) {
    ideal = grip + (washer ? z.h : 0) + (nut ? (washer ? z.h : 0) + z.m + 2 * z.pitch : 0);
    if (Number(f.length) > 0) L = Number(f.length);
    else {
      L = lens.find((x) => x >= ideal - 1e-6);
      if (L === undefined) { L = lens[lens.length - 1]; warnings.push("The ideal length is too long for the current family."); }
      if (lens.length && ideal < lens[0] * 0.5) warnings.push("The ideal length is too short for the current family.");
    }
  }
  const code = std.codes[kind];
  const sname = std.sizeName(size, z);
  const name = fam.screw ? `${code} - ${sname} x ${std.fmtLen(L)}` : kind === "washer" ? `${code} - ${size.replace(/-.*$/, "").replace(/^M/, "")}` : `${code} - ${sname}`;
  return { std, kind, fam, size, z, L, ideal, lens, grip, entry, n, washer, nut, holeD, name, warnings };
}

// ------------------------------------------------------------------ geometry
const P3 = (pl, r, z) => V.add(V.add(pl.o, V.mul(pl.x, r)), V.mul(pl.n, z));
function rev(pl, rz) {
  const face = K.polygonFace(rz.map(([r, z]) => P3(pl, r, z)));
  try { return K.revolveFace(face, pl.o, pl.n, 360); } finally { K.del(face); }
}
const hexPrism = (pl, s, z0, z1) => K.extrudeDrawing(R.drawPolysides(s / Math.sqrt(3), 6), pl, z0, z1 - z0);
/** Hex with Fusion-like 30 degree chamfers (top, and bottom too for nuts). */
function hex(pl, s, z0, z1, both) {
  const Rc = (s / Math.sqrt(3)) * 1.02, rt = 0.95 * (s / 2), c = (Rc - rt) * Math.tan(Math.PI / 6);
  const prism = hexPrism(pl, s, z0, z1);
  const prof = both ? [[0, z0], [rt, z0], [Rc, z0 + c], [Rc, z1 - c], [rt, z1], [0, z1]] : [[0, z0], [Rc, z0], [Rc, z1 - c], [rt, z1], [0, z1]];
  const cone = rev(pl, prof);
  try { return K.intersect(prism, cone); } finally { K.del(prism, cone); }
}
const withCut = (a, b) => { try { return K.cut(a, b); } finally { K.del(a, b); } };
const withFuse = (a, b) => { try { return K.fuse(a, b); } finally { K.del(a, b); } };

function pieces(p) {
  const pl = K.planeFromNormal(p.entry, p.n);
  const z = p.z;
  const out = {};
  if (p.kind === "nut") { out.main = withCut(hex(pl, z.s, 0, z.m, true), rev(pl, [[0, -1], [z.d / 2, -1], [z.d / 2, z.m + 1], [0, z.m + 1]])); return out; }
  if (p.kind === "washer") { out.main = rev(pl, [[z.d1 / 2, 0], [z.d2 / 2, 0], [z.d2 / 2, z.h], [z.d1 / 2, z.h]]); return out; }
  const zb = p.washer ? z.h : 0;
  const c = Math.min(z.pitch, p.L * 0.2);
  const shank = [[z.d / 2, zb], [z.d / 2, zb - p.L + c], [z.d / 2 - c, zb - p.L], [0, zb - p.L]];
  if (p.kind === "socket") {
    const ch = z.dk * 0.04;
    const body = rev(pl, [[0, zb + z.k], [z.dk / 2 - ch, zb + z.k], [z.dk / 2, zb + z.k - ch], [z.dk / 2, zb], ...shank]);
    out.main = withCut(body, hexPrism(pl, z.key, zb + z.k - z.t, zb + z.k + 1));
  } else {
    out.main = withFuse(hex(pl, z.s, zb, zb + z.kh, false), rev(pl, [[0, zb + z.kh * 0.5], [z.d / 2, zb + z.kh * 0.5], ...shank]));
  }
  const ring = (z0) => rev(pl, [[z.d1 / 2, z0], [z.d2 / 2, z0], [z.d2 / 2, z0 + z.h], [z.d1 / 2, z0 + z.h]]);
  if (p.washer) out.washer = ring(0);
  if (p.nut) {
    const zw = -p.grip - (p.washer ? z.h : 0);
    if (p.washer) out.nutWasher = ring(zw);
    out.nut = withCut(hex(pl, z.s, zw - z.m, zw, true), rev(pl, [[0, zw - z.m - 1], [z.d / 2, zw - z.m - 1], [z.d / 2, zw + 1], [0, zw + 1]]));
  }
  return out;
}

// shapes per (plan, hole) are cached: the evaluator re-runs features often
const CACHE = new Map();
const SHAPE_IDS = new WeakMap();
let seq = 0;
const sid = (s) => { let i = SHAPE_IDS.get(s); if (!i) { i = ++seq; SHAPE_IDS.set(s, i); } return i; };

function registerFeature() {
  M.registerFeature("fastener", {
    label: "Fastener",
    stem: "Fastener",
    fields: {},
    makesBodies: () => ROLES.length,
    apply(st, f) {
      const hole = holeOf(st, f.hole);
      const p = planOf(f, hole);
      const key = JSON.stringify([f.std, f.kind, f.size, f.length, !!f.washer, !!f.nut, !!f.flip, f.hole && f.hole.kind, sid(st.bodies.get(f.hole.body).shape), f.hole.p]);
      let made = CACHE.get(key);
      if (!made) {
        made = pieces(p);
        CACHE.set(key, made);
        if (CACHE.size > 40) CACHE.delete(CACHE.keys().next().value);
      }
      const affected = [];
      ROLES.forEach((role, i) => {
        const id = f.newBodies && f.newBodies[i];
        if (id && made[role]) { st.bodies.set(id, { id, shape: made[role], from: f.id }); affected.push(id); }
      });
      const out = { affected, size: p.size, length: p.L, ideal: p.ideal, grip: p.grip, holeD: p.holeD, name: p.name };
      if (p.warnings.length) out.warning = p.warnings[0];
      return out;
    },
    deps: (f) => ({ sketches: [], bodies: f.hole && f.hole.body ? [f.hole.body] : [], features: [], cplanes: [], geo: [] }),
    editor: (app, id) => openFasteners(app, id),
    icon: "FusionFastenersCommand",
  });
}

// ------------------------------------------------------------------ dialog
const holeRefOf = (r) => (r ? { kind: r.kind, body: r.body, p: r.p, ...(r.n ? { n: r.n } : {}), ...(r.sig ? { sig: r.sig } : {}) } : null);
function acceptHole(app, r) {
  const st = app.result && app.result.state;
  const b = st && r && st.bodies.get(r.body);
  if (!b || !b.shape) return false;
  try {
    if (r.kind === "edge") { const e = K.topoOf(b.shape).edges[r.index]; return !!e && e.type === "CIRCLE"; }
    if (r.kind === "face") { const c = K.cylinderFaceInfo(b.shape, r.index); return !!c && c.internal; }
  } catch { return false; }
  return false;
}

function sizeOptions(stdKey) { return [{ value: "auto", label: "Auto" }, ...Object.keys(STD[stdKey].sizes).map((n) => ({ value: n, label: n }))]; }
function lengthOptions(stdKey, size) {
  const std = STD[stdKey];
  const z = std.sizes[size] || Object.values(std.sizes)[0];
  return [{ value: "auto", label: "Auto" }, ...lengthsFor(std, z).map((L) => ({ value: String(Math.round(L * 1e4) / 1e4), label: `${std.fmtLen(L)} ${std.unit}` }))];
}

function openFasteners(app, editId) {
  if (app.mode === "sketch") { app.toast("Finish the sketch before placing fasteners", "warn"); return null; }
  const ef = editId ? app.feature(editId) : null;
  const pre = editId ? [] : [...((app.selection && app.selection.items) || [])].filter((r) => (r.kind === "face" || r.kind === "edge") && acceptHole(app, r)).slice(0, 1);
  let plan = null;
  const featureOf = (v) => {
    const r = (v.hole || [])[0];
    if (!r) return null;
    return { type: "fastener", operation: "newComponent", std: v.std, kind: v.kind, size: v.size, length: v.length === "auto" ? "auto" : Number(v.length), washer: !!v.washer, nut: !!v.nut, flip: !!v.flip, hole: holeRefOf(r) };
  };
  const refreshPlan = (dlg) => {
    plan = null;
    const f = featureOf(dlg.values);
    const st = app.result && app.result.state;
    if (!f || !st) return;
    try { plan = planOf(f, holeOf(st, f.hole)); } catch { plan = null; }
  };
  const syncOptions = (dlg) => {
    const so = sizeOptions(dlg.values.std);
    dlg.defs.size.options = so;
    if (!so.some((o) => o.value === dlg.values.size)) dlg.values.size = "auto";
    refreshPlan(dlg);
    const lo = lengthOptions(dlg.values.std, plan ? plan.size : Object.keys(STD[dlg.values.std].sizes)[0]);
    dlg.defs.length.options = lo;
    if (!lo.some((o) => o.value === dlg.values.length)) dlg.values.length = "auto";
  };
  const isScrew = (v) => !!(KINDS[v.kind] && KINDS[v.kind].screw);
  return app.ui.dialog.open({
    id: "FusionFastenersCommand",
    title: "Fasteners",
    icon: "FusionFastenersCommand",
    editId: editId || null,
    featureLabel: "Fastener",
    help: "Inserts standard fasteners (screws, bolts, nuts and washers) from a local library on hole geometry. The size follows the hole.",
    preselect: pre,
    ctrlWidth: 190,
    rows: [
      { id: "hole", type: "selection", label: "Geometry", kinds: ["face", "edge"], max: 1, filter: (r) => acceptHole(app, r), prompt: "Select a hole edge or a cylindrical hole face" },
      { id: "std", type: "dropdown", label: "Standard", options: Object.keys(STD).map((k) => ({ value: k, label: STD[k].label })), default: "ISO", sep: true },
      { id: "kind", type: "dropdown", label: "Fastener Type", options: Object.entries(KINDS).map(([k, d]) => ({ value: k, label: d.label })), default: "socket" },
      { id: "size", type: "dropdown", label: "Size", options: sizeOptions("ISO"), default: "auto" },
      { id: "length", type: "dropdown", label: "Length", options: lengthOptions("ISO", "M6"), default: "auto", visible: (v) => isScrew(v) },
      { id: "washer", type: "check", label: "Washer", tooltip: "Adds a washer under the head (and under the nut)", default: false, visible: (v) => isScrew(v) },
      { id: "nut", type: "check", label: "Nut", tooltip: "Adds a nut at the far end of the hole", default: false, visible: (v) => isScrew(v) },
      { id: "flip", type: "check", label: "Flip", tooltip: "Inserts the fastener from the other end of the hole", default: false },
      infoRow("fit", "Fit", () => (!plan ? "" : `${plan.fam.label} ${plan.std.sizeName(plan.size, plan.z)}${plan.fam.screw ? ` x ${plan.std.fmtLen(plan.L)} ${plan.std.unit}` : ""} in a ${(plan.holeD / (plan.std.unit === "in" ? IN : 1)).toFixed(3).replace(/\.?0+$/, "")} ${plan.std.unit} hole`), { visible: () => !!plan }),
    ],
    init(dlg) {
      if (ef) {
        Object.assign(dlg.values, {
          hole: ef.hole ? [{ ...clone(ef.hole) }] : [], std: STD[ef.std] ? ef.std : "ISO", kind: KINDS[ef.kind] ? ef.kind : "socket",
          size: ef.size || "auto", length: Number(ef.length) > 0 ? String(Math.round(Number(ef.length) * 1e4) / 1e4) : "auto",
          washer: !!ef.washer, nut: !!ef.nut, flip: !!ef.flip,
        });
      }
    },
    onOpen(dlg) { syncOptions(dlg); dlg.refresh(); },
    onChange(id, dlg) {
      if (id === "std") dlg.values.size = "auto";
      if (["std", "hole", "kind", "size"].includes(id)) dlg.values.length = "auto";
      syncOptions(dlg);
    },
    build: (v) => featureOf(v),
    status: () => (plan ? plan.name : ""),
    commit(feat, dlg) {
      const f = feat || featureOf(dlg.values);
      if (!f) return null;
      let p = null;
      try { p = planOf(f, holeOf(app.result.state, f.hole)); } catch { p = null; }
      const out = app.mutate(editId ? "Edit Fastener" : "Fastener", (d) => {
        let nf;
        if (editId) {
          nf = d.features.find((x) => x.id === editId);
          if (!nf) throw new Error("The feature no longer exists");
          const keep = { id: nf.id, name: nf.name, newBodies: nf.newBodies, suppressed: nf.suppressed, occ: nf.occ, newOcc: nf.newOcc, newComp: nf.newComp };
          for (const k of Object.keys(nf)) delete nf[k];
          Object.assign(nf, clone(f));
          for (const [k, v] of Object.entries(keep)) if (v !== undefined) nf[k] = v;
          app._prepareFeature(d, nf);
        } else {
          nf = clone(f);
          app._prepareFeature(d, nf);
          d.features.splice(d.marker, 0, nf);
          d.marker += 1;
        }
        if (p && nf.newComp && d.components && d.components[nf.newComp]) d.components[nf.newComp].name = p.name;
        if (p) ROLES.forEach((role, i) => { const m = d.bodies[(nf.newBodies || [])[i]]; if (m) m.name = role === "main" ? p.fam.body : ROLE_NAME[role]; });
        return nf;
      });
      if (p && p.warnings.length) app.toast(p.warnings[0], "warn");
      return out;
    },
  });
}

// ------------------------------------------------------------------ browser folder
function fastenerFeatures(app) {
  const d = app.doc;
  return (d.features || []).filter((f, i) => f.type === "fastener" && i < d.marker && !f.suppressed && f.newOcc && app.components && app.components.alive(f.newOcc));
}
function folder(app) {
  const list = fastenerFeatures(app);
  if (!list.length) return null;
  return {
    children: list.map((f) => ({
      key: `fastener:${f.id}`,
      label: app.components.label(f.newOcc) || f.name,
      icon: glyph("br-component"),
      ref: { kind: "occurrence", occ: f.newOcc },
      onDbl: () => app.editFeature(f.id),
      menu: () => [{ label: "Edit Fastener", action: () => app.editFeature(f.id) }],
    })),
  };
}

// ------------------------------------------------------------------ Fastener Stack Analysis
/** Engagement and fit checks of every fastener stack of the design. */
export function analyzeStacks(app) {
  const st = app.result && app.result.state;
  const rows = [];
  for (const f of fastenerFeatures(app)) {
    const res = (app.result && app.result.results && app.result.results[f.id]) || {};
    const row = { id: f.id, occ: f.newOcc, name: app.components.label(f.newOcc) || f.name, issues: [] };
    let p = null;
    try { p = planOf(f, holeOf(st, f.hole)); } catch (e) { row.issues.push(e.message || String(e)); }
    if (p) {
      const z = p.z;
      Object.assign(row, { size: p.std.sizeName(p.size, z), hole: p.holeD, grip: p.grip, length: p.fam.screw ? p.L : null, unit: p.std.unit });
      if (z.d > p.holeD + 0.02) row.issues.push("The fastener is larger than the hole.");
      else if (p.fam.screw && p.holeD > z.d * 1.25 + 0.5) row.issues.push("The hole is much larger than the fastener.");
      if (f.size && f.size !== "auto" && f.size !== autoSize(p.std, p.holeD).size) row.issues.push("The fastener no longer fits the selected geometry.");
      if (p.fam.screw) {
        if (p.nut) {
          const free = p.L - (p.grip + (p.washer ? 2 * z.h : 0) + z.m);
          row.protrusion = free;
          if (free < z.pitch - 1e-6) row.issues.push(`Thread engagement: the screw ends ${free < 0 ? "inside" : "flush with"} the nut (at least one pitch must protrude).`);
        } else if (p.holeD >= z.d) row.issues.push("No nut: the screw has no thread to engage in a clearance hole.");
        if (p.L < p.grip + (p.washer ? z.h : 0) - 1e-6) row.issues.push("The screw is shorter than the stack.");
      }
    }
    if (res.ok === false && res.error) row.issues.push(res.error);
    rows.push(row);
  }
  return rows;
}

function openStackAnalysis(app) {
  if (app.mode === "sketch") { app.toast("Finish the sketch first", "warn"); return null; }
  const rows = analyzeStacks(app);
  if (!rows.length) { app.toast("The design has no fasteners. Use Fasteners to place some on holes.", "info"); return null; }
  const fmt = (v, u) => (v == null ? "" : `${(u === "in" ? v / IN : v).toFixed(u === "in" ? 3 : 2)}`);
  const table = () => {
    const head = "<tr><th>Fastener Stack</th><th>Size</th><th>Hole</th><th>Grip</th><th>Length</th><th>Status</th></tr>";
    const body = rows.map((r, i) => `<tr class="ix-row-pick${r.issues.length ? " ix-bad" : ""}" data-row="${i}" title="${esc(r.issues.join(" ") || "Meets the engagement rules")}"><td>${esc(r.name)}</td><td>${esc(r.size || "")}</td><td>${fmt(r.hole, r.unit)}</td><td>${fmt(r.grip, r.unit)}</td><td>${fmt(r.length, r.unit)}</td><td>${r.issues.length ? "Engagement issue(s)" : "OK"}</td></tr>`).join("");
    return `<table class="ix-table" data-table="stacks">${head}${body}</table>`;
  };
  const bad = rows.filter((r) => r.issues.length).length;
  return app.ui.dialog.open({
    id: "FusionFastenerStackAnalysisCommand",
    title: "Fastener Stack Analysis",
    icon: "FusionFastenerStackAnalysisCommand",
    featureLabel: "Fastener Stack Analysis",
    help: "Checks the fastener stacks of the design against the engagement rules of their components.",
    preview: false, noFeature: true, activate: false, ctrlWidth: 330, labelWidth: 1,
    rows: [
      {
        id: "stacks", type: "custom",
        render() {
          const el = document.createElement("div");
          el.className = "dlg-row ix-stack-row";
          el.innerHTML = table();
          el.addEventListener("click", (e) => {
            const tr = e.target.closest && e.target.closest("tr[data-row]");
            if (!tr) return;
            const r = rows[Number(tr.dataset.row)];
            if (r && app.components.alive(r.occ)) app.selection.set([{ kind: "occurrence", occ: r.occ }]);
          });
          return el;
        },
        update() {},
      },
      infoRow("summary", "", () => (bad ? `${bad} of ${rows.length} stacks: some fastener stacks don't meet the engagement rules set by their components.` : `${rows.length} ${rows.length === 1 ? "stack meets" : "stacks meet"} the engagement rules.`)),
    ],
    commit: () => rows,
  });
}

export function initFasteners(app) {
  registerFeature();
  app.commands.register({ id: "FusionFastenersCommand", kind: "tool", label: "Fasteners", tooltip: "Inserts standard fasteners from a local library of ISO and ANSI screws, bolts, nuts and washers. Select a hole: the size follows the hole.", run: (a) => openFasteners(a || app, null) });
  app.commands.register({ id: "FusionFastenerStackAnalysisCommand", kind: "tool", label: "Fastener Stack Analysis", tooltip: "Checks the fastener stacks of the design against their engagement rules.", run: (a) => openStackAnalysis(a || app) });
  const hook = () => {
    const b = app.ui && app.ui.browser;
    if (!b || typeof b.registerFolder !== "function" || hook.done) return;
    hook.done = true;
    b.registerFolder({ key: "fasteners", label: "Fasteners", build: () => folder(app) });
  };
  hook();
  app.on("ready", hook);
  setTimeout(hook, 0);
  return { open: (id) => openFasteners(app, id || null), analyze: () => analyzeStacks(app), plan: (f) => planOf(f, holeOf(app.result.state, f.hole)) };
}
