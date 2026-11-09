// Small DOM helpers + original 16 px glyphs for the inspect dialogs (drawn for this recreation).
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function div(cls, html) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  if (html !== undefined) d.innerHTML = html;
  return d;
}

const svg = (body, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
const K = "#4a4a4a";
const B = "#3c7fc1";
const BL = "#a9cdee";

export const ICONS = {
  caret: svg(`<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4"/>`),
  caretRight: svg(`<path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4"/>`),
  // measure selection filters
  filter_body: svg(`<path d="M3 5.2l5-2.7 5 2.7v5.9l-5 2.7-5-2.7z" fill="${BL}" stroke="${K}" stroke-width=".9"/><path d="M3 5.2l5 2.7 5-2.7M8 7.9v5.9" fill="none" stroke="${K}" stroke-width=".9"/>`),
  filter_fev: svg(`<path d="M3 5.2l5-2.7 5 2.7v5.9l-5 2.7-5-2.7z" fill="#fff" stroke="${K}" stroke-width=".9"/><path d="M3 5.2l5 2.7 5-2.7z" fill="${B}" stroke="${K}" stroke-width=".9"/><path d="M8 7.9v5.9" stroke="${B}" stroke-width="1.8"/><circle cx="3" cy="11.1" r="1.6" fill="${B}"/>`),
  filter_component: svg(`<rect x="1.8" y="2.5" width="7.5" height="7.5" rx=".8" fill="${BL}" stroke="${K}" stroke-width=".9"/><rect x="6.7" y="6" width="7.5" height="7.5" rx=".8" fill="#fff" stroke="${K}" stroke-width=".9"/><path d="M8.5 9h4M8.5 11h2.6" stroke="${K}" stroke-width=".8"/>`),
  delta_global: svg(`<path d="M3 13V3M3 13h10M3 13l6.5-6.5" fill="none" stroke="${K}" stroke-width="1"/><path d="M3 3l-1.3 2M3 3l1.3 2M13 13l-2-1.3M13 13l-2 1.3" stroke="${K}" stroke-width="1"/><circle cx="9.8" cy="6.2" r="1.3" fill="${B}"/>`),
  delta_off: svg(`<path d="M3 13V3M3 13h10" fill="none" stroke="${K}" stroke-width="1"/><path d="M5 5l7 7M12 5l-7 7" stroke="#d9302c" stroke-width="1.2"/>`),
  // appearance "Apply To"
  apply_bodies: svg(`<path d="M2.5 5l5.5-3 5.5 3v6.2L8 14.2 2.5 11.2z" fill="${B}" stroke="${K}" stroke-width=".9"/><path d="M2.5 5L8 8l5.5-3M8 8v6.2" fill="none" stroke="#1f4f80" stroke-width=".9"/>`),
  apply_faces: svg(`<path d="M2.5 5l5.5-3 5.5 3v6.2L8 14.2 2.5 11.2z" fill="#fff" stroke="${K}" stroke-width=".9"/><path d="M2.5 5L8 8l5.5-3L8 2z" fill="${B}" stroke="${K}" stroke-width=".9"/><path d="M8 8v6.2" stroke="${K}" stroke-width=".9"/>`),
  search: svg(`<circle cx="6.8" cy="6.8" r="4.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 10l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`),
  folder: svg(`<path d="M1.5 4.2h4.6l1.3 1.4h7.1v7.7H1.5z" fill="#f1f1f1" stroke="#7a7a7a" stroke-width=".9"/>`),
  star: svg(`<path d="M8 1.9l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.3l-3.7 2.1.8-4.2L2 6.3l4.2-.5z" fill="none" stroke="#7a7a7a" stroke-width="1"/>`),
  flip: svg(`<path d="M8 1.8v12.4M8 1.8L5.4 4.6M8 1.8l2.6 2.8M8 14.2l-2.6-2.8M8 14.2l2.6-2.8" fill="none" stroke="${K}" stroke-width="1.3"/>`),
  material: svg(`<circle cx="8" cy="8" r="6" fill="#d7d7d7" stroke="${K}" stroke-width=".9"/><path d="M4 4.5l8 7M2.6 8.7l5.8 5M7.2 2.2l6.4 5.7" stroke="${K}" stroke-width=".8"/>`),
};

/** Copy text to the clipboard (best effort; the artifact sandbox may refuse). */
export function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(String(text)).catch(() => {}); return true; }
  } catch { /* ignore */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = String(text);
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  } catch { return false; }
}

/** A dialog-framework glyph (so custom rows match the framework's own carets/icons), with a fallback. */
export function fwGlyph(app, name, fallback = "", size) {
  try {
    const g = app && app.ui && app.ui.dialog && app.ui.dialog.glyph;
    const out = g ? (size ? g(name, size) : g(name)) : "";
    if (out && !/undefined/.test(out)) return out;
  } catch { /* ignore */ }
  return fallback;
}
