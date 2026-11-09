// Sketch Dimension tool (D), in-place dimension editing, dragging dimension text,
// and selection/hover wiring of dimension labels and constraint glyphs.
import { ST, vp, activeData, mutateSketch, params, cursorOnPlane, projector, mmPerPx, refKey, onLocal, evalExpr, fmtLen, fmtAng } from "./ctx.js";
import { Tool, addDim } from "./tools.js";
import { setDimPreview, dimGeom, dimElement, updateOverlay } from "./render.js";
import { normalizeExpr } from "./hud.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const P2 = (sk, id) => [sk.points[id].x, sk.points[id].y];

function entType(sk, r) {
  if (!r) return null;
  if (r.kind === "sketchPoint") return "point";
  const cv = sk.curves[r.curve];
  if (!cv) return null;
  if (cv.type === "point") return "point";
  return cv.type; // line | circle | arc
}
const pointId = (sk, r) => (r.kind === "sketchPoint" ? r.point : sk.curves[r.curve].p);

function placementType(A, B, L) {
  const minx = Math.min(A[0], B[0]), maxx = Math.max(A[0], B[0]), miny = Math.min(A[1], B[1]), maxy = Math.max(A[1], B[1]);
  const dx = maxx - minx, dy = maxy - miny;
  const tol = Math.max(dx, dy) * 1e-6 + 1e-9;
  if (dx < tol || dy < tol) return "aligned";
  const inX = L[0] >= minx && L[0] <= maxx, inY = L[1] >= miny && L[1] <= maxy;
  if (inY && !inX) return "vertical";
  if (inX && !inY) return "horizontal";
  return "aligned";
}

/** Build a temporary dimension constraint from picked entities and the cursor position L. */
export function buildDim(sk, sel, L) {
  const S = ST.app.S;
  const t = sel.map((r) => entType(sk, r));
  let c = null;
  if (sel.length === 1) {
    if (t[0] === "line") {
      const cv = sk.curves[sel[0].curve];
      c = { type: "distance", refs: [sel[0].curve], dimType: placementType(P2(sk, cv.p1), P2(sk, cv.p2), L) };
    } else if (t[0] === "circle") c = { type: "diameter", refs: [sel[0].curve] };
    else if (t[0] === "arc") c = { type: "radius", refs: [sel[0].curve] };
    else return null;
  } else if (sel.length === 2) {
    const [r0, r1] = sel;
    const ptOf = (r, ty) => (ty === "point" ? pointId(sk, r) : ty === "circle" || ty === "arc" ? sk.curves[r.curve].c : null);
    if ((t[0] === "point" || t[0] === "circle" || t[0] === "arc") && (t[1] === "point" || t[1] === "circle" || t[1] === "arc")) {
      const a = ptOf(r0, t[0]), b = ptOf(r1, t[1]);
      if (!a || !b || a === b) return null;
      c = { type: "distance", refs: [a, b], dimType: placementType(P2(sk, a), P2(sk, b), L) };
    } else if (t[0] === "line" && t[1] === "line") {
      const l1 = sk.curves[r0.curve], l2 = sk.curves[r1.curve];
      const u = sub(P2(sk, l1.p2), P2(sk, l1.p1)), w = sub(P2(sk, l2.p2), P2(sk, l2.p1));
      const cr = (u[0] * w[1] - u[1] * w[0]) / ((Math.hypot(...u) * Math.hypot(...w)) || 1);
      if (Math.abs(cr) < 1e-6) c = { type: "pointLine", refs: [l2.p1, r0.curve] };
      else {
        // pick the sector containing the cursor
        const a = P2(sk, l1.p1), b = P2(sk, l1.p2), d = P2(sk, l2.p1), e = P2(sk, l2.p2);
        const den = (a[0] - b[0]) * (d[1] - e[1]) - (a[1] - b[1]) * (d[0] - e[0]);
        const tt = ((a[0] - d[0]) * (d[1] - e[1]) - (a[1] - d[1]) * (d[0] - e[0])) / den;
        const X = [a[0] + tt * (b[0] - a[0]), a[1] + tt * (b[1] - a[1])];
        const v = sub(L, X);
        c = { type: "angle", refs: [r0.curve, r1.curve], flip1: dot(u, v) < 0, flip2: dot(w, v) < 0 };
      }
    } else {
      const li = t[0] === "line" ? 0 : t[1] === "line" ? 1 : -1;
      if (li < 0) return null;
      const other = sel[1 - li], ot = t[1 - li];
      const p = ptOf(other, ot);
      if (!p) return null;
      c = { type: "pointLine", refs: [p, sel[li].curve] };
    }
  } else return null;
  c.id = "__dimpreview";
  // label offset relative to the dimension anchor
  const d = activeData();
  const ps = mmPerPx(d.plane, L);
  const g = dimGeom(sk, { ...c, at: undefined }, ps);
  if (g.anchor) c.at = sub(L, g.anchor);
  void S;
  return c;
}

