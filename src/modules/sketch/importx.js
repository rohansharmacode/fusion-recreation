// Insert SVG (SketchImportSVG) and Insert DXF (ImportDxfFileCommand): Fusion's dialogs (plane /
// sketch selection, file, position X / Y Distance, Z Angle, Scale Plane XY, flips; DXF Units,
// Insert Mode, DXF Layers), a preview on the target plane, and fixed sketch geometry on OK (lines,
// arcs, circles, ellipses, exact cubic / quadratic Beziers and B-splines as control point splines,
// fit point splines, points, DXF TEXT as sketch text). Files are read with <input type=file>.
import * as THREE from "three";
import { ST, planeFromRef, vp } from "./ctx.js";
import { prepareFeature } from "../../app/core.js";
import { parseSVG, parseDXF, placeItems, UNIT_MM } from "../../sketch/importers.js";
import { shapeText, ensureFont } from "./text.js";

const D2R = Math.PI / 180;

/** Ask for a file (text). */
function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = accept;
    inp.style.display = "none";
    inp.addEventListener("cancel", () => { inp.remove(); resolve(null); }); // picker dismissed
    inp.addEventListener("change", () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) { resolve(null); return; }
      const rd = new FileReader();
      rd.onload = () => resolve({ name: f.name, text: String(rd.result || "") });
      rd.onerror = () => resolve(null);
      rd.readAsText(f);
    });
    document.body.appendChild(inp);
    inp.click();
  });
}

/** Target of the Plane/Sketch selection: {sketchId} (insert into it) or {plane, planeRef} (new sketch). */
function targetOf(dlg) {
  const A = ST.app;
  if (A.mode === "sketch" && ST.sketchId) {
    const f = A.feature(ST.sketchId);
    return { sketchId: ST.sketchId, plane: A.sketchState(ST.sketchId) ? A.sketchState(ST.sketchId).plane : f.plane };
  }
  const r = (dlg.values.plane || [])[0];
  if (!r) return null;
  if (r.kind === "profile" || r.kind === "sketchCurve") {
    const s = A.sketchState(r.sketch);
    return s ? { sketchId: r.sketch, plane: s.plane } : null;
  }
  const pr = planeFromRef(r, null);
  return pr ? { plane: pr.plane, planeRef: pr.planeRef } : null;
}

