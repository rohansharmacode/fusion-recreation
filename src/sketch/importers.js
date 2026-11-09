// SVG and DXF readers for Insert SVG / Insert DXF (no DOM needed, so they also run in Node tests).
// Both return {items, layers, units?, bbox} with items in millimetres, y up:
//   {kind:'line', a, b} {kind:'bez', a, c1, c2, b} (cubic) {kind:'qbez', a, c, b}
//   {kind:'arc', c, r, a0, a1} (counter-clockwise from a0 to a1, radians) {kind:'circle', c, r}
//   {kind:'ellipse', c, ax:[x,y] (first axis end, relative), ratio, t0?, t1?} {kind:'point', a}
//   {kind:'bspline', degree, cps, knots} {kind:'fit', pts, closed} {kind:'text', a, h, text, rot}
// every item has .layer.

const TAU = Math.PI * 2;
const PX_MM = 25.4 / 96;

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------
const mat = (a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) => [a, b, c, d, e, f];
const mmul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

function parseTransform(s) {
  let m = mat();
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let k;
  while ((k = re.exec(s))) {
    const v = k[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let t = mat();
    if (k[1] === "matrix" && v.length >= 6) t = mat(...v.slice(0, 6));
    else if (k[1] === "translate") t = mat(1, 0, 0, 1, v[0] || 0, v[1] || 0);
    else if (k[1] === "scale") t = mat(v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0);
    else if (k[1] === "rotate") {
      const a = ((v[0] || 0) * Math.PI) / 180, c = Math.cos(a), s2 = Math.sin(a);
      t = mat(c, s2, -s2, c, 0, 0);
      if (v.length >= 3) t = mmul(mmul(mat(1, 0, 0, 1, v[1], v[2]), t), mat(1, 0, 0, 1, -v[1], -v[2]));
    } else if (k[1] === "skewX") t = mat(1, 0, Math.tan(((v[0] || 0) * Math.PI) / 180), 1, 0, 0);
    else if (k[1] === "skewY") t = mat(1, Math.tan(((v[0] || 0) * Math.PI) / 180), 0, 1, 0, 0);
    m = mmul(m, t);
  }
  return m;
}

/** Minimal XML element walk: [{name, attrs, children}]. */
function parseXml(src) {
  const root = { name: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<\/?([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[4] !== undefined) { const top = stack[stack.length - 1]; top.text = (top.text || "") + m[4]; continue; }
    if (!m[1]) continue;
    const isClose = m[0].startsWith("</");
    if (isClose) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    const ar = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = ar.exec(m[2] || ""))) attrs[a[1]] = a[3] !== undefined ? a[3] : a[4];
    const el = { name: m[1].replace(/^.*:/, ""), attrs, children: [] };
    stack[stack.length - 1].children.push(el);
    if (!m[3]) stack.push(el);
  }
  return root;
}

const num = (s, def = 0) => { const v = parseFloat(s); return Number.isFinite(v) ? v : def; };
/** Length attribute -> user units (px). */
function lengthPx(s) {
  if (s === undefined || s === null) return null;
  const m = /^\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px|q)?\s*$/i.exec(String(s));
  if (!m) return null;
  const v = parseFloat(m[1]);
  const u = (m[2] || "px").toLowerCase();
  return v * ({ px: 1, mm: 96 / 25.4, cm: 960 / 25.4, in: 96, pt: 96 / 72, pc: 16, q: 96 / 101.6 }[u] || 1);
}

