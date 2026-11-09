// Configured-design data model (pure functions on the plain JSON document, no DOM).
//
// doc.configurations = {
//   version: 1, nid,                       // id counter for rows / columns / theme rows / rules
//   rows:    [{id, name, partNumber, description}]      rows[0] is the Default Configuration
//   active:  rowId                          // the configuration shown in the canvas / browser / timeline
//   columns: [col]                          // top-table columns (configured aspects)
//   cells:   {[rowId]: {[colId]: value}}    // param: expression string; suppress: bool (true = suppressed);
//                                           // visibility: bool (true = visible); theme: theme row id
//   themes:  {appearance?: theme, material?: theme}
//            theme = {rows:[{id, name}], columns:[{id, body}], cells:{[themeRowId]:{[colId]: appearanceId|materialId}}}
//   rules:   [rule]                         // Configuration Rules (see rules.js)
// }
// col = {id, kind:'param', user:true, name}            user parameter
//     | {id, kind:'param', owner:featureId, field}     feature parameter (FIELDS[type][field])
//     | {id, kind:'param', owner:sketchId, cid}        sketch dimension
//     | {id, kind:'suppress', feature}                 feature suppression
//     | {id, kind:'visibility', body} | {id, kind:'visibility', feature}
//     | {id, kind:'theme', table:'appearance'|'material'}
//   + optional `title` (Rename Column) and `param` (parameter name when the column was made).
//
// The document's live values (feature expressions, f.suppressed, body visibility / appearance / material)
// always show the ACTIVE configuration: activating writes a row into the document (applyRow), and edits
// made elsewhere in the app are written back into the active row (capture).

export const THEME_TABLES = ["appearance", "material"];
export const THEME_TITLE = { appearance: "Appearance", material: "Physical Material" };
export const THEME_HEADER = { appearance: "Appearance Theme", material: "Physical Material Theme" };
export const THEME_NAMES = { appearance: "Appearance Theme Names", material: "Physical Material Theme Names" };

// Friendly aspect names for feature fields (the Configure dialog / column tooltips).
export const FIELD_LABEL = {
  extrude: { distance: "Distance", distance2: "Distance (Side 2)", taper: "Taper Angle", taper2: "Taper Angle (Side 2)", startOffset: "Start Offset" },
  revolve: { angle: "Angle", angle2: "Angle (Side 2)" },
  fillet: { radius: "Radius" },
  chamfer: { distance: "Distance" },
  shell: { thickness: "Inside Thickness" },
  hole: { diameter: "Diameter", depth: "Depth", tipAngle: "Drill Point Angle", cbD: "Counterbore Diameter", cbDepth: "Counterbore Depth", csD: "Countersink Diameter", csAngle: "Countersink Angle" },
  box: { length: "Length", width: "Width", height: "Height" },
  cylinder: { diameter: "Diameter", height: "Height" },
  sphere: { diameter: "Diameter" },
  torus: { d1: "Inner Diameter", d2: "Torus Diameter" },
  cplane: { offset: "Distance", angle: "Angle" },
  rpattern: { q1: "Quantity", d1: "Distance", q2: "Quantity (Direction 2)", d2: "Distance (Direction 2)" },
  cpattern: { count: "Quantity", angle: "Total Angle" },
  move: { tx: "X Distance", ty: "Y Distance", tz: "Z Distance", rx: "X Angle", ry: "Y Angle", rz: "Z Angle" },
  draft: { angle: "Angle" },
  coil: { diameter: "Diameter", revolutions: "Revolutions", height: "Height", pitch: "Pitch", angle: "Angle", sectionSize: "Section Size" },
  pipe: { distance: "Distance", sectionSize: "Section Size", thickness: "Section Thickness" },
  scale: { factor: "Scale Factor", sx: "X Scale", sy: "Y Scale", sz: "Z Scale" },
  thread: { length: "Length", offset: "Offset" },
};
const DIM_LABEL = { distance: "Linear Dimension", pointLine: "Linear Dimension", diameter: "Diameter Dimension", radius: "Radial Dimension", angle: "Angular Dimension" };

export const clone = (o) => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const cmpName = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });

