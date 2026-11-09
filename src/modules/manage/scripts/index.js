// Scripts and Add-Ins: store + host + manager dialog + code editor. Exposes app.ui.scripts (see README).
import { createScriptStore } from "./store.js";
import { createScriptHost, canCompile } from "./host.js";
import { openScriptsManager } from "./manager.js";
import { openCodeEditor } from "./editor.js";
import { openReference } from "../links.js";
import { beginModel } from "../ui.js";

export function registerScripts(app) {
  const store = createScriptStore(app);
  const host = createScriptHost(app);
  const mg = {
    store, host, manager: null,
    /** Run a script / start an add-in by id. Resolves {ok, error?, line?}. */
    async run(id, opts = {}) {
      const rec = store.get(id);
      if (!rec) return { ok: false, error: "Unknown script" };
      if (!opts.startup) beginModel(app);
      return host.run(rec, opts);
    },
    stop(id) { const rec = store.get(id); return rec ? host.stop(rec) : false; },
    edit(id) { return openCodeEditor(app, mg, id); },
    reference() { return openReference(app); },
    open(opts) { return openScriptsManager(app, mg, opts); },
    /** Create a script from source (tests / other modules). */
    create(rec) { return store.create(rec); },
    list: () => store.list(),
    canCompile,
  };
  app.ui.scripts = mg;
  app.commands.register({
    id: "ScriptsManagerCommand", label: "Scripts and Add-Ins", kind: "ui", shortcut: "Shift+S",
    tooltip: "Displays the Scripts and Add-Ins dialog box. Create, edit, run, stop, debug and manage Scripts and Add-Ins.",
    run: (a, ctx = {}) => { beginModel(a); return mg.open(ctx); },
  });
  // add-ins marked Run on Startup start when the app is ready (like Fusion at launch)
  app.on("ready", () => {
    if (!canCompile()) return;
    for (const s of store.list()) {
      if (s.isAddIn && s.runOnStartup) host.run(s, { startup: true }).catch((e) => console.warn("[manage] startup add-in failed", e));
    }
  });
  return mg;
}