/** Path data -> segments in user units. */
function parsePath(d) {
  const toks = String(d).match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
  const segs = [];
  let i = 0, cmd = null, cur = [0, 0], start = [0, 0], lastC = null, lastQ = null;
  const n = () => parseFloat(toks[i++]);
  const isNum = () => i < toks.length && !/^[A-Za-z]$/.test(toks[i]);
  while (i < toks.length) {
    if (/^[A-Za-z]$/.test(toks[i])) cmd = toks[i++];
    if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const P = (x, y) => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    if (C === "Z") { if (Math.hypot(cur[0] - start[0], cur[1] - start[1]) > 1e-12) segs.push({ kind: "line", a: cur, b: start }); cur = start; lastC = lastQ = null; cmd = null; continue; }
    if (!isNum()) { cmd = null; continue; }
    if (C === "M") { cur = P(n(), n()); start = cur; cmd = rel ? "l" : "L"; lastC = lastQ = null; continue; }
    if (C === "L") { const b = P(n(), n()); segs.push({ kind: "line", a: cur, b }); cur = b; lastC = lastQ = null; continue; }
    if (C === "H") { const x = n(); const b = rel ? [cur[0] + x, cur[1]] : [x, cur[1]]; segs.push({ kind: "line", a: cur, b }); cur = b; lastC = lastQ = null; continue; }
    if (C === "V") { const y = n(); const b = rel ? [cur[0], cur[1] + y] : [cur[0], y]; segs.push({ kind: "line", a: cur, b }); cur = b; lastC = lastQ = null; continue; }
    if (C === "C") { const c1 = P(n(), n()), c2 = P(n(), n()), b = P(n(), n()); segs.push({ kind: "bez", a: cur, c1, c2, b }); lastC = c2; lastQ = null; cur = b; continue; }
    if (C === "S") { const c1 = lastC ? [2 * cur[0] - lastC[0], 2 * cur[1] - lastC[1]] : cur; const c2 = P(n(), n()), b = P(n(), n()); segs.push({ kind: "bez", a: cur, c1, c2, b }); lastC = c2; lastQ = null; cur = b; continue; }
    if (C === "Q") { const c = P(n(), n()), b = P(n(), n()); segs.push({ kind: "qbez", a: cur, c, b }); lastQ = c; lastC = null; cur = b; continue; }
    if (C === "T") { const c = lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur; const b = P(n(), n()); segs.push({ kind: "qbez", a: cur, c, b }); lastQ = c; lastC = null; cur = b; continue; }
    if (C === "A") {
      const rx = Math.abs(n()), ry = Math.abs(n()), rot = n(), large = n(), sweep = n();
      const b = P(n(), n());
      segs.push(...arcToSegs(cur, b, rx, ry, rot, !!large, !!sweep));
      cur = b; lastC = lastQ = null; continue;
    }
    i++;
  }
  return segs;
}

