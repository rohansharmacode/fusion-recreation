// QA: assembly module (wave 2b). Through the toolbar, dialogs, canvas, browser and timeline:
//   A. Part Design (Add To Assembly) -> Hybrid Design (ASSEMBLE panel), Add To Assembly
//   B. Joint dialog (canvas snaps, Position / Motion tabs, Revolute), glyph, browser Joints folder, timeline, undo/redo
//   C. Drive Joints, Edit Joint Limits, Animate, Edit Joint (offset), Suppress
//   D. Slider + Motion Link, Rigid Group (moves together), pinned member holds, As-built Joint, Joint Origin
//   E. Component Drag (free and jointed), contact stops a drag at first interference
//   F. Constraints: Align (flush), Angle, Tangent, Center, Joint Constraint
//   G. DOF Analysis, Assembly Statistics, Component Connection Analysis, Duplicate With Joints, Motion Study
//   H. save / open round trip, no console errors
import { defineScenario, mainIfDirect, near } from "../lib.mjs";

const scenario = defineScenario({
  name: "assembly",
  title: "Assembly: joints, joint origins, rigid groups, drive / motion links / motion study, contact, constraints, analyses",
  timeout: 240000,
  async run(t) {
    const helpers = () => {
      const a = window.app;
      window.__asm = {
        box: (c, l = "10 mm", w = "10 mm", h = "10 mm", z = 0) => a.addFeature({ type: "box", plane: { kind: "origin", name: "XY" }, center: c, length: l, width: w, height: h, operation: "new", ...(z ? { offset: `${z} mm` } : {}) }).newBody,
        face: (b, n) => {
          const st = a.result.state, tp = a.K.topoOf(st.bodies.get(b).shape);
          const i = tp.faces.findIndex((f) => f.type === "PLANE" && f.n && f.n[0] * n[0] + f.n[1] * n[1] + f.n[2] * n[2] > 0.99);
          return i < 0 ? null : { kind: "face", body: b, index: i, p: tp.faces[i].c.slice(), n: tp.faces[i].n.slice(), planar: true };
        },
        cyl: (b) => {
          const st = a.result.state, tp = a.K.topoOf(st.bodies.get(b).shape);
          const i = tp.faces.findIndex((f) => f.type === "CYLINDRE");
          return i < 0 ? null : { kind: "face", body: b, index: i, p: tp.faces[i].c.slice(), n: [0, 0, 1], planar: false };
        },
        bb: (b) => { const x = a.bodyInfo(b).bbox; return { min: x.min.map((v) => Math.round(v * 1000) / 1000), max: x.max.map((v) => Math.round(v * 1000) / 1000) }; },
        last: () => a.doc.features[a.doc.features.length - 1],
        res: (id) => a.featureResult(id) || {},
      };
    };
    await t.app(helpers);
    const dlgSel = (id) => `.dlg[data-dialog="${id}"]`;
    const openFromPanel = async (cmd) => {
      await t.click('#toolbar [data-panel="AssemblePanel"]');
      await t.settle(150);
      const ok = await t.click(`#overlay [data-cmd="${cmd}"]`, { timeout: 2000 });
      if (!ok) await t.app((c) => window.app.commands.run(c), cmd);
      return t.waitFor((s) => !!document.querySelector(s), { timeout: 2000, arg: dlgSel(cmd) });
    };

    // ------------------------------------------------------------------ A
    t.step("A. Part Design: PartAssemblePanel (Add To Assembly); Add To Assembly -> new Hybrid Design with the part as a component");
    const a0 = await t.app(() => { const a = window.app; window.__asm.box([0, 0]); a.doc.name = "Bracket"; return { part: !!document.querySelector('#toolbar [data-panel="PartAssemblePanel"]'), asm: !!document.querySelector('#toolbar [data-panel="AssemblePanel"]') }; });
    t.check("Part Design shows the PartAssemblePanel, not ASSEMBLE", a0.part && !a0.asm, JSON.stringify(a0));
    await t.click('#toolbar [data-panel="PartAssemblePanel"]');
    await t.settle(150);
    if (!(await t.click('#overlay [data-cmd="NewAssemblyFromPartCommand"], #toolbar [data-cmd="NewAssemblyFromPartCommand"]', { timeout: 2000 }))) await t.app(() => window.app.commands.run("NewAssemblyFromPartCommand"));
    await t.settle(300);
    const a1 = await t.app(() => {
      const a = window.app, C = a.components, l = C.list();
      return { n: l.length, name: l[0] && l[0].name, doc: a.doc.name, asm: !!document.querySelector('#toolbar [data-panel="AssemblePanel"]'), saved: a.ui.files.index().some((x) => x.name === "Bracket"), owner: C.ownerOf(Object.keys(a.doc.bodies)[0]) };
    });
    t.check("Add To Assembly: a new design with the part as component Bracket, ASSEMBLE panel, part saved", a1.n === 1 && a1.name === "Bracket" && a1.doc === "Untitled" && a1.asm && a1.saved && a1.owner !== "root", JSON.stringify(a1));

    // ------------------------------------------------------------------ B
    t.step("B. Joint dialog: canvas snaps (top face of the bar onto the top face of the cube), Motion tab Revolute, OK");
    await t.app(() => window.app.newDocument("Assembly QA"));
    await t.app(helpers);
    const ids = await t.app(() => {
      const a = window.app, H = window.__asm, C = a.components;
      const b1 = H.box([0, 0]), b2 = H.box([40, 0], "20 mm");
      C.createFromBodies([b1, b2]);
      return { b1, b2, o1: C.ownerOf(b1), o2: C.ownerOf(b2) };
    });
    await t.setView("home");
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.frames(4);
    t.require("Joint dialog opens from ASSEMBLE", await openFromPanel("JointAssembleCmdNew"));
    const rows = await t.app((s) => [...document.querySelectorAll(`${s} .dlg-label`)].filter((e) => e.offsetParent).map((e) => e.textContent), dlgSel("JointAssembleCmdNew"));
    t.check("Position tab rows: Mode, Snap (x2), Angle, Offset X/Y/Z, Flip", JSON.stringify(rows) === JSON.stringify(["Mode", "Snap", "Mode", "Snap", "Angle", "Offset X", "Offset Y", "Offset Z", "Flip"]), JSON.stringify(rows));
    const top2 = await t.app((b) => window.__asm.face(b, [0, 0, 1]).p, ids.b2);
    const top1 = await t.app((b) => window.__asm.face(b, [0, 0, 1]).p, ids.b1);
    const near2 = [top2, [top2[0] + 1, top2[1] + 1, top2[2]]];
    const s1 = await t.aim(near2, `h && h.ref && h.ref.kind === 'face' && h.ref.body === '${ids.b2}'`);
    t.require("aim the top face of the bar", !!s1);
    await t.canvasClick(s1.x, s1.y);
    const hov = await t.app(() => window.app.ui.assembly.display.items().length);
    const s2 = await t.aim([top1, [top1[0] + 1, top1[1], top1[2]]], `h && h.ref && h.ref.kind === 'face' && h.ref.body === '${ids.b1}'`);
    t.require("aim the top face of the cube", !!s2);
    await t.canvasClick(s2.x, s2.y);
    await t.settle(300);
    const pv = await t.app(({ b2 }) => { const d = window.app.ui.dialog.current; return { n1: d.values.snap1.length, n2: d.values.snap2.length, ok: d.previewRes && d.previewRes.ok, bb: window.__asm.bb(b2) }; }, ids);
    t.check("both snaps picked; live preview puts the bar upside down on the cube (z 10..20)", pv.n1 === 1 && pv.n2 === 1 && pv.ok && near(pv.bb.min[2], 10, 1e-6) && near(pv.bb.max[2], 20, 1e-6) && near(pv.bb.min[0], -10, 1e-6), JSON.stringify(pv));
    await t.click(`${dlgSel("JointAssembleCmdNew")} .asm-tab[data-tab="motion"]`);
    const mrows = await t.app((s) => [...document.querySelectorAll(`${s} .dlg-label`)].filter((e) => e.offsetParent).map((e) => e.textContent), dlgSel("JointAssembleCmdNew"));
    t.check("Motion tab: Type", mrows.includes("Type") && !mrows.includes("Offset X"), JSON.stringify(mrows));
    await t.app(() => window.app.ui.dialog.current.set("jointType", "revolute", { user: true }));
    await t.settle(200);
    const mrows2 = await t.app((s) => [...document.querySelectorAll(`${s} .dlg-label`)].filter((e) => e.offsetParent).map((e) => e.textContent), dlgSel("JointAssembleCmdNew"));
    t.check("Revolute shows Rotate", mrows2.includes("Rotate"), JSON.stringify(mrows2));
    await t.click(`${dlgSel("JointAssembleCmdNew")} [data-action="ok"]`);
    await t.settle(200);
    const b1 = await t.app(({ b2 }) => {
      const a = window.app, f = window.__asm.last();
      return { type: f.type, name: f.name, jt: f.jointType, ok: window.__asm.res(f.id).ok, bb: window.__asm.bb(b2), dlg: !!a.activeCommand, glyphs: a.ui.assembly.display.items().length, tl: !!document.querySelector(`.tl-item[data-feature="${f.id}"]`), id: f.id };
    }, ids);
    t.check("joint feature Revolute1 in the timeline, bar on the cube, a joint glyph", b1.type === "joint" && b1.name === "Revolute1" && b1.jt === "revolute" && b1.ok && near(b1.bb.max[2], 20, 1e-6) && b1.glyphs === 1 && b1.tl && !b1.dlg && hov >= 0, JSON.stringify(b1));
    const J = b1.id;
    await t.shot("joint-glyph");
    await t.app(() => window.app.ui.browser.expand("doc:root", true));
    t.check("browser Joints folder lists Revolute1", await t.waitFor(() => /Revolute1/.test(document.querySelector('#browser-host [data-node="joints:root"]')?.parentElement?.textContent || ""), { timeout: 2000 }));
    const ur = await t.app(async ({ b2 }) => {
      const a = window.app, H = window.__asm;
      a.history.undo(); await new Promise((r) => setTimeout(r, 50));
      const u = H.bb(b2);
      a.history.redo(); await new Promise((r) => setTimeout(r, 50));
      return { u, r: H.bb(b2) };
    }, ids);
    t.check("undo puts the bar back (x 30..50), redo joins it again", near(ur.u.min[0], 30, 1e-6) && near(ur.u.min[2], 0, 1e-6) && near(ur.r.max[2], 20, 1e-6), JSON.stringify(ur));

    // ------------------------------------------------------------------ C
    t.step("C. Drive Joints 90 deg, Edit Joint Limits (max 45), Animate Joint, Edit Joint offset, Suppress");
    await t.app((id) => window.app.selection.set([{ kind: "feature", id }]), J);
    t.require("Drive Joints dialog", await openFromPanel("FusionMoveJointsCommand"));
    await t.fill(`${dlgSel("FusionMoveJointsCommand")} [data-input="rot"]`, "90");
    await t.settle(150);
    const live = await t.app((o2) => !!window.app.components.displayTransform(o2), ids.o2);
    await t.click(`${dlgSel("FusionMoveJointsCommand")} [data-action="ok"]`);
    await t.settle(200);
    const c1 = await t.app(({ b2, J }) => ({ d: window.app.feature(J).drive, bb: window.__asm.bb(b2) }), { ...ids, J });
    t.check("drive 90 deg stored, live display preview, the bar turned (x -5..5, y -10..10)", live && near(c1.d.rot, 90, 1e-6) && near(c1.bb.min[0], -5, 1e-6) && near(c1.bb.min[1], -10, 1e-6), JSON.stringify(c1));
    const lim = await t.app((J) => ({ node: !!document.querySelector(`#browser-host [data-node="feature:${J}"] .br-label`) }), J);
    t.check("joint node in the browser", lim.node, JSON.stringify(lim));
    await t.app(() => window.app.ui.browser.expand("joints:root", true));
    await t.frames(2);
    await t.click(`#browser-host [data-node="feature:${J}"] .br-label`, { button: "right" });
    t.require("joint menu: Edit Joint Limits", await t.click('.br-ctx [data-action="edit-limits"]', { timeout: 1500 }));
    t.require("Edit Joint Limits dialog", await t.waitFor((s) => !!document.querySelector(s), { timeout: 2000, arg: dlgSel("EditJointLimits") }));
    await t.click(`${dlgSel("EditJointLimits")} [data-input="maxOn_rot"]`);
    await t.fill(`${dlgSel("EditJointLimits")} [data-input="max_rot"]`, "45");
    await t.click(`${dlgSel("EditJointLimits")} [data-action="ok"]`);
    await t.settle(200);
    const c2 = await t.app(({ J, b2 }) => { const f = window.app.feature(J); const r = window.app.result.state.joints.get(J); return { lim: f.limits, bb: window.__asm.bb(b2) }; }, { ...ids, J });
    t.check("limit max 45 stored; the 90 deg drive is clamped to 45", c2.lim && c2.lim.rot && c2.lim.rot.maxOn && near(c2.lim.rot.max, 45, 1e-6) && near(c2.bb.max[0], 7.5 * Math.SQRT2 + 0 * 1, 0.01), JSON.stringify(c2));
    const an = await t.app(({ J, o2 }) => new Promise((res) => {
      const A = window.app.ui.assembly;
      let seen = false;
      const iv = setInterval(() => { if (window.app.components.displayTransform(o2)) seen = true; }, 30);
      A.animateJoint(J, { ms: 300, done: (ok) => { clearInterval(iv); setTimeout(() => res({ ok, seen, cleared: !window.app.components.displayTransform(o2) }), 30); } });
    }), { ...ids, J });
    t.check("Animate Joint moves the bar display-only and clears at the end", an.ok && an.seen && an.cleared, JSON.stringify(an));
    await t.app((id) => window.app.editFeature(id), J);
    t.require("Edit Joint opens the Joint dialog", await t.waitFor(() => !!document.querySelector('.dlg[data-dialog="JointAssembleCmdNew"][data-edit]'), { timeout: 2000 }));
    await t.fill(`${dlgSel("JointAssembleCmdNew")} [data-input="offZ"]`, "5");
    await t.settle(200);
    await t.click(`${dlgSel("JointAssembleCmdNew")} [data-action="ok"]`);
    await t.settle(200);
    const c3 = await t.app(({ J, b2 }) => ({ f: window.app.feature(J), bb: window.__asm.bb(b2) }), { ...ids, J });
    t.check("Edit Joint: Offset Z 5 mm lifts the bar (z 15..25), drive and limits kept", near(c3.bb.min[2], 15, 1e-6) && c3.f.limits && near(c3.f.drive.rot, 90, 1e-6) && c3.f.name === "Revolute1", JSON.stringify({ bb: c3.bb, d: c3.f.drive }));
    const sup = await t.app(async ({ J, b2 }) => {
      const a = window.app; a.mutate("Suppress", (d) => { d.features.find((f) => f.id === J).suppressed = true; });
      const s = window.__asm.bb(b2);
      a.history.undo();
      return { s, u: window.__asm.bb(b2) };
    }, { ...ids, J });
    t.check("suppressing the joint frees the bar, undo joins it again", near(sup.s.min[0], 30, 1e-6) && near(sup.u.min[2], 15, 1e-6), JSON.stringify(sup));

    // ------------------------------------------------------------------ D
    t.step("D. Slider joint + Motion Link, Rigid Group, pinned member, As-built Joint, Joint Origin");
    const d0 = await t.app(() => {
      const a = window.app, H = window.__asm, C = a.components;
      const b3 = H.box([0, 60]), b4 = H.box([30, 60]), b5 = H.box([0, -60]);
      C.createFromBodies([b3, b4, b5]);
      return { b3, b4, b5, o3: C.ownerOf(b3), o4: C.ownerOf(b4), o5: C.ownerOf(b5) };
    });
    // slider: o3 along the root X axis (as-built at its place), linked to the revolute (10 deg -> 1 mm)
    const d1 = await t.app(({ o3, J }) => {
      const a = window.app;
      a.commands.run("JointAsBuiltCmd");
      const d = a.ui.dialog.current;
      d.setSelection("comps", [{ kind: "occurrence", occ: o3 }, { kind: "occurrence", occ: "root" }]);
      d.set("jointType", "slider");
      d.set("slideAxis", "x");
      const st = a.result.state;
      d.setSelection("position", [{ kind: "vertex", body: a.components.bodiesOf(o3)[0], p: [-5, 55, 0] }]);
      d.previewNow();
      const pr = d.previewRes;
      d.ok();
      const f = window.__asm.last();
      return { pr: pr && pr.ok, type: f.type, asBuilt: f.asBuilt, jt: f.jointType, id: f.id, name: f.name };
    }, { ...d0, J });
    t.check("As-built Joint (slider) keeps o3 in place", d1.pr && d1.type === "joint" && d1.asBuilt && d1.jt === "slider" && d1.name === "Slider1", JSON.stringify(d1));
    const d2 = await t.app(({ J, sj, b3 }) => {
      const a = window.app;
      a.commands.run("FusionMotionRelationshipCommand");
      const d = a.ui.dialog.current;
      d.setSelection("joints", [{ kind: "feature", id: J }, { kind: "feature", id: sj }]);
      d.set("amount1", "10 deg"); d.set("amount2", "1 mm");
      d.previewNow();
      d.ok();
      const f = window.__asm.last();
      return { type: f.type, a1: f.amount1, a2: f.amount2, dof2: f.dof2, bb: window.__asm.bb(b3), ok: window.__asm.res(f.id).ok };
    }, { J, sj: d1.id, b3: d0.b3 });
    t.check("Motion Link: the revolute (90 deg clamped to its 45 deg limit) drives the slider 4.5 mm (o3 x -0.5..9.5)", d2.type === "motionlink" && d2.ok && near(d2.bb.min[0], -0.5, 1e-4), JSON.stringify(d2));
    const d3 = await t.app(({ o3, o4, b3, b4 }) => {
      const a = window.app;
      a.commands.run("RigidGroupCmd");
      const d = a.ui.dialog.current;
      d.setSelection("comps", [{ kind: "occurrence", occ: o4 }, { kind: "occurrence", occ: o3 }]);
      d.previewNow(); d.ok();
      const f = window.__asm.last();
      return { type: f.type, occs: f.occs, name: f.name, bb4: window.__asm.bb(b4) };
    }, d0);
    t.check("Rigid Group feature with both components", d3.type === "rigidgroup" && d3.occs.length === 2 && d3.name === "Rigid Group1", JSON.stringify(d3));
    const d4 = await t.app(({ J, b3, b4 }) => {
      const a = window.app;
      a.ui.assembly.commitDrives({ [J]: { rot: 30 } }, "Drive Joints");
      return { b3: window.__asm.bb(b3), b4: window.__asm.bb(b4) };
    }, { ...d0, J });
    t.check("driving the revolute (30 -> slider 3 mm) carries the rigid group partner along (o4 x 23.5..33.5)", near(d4.b3.min[0], -2, 1e-4) && near(d4.b4.min[0], 23.5, 1e-4), JSON.stringify(d4));
    const d5 = await t.app(({ o5, b5 }) => {
      const a = window.app, C = a.components;
      // free component: Move moves it; a pinned one refuses
      C.setGrounded([o5], true);
      const r1 = C.setTransform(o5, [1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 0]);
      C.setGrounded([o5], false);
      return { r1, bb: window.__asm.bb(b5) };
    }, d0);
    t.check("a pinned component refuses a move", d5.r1 === false && near(d5.bb.min[0], -5, 1e-6), JSON.stringify(d5));
    const d6 = await t.app(({ o5, b5 }) => {
      const a = window.app;
      a.commands.run("JointOrigin");
      const d = a.ui.dialog.current;
      d.pickRef("snap", window.__asm.face(b5, [1, 0, 0]));
      d.set("offZ", "2 mm");
      d.previewNow(); d.ok();
      const f = window.__asm.last();
      const jo = a.result.state.jorigins.get(f.id);
      return { type: f.type, occ: f.occ1, o: jo && [jo.F[3], jo.F[7], jo.F[11]].map((v) => Math.round(v * 1000) / 1000), id: f.id, glyphs: a.ui.assembly.display.items().filter((i) => i.kind === "origin").length };
    }, d0);
    t.check("Joint Origin on the +X face of o5, offset 2 mm along the normal (7, -60, 5), glyph", d6.type === "jointorigin" && d6.occ === d0.o5 && JSON.stringify(d6.o) === JSON.stringify([7, -60, 5]) && d6.glyphs === 1, JSON.stringify(d6));

    // ------------------------------------------------------------------ E
    t.step("E. Component Drag: a free component follows the cursor (uncaptured position); contact stops a drag");
    const e0 = await t.app(() => {
      const a = window.app, H = window.__asm, C = a.components;
      const b6 = H.box([100, 0]), b7 = H.box([130, 0]);
      C.createFromBodies([b6, b7]);
      return { b6, b7, o6: C.ownerOf(b6), o7: C.ownerOf(b7) };
    });
    await t.app(() => window.app.viewport.fit({ animate: false }));
    await t.setView("top");
    await t.frames(4);
    const p6 = await t.canvasXY([100, 0, 10]), p6b = await t.canvasXY([115, 0, 10]);
    const dragRes = await t.app(async ({ x0, y0, x1, y1 }) => {
      const vp = window.app.viewport, cv = vp.canvas, r = cv.getBoundingClientRect();
      const ev = (type, x, y, b) => cv.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: b, bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      ev("pointerdown", x0, y0, 1);
      for (let i = 1; i <= 8; i++) { ev("pointermove", x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8, 1); await new Promise((q) => requestAnimationFrame(q)); }
      ev("pointerup", x1, y1, 0);
      await new Promise((q) => setTimeout(q, 80));
      return !!r;
    }, { x0: p6.x, y0: p6.y, x1: p6b.x, y1: p6b.y });
    const e1 = await t.app(({ b6, o6 }) => ({ bb: window.__asm.bb(b6), pend: window.app.components.hasPending(), drag: window.app.ui.assembly.componentDrag }), e0);
    t.check("Component Drag: the free component moved about +15 mm in X (uncaptured position)", dragRes && e1.drag && e1.pend && near(e1.bb.min[0], 110, 1.5), JSON.stringify(e1));
    await t.app(() => { window.app.components.capture(); });
    // contact: All Contact, drag o6 toward o7 (at x 125..135): it stops at first interference (max x <= 125)
    await t.click('#toolbar [data-panel="AssemblePanel"]');
    await t.settle(200);
    t.check("ASSEMBLE menu: Enable All Contact", await t.click('#overlay [data-cmd="EnableAllContactCmd"]', { timeout: 2000 }));
    await t.settle(100);
    const ec = await t.app(() => window.app.ui.assembly.contactMode());
    const hk = await t.app(({ o6 }) => { const T = window.app.components.transform(o6).slice(); T[3] += 10; return window.app.ui.assembly.contactHits({ [o6]: T }); }, e0);
    t.check("contact check: o6 moved 10 mm into o7 interferes", hk === true, String(hk));
    const q0 = await t.canvasXY([115, 0, 10]), q1 = await t.canvasXY([140, 0, 10]);
    await t.app(async ({ x0, y0, x1, y1 }) => {
      const cv = window.app.viewport.canvas;
      const ev = (type, x, y, b) => cv.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: b, bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      ev("pointerdown", x0, y0, 1);
      for (let i = 1; i <= 10; i++) { ev("pointermove", x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10, 1); await new Promise((q) => requestAnimationFrame(q)); }
      ev("pointerup", x1, y1, 0);
      await new Promise((q) => setTimeout(q, 80));
    }, { x0: q0.x, y0: q0.y, x1: q1.x, y1: q1.y });
    const e2 = await t.app(({ b6 }) => ({ ...window.__asm.bb(b6), last: window.app.ui.assembly.lastDrag() }), e0);
    t.check("Enable All Contact; the drag stops at the other component (max x <= 125)", ec === "all" && e2.max[0] <= 125.01 && e2.max[0] > 116, JSON.stringify({ ec, e2 }));
    await t.app(() => { const a = window.app; if (a.components.hasPending()) a.components.capture(); a.commands.run("DisableAllContactCmd"); });

    // ------------------------------------------------------------------ F
    t.step("F. Constraints: Align (flush planes), Angle, Tangent (cylinder on a plane), Center, Joint Constraint");
    const f0 = await t.app(() => {
      const a = window.app, H = window.__asm, C = a.components;
      const p1 = H.box([0, 150], "40 mm", "40 mm", "4 mm"), q1 = H.box([60, 150], "10 mm", "10 mm", "10 mm");
      const cy = a.addFeature({ type: "cylinder", plane: { kind: "origin", name: "XZ" }, center: [60, 30], diameter: "10 mm", height: "20 mm", operation: "new" }).newBody;
      C.createFromBodies([p1, q1, cy]);
      return { p1, q1, cy, op: C.ownerOf(p1), oq: C.ownerOf(q1), oc: C.ownerOf(cy) };
    });
    const f1 = await t.app(({ p1, q1 }) => {
      const a = window.app;
      a.commands.run("AlignConstraintCmd");
      const d = a.ui.dialog.current;
      d.pickRef("sel1", window.__asm.face(q1, [0, 0, -1]));
      d.pickRef("sel2", window.__asm.face(p1, [0, 0, 1]));
      d.previewNow(); d.ok();
      const f = window.__asm.last();
      return { type: f.type, ct: f.ctype, jt: f.jointType, bb: window.__asm.bb(q1), ok: window.__asm.res(f.id).ok, id: f.id };
    }, f0);
    t.check("Align: the cube's bottom face lies flush on the plate's top (z 4..14), x/y kept", f1.type === "constraint" && f1.ct === "align" && f1.jt === "planar" && f1.ok && near(f1.bb.min[2], 4, 1e-4) && near(f1.bb.min[0], 55, 1e-3), JSON.stringify(f1));
    const f2 = await t.app(({ p1, q1 }) => {
      const a = window.app;
      a.commands.run("AngleConstraintCmd");
      const d = a.ui.dialog.current;
      d.pickRef("sel1", window.__asm.face(q1, [1, 0, 0]));
      d.pickRef("sel2", window.__asm.face(p1, [1, 0, 0]));
      d.set("angle", "30 deg");
      d.previewNow(); d.ok();
      const f = window.__asm.last(), st = a.result.state;
      const T = st.occ.get(f.occ1).T;
      return { jt: f.jointType, ok: window.__asm.res(f.id).ok, ang: Math.acos(Math.max(-1, Math.min(1, T[0]))) * 180 / Math.PI, z: window.__asm.bb(q1).min[2] };
    }, f0);
    t.check("Angle 30 deg: the cube turns 30 deg about Z and stays flush", f2.jt === "angle" && f2.ok && near(f2.ang, 30, 0.05) && near(f2.z, 4, 1e-3), JSON.stringify(f2));
    const f3 = await t.app(({ p1, cy }) => {
      const a = window.app;
      a.commands.run("TangentConstraintCmd");
      const d = a.ui.dialog.current;
      d.pickRef("sel1", window.__asm.cyl(cy));
      d.pickRef("sel2", window.__asm.face(p1, [0, 0, 1]));
      d.previewNow(); d.ok();
      const f = window.__asm.last();
      return { jt: f.jointType, r: f.radius, ok: window.__asm.res(f.id).ok, bb: window.__asm.bb(cy) };
    }, f0);
    t.check("Tangent: the cylinder (r 5) rests on the plate (z 4..14)", f3.jt === "tangent" && f3.ok && near(f3.r, 5, 1e-6) && near(f3.bb.min[2], 4, 0.01), JSON.stringify(f3));
    const f4 = await t.app(() => {
      const a = window.app, H = window.__asm, C = a.components;
      const fork = H.box([0, 250], "30 mm", "10 mm", "10 mm"), slot = H.box([60, 250], "6 mm", "6 mm", "6 mm");
      C.createFromBodies([fork, slot]);
      a.commands.run("MidplaneConstraintCmd");
      const d = a.ui.dialog.current;
      d.pickRef("csel1", H.face(slot, [1, 0, 0])); d.pickRef("csel1", H.face(slot, [-1, 0, 0]));
      d.pickRef("csel2", H.face(fork, [1, 0, 0])); d.pickRef("csel2", H.face(fork, [-1, 0, 0]));
      d.previewNow(); d.ok();
      const f = H.last();
      const bb = H.bb(slot);
      return { jt: f.jointType, ok: H.res(f.id).ok, cx: (bb.min[0] + bb.max[0]) / 2 };
    });
    t.check("Center: the small block is centred between the faces of the long one (x centre 0)", f4.jt === "center" && f4.ok && near(f4.cx, 0, 0.01), JSON.stringify(f4));
    const f5 = await t.app(({ o5, b5, d6 }) => {
      const a = window.app, H = window.__asm, C = a.components;
      const pin = H.box([0, -120]);
      C.createFromBodies([pin]);
      a.commands.run("JointConstraintCmd");
      const d = a.ui.dialog.current;
      d.pickRef("snap1", H.face(pin, [-1, 0, 0]));
      d.pickRef("snap2", { kind: "feature", id: d6 });
      d.previewNow(); d.ok();
      const f = H.last();
      return { type: f.type, ct: f.ctype, ok: H.res(f.id).ok, bb: H.bb(pin), pin };
    }, { ...d0, d6: d6.id });
    t.check("Joint Constraint onto the joint origin: the -X face of the new block meets the origin (x 7..17, y -65..-55)", f5.type === "constraint" && f5.ct === "joint" && f5.ok && near(f5.bb.min[0], 7, 1e-4) && near(f5.bb.min[1], -65, 1e-4), JSON.stringify(f5));

    // ------------------------------------------------------------------ G
    t.step("G. DOF Analysis, Assembly Statistics, Component Connection Analysis, Duplicate With Joints, Motion Study");
    await t.app(() => window.app.commands.run("FusionDOFAnalysisCommand"));
    await t.frames(3);
    const g1 = await t.app(({ o2 }) => {
      const rows = window.app.ui.assembly.dofTable();
      const r = rows.find((x) => x.occ === o2);
      return { r: r && { dof: r.dof, text: r.text }, labels: document.querySelectorAll(".asm-dof-label").length, n: rows.length };
    }, ids);
    t.check("DOF Analysis: the jointed bar has 1 DOF (Rotation Z), labels on the canvas", g1.r && g1.r.dof === 1 && /Rotation/.test(g1.r.text) && g1.labels === g1.n, JSON.stringify(g1));
    await t.app(() => window.app.commands.run("FusionDOFAnalysisCommand"));
    t.require("Assembly Statistics dialog", await (async () => { await t.app(() => window.app.commands.run("FusionAssemblyStatisticsCommand")); return t.waitFor((s) => !!document.querySelector(s), { timeout: 2000, arg: dlgSel("FusionAssemblyStatisticsCommand") }); })());
    const g2 = await t.app(() => { const s = window.app.ui.assembly.statistics(); const txt = document.querySelector('.dlg[data-dialog="FusionAssemblyStatisticsCommand"] [data-stat="Joints"]')?.textContent; return { s, txt }; });
    t.check("statistics: joints, as-built joints, constraints, rigid groups, motion links", g2.s.joints === 1 && g2.s.asBuilt === 1 && g2.s.constraints === 5 && g2.s.rigidGroups === 1 && g2.s.motionLinks === 1 && g2.txt === "1", JSON.stringify(g2));
    await t.click(`${dlgSel("FusionAssemblyStatisticsCommand")} [data-action="ok"]`);
    await t.app(() => window.app.commands.run("FusionComponentConnectionAnalysisCommand"));
    t.require("Component Connection Analysis dialog", await t.waitFor((s) => !!document.querySelector(s), { timeout: 2000, arg: dlgSel("FusionComponentConnectionAnalysisCommand") }));
    const g3 = await t.app(() => document.querySelector('.dlg[data-dialog="FusionComponentConnectionAnalysisCommand"] [data-input="report"]')?.textContent || "");
    t.check("connection report names Revolute1 and a not connected component", /Revolute1/.test(g3) && /Not connected/.test(g3), g3.slice(0, 200));
    await t.click(`${dlgSel("FusionComponentConnectionAnalysisCommand")} [data-action="ok"]`);
    const g4 = await t.app(() => { window.app.commands.run("FusionEditComponentConnectionAnalysisCommand"); const ok = !!document.querySelector('.dlg[data-dialog="FusionEditComponentConnectionAnalysisCommand"]'); window.app.ui.dialog.cancel(); return { ok, saved: !!window.app.doc.connectionAnalysis }; });
    t.check("Edit Component Connection Analysis reopens the stored analysis", g4.ok && g4.saved, JSON.stringify(g4));
    const g5 = await t.app(({ o2 }) => {
      const a = window.app, n0 = a.doc.features.filter((f) => f.type === "joint").length, c0 = a.components.list().length;
      a.selection.set([{ kind: "occurrence", occ: o2 }]);
      a.commands.run("FusionDuplicateWithJointsCommand");
      const n1 = a.doc.features.filter((f) => f.type === "joint").length;
      const dup = a.doc.features.filter((f) => f.type === "joint").slice(-1)[0];
      return { n0, n1, c0, c1: a.components.list().length, ok: window.__asm.res(dup.id).ok, name: dup.name };
    }, ids);
    t.check("Duplicate With Joints: one more occurrence and one more joint (Revolute2)", g5.n1 === g5.n0 + 1 && g5.c1 === g5.c0 + 1 && g5.ok && g5.name === "Revolute2", JSON.stringify(g5));
    await t.app(() => window.app.history.undo());
    const g6 = await t.app(async ({ J, b2 }) => {
      const a = window.app;
      a.commands.run("FusionMotionStudyCommand");
      const d = a.ui.dialog.current;
      d.setSelection("joints", [{ kind: "feature", id: J }]);
      d.refresh();
      const el = document.querySelector('.dlg[data-dialog="FusionMotionStudyCommand"]');
      const step = el.querySelector('[data-input="step"]');
      step.value = "50"; step.dispatchEvent(new Event("input", { bubbles: true }));
      el.querySelector('[data-input="keyValue"]').value = "-30";
      el.querySelector('[data-input="addKey"]').click();
      const keys = el.querySelectorAll("tr[data-key]").length;
      d.ok();
      const s = (a.doc.motionStudies || [])[0];
      const played = await new Promise((res) => { a.ui.assembly.playStudy(s.id, { once: true, done: (ok) => res(ok) }); setTimeout(() => res("timeout"), 8000); });
      return { keys, s: s && { name: s.name, k: s.keys }, played, browser: !!document.querySelector(`#browser-host [data-node="motionstudy:${s.id}"]`) || !!document.querySelector('#browser-host [data-node="motionstudies:root"]') };
    }, { ...ids, J });
    t.check("Motion Study: keyframe at step 50 (-30 deg) stored, plays, listed in the browser", g6.keys === 1 && g6.s && g6.s.name === "Motion Study1" && g6.s.k.length === 1 && g6.s.k[0].step === 50 && g6.played === true && g6.browser, JSON.stringify(g6));

    // ------------------------------------------------------------------ H
    t.step("H. save / open keeps joints, constraints, rigid groups, links, contact sets and studies");
    const h1 = await t.app(async () => {
      const a = window.app, F = a.ui.files;
      const sig = () => JSON.stringify([...a.result.state.occ.values()].map((o) => o.T.map((v) => Math.round(v * 1000) / 1000)));
      const s0 = sig(), types = a.doc.features.map((f) => f.type).join(",");
      F.saveAs("QA Assembly");
      const id = a.doc.fileId;
      a.newDocument();
      await F.openById(id);
      return { same: s0 === sig(), types: types === a.doc.features.map((f) => f.type).join(","), errs: a.doc.features.filter((f) => (a.featureResult(f.id) || {}).ok === false).map((f) => f.name), studies: (a.doc.motionStudies || []).length };
    });
    t.check("save / open round trip: same positions, no failed features", h1.same && h1.types && !h1.errs.length && h1.studies === 1, JSON.stringify(h1));
  },
});

export default scenario;
await mainIfDirect(import.meta.url, scenario);
