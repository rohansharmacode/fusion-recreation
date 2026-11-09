// MANAGE tab, Fusion Manage extension (PIM*): a local equivalent of Fusion's cloud product lifecycle
// tools. Item data is document data (doc.pim, undoable, saved with the design):
//   PIMAssignItemNumberCmd   Assign Item Number: Part Name | Numbering Scheme | Item Number, "Assign"
//   PIMQuickReleaseCmd       Quick Release: next lifecycle state or revision without a change order
//                            (Unreleased -> Pre Release 1 -> Pre Release 2 ...); the final release to
//                            Production needs a change order
//   PIMECOReleaseCmd         Release with Change Order: creates a change order (Open -> In Review ->
//                            Released, or Rejected / Cancelled) with a full audit trail
//   PIMGoToDashboardCmd / PIMGoToItemDetailsCmd / PIMGoToChangeOrderCmd   Dashboard, Details, Change Orders
//                            (Fusion opens Fusion Manage in the web browser; here a "Fusion Manage" palette)
// Table columns and state names come from the install's Fusion Manage extension (Part Name, Numbering
// Scheme, Item Number, Lifecycle, Revision, Change Order; Unreleased / Pre Release / Production).
import { el, esc, palette, getPalette, GL, fmtDate, beginModel } from "./ui.js";

export const STATE = { UNRELEASED: "Unreleased", PRE: "Pre Release", PROD: "Production" };
const SCHEMES = [{ id: "default", label: "Default", prefix: "ITM-" }, { id: "part", label: "Part", prefix: "PRT-" }];
const NO_REV = "-";

/** Components that can be items. The recreation has one (root) component: the design. */
export function components(app) { return [{ key: "root", name: app.doc.name || "Untitled" }]; }
const pimOf = (doc) => (doc.pim && typeof doc.pim === "object" ? doc.pim : null);
export function itemOf(app, key = "root") { const p = pimOf(app.doc); return (p && p.items && p.items[key]) || null; }
export function changeOrders(app) { const p = pimOf(app.doc); return (p && Array.isArray(p.changeOrders)) ? p.changeOrders : []; }
const configured = (app) => { const c = app.doc.configurations; return !!(c && Array.isArray(c.rows) && c.rows.length); };
function ensure(doc) {
  if (!pimOf(doc)) doc.pim = {};
  const p = doc.pim;
  p.items = p.items || {};
  p.changeOrders = p.changeOrders || [];
  p.seq = p.seq || { item: 0, co: 0 };
  return p;
}
const nextLetter = (r) => {
  if (!/^[A-Z]+$/.test(r || "")) return "A";
  const a = r.split("");
  let i = a.length - 1;
  while (i >= 0 && a[i] === "Z") { a[i] = "A"; i--; }
  if (i < 0) a.unshift("A"); else a[i] = String.fromCharCode(a[i].charCodeAt(0) + 1);
  return a.join("");
};
/** Next state / revision of a Quick Release, or {error}. */
export function quickTarget(it) {
  if (!it) return { lifecycle: STATE.PRE, revision: "1" };
  if (it.changeOrder) return { error: `This item is in a state that does not allow Quick Release (change order ${it.changeOrder} is pending).` };
  if (it.lifecycle === STATE.PROD) return { error: "This item is in a state that does not allow Quick Release. Production items are released with a change order." };
  if (it.lifecycle === STATE.PRE) return { lifecycle: STATE.PRE, revision: String((parseInt(it.revision, 10) || 0) + 1) };
  return { lifecycle: STATE.PRE, revision: "1" };
}
const prodTarget = (it) => ({ lifecycle: STATE.PROD, revision: it && it.lifecycle === STATE.PROD ? nextLetter(it.revision) : "A" });
const log = (it, action, extra = {}) => { (it.history = it.history || []).push({ t: Date.now(), action, lifecycle: it.lifecycle, revision: it.revision, ...extra }); };
function newItem(p, scheme, name) {
  p.seq.item += 1;
  const s = SCHEMES.find((x) => x.id === scheme) || SCHEMES[0];
  const it = { itemNumber: `${s.prefix}${String(p.seq.item).padStart(6, "0")}`, scheme: s.id, name, lifecycle: STATE.UNRELEASED, revision: NO_REV, changeOrder: "", history: [] };
  log(it, "Item number assigned");
  return it;
}
const nameOf = (app, key) => (components(app).find((c) => c.key === key) || { name: key }).name;

