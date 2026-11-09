// Script / add-in library persisted in localStorage (try/catch through ui.store, memory fallback).
// Record: {id, name, isAddIn, description, author, version, language:'javascript', targetOS (0 Windows,
//          1 Mac, 2 Windows and Mac), source, origin:'mine'|'linked'|'sample', fileName?, isFavorite,
//          runOnStartup, created, modified}
// Samples are built in; their favourite / run-on-startup flags and edited source are stored as overrides.
import { store } from "../ui.js";
import { SAMPLES } from "./samples.js";

export const KEY = "fusionrec.manage.scripts.v1";

export function createScriptStore(app) {
  let data = load();
  const listeners = new Set();
  function load() {
    const d = store.get(KEY, null);
    return d && typeof d === "object" ? { scripts: Array.isArray(d.scripts) ? d.scripts.filter((s) => s && s.id && typeof s.source === "string") : [], samples: d.samples && typeof d.samples === "object" ? d.samples : {}, seq: d.seq || 0 } : { scripts: [], samples: {}, seq: 0 };
  }
  function save() {
    const ok = store.set(KEY, data);
    for (const fn of listeners) { try { fn(); } catch { /* ignore */ } }
    app.emit("scripts", {});
    return ok;
  }
  const sample = (s) => ({ ...s, ...(data.samples[s.id] || {}), id: s.id, origin: "sample", sampleSource: s.source });
  const api = {
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    reload() { data = load(); },
    list() { return [...data.scripts.map((s) => ({ ...s })), ...SAMPLES.map(sample)]; },
    get(id) {
      const s = data.scripts.find((x) => x.id === id);
      if (s) return { ...s };
      const sm = SAMPLES.find((x) => x.id === id);
      return sm ? sample(sm) : null;
    },
    nameTaken(name, isAddIn) { return api.list().some((s) => s.name.toLowerCase() === String(name).toLowerCase() && !!s.isAddIn === !!isAddIn); },
    /** Create a script / add-in. rec: {name, isAddIn, description, author, targetOS, source, origin, fileName} */
    create(rec) {
      data.seq = (data.seq || 0) + 1;
      const now = Date.now();
      const s = {
        id: `s${now.toString(36)}${data.seq}`, name: String(rec.name), isAddIn: !!rec.isAddIn, description: rec.description || "", author: rec.author || "",
        version: rec.version || "1.0.0", language: "javascript", targetOS: rec.targetOS ?? 2, source: rec.source || "", origin: rec.origin || "mine",
        fileName: rec.fileName || `${rec.name}.js`, isFavorite: false, runOnStartup: false, created: now, modified: now,
      };
      data.scripts.unshift(s);
      save();
      return { ...s };
    },
    update(id, patch) {
      const s = data.scripts.find((x) => x.id === id);
      if (s) { Object.assign(s, patch, { modified: Date.now() }); save(); return { ...s }; }
      const sm = SAMPLES.find((x) => x.id === id);
      if (!sm) return null;
      const o = data.samples[id] || {};
      for (const [k, v] of Object.entries(patch)) if (["isFavorite", "runOnStartup", "source"].includes(k)) o[k] = v;
      if (o.source === sm.source) delete o.source;
      data.samples[id] = o;
      save();
      return sample(sm);
    },
    /** Remove a linked / created script from the list (samples cannot be removed). */
    remove(id) {
      const n = data.scripts.length;
      data.scripts = data.scripts.filter((x) => x.id !== id);
      if (data.scripts.length !== n) { save(); return true; }
      return false;
    },
    resetSample(id) { delete data.samples[id]; save(); },
    get persistent() { return store.persistent; },
  };
  return api;
}