// ----------------------------------------------------------------------------------- table access
/** The configuration data of a configured design, or null for a standard design. */
export function get(doc) {
  const c = doc && doc.configurations;
  return c && Array.isArray(c.rows) && c.rows.length ? c : null;
}
export const isConfigured = (doc) => !!get(doc);

/** Turn the design into a configured design (one Default Configuration row holding the current values). */
export function ensure(doc) {
  const have = get(doc);
  if (have) return normalize(have);
  const c = { version: 1, nid: 1, rows: [], active: null, columns: [], cells: {}, themes: {}, rules: [] };
  const r = { id: nextId(c, "r"), name: "Configuration 1", partNumber: "", description: "" };
  c.rows.push(r);
  c.cells[r.id] = {};
  c.active = r.id;
  doc.configurations = c;
  return c;
}
/** Fill in missing members (documents written by older builds / hand-edited JSON). */
export function normalize(c) {
  c.version = c.version || 1;
  c.columns = Array.isArray(c.columns) ? c.columns : [];
  c.cells = c.cells && typeof c.cells === "object" ? c.cells : {};
  c.themes = c.themes && typeof c.themes === "object" ? c.themes : {};
  c.rules = Array.isArray(c.rules) ? c.rules : [];
  let max = 0;
  const scan = (id) => { const m = /(\d+)$/.exec(String(id || "")); if (m) max = Math.max(max, +m[1]); };
  for (const r of c.rows) { scan(r.id); c.cells[r.id] = c.cells[r.id] || {}; }
  for (const col of c.columns) scan(col.id);
  for (const t of Object.values(c.themes)) { for (const r of t.rows || []) scan(r.id); for (const col of t.columns || []) scan(col.id); }
  for (const r of c.rules) scan(r.id);
  c.nid = Math.max(Number(c.nid) || 1, max + 1);
  if (!c.rows.some((r) => r.id === c.active)) c.active = c.rows[0] && c.rows[0].id;
  return c;
}
export function nextId(c, prefix) { c.nid = (Number(c.nid) || 1); return `${prefix}${c.nid++}`; }
export const row = (c, id) => (c ? c.rows.find((r) => r.id === id) || null : null);
export const column = (c, id) => (c ? c.columns.find((x) => x.id === id) || null : null);
export const activeRow = (c) => (c ? row(c, c.active) || c.rows[0] : null);

/** "Small" -> "Small (1)" when the name exists (Fusion's API naming rule). */
export function uniqueName(names, base) {
  const taken = new Set(names.map((n) => String(n).toLowerCase()));
  if (!taken.has(String(base).toLowerCase())) return base;
  for (let i = 1; ; i++) { const n = `${base} (${i})`; if (!taken.has(n.toLowerCase())) return n; }
}
/** Default naming scheme for new configurations: "Configuration N" (first free N). */
export function defaultRowName(c) {
  const taken = new Set(c.rows.map((r) => r.name.toLowerCase()));
  for (let i = c.rows.length + 1; ; i++) if (!taken.has(`configuration ${i}`)) return `Configuration ${i}`;
}

// ----------------------------------------------------------------------------------- column targets
/** Stable identity of an aspect (one column per aspect). */
export function colKey(col) {
  if (!col) return "";
  switch (col.kind) {
    case "param": return col.user ? `param:user:${col.name}` : col.cid ? `param:${col.owner}:c:${col.cid}` : `param:${col.owner}:${col.field}`;
    case "suppress": return `suppress:${col.feature}`;
    case "visibility": return col.body ? `visibility:body:${col.body}` : `visibility:feature:${col.feature}`;
    case "theme": return `theme:${col.table}`;
    default: return `${col.kind}:${col.id}`;
  }
}

