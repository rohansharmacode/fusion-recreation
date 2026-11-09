// File commands: New, Open (local designs + "Open from my computer"), Save / Save As (a Save dialog
// on first save), Recovery Save + auto-recovery, Export (STEP / STL / design JSON), 3D Print (STL).
// Designs live in localStorage (in-memory fallback when storage is blocked).
import { el, esc, store, download, safeFileName, fmtDate, fmtBytes, clone, glyphHtml } from "./util.js";

const KEY_INDEX = "fusion-rec:designs";
const KEY_DOC = (id) => `fusion-rec:design:${id}`;
const KEY_RECOVERY = "fusion-rec:recovery";

export function createFiles(app, modals) {
  // The design a document belongs to is stored on the document itself (doc.fileId), so any
  // way of replacing the document (New, Close, Open, undo) keeps the binding right.
  const F = {
    get current() {
      const id = app.doc && app.doc.fileId;
      if (!id) return null;
      const e = index().find((x) => x.id === id);
      return e ? { id: e.id, name: e.name, version: e.version } : null;
    },
    lastExport: null, // {name, type, size} (for tests / status)
    warnedStorage: false,
  };

  // ------------------------------------------------------------------ storage
  function index() {
    const list = store.getJSON(KEY_INDEX, []);
    return Array.isArray(list) ? list.filter((x) => x && x.id) : [];
  }
  function writeIndex(list) { store.setJSON(KEY_INDEX, list); }
  function readDesign(id) { return store.getJSON(KEY_DOC(id), null); }
  function deleteDesign(id) {
    store.remove(KEY_DOC(id));
    writeIndex(index().filter((x) => x.id !== id));
  }
  function newId() { return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
  function warnStorage() {
    if (store.persistent || F.warnedStorage) return;
    F.warnedStorage = true;
    app.toast("Browser storage is unavailable here: saved designs last only for this session", "warning", 5000);
  }

  function thumbnail() {
    try {
      const vp = app.viewport;
      if (!vp || !vp.renderer || !vp.scene) return null;
      const cam = vp.camera;
      vp.renderer.render(vp.scene, cam);
      const src = vp.renderer.domElement;
      const W = 192, H = 120;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d");
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
      const sw = src.width, sh = src.height;
      const s = Math.max(W / sw, H / sh);
      const dw = sw * s, dh = sh * s;
      g.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
      return c.toDataURL("image/jpeg", 0.72);
    } catch { return null; }
  }

  function patchHistory(name, fileId, version) {
    // Undo snapshots must not rename / unbind the document.
    for (const e of [...app.history.undoStack, ...app.history.redoStack]) {
      if (!e || !e.doc) continue;
      e.doc.name = name;
      e.doc.fileId = fileId;
      e.doc.savedVersion = version;
    }
  }

  function writeDesign(id, name) {
    const doc = clone(app.doc);
    doc.name = name;
    doc.fileId = id;
    const prev = index().find((x) => x.id === id);
    const version = (prev ? prev.version || 0 : 0) + 1;
    doc.savedVersion = version;
    const json = JSON.stringify({ format: "fusion-recreation-design", version: 1, savedAt: Date.now(), doc });
    store.set(KEY_DOC(id), json);
    const entry = { id, name, version, modified: Date.now(), features: doc.features.length, size: json.length, thumb: thumbnail() };
    const list = index().filter((x) => x.id !== id);
    list.unshift(entry);
    try { writeIndex(list); } catch (e) {
      entry.thumb = null; // retry without the thumbnail
      writeIndex(list);
      if (e && /full/i.test(e.message || "")) throw e;
    }
    return entry;
  }

  /** Save to `id` (or a new slot) with `name`. Updates doc name/version, clears dirty. */
  function saveAs(name, id = null) {
    warnStorage();
    const target = id || newId();
    const entry = writeDesign(target, name);
    app.doc.name = name;
    app.doc.fileId = target;
    app.doc.savedVersion = entry.version;
    patchHistory(name, target, entry.version);
    app.dirty = false;
    clearRecovery();
    app.emit("doc", { saved: true, label: undefined });
    app.emit("file", { action: "save", id: target, name, version: entry.version });
    app.toast(`Saved "${name}" v${entry.version}`, "info", 1800);
    return entry;
  }

  // ------------------------------------------------------------------ helpers
  function leaveEditing() {
    try { if (app.activeCommand) app.activeCommand.cancel(); } catch (e) { console.error(e); }
    if (app.mode === "sketch") {
      try { if (app.commands.has("SketchStop")) app.commands.run("SketchStop"); } catch (e) { console.error(e); }
      if (app.mode === "sketch") app.setMode("model", null);
    }
    app.endPreview && app.endPreview();
  }

  /** Ask to save unsaved changes. Resolves true to continue, false to abort. */
  async function confirmDiscard(verb = "continue") {
    if (!app.dirty) return true;
    const name = esc(app.doc.name || "Untitled");
    const r = await modals.confirm({
      id: "SaveChanges",
      title: "Save Changes",
      kind: "warning",
      message: `<b>${name}</b> has unsaved changes.<br><br>Save your changes before you ${esc(verb)}?`,
      buttons: [
        { action: "save", label: "Save", primary: true },
        { action: "discard", label: "Don't Save" },
        { action: "cancel", label: "Cancel" },
      ],
    });
    if (r === "save") return !!(await save());
    return r === "discard";
  }

  function validDoc(d) {
    return d && typeof d === "object" && Array.isArray(d.features) && typeof d.marker === "number";
  }
  function normalizeDoc(d) {
    const doc = clone(d);
    doc.version = doc.version || 1;
    doc.name = doc.name || "Untitled";
    doc.units = doc.units || "mm";
    doc.params = Array.isArray(doc.params) ? doc.params : [];
    doc.bodies = doc.bodies && typeof doc.bodies === "object" ? doc.bodies : {};
    doc.counters = doc.counters && typeof doc.counters === "object" ? doc.counters : {};
    doc.origin = doc.origin || { visible: false };
    if (doc.meshData && typeof doc.meshData !== "object") delete doc.meshData;
    try { if (app.M.migrateDoc) app.M.migrateDoc(doc); } catch (e) { console.warn("migrate", e); } // older doc.meshes -> mesh bodies
    doc.marker = Math.max(0, Math.min(doc.features.length, doc.marker));
    return doc;
  }

  function loadDoc(doc, binding) {
    leaveEditing();
    const d = normalizeDoc(doc);
    if (binding) { d.fileId = binding.id; d.savedVersion = binding.version; } else delete d.fileId;
    app.loadDocument(d);
    app.dirty = false;
    app.emit("file", { action: "open", id: binding && binding.id, name: app.doc.name, version: binding && binding.version });
    try { app.viewport && app.viewport.fit && app.viewport.fit({ animate: false }); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ commands
  async function fileNew() {
    if (!(await confirmDiscard("start a new design"))) return false;
    leaveEditing();
    app.newDocument("Untitled");
    clearRecovery();
    app.emit("file", { action: "new", name: app.doc.name });
    try { app.viewport && app.viewport.setView && app.viewport.setView("home", { animate: false }); } catch { /* ignore */ }
    return true;
  }

  function nameValidator(v) {
    if (!v) return "Enter a name for the design";
    if (v.length > 120) return "The name is too long";
    if (/[\\/:*?"<>|]/.test(v)) return 'A name cannot contain \\ / : * ? " < > |';
    return null;
  }

  /** Fusion's Save dialog (first save / Save As): Name + Location (My Designs, expandable). Resolves the saved entry or null. */
  function saveDialog(title = "Save", initial = null) {
    return new Promise((resolve) => {
      const input = el("input", { type: "text", class: "mn-input", value: initial || (app.doc.name && app.doc.name !== "Untitled" ? app.doc.name : "Untitled"), "data-input": "name", spellcheck: "false" });
      const err = el("div", { class: "mn-field-error" });
      const existing = index();
      const chevron = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.6l3 3.2 3-3.2" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>';
      const expBtn = el("button", { type: "button", class: "mn-loc-exp", title: "Show the contents of My Designs", "data-action": "expand-location", html: chevron });
      const loc = el("div", { class: "mn-location", "data-input": "location", title: store.persistent ? "Designs are saved in this browser" : "Browser storage is blocked here: designs are kept for this session only" },
        el("span", { class: "mn-loc-ico", html: glyphHtml("folder", 16) }),
        el("span", { text: store.persistent ? "My Designs" : "My Designs (this session only)" }),
        expBtn);
      const list = el("div", { class: "mn-save-list" }, el("div", { class: "mn-save-head", text: existing.length ? "My Designs" : "My Designs is empty" }));
      for (const e of existing) {
        list.appendChild(el("div", { class: "mn-save-item", title: "Use this name", onclick: () => { input.value = e.name; input.focus(); } },
          el("span", { class: "mn-save-ico", html: glyphHtml("file", 14) }), el("span", { text: e.name }), el("span", { class: "mn-dim", text: `v${e.version}` })));
      }
      const listRow = el("div", { class: "mn-row mn-row-top", style: { display: "none" } }, el("span", { class: "mn-label", text: "" }), list);
      expBtn.addEventListener("click", () => {
        const open = listRow.style.display === "none";
        listRow.style.display = open ? "" : "none";
        expBtn.classList.toggle("open", open);
      });
      let saved = null;
      modals.open({
        id: title === "Save" ? "FileSave" : "FileSaveAs",
        title,
        width: 420,
        className: "mn-save-dialog",
        body: el("div", { class: "mn-form" },
          el("label", { class: "mn-row" }, el("span", { class: "mn-label", text: "Name" }), input),
          err,
          el("div", { class: "mn-row" }, el("span", { class: "mn-label", text: "Location" }), loc),
          listRow),
        buttons: [
          { action: "ok", label: "Save", primary: true, onClick: async () => {
            const v = input.value.trim();
            const e = nameValidator(v);
            if (e) { err.textContent = e; input.classList.add("mn-invalid"); input.focus(); return false; }
            const same = index().find((x) => x.name === v);
            const cur = app.doc.fileId;
            let id = null;
            if (same && same.id === cur) id = cur; // re-saving the open design under its own name
            else if (same) {
              const r = await modals.confirm({ id: "ReplaceDesign", title: "Save", kind: "warning", message: `A design named <b>${esc(v)}</b> already exists.<br><br>Do you want to replace it?`, buttons: [{ action: "ok", label: "Replace", primary: true }, { action: "cancel", label: "Cancel" }] });
              if (r !== "ok") { input.focus(); return false; }
              id = same.id;
            }
            try { saved = saveAs(v, id); } catch (ex) { err.textContent = ex.message || String(ex); return false; }
            return true;
          } },
          { action: "cancel", label: "Cancel" },
        ],
        onClose: () => resolve(saved),
      });
    });
  }

  async function save() {
    if (F.current && index().some((x) => x.id === F.current.id)) {
      try { return saveAs(F.current.name, F.current.id); } catch (e) { app.toast(e.message || String(e), "error"); return null; }
    }
    return saveDialog("Save");
  }

  function saveAsCmd() { return saveDialog("Save As", F.current ? `${F.current.name} (copy)` : null); }

  // ------------------------------------------------------------------ recovery
  let recTimer = 0;
  function recoverySave(silent = false) {
    try {
      store.setJSON(KEY_RECOVERY, { savedAt: Date.now(), name: app.doc.name, fileId: app.doc.fileId || null, dirty: !!app.dirty, doc: app.doc });
      if (!silent) app.toast(`Recovery file created: ${app.doc.name || "Untitled"}`, "info", 2000);
      return true;
    } catch (e) {
      if (!silent) app.toast(e.message || String(e), "error");
      return false;
    }
  }
  function clearRecovery() { store.remove(KEY_RECOVERY); }
  function recovery() {
    const r = store.getJSON(KEY_RECOVERY, null);
    return r && validDoc(r.doc) ? r : null;
  }
  function scheduleRecovery() {
    clearTimeout(recTimer);
    recTimer = setTimeout(() => { if (app.dirty) recoverySave(true); }, 4000);
  }
  // auto-recovery: write a recovery copy a few seconds after each change
  app.on("doc", (d) => {
    if (d && (d.saved || d.replaced)) return;
    scheduleRecovery();
  });

  // ------------------------------------------------------------------ dirty state across undo / redo
  // Undo and Redo change the design like any other edit: Fusion marks the document modified
  // (title "*", closing asks to save) even when the step lands back on the saved state.
  // New / Open / start-up also replace the document but reset the history first, so they are
  // told apart by the empty undo + redo stacks (they set the dirty flag themselves).
  app.on("doc", (d) => {
    if (!d || !d.replaced) return;
    const h = app.history;
    if (!h.undoStack.length && !h.redoStack.length) return;
    app.dirty = true;
    scheduleRecovery();
  });

  // ------------------------------------------------------------------ open dialog
  async function openDialog() {
    const body = el("div", { class: "mn-open" });
    let selected = null;
    let handle = null;
    const importInput = el("input", { type: "file", accept: ".json,application/json", style: { display: "none" } });
    importInput.addEventListener("change", async () => {
      const file = importInput.files && importInput.files[0];
      importInput.value = "";
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const doc = parsed && parsed.doc && validDoc(parsed.doc) ? parsed.doc : parsed;
        if (!validDoc(doc)) throw new Error("This file is not a design exported from this app");
        if (!doc.name || doc.name === "Untitled") doc.name = file.name.replace(/\.json$/i, "");
        delete doc.fileId;
        handle && handle.close("import");
        if (!(await confirmDiscard("open another design"))) return;
        loadDoc(doc, null);
        app.dirty = true;
        app.emit("history", {});
        app.toast(`Opened "${doc.name}" from your computer`, "info", 1800);
      } catch (e) {
        app.toast(`Could not open the file: ${e.message || e}`, "error", 5000);
      }
    });

    function renderList() {
      body.innerHTML = "";
      const rec = recovery();
      const list = index();
      if (rec && rec.dirty) {
        body.appendChild(el("div", { class: "mn-open-section", text: "Recovered Documents" }));
        const row = el("div", { class: "mn-open-item mn-open-recovery", dataset: { design: "recovery" } },
          el("div", { class: "mn-thumb mn-thumb-empty", html: glyphHtml("warning", 20) }),
          el("div", { class: "mn-open-meta" },
            el("div", { class: "mn-open-name", text: `${rec.name || "Untitled"} (Recovered)` }),
            el("div", { class: "mn-dim", text: `Unsaved changes · ${fmtDate(rec.savedAt)} · ${rec.doc.features.length} feature${rec.doc.features.length === 1 ? "" : "s"}` })),
          el("button", { type: "button", class: "mn-icon-btn", title: "Delete recovery document", html: glyphHtml("close", 14), onclick: (ev) => { ev.stopPropagation(); clearRecovery(); renderList(); } }));
        row.addEventListener("click", () => select(row, { recovery: rec }));
        row.addEventListener("dblclick", () => { select(row, { recovery: rec }); handle.press("ok"); });
        body.appendChild(row);
      }
      body.appendChild(el("div", { class: "mn-open-section", text: store.persistent ? "My Designs" : "My Designs (this session)" }));
      if (!list.length) {
        body.appendChild(el("div", { class: "mn-open-empty", html: "No saved designs yet.<br>Use <b>File &rsaquo; Save</b> (Ctrl+S) to save the current design in this browser." }));
      }
      for (const e of list) {
        const thumb = e.thumb ? el("img", { class: "mn-thumb", src: e.thumb, alt: "" }) : el("div", { class: "mn-thumb mn-thumb-empty", html: glyphHtml("body", 22) });
        const cur = F.current && F.current.id === e.id;
        const row = el("div", { class: `mn-open-item${cur ? " mn-open-current" : ""}`, dataset: { design: e.id } },
          thumb,
          el("div", { class: "mn-open-meta" },
            el("div", { class: "mn-open-name" }, el("span", { text: e.name }), el("span", { class: "mn-ver", text: `v${e.version || 1}` }), cur ? el("span", { class: "mn-dim", text: " (open)" }) : null),
            el("div", { class: "mn-dim", text: `${fmtDate(e.modified)} · ${e.features || 0} feature${e.features === 1 ? "" : "s"} · ${fmtBytes(e.size || 0)}` })),
          el("button", { type: "button", class: "mn-icon-btn", title: "Delete design", "data-action": "delete", html: glyphHtml("close", 14), onclick: async (ev) => {
            ev.stopPropagation();
            const r = await modals.confirm({ id: "DeleteDesign", title: "Delete", kind: "warning", message: `Delete <b>${esc(e.name)}</b>? This cannot be undone.`, buttons: [{ action: "ok", label: "Delete", primary: true }, { action: "cancel", label: "Cancel" }] });
            if (r === "ok") { deleteDesign(e.id); if (selected && selected.entry && selected.entry.id === e.id) selected = null; renderList(); }
          } }));
        row.addEventListener("click", () => select(row, { entry: e }));
        row.addEventListener("dblclick", () => { select(row, { entry: e }); handle.press("ok"); });
        body.appendChild(row);
      }
      updateOk();
    }
    function select(row, what) {
      for (const n of body.querySelectorAll(".mn-open-item")) n.classList.toggle("mn-selected", n === row);
      selected = what;
      updateOk();
    }
    function updateOk() { const b = handle && handle.button("ok"); if (b) b.disabled = !selected; }

    const footLeft = el("div", { class: "mn-foot-left-inner" },
      el("button", { type: "button", class: "mn-btn mn-link", "data-action": "import", text: "Open from my computer…", onclick: () => importInput.click() }),
      importInput);

    let chosen = null;
    handle = modals.open({
      id: "FileOpen",
      title: "Open",
      width: 560,
      className: "mn-open-dialog",
      body,
      footLeft,
      buttons: [
        { action: "ok", label: "Open", primary: true, disabled: true, onClick: () => { if (!selected) return false; chosen = selected; return true; } },
        { action: "cancel", label: "Cancel" },
      ],
      onClose: async (reason) => {
        if (reason !== "ok" || !chosen) return;
        if (!(await confirmDiscard("open another design"))) return;
        if (chosen.recovery) {
          const rec = chosen.recovery;
          const entry = rec.fileId && index().find((x) => x.id === rec.fileId);
          loadDoc(rec.doc, entry ? { id: entry.id, name: entry.name, version: entry.version } : null);
          app.dirty = true;
          app.emit("history", {});
          app.toast(`Recovered "${rec.name || "Untitled"}"`, "info", 1800);
          return;
        }
        const e = chosen.entry;
        const data = readDesign(e.id);
        const doc = data && (data.doc || data);
        if (!validDoc(doc)) { app.toast(`"${e.name}" could not be read`, "error"); return; }
        doc.name = e.name;
        loadDoc(doc, { id: e.id, name: e.name, version: e.version });
        app.toast(`Opened "${e.name}" v${e.version || 1}`, "info", 1500);
      },
    });
    renderList();
    return handle;
  }

  // ------------------------------------------------------------------ export
  /** Visible bodies of every kind that can be written to a file (B-rep shapes and triangle meshes). */
  function visibleBodies() {
    const list = typeof app.allBodies === "function" ? app.allBodies() : app.bodies();
    return list.filter((b) => b.meta && b.meta.visible !== false && (b.shape || b.mesh));
  }
  function bodyColor(b) {
    const ap = app.appearances && b.meta && app.appearances[b.meta.appearance];
    return ap && ap.color ? ap.color : undefined;
  }
  function stlBlob(bodies, { binary = true, refinement = "medium" } = {}) {
    const tol = { low: [0.5, 0.6], medium: [0.1, 0.3], high: [0.02, 0.12] }[refinement] || [0.1, 0.3];
    const R = app.K.R;
    if (bodies.some((b) => !b.shape)) {
      // mesh bodies take part: triangulate the B-rep bodies and write one STL with every body's triangles
      const MD = app.M.meshOps;
      const soups = [];
      for (const b of bodies) {
        if (b.mesh) { soups.push(MD.soup(b.mesh)); continue; }
        if (!b.shape) continue;
        const m = b.shape.mesh({ tolerance: tol[0], angularTolerance: tol[1] });
        soups.push(MD.soup({ positions: Float32Array.from(m.vertices), indices: Uint32Array.from(m.triangles) }));
      }
      const name = safeFileName(app.doc.name || "Untitled");
      return binary ? new Blob([MD.stlBinary(soups, name)], { type: "model/stl" }) : new Blob([MD.stlAscii(soups, name)], { type: "model/stl" });
    }
    let shape = bodies[0].shape;
    if (bodies.length > 1) {
      try { shape = R.makeCompound(bodies.map((b) => b.shape)); } catch (e) { console.warn("compound failed, exporting the first body", e); }
    }
    return shape.blobSTL({ binary, tolerance: tol[0], angularTolerance: tol[1] });
  }
  function designJsonBlob() {
    return new Blob([JSON.stringify({ format: "fusion-recreation-design", version: 1, savedAt: Date.now(), doc: app.doc }, null, 1)], { type: "application/json" });
  }
  function doExport(type, name, o = {}) {
    const base = safeFileName(name || app.doc.name);
    let blob, file;
    if (type === "json") { blob = designJsonBlob(); file = `${base}.json`; }
    else {
      const bodies = o.bodies || visibleBodies();
      if (!bodies.length) throw new Error("There are no visible bodies to export");
      if (type === "step") {
        // STEP holds B-rep bodies only (like Fusion, mesh bodies are not written)
        const brep = bodies.filter((b) => b.shape);
        if (!brep.length) throw new Error("STEP files hold solid and surface bodies; convert mesh bodies first or export STL");
        if (brep.length < bodies.length) app.toast("Mesh bodies are not included in STEP files", "info", 2600);
        const items = brep.map((b) => ({ shape: b.shape, name: (b.meta && b.meta.name) || b.id, color: bodyColor(b) }));
        blob = app.K.exportSTEPBlob ? app.K.exportSTEPBlob(items) : app.K.R.exportSTEP(items);
        file = `${base}.step`;
      } else if (type === "stl") {
        blob = stlBlob(bodies, o);
        file = `${base}.stl`;
      } else throw new Error(`Unknown export type ${type}`);
    }
    if (!blob || !blob.size) throw new Error("The export produced an empty file");
    F.lastExport = { name: file, type, size: blob.size };
    download(blob, file);
    app.emit("file", { action: "export", type, name: file, size: blob.size });
    app.toast(`Exported ${file} (${fmtBytes(blob.size)})`, "info", 2200);
    return F.lastExport;
  }

  /** Fusion's Export dialog: Name, Type, Save to my computer (+ Location), Cancel / Export. */
  function exportDialog() {
    const name = el("input", { type: "text", class: "mn-input", value: app.doc.name || "Untitled", "data-input": "name", spellcheck: "false" });
    const type = el("select", { class: "mn-select", "data-input": "type" },
      el("option", { value: "json", text: "Fusion Archive Files (*.json)" }),
      el("option", { value: "step", text: "STEP Files (*.stp *.step)" }),
      el("option", { value: "stl", text: "STL Files (*.stl)" }));
    const refSel = el("select", { class: "mn-select", "data-input": "refinement" },
      el("option", { value: "low", text: "Low" }), el("option", { value: "medium", text: "Medium", selected: true }), el("option", { value: "high", text: "High" }));
    const stlOpts = el("div", { class: "mn-row" }, el("span", { class: "mn-label", text: "Refinement" }), refSel);
    const toPc = el("input", { type: "checkbox", checked: true, "data-input": "save-to-computer" });
    const saveRow = el("label", { class: "mn-check" }, toPc, el("span", { text: "Save to my computer" }));
    const locRow = el("div", { class: "mn-row" }, el("span", { class: "mn-label", text: "Location" }),
      el("div", { class: "mn-location", title: "Your browser decides where downloads are saved" },
        el("span", { class: "mn-loc-ico", html: glyphHtml("folder", 16) }), el("span", { text: "Downloads" })),
      el("button", { type: "button", class: "mn-btn mn-dots", disabled: true, title: "Your browser decides where downloads are saved", text: "…" }));
    const info = el("div", { class: "mn-dim mn-export-info" });
    const err = el("div", { class: "mn-field-error" });
    const refresh = () => {
      const t = type.value;
      stlOpts.style.display = t === "stl" ? "" : "none";
      // only the design archive can be kept in My Designs (Fusion: export to the project)
      if (t !== "json") toPc.checked = true;
      toPc.disabled = t !== "json";
      saveRow.classList.toggle("mn-disabled", toPc.disabled);
      locRow.style.display = toPc.checked ? "" : "none";
      const n = visibleBodies().length;
      info.textContent = t === "json"
        ? (toPc.checked ? "The complete design (timeline, sketches, parameters). Open it again with File › Open › Open from my computer." : "The design is saved as a copy in My Designs (this browser).")
        : `${n} visible bod${n === 1 ? "y" : "ies"} will be exported.`;
    };
    type.addEventListener("change", refresh);
    toPc.addEventListener("change", refresh);
    modals.open({
      id: "FileExport",
      title: "Export",
      width: 440,
      className: "mn-export-dialog",
      body: el("div", { class: "mn-form" },
        el("label", { class: "mn-row" }, el("span", { class: "mn-label", text: "Name" }), name),
        el("label", { class: "mn-row" }, el("span", { class: "mn-label", text: "Type" }), type),
        stlOpts,
        el("div", { class: "mn-row" }, saveRow),
        locRow,
        info,
        err),
      buttons: [
        { action: "ok", label: "Export", primary: true, onClick: () => {
          const nm = name.value.trim() || app.doc.name || "Untitled";
          try {
            if (type.value === "json" && !toPc.checked) {
              const prev = { name: app.doc.name, fileId: app.doc.fileId, version: app.doc.savedVersion, dirty: app.dirty };
              const entry = writeDesign(newId(), nm);
              app.doc.name = prev.name; app.doc.fileId = prev.fileId; app.doc.savedVersion = prev.version; app.dirty = prev.dirty;
              app.toast(`Exported "${nm}" to My Designs`, "info", 2200);
              app.emit("file", { action: "export", type: "design", name: nm, id: entry.id });
            } else doExport(type.value, nm, { refinement: refSel.value });
          } catch (e) { err.textContent = e.message || String(e); return false; }
          return true;
        } },
        { action: "cancel", label: "Cancel" },
      ],
    });
    refresh();
  }

  /** Fusion's 3D Print dialog: pick bodies, STL format, refinement. */
  function print3dDialog(preselect = null) {
    const all = visibleBodies();
    if (!all.length) { app.toast("There are no visible bodies to print", "warning"); return; }
    const sel = new Set(preselect && preselect.length ? preselect : app.selection.items.filter((r) => r.kind === "body" || r.kind === "face" || r.kind === "edge").map((r) => r.body));
    const useAll = sel.size === 0;
    const rows = el("div", { class: "mn-body-list" });
    for (const b of all) {
      const cb = el("input", { type: "checkbox", checked: useAll || sel.has(b.id), "data-input": `body:${b.id}` });
      rows.appendChild(el("label", { class: "mn-check" }, cb, el("span", { class: "mn-body-ico", html: glyphHtml("body", 14) }), el("span", { text: (b.meta && b.meta.name) || b.id })));
    }
    const fmt = el("select", { class: "mn-select", "data-input": "format" }, el("option", { value: "binary", text: "STL (Binary)" }), el("option", { value: "ascii", text: "STL (ASCII)" }));
    const ref = el("select", { class: "mn-select", "data-input": "refinement" }, el("option", { value: "low", text: "Low" }), el("option", { value: "medium", text: "Medium", selected: true }), el("option", { value: "high", text: "High" }));
    const err = el("div", { class: "mn-field-error" });
    const send = el("label", { class: "mn-check mn-disabled" }, el("input", { type: "checkbox", disabled: true }), el("span", { text: "Send to 3D Print Utility" }));
    modals.open({
      id: "FileExportSTL",
      title: "3D Print",
      width: 400,
      body: el("div", { class: "mn-form" },
        el("div", { class: "mn-group", text: "Selection" }),
        rows,
        el("div", { class: "mn-group", text: "Output" }),
        el("label", { class: "mn-row" }, el("span", { class: "mn-label", text: "Format" }), fmt),
        el("label", { class: "mn-row" }, el("span", { class: "mn-label", text: "Refinement" }), ref),
        el("div", { class: "mn-row" }, el("span", { class: "mn-label", text: "" }), send),
        err),
      buttons: [
        { action: "ok", label: "OK", primary: true, onClick: () => {
          const ids = [...rows.querySelectorAll("input[type=checkbox]")].filter((c) => c.checked).map((c) => c.dataset.input.slice(5));
          const bodies = all.filter((b) => ids.includes(b.id));
          if (!bodies.length) { err.textContent = "Select at least one body"; return false; }
          const nm = bodies.length === 1 && all.length > 1 ? `${app.doc.name || "Untitled"} - ${(bodies[0].meta && bodies[0].meta.name) || bodies[0].id}` : app.doc.name;
          try { doExport("stl", nm, { bodies, binary: fmt.value === "binary", refinement: ref.value }); } catch (e) { err.textContent = e.message || String(e); return false; }
          return true;
        } },
        { action: "cancel", label: "Cancel" },
      ],
    });
  }

  // offer the recovery document once after start-up
  app.on("ready", () => {
    const rec = recovery();
    if (rec && rec.dirty && rec.doc.features.length) app.toast(`Unsaved changes to "${rec.name || "Untitled"}" were recovered: open them from File › Open`, "info", 6000);
  });

  /** Open a saved design by id (asks about unsaved changes first). Used by the Data Panel. */
  async function openById(id) {
    const e = index().find((x) => x.id === id);
    if (!e) { app.toast("That design no longer exists", "error"); return false; }
    if (!(await confirmDiscard("open another design"))) return false;
    const data = readDesign(id);
    const doc = data && (data.doc || data);
    if (!validDoc(doc)) { app.toast(`"${e.name}" could not be read`, "error"); return false; }
    doc.name = e.name;
    loadDoc(doc, { id: e.id, name: e.name, version: e.version });
    app.toast(`Opened "${e.name}" v${e.version || 1}`, "info", 1500);
    return true;
  }

  return {
    F, index, readDesign, openById, deleteDesign, save, saveAs, saveDialog, saveAsCmd, fileNew, openDialog,
    recoverySave, recovery, clearRecovery, exportDialog, print3dDialog, doExport, confirmDiscard, loadDoc,
    get current() { return F.current; },
    get lastExport() { return F.lastExport; },
  };
}
