// T-spline primitives (Box, Plane, Cylinder, Sphere, Torus, Quadball, Pipe, Face) and cages built from curves
// (Extrude, Revolve, Sweep, Loft). Frames are {o, x, n} planes (y = n x x). Round primitives and curve-based
// bodies are fitted so the smooth surface passes through the requested geometry (control frame outside).
import { V, tidy, orient, compact } from "./cage.js";
import { fitToTargets } from "./ops.js";

const Y = (pl) => V.cross(pl.n, pl.x);
const W = (pl, c, x, y, z) => { const yy = Y(pl); return V.add(c, V.add(V.add(V.mul(pl.x, x), V.mul(yy, y)), V.mul(pl.n, z))); };
const cage = (v, f, extra = {}) => tidy({ v, f, crease: [], cv: [], frozen: [], iso: [], sym: null, ...extra });
const mirrorPlanes = (pl, c, which, hc) => {
  const out = [];
  if (which.length) out.push({ o: c.slice(), n: pl.x.slice() });
  if (which.width) out.push({ o: c.slice(), n: Y(pl) });
  if (which.height) out.push({ o: V.add(c, V.mul(pl.n, hc)), n: pl.n.slice() });
  return out;
};
const symOf = (pl, c, sym, hc, count) => {
  if (!sym || sym.type === "none") return null;
  if (sym.type === "circular") return { type: "circular", o: V.add(c, V.mul(pl.n, hc)), d: pl.n.slice(), count };
  const planes = mirrorPlanes(pl, c, sym, hc);
  return planes.length ? { type: "mirror", planes } : null;
};

