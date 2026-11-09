// INSERT MESH (ParaMeshInsertAlignCommand): reads an STL (binary or ASCII), OBJ or 3MF file chosen with
// <input type=file> and inserts it as a MESH BODY: a `mesh` timeline feature (Fusion's mesh base feature,
// "Mesh1" in the timeline) whose triangles live in doc.meshData; the body (named after the file) is listed in the
// browser's Bodies folder with the mesh icon, picks as meshFace refs, moves / deletes / hides / exports like other
// bodies. Rows follow Fusion's dialog: Select from my computer..., Unit Type (one file unit = cm / mm / m / in / ft),
// Flip Up Direction, Center, Move To Ground, Reset, then X / Y / Z Distance, X / Y / Z Angle and Scale with an
// on-canvas triad (axis arrows + rotation rings) at the mesh centre. Edit Feature reopens this dialog.
import { prepareFeature } from "../../app/core.js";
import * as MD from "../../meshdata.js";
import { UNIT_MM, IV as V } from "./insert.js";

const AXIS_COL = [0xd8372c, 0x45a72c, 0x2d6fd6];
const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const T_FIELDS = ["tx", "ty", "tz"], R_FIELDS = ["rx", "ry", "rz"];
// Fusion's Unit Type list (help: "Centimeter, Millimeter, Meter, Inch, or Foot")
const UNITS = [["cm", "Centimeter"], ["mm", "Millimeter"], ["m", "Meter"], ["in", "Inch"], ["ft", "Foot"]];
const UNIT_TIPS = { mm: "millimeter", cm: "centimeter", m: "meter", in: "inch", ft: "foot" };
const MAX_BYTES = 80 * 1024 * 1024;

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

/** Triangle soup from a 3MF package (ZIP with 3D/*.model XML: <vertex x y z/> + <triangle v1 v2 v3/>). */
export async function parse3MF(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  // end of central directory
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("The 3MF file is not a valid package");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const models = [];
  for (let k = 0; k < count && p + 46 <= u8.length; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!/\.model$/i.test(name)) continue;
    const ln = dv.getUint16(local + 26, true), lx = dv.getUint16(local + 28, true);
    const data = u8.subarray(local + 30 + ln + lx, local + 30 + ln + lx + csize);
    let raw;
    if (method === 0) raw = data;
    else if (method === 8) {
      if (typeof DecompressionStream !== "function") throw new Error("This browser cannot read compressed 3MF files");
      const ds = new DecompressionStream("deflate-raw");
      raw = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer());
    } else throw new Error("Unsupported 3MF compression");
    models.push(new TextDecoder().decode(raw));
  }
  if (!models.length) throw new Error("The 3MF file contains no 3D model");
  const out = [];
  const attr = (s, a) => { const r = new RegExp(`\\b${a}\\s*=\\s*"([^"]*)"`).exec(s); return r ? Number(r[1]) : NaN; };
  const sattr = (s, a) => { const r = new RegExp(`\\b${a}\\s*=\\s*"([^"]*)"`).exec(s); return r ? r[1] : null; };
  // 3MF transforms are 12 numbers in row-vector order: p' = [x y z 1] * M (3x4 written by rows m00 m01 m02 m10 ...)
  const parseT = (s) => { const t = s && s.trim().split(/\s+/).map(Number); return t && t.length === 12 && t.every(Number.isFinite) ? t : null; };
  const mulT = (a, b) => { // a then b
    if (!a) return b; if (!b) return a;
    const r = new Array(12);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j] + (i === 3 ? b[9 + j] : 0);
    return r;
  };
  const meshTris = (mesh, T) => {
    const vs = [];
    const vr = /<vertex\b([^>]*)\/?>/g;
    let m;
    while ((m = vr.exec(mesh))) {
      const x = attr(m[1], "x"), y = attr(m[1], "y"), z = attr(m[1], "z");
      vs.push(T ? [x * T[0] + y * T[3] + z * T[6] + T[9], x * T[1] + y * T[4] + z * T[7] + T[10], x * T[2] + y * T[5] + z * T[8] + T[11]] : [x, y, z]);
    }
    const tr = /<triangle\b([^>]*)\/?>/g;
    while ((m = tr.exec(mesh))) {
      const a = vs[attr(m[1], "v1")], b = vs[attr(m[1], "v2")], c = vs[attr(m[1], "v3")];
      if (a && b && c) out.push(...a, ...b, ...c);
    }
  };
  for (const xml of models) {
    // objects: <object id=".."> holding a <mesh> or <components> (component objectid + transform)
    const objects = new Map();
    const or = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;
    let m;
    while ((m = or.exec(xml))) {
      const id = sattr(m[1], "id");
      const body = m[2];
      const comps = [];
      const cr = /<component\b([^>]*)\/?>/g;
      let c;
      while ((c = cr.exec(body))) comps.push({ obj: sattr(c[1], "objectid"), T: parseT(sattr(c[1], "transform")) });
      objects.set(id, { mesh: /<mesh[\s>]/.test(body) ? body : null, comps });
    }
    const items = [];
    const ir = /<item\b([^>]*)\/?>/g;
    while ((m = ir.exec(xml))) items.push({ obj: sattr(m[1], "objectid"), T: parseT(sattr(m[1], "transform")) });
    const emit = (id, T, depth) => {
      const o = objects.get(id);
      if (!o || depth > 16) return;
      if (o.mesh) meshTris(o.mesh, T);
      for (const c of o.comps) emit(c.obj, mulT(c.T, T), depth + 1);
    };
    if (items.length && objects.size) for (const it of items) emit(it.obj, it.T, 0);
    else for (const mesh of xml.split(/<mesh[\s>]/).slice(1)) meshTris(mesh, null);
  }
  if (!out.length) throw new Error("The 3MF file contains no triangles");
  return Float32Array.from(out);
}

