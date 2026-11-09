// PMI feature types -> render specs. A spec is {id, build(view) -> prims, orphan, warning, selRefs,
// general?} and is made both for committed timeline features and for the live dialog preview.
//
// Document feature types (timeline features; model.js passes them through untouched):
//   pmiNote         Note (LeaderLineNoteCommand)
//   pmiGeneralNote  General Note (GeneralNoteCommand)
//   pmiDimension    Sizes and Dimensions (DimensionNoteCommand)
//   pmiGdt          Geometric Tolerancing (GeometricToleranceNoteCommand): feature control frame and/or datum
//   pmiHoleNote     Hole/Thread Note (HoleThreadNoteCommand)
import * as G from "./geom.js";
import * as F from "./format.js";
import * as L from "./layout.js";
import { GDT_BY_ID } from "./text.js";

const V = G.V;
export const PMI_TYPES = ["pmiNote", "pmiGeneralNote", "pmiDimension", "pmiGdt", "pmiHoleNote"];
export const isPmi = (f) => !!f && PMI_TYPES.includes(f.type);
export const TYPE_LABELS = { pmiNote: "Note", pmiGeneralNote: "General Note", pmiDimension: "Dimension", pmiGdt: "Geometric Tolerance", pmiHoleNote: "Hole/Thread Note" };
export const TYPE_COMMAND = { pmiNote: "LeaderLineNoteCommand", pmiGeneralNote: "GeneralNoteCommand", pmiDimension: "DimensionNoteCommand", pmiGdt: "GeometricToleranceNoteCommand", pmiHoleNote: "HoleThreadNoteCommand" };
export const MSG_LOST = "The selection geometry has become invalid. It is likely that the selection is missing. Please edit this annotation and select new reference geometry.";
export const MSG_NO_GEOM = "The PMI has lost its associated geometry. Please update it by selecting valid geometry to annotate.";
export const DEFAULT_NOTE_TEXT = "Note text";

/** Evaluate an expression string (length by default) with the document parameters; NaN when invalid. */
export function evalExpr(P, expr, kind = "length") {
  if (expr === undefined || expr === null || expr === "") return NaN;
  if (typeof expr === "number") return expr;
  try { return P ? P.eval(String(expr), kind) : Number.parseFloat(expr); } catch { return NaN; }
}

/** Tolerance record with numeric values (mm / deg). */
export function tolValues(P, tol, kind = "length") {
  if (!tol || !tol.on) return null;
  return { on: true, type: tol.type || "symmetric", upper: evalExpr(P, tol.upper, kind), lower: evalExpr(P, tol.lower, kind), hole: tol.hole, shaft: tol.shaft };
}

// ---------------------------------------------------------------- shared
function resolveAll(state, refs) {
  const out = [];
  let lost = false;
  for (const r of refs || []) { const R = G.resolveRef(state, r); if (!R) lost = true; out.push(R); }
  return { R: out, lost };
}
function planeFor(f, state, R, extra = {}) {
  const custom = f.altFace ? G.resolveRef(state, f.altFace) : null;
  const cands = G.planeCandidates(state, R.filter(Boolean), { contain: extra.contain, custom: custom && custom.info && custom.info.type === "PLANE" ? custom.info.n : null });
  const pl = G.followPlane(f.plane, cands) || (cands[0] ? { type: cands[0].type, n: cands[0].n, x: G.planeX(cands[0].n) } : { type: "xy", n: [0, 0, 1], x: [1, 0, 0] });
  return pl;
}
function termFor(R) { return R && R.kind === "face" ? "dot" : "arrow"; }
const H_OF = (settings) => settings.size;

/** Substitute %n% placeholders with generated lines; drop lines that only held an empty placeholder. */
export function fillTemplate(tpl, values) {
  const lines = String(tpl ?? "").split("\n");
  const out = [];
  for (const line of lines) {
    const only = /^\s*%\d+%\s*$/.test(line);
    const s = line.replace(/%(\d+)%/g, (_, k) => values[Number(k) - 1] ?? "");
    if (only && !s.trim()) continue;
    out.push(s);
  }
  return out.length ? out : [""];
}
export const isPlaceholderOnly = (tpl) => /^(\s*%\d+%\s*\n?)*$/.test(String(tpl ?? ""));
export const defaultTemplate = (n) => Array.from({ length: Math.max(1, n) }, (_, i) => `%${i + 1}%`).join("\n");

