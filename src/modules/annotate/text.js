// Text blocks of the PMI annotations, laid out in units of the text height H (cap height) and
// painted into a canvas (white on transparent; render.js tints it black / blue / orange).
//
// Block kinds:
//   {kind:'text', lines:[rich], align:'left'|'center'|'right'}      notes, dimension values, hole notes
//   {kind:'fcf', rows:[[cell...]], spanFirst}                         feature control frame (cell = rich text or {sym})
//   {kind:'datum', letter}                                           datum feature symbol box
// Rich text: characters + markers from format.js (stacked tolerance STK a SEP b END, basic frame BOX .. BOXEND).
// Engineering symbols (⌀ ⌴ ⌵ ↧, GD&T characteristics, circled modifiers) are drawn as paths, never
// taken from a font, so they look the same on every machine.
import { STK, SEP, END, BOX, BOXEND } from "./format.js";

const FONT = 'Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif';
const CAP = 0.716; // cap height / font size (Arial)
const LINE = 1.65; // line pitch in H
const STACK_K = 0.72; // stacked tolerance text scale

// GD&T characteristics (Fusion's PMI symbols reference), value = id stored in documents
export const GDT = [
  { id: "straightness", label: "Straightness", ch: "⏤", group: "form" },
  { id: "flatness", label: "Flatness", ch: "⏥", group: "form" },
  { id: "circularity", label: "Circularity", ch: "○", group: "form" },
  { id: "cylindricity", label: "Cylindricity", ch: "⌭", group: "form" },
  { id: "lineProfile", label: "Line Profile", ch: "⌒", group: "profile" },
  { id: "surfaceProfile", label: "Surface Profile", ch: "⌓", group: "profile" },
  { id: "angularity", label: "Angularity", ch: "∠", group: "orientation" },
  { id: "perpendicularity", label: "Perpendicularity", ch: "⟂", group: "orientation" },
  { id: "parallelism", label: "Parallelism", ch: "∥", group: "orientation" },
  { id: "position", label: "Position", ch: "⌖", group: "location" },
  { id: "concentricity", label: "Concentricity", ch: "◎", group: "location" },
  { id: "symmetry", label: "Symmetry", ch: "⌯", group: "location" },
  { id: "circularRunout", label: "Circular run-out", ch: "↗", group: "runout" },
  { id: "totalRunout", label: "Total Run-out", ch: "⌰", group: "runout" },
];
export const GDT_BY_ID = Object.fromEntries(GDT.map((g) => [g.id, g]));
const CH_TO_SYM = Object.fromEntries(GDT.map((g) => [g.ch, g.id]));

