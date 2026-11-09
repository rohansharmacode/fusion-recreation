// Small DOM helpers shared by the browser and timeline modules: element builder, safe
// storage, glyphs (original drawings in the style of Fusion's browser/timeline), a Fusion-style
// context menu (icons left, shortcut column, separators, submenus), tooltips, inline rename and
// a confirm box.
import "./ui.css";
import { uiIcon, featureIcon, hasIcon, icon } from "../icons/icons.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** el("div", {class:"x", onclick: fn, dataset:{node:"body:b1"}, html:"..."}, child, "text") */
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k === "text") e.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k === "dataset") { for (const [dk, dv] of Object.entries(v)) if (dv !== undefined && dv !== null) e.dataset[dk] = dv; }
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === undefined || c === null || c === false) continue;
    e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

// ---------------------------------------------------------------------------
// Storage (localStorage may be unavailable in a sandboxed iframe)
// ---------------------------------------------------------------------------
const memStore = new Map();
export const store = {
  get(key, dflt = null) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw);
    } catch { /* ignore */ }
    return memStore.has(key) ? memStore.get(key) : dflt;
  },
  set(key, value) {
    memStore.set(key, value);
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};

// ---------------------------------------------------------------------------
// Glyphs. All artwork below is original. Browser-tree / timeline / menu glyphs are drawn here
// so the panels match Fusion's monochrome browser style; anything else falls back to the
// shared icon library (icons.js).
// ---------------------------------------------------------------------------
const svg16 = (body, cls = "") => `<svg class="ico ${cls}" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${body}</svg>`;
const r2 = (v) => Math.round(v * 100) / 100;
function gear(cx, cy, ro, ri, teeth, fill, hole) {
  const p = [];
  const N = teeth * 4;
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * 2 * Math.PI;
    const rr = Math.floor(i / 2) % 2 ? ri : ro;
    p.push(`${r2(cx + rr * Math.cos(a))} ${r2(cy + rr * Math.sin(a))}`);
  }
  return `<path d="M${p.join("L")}Z" fill="${fill}"/><circle cx="${cx}" cy="${cy}" r="${hole}" fill="#fff"/>`;
}
function wheel(cx, cy, r, colors) {
  const n = colors.length;
  let out = "";
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    out += `<path d="M${cx} ${cy}L${r2(cx + r * Math.cos(a0))} ${r2(cy + r * Math.sin(a0))}A${r} ${r} 0 0 1 ${r2(cx + r * Math.cos(a1))} ${r2(cy + r * Math.sin(a1))}Z" fill="${colors[i]}"/>`;
  }
  return out;
}
const INK = "#3d3d3d";
const BLUE = { top: "#7cc6ff", front: "#2b86e6", side: "#1a5cb0", line: "#174f98" };
const cubeArt = (x = 2.5, y = 5.2, w = 9, h = 8, d = 2.5) =>
  `<path d="M${x} ${y}h${w}v${h}h-${w}z" fill="${BLUE.front}"/>` +
  `<path d="M${x} ${y}l${d} -${d}h${w}l-${d} ${d}z" fill="${BLUE.top}"/>` +
  `<path d="M${x + w} ${y}l${d} -${d}v${h}l-${d} ${d}z" fill="${BLUE.side}"/>`;
const shadowArt = `<path d="M2.4 15h9.9l2.6-2.6" fill="none" stroke="#a3a3a3" stroke-width="1.3"/>`;
const sketchArt =
  `<rect x="2" y="2" width="10.6" height="10.6" fill="none" stroke="#6a6a6a" stroke-width="1.1"/>` +
  `<rect x=".7" y=".7" width="2.7" height="2.7" fill="#2f74e6"/><rect x="11.2" y=".7" width="2.7" height="2.7" fill="#2f74e6"/><rect x=".7" y="11.2" width="2.7" height="2.7" fill="#2f74e6"/>` +
  `<path d="M8.6 15.2l.5-2.5 4.8-4.8 2 2-4.8 4.8z" fill="#f39a1e" stroke="#9c5a00" stroke-width=".45"/>` +
  `<path d="M13.4 7.7l2.2 2.2" stroke="#e6392f" stroke-width="1.8"/><path d="M8.6 15.2l.36-1.8 1.44 1.44z" fill="#3a3a3a"/>`;
const eyeOn = (c = "#333") => `<path d="M.5 8C2.3 5 4.9 3.8 8 3.8S13.7 5 15.5 8C13.7 11 11.1 12.2 8 12.2S2.3 11 .5 8z" fill="${c}"/><circle cx="8" cy="8" r="2.85" fill="#fff"/><circle cx="8" cy="8" r="1.65" fill="${c}"/>`;

