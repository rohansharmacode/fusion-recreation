// Parametric robustness of the modelling engine (model.js / kernel.js): editing an upstream feature
// must keep downstream features attached to the same logical geometry, like Fusion.
//   node tests/robust_test.mjs            (add --quick to skip the long memory loop)
//
// Covers: (1) fillet survives a taller extrude, (2) a hole placed on the top face moves up with it,
// (3) sketches on a body face follow the face, (4) shell / draft / press-pull / face-extrude / offset
// plane refs survive size changes, (5) sketch dimension edits keep a fillet on the same edge,
// (6) chamfer likewise, plus legacy refs, cache stability, leak-free kernel ops and wasm memory.
import fs from "fs";
import v8 from "v8";
import vm from "vm";
import * as K from "../src/kernel.js";
import * as M from "../src/model.js";
import * as S from "../src/sketch/sketch.js";

const oc = await K.initKernel(fs.readFileSync("node_modules/replicad-opencascadejs/dist/replicad_single.wasm"));
const R = K.R;
const QUICK = process.argv.includes("--quick");

let failed = 0, passed = 0;
const check = (name, ok, info) => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};
const near = (a, b, tol = 1e-3) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const vol = (r, id = "b1") => { const b = r.state.bodies.get(id); return b ? R.measureVolume(b.shape) : NaN; };
const bbox = (r, id = "b1") => { const b = r.state.bodies.get(id); return b ? K.bboxOf(b.shape) : null; };
const inside = (r, p, id = "b1") => {
  const b = r.state.bodies.get(id);
  if (!b) return false;
  const v = R.makeVertex(p);
  try { return K.shapeDistance(b.shape, v) < 1e-7; } finally { v.delete(); }
};
const okAll = (r) => Object.entries(r.results).filter(([, x]) => !x.ok && !x.rolled && !x.suppressed).map(([k, x]) => `${k}: ${x.error}`);
const FILLET2 = (1 - Math.PI / 4) * 4; // area removed by an r=2 fillet on a 90° edge
const HOLE5x10 = Math.PI * 6.25 * 10 + (Math.PI * 6.25 * (2.5 / Math.tan((59 * Math.PI) / 180))) / 3; // Ø5 x 10 with 118° tip