// ---------------------------------------------------------------- Note
function noteSpec(f, ctx) {
  const { state, settings } = ctx;
  const { R, lost } = resolveAll(state, f.refs);
  const R0 = R[0];
  const T = R0 ? R0.point : f.target;
  if (!T) return null;
  const pl = R0 ? planeFor(f, state, R) : f.plane ? { n: f.plane.n, x: f.plane.x } : { n: [0, 0, 1], x: [1, 0, 0] };
  const H = H_OF(settings);
  const ext = evalExpr(ctx.P, f.ext);
  const block = { kind: "text", lines: String(f.text ?? "").split("\n"), align: f.hAlign || "left" };
  return {
    id: f.id, orphan: lost || !R0, warning: lost || !R0 ? MSG_LOST : null, selRefs: R0 ? [R0.selRef] : [],
    build: (view) => L.leaderNote({ T, n: pl.n, x: pl.x, pos: f.pos, ext: Number.isFinite(ext) ? ext : H, perpendicular: !!f.perpendicular, block, H, view, term: termFor(R0), vAlign: f.vAlign || "middle" }),
    plane: pl, target: T,
  };
}

// ---------------------------------------------------------------- General Note
const GN_PX = { small: 12, medium: 15, large: 20 };
function generalSpec(f, ctx) {
  const s = ctx.settings;
  const px = s.generalNoteSize === "custom" ? Number(s.generalNoteCustom) || 15 : GN_PX[s.generalNoteSize] || 15;
  return { id: f.id, orphan: false, selRefs: [], general: { text: f.text ?? "", quadrant: f.quadrant || "ll", align: f.hAlign || "left", px } };
}

// ---------------------------------------------------------------- Dimension
/** Measurement of a dimension feature on `state`: {m (geom.measure result), R, lost}. */
export function dimensionMeasure(f, state) {
  const { R, lost } = resolveAll(state, f.refs);
  if (lost || !R.length) return { R, lost: true, m: { error: MSG_NO_GEOM } };
  const m = G.measure(R.map(G.primitiveOf));
  return { R, lost: false, m };
}

/** Linear measurement direction for an alignment option (u in the plane). */
export function linearDir(m, pl, alignment, P) {
  const n = pl.n, x = pl.x, y = V.cross(n, x);
  let d = V.sub(m.B, m.A);
  d = V.sub(d, V.mul(n, V.dot(d, n)));
  const par = V.len(d) > 1e-9 ? V.norm(d) : x;
  if (alignment === "horizontal") return x;
  if (alignment === "vertical") return y;
  if (alignment === "parallel" || !P) return par;
  // automatic: horizontal / vertical from where the dimension is placed (like a sketch dimension)
  const hx = Math.abs(V.dot(d, x)) / 2, hy = Math.abs(V.dot(d, y)) / 2;
  if (hx < 1e-6 || hy < 1e-6) return par;
  const M = V.mul(V.add(m.A, m.B), 0.5);
  const ax = Math.abs(V.dot(V.sub(P, M), x)), ay = Math.abs(V.dot(V.sub(P, M), y));
  if (ay > hy && ax <= hx) return x;
  if (ax > hx && ay <= hy) return y;
  return par;
}

/** Display value text (rich) for a dimension: prefix + nominal + tolerance + secondary. */
export function dimensionValueText(f, nominal, kind, ctx, prefix = "") {
  const disp = { ...F.displayDefaults(ctx.settings), ...(f.disp || {}) };
  const tol = tolValues(ctx.P, f.tol, kind === "angle" ? "angle" : "length");
  const pcs = F.tolerancePieces(nominal, tol, disp, ctx.settings, { kind: kind === "angle" ? "angle" : "length", internal: f.internal !== false });
  const sec = kind === "angle" ? "" : F.secondaryText(nominal, f.secondary, ctx.settings);
  return `${prefix}${pcs.nominal}${pcs.after}${sec}`;
}

