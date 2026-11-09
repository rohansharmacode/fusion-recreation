// Small original SVG glyphs used inside command dialogs (operation types, directions,
// hole types ...). Drawn from scratch for this recreation — no Autodesk artwork.
// Every glyph is a 16x16 viewBox; g(name, size) returns the markup.

const B = "#2f86de"; // body blue
const BD = "#1b5fae"; // dark blue edge
const BL = "#8cc4f2"; // light blue
const O = "#f07c22"; // orange (profiles / planes)
const R = "#d9302c"; // cut red
const GR = "#3aa53a"; // green plus
const K = "#3c3c3c"; // dark grey strokes
const MAT = "#b8b8b8"; // grey material (hole icons)
const HOLE = "#1f1f1f";
const svg = (body, size = 16) => `<svg class="dlg-glyph" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
const plusBadge = `<circle cx="12.3" cy="12.3" r="3.2" fill="${GR}"/><path d="M12.3 10.4v3.8M10.4 12.3h3.8" stroke="#fff" stroke-width="1.2"/>`;

const GLYPHS = {
  // chrome
  minus: `<path d="M4 8.5h8" stroke="currentColor" stroke-width="1.6"/>`,
  plus: `<path d="M4 8.5h8M8 4.5v8" stroke="currentColor" stroke-width="1.6"/>`,
  dockHide: `<path d="M3.6 5.2l3.4 2.9-3.4 2.9zM8.4 5.2l3.4 2.9-3.4 2.9z" fill="currentColor"/>`,
  dockShow: `<path d="M12.4 5.2L9 8.1l3.4 2.9zM7.6 5.2L4.2 8.1l3.4 2.9z" fill="currentColor"/>`,
  infoFilled: `<circle cx="8" cy="8" r="6.9" fill="currentColor"/><path d="M8 7.1v4.7" stroke="#fff" stroke-width="1.9"/><circle cx="8" cy="4.6" r="1.1" fill="#fff"/>`,
  info: `<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 7v4.5" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="4.8" r=".95" fill="currentColor"/>`,
  selCursor: `<path d="M4.3 1.9v11.2l2.7-2.5 1.9 4.1 1.75-.8-1.9-4h3.75z" fill="#fff" stroke="#3a3a3a" stroke-width="1" stroke-linejoin="round"/>`,
  selArrow: `<path d="M4.2 1.8v11.1l2.7-2.6 1.9 4.2 1.7-.8-1.9-4.1h3.8z" fill="currentColor"/>`,
  clear: `<path d="M4.8 4.8l6.4 6.4m0-6.4l-6.4 6.4" stroke="currentColor" stroke-width="1.25"/>`,
  ddCaret: `<path d="M5.1 6.6h5.8L8 9.8z" fill="currentColor"/>`,
  groupCaret: `<path d="M3.6 5.4h8.8L8 10.9z" fill="currentColor"/>`,
  caret: `<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
  caretRight: `<path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
  collapse: `<path d="M3 4l4 4-4 4M8 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
  expand: `<path d="M13 4l-4 4 4 4M8 4l-4 4 4 4" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
  warning: `<path d="M8 1.8l6.6 12H1.4z" fill="#f2b705" stroke="#8a6500" stroke-width=".8"/><path d="M8 6v4" stroke="#222" stroke-width="1.5"/><circle cx="8" cy="12" r=".9" fill="#222"/>`,
  error: `<circle cx="8" cy="8" r="6.6" fill="${R}"/><path d="M5.3 5.3l5.4 5.4m0-5.4l-5.4 5.4" stroke="#fff" stroke-width="1.6"/>`,
  addSet: `<path d="M3 8h10M8 3v10" stroke="currentColor" stroke-width="1.6"/>`,
  removeSet: `<path d="M4.5 4.5l7 7m0-7l-7 7" stroke="currentColor" stroke-width="1.5"/>`,

  // operations
  join: `<path d="M1.5 6.5h6.5v-4h6.5v9H8v3H1.5z" fill="${B}" stroke="${BD}" stroke-width=".8"/><path d="M8 6.5v5" stroke="#fff" stroke-width=".9" stroke-dasharray="1.2 1"/>`,
  cut: `<path d="M1.5 3.5h13v10h-13z" fill="${B}" stroke="${BD}" stroke-width=".8"/><path d="M8 3.5h6.5v5H8z" fill="#fff" stroke="${R}" stroke-width="1" stroke-dasharray="1.6 1"/>`,
  intersect: `<rect x="1.5" y="5.5" width="8" height="8" fill="none" stroke="${K}" stroke-width=".8"/><rect x="6.5" y="2.5" width="8" height="8" fill="none" stroke="${K}" stroke-width=".8"/><rect x="6.5" y="5.5" width="3" height="5" fill="${B}"/>`,
  newBody: `<path d="M2.6 4.2v7.4c0 1.1 2 1.9 4.4 1.9s4.4-.8 4.4-1.9V4.2" fill="${B}" stroke="${BD}" stroke-width=".7"/><ellipse cx="7" cy="4.2" rx="4.4" ry="1.8" fill="${BL}" stroke="${BD}" stroke-width=".7"/>${plusBadge}`,
  newComponent: `<rect x="1.8" y="2.5" width="9.5" height="9.5" rx="1" fill="${BL}" stroke="${BD}" stroke-width=".7"/><path d="M3.8 5.5h5.5M3.8 8h3.5" stroke="${BD}" stroke-width=".8"/>${plusBadge}`,

  // extrude type
  extrudeType: `<path d="M2 5.3l2.6-2.4h6.2L8.2 5.3z" fill="${BL}" stroke="${BD}" stroke-width=".6"/><path d="M2 5.3h6.2v8.4H2z" fill="${B}" stroke="${BD}" stroke-width=".6"/><path d="M8.2 5.3l2.6-2.4v8.4l-2.6 2.4z" fill="#1e64b8" stroke="${BD}" stroke-width=".6"/><path d="M13.2 13V3.2" stroke="${K}" stroke-width="1.1"/><path d="M11.6 4.9l1.6-2.2 1.6 2.2" fill="none" stroke="${K}" stroke-width="1.1"/>`,
  thinExtrude: `<path d="M2 5.3h6.2v8.4H6.4V7.1H3.8v6.6H2z" fill="${B}" stroke="${BD}" stroke-width=".6"/><path d="M2 5.3l2.6-2.4h6.2L8.2 5.3M8.2 5.3l2.6-2.4v8.4l-2.6 2.4" fill="${BL}" stroke="${BD}" stroke-width=".6"/><path d="M13.2 13V3.2" stroke="${K}" stroke-width="1.1"/><path d="M11.6 4.9l1.6-2.2 1.6 2.2" fill="none" stroke="${K}" stroke-width="1.1"/>`,

  // start
  profilePlane: `<path d="M4.5 3v10" stroke="${K}" stroke-width="1.4"/><path d="M5.5 8h4.5" stroke="${K}" stroke-width="1"/><path d="M9.6 6.2l2.2 1.8-2.2 1.8z" fill="${K}"/>`,
  offsetStart: `<path d="M3 3v10" stroke="${K}" stroke-width="1.4"/><path d="M8 3v10" stroke="${K}" stroke-width="1" stroke-dasharray="1.5 1.2"/><path d="M8.8 8h3.4" stroke="${K}" stroke-width="1"/><path d="M11.8 6.3l2.1 1.7-2.1 1.7z" fill="${K}"/>`,
  objectStart: `<path d="M4.5 3v10" stroke="${K}" stroke-width="1.4"/><rect x="7.5" y="4.5" width="6" height="7" fill="${BL}" stroke="${BD}" stroke-width=".7"/>`,

  // direction
  oneSide: `<path d="M7 2.2l7 1.4-1.6 4.6-7-1.4z" fill="${O}" stroke="#b8520c" stroke-width=".6"/><path d="M8.4 6.6L3 12.4" stroke="${K}" stroke-width="1.3"/><path d="M2.2 13.6l.6-3.4 2.6 2.7z" fill="${K}"/>`,
  twoSides: `<path d="M5 6.2l7 1.4-1.4 3-7-1.4z" fill="${O}" stroke="#b8520c" stroke-width=".6"/><path d="M11 2.5L13.4 1" stroke="${K}" stroke-width="1.2"/><path d="M8.6 7.6l3.6-4.4M6.9 8.9l-3.7 4.4" stroke="${K}" stroke-width="1.2"/><path d="M13.6 1.8l-.4 2.9-2.1-1.7zM2.2 14.4l.4-2.9 2.1 1.7z" fill="${K}"/>`,
  symmetric: `<path d="M5 6.2l7 1.4-1.4 3-7-1.4z" fill="${O}" stroke="#b8520c" stroke-width=".6"/><path d="M8.6 7.6l3.3-4M6.9 8.9l-3.4 4" stroke="${K}" stroke-width="1.2"/><path d="M13 2.2l-.4 2.9-2.1-1.7zM2.4 14.1l.4-2.9 2.1 1.7z" fill="${K}"/><path d="M3 8h10" stroke="${K}" stroke-width=".6" stroke-dasharray="1.2 1"/>`,

  // extent
  distance: `<path d="M2.5 3.5v9M13.5 3.5v9" stroke="${K}" stroke-width="1.3"/><path d="M4.3 8h7.4" stroke="${K}" stroke-width="1"/><path d="M3.6 8l2.1-1.6v3.2zM12.4 8l-2.1-1.6v3.2z" fill="${K}"/>`,
  toObject: `<path d="M2.5 3.5v9" stroke="${K}" stroke-width="1.3"/><path d="M4 8h5" stroke="${K}" stroke-width="1"/><path d="M10.2 8L8 6.4v3.2z" fill="${K}"/><rect x="10.8" y="3" width="3.7" height="10" fill="${BL}" stroke="${BD}" stroke-width=".7"/>`,
  all: `<path d="M2.5 3.5v9" stroke="${K}" stroke-width="1.3"/><path d="M4 8h8" stroke="${K}" stroke-width="1" stroke-dasharray="1.6 1"/><path d="M14 8l-2.4-1.8v3.6z" fill="${K}"/>`,

  halfLength: `<path d="M2 11h12" stroke="${O}" stroke-width="1.4"/><path d="M8 2.5v11" stroke="${K}" stroke-width=".8" stroke-dasharray="1.5 1"/><path d="M8.8 6h4.2" stroke="${K}" stroke-width="1.1"/><path d="M13.8 6l-2-1.5v3z" fill="${K}"/>`,
  wholeLength: `<path d="M2 11h12" stroke="${O}" stroke-width="1.4"/><path d="M8 2.5v11" stroke="${K}" stroke-width=".8" stroke-dasharray="1.5 1"/><path d="M3.2 6h9.6" stroke="${K}" stroke-width="1.1"/><path d="M13.8 6l-2-1.5v3zM2.2 6l2-1.5v3z" fill="${K}"/>`,

  flip: `<path d="M5 13V4M11 3v9" stroke="${B}" stroke-width="1.3"/><path d="M5 2.4L3 5h4zM11 13.6L9 11h4z" fill="${B}"/>`,
  flipDir: `<path d="M5.6 10.4l4.8-4.8" stroke="${B}" stroke-width="1.3" stroke-dasharray="1.6 1.1"/><path d="M13.4 2.6l-1.3 4.9-3.6-3.6zM2.6 13.4l1.3-4.9 3.6 3.6z" fill="${B}"/>`,

  // hole
  placeSingle: `<rect x="2.5" y="2.5" width="11" height="11" fill="#fff" stroke="${K}" stroke-width="1.1"/><circle cx="5.4" cy="5.4" r="1.6" fill="${B}"/>`,
  placeMulti: `<rect x="2.5" y="2.5" width="11" height="11" fill="#fff" stroke="${K}" stroke-width="1.1"/><circle cx="6" cy="6" r="1.6" fill="${B}"/><circle cx="10" cy="6" r="1.6" fill="${B}"/><circle cx="6" cy="10" r="1.6" fill="${B}"/><circle cx="10" cy="10" r="1.6" fill="${B}"/>`,
  holeSimple: `<rect x="2.5" y="2" width="11" height="12" fill="${MAT}"/><path d="M5.2 2h5.6v8.6L8 13.2l-2.8-2.6z" fill="${HOLE}"/>`,
  holeCounterbore: `<rect x="2.5" y="2" width="11" height="12" fill="${MAT}"/><path d="M3.2 2h9.6v3.6h-2v5L8 13.2l-2.8-2.6v-5h-2z" fill="${HOLE}"/>`,
  holeCountersink: `<rect x="2.5" y="2" width="11" height="12" fill="${MAT}"/><path d="M3 2h10l-2.2 3.6v5L8 13.2l-2.8-2.6v-5z" fill="${HOLE}"/>`,
  tapSimple: `<rect x="2.5" y="2" width="11" height="12" fill="${MAT}"/><path d="M5 2h6v11H5z" fill="${HOLE}"/>`,
  tapClearance: `<rect x="2.5" y="2" width="11" height="12" fill="${MAT}"/><path d="M5 2h6v11H5z" fill="${HOLE}"/><path d="M6.5 2h3v9.4h-3z" fill="#fff"/>`,
  tapTapped: `<rect x="2.5" y="2" width="11" height="12" fill="${MAT}"/><path d="M4.6 2h6.8v11H4.6z" fill="${HOLE}"/><path d="M4.6 3.5h6.8M4.6 5.3h6.8M4.6 7.1h6.8M4.6 8.9h6.8M4.6 10.7h6.8" stroke="#9a9a9a" stroke-width=".8"/>`,
  tapTaper: `<rect x="2.5" y="2" width="11" height="12" fill="${MAT}"/><path d="M3.8 2h8.4l-1.6 11H5.4z" fill="${HOLE}"/><path d="M4 3.5h8M4.3 5.3h7.4M4.5 7.1h7M4.8 8.9h6.4" stroke="#9a9a9a" stroke-width=".8"/>`,
  drillFlat: `<rect x="2.5" y="2" width="11" height="12" fill="${MAT}"/><path d="M4.8 2h6.4v10.6H4.8z" fill="${HOLE}"/>`,
  drillAngle: `<rect x="2.5" y="2" width="11" height="12" fill="${MAT}"/><path d="M4.8 2h6.4v8.4L8 13.4l-3.2-3z" fill="${HOLE}"/>`,

  // fillet / chamfer / shell
  filletType: `<path d="M2 14V2.2h6.3a5.7 5.7 0 0 1 5.7 5.7V14z" fill="#ececec" stroke="#5a5a5a" stroke-width="1.1"/><path d="M8.3 2.2a5.7 5.7 0 0 1 5.7 5.7" fill="none" stroke="${B}" stroke-width="2.2"/>`,
  constant: `<path d="M2 14V2.2h6.3a5.7 5.7 0 0 1 5.7 5.7V14z" fill="#ececec" stroke="#5a5a5a" stroke-width="1.1"/><path d="M8.3 2.2a5.7 5.7 0 0 1 5.7 5.7" fill="none" stroke="${B}" stroke-width="2.2"/>`,
  chordLength: `<path d="M2.5 13.5V6.5a4 4 0 0 1 4-4h7v11z" fill="#f4f4f4" stroke="${K}" stroke-width=".9"/><path d="M2.5 8l5-5.5" stroke="${B}" stroke-width="1.6"/>`,
  tangentG1: `<path d="M3 13.5l1.2-8.7 9.3-2.3-3.4 5.2 3.4 2.4-8.4 1z" fill="${B}" stroke="${BD}" stroke-width=".6"/><path d="M3 13.5L4.2 4.8" stroke="${K}" stroke-width="1"/>`,
  rollingBall: `<path d="M2.2 5.6l3.2-2.8h8l-3.2 2.8z" fill="${BL}" stroke="${BD}" stroke-width=".6"/><path d="M2.2 5.6h8.1v8.1H2.2z" fill="${B}" stroke="${BD}" stroke-width=".6"/><path d="M10.3 5.6l3.2-2.8v8.1l-3.2 2.8z" fill="#1e64b8" stroke="${BD}" stroke-width=".6"/><path d="M10.3 9.2a3.6 3.6 0 0 0-3.6-3.6" fill="none" stroke="#fff" stroke-width="1.2"/>`,
  setback: `<path d="M2 14V2h12" fill="none" stroke="${K}" stroke-width=".8"/><path d="M2 8h6V2" fill="none" stroke="${B}" stroke-width="1.3"/>`,
  chamferType: `<path d="M2.5 13.5V7l4.5-4.5h6.5v11z" fill="#f4f4f4" stroke="${K}" stroke-width=".9"/><path d="M2.5 7.6l5.1-5.1" stroke="${B}" stroke-width="2"/>`,
  equalDistance: `<path d="M2.5 13.5V7l4.5-4.5h6.5v11z" fill="#f4f4f4" stroke="${K}" stroke-width=".9"/><path d="M2.5 7.6l5.1-5.1" stroke="${B}" stroke-width="2"/>`,
  twoDistances: `<path d="M2.5 13.5V9l6.5-6.5h4.5v11z" fill="#f4f4f4" stroke="${K}" stroke-width=".9"/><path d="M2.5 9.6l7.1-7.1" stroke="${B}" stroke-width="2"/>`,
  distanceAngle: `<path d="M2.5 13.5V7l4.5-4.5h6.5v11z" fill="#f4f4f4" stroke="${K}" stroke-width=".9"/><path d="M2.5 7.6l5.1-5.1" stroke="${B}" stroke-width="2"/><path d="M2.5 11a3.5 3.5 0 0 1 2.4-3.3" fill="none" stroke="${K}" stroke-width=".8"/>`,
  inside: `<rect x="2" y="2" width="12" height="12" fill="${BL}" stroke="${BD}" stroke-width=".7"/><rect x="4.5" y="4.5" width="7" height="7" fill="#fff" stroke="${BD}" stroke-width=".7"/><path d="M8 2.3v2" stroke="${K}" stroke-width="1"/>`,
  outside: `<rect x="1.5" y="1.5" width="13" height="13" fill="${BL}" stroke="${BD}" stroke-width=".7"/><rect x="4" y="4" width="8" height="8" fill="#fff" stroke="${K}" stroke-width=".8" stroke-dasharray="1.2 1"/>`,
  both: `<rect x="1.5" y="1.5" width="13" height="13" fill="${BL}" stroke="${BD}" stroke-width=".7"/><rect x="5" y="5" width="6" height="6" fill="#fff" stroke="${BD}" stroke-width=".7"/><rect x="3.3" y="3.3" width="9.4" height="9.4" fill="none" stroke="${K}" stroke-width=".7" stroke-dasharray="1 1"/>`,
  sharpShell: `<path d="M2 3v11h12V3" fill="none" stroke="${B}" stroke-width="2"/>`,
  roundedShell: `<path d="M2 3v8a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V3" fill="none" stroke="${B}" stroke-width="2"/>`,

  // revolve
  revAngle: `<path d="M8 13A5 5 0 0 1 3.7 5.5" fill="none" stroke="${B}" stroke-width="1.5"/><path d="M2.5 8.2l1.1-2.9 2.9 1" fill="none" stroke="${B}" stroke-width="1.3"/><path d="M8 2v12" stroke="${K}" stroke-width=".8" stroke-dasharray="1.6 1"/>`,
  revFull: `<ellipse cx="8" cy="8" rx="6" ry="3" fill="none" stroke="${B}" stroke-width="1.5"/><path d="M8 1.5v13" stroke="${K}" stroke-width=".8" stroke-dasharray="1.6 1"/>`,

  // construction / generic
  plane: `<path d="M1.5 11l4-4h9l-4 4z" fill="${O}" fill-opacity=".55" stroke="#b8520c" stroke-width=".7"/>`,
  point: `<circle cx="8" cy="8" r="2.4" fill="${O}" stroke="${K}" stroke-width=".7"/>`,
  bodies: `<path d="M2.2 5.6l3.2-2.8h8l-3.2 2.8z" fill="${BL}" stroke="${BD}" stroke-width=".6"/><path d="M2.2 5.6h8.1v8.1H2.2z" fill="${B}" stroke="${BD}" stroke-width=".6"/><path d="M10.3 5.6l3.2-2.8v8.1l-3.2 2.8z" fill="#1e64b8" stroke="${BD}" stroke-width=".6"/>`,
  faces: `<path d="M2 11l3.5-5h8.5L10.5 11z" fill="${B}" stroke="${BD}" stroke-width=".7"/>`,
  features: `<path d="M3 13V6l5-3.5L13 6v7z" fill="${BL}" stroke="${BD}" stroke-width=".7"/><path d="M5.5 13V8.5h5V13" fill="${B}"/>`,
  components: `<rect x="2" y="3" width="12" height="10" rx="1" fill="${BL}" stroke="${BD}" stroke-width=".7"/><path d="M4 6h8M4 8.5h5" stroke="${BD}" stroke-width=".9"/>`,
  freeMove: `<path d="M8 1.5v13M1.5 8h13" stroke="${K}" stroke-width="1.1"/><path d="M8 1.5l-1.8 2.3h3.6zM8 14.5l-1.8-2.3h3.6zM1.5 8l2.3-1.8v3.6zM14.5 8l-2.3-1.8v3.6z" fill="${K}"/>`,
  translate: `<path d="M2 13L13 2" stroke="${K}" stroke-width="1.2"/><path d="M14 1l-1.2 4-2.8-2.8z" fill="${K}"/>`,
  rotate: `<path d="M12.5 8A4.5 4.5 0 1 1 8 3.5" fill="none" stroke="${K}" stroke-width="1.3"/><path d="M8 1.5l2.6 2-2.6 2z" fill="${K}"/>`,
  extentSpacing: `<path d="M2 12h12" stroke="${K}" stroke-width=".8"/><rect x="2" y="6" width="3" height="5" fill="${B}"/><rect x="7" y="6" width="3" height="5" fill="${B}"/><rect x="12" y="6" width="2" height="5" fill="${B}"/><path d="M3.5 4h5" stroke="${K}" stroke-width=".9"/>`,
  extentWhole: `<path d="M2 12h12" stroke="${K}" stroke-width=".8"/><rect x="2" y="6" width="3" height="5" fill="${B}"/><rect x="7" y="6" width="3" height="5" fill="${B}"/><rect x="12" y="6" width="2" height="5" fill="${B}"/><path d="M2 4h12" stroke="${K}" stroke-width=".9"/>`,
  fixedPlane: `<path d="M1.5 12l4-4h9l-4 4z" fill="${O}" fill-opacity=".55" stroke="#b8520c" stroke-width=".7"/><path d="M8 9V2.5" stroke="${K}" stroke-width="1.1"/><path d="M8 1.5L6.3 4h3.4z" fill="${K}"/>`,
  partingLine: `<path d="M1.5 8h13" stroke="${O}" stroke-width="1.4"/><path d="M4 8V3M12 8v5" stroke="${K}" stroke-width="1"/>`,
  singlePath: `<path d="M2 13c3-6 7-2 12-9" fill="none" stroke="${B}" stroke-width="1.5"/><circle cx="2.5" cy="12.5" r="1.6" fill="${O}"/>`,
  pathGuide: `<path d="M2 13c3-6 7-2 12-9M2 9c3-6 7-2 12-8" fill="none" stroke="${B}" stroke-width="1.2"/><circle cx="2.5" cy="12.5" r="1.6" fill="${O}"/>`,
  rails: `<path d="M3 14V2M13 14V2" stroke="${B}" stroke-width="1.3"/><path d="M3 8h10" stroke="${K}" stroke-width=".8" stroke-dasharray="1.4 1"/>`,
  free: `<circle cx="8" cy="8" r="2.4" fill="none" stroke="${K}" stroke-width="1"/>`,
};

