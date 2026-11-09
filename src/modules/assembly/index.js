// assembly module: Joints, as-built joints, joint origins, rigid groups, drive joints, motion links and studies, contact
// sets, component constraints, assembly analyses, Component Drag, Add To Assembly. See README.md.
import "./style.css";
import { registerFeatureIcons, icon } from "../icons/icons.js";
import { beginModelCommand } from "../dialogs/common.js";
import { setSuppressed } from "../timeline/actions.js";
import * as S from "./solver.js";
import { esc } from "../browser/ui.js";
import * as F from "./features.js";
import * as MO from "./motion.js";
import * as D from "./dialogs.js";
import * as A from "./analysis.js";
import { installDisplay } from "./display.js";
import { contactMode, contactSetup } from "./contact.js";
import { openMotionStudy, playStudy } from "./study.js";

const DRAG_KEY = "fr.assembly.componentDrag";
const readPref = () => { try { const v = localStorage.getItem(DRAG_KEY); return v === null ? true : v === "1"; } catch { return true; } };
const writePref = (on) => { try { localStorage.setItem(DRAG_KEY, on ? "1" : "0"); } catch { /* sandboxed */ } };

function editorOf(app, f) {
  if (!f) return null;
  if (f.type === "joint") return f.asBuilt ? () => D.openAsBuilt(app, { editId: f.id }) : () => D.openJoint(app, { editId: f.id });
  if (f.type === "constraint") {
    if (f.ctype === "joint") return () => D.openJoint(app, { editId: f.id });
    if (f.ctype === "asbuilt") return () => D.openAsBuilt(app, { editId: f.id });
    return () => D.openConstraint(app, { editId: f.id });
  }
  if (f.type === "jointorigin") return () => D.openJointOrigin(app, { editId: f.id });
  if (f.type === "rigidgroup") return () => D.openRigidGroup(app, { editId: f.id });
  if (f.type === "motionlink") return () => D.openMotionLink(app, { editId: f.id });
  return null;
}

