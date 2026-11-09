// Insert Derive (PullDeriveCommand) and Derive (PushDeriveCommand): feature 'derive'.
// A derive reads bodies from a linked design (a link record of doc.xrefs, see xref.js). Sketches and construction
// planes arrive as ordinary sketch / plane features, parameters as user parameters (copies made at the derive).
import { uid, clone, fileInput, parseDesign, readText, designJson, isIdentity, checkListRow, buttonRow, infoRow, FILE_ERROR } from "./util.js";
import { xrefOf, addXref, evalXref, nestedBodyIds, nestedMeta, updateXref, copyMeta } from "./xref.js";

let M = null;
const NO_DEPS = () => ({ sketches: [], bodies: [], features: [], cplanes: [], geo: [] });

/** What a linked design offers to a derive: lists for the dialog. */
function describe(file, savedAt, x) {
  const ev = evalXref(x, null);
  const st = ev.state;
  const compOf = (id) => {
    const o = st.bodyOcc && st.bodyOcc.get(id);
    const od = o && o !== M.ROOT && st.occ ? st.occ.get(o) : null;
    const cd = od && x.doc.components ? x.doc.components[od.component] : null;
    return cd ? `${cd.name} / ` : "";
  };
  const bodies = nestedBodyIds(x).map((id) => ({ key: `b:${id}`, label: compOf(id) + (nestedMeta(x, id).name || id) }));
  const sketches = (x.doc.features || []).filter((f, i) => f.type === "sketch" && i < x.doc.marker && !f.suppressed && st.sketches && st.sketches.has(f.id))
    .map((f) => ({ key: `s:${f.id}`, label: f.name || f.id }));
  const planes = [...(st.planes ? st.planes.values() : [])].filter((p) => p && p.plane).map((p) => ({ key: `p:${p.id}`, label: p.name || p.id }));
  const params = (x.doc.params || []).map((p) => ({ key: `u:${p.name}`, label: `${p.name} = ${p.expr}` }));
  return { file, savedAt, x, ev, bodies, sketches, planes, params };
}

function registerFeature() {
  M.registerFeature("derive", {
    label: "Derive",
    stem: "Derive",
    fields: {},
    makesBodies: (f) => (f.srcBodies || []).length,
    apply(st, f, P, doc) {
      const x = xrefOf(doc, f.xref);
      if (!x) throw new Error("The source design of this derive is missing");
      const r = evalXref(x, st.bodies);
      const owner = f.occ && st.occ && st.occ.has(f.occ) ? f.occ : M.ROOT;
      const T = st.occ ? M.occTransform(st, owner) : null;
      const move = T && !isIdentity(T);
      const affected = [];
      let missing = 0;
      (f.srcBodies || []).forEach((nid, i) => {
        const hid = f.newBodies && f.newBodies[i];
        if (!hid) return;
        const nb = r.state.bodies.get(nid);
        if (nb) {
          st.bodies.set(hid, { ...nb, id: hid, shape: move ? M.transformShape(nb.shape, T) : nb.shape, from: f.id });
          affected.push(hid);
          return;
        }
        const mb = r.state.meshBodies && r.state.meshBodies.get(nid);
        if (mb && st.meshBodies) {
          let mesh = mb;
          try { if (move && mb.mesh && M.transformMesh) mesh = { ...mb, mesh: M.transformMesh(mb.mesh, T) }; } catch { mesh = mb; }
          st.meshBodies.set(hid, { ...mesh, id: hid, from: f.id });
          affected.push(hid);
          return;
        }
        missing += 1;
      });
      const out = { affected, file: x.file, stamp: x.stamp };
      if (missing) out.warning = `${missing} derived ${missing === 1 ? "body is" : "bodies are"} no longer in ${x.file} v${x.stamp}`;
      return out;
    },
    deps: NO_DEPS,
    editor: (a, id) => openPull(a, id),
    icon: "PullDeriveCommand",
  });
}

/** Add the chosen sketches, construction planes and parameters of a source to the document (inside app.mutate). */
function addExtras(app, d, src, sketchIds, planeIds, paramNames) {
  const st = src.ev.state;
  const put = (nf, name) => {
    app._prepareFeature(d, nf);
    if (name) nf.name = name;
    d.features.splice(d.marker, 0, nf);
    d.marker += 1;
  };
  for (const sid of sketchIds) {
    const sf = (src.x.doc.features || []).find((q) => q.id === sid);
    const ss = st.sketches && st.sketches.get(sid);
    if (!sf || !ss || !ss.plane) continue;
    const nf = { type: "sketch", plane: clone(ss.plane), sk: clone(sf.sk), visible: true };
    if (sf.planeRef && sf.planeRef.kind === "origin") nf.planeRef = clone(sf.planeRef);
    put(nf, null);
  }
  for (const pid of planeIds) {
    const p = st.planes && st.planes.get(pid);
    if (!p || !p.plane) continue;
    const plane = { o: [...p.plane.o], x: [...p.plane.x], n: [...p.plane.n] };
    put({ type: "cplane", mode: "offset", base: { kind: "face", plane }, offset: 0 }, null);
  }
  const have = new Set((d.params || []).map((p) => p.name));
  let skipped = 0;
  const srcParams = src.x.doc.params || [];
  const want = [...paramNames];
  for (let i = 0; i < want.length; i++) {
    const p = srcParams.find((q) => q.name === want[i]);
    for (const id of String((p && p.expr) || "").match(/[A-Za-z_]w*/g) || []) {
      if (!want.includes(id) && srcParams.some((q) => q.name === id)) want.push(id);
    }
  }
  for (const name of want) {
    const p = (src.x.doc.params || []).find((q) => q.name === name);
    if (!p) continue;
    if (have.has(name)) { skipped += 1; continue; }
    d.params = d.params || [];
    d.params.push(clone(p));
    have.add(name);
  }
  return skipped;
}

