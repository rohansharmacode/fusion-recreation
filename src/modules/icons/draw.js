// Tiny SVG drawing kit for the original icon set.
// Every icon is self-contained markup: no gradients, no url(#id) references, no external
// art, so an icon renders identically anywhere (hidden menus, duplicated markup, data URLs).
//
// Coordinate systems
//   * 2D helpers work in the 32x32 (command icons) or 16x16 (UI glyphs) viewBox, y down.
//   * scene() is a small isometric renderer for "Fusion-like" solids: world Z up, the viewer
//     looks along -(1,1,1); faces are back-face culled, depth sorted per object, flat shaded
//     from a fixed light, and only silhouette / crease / material-boundary edges are stroked.

export const ctx = { small: false };
export const r2 = (n) => Math.round(n * 100) / 100;
/** Stroke width that stays visible when a 32-unit icon is drawn at 16px. */
export const W = (w) => r2(ctx.small ? w * 1.45 : w);

export const C = {
  edge: "#36414c",
  ink: "#46525e",
  inkLight: "#8a96a2",
  sketch: "#e2700a",
  sketchDark: "#a94f00",
  profile: "#fde1b9",
  pt: "#ffffff",
  ptEdge: "#26313c",
  proj: "#9b3fc4",
  cons: "#e2700a",
  blue: "#1f86e0",
  blueEdge: "#0c58a2",
  blueLight: "#a9d4f8",
  plane: "#f7c252",
  planeEdge: "#c0820c",
  axis: "#d38407",
  green: "#3c9f2b",
  greenEdge: "#236b17",
  red: "#df3329",
  redEdge: "#9b1a13",
  white: "#ffffff",
  yellow: "#f4c430",
  paper: "#fbfcfd",
  paperEdge: "#5d6874",
};

export const MAT = {
  steel: { d: [112, 124, 138], l: [247, 248, 250], e: C.edge },
  light: { d: [150, 162, 175], l: [252, 253, 254], e: "#5c6874" },
  blue: { d: [22, 96, 174], l: [140, 202, 248], e: "#0e4d88" },
  red: { d: [156, 32, 26], l: [248, 156, 146], e: "#86170f" },
  green: { d: [38, 118, 30], l: [172, 228, 152], e: "#215f16" },
  orange: { d: [200, 104, 10], l: [255, 218, 156], e: "#9a4f05" },
  plane: { d: [210, 144, 30], l: [253, 222, 134], e: C.planeEdge, op: 0.66 },
  dark: { d: [58, 68, 80], l: [148, 158, 170], e: C.edge },
  pcb: { d: [18, 98, 52], l: [96, 192, 116], e: "#14502a" },
  gold: { d: [168, 120, 20], l: [255, 226, 130], e: "#7a5406" },
  purple: { d: [104, 60, 160], l: [212, 186, 246], e: "#4a2378" },
  glass: { d: [120, 150, 180], l: [235, 244, 252], e: "#5b7896", op: 0.45 },
};

// ---------------------------------------------------------------------------
// markup
// ---------------------------------------------------------------------------
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function attrs(o) {
  let s = "";
  for (const k in o) {
    const v = o[k];
    if (v === undefined || v === null || v === false) continue;
    s += ` ${k}="${typeof v === "number" ? r2(v) : v}"`;
  }
  return s;
}
export const el = (tag, o = {}, inner) => (inner === undefined ? `<${tag}${attrs(o)}/>` : `<${tag}${attrs(o)}>${inner}</${tag}>`);
const r1 = (n) => Math.round(n * 10) / 10;
export const pd = (pts, close = true) => pts.map((p, i) => `${i ? "L" : "M"}${r1(p[0])} ${r1(p[1])}`).join("") + (close ? "Z" : "");
export const g = (inner, o = {}) => el("g", o, inner);

// line / polyline / polygon / path / circle / ellipse / rect / text
export const ln = (x1, y1, x2, y2, stroke = C.ink, w = 1, o = {}) =>
  el("line", { x1, y1, x2, y2, stroke, "stroke-width": W(w), "stroke-linecap": "round", ...o });
