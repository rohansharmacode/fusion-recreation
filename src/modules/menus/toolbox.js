// S toolbox, as in Fusion: no panel — a title "<Environment> Shortcuts" (Design / Sketch), a row of the
// environment's shortcut icons and an underlined "Search" field, all floating at the cursor.
// Typing lists matching commands of the current environment in a bordered list (24 px icon + name,
// alphabetical, first row highlighted cyan). Arrow keys move, Enter runs, Esc closes, a click outside
// closes. Right-click a result -> "Pin to Shortcuts"; right-click a shortcut icon -> "Remove from Shortcuts".
import { el, esc, iconHtml, shortcutOf } from "./util.js";

export function createToolbox(app, opts = {}) {
  const S = { root: null, input: null, entries: [], active: -1, mode: "grid", removeInput: null, outside: null };
  const host = () => app.dom.overlay || document.body;
  const shortcuts = opts.shortcuts;

  function isOpen() { return !!S.root; }
  function close() {
    if (!S.root) return;
    S.root.remove();
    S.root = null;
    if (S.removeInput) { S.removeInput(); S.removeInput = null; }
    if (S.outside) { window.removeEventListener("pointerdown", S.outside, true); S.outside = null; }
    try { app.viewport && app.viewport.canvas && app.viewport.canvas.focus({ preventScroll: true }); } catch { /* ignore */ }
  }

  const pins = () => (shortcuts ? shortcuts.list() : []);
  function setPinned(id, on) { if (shortcuts) shortcuts.toggle(id, on); }

  function listable(d) { return d && !d.hidden && !d.alias && d.id !== "ShowToolbox" && !String(d.id).startsWith("_"); }
  /** Commands of the current environment (sketch tools only inside a sketch, like Fusion's toolbar). */
  // (mesh-environment commands are not offered in the Design environment's search, as in Fusion)
  // Outside the Design workspace only that workspace's commands (and app-wide ui/view ones) are offered; in a
  // contextual environment (Form, Base Feature ...) its own commands (when:<mode>) and the general ones.
  function inEnv(d) {
    const ws = app.workspace || "FusionSolidEnvironment";
    if (d.workspace && d.workspace !== ws) return false;
    if (ws !== "FusionSolidEnvironment" && !d.workspace && (d.kind === "feature" || d.kind === "tool")) return false;
    if (app.mode === "sketch") return true;
    if (app.mode !== "model") return !d.when || d.when === app.mode || (app.inMode ? app.inMode(d.when) : false);
    return d.when !== "sketch" && (!d.when || d.when === "model") && !/^ParaMesh/.test(d.id);
  }
  function envTitle() {
    const ws = app.workspace || "FusionSolidEnvironment";
    if (ws !== "FusionSolidEnvironment") { const w = (app.workspaceList ? app.workspaceList() : []).find((x) => x.id === ws); return w ? w.label : "Design"; }
    if (app.mode === "sketch") return "Sketch";
    const env = app.environment;
    if (env && env.label) return String(env.title || env.label).toLowerCase().replace(/w/g, (c) => c.toUpperCase());
    return "Design";
  }

  // Shortcut icons: the environment's list, without commands that cannot run right now (Fusion hides them).
  function gridIds() {
    return pins().filter((id) => {
      const d = app.commands.get(id);
      return listable(d) && !d.stub && (app.commands.isEnabled(id) || (d.when === "sketch" && app.mode !== "sketch"));
    });
  }

  function score(d, q, toks) {
    const label = String(d.label || d.id).toLowerCase();
    if (label.startsWith(q)) return 3;
    const words = label.split(/[\s/\-()]+/);
    if (toks.every((t) => words.some((w) => w.startsWith(t)))) return 2;
    if (toks.every((t) => label.includes(t) || String(d.id).toLowerCase().includes(t))) return 1;
    return 0;
  }

  function search(q) {
    q = q.trim().toLowerCase();
    const toks = q.split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    const rows = [];
    let order = 0;
    for (const d of app.commands.all()) {
      order++;
      if (!listable(d) || !inEnv(d)) continue;
      const s = score(d, q, toks);
      if (s > 0) rows.push({ d, s, order });
    }
    // name matches (whole name, then any word, starting with the text); looser matches only when there are none
    const best = rows.some((r) => r.s >= 2) ? rows.filter((r) => r.s >= 2) : rows;
    best.sort((a, b) => b.s - a.s
      || String(a.d.label || a.d.id).localeCompare(String(b.d.label || b.d.id), undefined, { sensitivity: "base" })
      || (a.d.stub ? 1 : 0) - (b.d.stub ? 1 : 0) || a.order - b.order);
    return best.slice(0, 40).map((r) => r.d);
  }

  function render() {
    const q = S.input.value;
    const grid = S.root.querySelector(".tbx-grid");
    const res = S.root.querySelector(".tbx-results");
    grid.innerHTML = "";
    res.innerHTML = "";
    S.entries = [];
    for (const id of gridIds()) {
      const d = app.commands.get(id);
      const cell = el("div", { class: "tbx-cell tbx-pinned", title: `${d.label || id}${shortcutOf(d) ? `  (${shortcutOf(d)})` : ""}`, dataset: { cmd: id } });
      cell.innerHTML = iconHtml(id, 16);
      grid.appendChild(cell);
      wire(cell, { id, enabled: true, grid: true });
    }
    S.mode = q.trim() ? "list" : "grid";
    if (S.mode === "grid") {
      res.style.display = "none";
      setActive(-1);
      return;
    }
    res.style.display = "";
    const found = search(q);
    if (!found.length) res.appendChild(el("div", { class: "tbx-empty", text: "No matching commands" }));
    for (const d of found) {
      // commands this recreation does not implement (stubs) are listed greyed out, like an unavailable command
      const enabled = !d.stub && (app.commands.isEnabled(d.id) || (d.when === "sketch" && app.mode !== "sketch"));
      const row = el("div", { class: `tbx-row${enabled ? "" : " tbx-disabled"}${d.stub ? " tbx-stub" : ""}`, dataset: { cmd: d.id }, "aria-disabled": enabled ? null : "true", title: d.stub ? `${d.label || d.id} is not available in this recreation` : (d.tooltip || "") });
      row.innerHTML = `<span class="tbx-ico">${iconHtml(d.id, 24)}</span><span class="tbx-row-label">${esc(d.label || d.id)}</span>`;
      res.appendChild(row);
      const e = { id: d.id, node: row, enabled };
      S.entries.push(e);
      wire(row, e, S.entries.length - 1);
    }
    setActive(S.entries.length ? firstEnabled() : -1);
  }

  function wire(node, e, index = -1) {
    node.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!opts.contextMenu) return;
      const on = pins().includes(e.id);
      opts.contextMenu.show([{ label: on ? "Remove from Shortcuts" : "Pin to Shortcuts", icon: false, run: () => { setPinned(e.id, !on); if (S.root) render(); } }], ev.clientX, ev.clientY);
    });
    if (index >= 0) node.addEventListener("pointerenter", () => setActive(index));
    node.addEventListener("pointerdown", (ev) => ev.preventDefault()); // keep focus in the search field
    node.addEventListener("click", () => runId(e.id, e.enabled));
  }

  function firstEnabled() {
    const i = S.entries.findIndex((e) => e.enabled);
    return i >= 0 ? i : 0;
  }

  function setActive(i) {
    S.active = i;
    S.entries.forEach((e, k) => e.node.classList.toggle("tbx-active", k === i));
    const e = S.entries[i];
    if (e) e.node.scrollIntoView({ block: "nearest" });
  }

  function move(dy) {
    const n = S.entries.length;
    if (!n) return;
    const i = S.active < 0 ? 0 : (S.active + dy + n) % n;
    setActive(i);
  }

  function runId(id, enabled) {
    const d = app.commands.get(id);
    if (!d) return;
    if (d.stub) { app.toast(`${d.label || id} isn't available in this unofficial recreation yet`, "info", 2200); return; }
    if (!enabled && !(d.when === "sketch" && app.mode !== "sketch" && opts.runInNewSketch)) {
      app.toast(`${d.label || id} is not available right now`, "info", 1600);
      return;
    }
    close();
    setTimeout(() => {
      if (d.when === "sketch" && app.mode !== "sketch" && id !== "SketchStop" && opts.runInNewSketch) { opts.runInNewSketch(id); return; }
      app.commands.run(id, { source: "toolbox" });
    }, 0);
  }

  function runEntry(i) {
    const e = S.entries[i];
    if (e) runId(e.id, e.enabled);
  }

  function open(x, y) {
    close();
    const input = el("input", { type: "text", class: "tbx-input", placeholder: "Search", spellcheck: "false", autocomplete: "off", "aria-label": "Search commands" });
    const title = `${envTitle()} Shortcuts`;
    const root = el("div", { class: "tbx-root", role: "dialog", "aria-label": title, dataset: { env: shortcuts && shortcuts.env ? shortcuts.env() : app.mode === "sketch" ? "sketch" : "model" } },
      el("div", { class: "tbx-title", text: title }),
      el("div", { class: "tbx-grid" }),
      el("div", { class: "tbx-search" }, input, el("div", { class: "tbx-results", style: { display: "none" } })));
    S.root = root;
    S.input = input;
    host().appendChild(root);
    render();
    // the search field opens under the cursor (centred on it), kept on screen
    const W = window.innerWidth, H = window.innerHeight;
    const w = root.offsetWidth, h = root.offsetHeight;
    const px = Math.max(10, Math.min(W - 250, x - w / 2));
    const py = Math.max(6, Math.min(H - h - 180, y - h + 16));
    root.style.left = `${Math.round(px)}px`;
    root.style.top = `${Math.round(py)}px`;

    input.addEventListener("input", render);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown") { ev.preventDefault(); move(1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); move(-1); }
      else if (ev.key === "Enter") {
        ev.preventDefault();
        if (S.mode === "list") runEntry(S.active >= 0 ? S.active : firstEnabled());
      }
      else if (ev.key === "Tab") { ev.preventDefault(); move(ev.shiftKey ? -1 : 1); }
      else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); }
    });
    root.addEventListener("contextmenu", (ev) => ev.preventDefault());
    S.removeInput = app.input.push({
      name: "toolbox", __menus: true, modal: true,
      onKeyDown(ev) {
        if (ev.key === "Escape") { close(); return true; }
        if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey && S.input) { S.input.focus(); S.input.value += ev.key; render(); return true; }
        return true;
      },
      onCancel() { close(); return true; },
    });
    S.outside = (ev) => { if (S.root && !S.root.contains(ev.target) && !(ev.target.closest && ev.target.closest(".mn-context"))) close(); };
    setTimeout(() => { if (S.root === root) window.addEventListener("pointerdown", S.outside, true); }, 0);
    requestAnimationFrame(() => { try { input.focus({ preventScroll: true }); } catch { /* ignore */ } });
    return root;
  }

  app.on("mode", () => close());
  app.on("shortcuts", () => { if (S.root) render(); });

  return { open, close, isOpen, search, pins, setPinned, get state() { return S; } };
}
