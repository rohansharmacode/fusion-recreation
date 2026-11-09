// SCRIPTS AND ADD-INS (ScriptsManagerCommand, Shift+S): Fusion 2706's manager dialog (1064 x 711):
// left panel Search / Browse (Favorites, All scripts and add-ins) / Filters (Type, Status, Source),
// centre toolbar (+ menu, Edit in code editor, Open File Location, Unlink) over the table (Name, Run,
// Run on Startup), right Details panel (Information, Description, Full Path), Close. Running or
// editing an item closes the dialog like Fusion. "Create script or add-in" opens the New script or
// add-in dialog. Local equivalents: scripts live in browser storage, "Open File Location" downloads
// the script file, "Script or add-in from device" reads a .js file, the marketplace opens in a tab.
import { el, esc, GL, fmtDate } from "../ui.js";
import { TEMPLATE } from "./samples.js";

export const MARKETPLACE_URL = "https://apps.autodesk.com/en/FUSION";
const OS = ["Windows", "Mac", "Windows and Mac"];
const SRC_LABEL = { mine: "Created by me", linked: "From device", sample: "Samples", installed: "Installed", internal: "Fusion" };
const KIND_ICON = {
  script: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.8h6.5l3.5 3.5v8.9H3z" fill="#fff" stroke="#59636e" stroke-width="1"/><path d="M9.5 1.8v3.5H13" fill="none" stroke="#59636e" stroke-width="1"/><path d="M6.4 8l-1.7 1.7 1.7 1.7M9.6 8l1.7 1.7-1.7 1.7" fill="none" stroke="#1f86e0" stroke-width="1.1"/></svg>',
  addin: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5.5h3V4a1.6 1.6 0 0 1 3.2 0v1.5h3v3h-1.4a1.6 1.6 0 0 0 0 3.2h1.4v2.8h-9.2z" fill="#e9f3fc" stroke="#1f6fb8" stroke-width="1"/></svg>',
};

export function vpath(s) {
  if (s.origin === "sample") return `Browser storage/Samples/${s.name}/${s.name}.js`;
  if (s.origin === "linked") return `Browser storage/Linked/${s.fileName || `${s.name}.js`}`;
  return `Browser storage/${s.isAddIn ? "AddIns" : "Scripts"}/${s.name}/${s.name}.js`;
}