/** Resolve a parameter column: {name, kind, expr, set(doc, expr)} or null when it no longer exists. */
export function paramTarget(doc, col, M) {
  if (!col || col.kind !== "param") return null;
  if (col.user) {
    const i = doc.params.findIndex((p) => p.name === col.name);
    if (i < 0) return null;
    const up = doc.params[i];
    return { name: up.name, kind: up.kind || "length", expr: String(up.expr), user: true, owner: null,
      set: (d, e) => { const x = d.params.find((p) => p.name === col.name); if (x) x.expr = e; } };
  }
  const f = doc.features.find((x) => x.id === col.owner);
  if (!f) return null;
  if (col.cid) {
    const c = f.sk && Array.isArray(f.sk.constraints) ? f.sk.constraints.find((k) => k.id === col.cid) : null;
    if (!c || !c.param || c.expr === undefined) return null;
    return { name: c.param, kind: c.type === "angle" ? "angle" : "length", expr: String(c.expr), owner: f, label: DIM_LABEL[c.type] || "Dimension",
      set: (d, e) => { const g = d.features.find((x) => x.id === col.owner); const k = g && g.sk && g.sk.constraints.find((q) => q.id === col.cid); if (k) k.expr = e; } };
  }
  if (f[col.field] === undefined || f[col.field] === null || f[col.field] === "") return null;
  const kind = ((M && M.FIELDS && M.FIELDS[f.type]) || {})[col.field] || "length";
  return { name: (f.p && f.p[col.field]) || col.param || col.field, kind, expr: String(f[col.field]), owner: f,
    label: (FIELD_LABEL[f.type] || {})[col.field] || col.field,
    set: (d, e) => { const g = d.features.find((x) => x.id === col.owner); if (g) g[col.field] = e; } };
}

/** Does the column's aspect still exist in the document? */
export function exists(doc, col, M) {
  switch (col.kind) {
    case "param": return !!paramTarget(doc, col, M);
    case "suppress": return doc.features.some((f) => f.id === col.feature);
    case "visibility": return col.body ? !!doc.bodies[col.body] : doc.features.some((f) => f.id === col.feature);
    case "theme": return !!(doc.configurations && doc.configurations.themes && doc.configurations.themes[col.table]);
    default: return false;
  }
}

/** Header info: {group, title, tip, kind} where kind is 'expr' | 'suppress' | 'visibility' | 'theme'. */
export function describe(doc, col, M) {
  const f = (id) => doc.features.find((x) => x.id === id);
  const missing = !exists(doc, col, M);
  let group = "", title = "", tip = "", kind = col.kind === "param" ? "expr" : col.kind;
  if (col.kind === "param") {
    const t = paramTarget(doc, col, M);
    group = col.user ? "User Parameters" : (f(col.owner) && f(col.owner).name) || "";
    title = (t && t.name) || col.param || col.name || "?";
    tip = col.user
      ? "Specify the value for each configuration.\n\nRight-click to rename the column and the parameter or move the column to a Custom Theme Table."
      : "Specify the value for each configuration.\n\nRight-click to rename the column and the parameter or move the column to a Custom Theme Table.";
    if (t && t.label && !col.user) tip = `${t.label}\n\n${tip}`;
  } else if (col.kind === "suppress") {
    group = (f(col.feature) && f(col.feature).name) || "";
    title = "Suppression";
    tip = "Suppress or unsuppress this feature and any downstream features that depend on it for each configuration.\n\nRight-click to rename the column and the object or move the column to a Custom Theme Table.";
  } else if (col.kind === "visibility") {
    group = col.body ? ((doc.bodies[col.body] && doc.bodies[col.body].name) || "") : ((f(col.feature) && f(col.feature).name) || "");
    title = "Visibility";
    tip = "Show or hide the object and its children for each configuration.\n\nRight-click to rename the column and the object or move the column to a Custom Theme Table.";
  } else if (col.kind === "theme") {
    group = THEME_HEADER[col.table] || "Theme";
    title = THEME_TITLE[col.table] || "Theme";
    tip = "Select a Theme for each configuration.";
  }
  if (col.title) title = col.title;
  if (missing) { title = `${title} (aspect no longer exists)`; }
  return { group, title, tip, kind, missing };
}

