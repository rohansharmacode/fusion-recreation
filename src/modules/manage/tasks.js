// MANAGE > TASK MANAGEMENT: a local task board in place of Fusion's cloud task system. Tasks live in
// browser storage (ui.store, try/catch + memory fallback) across designs, like Fusion's account tasks.
//   TaskManagementCreateTaskCmd    New Task: Title, Description, Assignee, Due Date, Priority, Related To
//                                  (bodies / faces / edges / timeline features; preselected from the selection)
//   TaskManagementRelatedTasksCmd  Related Tasks: tasks of this design related to the selection (all tasks of
//                                  the design when nothing is selected)
//   TaskManagementOpenTasksCmd     Open on the Web: Fusion opens all tasks in the web browser; here the task
//                                  board palette (Open / In Progress / Done, every design)
// Record: {id, number:'T-0001', title, description, assignee, due:'YYYY-MM-DD', priority:'Low'|'Medium'|'High',
//          status:'Open'|'In Progress'|'Done', design, refs:[{kind:'body', body, label} | {kind:'feature', id, label}],
//          created, modified}
import { el, esc, store, palette, getPalette, lrow, fmtDay, bodyName, toBodyRef, GL, beginModel } from "./ui.js";

const KEY = "fusionrec.manage.tasks.v1";
export const STATUSES = ["Open", "In Progress", "Done"];
export const PRIORITIES = ["Low", "Medium", "High"];

function load() { const d = store.get(KEY, null); return d && Array.isArray(d.tasks) ? d : { seq: 0, tasks: [] }; }
export function listTasks() { return load().tasks.map((t) => ({ ...t })); }
function save(app, d) { store.set(KEY, d); app.emit("tasks", { count: d.tasks.length }); }
export function saveTask(app, rec) {
  const d = load();
  const now = Date.now();
  let t = rec.id ? d.tasks.find((x) => x.id === rec.id) : null;
  if (!t) {
    d.seq = (d.seq || 0) + 1;
    t = { id: `t${now.toString(36)}${d.seq}`, number: `T-${String(d.seq).padStart(4, "0")}`, status: "Open", created: now, design: app.doc.name || "Untitled" };
    d.tasks.push(t);
  }
  for (const k of ["title", "description", "assignee", "due", "priority", "status", "refs", "design"]) if (rec[k] !== undefined) t[k] = rec[k];
  t.title = String(t.title || "").trim();
  if (!t.title) throw new Error("Enter a title for the task.");
  t.priority = PRIORITIES.includes(t.priority) ? t.priority : "Medium";
  t.status = STATUSES.includes(t.status) ? t.status : "Open";
  t.refs = Array.isArray(t.refs) ? t.refs : [];
  t.modified = now;
  save(app, d);
  return { ...t };
}
export function deleteTask(app, id) { const d = load(); const n = d.tasks.length; d.tasks = d.tasks.filter((t) => t.id !== id); if (d.tasks.length !== n) save(app, d); return d.tasks.length !== n; }

const refLabel = (app, r) => (r.kind === "feature" ? ((app.feature(r.id) || {}).name || r.id) : bodyName(app, r.body));
function taskRefs(app, refs) {
  const out = [], seen = new Set();
  for (const r0 of refs || []) {
    const r = toBodyRef(r0);
    const k = r && (r.kind === "body" ? `b:${r.body}` : r.kind === "feature" ? `f:${r.id}` : null);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r.kind === "body" ? { kind: "body", body: r.body, label: refLabel(app, r) } : { kind: "feature", id: r.id, label: refLabel(app, r) });
  }
  return out;
}
/** Tasks of the open design related to refs (all of the design's tasks when refs is empty). */
export function relatedTasks(app, refs) {
  const mine = listTasks().filter((t) => t.design === (app.doc.name || "Untitled"));
  const want = taskRefs(app, refs);
  if (!want.length) return mine;
  const keys = new Set(want.map((r) => (r.kind === "body" ? `b:${r.body}` : `f:${r.id}`)));
  return mine.filter((t) => (t.refs || []).some((r) => keys.has(r.kind === "body" ? `b:${r.body}` : `f:${r.id}`)));
}