export function openScriptsManager(app, mg, opts = {}) {
  const modals = app.ui.modals;
  if (!modals) { app.toast("Scripts and Add-Ins needs the dialog service", "warning"); return null; }
  const { store, host } = mg;
  const st = {
    search: "", favorites: false,
    f: { scripts: false, addins: false, running: false, startup: false, installed: false, linked: false, mine: false, internal: false, samples: false },
    sel: opts.select || null, sortDir: 1,
    filtersOpen: true, browseOpen: true,
  };

  // ------------------------------------------------------------------ data
  function rows() {
    const q = st.search.trim().toLowerCase();
    const f = st.f;
    const typeOn = f.scripts || f.addins, statusOn = f.running || f.startup, srcOn = f.installed || f.linked || f.mine || f.internal || f.samples;
    return store.list().filter((s) => {
      if (q && !`${s.name} ${s.description || ""}`.toLowerCase().includes(q)) return false;
      if (st.favorites && !s.isFavorite) return false;
      if (typeOn && !((f.scripts && !s.isAddIn) || (f.addins && s.isAddIn))) return false;
      if (statusOn && !((f.running && host.isRunning(s.id)) || (f.startup && s.isAddIn && s.runOnStartup))) return false;
      if (srcOn && !((f.mine && s.origin === "mine") || (f.linked && s.origin === "linked") || (f.samples && s.origin === "sample"))) return false;
      return true;
    }).sort((a, b) => st.sortDir * a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }
  const selected = () => (st.sel ? store.get(st.sel) : null);

  // ------------------------------------------------------------------ DOM
  const root = el("div", { class: "mg-sm" });
  const left = el("div", { class: "mg-sm-left" });
  const center = el("div", { class: "mg-sm-center" });
  const right = el("div", { class: "mg-sm-right", "data-region": "details" });
  root.append(left, el("div", { class: "mg-sm-div" }), center, el("div", { class: "mg-sm-div" }), right);

  // left: search + browse + filters
  const search = el("input", { type: "search", class: "mg-sm-search", placeholder: "Search", "data-input": "search", spellcheck: "false" });
  search.addEventListener("input", () => { st.search = search.value; renderTable(); });
  left.append(el("div", { class: "mg-sm-searchbox" }, el("span", { class: "mg-sm-searchicon", html: GL.search }), search));
  const accordion = (title, key, body) => {
    const head = el("button", { type: "button", class: "mg-acc-head", "data-acc": key }, el("span", { text: title }), el("span", { class: "mg-acc-caret", html: GL.caret }));
    const wrap = el("div", { class: "mg-acc" }, head, body);
    const sync = () => wrap.classList.toggle("closed", !st[key]);
    head.addEventListener("click", () => { st[key] = !st[key]; sync(); });
    sync();
    return wrap;
  };
  const favBtn = el("button", { type: "button", class: "mg-sm-action", "data-browse": "favorites" }, el("span", { class: "mg-sm-aicon", html: GL.star }), el("span", { text: "Favorites" }));
  favBtn.addEventListener("click", () => { st.favorites = !st.favorites; renderLeft(); renderTable(); });
  const allBtn = el("button", { type: "button", class: "mg-sm-action", "data-browse": "all" }, el("span", { class: "mg-sm-aicon" }), el("span", { text: "All scripts and add-ins" }));
  allBtn.addEventListener("click", () => { resetFilters(); });
  left.append(accordion("Browse", "browseOpen", el("div", { class: "mg-acc-body mg-sm-browse" }, favBtn, allBtn)));
  const cb = (key, label) => {
    const c = el("input", { type: "checkbox", "data-filter": key });
    c.addEventListener("change", () => { st.f[key] = c.checked; renderTable(); });
    return el("label", { class: "mg-check" }, c, el("span", { text: label }));
  };
  const group = (title, items) => el("div", { class: "mg-sm-fgroup" }, el("div", { class: "mg-sm-fhead", text: title }), ...items);
  const filtersBody = el("div", { class: "mg-acc-body mg-sm-filters" },
    group("Type", [cb("scripts", "Scripts"), cb("addins", "Add-ins")]),
    group("Status", [cb("running", "Running"), cb("startup", "Run on startup")]),
    group("Source", [cb("installed", "Installed"), cb("linked", "From device"), cb("mine", "Created by me"), cb("internal", "Fusion"), cb("samples", "Samples")]));
  left.append(accordion("Filters", "filtersOpen", filtersBody));
  function renderLeft() {
    favBtn.classList.toggle("on", st.favorites);
    favBtn.querySelector(".mg-sm-aicon").innerHTML = st.favorites ? GL.starOn : GL.star;
    for (const c of filtersBody.querySelectorAll("[data-filter]")) c.checked = !!st.f[c.dataset.filter];
  }
  function resetFilters() {
    st.search = ""; search.value = ""; st.favorites = false;
    for (const k of Object.keys(st.f)) st.f[k] = false;
    renderLeft(); renderTable();
  }

  // centre: toolbar + table
  const tbtn = (act, glyph, title) => el("button", { type: "button", class: "mg-sm-tbtn", "data-action": act, title, html: glyph });
  const addBtn = tbtn("add", `${GL.plus}<span class="mg-sm-tcaret">${GL.caret}</span>`, "Add");
  const editBtn = tbtn("edit", GL.edit, "Edit in code editor\nEdits the currently selected script or add-in.");
  const openBtn = tbtn("open-location", GL.folder, "Open File Location\nOpens the folder containing the selected script or add-in (downloads the script file in this recreation).");
  const unlinkBtn = tbtn("unlink", GL.unlink, "Unlink\nRemoves the linked script or add-in from the list.");
  center.append(el("div", { class: "mg-sm-toolbar" }, addBtn, editBtn, openBtn, unlinkBtn));
  addBtn.classList.add("mg-sm-addbtn");
  addBtn.addEventListener("click", () => {
    const r = addBtn.getBoundingClientRect();
    app.ui.menu.open([
      { label: "Download add-ins from marketplace", key: "marketplace", onClick: () => app.commands.run("ExchangeAppStoreCommand") },
      { label: "Script or add-in from device", key: "link", onClick: () => linkFromDevice() },
      { label: "Create script or add-in", key: "create", onClick: () => openNewScript() },
    ], { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }, { className: "mg-sm-addmenu" });
  });
  editBtn.addEventListener("click", () => { const s = selected(); if (s) { close(); mg.edit(s.id); } });
  openBtn.addEventListener("click", () => { const s = selected(); if (s) openLocation(s); });
  unlinkBtn.addEventListener("click", () => { const s = selected(); if (s && s.origin === "linked") unlink(s); });

  const table = el("div", { class: "mg-sm-table", role: "grid", "data-region": "table" });
  const headName = el("div", { class: "mg-sm-th mg-sm-c-name", "data-col": "name" }, el("span", { text: "Name" }), el("span", { class: "mg-sm-sort" }));
  headName.addEventListener("click", () => { st.sortDir = -st.sortDir; renderTable(); });
  const head = el("div", { class: "mg-sm-tr mg-sm-thead" }, headName, el("div", { class: "mg-sm-th mg-sm-c-run", text: "Run" }), el("div", { class: "mg-sm-th mg-sm-c-start", text: "Run on Startup" }));
  const tbody = el("div", { class: "mg-sm-tbody" });
  table.append(head, tbody);
  center.append(table);

  function renderTable() {
    const list = rows();
    headName.querySelector(".mg-sm-sort").innerHTML = st.sortDir > 0 ? "&#9650;" : "&#9660;";
    tbody.innerHTML = "";
    if (!list.length) {
      tbody.append(el("div", { class: "mg-sm-empty", "data-empty": "" },
        el("div", { class: "mg-sm-empty-title", text: "No Results" }),
        el("div", { class: "mg-sm-empty-desc", text: "There are no items based on your filters or search term" }),
        el("button", { type: "button", class: "mg-btn", "data-action": "clear-all", text: "Clear All", on: { click: () => resetFilters() } })));
    }
    for (const s of list) {
      const run = host.isRunning(s.id);
      const tr = el("div", { class: `mg-sm-tr${s.id === st.sel ? " sel" : ""}${run ? " running" : ""}`, "data-script": s.id, "data-name": s.name, role: "row" });
      const name = el("div", { class: "mg-sm-td mg-sm-c-name" }, el("span", { class: "mg-sm-kind", html: s.isAddIn ? KIND_ICON.addin : KIND_ICON.script }), el("span", { class: "mg-sm-name", text: s.name }), s.isFavorite ? el("span", { class: "mg-sm-favmark", html: GL.starOn }) : null);
      let runCell;
      if (s.isAddIn) {
        const sw = el("button", { type: "button", class: `mg-switch${run ? " on" : ""}`, "data-action": "toggle-run", role: "switch", "aria-checked": String(run), title: run ? "Stop" : "Run" }, el("span", { class: "mg-switch-knob" }));
        sw.addEventListener("click", (ev) => { ev.stopPropagation(); toggleRunning(s); });
        runCell = el("div", { class: "mg-sm-td mg-sm-c-run" }, sw);
      } else {
        const b = el("button", { type: "button", class: "mg-sm-runbtn", "data-action": "toggle-run", title: run ? "Stop" : "Run", html: run ? GL.stop : GL.play });
        b.addEventListener("click", (ev) => { ev.stopPropagation(); toggleRunning(s); });
        runCell = el("div", { class: "mg-sm-td mg-sm-c-run" }, b);
      }
      const start = el("div", { class: "mg-sm-td mg-sm-c-start" });
      if (s.isAddIn) {
        const c = el("input", { type: "checkbox", "data-action": "run-on-startup", checked: !!s.runOnStartup, title: "Run on Startup" });
        c.addEventListener("click", (ev) => ev.stopPropagation());
        c.addEventListener("change", () => { store.update(s.id, { runOnStartup: c.checked }); renderDetails(); });
        start.append(c);
      }
      tr.append(name, runCell, start);
      tr.addEventListener("click", () => { st.sel = s.id; for (const x of tbody.querySelectorAll(".sel")) x.classList.remove("sel"); tr.classList.add("sel"); renderDetails(); renderButtons(); });
      tr.addEventListener("dblclick", () => toggleRunning(s));
      tr.addEventListener("contextmenu", (ev) => { ev.preventDefault(); st.sel = s.id; renderTable(); rowMenu(s, ev); });
      tbody.append(tr);
    }
    renderButtons();
    renderDetails();
  }
  function renderButtons() {
    const s = selected();
    editBtn.disabled = !s;
    openBtn.disabled = !s;
    unlinkBtn.disabled = !(s && s.origin === "linked");
  }
  function rowMenu(s, ev) {
    const run = host.isRunning(s.id);
    app.ui.menu.open([
      { label: run ? "Stop" : "Run", key: "run", onClick: () => toggleRunning(s) },
      { label: s.isFavorite ? "Remove from favorite" : "Add to favorite", key: "fav", onClick: () => { store.update(s.id, { isFavorite: !s.isFavorite }); renderTable(); } },
      { label: "Open file location", key: "open", onClick: () => openLocation(s) },
      { label: "Edit in code editor", key: "edit", onClick: () => { close(); mg.edit(s.id); } },
      ...(s.origin === "linked" ? ["-", { label: "Unlink", key: "unlink", onClick: () => unlink(s) }] : []),
      ...(s.origin === "mine" ? ["-", { label: "Delete", key: "delete", onClick: () => deleteScript(s) }] : []),
      ...(s.origin === "sample" && s.source !== s.sampleSource ? ["-", { label: "Reset sample", key: "reset", onClick: () => { store.resetSample(s.id); renderTable(); } }] : []),
    ], { x: ev.clientX, y: ev.clientY }, { className: "mg-sm-rowmenu" });
  }

  // right: details
  function renderDetails() {
    const s = selected();
    right.innerHTML = "";
    if (!s) { right.append(el("div", { class: "mg-sm-nodetails", text: "Select an item to see details here" })); return; }
    const fav = el("button", { type: "button", class: `mg-sm-fav${s.isFavorite ? " on" : ""}`, "data-action": "favorite", title: s.isFavorite ? "Remove from favorite" : "Add to favorite", html: s.isFavorite ? GL.starOn : GL.star });
    fav.addEventListener("click", () => { store.update(s.id, { isFavorite: !s.isFavorite }); renderTable(); });
    const info = el("div", { class: "mg-sm-info" });
    const row = (k, v) => info.append(el("div", { class: "mg-sm-ik", text: k }), el("div", { class: "mg-sm-iv", text: v }));
    row("Author", s.author || "");
    row("Version", s.version || "");
    row("Supported OS", OS[s.targetOS] || OS[2]);
    row("Programming language", "JavaScript");
    const sec = (title, body) => {
      const open = { v: true };
      const h = el("button", { type: "button", class: "mg-acc-head" }, el("span", { text: title }), el("span", { class: "mg-acc-caret", html: GL.caret }));
      const w = el("div", { class: "mg-acc" }, h, el("div", { class: "mg-acc-body" }, body));
      h.addEventListener("click", () => { open.v = !open.v; w.classList.toggle("closed", !open.v); });
      return w;
    };
    const loc = el("a", { href: "#", class: "mg-link", "data-action": "open-location", text: "Open File Location" });
    loc.addEventListener("click", (ev) => { ev.preventDefault(); openLocation(s); });
    const meta = el("div", { class: "mg-sm-meta" }, `${SRC_LABEL[s.origin] || ""}${s.modified ? ` · modified ${fmtDate(s.modified)}` : ""}${host.isRunning(s.id) ? " · Running" : ""}`);
    right.append(
      el("div", { class: "mg-sm-dhead" }, el("b", { class: "mg-sm-dname", text: s.name }), fav),
      meta,
      sec("Information", info),
      sec("Description", el("div", { class: "mg-sm-desc", text: s.description || "" })),
      sec("Full Path", el("div", {}, el("div", { class: "mg-sm-path", text: vpath(s) }), loc)),
    );
  }

  // ------------------------------------------------------------------ actions
  function toggleRunning(s) {
    if (host.isRunning(s.id)) { host.stop(s); renderTable(); return; }
    if (!host.canCompile()) { modals.alert({ title: "Error", kind: "error", message: esc("This page's security policy does not allow scripts to run (Content-Security-Policy without 'unsafe-eval'). Open the recreation from its normal web address to run scripts.") }); return; }
    // running a script closes the dialog; an add-in's Run switch just turns on (the dialog stays)
    if (!s.isAddIn) close();
    mg.run(s.id).then(() => { if (s.isAddIn && !handle.closed) renderTable(); });
  }
  function openLocation(s) {
    const name = `${s.name}.js`.replace(/[\\/:*?"<>|]+/g, "_");
    app.download(name, s.source || "", "text/javascript").then((ok) => { if (ok) app.toast(`${name} downloaded (scripts are stored in this browser)`, "info", 2400); });
  }
  async function unlink(s) {
    const r = await modals.confirm({ title: "Unlink", kind: "question", message: `Remove <b>${esc(s.name)}</b> from the list?<br><br>The file on your device is not changed.`, buttons: [{ action: "ok", label: "Unlink", primary: true }, { action: "cancel", label: "Cancel" }] });
    if (r !== "ok") return;
    if (host.isRunning(s.id)) host.stop(s);
    store.remove(s.id);
    if (st.sel === s.id) st.sel = null;
    renderTable();
  }
  async function deleteScript(s) {
    const r = await modals.confirm({ title: "Delete", kind: "warning", message: `Delete <b>${esc(s.name)}</b>? It is removed from this browser's storage and cannot be recovered (use Open File Location first to keep a copy).`, buttons: [{ action: "ok", label: "Delete", primary: true }, { action: "cancel", label: "Cancel" }] });
    if (r !== "ok") return;
    if (host.isRunning(s.id)) host.stop(s);
    store.remove(s.id);
    if (st.sel === s.id) st.sel = null;
    renderTable();
  }
  function linkFromDevice() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".js,.mjs,.ts,text/javascript";
    inp.multiple = true;
    inp.style.display = "none";
    document.body.append(inp);
    inp.addEventListener("cancel", () => inp.remove()); // picker dismissed
    inp.addEventListener("change", async () => {
      const files = [...(inp.files || [])];
      inp.remove();
      let last = null;
      for (const f of files) {
        try {
          const text = await f.text();
          const base = f.name.replace(/\.(m?js|ts)$/i, "");
          const isAddIn = /\bfunction\s+stop\s*\(|addButtonDefinition/.test(text);
          let name = base, k = 1;
          while (store.nameTaken(name, isAddIn)) name = `${base}${++k}`;
          const descM = /^\s*\/\/\s*(.+)\n\s*\/\/\s*(.+)/.exec(text);
          last = store.create({ name, isAddIn, description: descM ? descM[2] : "", author: "", source: text, origin: "linked", fileName: f.name });
        } catch (e) {
          modals.alert({ title: "Error", kind: "error", message: esc(`Failed to add script.\n\n${e.message || e}`).replace(/\n/g, "<br>") });
        }
      }
      if (last) { st.sel = last.id; ensureVisible(last); renderTable(); }
    });
    inp.click();
  }
  function ensureVisible(s) {
    // like Fusion: offer to clear filters that would hide the new item
    if (rows().some((x) => x.id === s.id)) return;
    modals.confirm({
      title: "Script or Add-in Not Visible", kind: "question",
      message: "The newly created script or add-in is not visible with the current filters. Would you like to clear all filters to display it?",
      buttons: [{ action: "ok", label: "Clear Filters", primary: true }, { action: "cancel", label: "Keep Filters" }],
    }).then((r) => { if (r === "ok") { resetFilters(); st.sel = s.id; renderTable(); } });
  }
  function openNewScript() {
    openNewScriptDialog(app, mg, (created) => { st.sel = created.id; renderTable(); ensureVisible(created); scrollToSel(); });
  }
  function scrollToSel() { requestAnimationFrame(() => { const r = tbody.querySelector(".sel"); if (r) r.scrollIntoView({ block: "nearest" }); }); }

  // ------------------------------------------------------------------ modal
  const W = Math.min(1064, window.innerWidth - 40), H = Math.min(711, window.innerHeight - 40);
  const handle = modals.open({
    id: "ScriptsManagerCommand",
    title: "Scripts and Add-Ins",
    className: "mg-sm-modal",
    width: W, height: H,
    body: root,
    focus: ".mg-sm-search",
    buttons: [{ action: "close", label: "Close", primary: true }],
    enterSubmits: false,
    onClose: () => { offs.forEach((f) => f()); mg.manager = null; },
  });
  function close() { if (!handle.closed) handle.close("close"); }
  const offs = [app.on("script", () => { if (!handle.closed) renderTable(); }), store.onChange(() => { if (!handle.closed) renderTable(); })];
  renderLeft();
  renderTable();
  scrollToSel();
  const api = { handle, close, refresh: renderTable, select(id) { st.sel = id; renderTable(); scrollToSel(); }, state: st, newScript: openNewScript, rows };
  mg.manager = api;
  return api;
}

/** "New script or add-in" dialog (604 x 465): General Information, Programming Language and System, Folder Location. */
export function openNewScriptDialog(app, mg, onCreated) {
  const modals = app.ui.modals;
  const st = { isAddIn: false, nameEdited: false };
  const nameIn = el("input", { type: "text", class: "mg-in", "data-input": "name", value: "NewScript", placeholder: "Name", spellcheck: "false" });
  const descIn = el("textarea", { class: "mg-in mg-ta", "data-input": "description", placeholder: "Description", rows: "3" });
  const authorIn = el("input", { type: "text", class: "mg-in", "data-input": "author", placeholder: "Author" });
  const folderIn = el("input", { type: "text", class: "mg-in", "data-input": "folder", value: "Browser storage/Scripts", readonly: true, title: "Scripts are stored in this browser" });
  const osSel = el("select", { class: "mg-in", "data-input": "os" }, el("option", { value: "2", text: "Windows and Mac" }), el("option", { value: "0", text: "Windows" }), el("option", { value: "1", text: "Mac" }));
  const radio = (group, value, label, checked, disabled, title) => {
    const r = el("input", { type: "radio", name: group, value, checked, disabled, "data-input": `${group}:${value}` });
    return el("label", { class: `mg-radio${disabled ? " disabled" : ""}`, title: title || "" }, r, el("span", { text: label }));
  };
  const typeRow = el("div", { class: "mg-radios" }, radio("ns-type", "script", "Script", true), radio("ns-type", "addin", "Add-in", false));
  typeRow.addEventListener("change", () => {
    st.isAddIn = typeRow.querySelector("input:checked").value === "addin";
    if (!st.nameEdited) nameIn.value = st.isAddIn ? "NewAddIn" : "NewScript";
    folderIn.value = st.isAddIn ? "Browser storage/AddIns" : "Browser storage/Scripts";
  });
  nameIn.addEventListener("input", () => { st.nameEdited = true; });
  const desk = "Python and C++ scripts run in the Fusion desktop application; this browser recreation runs JavaScript";
  const langRow = el("div", { class: "mg-radios" }, radio("ns-lang", "cpp", "C++", false, true, desk), radio("ns-lang", "python", "Python", false, true, desk), radio("ns-lang", "javascript", "JavaScript", true));
  const tr = (label, ctl) => el("div", { class: "mg-ns-row" }, el("div", { class: "mg-ns-label", text: label }), el("div", { class: "mg-ns-ctl" }, ctl));
  const acc = (title, ...kids) => {
    const h = el("button", { type: "button", class: "mg-acc-head" }, el("span", { text: title }), el("span", { class: "mg-acc-caret", html: GL.caret }));
    const w = el("div", { class: "mg-acc" }, h, el("div", { class: "mg-acc-body" }, ...kids));
    h.addEventListener("click", () => w.classList.toggle("closed"));
    return w;
  };
  const folderBtn = el("button", { type: "button", class: "mg-sm-tbtn", title: "Scripts are stored in this browser's storage", html: GL.folder, on: { click: () => app.toast("Scripts and add-ins are stored in this browser's storage", "info", 2200) } });
  const body = el("div", { class: "mg-ns" },
    acc("General Information", tr("Create a new", typeRow), tr("Name", nameIn), tr("Description", descIn), tr("Author", authorIn)),
    acc("Programming Language and System", tr("Programming Language", langRow), tr("Target Operating System", osSel)),
    acc("Folder Location", el("div", { class: "mg-ns-folder" }, folderIn, folderBtn)));
  let created = null;
  modals.open({
    id: "NewScriptDialog",
    title: "New script or add-in",
    className: "mg-ns-modal",
    width: Math.min(604, window.innerWidth - 40),
    body,
    focus: '[data-input="name"]',
    buttons: [
      { action: "ok", label: "Create", primary: true, onClick: () => {
        const name = nameIn.value.trim();
        let err = null;
        if (!name) err = "The name cannot be empty.";
        else if (/[\\/:*?"<>|]/.test(name)) err = "The name contains characters that cannot be used in a file name.";
        else if (mg.store.nameTaken(name, st.isAddIn)) err = `A ${st.isAddIn ? "add-in" : "script"} named "${name}" already exists.`;
        if (err) { modals.alert({ title: "Error", kind: "error", message: esc(`Failed to create script.\n\n${err}`).replace(/\n/g, "<br>") }); return false; }
        const desc = descIn.value.trim();
        created = mg.store.create({ name, isAddIn: st.isAddIn, description: desc, author: authorIn.value.trim(), targetOS: Number(osSel.value), source: (st.isAddIn ? TEMPLATE.addin : TEMPLATE.script)(name, desc), origin: "mine" });
        return true;
      } },
      { action: "cancel", label: "Cancel" },
    ],
    onClose: (reason) => { if (reason === "ok" && created && onCreated) onCreated(created); },
  });
}