/** SVG elliptical arc -> {kind:'earcsvg'} as cubic Beziers (exact enough) or a circular arc marker. */
function arcToSegs(p1, p2, rx, ry, phiDeg, large, sweep) {
  if (rx < 1e-12 || ry < 1e-12) return [{ kind: "line", a: p1, b: p2 }];
  const phi = (phiDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (p1[0] - p2[0]) / 2, dy = (p1[1] - p2[1]) / 2;
  const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
  let l = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (l > 1) { rx *= Math.sqrt(l); ry *= Math.sqrt(l); }
  const sign = large !== sweep ? 1 : -1;
  const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const co = sign * Math.sqrt(Math.max(0, num2 / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cx1 = (co * rx * y1) / ry, cy1 = (-co * ry * x1) / rx;
  const cx = cp * cx1 - sp * cy1 + (p1[0] + p2[0]) / 2, cy = sp * cx1 + cp * cy1 + (p1[1] + p2[1]) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= TAU;
  else if (sweep && dt < 0) dt += TAU;
  if (Math.abs(rx - ry) < 1e-9 * Math.max(rx, ry)) return [{ kind: "svgarc", c: [cx, cy], r: rx, a: p1, b: p2, t1: t1 + phi, dt }];
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const out = [];
  const E = (t) => [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp];
  const D = (t) => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * sp, -rx * Math.sin(t) * sp + ry * Math.cos(t) * cp];
  for (let i = 0; i < n; i++) {
    const a = t1 + (dt * i) / n, b = t1 + (dt * (i + 1)) / n;
    const k = (4 / 3) * Math.tan((b - a) / 4);
    const pa = i === 0 ? p1 : E(a), pb = i === n - 1 ? p2 : E(b), da = D(a), db = D(b);
    out.push({ kind: "bez", a: pa, c1: [pa[0] + da[0] * k, pa[1] + da[1] * k], c2: [pb[0] - db[0] * k, pb[1] - db[1] * k], b: pb });
  }
  return out;
}

/**
 * Parse an SVG document. Coordinates: user units -> mm (viewBox and physical width/height, else
 * 96 px per inch), y flipped so the drawing reads upright on the sketch plane.
 */
export function parseSVG(src) {
  const root = parseXml(src);
  const svg = (function find(n) { if (n.name === "svg") return n; for (const c of n.children) { const f = find(c); if (f) return f; } return null; })(root);
  if (!svg) throw new Error("The file is not an SVG drawing");
  let base = mat(PX_MM, 0, 0, -PX_MM, 0, 0);
  const vb = (svg.attrs.viewBox || "").split(/[\s,]+/).filter(Boolean).map(Number);
  const wpx = lengthPx(svg.attrs.width), hpx = lengthPx(svg.attrs.height);
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    const sx = (wpx || vb[2]) / vb[2], sy = (hpx || vb[3]) / vb[3];
    base = mmul(base, mat(sx, 0, 0, sy, -vb[0] * sx, -vb[1] * sy));
  }
  const items = [];
  const layers = new Set();
  const walk = (el, M, layer) => {
    const st = el.attrs.style || "";
    if (el.attrs.display === "none" || /display\s*:\s*none/.test(st)) return;
    if (["defs", "clipPath", "mask", "pattern", "symbol", "metadata", "title", "desc", "style", "script", "marker"].includes(el.name)) return;
    const m = el.attrs.transform ? mmul(M, parseTransform(el.attrs.transform)) : M;
    const lay = el.name === "g" && (el.attrs["inkscape:label"] || el.attrs.id) && el.attrs["inkscape:groupmode"] === "layer" ? el.attrs["inkscape:label"] || el.attrs.id : layer;
    const A = (p) => apply(m, p);
    const push = (segs) => {
      for (const s of segs) {
        if (s.kind === "line") items.push({ kind: "line", a: A(s.a), b: A(s.b), layer: lay });
        else if (s.kind === "bez") items.push({ kind: "bez", a: A(s.a), c1: A(s.c1), c2: A(s.c2), b: A(s.b), layer: lay });
        else if (s.kind === "qbez") items.push({ kind: "qbez", a: A(s.a), c: A(s.c), b: A(s.b), layer: lay });
        else if (s.kind === "svgarc") {
          // circular arc: a uniform-scale transform keeps it circular, else cubic pieces
          const det = m[0] * m[3] - m[1] * m[2];
          const sc = Math.hypot(m[0], m[1]), sc2 = Math.hypot(m[2], m[3]);
          if (Math.abs(sc - sc2) < 1e-9 * sc && Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-9 * sc * sc) {
            const c = A(s.c), a = A(s.a), b = A(s.b);
            // the y flip reverses the sweep sense
            const ccw = (s.dt > 0) === (det > 0);
            const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
            if (Math.abs(Math.abs(s.dt) - TAU) < 1e-9) items.push({ kind: "circle", c, r: s.r * sc, layer: lay });
            else items.push(ccw ? { kind: "arc", c, r: s.r * sc, a0, a1, layer: lay } : { kind: "arc", c, r: s.r * sc, a0: a1, a1: a0, layer: lay });
          } else push(arcToSegs(s.a, s.b, s.r, s.r, 0, Math.abs(s.dt) > Math.PI, s.dt > 0).map((x) => (x.kind === "svgarc" ? { kind: "line", a: x.a, b: x.b } : x)));
        }
      }
    };
    switch (el.name) {
      case "path": if (el.attrs.d) push(parsePath(el.attrs.d)); break;
      case "line": push([{ kind: "line", a: [num(el.attrs.x1), num(el.attrs.y1)], b: [num(el.attrs.x2), num(el.attrs.y2)] }]); break;
      case "polyline": case "polygon": {
        const v = (el.attrs.points || "").split(/[\s,]+/).filter(Boolean).map(Number);
        const pts = [];
        for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
        const segs = [];
        for (let i = 0; i + 1 < pts.length; i++) segs.push({ kind: "line", a: pts[i], b: pts[i + 1] });
        if (el.name === "polygon" && pts.length > 2) segs.push({ kind: "line", a: pts[pts.length - 1], b: pts[0] });
        push(segs);
        break;
      }
      case "rect": {
        const x = num(el.attrs.x), y = num(el.attrs.y), w = num(el.attrs.width), h = num(el.attrs.height);
        if (!(w > 0 && h > 0)) break;
        let rx = el.attrs.rx !== undefined ? num(el.attrs.rx) : el.attrs.ry !== undefined ? num(el.attrs.ry) : 0;
        let ry = el.attrs.ry !== undefined ? num(el.attrs.ry) : rx;
        rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
        if (rx > 0 && ry > 0) push(parsePath(`M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`));
        else push(parsePath(`M${x},${y}H${x + w}V${y + h}H${x}Z`));
        break;
      }
      case "circle": {
        const r = num(el.attrs.r);
        if (r > 0) push(parsePath(`M${num(el.attrs.cx) + r},${num(el.attrs.cy)}A${r},${r} 0 1 1 ${num(el.attrs.cx) - r},${num(el.attrs.cy)}A${r},${r} 0 1 1 ${num(el.attrs.cx) + r},${num(el.attrs.cy)}Z`).filter((s) => s.kind !== "line"));
        break;
      }
      case "ellipse": {
        const rx = num(el.attrs.rx), ry = num(el.attrs.ry), cx = num(el.attrs.cx), cy = num(el.attrs.cy);
        if (rx > 0 && ry > 0) push(parsePath(`M${cx + rx},${cy}A${rx},${ry} 0 1 1 ${cx - rx},${cy}A${rx},${ry} 0 1 1 ${cx + rx},${cy}Z`).filter((s) => s.kind !== "line"));
        break;
      }
      default: break;
    }
    for (const c of el.children) walk(c, m, lay);
  };
  walk(svg, base, "0");
  for (const it of items) layers.add(it.layer);
  // merge two half circles back into a circle
  return finish(mergeCircles(items), [...layers]);
}

function mergeCircles(items) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i], b = items[i + 1];
    if (a.kind === "arc" && b && b.kind === "arc" && Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]) < 1e-9 && Math.abs(a.r - b.r) < 1e-9) {
      const sweepA = (((a.a1 - a.a0) % TAU) + TAU) % TAU, sweepB = (((b.a1 - b.a0) % TAU) + TAU) % TAU;
      if (Math.abs(sweepA + sweepB - TAU) < 1e-6) { out.push({ kind: "circle", c: a.c, r: a.r, layer: a.layer }); i++; continue; }
    }
    out.push(a);
  }
  return out;
}

