// AutoConstrain: propose geometric constraints and dimensions that fully constrain a sketch.
// Candidates are inferred from the geometry (near-horizontal lines, touching end points, equal
// lengths, parallel / perpendicular pairs, tangent joins, concentric circles), then dimensions
// (sizes, then locations measured from a datum point). Each candidate is kept only when the solver
// accepts it and it removes degrees of freedom (no redundant or conflicting items).
import { solve, cloneSketch, measureDim, curvePoints, curveEnds, tangentAt } from "./sketch.js";

const D2R = Math.PI / 180;
const P2 = (sk, id) => [sk.points[id].x, sk.points[id].y];
const len = (a) => Math.hypot(a[0], a[1]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];

function lineDir(sk, id) {
  const cv = sk.curves[id];
  const d = sub(P2(sk, cv.p2), P2(sk, cv.p1));
  const l = len(d);
  return l > 1e-12 ? [d[0] / l, d[1] / l, l] : null;
}
const hasCons = (sk, type, refs) => sk.constraints.some((c) => c.type === type && c.refs.length === refs.length && refs.every((r) => c.refs.includes(r)));

/** Geometric constraint candidates (most useful first). tol: mm, angTol: degrees. */
export function constraintCandidates(sk, opts = {}) {
  const tol = opts.tol ?? 1e-3, angTol = (opts.angTol ?? 0.5) * D2R;
  const out = [];
  const curves = Object.entries(sk.curves).filter(([, cv]) => !cv.proj && cv.type !== "text" && cv.type !== "c3d");
  const lines = curves.filter(([, cv]) => cv.type === "line").map(([id]) => id);
  const rounds = curves.filter(([, cv]) => cv.type === "circle" || cv.type === "arc").map(([id]) => id);
  // coincident: end points on top of each other
  const ptsUsed = [...new Set(curves.flatMap(([, cv]) => curvePoints(cv)))].filter((p) => sk.points[p]);
  for (let i = 0; i < ptsUsed.length; i++) for (let j = i + 1; j < ptsUsed.length; j++) {
    const a = ptsUsed[i], b = ptsUsed[j];
    if (len(sub(P2(sk, a), P2(sk, b))) < tol && !hasCons(sk, "coincident", [a, b])) out.push({ type: "coincident", refs: [a, b], kind: "c" });
  }
  // horizontal / vertical
  for (const id of lines) {
    const d = lineDir(sk, id);
    if (!d) continue;
    if (hasCons(sk, "horizontal", [id]) || hasCons(sk, "vertical", [id])) continue;
    const a = Math.abs(Math.atan2(d[1], d[0]));
    if (Math.min(a, Math.PI - a) < angTol) out.push({ type: "horizontal", refs: [id], kind: "c" });
    else if (Math.abs(a - Math.PI / 2) < angTol) out.push({ type: "vertical", refs: [id], kind: "c" });
  }
  // tangent joins (line-arc, arc-arc sharing an end point with matching directions)
  for (const [id, cv] of curves) {
    if (cv.type !== "arc") continue;
    for (const [oid, ov] of curves) {
      if (oid === id || (ov.type !== "line" && ov.type !== "arc")) continue;
      if (oid < id && ov.type === "arc") continue;
      for (const p of curveEnds(cv)) {
        if (!curveEnds(ov).includes(p)) continue;
        const t1 = tangentAt(sk, id, p), t2 = tangentAt(sk, oid, p);
        if (!t1 || !t2) continue;
        if (Math.abs(t1[0] * t2[1] - t1[1] * t2[0]) < Math.sin(angTol) && t1[0] * t2[0] + t1[1] * t2[1] < 0 && !hasCons(sk, "tangent", [oid, id])) out.push({ type: "tangent", refs: [oid, id], kind: "c" });
      }
    }
  }
  // perpendicular / parallel between lines that share a point (then any pair)
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i], b = lines[j];
    const da = lineDir(sk, a), db = lineDir(sk, b);
    if (!da || !db) continue;
    const cr = Math.abs(da[0] * db[1] - da[1] * db[0]), dt = Math.abs(da[0] * db[0] + da[1] * db[1]);
    const share = curvePoints(sk.curves[a]).some((p) => curvePoints(sk.curves[b]).includes(p));
    if (cr < Math.sin(angTol) && !hasCons(sk, "parallel", [a, b])) out.push({ type: "parallel", refs: [a, b], kind: "c", w: share ? 1 : 2 });
    else if (dt < Math.sin(angTol) && !hasCons(sk, "perpendicular", [a, b])) out.push({ type: "perpendicular", refs: [a, b], kind: "c", w: share ? 0 : 2 });
  }
  // equal lengths / radii
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const da = lineDir(sk, lines[i]), db = lineDir(sk, lines[j]);
    if (da && db && Math.abs(da[2] - db[2]) < Math.max(tol, 1e-4 * da[2]) && !hasCons(sk, "equal", [lines[i], lines[j]])) out.push({ type: "equal", refs: [lines[i], lines[j]], kind: "c", w: 3 });
  }
  for (let i = 0; i < rounds.length; i++) for (let j = i + 1; j < rounds.length; j++) {
    const A = sk.curves[rounds[i]], B = sk.curves[rounds[j]];
    if (A.c === B.c) continue;
    if (len(sub(P2(sk, A.c), P2(sk, B.c))) < tol) out.push({ type: "concentric", refs: [rounds[i], rounds[j]], kind: "c" });
    else if (Math.abs(Math.abs(A.r) - Math.abs(B.r)) < Math.max(tol, 1e-4 * Math.abs(A.r)) && !hasCons(sk, "equal", [rounds[i], rounds[j]])) out.push({ type: "equal", refs: [rounds[i], rounds[j]], kind: "c", w: 3 });
  }
  return out.sort((a, b) => (a.w || 0) - (b.w || 0));
}

