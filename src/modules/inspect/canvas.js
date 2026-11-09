// CANVAS (FusionAddCanvasCommand; Edit Canvas from the browser): places a PNG / JPG reference image
// on an origin plane, construction plane or planar face. Rows follow Fusion's dialog: Face, Image,
// Canvas Opacity (50), Display Through, Selectable, Renderable, then the image transform
// (X / Y Distance, Z Angle, Scale Plane XY, Scale X / Y, Horizontal / Vertical Flip) with on-canvas
// handles: centre square (move in the plane), X / Y arrows, Z-angle ring and a corner scale arrow.
// The image is stored in the document as a data URL (warning above 2 MB: saved designs live in
// browser storage).
import { canvasFrame, BIG_IMAGE, IV as V } from "./insert.js";

const PROMPT = "Select a planar face, plane or sketch plane to place the image";
const AX_COL = [0xd8372c, 0x45a72c];
const fmtMB = (n) => `${(n / (1024 * 1024)).toFixed(1)} MB`;
const FOLDER = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.2h4.6l1.3 1.4h7.1v7.7H1.5z" fill="#f5d27a" stroke="#9a7a2a" stroke-width=".9"/><path d="M1.5 6.6h13" stroke="#9a7a2a" stroke-width=".8"/></svg>`;

function toPlaneRef(app, ref) {
  if (!ref) return null;
  if (ref.kind === "originPlane") return { planeRef: { kind: "origin", name: ref.name }, plane: { ...app.K.ORIGIN_PLANES[ref.name] } };
  if (ref.kind === "cplane") {
    const st = app.planeState(ref.id);
    return st ? { planeRef: { kind: "cplane", id: ref.id }, plane: { ...st.plane } } : null;
  }
  if (ref.kind === "face" && ref.p && ref.n) {
    const pl = app.K.planeFromNormal(ref.p, ref.n);
    // anchor at the face centre (projected onto the face plane) like Fusion
    try {
      const b = app.body(ref.body);
      const f = b && b.shape && b.shape.faces[ref.index];
      if (f && f.center) {
        const c = f.center.toTuple();
        const n = V.norm(pl.n);
        pl.o = V.sub(c, V.mul(n, V.dot(V.sub(c, pl.o), n)));
      }
    } catch { /* keep the picked point */ }
    return { planeRef: { kind: "face", body: ref.body, p: ref.p, n: ref.n }, plane: pl };
  }
  return null;
}

/** Read a PNG / JPG File into {data (data URL), name, file, w, h, size}. */
export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const okType = /\.(png|jpe?g)$/i.test(file.name || "") || /^image\/(png|jpeg)$/i.test(file.type || "");
    if (!okType) { reject(new Error(`Cannot insert ${file.name}. It may be corrupt, damaged, or in an unsupported file format.`)); return; }
    const fr = new FileReader();
    fr.onerror = () => reject(new Error(`Cannot insert ${file.name}.`));
    fr.onload = () => {
      const data = String(fr.result || "");
      const im = new Image();
      im.onload = () => resolve({ data, file: file.name, name: String(file.name).replace(/\.[^.]+$/, "") || "Canvas", w: im.naturalWidth, h: im.naturalHeight, size: file.size });
      im.onerror = () => reject(new Error(`Cannot insert ${file.name}. It may be corrupt, damaged, or in an unsupported file format.`));
      im.src = data;
    };
    fr.readAsDataURL(file);
  });
}