const G = {
  // ---- browser tree
  "br-chev-right": svg16(`<path d="M6.4 4.4L10 8l-3.6 3.6" fill="none" stroke="#474747" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`),
  "br-chev-down": svg16(`<path d="M4.4 6.4L8 10l3.6-3.6" fill="none" stroke="#474747" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`),
  "br-eye": svg16(eyeOn()),
  "br-eye-off": svg16(`<path d="M1.4 8C3 5.3 5.3 3.9 8 3.9s5 1.4 6.6 4.1C13 10.7 10.7 12.1 8 12.1S3 10.7 1.4 8z" fill="none" stroke="#707070" stroke-width="1"/><circle cx="8" cy="8" r="2.1" fill="none" stroke="#707070" stroke-width="1"/><path d="M3.1 2.6l9.8 10.8" stroke="#fff" stroke-width="2.4"/><path d="M3.1 2.6l9.8 10.8" stroke="#707070" stroke-width="1.05"/>`),
  "br-folder": svg16(`<path d="M.9 5.4V2.9h4.7l1.2 2.5" fill="none" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/><path d="M.9 5.4h14.2v8.3H.9z" fill="none" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`),
  "br-gear": svg16(gear(8, 8, 7.7, 5.7, 8, "#383838", 2.4)),
  "br-component": svg16(`<path d="M1.5 4.5L4.5 1.5h10l-3 3z" fill="#fbfbfb"/><path d="M11.5 4.5l3-3v10l-3 3z" fill="#bdbdbd"/><path d="M1.5 4.5h10v10h-10z" fill="#ececec"/><path d="M1.5 4.5h10v10M11.5 4.5l3-3" fill="none" stroke="#9a9a9a" stroke-width=".6"/><path d="M1.5 4.5L4.5 1.5h10v10l-3 3h-10z" fill="none" stroke="#454545" stroke-width="1.05" stroke-linejoin="round"/>`),
  "br-part": svg16(`<path d="M1.5 4.5L4.5 1.5h10l-3 3z" fill="#fbfbfb"/><path d="M11.5 4.5l3-3v10l-3 3z" fill="#b3b3b3"/><path d="M1.5 4.5h10v10h-10z" fill="#e3e3e3"/><path d="M1.5 4.5h10v10M11.5 4.5l3-3" fill="none" stroke="#9a9a9a" stroke-width=".6"/><path d="M1.5 4.5L4.5 1.5h10v10l-3 3h-10z" fill="none" stroke="#454545" stroke-width="1.05" stroke-linejoin="round"/>`),
  "br-units": svg16(`<path d="M3.5 1.5h6.1l2.9 2.9v7.4h-9z" fill="#eef2f8" stroke="#5c5c5c" stroke-width=".9" stroke-linejoin="round"/><path d="M9.6 1.5v2.9h2.9" fill="none" stroke="#5c5c5c" stroke-width=".9"/><path d="M4.5 6h6.5v4.8H4.5z" fill="#d4dff0"/><rect x="2" y="11.6" width="12" height="2.9" rx=".4" fill="#e3a117" stroke="#94650a" stroke-width=".7"/>`),
  "br-body": svg16(`<rect x="2.5" y="2.5" width="11" height="11" rx="2.6" fill="#e3e3e3" stroke="#4b4b4b" stroke-width="1"/><path d="M3.3 5.6c0-1.2.9-2.2 2.1-2.2h5.2c1.2 0 2.1 1 2.1 2.2v1.6H3.3z" fill="#f7f7f7"/>`),
  "br-sketch": svg16(sketchArt),
  "br-plane": svg16(`<path d="M1.5 12.5l3.4-8.6h9.6l-3.4 8.6z" fill="#f7d98b" stroke="#b07c10" stroke-width=".9" stroke-linejoin="round"/>`),
  "br-cplane": svg16(`<path d="M1.5 12.5l3.4-8.6h9.6l-3.4 8.6z" fill="#f8c66a" stroke="#a96d00" stroke-width=".9" stroke-linejoin="round"/><path d="M5.3 10.4l1.9-4.4h4.6" fill="none" stroke="#fff" stroke-width=".8" opacity=".8"/>`),
  "br-axis": svg16(`<path d="M2.6 13.4L13.4 2.6" stroke="#b07c10" stroke-width="1.7" stroke-linecap="round"/><circle cx="2.9" cy="13.1" r="1.4" fill="#f7d98b" stroke="#b07c10" stroke-width=".7"/>`),
  "br-point": svg16(`<circle cx="8" cy="8" r="3.2" fill="#f7d98b" stroke="#b07c10" stroke-width="1"/><circle cx="8" cy="8" r="1" fill="#b07c10"/>`),
  "br-view": svg16(`<rect x="1.5" y="4.6" width="9" height="7.2" rx="1" fill="#eceff3" stroke="#4b4b4b" stroke-width=".9"/><path d="M10.5 7l4-2.1v7.2l-4-2.1z" fill="#d6dbe1" stroke="#4b4b4b" stroke-width=".9" stroke-linejoin="round"/>`),
  "br-section": svg16(`<path d="M2 6.2l5-3h7v6.6l-5 3H2z" fill="#e7e9ec" stroke="#4b4b4b" stroke-width=".9" stroke-linejoin="round"/><path d="M2 6.2h7v6.6M9 6.2l5-3" fill="none" stroke="#4b4b4b" stroke-width=".9"/><path d="M5.6 4.1v8.7" stroke="#2f74e6" stroke-width="1.3"/><path d="M2.6 6.8h2.6v5.4H2.6z" fill="#b46fd1"/>`),
  "br-canvas": svg16(`<rect x="1.5" y="2.5" width="13" height="11" rx=".6" fill="#fff" stroke="#4b4b4b" stroke-width="1"/><path d="M2.6 12.4l3.5-4.3 2.5 2.7 1.8-1.8 3 3.4z" fill="#6aa84f"/><circle cx="11" cy="5.6" r="1.4" fill="#f2b705"/>`),
  "br-mesh": svg16(`<path d="M8 1.8l5.6 3.2v6.2L8 14.2l-5.6-3V5z" fill="#e3e3e3" stroke="#4b4b4b" stroke-width=".9" stroke-linejoin="round"/><path d="M2.4 5L8 8.2l5.6-3.2M8 8.2v6M2.4 11.2L8 8.2l5.6 3M8 1.8v6.4M2.4 5l5.6 9.2M13.6 5L8 14.2" fill="none" stroke="#858585" stroke-width=".55"/>`),
  "br-com": svg16(`<circle cx="8" cy="8" r="6" fill="#fff" stroke="#3d3d3d" stroke-width="1"/><path d="M8 2v6h6A6 6 0 0 0 8 2zM8 8v6a6 6 0 0 1-6-6z" fill="#3d3d3d"/>`),
  "br-radio": svg16(`<circle cx="8" cy="8" r="6.4" fill="#dfe6f0" stroke="#7a8597" stroke-width="1"/><circle cx="8" cy="8" r="4.9" fill="#f8fafd"/><circle cx="8" cy="8" r="2.7" fill="#111"/>`),
  "br-collapse": svg16(`<path d="M7.6 5.3v5.4L4.2 8zM12.1 5.3v5.4L8.7 8z" fill="#727272"/>`),
  "br-expand": svg16(`<path d="M4 5.3v5.4L7.4 8zM8.5 5.3v5.4L11.9 8z" fill="#727272"/>`),
  "br-minus": svg16(`<path d="M3 8h10" stroke="#474747" stroke-width="1.6"/>`),
  "br-plus": svg16(`<path d="M3 8h10M8 3v10" stroke="#474747" stroke-width="1.6"/>`),
  // ---- timeline controls
  first: svg16(`<path d="M2 2.4h2.4v11.2H2zM13.3 2.4v11.2L5 8z" fill="#444"/>`),
  prev: svg16(`<path d="M11.8 2.7v10.6L1.8 8z" fill="#444"/><path d="M12.4 5.6h2.5v4.8h-2.5z" fill="#444"/>`),
  play: svg16(`<path d="M2.8 1.1v13.8L14 8z" fill="#444"/>`),
  pause: svg16(`<path d="M3.2 1.8h3.2v12.4H3.2zM9.6 1.8h3.2v12.4H9.6z" fill="#444"/>`),
  next: svg16(`<path d="M1.9 5.6h2.5v4.8H1.9z" fill="#444"/><path d="M5 2.7v10.6L14.2 8z" fill="#444"/>`),
  last: svg16(`<path d="M2.9 2.4v11.2L11.2 8z" fill="#444"/><path d="M11.7 2.4h2.4v11.2h-2.4z" fill="#444"/>`),
  settings: svg16(`<g transform="rotate(15 8 8)">${gear(8, 8, 7.5, 5.5, 6, "#454545", 3)}</g>`),
  // ---- menu icons
  "m-move": svg16(`<path d="M8 2.2v11.6M2.2 8h11.6" stroke="#1f1f1f" stroke-width="1.4"/><path d="M8 .7l2.3 2.6H5.7zM8 15.3l2.3-2.6H5.7zM.7 8l2.6-2.3v4.6zM15.3 8l-2.6-2.3v4.6z" fill="#1f1f1f"/>`),
  "m-group": svg16(`<path d="M1.5 4.6h4.1l1.2 1.4h7.7v7.5h-13z" fill="#d6dee8" stroke="#46525e" stroke-width=".9" stroke-linejoin="round"/><path d="M1.5 8.2h13l-1.3 5.3H1.5z" fill="#43709c"/><rect x="2.1" y="1.2" width="3.4" height="3.1" fill="#f2a33a" stroke="#a5650d" stroke-width=".6"/>`),
  "m-selset": svg16(`<rect x="1.5" y="4.6" width="10.4" height="9" rx="1" fill="#45a53a" stroke="#2a7020" stroke-width=".8"/><path d="M2.7 5.8h8v2.2h-8z" fill="#7fcd70" opacity=".8"/><circle cx="12.4" cy="3.9" r="2.4" fill="#f5a12a" stroke="#bd5f14" stroke-width=".7"/>`),
  "m-configure": svg16(`<path d="M2.2 4.6c0-1.1.9-2 2-2h6.3v8.6H2.2z" fill="#f2f2f2" stroke="#5a5a5a" stroke-width=".9"/><path d="M8.6 12.4h5.6M12.3 10.6l1.9 1.8-1.9 1.8" fill="none" stroke="#2f7fd6" stroke-width="1.2"/><path d="M10.2 9.2V14" stroke="#2f7fd6" stroke-width="1.2"/>`),
  "m-material": svg16(`<circle cx="8" cy="8" r="6.4" fill="#fff" stroke="#2b2b2b" stroke-width="1.2"/><circle cx="8" cy="4.6" r="1.7" fill="#2b2b2b"/><circle cx="8" cy="11.4" r="1.7" fill="#2b2b2b"/><circle cx="4.6" cy="8" r="1.7" fill="#2b2b2b"/><circle cx="11.4" cy="8" r="1.7" fill="#2b2b2b"/>`),
  "m-appearance": svg16(wheel(8, 8, 6.8, ["#e8382f", "#f39a1e", "#f5d623", "#3cae49", "#2f74e6", "#8a3fc2"])),
  "m-texture": svg16(`<path d="M7 3.2l6-1.7v12.2l-6 1.7z" fill="#2b86e6" stroke="#1a5cb0" stroke-width=".6"/><path d="M5.2 5.2L2.2 8l3 2.8" fill="none" stroke="#2b2b2b" stroke-width="1.3"/>`),
  "m-delete": svg16(`<path d="M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8" stroke="#e5251e" stroke-width="2.5" stroke-linecap="round"/>`),
  "m-remove": svg16(`<circle cx="10.4" cy="8" r="3.3" fill="#2b86e6"/><path d="M2 8h5" stroke="#2b86e6" stroke-width="1.3"/><path d="M1.4 8l2.4-1.9v3.8z" fill="#2b86e6"/>`),
  "m-eye": svg16(eyeOn("#383838")),
  "m-isolate": svg16(`<rect x="1.5" y="1.5" width="5.6" height="5.6" fill="#fff" stroke="#333" stroke-width=".9"/><rect x="8.9" y="1.5" width="5.6" height="5.6" fill="#33ad4a" stroke="#1d7a30" stroke-width=".9"/><rect x="1.5" y="8.9" width="5.6" height="5.6" fill="#33ad4a" stroke="#1d7a30" stroke-width=".9"/><rect x="8.9" y="8.9" width="5.6" height="5.6" fill="#fff" stroke="#333" stroke-width=".9"/>`),
  "m-editfeature": svg16(cubeArt(1.5, 5, 8.5, 8.5, 2.3) + `<rect x="13.3" y="1.8" width="1.5" height="12.4" fill="#222"/>`),
  "m-editprofile": svg16(sketchArt),
  "m-roll": svg16(`<rect x="1" y="7.2" width="3.4" height="5" fill="#fff" stroke="#555" stroke-width=".8"/><rect x="8.8" y="7.2" width="6" height="5" fill="#2b86e6"/><path d="M3.2 1.3h5.6L7 3.4H5z" fill="#222"/><path d="M6 3.2v11.4" stroke="#222" stroke-width="1.3"/><path d="M1 14.6h14" stroke="#555" stroke-width=".8"/>`),
  "m-convert": svg16(`<rect x="1.5" y="1.8" width="13" height="9.4" fill="#f08a24" stroke="#b05a10" stroke-width=".8"/><path d="M8 9.4V4M5.6 6.3L8 3.9l2.4 2.4" fill="none" stroke="#fff" stroke-width="1.4"/><rect x="1.5" y="12.2" width="13" height="2.3" fill="#fff" stroke="#555" stroke-width=".7"/>`),
  "m-find": svg16(`<circle cx="6.6" cy="6.6" r="4.3" fill="#fff" stroke="#3d3d3d" stroke-width="1.3"/><path d="M9.8 9.8l4.4 4.4" stroke="#3d3d3d" stroke-width="1.8" stroke-linecap="round"/>`),
  // ---- misc
  check: svg16(`<path d="M3 8.3l3.1 3.1L13 4.6" fill="none" stroke="currentColor" stroke-width="1.6"/>`),
  lock: svg16(`<rect x="3.5" y="7" width="9" height="7" rx="1" fill="currentColor"/><path d="M5.5 7V5.2a2.5 2.5 0 015 0V7" fill="none" stroke="currentColor" stroke-width="1.4"/>`),
  warning: svg16(`<path d="M8 1.8l6.6 11.6H1.4z" fill="#f2b705" stroke="#9a6d00" stroke-width=".8"/><path d="M8 6v3.6" stroke="#2b2b2b" stroke-width="1.4"/><circle cx="8" cy="11.4" r=".8" fill="#2b2b2b"/>`),
  error: svg16(`<circle cx="8" cy="8" r="6.3" fill="#d9302c"/><path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" stroke="#fff" stroke-width="1.5"/>`),
  edit: svg16(`<path d="M3 11.2L10.6 3.6l1.8 1.8L4.8 13H3z" fill="#fff" stroke="#4f565e" stroke-width=".9"/><path d="M9.6 4.6l1.8 1.8" stroke="#4f565e" stroke-width=".9"/>`),
  "submenu-arrow": svg16(`<path d="M6 4.2v7.6L10.6 8z" fill="#2d2d2d"/>`),
};
// legacy names used by older call sites
const LEGACY = {
  eye: "br-eye", "eye-off": "br-eye-off", "caret-right": "br-chev-right", "caret-down": "br-chev-down", folder: "br-folder",
  body: "br-body", sketch: "br-sketch", plane: "br-plane", axis: "br-axis", point: "br-point", component: "br-component",
  namedview: "br-view", units: "br-units", radio: "br-radio", "chevrons-left": "br-collapse", "chevrons-right": "br-expand",
};