// Path painters for symbols: (c, x, y, w, H, lw) with (x, y) the top-left of the H-tall glyph box.
const PAINT = {
  "⌀"(c, x, y, w, H) { const r = H * 0.43, cx = x + w / 2, cy = y + H / 2; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(cx - r * 1.05, cy + r * 1.05 + H * 0.08); c.lineTo(cx + r * 1.05, cy - r * 1.05 - H * 0.08); c.stroke(); },
  "⌴"(c, x, y, w, H) { c.beginPath(); c.moveTo(x + w * 0.1, y + H * 0.05); c.lineTo(x + w * 0.1, y + H); c.lineTo(x + w * 0.9, y + H); c.lineTo(x + w * 0.9, y + H * 0.05); c.stroke(); },
  "⌵"(c, x, y, w, H) { c.beginPath(); c.moveTo(x + w * 0.05, y + H * 0.05); c.lineTo(x + w / 2, y + H); c.lineTo(x + w * 0.95, y + H * 0.05); c.stroke(); },
  "↧"(c, x, y, w, H) {
    const cx = x + w / 2; c.beginPath(); c.moveTo(cx, y); c.lineTo(cx, y + H * 0.98); c.moveTo(x + w * 0.08, y + H); c.lineTo(x + w * 0.92, y + H); c.stroke();
    c.beginPath(); c.moveTo(cx, y + H * 0.96); c.lineTo(cx - w * 0.28, y + H * 0.5); c.lineTo(cx + w * 0.28, y + H * 0.5); c.closePath(); c.fill();
  },
  "□"(c, x, y, w, H) { c.strokeRect(x + w * 0.1, y + H * 0.02, w * 0.8, H * 0.96); },
  "⌢"(c, x, y, w, H) { c.beginPath(); c.arc(x + w / 2, y + H * 0.9, w * 0.45, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); },
  "⌳"(c, x, y, w, H) { c.beginPath(); c.moveTo(x, y + H); c.lineTo(x + w, y + H); c.lineTo(x, y + H * 0.35); c.closePath(); c.stroke(); },
  "⌲"(c, x, y, w, H) { c.beginPath(); c.moveTo(x, y + H * 0.15); c.lineTo(x + w, y + H * 0.5); c.lineTo(x, y + H * 0.85); c.moveTo(x, y + H * 0.5); c.lineTo(x + w, y + H * 0.5); c.stroke(); },
  "℄"(c, x, y, w, H) { c.beginPath(); c.arc(x + w * 0.45, y + H / 2, H * 0.36, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(x + w * 0.62, y); c.lineTo(x + w * 0.62, y + H); c.moveTo(x + w * 0.62, y + H); c.lineTo(x + w, y + H); c.stroke(); },
  // GD&T characteristics
  "⏤"(c, x, y, w, H) { c.beginPath(); c.moveTo(x + w * 0.05, y + H / 2); c.lineTo(x + w * 0.95, y + H / 2); c.stroke(); },
  "⏥"(c, x, y, w, H) { c.beginPath(); c.moveTo(x + w * 0.28, y + H * 0.22); c.lineTo(x + w * 0.98, y + H * 0.22); c.lineTo(x + w * 0.72, y + H * 0.78); c.lineTo(x + w * 0.02, y + H * 0.78); c.closePath(); c.stroke(); },
  "○"(c, x, y, w, H) { c.beginPath(); c.arc(x + w / 2, y + H / 2, H * 0.42, 0, Math.PI * 2); c.stroke(); },
  "⌭"(c, x, y, w, H) {
    const cx = x + w / 2, cy = y + H / 2, r = H * 0.36; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    const d = [0.42, 0.9], k = r * 1.0;
    c.beginPath(); c.moveTo(cx - k - H * 0.32, cy + H * 0.48); c.lineTo(cx - k + H * 0.32 * d[0], cy - H * 0.48); c.moveTo(cx + k - H * 0.32 * d[0], cy + H * 0.48); c.lineTo(cx + k + H * 0.32, cy - H * 0.48); c.stroke();
  },
  "⌒"(c, x, y, w, H) { c.beginPath(); c.arc(x + w / 2, y + H * 0.82, w * 0.44, Math.PI, 0); c.stroke(); },
  "⌓"(c, x, y, w, H) { c.beginPath(); c.arc(x + w / 2, y + H * 0.82, w * 0.44, Math.PI, 0); c.closePath(); c.stroke(); },
  "∠"(c, x, y, w, H) { c.beginPath(); c.moveTo(x + w * 0.95, y + H * 0.2); c.lineTo(x + w * 0.05, y + H * 0.92); c.lineTo(x + w * 0.95, y + H * 0.92); c.stroke(); },
  "⟂"(c, x, y, w, H) { c.beginPath(); c.moveTo(x + w / 2, y + H * 0.05); c.lineTo(x + w / 2, y + H * 0.95); c.moveTo(x + w * 0.05, y + H * 0.95); c.lineTo(x + w * 0.95, y + H * 0.95); c.stroke(); },
  "∥"(c, x, y, w, H) { c.beginPath(); c.moveTo(x + w * 0.12, y + H * 0.95); c.lineTo(x + w * 0.52, y + H * 0.05); c.moveTo(x + w * 0.48, y + H * 0.95); c.lineTo(x + w * 0.88, y + H * 0.05); c.stroke(); },
  "⌖"(c, x, y, w, H) { const cx = x + w / 2, cy = y + H / 2, r = H * 0.34; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.moveTo(cx - H * 0.5, cy); c.lineTo(cx + H * 0.5, cy); c.moveTo(cx, cy - H * 0.5); c.lineTo(cx, cy + H * 0.5); c.stroke(); },
  "◎"(c, x, y, w, H) { const cx = x + w / 2, cy = y + H / 2; c.beginPath(); c.arc(cx, cy, H * 0.44, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(cx, cy, H * 0.22, 0, Math.PI * 2); c.stroke(); },
  "⌯"(c, x, y, w, H) { c.beginPath(); c.moveTo(x + w * 0.22, y + H * 0.2); c.lineTo(x + w * 0.78, y + H * 0.2); c.moveTo(x, y + H / 2); c.lineTo(x + w, y + H / 2); c.moveTo(x + w * 0.22, y + H * 0.8); c.lineTo(x + w * 0.78, y + H * 0.8); c.stroke(); },
  "↗"(c, x, y, w, H) { arrowLine(c, x + w * 0.15, y + H * 0.95, x + w * 0.85, y + H * 0.08, H); },
  "⌰"(c, x, y, w, H) {
    arrowLine(c, x + w * 0.02, y + H * 0.82, x + w * 0.5, y + H * 0.08, H);
    arrowLine(c, x + w * 0.42, y + H * 0.82, x + w * 0.9, y + H * 0.08, H);
    c.beginPath(); c.moveTo(x, y + H * 0.82); c.lineTo(x + w * 0.5, y + H * 0.82); c.stroke();
  },
};
const CIRCLED = { "Ⓒ": "C", "Ⓔ": "E", "Ⓕ": "F", "Ⓖ": "G", "Ⓛ": "L", "Ⓜ": "M", "Ⓝ": "N", "Ⓟ": "P", "Ⓢ": "S", "Ⓣ": "T", "Ⓤ": "U", "Ⓧ": "X" };
const WIDTH = { "⌀": 1.05, "⌴": 1.0, "⌵": 1.05, "↧": 0.8, "□": 1.0, "⌢": 1.1, "⌳": 1.2, "⌲": 1.2, "℄": 1.15, "⏤": 1.4, "⏥": 1.5, "○": 1.1, "⌭": 1.7, "⌒": 1.3, "⌓": 1.3, "∠": 1.3, "⟂": 1.2, "∥": 1.2, "⌖": 1.2, "◎": 1.1, "⌯": 1.3, "↗": 1.2, "⌰": 1.6 };

function arrowLine(c, x0, y0, x1, y1, H) {
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, a = H * 0.34, b = H * 0.14;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - ux * a - uy * b, y1 - uy * a + ux * b); c.lineTo(x1 - ux * a + uy * b, y1 - uy * a - ux * b); c.closePath(); c.fill();
}
export const isSymbolChar = (ch) => !!PAINT[ch] || !!CIRCLED[ch];

// ---------------------------------------------------------------- measuring
let mctx = null;
function measureCtx() {
  if (!mctx) {
    const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(8, 8) : document.createElement("canvas");
    mctx = cv.getContext("2d");
  }
  return mctx;
}
/** Advance of a plain string in H units. */
function textW(s, k = 1) {
  const c = measureCtx();
  c.font = `${100 / CAP}px ${FONT}`;
  return (c.measureText(s).width / 100) * k;
}

/** Parse rich text into runs: {t:'s', s} | {t:'sym', ch} | {t:'stk', a, b} | {t:'box', runs}. */
export function parseRich(str) {
  const s = String(str ?? "");
  const out = [];
  let buf = "";
  const flush = () => { if (buf) { out.push({ t: "s", s: buf }); buf = ""; } };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === STK) {
      flush();
      const j = s.indexOf(SEP, i), k = s.indexOf(END, i);
      if (j < 0 || k < 0 || k < j) continue;
      out.push({ t: "stk", a: s.slice(i + 1, j), b: s.slice(j + 1, k) });
      i = k;
    } else if (ch === BOX) {
      flush();
      const k = s.indexOf(BOXEND, i);
      const inner = k < 0 ? s.slice(i + 1) : s.slice(i + 1, k);
      out.push({ t: "box", runs: parseRich(inner) });
      i = k < 0 ? s.length : k;
    } else if (PAINT[ch] || CIRCLED[ch]) { flush(); out.push({ t: "sym", ch }); }
    else if (ch === SEP || ch === END || ch === BOXEND) continue;
    else buf += ch;
  }
  flush();
  return out;
}

