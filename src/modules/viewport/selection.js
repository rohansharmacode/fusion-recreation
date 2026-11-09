// Base selection handler (bottom of app.input): click select, Ctrl/Shift toggle, click on empty
// space clears, hover pre-highlight, and region selection by drag: Window (left-to-right =
// fully inside, right-to-left = crossing), Freeform (clockwise = inside, counter-clockwise =
// crossing) and Paint (brush path picks what it passes over).
const DRAG_PX = 4;

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function segsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const o1 = o(ax, ay, bx, by, cx, cy), o2 = o(ax, ay, bx, by, dx, dy);
  const o3 = o(cx, cy, dx, dy, ax, ay), o4 = o(cx, cy, dx, dy, bx, by);
  return o1 !== o2 && o3 !== o4;
}

/** Region helper handed to window-select providers. */
export function makeRegion(poly, crossing) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const inside = (x, y) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3] && pointInPoly(x, y, poly);
  const segmentTouches = (ax, ay, bx, by) => {
    if (inside(ax, ay) || inside(bx, by)) return true;
    if (Math.max(ax, bx) < bb[0] || Math.min(ax, bx) > bb[2] || Math.max(ay, by) < bb[1] || Math.min(ay, by) > bb[3]) return false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (segsIntersect(ax, ay, bx, by, poly[j][0], poly[j][1], poly[i][0], poly[i][1])) return true;
    }
    return false;
  };
  return { kind: crossing ? "crossing" : "window", crossing, polygon: poly, rect: bb, inside, segmentTouches };
}

export class SelectionTool {
  constructor(vp) {
    this.vp = vp;
    this.app = vp.app;
    this.mode = "window"; // 'window' | 'freeform' | 'paint'
    this.priority = "face"; // 'face' | 'body' | 'edge'
    this.windowProviders = new Set();
    this.drag = null;
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("class", "vp-selregion");
    vp.host.appendChild(this.svg);
    this.handler = {
      name: "select",
      onPointerMove: (ev, ctx) => this.onMove(ev, ctx),
      onPointerDown: (ev, ctx) => this.onDown(ev, ctx),
      onPointerUp: (ev, ctx) => this.onUp(ev, ctx),
      onCancel: () => this.cancelDrag(),
      onDoubleClick: (ev, ctx) => this.onDouble(ev, ctx),
    };
    this.app.input.push(this.handler);
  }

  addWindowProvider(fn) {
    this.windowProviders.add(fn);
    return () => this.windowProviders.delete(fn);
  }

  /** Hit for the base handler, honouring the selection priority. */
  hitFor(ctx) {
    if (this.priority === "face" || !this.app.selection) return ctx.hit;
    const accepts = (r) => this.app.selection.accepts(r);
    const all = this.vp.pickAll(ctx.x, ctx.y, { filter: accepts });
    if (this.priority === "body") {
      const h = all.find((x) => !["face", "edge", "vertex"].includes(x.ref.kind));
      return h || null;
    }
    if (this.priority === "edge") {
      const h = all.find((x) => !["face", "body"].includes(x.ref.kind));
      return h || null;
    }
    return ctx.hit;
  }

  onMove(ev, ctx) {
    const d = this.drag;
    if (d) {
      const moved = Math.hypot(ctx.x - d.x0, ctx.y - d.y0);
      if (!d.moved && moved > DRAG_PX) {
        d.moved = true;
        this.app.selection.setHover(null);
      }
      if (d.moved) {
        d.pts.push([ctx.x, ctx.y]);
        if (this.mode === "paint") this._paintAt(ctx);
        else this._livePreview(ctx);
        this._draw();
      }
      return true;
    }
    if (ev.buttons & 1) return true;
    const h = this.hitFor(ctx);
    this.app.selection.setHover(h ? h.ref : null);
    return true;
  }

  onDown(ev, ctx) {
    if (ctx.button !== 0) return false;
    this.drag = { x0: ctx.x, y0: ctx.y, pts: [[ctx.x, ctx.y]], hit: this.hitFor(ctx), add: ctx.shift || ctx.ctrl, moved: false, painted: new Map() };
    return true;
  }