/** True for markup that draws something (not empty / not an empty <svg></svg>). */
const hasArt = (s) => typeof s === "string" && /<svg/i.test(s) && !/<svg[^>]*>\s*<\/svg>\s*$/i.test(s.trim());

/** Small glyph (16px box) as SVG markup. */
export function glyph(name, size = 16) {
  const key = G[name] ? name : LEGACY[name];
  let s = key ? G[key] : null;
  if (!s) {
    try { const u = uiIcon(name, { size: 16 }); if (hasArt(u)) s = u; } catch { s = null; }
  }
  if (!s) s = G["br-folder"];
  return size === 16 ? s : s.replace(/width="16" height="16"/, `width="${size}" height="${size}"`);
}

// Timeline feature icons (original, in the style of Fusion's small timeline icons).
const FEAT = {
  sketch: sketchArt,
  extrude: shadowArt + cubeArt(2.2, 4.4, 9.6, 9.6, 2.9),
  box: shadowArt + cubeArt(2.2, 4.4, 9.6, 9.6, 2.9),
  revolve: `<ellipse cx="7.6" cy="12.2" rx="5.4" ry="2" fill="${BLUE.side}"/><path d="M2.2 4.6h10.8v7.6H2.2z" fill="${BLUE.front}"/><ellipse cx="7.6" cy="4.6" rx="5.4" ry="2" fill="${BLUE.top}"/><path d="M12.6 1.6a3 3 0 0 1 1.6 4" fill="none" stroke="#2b2b2b" stroke-width="1"/><path d="M14.9 5.9l-.4-2-1.4 1.3z" fill="#2b2b2b"/>`,
  fillet: shadowArt + `<path d="M2.6 13.6V8.4a3.2 3.2 0 0 1 3.2-3.2h5.4v8.4z" fill="${BLUE.front}"/><path d="M5.8 5.2a3.2 3.2 0 0 0-3.2 3.2l2.6-2.6c.2-.4.4-.6.6-.6zM5.8 5.2l2.6-2.6h5.4l-2.6 2.6z" fill="${BLUE.top}"/><path d="M11.2 5.2l2.6-2.6v8.4l-2.6 2.6z" fill="${BLUE.side}"/><path d="M2.6 8.4a3.2 3.2 0 0 1 3.2-3.2" fill="none" stroke="#ffd34d" stroke-width="1.2"/>`,
  chamfer: shadowArt + `<path d="M2.6 13.6V7.8l2.6-2.6h6v8.4z" fill="${BLUE.front}"/><path d="M5.2 5.2l2.6-2.6h6l-2.6 2.6z" fill="${BLUE.top}"/><path d="M11.2 5.2l2.6-2.6v8.4l-2.6 2.6z" fill="${BLUE.side}"/><path d="M2.6 7.8l2.6-2.6" stroke="#ffd34d" stroke-width="1.3"/>`,
  hole: shadowArt + cubeArt(2.6, 5.4, 8.6, 8.2, 2.6) + `<ellipse cx="8.2" cy="4" rx="2.4" ry=".95" fill="#123a6e"/><path d="M5.8 4v5.2a2.4 1 0 0 0 4.8 0V4" fill="#0e2f5a" opacity=".55"/>`,
  shell: shadowArt + cubeArt(2.6, 5.4, 8.6, 8.2, 2.6) + `<path d="M4.6 4.4l1.2-1.1h6l-1.2 1.1z" fill="#0f3f7a"/>`,
  cylinder: `<ellipse cx="8" cy="12.3" rx="5.4" ry="2" fill="${BLUE.side}"/><path d="M2.6 4.3h10.8v8H2.6z" fill="${BLUE.front}"/><ellipse cx="8" cy="4.3" rx="5.4" ry="2" fill="${BLUE.top}"/>`,
  sphere: `<circle cx="8" cy="8" r="6.2" fill="${BLUE.front}"/><circle cx="6" cy="5.8" r="2.6" fill="${BLUE.top}" opacity=".85"/><path d="M8 14.2a6.2 6.2 0 0 0 6.2-6.2" fill="none" stroke="${BLUE.side}" stroke-width="1.6"/>`,
  torus: `<ellipse cx="8" cy="8.6" rx="6.6" ry="4.3" fill="${BLUE.front}"/><ellipse cx="8" cy="7.6" rx="6" ry="3.4" fill="${BLUE.top}" opacity=".7"/><ellipse cx="8" cy="8.1" rx="2.5" ry="1.3" fill="#fff"/>`,
  cplane: `<path d="M1.5 12.5l3.4-8.6h9.6l-3.4 8.6z" fill="#f8c66a" stroke="#a96d00" stroke-width=".9" stroke-linejoin="round"/>`,
  rpattern: `<rect x="1.5" y="1.5" width="5.5" height="5.5" fill="${BLUE.front}"/><rect x="9" y="1.5" width="5.5" height="5.5" fill="${BLUE.top}"/><rect x="1.5" y="9" width="5.5" height="5.5" fill="${BLUE.top}"/><rect x="9" y="9" width="5.5" height="5.5" fill="${BLUE.top}"/>`,
  cpattern: `<circle cx="8" cy="8" r="5" fill="none" stroke="#9a9a9a" stroke-width=".8" stroke-dasharray="1.4 1.2"/><circle cx="8" cy="3" r="2.2" fill="${BLUE.front}"/><circle cx="12.4" cy="10.6" r="2.2" fill="${BLUE.top}"/><circle cx="3.6" cy="10.6" r="2.2" fill="${BLUE.top}"/>`,
  mirror: `<path d="M8 1.2v13.6" stroke="#8a8a8a" stroke-width="1" stroke-dasharray="1.8 1.2"/><path d="M6.6 3.5L1.6 12.5h5z" fill="${BLUE.front}"/><path d="M9.4 3.5l5 9h-5z" fill="${BLUE.top}"/>`,
  move: `<path d="M8 2v12M2 8h12" stroke="${BLUE.side}" stroke-width="1.4"/><path d="M8 .8l2.2 2.5H5.8zM8 15.2l2.2-2.5H5.8zM.8 8l2.5-2.2v4.4zM15.2 8l-2.5-2.2v4.4z" fill="${BLUE.side}"/>`,
  combine: `<rect x="1.5" y="5" width="8" height="8" fill="${BLUE.front}"/><circle cx="10.4" cy="6.4" r="4.3" fill="${BLUE.top}" opacity=".9"/>`,
  loft: `<path d="M2.2 13.6h11.6L11 3H5z" fill="${BLUE.front}"/><path d="M5 3h6l-.9 2H5.9z" fill="${BLUE.top}"/>`,
  sweep: `<path d="M2.8 12.6c1.6-6 5.6-8.6 11-8.6" fill="none" stroke="${BLUE.front}" stroke-width="3.4" stroke-linecap="round"/><path d="M2.8 12.6c1.6-6 5.6-8.6 11-8.6" fill="none" stroke="${BLUE.top}" stroke-width="1.1" stroke-linecap="round"/>`,
  delete: cubeArt(2.6, 5.4, 8.6, 8.2, 2.6) + `<path d="M4.4 6.8l5 5M9.4 6.8l-5 5" stroke="#e5251e" stroke-width="1.8" stroke-linecap="round"/>`,
  draft: `<path d="M4.4 2.6h7.2l2 11H2.4z" fill="${BLUE.front}"/><path d="M4.4 2.6l-2 11" stroke="#ffd34d" stroke-width="1.3"/>`,
};