function bboxOf(pos) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) { const v = pos[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  }
  return { min, max };
}

/**
 * Read a mesh File: {name, file, format, soup (Float32 triangle soup, file units), positions + indices (welded),
 * tris, bbox, size}.
 */
export async function readMeshFile(file) {
  const name = String(file.name || "Mesh");
  const ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1];
  const fmt = (ext || "").toLowerCase();
  if (fmt !== "stl" && fmt !== "obj" && fmt !== "3mf") throw new Error(`Cannot insert ${name}: choose an STL, OBJ or 3MF file`);
  if (file.size > MAX_BYTES) throw new Error(`${name} is too large for this recreation (${(file.size / 1048576).toFixed(0)} MB)`);
  const buf = await file.arrayBuffer();
  const soup = fmt === "stl" ? parseSTL(buf) : fmt === "3mf" ? await parse3MF(buf) : parseOBJ(new TextDecoder().decode(new Uint8Array(buf)));
  for (let i = 0; i < soup.length; i++) if (!Number.isFinite(soup[i])) throw new Error(`Cannot insert ${name}: it contains invalid coordinates`);
  const welded = MD.weld(soup);
  if (!welded.indices.length) throw new Error(`Cannot insert ${name}: it has no valid triangles`);
  return {
    name: name.replace(/\.[^.]+$/, "") || "Mesh", file: name, format: fmt, soup, positions: welded.positions, indices: welded.indices,
    tris: welded.indices.length / 3, bbox: bboxOf(soup), size: file.size,
  };
}

// ------------------------------------------------------------------ dialog
/**
 * Insert Mesh / Edit Feature of a `mesh` feature. The mesh body is a real timeline feature (Fusion's mesh base
 * feature): the dialog previews it through the evaluator (staged triangle data, M.stageMeshData) and OK stores
 * the triangles in doc.meshData and inserts the feature (body named after the file).
 */
