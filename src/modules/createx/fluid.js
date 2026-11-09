// createx: Fluid Volume (EnclosureCommand). Feature 'fluidvolume': the volume enclosed by solid bodies
// (Internal; openings closed with cap planes / surface bodies) or the volume around them inside a box,
// cylinder, sphere or hemisphere boundary (External). The result is one new body (or one body per volume
// with Split Result).
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import * as R0 from "../dialogs/util.js";
import { V, bodiesBox, compoundOf, minCircle, bodyPoints } from "./geom.js";

const R = K.R;

function boundaryShape(f, P, bb, st, solids) {
  const off = f.offset !== undefined ? M.fval(P, f, "offset") : 10;
  if (!(off >= 0)) throw new Error("The offset must not be negative");
  const shape = f.shape || "box";
  const c = V.mul(V.add(bb.min, bb.max), 0.5);
  if (shape === "box") {
    const mn = V.sub(bb.min, [off, off, off]), mx = V.add(bb.max, [off, off, off]);
    const pl = { o: [0, 0, mn[2]], x: [1, 0, 0], n: [0, 0, 1] };
    return K.extrudeDrawing(R.drawRectangle(mx[0] - mn[0], mx[1] - mn[1]).translate((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2), pl, 0, mx[2] - mn[2], 0);
  }
  const ax = { x: 0, y: 1, z: 2 }[f.dir || "z"];
  const A = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const n = A[ax], u = A[(ax + 1) % 3];
  const pts = solids.flatMap((id) => bodyPoints(st, id));
  if (shape === "sphere" || shape === "hemisphere") {
    // hemisphere: centred on the bottom of the bodies (the top with Flip Direction), dome along the direction
    const sgn = f.flip ? -1 : 1;
    const ctr = [...c];
    if (shape === "hemisphere") ctr[ax] = sgn > 0 ? bb.min[ax] - off : bb.max[ax] + off;
    let r = 0;
    for (const p of pts) r = Math.max(r, V.len(V.sub(p, ctr)));
    r += off;
    const sp = R.makeSphere(r);
    const s = K.translated(sp, ctr);
    K.del(sp);
    if (shape === "sphere") return s;
    const pl = { o: ctr, x: u, n: V.mul(n, sgn) };
    const half = K.extrudeDrawing(R.drawRectangle(2 * r + 4, 2 * r + 4), pl, 0, r + 2, 0);
    try { return K.intersect(s, half); } finally { K.del(s, half); }
  }
  // cylinder along the shape direction
  const iu = (ax + 1) % 3, iv = (ax + 2) % 3;
  const circ = minCircle(pts.map((p) => [p[iu], p[iv]]));
  const r = circ.r + off;
  const o = [0, 0, 0];
  o[ax] = bb.min[ax] - off;
  const pl = { o, x: u, n };
  return K.extrudeDrawing(R.drawCircle(r).translate(circ.c[0], circ.c[1]), pl, 0, bb.max[ax] - bb.min[ax] + 2 * off, 0);
}

/** Pieces of `env` (solids) after splitting with the cap shapes. */
function splitPieces(env, caps) {
  if (!caps.length) return K.solidsOf(env);
  return K.splitShape(env, caps);
}

export function registerFluidFeature(app) {
  M.registerFeature("fluidvolume", {
    label: "Fluid Volume",
    stem: "Fluid Volume",
    fields: { offset: "length" },
    makesBodies: true,
    apply(st, f, P, doc) {
      const tools = (f.bodies || []).filter((id) => st.bodies.has(id));
      const solids = tools.filter((id) => M.isSolidBody(st, id));
      if (!solids.length) throw new Error("Select solid bodies and cap surfaces or planes");
      const surfaces = tools.filter((id) => !M.isSolidBody(st, id));
      const bb = bodiesBox(st, solids);
      const diag = V.len(V.sub(bb.max, bb.min));
      const owned = [];
      const caps = surfaces.map((id) => st.bodies.get(id).shape);
      const pieces = [];
      try {
        const margin = Math.max(5, diag * 0.25);
        const half = diag + margin * 4;
        for (const pr of f.planes || []) {
          const pl = M.resolvePlane(pr, st);
          if (!pl) throw new Error("A cap plane is missing");
          const sq = K.planeSquareFace(pl, V.mul(V.add(bb.min, bb.max), 0.5), half);
          owned.push(sq);
          caps.push(sq);
        }
        const solidShapes = solids.map((id) => st.bodies.get(id).shape);
        let outer, env;
        if (f.volume === "external") {
          outer = boundaryShape(f, P, bb, st, solids);
          owned.push(outer);
          env = K.cutMany(outer, solidShapes);
        } else {
          const mn = V.sub(bb.min, [margin, margin, margin]), mx = V.add(bb.max, [margin, margin, margin]);
          outer = K.extrudeDrawing(R.drawRectangle(mx[0] - mn[0], mx[1] - mn[1]).translate((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2), { o: [0, 0, mn[2]], x: [1, 0, 0], n: [0, 0, 1] }, 0, mx[2] - mn[2], 0);
          owned.push(outer);
          env = K.cutMany(outer, solidShapes);
        }
        owned.push(env);
        const parts = splitPieces(env, caps);
        const outerFaces = K.facesOf(outer);
        owned.push(...outerFaces);
        const obb = K.bboxOf(outer);
        const touchesOuter = (s) => {
          const b = K.bboxOf(s);
          if (f.volume !== "external") {
            const eps = 1e-3;
            for (let i = 0; i < 3; i++) if (b.min[i] <= obb.min[i] + eps || b.max[i] >= obb.max[i] - eps) return true;
            return false;
          }
          return outerFaces.some((fc) => { try { return K.shapeDistance(s, fc) < 1e-4; } catch { return false; } });
        };
        for (const s of parts) {
          const keep = f.volume === "external" ? touchesOuter(s) : !touchesOuter(s);
          let vol = 0;
          try { vol = K.volumeOf(s); } catch { vol = 0; }
          if (keep && vol > 1e-6) pieces.push(s); else if (s !== env) owned.push(s);
        }
      } catch (e) {
        K.del(owned.filter((s) => !pieces.includes(s)));
        throw e;
      }
      K.del(owned.filter((s) => !pieces.includes(s)));
      if (!pieces.length) {
        throw new Error(f.volume === "external" ? "No external void has been detected for given inputs. Please try to increase the offset."
          : "No internal void has been detected for given inputs. Select cap planes or surfaces to close the openings.");
      }
      const ids = [];
      if (f.split && pieces.length > 1) {
        pieces.forEach((s, i) => { const id = i === 0 ? f.newBody : `${f.id}_${i}`; st.bodies.set(id, { id, shape: s, from: f.id }); ids.push(id); });
      } else {
        const s = compoundOf(pieces);
        st.bodies.set(f.newBody, { id: f.newBody, shape: s, from: f.id });
        ids.push(f.newBody);
      }
      let volume = 0;
      for (const s of pieces) { try { volume += K.volumeOf(s); } catch { /* ignore */ } }
      return { affected: ids, volume, count: pieces.length };
    },
    deps: (f) => ({ sketches: [], bodies: f.bodies || [], features: [], cplanes: (f.planes || []).filter((p) => p.kind === "cplane").map((p) => p.id), geo: [] }),
    editor: (a, id) => openFluidVolume(a, { editId: id }),
    icon: "EnclosureCommand",
  });
}

// ---------------------------------------------------------------- dialog
export function openFluidVolume(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const toTool = (r) => (r.kind === "face" ? { kind: "body", body: r.body } : r);
  return app.ui.dialog.open({
    id: "EnclosureCommand",
    title: "Fluid Volume",
    icon: "EnclosureCommand",
    editId,
    featureLabel: "Fluid Volume",
    help: "Creates the surrounding volume from selected bodies. Surrounding volume can be internal or external to the bodies.",
    preselect: (opts.preselect || []).map(toTool),
    rows: [
      { id: "volume", type: "dropdown", label: "Volume", options: [{ value: "internal", label: "Internal" }, { value: "external", label: "External" }], default: "internal" },
      { id: "tools", type: "selection", label: "Tool", kinds: ["body", "face", "cplane", "originPlane"], mapRef: toTool, prompt: "Select solid bodies and cap surfaces or planes", tooltip: "Select solid bodies, capping surfaces, or work planes as tools to form the surrounding volume." },
      { id: "gb", type: "group", label: "Boundary Shape", visible: (v) => v.volume === "external", rows: [
        { id: "shape", type: "dropdown", label: "Shape Type", options: [{ value: "box", label: "Box" }, { value: "cylinder", label: "Cylinder" }, { value: "sphere", label: "Sphere" }, { value: "hemisphere", label: "Hemisphere" }], default: "box" },
        { id: "dir", type: "dropdown", label: "Shape Direction", options: [{ value: "x", label: "X-Axis" }, { value: "y", label: "Y-Axis" }, { value: "z", label: "Z-Axis" }], default: "z", visible: (v) => v.shape === "cylinder" || v.shape === "hemisphere" },
        { id: "flip", type: "check", label: "Flip Direction", default: false, visible: (v) => v.shape === "hemisphere" },
        { id: "offset", type: "value", label: "Offset", kind: "length", default: "10.00 mm", nonNegative: true },
      ] },
      { id: "split", type: "check", label: "Split Result", default: false, sep: true },
    ],
    init(dlg) {
      if (!f0) return;
      Object.assign(dlg.values, {
        volume: f0.volume || "internal", shape: f0.shape || "box", dir: f0.dir || "z", flip: !!f0.flip, split: !!f0.split,
        tools: [...(f0.bodies || []).map((b) => ({ kind: "body", body: b })), ...(f0.planes || []).map((p) => R0.refFromPlaneRef(p, dlg.baseState)).filter(Boolean)],
      });
      if (f0.offset !== undefined) dlg.values.offset = String(f0.offset);
    },
    build(v) {
      const bodies = [], planes = [];
      for (const r of v.tools || []) {
        if (r.kind === "body") bodies.push(r.body);
        else { const pr = R0.planeRefFromRef(r); if (pr) planes.push(pr); }
      }
      if (!bodies.length) return null;
      // the surrounding volume is created in a new component (core gives it newComp / newOcc)
      const f = { type: "fluidvolume", operation: "newComponent", volume: v.volume, bodies: [...new Set(bodies)], planes, split: !!v.split };
      if (v.volume === "external") Object.assign(f, { shape: v.shape, dir: v.dir, flip: !!v.flip, offset: v.offset });
      return f;
    },
    status(dlg) {
      const r = dlg.previewRes;
      if (!r || !r.ok || !Number.isFinite(r.volume)) return "";
      return `${r.count} Volume${r.count > 1 ? "s" : ""} | Volume : ${r.volume.toFixed(2)} mm^3`;
    },
  });
}