// ---------- document builders ----------
function baseDoc({ w = 40, h = 20, dims = false } = {}) {
  const doc = M.newDoc("robust");
  const sk = S.newSketch();
  if (dims) {
    const r = S.addRectCorners(sk, [[0, 0], [w, 0], [w, h], [0, h]], { ids: ["o"] });
    S.addConstraint(sk, "distance", [r.lines[0]], { expr: `${w} mm`, param: "d100", dimType: "aligned" });
    S.addConstraint(sk, "distance", [r.lines[1]], { expr: `${h} mm`, param: "d101", dimType: "aligned" });
  } else S.addRect2pt(sk, [0, 0], [w, h]);
  doc.features.push({ id: "s1", type: "sketch", name: "Sketch1", plane: { ...K.ORIGIN_PLANES.XY }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
  doc.marker = 1;
  const r0 = new M.Evaluator().run(doc);
  const reg = r0.state.sketches.get("s1").regions.regions[0];
  doc.features.push({ id: "e1", type: "extrude", name: "Extrude1", profiles: [{ sketch: "s1", key: reg.key, c: [w / 2, h / 2] }], distance: "10 mm", operation: "new", newBody: "b1" });
  doc.marker = 2;
  return doc;
}
function add(doc, f) {
  doc.features.push(f);
  M.assignParams(doc, f);
  doc.marker = doc.features.length;
  return f;
}
function finish(doc) { for (const f of doc.features) M.assignParams(doc, f); return doc; }
const feat = (doc, id) => doc.features.find((f) => f.id === id);
const setDim = (doc, param, expr) => { for (const c of feat(doc, "s1").sk.constraints) if (c.param === param) c.expr = expr; };

// ---------- (1) fillet survives a taller extrude (QA defect 1) ----------
{
  const doc = baseDoc();
  add(doc, { id: "fl", type: "fillet", name: "Fillet1", edges: [{ body: "b1", p: [20, 0, 10] }], radius: "2 mm", tangentChain: true });
  finish(doc);
  const ev = new M.Evaluator();
  let r = ev.run(doc);
  check("(1) fillet r2 on the top front edge computes", !okAll(r).length && near(vol(r), 8000 - FILLET2 * 40), { errors: okAll(r), vol: vol(r) });
  const ref = feat(doc, "fl").edges[0];
  check("(1) first resolve stores a geometric signature on the edge ref", !!ref.sig && ref.sig.t === "LINE" && Array.isArray(ref.sig.f) && ref.sig.f.length === 2, ref);
  const r1 = r;
  r = ev.run(doc);
  check("(1) unchanged document is a full cache hit after enrichment", r.results.fl === r1.results.fl && r.results.e1 === r1.results.e1);
  feat(doc, "e1").distance = "15 mm";
  r = ev.run(doc);
  check("(1) extrude 10 -> 15: fillet still computes", !okAll(r).length, okAll(r));
  check("(1) volume = 40*20*15 - fillet on a 40 mm edge", near(vol(r), 12000 - FILLET2 * 40), vol(r));
  check("(1) fillet moved to the new top edge (z = 15), bottom edge untouched", !inside(r, [20, 0.3, 14.7]) && inside(r, [20, 0.3, 9.7]) && inside(r, [20, 0.3, 0.3]));
  check("(1) edge ref point refreshed onto the moved edge", near(ref.p[2], 15, 1e-6) && near(ref.p[1], 0, 1e-6), ref.p);
  feat(doc, "e1").distance = "10 mm";
  r = ev.run(doc);
  check("(1) and back to 10 mm", !okAll(r).length && near(vol(r), 8000 - FILLET2 * 40), { e: okAll(r), v: vol(r) });
  // reopen: a fresh evaluator on the saved (enriched) JSON
  const saved = JSON.parse(JSON.stringify(doc));
  saved.features.find((f) => f.id === "e1").distance = "25 mm";
  const r2 = new M.Evaluator().run(saved);
  check("(1) saved document reopened and edited (25 mm) keeps the fillet", !okAll(r2).length && near(vol(r2), 40 * 20 * 25 - FILLET2 * 40), { e: okAll(r2), v: vol(r2) });
}

// ---------- (2) hole on the top face follows the face (QA defect 2) ----------
{
  const doc = baseDoc();
  add(doc, { id: "fl", type: "fillet", name: "Fillet1", edges: [{ body: "b1", p: [20, 0, 10] }], radius: "2 mm", tangentChain: true });
  add(doc, { id: "h", type: "hole", name: "Hole1", placement: "face", points: [[24, 11, 10]], normal: [0, 0, 1], faceRef: { body: "b1", p: [24, 11, 10], n: [0, 0, 1] }, diameter: "5 mm", depth: "10 mm", drillPoint: "angle", tipAngle: "118 deg", holeType: "simple", extent: "distance", operation: "cut", flip: false });
  finish(doc);
  const ev = new M.Evaluator();
  let r = ev.run(doc);
  // 10 mm deep from z = 10: the drill tip pokes out of the bottom, only the cylinder is removed
  check("(2) fillet + hole compute", !okAll(r).length && near(vol(r), 8000 - FILLET2 * 40 - Math.PI * 6.25 * 10, 1e-2), { e: okAll(r), v: vol(r) });
  feat(doc, "e1").distance = "15 mm";
  r = ev.run(doc);
  check("(2) extrude 10 -> 15: fillet and hole compute", !okAll(r).length, okAll(r));
  check("(2) hole centre moved onto the new top face (z = 15)", near(feat(doc, "h").points[0][2], 15, 1e-6), feat(doc, "h").points);
  check("(2) hole is open at the top, not a hidden void at z = 10", !inside(r, [24, 11, 14.9]) && !inside(r, [24, 11, 5.5]) && !inside(r, [24, 11, 4.0]) && inside(r, [24, 11, 3.0]) && inside(r, [27, 11, 14.9]));
  check("(2) volume = block - fillet - hole", near(vol(r), 12000 - FILLET2 * 40 - HOLE5x10, 1e-2), vol(r));
  // QA scenario: the core-loop result after the edit
  feat(doc, "e1").distance = "10 mm";
  r = ev.run(doc);
  check("(2) back to 10 mm: hole back at z = 10", !okAll(r).length && near(feat(doc, "h").points[0][2], 10, 1e-6));
  // legacy hole without faceRef: inferred from the face its centre lies on
  const d2 = baseDoc();
  add(d2, { id: "h", type: "hole", name: "Hole1", placement: "face", points: [[20, 10, 10]], normal: [0, 0, 1], diameter: "5 mm", depth: "10 mm", drillPoint: "flat", holeType: "simple", operation: "cut" });
  finish(d2);
  const ev2 = new M.Evaluator();
  ev2.run(d2);
  check("(2) legacy hole (no faceRef) gets one inferred", !!feat(d2, "h").faceRef && feat(d2, "h").faceRef.body === "b1", feat(d2, "h").faceRef);
  feat(d2, "e1").distance = "20 mm";
  r = ev2.run(d2);
  check("(2) legacy hole follows the top face too", !okAll(r).length && near(feat(d2, "h").points[0][2], 20, 1e-6) && near(vol(r), 40 * 20 * 20 - Math.PI * 6.25 * 10, 1e-2), { p: feat(d2, "h").points, v: vol(r) });
}

// ---------- (3) sketch placed on a body face follows the face ----------
{
  const mk = (n) => {
    const doc = baseDoc();
    const p = [20, 10, 10];
    const plane = K.planeFromNormal(p, n);
    const sk = S.newSketch();
    // a 10 x 6 rectangle around the face centre, in sketch coordinates
    const c = K.toLocal(plane, [20, 10, 10]);
    S.addRect2pt(sk, [c[0] - 5, c[1] - 3], [c[0] + 5, c[1] + 3]);
    add(doc, { id: "s2", type: "sketch", name: "Sketch2", plane, planeRef: { kind: "face", body: "b1", p, n, plane: { ...plane } }, sk, visible: true });
    const rr = new M.Evaluator().run(doc);
    const reg = rr.state.sketches.get("s2").regions.regions[0];
    // extrude away from the body (+Z in world)
    add(doc, { id: "e2", type: "extrude", name: "Extrude2", profiles: [{ sketch: "s2", key: reg.key, c }], distance: n[2] > 0 ? "5 mm" : "-5 mm", operation: "join" });
    return finish(doc);
  };
  for (const n of [[0, 0, 1], [0, 0, -1]]) {
    const tag = n[2] > 0 ? "outward" : "flipped";
    const doc = mk(n);
    const ev = new M.Evaluator();
    let r = ev.run(doc);
    check(`(3) ${tag}-normal face sketch + join extrude compute`, !okAll(r).length && near(bbox(r).max[2], 15, 1e-6) && near(vol(r), 8000 + 300, 1e-3), { e: okAll(r), bb: bbox(r), v: vol(r) });
    feat(doc, "e1").distance = "15 mm";
    r = ev.run(doc);
    const st = r.state.sketches.get("s2");
    check(`(3) ${tag}: extrude 10 -> 15 moves the sketch plane to z = 15`, near(st.plane.o[2], 15, 1e-9) && near(V3dot(st.plane.n, n), 1, 1e-12), st.plane);
    check(`(3) ${tag}: boss sits on the moved face (top at z = 20, volume 12000 + 300)`, !okAll(r).length && near(bbox(r).max[2], 20, 1e-6) && near(vol(r), 12300, 1e-3), { e: okAll(r), bb: bbox(r), v: vol(r) });
    check(`(3) ${tag}: feature plane + planeRef updated (derived data)`, near(feat(doc, "s2").plane.o[2], 15, 1e-9) && near(feat(doc, "s2").planeRef.plane.o[2], 15, 1e-9) && near(feat(doc, "s2").planeRef.p[2], 15, 1e-6));
  }
  // lost face: the sketch keeps its last plane with a warning
  const doc = mk([0, 0, 1]);
  const ev = new M.Evaluator();
  ev.run(doc);
  feat(doc, "e1").suppressed = true;
  const r = ev.run(doc);
  check("(3) face gone (extrude suppressed): sketch keeps its plane with a warning", r.results.s2.ok && /face/i.test(r.results.s2.warning || "") && near(r.state.sketches.get("s2").plane.o[2], 10, 1e-9), r.results.s2);
}
function V3dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// ---------- (4) shell / draft / press-pull / extrude-face / offset-plane refs ----------
{
  // shell removing the top face
  let doc = baseDoc();
  add(doc, { id: "sh", type: "shell", name: "Shell1", faces: [{ body: "b1", p: [20, 10, 10], n: [0, 0, 1] }], bodies: [], thickness: "1 mm", direction: "inside" });
  finish(doc);
  let ev = new M.Evaluator();
  let r = ev.run(doc);
  check("(4) shell (top face removed, 1 mm) computes", !okAll(r).length && near(vol(r), 8000 - 38 * 18 * 9, 1e-2), { e: okAll(r), v: vol(r) });
  feat(doc, "e1").distance = "15 mm";
  r = ev.run(doc);
  check("(4) shell survives extrude 10 -> 15 (still open at the new top)", !okAll(r).length && near(vol(r), 12000 - 38 * 18 * 14, 1e-2), { e: okAll(r), v: vol(r) });
  check("(4) shell face ref refreshed to z = 15", near(feat(doc, "sh").faces[0].p[2], 15, 1e-6));

  // shell removing the +X side face, then the sketch width changes 40 -> 60 (face moves sideways)
  doc = baseDoc({ dims: true });
  add(doc, { id: "sh", type: "shell", name: "Shell1", faces: [{ body: "b1", p: [40, 10, 5], n: [1, 0, 0] }], bodies: [], thickness: "1 mm", direction: "inside" });
  finish(doc);
  ev = new M.Evaluator();
  r = ev.run(doc);
  check("(4) shell (+X face removed) computes", !okAll(r).length && near(vol(r), 8000 - 39 * 18 * 8, 1e-2), { e: okAll(r), v: vol(r) });
  setDim(doc, "d100", "60 mm");
  r = ev.run(doc);
  check("(4) shell follows the +X face when the sketch width changes to 60", !okAll(r).length && near(vol(r), 12000 - 59 * 18 * 8, 1e-2), { e: okAll(r), v: vol(r) });

  // draft of the front face about XY
  const draftVol = (hgt) => 0.5 * hgt * hgt * Math.tan((5 * Math.PI) / 180) * 40;
  doc = baseDoc();
  add(doc, { id: "dr", type: "draft", name: "Draft1", faces: [{ body: "b1", p: [20, 0, 5], n: [0, -1, 0] }], plane: { kind: "origin", name: "XY" }, angle: "5 deg" });
  finish(doc);
  ev = new M.Evaluator();
  r = ev.run(doc);
  const dv10 = Math.abs(vol(r) - 8000);
  check("(4) draft 5° of the front face computes", !okAll(r).length && near(dv10, draftVol(10), 1e-2), { e: okAll(r), v: vol(r), want: draftVol(10) });
  feat(doc, "e1").distance = "15 mm";
  r = ev.run(doc);
  check("(4) draft survives extrude 10 -> 15", !okAll(r).length && near(Math.abs(vol(r) - 12000), draftVol(15), 1e-2), { e: okAll(r), v: vol(r), want: draftVol(15) });

  // press-pull / extrude of a body face (join), then the base grows
  doc = baseDoc();
  add(doc, { id: "pp", type: "extrude", name: "Extrude2", faces: [{ body: "b1", p: [20, 10, 10], n: [0, 0, 1] }], profiles: [], distance: "3 mm", operation: "join" });
  finish(doc);
  ev = new M.Evaluator();
  r = ev.run(doc);
  check("(4) press-pull of the top face (+3 mm) computes", !okAll(r).length && near(bbox(r).max[2], 13, 1e-6), { e: okAll(r), bb: bbox(r) });
  feat(doc, "e1").distance = "15 mm";
  r = ev.run(doc);
  check("(4) press-pull survives extrude 10 -> 15 (top at 18)", !okAll(r).length && near(bbox(r).max[2], 18, 1e-6) && near(vol(r), 40 * 20 * 18, 1e-3), { e: okAll(r), bb: bbox(r), v: vol(r) });

  // offset construction plane from the top face + a box on it
  doc = baseDoc();
  const pl = K.planeFromNormal([20, 10, 10], [0, 0, 1]);
  add(doc, { id: "cp", type: "cplane", name: "Plane1", mode: "offset", base: { kind: "face", body: "b1", p: [20, 10, 10], n: [0, 0, 1], plane: { ...pl } }, offset: "5 mm" });
  add(doc, { id: "bx", type: "box", name: "Box1", plane: { kind: "face", body: "b1", p: [20, 10, 10], n: [0, 0, 1], plane: { ...pl } }, center: [20, 10], length: "4 mm", width: "4 mm", height: "2 mm", operation: "join" });
  finish(doc);
  ev = new M.Evaluator();
  r = ev.run(doc);
  check("(4) offset plane + box on the top face compute", !okAll(r).length && near(r.state.planes.get("cp").plane.o[2], 15, 1e-9) && near(bbox(r).max[2], 12, 1e-6), { e: okAll(r) });
  feat(doc, "e1").distance = "15 mm";
  r = ev.run(doc);
  check("(4) offset plane follows the face (z = 20) and the box sits on it (top 17)", !okAll(r).length && near(r.state.planes.get("cp").plane.o[2], 20, 1e-9) && near(bbox(r).max[2], 17, 1e-6), { e: okAll(r), z: r.state.planes.get("cp") && r.state.planes.get("cp").plane.o });
}

// ---------- (5) sketch dimension edit keeps the fillet on the corresponding edge ----------
{
  for (const [tag, p, len0, check0, check1] of [
    ["front edge (along X)", [20, 0, 10], (w) => w, [20, 0.3, 9.7], null],
    ["right edge (along Y)", [40, 10, 10], () => 20, null, [[59.7, 10, 9.7], [39.7, 10, 9.7]]],
  ]) {
    const doc = baseDoc({ dims: true });
    add(doc, { id: "fl", type: "fillet", name: "Fillet1", edges: [{ body: "b1", p }], radius: "2 mm", tangentChain: true });
    finish(doc);
    const ev = new M.Evaluator();
    let r = ev.run(doc);
    check(`(5) fillet on the ${tag} computes`, !okAll(r).length && near(vol(r), 8000 - FILLET2 * len0(40)), { e: okAll(r), v: vol(r) });
    setDim(doc, "d100", "60 mm");
    r = ev.run(doc);
    check(`(5) width 40 -> 60: fillet on the ${tag} still computes`, !okAll(r).length && near(vol(r), 12000 - FILLET2 * len0(60)), { e: okAll(r), v: vol(r) });
    if (check0) check(`(5) ${tag}: rounded along the whole new width`, !inside(r, [55, 0.3, 9.7]) && !inside(r, check0));
    if (check1) check(`(5) ${tag}: fillet moved with the edge to x = 60`, !inside(r, check1[0]) && inside(r, check1[1]));
    setDim(doc, "d101", "30 mm");
    r = ev.run(doc);
    check(`(5) then height 20 -> 30: still computes`, !okAll(r).length && near(vol(r), 60 * 30 * 10 - FILLET2 * (tag.startsWith("front") ? 60 : 30)), { e: okAll(r), v: vol(r) });
  }
}

// ---------- (6) chamfer behaves like fillet ----------
{
  const CH2 = 0.5 * 2 * 2;
  let doc = baseDoc();
  add(doc, { id: "ch", type: "chamfer", name: "Chamfer1", edges: [{ body: "b1", p: [20, 0, 10] }], distance: "2 mm", tangentChain: true });
  finish(doc);
  let ev = new M.Evaluator();
  let r = ev.run(doc);
  check("(6) chamfer 2 mm on the top front edge computes", !okAll(r).length && near(vol(r), 8000 - CH2 * 40), { e: okAll(r), v: vol(r) });
  feat(doc, "e1").distance = "15 mm";
  r = ev.run(doc);
  check("(6) chamfer survives extrude 10 -> 15 (moved to the new top edge)", !okAll(r).length && near(vol(r), 12000 - CH2 * 40) && !inside(r, [20, 0.3, 14.7]) && inside(r, [20, 0.3, 9.7]), { e: okAll(r), v: vol(r) });
  doc = baseDoc({ dims: true });
  add(doc, { id: "ch", type: "chamfer", name: "Chamfer1", edges: [{ body: "b1", p: [40, 10, 10] }], distance: "2 mm", tangentChain: true });
  finish(doc);
  ev = new M.Evaluator();
  ev.run(doc);
  setDim(doc, "d100", "60 mm");
  r = ev.run(doc);
  check("(6) chamfer on the right edge follows a width change 40 -> 60", !okAll(r).length && near(vol(r), 12000 - CH2 * 20) && !inside(r, [59.8, 10, 9.8]) && inside(r, [39.8, 10, 9.8]), { e: okAll(r), v: vol(r) });
}

// ---------- chains: fillet + chamfer on adjacent edges, edit the fillet, then the extrude ----------
{
  const doc = baseDoc();
  add(doc, { id: "fl", type: "fillet", name: "Fillet1", edges: [{ body: "b1", p: [20, 0, 10] }], radius: "2 mm", tangentChain: true });
  add(doc, { id: "ch", type: "chamfer", name: "Chamfer1", edges: [{ body: "b1", p: [40, 10, 10] }], distance: "1 mm", tangentChain: true });
  add(doc, { id: "f2", type: "fillet", name: "Fillet2", edges: [{ body: "b1", p: [0, 10, 0] }], radius: "1 mm", tangentChain: true });
  finish(doc);
  const ev = new M.Evaluator();
  let r = ev.run(doc);
  check("chain: fillet + chamfer + bottom fillet compute", !okAll(r).length, okAll(r));
  const v0 = vol(r);
  feat(doc, "fl").radius = "3 mm";
  r = ev.run(doc);
  check("chain: fillet radius 2 -> 3 keeps the chamfer and the bottom fillet", !okAll(r).length && vol(r) < v0, { e: okAll(r), v: vol(r), v0 });
  feat(doc, "e1").distance = "18 mm";
  r = ev.run(doc);
  check("chain: then extrude 10 -> 18: all three still compute", !okAll(r).length && !inside(r, [40 - 0.2, 10, 18 - 0.2]) && !inside(r, [0.15, 10, 0.15]), okAll(r));
}

// ---------- fillet on the rim of a hole that moves with its face ----------
{
  const doc = baseDoc();
  add(doc, { id: "h", type: "hole", name: "Hole1", placement: "face", points: [[20, 10, 10]], normal: [0, 0, 1], faceRef: { body: "b1", p: [20, 10, 10], n: [0, 0, 1] }, diameter: "6 mm", depth: "6 mm", drillPoint: "flat", holeType: "simple", operation: "cut" });
  add(doc, { id: "fl", type: "fillet", name: "Fillet1", edges: [{ body: "b1", p: [23, 10, 10] }], radius: "0.5 mm", tangentChain: true });
  finish(doc);
  const ev = new M.Evaluator();
  let r = ev.run(doc);
  const v10 = vol(r);
  check("hole rim: fillet on the circular top edge of a hole computes", !okAll(r).length && v10 < 8000 - Math.PI * 9 * 6, { e: okAll(r), v: v10 });
  check("hole rim: the edge signature is a circle r = 3 about Z", feat(doc, "fl").edges[0].sig && feat(doc, "fl").edges[0].sig.t === "CIRCLE" && near(feat(doc, "fl").edges[0].sig.r, 3, 1e-6), feat(doc, "fl").edges[0].sig);
  feat(doc, "e1").distance = "15 mm";
  r = ev.run(doc);
  check("hole rim: after extrude 10 -> 15 the hole and its rim fillet follow the top face", !okAll(r).length && near(vol(r) - v10, 4000, 1e-3) && near(feat(doc, "fl").edges[0].p[2], 15, 1e-6), { e: okAll(r), dv: vol(r) - v10, p: feat(doc, "fl").edges[0].p });
}

// ---------- revolve about a body edge (edge axis ref) ----------
{
  const doc = baseDoc();
  const sk = S.newSketch();
  S.addRect2pt(sk, [0, 0], [5, 5]);
  // sketch on XZ (plane y = 0): u = x, v = -z ... use a plane through the front face
  const plane = { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] };
  add(doc, { id: "s3", type: "sketch", name: "Sketch3", plane, planeRef: { kind: "origin", name: "XZ" }, sk, visible: true });
  const rr = new M.Evaluator().run(doc);
  const reg = rr.state.sketches.get("s3").regions.regions[0];
  add(doc, { id: "rv", type: "revolve", name: "Revolve1", profiles: [{ sketch: "s3", key: reg.key, c: [2.5, 2.5] }], axis: { kind: "edge", body: "b1", p: [20, 0, 10] }, revType: "angle", angle: "90 deg", operation: "new", newBody: "b2" });
  finish(doc);
  const ev = new M.Evaluator();
  let r = ev.run(doc);
  check("revolve about a body edge computes", !okAll(r).length && r.state.bodies.has("b2"), okAll(r));
  feat(doc, "e1").distance = "15 mm";
  r = ev.run(doc);
  const bb2 = bbox(r, "b2");
  check("revolve axis edge re-found after extrude 10 -> 15", !okAll(r).length && !!bb2 && near(feat(doc, "rv").axis.p[2], 15, 1e-6), { e: okAll(r), axis: feat(doc, "rv").axis.p });
}

// ---------- legacy refs and robustness of the matcher ----------
{
  // a ref whose point is slightly off the edge (old picks on mesh polylines) still resolves
  const doc = baseDoc();
  add(doc, { id: "fl", type: "fillet", name: "Fillet1", edges: [{ body: "b1", p: [20, 0.01, 9.99] }], radius: "2 mm" });
  finish(doc);
  const r = new M.Evaluator().run(doc);
  check("legacy: off-edge point ref resolves to the nearest edge and is snapped onto it", !okAll(r).length && near(feat(doc, "fl").edges[0].p[1], 0, 1e-9) && near(feat(doc, "fl").edges[0].p[2], 10, 1e-9), feat(doc, "fl").edges[0]);
  // an edge ref on a body that does not exist still errors cleanly
  const d2 = baseDoc();
  add(d2, { id: "fl", type: "fillet", name: "Fillet1", edges: [{ body: "b9", p: [20, 0, 10] }], radius: "2 mm" });
  finish(d2);
  const r2 = new M.Evaluator().run(d2);
  check("missing body: clean error", r2.results.fl.ok === false && /missing/i.test(r2.results.fl.error), r2.results.fl);
  // stepped body: two +Z faces; a shell ref on the lower step must stay on the lower step
  const d3 = baseDoc();
  const sk = S.newSketch();
  S.addRect2pt(sk, [0, 0], [20, 20]);
  const plane = { o: [0, 0, 10], x: [1, 0, 0], n: [0, 0, 1] };
  add(d3, { id: "s2", type: "sketch", name: "Sketch2", plane, planeRef: { kind: "face", body: "b1", p: [10, 10, 10], n: [0, 0, 1], plane: { ...plane } }, sk, visible: true });
  const reg = new M.Evaluator().run(d3).state.sketches.get("s2").regions.regions[0];
  add(d3, { id: "e2", type: "extrude", name: "Extrude2", profiles: [{ sketch: "s2", key: reg.key, c: [10, 10] }], distance: "10 mm", operation: "join" });
  add(d3, { id: "ch", type: "chamfer", name: "Chamfer1", edges: [{ body: "b1", p: [30, 0, 10] }], distance: "1 mm" });
  finish(d3);
  const ev3 = new M.Evaluator();
  let r3 = ev3.run(d3);
  check("stepped body: chamfer on the lower step's front edge computes", !okAll(r3).length && !inside(r3, [30, 0.2, 9.8]) && inside(r3, [10, 0.2, 9.8]), okAll(r3));
  feat(d3, "e2").distance = "15 mm"; // the step grows: the lower edge does not move
  r3 = ev3.run(d3);
  check("stepped body: growing the upper step keeps the chamfer on the lower edge", !okAll(r3).length && !inside(r3, [30, 0.2, 9.8]) && inside(r3, [10, 0.2, 9.8]) && inside(r3, [10, 0.2, 24.8]), okAll(r3));
}

// ---------- profiles built straight from sketch regions ----------
{
  const P0 = new (await import("../src/expr.js")).ParamTable();
  const ext = (build, sel, dist = 10, taper = 0) => {
    const doc = M.newDoc("p");
    const sk = S.newSketch();
    build(sk);
    S.solve(sk, P0);
    doc.features.push({ id: "s1", type: "sketch", name: "Sketch1", plane: { ...K.ORIGIN_PLANES.XZ }, planeRef: { kind: "origin", name: "XZ" }, sk, visible: true });
    doc.marker = 1;
    const regs = new M.Evaluator().run(doc).state.sketches.get("s1").regions.regions;
    const profiles = sel(regs).map((r) => ({ sketch: "s1", key: r.key, c: r.centroid }));
    add(doc, { id: "e1", type: "extrude", name: "Extrude1", profiles, distance: `${dist} mm`, taper: `${taper} deg`, operation: "new", newBody: "b1" });
    finish(doc);
    return new M.Evaluator().run(doc);
  };
  const lens = 2 * 25 * Math.acos(0.6) - 3 * 8; // two r=5 circles 6 apart
  let r = ext((sk) => { S.addCircle(sk, S.addPoint(sk, 0, 0), 5); S.addCircle(sk, S.addPoint(sk, 6, 0), 5); }, (rs) => rs);
  check("profiles: two overlapping circles (3 regions) extrude as their exact union", !okAll(r).length && near(vol(r), (2 * Math.PI * 25 - lens) * 10, 1e-3), { e: okAll(r), v: vol(r) });
  r = ext((sk) => { S.addCircle(sk, S.addPoint(sk, 0, 0), 5); S.addCircle(sk, S.addPoint(sk, 6, 0), 5); }, (rs) => rs.filter((x) => Math.abs(x.centroid[0] - 3) < 0.5));
  check("profiles: just the lens", !okAll(r).length && near(vol(r), lens * 10, 1e-2), { e: okAll(r), v: vol(r) });
  r = ext((sk) => S.addSlot(sk, [0, 0], [20, 0], 6), (rs) => rs, -7);
  check("profiles: slot (lines + arcs), negative distance", !okAll(r).length && near(vol(r), (20 * 6 + Math.PI * 9) * 7, 1e-3), { e: okAll(r), v: vol(r) });
  r = ext((sk) => { S.addRect2pt(sk, [0, 0], [40, 20]); S.addCircle(sk, S.addPoint(sk, 20, 10), 4); }, (rs) => rs.filter((x) => x.holes.length));
  check("profiles: rectangle with a hole", !okAll(r).length && near(vol(r), (800 - Math.PI * 16) * 10, 1e-3), { e: okAll(r), v: vol(r) });
  r = ext((sk) => { S.addRect2pt(sk, [0, 0], [40, 20]); S.addCircle(sk, S.addPoint(sk, 20, 10), 4); }, (rs) => rs);
  check("profiles: rectangle + the circle inside it = full rectangle", !okAll(r).length && near(vol(r), 8000, 1e-3), { e: okAll(r), v: vol(r) });
  r = ext((sk) => S.addRect2pt(sk, [0, 0], [40, 20]), (rs) => rs, 10, 5);
  const off = 10 * Math.tan((5 * Math.PI) / 180);
  check("profiles: tapered extrude (drawing path) still computes", !okAll(r).length && vol(r) > 7000 && vol(r) < 41.75 * 21.75 * 10 && Math.abs(vol(r) - 8000) > 50 && Math.abs(Math.abs(vol(r) - 8000) / (10 * (60 * off + (4 / 3) * off * off)) - 1) < 0.02, { e: okAll(r), v: vol(r) });
}

// ---------- leak-free kernel operations match replicad ----------
{
  const box = R.makeBox([0, 0, 0], [10, 10, 10]);
  const cyl = R.makeCylinder(3, 20, [5, 5, -5], [0, 0, 1]);
  check("K.cut = box - cylinder", near(R.measureVolume(K.cut(box, cyl)), 1000 - Math.PI * 9 * 10, 1e-6));
  check("K.fuse", near(R.measureVolume(K.fuse(box, cyl)), 1000 + Math.PI * 9 * 10, 1e-6));
  check("K.intersect", near(R.measureVolume(K.intersect(box, cyl)), Math.PI * 9 * 10, 1e-6));
  const es = K.edgesAt(box, [0]);
  check("K.filletEdges = replicad fillet", near(R.measureVolume(K.filletEdges(box, es, 1)), R.measureVolume(box.fillet(1, (e) => e.inList(es))), 1e-6));
  check("K.chamferEdges = replicad chamfer", near(R.measureVolume(K.chamferEdges(box, es, 1)), R.measureVolume(box.chamfer(1, (e) => e.inList(es))), 1e-6));
  check("K.translated / rotated / mirrored", near(K.bboxOf(K.translated(box, [5, 0, 0])).min[0], 5, 1e-9) && near(K.bboxOf(K.rotated(box, 90, [0, 0, 0], [0, 0, 1])).min[0], -10, 1e-6) && near(K.bboxOf(K.mirrored(box, [1, 0, 0], [0, 0, 0])).min[0], -10, 1e-9));
  const order = [...R.iterTopo(box.wrapped, "face")];
  const mine = K.facesOf(box);
  check("K.facesOf keeps replicad's face order", order.length === mine.length && order.every((f, i) => f.IsSame(mine[i].wrapped)));
  const orderE = [...R.iterTopo(box.wrapped, "edge")];
  check("shape.edges (patched) keeps replicad's edge order", orderE.length === box.edges.length && box.edges.every((e, i) => e.wrapped.IsSame(orderE[i])));
  const T = K.topoOf(box);
  check("topology summary of a box: 6 planar faces, 12 lines, 2 faces per edge", T.faces.length === 6 && T.faces.every((f) => f.type === "PLANE") && T.edges.length === 12 && T.edges.every((e) => e.type === "LINE" && e.faces.length === 2));
  // patterns / move / mirror / combine / revolve-sym through the evaluator
  const doc = baseDoc();
  add(doc, { id: "rp", type: "rpattern", name: "Pattern1", bodies: ["b1"], dir1: "X", q1: "3", d1: "50 mm", newBodies: ["b2", "b3"] });
  add(doc, { id: "mv", type: "move", name: "Move1", bodies: ["b3"], tx: "0 mm", ty: "0 mm", tz: "5 mm", rx: "0 deg", ry: "0 deg", rz: "90 deg" });
  add(doc, { id: "mi", type: "mirror", name: "Mirror1", bodies: ["b1"], plane: { kind: "origin", name: "YZ" }, operation: "new", newBodies: ["b4"] });
  add(doc, { id: "cb", type: "combine", name: "Combine1", target: "b1", tools: ["b4"], operation: "join", keepTools: false });
  finish(doc);
  const r = new M.Evaluator().run(doc);
  check("pattern / move / mirror / combine compute", !okAll(r).length && near(vol(r, "b2"), 8000) && near(bbox(r, "b3").min[2], 5, 1e-6) && near(vol(r, "b1"), 16000, 1e-3) && !r.state.bodies.has("b4"), { e: okAll(r), v1: vol(r, "b1") });
}

// ---------- QA r3: shell next to fillets / chamfers / holes, revolve axis ----------
// The L bracket (60x10 + 10x40 legs, 8 mm). OCCT's MakeThickSolid returns its input unchanged when
// the removed face is tangent to a fillet (the shell was "ok" with the volume untouched) and throws
// when hole tubes meet the inner walls; the kernel now checks the result and falls back to a
// boolean shell (eroded body with filled holes, openings, grown holes).
function lBracketDoc({ fillet = false, chamfer = false, holes = [], blind = null } = {}) {
  const doc = M.newDoc("L");
  const sk = S.newSketch();
  const P = [[0, 0], [60, 0], [60, 10], [10, 10], [10, 50], [0, 50]].map((q) => S.addPoint(sk, q[0], q[1]));
  P.forEach((p, i) => S.addLine(sk, p, P[(i + 1) % P.length]));
  doc.features.push({ id: "s1", type: "sketch", name: "Sketch1", plane: { ...K.ORIGIN_PLANES.XY }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
  doc.marker = 1;
  const reg = new M.Evaluator().run(doc).state.sketches.get("s1").regions.regions[0];
  add(doc, { id: "e1", type: "extrude", name: "Extrude1", profiles: [{ sketch: "s1", key: reg.key, c: [5, 5] }], distance: "8 mm", operation: "new", newBody: "b1" });
  if (fillet) add(doc, { id: "fl", type: "fillet", name: "Fillet1", edges: [{ body: "b1", p: [60, 5, 8] }, { body: "b1", p: [5, 50, 8] }], radius: "3 mm", tangentChain: true });
  if (chamfer) add(doc, { id: "ch", type: "chamfer", name: "Chamfer1", edges: [{ body: "b1", p: [30, 0, 8] }], distance: "1 mm", tangentChain: true });
  if (holes.length) {
    const sk2 = S.newSketch();
    for (const [x, y, d] of holes) S.addCircle(sk2, S.addPoint(sk2, x, y), d / 2);
    const pl = { o: [0, 0, 8], x: [1, 0, 0], n: [0, 0, 1] };
    add(doc, { id: "s2", type: "sketch", name: "Sketch2", plane: pl, planeRef: { kind: "face", body: "b1", p: [20, 5, 8], n: [0, 0, 1], plane: pl }, sk: sk2, visible: true });
    const regs = new M.Evaluator().run(doc).state.sketches.get("s2").regions.regions;
    add(doc, { id: "cut", type: "extrude", name: "Extrude2", profiles: regs.map((g) => ({ sketch: "s2", key: g.key })), distance: "10 mm", extent: "all", flip: true, operation: "cut" });
  }
  if (blind) add(doc, { id: "h", type: "hole", name: "Hole1", placement: "face", points: [blind], normal: [0, 0, 1], faceRef: { body: "b1", p: blind, n: [0, 0, 1] }, diameter: "3 mm", depth: "5 mm", drillPoint: "angle", tipAngle: "118 deg", holeType: "simple", operation: "cut" });
  return doc;
}
const shellOf = (doc, t, o = {}) => {
  add(doc, { id: "sh", type: "shell", name: "Shell1", faces: [{ body: "b1", p: o.p || [20, 5, 8], n: o.n || [0, 0, 1] }], bodies: [], thickness: `${t} mm`, direction: o.dir || "inside" });
  return new M.Evaluator().run(finish(doc));
};
{
  let r = shellOf(lBracketDoc(), 2);
  check("r3 shell: plain L bracket, top removed, 2 mm = 4538.85 (unchanged path)", !okAll(r).length && near(vol(r), 4538.85, 0.01), { e: okAll(r), v: vol(r) });
  r = shellOf(lBracketDoc({ fillet: true }), 2);
  check("r3 shell: top face next to two 3 mm fillets hollows the body (7961.37 -> 4526.80)", !okAll(r).length && near(vol(r), 4526.80, 0.02), { e: okAll(r), v: vol(r) });
  check("r3 shell: filleted bracket is open at the top (point below the old top face is outside)", !inside(r, [30, 5, 7]) && inside(r, [30, 1, 7]) && inside(r, [30, 5, 1]));
  r = shellOf(lBracketDoc({ fillet: true }), 1);
  check("r3 shell: filleted bracket at 1 mm computes and loses material", !okAll(r).length && vol(r) > 1000 && vol(r) < 4000, { e: okAll(r), v: vol(r) });
  r = shellOf(lBracketDoc({ fillet: true, chamfer: true }), 2);
  check("r3 shell: fillet + chamfer bracket (7928.28) shells to 4493.70", !okAll(r).length && near(vol(r), 4493.70, 0.02), { e: okAll(r), v: vol(r) });
  r = shellOf(lBracketDoc({ fillet: true }), 2, { dir: "outside" });
  check("r3 shell: outside shell of the filleted bracket computes (walls added outside)", !okAll(r).length && vol(r) > 5000 && !inside(r, [30, 5, 4]), { e: okAll(r), v: vol(r) });
  // hole tubes tangent to the inner walls (r + 2t = half the 10 mm leg) and crossing them
  r = shellOf(lBracketDoc({ holes: [[40, 5, 2], [5, 30, 2]] }), 2);
  check("r3 shell: two Ø2 holes, 2 mm (tubes tangent to the walls) = 4827.88", !okAll(r).length && near(vol(r), 4827.88, 0.05), { e: okAll(r), v: vol(r) });
  check("r3 shell: hole tube kept around the hole, hole stays open", inside(r, [42.5, 5, 6]) && !inside(r, [40, 5, 4]) && !inside(r, [45, 5, 6]));
  r = shellOf(lBracketDoc({ holes: [[40, 5, 6], [5, 30, 6]] }), 1);
  check("r3 shell: two Ø6 holes, default 1 mm = 2761.83", !okAll(r).length && near(vol(r), 2761.83, 0.05), { e: okAll(r), v: vol(r) });
  r = shellOf(lBracketDoc({ holes: [[40, 6, 2]] }), 2);
  check("r3 shell: Ø2 hole at (40,6), 2 mm (tube crosses the wall) = 4664.78", !okAll(r).length && near(vol(r), 4664.78, 0.05), { e: okAll(r), v: vol(r) });
  r = shellOf(lBracketDoc({ holes: [[30, 7, 4], [5, 20, 3]] }), 1.5);
  check("r3 shell: Ø4 + Ø3 holes off-centre, 1.5 mm computes", !okAll(r).length && vol(r) > 3000 && vol(r) < 5000, { e: okAll(r), v: vol(r) });
  r = shellOf(lBracketDoc({ blind: [40, 5, 8] }), 2, { p: [20, 5, 0], n: [0, 0, -1] });
  check("r3 shell: blind drilled hole (cone tip), bottom face removed, computes", !okAll(r).length && vol(r) > 4538.85 && vol(r) < 4800 && inside(r, [42.8, 5, 4.5]), { e: okAll(r), v: vol(r) });
  // a shell that cannot be made must be an error, never an "ok" feature with the body unchanged
  r = shellOf(lBracketDoc(), 6);
  check("r3 shell: 6 mm in a 10 mm leg fails visibly (error, body unchanged)", r.results.sh && r.results.sh.ok === false && /shell failed/i.test(r.results.sh.error) && near(vol(r), 8000, 1e-3), r.results.sh);
}
{
  // revolve about an axis along the profile plane normal: a flat zero-volume "body" before the fix
  const doc = M.newDoc("rev");
  const sk = S.newSketch();
  const P = [[10, 0], [30, 0], [30, 5], [15, 5], [15, 20], [10, 20]].map((q) => S.addPoint(sk, q[0], q[1]));
  P.forEach((p, i) => S.addLine(sk, p, P[(i + 1) % P.length]));
  doc.features.push({ id: "s1", type: "sketch", name: "Sketch1", plane: { ...K.ORIGIN_PLANES.XZ }, planeRef: { kind: "origin", name: "XZ" }, sk, visible: true });
  doc.marker = 1;
  const reg = new M.Evaluator().run(doc).state.sketches.get("s1").regions.regions[0];
  const rv = add(doc, { id: "rv", type: "revolve", name: "Revolve1", profiles: [{ sketch: "s1", key: reg.key }], axis: { kind: "origin", name: "Y" }, revType: "full", angle: "360 deg", operation: "new", newBody: "b1" });
  finish(doc);
  let r = new M.Evaluator().run(doc);
  check("r3 revolve: axis normal to the profile plane is an error, no zero-volume body", r.results.rv.ok === false && /axis must lie in the plane/i.test(r.results.rv.error) && !r.state.bodies.has("b1"), r.results.rv);
  rv.axis = { kind: "origin", name: "Z" };
  r = new M.Evaluator().run(doc);
  const AREA = 20 * 5 + 5 * 15, CX = (20 * 5 * 20 + 5 * 15 * 12.5) / AREA; // Pappus
  check("r3 revolve: same profile about the Z axis (in the plane) = 2π·x̄·A", !okAll(r).length && near(vol(r), 2 * Math.PI * CX * AREA, 0.01), { e: okAll(r), v: vol(r), want: 2 * Math.PI * CX * AREA });
  rv.revType = "angle"; rv.angle = "180 deg";
  r = new M.Evaluator().run(finish(doc));
  check("r3 revolve: 180 deg about Z = half", !okAll(r).length && near(vol(r), Math.PI * CX * AREA, 0.01), { e: okAll(r), v: vol(r) });
}

// ---------- Split Body / Coil / Pipe / Scale / Thread ----------
const vols = (r) => [...r.state.bodies.values()].map((b) => R.measureVolume(b.shape)).sort((a, b) => a - b);
{
  // split the 40 x 20 x 10 block with the YZ plane offset to x = 15 (construction plane) and the XY plane
  const doc = baseDoc();
  add(doc, { id: "cp", type: "cplane", name: "Plane1", mode: "offset", base: { kind: "origin", name: "YZ" }, offset: "15 mm" });
  const sp = add(doc, { id: "sp", type: "split", name: "Split Body1", bodies: ["b1"], tool: { kind: "cplane", id: "cp" }, extend: true });
  finish(doc);
  const ev = new M.Evaluator();
  let r = ev.run(doc);
  const v = vols(r);
  check("split: a construction plane divides Body1 into two bodies (3000 + 5000)", !okAll(r).length && v.length === 2 && near(v[0], 3000) && near(v[1], 5000), { e: okAll(r), v });
  check("split: Body1 keeps the piece on the negative side, the new piece gets its own id", near(vol(r, "b1"), 3000) && r.state.bodies.has("sp_1") && r.results.sp.affected.length === 2, r.results.sp.affected);
  sp.tool = { kind: "origin", name: "XY" };
  r = ev.run(doc);
  check("split: a plane that misses the body is an error", r.results.sp.ok === false && /No intersection/.test(r.results.sp.error), r.results.sp);
  // split an L-shaped body with its own inner face extended (classic Fusion use)
  const d2 = M.newDoc("L");
  const sk = S.newSketch();
  const P = [[0, 0], [60, 0], [60, 10], [10, 10], [10, 50], [0, 50]].map((q) => S.addPoint(sk, q[0], q[1]));
  P.forEach((p, i) => S.addLine(sk, p, P[(i + 1) % P.length]));
  d2.features.push({ id: "s1", type: "sketch", name: "Sketch1", plane: { ...K.ORIGIN_PLANES.XY }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
  d2.marker = 1;
  const reg = new M.Evaluator().run(d2).state.sketches.get("s1").regions.regions[0];
  add(d2, { id: "e1", type: "extrude", name: "Extrude1", profiles: [{ sketch: "s1", key: reg.key }], distance: "8 mm", operation: "new", newBody: "b1" });
  const sp2 = add(d2, { id: "sp", type: "split", name: "Split Body1", bodies: ["b1"], tool: { kind: "face", body: "b1", p: [30, 10, 4], n: [0, 1, 0] }, extend: true });
  r = new M.Evaluator().run(finish(d2));
  const v2 = vols(r);
  check("split: an L bracket split by its own inner face, extended (60x10 bar + 10x40 leg)", !okAll(r).length && v2.length === 2 && near(v2[0], 10 * 40 * 8) && near(v2[1], 60 * 10 * 8), { e: okAll(r), v2 });
  sp2.extend = false;
  r = new M.Evaluator().run(d2);
  check("split: the same face without Extend does not divide the body (error)", r.results.sp.ok === false, r.results.sp);
}
{
  // coil: circular section on centre, 5 turns, pitch 10, Ø50, section 5 -> V = A·2π·rc·turns (screw motion)
  const doc = M.newDoc("coil");
  const c = add(doc, { id: "c1", type: "coil", name: "Coil1", plane: { kind: "origin", name: "XY" }, center: [0, 0], coilType: "revHeight", diameter: "50 mm", revolutions: "5", height: "50 mm", angle: "0 deg", rotation: "cw", section: "circular", sectionPosition: "center", sectionSize: "5 mm", operation: "new" });
  finish(doc);
  check("coil: assignParams gives the coil its new body id", typeof c.newBody === "string", c.newBody);
  const ev = new M.Evaluator();
  let r = ev.run(doc);
  const want = Math.PI * 6.25 * 2 * Math.PI * 25 * 5;
  check("coil: Revolution and Height, circular on centre = π·r²·2π·R·turns", !okAll(r).length && near(vol(r, c.newBody), want, want * 2e-4), { e: okAll(r), v: vol(r, c.newBody), want });
  const bb = bbox(r, c.newBody);
  check("coil: height 50 along the plane normal (section centred on the path)", bb && near(bb.max[2] - bb.min[2], 55, 0.05), bb);
  Object.assign(c, { sectionPosition: "inside", coilType: "revPitch", pitch: "8 mm" });
  finish(doc);
  r = ev.run(doc);
  const wantIn = Math.PI * 6.25 * 2 * Math.PI * 22.5 * 5;
  check("coil: Section Position Inside moves the section inside the diameter", !okAll(r).length && near(vol(r, c.newBody), wantIn, wantIn * 2e-4) && near(bbox(r, c.newBody).max[0], 25, 0.02), { e: okAll(r), v: vol(r, c.newBody), wantIn });
  Object.assign(c, { section: "square", coilType: "heightPitch", height: "30 mm", pitch: "10 mm" });
  r = ev.run(doc);
  const wantSq = 25 * 2 * Math.PI * 22.5 * 3;
  check("coil: Height and Pitch with a square section", !okAll(r).length && near(vol(r, c.newBody), wantSq, wantSq * 2e-4), { e: okAll(r), v: vol(r, c.newBody), wantSq });
  Object.assign(c, { pitch: "4 mm" });
  r = ev.run(doc);
  check("coil: a pitch below the section size is an error (self-intersecting)", r.results.c1.ok === false && /intersects itself/.test(r.results.c1.error), r.results.c1);
  Object.assign(c, { coilType: "spiral", revolutions: "3", pitch: "8 mm", section: "circular", sectionPosition: "center", sectionSize: "4 mm", diameter: "20 mm" });
  r = ev.run(doc);
  const sbb = r.results.c1.ok && bbox(r, c.newBody);
  check("coil: Spiral stays flat (height = section size) and grows by the pitch per turn", !okAll(r).length && sbb && near(sbb.max[2] - sbb.min[2], 4, 0.02) && sbb.max[0] > 10 + 3 * 8 - 1, { e: okAll(r), sbb });
}
{
  // pipe along a sketch line + tangent arc
  const doc = M.newDoc("pipe");
  const sk = S.newSketch();
  const a = S.addPoint(sk, 0, 0), b = S.addPoint(sk, 50, 0), cc = S.addPoint(sk, 50, 20), e = S.addPoint(sk, 70, 20);
  const l1 = S.addLine(sk, a, b);
  const a1 = S.addArc(sk, cc, b, e);
  doc.features.push({ id: "s1", type: "sketch", name: "Sketch1", plane: { ...K.ORIGIN_PLANES.XY }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
  doc.marker = 1;
  const p = add(doc, { id: "p1", type: "pipe", name: "Pipe1", path: { sketch: "s1", curves: [a1, l1] }, distance: "1", section: "circular", sectionSize: "10 mm", hollow: false, thickness: "1 mm", operation: "new" });
  finish(doc);
  const ev = new M.Evaluator();
  let r = ev.run(doc);
  const L = 50 + 20 * Math.PI / 2;
  check("pipe: circular Ø10 along line + arc (curves given out of order) = π·25·L", !okAll(r).length && near(vol(r, p.newBody), Math.PI * 25 * L, 0.05), { e: okAll(r), v: vol(r, p.newBody), want: Math.PI * 25 * L });
  p.hollow = true;
  r = ev.run(doc);
  check("pipe: Hollow with 1 mm section thickness", !okAll(r).length && near(vol(r, p.newBody), Math.PI * (25 - 16) * L, 0.05), { e: okAll(r), v: vol(r, p.newBody) });
  Object.assign(p, { hollow: false, section: "square", sectionSize: "6 mm", distance: "0.5" });
  finish(doc);
  r = ev.run(doc);
  check("pipe: Distance 0.5 sweeps half the path (square section)", !okAll(r).length && near(vol(r, p.newBody), 36 * L / 2, 0.05), { e: okAll(r), v: vol(r, p.newBody), want: 36 * L / 2 });
  // body edge path: the top front edge of the block, pipe cut into it
  const d2 = baseDoc();
  const p2 = add(d2, { id: "p2", type: "pipe", name: "Pipe1", edges: [{ body: "b1", p: [20, 0, 10] }], distance: "1", section: "circular", sectionSize: "4 mm", hollow: false, thickness: "1 mm", operation: "cut" });
  r = new M.Evaluator().run(finish(d2));
  check("pipe: along a body edge, Cut removes a quarter of the Ø4 rod", !okAll(r).length && near(vol(r), 8000 - Math.PI * 4 * 40 / 4, 0.05) && !p2.newBody, { e: okAll(r), v: vol(r) });
}
{
  const doc = baseDoc();
  const sc = add(doc, { id: "sc", type: "scale", name: "Scale1", bodies: ["b1"], point: { kind: "origin" }, scaleType: "uniform", factor: "2" });
  finish(doc);
  const ev = new M.Evaluator();
  let r = ev.run(doc);
  check("scale: uniform x2 about the origin = 8x volume", !okAll(r).length && near(vol(r), 64000) && near(bbox(r).max[0], 80), { e: okAll(r), v: vol(r) });
  Object.assign(sc, { scaleType: "nonUniform", sx: "2", sy: "1", sz: "0.5", point: { kind: "vertex", body: "b1", p: [40, 20, 10] } });
  finish(doc);
  r = ev.run(doc);
  const bb = bbox(r);
  check("scale: non-uniform 2/1/0.5 about a vertex", !okAll(r).length && near(vol(r), 8000) && near(bb.min[0], -40, 1e-3) && near(bb.max[0], 40, 1e-3) && near(bb.min[2], 5, 1e-3), { e: okAll(r), v: vol(r), bb });
  const nf = r.state.bodies.get("b1").shape.faces.length;
  check("scale: a non-uniformly scaled box is rebuilt with its 6 faces", nf === 6, nf);
  sc.factor = "0"; sc.scaleType = "uniform";
  r = ev.run(doc);
  check("scale: factor 0 is an error", r.results.sc.ok === false, r.results.sc);
}
{
  // cosmetic thread on a Ø10 cylinder, then modeled
  const doc = M.newDoc("thr");
  add(doc, { id: "cy", type: "cylinder", name: "Cylinder1", plane: { kind: "origin", name: "XY" }, center: [0, 0], diameter: "10 mm", height: "6 mm", operation: "new", newBody: "b1" });
  const th = add(doc, { id: "th", type: "thread", name: "Thread1", faces: [{ body: "b1", p: [5, 0, 3], n: [1, 0, 0] }], threadType: "ISO Metric profile", size: "10.0", designation: "M10x1.5", tclass: "6g", pitch: 1.5, major: 9.85, minor: 8.141, modeled: false, fullLength: true, rightHanded: true });
  finish(doc);
  const ev = new M.Evaluator();
  let r = ev.run(doc);
  const t0 = r.results.th.threads && r.results.th.threads[0];
  check("thread: cosmetic thread leaves the body unchanged and reports its helix", !okAll(r).length && near(vol(r), Math.PI * 25 * 6) && t0 && near(t0.r, 5) && near(t0.z1 - t0.z0, 6) && t0.internal === false, { e: okAll(r), t0 });
  th.modeled = true;
  r = ev.run(doc);
  const removed = Math.PI * 25 * 6 - vol(r);
  const d = (9.85 - 8.141) / 2, est = d * d * Math.tan(Math.PI / 6) * 2 * Math.PI * (5 - d / 3) * 4;
  check("thread: modeled M10x1.5 cuts a helical 60° groove (≈ screw-sweep volume)", !okAll(r).length && removed > est * 0.9 && removed < est * 1.05, { e: okAll(r), removed, est });
  Object.assign(th, { fullLength: false, length: "3 mm", offset: "0 mm" });
  finish(doc);
  r = ev.run(doc);
  const removed2 = Math.PI * 25 * 6 - vol(r);
  check("thread: Full Length off: 3 mm of thread removes about half as much", !okAll(r).length && removed2 > removed * 0.4 && removed2 < removed * 0.6, { e: okAll(r), removed2, removed });
  th.faces = [{ body: "b1", p: [0, 0, 6], n: [0, 0, 1] }];
  r = ev.run(doc);
  check("thread: a planar face is rejected", r.results.th.ok === false && /cylindrical/.test(r.results.th.error), r.results.th);
}
{
  // modeled internal thread (M10x1.5 6H) in a Ø8.526 through hole of the 40 x 20 x 10 block
  const doc = baseDoc();
  add(doc, { id: "h", type: "hole", name: "Hole1", placement: "face", points: [[20, 10, 10]], normal: [0, 0, 1], faceRef: { body: "b1", p: [20, 10, 10], n: [0, 0, 1] }, diameter: "8.526 mm", depth: "10 mm", extent: "all", drillPoint: "flat", holeType: "simple", operation: "cut" });
  add(doc, { id: "ti", type: "thread", name: "Thread1", faces: [{ body: "b1", p: [20 + 4.263, 10, 5], n: [-1, 0, 0] }], size: "10.0", designation: "M10x1.5", tclass: "6H", pitch: 1.5, major: 10.198, minor: 8.526, modeled: true, fullLength: true, rightHanded: true });
  finish(doc);
  const r = new M.Evaluator().run(doc);
  const holed = 8000 - Math.PI * 4.263 * 4.263 * 10;
  const t = r.results.ti && r.results.ti.threads && r.results.ti.threads[0];
  check("thread: a hole face is an internal thread; modeled, it cuts into the wall", !okAll(r).length && t && t.internal === true && vol(r) < holed - 20 && vol(r) > holed - 120, { e: okAll(r), v: vol(r), holed, t });
}

// ---------- wasm memory: repeated previews must not grow the heap ----------
// Before the fix every evaluation pinned its whole result body for the session (replicad never
// deletes the raw handle of an operation result, nor the explorer items behind shape.faces/edges):
// ~60 KB per preview of this small part, linear forever. The heap top is sampled after each forced
// GC; growth = (min of the last quarter of samples) - (min of the first quarter), robust to
// allocator fragmentation noise.
{
  let gc = globalThis.gc;
  if (typeof gc !== "function") { try { v8.setFlagsFromString("--expose-gc"); gc = vm.runInNewContext("gc"); } catch { gc = null; } }
  const top = () => { const p = oc.___libc_malloc(1 << 20); oc.___libc_free(p); return p; };
  const doc = baseDoc();
  add(doc, { id: "fl", type: "fillet", name: "Fillet1", edges: [{ body: "b1", p: [20, 0, 10] }], radius: "2 mm", tangentChain: true });
  add(doc, { id: "h", type: "hole", name: "Hole1", placement: "face", points: [[24, 11, 10]], normal: [0, 0, 1], faceRef: { body: "b1", p: [24, 11, 10], n: [0, 0, 1] }, diameter: "5 mm", depth: "10 mm", drillPoint: "angle", tipAngle: "118 deg", holeType: "simple", operation: "cut" });
  finish(doc);
  const ev = new M.Evaluator();
  ev.run(doc);
  const N = 600; // fewer samples are dominated by allocator noise (~1 MB)
  const measure = async (withMesh) => {
    const samples = [];
    const heap0 = oc.wasmMemory.buffer.byteLength, ms0 = performance.now();
    for (let i = 0; i < N + 60; i++) {
      // like app.preview while dragging: a fresh clone of the document each time, full re-evaluation
      // from the edited extrude; optionally meshed like the viewport does for every new body
      const d = structuredClone(doc);
      d.features[1].distance = `${10 + (i % 40) / 8} mm`;
      const r = ev.run(d);
      if (withMesh) for (const b of r.state.bodies.values()) K.meshBody(b.shape, 50);
      if (i % 20 === 19) {
        if (gc) gc();
        await new Promise((res) => setTimeout(res, 0)); // let FinalizationRegistry callbacks run
        if (i >= 60) samples.push(top());
      } else await new Promise((res) => setTimeout(res, 0));
    }
    const q = Math.max(2, Math.floor(samples.length / 4));
    const grow = Math.min(...samples.slice(-q)) - Math.min(...samples.slice(0, q));
    const span = (samples.length - q) * 20;
    return { perIter: grow / span / 1024, grow, heap0, heap1: oc.wasmMemory.buffer.byteLength, ms: (performance.now() - ms0) / (N + 60) };
  };
  const a = await measure(false);
  console.log(`      memory (evaluate only): ${N} previews, heap top ${(a.grow / 1048576).toFixed(1)} MB (${a.perIter.toFixed(1)} KB/preview), wasm memory ${(a.heap0 / 1048576).toFixed(0)} -> ${(a.heap1 / 1048576).toFixed(0)} MB, ${a.ms.toFixed(1)} ms/preview${gc ? "" : " (no gc)"}`);
  // the original engine measured ~30 KB/preview with this exact loop
  check("memory: evaluator previews do not grow the wasm heap (< 6 KB/preview)", a.perIter < 6, a);
  if (QUICK) console.log("      (--quick: meshing variant skipped)");
  const b = QUICK ? null : await measure(true);
  if (b) {
  console.log(`      memory (evaluate + mesh): heap top ${(b.grow / 1048576).toFixed(1)} MB (${b.perIter.toFixed(1)} KB/preview), wasm memory -> ${(b.heap1 / 1048576).toFixed(0)} MB, ${b.ms.toFixed(1)} ms/preview`);
  // replicad's C++ mesh extractor still retains a few KB per meshed body (not reachable from JS)
  check("memory: with viewport meshing growth stays well below the old ~30 KB/preview (< 20)", b.perIter < 20, b);
  }
}

console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nall ${passed} passed`);
process.exitCode = failed ? 1 : 0;
