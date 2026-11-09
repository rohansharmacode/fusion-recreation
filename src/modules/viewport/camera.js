// Camera rig: one logical camera state {target, quat, dist} driving a perspective and an
// orthographic THREE camera. World is Z-up (mm). The rig owns navigation maths (orbit, pan,
// zoom-to-point, fit, standard views) and smooth animated transitions.
import * as THREE from "three";

const V3 = THREE.Vector3;
const Q = THREE.Quaternion;
const EPS = 1e-9;

// Standard view tokens -> outward direction (from target towards the camera).
export const VIEW_AXES = {
  front: [0, -1, 0], back: [0, 1, 0], right: [1, 0, 0], left: [-1, 0, 0], top: [0, 0, 1], bottom: [0, 0, -1],
};

/** Direction (target -> eye) for a view name like "front", "top-right", "front-right-top", "home". */
export function viewDirection(name) {
  if (!name || name === "home" || name === "iso") return new V3(1, -1, 1).normalize();
  const d = new V3();
  for (const tok of String(name).toLowerCase().split(/[-_\s]+/)) {
    const a = VIEW_AXES[tok];
    if (a) d.add(new V3(...a));
  }
  if (d.lengthSq() < EPS) return new V3(1, -1, 1).normalize();
  return d.normalize();
}

