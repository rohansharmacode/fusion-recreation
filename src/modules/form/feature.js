// The Form timeline feature ('form', Fusion's Form1) and the 'tspline' body kind.
// f = {type:'form', id, name, bodies:[cage...]} (cage format: cage.js). While the FORM environment edits the
// feature its bodies are T-spline bodies (st.meshBodies, kind 'tspline': smooth limit mesh + control cage);
// otherwise (finished, or Convert-ed bodies) they are B-rep bodies converted by brep.js (solid when closed).
import { subdivide, displayMesh, boxMesh } from "./subdiv.js";
import { cageToShape } from "./brep.js";
import { bbox as cageBox } from "./cage.js";

/** Module state shared by the form files. */
export const FORM = {
  editing: null, // id of the Form feature open in the FORM environment
  display: new Map(), // body id -> 'smooth' | 'box' | 'frame' (Display Mode; view setting, not saved)
  perf: false, // Enable Better Performance (checked: coarser smooth mesh, faster display)
};
export const displayOf = (id) => FORM.display.get(id) || "smooth";

const ENTRY = new Map();
function levelFor(c) {
  const n = c.f.length;
  let L = n <= 120 ? 3 : n <= 1000 ? 2 : 1;
  if (FORM.perf) L = Math.max(1, L - 1);
  return L;
}
/** Display data of a cage (cached by geometry): {sub, smooth, box(), edgeLines, bbox}. */
export function evalCage(c) {
  const L = levelFor(c);
  const key = JSON.stringify([c.v, c.f, c.crease || [], c.cv || [], L]);
  let e = ENTRY.get(key);
  if (e) { ENTRY.delete(key); ENTRY.set(key, e); return e; }
  const sub = subdivide(c, L, { track: true });
  const smooth = displayMesh(sub, c.f.length);
  let boxM = null;
  e = {
    key, sub, smooth,
    box: () => boxM || (boxM = boxMesh(c)),
    // limit-surface polyline of cage edge (a, b): [[x,y,z]...] from a to b
    edgeCurve(a, b) {
      const ch = sub.chains.get(a < b ? a * 2097152 + b : b * 2097152 + a);
      if (!ch) return [c.v[a], c.v[b]];
      const arr = a < b ? Array.from(ch) : Array.from(ch).reverse();
      return arr.map((v) => [sub.P[3 * v], sub.P[3 * v + 1], sub.P[3 * v + 2]]);
    },
    limit: (i) => [sub.P[3 * i], sub.P[3 * i + 1], sub.P[3 * i + 2]],
  };
  ENTRY.set(key, e);
  while (ENTRY.size > 40) ENTRY.delete(ENTRY.keys().next().value);
  return e;
}

function meshBBox(m) {
  const p = m.positions;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]); }
  return { min: lo, max: hi };
}

/** Registers the 'form' feature type. K = kernel namespace, M = model namespace. */
export function registerFormFeature(M, K, editor) {
  if (M.isFeatureType && M.isFeatureType("form") && M.featureDef("form") && !M.featureDef("form").builtin) return;
  M.registerFeature("form", {
    label: "Form",
    stem: "Form",
    fields: {},
    icon: "TSplineBaseFeatureCreationCommand",
    apply(st, f) {
      const editing = FORM.editing === f.id;
      const affected = [];
      let faceted = 0;
      if (!st.meshBodies) st.meshBodies = new Map();
      for (const c of f.bodies || []) {
        if (!c || !c.id || !c.f || !c.f.length) continue;
        affected.push(c.id);
        if (editing && !c.converted) {
          const e = evalCage(c);
          st.meshBodies.set(c.id, { id: c.id, kind: "tspline", mesh: e.smooth, data: { cage: c, ev: e, form: f.id }, bbox: () => meshBBox(e.smooth), from: f.id });
        } else {
          const r = cageToShape(K, c);
          if (r.faceted) faceted++;
          st.bodies.set(c.id, { id: c.id, shape: r.shape, from: f.id });
        }
        // bodies made with Operation New Component belong to their own occurrence (under the form's component)
        if (c.occ && c.comp && st.occ && st.bodyOcc) {
          const parent = f.occ && st.occ.has(f.occ) ? f.occ : M.ROOT || "root";
          if (!st.occ.has(c.occ)) st.occ.set(c.occ, { id: c.occ, component: c.comp, parent, T: M.occTransform ? M.occTransform(st, parent) : undefined });
          st.bodyOcc.set(c.id, c.occ);
        }
      }
      const out = { affected };
      if (faceted) out.warning = `${faceted} T-Spline bod${faceted > 1 ? "ies were" : "y was"} converted to a faceted body`;
      return out;
    },
    deps: () => ({ sketches: [], cplanes: [], bodies: [], features: [], geo: [] }),
    touches: () => [],
    editor,
  });
}

/** 'tspline' body kind hooks (mesh / render / pick are filled in by view.js). */
export function tsplineKind(view) {
  return {
    label: "T-Spline Body",
    brep: false,
    edges: "none", // the render hook draws the T-spline edges itself (in every visual style, like Fusion)
    shading: "smooth",
    exportSTL: true,
    mesh(entry) {
      if (!entry || !entry.data || !entry.data.ev) return entry && entry.mesh;
      const ev = entry.data.ev, mode = displayOf(entry.id);
      // a distinct object per display mode: the viewport rebuilds the body (and its cage) when it changes
      if (mode === "box") return ev.box();
      if (mode === "frame") return ev.frameMesh || (ev.frameMesh = { ...ev.smooth });
      return ev.smooth;
    },
    render: (entry, app) => view.renderCage(entry, app),
    pick: (entry, x, y, ray, opts) => view.pick(entry, x, y, ray, opts),
    info(entry) {
      const c = entry && entry.data && entry.data.cage;
      return c ? { tsVertices: c.v.length, tsFaces: c.f.length, size: cageBox(c).size } : {};
    },
  };
}