function bboxOf(items) {
  let mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
  const add = (p) => { if (!p) return; mn = [Math.min(mn[0], p[0]), Math.min(mn[1], p[1])]; mx = [Math.max(mx[0], p[0]), Math.max(mx[1], p[1])]; };
  for (const it of items) {
    if (it.kind === "circle" || it.kind === "arc") { add([it.c[0] - it.r, it.c[1] - it.r]); add([it.c[0] + it.r, it.c[1] + it.r]); }
    else if (it.kind === "ellipse") { const R = Math.hypot(...it.ax); add([it.c[0] - R, it.c[1] - R]); add([it.c[0] + R, it.c[1] + R]); }
    else for (const k of ["a", "b", "c1", "c2", "c"]) add(it[k]);
    for (const p of it.cps || it.pts || []) add(p);
  }
  return Number.isFinite(mn[0]) ? { min: mn, max: mx } : { min: [0, 0], max: [0, 0] };
}
function finish(items, layers, extra = {}) { return { items, layers, bbox: bboxOf(items), ...extra }; }

// ---------------------------------------------------------------------------
// DXF
// ---------------------------------------------------------------------------
const DXF_UNITS = { 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m" };
export const UNIT_MM = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

/** Parse a DXF (ASCII) file. Coordinates stay in file units (see .units). */
export function parseDXF(src) {
  const lines = String(src).split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([parseInt(lines[i].trim(), 10), lines[i + 1].replace(/\s+$/, "")]);
  let i = 0;
  let units = null;
  const layers = new Set();
  const items = [];
  const blocks = {};
  const next = () => pairs[i++];
  const peek = () => pairs[i];
  // read one entity's group codes (until the next code 0)
  const readEnt = () => {
    const g = [];
    while (i < pairs.length && pairs[i][0] !== 0) g.push(next());
    return g;
  };
  const get = (g, c, def) => { const p = g.find((x) => x[0] === c); return p ? p[1] : def; };
  const getN = (g, c, def = 0) => { const v = parseFloat(get(g, c, def)); return Number.isFinite(v) ? v : def; };
  const all = (g, c) => g.filter((x) => x[0] === c).map((x) => parseFloat(x[1]));
  const entity = (type, g, out) => {
    const layer = get(g, 8, "0");
    layers.add(layer);
    const P = (cx, cy) => [getN(g, cx), getN(g, cy)];
    switch (type) {
      case "LINE": out.push({ kind: "line", a: P(10, 20), b: P(11, 21), layer }); break;
      case "CIRCLE": out.push({ kind: "circle", c: P(10, 20), r: getN(g, 40), layer }); break;
      case "ARC": out.push({ kind: "arc", c: P(10, 20), r: getN(g, 40), a0: (getN(g, 50) * Math.PI) / 180, a1: (getN(g, 51) * Math.PI) / 180, layer }); break;
      case "POINT": out.push({ kind: "point", a: P(10, 20), layer }); break;
      case "ELLIPSE": {
        const c = P(10, 20), ax = P(11, 21), ratio = getN(g, 40, 1), t0 = getN(g, 41, 0), t1 = getN(g, 42, TAU);
        out.push({ kind: "ellipse", c, ax, ratio, t0, t1, layer });
        break;
      }
      case "LWPOLYLINE": {
        const flags = getN(g, 70, 0);
        const verts = [];
        let cur = null;
        for (const [c, v] of g) {
          if (c === 10) { cur = { p: [parseFloat(v), 0], bulge: 0 }; verts.push(cur); }
          else if (c === 20 && cur) cur.p[1] = parseFloat(v);
          else if (c === 42 && cur) cur.bulge = parseFloat(v);
        }
        polyItems(verts, !!(flags & 1), layer, out);
        break;
      }
      case "SPLINE": {
        const deg = getN(g, 71, 3);
        const knots = all(g, 40);
        const xs = all(g, 10), ys = all(g, 20);
        const cps = xs.map((x, k) => [x, ys[k] || 0]);
        const fx = all(g, 11), fy = all(g, 21);
        const fits = fx.map((x, k) => [x, fy[k] || 0]);
        const w = all(g, 41);
        const flags = getN(g, 70, 0);
        const rational = w.length && w.some((x) => Math.abs(x - 1) > 1e-9);
        if (cps.length >= 2 && knots.length === cps.length + deg + 1 && !rational) out.push({ kind: "bspline", degree: deg, cps, knots, closed: !!(flags & 1), layer });
        else if (fits.length >= 2) out.push({ kind: "fit", pts: fits, closed: !!(flags & 1), layer });
        else if (cps.length >= 2) out.push({ kind: "fit", pts: cps, closed: false, layer });
        break;
      }
      case "TEXT": case "MTEXT": {
        let text = type === "MTEXT" ? g.filter((x) => x[0] === 3 || x[0] === 1).map((x) => x[1]).join("") : get(g, 1, "");
        text = text.replace(/\\P/g, "\n").replace(/\\[A-Za-z][^;]*;/g, "").replace(/[{}]/g, "");
        if (text.trim()) out.push({ kind: "text", a: P(10, 20), h: getN(g, 40, 2.5), text, rot: (getN(g, 50, 0) * Math.PI) / 180, layer });
        break;
      }
      case "INSERT": {
        const name = get(g, 2, "");
        const b = blocks[name];
        if (!b) break;
        const at = P(10, 20), sx = getN(g, 41, 1), sy = getN(g, 42, sx), rot = (getN(g, 50, 0) * Math.PI) / 180;
        const tf = (p) => { const x = (p[0] - b.base[0]) * sx, y = (p[1] - b.base[1]) * sy; return [at[0] + x * Math.cos(rot) - y * Math.sin(rot), at[1] + x * Math.sin(rot) + y * Math.cos(rot)]; };
        for (const it of b.items) out.push(transformItem(it, tf, Math.abs(sx), rot, sx * sy < 0, layer));
        break;
      }
      default: break;
    }
  };
  let section = null;
  while (i < pairs.length) {
    const [c, v] = next();
    if (c !== 0) continue;
    if (v === "SECTION") { const n = next(); section = n ? n[1] : null; continue; }
    if (v === "ENDSEC") { section = null; continue; }
    if (v === "EOF") break;
    if (section === "HEADER") continue;
    if (section === "TABLES" && v === "LAYER") { const g = readEnt(); const nm = get(g, 2, null); if (nm) layers.add(nm); continue; }
    if (section === "BLOCKS" && v === "BLOCK") {
      const g = readEnt();
      const name = get(g, 2, "");
      const blk = { base: [getN(g, 10), getN(g, 20)], items: [] };
      while (i < pairs.length && !(pairs[i][0] === 0 && pairs[i][1] === "ENDBLK")) {
        const [, t] = next();
        if (t === "POLYLINE") { polylineEnt(blk.items); continue; }
        const gg = readEnt();
        entity(t, gg, blk.items);
      }
      blocks[name] = blk;
      continue;
    }
    if (section === "ENTITIES") {
      if (v === "POLYLINE") { polylineEnt(items); continue; }
      const g = readEnt();
      entity(v, g, items);
    }
  }
  function polylineEnt(out) {
    const g = readEnt();
    const flags = getN(g, 70, 0);
    const layer = get(g, 8, "0");
    layers.add(layer);
    const verts = [];
    while (i < pairs.length) {
      const p = peek();
      if (!p || p[0] !== 0) { next(); continue; }
      if (p[1] === "VERTEX") { next(); const vg = readEnt(); verts.push({ p: [getN(vg, 10), getN(vg, 20)], bulge: getN(vg, 42, 0) }); continue; }
      if (p[1] === "SEQEND") { next(); readEnt(); }
      break;
    }
    polyItems(verts, !!(flags & 1), layer, out);
  }
  // header units
  for (let k = 0; k + 1 < pairs.length; k++) if (pairs[k][0] === 9 && pairs[k][1] === "$INSUNITS") { units = DXF_UNITS[parseInt(pairs[k + 1][1], 10)] || null; break; }
  return finish(items, [...layers], { units });
}

/** Polyline vertices with bulges -> lines / arcs. */
function polyItems(verts, closed, layer, out) {
  const n = verts.length;
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const A = verts[k], B = verts[(k + 1) % n];
    if (Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1]) < 1e-12) continue;
    if (Math.abs(A.bulge) < 1e-12) { out.push({ kind: "line", a: A.p, b: B.p, layer }); continue; }
    const th = 4 * Math.atan(A.bulge);
    const d = Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1]);
    const r = d / (2 * Math.sin(Math.abs(th) / 2));
    const m = [(A.p[0] + B.p[0]) / 2, (A.p[1] + B.p[1]) / 2];
    const u = [(B.p[0] - A.p[0]) / d, (B.p[1] - A.p[1]) / d], nrm = [-u[1], u[0]];
    const h = r * Math.cos(Math.abs(th) / 2) * Math.sign(A.bulge);
    const c = [m[0] + nrm[0] * h, m[1] + nrm[1] * h];
    const ang = (p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
    if (A.bulge > 0) out.push({ kind: "arc", c, r, a0: ang(A.p), a1: ang(B.p), layer });
    else out.push({ kind: "arc", c, r, a0: ang(B.p), a1: ang(A.p), layer });
  }
}

