// FORM (T-Spline) environment through the real UI: Create Form (SOLID > CREATE), FORM tab, Box by plane / centre
// clicks, display modes (Alt+1/2/3), face pick + Edit Form arrow drag and Alt-drag extrude, double-click edge
// loop + Insert Edge, Crease, Subdivide, Bevel, Delete key, the other MODIFY / SYMMETRY / UTILITIES tools through
// their dialogs, a sketch made inside the form + T-Spline Extrude, Insert Point by canvas clicks, Merge Edge, Bridge,
// Pull, Match G2, Mirror / Circular - Internal, Isolate Symmetry, Face Edge / Chain modes, New Component, Smooth Brush,
// undo / redo, FINISH FORM (B-rep solid),
// Edit Feature from the timeline, Convert (BRep to T-Spline), Insert T-Spline (TSM text) and a save / open round trip.
import { defineScenario, mainIfDirect } from "../lib.mjs";

const dlgSel = (id) => `.dlg[data-dialog="${id}"]`;
const PANELS = { create: "TSplinePrimitivePanel", modify: "TSplineModifyPanel", symmetry: "TSplineSymmetryPanel", utilities: "TSplineUtilitiesPanel" };

/** Run a FORM command from its toolbar button, else its panel dropdown, else the registry. */
async function run(t, id, panel) {
  if (await t.click(`#toolbar [data-cmd="${id}"]`, { timeout: 400 })) return "button";
  if (panel && (await t.click(`#toolbar [data-panel="${PANELS[panel]}"]`, { timeout: 800 })) && (await t.click(`#overlay [data-cmd="${id}"]`, { timeout: 1000 }))) return "menu";
  await t.app((id) => window.app.commands.run(id), id);
  return "api";
}
async function ok(t, id) {
  await t.settle(150);
  await t.click(`${dlgSel(id)} [data-action="ok"]`);
  const closed = await t.waitFor((s) => !document.querySelector(s), { timeout: 15000, arg: dlgSel(id) });
  if (!closed) {
    const why = await t.app((s) => { const d = document.querySelector(s); return d ? d.innerText.slice(-200) : ""; }, dlgSel(id));
    t.note(`${id} did not close: ${why}`);
    await t.app(() => window.app.ui.dialog.current && window.app.ui.dialog.current.cancel());
  }
  return closed;
}
const form = (t) => t.app(() => {
  const a = window.app;
  const f = a.doc.features.find((x) => x.type === "form");
  return f ? { id: f.id, n: f.bodies.length, bodies: f.bodies.map((c) => ({ id: c.id, v: c.v.length, f: c.f.length, crease: (c.crease || []).length, sym: c.sym ? c.sym.type : null })), res: a.featureResult(f.id) } : null;
});
const setSel = (t, id, refs) => t.app(({ id, refs }) => { const d = window.app.ui.dialog.current; d.setSelection(id, refs, { user: true }); d.previewNow(); }, { id, refs });

