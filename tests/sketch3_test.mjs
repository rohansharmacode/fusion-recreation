// Engine tests for the round-7 sketch additions: control point splines, conics, arc slots,
// tangent circles, Break, Sketch Scale, sketch patterns, Polygon / Curvature constraints, text
// profiles, offset of free-form curves. Run: node tests/sketch3_test.mjs
import * as S from "../src/sketch/sketch.js";
import { ParamTable } from "../src/expr.js";

let fails = 0, passes = 0;
const check = (name, ok, info = "") => { if (ok) passes++; else fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  " + info : ""}`); };
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
const P = new ParamTable();
const pt = (sk, id) => [sk.points[id].x, sk.points[id].y];
const solve = (sk) => S.solve(sk, P);
const regs = (sk) => S.regions(sk).regions;

// ---------- control point spline ----------
{
  const sk = S.newSketch();
  const a = S.addPoint(sk, 0, 0), b = S.addPoint(sk, 10, 10), c = S.addPoint(sk, 20, 10), d = S.addPoint(sk, 30, 0);
  const s = S.addCVSpline(sk, [a, b, c, d], { degree: 3 });
  S.addLine(sk, d, a);
  const g = S.cvsplineGeomFrom([[0, 0], [10, 10], [20, 10], [30, 0]], 3, false);
  check("cubic CV spline with 4 control points is one Bezier span", g.T === 1 && near(g.at(0)[0], 0, 1e-12) && near(g.at(1)[0], 30, 1e-12));
  const r = regs(sk);
  // area of a cubic Bezier over its chord: 3/20 * (2*10 + 2*10 ... ) -> exact value 3/10*30*10 * ... compare with sampling
  let A = 0; const N = 2000; let prev = g.at(0);
  for (let i = 1; i <= N; i++) { const q = g.at(i / N); A += prev[0] * q[1] - q[0] * prev[1]; prev = q; }
  A = Math.abs(A / 2);
  check("CV spline + line closes a profile", r.length === 1 && near(Math.abs(r[0].area), A, 1e-3), r.length ? `${r[0].area.toFixed(3)} vs ${A.toFixed(3)}` : "none");
  const st = solve(sk);
  check("CV spline sketch solves", st.ok);
  const g5 = S.cvsplineGeomFrom([[0, 0], [5, 8], [10, 10], [15, 10], [20, 8], [25, 0]], 5, false);
  check("degree 5 CV spline ends on its first / last control point", g5 && near(g5.at(0)[0], 0, 1e-9) && near(g5.at(g5.T)[0], 25, 1e-9) && near(g5.at(g5.T)[1], 0, 1e-9));
  // the cubic pieces of a quintic join with matching derivatives (in the kernel's knot spacing)
  let worst = 0;
  for (let i = 0; i + 1 < g5.spans.length; i++) {
    const e = g5.spans[i], f = g5.spans[i + 1], h0 = g5.fit.h[i], h1 = g5.fit.h[i + 1];
    const d0 = [(e[3][0] - e[2][0]) / h0, (e[3][1] - e[2][1]) / h0], d1 = [(f[1][0] - f[0][0]) / h1, (f[1][1] - f[0][1]) / h1];
    worst = Math.max(worst, Math.hypot(d0[0] - d1[0], d0[1] - d1[1]));
  }
  check("degree 5 CV spline pieces are C1 in the kernel parametrisation", worst < 1e-9, worst.toExponential(2));
  // closed
  const sk2 = S.newSketch();
  const ids = [[0, 0], [20, 0], [20, 20], [0, 20]].map((q) => S.addPoint(sk2, q[0], q[1]));
  S.addCVSpline(sk2, ids, { degree: 3, closed: true });
  const r2 = regs(sk2);
  check("closed CV spline is a profile", r2.length === 1 && r2[0].area > 50 && r2[0].area < 400, r2.length ? r2[0].area.toFixed(2) : "none");
  // drag a control point through the solver
  const ok = S.dragSolve(sk, P, [{ ref: b, x: 12, y: 14 }]);
  check("dragging a control point moves it", ok && near(sk.points[b].x, 12, 1e-6));
  // break the spline where a vertical line crosses it
  const v1 = S.addPoint(sk, 15, -5), v2 = S.addPoint(sk, 15, 20);
  S.addLine(sk, v1, v2);
  const before = Object.values(sk.curves).filter((c) => c.type === "cvspline").length;
  const res = S.breakAt(S, sk, s, [5, 4]);
  const cvs = Object.values(sk.curves).filter((c) => c.type === "cvspline");
  check("Break splits the CV spline at the crossing line", res && res.length === 2 && cvs.length === before + 1, res ? res.join(",") : "null");
  const gA = S.cvsplineGeomFrom(cvs[0].pts.map((q) => pt(sk, q)), 3, false, null, cvs[0].knots);
  const gB = S.cvsplineGeomFrom(cvs[1].pts.map((q) => pt(sk, q)), 3, false, null, cvs[1].knots);
  check("the pieces meet at the crossing (x = 15)", gA && gB && near(gA.at(gA.T)[0], 15, 1e-6) && near(gB.at(0)[0], 15, 1e-6), gA && gB ? `${gA.at(gA.T)[0].toFixed(6)} ${gB.at(0)[0].toFixed(6)}` : "");
}

// ---------- conic ----------
{
  const sk = S.newSketch();
  const a = S.addPoint(sk, 0, 0), b = S.addPoint(sk, 10, 0), v = S.addPoint(sk, 5, 10);
  S.addConic(sk, a, b, v, 0.5);
  S.addLine(sk, a, b);
  const r = regs(sk);
  check("parabola (rho 0.5) + chord: area 2/3 * 10 * 5", r.length === 1 && near(Math.abs(r[0].area), (2 / 3) * 10 * 5, 1e-3), r.length ? Math.abs(r[0].area).toFixed(4) : "none");
  const g = S.conicGeomFrom([0, 0], [5, 10], [10, 0], 0.5);
  check("conic shoulder point at rho of the way from chord midpoint to vertex", near(g.at(g.T / 2)[1], 5, 1e-9));
  const pieces = S.splitConic([0, 0], [5, 10], [10, 0], 0.5, 0.5);
  const g1 = S.conicGeomFrom(pieces[0].A, pieces[0].V, pieces[0].B, pieces[0].rho);
  check("split conic piece lies on the original", g1 && near(g1.at(g1.T / 2)[1], g.at(g.T / 4)[1], 1e-9));
  check("conic sketch solves", solve(sk).ok);
}

// ---------- arc slot ----------
{
  const sk = S.newSketch();
  const res = S.addArcSlot(sk, [0, 0], 20, 0, Math.PI / 2, 6);
  const st = solve(sk);
  const r = regs(sk);
  const expected = (Math.PI / 2) * ((23 ** 2 - 17 ** 2) / 2) + Math.PI * 9;
  check("arc slot solves and is one profile", st.ok && r.length === 1, `regions ${r.length}`);
  check("arc slot area = ring sector + two half-discs", r.length === 1 && near(Math.abs(r[0].area), expected, 1e-3), r.length ? `${Math.abs(r[0].area).toFixed(3)} vs ${expected.toFixed(3)}` : "");
  check("arc slot has a construction centre arc", sk.curves[res.axis].cons === true);
}

// ---------- tangent circles ----------
{
  const sk = S.newSketch();
  const l1 = S.addLine(sk, S.addPoint(sk, 0, 0), S.addPoint(sk, 30, 0));
  const l2 = S.addLine(sk, S.addPoint(sk, 0, 0), S.addPoint(sk, 0, 30));
  const c = S.circleTanTan(sk, l1, l2, 5, [6, 6]);
  check("2-tangent circle in the quadrant of the cursor", near(c.c[0], 5, 1e-9) && near(c.c[1], 5, 1e-9));
  const l3 = S.addLine(sk, S.addPoint(sk, 30, 0), S.addPoint(sk, 0, 30));
  const t = S.circleThreeTan(sk, [l1, l2, l3], [8, 8]);
  const rin = (30 + 30 - Math.hypot(30, 30)) / 2;
  check("3-tangent circle: incircle of the triangle", t && near(t.r, rin, 1e-9) && near(t.c[0], rin, 1e-9), t ? t.r.toFixed(4) : "");
  const ic = S.addPoint(sk, t.c[0], t.c[1]);
  const cid = S.addCircle(sk, ic, t.r);
  for (const l of [l1, l2, l3]) S.addConstraint(sk, "tangent", [l, cid]);
  check("tangent constraints hold", solve(sk).ok);
}

// ---------- sketch patterns ----------
{
  const sk = S.newSketch();
  const c0 = S.addPoint(sk, 0, 0);
  const circ = S.addCircle(sk, c0, 2);
  const pat = S.addPattern(sk, { type: "rpattern", src: [circ], q1: "3", d1: "20 mm", q2: "2", d2: "10 mm", distType: "extent", dir1: { ang: 0 }, dir2: null }, P);
  check("rectangular pattern 3 x 2 makes 5 copies", pat.copies.length === 5, `${pat.copies.length}`);
  const st = solve(sk);
  const centers = pat.copies.map((id) => pt(sk, sk.curves[id].c));
  check("copies sit on the 10 mm grid", st.ok && centers.some((q) => near(q[0], 20, 1e-6) && near(q[1], 10, 1e-6)), JSON.stringify(centers.map((q) => q.map((v) => +v.toFixed(3)))));
  S.dragSolve(sk, P, [{ ref: c0, x: 5, y: 5 }]);
  const moved = pat.copies.map((id) => pt(sk, sk.curves[id].c));
  check("copies follow the dragged source", moved.some((q) => near(q[0], 25, 1e-4) && near(q[1], 15, 1e-4)));
  sk.curves[circ].r = 3;
  solve(sk);
  check("copies keep the source radius", near(Math.abs(sk.curves[pat.copies[0]].r), 3, 1e-6), String(sk.curves[pat.copies[0]].r));
  // edit: 4 x 1 spacing 7
  Object.assign(pat, { q1: "4", q2: "1", d1: "7 mm", distType: "spacing" });
  S.buildPattern(sk, pat, P);
  check("edit pattern rebuilds the copies", pat.copies.length === 3 && Object.values(sk.curves).filter((c) => c.type === "circle").length === 4);
  solve(sk);
  const xs = pat.copies.map((id) => pt(sk, sk.curves[id].c)[0]).sort((a, b) => a - b);
  check("spacing 7 mm", near(xs[2] - xs[1], 7, 1e-6), xs.map((v) => v.toFixed(3)).join(","));
  // circular
  const sk2 = S.newSketch();
  const cc = S.addPoint(sk2, 0, 0);
  const l = S.addLine(sk2, S.addPoint(sk2, 10, 0), S.addPoint(sk2, 15, 0));
  S.addSketchPoint(sk2, cc);
  const cp = S.addPattern(sk2, { type: "cpattern", src: [l], center: cc, q: "4", angle: "360 deg", angType: "full" }, P);
  const st2 = solve(sk2);
  const ends = cp.copies.map((id) => pt(sk2, sk2.curves[id].p1));
  check("circular pattern 4 x 90 deg", st2.ok && cp.copies.length === 3 && ends.some((q) => near(q[0], 0, 1e-6) && near(q[1], 10, 1e-6)), JSON.stringify(ends.map((q) => q.map((v) => +v.toFixed(3)))));
  S.removePattern(sk2, cp.id);
  check("remove pattern deletes the copies", Object.values(sk2.curves).filter((c) => c.type === "line").length === 1);
}

// ---------- polygon constraint ----------
{
  const sk = S.newSketch();
  const res = S.addPolygon(sk, [0, 0], [10, 0], 6, "inscribed");
  // drop the construction circle and equal constraints: the Polygon constraint alone keeps it regular
  S.removeEntities(sk, [res.circle]);
  sk.constraints = sk.constraints.filter((c) => c.type !== "equal");
  const lp = S.polygonLoop(sk, res.lines);
  check("regular hexagon accepted by the Polygon constraint", !lp.error && lp.loop.length === 6, lp.error || "");
  S.addConstraint(sk, "polygon", [...res.lines], { loop: lp.loop, turn: lp.turn });
  S.addConstraint(sk, "distance", [res.lines[0]], { expr: "8 mm" });
  const st = solve(sk);
  const L = (id) => Math.hypot(sk.points[sk.curves[id].p1].x - sk.points[sk.curves[id].p2].x, sk.points[sk.curves[id].p1].y - sk.points[sk.curves[id].p2].y);
  check("dimensioning one side resizes the whole polygon", st.ok && res.lines.every((id) => near(L(id), 8, 1e-5)), res.lines.map((id) => L(id).toFixed(4)).join(","));
  const sk2 = S.newSketch();
  const r2 = S.addRect2pt(sk2, [0, 0], [10, 5]);
  check("a non-square rectangle is refused", !!S.polygonLoop(sk2, r2.lines).error);
}

// ---------- curvature (G2) ----------
{
  const sk = S.newSketch();
  const a = S.addPoint(sk, -20, 0), j = S.addPoint(sk, 0, 0);
  const line = S.addLine(sk, a, j);
  const q1 = S.addPoint(sk, 10, 6), q2 = S.addPoint(sk, 20, 2);
  const sp = S.addSpline(sk, [j, q1, q2]);
  S.addConstraint(sk, "smooth", [line, sp]);
  const k = S.curvatureToward(sk, sp, j);
  check("fit point spline G2 to a line: zero curvature at the join", k !== null && Math.abs(k) < 1e-4, String(k));
  const t = S.outwardTangent(sk, sp, j);
  check("and tangent to it", t && near(t[0], -1, 1e-6));
  // arc
  const sk2 = S.newSketch();
  const c = S.addPoint(sk2, 0, -10), p1 = S.addPoint(sk2, 10, -10), p2 = S.addPoint(sk2, 0, 0);
  const arc = S.addArc(sk2, c, p1, p2);
  const s1 = S.addPoint(sk2, -10, 3), s2 = S.addPoint(sk2, -20, 0);
  const sp2 = S.addSpline(sk2, [p2, s1, s2]);
  S.addConstraint(sk2, "smooth", [arc, sp2]);
  const k2 = S.curvatureToward(sk2, sp2, p2);
  check("fit point spline G2 to an arc of radius 10: curvature 1/10", k2 !== null && near(Math.abs(k2), 0.1, 1e-4), String(k2));
  // control point spline G2 to a line through the solver
  const sk3 = S.newSketch();
  const A = S.addPoint(sk3, -20, 0), J = S.addPoint(sk3, 0, 0, {});
  const ln = S.addLine(sk3, A, J);
  S.addConstraint(sk3, "fix", [ln]);
  const c1 = S.addPoint(sk3, 6, 2), c2 = S.addPoint(sk3, 12, 6), c3 = S.addPoint(sk3, 20, 10);
  const cv = S.addCVSpline(sk3, [J, c1, c2, c3], { degree: 3 });
  S.addConstraint(sk3, "smooth", [ln, cv]);
  const st3 = solve(sk3);
  const k3 = S.curvatureToward(sk3, cv, J);
  check("CV spline G2 to a line through the solver", st3.ok && Math.abs(k3) < 1e-4 && Math.abs(sk3.points[c1].y) < 1e-5, `k=${k3} c1.y=${sk3.points[c1].y}`);
}

// ---------- tangent handles ----------
{
  const sk = S.newSketch();
  const ids = [[0, 0], [10, 5], [20, 0]].map((q) => S.addPoint(sk, q[0], q[1]));
  const sp = S.addSpline(sk, ids);
  const h = S.addPoint(sk, 15, 5);
  const hl = S.addLine(sk, ids[1], h, true);
  sk.curves[sp].hd = { 1: hl };
  sk.curves[sp].hs = { 1: 0.2 };
  const f = S.splineGeom(S.splineFit([[0, 0], [10, 5], [20, 0]], { fixed: { 1: [1, 0] } }));
  const d = f.der(1);
  check("a tangent handle sets the derivative at its fit point", near(d[1], 0, 1e-9) && d[0] > 0);
  const g = S.regions(sk);
  void g;
  const S1 = S.handleDerivs(sk, sk.curves[sp]);
  check("handle derivative = (handle end - fit point) * scale", S1 && near(S1[1][0], 1, 1e-12) && near(S1[1][1], 0, 1e-12));
}

// ---------- text profiles ----------
{
  const sk = S.newSketch();
  const f = [[0, 0], [40, 0], [40, 20], [0, 20]].map((q) => S.addPoint(sk, q[0], q[1]));
  // one synthetic glyph: a square with a square hole (em units), plus a quadratic curve glyph
  const glyphs = {
    O: { c: [[["M", 0, 0], ["L", 0.6, 0], ["L", 0.6, 0.7], ["L", 0, 0.7], ["L", 0, 0]], [["M", 0.15, 0.15], ["L", 0.15, 0.55], ["L", 0.45, 0.55], ["L", 0.45, 0.15], ["L", 0.15, 0.15]]] },
    D: { c: [[["M", 0, 0], ["L", 0.3, 0], ["Q", 0.6, 0, 0.6, 0.35], ["Q", 0.6, 0.7, 0.3, 0.7], ["L", 0, 0.7], ["L", 0, 0]]] },
  };
  const id = "t1";
  sk.curves[id] = { type: "text", mode: "box", frame: f, text: "OD", size: 10, halign: "left", valign: "bottom", layout: { lines: [{ w: 1.4, g: [[0, "O", 0.7], [0.7, "D", 0.7]] }], asc: 0.75, desc: 0.25 }, glyphs };
  const r = regs(sk).filter((x) => x.text === id);
  check("text glyphs become profiles (O with its hole, D)", r.length === 2 && r.some((x) => x.holes.length === 1), `${r.length} regions`);
  const o = r.find((x) => x.holes.length === 1);
  check("O profile area = outer - hole", o && near(o.area, 10 * 10 * (0.6 * 0.7 - 0.3 * 0.4), 1e-6), o ? o.area.toFixed(4) : "");
  const polys = S.curvePolylines(S, sk, id);
  check("text draws one polyline per contour", polys.length === 3);
  check("text sketch solves (frame points only)", solve(sk).ok);
}

// ---------- sketch scale ----------
{
  const sk = S.newSketch();
  const r = S.addRect2pt(sk, [0, 0], [10, 5]);
  S.addConstraint(sk, "distance", [r.lines[0]], { expr: "10 mm" });
  S.scaleEntities(sk, r.lines, [], [0, 0], 2, P, (v) => `${v.toFixed(2)} mm`);
  const st = solve(sk);
  check("Sketch Scale x2 scales points and driving dimensions", st.ok && near(sk.points[r.points[2]].x, 20, 1e-6) && sk.constraints.find((c) => c.type === "distance").expr === "20.00 mm");
}

// ---------- offset of splines / ellipses ----------
{
  const sk = S.newSketch();
  const e = S.addEllipse(sk, S.addPoint(sk, 0, 0), S.addPoint(sk, 20, 0), S.addPoint(sk, 0, 10), false, { axes: false });
  const o = S.offsetFreeform(sk, e.curve, 2);
  const g = S.curveGeom ? null : null; void g;
  const r = regs(sk);
  check("ellipse offset makes a closed spline (two nested profiles)", !!o && sk.curves[o].closed && r.length === 2, `${r.length}`);
}

// ---------- break a line ----------
{
  const sk = S.newSketch();
  const l1 = S.addLine(sk, S.addPoint(sk, 0, 0), S.addPoint(sk, 30, 0));
  S.addLine(sk, S.addPoint(sk, 10, -5), S.addPoint(sk, 10, 5));
  S.addLine(sk, S.addPoint(sk, 20, -5), S.addPoint(sk, 20, 5));
  const ids = S.breakAt(S, sk, l1, [15, 0]);
  check("Break a line crossed twice -> three pieces", ids && ids.length === 3, ids ? ids.join(",") : "null");
  check("broken pieces solve (collinear)", solve(sk).ok);
}

console.log(fails ? `\n${fails} FAILED, ${passes} passed` : `\nall ${passes} passed`);
process.exit(fails ? 1 : 0);