const featCache = new Map();
/** Feature icon (timeline items, ghost) as SVG markup. */
export function featureGlyph(type, size = 16) {
  const k = `${type}@${size}`;
  if (featCache.has(k)) return featCache.get(k);
  let out = null;
  if (FEAT[type]) out = svg16(FEAT[type]);
  else {
    try { const s = featureIcon(type, { size: 16 }); if (hasArt(s)) out = s; } catch { out = null; }
    if (!out) { try { if (hasIcon(type)) out = icon(type, { size: 16 }); } catch { out = null; } }
    if (!out) out = svg16(FEAT.extrude);
  }
  if (size !== 16) out = out.replace(/width="16" height="16"/, `width="${size}" height="${size}"`);
  featCache.set(k, out);
  return out;
}

// ---------------------------------------------------------------------------
// Context menu (Fusion style list menu)
// ---------------------------------------------------------------------------
// items: [{label, action(), disabled?, checked?, cmd?, act?, hint?, icon?, submenu?: items} | "-"]
let openMenu = null;
export function hideMenu() {
  if (!openMenu) return;
  const m = openMenu;
  openMenu = null;
  m.cleanup();
  for (const e of m.els) e.remove();
  if (m.onClose) { try { m.onClose(); } catch (e) { console.error(e); } }
}
export function menuOpen() { return !!openMenu; }