// ----------------------------------------------------------------------------------- read / write the document
/** Current document value of an aspect (what the active configuration should hold). */
export function readDoc(doc, col, M) {
  switch (col.kind) {
    case "param": { const t = paramTarget(doc, col, M); return t ? t.expr : undefined; }
    case "suppress": { const f = doc.features.find((x) => x.id === col.feature); return f ? !!f.suppressed : undefined; }
    case "visibility": {
      if (col.body) { const m = doc.bodies[col.body]; return m ? m.visible !== false : undefined; }
      const f = doc.features.find((x) => x.id === col.feature); return f ? f.visible !== false : undefined;
    }
    default: return undefined;
  }
}
/** Write one aspect value into the document. */
export function writeDoc(doc, col, v, M) {
  if (v === undefined || v === null) return;
  switch (col.kind) {
    case "param": { const t = paramTarget(doc, col, M); if (t) t.set(doc, String(v)); break; }
    case "suppress": { const f = doc.features.find((x) => x.id === col.feature); if (f) { if (v) f.suppressed = true; else delete f.suppressed; } break; }
    case "visibility": {
      if (col.body) { const m = doc.bodies[col.body]; if (m) m.visible = !!v; }
      else { const f = doc.features.find((x) => x.id === col.feature); if (f) f.visible = !!v; }
      break;
    }
    default: break;
  }
}

/** Theme-table value for a body (appearance id / material id) read from the document. */
export function readTheme(doc, table, bodyId) {
  const m = doc.bodies[bodyId];
  if (!m) return undefined;
  return table === "appearance" ? (m.appearance || "steel-satin") : (m.material || "steel");
}
/** opts.materialAppearance(materialId) -> appearance id (Fusion: a body takes its material's appearance unless overridden). */
export function writeTheme(doc, table, bodyId, v, opts = {}) {
  const m = doc.bodies[bodyId];
  if (!m || !v) return;
  if (table === "appearance") { m.appearance = v; m.appearanceOverride = true; return; }
  m.material = v;
  const c = get(doc);
  const apConfigured = !!(c && c.themes.appearance && c.themes.appearance.columns.some((x) => x.body === bodyId));
  if (!m.appearanceOverride && !apConfigured && opts.materialAppearance) {
    const ap = opts.materialAppearance(v);
    if (ap) m.appearance = ap;
  }
}

/** Write configuration `rowId` into the document (its parameters, suppression, visibility and themes). */
export function applyRow(doc, rowId, M, opts = {}) {
  const c = get(doc);
  if (!c) return;
  const cells = c.cells[rowId] || {};
  // parameters first (expressions may reference each other), then states, then theme tables
  for (const col of c.columns) if (col.kind === "param" && cells[col.id] !== undefined) writeDoc(doc, col, cells[col.id], M);
  for (const col of c.columns) if ((col.kind === "suppress" || col.kind === "visibility") && cells[col.id] !== undefined) writeDoc(doc, col, cells[col.id], M);
  for (const col of c.columns) {
    if (col.kind !== "theme") continue;
    const th = c.themes[col.table];
    if (!th) continue;
    const tr = cells[col.id] || (th.rows[0] && th.rows[0].id);
    const tcells = th.cells[tr] || {};
    for (const tc of th.columns) if (tcells[tc.id] !== undefined) writeTheme(doc, col.table, tc.body, tcells[tc.id], opts);
  }
}

/** Activate configuration `rowId`: it becomes the active row and is written into the document. */
export function activate(doc, rowId, M, opts = {}) {
  const c = get(doc);
  if (!c || !row(c, rowId)) return false;
  c.active = rowId;
  applyRow(doc, rowId, M, opts);
  return true;
}

/**
 * Write the document's current values of every configured aspect into the active row (and the
 * active theme rows): edits of configured aspects made anywhere in the app affect only the active
 * configuration. Returns true when something changed.
 */
export function capture(doc, M) {
  const c = get(doc);
  if (!c) return false;
  const r = activeRow(c);
  if (!r) return false;
  const cells = (c.cells[r.id] = c.cells[r.id] || {});
  let changed = false;
  for (const col of c.columns) {
    if (col.kind === "theme") {
      const th = c.themes[col.table];
      if (!th) continue;
      if (!cells[col.id] || !th.rows.some((x) => x.id === cells[col.id])) { cells[col.id] = th.rows[0] && th.rows[0].id; changed = true; }
      const tcells = (th.cells[cells[col.id]] = th.cells[cells[col.id]] || {});
      for (const tc of th.columns) {
        const v = readTheme(doc, col.table, tc.body);
        if (v !== undefined && tcells[tc.id] !== v) { tcells[tc.id] = v; changed = true; }
      }
      continue;
    }
    const v = readDoc(doc, col, M);
    if (v !== undefined && cells[col.id] !== v) { cells[col.id] = v; changed = true; }
  }
  return changed;
}