function runW(r, k = 1) {
  if (r.t === "s") return textW(r.s, k);
  if (r.t === "sym") return (CIRCLED[r.ch] ? 1.25 : WIDTH[r.ch] || 1.1) * k + 0.08 * k;
  if (r.t === "stk") return Math.max(textW(r.a, STACK_K * k), textW(r.b, STACK_K * k)) + 0.1 * k;
  if (r.t === "box") return lineW(r.runs, k) + 0.7 * k;
  return 0;
}
const lineW = (runs, k = 1) => runs.reduce((w, r) => w + runW(r, k), 0);
export function richWidth(str) { return lineW(parseRich(str)); }

// ---------------------------------------------------------------- painting (canvas units: px per H = S)
function paintRuns(c, runs, x, yTop, S, k = 1) {
  // yTop: top of the cap-height box of this line (canvas px)
  const H = S * k;
  for (const r of runs) {
    const w = runW(r, k) * S;
    if (r.t === "s") {
      c.font = `${H / CAP}px ${FONT}`;
      c.textBaseline = "alphabetic";
      c.fillText(r.s, x, yTop + H);
    } else if (r.t === "sym") {
      c.lineWidth = Math.max(1, H * 0.085);
      if (CIRCLED[r.ch]) {
        const cx = x + w / 2, cy = yTop + H / 2;
        c.beginPath(); c.arc(cx, cy, H * 0.62, 0, Math.PI * 2); c.stroke();
        c.font = `${(H * 0.78) / CAP}px ${FONT}`;
        c.textBaseline = "middle";
        c.textAlign = "center";
        c.fillText(CIRCLED[r.ch], cx, cy + H * 0.02);
        c.textAlign = "left";
      } else PAINT[r.ch](c, x + 0.04 * H, yTop, w - 0.08 * H, H, c.lineWidth);
    } else if (r.t === "stk") {
      const h2 = H * STACK_K;
      c.font = `${h2 / CAP}px ${FONT}`;
      c.textBaseline = "alphabetic";
      c.fillText(r.a, x + 0.05 * H, yTop + H * 0.5 - H * 0.12);
      c.fillText(r.b, x + 0.05 * H, yTop + H * 0.5 + h2 + H * 0.12);
    } else if (r.t === "box") {
      c.lineWidth = Math.max(1, H * 0.07);
      c.strokeRect(x + 0.08 * H, yTop - 0.32 * H, w - 0.16 * H, H * 1.64);
      paintRuns(c, r.runs, x + 0.35 * H, yTop, S, k);
    }
    x += w;
  }
}

