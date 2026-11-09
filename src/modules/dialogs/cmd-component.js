// Components: New Component (FusionCreateNewComponentCommand), Create Components from Bodies, Activate Component,
// Pin / Unpin, Copy / Paste / Paste New, Capture Position / Revert Position and the POSITION environment shown while
// moved components are not captured yet. The model and API are app.components (src/app/components.js).
import { beginModelCommand } from "./common.js";

const ROOT = "root";
const occRef = (occ) => ({ kind: "occurrence", occ });

/** Selection rows: a body / face pick on the canvas stands for the occurrence that owns it. */
function toOccRef(app) {
  return (r) => {
    if (!r) return null;
    if (r.kind === "occurrence") return r.occ === ROOT ? null : r;
    if (r.body && app.components) { const o = app.components.ownerOf(r.body); return o && o !== ROOT ? occRef(o) : null; }
    return null;
  };
}
const toBody = (r) => (r && r.body ? { kind: "body", body: r.body } : null);

function nextDefaultName(app) {
  const comps = app.doc.components || {};
  const names = new Set(Object.values(comps).map((c) => c.name));
  let n = ((app.doc.counters && app.doc.counters.compName) || 0) + 1;
  while (names.has(`Component${n}`)) n++;
  return `Component${n}`;
}

/** Fusion's New Component dialog: Parent, From Bodies (+ Bodies), Component Name, Activate. */
export function openNewComponent(app, opts = {}) {
  const C = app.components;
  if (!C || !app.ui.dialog) return null;
  const pre = opts.preselect || [];
  const startParent = opts.parent && opts.parent !== ROOT && C.alive(opts.parent) ? opts.parent : C.active;
  const preBodies = pre.map(toBody).filter(Boolean);
  const name = nextDefaultName(app);
  return app.ui.dialog.open({
    id: "FusionCreateNewComponentCommand",
    title: "New Component",
    icon: "FusionCreateNewComponentCommand",
    featureLabel: "New Component",
    help: "Creates a new internal or external component in the assembly. Select type and parent, then name the component. For internal components, you can select bodies to create a component for each.",
    preview: false,
    noFeature: true,
    activate: false,
    ctrlWidth: 150,
    rows: [
      {
        id: "parent", type: "selection", label: "Parent", kinds: ["occurrence", "body", "face"], max: 1, min: 0, advance: false,
        mapRef: toOccRef(app), prompt: "Select parent component", tooltip: "Select parent component",
        selText: (n, dlg) => (n ? C.label(dlg.values.parent[0].occ) : C.label(ROOT)),
      },
      { id: "fromBodies", type: "check", label: "From Bodies", tooltip: "Check to create a separate component for each selected body", default: preBodies.length > 0 },
      {
        id: "bodies", type: "selection", label: "Bodies", kinds: ["body", "face"], meshBodies: true, mapRef: toBody, prompt: "Select bodies",
        visible: (v) => !!v.fromBodies, filter: (r) => !!r.body && !r.body.includes("@"),
      },
      {
        id: "name", type: "custom", visible: (v) => !v.fromBodies,
        render(dlg) {
          const row = document.createElement("div");
          row.className = "dlg-row dlg-name-row";
          const lab = document.createElement("div");
          lab.className = "dlg-label";
          lab.textContent = "Component Name";
          lab.title = "Enter a name for the new component";
          const ctl = document.createElement("div");
          ctl.className = "dlg-ctl";
          const inp = document.createElement("input");
          inp.className = "dlg-input";
          inp.type = "text";
          inp.dataset.input = "name";
          inp.value = dlg.values.name || "";
          inp.addEventListener("input", () => { dlg.values.name = inp.value; dlg.refresh(); });
          inp.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") { ev.preventDefault(); dlg.ok(); } else if (ev.key === "Escape") { ev.preventDefault(); dlg.cancel(); } });
          inp.addEventListener("focus", () => inp.select());
          ctl.appendChild(inp);
          row.append(lab, ctl);
          return row;
        },
        update(el, dlg) { const inp = el.querySelector("input"); if (inp && document.activeElement !== inp && inp.value !== (dlg.values.name || "")) inp.value = dlg.values.name || ""; },
      },
      { id: "activate", type: "check", label: "Activate", tooltip: "Check to activate the new component once it is created", default: true, visible: (v) => !v.fromBodies },
    ],
    init(dlg) {
      dlg.values.name = name;
      if (startParent && startParent !== ROOT) dlg.values.parent = [occRef(startParent)];
      if (preBodies.length) dlg.values.bodies = preBodies;
    },
    validate(dlg) {
      const v = dlg.values;
      if (v.fromBodies) return (v.bodies || []).length ? null : "Select bodies";
      return String(v.name || "").trim() ? null : "Enter a name for the new component";
    },
    status: (dlg) => (dlg.values.fromBodies ? `${(dlg.values.bodies || []).length} Bodies` : ""),
    commit(_f, dlg) {
      const v = dlg.values;
      const parent = (v.parent && v.parent[0] && v.parent[0].occ) || ROOT;
      if (v.fromBodies) return C.create({ parent: (v.parent && v.parent.length) ? parent : undefined, bodies: (v.bodies || []).map((r) => r.body), activate: false });
      return C.create({ parent, name: String(v.name).trim(), activate: v.activate !== false });
    },
  });
}

