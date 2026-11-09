// Sketch Text (MTextCmd) and Edit Text: Fusion's Text dialog (Type Text / Text On Path, Path, Text,
// Height, Character Spacing, Font, Text style B/I/U, Alignment, Angle, Flip, Fit to Path, Placement).
// Glyph outlines come from opentype.js (bundled with replicad: R.loadFont parses the font) using the
// bundled Fira Sans (OFL) or, after "Load installed fonts...", fonts from the Local Font Access API.
// The shaped outlines are stored in the sketch curve, so documents open without the font.
import { ST, mutateSketch, activeData, params, cursorOnPlane } from "./ctx.js";
import { showLive, endLive, storedSketch, curveOfActive } from "./dlgutil.js";
import { snapAt } from "./snap.js";
import { setToolPreview, clearToolPreview, setSnapMark } from "./render.js";
import * as FIRA from "./fonts/fira-sans.js";

const D2R = Math.PI / 180;
const BUILTIN = "Fira Sans";
const LOAD_LOCAL = "__load_local__";

// ---------------------------------------------------------------------------
// fonts
// ---------------------------------------------------------------------------
const FONTS = new Map(); // family -> {builtin, faces: {regular, bold, italic, boldItalic}: FontData|base64, loaded: {}, pending: {}}
FONTS.set(BUILTIN, { builtin: true, faces: { regular: FIRA.regular, bold: FIRA.bold, italic: FIRA.italic, boldItalic: FIRA.boldItalic }, loaded: {}, pending: {} });
let fontSeq = 0;
const listeners = new Set();