export function openCanvas(app, store, view, opts = {}) {
  if (!app.ui.dialog) return null;
  if (app.mode === "sketch") {
    const stop = app.commands.get("SketchStop");
    if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model");
  }
  const editId = opts.editId || null;
  const c0 = editId ? store.canvas(editId) : null;
  if (editId && !c0) return null;
  let img = c0 ? { data: c0.image, file: c0.file, name: c0.name, w: c0.px[0], h: c0.px[1], size: c0.size || c0.image.length * 0.75 } : null;
  let loadError = null;
  const pre = editId ? [] : (opts.preselect || app.selection.items || []).filter((r) => (r.kind === "face" && r.planar !== false) || r.kind === "originPlane" || r.kind === "cplane").slice(0, 1);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".png,.jpg,.jpeg,image/png,image/jpeg";
  fileInput.dataset.input = "imageFile";
  fileInput.style.display = "none";

  let dlgRef = null;
  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!f || !dlgRef || dlgRef.closed) return;
    readImageFile(f).then((r) => {
      if (dlgRef.closed) return;
      img = r;
      loadError = null;
      if (r.size > BIG_IMAGE) app.toast(`${r.file} is ${fmtMB(r.size)}: large images make the design big and may not fit in browser storage`, "warning", 5000);
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

  const hasImg = () => !!img;
  const dlg = app.ui.dialog.open({
    id: "FusionAddCanvasCommand",
    title: editId ? "Edit Canvas" : "Canvas",
    icon: "FusionAddCanvasCommand",
    featureLabel: editId ? "Edit Canvas" : "Canvas",
    help: "Places an image on a planar face or sketch plane. Select a face then select an image to import.",
    preview: false,
    preselect: pre,
    ctrlWidth: 150,
    activate: editId ? false : undefined,
    rows: [
      { id: "plane", type: "selection", label: "Face", kinds: ["face", "originPlane", "cplane"], planar: true, max: 1, prompt: PROMPT, tooltip: "Select a planar face, plane or sketch plane to place the image." },
      {
        id: "image", type: "text", label: "Image", tooltip: "Select an image (PNG or JPG) to place on the face.",
        text: () => (img ? img.file : ""),
        extra: () => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "insp-file-btn";
          b.dataset.input = "image";
          b.title = "Insert from my computer...";
          b.innerHTML = FOLDER;
          b.addEventListener("click", pickFile);
          return b;
        },
      },
      {
        id: "opacity", type: "value", label: "Canvas Opacity", kind: "none", min: 0, max: 100, default: "50", sep: true, step: 5,
        tooltip: "Canvas opacity",
        extra: (d) => {
          const r = document.createElement("input");
          r.type = "range"; r.min = "0"; r.max = "100"; r.step = "1";
          r.className = "insp-slider";
          r.dataset.input = "opacitySlider";
          const sync = () => { const v = d.num("opacity"); if (Number.isFinite(v) && document.activeElement !== r) r.value = String(v); };
          r.addEventListener("input", () => d.set("opacity", String(Math.round(Number(r.value))), { user: true, delay: 30 }));
          d._insSyncSlider = sync;
          setTimeout(sync, 0);
          return r;
        },
      },
      { id: "through", type: "check", label: "Display Through", default: false, tooltip: "Shows the image through the model so you can use it as a reference." },
      { id: "selectable", type: "check", label: "Selectable", default: true, tooltip: "The canvas can be selected in the canvas window." },
      { id: "renderable", type: "check", label: "Renderable", default: true, tooltip: "The canvas is included in renderings." },
      { id: "xDist", type: "value", label: "X Distance", kind: "length", default: "0.00 mm", sep: true, visible: hasImg },
      { id: "yDist", type: "value", label: "Y Distance", kind: "length", default: "0.00 mm", visible: hasImg },
      { id: "angle", type: "value", label: "Z Angle", kind: "angle", default: "0.0 deg", visible: hasImg },
      { id: "scale", type: "value", label: "Scale Plane XY", kind: "none", default: "1", positive: true, visible: hasImg },
      { id: "scaleX", type: "value", label: "Scale X", kind: "none", default: "1", positive: true, visible: hasImg },
      { id: "scaleY", type: "value", label: "Scale Y", kind: "none", default: "1", positive: true, visible: hasImg },
      { id: "flipH", type: "check", label: "Horizontal Flip", default: false, visible: hasImg },
      { id: "flipV", type: "check", label: "Vertical Flip", default: false, visible: hasImg },
    ],
    init(d) {
      if (!c0) return;
      const pr = c0.planeRef || {};
      let ref = null;
      if (pr.kind === "origin") ref = { kind: "originPlane", name: pr.name };
      else if (pr.kind === "cplane" && app.feature(pr.id)) ref = { kind: "cplane", id: pr.id };
      else if (pr.kind === "face") {
        // the face it was placed on, if the body still has it (the stored plane is kept)
        try {
          const b = app.body(pr.body);
          const hit = b && b.shape ? app.K.nearestFaceIndex(b.shape, pr.p, pr.n) : null;
          const index = hit && typeof hit === "object" ? hit.index : Number.isInteger(hit) ? hit : -1;
          if (index >= 0) ref = { kind: "face", body: pr.body, index, p: pr.p, n: pr.n, planar: true, _canvasPlane: c0.plane };
        } catch { ref = null; }
      }
      Object.assign(d.values, {
        plane: ref ? [ref] : [],
        opacity: String(c0.opacity ?? 50), through: !!c0.through, selectable: c0.selectable !== false, renderable: c0.renderable !== false,
        xDist: d.fmt(Number(c0.xDist) || 0, "length"), yDist: d.fmt(Number(c0.yDist) || 0, "length"), angle: d.fmt(Number(c0.angle) || 0, "angle"),
        scale: String(c0.scale ?? 1), scaleX: String(c0.scaleX ?? 1), scaleY: String(c0.scaleY ?? 1), flipH: !!c0.flipH, flipV: !!c0.flipV,
      });
    },
    onOpen(d) {
      dlgRef = d;
      d.el.classList.add("insp-dlg", "insp-canvas-dlg");
      d.el.appendChild(fileInput);
    },
    onChange(id, d) { if (id === "opacity" && d._insSyncSlider) d._insSyncSlider(); },
    prompt(d) {
      if (!(d.values.plane || []).length) return PROMPT;
      if (!img) return "Select an image to place on the face";
      return "";
    },
    build(v, d) {
      const ref = (v.plane || [])[0];
      if (!ref || !img) return null;
      const pr = ref._canvasPlane ? { planeRef: c0.planeRef, plane: { ...ref._canvasPlane } } : toPlaneRef(app, ref);
      if (!pr) return null;
      const n = (k, dflt) => { const x = d.num(k); return Number.isFinite(x) ? x : dflt; };
      return {
        name: c0 ? c0.name : img.name, file: img.file, image: img.data, px: [img.w, img.h], size: img.size,
        planeRef: pr.planeRef, plane: pr.plane,
        xDist: n("xDist", 0), yDist: n("yDist", 0), angle: n("angle", 0),
        scale: n("scale", 1), scaleX: n("scaleX", 1), scaleY: n("scaleY", 1), flipH: !!v.flipH, flipV: !!v.flipV,
        opacity: Math.max(0, Math.min(100, n("opacity", 50))), through: !!v.through, selectable: !!v.selectable, renderable: !!v.renderable,
      };
    },
    afterPreview(d) {
      view.setPreviewCanvas(d.feature, editId);
      if (loadError) d.message(loadError, "error");
      else if (img && img.size > BIG_IMAGE) d.message(`Large image (${fmtMB(img.size)}): it is stored in the design and may not fit in browser storage.`, "warning");
    },
    manipulators(d) {
      const f = d.feature && canvasFrame(app, d.feature);
      if (!f) return [];
      const vp = app.viewport;
      const c = f.center;
      const out = [];
      // move in the canvas plane (centre square)
      out.push({
        id: "move", type: "plane", value: 0, center: c, a: f.x0, b: f.y0, box: false, color: 0x2d6fd6,
        getStart: () => [d.num("xDist") || 0, d.num("yDist") || 0],
        onDelta: (dv, final, start) => {
          let step = 0.1;
          try { step = niceStep(2 * (vp.pixelSize(c) || 0.1)); } catch { /* keep */ }
          const sx = Math.round(((start ? start[0] : 0) + V.dot(dv, f.x0)) / step) * step;
          const sy = Math.round(((start ? start[1] : 0) + V.dot(dv, f.y0)) / step) * step;
          d.set("xDist", d.fmt(+sx.toFixed(6), "length"), { user: true, delay: final ? 0 : 30, throttle: !final });
          d.set("yDist", d.fmt(+sy.toFixed(6), "length"), { user: true, delay: final ? 0 : 30, throttle: !final });
          if (final) d.previewNow();
        },
      });
      // X / Y distance arrows from the current centre
      [["xDist", f.x0], ["yDist", f.y0]].forEach(([k, dir], i) => {
        const m = d.valueManip(k, { origin: c, dir, fixedDir: true });
        if (!m) return;
        m.origin = V.sub(c, V.mul(dir, m.value));
        Object.assign(m, { look: "axis", color: AX_COL[i], len: 90, gap: 11 });
        out.push(m);
      });
      // Z angle ring about the plane normal
      const am = d.angleManip("angle", { center: c, axis: f.n, ref: f.x0, radius: 1, min: -360, max: 360 });
      if (am) { Object.assign(am, { screenRadius: 70, span: 20, gripAt: 45, color: 0x2d6fd6, lineWidth: 2.2 }); out.push(am); }
      // uniform scale: arrow at the top-right corner (value = Scale Plane XY)
      const half = [f.X[0] * f.w1 / 2 + f.Y[0] * f.h1 / 2, f.X[1] * f.w1 / 2 + f.Y[1] * f.h1 / 2, f.X[2] * f.w1 / 2 + f.Y[2] * f.h1 / 2];
      const L = Math.hypot(...half);
      if (L > 1e-9) {
        const sm = d.valueManip("scale", { origin: c, dir: V.norm(half), scale: L, min: 0.01, fixedDir: true, id: "scaleXY" });
        if (sm) out.push(sm);
      }
      return out;
    },
    commit(feature) {
      if (editId) return store.update("canvas", editId, feature, "Edit Canvas");
      return store.add("canvas", feature, "Canvas");
    },
    onClose() { view.setPreviewCanvas(null); },
  });
  return dlg;
}

function niceStep(x) {
  if (!(x > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / e;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e;
}