function selectedOccs(app) {
  return app.selection.items.filter((r) => r.kind === "occurrence" && r.occ !== ROOT).map((r) => r.occ);
}
function selectedBodies(app) {
  return app.selection.items.filter((r) => r.kind === "body" && !String(r.body).includes("@")).map((r) => r.body);
}

/** The POSITION environment (Fusion's contextual tab while moved components are not captured). */
function syncPositionEnv(app) {
  const C = app.components;
  if (!C || typeof app.enterEnvironment !== "function") return;
  const on = (app.environments || []).some((e) => e.id === "position");
  if (app.activeCommand) return; // the dialog that moved them closes first (its 'dialog' event syncs again)
  if (C.hasPending() && !on && app.mode !== "sketch" && (app.workspace || "FusionSolidEnvironment") === "FusionSolidEnvironment") {
    app.enterEnvironment({
      id: "position", mode: "position", label: "POSITION", tab: "EditSnapshotTab", finishCommand: "SnapshotEditAccept", baseTabs: [],
      onExit: (reason) => {
        // leaving any other way than Capture / Revert keeps the positions uncaptured
        if (reason === "finish" && C.hasPending()) C.capture();
      },
    });
  } else if (!C.hasPending() && on) app.exitEnvironment("position", { reason: "exit" });
}