function cleanList(items) {
  const list = [];
  for (const it of items || []) {
    if (it === "-") { if (list.length && list[list.length - 1] !== "-") list.push(it); continue; }
    if (it && !it.hidden) list.push(it);
  }
  while (list.length && list[list.length - 1] === "-") list.pop();
  return list;
}

function buildMenu(app, list, cls, onPick, onSub) {
  const menu = el("div", { class: `br-ctx ${cls}`, role: "menu" });
  for (const it of list) {
    if (it === "-") { menu.appendChild(el("div", { class: "br-ctx-sep", role: "separator" })); continue; }
    const ico = it.icon ? (it.icon.startsWith("<") ? it.icon : glyph(it.icon)) : "";
    const row = el("div", {
      class: `br-ctx-item${it.disabled ? " disabled" : ""}${it.danger ? " danger" : ""}${ico ? " has-icon" : ""}${it.submenu ? " has-sub" : ""}`,
      role: "menuitem",
      "aria-disabled": it.disabled ? "true" : null,
      dataset: { cmd: it.cmd, action: it.act },
    },
    el("span", { class: "br-ctx-icon", html: it.checked ? glyph("check", 14) : ico }),
    el("span", { class: "br-ctx-label", text: it.label }),
    el("span", { class: "br-ctx-hint", text: it.hint || "" }),
    it.submenu ? el("span", { class: "br-ctx-arrow", html: glyph("submenu-arrow", 14) }) : null);
    // hover (and submenu opening) only once the pointer has moved inside the menu: like Qt, a menu
    // that pops up under a resting cursor shows no highlighted row
    row._enter = () => onSub(it.submenu && !it.disabled ? { it, row } : null);
    row.addEventListener("pointerenter", () => { if (menu.classList.contains("armed")) row._enter(); });
    if (!it.disabled && !it.submenu) {
      row.addEventListener("click", (ev) => { ev.stopPropagation(); onPick(it); });
    } else if (it.submenu && !it.disabled) {
      row.addEventListener("click", (ev) => { ev.stopPropagation(); onSub({ it, row, now: true }); });
    }
    menu.appendChild(row);
  }
  return menu;
}