export function g(name, size = 16) {
  const body = GLYPHS[name];
  return body ? svg(body, size) : "";
}

export function hasGlyph(name) { return !!GLYPHS[name]; }

/**
 * Hole cross-section diagram for the HOLE dialog (original drawing in the style of Fusion's:
 * grey hole profile, blue dimension arrows between red extension ticks, grey leaders to the
 * editable callouts on the right). Returns {svg, callouts:[{field, x, y}]} in a 300 x 176 box.
 */
export function holeDiagram(v) {
  const W = 300, H = 176;
  const type = v.holeType || "simple";
  const tipped = v.drillPoint !== "flat";
  const all = v.extent === "all";
  const cx = 67, r = 20;
  const top = 61, shoulder = 141, tip = tipped ? 156 : 141;
  const LX = 176; // callout column
  const red = "#e0332b", blue = "#1f6fd6", lead = "#8a8a8a", body = "#c8c8c8", edge = "#727272";
  const parts = [];
  const callouts = [];
  // hole outline
  let pts = [];
  let topR = r;
  if (type === "counterbore") { topR = 30; pts = [[cx - topR, top], [cx + topR, top], [cx + topR, top + 25], [cx + r, top + 25]]; }
  else if (type === "countersink") { topR = 33; pts = [[cx - topR, top], [cx + topR, top], [cx + r, top + 20]]; }
  else pts = [[cx - r, top], [cx + r, top]];
  pts.push([cx + r, shoulder]);
  if (tipped) pts.push([cx, tip]);
  pts.push([cx - r, shoulder]);
  if (type === "counterbore") pts.push([cx - r, top + 25], [cx - topR, top + 25]);
  else if (type === "countersink") pts.push([cx - r, top + 20]);
  const poly = pts.map((p) => p.join(",")).join(" ");
  parts.push(`<polygon points="${poly}" fill="${body}" stroke="${edge}" stroke-width="2.2" stroke-linejoin="round"/>`);
  if (all) parts.push(`<path d="M${cx - r - 4} ${shoulder - 6} q6 -5 12 0 t12 0 t12 0 t12 0" fill="none" stroke="#fff" stroke-width="5"/>`);
  const arrow = (x1, y1, x2, y2) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${blue}" stroke-width="1.6" marker-start="url(#dlgHa)" marker-end="url(#dlgHa)"/>`;
  const leader = (pts2) => `<polyline points="${pts2.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${lead}" stroke-width="1.3"/>`;
  // depth: ticks on the left, vertical dimension, leader up and over to the callout
  if (!all) {
    const ly = type === "simple" ? 12 : 36;
    parts.push(`<path d="M15 ${top}H37M15 ${shoulder}H37" stroke="${red}" stroke-width="1.6"/>`);
    parts.push(arrow(27, top + 3, 27, shoulder - 3));
    parts.push(leader([[27, top - 2], [27, ly], [LX - 4, ly]]));
    callouts.push({ field: "depth", x: LX, y: ly });
  }
  // counterbore / countersink diameter (dimension above the hole) and depth / angle
  if (type === "counterbore" || type === "countersink") {
    const dy = top - 9;
    parts.push(`<path d="M${cx - topR} ${dy - 6}V${dy + 6}M${cx + topR} ${dy - 6}V${dy + 6}" stroke="${red}" stroke-width="1.6"/>`);
    parts.push(arrow(cx - topR + 3, dy, cx + topR - 3, dy));
    parts.push(leader([[cx + topR + 2, dy], [cx + topR + 12, 12], [LX - 4, 12]]));
    callouts.push({ field: type === "counterbore" ? "cbD" : "csD", x: LX, y: 12 });
  }
  if (type === "counterbore") {
    const x = cx + topR + 9;
    parts.push(`<path d="M${cx + topR + 2} ${top}H${x + 6}M${cx + topR + 2} ${top + 25}H${x + 6}" stroke="${red}" stroke-width="1.6"/>`);
    parts.push(arrow(x, top + 3, x, top + 22));
    parts.push(leader([[x + 2, top + 12.5], [LX - 4, 82]]));
    callouts.push({ field: "cbDepth", x: LX, y: 82 });
  }
  if (type === "countersink") {
    parts.push(`<path d="M${cx - topR + 8} ${top + 7} Q${cx} ${top + 20} ${cx + topR - 8} ${top + 7}" fill="none" stroke="${blue}" stroke-width="1.6" marker-start="url(#dlgHa)" marker-end="url(#dlgHa)"/>`);
    parts.push(leader([[cx + topR - 6, top + 9], [LX - 4, 82]]));
    callouts.push({ field: "csAngle", x: LX, y: 82 });
  }
  // tip angle
  if (tipped) {
    parts.push(`<path d="M${cx - 11} ${shoulder + 4} Q${cx} ${shoulder - 4} ${cx + 11} ${shoulder + 4}" fill="none" stroke="${blue}" stroke-width="1.6" marker-start="url(#dlgHa)" marker-end="url(#dlgHa)"/>`);
    parts.push(leader([[cx + 10, shoulder - 1], [cx + 18, 132], [LX - 4, 132]]));
    callouts.push({ field: "tipAngle", x: LX, y: 132 });
  }
  // diameter at the bottom
  const by = tip + 9;
  parts.push(`<path d="M${cx - r} ${by - 7}V${by + 7}M${cx + r} ${by - 7}V${by + 7}" stroke="${red}" stroke-width="1.6"/>`);
  parts.push(arrow(cx - r + 3, by, cx + r - 3, by));
  parts.push(leader([[cx + r + 2, by], [LX - 4, by]]));
  callouts.push({ field: "diameter", x: LX, y: Math.min(H - 10, by) });
  const svgText = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <defs><marker id="dlgHa" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0.5L8 4L0 7.5z" fill="${blue}"/></marker></defs>
    ${parts.join("")}
  </svg>`;
  return { svg: svgText, callouts, height: H };
}
