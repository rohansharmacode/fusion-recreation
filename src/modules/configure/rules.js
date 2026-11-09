// Configuration Rules engine (pure, no DOM). Local equivalent of Fusion's rules pipeline: the rules are
// stored in the document (doc.configurations.rules) and evaluated here instead of on Autodesk's servers.
//
// rule  = {id, name, comment, active, body:[stmt]}
// stmt  = {t:'set', col, op, value}                                   Setter block
//       | {t:'if', cond, then:[stmt], elifs:[{cond, then:[stmt]}], else:[stmt]|null}   Logic block
//       | {t:'comment', text}                                         Comment block
// cond  = {t:'get', col, op, value}                                   Getter block
//       | {t:'and'|'or', a:cond, b:cond} | {t:'not', a:cond}         And / Or, Not
// col   = a top-table column id, or "config" (the Configurations category: the configuration itself)
// Getter operators: eq ne gt ge lt le range anyOf     Setter operators: eq ne min max range anyOf
// Values: number (mm / deg / plain, the column's display unit) | boolean | [ids] | {min?, max?, step?} | [numbers]
//
// Semantics (from Fusion's ConfigurationRuleGet/SetOperators): rules run top to bottom against every
// configuration; statements run in order. A Setter with "=" DRIVES the value; min / max / range / any of
// (and "≠" on lists) LIMIT it. Driven cells are read-only in the table; limited cells reject values that
// violate the rule ("Value violates rule") and are clamped when rules are applied.
import * as D from "./data.js";

export const GET_OPS = {
  number: [["eq", "="], ["ne", "≠"], ["gt", ">"], ["ge", "≥"], ["lt", "<"], ["le", "≤"], ["range", "range"], ["anyOf", "any of"]],
  bool: [["eq", "="], ["ne", "≠"]],
  list: [["eq", "="], ["ne", "≠"]],
};
export const SET_OPS = {
  number: [["eq", "="], ["min", "min"], ["max", "max"], ["range", "range"], ["anyOf", "any of"]],
  bool: [["eq", "="], ["ne", "≠"]],
  list: [["eq", "="], ["ne", "≠"]],
};
export const CATEGORIES = [
  ["rules", "Rules"], ["logic", "Logic"], ["configurations", "Configurations"], ["userParameters", "User Parameters"],
  ["modelingFeatures", "Modeling Features"], ["components", "Components"], ["themeTables", "Theme Tables"],
];
const EPS = 1e-7;

/** Leaf type of a column for rules: 'number' | 'bool' | 'list'. */
export function leafType(c, colId) {
  if (colId === "config") return "list";
  const col = D.column(c, colId);
  if (!col) return null;
  return col.kind === "param" ? "number" : col.kind === "theme" ? "list" : "bool";
}
/** Toolbox category of a column. */
export function categoryOf(c, colId) {
  if (colId === "config") return "configurations";
  const col = D.column(c, colId);
  if (!col) return null;
  if (col.kind === "param") return col.user ? "userParameters" : "modelingFeatures";
  if (col.kind === "theme") return "themeTables";
  if (col.kind === "visibility" && col.body) return "components";
  return "modelingFeatures";
}
/** Aspects available in a category: [{col, label}] (getter=true includes the Configurations getter). */
export function aspects(doc, category, M) {
  const c = D.get(doc);
  if (!c) return [];
  if (category === "configurations") return [{ col: "config", label: "Configuration" }];
  return c.columns.filter((col) => categoryOf(c, col.id) === category || !category).map((col) => {
    const d = D.describe(doc, col, M);
    return { col: col.id, label: col.kind === "theme" || col.user ? d.title : `${d.group} ${d.title}`.trim() };
  });
}
/** Options for list leaves: [{id, name}] (theme rows or configuration rows). */
export function listOptions(c, colId) {
  if (colId === "config") return c.rows.map((r) => ({ id: r.id, name: r.name }));
  const col = D.column(c, colId);
  const th = col && col.kind === "theme" ? c.themes[col.table] : null;
  return th ? th.rows.map((r) => ({ id: r.id, name: r.name })) : [];
}
/** Display names of a boolean column's states. */
export function boolNames(c, colId) {
  const col = D.column(c, colId);
  if (col && col.kind === "suppress") return { true: "Suppressed", false: "Unsuppressed" };
  if (col && col.kind === "visibility") return { true: "Visible", false: "Hidden" };
  return { true: "True", false: "False" };
}