  onUp(ev, ctx) {
    const d = this.drag;
    this.drag = null;
    this._clearDraw();
    this.vp.highlighter.setPreview([]);
    if (!d) return false;
    const sel = this.app.selection;
    if (d.moved) {
      if (this.mode === "paint") {
        const refs = [...d.painted.values()];
        if (refs.length) d.add ? this._addAll(refs) : sel.set(refs);
        else if (!d.add) sel.clear();
        return true;
      }
      let poly, crossing;
      if (this.mode === "freeform") {
        poly = d.pts;
        // signed area in screen space (y down): > 0 => clockwise on screen
        let a = 0;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
        crossing = a > 0; // counter-clockwise on screen => crossing
      } else {
        const x0 = d.x0, y0 = d.y0, x1 = ctx.x, y1 = ctx.y;
        poly = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        crossing = x1 < x0;
      }
      const refs = this.regionSelect(makeRegion(poly, crossing));
      if (d.add) this._addAll(refs);
      else sel.set(refs);
      return true;
    }
    const h = d.hit;
    if (!h) { if (!d.add) sel.clear(); return true; }
    if (d.add) sel.toggle(h.ref);
    else sel.set([h.ref]);
    return true;
  }

  /** Double-click an edge: select its tangent chain (Fusion's edge-loop shortcut). */
  onDouble(ev, ctx) {
    if (ctx.button !== 0) return false;
    const h = this.hitFor(ctx);
    if (!h || h.ref.kind !== "edge") return false;
    const refs = this.edgeChain(h.ref);
    if (!refs.length) return false;
    if (ctx.shift || ctx.ctrl) this._addAll(refs);
    else this.app.selection.set(refs);
    return true;
  }

  edgeChain(ref) {
    const app = this.app;
    const b = app.body(ref.body);
    if (!b) return [];
    try {
      const edges = b.shape.edges;
      const e0 = edges[ref.index];
      if (!e0) return [];
      const chain = app.K.tangentChain(b.shape, [e0]);
      const idx = new Map(edges.map((e, i) => [e.hashCode, i]));
      const o = this.vp.bodies.objects.get(ref.body);
      const out = [];
      for (const e of chain) {
        const i = idx.get(e.hashCode);
        if (i == null) continue;
        let p = null;
        if (o) { const g = o.entry.edges.find((x) => x.index === i); if (g && g.seg.length >= 6) { const k = Math.floor(g.seg.length / 6) * 3; p = [g.seg[k], g.seg[k + 1], g.seg[k + 2]]; } }
        if (!p) { try { p = app.K.edgeMid(e); } catch { p = ref.p; } }
        const r = { kind: "edge", body: ref.body, index: i, p };
        if (app.selection.accepts(r)) out.push(r);
      }
      return out;
    } catch (e) {
      console.error("[viewport] edge chain failed", e);
      return [ref];
    }
  }

  /** Pre-highlight what the region would select (throttled). */
  _livePreview(ctx) {
    const d = this.drag;
    const now = performance.now();
    if (d.lastPreview && now - d.lastPreview < 60) return;
    d.lastPreview = now;
    let poly, crossing;
    if (this.mode === "freeform") {
      if (d.pts.length < 3) return;
      poly = d.pts;
      let a = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
      crossing = a > 0;
    } else {
      poly = [[d.x0, d.y0], [ctx.x, d.y0], [ctx.x, ctx.y], [d.x0, ctx.y]];
      crossing = ctx.x < d.x0;
    }
    try { this.vp.highlighter.setPreview(this.regionSelect(makeRegion(poly, crossing))); } catch (e) { console.error(e); }
  }

  cancelDrag() {
    if (!this.drag) return false;
    this.drag = null;
    this._clearDraw();
    this.vp.highlighter.setPreview([]);
    return true;
  }

  _addAll(refs) {
    const sel = this.app.selection;
    const items = [...sel.items];
    for (const r of refs) if (!sel.has(r)) items.push(r);
    sel.set(items);
  }