export class DimensionTool extends Tool {
  constructor() { super("SketchDimension", "Sketch Dimension"); this.sel = []; this.editing = null; }
  prompt() { return this.editing ? "" : this.sel.length ? "Select additional sketch geometry or location for dimension" : "Select sketch geometry to dimension"; }
  begin() {
    const A = ST.app;
    // pre-selected geometry
    const pre = A.selection.items.filter((r) => (r.kind === "sketchCurve" || r.kind === "sketchPoint") && r.sketch === ST.sketchId);
    if (pre.length && pre.length <= 2) this.sel = pre.slice(0, 2);
    A.selection.clear();
  }
  reset() { this.sel = []; this.cancelEdit(); setDimPreview(null); this.refreshPrompt(); }
  end() { this.cancelEdit(); setDimPreview(null); }
  filter(r) { return !!r && r.sketch === ST.sketchId && (r.kind === "sketchPoint" || r.kind === "sketchCurve"); }
  pickEnt(ctx) { const h = vp().pick(ctx.x, ctx.y, { filter: (r) => this.filter(r) }); return h ? h.ref : null; }
  move(ctx) {
    if (this.editing) return;
    const A = ST.app;
    const d = activeData();
    if (!d) return;
    const ent = this.pickEnt(ctx);
    A.selection.setHover(ent);
    const hit = cursorOnPlane(ctx.x, ctx.y, d.plane);
    if (!hit) return;
    this.L = hit.uv;
    const c = this.sel.length ? buildDim(d.sk, this.sel, hit.uv) : null;
    setDimPreview(c);
  }
  click(ctx) {
    if (this.editing) { this.commitEdit(); return; }
    const A = ST.app;
    const d = activeData();
    if (!d) return;
    const ent = this.pickEnt(ctx);
    const hit = cursorOnPlane(ctx.x, ctx.y, d.plane);
    if (!hit) return;
    if (ent && this.sel.length < 2 && !this.sel.some((s) => refKey(s) === refKey(ent))) {
      const next = [...this.sel, ent];
      const t = next.map((r) => entType(d.sk, r));
      const valid = next.length === 1 || buildDim(d.sk, next, hit.uv);
      if (valid) {
        this.sel = next;
        A.selection.set(this.sel);
        this.refreshPrompt();
        this.move(ctx);
        void t;
        return;
      }
    }
    const c = buildDim(d.sk, this.sel, hit.uv);
    if (!c) return;
    // Fusion warns right at placement when the dimension would over-constrain the sketch and
    // offers a driven dimension instead: create it driven straight away (no modal dialogs here)
    if (wouldOverConstrain(d.sk, c)) {
      commitDimension(c, null);
      this.sel = [];
      ST.app.selection.clear();
      setDimPreview(null);
      this.refreshPrompt();
      return;
    }
    this.beginEdit(c);
  }
  beginEdit(c) {
    const d = activeData();
    const S = ST.app.S;
    const value = S.measureDim(d.sk, c);
    this.editing = { c, value };
    setDimPreview({ ...c, hideLabel: true });
    const kind = c.type === "angle" ? "angle" : "length";
    const ps = mmPerPx(d.plane, this.L || [0, 0]);
    const g = dimGeom(d.sk, c, ps);
    const s = projector(d.plane)(g.text[0], g.text[1]);
    const el = makeEditor(s, kind === "angle" ? fmtAng(value) : fmtLen(value), kind, {
      onEnter: (text) => this.commitEdit(text),
      onCancel: () => this.reset(),
    });
    this.editing.el = el;
    this.refreshPrompt();
  }
  cancelEdit() {
    if (this.editing && this.editing.el) this.editing.el.remove();
    this.editing = null;
  }
  commitEdit(text) {
    const ed = this.editing;
    if (!ed) return;
    const c = ed.c;
    const kind = c.type === "angle" ? "angle" : "length";
    const raw = text !== undefined ? text : ed.el.querySelector("input").value;
    const r = evalExpr(raw, kind);
    if (r.error || (kind === "length" && r.value <= 0)) { ed.el.querySelector("input").classList.add("err"); return; }
    const expr = normalizeExpr(raw, kind);
    const ok = commitDimension(c, expr);
    if (ok === null) return;
    this.cancelEdit();
    this.sel = [];
    ST.app.selection.clear();
    setDimPreview(null);
    this.refreshPrompt();
  }
  key(ev) {
    if (ev.key === "Enter" && this.editing) { this.commitEdit(); return true; }
    return false;
  }
  escape() {
    if (this.editing || this.sel.length) { this.reset(); ST.app.selection.clear(); return; }
    super.escape();
  }
}