const scenario = defineScenario({
  name: "form",
  title: "FORM environment: T-spline primitives, Edit Form, modify / symmetry / utility tools, finish, convert",
  timeout: 300000,
  async run(t) {
    // ------------------------------------------------------------------ A. Create Form
    t.step("A. SOLID > CREATE > Create Form enters the FORM environment");
    await t.click('#toolbar [data-panel="SolidCreatePanel"]');
    t.require("Create Form in the CREATE dropdown", await t.click('#overlay [data-cmd="TSplineBaseFeatureCreationCommand"]', { timeout: 2000 }));
    await t.settle(250);
    const env = await t.app(() => ({ mode: window.app.mode, tab: (document.querySelector('#toolbar [data-tab][aria-selected="true"]') || {}).dataset?.tab, feats: window.app.doc.features.map((f) => f.type), stubs: window.app.commands.all().filter((d) => d.stub && /^TSpline/.test(d.id)).map((d) => d.id) }));
    t.check("mode 'form', FORM tab, Form feature in the timeline", env.mode === "form" && env.tab === "FormTab" && env.feats.join() === "form", JSON.stringify(env));
    t.check("no FORM command is a stub", env.stubs.length === 0, env.stubs.join(","));
    t.check("FINISH FORM button", await t.visible('#toolbar [data-cmd="TSplineBaseFeatureStop"]'));

    // ------------------------------------------------------------------ B. Box
    t.step("B. Box: pick the XY plane, click the centre, type the length, OK");
    await run(t, "TSplinePrimitiveBoxCommand", "create");
    t.require("BOX dialog", await t.waitFor((s) => !!document.querySelector(s), { arg: dlgSel("TSplinePrimitiveBoxCommand") }));
    const xy = await t.aim([[5, 40, 0], [10, 30, 0], [20, 40, 0], [30, 30, 0], [40, 10, 0], [25, 5, 0], [5, 5, 0]], "h && h.ref.kind === 'originPlane' && h.ref.name === 'XY'");
    t.require("XY plane under the cursor", !!xy);
    await t.canvasClick(xy.x, xy.y);
    const c0 = await t.canvasXY([0, 0, 0]);
    await t.canvasClick(c0.x, c0.y);
    await t.fill(`${dlgSel("TSplinePrimitiveBoxCommand")} [data-input="length"]`, "30");
    t.check("preview is a T-spline body", await t.waitFor(() => window.app.allBodies().some((b) => b.kind === "tspline")));
    await ok(t, "TSplinePrimitiveBoxCommand");
    let F = await form(t);
    t.check("Box: 26 control vertices, 24 faces, T-spline body", F && F.n === 1 && F.bodies[0].v === 26 && F.bodies[0].f === 24, JSON.stringify(F));
    const B = F.bodies[0].id;
    t.check("box length 30 mm (cage x extent)", await t.app((b) => { const c = window.app.ui.form.cage; const f = window.app.doc.features.find((x) => x.type === "form"); const cg = f.bodies.find((x) => x.id === b); const bb = c.bbox(cg); return Math.abs(bb.max[0] - bb.min[0] - 30) < 1e-6; }, B));
    t.check("Bodies folder lists the T-spline body", await t.waitFor((b) => !!document.querySelector(`[data-node="body:${b}"]`), { arg: B }));
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.settle(200);
    await t.shot("box");

    // ------------------------------------------------------------------ C. display modes
    t.step("C. Display modes: Alt+2 control frame, Alt+1 box, Alt+3 smooth");
    await t.canvasClick(30, 300, { hover: false });
    await t.key("Escape");
    await t.key("Alt+2");
    t.check("Alt+2: control frame display (cage drawn)", await t.waitFor((b) => window.app.ui.form.state.display.get(b) === "frame" && !!window.app.viewport.groups.bodies.getObjectByName("tspline-cage")?.children.some((o) => o.isPoints), { arg: B }));
    await t.shot("frame");
    await t.key("Alt+1");
    t.check("Alt+1: box display (flat cage faces)", await t.waitFor((b) => window.app.ui.form.state.display.get(b) === "box" && window.app.anyBody(b).mesh.positions.length === 3 * 4 * 24, { arg: B }));
    await t.key("Alt+3");
    t.check("Alt+3: smooth display", await t.waitFor((b) => window.app.ui.form.state.display.get(b) === "smooth", { arg: B }));

    // ------------------------------------------------------------------ D. Edit Form
    t.step("D. Click a top face, Edit Form, drag the Z arrow, Alt-drag to extrude");
    const top = await t.aim([[7, 5, 19.5], [-7, 5, 19.5], [7, -5, 19.5], [-7, -5, 19.5]], "h && h.ref.kind === 'tsFace'");
    t.require("a T-spline face under the cursor", !!top);
    await t.canvasClick(top.x, top.y);
    t.check("click selects a T-spline face", await t.app(() => window.app.selection.items.length === 1 && window.app.selection.items[0].kind === "tsFace"));
    await run(t, "TSplineEditCommand", "modify");
    t.require("EDIT FORM dialog with the face", await t.waitFor(() => { const d = window.app.ui.dialog.current; return d && d.id === "TSplineEditCommand" && (d.values.sel || []).length === 1; }));
    const zArrow = async () => t.app(() => { const d = window.app.ui.dialog.current; const r = window.app.viewport.canvas.getBoundingClientRect(); const p = d.manips.screenPoint("t2"); return p && { x: r.left + p[0], y: r.top + p[1] }; });
    let za = await zArrow();
    t.require("Z arrow manipulator", !!za);
    await t.page.mouse.move(za.x, za.y);
    await t.page.mouse.down();
    for (let k = 1; k <= 6; k++) await t.page.mouse.move(za.x, za.y - 7 * k);
    await t.page.mouse.up();
    await t.settle(250);
    const tz = await t.app(() => window.app.ui.dialog.current.num("tz"));
    t.check("dragging the Z arrow moves the face up", tz > 0.5, `tz=${tz}`);
    za = await zArrow();
    await t.page.mouse.move(za.x, za.y);
    await t.page.mouse.down();
    for (let k = 1; k <= 4; k++) await t.page.mouse.move(za.x, za.y - 7 * k);
    await t.page.mouse.up();
    await t.settle(250);
    const tz2 = await t.app(() => window.app.ui.dialog.current.num("tz"));
    t.check("a second drag adds to Z Distance (values are cumulative for the selection)", tz2 > tz + 0.5, `${tz} -> ${tz2}`);
    za = await zArrow();
    await t.page.keyboard.down("Alt");
    await t.page.mouse.move(za.x, za.y);
    await t.page.mouse.down();
    for (let k = 1; k <= 6; k++) await t.page.mouse.move(za.x, za.y - 6 * k);
    await t.page.mouse.up();
    await t.page.keyboard.up("Alt");
    await t.settle(250);
    const wk = await t.app(() => { const d = window.app.ui.dialog.current; return [...d.work.values()].map((c) => c.f.length); });
    t.check("Alt-drag extrudes the face (4 side faces added)", wk[0] === 28, JSON.stringify(wk));
    await t.shot("edit-form");
    await ok(t, "TSplineEditCommand");
    F = await form(t);
    t.check("Edit Form committed: 30 vertices / 28 faces", F.bodies[0].v === 30 && F.bodies[0].f === 28, JSON.stringify(F.bodies[0]));

    // ------------------------------------------------------------------ E. loop + Insert Edge
    t.step("E. Double-click an edge for its loop, Insert Edge");
    const edge = await t.app((b) => {
      const a = window.app, C = a.ui.form.cage;
      const e = a.anyBody(b).entry;
      const tp = C.topo(e.data.cage);
      const vp = a.viewport;
      const r = vp.canvas.getBoundingClientRect();
      // a front-facing edge between two side faces, with a long loop
      for (let i = 0; i < tp.edges.length; i++) {
        if (C.edgeLoop(e.data.cage, i).length < 6) continue;
        const pl = e.data.ev.edgeCurve(...tp.edges[i]);
        const p = pl[Math.floor(pl.length / 2)];
        const s = vp.toScreen(p);
        const h = vp.pick(s[0], s[1]);
        if (h && h.ref.kind === "tsEdge" && h.ref.a === tp.edges[i][0] && h.ref.b === tp.edges[i][1]) return { x: r.left + s[0], y: r.top + s[1], loop: C.edgeLoop(e.data.cage, i).length };
      }
      return null;
    }, B);
    t.require("a visible edge with a loop", !!edge);
    await t.page.mouse.dblclick(edge.x, edge.y);
    await t.settle(200);
    const nsel = await t.app(() => window.app.selection.items.filter((r) => r.kind === "tsEdge").length);
    t.check("double-click selects the whole edge loop", nsel === edge.loop, `${nsel} of ${edge.loop}`);
    await run(t, "TSplineInsertEdgeCommand", "modify");
    t.check("INSERT EDGE dialog takes the loop", await t.waitFor((n) => { const d = window.app.ui.dialog.current; return d && d.id === "TSplineInsertEdgeCommand" && (d.values.edges || []).length === n; }, { arg: nsel }));
    await ok(t, "TSplineInsertEdgeCommand");
    let F2 = await form(t);
    t.check("Insert Edge (both sides) adds two loops of faces", F2.bodies[0].f === F.bodies[0].f + 2 * nsel, `${F.bodies[0].f} -> ${F2.bodies[0].f}`);

    // ------------------------------------------------------------------ F. more MODIFY tools through their dialogs
    t.step("F. Crease, Subdivide, Bevel Edge, Smooth, Freeze through their dialogs; Delete key");
    const tool = async (id, panel, setup) => {
      await t.app(() => window.app.selection.clear());
      await run(t, id, panel);
      if (!(await t.waitFor((s) => !!document.querySelector(s), { arg: dlgSel(id), timeout: 3000 }))) { t.check(`${id} dialog`, false); return null; }
      await t.app(setup.fn, setup.arg);
      return ok(t, id);
    };
    const firstEdges = (n) => t.app(({ b, n }) => { const a = window.app, C = a.ui.form.cage; const c = a.doc.features.find((x) => x.type === "form").bodies.find((x) => x.id === b); const tp = C.topo(c); return C.edgeLoop(c, tp.edges.findIndex((_, i) => C.edgeLoop(c, i).length >= n)).map((e) => C.eRef(b, ...tp.edges[e])); }, { b: B, n });
    const loop = await firstEdges(4);
    await tool("TSplineCreasedEdgeCommand", "modify", { fn: (l) => { const d = window.app.ui.dialog.current; d.setSelection("ents", l, { user: true }); d.previewNow(); }, arg: loop });
    F = await form(t);
    t.check("Crease marks the loop's edges", F.bodies[0].crease === loop.length, `${F.bodies[0].crease}`);
    await tool("TSplineUnCreaseEdgeCmd", "modify", { fn: (l) => { const d = window.app.ui.dialog.current; d.setSelection("ents", l, { user: true }); d.previewNow(); }, arg: loop });
    F = await form(t);
    t.check("UnCrease clears them", F.bodies[0].crease === 0);
    const f0 = F.bodies[0].f;
    await tool("TSplineSubsetCmd", "modify", { fn: (b) => { const d = window.app.ui.dialog.current; d.setSelection("faces", [{ kind: "tsFace", body: b, f: 0 }], { user: true }); d.previewNow(); }, arg: B });
    F = await form(t);
    t.check("Subdivide splits a face into four", F.bodies[0].f === f0 + 3, `${f0} -> ${F.bodies[0].f}`);
    const loop2 = await firstEdges(4);
    const fb = F.bodies[0].f;
    await tool("TSplineBevelEdgeCommand", "modify", { fn: (l) => { const d = window.app.ui.dialog.current; d.setSelection("edges", l, { user: true }); d.previewNow(); }, arg: loop2 });
    F = await form(t);
    t.check("Bevel Edge adds a band of faces", F.bodies[0].f > fb, `${fb} -> ${F.bodies[0].f}`);
    await tool("TSplineSmoothCmd", "modify", { fn: (b) => { const d = window.app.ui.dialog.current; d.setSelection("faces", [{ kind: "body", body: b }], { user: true }); d.previewNow(); }, arg: B });
    await tool("TSplineFreezeCmd", "modify", { fn: (b) => { const d = window.app.ui.dialog.current; d.setSelection("ents", [{ kind: "tsFace", body: b, f: 1 }], { user: true }); d.previewNow(); }, arg: B });
    t.check("Freeze stores frozen vertices", await t.app((b) => window.app.doc.features.find((x) => x.type === "form").bodies.find((x) => x.id === b).frozen.length > 0, B));
    await tool("TSplineUnFreezeCmd", "modify", { fn: (b) => { const d = window.app.ui.dialog.current; d.setSelection("ents", [{ kind: "body", body: b }], { user: true }); d.previewNow(); }, arg: B });
    t.check("UnFreeze clears them", await t.app((b) => window.app.doc.features.find((x) => x.type === "form").bodies.find((x) => x.id === b).frozen.length === 0, B));
    // Delete key removes the selected T-spline face
    const fd = (await form(t)).bodies[0].f;
    const face = await t.aim([[0, -20, 10], [5, -16, 8], [-5, -16, 12], [0, -15, 15]], "h && h.ref.kind === 'tsFace'");
    if (face) {
      await t.canvasClick(face.x, face.y);
      await t.key("Delete");
      F = await form(t);
      t.check("Delete removes the selected T-spline face", F.bodies[0].f === fd - 1, `${fd} -> ${F.bodies[0].f}`);
      await t.key("Control+z");
      F = await form(t);
      t.check("undo restores it (still in FORM)", F.bodies[0].f === fd && (await t.app(() => window.app.mode)) === "form");
      await t.key("Control+y");
      F = await form(t);
      t.check("redo deletes it again", F.bodies[0].f === fd - 1);
      await t.key("Control+z");
    } else t.check("front face found for Delete", false);

    // ------------------------------------------------------------------ G. other bodies, symmetry, utilities
    t.step("G. Plane + Thicken, Cylinder + Fill Hole, Sphere / Torus / Quadball, Mirror - Duplicate, symmetric Edit Form, Repair, Make Uniform, Display Mode");
    const prim = async (id, plane, center) => {
      await run(t, id, "create");
      await t.waitFor((s) => !!document.querySelector(s), { arg: dlgSel(id) });
      await t.app(({ plane, center }) => { const d = window.app.ui.dialog.current; d.setSelection("plane", [{ kind: "originPlane", name: plane }], { user: true }); d.set("center", center, { user: true }); d.previewNow(); }, { plane, center });
      return ok(t, id);
    };
    await prim("TSplinePrimitivePlaneCommand", "XY", [50, 0]);
    await prim("TSplinePrimitiveCylinderCommand", "XY", [-50, 0]);
    await prim("TSplinePrimitiveSphereCommand", "XY", [0, 50]);
    await prim("TSplinePrimitiveTorusCommand", "XY", [0, -60]);
    await prim("TSplinePrimitiveQuadBallCommand", "XY", [50, 50]);
    F = await form(t);
    t.check("five more T-spline bodies", F.n === 6, JSON.stringify(F.bodies.map((b) => `${b.v}/${b.f}`)));
    const [, plane, cyl, , , qb] = F.bodies.map((b) => b.id);
    await tool("TSplineThickenCommand", "modify", { fn: (b) => { const d = window.app.ui.dialog.current; d.setSelection("body", [{ kind: "body", body: b }], { user: true }); d.previewNow(); }, arg: plane });
    F = await form(t);
    t.check("Thicken turns the plane into a closed body", F.bodies[1].f === 16, JSON.stringify(F.bodies[1]));
    await tool("TSplineFillHoleCmd", "modify", { fn: (b) => { const a = window.app, C = a.ui.form.cage; const c = a.doc.features.find((x) => x.type === "form").bodies.find((x) => x.id === b); const tp = C.topo(c); const e = tp.edges.find((_, i) => tp.eFaces[i].length === 1); const d = a.ui.dialog.current; d.setSelection("edge", [C.eRef(b, ...e)], { user: true }); d.previewNow(); }, arg: cyl });
    t.check("Fill Hole closes one end of the cylinder", await t.app((b) => { const a = window.app, C = a.ui.form.cage; const c = a.doc.features.find((x) => x.type === "form").bodies.find((x) => x.id === b); return C.boundaryLoops(c).length === 1; }, cyl));
    await t.app(() => window.app.selection.clear());
    await run(t, "TSplineReflectionMirrorSymmetryCmd", "symmetry");
    await t.waitFor((s) => !!document.querySelector(s), { arg: dlgSel("TSplineReflectionMirrorSymmetryCmd") });
    await setSel(t, "body", [{ kind: "body", body: qb }]);
    await setSel(t, "plane", [{ kind: "originPlane", name: "YZ" }]);
    await ok(t, "TSplineReflectionMirrorSymmetryCmd");
    F = await form(t);
    const q = F.bodies.find((b) => b.id === qb);
    t.check("Mirror - Duplicate doubles the quadball with mirror symmetry", q.f === 48 && q.sym === "mirror", JSON.stringify(q));
    // symmetric edit: moving vertex 0 moves its mirror partner
    const sym = await t.app((b) => {
      const a = window.app, C = a.ui.form.cage;
      const c0 = a.doc.features.find((x) => x.type === "form").bodies.find((x) => x.id === b);
      const { partners } = C.symPartners(c0);
      const v = c0.v.findIndex((p, i) => partners[0][i] >= 0 && partners[0][i] !== i);
      const w = partners[0][v];
      a.commands.run("TSplineEditCommand");
      const d = a.ui.dialog.current;
      d.setSelection("sel", [C.vRef(b, v)], { user: true });
      d.set("tx", "3 mm", { user: true });
      d.set("tz", "2 mm", { user: true });
      d.previewNow();
      d.ok();
      const c1 = a.doc.features.find((x) => x.type === "form").bodies.find((x) => x.id === b);
      return { dv: c1.v[v].map((x, i) => x - c0.v[v][i]), dw: c1.v[w].map((x, i) => x - c0.v[w][i]) };
    }, qb);
    t.check("Edit Form keeps mirror symmetry (partner moves mirrored)", Math.abs(sym.dv[0] + sym.dw[0]) < 1e-6 && Math.abs(sym.dv[2] - sym.dw[2]) < 1e-6 && Math.abs(sym.dv[2] - 2) < 1e-6, JSON.stringify(sym));
    await tool("TSplineRepairBodyCmd", "utilities", { fn: (b) => { const d = window.app.ui.dialog.current; d.setSelection("body", [{ kind: "body", body: b }], { user: true }); d.previewNow(); }, arg: B });
    await tool("TSplineMakeUniformCmd", "utilities", { fn: (b) => { const d = window.app.ui.dialog.current; d.setSelection("bodies", [{ kind: "body", body: b }], { user: true }); d.previewNow(); }, arg: B });
    await tool("TSplineToggleTessModeCmd", "utilities", { fn: () => { window.app.ui.dialog.current.set("mode", "frame", { user: true }); }, arg: null });
    t.check("Display Mode dialog sets control frame display", await t.app((b) => window.app.ui.form.state.display.get(b) === "frame", B));
    await t.key("Alt+3");
    await t.shot("many-bodies");

    // ------------------------------------------------------------------ H. sketch in the form + T-Spline Extrude
    t.step("H. A sketch made inside the form, then T-Spline Extrude of its circle");
    const sk = await t.app(() => {
      const a = window.app, S = a.S;
      const s = S.newSketch();
      S.addCircle(s, S.addPoint(s, 0, 0), 8);
      const f = a.addFeature({ type: "sketch", plane: { o: [0, 0, 40], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk: s, visible: true });
      return { id: f.id, mode: a.mode, region: a.sketchState(f.id).regions.regions[0].key };
    });
    t.check("still in FORM after adding the sketch", sk.mode === "form");
    await run(t, "TSplineExtrudeCommand", "create");
    await t.waitFor((s) => !!document.querySelector(s), { arg: dlgSel("TSplineExtrudeCommand") });
    await setSel(t, "profile", [{ kind: "profile", sketch: sk.id, key: sk.region, c: [0, 0] }]);
    await t.fill(`${dlgSel("TSplineExtrudeCommand")} [data-input="distance"]`, "15");
    await ok(t, "TSplineExtrudeCommand");
    F = await form(t);
    const ex = F.bodies[F.bodies.length - 1];
    t.check("T-Spline Extrude makes a tube (8 x 2 faces)", F.n === 7 && ex.f === 16, JSON.stringify(ex));

    // ------------------------------------------------------------------ I. finish
    // ------------------------------------------------------------------ H2. remaining tools
    t.step("H2. Insert Point (canvas clicks), Merge Edge, Bridge, Pull, Match G2, Mirror / Circular - Internal, Isolate Symmetry, Face Edge / Chain, New Component, Smooth Brush");
    const cageOfB = (b) => t.app((b) => { const f = window.app.doc.features.find((x) => x.type === "form"); const c = f.bodies.find((x) => x.id === b); return c ? { v: c.v.length, f: c.f.length, loops: window.app.ui.form.cage.boundaryLoops(c).length, sym: c.sym && c.sym.type, iso: (c.iso || []).length, verts: c.v } : null; }, b);
    const newest = async () => { const fm = await form(t); return fm.bodies[fm.bodies.length - 1].id; };
    const openDlg = async (id, panel) => { await t.app(() => window.app.selection.clear()); await run(t, id, panel); return t.waitFor((s) => !!document.querySelector(s), { arg: dlgSel(id) }); };
    // two planes side by side (Merge Edge), the right one also used by Insert Point and Face
    await prim("TSplinePrimitivePlaneCommand", "XY", [0, -120]);
    const pA = await newest();
    await prim("TSplinePrimitivePlaneCommand", "XY", [25, -120]);
    const pB = await newest();
    await t.app(() => window.app.viewport.fit({ animate: false }));
    // Insert Point: click the midpoints of two opposite edges of one face of pB
    await openDlg("TSplineInsertPointCommand", "modify");
    const ip = await t.app((b) => {
      const a = window.app, e = a.anyBody(b).entry, c = e.data.cage, fc = c.f[0], vp = a.viewport, r = vp.canvas.getBoundingClientRect();
      const mid = (x, y) => { const pl = e.data.ev.edgeCurve(x, y); const s = vp.toScreen(pl[Math.floor(pl.length / 2)]); return { x: r.left + s[0], y: r.top + s[1] }; };
      return [mid(fc[0], fc[1]), mid(fc[2], fc[3])];
    }, pB);
    for (const q of ip) await t.canvasClick(q.x, q.y);
    const ipFaces = (await cageOfB(pB)).f;
    await ok(t, "TSplineInsertPointCommand");
    t.check("Insert Point (two canvas clicks) splits a face with a new edge", (await cageOfB(pB)).f === ipFaces + 1, JSON.stringify({ before: ipFaces, after: (await cageOfB(pB)).f }));
    // Merge Edge: the facing boundary edges of the two planes
    const nb0 = (await form(t)).n;
    await openDlg("TSplineMergeEdgeCmd", "modify");
    await t.app(({ pA, pB }) => {
      const a = window.app, C = a.ui.form.cage, f = a.doc.features.find((x) => x.type === "form");
      const be = (id, x) => { const c = f.bodies.find((q) => q.id === id); const tp = C.topo(c); return tp.edges.filter(([u, w], i) => tp.eFaces[i].length === 1 && Math.abs(c.v[u][0] - x) < 1e-6 && Math.abs(c.v[w][0] - x) < 1e-6).map(([u, w]) => C.eRef(id, u, w)); };
      const d = a.ui.dialog.current;
      d.setSelection("one", be(pA, 10), { user: true });
      d.setSelection("two", be(pB, 15), { user: true });
      d.previewNow();
    }, { pA, pB });
    await ok(t, "TSplineMergeEdgeCmd");
    const mA = await cageOfB(pA);
    t.check("Merge Edge joins the two planes into one body", (await form(t)).n === nb0 - 1 && mA && mA.f >= 8 && mA.loops === 1, JSON.stringify({ n: (await form(t)).n, mA: mA && { v: mA.v, f: mA.f, loops: mA.loops } }));
    // Bridge: the two open ends of the extruded tube
    await openDlg("TSplineBridgeSubDCmd", "modify");
    await t.app((b) => {
      const a = window.app, C = a.ui.form.cage, c = a.doc.features.find((x) => x.type === "form").bodies.find((q) => q.id === b);
      const L = (l) => l.map((v, i) => C.eRef(b, v, l[(i + 1) % l.length]));
      const [l1, l2] = C.boundaryLoops(c);
      const d = a.ui.dialog.current;
      d.setSelection("one", L(l1), { user: true });
      d.setSelection("two", L(l2), { user: true });
      d.previewNow();
    }, ex.id);
    await ok(t, "TSplineBridgeSubDCmd");
    const br = await cageOfB(ex.id);
    t.check("Bridge connects the tube's two open ends (closed ring)", br.loops === 0 && br.f > ex.f, JSON.stringify({ f: br.f, loops: br.loops }));
    // Pull: the merged plane onto a solid sphere; Match G2: a plane boundary onto a sketch line
    const tgt = await t.app(() => {
      const a = window.app, S = a.S;
      const sph = a.addFeature({ type: "sphere", diameter: "30 mm", center: [12.5, -120], operation: "new", plane: { kind: "origin", name: "XY" } }).newBody;
      const s = S.newSketch(); const p = [[-60, -100], [60, -100]].map((q) => S.addPoint(s, q[0], q[1])); S.addLine(s, p[0], p[1]);
      const sid = a.addFeature({ type: "sketch", plane: { o: [0, 0, 5], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk: s }).id;
      const line = Object.keys(a.sketchState(sid).sk.curves).find((k) => a.sketchState(sid).sk.curves[k].type === "line");
      return { sph, sid, line, mode: a.mode };
    });
    t.check("still in FORM after adding a sphere and a sketch", tgt.mode === "form");
    await openDlg("TSplinePullSubDCmd", "modify");
    await setSel(t, "verts", [{ kind: "body", body: pA }]);
    await setSel(t, "target", [{ kind: "body", body: tgt.sph }]);
    await ok(t, "TSplinePullSubDCmd");
    const pulled = await t.app(({ b }) => { const c = window.app.doc.features.find((x) => x.type === "form").bodies.find((q) => q.id === b); return c.v.map((p) => Math.hypot(p[0] - 12.5, p[1] + 120, p[2])); }, { b: pA });
    t.check("Pull puts every control point on the sphere (r = 15)", pulled.every((r) => Math.abs(r - 15) < 0.2), JSON.stringify(pulled.map((r) => +r.toFixed(2))));
    await prim("TSplinePrimitivePlaneCommand", "XY", [80, -80]);
    const pM = await newest();
    const before = await cageOfB(pM);
    await openDlg("TSplineMatchCmd", "modify");
    await t.app(({ b, sid, line }) => {
      const a = window.app, C = a.ui.form.cage, c = a.doc.features.find((x) => x.type === "form").bodies.find((q) => q.id === b);
      const tp = C.topo(c);
      const be = tp.edges.filter(([u, w], i) => tp.eFaces[i].length === 1 && c.v[u][1] > -71 && c.v[w][1] > -71).map(([u, w]) => C.eRef(b, u, w));
      const d = a.ui.dialog.current;
      d.setSelection("edges", be, { user: true });
      d.setSelection("target", [{ kind: "sketchCurve", sketch: sid, curve: line }], { user: true });
      d.set("continuity", "g2", { user: true });
      d.previewNow();
    }, { b: pM, sid: tgt.sid, line: tgt.line });
    await ok(t, "TSplineMatchCmd");
    const after = await cageOfB(pM);
    const moved = after.verts.map((p, i) => Math.hypot(p[0] - before.verts[i][0], p[1] - before.verts[i][1], p[2] - before.verts[i][2]));
    t.check("Match G2 moves the boundary row and the two rows inside it", moved.filter((x) => x > 1e-6).length === 9, JSON.stringify(moved.map((x) => +x.toFixed(2))));
    // Mirror - Internal (faces on either side of a new box), Isolate Symmetry, Circular - Internal (cylinder + sketch axis)
    await prim("TSplinePrimitiveBoxCommand", "XY", [-80, -80]);
    const mb = await newest();
    await openDlg("TSplineInternalMirrorSymmetryCmd", "symmetry");
    await t.app((b) => {
      const a = window.app, C = a.ui.form.cage, c = a.doc.features.find((x) => x.type === "form").bodies.find((q) => q.id === b);
      const fx = (sg) => c.f.findIndex((fc) => fc.every((v) => Math.sign(c.v[v][0] + 80) === sg && Math.abs(c.v[v][0] + 80) > 9.9));
      const d = a.ui.dialog.current;
      d.setSelection("master", [C.fRef(b, fx(1))], { user: true });
      d.setSelection("mirror", [C.fRef(b, fx(-1))], { user: true });
      d.previewNow();
    }, mb);
    await ok(t, "TSplineInternalMirrorSymmetryCmd");
    t.check("Mirror - Internal gives the box mirror symmetry", (await cageOfB(mb)).sym === "mirror");
    await openDlg("TSplineIsolateSymmetryCmd", "symmetry");
    await setSel(t, "ents", [{ kind: "tsVertex", body: mb, v: 0 }]);
    await ok(t, "TSplineIsolateSymmetryCmd");
    t.check("Isolate Symmetry marks the vertex", (await cageOfB(mb)).iso === 1);
    await prim("TSplinePrimitiveCylinderCommand", "XY", [-80, 60]);
    const cy = await newest();
    const ax = await t.app(() => {
      const a = window.app, S = a.S;
      const s = S.newSketch(); const p = [[-80, 0], [-80, 20]].map((q) => S.addPoint(s, q[0], q[1])); S.addLine(s, p[0], p[1]);
      const sid = a.addFeature({ type: "sketch", plane: { o: [0, 60, 0], x: [1, 0, 0], n: [0, -1, 0] }, planeRef: { kind: "origin", name: "XZ" }, sk: s }).id;
      return { kind: "sketchCurve", sketch: sid, curve: Object.keys(a.sketchState(sid).sk.curves).find((k) => a.sketchState(sid).sk.curves[k].type === "line") };
    });
    await openDlg("TSplineInternalCircularSymmetryCmd", "symmetry");
    await setSel(t, "face", [{ kind: "tsFace", body: cy, f: 0 }]);
    await setSel(t, "axis", [ax]);
    await t.app(() => { const d = window.app.ui.dialog.current; d.set("count", "8", { user: true }); d.previewNow(); });
    await ok(t, "TSplineInternalCircularSymmetryCmd");
    t.check("Circular - Internal finds 8-fold symmetry about the axis", (await cageOfB(cy)).sym === "circular");
    // Face, Edge mode then Chain mode: click a boundary edge of a new plane, then two points
    await prim("TSplinePrimitivePlaneCommand", "XY", [0, 90]);
    const pF = await newest();
    await t.app(() => window.app.viewport.fit({ animate: false }));
    for (const mode of ["edge", "chain"]) {
      await openDlg("TSplineAppendFaceCommand", "create");
      await t.app((m) => { const d = window.app.ui.dialog.current; d.set("mode", m, { user: true }); }, mode);
      const pts = await t.app((b) => {
        const a = window.app, e = a.anyBody(b).entry, C = a.ui.form.cage, c = e.data.cage, tp = C.topo(c), vp = a.viewport, r = vp.canvas.getBoundingClientRect();
        for (let i = 0; i < tp.edges.length; i++) {
          if (tp.eFaces[i].length !== 1) continue;
          const [u, w] = tp.edges[i];
          const pl = e.data.ev.edgeCurve(u, w);
          const s = vp.toScreen(pl[Math.floor(pl.length / 2)]);
          const h = vp.pick(s[0], s[1], { filter: (x) => x.kind === "tsEdge" });
          if (!h || h.ref.a !== u || h.ref.b !== w) continue;
          const sa = vp.toScreen(c.v[u]), sb = vp.toScreen(c.v[w]);
          const out = (sx, k) => ({ x: r.left + sx[0] + (sx[0] - s[0]) * 0.2 + 30 * k, y: r.top + sx[1] - 40 * k });
          return { e: { x: r.left + s[0], y: r.top + s[1] }, p: [out(sa, 1), out(sb, 1), out(sa, 2), out(sb, 2)] };
        }
        return null;
      }, pF);
      if (!pts) { t.check(`Face ${mode}: a boundary edge on screen`, false); await t.app(() => window.app.ui.dialog.current.cancel()); continue; }
      const f0 = (await cageOfB(pF)).f;
      await t.canvasClick(pts.e.x, pts.e.y);
      const clicks = mode === "chain" ? pts.p : pts.p.slice(0, 2);
      for (const q of clicks) await t.canvasClick(q.x, q.y, { hover: false });
      await ok(t, "TSplineAppendFaceCommand");
      const f1 = (await cageOfB(pF)).f;
      t.check(`Face ${mode} mode attaches ${mode === "chain" ? "a strip of two faces" : "a face"} to the edge`, f1 === f0 + (mode === "chain" ? 2 : 1), `${f0} -> ${f1}`);
    }
    // New Component: a Quadball made with Operation New Component
    const comps0 = await t.app(() => Object.keys(window.app.doc.components || {}).length);
    await openDlg("TSplinePrimitiveQuadBallCommand", "create");
    await t.app(() => { const d = window.app.ui.dialog.current; d.setSelection("plane", [{ kind: "originPlane", name: "XY" }], { user: true }); d.set("center", [-120, 0], { user: true }); d.set("operation", "newComponent", { user: true }); d.previewNow(); });
    await ok(t, "TSplinePrimitiveQuadBallCommand");
    const qn = await newest();
    const comp = await t.app((b) => { const a = window.app; return { n: Object.keys(a.doc.components || {}).length, owner: a.components ? a.components.ownerOf(b) : null }; }, qn);
    t.check("Operation New Component puts the body in a new component", comp.n === comps0 + 1 && comp.owner && comp.owner !== "root", JSON.stringify(comp));
    // Smooth, Brush mode: drag across the quadball
    await t.app(() => window.app.viewport.fit({ animate: false }));
    const sb0 = (await cageOfB(qn)).verts;
    await openDlg("TSplineSmoothCmd", "modify");
    await t.app(() => { const d = window.app.ui.dialog.current; d.set("mode", "brush", { user: true }); d.set("brush", "12 mm", { user: true }); });
    const path = await t.app(() => { const vp = window.app.viewport, r = vp.canvas.getBoundingClientRect(); return [[-126, -4, 9], [-120, 0, 10], [-114, 4, 9]].map((p) => { const s = vp.toScreen(p); return { x: r.left + s[0], y: r.top + s[1] }; }); });
    await t.page.mouse.move(path[0].x, path[0].y);
    await t.page.mouse.down();
    for (let k = 0; k < 12; k++) { const q = path[Math.min(2, Math.floor(k / 4))]; await t.page.mouse.move(q.x + (k % 4) * 2, q.y); await t.settle(40); }
    await t.page.mouse.up();
    await ok(t, "TSplineSmoothCmd");
    const sb1 = (await cageOfB(qn)).verts;
    t.check("Smooth Brush relaxes the vertices under the brush", sb1.some((p, i) => Math.hypot(p[0] - sb0[i][0], p[1] - sb0[i][1], p[2] - sb0[i][2]) > 1e-3));

    t.step("I. FINISH FORM: T-spline bodies become B-rep bodies");
    await t.click('#toolbar [data-cmd="TSplineBaseFeatureStop"]');
    t.check("back in the model, SOLID tab", await t.waitFor(() => window.app.mode === "model" && (document.querySelector('#toolbar [data-tab][aria-selected="true"]') || {}).dataset?.tab === "SolidTab", { timeout: 20000 }));
    const fin = await t.app((b) => { const a = window.app; const f = a.doc.features.find((x) => x.type === "form"); return { res: a.featureResult(f.id), kinds: a.allBodies().map((x) => x.kind), vol: a.bodyInfo(b).volume }; }, B);
    t.check("Form feature evaluates without errors", fin.res && fin.res.ok !== false, JSON.stringify(fin.res));
    t.check("the box became a closed solid with volume", fin.vol > 1000 && !fin.kinds.includes("tspline"), JSON.stringify(fin));
    await t.shot("finished");

    // ------------------------------------------------------------------ J. Edit Feature from the timeline
    t.step("J. Double-click the Form in the timeline re-enters the FORM environment");
    await t.dblclick(`[data-feature="${F.id}"]`);
    t.check("Edit Feature: FORM again, T-spline bodies", await t.waitFor(() => window.app.mode === "form" && window.app.allBodies().some((b) => b.kind === "tspline"), { timeout: 8000 }));
    await t.click('#toolbar [data-cmd="TSplineBaseFeatureStop"]');
    await t.waitFor(() => window.app.mode === "model", { timeout: 20000 });

    // ------------------------------------------------------------------ K. Convert / Insert T-Spline / save-open
    t.step("K. Convert a solid box to T-Spline, Insert T-Spline (TSM text), save / open round trip");
    const solid = await t.app(() => { const a = window.app; const f = a.addFeature({ type: "box", length: "10 mm", width: "10 mm", height: "10 mm", center: [0, -120], operation: "new", plane: { kind: "origin", name: "XY" } }); return f.newBody; });
    await t.app((b) => window.app.selection.set([{ kind: "body", body: b }]), solid);
    await t.app(() => window.app.commands.run("TSpline2BRepCommand"));
    await t.waitFor((s) => !!document.querySelector(s), { arg: dlgSel("TSpline2BRepCommand") });
    t.check("Convert offers BRep to T-Spline for a solid", await t.app(() => window.app.ui.dialog.current.values.type === "brep2ts"));
    await ok(t, "TSpline2BRepCommand");
    const conv = await t.app((b) => { const a = window.app; const fs = a.doc.features.filter((x) => x.type === "form"); const last = fs[fs.length - 1]; return { forms: fs.length, cage: last.bodies[0] && [last.bodies[0].v.length, last.bodies[0].f.length], hidden: a.bodyMeta(b).visible === false, ok: a.featureResult(last.id).ok }; }, solid);
    t.check("Convert: a new Form with an 8-vertex / 6-face cage, the solid hidden", conv.forms === 2 && conv.cage && conv.cage[0] === 8 && conv.cage[1] === 6 && conv.hidden && conv.ok !== false, JSON.stringify(conv));
    const ins = await t.app(() => { const a = window.app; const txt = "tsm 1\nv 0 0 60\nv 10 0 60\nv 10 10 60\nv 0 10 60\nf 1 2 3 4\n"; a.ui.form.insertTSplineText(txt, "Patch"); const fs = a.doc.features.filter((x) => x.type === "form"); const last = fs[fs.length - 1]; const id = last.bodies[0].id; return { forms: fs.length, name: a.bodyMeta(id).name, kind: a.bodyKind(id) }; });
    t.check("Insert T-Spline adds a Form with the TSM body (surface after finish)", ins.forms === 3 && ins.name === "Patch" && ins.kind === "surface", JSON.stringify(ins));
    const rt = await t.app(() => {
      const a = window.app;
      const before = a.allBodies().map((b) => [b.id, b.kind, Math.round(a.bodyInfo(b.id).volume)]).sort().join("|");
      a.ui.files.loadDoc(JSON.parse(JSON.stringify(a.doc)));
      const after = a.allBodies().map((b) => [b.id, b.kind, Math.round(a.bodyInfo(b.id).volume)]).sort().join("|");
      return { same: before === after, before, after };
    });
    t.check("save / open round trip keeps every form body", rt.same, JSON.stringify(rt));
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