function place(menu, x, y, opts) {
  const r = menu.getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  if (opts.above) y -= r.height;
  if (x + r.width > W - 2) x = opts.flipX != null ? opts.flipX - r.width : W - r.width - 2;
  // opts.overflowY: px the menu may run past the bottom edge before it is pushed up (Fusion's menus
  // stay anchored at the cursor and extend past the app window onto the screen below it)
  const maxBottom = opts.overflowY ? H + opts.overflowY : H - 2;
  if (y + r.height > maxBottom) y = maxBottom - r.height;
  menu.style.left = `${Math.max(2, Math.round(x))}px`;
  menu.style.top = `${Math.max(2, Math.round(y))}px`;
}

/**
 * Show a context menu at (clientX, clientY). opts: {className, above (open upwards from the
 * point), dx/dy (offset from the point), overflowY (see place), onClose}. Returns the menu element.
 */
export function showMenu(app, items, clientX, clientY, opts = {}) {
  hideMenu();
  hideTip();
  const host = app.dom.overlay || document.body;
  const list = cleanList(items);
  if (!list.length) return null;
  const cls = opts.className || "";
  const state = { sub: null, subFor: null, timer: 0 };
  const pick = (it) => {
    hideMenu();
    try { it.action && it.action(); } catch (e) { console.error(e); app.toast(String(e.message || e), "error"); }
  };
  const closeSub = () => {
    if (state.sub) { state.sub.remove(); openMenu && (openMenu.els = openMenu.els.filter((x) => x !== state.sub)); }
    if (state.subFor) state.subFor.classList.remove("open");
    state.sub = null; state.subFor = null;
  };
  const openSub = (s) => {
    clearTimeout(state.timer);
    if (!s) { state.timer = setTimeout(closeSub, 250); return; }
    if (state.subFor === s.row) return;
    const go = () => {
      closeSub();
      const sl = cleanList(s.it.submenu);
      if (!sl.length) return;
      const sm = buildMenu(app, sl, `${cls} br-ctx-sub armed`, pick, () => clearTimeout(state.timer));
      sm.addEventListener("pointerenter", () => clearTimeout(state.timer));
      host.appendChild(sm);
      const rr = s.row.getBoundingClientRect();
      place(sm, rr.right - 2, rr.top - 3, { flipX: rr.left + 2 });
      state.sub = sm;
      state.subFor = s.row;
      s.row.classList.add("open");
      if (openMenu) openMenu.els.push(sm);
    };
    if (s.now) go(); else state.timer = setTimeout(go, 120);
  };
  const menu = buildMenu(app, list, cls, pick, openSub);
  host.appendChild(menu);
  place(menu, clientX + (opts.dx || 0), clientY + (opts.dy || 0), opts);
  menu.addEventListener("pointermove", (ev) => {
    if (menu.classList.contains("armed") || Math.abs(ev.clientX - clientX) + Math.abs(ev.clientY - clientY) < 3) return;
    menu.classList.add("armed");
    const r = ev.target && ev.target.closest ? ev.target.closest(".br-ctx-item") : null;
    if (r && r._enter) r._enter();
  });
  const onDown = (ev) => { if (!openMenu || !openMenu.els.some((m) => m.contains(ev.target))) hideMenu(); };
  const onKey = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); ev.preventDefault(); hideMenu(); } };
  const onBlur = () => hideMenu();
  setTimeout(() => {
    if (openMenu && openMenu.el === menu) {
      window.addEventListener("pointerdown", onDown, true);
      window.addEventListener("wheel", onDown, true);
    }
  }, 0);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", onBlur);
  menu.addEventListener("contextmenu", (ev) => ev.preventDefault());
  openMenu = {
    el: menu,
    els: [menu],
    onClose: opts.onClose,
    cleanup() {
      clearTimeout(state.timer);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("wheel", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
    },
  };
  return menu;
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
let tipEl = null, tipTimer = 0;
export function showTip(app, html, clientX, clientY, opts = {}) {
  clearTimeout(tipTimer);
  const show = () => {
    if (openMenu) return;
    const host = app.dom.overlay || document.body;
    if (!tipEl) { tipEl = el("div", { class: "br-tip" }); }
    if (tipEl.parentNode !== host) host.appendChild(tipEl);
    tipEl.innerHTML = html;
    tipEl.style.display = "block";
    const r = tipEl.getBoundingClientRect();
    let x = clientX + 12, y = opts.above ? clientY - r.height - 10 : clientY + 18;
    if (x + r.width > window.innerWidth - 4) x = window.innerWidth - r.width - 4;
    if (y < 4) y = clientY + 18;
    if (y + r.height > window.innerHeight - 4) y = window.innerHeight - r.height - 4;
    tipEl.style.left = `${Math.max(4, x)}px`;
    tipEl.style.top = `${Math.max(4, y)}px`;
  };
  if (opts.delay === 0) show(); else tipTimer = setTimeout(show, opts.delay ?? 450);
}
export function hideTip() {
  clearTimeout(tipTimer);
  if (tipEl) tipEl.style.display = "none";
}

// ---------------------------------------------------------------------------
// Inline rename: replaces `target` content with an input. Enter commits, Esc cancels.
// ---------------------------------------------------------------------------
export function inlineEdit(target, value, onCommit, opts = {}) {
  const input = el("input", { class: `br-rename ${opts.className || ""}`, type: "text", spellcheck: "false" });
  input.value = value;
  const prev = [...target.childNodes];
  target.textContent = "";
  target.appendChild(input);
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    input.remove();
    for (const n of prev) target.appendChild(n);
    if (opts.onEnd) opts.onEnd();
    if (commit && v && v !== value) onCommit(v);
  };
  input.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
    else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
  });
  input.addEventListener("keyup", (ev) => ev.stopPropagation());
  input.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  input.addEventListener("click", (ev) => ev.stopPropagation());
  input.addEventListener("dblclick", (ev) => ev.stopPropagation());
  input.addEventListener("blur", () => finish(true));
  input.focus();
  input.select();
  requestAnimationFrame(() => { if (!done && document.activeElement !== input) { input.focus(); input.select(); } });
  return { input, cancel: () => finish(false) };
}

