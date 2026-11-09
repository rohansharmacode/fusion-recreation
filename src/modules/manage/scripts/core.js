// adsk.core for the recreation's JavaScript script API: geometry value types (Point3D, Vector3D,
// Matrix3D, ...), ValueInput, ObjectCollection, events and enums, modelled on the Fusion API object
// model (names and signatures from the public Fusion API reference). Internal units are Fusion's:
// centimetres and radians.

export class Base {
  get objectType() { return this.constructor._t || "adsk::core::Base"; }
  get isValid() { return true; }
  static cast(o) { return o instanceof this ? o : null; }
  toString() { return `[${this.objectType}]`; }
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export class Point2D extends Base {
  constructor(x = 0, y = 0) { super(); this.x = num(x); this.y = num(y); }
  static create(x = 0, y = 0) { return new Point2D(x, y); }
  copy() { return new Point2D(this.x, this.y); }
  distanceTo(p) { return Math.hypot(p.x - this.x, p.y - this.y); }
  isEqualTo(p) { return this.distanceTo(p) < 1e-10; }
  asArray() { return [this.x, this.y]; }
  getData() { return [true, this.x, this.y]; }
  set(x, y) { this.x = num(x); this.y = num(y); return true; }
  translateBy(v) { this.x += v.x; this.y += v.y; return true; }
}

export class Point3D extends Base {
  constructor(x = 0, y = 0, z = 0) { super(); this.x = num(x); this.y = num(y); this.z = num(z); }
  static create(x = 0, y = 0, z = 0) { return new Point3D(x, y, z); }
  copy() { return new Point3D(this.x, this.y, this.z); }
  distanceTo(p) { return Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z); }
  isEqualTo(p) { return this.distanceTo(p) < 1e-10; }
  isEqualToByTolerance(p, tol) { return this.distanceTo(p) <= tol; }
  vectorTo(p) { return new Vector3D(p.x - this.x, p.y - this.y, p.z - this.z); }
  translateBy(v) { this.x += v.x; this.y += v.y; this.z += v.z; return true; }
  transformBy(m) { const [x, y, z] = m._apply([this.x, this.y, this.z], 1); this.x = x; this.y = y; this.z = z; return true; }
  asArray() { return [this.x, this.y, this.z]; }
  asVector() { return new Vector3D(this.x, this.y, this.z); }
  getData() { return [true, this.x, this.y, this.z]; }
  set(x, y, z) { this.x = num(x); this.y = num(y); this.z = num(z); return true; }
  setWithArray(a) { return this.set(a[0], a[1], a[2]); }
}

export class Vector2D extends Base {
  constructor(x = 0, y = 0) { super(); this.x = num(x); this.y = num(y); }
  static create(x = 0, y = 0) { return new Vector2D(x, y); }
  get length() { return Math.hypot(this.x, this.y); }
  normalize() { const l = this.length; if (l < 1e-15) return false; this.x /= l; this.y /= l; return true; }
  scaleBy(s) { this.x *= s; this.y *= s; return true; }
  copy() { return new Vector2D(this.x, this.y); }
  asArray() { return [this.x, this.y]; }
}

export class Vector3D extends Base {
  constructor(x = 0, y = 0, z = 0) { super(); this.x = num(x); this.y = num(y); this.z = num(z); }
  static create(x = 0, y = 0, z = 0) { return new Vector3D(x, y, z); }
  get length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const l = this.length; if (l < 1e-15) return false; this.x /= l; this.y /= l; this.z /= l; return true; }
  scaleBy(s) { this.x *= s; this.y *= s; this.z *= s; return true; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return true; }
  subtract(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return true; }
  dotProduct(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  crossProduct(v) { return new Vector3D(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x); }
  angleTo(v) { const d = this.length * v.length; return d < 1e-15 ? 0 : Math.acos(Math.max(-1, Math.min(1, this.dotProduct(v) / d))); }
  isParallelTo(v) { return this.crossProduct(v).length < 1e-9 * Math.max(1, this.length * v.length); }
  isPerpendicularTo(v) { return Math.abs(this.dotProduct(v)) < 1e-9 * Math.max(1, this.length * v.length); }
  isEqualTo(v) { return Math.hypot(v.x - this.x, v.y - this.y, v.z - this.z) < 1e-10; }
  copy() { return new Vector3D(this.x, this.y, this.z); }
  asPoint() { return new Point3D(this.x, this.y, this.z); }
  asArray() { return [this.x, this.y, this.z]; }
  transformBy(m) { const [x, y, z] = m._apply([this.x, this.y, this.z], 0); this.x = x; this.y = y; this.z = z; return true; }
  getData() { return [true, this.x, this.y, this.z]; }
  set(x, y, z) { this.x = num(x); this.y = num(y); this.z = num(z); return true; }
}