// ----------------------------------------------------------------------------------- completeness
function valueOk(type, op, v) {
  if (v === null || v === undefined) return false;
  if (type === "number") {
    if (op === "range") return v && typeof v === "object" && (Number.isFinite(v.min) || Number.isFinite(v.max) || Number.isFinite(v.step));
    if (op === "anyOf") return Array.isArray(v) && v.length > 0 && v.every(Number.isFinite);
    return Number.isFinite(v);
  }
  if (type === "bool") return typeof v === "boolean";
  if (type === "list") return Array.isArray(v) ? v.length > 0 : typeof v === "string";
  return false;
}
export function blockComplete(c, b) {
  if (!b) return false;
  if (b.t === "get" || b.t === "set") {
    const type = leafType(c, b.col);
    if (!type || !b.op) return false;
    const ops = (b.t === "get" ? GET_OPS : SET_OPS)[type].map((o) => o[0]);
    if (!ops.includes(b.op)) return false;
    if (b.t === "set" && b.col === "config") return false;
    return valueOk(type, b.op, b.value);
  }
  if (b.t === "and" || b.t === "or") return blockComplete(c, b.a) && blockComplete(c, b.b);
  if (b.t === "not") return blockComplete(c, b.a);
  return true;
}

/** Issues of a rule: [{kind:'warning'|'error', title, text, block}] (incomplete blocks, conflicts). */
export function ruleIssues(doc, rule) {
  const c = D.get(doc);
  const out = [];
  if (!c) return out;
  const walkCond = (x) => {
    if (!x) return;
    if (x.t === "get") { if (!blockComplete(c, x)) out.push({ kind: "warning", title: "Incomplete block", text: "This block is incomplete. It is ignored in the rule until you complete it.", block: x }); }
    else if (x.t === "and" || x.t === "or") { if (!x.a || !x.b) out.push({ kind: "warning", title: "Incomplete block", text: "This block is incomplete. It is ignored in the rule until you complete it.", block: x }); walkCond(x.a); walkCond(x.b); }
    else if (x.t === "not") { if (!x.a) out.push({ kind: "warning", title: "Incomplete block", text: "This block is incomplete. It is ignored in the rule until you complete it.", block: x }); walkCond(x.a); }
  };
  const walk = (list) => {
    for (const s of list || []) {
      if (s.t === "set") {
        if (!blockComplete(c, s)) out.push({ kind: "warning", title: "Incomplete block", text: "This block is incomplete. It is ignored in the rule until you complete it.", block: s });
        else if (s.op === "range" && Number.isFinite(s.value.min) && Number.isFinite(s.value.max) && s.value.min > s.value.max) out.push({ kind: "error", title: "Aspect list excludes all values", text: "This block excludes all values from the list. You need to maintain at least one valid value.", block: s });
        else if (s.op === "range" && Number.isFinite(s.value.step) && s.value.step <= 0) out.push({ kind: "error", title: "Valid block data is missing", text: "The increment must be greater than 0.", block: s });
      } else if (s.t === "if") {
        if (!s.cond) out.push({ kind: "warning", title: "Incomplete block", text: "This block is incomplete. It is ignored in the rule until you complete it.", block: s });
        walkCond(s.cond);
        walk(s.then);
        for (const e of s.elifs || []) { if (!e.cond) out.push({ kind: "warning", title: "Incomplete block", text: "This block is incomplete. It is ignored in the rule until you complete it.", block: e }); walkCond(e.cond); walk(e.then); }
        walk(s.else);
      }
    }
  };
  walk(rule.body);
  return out;
}
/** Fusion's rule status: 'off' | 'error' | 'warning' | 'success'. */
export function ruleStatus(doc, rule) {
  if (!rule.active) return "off";
  const iss = ruleIssues(doc, rule);
  if (iss.some((i) => i.kind === "error")) return "error";
  if (iss.length) return "warning";
  return "success";
}
export const STATUS_TITLE = { off: "Rule is off", error: "Rule contains errors", warning: "Rule contains warnings", success: "Rule is active", pending: "Rule has pending changes" };
export const STATUS_TEXT = {
  off: "Click to turn the rule on when you're ready to validate and run it.",
  error: "This rule contains one or more errors. Rules with errors will not run until you resolve them.",
  warning: "This rule contains one or more warnings. Rules with warnings may produce unexpected results until you resolve them.",
  success: "This rule is active. It is enforced for all configurations in this Configured Design.",
  pending: "This rule has pending changes that are not yet applied.",
};

