// insertx helpers shared by the parts of the module: file pickers, design file parsing, small DOM and maths helpers.

export const FILE_ERROR = "This file is not a design exported from this app";
export const DESIGN_FORMAT = "fusion-recreation-design";

export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clone = (o) => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
export const baseName = (file) => String(file || "").replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]+$/i, "") || "Design";

/**
 * A hidden <input type=file data-input=<id>> kept in the document (one per id). pick() opens the system file dialog
 * and resolves with the chosen File (tests set the file on the input directly: the change event does the rest).
 */
export function fileInput(id, accept, onFile) {
  let input = document.querySelector(`input[type=file][data-input="${id}"]`);
  if (!input) {
    input = document.createElement("input");
    input.type = "file";
    input.setAttribute("data-input", id);
    input.style.display = "none";
    document.body.appendChild(input);
  }
  if (accept) input.accept = accept;
  input.onchange = () => {
    const file = input.files && input.files[0];
    input.value = "";
    if (file) onFile(file);
  };
  return input;
}

/** Parse the text of a design file (the app's own JSON export, with or without the wrapper). Throws FILE_ERROR. */
export function parseDesign(app, text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(FILE_ERROR); }
  const d = parsed && parsed.doc && typeof parsed.doc === "object" ? parsed.doc : parsed;
  if (!d || !Array.isArray(d.features) || typeof d.marker !== "number") throw new Error(FILE_ERROR);
  const doc = clone(d);
  doc.version = doc.version || 1;
  doc.name = doc.name || "Untitled";
  doc.units = doc.units || "mm";
  doc.params = doc.params || [];
  doc.bodies = doc.bodies || {};
  doc.counters = doc.counters || {};
  doc.origin = doc.origin || { visible: false };
  try { if (app.M.migrateDoc) app.M.migrateDoc(doc); } catch (e) { console.warn("insertx: migrate", e); }
  return { doc, savedAt: (parsed && parsed.savedAt) || 0 };
}

/** The wrapper that File > Open reads. */
export function designJson(doc) {
  return JSON.stringify({ format: DESIGN_FORMAT, version: 1, savedAt: Date.now(), doc });
}

export function readText(file) {
  if (file && typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("The file could not be read"));
    r.readAsText(file);
  });
}

export function readImage(file) {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error(`Cannot insert ${file && file.name ? file.name : "the file"}. It may be corrupt, damaged, or in an unsupported file format.`));
    if (!file) { fail(); return; }
    const r = new FileReader();
    r.onerror = fail;
    r.onload = () => {
      const data = String(r.result || "");
      const img = new Image();
      img.onload = () => (img.naturalWidth > 0 ? resolve({ data, name: file.name || "image", w: img.naturalWidth, h: img.naturalHeight }) : fail());
      img.onerror = fail;
      img.src = data;
    };
    r.readAsDataURL(file);
  });
}

// --- small vector helpers (arrays of 3 numbers) ---
export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
/** Two unit vectors perpendicular to n (stable choice). */
export function basisOf(n) {
  const a = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const x = V.norm(V.cross(a, n));
  const y = V.cross(n, x);
  return { x, y };
}
/** Rigid transform (12 numbers, row-major 3x4) from a frame. */
export const frameT = (o, x, y, z) => [x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2]];
export const applyT = (T, p) => [
  T[0] * p[0] + T[1] * p[1] + T[2] * p[2] + T[3],
  T[4] * p[0] + T[5] * p[1] + T[6] * p[2] + T[7],
  T[8] * p[0] + T[9] * p[1] + T[10] * p[2] + T[11],
];
export const isIdentity = (T) => !T || (T[0] === 1 && T[5] === 1 && T[10] === 1 && !T[1] && !T[2] && !T[3] && !T[4] && !T[6] && !T[7] && !T[8] && !T[9] && !T[11]);

/** A THREE.BufferGeometry from a kernel mesh ({vertices, normals, triangles}). */
export function geometryOf(THREE, mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
  if (mesh.normals) g.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
  return g;
}

// --- dialog rows (custom rows of the dialog framework) ---
function rowShell(cls, label, tip) {
  const row = document.createElement("div");
  row.className = `dlg-row ${cls}`;
  const lab = document.createElement("div");
  lab.className = "dlg-label";
  lab.textContent = label;
  if (tip) lab.title = tip;
  const ctl = document.createElement("div");
  ctl.className = "dlg-ctl";
  row.append(lab, ctl);
  return { row, ctl };
}

/**
 * A labelled list of check boxes. dlg.values[id] holds the checked keys (array).
 * items(dlg) -> [{key, label, head?}] (head: a group heading, not checkable).
 */
