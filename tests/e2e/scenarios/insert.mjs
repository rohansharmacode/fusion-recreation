// INSERT + Bill of Materials through the real UI: MODIFY > Bill of Materials (table, totals, CSV
// export through app.download), INSERT > Canvas (tiny generated PNG through the dialog's file input,
// placed on the box's top face, rendered as a textured plane, Canvases folder + eye, edit, undo,
// document round trip), INSERT > Insert Mesh (generated binary + ASCII STL, Move To Ground, unit type,
// Mesh Bodies folder, canvas pick + Delete + undo).
import zlib from "node:zlib";
import { defineScenario, mainIfDirect, apiBox, near } from "../lib.mjs";

// ------------------------------------------------------------------ fixtures
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (buf) => { let c = 0xffffffff; for (const b of buf) c = t[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
/** Solid-colour RGB PNG (w x h). */
function makePNG(w, h, rgb) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 3)] = 0; for (let x = 0; x < w; x++) raw.set(rgb, y * (1 + w * 3) + 1 + x * 3); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
/** Axis-aligned cube triangles [x0..x0+s] x [y0..] x [z0..] (12 triangles, outward winding). */
function cubeTris(o, s) {
  const [x, y, z] = o;
  const P = (i, j, k) => [x + i * s, y + j * s, z + k * s];
  const q = (a, b, c, d) => [[a, b, c], [a, c, d]];
  return [
    ...q(P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)), ...q(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)),
    ...q(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)), ...q(P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0)),
    ...q(P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)), ...q(P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)),
  ];
}
function binarySTL(tris) {
  const b = Buffer.alloc(84 + tris.length * 50);
  b.write("binary stl from the insert scenario", 0, "ascii");
  b.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => { const o = 84 + i * 50 + 12; t.flat().forEach((v, k) => b.writeFloatLE(v, o + k * 4)); });
  return b;
}
function asciiSTL(tris) {
  return Buffer.from(`solid cube\n${tris.map((t) => `facet normal 0 0 0\n outer loop\n${t.map((p) => `  vertex ${p.join(" ")}`).join("\n")}\n endloop\nendfacet`).join("\n")}\nendsolid cube\n`, "ascii");
}