function transformItem(it, tf, s, rot, mirror, layer) {
  const o = { ...it, layer };
  for (const k of ["a", "b", "c1", "c2"]) if (it[k]) o[k] = tf(it[k]);
  if (it.kind === "qbez") o.c = tf(it.c);
  if (it.cps) o.cps = it.cps.map(tf);
  if (it.pts) o.pts = it.pts.map(tf);
  if (it.kind === "circle" || it.kind === "arc") {
    o.c = tf(it.c); o.r = it.r * s;
    if (it.kind === "arc") { o.a0 = it.a0 + rot; o.a1 = it.a1 + rot; if (mirror) { const a0 = Math.PI - o.a1, a1 = Math.PI - o.a0; o.a0 = a0; o.a1 = a1; } }
  }
  if (it.kind === "ellipse") { o.c = tf(it.c); const e = tf([it.c[0] + it.ax[0], it.c[1] + it.ax[1]]); o.ax = [e[0] - o.c[0], e[1] - o.c[1]]; }
  if (it.kind === "text") { o.a = tf(it.a); o.h = it.h * s; o.rot = (it.rot || 0) + rot; }
  return o;
}

/** Apply a 2D placement (scale k about the origin, flips, rotation, then translation) to items. */
export function placeItems(items, { k = 1, flipH = false, flipV = false, ang = 0, dx = 0, dy = 0 } = {}) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const sx = flipH ? -k : k, sy = flipV ? -k : k;
  const tf = (p) => { const x = p[0] * sx, y = p[1] * sy; return [x * c - y * s + dx, x * s + y * c + dy]; };
  const mirror = flipH !== flipV;
  return items.map((it) => {
    const o = transformItem(it, tf, k, ang, mirror, it.layer);
    if (it.kind === "arc" && mirror) {
      // reflection reverses the arc sense: recompute the angles from the mapped end points
      const P = (a) => tf([it.c[0] + it.r * Math.cos(a), it.c[1] + it.r * Math.sin(a)]);
      const pa = P(it.a0), pb = P(it.a1);
      o.a0 = Math.atan2(pb[1] - o.c[1], pb[0] - o.c[0]);
      o.a1 = Math.atan2(pa[1] - o.c[1], pa[0] - o.c[0]);
    } else if (it.kind === "arc") {
      const P = (a) => tf([it.c[0] + it.r * Math.cos(a), it.c[1] + it.r * Math.sin(a)]);
      const pa = P(it.a0), pb = P(it.a1);
      o.a0 = Math.atan2(pa[1] - o.c[1], pa[0] - o.c[0]);
      o.a1 = Math.atan2(pb[1] - o.c[1], pb[0] - o.c[0]);
    }
    if (it.kind === "ellipse" && mirror) { o.mirror = !it.mirror; }
    return o;
  });
}

/** Scale DXF items from file units to mm. */
export function scaleItems(items, f) {
  return placeItems(items, { k: f });
}