function dimensionSpec(f, ctx) {
  const { state, settings } = ctx;
  const H = H_OF(settings);
  const { R, lost, m } = dimensionMeasure(f, state);
  if (lost || m.error) return { id: f.id, orphan: true, warning: lost ? MSG_LOST : "The dimension note compute failed. Please update the geometry selections or annotation properties.", selRefs: [], build: () => null };
  const ext = evalExpr(ctx.P, f.ext);
  const over = !f.modeled && f.modeled !== undefined ? evalExpr(ctx.P, f.value, m.type === "angular" ? "angle" : "length") : NaN;
  const textOf = (nominal, kind, prefix) => {
    const v = Number.isFinite(over) ? over : nominal;
    const val = dimensionValueText(f, v, kind, ctx, prefix);
    return { kind: "text", lines: fillTemplate(f.text ?? "%1%", [val]), align: f.hAlign || "center" };
  };
  const selRefs = R.filter(Boolean).map((r) => r.selRef);
  if (m.type === "linear") {
    const pl = planeFor(f, state, R, { contain: [V.sub(m.B, m.A)] });
    const M = V.mul(V.add(m.A, m.B), 0.5);
    const y = V.cross(pl.n, pl.x);
    const pos = f.pos || [0, 3 * H];
    const Pw = V.add(M, V.add(V.mul(pl.x, pos[0]), V.mul(y, pos[1])));
    const u = linearDir(m, pl, f.alignment || "auto", Pw);
    const nominal = Math.abs(V.dot(V.sub(m.B, m.A), u));
    const block = textOf(nominal, "length", "");
    return { id: f.id, orphan: false, selRefs, plane: pl, measured: nominal, dimType: "linear", build: (view) => L.linearDim({ A: m.A, B: m.B, u, n: pl.n, x: pl.x, pos, block, H, view, perpendicular: !!f.perpendicular }) };
  }
  if (m.type === "diameter" || m.type === "radius") {
    const pl = planeFor(f, state, R);
    const isDia = m.type === "diameter" && f.radial !== "radius";
    const nominal = isDia ? 2 * m.r : m.r;
    const block = textOf(nominal, "length", isDia ? (m.sphere ? `S${F.SYM.dia}` : F.SYM.dia) : m.sphere ? "SR" : "R");
    const axial = Math.abs(V.dot(pl.n, V.norm(m.a))) > 0.99;
    if (axial || m.sphere) {
      return { id: f.id, orphan: false, selRefs, plane: pl, measured: nominal, dimType: m.type, build: (view) => L.leaderNote({ T: m.c, circle: { c: m.c, a: axial ? m.a : pl.n, r: m.r }, n: pl.n, x: pl.x, pos: f.pos, ext: Number.isFinite(ext) ? ext : H, perpendicular: !!f.perpendicular, block, H, view, term: "arrow", vAlign: "middle" }) };
    }
    // plane containing the axis: dimension across the cylinder
    const u = V.norm(V.cross(pl.n, V.norm(m.a)));
    const A = V.sub(m.c, V.mul(u, m.r)), B = V.add(m.c, V.mul(u, m.r));
    return { id: f.id, orphan: false, selRefs, plane: pl, measured: nominal, dimType: m.type, build: (view) => L.linearDim({ A: isDia ? A : m.c, B, u, n: pl.n, x: pl.x, pos: f.pos, block, H, view, perpendicular: !!f.perpendicular }) };
  }
  if (m.type === "angular") {
    const pl0 = { n: V.dot(m.n, (f.plane && f.plane.n) || m.n) < 0 ? V.mul(m.n, -1) : m.n };
    const pl = { n: pl0.n, x: f.plane && f.plane.x ? projX(f.plane.x, pl0.n) : G.planeX(pl0.n) };
    const extOf = (d) => {
      let e = 0;
      for (const ent of [m.e1, m.e2]) if (ent && ent.k === "line") for (const q of [ent.s, ent.t]) { const v = V.dot(V.sub(q, m.V), d); if (Math.abs(V.len(V.sub(V.sub(q, m.V), V.mul(d, v)))) < 1e-4) e = Math.max(e, v); }
      return e;
    };
    const makeBlock = (angle) => textOf(angle, "angle", "");
    return { id: f.id, orphan: false, selRefs, plane: pl, dimType: "angular", build: (view) => { const P = L.angularDim({ Vx: m.V, d1: m.d1, d2: m.d2, n: pl.n, x: pl.x, pos: f.pos, H, view, sector: f.sector || "auto", lockedSector: f.lockedSector, extOf }, makeBlock); return P; } };
  }
  return null;
}
function projX(x, n) { const q = V.sub(x, V.mul(n, V.dot(x, n))); return V.len(q) > 1e-6 ? V.norm(q) : G.planeX(n); }