/** Dimension candidates: sizes first, then locations from the datum point. */
export function dimensionCandidates(sk, datum, opts = {}) {
  const out = [];
  const curves = Object.entries(sk.curves).filter(([, cv]) => !cv.proj && !cv.cons && cv.type !== "text" && cv.type !== "c3d");
  const consCurves = Object.entries(sk.curves).filter(([, cv]) => !cv.proj && cv.cons && cv.type !== "text" && cv.type !== "c3d");
  for (const [id, cv] of [...curves, ...consCurves]) {
    if (cv.type === "line") out.push({ type: "distance", refs: [id], dimType: "aligned", kind: "d" });
    else if (cv.type === "circle") out.push({ type: "diameter", refs: [id], kind: "d" });
    else if (cv.type === "arc") out.push({ type: "radius", refs: [id], kind: "d" });
  }
  // angles between adjacent lines that are not perpendicular / parallel
  if (opts.angles !== false) {
    const lines = curves.filter(([, cv]) => cv.type === "line").map(([id]) => id);
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const a = sk.curves[lines[i]], b = sk.curves[lines[j]];
      const shared = [a.p1, a.p2].find((p) => p === b.p1 || p === b.p2);
      if (!shared) continue;
      out.push({ type: "angle", refs: [lines[i], lines[j]], kind: "d", flip1: a.p2 === shared, flip2: b.p2 === shared, late: true });
    }
  }
  // locations: horizontal / vertical distances from the datum to every point (nearest first)
  if (datum && sk.points[datum]) {
    const D = P2(sk, datum);
    const pts = [...new Set([...curves, ...consCurves].flatMap(([, cv]) => curvePoints(cv)))].filter((p) => p !== datum && sk.points[p]);
    pts.sort((a, b) => len(sub(P2(sk, a), D)) - len(sub(P2(sk, b), D)));
    for (const p of pts) {
      if (len(sub(P2(sk, p), D)) < 1e-9) { out.push({ type: "coincident", refs: [datum, p], kind: "c" }); continue; }
      out.push({ type: "distance", refs: [datum, p], dimType: "horizontal", kind: "d", loc: true });
      out.push({ type: "distance", refs: [datum, p], dimType: "vertical", kind: "d", loc: true });
    }
  }
  return out;
}

