// Shared helpers for the shell module (application bar, toolbar, menus, tooltips).
import { COMMANDS } from "./spec.js";
import * as Icons from "../icons/icons.js";

/** Labels for application-level commands that live in the app bar menus (owned by other modules). */
export const APP_COMMANDS = {
  FileNew: ["New Design", "Creates a new, empty design.", "Ctrl+N"],
  FileOpen: ["Open...", "Opens a design saved in this browser, or a file from your computer.", "Ctrl+O"],
  FileSave: ["Save", "Saves the design in this browser.", "Ctrl+S"],
  FileSaveAs: ["Save As...", "Saves the design under a new name."],
  RecoverySave: ["Recovery Save", "Writes a recovery copy of the design.", "Ctrl+Shift+S"],
  FileExport: ["Export...", "Exports the design to another file format."],
  FileExportSTL: ["Export STL", "Exports the bodies as an STL mesh."],
  FileClose: ["Close", "Closes the active design."],
  SaveAsImageCommand: ["Capture Image...", "Saves the canvas as a PNG image."],
  Undo: ["Undo", "Reverses the last change.", "Ctrl+Z"],
  Redo: ["Redo", "Repeats the change you undid.", "Ctrl+Y"],
  KeyboardShortcuts: ["Keyboard Shortcuts", "Lists the keyboard shortcuts."],
  About: ["About", "About this recreation."],
  ToggleDataPanel: ["Data Panel", "Shows or hides the Data Panel.", "Ctrl+Alt+P"],
  ResetLayout: ["Reset to Default Layout", "Shows every panel again in its default place.", "Ctrl+Alt+R"],
  ToggleComments: ["Comments", "Shows or hides the Comments panel."],
  ToggleToolbar: ["Toolbar", "Shows or hides the toolbar."],
  ToggleBrowser: ["Browser", "Shows or hides the Browser.", "Ctrl+Alt+B"],
  ToggleViewCube: ["ViewCube", "Shows or hides the ViewCube.", "Ctrl+Alt+V"],
  ToggleNavBar: ["Navigation Bar", "Shows or hides the navigation bar.", "Ctrl+Alt+N"],
};

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Create an element: el("div", "cls", {attr: v}, children...) */
export function el(tag, cls, attrs, ...kids) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "html") e.innerHTML = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}

const safe = (fn, fallback) => { try { const r = fn(); return r || fallback; } catch { return fallback; } };

/** SVG markup for a command icon (icons module), never throws. */
export function cmdIcon(id, size = 32) {
  return safe(() => Icons.icon(id, { size }), `<svg width="${size}" height="${size}"></svg>`);
}
/** SVG markup for a small UI glyph from the icons module, or our own fallback glyph. */
export function glyph(name, size = 16) {
  if (OWN_GLYPHS[name]) return OWN_GLYPHS[name](size);
  return safe(() => Icons.uiIcon(name, { size }), `<svg width="${size}" height="${size}"></svg>`);
}