const scenario = defineScenario({
  name: "insert",
  title: "Bill of Materials, Canvas (PNG on a face), Insert Mesh (STL), browser folders, undo, round trip",
  timeout: 150000,
  async run(t) {
    t.step("setup: 40 x 20 x 10 box (App API)");
    const box = await t.app(() => {
      const f = window.app.addFeature({ type: "box", length: "40 mm", width: "20 mm", height: "10 mm", center: [0, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
      return { body: f.newBody, ok: !!(window.app.featureResult(f.id) || {}).ok };
    });
    t.require("box body created", box.ok && box.body, JSON.stringify(box));
    void apiBox;
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);

    // ------------------------------------------------------------- Bill of Materials
    t.step("MODIFY > Bill of Materials lists the body with mass, volume and totals");
    await t.escapeAll();
    const reg = await t.app(() => { const d = window.app.commands.get("MaterializedBomHybridCmd"); return d ? { stub: !!d.stub, label: d.label } : null; });
    t.check("MaterializedBomHybridCmd is a real command", reg && !reg.stub, JSON.stringify(reg));
    const clicked = await t.click('#toolbar [data-cmd="MaterializedBomHybridCmd"]', { timeout: 1500 }) || await t.click('[data-cmd="MaterializedBomHybridCmd"]', { timeout: 1500 });
    if (!clicked) { t.note("BOM toolbar button not clickable; ran the command"); await t.app(() => window.app.commands.run("MaterializedBomHybridCmd")); }
    t.require("BILL OF MATERIALS window open", await t.waitFor('.mn-modal[data-dialog="MaterializedBomHybridCmd"]', { timeout: 2000 }));
    const bom = await t.app((body) => {
      const m = document.querySelector('.mn-modal[data-dialog="MaterializedBomHybridCmd"]');
      const row = m.querySelector(`tr[data-body="${body}"]`);
      const mp = window.app.ui.inspect.massProperties([body]);
      return {
        head: [...m.querySelectorAll("thead th")].map((x) => x.textContent.trim()),
        row: row ? [...row.children].map((x) => x.textContent.trim()) : null,
        tot: [...m.querySelectorAll("tfoot td")].map((x) => x.textContent.trim()),
        mass: mp.mass.toFixed(3), volume: mp.volume.toFixed(3),
      };
    }, box.body);
    t.check("columns Item / Part Name / Quantity / Material / Mass / Volume", bom.head.join("|") === "Item|Part Name|Quantity|Material|Mass (g)|Volume (mm^3)", bom.head.join("|"));
    t.check("body row: Body1, qty 1, volume 8000.000, mass = Properties mass", bom.row && bom.row[1] === "Body1" && bom.row[2] === "1" && bom.row[5] === "8000.000" && bom.row[4] === bom.mass, JSON.stringify(bom));
    t.check("totals row", bom.tot[1] === "Total" && bom.tot[2] === "1" && bom.tot[4] === bom.mass && bom.tot[5] === "8000.000", JSON.stringify(bom.tot));
    await t.app(() => { const a = window.app; a.__dl = []; a.__origDownload = a.download; a.download = async (name, data, mime) => { a.__dl.push({ name, mime, text: typeof data === "string" ? data : "" }); return true; }; });
    await t.click('.mn-modal[data-dialog="MaterializedBomHybridCmd"] [data-action="export"]');
    await t.settle(150);
    const dl = await t.app(() => window.app.__dl.slice());
    const csv = dl[0] && dl[0].text.split(/\r?\n/);
    t.check("Export to CSV goes through app.download (Untitled BOM.csv, text/csv)", dl.length === 1 && dl[0].name === "Untitled BOM.csv" && dl[0].mime === "text/csv", JSON.stringify(dl.map((d) => [d.name, d.mime])));
    t.check("CSV: header, body row, totals", csv && csv[0] === "Item,Part Name,Quantity,Material,Mass (g),Volume (mm^3)" && /^1,Body1,1,.+,8000\.000$/.test(csv[1]) && /^,Total,1,,/.test(csv[2]), JSON.stringify(csv));
    t.check("window stays open after the export", await t.visible('.mn-modal[data-dialog="MaterializedBomHybridCmd"]'));
    await t.shot("bom");
    await t.click('.mn-modal[data-dialog="MaterializedBomHybridCmd"] [data-action="ok"]');
    await t.settle(120);
    t.check("Close closes the window", !(await t.visible('.mn-modal[data-dialog="MaterializedBomHybridCmd"]')));

    // ------------------------------------------------------------- Canvas
    t.step("INSERT > Canvas: pick the top face, choose a PNG, OK");
    await t.escapeAll();
    const cvReg = await t.app(() => { const d = window.app.commands.get("FusionAddCanvasCommand"); return d && !d.stub; });
    t.check("FusionAddCanvasCommand is a real command", cvReg);
    if (!(await t.click('#toolbar [data-cmd="FusionAddCanvasCommand"]', { timeout: 1200 }))) {
      t.note("Canvas is not a visible toolbar button here; ran the command");
      await t.app(() => window.app.commands.run("FusionAddCanvasCommand"));
    }
    t.require("CANVAS dialog open", await t.waitFor('.dlg[data-dialog="FusionAddCanvasCommand"]', { timeout: 2000 }));
    const rows = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="FusionAddCanvasCommand"] .dlg-row')].filter((r) => r.style.display !== "none").map((r) => (r.querySelector(".dlg-label") || {}).textContent));
    t.check("rows Face / Image / Canvas Opacity / Display Through / Selectable / Renderable", rows.join("|") === "Face|Image|Canvas Opacity|Display Through|Selectable|Renderable", rows.join("|"));
    const dflt = await t.app(() => { const v = window.app.ui.dialog.current.values; return { o: v.opacity, th: v.through, s: v.selectable, a: window.app.ui.dialog.current.active }; });
    t.check("defaults: opacity 50, Display Through off, Selectable on, Face row active", dflt.o === "50" && dflt.th === false && dflt.s === true && dflt.a === "plane", JSON.stringify(dflt));
    const top = await t.aim([[5, 3, 10], [-10, 5, 10], [12, -4, 10]], "h && h.ref.kind === 'face' && Math.abs(h.ref.n[2] - 1) < 1e-3");
    t.require("top face pickable", !!top);
    await t.canvasClick(top.x, top.y);
    await t.settle(200);
    const faceSel = await t.app(() => (window.app.ui.dialog.current.values.plane || []).map((r) => r.kind));
    t.check("top face selected", faceSel.join() === "face", JSON.stringify(faceSel));
    const png = makePNG(24, 12, [230, 20, 20]);
    await t.page.setInputFiles('.dlg[data-dialog="FusionAddCanvasCommand"] input[type=file][data-input="imageFile"]', { name: "red-panel.png", mimeType: "image/png", buffer: png });
    t.check("image loaded (file name shown, transform rows appear)", await t.waitFor(() => /red-panel\.png/.test((document.querySelector('.dlg[data-dialog="FusionAddCanvasCommand"] [data-row="image"]') || {}).textContent || "") && !!document.querySelector('.dlg [data-input="scale"]') && document.querySelector('.dlg [data-row="scale"]').style.display !== "none", { timeout: 3000 }));
    const prev = await t.waitFor(() => window.app.ui.insert.view.objects().canvases.includes("__preview"), { timeout: 2000 });
    t.check("live preview canvas in the viewport", prev);
    const manips = await t.app(() => { const d = window.app.ui.dialog.current; return d && d.manips ? ["move", "xDist", "yDist", "angle", "scaleXY"].filter((id) => !!d.manips.screenPoint(id)) : []; });
    t.check("manipulators: move square, X / Y arrows, Z angle ring, scale arrow", manips.length === 5, JSON.stringify(manips));
    await t.shot("canvas-dialog");
    await t.click('.dlg[data-dialog="FusionAddCanvasCommand"] [data-action="ok"]');
    await t.settle(250);
    const cv = await t.app(() => { const a = window.app; const c = (a.doc.canvases || [])[0]; return c ? { n: a.doc.canvases.length, id: c.id, name: c.name, px: c.px, plane: c.planeRef && c.planeRef.kind, o: c.plane && c.plane.o, img: c.image.slice(0, 22), op: c.opacity } : null; });
    t.require("canvas stored in the document", cv && cv.n === 1, JSON.stringify(cv));
    t.check("named after the file, 24 x 12 px on the face, centred on it, PNG data URL", cv.name === "red-panel" && cv.px.join() === "24,12" && cv.plane === "face" && near(cv.o[0], 0, 1e-6) && near(cv.o[1], 0, 1e-6) && near(cv.o[2], 10, 1e-6) && cv.img === "data:image/png;base64," && cv.op === 50, JSON.stringify(cv));
    t.check("browser: Canvases folder with the canvas", await t.waitFor(() => !!document.querySelector('[data-node="canvases:root"]') && /red-panel/.test((document.querySelector(`[data-node="canvas:${"cv1"}"]`) || {}).textContent || ""), { timeout: 1500 }));
    t.check("textured plane rendered", await t.waitFor(() => { const v = window.app.ui.insert.view; const c = window.app.doc.canvases[0]; return v.objects().canvases.includes(c.id) && v.textureReady(c.image); }, { timeout: 3000 }));
    await t.settle(200);
    const cpx = await t.canvasXY([0, 0, 10]);
    const red = await t.colorAt(cpx.x, cpx.y, 2);
    t.check("the canvas shows on the top face (red image at 50% over the body)", red[0] > red[1] + 50 && red[0] > red[2] + 50, JSON.stringify(red));
    await t.shot("canvas");
    // eye toggle (expand the folder first: Fusion's folders start collapsed)
    await t.click('[data-node="canvases:root"] .br-twisty');
    await t.settle(100);
    await t.click('[data-node="canvas:cv1"] .br-eye');
    await t.settle(150);
    const hidden = await t.app(() => ({ v: window.app.doc.canvases[0].visible, objs: window.app.ui.insert.view.objects().canvases.length }));
    t.check("eye hides the canvas", hidden.v === false && hidden.objs === 0, JSON.stringify(hidden));
    const red2 = await t.colorAt(cpx.x, cpx.y, 2);
    t.check("hidden canvas is not drawn", Math.abs(red2[0] - red2[1]) < 30, JSON.stringify(red2));
    await t.click('[data-node="canvas:cv1"] .br-eye');
    await t.settle(150);
    t.check("eye shows it again", await t.app(() => window.app.doc.canvases[0].visible !== false && window.app.ui.insert.view.objects().canvases.length === 1));

    t.step("Edit Canvas from the browser (double-click): Scale Plane XY 2, Display Through");
    await t.dblclick('[data-node="canvas:cv1"] .br-label');
    t.require("EDIT CANVAS dialog open", await t.waitFor('.dlg[data-dialog="FusionAddCanvasCommand"]', { timeout: 2000 }));
    const ed = await t.app(() => { const d = window.app.ui.dialog.current; return { title: d.el.querySelector(".dlg-title, .dlg-head")?.textContent || "", plane: (d.values.plane || []).length, file: d.el.querySelector('[data-row="image"]').textContent }; });
    t.check("edit dialog keeps the face and the image", ed.plane === 1 && /red-panel\.png/.test(ed.file), JSON.stringify(ed));
    await t.fill('.dlg[data-dialog="FusionAddCanvasCommand"] [data-input="scale"]', "2");
    await t.click('.dlg[data-dialog="FusionAddCanvasCommand"] [data-input="through"]');
    await t.settle(200);
    await t.click('.dlg[data-dialog="FusionAddCanvasCommand"] [data-action="ok"]');
    await t.settle(200);
    const edited = await t.app(() => { const c = window.app.doc.canvases[0]; const o = window.app.ui.insert.view.canvasObject(c.id); return { n: window.app.doc.canvases.length, s: c.scale, th: c.through, w: o && o.frame.w, dt: o && o.mesh.material.depthTest }; });
    t.check("edit stored: scale 2 (48 mm wide), Display Through draws without depth test", edited.n === 1 && edited.s === 2 && edited.th === true && near(edited.w, 48, 1e-6) && edited.dt === false, JSON.stringify(edited));

    t.step("undo / redo and a document round trip keep the canvas");
    await t.blur();
    await t.mouseToCanvas(0.5, 0.9);
    await t.key("Control+z");
    await t.settle(150);
    const u1 = await t.app(() => window.app.doc.canvases[0].scale);
    t.check("Ctrl+Z undoes the edit", u1 === 1, String(u1));
    await t.key("Control+y");
    await t.settle(150);
    const r1 = await t.app(() => window.app.doc.canvases[0].scale);
    t.check("Ctrl+Y redoes it", r1 === 2, String(r1));
    const rt = await t.app(() => {
      const a = window.app;
      a.loadDocument(JSON.parse(JSON.stringify(a.doc)));
      return new Promise((res) => setTimeout(() => res({ n: (a.doc.canvases || []).length, objs: a.ui.insert.view.objects().canvases.length, node: !!document.querySelector('[data-node="canvas:cv1"]') }), 120));
    });
    t.check("saved JSON reopened: canvas in the doc, the viewport and the browser", rt.n === 1 && rt.objs === 1 && rt.node, JSON.stringify(rt));

    // ------------------------------------------------------------- Insert Mesh
    t.step("INSERT > Insert Mesh: binary STL, Move To Ground, OK");
    await t.escapeAll();
    const meshReg = await t.app(() => { const d = window.app.commands.get("ParaMeshInsertAlignCommand"); return d && !d.stub; });
    t.check("ParaMeshInsertAlignCommand is a real command", meshReg);
    if (!(await t.click('#toolbar [data-cmd="ParaMeshInsertAlignCommand"]', { timeout: 1200 }))) {
      t.note("Insert Mesh is not a visible toolbar button here; ran the command");
      await t.app(() => window.app.commands.run("ParaMeshInsertAlignCommand"));
    }
    t.require("INSERT MESH dialog open", await t.waitFor('.dlg[data-dialog="ParaMeshInsertAlignCommand"]', { timeout: 2000 }));
    const mrows = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="ParaMeshInsertAlignCommand"] .dlg-row')].filter((r) => r.style.display !== "none").map((r) => (r.querySelector(".dlg-label") || {}).textContent || r.dataset.row));
    t.check("rows Mesh Body / Unit Type / Flip Up Direction / Center + Move To Ground", mrows.slice(0, 4).join("|") === "Mesh Body|Unit Type|Flip Up Direction|place", mrows.join("|"));
    const unit0 = await t.app(() => window.app.ui.dialog.current.values.units);
    t.check("Unit Type defaults to the document units (mm)", unit0 === "mm", unit0);
    await t.page.setInputFiles('.dlg[data-dialog="ParaMeshInsertAlignCommand"] input[type=file][data-input="meshFile"]', { name: "cube.stl", mimeType: "model/stl", buffer: binarySTL(cubeTris([40, -5, 5], 10)) });
    t.check("STL parsed (12 triangles) and previewed", await t.waitFor(() => window.app.ui.insert.view.objects().meshes.includes("__preview") && /cube\.stl/.test(document.querySelector('.dlg [data-row="file"]').textContent), { timeout: 3000 }));
    await t.click('.dlg[data-dialog="ParaMeshInsertAlignCommand"] [data-action="ground"]');
    await t.settle(150);
    const tz = await t.app(() => window.app.ui.dialog.current.values.tz);
    t.check("Move To Ground: Z Distance -5.00 mm", tz === "-5.00 mm", tz);
    await t.shot("mesh-dialog");
    await t.click('.dlg[data-dialog="ParaMeshInsertAlignCommand"] [data-action="ok"]');
    await t.settle(250);
    const mb = await t.app(() => { const m = (window.app.doc.meshes || [])[0]; return m ? { n: window.app.doc.meshes.length, id: m.id, name: m.name, tris: m.tris, tz: m.tz, fmt: m.format } : null; });
    t.require("mesh body stored in the document", mb && mb.n === 1, JSON.stringify(mb));
    t.check("named after the file, 12 triangles, tz -5", mb.name === "cube" && mb.tris === 12 && mb.tz === -5 && mb.fmt === "stl", JSON.stringify(mb));
    t.check("browser: Mesh Bodies folder with the mesh body", await t.waitFor(() => !!document.querySelector('[data-node="meshbodies:root"]') && /cube/.test((document.querySelector('[data-node="meshbody:mb1"]') || {}).textContent || ""), { timeout: 1500 }));
    await t.click('[data-node="meshbodies:root"] .br-twisty');
    const wb = await t.app(() => {
      const o = window.app.ui.insert.view.meshObject("mb1");
      if (!o) return null;
      o.mesh.geometry.computeBoundingBox();
      const b = o.mesh.geometry.boundingBox.clone().applyMatrix4(o.mesh.matrix);
      return [b.min.toArray(), b.max.toArray()];
    });
    t.check("rendered mesh spans x 40..50, z 0..10 (grounded)", wb && near(wb[0][0], 40, 1e-4) && near(wb[1][0], 50, 1e-4) && near(wb[0][2], 0, 1e-4) && near(wb[1][2], 10, 1e-4), JSON.stringify(wb));
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.cameraStable(2000);
    const mp = await t.canvasXY([45, -5, 5]);
    const grey = await t.colorAt(mp.x, mp.y, 2);
    t.check("mesh body drawn (grey facets)", Math.abs(grey[0] - grey[2]) < 40 && grey[0] < 235 && grey[0] > 60, JSON.stringify(grey));
    await t.shot("mesh");

    t.step("click the mesh body in the canvas, Delete, undo");
    await t.escapeAll();
    await t.canvasClick(mp.x, mp.y);
    await t.settle(150);
    const ms = await t.app(() => window.app.selection.items.map((r) => r.kind + ":" + (r.id || r.body)));
    t.check("canvas click selects the mesh body", ms.join() === "meshBody:mb1", JSON.stringify(ms));
    t.check("browser row highlighted", await t.app(() => document.querySelector('[data-node="meshbody:mb1"]').classList.contains("sel")));
    await t.key("Delete");
    await t.settle(150);
    t.check("Delete removes the mesh body", await t.app(() => (window.app.doc.meshes || []).length === 0 && !document.querySelector('[data-node="meshbody:mb1"]')));
    await t.key("Control+z");
    await t.settle(200);
    t.check("undo brings it back", await t.app(() => (window.app.doc.meshes || []).length === 1 && window.app.ui.insert.view.objects().meshes.includes("mb1")));

    t.step("ASCII STL in centimetres");
    await t.escapeAll();
    await t.app(() => window.app.commands.run("ParaMeshInsertAlignCommand"));
    t.require("INSERT MESH dialog open", await t.waitFor('.dlg[data-dialog="ParaMeshInsertAlignCommand"]', { timeout: 2000 }));
    await t.page.setInputFiles('.dlg[data-dialog="ParaMeshInsertAlignCommand"] input[type=file][data-input="meshFile"]', { name: "small.stl", mimeType: "model/stl", buffer: asciiSTL(cubeTris([-8, -1, 0], 1)) });
    await t.waitFor(() => window.app.ui.insert.view.objects().meshes.includes("__preview"), { timeout: 3000 });
    await t.click('.dlg[data-dialog="ParaMeshInsertAlignCommand"] [data-input="units"]');
    await t.click('.dlg-dd-menu [data-option="cm"]');
    await t.settle(150);
    await t.click('.dlg[data-dialog="ParaMeshInsertAlignCommand"] [data-action="ok"]');
    await t.settle(250);
    const m2 = await t.app(() => {
      const m = (window.app.doc.meshes || []).find((x) => x.name === "small");
      const o = m && window.app.ui.insert.view.meshObject(m.id);
      if (!o) return null;
      o.mesh.geometry.computeBoundingBox();
      const b = o.mesh.geometry.boundingBox.clone().applyMatrix4(o.mesh.matrix);
      return { units: m.units, tris: m.tris, size: b.max.x - b.min.x, minx: b.min.x };
    });
    t.check("ASCII STL parsed, 1 cm cube -> 10 mm at x -80", m2 && m2.units === "cm" && m2.tris === 12 && near(m2.size, 10, 1e-4) && near(m2.minx, -80, 1e-4), JSON.stringify(m2));

    t.step("BOM ignores mesh bodies; Mesh Bodies folder eye");
    const bomN = await t.app(() => window.app.ui.insert.bom().rows.length);
    t.check("BOM still lists only the solid body", bomN === 1, String(bomN));
    await t.click('[data-node="meshbodies:root"] .br-eye');
    await t.settle(150);
    t.check("folder eye hides every mesh body", await t.app(() => window.app.doc.meshes.every((m) => m.visible === false) && window.app.ui.insert.view.objects().meshes.length === 0));
    await t.app(() => { if (window.app.__origDownload) window.app.download = window.app.__origDownload; });
    await t.shot("final");

    // ------------------------------------------------------------- Interference
    t.step("INSPECT > Interference: second box overlapping the first by 5 x 20 x 10");
    await t.escapeAll();
    const b2 = await t.app(() => {
      const f = window.app.addFeature({ type: "box", length: "20 mm", width: "20 mm", height: "10 mm", center: [25, 0], operation: "new", plane: { kind: "origin", name: "XY" } });
      return f.newBody;
    });
    t.require("second body", !!b2);
    await t.app((ids) => { window.app.selection.set(ids.map((b) => ({ kind: "body", body: b }))); window.app.commands.run("InterferenceCheckCommand"); }, [box.body, b2]);
    t.require("INTERFERENCE dialog open", await t.waitFor('.dlg[data-dialog="InterferenceCheckCommand"]', { timeout: 2000 }));
    t.check("both bodies preselected", await t.app(() => (window.app.ui.dialog.current.values.bodies || []).length === 2));
    await t.click('.dlg[data-dialog="InterferenceCheckCommand"] [data-action="compute"]');
    await t.settle(250);
    const intf = await t.app(() => [...document.querySelectorAll('.dlg[data-dialog="InterferenceCheckCommand"] tr[data-result]')].map((tr) => [...tr.children].map((c) => c.textContent)));
    t.check("one interference: Body1 / Body2, 1000.000 mm^3", intf.length === 1 && intf[0][1] === "Body1" && intf[0][2] === "Body2" && intf[0][3] === "1000.000 mm^3", JSON.stringify(intf));
    await t.shot("interference");
    await t.click('.dlg[data-dialog="InterferenceCheckCommand"] [data-action="ok"]');
    await t.settle(150);
    t.check("OK closes it", !(await t.visible('.dlg[data-dialog="InterferenceCheckCommand"]')));
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
