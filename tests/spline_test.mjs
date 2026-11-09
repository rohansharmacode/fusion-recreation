// Fit point splines, ellipses / elliptical arcs and blend curves: sketch engine + model.
//   node tests/spline_test.mjs
// Covers: C2 interpolation through the fit points, exact profile areas (closed spline, ellipse,
// spline + line, crossing curves), solver (fit points drag, on-curve, line-ellipse tangency, G1
// blend ends), trim (spline, ellipse -> elliptical arc), mirror, and extrude / revolve volumes and
// the B-spline / gp_Elips conversion through the model evaluator.
import fs from "fs";
import * as K from "../src/kernel.js";
import * as M from "../src/model.js";
import * as S from "../src/sketch/sketch.js";
import { freeformGeom, pcurveNearest, polyArea } from "../src/sketch/curves.js";
import { ParamTable } from "../src/expr.js";

await K.initKernel(fs.readFileSync("node_modules/replicad-opencascadejs/dist/replicad_single.wasm"));
const R = K.R, O = R.getOC();
const params = new ParamTable();

let fails = 0;
const ok = (cond, msg, info) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}${!cond && info !== undefined ? "  " + JSON.stringify(info) : ""}`); if (!cond) fails++; };
const near = (a, b, tol = 1e-6) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const P = (sk, id) => [sk.points[id].x, sk.points[id].y];
const densePolyArea = (g, n = 100000) => { const pts = []; for (let i = 0; i < n; i++) pts.push(g.at((g.T * i) / n)); return Math.abs(polyArea(pts)); };
/** exact volume (replicad's default GProp integration is coarse on B-spline faces) */
const volume = (shape) => { const pr = new O.GProp_GProps(); O.BRepGProp.VolumePropertiesGK(shape.wrapped, pr, 1e-10, false, true, false, false, false); const v = pr.Mass(); pr.delete(); return v; };

function evalDoc(sk, build) {
  const doc = M.newDoc("t");
  doc.features.push({ id: "s1", type: "sketch", name: "Sketch1", plane: { ...K.ORIGIN_PLANES.XY }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
  doc.marker = 1;
  const regs = new M.Evaluator().run(doc).state.sketches.get("s1").regions.regions;
  doc.features.push(build(regs));
  for (const f of doc.features) M.assignParams(doc, f);
  doc.marker = 2;
  const r = new M.Evaluator().run(doc);
  const b = r.state.bodies.get("b1");
  return { r, regs, body: b, vol: b ? volume(b.shape) : NaN, ok: Object.values(r.results).every((x) => x.ok), doc };
}
const extrudeOf = (regs, dist = "10 mm", extra = {}) => ({ id: "e1", type: "extrude", name: "Extrude1", profiles: regs.map((g) => ({ sketch: "s1", key: g.key, c: g.centroid })), distance: dist, operation: "new", newBody: "b1", ...extra });

// ---------- spline interpolation ----------
{
  const sk = S.newSketch();
  const pts = [[0, 0], [20, -5], [30, 10], [10, 20]].map((p) => S.addPoint(sk, ...p));
  const id = S.addSpline(sk, pts);
  const g = freeformGeom(sk, id);
  ok(g && g.T === 3, "open spline through 4 fit points has 3 spans");
  ok(pts.every((p, i) => Math.hypot(g.at(i)[0] - sk.points[p].x, g.at(i)[1] - sk.points[p].y) < 1e-12), "the spline passes through every fit point");
  // C2 at an interior fit point: second derivative continuous (finite differences)
  const d2 = (t) => { const e = 1e-4; const a = g.der(t - e), b = g.der(t + e); return [(b[0] - a[0]) / (2 * e), (b[1] - a[1]) / (2 * e)]; };
  const L = (t) => d2(t - 0.01), Rr = (t) => d2(t + 0.01);
  const s1 = g.fit.h[0], s2 = g.fit.h[1];
  const lk = L(1), rk = Rr(1);
  ok(near(lk[0] / s1 / s1, rk[0] / s2 / s2, 0.2) && near(lk[1] / s1 / s1, rk[1] / s2 / s2, 0.2), "curvature is continuous across a fit point (C2 in chord length)");
  const two = S.newSketch();
  const a = S.addPoint(two, 0, 0), b = S.addPoint(two, 10, 5);
  const g2 = freeformGeom(two, S.addSpline(two, [a, b]));
  ok(near(pcurveNearest(g2, [5, 2.5]).d, 0, 1e-9), "a two-point spline is straight");
}

// ---------- exact profile areas ----------
{
  const sk = S.newSketch();
  const pts = [[0, 0], [20, -5], [30, 10], [10, 20], [-5, 10]].map((p) => S.addPoint(sk, ...p));
  const id = S.addSpline(sk, pts, { closed: true });
  const st = S.solve(sk, params);
  const regs = S.regions(sk).regions;
  const exact = densePolyArea(freeformGeom(sk, id));
  ok(st.ok && st.nullity === 10, `closed spline solves; 5 free fit points (nullity ${st.nullity})`);
  ok(regs.length === 1 && near(Math.abs(regs[0].area), exact, 1e-4), `closed spline profile area ${regs[0] && regs[0].area.toFixed(4)} = ${exact.toFixed(4)}`);
}
{
  const sk = S.newSketch();
  const c = S.addPoint(sk, 10, 5), a = S.addPoint(sk, 30, 5), b = S.addPoint(sk, 10, 15);
  const e = S.addEllipse(sk, c, a, b);
  const st = S.solve(sk, params);
  const regs = S.regions(sk).regions;
  ok(st.ok && st.nullity === 5, `ellipse + axis lines: 5 degrees of freedom (nullity ${st.nullity})`);
  ok(e.axes.length === 2 && e.axes.every((l) => sk.curves[l].cons), "the ellipse gets two construction axis lines");
  ok(regs.length === 1 && near(regs[0].area, Math.PI * 200, 1e-9), `ellipse profile area = π·20·10 (${regs[0] && regs[0].area})`);
  // dimension the axes -> fully constrained
  S.addConstraint(sk, "distance", [e.axes[0]], { expr: "50 mm", param: "d1", dimType: "aligned" });
  S.addConstraint(sk, "distance", [e.axes[1]], { expr: "16 mm", param: "d2", dimType: "aligned" });
  S.addConstraint(sk, "horizontal", [e.axes[0]]);
  S.addConstraint(sk, "fix", [c]);
  const st2 = S.solve(sk, params);
  const g = freeformGeom(sk, e.curve);
  ok(st2.ok && st2.fully, "axis lengths + horizontal + fixed centre fully constrain the ellipse");
  ok(near(g.E.r1, 25, 1e-6) && near(g.E.r2, 8, 1e-6), `axis dimensions drive the radii (${g.E.r1.toFixed(4)}, ${g.E.r2.toFixed(4)})`);
  ok(near(S.regions(sk).regions[0].area, Math.PI * 200, 1e-6), "and the profile area follows (π·25·8)");
}
{
  const sk = S.newSketch();
  const p0 = S.addPoint(sk, 0, 0), p1 = S.addPoint(sk, 15, 12), p2 = S.addPoint(sk, 30, 0);
  const sp = S.addSpline(sk, [p0, p1, p2]);
  S.addLine(sk, p2, p0);
  const g = freeformGeom(sk, sp);
  const pts = []; for (let i = 0; i <= 20000; i++) pts.push(g.at((g.T * i) / 20000));
  const exact = Math.abs(polyArea(pts));
  ok(near(Math.abs(S.regions(sk).regions[0].area), exact, 1e-4), "open spline closed by a line: one profile with the exact area");
  const l = S.addLine(sk, S.addPoint(sk, 10, -5), S.addPoint(sk, 10, 20));
  const regs = S.regions(sk).regions;
  ok(regs.length === 2 && near(regs.reduce((s, r) => s + Math.abs(r.area), 0), exact, 1e-4), "a line across it splits the profile in two (areas add up)");
  void l;
}

// ---------- solver ----------
{
  // a point on a spline (on-curve), then drag a fit point: the point stays on the curve
  const sk = S.newSketch();
  const pts = [[0, 0], [20, 10], [40, 0]].map((p) => S.addPoint(sk, ...p));
  const sp = S.addSpline(sk, pts);
  const q = S.addPoint(sk, 10, 9);
  S.addConstraint(sk, "onCurve", [q, sp]);
  S.addSketchPoint(sk, q);
  const st = S.solve(sk, params);
  ok(st.ok && near(pcurveNearest(freeformGeom(sk, sp), P(sk, q)).d, 0, 1e-6), "on-curve: a sketch point lands on the spline");
  const moved = S.dragSolve(sk, params, [{ ref: pts[1], x: 20, y: 25 }]);
  S.solve(sk, params);
  ok(moved && near(sk.points[pts[1]].y, 25, 1e-3), "a fit point drags like any sketch point");
  ok(near(pcurveNearest(freeformGeom(sk, sp), P(sk, q)).d, 0, 1e-5), "the on-curve point follows the reshaped spline");
  const extra = S.addPoint(sk, 50, 5);
  sk.curves[sp].pts.push(extra);
  S.removeEntities(sk, [pts[1]]);
  ok(sk.curves[sp] && sk.curves[sp].pts.length === 3 && !sk.curves[sp].pts.includes(pts[1]), "deleting a fit point takes it out of the spline (the spline stays)");
  ok(S.removeEntities(sk, [sp]) && !sk.points[pts[2]], "deleting the spline removes its fit points");
}
{
  // tangent line - ellipse
  const sk = S.newSketch();
  const c = S.addPoint(sk, 0, 0), a = S.addPoint(sk, 20, 0), b = S.addPoint(sk, 0, 10);
  const e = S.addEllipse(sk, c, a, b);
  S.addConstraint(sk, "fix", [c]); S.addConstraint(sk, "horizontal", [e.axes[0]]);
  const l = S.addLine(sk, S.addPoint(sk, -30, 15), S.addPoint(sk, 30, 18));
  S.addConstraint(sk, "horizontal", [l]);
  const t = S.tryConstraints(sk, params, [{ id: "kt", type: "tangent", refs: [l, e.curve] }]);
  ok(t.ok, "tangent line-ellipse can be applied");
  const y = t.sk && t.sk.points[t.sk.curves[l].p1].y;
  const r2 = t.sk && Math.hypot(...P(t.sk, b));
  ok(t.sk && near(Math.abs(y), r2, 1e-5), `the horizontal line touches the ellipse (y ${y && y.toFixed(5)} = minor radius ${r2 && r2.toFixed(5)})`);
}
{
  // blend curve (G1): two-point spline whose ends follow the two lines
  const sk = S.newSketch();
  const a0 = S.addPoint(sk, 0, 0), a1 = S.addPoint(sk, 10, 0);
  const b0 = S.addPoint(sk, 30, -20), b1 = S.addPoint(sk, 30, -10);
  const la = S.addLine(sk, a0, a1), lb = S.addLine(sk, b0, b1);
  const bl = S.addSpline(sk, [a1, b1]);
  const t = S.tryConstraints(sk, params, [{ id: "t1", type: "tangent", refs: [la, bl] }, { id: "t2", type: "tangent", refs: [lb, bl] }]);
  ok(t.ok, "G1 tangent constraints on a spline end are accepted (not 'redundant')");
  S.addConstraint(sk, "tangent", [la, bl]); S.addConstraint(sk, "tangent", [lb, bl]);
  const g = freeformGeom(sk, bl);
  const u = (v) => { const L = Math.hypot(v[0], v[1]); return [v[0] / L, v[1] / L]; };
  const d0 = u(g.der(0)), d1 = u(g.der(g.T));
  ok(near(d0[0], 1, 1e-9) && near(d0[1], 0, 1e-9), "the blend leaves the first line along it");
  ok(near(d1[0], 0, 1e-9) && near(d1[1], -1, 1e-9), "and arrives along the second line (into it)");
  // rotate the first line: the blend's start tangent follows
  sk.points[a0].y = -5;
  const d0b = u(freeformGeom(sk, bl).der(0));
  ok(near(d0b[0], 10 / Math.hypot(10, 5), 1e-9) && near(d0b[1], 5 / Math.hypot(10, 5), 1e-9), "turning the line turns the blend end with it (G1 kept)");
  ok(S.tangentAt(sk, bl, b1) && near(S.tangentAt(sk, bl, b1)[1], -1, 1e-9), "tangentAt continues a spline past its end");
}

// ---------- trim / mirror ----------
{
  const sk = S.newSketch();
  const c = S.addPoint(sk, 0, 0), a = S.addPoint(sk, 20, 0), b = S.addPoint(sk, 0, 10);
  const e = S.addEllipse(sk, c, a, b);
  const l = S.addLine(sk, S.addPoint(sk, 5, -20), S.addPoint(sk, 5, 20));
  const regs0 = S.regions(sk).regions;
  ok(regs0.length === 2 && near(regs0.reduce((s, r) => s + r.area, 0), Math.PI * 200, 1e-6), "a line across an ellipse: two profiles adding up to the ellipse");
  S.trimAt(sk, e.curve, [20, 0]);
  ok(sk.curves[e.curve].type === "earc", "trimming the ellipse leaves an elliptical arc");
  S.trimAt(sk, l, [5, 15]); S.trimAt(sk, l, [5, -15]);
  const regs = S.regions(sk).regions;
  const big = regs0.reduce((m, r) => (r.area > m ? r.area : m), 0);
  ok(regs.length === 1 && near(regs[0].area, big, 1e-6), `elliptical arc + line: one profile (${regs[0] && regs[0].area.toFixed(4)})`);
  ok(S.solve(sk, params).ok, "the elliptical arc solves (ends stay on the ellipse)");
}
{
  const sk = S.newSketch();
  const pts = [[0, 0], [20, -5], [30, 10], [10, 20], [-5, 10]].map((p) => S.addPoint(sk, ...p));
  const sp = S.addSpline(sk, pts, { closed: true });
  const g0 = freeformGeom(sk, sp);
  const l = S.addLine(sk, S.addPoint(sk, 5, -20), S.addPoint(sk, 5, 30));
  const before = S.regions(sk).regions.map((r) => Math.abs(r.area)).sort((x, y) => x - y);
  S.trimAt(sk, sp, [-5, 10]);
  const cv = sk.curves[sp];
  ok(cv && cv.type === "spline" && !cv.closed, "trimming a closed spline leaves an open spline");
  const g1 = freeformGeom(sk, sp);
  let dev = 0;
  for (let i = 0; i <= 200; i++) dev = Math.max(dev, pcurveNearest(g0, g1.at((g1.T * i) / 200)).d);
  ok(dev < 0.05, `the trimmed spline keeps the original shape (max deviation ${dev.toFixed(4)} mm)`);
  S.trimAt(sk, l, [5, 25]); S.trimAt(sk, l, [5, -15]);
  const after = S.regions(sk).regions.map((r) => Math.abs(r.area));
  ok(after.length === 1 && near(after[0], before[1], 0.5), `remaining spline + line profile (${after[0] && after[0].toFixed(2)} ≈ ${before[1].toFixed(2)})`);
}
{
  const sk = S.newSketch();
  const ax = S.addLine(sk, S.addPoint(sk, 0, -50), S.addPoint(sk, 0, 50), true);
  const pts = [[10, 0], [20, 10], [30, 0]].map((p) => S.addPoint(sk, ...p));
  const sp = S.addSpline(sk, pts);
  const c = S.addPoint(sk, 20, -20), a = S.addPoint(sk, 30, -20), b = S.addPoint(sk, 20, -15);
  const e = S.addEllipse(sk, c, a, b);
  const made = S.mirrorEntities(sk, [sp, e.curve], ax);
  ok(made.length === 2 && sk.curves[made[0]].type === "spline" && sk.curves[made[1]].type === "ellipse", "Mirror copies a spline and an ellipse");
  const gm = freeformGeom(sk, made[0]);
  ok(near(gm.at(1)[0], -20, 1e-9) && near(gm.at(1)[1], 10, 1e-9), "the mirrored spline runs through the mirrored fit points");
  ok(S.solve(sk, params).ok, "mirrored geometry solves (symmetric constraints)");
}

// ---------- model: extrude / revolve ----------
{
  const sk = S.newSketch();
  const c = S.addPoint(sk, 10, 5), a = S.addPoint(sk, 30, 5), b = S.addPoint(sk, 10, 15);
  S.addEllipse(sk, c, a, b);
  const x = evalDoc(sk, (regs) => extrudeOf(regs));
  ok(x.ok && near(x.vol, Math.PI * 200 * 10, 1e-6), `ellipse extrude 10 mm: volume ${x.vol.toFixed(4)} = π·20·10·10`);
  ok(x.body && x.body.shape.faces.length === 3 && x.body.shape.edges.some((ed) => ed.geomType === "ELLIPSE"), "an elliptical cylinder (3 faces, elliptical edges)");
}
{
  // ellipse whose first axis is the minor one, rotated 45 degrees
  const sk = S.newSketch();
  const c = S.addPoint(sk, 0, 0), a = S.addPoint(sk, 5, 5), b = S.addPoint(sk, -10, 10);
  S.addEllipse(sk, c, a, b);
  const x = evalDoc(sk, (regs) => extrudeOf(regs, "4 mm"));
  ok(x.ok && near(x.vol, Math.PI * Math.hypot(5, 5) * Math.hypot(10, 10) * 4, 1e-6), "rotated ellipse with the minor axis first extrudes exactly");
}
{
  const sk = S.newSketch();
  const pts = [[0, 0], [20, -5], [30, 10], [10, 20], [-5, 10]].map((p) => S.addPoint(sk, ...p));
  const sp = S.addSpline(sk, pts, { closed: true });
  const area = densePolyArea(freeformGeom(sk, sp));
  const x = evalDoc(sk, (regs) => extrudeOf(regs));
  ok(x.ok && near(x.vol, area * 10, 1e-3), `closed spline extrude: volume ${x.vol.toFixed(4)} = area × 10 (${(area * 10).toFixed(4)})`);
  ok(x.body && x.body.shape.faces.length === 3 && x.body.shape.edges.filter((ed) => ed.geomType === "BSPLINE_CURVE").length === 2, "one smooth B-spline side face (no seams at the fit points)");
  // reopen from JSON
  const re = new M.Evaluator().run(JSON.parse(JSON.stringify(x.doc)));
  const rb = re.state.bodies.get("b1");
  ok(rb && near(volume(rb.shape), x.vol, 1e-6), "the saved document reopens with the same body");
}
{
  // spline + lines profile split by a line, both extruded, and tapered
  const sk = S.newSketch();
  const p0 = S.addPoint(sk, 0, 0), p1 = S.addPoint(sk, 15, 12), p2 = S.addPoint(sk, 30, 0);
  S.addSpline(sk, [p0, p1, p2]);
  S.addLine(sk, p2, p0);
  S.addLine(sk, S.addPoint(sk, 10, -5), S.addPoint(sk, 10, 20));
  const x = evalDoc(sk, (regs) => extrudeOf(regs.filter((r) => r.area > 0)));
  const tot = x.regs.reduce((s, r) => s + Math.abs(r.area), 0);
  ok(x.ok && near(x.vol, tot * 10, 1e-3), `two spline profiles extrude as one body (${x.vol.toFixed(3)} = ${(tot * 10).toFixed(3)})`);
  const y = evalDoc(JSON.parse(JSON.stringify(sk)), (regs) => extrudeOf([regs[0]], "10 mm", { taper: "3 deg" }));
  ok(y.ok && y.vol > 0 && Math.abs(y.vol - Math.abs(y.regs[0].area) * 10) > 1, `a tapered spline profile extrudes (drawing path, ${y.vol.toFixed(2)} vs untapered ${(Math.abs(y.regs[0].area) * 10).toFixed(2)})`, y.r.results.e1 && y.r.results.e1.error);
}
{
  // revolve an ellipse about the Y axis: Pappus
  const sk = S.newSketch();
  const c = S.addPoint(sk, 30, 0), a = S.addPoint(sk, 40, 0), b = S.addPoint(sk, 30, 5);
  S.addEllipse(sk, c, a, b);
  const x = evalDoc(sk, (regs) => ({ id: "r1", type: "revolve", name: "Revolve1", profiles: [{ sketch: "s1", key: regs[0].key, c: regs[0].centroid }], axis: { kind: "origin", name: "Y" }, revType: "full", angle: "360 deg", operation: "new", newBody: "b1" }));
  ok(x.ok && near(x.vol, 2 * Math.PI * 30 * Math.PI * 50, 1e-4), `revolved ellipse volume ${x.vol.toFixed(3)} (Pappus ${(2 * Math.PI * 30 * Math.PI * 50).toFixed(3)})`);
}
{
  // elliptical arc + line profile through the model
  const sk = S.newSketch();
  const c = S.addPoint(sk, 0, 0), a = S.addPoint(sk, 20, 0), b = S.addPoint(sk, 0, 10);
  const e = S.addEllipse(sk, c, a, b);
  const l = S.addLine(sk, S.addPoint(sk, 5, -20), S.addPoint(sk, 5, 20));
  S.trimAt(sk, e.curve, [20, 0]); S.trimAt(sk, l, [5, 15]); S.trimAt(sk, l, [5, -15]);
  const x = evalDoc(sk, (regs) => extrudeOf(regs));
  ok(x.ok && near(x.vol, Math.abs(x.regs[0].area) * 10, 1e-6), `elliptical arc + line extrude (${x.vol.toFixed(4)})`);
  // the blend: G1 spline closing two lines into a profile
  const sk2 = S.newSketch();
  const q = [[0, 0], [30, 0], [30, 10], [0, 10]].map((p) => S.addPoint(sk2, ...p));
  const l1 = S.addLine(sk2, q[1], q[0]), l2 = S.addLine(sk2, q[0], q[3]), l3 = S.addLine(sk2, q[3], q[2]);
  const bl = S.addSpline(sk2, [q[2], q[1]]);
  S.addConstraint(sk2, "tangent", [l3, bl]); S.addConstraint(sk2, "tangent", [l1, bl]);
  const y = evalDoc(sk2, (regs) => extrudeOf(regs));
  ok(y.ok && y.regs.length === 1 && near(y.vol, Math.abs(y.regs[0].area) * 10, 1e-3) && Math.abs(y.regs[0].area) > 300, `lines + G1 blend curve form a profile that extrudes (${y.vol.toFixed(2)})`);
  void l2;
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exitCode = fails ? 1 : 0;
