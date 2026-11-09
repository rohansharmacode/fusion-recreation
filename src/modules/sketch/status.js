// Bottom-right status text for sketch objects (app.setStatus), like Fusion's
// "1 Profile | Area : 800.00 mm^2". Hover wins over the selection; other modules own the
// text for bodies, faces and edges, so this only clears what it wrote itself.
import { ST, sketchData } from "./ctx.js";

let owned = false;

const f2 = (v) => (Math.abs(v) < 5e-10 ? 0 : v).toFixed(2);

function regionOf(r) {
  const d = sketchData(r.sketch);
  const regs = d && d.regions && d.regions.regions;
  return regs ? regs.find((g) => g.key === r.key) || null : null;
}

function curveInfo(r) {
  const d = sketchData(r.sketch);
  const cv = d && d.sk.curves[r.curve];
  if (!cv) return null;
  const S = ST.app.S;
  if (cv.type === "line") {
    const a = d.sk.points[cv.p1], b = d.sk.points[cv.p2];
    return { name: "Sketch Line", measure: `Length : ${f2(Math.hypot(b.x - a.x, b.y - a.y))} mm` };
  }
  if (cv.type === "circle") return { name: "Sketch Circle", measure: `Diameter : ${f2(2 * Math.abs(cv.r))} mm` };
  if (cv.type === "arc") {
    let L = 0;
    try { const pl = S.curvePolyline(d.sk, r.curve, 96); for (let i = 1; i < pl.length; i++) L += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]); } catch { /* ignore */ }
    return { name: "Sketch Arc", measure: `Length : ${f2(L)} mm` };
  }
  if (cv.type === "point") return { name: "Sketch Point", measure: "" };
  if (cv.type === "spline" || cv.type === "ellipse" || cv.type === "earc") {
    let L = 0;
    try { const pl = S.curvePolyline(d.sk, r.curve, 400); for (let i = 1; i < pl.length; i++) L += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]); } catch { /* ignore */ }
    return { name: cv.type === "spline" ? "Sketch Fit Point Spline" : "Sketch Elliptical Curve", measure: `Length : ${f2(L)} mm` };
  }
  return { name: "Sketch Curve", measure: "" };
}

/** Status text for a list of refs, or "" when they are not sketch objects. */
export function statusFor(refs) {
  if (!refs.length) return "";
  if (refs.every((r) => r.kind === "profile")) {
    let area = 0;
    for (const r of refs) { const g = regionOf(r); if (g) area += Math.abs(g.area || 0); }
    return `${refs.length} Profile${refs.length > 1 ? "s" : ""} | Area : ${f2(area)} mm^2`;
  }
  if (refs.length === 1) {
    const r = refs[0];
    if (r.kind === "sketchCurve") {
      const i = curveInfo(r);
      return i ? (i.measure ? `${i.name} | ${i.measure}` : i.name) : "";
    }
    if (r.kind === "sketchPoint") return "Sketch Point";
    if (r.kind === "sketchDim") return "Sketch Dimension";
    if (r.kind === "sketchConstraint") return "Sketch Constraint";
    return "";
  }
  if (refs.every((r) => r.kind === "sketchCurve")) {
    const infos = refs.map(curveInfo).filter(Boolean);
    const names = new Set(infos.map((i) => i.name));
    const name = names.size === 1 ? [...names][0] : "Sketch Curve";
    return `${refs.length} ${name}s`;
  }
  if (refs.every((r) => r.kind === "sketchCurve" || r.kind === "sketchPoint" || r.kind === "sketchDim" || r.kind === "sketchConstraint")) return `${refs.length} Sketch Entities`;
  return "";
}

export function updateStatus() {
  const A = ST.app;
  if (!A || typeof A.setStatus !== "function") return;
  const h = A.selection.hover;
  let text = h ? statusFor([h]) : "";
  if (!text && !h) text = statusFor(A.selection.items);
  if (text) { A.setStatus(text); owned = text; }
  else if (owned) { if (A.status === owned) A.setStatus(""); owned = false; }
}

export function initStatus() {
  const A = ST.app;
  A.on("hover", () => updateStatus());
  A.on("selection", () => updateStatus());
  A.on("mode", () => updateStatus());
}