// ------------------------------------------------------------------------------------------------ New Task dialog
function textRow(id, label, opts = {}) {
  return {
    id, type: "custom", label,
    render(d) {
      const inp = opts.area ? el("textarea", { class: "mg-text mg-ta", "data-input": id, rows: 3 }) : el("input", { type: opts.type || "text", class: "mg-text", "data-input": id, placeholder: opts.placeholder || "", spellcheck: "false", autocomplete: "off" });
      inp.value = d.values[id] || "";
      inp.addEventListener("input", () => { d.values[id] = inp.value; d.refresh(); });
      if (opts.area) inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") ev.stopPropagation(); }); // new line, not OK
      if (opts.focus) setTimeout(() => { try { inp.focus(); } catch { /* ignore */ } }, 30);
      return lrow(label, inp);
    },
    update() {},
  };
}
export function openTaskDialog(app, { task = null, preselect } = {}) {
  beginModel(app);
  const pre = (preselect || (task ? [] : app.selection.items) || []).map(toBodyRef).filter((r) => r && (r.kind === "body" || r.kind === "feature"));
  if (task) for (const r of task.refs || []) if ((r.kind === "body" && app.body(r.body)) || (r.kind === "feature" && app.feature(r.id))) pre.push(r.kind === "body" ? { kind: "body", body: r.body } : { kind: "feature", id: r.id });
  const v = task || {};
  return app.ui.dialog.open({
    id: "TaskManagementCreateTaskCmd", title: task ? "Edit Task" : "New Task", icon: "TaskManagementCreateTaskCmd",
    help: "Creates a new task in the task management system and assigns it. Select bodies, faces, edges or timeline features to relate the task to them.",
    preview: false, noFeature: true, ctrlWidth: 190, activate: false, focusHud: false, preselect: pre,
    values: { title: v.title || "", description: v.description || "", assignee: v.assignee || "", due: v.due || "", priority: v.priority || "Medium", status: v.status || "Open" },
    rows: [
      textRow("title", "Title", { focus: true, placeholder: "Task title" }),
      textRow("description", "Description", { area: true }),
      textRow("assignee", "Assignee", { placeholder: "Unassigned" }),
      textRow("due", "Due Date", { type: "date" }),
      { id: "priority", type: "dropdown", label: "Priority", options: PRIORITIES.map((p) => ({ value: p, label: p })) },
      { id: "status", type: "dropdown", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s })), visible: () => !!task },
      { id: "related", type: "selection", label: "Related To", kinds: ["body", "face", "edge", "feature"], mapRef: toBodyRef, min: 0, sep: true, tooltip: "Bodies or timeline features the task is about.", prompt: "Select bodies or features the task is about" },
    ],
    validate: (d) => (String(d.values.title || "").trim() ? null : "Enter a title for the task"),
    commit(_f, d) {
      const x = d.values;
      return saveTask(app, { id: task && task.id, title: x.title, description: x.description, assignee: String(x.assignee || "").trim(), due: x.due, priority: x.priority, status: task ? x.status : undefined, refs: taskRefs(app, x.related) });
    },
    afterCommit(t) { if (t) app.toast(task ? `Task ${t.number} updated` : `Task created: ${t.number} ${t.title}`, "info", 3000); },
  });
}

// ------------------------------------------------------------------------------------------------ task cards / palettes
const PRI_CLS = { Low: "low", Medium: "med", High: "high" };
function card(app, t, rerender) {
  const st = el("select", { class: "mg-in mg-task-status", "data-action": "status", title: "Status" }, ...STATUSES.map((s) => el("option", { value: s, text: s })));
  st.value = t.status;
  st.addEventListener("change", () => { saveTask(app, { id: t.id, status: st.value }); rerender(); });
  const here = t.design === (app.doc.name || "Untitled");
  const refs = (t.refs || []).map((r) => {
    const alive = here && (r.kind === "body" ? app.body(r.body) : app.feature(r.id));
    return alive ? el("a", { class: "mg-link", text: r.label, title: "Select", on: { click: () => app.selection.set([r.kind === "body" ? { kind: "body", body: r.body } : { kind: "feature", id: r.id }]) } }) : el("span", { class: "mg-dim", text: r.label });
  });
  const overdue = t.due && t.status !== "Done" && t.due < new Date().toISOString().slice(0, 10);
  return el("div", { class: `mg-task${t.status === "Done" ? " done" : ""}`, dataset: { task: t.id } },
    el("div", { class: "mg-task-head" }, el("b", { class: "mg-task-title", text: t.title }), el("span", { class: `mg-task-pri ${PRI_CLS[t.priority] || "med"}`, text: t.priority })),
    t.description ? el("div", { class: "mg-task-desc", text: t.description }) : null,
    el("div", { class: "mg-task-meta" }, el("span", { text: t.number }), el("span", { html: `${GL.user}${esc(t.assignee || "Unassigned")}` }), t.due ? el("span", { class: overdue ? "overdue" : "", html: `${GL.clock}${esc(fmtDay(`${t.due}T12:00:00`))}` }) : null, el("span", { html: `${GL.doc}${esc(t.design)}` })),
    refs.length ? el("div", { class: "mg-task-refs" }, el("span", { class: "mg-dim", text: "Related:" }), ...refs) : null,
    el("div", { class: "mg-task-acts" }, st,
      el("button", { type: "button", class: "mg-ed-btn", "data-action": "edit", title: here ? "Edit" : "Open the task's design to edit it", disabled: !here, html: GL.edit, on: { click: () => openTaskDialog(app, { task: t }) } }),
      el("button", { type: "button", class: "mg-ed-btn", "data-action": "delete", title: "Delete", html: GL.trash, on: { click: async () => {
        const ok = app.ui.modals ? (await app.ui.modals.confirm({ title: "Delete Task", kind: "warning", message: `Delete task <b>${esc(t.number)} ${esc(t.title)}</b>? This cannot be undone.`, buttons: [{ action: "ok", label: "Delete", primary: true }, { action: "cancel", label: "Cancel" }] })) === "ok" : true;
        if (ok) { deleteTask(app, t.id); rerender(); }
      } } })));
}
function livePalette(app, id, opts, draw) {
  let p = getPalette(id);
  if (!p) {
    const offs = [];
    p = palette(app, { ...opts, id, foot: false, onClose: () => offs.forEach((f) => f()) });
    p.draw = () => draw(p);
    for (const ev of ["tasks", "selection", "doc"]) offs.push(app.on(ev, () => p.draw()));
  }
  p.front();
  p.draw();
  return p;
}
const newBtn = (app) => el("button", { type: "button", class: "mg-btn mg-primary", "data-cmd": "TaskManagementCreateTaskCmd", text: "New Task", on: { click: () => openTaskDialog(app) } });

