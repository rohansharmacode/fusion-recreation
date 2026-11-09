import * as S from "../src/sketch/sketch.js";
import { ParamTable } from "../src/expr.js";
const params = new ParamTable();
const sk = S.newSketch();
const r = S.addRect2pt(sk, [0,0],[40,20]);
// fix corner to origin
S.addConstraint(sk, "coincident", [r.points[0], "o"]);
let st = S.solve(sk, params);
console.log("rect only: ok", st.ok, "free", st.freeVars.size, "fully", st.fully);
const d1 = S.addConstraint(sk, "distance", [r.lines[0]], {expr:"50", param:"d1", dimType:"aligned"});
const d2 = S.addConstraint(sk, "distance", [r.lines[1]], {expr:"d1/2", param:"d2", dimType:"aligned"});
params.set("d1","50"); params.set("d2","d1/2");
st = S.solve(sk, params);
console.log("dims: ok", st.ok, "free", st.freeVars.size, "fully", st.fully, "w", sk.points[r.points[1]].x.toFixed(3), "h", sk.points[r.points[2]].y.toFixed(3));
const cp = S.addPoint(sk, 25, 12);
const c = S.addCircle(sk, cp, 5);
let reg = S.regions(sk);
console.log("regions", reg.regions.length, reg.regions.map(x=>x.area.toFixed(1)+" holes:"+x.holes.length));
// split line across
const pa = S.addPoint(sk, 10, -5), pb = S.addPoint(sk, 10, 30);
S.addLine(sk, pa, pb);
reg = S.regions(sk);
console.log("with splitter", reg.regions.length, reg.regions.map(x=>x.area.toFixed(1)));
// overlapping circle
const cp2 = S.addPoint(sk, 30, 12); S.addCircle(sk, cp2, 5);
reg = S.regions(sk);
console.log("with overlap", reg.regions.length, reg.regions.map(x=>x.area.toFixed(1)).join(" "), "sum", reg.regions.reduce((s,x)=>s+x.area,0).toFixed(1));
console.log("keys", reg.regions.map(x=>x.key).join("  ||  "));
// polygon
const sk2 = S.newSketch();
const pg = S.addPolygon(sk2, [0,0],[10,0],6,"circumscribed","o");
st = S.solve(sk2, params);
console.log("polygon ok", st.ok, "free vars", st.freeVars.size, "regions", S.regions(sk2).regions.length, S.regions(sk2).regions.map(x=>x.area.toFixed(2)));
// slot
const sk3 = S.newSketch();
S.addSlot(sk3, [0,0],[20,0], 6);
st = S.solve(sk3, params);
console.log("slot ok", st.ok, "regions", S.regions(sk3).regions.map(x=>x.area.toFixed(2)), "expected", (20*6+Math.PI*9).toFixed(2));
// fillet
const sk4 = S.newSketch();
const r4 = S.addRect2pt(sk4, [0,0],[20,10]);
S.filletCorner(sk4, r4.points[2], 3);
st = S.solve(sk4, params);
console.log("fillet ok", st.ok, "area", S.regions(sk4).regions.map(x=>x.area.toFixed(2)), "expected", (200 - (9 - Math.PI*9/4)).toFixed(2));
// trim
const sk5 = S.newSketch();
const r5 = S.addRect2pt(sk5, [0,0],[20,10]);
const q1=S.addPoint(sk5,10,-5), q2=S.addPoint(sk5,10,15); const sl = S.addLine(sk5,q1,q2);
S.trimAt(sk5, sl, [10,-2]); S.trimAt(sk5, sl, [10,12]);
console.log("trimmed regions", S.regions(sk5).regions.map(x=>x.area.toFixed(1)), "curves", Object.keys(sk5.curves).length);