/**
 * A user parameter renamed in the Parameters dialog: follow it (the column for the old name gets the
 * new one when exactly one user parameter appeared and the old one disappeared).
 */
export function followRenames(doc, prevNames) {
  const c = get(doc);
  if (!c || !prevNames) return false;
  const now = doc.params.map((p) => p.name);
  const gone = prevNames.filter((n) => !now.includes(n));
  const added = now.filter((n) => !prevNames.includes(n));
  if (gone.length !== 1 || added.length !== 1) return false;
  let changed = false;
  for (const col of c.columns) if (col.kind === "param" && col.user && col.name === gone[0]) { col.name = added[0]; changed = true; }
  return changed;
}

// ----------------------------------------------------------------------------------- configurable aspects
/**
 * Aspects of a timeline feature or browser object that can be configured.
 * target: {kind:'feature', id} | {kind:'body', id}
 * Returns [{key, label, sub, tip, col}] where col is the column template.
 */
export function aspectsFor(doc, target, M) {
  const out = [];
  if (!target) return out;
  if (target.kind === "body") {
    const m = doc.bodies[target.id];
    if (!m) return out;
    out.push({ label: "Visibility", tip: "Check to configure Visibility for this\nobject.", col: { kind: "visibility", body: target.id } });
    out.push({ label: "Appearance", tip: "Check to configure the Appearance of\nthis object.", col: { kind: "theme", table: "appearance", body: target.id } });
    out.push({ label: "Physical Material", tip: "Check to configure the Physical Material\nfor this object.", col: { kind: "theme", table: "material", body: target.id } });
  } else {
    const f = doc.features.find((x) => x.id === target.id);
    if (!f) return out;
    const P = safeParams(doc, M);
    const val = (name) => { try { const v = P && P.value(name); return Number.isFinite(v) ? v : undefined; } catch { return undefined; } };
    const defs = (M && M.FIELDS && M.FIELDS[f.type]) || {};
    if (f.type === "sketch" && f.sk && Array.isArray(f.sk.constraints)) {
      for (const c of f.sk.constraints) {
        if (!c.param || c.expr === undefined) continue;
        out.push({ label: c.param, sub: DIM_LABEL[c.type] || "Dimension", param: c.param, expr: String(c.expr), value: val(c.param), kind: c.type === "angle" ? "angle" : "length",
          col: { kind: "param", owner: f.id, cid: c.id, param: c.param } });
      }
    } else if (f.p) {
      for (const key of Object.keys(defs)) {
        const name = f.p[key];
        if (!name || f[key] === undefined || f[key] === null || f[key] === "") continue;
        out.push({ label: (FIELD_LABEL[f.type] || {})[key] || key, sub: name, param: name, expr: String(f[key]), value: val(name), kind: defs[key],
          col: { kind: "param", owner: f.id, field: key, param: name } });
      }
    }
    out.push({ label: "Suppression", tip: "Check to configure Suppression for this\nobject.", col: { kind: "suppress", feature: f.id } });
    if (f.type === "sketch" || f.type === "cplane") out.push({ label: "Visibility", tip: "Check to configure Visibility for this\nobject.", col: { kind: "visibility", feature: f.id } });
  }
  for (const a of out) {
    a.key = a.col.kind === "theme" ? `theme:${a.col.table}:${a.col.body}` : colKey(a.col);
    if (a.param && !a.tip) {
      const v = a.value;
      const unit = a.kind === "angle" ? " deg" : a.kind === "none" ? "" : " mm";
      a.tip = `Check to configure ${a.sub && a.sub !== a.param ? a.sub : a.label}.\n\nParameter: ${a.param}\nExpression: ${a.expr}${v !== undefined ? `\nValue: ${v.toFixed(a.kind === "angle" ? 1 : 2)}${unit}` : ""}`;
    }
  }
  return out;
}
function safeParams(doc, M) { try { return M && M.buildParams ? M.buildParams(doc) : null; } catch { return null; } }

