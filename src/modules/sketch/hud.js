// Heads-up on-canvas value boxes (class sk-input) and the cursor prompt.
import { ST, evalExpr, fmtLen, fmtAng } from "./ctx.js";

const H = { fields: [], onEnter: null, onChange: null, prompt: null, promptText: "", avoid: null };

/** Cursor position (canvas px) the boxes keep clear of, so clicks never land on a box. */
export function hudAvoid(x, y) { H.avoid = [x, y]; }

// While drawing Fusion shows three decimals with the unit ("44.427 mm", "30.0 deg").
function fmt(kind, v) {
  if (!Number.isFinite(v)) return "";
  if (kind === "angle") return fmtAng(v);
  if (kind === "count") return String(Math.round(v));
  return ST.app.E.formatValue(v, "length", 3);
}
void fmtLen;

/** fields: [{id, kind:'length'|'angle'|'count', label?}]. Replaces any open boxes. */
export function hudShow(fields, { onEnter, onChange } = {}) {
  hudHide();
  const ov = ST.overlay;
  if (!ov) return;
  H.onEnter = onEnter || null;
  H.onChange = onChange || null;
  H.fields = fields.map((f, i) => {
    const wrap = document.createElement("div");
    wrap.className = "sk-hud";
    // focusable from the start (display:none would block focus); placed by hudSet()
    wrap.style.left = "-9999px";
    wrap.style.top = "-9999px";
    const input = document.createElement("input");
    input.className = "sk-input";
    input.type = "text";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.dataset.input = f.id;
    if (f.label) input.title = f.label;
    wrap.appendChild(input);
    ov.appendChild(wrap);
    const field = { ...f, wrap, input, dirty: false, value: NaN, index: i };
    input.addEventListener("input", () => {
      field.dirty = input.value.trim() !== "";
      validate(field);
      if (H.onChange) H.onChange(field.id);
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Tab") {
        ev.preventDefault();
        ev.stopPropagation();
        const n = H.fields.length;
        const j = (field.index + (ev.shiftKey ? n - 1 : 1)) % n;
        focusField(H.fields[j]);
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        if (H.onEnter) H.onEnter(field.id);
      }
    });
    input.addEventListener("focus", () => { for (const g of H.fields) g.input.classList.toggle("active", g === field); });
    input.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    return field;
  });
  if (H.fields.length) focusField(H.fields[0]);
}

function validate(field) {
  if (!field.dirty) { field.input.classList.remove("err"); return; }
  const r = evalExpr(field.input.value, field.kind);
  const bad = !!r.error || (field.kind !== "angle" && r.value <= 0) || (field.kind === "count" && (r.value < 3 || r.value > 64));
  field.input.classList.toggle("err", bad);
}

function focusField(f) {
  if (!f) return;
  try { f.input.focus({ preventScroll: true }); } catch { f.input.focus(); }
  if (!f.dirty) f.input.select();
}

export function hudFocus() {
  const act = H.fields.find((f) => f.input === document.activeElement) || H.fields[0];
  focusField(act);
}

export function hudHide() {
  for (const f of H.fields) f.wrap.remove();
  H.fields = [];
  H.onEnter = H.onChange = null;
}

export const hudOpen = () => H.fields.length > 0;

/**
 * Update a box: live value (ignored once the user typed) and screen position [x, y]: the text
 * starts at x (the box reaches 30 px further left) and the box is centred 4 px below y.
 */
export function hudSet(id, value, pos) {
  const f = H.fields.find((x) => x.id === id);
  if (!f) return;
  if (pos) {
    // boxes stay on their dimension lines like Fusion's (they never take pointer events, see style.css)
    let [x, y] = pos;
    y += 4;
    f.wrap.style.display = "";
    f.wrap.style.left = `${x}px`;
    f.wrap.style.top = `${y}px`;
  }
  if (!f.dirty && value !== undefined) {
    f.value = value;
    const t = fmt(f.kind, value);
    if (f.input.value !== t) {
      f.input.value = t;
      if (document.activeElement === f.input) f.input.select();
    }
  }
}

export function hudHideField(id) {
  const f = H.fields.find((x) => x.id === id);
  if (f) { f.wrap.style.left = "-9999px"; f.wrap.style.top = "-9999px"; }
}

/** {id: {dirty, text, value, ok}} — ok when the user typed a valid value. */
export function hudValues() {
  const out = {};
  for (const f of H.fields) {
    const r = f.dirty ? evalExpr(f.input.value, f.kind) : {};
    let ok = f.dirty && !r.error && Number.isFinite(r.value);
    if (ok && f.kind === "length" && r.value <= 1e-9) ok = false;
    if (ok && f.kind === "count" && (r.value < 3 || r.value > 64)) ok = false;
    out[f.id] = { dirty: f.dirty, text: f.input.value.trim(), value: ok ? r.value : f.value, ok, expr: ok ? normalizeExpr(f.input.value, f.kind) : null };
  }
  return out;
}

/** Plain numbers get the document unit appended ("25" -> "25 mm"). */
export function normalizeExpr(text, kind = "length") {
  const t = String(text).trim();
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return kind === "angle" ? `${t} deg` : kind === "count" ? t : `${t} mm`;
  return t;
}

// ---------- prompt near the cursor ----------
let wired = false;
function wireCanvas() {
  if (wired) return;
  const c = ST.app.viewport && ST.app.viewport.canvas;
  if (!c) return;
  wired = true;
  // the tooltip only shows while the cursor is over the canvas
  c.addEventListener("pointerleave", () => { if (H.prompt) H.prompt.style.visibility = "hidden"; });
  c.addEventListener("pointermove", (ev) => {
    if (!H.prompt) return;
    H.prompt.style.visibility = "";
    const r = c.getBoundingClientRect();
    promptMove(ev.clientX - r.left, ev.clientY - r.top);
  });
}
export function promptShow(text) {
  H.promptText = text || "";
  const ov = ST.overlay;
  if (!ov) return;
  wireCanvas();
  if (!H.prompt) {
    H.prompt = document.createElement("div");
    H.prompt.className = "sk-prompt";
    ov.appendChild(H.prompt);
  } else if (!H.prompt.parentNode) ov.appendChild(H.prompt);
  H.prompt.textContent = H.promptText;
  H.prompt.style.display = H.promptText ? "" : "none";
  if (H.at) promptMove(H.at[0], H.at[1]);
  else { H.prompt.style.left = "-9999px"; H.prompt.style.top = "-9999px"; }
}
export function promptMove(x, y) {
  H.at = [x, y];
  if (!H.prompt || !H.promptText) return;
  H.prompt.style.left = `${x + 28}px`;
  H.prompt.style.top = `${y + 28}px`;
}
export function promptHide() {
  H.promptText = "";
  if (H.prompt) H.prompt.style.display = "none";
}
