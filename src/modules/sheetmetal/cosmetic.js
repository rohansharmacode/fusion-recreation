// sheetmetal: Cosmetic Bend (FusionSheetMetalCosmeticBendCmd, FLAT PATTERN > MODIFY). Lines that represent bends
// or creases in the flat pattern, without changing the folded model. Feature 'smCosmeticBend':
//   { body, lines: [{sketch, curve}], bendType: 'crease' | 'pressBrake', direction: 'up' | 'down',
//     angle: '90.0 deg', radius: '1.00 mm', notes }
// The evaluation only checks the lines (straight sketch lines) and returns their world end points
// (result.cosmetic); the FLAT PATTERN view draws them (crease: solid, press brake: dashed; up blue, down red).
import * as M from "../../model.js";
import * as K from "../../kernel.js";
import * as R from "./rules.js";
import { beginModelCommand } from "../dialogs/common.js";

const V = K.V;
export const TYPE = "smCosmeticBend";
const CMD = "FusionSheetMetalCosmeticBendCmd";
const TIP = "Create lines that represent bends or creases in the flat pattern and drawing, without changing the folded model.";
const NO_LINE = "Select a straight sketch line to define the cosmetic bend.";

function cosmeticApply(st, f, P) {
  if (!f.body || !st.bodies.has(f.body)) throw new Error("The sheet metal body of the cosmetic bend is missing");
  if (f.bendType === "pressBrake") {
    const a = M.fval(P, f, "angle");
    if (!(a > 0 && a <= 360)) throw new Error("Cannot compute Cosmetic Bend. Bend angle value is out of range. Enter a value greater than 0 deg and less than or equal to 360 deg.");
    const r = M.fval(P, f, "radius");
    if (!(r >= 0)) throw new Error("Cannot compute Cosmetic Bend. Bend radius value is invalid. Enter a value greater than or equal to 0.");
  }
  const lines = [];
  for (const l of f.lines || []) {
    const s = st.sketches.get(l.sketch);
    const cv = s && s.sk && s.sk.curves[l.curve];
    if (!cv || cv.type !== "line") throw new Error(NO_LINE);
    const p1 = s.sk.points[cv.p1], p2 = s.sk.points[cv.p2];
    lines.push({ a: K.toWorld(s.plane, p1.x, p1.y), b: K.toWorld(s.plane, p2.x, p2.y), n: s.plane.n });
  }
  if (!lines.length) throw new Error(NO_LINE);
  return { affected: [], cosmetic: lines };
}

const FEATURE = {
  label: "Cosmetic Bend", stem: "CosmeticBend", icon: CMD,
  fields: { angle: "angle", radius: "length" },
  makesBodies: () => false,
  apply: cosmeticApply,
  deps: (f) => ({ sketches: [...new Set((f.lines || []).map((l) => l.sketch))], cplanes: [], bodies: f.body ? [f.body] : [], features: [], geo: [] }),
};

function ruleRadius(app) {
  try { return `${R.evalRule(R.ruleFor(app.doc), M.buildParams(app.doc)).R.toFixed(2)} mm`; } catch { return "1.00 mm"; }
}
/** Flat pattern solid bbox of a sheet metal body (world), or null. */
function flatBox(app, body) {
  try { const r = app.ui.sheetMetal.flatOf(body); return K.bboxOf(r.fp.solid); } catch { return null; }
}