// ---------------------------------------------------------------- Geometric tolerancing
export const MATERIAL_MODS = [
  { value: "", label: "None" },
  { value: "MMC", label: "MMC" }, { value: "LMC", label: "LMC" }, { value: "RFS", label: "RFS" },
];
export const DATUM_MODS = [{ value: "", label: "None" }, { value: "MMB", label: "MMB" }, { value: "LMB", label: "LMB" }, { value: "RMB", label: "RMB" }];
export const ZONES = [{ value: "", label: "None" }, { value: "CZ", label: "CZ" }, { value: "SZ", label: "SZ" }, { value: "CZR", label: "CZR" }];
export const ASSOCIATED = [
  { value: "", label: "None" }, { value: "C", label: "Minimax (Chebyshev)" }, { value: "G", label: "Least squares (Gaussian)" },
  { value: "T", label: "Tangent feature" }, { value: "N", label: "Minimum circumscribed" }, { value: "X", label: "Maximum inscribed" },
];
const MOD_SYM = { MMC: F.SYM.mmc, LMC: F.SYM.lmc, RFS: F.SYM.rfs, MMB: F.SYM.mmc, LMB: F.SYM.lmc, RMB: "" };
const ASSOC_SYM = { C: "Ⓒ", G: "Ⓖ", T: "Ⓣ", N: "Ⓝ", X: "Ⓧ" };

/** Tolerance cell text of a feature control frame row. */
export function fcfToleranceText(fcf, tolStr, disp, settings, P) {
  const v = evalExpr(P, tolStr);
  let s = `${fcf.dia ? F.SYM.dia : ""}${Number.isFinite(v) ? F.fmtLen(v, { ...disp, abbrev: false }, settings) : String(tolStr || "")}`;
  if (fcf.zone) s += ` ${fcf.zone}`;
  if (fcf.assoc && ASSOC_SYM[fcf.assoc]) s += ` ${ASSOC_SYM[fcf.assoc]}`;
  if (fcf.mat && MOD_SYM[fcf.mat]) s += ` ${MOD_SYM[fcf.mat]}`;
  if (fcf.free) s += ` ${F.SYM.free}`;
  if (fcf.tangent) s += ` ${F.SYM.tangent}`;
  if (fcf.proj && fcf.proj.on) {
    const pv = evalExpr(P, fcf.proj.value);
    s += ` ${F.SYM.proj}${Number.isFinite(pv) && pv > 0 ? ` ${F.fmtLen(pv, { ...disp, abbrev: false }, settings)}` : ""}`;
  }
  return s;
}
const datumCell = (d) => `${d.id}${d.mod && MOD_SYM[d.mod] ? ` ${MOD_SYM[d.mod]}` : ""}`;

/** Feature control frame block for a GDT feature (null when it has no characteristic). */
export function fcfBlock(f, ctx) {
  const fcf = f.fcf || {};
  if (!fcf.sym) return null;
  const disp = { ...F.displayDefaults(ctx.settings), ...(f.disp || {}) };
  const row1 = [{ sym: fcf.sym }, fcfToleranceText(fcf, fcf.tol, disp, ctx.settings, ctx.P)];
  for (const d of fcf.datums || []) if (d && d.id) row1.push(datumCell(d));
  const rows = [row1];
  if (fcf.composite && fcf.composite.on) {
    const row2 = [{ sym: fcf.sym }, fcfToleranceText({ dia: fcf.dia, mat: fcf.mat }, fcf.composite.tol, disp, ctx.settings, ctx.P)];
    for (const d of fcf.composite.datums || []) if (d && d.id) row2.push(datumCell(d));
    rows.push(row2);
  }
  return { kind: "fcf", rows, spanFirst: rows.length > 1 };
}

