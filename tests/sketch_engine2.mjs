// Tests for the sketch-engine additions used by the interactive sketch module.
//   node tests/sketch_engine2.mjs
import * as S from "../src/sketch/sketch.js";
import { ParamTable } from "../src/expr.js";

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) fails++; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const params = new ParamTable();

// circle / arc through 3 points
{
  const c = S.circleFrom3([1, 0], [0, 1], [-1, 0]);
  ok(c && near(c.c[0], 0) && near(c.c[1], 0) && near(c.r, 1), "circleFrom3 unit circle");
  ok(S.circleFrom3([0, 0], [1, 1], [2, 2]) === null, "circleFrom3 collinear -> null");
  const a = S.arcFrom3([1, 0], [0, 1], [-1, 0]);
  ok(a && a.ccw === true, "arcFrom3 upper half is CCW");
  const b = S.arcFrom3([1, 0], [0, -1], [-1, 0]);
  ok(b && b.ccw === false, "arcFrom3 lower half is CW");
}
// tangent arc
{
  const t = S.tangentArc([0, 0], [1, 0], [10, 10]);
  ok(t && near(t.c[0], 0) && near(t.c[1], 10) && near(t.r, 10) && t.ccw, "tangentArc quarter turn left");
  ok(S.tangentArc([0, 0], [1, 0], [5, 0]) === null, "tangentArc straight -> null");
}
// rectangle from corners, reuse origin, dims -> fully constrained
{
  const sk = S.newSketch();
  const r = S.addRectCorners(sk, [[0, 0], [30, 0], [30, 20], [0, 20]], { ids: ["o"] });
  ok(r.points[0] === "o", "addRectCorners reuses existing point id");
  S.addConstraint(sk, "distance", [r.lines[0]], { expr: "40", param: "d1", dimType: "aligned" });
  S.addConstraint(sk, "distance", [r.lines[1]], { expr: "25", param: "d2", dimType: "aligned" });
  const st = S.solve(sk, params);
  ok(st.ok && st.fully && st.nullity === 0, `rect + 2 dims fully constrained (nullity ${st.nullity})`);
  ok(near(sk.points[r.points[2]].x, 40, 1e-6) && near(sk.points[r.points[2]].y, 25, 1e-6), "rect solved to 40 x 25");
  ok(S.regions(sk).regions.length === 1, "rect has one profile");
  // redundant constraint is detected
  const t = S.tryConstraints(sk, params, [{ id: "kx", type: "horizontal", refs: [r.lines[0]] }]);
  ok(!t.ok && t.reason === "redundant", "redundant horizontal rejected");
  const t2 = S.tryConstraints(sk, params, [{ id: "ky", type: "distance", refs: [r.lines[0]], expr: "10", dimType: "aligned" }]);
  ok(!t2.ok, "conflicting/redundant dimension rejected");
}
// 3-point rectangle (rotated)
{
  const sk = S.newSketch();
  const r = S.addRectCorners(sk, [[0, 0], [10, 10], [5, 15], [-5, 5]], { aligned: false });
  const st = S.solve(sk, params);
  ok(st.ok && S.regions(sk).regions.length === 1, "3-point rectangle solves with one profile");
  void r;
}
// drag through solver
{
  const sk = S.newSketch();
  const r = S.addRectCorners(sk, [[0, 0], [30, 0], [30, 20], [0, 20]], { ids: ["o"] });
  S.solve(sk, params);
  const pid = r.points[2];
  const moved = S.dragSolve(sk, params, [{ ref: pid, x: 50, y: 35 }]);
  S.solve(sk, params);
  ok(moved && near(sk.points[pid].x, 50, 1e-4) && near(sk.points[pid].y, 35, 1e-4), "drag free corner follows the cursor");
  ok(near(sk.points[r.points[1]].y, 0, 1e-6) && near(sk.points[r.points[3]].x, 0, 1e-6), "drag keeps rectangle constraints");
  // dragging a line on a constrained rectangle
  S.addConstraint(sk, "distance", [r.lines[0]], { expr: "40", dimType: "aligned" });
  S.solve(sk, params);
  const okLine = S.dragSolve(sk, params, [{ ref: r.lines[2], x: 20, y: 60, t: 0.5 }]);
  S.solve(sk, params);
  ok(okLine && near(sk.points[r.points[2]].y, 60, 1e-3) && near(sk.points[r.points[2]].x, 40, 1e-6), "drag top line changes height only (width dimensioned)");
  // fully constrained: dragging does nothing
  S.addConstraint(sk, "distance", [r.lines[1]], { expr: "25", dimType: "aligned" });
  S.solve(sk, params);
  S.dragSolve(sk, params, [{ ref: pid, x: 80, y: 80 }]);
  ok(near(sk.points[pid].x, 40, 1e-6) && near(sk.points[pid].y, 25, 1e-6), "fully constrained geometry does not move");
}
// circle drag changes radius
{
  const sk = S.newSketch();
  const c = S.addCircle(sk, "o", 5);
  S.solve(sk, params);
  S.dragSolve(sk, params, [{ ref: c, x: 12, y: 0 }]);
  ok(near(sk.curves[c].r, 12, 1e-3), "dragging a circle rim changes its radius");
}
// chains + offset
{
  const sk = S.newSketch();
  const r = S.addRectCorners(sk, [[0, 0], [20, 0], [20, 10], [0, 10]]);
  const ch = S.chainOf(sk, r.lines[1]);
  ok(ch.ids.length === 4 && ch.closed, "chainOf finds closed rectangle loop");
  const ord = S.orderChain(sk, ch.ids);
  ok(ord && ord.closed && ord.segs.length === 4, "orderChain closed loop");
  const side = S.chainSide(sk, ord, [10, 5]);
  const res = S.offsetChain(sk, ch.ids, -side * 2); // outward by 2
  S.solve(sk, params);
  const areas = S.regions(sk).regions.map((x) => x.area).sort((a, b) => a - b);
  ok(res && res.curves.length === 4 && areas.length === 2 && near(areas[0], 24 * 14 - 200, 1e-3) && near(areas[1], 200, 1e-3), `offset rectangle outward by 2 (areas ${areas.map((a) => a.toFixed(1))})`);
}
{
  // open chain line + tangent arc + line (slot half)
  const sk = S.newSketch();
  const a = S.addPoint(sk, 0, 0), b = S.addPoint(sk, 10, 0), c = S.addPoint(sk, 10, 10), d = S.addPoint(sk, 0, 10), cc = S.addPoint(sk, 10, 5);
  const l1 = S.addLine(sk, a, b), arc = S.addArc(sk, cc, b, c), l2 = S.addLine(sk, c, d);
  const ord = S.orderChain(sk, [l1, arc, l2]);
  ok(ord && !ord.closed && ord.segs.length === 3, "orderChain open line-arc-line");
  const res = S.offsetChain(sk, [l1, arc, l2], 1); // left of traversal (a->b->c->d) is inside
  ok(res && res.curves.length === 3, "offset open chain creates 3 curves");
  const na = sk.curves[res.curves[1]];
  ok(na.type === "arc" && near(na.r, 4, 1e-9), `offset arc radius ${na.r}`);
}
// extend
{
  const sk = S.newSketch();
  const a = S.addPoint(sk, 0, 0), b = S.addPoint(sk, 5, 0), c = S.addPoint(sk, 10, -5), d = S.addPoint(sk, 10, 5);
  const l = S.addLine(sk, a, b);
  S.addLine(sk, c, d);
  const did = S.extendAt(sk, l, [4, 0]);
  ok(did && near(sk.points[sk.curves[l].p2].x, 10), "extend line to the next crossing");
}
// circle center snap reuse + trimPiece sanity
{
  const sk = S.newSketch();
  const r = S.addRectCorners(sk, [[0, 0], [20, 0], [20, 10], [0, 10]]);
  const near0 = S.nearestOnCurve(sk, r.lines[0], [7, 3]);
  ok(near0 && near(near0.p[0], 7) && near(near0.p[1], 0) && near(near0.d, 3), "nearestOnCurve on a line");
  const poly = S.curvePolyline(sk, S.addCircle(sk, "o", 3));
  ok(poly.length > 8 && near(Math.hypot(...poly[3]), 3), "curvePolyline circle samples");
}
// componentOf does not cross the fixed origin
{
  const sk = S.newSketch();
  const r1 = S.addRectCorners(sk, [[0, 0], [10, 0], [10, 10], [0, 10]], { ids: ["o"] });
  const r2 = S.addRectCorners(sk, [[0, 0], [-10, 0], [-10, -10], [0, -10]], { ids: ["o"] });
  const comp = S.componentOf(sk, [r1.lines[2]]);
  ok(comp.curves.has(r1.lines[0]) && !comp.curves.has(r2.lines[0]), "componentOf stops at fixed points");
}

