// Small helpers shared by the menus module (DOM building, storage, downloads, labels).
import { icon as cmdIcon, uiIcon as glyph } from "../icons/icons.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** el("div", {class:"x", onclick: fn, dataset:{cmd:"Extrude"}}, child, "text") */
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k === "text") e.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k === "dataset") Object.assign(e.dataset, v);
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

export function iconHtml(id, size = 16) {
  try { return cmdIcon(id, { size }); } catch { return ""; }
}
export function glyphHtml(name, size = 16) {
  try { return glyph(name, { size }); } catch { return ""; }
}

// ---------------------------------------------------------------------------
// Storage: localStorage when available (wrapped in try/catch: the app may run in a
// sandboxed iframe), otherwise an in-memory map for this session.
// ---------------------------------------------------------------------------
const memory = new Map();
let lsOk = null;
function ls() {
  if (lsOk === false) return null;
  try {
    const s = window.localStorage;
    if (lsOk === null) {
      const k = "__fusion_rec_probe__";
      s.setItem(k, "1");
      s.removeItem(k);
      lsOk = true;
    }
    return s;
  } catch {
    lsOk = false;
    return null;
  }
}
export const store = {
  get persistent() { return !!ls(); },
  get(key) {
    const s = ls();
    try { if (s) return s.getItem(key); } catch { /* ignore */ }
    return memory.has(key) ? memory.get(key) : null;
  },
  getJSON(key, dflt = null) {
    const raw = this.get(key);
    if (raw == null) return dflt;
    try { return JSON.parse(raw); } catch { return dflt; }
  },
  /** Returns true on success; throws a friendly Error when storage is full. */
  set(key, value) {
    const s = ls();
    if (s) {
      try { s.setItem(key, value); return true; } catch (e) {
        if (e && (e.name === "QuotaExceededError" || /quota/i.test(e.message || ""))) throw new Error("Browser storage is full: delete some saved designs and try again");
      }
    }
    memory.set(key, value);
    return true;
  },
  setJSON(key, value) { return this.set(key, JSON.stringify(value)); },
  remove(key) {
    const s = ls();
    try { if (s) s.removeItem(key); } catch { /* ignore */ }
    memory.delete(key);
  },
};

/** Offer a Blob to the user (works inside the claude.ai artifact sandbox via app.download). */
export function download(blob, filename) {
  if (typeof window !== "undefined" && window.app && typeof window.app.download === "function") return window.app.download(filename, blob);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  try { a.click(); } finally {
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
}

export function safeFileName(name, fallback = "Untitled") {
  const s = String(name || "").replace(/[\\/:*?"<>|]+/g, "_").trim();
  return s || fallback;
}

export function fmtDate(t) {
  try {
    const d = new Date(t);
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return String(t); }
}

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** First shortcut of a command, formatted for display. */
export function shortcutOf(def) {
  if (!def || !def.shortcut) return "";
  const sc = Array.isArray(def.shortcut) ? def.shortcut : [def.shortcut];
  return sc.filter(Boolean).join(", ");
}

export const clone = (o) => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
