// Cosmetic thread display: Fusion draws a cosmetic thread as a thread texture on the cylindrical
// face; here every evaluated cosmetic Thread feature (result.threads) is drawn as fine helical lines
// just off its face, in a depth-tested group of the viewport scene (committed model and previews).
import * as THREE from "three";

export function installCosmeticThreads(app) {
  let group = null;
  const mat = new THREE.LineBasicMaterial({ color: 0x5a6068, transparent: true, opacity: 0.75 });
  const ensure = () => {
    const vp = app.viewport;
    if (!vp || !vp.scene) return null;
    if (!group) {
      group = new THREE.Group();
      group.name = "cosmetic-threads";
      group.userData.noPick = true;
      vp.scene.add(group);
    }
    return group;
  };
  const clear = () => {
    if (!group) return;
    for (const c of [...group.children]) { group.remove(c); c.geometry.dispose(); }
  };
  const helix = (t) => {
    const a = norm(t.a);
    let x = cross(a, [0, 0, 1]);
    if (len(x) < 1e-6) x = cross(a, [1, 0, 0]);
    x = norm(cross(x, a));
    const y = cross(a, x);
    // just outside an external thread's face, just inside a hole's face
    const r = t.r + (t.internal ? -1 : 1) * Math.max(0.01, t.r * 0.004);
    const turns = (t.z1 - t.z0) / t.pitch;
    const n = Math.max(8, Math.ceil(turns * 40));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * turns * 2 * Math.PI * (t.left ? -1 : 1);
      const z = t.z0 + (i / n) * (t.z1 - t.z0);
      const p = [0, 1, 2].map((k) => t.o[k] + a[k] * z + r * (x[k] * Math.cos(u) + y[k] * Math.sin(u)));
      pts.push(p[0], p[1], p[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const line = new THREE.Line(g, mat);
    line.userData.noPick = true;
    line.renderOrder = 5;
    return line;
  };
  const update = (result) => {
    const g = ensure();
    if (!g) return;
    clear();
    const r = result || app.result;
    if (r && r.results) {
      const meta = (id) => app.doc.bodies[id] || (app._previewMeta && app._previewMeta[id]) || {};
      for (const res of Object.values(r.results)) {
        if (!res || !res.ok || !Array.isArray(res.threads) || res.modeled) continue;
        for (const t of res.threads) {
          if (t.modeled || !r.state.bodies.has(t.body) || meta(t.body).visible === false) continue;
          g.add(helix(t));
        }
      }
    }
    try { app.viewport.requestRender(); } catch { /* ignore */ }
  };
  app.on("model", (d) => update(d && d.result));
  app.on("doc", () => update());
  return { update };
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
