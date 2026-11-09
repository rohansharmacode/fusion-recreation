// Original icons of the annotate module (no Autodesk artwork): 16 px Browser glyphs per PMI kind
// (in the spirit of the PMI symbols reference: note, hole note, dimension kinds, GD&T characteristics,
// datum, generic "feature contains multiple PMI") and the timeline icons of the PMI feature types.
import { registerFeatureIcons, registerIcons } from "../icons/icons.js";
import { ctx, ln, pa, rc, ci, tx, C } from "../icons/draw.js";

const S = (inner) => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;
const INK = "#2f3a45";
const BLUE = "#1f86e0";
const page = '<rect x="1.5" y="2" width="13" height="12" rx="1" fill="#fff" stroke="#6b7a88" stroke-width=".9"/>';
const GLYPH = {
  note: S(`${page}<path d="M4 5.5h8M4 8h8M4 10.5h5" stroke="${INK}" stroke-width="1.1"/>`),
  general: S(`${page}<path d="M4 5h8M4 7.5h8M4 10h8M4 12h4" stroke="${INK}" stroke-width=".9"/>`),
  hole: S(`<circle cx="5.5" cy="10" r="3.4" fill="#fff" stroke="${INK}" stroke-width="1"/><path d="M3 12.5l5-5" stroke="${INK}" stroke-width=".9"/><path d="M8 7.5l3.6-3.6h3" fill="none" stroke="${BLUE}" stroke-width="1.1"/><path d="M8 7.5l.4 1.8 1.4-1.4z" fill="${BLUE}"/>`),
  linear: S(`<path d="M2 4v8M14 4v8" stroke="${INK}" stroke-width="1"/><path d="M2.6 8h10.8" stroke="${BLUE}" stroke-width="1"/><path d="M2.4 8l2.4-1.5v3zM13.6 8l-2.4-1.5v3z" fill="${BLUE}"/>`),
  diameter: S(`<circle cx="8" cy="8" r="5.6" fill="none" stroke="${INK}" stroke-width="1"/><path d="M4 12l8-8" stroke="${BLUE}" stroke-width="1"/><path d="M12.2 3.8l-.5 2.6-2.1-2.1zM3.8 12.2l.5-2.6 2.1 2.1z" fill="${BLUE}"/>`),
  radius: S(`<path d="M2 14A12 12 0 0 1 14 2" fill="none" stroke="${INK}" stroke-width="1"/><path d="M13.2 13.2L5.6 5.6" stroke="${BLUE}" stroke-width="1"/><path d="M5.2 5.2l2.7.6-2.1 2.1z" fill="${BLUE}"/>`),
  angular: S(`<path d="M2 14h12M2 14l9-9" stroke="${INK}" stroke-width="1"/><path d="M9 14a7 7 0 0 0-2-5" fill="none" stroke="${BLUE}" stroke-width="1"/>`),
  datum: S(`<rect x="4" y="1.5" width="8" height="7.5" fill="#fff" stroke="${INK}" stroke-width="1"/><text x="8" y="7.6" font-size="6.2" font-family="Arial" text-anchor="middle" fill="${INK}">A</text><path d="M8 9v2.4" stroke="${INK}" stroke-width="1"/><path d="M4.6 14.5h6.8L8 11.2z" fill="${INK}"/>`),
  frame: S(`<rect x="1" y="4.5" width="14" height="7" fill="#fff" stroke="${INK}" stroke-width=".9"/><path d="M5.5 4.5v7M11 4.5v7" stroke="${INK}" stroke-width=".8"/><circle cx="3.25" cy="8" r="1.4" fill="none" stroke="${INK}" stroke-width=".7"/><path d="M3.25 5.9v4.2M1.2 8h4.1" stroke="${INK}" stroke-width=".6"/><path d="M6.6 8h3.4" stroke="${INK}" stroke-width=".9"/><text x="13" y="9.8" font-size="4.6" font-family="Arial" text-anchor="middle" fill="${INK}">A</text>`),
  generic: S(`<rect x="1.5" y="5" width="9" height="9" rx="1" fill="#fff" stroke="#6b7a88" stroke-width=".9"/><rect x="5.5" y="1.5" width="9" height="9" rx="1" fill="#fff" stroke="${INK}" stroke-width=".9"/><path d="M7.5 4.5h5M7.5 7h5" stroke="${INK}" stroke-width=".9"/>`),
};

export const PMI_ICONS = {
  browser(f) {
    switch (f.type) {
      case "pmiNote": return GLYPH.note;
      case "pmiGeneralNote": return GLYPH.general;
      case "pmiHoleNote": return GLYPH.hole;
      case "pmiDimension": return GLYPH[f.dimType] || GLYPH.linear;
      case "pmiGdt": return f.fcf && f.fcf.sym ? GLYPH.frame : GLYPH.datum;
      default: return GLYPH.generic;
    }
  },
  generic: () => GLYPH.generic,
  glyph: (k) => GLYPH[k] || GLYPH.generic,
};

/** Timeline icons for the PMI feature types (the toolbar command icons live in icons/cmd-other.js). */
export function registerPmiIcons() {
  registerIcons({
    // a datum-only Geometric Tolerancing feature in the timeline / browser
    PmiDatum: () => rc(10, 3, 12, 11, C.paper, C.ink, 1) + (ctx.small ? "" : tx(16, 11.6, "A", 8, C.ink, { "text-anchor": "middle" })) + ln(16, 14, 16, 19, C.ink, 1) + pa("M10.5 27h11L16 19.5z", C.ink, C.ink, 0.6),
    PmiGeneric: () => rc(4, 9, 16, 18, C.paper, C.paperEdge, 1, { rx: 1.5 }) + rc(11, 4, 17, 18, C.paper, C.ink, 1, { rx: 1.5 }) + pa("M14 10h10M14 14h10M14 18h6", null, C.ink, 1.1) + ci(7, 22, 0.01, null, C.ink, 0.1),
  });
  registerFeatureIcons({
    pmiNote: "LeaderLineNoteCommand",
    pmiGeneralNote: "GeneralNoteCommand",
    pmiDimension: "DimensionNoteCommand",
    pmiGdt: "GeometricToleranceNoteCommand",
    pmiHoleNote: "HoleThreadNoteCommand",
  });
}