/** Fusion's geometric tolerance validation (messages from the Fusion string table). */
export function gdtProblem(f, R0, annotFeature, P) {
  const fcf = f.fcf || {};
  const sym = fcf.sym;
  const isFos = annotFeature ? true : G.isFeatureOfSize(R0);
  const g = GDT_BY_ID[sym];
  if (sym && R0 && R0.info) {
    const t = R0.kind === "face" ? R0.info.type : R0.kind === "edge" ? R0.info.type : "";
    const bad = (sym === "flatness" && t !== "PLANE") || (sym === "cylindricity" && t !== "CYLINDRE") || (sym === "circularity" && !["CYLINDRE", "CONE", "SPHERE", "CIRCLE"].includes(t)) || (sym === "straightness" && !["LINE", "CYLINDRE", "PLANE"].includes(t));
    if (bad) return "A geometric control cannot be applied to the selected geometry.";
  }
  if (fcf.composite && fcf.composite.on) {
    if (sym !== "position" && sym !== "surfaceProfile") return "Composite feature control frames are only supported for Position and Profile of a Surface.";
    const up = evalExpr(P, fcf.tol), lo = evalExpr(P, fcf.composite.tol);
    if (Number.isFinite(up) && Number.isFinite(lo) && lo > up + 1e-12) return "The lower composite tolerance must not exceed the upper tolerance.";
    const a = (fcf.datums || []).filter((d) => d && d.id).map((d) => d.id), b = (fcf.composite.datums || []).filter((d) => d && d.id).map((d) => d.id);
    if (b.some((id, i) => a[i] !== id)) return "The lower composite row datums must be an ordered leading prefix of the upper row datums.";
  }
  const ids = (fcf.datums || []).filter((d) => d && d.id).map((d) => d.id);
  if (new Set(ids).size !== ids.length) return "A datum reference cannot have duplicate or conflicting modifiers.";
  if ((fcf.mat === "MMC" || fcf.mat === "LMC") && !isFos) return "A material condition modifier can only be applied to a feature of size.";
  if (fcf.proj && fcf.proj.on && !(g && (g.group === "location" || g.group === "orientation"))) return "A projected tolerance modifier can only be applied to a position or orientation control.";
  if (fcf.tangent && !(g && g.group === "orientation")) return "A tangent plane modifier can only be applied to an orientation control.";
  return null;
}

function gdtSpec(f, ctx) {
  const { state, settings } = ctx;
  const H = H_OF(settings);
  const fcfB = fcfBlock(f, ctx);
  const datum = f.datum && f.datum.on ? f.datum : null;
  const tplLines = String(f.text ?? "%1%").split("\n");
  const at = tplLines.findIndex((l) => l.includes("%1%"));
  const above = at > 0 ? tplLines.slice(0, at).filter((s) => s.trim()) : [];
  const below = at >= 0 ? tplLines.slice(at + 1).filter((s) => s.trim()) : tplLines.filter((s) => s.trim());
  if (f.annot) {
    // attached to a dimension / hole note: the frame goes under that annotation's text
    // the host is laid out later in the same pass (annotations with `after` go last), so only its
    // presence in the document decides whether the frame is orphaned
    const hf = ctx.app ? ctx.app.feature(f.annot) : null;
    const orphan = !hf || !!hf.suppressed;
    return {
      id: f.id, orphan, warning: orphan ? "The attached PMI is outdated." : null, selRefs: [], after: true,
      build: (view) => {
        const h = ctx.mainOf ? ctx.mainOf(f.annot) : null;
        if (!h) return null;
        const P = L.newPrims();
        const fr = { rx: h.rx, ry: h.ry, nf: h.nf };
        let anchor = V.add(h.c, V.add(V.mul(h.rx, -h.w / 2), V.mul(h.ry, -h.h / 2 - 0.4 * H)));
        if (fcfB) { const t = L.placeBlock(P, fcfB, anchor, fr, H, "left", "top"); P.main = t; anchor = V.add(anchor, V.mul(h.ry, -t.h - 0.3 * H)); }
        if (below.length) L.placeBlock(P, { kind: "text", lines: below, align: "left" }, anchor, fr, H, "left", "top");
        if (datum) attachDatumToFrame(P, P.main || h, datum, H, ctx);
        return P;
      },
    };
  }
  const { R, lost } = resolveAll(state, f.refs);
  const R0 = R[0];
  const T = R0 ? R0.point : f.target;
  if (!T) return null;
  const pl = R0 ? planeFor(f, state, R) : f.plane ? { n: f.plane.n, x: f.plane.x } : { n: [0, 0, 1], x: [1, 0, 0] };
  const ext = evalExpr(ctx.P, f.ext);
  return {
    id: f.id, orphan: lost || !R0, warning: lost || !R0 ? MSG_LOST : null, selRefs: R0 ? [R0.selRef] : [], plane: pl, target: T,
    build: (view) => {
      if (!fcfB && datum) return datumOnSurface(T, pl, f, datum, H, view, ctx, R0);
      const block = fcfB || { kind: "text", lines: below.length ? below : [" "], align: "left" };
      const P = L.leaderNote({ T, n: pl.n, x: pl.x, pos: f.pos, ext: Number.isFinite(ext) ? ext : H, perpendicular: !!f.perpendicular, block, H, view, term: "arrow", vAlign: "middle" });
      const t = P.main;
      if (fcfB && (above.length || below.length)) {
        const left = V.add(t.c, V.mul(t.rx, -t.w / 2));
        if (above.length) L.placeBlock(P, { kind: "text", lines: above, align: "left" }, V.add(left, V.mul(t.ry, t.h / 2 + 0.3 * H)), t, H, "left", "bottom");
        if (below.length) L.placeBlock(P, { kind: "text", lines: below, align: "left" }, V.add(left, V.mul(t.ry, -t.h / 2 - 0.3 * H)), t, H, "left", "top");
      }
      if (datum && fcfB) attachDatumToFrame(P, t, datum, H, ctx);
      return P;
    },
  };
}