export function checkListRow(id, label, items, opts = {}) {
  const sigOf = (list) => list.map((i) => `${i.head ? "#" : ""}${i.key}:${i.label}`).join("|");
  function fill(ctl, dlg) {
    const list = items(dlg) || [];
    ctl.dataset.sig = sigOf(list);
    ctl.textContent = "";
    const cur = new Set(dlg.values[id] || []);
    if (!list.length) {
      const e = document.createElement("div");
      e.className = "ix-list-empty";
      e.textContent = opts.empty || "Nothing to choose";
      ctl.append(e);
    }
    for (const it of list) {
      if (it.head) {
        const h = document.createElement("div");
        h.className = "ix-list-head";
        h.textContent = it.label;
        ctl.append(h);
        continue;
      }
      const l = document.createElement("label");
      l.className = "ix-list-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.key = it.key;
      cb.checked = cur.has(it.key);
      cb.addEventListener("change", () => {
        const s = new Set(dlg.values[id] || []);
        if (cb.checked) s.add(it.key); else s.delete(it.key);
        dlg.values[id] = [...s];
        if (opts.onChange) opts.onChange(dlg);
        dlg.refresh();
      });
      const t = document.createElement("span");
      t.textContent = it.label;
      l.append(cb, t);
      ctl.append(l);
    }
  }
  return {
    id, type: "custom", visible: opts.visible,
    render(dlg) {
      const { row, ctl } = rowShell("ix-list-row", label, opts.tooltip);
      ctl.classList.add("ix-list");
      ctl.dataset.list = id;
      fill(ctl, dlg);
      return row;
    },
    update(el, dlg) {
      const ctl = el.querySelector(".ix-list");
      if (!ctl) return;
      if (ctl.dataset.sig !== sigOf(items(dlg) || [])) { fill(ctl, dlg); return; }
      const cur = new Set(dlg.values[id] || []);
      for (const cb of ctl.querySelectorAll("input[type=checkbox]")) cb.checked = cur.has(cb.dataset.key);
    },
  };
}

/** A labelled slider. dlg.values[id] holds the number; onInput(value, dlg) runs on every move. */
export function rangeRow(id, label, min, max, step, onInput, opts = {}) {
  return {
    id, type: "custom", visible: opts.visible,
    render(dlg) {
      const { row, ctl } = rowShell("ix-range-row", label, opts.tooltip);
      const inp = document.createElement("input");
      inp.type = "range";
      inp.min = String(min); inp.max = String(max); inp.step = String(step);
      inp.dataset.input = id;
      inp.value = String(dlg.values[id] ?? max);
      const out = document.createElement("span");
      out.className = "ix-range-out";
      const show = () => { out.textContent = `${Math.round(Number(inp.value))}${opts.unit || ""}`; };
      show();
      const on = () => { dlg.values[id] = Number(inp.value); show(); if (onInput) onInput(Number(inp.value), dlg); dlg.refresh(); };
      inp.addEventListener("input", on);
      inp.addEventListener("change", on);
      ctl.append(inp, out);
      return row;
    },
    update(el, dlg) {
      const inp = el.querySelector("input");
      const v = String(dlg.values[id] ?? max);
      if (inp && document.activeElement !== inp && inp.value !== v) { inp.value = v; el.querySelector(".ix-range-out").textContent = `${Math.round(Number(v))}${opts.unit || ""}`; }
    },
  };
}

/** A labelled read-only text line (custom row); text(dlg) -> string or html when opts.html. */
export function infoRow(id, label, text, opts = {}) {
  return {
    id, type: "custom", visible: opts.visible,
    render(dlg) {
      const { row, ctl } = rowShell("ix-info-row", label, opts.tooltip);
      ctl.classList.add("ix-info");
      ctl.dataset.info = id;
      if (opts.html) ctl.innerHTML = text(dlg); else ctl.textContent = text(dlg);
      return row;
    },
    update(el, dlg) {
      const ctl = el.querySelector(".ix-info");
      const t = text(dlg);
      if (!ctl) return;
      if (opts.html) { if (ctl.dataset.t !== t) { ctl.innerHTML = t; ctl.dataset.t = t; } } else if (ctl.textContent !== t) ctl.textContent = t;
    },
  };
}

/** A row with one push button; click(dlg) runs on press. */
export function buttonRow(id, label, caption, click, opts = {}) {
  return {
    id, type: "custom", visible: opts.visible,
    render(dlg) {
      const { row, ctl } = rowShell("ix-button-row", label, opts.tooltip);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ix-btn";
      b.dataset.input = id;
      b.textContent = typeof caption === "function" ? caption(dlg) : caption;
      b.addEventListener("click", () => click(dlg));
      ctl.append(b);
      return row;
    },
    update(el, dlg) { const b = el.querySelector("button"); if (b && typeof caption === "function") { const t = caption(dlg); if (b.textContent !== t) b.textContent = t; } },
  };
}
