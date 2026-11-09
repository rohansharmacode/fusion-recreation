// Node test for the model.js additions made by the dialogs module:
//  - extrude two-sides with a separate side-2 extent (f.extent2)
//  - fillet/chamfer/shell on bodies with degenerate edges (drill-point cone) do not spam console.error
//   node tests/dialogs_model.mjs
import fs from "fs";
import * as K from "../src/kernel.js";
import * as M from "../src/model.js";
import * as S from "../src/sketch/sketch.js";

await K.initKernel(fs.readFileSync("node_modules/replicad-opencascadejs/dist/replicad_single.wasm"));
let failed = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`); if (!ok) failed++; };
const vol = (r) => [...r.state.bodies.values()].reduce((s, b) => s + K.R.measureVolume(b.shape), 0);

function docWithRect() {
  const doc = M.newDoc("t");
  const sk = S.newSketch();
  S.addRect2pt(sk, [0, 0], [10, 10]);
  doc.features.push({ id: "s1", type: "sketch", name: "Sketch1", plane: K.ORIGIN_PLANES.XY, planeRef: { kind: "origin", name: "XY" }, sk });
  doc.marker = 1;
  return doc;
}
function run(doc) { return new M.Evaluator().run(doc); }
function profileOf(doc) {
  const r = run(doc);
  const reg = r.state.sketches.get("s1").regions.regions[0];
  return { sketch: "s1", key: reg.key, c: [5, 5] };
}

// --- two sides: side 2 with its own extent
{
  const doc = docWithRect();
  const pr = profileOf(doc);
  // a 20 mm block above to give "All" something to measure against
  doc.features.push({ id: "e0", type: "extrude", name: "Extrude0", profiles: [pr], distance: "20 mm", operation: "new", newBody: "b1" });
  doc.features.push({ id: "e1", type: "extrude", name: "Extrude1", profiles: [pr], dirType: "two", distance: "4 mm", distance2: "6 mm", extent: "distance", extent2: "distance", operation: "new", newBody: "b2" });
  doc.marker = 3;
  M.assignParams(doc, doc.features[1]); M.assignParams(doc, doc.features[2]);
  const r = run(doc);
  const b2 = r.state.bodies.get("b2");
  check("two sides 4 + 6 = 1000 mm3", b2 && Math.abs(K.R.measureVolume(b2.shape) - 1000) < 1e-6, b2 && K.R.measureVolume(b2.shape));
  doc.features[2].extent2 = "all";
  const r2 = run(doc);
  const bb = K.bboxOf(r2.state.bodies.get("b2").shape);
  check("side 2 extent All goes beyond the 6 mm distance, side 1 keeps 4 mm", bb.min[2] < -6.5 && Math.abs(bb.max[2] - 4) < 1e-6, bb);
  delete doc.features[2].extent2;
  doc.features[2].extent = "distance";
  const r3 = run(doc);
  check("without extent2 behaviour is unchanged", Math.abs(K.R.measureVolume(r3.state.bodies.get("b2").shape) - 1000) < 1e-6);
}

// --- fillet after a drill-point hole: no "failed to compute a normal" console noise
{
  const doc = M.newDoc("t2");
  doc.features.push({ id: "bx", type: "box", name: "Box1", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "30 mm", width: "30 mm", height: "20 mm", operation: "new", newBody: "b1" });
  doc.features.push({ id: "h", type: "hole", name: "Hole1", placement: "face", points: [[0, 0, 20]], normal: [0, 0, 1], diameter: "5 mm", depth: "10 mm", drillPoint: "angle", tipAngle: "118 deg", holeType: "simple" });
  doc.features.push({ id: "fl", type: "fillet", name: "Fillet1", edges: [{ body: "b1", p: [15, 15, 10] }], radius: "2 mm", tangentChain: true });
  doc.features.push({ id: "ch", type: "chamfer", name: "Chamfer1", edges: [{ body: "b1", p: [-15, -15, 10] }], distance: "1 mm", tangentChain: true });
  doc.marker = 4;
  for (const f of doc.features) M.assignParams(doc, f);
  const errs = [];
  const ce = console.error;
  console.error = (...a) => errs.push(a.join(" "));
  let r;
  try { r = run(doc); } finally { console.error = ce; }
  check("fillet + chamfer after a hole compute", r.results.fl.ok && r.results.ch.ok, { fl: r.results.fl.error, ch: r.results.ch.error });
  check("no console.error noise from replicad finders", errs.length === 0, errs.slice(0, 2));
  check("console.error restored", console.error === ce);
  check("volume reasonable", vol(r) < 18000 && vol(r) > 17000, vol(r));
}

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exitCode = failed ? 1 : 0;
