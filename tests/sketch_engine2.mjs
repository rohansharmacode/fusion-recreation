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
