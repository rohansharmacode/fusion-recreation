// Active-configuration selector in the Browser (configured designs only): a row under the BROWSER header
// showing the active configuration; expanding it lists the configurations with a search field
// ("In the Browser, expand the list of Configurations, optionally search for any portion of a name, select
// a Configuration"). Lives in its own element inside the browser panel, outside the tree the browser re-renders.
import * as D from "./data.js";
import { G } from "./glyphs.js";

export function createSelector(app, ctl) {
  let open = false;
  let query = "";
  const root = document.createElement("div");
  root.className = "cfg-selector";
  root.dataset.cfgSelector = "";
  root.style.display = "none";

  function mount() {
    const br = app.ui.browser && app.ui.browser.element;
    if (!br) return false;
    if (root.parentNode !== br) {
      const body = br.querySelector(".br-body");
      if (body) br.insertBefore(root, body); else br.appendChild(root);
    }
    return true;
  }

  function render() {
    const c = D.get(app.doc);
    if (!c || !mount()) { root.style.display = "none"; return; }
    root.style.display = "";
    const act = D.activeRow(c);
    root.textContent = "";
    const head = document.createElement("div");
    head.className = "cfg-sel-row cfg-sel-head";
    head.dataset.cfgSelectorHead = "";
    head.title = "Active Configuration";
    head.innerHTML = `<span class="cfg-sel-tw">${open ? G.chevDown() : G.chevRight()}</span><span class="cfg-sel-ico">${G.table()}</span><span class="cfg-sel-name"></span>`;
    head.querySelector(".cfg-sel-name").textContent = act ? act.name : "";
    head.addEventListener("click", () => { open = !open; if (!open) query = ""; render(); if (open) { const s = root.querySelector("input"); if (s) s.focus(); } });
    head.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      const items = [{ label: "Display Configuration Table", onClick: () => ctl.showTable() }, { label: "Configure", onClick: () => ctl.startConfigure() }];
      if (app.ui.menu && app.ui.menu.open) app.ui.menu.open(items, { x: ev.clientX, y: ev.clientY }, { className: "cfg-menu" });
    });
    root.append(head);
    if (!open) return;
    const search = document.createElement("input");
    search.className = "cfg-sel-search";
    search.type = "search";
    search.placeholder = "Search";
    search.value = query;
    search.spellcheck = false;
    search.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") { open = false; query = ""; render(); } });
    search.addEventListener("input", () => { query = search.value; renderList(); search.focus(); });
    const wrap = document.createElement("div");
    wrap.className = "cfg-sel-search-wrap";
    wrap.innerHTML = G.search();
    wrap.append(search);
    root.append(wrap);
    const list = document.createElement("div");
    list.className = "cfg-sel-list";
    root.append(list);
    function renderList() {
      list.textContent = "";
      const q = query.trim().toLowerCase();
      for (const r of c.rows) {
        if (q && !r.name.toLowerCase().includes(q)) continue;
        const it = document.createElement("div");
        it.className = `cfg-sel-row cfg-sel-item${r.id === c.active ? " active" : ""}`;
        it.dataset.cfgOption = r.id;
        it.innerHTML = `<span class="cfg-sel-radio">${r.id === c.active ? G.active() : G.inactive()}</span><span class="cfg-sel-name"></span>`;
        it.querySelector(".cfg-sel-name").textContent = r.name;
        it.title = r.id === c.active ? "Active Configuration" : `Activate ${r.name}`;
        it.addEventListener("click", () => { if (r.id !== c.active) ctl.activate(r.id); });
        list.append(it);
      }
      if (!list.children.length) {
        const none = document.createElement("div");
        none.className = "cfg-sel-none";
        none.textContent = "No matching configurations";
        list.append(none);
      }
    }
    renderList();
  }
  let raf = 0;
  const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; render(); }); };
  app.on("doc", schedule);
  app.on("ready", schedule);
  app.on("layout", schedule);
  app.on("file", (d) => { if (d.action === "new" || d.action === "open") { open = false; query = ""; schedule(); } });
  return { render, element: root, get open() { return open; }, setOpen(v) { open = !!v; render(); } };
}