// ----------------------------------------------------------------------------------- evaluation
function rowValues(doc, c, rowId, M) {
  const nums = D.rowNumbers(doc, rowId, M);
  const cells = c.cells[rowId] || {};
  const v = { config: rowId };
  for (const col of c.columns) {
    if (col.kind === "param") v[col.id] = nums[col.id];
    else v[col.id] = cells[col.id];
  }
  return v;
}
function testGet(c, g, values) {
  const type = leafType(c, g.col);
  const cur = values[g.col];
  const v = g.value;
  if (type === "number") {
    if (!Number.isFinite(cur)) return false;
    switch (g.op) {
      case "eq": return Math.abs(cur - v) <= EPS * Math.max(1, Math.abs(v));
      case "ne": return Math.abs(cur - v) > EPS * Math.max(1, Math.abs(v));
      case "gt": return cur > v + EPS;
      case "ge": return cur >= v - EPS;
      case "lt": return cur < v - EPS;
      case "le": return cur <= v + EPS;
      case "range": return (!Number.isFinite(v.min) || cur >= v.min - EPS) && (!Number.isFinite(v.max) || cur <= v.max + EPS);
      case "anyOf": return v.some((x) => Math.abs(cur - x) <= EPS * Math.max(1, Math.abs(x)));
      default: return false;
    }
  }
  if (type === "bool") return g.op === "ne" ? !!cur !== v : !!cur === v;
  if (type === "list") { const list = [].concat(v); return g.op === "ne" ? !list.includes(cur) : list.includes(cur); }
  return false;
}
function testCond(c, x, values) {
  if (!x || !blockComplete(c, x)) return false;
  if (x.t === "get") return testGet(c, x, values);
  if (x.t === "and") return testCond(c, x.a, values) && testCond(c, x.b, values);
  if (x.t === "or") return testCond(c, x.a, values) || testCond(c, x.b, values);
  if (x.t === "not") return !testCond(c, x.a, values);
  return false;
}

/**
 * Evaluate the active rules for one configuration row.
 * Returns {driven:{col:{value, rule}}, limits:{col:{min,max,step,list,exclude,rule}}}.
 * opts.values: override row values (checking a proposed edit).
 */