// Application-bar and menu glyphs that are not part of the icons contract. Original drawings: plain
// geometric shapes sized to match the positions/weights measured on Fusion screenshots.
const svg = (size, body, vb = 16) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const fsvg = (w, h, body, vbw = w, vbh = h) => `<svg class="ico" width="${w}" height="${h}" viewBox="0 0 ${vbw} ${vbh}" fill="currentColor" stroke="none">${body}</svg>`;
const OWN_GLYPHS = {
  // app bar, left block (filled, 14 px)
  "sh-home": () => fsvg(14, 14, `<path fill-rule="evenodd" d="M7 .4 0 6.5h1.9V14h3.8V9.6h2.6V14h3.8V6.5H14z"/>`),
  "sh-grid": () => fsvg(14, 14, [0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${c * 5.2}" y="${r * 5.2}" width="3.6" height="3.6" rx=".3"/>`).join("")).join("")),
  "sh-file": () => fsvg(13, 14, `<path d="M1 0h7.2v5.3H13V14H1z"/><path d="M9.3 0 13 4.2H9.3z"/>`),
  "sh-save": () => fsvg(14, 14, `<path fill-rule="evenodd" d="M0 0h11.2L14 2.8V14H0zM3.3 0v4.6h6.6V0zM2.4 8.1V14h9.2V8.1z"/><rect x="7.2" y=".9" width="1.7" height="2.8"/>`),
  "sh-undo": () => `<svg class="ico" width="12" height="9" viewBox="0 0 12 9" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 1.1 1.3 4.2l3.2 3.1"/><path d="M1.6 4.2h5.5a3.5 3.5 0 0 1 3.5 3.5v.3"/></svg>`,
  "sh-redo": () => `<svg class="ico" width="12" height="9" viewBox="0 0 12 9" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 1.1l3.2 3.1-3.2 3.1"/><path d="M10.4 4.2H4.9a3.5 3.5 0 0 0-3.5 3.5v.3"/></svg>`,
  // small solid carets (panel captions, DESIGN, File / Undo / Redo splits) and the submenu arrow
  "sh-caret": () => fsvg(6, 4, `<path d="M0 .2h6L3 3.8z"/>`),
  "sh-tri-down": () => fsvg(6, 4, `<path d="M0 0h6L3 3.6z"/>`),
  "sh-caret-ab": () => fsvg(7, 5, `<path d="M0 .3h7L3.5 4.5z"/>`),
  "sh-tri-right": () => fsvg(6, 9, `<path d="M0 0l6 4.5L0 9z"/>`),
  "sh-caret-right": (s) => svg(s, `<path d="M6.5 4.5 10 8l-3.5 3.5" stroke-width="1.4"/>`),
  "sh-caret-line": (s) => svg(s, `<path d="M4.5 6.5 8 10l3.5-3.5" stroke-width="1.4"/>`),
  "sh-close": () => `<svg class="ico" width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"><path d="M.8.8l7.4 7.4M8.2.8.8 8.2"/></svg>`,
  "sh-plus-sm": () => `<svg class="ico" width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 0v9M0 4.5h9"/></svg>`,
  "sh-plus": () => `<svg class="ico" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 .8v10.4M.8 6h10.4"/></svg>`,
  // app bar, right block (16 px)
  "sh-assist": () => `<svg class="ico" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => { const r0 = i % 2 ? 3.4 : 2.8, r1 = i % 2 ? 6.2 : 7.2; const c = Math.cos((a - 90) * Math.PI / 180), s = Math.sin((a - 90) * Math.PI / 180); return `<path d="M${(8 + c * r0).toFixed(2)} ${(8 + s * r0).toFixed(2)}L${(8 + c * r1).toFixed(2)} ${(8 + s * r1).toFixed(2)}"/>`; }).join("")}</svg>`,
  "sh-ext": () => `<svg class="ico" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M13.7 9.6A6 6 0 1 1 9.4 2.2"/><path d="M8.2 8.6l4.3-4.3"/><path d="M9.6 4.1h3.1v3.1"/></svg>`,
  "sh-job": () => `<svg class="ico" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8.4" r="7.2" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.1"/><circle cx="8" cy="8.4" r="5.6" fill="currentColor"/><path d="M8 5.1v3.5h2.6" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  "sh-bell": () => fsvg(13, 16, `<path d="M6.5 1.1c-.6 0-1 .4-1 .9v.5C3.4 3 2.1 4.8 2.1 7v3.6L.6 12.3v.9h11.8v-.9l-1.5-1.7V7c0-2.2-1.3-4-3.4-4.5V2c0-.5-.4-.9-1-.9z"/><path d="M4.7 14.1h3.6a1.8 1.8 0 0 1-3.6 0z"/>`),
  "sh-help": () => fsvg(16, 16, `<path fill-rule="evenodd" d="M8 .5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15zm-.1 3.2c-1.7 0-2.9 1-3 2.6h1.8c.1-.7.5-1.1 1.2-1.1.7 0 1.1.4 1.1 1 0 .5-.2.8-.8 1.2-.9.5-1.2 1.1-1.2 2v.5h1.8v-.4c0-.6.2-.9.9-1.3.8-.5 1.2-1.1 1.2-2 0-1.5-1.2-2.5-3-2.5zm-1.1 7.5v1.9h2v-1.9z"/>`),
  // document tab: orange isometric cube
  "sh-doc": () => `<svg class="ico" width="14" height="14" viewBox="0 0 14 14" stroke-linejoin="round" stroke-width="1.2"><path d="M7 1 12.6 4 7 7 1.4 4z" fill="#ffab68" stroke="#ffab68"/><path d="M1.4 4 7 7v6L1.4 10z" fill="#f4661a" stroke="#f4661a"/><path d="M12.6 4 7 7v6l5.6-3z" fill="#e2420c" stroke="#e2420c"/></svg>`,
  // Finish Sketch: big green disc with a white tick
  "sh-finish": () => `<svg class="ico" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#0b961f"/><path d="M8.6 16.6l5 4.9 9.9-10" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  "sh-bookmark": () => `<svg class="ico" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M4 1.6h8v12.8l-4-3.3-4 3.3z"/></svg>`,
  "sh-check": (s) => svg(s, `<path d="M3.5 8.3 6.6 11.3 12.5 4.8" stroke-width="1.5"/>`),
  "sh-folder": (s) => svg(s, `<path d="M1.8 4.2h4.4l1.3 1.4h6.7v7.6H1.8z"/>`),
  "sh-upload": (s) => svg(s, `<path d="M8 11V3.5M5 6.3 8 3.3l3 3"/><path d="M3 11.5v2h10v-2"/>`),
  "sh-comment": (s) => svg(s, `<path d="M2.5 3h11v7.5H7l-3 2.5v-2.5H2.5z"/>`),
  "sh-pin": (s) => svg(s, `<path d="M6 2.5h4l-.6 4 2.1 2.2H4.5L6.6 6.5z"/><path d="M8 8.7v4.8"/>`),
  "sh-collapse": (s) => svg(s, `<path d="M10 3.5 5.5 8l4.5 4.5"/>`),
  "sh-search": (s) => svg(s, `<circle cx="7" cy="7" r="4.3"/><path d="m10.2 10.2 3.3 3.3"/>`),
  "sh-more": (s) => svg(s, `<circle cx="8" cy="3.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="12.4" r="1.1" fill="currentColor" stroke="none"/>`),
};

/** Normalize a shortcut definition to a display string ("Ctrl+Z", "E"). */
export function shortcutText(sc) {
  if (!sc) return "";
  const s = Array.isArray(sc) ? sc[0] : sc;
  return s ? displayShortcut(String(s)) : "";
}
/** Fusion's menus abbreviate a few key names ("Del"). */
export const displayShortcut = (s) => String(s || "").replace(/\bDelete\b/, "Del").replace(/\bEscape\b/, "Esc");

/**
 * Everything the UI needs to show a command: label (Fusion's name from the spec wins), description,
 * shortcut, stub flag, enabled/checked state. Safe for ids that are not registered yet.
 */
export function cmdInfo(app, id) {
  const d = app.commands.get(id);
  const s = COMMANDS[id] || APP_COMMANDS[id];
  const label = (s && s[0]) || (d && d.label) || id;
  const real = d && !d.stub;
  const desc = (real && d.tooltip) || (s && s[1]) || (d && d.tooltip) || "";
  const shortcut = shortcutText(d && d.shortcut) || displayShortcut((s && s[2]) || (d && d.shortcutHint) || "");
  let enabled = false, checked = false;
  if (d) {
    enabled = app.commands.isEnabled(id);
    try { checked = !!(d.checked && d.checked(app)); } catch { checked = false; }
  }
  return { id, label, desc, shortcut, registered: !!d, stub: !d || !!d.stub, enabled, checked, def: d };
}

export const stubMessage = (label) => `${label} isn't available in this unofficial recreation yet`;

/** localStorage wrapped for sandboxed iframes. */
export const store = {
  get(key, fallback) {
    try { const v = window.localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

/** Coalesce many events into one call per animation frame. */
export function frameThrottle(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    const run = () => { queued = false; try { fn(); } catch (e) { console.error(e); } };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run); else setTimeout(run, 16);
  };
}
