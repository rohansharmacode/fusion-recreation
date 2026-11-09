// Node test for the feature-type registry and body kinds in model.js:
//  - registerFeature(): FIELDS / TYPE_LABEL / naming / parameters / makesBodies / evaluation / errors
//  - exported evaluator helpers (applyOp, fval, profileGroups ...)
//  - body kinds: surface bodies (open shells) vs solids, mesh bodies (st.meshBodies), Insert Mesh `mesh` feature,
//    Move / Delete on mesh bodies, doc.meshes migration
//   node tests/registry_test.mjs
import fs from "fs";
import * as K from "../src/kernel.js";
import * as M from "../src/model.js";
import * as S from "../src/sketch/sketch.js";
import * as MD from "../src/meshdata.js";

await K.initKernel(fs.readFileSync("node_modules/replicad-opencascadejs/dist/replicad_single.wasm"));
let failed = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`); if (!ok) failed++; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const vol = (shape) => K.R.measureVolume(shape);

// a doc helper mimicking app.addFeature (core.prepareFeature): id, name, params, body ids
function add(doc, f) {
  doc.counters.feature = (doc.counters.feature || 0) + 1;
  f.id = f.id || `f${doc.counters.feature}`;
  f.name = f.name || M.nextName(doc, f.type);
  M.assignParams(doc, f);
  M.assignBodies(doc, f);
  doc.features.splice(doc.marker, 0, f);
  doc.marker += 1;
  return f;
}
const run = (doc) => new M.Evaluator().run(doc);

// ---------------------------------------------------------------- registry basics
{
  let notified = null;
  const off = M.onFeatureRegistered((type) => { notified = type; });
  const def = M.registerFeature("testslab", {
    label: "Test Slab",
    stem: "Slab",
    fields: { length: "length", width: "length", height: "length", count: "none" },
    makesBodies: (f) => (f.operation || "new") === "new",
    icon: "PrimitiveBox",
    deps: (f) => ({ features: f.after ? [f.after] : [] }),
    apply(st, f, P, doc) {
      const L = M.fval(P, f, "length"), W = M.fval(P, f, "width"), H = M.fval(P, f, "height");
      if (!(L > 0 && W > 0 && H > 0)) throw new Error("Slab size must be positive");
      const tool = K.extrudeDrawing(K.R.drawRectangle(L, W), K.ORIGIN_PLANES.XY, 0, H, 0);
      st._tool = tool;
      return { affected: M.applyOp(st, f, tool, doc) };
    },
  });
  off();
  check("registerFeature returns the def with defaults", def.type === "testslab" && def.label === "Test Slab" && def.stem === "Slab");
  check("listener notified", notified === "testslab");
  check("FIELDS / TYPE_LABEL / NAME_STEM wired", M.FIELDS.testslab.length === "length" && M.TYPE_LABEL.testslab === "Test Slab" && M.NAME_STEM.testslab === "Slab");
  check("featureDef(registered)", M.featureDef("testslab") === def && M.isFeatureType("testslab"));
  const bi = M.featureDef("extrude");
  check("featureDef(built-in) describes it", bi && bi.builtin && bi.label === "Extrude" && bi.fields.distance === "length");
  check("featureTypes lists both", M.featureTypes().includes("testslab") && M.featureTypes().includes("fillet"));
  let threw = false;
  try { M.registerFeature("fillet", { apply() {} }); } catch { threw = true; }
  check("built-in types are protected", threw);
  threw = false;
  try { M.registerFeature("nothing", {}); } catch { threw = true; }
  check("apply is required", threw);

  const doc = M.newDoc("reg");
  const f = add(doc, { type: "testslab", length: "20 mm", width: "10 mm", height: "d1/2", count: "3", operation: "new" });
  check("auto name uses the stem", f.name === "Slab1", f.name);
  check("fields get model parameters d1..", f.p.length === "d1" && f.p.width === "d2" && f.p.height === "d3" && f.p.count === "d4", f.p);
  check("makesBodies true -> newBody", typeof f.newBody === "string" && doc.bodies[f.newBody], f.newBody);
  const r = run(doc);
  const b = r.state.bodies.get(f.newBody);
  check("registered feature evaluates", r.results[f.id].ok && b && near(vol(b.shape), 20 * 10 * 10), b && vol(b.shape));
  check("tool exposed on the result", !!r.results[f.id].tool);
  check("affected reported", (r.results[f.id].affected || []).includes(f.newBody));
  const rows = M.featureParamsList(doc, r.params);
  check("Change Parameters lists the registered fields", rows.some((x) => x.feature.id === f.id && x.items.length === 4));
  // a second slab joins (operation join, makesBodies false)
  const f2 = add(doc, { type: "testslab", length: "5 mm", width: "5 mm", height: "30 mm", operation: "join" });
  check("makesBodies(f) false -> no newBody", !f2.newBody);
  const r2 = run(doc);
  check("join through applyOp", r2.results[f2.id].ok && r2.state.bodies.size === 1 && near(vol(r2.state.bodies.get(f.newBody).shape), 2000 + 5 * 5 * 20, 1e-6), vol(r2.state.bodies.get(f.newBody).shape));
  // errors are isolated like built-in features
  doc.features[1].length = "-5 mm";
  const r3 = run(doc);
  check("apply errors become feature errors", r3.results[f2.id].ok === false && /positive/.test(r3.results[f2.id].error), r3.results[f2.id]);
  // unknown types fail with a clear message instead of silently passing
  const d2 = M.newDoc("unknown");
  add(d2, { type: "nosuchfeature" });
  const r4 = run(d2);
  check("unknown feature type -> error", r4.results[d2.features[0].id].ok === false, r4.results[d2.features[0].id]);
}

// ---------------------------------------------------------------- makesBodies as a count + helpers
{
  M.registerFeature("testcopies", {
    label: "Copies",
    fields: { gap: "length" },
    makesBodies: (f) => (f.bodies || []).length,
    apply(st, f, P) {
      const gap = M.fval(P, f, "gap");
      (f.bodies || []).forEach((id, i) => {
        const b = st.bodies.get(id);
        if (!b) throw new Error("Body missing");
        const nid = f.newBodies[i];
        st.bodies.set(nid, { id: nid, shape: K.translated(b.shape, [0, 0, gap]), from: f.id });
      });
      return { affected: [...f.newBodies] };
    },
  });
  const doc = M.newDoc("copies");
  const bx = add(doc, { type: "box", plane: { kind: "origin", name: "XY" }, center: [0, 0], length: "10 mm", width: "10 mm", height: "10 mm", operation: "new" });
  const cp = add(doc, { type: "testcopies", bodies: [bx.newBody], gap: "20 mm" });
  check("makesBodies(n) -> newBodies[n]", Array.isArray(cp.newBodies) && cp.newBodies.length === 1);
  const r = run(doc);
  const c = r.state.bodies.get(cp.newBodies[0]);
  check("copy evaluated", c && near(K.bboxOf(c.shape).min[2], 20), c && K.bboxOf(c.shape));
  check("helpers object exported", typeof M.helpers.applyOp === "function" && typeof M.helpers.profileGroups === "function" && typeof M.helpers.locateEdge === "function" && M.helpers.fval === M.fval);
}

// ---------------------------------------------------------------- profile helpers from a registered feature
{
  M.registerFeature("testpad", {
    label: "Pad",
    fields: { distance: "length" },
    makesBodies: true,
    apply(st, f, P, doc) {
      const d = M.fval(P, f, "distance");
      const parts = [];
      for (const g of M.profileGroups(st, f.profiles || [])) parts.push(K.extrudeRegions(g.regions, g.sketch.regions.vertices, g.sketch.plane, 0, d));
      if (!parts.length) throw new Error("Select a profile");
      const tool = M.fuseTemp(parts);
      return { affected: M.applyOp(st, { ...f, operation: "new" }, tool, doc) };
    },
  });
  const doc = M.newDoc("pad");
  const sk = S.newSketch();
  S.addRect2pt(sk, [0, 0], [10, 4]);
  add(doc, { id: "s1", type: "sketch", name: "Sketch1", plane: K.ORIGIN_PLANES.XY, planeRef: { kind: "origin", name: "XY" }, sk });
  const r0 = run(doc);
  const reg = r0.state.sketches.get("s1").regions.regions[0];
  const pad = add(doc, { type: "testpad", profiles: [{ sketch: "s1", key: reg.key, c: [5, 2] }], distance: "3 mm" });
  const r = run(doc);
  check("registered feature uses profileGroups", r.results[pad.id].ok && near(vol(r.state.bodies.get(pad.newBody).shape), 120), r.results[pad.id]);
}

// ---------------------------------------------------------------- surface bodies
{
  M.registerFeature("testpatch", {
    label: "Patch",
    makesBodies: true,
    apply(st, f) {
      const face = K.polygonFace([[0, 0, 5], [30, 0, 5], [30, 30, 5], [0, 30, 5]]);
      st.bodies.set(f.newBody, { id: f.newBody, shape: face, from: f.id });
      return { affected: [f.newBody] };
    },
  });
  const doc = M.newDoc("surf");
  const pt = add(doc, { type: "testpatch" });
  const bx = add(doc, { type: "box", plane: { kind: "origin", name: "XY" }, center: [15, 15], length: "10 mm", width: "10 mm", height: "10 mm", operation: "new" });
  const r = run(doc);
  check("surface body kind", M.bodyKind(r.state, pt.newBody) === "surface" && M.shapeKind(r.state.bodies.get(pt.newBody).shape) === "surface");
  check("solid body kind", M.bodyKind(r.state, bx.newBody) === "solid" && M.isSolidBody(r.state, bx.newBody));
  // an extrude-style cut with implicit participants leaves the surface alone (Fusion: solid features target solids)
  M.registerFeature("testcut", {
    label: "Cut",
    apply(st, f, P, doc) {
      const tool = K.extrudeDrawing(K.R.drawRectangle(4, 4).translate(15, 15), K.ORIGIN_PLANES.XY, -1, 20, 0);
      return { affected: M.applyOp(st, { ...f, operation: "cut" }, tool, doc) };
    },
  });
  const ct = add(doc, { type: "testcut" });
  const r2 = run(doc);
  check("implicit participants skip surface bodies", r2.results[ct.id].ok && (r2.results[ct.id].affected || []).length === 1 && r2.results[ct.id].affected[0] === bx.newBody, r2.results[ct.id]);
  check("surface untouched (no hole cut into it)", r2.state.bodies.get(pt.newBody).from === pt.id && K.facesOf(r2.state.bodies.get(pt.newBody).shape).length === 1);
}

// ---------------------------------------------------------------- mesh bodies (Insert Mesh feature)
{
  const doc = M.newDoc("mesh");
  // a 10 mm cube as a triangle soup in centimetres (1 unit = 1 cm)
  const q = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const soupArr = new Float32Array(faces.length * 9);
  faces.forEach((t, i) => t.forEach((v, k) => { soupArr.set(q[v], i * 9 + k * 3); }));
  const welded = MD.weld(soupArr);
  check("weld merges cube corners", welded.positions.length === 24 && welded.indices.length === 36, [welded.positions.length, welded.indices.length]);
  const data = M.storeMeshData(doc, welded);
  check("storeMeshData -> doc.meshData", typeof doc.meshData[data].positions === "string" && doc.meshData[data].indices);
  const mf = { type: "mesh", data, units: "cm", flipUp: false, tx: 100, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, scale: 1, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, newBody: M.nextBody(doc, { name: "cube", kind: "mesh" }) };
  add(doc, mf);
  const r = run(doc);
  const mb = r.state.meshBodies.get(mf.newBody);
  check("mesh feature -> st.meshBodies", r.results[mf.id].ok && mb && mb.kind === "mesh" && !r.state.bodies.has(mf.newBody), r.results[mf.id]);
  check("bodyKind mesh", M.bodyKind(r.state, mf.newBody) === "mesh");
  const bb = M.bodyBBox(r.state, mf.newBody);
  check("units + translation", near(bb.min[0], 100) && near(bb.max[0], 110) && near(bb.max[2], 10), bb);
  check("mesh volume 1000 mm3", near(MD.volume(mb.mesh), 1000, 1e-5), MD.volume(mb.mesh));
  check("allBodyIds includes mesh bodies", M.allBodyIds(r.state).includes(mf.newBody));
  // rotation about the file box centre (90 deg about Z keeps the box in place for a cube)
  doc.features[0].rz = 90;
  const rr = run(doc);
  const bb2 = M.bodyBBox(rr.state, mf.newBody);
  check("rotation about the box centre", near(bb2.min[0], 100, 1e-5) && near(bb2.max[1], 10, 1e-5), bb2);
  doc.features[0].rz = 0;
  // Move works on mesh bodies
  const mv = add(doc, { type: "move", bodies: [mf.newBody], tx: "0 mm", ty: "5 mm", tz: "0 mm", rx: "0 deg", ry: "0 deg", rz: "0 deg" });
  const r2 = run(doc);
  const bb3 = M.bodyBBox(r2.state, mf.newBody);
  check("Move translates a mesh body", r2.results[mv.id].ok && near(bb3.min[1], 5) && near(bb3.max[1], 15), bb3);
  // Delete removes it
  const del = add(doc, { type: "delete", bodies: [mf.newBody] });
  const r3 = run(doc);
  check("Delete removes a mesh body", r3.results[del.id].ok && !r3.state.meshBodies.has(mf.newBody));
  // JSON round trip keeps the data
  const doc2 = JSON.parse(JSON.stringify(doc));
  doc2.marker = 1;
  const r4 = run(doc2);
  check("saved document re-evaluates the mesh", r4.state.meshBodies.has(mf.newBody) && MD.triCount(r4.state.meshBodies.get(mf.newBody).mesh) === 12);
  // STL writer
  const stl = MD.stlBinary([MD.soup(r4.state.meshBodies.get(mf.newBody).mesh)]);
  check("binary STL size", stl.length === 84 + 12 * 50, stl.length);
}

// ---------------------------------------------------------------- migration of doc.meshes (older documents)
{
  const old = M.newDoc("old");
  const soup = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  old.meshes = [{ id: "mb1", name: "tri", file: "tri.stl", format: "stl", units: "mm", flipUp: false, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, scale: 2, data: MD.toB64(soup), tris: 1, bbox: { min: [0, 0, 0], max: [1, 1, 0] }, visible: true }];
  const changed = M.migrateDoc(old);
  check("migrateDoc converts doc.meshes", changed && !old.meshes && old.features[0].type === "mesh" && old.marker === 1);
  check("migrated body keeps its name", old.bodies[old.features[0].newBody].name === "tri");
  check("migrateDoc is idempotent", M.migrateDoc(old) === false);
  const r = run(old);
  const bb = M.bodyBBox(r.state, old.features[0].newBody);
  check("migrated mesh evaluates (scale 2)", near(bb.max[0], 2) && near(bb.max[1], 2), bb);
}

// ---------- components and occurrences ----------
{
  const doc = M.newDoc("comp");
  const box = (center, extra = {}) => add(doc, { type: "box", plane: { kind: "origin", name: "XY" }, center, length: "10 mm", width: "10 mm", height: "10 mm", operation: "new", ...extra });
  const b1 = box([0, 0]);
  // From Bodies: Body1 moves into Component1
  const c1 = M.newComponentMeta(doc);
  check("component names count up", doc.components[c1.comp].name === "Component1" && doc.occurrences[c1.occ].n === 1);
  add(doc, { type: "component", mode: "bodies", comp: c1.comp, newOcc: c1.occ, bodies: [b1.newBody], name: "Component1" });
  let r = run(doc);
  check("From Bodies: the body belongs to the component", M.bodyOwner(r.state, b1.newBody) === c1.occ && r.state.occ.has(c1.occ));
  // a feature created in Component1 (f.occ) owns its body; join only touches bodies of that component
  const b2 = box([30, 0], { occ: c1.occ });
  r = run(doc);
  check("feature in a component owns its new body", M.bodyOwner(r.state, b2.newBody) === c1.occ);
  check("occBodies lists both", M.occBodies(r.state, c1.occ).length === 2);
  const rootBox = box([60, 0]);
  r = run(doc);
  check("root feature body stays in root", M.bodyOwner(r.state, rootBox.newBody) === M.ROOT);
  // newComponent operation
  const nc = M.newComponentMeta(doc);
  const b4 = box([0, 40], { operation: "newComponent", newComp: nc.comp, newOcc: nc.occ });
  r = run(doc);
  check("operation newComponent creates the occurrence", r.state.occ.has(nc.occ) && M.bodyOwner(r.state, b4.newBody) === nc.occ);
  // capture a position: Component1 moves by 100 in X with its bodies
  const T = [1, 0, 0, 100, 0, 1, 0, 0, 0, 0, 1, 0];
  doc.positions = { [c1.occ]: T };
  r = run(doc);
  let bb = K.bboxOf(r.state.bodies.get(b1.newBody).shape);
  check("uncaptured position moves the bodies", near(bb.min[0], 95, 1e-4) && r.state.pending && r.state.pending[0] === c1.occ, bb.min);
  check("root body does not move", near(K.bboxOf(r.state.bodies.get(rootBox.newBody).shape).min[0], 55, 1e-4));
  M.capturePositions(doc);
  check("capturePositions adds a Position feature", !doc.positions && doc.features[doc.marker - 1].type === "snapshot" && doc.features[doc.marker - 1].name === "Position1");
  r = run(doc);
  bb = K.bboxOf(r.state.bodies.get(b2.newBody).shape);
  check("captured position: later state has the moved body", near(bb.min[0], 125, 1e-4) && near(r.state.occ.get(c1.occ).T[3], 100), bb.min);
  // a rotation of 90 deg about Z (transformShape axis-angle path)
  const Rz = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  const rs = M.transformShape(r.state.bodies.get(rootBox.newBody).shape, Rz);
  bb = K.bboxOf(rs);
  check("transformShape rotates (90 deg about Z)", near(bb.min[1], 55, 1e-4) && near(bb.max[0], 5, 1e-4), [bb.min, bb.max]);
  const Rx180 = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0];
  bb = K.bboxOf(M.transformShape(r.state.bodies.get(rootBox.newBody).shape, Rx180));
  check("transformShape rotates (180 deg about X)", near(bb.min[2], -10, 1e-4) && near(bb.max[2], 0, 1e-4), [bb.min, bb.max]);
  check("invRigid", M.meshOps.mul(Rz, M.invRigid(Rz)).every((v, i) => near(v, M.meshOps.IDENTITY[i])));
  // paste: another occurrence of Component1 shows instance bodies
  const o2 = M.newOccurrenceMeta(doc, c1.comp);
  check("occurrence numbering :2", doc.occurrences[o2].n === 2);
  add(doc, { type: "component", mode: "paste", comp: c1.comp, newOcc: o2, source: c1.occ, T: [1, 0, 0, 100, 0, 1, 0, 50, 0, 0, 1, 0] });
  r = run(doc);
  const inst = `${b1.newBody}@${o2}`;
  check("paste: instance bodies exist", r.state.bodies.has(inst) && M.bodyOwner(r.state, inst) === o2);
  bb = K.bboxOf(r.state.bodies.get(inst).shape);
  check("paste: instance placed by its transform", near(bb.min[1], 45, 1e-4) && near(bb.min[0], 95, 1e-4), bb.min);
  // a fillet-free change to the primary updates the instance: delete Body2 from the component
  add(doc, { type: "delete", bodies: [b2.newBody] });
  r = run(doc);
  check("instances follow the primary", !r.state.bodies.has(`${b2.newBody}@${o2}`) && r.state.bodies.has(inst));
  // default participants skip instances
  // a cut through Body1 and its instance: the cut changes the component (Body1), the instance follows it
  const cut = add(doc, { type: "box", plane: { kind: "origin", name: "XY" }, center: [100, 25], length: "4 mm", width: "70 mm", height: "40 mm", operation: "cut" });
  r = run(doc);
  const vb = K.volumeOf(r.state.bodies.get(b1.newBody).shape), vi = K.volumeOf(r.state.bodies.get(inst).shape);
  check("cut changes the component and its instance follows", r.results[cut.id].ok && near(vb, 600, 1e-3) && near(vi, vb, 1e-6), [r.results[cut.id].error, vb, vi]);
  // paste new: independent copy with new bodies
  const cp = M.newComponentMeta(doc, { name: "Component1 (1)" });
  const nb = M.nextBody(doc, { name: "Body1" });
  add(doc, { type: "component", mode: "copy", comp: cp.comp, newOcc: cp.occ, source: c1.occ, T: [1, 0, 0, 100, 0, 1, 0, -50, 0, 0, 1, 0], newBodies: [nb] });
  r = run(doc);
  check("paste new copies the bodies", r.state.bodies.has(nb) && M.bodyOwner(r.state, nb) === cp.occ && near(K.bboxOf(r.state.bodies.get(nb).shape).min[1], -55, 1e-4));
  check("occSubtree(ROOT) has every occurrence", M.occSubtree(r.state, M.ROOT).size === r.state.occ.size + 1);
}

console.log(failed ? `${failed} FAILED` : "all passed");
if (failed) process.exit(1);