function openPull(app, editId) {
  if (app.mode === "sketch") { app.toast("Finish the sketch before Insert Derive", "warn"); return null; }
  const ef = editId ? app.feature(editId) : null;
  const ex = ef ? xrefOf(app.doc, ef.xref) : null;
  if (editId && (!ef || !ex)) { app.toast("The source design of this derive is missing", "error"); return null; }
  let src = null; // the described source
  let fresh = null; // a newly picked file {file, parsed}
  let dialog = null;
  const adopt = (dlg, s, keys) => {
    src = s;
    if (editId) { src.sketches = []; src.planes = []; src.params = []; }
    const offered = new Set(src.bodies.map((b) => b.key));
    dlg.values.objects = keys ? keys.filter((k) => offered.has(k)) : src.bodies.map((b) => b.key);
    dlg.values.params = [];
  };
  const pick = (dlg) => {
    const input = fileInput("deriveFile", ".json,application/json", async (file) => {
      try {
        const parsed = parseDesign(app, await readText(file));
        if (dlg.closed) return;
        fresh = { file: file.name || "design.json", parsed };
        adopt(dlg, describe(fresh.file, parsed.savedAt, { uid: uid(), doc: parsed.doc, file: fresh.file }), editId ? dlg.values.objects : null);
        dlg.refresh();
      } catch (e) {
        app.toast(e && e.message === FILE_ERROR ? FILE_ERROR : `Insert Derive: ${(e && e.message) || e}`, "error");
      }
    });
    input.click();
  };
  const objects = () => (!src ? [] : [
    ...(src.bodies.length ? [{ head: true, key: "hb", label: "Bodies" }, ...src.bodies] : []),
    ...(src.sketches.length ? [{ head: true, key: "hs", label: "Sketches" }, ...src.sketches] : []),
    ...(src.planes.length ? [{ head: true, key: "hp", label: "Construction" }, ...src.planes] : []),
  ]);
  dialog = app.ui.dialog.open({
    id: "PullDeriveCommand",
    title: editId ? "Edit Derive" : "Insert Derive",
    icon: "PullDeriveCommand",
    featureLabel: "Derive",
    help: "Derives bodies, components, sketches, construction geometry and parameters from another design into the current design.",
    preview: false, noFeature: true, activate: false, ctrlWidth: 190,
    rows: [
      buttonRow("source", "Select Source", () => (src ? src.file : "Select File..."), (dlg) => pick(dlg), { tooltip: "The design file to derive from" }),
      infoRow("from", "Derive", () => (ex && !fresh ? `Derived from ${ex.file} v${ex.stamp}` : fresh && editId ? `Update to ${fresh.file}` : ""), { visible: () => !!editId }),
      checkListRow("objects", "Objects to Derive", objects, { empty: "Select a source design", visible: () => !!src }),
      checkListRow("params", "Parameters", () => (src ? src.params : []), { empty: "No user parameters", visible: () => !!src && src.params.length > 0 }),
    ],
    init(dlg) {
      dlg.values.objects = [];
      dlg.values.params = [];
      if (ex) adopt(dlg, describe(ex.file, ex.savedAt, ex), (ef.srcBodies || []).map((id) => `b:${id}`));
    },
    validate(dlg) {
      if (!src) return "Select a source design file";
      return (dlg.values.objects || []).length + (dlg.values.params || []).length ? null : "Expected at least one selection";
    },
    status: (dlg) => (src ? `${(dlg.values.objects || []).length + (dlg.values.params || []).length} selected` : ""),
    commit(_f, dlg) {
      const keys = dlg.values.objects || [];
      const part = (p) => keys.filter((k) => k.startsWith(p)).map((k) => k.slice(2));
      const bodies = part("b:"), sketches = part("s:"), planes = part("p:");
      const params = (dlg.values.params || []).map((k) => k.slice(2));
      let skipped = 0;
      const out = app.mutate(editId ? "Edit Derive" : "Derive", (d) => {
        if (editId) {
          const f = d.features.find((q) => q.id === editId);
          if (!f) return null;
          if (fresh) { const x = updateXref(d, f.xref, clone(fresh.parsed.doc), fresh.file); if (x) x.savedAt = fresh.parsed.savedAt || 0; }
          const x = xrefOf(d, f.xref);
          const old = new Map((f.srcBodies || []).map((s, i) => [s, (f.newBodies || [])[i]]));
          f.srcBodies = bodies;
          f.newBodies = bodies.map((s) => old.get(s) || null);
          f.newBodies.forEach((hid, i) => {
            if (hid) return;
            f.newBodies[i] = M.nextBody(d);
            copyMeta(d, x, bodies[i], f.newBodies[i]);
          });
          f.xv = `${x.uid}:${bodies.join(",")}`;
          return f;
        }
        const x = addXref(d, { file: src.file, doc: clone(src.x.doc), savedAt: src.savedAt });
        x.uid = src.x.uid; // same content: the evaluation of the dialog is reused
        let f = null;
        if (bodies.length) {
          f = { type: "derive", xref: x.id, xv: x.uid, srcBodies: bodies };
          app._prepareFeature(d, f);
          bodies.forEach((nid, i) => copyMeta(d, x, nid, f.newBodies[i]));
          d.features.splice(d.marker, 0, f);
          d.marker += 1;
        } else {
          delete d.xrefs[x.id]; // only copies were asked for: no link to keep
        }
        skipped = addExtras(app, d, src, sketches, planes, params);
        return f || true;
      });
      if (skipped) app.toast(`${skipped} parameter${skipped === 1 ? "" : "s"} already exist${skipped === 1 ? "s" : ""} in this design and ${skipped === 1 ? "was" : "were"} kept`, "warn");
      return out;
    },
  });
  return dialog;
}

