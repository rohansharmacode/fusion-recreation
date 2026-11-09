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