export function registerComponentCommands(app) {
  const C = app.components;
  if (!C) return;
  const R = (def) => app.commands.register({ kind: "feature", ...def });
  R({
    id: "FusionCreateNewComponentCommand", label: "New Component", tooltip: "Creates a new internal or external component in the assembly.",
    run: (a, ctx = {}) => { const pre = beginModelCommand(a); return openNewComponent(a, { preselect: ctx.preselect || pre, parent: ctx.parent }); },
  });
  R({
    id: "FusionCreateNewCompCmdFromBody", label: "Create Components from Bodies", tooltip: "Creates a component for each selected body.",
    enabled: (a) => a.mode !== "sketch",
    run: (a, ctx = {}) => {
      const ids = (ctx.bodies || selectedBodies(a)).filter((b) => a.anyBody(b));
      if (!ids.length) { openNewComponent(a, { preselect: [] }); const d = a.ui.dialog && a.ui.dialog.current; if (d) { d.set("fromBodies", true); d.activate("bodies"); } return null; }
      const made = C.createFromBodies(ids);
      a.selection.set(made.map(occRef));
      return made;
    },
  });
  R({
    id: "FusionActivateLocalCompCmd", label: "Activate Component", kind: "ui", tooltip: "Activate Component",
    enabled: (a) => selectedOccs(a).length === 1 || (a.selection.items.length === 1 && a.selection.items[0].kind === "occurrence"),
    run: (a, ctx = {}) => C.activate(ctx.occ || (a.selection.items[0] && a.selection.items[0].occ) || ROOT),
  });
  R({ id: "FusionGroundComponents", label: "Pin", kind: "ui", tooltip: "Pins the selected components so they cannot move.", enabled: (a) => selectedOccs(a).length > 0, run: (a, ctx = {}) => C.setGrounded(ctx.occs || selectedOccs(a), true) });
  R({ id: "FusionUnGroundComponents", label: "Unpin", kind: "ui", tooltip: "Unpins the selected components.", enabled: (a) => selectedOccs(a).length > 0, run: (a, ctx = {}) => C.setGrounded(ctx.occs || selectedOccs(a), false) });
  R({
    id: "CopyCommand", label: "Copy", shortcut: "Ctrl+C", kind: "ui", tooltip: "Copies the selected components or bodies.",
    enabled: (a) => a.mode !== "sketch" && (selectedOccs(a).length > 0 || selectedBodies(a).length > 0),
    run: (a) => { if (C.copy(a.selection.items)) a.toast("Copied", "info", 1000); },
  });
  R({
    id: "PasteCommand", label: "Paste", shortcut: "Ctrl+V", kind: "feature", tooltip: "Pastes the copied components or bodies.",
    enabled: (a) => a.mode !== "sketch" && C.canPaste(),
    run: (a) => {
      const clip = C.clipboard;
      if (!clip) return null;
      if (clip.kind === "bodies") {
        // a body copy: Move/Copy with Create Copy, like Fusion's paste of bodies
        a.selection.set(clip.bodies.filter((b) => a.anyBody(b)).map((b) => ({ kind: "body", body: b })));
        a.commands.run("FusionMoveCommand", {});
        const d = a.ui.dialog && a.ui.dialog.current;
        if (d && d.id === "FusionMoveCommand") d.set("copy", true);
        return null;
      }
      const oid = C.paste();
      if (oid) openMoveFor(a, oid);
      return oid;
    },
  });
  R({
    id: "FusionPasteNewCommand", label: "Paste New", tooltip: "Pastes an independent copy of the copied component.",
    enabled: (a) => a.mode !== "sketch" && C.canPaste() && C.clipboard && C.clipboard.kind === "occurrence",
    run: (a) => { const oid = C.pasteNew(); if (oid) openMoveFor(a, oid); return oid; },
  });
  const capture = { id: "SnapshotEditAccept", label: "Capture Position", kind: "ui", tooltip: "Keeps the new component positions as a position capture.", enabled: () => C.hasPending(), run: (a) => { C.capture(); a.exitEnvironment("position", { reason: "capture" }); } };
  R(capture);
  R({ ...capture, id: "SnapshotCmd", tooltip: "Captures the positions of recently moved/rotated components as an event in your timeline." });
  R({ id: "SnapshotEditCancel", label: "Revert Position", kind: "ui", tooltip: "Discards the position changes.", enabled: () => C.hasPending(), run: (a) => { C.revert(); a.exitEnvironment("position", { reason: "cancel" }); } });
  R({ id: "RevertPositions", label: "Revert Position", kind: "ui", hidden: true, alias: true, enabled: () => C.hasPending(), run: (a) => { C.revert(); a.exitEnvironment("position", { reason: "cancel" }); } });

  // Edit Feature of a component entry: show the occurrence in the browser and rename it
  app.featureEditors.component = (a, id) => {
    const f = a.feature(id);
    if (!f || !C.alive(f.newOcc) || !a.ui.browser) { a.toast("This component is not in the design at the timeline marker", "info"); return; }
    a.ui.browser.reveal({ kind: "occurrence", occ: f.newOcc });
    a.ui.browser.rename(`occ:${f.newOcc}`);
  };

  // POSITION tab while positions are uncaptured (after the dialog that moved them has closed)
  let t = null;
  const later = () => { if (t) return; t = setTimeout(() => { t = null; try { syncPositionEnv(app); } catch (e) { console.error(e); } }, 0); };
  app.on("model", (d) => { if (!d || !d.preview) later(); });
  app.on("dialog", (d) => { if (d && !d.open) later(); });
}

/** After Paste / Paste New: Move/Copy opens with the new occurrence so it can be placed (Fusion). */
function openMoveFor(app, oid) {
  app.selection.set([occRef(oid)]);
  app.commands.run("FusionMoveCommand", {});
}
