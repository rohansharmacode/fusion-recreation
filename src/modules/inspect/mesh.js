// INSERT MESH (ParaMeshInsertAlignCommand): reads an STL (binary or ASCII) or OBJ file chosen with
// <input type=file> and inserts it as a display-only mesh body ("Mesh Bodies" folder). Rows follow
// Fusion's dialog: Select from my computer..., Unit Type (one file unit = mm / cm / m / in / ft),
// Flip Up Direction, Center, Move To Ground, then the transform (X / Y / Z Distance, X / Y / Z Angle,
// Scale) with an on-canvas triad (axis arrows + rotation rings) at the mesh centre.
import { f32ToB64, meshWorldInfo, meshPivot, UNIT_MM, IV as V } from "./insert.js";

const AXIS_COL = [0xd8372c, 0x45a72c, 0x2d6fd6];
const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const T_FIELDS = ["tx", "ty", "tz"], R_FIELDS = ["rx", "ry", "rz"];
const UNITS = [["mm", "Millimeter"], ["cm", "Centimeter"], ["m", "Meter"], ["in", "Inch"], ["ft", "Foot"]];
const UNIT_TIPS = { mm: "millimeter", cm: "centimeter", m: "meter", in: "inch", ft: "foot" };
const MAX_BYTES = 80 * 1024 * 1024;

// ------------------------------------------------------------------ parsers
/** Triangle soup (Float32Array, 9 floats per triangle) from an STL ArrayBuffer (binary or ASCII). */
export function parseSTL(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (u8.length >= 84) {
    const n = dv.getUint32(80, true);
    const head = String.fromCharCode(...u8.subarray(0, Math.min(80, u8.length))).trim().toLowerCase();
    const exact = 84 + n * 50 === u8.length;
    if (exact || (!head.startsWith("solid") && 84 + n * 50 <= u8.length)) {
      const out = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) {
        const o = 84 + i * 50 + 12;
        for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(o + k * 4, true);
      }
      return out;
    }
  }
  const text = new TextDecoder().decode(u8);
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  const vals = [];
  let m;
  while ((m = re.exec(text))) vals.push(+m[1], +m[2], +m[3]);
  const nt = Math.floor(vals.length / 9);
  if (!nt) throw new Error("The STL file contains no triangles");
  return Float32Array.from(vals.slice(0, nt * 9));
}

/** Triangle soup from OBJ text (v / f records; polygons fan-triangulated; negative indices). */
export function parseOBJ(text) {
  const vs = [];
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("v ")) {
      const p = line.split(/\s+/);
      vs.push([+p[1], +p[2], +p[3]]);
    } else if (line.startsWith("f ")) {
      const idx = line.split(/\s+/).slice(1).map((t) => {
        const i = parseInt(t.split("/")[0], 10);
        return i < 0 ? vs.length + i : i - 1;
      }).filter((i) => Number.isInteger(i) && i >= 0 && i < vs.length);
      for (let k = 1; k + 1 < idx.length; k++) out.push(...vs[idx[0]], ...vs[idx[k]], ...vs[idx[k + 1]]);
    }
  }
  if (!out.length) throw new Error("The OBJ file contains no faces");
  return Float32Array.from(out);
}

function bboxOf(pos) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) { const v = pos[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  }
  return { min, max };
}

