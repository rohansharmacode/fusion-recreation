// Data Panel (slide-out project browser stub), Comments panel stub and a small modal helper.
import { el, glyph, frameThrottle, profileName, profileInitials } from "./common.js";

// ------------------------------------------------------------------ Data Panel
export function buildDataPanel(app, svc) {
  const mount = app.dom.root || document.getElementById("app") || document.body;
  const { tooltip } = svc;
  const root = el("aside", "dp-root", { "aria-label": "Data Panel", "aria-hidden": "true" });
  const head = el("div", "dp-head");
  const hub = el("button", "dp-hub", { type: "button", html: `<span class="dp-hub-badge">P</span><span class="dp-hub-name">Personal</span>${glyph("sh-caret", 10)}` });
  hub.addEventListener("click", () => app.toast("Hubs and teams aren't available in this unofficial recreation", "info"));
  const close = el("button", "dp-close", { type: "button", "aria-label": "Close Data Panel", "data-action": "close-data-panel", html: glyph("sh-close", 14) });
  close.addEventListener("click", () => setOpen(false));
  tooltip.attach(close, () => ({ title: "Close Data Panel", shortcut: "Ctrl+Alt+P", more: false }), { placement: "below", size: "small" });
  head.append(hub, close);

  const actions = el("div", "dp-actions");
  const upload = el("button", "dp-primary", { type: "button", html: `${glyph("sh-upload", 14)}<span>Upload</span>` });
  upload.addEventListener("click", () => app.toast("Upload isn't available here; use File > Open to load a design file", "info"));
  const folder = el("button", "dp-secondary", { type: "button", html: `${glyph("sh-folder", 14)}<span>New Folder</span>` });
  folder.addEventListener("click", () => app.toast("Folders aren't available in this unofficial recreation", "info"));
  actions.append(upload, folder);

  const crumbs = el("div", "dp-crumbs", null, el("span", "dp-crumb-root", { text: "Projects" }), el("span", "dp-crumb-sep", { html: glyph("sh-caret-right", 10) }), el("span", "dp-crumb", { text: "My Designs" }));
  const search = el("div", "dp-search", { html: glyph("sh-search", 14) });
  const searchInput = el("input", "dp-search-input", { type: "search", placeholder: "Search", "aria-label": "Search designs" });
  search.append(searchInput);
  const list = el("div", "dp-list", { role: "list" });
  const foot = el("div", "dp-foot", { text: "Designs are kept in this browser. Unofficial recreation." });
  root.append(head, actions, crumbs, search, list, foot);
  mount.appendChild(root);

  let open = false;
  let thumb = "";
  function captureThumb() {
    try {
      const c = app.viewport && app.viewport.canvas;
      if (!c || !c.width) return "";
      const t = document.createElement("canvas");
      const w = 96, h = 64;
      t.width = w; t.height = h;
      const g = t.getContext("2d");
      const s = Math.max(w / c.width, h / c.height);
      const dw = c.width * s, dh = c.height * s;
      g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
      g.drawImage(c, (w - dw) / 2, (h - dh) / 2, dw, dh);
      return t.toDataURL("image/png");
    } catch { return ""; }
  }
  function fmtTime(d) {
    try { return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
  }
  // Saved designs come from the File module (app.ui.files, menus) when it is present.
  function savedDesigns() {
    const f = app.ui.files;
    if (app.ui.shell && typeof app.ui.shell.listDesigns === "function") {
      const curId = f && f.current && f.current.id;
      return safeList(app.ui.shell.listDesigns).filter(Boolean).map((d) => ({ ...d, current: d.current !== undefined ? !!d.current : !!(curId && d.id === curId) }));
    }
    if (!f || typeof f.index !== "function") return [];
    const idx = safeList(() => f.index());
    const cur = f.current;
    return idx.map((e) => ({
      id: e.id, name: e.name || "Untitled", version: `v${e.version || 1}`, when: e.modified, thumb: e.thumb,
      current: !!(cur && cur.id === e.id), open: () => openSaved(f, e),
    }));
  }
  async function openSaved(f, e) {
    if (typeof f.confirmDiscard === "function" && !(await f.confirmDiscard("open another design"))) return;
    const data = f.readDesign(e.id);
    const doc = data && (data.doc || data);
    if (!doc || !Array.isArray(doc.features)) { app.toast(`"${e.name}" could not be read`, "error"); return; }
    doc.name = e.name;
    f.loadDoc(doc, { id: e.id, name: e.name, version: e.version });
    app.toast(`Opened "${e.name}" v${e.version || 1}`, "info", 1500);
  }
  function renderList() {
    list.innerHTML = "";
    const q = searchInput.value.trim().toLowerCase();
    const name = (app.doc && app.doc.name) || "Untitled";
    const saved = savedDesigns();
    const docs = [];
    if (!saved.some((d) => d.current)) docs.push({ name, current: true, when: new Date(), version: app.doc && app.doc.savedVersion ? `v${app.doc.savedVersion}` : "Not saved" });
    for (const d of saved) if (d && d.name) docs.push(d);
    let shown = 0;
    for (const d of docs) {
      if (q && !d.name.toLowerCase().includes(q)) continue;
      shown++;
      const img = d.current ? thumb || d.thumb || "" : d.thumb || "";
      const card = el("div", `dp-item${d.current ? " dp-item-current" : ""}`, { role: "listitem", "data-design": d.name });
      const th = el("div", "dp-thumb");
      if (img) th.append(el("img", null, { src: img, alt: "" })); else th.innerHTML = glyph("sh-doc", 28);
      const meta = el("div", "dp-meta", null,
        el("div", "dp-name", { text: d.name + (d.current && app.dirty ? "*" : "") }),
        el("div", "dp-sub", { text: `${d.version || "v1"}${d.when ? "  ·  " + fmtTime(d.when instanceof Date ? d.when : new Date(d.when)) : ""}${d.current ? "  ·  Open" : ""}` }));
      card.append(th, meta);
      card.addEventListener("click", () => {
        if (d.current) { setOpen(false); return; }
        if (typeof d.open === "function") {
          setOpen(false);
          Promise.resolve().then(() => d.open()).catch((e) => { console.error(e); app.toast(String(e.message || e), "error"); });
        }
        else app.toast("Use File > Open to open saved designs", "info");
      });
      list.append(card);
    }
    if (!shown) list.append(el("div", "dp-empty", { text: q ? "No designs match your search." : "No designs yet." }));
  }
  const safeList = (fn) => { try { const r = fn(); return Array.isArray(r) ? r : []; } catch { return []; } };
  searchInput.addEventListener("input", renderList);
  searchInput.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); setOpen(false); } });
  const schedule = frameThrottle(() => { if (open) renderList(); });
  app.on("doc", schedule);
  app.on("history", schedule);
  app.on("file", schedule);

  function setOpen(v) {
    v = !!v;
    if (v === open) return;
    open = v;
    if (open) { thumb = captureThumb(); renderList(); }
    root.classList.toggle("dp-open", open);
    root.setAttribute("aria-hidden", open ? "false" : "true");
    if (app.ui.shell) app.ui.shell.dataPanelOpen = open;
    app.emit("layout", { dataPanel: open });
  }
  return { setOpen, toggle: () => setOpen(!open), get open() { return open; }, el: root, refresh: renderList };
}