export function evalRow(doc, rowId, M, opts = {}) {
  const c = D.get(doc);
  const out = { driven: {}, limits: {} };
  if (!c || !c.rules.length) return out;
  const values = opts.values || rowValues(doc, c, rowId, M);
  const lim = (col, rule) => (out.limits[col] = out.limits[col] || { rule });
  const exec = (list, rule) => {
    for (const s of list || []) {
      if (s.t === "set") {
        if (!blockComplete(c, s)) continue;
        const type = leafType(c, s.col);
        const v = s.value;
        if (type === "number") {
          if (s.op === "eq") { out.driven[s.col] = { value: v, rule: rule.name }; values[s.col] = v; }
          else if (s.op === "min") { const L = lim(s.col, rule.name); L.min = Number.isFinite(L.min) ? Math.max(L.min, v) : v; }
          else if (s.op === "max") { const L = lim(s.col, rule.name); L.max = Number.isFinite(L.max) ? Math.min(L.max, v) : v; }
          else if (s.op === "range") {
            const L = lim(s.col, rule.name);
            if (Number.isFinite(v.min)) L.min = Number.isFinite(L.min) ? Math.max(L.min, v.min) : v.min;
            if (Number.isFinite(v.max)) L.max = Number.isFinite(L.max) ? Math.min(L.max, v.max) : v.max;
            if (Number.isFinite(v.step) && v.step > 0) L.step = v.step;
          } else if (s.op === "anyOf") { const L = lim(s.col, rule.name); L.nums = L.nums ? L.nums.filter((x) => v.some((y) => Math.abs(x - y) < EPS)) : [...v]; }
        } else if (type === "bool") {
          const val = s.op === "ne" ? !v : !!v;
          out.driven[s.col] = { value: val, rule: rule.name };
          values[s.col] = val;
        } else if (type === "list") {
          const list = [].concat(v);
          if (s.op === "eq" && list.length === 1) { out.driven[s.col] = { value: list[0], rule: rule.name }; values[s.col] = list[0]; }
          else if (s.op === "eq") { const L = lim(s.col, rule.name); L.list = L.list ? L.list.filter((x) => list.includes(x)) : [...list]; }
          else { const L = lim(s.col, rule.name); L.exclude = [...new Set([...(L.exclude || []), ...list])]; }
        }
      } else if (s.t === "if") {
        if (s.cond && testCond(c, s.cond, values)) { exec(s.then, rule); continue; }
        let done = false;
        for (const e of s.elifs || []) if (e.cond && testCond(c, e.cond, values)) { exec(e.then, rule); done = true; break; }
        if (!done && s.else) exec(s.else, rule);
      }
    }
  };
  for (const rule of c.rules) {
    if (!rule.active) continue;
    if (ruleIssues(doc, rule).some((i) => i.kind === "error")) continue; // rules with errors do not run
    exec(rule.body, rule);
  }
  return out;
}

/** Does a number satisfy a limit? */
export function numberAllowed(v, L) {
  if (!L) return true;
  if (Number.isFinite(L.min) && v < L.min - EPS) return false;
  if (Number.isFinite(L.max) && v > L.max + EPS) return false;
  if (Number.isFinite(L.step) && L.step > 0) {
    const base = Number.isFinite(L.min) ? L.min : 0;
    const k = (v - base) / L.step;
    if (Math.abs(k - Math.round(k)) > 1e-6) return false;
  }
  if (L.nums && !L.nums.some((x) => Math.abs(x - v) < EPS * Math.max(1, Math.abs(x)))) return false;
  return true;
}
/** Nearest allowed number (clamp, snap to the increment, nearest list entry). */
export function nearestAllowed(v, L) {
  if (!L) return v;
  if (L.nums && L.nums.length) {
    let pool = L.nums.filter((x) => (!Number.isFinite(L.min) || x >= L.min - EPS) && (!Number.isFinite(L.max) || x <= L.max + EPS));
    if (!pool.length) pool = L.nums;
    return pool.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), pool[0]);
  }
  let r = v;
  if (Number.isFinite(L.step) && L.step > 0) {
    const base = Number.isFinite(L.min) ? L.min : 0;
    r = base + Math.round((r - base) / L.step) * L.step;
  }
  if (Number.isFinite(L.min) && r < L.min) r = Number.isFinite(L.step) && L.step > 0 ? L.min : L.min;
  if (Number.isFinite(L.max) && r > L.max) {
    r = L.max;
    if (Number.isFinite(L.step) && L.step > 0) { const base = Number.isFinite(L.min) ? L.min : 0; r = base + Math.floor((L.max - base) / L.step + 1e-9) * L.step; }
  }
  return Math.round(r * 1e9) / 1e9;
}
function listAllowed(id, L) {
  if (!L) return true;
  if (L.list && !L.list.includes(id)) return false;
  if (L.exclude && L.exclude.includes(id)) return false;
  return true;
}

/**
 * Enforce the rules on every configuration row (or `rowIds`): driven cells take the rule value, limited
 * cells are moved to the nearest valid value. Call inside app.mutate. Returns [{row, col, from, to}].
 */