/** Box: base rectangle centred on c in the plane, height along n ('one' side or 'sym'metric). Cage = the box. */
export function box({ pl, c, L, Wd, H, nl, nw, nh, dir = "one", sym = null }) {
  nl = Math.max(1, nl | 0); nw = Math.max(1, nw | 0); nh = Math.max(1, nh | 0);
  const z0 = dir === "sym" ? -H / 2 : 0;
  const N = [nl, nw, nh], S = [L, Wd, H], O = [-L / 2, -Wd / 2, z0];
  const id = new Map(), v = [];
  const vid = (i, j, k) => {
    const key = `${i},${j},${k}`;
    if (!id.has(key)) { id.set(key, v.length); v.push(W(pl, c, O[0] + (S[0] * i) / N[0], O[1] + (S[1] * j) / N[1], O[2] + (S[2] * k) / N[2])); }
    return id.get(key);
  };
  const f = [];
  // side with axis a fixed at s (0 or N[a]); (u, v) right-handed with u x v = +a
  const pairs = [[1, 2], [2, 0], [0, 1]];
  for (let a = 0; a < 3; a++) {
    const [u, w] = pairs[a];
    for (const s of [0, N[a]]) {
      for (let i = 0; i < N[u]; i++) for (let j = 0; j < N[w]; j++) {
        const at = (di, dj) => { const q = [0, 0, 0]; q[a] = s; q[u] = i + di; q[w] = j + dj; return vid(q[0], q[1], q[2]); };
        const quad = [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
        f.push(s === 0 ? quad.reverse() : quad);
      }
    }
  }
  return cage(v, f, { sym: symOf(pl, c, sym, z0 + H / 2) });
}

/** Plane: flat L x W grid (normal = plane normal). */
export function plane({ pl, c, L, Wd, nl, nw, sym = null }) {
  nl = Math.max(1, nl | 0); nw = Math.max(1, nw | 0);
  const v = [], f = [];
  for (let i = 0; i <= nl; i++) for (let j = 0; j <= nw; j++) v.push(W(pl, c, -L / 2 + (L * i) / nl, -Wd / 2 + (Wd * j) / nw, 0));
  const at = (i, j) => i * (nw + 1) + j;
  for (let i = 0; i < nl; i++) for (let j = 0; j < nw; j++) f.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
  return cage(v, f, { sym: symOf(pl, c, sym ? { ...sym, height: false } : null, 0) });
}

/** Open cylinder (no caps, like Fusion's T-spline cylinder). */
export function cylinder({ pl, c, D, nd, H, nh, dir = "one", sym = null }) {
  nd = Math.max(3, nd | 0); nh = Math.max(1, nh | 0);
  const R = D / 2, z0 = dir === "sym" ? -H / 2 : 0;
  const v = [], f = [], tg = [];
  for (let k = 0; k <= nh; k++) for (let i = 0; i < nd; i++) {
    const a = (2 * Math.PI * i) / nd, z = z0 + (H * k) / nh;
    v.push(W(pl, c, R * Math.cos(a), R * Math.sin(a), z));
  }
  const at = (k, i) => k * nd + (i % nd);
  for (let k = 0; k < nh; k++) for (let i = 0; i < nd; i++) f.push([at(k, i), at(k, i + 1), at(k + 1, i + 1), at(k + 1, i)]);
  for (const p of v) tg.push(p.slice());
  const out = cage(v, f, { sym: symOf(pl, c, sym, z0 + H / 2, nd) });
  return fitToTargets(out, tg, 12);
}

/** UV sphere: nlong around, nlat bands, triangle fans at the poles. */
export function sphere({ pl, c, D, nlong, nlat, sym = null }) {
  nlong = Math.max(3, nlong | 0); nlat = Math.max(2, nlat | 0);
  const R = D / 2;
  const v = [W(pl, c, 0, 0, -R)];
  for (let j = 1; j < nlat; j++) {
    const ph = -Math.PI / 2 + (Math.PI * j) / nlat;
    for (let i = 0; i < nlong; i++) { const a = (2 * Math.PI * i) / nlong; v.push(W(pl, c, R * Math.cos(ph) * Math.cos(a), R * Math.cos(ph) * Math.sin(a), R * Math.sin(ph))); }
  }
  v.push(W(pl, c, 0, 0, R));
  const top = v.length - 1;
  const at = (j, i) => 1 + (j - 1) * nlong + (i % nlong);
  const f = [];
  for (let i = 0; i < nlong; i++) f.push([0, at(1, i + 1), at(1, i)]);
  for (let j = 1; j < nlat - 1; j++) for (let i = 0; i < nlong; i++) f.push([at(j, i), at(j, i + 1), at(j + 1, i + 1), at(j + 1, i)]);
  for (let i = 0; i < nlong; i++) f.push([at(nlat - 1, i), at(nlat - 1, i + 1), top]);
  const out = orient(cage(v, f, { sym: symOf(pl, c, sym, 0, nlong) }));
  return fitToTargets(out, v.map((p) => p.slice()), 14);
}

/** Torus: D1 = centre-circle diameter (n1 faces), D2 = tube diameter (n2 faces). */
export function torus({ pl, c, D1, n1, D2, n2, sym = null }) {
  n1 = Math.max(3, n1 | 0); n2 = Math.max(3, n2 | 0);
  const R = D1 / 2, r = D2 / 2;
  const v = [];
  for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) {
    const ph = (2 * Math.PI * i) / n1, th = (2 * Math.PI * j) / n2;
    const rr = R + r * Math.cos(th);
    v.push(W(pl, c, rr * Math.cos(ph), rr * Math.sin(ph), r * Math.sin(th)));
  }
  const at = (i, j) => (i % n1) * n2 + (j % n2);
  const f = [];
  for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) f.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
  const out = cage(v, f, { sym: symOf(pl, c, sym, 0, n1) });
  return fitToTargets(out, v.map((p) => p.slice()), 14);
}

/** Quadball: a cube of span x span faces per side pushed onto a sphere (eight valence-3 star points, no poles). */
export function quadball({ pl, c, D, span, sym = null }) {
  span = Math.max(1, span | 0);
  const b = box({ pl, c: [0, 0, 0], L: 2, Wd: 2, H: 2, nl: span, nw: span, nh: span, dir: "sym" });
  const R = D / 2;
  // b was built in plane coords around the origin; map onto the sphere in the real frame
  const yy = Y(pl);
  const v = b.v.map((p) => {
    const lx = V.dot(p, pl.x), ly = V.dot(p, yy), lz = V.dot(p, pl.n);
    // equal-angle cube to sphere mapping
    const q = V.norm([Math.tan((lx * Math.PI) / 4), Math.tan((ly * Math.PI) / 4), Math.tan((lz * Math.PI) / 4)]);
    return W(pl, c, q[0] * R, q[1] * R, q[2] * R);
  });
  const out = cage(v, b.f, { sym: symOf(pl, c, sym, 0, 4) });
  return fitToTargets(out, v.map((p) => p.slice()), 14);
}

/** Single faces from clicked points (Face command): polygon(s) of world points. */
export function faces(polys) {
  const v = [], f = [];
  for (const poly of polys) { f.push(poly.map((p) => { v.push(p.slice()); return v.length - 1; })); }
  return cage(v, f);
}