/** Datum feature symbol hanging under a frame (ASME: triangle on the frame, line, box). */
function attachDatumToFrame(P, t, datum, H, ctx) {
  const off = Number.isFinite(evalExpr(ctx.P, datum.offset)) ? evalExpr(ctx.P, datum.offset) : 0;
  const dExt = evalExpr(ctx.P, datum.ext);
  const base = V.add(t.c, V.add(V.mul(t.rx, -t.w / 2 + 1.2 * H + off), V.mul(t.ry, -t.h / 2)));
  const down = V.mul(t.ry, -1);
  const apex = L.datumTriangle(P, base, down, t.nf, H);
  const lineL = Math.max(0.6 * H, 0.8 * H + (Number.isFinite(dExt) ? dExt : 0));
  const boxTop = V.add(apex, V.mul(down, lineL));
  P.segs.push([apex, boxTop]);
  L.placeBlock(P, { kind: "datum", letter: datum.id || "A" }, boxTop, t, H, "center", "top");
}
/** Datum feature symbol on a surface: triangle on the geometry, line (or leader) to the box. */
function datumOnSurface(T, pl, f, datum, H, view, ctx, R0) {
  const P = L.newPrims();
  const n = pl.n, x = pl.x, y = V.cross(n, x);
  const pos = f.pos || [0, 4 * H];
  const Bp = V.add(T, V.add(V.mul(x, pos[0]), V.mul(y, pos[1])));
  const fr = L.readFrame(n, x, view);
  P.flips.push([n, x]);
  let dirv = V.sub(Bp, T);
  if (V.len(dirv) < 1e-9) dirv = y;
  const extra = Number.isFinite(evalExpr(ctx.P, datum.ext)) ? evalExpr(ctx.P, datum.ext) : 0;
  let base = T, up = V.norm(dirv);
  if (datum.leader) {
    // a leader from the surface (dot) to the bend, the triangle on the box side
    L.dot(P, T, n, H);
    P.segs.push([T, Bp]);
    base = Bp;
    up = fr.ry;
  } else if (R0 && R0.normal) {
    // the triangle sits on the surface pointing away from it (in the annotation plane)
    let nn = V.sub(R0.normal, V.mul(n, V.dot(R0.normal, n)));
    if (V.len(nn) > 1e-6) { nn = V.norm(nn); if (V.dot(nn, dirv) < 0) nn = V.mul(nn, -1); up = nn; }
  }
  const apex = L.datumTriangle(P, base, up, n, H);
  const lineL = Math.max(0.8 * H, datum.leader ? 0.8 * H : Math.abs(V.dot(V.sub(Bp, T), up)) - 0.95 * H) + extra;
  const boxAt = V.add(apex, V.mul(up, lineL));
  P.segs.push([apex, boxAt]);
  const vj = V.dot(up, fr.ry) >= 0 ? "bottom" : "top";
  const hj = Math.abs(V.dot(up, fr.rx)) > 0.7 ? (V.dot(up, fr.rx) > 0 ? "left" : "right") : "center";
  P.main = L.placeBlock(P, { kind: "datum", letter: datum.id || "A" }, boxAt, fr, H, hj, hj === "center" ? vj : "middle");
  return P;
}

