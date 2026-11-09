// adsk.fusion for the recreation's JavaScript script API, mapped onto the app's real parametric
// model: every call edits app.doc (sketch geometry, timeline features, parameters) through the same
// feature types the dialogs create, so results show in the browser / timeline, support Edit Feature,
// undo (one step per script run) and save / open. Units follow the Fusion API: centimetres and
// radians for numbers (createByReal, Point3D), expression strings for createByString.
import { Base, Point3D, Vector3D, Matrix3D, BoundingBox3D, ValueInput, ObjectCollection, SurfaceTypes, Curve3DTypes } from "./core.js";
import { planeRefFromRef } from "../../dialogs/util.js";

const CM = 10; // mm per cm
const RAD = 180 / Math.PI;
const fmtN = (v) => { const r = Math.round(v * 1e6) / 1e6; return String(Object.is(r, -0) ? 0 : r); };

export class ScriptError extends Error { constructor(msg) { super(msg); this.name = "RuntimeError"; } }
const fail = (msg) => { throw new ScriptError(msg); };

export const FeatureOperations = { JoinFeatureOperation: 0, CutFeatureOperation: 1, IntersectFeatureOperation: 2, NewBodyFeatureOperation: 3, NewComponentFeatureOperation: 4 };
const OP = ["join", "cut", "intersect", "new", "newComponent"];
const OP_BACK = { join: 0, cut: 1, intersect: 2, new: 3, newComponent: 4 };
export const ExtentDirections = { PositiveExtentDirection: 0, NegativeExtentDirection: 1, SymmetricExtentDirection: 2 };
export const PatternDistanceType = { ExtentPatternDistanceType: 0, SpacingPatternDistanceType: 1 };
export const DimensionOrientations = { AlignedDimensionOrientation: 0, HorizontalDimensionOrientation: 1, VerticalDimensionOrientation: 2 };
export const DesignTypes = { DirectDesignType: 0, ParametricDesignType: 1 };
export const FeatureHealthStates = { HealthyFeatureHealthState: 0, WarningFeatureHealthState: 1, ErrorFeatureHealthState: 2, UnknownFeatureHealthState: 3 };
export const BooleanTypes = { DifferenceBooleanType: 0, IntersectionBooleanType: 1, UnionBooleanType: 2 };
export const HoleEdgePositions = { EdgeStartPointPosition: 0, EdgeMidPointPosition: 1, EdgeEndPointPosition: 2 };

/** Length expression (mm) from a ValueInput: real values are cm, strings are expressions. */
function lenExpr(vi, what = "value") {
  if (vi instanceof ValueInput) {
    if (vi.valueType === 0) return `${fmtN(vi.realValue * CM)} mm`;
    if (vi.valueType === 1) return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(vi.stringValue.trim()) ? `${vi.stringValue.trim()} mm` : vi.stringValue;
  }
  if (typeof vi === "number") return `${fmtN(vi * CM)} mm`;
  if (typeof vi === "string") return vi;
  return fail(`Invalid ${what}: expected a ValueInput`);
}
function angExpr(vi, what = "angle") {
  if (vi instanceof ValueInput) {
    if (vi.valueType === 0) return `${fmtN(vi.realValue * RAD)} deg`;
    if (vi.valueType === 1) return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(vi.stringValue.trim()) ? `${vi.stringValue.trim()} deg` : vi.stringValue;
  }
  if (typeof vi === "number") return `${fmtN(vi * RAD)} deg`;
  if (typeof vi === "string") return vi;
  return fail(`Invalid ${what}: expected a ValueInput`);
}
function countExpr(vi) {
  if (vi instanceof ValueInput) return vi.valueType === 0 ? fmtN(Math.round(vi.realValue)) : vi.stringValue;
  if (typeof vi === "number") return fmtN(Math.round(vi));
  return String(vi);
}
const negate = (e) => `-(${e})`;
const listOf = (x) => (x == null ? [] : x instanceof ObjectCollection ? x.asArray() : Array.isArray(x) ? x : [x]);
const P3 = (a) => new Point3D(a[0] / CM, a[1] / CM, a[2] / CM);
const mmOf = (p) => [p.x * CM, p.y * CM, p.z * CM];

// =====================================================================================================
// Session: one script run (or one add-in command execution) = one undo step
// =====================================================================================================
export class Session {
  constructor(app, label) { this.app = app; this.label = label; this.dirty = false; this.changed = false; this.started = false; }
  begin() {
    if (this.started) return;
    this.started = true;
    this.before = JSON.parse(JSON.stringify(this.app.doc));
    this.undoLen = this.app.history.undoStack.length;
  }
  /** Raw document edit (sketch geometry, names...): recomputed lazily. */
  edit(fn) {
    this.begin();
    const r = fn(this.app.doc);
    this.dirty = true;
    this.changed = true;
    return r;
  }
  ensure() {
    if (!this.dirty) return;
    this.dirty = false;
    const app = this.app;
    app.dirty = true;
    app.emit("doc", { label: this.label });
    app.recompute();
  }
  /** Insert a timeline feature at the marker; throws (and removes it) when it fails to compute. */
  addFeature(f, label) {
    this.begin();
    this.ensure();
    const app = this.app;
    const nf = app.addFeature(f, label);
    this.changed = true;
    const r = app.featureResult(nf.id) || {};
    if (r.ok === false) {
      app.deleteFeature(nf.id);
      fail(`Compute Failed: ${r.error || "the feature could not be computed"}`);
    }
    return nf;
  }
  /** Collapse every change of the run into one undo step. */
  end() {
    try { this.ensure(); } catch (e) { console.warn(e); }
    if (!this.started) return;
    const app = this.app;
    const st = app.history.undoStack;
    if (st.length < this.undoLen) return; // the history was reset (new document) during the run
    if (this.changed || st.length > this.undoLen) {
      st.splice(this.undoLen);
      st.push({ label: this.label, doc: this.before });
      app.history.redoStack = [];
      app.emit("history", {});
    }
  }
}

// =====================================================================================================
// wrappers
// =====================================================================================================
class Coll extends Base {
  constructor(get) { super(); this._get = get; }
  get _list() { return this._get() || []; }
  get count() { return this._list.length; }
  item(i) { return this._list[i] ?? null; }
  itemByName(n) { return this._list.find((x) => x && x.name === n) || null; }
  asArray() { return [...this._list]; }
  [Symbol.iterator]() { return this._list[Symbol.iterator](); }
}