export function openCosmeticBend(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const body = f0 ? f0.body : app.ui.sheetMetal && app.ui.sheetMetal.flatActive;
  if (!body) { app.toast("Create a flat pattern first: Cosmetic Bend works in the FLAT PATTERN environment", "warning", 3600); return null; }
  const isLine = (dlg, r) => { const s = dlg.baseState.sketches.get(r.sketch); const cv = s && s.sk && s.sk.curves[r.curve]; return !!cv && cv.type === "line"; };
  const press = (v) => v.bendType === "pressBrake";
  return app.ui.dialog.open({
    id: CMD, title: "Cosmetic Bend", icon: CMD, featureLabel: "Cosmetic Bend", editId, help: TIP,
    preselect: (opts.preselect || []).filter((r) => r.kind === "sketchCurve"),
    rows: [
      { id: "lines", type: "selection", label: "Profiles", kinds: ["sketchCurve"], filter: (r, dlg) => isLine(dlg, r), prompt: NO_LINE, tooltip: "Select sketch profiles to create bend line on the flat pattern." },
      { id: "bendType", type: "dropdown", label: "Bend type", default: "crease", options: [{ value: "crease", label: "Crease" }, { value: "pressBrake", label: "Press brake" }], tooltip: "Crease represents the bend as a sharp line; Press brake represents the bend with a defined radius and angle for manufacturing representation." },
      { id: "direction", type: "dropdown", label: "Direction", default: "up", options: [{ value: "up", label: "Up" }, { value: "down", label: "Down" }], tooltip: "Specifies whether the bend is shown on the top (Up) or the bottom (Down) side of the flat pattern." },
      { id: "angle", type: "value", label: "Bend angle", kind: "angle", default: "90.0 deg", visible: press, tooltip: "Specifies the angle of the bend for manufacturing reference. Doesn't change the folded model." },
      { id: "radius", type: "value", label: "Bend radius", kind: "length", nonNegative: true, default: ruleRadius(app), visible: press, tooltip: "Specifies the bend radius for manufacturing reference. Doesn't change the folded model." },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, {
        lines: (f0.lines || []).map((l) => ({ kind: "sketchCurve", sketch: l.sketch, curve: l.curve })),
        bendType: f0.bendType || "crease", direction: f0.direction || "up",
      });
      if (f0.angle) dlg.values.angle = String(f0.angle);
      if (f0.radius) dlg.values.radius = String(f0.radius);
    },
    validate(dlg) {
      const bb = flatBox(app, body);
      if (!bb) return null;
      for (const r of dlg.values.lines || []) {
        const s = app.sketchState(r.sketch);
        const cv = s && s.sk && s.sk.curves[r.curve];
        if (!cv || cv.type !== "line") continue;
        const p1 = s.sk.points[cv.p1], p2 = s.sk.points[cv.p2];
        const m = V.mul(V.add(K.toWorld(s.plane, p1.x, p1.y), K.toWorld(s.plane, p2.x, p2.y)), 0.5);
        if ([0, 1].some((i) => m[i] < bb.min[i] - 1 || m[i] > bb.max[i] + 1)) return "The selected line lies outside the flat pattern. Place the line on the flat pattern to define a cosmetic bend.";
      }
      return null;
    },
    build(v) {
      const lines = (v.lines || []).map((r) => ({ sketch: r.sketch, curve: r.curve }));
      if (!lines.length) return null;
      const f = { type: TYPE, body, lines, bendType: v.bendType, direction: v.direction };
      if (press(v)) { f.angle = v.angle; f.radius = v.radius; }
      return f;
    },
    status: (dlg) => { const n = (dlg.values.lines || []).length; return n ? `${n} Line${n > 1 ? "s" : ""}` : ""; },
  });
}

/** Draws the cosmetic bends of the flat pattern shown in the FLAT PATTERN environment. */
function installDisplay(app) {
  let group = null;
  const clear = () => {
    if (!group) return;
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    if (group.parent) group.parent.remove(group);
    group = null;
  };
  const draw = () => {
    clear();
    const vp = app.viewport, T = vp && vp.THREE;
    const body = app.ui.sheetMetal && app.ui.sheetMetal.flatActive;
    if (!T || !body || !app.result) return;
    const res = app.result.results || {};
    const segs = { up: [[], []], down: [[], []] }; // [crease, press brake]
    for (const f of app.doc.features) {
      if (f.type !== TYPE || f.body !== body || f.suppressed) continue;
      const r = res[f.id];
      if (!r || !r.ok || !r.cosmetic) continue;
      const dst = segs[f.direction === "down" ? "down" : "up"][f.bendType === "pressBrake" ? 1 : 0];
      for (const l of r.cosmetic) dst.push(...l.a, ...l.b);
    }
    group = new T.Group();
    group.name = "sm-cosmetic-bends";
    const add = (arr, color, dashed) => {
      if (!arr.length) return;
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.BufferAttribute(new Float32Array(arr), 3));
      const mat = dashed ? new T.LineDashedMaterial({ color, dashSize: 3, gapSize: 1, depthTest: false }) : new T.LineBasicMaterial({ color, depthTest: false });
      const ls = new T.LineSegments(g, mat);
      ls.renderOrder = 10;
      if (dashed) ls.computeLineDistances();
      group.add(ls);
    };
    add(segs.up[0], 0x1f6fd1, false); add(segs.up[1], 0x1f6fd1, true);
    add(segs.down[0], 0xd1372c, false); add(segs.down[1], 0xd1372c, true);
    vp.scene.add(group);
    vp.requestRender();
  };
  const redraw = () => { try { draw(); } catch (e) { console.warn("[sheetmetal] cosmetic bends", e); } };
  app.on("model", (e) => { if (!e || !e.preview) redraw(); });
  app.on("environment", redraw);
}

let registered = false;
export function registerCosmeticBend(app) {
  if (!registered && !M.isFeatureType(TYPE)) {
    registered = true;
    M.registerFeature(TYPE, { ...FEATURE, editor: (a, id) => { beginModelCommand(a); return openCosmeticBend(a, { editId: id }); } });
  }
  app.commands.register({
    id: CMD, label: "Cosmetic Bend", tooltip: TIP, kind: "feature", when: "flatpattern",
    run: (a, ctx = {}) => { const pre = beginModelCommand(a); return openCosmeticBend(a, { preselect: ctx.preselect || pre }); },
  });
  installDisplay(app);
}