/**
 * Layout of a block: {w, h} in H units plus anchor points ({lines:[{y, w}]} for text) and a
 * draw(ctx, S, pad) function. Cached by JSON key by the renderer.
 */
export function layoutBlock(block) {
  if (block.kind === "datum") return datumLayout(block);
  if (block.kind === "fcf") return fcfLayout(block);
  const lines = (block.lines || [""]).map((l) => parseRich(l));
  const widths = lines.map((r) => lineW(r));
  const hasStack = lines.map((r) => r.some((x) => x.t === "stk" || x.t === "box"));
  const w = Math.max(0.5, ...widths);
  const pitches = hasStack.map((s) => (s ? LINE + 0.35 : LINE));
  const h = pitches.reduce((a, b) => a + b, 0) - (LINE - 1) + (hasStack[hasStack.length - 1] ? 0.2 : 0);
  const align = block.align || "left";
  return {
    w, h,
    draw(c, S, pad) {
      let y = pad + (hasStack[0] ? 0.35 * S : 0);
      lines.forEach((runs, i) => {
        const lw = widths[i];
        const x0 = pad + (align === "center" ? (w - lw) / 2 : align === "right" ? w - lw : 0) * S;
        paintRuns(c, runs, x0, y, S);
        y += pitches[i] * S;
      });
    },
  };
}