// ------------------------------------------------------------------ Comments
export function buildComments(app, svc) {
  const host = app.dom.commentsHost;
  if (!host) return null;
  const { tooltip } = svc;
  host.innerHTML = "";
  // Fusion: a white strip without border, "COMMENTS" on the left and a bold + on the right; it grows
  // upwards when expanded. The expand caret appears on hover.
  const root = el("div", "cm-root", { "data-panel-id": "comments" });
  const bar = el("div", "cm-bar");
  const toggle = el("button", "cm-toggle", { type: "button", "aria-expanded": "false", "aria-label": "Expand Comments", html: glyph("sh-caret-right", 12) });
  const title = el("span", "cm-title", { text: "COMMENTS" });
  const add = el("button", "cm-add", { type: "button", "aria-label": "Add comment", "data-action": "add-comment", html: glyph("sh-plus-sm") });
  tooltip.attach(add, () => ({ title: "Add comment", desc: "Comments stay in this browser tab only.", more: false }), { placement: "above", size: "large" });
  bar.append(toggle, title, el("span", "cm-count"), add);
  const body = el("div", "cm-body");
  const list = el("div", "cm-list");
  const form = el("div", "cm-form");
  const ta = el("textarea", "cm-input", { rows: "2", placeholder: "Add a comment", "aria-label": "Comment text" });
  const post = el("button", "cm-post", { type: "button", text: "Post" });
  form.append(ta, post);
  body.append(list, form);
  root.append(body, bar);
  host.append(root);

  const comments = [];
  let expanded = false, visible = true;
  function renderList() {
    list.innerHTML = "";
    if (!comments.length) list.append(el("div", "cm-empty", { text: "No comments yet." }));
    for (const c of comments) {
      list.append(el("div", "cm-item", null,
        el("div", "cm-item-head", null, el("span", "cm-avatar", { text: profileInitials() }), el("span", "cm-author", { text: profileName() }), el("span", "cm-when", { text: c.when })),
        el("div", "cm-text", { text: c.text })));
    }
    bar.querySelector(".cm-count").textContent = comments.length ? String(comments.length) : "";
  }
  function setExpanded(v) {
    expanded = !!v;
    root.classList.toggle("cm-expanded", expanded);
    toggle.innerHTML = glyph(expanded ? "sh-caret-line" : "sh-caret-right", 12);
    toggle.setAttribute("aria-expanded", String(expanded));
    if (expanded) { renderList(); setTimeout(() => ta.focus(), 0); }
    app.emit("layout", { comments: expanded ? "expanded" : "collapsed" });
  }
  function setVisible(v) {
    visible = !!v;
    host.style.display = visible ? "" : "none";
    app.emit("layout", { comments: visible });
  }
  function postComment() {
    const t = ta.value.trim();
    if (!t) return;
    let when = "";
    try { when = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch { when = ""; }
    comments.push({ text: t, when });
    ta.value = "";
    renderList();
  }
  toggle.addEventListener("click", () => setExpanded(!expanded));
  title.addEventListener("click", () => setExpanded(!expanded));
  add.addEventListener("click", () => setExpanded(true));
  post.addEventListener("click", postComment);
  ta.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); postComment(); }
    if (ev.key === "Escape") { ev.stopPropagation(); ta.blur(); setExpanded(false); }
  });
  renderList();
  return { setExpanded, setVisible, get visible() { return visible; }, get expanded() { return expanded; }, el: root };
}

