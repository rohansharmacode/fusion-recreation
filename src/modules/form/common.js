// Helpers shared by the FORM commands: the edited Form feature and its cages, selection rows for T-spline
// entities, and openFormDialog() (dialog framework + live preview of the changed Form feature + one undo step).
import { FORM } from "./feature.js";
import { isTsRef, TS_KINDS, roundP, V } from "./cage.js";

export const clone = (x) => JSON.parse(JSON.stringify(x));
export const formFeature = (app) => (FORM.editing ? app.feature(FORM.editing) : null);
export const editableCages = (app) => ((formFeature(app) || {}).bodies || []).filter((c) => c && !c.converted && c.f && c.f.length);
export const cageOf = (app, id) => editableCages(app).find((c) => c.id === id) || null;
export const isFormBody = (app, id) => !!cageOf(app, id);
/** Cage shown on the canvas right now (the dialog preview while previewing). */
export function shownCage(app, id) {
  const b = app.anyBody(id);
  return (b && b.entry && b.entry.data && b.entry.data.cage) || null;
}

/** Map a ref picked on the preview body onto the committed cage (by vertex positions). */
export function toBase(app, ref) {
  if (!isTsRef(ref)) return ref;
  const base = cageOf(app, ref.body);
  const shown = shownCage(app, ref.body);
  if (!base) return null;
  if (!shown || shown === base) return ref;
  if (shown.v.length === base.v.length && shown.f.length === base.f.length && JSON.stringify(shown.f) === JSON.stringify(base.f) && JSON.stringify(shown.v) === JSON.stringify(base.v)) return ref;
  const key = (p) => roundP(p).join(",");
  const idx = new Map(base.v.map((p, i) => [key(p), i]));
  const mv = (i) => (shown.v[i] ? idx.get(key(shown.v[i])) : undefined);
  if (ref.kind === "tsVertex") { const v = mv(ref.v); return v === undefined ? null : { ...ref, v }; }
  if (ref.kind === "tsEdge") { const a = mv(ref.a), b = mv(ref.b); return a === undefined || b === undefined ? null : { kind: "tsEdge", body: ref.body, a: Math.min(a, b), b: Math.max(a, b) }; }
  if (ref.kind === "tsFace") {
    const vs = (shown.f[ref.f] || []).map(mv);
    if (vs.some((v) => v === undefined)) return null;
    const k = [...vs].sort((x, y) => x - y).join(",");
    const f = base.f.findIndex((fc) => [...fc].sort((x, y) => x - y).join(",") === k);
    return f < 0 ? null : { ...ref, f };
  }
  return ref;
}

/** Selection row for T-spline entities of the edited form. kinds: subset of tsVertex/tsEdge/tsFace (+ 'body'). */
export function tsRow(app, id, label, kinds, extra = {}) {
  const k = kinds || TS_KINDS;
  return {
    id, label, type: "selection", kinds: k, meshBodies: k.includes("body"), max: extra.max, min: extra.min, prompt: extra.prompt,
    selText: extra.selText, advance: extra.advance, toggle: extra.toggle, visible: extra.visible, sep: extra.sep, tooltip: extra.tooltip,
    filter: (r, dlg) => {
      if (r.kind === "body") return isFormBody(app, r.body) && (!extra.filter || extra.filter(r, dlg));
      return isTsRef(r) && isFormBody(app, r.body) && (!extra.filter || extra.filter(r, dlg));
    },
    mapRef: (r, dlg) => {
      const m = extra.noMap ? r : toBase(app, r);
      if (!m) return null;
      return extra.mapRef ? extra.mapRef(m, dlg) : m;
    },
  };
}

/** Refs of one row grouped by body: Map bodyId -> refs. */
export function byBody(refs) {
  const m = new Map();
  for (const r of refs || []) { if (!r || !r.body) continue; if (!m.has(r.body)) m.set(r.body, []); m.get(r.body).push(r); }
  return m;
}

