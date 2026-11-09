// assembly: Motion Study. A study animates joints over time from keyframes: doc.motionStudies = [{id, name, steps,
// duration (s), loop, joints: [jointId], keys: [{joint, dof, step, value}]}]. Between keyframes values are linear;
// before the first keyframe of a motion the joint starts at its stored drive value (step 0).
import * as S from "./solver.js";
import * as F from "./features.js";
import * as MO from "./motion.js";
import { JOINT_KINDS } from "./dialogs.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Drive overrides of a study at a step (0..steps): Map jointId -> {dof: value}. */
export function studyDrives(app, study, step) {
  const over = new Map();
  for (const jid of study.joints || []) {
    const f = app.feature(jid);
    if (!f || !JOINT_KINDS.includes(f.type)) continue;
    const d = {};
    for (const k of S.DOFS[f.jointType] || []) {
      const keys = (study.keys || []).filter((x) => x.joint === jid && x.dof === k).sort((a, b) => a.step - b.step);
      const v0 = Number((f.drive && f.drive[k]) || 0);
      const pts = keys.length && keys[0].step > 0 ? [{ step: 0, value: v0 }, ...keys] : keys.length ? keys : [{ step: 0, value: v0 }];
      let v = pts[pts.length - 1].value;
      if (step <= pts[0].step) v = pts[0].value;
      else for (let i = 1; i < pts.length; i++) if (step <= pts[i].step) { const a = pts[i - 1], b = pts[i], u = (step - a.step) / Math.max(1e-9, b.step - a.step); v = a.value + (b.value - a.value) * u; break; }
      d[k] = v;
    }
    over.set(jid, d);
  }
  return over;
}
export function showStep(app, study, step) {
  const r = S.solve(F.liveModel(app), studyDrives(app, study, step));
  MO.showPoses(app, r.T, null);
  return r;
}
/** Play a study once (or in a loop until stopped). */
export function playStudy(app, study, opts = {}) {
  const steps = Math.max(1, Number(study.steps) || 100), ms = Math.max(200, (Number(study.duration) || 4) * 1000);
  const run = () => MO.play(app, {
    ms,
    frame(t) { const s = t * steps; showStep(app, study, s); if (opts.onStep) opts.onStep(s); },
    done(ok) { if (ok && study.loop && !opts.once) { run(); return; } MO.clearPoses(app); if (opts.done) opts.done(ok); },
  });
  run();
}