/**
 * Greedy AutoConstrain run. strategy: 'balanced' (constraints, sizes, locations), 'dims' (H/V and
 * coincident only, then dimensions), 'datum' (coincident + locations from the datum first).
 * Returns {items:[{type, refs, ..., expr?}], nullity0, nullity, fully}.
 */
export function autoConstrain(sk0, params, opts = {}) {
  const datum = opts.datum || (sk0.points.o ? "o" : null);
  const fmt = opts.fmt || ((v, k) => (k === "angle" ? `${v.toFixed(1)} deg` : `${v.toFixed(2)} mm`));
  const base = cloneSketch(sk0);
  const s0 = solve(base, params);
  let nullity = s0.nullity ?? 0;
  const res = { items: [], nullity0: nullity, nullity, fully: nullity === 0 };
  if (!s0.ok || nullity === 0) return res;
  const work = cloneSketch(base);
  const deadline = performance.now() + (opts.budgetMs || 4000);
  let n = 0;
  const tryAdd = (cand) => {
    if (nullity === 0 || performance.now() > deadline) return false;
    const c = { id: `__ac${n++}`, ...cand };
    delete c.kind; delete c.w; delete c.late; delete c.loc;
    if (c.type === "distance" || c.type === "diameter" || c.type === "radius" || c.type === "angle" || c.type === "pointLine") {
      const v = measureDim(work, c);
      if (!(v > 1e-9)) return false;
      c.expr = fmt(v, c.type === "angle" ? "angle" : "length");
    }
    const test = cloneSketch(work);
    test.constraints.push(c);
    let st;
    try { st = solve(test, params); } catch { return false; }
    if (!st.ok || st.nullity === undefined || st.nullity >= nullity) return false;
    work.constraints.push(c);
    // keep the solved positions (no change expected: values are measured)
    nullity = st.nullity;
    res.items.push({ ...cand, ...(c.expr ? { expr: c.expr } : {}) });
    return true;
  };
  const cons = constraintCandidates(work, opts);
  const dims = dimensionCandidates(work, datum, opts);
  const strat = opts.strategy || "balanced";
  if (strat === "datum") {
    for (const c of cons.filter((k) => k.type === "coincident" || k.type === "horizontal" || k.type === "vertical")) tryAdd(c);
    for (const d of dims.filter((k) => k.loc || k.type === "coincident")) tryAdd(d);
    for (const d of dims.filter((k) => !k.loc)) tryAdd(d);
    for (const c of cons) tryAdd(c);
  } else if (strat === "dims") {
    for (const c of cons.filter((k) => k.type === "coincident" || k.type === "horizontal" || k.type === "vertical" || k.type === "tangent")) tryAdd(c);
    for (const d of dims.filter((k) => !k.loc && !k.late)) tryAdd(d);
    for (const d of dims.filter((k) => k.late)) tryAdd(d);
    for (const d of dims.filter((k) => k.loc || k.type === "coincident")) tryAdd(d);
  } else {
    for (const c of cons) tryAdd(c);
    for (const d of dims.filter((k) => !k.loc && !k.late)) tryAdd(d);
    for (const d of dims.filter((k) => k.loc || k.type === "coincident")) tryAdd(d);
    for (const d of dims.filter((k) => k.late)) tryAdd(d);
  }
  res.nullity = nullity;
  res.fully = nullity === 0;
  res.datum = datum;
  return res;
}

/** Several AutoConstrain results (the dialog's tiles), de-duplicated. */
export function autoConstrainResults(sk, params, opts = {}) {
  const strategies = opts.strategies || ["balanced", "dims", "datum"];
  const out = [];
  const seen = new Set();
  for (const s of strategies) {
    const r = autoConstrain(sk, params, { ...opts, strategy: s });
    const sig = r.items.map((i) => `${i.type}:${i.refs.join(",")}:${i.dimType || ""}`).sort().join("|");
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({ ...r, strategy: s, constraints: r.items.filter((i) => i.kind === "c").length, dimensions: r.items.filter((i) => i.kind === "d").length });
  }
  return out;
}
