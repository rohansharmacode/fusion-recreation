// Modal navigation tools started from the navigation bar: Free Orbit, Constrained Orbit, Pan,
// Zoom, Zoom Window and Look At. Each pushes a modal handler on app.input until Esc,
// right-click, the same button again, or another command.
const SVGNS = "http://www.w3.org/2000/svg";

export class NavTools {
  constructor(vp) {
    this.vp = vp;
    this.app = vp.app;
    this.active = null; // {kind, handler, pop}
    this.overlay = document.createElementNS(SVGNS, "svg");
    this.overlay.setAttribute("class", "vp-navtool-overlay");
    vp.host.appendChild(this.overlay);
    this.app.on("command-start", () => this.stop());
    this.app.on("mode", () => this.stop());
  }

  is(kind) { return !!this.active && this.active.kind === kind; }

  toggle(kind) {
    if (this.is(kind)) { this.stop(); return; }
    this.start(kind);
  }

  stop() {
    if (!this.active) return;
    const a = this.active;
    this.active = null;
    a.pop();
    this.overlay.innerHTML = "";
    this.overlay.style.display = "none";
    this.vp.host.classList.remove(`vp-tool-${a.kind}`);
    if (a.kind === "lookAt") this.app.selection.setHover(null);
    this.vp.updateNavbarState();
  }

  start(kind) {
    this.stop();
    const vp = this.vp;
    const st = { down: null };
    const self = this;
    const cursors = { orbitFree: "grab", orbitConstrained: "grab", pan: "grab", zoom: "ns-resize", zoomWindow: "crosshair", lookAt: "crosshair" };
    const handler = {
      name: `nav:${kind}`,
      modal: true,
      cursor: cursors[kind] || "default",
      onPointerDown(ev, ctx) {
        if (ctx.button !== 0) return true;
        st.down = { x: ctx.x, y: ctx.y, lx: ctx.x, ly: ctx.y, at: vp.anchorAt(ctx.x, ctx.y) };
        if (kind === "orbitFree") {
          const { w, h } = vp.size();
          const r = Math.min(w, h) * 0.38;
          const cx = w / 2, cy = h / 2;
          const near = (x, y) => Math.hypot(ctx.x - x, ctx.y - y) < 14;
          // the ring's handles constrain the rotation: left/right = about the screen vertical, top/bottom = horizontal
          if (near(cx - r, cy) || near(cx + r, cy)) st.down.constraint = "yaw";
          else if (near(cx, cy - r) || near(cx, cy + r)) st.down.constraint = "pitch";
          else st.down.outside = Math.hypot(ctx.x - cx, ctx.y - cy) > r;
        }
        if (kind === "lookAt") {
          const hit = vp.pick(ctx.x, ctx.y, { kinds: ["face", "originPlane", "cplane", "profile"] });
          if (hit) { vp.lookAtRef(hit.ref); self.stop(); }
          else self.app.toast("Select a face or plane to look at", "info", 1600);
          st.down = null;
        }
        return true;
      },
      onPointerMove(ev, ctx) {
        const d = st.down;
        if (kind === "lookAt") {
          const hit = vp.pick(ctx.x, ctx.y, { kinds: ["face", "originPlane", "cplane", "profile"] });
          self.app.selection.setHover(hit ? hit.ref : null);
          return true;
        }
        if (!d) return true;
        const dx = ctx.x - d.lx, dy = ctx.y - d.ly;
        d.lx = ctx.x; d.ly = ctx.y;
        if (kind === "orbitConstrained") vp.orbitBy(dx, dy);
        else if (kind === "orbitFree") {
          if (d.outside) {
            const { w, h } = vp.size();
            const a0 = Math.atan2(ctx.y - dy - h / 2, ctx.x - dx - w / 2);
            const a1 = Math.atan2(ctx.y - h / 2, ctx.x - w / 2);
            let da = a1 - a0;
            if (da > Math.PI) da -= 2 * Math.PI;
            if (da < -Math.PI) da += 2 * Math.PI;
            vp.rig.roll(-da);
          } else if (d.constraint === "yaw") vp.rig.orbitFree(dx, 0);
          else if (d.constraint === "pitch") vp.rig.orbitFree(0, dy);
          else vp.rig.orbitFree(dx, dy);
          vp.requestRender();
        } else if (kind === "pan") vp.panBy(dx, dy, d.at);
        else if (kind === "zoom") vp.zoomAbout(d.at, Math.exp(dy * 0.006));
        else if (kind === "zoomWindow") self._drawRect(d.x, d.y, ctx.x, ctx.y);
        return true;
      },
      onPointerUp(ev, ctx) {
        const d = st.down;
        st.down = null;
        if (!d) return true;
        if (kind === "zoomWindow") {
          self.overlay.innerHTML = "";
          if (Math.abs(ctx.x - d.x) > 4 && Math.abs(ctx.y - d.y) > 4) {
            vp.zoomWindow(d.x, d.y, ctx.x, ctx.y);
            self.stop();
          }
        }
        if (kind === "orbitFree") self._drawOrbitRing();
        return true;
      },
      onDoubleClick() { return true; },
      onContextMenu() { self.stop(); return true; },
      onCancel() { self.stop(); return true; },
    };
    const pop = this.app.input.push(handler);
    this.active = { kind, handler, pop };
    this.vp.host.classList.add(`vp-tool-${kind}`);
    if (kind === "orbitFree") this._drawOrbitRing();
    if (kind === "zoomWindow") this.app.toast("Drag a window to zoom to", "info", 1600);
    this.vp.updateNavbarState();
  }

  _drawOrbitRing() {
    const { w, h } = this.vp.size();
    const r = Math.min(w, h) * 0.38;
    const cx = w / 2, cy = h / 2;
    const hs = 6;
    const handles = [[cx, cy - r], [cx, cy + r], [cx - r, cy], [cx + r, cy]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${hs}" class="vp-orbit-handle"/>`).join("");
    this.overlay.style.display = "block";
    this.overlay.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" class="vp-orbit-ring"/>${handles}`;
  }

  _drawRect(x0, y0, x1, y1) {
    this.overlay.style.display = "block";
    this.overlay.innerHTML = `<rect x="${Math.min(x0, x1)}" y="${Math.min(y0, y1)}" width="${Math.abs(x1 - x0)}" height="${Math.abs(y1 - y0)}" class="vp-window"/>`;
  }

  /** Called on resize so the orbit ring follows the canvas. */
  relayout() { if (this.is("orbitFree")) this._drawOrbitRing(); }
}