/** Add imported items (sketch coordinates, mm) to sk as fixed geometry. Returns curve count. */
export function addItems(sk, items, opts = {}) {
  const S = ST.app.S;
  const pmap = new Map();
  const key = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const pt = (p) => {
    const k = key(p);
    if (pmap.has(k)) return pmap.get(k);
    const id = S.addPoint(sk, p[0], p[1], opts.fixed === false ? {} : { fixed: true });
    pmap.set(k, id);
    return id;
  };
  let n = 0;
  for (const it of items) {
    try {
      if (it.kind === "line") { const a = pt(it.a), b = pt(it.b); if (a !== b) { S.addLine(sk, a, b); n++; } }
      else if (it.kind === "circle") { if (it.r > 1e-9) { S.addCircle(sk, pt(it.c), it.r); n++; } }
      else if (it.kind === "arc") {
        const P = (a) => [it.c[0] + it.r * Math.cos(a), it.c[1] + it.r * Math.sin(a)];
        let sw = (((it.a1 - it.a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (sw < 1e-9) { S.addCircle(sk, pt(it.c), it.r); n++; continue; }
        const id = S.addArc(sk, pt(it.c), pt(P(it.a0)), pt(P(it.a1)));
        sk.curves[id].r = it.r;
        n++;
      } else if (it.kind === "bez") { S.addCVSpline(sk, [pt(it.a), pt(it.c1), pt(it.c2), pt(it.b)], { degree: 3 }); n++; }
      else if (it.kind === "qbez") { S.addCVSpline(sk, [pt(it.a), pt(it.c), pt(it.b)], { degree: 3 }); n++; }
      else if (it.kind === "bspline") {
        const p = Math.max(1, Math.min(5, it.degree || 3));
        const U = it.knots.slice();
        const lo = U[p], hi = U[U.length - p - 1];
        const clamped = U.slice(0, p + 1).every((x) => Math.abs(x - lo) < 1e-9) && U.slice(U.length - p - 1).every((x) => Math.abs(x - hi) < 1e-9);
        if (clamped && (p === 3 || p === 5 || p <= 2)) {
          const span = hi - lo || 1;
          const knots = U.map((x) => (x - lo) / span * (it.cps.length - p));
          const id = S.addCVSpline(sk, it.cps.map(pt), { degree: p === 5 ? 5 : 3, knots: p === 3 || p === 5 ? knots : undefined });
          if (p !== 3 && p !== 5) sk.curves[id].degree = p;
          n++;
        } else {
          // other splines: a fit point spline through samples
          const g = S.cvsplineGeomFrom(it.cps, p, false, null, null);
          if (g) { const ids = []; for (let i = 0; i <= 16; i++) ids.push(pt(g.at((g.T * i) / 16))); S.addSpline(sk, [...new Set(ids)]); n++; }
        }
      } else if (it.kind === "fit") {
        const ids = [];
        for (const q of it.pts) { const id = pt(q); if (ids[ids.length - 1] !== id) ids.push(id); }
        if (it.closed && ids.length > 2 && ids[0] === ids[ids.length - 1]) ids.pop();
        if (ids.length >= 2) { S.addSpline(sk, ids, { closed: !!it.closed && ids.length >= 3 }); n++; }
      } else if (it.kind === "ellipse") {
        const c = it.c, ax = it.ax, R1 = Math.hypot(ax[0], ax[1]);
        if (!(R1 > 1e-9)) continue;
        const u = [ax[0] / R1, ax[1] / R1], vv = it.mirror ? [u[1], -u[0]] : [-u[1], u[0]];
        const R2 = R1 * (it.ratio || 1);
        const ic = pt(c), ia = pt([c[0] + ax[0], c[1] + ax[1]]);
        const full = Math.abs(((it.t1 ?? 2 * Math.PI) - (it.t0 ?? 0)) - 2 * Math.PI) < 1e-6 || it.t0 === undefined;
        if (full) { S.addEllipse(sk, ic, ia, pt([c[0] - u[1] * R2, c[1] + u[0] * R2]), false, { axes: false }); n++; }
        else {
          const E = (t) => [c[0] + R1 * Math.cos(t) * u[0] + R2 * Math.sin(t) * vv[0], c[1] + R1 * Math.cos(t) * u[1] + R2 * Math.sin(t) * vv[1]];
          // the sketch's elliptical arcs run counter-clockwise in their own frame (u, u turned +90)
          const p1 = pt(E(it.t0)), p2 = pt(E(it.t1));
          const ub = S.addPoint(sk, c[0] - u[1] * R2, c[1] + u[0] * R2, { fixed: true });
          if (it.mirror) S.addEllipticArc(sk, ic, ia, ub, p2, p1); else S.addEllipticArc(sk, ic, ia, ub, p1, p2);
          n++;
        }
      } else if (it.kind === "point") { S.addSketchPoint(sk, pt(it.a)); n++; }
      else if (it.kind === "text" && opts.textShapes) {
        const sh = opts.textShapes.get(it);
        if (!sh) continue;
        const w = Math.max(1e-3, (Math.max(...sh.layout.lines.map((l) => l.w)) || 1) * it.h), h = it.h * (sh.layout.asc + sh.layout.desc + (sh.layout.lines.length - 1) * 1.2);
        const ux = [Math.cos(it.rot || 0), Math.sin(it.rot || 0)], uy = [-ux[1], ux[0]];
        const o = [it.a[0] - uy[0] * sh.layout.desc * it.h, it.a[1] - uy[1] * sh.layout.desc * it.h];
        const C = [o, [o[0] + ux[0] * w, o[1] + ux[1] * w], [o[0] + ux[0] * w + uy[0] * h, o[1] + ux[1] * w + uy[1] * h], [o[0] + uy[0] * h, o[1] + uy[1] * h]];
        const frame = C.map((q) => S.addPoint(sk, q[0], q[1], { fixed: true }));
        for (let k = 0; k < 4; k++) S.addLine(sk, frame[k], frame[(k + 1) % 4], true);
        const id = `t${sk.nid++}`;
        sk.curves[id] = { type: "text", mode: "box", frame, text: it.text, font: "Fira Sans", size: it.h, spacing: 0, halign: "left", valign: "bottom", layout: sh.layout, glyphs: sh.glyphs };
        n++;
      }
    } catch (e) { console.error("[insert]", e); }
  }
  return n;
}

// ---------- preview on the target plane (works outside the sketch environment too) ----------
const PV = { group: null };
function clearPreview() {
  if (PV.group) { PV.group.parent && PV.group.parent.remove(PV.group); PV.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); PV.group = null; vp().requestRender(); }
}
function showPreview(plane, items) {
  clearPreview();
  const S = ST.app.S;
  const tmp = S.newSketch();
  addItems(tmp, items, { fixed: false });
  const pos = [];
  const K = ST.app.K;
  for (const id of Object.keys(tmp.curves)) {
    const pl = S.curvePolyline(tmp, id, 48);
    for (let i = 0; i + 1 < pl.length; i++) pos.push(...K.toWorld(plane, pl[i][0], pl[i][1]), ...K.toWorld(plane, pl[i + 1][0], pl[i + 1][1]));
  }
  if (!pos.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: "#2f6dc6", depthTest: false, transparent: true });
  const obj = new THREE.LineSegments(geo, mat);
  obj.renderOrder = 20;
  PV.group = new THREE.Group();
  PV.group.add(obj);
  vp().groups.overlay.add(PV.group);
  vp().requestRender();
}

/** Insert items into the target: the active / chosen sketch, or new sketch(es) on a plane. */
function insertInto(target, groups, label) {
  const A = ST.app;
  if (target.sketchId) {
    return A.mutate(label, (doc) => {
      const f = doc.features.find((x) => x.id === target.sketchId);
      if (!f) throw new Error("The sketch no longer exists");
      let n = 0;
      for (const g of groups) n += addItems(f.sk, g.items, { textShapes: g.textShapes });
      if (!n) throw new Error("The file contains no supported geometry");
      return target.sketchId;
    });
  }
  return A.mutate(label, (doc) => {
    const ids = [];
    for (const g of groups) {
      const sk = A.S.newSketch();
      const n = addItems(sk, g.items, { textShapes: g.textShapes });
      if (!n) continue;
      const f = { type: "sketch", plane: target.plane, planeRef: target.planeRef, sk, visible: true };
      prepareFeature(doc, f);
      if (g.name && !f.name) f.name = g.name;
      doc.features.splice(doc.marker, 0, f);
      doc.marker += 1;
      ids.push(f.id);
    }
    if (!ids.length) throw new Error("The file contains no supported geometry");
    return ids;
  });
}

const PLANE_KINDS = ["originPlane", "cplane", "face", "profile", "sketchCurve"];

function placementRows(dlg, extra = []) {
  void dlg;
  return [
    { id: "dx", type: "value", label: "X Distance", kind: "length", default: "0.00 mm" },
    { id: "dy", type: "value", label: "Y Distance", kind: "length", default: "0.00 mm" },
    { id: "ang", type: "value", label: "Z Angle", kind: "angle", default: "0.0 deg" },
    ...extra,
  ];
}

function fileRow(id, label, accept, onFile) {
  return {
    id, type: "custom",
    render: (dlg) => {
      const el = document.createElement("div");
      el.className = "sk-pair-row";
      el.innerHTML = `<div class="dlg-label" title="${label}">${label}</div><div class="sk-file"><button type="button" class="sk-file-btn" data-input="${id}" title="${label}"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M1.5 4.5h4.5l1.5 1.5h7v7.5h-13z" fill="#f1c45b" stroke="#a87b14" stroke-width="1"/></svg></button><span class="sk-file-name"></span></div>`;
      el.querySelector("button").addEventListener("click", async () => {
        const f = await pickFile(accept);
        if (!f || dlg.closed) return;
        try { onFile(dlg, f); } catch (e) { console.error(e); dlg.message(`${f.name}: ${e.message || e}`, "error"); }
        dlg.refresh();
        dlg.schedulePreview(10);
      });
      return el;
    },
    update: (el, dlg) => { el.querySelector(".sk-file-name").textContent = dlg.values[`${id}Name`] || ""; },
  };
}

function placedSVG(dlg) {
  const data = dlg.svgData;
  if (!data) return null;
  const k = dlg.num("scale");
  // Fusion centres the drawing on the sketch origin
  const c = [(data.bbox.min[0] + data.bbox.max[0]) / 2, (data.bbox.min[1] + data.bbox.max[1]) / 2];
  const centred = placeItems(data.items, { dx: -c[0], dy: -c[1] });
  return placeItems(centred, { k: Number.isFinite(k) && k > 0 ? k : 1, flipH: !!dlg.values.flipH, flipV: !!dlg.values.flipV, ang: (dlg.num("ang") || 0) * D2R, dx: dlg.num("dx") || 0, dy: dlg.num("dy") || 0 });
}

/** Insert SVG. */
export function openInsertSVG() {
  const A = ST.app;
  const inSketch = A.mode === "sketch" && !!ST.sketchId;
  return A.ui.dialog.open({
    id: "SketchImportSVG",
    title: "Insert SVG",
    icon: "SketchImportSVG",
    help: "Imports an SVG file into the active sketch. Select the sketch profile or planar face then select the SVG file to insert. Set the position and the scale.",
    preview: false,
    labelWidth: 124,
    rows: [
      { id: "plane", type: "selection", label: "Select Plane or Sketch", kinds: PLANE_KINDS, max: 1, planar: true, visible: () => !inSketch, prompt: "Select a plane, planar face or sketch" },
      fileRow("file", "Select SVG File", ".svg,image/svg+xml", (d, f) => {
        const data = parseSVG(f.text);
        if (!data.items.length) throw new Error("The selected SVG file contains no information or some unsupported information. The Fusion sketch will not include unsupported geometry.");
        d.svgData = data;
        d.values.fileName = f.name;
      }),
      ...placementRows(null),
      { id: "scale", type: "value", label: "Scale Plane XY", kind: "none", default: "1.00", positive: true, step: 0.1 },
      { id: "flipH", type: "check", label: "Horizontal Flip", default: false },
      { id: "flipV", type: "check", label: "Vertical Flip", default: false },
    ],
    preselect: inSketch ? [] : A.selection.items.filter((r) => PLANE_KINDS.includes(r.kind)).slice(0, 1),
    showOrigin: !inSketch,
    build: (v, d) => (d.svgData && (inSketch || (v.plane || []).length) ? { type: "insertSVG" } : null),
    validate: (d) => (!d.svgData ? "Select an SVG file" : null),
    manipulators(d) {
      const t = targetOf(d);
      if (!t || !d.svgData) return [];
      const K = A.K;
      const m = { id: "pos", type: "point", point: K.toWorld(t.plane, d.num("dx") || 0, d.num("dy") || 0), normal: t.plane.n, onMove: (p, final) => { const uv = K.toLocal(t.plane, p); d.set("dx", A.ui.dialog.fmt(uv[0], "length"), { user: true, noPreview: !final }); d.set("dy", A.ui.dialog.fmt(uv[1], "length"), { user: true }); } };
      return [m];
    },
    afterPreview(d) {
      const t = targetOf(d);
      const items = placedSVG(d);
      if (!t || !items) { clearPreview(); return; }
      showPreview(t.plane, items);
    },
    commit(f, d) {
      const t = targetOf(d);
      if (!t) throw new Error("Select a plane or sketch");
      return insertInto(t, [{ items: placedSVG(d), name: (d.values.fileName || "").replace(/\.svg$/i, "") }], "Insert SVG");
    },
    onClose() { clearPreview(); },
  });
}

/** Insert DXF. */
export function openInsertDXF() {
  const A = ST.app;
  const inSketch = A.mode === "sketch" && !!ST.sketchId;
  const unitOpts = [{ value: "mm", label: "Millimeter" }, { value: "cm", label: "Centimeter" }, { value: "m", label: "Meter" }, { value: "in", label: "Inch" }, { value: "ft", label: "Foot" }];
  const dlg = A.ui.dialog.open({
    id: "ImportDxfFileCommand",
    title: "Insert DXF",
    icon: "ImportDxfFileCommand",
    help: "Inserts geometry from a DXF file into the active sketch. Select a face or plane, select the DXF file to insert, then position the geometry on the plane.",
    preview: false,
    labelWidth: 112,
    rows: [
      { id: "plane", type: "selection", label: "Plane/Sketch", kinds: PLANE_KINDS, max: 1, planar: true, visible: () => !inSketch, prompt: "Select a plane, planar face or sketch" },
      fileRow("file", "Select DXF File", ".dxf", (d, f) => {
        const data = parseDXF(f.text);
        if (!data.items.length) throw new Error("The selected DXF file does not contain any supported 2D geometry.");
        d.dxfData = data;
        d.values.fileName = f.name;
        d.values.layersOn = Object.fromEntries(data.layers.map((l) => [l, true]));
        if (data.units) d.values.units = data.units;
        else d.message("The selected DXF file does not contain units information. The design's units will be used. You can change this with the Units dropdown.", "warning");
        if (data.items.some((i) => i.kind === "text")) ensureFont("Fira Sans", false, false).then(() => d.schedulePreview(10));
      }),
      { id: "mode", type: "dropdown", label: "Insert Mode", default: "single", options: [{ value: "single", label: "Single Sketch" }, { value: "perLayer", label: "One Sketch per Layer" }], enabled: () => !inSketch },
      { id: "units", type: "dropdown", label: "Units", default: "mm", options: unitOpts },
      ...placementRows(null),
      {
        id: "layers", type: "custom",
        render: (d) => { const el = document.createElement("div"); el.className = "sk-layers"; el.addEventListener("change", (ev) => { const cb = ev.target.closest("input[data-layer]"); if (!cb) return; d.values.layersOn[cb.dataset.layer] = cb.checked; d.schedulePreview(10); }); return el; },
        update: (el, d) => {
          const data = d.dxfData;
          if (!data) { el.innerHTML = ""; return; }
          const sig = data.layers.join("|");
          if (el.dataset.sig === sig) return;
          el.dataset.sig = sig;
          el.innerHTML = `<div class="sk-layers-head">DXF Layers</div>${data.layers.map((l) => `<label class="sk-layer"><input type="checkbox" data-layer="${l.replace(/"/g, "&quot;")}"${d.values.layersOn[l] !== false ? " checked" : ""}> ${l.replace(/</g, "&lt;")}</label>`).join("")}`;
        },
      },
    ],
    preselect: inSketch ? [] : A.selection.items.filter((r) => PLANE_KINDS.includes(r.kind)).slice(0, 1),
    showOrigin: !inSketch,
    build: (v, d) => (d.dxfData && (inSketch || (v.plane || []).length) ? { type: "insertDXF" } : null),
    validate: (d) => (!d.dxfData ? "Select a DXF file" : !Object.values(d.values.layersOn || {}).some(Boolean) ? "Select at least one layer" : null),
    manipulators(d) {
      const t = targetOf(d);
      if (!t || !d.dxfData) return [];
      const K = A.K;
      return [{ id: "pos", type: "point", point: K.toWorld(t.plane, d.num("dx") || 0, d.num("dy") || 0), normal: t.plane.n, onMove: (p, final) => { const uv = K.toLocal(t.plane, p); d.set("dx", A.ui.dialog.fmt(uv[0], "length"), { user: true, noPreview: !final }); d.set("dy", A.ui.dialog.fmt(uv[1], "length"), { user: true }); } }];
    },
    afterPreview(d) {
      const t = targetOf(d);
      if (!t || !d.dxfData) { clearPreview(); return; }
      const all = placedDXF(d).flatMap((g) => g.items);
      showPreview(t.plane, all.filter((i) => i.kind !== "text"));
    },
    commit(f, d) {
      const t = targetOf(d);
      if (!t) throw new Error("Select a plane or sketch");
      return insertInto(t, placedDXF(d), "Insert DXF");
    },
    onClose() { clearPreview(); },
  });
  return dlg;
}

function placedDXF(d) {
  const data = d.dxfData;
  const f = UNIT_MM[d.values.units] || 1;
  const on = d.values.layersOn || {};
  const items = placeItems(data.items.filter((i) => on[i.layer] !== false), { k: f, ang: (d.num("ang") || 0) * D2R, dx: d.num("dx") || 0, dy: d.num("dy") || 0 });
  // text: shape with the bundled font (when loaded)
  const textShapes = new Map();
  for (const it of items) if (it.kind === "text") { const sh = shapeText({ text: it.text, font: "Fira Sans", mode: "box" }); if (sh) textShapes.set(it, sh); }
  const inSketch = ST.app.mode === "sketch" && !!ST.sketchId;
  if (d.values.mode === "perLayer" && !inSketch) {
    const byLayer = new Map();
    for (const it of items) { if (!byLayer.has(it.layer)) byLayer.set(it.layer, []); byLayer.get(it.layer).push(it); }
    return [...byLayer].map(([layer, its]) => ({ items: its, textShapes, name: layer }));
  }
  return [{ items, textShapes, name: (d.values.fileName || "").replace(/\.dxf$/i, "") }];
}
