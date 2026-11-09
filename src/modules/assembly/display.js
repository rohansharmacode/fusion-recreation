// assembly: canvas display. Joint glyphs (a ring with a centre dot at the joint origin, drawn at a constant screen
// size), joint origin triads, the hovered snap point while a joint dialog picks, and the DOF Analysis labels.
// Joint glyphs and joint origins can be picked: {kind:'feature', id}.
import * as X from "./math.js";
import * as S from "./solver.js";
import * as F from "./features.js";

const V = X.V;
const PX = 13; // glyph radius in CSS px
const GREY = 0x3c4650, BLUE = 0x0696d7, HOVER = 0x6fb7f0, SNAP = 0x0696d7;
const AXC = [0xd4402b, 0x2e9e3f, 0x2f6fd6];

/** World frame of a joint glyph: the joint origin on component 2 (the side that stays). */
export function jointWorld(st, J) {
  const Tb = F.occT(st, J.b);
  const off = J.off ? S.offset({ off: { ...J.off, flip: true } }) : X.I;
  return X.mulAll(Tb, J.FB, off);
}

export function installDisplay(app, api) {
  const vp = app.viewport;
  if (!vp || !vp.THREE || !vp.groups) return null;
  const THREE = vp.THREE;
  const root = new THREE.Group();
  root.name = "assembly-glyphs";
  root.userData.noPick = true;
  vp.groups.overlay.add(root);
  let items = []; // {id, o, F, group, mats, kind}
  let snap = null; // {group, o}
  const labels = [];
  const noPick = (o) => { o.userData = { noPick: true }; o.renderOrder = 7; return o; };
  const dispose = (g) => g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  const ring = (mat, r = 1, n = 28) => { const pts = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); } return noPick(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat)); };
  const line = (a, b, mat) => noPick(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]), mat));
  const dot = (mat) => noPick(new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0)]), mat));
  const lm = (c) => new THREE.LineBasicMaterial({ color: c, depthTest: false, transparent: true });
  const pm = (c, s = 6) => new THREE.PointsMaterial({ color: c, size: s, sizeAttenuation: false, depthTest: false, transparent: true });
  const place = (g, W) => { const m = new THREE.Matrix4(); m.set(W[0], W[1], W[2], W[3], W[4], W[5], W[6], W[7], W[8], W[9], W[10], W[11], 0, 0, 0, 1); g.matrixAutoUpdate = false; g.userData.W = W; g.matrix.copy(m); };
  const scaleOf = (o) => Math.max(1e-6, (vp.pixelSize ? vp.pixelSize(o) : 0.2) * PX);
  const rescale = () => {
    for (const it of [...items, ...(snap ? [snap] : [])]) {
      const s = scaleOf(it.o), W = it.group.userData.W;
      const m = new THREE.Matrix4();
      m.set(W[0] * s, W[1] * s, W[2] * s, W[3], W[4] * s, W[5] * s, W[6] * s, W[7], W[8] * s, W[9] * s, W[10] * s, W[11], 0, 0, 0, 1);
      it.group.matrix.copy(m);
      it.r = s;
    }
  };
  const shown = () => api.glyphsVisible();
  const selected = (id) => app.selection.items.some((r) => r.kind === "feature" && r.id === id);
  const hovered = (id) => { const h = app.selection.hover; return !!h && h.kind === "feature" && h.id === id; };
  function restyle() {
    for (const it of items) {
      const c = selected(it.id) ? BLUE : hovered(it.id) ? HOVER : null;
      it.mats.forEach((m, i) => m.color.setHex(c != null ? c : it.base[i]));
    }
    vp.requestRender();
  }
  function rebuild() {
    for (const it of items) { root.remove(it.group); dispose(it.group); }
    items = [];
    const st = app.result && app.result.state;
    if (st && shown()) {
      for (const J of (st.joints || new Map()).values()) {
        if (!st.occ.has(J.a) && J.a !== F.ROOT) continue;
        const f = app.feature(J.id);
        if (!f || f.visible === false) continue;
        const W = jointWorld(st, J), g = new THREE.Group();
        const mats = [lm(GREY), pm(GREY, 5), lm(GREY)];
        g.add(ring(mats[0]), dot(mats[1]));
        // a short stem along the joint axis tells joints apart from joint origins
        g.add(line([0, 0, 0], [0, 0, 1.6], mats[2]));
        place(g, W);
        root.add(g);
        items.push({ id: J.id, o: X.origin(W), group: g, mats, base: [GREY, GREY, GREY], kind: "joint" });
      }
      for (const jo of (st.jorigins || new Map()).values()) {
        const f = app.feature(jo.id);
        if (!f || f.visible === false) continue;
        const W = X.mul(F.occT(st, jo.occ), jo.F), g = new THREE.Group();
        const mats = [lm(AXC[0]), lm(AXC[1]), lm(AXC[2]), pm(GREY, 6)];
        g.add(line([0, 0, 0], [1.4, 0, 0], mats[0]), line([0, 0, 0], [0, 1.4, 0], mats[1]), line([0, 0, 0], [0, 0, 1.4], mats[2]), dot(mats[3]));
        place(g, W);
        root.add(g);
        items.push({ id: jo.id, o: X.origin(W), group: g, mats, base: [...AXC, GREY], kind: "origin" });
      }
    }
    rescale();
    restyle();
    renderLabels();
  }
  /** Snap point under the cursor while a joint dialog picks (frame or null). */
  function showSnap(W) {
    if (snap) { root.remove(snap.group); dispose(snap.group); snap = null; }
    if (W) {
      const g = new THREE.Group(), m = lm(SNAP), p = pm(SNAP, 8);
      g.add(ring(m, 0.55), dot(p), line([0, 0, 0], [0, 0, 1.2], lm(SNAP)));
      place(g, W);
      root.add(g);
      snap = { group: g, o: X.origin(W) };
      rescale();
    }
    vp.requestRender();
  }

  // ---- DOF Analysis labels (HTML over the canvas)
  function renderLabels() {
    for (const l of labels.splice(0)) l.el.remove();
    const host = vp.labelLayer;
    if (!host || !api.dofOn()) return;
    for (const row of api.dofRows()) {
      const el = document.createElement("div");
      el.className = "asm-dof-label";
      el.dataset.occ = row.occ;
      el.innerHTML = `<b>${row.dof}</b> ${row.dof === 1 ? "DOF" : "DOFs"}${row.text ? `<span>${row.text}</span>` : ""}`;
      el.title = row.label;
      host.appendChild(el);
      labels.push({ el, p: row.p });
    }
    placeLabels();
  }
  function placeLabels() {
    for (const l of labels) {
      const s = vp.toScreen(l.p);
      l.el.style.transform = `translate(${Math.round(s[0])}px, ${Math.round(s[1])}px) translate(-50%, -50%)`;
      l.el.style.display = s[2] > 1 ? "none" : "";
    }
  }

  app.on("model", (e) => { if (e && e.preview) return; try { rebuild(); } catch (err) { console.warn("[assembly] glyphs", err); } });
  app.on("doc", () => { try { rebuild(); } catch { /* ignore */ } });
  app.on("selection", restyle);
  app.on("hover", restyle);
  app.on("camera", () => { if (items.length || snap) rescale(); if (labels.length) placeLabels(); });
  if (app.result) rebuild();

  vp.addPickProvider((x, y, ray) => {
    const hits = [];
    if (!items.length) return hits;
    for (const it of items) {
      const s = vp.toScreen(it.o), d = Math.hypot(s[0] - x, s[1] - y);
      if (d <= PX + 3) hits.push({ ref: { kind: "feature", id: it.id }, point: it.o.slice(), depth: V.dot(V.sub(it.o, ray.o), ray.d), screenDist: Math.max(0, d - 4), type: "point" });
    }
    return hits;
  });
  return { rebuild, restyle, showSnap, renderLabels, items: () => items.map((i) => ({ id: i.id, kind: i.kind, o: i.o })) };
}