export function openMotionStudy(app, opts = {}) {
  const s0 = opts.editStudy ? (app.doc.motionStudies || []).find((s) => s.id === opts.editStudy) : null;
  const study = s0 ? JSON.parse(JSON.stringify(s0)) : { steps: 100, duration: 4, loop: false, joints: [], keys: [] };
  let cur = 0;
  const pre = (opts.preselect || []).filter((r) => r.kind === "feature" && JOINT_KINDS.includes((app.feature(r.id) || {}).type));
  const jointOk = (r) => { const f = app.feature(r.id); return !!f && JOINT_KINDS.includes(f.type) && (S.DOFS[f.jointType] || []).length > 0; };
  const sync = (dlg) => { study.joints = (dlg.values.joints || []).map((r) => r.id); study.keys = study.keys.filter((k) => study.joints.includes(k.joint)); };
  const keyRow = {
    id: "keys", type: "custom", label: "",
    render(dlg) {
      const el = document.createElement("div");
      el.className = "asm-study";
      el.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-act]");
        if (!b) return;
        const act = b.dataset.act;
        if (act === "play") { if (MO.animating()) MO.stopAnim(); else { playStudy(app, study, { once: !study.loop, onStep: (s) => { cur = s; const sl = el.querySelector('[data-k="step"]'); if (sl) sl.value = String(Math.round(s)); const o = el.querySelector(".asm-step-out"); if (o) o.textContent = String(Math.round(s)); }, done: () => dlg.refresh() }); } dlg.refresh(); return; }
        if (act === "add") {
          const [jid, dof] = String(el.querySelector('[data-k="motion"]').value || "").split("|");
          const val = Number(el.querySelector('[data-k="value"]').value);
          if (!jid || !Number.isFinite(val)) { app.toast("Enter a value for the keyframe.", "warning"); return; }
          const step = Math.round(cur);
          study.keys = study.keys.filter((k) => !(k.joint === jid && k.dof === dof && k.step === step));
          study.keys.push({ joint: jid, dof, step, value: val });
          dlg.refresh();
          try { showStep(app, study, cur); } catch (e) { console.warn("[assembly] study", e); }
          return;
        }
        if (act === "del") { const i = Number(b.dataset.i); study.keys.splice(i, 1); dlg.refresh(); try { showStep(app, study, cur); } catch { /* ignore */ } }
      });
      el.addEventListener("input", (ev) => {
        const k = ev.target.dataset.k;
        if (k === "step") { cur = Number(ev.target.value) || 0; const o = el.querySelector(".asm-step-out"); if (o) o.textContent = String(Math.round(cur)); try { showStep(app, study, cur); } catch (e) { console.warn("[assembly] study", e); } }
        if (k === "duration") study.duration = Math.max(0.2, Number(ev.target.value) || 4);
      });
      el.addEventListener("change", (ev) => { if (ev.target.dataset.k === "loop") study.loop = !!ev.target.checked; });
      return el;
    },
    update(el, dlg) {
      sync(dlg);
      const motions = [];
      for (const jid of study.joints) { const f = app.feature(jid); if (f) for (const k of S.DOFS[f.jointType] || []) motions.push({ v: `${jid}|${k}`, label: `${f.name}: ${S.DOF_LABEL[k]}`, unit: S.isRot(k) ? "deg" : "mm" }); }
      const keys = study.keys.map((k, i) => ({ ...k, i })).sort((a, b) => a.step - b.step);
      const sel = el.querySelector('[data-k="motion"]'), prev = sel ? sel.value : "";
      el.innerHTML = `<div class="asm-study-bar"><button type="button" class="dlg-btn" data-act="play" data-input="play">${MO.animating() ? "Stop" : "Play"}</button>`
        + `<label>Step <input type="range" min="0" max="${study.steps}" value="${Math.round(cur)}" data-k="step" data-input="step"></label><span class="asm-step-out">${Math.round(cur)}</span></div>`
        + `<div class="asm-study-bar"><label>Duration <input type="number" min="0.2" step="0.5" value="${study.duration}" data-k="duration" data-input="duration"> s</label><label><input type="checkbox" data-k="loop" data-input="loop" ${study.loop ? "checked" : ""}> Loop</label></div>`
        + (motions.length ? `<div class="asm-study-bar"><select data-k="motion" data-input="motion">${motions.map((m) => `<option value="${esc(m.v)}">${esc(m.label)} (${m.unit})</option>`).join("")}</select><input type="number" data-k="value" data-input="keyValue" value="0" step="any"><button type="button" class="dlg-btn" data-act="add" data-input="addKey">Add Keyframe</button></div>` : "<div class=\"asm-dim\">Select the joints of the study.</div>")
        + `<table class="asm-table"><thead><tr><th>Step</th><th>Motion</th><th>Value</th><th></th></tr></thead><tbody>${keys.map((k) => { const f = app.feature(k.joint); return `<tr data-key="${k.i}"><td>${k.step}</td><td>${esc(f ? f.name : k.joint)}: ${esc(S.DOF_LABEL[k.dof] || k.dof)}</td><td>${+k.value.toFixed(4)}</td><td><button type="button" class="asm-x" data-act="del" data-i="${k.i}" title="Delete keyframe">x</button></td></tr>`; }).join("")}</tbody></table>`;
      const ns = el.querySelector('[data-k="motion"]');
      if (ns && prev && [...ns.options].some((o) => o.value === prev)) ns.value = prev;
    },
  };
  return app.ui.dialog.open({
    id: "FusionMotionStudyCommand", title: "Motion Study", icon: "FusionMotionStudyCommand", featureLabel: "Motion Study",
    help: "Animates joints over time to study a mechanism.", preview: false, noFeature: true, ctrlWidth: 230,
    preselect: pre,
    rows: [
      { id: "joints", type: "selection", label: "Joints", kinds: ["feature"], max: 0, min: 1, prompt: "Select the joints of the motion study", filter: jointOk, advance: false },
      keyRow,
    ],
    init(dlg) { if (s0) dlg.values.joints = study.joints.filter((id) => app.feature(id)).map((id) => ({ kind: "feature", id })); },
    validate() { return study.keys.length ? null : "Add at least one keyframe"; },
    commit(_f, dlg) {
      sync(dlg);
      MO.stopAnim();
      MO.clearPoses(app);
      return app.mutate(s0 ? "Edit Motion Study" : "Motion Study", (doc) => {
        doc.motionStudies = (doc.motionStudies || []).slice();
        if (s0) { const i = doc.motionStudies.findIndex((s) => s.id === s0.id); if (i >= 0) doc.motionStudies[i] = { ...doc.motionStudies[i], ...study, id: s0.id, name: s0.name }; return s0.id; }
        doc.counters.motionStudy = (doc.counters.motionStudy || 0) + 1;
        const s = { ...study, id: `ms${doc.counters.motionStudy}`, name: `Motion Study${doc.counters.motionStudy}` };
        doc.motionStudies.push(s);
        return s.id;
      }, { recompute: false });
    },
    afterCommit() { try { app.ui.browser.invalidate(); } catch { /* ignore */ } },
    onClose() { MO.stopAnim(); MO.clearPoses(app); },
  });
}