// ------------------------------------------------------------------------------------------------ operations
export function assignItemNumbers(app, keys, scheme = "default") {
  if (configured(app)) throw new Error("Cannot assign item numbers to configured designs.");
  const todo = keys.filter((k) => !itemOf(app, k));
  if (!todo.length) return [];
  return app.mutate("Assign Item Number", (doc) => {
    const p = ensure(doc);
    // scheme: one scheme id, or {componentKey: scheme id} (the dialog's per-row choice): one undo step for all
    const sch = (k) => (scheme && typeof scheme === "object" ? scheme[k] || "default" : scheme);
    return todo.map((k) => { p.items[k] = newItem(p, sch(k), nameOf(app, k)); return p.items[k].itemNumber; });
  }, { recompute: false });
}
export function quickRelease(app, keys) {
  if (configured(app)) throw new Error("Cannot add configured designs to quick release.");
  const errs = keys.map((k) => quickTarget(itemOf(app, k)).error).filter(Boolean);
  if (errs.length) throw new Error(errs[0]);
  return app.mutate("Quick Release", (doc) => {
    const p = ensure(doc);
    return keys.map((k) => {
      const it = p.items[k] || (p.items[k] = newItem(p, "default", nameOf(app, k)));
      const t = quickTarget(it);
      it.lifecycle = t.lifecycle; it.revision = t.revision; it.released = Date.now();
      log(it, "Quick Release");
      return { key: k, itemNumber: it.itemNumber, ...t };
    });
  }, { recompute: false });
}
export function createChangeOrder(app, { title, description = "", keys }) {
  if (configured(app)) throw new Error("Cannot add configured designs to change orders.");
  if (!String(title || "").trim()) throw new Error("Enter a title for the change order.");
  const busy = keys.map((k) => itemOf(app, k)).find((it) => it && it.changeOrder);
  if (busy) throw new Error(`${busy.itemNumber} is already on change order ${busy.changeOrder}.`);
  return app.mutate("Release with Change Order", (doc) => {
    const p = ensure(doc);
    p.seq.co += 1;
    const co = { id: `co${p.seq.co}`, number: `CO-${String(p.seq.co).padStart(6, "0")}`, title: String(title).trim(), description: String(description), items: [...keys], state: "Open", created: Date.now(), history: [{ t: Date.now(), action: "Created", state: "Open" }] };
    for (const k of keys) {
      const it = p.items[k] || (p.items[k] = newItem(p, "default", nameOf(app, k)));
      it.changeOrder = co.number;
      co.targets = { ...(co.targets || {}), [k]: prodTarget(it) };
      log(it, `Added to change order ${co.number}`);
    }
    p.changeOrders.push(co);
    return { ...co };
  }, { recompute: false });
}
/** Workflow of a change order: submit (Open -> In Review), approve (In Review -> Released, items to
 *  Production), reject (In Review -> Open), cancel (Open -> Cancelled, items leave the change order). */
export const CO_ACTIONS = {
  submit: { label: "Submit for Review", from: ["Open"], to: "In Review" },
  approve: { label: "Approve and Release", from: ["In Review"], to: "Released" },
  reject: { label: "Reject", from: ["In Review"], to: "Open" },
  cancel: { label: "Cancel Change Order", from: ["Open"], to: "Cancelled" },
};
export function advanceChangeOrder(app, coId, action, comment = "") {
  const A = CO_ACTIONS[action];
  const co0 = changeOrders(app).find((c) => c.id === coId);
  if (!A || !co0) throw new Error("Unknown change order or action");
  if (!A.from.includes(co0.state)) throw new Error(`${co0.number} is ${co0.state}: "${A.label}" is not available.`);
  return app.mutate(`Change Order ${A.label}`, (doc) => {
    const p = ensure(doc);
    const co = p.changeOrders.find((c) => c.id === coId);
    co.state = A.to;
    co.history.push({ t: Date.now(), action: A.label, state: A.to, comment: String(comment || "") });
    if (A.to === "Released" || A.to === "Cancelled") {
      co.closed = Date.now();
      for (const k of co.items) {
        const it = p.items[k];
        if (!it) continue;
        it.changeOrder = "";
        if (A.to === "Released") { const t = (co.targets && co.targets[k]) || prodTarget(it); it.lifecycle = t.lifecycle; it.revision = t.revision; it.released = Date.now(); log(it, `Released with change order ${co.number}`, { co: co.number }); }
        else log(it, `Change order ${co.number} cancelled`, { co: co.number });
      }
    }
    return co.state;
  }, { recompute: false });
}