export const pl = (pts, stroke = C.ink, w = 1, o = {}) =>
  el("path", { d: pd(pts, false), fill: "none", stroke, "stroke-width": W(w), "stroke-linecap": "round", "stroke-linejoin": "round", ...o });
export const pg = (pts, fill, stroke, w = 1, o = {}) =>
  el("path", { d: pd(pts, true), fill: fill || "none", stroke: stroke || null, "stroke-width": stroke ? W(w) : null, "stroke-linejoin": "round", ...o });
export const pa = (d, fill, stroke, w = 1, o = {}) =>
  el("path", { d, fill: fill || "none", stroke: stroke || null, "stroke-width": stroke ? W(w) : null, "stroke-linejoin": "round", "stroke-linecap": "round", ...o });
export const ci = (cx, cy, r, fill, stroke, w = 1, o = {}) =>
  el("circle", { cx, cy, r, fill: fill || "none", stroke: stroke || null, "stroke-width": stroke ? W(w) : null, ...o });
export const elp = (cx, cy, rx, ry, fill, stroke, w = 1, o = {}) =>
  el("ellipse", { cx, cy, rx, ry, fill: fill || "none", stroke: stroke || null, "stroke-width": stroke ? W(w) : null, ...o });
export const rc = (x, y, w, h, fill, stroke, sw = 1, o = {}) =>
  el("rect", { x, y, width: w, height: h, fill: fill || "none", stroke: stroke || null, "stroke-width": stroke ? W(sw) : null, ...o });
export const tx = (x, y, s, size, fill = C.ink, o = {}) =>
  el("text", { x, y, "font-size": size, "font-family": "Arial,Helvetica,sans-serif", "font-weight": 700, fill, "text-anchor": "middle", ...o }, esc(s));
export const dash = (a = 2, b = 1.6) => ({ "stroke-dasharray": `${W(a)} ${W(b)}` });

// ---------------------------------------------------------------------------
// 2D vector helpers
// ---------------------------------------------------------------------------
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul2 = (a, s) => [a[0] * s, a[1] * s];
const len2 = (a) => Math.hypot(a[0], a[1]);
const nrm2 = (a) => { const l = len2(a) || 1; return [a[0] / l, a[1] / l]; };
export const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Points on an (axis-aligned) ellipse arc, angles in degrees, y down (90 = bottom). */
export function arcPts(cx, cy, rx, ry, a0, a1, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}
/** Quadratic / cubic bezier (2D or 3D points) sampled into a polyline. */
export function bez(p0, p1, p2, p3, n = 16) {
  const out = [];
  const dims = p0.map((_, k) => k);
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    if (p3) out.push(dims.map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]));
    else out.push(dims.map((k) => u * u * p0[k] + 2 * u * t * p1[k] + t * t * p2[k]));
  }
  return out;
}
export function regPoly(cx, cy, r, n, rot = -90, ry = r) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = ((rot + (360 * i) / n) * Math.PI) / 180; out.push([cx + r * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
}

function trimEnd(pts, d) {
  const out = pts.slice();
  while (out.length > 1 && d > 0) {
    const a = out[out.length - 2], b = out[out.length - 1];
    const l = len2(sub2(b, a));
    if (l > d) { out[out.length - 1] = lerp2(b, a, d / l); return out; }
    d -= l; out.pop();
  }
  return out;
}
const trimStart = (pts, d) => trimEnd(pts.slice().reverse(), d).reverse();
function offsetLine(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const t = nrm2(sub2(b, a));
    return add2(p, mul2([-t[1], t[0]], d));
  });
}