/** 4x4 transform, row-major cells (Fusion's Matrix3D: getCell(row, col)). Translation in cm. */
export class Matrix3D extends Base {
  constructor(cells) { super(); this.m = cells ? [...cells] : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  static create() { return new Matrix3D(); }
  copy() { return new Matrix3D(this.m); }
  setToIdentity() { this.m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; return true; }
  getCell(r, c) { return this.m[r * 4 + c]; }
  setCell(r, c, v) { this.m[r * 4 + c] = num(v); return true; }
  asArray() { return [...this.m]; }
  setWithArray(a) { if (!a || a.length !== 16) return false; this.m = a.map((x) => num(x)); return true; }
  get translation() { return new Vector3D(this.m[3], this.m[7], this.m[11]); }
  set translation(v) { this.m[3] = v.x; this.m[7] = v.y; this.m[11] = v.z; }
  get determinant() {
    const m = this.m;
    return m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
  }
  _apply(p, w) {
    const m = this.m;
    return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3] * w, m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7] * w, m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11] * w];
  }
  /** this = other * this (Fusion: transformBy applies `other` after this transform). */
  transformBy(o) {
    const a = o.m, b = this.m, r = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
    this.m = r;
    return true;
  }
  /** Rotation of `angle` radians about the axis through `origin`. */
  setToRotation(angle, axis, origin) {
    const l = Math.hypot(axis.x, axis.y, axis.z) || 1;
    const x = axis.x / l, y = axis.y / l, z = axis.z / l;
    const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    const R = [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
    const o = origin || { x: 0, y: 0, z: 0 };
    const tx = o.x - (R[0] * o.x + R[1] * o.y + R[2] * o.z);
    const ty = o.y - (R[3] * o.x + R[4] * o.y + R[5] * o.z);
    const tz = o.z - (R[6] * o.x + R[7] * o.y + R[8] * o.z);
    this.m = [R[0], R[1], R[2], tx, R[3], R[4], R[5], ty, R[6], R[7], R[8], tz, 0, 0, 0, 1];
    return true;
  }
  invert() {
    // rigid / affine inverse of the 3x4 part
    const m = this.m;
    const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
    const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
    if (Math.abs(det) < 1e-15) return false;
    const inv = [
      (a[4] * a[8] - a[5] * a[7]) / det, (a[2] * a[7] - a[1] * a[8]) / det, (a[1] * a[5] - a[2] * a[4]) / det,
      (a[5] * a[6] - a[3] * a[8]) / det, (a[0] * a[8] - a[2] * a[6]) / det, (a[2] * a[3] - a[0] * a[5]) / det,
      (a[3] * a[7] - a[4] * a[6]) / det, (a[1] * a[6] - a[0] * a[7]) / det, (a[0] * a[4] - a[1] * a[3]) / det,
    ];
    const t = [m[3], m[7], m[11]];
    const ti = [0, 1, 2].map((r) => -(inv[r * 3] * t[0] + inv[r * 3 + 1] * t[1] + inv[r * 3 + 2] * t[2]));
    this.m = [inv[0], inv[1], inv[2], ti[0], inv[3], inv[4], inv[5], ti[1], inv[6], inv[7], inv[8], ti[2], 0, 0, 0, 1];
    return true;
  }
  isEqualTo(o) { return this.m.every((v, i) => Math.abs(v - o.m[i]) < 1e-10); }
}

export class BoundingBox3D extends Base {
  constructor(min, max) { super(); this.minPoint = min || new Point3D(); this.maxPoint = max || new Point3D(); }
  static create(min, max) { return new BoundingBox3D(min.copy(), max.copy()); }
  contains(p) { return p.x >= this.minPoint.x && p.y >= this.minPoint.y && p.z >= this.minPoint.z && p.x <= this.maxPoint.x && p.y <= this.maxPoint.y && p.z <= this.maxPoint.z; }
  copy() { return new BoundingBox3D(this.minPoint.copy(), this.maxPoint.copy()); }
}