// ---------------------------------------------------------------- curves
/** Resample a polyline to n spans (keeps sharp corners when it can). closed: last point not repeated. */
export function resample(poly, n, closed = false, mode = "uniform") {
  const pts = poly.slice();
  if (closed && V.dist(pts[0], pts[pts.length - 1]) < 1e-9) pts.pop();
  const m = closed ? pts.length : pts.length - 1;
  if (m < 1) return pts;
  const seg = [];
  let total = 0;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    let w = V.dist(a, b);
    if (mode === "curvature" && pts.length > 2) {
      // weight segments by the turning at their ends (more spans where the curve bends)
      const p0 = pts[(i - 1 + pts.length) % pts.length], p3 = pts[(i + 2) % pts.length];
      const t1 = V.norm(V.sub(a, p0)), t2 = V.norm(V.sub(b, a)), t3 = V.norm(V.sub(p3, b));
      w *= 1 + 3 * (Math.acos(Math.max(-1, Math.min(1, V.dot(t1, t2)))) + Math.acos(Math.max(-1, Math.min(1, V.dot(t2, t3)))));
    }
    seg.push(w); total += w;
  }
  const out = [];
  const N = Math.max(1, n | 0);
  for (let k = 0; k < (closed ? N : N + 1); k++) {
    let s = (total * k) / N, i = 0;
    while (i < m - 1 && s > seg[i]) { s -= seg[i]; i++; }
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push(V.lerp(a, b, seg[i] > 0 ? Math.min(1, s / seg[i]) : 0));
  }
  return out;
}

/** Grid cage from rows of points (rows[k][i]); closedU wraps i, closedV wraps k. */
export function gridCage(rows, { closedU = false, closedV = false, fit = true } = {}) {
  const nk = rows.length, ni = rows[0].length;
  const v = [];
  for (const r of rows) for (const p of r) v.push(p.slice());
  const at = (k, i) => (k % nk) * ni + (i % ni);
  const f = [];
  for (let k = 0; k < (closedV ? nk : nk - 1); k++) for (let i = 0; i < (closedU ? ni : ni - 1); i++) f.push([at(k, i), at(k, i + 1), at(k + 1, i + 1), at(k + 1, i)]);
  // collapse coincident points (profile on a revolve axis -> poles)
  const map = v.map((_, i) => i);
  for (let i = 0; i < v.length; i++) for (let j = 0; j < i; j++) if (map[j] === j && V.dist(v[i], v[j]) < 1e-7) { map[i] = j; break; }
  let out = orient(cage(v, f.map((fc) => fc.map((x) => map[x]))));
  out = compact(out).cage;
  return fit ? fitToTargets(out, out.v.map((p) => p.slice()), 12) : out;
}

/** Extrude profile points along dir: front distance / faces, back distance / faces (two sides). */
export function extrudeCage(profile, closed, { dir, d1, n1, d2 = 0, n2 = 0, taper = 0, center = null }) {
  const rows = [];
  const c0 = center || V.avg(profile);
  const row = (z) => profile.map((p) => {
    // taper: offset radially in the profile plane by z * tan(taper)
    if (!taper) return V.add(p, V.mul(dir, z));
    const r = V.sub(p, c0);
    const radial = V.sub(r, V.mul(dir, V.dot(r, dir)));
    const l = V.len(radial) || 1;
    return V.add(V.add(p, V.mul(dir, z)), V.mul(radial, (z * Math.tan((taper * Math.PI) / 180)) / l));
  });
  for (let k = n2; k >= 1; k--) rows.push(row((-d2 * k) / n2));
  for (let k = 0; k <= n1; k++) rows.push(row((d1 * k) / Math.max(1, n1)));
  return gridCage(rows, { closedU: closed });
}

/** Revolve profile points about axis {o, d} by angle (deg), n faces around. */
export function revolveCage(profile, closed, { axis, angle = 360, n = 8 }) {
  const full = Math.abs(angle) >= 359.999;
  const k = V.norm(axis.d);
  const rows = [];
  const steps = Math.max(full ? 3 : 1, n | 0);
  for (let s = 0; s < (full ? steps : steps + 1); s++) {
    const a = ((angle * Math.PI) / 180) * (s / steps);
    const cs = Math.cos(a), sn = Math.sin(a);
    rows.push(profile.map((p) => { const r = V.sub(p, axis.o); return V.add(axis.o, V.add(V.add(V.mul(r, cs), V.mul(V.cross(k, r), sn)), V.mul(k, V.dot(k, r) * (1 - cs)))); }));
  }
  return gridCage(rows, { closedU: closed, closedV: full });
}

