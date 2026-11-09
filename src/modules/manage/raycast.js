// Small triangle BVH over a body's display mesh (K.meshBody data) for local geometric analyses
// (Design Advice wall thickness / undercuts / knife edges, Generate Timeline checks).

export function buildBVH(md) {
  const V = md.vertices, T = md.triangles;
  const n = T.length / 3;
  const faceOf = new Int32Array(n).fill(-1);
  for (const g of md.faceGroups || []) for (let k = g.start / 3; k < (g.start + g.count) / 3; k++) faceOf[k] = g.face;
  const cx = new Float32Array(n), cy = new Float32Array(n), cz = new Float32Array(n);
  const mn = new Float32Array(n * 3), mx = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = T[i * 3] * 3, b = T[i * 3 + 1] * 3, c = T[i * 3 + 2] * 3;
    for (let k = 0; k < 3; k++) {
      const va = V[a + k], vb = V[b + k], vc = V[c + k];
      mn[i * 3 + k] = Math.min(va, vb, vc);
      mx[i * 3 + k] = Math.max(va, vb, vc);
    }
    cx[i] = (V[a] + V[b] + V[c]) / 3; cy[i] = (V[a + 1] + V[b + 1] + V[c + 1]) / 3; cz[i] = (V[a + 2] + V[b + 2] + V[c + 2]) / 3;
  }
  const idx = Array.from({ length: n }, (_, i) => i);
  const nodes = [];
  function build(lo, hi) {
    const node = { lo, hi, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], l: null, r: null };
    for (let j = lo; j < hi; j++) { const i = idx[j]; for (let k = 0; k < 3; k++) { if (mn[i * 3 + k] < node.min[k]) node.min[k] = mn[i * 3 + k]; if (mx[i * 3 + k] > node.max[k]) node.max[k] = mx[i * 3 + k]; } }
    nodes.push(node);
    if (hi - lo > 8) {
      const ext = [0, 1, 2].map((k) => node.max[k] - node.min[k]);
      const ax = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2;
      const C = ax === 0 ? cx : ax === 1 ? cy : cz;
      const part = idx.slice(lo, hi).sort((p, q) => C[p] - C[q]);
      for (let j = lo; j < hi; j++) idx[j] = part[j - lo];
      const mid = (lo + hi) >> 1;
      node.l = build(lo, mid);
      node.r = build(mid, hi);
    }
    return node;
  }
  const root = n ? build(0, n) : null;

  function boxHit(node, o, inv, tmax) {
    let t0 = 0, t1 = tmax;
    for (let k = 0; k < 3; k++) {
      let a = (node.min[k] - o[k]) * inv[k], b = (node.max[k] - o[k]) * inv[k];
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return false;
    }
    return true;
  }
  /** Nearest hit of the ray o + t d (tmin < t < tmax): {t, tri, face, n:[x,y,z] (geometric, unit)} or null. */
  function ray(o, d, tmin = 1e-4, tmax = Infinity) {
    if (!root) return null;
    const inv = [1 / (d[0] || 1e-30), 1 / (d[1] || 1e-30), 1 / (d[2] || 1e-30)];
    let best = null, bt = tmax;
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (!boxHit(node, o, inv, bt)) continue;
      if (node.l) { stack.push(node.l, node.r); continue; }
      for (let j = node.lo; j < node.hi; j++) {
        const i = idx[j];
        const a = T[i * 3] * 3, b = T[i * 3 + 1] * 3, c = T[i * 3 + 2] * 3;
        const e1x = V[b] - V[a], e1y = V[b + 1] - V[a + 1], e1z = V[b + 2] - V[a + 2];
        const e2x = V[c] - V[a], e2y = V[c + 1] - V[a + 1], e2z = V[c + 2] - V[a + 2];
        const hx = d[1] * e2z - d[2] * e2y, hy = d[2] * e2x - d[0] * e2z, hz = d[0] * e2y - d[1] * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (Math.abs(det) < 1e-14) continue;
        const f = 1 / det;
        const sx = o[0] - V[a], sy = o[1] - V[a + 1], sz = o[2] - V[a + 2];
        const u = f * (sx * hx + sy * hy + sz * hz);
        if (u < -1e-9 || u > 1 + 1e-9) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = f * (d[0] * qx + d[1] * qy + d[2] * qz);
        if (v < -1e-9 || u + v > 1 + 1e-9) continue;
        const t = f * (e2x * qx + e2y * qy + e2z * qz);
        if (t > tmin && t < bt) {
          bt = t;
          let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
          const l = Math.hypot(nx, ny, nz) || 1;
          nx /= l; ny /= l; nz /= l;
          best = { t, tri: i, face: faceOf[i], n: [nx, ny, nz] };
        }
      }
    }
    return best;
  }

  /** Sample points per B-rep face: [{face, p, n, w}] (triangle centroids, outward normals, area weights). */
  function samples(maxPerFace = 24) {
    const byFace = new Map();
    const NN = md.normals;
    for (let i = 0; i < n; i++) {
      const a = T[i * 3] * 3, b = T[i * 3 + 1] * 3, c = T[i * 3 + 2] * 3;
      const e1 = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]];
      const e2 = [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]];
      let nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const area = Math.hypot(nn[0], nn[1], nn[2]) / 2;
      if (area < 1e-12) continue;
      nn = nn.map((x) => x / (2 * area));
      // orient with the mesh's vertex normals (outward)
      if (NN && NN.length === V.length) {
        const vn = [NN[a] + NN[b] + NN[c], NN[a + 1] + NN[b + 1] + NN[c + 1], NN[a + 2] + NN[b + 2] + NN[c + 2]];
        if (vn[0] * nn[0] + vn[1] * nn[1] + vn[2] * nn[2] < 0) nn = nn.map((x) => -x);
      }
      const f = faceOf[i];
      if (!byFace.has(f)) byFace.set(f, []);
      byFace.get(f).push({ face: f, p: [cx[i], cy[i], cz[i]], n: nn, w: area });
    }
    const out = [];
    for (const list of byFace.values()) {
      list.sort((p, q) => q.w - p.w);
      const step = Math.max(1, Math.ceil(list.length / maxPerFace));
      let total = 0;
      for (const s of list) total += s.w;
      const picked = list.filter((_, k) => k % step === 0);
      const wsum = picked.reduce((s, x) => s + x.w, 0) || 1;
      for (const s of picked) out.push({ ...s, w: (s.w / wsum) * total });
    }
    return out;
  }
  return { ray, samples, triCount: n, faceOf };
}