/** Is this aspect currently configured (a column exists)? */
export function isAspectConfigured(doc, a) {
  const c = get(doc);
  if (!c || !a) return false;
  if (a.col.kind === "theme") { const th = c.themes[a.col.table]; return !!(th && th.columns.some((x) => x.body === a.col.body)); }
  const k = colKey(a.col);
  return c.columns.some((x) => colKey(x) === k);
}

/** Every configured aspect key of a feature / body (used to badge configured objects). */
export function configuredTargets(doc) {
  const c = get(doc);
  const out = { features: new Set(), bodies: new Set() };
  if (!c) return out;
  for (const col of c.columns) {
    if (col.kind === "param" && !col.user) out.features.add(col.owner);
    else if (col.kind === "suppress") out.features.add(col.feature);
    else if (col.kind === "visibility") { if (col.body) out.bodies.add(col.body); else out.features.add(col.feature); }
  }
  for (const t of THEME_TABLES) { const th = c.themes[t]; if (th) for (const x of th.columns) out.bodies.add(x.body); }
  return out;
}

// ----------------------------------------------------------------------------------- edit operations (call inside app.mutate)
/** Add a configured aspect (column). Every configuration gets the document's current value. Returns the column. */
export function addAspect(doc, tmpl, M) {
  const c = ensure(doc);
  if (tmpl.kind === "theme") return addThemeColumn(doc, tmpl.table, tmpl.body);
  const k = colKey(tmpl);
  const have = c.columns.find((x) => colKey(x) === k);
  if (have) return have;
  const col = { ...clone(tmpl), id: nextId(c, "c") };
  const v = readDoc(doc, col, M);
  c.columns.push(col);
  for (const r of c.rows) { c.cells[r.id] = c.cells[r.id] || {}; c.cells[r.id][col.id] = clone(v); }
  return col;
}

/** Ensure a theme table (Appearance / Physical Material) and its top-table column exist. */
export function ensureTheme(doc, table) {
  const c = ensure(doc);
  let th = c.themes[table];
  if (!th) {
    th = c.themes[table] = { rows: [], columns: [], cells: {} };
    const tr = { id: nextId(c, "t"), name: "Theme 1" };
    th.rows.push(tr);
    th.cells[tr.id] = {};
  }
  let top = c.columns.find((x) => x.kind === "theme" && x.table === table);
  if (!top) {
    top = { id: nextId(c, "c"), kind: "theme", table };
    c.columns.push(top);
    for (const r of c.rows) { c.cells[r.id] = c.cells[r.id] || {}; c.cells[r.id][top.id] = th.rows[0].id; }
  }
  return { th, top };
}
export function addThemeColumn(doc, table, bodyId) {
  const { th, top } = ensureTheme(doc, table);
  const c = get(doc);
  let tc = th.columns.find((x) => x.body === bodyId);
  if (!tc) {
    tc = { id: nextId(c, "c"), body: bodyId };
    th.columns.push(tc);
    const v = readTheme(doc, table, bodyId);
    for (const r of th.rows) { th.cells[r.id] = th.cells[r.id] || {}; th.cells[r.id][tc.id] = v; }
  }
  return top;
}

/** Remove an aspect by template (Configure dialog unchecked it). */
export function removeAspect(doc, tmpl) {
  const c = get(doc);
  if (!c) return;
  if (tmpl.kind === "theme") {
    const th = c.themes[tmpl.table];
    if (!th) return;
    const tc = th.columns.find((x) => x.body === tmpl.body);
    if (!tc) return;
    th.columns = th.columns.filter((x) => x !== tc);
    for (const r of Object.values(th.cells)) delete r[tc.id];
    if (!th.columns.length) deleteThemeTable(doc, tmpl.table);
    return;
  }
  const k = colKey(tmpl);
  const col = c.columns.find((x) => colKey(x) === k);
  if (col) deleteColumn(doc, col.id);
}
export function deleteColumn(doc, colId) {
  const c = get(doc);
  if (!c) return;
  const col = column(c, colId);
  if (!col) return;
  if (col.kind === "theme") { deleteThemeTable(doc, col.table); return; }
  c.columns = c.columns.filter((x) => x.id !== colId);
  for (const r of Object.values(c.cells)) delete r[colId];
  dropRuleRefs(c, colId);
}
export function deleteThemeTable(doc, table) {
  const c = get(doc);
  if (!c) return;
  const top = c.columns.find((x) => x.kind === "theme" && x.table === table);
  delete c.themes[table];
  if (top) {
    c.columns = c.columns.filter((x) => x !== top);
    for (const r of Object.values(c.cells)) delete r[top.id];
    dropRuleRefs(c, top.id);
  }
}
/** Blocks that reference a deleted column become incomplete placeholders (like Fusion's degraded blocks). */
function dropRuleRefs(c, colId) {
  const walk = (x) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if ((x.t === "get" || x.t === "set") && x.col === colId) { x.col = null; x.value = null; }
    for (const v of Object.values(x)) if (v && typeof v === "object") walk(v);
  };
  walk(c.rules);
}