export function createFusion(app, host) {
  const K = app.K, S = app.S, M = app.M;
  const ses = () => {
    if (host.session) return host.session;
    // API used outside a run (e.g. from a timer): a short session that ends after the current task
    const s = new Session(app, "Script");
    host.session = s;
    setTimeout(() => { s.end(); if (host.session === s) host.session = null; }, 0);
    return s;
  };
  const ensure = () => ses().ensure();
  const state = () => { ensure(); return app.result ? app.result.state : { bodies: new Map(), sketches: new Map(), planes: new Map() }; };
  const feat = (id) => app.feature(id) || fail("The object is no longer valid (it was deleted)");

  // ------------------------------------------------------------------ construction geometry
  class ConstructionPlane extends Base {
    constructor(ref) { super(); this._ref = ref; } // {kind:'origin', name} | {kind:'cplane', id}
    get name() { return this._ref.kind === "origin" ? `${this._ref.name} Plane` : feat(this._ref.id).name; }
    set name(v) { if (this._ref.kind === "cplane") ses().edit(() => { feat(this._ref.id).name = String(v); }); }
    get _plane() {
      if (this._ref.kind === "origin") return K.ORIGIN_PLANES[this._ref.name];
      const p = state().planes.get(this._ref.id);
      return p ? p.plane : fail("The construction plane could not be computed");
    }
    get geometry() { const pl = this._plane; return { origin: P3(pl.o), normal: new Vector3D(...pl.n), uDirection: new Vector3D(...pl.x), vDirection: new Vector3D(...K.planeY(pl)) }; }
    get isVisible() { return this._ref.kind === "cplane" ? feat(this._ref.id).visible !== false : !!(app.doc.origin && app.doc.origin.visible); }
    set isVisible(v) { if (this._ref.kind === "cplane") ses().edit(() => { feat(this._ref.id).visible = !!v; }); }
    get timelineObject() { return this._ref.kind === "cplane" ? new TimelineObject(this._ref.id) : null; }
    deleteMe() { if (this._ref.kind !== "cplane") return false; ses().begin(); app.deleteFeature(this._ref.id); ses().changed = true; return true; }
  }
  class ConstructionAxis extends Base {
    constructor(name) { super(); this._name = name; }
    get name() { return `${this._name} Axis`; }
    get geometry() { return { origin: new Point3D(), direction: new Vector3D(...K.ORIGIN_AXES[this._name]) }; }
  }
  class ConstructionPoint extends Base { get name() { return "Origin"; } get geometry() { return new Point3D(); } }

  class ConstructionPlaneInput extends Base {
    constructor() { super(); this._def = null; }
    setByOffset(planarEntity, offset) { this._def = { mode: "offset", base: planeRefOf(planarEntity), offset: lenExpr(offset, "offset") }; return true; }
    setByAngle(linearEntity, angle, planarEntity) { this._def = { mode: "angle", axis: axisOf(linearEntity), angle: angExpr(angle), base: planeRefOf(planarEntity) }; return true; }
    setByTwoPlanes(planarEntityOne, planarEntityTwo) { this._def = { mode: "midplane", base: planeRefOf(planarEntityOne), base2: planeRefOf(planarEntityTwo) }; return true; }
  }
  class ConstructionPlanes extends Coll {
    constructor() { super(() => app.doc.features.filter((f) => f.type === "cplane").map((f) => new ConstructionPlane({ kind: "cplane", id: f.id }))); }
    createInput() { return new ConstructionPlaneInput(); }
    add(input) {
      if (!input || !input._def) fail("The construction plane input is not defined");
      const nf = ses().addFeature({ type: "cplane", ...input._def }, "Construction Plane");
      return new ConstructionPlane({ kind: "cplane", id: nf.id });
    }
  }

  /** planeRef of an API object (origin plane, construction plane, planar face). */
  function planeRefOf(o) {
    if (o instanceof ConstructionPlane) return o._ref.kind === "origin" ? { kind: "origin", name: o._ref.name } : { kind: "cplane", id: o._ref.id };
    if (o instanceof BRepFace) {
      const r = o._ref();
      if (!r.planar) fail("The face is not planar");
      return planeRefFromRef(r);
    }
    if (o instanceof Profile) fail("Use the profile's parent sketch reference plane");
    return fail("A plane or planar face is required");
  }
  function axisOf(o) {
    if (o instanceof ConstructionAxis) return { kind: "origin", name: o._name };
    if (o instanceof SketchLine) return { kind: "sketchLine", sketch: o._s, curve: o._id };
    if (o instanceof BRepEdge) { const r = o._ref(); return { kind: "edge", body: r.body, p: r.p }; }
    return fail("An axis, sketch line or linear edge is required");
  }

  // ------------------------------------------------------------------ sketches
  class SketchEntity extends Base {
    constructor(sid, id) { super(); this._s = sid; this._id = id; }
    get _sk() { return feat(this._s).sk; }
    get parentSketch() { return new Sketch(this._s); }
    get isConstruction() { const c = this._sk.curves[this._id]; return !!(c && c.cons); }
    set isConstruction(v) { ses().edit(() => { const c = this._sk.curves[this._id]; if (c) c.cons = !!v; }); }
    get isFixed() { return !!(this._sk.points[this._id] && this._sk.points[this._id].fixed); }
    get entityToken() { return `${this._s}/${this._id}`; }
    deleteMe() { ses().edit(() => { S.removeEntities(feat(this._s).sk, [this._id]); }); return true; }
  }
  class SketchPoint extends SketchEntity {
    get geometry() { const p = this._sk.points[this._id] || fail("The sketch point no longer exists"); return new Point3D(p.x / CM, p.y / CM, 0); }
    get worldGeometry() { const p = this._sk.points[this._id]; const pl = sketchPlane(this._s); return P3(K.toWorld(pl, p.x, p.y)); }
    move(v) { ses().edit(() => { const p = this._sk.points[this._id]; p.x += v.x * CM; p.y += v.y * CM; }); return true; }
    get connectedEntities() { const sk = this._sk; return new ObjectCollection(S.curvesUsingPoint(sk, this._id).map((cid) => curveObj(this._s, cid))); }
  }
  class SketchCurve extends SketchEntity {
    get _cv() { return this._sk.curves[this._id] || fail("The sketch curve no longer exists"); }
    get length() { try { const pts = S.curvePolyline(this._sk, this._id, 128); let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L / CM; } catch { return 0; } }
  }
  class SketchLine extends SketchCurve {
    get startSketchPoint() { return new SketchPoint(this._s, this._cv.p1); }
    get endSketchPoint() { return new SketchPoint(this._s, this._cv.p2); }
    get geometry() { const cv = this._cv, P = this._sk.points; return { startPoint: new Point3D(P[cv.p1].x / CM, P[cv.p1].y / CM, 0), endPoint: new Point3D(P[cv.p2].x / CM, P[cv.p2].y / CM, 0), objectType: "adsk::core::Line3D" }; }
  }
  class SketchCircle extends SketchCurve {
    get centerSketchPoint() { return new SketchPoint(this._s, this._cv.c); }
    get radius() { return this._cv.r / CM; }
    set radius(v) { ses().edit(() => { this._cv.r = Number(v) * CM; }); }
    get area() { return Math.PI * this.radius * this.radius; }
  }
  class SketchArc extends SketchCurve {
    get centerSketchPoint() { return new SketchPoint(this._s, this._cv.c); }
    get startSketchPoint() { return new SketchPoint(this._s, this._cv.p1); }
    get endSketchPoint() { return new SketchPoint(this._s, this._cv.p2); }
    get radius() { const P = this._sk.points, c = this._cv; return Math.hypot(P[c.p1].x - P[c.c].x, P[c.p1].y - P[c.c].y) / CM; }
  }
  class SketchFittedSpline extends SketchCurve {
    get fitPoints() { return new ObjectCollection(this._cv.pts.map((p) => new SketchPoint(this._s, p))); }
    get isClosed() { return !!this._cv.closed; }
  }
  class SketchEllipse extends SketchCurve { get centerSketchPoint() { return new SketchPoint(this._s, this._cv.c); } }
  function curveObj(sid, cid) {
    const cv = feat(sid).sk.curves[cid];
    if (!cv) return null;
    const C = { line: SketchLine, circle: SketchCircle, arc: SketchArc, spline: SketchFittedSpline, ellipse: SketchEllipse, point: SketchPoint }[cv.type] || SketchCurve;
    return cv.type === "point" ? new SketchPoint(sid, cv.p) : new C(sid, cid);
  }
  const sketchPlane = (sid) => { const s = state().sketches.get(sid); return (s && s.plane) || feat(sid).plane; };

  /** Point id in sketch `sid` for a Point3D (sketch space, cm) or an existing SketchPoint. */
  function pointId(sid, sk, p) {
    if (p instanceof SketchPoint) {
      if (p._s !== sid) fail("The sketch point belongs to another sketch");
      return p._id;
    }
    if (p && typeof p.x === "number") return S.addPoint(sk, p.x * CM, p.y * CM);
    return fail("A Point3D or SketchPoint is required");
  }
  const uvOf = (sk, p) => (p instanceof SketchPoint ? [sk.points[p._id].x, sk.points[p._id].y] : [p.x * CM, p.y * CM]);

  class SketchLineList extends Coll {}
  class SketchLines extends Coll {
    constructor(sid) { super(() => Object.entries(feat(sid).sk.curves).filter(([, c]) => c.type === "line").map(([id]) => new SketchLine(sid, id))); this._s = sid; }
    addByTwoPoints(a, b) {
      return ses().edit(() => {
        const sk = feat(this._s).sk;
        const p1 = pointId(this._s, sk, a), p2 = pointId(this._s, sk, b);
        if (p1 === p2) fail("The two points are coincident");
        const P = sk.points;
        if (Math.hypot(P[p1].x - P[p2].x, P[p1].y - P[p2].y) < 1e-9) fail("The two points are coincident");
        return new SketchLine(this._s, S.addLine(sk, p1, p2));
      });
    }
    addTwoPointRectangle(a, b) {
      return ses().edit(() => {
        const sk = feat(this._s).sk;
        const A = uvOf(sk, a), B = uvOf(sk, b);
        if (Math.abs(A[0] - B[0]) < 1e-9 || Math.abs(A[1] - B[1]) < 1e-9) fail("The rectangle has no area");
        const r = S.addRect2pt(sk, A, B);
        return new SketchLineList(() => r.lines.map((id) => new SketchLine(this._s, id)));
      });
    }
    addCenterPointRectangle(center, corner) {
      return ses().edit(() => {
        const sk = feat(this._s).sk;
        const c = uvOf(sk, center), q = uvOf(sk, corner);
        if (Math.abs(c[0] - q[0]) < 1e-9 || Math.abs(c[1] - q[1]) < 1e-9) fail("The rectangle has no area");
        const r = S.addCenterRect(sk, c, q, center instanceof SketchPoint ? center._id : null);
        return new SketchLineList(() => r.lines.map((id) => new SketchLine(this._s, id)));
      });
    }
    addThreePointRectangle(a, b, c) {
      return ses().edit(() => {
        const sk = feat(this._s).sk;
        const A = uvOf(sk, a), B = uvOf(sk, b), Cq = uvOf(sk, c);
        const d = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(d[0], d[1]);
        if (L < 1e-9) fail("The rectangle has no area");
        const nrm = [-d[1] / L, d[0] / L];
        const h = (Cq[0] - B[0]) * nrm[0] + (Cq[1] - B[1]) * nrm[1];
        if (Math.abs(h) < 1e-9) fail("The rectangle has no area");
        const C2 = [B[0] + nrm[0] * h, B[1] + nrm[1] * h], D = [A[0] + nrm[0] * h, A[1] + nrm[1] * h];
        const r = S.addRectCorners(sk, [A, B, C2, D], { aligned: false });
        return new SketchLineList(() => r.lines.map((id) => new SketchLine(this._s, id)));
      });
    }
  }
  class SketchCircles extends Coll {
    constructor(sid) { super(() => Object.entries(feat(sid).sk.curves).filter(([, c]) => c.type === "circle").map(([id]) => new SketchCircle(sid, id))); this._s = sid; }
    addByCenterRadius(center, radius) {
      const r = Number(radius) * CM;
      if (!(r > 0)) fail("The radius must be greater than zero");
      return ses().edit(() => { const sk = feat(this._s).sk; return new SketchCircle(this._s, S.addCircle(sk, pointId(this._s, sk, center), r)); });
    }
    addByTwoPoints(a, b) {
      return ses().edit(() => {
        const sk = feat(this._s).sk;
        const A = uvOf(sk, a), B = uvOf(sk, b);
        const r = Math.hypot(B[0] - A[0], B[1] - A[1]) / 2;
        if (!(r > 1e-9)) fail("The points are coincident");
        return new SketchCircle(this._s, S.addCircle(sk, S.addPoint(sk, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2), r));
      });
    }
    addByThreePoints(a, b, c) {
      return ses().edit(() => {
        const sk = feat(this._s).sk;
        const ci = S.circleFrom3(uvOf(sk, a), uvOf(sk, b), uvOf(sk, c)) || fail("The points are collinear");
        return new SketchCircle(this._s, S.addCircle(sk, S.addPoint(sk, ci.c[0], ci.c[1]), ci.r));
      });
    }
  }
  class SketchArcs extends Coll {
    constructor(sid) { super(() => Object.entries(feat(sid).sk.curves).filter(([, c]) => c.type === "arc").map(([id]) => new SketchArc(sid, id))); this._s = sid; }
    addByThreePoints(start, mid, end) {
      return ses().edit(() => {
        const sk = feat(this._s).sk;
        const ar = S.arcFrom3(uvOf(sk, start), uvOf(sk, mid), uvOf(sk, end)) || fail("The points are collinear");
        const c = S.addPoint(sk, ar.c[0], ar.c[1]);
        const p1 = pointId(this._s, sk, start), p2 = pointId(this._s, sk, end);
        return new SketchArc(this._s, S.addArcDir(sk, c, p1, p2, ar.ccw));
      });
    }
    addByCenterStartSweep(center, start, sweepAngle) {
      return ses().edit(() => {
        const sk = feat(this._s).sk;
        const C = uvOf(sk, center), A = uvOf(sk, start);
        const r = Math.hypot(A[0] - C[0], A[1] - C[1]);
        if (!(r > 1e-9)) fail("The start point is at the center");
        const a0 = Math.atan2(A[1] - C[1], A[0] - C[0]), a1 = a0 + Number(sweepAngle);
        const c = pointId(this._s, sk, center), p1 = pointId(this._s, sk, start);
        const p2 = S.addPoint(sk, C[0] + r * Math.cos(a1), C[1] + r * Math.sin(a1));
        return new SketchArc(this._s, S.addArcDir(sk, c, p1, p2, Number(sweepAngle) > 0));
      });
    }
  }
  class SketchFittedSplines extends Coll {
    constructor(sid) { super(() => Object.entries(feat(sid).sk.curves).filter(([, c]) => c.type === "spline").map(([id]) => new SketchFittedSpline(sid, id))); this._s = sid; }
    add(points) {
      const pts = listOf(points);
      if (pts.length < 2) fail("A spline needs at least two fit points");
      return ses().edit(() => { const sk = feat(this._s).sk; return new SketchFittedSpline(this._s, S.addSpline(sk, pts.map((p) => pointId(this._s, sk, p)))); });
    }
  }
  class SketchCurves extends Coll {
    constructor(sid) {
      super(() => Object.keys(feat(sid).sk.curves).filter((id) => feat(sid).sk.curves[id].type !== "point").map((id) => curveObj(sid, id)));
      this.sketchLines = new SketchLines(sid);
      this.sketchCircles = new SketchCircles(sid);
      this.sketchArcs = new SketchArcs(sid);
      this.sketchFittedSplines = new SketchFittedSplines(sid);
    }
  }
  class SketchPoints extends Coll {
    constructor(sid) { super(() => Object.keys(feat(sid).sk.points).map((id) => new SketchPoint(sid, id))); this._s = sid; }
    add(p) {
      return ses().edit(() => {
        const sk = feat(this._s).sk;
        const id = pointId(this._s, sk, p);
        S.addSketchPoint(sk, id);
        return new SketchPoint(this._s, id);
      });
    }
  }
  const refsOfEntity = (sid, e) => {
    if (e instanceof SketchEntity) { if (e._s !== sid) fail("The entity belongs to another sketch"); return e._id; }
    return fail("A sketch entity is required");
  };
  class GeometricConstraints extends Coll {
    constructor(sid) { super(() => feat(sid).sk.constraints.filter((c) => !c.expr && !c.internal).map((c) => ({ objectType: `adsk::fusion::${c.type}Constraint`, deleteMe: () => ses().edit(() => { const sk = feat(sid).sk; sk.constraints = sk.constraints.filter((x) => x.id !== c.id); }) }))); this._s = sid; }
    _add(type, ents) { return ses().edit(() => { const sk = feat(this._s).sk; const c = S.addConstraint(sk, type, ents.map((e) => refsOfEntity(this._s, e))); return { objectType: `adsk::fusion::${type}Constraint`, entityToken: c.id }; }); }
    addHorizontal(line) { return this._add("horizontal", [line]); }
    addVertical(line) { return this._add("vertical", [line]); }
    addHorizontalPoints(a, b) { return this._add("horizontal", [a, b]); }
    addVerticalPoints(a, b) { return this._add("vertical", [a, b]); }
    addParallel(a, b) { return this._add("parallel", [a, b]); }
    addPerpendicular(a, b) { return this._add("perpendicular", [a, b]); }
    addCollinear(a, b) { return this._add("collinear", [a, b]); }
    addEqual(a, b) { return this._add("equal", [a, b]); }
    addTangent(a, b) { return this._add("tangent", [a, b]); }
    addConcentric(a, b) { return this._add("concentric", [a, b]); }
    addMidPoint(point, line) { return this._add("midpoint", [point, line]); }
    addSymmetry(a, b, line) { return this._add("symmetric", [a, b, line]); }
    addCoincident(point, entity) { return this._add(entity instanceof SketchPoint ? "coincident" : "onCurve", [point, entity]); }
    addFix(e) { return this._add("fix", [e]); }
  }
  class SketchDimension extends Base {
    constructor(sid, cid) { super(); this._s = sid; this._c = cid; }
    get _con() { return feat(this._s).sk.constraints.find((c) => c.id === this._c) || fail("The dimension no longer exists"); }
    get parameter() { return new ModelParameter(this._con.param); }
    get value() { ensure(); try { const v = app.result.params.value(this._con.param); return this._con.type === "angle" ? v / RAD : v / CM; } catch { return 0; } }
    set value(v) { ses().edit(() => { this._con.expr = this._con.type === "angle" ? `${fmtN(v * RAD)} deg` : `${fmtN(v * CM)} mm`; }); }
    deleteMe() { ses().edit(() => { const sk = feat(this._s).sk; sk.constraints = sk.constraints.filter((x) => x.id !== this._c); }); return true; }
  }
  class SketchDimensions extends Coll {
    constructor(sid) { super(() => feat(sid).sk.constraints.filter((c) => c.param).map((c) => new SketchDimension(sid, c.id))); this._s = sid; }
    _add(type, refs, expr, extra = {}) {
      return ses().edit((doc) => {
        const sk = feat(this._s).sk;
        const c = S.addConstraint(sk, type, refs, { expr, param: M.nextParam(doc), ...extra });
        return new SketchDimension(this._s, c.id);
      });
    }
    _measure(c) { try { return S.measureDim(feat(this._s).sk, c); } catch { return 0; } }
    addDistanceDimension(a, b, orientation = 0, textPoint = null) {
      const refs = [refsOfEntity(this._s, a), refsOfEntity(this._s, b)];
      const dimType = ["aligned", "horizontal", "vertical"][orientation] || "aligned";
      const v = this._measure({ type: "distance", refs, dimType });
      void textPoint;
      return this._add("distance", refs, `${fmtN(v)} mm`, { dimType });
    }
    addDiameterDimension(circle) { const refs = [refsOfEntity(this._s, circle)]; return this._add("diameter", refs, `${fmtN(this._measure({ type: "diameter", refs }))} mm`); }
    addRadialDimension(circle) { const refs = [refsOfEntity(this._s, circle)]; return this._add("radius", refs, `${fmtN(this._measure({ type: "radius", refs }))} mm`); }
    addAngularDimension(l1, l2) { const refs = [refsOfEntity(this._s, l1), refsOfEntity(this._s, l2)]; return this._add("angle", refs, `${fmtN(this._measure({ type: "angle", refs }))} deg`); }
  }

  class Profile extends Base {
    constructor(sid, key, c) { super(); this._s = sid; this._key = key; this._c = c; }
    get parentSketch() { return new Sketch(this._s); }
    get _region() {
      const s = state().sketches.get(this._s);
      const r = s && s.regions.regions.find((x) => x.key === this._key);
      return r || fail("The profile is no longer valid");
    }
    areaProperties() {
      const r = this._region;
      const pl = sketchPlane(this._s);
      const poly = r.outer.poly;
      let cx = 0, cy = 0, A = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const k = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
        A += k; cx += (poly[j][0] + poly[i][0]) * k; cy += (poly[j][1] + poly[i][1]) * k;
      }
      A /= 2;
      const c = Math.abs(A) > 1e-12 ? [cx / (6 * A), cy / (6 * A)] : this._c;
      let per = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) per += Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]);
      return { area: Math.abs(r.area) / (CM * CM), centroid: P3(K.toWorld(pl, c[0], c[1])), perimeter: per / CM, objectType: "adsk::fusion::AreaProperties" };
    }
    get profileLoops() { const r = this._region; return new Coll(() => [r.outer, ...(r.holes || [])].map((l, i) => ({ isOuter: i === 0 }))); }
    get _ref() { return { sketch: this._s, key: this._key, c: this._c }; }
  }
  class Profiles extends Coll {
    constructor(sid) {
      super(() => {
        const s = state().sketches.get(sid);
        if (!s) return [];
        return s.regions.regions.map((r) => new Profile(sid, r.key, interior(r)));
      });
    }
  }
  function interior(r) {
    // a point inside the outer loop and outside the holes (centroid when it qualifies)
    const pip = (q, poly) => { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
    const ok = (q) => pip(q, r.outer.poly) && !(r.holes || []).some((h) => pip(q, h.poly));
    const poly = r.outer.poly;
    const c = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
    if (ok(c)) return c;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      for (const t of [0.02, 0.1, 0.3]) { const q = [m[0] + (c[0] - m[0]) * t, m[1] + (c[1] - m[1]) * t]; if (ok(q)) return q; }
    }
    return c;
  }

  class Sketch extends Base {
    constructor(id) { super(); this._id = id; }
    get name() { return feat(this._id).name; }
    set name(v) { ses().edit(() => { feat(this._id).name = String(v); }); }
    get sketchCurves() { return new SketchCurves(this._id); }
    get sketchPoints() { return new SketchPoints(this._id); }
    get profiles() { return new Profiles(this._id); }
    get geometricConstraints() { return new GeometricConstraints(this._id); }
    get sketchDimensions() { return new SketchDimensions(this._id); }
    get originPoint() { return new SketchPoint(this._id, "o"); }
    get isVisible() { return feat(this._id).visible !== false; }
    set isVisible(v) { ses().edit(() => { feat(this._id).visible = !!v; }); }
    get isComputeDeferred() { return !!this._deferred; }
    set isComputeDeferred(v) { this._deferred = !!v; if (!v) ensure(); }
    get isFullyConstrained() { const s = state().sketches.get(this._id); return !!(s && s.status && s.status.fully); }
    get referencePlane() { const pr = feat(this._id).planeRef; return pr && pr.kind === "origin" ? new ConstructionPlane({ kind: "origin", name: pr.name }) : pr && pr.kind === "cplane" ? new ConstructionPlane({ kind: "cplane", id: pr.id }) : null; }
    get transform() { const pl = sketchPlane(this._id); const y = K.planeY(pl); return new Matrix3D([pl.x[0], y[0], pl.n[0], pl.o[0] / CM, pl.x[1], y[1], pl.n[1], pl.o[1] / CM, pl.x[2], y[2], pl.n[2], pl.o[2] / CM, 0, 0, 0, 1]); }
    get origin() { return P3(sketchPlane(this._id).o); }
    get xDirection() { return new Vector3D(...sketchPlane(this._id).x); }
    get yDirection() { return new Vector3D(...K.planeY(sketchPlane(this._id))); }
    get timelineObject() { return new TimelineObject(this._id); }
    get parentComponent() { return root; }
    modelToSketchSpace(p) { const pl = sketchPlane(this._id); const uv = K.toLocal(pl, mmOf(p)); const z = (mmOf(p)[0] - pl.o[0]) * pl.n[0] + (mmOf(p)[1] - pl.o[1]) * pl.n[1] + (mmOf(p)[2] - pl.o[2]) * pl.n[2]; return new Point3D(uv[0] / CM, uv[1] / CM, z / CM); }
    sketchToModelSpace(p) { const pl = sketchPlane(this._id); const w = K.toWorld(pl, p.x * CM, p.y * CM); return P3([w[0] + pl.n[0] * p.z * CM, w[1] + pl.n[1] * p.z * CM, w[2] + pl.n[2] * p.z * CM]); }
    deleteMe() { ses().begin(); ensure(); app.deleteFeature(this._id); ses().changed = true; return true; }
  }
  class Sketches extends Coll {
    constructor() { super(() => app.doc.features.filter((f) => f.type === "sketch").map((f) => new Sketch(f.id))); }
    add(planarEntity) {
      const planeRef = planeRefOf(planarEntity);
      let plane;
      if (planeRef.kind === "origin") plane = K.ORIGIN_PLANES[planeRef.name];
      else if (planeRef.kind === "cplane") { const p = state().planes.get(planeRef.id); plane = p ? p.plane : fail("The construction plane could not be computed"); }
      else plane = planeRef.plane;
      const nf = ses().addFeature({ type: "sketch", plane: JSON.parse(JSON.stringify(plane)), planeRef, sk: S.newSketch(), visible: true }, "Create Sketch");
      return new Sketch(nf.id);
    }
  }

  // ------------------------------------------------------------------ B-Rep
  class BRepBody extends Base {
    constructor(id) { super(); this._id = id; }
    get _b() { return app.body(this._id) || (ensure(), app.body(this._id)) || fail("The body no longer exists"); }
    get name() { return (app.doc.bodies[this._id] || {}).name || this._id; }
    set name(v) { ses().edit((doc) => { if (doc.bodies[this._id]) doc.bodies[this._id].name = String(v); }); }
    get isVisible() { return (app.doc.bodies[this._id] || {}).visible !== false; }
    set isVisible(v) { ses().edit((doc) => { if (doc.bodies[this._id]) doc.bodies[this._id].visible = !!v; }); }
    get isLightBulbOn() { return this.isVisible; }
    set isLightBulbOn(v) { this.isVisible = v; }
    get isSolid() { return true; }
    get volume() { try { return K.volumeOf(this._b.shape) / (CM * CM * CM); } catch { return 0; } }
    get area() { let a = 0; for (const f of this._b.shape.faces) { try { a += K.R.measureArea(f); } catch { /* ignore */ } } return a / (CM * CM); }
    get faces() { const n = K.topoOf(this._b.shape).faces.length; return new Coll(() => Array.from({ length: n }, (_, i) => new BRepFace(this._id, i))); }
    get edges() { const n = K.topoOf(this._b.shape).edges.length; return new Coll(() => Array.from({ length: n }, (_, i) => new BRepEdge(this._id, i))); }
    get vertices() {
      const T = K.topoOf(this._b.shape);
      const seen = new Map();
      for (const e of T.edges) for (const p of [e.s, e.t]) { const k = p.map((v) => v.toFixed(5)).join(","); if (!seen.has(k)) seen.set(k, p); }
      return new Coll(() => [...seen.values()].map((p) => ({ geometry: P3(p), objectType: "adsk::fusion::BRepVertex" })));
    }
    get boundingBox() { const bb = K.bboxOf(this._b.shape); return new BoundingBox3D(P3(bb.min), P3(bb.max)); }
    get physicalProperties() {
      let mp = null;
      try { mp = app.ui.inspect && app.ui.inspect.massProperties([this._id]); } catch { mp = null; }
      const vol = mp ? mp.volume : this.volume * 1000;
      return {
        volume: vol / 1000, area: mp ? mp.area / 100 : this.area, mass: mp ? mp.mass / 1000 : 0, density: mp && mp.density ? mp.density / 1000 : 0,
        centerOfMass: mp && mp.com ? P3(mp.com) : this.boundingBox.minPoint, objectType: "adsk::fusion::PhysicalProperties",
      };
    }
    get material() { const m = (app.doc.bodies[this._id] || {}).material; return { name: m || "Steel", id: m }; }
    get appearance() { const a = (app.doc.bodies[this._id] || {}).appearance; const d = app.appearances[a]; return { name: d ? d.name : a, id: a }; }
    get entityToken() { return this._id; }
    get parentComponent() { return root; }
    deleteMe() { ses().addFeature({ type: "delete", bodies: [this._id] }, "Remove"); return true; }
    get _ref() { return { kind: "body", body: this._id }; }
  }
  class BRepFace extends Base {
    constructor(body, i) { super(); this._body = body; this._i = i; }
    get _t() { const b = app.body(this._body) || fail("The body no longer exists"); return K.topoOf(b.shape).faces[this._i] || fail("The face no longer exists"); }
    _ref() { const f = this._t; return { kind: "face", body: this._body, index: this._i, p: [...f.c], n: [...f.n], planar: f.type === "PLANE" }; }
    get body() { return new BRepBody(this._body); }
    get area() { try { return K.R.measureArea(app.body(this._body).shape.faces[this._i]) / (CM * CM); } catch { return 0; } }
    get pointOnFace() { return P3(this._t.c); }
    get centroid() { try { return P3(app.body(this._body).shape.faces[this._i].center.toTuple()); } catch { return P3(this._t.c); } }
    get geometry() {
      const f = this._t;
      const type = { PLANE: SurfaceTypes.PlaneSurfaceType, CYLINDRE: SurfaceTypes.CylinderSurfaceType, CONE: SurfaceTypes.ConeSurfaceType, SPHERE: SurfaceTypes.SphereSurfaceType, TORUS: SurfaceTypes.TorusSurfaceType }[f.type] ?? SurfaceTypes.NurbsSurfaceType;
      const g = { surfaceType: type, objectType: ["adsk::core::Plane", "adsk::core::Cylinder", "adsk::core::Cone", "adsk::core::Sphere", "adsk::core::Torus"][type] || "adsk::core::NurbsSurface" };
      if (type === 0) { g.normal = new Vector3D(...f.n); g.origin = P3(f.c); }
      if (f.r !== undefined) g.radius = f.r / CM;
      if (f.a) { g.axis = new Vector3D(...f.a); g.origin = P3(f.ao); }
      return g;
    }
    get edges() {
      const T = K.topoOf(app.body(this._body).shape);
      return new Coll(() => T.edges.map((e, i) => (e.faces.includes(this._i) ? new BRepEdge(this._body, i) : null)).filter(Boolean));
    }
    get entityToken() { return `${this._body}/f${this._i}`; }
  }
  class BRepEdge extends Base {
    constructor(body, i) { super(); this._body = body; this._i = i; }
    get _t() { const b = app.body(this._body) || fail("The body no longer exists"); return K.topoOf(b.shape).edges[this._i] || fail("The edge no longer exists"); }
    _ref() { const e = this._t; return { kind: "edge", body: this._body, index: this._i, p: [...e.m] }; }
    get body() { return new BRepBody(this._body); }
    get length() { return this._t.len / CM; }
    get pointOnEdge() { return P3(this._t.m); }
    get startVertex() { return { geometry: P3(this._t.s) }; }
    get endVertex() { return { geometry: P3(this._t.t) }; }
    get geometry() {
      const e = this._t;
      const closed = Math.hypot(e.s[0] - e.t[0], e.s[1] - e.t[1], e.s[2] - e.t[2]) < 1e-7;
      const type = e.type === "LINE" ? Curve3DTypes.Line3DCurveType : e.type === "CIRCLE" ? (closed ? Curve3DTypes.Circle3DCurveType : Curve3DTypes.Arc3DCurveType) : Curve3DTypes.NurbsCurve3DCurveType;
      const g = { curveType: type, startPoint: P3(e.s), endPoint: P3(e.t) };
      if (e.r !== undefined) { g.radius = e.r / CM; g.center = P3(e.c); g.normal = new Vector3D(...e.a); }
      return g;
    }
    get faces() { const e = this._t; return new Coll(() => e.faces.map((i) => new BRepFace(this._body, i))); }
    get entityToken() { return `${this._body}/e${this._i}`; }
  }
  class BRepBodies extends Coll {
    constructor() { super(() => { ensure(); return app.bodies().map((b) => new BRepBody(b.id)); }); }
  }

  // ------------------------------------------------------------------ features
  const featureBodies = (id) => {
    ensure();
    const f = app.feature(id);
    const r = app.featureResult(id) || {};
    const ids = new Set([...(r.affected || []), f && f.newBody, ...((f && f.newBodies) || [])].filter(Boolean));
    return [...ids].filter((b) => app.body(b)).map((b) => new BRepBody(b));
  };
  class Feature extends Base {
    constructor(id) { super(); this._id = id; }
    get name() { return feat(this._id).name; }
    set name(v) { ses().edit(() => { feat(this._id).name = String(v); }); }
    get bodies() { return new Coll(() => featureBodies(this._id)); }
    get timelineObject() { return new TimelineObject(this._id); }
    get isSuppressed() { return !!feat(this._id).suppressed; }
    set isSuppressed(v) { ses().edit(() => { feat(this._id).suppressed = !!v; }); }
    get healthState() { ensure(); const r = app.featureResult(this._id) || {}; return r.ok === false ? 2 : r.warning ? 1 : 0; }
    get errorOrWarningMessage() { ensure(); const r = app.featureResult(this._id) || {}; return r.error || r.warning || ""; }
    get entityToken() { return this._id; }
    get operation() { return OP_BACK[feat(this._id).operation] ?? 3; }
    get parentComponent() { return root; }
    deleteMe() { ses().begin(); ensure(); app.deleteFeature(this._id); ses().changed = true; return true; }
    _facesOnPlane(offset) {
      // extrude start / end faces: planar faces of the result lying on the profile plane offset
      const f = feat(this._id);
      if (f.type !== "extrude" || !(f.profiles || []).length) return new Coll(() => []);
      const s = state().sketches.get(f.profiles[0].sketch);
      if (!s) return new Coll(() => []);
      const pl = s.plane;
      let d = 0;
      try { d = app.result.params.value(f.p.distance); } catch { d = 0; }
      const off = offset === "end" ? d : 0;
      const out = [];
      for (const b of featureBodies(this._id)) {
        const T = K.topoOf(app.body(b._id).shape);
        T.faces.forEach((fc, i) => {
          if (fc.type !== "PLANE") return;
          if (Math.abs(Math.abs(fc.n[0] * pl.n[0] + fc.n[1] * pl.n[1] + fc.n[2] * pl.n[2]) - 1) > 1e-6) return;
          const h = (fc.c[0] - pl.o[0]) * pl.n[0] + (fc.c[1] - pl.o[1]) * pl.n[1] + (fc.c[2] - pl.o[2]) * pl.n[2];
          if (Math.abs(h - off) < 1e-5) out.push(new BRepFace(b._id, i));
        });
      }
      return new Coll(() => out);
    }
    get startFaces() { return this._facesOnPlane("start"); }
    get endFaces() { return this._facesOnPlane("end"); }
    get sideFaces() {
      const ends = new Set([...this.startFaces, ...this.endFaces].map((x) => `${x._body}:${x._i}`));
      const out = [];
      for (const b of featureBodies(this._id)) K.topoOf(app.body(b._id).shape).faces.forEach((_, i) => { if (!ends.has(`${b._id}:${i}`)) out.push(new BRepFace(b._id, i)); });
      return new Coll(() => out);
    }
  }
  class ExtrudeFeature extends Feature {}
  class RevolveFeature extends Feature {}
  class FilletFeature extends Feature {}
  class ChamferFeature extends Feature {}
  class ShellFeature extends Feature {}
  class HoleFeature extends Feature {}
  class CombineFeature extends Feature {}
  class MirrorFeature extends Feature {}
  class RectangularPatternFeature extends Feature {}
  class CircularPatternFeature extends Feature {}
  class MoveFeature extends Feature {}
  const FEATURE_CLASS = { extrude: ExtrudeFeature, revolve: RevolveFeature, fillet: FilletFeature, chamfer: ChamferFeature, shell: ShellFeature, hole: HoleFeature, combine: CombineFeature, mirror: MirrorFeature, rpattern: RectangularPatternFeature, cpattern: CircularPatternFeature, move: MoveFeature };
  const featureObj = (id) => {
    const f = app.feature(id);
    if (!f) return null;
    if (f.type === "sketch") return new Sketch(id);
    if (f.type === "cplane") return new ConstructionPlane({ kind: "cplane", id });
    return new (FEATURE_CLASS[f.type] || Feature)(id);
  };
  class FeatureList extends Coll {
    constructor(type) { super(() => app.doc.features.filter((f) => f.type === type).map((f) => featureObj(f.id))); }
  }

  const profileRefs = (x) => {
    const out = { profiles: [], faces: [] };
    for (const p of listOf(x)) {
      if (p instanceof Profile) out.profiles.push(p._ref);
      else if (p instanceof BRepFace) { const r = p._ref(); out.faces.push({ body: r.body, p: r.p, n: r.n }); }
      else fail("A profile or planar face is required");
    }
    if (!out.profiles.length && !out.faces.length) fail("No profile was given");
    return out;
  };
  const edgeRefsOf = (x) => listOf(x).map((e) => {
    if (e instanceof BRepEdge) { const r = e._ref(); return { body: r.body, p: r.p }; }
    if (e instanceof BRepFace) return null; // faces expand below
    return fail("Edges are required");
  }).filter(Boolean);
  const faceEdgeRefs = (x) => {
    const out = edgeRefsOf(x);
    for (const f of listOf(x)) if (f instanceof BRepFace) for (const e of f.edges) { const r = e._ref(); out.push({ body: r.body, p: r.p }); }
    if (!out.length) fail("No edges were given");
    return out;
  };
  const bodyIds = (x) => listOf(x).map((b) => (b instanceof BRepBody ? b._id : b instanceof BRepFace || b instanceof BRepEdge ? b._body : fail("Bodies are required")));

  class DistanceExtentDefinition extends Base {
    constructor(d) { super(); this.distance = d; }
    static create(distance) { return new DistanceExtentDefinition(distance); }
  }
  class ThroughAllExtentDefinition extends Base { static create() { return new ThroughAllExtentDefinition(); } }
  class ProfilePlaneStartDefinition extends Base { static create() { return new ProfilePlaneStartDefinition(); } }
  class OffsetStartDefinition extends Base { constructor(o) { super(); this.offset = o; } static create(offset) { return new OffsetStartDefinition(offset); } }

  class ExtrudeFeatureInput extends Base {
    constructor(profile, operation) { super(); this.profile = profile; this.operation = operation; this._ext = null; this.taperAngle = null; this.participantBodies = []; this.isSolid = true; this.startExtent = null; }
    setDistanceExtent(isSymmetric, distance) { this._ext = { kind: isSymmetric ? "sym" : "one", d1: lenExpr(distance, "distance") }; return true; }
    setSymmetricExtent(distance, isFullLength, taperAngle) { this._ext = { kind: "sym", d1: lenExpr(distance, "distance"), whole: !!isFullLength }; if (taperAngle) this.taperAngle = taperAngle; return true; }
    setOneSideExtent(extent, direction = 0, taperAngle) {
      if (extent instanceof ThroughAllExtentDefinition) this._ext = { kind: "one", all: true, neg: direction === 1 };
      else if (extent instanceof DistanceExtentDefinition) this._ext = { kind: "one", d1: lenExpr(extent.distance, "distance"), neg: direction === 1 };
      else fail("Unsupported extent definition");
      if (taperAngle) this.taperAngle = taperAngle;
      return true;
    }
    setTwoSidesExtent(e1, e2, taper1, taper2) {
      const d = (e) => (e instanceof DistanceExtentDefinition ? lenExpr(e.distance) : fail("Two-side extents need distance definitions"));
      this._ext = { kind: "two", d1: d(e1), d2: d(e2) };
      if (taper1) this.taperAngle = taper1;
      this._taper2 = taper2;
      return true;
    }
    setAllExtent(direction = 0) { this._ext = { kind: direction === 2 ? "sym" : "one", all: true, neg: direction === 1 }; return true; }
  }
  class ExtrudeFeatures extends FeatureList {
    constructor() { super("extrude"); }
    createInput(profile, operation) { return new ExtrudeFeatureInput(profile, operation); }
    addSimple(profile, distance, operation) { const i = this.createInput(profile, operation); i.setDistanceExtent(false, distance); return this.add(i); }
    add(input) {
      const e = input._ext || fail("The extent of the extrude is not defined");
      const pr = profileRefs(input.profile);
      const f = { type: "extrude", ...pr, operation: OP[input.operation ?? 3] || "new", dirType: e.kind, extent: e.all ? "all" : "distance", distance: e.d1 || "10 mm", flip: !!e.neg };
      if (e.neg && e.d1) f.distance = negate(e.d1);
      if (e.kind === "sym") f.symMeasure = e.whole ? "whole" : "half";
      if (e.kind === "two") f.distance2 = e.d2;
      if (input.taperAngle) f.taper = angExpr(input.taperAngle);
      if (input._taper2) f.taper2 = angExpr(input._taper2);
      if (input.startExtent instanceof OffsetStartDefinition) { f.startType = "offset"; f.startOffset = lenExpr(input.startExtent.offset); }
      const parts = listOf(input.participantBodies);
      if (parts.length) f.bodies = bodyIds(parts);
      return new ExtrudeFeature(ses().addFeature(f, "Extrude").id);
    }
  }

  class RevolveFeatureInput extends Base {
    constructor(profile, axis, operation) { super(); this.profile = profile; this.axis = axis; this.operation = operation; this._ext = { full: true }; }
    setAngleExtent(isSymmetric, angle) { this._ext = { full: false, sym: !!isSymmetric, a: angExpr(angle) }; return true; }
    setTwoSideAngleExtent(a1, a2) { this._ext = { full: false, two: true, a: angExpr(a1), a2: angExpr(a2) }; return true; }
  }
  class RevolveFeatures extends FeatureList {
    constructor() { super("revolve"); }
    createInput(profile, axis, operation) { return new RevolveFeatureInput(profile, axis, operation); }
    add(input) {
      const pr = profileRefs(input.profile);
      if (pr.faces.length) fail("Revolve needs sketch profiles");
      const e = input._ext;
      const f = { type: "revolve", profiles: pr.profiles, axis: axisOf(input.axis), operation: OP[input.operation ?? 3] || "new", revType: e.full ? "full" : "angle", angle: e.a || "360 deg", dirType: e.sym ? "sym" : e.two ? "two" : "one" };
      if (e.two) f.angle2 = e.a2;
      return new RevolveFeature(ses().addFeature(f, "Revolve").id);
    }
  }

  class FilletEdgeSetInputs extends Base {
    constructor(owner) { super(); this._o = owner; }
    addConstantRadiusEdgeSet(edges, radius, isTangentChain) { this._o._sets.push({ edges: faceEdgeRefs(edges), radius: lenExpr(radius, "radius"), chain: !!isTangentChain }); return { objectType: "adsk::fusion::ConstantRadiusFilletEdgeSetInput" }; }
    get count() { return this._o._sets.length; }
  }
  class FilletFeatureInput extends Base {
    constructor() { super(); this._sets = []; this.isRollingBallCorner = true; this.isG2 = false; this.edgeSetInputs = new FilletEdgeSetInputs(this); }
    addConstantRadiusEdgeSet(edges, radius, isTangentChain) { this.edgeSetInputs.addConstantRadiusEdgeSet(edges, radius, isTangentChain); return true; }
  }
  class FilletFeatures extends FeatureList {
    constructor() { super("fillet"); }
    createInput() { return new FilletFeatureInput(); }
    add(input) {
      if (!input._sets.length) fail("No edges to fillet");
      let first = null;
      for (const s of input._sets) { const nf = ses().addFeature({ type: "fillet", edges: s.edges, radius: s.radius, tangentChain: s.chain }, "Fillet"); first = first || nf; }
      return new FilletFeature(first.id);
    }
  }
  class ChamferEdgeSets extends Base {
    constructor(o) { super(); this._o = o; }
    addEqualDistanceChamferEdgeSet(edges, distance, isTangentChain) { this._o._sets.push({ edges: faceEdgeRefs(edges), d: lenExpr(distance, "distance"), chain: !!isTangentChain }); return { objectType: "adsk::fusion::EqualDistanceChamferEdgeSet" }; }
  }
  class ChamferFeatureInput extends Base {
    constructor(edges, chain) { super(); this._sets = []; this._edges = edges; this._chain = chain; this.chamferEdgeSets = new ChamferEdgeSets(this); }
    setToEqualDistance(distance) { if (!this._edges) fail("Use chamferEdgeSets with createInput2()"); this._sets = [{ edges: faceEdgeRefs(this._edges), d: lenExpr(distance), chain: !!this._chain }]; return true; }
  }
  class ChamferFeatures extends FeatureList {
    constructor() { super("chamfer"); }
    createInput(edges, isTangentChain) { return new ChamferFeatureInput(edges, isTangentChain); }
    createInput2() { return new ChamferFeatureInput(null, false); }
    add(input) {
      if (!input._sets.length) fail("No edges to chamfer");
      let first = null;
      for (const s of input._sets) { const nf = ses().addFeature({ type: "chamfer", edges: s.edges, distance: s.d, tangentChain: s.chain }, "Chamfer"); first = first || nf; }
      return new ChamferFeature(first.id);
    }
  }
  class ShellFeatureInput extends Base {
    constructor(ents, chain) { super(); this._ents = listOf(ents); this.isTangentChain = !!chain; this.insideThickness = null; this.outsideThickness = null; }
  }
  class ShellFeatures extends FeatureList {
    constructor() { super("shell"); }
    createInput(inputEntities, isTangentChain = true) { return new ShellFeatureInput(inputEntities, isTangentChain); }
    add(input) {
      const faces = input._ents.filter((e) => e instanceof BRepFace).map((e) => { const r = e._ref(); return { body: r.body, p: r.p, n: r.n }; });
      const bodies = input._ents.filter((e) => e instanceof BRepBody).map((b) => b._id);
      const inside = !!input.insideThickness || !input.outsideThickness;
      const f = { type: "shell", faces, bodies, thickness: lenExpr(inside ? input.insideThickness || ValueInput.createByReal(0.1) : input.outsideThickness), direction: inside ? "inside" : "outside" };
      return new ShellFeature(ses().addFeature(f, "Shell").id);
    }
  }
  class HoleFeatureInput extends Base {
    constructor(kind, d, a, b) { super(); this._h = { holeType: kind, diameter: lenExpr(d, "diameter") }; if (kind === "counterbore") { this._h.cbD = lenExpr(a); this._h.cbDepth = lenExpr(b); } if (kind === "countersink") { this._h.csD = lenExpr(a); this._h.csAngle = angExpr(b); } this._pts = []; this._ext = null; this.tipAngle = null; this.isDefaultDirection = true; }
    setPositionBySketchPoint(sp) { if (!(sp instanceof SketchPoint)) fail("A sketch point is required"); this._pts = [sp]; return true; }
    setPositionBySketchPoints(c) { this._pts = listOf(c).filter((p) => p instanceof SketchPoint); if (!this._pts.length) fail("Sketch points are required"); return true; }
    setDistanceExtent(distance) { this._ext = { depth: lenExpr(distance, "depth") }; return true; }
    setAllExtent() { this._ext = { all: true }; return true; }
  }
  class HoleFeatures extends FeatureList {
    constructor() { super("hole"); }
    createSimpleInput(diameter) { return new HoleFeatureInput("simple", diameter); }
    createCounterboreInput(holeDiameter, cboreDiameter, cboreDepth) { return new HoleFeatureInput("counterbore", holeDiameter, cboreDiameter, cboreDepth); }
    createCountersinkInput(holeDiameter, csinkDiameter, csinkAngle) { return new HoleFeatureInput("countersink", holeDiameter, csinkDiameter, csinkAngle); }
    add(input) {
      if (!input._pts.length) fail("The hole position is not defined");
      const e = input._ext || fail("The hole extent is not defined");
      const f = { type: "hole", placement: "points", sketchPoints: input._pts.map((p) => ({ sketch: p._s, point: p._id })), points: [], ...input._h, depth: e.depth || "10 mm", extent: e.all ? "all" : "distance", drillPoint: "angle", tipAngle: input.tipAngle ? angExpr(input.tipAngle) : "118 deg", flip: input.isDefaultDirection === false };
      return new HoleFeature(ses().addFeature(f, "Hole").id);
    }
  }
  class CombineFeatureInput extends Base {
    constructor(target, tools) { super(); this.targetBody = target; this.toolBodies = tools; this.operation = 0; this.isKeepToolBodies = false; this.isNewComponent = false; }
  }
  class CombineFeatures extends FeatureList {
    constructor() { super("combine"); }
    createInput(targetBody, toolBodies) { return new CombineFeatureInput(targetBody, toolBodies); }
    add(input) {
      const f = { type: "combine", target: bodyIds([input.targetBody])[0], tools: bodyIds(input.toolBodies), operation: ["join", "cut", "intersect"][input.operation] || "join", keepTools: !!input.isKeepToolBodies };
      return new CombineFeature(ses().addFeature(f, "Combine").id);
    }
  }
  class MirrorFeatures extends FeatureList {
    constructor() { super("mirror"); }
    createInput(inputEntities, mirrorPlane) { const o = new Base(); o._ents = inputEntities; o._plane = mirrorPlane; o.isCombine = false; return o; }
    add(input) {
      const f = { type: "mirror", bodies: bodyIds(input._ents), plane: planeRefOf(input._plane), operation: input.isCombine ? "join" : "new" };
      return new MirrorFeature(ses().addFeature(f, "Mirror").id);
    }
  }
  const patternEntities = (ents) => {
    const list = listOf(ents);
    if (list.length && list.every((x) => x instanceof Feature)) return { patternType: "features", features: list.map((x) => x._id), bodies: [] };
    return { bodies: bodyIds(list) };
  };
  class RectangularPatternFeatures extends FeatureList {
    constructor() { super("rpattern"); }
    createInput(inputEntities, directionOneEntity, quantityOne, distanceOne, patternDistanceType = 0) {
      const o = new Base();
      Object.assign(o, { _ents: inputEntities, _dir1: directionOneEntity, quantityOne, distanceOne, patternDistanceType, _dir2: null, quantityTwo: ValueInput.createByReal(1), distanceTwo: ValueInput.createByReal(0) });
      o.setDirectionTwo = (dir, q, d) => { o._dir2 = dir; o.quantityTwo = q; o.distanceTwo = d; return true; };
      return o;
    }
    add(input) {
      const f = { type: "rpattern", ...patternEntities(input._ents), dir1: axisOf(input._dir1), q1: countExpr(input.quantityOne), d1: lenExpr(input.distanceOne), distType: input.patternDistanceType === 1 ? "spacing" : "extent" };
      if (input._dir2) { f.dir2 = axisOf(input._dir2); f.q2 = countExpr(input.quantityTwo); f.d2 = lenExpr(input.distanceTwo); }
      return new RectangularPatternFeature(ses().addFeature(f, "Rectangular Pattern").id);
    }
  }
  class CircularPatternFeatures extends FeatureList {
    constructor() { super("cpattern"); }
    createInput(inputEntities, axis) { const o = new Base(); Object.assign(o, { _ents: inputEntities, _axis: axis, quantity: ValueInput.createByReal(3), totalAngle: ValueInput.createByString("360 deg"), isSymmetric: false }); return o; }
    add(input) {
      const f = { type: "cpattern", ...patternEntities(input._ents), axis: axisOf(input._axis), count: countExpr(input.quantity), angle: angExpr(input.totalAngle) };
      return new CircularPatternFeature(ses().addFeature(f, "Circular Pattern").id);
    }
  }
  class MoveFeatureInput extends Base {
    constructor(ents) { super(); this._ents = ents; this._t = [0, 0, 0]; this._r = [0, 0, 0]; this._pivotFix = null; }
    defineAsTranslateXYZ(x, y, z) { this._t = [lenExpr(x), lenExpr(y), lenExpr(z)]; return true; }
    defineAsTranslate(v) { this._t = [`${fmtN(v.x * CM)} mm`, `${fmtN(v.y * CM)} mm`, `${fmtN(v.z * CM)} mm`]; return true; }
    defineAsRotate(axisEntity, angle) {
      const ax = axisOf(axisEntity);
      if (ax.kind !== "origin") fail("This recreation rotates about the X, Y or Z construction axis only");
      const k = { X: 0, Y: 1, Z: 2 }[ax.name];
      this._r = [0, 0, 0];
      this._r[k] = angExpr(angle);
      this._rotAxis = { k, angle };
      return true;
    }
    defineAsFreeMove(transform) {
      const m = transform.m;
      this._t = [m[3], m[7], m[11]].map((v) => `${fmtN(v * CM)} mm`);
      const rx = Math.atan2(m[9], m[10]), ry = Math.asin(-Math.max(-1, Math.min(1, m[8]))), rz = Math.atan2(m[4], m[0]);
      this._r = [rx, ry, rz].map((a) => `${fmtN(a * RAD)} deg`);
      return true;
    }
  }
  class MoveFeatures extends FeatureList {
    constructor() { super("move"); }
    createInput(inputEntities, transform) { const i = new MoveFeatureInput(inputEntities); if (transform) i.defineAsFreeMove(transform); return i; }
    createInput2(inputEntities) { return new MoveFeatureInput(inputEntities); }
    add(input) {
      const bodies = bodyIds(input._ents);
      const f = { type: "move", bodies, copy: false };
      const zero = (v) => (v === 0 || v === undefined ? "0 mm" : v);
      [f.tx, f.ty, f.tz] = input._t.map(zero);
      [f.rx, f.ry, f.rz] = input._r.map((v) => (v === 0 || v === undefined ? "0 deg" : v));
      if (input._rotAxis) {
        // rotation about an axis through the origin: the model rotates about the bodies' centre, so add the
        // translation that moves that centre where the origin-axis rotation would put it
        const st = state();
        let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (const id of bodies) { const b = st.bodies.get(id); const bb = b && K.bboxOf(b.shape); if (bb) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); } }
        const c = mn.map((v, i) => (v + mx[i]) / 2);
        const a = (typeof input._rotAxis.angle === "number" ? input._rotAxis.angle : input._rotAxis.angle instanceof ValueInput && input._rotAxis.angle.valueType === 0 ? input._rotAxis.angle.realValue : NaN);
        if (Number.isFinite(a) && c.every(Number.isFinite)) {
          const m = new Matrix3D();
          m.setToRotation(a, new Vector3D(...K.ORIGIN_AXES["XYZ"[input._rotAxis.k]]), new Point3D());
          const q = m._apply(c, 1);
          const d = [q[0] - c[0], q[1] - c[1], q[2] - c[2]];
          [f.tx, f.ty, f.tz] = d.map((v) => `${fmtN(v)} mm`);
        }
      }
      return new MoveFeature(ses().addFeature(f, "Move").id);
    }
  }
  class Features extends Base {
    constructor() {
      super();
      this.extrudeFeatures = new ExtrudeFeatures();
      this.revolveFeatures = new RevolveFeatures();
      this.filletFeatures = new FilletFeatures();
      this.chamferFeatures = new ChamferFeatures();
      this.shellFeatures = new ShellFeatures();
      this.holeFeatures = new HoleFeatures();
      this.combineFeatures = new CombineFeatures();
      this.mirrorFeatures = new MirrorFeatures();
      this.rectangularPatternFeatures = new RectangularPatternFeatures();
      this.circularPatternFeatures = new CircularPatternFeatures();
      this.moveFeatures = new MoveFeatures();
    }
    get count() { return app.doc.features.filter((f) => f.type !== "sketch" && f.type !== "cplane").length; }
    item(i) { const f = app.doc.features.filter((x) => x.type !== "sketch" && x.type !== "cplane")[i]; return f ? featureObj(f.id) : null; }
    itemByName(n) { const f = app.doc.features.find((x) => x.name === n); return f ? featureObj(f.id) : null; }
  }

  // ------------------------------------------------------------------ parameters
  const unitKind = (u) => (/^(deg|rad)$/.test(u) ? "angle" : u === "" || u == null || u === "No Units" ? "none" : "length");
  const UNIT_MM = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8, um: 0.001 };
  class Parameter extends Base {
    constructor(name) { super(); this._n = name; }
    get name() { return this._n; }
    get _entry() { ensure(); return (app.result && app.result.params.get(this._n)) || fail(`Parameter "${this._n}" does not exist`); }
    get value() { const e = this._entry; const v = app.result.params.value(this._n); return e.kind === "angle" ? v / RAD : e.kind === "length" ? v / CM : v; }
    get unit() { const e = this._entry; return e.kind === "angle" ? "deg" : e.kind === "length" ? (app.doc.units || "mm") : ""; }
    get comment() { return this._entry.comment || ""; }
    get isFavorite() { return false; }
  }
  class UserParameter extends Parameter {
    get _up() { return app.doc.params.find((p) => p.name === this._n) || fail(`User parameter "${this._n}" does not exist`); }
    get expression() { return this._up.expr; }
    set expression(v) { ses().edit(() => { this._up.expr = String(v); }); ensure(); const r = app.result; try { r.params.value(this._n); } catch (e) { fail(`Invalid expression: ${e.message}`); } }
    get comment() { return this._up.comment || ""; }
    set comment(v) { ses().edit(() => { this._up.comment = String(v); }); }
    get unit() { const up = this._up; return up.unit || (up.kind === "angle" ? "deg" : up.kind === "none" ? "" : "mm"); }
    deleteMe() { ses().edit((doc) => { doc.params = doc.params.filter((p) => p.name !== this._n); }); return true; }
  }
  class UserParameters extends Coll {
    constructor() { super(() => app.doc.params.map((p) => new UserParameter(p.name))); }
    itemByName(n) { return app.doc.params.some((p) => p.name === n) ? new UserParameter(n) : null; }
    add(name, value, units = "mm", comment = "") {
      name = String(name || "");
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) fail(`"${name}" is not a valid parameter name`);
      ensure();
      if (app.result && app.result.params.has(name)) fail(`A parameter named "${name}" already exists`);
      const kind = unitKind(units);
      let expr;
      if (value instanceof ValueInput && value.valueType === 0) {
        const v = value.realValue;
        expr = kind === "angle" ? `${fmtN(v * RAD)} deg` : kind === "length" ? `${fmtN((v * CM) / (UNIT_MM[units] || 1))} ${units}` : fmtN(v);
      } else {
        const s = value instanceof ValueInput ? value.stringValue : String(value);
        expr = /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s.trim()) && units ? `${s.trim()} ${units}` : s;
      }
      ses().edit((doc) => { doc.params.push({ name, expr, kind, comment: String(comment || ""), unit: units || "No Units" }); });
      ensure();
      try { app.result.params.value(name); } catch (e) {
        ses().edit((doc) => { doc.params = doc.params.filter((p) => p.name !== name); });
        fail(`Invalid expression for "${name}": ${e.message}`);
      }
      return new UserParameter(name);
    }
  }
  class ModelParameter extends Parameter {
    get expression() { return this._entry.expr; }
    set expression(v) {
      const e = this._entry;
      ses().edit((doc) => {
        const f = doc.features.find((x) => x.id === e.owner);
        if (!f) return;
        if (e.cid) { const c = f.sk.constraints.find((x) => x.id === e.cid); if (c) c.expr = String(v); }
        else if (e.field) f[e.field] = String(v);
      });
    }
    get role() { return this._entry.field || "dimension"; }
  }
  class ParameterList extends Coll {
    constructor(user) { super(() => { ensure(); return [...app.result.params.entries.values()].filter((e) => (user ? e.user : !e.user)).map((e) => (e.user ? new UserParameter(e.name) : new ModelParameter(e.name))); }); }
    itemByName(n) { ensure(); const e = app.result.params.get(n); return e ? (e.user ? new UserParameter(n) : new ModelParameter(n)) : null; }
  }
  class AllParameters extends Coll {
    constructor() { super(() => { ensure(); return [...app.result.params.entries.values()].map((e) => (e.user ? new UserParameter(e.name) : new ModelParameter(e.name))); }); }
    itemByName(n) { ensure(); const e = app.result.params.get(n); return e ? (e.user ? new UserParameter(n) : new ModelParameter(n)) : null; }
  }

  // ------------------------------------------------------------------ timeline
  class TimelineObject extends Base {
    constructor(id) { super(); this._id = id; }
    get index() { return app.featureIndex(this._id); }
    get name() { return feat(this._id).name; }
    set name(v) { ses().edit(() => { feat(this._id).name = String(v); }); }
    get entity() { return featureObj(this._id); }
    get isSuppressed() { return !!feat(this._id).suppressed; }
    set isSuppressed(v) { ses().edit(() => { feat(this._id).suppressed = !!v; }); }
    get isRolledBack() { return this.index >= app.doc.marker; }
    get healthState() { ensure(); const r = app.featureResult(this._id) || {}; return r.ok === false ? 2 : r.warning ? 1 : 0; }
    rollTo(rollBefore) { ses().edit((doc) => { doc.marker = this.index + (rollBefore ? 0 : 1); }); return true; }
    get isGroup() { return false; }
  }
  class Timeline extends Coll {
    constructor() { super(() => app.doc.features.map((f) => new TimelineObject(f.id))); }
    get markerPosition() { return app.doc.marker; }
    set markerPosition(n) { ses().edit((doc) => { doc.marker = Math.max(0, Math.min(doc.features.length, Math.round(n))); }); }
    moveToBeginning() { this.markerPosition = 0; return true; }
    moveToEnd() { this.markerPosition = app.doc.features.length; return true; }
    movetoPreviousStep() { this.markerPosition = app.doc.marker - 1; return true; }
    movetoNextStep() { this.markerPosition = app.doc.marker + 1; return true; }
    deleteAllAfterMarker() { ses().edit((doc) => { doc.features.splice(doc.marker); }); return true; }
  }

  // ------------------------------------------------------------------ component / design
  class Component extends Base {
    constructor() {
      super();
      this.sketches = new Sketches();
      this.features = new Features();
      this.extrudeFeatures = this.features.extrudeFeatures;
      this.bRepBodies = new BRepBodies();
      this.constructionPlanes = new ConstructionPlanes();
      this.xYConstructionPlane = new ConstructionPlane({ kind: "origin", name: "XY" });
      this.xZConstructionPlane = new ConstructionPlane({ kind: "origin", name: "XZ" });
      this.yZConstructionPlane = new ConstructionPlane({ kind: "origin", name: "YZ" });
      this.xConstructionAxis = new ConstructionAxis("X");
      this.yConstructionAxis = new ConstructionAxis("Y");
      this.zConstructionAxis = new ConstructionAxis("Z");
      this.originConstructionPoint = new ConstructionPoint();
      this.modelParameters = new ParameterList(false);
      this.occurrences = new Coll(() => []);
      this.allOccurrences = new Coll(() => []);
    }
    get name() { return app.doc.name || "Untitled"; }
    get partNumber() { return (app.doc.pim && app.doc.pim.itemNumber) || app.doc.name || ""; }
    get description() { return (app.doc.pim && app.doc.pim.description) || ""; }
    get boundingBox() {
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (const b of app.bodies()) { const bb = K.bboxOf(b.shape); if (bb) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bb.min[i]); mx[i] = Math.max(mx[i], bb.max[i]); } }
      if (!Number.isFinite(mn[0])) mn = mx = [0, 0, 0];
      return new BoundingBox3D(P3(mn), P3(mx));
    }
    get physicalProperties() {
      let mp = null;
      try { mp = app.ui.inspect && app.ui.inspect.massProperties(app.bodies().map((b) => b.id)); } catch { mp = null; }
      return { volume: mp ? mp.volume / 1000 : 0, area: mp ? mp.area / 100 : 0, mass: mp ? mp.mass / 1000 : 0, centerOfMass: mp && mp.com ? P3(mp.com) : new Point3D(), objectType: "adsk::fusion::PhysicalProperties" };
    }
  }
  const root = new Component();
  const unitsManager = {
    get defaultLengthUnits() { return app.doc.units || "mm"; },
    get internalUnits() { return "cm"; },
    evaluateExpression(expr, units = "cm") {
      ensure();
      const kind = unitKind(units);
      const v = app.result.params.eval(String(expr), kind);
      return kind === "angle" ? v / RAD : kind === "length" ? v / CM : v;
    },
    isValidExpression(expr, units = "cm") { try { this.evaluateExpression(expr, units); return true; } catch { return false; } },
    formatInternalValue(v, units, showUnits = true) {
      const u = units || app.doc.units || "mm";
      const kind = unitKind(u);
      const out = kind === "angle" ? v * RAD : kind === "length" ? (v * CM) / (UNIT_MM[u] || 1) : v;
      return `${fmtN(Math.round(out * 1000) / 1000)}${showUnits && u ? ` ${u}` : ""}`;
    },
    convert(v, from, to) { const a = UNIT_MM[from], b = UNIT_MM[to]; if (!a || !b) fail("Unknown units"); return (v * a) / b; },
  };
  class Design extends Base {
    get rootComponent() { return root; }
    get activeComponent() { return root; }
    get allComponents() { return new Coll(() => [root]); }
    get userParameters() { return new UserParameters(); }
    get allParameters() { return new AllParameters(); }
    get timeline() { return new Timeline(); }
    get designType() { return DesignTypes.ParametricDesignType; }
    set designType(v) { if (v !== DesignTypes.ParametricDesignType) fail("This recreation supports parametric designs only"); }
    get unitsManager() { return unitsManager; }
    get fusionUnitsManager() { return unitsManager; }
    get productType() { return "DesignProductType"; }
    get parentDocument() { return host.document; }
    computeAll() { ensure(); app.evaluator.invalidate(); app.recompute(); return true; }
    activateRootComponent() { return true; }
  }
  const design = new Design();
  // adsk.fusion.Design(obj) (old JavaScript API cast) and Design.cast(obj)
  const DesignCast = function (o) { return o === design ? design : null; };
  DesignCast.cast = (o) => (o === design ? design : null);

  // minification-safe objectType names
  const NAMES = [[ConstructionPlane, "ConstructionPlane"], [ConstructionAxis, "ConstructionAxis"], [ConstructionPoint, "ConstructionPoint"], [ConstructionPlaneInput, "ConstructionPlaneInput"], [Sketch, "Sketch"], [SketchPoint, "SketchPoint"], [SketchLine, "SketchLine"], [SketchCircle, "SketchCircle"], [SketchArc, "SketchArc"], [SketchFittedSpline, "SketchFittedSpline"], [SketchEllipse, "SketchEllipse"], [Profile, "Profile"], [BRepBody, "BRepBody"], [BRepFace, "BRepFace"], [BRepEdge, "BRepEdge"], [ExtrudeFeature, "ExtrudeFeature"], [RevolveFeature, "RevolveFeature"], [FilletFeature, "FilletFeature"], [ChamferFeature, "ChamferFeature"], [ShellFeature, "ShellFeature"], [HoleFeature, "HoleFeature"], [CombineFeature, "CombineFeature"], [MirrorFeature, "MirrorFeature"], [RectangularPatternFeature, "RectangularPatternFeature"], [CircularPatternFeature, "CircularPatternFeature"], [MoveFeature, "MoveFeature"], [ExtrudeFeatureInput, "ExtrudeFeatureInput"], [UserParameter, "UserParameter"], [ModelParameter, "ModelParameter"], [TimelineObject, "TimelineObject"], [Timeline, "Timeline"], [Component, "Component"], [Design, "Design"], [DistanceExtentDefinition, "DistanceExtentDefinition"], [ThroughAllExtentDefinition, "ThroughAllExtentDefinition"]];
  for (const [c, n] of NAMES) c._t = `adsk::fusion::${n}`;

  /** Wrap an app selection ref as an API object (for ui.activeSelections / selectEntity). */
  function wrapRef(r) {
    if (!r) return null;
    switch (r.kind) {
      case "body": return new BRepBody(r.body);
      case "face": return r.index >= 0 ? new BRepFace(r.body, r.index) : null;
      case "edge": return r.index >= 0 ? new BRepEdge(r.body, r.index) : null;
      case "profile": { const s = state().sketches.get(r.sketch); const rg = s && s.regions.regions.find((x) => x.key === r.key); return rg ? new Profile(r.sketch, r.key, r.c || interior(rg)) : null; }
      case "sketchCurve": return curveObj(r.sketch, r.curve);
      case "sketchPoint": return new SketchPoint(r.sketch, r.point);
      case "originPlane": return new ConstructionPlane({ kind: "origin", name: r.name });
      case "originAxis": return new ConstructionAxis(r.name);
      case "cplane": return new ConstructionPlane({ kind: "cplane", id: r.id });
      case "feature": return featureObj(r.id);
      default: return null;
    }
  }
  function refOf(o) {
    if (o instanceof BRepBody) return { kind: "body", body: o._id };
    if (o instanceof BRepFace) return o._ref();
    if (o instanceof BRepEdge) return o._ref();
    if (o instanceof Profile) return { kind: "profile", sketch: o._s, key: o._key, c: o._c };
    if (o instanceof SketchPoint) return { kind: "sketchPoint", sketch: o._s, point: o._id };
    if (o instanceof SketchCurve) return { kind: "sketchCurve", sketch: o._s, curve: o._id };
    if (o instanceof ConstructionPlane) return o._ref.kind === "origin" ? { kind: "originPlane", name: o._ref.name } : { kind: "cplane", id: o._ref.id };
    if (o instanceof ConstructionAxis) return { kind: "originAxis", name: o._name };
    if (o instanceof Feature || o instanceof Sketch) return { kind: "feature", id: o._id };
    return null;
  }

  const ns = {
    Design: DesignCast, FeatureOperations, ExtentDirections, PatternDistanceType, DimensionOrientations, DesignTypes, FeatureHealthStates, BooleanTypes, HoleEdgePositions,
    DistanceExtentDefinition, ThroughAllExtentDefinition, ProfilePlaneStartDefinition, OffsetStartDefinition,
    Sketch, SketchPoint, SketchLine, SketchCircle, SketchArc, SketchFittedSpline, Profile, BRepBody, BRepFace, BRepEdge,
    ExtrudeFeature, RevolveFeature, FilletFeature, ChamferFeature, ShellFeature, HoleFeature, CombineFeature, MirrorFeature,
    RectangularPatternFeature, CircularPatternFeature, MoveFeature, ConstructionPlane, ConstructionAxis, UserParameter, ModelParameter, Component, TimelineObject,
  };
  for (const k of Object.keys(ns)) {
    const C = ns[k];
    if (typeof C === "function" && C !== DesignCast && !C.cast) C.cast = (o) => (o instanceof C ? o : null);
  }
  return { ns, design, root, wrapRef, refOf };
}
