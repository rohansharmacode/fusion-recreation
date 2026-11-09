// Built-in code editor (Fusion opens VS Code from "Edit in code editor"; the browser recreation has
// its own palette): line-numbered text area with light syntax colouring, Save (Ctrl+S), Run / Stop
// (F5 / Shift+F5), Revert, Download, a link to the API reference, error-line marking and an
// Output pane with the script's log (console.log / app.log / errors).
import { el, esc, palette, GL } from "../ui.js";

const KW = /\b(async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|false|finally|for|function|if|import|in|instanceof|let|new|null|of|return|static|super|switch|this|throw|true|try|typeof|undefined|var|void|while|yield)\b/g;
function highlight(src) {
  // tokenise strings / comments first so keywords inside them stay plain
  const out = [];
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/g;
  let last = 0, m;
  const plain = (s) => esc(s).replace(KW, '<span class="mg-tk-kw">$1</span>').replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="mg-tk-num">$1</span>').replace(/\badsk\b/g, '<span class="mg-tk-adsk">adsk</span>');
  while ((m = re.exec(src))) {
    out.push(plain(src.slice(last, m.index)));
    const t = m[0];
    out.push(`<span class="${t.startsWith("/") ? "mg-tk-com" : "mg-tk-str"}">${esc(t)}</span>`);
    last = m.index + t.length;
  }
  out.push(plain(src.slice(last)));
  return out.join("") + "\n";
}

// unsaved editor text of closed editors (script id -> { base: source it was based on, text }): closing with X or Esc keeps the edits for the next open
const DRAFTS = new Map();