export const ValueTypes = { RealValueType: 0, StringValueType: 1, BooleanValueType: 2, ObjectValueType: 3 };
export class ValueInput extends Base {
  constructor(type, v) { super(); this.valueType = type; this._v = v; }
  static createByReal(v) { return new ValueInput(ValueTypes.RealValueType, num(v)); }
  static createByString(s) { return new ValueInput(ValueTypes.StringValueType, String(s)); }
  static createByBoolean(b) { return new ValueInput(ValueTypes.BooleanValueType, !!b); }
  static createByObject(o) { return new ValueInput(ValueTypes.ObjectValueType, o); }
  get realValue() { return this.valueType === ValueTypes.RealValueType ? this._v : 0; }
  get stringValue() { return this.valueType === ValueTypes.StringValueType ? this._v : ""; }
  get booleanValue() { return this.valueType === ValueTypes.BooleanValueType ? this._v : false; }
  get objectValue() { return this.valueType === ValueTypes.ObjectValueType ? this._v : null; }
}

export class ObjectCollection extends Base {
  constructor(items) { super(); this._a = items ? [...items] : []; }
  static create() { return new ObjectCollection(); }
  static createWithArray(a) { return new ObjectCollection(a || []); }
  get count() { return this._a.length; }
  item(i) { return this._a[i] ?? null; }
  add(o) { this._a.push(o); return true; }
  removeByIndex(i) { if (i < 0 || i >= this._a.length) return false; this._a.splice(i, 1); return true; }
  removeByItem(o) { const i = this._a.indexOf(o); return i >= 0 ? this.removeByIndex(i) : false; }
  contains(o) { return this._a.includes(o); }
  find(o, start = 0) { return this._a.indexOf(o, start); }
  clear() { this._a = []; return true; }
  asArray() { return [...this._a]; }
  [Symbol.iterator]() { return this._a[Symbol.iterator](); }
}

/** Fusion events: add(handler) / remove(handler); handlers are functions or objects with notify(args). */
export class Event extends Base {
  constructor(name) { super(); this.name = name; this._h = []; }
  add(h) { if (!h) return false; this._h.push(h); return true; }
  remove(h) { const i = this._h.indexOf(h); if (i < 0) return false; this._h.splice(i, 1); return true; }
  get count() { return this._h.length; }
  _fire(args) {
    for (const h of [...this._h]) {
      if (typeof h === "function") h(args);
      else if (h && typeof h.notify === "function") h.notify(args);
    }
  }
}

export const DialogResults = { DialogError: -1, DialogOK: 0, DialogCancel: 1, DialogYes: 2, DialogNo: 3 };
export const MessageBoxButtonTypes = { OKButtonType: 0, OKCancelButtonType: 1, RetryCancelButtonType: 2, YesNoButtonType: 3, YesNoCancelButtonType: 4 };
export const MessageBoxIconTypes = { NoIconIconType: 0, QuestionIconType: 1, InformationIconType: 2, WarningIconType: 3, CriticalIconType: 4 };
export const LogLevels = { InfoLogLevel: 0, WarningLogLevel: 1, ErrorLogLevel: 2 };
export const LogTypes = { ConsoleLogType: 0, FileLogType: 1 };
export const SurfaceTypes = { PlaneSurfaceType: 0, CylinderSurfaceType: 1, ConeSurfaceType: 2, SphereSurfaceType: 3, TorusSurfaceType: 4, EllipticalCylinderSurfaceType: 5, EllipticalConeSurfaceType: 6, NurbsSurfaceType: 7 };
export const Curve3DTypes = { Line3DCurveType: 0, Arc3DCurveType: 1, Circle3DCurveType: 2, Ellipse3DCurveType: 3, EllipticalArc3DCurveType: 4, InfiniteLine3DCurveType: 5, NurbsCurve3DCurveType: 6 };
export const DropDownStyles = { TextListDropDownStyle: 0, LabeledIconDropDownStyle: 1, CheckBoxDropDownStyle: 2 };

// names survive minification (release builds rename classes)
for (const [c, n] of [[Point2D, "Point2D"], [Point3D, "Point3D"], [Vector2D, "Vector2D"], [Vector3D, "Vector3D"], [Matrix3D, "Matrix3D"], [BoundingBox3D, "BoundingBox3D"], [ValueInput, "ValueInput"], [ObjectCollection, "ObjectCollection"], [Event, "Event"]]) c._t = `adsk::core::${n}`;

/** adsk.core namespace object (Application / UserInterface are attached by the host per run). */
export function makeCore(extra = {}) {
  return {
    Base, Point2D, Point3D, Vector2D, Vector3D, Matrix3D, BoundingBox3D, ValueInput, ObjectCollection, Event,
    ValueTypes, DialogResults, MessageBoxButtonTypes, MessageBoxIconTypes, LogLevels, LogTypes, SurfaceTypes, Curve3DTypes, DropDownStyles,
    ...extra,
  };
}