/** Add `n` configurations copied from the active one ("New Configurations are duplicated from the active Configuration"). */
export function addRows(doc, n = 1) {
  const c = ensure(doc);
  const src = activeRow(c);
  const made = [];
  for (let i = 0; i < Math.max(1, Math.min(100, n | 0)); i++) {
    const r = { id: nextId(c, "r"), name: defaultRowName(c), partNumber: "", description: "" };
    c.rows.push(r);
    c.cells[r.id] = clone(c.cells[src.id] || {});
    made.push(r);
  }
  return made;
}
/** Duplicate rows (copies are added to the bottom of the list). */
export function duplicateRows(doc, ids) {
  const c = get(doc);
  if (!c) return [];
  const made = [];
  for (const id of ids) {
    const s = row(c, id);
    if (!s) continue;
    const r = { id: nextId(c, "r"), name: uniqueName(c.rows.map((x) => x.name), s.name), partNumber: s.partNumber || "", description: s.description || "" };
    c.rows.push(r);
    c.cells[r.id] = clone(c.cells[s.id] || {});
    made.push(r);
  }
  return made;
}
/** Delete configurations (never the Default Configuration). Returns the ids deleted. */
export function deleteRows(doc, ids) {
  const c = get(doc);
  if (!c) return [];
  const del = ids.filter((id) => c.rows.length && id !== c.rows[0].id && row(c, id));
  c.rows = c.rows.filter((r) => !del.includes(r.id));
  for (const id of del) delete c.cells[id];
  if (del.includes(c.active)) c.active = c.rows[0].id;
  return del;
}
export function renameRow(doc, id, name) {
  const c = get(doc);
  const r = row(c, id);
  name = String(name || "").trim();
  if (!r || !name) return false;
  r.name = uniqueName(c.rows.filter((x) => x !== r).map((x) => x.name), name);
  return true;
}
/** Sort rows A->Z / Z->A; the first row (Default Configuration) is never moved. */
export function sortRows(doc, dir = 1) {
  const c = get(doc);
  if (!c || c.rows.length < 3) return;
  const [first, ...rest] = c.rows;
  rest.sort((a, b) => dir * cmpName(a.name, b.name));
  c.rows = [first, ...rest];
}
/** Sort columns: 'az' | 'za' | 'design' (timeline order; user parameters first, theme columns last). */
export function sortColumns(doc, how, M) {
  const c = get(doc);
  if (!c) return;
  const title = (col) => describe(doc, col, M).title;
  if (how === "design") {
    const order = (col) => {
      if (col.kind === "param" && col.user) return -1000 + doc.params.findIndex((p) => p.name === col.name);
      if (col.kind === "theme") return 1e6 + (col.table === "appearance" ? 0 : 1);
      if (col.kind === "visibility" && col.body) return 5e5 + Object.keys(doc.bodies).indexOf(col.body);
      const fid = col.owner || col.feature;
      return doc.features.findIndex((f) => f.id === fid) * 10 + (col.kind === "param" ? 0 : col.kind === "suppress" ? 5 : 6);
    };
    c.columns.sort((a, b) => order(a) - order(b));
  } else {
    const d = how === "za" ? -1 : 1;
    c.columns.sort((a, b) => d * cmpName(title(a), title(b)));
  }
}
/** Move a column to a new index (drag in the header). */
export function moveColumn(doc, colId, to) {
  const c = get(doc);
  if (!c) return;
  const i = c.columns.findIndex((x) => x.id === colId);
  if (i < 0) return;
  const [col] = c.columns.splice(i, 1);
  c.columns.splice(Math.max(0, Math.min(c.columns.length, to)), 0, col);
}
/** Move a configuration row (the Default Configuration stays first). */
export function moveRow(doc, rowId, to) {
  const c = get(doc);
  if (!c) return;
  const i = c.rows.findIndex((x) => x.id === rowId);
  if (i <= 0) return;
  const [r] = c.rows.splice(i, 1);
  c.rows.splice(Math.max(1, Math.min(c.rows.length, to)), 0, r);
}