export function init(app) {
  let dragOn = readPref(), dofOn = false, display = null;
  const api = {
    get display() { return display; },
    glyphsVisible: () => true,
    dofOn: () => dofOn,
    dofRows: () => { try { return A.dofTable(app); } catch (e) { console.warn("[assembly] dof", e); return []; } },
    solve: () => S.solve(F.liveModel(app)),
    model: () => F.liveModel(app),
    dofTable: () => A.dofTable(app),
    statistics: () => A.statistics(app),
    connections: (occs) => A.connections(app, occs),
    animateJoint: (id, opts) => MO.animateLive(app, id, opts),
    stopAnimation: () => MO.stopAnim(),
    animating: () => MO.animating(),
    commitDrives: (map, label) => MO.commitDrives(app, map instanceof Map ? map : new Map(Object.entries(map || {})), label),
    contactMode: () => contactMode(app.doc),
    /** Would the poses {oid: 3x4} make bodies interfere (contact on)? null when contact is off. */
    contactHits: (poses) => { const model = F.liveModel(app), c = contactSetup(app, model); if (!c) return null; const T = new Map(model.T); for (const [o, m] of Object.entries(poses || {})) T.set(o, m); return c.hits(T); },
    get componentDrag() { return dragOn; },
    playStudy: (id, opts) => { const s = (app.doc.motionStudies || []).find((x) => x.id === id); if (s) playStudy(app, s, opts || {}); return !!s; },
    duplicateWithJoints: (ctx) => A.duplicateWithJoints(app, ctx),
    addToAssembly: () => A.addToAssembly(app),
  };
  app.ui.assembly = api;

  // ---- feature types (+ Edit Feature, browser folders, timeline icons)
  const edit = (a, id) => { const fn = editorOf(a, a.feature(id)); if (fn) fn(); };
  const animate = (f) => { if (!MO.animateLive(app, f.id)) app.toast("This joint has no motion to animate.", "info"); };
  const sup = (f) => ({ label: f.suppressed ? "Unsuppress" : "Suppress", act: f.suppressed ? "unsuppress" : "suppress", action: () => setSuppressed(app, [f.id], !f.suppressed) });
  const jointMenu = (f) => {
    const moving = (S.DOFS[f.jointType] || []).length > 0;
    if (F.REL_TYPES.includes(f.jointType)) return [{ label: "Edit Constraint", act: "edit-joint", action: () => edit(app, f.id) }, sup(f)];
    return [
      { label: f.type === "constraint" ? "Edit Constraint" : "Edit Joint", act: "edit-joint", action: () => edit(app, f.id) },
      { label: "Edit Joint Limits", act: "edit-limits", disabled: !moving, action: () => D.openJointLimits(app, f.id) },
      { label: "Drive Joint", act: "drive-joint", disabled: !moving, action: () => D.openDriveJoints(app, { preselect: [{ kind: "feature", id: f.id }] }) },
      { label: "Animate Joint", act: "animate-joint", disabled: !moving, action: () => animate(f) },
      sup(f),
    ];
  };
  const extra = {
    joint: { editor: edit, icon: "JointAssembleCmdNew", browser: { folder: "joints", node: (a, f) => ({ menuFirst: () => jointMenu(f), tip: `<b>${esc(f.name)}</b><div>${f.asBuilt ? "As-built " : ""}${S.TYPE_LABEL[f.jointType] || ""} joint: ${esc(D.labelOf(a, f.occ1))} to ${esc(D.labelOf(a, f.occ2))}</div>` }) } },
    constraint: { editor: edit, icon: "AssemblyMateCommand", browser: { folder: "joints", node: (a, f) => ({ menuFirst: () => jointMenu(f) }) } },
    jointorigin: { editor: edit, icon: "JointOrigin", browser: { folder: "jointorigins" } },
    rigidgroup: { editor: edit, icon: "RigidGroupCmd", browser: { folder: "joints", node: (a, f) => ({ menuFirst: () => [{ label: "Edit Rigid Group", act: "edit-rigid", action: () => edit(app, f.id) }, sup(f)] }) } },
    motionlink: { editor: edit, icon: "FusionMotionRelationshipCommand", browser: { folder: "joints", node: (a, f) => ({ menuFirst: () => [{ label: "Edit Motion Link", act: "edit-link", action: () => edit(app, f.id) }, { label: "Animate", act: "animate-link", action: () => animate({ id: f.joint1 }) }, sup(f)] }) } },
  };
  try { F.registerFeatures(extra); } catch (e) { console.warn("[assembly] feature types", e); }
  try { registerFeatureIcons({ joint: "JointAssembleCmdNew", constraint: "AssemblyMateCommand", jointorigin: "JointOrigin", rigidgroup: "RigidGroupCmd", motionlink: "FusionMotionRelationshipCommand" }); } catch (e) { console.warn("[assembly] icons", e); }

  // ---- commands
  const open = (fn, more = {}) => (a, ctx = {}) => { const pre = beginModelCommand(a); return fn(a, { preselect: ctx.preselect || pre, ...more }); };
  const setContact = (mode, label) => {
    app.mutate(label, (doc) => { if (mode === "off") delete doc.contact; else doc.contact = { mode }; }, { recompute: false });
    app.toast(mode === "off" ? "Contact analysis is off." : mode === "all" ? "Contact analysis is on for all components." : "Contact analysis is on for the contact sets.", "info");
  };
  const CMDS = [
    { id: "NewAssemblyFromPartCommand", label: "Add To Assembly", tooltip: "Inserts the active design into an assembly design as an external component.", run: (a) => A.addToAssembly(a) },
    { id: "JointAssembleCmdNew", label: "Joint", tooltip: "Connects two components and defines how they move relative to each other.", shortcut: "J", run: open(D.openJoint) },
    { id: "JointAsBuiltCmd", label: "As-built Joint", tooltip: "Creates a Joint relationship between two components in their current position and defines their relative motion.", shortcut: "Shift+J", run: open(D.openAsBuilt) },
    { id: "JointOrigin", label: "Joint Origin", tooltip: "Places a reusable joint origin on a component.", run: open(D.openJointOrigin) },
    { id: "RigidGroupCmd", label: "Rigid Group", tooltip: "Locks the relative position of the selected components. The components are treated as a single object when moved or when joints are applied.", run: open(D.openRigidGroup) },
    { id: "FusionMoveJointsCommand", label: "Drive Joints", tooltip: "Sets a joint to a chosen angle or distance.", run: open(D.openDriveJoints) },
    { id: "FusionMotionRelationshipCommand", label: "Motion Link", tooltip: "Links the motion of two joints together.", run: open(D.openMotionLink) },
    { id: "FusionMotionStudyCommand", label: "Motion Study", tooltip: "Animates joints over time to study a mechanism.", run: open(openMotionStudy) },
    { id: "ContactSetCmd", label: "New Contact Set", tooltip: "Groups components that should collide with each other.", run: open(D.openContactSet) },
    { id: "EnableContactSetsCmd", label: "Enable Contact Sets", tooltip: "Turns contact analysis on for the components in contact sets.", kind: "tool", checked: (a) => contactMode(a.doc) === "sets", run: () => setContact("sets", "Enable Contact Sets") },
    { id: "EnableAllContactCmd", label: "Enable All Contact", tooltip: "Activates contact analysis for all components.", kind: "tool", checked: (a) => contactMode(a.doc) === "all", run: () => setContact("all", "Enable All Contact") },
    { id: "DisableAllContactCmd", label: "Disable Contact", tooltip: "Turns contact analysis off for every component.", kind: "tool", checked: (a) => contactMode(a.doc) === "off", run: () => setContact("off", "Disable Contact") },
    { id: "AssemblyMateCommand", label: "Constrain Components", tooltip: "Constrain geometry to position two or more components relative to each other, reduce degrees of freedom in the assembly, and create a Constraint Relationship between the components.", run: open(D.openConstraint, { cmd: "AssemblyMateCommand" }) },
    { id: "AlignConstraintCmd", label: "Align Constraint", tooltip: "Aligns selected geometry so they are flush, coincident, or concentric to create an Align Constraint relationship between two components.", run: open(D.openConstraint, { cmd: "AlignConstraintCmd", ctype: "align" }) },
    { id: "AngleConstraintCmd", label: "Angle Constraint", tooltip: "Positions selected geometry with a relative angle them to create an Angle Constraint relationship between two components.", run: open(D.openConstraint, { cmd: "AngleConstraintCmd", ctype: "angle" }) },
    { id: "MidplaneConstraintCmd", label: "Center Constraint", tooltip: "Positions one component between two faces of another component to create a Center Constraint between them.", run: open(D.openConstraint, { cmd: "MidplaneConstraintCmd", ctype: "center" }) },
    { id: "TangentConstraintCmd", label: "Tangent Constraint", tooltip: "Constrains two components so one selection from the first component maintains tangency with geometry on a second component to create a Tangent Constraint.", run: open(D.openConstraint, { cmd: "TangentConstraintCmd", ctype: "tangent" }) },
    { id: "JointConstraintCmd", label: "Joint Constraint", tooltip: "Connects snap points on two components to position them in the assembly, define their relative motion, and create a Joint Constraint between them.", run: open(D.openJoint, { kind: "constraint" }) },
    { id: "AsBuiltConstraintCmd", label: "As-Built Constraint", tooltip: "Creates a As-Built Constraint relationship between two components in their current position and defines their relative motion.", run: open(D.openAsBuilt, { kind: "constraint" }) },
    { id: "FusionComponentConnectionAnalysisCommand", label: "Component Connection Analysis", tooltip: "Shows how components are connected to each other.", run: open(A.openConnectionAnalysis) },
    { id: "FusionEditComponentConnectionAnalysisCommand", label: "Edit Component Connection Analysis", tooltip: "Edits an existing component connection analysis.", run: open(A.openConnectionAnalysis, { edit: true }) },
    { id: "FusionAssemblyStatisticsCommand", label: "Assembly Statistics", tooltip: "Lists counts of components, bodies and joints.", run: (a) => { beginModelCommand(a); return A.openStatistics(a); } },
    { id: "FusionDuplicateWithJointsCommand", label: "Duplicate With Joints", tooltip: "Copies components together with the joints attached to them.", run: (a, ctx = {}) => { const pre = beginModelCommand(a); return A.duplicateWithJoints(a, { preselect: ctx.preselect || pre }); } },
    { id: "FusionDOFAnalysisCommand", label: "DOF Analysis", tooltip: "Shows the remaining degrees of freedom of each component.", kind: "view", checked: () => dofOn,
      run: () => { dofOn = !dofOn; try { display && display.renderLabels(); } catch (e) { console.warn("[assembly] dof", e); } app.emit("commands", { id: "FusionDOFAnalysisCommand" }); } },
    { id: "FusionDragCompControlsCmd", label: "Component Drag", tooltip: "Lets you drag components around the canvas.", kind: "ui", checked: () => dragOn,
      run: () => { dragOn = !dragOn; writePref(dragOn); app.emit("commands", { id: "FusionDragCompControlsCmd" }); } },
  ];
  for (const c of CMDS) {
    try { app.commands.register({ kind: "feature", ...c }); } catch (e) { console.warn(`[assembly] ${c.id}`, e); }
  }

  // ---- canvas: glyphs, joints and rigid groups take part in moves, Component Drag
  try { display = installDisplay(app, api); } catch (e) { console.warn("[assembly] display", e); }
  try { MO.installMoveWrapper(app); app.on("ready", () => { try { MO.installMoveWrapper(app); } catch { /* ignore */ } }); } catch (e) { console.warn("[assembly] move", e); }
  let dragH = null;
  try { dragH = MO.installDrag(app, () => dragOn); } catch (e) { console.warn("[assembly] drag", e); }
  api.lastDrag = () => (dragH && dragH.last) || null;
  app.on("model", (e) => { if ((!e || !e.preview) && dofOn && display) { try { display.renderLabels(); } catch { /* ignore */ } } });
  app.on("doc", (e) => { if (e && e.replaced) { MO.stopAnim(); } });

  // ---- browser: Contact Sets and Motion Studies folders
  // the browser API may only exist once every module started: hook now or on 'ready'
  const hookBrowser = () => {
  const br = app.ui.browser;
  if (hookBrowser.done || !br || typeof br.registerFolder !== "function") return;
  hookBrowser.done = true;
  {
    const ic = (id) => { try { return icon(id, { size: 16 }); } catch { return ""; } };
    try {
      br.registerFolder({
        key: "contactsets", label: "Contact Sets", after: "joints:root",
        build(a) {
          const sets = a.doc.contactSets || [];
          if (!sets.length) return null;
          return {
            noEye: true,
            menu: () => [
              { label: "Enable Contact Sets", act: "contact-sets", action: () => setContact("sets", "Enable Contact Sets") },
              { label: "Enable All Contact", act: "contact-all", action: () => setContact("all", "Enable All Contact") },
              { label: "Disable Contact", act: "contact-off", action: () => setContact("off", "Disable Contact") },
            ],
            children: sets.map((s) => ({
              key: `contactset:${s.id}`, label: s.name, icon: ic("ContactSetCmd"), tip: `<b>${esc(s.name)}</b><div>${(s.occs || []).map((o) => esc(D.labelOf(a, o))).join(", ")}</div>${s.suppressed ? "<div>Suppressed</div>" : ""}`,
              badge: s.suppressed ? "<span class=\"asm-dim\">(off)</span>" : "",
              menu: () => [
                { label: "Edit Contact Set", act: "edit-contact", action: () => D.openContactSet(a, { editSet: s.id }) },
                { label: s.suppressed ? "Enable Contact Set" : "Disable Contact Set", act: "toggle-contact", action: () => a.mutate("Contact Set", (doc) => { const x = (doc.contactSets || []).find((y) => y.id === s.id); if (x) x.suppressed = !x.suppressed; }, { recompute: false }) },
                { label: "Delete", act: "delete", action: () => a.mutate("Delete Contact Set", (doc) => { doc.contactSets = (doc.contactSets || []).filter((y) => y.id !== s.id); }, { recompute: false }) },
              ],
            })),
          };
        },
      });
      br.registerFolder({
        key: "motionstudies", label: "Motion Studies", after: "contactsets:root",
        build(a) {
          const list = a.doc.motionStudies || [];
          if (!list.length) return null;
          return {
            noEye: true,
            children: list.map((s) => ({
              key: `motionstudy:${s.id}`, label: s.name, icon: ic("FusionMotionStudyCommand"),
              onDbl: () => openMotionStudy(a, { editStudy: s.id }),
              menu: () => [
                { label: "Edit Motion Study", act: "edit-study", action: () => openMotionStudy(a, { editStudy: s.id }) },
                { label: "Play", act: "play-study", action: () => playStudy(a, s, { once: true }) },
                { label: "Delete", act: "delete", action: () => a.mutate("Delete Motion Study", (doc) => { doc.motionStudies = (doc.motionStudies || []).filter((y) => y.id !== s.id); }, { recompute: false }) },
              ],
            })),
          };
        },
      });
    } catch (e) { console.warn("[assembly] browser folders", e); }
  }
  };
  hookBrowser();
  app.on("ready", hookBrowser);
}