// ---------------------------------------------------------------- Hole / Thread note
/** Generated lines of a hole / thread note (rich text) from the model data and the dialog settings. */
export function holeNoteLines(f, hd, th, ctx) {
  const disp = { ...F.displayDefaults(ctx.settings), ...(f.disp || {}) };
  const P = ctx.P;
  const s = ctx.settings;
  const len = (v) => F.fmtLen(v, disp, s);
  const valOf = (grp, modeled) => (grp && grp.modeled === false ? evalExpr(P, grp.value) : modeled);
  const withTol = (v, grp, internal = true) => {
    const pcs = F.tolerancePieces(v, tolValues(P, grp && grp.tol), disp, s, { internal });
    return `${pcs.nominal}${pcs.after}${F.secondaryText(v, f.secondary, s)}`;
  };
  const isHole = hd.kind === "hole";
  const qty = f.quantity !== false && hd.quantity > 1 ? `${hd.quantity}${s.std === "ISO" ? "x" : "X"} ` : "";
  const through = f.through === undefined || f.through === null ? hd.through : !!f.through;
  const lines = [];
  // hole / boss diameter and depth
  const dia = valOf(f.dia, hd.diameter);
  let l1 = `${qty}${F.SYM.dia}${withTol(dia, f.dia, isHole)}`;
  if (isHole && through) l1 += " THRU";
  else if (!f.depth || f.depth.on !== false) {
    const dep = valOf(f.depth, hd.depth);
    if (Number.isFinite(dep) && dep > 0) l1 += ` ${F.SYM.depth} ${withTol(dep, f.depth)}`;
  }
  lines.push(l1);
  if (f.radius && f.radius.on) lines.push(`R${withTol(valOf(f.radius, hd.diameter / 2), f.radius)}`);
  // thread
  const t = f.thread || {};
  if (th && t.on !== false) {
    const des = t.designation || th.designation || "";
    const cls = t.tclass || th.tclass || "";
    const left = t.direction ? t.direction === "left" : th.left;
    let tl = `${des}${cls ? ` - ${cls}` : ""}${left ? " LH" : ""}`;
    const tThrough = t.through === undefined || t.through === null ? th.full && through : !!t.through;
    if (tThrough) tl += " THRU";
    else if (!t.depth || t.depth.on !== false) {
      const tdep = valOf(t.depth, th.length);
      if (Number.isFinite(tdep) && tdep > 0) tl += ` ${F.SYM.depth} ${withTol(tdep, t.depth)}`;
    }
    lines.push(tl);
  }
  if (hd.cb && (!f.cb || f.cb.on !== false)) {
    const cb = f.cb || {};
    let l = `${F.SYM.cbore} ${F.SYM.dia}${withTol(valOf(cb.dia, hd.cb.d), cb.dia)}`;
    if (!cb.depth || cb.depth.on !== false) l += ` ${F.SYM.depth} ${withTol(valOf(cb.depth, hd.cb.depth), cb.depth)}`;
    if (cb.radius && cb.radius.on) l += ` R${withTol(valOf(cb.radius, 0), cb.radius)}`;
    lines.push(l);
  }
  if (hd.cs && (!f.cs || f.cs.on !== false)) {
    const cs = f.cs || {};
    let l = `${F.SYM.csk} ${F.SYM.dia}${withTol(valOf(cs.dia, hd.cs.d), cs.dia)}`;
    if (!cs.angle || cs.angle.on !== false) {
      const a = cs.angle && cs.angle.modeled === false ? evalExpr(P, cs.angle.value, "angle") : hd.cs.angle;
      l += ` X ${F.fmtAngle(a, disp)}`;
    }
    lines.push(l);
  }
  return lines;
}