/** Filled arrow along a polyline (centre line). o: {w, hl, hw, both, fill, stroke} */
export function arrow(pts, o = {}) {
  const w = (o.w ?? 2.4) * (ctx.small ? 1.2 : 1);
  const hl = (o.hl ?? 5.2) * (ctx.small ? 1.1 : 1), hw = (o.hw ?? 6.6) * (ctx.small ? 1.1 : 1);
  const fill = o.fill ?? C.blue, stroke = o.stroke ?? C.blueEdge;
  let line = trimEnd(pts, hl);
  if (o.both) line = trimStart(line, hl);
  if (line.length < 2) line = [pts[0], lerp2(pts[0], pts[pts.length - 1], 0.01)];
  const L = offsetLine(line, w / 2), R = offsetLine(line, -w / 2);
  const end = pts[pts.length - 1], be = line[line.length - 1];
  const dir = nrm2(sub2(end, be)), n = [-dir[1], dir[0]];
  let poly = [...L, add2(be, mul2(n, hw / 2)), end, add2(be, mul2(n, -hw / 2)), ...R.reverse()];
  if (o.both) {
    const st = pts[0], bs = line[0];
    const d2 = nrm2(sub2(st, bs)), n2 = [-d2[1], d2[0]];
    poly = [...poly, add2(bs, mul2(n2, hw / 2)), st, add2(bs, mul2(n2, -hw / 2))];
  }
  return pg(poly, fill, stroke, o.sw ?? 0.8);
}
/** Thin line arrow (dimension style). */
export function lineArrow(pts, stroke = C.ink, o = {}) {
  const hl = o.hl ?? 3.2, hw = o.hw ?? 3.2;
  const end = pts[pts.length - 1], prev = pts[pts.length - 2];
  const dir = nrm2(sub2(end, prev)), n = [-dir[1], dir[0]];
  const base = sub2(end, mul2(dir, hl));
  let s = pl(o.both ? trimStart(trimEnd(pts, hl * 0.6), hl * 0.6) : trimEnd(pts, hl * 0.6), stroke, o.w ?? 1);
  s += pg([add2(base, mul2(n, hw / 2)), end, add2(base, mul2(n, -hw / 2))], stroke, null);
  if (o.both) {
    const st = pts[0], nx = pts[1];
    const d2 = nrm2(sub2(st, nx)), n2 = [-d2[1], d2[0]];
    const b2 = sub2(st, mul2(d2, hl));
    s += pg([add2(b2, mul2(n2, hw / 2)), st, add2(b2, mul2(n2, -hw / 2))], stroke, null);
  }
  return s;
}

// ---------------------------------------------------------------------------
// sketch-style 2D elements
// ---------------------------------------------------------------------------
/** sketch point: small white square with a dark outline */
export function spt(x, y, o = {}) {
  const s = (o.s ?? 3.4) * (ctx.small ? 1.05 : 1);
  return el("rect", { x: x - s / 2, y: y - s / 2, width: s, height: s, fill: o.fill ?? C.pt, stroke: o.stroke ?? C.ptEdge, "stroke-width": W(0.9) });
}
/** centre point: small cross */
export function cpt(x, y, o = {}) {
  const s = o.s ?? 2.4;
  return pa(`M${x - s} ${y}H${x + s}M${x} ${y - s}V${y + s}`, null, o.stroke ?? C.ptEdge, 1);
}
export const skl = (pts, o = {}) => pl(pts, o.stroke ?? C.sketch, o.w ?? 1.6, o.dash ? dash(...(Array.isArray(o.dash) ? o.dash : [])) : {});
export const skg = (pts, fill = C.profile, o = {}) => pg(pts, fill, o.stroke ?? C.sketch, o.w ?? 1.6, o.dash ? dash() : {});
export const skp = (d, fill, o = {}) => pa(d, fill, o.stroke ?? C.sketch, o.w ?? 1.6, o.dash ? dash(...(Array.isArray(o.dash) ? o.dash : [])) : {});
export const construction = (pts, stroke = C.sketch) => pl(pts, stroke, 1.1, dash(2.4, 1.6));

/** translucent yellow-orange construction plane (screen polygon) */
export const plane2 = (pts, o = {}) => pg(pts, o.fill ?? C.plane, o.stroke ?? C.planeEdge, o.w ?? 1, { "fill-opacity": o.op ?? 0.7 });