// ---------------------------------------------------------------------------
// Small modal confirm box (Fusion message-box style). Resolves true for OK.
// ---------------------------------------------------------------------------
export function confirmBox(app, { title = "Fusion", html = "", ok = "OK", cancel = "Cancel", danger = false } = {}) {
  return new Promise((resolve) => {
    const host = app.dom.overlay || document.body;
    const back = el("div", { class: "br-modal-back" });
    const box = el("div", { class: "br-modal", role: "dialog" },
      el("div", { class: "br-modal-title" }, el("span", { text: title })),
      el("div", { class: "br-modal-body" }, el("div", { class: "br-modal-icon", html: glyph("warning", 28) }), el("div", { class: "br-modal-msg", html })),
      el("div", { class: "br-modal-btns" },
        el("button", { class: `br-btn primary${danger ? " danger" : ""}`, dataset: { action: "ok" }, text: ok }),
        el("button", { class: "br-btn", dataset: { action: "cancel" }, text: cancel })));
    back.appendChild(box);
    host.appendChild(back);
    const close = (v) => {
      window.removeEventListener("keydown", onKey, true);
      back.remove();
      resolve(v);
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") { ev.stopPropagation(); ev.preventDefault(); close(false); }
      else if (ev.key === "Enter") { ev.stopPropagation(); ev.preventDefault(); close(true); }
    };
    window.addEventListener("keydown", onKey, true);
    box.querySelector('[data-action="ok"]').addEventListener("click", () => close(true));
    box.querySelector('[data-action="cancel"]').addEventListener("click", () => close(false));
    back.addEventListener("pointerdown", (ev) => { if (ev.target === back) ev.preventDefault(); });
    requestAnimationFrame(() => box.querySelector('[data-action="ok"]').focus());
  });
}

/** Human readable feature error (the kernel sometimes throws non-Error objects). */
export function friendlyError(msg) {
  const m = String(msg ?? "").trim();
  if (!m || m.startsWith("[object ") || /^\d+$/.test(m) || /wasm|WebAssembly|table index|unreachable|memory access/i.test(m)) return "The geometry kernel could not compute this feature. Try different values or references.";
  return m;
}

/** Run a registered command if it exists (and is not a stub), else call fallback / toast. */
export function runCmd(app, ids, ctx = {}, fallback = null, label = "") {
  for (const id of [].concat(ids)) {
    const d = app.commands.get(id);
    if (d && !d.stub) { app.commands.run(id, ctx); return true; }
  }
  if (fallback) { fallback(); return true; }
  app.toast(`${label || [].concat(ids)[0]} is not available in this recreation`, "info");
  return false;
}

/** A Fusion command that this recreation does not implement: a toast naming it. */
export function notAvailable(app, label) {
  app.toast(`${label} is not available in this recreation`, "info");
}