  _paintAt(ctx) {
    const h = this.hitFor(ctx);
    if (!h) return;
    const k = this.vp.refKey(h.ref);
    if (!this.drag.painted.has(k)) {
      this.drag.painted.set(k, h.ref);
      this.app.selection.set(this.drag.add ? [...this.app.selection.items.filter((r) => !this.drag.painted.has(this.vp.refKey(r))), ...this.drag.painted.values()] : [...this.drag.painted.values()]);
    }
  }

  /** Bodies (model mode) + provider refs inside / crossing the region. */
  regionSelect(region) {
    const app = this.app;
    const out = [];
    const accepts = (r) => app.selection.accepts(r);
    if (app.mode !== "sketch") {
      for (const b of this.vp.bodies.visible()) {
        const ref = { kind: "body", body: b.id };
        if (!accepts(ref)) continue;
        if (this._bodyInRegion(b, region)) out.push(ref);
      }
    }
    for (const p of this.windowProviders) {
      try {
        for (const r of p(region) || []) if (r && accepts(r)) out.push(r);
      } catch (e) { console.error("[viewport] window provider failed", e); }
    }
    return out;
  }

  _bodyInRegion(b, region) {
    const P = this.vp.picker._proj(b.entry);
    const n = P.length / 3;
    if (!n) return false;
    if (!region.crossing) {
      for (let i = 0; i < n; i++) if (!P[i * 3 + 2] || !region.inside(P[i * 3], P[i * 3 + 1])) return false;
      // also check a sample of mesh vertices (bodies without edges, e.g. spheres)
      const V = b.entry.md.vertices;
      const step = Math.max(1, Math.floor(V.length / 3 / 400));
      const tmp = [0, 0, 0, 1];
      for (let i = 0; i < V.length / 3; i += step) {
        this.vp.picker.project([V[i * 3], V[i * 3 + 1], V[i * 3 + 2]], tmp);
        if (!region.inside(tmp[0], tmp[1])) return false;
      }
      return true;
    }
    for (const e of b.entry.edges) {
      if (e.seam) continue;
      for (let i = e.start; i < e.start + e.count; i += 2) {
        const ia = i * 3, ib = (i + 1) * 3;
        if (!P[ia + 2] || !P[ib + 2]) continue;
        if (region.segmentTouches(P[ia], P[ia + 1], P[ib], P[ib + 1])) return true;
      }
    }
    // region entirely inside the body's silhouette
    const [x0, y0, x1, y1] = region.rect;
    const h = this.vp.pickAll((x0 + x1) / 2, (y0 + y1) / 2, { kinds: ["body"] });
    if (h.some((x) => x.ref.body === b.id)) return true;
    // sample mesh vertices (spheres etc.)
    const V = b.entry.md.vertices;
    const step = Math.max(1, Math.floor(V.length / 3 / 400));
    const tmp = [0, 0, 0, 1];
    for (let i = 0; i < V.length / 3; i += step) {
      this.vp.picker.project([V[i * 3], V[i * 3 + 1], V[i * 3 + 2]], tmp);
      if (tmp[3] && region.inside(tmp[0], tmp[1])) return true;
    }
    return false;
  }

  _draw() {
    const d = this.drag;
    if (!d) return;
    const svg = this.svg;
    svg.style.display = "block";
    if (this.mode === "paint") {
      const pts = d.pts.map((p) => p.join(",")).join(" ");
      svg.innerHTML = `<polyline points="${pts}" class="vp-paint" />`;
      return;
    }
    if (this.mode === "freeform") {
      const pts = d.pts.map((p) => p.join(",")).join(" ");
      svg.innerHTML = `<polygon points="${pts}" class="vp-lasso" />`;
      return;
    }
    const last = d.pts[d.pts.length - 1];
    const x = Math.min(d.x0, last[0]), y = Math.min(d.y0, last[1]);
    const w = Math.abs(last[0] - d.x0), h = Math.abs(last[1] - d.y0);
    const crossing = last[0] < d.x0;
    svg.innerHTML = `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${crossing ? "vp-crossing" : "vp-window"}" />`;
  }

  _clearDraw() {
    this.svg.innerHTML = "";
    this.svg.style.display = "none";
  }
}