// ---------------------------------------------------------------------------
// overlays / badges (drawn bottom-right unless positioned)
// ---------------------------------------------------------------------------
export const badge = {
  plus: (x = 25, y = 25, r = 5.2) => ci(x, y, r, C.green, C.greenEdge, 0.8) + pa(`M${x - 2.8} ${y}H${x + 2.8}M${x} ${y - 2.8}V${y + 2.8}`, null, C.white, 1.7),
  minus: (x = 25, y = 25, r = 5.2) => ci(x, y, r, C.red, C.redEdge, 0.8) + pa(`M${x - 2.8} ${y}H${x + 2.8}`, null, C.white, 1.7),
  check: (x = 25, y = 25, r = 5.2) => ci(x, y, r, C.green, C.greenEdge, 0.8) + pl([[x - 2.6, y + 0.1], [x - 0.6, y + 2.1], [x + 2.8, y - 2]], C.white, 1.6),
  x: (x = 25, y = 25, r = 5.2) => ci(x, y, r, C.red, C.redEdge, 0.8) + pa(`M${x - 2.2} ${y - 2.2}L${x + 2.2} ${y + 2.2}M${x + 2.2} ${y - 2.2}L${x - 2.2} ${y + 2.2}`, null, C.white, 1.6),
  star: (x = 25, y = 7, r = 5) => {
    const p = [];
    for (let i = 0; i < 10; i++) { const a = ((-90 + i * 36) * Math.PI) / 180, rr = i % 2 ? r * 0.45 : r; p.push([x + rr * Math.cos(a), y + rr * Math.sin(a)]); }
    return pg(p, C.yellow, "#a77a00", 0.7);
  },
  spark: (x = 25, y = 7, r = 5, fill = C.yellow, stroke = "#a77a00") => {
    const p = [];
    for (let i = 0; i < 8; i++) { const a = ((-90 + i * 45) * Math.PI) / 180, rr = i % 2 ? r * 0.3 : r; p.push([x + rr * Math.cos(a), y + rr * Math.sin(a)]); }
    return pg(p, fill, stroke, 0.7);
  },
  gear: (x = 25, y = 25, r = 5.4, fill = "#6c7884") => {
    const p = [];
    for (let i = 0; i < 16; i++) { const a = ((i * 22.5 + 11.25) * Math.PI) / 180, rr = Math.floor(i / 2) % 2 ? r * 0.74 : r; p.push([x + rr * Math.cos(a), y + rr * Math.sin(a)]); }
    return pg(p, fill, C.edge, 0.7) + ci(x, y, r * 0.34, C.white, C.edge, 0.6);
  },
  lock: (x = 25, y = 25, s = 1, fill = C.yellow) =>
    pa(`M${x - 2.4 * s} ${y - 1}V${y - 3 * s}a${2.4 * s} ${2.4 * s} 0 0 1 ${4.8 * s} 0V${y - 1}`, null, C.edge, 1.3) +
    rc(x - 3.6 * s, y - 1.2, 7.2 * s, 6 * s, fill, C.edge, 0.8, { rx: 0.8 }),
  mag: (x = 23, y = 23, r = 4.2) => ci(x, y, r, "#e9f3fc", C.edge, 1.3) + ln(x + r * 0.72, y + r * 0.72, x + r * 1.75, y + r * 1.75, C.edge, 2.4),
  info: (x = 25, y = 25, r = 5.2) => ci(x, y, r, C.blue, C.blueEdge, 0.8) + ln(x, y - 0.4, x, y + 2.8, C.white, 1.6) + ci(x, y - 2.6, 0.95, C.white),
  warn: (x = 25, y = 25, s = 5.8) => pg([[x, y - s], [x + s * 1.05, y + s * 0.8], [x - s * 1.05, y + s * 0.8]], "#f2b51c", "#9a6c00", 0.8) + ln(x, y - s * 0.35, x, y + s * 0.2, "#3a2a00", 1.4) + ci(x, y + s * 0.5, 0.7, "#3a2a00"),
  link: (x = 25, y = 25) =>
    pa(`M${x - 5} ${y + 1.5}l3 -3a2 2 0 0 1 2.8 2.8l-1 1`, null, C.edge, 1.5) + pa(`M${x + 4} ${y - 1.5}l-3 3a2 2 0 0 1 -2.8 -2.8l1 -1`, null, C.edge, 1.5),
  pencil: (x = 24, y = 8, len = 13, ang = 135) => pencil(x, y, len, ang),
};