function b64ToBuf(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
const styleKey = (bold, italic) => (bold && italic ? "boldItalic" : bold ? "bold" : italic ? "italic" : "regular");

/** opentype Font for family/style if loaded (starts loading otherwise and returns null). */
export function fontFor(family, bold, italic) {
  const fam = FONTS.get(family) || FONTS.get(BUILTIN);
  let key = styleKey(bold, italic);
  if (!fam.faces[key]) key = fam.faces[bold ? "bold" : "regular"] ? (bold ? "bold" : "regular") : "regular";
  if (fam.loaded[key]) return { font: fam.loaded[key], synthItalic: italic && !/italic/i.test(key), synthBold: bold && !/bold/i.test(key) };
  if (!fam.pending[key]) {
    fam.pending[key] = (async () => {
      try {
        const src = fam.faces[key];
        const buf = typeof src === "string" ? b64ToBuf(src) : await (await src.blob()).arrayBuffer();
        const f = await ST.app.K.R.loadFont(buf, `sk-font-${++fontSeq}`, true);
        fam.loaded[key] = f;
      } catch (e) {
        console.warn("[sketch text] font failed to load", family, e);
        fam.failed = true;
      }
      for (const fn of [...listeners]) { try { fn(); } catch (e) { console.error(e); } }
    })();
  }
  return null;
}
/** Resolves when the font of family/style is loaded (or failed). */
export async function ensureFont(family, bold, italic) {
  if (fontFor(family, bold, italic)) return true;
  const fam = FONTS.get(family) || FONTS.get(BUILTIN);
  await Promise.all(Object.values(fam.pending));
  return !!fontFor(family, bold, italic);
}
export const fontFamilies = () => [...FONTS.keys()];

/** Installed fonts through the Local Font Access API (asks the user for permission). */
async function loadLocalFonts() {
  if (typeof window.queryLocalFonts !== "function") throw new Error("This browser does not give web pages access to installed fonts");
  const list = await window.queryLocalFonts();
  let n = 0;
  for (const fd of list) {
    const fam = fd.family;
    if (!fam || fam === BUILTIN) continue;
    let e = FONTS.get(fam);
    if (!e) { e = { builtin: false, faces: {}, loaded: {}, pending: {} }; FONTS.set(fam, e); n++; }
    const st = String(fd.style || "").toLowerCase();
    const k = /bold|black|heavy|semibold/.test(st) ? (/italic|oblique/.test(st) ? "boldItalic" : "bold") : /italic|oblique/.test(st) ? "italic" : /regular|normal|book|roman|^$/.test(st) ? "regular" : null;
    if (k && !e.faces[k]) e.faces[k] = fd;
    if (!e.faces.regular && !k) e.faces.regular = fd;
  }
  for (const [fam, e] of [...FONTS]) if (!e.builtin && !e.faces.regular) { const any = Object.values(e.faces)[0]; if (any) e.faces.regular = any; else FONTS.delete(fam); }
  return n;
}

// ---------------------------------------------------------------------------
// shaping: text -> layout + glyph outlines (em units, y up)
// ---------------------------------------------------------------------------
/** {layout, glyphs} for the curve fields, or null while the font loads. */
export function shapeText(opts) {
  const fr = fontFor(opts.font || BUILTIN, !!opts.bold, !!opts.italic);
  if (!fr) return null;
  const { font, synthItalic } = fr;
  const upm = font.unitsPerEm || 1000;
  const shear = synthItalic ? Math.tan(12 * D2R) : 0;
  const glyphs = {};
  const lines = [];
  const spacing = Math.max(0, Number(opts.spacing) || 0) / 100;
  const text = String(opts.text || "").replace(/\r/g, "");
  for (const line of (opts.mode === "path" ? [text.replace(/\n/g, " ")] : text.split("\n"))) {
    const gs = font.stringToGlyphs(line);
    const g = [];
    let x = 0;
    for (let i = 0; i < gs.length; i++) {
      const gl = gs[i];
      const key = `${gl.index}${synthItalic ? "i" : ""}`;
      if (!glyphs[key]) {
        const path = gl.getPath(0, 0, 1);
        const contours = [];
        let cur = null;
        const P = (px, py) => { const X = +px, Y = -py; return [+(X + shear * Y).toFixed(6), +Y.toFixed(6)]; };
        for (const c of path.commands) {
          if (c.type === "M") { cur = [["M", ...P(c.x, c.y)]]; contours.push(cur); }
          else if (!cur) continue;
          else if (c.type === "L") cur.push(["L", ...P(c.x, c.y)]);
          else if (c.type === "Q") cur.push(["Q", ...P(c.x1, c.y1), ...P(c.x, c.y)]);
          else if (c.type === "C") cur.push(["C", ...P(c.x1, c.y1), ...P(c.x2, c.y2), ...P(c.x, c.y)]);
          else if (c.type === "Z") cur = null;
        }
        glyphs[key] = { c: contours.filter((k) => k.length > 1) };
      }
      const adv = (gl.advanceWidth || 0) / upm;
      g.push([+x.toFixed(6), key, +adv.toFixed(6)]);
      let kern = 0;
      if (i + 1 < gs.length) { try { kern = font.getKerningValue(gl, gs[i + 1]) / upm; } catch { kern = 0; } }
      x += adv * (1 + spacing) + kern;
    }
    lines.push({ w: +x.toFixed(6), g });
  }
  const os2 = font.tables && font.tables.os2;
  const asc = (os2 && os2.sTypoAscender ? os2.sTypoAscender : font.ascender) / upm;
  const desc = Math.abs((os2 && os2.sTypoDescender ? os2.sTypoDescender : font.descender) / upm);
  const post = font.tables && font.tables.post;
  const ul = post ? [post.underlinePosition / upm, Math.max(0.02, (post.underlineThickness || 50) / upm)] : [-0.1, 0.05];
  return { layout: { lines, asc: +asc.toFixed(4), desc: +desc.toFixed(4), lh: 1.2, ul }, glyphs };
}

// ---------------------------------------------------------------------------
// the text curve
// ---------------------------------------------------------------------------
function textFields(v, dlg) {
  return {
    text: v.text || "", font: v.font && v.font !== LOAD_LOCAL ? v.font : BUILTIN,
    size: dlg.num("height"), spacing: dlg.num("spacing"),
    bold: !!v.bold, italic: !!v.italic, underline: !!v.underline,
    halign: v.halign || "left", valign: v.valign || "bottom",
    flipH: !!v.flipH, flipV: !!v.flipV,
    fit: !!v.fit, above: v.placement !== "below",
    heightExpr: v.height, spacingExpr: v.spacing,
  };
}

/** Frame corner points (sketch coords) from two clicks and the angle (about the first corner). */
function frameCorners(a, c, angDeg) {
  const th = angDeg * D2R;
  const ux = [Math.cos(th), Math.sin(th)], uy = [-Math.sin(th), Math.cos(th)];
  const d = [c[0] - a[0], c[1] - a[1]];
  let w = d[0] * ux[0] + d[1] * ux[1], h = d[0] * uy[0] + d[1] * uy[1];
  // the frame keeps the corner order bottom-left, bottom-right, top-right, top-left
  let o = a;
  if (w < 0) { o = [o[0] + ux[0] * w, o[1] + ux[1] * w]; w = -w; }
  if (h < 0) { o = [o[0] + uy[0] * h, o[1] + uy[1] * h]; h = -h; }
  const P = (x, y) => [o[0] + ux[0] * x + uy[0] * y, o[1] + ux[1] * x + uy[1] * y];
  return [P(0, 0), P(w, 0), P(w, h), P(0, h)];
}

/** Add (or update) the text curve in sk from the dialog state. Returns the curve id. */
function writeText(sk, dlg, shaped) {
  const S = ST.app.S;
  const v = dlg.values;
  const tf = textFields(v, dlg);
  const editId = dlg.textId;
  let cv = editId ? sk.curves[editId] : null;
  const base = { type: "text", ...tf, layout: shaped.layout, glyphs: shaped.glyphs };
  if (v.type === "path") {
    const path = (v.path || [])[0];
    if (!path) return null;
    const rec = { ...base, mode: "path", path: path.curve };
    if (cv) { Object.keys(cv).forEach((k) => delete cv[k]); Object.assign(cv, rec); return editId; }
    const id = `t${sk.nid++}`;
    sk.curves[id] = rec;
    return id;
  }
  if (cv && cv.frame && cv.frame.every((p) => sk.points[p])) {
    // edit: the frame stays; a changed Angle turns it about its first corner
    const ang = dlg.num("angle");
    const F = S.textFrame(sk, cv);
    if (F && Number.isFinite(ang)) {
      const cur = Math.atan2(F.ux[1], F.ux[0]) / D2R;
      const dth = (ang - cur) * D2R;
      if (Math.abs(dth) > 1e-9) {
        const o = F.o, cs = Math.cos(dth), sn = Math.sin(dth);
        for (const p of cv.frame.slice(1)) { const P = sk.points[p]; const dx = P.x - o[0], dy = P.y - o[1]; P.x = o[0] + cs * dx - sn * dy; P.y = o[1] + sn * dx + cs * dy; }
      }
    }
    const frame = cv.frame;
    Object.keys(cv).forEach((k) => delete cv[k]);
    Object.assign(cv, { ...base, mode: "box", frame });
    return editId;
  }
  const fr = dlg.values.frame;
  if (!fr) return null;
  const C = frameCorners(fr[0], fr[1], dlg.num("angle") || 0);
  const pts = C.map((q) => S.addPoint(sk, q[0], q[1]));
  const lines = [0, 1, 2, 3].map((i) => S.addLine(sk, pts[i], pts[(i + 1) % 4], true));
  const ang = dlg.num("angle") || 0;
  if (Math.abs(((ang % 90) + 90) % 90) < 1e-9) {
    for (let i = 0; i < 4; i++) { const a = C[i], b = C[(i + 1) % 4]; S.addConstraint(sk, Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? "horizontal" : "vertical", [lines[i]]); }
  } else {
    S.addConstraint(sk, "perpendicular", [lines[0], lines[1]]);
    S.addConstraint(sk, "parallel", [lines[0], lines[2]]);
    S.addConstraint(sk, "parallel", [lines[1], lines[3]]);
  }
  const snaps = dlg.values.frameSnaps || [];
  // a corner clicked on an existing point stays on it
  if (snaps[0] && snaps[0].pointId && sk.points[snaps[0].pointId]) S.addConstraint(sk, "coincident", [snaps[0].pointId, pts[0]]);
  const id = `t${sk.nid++}`;
  sk.curves[id] = { ...base, mode: "box", frame: pts, frameLines: lines };
  return id;
}

const ALIGN_H = [{ value: "left", label: "Align Left", icon: "alignLeft" }, { value: "center", label: "Align Center", icon: "alignCenter" }, { value: "right", label: "Align Right", icon: "alignRight" }];
const ALIGN_V = [{ value: "top", label: "Align Top", icon: "alignTop" }, { value: "middle", label: "Align Middle", icon: "alignMiddle" }, { value: "bottom", label: "Align Bottom", icon: "alignBottom" }];

const GLY = {
  bold: '<svg viewBox="0 0 16 16" width="16" height="16"><text x="4" y="12.5" font-family="Arial,sans-serif" font-weight="700" font-size="12" fill="#333">B</text></svg>',
  italic: '<svg viewBox="0 0 16 16" width="16" height="16"><text x="5" y="12.5" font-family="Georgia,serif" font-style="italic" font-size="12" fill="#333">I</text></svg>',
  underline: '<svg viewBox="0 0 16 16" width="16" height="16"><text x="4" y="11" font-family="Arial,sans-serif" font-size="11" fill="#333">U</text><path d="M3.5 13.5h9" stroke="#333" stroke-width="1.2"/></svg>',
  alignLeft: '<svg viewBox="0 0 16 16" width="16" height="16" stroke="#333" stroke-width="1.3"><path d="M2 3.5h12M2 6.5h8M2 9.5h12M2 12.5h8"/></svg>',
  alignCenter: '<svg viewBox="0 0 16 16" width="16" height="16" stroke="#333" stroke-width="1.3"><path d="M2 3.5h12M4 6.5h8M2 9.5h12M4 12.5h8"/></svg>',
  alignRight: '<svg viewBox="0 0 16 16" width="16" height="16" stroke="#333" stroke-width="1.3"><path d="M2 3.5h12M6 6.5h8M2 9.5h12M6 12.5h8"/></svg>',
  alignTop: '<svg viewBox="0 0 16 16" width="16" height="16" stroke="#333" stroke-width="1.3" fill="none"><path d="M2 2.5h12"/><rect x="4" y="4.5" width="3" height="7"/><rect x="9" y="4.5" width="3" height="4"/></svg>',
  alignMiddle: '<svg viewBox="0 0 16 16" width="16" height="16" stroke="#333" stroke-width="1.3" fill="none"><path d="M2 8h12"/><rect x="4" y="4" width="3" height="8"/><rect x="9" y="5.5" width="3" height="5"/></svg>',
  alignBottom: '<svg viewBox="0 0 16 16" width="16" height="16" stroke="#333" stroke-width="1.3" fill="none"><path d="M2 13.5h12"/><rect x="4" y="4.5" width="3" height="7"/><rect x="9" y="7.5" width="3" height="4"/></svg>',
  flipH: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#333" stroke-width="1.2"><path d="M8 2v12" stroke-dasharray="1.5 1.3"/><path d="M6 4.5L2.5 8 6 11.5zM10 4.5l3.5 3.5L10 11.5z" fill="#333"/></svg>',
  flipV: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#333" stroke-width="1.2"><path d="M2 8h12" stroke-dasharray="1.5 1.3"/><path d="M4.5 6L8 2.5 11.5 6zM4.5 10L8 13.5 11.5 10z" fill="#333"/></svg>',
};

/** A row of toggle buttons (independent on/off, or one-of when `group`). */
function toggleRow(dlg, label, items, group = null) {
  const el = document.createElement("div");
  el.className = "sk-pair-row";
  const lab = document.createElement("div");
  lab.className = "dlg-label";
  lab.textContent = label;
  lab.title = label;
  const box = document.createElement("div");
  box.className = "sk-toggles";
  for (const it of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sk-toggle";
    b.dataset.input = it.id;
    if (it.value !== undefined) b.dataset.option = it.value;
    b.title = it.label;
    b.innerHTML = GLY[it.icon] || it.label;
    b.addEventListener("click", () => {
      if (group) dlg.set(group, it.value, { user: true });
      else dlg.set(it.id, !dlg.values[it.id], { user: true });
    });
    box.appendChild(b);
  }
  el.append(lab, box);
  el._sync = () => {
    for (const b of box.children) {
      const it = items.find((x) => x.id === b.dataset.input && (x.value === undefined || x.value === b.dataset.option));
      const on = group ? dlg.values[group] === it.value : !!dlg.values[it.id];
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  };
  el._sync();
  return el;
}

function textArea(dlg) {
  const el = document.createElement("div");
  el.className = "sk-pair-row sk-text-row";
  const lab = document.createElement("div");
  lab.className = "dlg-label";
  lab.textContent = "Text";
  lab.title = "Enter one or more lines of text.";
  const ta = document.createElement("textarea");
  ta.className = "dlg-input sk-textarea";
  ta.dataset.input = "text";
  ta.rows = 3;
  ta.spellcheck = false;
  ta.placeholder = "Sample Text";
  ta.value = dlg.values.text || "";
  ta.addEventListener("input", () => dlg.set("text", ta.value, { user: true, delay: 80 }));
  // Enter makes a new line here (Ctrl+Enter = OK); keys stay in the box
  ta.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); dlg.ok(); }
    if (ev.key === "Escape") { ev.preventDefault(); dlg.cancel(); }
  });
  el.append(lab, ta);
  el._ta = ta;
  return el;
}

