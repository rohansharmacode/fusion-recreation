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

// ---------- curvature handles ----------
{
  // one-sided signed curvature of span j of a fit at its start (end = false) or end
  const sideK = (f, j, end) => {
    const [p0, c1, c2, p3] = f.spans[j], h = f.h[j];
    const D = end ? [6 * (p3[0] - 2 * c2[0] + c1[0]) / (h * h), 6 * (p3[1] - 2 * c2[1] + c1[1]) / (h * h)] : [6 * (p0[0] - 2 * c1[0] + c2[0]) / (h * h), 6 * (p0[1] - 2 * c1[1] + c2[1]) / (h * h)];
    const m = end ? [3 * (p3[0] - c2[0]) / h, 3 * (p3[1] - c2[1]) / h] : [3 * (c1[0] - p0[0]) / h, 3 * (c1[1] - p0[1]) / h];
    const l = Math.hypot(m[0], m[1]);
    return (m[0] * D[1] - m[1] * D[0]) / (l * l * l);
  };
  const make = (pts, k, closed = false) => {
    const sk = S.newSketch();
    const ids = pts.map((q) => S.addPoint(sk, q[0], q[1]));
    const sp = S.addSpline(sk, ids, closed);
    if (closed) sk.curves[sp].closed = true;
    const f0 = S.splineOf(sk, sp);
    const a = pts[k], m = f0.m[k], sp0 = Math.hypot(m[0], m[1]);
    const q = S.addPoint(sk, a[0] + m[0] / sp0 * 4, a[1] + m[1] / sp0 * 4);
    const hl = S.addLine(sk, ids[k], q, true);
    sk.curves[sp].hd = { [k]: hl };
    sk.curves[sp].hs = { [k]: sp0 / 4 };
    return { sk, sp, ids, q, hl, f0 };
  };
  const pts = [[0, 0], [10, 5], [20, 0], [30, 5], [40, 0]];
  const { sk, sp, q, hl, f0 } = make(pts, 2);
  const K0 = S.fitCurvatureAt(f0, 2);
  const a = pts[2], qq = [sk.points[q].x, sk.points[q].y];
  const r0 = S.curvatureHandlePoint(a, qq, K0);
  const rp = S.addPoint(sk, r0[0], r0[1]);
  const cl = S.addLine(sk, q, rp, true);
  sk.curves[sp].hk = { 2: cl };
  const Kh = S.handleCurvatures(sk, sk.curves[sp]);
  check("curvature handle placed for the current curvature reads it back", Kh && near(Kh[2], K0, 1e-9), Kh ? `${Kh[2].toFixed(5)} vs ${K0.toFixed(5)}` : "");
  const f1 = S.splineOf(sk, sp);
  let dmax = 0;
  for (let j = 0; j < f1.spans.length; j++) for (let c = 0; c < 4; c++) dmax = Math.max(dmax, Math.hypot(f1.spans[j][c][0] - f0.spans[j][c][0], f1.spans[j][c][1] - f0.spans[j][c][1]));
  check("activating a curvature handle keeps the spline's shape", dmax < 1e-6, dmax.toExponential(2));
  // drag the curvature handle sideways: the curvature at the fit point follows on both sides (G2)
  const t = [(qq[0] - a[0]) / 4, (qq[1] - a[1]) / 4];
  sk.points[rp].x = a[0] + t[0] * 6 - t[1] * 1.5; sk.points[rp].y = a[1] + t[1] * 6 + t[0] * 1.5;
  const K1 = S.handleCurvatures(sk, sk.curves[sp])[2];
  const f2 = S.splineOf(sk, sp);
  const kL = sideK(f2, 1, true), kR = sideK(f2, 2, false);
  check("curvature handle: K = 2 d / s^2 of the parabola point", near(K1, (2 * 1.5) / 36, 1e-9), K1.toFixed(5));
  check("curvature handle sets the curvature on both sides of the fit point", near(kL, K1, 1e-6) && near(kR, K1, 1e-6), `${kL.toFixed(5)} ${kR.toFixed(5)} ${K1.toFixed(5)}`);
  const d = f2.m[2];
  check("the tangent handle direction is kept", near(Math.atan2(d[1], d[0]), Math.atan2(t[1], t[0]), 1e-9));
  check("the spline still passes through every fit point", f2.spans.length === 4 && pts.every((p, i) => { const s = f2.spans[Math.min(i, 3)][i === 4 ? 3 : 0]; return near(s[0], p[0], 1e-9) && near(s[1], p[1], 1e-9); }));
  check("C1 at the other fit points", [1, 3].every((i) => { const e = f2.spans[i - 1], b = f2.spans[i]; const u = [e[3][0] - e[2][0], e[3][1] - e[2][1]], v = [b[1][0] - b[0][0], b[1][1] - b[0][1]]; return Math.abs(u[0] * v[1] - u[1] * v[0]) < 1e-9 * Math.hypot(...u) * Math.hypot(...v) + 1e-12; }));
  // the profile still closes, and removing the tangent handle takes the curvature handle with it
  const lo1 = S.addPoint(sk, 40, -20), lo0 = S.addPoint(sk, 0, -20);
  S.addLine(sk, sk.curves[sp].pts[4], lo1); S.addLine(sk, lo1, lo0); S.addLine(sk, lo0, sk.curves[sp].pts[0]);
  check("spline with a curvature handle still closes a profile", regs(sk).length === 1, String(regs(sk).length));
  S.removeEntities(sk, [hl]);
  check("deleting the tangent handle removes the curvature handle", !sk.curves[cl] && !sk.curves[sp].hk[2] && !sk.points[rp]);
  // neighbouring handles share a cubic span: their speeds are solved so both curvatures hold (C1 kept)
  {
    const q = [[0, 0], [10, 5], [20, 0], [30, 5], [40, 0]];
    const n2 = make(q, 1);
    const hd = { ...n2.sk.curves[n2.sp].hd }, hs = { ...n2.sk.curves[n2.sp].hs }, hk = {};
    const f0n = n2.f0;
    for (const [k, Kw] of [[1, -0.1], [2, 0.1], [3, -0.1]]) {
      if (!hd[k]) { const a2 = q[k], m2 = f0n.m[k], l2 = Math.hypot(...m2); const qq2 = S.addPoint(n2.sk, a2[0] + m2[0] / l2 * 4, a2[1] + m2[1] / l2 * 4); hd[k] = S.addLine(n2.sk, n2.ids[k], qq2, true); hs[k] = l2 / 4; }
      const l = n2.sk.curves[hd[k]], qid = l.p1 === n2.ids[k] ? l.p2 : l.p1;
      const r = S.curvatureHandlePoint(q[k], [n2.sk.points[qid].x, n2.sk.points[qid].y], Kw);
      hk[k] = S.addLine(n2.sk, qid, S.addPoint(n2.sk, r[0], r[1]), true);
    }
    Object.assign(n2.sk.curves[n2.sp], { hd, hs, hk });
    const fn = S.splineOf(n2.sk, n2.sp);
    const ok = [[1, -0.1], [2, 0.1], [3, -0.1]].every(([k, Kw]) => near(sideK(fn, k - 1, true), Kw, 1e-6) && near(sideK(fn, k, false), Kw, 1e-6));
    const c1 = fn.spans.every((s2, j) => j === 0 || [0, 1].every((c) => near((s2[1][c] - s2[0][c]) / fn.h[j], (fn.spans[j - 1][3][c] - fn.spans[j - 1][2][c]) / fn.h[j - 1], 1e-9)));
    check("three neighbouring curvature handles: G2 at each, spline stays C1", ok && c1, [1, 2, 3].map((k) => `${sideK(fn, k - 1, true).toFixed(4)}/${sideK(fn, k, false).toFixed(4)}`).join(" "));
    // G2 at both ends of a 3 point spline is exact (no averaged middle derivative)
    const t3 = S.newSketch();
    const i3 = [[0, 0], [10, 5], [20, 0]].map((p) => S.addPoint(t3, p[0], p[1]));
    const s3 = S.addSpline(t3, i3);
    // arcs of radius 10 meeting the spline at 45 degrees, both bending to the right (curvature -0.1)
    const r2 = 10 / Math.SQRT2;
    const a1 = S.addArc(t3, S.addPoint(t3, r2, -r2), i3[0], S.addPoint(t3, r2 - 10, -r2));
    const a2 = S.addArc(t3, S.addPoint(t3, 20 - r2, -r2), S.addPoint(t3, 30 - r2, -r2), i3[2]);
    S.addConstraint(t3, "smooth", [a1, s3]);
    S.addConstraint(t3, "smooth", [a2, s3]);
    const f3 = S.splineOf(t3, s3);
    const e0 = f3 && sideK(f3, 0, false), e1 = f3 && sideK(f3, 1, true);
    const c13 = f3 && [0, 1].every((c) => near((f3.spans[1][1][c] - f3.spans[1][0][c]) / f3.h[1], (f3.spans[0][3][c] - f3.spans[0][2][c]) / f3.h[0], 1e-9));
    check("3 point spline with G2 at both ends: both end curvatures exact, C1 in the middle", f3 && near(e0, -0.1, 1e-6) && near(e1, -0.1, 1e-6) && c13, f3 ? `${e0.toFixed(5)} ${e1.toFixed(5)} c1=${c13}` : "");
  }
  // closed spline: the loop opens at the handle
  const c = make([[0, 0], [20, 0], [20, 15], [0, 15]], 1, true);
  const ca = [20, 0], cq = [c.sk.points[c.q].x, c.sk.points[c.q].y];
  const ct = [(cq[0] - ca[0]) / 4, (cq[1] - ca[1]) / 4];
  const crp = S.addPoint(c.sk, ca[0] + ct[0] * 5 - ct[1] * 2, ca[1] + ct[1] * 5 + ct[0] * 2);
  c.sk.curves[c.sp].hk = { 1: S.addLine(c.sk, c.q, crp, true) };
  const cK = S.handleCurvatures(c.sk, c.sk.curves[c.sp])[1];
  const cf = S.splineOf(c.sk, c.sp);
  check("closed spline: curvature handle sets G2 at its fit point", cf.closed && cf.spans.length === 4 && near(sideK(cf, 0, true), cK, 1e-6) && near(sideK(cf, 1, false), cK, 1e-6), `${sideK(cf, 0, true).toFixed(5)} ${sideK(cf, 1, false).toFixed(5)} ${cK.toFixed(5)}`);
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
  // open fit point spline: every point of the offset is d from the original
  const ids = [[0, 30], [15, 40], [30, 32], [45, 42]].map((q) => S.addPoint(sk, q[0], q[1]));
  const sp = S.addSpline(sk, ids);
  const os = S.offsetFreeform(sk, sp, 2);
  const g0 = S.curveGeom(sk, sp), g1 = S.curveGeom(sk, os);
  let worst = 0;
  for (let i = 0; i <= 200; i++) {
    const q = g1.at((g1.T * i) / 200);
    let best = Infinity;
    for (let j = 0; j <= 2000; j++) { const p = g0.at((g0.T * j) / 2000); best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1])); }
    worst = Math.max(worst, Math.abs(best - 2));
  }
  check("open spline offset by 2 stays 2 from the spline (within 0.002)", !!os && !sk.curves[os].closed && worst < 0.002, worst.toFixed(4));
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

