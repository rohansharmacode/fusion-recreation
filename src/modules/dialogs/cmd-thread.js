// Thread (FusionThreadCommand): cosmetic (default) or modeled ISO metric threads on cylindrical faces.
import * as U from "./util.js";
import * as K from "../../kernel.js";
import { threadTypeOptions, sizeOptions, designationOptions, classOptions, defaultClass, threadData, sizeForDiameter } from "./threads.js";

const V = U.V;

/** Cylinder summary of a face ref on the pre-feature state (null when not cylindrical). */
function cylOf(state, ref) {
  const b = ref && state.bodies.get(ref.body);
  if (!b) return null;
  let idx = ref.index;
  if (!(idx >= 0)) { try { const f = K.findFace(b.shape, ref.p, ref.n); idx = f ? U.indexOfSame(b.shape.faces, f) : -1; } catch { idx = -1; } }
  if (!(idx >= 0)) return null;
  try { return K.cylinderFaceInfo(b.shape, idx); } catch { return null; }
}

export function openThread(app, opts = {}) {
  const editId = opts.editId || null;
  const f0 = editId ? app.feature(editId) : null;
  const setOptions = (dlg, id, options, keep) => {
    dlg.defs[id].options = options;
    const cur = dlg.values[id];
    if (!keep || !options.some((o) => o.value === cur)) dlg.values[id] = options[0] ? options[0].value : "";
    const re = dlg.rowEls && dlg.rowEls[id];
    if (re) re.update();
  };
  return app.ui.dialog.open({
    id: "FusionThreadCommand",
    title: "Thread",
    icon: "FusionThreadCommand",
    featureLabel: "Thread",
    editId,
    help: "Add internal or external threads to cylindrical geometry. Threads can be cosmetic or modeled on the geometry. Select a cylindrical face then set the thread specifications.",
    preselect: (opts.preselect || []).filter((r) => r.kind === "face" && r.planar === false),
    ctrlWidth: 130,
    rows: [
      { id: "faces", type: "selection", label: "Faces", kinds: ["face"], prompt: "Select faces to apply Thread", filter: (r, dlg) => !!cylOf(dlg.baseState, r) },
      { id: "modeled", type: "check", label: "Modeled", tooltip: "Creates a physical thread on the geometry. Unchecked, the thread is cosmetic." },
      { id: "fullLength", type: "check", label: "Full Length", default: true },
      { id: "offset", type: "value", label: "Offset", kind: "length", default: "0.00 mm", nonNegative: true, visible: (v) => !v.fullLength },
      { id: "length", type: "value", label: "Length", kind: "length", default: "10.00 mm", positive: true, visible: (v) => !v.fullLength },
      // ISO Metric profile plus the custom types of Manage Threads Library (threads-library.js)
      { id: "threadType", type: "dropdown", label: "Thread Type", options: threadTypeOptions(), default: "ISO Metric profile", sep: true },
      { id: "size", type: "dropdown", label: "Size", options: sizeOptions(), default: "10.0" },
      { id: "designation", type: "dropdown", label: "Designation", options: designationOptions("10.0"), default: "M10x1.5" },
      { id: "tclass", type: "dropdown", label: "Class", options: classOptions(false), default: "6g" },
      { id: "direction", type: "dropdown", label: "Direction", options: [{ value: "right", label: "Right hand", icon: "threadRH" }, { value: "left", label: "Left hand", icon: "threadLH" }], default: "right" },
    ],
    init(dlg) {
      if (!f0) return;
      const faces = (f0.faces || []).map((fr) => U.faceRef(dlg.baseState, fr.body, fr.p, fr.n));
      const internal = !!(cylOf(dlg.baseState, faces[0]) || {}).internal;
      const type = f0.threadType || "ISO Metric profile";
      // a custom type that is not in this browser's library: keep the stored values (shown as the only options)
      const known = dlg.defs.threadType.options.some((o) => o.value === type);
      if (!known) dlg.defs.threadType.options = [...dlg.defs.threadType.options, { value: type, label: type }];
      dlg.defs.size.options = known ? sizeOptions(type) : [{ value: f0.size, label: f0.size }];
      dlg.defs.designation.options = known ? designationOptions(f0.size || "10.0", type) : [{ value: f0.designation, label: f0.designation }];
      dlg.defs.tclass.options = known ? classOptions(internal, type, f0.size, f0.designation) : [{ value: f0.tclass, label: f0.tclass }];
      Object.assign(dlg.values, {
        faces, modeled: !!f0.modeled, fullLength: f0.fullLength !== false, threadType: type, size: f0.size || "10.0", designation: f0.designation || "M10x1.5",
        tclass: f0.tclass || defaultClass(internal, type), direction: f0.rightHanded === false ? "left" : "right",
      });
      for (const k of ["offset", "length"]) if (f0[k] !== undefined && f0[k] !== "") dlg.values[k] = String(f0[k]);
      for (const k of ["size", "designation", "tclass", "length"]) dlg.touched.add(k);
    },
    onOpen(dlg) { if ((dlg.values.faces || []).length && !f0) fromFace(dlg); },
    onChange(id, dlg, o) {
      const v = dlg.values;
      if (id === "faces" && !(o && o.preselect && f0)) fromFace(dlg);
      if (id === "threadType") {
        dlg.touched.delete("size");
        setOptions(dlg, "size", sizeOptions(v.threadType), false);
        if ((v.faces || []).length) fromFace(dlg);
        else { setOptions(dlg, "designation", designationOptions(v.size, v.threadType), false); classesFor(dlg); }
      }
      if (id === "size") { setOptions(dlg, "designation", designationOptions(v.size, v.threadType), false); classesFor(dlg); }
      if (id === "designation") classesFor(dlg);
    },
    validate(dlg) {
      const v = dlg.values;
      return (v.faces || []).length && !threadOf(v) ? "Can't apply thread. Please select a thread size or type that matches your geometry." : null;
    },
    prompt(dlg) { return (dlg.values.faces || []).length ? "" : "Select faces to apply Thread"; },
    status: (dlg) => { const n = (dlg.values.faces || []).length; return n ? (n === 1 ? "Face" : `${n} Faces`) : ""; },
    build(v) {
      const faces = (v.faces || []).map((r) => ({ body: r.body, p: r.p, n: r.n }));
      const td = threadOf(v);
      if (!faces.length || !td) return null;
      const f = {
        type: "thread", faces, threadType: v.threadType, size: v.size, designation: td.designation, tclass: v.tclass,
        pitch: td.pitch, major: td.major, minor: td.minor, modeled: !!v.modeled, fullLength: !!v.fullLength, rightHanded: v.direction !== "left",
      };
      if (!v.fullLength) { f.offset = v.offset; f.length = v.length; }
      return f;
    },
    manipulators(dlg) {
      if (dlg.values.fullLength) return [];
      const c = cylOf(dlg.baseState, (dlg.values.faces || [])[0]);
      if (!c) return [];
      const off = dlg.num("offset");
      if (!Number.isFinite(off)) return [];
      let x = V.cross(c.a, [0, 0, 1]);
      if (V.len(x) < 1e-6) x = V.cross(c.a, [1, 0, 0]);
      x = V.norm(V.cross(x, c.a));
      const top = V.add(V.add(c.o, V.mul(c.a, c.len - off)), V.mul(x, c.r));
      return [dlg.valueManip("length", { origin: top, dir: V.mul(c.a, -1), min: 0.01, fixedDir: true })].filter(Boolean);
    },
  });

  /** {designation, pitch, major, minor} of the dialog values (the stored values for a type missing from the library). */
  function threadOf(v) {
    const td = threadData(v.size, v.designation, v.tclass, v.threadType);
    if (td) return td;
    if (f0 && v.threadType === f0.threadType && v.size === f0.size && v.designation === f0.designation && v.tclass === f0.tclass && Number(f0.pitch) > 0) return { designation: f0.designation, pitch: f0.pitch, major: f0.major, minor: f0.minor };
    return null;
  }
  /** Class options of the current type / size / designation for the gender of the selected face. */
  function classesFor(dlg) {
    const v = dlg.values;
    const internal = !!(cylOf(dlg.baseState, (v.faces || [])[0]) || {}).internal;
    const opts = classOptions(internal, v.threadType, v.size, v.designation);
    const keep = dlg.touched.has("tclass") && opts.some((o) => o.value === v.tclass);
    setOptions(dlg, "tclass", opts, keep);
    if (!keep && opts.some((o) => o.value === defaultClass(internal, v.threadType, v.size, v.designation))) { v.tclass = defaultClass(internal, v.threadType, v.size, v.designation); const re = dlg.rowEls && dlg.rowEls.tclass; if (re) re.update(); }
  }
  /** Fusion sizes the thread from the selected cylinder (nearest size; gender from the face). */
  function fromFace(dlg) {
    const c = cylOf(dlg.baseState, (dlg.values.faces || [])[0]);
    if (!c) return;
    const internal = c.internal;
    const type = dlg.values.threadType;
    if (!dlg.touched.has("size")) {
      dlg.values.size = sizeForDiameter(2 * c.r, internal, type);
      const re = dlg.rowEls && dlg.rowEls.size;
      if (re) re.update();
      setOptions(dlg, "designation", designationOptions(dlg.values.size, type), false);
    }
    const copts = classOptions(internal, type, dlg.values.size, dlg.values.designation);
    const keepClass = copts.some((o) => o.value === dlg.values.tclass) && dlg.touched.has("tclass");
    setOptions(dlg, "tclass", copts, keepClass);
    if (!keepClass) { dlg.values.tclass = defaultClass(internal, type, dlg.values.size, dlg.values.designation); const re = dlg.rowEls && dlg.rowEls.tclass; if (re) re.update(); }
    if (!dlg.touched.has("length")) {
      dlg.values.length = U.fmt(c.len, "length");
      const re = dlg.rowEls && dlg.rowEls.length;
      if (re) re.update();
    }
  }
}