/** True when a driving dimension at its current value would over-constrain (or conflict). */
export function wouldOverConstrain(sk, c) {
  const S = ST.app.S;
  let v;
  try { v = S.measureDim(sk, c); } catch { return false; }
  if (!Number.isFinite(v)) return false;
  const expr = c.type === "angle" ? `${v} deg` : `${v} mm`;
  const test = { ...c, id: "__dimtest", expr, driven: false };
  delete test.hideLabel;
  try { return !S.tryConstraints(sk, params(), [test]).ok; } catch { return false; }
}

/** Add a dimension (driving, or driven when it would over-constrain). Returns the new constraint id. */
export function commitDimension(c, expr) {
  const A = ST.app;
  const S = A.S;
  const d = activeData();
  if (!d) return null;
  const test = { ...c, id: "__dimtest", expr, driven: false };
  delete test.hideLabel;
  let res;
  if (expr === null) res = { ok: false };
  else { try { res = S.tryConstraints(d.sk, params(), [test]); } catch (e) { res = { ok: false }; console.error(e); } }
  const driven = !res.ok;
  if (driven) A.toast("This dimension would over-constrain the sketch, so it was added as a driven dimension.", "warning", 3600);
  const extra = { dimType: c.dimType, at: c.at, flip1: c.flip1, flip2: c.flip2 };
  for (const k of Object.keys(extra)) if (extra[k] === undefined) delete extra[k];
  return mutateSketch("Sketch Dimension", (sk, f, doc) => {
    if (driven) return S.addConstraint(sk, c.type, c.refs, { ...extra, driven: true }).id;
    return addDim(sk, doc, c.type, c.refs, expr, extra).id;
  });
}

/** Floating value editor at screen point s. */
function makeEditor(s, value, kind, { onEnter, onCancel }) {
  const wrap = document.createElement("div");
  wrap.className = "sk-hud sk-dim-edit";
  wrap.style.left = `${s[0]}px`;
  wrap.style.top = `${s[1]}px`;
  const input = document.createElement("input");
  input.className = "sk-input";
  input.type = "text";
  input.spellcheck = false;
  input.dataset.input = "dimension";
  input.value = value;
  wrap.appendChild(input);
  ST.overlay.appendChild(wrap);
  let done = false;
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); if (!done) onEnter(input.value); }
    else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); done = true; onCancel(); }
    else if (ev.key === "Tab") { ev.preventDefault(); }
  });
  input.addEventListener("input", () => {
    const r = evalExpr(input.value, kind);
    input.classList.toggle("err", !!r.error || (kind === "length" && r.value <= 0));
  });
  input.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  setTimeout(() => { try { input.focus({ preventScroll: true }); input.select(); } catch { /* ignore */ } }, 0);
  return wrap;
}

