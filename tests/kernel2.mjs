import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import fs from "fs";
const oc = await opencascade({ wasmBinary: fs.readFileSync("node_modules/replicad-opencascadejs/dist/replicad_single.wasm") });
R.setOC(oc);
const pl = new R.Plane([0,0,0],[1,0,0],[0,0,1]);
const box = R.drawRectangle(20,10).sketchOnPlane(pl).extrude(5);
const m = box.mesh({tolerance:0.1, angularTolerance:10});
console.log("faceIds", m.faceGroups.map(g=>g.faceId).join(","), "faces", box.faces.length);
console.log("face centers", box.faces.map(f=>f.center.toTuple().map(v=>v.toFixed(1)).join("/")).join(" "));
// check mapping: triangle centroid of group i vs face center
for (const g of m.faceGroups.slice(0,3)) { const t=m.triangles[g.start]; console.log("grp", g.faceId, "v", [m.vertices[t*3],m.vertices[t*3+1],m.vertices[t*3+2]].map(v=>v.toFixed(1)).join("/")); }
const em = box.meshEdges({tolerance:0.1, angularTolerance:10});
console.log("edgeIds", em.edgeGroups.map(g=>g.edgeId).join(","), "edges", box.edges.length);
console.log("edge0 mid", box.edges[0].pointAt(0.5).toTuple());
const g0 = em.edgeGroups[0]; console.log("grp0 first pt", em.lines.slice(g0.start*3, g0.start*3+6));
// offset sign
const d = R.drawRectangle(20,10);
const o = d.offset(2); console.log("offset +2 bbox", o.boundingBox.width, o.boundingBox.height);
// negative extrude
const neg = R.drawCircle(5).sketchOnPlane(pl).extrude(-10); console.log("neg extrude bbox", neg.boundingBox.bounds);
const ex2 = R.drawCircle(5).sketchOnPlane(pl).extrude(10,{extrusionDirection:[0,0,-1]}); console.log("dir extrude", ex2.boundingBox.bounds);
// face extrusion
const top = box.faces.find(f=>Math.abs(f.center.z-5)<1e-6);
const fx = R.basicFaceExtrusion(top, new R.Vector([0,0,3])); console.log("face extrude vol", R.measureVolume(fx));
// mirror
const mb = box.clone().translate(30,0,0).mirror([1,0,0],[0,0,0]); console.log("mirror bbox", mb.boundingBox.bounds);
// sweep
const spine = R.assembleWire([R.makeLine([0,0,0],[0,0,20]), R.makeThreePointArc([0,0,20],[2.93,0,27.07],[10,0,30])]);
const prof = R.drawCircle(2).sketchOnPlane(new R.Plane([0,0,0],[1,0,0],[0,0,1])).wire;
const sw = R.genericSweep(prof, spine, {frenet:true}, false); console.log("sweep vol", R.measureVolume(sw).toFixed(1));
// edge distance
const v = R.makeVertex([0,5,5]);
const dists = box.edges.map(e=>R.measureDistanceBetween(e,v)); console.log("min edge dist", Math.min(...dists).toFixed(4));
console.log("edge types", box.edges.map(e=>e.geomType).join(","));
const cyl = R.makeCylinder(5,10,[0,0,0],[0,0,1]);
console.log("cyl edges", cyl.edges.map(e=>e.geomType), "faces", cyl.faces.map(f=>f.geomType));
const cut = box.cut(R.makeCylinder(2,20,[0,0,-5],[0,0,1]));
console.log("cut faces", cut.faces.length, "vol", R.measureVolume(cut).toFixed(1));
const empty = box.cut(R.makeBox([-50,-50,-50],[50,50,50])); console.log("empty cut", empty.faces.length, empty.isNull);
const props = R.measureShapeVolumeProperties(cut); console.log("com", props.centerOfMass, props.volume);
const stl = cut.blobSTL({binary:true}); console.log("stl", stl.size);
const sec = cut.cutPlane(new R.Plane([0,0,0],[1,0,0],[0,1,0]), 0, "negative"); console.log("section faces", sec && sec.faces.length);
const hm = new Map(box.faces.map((f,i)=>[f.hashCode,i])); console.log("face hash map hits", m.faceGroups.map(g=>hm.get(g.faceId)).join(","));
const he = new Map(box.edges.map((e,i)=>[e.hashCode,i])); console.log("edge hash map hits", em.edgeGroups.map(g=>he.get(g.edgeId)).join(","));