// ------------------------------------------------------------------------------------------------ UI
const STATE_CLS = { [STATE.UNRELEASED]: "u", [STATE.PRE]: "pre", [STATE.PROD]: "prod" };
const stateTag = (s) => el("span", { class: `mg-pim-state ${STATE_CLS[s] || "u"}`, text: s || STATE.UNRELEASED });
const compIcon = () => el("span", { class: "mg-pim-thumb", html: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l5.6 3.1v6.2L8 14.2l-5.6-3.1V4.9z" fill="#e9eef3" stroke="#46525e"/><path d="M2.6 5L8 8l5.4-3M8 8v6" fill="none" stroke="#46525e"/></svg>' });
function table(cols, rows) {
  return el("table", { class: "mg-pim-tbl" }, el("thead", {}, el("tr", {}, ...cols.map((c) => el("th", { text: c })))),
    el("tbody", {}, ...rows.map((r) => el("tr", { dataset: { item: r.key } }, ...r.cells.map((c) => el("td", {}, c))))));
}
function modal(app, o) {
  const m = app.ui.modals;
  if (!m) { app.toast(`${o.title} needs the menus module`, "error"); return null; }
  return m.open({ className: "mg-pim-modal", width: o.width || 640, ...o });
}
const failToast = (app, e) => { app.toast(String((e && e.message) || e), "error", 5000); return false; };

function openAssign(app) {
  beginModel(app);
  const comps = components(app);
  const scheme = {};
  const rows = comps.map((c) => {
    const it = itemOf(app, c.key);
    const sel = el("select", { class: "mg-in", "data-input": "scheme", disabled: !!it }, ...SCHEMES.map((s) => el("option", { value: s.id, text: s.label })));
    sel.value = it ? it.scheme : "default";
    scheme[c.key] = sel.value;
    sel.addEventListener("change", () => { scheme[c.key] = sel.value; });
    return { key: c.key, cells: [el("span", { html: it ? GL.check : GL.info }), compIcon(), c.name, sel, it ? el("b", { text: it.itemNumber }) : el("span", { class: "mg-dim", text: "(assigned on Assign)" })] };
  });
  const todo = comps.filter((c) => !itemOf(app, c.key)).map((c) => c.key);
  const note = configured(app) ? "Cannot assign item numbers to configured designs." : todo.length ? "Assign unique item numbers to the selected components for tracking throughout their life cycles. Items are set to “unreleased”." : "Every component already has an item number.";
  return modal(app, {
    id: "PIMAssignItemNumberCmd", title: "Assign Item Number",
    body: el("div", { class: "mg-pim" }, el("div", { class: "mg-note", html: `${GL.info}<span>${esc(note)}</span>` }), table(["", "", "Part Name", "Numbering Scheme", "Item Number"], rows)),
    buttons: [
      { action: "ok", label: "Assign", primary: true, disabled: !todo.length || configured(app), onClick: () => {
        try { const nums = assignItemNumbers(app, todo, scheme); app.toast(`Item number${nums.length === 1 ? "" : "s"} assigned: ${nums.join(", ")}`, "info", 3500); refreshPalette(app); return true; } catch (e) { return failToast(app, e); }
      } },
      { action: "cancel", label: "Cancel" },
    ],
  });
}

function releaseRows(app, target) {
  return components(app).map((c) => {
    const it = itemOf(app, c.key);
    const t = target(it);
    const arrow = (a, b) => el("span", {}, a, t.error ? null : el("span", { class: "mg-pim-to", text: ` → ${b}` }));
    return { key: c.key, t, cells: [el("span", { html: t.error ? GL.alert : GL.check }), compIcon(), c.name, it ? it.itemNumber : el("span", { class: "mg-dim", text: "(new)" }), arrow(it ? it.lifecycle : STATE.UNRELEASED, t.lifecycle), arrow(it ? it.revision : NO_REV, t.revision), (it && it.changeOrder) || ""] };
  });
}
const RCOLS = ["", "", "Part Name", "Item Number", "Lifecycle", "Revision", "Change Order"];

function openQuickRelease(app) {
  beginModel(app);
  const rows = releaseRows(app, quickTarget);
  const err = configured(app) ? "Cannot add configured designs to quick release." : (rows.find((r) => r.t.error) || {}).t?.error;
  return modal(app, {
    id: "PIMQuickReleaseCmd", title: "Quick Release", width: 720,
    body: el("div", { class: "mg-pim" }, el("div", { class: `mg-note${err ? " warn" : ""}`, html: `${err ? GL.alert : GL.info}<span>${esc(err || "Transitions the component to the next life cycle state or revision without a change order. The final release still requires a change order.")}</span>` }), table(RCOLS, rows)),
    buttons: [
      { action: "ok", label: "Release", primary: true, disabled: !!err, onClick: () => {
        try { const r = quickRelease(app, rows.map((x) => x.key)); app.toast(r.map((x) => `${x.itemNumber}: ${x.lifecycle} ${x.revision}`).join(", "), "info", 3500); refreshPalette(app); return true; } catch (e) { return failToast(app, e); }
      } },
      { action: "cancel", label: "Cancel" },
    ],
  });
}

function openEcoRelease(app) {
  beginModel(app);
  const rows = releaseRows(app, (it) => (it && it.changeOrder ? { error: `On change order ${it.changeOrder}` } : prodTarget(it)));
  const err = configured(app) ? "Cannot add configured designs to change orders." : (rows.find((r) => r.t.error) || {}).t?.error;
  const title = el("input", { type: "text", class: "mg-text", "data-input": "title", value: `Release ${app.doc.name || "Untitled"}` });
  const desc = el("textarea", { class: "mg-text mg-ta", "data-input": "description", rows: 3, placeholder: "Reason for the change" });
  const field = (l, c) => el("label", { class: "mg-pim-field" }, el("span", { text: l }), c);
  return modal(app, {
    id: "PIMECOReleaseCmd", title: "Release with Change Order", width: 720,
    body: el("div", { class: "mg-pim" },
      el("div", { class: `mg-note${err ? " warn" : ""}`, html: `${err ? GL.alert : GL.info}<span>${esc(err || "Releases the selected components with a change order. Includes full audit trail and approval workflow.")}</span>` }),
      field("Title", title), field("Description", desc), table(RCOLS, rows)),
    buttons: [
      { action: "ok", label: "Create Change Order", primary: true, disabled: !!err, onClick: () => {
        try { const co = createChangeOrder(app, { title: title.value, description: desc.value, keys: rows.map((x) => x.key) }); app.toast(`Change order ${co.number} created`, "info", 3000); openManage(app, "changes", co.id); return true; } catch (e) { return failToast(app, e); }
      } },
      { action: "cancel", label: "Cancel" },
    ],
  });
}

// "Fusion Manage" palette: Dashboard / Details / Change Orders
const TABS = [["dashboard", "Dashboard"], ["details", "Details"], ["changes", "Change Orders"]];
const ui = { tab: "dashboard", co: null };
function refreshPalette() { const p = getPalette("pim"); if (p && p.render) p.render(); }
function openManage(app, tab, coId = null) {
  beginModel(app);
  ui.tab = tab;
  ui.co = coId;
  let p = getPalette("pim");
  if (!p) {
    p = palette(app, { id: "pim", title: "Fusion Manage", width: 640, height: 470, foot: false, className: "mg-pim-pal", onClose: () => off() });
    const off = app.on("doc", () => p.render());
    p.render = () => render(app, p);
  }
  p.front();
  p.render();
  return p;
}
function render(app, p) {
  const bar = el("div", { class: "mg-da-tabs mg-pim-tabs", role: "tablist" }, ...TABS.map(([k, l]) => el("button", { type: "button", class: `mg-da-tab${ui.tab === k ? " on" : ""}`, "data-tab": k, text: l, on: { click: () => { ui.tab = k; ui.co = null; p.render(); } } })));
  const body = ui.tab === "dashboard" ? dashboard(app, p) : ui.tab === "details" ? details(app, p) : changesView(app, p);
  p.body.replaceChildren(bar, el("div", { class: "mg-pim-content", "data-tab-content": ui.tab }, body));
}
const btn = (label, cmd, run, primary) => el("button", { type: "button", class: `mg-btn${primary ? " mg-primary" : ""}`, "data-cmd": cmd || null, text: label, on: { click: run } });
function dashboard(app, p) {
  const comps = components(app);
  const items = comps.map((c) => ({ c, it: itemOf(app, c.key) }));
  const cos = changeOrders(app);
  const n = (f) => items.filter(f).length;
  const tiles = [["Items", n((x) => x.it)], [STATE.UNRELEASED, n((x) => x.it && x.it.lifecycle === STATE.UNRELEASED)], [STATE.PRE, n((x) => x.it && x.it.lifecycle === STATE.PRE)], [STATE.PROD, n((x) => x.it && x.it.lifecycle === STATE.PROD)], ["Open Change Orders", cos.filter((c) => c.state === "Open" || c.state === "In Review").length]];
  return el("div", {},
    el("div", { class: "mg-pim-tiles" }, ...tiles.map(([l, v]) => el("div", { class: "mg-pim-tile", dataset: { tile: l } }, el("b", { text: String(v) }), el("span", { text: l })))),
    table(["Part Name", "Item Number", "Lifecycle", "Revision", "Change Order"], items.map(({ c, it }) => ({ key: c.key, cells: [c.name, it ? it.itemNumber : el("span", { class: "mg-dim", text: "Not assigned" }), it ? stateTag(it.lifecycle) : "", it ? it.revision : "", (it && it.changeOrder) || ""] }))),
    el("div", { class: "mg-pim-acts" }, btn("Details", "PIMGoToItemDetailsCmd", () => { ui.tab = "details"; p.render(); }), btn("Change Orders", "PIMGoToChangeOrderCmd", () => { ui.tab = "changes"; p.render(); })));
}
function historyList(list) {
  return el("div", { class: "mg-pim-hist" }, ...(list || []).slice().reverse().map((h) => el("div", { class: "mg-pim-hrow" }, el("span", { class: "mg-dim", text: fmtDate(h.t) }), el("span", { text: h.action }), el("span", { class: "mg-dim", text: [h.lifecycle, h.revision && h.revision !== NO_REV ? `Rev ${h.revision}` : "", h.state, h.comment].filter(Boolean).join(" · ") }))));
}
function details(app, p) {
  const c = components(app)[0];
  const it = itemOf(app, c.key);
  if (!it) return el("div", { class: "mg-pim-empty" }, el("p", { text: `${c.name} is not assigned as an item in Fusion Manage.` }), btn("Assign Item Number", "PIMAssignItemNumberCmd", () => openAssign(app), true));
  const kv = [["Part Name", c.name], ["Item Number", it.itemNumber], ["Numbering Scheme", (SCHEMES.find((s) => s.id === it.scheme) || SCHEMES[0]).label], ["Lifecycle", stateTag(it.lifecycle)], ["Revision", it.revision], ["Change Order", it.changeOrder || "-"], ["Last Release", it.released ? fmtDate(it.released) : "-"]];
  return el("div", {},
    el("div", { class: "mg-da-kv mg-pim-kv" }, ...kv.flatMap(([k, v]) => [el("span", { text: k }), el("b", { dataset: { field: k } }, v)])),
    el("div", { class: "mg-pim-acts" }, btn("Quick Release", "PIMQuickReleaseCmd", () => openQuickRelease(app)), btn("Release with Change Order", "PIMECOReleaseCmd", () => openEcoRelease(app))),
    el("div", { class: "mg-da-sech", text: "History" }), historyList(it.history));
}
function changesView(app, p) {
  const cos = changeOrders(app);
  const it = itemOf(app, "root");
  // Fusion: the change order of the current item when it has one, else the list
  const cur = cos.find((c) => c.id === ui.co) || (it && it.changeOrder && !ui.co ? cos.find((c) => c.number === it.changeOrder) : null);
  if (cur) {
    const acts = Object.entries(CO_ACTIONS).filter(([, a]) => a.from.includes(cur.state)).map(([k, a]) => btn(a.label, null, () => { try { advanceChangeOrder(app, cur.id, k); app.toast(`${cur.number}: ${CO_ACTIONS[k].to}`, "info", 2500); ui.co = cur.id; p.render(); } catch (e) { failToast(app, e); } }, k === "approve" || k === "submit"));
    acts.forEach((b, i) => b.setAttribute("data-co-action", Object.keys(CO_ACTIONS).filter((k) => CO_ACTIONS[k].from.includes(cur.state))[i]));
    return el("div", { dataset: { co: cur.id } },
      el("div", { class: "mg-pim-acts" }, el("a", { class: "mg-link", text: "All change orders", on: { click: () => { ui.co = "-"; p.render(); } } })),
      el("div", { class: "mg-da-kv mg-pim-kv" }, ...[["Change Order", cur.number], ["Title", cur.title], ["State", cur.state], ["Created", fmtDate(cur.created)], ["Description", cur.description || "-"]].flatMap(([k, v]) => [el("span", { text: k }), el("b", { dataset: { field: k }, text: v })])),
      table(["Part Name", "Item Number", "Target Lifecycle", "Target Revision"], cur.items.map((k) => { const x = itemOf(app, k); const t = (cur.targets || {})[k] || {}; return { key: k, cells: [nameOf(app, k), x ? x.itemNumber : "", t.lifecycle || "", t.revision || ""] }; })),
      el("div", { class: "mg-pim-acts" }, ...acts),
      el("div", { class: "mg-da-sech", text: "Workflow History" }), historyList(cur.history));
  }
  if (!cos.length) return el("div", { class: "mg-pim-empty" }, el("p", { text: "There are no change orders for this design." }), btn("Release with Change Order", "PIMECOReleaseCmd", () => openEcoRelease(app), true));
  return table(["Change Order", "Title", "State", "Items", "Created"], cos.slice().reverse().map((c) => ({ key: c.id, cells: [el("a", { class: "mg-link", "data-co": c.id, text: c.number, on: { click: () => { ui.co = c.id; p.render(); } } }), c.title, c.state, String(c.items.length), fmtDate(c.created)] })));
}

export function registerPim(app) {
  const reg = (id, label, tooltip, run) => app.commands.register({ id, label, tooltip, kind: "ui", run });
  reg("PIMAssignItemNumberCmd", "Assign Item Number", "Assign unique item numbers to selected components for tracking throughout their life cycles.", (a) => openAssign(a));
  reg("PIMQuickReleaseCmd", "Quick Release", "Transitions the component to the next life cycle state or revision without a change order.", (a) => openQuickRelease(a));
  reg("PIMECOReleaseCmd", "Release with Change Order", "Releases the selected components with a change order. Includes full audit trail and approval workflow.", (a) => openEcoRelease(a));
  reg("PIMGoToDashboardCmd", "Dashboard", "Opens the Fusion Manage dashboard of this design (local).", (a) => openManage(a, "dashboard"));
  reg("PIMGoToItemDetailsCmd", "Details", "Shows the item details of the current component: item number, lifecycle, revision and history.", (a) => openManage(a, "details"));
  reg("PIMGoToChangeOrderCmd", "Change Orders", "Shows change order information for the current item. If it is not on a change order, the list of change orders is shown.", (a) => openManage(a, "changes"));
  app.ui.pim = { components: () => components(app), item: (k) => itemOf(app, k), changeOrders: () => changeOrders(app), assign: (keys, s) => assignItemNumbers(app, keys || ["root"], s), quickRelease: (keys) => quickRelease(app, keys || ["root"]), createChangeOrder: (o) => createChangeOrder(app, { keys: ["root"], ...o }), advance: (id, action, comment) => advanceChangeOrder(app, id, action, comment), open: (tab) => openManage(app, tab || "dashboard") };
}