function openRelated(app) {
  return livePalette(app, "related-tasks", { title: "Related Tasks", width: 400, height: 460, className: "mg-task-pal" }, (p) => {
    const sel = app.selection.items || [];
    const refs = taskRefs(app, sel);
    const list = relatedTasks(app, sel);
    const what = refs.length ? `Related to ${refs.map((r) => r.label).join(", ")}` : `All tasks of ${app.doc.name || "Untitled"}`;
    p.body.replaceChildren(
      el("div", { class: "mg-task-bar" }, el("span", { class: "mg-task-ctx", text: what }), newBtn(app)),
      el("div", { class: "mg-task-list", "data-region": "related" }, ...(list.length ? list.map((t) => card(app, t, p.draw)) : [el("div", { class: "mg-task-empty", text: refs.length ? "No tasks are related to the selection." : "This design has no tasks yet." })])));
  });
}
const board = { q: "", scope: "all" };
function openBoard(app) {
  return livePalette(app, "task-board", { title: "Tasks", width: 860, height: 520, className: "mg-task-pal" }, (p) => {
    const q = board.q.toLowerCase();
    const all = listTasks().filter((t) => (board.scope === "all" || t.design === (app.doc.name || "Untitled")) && (!q || `${t.number} ${t.title} ${t.description} ${t.assignee} ${t.design}`.toLowerCase().includes(q)));
    if (!p.bar) {
      const search = el("input", { type: "search", class: "mg-text mg-task-search", placeholder: "Search tasks", "data-input": "search" });
      search.addEventListener("input", () => { board.q = search.value; p.draw(); });
      const scope = el("select", { class: "mg-in", "data-input": "scope" }, el("option", { value: "all", text: "All designs" }), el("option", { value: "this", text: "This design" }));
      scope.addEventListener("change", () => { board.scope = scope.value; p.draw(); });
      p.bar = el("div", { class: "mg-task-bar" }, search, scope, newBtn(app));
      p.cols = el("div", { class: "mg-task-board" });
      p.body.replaceChildren(p.bar, p.cols);
    }
    p.cols.replaceChildren(...STATUSES.map((s) => {
      const items = all.filter((t) => t.status === s);
      return el("div", { class: "mg-task-col", dataset: { status: s } }, el("div", { class: "mg-task-colh" }, el("b", { text: s }), el("span", { class: "mg-da-badge", text: String(items.length) })),
        el("div", { class: "mg-task-list" }, ...items.map((t) => card(app, t, p.draw))));
    }));
  });
}

export function registerTasks(app) {
  const reg = (id, label, tooltip, run) => app.commands.register({ id, label, tooltip, kind: "ui", run });
  reg("TaskManagementCreateTaskCmd", "New Task", "Creates a new task in the task management system. Opens a dialog to create and assign a new task.", (a, ctx = {}) => openTaskDialog(a, ctx));
  reg("TaskManagementRelatedTasksCmd", "Related Tasks", "Shows tasks related to the current item or selection.", (a) => openRelated(a));
  reg("TaskManagementOpenTasksCmd", "Open on the Web", "Opens all tasks (the local task board). View and manage all your assigned tasks.", (a) => openBoard(a));
  app.ui.tasks = { list: listTasks, save: (rec) => saveTask(app, rec), remove: (id) => deleteTask(app, id), related: (refs) => relatedTasks(app, refs), openBoard: () => openBoard(app), openRelated: () => openRelated(app), newTask: (o) => openTaskDialog(app, o) };
}
