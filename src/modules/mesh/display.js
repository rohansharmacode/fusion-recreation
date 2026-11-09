// Mesh body display extras: Display Mesh Face Groups (FacegroupsToggleCmd, Shift+F: every face group in its own
// colour over the body, like Fusion) and the quad edges of a Convert To Quad Mesh result. Both are objects of the
// mesh body kind's render hook, so they live in the body's viewport group and are rebuilt with it.
import { quadEdges } from "./algo.js";

export const DISPLAY = { groups: false };
const TAG = "mshGroups";

function colorOf(g) {
  // golden-angle hues, soft saturation like Fusion's face group display
  const h = ((g * 137.508) % 360) / 360, s = 0.55, l = 0.6;
  const f = (n) => { const k = (n + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}
function groupsObject(THREE, mesh) {
  const P = mesh.positions, T = mesh.indices;
  if (!T) return null;
  const m = T.length / 3;
  const pos = new Float32Array(m * 9), col = new Float32Array(m * 9);
  for (let t = 0; t < m; t++) {
    const c = colorOf(mesh.groups ? mesh.groups[t] : 0);
    for (let k = 0; k < 3; k++) {
      const v = T[3 * t + k];
      pos[9 * t + 3 * k] = P[3 * v]; pos[9 * t + 3 * k + 1] = P[3 * v + 1]; pos[9 * t + 3 * k + 2] = P[3 * v + 2];
      col[9 * t + 3 * k] = c[0]; col[9 * t + 3 * k + 1] = c[1]; col[9 * t + 3 * k + 2] = c[2];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const o = new THREE.Mesh(geo, mat);
  o.name = TAG;
  o.userData = { noPick: true };
  o.renderOrder = 0.5;
  return o;
}
function quadObject(THREE, mesh) {
  const pairs = quadEdges(mesh);
  if (!pairs.length) return null;
  const P = mesh.positions;
  const lines = new Float32Array(pairs.length * 3);
  for (let i = 0; i < pairs.length; i++) { const v = pairs[i]; lines[3 * i] = P[3 * v]; lines[3 * i + 1] = P[3 * v + 1]; lines[3 * i + 2] = P[3 * v + 2]; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(lines, 3));
  const o = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x3a4652, transparent: true, opacity: 0.55 }));
  o.userData = { noPick: true };
  o.renderOrder = 1;
  return o;
}

/** Render hook of the 'mesh' body kind. */
export function meshRender(entry, app) {
  const THREE = app.viewport && app.viewport.THREE;
  if (!THREE || !entry || !entry.mesh) return null;
  const g = new THREE.Group();
  g.userData = { mshExtra: true, mesh: entry.mesh };
  if (entry.mesh.quadPair) { const q = quadObject(THREE, entry.mesh); if (q) g.add(q); }
  if (DISPLAY.groups) { const o = groupsObject(THREE, entry.mesh); if (o) g.add(o); }
  return g;
}
/** Show / hide the face group colours on every mesh body already in the scene. */
export function setGroupsDisplay(app, on) {
  DISPLAY.groups = !!on;
  const vp = app.viewport;
  if (!vp || !vp.groups) return;
  const THREE = vp.THREE;
  vp.groups.bodies.traverse((o) => {
    if (!o.userData || !o.userData.mshExtra) return;
    const cur = o.children.find((c) => c.name === TAG);
    if (on && !cur) { const n = groupsObject(THREE, o.userData.mesh); if (n) o.add(n); }
    if (!on && cur) { o.remove(cur); cur.geometry.dispose(); cur.material.dispose(); }
  });
  vp.requestRender();
}