/** Read a mesh File: {name, file, format, positions, data (base64), tris, bbox}. */
export async function readMeshFile(file) {
  const name = String(file.name || "Mesh");
  const ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1];
  const fmt = (ext || "").toLowerCase();
  if (fmt === "3mf") throw new Error("3MF files are not supported in this recreation (use STL or OBJ)");
  if (fmt !== "stl" && fmt !== "obj") throw new Error(`Cannot insert ${name}: choose an STL or OBJ file`);
  if (file.size > MAX_BYTES) throw new Error(`${name} is too large for this recreation (${(file.size / 1048576).toFixed(0)} MB)`);
  const buf = await file.arrayBuffer();
  const positions = fmt === "stl" ? parseSTL(buf) : parseOBJ(new TextDecoder().decode(new Uint8Array(buf)));
  for (let i = 0; i < positions.length; i++) if (!Number.isFinite(positions[i])) throw new Error(`Cannot insert ${name}: it contains invalid coordinates`);
  return { name: name.replace(/\.[^.]+$/, "") || "Mesh", file: name, format: fmt, positions, data: f32ToB64(positions), tris: positions.length / 9, bbox: bboxOf(positions), size: file.size };
}

// ------------------------------------------------------------------ dialog
export function openInsertMesh(app, store, view, opts = {}) {
  if (!app.ui.dialog) return null;
  if (app.mode === "sketch") {
    const stop = app.commands.get("SketchStop");
    if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model");
  }
  let mesh = null; // parsed file
  let loadError = null;
  let dlgRef = null;
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".stl,.obj,.3mf";
  fileInput.dataset.input = "meshFile";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!f || !dlgRef || dlgRef.closed) return;
    readMeshFile(f).then((r) => {
      if (dlgRef.closed) return;
      mesh = r;
      loadError = null;
      if (r.tris > 200000) app.toast(`${r.file} has ${r.tris.toLocaleString()} triangles: display may be slow`, "warning", 4000);
      dlgRef.refresh();
      dlgRef.previewNow();
    }).catch((e) => {
      if (dlgRef.closed) return;
      loadError = e.message || String(e);
      dlgRef.refresh();
      dlgRef.previewNow();
    });
  });
  const pickFile = () => { try { fileInput.click(); } catch (e) { console.error(e); } };
  const has = () => !!mesh;
  const units0 = UNIT_MM[app.doc.units] ? app.doc.units : "mm";

  /** Current def from the dialog values (positions attached for the preview). */
  const defOf = (v, d) => {
    if (!mesh) return null;
    const n = (k, dflt = 0) => { const x = d.num(k); return Number.isFinite(x) ? x : dflt; };
    return {
      name: mesh.name, file: mesh.file, format: mesh.format, units: v.units, flipUp: !!v.flipUp,
      tx: n("tx"), ty: n("ty"), tz: n("tz"), rx: n("rx"), ry: n("ry"), rz: n("rz"), scale: n("scale", 1),
      data: mesh.data, tris: mesh.tris, bbox: mesh.bbox, _positions: mesh.positions,
    };
  };
  const setT = (d, t) => { T_FIELDS.forEach((k, i) => d.set(k, d.fmt(+t[i].toFixed(6), "length"), { user: true, noPreview: true })); d.previewNow(); };

  const dlg = app.ui.dialog.open({
    id: "ParaMeshInsertAlignCommand",
    title: "Insert Mesh",
    icon: "ParaMeshInsertAlignCommand",
    featureLabel: "Insert Mesh",
    help: "Inserts an existing STL or OBJ file as a mesh body. For STL or OBJ files, select the unit type that matches the units of the design that generated the file.",
    preview: false,
    activate: false,
    ctrlWidth: 150,
    rows: [
      {
        id: "file", type: "text", label: "Mesh Body", tooltip: "Select from my computer...",
        text: () => (mesh ? mesh.file : "Select from my computer..."),
        extra: () => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "insp-file-btn";
          b.dataset.input = "file";
          b.title = "Select from my computer...";
          b.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.2h4.6l1.3 1.4h7.1v7.7H1.5z" fill="#f5d27a" stroke="#9a7a2a" stroke-width=".9"/><path d="M1.5 6.6h13" stroke="#9a7a2a" stroke-width=".8"/></svg>`;
          b.addEventListener("click", pickFile);
          return b;
        },
      },
      { id: "units", type: "dropdown", label: "Unit Type", default: units0, options: UNITS.map(([value, label]) => ({ value, label })), tooltip: "One unit from the original file equals one " + UNIT_TIPS[units0] + "." },
      { id: "flipUp", type: "check", label: "Flip Up Direction", default: false, tooltip: "Flips direction of Y and Z axes." },
      {
        id: "place", type: "custom",
        render(d) {
          const box = document.createElement("div");
          box.className = "insp-mesh-place";
          const mk = (act, label, tip, fn) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "insp-btn";
            b.dataset.action = act;
            b.textContent = label;
            b.title = tip;
            b.addEventListener("click", () => { if (mesh) fn(d); });
            return b;
          };
          box.append(
            mk("center", "Center", "Centers the mesh body on the origin of the active component.", (dd) => {
              const def = defOf(dd.values, dd);
              setT(dd, meshPivot(def).map((x) => -x));
            }),
            mk("ground", "Move To Ground", "Positions the bottom of the mesh body to rest on the ground plane of the active component.", (dd) => {
              const def = defOf(dd.values, dd);
              const info = meshWorldInfo(def, mesh.positions);
              setT(dd, [def.tx, def.ty, def.tz - info.zmin]);
            }),
          );
          return box;
        },
        update(el) { for (const b of el.querySelectorAll("button")) b.disabled = !mesh; },
      },
      { id: "tx", type: "value", label: "X Distance", kind: "length", default: "0.00 mm", sep: true, visible: has },
      { id: "ty", type: "value", label: "Y Distance", kind: "length", default: "0.00 mm", visible: has },
      { id: "tz", type: "value", label: "Z Distance", kind: "length", default: "0.00 mm", visible: has },
      { id: "rx", type: "value", label: "X Angle", kind: "angle", default: "0.0 deg", visible: has },
      { id: "ry", type: "value", label: "Y Angle", kind: "angle", default: "0.0 deg", visible: has },
      { id: "rz", type: "value", label: "Z Angle", kind: "angle", default: "0.0 deg", visible: has },
      { id: "scale", type: "value", label: "Scale", kind: "none", default: "1", positive: true, visible: has },
    ],
    onOpen(d) {
      dlgRef = d;
      d.el.classList.add("insp-dlg", "insp-mesh-dlg");
      d.el.appendChild(fileInput);
    },
    prompt: () => (mesh ? "" : "Select an STL or OBJ file to insert"),
    build: (v, d) => defOf(v, d),
    afterPreview(d) {
      view.setPreviewMesh(d.feature);
      if (loadError) d.message(loadError, "error");
      else if (mesh) d.message(`${mesh.tris.toLocaleString()} triangles`, "info");
    },
    status: (d) => (mesh && d.feature ? mesh.name : ""),
    manipulators(d) {
      const def = d.feature;
      if (!def) return [];
      const c = meshWorldInfo(def, null).center;
      const out = [];
      T_FIELDS.forEach((k, i) => {
        const m = d.valueManip(k, { origin: c, dir: AXES[i], fixedDir: true });
        if (!m) return;
        m.origin = V.sub(c, V.mul(AXES[i], m.value));
        Object.assign(m, { look: "axis", color: AXIS_COL[i], len: 110, gap: 11 });
        out.push(m);
      });
      const refs = [[0, 1, 0], [0, 0, 1], [1, 0, 0]];
      R_FIELDS.forEach((k, i) => {
        const m = d.angleManip(k, { center: c, axis: AXES[i], ref: refs[i], radius: 1, min: -360, max: 360 });
        if (!m) return;
        Object.assign(m, { screenRadius: 80, span: 22, gripAt: 45, color: AXIS_COL[i], lineWidth: 2.4 });
        out.push(m);
      });
      return out;
    },
    commit(def) {
      const { _positions, ...rest } = def;
      return store.add("mesh", rest, "Insert Mesh");
    },
    onClose() { view.setPreviewMesh(null); },
  });
  return dlg;
}