/**
 * A change of the edited Form: {set: Map(bodyId -> cage), add: [cage (no id)], remove: Set(bodyIds), select?: refs}.
 * previewOf() gives the tentative feature (new bodies get temporary ids), commitChange() writes it as one undo step.
 */
export function previewOf(app, ch) {
  const f = formFeature(app);
  if (!f) return null;
  const nf = clone(f);
  nf.bodies = applyChange(nf.bodies || [], ch, (i) => `tsprev${i + 1}`);
  return nf;
}
function applyChange(bodies, ch, newId) {
  let out = bodies.filter((c) => !(ch.remove && ch.remove.has(c.id)));
  if (ch.set) out = out.map((c) => (ch.set.has(c.id) ? { ...clone(ch.set.get(c.id)), id: c.id, converted: ch.set.get(c.id).converted || c.converted || undefined } : c));
  (ch.add || []).forEach((c, i) => out.push({ ...clone(c), id: newId(i) }));
  return out;
}
export function commitChange(app, label, ch) {
  const fid = FORM.editing;
  if (!fid || !ch) return null;
  const ids = [];
  app.mutate(label, (doc) => {
    const f = doc.features.find((x) => x.id === fid);
    if (!f) throw new Error("The Form feature no longer exists");
    f.bodies = applyChange(f.bodies || [], ch, () => { const id = app.M.nextBody(doc); ids.push(id); return id; });
    if (ch.remove) for (const id of ch.remove) if (doc.bodies[id] && !f.bodies.some((c) => c.id === id)) delete doc.bodies[id];
  });
  return { ids };
}

/**
 * Open a FORM command dialog. spec = dialog spec with compute(values, dlg) -> change | null (throws = shown error)
 * instead of build(). The preview replaces the edited Form feature; OK commits one undo step.
 */
export function openFormDialog(app, spec) {
  if (!FORM.editing || !app.feature(FORM.editing)) { app.toast("Create a Form first (SOLID > CREATE > Create Form)", "info"); return null; }
  const fid = FORM.editing;
  const label = spec.featureLabel || spec.title;
  return app.ui.dialog.open({
    icon: spec.id,
    ...spec,
    preview: false,
    build(v, dlg) {
      const ch = spec.compute(v, dlg);
      dlg.formChange = ch || null;
      return ch ? previewOf(app, ch) : null;
    },
    afterPreview(dlg) {
      if (spec.afterPreview) { try { spec.afterPreview(dlg); } catch (e) { console.error(e); } }
      if (dlg.closed) return;
      if (dlg.feature) {
        let r = null;
        try { r = app.preview(dlg.feature, { replaceId: fid }); } catch (e) { console.error(e); }
        const res = r && r.result.results[fid];
        if (res && res.ok === false) dlg.message(res.error || "The Form could not be evaluated", "error");
      } else app.endPreview();
    },
    commit(f, dlg) {
      if (spec.commit) return spec.commit(dlg.formChange, dlg);
      return commitChange(app, label, dlg.formChange);
    },
    afterCommit(out, dlg) {
      if (spec.afterCommit) spec.afterCommit(out, dlg);
    },
  });
}

/** Plane {o, x, n} of a plane-like ref (origin plane, construction plane, planar face) in the dialog base state. */
export function planeOfRef(app, U, ref, state) {
  if (!ref) return null;
  try { return U.resolvePlane(U.planeRefFromRef(ref), state); } catch { return null; }
}
/** Axis {o, d} of an axis-like ref (origin axis, linear edge, sketch line, T-spline edge). */
export function axisOfRef(app, U, ref, state) {
  if (!ref) return null;
  if (ref.kind === "tsEdge") {
    const c = shownCage(app, ref.body);
    if (!c) return null;
    return { o: c.v[ref.a], d: V.norm(V.sub(c.v[ref.b], c.v[ref.a])) };
  }
  try { const l = U.axisLine(ref, state); if (l) return { o: l.o || l.origin || l.p, d: V.norm(l.d || l.dir) }; } catch { /* ignore */ }
  return null;
}