/** Quaternion of a camera whose eye sits along `back` (target->eye) with `up` as screen-up hint. */
export function quatFromBackUp(back, up) {
  const z = back.clone().normalize();
  let u = up.clone();
  if (Math.abs(u.dot(z)) > 0.9999) {
    // degenerate: pick any perpendicular hint
    u = Math.abs(z.z) < 0.9 ? new V3(0, 0, 1) : new V3(0, 1, 0);
  }
  const x = new V3().crossVectors(u, z).normalize();
  const y = new V3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new Q().setFromRotationMatrix(m);
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  constructor(opts = {}) {
    this.fov = opts.fov || 30;
    this.persp = new THREE.PerspectiveCamera(this.fov, 1, 0.1, 1e6);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e5, 1e5);
    this.persp.up.set(0, 0, 1);
    this.ortho.up.set(0, 0, 1);
    this.target = new V3(0, 0, 0);
    this.quat = quatFromBackUp(new V3(1, -1, 1), new V3(0, 0, 1));
    this.dist = 300;
    this.mode = "persp"; // 'persp' | 'ortho' | 'perspOrtho'
    this.width = 1;
    this.height = 1;
    this.scene = { center: new V3(), radius: 100 };
    this.anim = null;
    this.version = 0; // bumps on every camera change (used for caches)
    this.minDist = 1e-3;
    this.maxDist = 5e6;
    this.update();
  }

  // ----- derived vectors -----
  forward(out = new V3()) { return out.set(0, 0, -1).applyQuaternion(this.quat); }
  back(out = new V3()) { return out.set(0, 0, 1).applyQuaternion(this.quat); }
  up(out = new V3()) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  right(out = new V3()) { return out.set(1, 0, 0).applyQuaternion(this.quat); }
  position(out = new V3()) { return this.back(out).multiplyScalar(this.dist).add(this.target); }

  /** True when looking straight along a world axis (face-on standard view). */
  isAxisAligned(tol = 1e-3) {
    const b = this.back();
    const ax = Math.max(Math.abs(b.x), Math.abs(b.y), Math.abs(b.z));
    return ax > 1 - tol;
  }
  get useOrtho() { return this.mode === "ortho" || (this.mode === "perspOrtho" && this.isAxisAligned()); }
  get camera() { return this.useOrtho ? this.ortho : this.persp; }

  setSize(w, h) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.update();
  }

  setSceneBounds(center, radius) {
    this.scene.center.copy(center);
    this.scene.radius = Math.max(1e-3, radius);
    this.update();
  }

  /** Visible half-height (world units) at the target distance. */
  halfHeight() { return this.dist * Math.tan(THREE.MathUtils.degToRad(this.fov) / 2); }

  /** Sync both THREE cameras from the logical state. */
  update() {
    const pos = this.position();
    const aspect = this.width / this.height;
    const r = this.scene.radius;
    const dc = pos.distanceTo(this.scene.center);
    for (const c of [this.persp, this.ortho]) {
      c.position.copy(pos);
      c.quaternion.copy(this.quat);
      c.up.copy(this.up());
    }
    const p = this.persp;
    p.aspect = aspect;
    p.fov = this.fov;
    const far = Math.max(dc + r * 3, this.dist * 60);
    let near = Math.min(this.dist * 0.02, Math.max(dc - r * 1.2, 0) * 0.8);
    near = Math.max(near, this.dist * 0.002, far * 1e-6, 1e-4);
    p.near = near;
    p.far = far;
    p.updateProjectionMatrix();
    const o = this.ortho;
    const hh = this.halfHeight();
    o.left = -hh * aspect; o.right = hh * aspect; o.top = hh; o.bottom = -hh;
    o.near = -(dc + r * 3 + this.dist * 10);
    o.far = dc + r * 3 + this.dist * 60;
    o.updateProjectionMatrix();
    p.updateMatrixWorld(true);
    o.updateMatrixWorld(true);
    this.version++;
  }

  /** World size of one CSS pixel at point p. */
  pixelSize(p) {
    if (this.useOrtho) return (2 * this.halfHeight()) / this.height;
    const pos = this.position();
    const f = this.forward();
    const depth = Math.max(1e-6, new V3().subVectors(p, pos).dot(f));
    return (2 * depth * Math.tan(THREE.MathUtils.degToRad(this.fov) / 2)) / this.height;
  }

  // ----- state snapshots / animation -----
  state() { return { target: this.target.clone(), quat: this.quat.clone(), dist: this.dist }; }
  setState(s) {
    this.cancelAnim();
    if (s.target) this.target.copy(s.target);
    if (s.quat) this.quat.copy(s.quat).normalize();
    if (s.dist) this.dist = THREE.MathUtils.clamp(s.dist, this.minDist, this.maxDist);
    this.update();
  }

  cancelAnim() {
    if (this.anim) {
      const a = this.anim;
      this.anim = null;
      a.resolve(false);
    }
  }

  /** Animate to a state {target, quat, dist}; resolves when done (true) or cancelled (false). */
  animateTo(s, ms = 300) {
    this.cancelAnim();
    const to = {
      target: (s.target || this.target).clone(),
      quat: (s.quat || this.quat).clone().normalize(),
      dist: THREE.MathUtils.clamp(s.dist || this.dist, this.minDist, this.maxDist),
    };
    const from = this.state();
    const same = from.target.distanceTo(to.target) < 1e-9 * (1 + to.dist) && Math.abs(from.quat.dot(to.quat)) > 1 - 1e-12 && Math.abs(from.dist - to.dist) < 1e-9 * to.dist;
    if (!ms || same) {
      this.setState(to);
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      this.anim = { from, to, t0: performance.now(), ms, resolve };
    });
  }

  /** Advance an animation; returns true while animating. */
  tick(now) {
    const a = this.anim;
    if (!a) return false;
    const t = Math.min(1, (now - a.t0) / a.ms);
    const e = easeInOut(t);
    this.target.lerpVectors(a.from.target, a.to.target, e);
    this.quat.slerpQuaternions(a.from.quat, a.to.quat, e);
    this.dist = Math.exp(Math.log(a.from.dist) + (Math.log(a.to.dist) - Math.log(a.from.dist)) * e);
    this.update();
    if (t >= 1) {
      this.anim = null;
      a.resolve(true);
      return true; // render the final frame
    }
    return true;
  }

  // ----- navigation primitives (immediate) -----
  /** Turntable orbit about the target keeping world Z up. dx, dy in pixels. */
  orbitTurntable(dx, dy, speed = 0.0065) {
    this.cancelAnim();
    const yaw = -dx * speed;
    let pitch = -dy * speed;
    // clamp pitch so the camera never flips over the poles
    const b = this.back();
    const u = this.up();
    if (u.z >= -1e-6) {
      const elev = Math.asin(THREE.MathUtils.clamp(b.z, -1, 1));
      const lim = Math.PI / 2 - 1e-4;
      // elevation after pitch ~= elev - pitch
      const ne = THREE.MathUtils.clamp(elev - pitch, -lim, lim);
      pitch = elev - ne;
    }
    const qYaw = new Q().setFromAxisAngle(new V3(0, 0, 1), yaw);
    const qPitch = new Q().setFromAxisAngle(new V3(1, 0, 0), pitch);
    this.quat.premultiply(qYaw).multiply(qPitch).normalize();
    this.update();
  }

  /** Free (trackball) orbit about the target: rotate about the screen axes. */
  orbitFree(dx, dy, speed = 0.0065) {
    this.cancelAnim();
    const qa = new Q().setFromAxisAngle(new V3(0, 1, 0), -dx * speed);
    const qb = new Q().setFromAxisAngle(new V3(1, 0, 0), -dy * speed);
    this.quat.multiply(qa).multiply(qb).normalize();
    this.update();
  }

  /** Roll about the view axis (radians). */
  roll(angle) {
    this.cancelAnim();
    this.quat.multiply(new Q().setFromAxisAngle(new V3(0, 0, 1), angle)).normalize();
    this.update();
  }

  /** Pan so that content at world point `at` follows the cursor by (dx, dy) pixels. */
  pan(dx, dy, at) {
    this.cancelAnim();
    const ps = this.pixelSize(at || this.target);
    const r = this.right().multiplyScalar(-dx * ps);
    const u = this.up().multiplyScalar(dy * ps);
    this.target.add(r).add(u);
    this.update();
  }

  /** Scale the camera about world point p by factor f (f<1 zooms in). */
  zoomAbout(p, f) {
    this.cancelAnim();
    const nd = THREE.MathUtils.clamp(this.dist * f, this.minDist, this.maxDist);
    f = nd / this.dist;
    if (!p) { this.dist = nd; this.update(); return; }
    // keep p fixed on screen: target' = p + (target - p) * f
    this.target.sub(p).multiplyScalar(f).add(p);
    this.dist = nd;
    this.update();
  }

  // ----- framing -----
  /** State that frames a sphere (center c, radius r) from the current (or given) orientation. */
  fitState(c, r, quat = this.quat) {
    const aspect = this.width / this.height;
    const vf = THREE.MathUtils.degToRad(this.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * aspect);
    const half = Math.min(vf, hf);
    const dist = (Math.max(r, 1e-3) / Math.sin(half)) * 1.12;
    return { target: c.clone(), quat: quat.clone(), dist };
  }

  /** Orientation for a named view. opts.upHint overrides screen-up for top/bottom. */
  viewQuat(name, opts = {}) {
    const back = viewDirection(name);
    let up;
    if (Math.abs(back.z) > 0.999) {
      if (opts.minimalRoll) {
        // pick the axis (±X, ±Y) closest to the current screen-up for the least spin
        const cu = this.up();
        const cands = [new V3(0, 1, 0), new V3(1, 0, 0), new V3(-1, 0, 0), new V3(0, -1, 0)];
        if (back.z < 0) cands.unshift(cands.splice(3, 1)[0]); // prefer -Y for bottom on ties
        let best = cands[0], bs = -Infinity;
        for (const c of cands) {
          const s = c.dot(cu) + (c === cands[0] ? 0.02 : 0);
          if (s > bs) { bs = s; best = c; }
        }
        up = best;
      } else {
        up = back.z > 0 ? new V3(0, 1, 0) : new V3(0, -1, 0);
      }
    } else {
      up = new V3(0, 0, 1);
    }
    return quatFromBackUp(back, up);
  }
}
