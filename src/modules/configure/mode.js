// Configuration Mode: entered by Configure / Add Aspects. Configurable features in the Timeline and
// objects in the Browser are highlighted; clicking one opens its Configure dialog (check aspects to add
// them as columns). A bar at the top of the canvas shows the mode; its check mark exits it.
import * as D from "./data.js";
import { G } from "./glyphs.js";

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sandboxed */ } },
};
const KEY_INTRO = "fr.configure.modeIntroHidden";

export function createMode(app, ctl) {
  let active = false;
  let handler = null;
  let introShown = false; // the first-time card shows once per session (never again after "Don't show this again")
  const host = app.dom.workspace || document.body;

  const exitBtn = document.createElement("button");
  exitBtn.type = "button";
  exitBtn.className = "cfg-mode-ok";
  exitBtn.dataset.cfg = "exit-mode";
  exitBtn.title = "Exit Configuration Mode";
  exitBtn.innerHTML = G.check();
  const bar = document.createElement("div");
  bar.className = "cfg-modebar";
  bar.dataset.cfgMode = "";
  bar.innerHTML = `<span class="cfg-mode-ico">${G.table()}</span><span class="cfg-mode-label">Configuration</span>`;
  bar.append(exitBtn);
  bar.style.display = "none";
  host.appendChild(bar);
  exitBtn.addEventListener("click", () => exit());

  // first-time card (Fusion's ConfigurationModeONCmdFirstTime* strings)
  const intro = document.createElement("div");
  intro.className = "cfg-intro";
  intro.style.display = "none";
  intro.innerHTML = `<div class="cfg-intro-head"><b>Configuration Mode</b><button type="button" class="cfg-intro-x" title="Close">${G.close()}</button></div>
    <div class="cfg-intro-body">While you're in <b>Configuration Mode</b>, click highlighted objects in the <b>Browser</b> and features in the <b>Timeline</b> to configure:
    <ul><li>Feature Parameters</li><li>Suppression</li><li>Visibility</li><li>Physical Material</li><li>Appearance</li></ul>
    In the <b>Parameters</b> dialog, check to configure:<ul><li>User Parameters</li><li>Feature Parameters</li></ul>
    Configured aspects are added to the <b>Configuration Table</b> as columns, where you can assign different values per <b>Configuration</b>.</div>
    <label class="cfg-intro-foot"><input type="checkbox" class="cfg-intro-dna"> Don't show this again</label>`;
  host.appendChild(intro);
  const closeIntro = () => {
    intro.style.display = "none";
    if (intro.querySelector(".cfg-intro-dna").checked) store.set(KEY_INTRO, true);
  };
  intro.querySelector(".cfg-intro-x").addEventListener("click", closeIntro);

  // ------------------------------------------------------------------ click interception (capture phase)
  function targetOf(ev) {
    const t = ev.target;
    if (!t || !t.closest) return null;
    const tl = t.closest("#timeline .tl-item[data-feature]");
    if (tl) {
      const id = tl.dataset.feature;
      return app.feature(id) ? { kind: "feature", id, el: tl } : null;
    }
    const br = t.closest(".br-row[data-node]");
    if (br) {
      if (t.closest(".br-eye, .br-twisty, [data-expand], .br-radio, .br-right, .br-edit")) return null;
      const m = /^(body|sketch|cplane):(.+)$/.exec(br.dataset.node || "");
      if (!m) return null;
      if (m[1] === "body") return app.doc.bodies[m[2]] ? { kind: "body", id: m[2], el: br } : null;
      return app.feature(m[2]) ? { kind: "feature", id: m[2], el: br } : null;
    }
    return null;
  }
  const swallow = (ev) => {
    if (!active || ev.button !== 0) return;
    const tg = targetOf(ev);
    if (!tg) return;
    ev.stopPropagation();
    ev.preventDefault();
    if (ev.type === "pointerdown") ctl.configure({ kind: tg.kind, id: tg.id }, tg.el.getBoundingClientRect());
  };
  for (const type of ["pointerdown", "mousedown", "click", "dblclick"]) window.addEventListener(type, swallow, true);

  // ------------------------------------------------------------------ highlight of configured objects
  const style = document.createElement("style");
  style.dataset.cfgStyle = "";
  document.head.appendChild(style);
  function refreshMarks() {
    const t = D.configuredTargets(app.doc);
    const sel = [];
    for (const id of t.features) sel.push(`#timeline .tl-item[data-feature="${CSS.escape(id)}"]`, `.br-row[data-node="sketch:${CSS.escape(id)}"] .br-hl`, `.br-row[data-node="cplane:${CSS.escape(id)}"] .br-hl`);
    for (const id of t.bodies) sel.push(`.br-row[data-node="body:${CSS.escape(id)}"] .br-hl`);
    style.textContent = sel.length ? `body.cfg-mode ${sel.join(", body.cfg-mode ")} { box-shadow: inset 0 0 0 2px #1f78d1 !important; background-color: #cfe6fb !important; }` : "";
  }
  app.on("doc", refreshMarks);

  function enter() {
    if (active) return;
    active = true;
    document.body.classList.add("cfg-mode");
    bar.style.display = "";
    refreshMarks();
    if (!introShown && !store.get(KEY_INTRO, false)) { intro.style.display = ""; introShown = true; }
    handler = {
      name: "configuration-mode",
      onCancel: () => { if (app.activeCommand) return false; exit(); return true; },
    };
    app.input.push(handler);
    app.emit("configure", { mode: true });
  }
  function exit() {
    if (!active) return;
    active = false;
    document.body.classList.remove("cfg-mode");
    bar.style.display = "none";
    intro.style.display = "none";
    if (handler) { app.input.remove(handler); handler = null; }
    const cur = app.ui.dialog && app.ui.dialog.current;
    if (cur && /^Configure(Feature|Entity)Cmd$/.test(cur.id || "")) { try { cur.cancel(); } catch { /* ignore */ } }
    app.emit("configure", { mode: false });
  }
  return { enter, exit, get active() { return active; }, bar, refreshMarks };
}
