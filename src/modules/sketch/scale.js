// Sketch Scale (SketchScaleCmd): Entities, Point, Scale Factor with a drag arrow and live preview.
import { ST, mutateSketch, params, fmtLen } from "./ctx.js";
import { showLive, endLive, storedSketch, curveOfActive, pointOfActive, W, Wdir } from "./dlgutil.js";

function scaledCopy(v) {
  const S = ST.app.S;
  const sk = storedSketch();
  const w = S.cloneSketch(sk);
  const curves = (v.entities || []).filter((r) => r.kind === "sketchCurve").map((r) => r.curve).filter((id) => w.curves[id]);
  const points = (v.entities || []).filter((r) => r.kind === "sketchPoint").map((r) => r.point).filter((id) => w.points[id]);
  const bp = (v.point || [])[0];
  const B = bp && w.points[bp.point] ? [w.points[bp.point].x, w.points[bp.point].y] : [0, 0];
  return { w, curves, points, B };
}

export function openSketchScale() {
  const A = ST.app;
  const sk = storedSketch();
  if (!sk) return null;
  const pre = A.selection.items.filter((r) => (r.kind === "sketchCurve" || r.kind === "sketchPoint") && r.sketch === ST.sketchId);
  return A.ui.dialog.open({
    id: "SketchScaleCmd",
    title: "Sketch Scale",
    icon: "SketchScaleCmd",
    help: "Scales sketch geometry. Select sketch geometry to scale, select the point from which to scale, then drag the manipulator handle in the canvas or specify an exact Scale Factor value.",
    preview: false,
    labelWidth: 86,
    rows: [
      { id: "entities", type: "selection", label: "Entities", kinds: ["sketchCurve", "sketchPoint"], filter: (r) => curveOfActive((cv) => !cv.proj)(r) || pointOfActive((p, id) => id !== "o" && !p.fixed)(r), prompt: "Select sketch geometry to scale" },
      { id: "point", type: "selection", label: "Point", kinds: ["sketchPoint"], max: 1, filter: pointOfActive(), prompt: "Select the point to scale from" },
      { id: "factor", type: "value", label: "Scale Factor", kind: "none", default: "1", positive: true, step: 0.1 },
    ],
    preselect: pre,
    activate: pre.length ? "point" : "entities",
    build: (v) => ((v.entities || []).length && (v.point || []).length ? { type: "sketchScale" } : null),
    validate: (d) => (!(d.num("factor") > 0) ? "The scale factor must be positive" : null),
    manipulators(d) {
      if (!(d.values.point || []).length || !(d.values.entities || []).length) return [];
      const { B } = scaledCopy(d.values);
      // the arrow length is the factor times a screen-friendly reference length
      const sk1 = storedSketch();
      let ref = 10;
      try {
        const S = ST.app.S;
        let mx = 0;
        for (const r of d.values.entities) if (r.kind === "sketchCurve") for (const p of S.curvePolyline(sk1, r.curve, 16)) mx = Math.max(mx, Math.hypot(p[0] - B[0], p[1] - B[1]));
        ref = mx > 1e-6 ? mx : 10;
      } catch { /* keep */ }
      const m = d.valueManip("factor", { origin: W(B), dir: Wdir([1, 0]), scale: ref, min: 0.001, id: "factor" });
      return m ? [m] : [];
    },
    afterPreview(d) {
      const v = d.values;
      if (!(v.entities || []).length || !(v.point || []).length) { endLive(); return; }
      const k = d.num("factor");
      if (!(k > 0)) return;
      const { w, curves, points, B } = scaledCopy(v);
      ST.app.S.scaleEntities(w, curves, points, B, k, params(), fmtLen);
      showLive(w);
    },
    commit(f, d) {
      const k = d.num("factor");
      const v = d.values;
      return mutateSketch("Sketch Scale", (sk2) => {
        const curves = (v.entities || []).filter((r) => r.kind === "sketchCurve").map((r) => r.curve).filter((id) => sk2.curves[id]);
        const points = (v.entities || []).filter((r) => r.kind === "sketchPoint").map((r) => r.point).filter((id) => sk2.points[id]);
        const bp = v.point[0];
        const B = [sk2.points[bp.point].x, sk2.points[bp.point].y];
        ST.app.S.scaleEntities(sk2, curves, points, B, k, params(), fmtLen);
      });
    },
    onClose() { endLive(); },
  });
}