/** Derive: send the selected bodies (and parameters) to a new design file that derives them from this design. */
function openPush(app) {
  if (app.mode === "sketch") { app.toast("Finish the sketch before Derive", "warn"); return null; }
  const all = app.bodies();
  if (!all.length) { app.toast("Derive: the design has no bodies", "warn"); return null; }
  const toBody = (r) => (!r ? null : r.kind === "body" ? r : r.body ? { kind: "body", body: r.body } : null);
  const params = (app.doc.params || []).map((p) => ({ key: `u:${p.name}`, label: `${p.name} = ${p.expr}` }));
  const pre = [...((app.selection && app.selection.items) || [])].map(toBody).filter(Boolean);
  return app.ui.dialog.open({
    id: "PushDeriveCommand",
    preselect: pre,
    title: "Derive",
    icon: "PushDeriveCommand",
    featureLabel: "Derive",
    help: "Derives the selected objects from the current design into a new design file.",
    preview: false, noFeature: true, activate: false, ctrlWidth: 190,
    rows: [
      { id: "objects", type: "selection", label: "Objects", kinds: ["body", "face"], meshBodies: true, mapRef: toBody, min: 1, prompt: "Select the objects to derive" },
      checkListRow("params", "Parameters", () => params, { visible: () => params.length > 0 }),
      infoRow("dest", "Destination", () => "New Design"),
    ],
    init(dlg) { dlg.values.params = []; },
    validate: (dlg) => ((dlg.values.objects || []).length ? null : "Expected at least one selection"),
    commit(_f, dlg) {
      const ids = [...new Set((dlg.values.objects || []).map((r) => r && r.body).filter(Boolean))];
      const name = app.doc.name && app.doc.name !== "Untitled" ? app.doc.name : "Design";
      const nd = M.newDoc(`${name} (Derived)`);
      const x = addXref(nd, { file: `${name}.json`, doc: clone(app.doc), savedAt: Date.now() });
      const offered = new Set(nestedBodyIds(x));
      const bodies = ids.filter((id) => offered.has(id));
      if (!bodies.length) { delete nd.xrefs[x.id]; app.toast("Derive: the selected objects cannot be derived", "error"); return null; }
      const f = { type: "derive", xref: x.id, xv: x.uid, srcBodies: bodies };
      app._prepareFeature(nd, f);
      bodies.forEach((nid, i) => copyMeta(nd, x, nid, f.newBodies[i]));
      nd.features.push(f);
      nd.marker = nd.features.length;
      const want = new Set((dlg.values.params || []).map((k) => k.slice(2)));
      nd.params = (app.doc.params || []).filter((p) => want.has(p.name)).map((p) => clone(p));
      const file = `${name} (Derived).json`;
      Promise.resolve(app.download(file, designJson(nd), "application/json")).then(
        () => app.toast(`${bodies.length} ${bodies.length === 1 ? "body" : "bodies"} derived to ${file}`, "info"),
        (e) => app.toast(`Derive: ${(e && e.message) || e}`, "error"),
      );
      return nd;
    },
  });
}

export function initDerive(app) {
  M = app.M;
  registerFeature();
  app.commands.register({ id: "PullDeriveCommand", kind: "tool", label: "Insert Derive", tooltip: "Derives bodies, sketches, construction geometry and parameters from a design file into the current design.", run: (a) => openPull(a || app, null) });
  app.commands.register({ id: "PushDeriveCommand", kind: "tool", label: "Derive", tooltip: "Derives the selected objects from the current design into a new design file.", run: (a) => openPush(a || app) });
  return { open: (id) => openPull(app, id || null), push: () => openPush(app) };
}
