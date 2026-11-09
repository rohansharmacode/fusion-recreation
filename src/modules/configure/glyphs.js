// Small original SVG glyphs for the configuration table, Configuration Mode bar, browser selector and
// rules editor (16 px unless noted). Original drawings only; no Autodesk artwork.
const sv = (body, w = 16, h = 16, vb = null) => `<svg width="${w}" height="${h}" viewBox="${vb || `0 0 ${w} ${h}`}" aria-hidden="true" focusable="false">${body}</svg>`;
const TABLE = (x, y, w, h, head = "#d7e6f4") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx=".8" fill="#fff" stroke="#5a6570" stroke-width="1"/>` +
  `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="3" fill="${head}"/>` +
  `<path d="M${x} ${y + 3.5}h${w}M${x} ${y + 3.5 + (h - 3.5) / 2}h${w}M${x + w * 0.38} ${y}v${h}" stroke="#5a6570" stroke-width=".8"/>`;

export const G = {
  table: () => sv(TABLE(1.5, 2.5, 13, 11)),
  addConfig: () => sv(TABLE(0.5, 1.5, 11, 10) + '<circle cx="12" cy="12" r="3.6" fill="#2a8a2a"/><path d="M12 10v4M10 12h4" stroke="#fff" stroke-width="1.4"/>'),
  addAspects: () => sv(TABLE(0.5, 1.5, 11, 10) + '<path d="M13.5 1.5v9" stroke="#2f7fd6" stroke-width="1.6"/><circle cx="12" cy="12" r="3.6" fill="#2f7fd6"/><path d="M12 10v4M10 12h4" stroke="#fff" stroke-width="1.4"/>'),
  addParams: () => sv('<text x="0.5" y="11.5" font-family="Times New Roman, Georgia, serif" font-style="italic" font-size="12.5" fill="#3a3a3a">fx</text><circle cx="12" cy="12" r="3.6" fill="#2a8a2a"/><path d="M12 10v4M10 12h4" stroke="#fff" stroke-width="1.4"/>'),
  rules: () => sv('<rect x="1" y="1.5" width="7" height="4" rx="1" fill="#b65fd0"/><rect x="4" y="6.5" width="9" height="3.6" rx="1" fill="#3f8fd8"/><rect x="4" y="11" width="11" height="3.6" rx="1" fill="#e2913a"/><path d="M2.5 5.5v8h1.5M2.5 8.3H4" fill="none" stroke="#6b6b6b" stroke-width=".9"/>'),
  more: () => sv('<circle cx="3" cy="8" r="1.4" fill="#4a4a4a"/><circle cx="8" cy="8" r="1.4" fill="#4a4a4a"/><circle cx="13" cy="8" r="1.4" fill="#4a4a4a"/>'),
  close: () => sv('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="#4a4a4a" stroke-width="1.3"/>'),
  minimize: () => sv('<path d="M3 8.5h10" stroke="#4a4a4a" stroke-width="1.5"/>'),
  restore: () => sv('<path d="M3.5 5.5h9v7h-9z" fill="none" stroke="#4a4a4a" stroke-width="1.2"/>'),
  eye: () => sv('<path d="M1.2 8c1.9-3.2 4.2-4.6 6.8-4.6S12.9 4.8 14.8 8c-1.9 3.2-4.2 4.6-6.8 4.6S3.1 11.2 1.2 8z" fill="#fff" stroke="#3c3c3c" stroke-width="1.1"/><circle cx="8" cy="8" r="2.4" fill="#3c3c3c"/>'),
  eyeOff: () => sv('<path d="M1.2 8c1.9-3.2 4.2-4.6 6.8-4.6S12.9 4.8 14.8 8c-1.9 3.2-4.2 4.6-6.8 4.6S3.1 11.2 1.2 8z" fill="#fff" stroke="#9a9a9a" stroke-width="1.1"/><circle cx="8" cy="8" r="2.4" fill="#9a9a9a"/><path d="M2.5 13.5l11-11" stroke="#9a9a9a" stroke-width="1.3"/>'),
  unsuppressed: () => sv('<path d="M2.5 5.2L8 2.4l5.5 2.8v6L8 14l-5.5-2.8z" fill="#cfe1f3" stroke="#3f5f80" stroke-width="1"/><path d="M2.5 5.2L8 8l5.5-2.8M8 8v6" fill="none" stroke="#3f5f80" stroke-width=".9"/>'),
  suppressed: () => sv('<path d="M2.5 5.2L8 2.4l5.5 2.8v6L8 14l-5.5-2.8z" fill="#ececec" stroke="#9b9b9b" stroke-width="1" stroke-dasharray="1.6 1.2"/><path d="M2 14L14 2" stroke="#c43c3c" stroke-width="1.4"/>'),
  implicit: () => sv('<path d="M2.5 5.2L8 2.4l5.5 2.8v6L8 14l-5.5-2.8z" fill="#f2f2f2" stroke="#b5b5b5" stroke-width="1" stroke-dasharray="1.6 1.2"/><path d="M2 14L14 2" stroke="#d99" stroke-width="1.2"/>'),
  active: () => sv('<circle cx="8" cy="8" r="5.6" fill="#fff" stroke="#0696d7" stroke-width="1.4"/><circle cx="8" cy="8" r="3" fill="#0696d7"/>'),
  inactive: () => sv('<circle cx="8" cy="8" r="5.6" fill="#fff" stroke="#9a9a9a" stroke-width="1.1"/>'),
  lock: () => sv('<rect x="3.5" y="7" width="9" height="7" rx="1" fill="#6b6b6b"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="#6b6b6b" stroke-width="1.4"/>', 12, 12, "0 0 16 16"),
  funnel: () => sv('<path d="M2 3h12l-4.6 5.4V13l-2.8 1.2V8.4z" fill="#6b6b6b"/>', 12, 12, "0 0 16 16"),
  warn: () => sv('<path d="M8 1.5l7 12.5H1z" fill="#f2b20f" stroke="#8a6500" stroke-width=".7"/><path d="M8 6v4" stroke="#222" stroke-width="1.5"/><circle cx="8" cy="12" r=".9" fill="#222"/>', 14, 14, "0 0 16 16"),
  error: () => sv('<circle cx="8" cy="8" r="6.5" fill="#d9302c"/><path d="M5.2 5.2l5.6 5.6M10.8 5.2l-5.6 5.6" stroke="#fff" stroke-width="1.6"/>', 14, 14, "0 0 16 16"),
  ok: () => sv('<circle cx="8" cy="8" r="6.5" fill="#3a9d23"/><path d="M4.8 8.2l2.2 2.2 4.4-4.6" stroke="#fff" stroke-width="1.6" fill="none"/>', 14, 14, "0 0 16 16"),
  off: () => sv('<circle cx="8" cy="8" r="6.5" fill="#9a9a9a"/><path d="M5 8h6" stroke="#fff" stroke-width="1.6"/>', 14, 14, "0 0 16 16"),
  check: () => sv('<path d="M3 8.6l3.3 3.2L13.2 4.6" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  chevDown: () => sv('<path d="M2 3.6l3 3.2 3-3.2" stroke="currentColor" stroke-width="1.3" fill="none"/>', 10, 10),
  chevRight: () => sv('<path d="M3.6 2l3.2 3-3.2 3" stroke="currentColor" stroke-width="1.3" fill="none"/>', 10, 10),
  search: () => sv('<circle cx="6.8" cy="6.8" r="4.3" fill="none" stroke="#6a6a6a" stroke-width="1.3"/><path d="M10 10l4 4" stroke="#6a6a6a" stroke-width="1.5"/>', 14, 14, "0 0 16 16"),
  trash: () => sv('<path d="M3 4.2h10M6.2 4.2V2.6h3.6v1.6M4.3 5.4l.7 8.4h6l.7-8.4" fill="none" stroke="#5a5a5a" stroke-width="1.1"/>', 14, 14, "0 0 16 16"),
  gear: () => sv('<circle cx="8" cy="8" r="2.3" fill="none" stroke="#fff" stroke-width="1.3"/><path d="M8 1.6v2.2M8 12.2v2.2M1.6 8h2.2M12.2 8h2.2M3.5 3.5l1.6 1.6M10.9 10.9l1.6 1.6M3.5 12.5l1.6-1.6M10.9 5.1l1.6-1.6" stroke="#fff" stroke-width="1.3"/>', 12, 12, "0 0 16 16"),
  up: () => sv('<path d="M3 10l5-5 5 5" stroke="currentColor" stroke-width="1.6" fill="none"/>', 12, 12, "0 0 16 16"),
  down: () => sv('<path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="1.6" fill="none"/>', 12, 12, "0 0 16 16"),
  x: () => sv('<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6"/>', 10, 10, "0 0 16 16"),
  info: () => sv('<circle cx="7" cy="7" r="6.4" fill="#3c3c3c"/><rect x="6.2" y="5.8" width="1.6" height="4.6" fill="#fff"/><circle cx="7" cy="3.9" r=".95" fill="#fff"/>', 14, 14),
  configured: () => sv('<rect x="0.5" y="0.5" width="7" height="7" rx="1.2" fill="#fff" stroke="#2f7fd6"/><path d="M0.5 3h7M3 3v4.5" stroke="#2f7fd6" stroke-width=".8"/>', 8, 8),
};