/** Rotation-minimising frames along a polyline: [{p, t, u, w}]. */
export function frames(path) {
  const out = [];
  let u = null;
  for (let i = 0; i < path.length; i++) {
    const t = V.norm(V.sub(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)]));
    if (!u) { const a = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; u = V.norm(V.cross(a, t)); }
    else { u = V.norm(V.sub(u, V.mul(t, V.dot(u, t)))); }
    out.push({ p: path[i], t, u, w: V.cross(t, u) });
  }
  return out;
}
/** Sweep profile (world points) along path points; orientation 'perpendicular' (follows the path) | 'parallel'. */
export function sweepCage(profile, closed, path, closedPath, { orientation = "perpendicular" } = {}) {
  const F = frames(path);
  const f0 = F[0];
  const local = profile.map((p) => { const d = V.sub(p, f0.p); return [V.dot(d, f0.t), V.dot(d, f0.u), V.dot(d, f0.w)]; });
  const rows = F.map((fr) => local.map(([a, b, c]) => (orientation === "parallel" ? V.add(fr.p, V.add(V.add(V.mul(f0.t, a), V.mul(f0.u, b)), V.mul(f0.w, c))) : V.add(fr.p, V.add(V.add(V.mul(fr.t, a), V.mul(fr.u, b)), V.mul(fr.w, c))))));
  if (closedPath) rows.pop();
  return gridCage(rows, { closedU: closed, closedV: closedPath });
}
/** Loft between profiles (each resampled to the same count), `n` faces between consecutive profiles. */
export function loftCage(profiles, closed, { n = 2 } = {}) {
  const rows = [];
  for (let s = 0; s < profiles.length - 1; s++) {
    const A = profiles[s], B = alignProfile(A, profiles[s + 1], closed);
    profiles[s + 1] = B;
    for (let k = 0; k < Math.max(1, n); k++) rows.push(A.map((p, i) => V.lerp(p, B[i], k / Math.max(1, n))));
  }
  rows.push(profiles[profiles.length - 1]);
  return gridCage(rows, { closedU: closed });
}
function alignProfile(A, B, closed) {
  const m = A.length;
  const cost = (bb, o) => { let s = 0; for (let i = 0; i < m; i++) s += V.dist(A[i], bb[(i + o) % m]); return s; };
  let best = { s: Infinity, b: B };
  for (const bb of [B, B.slice().reverse()]) {
    if (!closed) { const s = cost(bb, 0); if (s < best.s) best = { s, b: bb }; continue; }
    for (let o = 0; o < m; o++) { const s = cost(bb, o); if (s < best.s) best = { s, b: [...bb.slice(o), ...bb.slice(0, o)] }; }
  }
  return best.b;
}
/** Pipe: circular section of diameter D with `seg` faces around, swept along path; ends 'open' | 'square' (capped). */
export function pipeCage(path, closedPath, { D, seg = 8, ends = "open" }) {
  const F = frames(path);
  seg = Math.max(3, seg | 0);
  const rows = F.map((fr) => Array.from({ length: seg }, (_, i) => { const a = (2 * Math.PI * i) / seg; return V.add(fr.p, V.add(V.mul(fr.u, (D / 2) * Math.cos(a)), V.mul(fr.w, (D / 2) * Math.sin(a)))); }));
  if (closedPath) rows.pop();
  let out = gridCage(rows, { closedU: true, closedV: closedPath, fit: false });
  if (!closedPath && ends !== "open") {
    const v = out.v.map((p) => p.slice()), f = out.f.map((x) => x.slice());
    for (const [r, end] of [[0, F[0]], [rows.length - 1, F[F.length - 1]]]) {
      const ring = rows[r].map((p) => v.findIndex((q) => V.dist(p, q) < 1e-7));
      const C = v.length;
      v.push(ends === "spike" ? V.add(end.p, V.mul(end.t, (r === 0 ? -1 : 1) * D * 0.5)) : end.p.slice());
      for (let i = 0; i < seg; i++) f.push([ring[i], ring[(i + 1) % seg], C]);
    }
    out = orient(cage(v, f));
  }
  return fitToTargets(out, out.v.map((p) => p.slice()), 12);
}
