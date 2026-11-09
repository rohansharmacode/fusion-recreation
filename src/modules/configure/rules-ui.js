// CONFIGURATION RULES editor: a local equivalent of Fusion's visual rules environment.
//   left:  Toolbox categories (Rules, Logic, Configurations, User Parameters, Modeling Features, Components,
//          Theme Tables); clicking a category lists its blocks, clicking a block adds it to the canvas
//   right: rules canvas: Rule blocks (State Toggle On/Off, name, comment, status) holding Logic (if / else if /
//          else), Setter, Getter, And/Or, Not and Comment blocks. Click a statement area or an empty condition
//          slot to choose where the next block goes (it is outlined in blue).
//   foot:  Discard (back to the applied rules) and Apply (writes the rules into the design and enforces them).
// Rules are evaluated locally (rules.js) instead of on Autodesk's rules service.
import * as D from "./data.js";
import * as RL from "./rules.js";
import { G } from "./glyphs.js";

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
};
const stop = (e) => e.stopPropagation();

const BLOCKS = {
  rules: [["rule", "Rule"], ["comment", "Comment"]],
  logic: [["if", "if  then  else"], ["and", "and / or"], ["not", "not"], ["get", "get"], ["set", "set"]],
  configurations: [["get", "get Configuration"]],
  userParameters: [["get", "get User Parameter"], ["set", "set User Parameter"]],
  modelingFeatures: [["get", "get Modeling Feature"], ["set", "set Modeling Feature"]],
  components: [["get", "get Component"], ["set", "set Component"]],
  themeTables: [["get", "get Theme Table"], ["set", "set Theme Table"]],
};
const CAT_DESC = {
  rules: "This toolbox category contains blocks to help you set up and annotate Configuration Rules.",
  logic: "This toolbox category contains blocks that define logical conditions.",
  configurations: "This toolbox category contains a Getter block, pre-filled with data specific to configurations.",
  userParameters: "This toolbox category contains Getter and Setter blocks, pre-filled with data specific to configured user parameters.",
  modelingFeatures: "This toolbox category contains Getter and Setter blocks, pre-filled with data specific to configured modeling feature aspects like feature parameters, suppression, and visibility.",
  components: "This toolbox category contains Getter and Setter blocks, pre-filled with data specific to configured component aspects like insert, suppression, and visibility.",
  themeTables: "This toolbox category contains Getter and Setter blocks, pre-filled with data specific to theme tables.",
};