/** Fusion's Text dialog. textId: Edit Text of an existing text curve. */
export function openText(textId = null) {
  const A = ST.app;
  const sk = storedSketch();
  if (!sk) return null;
  const ex = textId ? sk.curves[textId] : null;
  if (textId && (!ex || ex.type !== "text")) return null;
  const S = A.S;
  let angle0 = "0.0 deg";
  if (ex && ex.mode === "box") { const F = S.textFrame(sk, ex); if (F) angle0 = `${(Math.atan2(F.ux[1], F.ux[0]) / D2R).toFixed(1)} deg`; }
  const fontOpts = () => [...fontFamilies().map((f) => ({ value: f, label: f })), ...(typeof window.queryLocalFonts === "function" ? [{ value: LOAD_LOCAL, label: "Load installed fonts..." }] : [])];
  const v0 = ex ? {
    type: ex.mode === "path" ? "path" : "box", text: ex.text, height: ex.heightExpr || A.ui.dialog.fmt(ex.size, "length"), spacing: ex.spacingExpr || String(ex.spacing || 0),
    font: FONTS.has(ex.font) ? ex.font : BUILTIN, bold: !!ex.bold, italic: !!ex.italic, underline: !!ex.underline, halign: ex.halign || "left", valign: ex.valign || "bottom",
    angle: angle0, flipH: !!ex.flipH, flipV: !!ex.flipV, fit: !!ex.fit, placement: ex.above === false ? "below" : "above",
  } : {};
  const pre = ex && ex.mode === "path" && sk.curves[ex.path] ? [{ kind: "sketchCurve", sketch: ST.sketchId, curve: ex.path }] : [];
  const offFont = () => { try { off(); } catch { /* ignore */ } };
  let off = () => {};
  const dlg = A.ui.dialog.open({
    id: "MTextCmd",
    title: ex ? "Edit Text" : "Text",
    icon: "MTextCmd",
    help: "Adds text in a frame or along a path. Click two corners for the text frame (or select a path), enter the text, then set the formatting.",
    preview: false,
    labelWidth: 112,
    ctrlWidth: 156,
    rows: [
      { id: "type", type: "dropdown", label: "Type", default: "box", options: [{ value: "box", label: "Text" }, { value: "path", label: "Text On Path" }], enabled: () => !ex },
      { id: "path", type: "selection", label: "Path", kinds: ["sketchCurve"], max: 1, visible: (v) => v.type === "path", filter: curveOfActive((cv) => !["point", "text", "c3d"].includes(cv.type)), prompt: "Select sketch curve for text to follow" },
      { id: "textrow", type: "custom", render: (d) => textArea(d), update: (el, d) => { if (document.activeElement !== el._ta && el._ta.value !== (d.values.text || "")) el._ta.value = d.values.text || ""; } },
      { id: "height", type: "value", label: "Height", kind: "length", default: "5.00 mm", positive: true, tooltip: "Specify text height in mm" },
      { id: "spacing", type: "value", label: "Character Spacing (%)", kind: "none", default: "0", nonNegative: true, tooltip: "Specify a percentage to increase the spacing between characters. 0% uses the default spacing defined in the font file." },
      { id: "font", type: "dropdown", label: "Font", default: BUILTIN, options: fontOpts() },
      { id: "stylerow", type: "custom", render: (d) => toggleRow(d, "Text style", [{ id: "bold", label: "Bold", icon: "bold" }, { id: "italic", label: "Italic", icon: "italic" }, { id: "underline", label: "Underline", icon: "underline" }]), update: (el) => el._sync() },
      { id: "harow", type: "custom", render: (d) => toggleRow(d, "Alignment", ALIGN_H.map((o) => ({ id: "halign", value: o.value, label: o.label, icon: o.icon })), "halign"), update: (el) => el._sync() },
      { id: "varow", type: "custom", visible: (v) => v.type !== "path", render: (d) => toggleRow(d, "Alignment(V)", ALIGN_V.map((o) => ({ id: "valign", value: o.value, label: o.label, icon: o.icon })), "valign"), update: (el) => el._sync() },
      { id: "angle", type: "value", label: "Angle", kind: "angle", default: "0.0 deg", visible: (v) => v.type !== "path" },
      { id: "fliprow", type: "custom", render: (d) => toggleRow(d, "Flip", [{ id: "flipH", label: "Horizontal Flip", icon: "flipH" }, { id: "flipV", label: "Vertical Flip", icon: "flipV" }]), update: (el) => el._sync() },
      { id: "fit", type: "check", label: "Fit to Path", default: false, visible: (v) => v.type === "path", tooltip: "Distributes text evenly along the entire path" },
      { id: "placement", type: "dropdown", label: "Placement", default: "above", visible: (v) => v.type === "path", options: [{ value: "above", label: "Above" }, { value: "below", label: "Below" }] },
      { id: "bold", type: "check", label: "Bold", visible: () => false },
      { id: "italic", type: "check", label: "Italic", visible: () => false },
      { id: "underline", type: "check", label: "Underline", visible: () => false },
      { id: "flipH", type: "check", label: "Horizontal Flip", visible: () => false },
      { id: "flipV", type: "check", label: "Vertical Flip", visible: () => false },
      { id: "halign", type: "dropdown", label: "Alignment", default: "left", options: ALIGN_H, visible: () => false },
      { id: "valign", type: "dropdown", label: "Alignment(V)", default: "bottom", options: ALIGN_V, visible: () => false },
    ],
    values: { ...v0, text: v0.text ?? "" },
    preselect: pre,
    activate: (d) => (d.values.type === "path" && !(d.values.path || []).length ? "path" : false),
    init(d) { d.textId = textId; if (ex && ex.mode === "box") d.values.frameDone = true; },
    prompt(d) {
      if (d.values.type === "path") return (d.values.path || []).length ? "Enter text" : "Select sketch curve for text to follow";
      if (d.values.frameDone) return "Adjust text formatting";
      return d._c1 ? "Place second corner of text frame" : "Place first corner of text frame";
    },
    onChange(id, d) {
      if (id === "font" && d.values.font === LOAD_LOCAL) {
        d.values.font = BUILTIN;
        loadLocalFonts().then((n) => {
          d.defs.font.options = fontOpts();
          A.toast(n ? `${n} installed font${n === 1 ? "" : "s"} added to the Font list` : "No more fonts were found", "info", 2400);
          d.refresh();
        }).catch((e) => A.toast(`Installed fonts: ${e.message || e}`, "warning", 3200));
      }
      if (id === "type") { d.values.frameDone = d.values.type === "box" ? !!d.values.frame || !!(ex && ex.frame) : false; d._c1 = null; }
    },
    validate(d) {
      if (!String(d.values.text || "").trim()) return "Enter text";
      if (d.values.type === "box" && !d.values.frameDone) return "Place the text frame";
      return null;
    },
    build: (v) => ({ type: "sketchText" }),
    onCanvasMove(ctx, d) {
      if (d.values.type !== "box" || d.values.frameDone) return false;
      const s = snapAt(ctx.x, ctx.y, { noSnap: ctx.ctrl });
      if (!s) return false;
      setSnapMark({ at: s.uv, kind: s.kind, align: s.align });
      if (d._c1) {
        const C = frameCorners(d._c1.uv, s.uv, d.num("angle") || 0);
        setToolPreview({ cons: C.map((q, i) => [q, C[(i + 1) % 4]]) });
      }
      return true;
    },
    onCanvasDown(ctx, d) {
      if (d.values.type !== "box" || d.values.frameDone) return false;
      const s = snapAt(ctx.x, ctx.y, { noSnap: ctx.ctrl });
      if (!s) return true;
      if (!d._c1) { d._c1 = s; d._updatePrompt && d._updatePrompt(); return true; }
      const a = d._c1.uv, b = s.uv;
      const pd = activeData();
      void pd;
      if (Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[1] - b[1]) < 1e-6) return true;
      d.values.frame = [a, b];
      d.values.frameSnaps = [d._c1, s];
      d.values.frameDone = true;
      d._c1 = null;
      setSnapMark(null);
      clearToolPreview();
      // focus the text box like Fusion
      const ta = d.el.querySelector("textarea.sk-textarea");
      if (ta) setTimeout(() => { try { ta.focus(); } catch { /* ignore */ } }, 0);
      d.refresh();
      d.schedulePreview(10);
      return true;
    },
    afterPreview(d) {
      const v = d.values;
      const sk1 = storedSketch();
      if (!sk1) return;
      const ready = v.type === "path" ? (v.path || []).length > 0 : !!v.frameDone;
      if (!ready || !String(v.text || "").length) {
        if (ex) { const w = S.cloneSketch(sk1); delete w.curves[textId]; showLive(w); } else endLive();
        return;
      }
      const shaped = shapeText({ ...textFields(v, d), mode: v.type === "path" ? "path" : "box" });
      if (!shaped) return; // the font is loading; the listener re-runs the preview
      const w = S.cloneSketch(sk1);
      try { writeText(w, d, shaped); } catch (e) { console.error(e); return; }
      showLive(w);
    },
    commit(f, d) {
      const v = d.values;
      const shaped = shapeText({ ...textFields(v, d), mode: v.type === "path" ? "path" : "box" });
      if (!shaped) throw new Error("The font is still loading, try again");
      return mutateSketch(ex ? "Edit Text" : "Text", (sk2) => {
        const id = writeText(sk2, d, shaped);
        if (!id) throw new Error("Place the text frame or select a path");
        return id;
      });
    },
    onClose() { offFont(); endLive(); setSnapMark(null); clearToolPreview(); },
  });
  const rerun = () => { if (!dlg.closed) dlg.schedulePreview(10); };
  listeners.add(rerun);
  off = () => listeners.delete(rerun);
  // start loading the chosen face right away
  fontFor(dlg.values.font, !!dlg.values.bold, !!dlg.values.italic);
  void params; void cursorOnPlane;
  return dlg;
}

export function initText() {
  ST.curveEditors = ST.curveEditors || {};
  ST.curveEditors.text = (id) => openText(id);
  // load the default font in the background so the first Text preview is instant
  setTimeout(() => { try { fontFor(BUILTIN, false, false); } catch { /* ignore */ } }, 1500);
}