/** Pencil whose tip is at (x,y), pointing along `ang` degrees (screen, y down). */
export function pencil(x, y, len = 13, ang = 135, wid = 4.4) {
  const a = (ang * Math.PI) / 180, d = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]];
  const P = (t, s) => [x - d[0] * t + n[0] * s, y - d[1] * t + n[1] * s];
  const h = wid / 2, tip = 4.2;
  const body = [P(tip, h), P(len - 2.2, h), P(len - 2.2, -h), P(tip, -h)];
  const cap = [P(len - 2.2, h), P(len, h), P(len, -h), P(len - 2.2, -h)];
  const wood = [P(0, 0), P(tip, h), P(tip, -h)];
  const lead = [P(0, 0), P(1.6, h * 0.38), P(1.6, -h * 0.38)];
  return pg(body, "#f5b82e", "#8a5a00", 0.8) + pg(cap, "#e7838a", "#8a3a40", 0.8) + pg(wood, "#f7dcb0", "#8a5a00", 0.8) + pg(lead, "#3a3a3a", null);
}

// ---------------------------------------------------------------------------
// 3D: vectors + isometric scene renderer
// ---------------------------------------------------------------------------
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
const VIEW = [0.57735, 0.57735, 0.57735];
const LIGHT = [0.42, 0.66, 0.88];
const LIGHT_N = v3.norm(LIGHT);

export function normal(pts) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return v3.norm([nx, ny, nz]);
}
export const centroid = (pts) => { const c = [0, 0, 0]; for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return v3.mul(c, 1 / pts.length); };
const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => hex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
const pkey = (p) => `${r2(p[0])},${r2(p[1])},${r2(p[2])}`;

/**
 * Isometric scene. s = scene({ox, oy, k}); s.add(faces, mat, opt); s.raw(svg); s.svg()
 *   faces: arrays of [x,y,z] points (CCW seen from outside) or {pts, mat?, op?, two?, noEdges?}
 *   opt: {sort=true, two, op, noEdges, open=true (stroke boundary edges), crease=0.9, ew=1, edge}
 * Objects are painted in the order they were added; faces are depth sorted within an object.
 */
export function scene(o = {}) {
  const ox = o.ox ?? 16, oy = o.oy ?? 20, k = o.k ?? 1;
  const objs = [];
  const P = (p) => [ox + (p[0] - p[1]) * 0.8660254 * k, oy + ((p[0] + p[1]) * 0.5 - p[2]) * k];
  const api = {
    P,
    k,
    add(faces, mat = "steel", opt = {}) { objs.push({ faces: faces.map((f) => (Array.isArray(f) ? { pts: f } : f)), mat, opt }); return api; },
    raw(svg) { objs.push({ raw: svg }); return api; },
    /** polyline through 3D points (screen-projected) */
    line(pts, stroke = C.ink, w = 1, extra = {}) { return pl(pts.map(P), stroke, w, extra); },
    svg() { return objs.map((ob) => (ob.raw !== undefined ? ob.raw : renderObj(ob, P))).join(""); },
  };
  return api;
}

