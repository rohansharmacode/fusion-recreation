// Expression evaluator for Fusion-style parameter expressions.
// Lengths resolve to mm, angles to degrees. Supports + - * / ^, parentheses,
// units (mm cm m in ft deg rad), functions and parameter references.

const LENGTH_UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4, inch: 25.4, ft: 304.8, um: 0.001 };
const ANGLE_UNITS = { deg: 1, rad: 180 / Math.PI };
const FUNCS = {
  sin: (x) => Math.sin((x * Math.PI) / 180),
  cos: (x) => Math.cos((x * Math.PI) / 180),
  tan: (x) => Math.tan((x * Math.PI) / 180),
  asin: (x) => (Math.asin(x) * 180) / Math.PI,
  acos: (x) => (Math.acos(x) * 180) / Math.PI,
  atan: (x) => (Math.atan(x) * 180) / Math.PI,
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
};
const CONSTS = { PI: Math.PI, pi: Math.PI, E: Math.E };

function tokenize(s) {
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      if (j < s.length && /[eE]/.test(s[j]) && /[-+0-9]/.test(s[j + 1] || "")) {
        j++;
        if (/[-+]/.test(s[j])) j++;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
      }
      const v = parseFloat(s.slice(i, j));
      if (Number.isNaN(v)) throw new Error("Invalid number");
      toks.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z_0-9]/.test(s[j])) j++;
      toks.push({ t: "id", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/^(),".includes(c)) { toks.push({ t: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}"`);
  }
  return toks;
}

/**
 * Evaluate an expression.
 * @param {string} src
 * @param {(name:string)=>({value:number,kind:string}|undefined)} lookup parameter resolver
 * @param {"length"|"angle"|"none"} kind default unit kind for bare numbers
 */
export function evaluate(src, lookup = () => undefined, kind = "length") {
  if (typeof src === "number") return src;
  const s = String(src ?? "").trim();
  if (!s) throw new Error("Empty expression");
  const toks = tokenize(s);
  let p = 0;
  const peek = () => toks[p];
  const eat = (t) => {
    if (!toks[p] || toks[p].t !== t) throw new Error(`Expected "${t}"`);
    return toks[p++];
  };
  // value carries {v, hasUnit}
  function unitFactor(name) {
    if (kind === "angle" && name in ANGLE_UNITS) return ANGLE_UNITS[name];
    if (kind !== "angle" && name in LENGTH_UNITS) return LENGTH_UNITS[name];
    if (name in ANGLE_UNITS) return ANGLE_UNITS[name];
    if (name in LENGTH_UNITS) return LENGTH_UNITS[name];
    return null;
  }
  function primary() {
    const tk = peek();
    if (!tk) throw new Error("Unexpected end of expression");
    if (tk.t === "num") {
      p++;
      let v = tk.v;
      const nx = peek();
      if (nx && nx.t === "id") {
        const f = unitFactor(nx.v);
        if (f != null) { p++; v *= f; }
      }
      return v;
    }
    if (tk.t === "(") {
      p++;
      let v = expr();
      eat(")");
      const nx = peek();
      if (nx && nx.t === "id") {
        const f = unitFactor(nx.v);
        if (f != null) { p++; v *= f; }
      }
      return v;
    }
    if (tk.t === "id") {
      p++;
      const name = tk.v;
      if (peek() && peek().t === "(") {
        const fn = FUNCS[name];
        if (!fn) throw new Error(`Unknown function "${name}"`);
        p++;
        const a = expr();
        eat(")");
        return fn(a);
      }
      if (name in CONSTS) return CONSTS[name];
      const param = lookup(name);
      if (param !== undefined) return param.value;
      const f = unitFactor(name);
      if (f != null) return f;
      throw new Error(`Unknown parameter "${name}"`);
    }
    throw new Error(`Unexpected "${tk.t}"`);
  }
  function unary() {
    const tk = peek();
    if (tk && tk.t === "-") { p++; return -unary(); }
    if (tk && tk.t === "+") { p++; return unary(); }
    return power();
  }
  function power() {
    const base = primary();
    if (peek() && peek().t === "^") {
      p++;
      return Math.pow(base, unary());
    }
    return base;
  }
  function term() {
    let v = unary();
    while (peek() && (peek().t === "*" || peek().t === "/")) {
      const op = toks[p++].t;
      const r = unary();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() && (peek().t === "+" || peek().t === "-")) {
      const op = toks[p++].t;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const v = expr();
  if (p < toks.length) throw new Error(`Unexpected "${toks[p].v ?? toks[p].t}"`);
  if (!Number.isFinite(v)) throw new Error("Result is not a finite number");
  return v;
}

export function identifiers(src) {
  try {
    return tokenize(String(src)).filter((t) => t.t === "id").map((t) => t.v);
  } catch {
    return [];
  }
}

export function formatValue(v, kind = "length", digits = 2) {
  if (!Number.isFinite(v)) return "-";
  const r = Math.abs(v) < 1e-9 ? 0 : v;
  return kind === "angle" ? `${r.toFixed(1)} deg` : kind === "none" ? `${+r.toFixed(3)}` : `${r.toFixed(digits)} mm`;
}

/** A small parameter table with lazy, cycle-safe evaluation. */
export class ParamTable {
  constructor() {
    this.entries = new Map(); // name -> {name, expr, kind, comment, user, owner}
    this.cache = new Map();
    this.stack = new Set();
  }
  set(name, expr, kind = "length", meta = {}) {
    this.entries.set(name, { name, expr: String(expr), kind, ...meta });
    this.cache.clear();
  }
  has(name) { return this.entries.has(name); }
  get(name) { return this.entries.get(name); }
  remove(name) { this.entries.delete(name); this.cache.clear(); }
  value(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const e = this.entries.get(name);
    if (!e) return undefined;
    if (this.stack.has(name)) throw new Error(`Circular reference in "${name}"`);
    this.stack.add(name);
    try {
      const v = evaluate(e.expr, (n) => this.lookup(n), e.kind);
      this.cache.set(name, v);
      return v;
    } finally {
      this.stack.delete(name);
    }
  }
  lookup(n) {
    if (!this.entries.has(n)) return undefined;
    return { value: this.value(n), kind: this.entries.get(n).kind };
  }
  eval(expr, kind = "length") {
    return evaluate(expr, (n) => this.lookup(n), kind);
  }
}