// ---------------------------------------------------------------------------
// editing an existing dimension (double-click)
// ---------------------------------------------------------------------------
let EDIT = null;
export function editDimension(cid) {
  const A = ST.app;
  const d = activeData();
  if (!d) return;
  const c = d.sk.constraints.find((x) => x.id === cid);
  if (!c) return;
  if (c.driven) { A.toast("Driven dimensions show a measured value and cannot be edited.", "info", 2400); return; }
  closeEdit();
  const el = dimElement(cid);
  const cr = vp().canvas.getBoundingClientRect();
  let s;
  if (el) { const r = el.getBoundingClientRect(); s = [r.left - cr.left + r.width / 2, r.top - cr.top + r.height / 2]; }
  else s = [cr.width / 2, cr.height / 2];
  const kind = c.type === "angle" ? "angle" : "length";
  if (el) el.style.visibility = "hidden";
  const wrap = makeEditor(s, c.expr || "", kind, {
    onEnter: (text) => {
      const r = evalExpr(text, kind);
      if (r.error || (kind === "length" && r.value <= 0)) { wrap.querySelector("input").classList.add("err"); return; }
      const expr = normalizeExpr(text, kind);
      if (expr !== c.expr) {
        // refuse values the sketch cannot satisfy
        const S = A.S;
        const test = S.cloneSketch(d.sk);
        const tc = test.constraints.find((x) => x.id === cid);
        tc.expr = expr;
        const st = S.solve(test, params());
        if (!st.ok) { A.toast("The sketch cannot be solved with this value.", "error", 2600); wrap.querySelector("input").classList.add("err"); return; }
        mutateSketch("Edit Dimension", (sk) => { const k = sk.constraints.find((x) => x.id === cid); if (k) k.expr = expr; });
      }
      closeEdit();
    },
    onCancel: () => closeEdit(),
  });
  const onDown = (ev) => { if (!wrap.contains(ev.target)) closeEdit(); };
  setTimeout(() => window.addEventListener("pointerdown", onDown, true), 0);
  EDIT = { wrap, el, onDown, cid };
}
export function closeEdit() {
  if (!EDIT) return;
  EDIT.wrap.remove();
  if (EDIT.el) EDIT.el.style.visibility = "";
  window.removeEventListener("pointerdown", EDIT.onDown, true);
  EDIT = null;
}
export const editingDimension = () => (EDIT ? EDIT.cid : null);

// ---------------------------------------------------------------------------
// label + glyph interaction
// ---------------------------------------------------------------------------
export function initDimension() {
  onLocal((type, det) => {
    if (type === "dim-el") wireDim(det.el, det.c);
    else if (type === "glyph-el") wireGlyph(det.el, det.c);
  });
}

function wireDim(el, c) {
  const A = ST.app;
  const ref = () => ({ kind: "sketchDim", sketch: ST.sketchId, cid: c.id });
  el.addEventListener("pointerenter", () => { if (!ST.tool) A.selection.setHover(ref()); });
  el.addEventListener("pointerleave", () => { if (A.selection.hover && A.selection.hover.cid === c.id) A.selection.setHover(null); });
  el.addEventListener("dblclick", (ev) => { ev.preventDefault(); ev.stopPropagation(); editDimension(c.id); });
  el.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.shiftKey || ev.ctrlKey) A.selection.toggle(ref()); else A.selection.set([ref()]);
    const d = activeData();
    if (!d) return;
    const cr = vp().canvas.getBoundingClientRect();
    const start = [ev.clientX, ev.clientY];
    let moved = false;
    const anchor = (() => { try { return dimGeom(d.sk, { ...c, at: undefined }, mmPerPx(d.plane, [0, 0])).anchor; } catch { return null; } })();
    const onMove = (e) => {
      if (!anchor) return;
      if (!moved && Math.hypot(e.clientX - start[0], e.clientY - start[1]) < 3) return;
      moved = true;
      const hit = cursorOnPlane(e.clientX - cr.left, e.clientY - cr.top, d.plane);
      if (!hit) return;
      ST.dimAt[c.id] = sub(hit.uv, anchor);
      updateOverlay();
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      const at = ST.dimAt[c.id];
      if (moved && at) {
        mutateSketch("Move Dimension", (sk) => { const k = sk.constraints.find((x) => x.id === c.id); if (k) k.at = at; });
      }
      delete ST.dimAt[c.id];
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
  });
}

function wireGlyph(el, c) {
  const A = ST.app;
  const ref = () => ({ kind: "sketchConstraint", sketch: ST.sketchId, cid: c.id });
  el.addEventListener("pointerenter", () => { if (!ST.tool) A.selection.setHover(ref()); });
  el.addEventListener("pointerleave", () => { if (A.selection.hover && A.selection.hover.cid === c.id) A.selection.setHover(null); });
  el.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.shiftKey || ev.ctrlKey) A.selection.toggle(ref()); else A.selection.set([ref()]);
  });
}
