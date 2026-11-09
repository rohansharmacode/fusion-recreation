// Original small SVG glyphs for sketch constraints and inference marks. They are drawn inside
// grey rounded badges (see style.css); horizontal/vertical use an elongated "ruler" badge.
const svg = (body) => `<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

// a bar with a row of small teeth underneath (horizontal), and the same turned upright (vertical)
const teethH = [2.2, 6.1, 10, 13.9].map((x) => `<rect x="${x}" y="4.1" width="2.2" height="2.3" rx="0.9"/>`).join("");
const teethV = [2.2, 6.1, 10, 13.9].map((y) => `<rect x="4.1" y="${y}" width="2.3" height="2.2" ry="0.9"/>`).join("");
const RULER_H = `<svg viewBox="0 0 19 7" width="19" height="7"><rect x="0.5" y="0.6" width="18" height="2.2" rx="0.6" fill="currentColor"/><g fill="currentColor" opacity="0.85">${teethH}</g></svg>`;
const RULER_V = `<svg viewBox="0 0 7 19" width="7" height="19"><rect x="0.6" y="0.5" width="2.2" height="18" ry="0.6" fill="currentColor"/><g fill="currentColor" opacity="0.85">${teethV}</g></svg>`;

export const GLYPH_SVG = {
  horizontal: RULER_H,
  vertical: RULER_V,
  parallel: svg('<path d="M3.5 11.5L7.5 2.5M7 11.5l4-9"/>'),
  perpendicular: svg('<path d="M2.5 11.5h9M7 11.5V2.5"/>'),
  coincident: svg('<path d="M2.5 11.5l9-9" stroke-width="1"/><circle cx="7" cy="7" r="2.3" fill="currentColor" stroke="none"/>'),
  onCurve: svg('<path d="M2.5 11.5l9-9" stroke-width="1"/><circle cx="7" cy="7" r="2.3" fill="currentColor" stroke="none"/>'),
  tangent: svg('<circle cx="7" cy="8.3" r="3.6"/><path d="M1.5 4.7h11"/>'),
  equal: svg('<path d="M3 5h8M3 9h8" stroke-width="1.6"/>'),
  midpoint: svg('<path d="M1.5 11h11" stroke-width="1"/><path d="M7 3.5l3.4 5.6H3.6z" fill="currentColor" stroke="none"/>'),
  concentric: svg('<circle cx="7" cy="7" r="5"/><circle cx="7" cy="7" r="2"/>'),
  collinear: svg('<path d="M1.5 12L5.5 8.5M8.5 5.5L12.5 2"/><circle cx="7" cy="7" r="1" fill="currentColor"/>'),
  symmetric: svg('<path d="M7 1.5v11" stroke-dasharray="1.6 1.4" stroke-width="1"/><path d="M5 4L2.2 7 5 10M9 4l2.8 3L9 10"/>'),
  fix: svg('<rect x="3.2" y="6.4" width="7.6" height="5.6" rx="1"/><path d="M4.9 6.4V4.9a2.1 2.1 0 0 1 4.2 0v1.5"/>'),
  // round-7 constraints (original drawings)
  smooth: svg('<path d="M1.5 11.5h4.5c3 0 4-2 5-4.5S12 2.5 12.5 2.5"/><circle cx="6" cy="11.5" r="1.3" fill="currentColor" stroke="none"/>'),
  polygon: svg('<path d="M7 2l4.6 3.2-1.7 5.6H4.1L2.4 5.2z"/>'),
  rpattern: svg('<rect x="1.8" y="1.8" width="3.6" height="3.6" rx="0.6"/><rect x="8.6" y="1.8" width="3.6" height="3.6" rx="0.6"/><rect x="1.8" y="8.6" width="3.6" height="3.6" rx="0.6"/><rect x="8.6" y="8.6" width="3.6" height="3.6" rx="0.6"/>'),
  cpattern: svg('<circle cx="7" cy="7" r="4.6" stroke-dasharray="1.4 1.4" stroke-width="1"/><circle cx="7" cy="2.4" r="1.4" fill="currentColor" stroke="none"/><circle cx="11" cy="9.3" r="1.4" fill="currentColor" stroke="none"/><circle cx="3" cy="9.3" r="1.4" fill="currentColor" stroke="none"/>'),
};