export function openRules(app, ctl) {
  const modals = app.ui.modals;
  const c0 = D.get(app.doc);
  if (!c0 || !c0.columns.length) {
    const msg = "You need to configure some aspects of this design before you can create Configuration Rules.<br><br>Enter <b>Configuration Mode</b> and click highlighted objects in the <b>Browser</b> and features in the <b>Timeline</b> to configure:<ul><li>Feature Parameters</li><li>Suppression</li><li>Visibility</li><li>Physical Material</li><li>Appearance</li></ul>";
    if (modals && modals.confirm) {
      modals.confirm({ id: "ConfigurationRulesNoAspects", title: "No configured aspects yet", kind: "info", message: msg, width: 460,
        buttons: [{ action: "enter", label: "Enter Configuration Mode", primary: true }, { action: "cancel", label: "Close" }] })
        .then((r) => { if (r === "enter") ctl.enterMode(); });
    } else app.toast("No configured aspects yet: configure some aspects of this design before you can create Configuration Rules.", "info", 5000);
    return null;
  }
  const ids = { nid: Math.max(c0.nid, 1) + 500 };
  let applied = D.clone(c0.rules);
  let work = D.clone(c0.rules);
  let focus = null; // {list:[]} | {slot:{obj, key}}
  let banner = null;
  let openCat = null;
  const mutOpen = new WeakSet(); // Logic blocks whose settings flyout is open
  const dirty = () => JSON.stringify(work) !== JSON.stringify(applied);

  // ------------------------------------------------------------------ helpers on the working copy
  const cfg = () => D.get(app.doc);
  const tmpDoc = () => ({ ...app.doc, configurations: { ...cfg(), rules: work } });
  function reachable(target) {
    let found = false;
    const walk = (x) => {
      if (found || !x || typeof x !== "object") return;
      if (x === target) { found = true; return; }
      if (Array.isArray(x)) { x.forEach(walk); return; }
      for (const v of Object.values(x)) if (v && typeof v === "object") walk(v);
    };
    walk(work);
    return found;
  }
  const catsAvailable = (forSet) => RL.CATEGORIES.filter(([k]) => k !== "rules" && k !== "logic" && (!forSet || k !== "configurations") && RL.aspects(app.doc, k, app.M).length);
  function defaultsFor(b, category) {
    const c = cfg();
    const list = RL.aspects(app.doc, category, app.M);
    b.col = list.length ? list[0].col : null;
    fixOp(b);
    b.value = defaultValue(c, b);
  }
  function fixOp(b) {
    const type = RL.leafType(cfg(), b.col);
    const ops = type ? (b.t === "get" ? RL.GET_OPS : RL.SET_OPS)[type] : [];
    if (!ops.some((o) => o[0] === b.op)) b.op = ops.length ? ops[0][0] : null;
  }
  function defaultValue(c, b) {
    const type = RL.leafType(c, b.col);
    if (type === "number") {
      const nums = D.rowNumbers(app.doc, c.active, app.M);
      const v = nums[b.col];
      if (b.op === "range") return { min: Number.isFinite(v) ? v : 0, max: Number.isFinite(v) ? v : 0 };
      if (b.op === "anyOf") return Number.isFinite(v) ? [round(v)] : [];
      return Number.isFinite(v) ? round(v) : 0;
    }
    if (type === "bool") return true;
    if (type === "list") return [];
    return null;
  }
  const round = (v) => Math.round(v * 1e6) / 1e6;
  function newBlock(kind, category) {
    if (kind === "set" || kind === "get") {
      const cat = category || (catsAvailable(kind === "set")[0] || [])[0];
      const b = { t: kind, col: null, op: null, value: null };
      if (cat) defaultsFor(b, cat);
      return b;
    }
    if (kind === "if") return { t: "if", cond: null, then: [], elifs: [], else: [] };
    if (kind === "and") return { t: "and", a: null, b: null };
    if (kind === "not") return { t: "not", a: null };
    if (kind === "comment") return { t: "comment", text: "" };
    return null;
  }
  function targetList() {
    if (focus && focus.list && reachable(focus.list)) return focus.list;
    if (!work.length) { const r = RL.newRule(ids, work); work.push(r); }
    return work[work.length - 1].body;
  }
  function firstEmptySlot(list) {
    for (const s of list || []) {
      if (s.t === "if") {
        if (!s.cond) return { obj: s, key: "cond" };
        const inner = emptyIn(s.cond, s, "cond"); if (inner) return inner;
        for (const e of s.elifs || []) { if (!e.cond) return { obj: e, key: "cond" }; const i2 = emptyIn(e.cond, e, "cond"); if (i2) return i2; }
      }
    }
    return null;
  }
  function emptyIn(x) {
    if (!x) return null;
    if (x.t === "and" || x.t === "or") { if (!x.a) return { obj: x, key: "a" }; if (!x.b) return { obj: x, key: "b" }; return emptyIn(x.a) || emptyIn(x.b); }
    if (x.t === "not") return x.a ? emptyIn(x.a) : { obj: x, key: "a" };
    return null;
  }
  function insert(kind, category) {
    if (kind === "rule") {
      const r = RL.newRule(ids, work);
      work.push(r);
      focus = { list: r.body };
    } else if (kind === "set" || kind === "if" || kind === "comment") {
      const list = targetList();
      const b = newBlock(kind, category);
      list.push(b);
      if (kind === "if") focus = { slot: { obj: b, key: "cond" }, list };
    } else {
      // condition blocks go into the selected empty slot (or the first empty slot / a new Logic block)
      let slot = focus && focus.slot && reachable(focus.slot.obj) && !focus.slot.obj[focus.slot.key] ? focus.slot : null;
      if (!slot) slot = firstEmptySlot(focus && focus.list && reachable(focus.list) ? focus.list : targetList());
      if (!slot) { const list = targetList(); const ib = newBlock("if"); list.push(ib); slot = { obj: ib, key: "cond" }; }
      const b = newBlock(kind, category);
      slot.obj[slot.key] = b;
      if (kind === "and") focus = { slot: { obj: b, key: "a" } };
      else if (kind === "not") focus = { slot: { obj: b, key: "a" } };
      else { const nx = emptyIn(slot.obj.t === "if" ? null : slot.obj); focus = nx ? { slot: nx } : focus && focus.list ? { list: focus.list } : null; }
    }
    banner = null;
    render();
  }

  // ------------------------------------------------------------------ DOM
  const toolbox = h("div", { class: "cfg-rx-toolbox" });
  const flyout = h("div", { class: "cfg-rx-flyout" });
  const canvas = h("div", { class: "cfg-rx-canvas" });
  const bannerEl = h("div", { class: "cfg-rx-banner" });
  const body = h("div", { class: "cfg-rx" }, h("div", { class: "cfg-rx-left" }, h("div", { class: "cfg-rx-tbtitle", text: "Toolbox" }), toolbox, flyout), h("div", { class: "cfg-rx-right" }, bannerEl, canvas));
  canvas.addEventListener("click", (e) => { if (e.target === canvas) { focus = null; render(); } });

  function renderToolbox() {
    toolbox.textContent = "";
    for (const [k, label] of RL.CATEGORIES) {
      const avail = k === "rules" || k === "logic" || RL.aspects(app.doc, k, app.M).length > 0;
      const b = h("button", { type: "button", class: `cfg-rx-cat cfg-rx-c-${k}${openCat === k ? " on" : ""}`, "data-cat": k, title: CAT_DESC[k], text: label });
      if (!avail) b.disabled = true;
      b.addEventListener("click", () => { openCat = openCat === k ? null : k; render(); });
      toolbox.append(b);
    }
    flyout.textContent = "";
    flyout.style.display = openCat ? "" : "none";
    if (!openCat) return;
    flyout.append(h("div", { class: "cfg-rx-fdesc", text: CAT_DESC[openCat] }));
    for (const [kind, label] of BLOCKS[openCat]) {
      const cat = openCat === "logic" || openCat === "rules" ? null : openCat;
      const b = h("button", { type: "button", class: `cfg-rx-fb cfg-rx-k-${kind}`, "data-block": kind, "data-cat": openCat, text: label,
        title: kind === "rule" ? "Use the Rule block to contain the blocks that make up each logical rule that drives configured aspects."
          : kind === "set" ? "Use the Setter block to drive or limit the value of a configured aspect when a condition is met."
            : kind === "get" ? "Use the Getter block to define a condition based on the value of a configured aspect."
              : kind === "if" ? "Use the Logic block to create logical rules that drive configured aspects. Click the Settings button to adjust the format of the logic." : "" });
      b.addEventListener("click", () => insert(kind, cat));
      flyout.append(b);
    }
  }

  function selectEl(options, value, onChange, cls = "") {
    const s = h("select", { class: `cfg-rx-sel ${cls}` });
    for (const [v, label] of options) s.append(h("option", { value: v, text: label }));
    if (value !== null && value !== undefined) s.value = String(value);
    s.addEventListener("change", () => { onChange(s.value); banner = null; render(); });
    s.addEventListener("click", stop);
    s.addEventListener("keydown", stop);
    return s;
  }
  function numInput(v, onChange, placeholder = "") {
    const i = h("input", { class: "cfg-rx-num", value: Number.isFinite(v) ? String(v) : "", placeholder, spellcheck: "false" });
    i.addEventListener("click", stop);
    i.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") i.blur(); });
    i.addEventListener("change", () => { const t = i.value.trim(); const n = t === "" ? NaN : Number(t.replace(/\s*(mm|deg)$/i, "")); onChange(Number.isFinite(n) ? n : null); banner = null; render(); });
    return i;
  }
  function unitOf(col) { const c = cfg(); const cc = D.column(c, col); return cc ? ({ angle: "deg", none: "" }[D.colUnitKind(app.doc, cc, app.M)] ?? "mm") : ""; }

  function leafBlock(b, onDelete) {
    const c = cfg();
    const isSet = b.t === "set";
    const el = h("div", { class: `cfg-rb cfg-rb-${b.t}`, "data-blk": b.t });
    el.append(h("span", { class: "cfg-rb-kw", text: isSet ? "set" : "get" }));
    const curCat = b.col ? RL.categoryOf(c, b.col) : null;
    const cats = catsAvailable(isSet);
    const catOpts = cats.map(([k, l]) => [k, l]);
    if (!curCat) catOpts.unshift(["", "Category"]);
    el.append(selectEl(catOpts, curCat || "", (v) => { if (v) defaultsFor(b, v); }, "cfg-rx-cat-sel"));
    const asp = curCat ? RL.aspects(app.doc, curCat, app.M) : [];
    const aspOpts = asp.map((a) => [a.col, a.label]);
    if (!b.col) aspOpts.unshift(["", "Aspect"]);
    el.append(selectEl(aspOpts, b.col || "", (v) => { b.col = v || null; fixOp(b); b.value = defaultValue(c, b); }, "cfg-rx-asp-sel"));
    const type = RL.leafType(c, b.col);
    if (type) {
      const ops = (isSet ? RL.SET_OPS : RL.GET_OPS)[type];
      el.append(selectEl(ops, b.op, (v) => { const was = b.op; b.op = v; if ((was === "range") !== (v === "range") || (was === "anyOf") !== (v === "anyOf")) b.value = defaultValue(c, b); }, "cfg-rx-op-sel"));
      el.append(valueEditor(b, type, isSet));
    }
    if (!RL.blockComplete(c, b)) el.append(h("span", { class: "cfg-rb-warn", title: "Incomplete block\n\nThis block is incomplete. It is ignored in the rule until you complete it.", html: G.warn() }));
    el.append(delBtn(onDelete));
    return el;
  }
  function valueEditor(b, type, isSet) {
    const c = cfg();
    const wrap = h("span", { class: "cfg-rx-val" });
    const u = unitOf(b.col);
    if (type === "number") {
      if (b.op === "range") {
        const v = b.value && typeof b.value === "object" && !Array.isArray(b.value) ? b.value : (b.value = {});
        wrap.append(h("span", { class: "cfg-rb-kw2", text: "min" }), numInput(v.min, (n) => { if (n === null) delete v.min; else v.min = n; }, "—"),
          h("span", { class: "cfg-rb-kw2", text: "max" }), numInput(v.max, (n) => { if (n === null) delete v.max; else v.max = n; }, "—"));
        if (isSet) wrap.append(h("span", { class: "cfg-rb-kw2", text: "increment" }), numInput(v.step, (n) => { if (n === null) delete v.step; else v.step = n; }, "—"));
      } else if (b.op === "anyOf") {
        const i = h("input", { class: "cfg-rx-list", value: Array.isArray(b.value) ? b.value.join(", ") : "", placeholder: "10, 20, 30", spellcheck: "false" });
        i.addEventListener("click", stop);
        i.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") i.blur(); });
        i.addEventListener("change", () => { b.value = i.value.split(/[,;\s]+/).map((x) => Number(x)).filter(Number.isFinite); banner = null; render(); });
        wrap.append(i);
      } else wrap.append(numInput(b.value, (n) => { b.value = n; }));
      if (u) wrap.append(h("span", { class: "cfg-rb-unit", text: u }));
    } else if (type === "bool") {
      const n = RL.boolNames(c, b.col);
      wrap.append(selectEl([["true", n.true], ["false", n.false]], String(b.value !== false), (v) => { b.value = v === "true"; }, "cfg-rx-bool"));
    } else if (type === "list") {
      const opts = RL.listOptions(c, b.col);
      const cur = new Set([].concat(b.value || []));
      for (const o of opts) {
        const chip = h("button", { type: "button", class: `cfg-rx-chip${cur.has(o.id) ? " on" : ""}`, "data-opt": o.id, text: o.name });
        chip.addEventListener("click", (e) => { e.stopPropagation(); if (cur.has(o.id)) cur.delete(o.id); else cur.add(o.id); b.value = [...cur]; banner = null; render(); });
        wrap.append(chip);
      }
    }
    return wrap;
  }
  function delBtn(onDelete) {
    const x = h("button", { type: "button", class: "cfg-rb-x", title: "Delete Block", html: G.x() });
    x.addEventListener("click", (e) => { e.stopPropagation(); onDelete(); banner = null; render(); });
    return x;
  }
  function slot(obj, key) {
    const x = obj[key];
    if (x) return condBlock(x, () => { obj[key] = null; });
    const on = focus && focus.slot && focus.slot.obj === obj && focus.slot.key === key;
    const s = h("div", { class: `cfg-rx-slot${on ? " focus" : ""}`, "data-slot": key, title: "Click, then click a Getter, And/Or or Not block in the Toolbox", text: "condition" });
    s.addEventListener("click", (e) => { e.stopPropagation(); focus = { slot: { obj, key } }; render(); });
    return s;
  }
  function condBlock(x, onDelete) {
    if (x.t === "get") return leafBlock(x, onDelete);
    if (x.t === "and" || x.t === "or") {
      const el = h("div", { class: "cfg-rb cfg-rb-and", "data-blk": "and" });
      el.append(slot(x, "a"), selectEl([["and", "and"], ["or", "or"]], x.t, (v) => { x.t = v; }, "cfg-rx-andor"), slot(x, "b"), delBtn(onDelete));
      return el;
    }
    if (x.t === "not") {
      const el = h("div", { class: "cfg-rb cfg-rb-not", "data-blk": "not" });
      el.append(h("span", { class: "cfg-rb-kw", text: "not" }), slot(x, "a"), delBtn(onDelete));
      return el;
    }
    return h("div", {});
  }
  function stmtList(list, label = null) {
    const on = focus && focus.list === list && !focus.slot;
    const box = h("div", { class: `cfg-rx-stmts${on ? " focus" : ""}`, "data-stmts": "" });
    box.addEventListener("click", (e) => { e.stopPropagation(); focus = { list }; render(); });
    if (label) box.append(h("div", { class: "cfg-rb-lbl", text: label }));
    list.forEach((s, i) => {
      const del = () => { list.splice(i, 1); };
      const moveBtns = h("span", { class: "cfg-rb-move" },
        h("button", { type: "button", class: "cfg-rb-mv", title: "Move Up", html: G.up() }), h("button", { type: "button", class: "cfg-rb-mv", title: "Move Down", html: G.down() }));
      moveBtns.children[0].addEventListener("click", (e) => { e.stopPropagation(); if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; render(); } });
      moveBtns.children[1].addEventListener("click", (e) => { e.stopPropagation(); if (i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; render(); } });
      let el;
      if (s.t === "set") { el = leafBlock(s, del); el.insertBefore(moveBtns, el.lastChild); }
      else if (s.t === "comment") {
        el = h("div", { class: "cfg-rb cfg-rb-comment", "data-blk": "comment" }, h("span", { class: "cfg-rb-kw", text: "Comment" }));
        const t = h("input", { class: "cfg-rx-text", value: s.text || "", placeholder: "This rule does...", spellcheck: "false" });
        t.addEventListener("click", stop);
        t.addEventListener("keydown", stop);
        t.addEventListener("change", () => { s.text = t.value; });
        el.append(t, moveBtns, delBtn(del));
      } else if (s.t === "if") el = ifBlock(s, del, moveBtns);
      if (el) box.append(el);
    });
    box.append(h("div", { class: "cfg-rx-drop", text: list.length ? "" : "Click a block in the Toolbox to add it here" }));
    return box;
  }
  function ifBlock(s, del, moveBtns) {
    const el = h("div", { class: "cfg-rb cfg-rb-if", "data-blk": "if" });
    const gear = h("button", { type: "button", class: "cfg-rb-gear", title: "Settings\n\nAdjust the format of the logic.", html: G.gear() });
    // the Logic block's mutator (Fusion: Settings button -> flyout to add "else if" / "else")
    gear.addEventListener("click", (e) => { e.stopPropagation(); if (mutOpen.has(s)) mutOpen.delete(s); else mutOpen.add(s); render(); });
    let mut = null;
    if (mutOpen.has(s)) {
      const mb = (label, fn) => { const b = h("button", { type: "button", class: "cfg-rb-mutb", "data-mutator": label, text: label }); b.addEventListener("click", (ev) => { ev.stopPropagation(); fn(); mutOpen.delete(s); banner = null; render(); }); return b; };
      mut = h("div", { class: "cfg-rb-mut" },
        mb("Add else if", () => { s.elifs = s.elifs || []; s.elifs.push({ cond: null, then: [] }); }),
        s.else ? mb("Remove else", () => { s.else = null; }) : mb("Add else", () => { s.else = []; }));
    }
    el.append(h("div", { class: "cfg-rb-row" }, gear, h("span", { class: "cfg-rb-kw", text: "if" }), slot(s, "cond"), moveBtns, delBtn(del)));
    if (mut) el.append(mut);
    el.append(h("div", { class: "cfg-rb-row cfg-rb-then" }, h("span", { class: "cfg-rb-kw", text: "then" }), stmtList(s.then)));
    (s.elifs || []).forEach((e, i) => {
      el.append(h("div", { class: "cfg-rb-row" }, h("span", { class: "cfg-rb-kw", text: "else if" }), slot(e, "cond"), delBtn(() => { s.elifs.splice(i, 1); })));
      el.append(h("div", { class: "cfg-rb-row cfg-rb-then" }, h("span", { class: "cfg-rb-kw", text: "then" }), stmtList(e.then)));
    });
    if (s.else) el.append(h("div", { class: "cfg-rb-row cfg-rb-then" }, h("span", { class: "cfg-rb-kw", text: "else" }), stmtList(s.else)));
    return el;
  }
  function ruleBlock(rule, i) {
    const td = tmpDoc();
    const appliedRule = applied.find((r) => r.id === rule.id);
    const pending = !appliedRule || JSON.stringify(appliedRule) !== JSON.stringify(rule);
    const st = pending ? "pending" : RL.ruleStatus(td, rule);
    const issues = RL.ruleIssues(td, rule);
    const el = h("div", { class: `cfg-rb cfg-rb-rule${rule.active ? "" : " off"}`, "data-rule": rule.id });
    const tog = h("button", { type: "button", class: `cfg-rx-toggle${rule.active ? " on" : ""}`, "data-rule-toggle": "", title: `${rule.active ? "Rule is on" : "Rule is off"}\n\n${rule.active ? "Click to turn the rule off if you need to temporarily disable or troubleshoot it." : "Click to turn the rule on when you're ready to validate and run it."}`, text: rule.active ? "On" : "Off" });
    tog.addEventListener("click", (e) => { e.stopPropagation(); rule.active = !rule.active; banner = null; render(); });
    const name = h("input", { class: "cfg-rx-name", value: rule.name, "data-rule-name": "", spellcheck: "false", title: "Rule Name" });
    name.addEventListener("click", stop);
    name.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") name.blur(); });
    name.addEventListener("change", () => { rule.name = name.value.trim() || rule.name; render(); });
    const stIco = st === "success" ? G.ok() : st === "error" ? G.error() : st === "warning" ? G.warn() : st === "off" ? G.off() : G.info();
    const stTip = `${RL.STATUS_TITLE[st]}\n\n${RL.STATUS_TEXT[st]}${st === "pending" ? "\n\nUse Apply to commit pending changes and run the updated rule in this Configured Design." : ""}${issues.length ? `\n\n${issues.map((x) => `${x.title}: ${x.text}`).join("\n")}` : ""}`;
    const status = h("span", { class: `cfg-rx-status st-${st}`, "data-rule-status": st, title: stTip, html: `${stIco}<span>${st === "pending" ? "Pending..." : RL.STATUS_TITLE[st]}</span>` });
    const up = h("button", { type: "button", class: "cfg-rb-mv", title: "Move Rule Up", html: G.up() });
    const dn = h("button", { type: "button", class: "cfg-rb-mv", title: "Move Rule Down", html: G.down() });
    up.addEventListener("click", (e) => { e.stopPropagation(); if (i > 0) { [work[i - 1], work[i]] = [work[i], work[i - 1]]; render(); } });
    dn.addEventListener("click", (e) => { e.stopPropagation(); if (i < work.length - 1) { [work[i + 1], work[i]] = [work[i], work[i + 1]]; render(); } });
    el.append(h("div", { class: "cfg-rb-head" }, tog, h("span", { class: "cfg-rb-kw", text: "Rule" }), name, status, h("span", { class: "cfg-grow" }), up, dn, delBtn(() => { work.splice(i, 1); })));
    const cm = h("input", { class: "cfg-rx-comment", value: rule.comment || "", placeholder: "This rule does...", spellcheck: "false", title: "Comment" });
    cm.addEventListener("click", stop);
    cm.addEventListener("keydown", stop);
    cm.addEventListener("change", () => { rule.comment = cm.value; });
    el.append(cm, stmtList(rule.body));
    return el;
  }
  function render() {
    renderToolbox();
    const keep = canvas.scrollTop;
    canvas.textContent = "";
    if (!work.length) canvas.append(h("div", { class: "cfg-rx-empty" }, h("b", { text: "Configuration Rules" }),
      h("p", { text: "Use Configuration Rules to automate logical choices in this Configured Design to ensure you can only select manufacturable combinations of values for each configuration." }),
      h("ul", {}, h("li", { text: "Create logical rules." }), h("li", { text: "Use Getter and Setter blocks to reference configured aspects." }), h("li", { text: "Turn rules on and off independently." }), h("li", { text: "Apply rules to drive or limit values in configurations." })),
      h("p", { text: "Open the Rules category in the Toolbox and click Rule to start." })));
    work.forEach((r, i) => canvas.append(ruleBlock(r, i)));
    canvas.scrollTop = keep;
    bannerEl.style.display = banner ? "" : "none";
    if (banner) { bannerEl.className = `cfg-rx-banner b-${banner.kind}`; bannerEl.innerHTML = `${banner.kind === "success" ? G.ok() : banner.kind === "error" ? G.error() : G.warn()}<span>${banner.text}</span>`; }
    const ap = handle && handle.button ? handle.button("apply") : null;
    if (ap) ap.disabled = !dirty();
    const ds = handle && handle.button ? handle.button("discard") : null;
    if (ds) ds.disabled = !dirty();
  }

  function apply() {
    const res = ctl.applyRules(work);
    applied = D.clone(work);
    const td = tmpDoc();
    const st = work.map((r) => RL.ruleStatus(td, r));
    const err = st.filter((s) => s === "error").length, warn = st.filter((s) => s === "warning").length, okc = st.filter((s) => s === "success").length;
    if (err) banner = { kind: "error", text: err === 1 ? "1 rule is temporarily disabled because it contains errors." : `${err} rules are temporarily disabled because they contain errors.` };
    else if (warn) banner = { kind: "warning", text: warn === 1 ? "1 rule contains a warning that needs your attention." : `${warn} rules contain warnings that need your attention.` };
    else banner = { kind: "success", text: okc === 1 ? "1 rule was successfully applied to configurations." : `${okc} rules were successfully applied to configurations.` };
    if (res && res.changes && res.changes.length) banner.text += ` ${res.changes.length} value${res.changes.length === 1 ? " was" : "s were"} updated in the configuration table.`;
    render();
    return false; // keep the editor open
  }

  let handle = null;
  const opts = {
    id: "FusionConfigurationRulesCmd",
    title: "CONFIGURATION RULES",
    body,
    width: 980,
    height: 600,
    className: "cfg-rx-modal",
    footLeft: h("span", { class: "cfg-rx-foot-note", text: "Rules run top to bottom against every configuration." }),
    buttons: [
      { action: "discard", label: "Discard", onClick: () => { work = D.clone(applied); focus = null; banner = null; render(); return false; } },
      { action: "apply", label: "Apply", primary: true, onClick: () => apply() },
    ],
    onCancel: () => {},
    onClose: () => { offDoc(); },
  };
  const offDoc = app.on("doc", (d) => { if (d.replaced && !D.get(app.doc)) { try { handle && handle.close("cancel"); } catch { /* ignore */ } } else render(); });
  if (modals && modals.open) {
    // closing with pending changes asks first (Apply / Discard / Cancel)
    handle = modals.open({ ...opts, closable: true });
    // × and Esc go through handle.press("cancel"): with pending changes ask first (Apply / Discard / Cancel)
    const press0 = handle.press;
    let asking = false;
    handle.press = (action) => {
      if (action !== "cancel" || !dirty()) return press0(action);
      if (asking) return undefined;
      asking = true;
      modals.confirm({ id: "ConfigurationRulesPending", title: "Configuration Rules", kind: "warning", message: "The rules have pending changes that are not yet applied.<br><br>Apply them before you close Configuration Rules?",
        buttons: [{ action: "apply", label: "Apply", primary: true }, { action: "discard", label: "Discard" }, { action: "cancel", label: "Cancel" }] })
        .then((r) => { asking = false; if (r === "apply") { apply(); handle.close("ok"); } else if (r === "discard") handle.close("cancel"); });
      return undefined;
    };
  } else {
    const host = app.dom.overlay || document.body;
    const wrap = h("div", { class: "cfg-fallback-modal cfg-rx-modal", "data-dialog": "FusionConfigurationRulesCmd" }, h("div", { class: "cfg-fm-title", text: "CONFIGURATION RULES" }), body);
    const btns = { apply: h("button", { type: "button", "data-action": "apply", text: "Apply" }), close: h("button", { type: "button", "data-action": "cancel", text: "Close" }) };
    btns.apply.addEventListener("click", apply);
    btns.close.addEventListener("click", () => { offDoc(); wrap.remove(); });
    wrap.append(btns.apply, btns.close);
    host.append(wrap);
    handle = { button: (a) => btns[a] || null, close: () => { offDoc(); wrap.remove(); } };
  }
  openCat = "rules";
  render();
  return {
    handle,
    get work() { return work; },
    insert,
    apply,
    render,
    focusRule(id) { const r = work.find((x) => x.id === id); if (r) { focus = { list: r.body }; render(); } },
  };
}