// degenerate geometry is refused: Coincident on both end points of one rectangle edge
{
  const sk = S.newSketch();
  const r = S.addRect2pt(sk, [-30, -20], [30, 20]);
  S.solve(sk, params);
  const e = sk.curves[r.lines[0]];
  const t = S.tryConstraints(sk, params, [{ id: "__t0", type: "coincident", refs: [e.p1, e.p2] }]);
  ok(!t.ok && t.reason === "conflict", "coincident on the two ends of one edge is refused (no zero-length line)");
  const sk2 = S.cloneSketch(sk);
  S.addConstraint(sk2, "coincident", [e.p1, e.p2]);
  const st = S.solve(sk2, params);
  ok(!st.ok && st.degenerate && st.degenerate.includes(r.lines[0]), "solve reports the collapsed curve as degenerate");
  ok(near(Math.hypot(sk2.points[e.p2].x - sk2.points[e.p1].x, sk2.points[e.p2].y - sk2.points[e.p1].y), 60, 1e-6), "a degenerate solution is not written back");
}
// minimal change: sizes are kept and the first selection stays in place (Fusion)
{
  const sk = S.newSketch();
  const a = S.addPoint(sk, -100, 20), b = S.addPoint(sk, 0, 20);
  const l = S.addLine(sk, a, b); S.addConstraint(sk, "horizontal", [l]);
  const c = S.addPoint(sk, -50, 60); const ci = S.addCircle(sk, c, 10);
  const t = S.tryConstraints(sk, params, [{ id: "__t0", type: "tangent", refs: [ci, l] }]);
  ok(t.ok && near(t.sk.curves[ci].r, 10, 1e-6) && near(t.sk.points[c].x, -50, 1e-6) && near(t.sk.points[c].y, 60, 1e-6), "tangent circle->line keeps the radius and the circle");
  ok(t.ok && near(t.sk.points[a].y, 50, 1e-6) && near(t.sk.points[b].y, 50, 1e-6) && near(t.sk.points[a].x, -100, 1e-6), "tangent moves the line (second pick) onto the circle");
  // the document path: constraint added, then the model's solve reproduces the same result
  S.addConstraint(sk, "tangent", [ci, l]);
  const st = S.solve(sk, params);
  ok(st.ok && near(sk.curves[ci].r, 10, 1e-6) && near(sk.points[a].y, 50, 1e-6), "solve() after adding the tangent gives the same minimal change");
}
{
  const sk = S.newSketch();
  const c1 = S.addPoint(sk, 0, 10), c2 = S.addPoint(sk, 40, 10);
  const A = S.addCircle(sk, c1, 10), B = S.addCircle(sk, c2, 5);
  const t = S.tryConstraints(sk, params, [{ id: "__t0", type: "concentric", refs: [A, B] }]);
  ok(t.ok && near(t.sk.points[c1].x, 0, 1e-6) && near(t.sk.points[c2].x, 0, 1e-6) && near(t.sk.curves[A].r, 10, 1e-6) && near(t.sk.curves[B].r, 5, 1e-6), "concentric moves only the second circle, radii kept");
}
{
  const sk = S.newSketch();
  const ax1 = S.addPoint(sk, 0, -50), ax2 = S.addPoint(sk, 0, 50); const ax = S.addLine(sk, ax1, ax2, true);
  const a1 = S.addPoint(sk, -30, -20), a2 = S.addPoint(sk, -20, 20); S.addLine(sk, a1, a2);
  const b1 = S.addPoint(sk, 50, -10), b2 = S.addPoint(sk, 30, 30); S.addLine(sk, b1, b2);
  const t = S.tryConstraints(sk, params, [{ id: "__t0", type: "symmetric", refs: [a1, b1, ax] }, { id: "__t1", type: "symmetric", refs: [a2, b2, ax] }]);
  const P = (id) => [t.sk.points[id].x, t.sk.points[id].y];
  ok(t.ok && near(P(ax1)[0], 0, 1e-6) && near(P(ax2)[0], 0, 1e-6) && near(P(a1)[0], -30, 1e-6) && near(P(a1)[1], -20, 1e-6), "symmetry keeps the axis and the first line");
  ok(t.ok && near(P(b1)[0], 30, 1e-6) && near(P(b1)[1], -20, 1e-6) && near(P(b2)[0], 20, 1e-6) && near(P(b2)[1], 20, 1e-6), "symmetry mirrors the second line");
}
{
  const sk = S.newSketch();
  const v = S.addPoint(sk, 10, 10), e1 = S.addPoint(sk, 60, 10), e2 = S.addPoint(sk, 40, 50);
  const L1 = S.addLine(sk, v, e1), L2 = S.addLine(sk, v, e2);
  const t = S.tryConstraints(sk, params, [{ id: "__t0", type: "angle", refs: [L1, L2], expr: "90 deg" }]);
  const P = (id) => [t.sk.points[id].x, t.sk.points[id].y];
  ok(t.ok && near(P(v)[0], 10, 1e-6) && near(P(v)[1], 10, 1e-6) && near(P(e1)[0], 60, 1e-6), "angle dimension keeps the shared vertex and the first line");
  ok(t.ok && near(Math.hypot(P(e2)[0] - 10, P(e2)[1] - 10), 50, 1e-4) && near(P(e2)[0], 10, 1e-4), "angle dimension rotates the second line about the vertex (length kept)");
}
{
  // a radius dimension still resizes; a circle that cannot move still grows to reach a fixed line
  const sk = S.newSketch();
  const c = S.addPoint(sk, 0, 0); const ci = S.addCircle(sk, c, 10);
  const k = S.addConstraint(sk, "diameter", [ci], { expr: "20" });
  S.solve(sk, params);
  k.expr = "30";
  const st = S.solve(sk, params);
  ok(st.ok && near(sk.curves[ci].r, 15, 1e-6) && near(sk.points[c].x, 0, 1e-6), "diameter edit resizes in place");
  const sk2 = S.newSketch();
  const q1 = S.addPoint(sk2, -50, 30), q2 = S.addPoint(sk2, 50, 30); const ln = S.addLine(sk2, q1, q2);
  S.addConstraint(sk2, "fix", [ln]);
  const ci2 = S.addCircle(sk2, "o", 10);
  const t2 = S.tryConstraints(sk2, params, [{ id: "__t0", type: "tangent", refs: [ln, ci2] }]);
  ok(t2.ok && near(t2.sk.curves[ci2].r, 30, 1e-6), "tangent to a fixed line from a fixed centre falls back to resizing");
}

// performance: many independent shapes (degrees-of-freedom analysis runs per block)
{
  const sk = S.newSketch();
  for (let i = 0; i < 30; i++) { const r = S.addRectCorners(sk, [[i * 30, 0], [i * 30 + 20, 0], [i * 30 + 20, 10], [i * 30, 10]]); S.addConstraint(sk, "distance", [r.lines[0]], { expr: "20" }); }
  const t = performance.now();
  const st = S.solve(sk, params);
  const ms = performance.now() - t;
  ok(st.ok && st.nullity === 30 * 3 && ms < 1500, `30 rectangles solve + DOF in ${ms.toFixed(0)} ms (nullity ${st.nullity})`);
}

console.log(fails ? `${fails} FAILED` : "ALL PASS");
if (fails) process.exitCode = 1;
