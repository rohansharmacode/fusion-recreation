// Workspace chrome around the toolbar: what the bottom strip, the browser and the canvas show when a workspace
// other than Design is active (core: app.registerWorkspace / app.setWorkspace / 'workspace' event), the
// placeholder for workspaces no module has registered, the environment finish fallbacks, and
// NextWorkspace / PreviousWorkspace (Ctrl+] / Ctrl+[).
import { el } from "./common.js";
import { CONTEXTUAL_TABS, MODE_TOOLBARS } from "./spec.js";

const DESIGN = "FusionSolidEnvironment";
// What Fusion shows in the bottom strip of each workspace (the design timeline belongs to Design only).
const BOTTOM_LABEL = { FusionRenderEnvironment: "RENDERING GALLERY", Publisher3DEnvironment: "STORYBOARD" };

export function installWorkspaces(app) {
  let cleanup = [];
  const runCleanup = () => { for (const fn of cleanup.splice(0)) { try { fn(); } catch (e) { console.error(e); } } };

  function apply({ id, def } = {}) {
    runCleanup();
    const cur = id || app.workspace || DESIGN;
    try { document.body.dataset.workspace = cur; } catch { /* no body */ }
    const tl = app.dom.timeline;
    const br = app.dom.browserHost;
    const wsHost = app.dom.workspace;
    if (cur === DESIGN) { app.emit("layout", { workspace: cur }); return; }
    def = def || (app.workspaceDef ? app.workspaceDef(cur) : null);
    const entry = (app.workspaceList ? app.workspaceList() : []).find((w) => w.id === cur) || { label: cur };

    // bottom strip: the workspace's own (def.timeline(host, app)), nothing (false), or a labelled placeholder
    if (tl) {
      const kids = [...tl.children];
      for (const k of kids) k.style.display = "none";
      cleanup.push(() => { for (const k of kids) k.style.display = ""; });
      if (def && def.timeline === false) {
        tl.classList.add("ws-bottom-hidden");
        cleanup.push(() => tl.classList.remove("ws-bottom-hidden"));
      } else {
        const bottom = el("div", "ws-bottom", { "data-ws-bottom": cur });
        tl.append(bottom);
        cleanup.push(() => bottom.remove());
        if (def && typeof def.timeline === "function") {
          let dispose = null;
          try { dispose = def.timeline(bottom, app); } catch (e) { app.reportError(e, { where: entry.label }); }
          if (typeof dispose === "function") cleanup.push(dispose);
        } else if (BOTTOM_LABEL[cur]) bottom.append(el("span", "ws-bottom-label", { text: BOTTOM_LABEL[cur] }));
      }
    }
    // browser
    if (br && def && def.browser === false) {
      const prev = br.style.visibility;
      br.style.visibility = "hidden";
      cleanup.push(() => { br.style.visibility = prev; });
    }
    // canvas overlay of a registered workspace
    if (wsHost && def && typeof def.canvas === "function") {
      const layer = el("div", "ws-canvas-layer", { "data-ws-canvas": cur });
      wsHost.append(layer);
      cleanup.push(() => layer.remove());
      try { const d = def.canvas(layer, app); if (typeof d === "function") cleanup.push(d); } catch (e) { app.reportError(e, { where: entry.label }); }
    }
    // placeholder card for workspaces nobody built yet
    if (wsHost && !def) {
      const back = el("button", "ws-ph-back", { type: "button", "data-action": "back-to-design", text: "Back to Design" });
      back.addEventListener("click", () => app.setWorkspace(DESIGN));
      const card = el("div", "ws-placeholder", { "data-ws-placeholder": cur },
        el("div", "ws-ph-title", { text: `${entry.label} workspace` }),
        el("div", "ws-ph-text", { text: `The ${entry.label} workspace isn't built yet in this unofficial recreation. Its toolbar matches Fusion's; its tools say so when you use them.` }),
        back);
      wsHost.append(card);
      cleanup.push(() => card.remove());
    }
    app.emit("layout", { workspace: cur });
  }
  app.on("workspace", apply);

  // ---- commands
  const reg = (d) => { const p = app.commands.get(d.id); if (!p || p.stub || p.wsFallback) app.commands.register({ kind: "ui", wsFallback: true, ...d }); };
  const step = (dir) => {
    const list = app.workspaceList ? app.workspaceList() : [];
    if (!list.length) return;
    const i = Math.max(0, list.findIndex((w) => w.id === (app.workspace || DESIGN)));
    app.setWorkspace(list[(i + dir + list.length) % list.length].id);
  };
  reg({ id: "NextWorkspace", label: "Next Workspace", tooltip: "Switches to the next workspace.", shortcut: "Ctrl+]", run: () => step(1) });
  reg({ id: "PreviousWorkspace", label: "Previous Workspace", tooltip: "Switches to the previous workspace.", shortcut: "Ctrl+[", run: () => step(-1) });

  // Finish commands of the contextual environments: until the module that owns an environment registers its own,
  // the green FINISH button (and the mode toolbars' end buttons) leave the environment through app.exitEnvironment.
  const envUsing = (cmdId) => {
    const envs = (app.environments || []).slice().reverse();
    return envs.find((e) => e.finishCommand === cmdId || (e.modeToolbar && endOf(e.modeToolbar) === cmdId)
      || (!e.finishCommand && CONTEXTUAL_TABS.some((c) => c.finish === cmdId && ((c.env && c.env === e.id) || c.mode === e.mode)))) || null;
  };
  const endOf = (mt) => { const s = typeof mt === "string" ? MODE_TOOLBARS[mt] : mt; return s && s.commands && s.commands.length ? s.commands[s.commands.length - 1] : null; };
  const finishIds = new Set();
  for (const c of CONTEXTUAL_TABS) if (c.finish && c.finish !== "SketchStop") finishIds.add(c.finish);
  for (const mt of Object.values(MODE_TOOLBARS)) { const e = endOf(mt); if (e) finishIds.add(e); }
  for (const id of finishIds) {
    const prev = app.commands.get(id);
    if (prev && !prev.stub) continue;
    app.commands.register({
      id, label: (prev && prev.label) || id, tooltip: (prev && prev.tooltip) || "", kind: "ui", wsFallback: true, envFinish: true,
      enabled: () => !!envUsing(id),
      run: () => { const e = envUsing(id); if (e) app.exitEnvironment(e.id, { reason: "finish" }); },
    });
  }
  return { apply };
}