// ----------------------------------------------------------------------------------- theme rows
export function addThemeRows(doc, table, n = 1, srcId = null) {
  const c = get(doc);
  const th = c && c.themes[table];
  if (!th) return [];
  const src = th.rows.find((r) => r.id === srcId) || th.rows[th.rows.length - 1];
  const made = [];
  for (let i = 0; i < Math.max(1, Math.min(100, n | 0)); i++) {
    const taken = new Set(th.rows.map((r) => r.name.toLowerCase()));
    let k = th.rows.length + 1;
    while (taken.has(`theme ${k}`)) k++;
    const r = { id: nextId(c, "t"), name: `Theme ${k}` };
    th.rows.push(r);
    th.cells[r.id] = clone(th.cells[src.id] || {});
    made.push(r);
  }
  return made;
}
export function duplicateThemeRow(doc, table, id) {
  const c = get(doc);
  const th = c && c.themes[table];
  const s = th && th.rows.find((r) => r.id === id);
  if (!s) return null;
  const r = { id: nextId(c, "t"), name: uniqueName(th.rows.map((x) => x.name), s.name) };
  th.rows.push(r);
  th.cells[r.id] = clone(th.cells[s.id] || {});
  return r;
}
export function deleteThemeRow(doc, table, id) {
  const c = get(doc);
  const th = c && c.themes[table];
  if (!th || th.rows.length < 2 || th.rows[0].id === id) return false;
  th.rows = th.rows.filter((r) => r.id !== id);
  delete th.cells[id];
  const top = c.columns.find((x) => x.kind === "theme" && x.table === table);
  if (top) for (const r of c.rows) if (c.cells[r.id] && c.cells[r.id][top.id] === id) c.cells[r.id][top.id] = th.rows[0].id;
  return true;
}
export function renameThemeRow(doc, table, id, name) {
  const c = get(doc);
  const th = c && c.themes[table];
  const r = th && th.rows.find((x) => x.id === id);
  name = String(name || "").trim();
  if (!r || !name) return false;
  r.name = uniqueName(th.rows.filter((x) => x !== r).map((x) => x.name), name);
  return true;
}

// ----------------------------------------------------------------------------------- values
/** Evaluate every parameter column of a row (numbers in mm / deg). Applies the row to a light copy of the doc. */
export function rowNumbers(doc, rowId, M) {
  const c = get(doc);
  const out = {};
  if (!c || !M || !M.buildParams) return out;
  const tmp = { ...doc, params: clone(doc.params), features: clone(doc.features), bodies: clone(doc.bodies), configurations: c };
  applyRow(tmp, rowId, M);
  let P;
  try { P = M.buildParams(tmp); } catch { return out; }
  for (const col of c.columns) {
    if (col.kind !== "param") continue;
    const t = paramTarget(tmp, col, M);
    if (!t) continue;
    try { const v = P.value(t.name); if (Number.isFinite(v)) out[col.id] = v; } catch { /* invalid */ }
  }
  return out;
}
/** Expression string for a number in a column's unit kind ("12.5 mm", "30 deg", "4"). */
export function numExpr(v, kind) {
  const r = Math.round(v * 1e6) / 1e6;
  return kind === "angle" ? `${r} deg` : kind === "none" ? `${r}` : `${r} mm`;
}
/** Unit kind of a parameter column ('length' | 'angle' | 'none'). */
export function colUnitKind(doc, col, M) { const t = paramTarget(doc, col, M); return t ? t.kind : "length"; }