// ------------------------------------------------------------------ modal
/** Small modal message box. buttons: [{label, value, primary?}] -> Promise<value> (Esc = cancel value). */
export function modal(app, { title, message, buttons, cancelValue = "cancel" }) {
  return new Promise((resolve) => {
    const overlay = app.dom.overlay || document.body;
    const back = el("div", "sh-modal-back");
    const box = el("div", "sh-modal", { role: "dialog", "aria-modal": "true", "aria-label": title });
    const head = el("div", "sh-modal-head", null, el("span", null, { text: title }));
    const x = el("button", "sh-modal-x", { type: "button", "aria-label": "Close", html: glyph("sh-close", 12) });
    head.append(x);
    const body = el("div", "sh-modal-body", { text: message });
    const foot = el("div", "sh-modal-foot");
    const done = (v) => { window.removeEventListener("keydown", onKey, true); back.remove(); resolve(v); };
    for (const b of buttons) {
      const btn = el("button", `sh-modal-btn${b.primary ? " sh-modal-primary" : ""}`, { type: "button", "data-action": b.value, text: b.label });
      btn.addEventListener("click", () => done(b.value));
      foot.append(btn);
    }
    x.addEventListener("click", () => done(cancelValue));
    function onKey(ev) {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); done(cancelValue); }
      else if (ev.key === "Enter") { const p = buttons.find((b) => b.primary); if (p) { ev.preventDefault(); ev.stopImmediatePropagation(); done(p.value); } }
    }
    window.addEventListener("keydown", onKey, true);
    box.append(head, body, foot);
    back.append(box);
    back.addEventListener("pointerdown", (ev) => { if (ev.target === back) ev.preventDefault(); });
    overlay.appendChild(back);
    const primary = foot.querySelector(".sh-modal-primary");
    if (primary) primary.focus();
  });
}
