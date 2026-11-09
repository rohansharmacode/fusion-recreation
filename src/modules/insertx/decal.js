// Decal (FusionAddEditDecalCommand): an image from a local file placed on a face, feature 'decal' (listed in the
// browser's Decals folder through browser.folder). The image (data URL) is kept in the feature, so save/open and
// undo keep it. The viewport draws each decal as a textured copy of the face triangles (planar projection in the
// decal frame; Chain Faces continues onto the other front-facing faces of the body).
import * as K from "../../kernel.js";
import * as M from "../../model.js";
import { clone, V, fileInput, readImage, buttonRow, rangeRow } from "./util.js";

const DEFAULT_SIZE = 20;

function frameOf(n, angleDeg) {
  n = V.norm(n);
  const ref = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = V.norm(V.sub(ref, V.mul(n, V.dot(n, ref))));
  const y = V.cross(n, x);
  const a = (angleDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: V.add(V.mul(x, c), V.mul(y, s)), y: V.add(V.mul(x, -s), V.mul(y, c)) };
}

function registerFeature() {
  M.registerFeature("decal", {
    label: "Decal",
    stem: "Decal",
    fields: { x: "length", y: "length", angle: "angle", width: "length", height: "length" },
    makesBodies: false,
    apply(st, f, P) {
      const ref = f.face;
      const b = ref && st.bodies.get(ref.body);
      if (!b || !b.shape) throw new Error("No targets specified");
      if (!f.image || !f.image.data) throw new Error("The image file does not exist");
      const idx = M.locateFace(b.shape, ref);
      if (idx < 0) throw new Error("The face of the decal could not be found");
      const [face] = K.facesAt(b.shape, [idx]);
      let n = ref.n, c = ref.p;
      try {
        const fi = K.faceInfo(face);
        if (fi.planar && fi.normal) n = fi.normal;
        const on = K.closestOnFace(b.shape, idx, ref.p);
        if (on && on.p) c = on.p;
      } finally { K.del(face); }
      if (!n || !c) throw new Error("The face of the decal could not be found");
      n = V.norm(n);
      const fr = frameOf(n, M.fval(P, f, "angle"));
      const o = V.add(V.add(c, V.mul(fr.x, M.fval(P, f, "x"))), V.mul(fr.y, M.fval(P, f, "y")));
      const w = M.fval(P, f, "width"), h = M.fval(P, f, "height");
      if (!(w > 0) || !(h > 0)) throw new Error("Width and Height must be greater than zero");
      return { affected: [], decal: { body: ref.body, face: idx, chain: f.chain !== false, o, n, x: fr.x, y: fr.y, w, h, opacity: Math.max(0, Math.min(100, Number(f.opacity ?? 100))) / 100, flipH: !!f.flipH, flipV: !!f.flipV } };
    },
    deps: (f) => ({ sketches: [], bodies: f.face && f.face.body ? [f.face.body] : [], features: [], cplanes: [], geo: [] }),
    editor: (app, id) => openDecal(app, id),
    icon: "FusionAddEditDecalCommand",
    browser: { folder: "decals" },
  });
}

// ------------------------------------------------------------------ drawing
const TEX = new Map(); // data URL -> THREE.Texture (a 1 px transparent border: clamping outside stays clear)
function textureOf(THREE, data, onReady) {
  let t = TEX.get(data);
  if (t) return t;
  const canvas = document.createElement("canvas");
  canvas.width = 2; canvas.height = 2;
  t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  if ("colorSpace" in t && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    const W = Math.max(4, Math.min(2048, img.naturalWidth + 2)), H = Math.max(4, Math.min(2048, img.naturalHeight + 2));
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext("2d");
    g.clearRect(0, 0, W, H);
    g.drawImage(img, 1, 1, W - 2, H - 2);
    t.needsUpdate = true;
    onReady();
  };
  img.src = data;
  TEX.set(data, t);
  if (TEX.size > 24) { const k = TEX.keys().next().value; const old = TEX.get(k); TEX.delete(k); try { old.dispose(); } catch { /* gone */ } }
  return t;
}

