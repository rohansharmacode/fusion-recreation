// createx: clickable point markers drawn on the canvas while a dialog is open (Pattern on Path suppression
// toggles, Bounding Solid box points). Screen-space picking; drawn on top in viewport.groups.overlay.
export function markerSet(app) {
  const vp = app.viewport;
  let obj = null, list = [];
  const THREE = vp && vp.THREE;
  function clear() {
    if (obj) { vp.groups.overlay.remove(obj); obj.geometry.dispose(); obj.material.dispose(); obj = null; }
  }
  return {
    /** points: [{id, p:[x,y,z], on}] (on = filled blue, off = grey). */
    set(points) {
      list = points || [];
      clear();
      if (!THREE || !list.length) { if (vp) vp.requestRender(); return; }
      const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3);
      list.forEach((m, i) => {
        pos.set(m.p, 3 * i);
        col.set(m.on ? [0.02, 0.59, 0.84] : [0.62, 0.62, 0.62], 3 * i);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({ size: 10, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true });
      obj = new THREE.Points(geo, mat);
      obj.renderOrder = 20;
      obj.userData = { noPick: true };
      vp.groups.overlay.add(obj);
      vp.requestRender();
    },
    /** Id of the marker within 9 px of canvas point (x, y), or null. */
    hit(x, y) {
      let best = null, bd = 9;
      for (const m of list) {
        const s = vp.toScreen(m.p);
        const d = Math.hypot(s[0] - x, s[1] - y);
        if (d <= bd) { bd = d; best = m.id; }
      }
      return best;
    },
    screen(id) { const m = list.find((q) => q.id === id); if (!m) return null; const s = vp.toScreen(m.p); return [s[0], s[1]]; },
    dispose: clear,
  };
}