export function enforce(doc, M, rowIds = null) {
  const c = D.get(doc);
  const changes = [];
  if (!c || !c.rules.length) return changes;
  for (const r of c.rows) {
    if (rowIds && !rowIds.includes(r.id)) continue;
    // two passes: a driven value can change what a later getter sees
    for (let pass = 0; pass < 2; pass++) {
      const res = evalRow(doc, r.id, M);
      const nums = D.rowNumbers(doc, r.id, M);
      const cells = (c.cells[r.id] = c.cells[r.id] || {});
      let any = false;
      for (const col of c.columns) {
        const type = leafType(c, col.id);
        const dv = res.driven[col.id];
        const L = res.limits[col.id];
        let to;
        if (dv) {
          if (type === "number") { const cur = nums[col.id]; if (!(Number.isFinite(cur) && Math.abs(cur - dv.value) < EPS)) to = D.numExpr(dv.value, D.colUnitKind(doc, col, M)); }
          else if (cells[col.id] !== dv.value) to = dv.value;
        } else if (L) {
          if (type === "number") { const cur = nums[col.id]; if (Number.isFinite(cur) && !numberAllowed(cur, L)) to = D.numExpr(nearestAllowed(cur, L), D.colUnitKind(doc, col, M)); }
          else if (type === "list" && !listAllowed(cells[col.id], L)) {
            const ok = listOptions(c, col.id).find((o) => listAllowed(o.id, L));
            if (ok) to = ok.id;
          }
        }
        if (to !== undefined && to !== cells[col.id]) { changes.push({ row: r.id, col: col.id, from: cells[col.id], to }); cells[col.id] = to; any = true; }
      }
      if (!any) break;
    }
  }
  return changes;
}

/** Is a cell driven / limited in a row? {driven?:{value, rule}, limit?:{...}} */
export function cellState(evalRes, colId) {
  return { driven: evalRes.driven[colId] || null, limit: evalRes.limits[colId] || null };
}

/**
 * Check a proposed cell value against the rules. Returns null when allowed, else
 * {title, text, rule}. `value` is the cell value (expression string for parameters).
 */
export function checkEdit(doc, rowId, colId, value, M) {
  const c = D.get(doc);
  if (!c || !c.rules.length) return null;
  const col = D.column(c, colId);
  if (!col) return null;
  const tmp = { ...doc, configurations: { ...c, cells: { ...c.cells, [rowId]: { ...(c.cells[rowId] || {}), [colId]: value } } } };
  const before = evalRow(doc, rowId, M);
  if (before.driven[colId]) return { title: "Driven by rule", text: "This aspect's value is driven by a configuration rule. If you need to edit the rule, use the Configuration Rules tool.", rule: before.driven[colId].rule };
  const res = evalRow(tmp, rowId, M);
  const L = res.limits[colId];
  if (!L) return null;
  const type = leafType(c, colId);
  if (type === "number") {
    const nums = D.rowNumbers(tmp, rowId, M);
    const v = nums[colId];
    if (Number.isFinite(v) && !numberAllowed(v, L)) return { title: "Value violates rule", text: "Enter a value that meets the conditions of the rule, or the value will revert to the last valid value.", rule: L.rule, limit: L };
  } else if (type === "list" && !listAllowed(value, L)) {
    return { title: "Value violates rule", text: "Enter a value that meets the conditions of the rule, or the value will revert to the last valid value.", rule: L.rule, limit: L };
  }
  return null;
}

/** Human description of a limit ("Minimum: 10 mm  Maximum: 50 mm  Increment: 5 mm"). */
export function limitText(L, kind = "length") {
  if (!L) return "";
  const u = kind === "angle" ? " deg" : kind === "none" ? "" : " mm";
  const parts = [];
  if (Number.isFinite(L.min)) parts.push(`Minimum: ${L.min}${u}`);
  if (Number.isFinite(L.max)) parts.push(`Maximum: ${L.max}${u}`);
  if (Number.isFinite(L.step)) parts.push(`Increment: ${L.step}${u}`);
  if (L.nums) parts.push(`Values: ${L.nums.join(", ")}${u}`);
  return parts.join("  ");
}

/** A new rule {id, name:'Rule N', active:true, body:[]}. */
export function newRule(c, rules) {
  const taken = new Set(rules.map((r) => r.name.toLowerCase()));
  let k = rules.length + 1;
  while (taken.has(`rule ${k}`)) k++;
  return { id: D.nextId(c, "u"), name: `Rule ${k}`, comment: "", active: true, body: [] };
}
