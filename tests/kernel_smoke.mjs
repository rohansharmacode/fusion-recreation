import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import fs from "fs";
const t0=Date.now();
const wasmBinary = fs.readFileSync("node_modules/replicad-opencascadejs/dist/replicad_single.wasm");
const oc = await opencascade({ wasmBinary });
R.setOC(oc);
console.log("init ms", Date.now()-t0);
// rectangle with circular hole, extrude, fillet top edges, shell
const plane = new R.Plane([0,0,0],[1,0,0],[0,0,1]);
let d = R.draw([-20,-10]).lineTo([20,-10]).lineTo([20,10]).lineTo([-20,10]).close();
const hole = R.drawCircle(4).translate(5,0);
d = d.cut(hole);
let s = d.sketchOnPlane(plane).extrude(15);
console.log("faces", s.faces.length, "edges", s.edges.length);
// fillet edges near a point (top long edge)
const f = s.fillet(3, e => e.containsPoint([0,10,15]));
console.log("fillet faces", f.faces.length);
const sh = f.shell(2, ff => ff.containsPoint([0,0,0]).inPlane("XY",0));
console.log("shell faces", sh.faces.length, "vol", R.measureVolume(sh).toFixed(1));
const m = sh.mesh({tolerance:0.1, angularTolerance:15});
console.log("tris", m.triangles.length/3, "groups", m.faceGroups.length);
const em = sh.meshEdges({tolerance:0.1, angularTolerance:15});
console.log("edge groups", em.edgeGroups.length);
// taper via loft of offset
const base = R.drawCircle(10);
const top = base.offset(-2);
const w1 = base.sketchOnPlane(plane).wire; 
const p2 = new R.Plane([0,0,20],[1,0,0],[0,0,1]);
const w2 = top.sketchOnPlane(p2).wire;
const lofted = R.loft([w1,w2]);
console.log("loft vol", R.measureVolume(lofted).toFixed(1));
const rev = R.draw([5,0]).lineTo([10,0]).lineTo([10,5]).lineTo([5,5]).close().sketchOnPlane(new R.Plane([0,0,0],[1,0,0],[0,-1,0])).revolve([0,0,1],{origin:[0,0,0], angle:360});
console.log("rev vol", R.measureVolume(rev).toFixed(1));
const step = R.exportSTEP([{shape: sh, name:"Body1"}]);
console.log("step bytes", (await step.text()).length);
console.log("total ms", Date.now()-t0);