function renderObj(ob, P) {
  const { faces, mat: dm, opt } = ob;
  const F = faces.map((f) => {
    let n = normal(f.pts);
    let vis = v3.dot(n, VIEW) > 1e-4;
    if (!vis && (f.two ?? opt.two)) { n = v3.mul(n, -1); vis = true; }
    let depth = 0;
    for (const p of f.pts) depth += p[0] + p[1] + p[2];
    return { ...f, n, vis, depth: depth / f.pts.length + (f.bias || 0), m: MAT[f.mat || dm] || MAT.steel, mname: f.mat || dm };
  });
  const ek = (a, b) => { const ka = pkey(a), kb = pkey(b); return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`; };
  const map = new Map();
  F.forEach((f, i) => f.pts.forEach((p, j) => {
    const e = ek(p, f.pts[(j + 1) % f.pts.length]);
    let arr = map.get(e);
    if (!arr) map.set(e, (arr = []));
    arr.push(i);
  }));
  const order = [];
  F.forEach((f, i) => { if (f.vis) order.push(i); });
  if (opt.sort !== false) order.sort((a, b) => F[a].depth - F[b].depth);
  const crease = opt.crease ?? 0.9;
  let out = "";
  for (const i of order) {
    const f = F[i];
    const t = Math.max(0, Math.min(1, 0.545 + 1.18 * Math.max(0, v3.dot(f.n, LIGHT_N)) - 0.88 * v3.dot(f.n, VIEW) + (f.lift || 0)));
    const col = f.fill || mix(f.m.d, f.m.l, t);
    const op = f.op ?? opt.op ?? f.m.op ?? 1;
    const p2 = f.pts.map(P);
    out += el("path", { d: pd(p2), fill: col, "fill-opacity": op < 1 ? op : null, stroke: op < 1 ? null : col, "stroke-width": op < 1 ? null : 0.45, "stroke-linejoin": "round" });
    if (f.noEdges || opt.noEdges) continue;
    let ed = "";
    for (let j = 0; j < f.pts.length; j++) {
      const p = f.pts[j], q = f.pts[(j + 1) % f.pts.length];
      if (pkey(p) === pkey(q)) continue;
      const nb = map.get(ek(p, q)).filter((x) => x !== i);
      let draw = false;
      if (!nb.length) draw = opt.open !== false;
      else for (const x of nb) { const h = F[x]; if (!h.vis || v3.dot(h.n, f.n) < crease || h.mname !== f.mname || h.hard || f.hard) { draw = true; break; } }
      if (draw) { const a = p2[j], b = p2[(j + 1) % p2.length]; ed += `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}`; }
    }
    if (ed) out += el("path", { d: ed, fill: "none", stroke: f.edge || opt.edge || f.m.e, "stroke-width": W((opt.ew ?? 1) * (ctx.small ? 1.2 : 1)), "stroke-linecap": "round", "stroke-opacity": opt.eo ?? null, "stroke-dasharray": opt.edash ? `${W(2)} ${W(1.5)}` : null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3D geometry generators (faces wound CCW seen from outside)
// ---------------------------------------------------------------------------
const AX = {
  z: { U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1] },
  y: { U: [1, 0, 0], V: [0, 0, 1], W: [0, 1, 0] },
  x: { U: [0, 1, 0], V: [0, 0, 1], W: [1, 0, 0] },
};
const area2 = (poly) => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

/**
 * Extrude a 2D polygon. axis 'z': poly in (x,y); 'y': poly in (x,z); 'x': poly in (y,z).
 * Returns faces tagged {tag:'top'|'bot'|'side', seg}. `caps:false` omits the caps.
 */
export function prism(poly, w0, w1, axis = "z", o = {}) {
  const { U, V, W: Wv } = AX[axis];
  const handed = Math.sign(v3.dot(v3.cross(U, V), Wv));
  let pts = poly.slice();
  if (area2(pts) * handed < 0) pts.reverse();
  const at = (p, w) => v3.add(v3.add(v3.mul(U, p[0]), v3.mul(V, p[1])), v3.mul(Wv, w));
  const faces = [];
  if (o.caps !== false && o.top !== false) faces.push({ pts: pts.map((p) => at(p, w1)), tag: "top" });
  if (o.caps !== false && o.bot !== false) faces.push({ pts: pts.map((p) => at(p, w0)).reverse(), tag: "bot" });
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    faces.push({ pts: [at(a, w0), at(b, w0), at(b, w1), at(a, w1)], tag: "side", seg: i });
  }
  return faces;
}
export const box = (x0, y0, z0, x1, y1, z1) => prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, "z");
export const circ2 = (cx, cy, r, n = 24, a0 = 0) => { const out = []; for (let i = 0; i < n; i++) { const a = ((a0 + (360 * i) / n) * Math.PI) / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return out; };
export const cylinder = (cx, cy, z0, z1, r, n = 24, axis = "z") => prism(circ2(cx, cy, r, n), z0, z1, axis);
export function rrect2(x0, y0, x1, y1, r, n = 4) {
  const out = [];
  const cs = [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]];
  for (const [cx, cy, a0] of cs) for (let i = 0; i <= n; i++) { const a = ((a0 + (90 * i) / n) * Math.PI) / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}

/** Re-wind a face so its normal points away from `inside`. */
export function outward(pts, inside) {
  const n = normal(pts), c = centroid(pts);
  return v3.dot(n, v3.sub(c, inside)) < 0 ? pts.slice().reverse() : pts;
}

/**
 * Surface of revolution about the world Z axis through (cx,cy).
 * profile: [[r,z],...] (open polyline); a0..a1 degrees; caps: add planar end caps when partial.
 */
export function revolve(profile, a0 = 0, a1 = 360, n = 24, o = {}) {
  const cx = o.cx ?? 0, cy = o.cy ?? 0;
  const full = Math.abs(a1 - a0) >= 360;
  const steps = Math.max(2, Math.round((n * Math.abs(a1 - a0)) / 360));
  const ring = (t) => { const a = (t * Math.PI) / 180; return profile.map(([r, z]) => [cx + r * Math.cos(a), cy + r * Math.sin(a), z]); };
  const rings = [];
  for (let i = 0; i <= steps; i++) rings.push(ring(a0 + ((a1 - a0) * i) / steps));
  if (full) rings[steps] = rings[0];
  // interior reference: centroid of the profile polygon at the mid angle
  const faces = [];
  const closed = o.closed ?? false;
  const segs = closed ? profile.length : profile.length - 1;
  const pc = profile.reduce((s, p) => [s[0] + p[0] / profile.length, s[1] + p[1] / profile.length], [0, 0]);
  for (let i = 0; i < steps; i++) {
    const am = ((a0 + ((a1 - a0) * (i + 0.5)) / steps) * Math.PI) / 180;
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % profile.length;
      let q = [rings[i][j], rings[i + 1][j], rings[i + 1][j2], rings[i][j2]];
      q = q.filter((p, idx) => pkey(p) !== pkey(q[(idx + 1) % q.length]));
      if (q.length < 3) continue;
      let inside;
      if (o.inside) inside = o.inside(j, am);
      else {
        // offset the segment midpoint toward the profile centroid
        const m = [(profile[j][0] + profile[j2][0]) / 2, (profile[j][1] + profile[j2][1]) / 2];
        const r = m[0] + (pc[0] - m[0]) * 0.3, z = m[1] + (pc[1] - m[1]) * 0.3;
        inside = [cx + r * Math.cos(am), cy + r * Math.sin(am), z];
      }
      faces.push({ pts: outward(q, inside), seg: j });
    }
  }
  if (!full && o.caps !== false && closed) {
    for (const [t, dir] of [[a0, 1], [a1, -1]]) {
      const pts = ring(t);
      const a = ((t + dir * 5 * Math.sign(a1 - a0)) * Math.PI) / 180;
      const inside = [cx + pc[0] * Math.cos(a), cy + pc[0] * Math.sin(a), pc[1]];
      faces.push({ pts: outward(pts, inside), tag: "cap" });
    }
  }
  return faces;
}

/** Tube (circular cross-section) along a 3D polyline. */
export function tube(path, r, n = 12, o = {}) {
  const faces = [];
  const rings = path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const t = v3.norm(v3.sub(b, a));
    let u = v3.cross(t, [0, 0, 1]);
    if (Math.hypot(...u) < 1e-3) u = v3.cross(t, [1, 0, 0]);
    u = v3.norm(u);
    const v = v3.norm(v3.cross(t, u));
    const ring = [];
    for (let k = 0; k < n; k++) { const a2 = (2 * Math.PI * k) / n; ring.push(v3.add(p, v3.add(v3.mul(u, r * Math.cos(a2)), v3.mul(v, r * Math.sin(a2))))); }
    return ring;
  });
  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      const q = [rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]];
      faces.push({ pts: outward(q, v3.mul(v3.add(path[i], path[i + 1]), 0.5)), seg: i });
    }
  }
  if (o.caps !== false) {
    faces.push({ pts: outward(rings[0], v3.add(path[0], v3.sub(path[1], path[0]))), tag: "cap0" });
    const L = path.length - 1;
    faces.push({ pts: outward(rings[L], v3.add(path[L], v3.sub(path[L - 1], path[L]))), tag: "cap1" });
  }
  return faces;
}

/** Ruled "loft" between two rings of equal length (rings are 3D point loops). */
export function loftRings(rings, o = {}) {
  const faces = [];
  const n = rings[0].length;
  for (let i = 0; i < rings.length - 1; i++) {
    const ca = centroid(rings[i]), cb = centroid(rings[i + 1]);
    const inside = v3.mul(v3.add(ca, cb), 0.5);
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      faces.push({ pts: outward([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]], inside), seg: i });
    }
  }
  if (o.caps !== false) {
    const L = rings.length - 1;
    faces.push({ pts: outward(rings[0], centroid(rings[1])), tag: "bot" });
    faces.push({ pts: outward(rings[L], centroid(rings[L - 1])), tag: "top" });
  }
  return faces;
}

/** Assign material `mat` to faces where pred(normal, centroid, face) is true. */
export function tint(faces, pred, mat, extra = {}) {
  for (const f of faces) if (pred(normal(f.pts), centroid(f.pts), f)) Object.assign(f, { mat }, extra);
  return faces;
}
/** Move / scale a face list. */
export const xform = (faces, fn) => faces.map((f) => ({ ...f, pts: f.pts.map(fn) }));
export const shift = (faces, d) => xform(faces, (p) => v3.add(p, d));
export const reverseFaces = (faces) => faces.map((f) => ({ ...f, pts: f.pts.slice().reverse() }));

/** Screen-space ellipse for a horizontal (XY-plane) circle of radius r centred at c. */
export function isoEllipse(s, c, r) {
  const [x, y] = s.P(c);
  return { cx: x, cy: y, rx: 1.2247449 * r * s.k, ry: 0.7071068 * r * s.k };
}

/**
 * A drilled hole seen from above in a horizontal face: opening ellipse, lit far wall and dark
 * floor. o: {wall, floor, edge, through}
 */
export function hole2(s, c, r, depth, o = {}) {
  const e = isoEllipse(s, c, r);
  const d = depth * s.k;
  const N = 28;
  const up = (x, cy) => { const t = (x - e.cx) / e.rx; return cy - e.ry * Math.sqrt(Math.max(0, 1 - t * t)); };
  const lo = (x, cy) => { const t = (x - e.cx) / e.rx; return cy + e.ry * Math.sqrt(Math.max(0, 1 - t * t)); };
  const xs = [];
  for (let i = 0; i <= N; i++) xs.push(e.cx - e.rx + (2 * e.rx * i) / N);
  const top = xs.map((x) => [x, up(x, e.cy)]);
  // far wall: from the top ellipse's upper arc down to min(floor upper arc, top lower arc)
  const wallLow = xs.map((x) => [x, Math.min(up(x, e.cy + d), lo(x, e.cy))]);
  let s2 = pg([...top, ...wallLow.reverse()], o.wall ?? "#9fb0c0", null);
  if (!o.through) {
    const fl = [], fu = [];
    for (const x of xs) {
      const a = up(x, e.cy + d), b = Math.min(lo(x, e.cy), lo(x, e.cy + d));
      if (b > a) { fu.push([x, a]); fl.push([x, b]); }
    }
    if (fu.length > 1) s2 += pg([...fu, ...fl.reverse()], o.floor ?? "#5d6b79", null);
  } else {
    const fl = [], fu = [];
    for (const x of xs) { const a = up(x, e.cy + d), b = lo(x, e.cy); if (b > a) { fu.push([x, a]); fl.push([x, b]); } }
    if (fu.length > 1) s2 += pg([...fu, ...fl.reverse()], o.floor ?? "#2d3741", null);
  }
  s2 += elp(e.cx, e.cy, e.rx, e.ry, null, o.edge ?? C.edge, o.ew ?? 1);
  return s2;
}