function decalGeometry(THREE, mesh, d) {
  const groups = d.chain ? mesh.faceGroups : mesh.faceGroups.filter((g) => g.face === d.face);
  const P = mesh.vertices, N = mesh.normals, T = mesh.triangles;
  const pos = [], nor = [], uv = [];
  const uvOf = (i) => {
    const q = [P[3 * i] - d.o[0], P[3 * i + 1] - d.o[1], P[3 * i + 2] - d.o[2]];
    let u = V.dot(q, d.x) / d.w + 0.5, v = V.dot(q, d.y) / d.h + 0.5;
    if (d.flipH) u = 1 - u;
    if (d.flipV) v = 1 - v;
    return [u, v];
  };
  for (const g of groups) {
    for (let k = g.start; k < g.start + g.count; k += 3) {
      const ids = [T[k], T[k + 1], T[k + 2]];
      if (d.chain && g.face !== d.face) {
        // other faces: front-facing to the decal and touching its rectangle
        const fn = [N[3 * ids[0]] + N[3 * ids[1]] + N[3 * ids[2]], N[3 * ids[0] + 1] + N[3 * ids[1] + 1] + N[3 * ids[2] + 1], N[3 * ids[0] + 2] + N[3 * ids[1] + 2] + N[3 * ids[2] + 2]];
        if (V.dot(fn, d.n) <= 0.15 * V.len(fn)) continue;
      }
      const uvs = ids.map(uvOf);
      if (uvs.every((t) => t[0] < 0) || uvs.every((t) => t[0] > 1) || uvs.every((t) => t[1] < 0) || uvs.every((t) => t[1] > 1)) continue;
      ids.forEach((i, j) => { pos.push(P[3 * i], P[3 * i + 1], P[3 * i + 2]); nor.push(N[3 * i], N[3 * i + 1], N[3 * i + 2]); uv.push(uvs[j][0], uvs[j][1]); });
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

function makeRenderer(app) {
  let group = null;
  let pending = false;
  const clear = () => {
    if (!group) return;
    for (const m of group.children) { m.geometry.dispose(); m.material.dispose(); }
    group.clear();
  };
  const draw = () => {
    pending = false;
    const vp = app.viewport;
    if (!vp || !vp.THREE || !vp.scene) return;
    const THREE = vp.THREE;
    if (!group) { group = new THREE.Group(); group.name = "insertx-decals"; vp.scene.add(group); }
    clear();
    const r = app.result;
    if (!r || !r.results) { vp.requestRender && vp.requestRender(); return; }
    for (const [fid, res] of Object.entries(r.results)) {
      const d = res && res.ok !== false && res.decal;
      if (!d) continue;
      const dlg = app.previewing && app.ui.dialog ? app.ui.dialog.current : null;
      const pf = dlg && dlg.previewFeature && dlg.previewFeature.id === fid ? dlg.previewFeature : null;
      const df = app.doc.features.find((q) => q.id === fid);
      const f = pf ? { ...pf, visible: df ? df.visible : true } : df;
      if (!f || f.visible === false || !f.image) continue;
      const b = r.state.bodies.get(d.body);
      const meta = app.bodyMeta ? app.bodyMeta(d.body) : app.doc.bodies[d.body];
      if (!b || !b.shape || (meta && meta.visible === false)) continue;
      if (app.components && app.components.bodyShown && !app.components.bodyShown(d.body)) continue;
      let geo = null;
      try { geo = decalGeometry(THREE, vp.meshFor(b.shape), d); } catch (e) { console.warn("insertx: decal", e); }
      if (!geo) continue;
      const mat = new THREE.MeshLambertMaterial({
        map: textureOf(THREE, f.image.data, () => vp.requestRender && vp.requestRender()), transparent: true, opacity: d.opacity,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      });
      const m = new THREE.Mesh(geo, mat);
      m.name = `decal:${fid}`;
      m.userData.decal = fid;
      m.renderOrder = 3;
      m.raycast = () => {};
      group.add(m);
    }
    vp.requestRender && vp.requestRender();
  };
  return {
    schedule() { if (pending) return; pending = true; Promise.resolve().then(draw); },
    group: () => group,
  };
}

// ------------------------------------------------------------------ dialog
function openDecal(app, editId) {
  if (app.mode === "sketch") { app.toast("Finish the sketch before placing a decal", "warn"); return null; }
  const ef = editId ? app.feature(editId) : null;
  let image = ef && ef.image ? ef.image : null;
  const st0 = app.result && app.result.state;
  const brep = (r) => !!(st0 && st0.bodies.has(r.body) && !(st0.meshBodies && st0.meshBodies.has(r.body)));
  const pre = editId ? [] : [...((app.selection && app.selection.items) || [])].filter((r) => r.kind === "face" && brep(r)).slice(0, 1);
  const pick = (dlg) => {
    const input = fileInput("decalImage", "image/png,image/jpeg,image/gif,image/bmp,image/webp,image/svg+xml", async (file) => {
      try {
        const im = await readImage(file);
        if (dlg.closed) return;
        image = im;
        const w = dlg.num("width");
        if (dlg.values.keep !== false && w > 0) dlg.set("height", `${(w * im.h / im.w).toFixed(2)} mm`, { noPreview: true });
        dlg.refresh();
        dlg.schedulePreview(0);
      } catch (e) { app.toast((e && e.message) || "Cannot insert file for Decal", "error"); }
    });
    input.click();
  };
  const frame = (dlg) => {
    const r = (dlg.values.face || [])[0];
    const res = dlg.previewRes && dlg.previewRes.ok !== false ? (app.result.results[(dlg.previewFeature || {}).id] || {}).decal : null;
    if (res) return res;
    if (!r || !r.p || !r.n) return null;
    const fr = frameOf(r.n, 0);
    return { o: r.p, n: V.norm(r.n), x: fr.x, y: fr.y, w: dlg.num("width"), h: dlg.num("height") };
  };
  const featureOf = (v) => {
    const r = (v.face || [])[0];
    if (!r || !image) return null;
    return {
      type: "decal", face: { body: r.body, p: r.p, ...(r.n ? { n: r.n } : {}), ...(r.sig ? { sig: r.sig } : {}) },
      image: { name: image.name, data: image.data, w: image.w, h: image.h }, chain: v.chain !== false,
      opacity: Number(v.opacity ?? 100), x: v.x, y: v.y, angle: v.angle, width: v.width, height: v.height,
      keep: v.keep !== false, flipH: !!v.flipH, flipV: !!v.flipV,
    };
  };
  let lastW = null;
  return app.ui.dialog.open({
    id: "FusionAddEditDecalCommand",
    title: editId ? "Edit Decal" : "Decal",
    icon: "FusionAddEditDecalCommand",
    editId: editId || null,
    featureLabel: "Decal",
    help: "Places an image on a face of the design: the image file comes from your computer.",
    preselect: pre,
    ctrlWidth: 180,
    rows: [
      buttonRow("image", "Image", () => (image ? image.name : "Insert from my computer..."), (dlg) => pick(dlg), { tooltip: "Select an image file (PNG, JPG, GIF, BMP)" }),
      { id: "face", type: "selection", label: "Face", kinds: ["face"], max: 1, filter: (r) => brep(r), prompt: "Select a face to place the image on" },
      { id: "chain", type: "check", label: "Chain Faces", tooltip: "Continues the decal onto the adjacent faces", default: true },
      rangeRow("opacity", "Opacity", 0, 100, 1, (v, dlg) => dlg.schedulePreview(60), { unit: "%" }),
      { id: "x", type: "value", label: "X Distance", kind: "length", default: "0.00 mm", sep: true },
      { id: "y", type: "value", label: "Y Distance", kind: "length", default: "0.00 mm" },
      { id: "angle", type: "value", label: "Z Angle", kind: "angle", default: "0.0 deg" },
      { id: "width", type: "value", label: "Width", kind: "length", positive: true, default: `${DEFAULT_SIZE.toFixed(2)} mm` },
      { id: "height", type: "value", label: "Height", kind: "length", positive: true, default: `${DEFAULT_SIZE.toFixed(2)} mm` },
      { id: "keep", type: "check", label: "Keep Aspect Ratio", default: true },
      { id: "flipH", type: "check", label: "Horizontal Flip", default: false },
      { id: "flipV", type: "check", label: "Vertical Flip", default: false },
    ],
    init(dlg) {
      dlg.values.opacity = 100;
      if (ef) {
        Object.assign(dlg.values, {
          face: ef.face ? [{ kind: "face", ...clone(ef.face) }] : [], chain: ef.chain !== false, opacity: Number(ef.opacity ?? 100),
          x: ef.x, y: ef.y, angle: ef.angle, width: ef.width, height: ef.height, keep: ef.keep !== false, flipH: !!ef.flipH, flipV: !!ef.flipV,
        });
      }
    },
    onChange(id, dlg) {
      if (id === "width" && dlg.values.keep !== false && image) {
        const w = dlg.num("width");
        if (w > 0 && w !== lastW) { lastW = w; dlg.set("height", `${(w * image.h / image.w).toFixed(2)} mm`, { noPreview: true }); }
      }
      if (id === "face" && !editId && image) {
        // a first placement: size the image to about half of the face
        const r = (dlg.values.face || [])[0];
        const b = r && st0 && st0.bodies.get(r.body);
        if (b && b.shape) {
          try {
            const bb = K.bboxOf(b.shape);
            const s = Math.max(2, 0.5 * Math.min(...[0, 1, 2].map((i) => bb.max[i] - bb.min[i]).filter((v) => v > 1e-6)));
            dlg.set("width", `${s.toFixed(2)} mm`, { noPreview: true });
            dlg.set("height", `${(s * image.h / image.w).toFixed(2)} mm`, { noPreview: true });
          } catch { /* keep the size */ }
        }
      }
    },
    build: (v) => featureOf(v),
    validate: () => (image ? null : "Select an image"),
    manipulators(dlg) {
      const fr = frame(dlg);
      if (!fr) return [];
      const c = fr.o;
      return [
        dlg.valueManip("x", { origin: V.sub(c, V.mul(fr.x, dlg.num("x") || 0)), dir: fr.x, id: "x" }),
        dlg.valueManip("y", { origin: V.sub(c, V.mul(fr.y, dlg.num("y") || 0)), dir: fr.y, id: "y" }),
        dlg.angleManip("angle", { center: c, axis: fr.n, ref: frameOf(fr.n, 0).x, radius: Math.max(4, 0.35 * Math.max(fr.w || 10, fr.h || 10)) }),
        dlg.valueManip("width", { origin: c, dir: fr.y, scale: 0.5, min: 0.01, id: "width" }),
      ];
    },
  });
}

export function initDecal(app) {
  registerFeature();
  const rd = makeRenderer(app);
  app.on("model", () => rd.schedule());
  app.on("doc", () => rd.schedule());
  app.on("components", () => rd.schedule());
  app.commands.register({ id: "FusionAddEditDecalCommand", kind: "tool", label: "Decal", tooltip: "Places an image from a file on a face. Move, rotate and scale it with the manipulators.", run: (a) => openDecal(a || app, null) });
  return { open: (id) => openDecal(app, id || null), group: () => rd.group() };
}