// ---------- AutoConstrain ----------
{
  const { autoConstrainResults } = await import("../src/sketch/autocon.js");
  const sk = S.newSketch();
  const Q = [[0, 0], [30, 1], [30, 20], [0, 20]].map(([x, y]) => S.addPoint(sk, x, y));
  Q.forEach((p, i) => S.addLine(sk, p, Q[(i + 1) % 4]));
  S.addCircle(sk, S.addPoint(sk, 50, 0), 4);
  const rs = autoConstrainResults(sk, P, { fmt: (v, k) => `${Number(v.toFixed(6))} ${k === "angle" ? "deg" : "mm"}` });
  check("AutoConstrain: every result fully constrains a quad + a circle level with the origin", rs.length >= 1 && rs.every((r) => r.fully), rs.map((r) => r.items.length).join(","));
  check("a point level with the datum gets a horizontal constraint (no 0 mm dimension)", rs[0].items.some((i) => i.type === "horizontal" && i.refs.length === 2) && !rs[0].items.some((i) => /^0\.0+ mm$/.test(i.expr || "")));
  const w = S.cloneSketch(sk);
  for (const it of rs[0].items) { const { kind, late, loc, type, refs, ...rest } = it; void kind; void late; void loc; S.addConstraint(w, type, refs, rest); }
  const st = solve(w);
  check("applied AutoConstrain result solves with no free degrees of freedom", st.ok && st.nullity === 0 && near(w.points[Q[1]].y, 1, 1e-4), `ok=${st.ok} nullity=${st.nullity} y=${w.points[Q[1]].y}`);
}

// ---------- 3-tangent circle picked on the third line ----------
{
  const sk = S.newSketch();
  const A = S.addPoint(sk, -45, -35), B = S.addPoint(sk, -5, -35), C = S.addPoint(sk, -25, -5);
  const l = [S.addLine(sk, A, B), S.addLine(sk, B, C), S.addLine(sk, C, A)];
  const t = S.circleThreeTan(sk, l, [-33.9, -18.4]);
  const rIn = (0.5 * 40 * 30) / ((40 + 2 * Math.hypot(20, 30)) / 2);
  check("3-tangent circle: a pick on the third line at the incircle's touch point gives the incircle", t && near(t.r, rIn, 1e-9), t ? t.r.toFixed(4) : "");
}

console.log(fails ? `\n${fails} FAILED, ${passes} passed` : `\nall ${passes} passed`);
process.exit(fails ? 1 : 0);