/** Hole data (geometry + Hole feature) and thread data of a hole note on `state`. */
export function holeNoteData(app, f, state) {
  const R0 = G.resolveRef(state, (f.refs || [])[0]);
  if (!R0) return { R0: null };
  const hd = G.holeData(app, state, R0);
  if (!hd) return { R0, hd: null };
  const th = G.threadOn(app, hd.cyl);
  return { R0, hd, th };
}

function holeSpec(f, ctx) {
  const { state, settings, app } = ctx;
  const H = H_OF(settings);
  const { R0, hd, th } = holeNoteData(app, f, state);
  if (!R0 || !hd) {
    const T = f.target;
    if (!T || !f.plane) return null;
    return { id: f.id, orphan: true, warning: MSG_LOST, selRefs: [], build: (view) => L.leaderNote({ T, n: f.plane.n, x: f.plane.x, pos: f.pos, ext: H, block: { kind: "text", lines: fillTemplate(f.text, f.snapshot || []), align: "left" }, H, view, term: "arrow" }) };
  }
  const lines = holeNoteLines(f, hd, th, ctx);
  const block = { kind: "text", lines: fillTemplate(f.text ?? defaultTemplate(lines.length), lines), align: f.hAlign || "left" };
  const pl = planeFor(f, state, [R0]);
  const c = f.flip ? hd.exit : hd.entry;
  const ext = evalExpr(ctx.P, f.ext);
  return {
    id: f.id, orphan: false, selRefs: [R0.selRef], plane: pl, hole: hd, thread: th, lines,
    build: (view) => L.leaderNote({ T: c, circle: { c, a: hd.cyl.a, r: hd.diameter / 2 }, n: pl.n, x: pl.x, pos: f.pos, ext: Number.isFinite(ext) ? ext : H, perpendicular: !!f.perpendicular, block, H, view, term: "arrow", vAlign: f.vAlign || "middle" }),
  };
}

/** Render spec for any PMI feature. ctx = {app, state, settings, P, mainOf(id)}. */
export function specFor(f, ctx) {
  try {
    switch (f.type) {
      case "pmiNote": return noteSpec(f, ctx);
      case "pmiGeneralNote": return generalSpec(f, ctx);
      case "pmiDimension": return dimensionSpec(f, ctx);
      case "pmiGdt": return gdtSpec(f, ctx);
      case "pmiHoleNote": return holeSpec(f, ctx);
      default: return null;
    }
  } catch (e) {
    console.warn("[annotate] spec", f && f.type, e);
    return null;
  }
}

// ---------------------------------------------------------------- evaluation (model.js registry)
/**
 * Evaluator step of every PMI type: PMI never changes the model; it only checks that its geometry
 * still resolves on the state at its timeline position and reports Fusion's warnings
 * (results[f.id].warning -> timeline / browser badges) when the selection was lost.
 */
export function applyPmi(st, f, P, doc) {
  if (f.type === "pmiGeneralNote") return undefined;
  if (f.type === "pmiGdt" && f.annot) {
    return doc && doc.features.some((x) => x.id === f.annot && !x.suppressed) ? undefined : { warning: "The attached PMI is outdated." };
  }
  const refs = f.refs || [];
  if (!refs.length) return { warning: MSG_NO_GEOM };
  const R = refs.map((r) => G.resolveRef(st, r));
  if (R.some((x) => !x)) return { warning: MSG_LOST };
  if (f.type === "pmiHoleNote" && !G.cylinderOf(st, R[0])) return { warning: MSG_LOST };
  if (f.type === "pmiDimension") {
    const m = G.measure(R.map(G.primitiveOf));
    if (m.error) return { warning: "The dimension note compute failed. Please update the geometry selections or annotation properties." };
  }
  return undefined;
}
/** Explicit references for the timeline's dependency checks (a frame needs the dimension it hangs under). */
export function pmiDeps(f) {
  const geo = [...(f.refs || []), ...(f.altFace ? [f.altFace] : [])].filter((r) => r && r.body && Array.isArray(r.p)).map((r) => ({ kind: r.kind === "face" ? "face" : "edge", body: r.body, p: r.p, n: r.n }));
  return { features: f.annot ? [f.annot] : [], geo };
}