export function openInsertMesh(app, store, view, opts = {}) {
  if (!app.ui.dialog) return null;
  const M = app.M;
  if (app.mode === "sketch") {
    const stop = app.commands.get("SketchStop");
    if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model");
  }
  const editId = opts.editId && app.feature(opts.editId) && app.feature(opts.editId).type === "mesh" ? opts.editId : null;
  const f0 = editId ? app.feature(editId) : null;
  let mesh = null; // parsed file {name, file, format, positions, indices, tris, bbox}
  let staged = null; // tmp: id of the parsed file's data
  let loadError = null;
  let dlgRef = null;
  let readTicket = 0;
  if (f0) {
    // editing: the stored data stands in for the file until another one is chosen
    const md = M.meshDataOf(app.doc, f0.data);
    mesh = md ? { name: (app.doc.bodies[f0.newBody] || {}).name || f0.name, file: f0.file || f0.name, format: f0.format, positions: md.positions, indices: md.indices, tris: f0.tris || (md.indices ? md.indices.length / 3 : md.positions.length / 9), bbox: f0.bbox, stored: f0.data } : null;
  }
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".stl,.obj,.3mf";
  fileInput.dataset.input = "meshFile";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!f || !dlgRef || dlgRef.closed) return;
    const ticket = ++readTicket;
    readMeshFile(f).then((r) => {
      if (dlgRef.closed || ticket !== readTicket) return; // a newer pick superseded this read
      if (staged) M.unstageMeshData(staged);
      mesh = r;
      staged = M.stageMeshData({ positions: r.positions, indices: r.indices });
      loadError = null;
      if (r.tris > 200000) app.toast(`${r.file} has ${r.tris.toLocaleString()} triangles: display may be slow`, "warning", 4000);
      dlgRef.refresh();
      dlgRef.previewNow();
    }).catch((e) => {
      if (dlgRef.closed || ticket !== readTicket) return;
      loadError = e.message || String(e);
      dlgRef.refresh();
      dlgRef.previewNow();
    });
  });
  const pickFile = () => { try { fileInput.click(); } catch (e) { console.error(e); } };
  const has = () => !!mesh;
  const units0 = f0 ? f0.units || "mm" : UNIT_MM[app.doc.units] ? app.doc.units : "mm";
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

  /** Placement + data of the dialog values as a `mesh` feature (null until a file is loaded). */
  const defOf = (v, d) => {
    if (!mesh) return null;
    const n = (k, dflt = 0) => { const x = d.num(k); return Number.isFinite(x) ? x : dflt; };
    const out = {
      type: "mesh", file: mesh.file, format: mesh.format, units: v.units, flipUp: !!v.flipUp,
      tx: n("tx"), ty: n("ty"), tz: n("tz"), rx: n("rx"), ry: n("ry"), rz: n("rz"), scale: n("scale", 1),
      tris: mesh.tris, bbox: mesh.bbox, data: staged || mesh.stored,
    };
    if (f0) { out.newBody = f0.newBody; out.name = f0.name; }
    return out;
  };
  const setT = (d, t) => { T_FIELDS.forEach((k, i) => d.set(k, d.fmt(+t[i].toFixed(6), "length"), { user: true, noPreview: true })); d.previewNow(); };
  const worldZ = (def) => {
    // lowest world z of the placed vertices
    const Mx = M.meshInsertMatrix(def);
    const p = mesh.positions;
    let z = Infinity;
    for (let i = 0; i < p.length; i += 3) { const w = M.meshOps.apply(Mx, [p[i], p[i + 1], p[i + 2]]); if (w[2] < z) z = w[2]; }
    return z;
  };

  const values = f0 ? {
    units: f0.units || "mm", flipUp: !!f0.flipUp, scale: String(num(f0.scale, 1)),
    tx: `${num(f0.tx).toFixed(2)} mm`, ty: `${num(f0.ty).toFixed(2)} mm`, tz: `${num(f0.tz).toFixed(2)} mm`,
    rx: `${num(f0.rx).toFixed(1)} deg`, ry: `${num(f0.ry).toFixed(1)} deg`, rz: `${num(f0.rz).toFixed(1)} deg`,
  } : undefined;

  const dlg = app.ui.dialog.open({
    id: "ParaMeshInsertAlignCommand",
    title: "Insert Mesh",
    icon: "ParaMeshInsertAlignCommand",
    editId,
    featureLabel: "Insert Mesh",
    help: "Inserts an STL, OBJ or 3MF file as a mesh body. Choose the unit type the file was made in; one file unit becomes one of those units.",
    activate: false,
    ctrlWidth: 150,
    values,
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
              setT(dd, M.meshOps.apply(M.meshInsertMatrix({ ...def, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 }), [(def.bbox.min[0] + def.bbox.max[0]) / 2, (def.bbox.min[1] + def.bbox.max[1]) / 2, (def.bbox.min[2] + def.bbox.max[2]) / 2]).map((x) => -x));
            }),
            mk("ground", "Move To Ground", "Positions the bottom of the mesh body to rest on the ground plane of the active component.", (dd) => {
              const def = defOf(dd.values, dd);
              setT(dd, [def.tx, def.ty, def.tz - worldZ(def)]);
            }),
            mk("reset", "Reset", "Restores the default position of the mesh body.", (dd) => {
              for (const k of R_FIELDS) dd.set(k, "0.0 deg", { user: true, noPreview: true });
              dd.set("scale", "1", { user: true, noPreview: true });
              setT(dd, [0, 0, 0]);
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
    prompt: () => (mesh ? "" : "Select an STL, OBJ or 3MF file to insert"),
    build: (v, d) => defOf(v, d),
    afterPreview(d) {
      if (loadError) d.message(loadError, "error");
      else if (mesh) d.message(`${Number(mesh.tris).toLocaleString()} triangles`, "info");
    },
    status: (d) => (mesh && d.feature ? mesh.name : ""),
    manipulators(d) {
      const def = d.feature;
      if (!def || !def.bbox) return [];
      const b = def.bbox;
      const c = M.meshOps.apply(M.meshInsertMatrix(def), [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]);
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
      const name = mesh.name;
      const fresh = staged ? M.stagedMeshData(staged) : null;
      if (editId) {
        return app.mutate("Edit Insert Mesh", (doc) => {
          const f = doc.features.find((x) => x.id === editId);
          if (!f) throw new Error("The mesh feature no longer exists");
          const patch = { ...def };
          const old = f.data;
          if (fresh) patch.data = M.storeMeshData(doc, fresh); else patch.data = f.data;
          Object.assign(f, patch);
          // a new file replaces the triangles: drop the old record unless something else still refers to it
          if (fresh && old && old !== f.data && doc.meshData && doc.meshData[old] && !JSON.stringify(doc.features).includes(`"${old}"`)) delete doc.meshData[old];
          if (fresh && doc.bodies[f.newBody]) doc.bodies[f.newBody].name = name;
          return f;
        });
      }
      return app.mutate("Insert Mesh", (doc) => {
        const nf = { ...def, data: M.storeMeshData(doc, fresh || { positions: mesh.positions, indices: mesh.indices }) };
        nf.newBody = M.nextBody(doc, { name, kind: "mesh" });
        prepareFeature(doc, nf);
        doc.features.splice(doc.marker, 0, nf);
        doc.marker += 1;
        return nf;
      });
    },
    onClose() {
      if (staged) M.unstageMeshData(staged);
      staged = null;
      if (view && view.setPreviewMesh) view.setPreviewMesh(null);
    },
  });
  return dlg;
}