function datumLayout(block) {
  const s = 2.0;
  return {
    w: s, h: s,
    draw(c, S, pad) {
      c.lineWidth = Math.max(1, S * 0.08);
      c.strokeRect(pad, pad, s * S, s * S);
      c.font = `${S / CAP}px ${FONT}`;
      c.textAlign = "center";
      c.textBaseline = "alphabetic";
      c.fillText(String(block.letter || "A"), pad + s * S / 2, pad + s * S / 2 + S / 2);
      c.textAlign = "left";
    },
  };
}

/** Feature control frame: rows of cells, frame height 2H per row; cell = rich string or {sym:id}. */
function fcfLayout(block) {
  const rowH = 2.0;
  const rows = block.rows || [];
  const cellW = (cell) => {
    if (cell && typeof cell === "object" && cell.sym) return 2.0;
    return Math.max(2.0, lineW(parseRich(cell)) + 1.0);
  };
  // column widths aligned across rows where possible (symbol column shared)
  const cols = [];
  rows.forEach((r) => r.forEach((cell, j) => { cols[j] = Math.max(cols[j] || 0, cellW(cell)); }));
  const rowWidths = rows.map((r) => r.reduce((a, _, j) => a + cols[j], 0));
  const w = Math.max(2, ...rowWidths);
  const h = rowH * Math.max(1, rows.length);
  return {
    w, h,
    draw(c, S, pad) {
      c.lineWidth = Math.max(1, S * 0.08);
      rows.forEach((r, i) => {
        let x = pad;
        const y = pad + i * rowH * S;
        const span = block.spanFirst && rows.length > 1;
        r.forEach((cell, j) => {
          const cw = cols[j] * S;
          const skip = span && j === 0 && i > 0;
          if (!skip) {
            const ch = span && j === 0 ? rowH * S * rows.length : rowH * S;
            c.strokeRect(x, y, cw, ch);
            if (cell && typeof cell === "object" && cell.sym) {
              const g = GDT_BY_ID[cell.sym];
              const k = 1.15;
              const gw = (WIDTH[g ? g.ch : ""] || 1.2) * S * k * 0.8;
              const cy = span && j === 0 ? y + (ch - S * k) / 2 : y + (rowH * S - S * k) / 2;
              c.lineWidth = Math.max(1, S * 0.09);
              if (g) PAINT[g.ch](c, x + (cw - gw) / 2, cy, gw, S * k, c.lineWidth);
              c.lineWidth = Math.max(1, S * 0.08);
            } else {
              const runs = parseRich(cell);
              const tw = lineW(runs) * S;
              paintRuns(c, runs, x + (cw - tw) / 2, y + (rowH * S - S) / 2, S);
            }
          } else if (span && j === 0) { /* spanned cell */ }
          x += cw;
        });
      });
    },
  };
}

/** Paint a block into a fresh canvas: {canvas, w, h (H units), S, pad}. */
export function renderBlock(block, S = 40) {
  const L = layoutBlock(block);
  const pad = Math.ceil(S * 0.25);
  const W = Math.max(4, Math.ceil(L.w * S + 2 * pad));
  const Hh = Math.max(4, Math.ceil(L.h * S + 2 * pad));
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = Hh;
  const c = cv.getContext("2d");
  c.clearRect(0, 0, W, Hh);
  c.fillStyle = "#ffffff";
  c.strokeStyle = "#ffffff";
  c.lineCap = "round";
  c.lineJoin = "round";
  L.draw(c, S, pad);
  return { canvas: cv, w: L.w, h: L.h, S, pad, pw: W, ph: Hh };
}

/** Size of a block in H units without painting it. */
export function blockSize(block) { const L = layoutBlock(block); return { w: L.w, h: L.h }; }

export { CH_TO_SYM };