export function openCodeEditor(app, mg, id) {
  const { store, host } = mg;
  let rec = store.get(id);
  if (!rec) { app.toast("That script no longer exists", "warning"); return null; }
  const pid = `code-editor:${id}`;
  let saved = rec.source;
  let errLine = null;
  const ta = el("textarea", { class: "mg-ed-text", spellcheck: "false", autocapitalize: "off", autocomplete: "off", wrap: "off", "data-input": "source" });
  const draft = DRAFTS.get(id);
  if (draft && rec.source !== draft.base) DRAFTS.delete(id);
  ta.value = draft && rec.source === draft.base ? draft.text : rec.source;
  const hl = el("pre", { class: "mg-ed-hl", "aria-hidden": "true" });
  const gutter = el("div", { class: "mg-ed-gutter", "aria-hidden": "true" });
  const area = el("div", { class: "mg-ed-area" }, gutter, el("div", { class: "mg-ed-scroll" }, hl, ta));
  const out = el("div", { class: "mg-ed-out", "data-region": "output" });
  const status = el("span", { class: "mg-ed-status" });
  const btn = (act, label, glyph, title) => el("button", { type: "button", class: "mg-ed-btn", "data-action": act, title: title || label }, el("span", { class: "mg-ed-bi", html: glyph }), el("span", { text: label }));
  const runB = btn("run", "Run", GL.play, "Run (F5)");
  const stopB = btn("stop", "Stop", GL.stop, "Stop the add-in (Shift+F5)");
  const saveB = btn("save", "Save", GL.save, "Save (Ctrl+S)");
  const revertB = btn("revert", "Revert", GL.edit, "Discard unsaved changes");
  const dlB = btn("download", "Download", GL.download, "Download the script file");
  const refB = btn("reference", "API Reference", GL.info, "Reference of the script API in this recreation");
  const bar = el("div", { class: "mg-ed-bar" }, runB, stopB, saveB, revertB, dlB, el("span", { class: "mg-ed-sp" }), refB);
  const clearB = el("button", { type: "button", class: "mg-ed-link", "data-action": "clear-output", text: "Clear" });
  const body = el("div", { class: "mg-ed" }, bar, area, el("div", { class: "mg-ed-outhead" }, el("span", { text: "OUTPUT" }), el("span", { class: "mg-ed-sp" }), clearB), out, el("div", { class: "mg-ed-foot" }, status));

  const pal = palette(app, { id: pid, title: titleText(), body, width: 760, height: 560, className: "mg-ed-pal", foot: false, onClose: () => { offLog(); offScript(); if (ta.value !== saved) DRAFTS.set(id, { base: saved, text: ta.value }); else DRAFTS.delete(id); } });
  if (pal.body !== body.parentNode) { /* already open: palette() returned the existing window */ return pal; }

  function titleText() { return `${rec.name}.js${ta.value !== saved ? " ●" : ""}`; }
  function renderCode() {
    hl.innerHTML = highlight(ta.value);
    const n = ta.value.split("\n").length;
    let g = "";
    for (let i = 1; i <= n; i++) g += `<div class="${i === errLine ? "err" : ""}" data-line="${i}">${i}</div>`;
    gutter.innerHTML = g;
    pal.setTitle(`CODE EDITOR - ${titleText()}`);
    const running = host.isRunning(rec.id);
    stopB.style.display = rec.isAddIn ? "" : "none";
    stopB.disabled = !running;
    runB.disabled = rec.isAddIn && running;
    revertB.disabled = ta.value === saved;
    status.textContent = `${rec.isAddIn ? "Add-in" : "Script"} · JavaScript · ${n} lines${running ? " · Running" : ""}${ta.value !== saved ? " · Modified" : ""}`;
    syncScroll();
  }
  function syncScroll() { hl.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`; gutter.style.transform = `translateY(${-ta.scrollTop}px)`; }
  function save() {
    if (ta.value === saved) return true;
    rec = store.update(rec.id, { source: ta.value }) || rec;
    saved = ta.value;
    errLine = null;
    renderCode();
    app.toast(`Saved ${rec.name}.js`, "info", 1200);
    return true;
  }
  async function run() {
    save();
    errLine = null;
    renderCode();
    const r = await mg.run(rec.id);
    if (r && r.line) { errLine = r.line; renderCode(); goLine(r.line); }
    renderCode();
  }
  function goLine(n) {
    const lines = ta.value.split("\n");
    let pos = 0;
    for (let i = 0; i < n - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    try { ta.focus(); ta.setSelectionRange(pos, pos + (lines[n - 1] || "").length); } catch { /* ignore */ }
    const lh = 18;
    ta.scrollTop = Math.max(0, (n - 4) * lh);
    syncScroll();
  }
  function appendLog(line) {
    if (line.script && line.script !== rec.name) return;
    const row = el("div", { class: `mg-ed-log ${line.level}` }, el("span", { class: "mg-ed-time", text: new Date(line.t).toLocaleTimeString() }), el("span", { text: line.text }));
    out.append(row);
    out.scrollTop = out.scrollHeight;
  }
  for (const l of host.logLines.slice(-200)) appendLog(l);
  const offLog = host.onLog(appendLog);
  const offScript = app.on("script", () => renderCode());

  ta.addEventListener("input", () => { errLine = null; renderCode(); });
  ta.addEventListener("scroll", syncScroll);
  ta.addEventListener("keydown", (ev) => {
    if (ev.key === "Tab") {
      ev.preventDefault();
      const s = ta.selectionStart, e = ta.selectionEnd;
      if (s === e && !ev.shiftKey) { ta.setRangeText("    ", s, e, "end"); }
      else {
        // indent / outdent the selected lines
        const v = ta.value, ls = v.lastIndexOf("\n", s - 1) + 1;
        const block = v.slice(ls, e);
        const nb = ev.shiftKey ? block.replace(/^ {1,4}/gm, "") : block.replace(/^/gm, "    ");
        ta.setRangeText(nb, ls, e, "select");
      }
      ta.dispatchEvent(new Event("input"));
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") { ev.preventDefault(); ev.stopPropagation(); save(); return; }
    if (ev.key === "F5") { ev.preventDefault(); if (ev.shiftKey) { if (host.isRunning(rec.id)) host.stop(rec); } else run(); return; }
    if (ev.key === "Enter" && !ev.ctrlKey) {
      // keep the indentation of the current line
      ev.preventDefault();
      const s = ta.selectionStart, v = ta.value, ls = v.lastIndexOf("\n", s - 1) + 1;
      const ind = /^\s*/.exec(v.slice(ls, s))[0] + (/[{([]\s*$/.test(v.slice(ls, s)) ? "    " : "");
      ta.setRangeText(`\n${ind}`, s, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input"));
      return;
    }
    if (ev.key === "Escape") ev.stopPropagation();
  });
  runB.addEventListener("click", () => run());
  stopB.addEventListener("click", () => { host.stop(rec); renderCode(); });
  saveB.addEventListener("click", () => save());
  revertB.addEventListener("click", () => { ta.value = saved; errLine = null; renderCode(); });
  dlB.addEventListener("click", () => app.download(`${rec.name}.js`.replace(/[\\/:*?"<>|]+/g, "_"), ta.value, "text/javascript"));
  refB.addEventListener("click", () => mg.reference());
  clearB.addEventListener("click", () => { out.innerHTML = ""; });
  renderCode();
  setTimeout(() => { try { ta.focus({ preventScroll: true }); ta.setSelectionRange(0, 0); ta.scrollTop = 0; ta.scrollLeft = 0; syncScroll(); } catch { /* ignore */ } }, 30);
  pal.editor = { textarea: ta, save, run, get source() { return ta.value; }, set source(v) { ta.value = v; renderCode(); }, goLine };
  return pal;
}
